import { equals } from "./arrays.js";
import { isThenable } from "./async.js";
import { CharCode } from "./charCode.js";
import { isEqualOrParent } from "./extpath.js";
import { LRUCache } from "./map.js";
import { basename, extname, posix, sep } from "./path.js";
import { isLinux } from "./platform.js";
import { endsWithIgnoreCase, equalsIgnoreCase, escapeRegExpCharacters, ltrim } from "./strings.js";
function getEmptyExpression() {
  return /* @__PURE__ */ Object.create(null);
}
const GLOBSTAR = "**";
const GLOB_SPLIT = "/";
const PATH_REGEX = "[/\\\\]";
const NO_PATH_REGEX = "[^/\\\\]";
const ALL_FORWARD_SLASHES = /\//g;
function starsToRegExp(starCount, isLastPattern) {
  switch (starCount) {
    case 0:
      return "";
    case 1:
      return `${NO_PATH_REGEX}*?`;
    // 1 star matches any number of characters except path separator (/ and \) - non greedy (?)
    default:
      return `(?:${PATH_REGEX}|${NO_PATH_REGEX}+${PATH_REGEX}${isLastPattern ? `|${PATH_REGEX}${NO_PATH_REGEX}+` : ""})*?`;
  }
}
function splitGlobAware(pattern, splitChar) {
  if (!pattern) {
    return [];
  }
  const segments = [];
  let inBraces = false;
  let inBrackets = false;
  let curVal = "";
  for (const char of pattern) {
    switch (char) {
      case splitChar:
        if (!inBraces && !inBrackets) {
          segments.push(curVal);
          curVal = "";
          continue;
        }
        break;
      case "{":
        inBraces = true;
        break;
      case "}":
        inBraces = false;
        break;
      case "[":
        inBrackets = true;
        break;
      case "]":
        inBrackets = false;
        break;
    }
    curVal += char;
  }
  if (curVal) {
    segments.push(curVal);
  }
  return segments;
}
function parseRegExp(pattern) {
  if (!pattern) {
    return "";
  }
  let regEx = "";
  const segments = splitGlobAware(pattern, GLOB_SPLIT);
  if (segments.every((segment) => segment === GLOBSTAR)) {
    regEx = ".*";
  } else {
    let previousSegmentWasGlobStar = false;
    segments.forEach((segment, index) => {
      if (segment === GLOBSTAR) {
        if (previousSegmentWasGlobStar) {
          return;
        }
        regEx += starsToRegExp(2, index === segments.length - 1);
      } else {
        let inBraces = false;
        let braceVal = "";
        let inBrackets = false;
        let bracketVal = "";
        for (const char of segment) {
          if (char !== "}" && inBraces) {
            braceVal += char;
            continue;
          }
          if (inBrackets && (char !== "]" || !bracketVal)) {
            let res;
            if (char === "-") {
              res = char;
            } else if ((char === "^" || char === "!") && !bracketVal) {
              res = "^";
            } else if (char === GLOB_SPLIT) {
              res = "";
            } else {
              res = escapeRegExpCharacters(char);
            }
            bracketVal += res;
            continue;
          }
          switch (char) {
            case "{":
              inBraces = true;
              continue;
            case "[":
              inBrackets = true;
              continue;
            case "}": {
              const choices = splitGlobAware(braceVal, ",");
              const braceRegExp = `(?:${choices.map((choice) => parseRegExp(choice)).join("|")})`;
              regEx += braceRegExp;
              inBraces = false;
              braceVal = "";
              break;
            }
            case "]": {
              regEx += "[" + bracketVal + "]";
              inBrackets = false;
              bracketVal = "";
              break;
            }
            case "?":
              regEx += NO_PATH_REGEX;
              continue;
            case "*":
              regEx += starsToRegExp(1);
              continue;
            default:
              regEx += escapeRegExpCharacters(char);
          }
        }
        if (index < segments.length - 1 && // more segments to come after this
        (segments[index + 1] !== GLOBSTAR || // next segment is not **, or...
        index + 2 < segments.length)) {
          regEx += PATH_REGEX;
        }
      }
      previousSegmentWasGlobStar = segment === GLOBSTAR;
    });
  }
  return regEx;
}
const T1 = /^\*\*\/\*\.[\w\.-]+$/;
const T2 = /^\*\*\/([\w\.-]+)\/?$/;
const T3 = /^{\*\*\/\*?[\w\.-]+\/?(,\*\*\/\*?[\w\.-]+\/?)*}$/;
const T3_2 = /^{\*\*\/\*?[\w\.-]+(\/(\*\*)?)?(,\*\*\/\*?[\w\.-]+(\/(\*\*)?)?)*}$/;
const T4 = /^\*\*((\/[\w\.-]+)+)\/?$/;
const T5 = /^([\w\.-]+(\/[\w\.-]+)*)\/?$/;
const CACHE = new LRUCache(1e4);
const FALSE = function() {
  return false;
};
const NULL = function() {
  return null;
};
function isEmptyPattern(pattern) {
  if (pattern === FALSE) {
    return true;
  }
  if (pattern === NULL) {
    return true;
  }
  return false;
}
function parsePattern(arg1, options) {
  if (!arg1) {
    return NULL;
  }
  let pattern;
  if (typeof arg1 !== "string") {
    pattern = arg1.pattern;
  } else {
    pattern = arg1;
  }
  pattern = pattern.trim();
  const ignoreCase = options.ignoreCase ?? false;
  const internalOptions = {
    ...options,
    equals: ignoreCase ? equalsIgnoreCase : (a, b) => a === b,
    endsWith: ignoreCase ? endsWithIgnoreCase : (str, candidate) => str.endsWith(candidate),
    isEqualOrParent: (base, candidate) => isEqualOrParent(
      base,
      candidate,
      options.ignoreCase ?? !isLinux
      /* preserve old behaviour for when option is not adopted */
    )
  };
  const patternKey = `${ignoreCase ? pattern.toLowerCase() : pattern}_${!!options.trimForExclusions}_${ignoreCase}`;
  let parsedPattern = CACHE.get(patternKey);
  if (parsedPattern) {
    return wrapRelativePattern(parsedPattern, arg1, internalOptions);
  }
  let match2;
  if (T1.test(pattern)) {
    parsedPattern = trivia1(pattern.substring(4), pattern, internalOptions);
  } else if (match2 = T2.exec(trimForExclusions(pattern, internalOptions))) {
    parsedPattern = trivia2(match2[1], pattern, internalOptions);
  } else if ((options.trimForExclusions ? T3_2 : T3).test(pattern)) {
    parsedPattern = trivia3(pattern, internalOptions);
  } else if (match2 = T4.exec(trimForExclusions(pattern, internalOptions))) {
    parsedPattern = trivia4and5(match2[1].substring(1), pattern, true, internalOptions);
  } else if (match2 = T5.exec(trimForExclusions(pattern, internalOptions))) {
    parsedPattern = trivia4and5(match2[1], pattern, false, internalOptions);
  } else {
    parsedPattern = toRegExp(pattern, internalOptions);
  }
  CACHE.set(patternKey, parsedPattern);
  return wrapRelativePattern(parsedPattern, arg1, internalOptions);
}
function wrapRelativePattern(parsedPattern, arg2, options) {
  if (typeof arg2 === "string") {
    return parsedPattern;
  }
  const wrappedPattern = function(path, basename2) {
    if (!options.isEqualOrParent(path, arg2.base)) {
      return null;
    }
    return parsedPattern(ltrim(path.substring(arg2.base.length), sep), basename2);
  };
  wrappedPattern.allBasenames = parsedPattern.allBasenames;
  wrappedPattern.allPaths = parsedPattern.allPaths;
  wrappedPattern.basenames = parsedPattern.basenames;
  wrappedPattern.patterns = parsedPattern.patterns;
  return wrappedPattern;
}
function trimForExclusions(pattern, options) {
  return options.trimForExclusions && pattern.endsWith("/**") ? pattern.substring(0, pattern.length - 2) : pattern;
}
function trivia1(base, pattern, options) {
  return function(path, basename2) {
    return typeof path === "string" && options.endsWith(path, base) ? pattern : null;
  };
}
function trivia2(base, pattern, options) {
  const slashBase = `/${base}`;
  const backslashBase = `\\${base}`;
  const parsedPattern = function(path, basename2) {
    if (typeof path !== "string") {
      return null;
    }
    if (basename2) {
      return options.equals(basename2, base) ? pattern : null;
    }
    return options.equals(path, base) || options.endsWith(path, slashBase) || options.endsWith(path, backslashBase) ? pattern : null;
  };
  const basenames = [base];
  parsedPattern.basenames = basenames;
  parsedPattern.patterns = [pattern];
  parsedPattern.allBasenames = basenames;
  return parsedPattern;
}
function trivia3(pattern, options) {
  const parsedPatterns = aggregateBasenameMatches(pattern.slice(1, -1).split(",").map((pattern2) => parsePattern(pattern2, options)).filter((pattern2) => pattern2 !== NULL), pattern);
  const patternsLength = parsedPatterns.length;
  if (!patternsLength) {
    return NULL;
  }
  if (patternsLength === 1) {
    return parsedPatterns[0];
  }
  const parsedPattern = function(path, basename2) {
    for (let i = 0, n = parsedPatterns.length; i < n; i++) {
      if (parsedPatterns[i](path, basename2)) {
        return pattern;
      }
    }
    return null;
  };
  const withBasenames = parsedPatterns.find((pattern2) => !!pattern2.allBasenames);
  if (withBasenames) {
    parsedPattern.allBasenames = withBasenames.allBasenames;
  }
  const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
  if (allPaths.length) {
    parsedPattern.allPaths = allPaths;
  }
  return parsedPattern;
}
function trivia4and5(targetPath, pattern, matchPathEnds, options) {
  const usingPosixSep = sep === posix.sep;
  const nativePath = usingPosixSep ? targetPath : targetPath.replace(ALL_FORWARD_SLASHES, sep);
  const nativePathEnd = sep + nativePath;
  const targetPathEnd = posix.sep + targetPath;
  let parsedPattern;
  if (matchPathEnds) {
    parsedPattern = function(path, basename2) {
      return typeof path === "string" && (options.equals(path, nativePath) || options.endsWith(path, nativePathEnd) || !usingPosixSep && (options.equals(path, targetPath) || options.endsWith(path, targetPathEnd))) ? pattern : null;
    };
  } else {
    parsedPattern = function(path, basename2) {
      return typeof path === "string" && (options.equals(path, nativePath) || !usingPosixSep && options.equals(path, targetPath)) ? pattern : null;
    };
  }
  parsedPattern.allPaths = [(matchPathEnds ? "*/" : "./") + targetPath];
  return parsedPattern;
}
function toRegExp(pattern, options) {
  try {
    const regExp = new RegExp(`^${parseRegExp(pattern)}$`, options.ignoreCase ? "i" : void 0);
    return function(path) {
      regExp.lastIndex = 0;
      return typeof path === "string" && regExp.test(path) ? pattern : null;
    };
  } catch {
    return NULL;
  }
}
function match(arg1, path, options) {
  if (!arg1 || typeof path !== "string") {
    return false;
  }
  return parse(arg1, options)(path);
}
function parse(arg1, options = {}) {
  if (!arg1) {
    return FALSE;
  }
  if (typeof arg1 === "string" || isRelativePattern(arg1)) {
    const parsedPattern = parsePattern(arg1, options);
    if (parsedPattern === NULL) {
      return FALSE;
    }
    const resultPattern = function(path, basename2) {
      return !!parsedPattern(path, basename2);
    };
    if (parsedPattern.allBasenames) {
      resultPattern.allBasenames = parsedPattern.allBasenames;
    }
    if (parsedPattern.allPaths) {
      resultPattern.allPaths = parsedPattern.allPaths;
    }
    return resultPattern;
  }
  return parsedExpression(arg1, options);
}
function isRelativePattern(obj) {
  const rp = obj;
  if (!rp) {
    return false;
  }
  return typeof rp.base === "string" && typeof rp.pattern === "string";
}
function getBasenameTerms(patternOrExpression) {
  return patternOrExpression.allBasenames || [];
}
function getPathTerms(patternOrExpression) {
  return patternOrExpression.allPaths || [];
}
function parsedExpression(expression, options) {
  const parsedPatterns = aggregateBasenameMatches(Object.getOwnPropertyNames(expression).map((pattern) => parseExpressionPattern(pattern, expression[pattern], options)).filter((pattern) => pattern !== NULL));
  const patternsLength = parsedPatterns.length;
  if (!patternsLength) {
    return NULL;
  }
  if (!parsedPatterns.some((parsedPattern) => !!parsedPattern.requiresSiblings)) {
    if (patternsLength === 1) {
      return parsedPatterns[0];
    }
    const resultExpression2 = function(path, basename2) {
      let resultPromises = void 0;
      for (let i = 0, n = parsedPatterns.length; i < n; i++) {
        const result = parsedPatterns[i](path, basename2);
        if (typeof result === "string") {
          return result;
        }
        if (isThenable(result)) {
          if (!resultPromises) {
            resultPromises = [];
          }
          resultPromises.push(result);
        }
      }
      if (resultPromises) {
        return (async () => {
          for (const resultPromise of resultPromises) {
            const result = await resultPromise;
            if (typeof result === "string") {
              return result;
            }
          }
          return null;
        })();
      }
      return null;
    };
    const withBasenames2 = parsedPatterns.find((pattern) => !!pattern.allBasenames);
    if (withBasenames2) {
      resultExpression2.allBasenames = withBasenames2.allBasenames;
    }
    const allPaths2 = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
    if (allPaths2.length) {
      resultExpression2.allPaths = allPaths2;
    }
    return resultExpression2;
  }
  const resultExpression = function(path, base, hasSibling) {
    let name = void 0;
    let resultPromises = void 0;
    for (let i = 0, n = parsedPatterns.length; i < n; i++) {
      const parsedPattern = parsedPatterns[i];
      if (parsedPattern.requiresSiblings && hasSibling) {
        if (!base) {
          base = basename(path);
        }
        if (!name) {
          name = base.substring(0, base.length - extname(path).length);
        }
      }
      const result = parsedPattern(path, base, name, hasSibling);
      if (typeof result === "string") {
        return result;
      }
      if (isThenable(result)) {
        if (!resultPromises) {
          resultPromises = [];
        }
        resultPromises.push(result);
      }
    }
    if (resultPromises) {
      return (async () => {
        for (const resultPromise of resultPromises) {
          const result = await resultPromise;
          if (typeof result === "string") {
            return result;
          }
        }
        return null;
      })();
    }
    return null;
  };
  const withBasenames = parsedPatterns.find((pattern) => !!pattern.allBasenames);
  if (withBasenames) {
    resultExpression.allBasenames = withBasenames.allBasenames;
  }
  const allPaths = parsedPatterns.reduce((all, current) => current.allPaths ? all.concat(current.allPaths) : all, []);
  if (allPaths.length) {
    resultExpression.allPaths = allPaths;
  }
  return resultExpression;
}
function parseExpressionPattern(pattern, value, options) {
  if (value === false) {
    return NULL;
  }
  const parsedPattern = parsePattern(pattern, options);
  if (parsedPattern === NULL) {
    return NULL;
  }
  if (typeof value === "boolean") {
    return parsedPattern;
  }
  if (value) {
    const when = value.when;
    if (typeof when === "string") {
      const result = (path, basename2, name, hasSibling) => {
        if (!hasSibling || !parsedPattern(path, basename2)) {
          return null;
        }
        const clausePattern = when.replace("$(basename)", () => name);
        const matched = hasSibling(clausePattern);
        return isThenable(matched) ? matched.then((match2) => match2 ? pattern : null) : matched ? pattern : null;
      };
      result.requiresSiblings = true;
      return result;
    }
  }
  return parsedPattern;
}
function aggregateBasenameMatches(parsedPatterns, result) {
  const basenamePatterns = parsedPatterns.filter((parsedPattern) => !!parsedPattern.basenames);
  if (basenamePatterns.length < 2) {
    return parsedPatterns;
  }
  const basenames = basenamePatterns.reduce((all, current) => {
    const basenames2 = current.basenames;
    return basenames2 ? all.concat(basenames2) : all;
  }, []);
  let patterns;
  if (result) {
    patterns = [];
    for (let i = 0, n = basenames.length; i < n; i++) {
      patterns.push(result);
    }
  } else {
    patterns = basenamePatterns.reduce((all, current) => {
      const patterns2 = current.patterns;
      return patterns2 ? all.concat(patterns2) : all;
    }, []);
  }
  const aggregate = function(path, basename2) {
    if (typeof path !== "string") {
      return null;
    }
    if (!basename2) {
      let i;
      for (i = path.length; i > 0; i--) {
        const ch = path.charCodeAt(i - 1);
        if (ch === CharCode.Slash || ch === CharCode.Backslash) {
          break;
        }
      }
      basename2 = path.substring(i);
    }
    const index = basenames.indexOf(basename2);
    return index !== -1 ? patterns[index] : null;
  };
  aggregate.basenames = basenames;
  aggregate.patterns = patterns;
  aggregate.allBasenames = basenames;
  const aggregatedPatterns = parsedPatterns.filter((parsedPattern) => !parsedPattern.basenames);
  aggregatedPatterns.push(aggregate);
  return aggregatedPatterns;
}
function patternsEquals(patternsA, patternsB) {
  return equals(patternsA, patternsB, (a, b) => {
    if (typeof a === "string" && typeof b === "string") {
      return a === b;
    }
    if (typeof a !== "string" && typeof b !== "string") {
      return a.base === b.base && a.pattern === b.pattern;
    }
    return false;
  });
}
export {
  GLOBSTAR,
  GLOB_SPLIT,
  getBasenameTerms,
  getEmptyExpression,
  getPathTerms,
  isEmptyPattern,
  isRelativePattern,
  match,
  parse,
  patternsEquals,
  splitGlobAware
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGdsb2IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc1RoZW5hYmxlIH0gZnJvbSAnLi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbE9yUGFyZW50IH0gZnJvbSAnLi9leHRwYXRoLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUsIHBvc2l4LCBzZXAgfSBmcm9tICcuL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5kc1dpdGhJZ25vcmVDYXNlLCBlcXVhbHNJZ25vcmVDYXNlLCBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzLCBsdHJpbSB9IGZyb20gJy4vc3RyaW5ncy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlbGF0aXZlUGF0dGVybiB7XG5cblx0LyoqXG5cdCAqIEEgYmFzZSBmaWxlIHBhdGggdG8gd2hpY2ggdGhpcyBwYXR0ZXJuIHdpbGwgYmUgbWF0Y2hlZCBhZ2FpbnN0IHJlbGF0aXZlbHkuXG5cdCAqL1xuXHRyZWFkb25seSBiYXNlOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEEgZmlsZSBnbG9iIHBhdHRlcm4gbGlrZSBgKi57dHMsanN9YCB0aGF0IHdpbGwgYmUgbWF0Y2hlZCBvbiBmaWxlIHBhdGhzXG5cdCAqIHJlbGF0aXZlIHRvIHRoZSBiYXNlIHBhdGguXG5cdCAqXG5cdCAqIEV4YW1wbGU6IEdpdmVuIGEgYmFzZSBvZiBgL2hvbWUvd29yay9mb2xkZXJgIGFuZCBhIGZpbGUgcGF0aCBvZiBgL2hvbWUvd29yay9mb2xkZXIvaW5kZXguanNgLFxuXHQgKiB0aGUgZmlsZSBnbG9iIHBhdHRlcm4gd2lsbCBtYXRjaCBvbiBgaW5kZXguanNgLlxuXHQgKi9cblx0cmVhZG9ubHkgcGF0dGVybjogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHByZXNzaW9uIHtcblx0W3BhdHRlcm46IHN0cmluZ106IGJvb2xlYW4gfCBTaWJsaW5nQ2xhdXNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0RW1wdHlFeHByZXNzaW9uKCk6IElFeHByZXNzaW9uIHtcblx0cmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7XG59XG5cbmludGVyZmFjZSBTaWJsaW5nQ2xhdXNlIHtcblx0d2hlbjogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgR0xPQlNUQVIgPSAnKionO1xuZXhwb3J0IGNvbnN0IEdMT0JfU1BMSVQgPSAnLyc7XG5cbmNvbnN0IFBBVEhfUkVHRVggPSAnWy9cXFxcXFxcXF0nO1x0XHQvLyBhbnkgc2xhc2ggb3IgYmFja3NsYXNoXG5jb25zdCBOT19QQVRIX1JFR0VYID0gJ1teL1xcXFxcXFxcXSc7XHQvLyBhbnkgbm9uLXNsYXNoIGFuZCBub24tYmFja3NsYXNoXG5jb25zdCBBTExfRk9SV0FSRF9TTEFTSEVTID0gL1xcLy9nO1xuXG5mdW5jdGlvbiBzdGFyc1RvUmVnRXhwKHN0YXJDb3VudDogbnVtYmVyLCBpc0xhc3RQYXR0ZXJuPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhckNvdW50KSB7XG5cdFx0Y2FzZSAwOlxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdGNhc2UgMTpcblx0XHRcdHJldHVybiBgJHtOT19QQVRIX1JFR0VYfSo/YDsgLy8gMSBzdGFyIG1hdGNoZXMgYW55IG51bWJlciBvZiBjaGFyYWN0ZXJzIGV4Y2VwdCBwYXRoIHNlcGFyYXRvciAoLyBhbmQgXFwpIC0gbm9uIGdyZWVkeSAoPylcblx0XHRkZWZhdWx0OlxuXHRcdFx0Ly8gTWF0Y2hlczogIChQYXRoIFNlcCBPUiBQYXRoIFZhbCBmb2xsb3dlZCBieSBQYXRoIFNlcCkgMC1tYW55IHRpbWVzIGV4Y2VwdCB3aGVuIGl0J3MgdGhlIGxhc3QgcGF0dGVyblxuXHRcdFx0Ly8gICAgICAgICAgIGluIHdoaWNoIGNhc2UgYWxzbyBtYXRjaGVzIChQYXRoIFNlcCBmb2xsb3dlZCBieSBQYXRoIFZhbClcblx0XHRcdC8vIEdyb3VwIGlzIG5vbiBjYXB0dXJpbmcgYmVjYXVzZSB3ZSBkb24ndCBuZWVkIHRvIGNhcHR1cmUgYXQgYWxsICg/Oi4uLilcblx0XHRcdC8vIE92ZXJhbGwgd2UgdXNlIG5vbi1ncmVlZHkgbWF0Y2hpbmcgYmVjYXVzZSBpdCBjb3VsZCBiZSB0aGF0IHdlIG1hdGNoIHRvbyBtdWNoXG5cdFx0XHRyZXR1cm4gYCg/OiR7UEFUSF9SRUdFWH18JHtOT19QQVRIX1JFR0VYfSske1BBVEhfUkVHRVh9JHtpc0xhc3RQYXR0ZXJuID8gYHwke1BBVEhfUkVHRVh9JHtOT19QQVRIX1JFR0VYfStgIDogJyd9KSo/YDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRHbG9iQXdhcmUocGF0dGVybjogc3RyaW5nLCBzcGxpdENoYXI6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0aWYgKCFwYXR0ZXJuKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3Qgc2VnbWVudHM6IHN0cmluZ1tdID0gW107XG5cblx0bGV0IGluQnJhY2VzID0gZmFsc2U7XG5cdGxldCBpbkJyYWNrZXRzID0gZmFsc2U7XG5cblx0bGV0IGN1clZhbCA9ICcnO1xuXHRmb3IgKGNvbnN0IGNoYXIgb2YgcGF0dGVybikge1xuXHRcdHN3aXRjaCAoY2hhcikge1xuXHRcdFx0Y2FzZSBzcGxpdENoYXI6XG5cdFx0XHRcdGlmICghaW5CcmFjZXMgJiYgIWluQnJhY2tldHMpIHtcblx0XHRcdFx0XHRzZWdtZW50cy5wdXNoKGN1clZhbCk7XG5cdFx0XHRcdFx0Y3VyVmFsID0gJyc7XG5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3snOlxuXHRcdFx0XHRpbkJyYWNlcyA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnfSc6XG5cdFx0XHRcdGluQnJhY2VzID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdGluQnJhY2tldHMgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ10nOlxuXHRcdFx0XHRpbkJyYWNrZXRzID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGN1clZhbCArPSBjaGFyO1xuXHR9XG5cblx0Ly8gVGFpbFxuXHRpZiAoY3VyVmFsKSB7XG5cdFx0c2VnbWVudHMucHVzaChjdXJWYWwpO1xuXHR9XG5cblx0cmV0dXJuIHNlZ21lbnRzO1xufVxuXG5mdW5jdGlvbiBwYXJzZVJlZ0V4cChwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXBhdHRlcm4pIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRsZXQgcmVnRXggPSAnJztcblxuXHQvLyBTcGxpdCB1cCBpbnRvIHNlZ21lbnRzIGZvciBlYWNoIHNsYXNoIGZvdW5kXG5cdGNvbnN0IHNlZ21lbnRzID0gc3BsaXRHbG9iQXdhcmUocGF0dGVybiwgR0xPQl9TUExJVCk7XG5cblx0Ly8gU3BlY2lhbCBjYXNlIHdoZXJlIHdlIG9ubHkgaGF2ZSBnbG9ic3RhcnNcblx0aWYgKHNlZ21lbnRzLmV2ZXJ5KHNlZ21lbnQgPT4gc2VnbWVudCA9PT0gR0xPQlNUQVIpKSB7XG5cdFx0cmVnRXggPSAnLionO1xuXHR9XG5cblx0Ly8gQnVpbGQgcmVnZXggb3ZlciBzZWdtZW50c1xuXHRlbHNlIHtcblx0XHRsZXQgcHJldmlvdXNTZWdtZW50V2FzR2xvYlN0YXIgPSBmYWxzZTtcblx0XHRzZWdtZW50cy5mb3JFYWNoKChzZWdtZW50LCBpbmRleCkgPT4ge1xuXG5cdFx0XHQvLyBUcmVhdCBnbG9ic3RhciBzcGVjaWFsbHlcblx0XHRcdGlmIChzZWdtZW50ID09PSBHTE9CU1RBUikge1xuXG5cdFx0XHRcdC8vIGlmIHdlIGhhdmUgbW9yZSB0aGFuIG9uZSBnbG9ic3RhciBhZnRlciBhbm90aGVyLCBqdXN0IGlnbm9yZSBpdFxuXHRcdFx0XHRpZiAocHJldmlvdXNTZWdtZW50V2FzR2xvYlN0YXIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZWdFeCArPSBzdGFyc1RvUmVnRXhwKDIsIGluZGV4ID09PSBzZWdtZW50cy5sZW5ndGggLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQW55dGhpbmcgZWxzZSwgbm90IGdsb2JzdGFyXG5cdFx0XHRlbHNlIHtcblxuXHRcdFx0XHQvLyBTdGF0ZXNcblx0XHRcdFx0bGV0IGluQnJhY2VzID0gZmFsc2U7XG5cdFx0XHRcdGxldCBicmFjZVZhbCA9ICcnO1xuXG5cdFx0XHRcdGxldCBpbkJyYWNrZXRzID0gZmFsc2U7XG5cdFx0XHRcdGxldCBicmFja2V0VmFsID0gJyc7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGFyIG9mIHNlZ21lbnQpIHtcblxuXHRcdFx0XHRcdC8vIFN1cHBvcnQgYnJhY2UgZXhwYW5zaW9uXG5cdFx0XHRcdFx0aWYgKGNoYXIgIT09ICd9JyAmJiBpbkJyYWNlcykge1xuXHRcdFx0XHRcdFx0YnJhY2VWYWwgKz0gY2hhcjtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFN1cHBvcnQgYnJhY2tldHNcblx0XHRcdFx0XHRpZiAoaW5CcmFja2V0cyAmJiAoY2hhciAhPT0gJ10nIHx8ICFicmFja2V0VmFsKSAvKiBdIGlzIGxpdGVyYWxseSBvbmx5IGFsbG93ZWQgYXMgZmlyc3QgY2hhcmFjdGVyIGluIGJyYWNrZXRzIHRvIG1hdGNoIGl0ICovKSB7XG5cdFx0XHRcdFx0XHRsZXQgcmVzOiBzdHJpbmc7XG5cblx0XHRcdFx0XHRcdC8vIHJhbmdlIG9wZXJhdG9yXG5cdFx0XHRcdFx0XHRpZiAoY2hhciA9PT0gJy0nKSB7XG5cdFx0XHRcdFx0XHRcdHJlcyA9IGNoYXI7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIG5lZ2F0aW9uIG9wZXJhdG9yIChvbmx5IHZhbGlkIG9uIGZpcnN0IGluZGV4IGluIGJyYWNrZXQpXG5cdFx0XHRcdFx0XHRlbHNlIGlmICgoY2hhciA9PT0gJ14nIHx8IGNoYXIgPT09ICchJykgJiYgIWJyYWNrZXRWYWwpIHtcblx0XHRcdFx0XHRcdFx0cmVzID0gJ14nO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBnbG9iIHNwbGl0IG1hdGNoaW5nIGlzIG5vdCBhbGxvd2VkIHdpdGhpbiBjaGFyYWN0ZXIgcmFuZ2VzXG5cdFx0XHRcdFx0XHQvLyBzZWUgaHR0cDovL21hbjcub3JnL2xpbnV4L21hbi1wYWdlcy9tYW43L2dsb2IuNy5odG1sXG5cdFx0XHRcdFx0XHRlbHNlIGlmIChjaGFyID09PSBHTE9CX1NQTElUKSB7XG5cdFx0XHRcdFx0XHRcdHJlcyA9ICcnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBhbnl0aGluZyBlbHNlIGdldHMgZXNjYXBlZFxuXHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlcyA9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY2hhcik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGJyYWNrZXRWYWwgKz0gcmVzO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c3dpdGNoIChjaGFyKSB7XG5cdFx0XHRcdFx0XHRjYXNlICd7Jzpcblx0XHRcdFx0XHRcdFx0aW5CcmFjZXMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblxuXHRcdFx0XHRcdFx0Y2FzZSAnWyc6XG5cdFx0XHRcdFx0XHRcdGluQnJhY2tldHMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblxuXHRcdFx0XHRcdFx0Y2FzZSAnfSc6IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hvaWNlcyA9IHNwbGl0R2xvYkF3YXJlKGJyYWNlVmFsLCAnLCcpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIENvbnZlcnRzIHtmb28sYmFyfSA9PiBbZm9vfGJhcl1cblx0XHRcdFx0XHRcdFx0Y29uc3QgYnJhY2VSZWdFeHAgPSBgKD86JHtjaG9pY2VzLm1hcChjaG9pY2UgPT4gcGFyc2VSZWdFeHAoY2hvaWNlKSkuam9pbignfCcpfSlgO1xuXG5cdFx0XHRcdFx0XHRcdHJlZ0V4ICs9IGJyYWNlUmVnRXhwO1xuXG5cdFx0XHRcdFx0XHRcdGluQnJhY2VzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGJyYWNlVmFsID0gJyc7XG5cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNhc2UgJ10nOiB7XG5cdFx0XHRcdFx0XHRcdHJlZ0V4ICs9ICgnWycgKyBicmFja2V0VmFsICsgJ10nKTtcblxuXHRcdFx0XHRcdFx0XHRpbkJyYWNrZXRzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdGJyYWNrZXRWYWwgPSAnJztcblxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y2FzZSAnPyc6XG5cdFx0XHRcdFx0XHRcdHJlZ0V4ICs9IE5PX1BBVEhfUkVHRVg7IC8vIDEgPyBtYXRjaGVzIGFueSBzaW5nbGUgY2hhcmFjdGVyIGV4Y2VwdCBwYXRoIHNlcGFyYXRvciAoLyBhbmQgXFwpXG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXG5cdFx0XHRcdFx0XHRjYXNlICcqJzpcblx0XHRcdFx0XHRcdFx0cmVnRXggKz0gc3RhcnNUb1JlZ0V4cCgxKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdHJlZ0V4ICs9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY2hhcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGFpbDogQWRkIHRoZSBzbGFzaCB3ZSBoYWQgc3BsaXQgb24gaWYgdGhlcmUgaXMgbW9yZSB0b1xuXHRcdFx0XHQvLyBjb21lIGFuZCB0aGUgcmVtYWluaW5nIHBhdHRlcm4gaXMgbm90IGEgZ2xvYnN0YXJcblx0XHRcdFx0Ly8gRm9yIGV4YW1wbGUgaWYgcGF0dGVybjogc29tZS8qKi8qLmpzIHdlIHdhbnQgdGhlIFwiL1wiIGFmdGVyXG5cdFx0XHRcdC8vIHNvbWUgdG8gYmUgaW5jbHVkZWQgaW4gdGhlIFJlZ0V4IHRvIHByZXZlbnQgYSBmb2xkZXIgY2FsbGVkXG5cdFx0XHRcdC8vIFwic29tZXRoaW5nXCIgdG8gbWF0Y2ggYXMgd2VsbC5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdGluZGV4IDwgc2VnbWVudHMubGVuZ3RoIC0gMSAmJlx0XHRcdC8vIG1vcmUgc2VnbWVudHMgdG8gY29tZSBhZnRlciB0aGlzXG5cdFx0XHRcdFx0KFxuXHRcdFx0XHRcdFx0c2VnbWVudHNbaW5kZXggKyAxXSAhPT0gR0xPQlNUQVIgfHxcdC8vIG5leHQgc2VnbWVudCBpcyBub3QgKiosIG9yLi4uXG5cdFx0XHRcdFx0XHRpbmRleCArIDIgPCBzZWdtZW50cy5sZW5ndGhcdFx0XHQvLyAuLi5uZXh0IHNlZ21lbnQgaXMgKiogYnV0IHRoZXJlIGlzIG1vcmUgc2VnbWVudHMgYWZ0ZXIgdGhhdFxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmVnRXggKz0gUEFUSF9SRUdFWDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyB1cGRhdGUgZ2xvYnN0YXIgc3RhdGVcblx0XHRcdHByZXZpb3VzU2VnbWVudFdhc0dsb2JTdGFyID0gKHNlZ21lbnQgPT09IEdMT0JTVEFSKTtcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiByZWdFeDtcbn1cblxuLy8gcmVnZXhlcyB0byBjaGVjayBmb3IgdHJpdmlhbCBnbG9iIHBhdHRlcm5zIHRoYXQganVzdCBjaGVjayBmb3IgU3RyaW5nI2VuZHNXaXRoXG5jb25zdCBUMSA9IC9eXFwqXFwqXFwvXFwqXFwuW1xcd1xcLi1dKyQvOyBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vICoqLyouc29tZXRoaW5nXG5jb25zdCBUMiA9IC9eXFwqXFwqXFwvKFtcXHdcXC4tXSspXFwvPyQvOyBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyAqKi9zb21ldGhpbmdcbmNvbnN0IFQzID0gL157XFwqXFwqXFwvXFwqP1tcXHdcXC4tXStcXC8/KCxcXCpcXCpcXC9cXCo/W1xcd1xcLi1dK1xcLz8pKn0kLzsgXHRcdFx0XHRcdFx0Ly8geyoqLyouc29tZXRoaW5nLCoqLyouZWxzZX0gb3IgeyoqL3BhY2thZ2UuanNvbiwqKi9wcm9qZWN0Lmpzb259XG5jb25zdCBUM18yID0gL157XFwqXFwqXFwvXFwqP1tcXHdcXC4tXSsoXFwvKFxcKlxcKik/KT8oLFxcKlxcKlxcL1xcKj9bXFx3XFwuLV0rKFxcLyhcXCpcXCopPyk/KSp9JC87IFx0Ly8gTGlrZSBUMywgd2l0aCBvcHRpb25hbCB0cmFpbGluZyAvKipcbmNvbnN0IFQ0ID0gL15cXCpcXCooKFxcL1tcXHdcXC4tXSspKylcXC8/JC87IFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vICoqL3NvbWV0aGluZy9lbHNlXG5jb25zdCBUNSA9IC9eKFtcXHdcXC4tXSsoXFwvW1xcd1xcLi1dKykqKVxcLz8kLzsgXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIHNvbWV0aGluZy9lbHNlXG5cbmV4cG9ydCB0eXBlIFBhcnNlZFBhdHRlcm4gPSAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykgPT4gYm9vbGVhbjtcblxuLy8gVGhlIGBQYXJzZWRFeHByZXNzaW9uYCByZXR1cm5zIGEgYFByb21pc2VgXG4vLyBpZmYgYGhhc1NpYmxpbmdgIHJldHVybnMgYSBgUHJvbWlzZWAuXG5leHBvcnQgdHlwZSBQYXJzZWRFeHByZXNzaW9uID0gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPikgPT4gc3RyaW5nIHwgbnVsbCB8IFByb21pc2U8c3RyaW5nIHwgbnVsbD4gLyogdGhlIG1hdGNoaW5nIHBhdHRlcm4gKi87XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdsb2JPcHRpb25zIHtcblxuXHQvKipcblx0ICogU2ltcGxpZnkgcGF0dGVybnMgZm9yIHVzZSBhcyBleGNsdXNpb24gZmlsdGVycyBkdXJpbmdcblx0ICogdHJlZSB0cmF2ZXJzYWwgdG8gc2tpcCBlbnRpcmUgc3VidHJlZXMuIENhbm5vdCBiZSB1c2VkXG5cdCAqIG91dHNpZGUgb2YgYSB0cmVlIHRyYXZlcnNhbC5cblx0ICovXG5cdHRyaW1Gb3JFeGNsdXNpb25zPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hldGhlciBnbG9iIHBhdHRlcm4gbWF0Y2hpbmcgc2hvdWxkIGJlIGNhc2UgaW5zZW5zaXRpdmUuXG5cdCAqL1xuXHRpZ25vcmVDYXNlPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElHbG9iT3B0aW9uc0ludGVybmFsIGV4dGVuZHMgSUdsb2JPcHRpb25zIHtcblx0ZXF1YWxzOiAoYTogc3RyaW5nLCBiOiBzdHJpbmcpID0+IGJvb2xlYW47XG5cdGVuZHNXaXRoOiAoc3RyOiBzdHJpbmcsIGNhbmRpZGF0ZTogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRpc0VxdWFsT3JQYXJlbnQ6IChiYXNlOiBzdHJpbmcsIGNhbmRpZGF0ZTogc3RyaW5nKSA9PiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgUGFyc2VkU3RyaW5nUGF0dGVybiB7XG5cdChwYXRoOiBzdHJpbmcsIGJhc2VuYW1lPzogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB8IFByb21pc2U8c3RyaW5nIHwgbnVsbD4gLyogdGhlIG1hdGNoaW5nIHBhdHRlcm4gKi87XG5cdGJhc2VuYW1lcz86IHN0cmluZ1tdO1xuXHRwYXR0ZXJucz86IHN0cmluZ1tdO1xuXHRhbGxCYXNlbmFtZXM/OiBzdHJpbmdbXTtcblx0YWxsUGF0aHM/OiBzdHJpbmdbXTtcbn1cblxuaW50ZXJmYWNlIFBhcnNlZEV4cHJlc3Npb25QYXR0ZXJuIHtcblx0KHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPik6IHN0cmluZyB8IG51bGwgfCBQcm9taXNlPHN0cmluZyB8IG51bGw+IC8qIHRoZSBtYXRjaGluZyBwYXR0ZXJuICovO1xuXHRyZXF1aXJlc1NpYmxpbmdzPzogYm9vbGVhbjtcblx0YWxsQmFzZW5hbWVzPzogc3RyaW5nW107XG5cdGFsbFBhdGhzPzogc3RyaW5nW107XG59XG5cbmNvbnN0IENBQ0hFID0gbmV3IExSVUNhY2hlPHN0cmluZywgUGFyc2VkU3RyaW5nUGF0dGVybj4oMTAwMDApOyAvLyBib3VuZGVkIHRvIDEwMDAwIGVsZW1lbnRzXG5cbmNvbnN0IEZBTFNFID0gZnVuY3Rpb24gKCkge1xuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCBOVUxMID0gZnVuY3Rpb24gKCk6IHN0cmluZyB8IG51bGwge1xuXHRyZXR1cm4gbnVsbDtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgYSBwcm92aWRlZCBwYXJzZWQgcGF0dGVybiBvciBleHByZXNzaW9uXG4gKiBpcyBlbXB0eSAtIGhlbmNlIGl0IHdvbid0IGV2ZXIgbWF0Y2ggYW55dGhpbmcuXG4gKlxuICogU2VlIHtAbGluayBGQUxTRX0gYW5kIHtAbGluayBOVUxMfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRW1wdHlQYXR0ZXJuKHBhdHRlcm46IFBhcnNlZFBhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uKTogcGF0dGVybiBpcyAodHlwZW9mIEZBTFNFIHwgdHlwZW9mIE5VTEwpIHtcblx0aWYgKHBhdHRlcm4gPT09IEZBTFNFKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAocGF0dGVybiA9PT0gTlVMTCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBwYXJzZVBhdHRlcm4oYXJnMTogc3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybiwgb3B0aW9uczogSUdsb2JPcHRpb25zKTogUGFyc2VkU3RyaW5nUGF0dGVybiB7XG5cdGlmICghYXJnMSkge1xuXHRcdHJldHVybiBOVUxMO1xuXHR9XG5cblx0Ly8gSGFuZGxlIHJlbGF0aXZlIHBhdHRlcm5zXG5cdGxldCBwYXR0ZXJuOiBzdHJpbmc7XG5cdGlmICh0eXBlb2YgYXJnMSAhPT0gJ3N0cmluZycpIHtcblx0XHRwYXR0ZXJuID0gYXJnMS5wYXR0ZXJuO1xuXHR9IGVsc2Uge1xuXHRcdHBhdHRlcm4gPSBhcmcxO1xuXHR9XG5cblx0Ly8gV2hpdGVzcGFjZSB0cmltbWluZ1xuXHRwYXR0ZXJuID0gcGF0dGVybi50cmltKCk7XG5cblx0Y29uc3QgaWdub3JlQ2FzZSA9IG9wdGlvbnMuaWdub3JlQ2FzZSA/PyBmYWxzZTtcblx0Y29uc3QgaW50ZXJuYWxPcHRpb25zID0ge1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0ZXF1YWxzOiBpZ25vcmVDYXNlID8gZXF1YWxzSWdub3JlQ2FzZSA6IChhOiBzdHJpbmcsIGI6IHN0cmluZykgPT4gYSA9PT0gYixcblx0XHRlbmRzV2l0aDogaWdub3JlQ2FzZSA/IGVuZHNXaXRoSWdub3JlQ2FzZSA6IChzdHI6IHN0cmluZywgY2FuZGlkYXRlOiBzdHJpbmcpID0+IHN0ci5lbmRzV2l0aChjYW5kaWRhdGUpLFxuXHRcdGlzRXF1YWxPclBhcmVudDogKGJhc2U6IHN0cmluZywgY2FuZGlkYXRlOiBzdHJpbmcpID0+IGlzRXF1YWxPclBhcmVudChiYXNlLCBjYW5kaWRhdGUsIG9wdGlvbnMuaWdub3JlQ2FzZSA/PyAhaXNMaW51eCAvKiBwcmVzZXJ2ZSBvbGQgYmVoYXZpb3VyIGZvciB3aGVuIG9wdGlvbiBpcyBub3QgYWRvcHRlZCAqLylcblx0fTtcblxuXHQvLyBDaGVjayBjYWNoZVxuXHRjb25zdCBwYXR0ZXJuS2V5ID0gYCR7aWdub3JlQ2FzZSA/IHBhdHRlcm4udG9Mb3dlckNhc2UoKSA6IHBhdHRlcm59XyR7ISFvcHRpb25zLnRyaW1Gb3JFeGNsdXNpb25zfV8ke2lnbm9yZUNhc2V9YDtcblx0bGV0IHBhcnNlZFBhdHRlcm4gPSBDQUNIRS5nZXQocGF0dGVybktleSk7XG5cdGlmIChwYXJzZWRQYXR0ZXJuKSB7XG5cdFx0cmV0dXJuIHdyYXBSZWxhdGl2ZVBhdHRlcm4ocGFyc2VkUGF0dGVybiwgYXJnMSwgaW50ZXJuYWxPcHRpb25zKTtcblx0fVxuXG5cdC8vIENoZWNrIGZvciBUcml2aWFsc1xuXHRsZXQgbWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdGlmIChUMS50ZXN0KHBhdHRlcm4pKSB7XG5cdFx0cGFyc2VkUGF0dGVybiA9IHRyaXZpYTEocGF0dGVybi5zdWJzdHJpbmcoNCksIHBhdHRlcm4sIGludGVybmFsT3B0aW9ucyk7IFx0XHRcdC8vIGNvbW1vbiBwYXR0ZXJuOiAqKi8qLnR4dCBqdXN0IG5lZWQgZW5kc1dpdGggY2hlY2tcblx0fSBlbHNlIGlmIChtYXRjaCA9IFQyLmV4ZWModHJpbUZvckV4Y2x1c2lvbnMocGF0dGVybiwgaW50ZXJuYWxPcHRpb25zKSkpIHsgXHRcdFx0XHQvLyBjb21tb24gcGF0dGVybjogKiovc29tZS50eHQganVzdCBuZWVkIGJhc2VuYW1lIGNoZWNrXG5cdFx0cGFyc2VkUGF0dGVybiA9IHRyaXZpYTIobWF0Y2hbMV0sIHBhdHRlcm4sIGludGVybmFsT3B0aW9ucyk7XG5cdH0gZWxzZSBpZiAoKG9wdGlvbnMudHJpbUZvckV4Y2x1c2lvbnMgPyBUM18yIDogVDMpLnRlc3QocGF0dGVybikpIHsgXHRcdFx0XHRcdC8vIHJlcGV0aXRpb24gb2YgY29tbW9uIHBhdHRlcm5zIChzZWUgYWJvdmUpIHsqKi8qLnR4dCwqKi8qLnBuZ31cblx0XHRwYXJzZWRQYXR0ZXJuID0gdHJpdmlhMyhwYXR0ZXJuLCBpbnRlcm5hbE9wdGlvbnMpO1xuXHR9IGVsc2UgaWYgKG1hdGNoID0gVDQuZXhlYyh0cmltRm9yRXhjbHVzaW9ucyhwYXR0ZXJuLCBpbnRlcm5hbE9wdGlvbnMpKSkgeyBcdFx0XHRcdC8vIGNvbW1vbiBwYXR0ZXJuOiAqKi9zb21ldGhpbmcvZWxzZSBqdXN0IG5lZWQgZW5kc1dpdGggY2hlY2tcblx0XHRwYXJzZWRQYXR0ZXJuID0gdHJpdmlhNGFuZDUobWF0Y2hbMV0uc3Vic3RyaW5nKDEpLCBwYXR0ZXJuLCB0cnVlLCBpbnRlcm5hbE9wdGlvbnMpO1xuXHR9IGVsc2UgaWYgKG1hdGNoID0gVDUuZXhlYyh0cmltRm9yRXhjbHVzaW9ucyhwYXR0ZXJuLCBpbnRlcm5hbE9wdGlvbnMpKSkgeyBcdFx0XHRcdC8vIGNvbW1vbiBwYXR0ZXJuOiBzb21ldGhpbmcvZWxzZSBqdXN0IG5lZWQgZXF1YWxzIGNoZWNrXG5cdFx0cGFyc2VkUGF0dGVybiA9IHRyaXZpYTRhbmQ1KG1hdGNoWzFdLCBwYXR0ZXJuLCBmYWxzZSwgaW50ZXJuYWxPcHRpb25zKTtcblx0fVxuXG5cdC8vIE90aGVyd2lzZSBjb252ZXJ0IHRvIHBhdHRlcm5cblx0ZWxzZSB7XG5cdFx0cGFyc2VkUGF0dGVybiA9IHRvUmVnRXhwKHBhdHRlcm4sIGludGVybmFsT3B0aW9ucyk7XG5cdH1cblxuXHQvLyBDYWNoZVxuXHRDQUNIRS5zZXQocGF0dGVybktleSwgcGFyc2VkUGF0dGVybik7XG5cblx0cmV0dXJuIHdyYXBSZWxhdGl2ZVBhdHRlcm4ocGFyc2VkUGF0dGVybiwgYXJnMSwgaW50ZXJuYWxPcHRpb25zKTtcbn1cblxuZnVuY3Rpb24gd3JhcFJlbGF0aXZlUGF0dGVybihwYXJzZWRQYXR0ZXJuOiBQYXJzZWRTdHJpbmdQYXR0ZXJuLCBhcmcyOiBzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuLCBvcHRpb25zOiBJR2xvYk9wdGlvbnNJbnRlcm5hbCk6IFBhcnNlZFN0cmluZ1BhdHRlcm4ge1xuXHRpZiAodHlwZW9mIGFyZzIgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHBhcnNlZFBhdHRlcm47XG5cdH1cblxuXHRjb25zdCB3cmFwcGVkUGF0dGVybjogUGFyc2VkU3RyaW5nUGF0dGVybiA9IGZ1bmN0aW9uIChwYXRoLCBiYXNlbmFtZSkge1xuXHRcdGlmICghb3B0aW9ucy5pc0VxdWFsT3JQYXJlbnQocGF0aCwgYXJnMi5iYXNlKSkge1xuXHRcdFx0Ly8gc2tpcCBnbG9iIG1hdGNoaW5nIGlmIGBiYXNlYCBpcyBub3QgYSBwYXJlbnQgb2YgYHBhdGhgXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBHaXZlbiB3ZSBoYXZlIGNoZWNrZWQgYGJhc2VgIGJlaW5nIGEgcGFyZW50IG9mIGBwYXRoYCxcblx0XHQvLyB3ZSBjYW4gbm93IHJlbW92ZSB0aGUgYGJhc2VgIHBvcnRpb24gb2YgdGhlIGBwYXRoYFxuXHRcdC8vIGFuZCBvbmx5IG1hdGNoIG9uIHRoZSByZW1haW5pbmcgcGF0aCBjb21wb25lbnRzXG5cdFx0Ly8gRm9yIHRoYXQgd2UgdHJ5IHRvIGV4dHJhY3QgdGhlIHBvcnRpb24gb2YgdGhlIGBwYXRoYFxuXHRcdC8vIHRoYXQgY29tZXMgYWZ0ZXIgdGhlIGBiYXNlYCBwb3J0aW9uLiBXZSBoYXZlIHRvIGFjY291bnRcblx0XHQvLyBmb3IgdGhlIGZhY3QgdGhhdCBgYmFzZWAgbWlnaHQgZW5kIGluIGEgcGF0aCBzZXBhcmF0b3Jcblx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE2MjQ5OClcblxuXHRcdHJldHVybiBwYXJzZWRQYXR0ZXJuKGx0cmltKHBhdGguc3Vic3RyaW5nKGFyZzIuYmFzZS5sZW5ndGgpLCBzZXApLCBiYXNlbmFtZSk7XG5cdH07XG5cblx0Ly8gTWFrZSBzdXJlIHRvIHByZXNlcnZlIGFzc29jaWF0ZWQgbWV0YWRhdGFcblx0d3JhcHBlZFBhdHRlcm4uYWxsQmFzZW5hbWVzID0gcGFyc2VkUGF0dGVybi5hbGxCYXNlbmFtZXM7XG5cdHdyYXBwZWRQYXR0ZXJuLmFsbFBhdGhzID0gcGFyc2VkUGF0dGVybi5hbGxQYXRocztcblx0d3JhcHBlZFBhdHRlcm4uYmFzZW5hbWVzID0gcGFyc2VkUGF0dGVybi5iYXNlbmFtZXM7XG5cdHdyYXBwZWRQYXR0ZXJuLnBhdHRlcm5zID0gcGFyc2VkUGF0dGVybi5wYXR0ZXJucztcblxuXHRyZXR1cm4gd3JhcHBlZFBhdHRlcm47XG59XG5cbmZ1bmN0aW9uIHRyaW1Gb3JFeGNsdXNpb25zKHBhdHRlcm46IHN0cmluZywgb3B0aW9uczogSUdsb2JPcHRpb25zKTogc3RyaW5nIHtcblx0cmV0dXJuIG9wdGlvbnMudHJpbUZvckV4Y2x1c2lvbnMgJiYgcGF0dGVybi5lbmRzV2l0aCgnLyoqJykgPyBwYXR0ZXJuLnN1YnN0cmluZygwLCBwYXR0ZXJuLmxlbmd0aCAtIDIpIDogcGF0dGVybjsgLy8gZHJvcHBpbmcgKiosIHRhaWxpbmcgLyBpcyBkcm9wcGVkIGxhdGVyXG59XG5cbi8vIGNvbW1vbiBwYXR0ZXJuOiAqKi8qLnR4dCBqdXN0IG5lZWQgZW5kc1dpdGggY2hlY2tcbmZ1bmN0aW9uIHRyaXZpYTEoYmFzZTogc3RyaW5nLCBwYXR0ZXJuOiBzdHJpbmcsIG9wdGlvbnM6IElHbG9iT3B0aW9uc0ludGVybmFsKTogUGFyc2VkU3RyaW5nUGF0dGVybiB7XG5cdHJldHVybiBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykge1xuXHRcdHJldHVybiB0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycgJiYgb3B0aW9ucy5lbmRzV2l0aChwYXRoLCBiYXNlKSA/IHBhdHRlcm4gOiBudWxsO1xuXHR9O1xufVxuXG4vLyBjb21tb24gcGF0dGVybjogKiovc29tZS50eHQganVzdCBuZWVkIGJhc2VuYW1lIGNoZWNrXG5mdW5jdGlvbiB0cml2aWEyKGJhc2U6IHN0cmluZywgcGF0dGVybjogc3RyaW5nLCBvcHRpb25zOiBJR2xvYk9wdGlvbnNJbnRlcm5hbCk6IFBhcnNlZFN0cmluZ1BhdHRlcm4ge1xuXHRjb25zdCBzbGFzaEJhc2UgPSBgLyR7YmFzZX1gO1xuXHRjb25zdCBiYWNrc2xhc2hCYXNlID0gYFxcXFwke2Jhc2V9YDtcblxuXHRjb25zdCBwYXJzZWRQYXR0ZXJuOiBQYXJzZWRTdHJpbmdQYXR0ZXJuID0gZnVuY3Rpb24gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoYmFzZW5hbWUpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmVxdWFscyhiYXNlbmFtZSwgYmFzZSkgPyBwYXR0ZXJuIDogbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3B0aW9ucy5lcXVhbHMocGF0aCwgYmFzZSkgfHwgb3B0aW9ucy5lbmRzV2l0aChwYXRoLCBzbGFzaEJhc2UpIHx8IG9wdGlvbnMuZW5kc1dpdGgocGF0aCwgYmFja3NsYXNoQmFzZSkgPyBwYXR0ZXJuIDogbnVsbDtcblx0fTtcblxuXHRjb25zdCBiYXNlbmFtZXMgPSBbYmFzZV07XG5cdHBhcnNlZFBhdHRlcm4uYmFzZW5hbWVzID0gYmFzZW5hbWVzO1xuXHRwYXJzZWRQYXR0ZXJuLnBhdHRlcm5zID0gW3BhdHRlcm5dO1xuXHRwYXJzZWRQYXR0ZXJuLmFsbEJhc2VuYW1lcyA9IGJhc2VuYW1lcztcblxuXHRyZXR1cm4gcGFyc2VkUGF0dGVybjtcbn1cblxuLy8gcmVwZXRpdGlvbiBvZiBjb21tb24gcGF0dGVybnMgKHNlZSBhYm92ZSkgeyoqLyoudHh0LCoqLyoucG5nfVxuZnVuY3Rpb24gdHJpdmlhMyhwYXR0ZXJuOiBzdHJpbmcsIG9wdGlvbnM6IElHbG9iT3B0aW9uc0ludGVybmFsKTogUGFyc2VkU3RyaW5nUGF0dGVybiB7XG5cdGNvbnN0IHBhcnNlZFBhdHRlcm5zID0gYWdncmVnYXRlQmFzZW5hbWVNYXRjaGVzKHBhdHRlcm4uc2xpY2UoMSwgLTEpXG5cdFx0LnNwbGl0KCcsJylcblx0XHQubWFwKHBhdHRlcm4gPT4gcGFyc2VQYXR0ZXJuKHBhdHRlcm4sIG9wdGlvbnMpKVxuXHRcdC5maWx0ZXIocGF0dGVybiA9PiBwYXR0ZXJuICE9PSBOVUxMKSwgcGF0dGVybik7XG5cblx0Y29uc3QgcGF0dGVybnNMZW5ndGggPSBwYXJzZWRQYXR0ZXJucy5sZW5ndGg7XG5cdGlmICghcGF0dGVybnNMZW5ndGgpIHtcblx0XHRyZXR1cm4gTlVMTDtcblx0fVxuXG5cdGlmIChwYXR0ZXJuc0xlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBwYXJzZWRQYXR0ZXJuc1swXTtcblx0fVxuXG5cdGNvbnN0IHBhcnNlZFBhdHRlcm46IFBhcnNlZFN0cmluZ1BhdHRlcm4gPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykge1xuXHRcdGZvciAobGV0IGkgPSAwLCBuID0gcGFyc2VkUGF0dGVybnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRpZiAocGFyc2VkUGF0dGVybnNbaV0ocGF0aCwgYmFzZW5hbWUpKSB7XG5cdFx0XHRcdHJldHVybiBwYXR0ZXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9O1xuXG5cdGNvbnN0IHdpdGhCYXNlbmFtZXMgPSBwYXJzZWRQYXR0ZXJucy5maW5kKHBhdHRlcm4gPT4gISFwYXR0ZXJuLmFsbEJhc2VuYW1lcyk7XG5cdGlmICh3aXRoQmFzZW5hbWVzKSB7XG5cdFx0cGFyc2VkUGF0dGVybi5hbGxCYXNlbmFtZXMgPSB3aXRoQmFzZW5hbWVzLmFsbEJhc2VuYW1lcztcblx0fVxuXG5cdGNvbnN0IGFsbFBhdGhzID0gcGFyc2VkUGF0dGVybnMucmVkdWNlKChhbGwsIGN1cnJlbnQpID0+IGN1cnJlbnQuYWxsUGF0aHMgPyBhbGwuY29uY2F0KGN1cnJlbnQuYWxsUGF0aHMpIDogYWxsLCBbXSBhcyBzdHJpbmdbXSk7XG5cdGlmIChhbGxQYXRocy5sZW5ndGgpIHtcblx0XHRwYXJzZWRQYXR0ZXJuLmFsbFBhdGhzID0gYWxsUGF0aHM7XG5cdH1cblxuXHRyZXR1cm4gcGFyc2VkUGF0dGVybjtcbn1cblxuLy8gY29tbW9uIHBhdHRlcm5zOiAqKi9zb21ldGhpbmcvZWxzZSBqdXN0IG5lZWQgZW5kc1dpdGggY2hlY2ssIHNvbWV0aGluZy9lbHNlIGp1c3QgbmVlZHMgYW5kIGVxdWFscyBjaGVja1xuZnVuY3Rpb24gdHJpdmlhNGFuZDUodGFyZ2V0UGF0aDogc3RyaW5nLCBwYXR0ZXJuOiBzdHJpbmcsIG1hdGNoUGF0aEVuZHM6IGJvb2xlYW4sIG9wdGlvbnM6IElHbG9iT3B0aW9uc0ludGVybmFsKTogUGFyc2VkU3RyaW5nUGF0dGVybiB7XG5cdGNvbnN0IHVzaW5nUG9zaXhTZXAgPSBzZXAgPT09IHBvc2l4LnNlcDtcblx0Y29uc3QgbmF0aXZlUGF0aCA9IHVzaW5nUG9zaXhTZXAgPyB0YXJnZXRQYXRoIDogdGFyZ2V0UGF0aC5yZXBsYWNlKEFMTF9GT1JXQVJEX1NMQVNIRVMsIHNlcCk7XG5cdGNvbnN0IG5hdGl2ZVBhdGhFbmQgPSBzZXAgKyBuYXRpdmVQYXRoO1xuXHRjb25zdCB0YXJnZXRQYXRoRW5kID0gcG9zaXguc2VwICsgdGFyZ2V0UGF0aDtcblxuXHRsZXQgcGFyc2VkUGF0dGVybjogUGFyc2VkU3RyaW5nUGF0dGVybjtcblx0aWYgKG1hdGNoUGF0aEVuZHMpIHtcblx0XHRwYXJzZWRQYXR0ZXJuID0gZnVuY3Rpb24gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycgJiYgKFxuXHRcdFx0XHQob3B0aW9ucy5lcXVhbHMocGF0aCwgbmF0aXZlUGF0aCkgfHwgb3B0aW9ucy5lbmRzV2l0aChwYXRoLCBuYXRpdmVQYXRoRW5kKSkgfHxcblx0XHRcdFx0IXVzaW5nUG9zaXhTZXAgJiYgKG9wdGlvbnMuZXF1YWxzKHBhdGgsIHRhcmdldFBhdGgpIHx8IG9wdGlvbnMuZW5kc1dpdGgocGF0aCwgdGFyZ2V0UGF0aEVuZCkpXG5cdFx0XHQpID8gcGF0dGVybiA6IG51bGw7XG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRwYXJzZWRQYXR0ZXJuID0gZnVuY3Rpb24gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcGF0aCA9PT0gJ3N0cmluZycgJiYgKG9wdGlvbnMuZXF1YWxzKHBhdGgsIG5hdGl2ZVBhdGgpIHx8ICghdXNpbmdQb3NpeFNlcCAmJiBvcHRpb25zLmVxdWFscyhwYXRoLCB0YXJnZXRQYXRoKSkpID8gcGF0dGVybiA6IG51bGw7XG5cdFx0fTtcblx0fVxuXG5cdHBhcnNlZFBhdHRlcm4uYWxsUGF0aHMgPSBbKG1hdGNoUGF0aEVuZHMgPyAnKi8nIDogJy4vJykgKyB0YXJnZXRQYXRoXTtcblxuXHRyZXR1cm4gcGFyc2VkUGF0dGVybjtcbn1cblxuZnVuY3Rpb24gdG9SZWdFeHAocGF0dGVybjogc3RyaW5nLCBvcHRpb25zOiBJR2xvYk9wdGlvbnMpOiBQYXJzZWRTdHJpbmdQYXR0ZXJuIHtcblx0dHJ5IHtcblx0XHRjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKGBeJHtwYXJzZVJlZ0V4cChwYXR0ZXJuKX0kYCwgb3B0aW9ucy5pZ25vcmVDYXNlID8gJ2knIDogdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gZnVuY3Rpb24gKHBhdGg6IHN0cmluZykge1xuXHRcdFx0cmVnRXhwLmxhc3RJbmRleCA9IDA7IC8vIHJlc2V0IFJlZ0V4cCB0byBpdHMgaW5pdGlhbCBzdGF0ZSB0byByZXVzZSBpdCFcblxuXHRcdFx0cmV0dXJuIHR5cGVvZiBwYXRoID09PSAnc3RyaW5nJyAmJiByZWdFeHAudGVzdChwYXRoKSA/IHBhdHRlcm4gOiBudWxsO1xuXHRcdH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBOVUxMO1xuXHR9XG59XG5cbi8qKlxuICogU2ltcGxpZmllZCBnbG9iIG1hdGNoaW5nLiBTdXBwb3J0cyBhIHN1YnNldCBvZiBnbG9iIHBhdHRlcm5zOlxuICogKiBgKmAgdG8gbWF0Y2ggemVybyBvciBtb3JlIGNoYXJhY3RlcnMgaW4gYSBwYXRoIHNlZ21lbnRcbiAqICogYD9gIHRvIG1hdGNoIG9uIG9uZSBjaGFyYWN0ZXIgaW4gYSBwYXRoIHNlZ21lbnRcbiAqICogYCoqYCB0byBtYXRjaCBhbnkgbnVtYmVyIG9mIHBhdGggc2VnbWVudHMsIGluY2x1ZGluZyBub25lXG4gKiAqIGB7fWAgdG8gZ3JvdXAgY29uZGl0aW9ucyAoZS5nLiAqLnt0cyxqc30gbWF0Y2hlcyBhbGwgVHlwZVNjcmlwdCBhbmQgSmF2YVNjcmlwdCBmaWxlcylcbiAqICogYFtdYCB0byBkZWNsYXJlIGEgcmFuZ2Ugb2YgY2hhcmFjdGVycyB0byBtYXRjaCBpbiBhIHBhdGggc2VnbWVudCAoZS5nLiwgYGV4YW1wbGUuWzAtOV1gIHRvIG1hdGNoIG9uIGBleGFtcGxlLjBgLCBgZXhhbXBsZS4xYCwgXHUyMDI2KVxuICogKiBgWyEuLi5dYCB0byBuZWdhdGUgYSByYW5nZSBvZiBjaGFyYWN0ZXJzIHRvIG1hdGNoIGluIGEgcGF0aCBzZWdtZW50IChlLmcuLCBgZXhhbXBsZS5bITAtOV1gIHRvIG1hdGNoIG9uIGBleGFtcGxlLmFgLCBgZXhhbXBsZS5iYCwgYnV0IG5vdCBgZXhhbXBsZS4wYClcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoKHBhdHRlcm46IHN0cmluZyB8IElSZWxhdGl2ZVBhdHRlcm4sIHBhdGg6IHN0cmluZywgb3B0aW9ucz86IElHbG9iT3B0aW9ucyk6IGJvb2xlYW47XG5leHBvcnQgZnVuY3Rpb24gbWF0Y2goZXhwcmVzc2lvbjogSUV4cHJlc3Npb24sIHBhdGg6IHN0cmluZywgb3B0aW9ucz86IElHbG9iT3B0aW9ucyk6IGJvb2xlYW47XG5leHBvcnQgZnVuY3Rpb24gbWF0Y2goYXJnMTogc3RyaW5nIHwgSUV4cHJlc3Npb24gfCBJUmVsYXRpdmVQYXR0ZXJuLCBwYXRoOiBzdHJpbmcsIG9wdGlvbnM/OiBJR2xvYk9wdGlvbnMpOiBib29sZWFuIHtcblx0aWYgKCFhcmcxIHx8IHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiBwYXJzZShhcmcxLCBvcHRpb25zKShwYXRoKSBhcyBib29sZWFuO1xufVxuXG4vKipcbiAqIFNpbXBsaWZpZWQgZ2xvYiBtYXRjaGluZy4gU3VwcG9ydHMgYSBzdWJzZXQgb2YgZ2xvYiBwYXR0ZXJuczpcbiAqICogYCpgIHRvIG1hdGNoIHplcm8gb3IgbW9yZSBjaGFyYWN0ZXJzIGluIGEgcGF0aCBzZWdtZW50XG4gKiAqIGA/YCB0byBtYXRjaCBvbiBvbmUgY2hhcmFjdGVyIGluIGEgcGF0aCBzZWdtZW50XG4gKiAqIGAqKmAgdG8gbWF0Y2ggYW55IG51bWJlciBvZiBwYXRoIHNlZ21lbnRzLCBpbmNsdWRpbmcgbm9uZVxuICogKiBge31gIHRvIGdyb3VwIGNvbmRpdGlvbnMgKGUuZy4gKi57dHMsanN9IG1hdGNoZXMgYWxsIFR5cGVTY3JpcHQgYW5kIEphdmFTY3JpcHQgZmlsZXMpXG4gKiAqIGBbXWAgdG8gZGVjbGFyZSBhIHJhbmdlIG9mIGNoYXJhY3RlcnMgdG8gbWF0Y2ggaW4gYSBwYXRoIHNlZ21lbnQgKGUuZy4sIGBleGFtcGxlLlswLTldYCB0byBtYXRjaCBvbiBgZXhhbXBsZS4wYCwgYGV4YW1wbGUuMWAsIFx1MjAyNilcbiAqICogYFshLi4uXWAgdG8gbmVnYXRlIGEgcmFuZ2Ugb2YgY2hhcmFjdGVycyB0byBtYXRjaCBpbiBhIHBhdGggc2VnbWVudCAoZS5nLiwgYGV4YW1wbGUuWyEwLTldYCB0byBtYXRjaCBvbiBgZXhhbXBsZS5hYCwgYGV4YW1wbGUuYmAsIGJ1dCBub3QgYGV4YW1wbGUuMGApXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShwYXR0ZXJuOiBzdHJpbmcgfCBJUmVsYXRpdmVQYXR0ZXJuLCBvcHRpb25zPzogSUdsb2JPcHRpb25zKTogUGFyc2VkUGF0dGVybjtcbmV4cG9ydCBmdW5jdGlvbiBwYXJzZShleHByZXNzaW9uOiBJRXhwcmVzc2lvbiwgb3B0aW9ucz86IElHbG9iT3B0aW9ucyk6IFBhcnNlZEV4cHJlc3Npb247XG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoYXJnMTogc3RyaW5nIHwgSUV4cHJlc3Npb24gfCBJUmVsYXRpdmVQYXR0ZXJuLCBvcHRpb25zPzogSUdsb2JPcHRpb25zKTogUGFyc2VkUGF0dGVybiB8IFBhcnNlZEV4cHJlc3Npb247XG5leHBvcnQgZnVuY3Rpb24gcGFyc2UoYXJnMTogc3RyaW5nIHwgSUV4cHJlc3Npb24gfCBJUmVsYXRpdmVQYXR0ZXJuLCBvcHRpb25zOiBJR2xvYk9wdGlvbnMgPSB7fSk6IFBhcnNlZFBhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uIHtcblx0aWYgKCFhcmcxKSB7XG5cdFx0cmV0dXJuIEZBTFNFO1xuXHR9XG5cblx0Ly8gR2xvYiB3aXRoIFN0cmluZ1xuXHRpZiAodHlwZW9mIGFyZzEgPT09ICdzdHJpbmcnIHx8IGlzUmVsYXRpdmVQYXR0ZXJuKGFyZzEpKSB7XG5cdFx0Y29uc3QgcGFyc2VkUGF0dGVybiA9IHBhcnNlUGF0dGVybihhcmcxLCBvcHRpb25zKTtcblx0XHRpZiAocGFyc2VkUGF0dGVybiA9PT0gTlVMTCkge1xuXHRcdFx0cmV0dXJuIEZBTFNFO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdFBhdHRlcm46IFBhcnNlZFBhdHRlcm4gJiB7IGFsbEJhc2VuYW1lcz86IHN0cmluZ1tdOyBhbGxQYXRocz86IHN0cmluZ1tdIH0gPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykge1xuXHRcdFx0cmV0dXJuICEhcGFyc2VkUGF0dGVybihwYXRoLCBiYXNlbmFtZSk7XG5cdFx0fTtcblxuXHRcdGlmIChwYXJzZWRQYXR0ZXJuLmFsbEJhc2VuYW1lcykge1xuXHRcdFx0cmVzdWx0UGF0dGVybi5hbGxCYXNlbmFtZXMgPSBwYXJzZWRQYXR0ZXJuLmFsbEJhc2VuYW1lcztcblx0XHR9XG5cblx0XHRpZiAocGFyc2VkUGF0dGVybi5hbGxQYXRocykge1xuXHRcdFx0cmVzdWx0UGF0dGVybi5hbGxQYXRocyA9IHBhcnNlZFBhdHRlcm4uYWxsUGF0aHM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdFBhdHRlcm47XG5cdH1cblxuXHQvLyBHbG9iIHdpdGggRXhwcmVzc2lvblxuXHRyZXR1cm4gcGFyc2VkRXhwcmVzc2lvbihhcmcxLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVsYXRpdmVQYXR0ZXJuKG9iajogdW5rbm93bik6IG9iaiBpcyBJUmVsYXRpdmVQYXR0ZXJuIHtcblx0Y29uc3QgcnAgPSBvYmogYXMgSVJlbGF0aXZlUGF0dGVybiB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdGlmICghcnApIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHlwZW9mIHJwLmJhc2UgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBycC5wYXR0ZXJuID09PSAnc3RyaW5nJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJhc2VuYW1lVGVybXMocGF0dGVybk9yRXhwcmVzc2lvbjogUGFyc2VkUGF0dGVybiB8IFBhcnNlZEV4cHJlc3Npb24pOiBzdHJpbmdbXSB7XG5cdHJldHVybiAoPFBhcnNlZFN0cmluZ1BhdHRlcm4+cGF0dGVybk9yRXhwcmVzc2lvbikuYWxsQmFzZW5hbWVzIHx8IFtdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGF0aFRlcm1zKHBhdHRlcm5PckV4cHJlc3Npb246IFBhcnNlZFBhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uKTogc3RyaW5nW10ge1xuXHRyZXR1cm4gKDxQYXJzZWRTdHJpbmdQYXR0ZXJuPnBhdHRlcm5PckV4cHJlc3Npb24pLmFsbFBhdGhzIHx8IFtdO1xufVxuXG5mdW5jdGlvbiBwYXJzZWRFeHByZXNzaW9uKGV4cHJlc3Npb246IElFeHByZXNzaW9uLCBvcHRpb25zOiBJR2xvYk9wdGlvbnMpOiBQYXJzZWRFeHByZXNzaW9uIHtcblx0Y29uc3QgcGFyc2VkUGF0dGVybnMgPSBhZ2dyZWdhdGVCYXNlbmFtZU1hdGNoZXMoT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXMoZXhwcmVzc2lvbilcblx0XHQubWFwKHBhdHRlcm4gPT4gcGFyc2VFeHByZXNzaW9uUGF0dGVybihwYXR0ZXJuLCBleHByZXNzaW9uW3BhdHRlcm5dLCBvcHRpb25zKSlcblx0XHQuZmlsdGVyKHBhdHRlcm4gPT4gcGF0dGVybiAhPT0gTlVMTCkpO1xuXG5cdGNvbnN0IHBhdHRlcm5zTGVuZ3RoID0gcGFyc2VkUGF0dGVybnMubGVuZ3RoO1xuXHRpZiAoIXBhdHRlcm5zTGVuZ3RoKSB7XG5cdFx0cmV0dXJuIE5VTEw7XG5cdH1cblxuXHRpZiAoIXBhcnNlZFBhdHRlcm5zLnNvbWUocGFyc2VkUGF0dGVybiA9PiAhISg8UGFyc2VkRXhwcmVzc2lvblBhdHRlcm4+cGFyc2VkUGF0dGVybikucmVxdWlyZXNTaWJsaW5ncykpIHtcblx0XHRpZiAocGF0dGVybnNMZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiBwYXJzZWRQYXR0ZXJuc1swXSBhcyBQYXJzZWRTdHJpbmdQYXR0ZXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdEV4cHJlc3Npb246IFBhcnNlZFN0cmluZ1BhdHRlcm4gPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykge1xuXHRcdFx0bGV0IHJlc3VsdFByb21pc2VzOiBQcm9taXNlPHN0cmluZyB8IG51bGw+W10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwLCBuID0gcGFyc2VkUGF0dGVybnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlZFBhdHRlcm5zW2ldKHBhdGgsIGJhc2VuYW1lKTtcblx0XHRcdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDsgLy8gaW1tZWRpYXRlbHkgcmV0dXJuIGFzIHNvb24gYXMgdGhlIGZpcnN0IGV4cHJlc3Npb24gbWF0Y2hlc1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgdGhlIHJlc3VsdCBpcyBhIHByb21pc2UsIHdlIGhhdmUgdG8ga2VlcCBpdCBmb3Jcblx0XHRcdFx0Ly8gbGF0ZXIgcHJvY2Vzc2luZyBhbmQgYXdhaXQgdGhlIHJlc3VsdCBwcm9wZXJseS5cblx0XHRcdFx0aWYgKGlzVGhlbmFibGUocmVzdWx0KSkge1xuXHRcdFx0XHRcdGlmICghcmVzdWx0UHJvbWlzZXMpIHtcblx0XHRcdFx0XHRcdHJlc3VsdFByb21pc2VzID0gW107XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzdWx0UHJvbWlzZXMucHVzaChyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpdGggcmVzdWx0IHByb21pc2VzLCB3ZSBoYXZlIHRvIGxvb3Agb3ZlciBlYWNoIGFuZFxuXHRcdFx0Ly8gYXdhaXQgdGhlIHJlc3VsdCBiZWZvcmUgd2UgY2FuIHJldHVybiBhbnkgcmVzdWx0LlxuXHRcdFx0aWYgKHJlc3VsdFByb21pc2VzKSB7XG5cdFx0XHRcdHJldHVybiAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcmVzdWx0UHJvbWlzZSBvZiByZXN1bHRQcm9taXNlcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd2l0aEJhc2VuYW1lcyA9IHBhcnNlZFBhdHRlcm5zLmZpbmQocGF0dGVybiA9PiAhIXBhdHRlcm4uYWxsQmFzZW5hbWVzKTtcblx0XHRpZiAod2l0aEJhc2VuYW1lcykge1xuXHRcdFx0cmVzdWx0RXhwcmVzc2lvbi5hbGxCYXNlbmFtZXMgPSB3aXRoQmFzZW5hbWVzLmFsbEJhc2VuYW1lcztcblx0XHR9XG5cblx0XHRjb25zdCBhbGxQYXRocyA9IHBhcnNlZFBhdHRlcm5zLnJlZHVjZSgoYWxsLCBjdXJyZW50KSA9PiBjdXJyZW50LmFsbFBhdGhzID8gYWxsLmNvbmNhdChjdXJyZW50LmFsbFBhdGhzKSA6IGFsbCwgW10gYXMgc3RyaW5nW10pO1xuXHRcdGlmIChhbGxQYXRocy5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdEV4cHJlc3Npb24uYWxsUGF0aHMgPSBhbGxQYXRocztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0RXhwcmVzc2lvbjtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdEV4cHJlc3Npb246IFBhcnNlZFN0cmluZ1BhdHRlcm4gPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlPzogc3RyaW5nLCBoYXNTaWJsaW5nPzogKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pIHtcblx0XHRsZXQgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCByZXN1bHRQcm9taXNlczogUHJvbWlzZTxzdHJpbmcgfCBudWxsPltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIG4gPSBwYXJzZWRQYXR0ZXJucy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcblxuXHRcdFx0Ly8gUGF0dGVybiBtYXRjaGVzIHBhdGhcblx0XHRcdGNvbnN0IHBhcnNlZFBhdHRlcm4gPSAoPFBhcnNlZEV4cHJlc3Npb25QYXR0ZXJuPnBhcnNlZFBhdHRlcm5zW2ldKTtcblx0XHRcdGlmIChwYXJzZWRQYXR0ZXJuLnJlcXVpcmVzU2libGluZ3MgJiYgaGFzU2libGluZykge1xuXHRcdFx0XHRpZiAoIWJhc2UpIHtcblx0XHRcdFx0XHRiYXNlID0gYmFzZW5hbWUocGF0aCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdFx0XHRuYW1lID0gYmFzZS5zdWJzdHJpbmcoMCwgYmFzZS5sZW5ndGggLSBleHRuYW1lKHBhdGgpLmxlbmd0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VkUGF0dGVybihwYXRoLCBiYXNlLCBuYW1lLCBoYXNTaWJsaW5nKTtcblx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0OyAvLyBpbW1lZGlhdGVseSByZXR1cm4gYXMgc29vbiBhcyB0aGUgZmlyc3QgZXhwcmVzc2lvbiBtYXRjaGVzXG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSByZXN1bHQgaXMgYSBwcm9taXNlLCB3ZSBoYXZlIHRvIGtlZXAgaXQgZm9yXG5cdFx0XHQvLyBsYXRlciBwcm9jZXNzaW5nIGFuZCBhd2FpdCB0aGUgcmVzdWx0IHByb3Blcmx5LlxuXHRcdFx0aWYgKGlzVGhlbmFibGUocmVzdWx0KSkge1xuXHRcdFx0XHRpZiAoIXJlc3VsdFByb21pc2VzKSB7XG5cdFx0XHRcdFx0cmVzdWx0UHJvbWlzZXMgPSBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdFByb21pc2VzLnB1c2gocmVzdWx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXaXRoIHJlc3VsdCBwcm9taXNlcywgd2UgaGF2ZSB0byBsb29wIG92ZXIgZWFjaCBhbmRcblx0XHQvLyBhd2FpdCB0aGUgcmVzdWx0IGJlZm9yZSB3ZSBjYW4gcmV0dXJuIGFueSByZXN1bHQuXG5cdFx0aWYgKHJlc3VsdFByb21pc2VzKSB7XG5cdFx0XHRyZXR1cm4gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCByZXN1bHRQcm9taXNlIG9mIHJlc3VsdFByb21pc2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzdWx0UHJvbWlzZTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9O1xuXG5cdGNvbnN0IHdpdGhCYXNlbmFtZXMgPSBwYXJzZWRQYXR0ZXJucy5maW5kKHBhdHRlcm4gPT4gISFwYXR0ZXJuLmFsbEJhc2VuYW1lcyk7XG5cdGlmICh3aXRoQmFzZW5hbWVzKSB7XG5cdFx0cmVzdWx0RXhwcmVzc2lvbi5hbGxCYXNlbmFtZXMgPSB3aXRoQmFzZW5hbWVzLmFsbEJhc2VuYW1lcztcblx0fVxuXG5cdGNvbnN0IGFsbFBhdGhzID0gcGFyc2VkUGF0dGVybnMucmVkdWNlKChhbGwsIGN1cnJlbnQpID0+IGN1cnJlbnQuYWxsUGF0aHMgPyBhbGwuY29uY2F0KGN1cnJlbnQuYWxsUGF0aHMpIDogYWxsLCBbXSBhcyBzdHJpbmdbXSk7XG5cdGlmIChhbGxQYXRocy5sZW5ndGgpIHtcblx0XHRyZXN1bHRFeHByZXNzaW9uLmFsbFBhdGhzID0gYWxsUGF0aHM7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0RXhwcmVzc2lvbjtcbn1cblxuZnVuY3Rpb24gcGFyc2VFeHByZXNzaW9uUGF0dGVybihwYXR0ZXJuOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuIHwgU2libGluZ0NsYXVzZSwgb3B0aW9uczogSUdsb2JPcHRpb25zKTogKFBhcnNlZFN0cmluZ1BhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uUGF0dGVybikge1xuXHRpZiAodmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0cmV0dXJuIE5VTEw7IC8vIHBhdHRlcm4gaXMgZGlzYWJsZWRcblx0fVxuXG5cdGNvbnN0IHBhcnNlZFBhdHRlcm4gPSBwYXJzZVBhdHRlcm4ocGF0dGVybiwgb3B0aW9ucyk7XG5cdGlmIChwYXJzZWRQYXR0ZXJuID09PSBOVUxMKSB7XG5cdFx0cmV0dXJuIE5VTEw7XG5cdH1cblxuXHQvLyBFeHByZXNzaW9uIFBhdHRlcm4gaXMgPGJvb2xlYW4+XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiBwYXJzZWRQYXR0ZXJuO1xuXHR9XG5cblx0Ly8gRXhwcmVzc2lvbiBQYXR0ZXJuIGlzIDxTaWJsaW5nQ2xhdXNlPlxuXHRpZiAodmFsdWUpIHtcblx0XHRjb25zdCB3aGVuID0gdmFsdWUud2hlbjtcblx0XHRpZiAodHlwZW9mIHdoZW4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IFBhcnNlZEV4cHJlc3Npb25QYXR0ZXJuID0gKHBhdGg6IHN0cmluZywgYmFzZW5hbWU/OiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcsIGhhc1NpYmxpbmc/OiAobmFtZTogc3RyaW5nKSA9PiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPikgPT4ge1xuXHRcdFx0XHRpZiAoIWhhc1NpYmxpbmcgfHwgIXBhcnNlZFBhdHRlcm4ocGF0aCwgYmFzZW5hbWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjbGF1c2VQYXR0ZXJuID0gd2hlbi5yZXBsYWNlKCckKGJhc2VuYW1lKScsICgpID0+IG5hbWUhKTtcblx0XHRcdFx0Y29uc3QgbWF0Y2hlZCA9IGhhc1NpYmxpbmcoY2xhdXNlUGF0dGVybik7XG5cdFx0XHRcdHJldHVybiBpc1RoZW5hYmxlKG1hdGNoZWQpID9cblx0XHRcdFx0XHRtYXRjaGVkLnRoZW4obWF0Y2ggPT4gbWF0Y2ggPyBwYXR0ZXJuIDogbnVsbCkgOlxuXHRcdFx0XHRcdG1hdGNoZWQgPyBwYXR0ZXJuIDogbnVsbDtcblx0XHRcdH07XG5cblx0XHRcdHJlc3VsdC5yZXF1aXJlc1NpYmxpbmdzID0gdHJ1ZTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHQvLyBFeHByZXNzaW9uIGlzIGFueXRoaW5nXG5cdHJldHVybiBwYXJzZWRQYXR0ZXJuO1xufVxuXG5mdW5jdGlvbiBhZ2dyZWdhdGVCYXNlbmFtZU1hdGNoZXMocGFyc2VkUGF0dGVybnM6IEFycmF5PFBhcnNlZFN0cmluZ1BhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uUGF0dGVybj4sIHJlc3VsdD86IHN0cmluZyk6IEFycmF5PFBhcnNlZFN0cmluZ1BhdHRlcm4gfCBQYXJzZWRFeHByZXNzaW9uUGF0dGVybj4ge1xuXHRjb25zdCBiYXNlbmFtZVBhdHRlcm5zID0gcGFyc2VkUGF0dGVybnMuZmlsdGVyKHBhcnNlZFBhdHRlcm4gPT4gISEoPFBhcnNlZFN0cmluZ1BhdHRlcm4+cGFyc2VkUGF0dGVybikuYmFzZW5hbWVzKTtcblx0aWYgKGJhc2VuYW1lUGF0dGVybnMubGVuZ3RoIDwgMikge1xuXHRcdHJldHVybiBwYXJzZWRQYXR0ZXJucztcblx0fVxuXG5cdGNvbnN0IGJhc2VuYW1lcyA9IGJhc2VuYW1lUGF0dGVybnMucmVkdWNlPHN0cmluZ1tdPigoYWxsLCBjdXJyZW50KSA9PiB7XG5cdFx0Y29uc3QgYmFzZW5hbWVzID0gKDxQYXJzZWRTdHJpbmdQYXR0ZXJuPmN1cnJlbnQpLmJhc2VuYW1lcztcblxuXHRcdHJldHVybiBiYXNlbmFtZXMgPyBhbGwuY29uY2F0KGJhc2VuYW1lcykgOiBhbGw7XG5cdH0sIFtdIGFzIHN0cmluZ1tdKTtcblxuXHRsZXQgcGF0dGVybnM6IHN0cmluZ1tdO1xuXHRpZiAocmVzdWx0KSB7XG5cdFx0cGF0dGVybnMgPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBuID0gYmFzZW5hbWVzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuXHRcdFx0cGF0dGVybnMucHVzaChyZXN1bHQpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRwYXR0ZXJucyA9IGJhc2VuYW1lUGF0dGVybnMucmVkdWNlKChhbGwsIGN1cnJlbnQpID0+IHtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gKDxQYXJzZWRTdHJpbmdQYXR0ZXJuPmN1cnJlbnQpLnBhdHRlcm5zO1xuXG5cdFx0XHRyZXR1cm4gcGF0dGVybnMgPyBhbGwuY29uY2F0KHBhdHRlcm5zKSA6IGFsbDtcblx0XHR9LCBbXSBhcyBzdHJpbmdbXSk7XG5cdH1cblxuXHRjb25zdCBhZ2dyZWdhdGU6IFBhcnNlZFN0cmluZ1BhdHRlcm4gPSBmdW5jdGlvbiAocGF0aDogc3RyaW5nLCBiYXNlbmFtZT86IHN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghYmFzZW5hbWUpIHtcblx0XHRcdGxldCBpOiBudW1iZXI7XG5cdFx0XHRmb3IgKGkgPSBwYXRoLmxlbmd0aDsgaSA+IDA7IGktLSkge1xuXHRcdFx0XHRjb25zdCBjaCA9IHBhdGguY2hhckNvZGVBdChpIC0gMSk7XG5cdFx0XHRcdGlmIChjaCA9PT0gQ2hhckNvZGUuU2xhc2ggfHwgY2ggPT09IENoYXJDb2RlLkJhY2tzbGFzaCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGJhc2VuYW1lID0gcGF0aC5zdWJzdHJpbmcoaSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSBiYXNlbmFtZXMuaW5kZXhPZihiYXNlbmFtZSk7XG5cdFx0cmV0dXJuIGluZGV4ICE9PSAtMSA/IHBhdHRlcm5zW2luZGV4XSA6IG51bGw7XG5cdH07XG5cblx0YWdncmVnYXRlLmJhc2VuYW1lcyA9IGJhc2VuYW1lcztcblx0YWdncmVnYXRlLnBhdHRlcm5zID0gcGF0dGVybnM7XG5cdGFnZ3JlZ2F0ZS5hbGxCYXNlbmFtZXMgPSBiYXNlbmFtZXM7XG5cblx0Y29uc3QgYWdncmVnYXRlZFBhdHRlcm5zID0gcGFyc2VkUGF0dGVybnMuZmlsdGVyKHBhcnNlZFBhdHRlcm4gPT4gISg8UGFyc2VkU3RyaW5nUGF0dGVybj5wYXJzZWRQYXR0ZXJuKS5iYXNlbmFtZXMpO1xuXHRhZ2dyZWdhdGVkUGF0dGVybnMucHVzaChhZ2dyZWdhdGUpO1xuXG5cdHJldHVybiBhZ2dyZWdhdGVkUGF0dGVybnM7XG59XG5cbi8vIE5PVEU6IFRoaXMgaXMgbm90IHVzZWQgZm9yIGFjdHVhbCBtYXRjaGluZywgb25seSBmb3IgcmVzZXR0aW5nIHdhdGNoZXIgd2hlbiBwYXR0ZXJucyBjaGFuZ2UuXG4vLyBUaGF0IGlzIHdoeSBpdCdzIG9rIHRvIGF2b2lkIGNhc2UtaW5zZW5zaXRpdmUgY29tcGFyaXNvbiBoZXJlLlxuZXhwb3J0IGZ1bmN0aW9uIHBhdHRlcm5zRXF1YWxzKHBhdHRlcm5zQTogQXJyYXk8c3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybj4gfCB1bmRlZmluZWQsIHBhdHRlcm5zQjogQXJyYXk8c3RyaW5nIHwgSVJlbGF0aXZlUGF0dGVybj4gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGVxdWFscyhwYXR0ZXJuc0EsIHBhdHRlcm5zQiwgKGEsIGIpID0+IHtcblx0XHRpZiAodHlwZW9mIGEgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBiID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGEgPT09IGI7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBhICE9PSAnc3RyaW5nJyAmJiB0eXBlb2YgYiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBhLmJhc2UgPT09IGIuYmFzZSAmJiBhLnBhdHRlcm4gPT09IGIucGF0dGVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxTQUFTLE9BQU8sV0FBVztBQUM5QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0Isa0JBQWtCLHdCQUF3QixhQUFhO0FBdUI3RSxTQUFTLHFCQUFrQztBQUNqRCxTQUFPLHVCQUFPLE9BQU8sSUFBSTtBQUMxQjtBQU1PLE1BQU0sV0FBVztBQUNqQixNQUFNLGFBQWE7QUFFMUIsTUFBTSxhQUFhO0FBQ25CLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sc0JBQXNCO0FBRTVCLFNBQVMsY0FBYyxXQUFtQixlQUFpQztBQUMxRSxVQUFRLFdBQVc7QUFBQSxJQUNsQixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU8sR0FBRyxhQUFhO0FBQUE7QUFBQSxJQUN4QjtBQUtDLGFBQU8sTUFBTSxVQUFVLElBQUksYUFBYSxJQUFJLFVBQVUsR0FBRyxnQkFBZ0IsSUFBSSxVQUFVLEdBQUcsYUFBYSxNQUFNLEVBQUU7QUFBQSxFQUNqSDtBQUNEO0FBRU8sU0FBUyxlQUFlLFNBQWlCLFdBQTZCO0FBQzVFLE1BQUksQ0FBQyxTQUFTO0FBQ2IsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUVBLFFBQU0sV0FBcUIsQ0FBQztBQUU1QixNQUFJLFdBQVc7QUFDZixNQUFJLGFBQWE7QUFFakIsTUFBSSxTQUFTO0FBQ2IsYUFBVyxRQUFRLFNBQVM7QUFDM0IsWUFBUSxNQUFNO0FBQUEsTUFDYixL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QUEsRUFDbEI7QUFFQSxRQUFNLFlBQWlDLFNBQVUsTUFBY04sV0FBbUI7QUFDakYsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQ0EsV0FBVTtBQUNkLFVBQUk7QUFDSixXQUFLLElBQUksS0FBSyxRQUFRLElBQUksR0FBRyxLQUFLO0FBQ2pDLGNBQU0sS0FBSyxLQUFLLFdBQVcsSUFBSSxDQUFDO0FBQ2hDLFlBQUksT0FBTyxTQUFTLFNBQVMsT0FBTyxTQUFTLFdBQVc7QUFDdkQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLE1BQUFBLFlBQVcsS0FBSyxVQUFVLENBQUM7QUFBQSxJQUM1QjtBQUVBLFVBQU0sUUFBUSxVQUFVLFFBQVFBLFNBQVE7QUFDeEMsV0FBTyxVQUFVLEtBQUssU0FBUyxLQUFLLElBQUk7QUFBQSxFQUN6QztBQUVBLFlBQVUsWUFBWTtBQUN0QixZQUFVLFdBQVc7QUFDckIsWUFBVSxlQUFlO0FBRXpCLFFBQU0scUJBQXFCLGVBQWUsT0FBTyxtQkFBaUIsQ0FBdUIsY0FBZSxTQUFTO0FBQ2pILHFCQUFtQixLQUFLLFNBQVM7QUFFakMsU0FBTztBQUNSO0FBSU8sU0FBUyxlQUFlLFdBQXlELFdBQWtFO0FBQ3pKLFNBQU8sT0FBTyxXQUFXLFdBQVcsQ0FBQyxHQUFHLE1BQU07QUFDN0MsUUFBSSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVTtBQUNuRCxhQUFPLE1BQU07QUFBQSxJQUNkO0FBRUEsUUFBSSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sVUFBVTtBQUNuRCxhQUFPLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUU7QUFBQSxJQUM3QztBQUVBLFdBQU87QUFBQSxFQUNSLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsibWF0Y2giLCAiYmFzZW5hbWUiLCAicGF0dGVybiIsICJyZXN1bHRFeHByZXNzaW9uIiwgIndpdGhCYXNlbmFtZXMiLCAiYWxsUGF0aHMiLCAiYmFzZW5hbWVzIiwgInBhdHRlcm5zIl0KfQo=
