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
import * as dom from "../../../base/browser/dom.js";
import { mainWindow } from "../../../base/browser/window.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import { ResourceMap } from "../../../base/common/map.js";
import { parse } from "../../../base/common/marshalling.js";
import { matchesScheme, matchesSomeScheme, Schemas } from "../../../base/common/network.js";
import { normalizePath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { ICodeEditorService } from "./codeEditorService.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { EditorOpenSource } from "../../../platform/editor/common/editor.js";
import { extractSelection } from "../../../platform/opener/common/opener.js";
let CommandOpener = class {
  constructor(_commandService) {
    this._commandService = _commandService;
  }
  async open(target, options) {
    if (!matchesScheme(target, Schemas.command)) {
      return false;
    }
    if (!options?.allowCommands) {
      return true;
    }
    if (typeof target === "string") {
      target = URI.parse(target);
    }
    if (Array.isArray(options.allowCommands)) {
      if (!options.allowCommands.includes(target.path)) {
        return true;
      }
    }
    let args = [];
    try {
      args = parse(decodeURIComponent(target.query));
    } catch {
      try {
        args = parse(target.query);
      } catch {
      }
    }
    if (!Array.isArray(args)) {
      args = [args];
    }
    await this._commandService.executeCommand(target.path, ...args);
    return true;
  }
};
CommandOpener = __decorateClass([
  __decorateParam(0, ICommandService)
], CommandOpener);
let EditorOpener = class {
  constructor(_editorService) {
    this._editorService = _editorService;
  }
  async open(target, options) {
    if (typeof target === "string") {
      target = URI.parse(target);
    }
    const { selection, uri } = extractSelection(target);
    target = uri;
    if (target.scheme === Schemas.file) {
      target = normalizePath(target);
    }
    await this._editorService.openCodeEditor(
      {
        resource: target,
        options: {
          selection,
          source: options?.fromUserGesture ? EditorOpenSource.USER : EditorOpenSource.API,
          ...options?.editorOptions
        }
      },
      this._editorService.getFocusedCodeEditor(),
      options?.openToSide
    );
    return true;
  }
};
EditorOpener = __decorateClass([
  __decorateParam(0, ICodeEditorService)
], EditorOpener);
let OpenerService = class {
  constructor(editorService, commandService) {
    this._openers = new LinkedList();
    this._validators = new LinkedList();
    this._resolvers = new LinkedList();
    this._resolvedUriTargets = new ResourceMap((uri) => uri.with({ path: null, fragment: null, query: null }).toString());
    this._externalOpeners = new LinkedList();
    this._defaultExternalOpener = {
      openExternal: async (href) => {
        if (matchesSomeScheme(href, Schemas.http, Schemas.https)) {
          dom.windowOpenNoOpener(href);
        } else {
          mainWindow.location.href = href;
        }
        return true;
      }
    };
    this._openers.push({
      open: async (target, options) => {
        if (options?.openExternal || matchesSomeScheme(target, Schemas.mailto, Schemas.http, Schemas.https, Schemas.vsls)) {
          await this._doOpenExternal(target, options);
          return true;
        }
        return false;
      }
    });
    this._openers.push(new CommandOpener(commandService));
    this._openers.push(new EditorOpener(editorService));
  }
  registerOpener(opener) {
    const remove = this._openers.unshift(opener);
    return { dispose: remove };
  }
  registerValidator(validator) {
    const remove = this._validators.push(validator);
    return { dispose: remove };
  }
  registerExternalUriResolver(resolver) {
    const remove = this._resolvers.push(resolver);
    return { dispose: remove };
  }
  setDefaultExternalOpener(externalOpener) {
    this._defaultExternalOpener = externalOpener;
  }
  registerExternalOpener(opener) {
    const remove = this._externalOpeners.push(opener);
    return { dispose: remove };
  }
  async open(target, options) {
    const targetURI = typeof target === "string" ? URI.parse(target) : target;
    if (targetURI.scheme === Schemas.internal) {
      return false;
    }
    if (!options?.skipValidation) {
      const validationTarget = this._resolvedUriTargets.get(targetURI) ?? target;
      for (const validator of this._validators) {
        if (!await validator.shouldOpen(validationTarget, options)) {
          return false;
        }
      }
    }
    for (const opener of this._openers) {
      const handled = await opener.open(target, options);
      if (handled) {
        return true;
      }
    }
    return false;
  }
  async resolveExternalUri(resource, options) {
    for (const resolver of this._resolvers) {
      try {
        const result = await resolver.resolveExternalUri(resource, options);
        if (result) {
          if (!this._resolvedUriTargets.has(result.resolved)) {
            this._resolvedUriTargets.set(result.resolved, resource);
          }
          return result;
        }
      } catch {
      }
    }
    throw new Error("Could not resolve external URI: " + resource.toString());
  }
  async _doOpenExternal(resource, options) {
    const uri = typeof resource === "string" ? URI.parse(resource) : resource;
    let externalUri;
    try {
      externalUri = (await this.resolveExternalUri(uri, options)).resolved;
    } catch {
      externalUri = uri;
    }
    let href;
    if (typeof resource === "string" && uri.toString() === externalUri.toString()) {
      href = resource;
    } else {
      href = encodeURI(externalUri.toString(true));
    }
    if (options?.allowContributedOpeners) {
      const preferredOpenerId = typeof options?.allowContributedOpeners === "string" ? options?.allowContributedOpeners : void 0;
      for (const opener of this._externalOpeners) {
        const didOpen = await opener.openExternal(href, {
          sourceUri: uri,
          preferredOpenerId
        }, CancellationToken.None);
        if (didOpen) {
          return true;
        }
      }
    }
    return this._defaultExternalOpener.openExternal(href, { sourceUri: uri }, CancellationToken.None);
  }
  dispose() {
    this._validators.clear();
  }
};
OpenerService = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, ICommandService)
], OpenerService);
export {
  OpenerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHNlcnZpY2VzXFxvcGVuZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU2NoZW1lLCBtYXRjaGVzU29tZVNjaGVtZSwgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3BlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGV4dHJhY3RTZWxlY3Rpb24sIElFeHRlcm5hbE9wZW5lciwgSUV4dGVybmFsVXJpUmVzb2x2ZXIsIElPcGVuZXIsIElPcGVuZXJTZXJ2aWNlLCBJUmVzb2x2ZWRFeHRlcm5hbFVyaSwgSVZhbGlkYXRvciwgT3Blbk9wdGlvbnMsIFJlc29sdmVFeHRlcm5hbFVyaU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5cbmNsYXNzIENvbW1hbmRPcGVuZXIgaW1wbGVtZW50cyBJT3BlbmVyIHtcblxuXHRjb25zdHJ1Y3RvcihASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UpIHsgfVxuXG5cdGFzeW5jIG9wZW4odGFyZ2V0OiBVUkkgfCBzdHJpbmcsIG9wdGlvbnM/OiBPcGVuT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghbWF0Y2hlc1NjaGVtZSh0YXJnZXQsIFNjaGVtYXMuY29tbWFuZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnM/LmFsbG93Q29tbWFuZHMpIHtcblx0XHRcdC8vIHNpbGVudGx5IGlnbm9yZSBjb21tYW5kcyB3aGVuIGNvbW1hbmQtbGlua3MgYXJlIGRpc2FibGVkLCBhbHNvXG5cdFx0XHQvLyBzdXBwcmVzcyBvdGhlciBvcGVuZXJzIGJ5IHJldHVybmluZyBUUlVFXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHRhcmdldCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRhcmdldCA9IFVSSS5wYXJzZSh0YXJnZXQpO1xuXHRcdH1cblxuXHRcdGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuYWxsb3dDb21tYW5kcykpIHtcblx0XHRcdC8vIE9ubHkgYWxsb3cgc3BlY2lmaWMgY29tbWFuZHNcblx0XHRcdGlmICghb3B0aW9ucy5hbGxvd0NvbW1hbmRzLmluY2x1ZGVzKHRhcmdldC5wYXRoKSkge1xuXHRcdFx0XHQvLyBTdXBwcmVzcyBvdGhlciBvcGVuZXJzIGJ5IHJldHVybmluZyBUUlVFXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGV4ZWN1dGUgYXMgY29tbWFuZFxuXHRcdGxldCBhcmdzOiB1bmtub3duW10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0YXJncyA9IHBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh0YXJnZXQucXVlcnkpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGlnbm9yZSBhbmQgcmV0cnlcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFyZ3MgPSBwYXJzZSh0YXJnZXQucXVlcnkpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlcnJvclxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJncykpIHtcblx0XHRcdGFyZ3MgPSBbYXJnc107XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHRhcmdldC5wYXRoLCAuLi5hcmdzKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBFZGl0b3JPcGVuZXIgaW1wbGVtZW50cyBJT3BlbmVyIHtcblxuXHRjb25zdHJ1Y3RvcihASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSkgeyB9XG5cblx0YXN5bmMgb3Blbih0YXJnZXQ6IFVSSSB8IHN0cmluZywgb3B0aW9uczogT3Blbk9wdGlvbnMpIHtcblx0XHRpZiAodHlwZW9mIHRhcmdldCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRhcmdldCA9IFVSSS5wYXJzZSh0YXJnZXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgc2VsZWN0aW9uLCB1cmkgfSA9IGV4dHJhY3RTZWxlY3Rpb24odGFyZ2V0KTtcblx0XHR0YXJnZXQgPSB1cmk7XG5cblx0XHRpZiAodGFyZ2V0LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHR0YXJnZXQgPSBub3JtYWxpemVQYXRoKHRhcmdldCk7IC8vIHdvcmthcm91bmQgZm9yIG5vbi1ub3JtYWxpemVkIHBhdGhzIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI5NTQpXG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuQ29kZUVkaXRvcihcblx0XHRcdHtcblx0XHRcdFx0cmVzb3VyY2U6IHRhcmdldCxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0XHRzb3VyY2U6IG9wdGlvbnM/LmZyb21Vc2VyR2VzdHVyZSA/IEVkaXRvck9wZW5Tb3VyY2UuVVNFUiA6IEVkaXRvck9wZW5Tb3VyY2UuQVBJLFxuXHRcdFx0XHRcdC4uLm9wdGlvbnM/LmVkaXRvck9wdGlvbnNcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKSxcblx0XHRcdG9wdGlvbnM/Lm9wZW5Ub1NpZGVcblx0XHQpO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5lclNlcnZpY2UgaW1wbGVtZW50cyBJT3BlbmVyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3BlbmVycyA9IG5ldyBMaW5rZWRMaXN0PElPcGVuZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbGlkYXRvcnMgPSBuZXcgTGlua2VkTGlzdDxJVmFsaWRhdG9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlcnMgPSBuZXcgTGlua2VkTGlzdDxJRXh0ZXJuYWxVcmlSZXNvbHZlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRVcmlUYXJnZXRzID0gbmV3IFJlc291cmNlTWFwPFVSST4odXJpID0+IHVyaS53aXRoKHsgcGF0aDogbnVsbCwgZnJhZ21lbnQ6IG51bGwsIHF1ZXJ5OiBudWxsIH0pLnRvU3RyaW5nKCkpO1xuXG5cdHByaXZhdGUgX2RlZmF1bHRFeHRlcm5hbE9wZW5lcjogSUV4dGVybmFsT3BlbmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlcm5hbE9wZW5lcnMgPSBuZXcgTGlua2VkTGlzdDxJRXh0ZXJuYWxPcGVuZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIERlZmF1bHQgZXh0ZXJuYWwgb3BlbmVyIGlzIGdvaW5nIHRocm91Z2ggd2luZG93Lm9wZW4oKVxuXHRcdHRoaXMuX2RlZmF1bHRFeHRlcm5hbE9wZW5lciA9IHtcblx0XHRcdG9wZW5FeHRlcm5hbDogYXN5bmMgaHJlZiA9PiB7XG5cdFx0XHRcdC8vIGVuc3VyZSB0byBvcGVuIEhUVFAvSFRUUFMgbGlua3MgaW50byBuZXcgd2luZG93c1xuXHRcdFx0XHQvLyB0byBub3QgdHJpZ2dlciBhIG5hdmlnYXRpb24uIEFueSBvdGhlciBsaW5rIGlzXG5cdFx0XHRcdC8vIHNhZmUgdG8gYmUgc2V0IGFzIEhSRUYgdG8gcHJldmVudCBhIGJsYW5rIHdpbmRvd1xuXHRcdFx0XHQvLyBmcm9tIG9wZW5pbmcuXG5cdFx0XHRcdGlmIChtYXRjaGVzU29tZVNjaGVtZShocmVmLCBTY2hlbWFzLmh0dHAsIFNjaGVtYXMuaHR0cHMpKSB7XG5cdFx0XHRcdFx0ZG9tLndpbmRvd09wZW5Ob09wZW5lcihocmVmKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtYWluV2luZG93LmxvY2F0aW9uLmhyZWYgPSBocmVmO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBEZWZhdWx0IG9wZW5lcjogYW55IGV4dGVybmFsLCBtYWl0bywgaHR0cChzKSwgY29tbWFuZCwgYW5kIGNhdGNoLWFsbC1lZGl0b3JzXG5cdFx0dGhpcy5fb3BlbmVycy5wdXNoKHtcblx0XHRcdG9wZW46IGFzeW5jICh0YXJnZXQ6IFVSSSB8IHN0cmluZywgb3B0aW9ucz86IE9wZW5PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5vcGVuRXh0ZXJuYWwgfHwgbWF0Y2hlc1NvbWVTY2hlbWUodGFyZ2V0LCBTY2hlbWFzLm1haWx0bywgU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzLCBTY2hlbWFzLnZzbHMpKSB7XG5cdFx0XHRcdFx0Ly8gb3BlbiBleHRlcm5hbGx5XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZG9PcGVuRXh0ZXJuYWwodGFyZ2V0LCBvcHRpb25zKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fb3BlbmVycy5wdXNoKG5ldyBDb21tYW5kT3BlbmVyKGNvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fb3BlbmVycy5wdXNoKG5ldyBFZGl0b3JPcGVuZXIoZWRpdG9yU2VydmljZSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJPcGVuZXIob3BlbmVyOiBJT3BlbmVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuX29wZW5lcnMudW5zaGlmdChvcGVuZXIpO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6IHJlbW92ZSB9O1xuXHR9XG5cblx0cmVnaXN0ZXJWYWxpZGF0b3IodmFsaWRhdG9yOiBJVmFsaWRhdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHJlbW92ZSA9IHRoaXMuX3ZhbGlkYXRvcnMucHVzaCh2YWxpZGF0b3IpO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6IHJlbW92ZSB9O1xuXHR9XG5cblx0cmVnaXN0ZXJFeHRlcm5hbFVyaVJlc29sdmVyKHJlc29sdmVyOiBJRXh0ZXJuYWxVcmlSZXNvbHZlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZW1vdmUgPSB0aGlzLl9yZXNvbHZlcnMucHVzaChyZXNvbHZlcik7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogcmVtb3ZlIH07XG5cdH1cblxuXHRzZXREZWZhdWx0RXh0ZXJuYWxPcGVuZXIoZXh0ZXJuYWxPcGVuZXI6IElFeHRlcm5hbE9wZW5lcik6IHZvaWQge1xuXHRcdHRoaXMuX2RlZmF1bHRFeHRlcm5hbE9wZW5lciA9IGV4dGVybmFsT3BlbmVyO1xuXHR9XG5cblx0cmVnaXN0ZXJFeHRlcm5hbE9wZW5lcihvcGVuZXI6IElFeHRlcm5hbE9wZW5lcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZW1vdmUgPSB0aGlzLl9leHRlcm5hbE9wZW5lcnMucHVzaChvcGVuZXIpO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6IHJlbW92ZSB9O1xuXHR9XG5cblx0YXN5bmMgb3Blbih0YXJnZXQ6IFVSSSB8IHN0cmluZywgb3B0aW9ucz86IE9wZW5PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgdGFyZ2V0VVJJID0gdHlwZW9mIHRhcmdldCA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UodGFyZ2V0KSA6IHRhcmdldDtcblxuXHRcdC8vIEludGVybmFsIHNjaGVtZXMgYXJlIG5vdCBvcGVuYWJsZSBhbmQgbXVzdCBpbnN0ZWFkIGJlIGhhbmRsZWQgaW4gZXZlbnQgbGlzdGVuZXJzXG5cdFx0aWYgKHRhcmdldFVSSS5zY2hlbWUgPT09IFNjaGVtYXMuaW50ZXJuYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBjaGVjayB3aXRoIGNvbnRyaWJ1dGVkIHZhbGlkYXRvcnNcblx0XHRpZiAoIW9wdGlvbnM/LnNraXBWYWxpZGF0aW9uKSB7XG5cdFx0XHRjb25zdCB2YWxpZGF0aW9uVGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZWRVcmlUYXJnZXRzLmdldCh0YXJnZXRVUkkpID8/IHRhcmdldDsgLy8gdmFsaWRhdGUgYWdhaW5zdCB0aGUgb3JpZ2luYWwgVVJJIHRoYXQgdGhpcyBVUkkgcmVzb2x2ZXMgdG8sIGlmIG9uZSBleGlzdHNcblx0XHRcdGZvciAoY29uc3QgdmFsaWRhdG9yIG9mIHRoaXMuX3ZhbGlkYXRvcnMpIHtcblx0XHRcdFx0aWYgKCEoYXdhaXQgdmFsaWRhdG9yLnNob3VsZE9wZW4odmFsaWRhdGlvblRhcmdldCwgb3B0aW9ucykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgd2l0aCBjb250cmlidXRlZCBvcGVuZXJzXG5cdFx0Zm9yIChjb25zdCBvcGVuZXIgb2YgdGhpcy5fb3BlbmVycykge1xuXHRcdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IG9wZW5lci5vcGVuKHRhcmdldCwgb3B0aW9ucyk7XG5cdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlRXh0ZXJuYWxVcmkocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IFJlc29sdmVFeHRlcm5hbFVyaU9wdGlvbnMpOiBQcm9taXNlPElSZXNvbHZlZEV4dGVybmFsVXJpPiB7XG5cdFx0Zm9yIChjb25zdCByZXNvbHZlciBvZiB0aGlzLl9yZXNvbHZlcnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc29sdmVyLnJlc29sdmVFeHRlcm5hbFVyaShyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkVXJpVGFyZ2V0cy5oYXMocmVzdWx0LnJlc29sdmVkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRVcmlUYXJnZXRzLnNldChyZXN1bHQucmVzb2x2ZWQsIHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIG5vb3Bcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCByZXNvbHZlIGV4dGVybmFsIFVSSTogJyArIHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9PcGVuRXh0ZXJuYWwocmVzb3VyY2U6IFVSSSB8IHN0cmluZywgb3B0aW9uczogT3Blbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vdG9kb0Bqcmlla2VuIElFeHRlcm5hbFVyaVJlc29sdmVyIHNob3VsZCBzdXBwb3J0IGB1cmk6IFVSSSB8IHN0cmluZ2Bcblx0XHRjb25zdCB1cmkgPSB0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHJlc291cmNlKSA6IHJlc291cmNlO1xuXHRcdGxldCBleHRlcm5hbFVyaTogVVJJO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGV4dGVybmFsVXJpID0gKGF3YWl0IHRoaXMucmVzb2x2ZUV4dGVybmFsVXJpKHVyaSwgb3B0aW9ucykpLnJlc29sdmVkO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0ZXh0ZXJuYWxVcmkgPSB1cmk7XG5cdFx0fVxuXG5cdFx0bGV0IGhyZWY6IHN0cmluZztcblx0XHRpZiAodHlwZW9mIHJlc291cmNlID09PSAnc3RyaW5nJyAmJiB1cmkudG9TdHJpbmcoKSA9PT0gZXh0ZXJuYWxVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0Ly8gb3BlbiB0aGUgdXJsLXN0cmluZyBBUyBJU1xuXHRcdFx0aHJlZiA9IHJlc291cmNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBvcGVuIFVSSSB1c2luZyB0aGUgdG9TdHJpbmcobm9FbmNvZGUpK2VuY29kZVVSSS10cmlja1xuXHRcdFx0aHJlZiA9IGVuY29kZVVSSShleHRlcm5hbFVyaS50b1N0cmluZyh0cnVlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LmFsbG93Q29udHJpYnV0ZWRPcGVuZXJzKSB7XG5cdFx0XHRjb25zdCBwcmVmZXJyZWRPcGVuZXJJZCA9IHR5cGVvZiBvcHRpb25zPy5hbGxvd0NvbnRyaWJ1dGVkT3BlbmVycyA9PT0gJ3N0cmluZycgPyBvcHRpb25zPy5hbGxvd0NvbnRyaWJ1dGVkT3BlbmVycyA6IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3Qgb3BlbmVyIG9mIHRoaXMuX2V4dGVybmFsT3BlbmVycykge1xuXHRcdFx0XHRjb25zdCBkaWRPcGVuID0gYXdhaXQgb3BlbmVyLm9wZW5FeHRlcm5hbChocmVmLCB7XG5cdFx0XHRcdFx0c291cmNlVXJpOiB1cmksXG5cdFx0XHRcdFx0cHJlZmVycmVkT3BlbmVySWQsXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRpZiAoZGlkT3Blbikge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRFeHRlcm5hbE9wZW5lci5vcGVuRXh0ZXJuYWwoaHJlZiwgeyBzb3VyY2VVcmk6IHVyaSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fdmFsaWRhdG9ycy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlLG1CQUFtQixlQUFlO0FBQzFELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUFrSztBQUUzSyxJQUFNLGdCQUFOLE1BQXVDO0FBQUEsRUFFdEMsWUFBOEMsaUJBQWtDO0FBQWxDO0FBQUEsRUFBb0M7QUFBQSxFQUVsRixNQUFNLEtBQUssUUFBc0IsU0FBeUM7QUFDekUsUUFBSSxDQUFDLGNBQWMsUUFBUSxRQUFRLE9BQU8sR0FBRztBQUM1QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksQ0FBQyxTQUFTLGVBQWU7QUFHNUIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLGVBQVMsSUFBSSxNQUFNLE1BQU07QUFBQSxJQUMxQjtBQUVBLFFBQUksTUFBTSxRQUFR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
