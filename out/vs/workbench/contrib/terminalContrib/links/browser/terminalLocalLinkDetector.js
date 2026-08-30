var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { OS } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { TerminalBuiltinLinkType } from "./links.js";
import { convertLinkRangeToBuffer, getXtermLineContent, getXtermRangesByAttr, osPathModule, updateLinkWithRelativeCwd } from "./terminalLinkHelpers.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { detectLinks } from "./terminalLinkParsing.js";
import { ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxLineLength"] = 2e3] = "MaxLineLength";
  Constants2[Constants2["MaxResolvedLinksInLine"] = 10] = "MaxResolvedLinksInLine";
  Constants2[Constants2["MaxResolvedLinkLength"] = 1024] = "MaxResolvedLinkLength";
  return Constants2;
})(Constants || {});
const fallbackMatchers = [
  // Python style error: File "<path>", line <line>
  /^ *File (?<link>"(?<path>.+)"(, line (?<line>\d+))?)/,
  // Unknown tool #200166: FILE  <path>:<line>:<col>
  /^ +FILE +(?<link>(?<path>.+)(?::(?<line>\d+)(?::(?<col>\d+))?)?)/,
  // Some C++ compile error formats:
  // C:\foo\bar baz(339) : error ...
  // C:\foo\bar baz(339,12) : error ...
  // C:\foo\bar baz(339, 12) : error ...
  // C:\foo\bar baz(339): error ...       [#178584, Visual Studio CL/NVIDIA CUDA compiler]
  // C:\foo\bar baz(339,12): ...
  // C:\foo\bar baz(339, 12): ...
  /^(?<link>(?<path>.+)\((?<line>\d+)(?:, ?(?<col>\d+))?\)) ?:/,
  // C:\foo/bar baz:339 : error ...
  // C:\foo/bar baz:339:12 : error ...
  // C:\foo/bar baz:339: error ...
  // C:\foo/bar baz:339:12: error ...     [#178584, Clang]
  /^(?<link>(?<path>.+):(?<line>\d+)(?::(?<col>\d+))?) ?:/,
  // PowerShell and cmd prompt
  /^(?:PS\s+)?(?<link>(?<path>[^>]+))>/,
  // The whole line is the path
  /^ *(?<link>(?<path>.+))/
];
let TerminalLocalLinkDetector = class {
  constructor(xterm, _capabilities, _processManager, _linkResolver, _logService, _uriIdentityService, _workspaceContextService) {
    this.xterm = xterm;
    this._capabilities = _capabilities;
    this._processManager = _processManager;
    this._linkResolver = _linkResolver;
    this._logService = _logService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
    // This was chosen as a reasonable maximum line length given the tradeoff between performance
    // and how likely it is to encounter such a large line length. Some useful reference points:
    // - Window old max length: 260 ($MAX_PATH)
    // - Linux max length: 4096 ($PATH_MAX)
    this.maxLinkLength = 500;
  }
  async detect(lines, startLine, endLine) {
    const links = [];
    const text = getXtermLineContent(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
    if (text === "" || text.length > 2e3 /* MaxLineLength */) {
      return [];
    }
    let stringIndex = -1;
    let resolvedLinkCount = 0;
    const os = this._processManager.os || OS;
    const parsedLinks = detectLinks(text, os);
    this._logService.trace("terminalLocalLinkDetector#detect text", text);
    this._logService.trace("terminalLocalLinkDetector#detect parsedLinks", parsedLinks);
    for (const parsedLink of parsedLinks) {
      if (parsedLink.path.text.length > 1024 /* MaxResolvedLinkLength */) {
        continue;
      }
      const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
        startColumn: (parsedLink.prefix?.index ?? parsedLink.path.index) + 1,
        startLineNumber: 1,
        endColumn: parsedLink.path.index + parsedLink.path.text.length + (parsedLink.suffix?.suffix.text.length ?? 0) + 1,
        endLineNumber: 1
      }, startLine);
      const linkCandidates = [];
      const osPath = osPathModule(os);
      const isUri = parsedLink.path.text.startsWith("file://");
      if (osPath.isAbsolute(parsedLink.path.text) || parsedLink.path.text.startsWith("~") || isUri) {
        linkCandidates.push(parsedLink.path.text);
      } else {
        if (this._capabilities.has(TerminalCapability.CommandDetection)) {
          const absolutePath = updateLinkWithRelativeCwd(this._capabilities, bufferRange.start.y, parsedLink.path.text, osPath, this._logService);
          if (absolutePath) {
            linkCandidates.push(...absolutePath);
          }
        }
        if (linkCandidates.length === 0) {
          linkCandidates.push(parsedLink.path.text);
          if (parsedLink.path.text.match(/^(\.\.[\/\\])+/)) {
            linkCandidates.push(parsedLink.path.text.replace(/^(\.\.[\/\\])+/, ""));
          }
        }
      }
      const specialEndCharRegex = /[\[\]"'\.]$/;
      const trimRangeMap = /* @__PURE__ */ new Map();
      const specialEndLinkCandidates = [];
      for (const candidate of linkCandidates) {
        let previous = candidate;
        let removed = previous.replace(specialEndCharRegex, "");
        let trimRange = 0;
        while (removed !== previous) {
          if (!parsedLink.suffix) {
            trimRange++;
          }
          specialEndLinkCandidates.push(removed);
          trimRangeMap.set(removed, trimRange);
          previous = removed;
          removed = removed.replace(specialEndCharRegex, "");
        }
      }
      linkCandidates.push(...specialEndLinkCandidates);
      this._logService.trace("terminalLocalLinkDetector#detect linkCandidates", linkCandidates);
      const simpleLink = await this._validateAndGetLink(void 0, bufferRange, linkCandidates, trimRangeMap);
      if (simpleLink) {
        simpleLink.parsedLink = parsedLink;
        simpleLink.text = text.substring(
          parsedLink.prefix?.index ?? parsedLink.path.index,
          parsedLink.suffix ? parsedLink.suffix.suffix.index + parsedLink.suffix.suffix.text.length : parsedLink.path.index + parsedLink.path.text.length
        );
        this._logService.trace("terminalLocalLinkDetector#detect verified link", simpleLink);
        links.push(simpleLink);
      }
      if (++resolvedLinkCount >= 10 /* MaxResolvedLinksInLine */) {
        break;
      }
    }
    if (links.length === 0) {
      for (const matcher of fallbackMatchers) {
        const match = text.match(matcher);
        const group = match?.groups;
        if (!group) {
          continue;
        }
        const link = group?.link;
        const path = group?.path;
        const line = group?.line;
        const col = group?.col;
        if (!link || !path) {
          continue;
        }
        if (link.length > 1024 /* MaxResolvedLinkLength */) {
          continue;
        }
        stringIndex = text.indexOf(link);
        const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
          startColumn: stringIndex + 1,
          startLineNumber: 1,
          endColumn: stringIndex + link.length + 1,
          endLineNumber: 1
        }, startLine);
        const suffix = line ? `:${line}${col ? `:${col}` : ""}` : "";
        const simpleLink = await this._validateAndGetLink(`${path}${suffix}`, bufferRange, [path]);
        if (simpleLink) {
          links.push(simpleLink);
        }
      }
    }
    if (links.length === 0) {
      const rangeCandidates = getXtermRangesByAttr(this.xterm.buffer.active, startLine, endLine, this.xterm.cols);
      for (const rangeCandidate of rangeCandidates) {
        let text2 = "";
        for (let y = rangeCandidate.start.y; y <= rangeCandidate.end.y; y++) {
          const line = this.xterm.buffer.active.getLine(y);
          if (!line) {
            break;
          }
          const lineStartX = y === rangeCandidate.start.y ? rangeCandidate.start.x : 0;
          const lineEndX = y === rangeCandidate.end.y ? rangeCandidate.end.x : this.xterm.cols - 1;
          text2 += line.translateToString(false, lineStartX, lineEndX);
        }
        rangeCandidate.start.x++;
        rangeCandidate.start.y++;
        rangeCandidate.end.y++;
        const simpleLink = await this._validateAndGetLink(text2, rangeCandidate, [text2]);
        if (simpleLink) {
          links.push(simpleLink);
        }
        if (++resolvedLinkCount >= 10 /* MaxResolvedLinksInLine */) {
          break;
        }
      }
    }
    return links;
  }
  async _validateLinkCandidates(linkCandidates) {
    for (const link of linkCandidates) {
      let uri;
      if (link.startsWith("file://")) {
        uri = URI.parse(link);
      }
      const result = await this._linkResolver.resolveLink(this._processManager, link, uri);
      if (result) {
        return result;
      }
    }
    return void 0;
  }
  /**
   * Validates a set of link candidates and returns a link if validated.
   * @param linkText The link text, this should be undefined to use the link stat value
   * @param trimRangeMap A map of link candidates to the amount of buffer range they need trimmed.
   */
  async _validateAndGetLink(linkText, bufferRange, linkCandidates, trimRangeMap) {
    const linkStat = await this._validateLinkCandidates(linkCandidates);
    if (linkStat) {
      const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
      const trimRange = trimRangeMap?.get(linkStat.link);
      if (trimRange) {
        bufferRange.end.x -= trimRange;
        if (bufferRange.end.x < 0) {
          bufferRange.end.y--;
          bufferRange.end.x += this.xterm.cols;
        }
      }
      return {
        text: linkText ?? linkStat.link,
        uri: linkStat.uri,
        bufferRange,
        type
      };
    }
    return void 0;
  }
};
TerminalLocalLinkDetector.id = "local";
TerminalLocalLinkDetector = __decorateClass([
  __decorateParam(4, ITerminalLogService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IWorkspaceContextService)
], TerminalLocalLinkDetector);
function getTerminalLinkType(uri, isDirectory, uriIdentityService, workspaceContextService) {
  if (isDirectory) {
    const folders = workspaceContextService.getWorkspace().folders;
    for (let i = 0; i < folders.length; i++) {
      if (uriIdentityService.extUri.isEqualOrParent(uri, folders[i].uri)) {
        return TerminalBuiltinLinkType.LocalFolderInWorkspace;
      }
    }
    return TerminalBuiltinLinkType.LocalFolderOutsideWorkspace;
  } else {
    return TerminalBuiltinLinkType.LocalFile;
  }
}
export {
  TerminalLocalLinkDetector,
  getTerminalLinkType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExpbmtEZXRlY3RvciwgSVRlcm1pbmFsTGlua1Jlc29sdmVyLCBJVGVybWluYWxTaW1wbGVMaW5rLCBSZXNvbHZlZExpbmssIFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlIH0gZnJvbSAnLi9saW5rcy5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0TGlua1JhbmdlVG9CdWZmZXIsIGdldFh0ZXJtTGluZUNvbnRlbnQsIGdldFh0ZXJtUmFuZ2VzQnlBdHRyLCBvc1BhdGhNb2R1bGUsIHVwZGF0ZUxpbmtXaXRoUmVsYXRpdmVDd2QgfSBmcm9tICcuL3Rlcm1pbmFsTGlua0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElCdWZmZXJMaW5lLCBJQnVmZmVyUmFuZ2UsIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGRldGVjdExpbmtzIH0gZnJvbSAnLi90ZXJtaW5hbExpbmtQYXJzaW5nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEJhY2tlbmQsIElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBUaGUgbWF4IGxpbmUgbGVuZ3RoIHRvIHRyeSBleHRyYWN0IHdvcmQgbGlua3MgZnJvbS5cblx0ICovXG5cdE1heExpbmVMZW5ndGggPSAyMDAwLFxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBudW1iZXIgb2YgbGlua3MgaW4gYSBsaW5lIHRvIHJlc29sdmUgYWdhaW5zdCB0aGUgZmlsZSBzeXN0ZW0uIFRoaXMgbGltaXQgaXMgcHV0XG5cdCAqIGluIHBsYWNlIHRvIGF2b2lkIHNlbmRpbmcgZXhjZXNzaXZlIGRhdGEgd2hlbiByZW1vdGUgY29ubmVjdGlvbnMgYXJlIGluIHBsYWNlLlxuXHQgKi9cblx0TWF4UmVzb2x2ZWRMaW5rc0luTGluZSA9IDEwLFxuXG5cdC8qKlxuXHQgKiBUaGUgbWF4aW11bSBsZW5ndGggb2YgYSBsaW5rIHRvIHJlc29sdmUgYWdhaW5zdCB0aGUgZmlsZSBzeXN0ZW0uIFRoaXMgbGltaXQgaXMgcHV0IGluIHBsYWNlXG5cdCAqIHRvIGF2b2lkIHNlbmRpbmcgZXhjZXNzaXZlIGRhdGEgd2hlbiByZW1vdGUgY29ubmVjdGlvbnMgYXJlIGluIHBsYWNlLlxuXHQgKi9cblx0TWF4UmVzb2x2ZWRMaW5rTGVuZ3RoID0gMTAyNCxcbn1cblxuY29uc3QgZmFsbGJhY2tNYXRjaGVyczogUmVnRXhwW10gPSBbXG5cdC8vIFB5dGhvbiBzdHlsZSBlcnJvcjogRmlsZSBcIjxwYXRoPlwiLCBsaW5lIDxsaW5lPlxuXHQvXiAqRmlsZSAoPzxsaW5rPlwiKD88cGF0aD4uKylcIigsIGxpbmUgKD88bGluZT5cXGQrKSk/KS8sXG5cdC8vIFVua25vd24gdG9vbCAjMjAwMTY2OiBGSUxFICA8cGF0aD46PGxpbmU+Ojxjb2w+XG5cdC9eICtGSUxFICsoPzxsaW5rPig/PHBhdGg+LispKD86Oig/PGxpbmU+XFxkKykoPzo6KD88Y29sPlxcZCspKT8pPykvLFxuXHQvLyBTb21lIEMrKyBjb21waWxlIGVycm9yIGZvcm1hdHM6XG5cdC8vIEM6XFxmb29cXGJhciBiYXooMzM5KSA6IGVycm9yIC4uLlxuXHQvLyBDOlxcZm9vXFxiYXIgYmF6KDMzOSwxMikgOiBlcnJvciAuLi5cblx0Ly8gQzpcXGZvb1xcYmFyIGJheigzMzksIDEyKSA6IGVycm9yIC4uLlxuXHQvLyBDOlxcZm9vXFxiYXIgYmF6KDMzOSk6IGVycm9yIC4uLiAgICAgICBbIzE3ODU4NCwgVmlzdWFsIFN0dWRpbyBDTC9OVklESUEgQ1VEQSBjb21waWxlcl1cblx0Ly8gQzpcXGZvb1xcYmFyIGJheigzMzksMTIpOiAuLi5cblx0Ly8gQzpcXGZvb1xcYmFyIGJheigzMzksIDEyKTogLi4uXG5cdC9eKD88bGluaz4oPzxwYXRoPi4rKVxcKCg/PGxpbmU+XFxkKykoPzosID8oPzxjb2w+XFxkKykpP1xcKSkgPzovLFxuXHQvLyBDOlxcZm9vL2JhciBiYXo6MzM5IDogZXJyb3IgLi4uXG5cdC8vIEM6XFxmb28vYmFyIGJhejozMzk6MTIgOiBlcnJvciAuLi5cblx0Ly8gQzpcXGZvby9iYXIgYmF6OjMzOTogZXJyb3IgLi4uXG5cdC8vIEM6XFxmb28vYmFyIGJhejozMzk6MTI6IGVycm9yIC4uLiAgICAgWyMxNzg1ODQsIENsYW5nXVxuXHQvXig/PGxpbms+KD88cGF0aD4uKyk6KD88bGluZT5cXGQrKSg/OjooPzxjb2w+XFxkKykpPykgPzovLFxuXHQvLyBQb3dlclNoZWxsIGFuZCBjbWQgcHJvbXB0XG5cdC9eKD86UFNcXHMrKT8oPzxsaW5rPig/PHBhdGg+W14+XSspKT4vLFxuXHQvLyBUaGUgd2hvbGUgbGluZSBpcyB0aGUgcGF0aFxuXHQvXiAqKD88bGluaz4oPzxwYXRoPi4rKSkvXG5dO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxMb2NhbExpbmtEZXRlY3RvciBpbXBsZW1lbnRzIElUZXJtaW5hbExpbmtEZXRlY3RvciB7XG5cdHN0YXRpYyBpZCA9ICdsb2NhbCc7XG5cblx0Ly8gVGhpcyB3YXMgY2hvc2VuIGFzIGEgcmVhc29uYWJsZSBtYXhpbXVtIGxpbmUgbGVuZ3RoIGdpdmVuIHRoZSB0cmFkZW9mZiBiZXR3ZWVuIHBlcmZvcm1hbmNlXG5cdC8vIGFuZCBob3cgbGlrZWx5IGl0IGlzIHRvIGVuY291bnRlciBzdWNoIGEgbGFyZ2UgbGluZSBsZW5ndGguIFNvbWUgdXNlZnVsIHJlZmVyZW5jZSBwb2ludHM6XG5cdC8vIC0gV2luZG93IG9sZCBtYXggbGVuZ3RoOiAyNjAgKCRNQVhfUEFUSClcblx0Ly8gLSBMaW51eCBtYXggbGVuZ3RoOiA0MDk2ICgkUEFUSF9NQVgpXG5cdHJlYWRvbmx5IG1heExpbmtMZW5ndGggPSA1MDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgeHRlcm06IFRlcm1pbmFsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NhcGFiaWxpdGllczogSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2Nlc3NNYW5hZ2VyOiBQaWNrPElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLCAnaW5pdGlhbEN3ZCcgfCAnb3MnIHwgJ3JlbW90ZUF1dGhvcml0eScgfCAndXNlckhvbWUnPiAmIHsgYmFja2VuZD86IFBpY2s8SVRlcm1pbmFsQmFja2VuZCwgJ2dldFdzbFBhdGgnPiB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtSZXNvbHZlcjogSVRlcm1pbmFsTGlua1Jlc29sdmVyLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGRldGVjdChsaW5lczogSUJ1ZmZlckxpbmVbXSwgc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsU2ltcGxlTGlua1tdPiB7XG5cdFx0Y29uc3QgbGlua3M6IElUZXJtaW5hbFNpbXBsZUxpbmtbXSA9IFtdO1xuXG5cdFx0Ly8gR2V0IHRoZSB0ZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSB3cmFwcGVkIGxpbmVcblx0XHRjb25zdCB0ZXh0ID0gZ2V0WHRlcm1MaW5lQ29udGVudCh0aGlzLnh0ZXJtLmJ1ZmZlci5hY3RpdmUsIHN0YXJ0TGluZSwgZW5kTGluZSwgdGhpcy54dGVybS5jb2xzKTtcblx0XHRpZiAodGV4dCA9PT0gJycgfHwgdGV4dC5sZW5ndGggPiBDb25zdGFudHMuTWF4TGluZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCBzdHJpbmdJbmRleCA9IC0xO1xuXHRcdGxldCByZXNvbHZlZExpbmtDb3VudCA9IDA7XG5cblx0XHRjb25zdCBvcyA9IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9zIHx8IE9TO1xuXHRcdGNvbnN0IHBhcnNlZExpbmtzID0gZGV0ZWN0TGlua3ModGV4dCwgb3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ3Rlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IjZGV0ZWN0IHRleHQnLCB0ZXh0KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbExvY2FsTGlua0RldGVjdG9yI2RldGVjdCBwYXJzZWRMaW5rcycsIHBhcnNlZExpbmtzKTtcblx0XHRmb3IgKGNvbnN0IHBhcnNlZExpbmsgb2YgcGFyc2VkTGlua3MpIHtcblxuXHRcdFx0Ly8gRG9uJ3QgdHJ5IHJlc29sdmUgYW55IGxpbmtzIG9mIGV4Y2Vzc2l2ZSBsZW5ndGhcblx0XHRcdGlmIChwYXJzZWRMaW5rLnBhdGgudGV4dC5sZW5ndGggPiBDb25zdGFudHMuTWF4UmVzb2x2ZWRMaW5rTGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb252ZXJ0IHRoZSBsaW5rIHRleHQncyBzdHJpbmcgaW5kZXggaW50byBhIHdyYXBwZWQgYnVmZmVyIHJhbmdlXG5cdFx0XHRjb25zdCBidWZmZXJSYW5nZSA9IGNvbnZlcnRMaW5rUmFuZ2VUb0J1ZmZlcihsaW5lcywgdGhpcy54dGVybS5jb2xzLCB7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAocGFyc2VkTGluay5wcmVmaXg/LmluZGV4ID8/IHBhcnNlZExpbmsucGF0aC5pbmRleCkgKyAxLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogcGFyc2VkTGluay5wYXRoLmluZGV4ICsgcGFyc2VkTGluay5wYXRoLnRleHQubGVuZ3RoICsgKHBhcnNlZExpbmsuc3VmZml4Py5zdWZmaXgudGV4dC5sZW5ndGggPz8gMCkgKyAxLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxXG5cdFx0XHR9LCBzdGFydExpbmUpO1xuXG5cdFx0XHQvLyBHZXQgYSBzaW5nbGUgbGluayBjYW5kaWRhdGUgaWYgdGhlIGN3ZCBvZiB0aGUgbGluZSBpcyBrbm93blxuXHRcdFx0Y29uc3QgbGlua0NhbmRpZGF0ZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBvc1BhdGggPSBvc1BhdGhNb2R1bGUob3MpO1xuXHRcdFx0Y29uc3QgaXNVcmkgPSBwYXJzZWRMaW5rLnBhdGgudGV4dC5zdGFydHNXaXRoKCdmaWxlOi8vJyk7XG5cdFx0XHRpZiAob3NQYXRoLmlzQWJzb2x1dGUocGFyc2VkTGluay5wYXRoLnRleHQpIHx8IHBhcnNlZExpbmsucGF0aC50ZXh0LnN0YXJ0c1dpdGgoJ34nKSB8fCBpc1VyaSkge1xuXHRcdFx0XHRsaW5rQ2FuZGlkYXRlcy5wdXNoKHBhcnNlZExpbmsucGF0aC50ZXh0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGFic29sdXRlUGF0aCA9IHVwZGF0ZUxpbmtXaXRoUmVsYXRpdmVDd2QodGhpcy5fY2FwYWJpbGl0aWVzLCBidWZmZXJSYW5nZS5zdGFydC55LCBwYXJzZWRMaW5rLnBhdGgudGV4dCwgb3NQYXRoLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHQvLyBPbmx5IGFkZCBhIHNpbmdsZSBleGFjdCBsaW5rIGNhbmRpZGF0ZSBpZiB0aGUgY3dkIGlzIGF2YWlsYWJsZSwgdGhpcyBtYXkgY2F1c2Vcblx0XHRcdFx0XHQvLyB0aGUgbGluayB0byBub3QgYmUgcmVzb2x2ZWQgYnV0IHRoYXQgc2hvdWxkIG9ubHkgb2NjdXIgd2hlbiB0aGUgYWN0dWFsIGZpbGUgZG9lc1xuXHRcdFx0XHRcdC8vIG5vdCBleGlzdC4gRG9pbmcgb3RoZXJ3aXNlIGNvdWxkIGNhdXNlIHVuZXhwZWN0ZWQgcmVzdWx0cyB3aGVyZSBoYW5kbGluZyB2aWEgdGhlXG5cdFx0XHRcdFx0Ly8gd29yZCBsaW5rIGRldGVjdG9yIGlzIHByZWZlcmFibGUuXG5cdFx0XHRcdFx0aWYgKGFic29sdXRlUGF0aCkge1xuXHRcdFx0XHRcdFx0bGlua0NhbmRpZGF0ZXMucHVzaCguLi5hYnNvbHV0ZVBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBGYWxsYmFjayB0byByZXNvbHZpbmcgYWdhaW5zdCB0aGUgaW5pdGlhbCBjd2QsIHJlbW92aW5nIGFueSByZWxhdGl2ZSBkaXJlY3RvcnkgcHJlZml4ZXNcblx0XHRcdFx0aWYgKGxpbmtDYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGxpbmtDYW5kaWRhdGVzLnB1c2gocGFyc2VkTGluay5wYXRoLnRleHQpO1xuXHRcdFx0XHRcdGlmIChwYXJzZWRMaW5rLnBhdGgudGV4dC5tYXRjaCgvXihcXC5cXC5bXFwvXFxcXF0pKy8pKSB7XG5cdFx0XHRcdFx0XHRsaW5rQ2FuZGlkYXRlcy5wdXNoKHBhcnNlZExpbmsucGF0aC50ZXh0LnJlcGxhY2UoL14oXFwuXFwuW1xcL1xcXFxdKSsvLCAnJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBhbnkgY2FuZGlkYXRlcyBlbmQgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCBhcmUgbGlrZWx5IHRvIG5vdCBiZSBwYXJ0IG9mIHRoZVxuXHRcdFx0Ly8gbGluaywgYWRkIGEgY2FuZGlkYXRlIGV4Y2x1ZGluZyB0aGVtLlxuXHRcdFx0Y29uc3Qgc3BlY2lhbEVuZENoYXJSZWdleCA9IC9bXFxbXFxdXCInXFwuXSQvO1xuXHRcdFx0Y29uc3QgdHJpbVJhbmdlTWFwOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3Qgc3BlY2lhbEVuZExpbmtDYW5kaWRhdGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgbGlua0NhbmRpZGF0ZXMpIHtcblx0XHRcdFx0bGV0IHByZXZpb3VzID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRsZXQgcmVtb3ZlZCA9IHByZXZpb3VzLnJlcGxhY2Uoc3BlY2lhbEVuZENoYXJSZWdleCwgJycpO1xuXHRcdFx0XHRsZXQgdHJpbVJhbmdlID0gMDtcblx0XHRcdFx0d2hpbGUgKHJlbW92ZWQgIT09IHByZXZpb3VzKSB7XG5cdFx0XHRcdFx0Ly8gT25seSB0cmltIHRoZSBsaW5rIGlmIHRoZXJlIGlzIG5vIHN1ZmZpeCwgb3RoZXJ3aXNlIHRoZSB1bmRlcmxpbmUgd291bGQgYmUgaW5jb3JyZWN0XG5cdFx0XHRcdFx0aWYgKCFwYXJzZWRMaW5rLnN1ZmZpeCkge1xuXHRcdFx0XHRcdFx0dHJpbVJhbmdlKys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNwZWNpYWxFbmRMaW5rQ2FuZGlkYXRlcy5wdXNoKHJlbW92ZWQpO1xuXHRcdFx0XHRcdHRyaW1SYW5nZU1hcC5zZXQocmVtb3ZlZCwgdHJpbVJhbmdlKTtcblx0XHRcdFx0XHRwcmV2aW91cyA9IHJlbW92ZWQ7XG5cdFx0XHRcdFx0cmVtb3ZlZCA9IHJlbW92ZWQucmVwbGFjZShzcGVjaWFsRW5kQ2hhclJlZ2V4LCAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxpbmtDYW5kaWRhdGVzLnB1c2goLi4uc3BlY2lhbEVuZExpbmtDYW5kaWRhdGVzKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ3Rlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IjZGV0ZWN0IGxpbmtDYW5kaWRhdGVzJywgbGlua0NhbmRpZGF0ZXMpO1xuXG5cdFx0XHQvLyBWYWxpZGF0ZSB0aGUgcGF0aCBhbmQgY29udmVydCB0byB0aGUgb3V0Z29pbmcgdHlwZVxuXHRcdFx0Y29uc3Qgc2ltcGxlTGluayA9IGF3YWl0IHRoaXMuX3ZhbGlkYXRlQW5kR2V0TGluayh1bmRlZmluZWQsIGJ1ZmZlclJhbmdlLCBsaW5rQ2FuZGlkYXRlcywgdHJpbVJhbmdlTWFwKTtcblx0XHRcdGlmIChzaW1wbGVMaW5rKSB7XG5cdFx0XHRcdHNpbXBsZUxpbmsucGFyc2VkTGluayA9IHBhcnNlZExpbms7XG5cdFx0XHRcdHNpbXBsZUxpbmsudGV4dCA9IHRleHQuc3Vic3RyaW5nKFxuXHRcdFx0XHRcdHBhcnNlZExpbmsucHJlZml4Py5pbmRleCA/PyBwYXJzZWRMaW5rLnBhdGguaW5kZXgsXG5cdFx0XHRcdFx0cGFyc2VkTGluay5zdWZmaXggPyBwYXJzZWRMaW5rLnN1ZmZpeC5zdWZmaXguaW5kZXggKyBwYXJzZWRMaW5rLnN1ZmZpeC5zdWZmaXgudGV4dC5sZW5ndGggOiBwYXJzZWRMaW5rLnBhdGguaW5kZXggKyBwYXJzZWRMaW5rLnBhdGgudGV4dC5sZW5ndGhcblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgndGVybWluYWxMb2NhbExpbmtEZXRlY3RvciNkZXRlY3QgdmVyaWZpZWQgbGluaycsIHNpbXBsZUxpbmspO1xuXHRcdFx0XHRsaW5rcy5wdXNoKHNpbXBsZUxpbmspO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdG9wIGVhcmx5IGlmIHRvbyBtYW55IGxpbmtzIGV4aXN0IGluIHRoZSBsaW5lXG5cdFx0XHRpZiAoKytyZXNvbHZlZExpbmtDb3VudCA+PSBDb25zdGFudHMuTWF4UmVzb2x2ZWRMaW5rc0luTGluZSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNYXRjaCBhZ2FpbnN0IHRoZSBmYWxsYmFjayBtYXRjaGVycyB3aGljaCBhcmUgbWFpbmx5IGRlc2lnbmVkIHRvIGNhdGNoIHBhdGhzIHdpdGggc3BhY2VzXG5cdFx0Ly8gdGhhdCBhcmVuJ3QgcG9zc2libGUgdXNpbmcgdGhlIHJlZ3VsYXIgbWVjaGFuaXNtLlxuXHRcdGlmIChsaW5rcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGZvciAoY29uc3QgbWF0Y2hlciBvZiBmYWxsYmFja01hdGNoZXJzKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gdGV4dC5tYXRjaChtYXRjaGVyKTtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBtYXRjaD8uZ3JvdXBzO1xuXHRcdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGluayA9IGdyb3VwPy5saW5rO1xuXHRcdFx0XHRjb25zdCBwYXRoID0gZ3JvdXA/LnBhdGg7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBncm91cD8ubGluZTtcblx0XHRcdFx0Y29uc3QgY29sID0gZ3JvdXA/LmNvbDtcblx0XHRcdFx0aWYgKCFsaW5rIHx8ICFwYXRoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEb24ndCB0cnkgcmVzb2x2ZSBhbnkgbGlua3Mgb2YgZXhjZXNzaXZlIGxlbmd0aFxuXHRcdFx0XHRpZiAobGluay5sZW5ndGggPiBDb25zdGFudHMuTWF4UmVzb2x2ZWRMaW5rTGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDb252ZXJ0IHRoZSBsaW5rIHRleHQncyBzdHJpbmcgaW5kZXggaW50byBhIHdyYXBwZWQgYnVmZmVyIHJhbmdlXG5cdFx0XHRcdHN0cmluZ0luZGV4ID0gdGV4dC5pbmRleE9mKGxpbmspO1xuXHRcdFx0XHRjb25zdCBidWZmZXJSYW5nZSA9IGNvbnZlcnRMaW5rUmFuZ2VUb0J1ZmZlcihsaW5lcywgdGhpcy54dGVybS5jb2xzLCB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHN0cmluZ0luZGV4ICsgMSxcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBzdHJpbmdJbmRleCArIGxpbmsubGVuZ3RoICsgMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxXG5cdFx0XHRcdH0sIHN0YXJ0TGluZSk7XG5cblx0XHRcdFx0Ly8gVmFsaWRhdGUgYW5kIGFkZCBsaW5rXG5cdFx0XHRcdGNvbnN0IHN1ZmZpeCA9IGxpbmUgPyBgOiR7bGluZX0ke2NvbCA/IGA6JHtjb2x9YCA6ICcnfWAgOiAnJztcblx0XHRcdFx0Y29uc3Qgc2ltcGxlTGluayA9IGF3YWl0IHRoaXMuX3ZhbGlkYXRlQW5kR2V0TGluayhgJHtwYXRofSR7c3VmZml4fWAsIGJ1ZmZlclJhbmdlLCBbcGF0aF0pO1xuXHRcdFx0XHRpZiAoc2ltcGxlTGluaykge1xuXHRcdFx0XHRcdGxpbmtzLnB1c2goc2ltcGxlTGluayk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNvbWV0aW1lcyBsaW5rcyBhcmUgc3R5bGVkIHNwZWNpYWxseSBpbiB0aGUgdGVybWluYWwgbGlrZSB1bmRlcmxpbmVkIG9yIGJvbGRlZCwgdHJ5IHNwbGl0XG5cdFx0Ly8gdGhlIGxpbmUgYnkgYXR0cmlidXRlcyBhbmQgdGVzdCB3aGV0aGVyIGl0IG1hdGNoZXMgYSBwYXRoXG5cdFx0aWYgKGxpbmtzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgcmFuZ2VDYW5kaWRhdGVzID0gZ2V0WHRlcm1SYW5nZXNCeUF0dHIodGhpcy54dGVybS5idWZmZXIuYWN0aXZlLCBzdGFydExpbmUsIGVuZExpbmUsIHRoaXMueHRlcm0uY29scyk7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlQ2FuZGlkYXRlIG9mIHJhbmdlQ2FuZGlkYXRlcykge1xuXHRcdFx0XHRsZXQgdGV4dCA9ICcnO1xuXHRcdFx0XHRmb3IgKGxldCB5ID0gcmFuZ2VDYW5kaWRhdGUuc3RhcnQueTsgeSA8PSByYW5nZUNhbmRpZGF0ZS5lbmQueTsgeSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMueHRlcm0uYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKHkpO1xuXHRcdFx0XHRcdGlmICghbGluZSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGxpbmVTdGFydFggPSB5ID09PSByYW5nZUNhbmRpZGF0ZS5zdGFydC55ID8gcmFuZ2VDYW5kaWRhdGUuc3RhcnQueCA6IDA7XG5cdFx0XHRcdFx0Y29uc3QgbGluZUVuZFggPSB5ID09PSByYW5nZUNhbmRpZGF0ZS5lbmQueSA/IHJhbmdlQ2FuZGlkYXRlLmVuZC54IDogdGhpcy54dGVybS5jb2xzIC0gMTtcblx0XHRcdFx0XHR0ZXh0ICs9IGxpbmUudHJhbnNsYXRlVG9TdHJpbmcoZmFsc2UsIGxpbmVTdGFydFgsIGxpbmVFbmRYKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhBQ0s6IEFkanVzdCB0byAxLWJhc2VkIGZvciBsaW5rIEFQSVxuXHRcdFx0XHRyYW5nZUNhbmRpZGF0ZS5zdGFydC54Kys7XG5cdFx0XHRcdHJhbmdlQ2FuZGlkYXRlLnN0YXJ0LnkrKztcblx0XHRcdFx0cmFuZ2VDYW5kaWRhdGUuZW5kLnkrKztcblxuXHRcdFx0XHQvLyBWYWxpZGF0ZSBhbmQgYWRkIGxpbmtcblx0XHRcdFx0Y29uc3Qgc2ltcGxlTGluayA9IGF3YWl0IHRoaXMuX3ZhbGlkYXRlQW5kR2V0TGluayh0ZXh0LCByYW5nZUNhbmRpZGF0ZSwgW3RleHRdKTtcblx0XHRcdFx0aWYgKHNpbXBsZUxpbmspIHtcblx0XHRcdFx0XHRsaW5rcy5wdXNoKHNpbXBsZUxpbmspO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU3RvcCBlYXJseSBpZiB0b28gbWFueSBsaW5rcyBleGlzdCBpbiB0aGUgbGluZVxuXHRcdFx0XHRpZiAoKytyZXNvbHZlZExpbmtDb3VudCA+PSBDb25zdGFudHMuTWF4UmVzb2x2ZWRMaW5rc0luTGluZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmtzO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgX3ZhbGlkYXRlTGlua0NhbmRpZGF0ZXMobGlua0NhbmRpZGF0ZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxSZXNvbHZlZExpbmsgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IGxpbmsgb2YgbGlua0NhbmRpZGF0ZXMpIHtcblx0XHRcdGxldCB1cmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChsaW5rLnN0YXJ0c1dpdGgoJ2ZpbGU6Ly8nKSkge1xuXHRcdFx0XHR1cmkgPSBVUkkucGFyc2UobGluayk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9saW5rUmVzb2x2ZXIucmVzb2x2ZUxpbmsodGhpcy5fcHJvY2Vzc01hbmFnZXIsIGxpbmssIHVyaSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIGEgc2V0IG9mIGxpbmsgY2FuZGlkYXRlcyBhbmQgcmV0dXJucyBhIGxpbmsgaWYgdmFsaWRhdGVkLlxuXHQgKiBAcGFyYW0gbGlua1RleHQgVGhlIGxpbmsgdGV4dCwgdGhpcyBzaG91bGQgYmUgdW5kZWZpbmVkIHRvIHVzZSB0aGUgbGluayBzdGF0IHZhbHVlXG5cdCAqIEBwYXJhbSB0cmltUmFuZ2VNYXAgQSBtYXAgb2YgbGluayBjYW5kaWRhdGVzIHRvIHRoZSBhbW91bnQgb2YgYnVmZmVyIHJhbmdlIHRoZXkgbmVlZCB0cmltbWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdmFsaWRhdGVBbmRHZXRMaW5rKGxpbmtUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQsIGJ1ZmZlclJhbmdlOiBJQnVmZmVyUmFuZ2UsIGxpbmtDYW5kaWRhdGVzOiBzdHJpbmdbXSwgdHJpbVJhbmdlTWFwPzogTWFwPHN0cmluZywgbnVtYmVyPik6IFByb21pc2U8SVRlcm1pbmFsU2ltcGxlTGluayB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGxpbmtTdGF0ID0gYXdhaXQgdGhpcy5fdmFsaWRhdGVMaW5rQ2FuZGlkYXRlcyhsaW5rQ2FuZGlkYXRlcyk7XG5cdFx0aWYgKGxpbmtTdGF0KSB7XG5cdFx0XHRjb25zdCB0eXBlID0gZ2V0VGVybWluYWxMaW5rVHlwZShsaW5rU3RhdC51cmksIGxpbmtTdGF0LmlzRGlyZWN0b3J5LCB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdFx0Ly8gT2Zmc2V0IHRoZSBidWZmZXIgcmFuZ2UgaWYgdGhlIGxpbmsgcmFuZ2Ugd2FzIHRyaW1tZWRcblx0XHRcdGNvbnN0IHRyaW1SYW5nZSA9IHRyaW1SYW5nZU1hcD8uZ2V0KGxpbmtTdGF0LmxpbmspO1xuXHRcdFx0aWYgKHRyaW1SYW5nZSkge1xuXHRcdFx0XHRidWZmZXJSYW5nZS5lbmQueCAtPSB0cmltUmFuZ2U7XG5cdFx0XHRcdGlmIChidWZmZXJSYW5nZS5lbmQueCA8IDApIHtcblx0XHRcdFx0XHRidWZmZXJSYW5nZS5lbmQueS0tO1xuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlLmVuZC54ICs9IHRoaXMueHRlcm0uY29scztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0ZXh0OiBsaW5rVGV4dCA/PyBsaW5rU3RhdC5saW5rLFxuXHRcdFx0XHR1cmk6IGxpbmtTdGF0LnVyaSxcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IGJ1ZmZlclJhbmdlLFxuXHRcdFx0XHR0eXBlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUZXJtaW5hbExpbmtUeXBlKFxuXHR1cmk6IFVSSSxcblx0aXNEaXJlY3Rvcnk6IGJvb2xlYW4sXG5cdHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuKTogVGVybWluYWxCdWlsdGluTGlua1R5cGUge1xuXHRpZiAoaXNEaXJlY3RvcnkpIHtcblx0XHQvLyBDaGVjayBpZiBkaXJlY3RvcnkgaXMgaW5zaWRlIHdvcmtzcGFjZVxuXHRcdGNvbnN0IGZvbGRlcnMgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZm9sZGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHVyaSwgZm9sZGVyc1tpXS51cmkpKSB7XG5cdFx0XHRcdHJldHVybiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZvbGRlckluV29ya3NwYWNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGb2xkZXJPdXRzaWRlV29ya3NwYWNlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxVQUFVO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUEwRiwrQkFBK0I7QUFDekgsU0FBUywwQkFBMEIscUJBQXFCLHNCQUFzQixjQUFjLGlDQUFpQztBQUM3SCxTQUFtQywwQkFBMEI7QUFHN0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBMkIsMkJBQTJCO0FBRXRELElB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
