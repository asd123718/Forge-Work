import { basename } from "../../../../../base/common/resources.js";
import { linesDiffComputers } from "../../../../../editor/common/diff/linesDiffComputers.js";
import { tokenizeToString } from "../../../../../editor/common/languages/textToHtmlTokenizer.js";
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
function resolveMobileDiffLanguageId(languageService, diff) {
  const uri = diff.modifiedURI ?? diff.originalURI;
  if (!uri) {
    return "plaintext";
  }
  const guessed = languageService.guessLanguageIdByFilepathOrFirstLine(uri);
  if (guessed && guessed !== "unknown") {
    return guessed;
  }
  const name = basename(uri);
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
  return EXTENSION_LANGUAGE_MAP[ext] ?? "plaintext";
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
export {
  computeUnifiedDiff,
  hasMultipleTokenClasses,
  regexTokenizeLines,
  resolveMobileDiffLanguageId,
  tokenizeFileLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcYnJvd3NlclxccGFydHNcXG1vYmlsZVxcY29udHJpYnV0aW9uc1xcbW9iaWxlRGlmZkhlbHBlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbGluZXNEaWZmQ29tcHV0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2xpbmVzRGlmZkNvbXB1dGVycy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgdG9rZW5pemVUb1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3RleHRUb0h0bWxUb2tlbml6ZXIuanMnO1xuXG5pbnRlcmZhY2UgSUZpbGVEaWZmTGlrZSB7XG5cdHJlYWRvbmx5IG9yaWdpbmFsVVJJOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1vZGlmaWVkVVJJOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbi8qKiBIYXJkY29kZWQgZXh0ZW5zaW9uXHUyMTkybGFuZ3VhZ2VJZCBmYWxsYmFjayBmb3IgY29tbW9uIGxhbmd1YWdlcy5cbiAqXG4gKiBUaGUgYWdlbnRzIHdpbmRvdyBkb2VzIG5vdCBsb2FkIGxhbmd1YWdlIHNlcnZpY2VzIC8gYnVpbHQtaW4gbGFuZ3VhZ2VcbiAqIGV4dGVuc2lvbnMgeWV0LCBzbyBgSUxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmVgXG4gKiByZXR1cm5zIGAndW5rbm93bidgIGZvciBldmVyeXRoaW5nIGV4Y2VwdCBhIHNtYWxsIGNvcmUgc2V0LiBPbmNlIHRoZVxuICogYWdlbnRzIHdpbmRvdyBzdGFydHMgbG9hZGluZyBsYW5ndWFnZSBzZXJ2aWNlcyB0aGlzIG1hcCBiZWNvbWVzIGFcbiAqIHB1cmUgZmFsbGJhY2sgZm9yIHRoZSBsZWZ0b3ZlciBgJ3Vua25vd24nYCBjYXNlcy4gVGhlIElEcyBtYXRjaFxuICogVlMgQ29kZSdzIGJ1aWx0LWluIGV4dGVuc2lvbiBgcGFja2FnZS5qc29uYCBjb250cmlidXRpb25zLiAqL1xuY29uc3QgRVhURU5TSU9OX0xBTkdVQUdFX01BUDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0Jy5qcyc6ICdqYXZhc2NyaXB0JywgJy5tanMnOiAnamF2YXNjcmlwdCcsICcuY2pzJzogJ2phdmFzY3JpcHQnLFxuXHQnLmpzeCc6ICdqYXZhc2NyaXB0cmVhY3QnLFxuXHQnLnRzJzogJ3R5cGVzY3JpcHQnLCAnLm10cyc6ICd0eXBlc2NyaXB0JywgJy5jdHMnOiAndHlwZXNjcmlwdCcsXG5cdCcudHN4JzogJ3R5cGVzY3JpcHRyZWFjdCcsXG5cdCcucHknOiAncHl0aG9uJywgJy5weXcnOiAncHl0aG9uJyxcblx0Jy5qYXZhJzogJ2phdmEnLFxuXHQnLmMnOiAnYycsICcuaCc6ICdjJyxcblx0Jy5jcHAnOiAnY3BwJywgJy5jYyc6ICdjcHAnLCAnLmN4eCc6ICdjcHAnLCAnLmhwcCc6ICdjcHAnLFxuXHQnLmNzJzogJ2NzaGFycCcsXG5cdCcuZ28nOiAnZ28nLFxuXHQnLnJzJzogJ3J1c3QnLFxuXHQnLnJiJzogJ3J1YnknLFxuXHQnLnBocCc6ICdwaHAnLFxuXHQnLmh0bWwnOiAnaHRtbCcsICcuaHRtJzogJ2h0bWwnLFxuXHQnLmNzcyc6ICdjc3MnLCAnLnNjc3MnOiAnc2NzcycsICcubGVzcyc6ICdsZXNzJyxcblx0Jy5qc29uJzogJ2pzb24nLCAnLmpzb25jJzogJ2pzb25jJyxcblx0Jy5tZCc6ICdtYXJrZG93bicsXG5cdCcuc2gnOiAnc2hlbGxzY3JpcHQnLCAnLmJhc2gnOiAnc2hlbGxzY3JpcHQnLCAnLnpzaCc6ICdzaGVsbHNjcmlwdCcsXG5cdCcueWFtbCc6ICd5YW1sJywgJy55bWwnOiAneWFtbCcsXG5cdCcueG1sJzogJ3htbCcsXG5cdCcuc3FsJzogJ3NxbCcsXG5cdCcuc3dpZnQnOiAnc3dpZnQnLFxuXHQnLmt0JzogJ2tvdGxpbicsICcua3RzJzogJ2tvdGxpbicsXG5cdCcucic6ICdyJyxcblx0Jy5sdWEnOiAnbHVhJyxcblx0Jy5kYXJ0JzogJ2RhcnQnLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVNb2JpbGVEaWZmTGFuZ3VhZ2VJZChsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIGRpZmY6IElGaWxlRGlmZkxpa2UpOiBzdHJpbmcge1xuXHRjb25zdCB1cmkgPSBkaWZmLm1vZGlmaWVkVVJJID8/IGRpZmYub3JpZ2luYWxVUkk7XG5cdGlmICghdXJpKSB7XG5cdFx0cmV0dXJuICdwbGFpbnRleHQnO1xuXHR9XG5cdC8vIGBndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmVgIGFscmVhZHkgaGFuZGxlcyB1bmtub3duXG5cdC8vIFVSSSBzY2hlbWVzIChsaWtlIGB2c2NvZGUtYWdlbnQtaG9zdDovL2ApIHRocm91Z2ggcmVzb3VyY2UgcGF0aHNcblx0Ly8gYW5kIGJhc2VuYW1lcyBmb3IgZXh0ZW5zaW9uIG1hdGNoaW5nLlxuXHRjb25zdCBndWVzc2VkID0gbGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZSh1cmkpO1xuXHRpZiAoZ3Vlc3NlZCAmJiBndWVzc2VkICE9PSAndW5rbm93bicpIHtcblx0XHRyZXR1cm4gZ3Vlc3NlZDtcblx0fVxuXHRjb25zdCBuYW1lID0gYmFzZW5hbWUodXJpKTtcblx0Y29uc3QgZXh0ID0gbmFtZS5pbmNsdWRlcygnLicpID8gbmFtZS5zbGljZShuYW1lLmxhc3RJbmRleE9mKCcuJykpLnRvTG93ZXJDYXNlKCkgOiAnJztcblx0cmV0dXJuIEVYVEVOU0lPTl9MQU5HVUFHRV9NQVBbZXh0XSA/PyAncGxhaW50ZXh0Jztcbn1cblxuLyoqXG4gKiBUb2tlbml6ZSBhIGZ1bGwgdGV4dCBhbmQgcmV0dXJuIHRoZSBwZXItbGluZSBIVE1MIChvbmUgZW50cnkgcGVyXG4gKiBzb3VyY2UgbGluZSwgaW4gb3JkZXIpLiBVc2VzIGB0b2tlbml6ZVRvU3RyaW5nYCB3aGljaCBhd2FpdHNcbiAqIGBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRPckNyZWF0ZShsYW5ndWFnZUlkKWAgXHUyMDE0IHdpdGhvdXQgdGhhdCwgc3luY1xuICogdG9rZW5pemF0aW9uIHJldHVybnMgbnVsbCBoaWdobGlnaHRpbmcgZm9yIGFueSBsYW5ndWFnZSB3aG9zZVxuICogdGV4dG1hdGUgZ3JhbW1hciBoYXNuJ3QgYmVlbiBhY3RpdmF0ZWQgeWV0LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdG9rZW5pemVGaWxlTGluZXMobGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0aWYgKCF0ZXh0KSB7XG5cdFx0cmV0dXJuIFsnJ107XG5cdH1cblx0Y29uc3QgaHRtbCA9IGF3YWl0IHRva2VuaXplVG9TdHJpbmcobGFuZ3VhZ2VTZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKTtcblx0Y29uc3QgaW5uZXIgPSBzdHJpcFRva2VuaXplZFdyYXBwZXIoaHRtbCk7XG5cdHJldHVybiBpbm5lci5zcGxpdCgnPGJyLz4nKTtcbn1cblxuZnVuY3Rpb24gc3RyaXBUb2tlbml6ZWRXcmFwcGVyKGh0bWw6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IG9wZW5UYWcgPSAnPGRpdiBjbGFzcz1cIm1vbmFjby10b2tlbml6ZWQtc291cmNlXCI+Jztcblx0Y29uc3QgY2xvc2VUYWcgPSAnPC9kaXY+Jztcblx0aWYgKGh0bWwuc3RhcnRzV2l0aChvcGVuVGFnKSAmJiBodG1sLmVuZHNXaXRoKGNsb3NlVGFnKSkge1xuXHRcdHJldHVybiBodG1sLnNsaWNlKG9wZW5UYWcubGVuZ3RoLCBodG1sLmxlbmd0aCAtIGNsb3NlVGFnLmxlbmd0aCk7XG5cdH1cblx0cmV0dXJuIGh0bWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNNdWx0aXBsZVRva2VuQ2xhc3NlcyhsaW5lczogcmVhZG9ubHkgc3RyaW5nW10pOiBib29sZWFuIHtcblx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0aWYgKGxpbmUgJiYgL2NsYXNzPVwibXRrWzItOV18Y2xhc3M9XCJtdGtbMS05XVswLTldLy50ZXN0KGxpbmUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG50eXBlIFJlZ2V4VG9rZW5LaW5kID0gJ2NvbW1lbnQnIHwgJ3N0cmluZycgfCAna2V5d29yZCcgfCAnbnVtYmVyJyB8ICdkZWZhdWx0JztcblxuaW50ZXJmYWNlIElSZWdleFRva2VuIHtcblx0c3RhcnQ6IG51bWJlcjtcblx0ZW5kOiBudW1iZXI7XG5cdGtpbmQ6IFJlZ2V4VG9rZW5LaW5kO1xufVxuXG50eXBlIExhbmdGYW1pbHkgPSAnanMnIHwgJ3B5dGhvbicgfCAnY3NzJyB8ICdodG1sJyB8ICdqc29uJyB8ICdzaGVsbCcgfCAnZ2VuZXJpYyc7XG5cbmNvbnN0IExBTkdfRkFNSUxZOiBSZWNvcmQ8c3RyaW5nLCBMYW5nRmFtaWx5PiA9IHtcblx0amF2YXNjcmlwdDogJ2pzJywgamF2YXNjcmlwdHJlYWN0OiAnanMnLFxuXHR0eXBlc2NyaXB0OiAnanMnLCB0eXBlc2NyaXB0cmVhY3Q6ICdqcycsXG5cdGphdmE6ICdqcycsIGNzaGFycDogJ2pzJywgZ286ICdqcycsIHJ1c3Q6ICdqcycsXG5cdGNwcDogJ2pzJywgYzogJ2pzJywgc3dpZnQ6ICdqcycsIGtvdGxpbjogJ2pzJywgZGFydDogJ2pzJywgcGhwOiAnanMnLCBydWJ5OiAnanMnLFxuXHRweXRob246ICdweXRob24nLFxuXHRjc3M6ICdjc3MnLCBzY3NzOiAnY3NzJywgbGVzczogJ2NzcycsXG5cdGh0bWw6ICdodG1sJywgeG1sOiAnaHRtbCcsXG5cdGpzb246ICdqc29uJywganNvbmM6ICdqc29uJyxcblx0c2hlbGxzY3JpcHQ6ICdzaGVsbCcsIHBvd2Vyc2hlbGw6ICdzaGVsbCcsXG59O1xuXG5jb25zdCBKU19LRVlXT1JEUyA9IG5ldyBTZXQoW1xuXHQnYnJlYWsnLCAnY2FzZScsICdjYXRjaCcsICdjbGFzcycsICdjb25zdCcsICdjb250aW51ZScsICdkZWJ1Z2dlcicsICdkZWZhdWx0Jyxcblx0J2RlbGV0ZScsICdkbycsICdlbHNlJywgJ2V4cG9ydCcsICdleHRlbmRzJywgJ2ZhbHNlJywgJ2ZpbmFsbHknLCAnZm9yJyxcblx0J2Z1bmN0aW9uJywgJ2lmJywgJ2ltcG9ydCcsICdpbicsICdpbnN0YW5jZW9mJywgJ2xldCcsICduZXcnLCAnbnVsbCcsXG5cdCdvZicsICdyZXR1cm4nLCAnc3RhdGljJywgJ3N1cGVyJywgJ3N3aXRjaCcsICd0aGlzJywgJ3Rocm93JywgJ3RydWUnLFxuXHQndHJ5JywgJ3R5cGVvZicsICd1bmRlZmluZWQnLCAndmFyJywgJ3ZvaWQnLCAnd2hpbGUnLCAnd2l0aCcsICd5aWVsZCcsXG5cdCdhc3luYycsICdhd2FpdCcsICdmcm9tJywgJ2FzJywgJ2ludGVyZmFjZScsICd0eXBlJywgJ2VudW0nLCAnZGVjbGFyZScsXG5cdCdhYnN0cmFjdCcsICdvdmVycmlkZScsICdyZWFkb25seScsICduYW1lc3BhY2UnLCAnbW9kdWxlJywgJ3B1YmxpYycsICdwcml2YXRlJywgJ3Byb3RlY3RlZCcsXG5dKTtcblxuY29uc3QgUFlfS0VZV09SRFMgPSBuZXcgU2V0KFtcblx0J0ZhbHNlJywgJ05vbmUnLCAnVHJ1ZScsICdhbmQnLCAnYXMnLCAnYXNzZXJ0JywgJ2FzeW5jJywgJ2F3YWl0Jyxcblx0J2JyZWFrJywgJ2NsYXNzJywgJ2NvbnRpbnVlJywgJ2RlZicsICdkZWwnLCAnZWxpZicsICdlbHNlJywgJ2V4Y2VwdCcsXG5cdCdmaW5hbGx5JywgJ2ZvcicsICdmcm9tJywgJ2dsb2JhbCcsICdpZicsICdpbXBvcnQnLCAnaW4nLCAnaXMnLFxuXHQnbGFtYmRhJywgJ25vbmxvY2FsJywgJ25vdCcsICdvcicsICdwYXNzJywgJ3JhaXNlJywgJ3JldHVybicsXG5cdCd0cnknLCAnd2hpbGUnLCAnd2l0aCcsICd5aWVsZCcsXG5dKTtcblxuZnVuY3Rpb24gZXNjYXBlSHRtbChzOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcy5yZXBsYWNlKC8mL2csICcmYW1wOycpLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC8+L2csICcmZ3Q7Jyk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkU3BhbihraW5kOiBSZWdleFRva2VuS2luZCwgdGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKGtpbmQgPT09ICdkZWZhdWx0JyB8fCAhdGV4dCkge1xuXHRcdHJldHVybiBlc2NhcGVIdG1sKHRleHQpO1xuXHR9XG5cdHJldHVybiBgPHNwYW4gY2xhc3M9XCJtb2JpbGUtZGlmZi10b2stJHtraW5kfVwiPiR7ZXNjYXBlSHRtbCh0ZXh0KX08L3NwYW4+YDtcbn1cblxuZnVuY3Rpb24gcmVnZXhUb2tlbml6ZUxpbmUobGluZTogc3RyaW5nLCBsYW5nOiBMYW5nRmFtaWx5KTogc3RyaW5nIHtcblx0Y29uc3QgdG9rZW5zOiBJUmVnZXhUb2tlbltdID0gW107XG5cdGxldCBwb3MgPSAwO1xuXHRjb25zdCBsZW4gPSBsaW5lLmxlbmd0aDtcblxuXHR3aGlsZSAocG9zIDwgbGVuKSB7XG5cdFx0bGV0IG1hdGNoZWQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGNvbW1lbnRQZnggPSBsYW5nID09PSAncHl0aG9uJyA/ICcjJyA6IGxhbmcgPT09ICdzaGVsbCcgPyAnIycgOiAnLy8nO1xuXHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoY29tbWVudFBmeCwgcG9zKSB8fCAobGFuZyA9PT0gJ2dlbmVyaWMnICYmIGxpbmUuc3RhcnRzV2l0aCgnIycsIHBvcykpKSB7XG5cdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogbGVuLCBraW5kOiAnY29tbWVudCcgfSk7XG5cdFx0XHRwb3MgPSBsZW47XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoZWQgJiYgbGFuZyAhPT0gJ3B5dGhvbicgJiYgbGFuZyAhPT0gJ3NoZWxsJyAmJiBsaW5lLnN0YXJ0c1dpdGgoJy8qJywgcG9zKSkge1xuXHRcdFx0Y29uc3QgZW5kID0gbGluZS5pbmRleE9mKCcqLycsIHBvcyArIDIpO1xuXHRcdFx0Y29uc3QgdG9rZW5FbmQgPSBlbmQgPT09IC0xID8gbGVuIDogZW5kICsgMjtcblx0XHRcdHRva2Vucy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiB0b2tlbkVuZCwga2luZDogJ2NvbW1lbnQnIH0pO1xuXHRcdFx0cG9zID0gdG9rZW5FbmQ7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoZWQgJiYgKGxhbmcgPT09ICdqcycpICYmIGxpbmVbcG9zXSA9PT0gJ2AnKSB7XG5cdFx0XHRsZXQgaSA9IHBvcyArIDE7XG5cdFx0XHR3aGlsZSAoaSA8IGxlbikge1xuXHRcdFx0XHRpZiAobGluZVtpXSA9PT0gJ1xcXFwnKSB7IGkgKz0gMjsgY29udGludWU7IH1cblx0XHRcdFx0aWYgKGxpbmVbaV0gPT09ICdgJykgeyBpKys7IGJyZWFrOyB9XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblx0XHRcdHRva2Vucy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiBpLCBraW5kOiAnc3RyaW5nJyB9KTtcblx0XHRcdHBvcyA9IGk7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoZWQgJiYgKGxpbmVbcG9zXSA9PT0gJ1wiJyB8fCBsaW5lW3Bvc10gPT09ICdcXCcnKSkge1xuXHRcdFx0Y29uc3QgcSA9IGxpbmVbcG9zXTtcblx0XHRcdGxldCBpID0gcG9zICsgMTtcblx0XHRcdHdoaWxlIChpIDwgbGVuKSB7XG5cdFx0XHRcdGlmIChsaW5lW2ldID09PSAnXFxcXCcpIHsgaSArPSAyOyBjb250aW51ZTsgfVxuXHRcdFx0XHRpZiAobGluZVtpXSA9PT0gcSkgeyBpKys7IGJyZWFrOyB9XG5cdFx0XHRcdGkrKztcblx0XHRcdH1cblx0XHRcdHRva2Vucy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiBpLCBraW5kOiAnc3RyaW5nJyB9KTtcblx0XHRcdHBvcyA9IGk7XG5cdFx0XHRtYXRjaGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIW1hdGNoZWQgJiYgL1swLTldLy50ZXN0KGxpbmVbcG9zXSkpIHtcblx0XHRcdGNvbnN0IG0gPSBsaW5lLnNsaWNlKHBvcykubWF0Y2goL14weFswLTlhLWZBLUZdK3xeWzAtOV0rXFwuP1swLTldKig/OltlRV1bKy1dP1swLTldKyk/Lyk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogcG9zICsgbVswXS5sZW5ndGgsIGtpbmQ6ICdudW1iZXInIH0pO1xuXHRcdFx0XHRwb3MgKz0gbVswXS5sZW5ndGg7XG5cdFx0XHRcdG1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbWF0Y2hlZCAmJiAvW2EtekEtWl8kXS8udGVzdChsaW5lW3Bvc10pKSB7XG5cdFx0XHRjb25zdCBtID0gbGluZS5zbGljZShwb3MpLm1hdGNoKC9eW2EtekEtWl8kXVthLXpBLVowLTlfJF0qLyk7XG5cdFx0XHRpZiAobSkge1xuXHRcdFx0XHRjb25zdCB3b3JkID0gbVswXTtcblx0XHRcdFx0Y29uc3Qga2V5d29yZHMgPSBsYW5nID09PSAncHl0aG9uJyA/IFBZX0tFWVdPUkRTIDogSlNfS0VZV09SRFM7XG5cdFx0XHRcdGNvbnN0IGtpbmQ6IFJlZ2V4VG9rZW5LaW5kID0ga2V5d29yZHMuaGFzKHdvcmQpID8gJ2tleXdvcmQnIDogJ2RlZmF1bHQnO1xuXHRcdFx0XHR0b2tlbnMucHVzaCh7IHN0YXJ0OiBwb3MsIGVuZDogcG9zICsgd29yZC5sZW5ndGgsIGtpbmQgfSk7XG5cdFx0XHRcdHBvcyArPSB3b3JkLmxlbmd0aDtcblx0XHRcdFx0bWF0Y2hlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFtYXRjaGVkKSB7XG5cdFx0XHRjb25zdCBwcmV2VG9rID0gdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChwcmV2VG9rICYmIHByZXZUb2sua2luZCA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHRcdHByZXZUb2suZW5kID0gcG9zICsgMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRva2Vucy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiBwb3MgKyAxLCBraW5kOiAnZGVmYXVsdCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRwb3MrKztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdG9rZW5zLm1hcCh0ID0+IGJ1aWxkU3Bhbih0LmtpbmQsIGxpbmUuc2xpY2UodC5zdGFydCwgdC5lbmQpKSkuam9pbignJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdleFRva2VuaXplTGluZXModGV4dDogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdGlmICghdGV4dCkge1xuXHRcdHJldHVybiBbJyddO1xuXHR9XG5cdGNvbnN0IGxhbmc6IExhbmdGYW1pbHkgPSBMQU5HX0ZBTUlMWVtsYW5ndWFnZUlkXSA/PyAnZ2VuZXJpYyc7XG5cdHJldHVybiB0ZXh0LnNwbGl0KC9cXHI/XFxuLykubWFwKGxpbmUgPT4gcmVnZXhUb2tlbml6ZUxpbmUobGluZSwgbGFuZykpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmTGluZSB7XG5cdHR5cGU6ICdjb250ZXh0JyB8ICdhZGRlZCcgfCAncmVtb3ZlZCc7XG5cdGxpbmVOdW0/OiBudW1iZXI7XG5cdHRleHQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlmZkh1bmsge1xuXHRoZWFkZXI6IHN0cmluZztcblx0bGluZXM6IElEaWZmTGluZVtdO1xufVxuXG5jb25zdCBDT05URVhUX0xJTkVTID0gMztcblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVVbmlmaWVkRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nKTogSURpZmZIdW5rW10ge1xuXHRjb25zdCBvcmlnTGluZXMgPSBvcmlnaW5hbC5zcGxpdCgvXFxyP1xcbi8pO1xuXHRjb25zdCBtb2RMaW5lcyA9IG1vZGlmaWVkLnNwbGl0KC9cXHI/XFxuLyk7XG5cblx0Y29uc3QgcmVzdWx0ID0gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKS5jb21wdXRlRGlmZihvcmlnTGluZXMsIG1vZExpbmVzLCB7XG5cdFx0aWdub3JlVHJpbVdoaXRlc3BhY2U6IGZhbHNlLFxuXHRcdG1heENvbXB1dGF0aW9uVGltZU1zOiAxMDAwLFxuXHRcdGNvbXB1dGVNb3ZlczogZmFsc2UsXG5cdH0pO1xuXG5cdGlmIChyZXN1bHQuY2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHR0eXBlIFN1YiA9IHsgb3JpZ1N0YXJ0OiBudW1iZXI7IG9yaWdFbmQ6IG51bWJlcjsgbW9kU3RhcnQ6IG51bWJlcjsgbW9kRW5kOiBudW1iZXIgfTtcblx0dHlwZSBHcm91cCA9IHsgc3ViczogU3ViW10gfTtcblx0Y29uc3QgZ3JvdXBzOiBHcm91cFtdID0gW107XG5cdGZvciAoY29uc3QgY2hhbmdlIG9mIHJlc3VsdC5jaGFuZ2VzKSB7XG5cdFx0Y29uc3Qgc3ViOiBTdWIgPSB7XG5cdFx0XHRvcmlnU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRvcmlnRW5kOiBjaGFuZ2Uub3JpZ2luYWwuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHRcdG1vZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kRW5kOiBjaGFuZ2UubW9kaWZpZWQuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhc3QgPSBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IGxhc3RTdWIgPSBsYXN0Py5zdWJzW2xhc3Quc3Vicy5sZW5ndGggLSAxXTtcblx0XHRpZiAobGFzdFN1YiAmJiBzdWIub3JpZ1N0YXJ0IC0gbGFzdFN1Yi5vcmlnRW5kIDw9IENPTlRFWFRfTElORVMgKiAyKSB7XG5cdFx0XHRsYXN0IS5zdWJzLnB1c2goc3ViKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Z3JvdXBzLnB1c2goeyBzdWJzOiBbc3ViXSB9KTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCBodW5rczogSURpZmZIdW5rW10gPSBbXTtcblx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRjb25zdCBmaXJzdCA9IGdyb3VwLnN1YnNbMF07XG5cdFx0Y29uc3QgbGFzdCA9IGdyb3VwLnN1YnNbZ3JvdXAuc3Vicy5sZW5ndGggLSAxXTtcblx0XHRjb25zdCBvcmlnTGVhZGluZyA9IE1hdGgubWF4KDEsIGZpcnN0Lm9yaWdTdGFydCAtIENPTlRFWFRfTElORVMpO1xuXHRcdGNvbnN0IG1vZExlYWRpbmcgPSBNYXRoLm1heCgxLCBmaXJzdC5tb2RTdGFydCAtIENPTlRFWFRfTElORVMpO1xuXHRcdGNvbnN0IG9yaWdUcmFpbGluZyA9IE1hdGgubWluKG9yaWdMaW5lcy5sZW5ndGggKyAxLCBsYXN0Lm9yaWdFbmQgKyBDT05URVhUX0xJTkVTKTtcblx0XHRjb25zdCBtb2RUcmFpbGluZyA9IE1hdGgubWluKG1vZExpbmVzLmxlbmd0aCArIDEsIGxhc3QubW9kRW5kICsgQ09OVEVYVF9MSU5FUyk7XG5cblx0XHRjb25zdCBsaW5lczogSURpZmZMaW5lW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSBvcmlnTGVhZGluZzsgaSA8IGZpcnN0Lm9yaWdTdGFydDsgaSsrKSB7XG5cdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ2NvbnRleHQnLCBsaW5lTnVtOiBpLCB0ZXh0OiBvcmlnTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IHMgPSAwOyBzIDwgZ3JvdXAuc3Vicy5sZW5ndGg7IHMrKykge1xuXHRcdFx0Y29uc3Qgc3ViID0gZ3JvdXAuc3Vic1tzXTtcblx0XHRcdGZvciAobGV0IGkgPSBzdWIub3JpZ1N0YXJ0OyBpIDwgc3ViLm9yaWdFbmQ7IGkrKykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ3JlbW92ZWQnLCBsaW5lTnVtOiBpLCB0ZXh0OiBvcmlnTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IHN1Yi5tb2RTdGFydDsgaSA8IHN1Yi5tb2RFbmQ7IGkrKykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKHsgdHlwZTogJ2FkZGVkJywgbGluZU51bTogaSwgdGV4dDogbW9kTGluZXNbaSAtIDFdID8/ICcnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbmV4dCA9IGdyb3VwLnN1YnNbcyArIDFdO1xuXHRcdFx0aWYgKG5leHQpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHN1Yi5vcmlnRW5kOyBpIDwgbmV4dC5vcmlnU3RhcnQ7IGkrKykge1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goeyB0eXBlOiAnY29udGV4dCcsIGxpbmVOdW06IGksIHRleHQ6IG9yaWdMaW5lc1tpIC0gMV0gPz8gJycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gbGFzdC5vcmlnRW5kOyBpIDwgb3JpZ1RyYWlsaW5nOyBpKyspIHtcblx0XHRcdGxpbmVzLnB1c2goeyB0eXBlOiAnY29udGV4dCcsIGxpbmVOdW06IGksIHRleHQ6IG9yaWdMaW5lc1tpIC0gMV0gPz8gJycgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ0NvdW50ID0gb3JpZ1RyYWlsaW5nIC0gb3JpZ0xlYWRpbmc7XG5cdFx0Y29uc3QgbW9kQ291bnQgPSBtb2RUcmFpbGluZyAtIG1vZExlYWRpbmc7XG5cdFx0aHVua3MucHVzaCh7XG5cdFx0XHRoZWFkZXI6IGBAQCAtJHtvcmlnTGVhZGluZ30sJHtvcmlnQ291bnR9ICske21vZExlYWRpbmd9LCR7bW9kQ291bnR9IEBAYCxcblx0XHRcdGxpbmVzLFxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIGh1bmtzO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx3QkFBd0I7QUFlakMsTUFBTSx5QkFBaUQ7QUFBQSxFQUN0RCxPQUFPO0FBQUEsRUFBYyxRQUFRO0FBQUEsRUFBYyxRQUFRO0FBQUEsRUFDbkQsUUFBUTtBQUFBLEVBQ1IsT0FBTztBQUFBLEVBQWMsUUFBUTtBQUFBLEVBQWMsUUFBUTtBQUFBLEVBQ25ELFFBQVE7QUFBQSxFQUNSLE9BQU87QUFBQSxFQUFVLFFBQVE7QUFBQSxFQUN6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
