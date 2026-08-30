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
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { convertLinkRangeToBuffer, getXtermLineContent } from "./terminalLinkHelpers.js";
import { getTerminalLinkType } from "./terminalLocalLinkDetector.js";
import { ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxLineLength"] = 2e3] = "MaxLineLength";
  Constants2[Constants2["MaxResolvedLinkLength"] = 1024] = "MaxResolvedLinkLength";
  return Constants2;
})(Constants || {});
const lineNumberPrefixMatchers = [
  // Ripgrep:
  //   /some/file
  //   16:searchresult
  //   16:    searchresult
  // Eslint:
  //   /some/file
  //     16:5  error ...
  /^ *(?<link>(?<line>\d+):(?<col>\d+)?)/
];
const gitDiffMatchers = [
  // --- a/some/file
  // +++ b/some/file
  // @@ -8,11 +8,11 @@ file content...
  /^(?<link>@@ .+ \+(?<toFileLine>\d+),(?<toFileCount>\d+) @@)/
];
let TerminalMultiLineLinkDetector = class {
  constructor(xterm, _processManager, _linkResolver, _logService, _uriIdentityService, _workspaceContextService) {
    this.xterm = xterm;
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
    this._logService.trace("terminalMultiLineLinkDetector#detect text", text);
    for (const matcher of lineNumberPrefixMatchers) {
      const match = text.match(matcher);
      const group = match?.groups;
      if (!group) {
        continue;
      }
      const link = group?.link;
      const line = group?.line;
      const col = group?.col;
      if (!link || line === void 0) {
        continue;
      }
      if (link.length > 1024 /* MaxResolvedLinkLength */) {
        continue;
      }
      this._logService.trace("terminalMultiLineLinkDetector#detect candidate", link);
      let possiblePath;
      for (let index = startLine - 1; index >= 0; index--) {
        if (this.xterm.buffer.active.getLine(index).isWrapped) {
          continue;
        }
        const text2 = getXtermLineContent(this.xterm.buffer.active, index, index, this.xterm.cols);
        if (!text2.match(/^\s*\d/)) {
          possiblePath = text2;
          break;
        }
      }
      if (!possiblePath) {
        continue;
      }
      const linkStat = await this._linkResolver.resolveLink(this._processManager, possiblePath);
      if (linkStat) {
        const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
        const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
          startColumn: 1,
          startLineNumber: 1,
          endColumn: 1 + text.length,
          endLineNumber: 1
        }, startLine);
        const simpleLink = {
          text: link,
          uri: linkStat.uri,
          selection: {
            startLineNumber: parseInt(line),
            startColumn: col ? parseInt(col) : 1
          },
          disableTrimColon: true,
          bufferRange,
          type
        };
        this._logService.trace("terminalMultiLineLinkDetector#detect verified link", simpleLink);
        links.push(simpleLink);
        break;
      }
    }
    if (links.length === 0) {
      for (const matcher of gitDiffMatchers) {
        const match = text.match(matcher);
        const group = match?.groups;
        if (!group) {
          continue;
        }
        const link = group?.link;
        const toFileLine = group?.toFileLine;
        const toFileCount = group?.toFileCount;
        if (!link || toFileLine === void 0) {
          continue;
        }
        if (link.length > 1024 /* MaxResolvedLinkLength */) {
          continue;
        }
        this._logService.trace("terminalMultiLineLinkDetector#detect candidate", link);
        let possiblePath;
        for (let index = startLine - 1; index >= 0; index--) {
          if (this.xterm.buffer.active.getLine(index).isWrapped) {
            continue;
          }
          const text2 = getXtermLineContent(this.xterm.buffer.active, index, index, this.xterm.cols);
          const match2 = text2.match(/\+\+\+ b\/(?<path>.+)/);
          if (match2) {
            possiblePath = match2.groups?.path;
            break;
          }
        }
        if (!possiblePath) {
          continue;
        }
        const linkStat = await this._linkResolver.resolveLink(this._processManager, possiblePath);
        if (linkStat) {
          const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
          const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, {
            startColumn: 1,
            startLineNumber: 1,
            endColumn: 1 + link.length,
            endLineNumber: 1
          }, startLine);
          const simpleLink = {
            text: link,
            uri: linkStat.uri,
            selection: {
              startLineNumber: parseInt(toFileLine),
              startColumn: 1,
              endLineNumber: parseInt(toFileLine) + parseInt(toFileCount)
            },
            bufferRange,
            type
          };
          this._logService.trace("terminalMultiLineLinkDetector#detect verified link", simpleLink);
          links.push(simpleLink);
          break;
        }
      }
    }
    return links;
  }
};
TerminalMultiLineLinkDetector.id = "multiline";
TerminalMultiLineLinkDetector = __decorateClass([
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IWorkspaceContextService)
], TerminalMultiLineLinkDetector);
export {
  TerminalMultiLineLinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxMaW5rRGV0ZWN0b3IsIElUZXJtaW5hbExpbmtSZXNvbHZlciwgSVRlcm1pbmFsU2ltcGxlTGluayB9IGZyb20gJy4vbGlua3MuanMnO1xuaW1wb3J0IHsgY29udmVydExpbmtSYW5nZVRvQnVmZmVyLCBnZXRYdGVybUxpbmVDb250ZW50IH0gZnJvbSAnLi90ZXJtaW5hbExpbmtIZWxwZXJzLmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsTGlua1R5cGUgfSBmcm9tICcuL3Rlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnVmZmVyTGluZSwgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBtYXggbGluZSBsZW5ndGggdG8gdHJ5IGV4dHJhY3Qgd29yZCBsaW5rcyBmcm9tLlxuXHQgKi9cblx0TWF4TGluZUxlbmd0aCA9IDIwMDAsXG5cblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIGxlbmd0aCBvZiBhIGxpbmsgdG8gcmVzb2x2ZSBhZ2FpbnN0IHRoZSBmaWxlIHN5c3RlbS4gVGhpcyBsaW1pdCBpcyBwdXQgaW4gcGxhY2Vcblx0ICogdG8gYXZvaWQgc2VuZGluZyBleGNlc3NpdmUgZGF0YSB3aGVuIHJlbW90ZSBjb25uZWN0aW9ucyBhcmUgaW4gcGxhY2UuXG5cdCAqL1xuXHRNYXhSZXNvbHZlZExpbmtMZW5ndGggPSAxMDI0LFxufVxuXG5jb25zdCBsaW5lTnVtYmVyUHJlZml4TWF0Y2hlcnMgPSBbXG5cdC8vIFJpcGdyZXA6XG5cdC8vICAgL3NvbWUvZmlsZVxuXHQvLyAgIDE2OnNlYXJjaHJlc3VsdFxuXHQvLyAgIDE2OiAgICBzZWFyY2hyZXN1bHRcblx0Ly8gRXNsaW50OlxuXHQvLyAgIC9zb21lL2ZpbGVcblx0Ly8gICAgIDE2OjUgIGVycm9yIC4uLlxuXHQvXiAqKD88bGluaz4oPzxsaW5lPlxcZCspOig/PGNvbD5cXGQrKT8pL1xuXTtcblxuY29uc3QgZ2l0RGlmZk1hdGNoZXJzID0gW1xuXHQvLyAtLS0gYS9zb21lL2ZpbGVcblx0Ly8gKysrIGIvc29tZS9maWxlXG5cdC8vIEBAIC04LDExICs4LDExIEBAIGZpbGUgY29udGVudC4uLlxuXHQvXig/PGxpbms+QEAgLisgXFwrKD88dG9GaWxlTGluZT5cXGQrKSwoPzx0b0ZpbGVDb3VudD5cXGQrKSBAQCkvXG5dO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IgaW1wbGVtZW50cyBJVGVybWluYWxMaW5rRGV0ZWN0b3Ige1xuXHRzdGF0aWMgaWQgPSAnbXVsdGlsaW5lJztcblxuXHQvLyBUaGlzIHdhcyBjaG9zZW4gYXMgYSByZWFzb25hYmxlIG1heGltdW0gbGluZSBsZW5ndGggZ2l2ZW4gdGhlIHRyYWRlb2ZmIGJldHdlZW4gcGVyZm9ybWFuY2Vcblx0Ly8gYW5kIGhvdyBsaWtlbHkgaXQgaXMgdG8gZW5jb3VudGVyIHN1Y2ggYSBsYXJnZSBsaW5lIGxlbmd0aC4gU29tZSB1c2VmdWwgcmVmZXJlbmNlIHBvaW50czpcblx0Ly8gLSBXaW5kb3cgb2xkIG1heCBsZW5ndGg6IDI2MCAoJE1BWF9QQVRIKVxuXHQvLyAtIExpbnV4IG1heCBsZW5ndGg6IDQwOTYgKCRQQVRIX01BWClcblx0cmVhZG9ubHkgbWF4TGlua0xlbmd0aCA9IDUwMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB4dGVybTogVGVybWluYWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvY2Vzc01hbmFnZXI6IFBpY2s8SVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIsICdpbml0aWFsQ3dkJyB8ICdvcycgfCAncmVtb3RlQXV0aG9yaXR5JyB8ICd1c2VySG9tZSc+ICYgeyBiYWNrZW5kPzogUGljazxJVGVybWluYWxCYWNrZW5kLCAnZ2V0V3NsUGF0aCc+IH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGlua1Jlc29sdmVyOiBJVGVybWluYWxMaW5rUmVzb2x2ZXIsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgZGV0ZWN0KGxpbmVzOiBJQnVmZmVyTGluZVtdLCBzdGFydExpbmU6IG51bWJlciwgZW5kTGluZTogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxTaW1wbGVMaW5rW10+IHtcblx0XHRjb25zdCBsaW5rczogSVRlcm1pbmFsU2ltcGxlTGlua1tdID0gW107XG5cblx0XHQvLyBHZXQgdGhlIHRleHQgcmVwcmVzZW50YXRpb24gb2YgdGhlIHdyYXBwZWQgbGluZVxuXHRcdGNvbnN0IHRleHQgPSBnZXRYdGVybUxpbmVDb250ZW50KHRoaXMueHRlcm0uYnVmZmVyLmFjdGl2ZSwgc3RhcnRMaW5lLCBlbmRMaW5lLCB0aGlzLnh0ZXJtLmNvbHMpO1xuXHRcdGlmICh0ZXh0ID09PSAnJyB8fCB0ZXh0Lmxlbmd0aCA+IENvbnN0YW50cy5NYXhMaW5lTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgndGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IjZGV0ZWN0IHRleHQnLCB0ZXh0KTtcblxuXHRcdC8vIE1hdGNoIGFnYWluc3QgdGhlIGZhbGxiYWNrIG1hdGNoZXJzIHdoaWNoIGFyZSBtYWlubHkgZGVzaWduZWQgdG8gY2F0Y2ggcGF0aHMgd2l0aCBzcGFjZXNcblx0XHQvLyB0aGF0IGFyZW4ndCBwb3NzaWJsZSB1c2luZyB0aGUgcmVndWxhciBtZWNoYW5pc20uXG5cdFx0Zm9yIChjb25zdCBtYXRjaGVyIG9mIGxpbmVOdW1iZXJQcmVmaXhNYXRjaGVycykge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0ZXh0Lm1hdGNoKG1hdGNoZXIpO1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBtYXRjaD8uZ3JvdXBzO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmsgPSBncm91cD8ubGluaztcblx0XHRcdGNvbnN0IGxpbmUgPSBncm91cD8ubGluZTtcblx0XHRcdGNvbnN0IGNvbCA9IGdyb3VwPy5jb2w7XG5cdFx0XHRpZiAoIWxpbmsgfHwgbGluZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCB0cnkgcmVzb2x2ZSBhbnkgbGlua3Mgb2YgZXhjZXNzaXZlIGxlbmd0aFxuXHRcdFx0aWYgKGxpbmsubGVuZ3RoID4gQ29uc3RhbnRzLk1heFJlc29sdmVkTGlua0xlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgndGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IjZGV0ZWN0IGNhbmRpZGF0ZScsIGxpbmspO1xuXG5cdFx0XHQvLyBTY2FuIHVwIGxvb2tpbmcgZm9yIHRoZSBmaXJzdCBsaW5lIHRoYXQgY291bGQgYmUgYSBwYXRoXG5cdFx0XHRsZXQgcG9zc2libGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IHN0YXJ0TGluZSAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdFx0Ly8gSWdub3JlIGxpbmVzIHRoYXQgYXJlbid0IGF0IHRoZSBiZWdpbm5pbmcgb2YgYSB3cmFwcGVkIGxpbmVcblx0XHRcdFx0aWYgKHRoaXMueHRlcm0uYnVmZmVyLmFjdGl2ZS5nZXRMaW5lKGluZGV4KSEuaXNXcmFwcGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGV4dCA9IGdldFh0ZXJtTGluZUNvbnRlbnQodGhpcy54dGVybS5idWZmZXIuYWN0aXZlLCBpbmRleCwgaW5kZXgsIHRoaXMueHRlcm0uY29scyk7XG5cdFx0XHRcdGlmICghdGV4dC5tYXRjaCgvXlxccypcXGQvKSkge1xuXHRcdFx0XHRcdHBvc3NpYmxlUGF0aCA9IHRleHQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghcG9zc2libGVQYXRoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgZmlyc3Qgbm9uLW1hdGNoaW5nIGxpbmUgaXMgYW4gYWJzb2x1dGUgb3IgcmVsYXRpdmUgbGlua1xuXHRcdFx0Y29uc3QgbGlua1N0YXQgPSBhd2FpdCB0aGlzLl9saW5rUmVzb2x2ZXIucmVzb2x2ZUxpbmsodGhpcy5fcHJvY2Vzc01hbmFnZXIsIHBvc3NpYmxlUGF0aCk7XG5cdFx0XHRpZiAobGlua1N0YXQpIHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IGdldFRlcm1pbmFsTGlua1R5cGUobGlua1N0YXQudXJpLCBsaW5rU3RhdC5pc0RpcmVjdG9yeSwgdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHRcdFx0Ly8gQ29udmVydCB0aGUgZW50aXJlIGxpbmUncyB0ZXh0IHN0cmluZyBpbmRleCBpbnRvIGEgd3JhcHBlZCBidWZmZXIgcmFuZ2Vcblx0XHRcdFx0Y29uc3QgYnVmZmVyUmFuZ2UgPSBjb252ZXJ0TGlua1JhbmdlVG9CdWZmZXIobGluZXMsIHRoaXMueHRlcm0uY29scywge1xuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDEgKyB0ZXh0Lmxlbmd0aCxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxXG5cdFx0XHRcdH0sIHN0YXJ0TGluZSk7XG5cblx0XHRcdFx0Y29uc3Qgc2ltcGxlTGluazogSVRlcm1pbmFsU2ltcGxlTGluayA9IHtcblx0XHRcdFx0XHR0ZXh0OiBsaW5rLFxuXHRcdFx0XHRcdHVyaTogbGlua1N0YXQudXJpLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBwYXJzZUludChsaW5lKSxcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBjb2wgPyBwYXJzZUludChjb2wpIDogMVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzYWJsZVRyaW1Db2xvbjogdHJ1ZSxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogYnVmZmVyUmFuZ2UsXG5cdFx0XHRcdFx0dHlwZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvciNkZXRlY3QgdmVyaWZpZWQgbGluaycsIHNpbXBsZUxpbmspO1xuXHRcdFx0XHRsaW5rcy5wdXNoKHNpbXBsZUxpbmspO1xuXG5cdFx0XHRcdC8vIEJyZWFrIG9uIHRoZSBmaXJzdCBtYXRjaFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGlua3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1hdGNoZXIgb2YgZ2l0RGlmZk1hdGNoZXJzKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoID0gdGV4dC5tYXRjaChtYXRjaGVyKTtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBtYXRjaD8uZ3JvdXBzO1xuXHRcdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGluayA9IGdyb3VwPy5saW5rO1xuXHRcdFx0XHRjb25zdCB0b0ZpbGVMaW5lID0gZ3JvdXA/LnRvRmlsZUxpbmU7XG5cdFx0XHRcdGNvbnN0IHRvRmlsZUNvdW50ID0gZ3JvdXA/LnRvRmlsZUNvdW50O1xuXHRcdFx0XHRpZiAoIWxpbmsgfHwgdG9GaWxlTGluZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEb24ndCB0cnkgcmVzb2x2ZSBhbnkgbGlua3Mgb2YgZXhjZXNzaXZlIGxlbmd0aFxuXHRcdFx0XHRpZiAobGluay5sZW5ndGggPiBDb25zdGFudHMuTWF4UmVzb2x2ZWRMaW5rTGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvciNkZXRlY3QgY2FuZGlkYXRlJywgbGluayk7XG5cblxuXHRcdFx0XHQvLyBTY2FuIHVwIGxvb2tpbmcgZm9yIHRoZSBmaXJzdCBsaW5lIHRoYXQgY291bGQgYmUgYSBwYXRoXG5cdFx0XHRcdGxldCBwb3NzaWJsZVBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Zm9yIChsZXQgaW5kZXggPSBzdGFydExpbmUgLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG5cdFx0XHRcdFx0Ly8gSWdub3JlIGxpbmVzIHRoYXQgYXJlbid0IGF0IHRoZSBiZWdpbm5pbmcgb2YgYSB3cmFwcGVkIGxpbmVcblx0XHRcdFx0XHRpZiAodGhpcy54dGVybS5idWZmZXIuYWN0aXZlLmdldExpbmUoaW5kZXgpIS5pc1dyYXBwZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gZ2V0WHRlcm1MaW5lQ29udGVudCh0aGlzLnh0ZXJtLmJ1ZmZlci5hY3RpdmUsIGluZGV4LCBpbmRleCwgdGhpcy54dGVybS5jb2xzKTtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IHRleHQubWF0Y2goL1xcK1xcK1xcKyBiXFwvKD88cGF0aD4uKykvKTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdHBvc3NpYmxlUGF0aCA9IG1hdGNoLmdyb3Vwcz8ucGF0aDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXBvc3NpYmxlUGF0aCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGZpcnN0IG5vbi1tYXRjaGluZyBsaW5lIGlzIGFuIGFic29sdXRlIG9yIHJlbGF0aXZlIGxpbmtcblx0XHRcdFx0Y29uc3QgbGlua1N0YXQgPSBhd2FpdCB0aGlzLl9saW5rUmVzb2x2ZXIucmVzb2x2ZUxpbmsodGhpcy5fcHJvY2Vzc01hbmFnZXIsIHBvc3NpYmxlUGF0aCk7XG5cdFx0XHRcdGlmIChsaW5rU3RhdCkge1xuXHRcdFx0XHRcdGNvbnN0IHR5cGUgPSBnZXRUZXJtaW5hbExpbmtUeXBlKGxpbmtTdGF0LnVyaSwgbGlua1N0YXQuaXNEaXJlY3RvcnksIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXG5cdFx0XHRcdFx0Ly8gQ29udmVydCB0aGUgbGluayB0byB0aGUgYnVmZmVyIHJhbmdlXG5cdFx0XHRcdFx0Y29uc3QgYnVmZmVyUmFuZ2UgPSBjb252ZXJ0TGlua1JhbmdlVG9CdWZmZXIobGluZXMsIHRoaXMueHRlcm0uY29scywge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IDEgKyBsaW5rLmxlbmd0aCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDFcblx0XHRcdFx0XHR9LCBzdGFydExpbmUpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc2ltcGxlTGluazogSVRlcm1pbmFsU2ltcGxlTGluayA9IHtcblx0XHRcdFx0XHRcdHRleHQ6IGxpbmssXG5cdFx0XHRcdFx0XHR1cmk6IGxpbmtTdGF0LnVyaSxcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHBhcnNlSW50KHRvRmlsZUxpbmUpLFxuXHRcdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogcGFyc2VJbnQodG9GaWxlTGluZSkgKyBwYXJzZUludCh0b0ZpbGVDb3VudClcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRidWZmZXJSYW5nZTogYnVmZmVyUmFuZ2UsXG5cdFx0XHRcdFx0XHR0eXBlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvciNkZXRlY3QgdmVyaWZpZWQgbGluaycsIHNpbXBsZUxpbmspO1xuXHRcdFx0XHRcdGxpbmtzLnB1c2goc2ltcGxlTGluayk7XG5cblx0XHRcdFx0XHQvLyBCcmVhayBvbiB0aGUgZmlyc3QgbWF0Y2hcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsaW5rcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLDBCQUEwQiwyQkFBMkI7QUFDOUQsU0FBUywyQkFBMkI7QUFHcEMsU0FBMkIsMkJBQTJCO0FBRXRELElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUlDLEVBQUFBLHNCQUFBLG1CQUFnQixPQUFoQjtBQU1BLEVBQUFBLHNCQUFBLDJCQUF3QixRQUF4QjtBQVZVLFNBQUFBO0FBQUEsR0FBQTtBQWFYLE1BQU0sMkJBQTJCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFB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O0FBQ3RDO0FBQUEsUUFDRDtBQUdBLFlBQUksS0FBSyxTQUFTLGtDQUFpQztBQUNsRDtBQUFBLFFBQ0Q7QUFFQSxhQUFLLFlBQVksTUFBTSxrREFBa0QsSUFBSTtBQUk3RSxZQUFJO0FBQ0osaUJBQVMsUUFBUSxZQUFZLEdBQUcsU0FBUyxHQUFHLFNBQVM7QUFFcEQsY0FBSSxLQUFLLE1BQU0sT0FBTyxPQUFPLFFBQVEsS0FBSyxFQUFHLFdBQVc7QUFDdkQ7QUFBQSxVQUNEO0FBQ0EsZ0JBQU1BLFFBQU8sb0JBQW9CLEtBQUssTUFBTSxPQUFPLFFBQVEsT0FBTyxPQUFPLEtBQUssTUFBTSxJQUFJO0FBQ3hGLGdCQUFNQyxTQUFRRCxNQUFLLE1BQU0sdUJBQXVCO0FBQ2hELGNBQUlDLFFBQU87QUFDViwyQkFBZUEsT0FBTSxRQUFRO0FBQzdCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLFFBQ0Q7QUFHQSxjQUFNLFdBQVcsTUFBTSxLQUFLLGNBQWMsWUFBWSxLQUFLLGlCQUFpQixZQUFZO0FBQ3hGLFlBQUksVUFBVTtBQUNiLGdCQUFNLE9BQU8sb0JBQW9CLFNBQVMsS0FBSyxTQUFTLGFBQWEsS0FBSyxxQkFBcUIsS0FBSyx3QkFBd0I7QUFHNUgsZ0JBQU0sY0FBYyx5QkFBeUIsT0FBTyxLQUFLLE1BQU0sTUFBTTtBQUFBLFlBQ3BFLGFBQWE7QUFBQSxZQUNiLGlCQUFpQjtBQUFBLFlBQ2pCLFdBQVcsSUFBSSxLQUFLO0FBQUEsWUFDcEIsZUFBZTtBQUFBLFVBQ2hCLEdBQUcsU0FBUztBQUVaLGdCQUFNLGFBQWtDO0FBQUEsWUFDdkMsTUFBTTtBQUFBLFlBQ04sS0FBSyxTQUFTO0FBQUEsWUFDZCxXQUFXO0FBQUEsY0FDVixpQkFBaUIsU0FBUyxVQUFVO0FBQUEsY0FDcEMsYUFBYTtBQUFBLGNBQ2IsZUFBZSxTQUFTLFVBQVUsSUFBSSxTQUFTLFdBQVc7QUFBQSxZQUMzRDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUNBLGVBQUssWUFBWSxNQUFNLHNEQUFzRCxVQUFVO0FBQ3ZGLGdCQUFNLEtBQUssVUFBVTtBQUdyQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFoTGEsOEJBQ0wsS0FBSztBQURBLGdDQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FmVTsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIiwgInRleHQiLCAibWF0Y2giXQp9Cg==
