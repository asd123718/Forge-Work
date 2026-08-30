import { CharCode } from "./charCode.js";
import { MarshalledId } from "./marshallingIds.js";
import * as paths from "./path.js";
import { isWindows } from "./platform.js";
const _schemePattern = /^\w[\w\d+.-]*$/;
const _singleSlashStart = /^\//;
const _doubleSlashStart = /^\/\//;
function _validateUri(ret, _strict) {
  if (!ret.scheme && _strict) {
    throw new Error(`[UriError]: Scheme is missing: {scheme: "", authority: "${ret.authority}", path: "${ret.path}", query: "${ret.query}", fragment: "${ret.fragment}"}`);
  }
  if (ret.scheme && !_schemePattern.test(ret.scheme)) {
    const matches = [...ret.scheme.matchAll(/[^\w\d+.-]/gu)];
    const detail = matches.length > 0 ? ` Found '${matches[0][0]}' at index ${matches[0].index} (${matches.length} total)` : "";
    throw new Error(`[UriError]: Scheme contains illegal characters.${detail} (len:${ret.scheme.length})`);
  }
  if (ret.path) {
    if (ret.authority) {
      if (!_singleSlashStart.test(ret.path)) {
        throw new Error('[UriError]: If a URI contains an authority component, then the path component must either be empty or begin with a slash ("/") character');
      }
    } else {
      if (_doubleSlashStart.test(ret.path)) {
        throw new Error('[UriError]: If a URI does not contain an authority component, then the path cannot begin with two slash characters ("//")');
      }
    }
  }
}
function _schemeFix(scheme, _strict) {
  if (!scheme && !_strict) {
    return "file";
  }
  return scheme;
}
function _referenceResolution(scheme, path) {
  switch (scheme) {
    case "https":
    case "http":
    case "file":
      if (!path) {
        path = _slash;
      } else if (path[0] !== _slash) {
        path = _slash + path;
      }
      break;
  }
  return path;
}
const _empty = "";
const _slash = "/";
const _regexp = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/;
class URI {
  static isUri(thing) {
    if (thing instanceof URI) {
      return true;
    }
    if (!thing || typeof thing !== "object") {
      return false;
    }
    return typeof thing.authority === "string" && typeof thing.fragment === "string" && typeof thing.path === "string" && typeof thing.query === "string" && typeof thing.scheme === "string" && typeof thing.fsPath === "string" && typeof thing.with === "function" && typeof thing.toString === "function";
  }
  /**
   * @internal
   */
  constructor(schemeOrData, authority, path, query, fragment, _strict = false) {
    if (typeof schemeOrData === "object") {
      this.scheme = schemeOrData.scheme || _empty;
      this.authority = schemeOrData.authority || _empty;
      this.path = schemeOrData.path || _empty;
      this.query = schemeOrData.query || _empty;
      this.fragment = schemeOrData.fragment || _empty;
    } else {
      this.scheme = _schemeFix(schemeOrData, _strict);
      this.authority = authority || _empty;
      this.path = _referenceResolution(this.scheme, path || _empty);
      this.query = query || _empty;
      this.fragment = fragment || _empty;
      _validateUri(this, _strict);
    }
  }
  // ---- filesystem path -----------------------
  /**
   * Returns a string representing the corresponding file system path of this URI.
   * Will handle UNC paths, normalizes windows drive letters to lower-case, and uses the
   * platform specific path separator.
   *
   * * Will *not* validate the path for invalid characters and semantics.
   * * Will *not* look at the scheme of this URI.
   * * The result shall *not* be used for display purposes but for accessing a file on disk.
   *
   *
   * The *difference* to `URI#path` is the use of the platform specific separator and the handling
   * of UNC paths. See the below sample of a file-uri with an authority (UNC path).
   *
   * ```ts
  	const u = URI.parse('file://server/c$/folder/file.txt')
  	u.authority === 'server'
  	u.path === '/shares/c$/file.txt'
  	u.fsPath === '\\server\c$\folder\file.txt'
  ```
   *
   * Using `URI#path` to read a file (using fs-apis) would not be enough because parts of the path,
   * namely the server name, would be missing. Therefore `URI#fsPath` exists - it's sugar to ease working
   * with URIs that represent files on disk (`file` scheme).
   */
  get fsPath() {
    return uriToFsPath(this, false);
  }
  // ---- modify to new -------------------------
  with(change) {
    if (!change) {
      return this;
    }
    let { scheme, authority, path, query, fragment } = change;
    if (scheme === void 0) {
      scheme = this.scheme;
    } else if (scheme === null) {
      scheme = _empty;
    }
    if (authority === void 0) {
      authority = this.authority;
    } else if (authority === null) {
      authority = _empty;
    }
    if (path === void 0) {
      path = this.path;
    } else if (path === null) {
      path = _empty;
    }
    if (query === void 0) {
      query = this.query;
    } else if (query === null) {
      query = _empty;
    }
    if (fragment === void 0) {
      fragment = this.fragment;
    } else if (fragment === null) {
      fragment = _empty;
    }
    if (scheme === this.scheme && authority === this.authority && path === this.path && query === this.query && fragment === this.fragment) {
      return this;
    }
    return new Uri(scheme, authority, path, query, fragment);
  }
  // ---- parse & validate ------------------------
  /**
   * Creates a new URI from a string, e.g. `http://www.example.com/some/path`,
   * `file:///usr/home`, or `scheme:with/path`.
   *
   * @param value A string which represents an URI (see `URI#toString`).
   */
  static parse(value, _strict = false) {
    const match = _regexp.exec(value);
    if (!match) {
      return new Uri(_empty, _empty, _empty, _empty, _empty);
    }
    return new Uri(
      match[2] || _empty,
      percentDecode(match[4] || _empty),
      percentDecode(match[5] || _empty),
      percentDecode(match[7] || _empty),
      percentDecode(match[9] || _empty),
      _strict
    );
  }
  /**
   * Creates a new URI from a file system path, e.g. `c:\my\files`,
   * `/usr/home`, or `\\server\share\some\path`.
   *
   * The *difference* between `URI#parse` and `URI#file` is that the latter treats the argument
   * as path, not as stringified-uri. E.g. `URI.file(path)` is **not the same as**
   * `URI.parse('file://' + path)` because the path might contain characters that are
   * interpreted (# and ?). See the following sample:
   * ```ts
  const good = URI.file('/coding/c#/project1');
  good.scheme === 'file';
  good.path === '/coding/c#/project1';
  good.fragment === '';
  const bad = URI.parse('file://' + '/coding/c#/project1');
  bad.scheme === 'file';
  bad.path === '/coding/c'; // path is now broken
  bad.fragment === '/project1';
  ```
   *
   * @param path A file system path (see `URI#fsPath`)
   */
  static file(path) {
    let authority = _empty;
    if (isWindows) {
      path = path.replace(/\\/g, _slash);
    }
    if (path[0] === _slash && path[1] === _slash) {
      const idx = path.indexOf(_slash, 2);
      if (idx === -1) {
        authority = path.substring(2);
        path = _slash;
      } else {
        authority = path.substring(2, idx);
        path = path.substring(idx) || _slash;
      }
    }
    return new Uri("file", authority, path, _empty, _empty);
  }
  /**
   * Creates new URI from uri components.
   *
   * Unless `strict` is `true` the scheme is defaults to be `file`. This function performs
   * validation and should be used for untrusted uri components retrieved from storage,
   * user input, command arguments etc
   */
  static from(components, strict) {
    const result = new Uri(
      components.scheme,
      components.authority,
      components.path,
      components.query,
      components.fragment,
      strict
    );
    return result;
  }
  /**
   * Join a URI path with path fragments and normalizes the resulting path.
   *
   * @param uri The input URI.
   * @param pathFragment The path fragment to add to the URI path.
   * @returns The resulting URI.
   */
  static joinPath(uri, ...pathFragment) {
    if (!uri.path) {
      throw new Error(`[UriError]: cannot call joinPath on URI without path: ${uri.toString()}`);
    }
    let newPath;
    if (isWindows && uri.scheme === "file") {
      newPath = URI.file(paths.win32.join(uriToFsPath(uri, true), ...pathFragment)).path;
    } else {
      newPath = paths.posix.join(uri.path, ...pathFragment);
    }
    return uri.with({ path: newPath });
  }
  // ---- printing/externalize ---------------------------
  /**
   * Creates a string representation for this URI. It's guaranteed that calling
   * `URI.parse` with the result of this function creates an URI which is equal
   * to this URI.
   *
   * * The result shall *not* be used for display purposes but for externalization or transport.
   * * The result will be encoded using the percentage encoding and encoding happens mostly
   * ignore the scheme-specific encoding rules.
   *
   * @param skipEncoding Do not encode the result, default is `false`
   */
  toString(skipEncoding = false) {
    return _asFormatted(this, skipEncoding);
  }
  toJSON() {
    return this;
  }
  static revive(data) {
    if (!data) {
      return data;
    } else if (data instanceof URI) {
      return data;
    } else {
      const result = new Uri(data);
      result._formatted = data.external ?? null;
      result._fsPath = data._sep === _pathSepMarker ? data.fsPath ?? null : null;
      return result;
    }
  }
  [/* @__PURE__ */ Symbol.for("debug.description")]() {
    return `URI(${this.toString()})`;
  }
}
function isUriComponents(thing) {
  if (!thing || typeof thing !== "object") {
    return false;
  }
  return typeof thing.scheme === "string" && (typeof thing.authority === "string" || typeof thing.authority === "undefined") && (typeof thing.path === "string" || typeof thing.path === "undefined") && (typeof thing.query === "string" || typeof thing.query === "undefined") && (typeof thing.fragment === "string" || typeof thing.fragment === "undefined");
}
const _pathSepMarker = isWindows ? 1 : void 0;
class Uri extends URI {
  constructor() {
    super(...arguments);
    this._formatted = null;
    this._fsPath = null;
  }
  get fsPath() {
    if (!this._fsPath) {
      this._fsPath = uriToFsPath(this, false);
    }
    return this._fsPath;
  }
  toString(skipEncoding = false) {
    if (!skipEncoding) {
      if (!this._formatted) {
        this._formatted = _asFormatted(this, false);
      }
      return this._formatted;
    } else {
      return _asFormatted(this, true);
    }
  }
  toJSON() {
    const res = {
      $mid: MarshalledId.Uri
    };
    if (this._fsPath) {
      res.fsPath = this._fsPath;
      res._sep = _pathSepMarker;
    }
    if (this._formatted) {
      res.external = this._formatted;
    }
    if (this.path) {
      res.path = this.path;
    }
    if (this.scheme) {
      res.scheme = this.scheme;
    }
    if (this.authority) {
      res.authority = this.authority;
    }
    if (this.query) {
      res.query = this.query;
    }
    if (this.fragment) {
      res.fragment = this.fragment;
    }
    return res;
  }
}
const encodeTable = {
  [CharCode.Colon]: "%3A",
  // gen-delims
  [CharCode.Slash]: "%2F",
  [CharCode.QuestionMark]: "%3F",
  [CharCode.Hash]: "%23",
  [CharCode.OpenSquareBracket]: "%5B",
  [CharCode.CloseSquareBracket]: "%5D",
  [CharCode.AtSign]: "%40",
  [CharCode.ExclamationMark]: "%21",
  // sub-delims
  [CharCode.DollarSign]: "%24",
  [CharCode.Ampersand]: "%26",
  [CharCode.SingleQuote]: "%27",
  [CharCode.OpenParen]: "%28",
  [CharCode.CloseParen]: "%29",
  [CharCode.Asterisk]: "%2A",
  [CharCode.Plus]: "%2B",
  [CharCode.Comma]: "%2C",
  [CharCode.Semicolon]: "%3B",
  [CharCode.Equals]: "%3D",
  [CharCode.Space]: "%20"
};
function encodeURIComponentFast(uriComponent, isPath, isAuthority) {
  let res = void 0;
  let nativeEncodePos = -1;
  for (let pos = 0; pos < uriComponent.length; pos++) {
    const code = uriComponent.charCodeAt(pos);
    if (code >= CharCode.a && code <= CharCode.z || code >= CharCode.A && code <= CharCode.Z || code >= CharCode.Digit0 && code <= CharCode.Digit9 || code === CharCode.Dash || code === CharCode.Period || code === CharCode.Underline || code === CharCode.Tilde || isPath && code === CharCode.Slash || isAuthority && code === CharCode.OpenSquareBracket || isAuthority && code === CharCode.CloseSquareBracket || isAuthority && code === CharCode.Colon) {
      if (nativeEncodePos !== -1) {
        res += encodeURIComponent(uriComponent.substring(nativeEncodePos, pos));
        nativeEncodePos = -1;
      }
      if (res !== void 0) {
        res += uriComponent.charAt(pos);
      }
    } else {
      if (res === void 0) {
        res = uriComponent.substr(0, pos);
      }
      const escaped = encodeTable[code];
      if (escaped !== void 0) {
        if (nativeEncodePos !== -1) {
          res += encodeURIComponent(uriComponent.substring(nativeEncodePos, pos));
          nativeEncodePos = -1;
        }
        res += escaped;
      } else if (nativeEncodePos === -1) {
        nativeEncodePos = pos;
      }
    }
  }
  if (nativeEncodePos !== -1) {
    res += encodeURIComponent(uriComponent.substring(nativeEncodePos));
  }
  return res !== void 0 ? res : uriComponent;
}
function encodeURIComponentMinimal(path) {
  let res = void 0;
  for (let pos = 0; pos < path.length; pos++) {
    const code = path.charCodeAt(pos);
    if (code === CharCode.Hash || code === CharCode.QuestionMark) {
      if (res === void 0) {
        res = path.substr(0, pos);
      }
      res += encodeTable[code];
    } else {
      if (res !== void 0) {
        res += path[pos];
      }
    }
  }
  return res !== void 0 ? res : path;
}
function uriToFsPath(uri, keepDriveLetterCasing) {
  let value;
  if (uri.authority && uri.path.length > 1 && uri.scheme === "file") {
    value = `//${uri.authority}${uri.path}`;
  } else if (uri.path.charCodeAt(0) === CharCode.Slash && (uri.path.charCodeAt(1) >= CharCode.A && uri.path.charCodeAt(1) <= CharCode.Z || uri.path.charCodeAt(1) >= CharCode.a && uri.path.charCodeAt(1) <= CharCode.z) && uri.path.charCodeAt(2) === CharCode.Colon) {
    if (!keepDriveLetterCasing) {
      value = uri.path[1].toLowerCase() + uri.path.substr(2);
    } else {
      value = uri.path.substr(1);
    }
  } else {
    value = uri.path;
  }
  if (isWindows) {
    value = value.replace(/\//g, "\\");
  }
  return value;
}
function _asFormatted(uri, skipEncoding) {
  const encoder = !skipEncoding ? encodeURIComponentFast : encodeURIComponentMinimal;
  let res = "";
  let { scheme, authority, path, query, fragment } = uri;
  if (scheme) {
    res += scheme;
    res += ":";
  }
  if (authority || scheme === "file") {
    res += _slash;
    res += _slash;
  }
  if (authority) {
    let idx = authority.indexOf("@");
    if (idx !== -1) {
      const userinfo = authority.substr(0, idx);
      authority = authority.substr(idx + 1);
      idx = userinfo.lastIndexOf(":");
      if (idx === -1) {
        res += encoder(userinfo, false, false);
      } else {
        res += encoder(userinfo.substr(0, idx), false, false);
        res += ":";
        res += encoder(userinfo.substr(idx + 1), false, true);
      }
      res += "@";
    }
    authority = authority.toLowerCase();
    idx = authority.lastIndexOf(":");
    if (idx === -1) {
      res += encoder(authority, false, true);
    } else {
      res += encoder(authority.substr(0, idx), false, true);
      res += authority.substr(idx);
    }
  }
  if (path) {
    if (path.length >= 3 && path.charCodeAt(0) === CharCode.Slash && path.charCodeAt(2) === CharCode.Colon) {
      const code = path.charCodeAt(1);
      if (code >= CharCode.A && code <= CharCode.Z) {
        path = `/${String.fromCharCode(code + 32)}:${path.substr(3)}`;
      }
    } else if (path.length >= 2 && path.charCodeAt(1) === CharCode.Colon) {
      const code = path.charCodeAt(0);
      if (code >= CharCode.A && code <= CharCode.Z) {
        path = `${String.fromCharCode(code + 32)}:${path.substr(2)}`;
      }
    }
    res += encoder(path, true, false);
  }
  if (query) {
    res += "?";
    res += encoder(query, false, false);
  }
  if (fragment) {
    res += "#";
    res += !skipEncoding ? encodeURIComponentFast(fragment, false, false) : fragment;
  }
  return res;
}
function decodeURIComponentGraceful(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    if (str.length > 3) {
      return str.substr(0, 3) + decodeURIComponentGraceful(str.substr(3));
    } else {
      return str;
    }
  }
}
const _rEncodedAsHex = /(%[0-9A-Za-z][0-9A-Za-z])+/g;
function percentDecode(str) {
  if (!str.match(_rEncodedAsHex)) {
    return str;
  }
  return str.replace(_rEncodedAsHex, (match) => decodeURIComponentGraceful(match));
}
export {
  URI,
  isUriComponents,
  uriToFsPath
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXHVyaS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuL3BsYXRmb3JtLmpzJztcblxuY29uc3QgX3NjaGVtZVBhdHRlcm4gPSAvXlxcd1tcXHdcXGQrLi1dKiQvO1xuY29uc3QgX3NpbmdsZVNsYXNoU3RhcnQgPSAvXlxcLy87XG5jb25zdCBfZG91YmxlU2xhc2hTdGFydCA9IC9eXFwvXFwvLztcblxuZnVuY3Rpb24gX3ZhbGlkYXRlVXJpKHJldDogVVJJLCBfc3RyaWN0PzogYm9vbGVhbik6IHZvaWQge1xuXG5cdC8vIHNjaGVtZSwgbXVzdCBiZSBzZXRcblx0aWYgKCFyZXQuc2NoZW1lICYmIF9zdHJpY3QpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFtVcmlFcnJvcl06IFNjaGVtZSBpcyBtaXNzaW5nOiB7c2NoZW1lOiBcIlwiLCBhdXRob3JpdHk6IFwiJHtyZXQuYXV0aG9yaXR5fVwiLCBwYXRoOiBcIiR7cmV0LnBhdGh9XCIsIHF1ZXJ5OiBcIiR7cmV0LnF1ZXJ5fVwiLCBmcmFnbWVudDogXCIke3JldC5mcmFnbWVudH1cIn1gKTtcblx0fVxuXG5cdC8vIHNjaGVtZSwgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM5ODYjc2VjdGlvbi0zLjFcblx0Ly8gQUxQSEEgKiggQUxQSEEgLyBESUdJVCAvIFwiK1wiIC8gXCItXCIgLyBcIi5cIiApXG5cdGlmIChyZXQuc2NoZW1lICYmICFfc2NoZW1lUGF0dGVybi50ZXN0KHJldC5zY2hlbWUpKSB7XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IFsuLi5yZXQuc2NoZW1lLm1hdGNoQWxsKC9bXlxcd1xcZCsuLV0vZ3UpXTtcblx0XHRjb25zdCBkZXRhaWwgPSBtYXRjaGVzLmxlbmd0aCA+IDBcblx0XHRcdD8gYCBGb3VuZCAnJHttYXRjaGVzWzBdWzBdfScgYXQgaW5kZXggJHttYXRjaGVzWzBdLmluZGV4fSAoJHttYXRjaGVzLmxlbmd0aH0gdG90YWwpYFxuXHRcdFx0OiAnJztcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFtVcmlFcnJvcl06IFNjaGVtZSBjb250YWlucyBpbGxlZ2FsIGNoYXJhY3RlcnMuJHtkZXRhaWx9IChsZW46JHtyZXQuc2NoZW1lLmxlbmd0aH0pYCk7XG5cdH1cblxuXHQvLyBwYXRoLCBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzOTg2I3NlY3Rpb24tMy4zXG5cdC8vIElmIGEgVVJJIGNvbnRhaW5zIGFuIGF1dGhvcml0eSBjb21wb25lbnQsIHRoZW4gdGhlIHBhdGggY29tcG9uZW50XG5cdC8vIG11c3QgZWl0aGVyIGJlIGVtcHR5IG9yIGJlZ2luIHdpdGggYSBzbGFzaCAoXCIvXCIpIGNoYXJhY3Rlci4gIElmIGEgVVJJXG5cdC8vIGRvZXMgbm90IGNvbnRhaW4gYW4gYXV0aG9yaXR5IGNvbXBvbmVudCwgdGhlbiB0aGUgcGF0aCBjYW5ub3QgYmVnaW5cblx0Ly8gd2l0aCB0d28gc2xhc2ggY2hhcmFjdGVycyAoXCIvL1wiKS5cblx0aWYgKHJldC5wYXRoKSB7XG5cdFx0aWYgKHJldC5hdXRob3JpdHkpIHtcblx0XHRcdGlmICghX3NpbmdsZVNsYXNoU3RhcnQudGVzdChyZXQucGF0aCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbVXJpRXJyb3JdOiBJZiBhIFVSSSBjb250YWlucyBhbiBhdXRob3JpdHkgY29tcG9uZW50LCB0aGVuIHRoZSBwYXRoIGNvbXBvbmVudCBtdXN0IGVpdGhlciBiZSBlbXB0eSBvciBiZWdpbiB3aXRoIGEgc2xhc2ggKFwiL1wiKSBjaGFyYWN0ZXInKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKF9kb3VibGVTbGFzaFN0YXJ0LnRlc3QocmV0LnBhdGgpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignW1VyaUVycm9yXTogSWYgYSBVUkkgZG9lcyBub3QgY29udGFpbiBhbiBhdXRob3JpdHkgY29tcG9uZW50LCB0aGVuIHRoZSBwYXRoIGNhbm5vdCBiZWdpbiB3aXRoIHR3byBzbGFzaCBjaGFyYWN0ZXJzIChcIi8vXCIpJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8vIGZvciBhIHdoaWxlIHdlIGFsbG93ZWQgdXJpcyAqd2l0aG91dCogc2NoZW1lcyBhbmQgdGhpcyBpcyB0aGUgbWlncmF0aW9uXG4vLyBmb3IgdGhlbSwgZS5nLiBhbiB1cmkgd2l0aG91dCBzY2hlbWUgYW5kIHdpdGhvdXQgc3RyaWN0LW1vZGUgd2FybnMgYW5kIGZhbGxzXG4vLyBiYWNrIHRvIHRoZSBmaWxlLXNjaGVtZS4gdGhhdCBzaG91bGQgY2F1c2UgdGhlIGxlYXN0IGNhcm5hZ2UgYW5kIHN0aWxsIGJlIGFcbi8vIGNsZWFyIHdhcm5pbmdcbmZ1bmN0aW9uIF9zY2hlbWVGaXgoc2NoZW1lOiBzdHJpbmcsIF9zdHJpY3Q6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRpZiAoIXNjaGVtZSAmJiAhX3N0cmljdCkge1xuXHRcdHJldHVybiAnZmlsZSc7XG5cdH1cblx0cmV0dXJuIHNjaGVtZTtcbn1cblxuLy8gaW1wbGVtZW50cyBhIGJpdCBvZiBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzk4NiNzZWN0aW9uLTVcbmZ1bmN0aW9uIF9yZWZlcmVuY2VSZXNvbHV0aW9uKHNjaGVtZTogc3RyaW5nLCBwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXG5cdC8vIHRoZSBzbGFzaC1jaGFyYWN0ZXIgaXMgb3VyICdkZWZhdWx0IGJhc2UnIGFzIHdlIGRvbid0XG5cdC8vIHN1cHBvcnQgY29uc3RydWN0aW5nIFVSSXMgcmVsYXRpdmUgdG8gb3RoZXIgVVJJcy4gVGhpc1xuXHQvLyBhbHNvIG1lYW5zIHRoYXQgd2UgYWx0ZXIgYW5kIHBvdGVudGlhbGx5IGJyZWFrIHBhdGhzLlxuXHQvLyBzZWUgaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM5ODYjc2VjdGlvbi01LjEuNFxuXHRzd2l0Y2ggKHNjaGVtZSkge1xuXHRcdGNhc2UgJ2h0dHBzJzpcblx0XHRjYXNlICdodHRwJzpcblx0XHRjYXNlICdmaWxlJzpcblx0XHRcdGlmICghcGF0aCkge1xuXHRcdFx0XHRwYXRoID0gX3NsYXNoO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoWzBdICE9PSBfc2xhc2gpIHtcblx0XHRcdFx0cGF0aCA9IF9zbGFzaCArIHBhdGg7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0fVxuXHRyZXR1cm4gcGF0aDtcbn1cblxuY29uc3QgX2VtcHR5ID0gJyc7XG5jb25zdCBfc2xhc2ggPSAnLyc7XG5jb25zdCBfcmVnZXhwID0gL14oKFteOi8/I10rPyk6KT8oXFwvXFwvKFteLz8jXSopKT8oW14/I10qKShcXD8oW14jXSopKT8oIyguKikpPy87XG5cbi8qKlxuICogVW5pZm9ybSBSZXNvdXJjZSBJZGVudGlmaWVyIChVUkkpIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM5ODYuXG4gKiBUaGlzIGNsYXNzIGlzIGEgc2ltcGxlIHBhcnNlciB3aGljaCBjcmVhdGVzIHRoZSBiYXNpYyBjb21wb25lbnQgcGFydHNcbiAqIChodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmMzOTg2I3NlY3Rpb24tMykgd2l0aCBtaW5pbWFsIHZhbGlkYXRpb25cbiAqIGFuZCBlbmNvZGluZy5cbiAqXG4gKiBgYGB0eHRcbiAqICAgICAgIGZvbzovL2V4YW1wbGUuY29tOjgwNDIvb3Zlci90aGVyZT9uYW1lPWZlcnJldCNub3NlXG4gKiAgICAgICBcXF8vICAgXFxfX19fX19fX19fX19fXy9cXF9fX19fX19fXy8gXFxfX19fX19fX18vIFxcX18vXG4gKiAgICAgICAgfCAgICAgICAgICAgfCAgICAgICAgICAgIHwgICAgICAgICAgICB8ICAgICAgICB8XG4gKiAgICAgc2NoZW1lICAgICBhdXRob3JpdHkgICAgICAgcGF0aCAgICAgICAgcXVlcnkgICBmcmFnbWVudFxuICogICAgICAgIHwgICBfX19fX19fX19fX19fX19fX19fX198X19cbiAqICAgICAgIC8gXFwgLyAgICAgICAgICAgICAgICAgICAgICAgIFxcXG4gKiAgICAgICB1cm46ZXhhbXBsZTphbmltYWw6ZmVycmV0Om5vc2VcbiAqIGBgYFxuICovXG5leHBvcnQgY2xhc3MgVVJJIGltcGxlbWVudHMgVXJpQ29tcG9uZW50cyB7XG5cblx0c3RhdGljIGlzVXJpKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgVVJJIHtcblx0XHRpZiAodGhpbmcgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaW5nIHx8IHR5cGVvZiB0aGluZyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiAoPFVSST50aGluZykuYXV0aG9yaXR5ID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgdHlwZW9mICg8VVJJPnRoaW5nKS5mcmFnbWVudCA9PT0gJ3N0cmluZydcblx0XHRcdCYmIHR5cGVvZiAoPFVSST50aGluZykucGF0aCA9PT0gJ3N0cmluZydcblx0XHRcdCYmIHR5cGVvZiAoPFVSST50aGluZykucXVlcnkgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2YgKDxVUkk+dGhpbmcpLnNjaGVtZSA9PT0gJ3N0cmluZydcblx0XHRcdCYmIHR5cGVvZiAoPFVSST50aGluZykuZnNQYXRoID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgdHlwZW9mICg8VVJJPnRoaW5nKS53aXRoID09PSAnZnVuY3Rpb24nXG5cdFx0XHQmJiB0eXBlb2YgKDxVUkk+dGhpbmcpLnRvU3RyaW5nID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0LyoqXG5cdCAqIHNjaGVtZSBpcyB0aGUgJ2h0dHAnIHBhcnQgb2YgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vc29tZS9wYXRoP3F1ZXJ5I2ZyYWdtZW50Jy5cblx0ICogVGhlIHBhcnQgYmVmb3JlIHRoZSBmaXJzdCBjb2xvbi5cblx0ICovXG5cdHJlYWRvbmx5IHNjaGVtZTogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBhdXRob3JpdHkgaXMgdGhlICd3d3cuZXhhbXBsZS5jb20nIHBhcnQgb2YgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vc29tZS9wYXRoP3F1ZXJ5I2ZyYWdtZW50Jy5cblx0ICogVGhlIHBhcnQgYmV0d2VlbiB0aGUgZmlyc3QgZG91YmxlIHNsYXNoZXMgYW5kIHRoZSBuZXh0IHNsYXNoLlxuXHQgKi9cblx0cmVhZG9ubHkgYXV0aG9yaXR5OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIHBhdGggaXMgdGhlICcvc29tZS9wYXRoJyBwYXJ0IG9mICdodHRwOi8vd3d3LmV4YW1wbGUuY29tL3NvbWUvcGF0aD9xdWVyeSNmcmFnbWVudCcuXG5cdCAqL1xuXHRyZWFkb25seSBwYXRoOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIHF1ZXJ5IGlzIHRoZSAncXVlcnknIHBhcnQgb2YgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vc29tZS9wYXRoP3F1ZXJ5I2ZyYWdtZW50Jy5cblx0ICovXG5cdHJlYWRvbmx5IHF1ZXJ5OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIGZyYWdtZW50IGlzIHRoZSAnZnJhZ21lbnQnIHBhcnQgb2YgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vc29tZS9wYXRoP3F1ZXJ5I2ZyYWdtZW50Jy5cblx0ICovXG5cdHJlYWRvbmx5IGZyYWdtZW50OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKHNjaGVtZTogc3RyaW5nLCBhdXRob3JpdHk/OiBzdHJpbmcsIHBhdGg/OiBzdHJpbmcsIHF1ZXJ5Pzogc3RyaW5nLCBmcmFnbWVudD86IHN0cmluZywgX3N0cmljdD86IGJvb2xlYW4pO1xuXG5cdC8qKlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihjb21wb25lbnRzOiBVcmlDb21wb25lbnRzKTtcblxuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqL1xuXHRwcm90ZWN0ZWQgY29uc3RydWN0b3Ioc2NoZW1lT3JEYXRhOiBzdHJpbmcgfCBVcmlDb21wb25lbnRzLCBhdXRob3JpdHk/OiBzdHJpbmcsIHBhdGg/OiBzdHJpbmcsIHF1ZXJ5Pzogc3RyaW5nLCBmcmFnbWVudD86IHN0cmluZywgX3N0cmljdDogYm9vbGVhbiA9IGZhbHNlKSB7XG5cblx0XHRpZiAodHlwZW9mIHNjaGVtZU9yRGF0YSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMuc2NoZW1lID0gc2NoZW1lT3JEYXRhLnNjaGVtZSB8fCBfZW1wdHk7XG5cdFx0XHR0aGlzLmF1dGhvcml0eSA9IHNjaGVtZU9yRGF0YS5hdXRob3JpdHkgfHwgX2VtcHR5O1xuXHRcdFx0dGhpcy5wYXRoID0gc2NoZW1lT3JEYXRhLnBhdGggfHwgX2VtcHR5O1xuXHRcdFx0dGhpcy5xdWVyeSA9IHNjaGVtZU9yRGF0YS5xdWVyeSB8fCBfZW1wdHk7XG5cdFx0XHR0aGlzLmZyYWdtZW50ID0gc2NoZW1lT3JEYXRhLmZyYWdtZW50IHx8IF9lbXB0eTtcblx0XHRcdC8vIG5vIHZhbGlkYXRpb24gYmVjYXVzZSBpdCdzIHRoaXMgVVJJXG5cdFx0XHQvLyB0aGF0IGNyZWF0ZXMgdXJpIGNvbXBvbmVudHMuXG5cdFx0XHQvLyBfdmFsaWRhdGVVcmkodGhpcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2NoZW1lID0gX3NjaGVtZUZpeChzY2hlbWVPckRhdGEsIF9zdHJpY3QpO1xuXHRcdFx0dGhpcy5hdXRob3JpdHkgPSBhdXRob3JpdHkgfHwgX2VtcHR5O1xuXHRcdFx0dGhpcy5wYXRoID0gX3JlZmVyZW5jZVJlc29sdXRpb24odGhpcy5zY2hlbWUsIHBhdGggfHwgX2VtcHR5KTtcblx0XHRcdHRoaXMucXVlcnkgPSBxdWVyeSB8fCBfZW1wdHk7XG5cdFx0XHR0aGlzLmZyYWdtZW50ID0gZnJhZ21lbnQgfHwgX2VtcHR5O1xuXG5cdFx0XHRfdmFsaWRhdGVVcmkodGhpcywgX3N0cmljdCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBmaWxlc3lzdGVtIHBhdGggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIGNvcnJlc3BvbmRpbmcgZmlsZSBzeXN0ZW0gcGF0aCBvZiB0aGlzIFVSSS5cblx0ICogV2lsbCBoYW5kbGUgVU5DIHBhdGhzLCBub3JtYWxpemVzIHdpbmRvd3MgZHJpdmUgbGV0dGVycyB0byBsb3dlci1jYXNlLCBhbmQgdXNlcyB0aGVcblx0ICogcGxhdGZvcm0gc3BlY2lmaWMgcGF0aCBzZXBhcmF0b3IuXG5cdCAqXG5cdCAqICogV2lsbCAqbm90KiB2YWxpZGF0ZSB0aGUgcGF0aCBmb3IgaW52YWxpZCBjaGFyYWN0ZXJzIGFuZCBzZW1hbnRpY3MuXG5cdCAqICogV2lsbCAqbm90KiBsb29rIGF0IHRoZSBzY2hlbWUgb2YgdGhpcyBVUkkuXG5cdCAqICogVGhlIHJlc3VsdCBzaGFsbCAqbm90KiBiZSB1c2VkIGZvciBkaXNwbGF5IHB1cnBvc2VzIGJ1dCBmb3IgYWNjZXNzaW5nIGEgZmlsZSBvbiBkaXNrLlxuXHQgKlxuXHQgKlxuXHQgKiBUaGUgKmRpZmZlcmVuY2UqIHRvIGBVUkkjcGF0aGAgaXMgdGhlIHVzZSBvZiB0aGUgcGxhdGZvcm0gc3BlY2lmaWMgc2VwYXJhdG9yIGFuZCB0aGUgaGFuZGxpbmdcblx0ICogb2YgVU5DIHBhdGhzLiBTZWUgdGhlIGJlbG93IHNhbXBsZSBvZiBhIGZpbGUtdXJpIHdpdGggYW4gYXV0aG9yaXR5IChVTkMgcGF0aCkuXG5cdCAqXG5cdCAqIGBgYHRzXG5cdFx0Y29uc3QgdSA9IFVSSS5wYXJzZSgnZmlsZTovL3NlcnZlci9jJC9mb2xkZXIvZmlsZS50eHQnKVxuXHRcdHUuYXV0aG9yaXR5ID09PSAnc2VydmVyJ1xuXHRcdHUucGF0aCA9PT0gJy9zaGFyZXMvYyQvZmlsZS50eHQnXG5cdFx0dS5mc1BhdGggPT09ICdcXFxcc2VydmVyXFxjJFxcZm9sZGVyXFxmaWxlLnR4dCdcblx0YGBgXG5cdCAqXG5cdCAqIFVzaW5nIGBVUkkjcGF0aGAgdG8gcmVhZCBhIGZpbGUgKHVzaW5nIGZzLWFwaXMpIHdvdWxkIG5vdCBiZSBlbm91Z2ggYmVjYXVzZSBwYXJ0cyBvZiB0aGUgcGF0aCxcblx0ICogbmFtZWx5IHRoZSBzZXJ2ZXIgbmFtZSwgd291bGQgYmUgbWlzc2luZy4gVGhlcmVmb3JlIGBVUkkjZnNQYXRoYCBleGlzdHMgLSBpdCdzIHN1Z2FyIHRvIGVhc2Ugd29ya2luZ1xuXHQgKiB3aXRoIFVSSXMgdGhhdCByZXByZXNlbnQgZmlsZXMgb24gZGlzayAoYGZpbGVgIHNjaGVtZSkuXG5cdCAqL1xuXHRnZXQgZnNQYXRoKCk6IHN0cmluZyB7XG5cdFx0Ly8gaWYgKHRoaXMuc2NoZW1lICE9PSAnZmlsZScpIHtcblx0XHQvLyBcdGNvbnNvbGUud2FybihgW1VyaUVycm9yXSBjYWxsaW5nIGZzUGF0aCB3aXRoIHNjaGVtZSAke3RoaXMuc2NoZW1lfWApO1xuXHRcdC8vIH1cblx0XHRyZXR1cm4gdXJpVG9Gc1BhdGgodGhpcywgZmFsc2UpO1xuXHR9XG5cblx0Ly8gLS0tLSBtb2RpZnkgdG8gbmV3IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR3aXRoKGNoYW5nZTogeyBzY2hlbWU/OiBzdHJpbmc7IGF1dGhvcml0eT86IHN0cmluZyB8IG51bGw7IHBhdGg/OiBzdHJpbmcgfCBudWxsOyBxdWVyeT86IHN0cmluZyB8IG51bGw7IGZyYWdtZW50Pzogc3RyaW5nIHwgbnVsbCB9KTogVVJJIHtcblxuXHRcdGlmICghY2hhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRsZXQgeyBzY2hlbWUsIGF1dGhvcml0eSwgcGF0aCwgcXVlcnksIGZyYWdtZW50IH0gPSBjaGFuZ2U7XG5cdFx0aWYgKHNjaGVtZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzY2hlbWUgPSB0aGlzLnNjaGVtZTtcblx0XHR9IGVsc2UgaWYgKHNjaGVtZSA9PT0gbnVsbCkge1xuXHRcdFx0c2NoZW1lID0gX2VtcHR5O1xuXHRcdH1cblx0XHRpZiAoYXV0aG9yaXR5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGF1dGhvcml0eSA9IHRoaXMuYXV0aG9yaXR5O1xuXHRcdH0gZWxzZSBpZiAoYXV0aG9yaXR5ID09PSBudWxsKSB7XG5cdFx0XHRhdXRob3JpdHkgPSBfZW1wdHk7XG5cdFx0fVxuXHRcdGlmIChwYXRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHBhdGggPSB0aGlzLnBhdGg7XG5cdFx0fSBlbHNlIGlmIChwYXRoID09PSBudWxsKSB7XG5cdFx0XHRwYXRoID0gX2VtcHR5O1xuXHRcdH1cblx0XHRpZiAocXVlcnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cXVlcnkgPSB0aGlzLnF1ZXJ5O1xuXHRcdH0gZWxzZSBpZiAocXVlcnkgPT09IG51bGwpIHtcblx0XHRcdHF1ZXJ5ID0gX2VtcHR5O1xuXHRcdH1cblx0XHRpZiAoZnJhZ21lbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZnJhZ21lbnQgPSB0aGlzLmZyYWdtZW50O1xuXHRcdH0gZWxzZSBpZiAoZnJhZ21lbnQgPT09IG51bGwpIHtcblx0XHRcdGZyYWdtZW50ID0gX2VtcHR5O1xuXHRcdH1cblxuXHRcdGlmIChzY2hlbWUgPT09IHRoaXMuc2NoZW1lXG5cdFx0XHQmJiBhdXRob3JpdHkgPT09IHRoaXMuYXV0aG9yaXR5XG5cdFx0XHQmJiBwYXRoID09PSB0aGlzLnBhdGhcblx0XHRcdCYmIHF1ZXJ5ID09PSB0aGlzLnF1ZXJ5XG5cdFx0XHQmJiBmcmFnbWVudCA9PT0gdGhpcy5mcmFnbWVudCkge1xuXG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFVyaShzY2hlbWUsIGF1dGhvcml0eSwgcGF0aCwgcXVlcnksIGZyYWdtZW50KTtcblx0fVxuXG5cdC8vIC0tLS0gcGFyc2UgJiB2YWxpZGF0ZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBVUkkgZnJvbSBhIHN0cmluZywgZS5nLiBgaHR0cDovL3d3dy5leGFtcGxlLmNvbS9zb21lL3BhdGhgLFxuXHQgKiBgZmlsZTovLy91c3IvaG9tZWAsIG9yIGBzY2hlbWU6d2l0aC9wYXRoYC5cblx0ICpcblx0ICogQHBhcmFtIHZhbHVlIEEgc3RyaW5nIHdoaWNoIHJlcHJlc2VudHMgYW4gVVJJIChzZWUgYFVSSSN0b1N0cmluZ2ApLlxuXHQgKi9cblx0c3RhdGljIHBhcnNlKHZhbHVlOiBzdHJpbmcsIF9zdHJpY3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFVSSSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSBfcmVnZXhwLmV4ZWModmFsdWUpO1xuXHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdHJldHVybiBuZXcgVXJpKF9lbXB0eSwgX2VtcHR5LCBfZW1wdHksIF9lbXB0eSwgX2VtcHR5KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBVcmkoXG5cdFx0XHRtYXRjaFsyXSB8fCBfZW1wdHksXG5cdFx0XHRwZXJjZW50RGVjb2RlKG1hdGNoWzRdIHx8IF9lbXB0eSksXG5cdFx0XHRwZXJjZW50RGVjb2RlKG1hdGNoWzVdIHx8IF9lbXB0eSksXG5cdFx0XHRwZXJjZW50RGVjb2RlKG1hdGNoWzddIHx8IF9lbXB0eSksXG5cdFx0XHRwZXJjZW50RGVjb2RlKG1hdGNoWzldIHx8IF9lbXB0eSksXG5cdFx0XHRfc3RyaWN0XG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IFVSSSBmcm9tIGEgZmlsZSBzeXN0ZW0gcGF0aCwgZS5nLiBgYzpcXG15XFxmaWxlc2AsXG5cdCAqIGAvdXNyL2hvbWVgLCBvciBgXFxcXHNlcnZlclxcc2hhcmVcXHNvbWVcXHBhdGhgLlxuXHQgKlxuXHQgKiBUaGUgKmRpZmZlcmVuY2UqIGJldHdlZW4gYFVSSSNwYXJzZWAgYW5kIGBVUkkjZmlsZWAgaXMgdGhhdCB0aGUgbGF0dGVyIHRyZWF0cyB0aGUgYXJndW1lbnRcblx0ICogYXMgcGF0aCwgbm90IGFzIHN0cmluZ2lmaWVkLXVyaS4gRS5nLiBgVVJJLmZpbGUocGF0aClgIGlzICoqbm90IHRoZSBzYW1lIGFzKipcblx0ICogYFVSSS5wYXJzZSgnZmlsZTovLycgKyBwYXRoKWAgYmVjYXVzZSB0aGUgcGF0aCBtaWdodCBjb250YWluIGNoYXJhY3RlcnMgdGhhdCBhcmVcblx0ICogaW50ZXJwcmV0ZWQgKCMgYW5kID8pLiBTZWUgdGhlIGZvbGxvd2luZyBzYW1wbGU6XG5cdCAqIGBgYHRzXG5cdGNvbnN0IGdvb2QgPSBVUkkuZmlsZSgnL2NvZGluZy9jIy9wcm9qZWN0MScpO1xuXHRnb29kLnNjaGVtZSA9PT0gJ2ZpbGUnO1xuXHRnb29kLnBhdGggPT09ICcvY29kaW5nL2MjL3Byb2plY3QxJztcblx0Z29vZC5mcmFnbWVudCA9PT0gJyc7XG5cdGNvbnN0IGJhZCA9IFVSSS5wYXJzZSgnZmlsZTovLycgKyAnL2NvZGluZy9jIy9wcm9qZWN0MScpO1xuXHRiYWQuc2NoZW1lID09PSAnZmlsZSc7XG5cdGJhZC5wYXRoID09PSAnL2NvZGluZy9jJzsgLy8gcGF0aCBpcyBub3cgYnJva2VuXG5cdGJhZC5mcmFnbWVudCA9PT0gJy9wcm9qZWN0MSc7XG5cdGBgYFxuXHQgKlxuXHQgKiBAcGFyYW0gcGF0aCBBIGZpbGUgc3lzdGVtIHBhdGggKHNlZSBgVVJJI2ZzUGF0aGApXG5cdCAqL1xuXHRzdGF0aWMgZmlsZShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXG5cdFx0bGV0IGF1dGhvcml0eSA9IF9lbXB0eTtcblxuXHRcdC8vIG5vcm1hbGl6ZSB0byBmd2Qtc2xhc2hlcyBvbiB3aW5kb3dzLFxuXHRcdC8vIG9uIG90aGVyIHN5c3RlbXMgYndkLXNsYXNoZXMgYXJlIHZhbGlkXG5cdFx0Ly8gZmlsZW5hbWUgY2hhcmFjdGVyLCBlZyAvZlxcb28vYmFcXHIudHh0XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0cGF0aCA9IHBhdGgucmVwbGFjZSgvXFxcXC9nLCBfc2xhc2gpO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGZvciBhdXRob3JpdHkgYXMgdXNlZCBpbiBVTkMgc2hhcmVzXG5cdFx0Ly8gb3IgdXNlIHRoZSBwYXRoIGFzIGdpdmVuXG5cdFx0aWYgKHBhdGhbMF0gPT09IF9zbGFzaCAmJiBwYXRoWzFdID09PSBfc2xhc2gpIHtcblx0XHRcdGNvbnN0IGlkeCA9IHBhdGguaW5kZXhPZihfc2xhc2gsIDIpO1xuXHRcdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdFx0YXV0aG9yaXR5ID0gcGF0aC5zdWJzdHJpbmcoMik7XG5cdFx0XHRcdHBhdGggPSBfc2xhc2g7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhdXRob3JpdHkgPSBwYXRoLnN1YnN0cmluZygyLCBpZHgpO1xuXHRcdFx0XHRwYXRoID0gcGF0aC5zdWJzdHJpbmcoaWR4KSB8fCBfc2xhc2g7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBVcmkoJ2ZpbGUnLCBhdXRob3JpdHksIHBhdGgsIF9lbXB0eSwgX2VtcHR5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIG5ldyBVUkkgZnJvbSB1cmkgY29tcG9uZW50cy5cblx0ICpcblx0ICogVW5sZXNzIGBzdHJpY3RgIGlzIGB0cnVlYCB0aGUgc2NoZW1lIGlzIGRlZmF1bHRzIHRvIGJlIGBmaWxlYC4gVGhpcyBmdW5jdGlvbiBwZXJmb3Jtc1xuXHQgKiB2YWxpZGF0aW9uIGFuZCBzaG91bGQgYmUgdXNlZCBmb3IgdW50cnVzdGVkIHVyaSBjb21wb25lbnRzIHJldHJpZXZlZCBmcm9tIHN0b3JhZ2UsXG5cdCAqIHVzZXIgaW5wdXQsIGNvbW1hbmQgYXJndW1lbnRzIGV0Y1xuXHQgKi9cblx0c3RhdGljIGZyb20oY29tcG9uZW50czogVXJpQ29tcG9uZW50cywgc3RyaWN0PzogYm9vbGVhbik6IFVSSSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVyaShcblx0XHRcdGNvbXBvbmVudHMuc2NoZW1lLFxuXHRcdFx0Y29tcG9uZW50cy5hdXRob3JpdHksXG5cdFx0XHRjb21wb25lbnRzLnBhdGgsXG5cdFx0XHRjb21wb25lbnRzLnF1ZXJ5LFxuXHRcdFx0Y29tcG9uZW50cy5mcmFnbWVudCxcblx0XHRcdHN0cmljdFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBKb2luIGEgVVJJIHBhdGggd2l0aCBwYXRoIGZyYWdtZW50cyBhbmQgbm9ybWFsaXplcyB0aGUgcmVzdWx0aW5nIHBhdGguXG5cdCAqXG5cdCAqIEBwYXJhbSB1cmkgVGhlIGlucHV0IFVSSS5cblx0ICogQHBhcmFtIHBhdGhGcmFnbWVudCBUaGUgcGF0aCBmcmFnbWVudCB0byBhZGQgdG8gdGhlIFVSSSBwYXRoLlxuXHQgKiBAcmV0dXJucyBUaGUgcmVzdWx0aW5nIFVSSS5cblx0ICovXG5cdHN0YXRpYyBqb2luUGF0aCh1cmk6IFVSSSwgLi4ucGF0aEZyYWdtZW50OiBzdHJpbmdbXSk6IFVSSSB7XG5cdFx0aWYgKCF1cmkucGF0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbVXJpRXJyb3JdOiBjYW5ub3QgY2FsbCBqb2luUGF0aCBvbiBVUkkgd2l0aG91dCBwYXRoOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRsZXQgbmV3UGF0aDogc3RyaW5nO1xuXHRcdGlmIChpc1dpbmRvd3MgJiYgdXJpLnNjaGVtZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRuZXdQYXRoID0gVVJJLmZpbGUocGF0aHMud2luMzIuam9pbih1cmlUb0ZzUGF0aCh1cmksIHRydWUpLCAuLi5wYXRoRnJhZ21lbnQpKS5wYXRoO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdQYXRoID0gcGF0aHMucG9zaXguam9pbih1cmkucGF0aCwgLi4ucGF0aEZyYWdtZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVyaS53aXRoKHsgcGF0aDogbmV3UGF0aCB9KTtcblx0fVxuXG5cdC8vIC0tLS0gcHJpbnRpbmcvZXh0ZXJuYWxpemUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gZm9yIHRoaXMgVVJJLiBJdCdzIGd1YXJhbnRlZWQgdGhhdCBjYWxsaW5nXG5cdCAqIGBVUkkucGFyc2VgIHdpdGggdGhlIHJlc3VsdCBvZiB0aGlzIGZ1bmN0aW9uIGNyZWF0ZXMgYW4gVVJJIHdoaWNoIGlzIGVxdWFsXG5cdCAqIHRvIHRoaXMgVVJJLlxuXHQgKlxuXHQgKiAqIFRoZSByZXN1bHQgc2hhbGwgKm5vdCogYmUgdXNlZCBmb3IgZGlzcGxheSBwdXJwb3NlcyBidXQgZm9yIGV4dGVybmFsaXphdGlvbiBvciB0cmFuc3BvcnQuXG5cdCAqICogVGhlIHJlc3VsdCB3aWxsIGJlIGVuY29kZWQgdXNpbmcgdGhlIHBlcmNlbnRhZ2UgZW5jb2RpbmcgYW5kIGVuY29kaW5nIGhhcHBlbnMgbW9zdGx5XG5cdCAqIGlnbm9yZSB0aGUgc2NoZW1lLXNwZWNpZmljIGVuY29kaW5nIHJ1bGVzLlxuXHQgKlxuXHQgKiBAcGFyYW0gc2tpcEVuY29kaW5nIERvIG5vdCBlbmNvZGUgdGhlIHJlc3VsdCwgZGVmYXVsdCBpcyBgZmFsc2VgXG5cdCAqL1xuXHR0b1N0cmluZyhza2lwRW5jb2Rpbmc6IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIF9hc0Zvcm1hdHRlZCh0aGlzLCBza2lwRW5jb2RpbmcpO1xuXHR9XG5cblx0dG9KU09OKCk6IFVyaUNvbXBvbmVudHMge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgaGVscGVyIGZ1bmN0aW9uIHRvIHJldml2ZSBVUklzLlxuXHQgKlxuXHQgKiAqKk5vdGUqKiB0aGF0IHRoaXMgZnVuY3Rpb24gc2hvdWxkIG9ubHkgYmUgdXNlZCB3aGVuIHJlY2VpdmluZyBVUkkjdG9KU09OIGdlbmVyYXRlZCBkYXRhXG5cdCAqIGFuZCB0aGF0IGl0IGRvZXNuJ3QgZG8gYW55IHZhbGlkYXRpb24uIFVzZSB7QGxpbmsgVVJJLmZyb219IHdoZW4gcmVjZWl2ZWQgXCJ1bnRydXN0ZWRcIlxuXHQgKiB1cmkgY29tcG9uZW50cyBzdWNoIGFzIGNvbW1hbmQgYXJndW1lbnRzIG9yIGRhdGEgZnJvbSBzdG9yYWdlLlxuXHQgKlxuXHQgKiBAcGFyYW0gZGF0YSBUaGUgVVJJIGNvbXBvbmVudHMgb3IgVVJJIHRvIHJldml2ZS5cblx0ICogQHJldHVybnMgVGhlIHJldml2ZWQgVVJJIG9yIHVuZGVmaW5lZCBvciBudWxsLlxuXHQgKi9cblx0c3RhdGljIHJldml2ZShkYXRhOiBVcmlDb21wb25lbnRzIHwgVVJJKTogVVJJO1xuXHRzdGF0aWMgcmV2aXZlKGRhdGE6IFVyaUNvbXBvbmVudHMgfCBVUkkgfCB1bmRlZmluZWQpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHN0YXRpYyByZXZpdmUoZGF0YTogVXJpQ29tcG9uZW50cyB8IFVSSSB8IG51bGwpOiBVUkkgfCBudWxsO1xuXHRzdGF0aWMgcmV2aXZlKGRhdGE6IFVyaUNvbXBvbmVudHMgfCBVUkkgfCB1bmRlZmluZWQgfCBudWxsKTogVVJJIHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0c3RhdGljIHJldml2ZShkYXRhOiBVcmlDb21wb25lbnRzIHwgVVJJIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFVSSSB8IHVuZGVmaW5lZCB8IG51bGwge1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIGRhdGE7XG5cdFx0fSBlbHNlIGlmIChkYXRhIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFVyaShkYXRhKTtcblx0XHRcdHJlc3VsdC5fZm9ybWF0dGVkID0gKDxVcmlTdGF0ZT5kYXRhKS5leHRlcm5hbCA/PyBudWxsO1xuXHRcdFx0cmVzdWx0Ll9mc1BhdGggPSAoPFVyaVN0YXRlPmRhdGEpLl9zZXAgPT09IF9wYXRoU2VwTWFya2VyID8gKDxVcmlTdGF0ZT5kYXRhKS5mc1BhdGggPz8gbnVsbCA6IG51bGw7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdFtTeW1ib2wuZm9yKCdkZWJ1Zy5kZXNjcmlwdGlvbicpXSgpIHtcblx0XHRyZXR1cm4gYFVSSSgke3RoaXMudG9TdHJpbmcoKX0pYDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFVyaUNvbXBvbmVudHMge1xuXHRzY2hlbWU6IHN0cmluZztcblx0YXV0aG9yaXR5Pzogc3RyaW5nO1xuXHRwYXRoPzogc3RyaW5nO1xuXHRxdWVyeT86IHN0cmluZztcblx0ZnJhZ21lbnQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1VyaUNvbXBvbmVudHModGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBVcmlDb21wb25lbnRzIHtcblx0aWYgKCF0aGluZyB8fCB0eXBlb2YgdGhpbmcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB0eXBlb2YgKDxVcmlDb21wb25lbnRzPnRoaW5nKS5zY2hlbWUgPT09ICdzdHJpbmcnXG5cdFx0JiYgKHR5cGVvZiAoPFVyaUNvbXBvbmVudHM+dGhpbmcpLmF1dGhvcml0eSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mICg8VXJpQ29tcG9uZW50cz50aGluZykuYXV0aG9yaXR5ID09PSAndW5kZWZpbmVkJylcblx0XHQmJiAodHlwZW9mICg8VXJpQ29tcG9uZW50cz50aGluZykucGF0aCA9PT0gJ3N0cmluZycgfHwgdHlwZW9mICg8VXJpQ29tcG9uZW50cz50aGluZykucGF0aCA9PT0gJ3VuZGVmaW5lZCcpXG5cdFx0JiYgKHR5cGVvZiAoPFVyaUNvbXBvbmVudHM+dGhpbmcpLnF1ZXJ5ID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgKDxVcmlDb21wb25lbnRzPnRoaW5nKS5xdWVyeSA9PT0gJ3VuZGVmaW5lZCcpXG5cdFx0JiYgKHR5cGVvZiAoPFVyaUNvbXBvbmVudHM+dGhpbmcpLmZyYWdtZW50ID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgKDxVcmlDb21wb25lbnRzPnRoaW5nKS5mcmFnbWVudCA9PT0gJ3VuZGVmaW5lZCcpO1xufVxuXG5pbnRlcmZhY2UgVXJpU3RhdGUgZXh0ZW5kcyBVcmlDb21wb25lbnRzIHtcblx0JG1pZDogTWFyc2hhbGxlZElkLlVyaTtcblx0ZXh0ZXJuYWw/OiBzdHJpbmc7XG5cdGZzUGF0aD86IHN0cmluZztcblx0X3NlcD86IDE7XG59XG5cbmNvbnN0IF9wYXRoU2VwTWFya2VyID0gaXNXaW5kb3dzID8gMSA6IHVuZGVmaW5lZDtcblxuLy8gVGhpcyBjbGFzcyBleGlzdHMgc28gdGhhdCBVUkkgaXMgY29tcGF0aWJsZSB3aXRoIHZzY29kZS5VcmkgKEFQSSkuXG5jbGFzcyBVcmkgZXh0ZW5kcyBVUkkge1xuXG5cdF9mb3JtYXR0ZWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRfZnNQYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRvdmVycmlkZSBnZXQgZnNQYXRoKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9mc1BhdGgpIHtcblx0XHRcdHRoaXMuX2ZzUGF0aCA9IHVyaVRvRnNQYXRoKHRoaXMsIGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ZzUGF0aDtcblx0fVxuXG5cdG92ZXJyaWRlIHRvU3RyaW5nKHNraXBFbmNvZGluZzogYm9vbGVhbiA9IGZhbHNlKTogc3RyaW5nIHtcblx0XHRpZiAoIXNraXBFbmNvZGluZykge1xuXHRcdFx0aWYgKCF0aGlzLl9mb3JtYXR0ZWQpIHtcblx0XHRcdFx0dGhpcy5fZm9ybWF0dGVkID0gX2FzRm9ybWF0dGVkKHRoaXMsIGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9mb3JtYXR0ZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHdlIGRvbid0IGNhY2hlIHRoYXRcblx0XHRcdHJldHVybiBfYXNGb3JtYXR0ZWQodGhpcywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9KU09OKCk6IFVyaUNvbXBvbmVudHMge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRjb25zdCByZXMgPSA8VXJpU3RhdGU+e1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLlVyaVxuXHRcdH07XG5cdFx0Ly8gY2FjaGVkIHN0YXRlXG5cdFx0aWYgKHRoaXMuX2ZzUGF0aCkge1xuXHRcdFx0cmVzLmZzUGF0aCA9IHRoaXMuX2ZzUGF0aDtcblx0XHRcdHJlcy5fc2VwID0gX3BhdGhTZXBNYXJrZXI7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9mb3JtYXR0ZWQpIHtcblx0XHRcdHJlcy5leHRlcm5hbCA9IHRoaXMuX2Zvcm1hdHRlZDtcblx0XHR9XG5cdFx0Ly8tLS0gdXJpIGNvbXBvbmVudHNcblx0XHRpZiAodGhpcy5wYXRoKSB7XG5cdFx0XHRyZXMucGF0aCA9IHRoaXMucGF0aDtcblx0XHR9XG5cdFx0Ly8gVE9ET1xuXHRcdC8vIHRoaXMgaXNuJ3QgY29ycmVjdCBhbmQgY2FuIHZpb2xhdGUgdGhlIFVyaUNvbXBvbmVudHMgY29udHJhY3QgYnV0XG5cdFx0Ly8gdGhpcyBpcyBwYXJ0IG9mIHRoZSB2c2NvZGUuVXJpIEFQSSBhbmQgd2Ugc2hvdWxkbid0IGNoYW5nZSBob3cgdGhhdFxuXHRcdC8vIHdvcmtzIGFueW1vcmVcblx0XHRpZiAodGhpcy5zY2hlbWUpIHtcblx0XHRcdHJlcy5zY2hlbWUgPSB0aGlzLnNjaGVtZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYXV0aG9yaXR5KSB7XG5cdFx0XHRyZXMuYXV0aG9yaXR5ID0gdGhpcy5hdXRob3JpdHk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnF1ZXJ5KSB7XG5cdFx0XHRyZXMucXVlcnkgPSB0aGlzLnF1ZXJ5O1xuXHRcdH1cblx0XHRpZiAodGhpcy5mcmFnbWVudCkge1xuXHRcdFx0cmVzLmZyYWdtZW50ID0gdGhpcy5mcmFnbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxufVxuXG4vLyByZXNlcnZlZCBjaGFyYWN0ZXJzOiBodHRwczovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzk4NiNzZWN0aW9uLTIuMlxuY29uc3QgZW5jb2RlVGFibGU6IHsgW2NoOiBudW1iZXJdOiBzdHJpbmcgfSA9IHtcblx0W0NoYXJDb2RlLkNvbG9uXTogJyUzQScsIC8vIGdlbi1kZWxpbXNcblx0W0NoYXJDb2RlLlNsYXNoXTogJyUyRicsXG5cdFtDaGFyQ29kZS5RdWVzdGlvbk1hcmtdOiAnJTNGJyxcblx0W0NoYXJDb2RlLkhhc2hdOiAnJTIzJyxcblx0W0NoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0XTogJyU1QicsXG5cdFtDaGFyQ29kZS5DbG9zZVNxdWFyZUJyYWNrZXRdOiAnJTVEJyxcblx0W0NoYXJDb2RlLkF0U2lnbl06ICclNDAnLFxuXG5cdFtDaGFyQ29kZS5FeGNsYW1hdGlvbk1hcmtdOiAnJTIxJywgLy8gc3ViLWRlbGltc1xuXHRbQ2hhckNvZGUuRG9sbGFyU2lnbl06ICclMjQnLFxuXHRbQ2hhckNvZGUuQW1wZXJzYW5kXTogJyUyNicsXG5cdFtDaGFyQ29kZS5TaW5nbGVRdW90ZV06ICclMjcnLFxuXHRbQ2hhckNvZGUuT3BlblBhcmVuXTogJyUyOCcsXG5cdFtDaGFyQ29kZS5DbG9zZVBhcmVuXTogJyUyOScsXG5cdFtDaGFyQ29kZS5Bc3Rlcmlza106ICclMkEnLFxuXHRbQ2hhckNvZGUuUGx1c106ICclMkInLFxuXHRbQ2hhckNvZGUuQ29tbWFdOiAnJTJDJyxcblx0W0NoYXJDb2RlLlNlbWljb2xvbl06ICclM0InLFxuXHRbQ2hhckNvZGUuRXF1YWxzXTogJyUzRCcsXG5cblx0W0NoYXJDb2RlLlNwYWNlXTogJyUyMCcsXG59O1xuXG5mdW5jdGlvbiBlbmNvZGVVUklDb21wb25lbnRGYXN0KHVyaUNvbXBvbmVudDogc3RyaW5nLCBpc1BhdGg6IGJvb2xlYW4sIGlzQXV0aG9yaXR5OiBib29sZWFuKTogc3RyaW5nIHtcblx0bGV0IHJlczogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRsZXQgbmF0aXZlRW5jb2RlUG9zID0gLTE7XG5cblx0Zm9yIChsZXQgcG9zID0gMDsgcG9zIDwgdXJpQ29tcG9uZW50Lmxlbmd0aDsgcG9zKyspIHtcblx0XHRjb25zdCBjb2RlID0gdXJpQ29tcG9uZW50LmNoYXJDb2RlQXQocG9zKTtcblxuXHRcdC8vIHVucmVzZXJ2ZWQgY2hhcmFjdGVyczogaHR0cHM6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzM5ODYjc2VjdGlvbi0yLjNcblx0XHRpZiAoXG5cdFx0XHQoY29kZSA+PSBDaGFyQ29kZS5hICYmIGNvZGUgPD0gQ2hhckNvZGUueilcblx0XHRcdHx8IChjb2RlID49IENoYXJDb2RlLkEgJiYgY29kZSA8PSBDaGFyQ29kZS5aKVxuXHRcdFx0fHwgKGNvZGUgPj0gQ2hhckNvZGUuRGlnaXQwICYmIGNvZGUgPD0gQ2hhckNvZGUuRGlnaXQ5KVxuXHRcdFx0fHwgY29kZSA9PT0gQ2hhckNvZGUuRGFzaFxuXHRcdFx0fHwgY29kZSA9PT0gQ2hhckNvZGUuUGVyaW9kXG5cdFx0XHR8fCBjb2RlID09PSBDaGFyQ29kZS5VbmRlcmxpbmVcblx0XHRcdHx8IGNvZGUgPT09IENoYXJDb2RlLlRpbGRlXG5cdFx0XHR8fCAoaXNQYXRoICYmIGNvZGUgPT09IENoYXJDb2RlLlNsYXNoKVxuXHRcdFx0fHwgKGlzQXV0aG9yaXR5ICYmIGNvZGUgPT09IENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0KVxuXHRcdFx0fHwgKGlzQXV0aG9yaXR5ICYmIGNvZGUgPT09IENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldClcblx0XHRcdHx8IChpc0F1dGhvcml0eSAmJiBjb2RlID09PSBDaGFyQ29kZS5Db2xvbilcblx0XHQpIHtcblx0XHRcdC8vIGNoZWNrIGlmIHdlIGFyZSBkZWxheWluZyBuYXRpdmUgZW5jb2RlXG5cdFx0XHRpZiAobmF0aXZlRW5jb2RlUG9zICE9PSAtMSkge1xuXHRcdFx0XHRyZXMgKz0gZW5jb2RlVVJJQ29tcG9uZW50KHVyaUNvbXBvbmVudC5zdWJzdHJpbmcobmF0aXZlRW5jb2RlUG9zLCBwb3MpKTtcblx0XHRcdFx0bmF0aXZlRW5jb2RlUG9zID0gLTE7XG5cdFx0XHR9XG5cdFx0XHQvLyBjaGVjayBpZiB3ZSB3cml0ZSBpbnRvIGEgbmV3IHN0cmluZyAoYnkgZGVmYXVsdCB3ZSB0cnkgdG8gcmV0dXJuIHRoZSBwYXJhbSlcblx0XHRcdGlmIChyZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXMgKz0gdXJpQ29tcG9uZW50LmNoYXJBdChwb3MpO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVuY29kaW5nIG5lZWRlZCwgd2UgbmVlZCB0byBhbGxvY2F0ZSBhIG5ldyBzdHJpbmdcblx0XHRcdGlmIChyZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXMgPSB1cmlDb21wb25lbnQuc3Vic3RyKDAsIHBvcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoZWNrIHdpdGggZGVmYXVsdCB0YWJsZSBmaXJzdFxuXHRcdFx0Y29uc3QgZXNjYXBlZCA9IGVuY29kZVRhYmxlW2NvZGVdO1xuXHRcdFx0aWYgKGVzY2FwZWQgIT09IHVuZGVmaW5lZCkge1xuXG5cdFx0XHRcdC8vIGNoZWNrIGlmIHdlIGFyZSBkZWxheWluZyBuYXRpdmUgZW5jb2RlXG5cdFx0XHRcdGlmIChuYXRpdmVFbmNvZGVQb3MgIT09IC0xKSB7XG5cdFx0XHRcdFx0cmVzICs9IGVuY29kZVVSSUNvbXBvbmVudCh1cmlDb21wb25lbnQuc3Vic3RyaW5nKG5hdGl2ZUVuY29kZVBvcywgcG9zKSk7XG5cdFx0XHRcdFx0bmF0aXZlRW5jb2RlUG9zID0gLTE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBhcHBlbmQgZXNjYXBlZCB2YXJpYW50IHRvIHJlc3VsdFxuXHRcdFx0XHRyZXMgKz0gZXNjYXBlZDtcblxuXHRcdFx0fSBlbHNlIGlmIChuYXRpdmVFbmNvZGVQb3MgPT09IC0xKSB7XG5cdFx0XHRcdC8vIHVzZSBuYXRpdmUgZW5jb2RlIG9ubHkgd2hlbiBuZWVkZWRcblx0XHRcdFx0bmF0aXZlRW5jb2RlUG9zID0gcG9zO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChuYXRpdmVFbmNvZGVQb3MgIT09IC0xKSB7XG5cdFx0cmVzICs9IGVuY29kZVVSSUNvbXBvbmVudCh1cmlDb21wb25lbnQuc3Vic3RyaW5nKG5hdGl2ZUVuY29kZVBvcykpO1xuXHR9XG5cblx0cmV0dXJuIHJlcyAhPT0gdW5kZWZpbmVkID8gcmVzIDogdXJpQ29tcG9uZW50O1xufVxuXG5mdW5jdGlvbiBlbmNvZGVVUklDb21wb25lbnRNaW5pbWFsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCByZXM6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChsZXQgcG9zID0gMDsgcG9zIDwgcGF0aC5sZW5ndGg7IHBvcysrKSB7XG5cdFx0Y29uc3QgY29kZSA9IHBhdGguY2hhckNvZGVBdChwb3MpO1xuXHRcdGlmIChjb2RlID09PSBDaGFyQ29kZS5IYXNoIHx8IGNvZGUgPT09IENoYXJDb2RlLlF1ZXN0aW9uTWFyaykge1xuXHRcdFx0aWYgKHJlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlcyA9IHBhdGguc3Vic3RyKDAsIHBvcyk7XG5cdFx0XHR9XG5cdFx0XHRyZXMgKz0gZW5jb2RlVGFibGVbY29kZV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChyZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXMgKz0gcGF0aFtwb3NdO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzICE9PSB1bmRlZmluZWQgPyByZXMgOiBwYXRoO1xufVxuXG4vKipcbiAqIENvbXB1dGUgYGZzUGF0aGAgZm9yIHRoZSBnaXZlbiB1cmlcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVyaVRvRnNQYXRoKHVyaTogVVJJLCBrZWVwRHJpdmVMZXR0ZXJDYXNpbmc6IGJvb2xlYW4pOiBzdHJpbmcge1xuXG5cdGxldCB2YWx1ZTogc3RyaW5nO1xuXHRpZiAodXJpLmF1dGhvcml0eSAmJiB1cmkucGF0aC5sZW5ndGggPiAxICYmIHVyaS5zY2hlbWUgPT09ICdmaWxlJykge1xuXHRcdC8vIHVuYyBwYXRoOiBmaWxlOi8vc2hhcmVzL2MkL2Zhci9ib29cblx0XHR2YWx1ZSA9IGAvLyR7dXJpLmF1dGhvcml0eX0ke3VyaS5wYXRofWA7XG5cdH0gZWxzZSBpZiAoXG5cdFx0dXJpLnBhdGguY2hhckNvZGVBdCgwKSA9PT0gQ2hhckNvZGUuU2xhc2hcblx0XHQmJiAodXJpLnBhdGguY2hhckNvZGVBdCgxKSA+PSBDaGFyQ29kZS5BICYmIHVyaS5wYXRoLmNoYXJDb2RlQXQoMSkgPD0gQ2hhckNvZGUuWiB8fCB1cmkucGF0aC5jaGFyQ29kZUF0KDEpID49IENoYXJDb2RlLmEgJiYgdXJpLnBhdGguY2hhckNvZGVBdCgxKSA8PSBDaGFyQ29kZS56KVxuXHRcdCYmIHVyaS5wYXRoLmNoYXJDb2RlQXQoMikgPT09IENoYXJDb2RlLkNvbG9uXG5cdCkge1xuXHRcdGlmICgha2VlcERyaXZlTGV0dGVyQ2FzaW5nKSB7XG5cdFx0XHQvLyB3aW5kb3dzIGRyaXZlIGxldHRlcjogZmlsZTovLy9jOi9mYXIvYm9vXG5cdFx0XHR2YWx1ZSA9IHVyaS5wYXRoWzFdLnRvTG93ZXJDYXNlKCkgKyB1cmkucGF0aC5zdWJzdHIoMik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbHVlID0gdXJpLnBhdGguc3Vic3RyKDEpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBvdGhlciBwYXRoXG5cdFx0dmFsdWUgPSB1cmkucGF0aDtcblx0fVxuXHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0dmFsdWUgPSB2YWx1ZS5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKTtcblx0fVxuXHRyZXR1cm4gdmFsdWU7XG59XG5cbi8qKlxuICogQ3JlYXRlIHRoZSBleHRlcm5hbCB2ZXJzaW9uIG9mIGEgdXJpXG4gKi9cbmZ1bmN0aW9uIF9hc0Zvcm1hdHRlZCh1cmk6IFVSSSwgc2tpcEVuY29kaW5nOiBib29sZWFuKTogc3RyaW5nIHtcblxuXHRjb25zdCBlbmNvZGVyID0gIXNraXBFbmNvZGluZ1xuXHRcdD8gZW5jb2RlVVJJQ29tcG9uZW50RmFzdFxuXHRcdDogZW5jb2RlVVJJQ29tcG9uZW50TWluaW1hbDtcblxuXHRsZXQgcmVzID0gJyc7XG5cdGxldCB7IHNjaGVtZSwgYXV0aG9yaXR5LCBwYXRoLCBxdWVyeSwgZnJhZ21lbnQgfSA9IHVyaTtcblx0aWYgKHNjaGVtZSkge1xuXHRcdHJlcyArPSBzY2hlbWU7XG5cdFx0cmVzICs9ICc6Jztcblx0fVxuXHRpZiAoYXV0aG9yaXR5IHx8IHNjaGVtZSA9PT0gJ2ZpbGUnKSB7XG5cdFx0cmVzICs9IF9zbGFzaDtcblx0XHRyZXMgKz0gX3NsYXNoO1xuXHR9XG5cdGlmIChhdXRob3JpdHkpIHtcblx0XHRsZXQgaWR4ID0gYXV0aG9yaXR5LmluZGV4T2YoJ0AnKTtcblx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0Ly8gPHVzZXI+QDxhdXRoPlxuXHRcdFx0Y29uc3QgdXNlcmluZm8gPSBhdXRob3JpdHkuc3Vic3RyKDAsIGlkeCk7XG5cdFx0XHRhdXRob3JpdHkgPSBhdXRob3JpdHkuc3Vic3RyKGlkeCArIDEpO1xuXHRcdFx0aWR4ID0gdXNlcmluZm8ubGFzdEluZGV4T2YoJzonKTtcblx0XHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHRcdHJlcyArPSBlbmNvZGVyKHVzZXJpbmZvLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gPHVzZXI+OjxwYXNzPkA8YXV0aD5cblx0XHRcdFx0cmVzICs9IGVuY29kZXIodXNlcmluZm8uc3Vic3RyKDAsIGlkeCksIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRcdHJlcyArPSAnOic7XG5cdFx0XHRcdHJlcyArPSBlbmNvZGVyKHVzZXJpbmZvLnN1YnN0cihpZHggKyAxKSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmVzICs9ICdAJztcblx0XHR9XG5cdFx0YXV0aG9yaXR5ID0gYXV0aG9yaXR5LnRvTG93ZXJDYXNlKCk7XG5cdFx0aWR4ID0gYXV0aG9yaXR5Lmxhc3RJbmRleE9mKCc6Jyk7XG5cdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdHJlcyArPSBlbmNvZGVyKGF1dGhvcml0eSwgZmFsc2UsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyA8YXV0aD46PHBvcnQ+XG5cdFx0XHRyZXMgKz0gZW5jb2RlcihhdXRob3JpdHkuc3Vic3RyKDAsIGlkeCksIGZhbHNlLCB0cnVlKTtcblx0XHRcdHJlcyArPSBhdXRob3JpdHkuc3Vic3RyKGlkeCk7XG5cdFx0fVxuXHR9XG5cdGlmIChwYXRoKSB7XG5cdFx0Ly8gbG93ZXItY2FzZSB3aW5kb3dzIGRyaXZlIGxldHRlcnMgaW4gL0M6L2ZmZiBvciBDOi9mZmZcblx0XHRpZiAocGF0aC5sZW5ndGggPj0gMyAmJiBwYXRoLmNoYXJDb2RlQXQoMCkgPT09IENoYXJDb2RlLlNsYXNoICYmIHBhdGguY2hhckNvZGVBdCgyKSA9PT0gQ2hhckNvZGUuQ29sb24pIHtcblx0XHRcdGNvbnN0IGNvZGUgPSBwYXRoLmNoYXJDb2RlQXQoMSk7XG5cdFx0XHRpZiAoY29kZSA+PSBDaGFyQ29kZS5BICYmIGNvZGUgPD0gQ2hhckNvZGUuWikge1xuXHRcdFx0XHRwYXRoID0gYC8ke1N0cmluZy5mcm9tQ2hhckNvZGUoY29kZSArIDMyKX06JHtwYXRoLnN1YnN0cigzKX1gOyAvLyBcIi9jOlwiLmxlbmd0aCA9PT0gM1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocGF0aC5sZW5ndGggPj0gMiAmJiBwYXRoLmNoYXJDb2RlQXQoMSkgPT09IENoYXJDb2RlLkNvbG9uKSB7XG5cdFx0XHRjb25zdCBjb2RlID0gcGF0aC5jaGFyQ29kZUF0KDApO1xuXHRcdFx0aWYgKGNvZGUgPj0gQ2hhckNvZGUuQSAmJiBjb2RlIDw9IENoYXJDb2RlLlopIHtcblx0XHRcdFx0cGF0aCA9IGAke1N0cmluZy5mcm9tQ2hhckNvZGUoY29kZSArIDMyKX06JHtwYXRoLnN1YnN0cigyKX1gOyAvLyBcIi9jOlwiLmxlbmd0aCA9PT0gM1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBlbmNvZGUgdGhlIHJlc3Qgb2YgdGhlIHBhdGhcblx0XHRyZXMgKz0gZW5jb2RlcihwYXRoLCB0cnVlLCBmYWxzZSk7XG5cdH1cblx0aWYgKHF1ZXJ5KSB7XG5cdFx0cmVzICs9ICc/Jztcblx0XHRyZXMgKz0gZW5jb2RlcihxdWVyeSwgZmFsc2UsIGZhbHNlKTtcblx0fVxuXHRpZiAoZnJhZ21lbnQpIHtcblx0XHRyZXMgKz0gJyMnO1xuXHRcdHJlcyArPSAhc2tpcEVuY29kaW5nID8gZW5jb2RlVVJJQ29tcG9uZW50RmFzdChmcmFnbWVudCwgZmFsc2UsIGZhbHNlKSA6IGZyYWdtZW50O1xuXHR9XG5cdHJldHVybiByZXM7XG59XG5cbi8vIC0tLSBkZWNvZGVcblxuZnVuY3Rpb24gZGVjb2RlVVJJQ29tcG9uZW50R3JhY2VmdWwoc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHR0cnkge1xuXHRcdHJldHVybiBkZWNvZGVVUklDb21wb25lbnQoc3RyKTtcblx0fSBjYXRjaCB7XG5cdFx0aWYgKHN0ci5sZW5ndGggPiAzKSB7XG5cdFx0XHRyZXR1cm4gc3RyLnN1YnN0cigwLCAzKSArIGRlY29kZVVSSUNvbXBvbmVudEdyYWNlZnVsKHN0ci5zdWJzdHIoMykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gc3RyO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBfckVuY29kZWRBc0hleCA9IC8oJVswLTlBLVphLXpdWzAtOUEtWmEtel0pKy9nO1xuXG5mdW5jdGlvbiBwZXJjZW50RGVjb2RlKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFzdHIubWF0Y2goX3JFbmNvZGVkQXNIZXgpKSB7XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXHRyZXR1cm4gc3RyLnJlcGxhY2UoX3JFbmNvZGVkQXNIZXgsIChtYXRjaCkgPT4gZGVjb2RlVVJJQ29tcG9uZW50R3JhY2VmdWwobWF0Y2gpKTtcbn1cblxuLyoqXG4gKiBNYXBwZWQtdHlwZSB0aGF0IHJlcGxhY2VzIGFsbCBvY2N1cnJlbmNlcyBvZiBVUkkgd2l0aCBVcmlDb21wb25lbnRzXG4gKi9cbmV4cG9ydCB0eXBlIFVyaUR0bzxUPiA9IHsgW0sgaW4ga2V5b2YgVF06IFRbS10gZXh0ZW5kcyBVUklcblx0PyBVcmlDb21wb25lbnRzXG5cdDogVXJpRHRvPFRbS10+IH07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixZQUFZLFdBQVc7QUFDdkIsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxpQkFBaUI7QUFDdkIsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxvQkFBb0I7QUFFMUIsU0FBUyxhQUFhLEtBQVUsU0FBeUI7QUFHeEQsTUFB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
