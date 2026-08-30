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
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { LinkComputer } from "../../../../../editor/common/languages/linkComputer.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { TerminalBuiltinLinkType } from "./links.js";
import { convertLinkRangeToBuffer, getXtermLineContent } from "./terminalLinkHelpers.js";
import { getTerminalLinkType } from "./terminalLocalLinkDetector.js";
import { ITerminalLogService } from "../../../../../platform/terminal/common/terminal.js";
import { isString } from "../../../../../base/common/types.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxResolvedLinksInLine"] = 10] = "MaxResolvedLinksInLine";
  return Constants2;
})(Constants || {});
let TerminalUriLinkDetector = class {
  constructor(xterm, _processManager, _linkResolver, _logService, _uriIdentityService, _workspaceContextService) {
    this.xterm = xterm;
    this._processManager = _processManager;
    this._linkResolver = _linkResolver;
    this._logService = _logService;
    this._uriIdentityService = _uriIdentityService;
    this._workspaceContextService = _workspaceContextService;
    // 2048 is the maximum URL length
    this.maxLinkLength = 2048;
  }
  async detect(lines, startLine, endLine) {
    const links = [];
    const linkComputerTarget = new TerminalLinkAdapter(this.xterm, startLine, endLine);
    const computedLinks = LinkComputer.computeLinks(linkComputerTarget);
    let resolvedLinkCount = 0;
    this._logService.trace("terminalUriLinkDetector#detect computedLinks", computedLinks);
    for (const computedLink of computedLinks) {
      const bufferRange = convertLinkRangeToBuffer(lines, this.xterm.cols, computedLink.range, startLine);
      const uri = computedLink.url ? isString(computedLink.url) ? URI.parse(this._excludeLineAndColSuffix(computedLink.url)) : computedLink.url : void 0;
      if (!uri) {
        continue;
      }
      const text = computedLink.url?.toString() || "";
      if (text.length > this.maxLinkLength) {
        continue;
      }
      if (uri.scheme !== Schemas.file) {
        links.push({
          text,
          uri,
          bufferRange,
          type: TerminalBuiltinLinkType.Url
        });
        continue;
      }
      if (uri.authority.length !== 2 && uri.authority.endsWith(":")) {
        continue;
      }
      const uriCandidates = [uri];
      if (uri.authority.length > 0) {
        uriCandidates.push(URI.from({ ...uri, authority: void 0 }));
      }
      this._logService.trace("terminalUriLinkDetector#detect uriCandidates", uriCandidates);
      for (const uriCandidate of uriCandidates) {
        const linkStat = await this._linkResolver.resolveLink(this._processManager, text, uriCandidate);
        if (linkStat) {
          const type = getTerminalLinkType(uriCandidate, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
          const simpleLink = {
            // Use computedLink.url if it's a string to retain the line/col suffix
            text: isString(computedLink.url) ? computedLink.url : linkStat.link,
            uri: uriCandidate,
            bufferRange,
            type
          };
          this._logService.trace("terminalUriLinkDetector#detect verified link", simpleLink);
          links.push(simpleLink);
          resolvedLinkCount++;
          break;
        }
      }
      if (++resolvedLinkCount >= 10 /* MaxResolvedLinksInLine */) {
        break;
      }
    }
    return links;
  }
  _excludeLineAndColSuffix(path) {
    return path.replace(/:\d+(:\d+)?$/, "");
  }
};
TerminalUriLinkDetector.id = "uri";
TerminalUriLinkDetector = __decorateClass([
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IWorkspaceContextService)
], TerminalUriLinkDetector);
class TerminalLinkAdapter {
  constructor(_xterm, _lineStart, _lineEnd) {
    this._xterm = _xterm;
    this._lineStart = _lineStart;
    this._lineEnd = _lineEnd;
  }
  getLineCount() {
    return 1;
  }
  getLineContent() {
    return getXtermLineContent(this._xterm.buffer.active, this._lineStart, this._lineEnd, this._xterm.cols);
  }
}
export {
  TerminalUriLinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsVXJpTGlua0RldGVjdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMaW5rQ29tcHV0ZXJUYXJnZXQsIExpbmtDb21wdXRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xpbmtDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExpbmtEZXRlY3RvciwgSVRlcm1pbmFsTGlua1Jlc29sdmVyLCBJVGVybWluYWxTaW1wbGVMaW5rLCBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSB9IGZyb20gJy4vbGlua3MuanMnO1xuaW1wb3J0IHsgY29udmVydExpbmtSYW5nZVRvQnVmZmVyLCBnZXRYdGVybUxpbmVDb250ZW50IH0gZnJvbSAnLi90ZXJtaW5hbExpbmtIZWxwZXJzLmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsTGlua1R5cGUgfSBmcm9tICcuL3Rlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnVmZmVyTGluZSwgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHQvKipcblx0ICogVGhlIG1heGltdW0gbnVtYmVyIG9mIGxpbmtzIGluIGEgbGluZSB0byByZXNvbHZlIGFnYWluc3QgdGhlIGZpbGUgc3lzdGVtLiBUaGlzIGxpbWl0IGlzIHB1dFxuXHQgKiBpbiBwbGFjZSB0byBhdm9pZCBzZW5kaW5nIGV4Y2Vzc2l2ZSBkYXRhIHdoZW4gcmVtb3RlIGNvbm5lY3Rpb25zIGFyZSBpbiBwbGFjZS5cblx0ICovXG5cdE1heFJlc29sdmVkTGlua3NJbkxpbmUgPSAxMFxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxVcmlMaW5rRGV0ZWN0b3IgaW1wbGVtZW50cyBJVGVybWluYWxMaW5rRGV0ZWN0b3Ige1xuXHRzdGF0aWMgaWQgPSAndXJpJztcblxuXHQvLyAyMDQ4IGlzIHRoZSBtYXhpbXVtIFVSTCBsZW5ndGhcblx0cmVhZG9ubHkgbWF4TGlua0xlbmd0aCA9IDIwNDg7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgeHRlcm06IFRlcm1pbmFsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2Nlc3NNYW5hZ2VyOiBQaWNrPElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLCAnaW5pdGlhbEN3ZCcgfCAnb3MnIHwgJ3JlbW90ZUF1dGhvcml0eScgfCAndXNlckhvbWUnPiAmIHsgYmFja2VuZD86IFBpY2s8SVRlcm1pbmFsQmFja2VuZCwgJ2dldFdzbFBhdGgnPiB9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtSZXNvbHZlcjogSVRlcm1pbmFsTGlua1Jlc29sdmVyLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGRldGVjdChsaW5lczogSUJ1ZmZlckxpbmVbXSwgc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsU2ltcGxlTGlua1tdPiB7XG5cdFx0Y29uc3QgbGlua3M6IElUZXJtaW5hbFNpbXBsZUxpbmtbXSA9IFtdO1xuXG5cdFx0Y29uc3QgbGlua0NvbXB1dGVyVGFyZ2V0ID0gbmV3IFRlcm1pbmFsTGlua0FkYXB0ZXIodGhpcy54dGVybSwgc3RhcnRMaW5lLCBlbmRMaW5lKTtcblx0XHRjb25zdCBjb21wdXRlZExpbmtzID0gTGlua0NvbXB1dGVyLmNvbXB1dGVMaW5rcyhsaW5rQ29tcHV0ZXJUYXJnZXQpO1xuXG5cdFx0bGV0IHJlc29sdmVkTGlua0NvdW50ID0gMDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbFVyaUxpbmtEZXRlY3RvciNkZXRlY3QgY29tcHV0ZWRMaW5rcycsIGNvbXB1dGVkTGlua3MpO1xuXHRcdGZvciAoY29uc3QgY29tcHV0ZWRMaW5rIG9mIGNvbXB1dGVkTGlua3MpIHtcblx0XHRcdGNvbnN0IGJ1ZmZlclJhbmdlID0gY29udmVydExpbmtSYW5nZVRvQnVmZmVyKGxpbmVzLCB0aGlzLnh0ZXJtLmNvbHMsIGNvbXB1dGVkTGluay5yYW5nZSwgc3RhcnRMaW5lKTtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGxpbmsgaXMgd2l0aGluIHRoZSBtb3VzZSBwb3NpdGlvblxuXHRcdFx0Y29uc3QgdXJpID0gY29tcHV0ZWRMaW5rLnVybFxuXHRcdFx0XHQ/IChpc1N0cmluZyhjb21wdXRlZExpbmsudXJsKSA/IFVSSS5wYXJzZSh0aGlzLl9leGNsdWRlTGluZUFuZENvbFN1ZmZpeChjb21wdXRlZExpbmsudXJsKSkgOiBjb21wdXRlZExpbmsudXJsKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRleHQgPSBjb21wdXRlZExpbmsudXJsPy50b1N0cmluZygpIHx8ICcnO1xuXG5cdFx0XHQvLyBEb24ndCB0cnkgcmVzb2x2ZSBhbnkgbGlua3Mgb2YgZXhjZXNzaXZlIGxlbmd0aFxuXHRcdFx0aWYgKHRleHQubGVuZ3RoID4gdGhpcy5tYXhMaW5rTGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgbm9uLWZpbGUgc2NoZW1lIGxpbmtzXG5cdFx0XHRpZiAodXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdGxpbmtzLnB1c2goe1xuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlLFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlVybFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbHRlciBvdXQgVVJJIHdpdGggdW5yZWNvZ25pemVkIGF1dGhvcml0aWVzXG5cdFx0XHRpZiAodXJpLmF1dGhvcml0eS5sZW5ndGggIT09IDIgJiYgdXJpLmF1dGhvcml0eS5lbmRzV2l0aCgnOicpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcyBhIGZhbGxiYWNrIFVSSSwgdHJlYXQgdGhlIGF1dGhvcml0eSBhcyBsb2NhbCB0byB0aGUgd29ya3NwYWNlLiBUaGlzIGlzIHJlcXVpcmVkXG5cdFx0XHQvLyBmb3IgYGxzIC0taHlwZXJsaW5rYCBzdXBwb3J0IGZvciBleGFtcGxlIHdoaWNoIGluY2x1ZGVzIHRoZSBob3N0bmFtZSBpbiB0aGUgVVJJIGxpa2Vcblx0XHRcdC8vIGBmaWxlOi8vU29tZS1Ib3N0bmFtZS9tbnQvYy9mb28vYmFyYC5cblx0XHRcdGNvbnN0IHVyaUNhbmRpZGF0ZXM6IFVSSVtdID0gW3VyaV07XG5cdFx0XHRpZiAodXJpLmF1dGhvcml0eS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHVyaUNhbmRpZGF0ZXMucHVzaChVUkkuZnJvbSh7IC4uLnVyaSwgYXV0aG9yaXR5OiB1bmRlZmluZWQgfSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJdGVyYXRlIG92ZXIgYWxsIGNhbmRpZGF0ZXMsIHB1c2hpbmcgdGhlIGNhbmRpZGF0ZSBvbiB0aGUgZmlyc3QgdGhhdCdzIHZlcmlmaWVkXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCd0ZXJtaW5hbFVyaUxpbmtEZXRlY3RvciNkZXRlY3QgdXJpQ2FuZGlkYXRlcycsIHVyaUNhbmRpZGF0ZXMpO1xuXHRcdFx0Zm9yIChjb25zdCB1cmlDYW5kaWRhdGUgb2YgdXJpQ2FuZGlkYXRlcykge1xuXHRcdFx0XHRjb25zdCBsaW5rU3RhdCA9IGF3YWl0IHRoaXMuX2xpbmtSZXNvbHZlci5yZXNvbHZlTGluayh0aGlzLl9wcm9jZXNzTWFuYWdlciwgdGV4dCwgdXJpQ2FuZGlkYXRlKTtcblxuXHRcdFx0XHQvLyBDcmVhdGUgdGhlIGxpbmsgaWYgdmFsaWRhdGVkXG5cdFx0XHRcdGlmIChsaW5rU3RhdCkge1xuXHRcdFx0XHRcdGNvbnN0IHR5cGUgPSBnZXRUZXJtaW5hbExpbmtUeXBlKHVyaUNhbmRpZGF0ZSwgbGlua1N0YXQuaXNEaXJlY3RvcnksIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZSwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHNpbXBsZUxpbms6IElUZXJtaW5hbFNpbXBsZUxpbmsgPSB7XG5cdFx0XHRcdFx0XHQvLyBVc2UgY29tcHV0ZWRMaW5rLnVybCBpZiBpdCdzIGEgc3RyaW5nIHRvIHJldGFpbiB0aGUgbGluZS9jb2wgc3VmZml4XG5cdFx0XHRcdFx0XHR0ZXh0OiBpc1N0cmluZyhjb21wdXRlZExpbmsudXJsKSA/IGNvbXB1dGVkTGluay51cmwgOiBsaW5rU3RhdC5saW5rLFxuXHRcdFx0XHRcdFx0dXJpOiB1cmlDYW5kaWRhdGUsXG5cdFx0XHRcdFx0XHRidWZmZXJSYW5nZSxcblx0XHRcdFx0XHRcdHR5cGVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ3Rlcm1pbmFsVXJpTGlua0RldGVjdG9yI2RldGVjdCB2ZXJpZmllZCBsaW5rJywgc2ltcGxlTGluayk7XG5cdFx0XHRcdFx0bGlua3MucHVzaChzaW1wbGVMaW5rKTtcblx0XHRcdFx0XHRyZXNvbHZlZExpbmtDb3VudCsrO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0b3AgZWFybHkgaWYgdG9vIG1hbnkgbGlua3MgZXhpc3QgaW4gdGhlIGxpbmVcblx0XHRcdGlmICgrK3Jlc29sdmVkTGlua0NvdW50ID49IENvbnN0YW50cy5NYXhSZXNvbHZlZExpbmtzSW5MaW5lKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBsaW5rcztcblx0fVxuXG5cdHByaXZhdGUgX2V4Y2x1ZGVMaW5lQW5kQ29sU3VmZml4KHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHBhdGgucmVwbGFjZSgvOlxcZCsoOlxcZCspPyQvLCAnJyk7XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxMaW5rQWRhcHRlciBpbXBsZW1lbnRzIElMaW5rQ29tcHV0ZXJUYXJnZXQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF94dGVybTogVGVybWluYWwsXG5cdFx0cHJpdmF0ZSBfbGluZVN0YXJ0OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfbGluZUVuZDogbnVtYmVyXG5cdCkgeyB9XG5cblx0Z2V0TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDE7XG5cdH1cblxuXHRnZXRMaW5lQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBnZXRYdGVybUxpbmVDb250ZW50KHRoaXMuX3h0ZXJtLmJ1ZmZlci5hY3RpdmUsIHRoaXMuX2xpbmVTdGFydCwgdGhpcy5fbGluZUVuZCwgdGhpcy5feHRlcm0uY29scyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUE4QixvQkFBb0I7QUFDbEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBNEUsK0JBQStCO0FBQzNHLFNBQVMsMEJBQTBCLDJCQUEyQjtBQUM5RCxTQUFTLDJCQUEyQjtBQUdwQyxTQUEyQiwyQkFBMkI7QUFDdEQsU0FBUyxnQkFBZ0I7QUFFekIsSUFBVyxZQUFYLGtCQUFXQSxlQUFYO0FBS0MsRUFBQUEsc0JBQUEsNEJBQXlCLE1BQXpCO0FBTFUsU0FBQUE7QUFBQSxHQUFBO0FBUUosSUFBTSwwQkFBTixNQUErRDtBQUFBLEVBTXJFLFlBQ1UsT0FDUSxpQkFDQSxlQUNxQixhQUNBLHFCQUNLLDBCQUMxQztBQU5RO0FBQ1E7QUFDQTtBQUNxQjtBQUNBO0FBQ0s7QUFSNUM7QUFBQSxTQUFTLGdCQUFnQjtBQUFBLEVBVXpCO0FBQUEsRUFFQSxNQUFNLE9BQU8sT0FBc0IsV0FBbUIsU0FBaUQ7QUFDdEcsVUFBTSxRQUErQixDQUFDO0FBRXRDLFVBQU0scUJBQXFCLElBQUksb0JBQW9CLEtBQUssT0FBTyxXQUFXLE9BQU87QUFDakYsVUFBTSxnQkFBZ0IsYUFBYSxhQUFhLGtCQUFrQjtBQUVsRSxRQUFJLG9CQUFvQjtBQUN4QixTQUFLLFlBQVksTUFBTSxnREFBZ0QsYUFBYTtBQUNwRixlQUFXLGdCQUFnQixlQUFlO0FBQ3pDLFlBQU0sY0FBYyx5QkFBeUIsT0FBTyxLQUFLLE1BQU0sTUFBTSxhQUFhLE9BQU8sU0FBUztBQUdsRyxZQUFNLE1BQU0sYUFBYSxNQUNyQixTQUFTLGFBQWEsR0FBRyxJQUFJLElBQUksTUFBTSxLQUFLLHlCQUF5QixhQUFhLEdBQUcsQ0FBQyxJQUFJLGFBQWEsTUFDeEc7QUFFSCxVQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsTUFDRDtBQUVBLFlBQU0sT0FBTyxhQUFhLEtBQUssU0FBUyxLQUFLO0FBRzdDLFVBQUksS0FBSyxTQUFTLEtBQUssZUFBZTtBQUNyQztBQUFBLE1BQ0Q7QUFHQSxVQUFJLElBQUksV0FBVyxRQUFRLE1BQU07QUFDaEMsY0FBTSxLQUFLO0FBQUEsVUFDVjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxNQUFNLHdCQUF3QjtBQUFBLFFBQy9CLENBQUM7QUFDRDtBQUFBLE1BQ0Q7QUFHQSxVQUFJLElBQUksVUFBVSxXQUFXLEtBQUssSUFBSSxVQUFVLFNBQVMsR0FBRyxHQUFHO0FBQzlEO0FBQUEsTUFDRDtBQUtBLFlBQU0sZ0JBQXVCLENBQUMsR0FBRztBQUNqQyxVQUFJLElBQUksVUFBVSxTQUFTLEdBQUc7QUFDN0Isc0JBQWMsS0FBSyxJQUFJLEtBQUssRUFBRSxHQUFHLEtBQUssV0FBVyxPQUFVLENBQUMsQ0FBQztBQUFBLE1BQzlEO0FBR0EsV0FBSyxZQUFZLE1BQU0sZ0RBQWdELGFBQWE7QUFDcEYsaUJBQVcsZ0JBQWdCLGVBQWU7QUFDekMsY0FBTSxXQUFXLE1BQU0sS0FBSyxjQUFjLFlBQVksS0FBSyxpQkFBaUIsTUFBTSxZQUFZO0FBRzlGLFlBQUksVUFBVTtBQUNiLGdCQUFNLE9BQU8sb0JBQW9CLGNBQWMsU0FBUyxhQUFhLEtBQUsscUJBQXFCLEtBQUssd0JBQXdCO0FBQzVILGdCQUFNLGFBQWtDO0FBQUE7QUFBQSxZQUV2QyxNQUFNLFNBQVMsYUFBYSxHQUFHLElBQUksYUFBYSxNQUFNLFNBQVM7QUFBQSxZQUMvRCxLQUFLO0FBQUEsWUFDTDtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQ0EsZUFBSyxZQUFZLE1BQU0sZ0RBQWdELFVBQVU7QUFDakYsZ0JBQU0sS0FBSyxVQUFVO0FBQ3JCO0FBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLFVBQUksRUFBRSxxQkFBcUIsaUNBQWtDO0FBQzVEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEseUJBQXlCLE1BQXNCO0FBQ3RELFdBQU8sS0FBSyxRQUFRLGdCQUFnQixFQUFFO0FBQUEsRUFDdkM7QUFDRDtBQXJHYSx3QkFDTCxLQUFLO0FBREEsMEJBQU47QUFBQSxFQVVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVO0FBdUdiLE1BQU0sb0JBQW1EO0FBQUEsRUFDeEQsWUFDUyxRQUNBLFlBQ0EsVUFDUDtBQUhPO0FBQ0E7QUFDQTtBQUFBLEVBQ0w7QUFBQSxFQUVKLGVBQXVCO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxpQkFBeUI7QUFDeEIsV0FBTyxvQkFBb0IsS0FBSyxPQUFPLE9BQU8sUUFBUSxLQUFLLFlBQVksS0FBSyxVQUFVLEtBQUssT0FBTyxJQUFJO0FBQUEsRUFDdkc7QUFDRDsiLAogICJuYW1lcyI6IFsiQ29uc3RhbnRzIl0KfQo=
