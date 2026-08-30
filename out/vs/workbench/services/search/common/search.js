import { mapArrayOrNot } from "../../../../base/common/arrays.js";
import * as glob from "../../../../base/common/glob.js";
import * as objects from "../../../../base/common/objects.js";
import * as extpath from "../../../../base/common/extpath.js";
import { fuzzyContains, getNLines } from "../../../../base/common/strings.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import * as paths from "../../../../base/common/path.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { TextSearchCompleteMessageType } from "./searchExtTypes.js";
import { isThenable } from "../../../../base/common/async.js";
const VIEWLET_ID = "workbench.view.search";
const PANEL_ID = "workbench.panel.search";
const VIEW_ID = "workbench.view.search";
const SEARCH_RESULT_LANGUAGE_ID = "search-result";
const SEARCH_EXCLUDE_CONFIG = "search.exclude";
const DEFAULT_MAX_SEARCH_RESULTS = 2e4;
const SEARCH_ELIDED_PREFIX = "\u27EA ";
const SEARCH_ELIDED_SUFFIX = " characters skipped \u27EB";
const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;
const ISearchService = createDecorator("searchService");
var SearchProviderType = /* @__PURE__ */ ((SearchProviderType2) => {
  SearchProviderType2[SearchProviderType2["file"] = 0] = "file";
  SearchProviderType2[SearchProviderType2["text"] = 1] = "text";
  SearchProviderType2[SearchProviderType2["aiText"] = 2] = "aiText";
  return SearchProviderType2;
})(SearchProviderType || {});
var QueryType = /* @__PURE__ */ ((QueryType2) => {
  QueryType2[QueryType2["File"] = 1] = "File";
  QueryType2[QueryType2["Text"] = 2] = "Text";
  QueryType2[QueryType2["aiText"] = 3] = "aiText";
  return QueryType2;
})(QueryType || {});
function resultIsMatch(result) {
  return !!result.rangeLocations && !!result.previewText;
}
function isFileMatch(p) {
  return !!p.resource;
}
function isAIKeyword(p) {
  return !!p.keyword;
}
function isProgressMessage(p) {
  return !!p.message;
}
var SearchCompletionExitCode = /* @__PURE__ */ ((SearchCompletionExitCode2) => {
  SearchCompletionExitCode2[SearchCompletionExitCode2["Normal"] = 0] = "Normal";
  SearchCompletionExitCode2[SearchCompletionExitCode2["NewSearchStarted"] = 1] = "NewSearchStarted";
  return SearchCompletionExitCode2;
})(SearchCompletionExitCode || {});
class FileMatch {
  constructor(resource) {
    this.resource = resource;
    this.results = [];
  }
}
class TextSearchMatch {
  constructor(text, ranges, previewOptions, webviewIndex) {
    this.rangeLocations = [];
    this.webviewIndex = webviewIndex;
    const rangesArr = Array.isArray(ranges) ? ranges : [ranges];
    if (previewOptions && previewOptions.matchLines === 1 && isSingleLineRangeList(rangesArr)) {
      text = getNLines(text, previewOptions.matchLines);
      let result = "";
      let shift = 0;
      let lastEnd = 0;
      const leadingChars = Math.floor(previewOptions.charsPerLine / 5);
      for (const range of rangesArr) {
        const previewStart = Math.max(range.startColumn - leadingChars, 0);
        const previewEnd = range.startColumn + previewOptions.charsPerLine;
        if (previewStart > lastEnd + leadingChars + SEARCH_ELIDED_MIN_LEN) {
          const elision = SEARCH_ELIDED_PREFIX + (previewStart - lastEnd) + SEARCH_ELIDED_SUFFIX;
          result += elision + text.slice(previewStart, previewEnd);
          shift += previewStart - (lastEnd + elision.length);
        } else {
          result += text.slice(lastEnd, previewEnd);
        }
        lastEnd = previewEnd;
        this.rangeLocations.push({
          source: range,
          preview: new OneLineRange(0, range.startColumn - shift, range.endColumn - shift)
        });
      }
      this.previewText = result;
    } else {
      const firstMatchLine = Array.isArray(ranges) ? ranges[0].startLineNumber : ranges.startLineNumber;
      const rangeLocs = mapArrayOrNot(ranges, (r) => ({
        preview: new SearchRange(r.startLineNumber - firstMatchLine, r.startColumn, r.endLineNumber - firstMatchLine, r.endColumn),
        source: r
      }));
      this.rangeLocations = Array.isArray(rangeLocs) ? rangeLocs : [rangeLocs];
      this.previewText = text;
    }
  }
}
function isSingleLineRangeList(ranges) {
  const line = ranges[0].startLineNumber;
  for (const r of ranges) {
    if (r.startLineNumber !== line || r.endLineNumber !== line) {
      return false;
    }
  }
  return true;
}
class SearchRange {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
}
class OneLineRange extends SearchRange {
  constructor(lineNumber, startColumn, endColumn) {
    super(lineNumber, startColumn, lineNumber, endColumn);
  }
}
var ViewMode = /* @__PURE__ */ ((ViewMode2) => {
  ViewMode2["List"] = "list";
  ViewMode2["Tree"] = "tree";
  return ViewMode2;
})(ViewMode || {});
var SearchSortOrder = /* @__PURE__ */ ((SearchSortOrder2) => {
  SearchSortOrder2["Default"] = "default";
  SearchSortOrder2["FileNames"] = "fileNames";
  SearchSortOrder2["Type"] = "type";
  SearchSortOrder2["Modified"] = "modified";
  SearchSortOrder2["CountDescending"] = "countDescending";
  SearchSortOrder2["CountAscending"] = "countAscending";
  return SearchSortOrder2;
})(SearchSortOrder || {});
var SemanticSearchBehavior = /* @__PURE__ */ ((SemanticSearchBehavior2) => {
  SemanticSearchBehavior2["Auto"] = "auto";
  SemanticSearchBehavior2["Manual"] = "manual";
  SemanticSearchBehavior2["RunOnEmpty"] = "runOnEmpty";
  return SemanticSearchBehavior2;
})(SemanticSearchBehavior || {});
function getExcludes(configuration, includeSearchExcludes = true) {
  const fileExcludes = configuration && configuration.files && configuration.files.exclude;
  const searchExcludes = includeSearchExcludes && configuration && configuration.search && configuration.search.exclude;
  if (!fileExcludes && !searchExcludes) {
    return void 0;
  }
  if (!fileExcludes || !searchExcludes) {
    return fileExcludes || searchExcludes || void 0;
  }
  let allExcludes = /* @__PURE__ */ Object.create(null);
  allExcludes = objects.mixin(allExcludes, objects.deepClone(fileExcludes));
  allExcludes = objects.mixin(allExcludes, objects.deepClone(searchExcludes), true);
  return allExcludes;
}
function pathIncludedInQuery(queryProps, fsPath) {
  const globOptions = queryProps.ignoreGlobCase ? { ignoreCase: true } : void 0;
  if (queryProps.excludePattern && glob.match(queryProps.excludePattern, fsPath, globOptions)) {
    return false;
  }
  if (queryProps.includePattern || queryProps.usingSearchPaths) {
    if (queryProps.includePattern && glob.match(queryProps.includePattern, fsPath, globOptions)) {
      return true;
    }
    if (queryProps.usingSearchPaths) {
      return !!queryProps.folderQueries && queryProps.folderQueries.some((fq) => {
        const searchPath = fq.folder.fsPath;
        if (extpath.isEqualOrParent(fsPath, searchPath, queryProps.ignoreGlobCase)) {
          const relPath = paths.relative(searchPath, fsPath);
          return !fq.includePattern || !!glob.match(fq.includePattern, relPath, globOptions);
        } else {
          return false;
        }
      });
    }
    return false;
  }
  return true;
}
var SearchErrorCode = /* @__PURE__ */ ((SearchErrorCode2) => {
  SearchErrorCode2[SearchErrorCode2["unknownEncoding"] = 1] = "unknownEncoding";
  SearchErrorCode2[SearchErrorCode2["regexParseError"] = 2] = "regexParseError";
  SearchErrorCode2[SearchErrorCode2["globParseError"] = 3] = "globParseError";
  SearchErrorCode2[SearchErrorCode2["invalidLiteral"] = 4] = "invalidLiteral";
  SearchErrorCode2[SearchErrorCode2["rgProcessError"] = 5] = "rgProcessError";
  SearchErrorCode2[SearchErrorCode2["other"] = 6] = "other";
  SearchErrorCode2[SearchErrorCode2["canceled"] = 7] = "canceled";
  return SearchErrorCode2;
})(SearchErrorCode || {});
class SearchError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
function deserializeSearchError(error) {
  const errorMsg = error.message;
  if (isCancellationError(error)) {
    return new SearchError(errorMsg, 7 /* canceled */);
  }
  try {
    const details = JSON.parse(errorMsg);
    return new SearchError(details.message, details.code);
  } catch (e) {
    return new SearchError(errorMsg, 6 /* other */);
  }
}
function serializeSearchError(searchError) {
  const details = { message: searchError.message, code: searchError.code };
  return new Error(JSON.stringify(details));
}
function isSerializedSearchComplete(arg) {
  if (arg.type === "error") {
    return true;
  } else if (arg.type === "success") {
    return true;
  } else {
    return false;
  }
}
function isSerializedSearchSuccess(arg) {
  return arg.type === "success";
}
function isSerializedFileMatch(arg) {
  return !!arg.path;
}
const filePatternIgnoreCaseOptions = { ignoreCase: true };
function isFilePatternMatch(candidate, filePatternToUse, fuzzy = true, ignoreCase) {
  const pathToMatch = candidate.searchPath ? candidate.searchPath : candidate.relativePath;
  return fuzzy ? fuzzyContains(pathToMatch, filePatternToUse) : glob.match(filePatternToUse, pathToMatch, ignoreCase ? filePatternIgnoreCaseOptions : void 0);
}
class SerializableFileMatch {
  constructor(path) {
    this.path = path;
    this.results = [];
  }
  addMatch(match) {
    this.results.push(match);
  }
  serialize() {
    return {
      path: this.path,
      results: this.results,
      numMatches: this.results.length
    };
  }
}
function resolvePatternsForProvider(globalPattern, folderPattern) {
  const merged = {
    ...globalPattern || {},
    ...folderPattern || {}
  };
  return Object.keys(merged).filter((key) => {
    const value = merged[key];
    return typeof value === "boolean" && value;
  });
}
class QueryGlobTester {
  constructor(config, folderQuery) {
    this._parsedIncludeExpression = null;
    const globOptions = config.ignoreGlobCase || folderQuery.ignoreGlobCase ? { ignoreCase: true } : void 0;
    this._excludeExpression = folderQuery.excludePattern?.map((excludePattern) => {
      return {
        ...config.excludePattern || {},
        ...excludePattern.pattern || {}
      };
    }) ?? [];
    if (this._excludeExpression.length === 0) {
      this._excludeExpression = [config.excludePattern || {}];
    }
    this._parsedExcludeExpression = this._excludeExpression.map((e) => glob.parse(e, globOptions));
    let includeExpression = config.includePattern;
    if (folderQuery.includePattern) {
      if (includeExpression) {
        includeExpression = {
          ...includeExpression,
          ...folderQuery.includePattern
        };
      } else {
        includeExpression = folderQuery.includePattern;
      }
    }
    if (includeExpression) {
      this._parsedIncludeExpression = glob.parse(includeExpression, globOptions);
    }
  }
  _evalParsedExcludeExpression(testPath, basename, hasSibling) {
    let result = null;
    for (const folderExclude of this._parsedExcludeExpression) {
      const evaluation = folderExclude(testPath, basename, hasSibling);
      if (typeof evaluation === "string") {
        result = evaluation;
        break;
      }
    }
    return result;
  }
  matchesExcludesSync(testPath, basename, hasSibling) {
    if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
      return true;
    }
    return false;
  }
  /**
   * Guaranteed sync - siblingsFn should not return a promise.
   */
  includedInQuerySync(testPath, basename, hasSibling) {
    if (this._parsedExcludeExpression && this._evalParsedExcludeExpression(testPath, basename, hasSibling)) {
      return false;
    }
    if (this._parsedIncludeExpression && !this._parsedIncludeExpression(testPath, basename, hasSibling)) {
      return false;
    }
    return true;
  }
  /**
   * Evaluating the exclude expression is only async if it includes sibling clauses. As an optimization, avoid doing anything with Promises
   * unless the expression is async.
   */
  includedInQuery(testPath, basename, hasSibling) {
    const isIncluded = () => {
      return this._parsedIncludeExpression ? !!this._parsedIncludeExpression(testPath, basename, hasSibling) : true;
    };
    return Promise.all(this._parsedExcludeExpression.map((e) => {
      const excluded = e(testPath, basename, hasSibling);
      if (isThenable(excluded)) {
        return excluded.then((excluded2) => {
          if (excluded2) {
            return false;
          }
          return isIncluded();
        });
      }
      return isIncluded();
    })).then((e) => e.some((e2) => !!e2));
  }
  hasSiblingExcludeClauses() {
    return this._excludeExpression.reduce((prev, curr) => hasSiblingClauses(curr) || prev, false);
  }
}
function hasSiblingClauses(pattern) {
  for (const key in pattern) {
    if (typeof pattern[key] !== "boolean") {
      return true;
    }
  }
  return false;
}
function hasSiblingPromiseFn(siblingsFn) {
  if (!siblingsFn) {
    return void 0;
  }
  let siblings;
  return (name) => {
    if (!siblings) {
      siblings = (siblingsFn() || Promise.resolve([])).then((list) => list ? listToMap(list) : {});
    }
    return siblings.then((map) => !!map[name]);
  };
}
function hasSiblingFn(siblingsFn) {
  if (!siblingsFn) {
    return void 0;
  }
  let siblings;
  return (name) => {
    if (!siblings) {
      const list = siblingsFn();
      siblings = list ? listToMap(list) : {};
    }
    return !!siblings[name];
  };
}
function listToMap(list) {
  const map = {};
  for (const key of list) {
    map[key] = true;
  }
  return map;
}
function excludeToGlobPattern(excludesForFolder) {
  return excludesForFolder.flatMap((exclude) => exclude.patterns.map((pattern) => {
    return exclude.baseUri ? {
      baseUri: exclude.baseUri,
      pattern
    } : pattern;
  }));
}
const DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS = {
  matchLines: 100,
  charsPerLine: 1e4
};
export {
  DEFAULT_MAX_SEARCH_RESULTS,
  DEFAULT_TEXT_SEARCH_PREVIEW_OPTIONS,
  FileMatch,
  ISearchService,
  OneLineRange,
  PANEL_ID,
  QueryGlobTester,
  QueryType,
  SEARCH_EXCLUDE_CONFIG,
  SEARCH_RESULT_LANGUAGE_ID,
  SearchCompletionExitCode,
  SearchError,
  SearchErrorCode,
  SearchProviderType,
  SearchRange,
  SearchSortOrder,
  SemanticSearchBehavior,
  SerializableFileMatch,
  TextSearchCompleteMessageType,
  TextSearchMatch,
  VIEWLET_ID,
  VIEW_ID,
  ViewMode,
  deserializeSearchError,
  excludeToGlobPattern,
  getExcludes,
  hasSiblingFn,
  hasSiblingPromiseFn,
  isAIKeyword,
  isFileMatch,
  isFilePatternMatch,
  isProgressMessage,
  isSerializedFileMatch,
  isSerializedSearchComplete,
  isSerializedSearchSuccess,
  pathIncludedInQuery,
  resolvePatternsForProvider,
  resultIsMatch,
  serializeSearchError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxcc2VhcmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbWFwQXJyYXlPck5vdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIGV4dHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXh0cGF0aC5qcyc7XG5pbXBvcnQgeyBmdXp6eUNvbnRhaW5zLCBnZXROTGluZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBSVNlYXJjaEtleXdvcmQsIEdsb2JQYXR0ZXJuLCBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZSB9IGZyb20gJy4vc2VhcmNoRXh0VHlwZXMuanMnO1xuaW1wb3J0IHsgaXNUaGVuYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcblxuZXhwb3J0IHsgVGV4dFNlYXJjaENvbXBsZXRlTWVzc2FnZVR5cGUgfTtcblxuZXhwb3J0IGNvbnN0IFZJRVdMRVRfSUQgPSAnd29ya2JlbmNoLnZpZXcuc2VhcmNoJztcbmV4cG9ydCBjb25zdCBQQU5FTF9JRCA9ICd3b3JrYmVuY2gucGFuZWwuc2VhcmNoJztcbmV4cG9ydCBjb25zdCBWSUVXX0lEID0gJ3dvcmtiZW5jaC52aWV3LnNlYXJjaCc7XG5leHBvcnQgY29uc3QgU0VBUkNIX1JFU1VMVF9MQU5HVUFHRV9JRCA9ICdzZWFyY2gtcmVzdWx0JztcblxuZXhwb3J0IGNvbnN0IFNFQVJDSF9FWENMVURFX0NPTkZJRyA9ICdzZWFyY2guZXhjbHVkZSc7XG5leHBvcnQgY29uc3QgREVGQVVMVF9NQVhfU0VBUkNIX1JFU1VMVFMgPSAyMDAwMDtcblxuLy8gV2FybmluZzogdGhpcyBwYXR0ZXJuIGlzIHVzZWQgaW4gdGhlIHNlYXJjaCBlZGl0b3IgdG8gZGV0ZWN0IG9mZnNldHMuIElmIHlvdVxuLy8gY2hhbmdlIHRoaXMsIGFsc28gY2hhbmdlIHRoZSBzZWFyY2gtcmVzdWx0IGJ1aWx0LWluIGV4dGVuc2lvblxuY29uc3QgU0VBUkNIX0VMSURFRF9QUkVGSVggPSAnXHUyN0VBICc7XG5jb25zdCBTRUFSQ0hfRUxJREVEX1NVRkZJWCA9ICcgY2hhcmFjdGVycyBza2lwcGVkIFx1MjdFQic7XG5jb25zdCBTRUFSQ0hfRUxJREVEX01JTl9MRU4gPSAoU0VBUkNIX0VMSURFRF9QUkVGSVgubGVuZ3RoICsgU0VBUkNIX0VMSURFRF9TVUZGSVgubGVuZ3RoICsgNSkgKiAyO1xuXG5leHBvcnQgY29uc3QgSVNlYXJjaFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVNlYXJjaFNlcnZpY2U+KCdzZWFyY2hTZXJ2aWNlJyk7XG5cbi8qKlxuICogQSBzZXJ2aWNlIHRoYXQgZW5hYmxlcyB0byBzZWFyY2ggZm9yIGZpbGVzIG9yIHdpdGggaW4gZmlsZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHRleHRTZWFyY2gocXVlcnk6IElUZXh0UXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sIG9uUHJvZ3Jlc3M/OiAocmVzdWx0OiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRhaVRleHRTZWFyY2gocXVlcnk6IElBSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT47XG5cdGdldEFJTmFtZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHRleHRTZWFyY2hTcGxpdFN5bmNBc3luYyhxdWVyeTogSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZCwgb25Qcm9ncmVzcz86ICgocmVzdWx0OiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCwgbm90ZWJvb2tGaWxlc1RvSWdub3JlPzogUmVzb3VyY2VTZXQsIGFzeW5jTm90ZWJvb2tGaWxlc1RvSWdub3JlPzogUHJvbWlzZTxSZXNvdXJjZVNldD4pOiB7IHN5bmNSZXN1bHRzOiBJU2VhcmNoQ29tcGxldGU7IGFzeW5jUmVzdWx0czogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IH07XG5cdGZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT47XG5cdHNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcihzY2hlbWU6IHN0cmluZyk6IGJvb2xlYW47XG5cdGNsZWFyQ2FjaGUoY2FjaGVLZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHJlZ2lzdGVyU2VhcmNoUmVzdWx0UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHR5cGU6IFNlYXJjaFByb3ZpZGVyVHlwZSwgcHJvdmlkZXI6IElTZWFyY2hSZXN1bHRQcm92aWRlcik6IElEaXNwb3NhYmxlO1xufVxuXG4vKipcbiAqIFRPRE9Acm9ibG91IC0gc3BsaXQgdGV4dCBmcm9tIGZpbGUgc2VhcmNoIGVudGlyZWx5LCBvciBzaGFyZSBjb2RlIGluIGEgbW9yZSBuYXR1cmFsIHdheS5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gU2VhcmNoUHJvdmlkZXJUeXBlIHtcblx0ZmlsZSxcblx0dGV4dCxcblx0YWlUZXh0XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFJlc3VsdFByb3ZpZGVyIHtcblx0Z2V0QUlOYW1lKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0dGV4dFNlYXJjaChxdWVyeTogSVRleHRRdWVyeSwgb25Qcm9ncmVzcz86IChwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRjbGVhckNhY2hlKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgRXhjbHVkZUdsb2JQYXR0ZXJuPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiB7XG5cdGZvbGRlcj86IFU7XG5cdHBhdHRlcm46IGdsb2IuSUV4cHJlc3Npb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZvbGRlclF1ZXJ5PFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzID0gVVJJPiB7XG5cdGZvbGRlcjogVTtcblx0Zm9sZGVyTmFtZT86IHN0cmluZztcblx0ZXhjbHVkZVBhdHRlcm4/OiBFeGNsdWRlR2xvYlBhdHRlcm48VT5bXTtcblx0aW5jbHVkZVBhdHRlcm4/OiBnbG9iLklFeHByZXNzaW9uO1xuXHRpZ25vcmVHbG9iQ2FzZT86IGJvb2xlYW47XG5cdGZpbGVFbmNvZGluZz86IHN0cmluZztcblx0ZGlzcmVnYXJkSWdub3JlRmlsZXM/OiBib29sZWFuO1xuXHRkaXNyZWdhcmRHbG9iYWxJZ25vcmVGaWxlcz86IGJvb2xlYW47XG5cdGRpc3JlZ2FyZFBhcmVudElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0aWdub3JlU3ltbGlua3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21tb25RdWVyeVByb3BzPFUgZXh0ZW5kcyBVcmlDb21wb25lbnRzPiB7XG5cdC8qKiBGb3IgdGVsZW1ldHJ5IC0gaW5kaWNhdGVzIHdoYXQgaXMgdHJpZ2dlcmluZyB0aGUgc291cmNlICovXG5cdF9yZWFzb24/OiBzdHJpbmc7XG5cblx0Zm9sZGVyUXVlcmllczogSUZvbGRlclF1ZXJ5PFU+W107XG5cdC8vIFRoZSBpbmNsdWRlIHBhdHRlcm4gZm9yIGZpbGVzIHRoYXQgZ2V0cyBwYXNzZWQgaW50byByaXBncmVwLlxuXHQvLyBOb3RlIHRoYXQgdGhpcyB3aWxsIG92ZXJyaWRlIGFueSBpZ25vcmUgZmlsZXMgaWYgYXBwbGljYWJsZS5cblx0aW5jbHVkZVBhdHRlcm4/OiBnbG9iLklFeHByZXNzaW9uO1xuXHRleGNsdWRlUGF0dGVybj86IGdsb2IuSUV4cHJlc3Npb247XG5cdGlnbm9yZUdsb2JDYXNlPzogYm9vbGVhbjtcblx0ZXh0cmFGaWxlUmVzb3VyY2VzPzogVVtdO1xuXG5cdG9ubHlPcGVuRWRpdG9ycz86IGJvb2xlYW47XG5cblx0bWF4UmVzdWx0cz86IG51bWJlcjtcblx0dXNpbmdTZWFyY2hQYXRocz86IGJvb2xlYW47XG5cdG9ubHlGaWxlU2NoZW1lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVF1ZXJ5UHJvcHM8VSBleHRlbmRzIFVyaUNvbXBvbmVudHM+IGV4dGVuZHMgSUNvbW1vblF1ZXJ5UHJvcHM8VT4ge1xuXHR0eXBlOiBRdWVyeVR5cGUuRmlsZTtcblx0ZmlsZVBhdHRlcm4/OiBzdHJpbmc7XG5cblx0Ly8gd2hlbiB3YWxraW5nIHRocm91Z2ggdGhlIHRyZWUgdG8gZmluZCB0aGUgcmVzdWx0LCBkb24ndCB1c2UgdGhlIGZpbGVQYXR0ZXJuIHRvIGZ1enp5IG1hdGNoLlxuXHQvLyBJbnN0ZWFkLCBzaG91bGQgdXNlIGdsb2IgbWF0Y2hpbmcuXG5cdHNob3VsZEdsb2JNYXRjaEZpbGVQYXR0ZXJuPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgdHJ1ZSBubyByZXN1bHRzIHdpbGwgYmUgcmV0dXJuZWQuIEluc3RlYWQgYGxpbWl0SGl0YCB3aWxsIGluZGljYXRlIGlmIGF0IGxlYXN0IG9uZSByZXN1bHQgZXhpc3RzIG9yIG5vdC5cblx0ICogQ3VycmVudGx5IGRvZXMgbm90IHdvcmsgd2l0aCBxdWVyaWVzIGluY2x1ZGluZyBhICdzaWJsaW5ncyBjbGF1c2UnLlxuXHQgKi9cblx0ZXhpc3RzPzogYm9vbGVhbjtcblx0c29ydEJ5U2NvcmU/OiBib29sZWFuO1xuXHRjYWNoZUtleT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGV4dFF1ZXJ5UHJvcHM8VSBleHRlbmRzIFVyaUNvbXBvbmVudHM+IGV4dGVuZHMgSUNvbW1vblF1ZXJ5UHJvcHM8VT4ge1xuXHR0eXBlOiBRdWVyeVR5cGUuVGV4dDtcblx0Y29udGVudFBhdHRlcm46IElQYXR0ZXJuSW5mbztcblxuXHRwcmV2aWV3T3B0aW9ucz86IElUZXh0U2VhcmNoUHJldmlld09wdGlvbnM7XG5cdG1heEZpbGVTaXplPzogbnVtYmVyO1xuXHRzdXJyb3VuZGluZ0NvbnRleHQ/OiBudW1iZXI7XG5cblx0dXNlckRpc2FibGVkRXhjbHVkZXNBbmRJZ25vcmVGaWxlcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFJVGV4dFF1ZXJ5UHJvcHM8VSBleHRlbmRzIFVyaUNvbXBvbmVudHM+IGV4dGVuZHMgSUNvbW1vblF1ZXJ5UHJvcHM8VT4ge1xuXHR0eXBlOiBRdWVyeVR5cGUuYWlUZXh0O1xuXHRjb250ZW50UGF0dGVybjogc3RyaW5nO1xuXG5cdHByZXZpZXdPcHRpb25zPzogSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucztcblx0bWF4RmlsZVNpemU/OiBudW1iZXI7XG5cdHN1cnJvdW5kaW5nQ29udGV4dD86IG51bWJlcjtcblxuXHR1c2VyRGlzYWJsZWRFeGNsdWRlc0FuZElnbm9yZUZpbGVzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgSUZpbGVRdWVyeSA9IElGaWxlUXVlcnlQcm9wczxVUkk+O1xuZXhwb3J0IHR5cGUgSVJhd0ZpbGVRdWVyeSA9IElGaWxlUXVlcnlQcm9wczxVcmlDb21wb25lbnRzPjtcbmV4cG9ydCB0eXBlIElUZXh0UXVlcnkgPSBJVGV4dFF1ZXJ5UHJvcHM8VVJJPjtcbmV4cG9ydCB0eXBlIElSYXdUZXh0UXVlcnkgPSBJVGV4dFF1ZXJ5UHJvcHM8VXJpQ29tcG9uZW50cz47XG5leHBvcnQgdHlwZSBJQUlUZXh0UXVlcnkgPSBJQUlUZXh0UXVlcnlQcm9wczxVUkk+O1xuZXhwb3J0IHR5cGUgSVJhd0FJVGV4dFF1ZXJ5ID0gSUFJVGV4dFF1ZXJ5UHJvcHM8VXJpQ29tcG9uZW50cz47XG5cbmV4cG9ydCB0eXBlIElSYXdRdWVyeSA9IElSYXdUZXh0UXVlcnkgfCBJUmF3RmlsZVF1ZXJ5IHwgSVJhd0FJVGV4dFF1ZXJ5O1xuZXhwb3J0IHR5cGUgSVNlYXJjaFF1ZXJ5ID0gSVRleHRRdWVyeSB8IElGaWxlUXVlcnkgfCBJQUlUZXh0UXVlcnk7XG5leHBvcnQgdHlwZSBJVGV4dFNlYXJjaFF1ZXJ5ID0gSVRleHRRdWVyeSB8IElBSVRleHRRdWVyeTtcblxuZXhwb3J0IGNvbnN0IGVudW0gUXVlcnlUeXBlIHtcblx0RmlsZSA9IDEsXG5cdFRleHQgPSAyLFxuXHRhaVRleHQgPSAzXG59XG5cbi8qIF9fR0RQUl9fRlJBR01FTlRfX1xuXHRcIklQYXR0ZXJuSW5mb1wiIDoge1xuXHRcdFwiaXNSZWdFeHBcIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcImlzV29yZE1hdGNoXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XCJ3b3JkU2VwYXJhdG9yc1wiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiIH0sXG5cdFx0XCJpc011bHRpbGluZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFwiaXNDYXNlU2Vuc2l0aXZlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XCJpc1NtYXJ0Q2FzZVwiOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJGZWF0dXJlSW5zaWdodFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9XG5cdH1cbiovXG5leHBvcnQgaW50ZXJmYWNlIElQYXR0ZXJuSW5mbyB7XG5cdHBhdHRlcm46IHN0cmluZztcblx0aXNSZWdFeHA/OiBib29sZWFuO1xuXHRpc1dvcmRNYXRjaD86IGJvb2xlYW47XG5cdHdvcmRTZXBhcmF0b3JzPzogc3RyaW5nO1xuXHRpc011bHRpbGluZT86IGJvb2xlYW47XG5cdGlzVW5pY29kZT86IGJvb2xlYW47XG5cdGlzQ2FzZVNlbnNpdGl2ZT86IGJvb2xlYW47XG5cdG5vdGVib29rSW5mbz86IElOb3RlYm9va1BhdHRlcm5JbmZvO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va1BhdHRlcm5JbmZvIHtcblx0aXNJbk5vdGVib29rTWFya2Rvd25JbnB1dD86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldz86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va0NlbGxJbnB1dD86IGJvb2xlYW47XG5cdGlzSW5Ob3RlYm9va0NlbGxPdXRwdXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlTWF0Y2g8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+IHtcblx0cmVzb3VyY2U6IFU7XG5cdHJlc3VsdHM/OiBJVGV4dFNlYXJjaFJlc3VsdDxVPltdO1xufVxuXG5leHBvcnQgdHlwZSBJUmF3RmlsZU1hdGNoMiA9IElGaWxlTWF0Y2g8VXJpQ29tcG9uZW50cz47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucyB7XG5cdG1hdGNoTGluZXM6IG51bWJlcjtcblx0Y2hhcnNQZXJMaW5lOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaFJhbmdlIHtcblx0cmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0cmVhZG9ubHkgZW5kQ29sdW1uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRTZWFyY2hNYXRjaDxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cyA9IFVSST4ge1xuXHR1cmk/OiBVO1xuXHRyYW5nZUxvY2F0aW9uczogU2VhcmNoUmFuZ2VTZXRQYWlyaW5nW107XG5cdHByZXZpZXdUZXh0OiBzdHJpbmc7XG5cdHdlYnZpZXdJbmRleD86IG51bWJlcjtcblx0Y2VsbEZyYWdtZW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0U2VhcmNoQ29udGV4dDxVIGV4dGVuZHMgVXJpQ29tcG9uZW50cyA9IFVSST4ge1xuXHR1cmk/OiBVO1xuXHR0ZXh0OiBzdHJpbmc7XG5cdGxpbmVOdW1iZXI6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgSVRleHRTZWFyY2hSZXN1bHQ8VSBleHRlbmRzIFVyaUNvbXBvbmVudHMgPSBVUkk+ID0gSVRleHRTZWFyY2hNYXRjaDxVPiB8IElUZXh0U2VhcmNoQ29udGV4dDxVPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3VsdElzTWF0Y2gocmVzdWx0OiBJVGV4dFNlYXJjaFJlc3VsdCk6IHJlc3VsdCBpcyBJVGV4dFNlYXJjaE1hdGNoIHtcblx0cmV0dXJuICEhKDxJVGV4dFNlYXJjaE1hdGNoPnJlc3VsdCkucmFuZ2VMb2NhdGlvbnMgJiYgISEoPElUZXh0U2VhcmNoTWF0Y2g+cmVzdWx0KS5wcmV2aWV3VGV4dDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJvZ3Jlc3NNZXNzYWdlIHtcblx0bWVzc2FnZTogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBJU2VhcmNoUHJvZ3Jlc3NJdGVtID0gSUZpbGVNYXRjaCB8IElQcm9ncmVzc01lc3NhZ2UgfCBBSVNlYXJjaEtleXdvcmQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ZpbGVNYXRjaChwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKTogcCBpcyBJRmlsZU1hdGNoIHtcblx0cmV0dXJuICEhKDxJRmlsZU1hdGNoPnApLnJlc291cmNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBSUtleXdvcmQocDogSVNlYXJjaFByb2dyZXNzSXRlbSk6IHAgaXMgQUlTZWFyY2hLZXl3b3JkIHtcblx0cmV0dXJuICEhKDxBSVNlYXJjaEtleXdvcmQ+cCkua2V5d29yZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvZ3Jlc3NNZXNzYWdlKHA6IElTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSk6IHAgaXMgSVByb2dyZXNzTWVzc2FnZSB7XG5cdHJldHVybiAhIShwIGFzIElQcm9ncmVzc01lc3NhZ2UpLm1lc3NhZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2Uge1xuXHR0ZXh0OiBzdHJpbmc7XG5cdHR5cGU6IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlO1xuXHR0cnVzdGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoQ29tcGxldGVTdGF0cyB7XG5cdGxpbWl0SGl0PzogYm9vbGVhbjtcblx0bWVzc2FnZXM6IElUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlW107XG5cdHN0YXRzPzogSUZpbGVTZWFyY2hTdGF0cyB8IElUZXh0U2VhcmNoU3RhdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaENvbXBsZXRlIGV4dGVuZHMgSVNlYXJjaENvbXBsZXRlU3RhdHMge1xuXHRyZXN1bHRzOiBJRmlsZU1hdGNoW107XG5cdGV4aXQ/OiBTZWFyY2hDb21wbGV0aW9uRXhpdENvZGU7XG5cdGFpS2V5d29yZHM/OiBBSVNlYXJjaEtleXdvcmRbXTtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU2VhcmNoQ29tcGxldGlvbkV4aXRDb2RlIHtcblx0Tm9ybWFsLFxuXHROZXdTZWFyY2hTdGFydGVkXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRleHRTZWFyY2hTdGF0cyB7XG5cdHR5cGU6ICd0ZXh0U2VhcmNoUHJvdmlkZXInIHwgJ3NlYXJjaFByb2Nlc3MnIHwgJ2FpVGV4dFNlYXJjaFByb3ZpZGVyJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmlsZVNlYXJjaFN0YXRzIHtcblx0ZnJvbUNhY2hlOiBib29sZWFuO1xuXHRkZXRhaWxTdGF0czogSVNlYXJjaEVuZ2luZVN0YXRzIHwgSUNhY2hlZFNlYXJjaFN0YXRzIHwgSUZpbGVTZWFyY2hQcm92aWRlclN0YXRzO1xuXG5cdHJlc3VsdENvdW50OiBudW1iZXI7XG5cdHR5cGU6ICdmaWxlU2VhcmNoUHJvdmlkZXInIHwgJ3NlYXJjaFByb2Nlc3MnO1xuXHRzb3J0aW5nVGltZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2FjaGVkU2VhcmNoU3RhdHMge1xuXHRjYWNoZVdhc1Jlc29sdmVkOiBib29sZWFuO1xuXHRjYWNoZUxvb2t1cFRpbWU6IG51bWJlcjtcblx0Y2FjaGVGaWx0ZXJUaW1lOiBudW1iZXI7XG5cdGNhY2hlRW50cnlDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hFbmdpbmVTdGF0cyB7XG5cdGZpbGVXYWxrVGltZTogbnVtYmVyO1xuXHRkaXJlY3Rvcmllc1dhbGtlZDogbnVtYmVyO1xuXHRmaWxlc1dhbGtlZDogbnVtYmVyO1xuXHRjbWRUaW1lOiBudW1iZXI7XG5cdGNtZFJlc3VsdENvdW50PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlU2VhcmNoUHJvdmlkZXJTdGF0cyB7XG5cdHByb3ZpZGVyVGltZTogbnVtYmVyO1xuXHRwb3N0UHJvY2Vzc1RpbWU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVNYXRjaCBpbXBsZW1lbnRzIElGaWxlTWF0Y2gge1xuXHRyZXN1bHRzOiBJVGV4dFNlYXJjaFJlc3VsdFtdID0gW107XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZXNvdXJjZTogVVJJKSB7XG5cdFx0Ly8gZW1wdHlcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlYXJjaFJhbmdlU2V0UGFpcmluZyB7XG5cdHNvdXJjZTogSVNlYXJjaFJhbmdlO1xuXHRwcmV2aWV3OiBJU2VhcmNoUmFuZ2U7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0U2VhcmNoTWF0Y2ggaW1wbGVtZW50cyBJVGV4dFNlYXJjaE1hdGNoIHtcblx0cmFuZ2VMb2NhdGlvbnM6IFNlYXJjaFJhbmdlU2V0UGFpcmluZ1tdID0gW107XG5cdHByZXZpZXdUZXh0OiBzdHJpbmc7XG5cdHdlYnZpZXdJbmRleD86IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcih0ZXh0OiBzdHJpbmcsIHJhbmdlczogSVNlYXJjaFJhbmdlIHwgSVNlYXJjaFJhbmdlW10sIHByZXZpZXdPcHRpb25zPzogSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucywgd2Vidmlld0luZGV4PzogbnVtYmVyKSB7XG5cdFx0dGhpcy53ZWJ2aWV3SW5kZXggPSB3ZWJ2aWV3SW5kZXg7XG5cblx0XHQvLyBUcmltIHByZXZpZXcgaWYgdGhpcyBpcyBvbmUgbWF0Y2ggYW5kIGEgc2luZ2xlLWxpbmUgbWF0Y2ggd2l0aCBhIHByZXZpZXcgcmVxdWVzdGVkLlxuXHRcdC8vIE90aGVyd2lzZSBzZW5kIHRoZSBmdWxsIHRleHQsIGxpa2UgZm9yIHJlcGxhY2Ugb3IgZm9yIHNob3dpbmcgbXVsdGlwbGUgcHJldmlld3MuXG5cdFx0Ly8gVE9ETyB0aGlzIGlzIGZpc2h5LlxuXHRcdGNvbnN0IHJhbmdlc0FyciA9IEFycmF5LmlzQXJyYXkocmFuZ2VzKSA/IHJhbmdlcyA6IFtyYW5nZXNdO1xuXG5cdFx0aWYgKHByZXZpZXdPcHRpb25zICYmIHByZXZpZXdPcHRpb25zLm1hdGNoTGluZXMgPT09IDEgJiYgaXNTaW5nbGVMaW5lUmFuZ2VMaXN0KHJhbmdlc0FycikpIHtcblx0XHRcdC8vIDEgbGluZSBwcmV2aWV3IHJlcXVlc3RlZFxuXHRcdFx0dGV4dCA9IGdldE5MaW5lcyh0ZXh0LCBwcmV2aWV3T3B0aW9ucy5tYXRjaExpbmVzKTtcblxuXHRcdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdFx0bGV0IHNoaWZ0ID0gMDtcblx0XHRcdGxldCBsYXN0RW5kID0gMDtcblx0XHRcdGNvbnN0IGxlYWRpbmdDaGFycyA9IE1hdGguZmxvb3IocHJldmlld09wdGlvbnMuY2hhcnNQZXJMaW5lIC8gNSk7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIHJhbmdlc0Fycikge1xuXHRcdFx0XHRjb25zdCBwcmV2aWV3U3RhcnQgPSBNYXRoLm1heChyYW5nZS5zdGFydENvbHVtbiAtIGxlYWRpbmdDaGFycywgMCk7XG5cdFx0XHRcdGNvbnN0IHByZXZpZXdFbmQgPSByYW5nZS5zdGFydENvbHVtbiArIHByZXZpZXdPcHRpb25zLmNoYXJzUGVyTGluZTtcblx0XHRcdFx0aWYgKHByZXZpZXdTdGFydCA+IGxhc3RFbmQgKyBsZWFkaW5nQ2hhcnMgKyBTRUFSQ0hfRUxJREVEX01JTl9MRU4pIHtcblx0XHRcdFx0XHRjb25zdCBlbGlzaW9uID0gU0VBUkNIX0VMSURFRF9QUkVGSVggKyAocHJldmlld1N0YXJ0IC0gbGFzdEVuZCkgKyBTRUFSQ0hfRUxJREVEX1NVRkZJWDtcblx0XHRcdFx0XHRyZXN1bHQgKz0gZWxpc2lvbiArIHRleHQuc2xpY2UocHJldmlld1N0YXJ0LCBwcmV2aWV3RW5kKTtcblx0XHRcdFx0XHRzaGlmdCArPSBwcmV2aWV3U3RhcnQgLSAobGFzdEVuZCArIGVsaXNpb24ubGVuZ3RoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQgKz0gdGV4dC5zbGljZShsYXN0RW5kLCBwcmV2aWV3RW5kKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxhc3RFbmQgPSBwcmV2aWV3RW5kO1xuXHRcdFx0XHR0aGlzLnJhbmdlTG9jYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdHNvdXJjZTogcmFuZ2UsXG5cdFx0XHRcdFx0cHJldmlldzogbmV3IE9uZUxpbmVSYW5nZSgwLCByYW5nZS5zdGFydENvbHVtbiAtIHNoaWZ0LCByYW5nZS5lbmRDb2x1bW4gLSBzaGlmdClcblx0XHRcdFx0fSk7XG5cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wcmV2aWV3VGV4dCA9IHJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZmlyc3RNYXRjaExpbmUgPSBBcnJheS5pc0FycmF5KHJhbmdlcykgPyByYW5nZXNbMF0uc3RhcnRMaW5lTnVtYmVyIDogcmFuZ2VzLnN0YXJ0TGluZU51bWJlcjtcblxuXHRcdFx0Y29uc3QgcmFuZ2VMb2NzID0gbWFwQXJyYXlPck5vdChyYW5nZXMsIHIgPT4gKHtcblx0XHRcdFx0cHJldmlldzogbmV3IFNlYXJjaFJhbmdlKHIuc3RhcnRMaW5lTnVtYmVyIC0gZmlyc3RNYXRjaExpbmUsIHIuc3RhcnRDb2x1bW4sIHIuZW5kTGluZU51bWJlciAtIGZpcnN0TWF0Y2hMaW5lLCByLmVuZENvbHVtbiksXG5cdFx0XHRcdHNvdXJjZTogclxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLnJhbmdlTG9jYXRpb25zID0gQXJyYXkuaXNBcnJheShyYW5nZUxvY3MpID8gcmFuZ2VMb2NzIDogW3JhbmdlTG9jc107XG5cdFx0XHR0aGlzLnByZXZpZXdUZXh0ID0gdGV4dDtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTaW5nbGVMaW5lUmFuZ2VMaXN0KHJhbmdlczogSVNlYXJjaFJhbmdlW10pOiBib29sZWFuIHtcblx0Y29uc3QgbGluZSA9IHJhbmdlc1swXS5zdGFydExpbmVOdW1iZXI7XG5cdGZvciAoY29uc3QgciBvZiByYW5nZXMpIHtcblx0XHRpZiAoci5zdGFydExpbmVOdW1iZXIgIT09IGxpbmUgfHwgci5lbmRMaW5lTnVtYmVyICE9PSBsaW5lKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hSYW5nZSBpbXBsZW1lbnRzIElTZWFyY2hSYW5nZSB7XG5cdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRzdGFydENvbHVtbjogbnVtYmVyO1xuXHRlbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdGVuZENvbHVtbjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyKSB7XG5cdFx0dGhpcy5zdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5zdGFydENvbHVtbiA9IHN0YXJ0Q29sdW1uO1xuXHRcdHRoaXMuZW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cdFx0dGhpcy5lbmRDb2x1bW4gPSBlbmRDb2x1bW47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9uZUxpbmVSYW5nZSBleHRlbmRzIFNlYXJjaFJhbmdlIHtcblx0Y29uc3RydWN0b3IobGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcikge1xuXHRcdHN1cGVyKGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBsaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFZpZXdNb2RlIHtcblx0TGlzdCA9ICdsaXN0Jyxcblx0VHJlZSA9ICd0cmVlJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTZWFyY2hTb3J0T3JkZXIge1xuXHREZWZhdWx0ID0gJ2RlZmF1bHQnLFxuXHRGaWxlTmFtZXMgPSAnZmlsZU5hbWVzJyxcblx0VHlwZSA9ICd0eXBlJyxcblx0TW9kaWZpZWQgPSAnbW9kaWZpZWQnLFxuXHRDb3VudERlc2NlbmRpbmcgPSAnY291bnREZXNjZW5kaW5nJyxcblx0Q291bnRBc2NlbmRpbmcgPSAnY291bnRBc2NlbmRpbmcnXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNlbWFudGljU2VhcmNoQmVoYXZpb3Ige1xuXHRBdXRvID0gJ2F1dG8nLFxuXHRNYW51YWwgPSAnbWFudWFsJyxcblx0UnVuT25FbXB0eSA9ICdydW5PbkVtcHR5Jyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHRleGNsdWRlOiBnbG9iLklFeHByZXNzaW9uO1xuXHQvKipcblx0ICogVXNlIGlnbm9yZSBmaWxlIGZvciBmaWxlIHNlYXJjaC5cblx0ICovXG5cdHVzZUlnbm9yZUZpbGVzOiBib29sZWFuO1xuXHR1c2VHbG9iYWxJZ25vcmVGaWxlczogYm9vbGVhbjtcblx0dXNlUGFyZW50SWdub3JlRmlsZXM6IGJvb2xlYW47XG5cdGZvbGxvd1N5bWxpbmtzOiBib29sZWFuO1xuXHRzbWFydENhc2U6IGJvb2xlYW47XG5cdGdsb2JhbEZpbmRDbGlwYm9hcmQ6IGJvb2xlYW47XG5cdHVzZVJlcGxhY2VQcmV2aWV3OiBib29sZWFuO1xuXHRzaG93TGluZU51bWJlcnM6IGJvb2xlYW47XG5cdGFjdGlvbnNQb3NpdGlvbjogJ2F1dG8nIHwgJ3JpZ2h0Jztcblx0bWF4UmVzdWx0czogbnVtYmVyIHwgbnVsbDtcblx0Y29sbGFwc2VSZXN1bHRzOiAnYXV0bycgfCAnYWx3YXlzQ29sbGFwc2UnIHwgJ2Fsd2F5c0V4cGFuZCc7XG5cdHNlYXJjaE9uVHlwZTogYm9vbGVhbjtcblx0c2VlZE9uRm9jdXM6IGJvb2xlYW47XG5cdHNlZWRXaXRoTmVhcmVzdFdvcmQ6IGJvb2xlYW47XG5cdHNlYXJjaE9uVHlwZURlYm91bmNlUGVyaW9kOiBudW1iZXI7XG5cdG1vZGU6ICd2aWV3JyB8ICdyZXVzZUVkaXRvcicgfCAnbmV3RWRpdG9yJztcblx0c2VhcmNoRWRpdG9yOiB7XG5cdFx0ZG91YmxlQ2xpY2tCZWhhdmlvdXI6ICdzZWxlY3RXb3JkJyB8ICdnb1RvTG9jYXRpb24nIHwgJ29wZW5Mb2NhdGlvblRvU2lkZSc7XG5cdFx0c2luZ2xlQ2xpY2tCZWhhdmlvdXI6ICdkZWZhdWx0JyB8ICdwZWVrRGVmaW5pdGlvbic7XG5cdFx0cmV1c2VQcmlvclNlYXJjaENvbmZpZ3VyYXRpb246IGJvb2xlYW47XG5cdFx0ZGVmYXVsdE51bWJlck9mQ29udGV4dExpbmVzOiBudW1iZXIgfCBudWxsO1xuXHRcdGZvY3VzUmVzdWx0c09uU2VhcmNoOiBib29sZWFuO1xuXHRcdGV4cGVyaW1lbnRhbDoge307XG5cdH07XG5cdHNvcnRPcmRlcjogU2VhcmNoU29ydE9yZGVyO1xuXHRkZWNvcmF0aW9uczoge1xuXHRcdGNvbG9yczogYm9vbGVhbjtcblx0XHRiYWRnZXM6IGJvb2xlYW47XG5cdH07XG5cdHF1aWNrQWNjZXNzOiB7XG5cdFx0cHJlc2VydmVJbnB1dDogYm9vbGVhbjtcblx0fTtcblx0ZGVmYXVsdFZpZXdNb2RlOiBWaWV3TW9kZTtcblx0ZXhwZXJpbWVudGFsOiB7XG5cdFx0Y2xvc2VkTm90ZWJvb2tSaWNoQ29udGVudFJlc3VsdHM6IGJvb2xlYW47XG5cdH07XG5cdHNlYXJjaFZpZXc6IHtcblx0XHRzZW1hbnRpY1NlYXJjaEJlaGF2aW9yOiBzdHJpbmc7XG5cdFx0a2V5d29yZFN1Z2dlc3Rpb25zOiBib29sZWFuO1xuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZWFyY2hDb25maWd1cmF0aW9uIGV4dGVuZHMgSUZpbGVzQ29uZmlndXJhdGlvbiB7XG5cdHNlYXJjaD86IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcztcblx0ZWRpdG9yOiB7XG5cdFx0d29yZFNlcGFyYXRvcnM6IHN0cmluZztcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4Y2x1ZGVzKGNvbmZpZ3VyYXRpb246IElTZWFyY2hDb25maWd1cmF0aW9uLCBpbmNsdWRlU2VhcmNoRXhjbHVkZXMgPSB0cnVlKTogZ2xvYi5JRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZpbGVFeGNsdWRlcyA9IGNvbmZpZ3VyYXRpb24gJiYgY29uZmlndXJhdGlvbi5maWxlcyAmJiBjb25maWd1cmF0aW9uLmZpbGVzLmV4Y2x1ZGU7XG5cdGNvbnN0IHNlYXJjaEV4Y2x1ZGVzID0gaW5jbHVkZVNlYXJjaEV4Y2x1ZGVzICYmIGNvbmZpZ3VyYXRpb24gJiYgY29uZmlndXJhdGlvbi5zZWFyY2ggJiYgY29uZmlndXJhdGlvbi5zZWFyY2guZXhjbHVkZTtcblxuXHRpZiAoIWZpbGVFeGNsdWRlcyAmJiAhc2VhcmNoRXhjbHVkZXMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKCFmaWxlRXhjbHVkZXMgfHwgIXNlYXJjaEV4Y2x1ZGVzKSB7XG5cdFx0cmV0dXJuIGZpbGVFeGNsdWRlcyB8fCBzZWFyY2hFeGNsdWRlcyB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgYWxsRXhjbHVkZXM6IGdsb2IuSUV4cHJlc3Npb24gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHQvLyBjbG9uZSB0aGUgY29uZmlnIGFzIGl0IGNvdWxkIGJlIGZyb3plblxuXHRhbGxFeGNsdWRlcyA9IG9iamVjdHMubWl4aW4oYWxsRXhjbHVkZXMsIG9iamVjdHMuZGVlcENsb25lKGZpbGVFeGNsdWRlcykpO1xuXHRhbGxFeGNsdWRlcyA9IG9iamVjdHMubWl4aW4oYWxsRXhjbHVkZXMsIG9iamVjdHMuZGVlcENsb25lKHNlYXJjaEV4Y2x1ZGVzKSwgdHJ1ZSk7XG5cblx0cmV0dXJuIGFsbEV4Y2x1ZGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGF0aEluY2x1ZGVkSW5RdWVyeShxdWVyeVByb3BzOiBJQ29tbW9uUXVlcnlQcm9wczxVUkk+LCBmc1BhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBnbG9iT3B0aW9ucyA9IHF1ZXJ5UHJvcHMuaWdub3JlR2xvYkNhc2UgPyB7IGlnbm9yZUNhc2U6IHRydWUgfSA6IHVuZGVmaW5lZDtcblx0aWYgKHF1ZXJ5UHJvcHMuZXhjbHVkZVBhdHRlcm4gJiYgZ2xvYi5tYXRjaChxdWVyeVByb3BzLmV4Y2x1ZGVQYXR0ZXJuLCBmc1BhdGgsIGdsb2JPcHRpb25zKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChxdWVyeVByb3BzLmluY2x1ZGVQYXR0ZXJuIHx8IHF1ZXJ5UHJvcHMudXNpbmdTZWFyY2hQYXRocykge1xuXHRcdGlmIChxdWVyeVByb3BzLmluY2x1ZGVQYXR0ZXJuICYmIGdsb2IubWF0Y2gocXVlcnlQcm9wcy5pbmNsdWRlUGF0dGVybiwgZnNQYXRoLCBnbG9iT3B0aW9ucykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIElmIHNlYXJjaFBhdGhzIGFyZSBiZWluZyB1c2VkLCB0aGUgZXh0cmEgZmlsZSBtdXN0IGJlIGluIGEgc3ViZm9sZGVyIGFuZCBtYXRjaCB0aGUgcGF0dGVybiwgaWYgcHJlc2VudFxuXHRcdGlmIChxdWVyeVByb3BzLnVzaW5nU2VhcmNoUGF0aHMpIHtcblx0XHRcdHJldHVybiAhIXF1ZXJ5UHJvcHMuZm9sZGVyUXVlcmllcyAmJiBxdWVyeVByb3BzLmZvbGRlclF1ZXJpZXMuc29tZShmcSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaFBhdGggPSBmcS5mb2xkZXIuZnNQYXRoO1xuXHRcdFx0XHRpZiAoZXh0cGF0aC5pc0VxdWFsT3JQYXJlbnQoZnNQYXRoLCBzZWFyY2hQYXRoLCBxdWVyeVByb3BzLmlnbm9yZUdsb2JDYXNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlbFBhdGggPSBwYXRocy5yZWxhdGl2ZShzZWFyY2hQYXRoLCBmc1BhdGgpO1xuXHRcdFx0XHRcdHJldHVybiAhZnEuaW5jbHVkZVBhdHRlcm4gfHwgISFnbG9iLm1hdGNoKGZxLmluY2x1ZGVQYXR0ZXJuLCByZWxQYXRoLCBnbG9iT3B0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGVudW0gU2VhcmNoRXJyb3JDb2RlIHtcblx0dW5rbm93bkVuY29kaW5nID0gMSxcblx0cmVnZXhQYXJzZUVycm9yLFxuXHRnbG9iUGFyc2VFcnJvcixcblx0aW52YWxpZExpdGVyYWwsXG5cdHJnUHJvY2Vzc0Vycm9yLFxuXHRvdGhlcixcblx0Y2FuY2VsZWRcbn1cblxuZXhwb3J0IGNsYXNzIFNlYXJjaEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIHJlYWRvbmx5IGNvZGU/OiBTZWFyY2hFcnJvckNvZGUpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzZXJpYWxpemVTZWFyY2hFcnJvcihlcnJvcjogRXJyb3IpOiBTZWFyY2hFcnJvciB7XG5cdGNvbnN0IGVycm9yTXNnID0gZXJyb3IubWVzc2FnZTtcblxuXHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRyZXR1cm4gbmV3IFNlYXJjaEVycm9yKGVycm9yTXNnLCBTZWFyY2hFcnJvckNvZGUuY2FuY2VsZWQpO1xuXHR9XG5cblx0dHJ5IHtcblx0XHRjb25zdCBkZXRhaWxzID0gSlNPTi5wYXJzZShlcnJvck1zZyk7XG5cdFx0cmV0dXJuIG5ldyBTZWFyY2hFcnJvcihkZXRhaWxzLm1lc3NhZ2UsIGRldGFpbHMuY29kZSk7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHRyZXR1cm4gbmV3IFNlYXJjaEVycm9yKGVycm9yTXNnLCBTZWFyY2hFcnJvckNvZGUub3RoZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVTZWFyY2hFcnJvcihzZWFyY2hFcnJvcjogU2VhcmNoRXJyb3IpOiBFcnJvciB7XG5cdGNvbnN0IGRldGFpbHMgPSB7IG1lc3NhZ2U6IHNlYXJjaEVycm9yLm1lc3NhZ2UsIGNvZGU6IHNlYXJjaEVycm9yLmNvZGUgfTtcblx0cmV0dXJuIG5ldyBFcnJvcihKU09OLnN0cmluZ2lmeShkZXRhaWxzKSk7XG59XG5leHBvcnQgaW50ZXJmYWNlIElUZWxlbWV0cnlFdmVudCB7XG5cdGV2ZW50TmFtZTogc3RyaW5nO1xuXHRkYXRhOiBJVGVsZW1ldHJ5RGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmF3U2VhcmNoU2VydmljZSB7XG5cdGZpbGVTZWFyY2goc2VhcmNoOiBJUmF3RmlsZVF1ZXJ5KTogRXZlbnQ8SVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlPjtcblx0dGV4dFNlYXJjaChzZWFyY2g6IElSYXdUZXh0UXVlcnkpOiBFdmVudDxJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSB8IElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGU+O1xuXHRjbGVhckNhY2hlKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSYXdGaWxlTWF0Y2gge1xuXHRiYXNlPzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIHBhdGggb2YgdGhlIGZpbGUgcmVsYXRpdmUgdG8gdGhlIGNvbnRhaW5pbmcgYGJhc2VgIGZvbGRlci5cblx0ICogVGhpcyBwYXRoIGlzIGV4YWN0bHkgYXMgaXQgYXBwZWFycyBvbiB0aGUgZmlsZXN5c3RlbS5cblx0ICovXG5cdHJlbGF0aXZlUGF0aDogc3RyaW5nO1xuXHQvKipcblx0ICogVGhpcyBwYXRoIGlzIHRyYW5zZm9ybWVkIGZvciBzZWFyY2ggcHVycG9zZXMuIEZvciBleGFtcGxlLCB0aGlzIGNvdWxkIGJlXG5cdCAqIHRoZSBgcmVsYXRpdmVQYXRoYCB3aXRoIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIG5hbWUgcHJlcGVuZGVkLiBUaGlzIHdheSB0aGVcblx0ICogc2VhcmNoIGFsZ29yaXRobSB3b3VsZCBhbHNvIG1hdGNoIGFnYWluc3QgdGhlIG5hbWUgb2YgdGhlIGNvbnRhaW5pbmcgZm9sZGVyLlxuXHQgKlxuXHQgKiBJZiBub3QgZ2l2ZW4sIHRoZSBzZWFyY2ggYWxnb3JpdGhtIHNob3VsZCB1c2UgYHJlbGF0aXZlUGF0aGAuXG5cdCAqL1xuXHRzZWFyY2hQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaEVuZ2luZTxUPiB7XG5cdHNlYXJjaDogKG9uUmVzdWx0OiAobWF0Y2hlczogVCkgPT4gdm9pZCwgb25Qcm9ncmVzczogKHByb2dyZXNzOiBJUHJvZ3Jlc3NNZXNzYWdlKSA9PiB2b2lkLCBkb25lOiAoZXJyb3I6IEVycm9yIHwgbnVsbCwgY29tcGxldGU6IElTZWFyY2hFbmdpbmVTdWNjZXNzKSA9PiB2b2lkKSA9PiB2b2lkO1xuXHRjYW5jZWw6ICgpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzIHtcblx0dHlwZTogJ3N1Y2Nlc3MnO1xuXHRsaW1pdEhpdDogYm9vbGVhbjtcblx0bWVzc2FnZXM6IElUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlW107XG5cdHN0YXRzPzogSUZpbGVTZWFyY2hTdGF0cyB8IElUZXh0U2VhcmNoU3RhdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlYXJjaEVuZ2luZVN1Y2Nlc3Mge1xuXHRsaW1pdEhpdDogYm9vbGVhbjtcblx0bWVzc2FnZXM6IElUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlW107XG5cdHN0YXRzOiBJU2VhcmNoRW5naW5lU3RhdHM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRTZWFyY2hFcnJvciB7XG5cdHR5cGU6ICdlcnJvcic7XG5cdGVycm9yOiB7XG5cdFx0bWVzc2FnZTogc3RyaW5nO1xuXHRcdHN0YWNrOiBzdHJpbmc7XG5cdH07XG59XG5cbmV4cG9ydCB0eXBlIElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUgPSBJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MgfCBJU2VyaWFsaXplZFNlYXJjaEVycm9yO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUoYXJnOiBJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSB8IElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGUpOiBhcmcgaXMgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZSB7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRpZiAoKGFyZyBhcyBhbnkpLnR5cGUgPT09ICdlcnJvcicpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0fSBlbHNlIGlmICgoYXJnIGFzIGFueSkudHlwZSA9PT0gJ3N1Y2Nlc3MnKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzKGFyZzogSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZSk6IGFyZyBpcyBJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3Mge1xuXHRyZXR1cm4gYXJnLnR5cGUgPT09ICdzdWNjZXNzJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU2VyaWFsaXplZEZpbGVNYXRjaChhcmc6IElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtKTogYXJnIGlzIElTZXJpYWxpemVkRmlsZU1hdGNoIHtcblx0cmV0dXJuICEhKDxJU2VyaWFsaXplZEZpbGVNYXRjaD5hcmcpLnBhdGg7XG59XG5cbmNvbnN0IGZpbGVQYXR0ZXJuSWdub3JlQ2FzZU9wdGlvbnMgPSB7IGlnbm9yZUNhc2U6IHRydWUgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmlsZVBhdHRlcm5NYXRjaChjYW5kaWRhdGU6IElSYXdGaWxlTWF0Y2gsIGZpbGVQYXR0ZXJuVG9Vc2U6IHN0cmluZywgZnV6enkgPSB0cnVlLCBpZ25vcmVDYXNlPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRjb25zdCBwYXRoVG9NYXRjaCA9IGNhbmRpZGF0ZS5zZWFyY2hQYXRoID8gY2FuZGlkYXRlLnNlYXJjaFBhdGggOiBjYW5kaWRhdGUucmVsYXRpdmVQYXRoO1xuXHRyZXR1cm4gZnV6enkgP1xuXHRcdGZ1enp5Q29udGFpbnMocGF0aFRvTWF0Y2gsIGZpbGVQYXR0ZXJuVG9Vc2UpIDpcblx0XHRnbG9iLm1hdGNoKGZpbGVQYXR0ZXJuVG9Vc2UsIHBhdGhUb01hdGNoLCBpZ25vcmVDYXNlID8gZmlsZVBhdHRlcm5JZ25vcmVDYXNlT3B0aW9ucyA6IHVuZGVmaW5lZCk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRGaWxlTWF0Y2gge1xuXHRwYXRoOiBzdHJpbmc7XG5cdHJlc3VsdHM/OiBJVGV4dFNlYXJjaFJlc3VsdFtdO1xuXHRudW1NYXRjaGVzPzogbnVtYmVyO1xufVxuXG4vLyBUeXBlIG9mIHRoZSBwb3NzaWJsZSB2YWx1ZXMgZm9yIHByb2dyZXNzIGNhbGxzIGZyb20gdGhlIGVuZ2luZVxuZXhwb3J0IHR5cGUgSVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gPSBJU2VyaWFsaXplZEZpbGVNYXRjaCB8IElTZXJpYWxpemVkRmlsZU1hdGNoW10gfCBJUHJvZ3Jlc3NNZXNzYWdlO1xuZXhwb3J0IHR5cGUgSUZpbGVTZWFyY2hQcm9ncmVzc0l0ZW0gPSBJUmF3RmlsZU1hdGNoIHwgSVJhd0ZpbGVNYXRjaFtdIHwgSVByb2dyZXNzTWVzc2FnZTtcblxuXG5leHBvcnQgY2xhc3MgU2VyaWFsaXphYmxlRmlsZU1hdGNoIGltcGxlbWVudHMgSVNlcmlhbGl6ZWRGaWxlTWF0Y2gge1xuXHRwYXRoOiBzdHJpbmc7XG5cdHJlc3VsdHM6IElUZXh0U2VhcmNoTWF0Y2hbXTtcblxuXHRjb25zdHJ1Y3RvcihwYXRoOiBzdHJpbmcpIHtcblx0XHR0aGlzLnBhdGggPSBwYXRoO1xuXHRcdHRoaXMucmVzdWx0cyA9IFtdO1xuXHR9XG5cblx0YWRkTWF0Y2gobWF0Y2g6IElUZXh0U2VhcmNoTWF0Y2gpOiB2b2lkIHtcblx0XHR0aGlzLnJlc3VsdHMucHVzaChtYXRjaCk7XG5cdH1cblxuXHRzZXJpYWxpemUoKTogSVNlcmlhbGl6ZWRGaWxlTWF0Y2gge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXRoOiB0aGlzLnBhdGgsXG5cdFx0XHRyZXN1bHRzOiB0aGlzLnJlc3VsdHMsXG5cdFx0XHRudW1NYXRjaGVzOiB0aGlzLnJlc3VsdHMubGVuZ3RoXG5cdFx0fTtcblx0fVxufVxuXG4vKipcbiAqICBDb21wdXRlcyB0aGUgcGF0dGVybnMgdGhhdCB0aGUgcHJvdmlkZXIgaGFuZGxlcy4gRGlzY2FyZHMgc2libGluZyBjbGF1c2VzIGFuZCAnZmFsc2UnIHBhdHRlcm5zXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUGF0dGVybnNGb3JQcm92aWRlcihnbG9iYWxQYXR0ZXJuOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBmb2xkZXJQYXR0ZXJuOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkKTogc3RyaW5nW10ge1xuXHRjb25zdCBtZXJnZWQgPSB7XG5cdFx0Li4uKGdsb2JhbFBhdHRlcm4gfHwge30pLFxuXHRcdC4uLihmb2xkZXJQYXR0ZXJuIHx8IHt9KVxuXHR9O1xuXG5cdHJldHVybiBPYmplY3Qua2V5cyhtZXJnZWQpXG5cdFx0LmZpbHRlcihrZXkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBtZXJnZWRba2V5XTtcblx0XHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJyAmJiB2YWx1ZTtcblx0XHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIFF1ZXJ5R2xvYlRlc3RlciB7XG5cblx0cHJpdmF0ZSBfZXhjbHVkZUV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb25bXTsgLy8gVE9ETzogZXZhbHVhdGUgZ2xvYnMgYmFzZWQgb24gYmFzZVVSSSBvZiBwYXR0ZXJuXG5cdHByaXZhdGUgX3BhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uOiBnbG9iLlBhcnNlZEV4cHJlc3Npb25bXTtcblxuXHRwcml2YXRlIF9wYXJzZWRJbmNsdWRlRXhwcmVzc2lvbjogZ2xvYi5QYXJzZWRFeHByZXNzaW9uIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoY29uZmlnOiBJU2VhcmNoUXVlcnksIGZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnkpIHtcblx0XHRjb25zdCBnbG9iT3B0aW9ucyA9IGNvbmZpZy5pZ25vcmVHbG9iQ2FzZSB8fCBmb2xkZXJRdWVyeS5pZ25vcmVHbG9iQ2FzZSA/IHsgaWdub3JlQ2FzZTogdHJ1ZSB9IDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gdG9kbzogdHJ5IHRvIGluY29ycG9yYXRlIGZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuLmZvbGRlciBpZiBhdmFpbGFibGVcblx0XHR0aGlzLl9leGNsdWRlRXhwcmVzc2lvbiA9IGZvbGRlclF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuPy5tYXAoZXhjbHVkZVBhdHRlcm4gPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uKGNvbmZpZy5leGNsdWRlUGF0dGVybiB8fCB7fSksXG5cdFx0XHRcdC4uLihleGNsdWRlUGF0dGVybi5wYXR0ZXJuIHx8IHt9KVxuXHRcdFx0fSBzYXRpc2ZpZXMgZ2xvYi5JRXhwcmVzc2lvbjtcblx0XHR9KSA/PyBbXTtcblxuXHRcdGlmICh0aGlzLl9leGNsdWRlRXhwcmVzc2lvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGV2ZW4gaWYgdGhlcmUgYXJlIG5vIGZvbGRlclF1ZXJpZXMsIHdlIHdhbnQgdG8gb2JzZXJ2ZSAgdGhlIGdsb2JhbCBleGNsdWRlc1xuXHRcdFx0dGhpcy5fZXhjbHVkZUV4cHJlc3Npb24gPSBbY29uZmlnLmV4Y2x1ZGVQYXR0ZXJuIHx8IHt9XTtcblx0XHR9XG5cblx0XHR0aGlzLl9wYXJzZWRFeGNsdWRlRXhwcmVzc2lvbiA9IHRoaXMuX2V4Y2x1ZGVFeHByZXNzaW9uLm1hcChlID0+IGdsb2IucGFyc2UoZSwgZ2xvYk9wdGlvbnMpKTtcblxuXHRcdC8vIEVtcHR5IGluY2x1ZGVFeHByZXNzaW9uIG1lYW5zIGluY2x1ZGUgbm90aGluZywgc28gbm8ge30gc2hvcnRjdXRzXG5cdFx0bGV0IGluY2x1ZGVFeHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uIHwgdW5kZWZpbmVkID0gY29uZmlnLmluY2x1ZGVQYXR0ZXJuO1xuXHRcdGlmIChmb2xkZXJRdWVyeS5pbmNsdWRlUGF0dGVybikge1xuXHRcdFx0aWYgKGluY2x1ZGVFeHByZXNzaW9uKSB7XG5cdFx0XHRcdGluY2x1ZGVFeHByZXNzaW9uID0ge1xuXHRcdFx0XHRcdC4uLmluY2x1ZGVFeHByZXNzaW9uLFxuXHRcdFx0XHRcdC4uLmZvbGRlclF1ZXJ5LmluY2x1ZGVQYXR0ZXJuXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbmNsdWRlRXhwcmVzc2lvbiA9IGZvbGRlclF1ZXJ5LmluY2x1ZGVQYXR0ZXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpbmNsdWRlRXhwcmVzc2lvbikge1xuXHRcdFx0dGhpcy5fcGFyc2VkSW5jbHVkZUV4cHJlc3Npb24gPSBnbG9iLnBhcnNlKGluY2x1ZGVFeHByZXNzaW9uLCBnbG9iT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZXZhbFBhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uKHRlc3RQYXRoOiBzdHJpbmcsIGJhc2VuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Ly8gdG9kbzogbGVzcyBoYWNreSB3YXkgb2YgZXZhbHVhdGluZyBzeW5jIHZzIGFzeW5jIHNpYmxpbmcgY2xhdXNlc1xuXHRcdGxldCByZXN1bHQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBmb2xkZXJFeGNsdWRlIG9mIHRoaXMuX3BhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uKSB7XG5cblx0XHRcdC8vIGZpbmQgZmlyc3Qgbm9uLW51bGwgcmVzdWx0XG5cdFx0XHRjb25zdCBldmFsdWF0aW9uID0gZm9sZGVyRXhjbHVkZSh0ZXN0UGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpO1xuXG5cdFx0XHRpZiAodHlwZW9mIGV2YWx1YXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGV2YWx1YXRpb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblxuXHRtYXRjaGVzRXhjbHVkZXNTeW5jKHRlc3RQYXRoOiBzdHJpbmcsIGJhc2VuYW1lPzogc3RyaW5nLCBoYXNTaWJsaW5nPzogKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9wYXJzZWRFeGNsdWRlRXhwcmVzc2lvbiAmJiB0aGlzLl9ldmFsUGFyc2VkRXhjbHVkZUV4cHJlc3Npb24odGVzdFBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEd1YXJhbnRlZWQgc3luYyAtIHNpYmxpbmdzRm4gc2hvdWxkIG5vdCByZXR1cm4gYSBwcm9taXNlLlxuXHQgKi9cblx0aW5jbHVkZWRJblF1ZXJ5U3luYyh0ZXN0UGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZywgaGFzU2libGluZz86IChuYW1lOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGFyc2VkRXhjbHVkZUV4cHJlc3Npb24gJiYgdGhpcy5fZXZhbFBhcnNlZEV4Y2x1ZGVFeHByZXNzaW9uKHRlc3RQYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGFyc2VkSW5jbHVkZUV4cHJlc3Npb24gJiYgIXRoaXMuX3BhcnNlZEluY2x1ZGVFeHByZXNzaW9uKHRlc3RQYXRoLCBiYXNlbmFtZSwgaGFzU2libGluZykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFdmFsdWF0aW5nIHRoZSBleGNsdWRlIGV4cHJlc3Npb24gaXMgb25seSBhc3luYyBpZiBpdCBpbmNsdWRlcyBzaWJsaW5nIGNsYXVzZXMuIEFzIGFuIG9wdGltaXphdGlvbiwgYXZvaWQgZG9pbmcgYW55dGhpbmcgd2l0aCBQcm9taXNlc1xuXHQgKiB1bmxlc3MgdGhlIGV4cHJlc3Npb24gaXMgYXN5bmMuXG5cdCAqL1xuXHRpbmNsdWRlZEluUXVlcnkodGVzdFBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPik6IFByb21pc2U8Ym9vbGVhbj4gfCBib29sZWFuIHtcblxuXHRcdGNvbnN0IGlzSW5jbHVkZWQgPSAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyc2VkSW5jbHVkZUV4cHJlc3Npb24gP1xuXHRcdFx0XHQhISh0aGlzLl9wYXJzZWRJbmNsdWRlRXhwcmVzc2lvbih0ZXN0UGF0aCwgYmFzZW5hbWUsIGhhc1NpYmxpbmcpKSA6XG5cdFx0XHRcdHRydWU7XG5cdFx0fTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbCh0aGlzLl9wYXJzZWRFeGNsdWRlRXhwcmVzc2lvbi5tYXAoZSA9PiB7XG5cdFx0XHRjb25zdCBleGNsdWRlZCA9IGUodGVzdFBhdGgsIGJhc2VuYW1lLCBoYXNTaWJsaW5nKTtcblx0XHRcdGlmIChpc1RoZW5hYmxlKGV4Y2x1ZGVkKSkge1xuXHRcdFx0XHRyZXR1cm4gZXhjbHVkZWQudGhlbihleGNsdWRlZCA9PiB7XG5cdFx0XHRcdFx0aWYgKGV4Y2x1ZGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGlzSW5jbHVkZWQoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpc0luY2x1ZGVkKCk7XG5cblx0XHR9KSkudGhlbihlID0+IGUuc29tZShlID0+ICEhZSkpO1xuXG5cblx0fVxuXG5cdGhhc1NpYmxpbmdFeGNsdWRlQ2xhdXNlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZXhjbHVkZUV4cHJlc3Npb24ucmVkdWNlKChwcmV2LCBjdXJyKSA9PiBoYXNTaWJsaW5nQ2xhdXNlcyhjdXJyKSB8fCBwcmV2LCBmYWxzZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gaGFzU2libGluZ0NsYXVzZXMocGF0dGVybjogZ2xvYi5JRXhwcmVzc2lvbik6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGtleSBpbiBwYXR0ZXJuKSB7XG5cdFx0aWYgKHR5cGVvZiBwYXR0ZXJuW2tleV0gIT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzU2libGluZ1Byb21pc2VGbihzaWJsaW5nc0ZuPzogKCkgPT4gUHJvbWlzZTxzdHJpbmdbXT4pIHtcblx0aWYgKCFzaWJsaW5nc0ZuKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBzaWJsaW5nczogUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB0cnVlPj47XG5cdHJldHVybiAobmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0aWYgKCFzaWJsaW5ncykge1xuXHRcdFx0c2libGluZ3MgPSAoc2libGluZ3NGbigpIHx8IFByb21pc2UucmVzb2x2ZShbXSkpXG5cdFx0XHRcdC50aGVuKGxpc3QgPT4gbGlzdCA/IGxpc3RUb01hcChsaXN0KSA6IHt9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNpYmxpbmdzLnRoZW4obWFwID0+ICEhbWFwW25hbWVdKTtcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1NpYmxpbmdGbihzaWJsaW5nc0ZuPzogKCkgPT4gc3RyaW5nW10pIHtcblx0aWYgKCFzaWJsaW5nc0ZuKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBzaWJsaW5nczogUmVjb3JkPHN0cmluZywgdHJ1ZT47XG5cdHJldHVybiAobmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0aWYgKCFzaWJsaW5ncykge1xuXHRcdFx0Y29uc3QgbGlzdCA9IHNpYmxpbmdzRm4oKTtcblx0XHRcdHNpYmxpbmdzID0gbGlzdCA/IGxpc3RUb01hcChsaXN0KSA6IHt9O1xuXHRcdH1cblx0XHRyZXR1cm4gISFzaWJsaW5nc1tuYW1lXTtcblx0fTtcbn1cblxuZnVuY3Rpb24gbGlzdFRvTWFwKGxpc3Q6IHN0cmluZ1tdKSB7XG5cdGNvbnN0IG1hcDogUmVjb3JkPHN0cmluZywgdHJ1ZT4gPSB7fTtcblx0Zm9yIChjb25zdCBrZXkgb2YgbGlzdCkge1xuXHRcdG1hcFtrZXldID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gbWFwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhjbHVkZVRvR2xvYlBhdHRlcm4oZXhjbHVkZXNGb3JGb2xkZXI6IHsgYmFzZVVyaT86IFVSSSB8IHVuZGVmaW5lZDsgcGF0dGVybnM6IHN0cmluZ1tdIH1bXSk6IEdsb2JQYXR0ZXJuW10ge1xuXHRyZXR1cm4gZXhjbHVkZXNGb3JGb2xkZXIuZmxhdE1hcChleGNsdWRlID0+IGV4Y2x1ZGUucGF0dGVybnMubWFwKHBhdHRlcm4gPT4ge1xuXHRcdHJldHVybiBleGNsdWRlLmJhc2VVcmkgP1xuXHRcdFx0e1xuXHRcdFx0XHRiYXNlVXJpOiBleGNsdWRlLmJhc2VVcmksXG5cdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5cblx0XHRcdH0gOiBwYXR0ZXJuO1xuXHR9KSk7XG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX1RFWFRfU0VBUkNIX1BSRVZJRVdfT1BUSU9OUyA9IHtcblx0bWF0Y2hMaW5lczogMTAwLFxuXHRjaGFyc1BlckxpbmU6IDEwMDAwXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQkFBcUI7QUFFOUIsWUFBWSxVQUFVO0FBRXRCLFlBQVksYUFBYTtBQUN6QixZQUFZLGFBQWE7QUFDekIsU0FBUyxlQUFlLGlCQUFpQjtBQUd6QyxTQUFTLHVCQUF1QjtBQUdoQyxZQUFZLFdBQVc7QUFDdkIsU0FBUywyQkFBMkI7QUFDcEMsU0FBdUMscUNBQXFDO0FBQzVFLFNBQVMsa0JBQWtCO0FBS3BCLE1BQU0sYUFBYTtBQUNuQixNQUFNLFdBQVc7QUFDakIsTUFBTSxVQUFVO0FBQ2hCLE1BQU0sNEJBQTRCO0FBRWxDLE1BQU0sd0JBQXdC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
