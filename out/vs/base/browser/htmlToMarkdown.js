import { appendEscapedMarkdownInlineCode, isPortableMarkdownTarget } from "../common/htmlContent.js";
import { createTrustedTypesPolicy } from "./trustedTypes.js";
const maxInputLength = 2e5;
const ttPolicy = createTrustedTypesPolicy("htmlToMarkdown", { createHTML: (value) => value });
function convertHtmlToMarkdown(html) {
  if (html.length > maxInputLength) {
    return html.replace(/<[^>]+>/g, "");
  }
  const trustedHtml = ttPolicy?.createHTML(html) ?? html;
  const doc = new DOMParser().parseFromString(trustedHtml, "text/html");
  let result = convertChildren(doc.body);
  result = result.replace(/\u00A0/g, " ");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
function convertNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const el = node;
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case "h1":
      return `
# ${convertChildren(el).trim()}
`;
    case "h2":
      return `
## ${convertChildren(el).trim()}
`;
    case "h3":
      return `
### ${convertChildren(el).trim()}
`;
    case "h4":
      return `
#### ${convertChildren(el).trim()}
`;
    case "h5":
      return `
##### ${convertChildren(el).trim()}
`;
    case "h6":
      return `
###### ${convertChildren(el).trim()}
`;
    case "pre": {
      const codeEl = el.querySelector("code");
      const text = (codeEl ?? el).textContent ?? "";
      return `
\`\`\`
${text.replace(/^\n+|\n+$/g, "")}
\`\`\`
`;
    }
    case "code":
      return appendEscapedMarkdownInlineCode(el.textContent ?? "");
    case "blockquote": {
      const inner = convertChildren(el).trim();
      const lines = inner.split("\n").map((l) => `> ${l.trim()}`);
      return `
${lines.join("\n")}
`;
    }
    case "ol": {
      let index = 0;
      let result = "\n";
      for (const child of el.children) {
        if (child.tagName.toLowerCase() === "li") {
          index++;
          result += `${index}. ${convertChildren(child).trim()}
`;
        }
      }
      return result;
    }
    case "ul": {
      let result = "\n";
      for (const child of el.children) {
        if (child.tagName.toLowerCase() === "li") {
          result += `- ${convertChildren(child).trim()}
`;
        }
      }
      return result;
    }
    case "li":
      return `- ${convertChildren(el).trim()}
`;
    case "p":
      return `${convertChildren(el)}

`;
    case "div":
      return `${convertChildren(el)}
`;
    case "br":
      return "\n";
    case "hr":
      return "\n---\n";
    case "a": {
      return sanitizeLink(linkTargetOf(el), convertChildren(el).trim(), (el.textContent ?? "").trim());
    }
    case "img": {
      const src = el.getAttribute("src") ?? "";
      const alt = el.getAttribute("alt") ?? "";
      if (!isPortableMarkdownTarget(src)) {
        return alt ? appendEscapedMarkdownInlineCode(alt) : "";
      }
      return `![${alt}](${src})`;
    }
    case "strong":
    case "b":
      return `**${convertChildren(el)}**`;
    case "em":
    case "i":
      return `*${convertChildren(el)}*`;
    case "del":
    case "s":
    case "strike":
      return `~~${convertChildren(el)}~~`;
    default:
      return convertChildren(el);
  }
}
function convertChildren(node) {
  let result = "";
  for (const child of node.childNodes) {
    result += convertNode(child);
  }
  return result;
}
function linkTargetOf(el) {
  const href = (el.getAttribute("href") ?? "").trim();
  if (href && isPortableMarkdownTarget(href)) {
    return href;
  }
  return (el.getAttribute("data-href") ?? "").trim() || href;
}
function sanitizeLink(href, text, plainText) {
  const target = href.trim();
  if (/^(javascript|vbscript|data):/i.test(target)) {
    return text;
  }
  if (!target || !isPortableMarkdownTarget(target)) {
    return plainText ? appendEscapedMarkdownInlineCode(plainText) : "";
  }
  return `[${text}](${target})`;
}
export {
  convertHtmlToMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFxodG1sVG9NYXJrZG93bi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogRE9NLWJhc2VkIEhUTUwtdG8tTWFya2Rvd24gY29udmVydGVyLlxuICpcbiAqIEhhbmRsZXMgY29tbW9uIGlubGluZSBhbmQgYmxvY2sgZWxlbWVudHMgc28gdGhhdCBjb250ZW50IHBhc3RlZCBmcm9tXG4gKiB3ZWIgcGFnZXMga2VlcHMgaXRzIGJhc2ljIHN0cnVjdHVyZSAoaGVhZGluZ3MsIGxpbmtzLCBib2xkLCBpdGFsaWMsXG4gKiBjb2RlLCBsaXN0cykgd2hlbiBpbnNlcnRlZCBpbnRvIGEgTWFya2Rvd24tYXdhcmUgc3VyZmFjZSBzdWNoIGFzIHRoZVxuICogY2hhdCBpbnB1dC5cbiAqL1xuXG5pbXBvcnQgeyBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlLCBpc1BvcnRhYmxlTWFya2Rvd25UYXJnZXQgfSBmcm9tICcuLi9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5IH0gZnJvbSAnLi90cnVzdGVkVHlwZXMuanMnO1xuXG5jb25zdCBtYXhJbnB1dExlbmd0aCA9IDIwMF8wMDA7XG5cbmNvbnN0IHR0UG9saWN5ID0gY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5KCdodG1sVG9NYXJrZG93bicsIHsgY3JlYXRlSFRNTDogdmFsdWUgPT4gdmFsdWUgfSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbDogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gQmFpbCBvdXQgb24gdmVyeSBsYXJnZSBpbnB1dHMgdG8gbGltaXQgRE9NIHBhcnNpbmcgY29zdFxuXHRpZiAoaHRtbC5sZW5ndGggPiBtYXhJbnB1dExlbmd0aCkge1xuXHRcdHJldHVybiBodG1sLnJlcGxhY2UoLzxbXj5dKz4vZywgJycpO1xuXHR9XG5cblx0Y29uc3QgdHJ1c3RlZEh0bWwgPSB0dFBvbGljeT8uY3JlYXRlSFRNTChodG1sKSA/PyBodG1sO1xuXHRjb25zdCBkb2MgPSBuZXcgRE9NUGFyc2VyKCkucGFyc2VGcm9tU3RyaW5nKHRydXN0ZWRIdG1sIGFzIHN0cmluZywgJ3RleHQvaHRtbCcpO1xuXHRsZXQgcmVzdWx0ID0gY29udmVydENoaWxkcmVuKGRvYy5ib2R5KTtcblxuXHQvLyBDb252ZXJ0IG5vbi1icmVha2luZyBzcGFjZXMgdG8gcmVndWxhciBzcGFjZXNcblx0cmVzdWx0ID0gcmVzdWx0LnJlcGxhY2UoL1xcdTAwQTAvZywgJyAnKTtcblxuXHQvLyBDb2xsYXBzZSBydW5zIG9mIDMrIG5ld2xpbmVzIGludG8gMlxuXHRyZXN1bHQgPSByZXN1bHQucmVwbGFjZSgvXFxuezMsfS9nLCAnXFxuXFxuJyk7XG5cblx0cmV0dXJuIHJlc3VsdC50cmltKCk7XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnROb2RlKG5vZGU6IE5vZGUpOiBzdHJpbmcge1xuXHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gTm9kZS5URVhUX05PREUpIHtcblx0XHRyZXR1cm4gbm9kZS50ZXh0Q29udGVudCA/PyAnJztcblx0fVxuXG5cdGlmIChub2RlLm5vZGVUeXBlICE9PSBOb2RlLkVMRU1FTlRfTk9ERSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGNvbnN0IGVsID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcblx0Y29uc3QgdGFnID0gZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG5cdHN3aXRjaCAodGFnKSB7XG5cdFx0Y2FzZSAnaDEnOiByZXR1cm4gYFxcbiMgJHtjb252ZXJ0Q2hpbGRyZW4oZWwpLnRyaW0oKX1cXG5gO1xuXHRcdGNhc2UgJ2gyJzogcmV0dXJuIGBcXG4jIyAke2NvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpfVxcbmA7XG5cdFx0Y2FzZSAnaDMnOiByZXR1cm4gYFxcbiMjIyAke2NvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpfVxcbmA7XG5cdFx0Y2FzZSAnaDQnOiByZXR1cm4gYFxcbiMjIyMgJHtjb252ZXJ0Q2hpbGRyZW4oZWwpLnRyaW0oKX1cXG5gO1xuXHRcdGNhc2UgJ2g1JzogcmV0dXJuIGBcXG4jIyMjIyAke2NvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpfVxcbmA7XG5cdFx0Y2FzZSAnaDYnOiByZXR1cm4gYFxcbiMjIyMjIyAke2NvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpfVxcbmA7XG5cblx0XHRjYXNlICdwcmUnOiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXggLS0gcXVlcnlpbmcgYSBkZXRhY2hlZCBET01QYXJzZXIgZG9jdW1lbnQsIG5vdCB0aGUgbGl2ZSBET01cblx0XHRcdGNvbnN0IGNvZGVFbCA9IGVsLnF1ZXJ5U2VsZWN0b3IoJ2NvZGUnKTtcblx0XHRcdGNvbnN0IHRleHQgPSAoY29kZUVsID8/IGVsKS50ZXh0Q29udGVudCA/PyAnJztcblx0XHRcdHJldHVybiBgXFxuXFxgXFxgXFxgXFxuJHt0ZXh0LnJlcGxhY2UoL15cXG4rfFxcbiskL2csICcnKX1cXG5cXGBcXGBcXGBcXG5gO1xuXHRcdH1cblxuXHRcdGNhc2UgJ2NvZGUnOlxuXHRcdFx0cmV0dXJuIGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoZWwudGV4dENvbnRlbnQgPz8gJycpO1xuXG5cdFx0Y2FzZSAnYmxvY2txdW90ZSc6IHtcblx0XHRcdGNvbnN0IGlubmVyID0gY29udmVydENoaWxkcmVuKGVsKS50cmltKCk7XG5cdFx0XHRjb25zdCBsaW5lcyA9IGlubmVyLnNwbGl0KCdcXG4nKS5tYXAobCA9PiBgPiAke2wudHJpbSgpfWApO1xuXHRcdFx0cmV0dXJuIGBcXG4ke2xpbmVzLmpvaW4oJ1xcbicpfVxcbmA7XG5cdFx0fVxuXG5cdFx0Y2FzZSAnb2wnOiB7XG5cdFx0XHRsZXQgaW5kZXggPSAwO1xuXHRcdFx0bGV0IHJlc3VsdCA9ICdcXG4nO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBlbC5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnbGknKSB7XG5cdFx0XHRcdFx0aW5kZXgrKztcblx0XHRcdFx0XHRyZXN1bHQgKz0gYCR7aW5kZXh9LiAke2NvbnZlcnRDaGlsZHJlbihjaGlsZCkudHJpbSgpfVxcbmA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y2FzZSAndWwnOiB7XG5cdFx0XHRsZXQgcmVzdWx0ID0gJ1xcbic7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsLmNoaWxkcmVuKSB7XG5cdFx0XHRcdGlmIChjaGlsZC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdsaScpIHtcblx0XHRcdFx0XHRyZXN1bHQgKz0gYC0gJHtjb252ZXJ0Q2hpbGRyZW4oY2hpbGQpLnRyaW0oKX1cXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNhc2UgJ2xpJzpcblx0XHRcdHJldHVybiBgLSAke2NvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpfVxcbmA7XG5cblx0XHRjYXNlICdwJzpcblx0XHRcdHJldHVybiBgJHtjb252ZXJ0Q2hpbGRyZW4oZWwpfVxcblxcbmA7XG5cblx0XHRjYXNlICdkaXYnOlxuXHRcdFx0cmV0dXJuIGAke2NvbnZlcnRDaGlsZHJlbihlbCl9XFxuYDtcblxuXHRcdGNhc2UgJ2JyJzpcblx0XHRcdHJldHVybiAnXFxuJztcblxuXHRcdGNhc2UgJ2hyJzpcblx0XHRcdHJldHVybiAnXFxuLS0tXFxuJztcblxuXHRcdGNhc2UgJ2EnOiB7XG5cdFx0XHRyZXR1cm4gc2FuaXRpemVMaW5rKGxpbmtUYXJnZXRPZihlbCksIGNvbnZlcnRDaGlsZHJlbihlbCkudHJpbSgpLCAoZWwudGV4dENvbnRlbnQgPz8gJycpLnRyaW0oKSk7XG5cdFx0fVxuXG5cdFx0Y2FzZSAnaW1nJzoge1xuXHRcdFx0Y29uc3Qgc3JjID0gZWwuZ2V0QXR0cmlidXRlKCdzcmMnKSA/PyAnJztcblx0XHRcdGNvbnN0IGFsdCA9IGVsLmdldEF0dHJpYnV0ZSgnYWx0JykgPz8gJyc7XG5cdFx0XHRpZiAoIWlzUG9ydGFibGVNYXJrZG93blRhcmdldChzcmMpKSB7XG5cdFx0XHRcdHJldHVybiBhbHQgPyBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKGFsdCkgOiAnJztcblx0XHRcdH1cblx0XHRcdHJldHVybiBgIVske2FsdH1dKCR7c3JjfSlgO1xuXHRcdH1cblxuXHRcdGNhc2UgJ3N0cm9uZyc6XG5cdFx0Y2FzZSAnYic6XG5cdFx0XHRyZXR1cm4gYCoqJHtjb252ZXJ0Q2hpbGRyZW4oZWwpfSoqYDtcblxuXHRcdGNhc2UgJ2VtJzpcblx0XHRjYXNlICdpJzpcblx0XHRcdHJldHVybiBgKiR7Y29udmVydENoaWxkcmVuKGVsKX0qYDtcblxuXHRcdGNhc2UgJ2RlbCc6XG5cdFx0Y2FzZSAncyc6XG5cdFx0Y2FzZSAnc3RyaWtlJzpcblx0XHRcdHJldHVybiBgfn4ke2NvbnZlcnRDaGlsZHJlbihlbCl9fn5gO1xuXG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBjb252ZXJ0Q2hpbGRyZW4oZWwpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRDaGlsZHJlbihub2RlOiBOb2RlKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9ICcnO1xuXHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGROb2Rlcykge1xuXHRcdHJlc3VsdCArPSBjb252ZXJ0Tm9kZShjaGlsZCk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZWFkcyB0aGUgdGFyZ2V0IG9mIGFuIGFuY2hvci4gUmVuZGVyZWQgVlMgQ29kZSBsaW5rcyByb3V0ZSBjbGlja3MgdGhyb3VnaCBgZGF0YS1ocmVmYCwgc29cbiAqIHRoYXQgYXR0cmlidXRlIGlzIGNvbnN1bHRlZCB3aGVuIGBocmVmYCBjYW5ub3QgYmUgc2hhcmVkIFx1MjAxNCBidXQgbmV2ZXIgYWhlYWQgb2YgYSB1c2FibGVcbiAqIGBocmVmYCwgc2luY2UgYXJiaXRyYXJ5IHBhZ2VzIHVzZSB0aGUgc2FtZSBhdHRyaWJ1dGUgbmFtZSBhbmQgY291bGQgcmVkaXJlY3QgYSBsaW5rLlxuICovXG5mdW5jdGlvbiBsaW5rVGFyZ2V0T2YoZWw6IEhUTUxFbGVtZW50KTogc3RyaW5nIHtcblx0Y29uc3QgaHJlZiA9IChlbC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSA/PyAnJykudHJpbSgpO1xuXHRpZiAoaHJlZiAmJiBpc1BvcnRhYmxlTWFya2Rvd25UYXJnZXQoaHJlZikpIHtcblx0XHRyZXR1cm4gaHJlZjtcblx0fVxuXHRyZXR1cm4gKGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJykgPz8gJycpLnRyaW0oKSB8fCBocmVmO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYW4gYW5jaG9yIGFzIG1hcmtkb3duLCBrZWVwaW5nIG9ubHkgdGFyZ2V0cyB0aGF0IHN0aWxsIG1lYW4gc29tZXRoaW5nIHdoZXJldmVyIHRoZVxuICogbWFya2Rvd24gaXMgcGFzdGVkLiBFdmVyeXRoaW5nIGVsc2UgZmFsbHMgYmFjayB0byB0aGUgdGV4dCB0aGUgcmVhZGVyIGFjdHVhbGx5IHNhdy5cbiAqL1xuZnVuY3Rpb24gc2FuaXRpemVMaW5rKGhyZWY6IHN0cmluZywgdGV4dDogc3RyaW5nLCBwbGFpblRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHRhcmdldCA9IGhyZWYudHJpbSgpO1xuXG5cdC8vIEFuIGV4ZWN1dGFibGUgdGFyZ2V0IGNhcnJpZXMgbm8gbGFiZWwgd29ydGggbWFya2luZyB1cCBhcyBjb2RlLlxuXHRpZiAoL14oamF2YXNjcmlwdHx2YnNjcmlwdHxkYXRhKTovaS50ZXN0KHRhcmdldCkpIHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdGlmICghdGFyZ2V0IHx8ICFpc1BvcnRhYmxlTWFya2Rvd25UYXJnZXQodGFyZ2V0KSkge1xuXHRcdC8vIEVtcGhhc2lzIG1hcmtlcnMgYXJvdW5kIHRoZSBsYWJlbCB3b3VsZCBiZSByZWFkIGxpdGVyYWxseSBpbnNpZGUgYSBjb2RlIHNwYW4uXG5cdFx0cmV0dXJuIHBsYWluVGV4dCA/IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUocGxhaW5UZXh0KSA6ICcnO1xuXHR9XG5cblx0cmV0dXJuIGBbJHt0ZXh0fV0oJHt0YXJnZXR9KWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFjQSxTQUFTLGlDQUFpQyxnQ0FBZ0M7QUFDMUUsU0FBUyxnQ0FBZ0M7QUFFekMsTUFBTSxpQkFBaUI7QUFFdkIsTUFBTSxXQUFXLHlCQUF5QixrQkFBa0IsRUFBRSxZQUFZLFdBQVMsTUFBTSxDQUFDO0FBRW5GLFNBQVMsc0JBQXNCLE1BQXNCO0FBRTNELE1BQUksS0FBSyxTQUFTLGdCQUFnQjtBQUNqQyxXQUFPLEtBQUssUUFBUSxZQUFZLEVBQUU7QUFBQSxFQUNuQztBQUVBLFFBQU0sY0FBYyxVQUFVLFdBQVcsSUFBSSxLQUFLO0FBQ2xELFFBQU0sTUFBTSxJQUFJLFVBQVUsRUFBRSxnQkFB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R0FBRyxnQkFBZ0IsRUFBRSxFQUFFLEtBQUssSUFBSSxHQUFHLGVBQWUsSUFBSSxLQUFLLENBQUM7QUFBQSxJQUNoRztBQUFBLElBRUEsS0FBSyxPQUFPO0FBQ1gsWUFBTSxNQUFNLEdBQUcsYUFBYSxLQUFLLEtBQUs7QUFDdEMsWUFBTSxNQUFNLEdBQUcsYUFBYSxLQUFLLEtBQUs7QUFDdEMsVUFBSSxDQUFDLHlCQUF5QixHQUFHLEdBQUc7QUFDbkMsZUFBTyxNQUFNLGdDQUFnQyxHQUFHLElBQUk7QUFBQSxNQUNyRDtBQUNBLGFBQU8sS0FBSyxHQUFHLEtBQUssR0FBRztBQUFBLElBQ3hCO0FBQUEsSUFFQSxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTyxLQUFLLGdCQUFnQixFQUFFLENBQUM7QUFBQSxJQUVoQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTyxJQUFJLGdCQUFnQixFQUFFLENBQUM7QUFBQSxJQUUvQixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQ0osYUFBTyxLQUFLLGdCQUFnQixFQUFFLENBQUM7QUFBQSxJQUVoQztBQUNDLGFBQU8sZ0JBQWdCLEVBQUU7QUFBQSxFQUMzQjtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsTUFBb0I7QUFDNUMsTUFBSSxTQUFTO0FBQ2IsYUFBVyxTQUFTLEtBQUssWUFBWTtBQUNwQyxjQUFVLFlBQVksS0FBSztBQUFBLEVBQzVCO0FBQ0EsU0FBTztBQUNSO0FBT0EsU0FBUyxhQUFhLElBQXlCO0FBQzlDLFFBQU0sUUFBUSxHQUFHLGFBQWEsTUFBTSxLQUFLLElBQUksS0FBSztBQUNsRCxNQUFJLFFBQVEseUJBQXlCLElBQUksR0FBRztBQUMzQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFVBQVEsR0FBRyxhQUFhLFdBQVcsS0FBSyxJQUFJLEtBQUssS0FBSztBQUN2RDtBQU1BLFNBQVMsYUFBYSxNQUFjLE1BQWMsV0FBMkI7QUFDNUUsUUFBTSxTQUFTLEtBQUssS0FBSztBQUd6QixNQUFJLGdDQUFnQyxLQUFLLE1BQU0sR0FBRztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksQ0FBQyxVQUFVLENBQUMseUJBQXlCLE1BQU0sR0FBRztBQUVqRCxXQUFPLFlBQVksZ0NBQWdDLFNBQVMsSUFBSTtBQUFBLEVBQ2pFO0FBRUEsU0FBTyxJQUFJLElBQUksS0FBSyxNQUFNO0FBQzNCOyIsCiAgIm5hbWVzIjogW10KfQo=
