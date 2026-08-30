import { onUnexpectedError } from "../common/errors.js";
import { escapeDoubleQuotes, isPortableLinkTarget, parseHrefAndDimensions, removeMarkdownEscapes } from "../common/htmlContent.js";
import { markdownEscapeEscapedIcons } from "../common/iconLabels.js";
import { defaultGenerator } from "../common/idGenerator.js";
import { KeyCode } from "../common/keyCodes.js";
import { DisposableStore } from "../common/lifecycle.js";
import * as marked from "../common/marked/marked.js";
import { parse } from "../common/marshalling.js";
import { FileAccess, Schemas } from "../common/network.js";
import { cloneAndChange } from "../common/objects.js";
import { basename as pathBasename } from "../common/path.js";
import { basename, dirname, resolvePath } from "../common/resources.js";
import { escape } from "../common/strings.js";
import { URI } from "../common/uri.js";
import * as DOM from "./dom.js";
import * as domSanitize from "./domSanitize.js";
import { convertTagToPlaintext } from "./domSanitize.js";
import { StandardKeyboardEvent } from "./keyboardEvent.js";
import { StandardMouseEvent } from "./mouseEvent.js";
import { renderIcon, renderLabelWithIcons } from "./ui/iconLabel/iconLabels.js";
function getLinkTitle(href) {
  try {
    const parsed = URI.parse(href);
    if (parsed.scheme === Schemas.file) {
      const path = parsed.fsPath;
      const fragment = parsed.fragment;
      return escapeDoubleQuotes(fragment ? `${path}#${fragment}` : path);
    }
  } catch {
  }
  return "";
}
function renderImage({ href, title, text }, transformUri) {
  let dimensions = [];
  let attributes = [];
  if (href) {
    ({ href, dimensions } = parseHrefAndDimensions(href));
    href = transformUri?.(href) ?? href;
    attributes.push(`src="${escapeDoubleQuotes(href)}"`);
  }
  if (text) {
    attributes.push(`alt="${escapeDoubleQuotes(text)}"`);
  }
  if (title) {
    attributes.push(`title="${escapeDoubleQuotes(title)}"`);
  }
  if (dimensions.length) {
    attributes = attributes.concat(dimensions);
  }
  return "<img " + attributes.join(" ") + ">";
}
const defaultMarkedRenderers = Object.freeze({
  image: renderImage,
  paragraph({ tokens }) {
    return `<p>${this.parser.parseInline(tokens)}</p>`;
  },
  link({ href, title, tokens }) {
    let text = this.parser.parseInline(tokens);
    if (typeof href !== "string") {
      return "";
    }
    if (href === text) {
      text = removeMarkdownEscapes(text);
    }
    title = typeof title === "string" ? escapeDoubleQuotes(removeMarkdownEscapes(title)) : "";
    href = removeMarkdownEscapes(href);
    if (!title && href.startsWith(`${Schemas.file}:`)) {
      title = getLinkTitle(href);
    }
    const isCommandUri = href.startsWith(`${Schemas.command}:`);
    href = href.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const effectiveTitle = title || (isCommandUri ? "" : href);
    return `<a href="${href}" title="${effectiveTitle}" draggable="false">${text}</a>`;
  }
});
function createAlertBlockquoteRenderer(fallbackRenderer) {
  return function(token) {
    const { tokens } = token;
    const firstToken = tokens[0];
    if (firstToken?.type !== "paragraph") {
      return fallbackRenderer.call(this, token);
    }
    const paragraphTokens = firstToken.tokens;
    if (!paragraphTokens || paragraphTokens.length === 0) {
      return fallbackRenderer.call(this, token);
    }
    const firstTextToken = paragraphTokens[0];
    if (firstTextToken?.type !== "text") {
      return fallbackRenderer.call(this, token);
    }
    const pattern = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*?\n*/i;
    const match = firstTextToken.raw.match(pattern);
    if (!match) {
      return fallbackRenderer.call(this, token);
    }
    firstTextToken.raw = firstTextToken.raw.replace(pattern, "");
    firstTextToken.text = firstTextToken.text.replace(pattern, "");
    const alertIcons = {
      "note": "info",
      "tip": "light-bulb",
      "important": "comment",
      "warning": "alert",
      "caution": "stop"
    };
    const type = match[1];
    const typeCapitalized = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    const severity = type.toLowerCase();
    const iconHtml = renderIcon({ id: alertIcons[severity] }).outerHTML;
    const content = this.parser.parse(tokens);
    return `<blockquote data-severity="${severity}"><p><span>${iconHtml}${typeCapitalized}</span>${content.substring(3)}</blockquote>
`;
  };
}
function renderMarkdown(markdown, options = {}, target) {
  const disposables = new DisposableStore();
  let isDisposed = false;
  const markedInstance = new marked.Marked(...options.markedExtensions ?? []);
  const { renderer, codeBlocks, syncCodeBlocks } = createMarkdownRenderer(markedInstance, options, markdown);
  const value = preprocessMarkdownString(markdown);
  let renderedMarkdown;
  if (options.fillInIncompleteTokens) {
    const opts = {
      ...markedInstance.defaults,
      ...options.markedOptions,
      renderer
    };
    const tokens = markedInstance.lexer(value, opts);
    const newTokens = fillInIncompleteTokens(tokens);
    renderedMarkdown = markedInstance.parser(newTokens, opts);
  } else {
    renderedMarkdown = markedInstance.parse(value, { ...options?.markedOptions, renderer, async: false });
  }
  if (markdown.supportThemeIcons) {
    const elements = renderLabelWithIcons(renderedMarkdown);
    renderedMarkdown = elements.map((e) => typeof e === "string" ? e : e.outerHTML).join("");
  }
  const renderedContent = document.createElement("div");
  const sanitizerConfig = getDomSanitizerConfig(markdown, options.sanitizerConfig ?? {});
  domSanitize.safeSetInnerHtml(renderedContent, renderedMarkdown, sanitizerConfig);
  rewriteRenderedLinks(markdown, options, renderedContent);
  let outElement;
  if (target) {
    outElement = target;
    DOM.reset(target, ...renderedContent.childNodes);
  } else {
    outElement = renderedContent;
  }
  if (codeBlocks.length > 0) {
    Promise.all(codeBlocks).then((tuples) => {
      if (isDisposed) {
        return;
      }
      const renderedElements = new Map(tuples);
      const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
      for (const placeholderElement of placeholderElements) {
        const renderedElement = renderedElements.get(placeholderElement.dataset["code"] ?? "");
        if (renderedElement) {
          DOM.reset(placeholderElement, renderedElement);
        }
      }
      options.asyncRenderCallback?.();
    });
  } else if (syncCodeBlocks.length > 0) {
    const renderedElements = new Map(syncCodeBlocks);
    const placeholderElements = outElement.querySelectorAll(`div[data-code]`);
    for (const placeholderElement of placeholderElements) {
      const renderedElement = renderedElements.get(placeholderElement.dataset["code"] ?? "");
      if (renderedElement) {
        DOM.reset(placeholderElement, renderedElement);
      }
    }
  }
  if (options.asyncRenderCallback) {
    for (const img of outElement.getElementsByTagName("img")) {
      const listener = disposables.add(DOM.addDisposableListener(img, "load", () => {
        listener.dispose();
        options.asyncRenderCallback();
      }));
    }
  }
  if (options.actionHandler) {
    const clickCb = (e) => {
      const mouseEvent = new StandardMouseEvent(DOM.getWindow(outElement), e);
      if (!mouseEvent.leftButton && !mouseEvent.middleButton) {
        return;
      }
      activateLink(markdown, options, mouseEvent);
    };
    disposables.add(DOM.addDisposableListener(outElement, "click", clickCb));
    disposables.add(DOM.addDisposableListener(outElement, "auxclick", clickCb));
    disposables.add(DOM.addDisposableListener(outElement, "keydown", (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (!keyboardEvent.equals(KeyCode.Space) && !keyboardEvent.equals(KeyCode.Enter)) {
        return;
      }
      activateLink(markdown, options, keyboardEvent);
    }));
  }
  for (const input of [...outElement.getElementsByTagName("input")]) {
    if (input.attributes.getNamedItem("type")?.value === "checkbox") {
      input.setAttribute("disabled", "");
    } else {
      if (options.sanitizerConfig?.replaceWithPlaintext) {
        const replacement = convertTagToPlaintext(input);
        if (replacement) {
          input.parentElement?.replaceChild(replacement, input);
        } else {
          input.remove();
        }
      } else {
        input.remove();
      }
    }
  }
  return {
    element: outElement,
    dispose: () => {
      isDisposed = true;
      disposables.dispose();
    }
  };
}
function rewriteRenderedLinks(markdown, options, root) {
  for (const el of root.querySelectorAll("img, audio, video, source")) {
    const src = el.getAttribute("src");
    if (src) {
      let href = src;
      try {
        if (markdown.baseUri) {
          href = resolveWithBaseUri(URI.from(markdown.baseUri), href);
        }
      } catch (err) {
      }
      el.setAttribute("src", massageHref(markdown, href, true));
      if (options.sanitizerConfig?.remoteImageIsAllowed) {
        const uri = URI.parse(href);
        if (uri.scheme !== Schemas.file && uri.scheme !== Schemas.data && !options.sanitizerConfig.remoteImageIsAllowed(uri)) {
          el.replaceWith(DOM.$("", void 0, el.outerHTML));
        }
      }
    }
  }
  for (const el of root.querySelectorAll("a")) {
    const href = el.getAttribute("href");
    el.setAttribute("href", "");
    if (!href || /^data:|javascript:/i.test(href) || /^command:/i.test(href) && !markdown.isTrusted || /^command:(\/\/\/)?_workbench\.downloadResource/i.test(href)) {
      el.replaceWith(...el.childNodes);
    } else {
      let resolvedHref = massageHref(markdown, href, false);
      if (markdown.baseUri) {
        resolvedHref = resolveWithBaseUri(URI.from(markdown.baseUri), href);
      }
      el.dataset.href = resolvedHref;
      if (options.actionHandler && isPortableLinkTarget(resolvedHref)) {
        el.setAttribute("href", resolvedHref);
      }
    }
  }
}
function createMarkdownRenderer(marked2, options, markdown) {
  const renderer = new marked2.Renderer(options.markedOptions);
  renderer.image = (token) => renderImage(token, (href) => options.transformUri?.(href, "image") ?? href);
  renderer.link = (token) => defaultMarkedRenderers.link.call(renderer, {
    ...token,
    href: options.transformUri?.(token.href, "link") ?? token.href
  });
  renderer.paragraph = defaultMarkedRenderers.paragraph;
  if (markdown.supportAlertSyntax) {
    renderer.blockquote = createAlertBlockquoteRenderer(renderer.blockquote);
  }
  const codeBlocks = [];
  const syncCodeBlocks = [];
  if (options.codeBlockRendererSync) {
    renderer.code = ({ text, lang, raw }) => {
      const id = defaultGenerator.nextId();
      const value = options.codeBlockRendererSync(postProcessCodeBlockLanguageId(lang), text, raw);
      syncCodeBlocks.push([id, value]);
      return `<div class="code" data-code="${id}">${escape(text)}</div>`;
    };
  } else if (options.codeBlockRenderer) {
    renderer.code = ({ text, lang }) => {
      const id = defaultGenerator.nextId();
      const value = options.codeBlockRenderer(postProcessCodeBlockLanguageId(lang), text);
      codeBlocks.push(value.then((element) => [id, element]));
      return `<div class="code" data-code="${id}">${escape(text)}</div>`;
    };
  }
  if (!markdown.supportHtml) {
    renderer.html = ({ text }) => {
      if (options.sanitizerConfig?.replaceWithPlaintext) {
        return escape(text);
      }
      const match = markdown.isTrusted ? text.match(/^(<span[^>]+>)|(<\/\s*span>)$/) : void 0;
      return match ? text : "";
    };
  }
  return { renderer, codeBlocks, syncCodeBlocks };
}
function preprocessMarkdownString(markdown) {
  let value = markdown.value;
  if (value.length > 1e5) {
    value = `${value.substr(0, 1e5)}\u2026`;
  }
  if (markdown.supportThemeIcons) {
    value = markdownEscapeEscapedIcons(value);
  }
  return value;
}
function activateLink(mdStr, options, event) {
  const target = event.target.closest("a[data-href]");
  if (!DOM.isHTMLElement(target)) {
    return;
  }
  try {
    let href = target.dataset["href"];
    if (href) {
      if (mdStr.baseUri) {
        href = resolveWithBaseUri(URI.from(mdStr.baseUri), href);
      }
      options.actionHandler?.(href, mdStr);
    }
  } catch (err) {
    onUnexpectedError(err);
  } finally {
    event.preventDefault();
    event.stopPropagation();
  }
}
function uriMassage(markdown, part) {
  let data;
  try {
    data = parse(decodeURIComponent(part));
  } catch (e) {
  }
  if (!data) {
    return part;
  }
  data = cloneAndChange(data, (value) => {
    if (markdown.uris && markdown.uris[value]) {
      return URI.revive(markdown.uris[value]);
    } else {
      return void 0;
    }
  });
  return encodeURIComponent(JSON.stringify(data));
}
function massageHref(markdown, href, isDomUri) {
  const data = markdown.uris && markdown.uris[href];
  let uri = URI.revive(data);
  if (isDomUri) {
    if (href.startsWith(Schemas.data + ":")) {
      return href;
    }
    if (!uri) {
      uri = URI.parse(href);
    }
    return FileAccess.uriToBrowserUri(uri).toString(true);
  }
  if (!uri) {
    return href;
  }
  if (URI.parse(href).toString() === uri.toString()) {
    return href;
  }
  if (uri.query) {
    uri = uri.with({ query: uriMassage(markdown, uri.query) });
  }
  return uri.toString();
}
function postProcessCodeBlockLanguageId(lang) {
  if (!lang) {
    return "";
  }
  const parts = lang.split(/[\s+|:|,|\{|\?]/, 1);
  if (parts.length) {
    return parts[0];
  }
  return lang;
}
function resolveWithBaseUri(baseUri, href) {
  const hasScheme = /^\w[\w\d+.-]*:/.test(href);
  if (hasScheme) {
    return href;
  }
  if (baseUri.path.endsWith("/")) {
    return resolvePath(baseUri, href).toString();
  } else {
    return resolvePath(dirname(baseUri), href).toString();
  }
}
function sanitizeRenderedMarkdown(renderedMarkdown, originalMdStrConfig, options = {}) {
  const sanitizerConfig = getDomSanitizerConfig(originalMdStrConfig, options);
  return domSanitize.sanitizeHtml(renderedMarkdown, sanitizerConfig);
}
const allowedMarkdownHtmlTags = Object.freeze([
  ...domSanitize.basicMarkupHtmlTags,
  "input"
  // Allow inputs for rendering checkboxes. Other types of inputs are removed and the inputs are always disabled
]);
const allowedMarkdownHtmlAttributes = Object.freeze([
  "align",
  "autoplay",
  "alt",
  "colspan",
  "controls",
  "draggable",
  "height",
  "href",
  "loop",
  "muted",
  "playsinline",
  "poster",
  "rowspan",
  "src",
  "target",
  "title",
  "type",
  "width",
  "start",
  // Input (For disabled inputs)
  "checked",
  "disabled",
  "value",
  // Custom markdown attributes
  "data-code",
  "data-href",
  "data-severity",
  // Only allow very specific styles
  {
    attributeName: "style",
    shouldKeep: (element, data) => {
      if (element.tagName === "SPAN") {
        if (data.attrName === "style") {
          return /^(color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(background-color\:(#[0-9a-fA-F]+|var\(--vscode(-[a-zA-Z0-9]+)+\));)?(border-radius:[0-9]+px;)?$/.test(data.attrValue);
        }
      }
      return false;
    }
  },
  // Only allow codicons for classes
  {
    attributeName: "class",
    shouldKeep: (element, data) => {
      if (element.tagName === "SPAN") {
        if (data.attrName === "class") {
          return /^codicon codicon-[a-z\-]+( codicon-modifier-[a-z\-]+)?$/.test(data.attrValue);
        }
      }
      return false;
    }
  }
]);
function getDomSanitizerConfig(mdStrConfig, options) {
  const isTrusted = mdStrConfig.isTrusted ?? false;
  const allowedLinkSchemes = [
    Schemas.http,
    Schemas.https,
    Schemas.mailto,
    Schemas.file,
    Schemas.vscodeFileResource,
    Schemas.vscodeRemote,
    Schemas.vscodeRemoteResource,
    Schemas.vscodeNotebookCell,
    // For links that are handled entirely by the action handler
    Schemas.internal
  ];
  if (isTrusted) {
    allowedLinkSchemes.push(Schemas.command);
  }
  if (options.allowedLinkSchemes?.augment) {
    allowedLinkSchemes.push(...options.allowedLinkSchemes.augment);
  }
  return {
    // allowedTags should included everything that markdown renders to.
    // Since we have our own sanitize function for marked, it's possible we missed some tag so let dompurify make sure.
    // HTML tags that can result from markdown are from reading https://spec.commonmark.org/0.29/
    // HTML table tags that can result from markdown are from https://github.github.com/gfm/#tables-extension-
    allowedTags: {
      override: options.allowedTags?.override ?? allowedMarkdownHtmlTags
    },
    allowedAttributes: {
      override: options.allowedAttributes?.override ?? allowedMarkdownHtmlAttributes
    },
    allowedLinkProtocols: {
      override: allowedLinkSchemes
    },
    allowRelativeLinkPaths: !!mdStrConfig.baseUri,
    allowedMediaProtocols: {
      override: [
        Schemas.http,
        Schemas.https,
        Schemas.data,
        Schemas.file,
        Schemas.vscodeFileResource,
        Schemas.vscodeRemote,
        Schemas.vscodeRemoteResource
      ]
    },
    allowRelativeMediaPaths: !!mdStrConfig.baseUri,
    replaceWithPlaintext: options.replaceWithPlaintext
  };
}
function renderAsPlaintext(str, options) {
  if (typeof str === "string") {
    return str;
  }
  let value = str.value ?? "";
  if (value.length > 1e5) {
    value = `${value.substr(0, 1e5)}\u2026`;
  }
  const renderer = createPlainTextRenderer();
  if (options?.includeCodeBlocksFences) {
    renderer.code = codeBlockFences;
  }
  if (options?.useLinkFormatter) {
    renderer.link = linkFormatter;
  }
  const html = marked.parse(value, { async: false, renderer });
  return sanitizeRenderedMarkdown(html, { isTrusted: false }, {}).toString().replace(/&(#\d+|[a-zA-Z]+);/g, (m) => unescapeInfo.get(m) ?? m).trim();
}
const unescapeInfo = /* @__PURE__ */ new Map([
  ["&quot;", '"'],
  ["&nbsp;", " "],
  ["&amp;", "&"],
  ["&#39;", "'"],
  ["&lt;", "<"],
  ["&gt;", ">"]
]);
function createPlainTextRenderer() {
  const renderer = new marked.Renderer();
  renderer.code = ({ text }) => {
    return escape(text);
  };
  renderer.blockquote = ({ text }) => {
    return text + "\n";
  };
  renderer.html = (_) => {
    return "";
  };
  renderer.heading = function({ tokens }) {
    return this.parser.parseInline(tokens) + "\n";
  };
  renderer.hr = () => {
    return "";
  };
  renderer.list = function({ items }) {
    return items.map((x) => this.listitem(x)).join("\n") + "\n";
  };
  renderer.listitem = ({ text }) => {
    return text + "\n";
  };
  renderer.paragraph = function({ tokens }) {
    return this.parser.parseInline(tokens) + "\n";
  };
  renderer.table = function({ header, rows }) {
    return header.map((cell) => this.tablecell(cell)).join(" ") + "\n" + rows.map((cells) => cells.map((cell) => this.tablecell(cell)).join(" ")).join("\n") + "\n";
  };
  renderer.tablerow = ({ text }) => {
    return text;
  };
  renderer.tablecell = function({ tokens }) {
    return this.parser.parseInline(tokens);
  };
  renderer.strong = ({ text }) => {
    return text;
  };
  renderer.em = ({ text }) => {
    return text;
  };
  renderer.codespan = ({ text }) => {
    return text;
  };
  renderer.br = (_) => {
    return "\n";
  };
  renderer.del = ({ text }) => {
    return text;
  };
  renderer.image = (_) => {
    return "";
  };
  renderer.text = ({ text }) => {
    return text;
  };
  renderer.link = ({ text }) => {
    return text;
  };
  return renderer;
}
const codeBlockFences = ({ text }) => {
  return `
\`\`\`
${escape(text)}
\`\`\`
`;
};
const linkFormatter = ({ text, href }) => {
  try {
    if (href) {
      const uri = URI.parse(href);
      return text.trim() || basename(uri);
    }
  } catch (e) {
    return text.trim() || pathBasename(href);
  }
  return text;
};
function mergeRawTokenText(tokens) {
  let mergedTokenText = "";
  tokens.forEach((token) => {
    mergedTokenText += token.raw;
  });
  return mergedTokenText;
}
function completeSingleLinePattern(token) {
  if (!token.tokens) {
    return void 0;
  }
  for (let i = token.tokens.length - 1; i >= 0; i--) {
    const subtoken = token.tokens[i];
    if (subtoken.type === "text") {
      const lines = subtoken.raw.split("\n");
      const lastLine = lines[lines.length - 1];
      if (
        // Text with start of link target
        hasLinkTextAndStartOfLinkTarget(lastLine) || // This token doesn't have the link text, eg if it contains other markdown constructs that are in other subtokens.
        // But some preceding token does have an unbalanced [ at least
        hasStartOfLinkTargetAndNoLinkText(lastLine) && token.tokens.slice(0, i).some((t) => t.type === "text" && t.raw.match(/\[[^\]]*$/))
      ) {
        const nextTwoSubTokens = token.tokens.slice(i + 1);
        if (
          // If the link was parsed as a link, then look for a link token and a text token with a quote
          nextTwoSubTokens[0]?.type === "link" && nextTwoSubTokens[1]?.type === "text" && nextTwoSubTokens[1].raw.match(/^ *"[^"]*$/) || // And if the link was not parsed as a link (eg command link), just look for a single quote in this token
          lastLine.match(/^[^"]* +"[^"]*$/)
        ) {
          return completeLinkTargetArg(token);
        }
        return completeLinkTarget(token);
      } else if (lastLine.includes("`")) {
        return completeCodespan(token);
      } else if (lastLine.includes("**")) {
        return completeDoublestar(token);
      } else if (lastLine.match(/\*\w/)) {
        return completeStar(token);
      } else if (lastLine.match(/(^|\s)__\w/)) {
        return completeDoubleUnderscore(token);
      } else if (lastLine.match(/(^|\s)_\w/)) {
        return completeUnderscore(token);
      } else if (lastLine.match(/(^|\s)\[\w*[^\]]*$/)) {
        return completeLinkText(token);
      }
    }
  }
  return void 0;
}
function hasLinkTextAndStartOfLinkTarget(str) {
  return !!str.match(/(?:^|[\s(*_~])\[.*\]\(\w*/);
}
function hasStartOfLinkTargetAndNoLinkText(str) {
  return !!str.match(/^[^\[]*\]\([^\)]*$/);
}
function completeBlockquotePattern(blockquote, links) {
  let lastInterestingIndex = blockquote.tokens.length - 1;
  while (lastInterestingIndex >= 0 && blockquote.tokens[lastInterestingIndex].type === "space") {
    lastInterestingIndex--;
  }
  const lastToken = blockquote.tokens[lastInterestingIndex];
  if (lastToken?.type !== "paragraph") {
    return void 0;
  }
  const completedToken = completeSingleLinePattern(lastToken);
  if (!completedToken) {
    return void 0;
  }
  const completion = completedToken.raw.slice(lastToken.raw.trimEnd().length);
  const trailingQuoteOnlyLines = blockquote.raw.match(/(?:\n[ \t]*>[ \t]*(?=\n|$))+\n?$/)?.[0] ?? "";
  const insertionIndex = blockquote.raw.length - trailingQuoteOnlyLines.length;
  const completedRaw = blockquote.raw.slice(0, insertionIndex) + completion + trailingQuoteOnlyLines;
  const lexer = new marked.Lexer();
  lexer.tokens.links = links;
  const completedBlockquote = lexer.lex(completedRaw)[0];
  if (completedBlockquote.type === "blockquote") {
    return completedBlockquote;
  }
  return void 0;
}
function completeListItemPattern(list) {
  const lastListItem = list.items[list.items.length - 1];
  const lastListSubToken = lastListItem.tokens ? lastListItem.tokens[lastListItem.tokens.length - 1] : void 0;
  const listEndsInHeading = (list2) => {
    const lastItem = list2.items.at(-1);
    const lastToken = lastItem?.tokens.at(-1);
    return lastToken?.type === "heading" || lastToken?.type === "list" && listEndsInHeading(lastToken);
  };
  let newToken;
  if (lastListSubToken?.type === "text" && !("inRawBlock" in lastListItem)) {
    newToken = completeSingleLinePattern(lastListSubToken);
  } else if (listEndsInHeading(list)) {
    const newList2 = marked.lexer(list.raw.trim() + " &nbsp;")[0];
    if (newList2.type !== "list") {
      return;
    }
    return newList2;
  }
  if (!newToken || newToken.type !== "paragraph") {
    return;
  }
  const previousListItemsText = mergeRawTokenText(list.items.slice(0, -1));
  const lastListItemLead = lastListItem.raw.match(/^(\s*(-|\d+\.|\*) +)/)?.[0];
  if (!lastListItemLead) {
    return;
  }
  const newListItemText = lastListItemLead + mergeRawTokenText(lastListItem.tokens.slice(0, -1)) + newToken.raw;
  const newList = marked.lexer(previousListItemsText + newListItemText)[0];
  if (newList.type !== "list") {
    return;
  }
  return newList;
}
function completeHeading(token, fullRawText) {
  if (token.raw.match(/-\s*$/)) {
    return marked.lexer(fullRawText + " &nbsp;");
  }
}
const maxIncompleteTokensFixRounds = 3;
function fillInIncompleteTokens(tokens) {
  for (let i = 0; i < maxIncompleteTokensFixRounds; i++) {
    const newTokens = fillInIncompleteTokensOnce(tokens);
    if (newTokens) {
      tokens = newTokens;
    } else {
      break;
    }
  }
  return tokens;
}
function fillInIncompleteTokensOnce(tokens) {
  let i;
  let newTokens;
  for (i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "paragraph" && token.raw.match(/(\n|^)\|/)) {
      newTokens = completeTable(tokens.slice(i));
      break;
    }
  }
  let lastInterestingIdx = tokens.length - 1;
  while (lastInterestingIdx >= 0 && (tokens[lastInterestingIdx].type === "space" || tokens[lastInterestingIdx].type === "html")) {
    lastInterestingIdx--;
  }
  const lastInterestingToken = lastInterestingIdx >= 0 ? tokens[lastInterestingIdx] : void 0;
  const trailingTokens = tokens.slice(lastInterestingIdx + 1);
  if (!newTokens && lastInterestingToken?.type === "list") {
    const newListToken = completeListItemPattern(lastInterestingToken);
    if (newListToken) {
      newTokens = [newListToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (!newTokens && lastInterestingToken?.type === "blockquote") {
    const newBlockquoteToken = completeBlockquotePattern(lastInterestingToken, tokens.links);
    if (newBlockquoteToken) {
      newTokens = [newBlockquoteToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (!newTokens && lastInterestingToken?.type === "paragraph") {
    const newToken = completeSingleLinePattern(lastInterestingToken);
    if (newToken) {
      newTokens = [newToken, ...trailingTokens];
      i = lastInterestingIdx;
    }
  }
  if (newTokens) {
    const newTokensList = [
      ...tokens.slice(0, i),
      ...newTokens
    ];
    newTokensList.links = tokens.links;
    return newTokensList;
  }
  const lastToken = tokens.at(-1);
  if (lastToken?.type === "heading") {
    const completeTokens = completeHeading(lastToken, mergeRawTokenText(tokens));
    if (completeTokens) {
      return completeTokens;
    }
  }
  return null;
}
function completeCodespan(token) {
  return completeWithString(token, "`");
}
function completeStar(tokens) {
  return completeWithString(tokens, "*");
}
function completeUnderscore(tokens) {
  return completeWithString(tokens, "_");
}
function completeLinkTarget(tokens) {
  return completeWithString(tokens, ")", false);
}
function completeLinkTargetArg(tokens) {
  return completeWithString(tokens, '")', false);
}
function completeLinkText(tokens) {
  return completeWithString(tokens, "](https://microsoft.com)", false);
}
function completeDoublestar(tokens) {
  return completeWithString(tokens, "**");
}
function completeDoubleUnderscore(tokens) {
  return completeWithString(tokens, "__");
}
function completeWithString(tokens, closingString, shouldTrim = true) {
  const mergedRawText = mergeRawTokenText(Array.isArray(tokens) ? tokens : [tokens]);
  const trimmedRawText = shouldTrim ? mergedRawText.trimEnd() : mergedRawText;
  return marked.lexer(trimmedRawText + closingString)[0];
}
function completeTable(tokens) {
  const mergedRawText = mergeRawTokenText(tokens);
  const lines = mergedRawText.split("\n");
  let numCols;
  let hasSeparatorRow = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (typeof numCols === "undefined" && line.match(/^\s*\|/)) {
      const line1Matches = line.match(/(\|[^\|]+)(?=\||$)/g);
      if (line1Matches) {
        numCols = line1Matches.length;
      }
    } else if (typeof numCols === "number") {
      if (line.match(/^\s*\|/)) {
        if (i !== lines.length - 1) {
          return void 0;
        }
        hasSeparatorRow = true;
      } else {
        return void 0;
      }
    }
  }
  if (typeof numCols === "number" && numCols > 0) {
    const prefixText = hasSeparatorRow ? lines.slice(0, -1).join("\n") : mergedRawText;
    const line1EndsInPipe = !!prefixText.match(/\|\s*$/);
    const newRawText = prefixText + (line1EndsInPipe ? "" : "|") + `
|${" --- |".repeat(numCols)}`;
    return marked.lexer(newRawText);
  }
  return void 0;
}
export {
  allowedMarkdownHtmlAttributes,
  allowedMarkdownHtmlTags,
  fillInIncompleteTokens,
  renderAsPlaintext,
  renderMarkdown
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFxtYXJrZG93blJlbmRlcmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGVzY2FwZURvdWJsZVF1b3RlcywgSU1hcmtkb3duU3RyaW5nLCBpc1BvcnRhYmxlTGlua1RhcmdldCwgTWFya2Rvd25TdHJpbmdUcnVzdGVkT3B0aW9ucywgcGFyc2VIcmVmQW5kRGltZW5zaW9ucywgcmVtb3ZlTWFya2Rvd25Fc2NhcGVzIH0gZnJvbSAnLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IG1hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zIH0gZnJvbSAnLi4vY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEdlbmVyYXRvciB9IGZyb20gJy4uL2NvbW1vbi9pZEdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi9jb21tb24vbWFya2VkL21hcmtlZC5qcyc7XG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSBhcyBwYXRoQmFzZW5hbWUgfSBmcm9tICcuLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgcmVzb2x2ZVBhdGggfSBmcm9tICcuLi9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGVzY2FwZSB9IGZyb20gJy4uL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4vZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVNhbml0aXplIGZyb20gJy4vZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgY29udmVydFRhZ1RvUGxhaW50ZXh0IH0gZnJvbSAnLi9kb21TYW5pdGl6ZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24sIHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5cbmV4cG9ydCB0eXBlIE1hcmtkb3duQWN0aW9uSGFuZGxlciA9IChsaW5rQ29udGVudDogc3RyaW5nLCBtZFN0cjogSU1hcmtkb3duU3RyaW5nKSA9PiB2b2lkO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHRoZSByZW5kZXJpbmcgb2YgbWFya2Rvd24gd2l0aCB7QGxpbmsgcmVuZGVyTWFya2Rvd259LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIE1hcmtkb3duUmVuZGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNvZGVCbG9ja1JlbmRlcmVyPzogKGxhbmd1YWdlSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZykgPT4gUHJvbWlzZTxIVE1MRWxlbWVudD47XG5cdHJlYWRvbmx5IGNvZGVCbG9ja1JlbmRlcmVyU3luYz86IChsYW5ndWFnZUlkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHJhdz86IHN0cmluZykgPT4gSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFzeW5jUmVuZGVyQ2FsbGJhY2s/OiAoKSA9PiB2b2lkO1xuXG5cdHJlYWRvbmx5IGFjdGlvbkhhbmRsZXI/OiBNYXJrZG93bkFjdGlvbkhhbmRsZXI7XG5cblx0LyoqIFJld3JpdGVzIHBhcnNlZCBNYXJrZG93biBsaW5rIGFuZCBpbWFnZSBkZXN0aW5hdGlvbnMgYmVmb3JlIHNhbml0aXphdGlvbi4gKi9cblx0cmVhZG9ubHkgdHJhbnNmb3JtVXJpPzogKGhyZWY6IHN0cmluZywga2luZDogJ2xpbmsnIHwgJ2ltYWdlJykgPT4gc3RyaW5nO1xuXG5cdHJlYWRvbmx5IGZpbGxJbkluY29tcGxldGVUb2tlbnM/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IHNhbml0aXplckNvbmZpZz86IE1hcmtkb3duU2FuaXRpemVyQ29uZmlnO1xuXG5cdHJlYWRvbmx5IG1hcmtlZE9wdGlvbnM/OiBNYXJrZG93blJlbmRlcmVyTWFya2VkT3B0aW9ucztcblx0cmVhZG9ubHkgbWFya2VkRXh0ZW5zaW9ucz86IG1hcmtlZC5NYXJrZWRFeHRlbnNpb25bXTtcbn1cblxuLyoqXG4gKiBTdWJzZXQgb2Ygb3B0aW9ucyBwYXNzZWQgdG8gYE1hcmtlZGAgZm9yIHJlbmRlcmluZyBtYXJrZG93bi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBNYXJrZG93blJlbmRlcmVyTWFya2VkT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGdmbT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGJyZWFrcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTWFya2Rvd25TYW5pdGl6ZXJDb25maWcge1xuXHRyZWFkb25seSByZXBsYWNlV2l0aFBsYWludGV4dD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFsbG93ZWRUYWdzPzoge1xuXHRcdHJlYWRvbmx5IG92ZXJyaWRlOiByZWFkb25seSBzdHJpbmdbXTtcblx0fTtcblx0cmVhZG9ubHkgYWxsb3dlZEF0dHJpYnV0ZXM/OiB7XG5cdFx0cmVhZG9ubHkgb3ZlcnJpZGU6IFJlYWRvbmx5QXJyYXk8c3RyaW5nIHwgZG9tU2FuaXRpemUuU2FuaXRpemVBdHRyaWJ1dGVSdWxlPjtcblx0fTtcblx0cmVhZG9ubHkgYWxsb3dlZExpbmtTY2hlbWVzPzoge1xuXHRcdHJlYWRvbmx5IGF1Z21lbnQ6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR9O1xuXHRyZWFkb25seSByZW1vdGVJbWFnZUlzQWxsb3dlZD86ICh1cmk6IFVSSSkgPT4gYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgaHVtYW4tcmVhZGFibGUgdG9vbHRpcCBzdHJpbmcgZm9yIGEgbGluayBocmVmLlxuICogRm9yIGZpbGU6Ly8gVVJJcywgY29udmVydHMgdG8gYSBkZWNvZGVkIE9TIGZpbGUgc3lzdGVtIHBhdGggdG8gYXZvaWRcbiAqIHNob3dpbmcgcmF3IFVSTC1lbmNvZGVkIHBhdGhzIChlLmcuIFwiQzpcXFVzZXJzXFwuLi5cIiBpbnN0ZWFkIG9mIFwiZmlsZTovLy9jJTNBL1VzZXJzLy4uLlwiKS5cbiAqL1xuZnVuY3Rpb24gZ2V0TGlua1RpdGxlKGhyZWY6IHN0cmluZyk6IHN0cmluZyB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKGhyZWYpO1xuXHRcdGlmIChwYXJzZWQuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGNvbnN0IHBhdGggPSBwYXJzZWQuZnNQYXRoO1xuXHRcdFx0Y29uc3QgZnJhZ21lbnQgPSBwYXJzZWQuZnJhZ21lbnQ7XG5cdFx0XHRyZXR1cm4gZXNjYXBlRG91YmxlUXVvdGVzKGZyYWdtZW50ID8gYCR7cGF0aH0jJHtmcmFnbWVudH1gIDogcGF0aCk7XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHQvLyBmYWxsIHRocm91Z2hcblx0fVxuXHRyZXR1cm4gJyc7XG59XG5cbmZ1bmN0aW9uIHJlbmRlckltYWdlKHsgaHJlZiwgdGl0bGUsIHRleHQgfTogbWFya2VkLlRva2Vucy5JbWFnZSwgdHJhbnNmb3JtVXJpPzogKGhyZWY6IHN0cmluZykgPT4gc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGRpbWVuc2lvbnM6IHN0cmluZ1tdID0gW107XG5cdGxldCBhdHRyaWJ1dGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAoaHJlZikge1xuXHRcdCh7IGhyZWYsIGRpbWVuc2lvbnMgfSA9IHBhcnNlSHJlZkFuZERpbWVuc2lvbnMoaHJlZikpO1xuXHRcdGhyZWYgPSB0cmFuc2Zvcm1Vcmk/LihocmVmKSA/PyBocmVmO1xuXHRcdGF0dHJpYnV0ZXMucHVzaChgc3JjPVwiJHtlc2NhcGVEb3VibGVRdW90ZXMoaHJlZil9XCJgKTtcblx0fVxuXHRpZiAodGV4dCkge1xuXHRcdGF0dHJpYnV0ZXMucHVzaChgYWx0PVwiJHtlc2NhcGVEb3VibGVRdW90ZXModGV4dCl9XCJgKTtcblx0fVxuXHRpZiAodGl0bGUpIHtcblx0XHRhdHRyaWJ1dGVzLnB1c2goYHRpdGxlPVwiJHtlc2NhcGVEb3VibGVRdW90ZXModGl0bGUpfVwiYCk7XG5cdH1cblx0aWYgKGRpbWVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0YXR0cmlidXRlcyA9IGF0dHJpYnV0ZXMuY29uY2F0KGRpbWVuc2lvbnMpO1xuXHR9XG5cdHJldHVybiAnPGltZyAnICsgYXR0cmlidXRlcy5qb2luKCcgJykgKyAnPic7XG59XG5cbmNvbnN0IGRlZmF1bHRNYXJrZWRSZW5kZXJlcnMgPSBPYmplY3QuZnJlZXplKHtcblx0aW1hZ2U6IHJlbmRlckltYWdlLFxuXHRwYXJhZ3JhcGgodGhpczogbWFya2VkLlJlbmRlcmVyLCB7IHRva2VucyB9OiBtYXJrZWQuVG9rZW5zLlBhcmFncmFwaCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGA8cD4ke3RoaXMucGFyc2VyLnBhcnNlSW5saW5lKHRva2Vucyl9PC9wPmA7XG5cdH0sXG5cblx0bGluayh0aGlzOiBtYXJrZWQuUmVuZGVyZXIsIHsgaHJlZiwgdGl0bGUsIHRva2VucyB9OiBtYXJrZWQuVG9rZW5zLkxpbmspOiBzdHJpbmcge1xuXHRcdGxldCB0ZXh0ID0gdGhpcy5wYXJzZXIucGFyc2VJbmxpbmUodG9rZW5zKTtcblx0XHRpZiAodHlwZW9mIGhyZWYgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIG1hcmtkb3duIGVzY2FwZXMuIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9jaGpqL21hcmtlZC9pc3N1ZXMvODI5XG5cdFx0aWYgKGhyZWYgPT09IHRleHQpIHsgLy8gcmF3IGxpbmsgY2FzZVxuXHRcdFx0dGV4dCA9IHJlbW92ZU1hcmtkb3duRXNjYXBlcyh0ZXh0KTtcblx0XHR9XG5cblx0XHR0aXRsZSA9IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyBlc2NhcGVEb3VibGVRdW90ZXMocmVtb3ZlTWFya2Rvd25Fc2NhcGVzKHRpdGxlKSkgOiAnJztcblx0XHRocmVmID0gcmVtb3ZlTWFya2Rvd25Fc2NhcGVzKGhyZWYpO1xuXG5cdFx0Ly8gRm9yIGZpbGU6Ly8gVVJJcyB3aXRob3V0IGFuIGV4cGxpY2l0IHRpdGxlLCBzaG93IHRoZSBkZWNvZGVkIE9TIHBhdGggaW5zdGVhZCBvZlxuXHRcdC8vIHRoZSByYXcgVVJMLWVuY29kZWQgVVJJIChlLmcuIGRpc3BsYXkgXCJDOlxcVXNlcnNcXC4uLlwiIGluc3RlYWQgb2YgXCJmaWxlOi8vL2MlM0EvVXNlcnMvLi4uXCIpXG5cdFx0aWYgKCF0aXRsZSAmJiBocmVmLnN0YXJ0c1dpdGgoYCR7U2NoZW1hcy5maWxlfTpgKSkge1xuXHRcdFx0dGl0bGUgPSBnZXRMaW5rVGl0bGUoaHJlZik7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGNvbW1hbmQ6IFVSSXMgd2l0aG91dCBhbiBleHBsaWNpdCB0aXRsZSwgYXZvaWQgZXhwb3NpbmcgdGhlIHJhd1xuXHRcdC8vIGNvbW1hbmQgc3RyaW5nIGFzIGEgdGl0bGUvdG9vbHRpcCBcdTIwMTQgc2NyZWVuIHJlYWRlcnMgYW5ub3VuY2UgaXQgYXNcblx0XHQvLyByZWR1bmRhbnQgdGVjaG5pY2FsIGluZm9ybWF0aW9uIChzZWUgIzMyMTQxNikuXG5cdFx0Y29uc3QgaXNDb21tYW5kVXJpID0gaHJlZi5zdGFydHNXaXRoKGAke1NjaGVtYXMuY29tbWFuZH06YCk7XG5cblx0XHQvLyBIVE1MIEVuY29kZSBocmVmXG5cdFx0aHJlZiA9IGhyZWYucmVwbGFjZSgvJi9nLCAnJmFtcDsnKVxuXHRcdFx0LnJlcGxhY2UoLzwvZywgJyZsdDsnKVxuXHRcdFx0LnJlcGxhY2UoLz4vZywgJyZndDsnKVxuXHRcdFx0LnJlcGxhY2UoL1wiL2csICcmcXVvdDsnKVxuXHRcdFx0LnJlcGxhY2UoLycvZywgJyYjMzk7Jyk7XG5cblx0XHRjb25zdCBlZmZlY3RpdmVUaXRsZSA9IHRpdGxlIHx8IChpc0NvbW1hbmRVcmkgPyAnJyA6IGhyZWYpO1xuXHRcdHJldHVybiBgPGEgaHJlZj1cIiR7aHJlZn1cIiB0aXRsZT1cIiR7ZWZmZWN0aXZlVGl0bGV9XCIgZHJhZ2dhYmxlPVwiZmFsc2VcIj4ke3RleHR9PC9hPmA7XG5cdH0sXG59KTtcblxuLyoqXG4gKiBCbG9ja3F1b3RlIHJlbmRlcmVyIHRoYXQgcHJvY2Vzc2VzIEdpdEh1Yi1zdHlsZSBhbGVydCBzeW50YXguXG4gKiBUcmFuc2Zvcm1zIGJsb2NrcXVvdGVzIGxpa2UgXCI+IFshTk9URV1cIiBpbnRvIHN0cnVjdHVyZWQgYWxlcnQgbWFya3VwIHdpdGggaWNvbnMuXG4gKlxuICogQmFzZWQgb24gR2l0SHViJ3MgYWxlcnQgc3ludGF4OiBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9nZXQtc3RhcnRlZC93cml0aW5nLW9uLWdpdGh1Yi9nZXR0aW5nLXN0YXJ0ZWQtd2l0aC13cml0aW5nLWFuZC1mb3JtYXR0aW5nLW9uLWdpdGh1Yi9iYXNpYy13cml0aW5nLWFuZC1mb3JtYXR0aW5nLXN5bnRheCNhbGVydHNcbiAqL1xuZnVuY3Rpb24gY3JlYXRlQWxlcnRCbG9ja3F1b3RlUmVuZGVyZXIoZmFsbGJhY2tSZW5kZXJlcjogKHRoaXM6IG1hcmtlZC5SZW5kZXJlciwgdG9rZW46IG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZSkgPT4gc3RyaW5nKSB7XG5cdHJldHVybiBmdW5jdGlvbiAodGhpczogbWFya2VkLlJlbmRlcmVyLCB0b2tlbjogbWFya2VkLlRva2Vucy5CbG9ja3F1b3RlKTogc3RyaW5nIHtcblx0XHRjb25zdCB7IHRva2VucyB9ID0gdG9rZW47XG5cdFx0Ly8gQ2hlY2sgaWYgdGhpcyBibG9ja3F1b3RlIHN0YXJ0cyB3aXRoIGFsZXJ0IHN5bnRheCBbIVRZUEVdXG5cdFx0Y29uc3QgZmlyc3RUb2tlbiA9IHRva2Vuc1swXTtcblx0XHRpZiAoZmlyc3RUb2tlbj8udHlwZSAhPT0gJ3BhcmFncmFwaCcpIHtcblx0XHRcdHJldHVybiBmYWxsYmFja1JlbmRlcmVyLmNhbGwodGhpcywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmFncmFwaFRva2VucyA9IGZpcnN0VG9rZW4udG9rZW5zO1xuXHRcdGlmICghcGFyYWdyYXBoVG9rZW5zIHx8IHBhcmFncmFwaFRva2Vucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxsYmFja1JlbmRlcmVyLmNhbGwodGhpcywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0VGV4dFRva2VuID0gcGFyYWdyYXBoVG9rZW5zWzBdO1xuXHRcdGlmIChmaXJzdFRleHRUb2tlbj8udHlwZSAhPT0gJ3RleHQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2tSZW5kZXJlci5jYWxsKHRoaXMsIHRva2VuKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuID0gL15cXHMqXFxbIShOT1RFfFRJUHxJTVBPUlRBTlR8V0FSTklOR3xDQVVUSU9OKVxcXVxccyo/XFxuKi9pO1xuXHRcdGNvbnN0IG1hdGNoID0gZmlyc3RUZXh0VG9rZW4ucmF3Lm1hdGNoKHBhdHRlcm4pO1xuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiBmYWxsYmFja1JlbmRlcmVyLmNhbGwodGhpcywgdG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSB0aGUgYWxlcnQgbWFya2VyIGZyb20gdGhlIHRva2VuXG5cdFx0Zmlyc3RUZXh0VG9rZW4ucmF3ID0gZmlyc3RUZXh0VG9rZW4ucmF3LnJlcGxhY2UocGF0dGVybiwgJycpO1xuXHRcdGZpcnN0VGV4dFRva2VuLnRleHQgPSBmaXJzdFRleHRUb2tlbi50ZXh0LnJlcGxhY2UocGF0dGVybiwgJycpO1xuXG5cdFx0Y29uc3QgYWxlcnRJY29uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdCdub3RlJzogJ2luZm8nLFxuXHRcdFx0J3RpcCc6ICdsaWdodC1idWxiJyxcblx0XHRcdCdpbXBvcnRhbnQnOiAnY29tbWVudCcsXG5cdFx0XHQnd2FybmluZyc6ICdhbGVydCcsXG5cdFx0XHQnY2F1dGlvbic6ICdzdG9wJ1xuXHRcdH07XG5cblx0XHRjb25zdCB0eXBlID0gbWF0Y2hbMV07XG5cdFx0Y29uc3QgdHlwZUNhcGl0YWxpemVkID0gdHlwZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSkudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBzZXZlcml0eSA9IHR5cGUudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBpY29uSHRtbCA9IHJlbmRlckljb24oeyBpZDogYWxlcnRJY29uc1tzZXZlcml0eV0gfSkub3V0ZXJIVE1MO1xuXG5cdFx0Ly8gUmVuZGVyIHRoZSByZW1haW5pbmcgY29udGVudFxuXHRcdGNvbnN0IGNvbnRlbnQgPSB0aGlzLnBhcnNlci5wYXJzZSh0b2tlbnMpO1xuXG5cdFx0Ly8gUmV0dXJuIGFsZXJ0IG1hcmt1cCB3aXRoIGljb24gYW5kIHNldmVyaXR5IChza2lwcGluZyB0aGUgZmlyc3QgMyBjaGFyYWN0ZXJzOiBgPHA+YClcblx0XHRyZXR1cm4gYDxibG9ja3F1b3RlIGRhdGEtc2V2ZXJpdHk9XCIke3NldmVyaXR5fVwiPjxwPjxzcGFuPiR7aWNvbkh0bWx9JHt0eXBlQ2FwaXRhbGl6ZWR9PC9zcGFuPiR7Y29udGVudC5zdWJzdHJpbmcoMyl9PC9ibG9ja3F1b3RlPlxcbmA7XG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbmRlcmVkTWFya2Rvd24gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG4vKipcbiAqIExvdy1sZXZlbCB3YXkgY3JlYXRlIGEgaHRtbCBlbGVtZW50IGZyb20gYSBtYXJrZG93biBzdHJpbmcuXG4gKlxuICogKipOb3RlKiogdGhhdCBmb3IgbW9zdCBjYXNlcyB5b3Ugc2hvdWxkIGJlIHVzaW5nIHtAbGluayBpbXBvcnQoJy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9tYXJrZG93blJlbmRlcmVyL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcycpLk1hcmtkb3duUmVuZGVyZXIgTWFya2Rvd25SZW5kZXJlcn1cbiAqIHdoaWNoIGNvbWVzIHdpdGggc3VwcG9ydCBmb3IgcHJldHR5IGNvZGUgYmxvY2sgcmVuZGVyaW5nIGFuZCB3aGljaCB1c2VzIHRoZSBkZWZhdWx0IHdheSBvZiBoYW5kbGluZyBsaW5rcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlck1hcmtkb3duKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucyA9IHt9LCB0YXJnZXQ/OiBIVE1MRWxlbWVudCk6IElSZW5kZXJlZE1hcmtkb3duIHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3QgbWFya2VkSW5zdGFuY2UgPSBuZXcgbWFya2VkLk1hcmtlZCguLi4ob3B0aW9ucy5tYXJrZWRFeHRlbnNpb25zID8/IFtdKSk7XG5cdGNvbnN0IHsgcmVuZGVyZXIsIGNvZGVCbG9ja3MsIHN5bmNDb2RlQmxvY2tzIH0gPSBjcmVhdGVNYXJrZG93blJlbmRlcmVyKG1hcmtlZEluc3RhbmNlLCBvcHRpb25zLCBtYXJrZG93bik7XG5cdGNvbnN0IHZhbHVlID0gcHJlcHJvY2Vzc01hcmtkb3duU3RyaW5nKG1hcmtkb3duKTtcblxuXHRsZXQgcmVuZGVyZWRNYXJrZG93bjogc3RyaW5nO1xuXHRpZiAob3B0aW9ucy5maWxsSW5JbmNvbXBsZXRlVG9rZW5zKSB7XG5cdFx0Ly8gVGhlIGRlZmF1bHRzIGFyZSBhcHBsaWVkIGJ5IHBhcnNlIGJ1dCBub3QgbGV4ZXIoKS9wYXJzZXIoKSwgYW5kIHRoZXkgbmVlZCB0byBiZSBwcmVzZW50XG5cdFx0Y29uc3Qgb3B0czogbWFya2VkLk1hcmtlZE9wdGlvbnMgPSB7XG5cdFx0XHQuLi5tYXJrZWRJbnN0YW5jZS5kZWZhdWx0cyxcblx0XHRcdC4uLm9wdGlvbnMubWFya2VkT3B0aW9ucyxcblx0XHRcdHJlbmRlcmVyXG5cdFx0fTtcblx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWRJbnN0YW5jZS5sZXhlcih2YWx1ZSwgb3B0cyk7XG5cdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdHJlbmRlcmVkTWFya2Rvd24gPSBtYXJrZWRJbnN0YW5jZS5wYXJzZXIobmV3VG9rZW5zLCBvcHRzKTtcblx0fSBlbHNlIHtcblx0XHRyZW5kZXJlZE1hcmtkb3duID0gbWFya2VkSW5zdGFuY2UucGFyc2UodmFsdWUsIHsgLi4ub3B0aW9ucz8ubWFya2VkT3B0aW9ucywgcmVuZGVyZXIsIGFzeW5jOiBmYWxzZSB9KTtcblx0fVxuXG5cdC8vIFJld3JpdGUgdGhlbWUgaWNvbnNcblx0aWYgKG1hcmtkb3duLnN1cHBvcnRUaGVtZUljb25zKSB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhyZW5kZXJlZE1hcmtkb3duKTtcblx0XHRyZW5kZXJlZE1hcmtkb3duID0gZWxlbWVudHMubWFwKGUgPT4gdHlwZW9mIGUgPT09ICdzdHJpbmcnID8gZSA6IGUub3V0ZXJIVE1MKS5qb2luKCcnKTtcblx0fVxuXG5cdGNvbnN0IHJlbmRlcmVkQ29udGVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRjb25zdCBzYW5pdGl6ZXJDb25maWcgPSBnZXREb21TYW5pdGl6ZXJDb25maWcobWFya2Rvd24sIG9wdGlvbnMuc2FuaXRpemVyQ29uZmlnID8/IHt9KTtcblx0ZG9tU2FuaXRpemUuc2FmZVNldElubmVySHRtbChyZW5kZXJlZENvbnRlbnQsIHJlbmRlcmVkTWFya2Rvd24sIHNhbml0aXplckNvbmZpZyk7XG5cblx0Ly8gUmV3cml0ZSBsaW5rcyBhbmQgaW1hZ2VzIGJlZm9yZSBwb3RlbnRpYWxseSBpbnNlcnRpbmcgdGhlbSBpbnRvIHRoZSByZWFsIGRvbVxuXHRyZXdyaXRlUmVuZGVyZWRMaW5rcyhtYXJrZG93biwgb3B0aW9ucywgcmVuZGVyZWRDb250ZW50KTtcblxuXHRsZXQgb3V0RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGlmICh0YXJnZXQpIHtcblx0XHRvdXRFbGVtZW50ID0gdGFyZ2V0O1xuXHRcdERPTS5yZXNldCh0YXJnZXQsIC4uLnJlbmRlcmVkQ29udGVudC5jaGlsZE5vZGVzKTtcblx0fSBlbHNlIHtcblx0XHRvdXRFbGVtZW50ID0gcmVuZGVyZWRDb250ZW50O1xuXHR9XG5cblx0aWYgKGNvZGVCbG9ja3MubGVuZ3RoID4gMCkge1xuXHRcdFByb21pc2UuYWxsKGNvZGVCbG9ja3MpLnRoZW4oKHR1cGxlcykgPT4ge1xuXHRcdFx0aWYgKGlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVuZGVyZWRFbGVtZW50cyA9IG5ldyBNYXAodHVwbGVzKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJFbGVtZW50cyA9IG91dEVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRGl2RWxlbWVudD4oYGRpdltkYXRhLWNvZGVdYCk7XG5cdFx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyRWxlbWVudCBvZiBwbGFjZWhvbGRlckVsZW1lbnRzKSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkRWxlbWVudCA9IHJlbmRlcmVkRWxlbWVudHMuZ2V0KHBsYWNlaG9sZGVyRWxlbWVudC5kYXRhc2V0Wydjb2RlJ10gPz8gJycpO1xuXHRcdFx0XHRpZiAocmVuZGVyZWRFbGVtZW50KSB7XG5cdFx0XHRcdFx0RE9NLnJlc2V0KHBsYWNlaG9sZGVyRWxlbWVudCwgcmVuZGVyZWRFbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0b3B0aW9ucy5hc3luY1JlbmRlckNhbGxiYWNrPy4oKTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChzeW5jQ29kZUJsb2Nrcy5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgcmVuZGVyZWRFbGVtZW50cyA9IG5ldyBNYXAoc3luY0NvZGVCbG9ja3MpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyRWxlbWVudHMgPSBvdXRFbGVtZW50LnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTERpdkVsZW1lbnQ+KGBkaXZbZGF0YS1jb2RlXWApO1xuXHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXJFbGVtZW50IG9mIHBsYWNlaG9sZGVyRWxlbWVudHMpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRWxlbWVudCA9IHJlbmRlcmVkRWxlbWVudHMuZ2V0KHBsYWNlaG9sZGVyRWxlbWVudC5kYXRhc2V0Wydjb2RlJ10gPz8gJycpO1xuXHRcdFx0aWYgKHJlbmRlcmVkRWxlbWVudCkge1xuXHRcdFx0XHRET00ucmVzZXQocGxhY2Vob2xkZXJFbGVtZW50LCByZW5kZXJlZEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFNpZ25hbCBzaXplIGNoYW5nZXMgZm9yIGltYWdlIHRhZ3Ncblx0aWYgKG9wdGlvbnMuYXN5bmNSZW5kZXJDYWxsYmFjaykge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGZvciAoY29uc3QgaW1nIG9mIG91dEVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2ltZycpKSB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGltZywgJ2xvYWQnLCAoKSA9PiB7XG5cdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0b3B0aW9ucy5hc3luY1JlbmRlckNhbGxiYWNrISgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEFkZCBldmVudCBsaXN0ZW5lcnMgZm9yIGxpbmtzXG5cdGlmIChvcHRpb25zLmFjdGlvbkhhbmRsZXIpIHtcblx0XHRjb25zdCBjbGlja0NiID0gKGU6IFBvaW50ZXJFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgbW91c2VFdmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoRE9NLmdldFdpbmRvdyhvdXRFbGVtZW50KSwgZSk7XG5cdFx0XHRpZiAoIW1vdXNlRXZlbnQubGVmdEJ1dHRvbiAmJiAhbW91c2VFdmVudC5taWRkbGVCdXR0b24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YWN0aXZhdGVMaW5rKG1hcmtkb3duLCBvcHRpb25zLCBtb3VzZUV2ZW50KTtcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG91dEVsZW1lbnQsICdjbGljaycsIGNsaWNrQ2IpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvdXRFbGVtZW50LCAnYXV4Y2xpY2snLCBjbGlja0NiKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvdXRFbGVtZW50LCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmICgha2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgJiYgIWtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGFjdGl2YXRlTGluayhtYXJrZG93biwgb3B0aW9ucywga2V5Ym9hcmRFdmVudCk7XG5cdFx0fSkpO1xuXG5cdH1cblxuXHQvLyBSZW1vdmUvZGlzYWJsZSBpbnB1dHNcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGZvciAoY29uc3QgaW5wdXQgb2YgWy4uLm91dEVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2lucHV0JyldKSB7XG5cdFx0aWYgKGlucHV0LmF0dHJpYnV0ZXMuZ2V0TmFtZWRJdGVtKCd0eXBlJyk/LnZhbHVlID09PSAnY2hlY2tib3gnKSB7XG5cdFx0XHRpbnB1dC5zZXRBdHRyaWJ1dGUoJ2Rpc2FibGVkJywgJycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAob3B0aW9ucy5zYW5pdGl6ZXJDb25maWc/LnJlcGxhY2VXaXRoUGxhaW50ZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gY29udmVydFRhZ1RvUGxhaW50ZXh0KGlucHV0KTtcblx0XHRcdFx0aWYgKHJlcGxhY2VtZW50KSB7XG5cdFx0XHRcdFx0aW5wdXQucGFyZW50RWxlbWVudD8ucmVwbGFjZUNoaWxkKHJlcGxhY2VtZW50LCBpbnB1dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXQucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlucHV0LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogb3V0RWxlbWVudCxcblx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRpc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJld3JpdGVSZW5kZXJlZExpbmtzKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIG9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgcm9vdDogSFRNTEVsZW1lbnQpIHtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGZvciAoY29uc3QgZWwgb2Ygcm9vdC5xdWVyeVNlbGVjdG9yQWxsKCdpbWcsIGF1ZGlvLCB2aWRlbywgc291cmNlJykpIHtcblx0XHRjb25zdCBzcmMgPSBlbC5nZXRBdHRyaWJ1dGUoJ3NyYycpOyAvLyBHZXQgdGhlIHJhdyAnc3JjJyBhdHRyaWJ1dGUgdmFsdWUgYXMgdGV4dCwgbm90IHRoZSByZXNvbHZlZCAnc3JjJ1xuXHRcdGlmIChzcmMpIHtcblx0XHRcdGxldCBocmVmID0gc3JjO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKG1hcmtkb3duLmJhc2VVcmkpIHsgLy8gYWJzb2x1dGUgb3IgcmVsYXRpdmUgbG9jYWwgcGF0aCwgb3IgZmlsZTogdXJpXG5cdFx0XHRcdFx0aHJlZiA9IHJlc29sdmVXaXRoQmFzZVVyaShVUkkuZnJvbShtYXJrZG93bi5iYXNlVXJpKSwgaHJlZik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikgeyB9XG5cblx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnc3JjJywgbWFzc2FnZUhyZWYobWFya2Rvd24sIGhyZWYsIHRydWUpKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuc2FuaXRpemVyQ29uZmlnPy5yZW1vdGVJbWFnZUlzQWxsb3dlZCkge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoaHJlZik7XG5cdFx0XHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5kYXRhICYmICFvcHRpb25zLnNhbml0aXplckNvbmZpZy5yZW1vdGVJbWFnZUlzQWxsb3dlZCh1cmkpKSB7XG5cdFx0XHRcdFx0ZWwucmVwbGFjZVdpdGgoRE9NLiQoJycsIHVuZGVmaW5lZCwgZWwub3V0ZXJIVE1MKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0Zm9yIChjb25zdCBlbCBvZiByb290LnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKSkge1xuXHRcdGNvbnN0IGhyZWYgPSBlbC5nZXRBdHRyaWJ1dGUoJ2hyZWYnKTsgLy8gR2V0IHRoZSByYXcgJ2hyZWYnIGF0dHJpYnV0ZSB2YWx1ZSBhcyB0ZXh0LCBub3QgdGhlIHJlc29sdmVkICdocmVmJ1xuXHRcdGVsLnNldEF0dHJpYnV0ZSgnaHJlZicsICcnKTsgLy8gQ2xlYXIgb3V0IGhyZWYuIFdlIHVzZSB0aGUgYGRhdGEtaHJlZmAgZm9yIGhhbmRsaW5nIGNsaWNrcyBpbnN0ZWFkXG5cdFx0aWYgKCFocmVmXG5cdFx0XHR8fCAvXmRhdGE6fGphdmFzY3JpcHQ6L2kudGVzdChocmVmKVxuXHRcdFx0fHwgKC9eY29tbWFuZDovaS50ZXN0KGhyZWYpICYmICFtYXJrZG93bi5pc1RydXN0ZWQpXG5cdFx0XHR8fCAvXmNvbW1hbmQ6KFxcL1xcL1xcLyk/X3dvcmtiZW5jaFxcLmRvd25sb2FkUmVzb3VyY2UvaS50ZXN0KGhyZWYpKSB7XG5cdFx0XHQvLyBkcm9wIHRoZSBsaW5rXG5cdFx0XHRlbC5yZXBsYWNlV2l0aCguLi5lbC5jaGlsZE5vZGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlc29sdmVkSHJlZiA9IG1hc3NhZ2VIcmVmKG1hcmtkb3duLCBocmVmLCBmYWxzZSk7XG5cdFx0XHRpZiAobWFya2Rvd24uYmFzZVVyaSkge1xuXHRcdFx0XHRyZXNvbHZlZEhyZWYgPSByZXNvbHZlV2l0aEJhc2VVcmkoVVJJLmZyb20obWFya2Rvd24uYmFzZVVyaSksIGhyZWYpO1xuXHRcdFx0fVxuXHRcdFx0ZWwuZGF0YXNldC5ocmVmID0gcmVzb2x2ZWRIcmVmO1xuXG5cdFx0XHQvLyBMZWF2aW5nIGBocmVmYCBlbXB0eSBtYWtlcyB0aGUgYnJvd3NlciByZXNvbHZlIGl0IGFnYWluc3QgdGhlIHdvcmtiZW5jaCBkb2N1bWVudFxuXHRcdFx0Ly8gd2hlbiBzZXJpYWxpemluZyBhIGNvcHksIHNvIGV2ZXJ5IHBhc3RlZCBsaW5rIGJlY2FtZSBhIGB3b3JrYmVuY2guaHRtbGAgVVJMLiBPbmx5XG5cdFx0XHQvLyByZXN0b3JlIGl0IHdoZXJlIGFuIGFjdGlvbiBoYW5kbGVyIGludGVyY2VwdHMgY2xpY2tzIGFuZCByb3V0ZXMgdGhlbSB0aHJvdWdoIHRoZVxuXHRcdFx0Ly8gb3BlbmVyOyB3aXRob3V0IG9uZSB0aGUgYW5jaG9yIHdvdWxkIG5hdmlnYXRlIG5hdGl2ZWx5LlxuXHRcdFx0aWYgKG9wdGlvbnMuYWN0aW9uSGFuZGxlciAmJiBpc1BvcnRhYmxlTGlua1RhcmdldChyZXNvbHZlZEhyZWYpKSB7XG5cdFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgnaHJlZicsIHJlc29sdmVkSHJlZik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlTWFya2Rvd25SZW5kZXJlcihtYXJrZWQ6IG1hcmtlZC5NYXJrZWQsIG9wdGlvbnM6IE1hcmtkb3duUmVuZGVyT3B0aW9ucywgbWFya2Rvd246IElNYXJrZG93blN0cmluZyk6IHsgcmVuZGVyZXI6IG1hcmtlZC5SZW5kZXJlcjsgY29kZUJsb2NrczogUHJvbWlzZTxbc3RyaW5nLCBIVE1MRWxlbWVudF0+W107IHN5bmNDb2RlQmxvY2tzOiBbc3RyaW5nLCBIVE1MRWxlbWVudF1bXSB9IHtcblx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgbWFya2VkLlJlbmRlcmVyKG9wdGlvbnMubWFya2VkT3B0aW9ucyk7XG5cdHJlbmRlcmVyLmltYWdlID0gdG9rZW4gPT4gcmVuZGVySW1hZ2UodG9rZW4sIGhyZWYgPT4gb3B0aW9ucy50cmFuc2Zvcm1Vcmk/LihocmVmLCAnaW1hZ2UnKSA/PyBocmVmKTtcblx0cmVuZGVyZXIubGluayA9IHRva2VuID0+IGRlZmF1bHRNYXJrZWRSZW5kZXJlcnMubGluay5jYWxsKHJlbmRlcmVyLCB7XG5cdFx0Li4udG9rZW4sXG5cdFx0aHJlZjogb3B0aW9ucy50cmFuc2Zvcm1Vcmk/Lih0b2tlbi5ocmVmLCAnbGluaycpID8/IHRva2VuLmhyZWYsXG5cdH0pO1xuXHRyZW5kZXJlci5wYXJhZ3JhcGggPSBkZWZhdWx0TWFya2VkUmVuZGVyZXJzLnBhcmFncmFwaDtcblxuXHRpZiAobWFya2Rvd24uc3VwcG9ydEFsZXJ0U3ludGF4KSB7XG5cdFx0cmVuZGVyZXIuYmxvY2txdW90ZSA9IGNyZWF0ZUFsZXJ0QmxvY2txdW90ZVJlbmRlcmVyKHJlbmRlcmVyLmJsb2NrcXVvdGUpO1xuXHR9XG5cblx0Ly8gV2lsbCBjb2xsZWN0IFtpZCwgcmVuZGVyZWRFbGVtZW50XSB0dXBsZXNcblx0Y29uc3QgY29kZUJsb2NrczogUHJvbWlzZTxbc3RyaW5nLCBIVE1MRWxlbWVudF0+W10gPSBbXTtcblx0Y29uc3Qgc3luY0NvZGVCbG9ja3M6IFtzdHJpbmcsIEhUTUxFbGVtZW50XVtdID0gW107XG5cblx0aWYgKG9wdGlvbnMuY29kZUJsb2NrUmVuZGVyZXJTeW5jKSB7XG5cdFx0cmVuZGVyZXIuY29kZSA9ICh7IHRleHQsIGxhbmcsIHJhdyB9OiBtYXJrZWQuVG9rZW5zLkNvZGUpID0+IHtcblx0XHRcdGNvbnN0IGlkID0gZGVmYXVsdEdlbmVyYXRvci5uZXh0SWQoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gb3B0aW9ucy5jb2RlQmxvY2tSZW5kZXJlclN5bmMhKHBvc3RQcm9jZXNzQ29kZUJsb2NrTGFuZ3VhZ2VJZChsYW5nKSwgdGV4dCwgcmF3KTtcblx0XHRcdHN5bmNDb2RlQmxvY2tzLnB1c2goW2lkLCB2YWx1ZV0pO1xuXHRcdFx0cmV0dXJuIGA8ZGl2IGNsYXNzPVwiY29kZVwiIGRhdGEtY29kZT1cIiR7aWR9XCI+JHtlc2NhcGUodGV4dCl9PC9kaXY+YDtcblx0XHR9O1xuXHR9IGVsc2UgaWYgKG9wdGlvbnMuY29kZUJsb2NrUmVuZGVyZXIpIHtcblx0XHRyZW5kZXJlci5jb2RlID0gKHsgdGV4dCwgbGFuZyB9OiBtYXJrZWQuVG9rZW5zLkNvZGUpID0+IHtcblx0XHRcdGNvbnN0IGlkID0gZGVmYXVsdEdlbmVyYXRvci5uZXh0SWQoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gb3B0aW9ucy5jb2RlQmxvY2tSZW5kZXJlciEocG9zdFByb2Nlc3NDb2RlQmxvY2tMYW5ndWFnZUlkKGxhbmcpLCB0ZXh0KTtcblx0XHRcdGNvZGVCbG9ja3MucHVzaCh2YWx1ZS50aGVuKGVsZW1lbnQgPT4gW2lkLCBlbGVtZW50XSkpO1xuXHRcdFx0cmV0dXJuIGA8ZGl2IGNsYXNzPVwiY29kZVwiIGRhdGEtY29kZT1cIiR7aWR9XCI+JHtlc2NhcGUodGV4dCl9PC9kaXY+YDtcblx0XHR9O1xuXHR9XG5cblx0aWYgKCFtYXJrZG93bi5zdXBwb3J0SHRtbCkge1xuXHRcdC8vIE5vdGU6IHdlIGFsd2F5cyBwYXNzIHRoZSBvdXRwdXQgdGhyb3VnaCBkb21wdXJpZnkgYWZ0ZXIgdGhpcyBzbyB0aGF0IHdlIGRvbid0IHJlbHkgb25cblx0XHQvLyBtYXJrZWQgZm9yIHJlYWwgc2FuaXRpemF0aW9uLlxuXHRcdHJlbmRlcmVyLmh0bWwgPSAoeyB0ZXh0IH0pID0+IHtcblx0XHRcdGlmIChvcHRpb25zLnNhbml0aXplckNvbmZpZz8ucmVwbGFjZVdpdGhQbGFpbnRleHQpIHtcblx0XHRcdFx0cmV0dXJuIGVzY2FwZSh0ZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2ggPSBtYXJrZG93bi5pc1RydXN0ZWQgPyB0ZXh0Lm1hdGNoKC9eKDxzcGFuW14+XSs+KXwoPFxcL1xccypzcGFuPikkLykgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gbWF0Y2ggPyB0ZXh0IDogJyc7XG5cdFx0fTtcblx0fVxuXHRyZXR1cm4geyByZW5kZXJlciwgY29kZUJsb2Nrcywgc3luY0NvZGVCbG9ja3MgfTtcbn1cblxuZnVuY3Rpb24gcHJlcHJvY2Vzc01hcmtkb3duU3RyaW5nKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcpIHtcblx0bGV0IHZhbHVlID0gbWFya2Rvd24udmFsdWU7XG5cblx0Ly8gdmFsdWVzIHRoYXQgYXJlIHRvbyBsb25nIHdpbGwgZnJlZXplIHRoZSBVSVxuXHRpZiAodmFsdWUubGVuZ3RoID4gMTAwXzAwMCkge1xuXHRcdHZhbHVlID0gYCR7dmFsdWUuc3Vic3RyKDAsIDEwMF8wMDApfVx1MjAyNmA7XG5cdH1cblxuXHQvLyBlc2NhcGUgdGhlbWUgaWNvbnNcblx0aWYgKG1hcmtkb3duLnN1cHBvcnRUaGVtZUljb25zKSB7XG5cdFx0dmFsdWUgPSBtYXJrZG93bkVzY2FwZUVzY2FwZWRJY29ucyh2YWx1ZSk7XG5cdH1cblxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIGFjdGl2YXRlTGluayhtZFN0cjogSU1hcmtkb3duU3RyaW5nLCBvcHRpb25zOiBNYXJrZG93blJlbmRlck9wdGlvbnMsIGV2ZW50OiBTdGFuZGFyZE1vdXNlRXZlbnQgfCBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0Y29uc3QgdGFyZ2V0ID0gZXZlbnQudGFyZ2V0LmNsb3Nlc3QoJ2FbZGF0YS1ocmVmXScpO1xuXHRpZiAoIURPTS5pc0hUTUxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHR0cnkge1xuXHRcdGxldCBocmVmID0gdGFyZ2V0LmRhdGFzZXRbJ2hyZWYnXTtcblx0XHRpZiAoaHJlZikge1xuXHRcdFx0aWYgKG1kU3RyLmJhc2VVcmkpIHtcblx0XHRcdFx0aHJlZiA9IHJlc29sdmVXaXRoQmFzZVVyaShVUkkuZnJvbShtZFN0ci5iYXNlVXJpKSwgaHJlZik7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLmFjdGlvbkhhbmRsZXI/LihocmVmLCBtZFN0cik7XG5cdFx0fVxuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdXJpTWFzc2FnZShtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nLCBwYXJ0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgZGF0YTogdW5rbm93bjtcblx0dHJ5IHtcblx0XHRkYXRhID0gcGFyc2UoZGVjb2RlVVJJQ29tcG9uZW50KHBhcnQpKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdC8vIGlnbm9yZVxuXHR9XG5cdGlmICghZGF0YSkge1xuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cdGRhdGEgPSBjbG9uZUFuZENoYW5nZShkYXRhLCB2YWx1ZSA9PiB7XG5cdFx0aWYgKG1hcmtkb3duLnVyaXMgJiYgbWFya2Rvd24udXJpc1t2YWx1ZV0pIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKG1hcmtkb3duLnVyaXNbdmFsdWVdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXHRyZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcbn1cblxuZnVuY3Rpb24gbWFzc2FnZUhyZWYobWFya2Rvd246IElNYXJrZG93blN0cmluZywgaHJlZjogc3RyaW5nLCBpc0RvbVVyaTogYm9vbGVhbik6IHN0cmluZyB7XG5cdGNvbnN0IGRhdGEgPSBtYXJrZG93bi51cmlzICYmIG1hcmtkb3duLnVyaXNbaHJlZl07XG5cdGxldCB1cmkgPSBVUkkucmV2aXZlKGRhdGEpO1xuXHRpZiAoaXNEb21VcmkpIHtcblx0XHRpZiAoaHJlZi5zdGFydHNXaXRoKFNjaGVtYXMuZGF0YSArICc6JykpIHtcblx0XHRcdHJldHVybiBocmVmO1xuXHRcdH1cblx0XHRpZiAoIXVyaSkge1xuXHRcdFx0dXJpID0gVVJJLnBhcnNlKGhyZWYpO1xuXHRcdH1cblx0XHQvLyB0aGlzIFVSSSB3aWxsIGVuZCB1cCBhcyBcInNyY1wiLWF0dHJpYnV0ZSBvZiBhIGRvbSBub2RlXG5cdFx0Ly8gYW5kIGJlY2F1c2Ugb2YgdGhhdCBzcGVjaWFsIHJld3JpdGluZyBuZWVkcyB0byBiZSBkb25lXG5cdFx0Ly8gc28gdGhhdCB0aGUgVVJJIHVzZXMgYSBwcm90b2NvbCB0aGF0J3MgdW5kZXJzdG9vZCBieVxuXHRcdC8vIGJyb3dzZXJzIChsaWtlIGh0dHAgb3IgaHR0cHMpXG5cdFx0cmV0dXJuIEZpbGVBY2Nlc3MudXJpVG9Ccm93c2VyVXJpKHVyaSkudG9TdHJpbmcodHJ1ZSk7XG5cdH1cblx0aWYgKCF1cmkpIHtcblx0XHRyZXR1cm4gaHJlZjtcblx0fVxuXHRpZiAoVVJJLnBhcnNlKGhyZWYpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSB7XG5cdFx0cmV0dXJuIGhyZWY7IC8vIG5vIHRyYW5zZm9ybWF0aW9uIHBlcmZvcm1lZFxuXHR9XG5cdGlmICh1cmkucXVlcnkpIHtcblx0XHR1cmkgPSB1cmkud2l0aCh7IHF1ZXJ5OiB1cmlNYXNzYWdlKG1hcmtkb3duLCB1cmkucXVlcnkpIH0pO1xuXHR9XG5cdHJldHVybiB1cmkudG9TdHJpbmcoKTtcbn1cblxuZnVuY3Rpb24gcG9zdFByb2Nlc3NDb2RlQmxvY2tMYW5ndWFnZUlkKGxhbmc6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghbGFuZykge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGNvbnN0IHBhcnRzID0gbGFuZy5zcGxpdCgvW1xccyt8OnwsfFxce3xcXD9dLywgMSk7XG5cdGlmIChwYXJ0cy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gcGFydHNbMF07XG5cdH1cblx0cmV0dXJuIGxhbmc7XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVXaXRoQmFzZVVyaShiYXNlVXJpOiBVUkksIGhyZWY6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGhhc1NjaGVtZSA9IC9eXFx3W1xcd1xcZCsuLV0qOi8udGVzdChocmVmKTtcblx0aWYgKGhhc1NjaGVtZSkge1xuXHRcdHJldHVybiBocmVmO1xuXHR9XG5cblx0aWYgKGJhc2VVcmkucGF0aC5lbmRzV2l0aCgnLycpKSB7XG5cdFx0cmV0dXJuIHJlc29sdmVQYXRoKGJhc2VVcmksIGhyZWYpLnRvU3RyaW5nKCk7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIHJlc29sdmVQYXRoKGRpcm5hbWUoYmFzZVVyaSksIGhyZWYpLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxudHlwZSBNZFN0ckNvbmZpZyA9IHtcblx0cmVhZG9ubHkgaXNUcnVzdGVkPzogYm9vbGVhbiB8IE1hcmtkb3duU3RyaW5nVHJ1c3RlZE9wdGlvbnM7XG5cdHJlYWRvbmx5IGJhc2VVcmk/OiBVcmlDb21wb25lbnRzO1xufTtcblxuZnVuY3Rpb24gc2FuaXRpemVSZW5kZXJlZE1hcmtkb3duKFxuXHRyZW5kZXJlZE1hcmtkb3duOiBzdHJpbmcsXG5cdG9yaWdpbmFsTWRTdHJDb25maWc6IE1kU3RyQ29uZmlnLFxuXHRvcHRpb25zOiBNYXJrZG93blNhbml0aXplckNvbmZpZyA9IHt9LFxuKTogVHJ1c3RlZEhUTUwge1xuXHRjb25zdCBzYW5pdGl6ZXJDb25maWcgPSBnZXREb21TYW5pdGl6ZXJDb25maWcob3JpZ2luYWxNZFN0ckNvbmZpZywgb3B0aW9ucyk7XG5cdHJldHVybiBkb21TYW5pdGl6ZS5zYW5pdGl6ZUh0bWwocmVuZGVyZWRNYXJrZG93biwgc2FuaXRpemVyQ29uZmlnKTtcbn1cblxuZXhwb3J0IGNvbnN0IGFsbG93ZWRNYXJrZG93bkh0bWxUYWdzID0gT2JqZWN0LmZyZWV6ZShbXG5cdC4uLmRvbVNhbml0aXplLmJhc2ljTWFya3VwSHRtbFRhZ3MsXG5cdCdpbnB1dCcsIC8vIEFsbG93IGlucHV0cyBmb3IgcmVuZGVyaW5nIGNoZWNrYm94ZXMuIE90aGVyIHR5cGVzIG9mIGlucHV0cyBhcmUgcmVtb3ZlZCBhbmQgdGhlIGlucHV0cyBhcmUgYWx3YXlzIGRpc2FibGVkXG5dKTtcblxuZXhwb3J0IGNvbnN0IGFsbG93ZWRNYXJrZG93bkh0bWxBdHRyaWJ1dGVzID0gT2JqZWN0LmZyZWV6ZTxBcnJheTxzdHJpbmcgfCBkb21TYW5pdGl6ZS5TYW5pdGl6ZUF0dHJpYnV0ZVJ1bGU+PihbXG5cdCdhbGlnbicsXG5cdCdhdXRvcGxheScsXG5cdCdhbHQnLFxuXHQnY29sc3BhbicsXG5cdCdjb250cm9scycsXG5cdCdkcmFnZ2FibGUnLFxuXHQnaGVpZ2h0Jyxcblx0J2hyZWYnLFxuXHQnbG9vcCcsXG5cdCdtdXRlZCcsXG5cdCdwbGF5c2lubGluZScsXG5cdCdwb3N0ZXInLFxuXHQncm93c3BhbicsXG5cdCdzcmMnLFxuXHQndGFyZ2V0Jyxcblx0J3RpdGxlJyxcblx0J3R5cGUnLFxuXHQnd2lkdGgnLFxuXHQnc3RhcnQnLFxuXG5cdC8vIElucHV0IChGb3IgZGlzYWJsZWQgaW5wdXRzKVxuXHQnY2hlY2tlZCcsXG5cdCdkaXNhYmxlZCcsXG5cdCd2YWx1ZScsXG5cblx0Ly8gQ3VzdG9tIG1hcmtkb3duIGF0dHJpYnV0ZXNcblx0J2RhdGEtY29kZScsXG5cdCdkYXRhLWhyZWYnLFxuXHQnZGF0YS1zZXZlcml0eScsXG5cblx0Ly8gT25seSBhbGxvdyB2ZXJ5IHNwZWNpZmljIHN0eWxlc1xuXHR7XG5cdFx0YXR0cmlidXRlTmFtZTogJ3N0eWxlJyxcblx0XHRzaG91bGRLZWVwOiAoZWxlbWVudCwgZGF0YSkgPT4ge1xuXHRcdFx0aWYgKGVsZW1lbnQudGFnTmFtZSA9PT0gJ1NQQU4nKSB7XG5cdFx0XHRcdGlmIChkYXRhLmF0dHJOYW1lID09PSAnc3R5bGUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC9eKGNvbG9yXFw6KCNbMC05YS1mQS1GXSt8dmFyXFwoLS12c2NvZGUoLVthLXpBLVowLTldKykrXFwpKTspPyhiYWNrZ3JvdW5kLWNvbG9yXFw6KCNbMC05YS1mQS1GXSt8dmFyXFwoLS12c2NvZGUoLVthLXpBLVowLTldKykrXFwpKTspPyhib3JkZXItcmFkaXVzOlswLTldK3B4Oyk/JC8udGVzdChkYXRhLmF0dHJWYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gT25seSBhbGxvdyBjb2RpY29ucyBmb3IgY2xhc3Nlc1xuXHR7XG5cdFx0YXR0cmlidXRlTmFtZTogJ2NsYXNzJyxcblx0XHRzaG91bGRLZWVwOiAoZWxlbWVudCwgZGF0YSkgPT4ge1xuXHRcdFx0aWYgKGVsZW1lbnQudGFnTmFtZSA9PT0gJ1NQQU4nKSB7XG5cdFx0XHRcdGlmIChkYXRhLmF0dHJOYW1lID09PSAnY2xhc3MnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC9eY29kaWNvbiBjb2RpY29uLVthLXpcXC1dKyggY29kaWNvbi1tb2RpZmllci1bYS16XFwtXSspPyQvLnRlc3QoZGF0YS5hdHRyVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSxcblx0fSxcbl0pO1xuXG5mdW5jdGlvbiBnZXREb21TYW5pdGl6ZXJDb25maWcobWRTdHJDb25maWc6IE1kU3RyQ29uZmlnLCBvcHRpb25zOiBNYXJrZG93blNhbml0aXplckNvbmZpZyk6IGRvbVNhbml0aXplLkRvbVNhbml0aXplckNvbmZpZyB7XG5cdGNvbnN0IGlzVHJ1c3RlZCA9IG1kU3RyQ29uZmlnLmlzVHJ1c3RlZCA/PyBmYWxzZTtcblx0Y29uc3QgYWxsb3dlZExpbmtTY2hlbWVzID0gW1xuXHRcdFNjaGVtYXMuaHR0cCxcblx0XHRTY2hlbWFzLmh0dHBzLFxuXHRcdFNjaGVtYXMubWFpbHRvLFxuXHRcdFNjaGVtYXMuZmlsZSxcblx0XHRTY2hlbWFzLnZzY29kZUZpbGVSZXNvdXJjZSxcblx0XHRTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRTY2hlbWFzLnZzY29kZVJlbW90ZVJlc291cmNlLFxuXHRcdFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsLFxuXHRcdC8vIEZvciBsaW5rcyB0aGF0IGFyZSBoYW5kbGVkIGVudGlyZWx5IGJ5IHRoZSBhY3Rpb24gaGFuZGxlclxuXHRcdFNjaGVtYXMuaW50ZXJuYWwsXG5cdF07XG5cblx0aWYgKGlzVHJ1c3RlZCkge1xuXHRcdGFsbG93ZWRMaW5rU2NoZW1lcy5wdXNoKFNjaGVtYXMuY29tbWFuZCk7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5hbGxvd2VkTGlua1NjaGVtZXM/LmF1Z21lbnQpIHtcblx0XHRhbGxvd2VkTGlua1NjaGVtZXMucHVzaCguLi5vcHRpb25zLmFsbG93ZWRMaW5rU2NoZW1lcy5hdWdtZW50KTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0Ly8gYWxsb3dlZFRhZ3Mgc2hvdWxkIGluY2x1ZGVkIGV2ZXJ5dGhpbmcgdGhhdCBtYXJrZG93biByZW5kZXJzIHRvLlxuXHRcdC8vIFNpbmNlIHdlIGhhdmUgb3VyIG93biBzYW5pdGl6ZSBmdW5jdGlvbiBmb3IgbWFya2VkLCBpdCdzIHBvc3NpYmxlIHdlIG1pc3NlZCBzb21lIHRhZyBzbyBsZXQgZG9tcHVyaWZ5IG1ha2Ugc3VyZS5cblx0XHQvLyBIVE1MIHRhZ3MgdGhhdCBjYW4gcmVzdWx0IGZyb20gbWFya2Rvd24gYXJlIGZyb20gcmVhZGluZyBodHRwczovL3NwZWMuY29tbW9ubWFyay5vcmcvMC4yOS9cblx0XHQvLyBIVE1MIHRhYmxlIHRhZ3MgdGhhdCBjYW4gcmVzdWx0IGZyb20gbWFya2Rvd24gYXJlIGZyb20gaHR0cHM6Ly9naXRodWIuZ2l0aHViLmNvbS9nZm0vI3RhYmxlcy1leHRlbnNpb24tXG5cdFx0YWxsb3dlZFRhZ3M6IHtcblx0XHRcdG92ZXJyaWRlOiBvcHRpb25zLmFsbG93ZWRUYWdzPy5vdmVycmlkZSA/PyBhbGxvd2VkTWFya2Rvd25IdG1sVGFnc1xuXHRcdH0sXG5cdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHtcblx0XHRcdG92ZXJyaWRlOiBvcHRpb25zLmFsbG93ZWRBdHRyaWJ1dGVzPy5vdmVycmlkZSA/PyBhbGxvd2VkTWFya2Rvd25IdG1sQXR0cmlidXRlcyxcblx0XHR9LFxuXHRcdGFsbG93ZWRMaW5rUHJvdG9jb2xzOiB7XG5cdFx0XHRvdmVycmlkZTogYWxsb3dlZExpbmtTY2hlbWVzLFxuXHRcdH0sXG5cdFx0YWxsb3dSZWxhdGl2ZUxpbmtQYXRoczogISFtZFN0ckNvbmZpZy5iYXNlVXJpLFxuXHRcdGFsbG93ZWRNZWRpYVByb3RvY29sczoge1xuXHRcdFx0b3ZlcnJpZGU6IFtcblx0XHRcdFx0U2NoZW1hcy5odHRwLFxuXHRcdFx0XHRTY2hlbWFzLmh0dHBzLFxuXHRcdFx0XHRTY2hlbWFzLmRhdGEsXG5cdFx0XHRcdFNjaGVtYXMuZmlsZSxcblx0XHRcdFx0U2NoZW1hcy52c2NvZGVGaWxlUmVzb3VyY2UsXG5cdFx0XHRcdFNjaGVtYXMudnNjb2RlUmVtb3RlLFxuXHRcdFx0XHRTY2hlbWFzLnZzY29kZVJlbW90ZVJlc291cmNlLFxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0YWxsb3dSZWxhdGl2ZU1lZGlhUGF0aHM6ICEhbWRTdHJDb25maWcuYmFzZVVyaSxcblx0XHRyZXBsYWNlV2l0aFBsYWludGV4dDogb3B0aW9ucy5yZXBsYWNlV2l0aFBsYWludGV4dCxcblx0fTtcbn1cblxuLyoqXG4gKiBSZW5kZXJzIGBzdHJgIGFzIHBsYWludGV4dCwgc3RyaXBwaW5nIG91dCBNYXJrZG93biBzeW50YXggaWYgaXQncyBhIHtAbGluayBJTWFya2Rvd25TdHJpbmd9LlxuICpcbiAqIEZvciBleGFtcGxlIGAjIEhlYWRlcmAgd291bGQgYmUgb3V0cHV0IGFzIGBIZWFkZXJgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQXNQbGFpbnRleHQoc3RyOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcsIG9wdGlvbnM/OiB7XG5cdC8qKiBDb250cm9scyBpZiB0aGUgYGBgIG9mIGNvZGUgYmxvY2tzIHNob3VsZCBiZSBwcmVzZXJ2ZWQgaW4gdGhlIG91dHB1dCBvciBub3QgKi9cblx0cmVhZG9ubHkgaW5jbHVkZUNvZGVCbG9ja3NGZW5jZXM/OiBib29sZWFuO1xuXHQvKiogQ29udHJvbHMgaWYgd2Ugd2FudCB0byBmb3JtYXQgZW1wdHkgbGlua3MgZnJvbSBcIkxpbmsgW10oZmlsZSlcIiB0byBcIkxpbmsgZmlsZVwiICovXG5cdHJlYWRvbmx5IHVzZUxpbmtGb3JtYXR0ZXI/OiBib29sZWFuO1xufSkge1xuXHRpZiAodHlwZW9mIHN0ciA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gc3RyO1xuXHR9XG5cblx0Ly8gdmFsdWVzIHRoYXQgYXJlIHRvbyBsb25nIHdpbGwgZnJlZXplIHRoZSBVSVxuXHRsZXQgdmFsdWUgPSBzdHIudmFsdWUgPz8gJyc7XG5cdGlmICh2YWx1ZS5sZW5ndGggPiAxMDBfMDAwKSB7XG5cdFx0dmFsdWUgPSBgJHt2YWx1ZS5zdWJzdHIoMCwgMTAwXzAwMCl9XHUyMDI2YDtcblx0fVxuXG5cdGNvbnN0IHJlbmRlcmVyID0gY3JlYXRlUGxhaW5UZXh0UmVuZGVyZXIoKTtcblx0aWYgKG9wdGlvbnM/LmluY2x1ZGVDb2RlQmxvY2tzRmVuY2VzKSB7XG5cdFx0cmVuZGVyZXIuY29kZSA9IGNvZGVCbG9ja0ZlbmNlcztcblx0fVxuXHRpZiAob3B0aW9ucz8udXNlTGlua0Zvcm1hdHRlcikge1xuXHRcdHJlbmRlcmVyLmxpbmsgPSBsaW5rRm9ybWF0dGVyO1xuXHR9XG5cblx0Y29uc3QgaHRtbCA9IG1hcmtlZC5wYXJzZSh2YWx1ZSwgeyBhc3luYzogZmFsc2UsIHJlbmRlcmVyIH0pO1xuXHRyZXR1cm4gc2FuaXRpemVSZW5kZXJlZE1hcmtkb3duKGh0bWwsIHsgaXNUcnVzdGVkOiBmYWxzZSB9LCB7fSlcblx0XHQudG9TdHJpbmcoKVxuXHRcdC5yZXBsYWNlKC8mKCNcXGQrfFthLXpBLVpdKyk7L2csIG0gPT4gdW5lc2NhcGVJbmZvLmdldChtKSA/PyBtKVxuXHRcdC50cmltKCk7XG59XG5cbmNvbnN0IHVuZXNjYXBlSW5mbyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0WycmcXVvdDsnLCAnXCInXSxcblx0WycmbmJzcDsnLCAnICddLFxuXHRbJyZhbXA7JywgJyYnXSxcblx0WycmIzM5OycsICdcXCcnXSxcblx0WycmbHQ7JywgJzwnXSxcblx0WycmZ3Q7JywgJz4nXSxcbl0pO1xuXG5mdW5jdGlvbiBjcmVhdGVQbGFpblRleHRSZW5kZXJlcigpOiBtYXJrZWQuUmVuZGVyZXIge1xuXHRjb25zdCByZW5kZXJlciA9IG5ldyBtYXJrZWQuUmVuZGVyZXIoKTtcblxuXHRyZW5kZXJlci5jb2RlID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkNvZGUpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiBlc2NhcGUodGV4dCk7XG5cdH07XG5cdHJlbmRlcmVyLmJsb2NrcXVvdGUgPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuQmxvY2txdW90ZSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQgKyAnXFxuJztcblx0fTtcblx0cmVuZGVyZXIuaHRtbCA9IChfOiBtYXJrZWQuVG9rZW5zLkhUTUwpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiAnJztcblx0fTtcblx0cmVuZGVyZXIuaGVhZGluZyA9IGZ1bmN0aW9uICh7IHRva2VucyB9OiBtYXJrZWQuVG9rZW5zLkhlYWRpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnBhcnNlci5wYXJzZUlubGluZSh0b2tlbnMpICsgJ1xcbic7XG5cdH07XG5cdHJlbmRlcmVyLmhyID0gKCk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuICcnO1xuXHR9O1xuXHRyZW5kZXJlci5saXN0ID0gZnVuY3Rpb24gKHsgaXRlbXMgfTogbWFya2VkLlRva2Vucy5MaXN0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gaXRlbXMubWFwKHggPT4gdGhpcy5saXN0aXRlbSh4KSkuam9pbignXFxuJykgKyAnXFxuJztcblx0fTtcblx0cmVuZGVyZXIubGlzdGl0ZW0gPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuTGlzdEl0ZW0pOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0ICsgJ1xcbic7XG5cdH07XG5cdHJlbmRlcmVyLnBhcmFncmFwaCA9IGZ1bmN0aW9uICh7IHRva2VucyB9OiBtYXJrZWQuVG9rZW5zLlBhcmFncmFwaCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VyLnBhcnNlSW5saW5lKHRva2VucykgKyAnXFxuJztcblx0fTtcblx0cmVuZGVyZXIudGFibGUgPSBmdW5jdGlvbiAoeyBoZWFkZXIsIHJvd3MgfTogbWFya2VkLlRva2Vucy5UYWJsZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGhlYWRlci5tYXAoY2VsbCA9PiB0aGlzLnRhYmxlY2VsbChjZWxsKSkuam9pbignICcpICsgJ1xcbicgKyByb3dzLm1hcChjZWxscyA9PiBjZWxscy5tYXAoY2VsbCA9PiB0aGlzLnRhYmxlY2VsbChjZWxsKSkuam9pbignICcpKS5qb2luKCdcXG4nKSArICdcXG4nO1xuXHR9O1xuXHRyZW5kZXJlci50YWJsZXJvdyA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5UYWJsZVJvdyk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH07XG5cdHJlbmRlcmVyLnRhYmxlY2VsbCA9IGZ1bmN0aW9uICh7IHRva2VucyB9OiBtYXJrZWQuVG9rZW5zLlRhYmxlQ2VsbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VyLnBhcnNlSW5saW5lKHRva2Vucyk7XG5cdH07XG5cdHJlbmRlcmVyLnN0cm9uZyA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5TdHJvbmcpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9O1xuXHRyZW5kZXJlci5lbSA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5FbSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH07XG5cdHJlbmRlcmVyLmNvZGVzcGFuID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkNvZGVzcGFuKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fTtcblx0cmVuZGVyZXIuYnIgPSAoXzogbWFya2VkLlRva2Vucy5Ccik6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuICdcXG4nO1xuXHR9O1xuXHRyZW5kZXJlci5kZWwgPSAoeyB0ZXh0IH06IG1hcmtlZC5Ub2tlbnMuRGVsKTogc3RyaW5nID0+IHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fTtcblx0cmVuZGVyZXIuaW1hZ2UgPSAoXzogbWFya2VkLlRva2Vucy5JbWFnZSk6IHN0cmluZyA9PiB7XG5cdFx0cmV0dXJuICcnO1xuXHR9O1xuXHRyZW5kZXJlci50ZXh0ID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLlRleHQpOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9O1xuXHRyZW5kZXJlci5saW5rID0gKHsgdGV4dCB9OiBtYXJrZWQuVG9rZW5zLkxpbmspOiBzdHJpbmcgPT4ge1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9O1xuXHRyZXR1cm4gcmVuZGVyZXI7XG59XG5cbmNvbnN0IGNvZGVCbG9ja0ZlbmNlcyA9ICh7IHRleHQgfTogbWFya2VkLlRva2Vucy5Db2RlKTogc3RyaW5nID0+IHtcblx0cmV0dXJuIGBcXG5cXGBcXGBcXGBcXG4ke2VzY2FwZSh0ZXh0KX1cXG5cXGBcXGBcXGBcXG5gO1xufTtcblxuY29uc3QgbGlua0Zvcm1hdHRlciA9ICh7IHRleHQsIGhyZWYgfTogbWFya2VkLlRva2Vucy5MaW5rKTogc3RyaW5nID0+IHtcblx0dHJ5IHtcblx0XHRpZiAoaHJlZikge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGhyZWYpO1xuXHRcdFx0cmV0dXJuIHRleHQudHJpbSgpIHx8IGJhc2VuYW1lKHVyaSk7XG5cdFx0fVxuXHR9IGNhdGNoIChlKSB7XG5cdFx0cmV0dXJuIHRleHQudHJpbSgpIHx8IHBhdGhCYXNlbmFtZShocmVmKTtcblx0fVxuXHRyZXR1cm4gdGV4dDtcbn07XG5cbmZ1bmN0aW9uIG1lcmdlUmF3VG9rZW5UZXh0KHRva2VuczogbWFya2VkLlRva2VuW10pOiBzdHJpbmcge1xuXHRsZXQgbWVyZ2VkVG9rZW5UZXh0ID0gJyc7XG5cdHRva2Vucy5mb3JFYWNoKHRva2VuID0+IHtcblx0XHRtZXJnZWRUb2tlblRleHQgKz0gdG9rZW4ucmF3O1xuXHR9KTtcblx0cmV0dXJuIG1lcmdlZFRva2VuVGV4dDtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVTaW5nbGVMaW5lUGF0dGVybih0b2tlbjogbWFya2VkLlRva2Vucy5UZXh0IHwgbWFya2VkLlRva2Vucy5QYXJhZ3JhcGgpOiBtYXJrZWQuVG9rZW4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXRva2VuLnRva2Vucykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gdG9rZW4udG9rZW5zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3Qgc3VidG9rZW4gPSB0b2tlbi50b2tlbnNbaV07XG5cdFx0aWYgKHN1YnRva2VuLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBzdWJ0b2tlbi5yYXcuc3BsaXQoJ1xcbicpO1xuXHRcdFx0Y29uc3QgbGFzdExpbmUgPSBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXTtcblxuXHRcdFx0Ly8gQW4gaW5jb21wbGV0ZSBsaW5rIHRhcmdldCBtdXN0IGJlIGNvbXBsZXRlZCBiZWZvcmUgZW1waGFzaXMvY29kZXNwYW4uIFRoZSBsaW5rIGlzIHRoZVxuXHRcdFx0Ly8gaW5uZXJtb3N0IHVuZmluaXNoZWQgY29uc3RydWN0LCBzbyBhbnkgZW1waGFzaXMgbWFya2VyIChlLmcuIHRoZSBgKipgIGluIGAqKlt0ZXh0XShodHRgKVxuXHRcdFx0Ly8gYmVsb25ncyB0byBhbiBlbmNsb3Npbmcgc3Bhbi4gQ29tcGxldGluZyB0aGUgZW1waGFzaXMgZmlyc3Qgd291bGQgbGVhdmUgdGhlIGxpbmsgYnJva2VuLlxuXHRcdFx0aWYgKFxuXHRcdFx0XHQvLyBUZXh0IHdpdGggc3RhcnQgb2YgbGluayB0YXJnZXRcblx0XHRcdFx0aGFzTGlua1RleHRBbmRTdGFydE9mTGlua1RhcmdldChsYXN0TGluZSkgfHxcblx0XHRcdFx0Ly8gVGhpcyB0b2tlbiBkb2Vzbid0IGhhdmUgdGhlIGxpbmsgdGV4dCwgZWcgaWYgaXQgY29udGFpbnMgb3RoZXIgbWFya2Rvd24gY29uc3RydWN0cyB0aGF0IGFyZSBpbiBvdGhlciBzdWJ0b2tlbnMuXG5cdFx0XHRcdC8vIEJ1dCBzb21lIHByZWNlZGluZyB0b2tlbiBkb2VzIGhhdmUgYW4gdW5iYWxhbmNlZCBbIGF0IGxlYXN0XG5cdFx0XHRcdGhhc1N0YXJ0T2ZMaW5rVGFyZ2V0QW5kTm9MaW5rVGV4dChsYXN0TGluZSkgJiYgdG9rZW4udG9rZW5zLnNsaWNlKDAsIGkpLnNvbWUodCA9PiB0LnR5cGUgPT09ICd0ZXh0JyAmJiB0LnJhdy5tYXRjaCgvXFxbW15cXF1dKiQvKSlcblx0XHRcdCkge1xuXHRcdFx0XHRjb25zdCBuZXh0VHdvU3ViVG9rZW5zID0gdG9rZW4udG9rZW5zLnNsaWNlKGkgKyAxKTtcblxuXHRcdFx0XHQvLyBBIG1hcmtkb3duIGxpbmsgY2FuIGxvb2sgbGlrZVxuXHRcdFx0XHQvLyBbbGluayB0ZXh0XShodHRwczovL21pY3Jvc29mdC5jb20gXCJtb3JlIHRleHRcIilcblx0XHRcdFx0Ly8gV2hlcmUgXCJtb3JlIHRleHRcIiBpcyBhIHRpdGxlIGZvciB0aGUgbGluayBvciBhbiBhcmd1bWVudCB0byBhIHZzY29kZSBjb21tYW5kIGxpbmtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdC8vIElmIHRoZSBsaW5rIHdhcyBwYXJzZWQgYXMgYSBsaW5rLCB0aGVuIGxvb2sgZm9yIGEgbGluayB0b2tlbiBhbmQgYSB0ZXh0IHRva2VuIHdpdGggYSBxdW90ZVxuXHRcdFx0XHRcdG5leHRUd29TdWJUb2tlbnNbMF0/LnR5cGUgPT09ICdsaW5rJyAmJiBuZXh0VHdvU3ViVG9rZW5zWzFdPy50eXBlID09PSAndGV4dCcgJiYgbmV4dFR3b1N1YlRva2Vuc1sxXS5yYXcubWF0Y2goL14gKlwiW15cIl0qJC8pIHx8XG5cdFx0XHRcdFx0Ly8gQW5kIGlmIHRoZSBsaW5rIHdhcyBub3QgcGFyc2VkIGFzIGEgbGluayAoZWcgY29tbWFuZCBsaW5rKSwganVzdCBsb29rIGZvciBhIHNpbmdsZSBxdW90ZSBpbiB0aGlzIHRva2VuXG5cdFx0XHRcdFx0bGFzdExpbmUubWF0Y2goL15bXlwiXSogK1wiW15cIl0qJC8pXG5cdFx0XHRcdCkge1xuXG5cdFx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlTGlua1RhcmdldEFyZyh0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlTGlua1RhcmdldCh0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKGxhc3RMaW5lLmluY2x1ZGVzKCdgJykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlQ29kZXNwYW4odG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIGlmIChsYXN0TGluZS5pbmNsdWRlcygnKionKSkge1xuXHRcdFx0XHRyZXR1cm4gY29tcGxldGVEb3VibGVzdGFyKHRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0ZWxzZSBpZiAobGFzdExpbmUubWF0Y2goL1xcKlxcdy8pKSB7XG5cdFx0XHRcdHJldHVybiBjb21wbGV0ZVN0YXIodG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRlbHNlIGlmIChsYXN0TGluZS5tYXRjaCgvKF58XFxzKV9fXFx3LykpIHtcblx0XHRcdFx0cmV0dXJuIGNvbXBsZXRlRG91YmxlVW5kZXJzY29yZSh0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdGVsc2UgaWYgKGxhc3RMaW5lLm1hdGNoKC8oXnxcXHMpX1xcdy8pKSB7XG5cdFx0XHRcdHJldHVybiBjb21wbGV0ZVVuZGVyc2NvcmUodG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb250YWlucyB0aGUgc3RhcnQgb2YgbGluayB0ZXh0LCBhbmQgbm8gZm9sbG93aW5nIHRva2VucyBjb250YWluIHRoZSBsaW5rIHRhcmdldFxuXHRcdFx0ZWxzZSBpZiAobGFzdExpbmUubWF0Y2goLyhefFxccylcXFtcXHcqW15cXF1dKiQvKSkge1xuXHRcdFx0XHRyZXR1cm4gY29tcGxldGVMaW5rVGV4dCh0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaGFzTGlua1RleHRBbmRTdGFydE9mTGlua1RhcmdldChzdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHQvLyBBbGxvdyBsaW5rcyBhZnRlciBvcGVuaW5nIHBhcmVudGhlc2VzIGFuZCBlbXBoYXNpcy9zdHJpa2V0aHJvdWdoIG1hcmtlcnMsIHN1Y2ggYXMgYCoqW3RleHRdKGh0dGAuXG5cdHJldHVybiAhIXN0ci5tYXRjaCgvKD86XnxbXFxzKCpffl0pXFxbLipcXF1cXChcXHcqLyk7XG59XG5cbmZ1bmN0aW9uIGhhc1N0YXJ0T2ZMaW5rVGFyZ2V0QW5kTm9MaW5rVGV4dChzdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFzdHIubWF0Y2goL15bXlxcW10qXFxdXFwoW15cXCldKiQvKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVCbG9ja3F1b3RlUGF0dGVybihibG9ja3F1b3RlOiBtYXJrZWQuVG9rZW5zLkJsb2NrcXVvdGUsIGxpbmtzOiBtYXJrZWQuTGlua3MpOiBtYXJrZWQuVG9rZW5zLkJsb2NrcXVvdGUgfCB1bmRlZmluZWQge1xuXHRsZXQgbGFzdEludGVyZXN0aW5nSW5kZXggPSBibG9ja3F1b3RlLnRva2Vucy5sZW5ndGggLSAxO1xuXHR3aGlsZSAobGFzdEludGVyZXN0aW5nSW5kZXggPj0gMCAmJiBibG9ja3F1b3RlLnRva2Vuc1tsYXN0SW50ZXJlc3RpbmdJbmRleF0udHlwZSA9PT0gJ3NwYWNlJykge1xuXHRcdGxhc3RJbnRlcmVzdGluZ0luZGV4LS07XG5cdH1cblxuXHRjb25zdCBsYXN0VG9rZW4gPSBibG9ja3F1b3RlLnRva2Vuc1tsYXN0SW50ZXJlc3RpbmdJbmRleF07XG5cdGlmIChsYXN0VG9rZW4/LnR5cGUgIT09ICdwYXJhZ3JhcGgnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGNvbXBsZXRlZFRva2VuID0gY29tcGxldGVTaW5nbGVMaW5lUGF0dGVybihsYXN0VG9rZW4gYXMgbWFya2VkLlRva2Vucy5QYXJhZ3JhcGgpO1xuXHRpZiAoIWNvbXBsZXRlZFRva2VuKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGNvbXBsZXRpb24gPSBjb21wbGV0ZWRUb2tlbi5yYXcuc2xpY2UobGFzdFRva2VuLnJhdy50cmltRW5kKCkubGVuZ3RoKTtcblx0Y29uc3QgdHJhaWxpbmdRdW90ZU9ubHlMaW5lcyA9IGJsb2NrcXVvdGUucmF3Lm1hdGNoKC8oPzpcXG5bIFxcdF0qPlsgXFx0XSooPz1cXG58JCkpK1xcbj8kLyk/LlswXSA/PyAnJztcblx0Y29uc3QgaW5zZXJ0aW9uSW5kZXggPSBibG9ja3F1b3RlLnJhdy5sZW5ndGggLSB0cmFpbGluZ1F1b3RlT25seUxpbmVzLmxlbmd0aDtcblx0Y29uc3QgY29tcGxldGVkUmF3ID0gYmxvY2txdW90ZS5yYXcuc2xpY2UoMCwgaW5zZXJ0aW9uSW5kZXgpICsgY29tcGxldGlvbiArIHRyYWlsaW5nUXVvdGVPbmx5TGluZXM7XG5cdGNvbnN0IGxleGVyID0gbmV3IG1hcmtlZC5MZXhlcigpO1xuXHRsZXhlci50b2tlbnMubGlua3MgPSBsaW5rcztcblx0Y29uc3QgY29tcGxldGVkQmxvY2txdW90ZSA9IGxleGVyLmxleChjb21wbGV0ZWRSYXcpWzBdO1xuXHRpZiAoY29tcGxldGVkQmxvY2txdW90ZS50eXBlID09PSAnYmxvY2txdW90ZScpIHtcblx0XHRyZXR1cm4gY29tcGxldGVkQmxvY2txdW90ZSBhcyBtYXJrZWQuVG9rZW5zLkJsb2NrcXVvdGU7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZUxpc3RJdGVtUGF0dGVybihsaXN0OiBtYXJrZWQuVG9rZW5zLkxpc3QpOiBtYXJrZWQuVG9rZW5zLkxpc3QgfCB1bmRlZmluZWQge1xuXHQvLyBQYXRjaCB1cCB0aGlzIG9uZSBsaXN0IGl0ZW1cblx0Y29uc3QgbGFzdExpc3RJdGVtID0gbGlzdC5pdGVtc1tsaXN0Lml0ZW1zLmxlbmd0aCAtIDFdO1xuXHRjb25zdCBsYXN0TGlzdFN1YlRva2VuID0gbGFzdExpc3RJdGVtLnRva2VucyA/IGxhc3RMaXN0SXRlbS50b2tlbnNbbGFzdExpc3RJdGVtLnRva2Vucy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblxuXHQvKlxuXHRFeGFtcGxlIGxpc3QgdG9rZW4gc3RydWN0dXJlczpcblxuXHRsaXN0XG5cdFx0bGlzdF9pdGVtXG5cdFx0XHR0ZXh0XG5cdFx0XHRcdHRleHRcblx0XHRcdFx0Y29kZXNwYW5cblx0XHRcdFx0bGlua1xuXHRcdGxpc3RfaXRlbVxuXHRcdFx0dGV4dFxuXHRcdFx0Y29kZSAvLyBDb21wbGV0ZSBpbmRlbnRlZCBjb2RlYmxvY2tcblx0XHRsaXN0X2l0ZW1cblx0XHRcdHRleHRcblx0XHRcdHNwYWNlXG5cdFx0XHR0ZXh0XG5cdFx0XHRcdHRleHQgLy8gSW5jb21wbGV0ZSBpbmRlbnRlZCBjb2RlYmxvY2tcblx0XHRsaXN0X2l0ZW1cblx0XHRcdHRleHRcblx0XHRcdGxpc3QgLy8gTmVzdGVkIGxpc3Rcblx0XHRcdFx0bGlzdF9pdGVtXG5cdFx0XHRcdFx0dGV4dFxuXHRcdFx0XHRcdFx0dGV4dFxuXG5cdENvbnRyYXN0IHdpdGggcGFyYWdyYXBoOlxuXHRwYXJhZ3JhcGhcblx0XHR0ZXh0XG5cdFx0Y29kZXNwYW5cblx0Ki9cblxuXHRjb25zdCBsaXN0RW5kc0luSGVhZGluZyA9IChsaXN0OiBtYXJrZWQuVG9rZW5zLkxpc3QpOiBib29sZWFuID0+IHtcblx0XHQvLyBBIGxpc3QgaXRlbSBjYW4gYmUgcmVuZGVyZWQgYXMgYSBoZWFkaW5nIGZvciBzb21lIHJlYXNvbiB3aGVuIGl0IGhhcyBhIHN1Yml0ZW0gd2hlcmUgd2UgaGF2ZW4ndCByZW5kZXJlZCB0aGUgdGV4dCB5ZXQgbGlrZSB0aGlzOlxuXHRcdC8vIDEuIGxpc3QgaXRlbVxuXHRcdC8vICAgIC1cblx0XHRjb25zdCBsYXN0SXRlbSA9IGxpc3QuaXRlbXMuYXQoLTEpO1xuXHRcdGNvbnN0IGxhc3RUb2tlbiA9IGxhc3RJdGVtPy50b2tlbnMuYXQoLTEpO1xuXHRcdHJldHVybiBsYXN0VG9rZW4/LnR5cGUgPT09ICdoZWFkaW5nJyB8fCBsYXN0VG9rZW4/LnR5cGUgPT09ICdsaXN0JyAmJiBsaXN0RW5kc0luSGVhZGluZyhsYXN0VG9rZW4gYXMgbWFya2VkLlRva2Vucy5MaXN0KTtcblx0fTtcblxuXHRsZXQgbmV3VG9rZW46IG1hcmtlZC5Ub2tlbiB8IHVuZGVmaW5lZDtcblx0aWYgKGxhc3RMaXN0U3ViVG9rZW4/LnR5cGUgPT09ICd0ZXh0JyAmJiAhKCdpblJhd0Jsb2NrJyBpbiBsYXN0TGlzdEl0ZW0pKSB7IC8vIFdoeSBkb2VzIFRhZyBoYXZlIGEgdHlwZSBvZiAndGV4dCdcblx0XHRuZXdUb2tlbiA9IGNvbXBsZXRlU2luZ2xlTGluZVBhdHRlcm4obGFzdExpc3RTdWJUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLlRleHQpO1xuXHR9IGVsc2UgaWYgKGxpc3RFbmRzSW5IZWFkaW5nKGxpc3QpKSB7XG5cdFx0Y29uc3QgbmV3TGlzdCA9IG1hcmtlZC5sZXhlcihsaXN0LnJhdy50cmltKCkgKyAnICZuYnNwOycpWzBdIGFzIG1hcmtlZC5Ub2tlbnMuTGlzdDtcblx0XHRpZiAobmV3TGlzdC50eXBlICE9PSAnbGlzdCcpIHtcblx0XHRcdC8vIFNvbWV0aGluZyB3ZW50IHdyb25nXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBuZXdMaXN0O1xuXHR9XG5cblx0aWYgKCFuZXdUb2tlbiB8fCBuZXdUb2tlbi50eXBlICE9PSAncGFyYWdyYXBoJykgeyAvLyAndGV4dCcgaXRlbSBpbnNpZGUgdGhlIGxpc3QgaXRlbSB0dXJucyBpbnRvIHBhcmFncmFwaFxuXHRcdC8vIE5vdGhpbmcgdG8gZml4LCBvciBub3QgYSBwYXR0ZXJuIHdlIHdlcmUgZXhwZWN0aW5nXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgcHJldmlvdXNMaXN0SXRlbXNUZXh0ID0gbWVyZ2VSYXdUb2tlblRleHQobGlzdC5pdGVtcy5zbGljZSgwLCAtMSkpO1xuXG5cdC8vIEdyYWJiaW5nIHRoZSBgLSBgIG9yIGAxLiBgIG9yIGAqIGAgb2ZmIHRoZSBsaXN0IGl0ZW0gYmVjYXVzZSBJIGNhbid0IGZpbmQgYSBiZXR0ZXIgd2F5IHRvIGRvIHRoaXNcblx0Y29uc3QgbGFzdExpc3RJdGVtTGVhZCA9IGxhc3RMaXN0SXRlbS5yYXcubWF0Y2goL14oXFxzKigtfFxcZCtcXC58XFwqKSArKS8pPy5bMF07XG5cdGlmICghbGFzdExpc3RJdGVtTGVhZCkge1xuXHRcdC8vIElzIGJhZGx5IGZvcm1hdHRlZFxuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IG5ld0xpc3RJdGVtVGV4dCA9IGxhc3RMaXN0SXRlbUxlYWQgK1xuXHRcdG1lcmdlUmF3VG9rZW5UZXh0KGxhc3RMaXN0SXRlbS50b2tlbnMuc2xpY2UoMCwgLTEpKSArXG5cdFx0bmV3VG9rZW4ucmF3O1xuXG5cdGNvbnN0IG5ld0xpc3QgPSBtYXJrZWQubGV4ZXIocHJldmlvdXNMaXN0SXRlbXNUZXh0ICsgbmV3TGlzdEl0ZW1UZXh0KVswXSBhcyBtYXJrZWQuVG9rZW5zLkxpc3Q7XG5cdGlmIChuZXdMaXN0LnR5cGUgIT09ICdsaXN0Jykge1xuXHRcdC8vIFNvbWV0aGluZyB3ZW50IHdyb25nXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmV0dXJuIG5ld0xpc3Q7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlSGVhZGluZyh0b2tlbjogbWFya2VkLlRva2Vucy5IZWFkaW5nLCBmdWxsUmF3VGV4dDogc3RyaW5nKTogbWFya2VkLlRva2Vuc0xpc3QgfCB2b2lkIHtcblx0aWYgKHRva2VuLnJhdy5tYXRjaCgvLVxccyokLykpIHtcblx0XHRyZXR1cm4gbWFya2VkLmxleGVyKGZ1bGxSYXdUZXh0ICsgJyAmbmJzcDsnKTtcblx0fVxufVxuXG5jb25zdCBtYXhJbmNvbXBsZXRlVG9rZW5zRml4Um91bmRzID0gMztcbmV4cG9ydCBmdW5jdGlvbiBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2VuczogbWFya2VkLlRva2Vuc0xpc3QpOiBtYXJrZWQuVG9rZW5zTGlzdCB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4SW5jb21wbGV0ZVRva2Vuc0ZpeFJvdW5kczsgaSsrKSB7XG5cdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vuc09uY2UodG9rZW5zKTtcblx0XHRpZiAobmV3VG9rZW5zKSB7XG5cdFx0XHR0b2tlbnMgPSBuZXdUb2tlbnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0b2tlbnM7XG59XG5cbmZ1bmN0aW9uIGZpbGxJbkluY29tcGxldGVUb2tlbnNPbmNlKHRva2VuczogbWFya2VkLlRva2Vuc0xpc3QpOiBtYXJrZWQuVG9rZW5zTGlzdCB8IG51bGwge1xuXHRsZXQgaTogbnVtYmVyO1xuXHRsZXQgbmV3VG9rZW5zOiBtYXJrZWQuVG9rZW5bXSB8IHVuZGVmaW5lZDtcblx0Zm9yIChpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHRva2VuID0gdG9rZW5zW2ldO1xuXG5cdFx0aWYgKHRva2VuLnR5cGUgPT09ICdwYXJhZ3JhcGgnICYmIHRva2VuLnJhdy5tYXRjaCgvKFxcbnxeKVxcfC8pKSB7XG5cdFx0XHRuZXdUb2tlbnMgPSBjb21wbGV0ZVRhYmxlKHRva2Vucy5zbGljZShpKSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHQvLyBGaW5kIHRoZSBsYXN0IFwiaW50ZXJlc3RpbmdcIiB0b2tlbiwgc2tpcHBpbmcgdHJhaWxpbmcgYHNwYWNlYCBhbmQgYGh0bWxgXG5cdC8vIHRva2Vucy4gQ2FsbGVycyBsaWtlIHRoZSBjaGF0IGNvbnRlbnQgcmVuZGVyZXIgd3JhcCBtYXJrZG93biBpblxuXHQvLyBgPGJvZHk+Li4uPC9ib2R5PmAgKHNvIGRvbXB1cmlmeSBrZWVwcyBsZWFkaW5nIGNvbW1lbnRzKSwgd2hpY2ggbGVhdmVzXG5cdC8vIGA8L2JvZHk+YCBhcyB0aGUgbGl0ZXJhbCBsYXN0IHRva2VuIFx1MjAxNCB3aXRob3V0IHRoaXMgc2tpcCwgdGhlXG5cdC8vIHBhcmFncmFwaCAvIGxpc3QgZml4dXBzIG5ldmVyIGZpcmUgZm9yIHRoYXQgY29udGVudC5cblx0bGV0IGxhc3RJbnRlcmVzdGluZ0lkeCA9IHRva2Vucy5sZW5ndGggLSAxO1xuXHR3aGlsZSAobGFzdEludGVyZXN0aW5nSWR4ID49IDAgJiYgKHRva2Vuc1tsYXN0SW50ZXJlc3RpbmdJZHhdLnR5cGUgPT09ICdzcGFjZScgfHwgdG9rZW5zW2xhc3RJbnRlcmVzdGluZ0lkeF0udHlwZSA9PT0gJ2h0bWwnKSkge1xuXHRcdGxhc3RJbnRlcmVzdGluZ0lkeC0tO1xuXHR9XG5cdGNvbnN0IGxhc3RJbnRlcmVzdGluZ1Rva2VuID0gbGFzdEludGVyZXN0aW5nSWR4ID49IDAgPyB0b2tlbnNbbGFzdEludGVyZXN0aW5nSWR4XSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgdHJhaWxpbmdUb2tlbnMgPSB0b2tlbnMuc2xpY2UobGFzdEludGVyZXN0aW5nSWR4ICsgMSk7XG5cblx0aWYgKCFuZXdUb2tlbnMgJiYgbGFzdEludGVyZXN0aW5nVG9rZW4/LnR5cGUgPT09ICdsaXN0Jykge1xuXHRcdGNvbnN0IG5ld0xpc3RUb2tlbiA9IGNvbXBsZXRlTGlzdEl0ZW1QYXR0ZXJuKGxhc3RJbnRlcmVzdGluZ1Rva2VuIGFzIG1hcmtlZC5Ub2tlbnMuTGlzdCk7XG5cdFx0aWYgKG5ld0xpc3RUb2tlbikge1xuXHRcdFx0bmV3VG9rZW5zID0gW25ld0xpc3RUb2tlbiwgLi4udHJhaWxpbmdUb2tlbnNdO1xuXHRcdFx0aSA9IGxhc3RJbnRlcmVzdGluZ0lkeDtcblx0XHR9XG5cdH1cblxuXHRpZiAoIW5ld1Rva2VucyAmJiBsYXN0SW50ZXJlc3RpbmdUb2tlbj8udHlwZSA9PT0gJ2Jsb2NrcXVvdGUnKSB7XG5cdFx0Y29uc3QgbmV3QmxvY2txdW90ZVRva2VuID0gY29tcGxldGVCbG9ja3F1b3RlUGF0dGVybihsYXN0SW50ZXJlc3RpbmdUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLkJsb2NrcXVvdGUsIHRva2Vucy5saW5rcyk7XG5cdFx0aWYgKG5ld0Jsb2NrcXVvdGVUb2tlbikge1xuXHRcdFx0bmV3VG9rZW5zID0gW25ld0Jsb2NrcXVvdGVUb2tlbiwgLi4udHJhaWxpbmdUb2tlbnNdO1xuXHRcdFx0aSA9IGxhc3RJbnRlcmVzdGluZ0lkeDtcblx0XHR9XG5cdH1cblxuXHRpZiAoIW5ld1Rva2VucyAmJiBsYXN0SW50ZXJlc3RpbmdUb2tlbj8udHlwZSA9PT0gJ3BhcmFncmFwaCcpIHtcblx0XHQvLyBPbmx5IG9wZXJhdGVzIG9uIGEgc2luZ2xlIHRva2VuLCBiZWNhdXNlIGFueSBuZXdsaW5lIHRoYXQgZm9sbG93cyB0aGlzIHNob3VsZCBicmVhayB0aGVzZSBwYXR0ZXJuc1xuXHRcdGNvbnN0IG5ld1Rva2VuID0gY29tcGxldGVTaW5nbGVMaW5lUGF0dGVybihsYXN0SW50ZXJlc3RpbmdUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLlBhcmFncmFwaCk7XG5cdFx0aWYgKG5ld1Rva2VuKSB7XG5cdFx0XHRuZXdUb2tlbnMgPSBbbmV3VG9rZW4sIC4uLnRyYWlsaW5nVG9rZW5zXTtcblx0XHRcdGkgPSBsYXN0SW50ZXJlc3RpbmdJZHg7XG5cdFx0fVxuXHR9XG5cblx0aWYgKG5ld1Rva2Vucykge1xuXHRcdGNvbnN0IG5ld1Rva2Vuc0xpc3QgPSBbXG5cdFx0XHQuLi50b2tlbnMuc2xpY2UoMCwgaSksXG5cdFx0XHQuLi5uZXdUb2tlbnNcblx0XHRdO1xuXHRcdChuZXdUb2tlbnNMaXN0IGFzIG1hcmtlZC5Ub2tlbnNMaXN0KS5saW5rcyA9IHRva2Vucy5saW5rcztcblx0XHRyZXR1cm4gbmV3VG9rZW5zTGlzdCBhcyBtYXJrZWQuVG9rZW5zTGlzdDtcblx0fVxuXG5cdGNvbnN0IGxhc3RUb2tlbiA9IHRva2Vucy5hdCgtMSk7XG5cdGlmIChsYXN0VG9rZW4/LnR5cGUgPT09ICdoZWFkaW5nJykge1xuXHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gY29tcGxldGVIZWFkaW5nKGxhc3RUb2tlbiBhcyBtYXJrZWQuVG9rZW5zLkhlYWRpbmcsIG1lcmdlUmF3VG9rZW5UZXh0KHRva2VucykpO1xuXHRcdGlmIChjb21wbGV0ZVRva2Vucykge1xuXHRcdFx0cmV0dXJuIGNvbXBsZXRlVG9rZW5zO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5cbmZ1bmN0aW9uIGNvbXBsZXRlQ29kZXNwYW4odG9rZW46IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW4sICdgJyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlU3Rhcih0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnKicpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZVVuZGVyc2NvcmUodG9rZW5zOiBtYXJrZWQuVG9rZW4pOiBtYXJrZWQuVG9rZW4ge1xuXHRyZXR1cm4gY29tcGxldGVXaXRoU3RyaW5nKHRva2VucywgJ18nKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVMaW5rVGFyZ2V0KHRva2VuczogbWFya2VkLlRva2VuKTogbWFya2VkLlRva2VuIHtcblx0cmV0dXJuIGNvbXBsZXRlV2l0aFN0cmluZyh0b2tlbnMsICcpJywgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZUxpbmtUYXJnZXRBcmcodG9rZW5zOiBtYXJrZWQuVG9rZW4pOiBtYXJrZWQuVG9rZW4ge1xuXHRyZXR1cm4gY29tcGxldGVXaXRoU3RyaW5nKHRva2VucywgJ1wiKScsIGZhbHNlKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVMaW5rVGV4dCh0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnXShodHRwczovL21pY3Jvc29mdC5jb20pJywgZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZURvdWJsZXN0YXIodG9rZW5zOiBtYXJrZWQuVG9rZW4pOiBtYXJrZWQuVG9rZW4ge1xuXHRyZXR1cm4gY29tcGxldGVXaXRoU3RyaW5nKHRva2VucywgJyoqJyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlRG91YmxlVW5kZXJzY29yZSh0b2tlbnM6IG1hcmtlZC5Ub2tlbik6IG1hcmtlZC5Ub2tlbiB7XG5cdHJldHVybiBjb21wbGV0ZVdpdGhTdHJpbmcodG9rZW5zLCAnX18nKTtcbn1cblxuZnVuY3Rpb24gY29tcGxldGVXaXRoU3RyaW5nKHRva2VuczogbWFya2VkLlRva2VuW10gfCBtYXJrZWQuVG9rZW4sIGNsb3NpbmdTdHJpbmc6IHN0cmluZywgc2hvdWxkVHJpbSA9IHRydWUpOiBtYXJrZWQuVG9rZW4ge1xuXHRjb25zdCBtZXJnZWRSYXdUZXh0ID0gbWVyZ2VSYXdUb2tlblRleHQoQXJyYXkuaXNBcnJheSh0b2tlbnMpID8gdG9rZW5zIDogW3Rva2Vuc10pO1xuXG5cdC8vIElmIGl0IHdhcyBjb21wbGV0ZWQgY29ycmVjdGx5LCB0aGlzIHNob3VsZCBiZSBhIHNpbmdsZSB0b2tlbi5cblx0Ly8gRXhwZWN0aW5nIGVpdGhlciBhIFBhcmFncmFwaCBvciBhIExpc3Rcblx0Y29uc3QgdHJpbW1lZFJhd1RleHQgPSBzaG91bGRUcmltID8gbWVyZ2VkUmF3VGV4dC50cmltRW5kKCkgOiBtZXJnZWRSYXdUZXh0O1xuXHRyZXR1cm4gbWFya2VkLmxleGVyKHRyaW1tZWRSYXdUZXh0ICsgY2xvc2luZ1N0cmluZylbMF07XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlVGFibGUodG9rZW5zOiBtYXJrZWQuVG9rZW5bXSk6IG1hcmtlZC5Ub2tlbltdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWVyZ2VkUmF3VGV4dCA9IG1lcmdlUmF3VG9rZW5UZXh0KHRva2Vucyk7XG5cdGNvbnN0IGxpbmVzID0gbWVyZ2VkUmF3VGV4dC5zcGxpdCgnXFxuJyk7XG5cblx0bGV0IG51bUNvbHM6IG51bWJlciB8IHVuZGVmaW5lZDsgLy8gVGhlIG51bWJlciBvZiBsaW5lMSBjb2wgaGVhZGVyc1xuXHRsZXQgaGFzU2VwYXJhdG9yUm93ID0gZmFsc2U7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBsaW5lID0gbGluZXNbaV0udHJpbSgpO1xuXHRcdGlmICh0eXBlb2YgbnVtQ29scyA9PT0gJ3VuZGVmaW5lZCcgJiYgbGluZS5tYXRjaCgvXlxccypcXHwvKSkge1xuXHRcdFx0Y29uc3QgbGluZTFNYXRjaGVzID0gbGluZS5tYXRjaCgvKFxcfFteXFx8XSspKD89XFx8fCQpL2cpO1xuXHRcdFx0aWYgKGxpbmUxTWF0Y2hlcykge1xuXHRcdFx0XHRudW1Db2xzID0gbGluZTFNYXRjaGVzLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBudW1Db2xzID09PSAnbnVtYmVyJykge1xuXHRcdFx0aWYgKGxpbmUubWF0Y2goL15cXHMqXFx8LykpIHtcblx0XHRcdFx0aWYgKGkgIT09IGxpbmVzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHQvLyBXZSBnb3QgdGhlIGxpbmUxIGhlYWRlciByb3csIGFuZCB0aGUgbGluZTIgc2VwYXJhdG9yIHJvdywgYnV0IHRoZXJlIGFyZSBtb3JlIGxpbmVzLCBhbmQgaXQgd2Fzbid0IHBhcnNlZCBhcyBhIHRhYmxlIVxuXHRcdFx0XHRcdC8vIFRoYXQncyBzdHJhbmdlIGFuZCBtZWFucyB0aGF0IHRoZSB0YWJsZSBpcyBwcm9iYWJseSBtYWxmb3JtZWQgaW4gdGhlIHNvdXJjZSwgc28gSSB3b24ndCB0cnkgdG8gcGF0Y2ggaXQgdXAuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEdvdCBhIGxpbmUyIHNlcGFyYXRvciByb3ctIHBhcnRpYWwgb3IgY29tcGxldGUsIGRvZXNuJ3QgbWF0dGVyLCB3ZSdsbCByZXBsYWNlIGl0IHdpdGggYSBjb3JyZWN0IG9uZVxuXHRcdFx0XHRoYXNTZXBhcmF0b3JSb3cgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVGhlIGxpbmUgYWZ0ZXIgdGhlIGhlYWRlciByb3cgaXNuJ3QgYSB2YWxpZCBzZXBhcmF0b3Igcm93LCBzbyB0aGUgdGFibGUgaXMgbWFsZm9ybWVkLCBkb24ndCBmaXggaXQgdXBcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAodHlwZW9mIG51bUNvbHMgPT09ICdudW1iZXInICYmIG51bUNvbHMgPiAwKSB7XG5cdFx0Y29uc3QgcHJlZml4VGV4dCA9IGhhc1NlcGFyYXRvclJvdyA/IGxpbmVzLnNsaWNlKDAsIC0xKS5qb2luKCdcXG4nKSA6IG1lcmdlZFJhd1RleHQ7XG5cdFx0Y29uc3QgbGluZTFFbmRzSW5QaXBlID0gISFwcmVmaXhUZXh0Lm1hdGNoKC9cXHxcXHMqJC8pO1xuXHRcdGNvbnN0IG5ld1Jhd1RleHQgPSBwcmVmaXhUZXh0ICsgKGxpbmUxRW5kc0luUGlwZSA/ICcnIDogJ3wnKSArIGBcXG58JHsnIC0tLSB8Jy5yZXBlYXQobnVtQ29scyl9YDtcblx0XHRyZXR1cm4gbWFya2VkLmxleGVyKG5ld1Jhd1RleHQpO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQXFDLHNCQUFvRCx3QkFBd0IsNkJBQTZCO0FBQ3ZKLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUFvQztBQUM3QyxZQUFZLFlBQVk7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxlQUFlO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxVQUFVLFNBQVMsbUJBQW1CO0FBQy9DLFNBQVMsY0FBYztBQUN2QixTQUFTLFdBQTBCO0FBQ25DLFlBQVksU0FBUztBQUNyQixZQUFZLGlCQUFpQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVksNEJBQTRCO0FBb0RqRCxTQUFTLGFBQWEsTUFBc0I7QUFDM0MsTUFBSTtBQUNILFVBQU0sU0FBUyxJQUFJLE1BQU0sSUFBSTtBQUM3QixRQUFJLE9BQU8sV0FBVyxRQUFRLE1BQU07QUFDbkMsWUFBTSxPQUFPLE9BQU87QUFDcEIsWUFBTSxXQUFXLE9BQU87QUFDeEIsYUFBTyxtQkFBbUIsV0FBVyxHQUFHLElBQUksSUFBSSxRQUFRLEtB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
