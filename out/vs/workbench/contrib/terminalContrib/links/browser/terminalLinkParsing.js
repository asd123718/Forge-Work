import { Lazy } from "../../../../../base/common/lazy.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
const linkSuffixRegexEol = new Lazy(() => generateLinkSuffixRegex(true));
const linkSuffixRegex = new Lazy(() => generateLinkSuffixRegex(false));
function generateLinkSuffixRegex(eolOnly) {
  let ri = 0;
  let ci = 0;
  let rei = 0;
  let cei = 0;
  function r() {
    return `(?<row${ri++}>\\d+)`;
  }
  function c() {
    return `(?<col${ci++}>\\d+)`;
  }
  function re() {
    return `(?<rowEnd${rei++}>\\d+)`;
  }
  function ce() {
    return `(?<colEnd${cei++}>\\d+)`;
  }
  const eolSuffix = eolOnly ? "$" : "";
  const lineAndColumnRegexClauses = [
    // foo:339
    // foo:339:12
    // foo:339:12-789
    // foo:339:12-341.789
    // foo:339.12
    // foo 339
    // foo 339:12                              [#140780]
    // foo 339.12
    // foo#339
    // foo#339:12                              [#190288]
    // foo#339.12
    // foo, 339                                [#217927]
    // "foo",339
    // "foo",339:12
    // "foo",339.12
    // "foo",339.12-789
    // "foo",339.12-341.789
    `(?::|#| |['"],|, )${r()}([:.]${c()}(?:-(?:${re()}\\.)?${ce()})?)?` + eolSuffix,
    // The quotes below are optional           [#171652]
    // "foo", line 339                         [#40468]
    // "foo", line 339, col 12
    // "foo", line 339, column 12
    // "foo":line 339
    // "foo":line 339, col 12
    // "foo":line 339, column 12
    // "foo": line 339
    // "foo": line 339, col 12
    // "foo": line 339, column 12
    // "foo" on line 339
    // "foo" on line 339, col 12
    // "foo" on line 339, column 12
    // "foo" line 339 column 12
    // "foo", line 339, character 12           [#171880]
    // "foo", line 339, characters 12-789      [#171880]
    // "foo", lines 339-341                    [#171880]
    // "foo", lines 339-341, characters 12-789 [#178287]
    `['"]?(?:,? |: ?| on )lines? ${r()}(?:-${re()})?(?:,? (?:col(?:umn)?|characters?) ${c()}(?:-${ce()})?)?` + eolSuffix,
    // () and [] are interchangeable
    // foo(339)
    // foo(339,12)
    // foo(339, 12)
    // foo (339)
    // foo (339,12)
    // foo (339, 12)
    // foo: (339)
    // foo: (339,12)
    // foo: (339, 12)
    // foo(339:12)                             [#229842]
    // foo (339:12)                            [#229842]
    `:? ?[\\[\\(]${r()}(?:(?:, ?|:)${c()})?[\\]\\)]` + eolSuffix
  ];
  const suffixClause = lineAndColumnRegexClauses.join("|").replace(/ /g, `[${"\xA0"} ]`);
  return new RegExp(`(${suffixClause})`, eolOnly ? void 0 : "g");
}
function removeLinkSuffix(link) {
  const suffix = getLinkSuffix(link)?.suffix;
  if (!suffix) {
    return link;
  }
  return link.substring(0, suffix.index);
}
function removeLinkQueryString(link) {
  const start = link.startsWith("\\\\?\\") ? 4 : 0;
  const index = link.indexOf("?", start);
  if (index === -1) {
    return link;
  }
  return link.substring(0, index);
}
function detectLinkSuffixes(line) {
  let match;
  const results = [];
  linkSuffixRegex.value.lastIndex = 0;
  while ((match = linkSuffixRegex.value.exec(line)) !== null) {
    const suffix = toLinkSuffix(match);
    if (suffix === null) {
      break;
    }
    results.push(suffix);
  }
  return results;
}
function getLinkSuffix(link) {
  return toLinkSuffix(linkSuffixRegexEol.value.exec(link));
}
function toLinkSuffix(match) {
  const groups = match?.groups;
  if (!groups || match.length < 1) {
    return null;
  }
  return {
    row: parseIntOptional(groups.row0 || groups.row1 || groups.row2),
    col: parseIntOptional(groups.col0 || groups.col1 || groups.col2),
    rowEnd: parseIntOptional(groups.rowEnd0 || groups.rowEnd1 || groups.rowEnd2),
    colEnd: parseIntOptional(groups.colEnd0 || groups.colEnd1 || groups.colEnd2),
    suffix: { index: match.index, text: match[0] }
  };
}
function parseIntOptional(value) {
  if (value === void 0) {
    return value;
  }
  return parseInt(value);
}
const linkWithSuffixPathCharacters = /(?<path>(?:file:\/\/\/)?[^\s\|<>\[\({][^\s\|<>]*)$/;
function detectLinks(line, os) {
  const results = detectLinksViaSuffix(line);
  const noSuffixPaths = detectPathsNoSuffix(line, os);
  binaryInsertList(results, noSuffixPaths);
  return results;
}
function binaryInsertList(list, newItems) {
  if (list.length === 0) {
    list.push(...newItems);
  }
  for (const item of newItems) {
    binaryInsert(list, item, 0, list.length);
  }
}
function binaryInsert(list, newItem, low, high) {
  if (list.length === 0) {
    list.push(newItem);
    return;
  }
  if (low > high) {
    return;
  }
  const mid = Math.floor((low + high) / 2);
  if (mid >= list.length || newItem.path.index < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index)) {
    if (mid >= list.length || newItem.path.index + newItem.path.text.length < list[mid].path.index && (mid === 0 || newItem.path.index > list[mid - 1].path.index + list[mid - 1].path.text.length)) {
      list.splice(mid, 0, newItem);
    }
    return;
  }
  if (newItem.path.index > list[mid].path.index) {
    binaryInsert(list, newItem, mid + 1, high);
  } else {
    binaryInsert(list, newItem, low, mid - 1);
  }
}
function detectLinksViaSuffix(line) {
  const results = [];
  const suffixes = detectLinkSuffixes(line);
  for (const suffix of suffixes) {
    const suffixEndIndex = suffix.suffix.index + suffix.suffix.text.length;
    if (line[suffixEndIndex] === "/") {
      continue;
    }
    const beforeSuffix = line.substring(0, suffix.suffix.index);
    const possiblePathMatch = beforeSuffix.match(linkWithSuffixPathCharacters);
    if (possiblePathMatch && possiblePathMatch.index !== void 0 && possiblePathMatch.groups?.path) {
      let linkStartIndex = possiblePathMatch.index;
      let path = possiblePathMatch.groups.path;
      let prefix = void 0;
      const prefixMatch = path.match(/^(?<prefix>['"]+)/);
      if (prefixMatch?.groups?.prefix) {
        prefix = {
          index: linkStartIndex,
          text: prefixMatch.groups.prefix
        };
        path = path.substring(prefix.text.length);
        if (path.trim().length === 0) {
          continue;
        }
        if (prefixMatch.groups.prefix.length > 1) {
          if (suffix.suffix.text[0].match(/['"]/) && prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1] === suffix.suffix.text[0]) {
            const trimPrefixAmount = prefixMatch.groups.prefix.length - 1;
            prefix.index += trimPrefixAmount;
            prefix.text = prefixMatch.groups.prefix[prefixMatch.groups.prefix.length - 1];
            linkStartIndex += trimPrefixAmount;
          }
        }
      }
      results.push({
        path: {
          index: linkStartIndex + (prefix?.text.length || 0),
          text: path
        },
        prefix,
        suffix
      });
      const openingBracketMatch = path.matchAll(/(?<bracket>[\[\(])(?![\]\)])/g);
      for (const match of openingBracketMatch) {
        const bracket = match.groups?.bracket;
        if (bracket) {
          results.push({
            path: {
              index: linkStartIndex + (prefix?.text.length || 0) + match.index + 1,
              text: path.substring(match.index + bracket.length)
            },
            prefix,
            suffix
          });
        }
      }
    }
  }
  return results;
}
var RegexPathConstants = /* @__PURE__ */ ((RegexPathConstants2) => {
  RegexPathConstants2["PathPrefix"] = "(?:\\.\\.?|\\~|file://)";
  RegexPathConstants2["PathSeparatorClause"] = "\\/";
  RegexPathConstants2["ExcludedPathCharactersClause"] = "[^\\0<>\\?\\s!`&*()'\":;\\\\]";
  RegexPathConstants2["ExcludedStartPathCharactersClause"] = "[^\\0<>\\?\\s!`&*()\\[\\]'\":;\\\\]";
  RegexPathConstants2["WinOtherPathPrefix"] = "\\.\\.?|\\~";
  RegexPathConstants2["WinPathSeparatorClause"] = "(?:\\\\|\\/)";
  RegexPathConstants2["WinExcludedPathCharactersClause"] = "[^\\0<>\\?\\|\\/\\s!`&*()'\":;]";
  RegexPathConstants2["WinExcludedStartPathCharactersClause"] = "[^\\0<>\\?\\|\\/\\s!`&*()\\[\\]'\":;]";
  return RegexPathConstants2;
})(RegexPathConstants || {});
const unixLocalLinkClause = "(?:(?:(?:\\.\\.?|\\~|file://)|(?:[^\\0<>\\?\\s!`&*()\\[\\]'\":;\\\\][^\\0<>\\?\\s!`&*()'\":;\\\\]*))?(?:\\/(?:[^\\0<>\\?\\s!`&*()'\":;\\\\])+)+)";
const winDrivePrefix = "(?:\\\\\\\\\\?\\\\|file:\\/\\/\\/)?[a-zA-Z]:";
const winLocalLinkClause = `(?:(?:(?:${winDrivePrefix}|${"\\.\\.?|\\~" /* WinOtherPathPrefix */})|(?:[^\\0<>\\?\\|\\/\\s!\`&*()\\[\\]'":;][^\\0<>\\?\\|\\/\\s!\`&*()'":;]*))?(?:(?:\\\\|\\/)(?:[^\\0<>\\?\\|\\/\\s!\`&*()'":;])+)+)`;
const diffFilePrefix = "[abciow12]\\/";
const gitDiffLineRegex = new Lazy(() => new RegExp(`^[-+]{3} ${diffFilePrefix}`));
const gitDiffTextRegex = new Lazy(() => new RegExp(`^${diffFilePrefix}`));
function detectPathsNoSuffix(line, os) {
  const results = [];
  const regex = new RegExp(os === OperatingSystem.Windows ? winLocalLinkClause : unixLocalLinkClause, "g");
  let match;
  while ((match = regex.exec(line)) !== null) {
    let text = match[0];
    let index = match.index;
    if (!text) {
      break;
    }
    if (
      // --- a/foo/bar
      // +++ b/foo/bar
      gitDiffLineRegex.value.test(line) && index === 4 || // diff --git a/foo/bar b/foo/bar
      line.startsWith("diff --git") && gitDiffTextRegex.value.test(text)
    ) {
      text = text.substring(2);
      index += 2;
    }
    results.push({
      path: {
        index,
        text
      },
      prefix: void 0,
      suffix: void 0
    });
  }
  return results;
}
export {
  detectLinkSuffixes,
  detectLinks,
  getLinkSuffix,
  removeLinkQueryString,
  removeLinkSuffix,
  toLinkSuffix,
  winDrivePrefix
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTGlua1BhcnNpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFRoaXMgbW9kdWxlIGlzIHJlc3BvbnNpYmxlIGZvciBwYXJzaW5nIHBvc3NpYmxlIGxpbmtzIG91dCBvZiBsaW5lcyB3aXRoIG9ubHkgYWNjZXNzIHRvIHRoZSBsaW5lXG4gKiB0ZXh0IGFuZCB0aGUgdGFyZ2V0IG9wZXJhdGluZyBzeXN0ZW0sIGllLiBpdCBkb2VzIG5vdCBkbyBhbnkgdmFsaWRhdGlvbiB0aGF0IHBhdGhzIGFjdHVhbGx5XG4gKiBleGlzdC5cbiAqL1xuXG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZExpbmsge1xuXHRwYXRoOiBJTGlua1BhcnRpYWxSYW5nZTtcblx0cHJlZml4PzogSUxpbmtQYXJ0aWFsUmFuZ2U7XG5cdHN1ZmZpeD86IElMaW5rU3VmZml4O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5rU3VmZml4IHtcblx0cm93OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRyb3dFbmQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29sRW5kOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHN1ZmZpeDogSUxpbmtQYXJ0aWFsUmFuZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpbmtQYXJ0aWFsUmFuZ2Uge1xuXHRpbmRleDogbnVtYmVyO1xuXHR0ZXh0OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSByZWdleCB0aGF0IGV4dHJhY3RzIHRoZSBsaW5rIHN1ZmZpeCB3aGljaCBjb250YWlucyBsaW5lIGFuZCBjb2x1bW4gaW5mb3JtYXRpb24uIFRoZSBsaW5rIHN1ZmZpeFxuICogbXVzdCB0ZXJtaW5hdGUgYXQgdGhlIGVuZCBvZiBsaW5lLlxuICovXG5jb25zdCBsaW5rU3VmZml4UmVnZXhFb2wgPSBuZXcgTGF6eTxSZWdFeHA+KCgpID0+IGdlbmVyYXRlTGlua1N1ZmZpeFJlZ2V4KHRydWUpKTtcbi8qKlxuICogQSByZWdleCB0aGF0IGV4dHJhY3RzIHRoZSBsaW5rIHN1ZmZpeCB3aGljaCBjb250YWlucyBsaW5lIGFuZCBjb2x1bW4gaW5mb3JtYXRpb24uXG4gKi9cbmNvbnN0IGxpbmtTdWZmaXhSZWdleCA9IG5ldyBMYXp5PFJlZ0V4cD4oKCkgPT4gZ2VuZXJhdGVMaW5rU3VmZml4UmVnZXgoZmFsc2UpKTtcblxuZnVuY3Rpb24gZ2VuZXJhdGVMaW5rU3VmZml4UmVnZXgoZW9sT25seTogYm9vbGVhbikge1xuXHRsZXQgcmkgPSAwO1xuXHRsZXQgY2kgPSAwO1xuXHRsZXQgcmVpID0gMDtcblx0bGV0IGNlaSA9IDA7XG5cdGZ1bmN0aW9uIHIoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCg/PHJvdyR7cmkrK30+XFxcXGQrKWA7XG5cdH1cblx0ZnVuY3Rpb24gYygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKD88Y29sJHtjaSsrfT5cXFxcZCspYDtcblx0fVxuXHRmdW5jdGlvbiByZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgKD88cm93RW5kJHtyZWkrK30+XFxcXGQrKWA7XG5cdH1cblx0ZnVuY3Rpb24gY2UoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCg/PGNvbEVuZCR7Y2VpKyt9PlxcXFxkKylgO1xuXHR9XG5cblx0Y29uc3QgZW9sU3VmZml4ID0gZW9sT25seSA/ICckJyA6ICcnO1xuXG5cdC8vIFRoZSBjb21tZW50cyBpbiB0aGUgcmVnZXggYmVsb3cgdXNlIHJlYWwgc3RyaW5ncy9udW1iZXJzIGZvciBiZXR0ZXIgcmVhZGFiaWxpdHksIGhlcmUnc1xuXHQvLyB0aGUgbGVnZW5kOlxuXHQvLyAtIFBhdGggICAgPSBmb29cblx0Ly8gLSBSb3cgICAgID0gMzM5XG5cdC8vIC0gQ29sICAgICA9IDEyXG5cdC8vIC0gUm93RW5kICA9IDM0MVxuXHQvLyAtIENvbEVuZCAgPSA3ODlcblx0Ly9cblx0Ly8gVGhlc2UgYWxsIHN1cHBvcnQgc2luZ2xlIHF1b3RlICcgaW4gdGhlIHBsYWNlIG9mIFwiIGFuZCBbXSBpbiB0aGUgcGxhY2Ugb2YgKClcblx0Ly9cblx0Ly8gU2VlIHRoZSB0ZXN0cyBmb3IgYW4gZXhoYXVzdGl2ZSBsaXN0IG9mIGFsbCBzdXBwb3J0ZWQgZm9ybWF0c1xuXHRjb25zdCBsaW5lQW5kQ29sdW1uUmVnZXhDbGF1c2VzID0gW1xuXHRcdC8vIGZvbzozMzlcblx0XHQvLyBmb286MzM5OjEyXG5cdFx0Ly8gZm9vOjMzOToxMi03ODlcblx0XHQvLyBmb286MzM5OjEyLTM0MS43ODlcblx0XHQvLyBmb286MzM5LjEyXG5cdFx0Ly8gZm9vIDMzOVxuXHRcdC8vIGZvbyAzMzk6MTIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbIzE0MDc4MF1cblx0XHQvLyBmb28gMzM5LjEyXG5cdFx0Ly8gZm9vIzMzOVxuXHRcdC8vIGZvbyMzMzk6MTIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbIzE5MDI4OF1cblx0XHQvLyBmb28jMzM5LjEyXG5cdFx0Ly8gZm9vLCAzMzkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsjMjE3OTI3XVxuXHRcdC8vIFwiZm9vXCIsMzM5XG5cdFx0Ly8gXCJmb29cIiwzMzk6MTJcblx0XHQvLyBcImZvb1wiLDMzOS4xMlxuXHRcdC8vIFwiZm9vXCIsMzM5LjEyLTc4OVxuXHRcdC8vIFwiZm9vXCIsMzM5LjEyLTM0MS43ODlcblx0XHRgKD86OnwjfCB8WydcIl0sfCwgKSR7cigpfShbOi5dJHtjKCl9KD86LSg/OiR7cmUoKX1cXFxcLik/JHtjZSgpfSk/KT9gICsgZW9sU3VmZml4LFxuXHRcdC8vIFRoZSBxdW90ZXMgYmVsb3cgYXJlIG9wdGlvbmFsICAgICAgICAgICBbIzE3MTY1Ml1cblx0XHQvLyBcImZvb1wiLCBsaW5lIDMzOSAgICAgICAgICAgICAgICAgICAgICAgICBbIzQwNDY4XVxuXHRcdC8vIFwiZm9vXCIsIGxpbmUgMzM5LCBjb2wgMTJcblx0XHQvLyBcImZvb1wiLCBsaW5lIDMzOSwgY29sdW1uIDEyXG5cdFx0Ly8gXCJmb29cIjpsaW5lIDMzOVxuXHRcdC8vIFwiZm9vXCI6bGluZSAzMzksIGNvbCAxMlxuXHRcdC8vIFwiZm9vXCI6bGluZSAzMzksIGNvbHVtbiAxMlxuXHRcdC8vIFwiZm9vXCI6IGxpbmUgMzM5XG5cdFx0Ly8gXCJmb29cIjogbGluZSAzMzksIGNvbCAxMlxuXHRcdC8vIFwiZm9vXCI6IGxpbmUgMzM5LCBjb2x1bW4gMTJcblx0XHQvLyBcImZvb1wiIG9uIGxpbmUgMzM5XG5cdFx0Ly8gXCJmb29cIiBvbiBsaW5lIDMzOSwgY29sIDEyXG5cdFx0Ly8gXCJmb29cIiBvbiBsaW5lIDMzOSwgY29sdW1uIDEyXG5cdFx0Ly8gXCJmb29cIiBsaW5lIDMzOSBjb2x1bW4gMTJcblx0XHQvLyBcImZvb1wiLCBsaW5lIDMzOSwgY2hhcmFjdGVyIDEyICAgICAgICAgICBbIzE3MTg4MF1cblx0XHQvLyBcImZvb1wiLCBsaW5lIDMzOSwgY2hhcmFjdGVycyAxMi03ODkgICAgICBbIzE3MTg4MF1cblx0XHQvLyBcImZvb1wiLCBsaW5lcyAzMzktMzQxICAgICAgICAgICAgICAgICAgICBbIzE3MTg4MF1cblx0XHQvLyBcImZvb1wiLCBsaW5lcyAzMzktMzQxLCBjaGFyYWN0ZXJzIDEyLTc4OSBbIzE3ODI4N11cblx0XHRgWydcIl0/KD86LD8gfDogP3wgb24gKWxpbmVzPyAke3IoKX0oPzotJHtyZSgpfSk/KD86LD8gKD86Y29sKD86dW1uKT98Y2hhcmFjdGVycz8pICR7YygpfSg/Oi0ke2NlKCl9KT8pP2AgKyBlb2xTdWZmaXgsXG5cdFx0Ly8gKCkgYW5kIFtdIGFyZSBpbnRlcmNoYW5nZWFibGVcblx0XHQvLyBmb28oMzM5KVxuXHRcdC8vIGZvbygzMzksMTIpXG5cdFx0Ly8gZm9vKDMzOSwgMTIpXG5cdFx0Ly8gZm9vICgzMzkpXG5cdFx0Ly8gZm9vICgzMzksMTIpXG5cdFx0Ly8gZm9vICgzMzksIDEyKVxuXHRcdC8vIGZvbzogKDMzOSlcblx0XHQvLyBmb286ICgzMzksMTIpXG5cdFx0Ly8gZm9vOiAoMzM5LCAxMilcblx0XHQvLyBmb28oMzM5OjEyKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWyMyMjk4NDJdXG5cdFx0Ly8gZm9vICgzMzk6MTIpICAgICAgICAgICAgICAgICAgICAgICAgICAgIFsjMjI5ODQyXVxuXHRcdGA6PyA/W1xcXFxbXFxcXChdJHtyKCl9KD86KD86LCA/fDopJHtjKCl9KT9bXFxcXF1cXFxcKV1gICsgZW9sU3VmZml4LFxuXHRdO1xuXG5cdGNvbnN0IHN1ZmZpeENsYXVzZSA9IGxpbmVBbmRDb2x1bW5SZWdleENsYXVzZXNcblx0XHQvLyBKb2luIGFsbCBjbGF1c2VzIHRvZ2V0aGVyXG5cdFx0LmpvaW4oJ3wnKVxuXHRcdC8vIENvbnZlcnQgc3BhY2VzIHRvIGFsbG93IHRoZSBub24tYnJlYWtpbmcgc3BhY2UgY2hhciAoYXNjaWkgMTYwKVxuXHRcdC5yZXBsYWNlKC8gL2csIGBbJHsnXFx1MDBBMCd9IF1gKTtcblxuXHRyZXR1cm4gbmV3IFJlZ0V4cChgKCR7c3VmZml4Q2xhdXNlfSlgLCBlb2xPbmx5ID8gdW5kZWZpbmVkIDogJ2cnKTtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIHRoZSBvcHRpb25hbCBsaW5rIHN1ZmZpeCB3aGljaCBjb250YWlucyBsaW5lIGFuZCBjb2x1bW4gaW5mb3JtYXRpb24uXG4gKiBAcGFyYW0gbGluayBUaGUgbGluayB0byB1c2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVMaW5rU3VmZml4KGxpbms6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHN1ZmZpeCA9IGdldExpbmtTdWZmaXgobGluayk/LnN1ZmZpeDtcblx0aWYgKCFzdWZmaXgpIHtcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXHRyZXR1cm4gbGluay5zdWJzdHJpbmcoMCwgc3VmZml4LmluZGV4KTtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIGFueSBxdWVyeSBzdHJpbmcgZnJvbSB0aGUgbGluay5cbiAqIEBwYXJhbSBsaW5rIFRoZSBsaW5rIHRvIHVzZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUxpbmtRdWVyeVN0cmluZyhsaW5rOiBzdHJpbmcpOiBzdHJpbmcge1xuXHQvLyBTa2lwID8gaW4gVU5DIHBhdGhzXG5cdGNvbnN0IHN0YXJ0ID0gbGluay5zdGFydHNXaXRoKCdcXFxcXFxcXD9cXFxcJykgPyA0IDogMDtcblx0Y29uc3QgaW5kZXggPSBsaW5rLmluZGV4T2YoJz8nLCBzdGFydCk7XG5cdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRyZXR1cm4gbGluaztcblx0fVxuXHRyZXR1cm4gbGluay5zdWJzdHJpbmcoMCwgaW5kZXgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGV0ZWN0TGlua1N1ZmZpeGVzKGxpbmU6IHN0cmluZyk6IElMaW5rU3VmZml4W10ge1xuXHQvLyBGaW5kIGFsbCBzdWZmaXhlcyBvbiB0aGUgbGluZS4gU2luY2UgdGhlIHJlZ2V4IGdsb2JhbCBmbGFnIGlzIHVzZWQsIGxhc3RJbmRleCB3aWxsIGJlIHVwZGF0ZWRcblx0Ly8gaW4gcGxhY2Ugc3VjaCB0aGF0IHRoZXJlIGFyZSBubyBvdmVybGFwcGluZyBtYXRjaGVzLlxuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdGNvbnN0IHJlc3VsdHM6IElMaW5rU3VmZml4W10gPSBbXTtcblx0bGlua1N1ZmZpeFJlZ2V4LnZhbHVlLmxhc3RJbmRleCA9IDA7XG5cdHdoaWxlICgobWF0Y2ggPSBsaW5rU3VmZml4UmVnZXgudmFsdWUuZXhlYyhsaW5lKSkgIT09IG51bGwpIHtcblx0XHRjb25zdCBzdWZmaXggPSB0b0xpbmtTdWZmaXgobWF0Y2gpO1xuXHRcdGlmIChzdWZmaXggPT09IG51bGwpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRyZXN1bHRzLnB1c2goc3VmZml4KTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0cztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBvcHRpb25hbCBsaW5rIHN1ZmZpeCB3aGljaCBjb250YWlucyBsaW5lIGFuZCBjb2x1bW4gaW5mb3JtYXRpb24uXG4gKiBAcGFyYW0gbGluayBUaGUgbGluayB0byBwYXJzZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldExpbmtTdWZmaXgobGluazogc3RyaW5nKTogSUxpbmtTdWZmaXggfCBudWxsIHtcblx0cmV0dXJuIHRvTGlua1N1ZmZpeChsaW5rU3VmZml4UmVnZXhFb2wudmFsdWUuZXhlYyhsaW5rKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0xpbmtTdWZmaXgobWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwpOiBJTGlua1N1ZmZpeCB8IG51bGwge1xuXHRjb25zdCBncm91cHMgPSBtYXRjaD8uZ3JvdXBzO1xuXHRpZiAoIWdyb3VwcyB8fCBtYXRjaC5sZW5ndGggPCAxKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRyb3c6IHBhcnNlSW50T3B0aW9uYWwoZ3JvdXBzLnJvdzAgfHwgZ3JvdXBzLnJvdzEgfHwgZ3JvdXBzLnJvdzIpLFxuXHRcdGNvbDogcGFyc2VJbnRPcHRpb25hbChncm91cHMuY29sMCB8fCBncm91cHMuY29sMSB8fCBncm91cHMuY29sMiksXG5cdFx0cm93RW5kOiBwYXJzZUludE9wdGlvbmFsKGdyb3Vwcy5yb3dFbmQwIHx8IGdyb3Vwcy5yb3dFbmQxIHx8IGdyb3Vwcy5yb3dFbmQyKSxcblx0XHRjb2xFbmQ6IHBhcnNlSW50T3B0aW9uYWwoZ3JvdXBzLmNvbEVuZDAgfHwgZ3JvdXBzLmNvbEVuZDEgfHwgZ3JvdXBzLmNvbEVuZDIpLFxuXHRcdHN1ZmZpeDogeyBpbmRleDogbWF0Y2guaW5kZXgsIHRleHQ6IG1hdGNoWzBdIH1cblx0fTtcbn1cblxuZnVuY3Rpb24gcGFyc2VJbnRPcHRpb25hbCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0cmV0dXJuIHBhcnNlSW50KHZhbHVlKTtcbn1cblxuLy8gVGhpcyBkZWZpbmVzIHZhbGlkIHBhdGggY2hhcmFjdGVycyBmb3IgYSBsaW5rIHdpdGggYSBzdWZmaXgsIHRoZSBmaXJzdCBgW11gIG9mIHRoZSByZWdleCBpbmNsdWRlc1xuLy8gY2hhcmFjdGVycyB0aGUgcGF0aCBpcyBub3QgYWxsb3dlZCB0byBfc3RhcnRfIHdpdGgsIHRoZSBzZWNvbmQgYFtdYCBpbmNsdWRlcyBjaGFyYWN0ZXJzIG5vdFxuLy8gYWxsb3dlZCBhdCBhbGwgaW4gdGhlIHBhdGguIElmIHRoZSBjaGFyYWN0ZXJzIHNob3cgdXAgaW4gYm90aCByZWdleGVzIHRoZSBsaW5rIHdpbGwgc3RvcCBhdCB0aGF0XG4vLyBjaGFyYWN0ZXIsIG90aGVyd2lzZSBpdCB3aWxsIHN0b3AgYXQgYSBzcGFjZSBjaGFyYWN0ZXIuXG5jb25zdCBsaW5rV2l0aFN1ZmZpeFBhdGhDaGFyYWN0ZXJzID0gLyg/PHBhdGg+KD86ZmlsZTpcXC9cXC9cXC8pP1teXFxzXFx8PD5cXFtcXCh7XVteXFxzXFx8PD5dKikkLztcblxuZXhwb3J0IGZ1bmN0aW9uIGRldGVjdExpbmtzKGxpbmU6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSkge1xuXHQvLyAxOiBEZXRlY3QgYWxsIGxpbmtzIG9uIGxpbmUgdmlhIHN1ZmZpeGVzIGZpcnN0XG5cdGNvbnN0IHJlc3VsdHMgPSBkZXRlY3RMaW5rc1ZpYVN1ZmZpeChsaW5lKTtcblxuXHQvLyAyOiBEZXRlY3QgYWxsIGxpbmtzIHdpdGhvdXQgc3VmZml4ZXMgYW5kIG1lcmdlIG5vbi1jb25mbGljdGluZyByYW5nZXMgaW50byB0aGUgcmVzdWx0c1xuXHRjb25zdCBub1N1ZmZpeFBhdGhzID0gZGV0ZWN0UGF0aHNOb1N1ZmZpeChsaW5lLCBvcyk7XG5cdGJpbmFyeUluc2VydExpc3QocmVzdWx0cywgbm9TdWZmaXhQYXRocyk7XG5cblx0cmV0dXJuIHJlc3VsdHM7XG59XG5cbmZ1bmN0aW9uIGJpbmFyeUluc2VydExpc3QobGlzdDogSVBhcnNlZExpbmtbXSwgbmV3SXRlbXM6IElQYXJzZWRMaW5rW10pIHtcblx0aWYgKGxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0bGlzdC5wdXNoKC4uLm5ld0l0ZW1zKTtcblx0fVxuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgbmV3SXRlbXMpIHtcblx0XHRiaW5hcnlJbnNlcnQobGlzdCwgaXRlbSwgMCwgbGlzdC5sZW5ndGgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGJpbmFyeUluc2VydChsaXN0OiBJUGFyc2VkTGlua1tdLCBuZXdJdGVtOiBJUGFyc2VkTGluaywgbG93OiBudW1iZXIsIGhpZ2g6IG51bWJlcikge1xuXHRpZiAobGlzdC5sZW5ndGggPT09IDApIHtcblx0XHRsaXN0LnB1c2gobmV3SXRlbSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGlmIChsb3cgPiBoaWdoKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdC8vIEZpbmQgdGhlIGluZGV4IHdoZXJlIHRoZSBuZXdJdGVtIHdvdWxkIGJlIGluc2VydGVkXG5cdGNvbnN0IG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG5cdGlmIChcblx0XHRtaWQgPj0gbGlzdC5sZW5ndGggfHxcblx0XHQobmV3SXRlbS5wYXRoLmluZGV4IDwgbGlzdFttaWRdLnBhdGguaW5kZXggJiYgKG1pZCA9PT0gMCB8fCBuZXdJdGVtLnBhdGguaW5kZXggPiBsaXN0W21pZCAtIDFdLnBhdGguaW5kZXgpKVxuXHQpIHtcblx0XHQvLyBDaGVjayBpZiBpdCBjb25mbGljdHMgd2l0aCBhbiBleGlzdGluZyBsaW5rIGJlZm9yZSBhZGRpbmdcblx0XHRpZiAoXG5cdFx0XHRtaWQgPj0gbGlzdC5sZW5ndGggfHxcblx0XHRcdChuZXdJdGVtLnBhdGguaW5kZXggKyBuZXdJdGVtLnBhdGgudGV4dC5sZW5ndGggPCBsaXN0W21pZF0ucGF0aC5pbmRleCAmJiAobWlkID09PSAwIHx8IG5ld0l0ZW0ucGF0aC5pbmRleCA+IGxpc3RbbWlkIC0gMV0ucGF0aC5pbmRleCArIGxpc3RbbWlkIC0gMV0ucGF0aC50ZXh0Lmxlbmd0aCkpXG5cdFx0KSB7XG5cdFx0XHRsaXN0LnNwbGljZShtaWQsIDAsIG5ld0l0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKG5ld0l0ZW0ucGF0aC5pbmRleCA+IGxpc3RbbWlkXS5wYXRoLmluZGV4KSB7XG5cdFx0YmluYXJ5SW5zZXJ0KGxpc3QsIG5ld0l0ZW0sIG1pZCArIDEsIGhpZ2gpO1xuXHR9IGVsc2Uge1xuXHRcdGJpbmFyeUluc2VydChsaXN0LCBuZXdJdGVtLCBsb3csIG1pZCAtIDEpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGRldGVjdExpbmtzVmlhU3VmZml4KGxpbmU6IHN0cmluZyk6IElQYXJzZWRMaW5rW10ge1xuXHRjb25zdCByZXN1bHRzOiBJUGFyc2VkTGlua1tdID0gW107XG5cblx0Ly8gMTogRGV0ZWN0IGxpbmsgc3VmZml4ZXMgb24gdGhlIGxpbmVcblx0Y29uc3Qgc3VmZml4ZXMgPSBkZXRlY3RMaW5rU3VmZml4ZXMobGluZSk7XG5cdGZvciAoY29uc3Qgc3VmZml4IG9mIHN1ZmZpeGVzKSB7XG5cdFx0Ly8gSWdub3JlIHN1ZmZpeGVzIGZvbGxvd2VkIGJ5IGAvYCBzbyBudW1lcmljIEdpdCBkaWZmIHByZWZpeGVzIHN1Y2ggYXMgYDEvYCBhcmUgcGFyc2VkIGFzIHBhdGhzLlxuXHRcdGNvbnN0IHN1ZmZpeEVuZEluZGV4ID0gc3VmZml4LnN1ZmZpeC5pbmRleCArIHN1ZmZpeC5zdWZmaXgudGV4dC5sZW5ndGg7XG5cdFx0aWYgKGxpbmVbc3VmZml4RW5kSW5kZXhdID09PSAnLycpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBiZWZvcmVTdWZmaXggPSBsaW5lLnN1YnN0cmluZygwLCBzdWZmaXguc3VmZml4LmluZGV4KTtcblx0XHRjb25zdCBwb3NzaWJsZVBhdGhNYXRjaCA9IGJlZm9yZVN1ZmZpeC5tYXRjaChsaW5rV2l0aFN1ZmZpeFBhdGhDaGFyYWN0ZXJzKTtcblx0XHRpZiAocG9zc2libGVQYXRoTWF0Y2ggJiYgcG9zc2libGVQYXRoTWF0Y2guaW5kZXggIT09IHVuZGVmaW5lZCAmJiBwb3NzaWJsZVBhdGhNYXRjaC5ncm91cHM/LnBhdGgpIHtcblx0XHRcdGxldCBsaW5rU3RhcnRJbmRleCA9IHBvc3NpYmxlUGF0aE1hdGNoLmluZGV4O1xuXHRcdFx0bGV0IHBhdGggPSBwb3NzaWJsZVBhdGhNYXRjaC5ncm91cHMucGF0aDtcblx0XHRcdC8vIEV4dHJhY3QgYSBwYXRoIHByZWZpeCBpZiBpdCBleGlzdHMgKG5vdCBwYXJ0IG9mIHRoZSBwYXRoLCBidXQgcGFydCBvZiB0aGUgdW5kZXJsaW5lZFxuXHRcdFx0Ly8gc2VjdGlvbilcblx0XHRcdGxldCBwcmVmaXg6IElMaW5rUGFydGlhbFJhbmdlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJlZml4TWF0Y2ggPSBwYXRoLm1hdGNoKC9eKD88cHJlZml4PlsnXCJdKykvKTtcblx0XHRcdGlmIChwcmVmaXhNYXRjaD8uZ3JvdXBzPy5wcmVmaXgpIHtcblx0XHRcdFx0cHJlZml4ID0ge1xuXHRcdFx0XHRcdGluZGV4OiBsaW5rU3RhcnRJbmRleCxcblx0XHRcdFx0XHR0ZXh0OiBwcmVmaXhNYXRjaC5ncm91cHMucHJlZml4XG5cdFx0XHRcdH07XG5cdFx0XHRcdHBhdGggPSBwYXRoLnN1YnN0cmluZyhwcmVmaXgudGV4dC5sZW5ndGgpO1xuXG5cdFx0XHRcdC8vIERvbid0IGFsbG93IHN1ZmZpeCBsaW5rcyB0byBiZSByZXR1cm5lZCB3aGVuIHRoZSBsaW5rIGl0c2VsZiBpcyB0aGUgZW1wdHkgc3RyaW5nXG5cdFx0XHRcdGlmIChwYXRoLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSBjaGFyYWN0ZXJzIGluIHRoZSBwcmVmaXgsIHRyaW0gdGhlIHByZWZpeCBpZiB0aGUgX2ZpcnN0X1xuXHRcdFx0XHQvLyBzdWZmaXggY2hhcmFjdGVyIGlzIHRoZSBzYW1lIGFzIHRoZSBsYXN0IHByZWZpeCBjaGFyYWN0ZXIuIEZvciBleGFtcGxlLCBmb3IgdGhlXG5cdFx0XHRcdC8vIHRleHQgYGVjaG8gXCInZm9vJyBvbiBsaW5lIDFcImA6XG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIC0gUHJlZml4PSdcblx0XHRcdFx0Ly8gLSBQYXRoPWZvb1xuXHRcdFx0XHQvLyAtIFN1ZmZpeD0nIG9uIGxpbmUgMVxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBJZiB0aGlzIGZhaWxzIG9uIGEgbXVsdGktY2hhcmFjdGVyIHByZWZpeCwganVzdCBrZWVwIHRoZSBvcmlnaW5hbC5cblx0XHRcdFx0aWYgKHByZWZpeE1hdGNoLmdyb3Vwcy5wcmVmaXgubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdGlmIChzdWZmaXguc3VmZml4LnRleHRbMF0ubWF0Y2goL1snXCJdLykgJiYgcHJlZml4TWF0Y2guZ3JvdXBzLnByZWZpeFtwcmVmaXhNYXRjaC5ncm91cHMucHJlZml4Lmxlbmd0aCAtIDFdID09PSBzdWZmaXguc3VmZml4LnRleHRbMF0pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRyaW1QcmVmaXhBbW91bnQgPSBwcmVmaXhNYXRjaC5ncm91cHMucHJlZml4Lmxlbmd0aCAtIDE7XG5cdFx0XHRcdFx0XHRwcmVmaXguaW5kZXggKz0gdHJpbVByZWZpeEFtb3VudDtcblx0XHRcdFx0XHRcdHByZWZpeC50ZXh0ID0gcHJlZml4TWF0Y2guZ3JvdXBzLnByZWZpeFtwcmVmaXhNYXRjaC5ncm91cHMucHJlZml4Lmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdFx0bGlua1N0YXJ0SW5kZXggKz0gdHJpbVByZWZpeEFtb3VudDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRpbmRleDogbGlua1N0YXJ0SW5kZXggKyAocHJlZml4Py50ZXh0Lmxlbmd0aCB8fCAwKSxcblx0XHRcdFx0XHR0ZXh0OiBwYXRoXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZWZpeCxcblx0XHRcdFx0c3VmZml4XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSWYgdGhlIHBhdGggY29udGFpbnMgYW4gb3BlbmluZyBicmFja2V0LCBwcm92aWRlIHRoZSBwYXRoIHN0YXJ0aW5nIGltbWVkaWF0ZWx5IGFmdGVyXG5cdFx0XHQvLyB0aGUgb3BlbmluZyBicmFja2V0IGFzIGFuIGFkZGl0aW9uYWwgcmVzdWx0XG5cdFx0XHRjb25zdCBvcGVuaW5nQnJhY2tldE1hdGNoID0gcGF0aC5tYXRjaEFsbCgvKD88YnJhY2tldD5bXFxbXFwoXSkoPyFbXFxdXFwpXSkvZyk7XG5cdFx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG9wZW5pbmdCcmFja2V0TWF0Y2gpIHtcblx0XHRcdFx0Y29uc3QgYnJhY2tldCA9IG1hdGNoLmdyb3Vwcz8uYnJhY2tldDtcblx0XHRcdFx0aWYgKGJyYWNrZXQpIHtcblx0XHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0XHRpbmRleDogbGlua1N0YXJ0SW5kZXggKyAocHJlZml4Py50ZXh0Lmxlbmd0aCB8fCAwKSArIG1hdGNoLmluZGV4ICsgMSxcblx0XHRcdFx0XHRcdFx0dGV4dDogcGF0aC5zdWJzdHJpbmcobWF0Y2guaW5kZXggKyBicmFja2V0Lmxlbmd0aClcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVmaXgsXG5cdFx0XHRcdFx0XHRzdWZmaXhcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHRzO1xufVxuXG5lbnVtIFJlZ2V4UGF0aENvbnN0YW50cyB7XG5cdFBhdGhQcmVmaXggPSAnKD86XFxcXC5cXFxcLj98XFxcXH58ZmlsZTpcXC9cXC8pJyxcblx0UGF0aFNlcGFyYXRvckNsYXVzZSA9ICdcXFxcLycsXG5cdC8vICdcIjo7IGFyZSBhbGxvd2VkIGluIHBhdGhzIGJ1dCB0aGV5IGFyZSBvZnRlbiBzZXBhcmF0b3JzIHNvIGlnbm9yZSB0aGVtXG5cdC8vIEFsc28gZGlzYWxsb3cgXFxcXCB0byBwcmV2ZW50IGEgY2F0YXN0cm9waWMgYmFja3RyYWNraW5nIGNhc2UgIzI0Nzk1XG5cdEV4Y2x1ZGVkUGF0aENoYXJhY3RlcnNDbGF1c2UgPSAnW15cXFxcMDw+XFxcXD9cXFxccyFgJiooKVxcJ1wiOjtcXFxcXFxcXF0nLFxuXHRFeGNsdWRlZFN0YXJ0UGF0aENoYXJhY3RlcnNDbGF1c2UgPSAnW15cXFxcMDw+XFxcXD9cXFxccyFgJiooKVxcXFxbXFxcXF1cXCdcIjo7XFxcXFxcXFxdJyxcblxuXHRXaW5PdGhlclBhdGhQcmVmaXggPSAnXFxcXC5cXFxcLj98XFxcXH4nLFxuXHRXaW5QYXRoU2VwYXJhdG9yQ2xhdXNlID0gJyg/OlxcXFxcXFxcfFxcXFwvKScsXG5cdFdpbkV4Y2x1ZGVkUGF0aENoYXJhY3RlcnNDbGF1c2UgPSAnW15cXFxcMDw+XFxcXD9cXFxcfFxcXFwvXFxcXHMhYCYqKClcXCdcIjo7XScsXG5cdFdpbkV4Y2x1ZGVkU3RhcnRQYXRoQ2hhcmFjdGVyc0NsYXVzZSA9ICdbXlxcXFwwPD5cXFxcP1xcXFx8XFxcXC9cXFxccyFgJiooKVxcXFxbXFxcXF1cXCdcIjo7XScsXG59XG5cbi8qKlxuICogQSByZWdleCB0aGF0IG1hdGNoZXMgbm9uLVdpbmRvd3MgcGF0aHMsIHN1Y2ggYXMgYC9mb29gLCBgfi9mb29gLCBgLi9mb29gLCBgLi4vZm9vYCBhbmRcbiAqIGBmb28vYmFyYC5cbiAqL1xuY29uc3QgdW5peExvY2FsTGlua0NsYXVzZSA9ICcoPzooPzonICsgUmVnZXhQYXRoQ29uc3RhbnRzLlBhdGhQcmVmaXggKyAnfCg/OicgKyBSZWdleFBhdGhDb25zdGFudHMuRXhjbHVkZWRTdGFydFBhdGhDaGFyYWN0ZXJzQ2xhdXNlICsgUmVnZXhQYXRoQ29uc3RhbnRzLkV4Y2x1ZGVkUGF0aENoYXJhY3RlcnNDbGF1c2UgKyAnKikpPyg/OicgKyBSZWdleFBhdGhDb25zdGFudHMuUGF0aFNlcGFyYXRvckNsYXVzZSArICcoPzonICsgUmVnZXhQYXRoQ29uc3RhbnRzLkV4Y2x1ZGVkUGF0aENoYXJhY3RlcnNDbGF1c2UgKyAnKSspKyknO1xuXG4vKipcbiAqIEEgcmVnZXggY2xhdXNlIHRoYXQgbWF0Y2hlcyB0aGUgc3RhcnQgb2YgYW4gYWJzb2x1dGUgcGF0aCBvbiBXaW5kb3dzLCBzdWNoIGFzOiBgQzpgLCBgYzpgLFxuICogYGZpbGU6Ly8vYzpgICh1cmkpIGFuZCBgXFxcXD9cXEM6YCAoVU5DIHBhdGgpLlxuICovXG5leHBvcnQgY29uc3Qgd2luRHJpdmVQcmVmaXggPSAnKD86XFxcXFxcXFxcXFxcXFxcXFxcXFw/XFxcXFxcXFx8ZmlsZTpcXFxcL1xcXFwvXFxcXC8pP1thLXpBLVpdOic7XG5cbi8qKlxuICogQSByZWdleCB0aGF0IG1hdGNoZXMgV2luZG93cyBwYXRocywgc3VjaCBhcyBgXFxcXD9cXGM6XFxmb29gLCBgYzpcXGZvb2AsIGB+XFxmb29gLCBgLlxcZm9vYCwgYC4uXFxmb29gXG4gKiBhbmQgYGZvb1xcYmFyYC5cbiAqL1xuY29uc3Qgd2luTG9jYWxMaW5rQ2xhdXNlID0gJyg/Oig/OicgKyBgKD86JHt3aW5Ecml2ZVByZWZpeH18JHtSZWdleFBhdGhDb25zdGFudHMuV2luT3RoZXJQYXRoUHJlZml4fSlgICsgJ3woPzonICsgUmVnZXhQYXRoQ29uc3RhbnRzLldpbkV4Y2x1ZGVkU3RhcnRQYXRoQ2hhcmFjdGVyc0NsYXVzZSArIFJlZ2V4UGF0aENvbnN0YW50cy5XaW5FeGNsdWRlZFBhdGhDaGFyYWN0ZXJzQ2xhdXNlICsgJyopKT8oPzonICsgUmVnZXhQYXRoQ29uc3RhbnRzLldpblBhdGhTZXBhcmF0b3JDbGF1c2UgKyAnKD86JyArIFJlZ2V4UGF0aENvbnN0YW50cy5XaW5FeGNsdWRlZFBhdGhDaGFyYWN0ZXJzQ2xhdXNlICsgJykrKSspJztcblxuLyoqXG4gKiBBIHJlZ2V4IGNsYXVzZSB0aGF0IG1hdGNoZXMgdGhlIGtub3duIHNpbmdsZS1jaGFyYWN0ZXIgcHJlZml4ZXMgdXNlZCBpbiBnaXQgZGlmZnMuXG4gKiBXaGVuIGRpZmYubW5lbW9uaWNQcmVmaXggaXMgZW5hYmxlZCwgR2l0IHVzZXMgbW5lbW9uaWMgbGV0dGVyIHByZWZpeGVzIGFuZCB1c2VzIDEvIGFuZCAyL1xuICogZm9yIGBnaXQgZGlmZiAtLW5vLWluZGV4YC5cbiAqL1xuY29uc3QgZGlmZkZpbGVQcmVmaXggPSAnW2FiY2lvdzEyXVxcXFwvJztcblxuLyoqXG4gKiBBIHJlZ2V4IHRoYXQgbWF0Y2hlcyBnaXQgZGlmZiBsaW5lcyB3aXRoIGZpbGVuYW1lcywgc3VjaCBhcyBgLS0tIGEvZm9vYCwgYCsrKyBiL2Zvb2AuXG4gKi9cbmNvbnN0IGdpdERpZmZMaW5lUmVnZXggPSBuZXcgTGF6eTxSZWdFeHA+KCgpID0+IG5ldyBSZWdFeHAoYF5bLStdezN9ICR7ZGlmZkZpbGVQcmVmaXh9YCkpO1xuLyoqXG4gKiBBIHJlZ2V4IHRoYXQgbWF0Y2hlcyBmaWxlbmFtZXMgaW4gbGluZXMgbGlrZSBgZGlmZiAtLWdpdCBhL2ZvbyBiL2Zvb2Agd2l0aG91dCB0aGUgcHJlZml4LlxuICovXG5jb25zdCBnaXREaWZmVGV4dFJlZ2V4ID0gbmV3IExhenk8UmVnRXhwPigoKSA9PiBuZXcgUmVnRXhwKGBeJHtkaWZmRmlsZVByZWZpeH1gKSk7XG5cbmZ1bmN0aW9uIGRldGVjdFBhdGhzTm9TdWZmaXgobGluZTogc3RyaW5nLCBvczogT3BlcmF0aW5nU3lzdGVtKTogSVBhcnNlZExpbmtbXSB7XG5cdGNvbnN0IHJlc3VsdHM6IElQYXJzZWRMaW5rW10gPSBbXTtcblxuXHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luTG9jYWxMaW5rQ2xhdXNlIDogdW5peExvY2FsTGlua0NsYXVzZSwgJ2cnKTtcblx0bGV0IG1hdGNoO1xuXHR3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyhsaW5lKSkgIT09IG51bGwpIHtcblx0XHRsZXQgdGV4dCA9IG1hdGNoWzBdO1xuXHRcdGxldCBpbmRleCA9IG1hdGNoLmluZGV4O1xuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0Ly8gU29tZXRoaW5nIG1hdGNoZWQgYnV0IGRvZXMgbm90IGNvbXBseSB3aXRoIHRoZSBnaXZlbiBtYXRjaCBpbmRleCwgc2luY2UgdGhpcyB3b3VsZFxuXHRcdFx0Ly8gbW9zdCBsaWtlbHkgYSBidWcgdGhlIHJlZ2V4IGl0c2VsZiB3ZSBzaW1wbHkgZG8gbm90aGluZyBoZXJlXG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgdGhlIGxpbmsgcmFuZ2UgdG8gZXhjbHVkZSBhIGtub3duIEdpdCBkaWZmIHByZWZpeFxuXHRcdGlmIChcblx0XHRcdC8vIC0tLSBhL2Zvby9iYXJcblx0XHRcdC8vICsrKyBiL2Zvby9iYXJcblx0XHRcdChnaXREaWZmTGluZVJlZ2V4LnZhbHVlLnRlc3QobGluZSkgJiYgaW5kZXggPT09IDQpIHx8XG5cdFx0XHQvLyBkaWZmIC0tZ2l0IGEvZm9vL2JhciBiL2Zvby9iYXJcblx0XHRcdChsaW5lLnN0YXJ0c1dpdGgoJ2RpZmYgLS1naXQnKSAmJiBnaXREaWZmVGV4dFJlZ2V4LnZhbHVlLnRlc3QodGV4dCkpXG5cdFx0KSB7XG5cdFx0XHR0ZXh0ID0gdGV4dC5zdWJzdHJpbmcoMik7XG5cdFx0XHRpbmRleCArPSAyO1xuXHRcdH1cblxuXHRcdHJlc3VsdHMucHVzaCh7XG5cdFx0XHRwYXRoOiB7XG5cdFx0XHRcdGluZGV4LFxuXHRcdFx0XHR0ZXh0XG5cdFx0XHR9LFxuXHRcdFx0cHJlZml4OiB1bmRlZmluZWQsXG5cdFx0XHRzdWZmaXg6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdHM7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFXQSxTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUF5QmhDLE1BQU0scUJBQXFCLElBQUksS0FBYSxNQUFNLHdCQUF3QixJQUFJLENBQUM7QUFJL0UsTUFBTSxrQkFBa0IsSUFBSSxLQUFhLE1BQU0sd0JBQXdCLEtBQUssQ0FBQztBQUU3RSxTQUFTLHdCQUF3QixTQUFrQjtBQUNsRCxNQUFJLEtBQUs7QUFDVCxNQUFJLEtBQUs7QUFDVCxNQUFJLE1BQU07QUFDVixNQUFJLE1BQU07QUFDVixXQUFTLElBQVk7QUFDcEIsV0FBTyxTQUFTLElBQUk7QUFBQSxFQUNyQjtBQUNBLFdBQVMsSUFBWTtBQUNwQixXQUFPLFNBQVMsSUFBSTtBQUFBLEVBQ3JCO0FBQ0EsV0FBUyxLQUFhO0FBQ3JCLFdBQU8sWUFBWSxL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
