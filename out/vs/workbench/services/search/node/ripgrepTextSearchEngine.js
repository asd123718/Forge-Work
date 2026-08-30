import * as cp from "child_process";
import { EventEmitter } from "events";
import { StringDecoder } from "string_decoder";
import { coalesce, mapArrayOrNot } from "../../../../base/common/arrays.js";
import { groupBy } from "../../../../base/common/collections.js";
import { splitGlobAware } from "../../../../base/common/glob.js";
import { createRegExp, escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { DEFAULT_MAX_SEARCH_RESULTS, SearchError, SearchErrorCode, serializeSearchError, TextSearchMatch } from "../common/search.js";
import { Range, TextSearchContext2, TextSearchMatch2 } from "../common/searchExtTypes.js";
import { RegExpParser, RegExpVisitor } from "vscode-regexpp";
import { anchorGlob, rangeToSearchRange, searchRangeToRange } from "./ripgrepSearchUtils.js";
import { newToOldPreviewOptions } from "../common/searchExtConversionTypes.js";
import { rgDiskPath } from "../../../../base/node/ripgrep.js";
class RipgrepTextSearchEngine {
  constructor(outputChannel, _numThreads) {
    this.outputChannel = outputChannel;
    this._numThreads = _numThreads;
  }
  provideTextSearchResults(query, options, progress, token) {
    return Promise.all(options.folderOptions.map((folderOption) => {
      const extendedOptions = {
        folderOptions: folderOption,
        numThreads: this._numThreads,
        maxResults: options.maxResults,
        previewOptions: options.previewOptions,
        maxFileSize: options.maxFileSize,
        surroundingContext: options.surroundingContext
      };
      return this.provideTextSearchResultsWithRgOptions(query, extendedOptions, progress, token);
    })).then(((e) => {
      const complete = {
        // todo: get this to actually check
        limitHit: e.some((complete2) => !!complete2 && complete2.limitHit)
      };
      return complete;
    }));
  }
  async provideTextSearchResultsWithRgOptions(query, options, progress, token) {
    this.outputChannel.appendLine(`provideTextSearchResults ${query.pattern}, ${JSON.stringify({
      ...options,
      ...{
        folder: options.folderOptions.folder.toString()
      }
    })}`);
    if (!query.pattern) {
      return { limitHit: false };
    }
    const resolvedRgDiskPath = await rgDiskPath();
    return new Promise((resolve, reject) => {
      token.onCancellationRequested(() => cancel());
      const extendedOptions = {
        ...options,
        numThreads: this._numThreads
      };
      const rgArgs = getRgArgs(query, extendedOptions);
      const cwd = options.folderOptions.folder.fsPath;
      const escapedArgs = rgArgs.map((arg) => arg.match(/^-/) ? arg : `'${arg}'`).join(" ");
      this.outputChannel.appendLine(`${resolvedRgDiskPath} ${escapedArgs}
 - cwd: ${cwd}`);
      let rgProc = cp.spawn(resolvedRgDiskPath, rgArgs, { cwd });
      rgProc.on("error", (e) => {
        console.error(e);
        this.outputChannel.appendLine("Error: " + (e && e.message));
        reject(serializeSearchError(new SearchError(e && e.message, SearchErrorCode.rgProcessError)));
      });
      let gotResult = false;
      const ripgrepParser = new RipgrepParser(options.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS, options.folderOptions.folder, newToOldPreviewOptions(options.previewOptions));
      ripgrepParser.on("result", (match) => {
        gotResult = true;
        dataWithoutResult = "";
        progress.report(match);
      });
      let isDone = false;
      const cancel = () => {
        isDone = true;
        rgProc?.kill();
        ripgrepParser?.cancel();
      };
      let limitHit = false;
      ripgrepParser.on("hitLimit", () => {
        limitHit = true;
        cancel();
      });
      let dataWithoutResult = "";
      rgProc.stdout.on("data", (data) => {
        ripgrepParser.handleData(data);
        if (!gotResult) {
          dataWithoutResult += data;
        }
      });
      let gotData = false;
      rgProc.stdout.once("data", () => gotData = true);
      let stderr = "";
      rgProc.stderr.on("data", (data) => {
        const message = data.toString();
        this.outputChannel.appendLine(message);
        if (stderr.length + message.length < 1e6) {
          stderr += message;
        }
      });
      rgProc.on("close", () => {
        this.outputChannel.appendLine(gotData ? "Got data from stdout" : "No data from stdout");
        this.outputChannel.appendLine(gotResult ? "Got result from parser" : "No result from parser");
        if (dataWithoutResult) {
          this.outputChannel.appendLine(`Got data without result: ${dataWithoutResult}`);
        }
        this.outputChannel.appendLine("");
        if (isDone) {
          resolve({ limitHit });
        } else {
          ripgrepParser.flush();
          rgProc = null;
          let searchError;
          if (stderr && !gotData && (searchError = rgErrorMsgForDisplay(stderr))) {
            reject(serializeSearchError(new SearchError(searchError.message, searchError.code)));
          } else {
            resolve({ limitHit });
          }
        }
      });
    });
  }
}
function rgErrorMsgForDisplay(msg) {
  const lines = msg.split("\n");
  const firstLine = lines[0].trim();
  if (lines.some((l) => l.startsWith("regex parse error"))) {
    return new SearchError(buildRegexParseError(lines), SearchErrorCode.regexParseError);
  }
  const match = firstLine.match(/grep config error: unknown encoding: (.*)/);
  if (match) {
    return new SearchError(`Unknown encoding: ${match[1]}`, SearchErrorCode.unknownEncoding);
  }
  if (firstLine.startsWith("error parsing glob")) {
    return new SearchError(firstLine.charAt(0).toUpperCase() + firstLine.substr(1), SearchErrorCode.globParseError);
  }
  if (firstLine.startsWith("the literal")) {
    return new SearchError(firstLine.charAt(0).toUpperCase() + firstLine.substr(1), SearchErrorCode.invalidLiteral);
  }
  if (firstLine.startsWith("PCRE2: error compiling pattern")) {
    return new SearchError(firstLine, SearchErrorCode.regexParseError);
  }
  return void 0;
}
function buildRegexParseError(lines) {
  const errorMessage = ["Regex parse error"];
  const pcre2ErrorLine = lines.filter((l) => l.startsWith("PCRE2:"));
  if (pcre2ErrorLine.length >= 1) {
    const pcre2ErrorMessage = pcre2ErrorLine[0].replace("PCRE2:", "");
    if (pcre2ErrorMessage.indexOf(":") !== -1 && pcre2ErrorMessage.split(":").length >= 2) {
      const pcre2ActualErrorMessage = pcre2ErrorMessage.split(":")[1];
      errorMessage.push(":" + pcre2ActualErrorMessage);
    }
  }
  return errorMessage.join("");
}
class RipgrepParser extends EventEmitter {
  constructor(maxResults, root, previewOptions) {
    super();
    this.maxResults = maxResults;
    this.root = root;
    this.previewOptions = previewOptions;
    this.remainder = "";
    this.isDone = false;
    this.hitLimit = false;
    this.numResults = 0;
    this.stringDecoder = new StringDecoder();
  }
  cancel() {
    this.isDone = true;
  }
  flush() {
    this.handleDecodedData(this.stringDecoder.end());
  }
  on(event, listener) {
    super.on(event, listener);
    return this;
  }
  handleData(data) {
    if (this.isDone) {
      return;
    }
    const dataStr = typeof data === "string" ? data : this.stringDecoder.write(data);
    this.handleDecodedData(dataStr);
  }
  handleDecodedData(decodedData) {
    let newlineIdx = decodedData.indexOf("\n");
    const dataStr = this.remainder + decodedData;
    if (newlineIdx >= 0) {
      newlineIdx += this.remainder.length;
    } else {
      this.remainder = dataStr;
      return;
    }
    let prevIdx = 0;
    while (newlineIdx >= 0) {
      this.handleLine(dataStr.substring(prevIdx, newlineIdx).trim());
      prevIdx = newlineIdx + 1;
      newlineIdx = dataStr.indexOf("\n", prevIdx);
    }
    this.remainder = dataStr.substring(prevIdx);
  }
  handleLine(outputLine) {
    if (this.isDone || !outputLine) {
      return;
    }
    let parsedLine;
    try {
      parsedLine = JSON.parse(outputLine);
    } catch (e) {
      throw new Error(`malformed line from rg: ${outputLine}`);
    }
    if (parsedLine.type === "match") {
      const matchPath = bytesOrTextToString(parsedLine.data.path);
      const uri = URI.joinPath(this.root, matchPath);
      const result = this.createTextSearchMatch(parsedLine.data, uri);
      this.onResult(result);
      if (this.hitLimit) {
        this.cancel();
        this.emit("hitLimit");
      }
    } else if (parsedLine.type === "context") {
      const contextPath = bytesOrTextToString(parsedLine.data.path);
      const uri = URI.joinPath(this.root, contextPath);
      const result = this.createTextSearchContexts(parsedLine.data, uri);
      result.forEach((r) => this.onResult(r));
    }
  }
  createTextSearchMatch(data, uri) {
    const lineNumber = data.line_number - 1;
    const fullText = bytesOrTextToString(data.lines);
    const fullTextBytes = Buffer.from(fullText);
    let prevMatchEnd = 0;
    let prevMatchEndCol = 0;
    let prevMatchEndLine = lineNumber;
    if (data.submatches.length === 0) {
      data.submatches.push(
        fullText.length ? { start: 0, end: 1, match: { text: fullText[0] } } : { start: 0, end: 0, match: { text: "" } }
      );
    }
    const ranges = coalesce(data.submatches.map((match, i) => {
      if (this.hitLimit) {
        return null;
      }
      this.numResults++;
      if (this.numResults >= this.maxResults) {
        this.hitLimit = true;
      }
      const matchText = bytesOrTextToString(match.match);
      const inBetweenText = fullTextBytes.slice(prevMatchEnd, match.start).toString();
      const inBetweenStats = getNumLinesAndLastNewlineLength(inBetweenText);
      const startCol = inBetweenStats.numLines > 0 ? inBetweenStats.lastLineLength : inBetweenStats.lastLineLength + prevMatchEndCol;
      const stats = getNumLinesAndLastNewlineLength(matchText);
      const startLineNumber = inBetweenStats.numLines + prevMatchEndLine;
      const endLineNumber = stats.numLines + startLineNumber;
      const endCol = stats.numLines > 0 ? stats.lastLineLength : stats.lastLineLength + startCol;
      prevMatchEnd = match.end;
      prevMatchEndCol = endCol;
      prevMatchEndLine = endLineNumber;
      return new Range(startLineNumber, startCol, endLineNumber, endCol);
    }));
    const searchRange = mapArrayOrNot(ranges, rangeToSearchRange);
    const internalResult = new TextSearchMatch(fullText, searchRange, this.previewOptions);
    return new TextSearchMatch2(
      uri,
      internalResult.rangeLocations.map((e) => ({
        sourceRange: searchRangeToRange(e.source),
        previewRange: searchRangeToRange(e.preview)
      })),
      internalResult.previewText
    );
  }
  createTextSearchContexts(data, uri) {
    const text = bytesOrTextToString(data.lines);
    const startLine = data.line_number;
    return text.replace(/\r?\n$/, "").split("\n").map((line, i) => new TextSearchContext2(uri, line, startLine + i));
  }
  onResult(match) {
    this.emit("result", match);
  }
}
function bytesOrTextToString(obj) {
  return obj.bytes ? Buffer.from(obj.bytes, "base64").toString() : obj.text;
}
function getNumLinesAndLastNewlineLength(text) {
  const re = /\n/g;
  let numLines = 0;
  let lastNewlineIdx = -1;
  let match;
  while (match = re.exec(text)) {
    numLines++;
    lastNewlineIdx = match.index;
  }
  const lastLineLength = lastNewlineIdx >= 0 ? text.length - lastNewlineIdx - 1 : text.length;
  return { numLines, lastLineLength };
}
function getRgArgs(query, options) {
  const args = ["--hidden", "--no-require-git"];
  args.push(query.isCaseSensitive ? "--case-sensitive" : "--ignore-case");
  if (options.folderOptions.ignoreGlobCase) {
    args.push("--glob-case-insensitive");
    args.push("--ignore-file-case-insensitive");
  }
  const { doubleStarIncludes, otherIncludes } = groupBy(
    options.folderOptions.includes,
    (include) => include.startsWith("**") ? "doubleStarIncludes" : "otherIncludes"
  );
  if (otherIncludes && otherIncludes.length) {
    const uniqueOthers = /* @__PURE__ */ new Set();
    otherIncludes.forEach((other) => {
      uniqueOthers.add(other);
    });
    args.push("-g", "!*");
    uniqueOthers.forEach((otherIncude) => {
      spreadGlobComponents(otherIncude).map(anchorGlob).forEach((globArg) => {
        args.push("-g", globArg);
      });
    });
  }
  if (doubleStarIncludes && doubleStarIncludes.length) {
    doubleStarIncludes.forEach((globArg) => {
      args.push("-g", globArg);
    });
  }
  options.folderOptions.excludes.map((e) => typeof e === "string" ? e : e.pattern).map(anchorGlob).forEach((rgGlob) => args.push("-g", `!${rgGlob}`));
  if (options.maxFileSize) {
    args.push("--max-filesize", options.maxFileSize + "");
  }
  if (options.folderOptions.useIgnoreFiles.local) {
    if (!options.folderOptions.useIgnoreFiles.parent) {
      args.push("--no-ignore-parent");
    }
  } else {
    args.push("--no-ignore");
  }
  if (options.folderOptions.followSymlinks) {
    args.push("--follow");
  }
  if (options.folderOptions.encoding && options.folderOptions.encoding !== "utf8") {
    args.push("--encoding", options.folderOptions.encoding);
  }
  if (options.numThreads) {
    args.push("--threads", `${options.numThreads}`);
  }
  if (query.pattern === "--") {
    query.isRegExp = true;
    query.pattern = "\\-\\-";
  }
  if (query.isMultiline && !query.isRegExp) {
    query.pattern = escapeRegExpCharacters(query.pattern);
    query.isRegExp = true;
  }
  args.push("--crlf");
  if (query.isRegExp) {
    query.pattern = unicodeEscapesToPCRE2(query.pattern);
    args.push("--engine", "auto");
  }
  let searchPatternAfterDoubleDashes;
  if (query.isWordMatch) {
    const regexp = createRegExp(query.pattern, !!query.isRegExp, { wholeWord: query.isWordMatch });
    const regexpStr = regexp.source.replace(/\\\//g, "/");
    args.push("--regexp", regexpStr);
  } else if (query.isRegExp) {
    let fixedRegexpQuery = fixRegexNewline(query.pattern);
    fixedRegexpQuery = fixNewline(fixedRegexpQuery);
    args.push("--regexp", fixedRegexpQuery);
  } else {
    searchPatternAfterDoubleDashes = query.pattern;
    args.push("--fixed-strings");
  }
  args.push("--no-config");
  if (!options.folderOptions.useIgnoreFiles.global) {
    args.push("--no-ignore-global");
  }
  args.push("--json");
  if (query.isMultiline) {
    args.push("--multiline");
  }
  if (options.surroundingContext) {
    args.push("--before-context", options.surroundingContext + "");
    args.push("--after-context", options.surroundingContext + "");
  }
  args.push("--");
  if (searchPatternAfterDoubleDashes) {
    args.push(searchPatternAfterDoubleDashes);
  }
  args.push(".");
  return args;
}
function spreadGlobComponents(globComponent) {
  const globComponentWithBraceExpansion = performBraceExpansionForRipgrep(globComponent);
  return globComponentWithBraceExpansion.flatMap((globArg) => {
    const components = splitGlobAware(globArg, "/");
    return components.map((_, i) => components.slice(0, i + 1).join("/"));
  });
}
function unicodeEscapesToPCRE2(pattern) {
  const unicodePattern = /((?:[^\\]|^)(?:\\\\)*)\\u([a-z0-9]{4})/gi;
  while (pattern.match(unicodePattern)) {
    pattern = pattern.replace(unicodePattern, `$1\\x{$2}`);
  }
  const unicodePatternWithBraces = /((?:[^\\]|^)(?:\\\\)*)\\u\{([a-z0-9]{4})\}/gi;
  while (pattern.match(unicodePatternWithBraces)) {
    pattern = pattern.replace(unicodePatternWithBraces, `$1\\x{$2}`);
  }
  return pattern;
}
const isLookBehind = (node) => node.type === "Assertion" && node.kind === "lookbehind";
function fixRegexNewline(pattern) {
  let re;
  try {
    re = new RegExpParser().parsePattern(pattern);
  } catch {
    return pattern;
  }
  let output = "";
  let lastEmittedIndex = 0;
  const replace = (start, end, text) => {
    output += pattern.slice(lastEmittedIndex, start) + text;
    lastEmittedIndex = end;
  };
  const context = [];
  const visitor = new RegExpVisitor({
    onCharacterEnter(char) {
      if (char.raw !== "\\n") {
        return;
      }
      const parent = context[0];
      if (!parent) {
        replace(char.start, char.end, "\\r?\\n");
      } else if (context.some(isLookBehind)) {
      } else if (parent.type === "CharacterClass") {
        if (parent.negate) {
          const otherContent = pattern.slice(parent.start + 2, char.start) + pattern.slice(char.end, parent.end - 1);
          if (parent.parent?.type === "Quantifier") {
            replace(parent.start, parent.end, otherContent ? `[^${otherContent}]` : ".");
          } else {
            replace(parent.start, parent.end, "(?!\\r?\\n" + (otherContent ? `|[${otherContent}]` : "") + ")");
          }
        } else {
          const otherContent = pattern.slice(parent.start + 1, char.start) + pattern.slice(char.end, parent.end - 1);
          replace(parent.start, parent.end, otherContent === "" ? "\\r?\\n" : `(?:[${otherContent}]|\\r?\\n)`);
        }
      } else if (parent.type === "Quantifier") {
        replace(char.start, char.end, "(?:\\r?\\n)");
      }
    },
    onQuantifierEnter(node) {
      context.unshift(node);
    },
    onQuantifierLeave() {
      context.shift();
    },
    onCharacterClassRangeEnter(node) {
      context.unshift(node);
    },
    onCharacterClassRangeLeave() {
      context.shift();
    },
    onCharacterClassEnter(node) {
      context.unshift(node);
    },
    onCharacterClassLeave() {
      context.shift();
    },
    onAssertionEnter(node) {
      if (isLookBehind(node)) {
        context.push(node);
      }
    },
    onAssertionLeave(node) {
      if (context[0] === node) {
        context.shift();
      }
    }
  });
  visitor.visit(re);
  output += pattern.slice(lastEmittedIndex);
  return output;
}
function fixNewline(pattern) {
  return pattern.replace(/\n/g, "\\r?\\n");
}
function getEscapeAwareSplitStringForRipgrep(pattern) {
  let inBraces = false;
  let escaped = false;
  let fixedStart = "";
  let strInBraces = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    switch (char) {
      case "\\":
        if (escaped) {
          if (inBraces) {
            strInBraces += "\\" + char;
          } else {
            fixedStart += "\\" + char;
          }
          escaped = false;
        } else {
          escaped = true;
        }
        break;
      case "{":
        if (escaped) {
          if (inBraces) {
            strInBraces += char;
          } else {
            fixedStart += char;
          }
          escaped = false;
        } else {
          if (inBraces) {
            return { strInBraces: fixedStart + "{" + strInBraces + "{" + pattern.substring(i + 1) };
          } else {
            inBraces = true;
          }
        }
        break;
      case "}":
        if (escaped) {
          if (inBraces) {
            strInBraces += char;
          } else {
            fixedStart += char;
          }
          escaped = false;
        } else if (inBraces) {
          return { fixedStart, strInBraces, fixedEnd: pattern.substring(i + 1) };
        } else {
          fixedStart += char;
        }
        break;
      default:
        if (inBraces) {
          strInBraces += (escaped ? "\\" : "") + char;
        } else {
          fixedStart += (escaped ? "\\" : "") + char;
        }
        escaped = false;
        break;
    }
  }
  return { strInBraces: fixedStart + (inBraces ? "{" + strInBraces : "") };
}
function performBraceExpansionForRipgrep(pattern) {
  const { fixedStart, strInBraces, fixedEnd } = getEscapeAwareSplitStringForRipgrep(pattern);
  if (fixedStart === void 0 || fixedEnd === void 0) {
    return [strInBraces];
  }
  let arr = splitGlobAware(strInBraces, ",");
  if (!arr.length) {
    arr = [""];
  }
  const ends = performBraceExpansionForRipgrep(fixedEnd);
  return arr.flatMap((elem) => {
    const start = fixedStart + elem;
    return ends.map((end) => {
      return start + end;
    });
  });
}
export {
  RipgrepParser,
  RipgrepTextSearchEngine,
  fixNewline,
  fixRegexNewline,
  getRgArgs,
  performBraceExpansionForRipgrep,
  unicodeEscapesToPCRE2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXG5vZGVcXHJpcGdyZXBUZXh0U2VhcmNoRW5naW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBFdmVudEVtaXR0ZXIgfSBmcm9tICdldmVudHMnO1xuaW1wb3J0IHsgU3RyaW5nRGVjb2RlciB9IGZyb20gJ3N0cmluZ19kZWNvZGVyJztcbmltcG9ydCB7IGNvYWxlc2NlLCBtYXBBcnJheU9yTm90IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBzcGxpdEdsb2JBd2FyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgY3JlYXRlUmVnRXhwLCBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9NQVhfU0VBUkNIX1JFU1VMVFMsIElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMsIFNlYXJjaEVycm9yLCBTZWFyY2hFcnJvckNvZGUsIHNlcmlhbGl6ZVNlYXJjaEVycm9yLCBUZXh0U2VhcmNoTWF0Y2ggfSBmcm9tICcuLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFJhbmdlLCBUZXh0U2VhcmNoQ29tcGxldGUyLCBUZXh0U2VhcmNoQ29udGV4dDIsIFRleHRTZWFyY2hNYXRjaDIsIFRleHRTZWFyY2hQcm92aWRlck9wdGlvbnMsIFRleHRTZWFyY2hRdWVyeTIsIFRleHRTZWFyY2hSZXN1bHQyIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IEFTVCBhcyBSZUFTVCwgUmVnRXhwUGFyc2VyLCBSZWdFeHBWaXNpdG9yIH0gZnJvbSAndnNjb2RlLXJlZ2V4cHAnO1xuaW1wb3J0IHsgYW5jaG9yR2xvYiwgSU91dHB1dENoYW5uZWwsIE1heWJlLCByYW5nZVRvU2VhcmNoUmFuZ2UsIHNlYXJjaFJhbmdlVG9SYW5nZSB9IGZyb20gJy4vcmlwZ3JlcFNlYXJjaFV0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgUmlwZ3JlcFRleHRTZWFyY2hPcHRpb25zIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaEV4dFR5cGVzSW50ZXJuYWwuanMnO1xuaW1wb3J0IHsgbmV3VG9PbGRQcmV2aWV3T3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2hFeHRDb252ZXJzaW9uVHlwZXMuanMnO1xuaW1wb3J0IHsgcmdEaXNrUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9yaXBncmVwLmpzJztcblxuZXhwb3J0IGNsYXNzIFJpcGdyZXBUZXh0U2VhcmNoRW5naW5lIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIG91dHB1dENoYW5uZWw6IElPdXRwdXRDaGFubmVsLCBwcml2YXRlIHJlYWRvbmx5IF9udW1UaHJlYWRzPzogbnVtYmVyIHwgdW5kZWZpbmVkKSB7IH1cblxuXHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IFRleHRTZWFyY2hRdWVyeTIsIG9wdGlvbnM6IFRleHRTZWFyY2hQcm92aWRlck9wdGlvbnMsIHByb2dyZXNzOiBQcm9ncmVzczxUZXh0U2VhcmNoUmVzdWx0Mj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VGV4dFNlYXJjaENvbXBsZXRlMj4ge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChvcHRpb25zLmZvbGRlck9wdGlvbnMubWFwKGZvbGRlck9wdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBleHRlbmRlZE9wdGlvbnM6IFJpcGdyZXBUZXh0U2VhcmNoT3B0aW9ucyA9IHtcblx0XHRcdFx0Zm9sZGVyT3B0aW9uczogZm9sZGVyT3B0aW9uLFxuXHRcdFx0XHRudW1UaHJlYWRzOiB0aGlzLl9udW1UaHJlYWRzLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiBvcHRpb25zLm1heFJlc3VsdHMsXG5cdFx0XHRcdHByZXZpZXdPcHRpb25zOiBvcHRpb25zLnByZXZpZXdPcHRpb25zLFxuXHRcdFx0XHRtYXhGaWxlU2l6ZTogb3B0aW9ucy5tYXhGaWxlU2l6ZSxcblx0XHRcdFx0c3Vycm91bmRpbmdDb250ZXh0OiBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0c1dpdGhSZ09wdGlvbnMocXVlcnksIGV4dGVuZGVkT3B0aW9ucywgcHJvZ3Jlc3MsIHRva2VuKTtcblx0XHR9KSkudGhlbigoZSA9PiB7XG5cdFx0XHRjb25zdCBjb21wbGV0ZTogVGV4dFNlYXJjaENvbXBsZXRlMiA9IHtcblx0XHRcdFx0Ly8gdG9kbzogZ2V0IHRoaXMgdG8gYWN0dWFsbHkgY2hlY2tcblx0XHRcdFx0bGltaXRIaXQ6IGUuc29tZShjb21wbGV0ZSA9PiAhIWNvbXBsZXRlICYmIGNvbXBsZXRlLmxpbWl0SGl0KVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBjb21wbGV0ZTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHNXaXRoUmdPcHRpb25zKHF1ZXJ5OiBUZXh0U2VhcmNoUXVlcnkyLCBvcHRpb25zOiBSaXBncmVwVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiBQcm9ncmVzczxUZXh0U2VhcmNoUmVzdWx0Mj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VGV4dFNlYXJjaENvbXBsZXRlMj4ge1xuXHRcdHRoaXMub3V0cHV0Q2hhbm5lbC5hcHBlbmRMaW5lKGBwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMgJHtxdWVyeS5wYXR0ZXJufSwgJHtKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0Li4ue1xuXHRcdFx0XHRmb2xkZXI6IG9wdGlvbnMuZm9sZGVyT3B0aW9ucy5mb2xkZXIudG9TdHJpbmcoKVxuXHRcdFx0fVxuXHRcdH0pfWApO1xuXG5cdFx0aWYgKCFxdWVyeS5wYXR0ZXJuKSB7XG5cdFx0XHRyZXR1cm4geyBsaW1pdEhpdDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZFJnRGlza1BhdGggPSBhd2FpdCByZ0Rpc2tQYXRoKCk7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY2FuY2VsKCkpO1xuXG5cdFx0XHRjb25zdCBleHRlbmRlZE9wdGlvbnM6IFJpcGdyZXBUZXh0U2VhcmNoT3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0bnVtVGhyZWFkczogdGhpcy5fbnVtVGhyZWFkc1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJnQXJncyA9IGdldFJnQXJncyhxdWVyeSwgZXh0ZW5kZWRPcHRpb25zKTtcblxuXHRcdFx0Y29uc3QgY3dkID0gb3B0aW9ucy5mb2xkZXJPcHRpb25zLmZvbGRlci5mc1BhdGg7XG5cblx0XHRcdGNvbnN0IGVzY2FwZWRBcmdzID0gcmdBcmdzXG5cdFx0XHRcdC5tYXAoYXJnID0+IGFyZy5tYXRjaCgvXi0vKSA/IGFyZyA6IGAnJHthcmd9J2ApXG5cdFx0XHRcdC5qb2luKCcgJyk7XG5cdFx0XHR0aGlzLm91dHB1dENoYW5uZWwuYXBwZW5kTGluZShgJHtyZXNvbHZlZFJnRGlza1BhdGh9ICR7ZXNjYXBlZEFyZ3N9XFxuIC0gY3dkOiAke2N3ZH1gKTtcblxuXHRcdFx0bGV0IHJnUHJvYzogTWF5YmU8Y3AuQ2hpbGRQcm9jZXNzPiA9IGNwLnNwYXduKHJlc29sdmVkUmdEaXNrUGF0aCwgcmdBcmdzLCB7IGN3ZCB9KTtcblx0XHRcdHJnUHJvYy5vbignZXJyb3InLCBlID0+IHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdFx0dGhpcy5vdXRwdXRDaGFubmVsLmFwcGVuZExpbmUoJ0Vycm9yOiAnICsgKGUgJiYgZS5tZXNzYWdlKSk7XG5cdFx0XHRcdHJlamVjdChzZXJpYWxpemVTZWFyY2hFcnJvcihuZXcgU2VhcmNoRXJyb3IoZSAmJiBlLm1lc3NhZ2UsIFNlYXJjaEVycm9yQ29kZS5yZ1Byb2Nlc3NFcnJvcikpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgZ290UmVzdWx0ID0gZmFsc2U7XG5cdFx0XHRjb25zdCByaXBncmVwUGFyc2VyID0gbmV3IFJpcGdyZXBQYXJzZXIob3B0aW9ucy5tYXhSZXN1bHRzID8/IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTLCBvcHRpb25zLmZvbGRlck9wdGlvbnMuZm9sZGVyLCBuZXdUb09sZFByZXZpZXdPcHRpb25zKG9wdGlvbnMucHJldmlld09wdGlvbnMpKTtcblx0XHRcdHJpcGdyZXBQYXJzZXIub24oJ3Jlc3VsdCcsIChtYXRjaDogVGV4dFNlYXJjaFJlc3VsdDIpID0+IHtcblx0XHRcdFx0Z290UmVzdWx0ID0gdHJ1ZTtcblx0XHRcdFx0ZGF0YVdpdGhvdXRSZXN1bHQgPSAnJztcblx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KG1hdGNoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgaXNEb25lID0gZmFsc2U7XG5cdFx0XHRjb25zdCBjYW5jZWwgPSAoKSA9PiB7XG5cdFx0XHRcdGlzRG9uZSA9IHRydWU7XG5cblx0XHRcdFx0cmdQcm9jPy5raWxsKCk7XG5cblx0XHRcdFx0cmlwZ3JlcFBhcnNlcj8uY2FuY2VsKCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgbGltaXRIaXQgPSBmYWxzZTtcblx0XHRcdHJpcGdyZXBQYXJzZXIub24oJ2hpdExpbWl0JywgKCkgPT4ge1xuXHRcdFx0XHRsaW1pdEhpdCA9IHRydWU7XG5cdFx0XHRcdGNhbmNlbCgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGxldCBkYXRhV2l0aG91dFJlc3VsdCA9ICcnO1xuXHRcdFx0cmdQcm9jLnN0ZG91dCEub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdFx0cmlwZ3JlcFBhcnNlci5oYW5kbGVEYXRhKGRhdGEpO1xuXHRcdFx0XHRpZiAoIWdvdFJlc3VsdCkge1xuXHRcdFx0XHRcdGRhdGFXaXRob3V0UmVzdWx0ICs9IGRhdGE7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgZ290RGF0YSA9IGZhbHNlO1xuXHRcdFx0cmdQcm9jLnN0ZG91dCEub25jZSgnZGF0YScsICgpID0+IGdvdERhdGEgPSB0cnVlKTtcblxuXHRcdFx0bGV0IHN0ZGVyciA9ICcnO1xuXHRcdFx0cmdQcm9jLnN0ZGVyciEub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGRhdGEudG9TdHJpbmcoKTtcblx0XHRcdFx0dGhpcy5vdXRwdXRDaGFubmVsLmFwcGVuZExpbmUobWVzc2FnZSk7XG5cblx0XHRcdFx0aWYgKHN0ZGVyci5sZW5ndGggKyBtZXNzYWdlLmxlbmd0aCA8IDFlNikge1xuXHRcdFx0XHRcdHN0ZGVyciArPSBtZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0cmdQcm9jLm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0dGhpcy5vdXRwdXRDaGFubmVsLmFwcGVuZExpbmUoZ290RGF0YSA/ICdHb3QgZGF0YSBmcm9tIHN0ZG91dCcgOiAnTm8gZGF0YSBmcm9tIHN0ZG91dCcpO1xuXHRcdFx0XHR0aGlzLm91dHB1dENoYW5uZWwuYXBwZW5kTGluZShnb3RSZXN1bHQgPyAnR290IHJlc3VsdCBmcm9tIHBhcnNlcicgOiAnTm8gcmVzdWx0IGZyb20gcGFyc2VyJyk7XG5cdFx0XHRcdGlmIChkYXRhV2l0aG91dFJlc3VsdCkge1xuXHRcdFx0XHRcdHRoaXMub3V0cHV0Q2hhbm5lbC5hcHBlbmRMaW5lKGBHb3QgZGF0YSB3aXRob3V0IHJlc3VsdDogJHtkYXRhV2l0aG91dFJlc3VsdH1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMub3V0cHV0Q2hhbm5lbC5hcHBlbmRMaW5lKCcnKTtcblxuXHRcdFx0XHRpZiAoaXNEb25lKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7IGxpbWl0SGl0IH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRyaWdnZXIgbGFzdCByZXN1bHRcblx0XHRcdFx0XHRyaXBncmVwUGFyc2VyLmZsdXNoKCk7XG5cdFx0XHRcdFx0cmdQcm9jID0gbnVsbDtcblx0XHRcdFx0XHRsZXQgc2VhcmNoRXJyb3I6IE1heWJlPFNlYXJjaEVycm9yPjtcblx0XHRcdFx0XHRpZiAoc3RkZXJyICYmICFnb3REYXRhICYmIChzZWFyY2hFcnJvciA9IHJnRXJyb3JNc2dGb3JEaXNwbGF5KHN0ZGVycikpKSB7XG5cdFx0XHRcdFx0XHRyZWplY3Qoc2VyaWFsaXplU2VhcmNoRXJyb3IobmV3IFNlYXJjaEVycm9yKHNlYXJjaEVycm9yLm1lc3NhZ2UsIHNlYXJjaEVycm9yLmNvZGUpKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoeyBsaW1pdEhpdCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogUmVhZCB0aGUgZmlyc3QgbGluZSBvZiBzdGRlcnIgYW5kIHJldHVybiBhbiBlcnJvciBmb3IgZGlzcGxheSBvciB1bmRlZmluZWQsIGJhc2VkIG9uIGEgbGlzdCBvZlxuICogYWxsb3dlZCBwcm9wZXJ0aWVzLlxuICogUmlwZ3JlcCBwcm9kdWNlcyBzdGRlcnIgb3V0cHV0IHdoaWNoIGlzIG5vdCBmcm9tIGEgZmF0YWwgZXJyb3IsIGFuZCB3ZSBvbmx5IHdhbnQgdGhlIHNlYXJjaCB0byBiZVxuICogXCJmYWlsZWRcIiB3aGVuIGEgZmF0YWwgZXJyb3Igd2FzIHByb2R1Y2VkLlxuICovXG5mdW5jdGlvbiByZ0Vycm9yTXNnRm9yRGlzcGxheShtc2c6IHN0cmluZyk6IE1heWJlPFNlYXJjaEVycm9yPiB7XG5cdGNvbnN0IGxpbmVzID0gbXNnLnNwbGl0KCdcXG4nKTtcblx0Y29uc3QgZmlyc3RMaW5lID0gbGluZXNbMF0udHJpbSgpO1xuXG5cdGlmIChsaW5lcy5zb21lKGwgPT4gbC5zdGFydHNXaXRoKCdyZWdleCBwYXJzZSBlcnJvcicpKSkge1xuXHRcdHJldHVybiBuZXcgU2VhcmNoRXJyb3IoYnVpbGRSZWdleFBhcnNlRXJyb3IobGluZXMpLCBTZWFyY2hFcnJvckNvZGUucmVnZXhQYXJzZUVycm9yKTtcblx0fVxuXG5cdGNvbnN0IG1hdGNoID0gZmlyc3RMaW5lLm1hdGNoKC9ncmVwIGNvbmZpZyBlcnJvcjogdW5rbm93biBlbmNvZGluZzogKC4qKS8pO1xuXHRpZiAobWF0Y2gpIHtcblx0XHRyZXR1cm4gbmV3IFNlYXJjaEVycm9yKGBVbmtub3duIGVuY29kaW5nOiAke21hdGNoWzFdfWAsIFNlYXJjaEVycm9yQ29kZS51bmtub3duRW5jb2RpbmcpO1xuXHR9XG5cblx0aWYgKGZpcnN0TGluZS5zdGFydHNXaXRoKCdlcnJvciBwYXJzaW5nIGdsb2InKSkge1xuXHRcdC8vIFVwcGVyY2FzZSBmaXJzdCBsZXR0ZXJcblx0XHRyZXR1cm4gbmV3IFNlYXJjaEVycm9yKGZpcnN0TGluZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIGZpcnN0TGluZS5zdWJzdHIoMSksIFNlYXJjaEVycm9yQ29kZS5nbG9iUGFyc2VFcnJvcik7XG5cdH1cblxuXHRpZiAoZmlyc3RMaW5lLnN0YXJ0c1dpdGgoJ3RoZSBsaXRlcmFsJykpIHtcblx0XHQvLyBVcHBlcmNhc2UgZmlyc3QgbGV0dGVyXG5cdFx0cmV0dXJuIG5ldyBTZWFyY2hFcnJvcihmaXJzdExpbmUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyBmaXJzdExpbmUuc3Vic3RyKDEpLCBTZWFyY2hFcnJvckNvZGUuaW52YWxpZExpdGVyYWwpO1xuXHR9XG5cblx0aWYgKGZpcnN0TGluZS5zdGFydHNXaXRoKCdQQ1JFMjogZXJyb3IgY29tcGlsaW5nIHBhdHRlcm4nKSkge1xuXHRcdHJldHVybiBuZXcgU2VhcmNoRXJyb3IoZmlyc3RMaW5lLCBTZWFyY2hFcnJvckNvZGUucmVnZXhQYXJzZUVycm9yKTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUmVnZXhQYXJzZUVycm9yKGxpbmVzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGNvbnN0IGVycm9yTWVzc2FnZTogc3RyaW5nW10gPSBbJ1JlZ2V4IHBhcnNlIGVycm9yJ107XG5cdGNvbnN0IHBjcmUyRXJyb3JMaW5lID0gbGluZXMuZmlsdGVyKGwgPT4gKGwuc3RhcnRzV2l0aCgnUENSRTI6JykpKTtcblx0aWYgKHBjcmUyRXJyb3JMaW5lLmxlbmd0aCA+PSAxKSB7XG5cdFx0Y29uc3QgcGNyZTJFcnJvck1lc3NhZ2UgPSBwY3JlMkVycm9yTGluZVswXS5yZXBsYWNlKCdQQ1JFMjonLCAnJyk7XG5cdFx0aWYgKHBjcmUyRXJyb3JNZXNzYWdlLmluZGV4T2YoJzonKSAhPT0gLTEgJiYgcGNyZTJFcnJvck1lc3NhZ2Uuc3BsaXQoJzonKS5sZW5ndGggPj0gMikge1xuXHRcdFx0Y29uc3QgcGNyZTJBY3R1YWxFcnJvck1lc3NhZ2UgPSBwY3JlMkVycm9yTWVzc2FnZS5zcGxpdCgnOicpWzFdO1xuXHRcdFx0ZXJyb3JNZXNzYWdlLnB1c2goJzonICsgcGNyZTJBY3R1YWxFcnJvck1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBlcnJvck1lc3NhZ2Uuam9pbignJyk7XG59XG5cblxuZXhwb3J0IGNsYXNzIFJpcGdyZXBQYXJzZXIgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuXHRwcml2YXRlIHJlbWFpbmRlciA9ICcnO1xuXHRwcml2YXRlIGlzRG9uZSA9IGZhbHNlO1xuXHRwcml2YXRlIGhpdExpbWl0ID0gZmFsc2U7XG5cdHByaXZhdGUgc3RyaW5nRGVjb2RlcjogU3RyaW5nRGVjb2RlcjtcblxuXHRwcml2YXRlIG51bVJlc3VsdHMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbWF4UmVzdWx0czogbnVtYmVyLCBwcml2YXRlIHJvb3Q6IFVSSSwgcHJpdmF0ZSBwcmV2aWV3T3B0aW9uczogSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zdHJpbmdEZWNvZGVyID0gbmV3IFN0cmluZ0RlY29kZXIoKTtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRG9uZSA9IHRydWU7XG5cdH1cblxuXHRmbHVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZURlY29kZWREYXRhKHRoaXMuc3RyaW5nRGVjb2Rlci5lbmQoKSk7XG5cdH1cblxuXG5cdG92ZXJyaWRlIG9uKGV2ZW50OiAncmVzdWx0JywgbGlzdGVuZXI6IChyZXN1bHQ6IFRleHRTZWFyY2hSZXN1bHQyKSA9PiB2b2lkKTogdGhpcztcblx0b3ZlcnJpZGUgb24oZXZlbnQ6ICdoaXRMaW1pdCcsIGxpc3RlbmVyOiAoKSA9PiB2b2lkKTogdGhpcztcblx0b3ZlcnJpZGUgb24oZXZlbnQ6IHN0cmluZywgbGlzdGVuZXI6ICguLi5hcmdzOiBhbnlbXSkgPT4gdm9pZCk6IHRoaXMge1xuXHRcdHN1cGVyLm9uKGV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRoYW5kbGVEYXRhKGRhdGE6IEJ1ZmZlciB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzRG9uZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGFTdHIgPSB0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycgPyBkYXRhIDogdGhpcy5zdHJpbmdEZWNvZGVyLndyaXRlKGRhdGEpO1xuXHRcdHRoaXMuaGFuZGxlRGVjb2RlZERhdGEoZGF0YVN0cik7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURlY29kZWREYXRhKGRlY29kZWREYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBjaGVjayBmb3IgbmV3bGluZSBiZWZvcmUgYXBwZW5kaW5nIHRvIHJlbWFpbmRlclxuXHRcdGxldCBuZXdsaW5lSWR4ID0gZGVjb2RlZERhdGEuaW5kZXhPZignXFxuJyk7XG5cblx0XHQvLyBJZiB0aGUgcHJldmlvdXMgZGF0YSBjaHVuayBkaWRuJ3QgZW5kIGluIGEgbmV3bGluZSwgcHJlcGVuZCBpdCB0byB0aGlzIGNodW5rXG5cdFx0Y29uc3QgZGF0YVN0ciA9IHRoaXMucmVtYWluZGVyICsgZGVjb2RlZERhdGE7XG5cblx0XHRpZiAobmV3bGluZUlkeCA+PSAwKSB7XG5cdFx0XHRuZXdsaW5lSWR4ICs9IHRoaXMucmVtYWluZGVyLmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gU2hvcnRjdXRcblx0XHRcdHRoaXMucmVtYWluZGVyID0gZGF0YVN0cjtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcHJldklkeCA9IDA7XG5cdFx0d2hpbGUgKG5ld2xpbmVJZHggPj0gMCkge1xuXHRcdFx0dGhpcy5oYW5kbGVMaW5lKGRhdGFTdHIuc3Vic3RyaW5nKHByZXZJZHgsIG5ld2xpbmVJZHgpLnRyaW0oKSk7XG5cdFx0XHRwcmV2SWR4ID0gbmV3bGluZUlkeCArIDE7XG5cdFx0XHRuZXdsaW5lSWR4ID0gZGF0YVN0ci5pbmRleE9mKCdcXG4nLCBwcmV2SWR4KTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbWFpbmRlciA9IGRhdGFTdHIuc3Vic3RyaW5nKHByZXZJZHgpO1xuXHR9XG5cblxuXHRwcml2YXRlIGhhbmRsZUxpbmUob3V0cHV0TGluZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNEb25lIHx8ICFvdXRwdXRMaW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHBhcnNlZExpbmU6IElSZ01lc3NhZ2U7XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZExpbmUgPSBKU09OLnBhcnNlKG91dHB1dExpbmUpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgbWFsZm9ybWVkIGxpbmUgZnJvbSByZzogJHtvdXRwdXRMaW5lfWApO1xuXHRcdH1cblxuXHRcdGlmIChwYXJzZWRMaW5lLnR5cGUgPT09ICdtYXRjaCcpIHtcblx0XHRcdGNvbnN0IG1hdGNoUGF0aCA9IGJ5dGVzT3JUZXh0VG9TdHJpbmcocGFyc2VkTGluZS5kYXRhLnBhdGgpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmpvaW5QYXRoKHRoaXMucm9vdCwgbWF0Y2hQYXRoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY3JlYXRlVGV4dFNlYXJjaE1hdGNoKHBhcnNlZExpbmUuZGF0YSwgdXJpKTtcblx0XHRcdHRoaXMub25SZXN1bHQocmVzdWx0KTtcblxuXHRcdFx0aWYgKHRoaXMuaGl0TGltaXQpIHtcblx0XHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5lbWl0KCdoaXRMaW1pdCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocGFyc2VkTGluZS50eXBlID09PSAnY29udGV4dCcpIHtcblx0XHRcdGNvbnN0IGNvbnRleHRQYXRoID0gYnl0ZXNPclRleHRUb1N0cmluZyhwYXJzZWRMaW5lLmRhdGEucGF0aCk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuam9pblBhdGgodGhpcy5yb290LCBjb250ZXh0UGF0aCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNyZWF0ZVRleHRTZWFyY2hDb250ZXh0cyhwYXJzZWRMaW5lLmRhdGEsIHVyaSk7XG5cdFx0XHRyZXN1bHQuZm9yRWFjaChyID0+IHRoaXMub25SZXN1bHQocikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGV4dFNlYXJjaE1hdGNoKGRhdGE6IElSZ01hdGNoLCB1cmk6IFVSSSk6IFRleHRTZWFyY2hNYXRjaDIge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBkYXRhLmxpbmVfbnVtYmVyIC0gMTtcblx0XHRjb25zdCBmdWxsVGV4dCA9IGJ5dGVzT3JUZXh0VG9TdHJpbmcoZGF0YS5saW5lcyk7XG5cdFx0Y29uc3QgZnVsbFRleHRCeXRlcyA9IEJ1ZmZlci5mcm9tKGZ1bGxUZXh0KTtcblxuXHRcdGxldCBwcmV2TWF0Y2hFbmQgPSAwO1xuXHRcdGxldCBwcmV2TWF0Y2hFbmRDb2wgPSAwO1xuXHRcdGxldCBwcmV2TWF0Y2hFbmRMaW5lID0gbGluZU51bWJlcjtcblxuXHRcdC8vIGl0IGxvb2tzIGxpa2UgY2VydGFpbiByZWdleGVzIGNhbiBtYXRjaCBhIGxpbmUsIGJ1dCBjYXVzZSByZyB0byBub3Rcblx0XHQvLyBlbWl0IGFueSBzcGVjaWZpYyBzdWJtYXRjaGVzIGZvciB0aGF0IGxpbmUuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwMDU2OSNpc3N1ZWNvbW1lbnQtNzM4NDk2OTkxXG5cdFx0aWYgKGRhdGEuc3VibWF0Y2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGRhdGEuc3VibWF0Y2hlcy5wdXNoKFxuXHRcdFx0XHRmdWxsVGV4dC5sZW5ndGhcblx0XHRcdFx0XHQ/IHsgc3RhcnQ6IDAsIGVuZDogMSwgbWF0Y2g6IHsgdGV4dDogZnVsbFRleHRbMF0gfSB9XG5cdFx0XHRcdFx0OiB7IHN0YXJ0OiAwLCBlbmQ6IDAsIG1hdGNoOiB7IHRleHQ6ICcnIH0gfVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZXMgPSBjb2FsZXNjZShkYXRhLnN1Ym1hdGNoZXMubWFwKChtYXRjaCwgaSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaGl0TGltaXQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubnVtUmVzdWx0cysrO1xuXHRcdFx0aWYgKHRoaXMubnVtUmVzdWx0cyA+PSB0aGlzLm1heFJlc3VsdHMpIHtcblx0XHRcdFx0Ly8gRmluaXNoIHRoZSBsaW5lLCB0aGVuIHJlcG9ydCB0aGUgcmVzdWx0IGJlbG93XG5cdFx0XHRcdHRoaXMuaGl0TGltaXQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXRjaFRleHQgPSBieXRlc09yVGV4dFRvU3RyaW5nKG1hdGNoLm1hdGNoKTtcblxuXHRcdFx0Y29uc3QgaW5CZXR3ZWVuVGV4dCA9IGZ1bGxUZXh0Qnl0ZXMuc2xpY2UocHJldk1hdGNoRW5kLCBtYXRjaC5zdGFydCkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGluQmV0d2VlblN0YXRzID0gZ2V0TnVtTGluZXNBbmRMYXN0TmV3bGluZUxlbmd0aChpbkJldHdlZW5UZXh0KTtcblx0XHRcdGNvbnN0IHN0YXJ0Q29sID0gaW5CZXR3ZWVuU3RhdHMubnVtTGluZXMgPiAwID9cblx0XHRcdFx0aW5CZXR3ZWVuU3RhdHMubGFzdExpbmVMZW5ndGggOlxuXHRcdFx0XHRpbkJldHdlZW5TdGF0cy5sYXN0TGluZUxlbmd0aCArIHByZXZNYXRjaEVuZENvbDtcblxuXHRcdFx0Y29uc3Qgc3RhdHMgPSBnZXROdW1MaW5lc0FuZExhc3ROZXdsaW5lTGVuZ3RoKG1hdGNoVGV4dCk7XG5cdFx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBpbkJldHdlZW5TdGF0cy5udW1MaW5lcyArIHByZXZNYXRjaEVuZExpbmU7XG5cdFx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gc3RhdHMubnVtTGluZXMgKyBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRDb2wgPSBzdGF0cy5udW1MaW5lcyA+IDAgP1xuXHRcdFx0XHRzdGF0cy5sYXN0TGluZUxlbmd0aCA6XG5cdFx0XHRcdHN0YXRzLmxhc3RMaW5lTGVuZ3RoICsgc3RhcnRDb2w7XG5cblx0XHRcdHByZXZNYXRjaEVuZCA9IG1hdGNoLmVuZDtcblx0XHRcdHByZXZNYXRjaEVuZENvbCA9IGVuZENvbDtcblx0XHRcdHByZXZNYXRjaEVuZExpbmUgPSBlbmRMaW5lTnVtYmVyO1xuXG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2wsIGVuZExpbmVOdW1iZXIsIGVuZENvbCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoUmFuZ2UgPSBtYXBBcnJheU9yTm90KDxSYW5nZVtdPnJhbmdlcywgcmFuZ2VUb1NlYXJjaFJhbmdlKTtcblxuXHRcdGNvbnN0IGludGVybmFsUmVzdWx0ID0gbmV3IFRleHRTZWFyY2hNYXRjaChmdWxsVGV4dCwgc2VhcmNoUmFuZ2UsIHRoaXMucHJldmlld09wdGlvbnMpO1xuXHRcdHJldHVybiBuZXcgVGV4dFNlYXJjaE1hdGNoMihcblx0XHRcdHVyaSxcblx0XHRcdGludGVybmFsUmVzdWx0LnJhbmdlTG9jYXRpb25zLm1hcChlID0+IChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNvdXJjZVJhbmdlOiBzZWFyY2hSYW5nZVRvUmFuZ2UoZS5zb3VyY2UpLFxuXHRcdFx0XHRcdHByZXZpZXdSYW5nZTogc2VhcmNoUmFuZ2VUb1JhbmdlKGUucHJldmlldyksXG5cdFx0XHRcdH1cblx0XHRcdCkpLFxuXHRcdFx0aW50ZXJuYWxSZXN1bHQucHJldmlld1RleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUZXh0U2VhcmNoQ29udGV4dHMoZGF0YTogSVJnTWF0Y2gsIHVyaTogVVJJKTogVGV4dFNlYXJjaENvbnRleHQyW10ge1xuXHRcdGNvbnN0IHRleHQgPSBieXRlc09yVGV4dFRvU3RyaW5nKGRhdGEubGluZXMpO1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IGRhdGEubGluZV9udW1iZXI7XG5cdFx0cmV0dXJuIHRleHRcblx0XHRcdC5yZXBsYWNlKC9cXHI/XFxuJC8sICcnKVxuXHRcdFx0LnNwbGl0KCdcXG4nKVxuXHRcdFx0Lm1hcCgobGluZSwgaSkgPT4gbmV3IFRleHRTZWFyY2hDb250ZXh0Mih1cmksIGxpbmUsIHN0YXJ0TGluZSArIGkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25SZXN1bHQobWF0Y2g6IFRleHRTZWFyY2hSZXN1bHQyKTogdm9pZCB7XG5cdFx0dGhpcy5lbWl0KCdyZXN1bHQnLCBtYXRjaCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYnl0ZXNPclRleHRUb1N0cmluZyhvYmo6IGFueSk6IHN0cmluZyB7XG5cdHJldHVybiBvYmouYnl0ZXMgP1xuXHRcdEJ1ZmZlci5mcm9tKG9iai5ieXRlcywgJ2Jhc2U2NCcpLnRvU3RyaW5nKCkgOlxuXHRcdG9iai50ZXh0O1xufVxuXG5mdW5jdGlvbiBnZXROdW1MaW5lc0FuZExhc3ROZXdsaW5lTGVuZ3RoKHRleHQ6IHN0cmluZyk6IHsgbnVtTGluZXM6IG51bWJlcjsgbGFzdExpbmVMZW5ndGg6IG51bWJlciB9IHtcblx0Y29uc3QgcmUgPSAvXFxuL2c7XG5cdGxldCBudW1MaW5lcyA9IDA7XG5cdGxldCBsYXN0TmV3bGluZUlkeCA9IC0xO1xuXHRsZXQgbWF0Y2g6IFJldHVyblR5cGU8dHlwZW9mIHJlLmV4ZWM+O1xuXHR3aGlsZSAobWF0Y2ggPSByZS5leGVjKHRleHQpKSB7XG5cdFx0bnVtTGluZXMrKztcblx0XHRsYXN0TmV3bGluZUlkeCA9IG1hdGNoLmluZGV4O1xuXHR9XG5cblx0Y29uc3QgbGFzdExpbmVMZW5ndGggPSBsYXN0TmV3bGluZUlkeCA+PSAwID9cblx0XHR0ZXh0Lmxlbmd0aCAtIGxhc3ROZXdsaW5lSWR4IC0gMSA6XG5cdFx0dGV4dC5sZW5ndGg7XG5cblx0cmV0dXJuIHsgbnVtTGluZXMsIGxhc3RMaW5lTGVuZ3RoIH07XG59XG5cbi8vIGV4cG9ydGVkIGZvciB0ZXN0aW5nXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmdBcmdzKHF1ZXJ5OiBUZXh0U2VhcmNoUXVlcnkyLCBvcHRpb25zOiBSaXBncmVwVGV4dFNlYXJjaE9wdGlvbnMpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGFyZ3MgPSBbJy0taGlkZGVuJywgJy0tbm8tcmVxdWlyZS1naXQnXTtcblx0YXJncy5wdXNoKHF1ZXJ5LmlzQ2FzZVNlbnNpdGl2ZSA/ICctLWNhc2Utc2Vuc2l0aXZlJyA6ICctLWlnbm9yZS1jYXNlJyk7XG5cblx0aWYgKG9wdGlvbnMuZm9sZGVyT3B0aW9ucy5pZ25vcmVHbG9iQ2FzZSkge1xuXHRcdGFyZ3MucHVzaCgnLS1nbG9iLWNhc2UtaW5zZW5zaXRpdmUnKTtcblx0XHRhcmdzLnB1c2goJy0taWdub3JlLWZpbGUtY2FzZS1pbnNlbnNpdGl2ZScpO1xuXHR9XG5cblx0Y29uc3QgeyBkb3VibGVTdGFySW5jbHVkZXMsIG90aGVySW5jbHVkZXMgfSA9IGdyb3VwQnkoXG5cdFx0b3B0aW9ucy5mb2xkZXJPcHRpb25zLmluY2x1ZGVzLFxuXHRcdChpbmNsdWRlOiBzdHJpbmcpID0+IGluY2x1ZGUuc3RhcnRzV2l0aCgnKionKSA/ICdkb3VibGVTdGFySW5jbHVkZXMnIDogJ290aGVySW5jbHVkZXMnKTtcblxuXHRpZiAob3RoZXJJbmNsdWRlcyAmJiBvdGhlckluY2x1ZGVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHVuaXF1ZU90aGVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdG90aGVySW5jbHVkZXMuZm9yRWFjaChvdGhlciA9PiB7IHVuaXF1ZU90aGVycy5hZGQob3RoZXIpOyB9KTtcblxuXHRcdGFyZ3MucHVzaCgnLWcnLCAnISonKTtcblx0XHR1bmlxdWVPdGhlcnNcblx0XHRcdC5mb3JFYWNoKG90aGVySW5jdWRlID0+IHtcblx0XHRcdFx0c3ByZWFkR2xvYkNvbXBvbmVudHMob3RoZXJJbmN1ZGUpXG5cdFx0XHRcdFx0Lm1hcChhbmNob3JHbG9iKVxuXHRcdFx0XHRcdC5mb3JFYWNoKGdsb2JBcmcgPT4ge1xuXHRcdFx0XHRcdFx0YXJncy5wdXNoKCctZycsIGdsb2JBcmcpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRpZiAoZG91YmxlU3RhckluY2x1ZGVzICYmIGRvdWJsZVN0YXJJbmNsdWRlcy5sZW5ndGgpIHtcblx0XHRkb3VibGVTdGFySW5jbHVkZXMuZm9yRWFjaChnbG9iQXJnID0+IHtcblx0XHRcdGFyZ3MucHVzaCgnLWcnLCBnbG9iQXJnKTtcblx0XHR9KTtcblx0fVxuXG5cdG9wdGlvbnMuZm9sZGVyT3B0aW9ucy5leGNsdWRlcy5tYXAoZSA9PiB0eXBlb2YgKGUpID09PSAnc3RyaW5nJyA/IGUgOiBlLnBhdHRlcm4pXG5cdFx0Lm1hcChhbmNob3JHbG9iKVxuXHRcdC5mb3JFYWNoKHJnR2xvYiA9PiBhcmdzLnB1c2goJy1nJywgYCEke3JnR2xvYn1gKSk7XG5cblx0aWYgKG9wdGlvbnMubWF4RmlsZVNpemUpIHtcblx0XHRhcmdzLnB1c2goJy0tbWF4LWZpbGVzaXplJywgb3B0aW9ucy5tYXhGaWxlU2l6ZSArICcnKTtcblx0fVxuXG5cdGlmIChvcHRpb25zLmZvbGRlck9wdGlvbnMudXNlSWdub3JlRmlsZXMubG9jYWwpIHtcblx0XHRpZiAoIW9wdGlvbnMuZm9sZGVyT3B0aW9ucy51c2VJZ25vcmVGaWxlcy5wYXJlbnQpIHtcblx0XHRcdGFyZ3MucHVzaCgnLS1uby1pZ25vcmUtcGFyZW50Jyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIERvbid0IHVzZSAuZ2l0aWdub3JlIG9yIC5pZ25vcmVcblx0XHRhcmdzLnB1c2goJy0tbm8taWdub3JlJyk7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5mb2xkZXJPcHRpb25zLmZvbGxvd1N5bWxpbmtzKSB7XG5cdFx0YXJncy5wdXNoKCctLWZvbGxvdycpO1xuXHR9XG5cblx0aWYgKG9wdGlvbnMuZm9sZGVyT3B0aW9ucy5lbmNvZGluZyAmJiBvcHRpb25zLmZvbGRlck9wdGlvbnMuZW5jb2RpbmcgIT09ICd1dGY4Jykge1xuXHRcdGFyZ3MucHVzaCgnLS1lbmNvZGluZycsIG9wdGlvbnMuZm9sZGVyT3B0aW9ucy5lbmNvZGluZyk7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5udW1UaHJlYWRzKSB7XG5cdFx0YXJncy5wdXNoKCctLXRocmVhZHMnLCBgJHtvcHRpb25zLm51bVRocmVhZHN9YCk7XG5cdH1cblxuXHQvLyBSaXBncmVwIGhhbmRsZXMgLS0gYXMgYSAtLSBhcmcgc2VwYXJhdG9yLiBPbmx5IC0tLlxuXHQvLyAtIGlzIG9rLCAtLS0gaXMgb2ssIC0tc29tZS1mbGFnIGlzIGFsc28gb2suIE5lZWQgdG8gc3BlY2lhbCBjYXNlLlxuXHRpZiAocXVlcnkucGF0dGVybiA9PT0gJy0tJykge1xuXHRcdHF1ZXJ5LmlzUmVnRXhwID0gdHJ1ZTtcblx0XHRxdWVyeS5wYXR0ZXJuID0gJ1xcXFwtXFxcXC0nO1xuXHR9XG5cblx0aWYgKHF1ZXJ5LmlzTXVsdGlsaW5lICYmICFxdWVyeS5pc1JlZ0V4cCkge1xuXHRcdHF1ZXJ5LnBhdHRlcm4gPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHF1ZXJ5LnBhdHRlcm4pO1xuXHRcdHF1ZXJ5LmlzUmVnRXhwID0gdHJ1ZTtcblx0fVxuXG5cdC8vIEFsbG93ICQgdG8gbWF0Y2ggL3IvblxuXHRhcmdzLnB1c2goJy0tY3JsZicpO1xuXG5cdGlmIChxdWVyeS5pc1JlZ0V4cCkge1xuXHRcdHF1ZXJ5LnBhdHRlcm4gPSB1bmljb2RlRXNjYXBlc1RvUENSRTIocXVlcnkucGF0dGVybik7XG5cdFx0YXJncy5wdXNoKCctLWVuZ2luZScsICdhdXRvJyk7XG5cdH1cblxuXHRsZXQgc2VhcmNoUGF0dGVybkFmdGVyRG91YmxlRGFzaGVzOiBNYXliZTxzdHJpbmc+O1xuXHRpZiAocXVlcnkuaXNXb3JkTWF0Y2gpIHtcblx0XHRjb25zdCByZWdleHAgPSBjcmVhdGVSZWdFeHAocXVlcnkucGF0dGVybiwgISFxdWVyeS5pc1JlZ0V4cCwgeyB3aG9sZVdvcmQ6IHF1ZXJ5LmlzV29yZE1hdGNoIH0pO1xuXHRcdGNvbnN0IHJlZ2V4cFN0ciA9IHJlZ2V4cC5zb3VyY2UucmVwbGFjZSgvXFxcXFxcLy9nLCAnLycpOyAvLyBSZWdFeHAuc291cmNlIGFyYml0cmFyaWx5IHJldHVybnMgZXNjYXBlZCBzbGFzaGVzLiBTZWFyY2ggYW5kIGRlc3Ryb3kuXG5cdFx0YXJncy5wdXNoKCctLXJlZ2V4cCcsIHJlZ2V4cFN0cik7XG5cdH0gZWxzZSBpZiAocXVlcnkuaXNSZWdFeHApIHtcblx0XHRsZXQgZml4ZWRSZWdleHBRdWVyeSA9IGZpeFJlZ2V4TmV3bGluZShxdWVyeS5wYXR0ZXJuKTtcblx0XHRmaXhlZFJlZ2V4cFF1ZXJ5ID0gZml4TmV3bGluZShmaXhlZFJlZ2V4cFF1ZXJ5KTtcblx0XHRhcmdzLnB1c2goJy0tcmVnZXhwJywgZml4ZWRSZWdleHBRdWVyeSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VhcmNoUGF0dGVybkFmdGVyRG91YmxlRGFzaGVzID0gcXVlcnkucGF0dGVybjtcblx0XHRhcmdzLnB1c2goJy0tZml4ZWQtc3RyaW5ncycpO1xuXHR9XG5cblx0YXJncy5wdXNoKCctLW5vLWNvbmZpZycpO1xuXHRpZiAoIW9wdGlvbnMuZm9sZGVyT3B0aW9ucy51c2VJZ25vcmVGaWxlcy5nbG9iYWwpIHtcblx0XHRhcmdzLnB1c2goJy0tbm8taWdub3JlLWdsb2JhbCcpO1xuXHR9XG5cblx0YXJncy5wdXNoKCctLWpzb24nKTtcblxuXHRpZiAocXVlcnkuaXNNdWx0aWxpbmUpIHtcblx0XHRhcmdzLnB1c2goJy0tbXVsdGlsaW5lJyk7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5zdXJyb3VuZGluZ0NvbnRleHQpIHtcblx0XHRhcmdzLnB1c2goJy0tYmVmb3JlLWNvbnRleHQnLCBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCArICcnKTtcblx0XHRhcmdzLnB1c2goJy0tYWZ0ZXItY29udGV4dCcsIG9wdGlvbnMuc3Vycm91bmRpbmdDb250ZXh0ICsgJycpO1xuXHR9XG5cblx0Ly8gRm9sZGVyIHRvIHNlYXJjaFxuXHRhcmdzLnB1c2goJy0tJyk7XG5cblx0aWYgKHNlYXJjaFBhdHRlcm5BZnRlckRvdWJsZURhc2hlcykge1xuXHRcdC8vIFB1dCB0aGUgcXVlcnkgYWZ0ZXIgLS0sIGluIGNhc2UgdGhlIHF1ZXJ5IHN0YXJ0cyB3aXRoIGEgZGFzaFxuXHRcdGFyZ3MucHVzaChzZWFyY2hQYXR0ZXJuQWZ0ZXJEb3VibGVEYXNoZXMpO1xuXHR9XG5cblx0YXJncy5wdXNoKCcuJyk7XG5cblx0cmV0dXJuIGFyZ3M7XG59XG5cbi8qKlxuICogYFwiZm9vLypiYXIvc29tZXRoaW5nXCJgIC0+IGBbXCJmb29cIiwgXCJmb28vKmJhclwiLCBcImZvby8qYmFyL3NvbWV0aGluZ1wiLCBcImZvby8qYmFyL3NvbWV0aGluZy8qKlwiXWBcbiAqL1xuZnVuY3Rpb24gc3ByZWFkR2xvYkNvbXBvbmVudHMoZ2xvYkNvbXBvbmVudDogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCBnbG9iQ29tcG9uZW50V2l0aEJyYWNlRXhwYW5zaW9uID0gcGVyZm9ybUJyYWNlRXhwYW5zaW9uRm9yUmlwZ3JlcChnbG9iQ29tcG9uZW50KTtcblxuXHRyZXR1cm4gZ2xvYkNvbXBvbmVudFdpdGhCcmFjZUV4cGFuc2lvbi5mbGF0TWFwKChnbG9iQXJnKSA9PiB7XG5cdFx0Y29uc3QgY29tcG9uZW50cyA9IHNwbGl0R2xvYkF3YXJlKGdsb2JBcmcsICcvJyk7XG5cdFx0cmV0dXJuIGNvbXBvbmVudHMubWFwKChfLCBpKSA9PiBjb21wb25lbnRzLnNsaWNlKDAsIGkgKyAxKS5qb2luKCcvJykpO1xuXHR9KTtcblxufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5pY29kZUVzY2FwZXNUb1BDUkUyKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdC8vIE1hdGNoIFxcdTEyMzRcblx0Y29uc3QgdW5pY29kZVBhdHRlcm4gPSAvKCg/OlteXFxcXF18XikoPzpcXFxcXFxcXCkqKVxcXFx1KFthLXowLTldezR9KS9naTtcblxuXHR3aGlsZSAocGF0dGVybi5tYXRjaCh1bmljb2RlUGF0dGVybikpIHtcblx0XHRwYXR0ZXJuID0gcGF0dGVybi5yZXBsYWNlKHVuaWNvZGVQYXR0ZXJuLCBgJDFcXFxceHskMn1gKTtcblx0fVxuXG5cdC8vIE1hdGNoIFxcdXsxMjM0fVxuXHQvLyBcXHUgd2l0aCA1LTYgY2hhcmFjdGVycyB3aWxsIGJlIGxlZnQgYWxvbmUgYmVjYXVzZSBcXHggb25seSB0YWtlcyA0IGNoYXJhY3RlcnMuXG5cdGNvbnN0IHVuaWNvZGVQYXR0ZXJuV2l0aEJyYWNlcyA9IC8oKD86W15cXFxcXXxeKSg/OlxcXFxcXFxcKSopXFxcXHVcXHsoW2EtejAtOV17NH0pXFx9L2dpO1xuXHR3aGlsZSAocGF0dGVybi5tYXRjaCh1bmljb2RlUGF0dGVybldpdGhCcmFjZXMpKSB7XG5cdFx0cGF0dGVybiA9IHBhdHRlcm4ucmVwbGFjZSh1bmljb2RlUGF0dGVybldpdGhCcmFjZXMsIGAkMVxcXFx4eyQyfWApO1xuXHR9XG5cblx0cmV0dXJuIHBhdHRlcm47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJnTWVzc2FnZSB7XG5cdHR5cGU6ICdtYXRjaCcgfCAnY29udGV4dCcgfCBzdHJpbmc7XG5cdGRhdGE6IElSZ01hdGNoO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZ01hdGNoIHtcblx0cGF0aDogSVJnQnl0ZXNPclRleHQ7XG5cdGxpbmVzOiBJUmdCeXRlc09yVGV4dDtcblx0bGluZV9udW1iZXI6IG51bWJlcjtcblx0YWJzb2x1dGVfb2Zmc2V0OiBudW1iZXI7XG5cdHN1Ym1hdGNoZXM6IElSZ1N1Ym1hdGNoW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJnU3VibWF0Y2gge1xuXHRtYXRjaDogSVJnQnl0ZXNPclRleHQ7XG5cdHN0YXJ0OiBudW1iZXI7XG5cdGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBJUmdCeXRlc09yVGV4dCA9IHsgYnl0ZXM6IHN0cmluZyB9IHwgeyB0ZXh0OiBzdHJpbmcgfTtcblxuY29uc3QgaXNMb29rQmVoaW5kID0gKG5vZGU6IFJlQVNULk5vZGUpID0+IG5vZGUudHlwZSA9PT0gJ0Fzc2VydGlvbicgJiYgbm9kZS5raW5kID09PSAnbG9va2JlaGluZCc7XG5cbmV4cG9ydCBmdW5jdGlvbiBmaXhSZWdleE5ld2xpbmUocGF0dGVybjogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gd2UgcGFyc2UgdGhlIHBhdHRlcm4gYW5ldyBlYWNoIHRpZW1cblx0bGV0IHJlOiBSZUFTVC5QYXR0ZXJuO1xuXHR0cnkge1xuXHRcdHJlID0gbmV3IFJlZ0V4cFBhcnNlcigpLnBhcnNlUGF0dGVybihwYXR0ZXJuKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHBhdHRlcm47XG5cdH1cblxuXHRsZXQgb3V0cHV0ID0gJyc7XG5cdGxldCBsYXN0RW1pdHRlZEluZGV4ID0gMDtcblx0Y29uc3QgcmVwbGFjZSA9IChzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgdGV4dDogc3RyaW5nKSA9PiB7XG5cdFx0b3V0cHV0ICs9IHBhdHRlcm4uc2xpY2UobGFzdEVtaXR0ZWRJbmRleCwgc3RhcnQpICsgdGV4dDtcblx0XHRsYXN0RW1pdHRlZEluZGV4ID0gZW5kO1xuXHR9O1xuXG5cdGNvbnN0IGNvbnRleHQ6IFJlQVNULk5vZGVbXSA9IFtdO1xuXHRjb25zdCB2aXNpdG9yID0gbmV3IFJlZ0V4cFZpc2l0b3Ioe1xuXHRcdG9uQ2hhcmFjdGVyRW50ZXIoY2hhcikge1xuXHRcdFx0aWYgKGNoYXIucmF3ICE9PSAnXFxcXG4nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFyZW50ID0gY29udGV4dFswXTtcblx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdC8vIHNpbXBsZSBjaGFyLCBcXG4gLT4gXFxyP1xcblxuXHRcdFx0XHRyZXBsYWNlKGNoYXIuc3RhcnQsIGNoYXIuZW5kLCAnXFxcXHI/XFxcXG4nKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGV4dC5zb21lKGlzTG9va0JlaGluZCkpIHtcblx0XHRcdFx0Ly8gbm8tb3AgaW4gYSBsb29rYmVoaW5kLCBzZWUgIzEwMDU2OVxuXHRcdFx0fSBlbHNlIGlmIChwYXJlbnQudHlwZSA9PT0gJ0NoYXJhY3RlckNsYXNzJykge1xuXHRcdFx0XHRpZiAocGFyZW50Lm5lZ2F0ZSkge1xuXHRcdFx0XHRcdC8vIG5lZ2F0aXZlIGJyYWNrZXQgZXhwciwgW15hLXpcXG5dIC0+ICg/IVthLXpdfFxccj9cXG4pXG5cdFx0XHRcdFx0Y29uc3Qgb3RoZXJDb250ZW50ID0gcGF0dGVybi5zbGljZShwYXJlbnQuc3RhcnQgKyAyLCBjaGFyLnN0YXJ0KSArIHBhdHRlcm4uc2xpY2UoY2hhci5lbmQsIHBhcmVudC5lbmQgLSAxKTtcblx0XHRcdFx0XHRpZiAocGFyZW50LnBhcmVudD8udHlwZSA9PT0gJ1F1YW50aWZpZXInKSB7XG5cdFx0XHRcdFx0XHQvLyBJZiBxdWFudGlmaWVkLCB3ZSBjYW4ndCB1c2UgYSBuZWdhdGl2ZSBsb29rYWhlYWQgaW4gYSBxdWFudGlmaWVyLlxuXHRcdFx0XHRcdFx0Ly8gQnV0IGAuYCBhbHJlYWR5IGRvZXNuJ3QgbWF0Y2ggbmV3IGxpbmVzLCBzbyB3ZSBjYW4ganVzdCB1c2UgdGhhdFxuXHRcdFx0XHRcdFx0Ly8gKHdpdGggYW55IG90aGVyIG5lZ2F0aW9ucykgaW5zdGVhZC5cblx0XHRcdFx0XHRcdHJlcGxhY2UocGFyZW50LnN0YXJ0LCBwYXJlbnQuZW5kLCBvdGhlckNvbnRlbnQgPyBgW14ke290aGVyQ29udGVudH1dYCA6ICcuJyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlcGxhY2UocGFyZW50LnN0YXJ0LCBwYXJlbnQuZW5kLCAnKD8hXFxcXHI/XFxcXG4nICsgKG90aGVyQ29udGVudCA/IGB8WyR7b3RoZXJDb250ZW50fV1gIDogJycpICsgJyknKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gcG9zaXRpdmUgYnJhY2tldCBleHByLCBbYS16XFxuXSAtPiAoPzpbYS16XXxcXHI/XFxuKVxuXHRcdFx0XHRcdGNvbnN0IG90aGVyQ29udGVudCA9IHBhdHRlcm4uc2xpY2UocGFyZW50LnN0YXJ0ICsgMSwgY2hhci5zdGFydCkgKyBwYXR0ZXJuLnNsaWNlKGNoYXIuZW5kLCBwYXJlbnQuZW5kIC0gMSk7XG5cdFx0XHRcdFx0cmVwbGFjZShwYXJlbnQuc3RhcnQsIHBhcmVudC5lbmQsIG90aGVyQ29udGVudCA9PT0gJycgPyAnXFxcXHI/XFxcXG4nIDogYCg/Olske290aGVyQ29udGVudH1dfFxcXFxyP1xcXFxuKWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcmVudC50eXBlID09PSAnUXVhbnRpZmllcicpIHtcblx0XHRcdFx0cmVwbGFjZShjaGFyLnN0YXJ0LCBjaGFyLmVuZCwgJyg/OlxcXFxyP1xcXFxuKScpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25RdWFudGlmaWVyRW50ZXIobm9kZSkge1xuXHRcdFx0Y29udGV4dC51bnNoaWZ0KG5vZGUpO1xuXHRcdH0sXG5cdFx0b25RdWFudGlmaWVyTGVhdmUoKSB7XG5cdFx0XHRjb250ZXh0LnNoaWZ0KCk7XG5cdFx0fSxcblx0XHRvbkNoYXJhY3RlckNsYXNzUmFuZ2VFbnRlcihub2RlKSB7XG5cdFx0XHRjb250ZXh0LnVuc2hpZnQobm9kZSk7XG5cdFx0fSxcblx0XHRvbkNoYXJhY3RlckNsYXNzUmFuZ2VMZWF2ZSgpIHtcblx0XHRcdGNvbnRleHQuc2hpZnQoKTtcblx0XHR9LFxuXHRcdG9uQ2hhcmFjdGVyQ2xhc3NFbnRlcihub2RlKSB7XG5cdFx0XHRjb250ZXh0LnVuc2hpZnQobm9kZSk7XG5cdFx0fSxcblx0XHRvbkNoYXJhY3RlckNsYXNzTGVhdmUoKSB7XG5cdFx0XHRjb250ZXh0LnNoaWZ0KCk7XG5cdFx0fSxcblx0XHRvbkFzc2VydGlvbkVudGVyKG5vZGUpIHtcblx0XHRcdGlmIChpc0xvb2tCZWhpbmQobm9kZSkpIHtcblx0XHRcdFx0Y29udGV4dC5wdXNoKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25Bc3NlcnRpb25MZWF2ZShub2RlKSB7XG5cdFx0XHRpZiAoY29udGV4dFswXSA9PT0gbm9kZSkge1xuXHRcdFx0XHRjb250ZXh0LnNoaWZ0KCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fSk7XG5cblx0dmlzaXRvci52aXNpdChyZSk7XG5cdG91dHB1dCArPSBwYXR0ZXJuLnNsaWNlKGxhc3RFbWl0dGVkSW5kZXgpO1xuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZml4TmV3bGluZShwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcGF0dGVybi5yZXBsYWNlKC9cXG4vZywgJ1xcXFxyP1xcXFxuJyk7XG59XG5cbi8vIGJyYWNlIGV4cGFuc2lvbiBmb3IgcmlwZ3JlcFxuXG4vKipcbiAqIFNwbGl0IHN0cmluZyBnaXZlbiBmaXJzdCBvcHBvcnR1bml0eSBmb3IgYnJhY2UgZXhwYW5zaW9uIGluIHRoZSBzdHJpbmcuXG4gKiAtIElmIHRoZSBicmFjZSBpcyBwcmVwZW5kZWQgYnkgYSBcXCBjaGFyYWN0ZXIsIHRoZW4gaXQgaXMgZXNjYXBlZC5cbiAqIC0gRG9lcyBub3QgcHJvY2VzcyBlc2NhcGVzIHRoYXQgYXJlIHdpdGhpbiB0aGUgc3ViLWdsb2IuXG4gKiAtIElmIHR3byB1bmVzY2FwZWQgYHtgIG9jY3VyIGJlZm9yZSBgfWAsIHRoZW4gcmlwZ3JlcCB3aWxsIHJldHVybiBhbiBlcnJvciBmb3IgYnJhY2UgbmVzdGluZywgc28gZG9uJ3Qgc3BsaXQgb24gdGhvc2UuXG4gKi9cbmZ1bmN0aW9uIGdldEVzY2FwZUF3YXJlU3BsaXRTdHJpbmdGb3JSaXBncmVwKHBhdHRlcm46IHN0cmluZyk6IHsgZml4ZWRTdGFydD86IHN0cmluZzsgc3RySW5CcmFjZXM6IHN0cmluZzsgZml4ZWRFbmQ/OiBzdHJpbmcgfSB7XG5cdGxldCBpbkJyYWNlcyA9IGZhbHNlO1xuXHRsZXQgZXNjYXBlZCA9IGZhbHNlO1xuXHRsZXQgZml4ZWRTdGFydCA9ICcnO1xuXHRsZXQgc3RySW5CcmFjZXMgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXR0ZXJuLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3QgY2hhciA9IHBhdHRlcm5baV07XG5cdFx0c3dpdGNoIChjaGFyKSB7XG5cdFx0XHRjYXNlICdcXFxcJzpcblx0XHRcdFx0aWYgKGVzY2FwZWQpIHtcblx0XHRcdFx0XHQvLyBJZiB3ZSdyZSBhbHJlYWR5IGVzY2FwZWQsIHRoZW4ganVzdCBsZWF2ZSB0aGUgZXNjYXBlZCBzbGFzaCBhbmQgdGhlIHByZWNlZWRpbmcgc2xhc2ggdGhhdCBlc2NhcGVzIGl0LlxuXHRcdFx0XHRcdC8vIFRoZSB0d28gZXNjYXBlZCBzbGFzaGVzIHdpbGwgcmVzdWx0IGluIGEgc2luZ2xlIHNsYXNoIGFuZCB3aGF0ZXZlciBwcm9jZXNzZXMgdGhlIGdsb2IgbGF0ZXIgd2lsbCBwcm9wZXJseSBwcm9jZXNzIHRoZSBlc2NhcGVcblx0XHRcdFx0XHRpZiAoaW5CcmFjZXMpIHtcblx0XHRcdFx0XHRcdHN0ckluQnJhY2VzICs9ICdcXFxcJyArIGNoYXI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGZpeGVkU3RhcnQgKz0gJ1xcXFwnICsgY2hhcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZXNjYXBlZCA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVzY2FwZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAneyc6XG5cdFx0XHRcdGlmIChlc2NhcGVkKSB7XG5cdFx0XHRcdFx0Ly8gaWYgd2UgZXNjYXBlZCB0aGlzIG9wZW5pbmcgYnJhY2tldCwgdGhlbiBpdCBpcyB0byBiZSB0YWtlbiBsaXRlcmFsbHkuIFJlbW92ZSB0aGUgYFxcYCBiZWNhdXNlIHdlJ3ZlIGFja25vd2xlZ2VkIGl0IGFuZCBhZGQgdGhlIGB7YCB0byB0aGUgYXBwcm9wcmlhdGUgc3RyaW5nXG5cdFx0XHRcdFx0aWYgKGluQnJhY2VzKSB7XG5cdFx0XHRcdFx0XHRzdHJJbkJyYWNlcyArPSBjaGFyO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRmaXhlZFN0YXJ0ICs9IGNoYXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVzY2FwZWQgPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoaW5CcmFjZXMpIHtcblx0XHRcdFx0XHRcdC8vIHJpcGdyZXAgdHJlYXRzIHRoaXMgYXMgYXR0ZW1wdGluZyB0byBkbyBhIG5lc3RlZCBhbHRlcm5hdGUgZ3JvdXAsIHdoaWNoIGlzIGludmFsaWQuIFJldHVybiB3aXRoIHBhdHRlcm4gaW5jbHVkaW5nIGNoYW5nZXMgZnJvbSBlc2NhcGVkIGJyYWNlcy5cblx0XHRcdFx0XHRcdHJldHVybiB7IHN0ckluQnJhY2VzOiBmaXhlZFN0YXJ0ICsgJ3snICsgc3RySW5CcmFjZXMgKyAneycgKyBwYXR0ZXJuLnN1YnN0cmluZyhpICsgMSkgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aW5CcmFjZXMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ30nOlxuXHRcdFx0XHRpZiAoZXNjYXBlZCkge1xuXHRcdFx0XHRcdC8vIHNhbWUgYXMgYH1gLCBidXQgZm9yIGNsb3NpbmcgYnJhY2tldFxuXHRcdFx0XHRcdGlmIChpbkJyYWNlcykge1xuXHRcdFx0XHRcdFx0c3RySW5CcmFjZXMgKz0gY2hhcjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Zml4ZWRTdGFydCArPSBjaGFyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlc2NhcGVkID0gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW5CcmFjZXMpIHtcblx0XHRcdFx0XHQvLyB3ZSBmb3VuZCBhbiBlbmQgYnJhY2tldCB0byBhIHZhbGlkIG9wZW5pbmcgYnJhY2tldC4gUmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBzdHJpbmdzLlxuXHRcdFx0XHRcdHJldHVybiB7IGZpeGVkU3RhcnQsIHN0ckluQnJhY2VzLCBmaXhlZEVuZDogcGF0dGVybi5zdWJzdHJpbmcoaSArIDEpIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gaWYgd2UncmUgbm90IGluIGJyYWNlcyBhbmQgbm90IGVzY2FwZWQsIHRoZW4gdGhpcyBpcyBhIGxpdGVyYWwgYH1gIGNoYXJhY3RlciBhbmQgd2UncmUgc3RpbGwgYWRkaW5nIHRvIGZpeGVkU3RhcnQuXG5cdFx0XHRcdFx0Zml4ZWRTdGFydCArPSBjaGFyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gc2ltaWxhciB0byB0aGUgYFxcXFxgIGNhc2UsIHdlIGRpZG4ndCBkbyBhbnl0aGluZyB3aXRoIHRoZSBlc2NhcGUsIHNvIHdlIHNob3VsZCByZS1pbnNlcnQgaXQgaW50byB0aGUgYXBwcm9wcmlhdGUgc3RyaW5nXG5cdFx0XHRcdC8vIHRvIGJlIGNvbnN1bWVkIGxhdGVyIHdoZW4gaW5kaXZpZHVhbCBwYXJ0cyBvZiB0aGUgZ2xvYiBhcmUgcHJvY2Vzc2VkXG5cdFx0XHRcdGlmIChpbkJyYWNlcykge1xuXHRcdFx0XHRcdHN0ckluQnJhY2VzICs9IChlc2NhcGVkID8gJ1xcXFwnIDogJycpICsgY2hhcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmaXhlZFN0YXJ0ICs9IChlc2NhcGVkID8gJ1xcXFwnIDogJycpICsgY2hhcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlc2NhcGVkID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cblx0Ly8gd2UgYXJlIGhhdmVuJ3QgaGl0IHRoZSBsYXN0IGJyYWNlLCBzbyBubyBzcGxpdHRpbmcgc2hvdWxkIG9jY3VyLiBSZXR1cm4gd2l0aCBwYXR0ZXJuIGluY2x1ZGluZyBjaGFuZ2VzIGZyb20gZXNjYXBlZCBicmFjZXMuXG5cdHJldHVybiB7IHN0ckluQnJhY2VzOiBmaXhlZFN0YXJ0ICsgKGluQnJhY2VzID8gKCd7JyArIHN0ckluQnJhY2VzKSA6ICcnKSB9O1xufVxuXG4vKipcbiAqIFBhcnNlcyBvdXQgY3VybHkgYnJhY2VzIGFuZCByZXR1cm5zIGVxdWl2YWxlbnQgZ2xvYnMuIE9ubHkgc3VwcG9ydHMgb25lIGxldmVsIG9mIG5lc3RpbmcuXG4gKiBFeHBvcnRlZCBmb3IgdGVzdGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBlcmZvcm1CcmFjZUV4cGFuc2lvbkZvclJpcGdyZXAocGF0dGVybjogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRjb25zdCB7IGZpeGVkU3RhcnQsIHN0ckluQnJhY2VzLCBmaXhlZEVuZCB9ID0gZ2V0RXNjYXBlQXdhcmVTcGxpdFN0cmluZ0ZvclJpcGdyZXAocGF0dGVybik7XG5cdGlmIChmaXhlZFN0YXJ0ID09PSB1bmRlZmluZWQgfHwgZml4ZWRFbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBbc3RySW5CcmFjZXNdO1xuXHR9XG5cblx0bGV0IGFyciA9IHNwbGl0R2xvYkF3YXJlKHN0ckluQnJhY2VzLCAnLCcpO1xuXG5cdGlmICghYXJyLmxlbmd0aCkge1xuXHRcdC8vIG9jY3VycyBpZiB0aGUgYnJhY2VzIGFyZSBlbXB0eS5cblx0XHRhcnIgPSBbJyddO1xuXHR9XG5cblx0Y29uc3QgZW5kcyA9IHBlcmZvcm1CcmFjZUV4cGFuc2lvbkZvclJpcGdyZXAoZml4ZWRFbmQpO1xuXG5cdHJldHVybiBhcnIuZmxhdE1hcCgoZWxlbSkgPT4ge1xuXHRcdGNvbnN0IHN0YXJ0ID0gZml4ZWRTdGFydCArIGVsZW07XG5cdFx0cmV0dXJuIGVuZHMubWFwKChlbmQpID0+IHtcblx0XHRcdHJldHVybiBzdGFydCArIGVuZDtcblx0XHR9KTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxVQUFVLHFCQUFxQjtBQUV4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLDhCQUE4QjtBQUNyRCxTQUFTLFdBQVc7QUFFcEIsU0FBUyw0QkFBdUQsYUFBYSxpQkFBaUIsc0JBQXNCLHVCQUF1QjtBQUMzSSxTQUFTLE9BQTRCLG9CQUFvQix3QkFBd0Y7QUFDakosU0FBdUIsY0FBYyxxQkFBcUI7QUFDMUQsU0FBUyxZQUFtQyxvQkFBb0IsMEJBQTBCO0FBRTFGLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0JBQWtCO0FBRXBCLE1BQU0sd0JBQXdCO0FBQUEsRUFFcEMsWUFBb0IsZUFBZ0QsYUFBa0M7QUFBbEY7QUFBZ0Q7QUFBQSxFQUFvQztBQUFBLEVBRXhHLHlCQUF5QixPQUF5QixTQUFvQyxVQUF1QyxPQUF3RDtBQUNwTCxXQUFPLFFBQVEsSUFBSSxRQUFRLGNBQWMsSUFBSSxrQkFBZ0I7QUFDNUQsWUFBTSxrQkFBNEM7QUFBQSxRQUNqRCxlQUFlO0FBQUEsUUFDZixZQUFZLEtBQUs7QUFBQSxRQUNqQixZQUFZLFFBQVE7QUFBQSxRQUNwQixnQkFBZ0IsUUFBUTtBQUFBLFFBQ3hCLGFBQWEsUUFBUTtBQUFBLFFBQ3JCLG9C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
