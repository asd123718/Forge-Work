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
import { addDisposableListener, getWindow, isHTMLElement, reset } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Schemas } from "../../../../base/common/network.js";
import * as osPath from "../../../../base/common/path.js";
import * as platform from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITunnelService } from "../../../../platform/tunnel/common/tunnel.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { Iterable } from "../../../../base/common/iterator.js";
const CONTROL_CODES = "\\u0000-\\u0020\\u007f-\\u009f";
const WEB_LINK_REGEX = new RegExp("(?:[a-zA-Z][a-zA-Z0-9+.-]{2,}:\\/\\/|data:|www\\.)[^\\s" + CONTROL_CODES + '"]{2,}[^\\s' + CONTROL_CODES + `"')}\\],:;.!?]`, "ug");
const WIN_ABSOLUTE_PATH = /(?:[a-zA-Z]:(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_RELATIVE_PATH = /(?:(?:\~|\.+)(?:(?:\\|\/)[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const WIN_PATH = new RegExp(`(${WIN_ABSOLUTE_PATH.source}|${WIN_RELATIVE_PATH.source})`);
const POSIX_PATH = /((?:\~|\.+)?(?:\/[\w\s\.@\-\(\)\[\]{}!#$%^&'`~+=]+)+)/;
const LINE_COLUMN = /(?::(?:line\s+)?([\d]+))?(?::([\d]+))?/;
const PATH_LINK_REGEX = new RegExp(`${platform.isWindows ? WIN_PATH.source : POSIX_PATH.source}${LINE_COLUMN.source}`, "g");
const LINE_COLUMN_REGEX = /:(?:line\s+)?([\d]+)(?::([\d]+))?$/;
const MAX_LENGTH = 2e3;
var DebugLinkHoverBehavior = /* @__PURE__ */ ((DebugLinkHoverBehavior2) => {
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["Rich"] = 0] = "Rich";
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["Basic"] = 1] = "Basic";
  DebugLinkHoverBehavior2[DebugLinkHoverBehavior2["None"] = 2] = "None";
  return DebugLinkHoverBehavior2;
})(DebugLinkHoverBehavior || {});
let LinkDetector = class {
  constructor(editorService, fileService, openerService, pathService, tunnelService, environmentService, configurationService, hoverService) {
    this.editorService = editorService;
    this.fileService = fileService;
    this.openerService = openerService;
    this.pathService = pathService;
    this.tunnelService = tunnelService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
  }
  /**
   * Matches and handles web urls, absolute and relative file links in the string provided.
   * Returns <span/> element that wraps the processed string, where matched links are replaced by <a/>.
   * 'onclick' event is attached to all anchored links that opens them in the editor.
   * When splitLines is true, each line of the text, even if it contains no links, is wrapped in a <span>
   * and added as a child of the returned <span>.
   * The `hoverBehavior` is required and manages the lifecycle of event listeners.
   */
  linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) {
    return this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights);
  }
  _linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, defaultRef) {
    if (splitLines) {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        lines[i] = lines[i] + "\n";
      }
      if (!lines[lines.length - 1]) {
        lines.pop();
      }
      const elements = lines.map((line) => this._linkify(line, hoverBehavior, false, workspaceFolder, includeFulltext, highlights, defaultRef));
      if (elements.length === 1) {
        return elements[0];
      }
      const container2 = document.createElement("span");
      elements.forEach((e) => container2.appendChild(e));
      return container2;
    }
    const container = document.createElement("span");
    for (const part of this.detectLinks(text)) {
      try {
        let node;
        switch (part.kind) {
          case "text":
            node = defaultRef ? this.linkifyLocation(part.value, defaultRef.locationReference, defaultRef.session, hoverBehavior) : document.createTextNode(part.value);
            break;
          case "web":
            node = this.createWebLink(includeFulltext ? text : void 0, part.value, hoverBehavior);
            break;
          case "path": {
            const path = part.captures[0];
            const lineNumber = part.captures[1] ? Number(part.captures[1]) : 0;
            const columnNumber = part.captures[2] ? Number(part.captures[2]) : 0;
            node = this.createPathLink(includeFulltext ? text : void 0, part.value, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior);
            break;
          }
          default:
            node = document.createTextNode(part.value);
        }
        container.append(...this.applyHighlights(node, part.index, part.value.length, highlights));
      } catch (e) {
        container.appendChild(document.createTextNode(part.value));
      }
    }
    return container;
  }
  applyHighlights(node, startIndex, length, highlights) {
    const children = [];
    let currentIndex = startIndex;
    const endIndex = startIndex + length;
    for (const highlight of highlights || []) {
      if (highlight.end <= currentIndex || highlight.start >= endIndex) {
        continue;
      }
      if (highlight.start > currentIndex) {
        children.push(node.textContent.substring(currentIndex - startIndex, highlight.start - startIndex));
        currentIndex = highlight.start;
      }
      const highlightEnd = Math.min(highlight.end, endIndex);
      const highlightedText = node.textContent.substring(currentIndex - startIndex, highlightEnd - startIndex);
      const highlightSpan = document.createElement("span");
      highlightSpan.classList.add("highlight");
      if (highlight.extraClasses) {
        highlightSpan.classList.add(...highlight.extraClasses);
      }
      highlightSpan.textContent = highlightedText;
      children.push(highlightSpan);
      currentIndex = highlightEnd;
    }
    if (currentIndex === startIndex) {
      return Iterable.single(node);
    }
    if (currentIndex < endIndex) {
      children.push(node.textContent.substring(currentIndex - startIndex));
    }
    if (isHTMLElement(node)) {
      reset(node, ...children);
      return Iterable.single(node);
    }
    return children;
  }
  /**
   * Linkifies a location reference.
   */
  linkifyLocation(text, locationReference, session, hoverBehavior) {
    const link = this.createLink(text);
    this.decorateLink(link, void 0, text, hoverBehavior, async (preserveFocus) => {
      const location = await session.resolveLocationReference(locationReference);
      await location.source.openInEditor(this.editorService, {
        startLineNumber: location.line,
        startColumn: location.column,
        endLineNumber: location.endLine ?? location.line,
        endColumn: location.endColumn ?? location.column
      }, preserveFocus);
    });
    return link;
  }
  /**
   * Makes an {@link ILinkDetector} that links everything in the output to the
   * reference if they don't have other explicit links.
   */
  makeReferencedLinkDetector(locationReference, session) {
    return {
      linkify: (text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights) => this._linkify(text, hoverBehavior, splitLines, workspaceFolder, includeFulltext, highlights, { locationReference, session }),
      linkifyLocation: this.linkifyLocation.bind(this)
    };
  }
  createWebLink(fulltext, url, hoverBehavior) {
    const link = this.createLink(url);
    let uri = URI.parse(url);
    const lineCol = LINE_COLUMN_REGEX.exec(uri.path);
    if (lineCol) {
      uri = uri.with({
        path: uri.path.slice(0, lineCol.index),
        fragment: `L${lineCol[0].slice(1)}`
      });
    }
    this.decorateLink(link, uri, fulltext, hoverBehavior, async () => {
      if (uri.scheme === Schemas.file) {
        const fsPath = uri.fsPath;
        const path = await this.pathService.path;
        const fileUrl = osPath.normalize(path.sep === osPath.posix.sep && platform.isWindows ? fsPath.replace(/\\/g, osPath.posix.sep) : fsPath);
        const fileUri = URI.parse(fileUrl);
        const exists = await this.fileService.exists(fileUri);
        if (!exists) {
          return;
        }
        await this.editorService.openEditor({
          resource: fileUri,
          options: {
            pinned: true,
            selection: lineCol ? { startLineNumber: +lineCol[1], startColumn: lineCol[2] ? +lineCol[2] : 1 } : void 0
          }
        });
        return;
      }
      this.openerService.open(url, { allowTunneling: !!this.environmentService.remoteAuthority && this.configurationService.getValue("remote.forwardOnOpen") });
    });
    return link;
  }
  createPathLink(fulltext, text, path, lineNumber, columnNumber, workspaceFolder, hoverBehavior) {
    if (path[0] === "/" && path[1] === "/") {
      return document.createTextNode(text);
    }
    const options = lineNumber > 0 ? { selection: { startLineNumber: lineNumber, startColumn: columnNumber > 0 ? columnNumber : 1 } } : {};
    if (path[0] === ".") {
      if (!workspaceFolder) {
        return document.createTextNode(text);
      }
      const uri2 = workspaceFolder.toResource(path);
      const link2 = this.createLink(text);
      this.decorateLink(link2, uri2, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri2, options: { ...options, preserveFocus } }));
      return link2;
    }
    if (path[0] === "~") {
      const userHome = this.pathService.resolvedUserHome;
      if (userHome) {
        path = osPath.join(userHome.fsPath, path.substring(1));
      }
    }
    const link = this.createLink(text);
    link.tabIndex = 0;
    const uri = URI.file(osPath.normalize(path));
    this.fileService.stat(uri).then((stat) => {
      if (stat.isDirectory) {
        return;
      }
      this.decorateLink(link, uri, fulltext, hoverBehavior, (preserveFocus) => this.editorService.openEditor({ resource: uri, options: { ...options, preserveFocus } }));
    }).catch(() => {
    });
    return link;
  }
  createLink(text) {
    const link = document.createElement("a");
    link.textContent = text;
    return link;
  }
  decorateLink(link, uri, fulltext, hoverBehavior, onClick) {
    if (hoverBehavior.store.isDisposed) {
      return;
    }
    link.classList.add("link");
    const followLink = uri && this.tunnelService.canTunnel(uri) ? localize("followForwardedLink", "follow link using forwarded port") : localize("followLink", "follow link");
    const title = link.ariaLabel = fulltext ? platform.isMacintosh ? localize("fileLinkWithPathMac", "Cmd + click to {0}\n{1}", followLink, fulltext) : localize("fileLinkWithPath", "Ctrl + click to {0}\n{1}", followLink, fulltext) : platform.isMacintosh ? localize("fileLinkMac", "Cmd + click to {0}", followLink) : localize("fileLink", "Ctrl + click to {0}", followLink);
    if (hoverBehavior.type === 0 /* Rich */) {
      hoverBehavior.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), link, title));
    } else if (hoverBehavior.type !== 2 /* None */) {
      link.title = title;
    }
    hoverBehavior.store.add(addDisposableListener(link, "mousemove", (event) => {
      link.classList.toggle("pointer", platform.isMacintosh ? event.metaKey : event.ctrlKey);
    }));
    hoverBehavior.store.add(addDisposableListener(link, "mouseleave", () => {
      link.classList.remove("pointer");
    }));
    hoverBehavior.store.add(addDisposableListener(link, "click", (event) => {
      const selection = getWindow(link).getSelection();
      if (!selection || selection.type === "Range") {
        return;
      }
      if (!(platform.isMacintosh ? event.metaKey : event.ctrlKey)) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      onClick(false);
    }));
    hoverBehavior.store.add(addDisposableListener(link, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) {
        event.preventDefault();
        event.stopPropagation();
        onClick(event.keyCode === KeyCode.Space);
      }
    }));
  }
  detectLinks(text) {
    if (text.length > MAX_LENGTH) {
      return [{ kind: "text", value: text, captures: [], index: 0 }];
    }
    const regexes = [WEB_LINK_REGEX, PATH_LINK_REGEX];
    const kinds = ["web", "path"];
    const result = [];
    const splitOne = (text2, regexIndex, baseIndex) => {
      if (regexIndex >= regexes.length) {
        result.push({ value: text2, kind: "text", captures: [], index: baseIndex });
        return;
      }
      const regex = regexes[regexIndex];
      let currentIndex = 0;
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(text2)) !== null) {
        const stringBeforeMatch = text2.substring(currentIndex, match.index);
        if (stringBeforeMatch) {
          splitOne(stringBeforeMatch, regexIndex + 1, baseIndex + currentIndex);
        }
        const value = match[0];
        result.push({
          value,
          kind: kinds[regexIndex],
          captures: match.slice(1),
          index: baseIndex + match.index
        });
        currentIndex = match.index + value.length;
      }
      const stringAfterMatches = text2.substring(currentIndex);
      if (stringAfterMatches) {
        splitOne(stringAfterMatches, regexIndex + 1, baseIndex + currentIndex);
      }
    };
    splitOne(text, 0, 0);
    return result;
  }
};
LinkDetector = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IPathService),
  __decorateParam(4, ITunnelService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IHoverService)
], LinkDetector);
export {
  DebugLinkHoverBehavior,
  LinkDetector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxsaW5rRGV0ZWN0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgb3NQYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVR1bm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSURlYnVnU2Vzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlnaGxpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hpZ2hsaWdodGVkbGFiZWwvaGlnaGxpZ2h0ZWRMYWJlbC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcblxuY29uc3QgQ09OVFJPTF9DT0RFUyA9ICdcXFxcdTAwMDAtXFxcXHUwMDIwXFxcXHUwMDdmLVxcXFx1MDA5Zic7XG5jb25zdCBXRUJfTElOS19SRUdFWCA9IG5ldyBSZWdFeHAoJyg/OlthLXpBLVpdW2EtekEtWjAtOSsuLV17Mix9OlxcXFwvXFxcXC98ZGF0YTp8d3d3XFxcXC4pW15cXFxccycgKyBDT05UUk9MX0NPREVTICsgJ1wiXXsyLH1bXlxcXFxzJyArIENPTlRST0xfQ09ERVMgKyAnXCJcXCcpfVxcXFxdLDo7LiE/XScsICd1ZycpO1xuXG5jb25zdCBXSU5fQUJTT0xVVEVfUEFUSCA9IC8oPzpbYS16QS1aXTooPzooPzpcXFxcfFxcLylbXFx3XFxzXFwuQFxcLVxcKFxcKVxcW1xcXXt9ISMkJV4mJ2B+Kz1dKykrKS87XG5jb25zdCBXSU5fUkVMQVRJVkVfUEFUSCA9IC8oPzooPzpcXH58XFwuKykoPzooPzpcXFxcfFxcLylbXFx3XFxzXFwuQFxcLVxcKFxcKVxcW1xcXXt9ISMkJV4mJ2B+Kz1dKykrKS87XG5jb25zdCBXSU5fUEFUSCA9IG5ldyBSZWdFeHAoYCgke1dJTl9BQlNPTFVURV9QQVRILnNvdXJjZX18JHtXSU5fUkVMQVRJVkVfUEFUSC5zb3VyY2V9KWApO1xuY29uc3QgUE9TSVhfUEFUSCA9IC8oKD86XFx+fFxcLispPyg/OlxcL1tcXHdcXHNcXC5AXFwtXFwoXFwpXFxbXFxde30hIyQlXiYnYH4rPV0rKSspLztcbi8vIFN1cHBvcnQgYm90aCBcIjpsaW5lIDEyM1wiIGFuZCBcIjoxMjM6NDVcIiBmb3JtYXRzIGZvciBsaW5lL2NvbHVtbiBudW1iZXJzXG5jb25zdCBMSU5FX0NPTFVNTiA9IC8oPzo6KD86bGluZVxccyspPyhbXFxkXSspKT8oPzo6KFtcXGRdKykpPy87XG5jb25zdCBQQVRIX0xJTktfUkVHRVggPSBuZXcgUmVnRXhwKGAke3BsYXRmb3JtLmlzV2luZG93cyA/IFdJTl9QQVRILnNvdXJjZSA6IFBPU0lYX1BBVEguc291cmNlfSR7TElORV9DT0xVTU4uc291cmNlfWAsICdnJyk7XG5jb25zdCBMSU5FX0NPTFVNTl9SRUdFWCA9IC86KD86bGluZVxccyspPyhbXFxkXSspKD86OihbXFxkXSspKT8kLztcblxuY29uc3QgTUFYX0xFTkdUSCA9IDIwMDA7XG5cbnR5cGUgTGlua0tpbmQgPSAnd2ViJyB8ICdwYXRoJyB8ICd0ZXh0JztcbnR5cGUgTGlua1BhcnQgPSB7XG5cdGtpbmQ6IExpbmtLaW5kO1xuXHR2YWx1ZTogc3RyaW5nO1xuXHRjYXB0dXJlczogc3RyaW5nW107XG5cdGluZGV4OiBudW1iZXI7XG59O1xuXG5leHBvcnQgY29uc3QgZW51bSBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yIHtcblx0LyoqIEEgbmljZSB3b3JrYmVuY2ggaG92ZXIgKi9cblx0UmljaCxcblx0LyoqXG5cdCAqIEJhc2ljIGJyb3dzZXIgaG92ZXJcblx0ICogQGRlcHJlY2F0ZWQgQ29uc3VtZXJzIHNob3VsZCBhZG9wdCBgcmljaGAgYnkgcHJvcGFnYXRpbmcgZGlzcG9zYWJsZXMgYXBwcm9wcmlhdGVseVxuXHQgKi9cblx0QmFzaWMsXG5cdC8qKiBObyBob3ZlciAqL1xuXHROb25lXG59XG5cbi8qKiBTdG9yZSBpbXBsaWVzIEhvdmVyQmVoYXZpb3I9cmljaCAqL1xuZXhwb3J0IHR5cGUgRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhID1cblx0fCB7IHR5cGU6IERlYnVnTGlua0hvdmVyQmVoYXZpb3IuTm9uZTsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9XG5cdHwgeyB0eXBlOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yLkJhc2ljOyBzdG9yZTogRGlzcG9zYWJsZVN0b3JlIH1cblx0fCB7IHR5cGU6IERlYnVnTGlua0hvdmVyQmVoYXZpb3IuUmljaDsgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSB9O1xuXG5cblxuZXhwb3J0IGludGVyZmFjZSBJTGlua0RldGVjdG9yIHtcblx0bGlua2lmeSh0ZXh0OiBzdHJpbmcsIGhvdmVyQmVoYXZpb3I6IERlYnVnTGlua0hvdmVyQmVoYXZpb3JUeXBlRGF0YSwgc3BsaXRMaW5lcz86IGJvb2xlYW4sIHdvcmtzcGFjZUZvbGRlcj86IElXb3Jrc3BhY2VGb2xkZXIsIGluY2x1ZGVGdWxsdGV4dD86IGJvb2xlYW4sIGhpZ2hsaWdodHM/OiBJSGlnaGxpZ2h0W10pOiBIVE1MRWxlbWVudDtcblx0bGlua2lmeUxvY2F0aW9uKHRleHQ6IHN0cmluZywgbG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciwgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhKTogSFRNTEVsZW1lbnQ7XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5rRGV0ZWN0b3IgaW1wbGVtZW50cyBJTGlua0RldGVjdG9yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXRjaGVzIGFuZCBoYW5kbGVzIHdlYiB1cmxzLCBhYnNvbHV0ZSBhbmQgcmVsYXRpdmUgZmlsZSBsaW5rcyBpbiB0aGUgc3RyaW5nIHByb3ZpZGVkLlxuXHQgKiBSZXR1cm5zIDxzcGFuLz4gZWxlbWVudCB0aGF0IHdyYXBzIHRoZSBwcm9jZXNzZWQgc3RyaW5nLCB3aGVyZSBtYXRjaGVkIGxpbmtzIGFyZSByZXBsYWNlZCBieSA8YS8+LlxuXHQgKiAnb25jbGljaycgZXZlbnQgaXMgYXR0YWNoZWQgdG8gYWxsIGFuY2hvcmVkIGxpbmtzIHRoYXQgb3BlbnMgdGhlbSBpbiB0aGUgZWRpdG9yLlxuXHQgKiBXaGVuIHNwbGl0TGluZXMgaXMgdHJ1ZSwgZWFjaCBsaW5lIG9mIHRoZSB0ZXh0LCBldmVuIGlmIGl0IGNvbnRhaW5zIG5vIGxpbmtzLCBpcyB3cmFwcGVkIGluIGEgPHNwYW4+XG5cdCAqIGFuZCBhZGRlZCBhcyBhIGNoaWxkIG9mIHRoZSByZXR1cm5lZCA8c3Bhbj4uXG5cdCAqIFRoZSBgaG92ZXJCZWhhdmlvcmAgaXMgcmVxdWlyZWQgYW5kIG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBldmVudCBsaXN0ZW5lcnMuXG5cdCAqL1xuXHRsaW5raWZ5KHRleHQ6IHN0cmluZywgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhLCBzcGxpdExpbmVzPzogYm9vbGVhbiwgd29ya3NwYWNlRm9sZGVyPzogSVdvcmtzcGFjZUZvbGRlciwgaW5jbHVkZUZ1bGx0ZXh0PzogYm9vbGVhbiwgaGlnaGxpZ2h0cz86IElIaWdobGlnaHRbXSk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fbGlua2lmeSh0ZXh0LCBob3ZlckJlaGF2aW9yLCBzcGxpdExpbmVzLCB3b3Jrc3BhY2VGb2xkZXIsIGluY2x1ZGVGdWxsdGV4dCwgaGlnaGxpZ2h0cyk7XG5cdH1cblxuXHRwcml2YXRlIF9saW5raWZ5KHRleHQ6IHN0cmluZywgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhLCBzcGxpdExpbmVzPzogYm9vbGVhbiwgd29ya3NwYWNlRm9sZGVyPzogSVdvcmtzcGFjZUZvbGRlciwgaW5jbHVkZUZ1bGx0ZXh0PzogYm9vbGVhbiwgaGlnaGxpZ2h0cz86IElIaWdobGlnaHRbXSwgZGVmYXVsdFJlZj86IHsgbG9jYXRpb25SZWZlcmVuY2U6IG51bWJlcjsgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB9KTogSFRNTEVsZW1lbnQge1xuXHRcdGlmIChzcGxpdExpbmVzKSB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdFx0bGluZXNbaV0gPSBsaW5lc1tpXSArICdcXG4nO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFsaW5lc1tsaW5lcy5sZW5ndGggLSAxXSkge1xuXHRcdFx0XHQvLyBSZW1vdmUgdGhlIGxhc3QgZWxlbWVudCAoJycpIHRoYXQgc3BsaXQgYWRkZWQuXG5cdFx0XHRcdGxpbmVzLnBvcCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBsaW5lcy5tYXAobGluZSA9PiB0aGlzLl9saW5raWZ5KGxpbmUsIGhvdmVyQmVoYXZpb3IsIGZhbHNlLCB3b3Jrc3BhY2VGb2xkZXIsIGluY2x1ZGVGdWxsdGV4dCwgaGlnaGxpZ2h0cywgZGVmYXVsdFJlZikpO1xuXHRcdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgd3JhcCBzaW5nbGUgbGluZSB3aXRoIGV4dHJhIHNwYW4uXG5cdFx0XHRcdHJldHVybiBlbGVtZW50c1swXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdGVsZW1lbnRzLmZvckVhY2goZSA9PiBjb250YWluZXIuYXBwZW5kQ2hpbGQoZSkpO1xuXHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuZGV0ZWN0TGlua3ModGV4dCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCBub2RlOiBOb2RlO1xuXHRcdFx0XHRzd2l0Y2ggKHBhcnQua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRcdFx0bm9kZSA9IGRlZmF1bHRSZWYgPyB0aGlzLmxpbmtpZnlMb2NhdGlvbihwYXJ0LnZhbHVlLCBkZWZhdWx0UmVmLmxvY2F0aW9uUmVmZXJlbmNlLCBkZWZhdWx0UmVmLnNlc3Npb24sIGhvdmVyQmVoYXZpb3IpIDogZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocGFydC52YWx1ZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICd3ZWInOlxuXHRcdFx0XHRcdFx0bm9kZSA9IHRoaXMuY3JlYXRlV2ViTGluayhpbmNsdWRlRnVsbHRleHQgPyB0ZXh0IDogdW5kZWZpbmVkLCBwYXJ0LnZhbHVlLCBob3ZlckJlaGF2aW9yKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3BhdGgnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXRoID0gcGFydC5jYXB0dXJlc1swXTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBwYXJ0LmNhcHR1cmVzWzFdID8gTnVtYmVyKHBhcnQuY2FwdHVyZXNbMV0pIDogMDtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbHVtbk51bWJlciA9IHBhcnQuY2FwdHVyZXNbMl0gPyBOdW1iZXIocGFydC5jYXB0dXJlc1syXSkgOiAwO1xuXHRcdFx0XHRcdFx0bm9kZSA9IHRoaXMuY3JlYXRlUGF0aExpbmsoaW5jbHVkZUZ1bGx0ZXh0ID8gdGV4dCA6IHVuZGVmaW5lZCwgcGFydC52YWx1ZSwgcGF0aCwgbGluZU51bWJlciwgY29sdW1uTnVtYmVyLCB3b3Jrc3BhY2VGb2xkZXIsIGhvdmVyQmVoYXZpb3IpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUocGFydC52YWx1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kKC4uLnRoaXMuYXBwbHlIaWdobGlnaHRzKG5vZGUsIHBhcnQuaW5kZXgsIHBhcnQudmFsdWUubGVuZ3RoLCBoaWdobGlnaHRzKSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShwYXJ0LnZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5SGlnaGxpZ2h0cyhub2RlOiBOb2RlLCBzdGFydEluZGV4OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCBoaWdobGlnaHRzOiBJSGlnaGxpZ2h0W10gfCB1bmRlZmluZWQpOiBJdGVyYWJsZTxOb2RlIHwgc3RyaW5nPiB7XG5cdFx0Y29uc3QgY2hpbGRyZW46IChOb2RlIHwgc3RyaW5nKVtdID0gW107XG5cdFx0bGV0IGN1cnJlbnRJbmRleCA9IHN0YXJ0SW5kZXg7XG5cdFx0Y29uc3QgZW5kSW5kZXggPSBzdGFydEluZGV4ICsgbGVuZ3RoO1xuXG5cdFx0Zm9yIChjb25zdCBoaWdobGlnaHQgb2YgaGlnaGxpZ2h0cyB8fCBbXSkge1xuXHRcdFx0aWYgKGhpZ2hsaWdodC5lbmQgPD0gY3VycmVudEluZGV4IHx8IGhpZ2hsaWdodC5zdGFydCA+PSBlbmRJbmRleCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhpZ2hsaWdodC5zdGFydCA+IGN1cnJlbnRJbmRleCkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUudGV4dENvbnRlbnQhLnN1YnN0cmluZyhjdXJyZW50SW5kZXggLSBzdGFydEluZGV4LCBoaWdobGlnaHQuc3RhcnQgLSBzdGFydEluZGV4KSk7XG5cdFx0XHRcdGN1cnJlbnRJbmRleCA9IGhpZ2hsaWdodC5zdGFydDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0RW5kID0gTWF0aC5taW4oaGlnaGxpZ2h0LmVuZCwgZW5kSW5kZXgpO1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0ZWRUZXh0ID0gbm9kZS50ZXh0Q29udGVudCEuc3Vic3RyaW5nKGN1cnJlbnRJbmRleCAtIHN0YXJ0SW5kZXgsIGhpZ2hsaWdodEVuZCAtIHN0YXJ0SW5kZXgpO1xuXHRcdFx0Y29uc3QgaGlnaGxpZ2h0U3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdGhpZ2hsaWdodFNwYW4uY2xhc3NMaXN0LmFkZCgnaGlnaGxpZ2h0Jyk7XG5cdFx0XHRpZiAoaGlnaGxpZ2h0LmV4dHJhQ2xhc3Nlcykge1xuXHRcdFx0XHRoaWdobGlnaHRTcGFuLmNsYXNzTGlzdC5hZGQoLi4uaGlnaGxpZ2h0LmV4dHJhQ2xhc3Nlcyk7XG5cdFx0XHR9XG5cdFx0XHRoaWdobGlnaHRTcGFuLnRleHRDb250ZW50ID0gaGlnaGxpZ2h0ZWRUZXh0O1xuXHRcdFx0Y2hpbGRyZW4ucHVzaChoaWdobGlnaHRTcGFuKTtcblx0XHRcdGN1cnJlbnRJbmRleCA9IGhpZ2hsaWdodEVuZDtcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEluZGV4ID09PSBzdGFydEluZGV4KSB7XG5cdFx0XHRyZXR1cm4gSXRlcmFibGUuc2luZ2xlKG5vZGUpOyAvLyBubyBjaGFuZ2VzIG1hZGVcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEluZGV4IDwgZW5kSW5kZXgpIHtcblx0XHRcdGNoaWxkcmVuLnB1c2gobm9kZS50ZXh0Q29udGVudCEuc3Vic3RyaW5nKGN1cnJlbnRJbmRleCAtIHN0YXJ0SW5kZXgpKTtcblx0XHR9XG5cblx0XHQvLyByZXVzZSB0aGUgZWxlbWVudCBpZiBpdCdzIGEgbGlua1xuXHRcdGlmIChpc0hUTUxFbGVtZW50KG5vZGUpKSB7XG5cdFx0XHRyZXNldChub2RlLCAuLi5jaGlsZHJlbik7XG5cdFx0XHRyZXR1cm4gSXRlcmFibGUuc2luZ2xlKG5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHJlbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBMaW5raWZpZXMgYSBsb2NhdGlvbiByZWZlcmVuY2UuXG5cdCAqL1xuXHRsaW5raWZ5TG9jYXRpb24odGV4dDogc3RyaW5nLCBsb2NhdGlvblJlZmVyZW5jZTogbnVtYmVyLCBzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEpIHtcblx0XHRjb25zdCBsaW5rID0gdGhpcy5jcmVhdGVMaW5rKHRleHQpO1xuXHRcdHRoaXMuZGVjb3JhdGVMaW5rKGxpbmssIHVuZGVmaW5lZCwgdGV4dCwgaG92ZXJCZWhhdmlvciwgYXN5bmMgKHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gYXdhaXQgc2Vzc2lvbi5yZXNvbHZlTG9jYXRpb25SZWZlcmVuY2UobG9jYXRpb25SZWZlcmVuY2UpO1xuXHRcdFx0YXdhaXQgbG9jYXRpb24uc291cmNlLm9wZW5JbkVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UsIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsb2NhdGlvbi5saW5lLFxuXHRcdFx0XHRzdGFydENvbHVtbjogbG9jYXRpb24uY29sdW1uLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBsb2NhdGlvbi5lbmRMaW5lID8/IGxvY2F0aW9uLmxpbmUsXG5cdFx0XHRcdGVuZENvbHVtbjogbG9jYXRpb24uZW5kQ29sdW1uID8/IGxvY2F0aW9uLmNvbHVtbixcblx0XHRcdH0sIHByZXNlcnZlRm9jdXMpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGxpbms7XG5cdH1cblxuXHQvKipcblx0ICogTWFrZXMgYW4ge0BsaW5rIElMaW5rRGV0ZWN0b3J9IHRoYXQgbGlua3MgZXZlcnl0aGluZyBpbiB0aGUgb3V0cHV0IHRvIHRoZVxuXHQgKiByZWZlcmVuY2UgaWYgdGhleSBkb24ndCBoYXZlIG90aGVyIGV4cGxpY2l0IGxpbmtzLlxuXHQgKi9cblx0bWFrZVJlZmVyZW5jZWRMaW5rRGV0ZWN0b3IobG9jYXRpb25SZWZlcmVuY2U6IG51bWJlciwgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbik6IElMaW5rRGV0ZWN0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5raWZ5OiAodGV4dCwgaG92ZXJCZWhhdmlvciwgc3BsaXRMaW5lcywgd29ya3NwYWNlRm9sZGVyLCBpbmNsdWRlRnVsbHRleHQsIGhpZ2hsaWdodHMpID0+XG5cdFx0XHRcdHRoaXMuX2xpbmtpZnkodGV4dCwgaG92ZXJCZWhhdmlvciwgc3BsaXRMaW5lcywgd29ya3NwYWNlRm9sZGVyLCBpbmNsdWRlRnVsbHRleHQsIGhpZ2hsaWdodHMsIHsgbG9jYXRpb25SZWZlcmVuY2UsIHNlc3Npb24gfSksXG5cdFx0XHRsaW5raWZ5TG9jYXRpb246IHRoaXMubGlua2lmeUxvY2F0aW9uLmJpbmQodGhpcyksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV2ViTGluayhmdWxsdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1cmw6IHN0cmluZywgaG92ZXJCZWhhdmlvcjogRGVidWdMaW5rSG92ZXJCZWhhdmlvclR5cGVEYXRhKTogTm9kZSB7XG5cdFx0Y29uc3QgbGluayA9IHRoaXMuY3JlYXRlTGluayh1cmwpO1xuXG5cdFx0bGV0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdC8vIGlmIHRoZSBVUkkgZW5kcyB3aXRoIHNvbWV0aGluZyBsaWtlIGBmb28uanM6MTI6M2AsIHBhcnNlXG5cdFx0Ly8gdGhhdCBpbnRvIGEgZnJhZ21lbnQgdG8gcmV2ZWFsIHRoYXQgbG9jYXRpb24gKCMxNTA3MDIpXG5cdFx0Y29uc3QgbGluZUNvbCA9IExJTkVfQ09MVU1OX1JFR0VYLmV4ZWModXJpLnBhdGgpO1xuXHRcdGlmIChsaW5lQ29sKSB7XG5cdFx0XHR1cmkgPSB1cmkud2l0aCh7XG5cdFx0XHRcdHBhdGg6IHVyaS5wYXRoLnNsaWNlKDAsIGxpbmVDb2wuaW5kZXgpLFxuXHRcdFx0XHRmcmFnbWVudDogYEwke2xpbmVDb2xbMF0uc2xpY2UoMSl9YFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kZWNvcmF0ZUxpbmsobGluaywgdXJpLCBmdWxsdGV4dCwgaG92ZXJCZWhhdmlvciwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdC8vIEp1c3QgdXNpbmcgZnNQYXRoIGhlcmUgaXMgdW5zYWZlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA5MDc2XG5cdFx0XHRcdGNvbnN0IGZzUGF0aCA9IHVyaS5mc1BhdGg7XG5cdFx0XHRcdGNvbnN0IHBhdGggPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnBhdGg7XG5cdFx0XHRcdGNvbnN0IGZpbGVVcmwgPSBvc1BhdGgubm9ybWFsaXplKCgocGF0aC5zZXAgPT09IG9zUGF0aC5wb3NpeC5zZXApICYmIHBsYXRmb3JtLmlzV2luZG93cykgPyBmc1BhdGgucmVwbGFjZSgvXFxcXC9nLCBvc1BhdGgucG9zaXguc2VwKSA6IGZzUGF0aCk7XG5cblx0XHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5wYXJzZShmaWxlVXJsKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoZmlsZVVyaSk7XG5cdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBmaWxlVXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogbGluZUNvbCA/IHsgc3RhcnRMaW5lTnVtYmVyOiArbGluZUNvbFsxXSwgc3RhcnRDb2x1bW46IGxpbmVDb2xbMl0gPyArbGluZUNvbFsyXSA6IDEgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmwsIHsgYWxsb3dUdW5uZWxpbmc6ICghIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdyZW1vdGUuZm9yd2FyZE9uT3BlbicpKSB9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQYXRoTGluayhmdWxsdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcsIHBhdGg6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW5OdW1iZXI6IG51bWJlciwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkLCBob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEpOiBOb2RlIHtcblx0XHRpZiAocGF0aFswXSA9PT0gJy8nICYmIHBhdGhbMV0gPT09ICcvJykge1xuXHRcdFx0Ly8gTW9zdCBsaWtlbHkgYSB1cmwgcGFydCB3aGljaCBkaWQgbm90IG1hdGNoLCBmb3IgZXhhbXBsZSBmdHA6Ly9wYXRoLlxuXHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHRleHQpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgc2V0IHNlbGVjdGlvbiBpZiB3ZSBoYXZlIGEgdmFsaWQgbGluZSBudW1iZXIgKGdyZWF0ZXIgdGhhbiAwKVxuXHRcdGNvbnN0IG9wdGlvbnMgPSBsaW5lTnVtYmVyID4gMFxuXHRcdFx0PyB7IHNlbGVjdGlvbjogeyBzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBjb2x1bW5OdW1iZXIgPiAwID8gY29sdW1uTnVtYmVyIDogMSB9IH1cblx0XHRcdDoge307XG5cblx0XHRpZiAocGF0aFswXSA9PT0gJy4nKSB7XG5cdFx0XHRpZiAoIXdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodGV4dCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cmkgPSB3b3Jrc3BhY2VGb2xkZXIudG9SZXNvdXJjZShwYXRoKTtcblx0XHRcdGNvbnN0IGxpbmsgPSB0aGlzLmNyZWF0ZUxpbmsodGV4dCk7XG5cdFx0XHR0aGlzLmRlY29yYXRlTGluayhsaW5rLCB1cmksIGZ1bGx0ZXh0LCBob3ZlckJlaGF2aW9yLCAocHJlc2VydmVGb2N1czogYm9vbGVhbikgPT4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdXJpLCBvcHRpb25zOiB7IC4uLm9wdGlvbnMsIHByZXNlcnZlRm9jdXMgfSB9KSk7XG5cdFx0XHRyZXR1cm4gbGluaztcblx0XHR9XG5cblx0XHRpZiAocGF0aFswXSA9PT0gJ34nKSB7XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IHRoaXMucGF0aFNlcnZpY2UucmVzb2x2ZWRVc2VySG9tZTtcblx0XHRcdGlmICh1c2VySG9tZSkge1xuXHRcdFx0XHRwYXRoID0gb3NQYXRoLmpvaW4odXNlckhvbWUuZnNQYXRoLCBwYXRoLnN1YnN0cmluZygxKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluayA9IHRoaXMuY3JlYXRlTGluayh0ZXh0KTtcblx0XHRsaW5rLnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShvc1BhdGgubm9ybWFsaXplKHBhdGgpKTtcblx0XHR0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKS50aGVuKHN0YXQgPT4ge1xuXHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kZWNvcmF0ZUxpbmsobGluaywgdXJpLCBmdWxsdGV4dCwgaG92ZXJCZWhhdmlvciwgKHByZXNlcnZlRm9jdXM6IGJvb2xlYW4pID0+IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogeyAuLi5vcHRpb25zLCBwcmVzZXJ2ZUZvY3VzIH0gfSkpO1xuXHRcdH0pLmNhdGNoKCgpID0+IHtcblx0XHRcdC8vIElmIHRoZSB1cmkgY2FuIG5vdCBiZSByZXNvbHZlZCB3ZSBzaG91bGQgbm90IHNwYW0gdGhlIGNvbnNvbGUgd2l0aCBlcnJvciwgcmVtYWluIHF1aXRlICM4NjU4N1xuXHRcdH0pO1xuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMaW5rKHRleHQ6IHN0cmluZyk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBsaW5rID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuXHRcdGxpbmsudGV4dENvbnRlbnQgPSB0ZXh0O1xuXHRcdHJldHVybiBsaW5rO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWNvcmF0ZUxpbmsobGluazogSFRNTEVsZW1lbnQsIHVyaTogVVJJIHwgdW5kZWZpbmVkLCBmdWxsdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkLCBob3ZlckJlaGF2aW9yOiBEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yVHlwZURhdGEsIG9uQ2xpY2s6IChwcmVzZXJ2ZUZvY3VzOiBib29sZWFuKSA9PiB2b2lkKSB7XG5cdFx0aWYgKGhvdmVyQmVoYXZpb3Iuc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsaW5rLmNsYXNzTGlzdC5hZGQoJ2xpbmsnKTtcblx0XHRjb25zdCBmb2xsb3dMaW5rID0gdXJpICYmIHRoaXMudHVubmVsU2VydmljZS5jYW5UdW5uZWwodXJpKSA/IGxvY2FsaXplKCdmb2xsb3dGb3J3YXJkZWRMaW5rJywgXCJmb2xsb3cgbGluayB1c2luZyBmb3J3YXJkZWQgcG9ydFwiKSA6IGxvY2FsaXplKCdmb2xsb3dMaW5rJywgXCJmb2xsb3cgbGlua1wiKTtcblx0XHRjb25zdCB0aXRsZSA9IGxpbmsuYXJpYUxhYmVsID0gZnVsbHRleHRcblx0XHRcdD8gKHBsYXRmb3JtLmlzTWFjaW50b3NoID8gbG9jYWxpemUoJ2ZpbGVMaW5rV2l0aFBhdGhNYWMnLCBcIkNtZCArIGNsaWNrIHRvIHswfVxcbnsxfVwiLCBmb2xsb3dMaW5rLCBmdWxsdGV4dCkgOiBsb2NhbGl6ZSgnZmlsZUxpbmtXaXRoUGF0aCcsIFwiQ3RybCArIGNsaWNrIHRvIHswfVxcbnsxfVwiLCBmb2xsb3dMaW5rLCBmdWxsdGV4dCkpXG5cdFx0XHQ6IChwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGxvY2FsaXplKCdmaWxlTGlua01hYycsIFwiQ21kICsgY2xpY2sgdG8gezB9XCIsIGZvbGxvd0xpbmspIDogbG9jYWxpemUoJ2ZpbGVMaW5rJywgXCJDdHJsICsgY2xpY2sgdG8gezB9XCIsIGZvbGxvd0xpbmspKTtcblxuXHRcdGlmIChob3ZlckJlaGF2aW9yLnR5cGUgPT09IERlYnVnTGlua0hvdmVyQmVoYXZpb3IuUmljaCkge1xuXHRcdFx0aG92ZXJCZWhhdmlvci5zdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgbGluaywgdGl0bGUpKTtcblx0XHR9IGVsc2UgaWYgKGhvdmVyQmVoYXZpb3IudHlwZSAhPT0gRGVidWdMaW5rSG92ZXJCZWhhdmlvci5Ob25lKSB7XG5cdFx0XHRsaW5rLnRpdGxlID0gdGl0bGU7XG5cdFx0fVxuXG5cdFx0aG92ZXJCZWhhdmlvci5zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssICdtb3VzZW1vdmUnLCAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGxpbmsuY2xhc3NMaXN0LnRvZ2dsZSgncG9pbnRlcicsIHBsYXRmb3JtLmlzTWFjaW50b3NoID8gZXZlbnQubWV0YUtleSA6IGV2ZW50LmN0cmxLZXkpO1xuXHRcdH0pKTtcblxuXHRcdGhvdmVyQmVoYXZpb3Iuc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAnbW91c2VsZWF2ZScsICgpID0+IHtcblx0XHRcdGxpbmsuY2xhc3NMaXN0LnJlbW92ZSgncG9pbnRlcicpO1xuXHRcdH0pKTtcblxuXHRcdGhvdmVyQmVoYXZpb3Iuc3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCAnY2xpY2snLCAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGdldFdpbmRvdyhsaW5rKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmICghc2VsZWN0aW9uIHx8IHNlbGVjdGlvbi50eXBlID09PSAnUmFuZ2UnKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gZG8gbm90IG5hdmlnYXRlIHdoZW4gdXNlciBpcyBzZWxlY3Rpbmdcblx0XHRcdH1cblx0XHRcdGlmICghKHBsYXRmb3JtLmlzTWFjaW50b3NoID8gZXZlbnQubWV0YUtleSA6IGV2ZW50LmN0cmxLZXkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0b25DbGljayhmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0aG92ZXJCZWhhdmlvci5zdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssICdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdG9uQ2xpY2soZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkZXRlY3RMaW5rcyh0ZXh0OiBzdHJpbmcpOiBMaW5rUGFydFtdIHtcblx0XHRpZiAodGV4dC5sZW5ndGggPiBNQVhfTEVOR1RIKSB7XG5cdFx0XHRyZXR1cm4gW3sga2luZDogJ3RleHQnLCB2YWx1ZTogdGV4dCwgY2FwdHVyZXM6IFtdLCBpbmRleDogMCB9XTtcblx0XHR9XG5cblx0XHRjb25zdCByZWdleGVzOiBSZWdFeHBbXSA9IFtXRUJfTElOS19SRUdFWCwgUEFUSF9MSU5LX1JFR0VYXTtcblx0XHRjb25zdCBraW5kczogTGlua0tpbmRbXSA9IFsnd2ViJywgJ3BhdGgnXTtcblx0XHRjb25zdCByZXN1bHQ6IExpbmtQYXJ0W10gPSBbXTtcblxuXHRcdGNvbnN0IHNwbGl0T25lID0gKHRleHQ6IHN0cmluZywgcmVnZXhJbmRleDogbnVtYmVyLCBiYXNlSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKHJlZ2V4SW5kZXggPj0gcmVnZXhlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB2YWx1ZTogdGV4dCwga2luZDogJ3RleHQnLCBjYXB0dXJlczogW10sIGluZGV4OiBiYXNlSW5kZXggfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlZ2V4ID0gcmVnZXhlc1tyZWdleEluZGV4XTtcblx0XHRcdGxldCBjdXJyZW50SW5kZXggPSAwO1xuXHRcdFx0bGV0IG1hdGNoO1xuXHRcdFx0cmVnZXgubGFzdEluZGV4ID0gMDtcblx0XHRcdHdoaWxlICgobWF0Y2ggPSByZWdleC5leGVjKHRleHQpKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBzdHJpbmdCZWZvcmVNYXRjaCA9IHRleHQuc3Vic3RyaW5nKGN1cnJlbnRJbmRleCwgbWF0Y2guaW5kZXgpO1xuXHRcdFx0XHRpZiAoc3RyaW5nQmVmb3JlTWF0Y2gpIHtcblx0XHRcdFx0XHRzcGxpdE9uZShzdHJpbmdCZWZvcmVNYXRjaCwgcmVnZXhJbmRleCArIDEsIGJhc2VJbmRleCArIGN1cnJlbnRJbmRleCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBtYXRjaFswXTtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHZhbHVlOiB2YWx1ZSxcblx0XHRcdFx0XHRraW5kOiBraW5kc1tyZWdleEluZGV4XSxcblx0XHRcdFx0XHRjYXB0dXJlczogbWF0Y2guc2xpY2UoMSksXG5cdFx0XHRcdFx0aW5kZXg6IGJhc2VJbmRleCArIG1hdGNoLmluZGV4XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjdXJyZW50SW5kZXggPSBtYXRjaC5pbmRleCArIHZhbHVlLmxlbmd0aDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0cmluZ0FmdGVyTWF0Y2hlcyA9IHRleHQuc3Vic3RyaW5nKGN1cnJlbnRJbmRleCk7XG5cdFx0XHRpZiAoc3RyaW5nQWZ0ZXJNYXRjaGVzKSB7XG5cdFx0XHRcdHNwbGl0T25lKHN0cmluZ0FmdGVyTWF0Y2hlcywgcmVnZXhJbmRleCArIDEsIGJhc2VJbmRleCArIGN1cnJlbnRJbmRleCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHNwbGl0T25lKHRleHQsIDAsIDApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUIsV0FBVyxlQUFlLGFBQWE7QUFDdkUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsZUFBZTtBQUN4QixZQUFZLFlBQVk7QUFDeEIsWUFBWSxjQUFjO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUcvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUV6QixNQUFNLGdCQUFnQjtBQUN0QixNQUFNLGlCQUFpQixJQUFJLE9BQU8sNERBQTRELGdCQUFnQixnQkFBZ0IsZ0JBQWdCLGtCQUFtQixJQUFJO0FBRXJLLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sV0FBVyxJQUFJLE9B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bEUsWUFBSSxtQkFBbUI7QUFDdEIsbUJBQVMsbUJBQW1CLGFBQWEsR0FBRyxZQUFZLFlBQVk7QUFBQSxRQUNyRTtBQUNBLGNBQU0sUUFBUSxNQUFNLENBQUM7QUFDckIsZUFBTyxLQUFLO0FBQUEsVUFDWDtBQUFBLFVBQ0EsTUFBTSxNQUFNLFVBQVU7QUFBQSxVQUN0QixVQUFVLE1BQU0sTUFBTSxDQUFDO0FBQUEsVUFDdkIsT0FBTyxZQUFZLE1BQU07QUFBQSxRQUMxQixDQUFDO0FBQ0QsdUJBQWUsTUFBTSxRQUFRLE1BQU07QUFBQSxNQUNwQztBQUNBLFlBQU0scUJBQXFCQSxNQUFLLFVBQVUsWUFBWTtBQUN0RCxVQUFJLG9CQUFvQjtBQUN2QixpQkFBUyxvQkFBb0IsYUFBYSxHQUFHLFlBQVksWUFBWTtBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUVBLGFBQVMsTUFBTSxHQUFHLENBQUM7QUFDbkIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQTNVYSxlQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogWyJEZWJ1Z0xpbmtIb3ZlckJlaGF2aW9yIiwgImNvbnRhaW5lciIsICJ1cmkiLCAibGluayIsICJ0ZXh0Il0KfQo=
