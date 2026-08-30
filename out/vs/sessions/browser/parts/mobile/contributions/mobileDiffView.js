import "./media/mobileOverlayViews.css";
import "./mobileDiffColors.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Gesture, EventType as TouchEventType } from "../../../../../base/browser/touch.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { basename } from "../../../../../base/common/resources.js";
import { linesDiffComputers } from "../../../../../editor/common/diff/linesDiffComputers.js";
import { tokenizeToString } from "../../../../../editor/common/languages/textToHtmlTokenizer.js";
import { TokenizationRegistry } from "../../../../../editor/common/languages.js";
import { generateTokensCSSForColorMap } from "../../../../../editor/common/languages/supports/tokenization.js";
const $ = DOM.$;
const EXTENSION_LANGUAGE_MAP = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascriptreact",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "typescriptreact",
  ".py": "python",
  ".pyw": "python",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".jsonc": "jsonc",
  ".md": "markdown",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".sql": "sql",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".r": "r",
  ".lua": "lua",
  ".dart": "dart"
};
const MOBILE_OPEN_DIFF_VIEW_COMMAND_ID = "sessions.mobile.openDiffView";
class MobileDiffView extends Disposable {
  constructor(workbenchContainer, data, textFileService, languageService) {
    super();
    this.textFileService = textFileService;
    this.languageService = languageService;
    this._onDidDispose = this._register(new Emitter());
    /**
     * Fires when this view has been disposed (either externally or
     * because the user tapped Back). Used by the mobile overlay
     * contribution to clear its `MutableDisposable<MobileDiffView>` slot.
     */
    this.onDidDispose = this._onDidDispose.event;
    this.viewStore = this._register(new DisposableStore());
    this.disposed = false;
    /** Bumped on every body render so late-arriving `textFileService.read`
     *  promises know to drop their results when the user navigated away. */
    this.renderGeneration = 0;
    this.siblings = data.siblings && data.siblings.length > 0 ? data.siblings : [data.diff];
    const startIndex = data.index ?? this.siblings.indexOf(data.diff);
    this.currentIndex = startIndex >= 0 ? startIndex : 0;
    this.render(workbenchContainer);
    this.renderBodyForCurrent();
  }
  render(workbenchContainer) {
    const overlay = DOM.append(workbenchContainer, $("div.mobile-overlay-view"));
    this.viewStore.add(DOM.addDisposableListener(overlay, DOM.EventType.CONTEXT_MENU, (e) => e.preventDefault()));
    this.viewStore.add(toDisposable(() => overlay.remove()));
    const header = DOM.append(overlay, $("div.mobile-overlay-header"));
    const backBtn = DOM.append(header, $("button.mobile-overlay-back-btn", { type: "button" }));
    backBtn.setAttribute("aria-label", localize("diffView.back", "Back"));
    DOM.append(backBtn, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronLeft));
    this.viewStore.add(Gesture.addTarget(backBtn));
    this.viewStore.add(DOM.addDisposableListener(backBtn, DOM.EventType.CLICK, () => this.dispose()));
    this.viewStore.add(DOM.addDisposableListener(backBtn, TouchEventType.Tap, () => this.dispose()));
    const info = DOM.append(header, $("div.mobile-overlay-header-info.inline"));
    this.titleEl = DOM.append(info, $("div.mobile-overlay-header-title"));
    this.subtitleEl = DOM.append(info, $("div.mobile-overlay-header-subtitle"));
    const nav = DOM.append(header, $("div.mobile-diff-nav"));
    this.prevBtn = DOM.append(nav, $("button.mobile-diff-nav-btn.prev", { type: "button" }));
    this.prevBtn.setAttribute("aria-label", localize("diffView.prevFile", "Previous file"));
    DOM.append(this.prevBtn, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronUp));
    this.positionEl = DOM.append(nav, $("span.mobile-diff-nav-position"));
    this.nextBtn = DOM.append(nav, $("button.mobile-diff-nav-btn.next", { type: "button" }));
    this.nextBtn.setAttribute("aria-label", localize("diffView.nextFile", "Next file"));
    DOM.append(this.nextBtn, $("span")).classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this.viewStore.add(Gesture.addTarget(this.prevBtn));
    this.viewStore.add(Gesture.addTarget(this.nextBtn));
    const onPrev = () => this.navigate(-1);
    const onNext = () => this.navigate(1);
    this.viewStore.add(DOM.addDisposableListener(this.prevBtn, DOM.EventType.CLICK, onPrev));
    this.viewStore.add(DOM.addDisposableListener(this.prevBtn, TouchEventType.Tap, onPrev));
    this.viewStore.add(DOM.addDisposableListener(this.nextBtn, DOM.EventType.CLICK, onNext));
    this.viewStore.add(DOM.addDisposableListener(this.nextBtn, TouchEventType.Tap, onNext));
    nav.style.display = this.siblings.length > 1 ? "" : "none";
    const body = DOM.append(overlay, $("div.mobile-overlay-body"));
    this.scrollWrapper = DOM.append(body, $("div.mobile-overlay-scroll"));
    this.contentArea = DOM.append(this.scrollWrapper, $("div.mobile-diff-output"));
    this.viewStore.add(this.attachSwipeNavigation(this.scrollWrapper));
  }
  attachSwipeNavigation(target) {
    const store = new DisposableStore();
    if (this.siblings.length <= 1) {
      return store;
    }
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    const onPointerDown = (e) => {
      if (e.pointerType !== "touch") {
        return;
      }
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
      startTime = Date.now();
    };
    const onPointerUp = (e) => {
      if (!tracking) {
        return;
      }
      tracking = false;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const dt = Date.now() - startTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      const viewportWidth = target.clientWidth;
      const minDistance = viewportWidth * 0.3;
      const velocity = absDx / Math.max(dt, 1);
      if (absDx <= absDy * 1.5) {
        return;
      }
      if (absDx < minDistance && velocity < 0.5) {
        return;
      }
      this.navigate(dx < 0 ? 1 : -1);
    };
    store.add(DOM.addDisposableListener(target, "pointerdown", onPointerDown));
    store.add(DOM.addDisposableListener(target, "pointerup", onPointerUp));
    store.add(DOM.addDisposableListener(target, "pointercancel", () => {
      tracking = false;
    }));
    return store;
  }
  navigate(delta) {
    const next = this.currentIndex + delta;
    if (next < 0 || next >= this.siblings.length) {
      return;
    }
    this.currentIndex = next;
    this.renderBodyForCurrent();
  }
  renderBodyForCurrent() {
    this.renderGeneration++;
    const diff = this.siblings[this.currentIndex];
    const fileNameUri = diff.modifiedURI ?? diff.originalURI;
    const fileName = fileNameUri ? basename(fileNameUri) : "";
    this.titleEl.textContent = fileName;
    DOM.clearNode(this.subtitleEl);
    if (!diff.identical) {
      if (diff.added) {
        DOM.append(this.subtitleEl, $("span.mobile-changes-row-added")).textContent = `+${diff.added}`;
      }
      if (diff.added && diff.removed) {
        DOM.append(this.subtitleEl, document.createTextNode(" "));
      }
      if (diff.removed) {
        DOM.append(this.subtitleEl, $("span.mobile-changes-row-removed")).textContent = `-${diff.removed}`;
      }
    }
    if (this.siblings.length > 1) {
      this.positionEl.textContent = localize(
        "diffView.position",
        "{0} / {1}",
        this.currentIndex + 1,
        this.siblings.length
      );
      this.prevBtn.disabled = this.currentIndex === 0;
      this.nextBtn.disabled = this.currentIndex === this.siblings.length - 1;
      this.prevBtn.setAttribute("aria-disabled", String(this.prevBtn.disabled));
      this.nextBtn.setAttribute("aria-disabled", String(this.nextBtn.disabled));
    }
    this.scrollWrapper.scrollTop = 0;
    this.scrollWrapper.scrollLeft = 0;
    DOM.clearNode(this.contentArea);
    this.loadDiffContent(this.contentArea, diff);
  }
  loadDiffContent(container, diff) {
    if (diff.identical) {
      const empty = DOM.append(container, $("div.mobile-diff-empty-state"));
      empty.textContent = localize("diffView.noChanges", "No changes in this file.");
      return;
    }
    const loadingEl = DOM.append(container, $("div.mobile-diff-empty-state"));
    loadingEl.textContent = localize("diffView.loading", "Loading\u2026");
    const generation = this.renderGeneration;
    const languageId = this.resolveLanguageId(diff);
    void this.loadAndRender(container, diff, languageId, generation);
  }
  async loadAndRender(container, diff, languageId, generation) {
    const [originalText, modifiedText] = await Promise.all([
      diff.originalURI ? this.textFileService.read(diff.originalURI, { acceptTextOnly: true }).then((m) => m.value).catch(() => "") : Promise.resolve(""),
      diff.modifiedURI ? this.textFileService.read(diff.modifiedURI, { acceptTextOnly: true }).then((m) => m.value).catch(() => "") : Promise.resolve("")
    ]);
    if (this.disposed || generation !== this.renderGeneration) {
      return;
    }
    const hunks = computeUnifiedDiff(originalText, modifiedText);
    if (hunks.length === 0) {
      DOM.clearNode(container);
      const empty = DOM.append(container, $("div.mobile-diff-empty-state"));
      empty.textContent = localize("diffView.noChanges", "No changes in this file.");
      return;
    }
    const [origLineHtml, modLineHtml] = await Promise.all([
      tokenizeFileLines(this.languageService, originalText, languageId),
      tokenizeFileLines(this.languageService, modifiedText, languageId)
    ]);
    const hasRealTokens = hasMultipleTokenClasses(origLineHtml) || hasMultipleTokenClasses(modLineHtml);
    const origLines = hasRealTokens ? origLineHtml : regexTokenizeLines(originalText, languageId);
    const modLines = hasRealTokens ? modLineHtml : regexTokenizeLines(modifiedText, languageId);
    if (this.disposed || generation !== this.renderGeneration) {
      return;
    }
    DOM.clearNode(container);
    const colorMap = TokenizationRegistry.getColorMap();
    if (colorMap && hasRealTokens) {
      const styleEl = document.createElement("style");
      styleEl.textContent = generateTokensCSSForColorMap(colorMap);
      container.appendChild(styleEl);
    }
    this.renderHunks(container, hunks, origLines, modLines);
  }
  resolveLanguageId(diff) {
    const uri = diff.modifiedURI ?? diff.originalURI;
    if (!uri) {
      return "plaintext";
    }
    const guessed = this.languageService.guessLanguageIdByFilepathOrFirstLine(uri);
    if (guessed && guessed !== "unknown") {
      return guessed;
    }
    const name = basename(uri);
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    return EXTENSION_LANGUAGE_MAP[ext] ?? "plaintext";
  }
  renderHunks(container, hunks, origLineHtml, modLineHtml) {
    for (const hunk of hunks) {
      const headerEl = DOM.append(container, $("div.mobile-diff-hunk-header"));
      headerEl.textContent = hunk.header;
      for (const line of hunk.lines) {
        const row = DOM.append(container, $("div.mobile-diff-line"));
        row.classList.add(line.type);
        const numEl = DOM.append(row, $("span.mobile-diff-line-num"));
        numEl.textContent = line.lineNum !== void 0 ? String(line.lineNum) : "";
        const gutter = DOM.append(row, $("span.mobile-diff-gutter"));
        gutter.textContent = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
        const content = DOM.append(row, $("span.mobile-diff-content"));
        if (line.lineNum !== void 0) {
          const source = line.type === "added" ? modLineHtml : origLineHtml;
          const html = source[line.lineNum - 1];
          if (html !== void 0) {
            content.innerHTML = html;
          } else if (line.text) {
            content.textContent = line.text;
          }
        } else if (line.text) {
          content.textContent = line.text;
        }
      }
    }
  }
  dispose() {
    this.disposed = true;
    this._onDidDispose.fire();
    this.viewStore.dispose();
    super.dispose();
  }
}
async function tokenizeFileLines(languageService, text, languageId) {
  if (!text) {
    return [""];
  }
  const html = await tokenizeToString(languageService, text, languageId);
  const inner = stripTokenizedWrapper(html);
  return inner.split("<br/>");
}
function stripTokenizedWrapper(html) {
  const openTag = '<div class="monaco-tokenized-source">';
  const closeTag = "</div>";
  if (html.startsWith(openTag) && html.endsWith(closeTag)) {
    return html.slice(openTag.length, html.length - closeTag.length);
  }
  return html;
}
function hasMultipleTokenClasses(lines) {
  for (const line of lines) {
    if (line && /class="mtk[2-9]|class="mtk[1-9][0-9]/.test(line)) {
      return true;
    }
  }
  return false;
}
const LANG_FAMILY = {
  javascript: "js",
  javascriptreact: "js",
  typescript: "js",
  typescriptreact: "js",
  java: "js",
  csharp: "js",
  go: "js",
  rust: "js",
  cpp: "js",
  c: "js",
  swift: "js",
  kotlin: "js",
  dart: "js",
  php: "js",
  ruby: "js",
  python: "python",
  css: "css",
  scss: "css",
  less: "css",
  html: "html",
  xml: "html",
  json: "json",
  jsonc: "json",
  shellscript: "shell",
  powershell: "shell"
};
const JS_KEYWORDS = /* @__PURE__ */ new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "async",
  "await",
  "from",
  "as",
  "interface",
  "type",
  "enum",
  "declare",
  "abstract",
  "override",
  "readonly",
  "namespace",
  "module",
  "public",
  "private",
  "protected"
]);
const PY_KEYWORDS = /* @__PURE__ */ new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield"
]);
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function buildSpan(kind, text) {
  if (kind === "default" || !text) {
    return escapeHtml(text);
  }
  return `<span class="mobile-diff-tok-${kind}">${escapeHtml(text)}</span>`;
}
function regexTokenizeLine(line, lang) {
  const tokens = [];
  let pos = 0;
  const len = line.length;
  while (pos < len) {
    let matched = false;
    const commentPfx = lang === "python" ? "#" : lang === "shell" ? "#" : "//";
    if (line.startsWith(commentPfx, pos) || lang === "generic" && line.startsWith("#", pos)) {
      tokens.push({ start: pos, end: len, kind: "comment" });
      pos = len;
      matched = true;
    }
    if (!matched && lang !== "python" && lang !== "shell" && line.startsWith("/*", pos)) {
      const end = line.indexOf("*/", pos + 2);
      const tokenEnd = end === -1 ? len : end + 2;
      tokens.push({ start: pos, end: tokenEnd, kind: "comment" });
      pos = tokenEnd;
      matched = true;
    }
    if (!matched && lang === "js" && line[pos] === "`") {
      let i = pos + 1;
      while (i < len) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === "`") {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ start: pos, end: i, kind: "string" });
      pos = i;
      matched = true;
    }
    if (!matched && (line[pos] === '"' || line[pos] === "'")) {
      const q = line[pos];
      let i = pos + 1;
      while (i < len) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === q) {
          i++;
          break;
        }
        i++;
      }
      tokens.push({ start: pos, end: i, kind: "string" });
      pos = i;
      matched = true;
    }
    if (!matched && /[0-9]/.test(line[pos])) {
      const m = line.slice(pos).match(/^0x[0-9a-fA-F]+|^[0-9]+\.?[0-9]*(?:[eE][+-]?[0-9]+)?/);
      if (m) {
        tokens.push({ start: pos, end: pos + m[0].length, kind: "number" });
        pos += m[0].length;
        matched = true;
      }
    }
    if (!matched && /[a-zA-Z_$]/.test(line[pos])) {
      const m = line.slice(pos).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
      if (m) {
        const word = m[0];
        const keywords = lang === "python" ? PY_KEYWORDS : JS_KEYWORDS;
        const kind = keywords.has(word) ? "keyword" : "default";
        tokens.push({ start: pos, end: pos + word.length, kind });
        pos += word.length;
        matched = true;
      }
    }
    if (!matched) {
      const prevTok = tokens[tokens.length - 1];
      if (prevTok && prevTok.kind === "default") {
        prevTok.end = pos + 1;
      } else {
        tokens.push({ start: pos, end: pos + 1, kind: "default" });
      }
      pos++;
    }
  }
  return tokens.map((t) => buildSpan(t.kind, line.slice(t.start, t.end))).join("");
}
function regexTokenizeLines(text, languageId) {
  if (!text) {
    return [""];
  }
  const lang = LANG_FAMILY[languageId] ?? "generic";
  return text.split(/\r?\n/).map((line) => regexTokenizeLine(line, lang));
}
const CONTEXT_LINES = 3;
function computeUnifiedDiff(original, modified) {
  const origLines = original.split(/\r?\n/);
  const modLines = modified.split(/\r?\n/);
  const result = linesDiffComputers.getDefault().computeDiff(origLines, modLines, {
    ignoreTrimWhitespace: false,
    maxComputationTimeMs: 1e3,
    computeMoves: false
  });
  if (result.changes.length === 0) {
    return [];
  }
  const groups = [];
  for (const change of result.changes) {
    const sub = {
      origStart: change.original.startLineNumber,
      origEnd: change.original.endLineNumberExclusive,
      modStart: change.modified.startLineNumber,
      modEnd: change.modified.endLineNumberExclusive
    };
    const last = groups[groups.length - 1];
    const lastSub = last?.subs[last.subs.length - 1];
    if (lastSub && sub.origStart - lastSub.origEnd <= CONTEXT_LINES * 2) {
      last.subs.push(sub);
    } else {
      groups.push({ subs: [sub] });
    }
  }
  const hunks = [];
  for (const group of groups) {
    const first = group.subs[0];
    const last = group.subs[group.subs.length - 1];
    const origLeading = Math.max(1, first.origStart - CONTEXT_LINES);
    const modLeading = Math.max(1, first.modStart - CONTEXT_LINES);
    const origTrailing = Math.min(origLines.length + 1, last.origEnd + CONTEXT_LINES);
    const modTrailing = Math.min(modLines.length + 1, last.modEnd + CONTEXT_LINES);
    const lines = [];
    for (let i = origLeading; i < first.origStart; i++) {
      lines.push({ type: "context", lineNum: i, text: origLines[i - 1] ?? "" });
    }
    for (let s = 0; s < group.subs.length; s++) {
      const sub = group.subs[s];
      for (let i = sub.origStart; i < sub.origEnd; i++) {
        lines.push({ type: "removed", lineNum: i, text: origLines[i - 1] ?? "" });
      }
      for (let i = sub.modStart; i < sub.modEnd; i++) {
        lines.push({ type: "added", lineNum: i, text: modLines[i - 1] ?? "" });
      }
      const next = group.subs[s + 1];
      if (next) {
        for (let i = sub.origEnd; i < next.origStart; i++) {
          lines.push({ type: "context", lineNum: i, text: origLines[i - 1] ?? "" });
        }
      }
    }
    for (let i = last.origEnd; i < origTrailing; i++) {
      lines.push({ type: "context", lineNum: i, text: origLines[i - 1] ?? "" });
    }
    const origCount = origTrailing - origLeading;
    const modCount = modTrailing - modLeading;
    hunks.push({
      header: `@@ -${origLeading},${origCount} +${modLeading},${modCount} @@`,
      lines
    });
  }
  return hunks;
}
function openMobileDiffView(workbenchContainer, data, textFileService, languageService) {
  return new MobileDiffView(workbenchContainer, data, textFileService, languageService);
}
export {
  MOBILE_OPEN_DIFF_VIEW_COMMAND_ID,
  MobileDiffView,
  openMobileDiffView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXG1vYmlsZVxcY29udHJpYnV0aW9uc1xcbW9iaWxlRGlmZlZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvbW9iaWxlT3ZlcmxheVZpZXdzLmNzcyc7XG5pbXBvcnQgJy4vbW9iaWxlRGlmZkNvbG9ycy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbGluZXNEaWZmQ29tcHV0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVycy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgdG9rZW5pemVUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG4vKiogSGFyZGNvZGVkIGV4dGVuc2lvblx1MjE5Mmxhbmd1YWdlSWQgZmFsbGJhY2sgZm9yIGNvbW1vbiBsYW5ndWFnZXMuXG4gKlxuICogVGhlIGFnZW50cyB3aW5kb3cgZG9lcyBub3QgbG9hZCBsYW5ndWFnZSBzZXJ2aWNlcyAvIGJ1aWx0LWluIGxhbmd1YWdlXG4gKiBleHRlbnNpb25zIHlldCwgc28gYElMYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lYFxuICogcmV0dXJucyBgJ3Vua25vd24nYCBmb3IgZXZlcnl0aGluZyBleGNlcHQgYSBzbWFsbCBjb3JlIHNldC4gT25jZSB0aGVcbiAqIGFnZW50cyB3aW5kb3cgc3RhcnRzIGxvYWRpbmcgbGFuZ3VhZ2Ugc2VydmljZXMgdGhpcyBtYXAgYmVjb21lcyBhXG4gKiBwdXJlIGZhbGxiYWNrIGZvciB0aGUgbGVmdG92ZXIgYCd1bmtub3duJ2AgY2FzZXMuIFRoZSBJRHMgbWF0Y2hcbiAqIFZTIENvZGUncyBidWlsdC1pbiBleHRlbnNpb24gYHBhY2thZ2UuanNvbmAgY29udHJpYnV0aW9ucy4gKi9cbmNvbnN0IEVYVEVOU0lPTl9MQU5HVUFHRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdCcuanMnOiAnamF2YXNjcmlwdCcsICcubWpzJzogJ2phdmFzY3JpcHQnLCAnLmNqcyc6ICdqYXZhc2NyaXB0Jyxcblx0Jy5qc3gnOiAnamF2YXNjcmlwdHJlYWN0Jyxcblx0Jy50cyc6ICd0eXBlc2NyaXB0JywgJy5tdHMnOiAndHlwZXNjcmlwdCcsICcuY3RzJzogJ3R5cGVzY3JpcHQnLFxuXHQnLnRzeCc6ICd0eXBlc2NyaXB0cmVhY3QnLFxuXHQnLnB5JzogJ3B5dGhvbicsICcucHl3JzogJ3B5dGhvbicsXG5cdCcuamF2YSc6ICdqYXZhJyxcblx0Jy5jJzogJ2MnLCAnLmgnOiAnYycsXG5cdCcuY3BwJzogJ2NwcCcsICcuY2MnOiAnY3BwJywgJy5jeHgnOiAnY3BwJywgJy5ocHAnOiAnY3BwJyxcblx0Jy5jcyc6ICdjc2hhcnAnLFxuXHQnLmdvJzogJ2dvJyxcblx0Jy5ycyc6ICdydXN0Jyxcblx0Jy5yYic6ICdydWJ5Jyxcblx0Jy5waHAnOiAncGhwJyxcblx0Jy5odG1sJzogJ2h0bWwnLCAnLmh0bSc6ICdodG1sJyxcblx0Jy5jc3MnOiAnY3NzJywgJy5zY3NzJzogJ3Njc3MnLCAnLmxlc3MnOiAnbGVzcycsXG5cdCcuanNvbic6ICdqc29uJywgJy5qc29uYyc6ICdqc29uYycsXG5cdCcubWQnOiAnbWFya2Rvd24nLFxuXHQnLnNoJzogJ3NoZWxsc2NyaXB0JywgJy5iYXNoJzogJ3NoZWxsc2NyaXB0JywgJy56c2gnOiAnc2hlbGxzY3JpcHQnLFxuXHQnLnlhbWwnOiAneWFtbCcsICcueW1sJzogJ3lhbWwnLFxuXHQnLnhtbCc6ICd4bWwnLFxuXHQnLnNxbCc6ICdzcWwnLFxuXHQnLnN3aWZ0JzogJ3N3aWZ0Jyxcblx0Jy5rdCc6ICdrb3RsaW4nLCAnLmt0cyc6ICdrb3RsaW4nLFxuXHQnLnInOiAncicsXG5cdCcubHVhJzogJ2x1YScsXG5cdCcuZGFydCc6ICdkYXJ0Jyxcbn07XG5cbi8qKlxuICogQ29tbWFuZCBJRCBmb3Igb3BlbmluZyB0aGUge0BsaW5rIE1vYmlsZURpZmZWaWV3fS5cbiAqXG4gKiBBY2NlcHRzIHtAbGluayBJTW9iaWxlRGlmZlZpZXdEYXRhfSBhcyB0aGUgc2luZ2xlIGFyZ3VtZW50LiBQaG9uZS1vbmx5LlxuICpcbiAqIEZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSB0aGUgY29tbWFuZCBhbHNvIGFjY2VwdHMgYSBiYXJlXG4gKiB7QGxpbmsgSUZpbGVEaWZmVmlld0RhdGF9ICh3aXRob3V0IHNpYmxpbmdzKSBcdTIwMTQgaW4gdGhhdCBjYXNlIHRoZSB2aWV3XG4gKiBpcyByZW5kZXJlZCB3aXRob3V0IHByZXYvbmV4dCBuYXZpZ2F0aW9uLlxuICovXG5leHBvcnQgY29uc3QgTU9CSUxFX09QRU5fRElGRl9WSUVXX0NPTU1BTkRfSUQgPSAnc2Vzc2lvbnMubW9iaWxlLm9wZW5EaWZmVmlldyc7XG5cbi8qKlxuICogTWluaW1hbCBzdWJzZXQgb2YgZGlmZiBlbnRyeSBmaWVsZHMgY29uc3VtZWQgYnkgdGhlIG1vYmlsZSBkaWZmIHZpZXcuXG4gKiBEZWZpbmVkIGxvY2FsbHkgdG8gYXZvaWQgaW1wb3J0aW5nIGZyb20gdnMvd29ya2JlbmNoL2NvbnRyaWIgaW4gdnMvc2Vzc2lvbnMvYnJvd3Nlci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRmlsZURpZmZWaWV3RGF0YSB7XG5cdC8qKlxuXHQgKiBVUkkgb2YgdGhlIGZpbGUgYmVmb3JlIHRoZSBjaGFuZ2UuIGB1bmRlZmluZWRgIHdoZW4gdGhlIGZpbGUgaXNcblx0ICogbmV3bHkgYWRkZWQgYnkgdGhlIGFnZW50IGFuZCB0aGVyZSBpcyBubyBwcmlvciBjb250ZW50OyB0aGUgZGlmZlxuXHQgKiBpcyByZW5kZXJlZCBhZ2FpbnN0IGFuIGVtcHR5IG9yaWdpbmFsIChhbGwgbGluZXMgYXMgYWRkaXRpb25zKS5cblx0ICovXG5cdHJlYWRvbmx5IG9yaWdpbmFsVVJJOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBVUkkgb2YgdGhlIGZpbGUgYWZ0ZXIgdGhlIGNoYW5nZS4gYHVuZGVmaW5lZGAgd2hlbiB0aGUgZmlsZSB3YXNcblx0ICogZGVsZXRlZCBieSB0aGUgYWdlbnQgXHUyMDE0IHRoZSBkaWZmIGlzIHJlbmRlcmVkIGFzIGFsbC1yZW1vdmVkIGxpbmVzXG5cdCAqIHJlYWQgZnJvbSB7QGxpbmsgb3JpZ2luYWxVUkl9LlxuXHQgKi9cblx0cmVhZG9ubHkgbW9kaWZpZWRVUkk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaWRlbnRpY2FsOiBib29sZWFuO1xuXHRyZWFkb25seSBhZGRlZDogbnVtYmVyO1xuXHRyZWFkb25seSByZW1vdmVkOiBudW1iZXI7XG59XG5cbi8qKlxuICogRGF0YSBwYXNzZWQgdG8ge0BsaW5rIE1vYmlsZURpZmZWaWV3fSB3aGVuIG9wZW5pbmcgYSBkaWZmIHZpZXcuXG4gKlxuICogV2hlbiB7QGxpbmsgc2libGluZ3N9IGlzIHByb3ZpZGVkIGFuZCBjb250YWlucyBtb3JlIHRoYW4gb25lIGVudHJ5LFxuICogdGhlIGhlYWRlciByZW5kZXJzIHByZXYvbmV4dCBjaGV2cm9ucyB0aGF0IG5hdmlnYXRlIHdpdGhpbiB0aGUgbGlzdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTW9iaWxlRGlmZlZpZXdEYXRhIHtcblx0cmVhZG9ubHkgZGlmZjogSUZpbGVEaWZmVmlld0RhdGE7XG5cdHJlYWRvbmx5IHNpYmxpbmdzPzogcmVhZG9ubHkgSUZpbGVEaWZmVmlld0RhdGFbXTtcblx0cmVhZG9ubHkgaW5kZXg/OiBudW1iZXI7XG59XG5cbi8qKlxuICogRnVsbC1zY3JlZW4gb3ZlcmxheSBmb3Igdmlld2luZyBmaWxlIGNoYW5nZXMgcHJvZHVjZWQgYnkgYSBjb2RpbmcgYWdlbnRcbiAqIHNlc3Npb24gb24gcGhvbmUgdmlld3BvcnRzLlxuICpcbiAqIFJlbmRlcnMgYSB1bmlmaWVkIGRpZmYgd2l0aCBjb2xvdXJlZCArLy0gZ3V0dGVycywgbGluZSBudW1iZXJzLCBhbmRcbiAqIE1vbmFjby1xdWFsaXR5IHN5bnRheCBoaWdobGlnaHRpbmcuIFRleHQgaXMgcmVhZCBmcm9tIHRoZSBmaWxlIHNlcnZpY2VcbiAqIHZpYSB0aGUgbW9kaWZpZWQvb3JpZ2luYWwgVVJJcyBzdG9yZWQgaW4ge0BsaW5rIElGaWxlRGlmZlZpZXdEYXRhfS5cbiAqIFRoaXMga2VlcHMgdGhlIHZpZXcgbGlnaHR3ZWlnaHQgXHUyMDE0IGl0IGF2b2lkcyBlbWJlZGRpbmcgYSBmdWxsIE1vbmFjb1xuICogZGlmZiBlZGl0b3Igd2hpbGUgc3RpbGwgZ2l2aW5nIHVzZXJzIGEgcmVhZGFibGUsIHRoZW1lLWF3YXJlIHZpZXcuXG4gKlxuICogRm9sbG93cyB0aGUgYWNjb3VudC1zaGVldCBvdmVybGF5IHBhdHRlcm46IGFwcGVuZHMgdG8gdGhlIHdvcmtiZW5jaFxuICogY29udGFpbmVyLCBkaXNwb3NlcyBvbiBiYWNrLWJ1dHRvbiB0YXAuXG4gKi9cbmV4cG9ydCBjbGFzcyBNb2JpbGVEaWZmVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKipcblx0ICogRmlyZXMgd2hlbiB0aGlzIHZpZXcgaGFzIGJlZW4gZGlzcG9zZWQgKGVpdGhlciBleHRlcm5hbGx5IG9yXG5cdCAqIGJlY2F1c2UgdGhlIHVzZXIgdGFwcGVkIEJhY2spLiBVc2VkIGJ5IHRoZSBtb2JpbGUgb3ZlcmxheVxuXHQgKiBjb250cmlidXRpb24gdG8gY2xlYXIgaXRzIGBNdXRhYmxlRGlzcG9zYWJsZTxNb2JpbGVEaWZmVmlldz5gIHNsb3QuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIGRpc3Bvc2VkID0gZmFsc2U7XG5cdC8qKiBCdW1wZWQgb24gZXZlcnkgYm9keSByZW5kZXIgc28gbGF0ZS1hcnJpdmluZyBgdGV4dEZpbGVTZXJ2aWNlLnJlYWRgXG5cdCAqICBwcm9taXNlcyBrbm93IHRvIGRyb3AgdGhlaXIgcmVzdWx0cyB3aGVuIHRoZSB1c2VyIG5hdmlnYXRlZCBhd2F5LiAqL1xuXHRwcml2YXRlIHJlbmRlckdlbmVyYXRpb24gPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2libGluZ3M6IHJlYWRvbmx5IElGaWxlRGlmZlZpZXdEYXRhW107XG5cdHByaXZhdGUgY3VycmVudEluZGV4OiBudW1iZXI7XG5cblx0cHJpdmF0ZSB0aXRsZUVsITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3VidGl0bGVFbCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHBvc2l0aW9uRWwhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBwcmV2QnRuITogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgbmV4dEJ0biE6IEhUTUxCdXR0b25FbGVtZW50O1xuXHRwcml2YXRlIGNvbnRlbnRBcmVhITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2Nyb2xsV3JhcHBlciE6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdvcmtiZW5jaENvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGF0YTogSU1vYmlsZURpZmZWaWV3RGF0YSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIE5vcm1hbGlzZSBzaWJsaW5ncyBpbnRvIGEgbm9uLWVtcHR5IGFycmF5IHNvIGFsbCBzdWJzZXF1ZW50IGNvZGVcblx0XHQvLyBjYW4gaW5kZXggaXQgZGlyZWN0bHkuIElmIHRoZSBjYWxsZXIgZGlkbid0IHBhc3Mgc2libGluZ3Mgd2Vcblx0XHQvLyB0cmVhdCB0aGUgc2luZ2xlIGRpZmYgYXMgaXRzIG93biBvbmUtZWxlbWVudCBsaXN0LlxuXHRcdHRoaXMuc2libGluZ3MgPSBkYXRhLnNpYmxpbmdzICYmIGRhdGEuc2libGluZ3MubGVuZ3RoID4gMCA/IGRhdGEuc2libGluZ3MgOiBbZGF0YS5kaWZmXTtcblx0XHRjb25zdCBzdGFydEluZGV4ID0gZGF0YS5pbmRleCA/PyB0aGlzLnNpYmxpbmdzLmluZGV4T2YoZGF0YS5kaWZmKTtcblx0XHR0aGlzLmN1cnJlbnRJbmRleCA9IHN0YXJ0SW5kZXggPj0gMCA/IHN0YXJ0SW5kZXggOiAwO1xuXG5cdFx0dGhpcy5yZW5kZXIod29ya2JlbmNoQ29udGFpbmVyKTtcblx0XHR0aGlzLnJlbmRlckJvZHlGb3JDdXJyZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcih3b3JrYmVuY2hDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gLS0gUm9vdCBvdmVybGF5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IERPTS5hcHBlbmQod29ya2JlbmNoQ29udGFpbmVyLCAkKCdkaXYubW9iaWxlLW92ZXJsYXktdmlldycpKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvdmVybGF5LCBET00uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiBlLnByZXZlbnREZWZhdWx0KCkpKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG92ZXJsYXkucmVtb3ZlKCkpKTtcblxuXHRcdC8vIC0tIEhlYWRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdGNvbnN0IGhlYWRlciA9IERPTS5hcHBlbmQob3ZlcmxheSwgJCgnZGl2Lm1vYmlsZS1vdmVybGF5LWhlYWRlcicpKTtcblxuXHRcdGNvbnN0IGJhY2tCdG4gPSBET00uYXBwZW5kKGhlYWRlciwgJCgnYnV0dG9uLm1vYmlsZS1vdmVybGF5LWJhY2stYnRuJywgeyB0eXBlOiAnYnV0dG9uJyB9KSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0YmFja0J0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZGlmZlZpZXcuYmFjaycsIFwiQmFja1wiKSk7XG5cdFx0RE9NLmFwcGVuZChiYWNrQnRuLCAkKCdzcGFuJykpLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uTGVmdCkpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChHZXN0dXJlLmFkZFRhcmdldChiYWNrQnRuKSk7XG5cdFx0dGhpcy52aWV3U3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmFja0J0biwgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihiYWNrQnRuLCBUb3VjaEV2ZW50VHlwZS5UYXAsICgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cblx0XHRjb25zdCBpbmZvID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ2Rpdi5tb2JpbGUtb3ZlcmxheS1oZWFkZXItaW5mby5pbmxpbmUnKSk7XG5cdFx0dGhpcy50aXRsZUVsID0gRE9NLmFwcGVuZChpbmZvLCAkKCdkaXYubW9iaWxlLW92ZXJsYXktaGVhZGVyLXRpdGxlJykpO1xuXHRcdHRoaXMuc3VidGl0bGVFbCA9IERPTS5hcHBlbmQoaW5mbywgJCgnZGl2Lm1vYmlsZS1vdmVybGF5LWhlYWRlci1zdWJ0aXRsZScpKTtcblxuXHRcdC8vIFByZXYvTmV4dCBuYXYgYXBwZWFycyBvbiB0aGUgcmlnaHQgc2lkZSB3aGVuIHdlIGhhdmUgc2libGluZ3MuXG5cdFx0Ly8gV2UgYWx3YXlzIGNyZWF0ZSB0aGUgZWxlbWVudHMgKHNvIGxheW91dCBzcGFjZSBpcyByZXNlcnZlZCkgYnV0XG5cdFx0Ly8ga2VlcCB0aGVtIGhpZGRlbiB3aGVuIHRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgZmlsZS5cblx0XHRjb25zdCBuYXYgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnZGl2Lm1vYmlsZS1kaWZmLW5hdicpKTtcblx0XHR0aGlzLnByZXZCdG4gPSBET00uYXBwZW5kKG5hdiwgJCgnYnV0dG9uLm1vYmlsZS1kaWZmLW5hdi1idG4ucHJldicsIHsgdHlwZTogJ2J1dHRvbicgfSkpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdHRoaXMucHJldkJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnZGlmZlZpZXcucHJldkZpbGUnLCBcIlByZXZpb3VzIGZpbGVcIikpO1xuXHRcdERPTS5hcHBlbmQodGhpcy5wcmV2QnRuLCAkKCdzcGFuJykpLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uVXApKTtcblx0XHR0aGlzLnBvc2l0aW9uRWwgPSBET00uYXBwZW5kKG5hdiwgJCgnc3Bhbi5tb2JpbGUtZGlmZi1uYXYtcG9zaXRpb24nKSk7XG5cdFx0dGhpcy5uZXh0QnRuID0gRE9NLmFwcGVuZChuYXYsICQoJ2J1dHRvbi5tb2JpbGUtZGlmZi1uYXYtYnRuLm5leHQnLCB7IHR5cGU6ICdidXR0b24nIH0pKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHR0aGlzLm5leHRCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2RpZmZWaWV3Lm5leHRGaWxlJywgXCJOZXh0IGZpbGVcIikpO1xuXHRcdERPTS5hcHBlbmQodGhpcy5uZXh0QnRuLCAkKCdzcGFuJykpLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXG5cdFx0dGhpcy52aWV3U3RvcmUuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMucHJldkJ0bikpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChHZXN0dXJlLmFkZFRhcmdldCh0aGlzLm5leHRCdG4pKTtcblx0XHRjb25zdCBvblByZXYgPSAoKSA9PiB0aGlzLm5hdmlnYXRlKC0xKTtcblx0XHRjb25zdCBvbk5leHQgPSAoKSA9PiB0aGlzLm5hdmlnYXRlKCsxKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnByZXZCdG4sIERPTS5FdmVudFR5cGUuQ0xJQ0ssIG9uUHJldikpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucHJldkJ0biwgVG91Y2hFdmVudFR5cGUuVGFwLCBvblByZXYpKTtcblx0XHR0aGlzLnZpZXdTdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm5leHRCdG4sIERPTS5FdmVudFR5cGUuQ0xJQ0ssIG9uTmV4dCkpO1xuXHRcdHRoaXMudmlld1N0b3JlLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMubmV4dEJ0biwgVG91Y2hFdmVudFR5cGUuVGFwLCBvbk5leHQpKTtcblxuXHRcdG5hdi5zdHlsZS5kaXNwbGF5ID0gdGhpcy5zaWJsaW5ncy5sZW5ndGggPiAxID8gJycgOiAnbm9uZSc7XG5cblx0XHQvLyAtLSBCb2R5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRjb25zdCBib2R5ID0gRE9NLmFwcGVuZChvdmVybGF5LCAkKCdkaXYubW9iaWxlLW92ZXJsYXktYm9keScpKTtcblx0XHR0aGlzLnNjcm9sbFdyYXBwZXIgPSBET00uYXBwZW5kKGJvZHksICQoJ2Rpdi5tb2JpbGUtb3ZlcmxheS1zY3JvbGwnKSk7XG5cdFx0dGhpcy5jb250ZW50QXJlYSA9IERPTS5hcHBlbmQodGhpcy5zY3JvbGxXcmFwcGVyLCAkKCdkaXYubW9iaWxlLWRpZmYtb3V0cHV0JykpO1xuXG5cdFx0Ly8gSG9yaXpvbnRhbCBzd2lwZSBiZXR3ZWVuIHNpYmxpbmcgZmlsZXMuIFdlIG1vdW50IG9uIHRoZSBzY3JvbGxcblx0XHQvLyB3cmFwcGVyIHNvIHZlcnRpY2FsIHNjcm9sbGluZyBjb250aW51ZXMgdG8gd29yayBub3JtYWxseTsgdGhlXG5cdFx0Ly8gZ2VzdHVyZSBvbmx5IGFjdGl2YXRlcyB3aGVuIGhvcml6b250YWwgbW90aW9uIGNsZWFybHkgZG9taW5hdGVzLlxuXHRcdHRoaXMudmlld1N0b3JlLmFkZCh0aGlzLmF0dGFjaFN3aXBlTmF2aWdhdGlvbih0aGlzLnNjcm9sbFdyYXBwZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgYXR0YWNoU3dpcGVOYXZpZ2F0aW9uKHRhcmdldDogSFRNTEVsZW1lbnQpOiB7IGRpc3Bvc2UoKTogdm9pZCB9IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAodGhpcy5zaWJsaW5ncy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuIHN0b3JlO1xuXHRcdH1cblxuXHRcdGxldCBzdGFydFggPSAwO1xuXHRcdGxldCBzdGFydFkgPSAwO1xuXHRcdGxldCBzdGFydFRpbWUgPSAwO1xuXHRcdGxldCB0cmFja2luZyA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgb25Qb2ludGVyRG93biA9IChlOiBQb2ludGVyRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLnBvaW50ZXJUeXBlICE9PSAndG91Y2gnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyYWNraW5nID0gdHJ1ZTtcblx0XHRcdHN0YXJ0WCA9IGUuY2xpZW50WDtcblx0XHRcdHN0YXJ0WSA9IGUuY2xpZW50WTtcblx0XHRcdHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0fTtcblx0XHRjb25zdCBvblBvaW50ZXJVcCA9IChlOiBQb2ludGVyRXZlbnQpID0+IHtcblx0XHRcdGlmICghdHJhY2tpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJhY2tpbmcgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGR4ID0gZS5jbGllbnRYIC0gc3RhcnRYO1xuXHRcdFx0Y29uc3QgZHkgPSBlLmNsaWVudFkgLSBzdGFydFk7XG5cdFx0XHRjb25zdCBkdCA9IERhdGUubm93KCkgLSBzdGFydFRpbWU7XG5cdFx0XHRjb25zdCBhYnNEeCA9IE1hdGguYWJzKGR4KTtcblx0XHRcdGNvbnN0IGFic0R5ID0gTWF0aC5hYnMoZHkpO1xuXG5cdFx0XHQvLyBSZXF1aXJlIGEgaG9yaXpvbnRhbC1kb21pbmFudCBzd2lwZSBvZiBhdCBsZWFzdCAzMCUgb2YgdGhlXG5cdFx0XHQvLyB2aWV3cG9ydCB3aWR0aCBvciAwLjUgcHgvbXMgdmVsb2NpdHkuIFZlcnRpY2FsIHN3aXBlcyBhcmVcblx0XHRcdC8vIHBhc3NlZCB0aHJvdWdoIHVudG91Y2hlZCAodGhleSdyZSBzY3JvbGxpbmcpLlxuXHRcdFx0Y29uc3Qgdmlld3BvcnRXaWR0aCA9IHRhcmdldC5jbGllbnRXaWR0aDtcblx0XHRcdGNvbnN0IG1pbkRpc3RhbmNlID0gdmlld3BvcnRXaWR0aCAqIDAuMztcblx0XHRcdGNvbnN0IHZlbG9jaXR5ID0gYWJzRHggLyBNYXRoLm1heChkdCwgMSk7XG5cdFx0XHRpZiAoYWJzRHggPD0gYWJzRHkgKiAxLjUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFic0R4IDwgbWluRGlzdGFuY2UgJiYgdmVsb2NpdHkgPCAwLjUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTd2lwZSBsZWZ0IFx1MjE5MiBuZXh0IGZpbGUsIHN3aXBlIHJpZ2h0IFx1MjE5MiBwcmV2aW91cyBmaWxlLlxuXHRcdFx0dGhpcy5uYXZpZ2F0ZShkeCA8IDAgPyArMSA6IC0xKTtcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCAncG9pbnRlcmRvd24nLCBvblBvaW50ZXJEb3duKSk7XG5cdFx0c3RvcmUuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCAncG9pbnRlcnVwJywgb25Qb2ludGVyVXApKTtcblx0XHRzdG9yZS5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsICdwb2ludGVyY2FuY2VsJywgKCkgPT4geyB0cmFja2luZyA9IGZhbHNlOyB9KSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBuYXZpZ2F0ZShkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dCA9IHRoaXMuY3VycmVudEluZGV4ICsgZGVsdGE7XG5cdFx0aWYgKG5leHQgPCAwIHx8IG5leHQgPj0gdGhpcy5zaWJsaW5ncy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jdXJyZW50SW5kZXggPSBuZXh0O1xuXHRcdHRoaXMucmVuZGVyQm9keUZvckN1cnJlbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQm9keUZvckN1cnJlbnQoKTogdm9pZCB7XG5cdFx0Ly8gQnVtcCB0aGUgcmVuZGVyIGdlbmVyYXRpb24gc28gYW55IGluZmxpZ2h0IGB0ZXh0RmlsZVNlcnZpY2UucmVhZGBcblx0XHQvLyBmcm9tIHRoZSBwcmV2aW91cyBmaWxlIGtub3dzIHRvIGRyb3AgaXRzIHJlc3VsdHMgYmVmb3JlIHdyaXRpbmdcblx0XHQvLyBpbnRvIHRoZSBub3ctc3RhbGUgY29udGFpbmVyLlxuXHRcdHRoaXMucmVuZGVyR2VuZXJhdGlvbisrO1xuXG5cdFx0Y29uc3QgZGlmZiA9IHRoaXMuc2libGluZ3NbdGhpcy5jdXJyZW50SW5kZXhdO1xuXHRcdGNvbnN0IGZpbGVOYW1lVXJpID0gZGlmZi5tb2RpZmllZFVSSSA/PyBkaWZmLm9yaWdpbmFsVVJJO1xuXHRcdGNvbnN0IGZpbGVOYW1lID0gZmlsZU5hbWVVcmkgPyBiYXNlbmFtZShmaWxlTmFtZVVyaSkgOiAnJztcblxuXHRcdC8vIEhlYWRlciBjb250ZW50XG5cdFx0dGhpcy50aXRsZUVsLnRleHRDb250ZW50ID0gZmlsZU5hbWU7XG5cdFx0Ly8gUmVuZGVyICtOIC8gLU4gYXMgc3R5bGVkIHNwYW5zIHNvIHRoZXkgcGljayB1cCB0aGUgc2FtZSBhY2NlbnRcblx0XHQvLyBjb2xvdXJzIGFzIHRoZSBjaGFuZ2VzLWxpc3QgKGBtb2JpbGUtY2hhbmdlcy1yb3ctYWRkZWRgIC9cblx0XHQvLyBgbW9iaWxlLWNoYW5nZXMtcm93LXJlbW92ZWRgKS4gVGhlIHByZXZpb3VzIGZsYXQgdGV4dENvbnRlbnRcblx0XHQvLyByZW5kZXJlZCBldmVyeXRoaW5nIGFzIGZvcmVncm91bmQgY29sb3VyLlxuXHRcdERPTS5jbGVhck5vZGUodGhpcy5zdWJ0aXRsZUVsKTtcblx0XHRpZiAoIWRpZmYuaWRlbnRpY2FsKSB7XG5cdFx0XHRpZiAoZGlmZi5hZGRlZCkge1xuXHRcdFx0XHRET00uYXBwZW5kKHRoaXMuc3VidGl0bGVFbCwgJCgnc3Bhbi5tb2JpbGUtY2hhbmdlcy1yb3ctYWRkZWQnKSkudGV4dENvbnRlbnQgPSBgKyR7ZGlmZi5hZGRlZH1gO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpZmYuYWRkZWQgJiYgZGlmZi5yZW1vdmVkKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQodGhpcy5zdWJ0aXRsZUVsLCBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHRcdH1cblx0XHRcdGlmIChkaWZmLnJlbW92ZWQpIHtcblx0XHRcdFx0RE9NLmFwcGVuZCh0aGlzLnN1YnRpdGxlRWwsICQoJ3NwYW4ubW9iaWxlLWNoYW5nZXMtcm93LXJlbW92ZWQnKSkudGV4dENvbnRlbnQgPSBgLSR7ZGlmZi5yZW1vdmVkfWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2libGluZ3MubGVuZ3RoID4gMSkge1xuXHRcdFx0dGhpcy5wb3NpdGlvbkVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoXG5cdFx0XHRcdCdkaWZmVmlldy5wb3NpdGlvbicsXG5cdFx0XHRcdFwiezB9IC8gezF9XCIsXG5cdFx0XHRcdHRoaXMuY3VycmVudEluZGV4ICsgMSxcblx0XHRcdFx0dGhpcy5zaWJsaW5ncy5sZW5ndGgsXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5wcmV2QnRuLmRpc2FibGVkID0gdGhpcy5jdXJyZW50SW5kZXggPT09IDA7XG5cdFx0XHR0aGlzLm5leHRCdG4uZGlzYWJsZWQgPSB0aGlzLmN1cnJlbnRJbmRleCA9PT0gdGhpcy5zaWJsaW5ncy5sZW5ndGggLSAxO1xuXHRcdFx0dGhpcy5wcmV2QnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyh0aGlzLnByZXZCdG4uZGlzYWJsZWQpKTtcblx0XHRcdHRoaXMubmV4dEJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcodGhpcy5uZXh0QnRuLmRpc2FibGVkKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzZXQgc2Nyb2xsIHBvc2l0aW9uIHNvIHRoZSB1c2VyIHN0YXJ0cyBhdCB0aGUgdG9wIG9mIGVhY2ggZmlsZS5cblx0XHR0aGlzLnNjcm9sbFdyYXBwZXIuc2Nyb2xsVG9wID0gMDtcblx0XHR0aGlzLnNjcm9sbFdyYXBwZXIuc2Nyb2xsTGVmdCA9IDA7XG5cblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY29udGVudEFyZWEpO1xuXHRcdHRoaXMubG9hZERpZmZDb250ZW50KHRoaXMuY29udGVudEFyZWEsIGRpZmYpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkRGlmZkNvbnRlbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGlmZjogSUZpbGVEaWZmVmlld0RhdGEpOiB2b2lkIHtcblx0XHRpZiAoZGlmZi5pZGVudGljYWwpIHtcblx0XHRcdGNvbnN0IGVtcHR5ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5tb2JpbGUtZGlmZi1lbXB0eS1zdGF0ZScpKTtcblx0XHRcdGVtcHR5LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2RpZmZWaWV3Lm5vQ2hhbmdlcycsIFwiTm8gY2hhbmdlcyBpbiB0aGlzIGZpbGUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxvYWRpbmdFbCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdkaXYubW9iaWxlLWRpZmYtZW1wdHktc3RhdGUnKSk7XG5cdFx0bG9hZGluZ0VsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2RpZmZWaWV3LmxvYWRpbmcnLCBcIkxvYWRpbmdcdTIwMjZcIik7XG5cblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5yZW5kZXJHZW5lcmF0aW9uO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLnJlc29sdmVMYW5ndWFnZUlkKGRpZmYpO1xuXG5cdFx0dm9pZCB0aGlzLmxvYWRBbmRSZW5kZXIoY29udGFpbmVyLCBkaWZmLCBsYW5ndWFnZUlkLCBnZW5lcmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZEFuZFJlbmRlcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRpZmY6IElGaWxlRGlmZlZpZXdEYXRhLFxuXHRcdGxhbmd1YWdlSWQ6IHN0cmluZyxcblx0XHRnZW5lcmF0aW9uOiBudW1iZXIsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IFtvcmlnaW5hbFRleHQsIG1vZGlmaWVkVGV4dF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkaWZmLm9yaWdpbmFsVVJJXG5cdFx0XHRcdD8gdGhpcy50ZXh0RmlsZVNlcnZpY2UucmVhZChkaWZmLm9yaWdpbmFsVVJJLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlIH0pLnRoZW4obSA9PiBtLnZhbHVlKS5jYXRjaCgoKSA9PiAnJylcblx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoJycpLFxuXHRcdFx0ZGlmZi5tb2RpZmllZFVSSVxuXHRcdFx0XHQ/IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJlYWQoZGlmZi5tb2RpZmllZFVSSSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSB9KS50aGVuKG0gPT4gbS52YWx1ZSkuY2F0Y2goKCkgPT4gJycpXG5cdFx0XHRcdDogUHJvbWlzZS5yZXNvbHZlKCcnKSxcblx0XHRdKTtcblxuXHRcdGlmICh0aGlzLmRpc3Bvc2VkIHx8IGdlbmVyYXRpb24gIT09IHRoaXMucmVuZGVyR2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGh1bmtzID0gY29tcHV0ZVVuaWZpZWREaWZmKG9yaWdpbmFsVGV4dCwgbW9kaWZpZWRUZXh0KTtcblx0XHRpZiAoaHVua3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRET00uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBlbXB0eSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdkaXYubW9iaWxlLWRpZmYtZW1wdHktc3RhdGUnKSk7XG5cdFx0XHRlbXB0eS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdkaWZmVmlldy5ub0NoYW5nZXMnLCBcIk5vIGNoYW5nZXMgaW4gdGhpcyBmaWxlLlwiKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBdHRlbXB0IE1vbmFjbyB0b2tlbml6YXRpb24uIFRoZSBzZXNzaW9ucyB3b3JrYmVuY2ggZG9lcyBub3QgbG9hZFxuXHRcdC8vIGJ1aWx0LWluIGxhbmd1YWdlIGV4dGVuc2lvbnMgKEpTLCBUUywgUHl0aG9uLCBldGMuKSwgc29cblx0XHQvLyBgVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGVgIHJlc29sdmVzIHRvIG51bGwgZm9yIHRob3NlIGxhbmd1YWdlc1xuXHRcdC8vIGFuZCBmYWxscyBiYWNrIHRvIGBudWxsVG9rZW5pemVFbmNvZGVkYCBcdTIwMTQgZXZlcnkgdG9rZW4gZ2V0cyBjbGFzcyBgbXRrMWBcblx0XHQvLyAocGxhaW4gZm9yZWdyb3VuZCkuIERldGVjdCB0aGF0IGNhc2UgYW5kIGZhbGwgYmFjayB0byBhIGxpZ2h0d2VpZ2h0XG5cdFx0Ly8gcmVnZXggdG9rZW5pemVyIHRoYXQgY292ZXJzIHRoZSBtb3N0IGNvbW1vbiBzeW50YXggcGF0dGVybnMuXG5cdFx0Y29uc3QgW29yaWdMaW5lSHRtbCwgbW9kTGluZUh0bWxdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dG9rZW5pemVGaWxlTGluZXModGhpcy5sYW5ndWFnZVNlcnZpY2UsIG9yaWdpbmFsVGV4dCwgbGFuZ3VhZ2VJZCksXG5cdFx0XHR0b2tlbml6ZUZpbGVMaW5lcyh0aGlzLmxhbmd1YWdlU2VydmljZSwgbW9kaWZpZWRUZXh0LCBsYW5ndWFnZUlkKSxcblx0XHRdKTtcblxuXHRcdC8vIFJlYWwgdG9rZW5pemF0aW9uIHByb2R1Y2VzIG11bHRpcGxlIGRpc3RpbmN0IG10ayogY2xhc3NlczsgaWYgQUxMXG5cdFx0Ly8gbm9uLWVtcHR5IGxpbmVzIGNvbnRhaW4gb25seSBgbXRrMWAsIHRoZSBncmFtbWFyIGRpZCBub3QgZmlyZS5cblx0XHRjb25zdCBoYXNSZWFsVG9rZW5zID0gaGFzTXVsdGlwbGVUb2tlbkNsYXNzZXMob3JpZ0xpbmVIdG1sKSB8fCBoYXNNdWx0aXBsZVRva2VuQ2xhc3Nlcyhtb2RMaW5lSHRtbCk7XG5cdFx0Y29uc3Qgb3JpZ0xpbmVzID0gaGFzUmVhbFRva2VucyA/IG9yaWdMaW5lSHRtbCA6IHJlZ2V4VG9rZW5pemVMaW5lcyhvcmlnaW5hbFRleHQsIGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IG1vZExpbmVzID0gaGFzUmVhbFRva2VucyA/IG1vZExpbmVIdG1sIDogcmVnZXhUb2tlbml6ZUxpbmVzKG1vZGlmaWVkVGV4dCwgbGFuZ3VhZ2VJZCk7XG5cblx0XHRpZiAodGhpcy5kaXNwb3NlZCB8fCBnZW5lcmF0aW9uICE9PSB0aGlzLnJlbmRlckdlbmVyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRET00uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHQvLyBJbmplY3QgYSA8c3R5bGU+IGJsb2NrIHdpdGggdGhlIE1vbmFjbyB0b2tlbiBjb2xvdXItbWFwIHNvIHRoYXRcblx0XHQvLyBgbXRrKmAgY2xhc3NlcyBwcm9kdWNlZCBieSBgdG9rZW5pemVUb1N0cmluZ2AgcmVzb2x2ZSB0byBjb2xvdXJzLlxuXHRcdC8vIE5vdCBuZWVkZWQgZm9yIHRoZSByZWdleCBmYWxsYmFjayB3aGljaCB1c2VzIGlubGluZSBzdHlsZXMsIGJ1dFxuXHRcdC8vIGtlcHQgc28gYm90aCBwYXRocyBzaGFyZSB0aGUgc2FtZSBjb250YWluZXIgbm9kZS5cblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdFx0aWYgKGNvbG9yTWFwICYmIGhhc1JlYWxUb2tlbnMpIHtcblx0XHRcdGNvbnN0IHN0eWxlRWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdFx0c3R5bGVFbC50ZXh0Q29udGVudCA9IGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHN0eWxlRWwpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVySHVua3MoY29udGFpbmVyLCBodW5rcywgb3JpZ0xpbmVzLCBtb2RMaW5lcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVMYW5ndWFnZUlkKGRpZmY6IElGaWxlRGlmZlZpZXdEYXRhKTogc3RyaW5nIHtcblx0XHQvLyBQcmVmZXIgdGhlIG1vZGlmaWVkIFVSSSBmb3IgbGFuZ3VhZ2UgZ3Vlc3NpbmcgXHUyMDE0IHRoYXQncyB0aGUgZmlsZVxuXHRcdC8vIHRoZSB1c2VyIGlzIHJlYWRpbmcuIEZhbGxzIGJhY2sgdG8gdGhlIG9yaWdpbmFsIChkZWxldGlvbiBjYXNlKS5cblx0XHRjb25zdCB1cmkgPSBkaWZmLm1vZGlmaWVkVVJJID8/IGRpZmYub3JpZ2luYWxVUkk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybiAncGxhaW50ZXh0Jztcblx0XHR9XG5cdFx0Ly8gYGd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZWAgYWxyZWFkeSBoYW5kbGVzIHVua25vd25cblx0XHQvLyBVUkkgc2NoZW1lcyAobGlrZSBgdnNjb2RlLWFnZW50LWhvc3Q6Ly9gKSBcdTIwMTQgaXRzIGFzc29jaWF0aW9uXG5cdFx0Ly8gcmVzb2x2ZXIgZmFsbHMgdGhyb3VnaCB0byBgcmVzb3VyY2UucGF0aGAgYW5kIGJhc2VuYW1lcyB0aGF0XG5cdFx0Ly8gZm9yIGV4dGVuc2lvbiBtYXRjaGluZy4gV2UgZG9uJ3QgbmVlZCB0byBtYXNzYWdlIHRoZSBVUkkuXG5cdFx0Y29uc3QgZ3Vlc3NlZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSh1cmkpO1xuXHRcdGlmIChndWVzc2VkICYmIGd1ZXNzZWQgIT09ICd1bmtub3duJykge1xuXHRcdFx0cmV0dXJuIGd1ZXNzZWQ7XG5cdFx0fVxuXHRcdC8vIE1vc3QgbGFuZ3VhZ2UgZXh0ZW5zaW9ucyAoamF2YXNjcmlwdCwgdHlwZXNjcmlwdCwgcHl0aG9uLCBldGMuKVxuXHRcdC8vIGFyZSBub3QgbG9hZGVkIGluIHRoZSBhZ2VudHMgd2luZG93IHlldCwgc28gdGhlIGd1ZXNzZXIgcmV0dXJuc1xuXHRcdC8vIGAndW5rbm93bidgIGZvciB0aGVtLiBNYXAga25vd24gZXh0ZW5zaW9ucyB0byBsYW5ndWFnZSBJRHMgdGhhdFxuXHRcdC8vIGB0b2tlbml6ZVRvU3RyaW5nYCB3aWxsIHBpY2sgdXAgaWYvd2hlbiB0aGVpciBUZXh0TWF0ZSBncmFtbWFyc1xuXHRcdC8vIGxvYWQgb24gZGVtYW5kLlxuXHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZSh1cmkpO1xuXHRcdGNvbnN0IGV4dCA9IG5hbWUuaW5jbHVkZXMoJy4nKSA/IG5hbWUuc2xpY2UobmFtZS5sYXN0SW5kZXhPZignLicpKS50b0xvd2VyQ2FzZSgpIDogJyc7XG5cdFx0cmV0dXJuIEVYVEVOU0lPTl9MQU5HVUFHRV9NQVBbZXh0XSA/PyAncGxhaW50ZXh0Jztcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySHVua3MoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRodW5rczogSURpZmZIdW5rW10sXG5cdFx0b3JpZ0xpbmVIdG1sOiByZWFkb25seSBzdHJpbmdbXSxcblx0XHRtb2RMaW5lSHRtbDogcmVhZG9ubHkgc3RyaW5nW10sXG5cdCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaHVuayBvZiBodW5rcykge1xuXHRcdFx0Ly8gSHVuayBoZWFkZXIgXHUyMDE0IHN0aWNreSBpbnNpZGUgdGhlIHNjcm9sbCBjb250YWluZXIgc28gdGhlXG5cdFx0XHQvLyBgQEAgLS4uLC4uICsuLiwuLiBAQGAgaW5kaWNhdG9yIHN0YXlzIGFuY2hvcmVkIGFzIHRoZSB1c2VyXG5cdFx0XHQvLyBzY3JvbGxzIHRocm91Z2ggdGhlIGh1bmsncyBsaW5lcy5cblx0XHRcdGNvbnN0IGhlYWRlckVsID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5tb2JpbGUtZGlmZi1odW5rLWhlYWRlcicpKTtcblx0XHRcdGhlYWRlckVsLnRleHRDb250ZW50ID0gaHVuay5oZWFkZXI7XG5cblx0XHRcdC8vIExpbmVzXG5cdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgaHVuay5saW5lcykge1xuXHRcdFx0XHRjb25zdCByb3cgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnZGl2Lm1vYmlsZS1kaWZmLWxpbmUnKSk7XG5cdFx0XHRcdHJvdy5jbGFzc0xpc3QuYWRkKGxpbmUudHlwZSk7XG5cblx0XHRcdFx0Y29uc3QgbnVtRWwgPSBET00uYXBwZW5kKHJvdywgJCgnc3Bhbi5tb2JpbGUtZGlmZi1saW5lLW51bScpKTtcblx0XHRcdFx0bnVtRWwudGV4dENvbnRlbnQgPSBsaW5lLmxpbmVOdW0gIT09IHVuZGVmaW5lZCA/IFN0cmluZyhsaW5lLmxpbmVOdW0pIDogJyc7XG5cblx0XHRcdFx0Y29uc3QgZ3V0dGVyID0gRE9NLmFwcGVuZChyb3csICQoJ3NwYW4ubW9iaWxlLWRpZmYtZ3V0dGVyJykpO1xuXHRcdFx0XHRndXR0ZXIudGV4dENvbnRlbnQgPSBsaW5lLnR5cGUgPT09ICdhZGRlZCcgPyAnKycgOiBsaW5lLnR5cGUgPT09ICdyZW1vdmVkJyA/ICctJyA6ICcgJztcblxuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gRE9NLmFwcGVuZChyb3csICQoJ3NwYW4ubW9iaWxlLWRpZmYtY29udGVudCcpKTtcblx0XHRcdFx0Ly8gYGxpbmVOdW1gIGlzIDEtYmFzZWQgYW5kIGluZGV4ZXMgaW50byB0aGUgc291cmNlIHRoZVxuXHRcdFx0XHQvLyBsaW5lIHdhcyB0YWtlbiBmcm9tOiBvcmlnaW5hbCBmb3IgY29udGV4dC9yZW1vdmVkLFxuXHRcdFx0XHQvLyBtb2RpZmllZCBmb3IgYWRkZWQgKHNlZSBgY29tcHV0ZVVuaWZpZWREaWZmYCkuIFRoZVxuXHRcdFx0XHQvLyB0b2tlbml6YXRpb24gcGFzcyByZXR1cm5zIG9uZSBIVE1MIHNwYW4gYmxvY2sgcGVyXG5cdFx0XHRcdC8vIGxpbmUgaW4gdGhlIHNhbWUgb3JkZXIsIHNvIGEgZGlyZWN0IGxvb2t1cCBnaXZlcyB1c1xuXHRcdFx0XHQvLyB0aGUgaGlnaGxpZ2h0ZWQgbWFya3VwLlxuXHRcdFx0XHRpZiAobGluZS5saW5lTnVtICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSBsaW5lLnR5cGUgPT09ICdhZGRlZCcgPyBtb2RMaW5lSHRtbCA6IG9yaWdMaW5lSHRtbDtcblx0XHRcdFx0XHRjb25zdCBodG1sID0gc291cmNlW2xpbmUubGluZU51bSAtIDFdO1xuXHRcdFx0XHRcdGlmIChodG1sICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQuaW5uZXJIVE1MID0gaHRtbDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGxpbmUudGV4dCkge1xuXHRcdFx0XHRcdFx0Y29udGVudC50ZXh0Q29udGVudCA9IGxpbmUudGV4dDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobGluZS50ZXh0KSB7XG5cdFx0XHRcdFx0Y29udGVudC50ZXh0Q29udGVudCA9IGxpbmUudGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cdFx0Ly8gTm90aWZ5IGV4dGVybmFsIHNsb3QtaG9sZGVycyBiZWZvcmUgYW55IHJlZ2lzdGVyZWQgZGlzcG9zYWJsZXNcblx0XHQvLyAoaW5jbHVkaW5nIHRoZSBlbWl0dGVyIGl0c2VsZikgZ2V0IHRvcm4gZG93biBieSBgc3VwZXIuZGlzcG9zZSgpYC5cblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMudmlld1N0b3JlLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gLS0gVG9rZW5pemF0aW9uIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBUb2tlbml6ZSBhIGZ1bGwgdGV4dCBhbmQgcmV0dXJuIHRoZSBwZXItbGluZSBIVE1MIChvbmUgZW50cnkgcGVyXG4gKiBzb3VyY2UgbGluZSwgaW4gb3JkZXIpLiBVc2VzIGB0b2tlbml6ZVRvU3RyaW5nYCB3aGljaCBhd2FpdHNcbiAqIGBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRPckNyZWF0ZShsYW5ndWFnZUlkKWAgXHUyMDE0IHdpdGhvdXQgdGhhdCwgc3luY1xuICogdG9rZW5pemF0aW9uIHJldHVybnMgbnVsbCBoaWdobGlnaHRpbmcgZm9yIGFueSBsYW5ndWFnZSB3aG9zZVxuICogdGV4dG1hdGUgZ3JhbW1hciBoYXNuJ3QgYmVlbiBhY3RpdmF0ZWQgeWV0IChjb21tb24gaW4gYWdlbnRzXG4gKiB3b3JrYmVuY2gsIHdoZXJlIG5vIGVkaXRvciBoYXMgb3BlbmVkIHRoZSBmaWxlKS5cbiAqXG4gKiBUb2tlbml6YXRpb24gcnVucyBvdmVyIHRoZSB3aG9sZSB0ZXh0IHNvIHN0YXRlIChvcGVuIHN0cmluZyxcbiAqIHRlbXBsYXRlIGxpdGVyYWwsIGJsb2NrIGNvbW1lbnQpIHByb3BhZ2F0ZXMgY29ycmVjdGx5IGFjcm9zcyBsaW5lcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gdG9rZW5pemVGaWxlTGluZXMobGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0aWYgKCF0ZXh0KSB7XG5cdFx0cmV0dXJuIFsnJ107XG5cdH1cblx0Y29uc3QgaHRtbCA9IGF3YWl0IHRva2VuaXplVG9TdHJpbmcobGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKTtcblx0Y29uc3QgaW5uZXIgPSBzdHJpcFRva2VuaXplZFdyYXBwZXIoaHRtbCk7XG5cdC8vIGBfdG9rZW5pemVUb1N0cmluZ2Agc2VwYXJhdGVzIGxpbmVzIHdpdGggYDxici8+YCAobm8gY2xvc2luZyB0YWcsXG5cdC8vIGFsd2F5cyBsb3dlci1jYXNlIGluIHRoZSB1cHN0cmVhbSBpbXBsZW1lbnRhdGlvbikuIFNwbGl0dGluZyBvblxuXHQvLyB0aGUgbGl0ZXJhbCBwcmVzZXJ2ZXMgdGhlIGlubmVyIGA8c3BhbiBjbGFzcz1cIm10a05cIj5cdTIwMjY8L3NwYW4+YFxuXHQvLyBtYXJrdXAgdGhhdCBnaXZlcyB1cyB0aGUgc3ludGF4LWhpZ2hsaWdodCBjb2xvdXJzLlxuXHRyZXR1cm4gaW5uZXIuc3BsaXQoJzxici8+Jyk7XG59XG5cbi8qKlxuICogYHRva2VuaXplVG9TdHJpbmdgIHJldHVybnMgSFRNTCB3cmFwcGVkIGluXG4gKiBgPGRpdiBjbGFzcz1cIm1vbmFjby10b2tlbml6ZWQtc291cmNlXCI+XHUyMDI2PC9kaXY+YC4gV2UgcmVuZGVyIHBlci1saW5lIGludG9cbiAqIGFuIGlubGluZSBgPHNwYW4+YCwgc28gd2Ugc3RyaXAgdGhlIHdyYXBwZXIgYW5kIGtlZXAganVzdCB0aGUgaW5uZXJcbiAqIGA8c3BhbiBjbGFzcz1cIm10a05cIj5gIHRva2VuIHNwYW5zLlxuICovXG5mdW5jdGlvbiBzdHJpcFRva2VuaXplZFdyYXBwZXIoaHRtbDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgb3BlblRhZyA9ICc8ZGl2IGNsYXNzPVwibW9uYWNvLXRva2VuaXplZC1zb3VyY2VcIj4nO1xuXHRjb25zdCBjbG9zZVRhZyA9ICc8L2Rpdj4nO1xuXHRpZiAoaHRtbC5zdGFydHNXaXRoKG9wZW5UYWcpICYmIGh0bWwuZW5kc1dpdGgoY2xvc2VUYWcpKSB7XG5cdFx0cmV0dXJuIGh0bWwuc2xpY2Uob3BlblRhZy5sZW5ndGgsIGh0bWwubGVuZ3RoIC0gY2xvc2VUYWcubGVuZ3RoKTtcblx0fVxuXHRyZXR1cm4gaHRtbDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgd2hlbiB0aGUgTW9uYWNvIHRva2VuaXplciBwcm9kdWNlZCByZWFsIHN5bnRheCB0b2tlbnMsXG4gKiBpLmUuIHRoZSBIVE1MIGNvbnRhaW5zIG1vcmUgdGhhbiBqdXN0IGBtdGsxYCBjbGFzcyBzcGFucy4gV2hlbiB0aGVcbiAqIFRleHRNYXRlIGdyYW1tYXIgZm9yIHRoZSBsYW5ndWFnZSBpc24ndCBsb2FkZWQgKGNvbW1vbiBvbiB0aGUgYWdlbnRzXG4gKiB3b3JrYmVuY2ggd2hpY2ggZG9lc24ndCBsb2FkIGJ1aWx0LWluIGxhbmd1YWdlIGV4dGVuc2lvbnMpLCBldmVyeVxuICogdG9rZW4gZmFsbHMgYmFjayB0byBgbXRrMWAgKGRlZmF1bHQgZm9yZWdyb3VuZCkuXG4gKi9cbmZ1bmN0aW9uIGhhc011bHRpcGxlVG9rZW5DbGFzc2VzKGxpbmVzOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRpZiAobGluZSAmJiAvY2xhc3M9XCJtdGtbMi05XXxjbGFzcz1cIm10a1sxLTldWzAtOV0vLnRlc3QobGluZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vIC0tIFJlZ2V4LWJhc2VkIHN5bnRheCBoaWdobGlnaHRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFVzZWQgd2hlbiB0aGUgTW9uYWNvIFRleHRNYXRlIGdyYW1tYXIgaXNuJ3QgYXZhaWxhYmxlICh0aGUgYWdlbnRzIHdpbmRvd1xuLy8gZG9lc24ndCBsb2FkIGJ1aWx0LWluIGxhbmd1YWdlIGV4dGVuc2lvbnMgeWV0OyB0aGlzIGZhbGxiYWNrIGZpcmVzIGZvciBhbnlcbi8vIGxhbmd1YWdlIHdpdGhvdXQgYSByZWdpc3RlcmVkIGdyYW1tYXIpLiBQcm9kdWNlcyBDU1MtY2xhc3Mgc3BhbnMgcmF0aGVyIHRoYW5cbi8vIGlubGluZSBgc3R5bGVgIHNwYW5zIHNvIHRva2VuIGNvbG9ycyBhZGFwdCB0byB0aGUgYWN0aXZlIHRoZW1lIHdpdGhvdXRcbi8vIG5lZWRpbmcgdG8gcmVhZCBhbnkgY29sb3IgbWFwIGhlcmUuIFRoZSBjbGFzc2VzIChgbW9iaWxlLWRpZmYtdG9rLWNvbW1lbnRgLFxuLy8gYG1vYmlsZS1kaWZmLXRvay1zdHJpbmdgLCBgbW9iaWxlLWRpZmYtdG9rLWtleXdvcmRgLCBgbW9iaWxlLWRpZmYtdG9rLW51bWJlcmApXG4vLyBhcmUgc3R5bGVkIGluIGBtZWRpYS9tb2JpbGVPdmVybGF5Vmlld3MuY3NzYCB1c2luZyBwZXItdGhlbWUgQ1NTIHZhcmlhYmxlc1xuLy8gZGVmaW5lZCBhZ2FpbnN0IHRoZSBgLnZzYCwgYC5oYy1ibGFja2AsIGFuZCBgLmhjLWxpZ2h0YCBib2R5IGNsYXNzIHNlbGVjdG9ycyxcbi8vIGtlZXBpbmcgYWxsIHRoZW1lLXNwZWNpZmljIHZhbHVlcyBpbiB0aGUgc3R5bGVzaGVldCByYXRoZXIgdGhhbiBpbiBKUy5cbnR5cGUgUmVnZXhUb2tlbktpbmQgPSAnY29tbWVudCcgfCAnc3RyaW5nJyB8ICdrZXl3b3JkJyB8ICdudW1iZXInIHwgJ2RlZmF1bHQnO1xuXG5pbnRlcmZhY2UgSVJlZ2V4VG9rZW4ge1xuXHRzdGFydDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlcjtcblx0a2luZDogUmVnZXhUb2tlbktpbmQ7XG59XG5cbnR5cGUgTGFuZ0ZhbWlseSA9ICdqcycgfCAncHl0aG9uJyB8ICdjc3MnIHwgJ2h0bWwnIHwgJ2pzb24nIHwgJ3NoZWxsJyB8ICdnZW5lcmljJztcblxuY29uc3QgTEFOR19GQU1JTFk6IFJlY29yZDxzdHJpbmcsIExhbmdGYW1pbHk+ID0ge1xuXHRqYXZhc2NyaXB0OiAnanMnLCBqYXZhc2NyaXB0cmVhY3Q6ICdqcycsXG5cdHR5cGVzY3JpcHQ6ICdqcycsIHR5cGVzY3JpcHRyZWFjdDogJ2pzJyxcblx0amF2YTogJ2pzJywgY3NoYXJwOiAnanMnLCBnbzogJ2pzJywgcnVzdDogJ2pzJyxcblx0Y3BwOiAnanMnLCBjOiAnanMnLCBzd2lmdDogJ2pzJywga290bGluOiAnanMnLCBkYXJ0OiAnanMnLCBwaHA6ICdqcycsIHJ1Ynk6ICdqcycsXG5cdHB5dGhvbjogJ3B5dGhvbicsXG5cdGNzczogJ2NzcycsIHNjc3M6ICdjc3MnLCBsZXNzOiAnY3NzJyxcblx0aHRtbDogJ2h0bWwnLCB4bWw6ICdodG1sJyxcblx0anNvbjogJ2pzb24nLCBqc29uYzogJ2pzb24nLFxuXHRzaGVsbHNjcmlwdDogJ3NoZWxsJywgcG93ZXJzaGVsbDogJ3NoZWxsJyxcbn07XG5cbmNvbnN0IEpTX0tFWVdPUkRTID0gbmV3IFNldChbXG5cdCdicmVhaycsICdjYXNlJywgJ2NhdGNoJywgJ2NsYXNzJywgJ2NvbnN0JywgJ2NvbnRpbnVlJywgJ2RlYnVnZ2VyJywgJ2RlZmF1bHQnLFxuXHQnZGVsZXRlJywgJ2RvJywgJ2Vsc2UnLCAnZXhwb3J0JywgJ2V4dGVuZHMnLCAnZmFsc2UnLCAnZmluYWxseScsICdmb3InLFxuXHQnZnVuY3Rpb24nLCAnaWYnLCAnaW1wb3J0JywgJ2luJywgJ2luc3RhbmNlb2YnLCAnbGV0JywgJ25ldycsICdudWxsJyxcblx0J29mJywgJ3JldHVybicsICdzdGF0aWMnLCAnc3VwZXInLCAnc3dpdGNoJywgJ3RoaXMnLCAndGhyb3cnLCAndHJ1ZScsXG5cdCd0cnknLCAndHlwZW9mJywgJ3VuZGVmaW5lZCcsICd2YXInLCAndm9pZCcsICd3aGlsZScsICd3aXRoJywgJ3lpZWxkJyxcblx0J2FzeW5jJywgJ2F3YWl0JywgJ2Zyb20nLCAnYXMnLCAnaW50ZXJmYWNlJywgJ3R5cGUnLCAnZW51bScsICdkZWNsYXJlJyxcblx0J2Fic3RyYWN0JywgJ292ZXJyaWRlJywgJ3JlYWRvbmx5JywgJ25hbWVzcGFjZScsICdtb2R1bGUnLCAncHVibGljJywgJ3ByaXZhdGUnLCAncHJvdGVjdGVkJyxcbl0pO1xuXG5jb25zdCBQWV9LRVlXT1JEUyA9IG5ldyBTZXQoW1xuXHQnRmFsc2UnLCAnTm9uZScsICdUcnVlJywgJ2FuZCcsICdhcycsICdhc3NlcnQnLCAnYXN5bmMnLCAnYXdhaXQnLFxuXHQnYnJlYWsnLCAnY2xhc3MnLCAnY29udGludWUnLCAnZGVmJywgJ2RlbCcsICdlbGlmJywgJ2Vsc2UnLCAnZXhjZXB0Jyxcblx0J2ZpbmFsbHknLCAnZm9yJywgJ2Zyb20nLCAnZ2xvYmFsJywgJ2lmJywgJ2ltcG9ydCcsICdpbicsICdpcycsXG5cdCdsYW1iZGEnLCAnbm9ubG9jYWwnLCAnbm90JywgJ29yJywgJ3Bhc3MnLCAncmFpc2UnLCAncmV0dXJuJyxcblx0J3RyeScsICd3aGlsZScsICd3aXRoJywgJ3lpZWxkJyxcbl0pO1xuXG5mdW5jdGlvbiBlc2NhcGVIdG1sKHM6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBzLnJlcGxhY2UoLyYvZywgJyZhbXA7JykucmVwbGFjZSgvPC9nLCAnJmx0OycpLnJlcGxhY2UoLz4vZywgJyZndDsnKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRTcGFuKGtpbmQ6IFJlZ2V4VG9rZW5LaW5kLCB0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoa2luZCA9PT0gJ2RlZmF1bHQnIHx8ICF0ZXh0KSB7XG5cdFx0cmV0dXJuIGVzY2FwZUh0bWwodGV4dCk7XG5cdH1cblx0cmV0dXJuIGA8c3BhbiBjbGFzcz1cIm1vYmlsZS1kaWZmLXRvay0ke2tpbmR9XCI+JHtlc2NhcGVIdG1sKHRleHQpfTwvc3Bhbj5gO1xufVxuXG4vKiogVG9rZW5pemUgYSBzaW5nbGUgbGluZSB1c2luZyBzaW1wbGUgcmVnZXggcnVsZXMuIFJldHVybnMgSFRNTC4gKi9cbmZ1bmN0aW9uIHJlZ2V4VG9rZW5pemVMaW5lKGxpbmU6IHN0cmluZywgbGFuZzogTGFuZ0ZhbWlseSk6IHN0cmluZyB7XG5cdGNvbnN0IHRva2VuczogSVJlZ2V4VG9rZW5bXSA9IFtdO1xuXHRsZXQgcG9zID0gMDtcblx0Y29uc3QgbGVuID0gbGluZS5sZW5ndGg7XG5cblx0d2hpbGUgKHBvcyA8IGxlbikge1xuXHRcdGxldCBtYXRjaGVkID0gZmFsc2U7XG5cblx0XHQvLyBMaW5lIGNvbW1lbnRzXG5cdFx0Y29uc3QgY29tbWVudFBmeCA9IGxhbmcgPT09ICdweXRob24nID8gJyMnIDogbGFuZyA9PT0gJ3NoZWxsJyA/ICcjJyA6ICcvLyc7XG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aChjb21tZW50UGZ4LCBwb3MpIHx8IChsYW5nID09PSAnZ2VuZXJpYycgJiYgbGluZS5zdGFydHNXaXRoKCcjJywgcG9zKSkpIHtcblx0XHRcdHRva2Vucy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiBsZW4sIGtpbmQ6ICdjb21tZW50JyB9KTtcblx0XHRcdHBvcyA9IGxlbjtcblx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEJsb2NrIGNvbW1lbnRzIC8qIC4uLiAqL1xuXHRcdGlmICghbWF0Y2hlZCAmJiBsYW5nICE9PSAncHl0aG9uJyAmJiBsYW5nICE9PSAnc2hlbGwnICYmIGxpbmUuc3RhcnRzV2l0aCgnLyonLCBwb3MpKSB7XG5cdFx0XHRjb25zdCBlbmQgPSBsaW5lLmluZGV4T2YoJyovJywgcG9zICsgMik7XG5cdFx0XHRjb25zdCB0b2tlbkVuZCA9IGVuZCA9PT0gLTEgPyBsZW4gOiBlbmQgKyAyO1xuXHRcdFx0dG9rZW5zLnB1c2goeyBzdGFydDogcG9zLCBlbmQ6IHRva2VuRW5kLCBraW5kOiAnY29tbWVudCcgfSk7XG5cdFx0XHRwb3MgPSB0b2tlbkVuZDtcblx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFRlbXBsYXRlIGxpdGVyYWxzXG5cdFx0aWYgKCFtYXRjaGVkICYmIChsYW5nID09PSAnanMnKSAmJiBsaW5lW3Bvc10gPT09ICdgJykge1xuXHRcdFx0bGV0IGkgPSBwb3MgKyAxO1xuXHRcdFx0d2hpbGUgKGkgPCBsZW4pIHtcblx0XHRcdFx0aWYgKGxpbmVbaV0gPT09ICdcXFxcJykgeyBpICs9IDI7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGlmIChsaW5lW2ldID09PSAnYCcpIHsgaSsrOyBicmVhazsgfVxuXHRcdFx0XHRpKys7XG5cdFx0XHR9XG5cdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogaSwga2luZDogJ3N0cmluZycgfSk7XG5cdFx0XHRwb3MgPSBpO1xuXHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gU3RyaW5nc1xuXHRcdGlmICghbWF0Y2hlZCAmJiAobGluZVtwb3NdID09PSAnXCInIHx8IGxpbmVbcG9zXSA9PT0gJ1xcJycpKSB7XG5cdFx0XHRjb25zdCBxID0gbGluZVtwb3NdO1xuXHRcdFx0bGV0IGkgPSBwb3MgKyAxO1xuXHRcdFx0d2hpbGUgKGkgPCBsZW4pIHtcblx0XHRcdFx0aWYgKGxpbmVbaV0gPT09ICdcXFxcJykgeyBpICs9IDI7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGlmIChsaW5lW2ldID09PSBxKSB7IGkrKzsgYnJlYWs7IH1cblx0XHRcdFx0aSsrO1xuXHRcdFx0fVxuXHRcdFx0dG9rZW5zLnB1c2goeyBzdGFydDogcG9zLCBlbmQ6IGksIGtpbmQ6ICdzdHJpbmcnIH0pO1xuXHRcdFx0cG9zID0gaTtcblx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIE51bWJlcnNcblx0XHRpZiAoIW1hdGNoZWQgJiYgL1swLTldLy50ZXN0KGxpbmVbcG9zXSkpIHtcblx0XHRcdGNvbnN0IG0gPSBsaW5lLnNsaWNlKHBvcykubWF0Y2goL14weFswLTlhLWZBLUZdK3xeWzAtOV0rXFwuP1swLTldKig/OltlRV1bKy1dP1swLTldKyk/Lyk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogcG9zICsgbVswXS5sZW5ndGgsIGtpbmQ6ICdudW1iZXInIH0pO1xuXHRcdFx0XHRwb3MgKz0gbVswXS5sZW5ndGg7XG5cdFx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEtleXdvcmRzIGFuZCBpZGVudGlmaWVyc1xuXHRcdGlmICghbWF0Y2hlZCAmJiAvW2EtekEtWl8kXS8udGVzdChsaW5lW3Bvc10pKSB7XG5cdFx0XHRjb25zdCBtID0gbGluZS5zbGljZShwb3MpLm1hdGNoKC9eW2EtekEtWl8kXVthLXpBLVowLTlfJF0qLyk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRjb25zdCB3b3JkID0gbVswXTtcblx0XHRcdFx0Y29uc3Qga2V5d29yZHMgPSBsYW5nID09PSAncHl0aG9uJyA/IFBZX0tFWVdPUkRTIDogSlNfS0VZV09SRFM7XG5cdFx0XHRcdGNvbnN0IGtpbmQ6IFJlZ2V4VG9rZW5LaW5kID0ga2V5d29yZHMuaGFzKHdvcmQpID8gJ2tleXdvcmQnIDogJ2RlZmF1bHQnO1xuXHRcdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogcG9zICsgd29yZC5sZW5ndGgsIGtpbmQgfSk7XG5cdFx0XHRcdHBvcyArPSB3b3JkLmxlbmd0aDtcblx0XHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFtYXRjaGVkKSB7XG5cdFx0XHQvLyBBZHZhbmNlIG9uZSBjaGFyYWN0ZXIgKG9wZXJhdG9yL3B1bmN0dWF0aW9uL3doaXRlc3BhY2UpXG5cdFx0XHRjb25zdCBwcmV2VG9rID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXTtcblx0XHRcdC8vIENvYWxlc2NlIGNvbnNlY3V0aXZlIGRlZmF1bHQtY29sb3JlZCBjaGFycyB0byBhdm9pZCBzcGFuIGJsb2F0XG5cdFx0XHRpZiAocHJldlRvayAmJiBwcmV2VG9rLmtpbmQgPT09ICdkZWZhdWx0Jykge1xuXHRcdFx0XHRwcmV2VG9rLmVuZCA9IHBvcyArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogcG9zICsgMSwga2luZDogJ2RlZmF1bHQnIH0pO1xuXHRcdFx0fVxuXHRcdFx0cG9zKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRva2Vucy5tYXAodCA9PiBidWlsZFNwYW4odC5raW5kLCBsaW5lLnNsaWNlKHQuc3RhcnQsIHQuZW5kKSkpLmpvaW4oJycpO1xufVxuXG4vKipcbiAqIFRva2VuaXplIGFsbCBsaW5lcyBvZiBgdGV4dGAgdXNpbmcgdGhlIHJlZ2V4IGhpZ2hsaWdodGVyLlxuICogUmV0dXJucyBvbmUgSFRNTCBzdHJpbmcgcGVyIHNvdXJjZSBsaW5lIChzYW1lIHNoYXBlIGFzIGB0b2tlbml6ZUZpbGVMaW5lc2ApLlxuICovXG5mdW5jdGlvbiByZWdleFRva2VuaXplTGluZXModGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGlmICghdGV4dCkge1xuXHRcdHJldHVybiBbJyddO1xuXHR9XG5cdGNvbnN0IGxhbmc6IExhbmdGYW1pbHkgPSBMQU5HX0ZBTUlMWVtsYW5ndWFnZUlkXSA/PyAnZ2VuZXJpYyc7XG5cdHJldHVybiB0ZXh0LnNwbGl0KC9cXHI/XFxuLykubWFwKGxpbmUgPT4gcmVnZXhUb2tlbml6ZUxpbmUobGluZSwgbGFuZykpO1xufVxuXG4vLyAtLSBVbmlmaWVkIGRpZmYgaHVuayByZW5kZXJpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBVc2VzIHRoZSB3b3JrYmVuY2gncyBgbGluZXNEaWZmQ29tcHV0ZXJzYCBzbyB3ZSBnZXQgdGhlIHNhbWUgZGlmZiBxdWFsaXR5IGFzXG4vLyB0aGUgZGlmZiBlZGl0b3IgXHUyMDE0IG5vIGluLXRyZWUgZGlmZiBhbGdvcml0aG0gdG8gbWFpbnRhaW4uXG5cbmludGVyZmFjZSBJRGlmZkxpbmUge1xuXHR0eXBlOiAnY29udGV4dCcgfCAnYWRkZWQnIHwgJ3JlbW92ZWQnO1xuXHRsaW5lTnVtPzogbnVtYmVyO1xuXHR0ZXh0OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJRGlmZkh1bmsge1xuXHRoZWFkZXI6IHN0cmluZztcblx0bGluZXM6IElEaWZmTGluZVtdO1xufVxuXG5jb25zdCBDT05URVhUX0xJTkVTID0gMztcblxuZnVuY3Rpb24gY29tcHV0ZVVuaWZpZWREaWZmKG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcpOiBJRGlmZkh1bmtbXSB7XG5cdGNvbnN0IG9yaWdMaW5lcyA9IG9yaWdpbmFsLnNwbGl0KC9cXHI/XFxuLyk7XG5cdGNvbnN0IG1vZExpbmVzID0gbW9kaWZpZWQuc3BsaXQoL1xccj9cXG4vKTtcblxuXHRjb25zdCByZXN1bHQgPSBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0RGVmYXVsdCgpLmNvbXB1dGVEaWZmKG9yaWdMaW5lcywgbW9kTGluZXMsIHtcblx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsXG5cdFx0bWF4Q29tcHV0YXRpb25UaW1lTXM6IDEwMDAsXG5cdFx0Y29tcHV0ZU1vdmVzOiBmYWxzZSxcblx0fSk7XG5cblx0aWYgKHJlc3VsdC5jaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8vIE1lcmdlIGNoYW5nZXMgdGhhdCBhcmUgd2l0aGluIDIqQ09OVEVYVF9MSU5FUyBvZiBlYWNoIG90aGVyIGludG8gYVxuXHQvLyBzaW5nbGUgaHVuayBzbyBjb25zZWN1dGl2ZSBlZGl0cyBhcmVuJ3QgdmlzdWFsbHkgZnJhZ21lbnRlZC4gRWFjaFxuXHQvLyBncm91cCBrZWVwcyB0aGUgbGlzdCBvZiB1bmRlcmx5aW5nIGNoYW5nZXMgc28gdGhhdCB1bmNoYW5nZWQgbGluZXNcblx0Ly8gYmV0d2VlbiBtZXJnZWQgc3ViLWNoYW5nZXMgY2FuIGxhdGVyIGJlIGVtaXR0ZWQgYXMgYGNvbnRleHRgIHJhdGhlclxuXHQvLyB0aGFuIGByZW1vdmVkYC9gYWRkZWRgLlxuXHR0eXBlIFN1YiA9IHsgb3JpZ1N0YXJ0OiBudW1iZXI7IG9yaWdFbmQ6IG51bWJlcjsgbW9kU3RhcnQ6IG51bWJlcjsgbW9kRW5kOiBudW1iZXIgfTtcblx0dHlwZSBHcm91cCA9IHsgc3ViczogU3ViW10gfTtcblx0Y29uc3QgZ3JvdXBzOiBHcm91cFtdID0gW107XG5cdGZvciAoY29uc3QgY2hhbmdlIG9mIHJlc3VsdC5jaGFuZ2VzKSB7XG5cdFx0Y29uc3Qgc3ViOiBTdWIgPSB7XG5cdFx0XHRvcmlnU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRvcmlnRW5kOiBjaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdG1vZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kRW5kOiBjaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhc3QgPSBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IGxhc3RTdWIgPSBsYXN0Py5zdWJzW2xhc3Quc3Vicy5sZW5ndGggLSAxXTtcblx0XHRpZiAobGFzdFN1YiAmJiBzdWIub3JpZ1N0YXJ0IC0gbGFzdFN1Yi5vcmlnRW5kIDw9IENPTlRFWFRfTElORVMgKiAyKSB7XG5cdFx0XHRsYXN0IS5zdWJzLnB1c2goc3ViKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Z3JvdXBzLnB1c2goeyBzdWJzOiBbc3ViXSB9KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBodW5rczogSURpZmZIdW5rW10gPSBbXTtcblx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRjb25zdCBmaXJzdCA9IGdyb3VwLnN1YnNbMF07XG5cdFx0Y29uc3QgbGFzdCA9IGdyb3VwLnN1YnNbZ3JvdXAuc3Vicy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBvcmlnTGVhZGluZyA9IE1hdGgubWF4KDEsIGZpcnN0Lm9yaWdTdGFydCAtIENPTlRFWFRfTElORVMpO1xuXHRcdGNvbnN0IG1vZExlYWRpbmcgPSBNYXRoLm1heCgxLCBmaXJzdC5tb2RTdGFydCAtIENPTlRFWFRfTElORVMpO1xuXHRcdGNvbnN0IG9yaWdUcmFpbGluZyA9IE1hdGgubWluKG9yaWdMaW5lcy5sZW5ndGggKyAxLCBsYXN0Lm9yaWdFbmQgKyBDT05URVhUX0xJTkVTKTtcblx0XHRjb25zdCBtb2RUcmFpbGluZyA9IE1hdGgubWluKG1vZExpbmVzLmxlbmd0aCArIDEsIGxhc3QubW9kRW5kICsgQ09OVEVYVF9MSU5FUyk7XG5cblx0XHRjb25zdCBsaW5lczogSURpZmZMaW5lW10gPSBbXTtcblxuXHRcdC8vIExlYWRpbmcgY29udGV4dCAoZnJvbSBvcmlnaW5hbCBcdTIwMTQgaWRlbnRpY2FsIHRvIG1vZGlmaWVkIGluIHVuY2hhbmdlZCByZWdpb25zKS5cblx0XHRmb3IgKGxldCBpID0gb3JpZ0xlYWRpbmc7IGkgPCBmaXJzdC5vcmlnU3RhcnQ7IGkrKykge1xuXHRcdFx0bGluZXMucHVzaCh7IHR5cGU6ICdjb250ZXh0JywgbGluZU51bTogaSwgdGV4dDogb3JpZ0xpbmVzW2kgLSAxXSA/PyAnJyB9KTtcblx0XHR9XG5cblx0XHQvLyBXYWxrIGVhY2ggc3ViLWNoYW5nZSBpbiB0aGUgZ3JvdXAuIEVtaXQgcmVtb3ZlZC9hZGRlZCBmb3IgdGhlXG5cdFx0Ly8gY2hhbmdlIGl0c2VsZiwgdGhlbiBjb250ZXh0IGxpbmVzIGZvciB0aGUgdW5jaGFuZ2VkIHJlZ2lvblxuXHRcdC8vIGJldHdlZW4gdGhpcyBzdWIgYW5kIHRoZSBuZXh0LlxuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgZ3JvdXAuc3Vicy5sZW5ndGg7IHMrKykge1xuXHRcdFx0Y29uc3Qgc3ViID0gZ3JvdXAuc3Vic1tzXTtcblx0XHRcdGZvciAobGV0IGkgPSBzdWIub3JpZ1N0YXJ0OyBpIDwgc3ViLm9yaWdFbmQ7IGkrKykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ3JlbW92ZWQnLCBsaW5lTnVtOiBpLCB0ZXh0OiBvcmlnTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IHN1Yi5tb2RTdGFydDsgaSA8IHN1Yi5tb2RFbmQ7IGkrKykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ2FkZGVkJywgbGluZU51bTogaSwgdGV4dDogbW9kTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV4dCA9IGdyb3VwLnN1YnNbcyArIDFdO1xuXHRcdFx0aWYgKG5leHQpIHtcblx0XHRcdFx0Ly8gVW5jaGFuZ2VkIHJlZ2lvbiBiZXR3ZWVuIHR3byBtZXJnZWQgc3ViLWNoYW5nZXMgXHUyMDE0IHRoZXNlXG5cdFx0XHRcdC8vIG11c3QgcmVuZGVyIGFzIGNvbnRleHQuIFdlIGRpc3BsYXkgdGhlbSB3aXRoIHRoZWlyXG5cdFx0XHRcdC8vIG9yaWdpbmFsLXNpZGUgbGluZSBudW1iZXJzIGJlY2F1c2UgdGhlIGd1dHRlciBtaXJyb3JzXG5cdFx0XHRcdC8vIHRoZSBvcmlnaW5hbCBzaWRlIGZvciBjb250ZXh0IHJvd3MgZWxzZXdoZXJlIGluIHRoZSBmaWxlLlxuXHRcdFx0XHRmb3IgKGxldCBpID0gc3ViLm9yaWdFbmQ7IGkgPCBuZXh0Lm9yaWdTdGFydDsgaSsrKSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaCh7IHR5cGU6ICdjb250ZXh0JywgbGluZU51bTogaSwgdGV4dDogb3JpZ0xpbmVzW2kgLSAxXSA/PyAnJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRyYWlsaW5nIGNvbnRleHQuXG5cdFx0Zm9yIChsZXQgaSA9IGxhc3Qub3JpZ0VuZDsgaSA8IG9yaWdUcmFpbGluZzsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ2NvbnRleHQnLCBsaW5lTnVtOiBpLCB0ZXh0OiBvcmlnTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdDb3VudCA9IG9yaWdUcmFpbGluZyAtIG9yaWdMZWFkaW5nO1xuXHRcdGNvbnN0IG1vZENvdW50ID0gbW9kVHJhaWxpbmcgLSBtb2RMZWFkaW5nO1xuXHRcdGh1bmtzLnB1c2goe1xuXHRcdFx0aGVhZGVyOiBgQEAgLSR7b3JpZ0xlYWRpbmd9LCR7b3JpZ0NvdW50fSArJHttb2RMZWFkaW5nfSwke21vZENvdW50fSBAQGAsXG5cdFx0XHRsaW5lcyxcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiBodW5rcztcbn1cblxuLyoqXG4gKiBPcGVucyBhIHtAbGluayBNb2JpbGVEaWZmVmlld30gZm9yIHRoZSBnaXZlbiBmaWxlIGRpZmYuXG4gKiBSZXR1cm5zIHRoZSB2aWV3IGluc3RhbmNlOyBkaXNwb3NlIGl0IHRvIGNsb3NlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gb3Blbk1vYmlsZURpZmZWaWV3KFxuXHR3b3JrYmVuY2hDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRkYXRhOiBJTW9iaWxlRGlmZlZpZXdEYXRhLFxuXHR0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcbik6IE1vYmlsZURpZmZWaWV3IHtcblx0cmV0dXJuIG5ldyBNb2JpbGVEaWZmVmlldyh3b3JrYmVuY2hDb250YWluZXIsIGRhdGEsIHRleHRGaWxlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUd6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxT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
