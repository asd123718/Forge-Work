import { sanitizeHtml } from "../../../../base/browser/domSanitize.js";
import { allowedMarkdownHtmlAttributes, allowedMarkdownHtmlTags } from "../../../../base/browser/markdownRenderer.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import * as marked from "../../../../base/common/marked/marked.js";
import { Schemas } from "../../../../base/common/network.js";
import { escape } from "../../../../base/common/strings.js";
import { tokenizeToString } from "../../../../editor/common/languages/textToHtmlTokenizer.js";
import { markedGfmHeadingIdPlugin } from "./markedGfmHeadingIdPlugin.js";
const DEFAULT_MARKDOWN_STYLES = `
body {
	padding: 10px 20px;
	line-height: 22px;
	max-width: 882px;
	margin: 0 auto;
}

body *:last-child {
	margin-bottom: 0;
}

img {
	max-width: 100%;
	max-height: 100%;
}

a {
	text-decoration: var(--text-link-decoration);
}

a:hover {
	text-decoration: underline;
}

a:focus,
input:focus,
select:focus,
textarea:focus {
	outline: 1px solid -webkit-focus-ring-color;
	outline-offset: -1px;
}

hr {
	border: 0;
	height: 2px;
	border-bottom: 2px solid;
}

h1 {
	padding-bottom: 0.3em;
	line-height: 1.2;
	border-bottom-width: 1px;
	border-bottom-style: solid;
}

h1, h2, h3 {
	font-weight: normal;
}

table {
	border-collapse: collapse;
}

th {
	text-align: left;
	border-bottom: 1px solid;
}

th,
td {
	padding: 5px 10px;
}

table > tbody > tr + tr > td {
	border-top-width: 1px;
	border-top-style: solid;
}

blockquote {
	margin: 0 7px 0 5px;
	padding: 0 16px 0 10px;
	border-left-width: 5px;
	border-left-style: solid;
}

code {
	font-family: "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace;
}

pre {
	padding: 16px;
	border-radius: 3px;
	overflow: auto;
}

pre code {
	font-family: var(--vscode-editor-font-family);
	font-weight: var(--vscode-editor-font-weight);
	font-size: var(--vscode-editor-font-size);
	line-height: 1.5;
	color: var(--vscode-editor-foreground);
	tab-size: 4;
}

.monaco-tokenized-source {
	white-space: pre;
}

/** Theming */

.pre {
	background-color: var(--vscode-textCodeBlock-background);
}

.vscode-high-contrast h1 {
	border-color: rgb(0, 0, 0);
}

.vscode-light th {
	border-color: rgba(0, 0, 0, 0.69);
}

.vscode-dark th {
	border-color: rgba(255, 255, 255, 0.69);
}

.vscode-light h1,
.vscode-light hr,
.vscode-light td {
	border-color: rgba(0, 0, 0, 0.18);
}

.vscode-dark h1,
.vscode-dark hr,
.vscode-dark td {
	border-color: rgba(255, 255, 255, 0.18);
}

@media (forced-colors: active) and (prefers-color-scheme: light){
	body {
		forced-color-adjust: none;
	}
}

@media (forced-colors: active) and (prefers-color-scheme: dark){
	body {
		forced-color-adjust: none;
	}
}
`;
const defaultAllowedLinkProtocols = Object.freeze([
  Schemas.http,
  Schemas.https
]);
function sanitize(documentContent, sanitizerConfig) {
  return sanitizeHtml(documentContent, {
    allowedLinkProtocols: {
      override: sanitizerConfig?.allowedLinkProtocols?.override ?? defaultAllowedLinkProtocols
    },
    allowRelativeLinkPaths: sanitizerConfig?.allowRelativeLinkPaths,
    allowedMediaProtocols: sanitizerConfig?.allowedMediaProtocols,
    allowRelativeMediaPaths: sanitizerConfig?.allowRelativeMediaPaths,
    allowedTags: {
      override: allowedMarkdownHtmlTags,
      augment: sanitizerConfig?.allowedTags?.augment
    },
    allowedAttributes: {
      override: [
        ...allowedMarkdownHtmlAttributes,
        "name",
        "id",
        "class",
        "role",
        "tabindex",
        "placeholder"
      ],
      augment: sanitizerConfig?.allowedAttributes?.augment ?? []
    }
  });
}
async function renderMarkdownDocument(text, extensionService, languageService, options, token = CancellationToken.None) {
  const m = new marked.Marked(
    MarkedHighlight.markedHighlight({
      async: true,
      async highlight(code, lang) {
        if (typeof lang !== "string") {
          return escape(code);
        }
        await extensionService.whenInstalledExtensionsRegistered();
        if (token?.isCancellationRequested) {
          return "";
        }
        const languageId = languageService.getLanguageIdByLanguageName(lang) ?? languageService.getLanguageIdByLanguageName(lang.split(/\s+|:|,|(?!^)\{|\?]/, 1)[0]);
        return tokenizeToString(languageService, code, languageId);
      }
    }),
    markedGfmHeadingIdPlugin(),
    ...options?.markedExtensions ?? []
  );
  const raw = await raceCancellationError(m.parse(text, { async: true }), token ?? CancellationToken.None);
  return sanitize(raw, options?.sanitizerConfig);
}
var MarkedHighlight;
((MarkedHighlight2) => {
  function markedHighlight(options) {
    if (typeof options === "function") {
      options = {
        highlight: options
      };
    }
    if (!options || typeof options.highlight !== "function") {
      throw new Error("Must provide highlight function");
    }
    return {
      async: !!options.async,
      walkTokens(token) {
        if (token.type !== "code") {
          return;
        }
        if (options.async) {
          return Promise.resolve(options.highlight(token.text, token.lang)).then(updateToken(token));
        }
        const code = options.highlight(token.text, token.lang);
        if (code instanceof Promise) {
          throw new Error("markedHighlight is not set to async but the highlight function is async. Set the async option to true on markedHighlight to await the async highlight function.");
        }
        updateToken(token)(code);
      },
      renderer: {
        code({ text, lang, escaped }) {
          const classAttr = lang ? ` class="language-${escape2(lang)}"` : "";
          text = text.replace(/\n$/, "");
          return `<pre><code${classAttr}>${escaped ? text : escape2(text, true)}
</code></pre>`;
        }
      }
    };
  }
  MarkedHighlight2.markedHighlight = markedHighlight;
  function updateToken(token) {
    return (code) => {
      if (typeof code === "string" && code !== token.text) {
        token.escaped = true;
        token.text = code;
      }
    };
  }
  const escapeTest = /[&<>"']/;
  const escapeReplace = new RegExp(escapeTest.source, "g");
  const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
  const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
  const escapeReplacement = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    [`'`]: "&#39;"
  };
  const getEscapeReplacement = (ch) => escapeReplacement[ch];
  function escape2(html, encode) {
    if (encode) {
      if (escapeTest.test(html)) {
        return html.replace(escapeReplace, getEscapeReplacement);
      }
    } else {
      if (escapeTestNoEncode.test(html)) {
        return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
      }
    }
    return html;
  }
})(MarkedHighlight || (MarkedHighlight = {}));
export {
  DEFAULT_MARKDOWN_STYLES,
  renderMarkdownDocument
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtkb3duXFxicm93c2VyXFxtYXJrZG93bkRvY3VtZW50UmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzYW5pdGl6ZUh0bWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgYWxsb3dlZE1hcmtkb3duSHRtbEF0dHJpYnV0ZXMsIGFsbG93ZWRNYXJrZG93bkh0bWxUYWdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0ICogYXMgbWFya2VkIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXNjYXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgdG9rZW5pemVUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IG1hcmtlZEdmbUhlYWRpbmdJZFBsdWdpbiB9IGZyb20gJy4vbWFya2VkR2ZtSGVhZGluZ0lkUGx1Z2luLmpzJztcblxuZXhwb3J0IGNvbnN0IERFRkFVTFRfTUFSS0RPV05fU1RZTEVTID0gYFxuYm9keSB7XG5cdHBhZGRpbmc6IDEwcHggMjBweDtcblx0bGluZS1oZWlnaHQ6IDIycHg7XG5cdG1heC13aWR0aDogODgycHg7XG5cdG1hcmdpbjogMCBhdXRvO1xufVxuXG5ib2R5ICo6bGFzdC1jaGlsZCB7XG5cdG1hcmdpbi1ib3R0b206IDA7XG59XG5cbmltZyB7XG5cdG1heC13aWR0aDogMTAwJTtcblx0bWF4LWhlaWdodDogMTAwJTtcbn1cblxuYSB7XG5cdHRleHQtZGVjb3JhdGlvbjogdmFyKC0tdGV4dC1saW5rLWRlY29yYXRpb24pO1xufVxuXG5hOmhvdmVyIHtcblx0dGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XG59XG5cbmE6Zm9jdXMsXG5pbnB1dDpmb2N1cyxcbnNlbGVjdDpmb2N1cyxcbnRleHRhcmVhOmZvY3VzIHtcblx0b3V0bGluZTogMXB4IHNvbGlkIC13ZWJraXQtZm9jdXMtcmluZy1jb2xvcjtcblx0b3V0bGluZS1vZmZzZXQ6IC0xcHg7XG59XG5cbmhyIHtcblx0Ym9yZGVyOiAwO1xuXHRoZWlnaHQ6IDJweDtcblx0Ym9yZGVyLWJvdHRvbTogMnB4IHNvbGlkO1xufVxuXG5oMSB7XG5cdHBhZGRpbmctYm90dG9tOiAwLjNlbTtcblx0bGluZS1oZWlnaHQ6IDEuMjtcblx0Ym9yZGVyLWJvdHRvbS13aWR0aDogMXB4O1xuXHRib3JkZXItYm90dG9tLXN0eWxlOiBzb2xpZDtcbn1cblxuaDEsIGgyLCBoMyB7XG5cdGZvbnQtd2VpZ2h0OiBub3JtYWw7XG59XG5cbnRhYmxlIHtcblx0Ym9yZGVyLWNvbGxhcHNlOiBjb2xsYXBzZTtcbn1cblxudGgge1xuXHR0ZXh0LWFsaWduOiBsZWZ0O1xuXHRib3JkZXItYm90dG9tOiAxcHggc29saWQ7XG59XG5cbnRoLFxudGQge1xuXHRwYWRkaW5nOiA1cHggMTBweDtcbn1cblxudGFibGUgPiB0Ym9keSA+IHRyICsgdHIgPiB0ZCB7XG5cdGJvcmRlci10b3Atd2lkdGg6IDFweDtcblx0Ym9yZGVyLXRvcC1zdHlsZTogc29saWQ7XG59XG5cbmJsb2NrcXVvdGUge1xuXHRtYXJnaW46IDAgN3B4IDAgNXB4O1xuXHRwYWRkaW5nOiAwIDE2cHggMCAxMHB4O1xuXHRib3JkZXItbGVmdC13aWR0aDogNXB4O1xuXHRib3JkZXItbGVmdC1zdHlsZTogc29saWQ7XG59XG5cbmNvZGUge1xuXHRmb250LWZhbWlseTogXCJTRiBNb25vXCIsIE1vbmFjbywgTWVubG8sIENvbnNvbGFzLCBcIlVidW50dSBNb25vXCIsIFwiTGliZXJhdGlvbiBNb25vXCIsIFwiRGVqYVZ1IFNhbnMgTW9ub1wiLCBcIkNvdXJpZXIgTmV3XCIsIG1vbm9zcGFjZTtcbn1cblxucHJlIHtcblx0cGFkZGluZzogMTZweDtcblx0Ym9yZGVyLXJhZGl1czogM3B4O1xuXHRvdmVyZmxvdzogYXV0bztcbn1cblxucHJlIGNvZGUge1xuXHRmb250LWZhbWlseTogdmFyKC0tdnNjb2RlLWVkaXRvci1mb250LWZhbWlseSk7XG5cdGZvbnQtd2VpZ2h0OiB2YXIoLS12c2NvZGUtZWRpdG9yLWZvbnQtd2VpZ2h0KTtcblx0Zm9udC1zaXplOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZvbnQtc2l6ZSk7XG5cdGxpbmUtaGVpZ2h0OiAxLjU7XG5cdGNvbG9yOiB2YXIoLS12c2NvZGUtZWRpdG9yLWZvcmVncm91bmQpO1xuXHR0YWItc2l6ZTogNDtcbn1cblxuLm1vbmFjby10b2tlbml6ZWQtc291cmNlIHtcblx0d2hpdGUtc3BhY2U6IHByZTtcbn1cblxuLyoqIFRoZW1pbmcgKi9cblxuLnByZSB7XG5cdGJhY2tncm91bmQtY29sb3I6IHZhcigtLXZzY29kZS10ZXh0Q29kZUJsb2NrLWJhY2tncm91bmQpO1xufVxuXG4udnNjb2RlLWhpZ2gtY29udHJhc3QgaDEge1xuXHRib3JkZXItY29sb3I6IHJnYigwLCAwLCAwKTtcbn1cblxuLnZzY29kZS1saWdodCB0aCB7XG5cdGJvcmRlci1jb2xvcjogcmdiYSgwLCAwLCAwLCAwLjY5KTtcbn1cblxuLnZzY29kZS1kYXJrIHRoIHtcblx0Ym9yZGVyLWNvbG9yOiByZ2JhKDI1NSwgMjU1LCAyNTUsIDAuNjkpO1xufVxuXG4udnNjb2RlLWxpZ2h0IGgxLFxuLnZzY29kZS1saWdodCBocixcbi52c2NvZGUtbGlnaHQgdGQge1xuXHRib3JkZXItY29sb3I6IHJnYmEoMCwgMCwgMCwgMC4xOCk7XG59XG5cbi52c2NvZGUtZGFyayBoMSxcbi52c2NvZGUtZGFyayBocixcbi52c2NvZGUtZGFyayB0ZCB7XG5cdGJvcmRlci1jb2xvcjogcmdiYSgyNTUsIDI1NSwgMjU1LCAwLjE4KTtcbn1cblxuQG1lZGlhIChmb3JjZWQtY29sb3JzOiBhY3RpdmUpIGFuZCAocHJlZmVycy1jb2xvci1zY2hlbWU6IGxpZ2h0KXtcblx0Ym9keSB7XG5cdFx0Zm9yY2VkLWNvbG9yLWFkanVzdDogbm9uZTtcblx0fVxufVxuXG5AbWVkaWEgKGZvcmNlZC1jb2xvcnM6IGFjdGl2ZSkgYW5kIChwcmVmZXJzLWNvbG9yLXNjaGVtZTogZGFyayl7XG5cdGJvZHkge1xuXHRcdGZvcmNlZC1jb2xvci1hZGp1c3Q6IG5vbmU7XG5cdH1cbn1cbmA7XG5cbmNvbnN0IGRlZmF1bHRBbGxvd2VkTGlua1Byb3RvY29scyA9IE9iamVjdC5mcmVlemUoW1xuXHRTY2hlbWFzLmh0dHAsXG5cdFNjaGVtYXMuaHR0cHMsXG5dKTtcblxuZnVuY3Rpb24gc2FuaXRpemUoZG9jdW1lbnRDb250ZW50OiBzdHJpbmcsIHNhbml0aXplckNvbmZpZzogTWFya2Rvd25Eb2N1bWVudFNhbml0aXplckNvbmZpZyB8IHVuZGVmaW5lZCk6IFRydXN0ZWRIVE1MIHtcblx0cmV0dXJuIHNhbml0aXplSHRtbChkb2N1bWVudENvbnRlbnQsIHtcblx0XHRhbGxvd2VkTGlua1Byb3RvY29sczoge1xuXHRcdFx0b3ZlcnJpZGU6IHNhbml0aXplckNvbmZpZz8uYWxsb3dlZExpbmtQcm90b2NvbHM/Lm92ZXJyaWRlID8/IGRlZmF1bHRBbGxvd2VkTGlua1Byb3RvY29scyxcblx0XHR9LFxuXHRcdGFsbG93UmVsYXRpdmVMaW5rUGF0aHM6IHNhbml0aXplckNvbmZpZz8uYWxsb3dSZWxhdGl2ZUxpbmtQYXRocyxcblx0XHRhbGxvd2VkTWVkaWFQcm90b2NvbHM6IHNhbml0aXplckNvbmZpZz8uYWxsb3dlZE1lZGlhUHJvdG9jb2xzLFxuXHRcdGFsbG93UmVsYXRpdmVNZWRpYVBhdGhzOiBzYW5pdGl6ZXJDb25maWc/LmFsbG93UmVsYXRpdmVNZWRpYVBhdGhzLFxuXHRcdGFsbG93ZWRUYWdzOiB7XG5cdFx0XHRvdmVycmlkZTogYWxsb3dlZE1hcmtkb3duSHRtbFRhZ3MsXG5cdFx0XHRhdWdtZW50OiBzYW5pdGl6ZXJDb25maWc/LmFsbG93ZWRUYWdzPy5hdWdtZW50XG5cdFx0fSxcblx0XHRhbGxvd2VkQXR0cmlidXRlczoge1xuXHRcdFx0b3ZlcnJpZGU6IFtcblx0XHRcdFx0Li4uYWxsb3dlZE1hcmtkb3duSHRtbEF0dHJpYnV0ZXMsXG5cdFx0XHRcdCduYW1lJyxcblx0XHRcdFx0J2lkJyxcblx0XHRcdFx0J2NsYXNzJyxcblx0XHRcdFx0J3JvbGUnLFxuXHRcdFx0XHQndGFiaW5kZXgnLFxuXHRcdFx0XHQncGxhY2Vob2xkZXInLFxuXHRcdFx0XSxcblx0XHRcdGF1Z21lbnQ6IHNhbml0aXplckNvbmZpZz8uYWxsb3dlZEF0dHJpYnV0ZXM/LmF1Z21lbnQgPz8gW10sXG5cdFx0fVxuXHR9KTtcbn1cblxuaW50ZXJmYWNlIE1hcmtkb3duRG9jdW1lbnRTYW5pdGl6ZXJDb25maWcge1xuXHRyZWFkb25seSBhbGxvd2VkTGlua1Byb3RvY29scz86IHtcblx0XHRyZWFkb25seSBvdmVycmlkZTogcmVhZG9ubHkgc3RyaW5nW10gfCAnKic7XG5cdH07XG5cdHJlYWRvbmx5IGFsbG93UmVsYXRpdmVMaW5rUGF0aHM/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IGFsbG93ZWRNZWRpYVByb3RvY29scz86IHtcblx0XHRyZWFkb25seSBvdmVycmlkZTogcmVhZG9ubHkgc3RyaW5nW10gfCAnKic7XG5cdH07XG5cdHJlYWRvbmx5IGFsbG93UmVsYXRpdmVNZWRpYVBhdGhzPzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBhbGxvd2VkVGFncz86IHtcblx0XHRyZWFkb25seSBhdWdtZW50OiByZWFkb25seSBzdHJpbmdbXTtcblx0fTtcblxuXHRyZWFkb25seSBhbGxvd2VkQXR0cmlidXRlcz86IHtcblx0XHRyZWFkb25seSBhdWdtZW50OiByZWFkb25seSBzdHJpbmdbXTtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElSZW5kZXJNYXJrZG93bkRvY3VtZW50T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNhbml0aXplckNvbmZpZz86IE1hcmtkb3duRG9jdW1lbnRTYW5pdGl6ZXJDb25maWc7XG5cdHJlYWRvbmx5IG1hcmtlZEV4dGVuc2lvbnM/OiByZWFkb25seSBtYXJrZWQuTWFya2VkRXh0ZW5zaW9uW107XG59XG5cbi8qKlxuICogUmVuZGVycyBhIHN0cmluZyBvZiBtYXJrZG93biBmb3IgdXNlIGluIGFuIGV4dGVybmFsIGRvY3VtZW50IGNvbnRleHQuXG4gKlxuICogVXNlcyBWUyBDb2RlJ3Mgc3ludGF4IGhpZ2hsaWdodGluZyBjb2RlIGJsb2Nrcy4gQWxzbyBkb2VzIG5vdCBhdHRhY2ggYWxsIHRoZSBob29rcyBhbmQgY3VzdG9taXphdGlvbiB0aGF0IG5vcm1hbFxuICogbWFya2Rvd24gcmVuZGVyZXIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZW5kZXJNYXJrZG93bkRvY3VtZW50KFxuXHR0ZXh0OiBzdHJpbmcsXG5cdGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdG9wdGlvbnM/OiBJUmVuZGVyTWFya2Rvd25Eb2N1bWVudE9wdGlvbnMsXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG4pOiBQcm9taXNlPFRydXN0ZWRIVE1MPiB7XG5cdGNvbnN0IG0gPSBuZXcgbWFya2VkLk1hcmtlZChcblx0XHRNYXJrZWRIaWdobGlnaHQubWFya2VkSGlnaGxpZ2h0KHtcblx0XHRcdGFzeW5jOiB0cnVlLFxuXHRcdFx0YXN5bmMgaGlnaGxpZ2h0KGNvZGU6IHN0cmluZywgbGFuZzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBsYW5nICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBlc2NhcGUoY29kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBleHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdFx0XHRpZiAodG9rZW4/LmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUobGFuZykgPz8gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShsYW5nLnNwbGl0KC9cXHMrfDp8LHwoPyFeKVxce3xcXD9dLywgMSlbMF0pO1xuXHRcdFx0XHRyZXR1cm4gdG9rZW5pemVUb1N0cmluZyhsYW5ndWFnZVNlcnZpY2UsIGNvZGUsIGxhbmd1YWdlSWQpO1xuXHRcdFx0fVxuXHRcdH0pLFxuXHRcdG1hcmtlZEdmbUhlYWRpbmdJZFBsdWdpbigpLFxuXHRcdC4uLihvcHRpb25zPy5tYXJrZWRFeHRlbnNpb25zID8/IFtdKSxcblx0KTtcblxuXHRjb25zdCByYXcgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IobS5wYXJzZSh0ZXh0LCB7IGFzeW5jOiB0cnVlIH0pLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0cmV0dXJuIHNhbml0aXplKHJhdywgb3B0aW9ucz8uc2FuaXRpemVyQ29uZmlnKTtcbn1cblxubmFtZXNwYWNlIE1hcmtlZEhpZ2hsaWdodCB7XG5cdC8vIENvcGllZCBmcm9tIGh0dHBzOi8vZ2l0aHViLmNvbS9tYXJrZWRqcy9tYXJrZWQtaGlnaGxpZ2h0L2Jsb2IvbWFpbi9zcmMvaW5kZXguanNcblxuXHRleHBvcnQgZnVuY3Rpb24gbWFya2VkSGlnaGxpZ2h0KG9wdGlvbnM6IG1hcmtlZC5NYXJrZWRPcHRpb25zICYgeyBoaWdobGlnaHQ6IChjb2RlOiBzdHJpbmcsIGxhbmc6IHN0cmluZykgPT4gc3RyaW5nIHwgUHJvbWlzZTxzdHJpbmc+IH0pOiBtYXJrZWQuTWFya2VkRXh0ZW5zaW9uIHtcblx0XHRpZiAodHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdGhpZ2hsaWdodDogb3B0aW9ucyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zIHx8IHR5cGVvZiBvcHRpb25zLmhpZ2hsaWdodCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNdXN0IHByb3ZpZGUgaGlnaGxpZ2h0IGZ1bmN0aW9uJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFzeW5jOiAhIW9wdGlvbnMuYXN5bmMsXG5cdFx0XHR3YWxrVG9rZW5zKHRva2VuOiBtYXJrZWQuVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHwgdm9pZCB7XG5cdFx0XHRcdGlmICh0b2tlbi50eXBlICE9PSAnY29kZScpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob3B0aW9ucy5hc3luYykge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUob3B0aW9ucy5oaWdobGlnaHQodG9rZW4udGV4dCwgdG9rZW4ubGFuZykpLnRoZW4odXBkYXRlVG9rZW4odG9rZW4pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvZGUgPSBvcHRpb25zLmhpZ2hsaWdodCh0b2tlbi50ZXh0LCB0b2tlbi5sYW5nKTtcblx0XHRcdFx0aWYgKGNvZGUgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtYXJrZWRIaWdobGlnaHQgaXMgbm90IHNldCB0byBhc3luYyBidXQgdGhlIGhpZ2hsaWdodCBmdW5jdGlvbiBpcyBhc3luYy4gU2V0IHRoZSBhc3luYyBvcHRpb24gdG8gdHJ1ZSBvbiBtYXJrZWRIaWdobGlnaHQgdG8gYXdhaXQgdGhlIGFzeW5jIGhpZ2hsaWdodCBmdW5jdGlvbi4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVUb2tlbih0b2tlbikoY29kZSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyZXI6IHtcblx0XHRcdFx0Y29kZSh7IHRleHQsIGxhbmcsIGVzY2FwZWQgfTogbWFya2VkLlRva2Vucy5Db2RlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2xhc3NBdHRyID0gbGFuZ1xuXHRcdFx0XHRcdFx0PyBgIGNsYXNzPVwibGFuZ3VhZ2UtJHtlc2NhcGUobGFuZyl9XCJgXG5cdFx0XHRcdFx0XHQ6ICcnO1xuXHRcdFx0XHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xcbiQvLCAnJyk7XG5cdFx0XHRcdFx0cmV0dXJuIGA8cHJlPjxjb2RlJHtjbGFzc0F0dHJ9PiR7ZXNjYXBlZCA/IHRleHQgOiBlc2NhcGUodGV4dCwgdHJ1ZSl9XFxuPC9jb2RlPjwvcHJlPmA7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiB1cGRhdGVUb2tlbih0b2tlbjogYW55KSB7XG5cdFx0cmV0dXJuIChjb2RlOiBzdHJpbmcpID0+IHtcblx0XHRcdGlmICh0eXBlb2YgY29kZSA9PT0gJ3N0cmluZycgJiYgY29kZSAhPT0gdG9rZW4udGV4dCkge1xuXHRcdFx0XHR0b2tlbi5lc2NhcGVkID0gdHJ1ZTtcblx0XHRcdFx0dG9rZW4udGV4dCA9IGNvZGU7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIGNvcGllZCBmcm9tIG1hcmtlZCBoZWxwZXJzXG5cdGNvbnN0IGVzY2FwZVRlc3QgPSAvWyY8PlwiJ10vO1xuXHRjb25zdCBlc2NhcGVSZXBsYWNlID0gbmV3IFJlZ0V4cChlc2NhcGVUZXN0LnNvdXJjZSwgJ2cnKTtcblx0Y29uc3QgZXNjYXBlVGVzdE5vRW5jb2RlID0gL1s8PlwiJ118Jig/ISgjXFxkezEsN318I1tYeF1bYS1mQS1GMC05XXsxLDZ9fFxcdyspOykvO1xuXHRjb25zdCBlc2NhcGVSZXBsYWNlTm9FbmNvZGUgPSBuZXcgUmVnRXhwKGVzY2FwZVRlc3ROb0VuY29kZS5zb3VyY2UsICdnJyk7XG5cdGNvbnN0IGVzY2FwZVJlcGxhY2VtZW50OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdCcmJzogJyZhbXA7Jyxcblx0XHQnPCc6ICcmbHQ7Jyxcblx0XHQnPic6ICcmZ3Q7Jyxcblx0XHQnXCInOiAnJnF1b3Q7Jyxcblx0XHRbYCdgXTogJyYjMzk7Jyxcblx0fTtcblx0Y29uc3QgZ2V0RXNjYXBlUmVwbGFjZW1lbnQgPSAoY2g6IHN0cmluZykgPT4gZXNjYXBlUmVwbGFjZW1lbnRbY2hdO1xuXHRmdW5jdGlvbiBlc2NhcGUoaHRtbDogc3RyaW5nLCBlbmNvZGU/OiBib29sZWFuKSB7XG5cdFx0aWYgKGVuY29kZSkge1xuXHRcdFx0aWYgKGVzY2FwZVRlc3QudGVzdChodG1sKSkge1xuXHRcdFx0XHRyZXR1cm4gaHRtbC5yZXBsYWNlKGVzY2FwZVJlcGxhY2UsIGdldEVzY2FwZVJlcGxhY2VtZW50KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGVzY2FwZVRlc3ROb0VuY29kZS50ZXN0KGh0bWwpKSB7XG5cdFx0XHRcdHJldHVybiBodG1sLnJlcGxhY2UoZXNjYXBlUmVwbGFjZU5vRW5jb2RlLCBnZXRFc2NhcGVSZXBsYWNlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGh0bWw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0JBQStCLCtCQUErQjtBQUN2RSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLFlBQVk7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUV2QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGdDQUFnQztBQUVsQyxNQUFNLDBCQUEwQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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QXdCLElBQUksT0FBTyxtQkFBbUIsUUFBUSxHQUFHO0FBQ3ZFLFFBQU0sb0JBQTRDO0FBQUEsSUFDakQsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsQ0FBQyxHQUFHLEdBQUc7QUFBQSxFQUNSO0FBQ0EsUUFBTSx1QkFBdUIsQ0FBQyxPQUFlLGtCQUFrQixFQUFFO0FBQ2pFLFdBQVNDLFFBQU8sTUFBYyxRQUFrQjtBQUMvQyxRQUFJLFFBQVE7QUFDWCxVQUFJLFdBQVcsS0FBSyxJQUFJLEdBQUc7QUFDMUIsZUFBTyxLQUFLLFFBQVEsZUFBZSxvQkFBb0I7QUFBQSxNQUN4RDtBQUFBLElBQ0QsT0FBTztBQUNOLFVBQUksbUJBQW1CLEtBQUssSUFBSSxHQUFHO0FBQ2xDLGVBQU8sS0FBSyxRQUFRLHVCQUF1QixvQkFBb0I7QUFBQSxNQUNoRTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEdBN0VTOyIsCiAgIm5hbWVzIjogWyJNYXJrZWRIaWdobGlnaHQiLCAiZXNjYXBlIl0KfQo=
