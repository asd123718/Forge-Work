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
import { removeLinkSuffix, removeLinkQueryString, winDrivePrefix } from "./terminalLinkParsing.js";
import { URI } from "../../../../../base/common/uri.js";
import { Schemas } from "../../../../../base/common/network.js";
import { isWindows, OperatingSystem, OS } from "../../../../../base/common/platform.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { posix, win32 } from "../../../../../base/common/path.js";
import { mainWindow } from "../../../../../base/browser/window.js";
let TerminalLinkResolver = class {
  constructor(_fileService) {
    this._fileService = _fileService;
    // Link cache could be shared across all terminals, but that could lead to weird results when
    // both local and remote terminals are present
    this._resolvedLinkCaches = /* @__PURE__ */ new Map();
  }
  async resolveLink(processManager, link, uri) {
    if (uri && uri.scheme === Schemas.file && processManager.remoteAuthority) {
      uri = uri.with({
        scheme: Schemas.vscodeRemote,
        authority: processManager.remoteAuthority
      });
    }
    let cache = this._resolvedLinkCaches.get(processManager.remoteAuthority ?? "");
    if (!cache) {
      cache = new LinkCache();
      this._resolvedLinkCaches.set(processManager.remoteAuthority ?? "", cache);
    }
    const cached = cache.get(uri || link);
    if (cached !== void 0) {
      return cached;
    }
    if (uri) {
      try {
        const stat = await this._fileService.stat(uri);
        const result = { uri, link, isDirectory: stat.isDirectory };
        cache.set(uri, result);
        return result;
      } catch (e) {
        cache.set(uri, null);
        return null;
      }
    }
    let linkUrl = removeLinkSuffix(link);
    linkUrl = removeLinkQueryString(linkUrl);
    if (linkUrl.length === 0) {
      cache.set(link, null);
      return null;
    }
    if (isWindows && link.match(/^\/mnt\/[a-z]/i) && processManager.backend) {
      linkUrl = await processManager.backend.getWslPath(linkUrl, "unix-to-win");
    } else if (isWindows && link.match(/^(?:\/\/|\\\\)wsl(?:\$|\.localhost)(\/|\\)/)) {
    } else {
      const preprocessedLink = this._preprocessPath(linkUrl, processManager.initialCwd, processManager.os, processManager.userHome);
      if (!preprocessedLink) {
        cache.set(link, null);
        return null;
      }
      linkUrl = preprocessedLink;
    }
    try {
      let uri2;
      if (processManager.remoteAuthority) {
        uri2 = URI.from({
          scheme: Schemas.vscodeRemote,
          authority: processManager.remoteAuthority,
          path: linkUrl
        });
      } else {
        uri2 = URI.file(linkUrl);
      }
      try {
        const stat = await this._fileService.stat(uri2);
        const result = { uri: uri2, link, isDirectory: stat.isDirectory };
        cache.set(link, result);
        return result;
      } catch (e) {
        cache.set(link, null);
        return null;
      }
    } catch {
      cache.set(link, null);
      return null;
    }
  }
  _preprocessPath(link, initialCwd, os, userHome) {
    const osPath = this._getOsPath(os);
    if (link.charAt(0) === "~") {
      if (!userHome) {
        return null;
      }
      link = osPath.join(userHome, link.substring(1));
    } else if (link.charAt(0) !== "/" && link.charAt(0) !== "~") {
      if (os === OperatingSystem.Windows) {
        if (!link.match("^" + winDrivePrefix) && !link.startsWith("\\\\?\\")) {
          if (!initialCwd) {
            return null;
          }
          link = osPath.join(initialCwd, link);
        } else {
          link = link.replace(/^\\\\\?\\/, "");
        }
      } else {
        if (!initialCwd) {
          return null;
        }
        link = osPath.join(initialCwd, link);
      }
    }
    link = osPath.normalize(link);
    return link;
  }
  _getOsPath(os) {
    return (os ?? OS) === OperatingSystem.Windows ? win32 : posix;
  }
};
TerminalLinkResolver = __decorateClass([
  __decorateParam(0, IFileService)
], TerminalLinkResolver);
var LinkCacheConstants = /* @__PURE__ */ ((LinkCacheConstants2) => {
  LinkCacheConstants2[LinkCacheConstants2["TTL"] = 1e4] = "TTL";
  return LinkCacheConstants2;
})(LinkCacheConstants || {});
class LinkCache {
  constructor() {
    this._cache = /* @__PURE__ */ new Map();
    this._cacheTilTimeout = 0;
  }
  set(link, value) {
    if (this._cacheTilTimeout) {
      mainWindow.clearTimeout(this._cacheTilTimeout);
    }
    this._cacheTilTimeout = mainWindow.setTimeout(() => this._cache.clear(), 1e4 /* TTL */);
    this._cache.set(this._getKey(link), value);
  }
  get(link) {
    return this._cache.get(this._getKey(link));
  }
  _getKey(link) {
    if (URI.isUri(link)) {
      return link.toString();
    }
    return link;
  }
}
export {
  TerminalLinkResolver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXGJyb3dzZXJcXHRlcm1pbmFsTGlua1Jlc29sdmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVRlcm1pbmFsTGlua1Jlc29sdmVyLCBSZXNvbHZlZExpbmsgfSBmcm9tICcuL2xpbmtzLmpzJztcbmltcG9ydCB7IHJlbW92ZUxpbmtTdWZmaXgsIHJlbW92ZUxpbmtRdWVyeVN0cmluZywgd2luRHJpdmVQcmVmaXggfSBmcm9tICcuL3Rlcm1pbmFsTGlua1BhcnNpbmcuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUGF0aCwgcG9zaXgsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxCYWNrZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGlua1Jlc29sdmVyIGltcGxlbWVudHMgSVRlcm1pbmFsTGlua1Jlc29sdmVyIHtcblx0Ly8gTGluayBjYWNoZSBjb3VsZCBiZSBzaGFyZWQgYWNyb3NzIGFsbCB0ZXJtaW5hbHMsIGJ1dCB0aGF0IGNvdWxkIGxlYWQgdG8gd2VpcmQgcmVzdWx0cyB3aGVuXG5cdC8vIGJvdGggbG9jYWwgYW5kIHJlbW90ZSB0ZXJtaW5hbHMgYXJlIHByZXNlbnRcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRMaW5rQ2FjaGVzOiBNYXA8c3RyaW5nLCBMaW5rQ2FjaGU+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlTGluayhwcm9jZXNzTWFuYWdlcjogUGljazxJVGVybWluYWxQcm9jZXNzTWFuYWdlciwgJ2luaXRpYWxDd2QnIHwgJ29zJyB8ICdyZW1vdGVBdXRob3JpdHknIHwgJ3VzZXJIb21lJz4gJiB7IGJhY2tlbmQ/OiBQaWNrPElUZXJtaW5hbEJhY2tlbmQsICdnZXRXc2xQYXRoJz4gfSwgbGluazogc3RyaW5nLCB1cmk/OiBVUkkpOiBQcm9taXNlPFJlc29sdmVkTGluaz4ge1xuXHRcdC8vIENvcnJlY3Qgc2NoZW1lIGFuZCBhdXRob3JpdHkgZm9yIHJlbW90ZSB0ZXJtaW5hbHNcblx0XHRpZiAodXJpICYmIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSAmJiBwcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHVyaSA9IHVyaS53aXRoKHtcblx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRcdFx0YXV0aG9yaXR5OiBwcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEdldCB0aGUgbGluayBjYWNoZVxuXHRcdGxldCBjYWNoZSA9IHRoaXMuX3Jlc29sdmVkTGlua0NhY2hlcy5nZXQocHJvY2Vzc01hbmFnZXIucmVtb3RlQXV0aG9yaXR5ID8/ICcnKTtcblx0XHRpZiAoIWNhY2hlKSB7XG5cdFx0XHRjYWNoZSA9IG5ldyBMaW5rQ2FjaGUoKTtcblx0XHRcdHRoaXMuX3Jlc29sdmVkTGlua0NhY2hlcy5zZXQocHJvY2Vzc01hbmFnZXIucmVtb3RlQXV0aG9yaXR5ID8/ICcnLCBjYWNoZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgcmVzb2x2ZWQgbGluayBjYWNoZSBmaXJzdFxuXHRcdGNvbnN0IGNhY2hlZCA9IGNhY2hlLmdldCh1cmkgfHwgbGluayk7XG5cdFx0aWYgKGNhY2hlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdH1cblxuXHRcdGlmICh1cmkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHsgdXJpLCBsaW5rLCBpc0RpcmVjdG9yeTogc3RhdC5pc0RpcmVjdG9yeSB9O1xuXHRcdFx0XHRjYWNoZS5zZXQodXJpLCByZXN1bHQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gRG9lcyBub3QgZXhpc3Rcblx0XHRcdFx0Y2FjaGUuc2V0KHVyaSwgbnVsbCk7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBhbnkgbGluZS9jb2wgc3VmZml4XG5cdFx0bGV0IGxpbmtVcmwgPSByZW1vdmVMaW5rU3VmZml4KGxpbmspO1xuXG5cdFx0Ly8gUmVtb3ZlIGFueSBxdWVyeSBzdHJpbmdcblx0XHRsaW5rVXJsID0gcmVtb3ZlTGlua1F1ZXJ5U3RyaW5nKGxpbmtVcmwpO1xuXG5cdFx0Ly8gRXhpdCBlYXJseSBpZiB0aGUgbGluayBpcyBkZXRlcm1pbmVzIGFzIG5vdCB2YWxpZCBhbHJlYWR5XG5cdFx0aWYgKGxpbmtVcmwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjYWNoZS5zZXQobGluaywgbnVsbCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgbGluayBsb29rcyBsaWtlIGEgL21udC8gV1NMIHBhdGggYW5kIHRoaXMgaXMgYSBXaW5kb3dzIGZyb250ZW5kLCB1c2UgdGhlIGJhY2tlbmRcblx0XHQvLyB0byBnZXQgdGhlIHJlc29sdmVkIHBhdGggZnJvbSB0aGUgd3NscGF0aCB1dGlsLlxuXHRcdGlmIChpc1dpbmRvd3MgJiYgbGluay5tYXRjaCgvXlxcL21udFxcL1thLXpdL2kpICYmIHByb2Nlc3NNYW5hZ2VyLmJhY2tlbmQpIHtcblx0XHRcdGxpbmtVcmwgPSBhd2FpdCBwcm9jZXNzTWFuYWdlci5iYWNrZW5kLmdldFdzbFBhdGgobGlua1VybCwgJ3VuaXgtdG8td2luJyk7XG5cdFx0fVxuXHRcdC8vIFNraXAgcHJlcHJvY2Vzc2luZyBpZiBpdCBsb29rcyBsaWtlIGEgc3BlY2lhbCBXaW5kb3dzIC0+IFdTTCBsaW5rXG5cdFx0ZWxzZSBpZiAoaXNXaW5kb3dzICYmIGxpbmsubWF0Y2goL14oPzpcXC9cXC98XFxcXFxcXFwpd3NsKD86XFwkfFxcLmxvY2FsaG9zdCkoXFwvfFxcXFwpLykpIHtcblx0XHRcdC8vIE5vLW9wLCBpdCdzIGFscmVhZHkgdGhlIHJpZ2h0IGZvcm1hdFxuXHRcdH1cblx0XHQvLyBIYW5kbGUgYWxsIG5vbi1XU0wgbGlua3Ncblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHByZXByb2Nlc3NlZExpbmsgPSB0aGlzLl9wcmVwcm9jZXNzUGF0aChsaW5rVXJsLCBwcm9jZXNzTWFuYWdlci5pbml0aWFsQ3dkLCBwcm9jZXNzTWFuYWdlci5vcywgcHJvY2Vzc01hbmFnZXIudXNlckhvbWUpO1xuXHRcdFx0aWYgKCFwcmVwcm9jZXNzZWRMaW5rKSB7XG5cdFx0XHRcdGNhY2hlLnNldChsaW5rLCBudWxsKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRsaW5rVXJsID0gcHJlcHJvY2Vzc2VkTGluaztcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0bGV0IHVyaTogVVJJO1xuXHRcdFx0aWYgKHByb2Nlc3NNYW5hZ2VyLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHR1cmkgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRcdFx0XHRhdXRob3JpdHk6IHByb2Nlc3NNYW5hZ2VyLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHRwYXRoOiBsaW5rVXJsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dXJpID0gVVJJLmZpbGUobGlua1VybCk7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHsgdXJpLCBsaW5rLCBpc0RpcmVjdG9yeTogc3RhdC5pc0RpcmVjdG9yeSB9O1xuXHRcdFx0XHRjYWNoZS5zZXQobGluaywgcmVzdWx0KTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHRcdGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIERvZXMgbm90IGV4aXN0XG5cdFx0XHRcdGNhY2hlLnNldChsaW5rLCBudWxsKTtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBFcnJvcnMgaW4gcGFyc2luZyB0aGUgcGF0aFxuXHRcdFx0Y2FjaGUuc2V0KGxpbmssIG51bGwpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9wcmVwcm9jZXNzUGF0aChsaW5rOiBzdHJpbmcsIGluaXRpYWxDd2Q6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSB8IHVuZGVmaW5lZCwgdXNlckhvbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IG9zUGF0aCA9IHRoaXMuX2dldE9zUGF0aChvcyk7XG5cdFx0aWYgKGxpbmsuY2hhckF0KDApID09PSAnficpIHtcblx0XHRcdC8vIFJlc29sdmUgfiAtPiB1c2VySG9tZVxuXHRcdFx0aWYgKCF1c2VySG9tZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGxpbmsgPSBvc1BhdGguam9pbih1c2VySG9tZSwgbGluay5zdWJzdHJpbmcoMSkpO1xuXHRcdH0gZWxzZSBpZiAobGluay5jaGFyQXQoMCkgIT09ICcvJyAmJiBsaW5rLmNoYXJBdCgwKSAhPT0gJ34nKSB7XG5cdFx0XHQvLyBSZXNvbHZlIHdvcmtzcGFjZSBwYXRoIC4gfCAuLiB8IDxyZWxhdGl2ZV9wYXRoPiAtPiA8cGF0aD4vLiB8IDxwYXRoPi8uLiB8IDxwYXRoPi88cmVsYXRpdmVfcGF0aD5cblx0XHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdFx0aWYgKCFsaW5rLm1hdGNoKCdeJyArIHdpbkRyaXZlUHJlZml4KSAmJiAhbGluay5zdGFydHNXaXRoKCdcXFxcXFxcXD9cXFxcJykpIHtcblx0XHRcdFx0XHRpZiAoIWluaXRpYWxDd2QpIHtcblx0XHRcdFx0XHRcdC8vIEFib3J0IGlmIG5vIHdvcmtzcGFjZSBpcyBvcGVuXG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGluayA9IG9zUGF0aC5qb2luKGluaXRpYWxDd2QsIGxpbmspO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFJlbW92ZSBcXFxcP1xcIGZyb20gcGF0aHMgc28gdGhhdCB0aGV5IHNoYXJlIHRoZSBzYW1lIHVuZGVybHlpbmdcblx0XHRcdFx0XHQvLyB1cmkgYW5kIGRvbid0IG9wZW4gbXVsdGlwbGUgdGFicyBmb3IgdGhlIHNhbWUgZmlsZVxuXHRcdFx0XHRcdGxpbmsgPSBsaW5rLnJlcGxhY2UoL15cXFxcXFxcXFxcP1xcXFwvLCAnJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghaW5pdGlhbEN3ZCkge1xuXHRcdFx0XHRcdC8vIEFib3J0IGlmIG5vIHdvcmtzcGFjZSBpcyBvcGVuXG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGluayA9IG9zUGF0aC5qb2luKGluaXRpYWxDd2QsIGxpbmspO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsaW5rID0gb3NQYXRoLm5vcm1hbGl6ZShsaW5rKTtcblxuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3NQYXRoKG9zOiBPcGVyYXRpbmdTeXN0ZW0gfCB1bmRlZmluZWQpOiBJUGF0aCB7XG5cdFx0cmV0dXJuIChvcyA/PyBPUykgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIgOiBwb3NpeDtcblx0fVxufVxuXG5jb25zdCBlbnVtIExpbmtDYWNoZUNvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBIb3cgbG9uZyB0byBjYWNoZSBsaW5rcyBmb3IgaW4gbWlsbGlzZWNvbmRzLCB0aGUgVFRMIHJlc2V0cyB3aGVuZXZlciBhIG5ldyB2YWx1ZSBpcyBzZXQgaW5cblx0ICogdGhlIGNhY2hlLlxuXHQgKi9cblx0VFRMID0gMTAwMDBcbn1cblxuY2xhc3MgTGlua0NhY2hlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVzb2x2ZWRMaW5rPigpO1xuXHRwcml2YXRlIF9jYWNoZVRpbFRpbWVvdXQgPSAwO1xuXG5cdHNldChsaW5rOiBzdHJpbmcgfCBVUkksIHZhbHVlOiBSZXNvbHZlZExpbmspIHtcblx0XHQvLyBSZXNldCBjYWNoZWQgbGluayBUVEwgb24gYW55IHNldFxuXHRcdGlmICh0aGlzLl9jYWNoZVRpbFRpbWVvdXQpIHtcblx0XHRcdG1haW5XaW5kb3cuY2xlYXJUaW1lb3V0KHRoaXMuX2NhY2hlVGlsVGltZW91dCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NhY2hlVGlsVGltZW91dCA9IG1haW5XaW5kb3cuc2V0VGltZW91dCgoKSA9PiB0aGlzLl9jYWNoZS5jbGVhcigpLCBMaW5rQ2FjaGVDb25zdGFudHMuVFRMKTtcblx0XHR0aGlzLl9jYWNoZS5zZXQodGhpcy5fZ2V0S2V5KGxpbmspLCB2YWx1ZSk7XG5cdH1cblxuXHRnZXQobGluazogc3RyaW5nIHwgVVJJKTogUmVzb2x2ZWRMaW5rIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FjaGUuZ2V0KHRoaXMuX2dldEtleShsaW5rKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRLZXkobGluazogc3RyaW5nIHwgVVJJKTogc3RyaW5nIHtcblx0XHRpZiAoVVJJLmlzVXJpKGxpbmspKSB7XG5cdFx0XHRyZXR1cm4gbGluay50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGluaztc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QVEsbUJBQW1CO0FBQUE7QUFBQSxFQUUzQixJQUFJLE1BQW9CLE9BQXFCO0FBRTVDLFFBQUksS0FBSyxrQkFBa0I7QUFDMUIsaUJBQVcsYUFBYSxLQUFLLGdCQUFnQjtBQUFBLElBQzlDO0FBQ0EsU0FBSyxtQkFBbUIsV0FBVyxXQUFXLE1BQU0sS0FBSyxPQUFPLE1BQU0sR0FBRyxhQUFzQjtBQUMvRixTQUFLLE9BQU8sSUFBSSxLQUFLLFFBQVEsSUFBSSxHQUFHLEtBQUs7QUFBQSxFQUMxQztBQUFBLEVBRUEsSUFBSSxNQUE4QztBQUNqRCxXQUFPLEtBQUssT0FBTyxJQUFJLEtBQUssUUFBUSxJQUFJLENBQUM7QUFBQSxFQUMxQztBQUFBLEVBRVEsUUFBUSxNQUE0QjtBQUMzQyxRQUFJLElBQUksTUFBTSxJQUFJLEdBQUc7QUFDcEIsYUFBTyxLQUFLLFNBQVM7QUFBQSxJQUN0QjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbInVyaSIsICJMaW5rQ2FjaGVDb25zdGFudHMiXQp9Cg==
