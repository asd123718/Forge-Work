import * as process from "./process.js";
const CHAR_UPPERCASE_A = 65;
const CHAR_LOWERCASE_A = 97;
const CHAR_UPPERCASE_Z = 90;
const CHAR_LOWERCASE_Z = 122;
const CHAR_DOT = 46;
const CHAR_FORWARD_SLASH = 47;
const CHAR_BACKWARD_SLASH = 92;
const CHAR_COLON = 58;
const CHAR_QUESTION_MARK = 63;
class ErrorInvalidArgType extends Error {
  constructor(name, expected, actual) {
    let determiner;
    if (typeof expected === "string" && expected.indexOf("not ") === 0) {
      determiner = "must not be";
      expected = expected.replace(/^not /, "");
    } else {
      determiner = "must be";
    }
    const type = name.indexOf(".") !== -1 ? "property" : "argument";
    let msg = `The "${name}" ${type} ${determiner} of type ${expected}`;
    msg += `. Received type ${typeof actual}`;
    super(msg);
    this.code = "ERR_INVALID_ARG_TYPE";
  }
}
function validateObject(pathObject, name) {
  if (pathObject === null || typeof pathObject !== "object") {
    throw new ErrorInvalidArgType(name, "Object", pathObject);
  }
}
function validateString(value, name) {
  if (typeof value !== "string") {
    throw new ErrorInvalidArgType(name, "string", value);
  }
}
const platformIsWin32 = process.platform === "win32";
function isPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
}
function isPosixPathSeparator(code) {
  return code === CHAR_FORWARD_SLASH;
}
function isWindowsDeviceRoot(code) {
  return code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z || code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z;
}
function normalizeString(path, allowAboveRoot, separator, isPathSeparator2) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code = 0;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) {
      code = path.charCodeAt(i);
    } else if (isPathSeparator2(code)) {
      break;
    } else {
      code = CHAR_FORWARD_SLASH;
    }
    if (isPathSeparator2(code)) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== CHAR_DOT || res.charCodeAt(res.length - 2) !== CHAR_DOT) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length !== 0) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          res += res.length > 0 ? `${separator}..` : "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) {
          res += `${separator}${path.slice(lastSlash + 1, i)}`;
        } else {
          res = path.slice(lastSlash + 1, i);
        }
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code === CHAR_DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}
function formatExt(ext) {
  return ext ? `${ext[0] === "." ? "" : "."}${ext}` : "";
}
function _format(sep2, pathObject) {
  validateObject(pathObject, "pathObject");
  const dir = pathObject.dir || pathObject.root;
  const base = pathObject.base || `${pathObject.name || ""}${formatExt(pathObject.ext)}`;
  if (!dir) {
    return base;
  }
  return dir === pathObject.root ? `${dir}${base}` : `${dir}${sep2}${base}`;
}
const win32 = {
  // path.resolve([from ...], to)
  resolve(...pathSegments) {
    let resolvedDevice = "";
    let resolvedTail = "";
    let resolvedAbsolute = false;
    for (let i = pathSegments.length - 1; i >= -1; i--) {
      let path;
      if (i >= 0) {
        path = pathSegments[i];
        validateString(path, `paths[${i}]`);
        if (path.length === 0) {
          continue;
        }
      } else if (resolvedDevice.length === 0) {
        path = process.cwd();
      } else {
        path = process.env[`=${resolvedDevice}`] || process.cwd();
        if (path === void 0 || path.slice(0, 2).toLowerCase() !== resolvedDevice.toLowerCase() && path.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
          path = `${resolvedDevice}\\`;
        }
      }
      const len = path.length;
      let rootEnd = 0;
      let device = "";
      let isAbsolute2 = false;
      const code = path.charCodeAt(0);
      if (len === 1) {
        if (isPathSeparator(code)) {
          rootEnd = 1;
          isAbsolute2 = true;
        }
      } else if (isPathSeparator(code)) {
        isAbsolute2 = true;
        if (isPathSeparator(path.charCodeAt(1))) {
          let j = 2;
          let last = j;
          while (j < len && !isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            const firstPart = path.slice(last, j);
            last = j;
            while (j < len && isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j < len && j !== last) {
              last = j;
              while (j < len && !isPathSeparator(path.charCodeAt(j))) {
                j++;
              }
              if (j === len || j !== last) {
                device = `\\\\${firstPart}\\${path.slice(last, j)}`;
                rootEnd = j;
              }
            }
          }
        } else {
          rootEnd = 1;
        }
      } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
          isAbsolute2 = true;
          rootEnd = 3;
        }
      }
      if (device.length > 0) {
        if (resolvedDevice.length > 0) {
          if (device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            continue;
          }
        } else {
          resolvedDevice = device;
        }
      }
      if (resolvedAbsolute) {
        if (resolvedDevice.length > 0) {
          break;
        }
      } else {
        resolvedTail = `${path.slice(rootEnd)}\\${resolvedTail}`;
        resolvedAbsolute = isAbsolute2;
        if (isAbsolute2 && resolvedDevice.length > 0) {
          break;
        }
      }
    }
    resolvedTail = normalizeString(
      resolvedTail,
      !resolvedAbsolute,
      "\\",
      isPathSeparator
    );
    return resolvedAbsolute ? `${resolvedDevice}\\${resolvedTail}` : `${resolvedDevice}${resolvedTail}` || ".";
  },
  normalize(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return ".";
    }
    let rootEnd = 0;
    let device;
    let isAbsolute2 = false;
    const code = path.charCodeAt(0);
    if (len === 1) {
      return isPosixPathSeparator(code) ? "\\" : path;
    }
    if (isPathSeparator(code)) {
      isAbsolute2 = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            }
            if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      device = path.slice(0, 2);
      rootEnd = 2;
      if (len > 2 && isPathSeparator(path.charCodeAt(2))) {
        isAbsolute2 = true;
        rootEnd = 3;
      }
    }
    let tail = rootEnd < len ? normalizeString(path.slice(rootEnd), !isAbsolute2, "\\", isPathSeparator) : "";
    if (tail.length === 0 && !isAbsolute2) {
      tail = ".";
    }
    if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
      tail += "\\";
    }
    if (!isAbsolute2 && device === void 0 && path.includes(":")) {
      if (tail.length >= 2 && isWindowsDeviceRoot(tail.charCodeAt(0)) && tail.charCodeAt(1) === CHAR_COLON) {
        return `.\\${tail}`;
      }
      let index = path.indexOf(":");
      do {
        if (index === len - 1 || isPathSeparator(path.charCodeAt(index + 1))) {
          return `.\\${tail}`;
        }
      } while ((index = path.indexOf(":", index + 1)) !== -1);
    }
    if (device === void 0) {
      return isAbsolute2 ? `\\${tail}` : tail;
    }
    return isAbsolute2 ? `${device}\\${tail}` : `${device}${tail}`;
  },
  isAbsolute(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return false;
    }
    const code = path.charCodeAt(0);
    return isPathSeparator(code) || // Possible device root
    len > 2 && isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON && isPathSeparator(path.charCodeAt(2));
  },
  join(...paths) {
    if (paths.length === 0) {
      return ".";
    }
    let joined;
    let firstPart;
    for (let i = 0; i < paths.length; ++i) {
      const arg = paths[i];
      validateString(arg, "path");
      if (arg.length > 0) {
        if (joined === void 0) {
          joined = firstPart = arg;
        } else {
          joined += `\\${arg}`;
        }
      }
    }
    if (joined === void 0) {
      return ".";
    }
    let needsReplace = true;
    let slashCount = 0;
    if (typeof firstPart === "string" && isPathSeparator(firstPart.charCodeAt(0))) {
      ++slashCount;
      const firstLen = firstPart.length;
      if (firstLen > 1 && isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) {
            ++slashCount;
          } else {
            needsReplace = false;
          }
        }
      }
    }
    if (needsReplace) {
      while (slashCount < joined.length && isPathSeparator(joined.charCodeAt(slashCount))) {
        slashCount++;
      }
      if (slashCount >= 2) {
        joined = `\\${joined.slice(slashCount)}`;
      }
    }
    return win32.normalize(joined);
  },
  // It will solve the relative path from `from` to `to`, for instance:
  //  from = 'C:\\orandea\\test\\aaa'
  //  to = 'C:\\orandea\\impl\\bbb'
  // The output of the function should be: '..\\..\\impl\\bbb'
  relative(from, to) {
    validateString(from, "from");
    validateString(to, "to");
    if (from === to) {
      return "";
    }
    const fromOrig = win32.resolve(from);
    const toOrig = win32.resolve(to);
    if (fromOrig === toOrig) {
      return "";
    }
    from = fromOrig.toLowerCase();
    to = toOrig.toLowerCase();
    if (from === to) {
      return "";
    }
    if (fromOrig.length !== from.length || toOrig.length !== to.length) {
      const fromSplit = fromOrig.split("\\");
      const toSplit = toOrig.split("\\");
      if (fromSplit[fromSplit.length - 1] === "") {
        fromSplit.pop();
      }
      if (toSplit[toSplit.length - 1] === "") {
        toSplit.pop();
      }
      const fromLen2 = fromSplit.length;
      const toLen2 = toSplit.length;
      const length2 = fromLen2 < toLen2 ? fromLen2 : toLen2;
      let i2;
      for (i2 = 0; i2 < length2; i2++) {
        if (fromSplit[i2].toLowerCase() !== toSplit[i2].toLowerCase()) {
          break;
        }
      }
      if (i2 === 0) {
        return toOrig;
      } else if (i2 === length2) {
        if (toLen2 > length2) {
          return toSplit.slice(i2).join("\\");
        }
        if (fromLen2 > length2) {
          return "..\\".repeat(fromLen2 - 1 - i2) + "..";
        }
        return "";
      }
      return "..\\".repeat(fromLen2 - i2) + toSplit.slice(i2).join("\\");
    }
    let fromStart = 0;
    while (fromStart < from.length && from.charCodeAt(fromStart) === CHAR_BACKWARD_SLASH) {
      fromStart++;
    }
    let fromEnd = from.length;
    while (fromEnd - 1 > fromStart && from.charCodeAt(fromEnd - 1) === CHAR_BACKWARD_SLASH) {
      fromEnd--;
    }
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    while (toStart < to.length && to.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) {
      toStart++;
    }
    let toEnd = to.length;
    while (toEnd - 1 > toStart && to.charCodeAt(toEnd - 1) === CHAR_BACKWARD_SLASH) {
      toEnd--;
    }
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
      const fromCode = from.charCodeAt(fromStart + i);
      if (fromCode !== to.charCodeAt(toStart + i)) {
        break;
      } else if (fromCode === CHAR_BACKWARD_SLASH) {
        lastCommonSep = i;
      }
    }
    if (i !== length) {
      if (lastCommonSep === -1) {
        return toOrig;
      }
    } else {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === CHAR_BACKWARD_SLASH) {
          return toOrig.slice(toStart + i + 1);
        }
        if (i === 2) {
          return toOrig.slice(toStart + i);
        }
      }
      if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === CHAR_BACKWARD_SLASH) {
          lastCommonSep = i;
        } else if (i === 2) {
          lastCommonSep = 3;
        }
      }
      if (lastCommonSep === -1) {
        lastCommonSep = 0;
      }
    }
    let out = "";
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === CHAR_BACKWARD_SLASH) {
        out += out.length === 0 ? ".." : "\\..";
      }
    }
    toStart += lastCommonSep;
    if (out.length > 0) {
      return `${out}${toOrig.slice(toStart, toEnd)}`;
    }
    if (toOrig.charCodeAt(toStart) === CHAR_BACKWARD_SLASH) {
      ++toStart;
    }
    return toOrig.slice(toStart, toEnd);
  },
  toNamespacedPath(path) {
    if (typeof path !== "string" || path.length === 0) {
      return path;
    }
    const resolvedPath = win32.resolve(path);
    if (resolvedPath.length <= 2) {
      return path;
    }
    if (resolvedPath.charCodeAt(0) === CHAR_BACKWARD_SLASH) {
      if (resolvedPath.charCodeAt(1) === CHAR_BACKWARD_SLASH) {
        const code = resolvedPath.charCodeAt(2);
        if (code !== CHAR_QUESTION_MARK && code !== CHAR_DOT) {
          return `\\\\?\\UNC\\${resolvedPath.slice(2)}`;
        }
      }
    } else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0)) && resolvedPath.charCodeAt(1) === CHAR_COLON && resolvedPath.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
      return `\\\\?\\${resolvedPath}`;
    }
    return resolvedPath;
  },
  dirname(path) {
    validateString(path, "path");
    const len = path.length;
    if (len === 0) {
      return ".";
    }
    let rootEnd = -1;
    let offset = 0;
    const code = path.charCodeAt(0);
    if (len === 1) {
      return isPathSeparator(code) ? path : ".";
    }
    if (isPathSeparator(code)) {
      rootEnd = offset = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              return path;
            }
            if (j !== last) {
              rootEnd = offset = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      rootEnd = len > 2 && isPathSeparator(path.charCodeAt(2)) ? 3 : 2;
      offset = rootEnd;
    }
    let end = -1;
    let matchedSlash = true;
    for (let i = len - 1; i >= offset; --i) {
      if (isPathSeparator(path.charCodeAt(i))) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1) {
      if (rootEnd === -1) {
        return ".";
      }
      end = rootEnd;
    }
    return path.slice(0, end);
  },
  basename(path, suffix) {
    if (suffix !== void 0) {
      validateString(suffix, "suffix");
    }
    validateString(path, "path");
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (path.length >= 2 && isWindowsDeviceRoot(path.charCodeAt(0)) && path.charCodeAt(1) === CHAR_COLON) {
      start = 2;
    }
    if (suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length) {
      if (suffix === path) {
        return "";
      }
      let extIdx = suffix.length - 1;
      let firstNonSlashEnd = -1;
      for (i = path.length - 1; i >= start; --i) {
        const code = path.charCodeAt(i);
        if (isPathSeparator(code)) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start === end) {
        end = firstNonSlashEnd;
      } else if (end === -1) {
        end = path.length;
      }
      return path.slice(start, end);
    }
    for (i = path.length - 1; i >= start; --i) {
      if (isPathSeparator(path.charCodeAt(i))) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
    }
    if (end === -1) {
      return "";
    }
    return path.slice(start, end);
  },
  extname(path) {
    validateString(path, "path");
    let start = 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    if (path.length >= 2 && path.charCodeAt(1) === CHAR_COLON && isWindowsDeviceRoot(path.charCodeAt(0))) {
      start = startPart = 2;
    }
    for (let i = path.length - 1; i >= start; --i) {
      const code = path.charCodeAt(i);
      if (isPathSeparator(code)) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
    preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: _format.bind(null, "\\"),
  parse(path) {
    validateString(path, "path");
    const ret = { root: "", dir: "", base: "", ext: "", name: "" };
    if (path.length === 0) {
      return ret;
    }
    const len = path.length;
    let rootEnd = 0;
    let code = path.charCodeAt(0);
    if (len === 1) {
      if (isPathSeparator(code)) {
        ret.root = ret.dir = path;
        return ret;
      }
      ret.base = ret.name = path;
      return ret;
    }
    if (isPathSeparator(code)) {
      rootEnd = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        while (j < len && !isPathSeparator(path.charCodeAt(j))) {
          j++;
        }
        if (j < len && j !== last) {
          last = j;
          while (j < len && isPathSeparator(path.charCodeAt(j))) {
            j++;
          }
          if (j < len && j !== last) {
            last = j;
            while (j < len && !isPathSeparator(path.charCodeAt(j))) {
              j++;
            }
            if (j === len) {
              rootEnd = j;
            } else if (j !== last) {
              rootEnd = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
      if (len <= 2) {
        ret.root = ret.dir = path;
        return ret;
      }
      rootEnd = 2;
      if (isPathSeparator(path.charCodeAt(2))) {
        if (len === 3) {
          ret.root = ret.dir = path;
          return ret;
        }
        rootEnd = 3;
      }
    }
    if (rootEnd > 0) {
      ret.root = path.slice(0, rootEnd);
    }
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for (; i >= rootEnd; --i) {
      code = path.charCodeAt(i);
      if (isPathSeparator(code)) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (end !== -1) {
      if (startDot === -1 || // We saw a non-dot character immediately before the dot
      preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        ret.base = ret.name = path.slice(startPart, end);
      } else {
        ret.name = path.slice(startPart, startDot);
        ret.base = path.slice(startPart, end);
        ret.ext = path.slice(startDot, end);
      }
    }
    if (startPart > 0 && startPart !== rootEnd) {
      ret.dir = path.slice(0, startPart - 1);
    } else {
      ret.dir = ret.root;
    }
    return ret;
  },
  sep: "\\",
  delimiter: ";",
  win32: null,
  posix: null
};
const posixCwd = (() => {
  if (platformIsWin32) {
    const regexp = /\\/g;
    return () => {
      const cwd = process.cwd().replace(regexp, "/");
      return cwd.slice(cwd.indexOf("/"));
    };
  }
  return () => process.cwd();
})();
const posix = {
  // path.resolve([from ...], to)
  resolve(...pathSegments) {
    let resolvedPath = "";
    let resolvedAbsolute = false;
    for (let i = pathSegments.length - 1; i >= 0 && !resolvedAbsolute; i--) {
      const path = pathSegments[i];
      validateString(path, `paths[${i}]`);
      if (path.length === 0) {
        continue;
      }
      resolvedPath = `${path}/${resolvedPath}`;
      resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    if (!resolvedAbsolute) {
      const cwd = posixCwd();
      resolvedPath = `${cwd}/${resolvedPath}`;
      resolvedAbsolute = cwd.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    resolvedPath = normalizeString(
      resolvedPath,
      !resolvedAbsolute,
      "/",
      isPosixPathSeparator
    );
    if (resolvedAbsolute) {
      return `/${resolvedPath}`;
    }
    return resolvedPath.length > 0 ? resolvedPath : ".";
  },
  normalize(path) {
    validateString(path, "path");
    if (path.length === 0) {
      return ".";
    }
    const isAbsolute2 = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    const trailingSeparator = path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;
    path = normalizeString(path, !isAbsolute2, "/", isPosixPathSeparator);
    if (path.length === 0) {
      if (isAbsolute2) {
        return "/";
      }
      return trailingSeparator ? "./" : ".";
    }
    if (trailingSeparator) {
      path += "/";
    }
    return isAbsolute2 ? `/${path}` : path;
  },
  isAbsolute(path) {
    validateString(path, "path");
    return path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH;
  },
  join(...paths) {
    if (paths.length === 0) {
      return ".";
    }
    const path = [];
    for (let i = 0; i < paths.length; ++i) {
      const arg = paths[i];
      validateString(arg, "path");
      if (arg.length > 0) {
        path.push(arg);
      }
    }
    if (path.length === 0) {
      return ".";
    }
    return posix.normalize(path.join("/"));
  },
  relative(from, to) {
    validateString(from, "from");
    validateString(to, "to");
    if (from === to) {
      return "";
    }
    from = posix.resolve(from);
    to = posix.resolve(to);
    if (from === to) {
      return "";
    }
    const fromStart = 1;
    const fromEnd = from.length;
    const fromLen = fromEnd - fromStart;
    const toStart = 1;
    const toLen = to.length - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i < length; i++) {
      const fromCode = from.charCodeAt(fromStart + i);
      if (fromCode !== to.charCodeAt(toStart + i)) {
        break;
      } else if (fromCode === CHAR_FORWARD_SLASH) {
        lastCommonSep = i;
      }
    }
    if (i === length) {
      if (toLen > length) {
        if (to.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) {
          return to.slice(toStart + i + 1);
        }
        if (i === 0) {
          return to.slice(toStart + i);
        }
      } else if (fromLen > length) {
        if (from.charCodeAt(fromStart + i) === CHAR_FORWARD_SLASH) {
          lastCommonSep = i;
        } else if (i === 0) {
          lastCommonSep = 0;
        }
      }
    }
    let out = "";
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; ++i) {
      if (i === fromEnd || from.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        out += out.length === 0 ? ".." : "/..";
      }
    }
    return `${out}${to.slice(toStart + lastCommonSep)}`;
  },
  toNamespacedPath(path) {
    return path;
  },
  dirname(path) {
    validateString(path, "path");
    if (path.length === 0) {
      return ".";
    }
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1; i >= 1; --i) {
      if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          end = i;
          break;
        }
      } else {
        matchedSlash = false;
      }
    }
    if (end === -1) {
      return hasRoot ? "/" : ".";
    }
    if (hasRoot && end === 1) {
      return "//";
    }
    return path.slice(0, end);
  },
  basename(path, suffix) {
    if (suffix !== void 0) {
      validateString(suffix, "suffix");
    }
    validateString(path, "path");
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (suffix !== void 0 && suffix.length > 0 && suffix.length <= path.length) {
      if (suffix === path) {
        return "";
      }
      let extIdx = suffix.length - 1;
      let firstNonSlashEnd = -1;
      for (i = path.length - 1; i >= 0; --i) {
        const code = path.charCodeAt(i);
        if (code === CHAR_FORWARD_SLASH) {
          if (!matchedSlash) {
            start = i + 1;
            break;
          }
        } else {
          if (firstNonSlashEnd === -1) {
            matchedSlash = false;
            firstNonSlashEnd = i + 1;
          }
          if (extIdx >= 0) {
            if (code === suffix.charCodeAt(extIdx)) {
              if (--extIdx === -1) {
                end = i;
              }
            } else {
              extIdx = -1;
              end = firstNonSlashEnd;
            }
          }
        }
      }
      if (start === end) {
        end = firstNonSlashEnd;
      } else if (end === -1) {
        end = path.length;
      }
      return path.slice(start, end);
    }
    for (i = path.length - 1; i >= 0; --i) {
      if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          start = i + 1;
          break;
        }
      } else if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
    }
    if (end === -1) {
      return "";
    }
    return path.slice(start, end);
  },
  extname(path) {
    validateString(path, "path");
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; --i) {
      const char = path[i];
      if (char === "/") {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (char === ".") {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (startDot === -1 || end === -1 || // We saw a non-dot character immediately before the dot
    preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
    preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
      return "";
    }
    return path.slice(startDot, end);
  },
  format: _format.bind(null, "/"),
  parse(path) {
    validateString(path, "path");
    const ret = { root: "", dir: "", base: "", ext: "", name: "" };
    if (path.length === 0) {
      return ret;
    }
    const isAbsolute2 = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    let start;
    if (isAbsolute2) {
      ret.root = "/";
      start = 1;
    } else {
      start = 0;
    }
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for (; i >= start; --i) {
      const code = path.charCodeAt(i);
      if (code === CHAR_FORWARD_SLASH) {
        if (!matchedSlash) {
          startPart = i + 1;
          break;
        }
        continue;
      }
      if (end === -1) {
        matchedSlash = false;
        end = i + 1;
      }
      if (code === CHAR_DOT) {
        if (startDot === -1) {
          startDot = i;
        } else if (preDotState !== 1) {
          preDotState = 1;
        }
      } else if (startDot !== -1) {
        preDotState = -1;
      }
    }
    if (end !== -1) {
      const start2 = startPart === 0 && isAbsolute2 ? 1 : startPart;
      if (startDot === -1 || // We saw a non-dot character immediately before the dot
      preDotState === 0 || // The (right-most) trimmed path component is exactly '..'
      preDotState === 1 && startDot === end - 1 && startDot === startPart + 1) {
        ret.base = ret.name = path.slice(start2, end);
      } else {
        ret.name = path.slice(start2, startDot);
        ret.base = path.slice(start2, end);
        ret.ext = path.slice(startDot, end);
      }
    }
    if (startPart > 0) {
      ret.dir = path.slice(0, startPart - 1);
    } else if (isAbsolute2) {
      ret.dir = "/";
    }
    return ret;
  },
  sep: "/",
  delimiter: ":",
  win32: null,
  posix: null
};
posix.win32 = win32.win32 = win32;
posix.posix = win32.posix = posix;
const normalize = platformIsWin32 ? win32.normalize : posix.normalize;
const isAbsolute = platformIsWin32 ? win32.isAbsolute : posix.isAbsolute;
const join = platformIsWin32 ? win32.join : posix.join;
const resolve = platformIsWin32 ? win32.resolve : posix.resolve;
const relative = platformIsWin32 ? win32.relative : posix.relative;
const dirname = platformIsWin32 ? win32.dirname : posix.dirname;
const basename = platformIsWin32 ? win32.basename : posix.basename;
const extname = platformIsWin32 ? win32.extname : posix.extname;
const format = platformIsWin32 ? win32.format : posix.format;
const parse = platformIsWin32 ? win32.parse : posix.parse;
const toNamespacedPath = platformIsWin32 ? win32.toNamespacedPath : posix.toNamespacedPath;
const sep = platformIsWin32 ? win32.sep : posix.sep;
const delimiter = platformIsWin32 ? win32.delimiter : posix.delimiter;
export {
  basename,
  delimiter,
  dirname,
  extname,
  format,
  isAbsolute,
  join,
  normalize,
  parse,
  posix,
  relative,
  resolve,
  sep,
  toNamespacedPath,
  win32
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHBhdGgudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBOT1RFOiBWU0NvZGUncyBjb3B5IG9mIG5vZGVqcyBwYXRoIGxpYnJhcnkgdG8gYmUgdXNhYmxlIGluIGNvbW1vbiAobm9uLW5vZGUpIG5hbWVzcGFjZVxuLy8gQ29waWVkIGZyb206IGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9jb21taXRzL3YyMi4xNS4wL2xpYi9wYXRoLmpzXG4vLyBFeGNsdWRpbmc6IHRoZSBjaGFuZ2UgdGhhdCBhZGRzIHByaW1vcmRpYWxzXG4vLyAoaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2NvbW1pdC8xODdhODYyZDIyMWRlYzQyZmE5YTVjNDIxNGU3MDM0ZDkwOTI3OTJmIGFuZCBvdGhlcnMpXG4vLyBFeGNsdWRpbmc6IHRoZSBjaGFuZ2UgdGhhdCBhZGRzIGdsb2IgbWF0Y2hpbmdcbi8vIChodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvY29tbWl0LzU3YjhiOGUxOGU1ZTIwMDcxMTRjNjNiNzFiZjBiYWVkYzAxOTM2YTYpXG5cbi8qKlxuICogQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4gKlxuICogUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbiAqIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbiAqIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuICogd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuICogZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuICogcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4gKiBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuICogaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuICogT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuICogTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuICogTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4gKiBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1JcbiAqIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbiAqIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG4gKi9cblxuaW1wb3J0ICogYXMgcHJvY2VzcyBmcm9tICcuL3Byb2Nlc3MuanMnO1xuXG5jb25zdCBDSEFSX1VQUEVSQ0FTRV9BID0gNjU7LyogQSAqL1xuY29uc3QgQ0hBUl9MT1dFUkNBU0VfQSA9IDk3OyAvKiBhICovXG5jb25zdCBDSEFSX1VQUEVSQ0FTRV9aID0gOTA7IC8qIFogKi9cbmNvbnN0IENIQVJfTE9XRVJDQVNFX1ogPSAxMjI7IC8qIHogKi9cbmNvbnN0IENIQVJfRE9UID0gNDY7IC8qIC4gKi9cbmNvbnN0IENIQVJfRk9SV0FSRF9TTEFTSCA9IDQ3OyAvKiAvICovXG5jb25zdCBDSEFSX0JBQ0tXQVJEX1NMQVNIID0gOTI7IC8qIFxcICovXG5jb25zdCBDSEFSX0NPTE9OID0gNTg7IC8qIDogKi9cbmNvbnN0IENIQVJfUVVFU1RJT05fTUFSSyA9IDYzOyAvKiA/ICovXG5cbmNsYXNzIEVycm9ySW52YWxpZEFyZ1R5cGUgZXh0ZW5kcyBFcnJvciB7XG5cdGNvZGU6ICdFUlJfSU5WQUxJRF9BUkdfVFlQRSc7XG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZywgYWN0dWFsOiB1bmtub3duKSB7XG5cdFx0Ly8gZGV0ZXJtaW5lcjogJ211c3QgYmUnIG9yICdtdXN0IG5vdCBiZSdcblx0XHRsZXQgZGV0ZXJtaW5lcjtcblx0XHRpZiAodHlwZW9mIGV4cGVjdGVkID09PSAnc3RyaW5nJyAmJiBleHBlY3RlZC5pbmRleE9mKCdub3QgJykgPT09IDApIHtcblx0XHRcdGRldGVybWluZXIgPSAnbXVzdCBub3QgYmUnO1xuXHRcdFx0ZXhwZWN0ZWQgPSBleHBlY3RlZC5yZXBsYWNlKC9ebm90IC8sICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGV0ZXJtaW5lciA9ICdtdXN0IGJlJztcblx0XHR9XG5cblx0XHRjb25zdCB0eXBlID0gbmFtZS5pbmRleE9mKCcuJykgIT09IC0xID8gJ3Byb3BlcnR5JyA6ICdhcmd1bWVudCc7XG5cdFx0bGV0IG1zZyA9IGBUaGUgXCIke25hbWV9XCIgJHt0eXBlfSAke2RldGVybWluZXJ9IG9mIHR5cGUgJHtleHBlY3RlZH1gO1xuXG5cdFx0bXNnICs9IGAuIFJlY2VpdmVkIHR5cGUgJHt0eXBlb2YgYWN0dWFsfWA7XG5cdFx0c3VwZXIobXNnKTtcblxuXHRcdHRoaXMuY29kZSA9ICdFUlJfSU5WQUxJRF9BUkdfVFlQRSc7XG5cdH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVPYmplY3QocGF0aE9iamVjdDogb2JqZWN0LCBuYW1lOiBzdHJpbmcpIHtcblx0aWYgKHBhdGhPYmplY3QgPT09IG51bGwgfHwgdHlwZW9mIHBhdGhPYmplY3QgIT09ICdvYmplY3QnKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9ySW52YWxpZEFyZ1R5cGUobmFtZSwgJ09iamVjdCcsIHBhdGhPYmplY3QpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlU3RyaW5nKHZhbHVlOiBzdHJpbmcsIG5hbWU6IHN0cmluZykge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdHRocm93IG5ldyBFcnJvckludmFsaWRBcmdUeXBlKG5hbWUsICdzdHJpbmcnLCB2YWx1ZSk7XG5cdH1cbn1cblxuY29uc3QgcGxhdGZvcm1Jc1dpbjMyID0gKHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicpO1xuXG5mdW5jdGlvbiBpc1BhdGhTZXBhcmF0b3IoY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdHJldHVybiBjb2RlID09PSBDSEFSX0ZPUldBUkRfU0xBU0ggfHwgY29kZSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSDtcbn1cblxuZnVuY3Rpb24gaXNQb3NpeFBhdGhTZXBhcmF0b3IoY29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKSB7XG5cdHJldHVybiBjb2RlID09PSBDSEFSX0ZPUldBUkRfU0xBU0g7XG59XG5cbmZ1bmN0aW9uIGlzV2luZG93c0RldmljZVJvb3QoY29kZTogbnVtYmVyKSB7XG5cdHJldHVybiAoY29kZSA+PSBDSEFSX1VQUEVSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9VUFBFUkNBU0VfWikgfHxcblx0XHQoY29kZSA+PSBDSEFSX0xPV0VSQ0FTRV9BICYmIGNvZGUgPD0gQ0hBUl9MT1dFUkNBU0VfWik7XG59XG5cbi8vIFJlc29sdmVzIC4gYW5kIC4uIGVsZW1lbnRzIGluIGEgcGF0aCB3aXRoIGRpcmVjdG9yeSBuYW1lc1xuZnVuY3Rpb24gbm9ybWFsaXplU3RyaW5nKHBhdGg6IHN0cmluZywgYWxsb3dBYm92ZVJvb3Q6IGJvb2xlYW4sIHNlcGFyYXRvcjogc3RyaW5nLCBpc1BhdGhTZXBhcmF0b3I6IChjb2RlPzogbnVtYmVyKSA9PiBib29sZWFuKSB7XG5cdGxldCByZXMgPSAnJztcblx0bGV0IGxhc3RTZWdtZW50TGVuZ3RoID0gMDtcblx0bGV0IGxhc3RTbGFzaCA9IC0xO1xuXHRsZXQgZG90cyA9IDA7XG5cdGxldCBjb2RlID0gMDtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gcGF0aC5sZW5ndGg7ICsraSkge1xuXHRcdGlmIChpIDwgcGF0aC5sZW5ndGgpIHtcblx0XHRcdGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoaSk7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKGlzUGF0aFNlcGFyYXRvcihjb2RlKSkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29kZSA9IENIQVJfRk9SV0FSRF9TTEFTSDtcblx0XHR9XG5cblx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG5cdFx0XHRpZiAobGFzdFNsYXNoID09PSBpIC0gMSB8fCBkb3RzID09PSAxKSB7XG5cdFx0XHRcdC8vIE5PT1Bcblx0XHRcdH0gZWxzZSBpZiAoZG90cyA9PT0gMikge1xuXHRcdFx0XHRpZiAocmVzLmxlbmd0aCA8IDIgfHwgbGFzdFNlZ21lbnRMZW5ndGggIT09IDIgfHxcblx0XHRcdFx0XHRyZXMuY2hhckNvZGVBdChyZXMubGVuZ3RoIC0gMSkgIT09IENIQVJfRE9UIHx8XG5cdFx0XHRcdFx0cmVzLmNoYXJDb2RlQXQocmVzLmxlbmd0aCAtIDIpICE9PSBDSEFSX0RPVCkge1xuXHRcdFx0XHRcdGlmIChyZXMubGVuZ3RoID4gMikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFzdFNsYXNoSW5kZXggPSByZXMubGFzdEluZGV4T2Yoc2VwYXJhdG9yKTtcblx0XHRcdFx0XHRcdGlmIChsYXN0U2xhc2hJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0cmVzID0gJyc7XG5cdFx0XHRcdFx0XHRcdGxhc3RTZWdtZW50TGVuZ3RoID0gMDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlcyA9IHJlcy5zbGljZSgwLCBsYXN0U2xhc2hJbmRleCk7XG5cdFx0XHRcdFx0XHRcdGxhc3RTZWdtZW50TGVuZ3RoID0gcmVzLmxlbmd0aCAtIDEgLSByZXMubGFzdEluZGV4T2Yoc2VwYXJhdG9yKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGxhc3RTbGFzaCA9IGk7XG5cdFx0XHRcdFx0XHRkb3RzID0gMDtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocmVzLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRcdFx0cmVzID0gJyc7XG5cdFx0XHRcdFx0XHRsYXN0U2VnbWVudExlbmd0aCA9IDA7XG5cdFx0XHRcdFx0XHRsYXN0U2xhc2ggPSBpO1xuXHRcdFx0XHRcdFx0ZG90cyA9IDA7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFsbG93QWJvdmVSb290KSB7XG5cdFx0XHRcdFx0cmVzICs9IHJlcy5sZW5ndGggPiAwID8gYCR7c2VwYXJhdG9yfS4uYCA6ICcuLic7XG5cdFx0XHRcdFx0bGFzdFNlZ21lbnRMZW5ndGggPSAyO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAocmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRyZXMgKz0gYCR7c2VwYXJhdG9yfSR7cGF0aC5zbGljZShsYXN0U2xhc2ggKyAxLCBpKX1gO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHJlcyA9IHBhdGguc2xpY2UobGFzdFNsYXNoICsgMSwgaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdFNlZ21lbnRMZW5ndGggPSBpIC0gbGFzdFNsYXNoIC0gMTtcblx0XHRcdH1cblx0XHRcdGxhc3RTbGFzaCA9IGk7XG5cdFx0XHRkb3RzID0gMDtcblx0XHR9IGVsc2UgaWYgKGNvZGUgPT09IENIQVJfRE9UICYmIGRvdHMgIT09IC0xKSB7XG5cdFx0XHQrK2RvdHM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvdHMgPSAtMTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlcztcbn1cblxuZnVuY3Rpb24gZm9ybWF0RXh0KGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGV4dCA/IGAke2V4dFswXSA9PT0gJy4nID8gJycgOiAnLid9JHtleHR9YCA6ICcnO1xufVxuXG5mdW5jdGlvbiBfZm9ybWF0KHNlcDogc3RyaW5nLCBwYXRoT2JqZWN0OiBQYXJzZWRQYXRoKSB7XG5cdHZhbGlkYXRlT2JqZWN0KHBhdGhPYmplY3QsICdwYXRoT2JqZWN0Jyk7XG5cdGNvbnN0IGRpciA9IHBhdGhPYmplY3QuZGlyIHx8IHBhdGhPYmplY3Qucm9vdDtcblx0Y29uc3QgYmFzZSA9IHBhdGhPYmplY3QuYmFzZSB8fFxuXHRcdGAke3BhdGhPYmplY3QubmFtZSB8fCAnJ30ke2Zvcm1hdEV4dChwYXRoT2JqZWN0LmV4dCl9YDtcblx0aWYgKCFkaXIpIHtcblx0XHRyZXR1cm4gYmFzZTtcblx0fVxuXHRyZXR1cm4gZGlyID09PSBwYXRoT2JqZWN0LnJvb3QgPyBgJHtkaXJ9JHtiYXNlfWAgOiBgJHtkaXJ9JHtzZXB9JHtiYXNlfWA7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGFyc2VkUGF0aCB7XG5cdHJvb3Q6IHN0cmluZztcblx0ZGlyOiBzdHJpbmc7XG5cdGJhc2U6IHN0cmluZztcblx0ZXh0OiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUGF0aCB7XG5cdG5vcm1hbGl6ZShwYXRoOiBzdHJpbmcpOiBzdHJpbmc7XG5cdGlzQWJzb2x1dGUocGF0aDogc3RyaW5nKTogYm9vbGVhbjtcblx0am9pbiguLi5wYXRoczogc3RyaW5nW10pOiBzdHJpbmc7XG5cdHJlc29sdmUoLi4ucGF0aFNlZ21lbnRzOiBzdHJpbmdbXSk6IHN0cmluZztcblx0cmVsYXRpdmUoZnJvbTogc3RyaW5nLCB0bzogc3RyaW5nKTogc3RyaW5nO1xuXHRkaXJuYW1lKHBhdGg6IHN0cmluZyk6IHN0cmluZztcblx0YmFzZW5hbWUocGF0aDogc3RyaW5nLCBzdWZmaXg/OiBzdHJpbmcpOiBzdHJpbmc7XG5cdGV4dG5hbWUocGF0aDogc3RyaW5nKTogc3RyaW5nO1xuXHRmb3JtYXQocGF0aE9iamVjdDogUGFyc2VkUGF0aCk6IHN0cmluZztcblx0cGFyc2UocGF0aDogc3RyaW5nKTogUGFyc2VkUGF0aDtcblx0dG9OYW1lc3BhY2VkUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmc7XG5cdHNlcDogJ1xcXFwnIHwgJy8nO1xuXHRkZWxpbWl0ZXI6IHN0cmluZztcblx0d2luMzI6IElQYXRoIHwgbnVsbDtcblx0cG9zaXg6IElQYXRoIHwgbnVsbDtcbn1cblxuZXhwb3J0IGNvbnN0IHdpbjMyOiBJUGF0aCA9IHtcblx0Ly8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuXHRyZXNvbHZlKC4uLnBhdGhTZWdtZW50czogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGxldCByZXNvbHZlZERldmljZSA9ICcnO1xuXHRcdGxldCByZXNvbHZlZFRhaWwgPSAnJztcblx0XHRsZXQgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG5cdFx0Zm9yIChsZXQgaSA9IHBhdGhTZWdtZW50cy5sZW5ndGggLSAxOyBpID49IC0xOyBpLS0pIHtcblx0XHRcdGxldCBwYXRoO1xuXHRcdFx0aWYgKGkgPj0gMCkge1xuXHRcdFx0XHRwYXRoID0gcGF0aFNlZ21lbnRzW2ldO1xuXHRcdFx0XHR2YWxpZGF0ZVN0cmluZyhwYXRoLCBgcGF0aHNbJHtpfV1gKTtcblxuXHRcdFx0XHQvLyBTa2lwIGVtcHR5IGVudHJpZXNcblx0XHRcdFx0aWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAocmVzb2x2ZWREZXZpY2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHBhdGggPSBwcm9jZXNzLmN3ZCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2luZG93cyBoYXMgdGhlIGNvbmNlcHQgb2YgZHJpdmUtc3BlY2lmaWMgY3VycmVudCB3b3JraW5nXG5cdFx0XHRcdC8vIGRpcmVjdG9yaWVzLiBJZiB3ZSd2ZSByZXNvbHZlZCBhIGRyaXZlIGxldHRlciBidXQgbm90IHlldCBhblxuXHRcdFx0XHQvLyBhYnNvbHV0ZSBwYXRoLCBnZXQgY3dkIGZvciB0aGF0IGRyaXZlLCBvciB0aGUgcHJvY2VzcyBjd2QgaWZcblx0XHRcdFx0Ly8gdGhlIGRyaXZlIGN3ZCBpcyBub3QgYXZhaWxhYmxlLiBXZSdyZSBzdXJlIHRoZSBkZXZpY2UgaXMgbm90XG5cdFx0XHRcdC8vIGEgVU5DIHBhdGggYXQgdGhpcyBwb2ludHMsIGJlY2F1c2UgVU5DIHBhdGhzIGFyZSBhbHdheXMgYWJzb2x1dGUuXG5cdFx0XHRcdHBhdGggPSBwcm9jZXNzLmVudltgPSR7cmVzb2x2ZWREZXZpY2V9YF0gfHwgcHJvY2Vzcy5jd2QoKTtcblxuXHRcdFx0XHQvLyBWZXJpZnkgdGhhdCBhIGN3ZCB3YXMgZm91bmQgYW5kIHRoYXQgaXQgYWN0dWFsbHkgcG9pbnRzXG5cdFx0XHRcdC8vIHRvIG91ciBkcml2ZS4gSWYgbm90LCBkZWZhdWx0IHRvIHRoZSBkcml2ZSdzIHJvb3QuXG5cdFx0XHRcdGlmIChwYXRoID09PSB1bmRlZmluZWQgfHxcblx0XHRcdFx0XHQocGF0aC5zbGljZSgwLCAyKS50b0xvd2VyQ2FzZSgpICE9PSByZXNvbHZlZERldmljZS50b0xvd2VyQ2FzZSgpICYmXG5cdFx0XHRcdFx0XHRwYXRoLmNoYXJDb2RlQXQoMikgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpKSB7XG5cdFx0XHRcdFx0cGF0aCA9IGAke3Jlc29sdmVkRGV2aWNlfVxcXFxgO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuXHRcdFx0bGV0IHJvb3RFbmQgPSAwO1xuXHRcdFx0bGV0IGRldmljZSA9ICcnO1xuXHRcdFx0bGV0IGlzQWJzb2x1dGUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG5cblx0XHRcdC8vIFRyeSB0byBtYXRjaCBhIHJvb3Rcblx0XHRcdGlmIChsZW4gPT09IDEpIHtcblx0XHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihjb2RlKSkge1xuXHRcdFx0XHRcdC8vIGBwYXRoYCBjb250YWlucyBqdXN0IGEgcGF0aCBzZXBhcmF0b3Jcblx0XHRcdFx0XHRyb290RW5kID0gMTtcblx0XHRcdFx0XHRpc0Fic29sdXRlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcblx0XHRcdFx0Ly8gUG9zc2libGUgVU5DIHJvb3RcblxuXHRcdFx0XHQvLyBJZiB3ZSBzdGFydGVkIHdpdGggYSBzZXBhcmF0b3IsIHdlIGtub3cgd2UgYXQgbGVhc3QgaGF2ZSBhblxuXHRcdFx0XHQvLyBhYnNvbHV0ZSBwYXRoIG9mIHNvbWUga2luZCAoVU5DIG9yIG90aGVyd2lzZSlcblx0XHRcdFx0aXNBYnNvbHV0ZSA9IHRydWU7XG5cblx0XHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG5cdFx0XHRcdFx0Ly8gTWF0Y2hlZCBkb3VibGUgcGF0aCBzZXBhcmF0b3IgYXQgYmVnaW5uaW5nXG5cdFx0XHRcdFx0bGV0IGogPSAyO1xuXHRcdFx0XHRcdGxldCBsYXN0ID0gajtcblx0XHRcdFx0XHQvLyBNYXRjaCAxIG9yIG1vcmUgbm9uLXBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHRcdHdoaWxlIChqIDwgbGVuICYmICFpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkge1xuXHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaiA8IGxlbiAmJiBqICE9PSBsYXN0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaXJzdFBhcnQgPSBwYXRoLnNsaWNlKGxhc3QsIGopO1xuXHRcdFx0XHRcdFx0Ly8gTWF0Y2hlZCFcblx0XHRcdFx0XHRcdGxhc3QgPSBqO1xuXHRcdFx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHRcdFx0d2hpbGUgKGogPCBsZW4gJiYgaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIHtcblx0XHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGogPCBsZW4gJiYgaiAhPT0gbGFzdCkge1xuXHRcdFx0XHRcdFx0XHQvLyBNYXRjaGVkIVxuXHRcdFx0XHRcdFx0XHRsYXN0ID0gajtcblx0XHRcdFx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcblx0XHRcdFx0XHRcdFx0d2hpbGUgKGogPCBsZW4gJiYgIWlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChqID09PSBsZW4gfHwgaiAhPT0gbGFzdCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdFxuXHRcdFx0XHRcdFx0XHRcdGRldmljZSA9IGBcXFxcXFxcXCR7Zmlyc3RQYXJ0fVxcXFwke3BhdGguc2xpY2UobGFzdCwgail9YDtcblx0XHRcdFx0XHRcdFx0XHRyb290RW5kID0gajtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyb290RW5kID0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChpc1dpbmRvd3NEZXZpY2VSb290KGNvZGUpICYmXG5cdFx0XHRcdHBhdGguY2hhckNvZGVBdCgxKSA9PT0gQ0hBUl9DT0xPTikge1xuXHRcdFx0XHQvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXHRcdFx0XHRkZXZpY2UgPSBwYXRoLnNsaWNlKDAsIDIpO1xuXHRcdFx0XHRyb290RW5kID0gMjtcblx0XHRcdFx0aWYgKGxlbiA+IDIgJiYgaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdCgyKSkpIHtcblx0XHRcdFx0XHQvLyBUcmVhdCBzZXBhcmF0b3IgZm9sbG93aW5nIGRyaXZlIG5hbWUgYXMgYW4gYWJzb2x1dGUgcGF0aFxuXHRcdFx0XHRcdC8vIGluZGljYXRvclxuXHRcdFx0XHRcdGlzQWJzb2x1dGUgPSB0cnVlO1xuXHRcdFx0XHRcdHJvb3RFbmQgPSAzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkZXZpY2UubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWREZXZpY2UubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGlmIChkZXZpY2UudG9Mb3dlckNhc2UoKSAhPT0gcmVzb2x2ZWREZXZpY2UudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBwYXRoIHBvaW50cyB0byBhbm90aGVyIGRldmljZSBzbyBpdCBpcyBub3QgYXBwbGljYWJsZVxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc29sdmVkRGV2aWNlID0gZGV2aWNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXNvbHZlZEFic29sdXRlKSB7XG5cdFx0XHRcdGlmIChyZXNvbHZlZERldmljZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc29sdmVkVGFpbCA9IGAke3BhdGguc2xpY2Uocm9vdEVuZCl9XFxcXCR7cmVzb2x2ZWRUYWlsfWA7XG5cdFx0XHRcdHJlc29sdmVkQWJzb2x1dGUgPSBpc0Fic29sdXRlO1xuXHRcdFx0XHRpZiAoaXNBYnNvbHV0ZSAmJiByZXNvbHZlZERldmljZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCxcblx0XHQvLyBidXQgaGFuZGxlIHJlbGF0aXZlIHBhdGhzIHRvIGJlIHNhZmUgKG1pZ2h0IGhhcHBlbiB3aGVuIHByb2Nlc3MuY3dkKClcblx0XHQvLyBmYWlscylcblxuXHRcdC8vIE5vcm1hbGl6ZSB0aGUgdGFpbCBwYXRoXG5cdFx0cmVzb2x2ZWRUYWlsID0gbm9ybWFsaXplU3RyaW5nKHJlc29sdmVkVGFpbCwgIXJlc29sdmVkQWJzb2x1dGUsICdcXFxcJyxcblx0XHRcdGlzUGF0aFNlcGFyYXRvcik7XG5cblx0XHRyZXR1cm4gcmVzb2x2ZWRBYnNvbHV0ZSA/XG5cdFx0XHRgJHtyZXNvbHZlZERldmljZX1cXFxcJHtyZXNvbHZlZFRhaWx9YCA6XG5cdFx0XHRgJHtyZXNvbHZlZERldmljZX0ke3Jlc29sdmVkVGFpbH1gIHx8ICcuJztcblx0fSxcblxuXHRub3JtYWxpemUocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR2YWxpZGF0ZVN0cmluZyhwYXRoLCAncGF0aCcpO1xuXHRcdGNvbnN0IGxlbiA9IHBhdGgubGVuZ3RoO1xuXHRcdGlmIChsZW4gPT09IDApIHtcblx0XHRcdHJldHVybiAnLic7XG5cdFx0fVxuXHRcdGxldCByb290RW5kID0gMDtcblx0XHRsZXQgZGV2aWNlO1xuXHRcdGxldCBpc0Fic29sdXRlID0gZmFsc2U7XG5cdFx0Y29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdCgwKTtcblxuXHRcdC8vIFRyeSB0byBtYXRjaCBhIHJvb3Rcblx0XHRpZiAobGVuID09PSAxKSB7XG5cdFx0XHQvLyBgcGF0aGAgY29udGFpbnMganVzdCBhIHNpbmdsZSBjaGFyLCBleGl0IGVhcmx5IHRvIGF2b2lkXG5cdFx0XHQvLyB1bm5lY2Vzc2FyeSB3b3JrXG5cdFx0XHRyZXR1cm4gaXNQb3NpeFBhdGhTZXBhcmF0b3IoY29kZSkgPyAnXFxcXCcgOiBwYXRoO1xuXHRcdH1cblx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG5cdFx0XHQvLyBQb3NzaWJsZSBVTkMgcm9vdFxuXG5cdFx0XHQvLyBJZiB3ZSBzdGFydGVkIHdpdGggYSBzZXBhcmF0b3IsIHdlIGtub3cgd2UgYXQgbGVhc3QgaGF2ZSBhbiBhYnNvbHV0ZVxuXHRcdFx0Ly8gcGF0aCBvZiBzb21lIGtpbmQgKFVOQyBvciBvdGhlcndpc2UpXG5cdFx0XHRpc0Fic29sdXRlID0gdHJ1ZTtcblxuXHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG5cdFx0XHRcdC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuXHRcdFx0XHRsZXQgaiA9IDI7XG5cdFx0XHRcdGxldCBsYXN0ID0gajtcblx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcblx0XHRcdFx0d2hpbGUgKGogPCBsZW4gJiYgIWlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0aisrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdFBhcnQgPSBwYXRoLnNsaWNlKGxhc3QsIGopO1xuXHRcdFx0XHRcdC8vIE1hdGNoZWQhXG5cdFx0XHRcdFx0bGFzdCA9IGo7XG5cdFx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHRcdHdoaWxlIChqIDwgbGVuICYmIGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0XHRqKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcblx0XHRcdFx0XHRcdC8vIE1hdGNoZWQhXG5cdFx0XHRcdFx0XHRsYXN0ID0gajtcblx0XHRcdFx0XHRcdC8vIE1hdGNoIDEgb3IgbW9yZSBub24tcGF0aCBzZXBhcmF0b3JzXG5cdFx0XHRcdFx0XHR3aGlsZSAoaiA8IGxlbiAmJiAhaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIHtcblx0XHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGogPT09IGxlbikge1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgb25seVxuXHRcdFx0XHRcdFx0XHQvLyBSZXR1cm4gdGhlIG5vcm1hbGl6ZWQgdmVyc2lvbiBvZiB0aGUgVU5DIHJvb3Qgc2luY2UgdGhlcmVcblx0XHRcdFx0XHRcdFx0Ly8gaXMgbm90aGluZyBsZWZ0IHRvIHByb2Nlc3Ncblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBcXFxcXFxcXCR7Zmlyc3RQYXJ0fVxcXFwke3BhdGguc2xpY2UobGFzdCl9XFxcXGA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaiAhPT0gbGFzdCkge1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgd2l0aCBsZWZ0b3ZlcnNcblx0XHRcdFx0XHRcdFx0ZGV2aWNlID0gYFxcXFxcXFxcJHtmaXJzdFBhcnR9XFxcXCR7cGF0aC5zbGljZShsYXN0LCBqKX1gO1xuXHRcdFx0XHRcdFx0XHRyb290RW5kID0gajtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJvb3RFbmQgPSAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNXaW5kb3dzRGV2aWNlUm9vdChjb2RlKSAmJiBwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04pIHtcblx0XHRcdC8vIFBvc3NpYmxlIGRldmljZSByb290XG5cdFx0XHRkZXZpY2UgPSBwYXRoLnNsaWNlKDAsIDIpO1xuXHRcdFx0cm9vdEVuZCA9IDI7XG5cdFx0XHRpZiAobGVuID4gMiAmJiBpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KDIpKSkge1xuXHRcdFx0XHQvLyBUcmVhdCBzZXBhcmF0b3IgZm9sbG93aW5nIGRyaXZlIG5hbWUgYXMgYW4gYWJzb2x1dGUgcGF0aFxuXHRcdFx0XHQvLyBpbmRpY2F0b3Jcblx0XHRcdFx0aXNBYnNvbHV0ZSA9IHRydWU7XG5cdFx0XHRcdHJvb3RFbmQgPSAzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB0YWlsID0gcm9vdEVuZCA8IGxlbiA/XG5cdFx0XHRub3JtYWxpemVTdHJpbmcocGF0aC5zbGljZShyb290RW5kKSwgIWlzQWJzb2x1dGUsICdcXFxcJywgaXNQYXRoU2VwYXJhdG9yKSA6XG5cdFx0XHQnJztcblx0XHRpZiAodGFpbC5sZW5ndGggPT09IDAgJiYgIWlzQWJzb2x1dGUpIHtcblx0XHRcdHRhaWwgPSAnLic7XG5cdFx0fVxuXHRcdGlmICh0YWlsLmxlbmd0aCA+IDAgJiYgaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChsZW4gLSAxKSkpIHtcblx0XHRcdHRhaWwgKz0gJ1xcXFwnO1xuXHRcdH1cblx0XHRpZiAoIWlzQWJzb2x1dGUgJiYgZGV2aWNlID09PSB1bmRlZmluZWQgJiYgcGF0aC5pbmNsdWRlcygnOicpKSB7XG5cdFx0XHQvLyBJZiB0aGUgb3JpZ2luYWwgcGF0aCB3YXMgbm90IGFic29sdXRlIGFuZCBpZiB3ZSBoYXZlIG5vdCBiZWVuIGFibGUgdG9cblx0XHRcdC8vIHJlc29sdmUgaXQgcmVsYXRpdmUgdG8gYSBwYXJ0aWN1bGFyIGRldmljZSwgd2UgbmVlZCB0byBlbnN1cmUgdGhhdCB0aGVcblx0XHRcdC8vIGB0YWlsYCBoYXMgbm90IGJlY29tZSBzb21ldGhpbmcgdGhhdCBXaW5kb3dzIG1pZ2h0IGludGVycHJldCBhcyBhblxuXHRcdFx0Ly8gYWJzb2x1dGUgcGF0aC4gU2VlIENWRS0yMDI0LTM2MTM5LlxuXHRcdFx0aWYgKHRhaWwubGVuZ3RoID49IDIgJiZcblx0XHRcdFx0aXNXaW5kb3dzRGV2aWNlUm9vdCh0YWlsLmNoYXJDb2RlQXQoMCkpICYmXG5cdFx0XHRcdHRhaWwuY2hhckNvZGVBdCgxKSA9PT0gQ0hBUl9DT0xPTikge1xuXHRcdFx0XHRyZXR1cm4gYC5cXFxcJHt0YWlsfWA7XG5cdFx0XHR9XG5cdFx0XHRsZXQgaW5kZXggPSBwYXRoLmluZGV4T2YoJzonKTtcblx0XHRcdGRvIHtcblx0XHRcdFx0aWYgKGluZGV4ID09PSBsZW4gLSAxIHx8IGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaW5kZXggKyAxKSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gYC5cXFxcJHt0YWlsfWA7XG5cdFx0XHRcdH1cblx0XHRcdH0gd2hpbGUgKChpbmRleCA9IHBhdGguaW5kZXhPZignOicsIGluZGV4ICsgMSkpICE9PSAtMSk7XG5cdFx0fVxuXHRcdGlmIChkZXZpY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGlzQWJzb2x1dGUgPyBgXFxcXCR7dGFpbH1gIDogdGFpbDtcblx0XHR9XG5cdFx0cmV0dXJuIGlzQWJzb2x1dGUgPyBgJHtkZXZpY2V9XFxcXCR7dGFpbH1gIDogYCR7ZGV2aWNlfSR7dGFpbH1gO1xuXHR9LFxuXG5cdGlzQWJzb2x1dGUocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dmFsaWRhdGVTdHJpbmcocGF0aCwgJ3BhdGgnKTtcblx0XHRjb25zdCBsZW4gPSBwYXRoLmxlbmd0aDtcblx0XHRpZiAobGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdCgwKTtcblx0XHRyZXR1cm4gaXNQYXRoU2VwYXJhdG9yKGNvZGUpIHx8XG5cdFx0XHQvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXHRcdFx0KGxlbiA+IDIgJiZcblx0XHRcdFx0aXNXaW5kb3dzRGV2aWNlUm9vdChjb2RlKSAmJlxuXHRcdFx0XHRwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04gJiZcblx0XHRcdFx0aXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdCgyKSkpO1xuXHR9LFxuXG5cdGpvaW4oLi4ucGF0aHM6IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRpZiAocGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJy4nO1xuXHRcdH1cblxuXHRcdGxldCBqb2luZWQ7XG5cdFx0bGV0IGZpcnN0UGFydDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGF0aHMubGVuZ3RoOyArK2kpIHtcblx0XHRcdGNvbnN0IGFyZyA9IHBhdGhzW2ldO1xuXHRcdFx0dmFsaWRhdGVTdHJpbmcoYXJnLCAncGF0aCcpO1xuXHRcdFx0aWYgKGFyZy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlmIChqb2luZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGpvaW5lZCA9IGZpcnN0UGFydCA9IGFyZztcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRqb2luZWQgKz0gYFxcXFwke2FyZ31gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGpvaW5lZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gJy4nO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHRoZSBqb2luZWQgcGF0aCBkb2Vzbid0IHN0YXJ0IHdpdGggdHdvIHNsYXNoZXMsIGJlY2F1c2Vcblx0XHQvLyBub3JtYWxpemUoKSB3aWxsIG1pc3Rha2UgaXQgZm9yIGEgVU5DIHBhdGggdGhlbi5cblx0XHQvL1xuXHRcdC8vIFRoaXMgc3RlcCBpcyBza2lwcGVkIHdoZW4gaXQgaXMgdmVyeSBjbGVhciB0aGF0IHRoZSB1c2VyIGFjdHVhbGx5XG5cdFx0Ly8gaW50ZW5kZWQgdG8gcG9pbnQgYXQgYSBVTkMgcGF0aC4gVGhpcyBpcyBhc3N1bWVkIHdoZW4gdGhlIGZpcnN0XG5cdFx0Ly8gbm9uLWVtcHR5IHN0cmluZyBhcmd1bWVudHMgc3RhcnRzIHdpdGggZXhhY3RseSB0d28gc2xhc2hlcyBmb2xsb3dlZCBieVxuXHRcdC8vIGF0IGxlYXN0IG9uZSBtb3JlIG5vbi1zbGFzaCBjaGFyYWN0ZXIuXG5cdFx0Ly9cblx0XHQvLyBOb3RlIHRoYXQgZm9yIG5vcm1hbGl6ZSgpIHRvIHRyZWF0IGEgcGF0aCBhcyBhIFVOQyBwYXRoIGl0IG5lZWRzIHRvXG5cdFx0Ly8gaGF2ZSBhdCBsZWFzdCAyIGNvbXBvbmVudHMsIHNvIHdlIGRvbid0IGZpbHRlciBmb3IgdGhhdCBoZXJlLlxuXHRcdC8vIFRoaXMgbWVhbnMgdGhhdCB0aGUgdXNlciBjYW4gdXNlIGpvaW4gdG8gY29uc3RydWN0IFVOQyBwYXRocyBmcm9tXG5cdFx0Ly8gYSBzZXJ2ZXIgbmFtZSBhbmQgYSBzaGFyZSBuYW1lOyBmb3IgZXhhbXBsZTpcblx0XHQvLyAgIHBhdGguam9pbignLy9zZXJ2ZXInLCAnc2hhcmUnKSAtPiAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcJylcblx0XHRsZXQgbmVlZHNSZXBsYWNlID0gdHJ1ZTtcblx0XHRsZXQgc2xhc2hDb3VudCA9IDA7XG5cdFx0aWYgKHR5cGVvZiBmaXJzdFBhcnQgPT09ICdzdHJpbmcnICYmIGlzUGF0aFNlcGFyYXRvcihmaXJzdFBhcnQuY2hhckNvZGVBdCgwKSkpIHtcblx0XHRcdCsrc2xhc2hDb3VudDtcblx0XHRcdGNvbnN0IGZpcnN0TGVuID0gZmlyc3RQYXJ0Lmxlbmd0aDtcblx0XHRcdGlmIChmaXJzdExlbiA+IDEgJiYgaXNQYXRoU2VwYXJhdG9yKGZpcnN0UGFydC5jaGFyQ29kZUF0KDEpKSkge1xuXHRcdFx0XHQrK3NsYXNoQ291bnQ7XG5cdFx0XHRcdGlmIChmaXJzdExlbiA+IDIpIHtcblx0XHRcdFx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKGZpcnN0UGFydC5jaGFyQ29kZUF0KDIpKSkge1xuXHRcdFx0XHRcdFx0KytzbGFzaENvdW50O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBXZSBtYXRjaGVkIGEgVU5DIHBhdGggaW4gdGhlIGZpcnN0IHBhcnRcblx0XHRcdFx0XHRcdG5lZWRzUmVwbGFjZSA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobmVlZHNSZXBsYWNlKSB7XG5cdFx0XHQvLyBGaW5kIGFueSBtb3JlIGNvbnNlY3V0aXZlIHNsYXNoZXMgd2UgbmVlZCB0byByZXBsYWNlXG5cdFx0XHR3aGlsZSAoc2xhc2hDb3VudCA8IGpvaW5lZC5sZW5ndGggJiZcblx0XHRcdFx0aXNQYXRoU2VwYXJhdG9yKGpvaW5lZC5jaGFyQ29kZUF0KHNsYXNoQ291bnQpKSkge1xuXHRcdFx0XHRzbGFzaENvdW50Kys7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlcGxhY2UgdGhlIHNsYXNoZXMgaWYgbmVlZGVkXG5cdFx0XHRpZiAoc2xhc2hDb3VudCA+PSAyKSB7XG5cdFx0XHRcdGpvaW5lZCA9IGBcXFxcJHtqb2luZWQuc2xpY2Uoc2xhc2hDb3VudCl9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gd2luMzIubm9ybWFsaXplKGpvaW5lZCk7XG5cdH0sXG5cblxuXHQvLyBJdCB3aWxsIHNvbHZlIHRoZSByZWxhdGl2ZSBwYXRoIGZyb20gYGZyb21gIHRvIGB0b2AsIGZvciBpbnN0YW5jZTpcblx0Ly8gIGZyb20gPSAnQzpcXFxcb3JhbmRlYVxcXFx0ZXN0XFxcXGFhYSdcblx0Ly8gIHRvID0gJ0M6XFxcXG9yYW5kZWFcXFxcaW1wbFxcXFxiYmInXG5cdC8vIFRoZSBvdXRwdXQgb2YgdGhlIGZ1bmN0aW9uIHNob3VsZCBiZTogJy4uXFxcXC4uXFxcXGltcGxcXFxcYmJiJ1xuXHRyZWxhdGl2ZShmcm9tOiBzdHJpbmcsIHRvOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHZhbGlkYXRlU3RyaW5nKGZyb20sICdmcm9tJyk7XG5cdFx0dmFsaWRhdGVTdHJpbmcodG8sICd0bycpO1xuXG5cdFx0aWYgKGZyb20gPT09IHRvKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnJvbU9yaWcgPSB3aW4zMi5yZXNvbHZlKGZyb20pO1xuXHRcdGNvbnN0IHRvT3JpZyA9IHdpbjMyLnJlc29sdmUodG8pO1xuXG5cdFx0aWYgKGZyb21PcmlnID09PSB0b09yaWcpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRmcm9tID0gZnJvbU9yaWcudG9Mb3dlckNhc2UoKTtcblx0XHR0byA9IHRvT3JpZy50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0aWYgKGZyb20gPT09IHRvKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0aWYgKGZyb21PcmlnLmxlbmd0aCAhPT0gZnJvbS5sZW5ndGggfHwgdG9PcmlnLmxlbmd0aCAhPT0gdG8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBmcm9tU3BsaXQgPSBmcm9tT3JpZy5zcGxpdCgnXFxcXCcpO1xuXHRcdFx0Y29uc3QgdG9TcGxpdCA9IHRvT3JpZy5zcGxpdCgnXFxcXCcpO1xuXHRcdFx0aWYgKGZyb21TcGxpdFtmcm9tU3BsaXQubGVuZ3RoIC0gMV0gPT09ICcnKSB7XG5cdFx0XHRcdGZyb21TcGxpdC5wb3AoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0b1NwbGl0W3RvU3BsaXQubGVuZ3RoIC0gMV0gPT09ICcnKSB7XG5cdFx0XHRcdHRvU3BsaXQucG9wKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyb21MZW4gPSBmcm9tU3BsaXQubGVuZ3RoO1xuXHRcdFx0Y29uc3QgdG9MZW4gPSB0b1NwbGl0Lmxlbmd0aDtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IGZyb21MZW4gPCB0b0xlbiA/IGZyb21MZW4gOiB0b0xlbjtcblxuXHRcdFx0bGV0IGk7XG5cdFx0XHRmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKGZyb21TcGxpdFtpXS50b0xvd2VyQ2FzZSgpICE9PSB0b1NwbGl0W2ldLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdG9PcmlnO1xuXHRcdFx0fSBlbHNlIGlmIChpID09PSBsZW5ndGgpIHtcblx0XHRcdFx0aWYgKHRvTGVuID4gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRvU3BsaXQuc2xpY2UoaSkuam9pbignXFxcXCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmcm9tTGVuID4gbGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuICcuLlxcXFwnLnJlcGVhdChmcm9tTGVuIC0gMSAtIGkpICsgJy4uJztcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAnLi5cXFxcJy5yZXBlYXQoZnJvbUxlbiAtIGkpICsgdG9TcGxpdC5zbGljZShpKS5qb2luKCdcXFxcJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpbSBhbnkgbGVhZGluZyBiYWNrc2xhc2hlc1xuXHRcdGxldCBmcm9tU3RhcnQgPSAwO1xuXHRcdHdoaWxlIChmcm9tU3RhcnQgPCBmcm9tLmxlbmd0aCAmJlxuXHRcdFx0ZnJvbS5jaGFyQ29kZUF0KGZyb21TdGFydCkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcblx0XHRcdGZyb21TdGFydCsrO1xuXHRcdH1cblx0XHQvLyBUcmltIHRyYWlsaW5nIGJhY2tzbGFzaGVzIChhcHBsaWNhYmxlIHRvIFVOQyBwYXRocyBvbmx5KVxuXHRcdGxldCBmcm9tRW5kID0gZnJvbS5sZW5ndGg7XG5cdFx0d2hpbGUgKGZyb21FbmQgLSAxID4gZnJvbVN0YXJ0ICYmXG5cdFx0XHRmcm9tLmNoYXJDb2RlQXQoZnJvbUVuZCAtIDEpID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSB7XG5cdFx0XHRmcm9tRW5kLS07XG5cdFx0fVxuXHRcdGNvbnN0IGZyb21MZW4gPSBmcm9tRW5kIC0gZnJvbVN0YXJ0O1xuXG5cdFx0Ly8gVHJpbSBhbnkgbGVhZGluZyBiYWNrc2xhc2hlc1xuXHRcdGxldCB0b1N0YXJ0ID0gMDtcblx0XHR3aGlsZSAodG9TdGFydCA8IHRvLmxlbmd0aCAmJlxuXHRcdFx0dG8uY2hhckNvZGVBdCh0b1N0YXJ0KSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuXHRcdFx0dG9TdGFydCsrO1xuXHRcdH1cblx0XHQvLyBUcmltIHRyYWlsaW5nIGJhY2tzbGFzaGVzIChhcHBsaWNhYmxlIHRvIFVOQyBwYXRocyBvbmx5KVxuXHRcdGxldCB0b0VuZCA9IHRvLmxlbmd0aDtcblx0XHR3aGlsZSAodG9FbmQgLSAxID4gdG9TdGFydCAmJlxuXHRcdFx0dG8uY2hhckNvZGVBdCh0b0VuZCAtIDEpID09PSBDSEFSX0JBQ0tXQVJEX1NMQVNIKSB7XG5cdFx0XHR0b0VuZC0tO1xuXHRcdH1cblx0XHRjb25zdCB0b0xlbiA9IHRvRW5kIC0gdG9TdGFydDtcblxuXHRcdC8vIENvbXBhcmUgcGF0aHMgdG8gZmluZCB0aGUgbG9uZ2VzdCBjb21tb24gcGF0aCBmcm9tIHJvb3Rcblx0XHRjb25zdCBsZW5ndGggPSBmcm9tTGVuIDwgdG9MZW4gPyBmcm9tTGVuIDogdG9MZW47XG5cdFx0bGV0IGxhc3RDb21tb25TZXAgPSAtMTtcblx0XHRsZXQgaSA9IDA7XG5cdFx0Zm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZnJvbUNvZGUgPSBmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSk7XG5cdFx0XHRpZiAoZnJvbUNvZGUgIT09IHRvLmNoYXJDb2RlQXQodG9TdGFydCArIGkpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChmcm9tQ29kZSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuXHRcdFx0XHRsYXN0Q29tbW9uU2VwID0gaTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXZSBmb3VuZCBhIG1pc21hdGNoIGJlZm9yZSB0aGUgZmlyc3QgY29tbW9uIHBhdGggc2VwYXJhdG9yIHdhcyBzZWVuLCBzb1xuXHRcdC8vIHJldHVybiB0aGUgb3JpZ2luYWwgYHRvYC5cblx0XHRpZiAoaSAhPT0gbGVuZ3RoKSB7XG5cdFx0XHRpZiAobGFzdENvbW1vblNlcCA9PT0gLTEpIHtcblx0XHRcdFx0cmV0dXJuIHRvT3JpZztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRvTGVuID4gbGVuZ3RoKSB7XG5cdFx0XHRcdGlmICh0by5jaGFyQ29kZUF0KHRvU3RhcnQgKyBpKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuXHRcdFx0XHRcdC8vIFdlIGdldCBoZXJlIGlmIGBmcm9tYCBpcyB0aGUgZXhhY3QgYmFzZSBwYXRoIGZvciBgdG9gLlxuXHRcdFx0XHRcdC8vIEZvciBleGFtcGxlOiBmcm9tPSdDOlxcXFxmb29cXFxcYmFyJzsgdG89J0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6J1xuXHRcdFx0XHRcdHJldHVybiB0b09yaWcuc2xpY2UodG9TdGFydCArIGkgKyAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaSA9PT0gMikge1xuXHRcdFx0XHRcdC8vIFdlIGdldCBoZXJlIGlmIGBmcm9tYCBpcyB0aGUgZGV2aWNlIHJvb3QuXG5cdFx0XHRcdFx0Ly8gRm9yIGV4YW1wbGU6IGZyb209J0M6XFxcXCc7IHRvPSdDOlxcXFxmb28nXG5cdFx0XHRcdFx0cmV0dXJuIHRvT3JpZy5zbGljZSh0b1N0YXJ0ICsgaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChmcm9tTGVuID4gbGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcblx0XHRcdFx0XHQvLyBXZSBnZXQgaGVyZSBpZiBgdG9gIGlzIHRoZSBleGFjdCBiYXNlIHBhdGggZm9yIGBmcm9tYC5cblx0XHRcdFx0XHQvLyBGb3IgZXhhbXBsZTogZnJvbT0nQzpcXFxcZm9vXFxcXGJhcic7IHRvPSdDOlxcXFxmb28nXG5cdFx0XHRcdFx0bGFzdENvbW1vblNlcCA9IGk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaSA9PT0gMikge1xuXHRcdFx0XHRcdC8vIFdlIGdldCBoZXJlIGlmIGB0b2AgaXMgdGhlIGRldmljZSByb290LlxuXHRcdFx0XHRcdC8vIEZvciBleGFtcGxlOiBmcm9tPSdDOlxcXFxmb29cXFxcYmFyJzsgdG89J0M6XFxcXCdcblx0XHRcdFx0XHRsYXN0Q29tbW9uU2VwID0gMztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RDb21tb25TZXAgPT09IC0xKSB7XG5cdFx0XHRcdGxhc3RDb21tb25TZXAgPSAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBvdXQgPSAnJztcblx0XHQvLyBHZW5lcmF0ZSB0aGUgcmVsYXRpdmUgcGF0aCBiYXNlZCBvbiB0aGUgcGF0aCBkaWZmZXJlbmNlIGJldHdlZW4gYHRvYCBhbmRcblx0XHQvLyBgZnJvbWBcblx0XHRmb3IgKGkgPSBmcm9tU3RhcnQgKyBsYXN0Q29tbW9uU2VwICsgMTsgaSA8PSBmcm9tRW5kOyArK2kpIHtcblx0XHRcdGlmIChpID09PSBmcm9tRW5kIHx8IGZyb20uY2hhckNvZGVBdChpKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuXHRcdFx0XHRvdXQgKz0gb3V0Lmxlbmd0aCA9PT0gMCA/ICcuLicgOiAnXFxcXC4uJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0b1N0YXJ0ICs9IGxhc3RDb21tb25TZXA7XG5cblx0XHQvLyBMYXN0bHksIGFwcGVuZCB0aGUgcmVzdCBvZiB0aGUgZGVzdGluYXRpb24gKGB0b2ApIHBhdGggdGhhdCBjb21lcyBhZnRlclxuXHRcdC8vIHRoZSBjb21tb24gcGF0aCBwYXJ0c1xuXHRcdGlmIChvdXQubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGAke291dH0ke3RvT3JpZy5zbGljZSh0b1N0YXJ0LCB0b0VuZCl9YDtcblx0XHR9XG5cblx0XHRpZiAodG9PcmlnLmNoYXJDb2RlQXQodG9TdGFydCkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcblx0XHRcdCsrdG9TdGFydDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9PcmlnLnNsaWNlKHRvU3RhcnQsIHRvRW5kKTtcblx0fSxcblxuXHR0b05hbWVzcGFjZWRQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gTm90ZTogdGhpcyB3aWxsICpwcm9iYWJseSogdGhyb3cgc29tZXdoZXJlLlxuXHRcdGlmICh0eXBlb2YgcGF0aCAhPT0gJ3N0cmluZycgfHwgcGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBwYXRoO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkUGF0aCA9IHdpbjMyLnJlc29sdmUocGF0aCk7XG5cblx0XHRpZiAocmVzb2x2ZWRQYXRoLmxlbmd0aCA8PSAyKSB7XG5cdFx0XHRyZXR1cm4gcGF0aDtcblx0XHR9XG5cblx0XHRpZiAocmVzb2x2ZWRQYXRoLmNoYXJDb2RlQXQoMCkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcblx0XHRcdC8vIFBvc3NpYmxlIFVOQyByb290XG5cdFx0XHRpZiAocmVzb2x2ZWRQYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQkFDS1dBUkRfU0xBU0gpIHtcblx0XHRcdFx0Y29uc3QgY29kZSA9IHJlc29sdmVkUGF0aC5jaGFyQ29kZUF0KDIpO1xuXHRcdFx0XHRpZiAoY29kZSAhPT0gQ0hBUl9RVUVTVElPTl9NQVJLICYmIGNvZGUgIT09IENIQVJfRE9UKSB7XG5cdFx0XHRcdFx0Ly8gTWF0Y2hlZCBub24tbG9uZyBVTkMgcm9vdCwgY29udmVydCB0aGUgcGF0aCB0byBhIGxvbmcgVU5DIHBhdGhcblx0XHRcdFx0XHRyZXR1cm4gYFxcXFxcXFxcP1xcXFxVTkNcXFxcJHtyZXNvbHZlZFBhdGguc2xpY2UoMil9YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNXaW5kb3dzRGV2aWNlUm9vdChyZXNvbHZlZFBhdGguY2hhckNvZGVBdCgwKSkgJiZcblx0XHRcdHJlc29sdmVkUGF0aC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0NPTE9OICYmXG5cdFx0XHRyZXNvbHZlZFBhdGguY2hhckNvZGVBdCgyKSA9PT0gQ0hBUl9CQUNLV0FSRF9TTEFTSCkge1xuXHRcdFx0Ly8gTWF0Y2hlZCBkZXZpY2Ugcm9vdCwgY29udmVydCB0aGUgcGF0aCB0byBhIGxvbmcgVU5DIHBhdGhcblx0XHRcdHJldHVybiBgXFxcXFxcXFw/XFxcXCR7cmVzb2x2ZWRQYXRofWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc29sdmVkUGF0aDtcblx0fSxcblxuXHRkaXJuYW1lKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dmFsaWRhdGVTdHJpbmcocGF0aCwgJ3BhdGgnKTtcblx0XHRjb25zdCBsZW4gPSBwYXRoLmxlbmd0aDtcblx0XHRpZiAobGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJy4nO1xuXHRcdH1cblx0XHRsZXQgcm9vdEVuZCA9IC0xO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMCk7XG5cblx0XHRpZiAobGVuID09PSAxKSB7XG5cdFx0XHQvLyBgcGF0aGAgY29udGFpbnMganVzdCBhIHBhdGggc2VwYXJhdG9yLCBleGl0IGVhcmx5IHRvIGF2b2lkXG5cdFx0XHQvLyB1bm5lY2Vzc2FyeSB3b3JrIG9yIGEgZG90LlxuXHRcdFx0cmV0dXJuIGlzUGF0aFNlcGFyYXRvcihjb2RlKSA/IHBhdGggOiAnLic7XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIG1hdGNoIGEgcm9vdFxuXHRcdGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcblx0XHRcdC8vIFBvc3NpYmxlIFVOQyByb290XG5cblx0XHRcdHJvb3RFbmQgPSBvZmZzZXQgPSAxO1xuXG5cdFx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdCgxKSkpIHtcblx0XHRcdFx0Ly8gTWF0Y2hlZCBkb3VibGUgcGF0aCBzZXBhcmF0b3IgYXQgYmVnaW5uaW5nXG5cdFx0XHRcdGxldCBqID0gMjtcblx0XHRcdFx0bGV0IGxhc3QgPSBqO1xuXHRcdFx0XHQvLyBNYXRjaCAxIG9yIG1vcmUgbm9uLXBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHR3aGlsZSAoaiA8IGxlbiAmJiAhaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIHtcblx0XHRcdFx0XHRqKys7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGogPCBsZW4gJiYgaiAhPT0gbGFzdCkge1xuXHRcdFx0XHRcdC8vIE1hdGNoZWQhXG5cdFx0XHRcdFx0bGFzdCA9IGo7XG5cdFx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIHBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHRcdHdoaWxlIChqIDwgbGVuICYmIGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0XHRqKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcblx0XHRcdFx0XHRcdC8vIE1hdGNoZWQhXG5cdFx0XHRcdFx0XHRsYXN0ID0gajtcblx0XHRcdFx0XHRcdC8vIE1hdGNoIDEgb3IgbW9yZSBub24tcGF0aCBzZXBhcmF0b3JzXG5cdFx0XHRcdFx0XHR3aGlsZSAoaiA8IGxlbiAmJiAhaXNQYXRoU2VwYXJhdG9yKHBhdGguY2hhckNvZGVBdChqKSkpIHtcblx0XHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGogPT09IGxlbikge1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBtYXRjaGVkIGEgVU5DIHJvb3Qgb25seVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcGF0aDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChqICE9PSBsYXN0KSB7XG5cdFx0XHRcdFx0XHRcdC8vIFdlIG1hdGNoZWQgYSBVTkMgcm9vdCB3aXRoIGxlZnRvdmVyc1xuXG5cdFx0XHRcdFx0XHRcdC8vIE9mZnNldCBieSAxIHRvIGluY2x1ZGUgdGhlIHNlcGFyYXRvciBhZnRlciB0aGUgVU5DIHJvb3QgdG9cblx0XHRcdFx0XHRcdFx0Ly8gdHJlYXQgaXQgYXMgYSBcIm5vcm1hbCByb290XCIgb24gdG9wIG9mIGEgKFVOQykgcm9vdFxuXHRcdFx0XHRcdFx0XHRyb290RW5kID0gb2Zmc2V0ID0gaiArIDE7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXHRcdH0gZWxzZSBpZiAoaXNXaW5kb3dzRGV2aWNlUm9vdChjb2RlKSAmJiBwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04pIHtcblx0XHRcdHJvb3RFbmQgPSBsZW4gPiAyICYmIGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMikpID8gMyA6IDI7XG5cdFx0XHRvZmZzZXQgPSByb290RW5kO1xuXHRcdH1cblxuXHRcdGxldCBlbmQgPSAtMTtcblx0XHRsZXQgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcblx0XHRmb3IgKGxldCBpID0gbGVuIC0gMTsgaSA+PSBvZmZzZXQ7IC0taSkge1xuXHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaSkpKSB7XG5cdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0ZW5kID0gaTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3Jcblx0XHRcdFx0bWF0Y2hlZFNsYXNoID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdGlmIChyb290RW5kID09PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gJy4nO1xuXHRcdFx0fVxuXG5cdFx0XHRlbmQgPSByb290RW5kO1xuXHRcdH1cblx0XHRyZXR1cm4gcGF0aC5zbGljZSgwLCBlbmQpO1xuXHR9LFxuXG5cdGJhc2VuYW1lKHBhdGg6IHN0cmluZywgc3VmZml4Pzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoc3VmZml4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbGlkYXRlU3RyaW5nKHN1ZmZpeCwgJ3N1ZmZpeCcpO1xuXHRcdH1cblx0XHR2YWxpZGF0ZVN0cmluZyhwYXRoLCAncGF0aCcpO1xuXHRcdGxldCBzdGFydCA9IDA7XG5cdFx0bGV0IGVuZCA9IC0xO1xuXHRcdGxldCBtYXRjaGVkU2xhc2ggPSB0cnVlO1xuXHRcdGxldCBpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGEgZHJpdmUgbGV0dGVyIHByZWZpeCBzbyBhcyBub3QgdG8gbWlzdGFrZSB0aGUgZm9sbG93aW5nXG5cdFx0Ly8gcGF0aCBzZXBhcmF0b3IgYXMgYW4gZXh0cmEgc2VwYXJhdG9yIGF0IHRoZSBlbmQgb2YgdGhlIHBhdGggdGhhdCBjYW4gYmVcblx0XHQvLyBkaXNyZWdhcmRlZFxuXHRcdGlmIChwYXRoLmxlbmd0aCA+PSAyICYmXG5cdFx0XHRpc1dpbmRvd3NEZXZpY2VSb290KHBhdGguY2hhckNvZGVBdCgwKSkgJiZcblx0XHRcdHBhdGguY2hhckNvZGVBdCgxKSA9PT0gQ0hBUl9DT0xPTikge1xuXHRcdFx0c3RhcnQgPSAyO1xuXHRcdH1cblxuXHRcdGlmIChzdWZmaXggIT09IHVuZGVmaW5lZCAmJiBzdWZmaXgubGVuZ3RoID4gMCAmJiBzdWZmaXgubGVuZ3RoIDw9IHBhdGgubGVuZ3RoKSB7XG5cdFx0XHRpZiAoc3VmZml4ID09PSBwYXRoKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdGxldCBleHRJZHggPSBzdWZmaXgubGVuZ3RoIC0gMTtcblx0XHRcdGxldCBmaXJzdE5vblNsYXNoRW5kID0gLTE7XG5cdFx0XHRmb3IgKGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gc3RhcnQ7IC0taSkge1xuXHRcdFx0XHRjb25zdCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG5cdFx0XHRcdFx0Ly8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcblx0XHRcdFx0XHQvLyBzZXBhcmF0b3JzIGF0IHRoZSBlbmQgb2YgdGhlIHN0cmluZywgc3RvcCBub3dcblx0XHRcdFx0XHRpZiAoIW1hdGNoZWRTbGFzaCkge1xuXHRcdFx0XHRcdFx0c3RhcnQgPSBpICsgMTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoZmlyc3ROb25TbGFzaEVuZCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCByZW1lbWJlciB0aGlzIGluZGV4IGluIGNhc2Vcblx0XHRcdFx0XHRcdC8vIHdlIG5lZWQgaXQgaWYgdGhlIGV4dGVuc2lvbiBlbmRzIHVwIG5vdCBtYXRjaGluZ1xuXHRcdFx0XHRcdFx0bWF0Y2hlZFNsYXNoID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRmaXJzdE5vblNsYXNoRW5kID0gaSArIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChleHRJZHggPj0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gVHJ5IHRvIG1hdGNoIHRoZSBleHBsaWNpdCBleHRlbnNpb25cblx0XHRcdFx0XHRcdGlmIChjb2RlID09PSBzdWZmaXguY2hhckNvZGVBdChleHRJZHgpKSB7XG5cdFx0XHRcdFx0XHRcdGlmICgtLWV4dElkeCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBXZSBtYXRjaGVkIHRoZSBleHRlbnNpb24sIHNvIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91ciBwYXRoXG5cdFx0XHRcdFx0XHRcdFx0Ly8gY29tcG9uZW50XG5cdFx0XHRcdFx0XHRcdFx0ZW5kID0gaTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGRvZXMgbm90IG1hdGNoLCBzbyBvdXIgcmVzdWx0IGlzIHRoZSBlbnRpcmUgcGF0aFxuXHRcdFx0XHRcdFx0XHQvLyBjb21wb25lbnRcblx0XHRcdFx0XHRcdFx0ZXh0SWR4ID0gLTE7XG5cdFx0XHRcdFx0XHRcdGVuZCA9IGZpcnN0Tm9uU2xhc2hFbmQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydCA9PT0gZW5kKSB7XG5cdFx0XHRcdGVuZCA9IGZpcnN0Tm9uU2xhc2hFbmQ7XG5cdFx0XHR9IGVsc2UgaWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdFx0ZW5kID0gcGF0aC5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGF0aC5zbGljZShzdGFydCwgZW5kKTtcblx0XHR9XG5cdFx0Zm9yIChpID0gcGF0aC5sZW5ndGggLSAxOyBpID49IHN0YXJ0OyAtLWkpIHtcblx0XHRcdGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGkpKSkge1xuXHRcdFx0XHQvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuXHRcdFx0XHQvLyBzZXBhcmF0b3JzIGF0IHRoZSBlbmQgb2YgdGhlIHN0cmluZywgc3RvcCBub3dcblx0XHRcdFx0aWYgKCFtYXRjaGVkU2xhc2gpIHtcblx0XHRcdFx0XHRzdGFydCA9IGkgKyAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91clxuXHRcdFx0XHQvLyBwYXRoIGNvbXBvbmVudFxuXHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdFx0ZW5kID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHBhdGguc2xpY2Uoc3RhcnQsIGVuZCk7XG5cdH0sXG5cblx0ZXh0bmFtZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHRsZXQgc3RhcnREb3QgPSAtMTtcblx0XHRsZXQgc3RhcnRQYXJ0ID0gMDtcblx0XHRsZXQgZW5kID0gLTE7XG5cdFx0bGV0IG1hdGNoZWRTbGFzaCA9IHRydWU7XG5cdFx0Ly8gVHJhY2sgdGhlIHN0YXRlIG9mIGNoYXJhY3RlcnMgKGlmIGFueSkgd2Ugc2VlIGJlZm9yZSBvdXIgZmlyc3QgZG90IGFuZFxuXHRcdC8vIGFmdGVyIGFueSBwYXRoIHNlcGFyYXRvciB3ZSBmaW5kXG5cdFx0bGV0IHByZURvdFN0YXRlID0gMDtcblxuXHRcdC8vIENoZWNrIGZvciBhIGRyaXZlIGxldHRlciBwcmVmaXggc28gYXMgbm90IHRvIG1pc3Rha2UgdGhlIGZvbGxvd2luZ1xuXHRcdC8vIHBhdGggc2VwYXJhdG9yIGFzIGFuIGV4dHJhIHNlcGFyYXRvciBhdCB0aGUgZW5kIG9mIHRoZSBwYXRoIHRoYXQgY2FuIGJlXG5cdFx0Ly8gZGlzcmVnYXJkZWRcblxuXHRcdGlmIChwYXRoLmxlbmd0aCA+PSAyICYmXG5cdFx0XHRwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENIQVJfQ09MT04gJiZcblx0XHRcdGlzV2luZG93c0RldmljZVJvb3QocGF0aC5jaGFyQ29kZUF0KDApKSkge1xuXHRcdFx0c3RhcnQgPSBzdGFydFBhcnQgPSAyO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gc3RhcnQ7IC0taSkge1xuXHRcdFx0Y29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcblx0XHRcdGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcblx0XHRcdFx0Ly8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcblx0XHRcdFx0Ly8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG5cdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0c3RhcnRQYXJ0ID0gaSArIDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5kID09PSAtMSkge1xuXHRcdFx0XHQvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG5cdFx0XHRcdC8vIGV4dGVuc2lvblxuXHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdFx0ZW5kID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29kZSA9PT0gQ0hBUl9ET1QpIHtcblx0XHRcdFx0Ly8gSWYgdGhpcyBpcyBvdXIgZmlyc3QgZG90LCBtYXJrIGl0IGFzIHRoZSBzdGFydCBvZiBvdXIgZXh0ZW5zaW9uXG5cdFx0XHRcdGlmIChzdGFydERvdCA9PT0gLTEpIHtcblx0XHRcdFx0XHRzdGFydERvdCA9IGk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpIHtcblx0XHRcdFx0XHRwcmVEb3RTdGF0ZSA9IDE7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc3RhcnREb3QgIT09IC0xKSB7XG5cdFx0XHRcdC8vIFdlIHNhdyBhIG5vbi1kb3QgYW5kIG5vbi1wYXRoIHNlcGFyYXRvciBiZWZvcmUgb3VyIGRvdCwgc28gd2Ugc2hvdWxkXG5cdFx0XHRcdC8vIGhhdmUgYSBnb29kIGNoYW5jZSBhdCBoYXZpbmcgYSBub24tZW1wdHkgZXh0ZW5zaW9uXG5cdFx0XHRcdHByZURvdFN0YXRlID0gLTE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0RG90ID09PSAtMSB8fFxuXHRcdFx0ZW5kID09PSAtMSB8fFxuXHRcdFx0Ly8gV2Ugc2F3IGEgbm9uLWRvdCBjaGFyYWN0ZXIgaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBkb3Rcblx0XHRcdHByZURvdFN0YXRlID09PSAwIHx8XG5cdFx0XHQvLyBUaGUgKHJpZ2h0LW1vc3QpIHRyaW1tZWQgcGF0aCBjb21wb25lbnQgaXMgZXhhY3RseSAnLi4nXG5cdFx0XHQocHJlRG90U3RhdGUgPT09IDEgJiZcblx0XHRcdFx0c3RhcnREb3QgPT09IGVuZCAtIDEgJiZcblx0XHRcdFx0c3RhcnREb3QgPT09IHN0YXJ0UGFydCArIDEpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0RG90LCBlbmQpO1xuXHR9LFxuXG5cdGZvcm1hdDogX2Zvcm1hdC5iaW5kKG51bGwsICdcXFxcJyksXG5cblx0cGFyc2UocGF0aCkge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cblx0XHRjb25zdCByZXQgPSB7IHJvb3Q6ICcnLCBkaXI6ICcnLCBiYXNlOiAnJywgZXh0OiAnJywgbmFtZTogJycgfTtcblx0XHRpZiAocGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiByZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVuID0gcGF0aC5sZW5ndGg7XG5cdFx0bGV0IHJvb3RFbmQgPSAwO1xuXHRcdGxldCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXG5cdFx0aWYgKGxlbiA9PT0gMSkge1xuXHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihjb2RlKSkge1xuXHRcdFx0XHQvLyBgcGF0aGAgY29udGFpbnMganVzdCBhIHBhdGggc2VwYXJhdG9yLCBleGl0IGVhcmx5IHRvIGF2b2lkXG5cdFx0XHRcdC8vIHVubmVjZXNzYXJ5IHdvcmtcblx0XHRcdFx0cmV0LnJvb3QgPSByZXQuZGlyID0gcGF0aDtcblx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdH1cblx0XHRcdHJldC5iYXNlID0gcmV0Lm5hbWUgPSBwYXRoO1xuXHRcdFx0cmV0dXJuIHJldDtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIG1hdGNoIGEgcm9vdFxuXHRcdGlmIChpc1BhdGhTZXBhcmF0b3IoY29kZSkpIHtcblx0XHRcdC8vIFBvc3NpYmxlIFVOQyByb290XG5cblx0XHRcdHJvb3RFbmQgPSAxO1xuXHRcdFx0aWYgKGlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoMSkpKSB7XG5cdFx0XHRcdC8vIE1hdGNoZWQgZG91YmxlIHBhdGggc2VwYXJhdG9yIGF0IGJlZ2lubmluZ1xuXHRcdFx0XHRsZXQgaiA9IDI7XG5cdFx0XHRcdGxldCBsYXN0ID0gajtcblx0XHRcdFx0Ly8gTWF0Y2ggMSBvciBtb3JlIG5vbi1wYXRoIHNlcGFyYXRvcnNcblx0XHRcdFx0d2hpbGUgKGogPCBsZW4gJiYgIWlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0aisrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChqIDwgbGVuICYmIGogIT09IGxhc3QpIHtcblx0XHRcdFx0XHQvLyBNYXRjaGVkIVxuXHRcdFx0XHRcdGxhc3QgPSBqO1xuXHRcdFx0XHRcdC8vIE1hdGNoIDEgb3IgbW9yZSBwYXRoIHNlcGFyYXRvcnNcblx0XHRcdFx0XHR3aGlsZSAoaiA8IGxlbiAmJiBpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KGopKSkge1xuXHRcdFx0XHRcdFx0aisrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaiA8IGxlbiAmJiBqICE9PSBsYXN0KSB7XG5cdFx0XHRcdFx0XHQvLyBNYXRjaGVkIVxuXHRcdFx0XHRcdFx0bGFzdCA9IGo7XG5cdFx0XHRcdFx0XHQvLyBNYXRjaCAxIG9yIG1vcmUgbm9uLXBhdGggc2VwYXJhdG9yc1xuXHRcdFx0XHRcdFx0d2hpbGUgKGogPCBsZW4gJiYgIWlzUGF0aFNlcGFyYXRvcihwYXRoLmNoYXJDb2RlQXQoaikpKSB7XG5cdFx0XHRcdFx0XHRcdGorKztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChqID09PSBsZW4pIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2UgbWF0Y2hlZCBhIFVOQyByb290IG9ubHlcblx0XHRcdFx0XHRcdFx0cm9vdEVuZCA9IGo7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGogIT09IGxhc3QpIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2UgbWF0Y2hlZCBhIFVOQyByb290IHdpdGggbGVmdG92ZXJzXG5cdFx0XHRcdFx0XHRcdHJvb3RFbmQgPSBqICsgMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzV2luZG93c0RldmljZVJvb3QoY29kZSkgJiYgcGF0aC5jaGFyQ29kZUF0KDEpID09PSBDSEFSX0NPTE9OKSB7XG5cdFx0XHQvLyBQb3NzaWJsZSBkZXZpY2Ugcm9vdFxuXHRcdFx0aWYgKGxlbiA8PSAyKSB7XG5cdFx0XHRcdC8vIGBwYXRoYCBjb250YWlucyBqdXN0IGEgZHJpdmUgcm9vdCwgZXhpdCBlYXJseSB0byBhdm9pZFxuXHRcdFx0XHQvLyB1bm5lY2Vzc2FyeSB3b3JrXG5cdFx0XHRcdHJldC5yb290ID0gcmV0LmRpciA9IHBhdGg7XG5cdFx0XHRcdHJldHVybiByZXQ7XG5cdFx0XHR9XG5cdFx0XHRyb290RW5kID0gMjtcblx0XHRcdGlmIChpc1BhdGhTZXBhcmF0b3IocGF0aC5jaGFyQ29kZUF0KDIpKSkge1xuXHRcdFx0XHRpZiAobGVuID09PSAzKSB7XG5cdFx0XHRcdFx0Ly8gYHBhdGhgIGNvbnRhaW5zIGp1c3QgYSBkcml2ZSByb290LCBleGl0IGVhcmx5IHRvIGF2b2lkXG5cdFx0XHRcdFx0Ly8gdW5uZWNlc3Nhcnkgd29ya1xuXHRcdFx0XHRcdHJldC5yb290ID0gcmV0LmRpciA9IHBhdGg7XG5cdFx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyb290RW5kID0gMztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJvb3RFbmQgPiAwKSB7XG5cdFx0XHRyZXQucm9vdCA9IHBhdGguc2xpY2UoMCwgcm9vdEVuZCk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXJ0RG90ID0gLTE7XG5cdFx0bGV0IHN0YXJ0UGFydCA9IHJvb3RFbmQ7XG5cdFx0bGV0IGVuZCA9IC0xO1xuXHRcdGxldCBtYXRjaGVkU2xhc2ggPSB0cnVlO1xuXHRcdGxldCBpID0gcGF0aC5sZW5ndGggLSAxO1xuXG5cdFx0Ly8gVHJhY2sgdGhlIHN0YXRlIG9mIGNoYXJhY3RlcnMgKGlmIGFueSkgd2Ugc2VlIGJlZm9yZSBvdXIgZmlyc3QgZG90IGFuZFxuXHRcdC8vIGFmdGVyIGFueSBwYXRoIHNlcGFyYXRvciB3ZSBmaW5kXG5cdFx0bGV0IHByZURvdFN0YXRlID0gMDtcblxuXHRcdC8vIEdldCBub24tZGlyIGluZm9cblx0XHRmb3IgKDsgaSA+PSByb290RW5kOyAtLWkpIHtcblx0XHRcdGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRpZiAoaXNQYXRoU2VwYXJhdG9yKGNvZGUpKSB7XG5cdFx0XHRcdC8vIElmIHdlIHJlYWNoZWQgYSBwYXRoIHNlcGFyYXRvciB0aGF0IHdhcyBub3QgcGFydCBvZiBhIHNldCBvZiBwYXRoXG5cdFx0XHRcdC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuXHRcdFx0XHRpZiAoIW1hdGNoZWRTbGFzaCkge1xuXHRcdFx0XHRcdHN0YXJ0UGFydCA9IGkgKyAxO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVuZCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIG1hcmsgdGhpcyBhcyB0aGUgZW5kIG9mIG91clxuXHRcdFx0XHQvLyBleHRlbnNpb25cblx0XHRcdFx0bWF0Y2hlZFNsYXNoID0gZmFsc2U7XG5cdFx0XHRcdGVuZCA9IGkgKyAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvZGUgPT09IENIQVJfRE9UKSB7XG5cdFx0XHRcdC8vIElmIHRoaXMgaXMgb3VyIGZpcnN0IGRvdCwgbWFyayBpdCBhcyB0aGUgc3RhcnQgb2Ygb3VyIGV4dGVuc2lvblxuXHRcdFx0XHRpZiAoc3RhcnREb3QgPT09IC0xKSB7XG5cdFx0XHRcdFx0c3RhcnREb3QgPSBpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKSB7XG5cdFx0XHRcdFx0cHJlRG90U3RhdGUgPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXJ0RG90ICE9PSAtMSkge1xuXHRcdFx0XHQvLyBXZSBzYXcgYSBub24tZG90IGFuZCBub24tcGF0aCBzZXBhcmF0b3IgYmVmb3JlIG91ciBkb3QsIHNvIHdlIHNob3VsZFxuXHRcdFx0XHQvLyBoYXZlIGEgZ29vZCBjaGFuY2UgYXQgaGF2aW5nIGEgbm9uLWVtcHR5IGV4dGVuc2lvblxuXHRcdFx0XHRwcmVEb3RTdGF0ZSA9IC0xO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbmQgIT09IC0xKSB7XG5cdFx0XHRpZiAoc3RhcnREb3QgPT09IC0xIHx8XG5cdFx0XHRcdC8vIFdlIHNhdyBhIG5vbi1kb3QgY2hhcmFjdGVyIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgZG90XG5cdFx0XHRcdHByZURvdFN0YXRlID09PSAwIHx8XG5cdFx0XHRcdC8vIFRoZSAocmlnaHQtbW9zdCkgdHJpbW1lZCBwYXRoIGNvbXBvbmVudCBpcyBleGFjdGx5ICcuLidcblx0XHRcdFx0KHByZURvdFN0YXRlID09PSAxICYmXG5cdFx0XHRcdFx0c3RhcnREb3QgPT09IGVuZCAtIDEgJiZcblx0XHRcdFx0XHRzdGFydERvdCA9PT0gc3RhcnRQYXJ0ICsgMSkpIHtcblx0XHRcdFx0cmV0LmJhc2UgPSByZXQubmFtZSA9IHBhdGguc2xpY2Uoc3RhcnRQYXJ0LCBlbmQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0Lm5hbWUgPSBwYXRoLnNsaWNlKHN0YXJ0UGFydCwgc3RhcnREb3QpO1xuXHRcdFx0XHRyZXQuYmFzZSA9IHBhdGguc2xpY2Uoc3RhcnRQYXJ0LCBlbmQpO1xuXHRcdFx0XHRyZXQuZXh0ID0gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgZGlyZWN0b3J5IGlzIHRoZSByb290LCB1c2UgdGhlIGVudGlyZSByb290IGFzIHRoZSBgZGlyYCBpbmNsdWRpbmdcblx0XHQvLyB0aGUgdHJhaWxpbmcgc2xhc2ggaWYgYW55IChgQzpcXGFiY2AgLT4gYEM6XFxgKS4gT3RoZXJ3aXNlLCBzdHJpcCBvdXQgdGhlXG5cdFx0Ly8gdHJhaWxpbmcgc2xhc2ggKGBDOlxcYWJjXFxkZWZgIC0+IGBDOlxcYWJjYCkuXG5cdFx0aWYgKHN0YXJ0UGFydCA+IDAgJiYgc3RhcnRQYXJ0ICE9PSByb290RW5kKSB7XG5cdFx0XHRyZXQuZGlyID0gcGF0aC5zbGljZSgwLCBzdGFydFBhcnQgLSAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0LmRpciA9IHJldC5yb290O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH0sXG5cblx0c2VwOiAnXFxcXCcsXG5cdGRlbGltaXRlcjogJzsnLFxuXHR3aW4zMjogbnVsbCxcblx0cG9zaXg6IG51bGxcbn07XG5cbmNvbnN0IHBvc2l4Q3dkID0gKCgpID0+IHtcblx0aWYgKHBsYXRmb3JtSXNXaW4zMikge1xuXHRcdC8vIENvbnZlcnRzIFdpbmRvd3MnIGJhY2tzbGFzaCBwYXRoIHNlcGFyYXRvcnMgdG8gUE9TSVggZm9yd2FyZCBzbGFzaGVzXG5cdFx0Ly8gYW5kIHRydW5jYXRlcyBhbnkgZHJpdmUgaW5kaWNhdG9yXG5cdFx0Y29uc3QgcmVnZXhwID0gL1xcXFwvZztcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3dkID0gcHJvY2Vzcy5jd2QoKS5yZXBsYWNlKHJlZ2V4cCwgJy8nKTtcblx0XHRcdHJldHVybiBjd2Quc2xpY2UoY3dkLmluZGV4T2YoJy8nKSk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFdlJ3JlIGFscmVhZHkgb24gUE9TSVgsIG5vIG5lZWQgZm9yIGFueSB0cmFuc2Zvcm1hdGlvbnNcblx0cmV0dXJuICgpID0+IHByb2Nlc3MuY3dkKCk7XG59KSgpO1xuXG5leHBvcnQgY29uc3QgcG9zaXg6IElQYXRoID0ge1xuXHQvLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG5cdHJlc29sdmUoLi4ucGF0aFNlZ21lbnRzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc29sdmVkUGF0aCA9ICcnO1xuXHRcdGxldCByZXNvbHZlZEFic29sdXRlID0gZmFsc2U7XG5cblx0XHRmb3IgKGxldCBpID0gcGF0aFNlZ21lbnRzLmxlbmd0aCAtIDE7IGkgPj0gMCAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXRoID0gcGF0aFNlZ21lbnRzW2ldO1xuXHRcdFx0dmFsaWRhdGVTdHJpbmcocGF0aCwgYHBhdGhzWyR7aX1dYCk7XG5cblx0XHRcdC8vIFNraXAgZW1wdHkgZW50cmllc1xuXHRcdFx0aWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXNvbHZlZFBhdGggPSBgJHtwYXRofS8ke3Jlc29sdmVkUGF0aH1gO1xuXHRcdFx0cmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckNvZGVBdCgwKSA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIO1xuXHRcdH1cblxuXHRcdGlmICghcmVzb2x2ZWRBYnNvbHV0ZSkge1xuXHRcdFx0Y29uc3QgY3dkID0gcG9zaXhDd2QoKTtcblx0XHRcdHJlc29sdmVkUGF0aCA9IGAke2N3ZH0vJHtyZXNvbHZlZFBhdGh9YDtcblx0XHRcdHJlc29sdmVkQWJzb2x1dGUgPVxuXHRcdFx0XHRjd2QuY2hhckNvZGVBdCgwKSA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIO1xuXHRcdH1cblxuXHRcdC8vIEF0IHRoaXMgcG9pbnQgdGhlIHBhdGggc2hvdWxkIGJlIHJlc29sdmVkIHRvIGEgZnVsbCBhYnNvbHV0ZSBwYXRoLCBidXRcblx0XHQvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuXHRcdC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuXHRcdHJlc29sdmVkUGF0aCA9IG5vcm1hbGl6ZVN0cmluZyhyZXNvbHZlZFBhdGgsICFyZXNvbHZlZEFic29sdXRlLCAnLycsXG5cdFx0XHRpc1Bvc2l4UGF0aFNlcGFyYXRvcik7XG5cblx0XHRpZiAocmVzb2x2ZWRBYnNvbHV0ZSkge1xuXHRcdFx0cmV0dXJuIGAvJHtyZXNvbHZlZFBhdGh9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVkUGF0aC5sZW5ndGggPiAwID8gcmVzb2x2ZWRQYXRoIDogJy4nO1xuXHR9LFxuXG5cdG5vcm1hbGl6ZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cblx0XHRpZiAocGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAnLic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBYnNvbHV0ZSA9IHBhdGguY2hhckNvZGVBdCgwKSA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIO1xuXHRcdGNvbnN0IHRyYWlsaW5nU2VwYXJhdG9yID1cblx0XHRcdHBhdGguY2hhckNvZGVBdChwYXRoLmxlbmd0aCAtIDEpID09PSBDSEFSX0ZPUldBUkRfU0xBU0g7XG5cblx0XHQvLyBOb3JtYWxpemUgdGhlIHBhdGhcblx0XHRwYXRoID0gbm9ybWFsaXplU3RyaW5nKHBhdGgsICFpc0Fic29sdXRlLCAnLycsIGlzUG9zaXhQYXRoU2VwYXJhdG9yKTtcblxuXHRcdGlmIChwYXRoLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKGlzQWJzb2x1dGUpIHtcblx0XHRcdFx0cmV0dXJuICcvJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cmFpbGluZ1NlcGFyYXRvciA/ICcuLycgOiAnLic7XG5cdFx0fVxuXHRcdGlmICh0cmFpbGluZ1NlcGFyYXRvcikge1xuXHRcdFx0cGF0aCArPSAnLyc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlzQWJzb2x1dGUgPyBgLyR7cGF0aH1gIDogcGF0aDtcblx0fSxcblxuXHRpc0Fic29sdXRlKHBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cdFx0cmV0dXJuIHBhdGgubGVuZ3RoID4gMCAmJiBwYXRoLmNoYXJDb2RlQXQoMCkgPT09IENIQVJfRk9SV0FSRF9TTEFTSDtcblx0fSxcblxuXHRqb2luKC4uLnBhdGhzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdFx0aWYgKHBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICcuJztcblx0XHR9XG5cblx0XHRjb25zdCBwYXRoID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXRocy5sZW5ndGg7ICsraSkge1xuXHRcdFx0Y29uc3QgYXJnID0gcGF0aHNbaV07XG5cdFx0XHR2YWxpZGF0ZVN0cmluZyhhcmcsICdwYXRoJyk7XG5cdFx0XHRpZiAoYXJnLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cGF0aC5wdXNoKGFyZyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJy4nO1xuXHRcdH1cblxuXHRcdHJldHVybiBwb3NpeC5ub3JtYWxpemUocGF0aC5qb2luKCcvJykpO1xuXHR9LFxuXG5cdHJlbGF0aXZlKGZyb206IHN0cmluZywgdG86IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dmFsaWRhdGVTdHJpbmcoZnJvbSwgJ2Zyb20nKTtcblx0XHR2YWxpZGF0ZVN0cmluZyh0bywgJ3RvJyk7XG5cblx0XHRpZiAoZnJvbSA9PT0gdG8pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHQvLyBUcmltIGxlYWRpbmcgZm9yd2FyZCBzbGFzaGVzLlxuXHRcdGZyb20gPSBwb3NpeC5yZXNvbHZlKGZyb20pO1xuXHRcdHRvID0gcG9zaXgucmVzb2x2ZSh0byk7XG5cblx0XHRpZiAoZnJvbSA9PT0gdG8pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBmcm9tU3RhcnQgPSAxO1xuXHRcdGNvbnN0IGZyb21FbmQgPSBmcm9tLmxlbmd0aDtcblx0XHRjb25zdCBmcm9tTGVuID0gZnJvbUVuZCAtIGZyb21TdGFydDtcblx0XHRjb25zdCB0b1N0YXJ0ID0gMTtcblx0XHRjb25zdCB0b0xlbiA9IHRvLmxlbmd0aCAtIHRvU3RhcnQ7XG5cblx0XHQvLyBDb21wYXJlIHBhdGhzIHRvIGZpbmQgdGhlIGxvbmdlc3QgY29tbW9uIHBhdGggZnJvbSByb290XG5cdFx0Y29uc3QgbGVuZ3RoID0gKGZyb21MZW4gPCB0b0xlbiA/IGZyb21MZW4gOiB0b0xlbik7XG5cdFx0bGV0IGxhc3RDb21tb25TZXAgPSAtMTtcblx0XHRsZXQgaSA9IDA7XG5cdFx0Zm9yICg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZnJvbUNvZGUgPSBmcm9tLmNoYXJDb2RlQXQoZnJvbVN0YXJ0ICsgaSk7XG5cdFx0XHRpZiAoZnJvbUNvZGUgIT09IHRvLmNoYXJDb2RlQXQodG9TdGFydCArIGkpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fSBlbHNlIGlmIChmcm9tQ29kZSA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIKSB7XG5cdFx0XHRcdGxhc3RDb21tb25TZXAgPSBpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaSA9PT0gbGVuZ3RoKSB7XG5cdFx0XHRpZiAodG9MZW4gPiBsZW5ndGgpIHtcblx0XHRcdFx0aWYgKHRvLmNoYXJDb2RlQXQodG9TdGFydCArIGkpID09PSBDSEFSX0ZPUldBUkRfU0xBU0gpIHtcblx0XHRcdFx0XHQvLyBXZSBnZXQgaGVyZSBpZiBgZnJvbWAgaXMgdGhlIGV4YWN0IGJhc2UgcGF0aCBmb3IgYHRvYC5cblx0XHRcdFx0XHQvLyBGb3IgZXhhbXBsZTogZnJvbT0nL2Zvby9iYXInOyB0bz0nL2Zvby9iYXIvYmF6J1xuXHRcdFx0XHRcdHJldHVybiB0by5zbGljZSh0b1N0YXJ0ICsgaSArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gV2UgZ2V0IGhlcmUgaWYgYGZyb21gIGlzIHRoZSByb290XG5cdFx0XHRcdFx0Ly8gRm9yIGV4YW1wbGU6IGZyb209Jy8nOyB0bz0nL2Zvbydcblx0XHRcdFx0XHRyZXR1cm4gdG8uc2xpY2UodG9TdGFydCArIGkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGZyb21MZW4gPiBsZW5ndGgpIHtcblx0XHRcdFx0aWYgKGZyb20uY2hhckNvZGVBdChmcm9tU3RhcnQgKyBpKSA9PT0gQ0hBUl9GT1JXQVJEX1NMQVNIKSB7XG5cdFx0XHRcdFx0Ly8gV2UgZ2V0IGhlcmUgaWYgYHRvYCBpcyB0aGUgZXhhY3QgYmFzZSBwYXRoIGZvciBgZnJvbWAuXG5cdFx0XHRcdFx0Ly8gRm9yIGV4YW1wbGU6IGZyb209Jy9mb28vYmFyL2Jheic7IHRvPScvZm9vL2Jhcidcblx0XHRcdFx0XHRsYXN0Q29tbW9uU2VwID0gaTtcblx0XHRcdFx0fSBlbHNlIGlmIChpID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gV2UgZ2V0IGhlcmUgaWYgYHRvYCBpcyB0aGUgcm9vdC5cblx0XHRcdFx0XHQvLyBGb3IgZXhhbXBsZTogZnJvbT0nL2Zvby9iYXInOyB0bz0nLydcblx0XHRcdFx0XHRsYXN0Q29tbW9uU2VwID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBvdXQgPSAnJztcblx0XHQvLyBHZW5lcmF0ZSB0aGUgcmVsYXRpdmUgcGF0aCBiYXNlZCBvbiB0aGUgcGF0aCBkaWZmZXJlbmNlIGJldHdlZW4gYHRvYFxuXHRcdC8vIGFuZCBgZnJvbWAuXG5cdFx0Zm9yIChpID0gZnJvbVN0YXJ0ICsgbGFzdENvbW1vblNlcCArIDE7IGkgPD0gZnJvbUVuZDsgKytpKSB7XG5cdFx0XHRpZiAoaSA9PT0gZnJvbUVuZCB8fCBmcm9tLmNoYXJDb2RlQXQoaSkgPT09IENIQVJfRk9SV0FSRF9TTEFTSCkge1xuXHRcdFx0XHRvdXQgKz0gb3V0Lmxlbmd0aCA9PT0gMCA/ICcuLicgOiAnLy4uJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBMYXN0bHksIGFwcGVuZCB0aGUgcmVzdCBvZiB0aGUgZGVzdGluYXRpb24gKGB0b2ApIHBhdGggdGhhdCBjb21lcyBhZnRlclxuXHRcdC8vIHRoZSBjb21tb24gcGF0aCBwYXJ0cy5cblx0XHRyZXR1cm4gYCR7b3V0fSR7dG8uc2xpY2UodG9TdGFydCArIGxhc3RDb21tb25TZXApfWA7XG5cdH0sXG5cblx0dG9OYW1lc3BhY2VkUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIE5vbi1vcCBvbiBwb3NpeCBzeXN0ZW1zXG5cdFx0cmV0dXJuIHBhdGg7XG5cdH0sXG5cblx0ZGlybmFtZShwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cdFx0aWYgKHBhdGgubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJy4nO1xuXHRcdH1cblx0XHRjb25zdCBoYXNSb290ID0gcGF0aC5jaGFyQ29kZUF0KDApID09PSBDSEFSX0ZPUldBUkRfU0xBU0g7XG5cdFx0bGV0IGVuZCA9IC0xO1xuXHRcdGxldCBtYXRjaGVkU2xhc2ggPSB0cnVlO1xuXHRcdGZvciAobGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMTsgLS1pKSB7XG5cdFx0XHRpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSBDSEFSX0ZPUldBUkRfU0xBU0gpIHtcblx0XHRcdFx0aWYgKCFtYXRjaGVkU2xhc2gpIHtcblx0XHRcdFx0XHRlbmQgPSBpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvclxuXHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZW5kID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGhhc1Jvb3QgPyAnLycgOiAnLic7XG5cdFx0fVxuXHRcdGlmIChoYXNSb290ICYmIGVuZCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuICcvLyc7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoLnNsaWNlKDAsIGVuZCk7XG5cdH0sXG5cblx0YmFzZW5hbWUocGF0aDogc3RyaW5nLCBzdWZmaXg/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChzdWZmaXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsaWRhdGVTdHJpbmcoc3VmZml4LCAnc3VmZml4Jyk7XG5cdFx0fVxuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cblx0XHRsZXQgc3RhcnQgPSAwO1xuXHRcdGxldCBlbmQgPSAtMTtcblx0XHRsZXQgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcblx0XHRsZXQgaTtcblxuXHRcdGlmIChzdWZmaXggIT09IHVuZGVmaW5lZCAmJiBzdWZmaXgubGVuZ3RoID4gMCAmJiBzdWZmaXgubGVuZ3RoIDw9IHBhdGgubGVuZ3RoKSB7XG5cdFx0XHRpZiAoc3VmZml4ID09PSBwYXRoKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdGxldCBleHRJZHggPSBzdWZmaXgubGVuZ3RoIC0gMTtcblx0XHRcdGxldCBmaXJzdE5vblNsYXNoRW5kID0gLTE7XG5cdFx0XHRmb3IgKGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG5cdFx0XHRcdGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRcdGlmIChjb2RlID09PSBDSEFSX0ZPUldBUkRfU0xBU0gpIHtcblx0XHRcdFx0XHQvLyBJZiB3ZSByZWFjaGVkIGEgcGF0aCBzZXBhcmF0b3IgdGhhdCB3YXMgbm90IHBhcnQgb2YgYSBzZXQgb2YgcGF0aFxuXHRcdFx0XHRcdC8vIHNlcGFyYXRvcnMgYXQgdGhlIGVuZCBvZiB0aGUgc3RyaW5nLCBzdG9wIG5vd1xuXHRcdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0XHRzdGFydCA9IGkgKyAxO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChmaXJzdE5vblNsYXNoRW5kID09PSAtMSkge1xuXHRcdFx0XHRcdFx0Ly8gV2Ugc2F3IHRoZSBmaXJzdCBub24tcGF0aCBzZXBhcmF0b3IsIHJlbWVtYmVyIHRoaXMgaW5kZXggaW4gY2FzZVxuXHRcdFx0XHRcdFx0Ly8gd2UgbmVlZCBpdCBpZiB0aGUgZXh0ZW5zaW9uIGVuZHMgdXAgbm90IG1hdGNoaW5nXG5cdFx0XHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdFx0XHRcdGZpcnN0Tm9uU2xhc2hFbmQgPSBpICsgMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGV4dElkeCA+PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyBUcnkgdG8gbWF0Y2ggdGhlIGV4cGxpY2l0IGV4dGVuc2lvblxuXHRcdFx0XHRcdFx0aWYgKGNvZGUgPT09IHN1ZmZpeC5jaGFyQ29kZUF0KGV4dElkeCkpIHtcblx0XHRcdFx0XHRcdFx0aWYgKC0tZXh0SWR4ID09PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFdlIG1hdGNoZWQgdGhlIGV4dGVuc2lvbiwgc28gbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyIHBhdGhcblx0XHRcdFx0XHRcdFx0XHQvLyBjb21wb25lbnRcblx0XHRcdFx0XHRcdFx0XHRlbmQgPSBpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBFeHRlbnNpb24gZG9lcyBub3QgbWF0Y2gsIHNvIG91ciByZXN1bHQgaXMgdGhlIGVudGlyZSBwYXRoXG5cdFx0XHRcdFx0XHRcdC8vIGNvbXBvbmVudFxuXHRcdFx0XHRcdFx0XHRleHRJZHggPSAtMTtcblx0XHRcdFx0XHRcdFx0ZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0ID09PSBlbmQpIHtcblx0XHRcdFx0ZW5kID0gZmlyc3ROb25TbGFzaEVuZDtcblx0XHRcdH0gZWxzZSBpZiAoZW5kID09PSAtMSkge1xuXHRcdFx0XHRlbmQgPSBwYXRoLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xuXHRcdH1cblx0XHRmb3IgKGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG5cdFx0XHRpZiAocGF0aC5jaGFyQ29kZUF0KGkpID09PSBDSEFSX0ZPUldBUkRfU0xBU0gpIHtcblx0XHRcdFx0Ly8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcblx0XHRcdFx0Ly8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG5cdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0c3RhcnQgPSBpICsgMTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlbmQgPT09IC0xKSB7XG5cdFx0XHRcdC8vIFdlIHNhdyB0aGUgZmlyc3Qgbm9uLXBhdGggc2VwYXJhdG9yLCBtYXJrIHRoaXMgYXMgdGhlIGVuZCBvZiBvdXJcblx0XHRcdFx0Ly8gcGF0aCBjb21wb25lbnRcblx0XHRcdFx0bWF0Y2hlZFNsYXNoID0gZmFsc2U7XG5cdFx0XHRcdGVuZCA9IGkgKyAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChlbmQgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xuXHR9LFxuXG5cdGV4dG5hbWUocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR2YWxpZGF0ZVN0cmluZyhwYXRoLCAncGF0aCcpO1xuXHRcdGxldCBzdGFydERvdCA9IC0xO1xuXHRcdGxldCBzdGFydFBhcnQgPSAwO1xuXHRcdGxldCBlbmQgPSAtMTtcblx0XHRsZXQgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcblx0XHQvLyBUcmFjayB0aGUgc3RhdGUgb2YgY2hhcmFjdGVycyAoaWYgYW55KSB3ZSBzZWUgYmVmb3JlIG91ciBmaXJzdCBkb3QgYW5kXG5cdFx0Ly8gYWZ0ZXIgYW55IHBhdGggc2VwYXJhdG9yIHdlIGZpbmRcblx0XHRsZXQgcHJlRG90U3RhdGUgPSAwO1xuXHRcdGZvciAobGV0IGkgPSBwYXRoLmxlbmd0aCAtIDE7IGkgPj0gMDsgLS1pKSB7XG5cdFx0XHRjb25zdCBjaGFyID0gcGF0aFtpXTtcblx0XHRcdGlmIChjaGFyID09PSAnLycpIHtcblx0XHRcdFx0Ly8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcblx0XHRcdFx0Ly8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG5cdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0c3RhcnRQYXJ0ID0gaSArIDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5kID09PSAtMSkge1xuXHRcdFx0XHQvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG5cdFx0XHRcdC8vIGV4dGVuc2lvblxuXHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdFx0ZW5kID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhciA9PT0gJy4nKSB7XG5cdFx0XHRcdC8vIElmIHRoaXMgaXMgb3VyIGZpcnN0IGRvdCwgbWFyayBpdCBhcyB0aGUgc3RhcnQgb2Ygb3VyIGV4dGVuc2lvblxuXHRcdFx0XHRpZiAoc3RhcnREb3QgPT09IC0xKSB7XG5cdFx0XHRcdFx0c3RhcnREb3QgPSBpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHByZURvdFN0YXRlICE9PSAxKSB7XG5cdFx0XHRcdFx0cHJlRG90U3RhdGUgPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXJ0RG90ICE9PSAtMSkge1xuXHRcdFx0XHQvLyBXZSBzYXcgYSBub24tZG90IGFuZCBub24tcGF0aCBzZXBhcmF0b3IgYmVmb3JlIG91ciBkb3QsIHNvIHdlIHNob3VsZFxuXHRcdFx0XHQvLyBoYXZlIGEgZ29vZCBjaGFuY2UgYXQgaGF2aW5nIGEgbm9uLWVtcHR5IGV4dGVuc2lvblxuXHRcdFx0XHRwcmVEb3RTdGF0ZSA9IC0xO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzdGFydERvdCA9PT0gLTEgfHxcblx0XHRcdGVuZCA9PT0gLTEgfHxcblx0XHRcdC8vIFdlIHNhdyBhIG5vbi1kb3QgY2hhcmFjdGVyIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgZG90XG5cdFx0XHRwcmVEb3RTdGF0ZSA9PT0gMCB8fFxuXHRcdFx0Ly8gVGhlIChyaWdodC1tb3N0KSB0cmltbWVkIHBhdGggY29tcG9uZW50IGlzIGV4YWN0bHkgJy4uJ1xuXHRcdFx0KHByZURvdFN0YXRlID09PSAxICYmXG5cdFx0XHRcdHN0YXJ0RG90ID09PSBlbmQgLSAxICYmXG5cdFx0XHRcdHN0YXJ0RG90ID09PSBzdGFydFBhcnQgKyAxKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gcGF0aC5zbGljZShzdGFydERvdCwgZW5kKTtcblx0fSxcblxuXHRmb3JtYXQ6IF9mb3JtYXQuYmluZChudWxsLCAnLycpLFxuXG5cdHBhcnNlKHBhdGg6IHN0cmluZyk6IFBhcnNlZFBhdGgge1xuXHRcdHZhbGlkYXRlU3RyaW5nKHBhdGgsICdwYXRoJyk7XG5cblx0XHRjb25zdCByZXQgPSB7IHJvb3Q6ICcnLCBkaXI6ICcnLCBiYXNlOiAnJywgZXh0OiAnJywgbmFtZTogJycgfTtcblx0XHRpZiAocGF0aC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiByZXQ7XG5cdFx0fVxuXHRcdGNvbnN0IGlzQWJzb2x1dGUgPSBwYXRoLmNoYXJDb2RlQXQoMCkgPT09IENIQVJfRk9SV0FSRF9TTEFTSDtcblx0XHRsZXQgc3RhcnQ7XG5cdFx0aWYgKGlzQWJzb2x1dGUpIHtcblx0XHRcdHJldC5yb290ID0gJy8nO1xuXHRcdFx0c3RhcnQgPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdGFydCA9IDA7XG5cdFx0fVxuXHRcdGxldCBzdGFydERvdCA9IC0xO1xuXHRcdGxldCBzdGFydFBhcnQgPSAwO1xuXHRcdGxldCBlbmQgPSAtMTtcblx0XHRsZXQgbWF0Y2hlZFNsYXNoID0gdHJ1ZTtcblx0XHRsZXQgaSA9IHBhdGgubGVuZ3RoIC0gMTtcblxuXHRcdC8vIFRyYWNrIHRoZSBzdGF0ZSBvZiBjaGFyYWN0ZXJzIChpZiBhbnkpIHdlIHNlZSBiZWZvcmUgb3VyIGZpcnN0IGRvdCBhbmRcblx0XHQvLyBhZnRlciBhbnkgcGF0aCBzZXBhcmF0b3Igd2UgZmluZFxuXHRcdGxldCBwcmVEb3RTdGF0ZSA9IDA7XG5cblx0XHQvLyBHZXQgbm9uLWRpciBpbmZvXG5cdFx0Zm9yICg7IGkgPj0gc3RhcnQ7IC0taSkge1xuXHRcdFx0Y29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdChpKTtcblx0XHRcdGlmIChjb2RlID09PSBDSEFSX0ZPUldBUkRfU0xBU0gpIHtcblx0XHRcdFx0Ly8gSWYgd2UgcmVhY2hlZCBhIHBhdGggc2VwYXJhdG9yIHRoYXQgd2FzIG5vdCBwYXJ0IG9mIGEgc2V0IG9mIHBhdGhcblx0XHRcdFx0Ly8gc2VwYXJhdG9ycyBhdCB0aGUgZW5kIG9mIHRoZSBzdHJpbmcsIHN0b3Agbm93XG5cdFx0XHRcdGlmICghbWF0Y2hlZFNsYXNoKSB7XG5cdFx0XHRcdFx0c3RhcnRQYXJ0ID0gaSArIDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5kID09PSAtMSkge1xuXHRcdFx0XHQvLyBXZSBzYXcgdGhlIGZpcnN0IG5vbi1wYXRoIHNlcGFyYXRvciwgbWFyayB0aGlzIGFzIHRoZSBlbmQgb2Ygb3VyXG5cdFx0XHRcdC8vIGV4dGVuc2lvblxuXHRcdFx0XHRtYXRjaGVkU2xhc2ggPSBmYWxzZTtcblx0XHRcdFx0ZW5kID0gaSArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29kZSA9PT0gQ0hBUl9ET1QpIHtcblx0XHRcdFx0Ly8gSWYgdGhpcyBpcyBvdXIgZmlyc3QgZG90LCBtYXJrIGl0IGFzIHRoZSBzdGFydCBvZiBvdXIgZXh0ZW5zaW9uXG5cdFx0XHRcdGlmIChzdGFydERvdCA9PT0gLTEpIHtcblx0XHRcdFx0XHRzdGFydERvdCA9IGk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJlRG90U3RhdGUgIT09IDEpIHtcblx0XHRcdFx0XHRwcmVEb3RTdGF0ZSA9IDE7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoc3RhcnREb3QgIT09IC0xKSB7XG5cdFx0XHRcdC8vIFdlIHNhdyBhIG5vbi1kb3QgYW5kIG5vbi1wYXRoIHNlcGFyYXRvciBiZWZvcmUgb3VyIGRvdCwgc28gd2Ugc2hvdWxkXG5cdFx0XHRcdC8vIGhhdmUgYSBnb29kIGNoYW5jZSBhdCBoYXZpbmcgYSBub24tZW1wdHkgZXh0ZW5zaW9uXG5cdFx0XHRcdHByZURvdFN0YXRlID0gLTE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gc3RhcnRQYXJ0ID09PSAwICYmIGlzQWJzb2x1dGUgPyAxIDogc3RhcnRQYXJ0O1xuXHRcdFx0aWYgKHN0YXJ0RG90ID09PSAtMSB8fFxuXHRcdFx0XHQvLyBXZSBzYXcgYSBub24tZG90IGNoYXJhY3RlciBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGRvdFxuXHRcdFx0XHRwcmVEb3RTdGF0ZSA9PT0gMCB8fFxuXHRcdFx0XHQvLyBUaGUgKHJpZ2h0LW1vc3QpIHRyaW1tZWQgcGF0aCBjb21wb25lbnQgaXMgZXhhY3RseSAnLi4nXG5cdFx0XHRcdChwcmVEb3RTdGF0ZSA9PT0gMSAmJlxuXHRcdFx0XHRcdHN0YXJ0RG90ID09PSBlbmQgLSAxICYmXG5cdFx0XHRcdFx0c3RhcnREb3QgPT09IHN0YXJ0UGFydCArIDEpKSB7XG5cdFx0XHRcdHJldC5iYXNlID0gcmV0Lm5hbWUgPSBwYXRoLnNsaWNlKHN0YXJ0LCBlbmQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0Lm5hbWUgPSBwYXRoLnNsaWNlKHN0YXJ0LCBzdGFydERvdCk7XG5cdFx0XHRcdHJldC5iYXNlID0gcGF0aC5zbGljZShzdGFydCwgZW5kKTtcblx0XHRcdFx0cmV0LmV4dCA9IHBhdGguc2xpY2Uoc3RhcnREb3QsIGVuZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0UGFydCA+IDApIHtcblx0XHRcdHJldC5kaXIgPSBwYXRoLnNsaWNlKDAsIHN0YXJ0UGFydCAtIDEpO1xuXHRcdH0gZWxzZSBpZiAoaXNBYnNvbHV0ZSkge1xuXHRcdFx0cmV0LmRpciA9ICcvJztcblx0XHR9XG5cblx0XHRyZXR1cm4gcmV0O1xuXHR9LFxuXG5cdHNlcDogJy8nLFxuXHRkZWxpbWl0ZXI6ICc6Jyxcblx0d2luMzI6IG51bGwsXG5cdHBvc2l4OiBudWxsXG59O1xuXG5wb3NpeC53aW4zMiA9IHdpbjMyLndpbjMyID0gd2luMzI7XG5wb3NpeC5wb3NpeCA9IHdpbjMyLnBvc2l4ID0gcG9zaXg7XG5cbmV4cG9ydCBjb25zdCBub3JtYWxpemUgPSAocGxhdGZvcm1Jc1dpbjMyID8gd2luMzIubm9ybWFsaXplIDogcG9zaXgubm9ybWFsaXplKTtcbmV4cG9ydCBjb25zdCBpc0Fic29sdXRlID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLmlzQWJzb2x1dGUgOiBwb3NpeC5pc0Fic29sdXRlKTtcbmV4cG9ydCBjb25zdCBqb2luID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLmpvaW4gOiBwb3NpeC5qb2luKTtcbmV4cG9ydCBjb25zdCByZXNvbHZlID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLnJlc29sdmUgOiBwb3NpeC5yZXNvbHZlKTtcbmV4cG9ydCBjb25zdCByZWxhdGl2ZSA9IChwbGF0Zm9ybUlzV2luMzIgPyB3aW4zMi5yZWxhdGl2ZSA6IHBvc2l4LnJlbGF0aXZlKTtcbmV4cG9ydCBjb25zdCBkaXJuYW1lID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLmRpcm5hbWUgOiBwb3NpeC5kaXJuYW1lKTtcbmV4cG9ydCBjb25zdCBiYXNlbmFtZSA9IChwbGF0Zm9ybUlzV2luMzIgPyB3aW4zMi5iYXNlbmFtZSA6IHBvc2l4LmJhc2VuYW1lKTtcbmV4cG9ydCBjb25zdCBleHRuYW1lID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLmV4dG5hbWUgOiBwb3NpeC5leHRuYW1lKTtcbmV4cG9ydCBjb25zdCBmb3JtYXQgPSAocGxhdGZvcm1Jc1dpbjMyID8gd2luMzIuZm9ybWF0IDogcG9zaXguZm9ybWF0KTtcbmV4cG9ydCBjb25zdCBwYXJzZSA9IChwbGF0Zm9ybUlzV2luMzIgPyB3aW4zMi5wYXJzZSA6IHBvc2l4LnBhcnNlKTtcbmV4cG9ydCBjb25zdCB0b05hbWVzcGFjZWRQYXRoID0gKHBsYXRmb3JtSXNXaW4zMiA/IHdpbjMyLnRvTmFtZXNwYWNlZFBhdGggOiBwb3NpeC50b05hbWVzcGFjZWRQYXRoKTtcbmV4cG9ydCBjb25zdCBzZXAgPSAocGxhdGZvcm1Jc1dpbjMyID8gd2luMzIuc2VwIDogcG9zaXguc2VwKTtcbmV4cG9ydCBjb25zdCBkZWxpbWl0ZXIgPSAocGxhdGZvcm1Jc1dpbjMyID8gd2luMzIuZGVsaW1pdGVyIDogcG9zaXguZGVsaW1pdGVyKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQW1DQSxZQUFZLGFBQWE7QUFFekIsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxtQkFBbUI7QUFDekIsTUFB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QSxFQUNQLE9BQU87QUFDUjtBQUVBLE1BQU0sUUFBUSxNQUFNLFFBQVE7QUFDNUIsTUFBTSxRQUFRLE1BQU0sUUFBUTtBQUVyQixNQUFNLFlBQWEsa0JBQWtCLE1BQU0sWUFBWSxNQUFNO0FBQzdELE1BQU0sYUFBYyxrQkFBa0IsTUFBTSxhQUFhLE1BQU07QUFDL0QsTUFBTSxPQUFRLGtCQUFrQixNQUFNLE9BQU8sTUFBTTtBQUNuRCxNQUFNLFVBQVcsa0JBQWtCLE1BQU0sVUFBVSxNQUFNO0FBQ3pELE1BQU0sV0FBWSxrQkFBa0IsTUFBTSxXQUFXLE1BQU07QUFDM0QsTUFBTSxVQUFXLGtCQUFrQixNQUFNLFVBQVUsTUFBTTtBQUN6RCxNQUFNLFdBQVksa0JBQWtCLE1BQU0sV0FBVyxNQUFNO0FBQzNELE1BQU0sVUFBVyxrQkFBa0IsTUFBTSxVQUFVLE1BQU07QUFDekQsTUFBTSxTQUFVLGtCQUFrQixNQUFNLFNBQVMsTUFBTTtBQUN2RCxNQUFNLFFBQVMsa0JBQWtCLE1BQU0sUUFBUSxNQUFNO0FBQ3JELE1BQU0sbUJBQW9CLGtCQUFrQixNQUFNLG1CQUFtQixNQUFNO0FBQzNFLE1BQU0sTUFBTyxrQkFBa0IsTUFBTSxNQUFNLE1BQU07QUFDakQsTUFBTSxZQUFhLGtCQUFrQixNQUFNLFlBQVksTUFBTTsiLAogICJuYW1lcyI6IFsiaXNQYXRoU2VwYXJhdG9yIiwgInNlcCIsICJpc0Fic29sdXRlIiwgImZyb21MZW4iLCAidG9MZW4iLCAibGVuZ3RoIiwgImkiLCAic3RhcnQiXQp9Cg==
