import { parse as jsonParse, getNodeType } from "../../../../base/common/json.js";
import { localize } from "../../../../nls.js";
import { extname, basename } from "../../../../base/common/path.js";
import { SnippetParser, Variable, Placeholder, Text } from "../../../../editor/contrib/snippet/browser/snippetParser.js";
import { KnownSnippetVariableNames } from "../../../../editor/contrib/snippet/browser/snippetVariables.js";
import { relativePath } from "../../../../base/common/resources.js";
import { isObject } from "../../../../base/common/types.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { WindowIdleValue, getActiveWindow } from "../../../../base/browser/dom.js";
import { match as matchGlob } from "../../../../base/common/glob.js";
import { Schemas } from "../../../../base/common/network.js";
class SnippetBodyInsights {
  constructor(body) {
    this.isBogous = false;
    this.isTrivial = false;
    this.usesClipboardVariable = false;
    this.usesSelectionVariable = false;
    this.codeSnippet = body;
    const textmateSnippet = new SnippetParser().parse(body, false);
    const placeholders = /* @__PURE__ */ new Map();
    let placeholderMax = 0;
    for (const placeholder of textmateSnippet.placeholders) {
      placeholderMax = Math.max(placeholderMax, placeholder.index);
    }
    if (textmateSnippet.placeholders.length === 0) {
      this.isTrivial = true;
    } else if (placeholderMax === 0) {
      const last = textmateSnippet.children.at(-1);
      this.isTrivial = last instanceof Placeholder && last.isFinalTabstop;
    }
    const stack = [...textmateSnippet.children];
    while (stack.length > 0) {
      const marker = stack.shift();
      if (marker instanceof Variable) {
        if (marker.children.length === 0 && !KnownSnippetVariableNames[marker.name]) {
          const index = placeholders.has(marker.name) ? placeholders.get(marker.name) : ++placeholderMax;
          placeholders.set(marker.name, index);
          const synthetic = new Placeholder(index).appendChild(new Text(marker.name));
          textmateSnippet.replace(marker, [synthetic]);
          this.isBogous = true;
        }
        switch (marker.name) {
          case "CLIPBOARD":
            this.usesClipboardVariable = true;
            break;
          case "SELECTION":
          case "TM_SELECTED_TEXT":
            this.usesSelectionVariable = true;
            break;
        }
      } else {
        stack.push(...marker.children);
      }
    }
    if (this.isBogous) {
      this.codeSnippet = textmateSnippet.toTextmateString();
    }
  }
}
class Snippet {
  constructor(isFileTemplate, scopes, name, prefix, description, body, source, snippetSource, snippetIdentifier, include, exclude, extensionId) {
    this.isFileTemplate = isFileTemplate;
    this.scopes = scopes;
    this.name = name;
    this.prefix = prefix;
    this.description = description;
    this.body = body;
    this.source = source;
    this.snippetSource = snippetSource;
    this.snippetIdentifier = snippetIdentifier;
    this.include = include;
    this.exclude = exclude;
    this.extensionId = extensionId;
    this.prefixLow = prefix.toLowerCase();
    this._bodyInsights = new WindowIdleValue(getActiveWindow(), () => new SnippetBodyInsights(this.body));
  }
  get codeSnippet() {
    return this._bodyInsights.value.codeSnippet;
  }
  get isBogous() {
    return this._bodyInsights.value.isBogous;
  }
  get isTrivial() {
    return this._bodyInsights.value.isTrivial;
  }
  get needsClipboard() {
    return this._bodyInsights.value.usesClipboardVariable;
  }
  get usesSelection() {
    return this._bodyInsights.value.usesSelectionVariable;
  }
  isFileIncluded(resourceUri) {
    const uriPath = resourceUri.scheme === Schemas.file ? resourceUri.fsPath : resourceUri.path;
    const fileName = basename(uriPath);
    const getMatchTarget = (pattern) => {
      return pattern.includes("/") ? uriPath : fileName;
    };
    if (this.exclude) {
      for (const pattern of this.exclude.filter(Boolean)) {
        if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
          return false;
        }
      }
    }
    if (this.include) {
      for (const pattern of this.include.filter(Boolean)) {
        if (matchGlob(pattern, getMatchTarget(pattern), { ignoreCase: true })) {
          return true;
        }
      }
      return false;
    }
    return true;
  }
}
function isJsonSerializedSnippet(thing) {
  return isObject(thing) && Boolean(thing.body);
}
var SnippetSource = /* @__PURE__ */ ((SnippetSource2) => {
  SnippetSource2[SnippetSource2["User"] = 1] = "User";
  SnippetSource2[SnippetSource2["Workspace"] = 2] = "Workspace";
  SnippetSource2[SnippetSource2["Extension"] = 3] = "Extension";
  return SnippetSource2;
})(SnippetSource || {});
class SnippetFile {
  constructor(source, location, defaultScopes, _extension, _fileService, _extensionResourceLoaderService) {
    this.source = source;
    this.location = location;
    this.defaultScopes = defaultScopes;
    this._extension = _extension;
    this._fileService = _fileService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this.data = [];
    this.isGlobalSnippets = extname(location.path) === ".code-snippets";
    this.isUserSnippets = !this._extension;
  }
  select(selector, bucket) {
    if (this.isGlobalSnippets || !this.isUserSnippets) {
      this._scopeSelect(selector, bucket);
    } else {
      this._filepathSelect(selector, bucket);
    }
  }
  _filepathSelect(selector, bucket) {
    if (selector + ".json" === basename(this.location.path)) {
      bucket.push(...this.data);
    }
  }
  _scopeSelect(selector, bucket) {
    for (const snippet of this.data) {
      const len = snippet.scopes.length;
      if (len === 0) {
        bucket.push(snippet);
      } else {
        for (let i = 0; i < len; i++) {
          if (snippet.scopes[i] === selector) {
            bucket.push(snippet);
            break;
          }
        }
      }
    }
    const idx = selector.lastIndexOf(".");
    if (idx >= 0) {
      this._scopeSelect(selector.substring(0, idx), bucket);
    }
  }
  async _load() {
    if (this._extension) {
      return this._extensionResourceLoaderService.readExtensionResource(this.location);
    } else {
      const content = await this._fileService.readFile(this.location);
      return content.value.toString();
    }
  }
  load() {
    if (!this._loadPromise) {
      this._loadPromise = Promise.resolve(this._load()).then((content) => {
        const data = jsonParse(content);
        if (getNodeType(data) === "object") {
          for (const [name, scopeOrTemplate] of Object.entries(data)) {
            if (isJsonSerializedSnippet(scopeOrTemplate)) {
              this._parseSnippet(name, scopeOrTemplate, this.data);
            } else {
              for (const [name2, template] of Object.entries(scopeOrTemplate)) {
                this._parseSnippet(name2, template, this.data);
              }
            }
          }
        }
        return this;
      });
    }
    return this._loadPromise;
  }
  reset() {
    this._loadPromise = void 0;
    this.data.length = 0;
  }
  _parseSnippet(name, snippet, bucket) {
    let { isFileTemplate, prefix, body, description } = snippet;
    if (!prefix) {
      prefix = "";
    }
    if (Array.isArray(body)) {
      body = body.join("\n");
    }
    if (typeof body !== "string") {
      return;
    }
    if (Array.isArray(description)) {
      description = description.join("\n");
    }
    let scopes;
    if (this.defaultScopes) {
      scopes = this.defaultScopes;
    } else if (typeof snippet.scope === "string") {
      scopes = snippet.scope.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      scopes = [];
    }
    let include;
    if (snippet.include) {
      if (Array.isArray(snippet.include)) {
        include = snippet.include;
      } else if (typeof snippet.include === "string") {
        include = [snippet.include];
      }
    }
    let exclude;
    if (snippet.exclude) {
      if (Array.isArray(snippet.exclude)) {
        exclude = snippet.exclude;
      } else if (typeof snippet.exclude === "string") {
        exclude = [snippet.exclude];
      }
    }
    let source;
    if (this._extension) {
      source = this._extension.displayName || this._extension.name;
    } else if (this.source === 2 /* Workspace */) {
      source = localize("source.workspaceSnippetGlobal", "Workspace Snippet");
    } else {
      if (this.isGlobalSnippets) {
        source = localize("source.userSnippetGlobal", "Global User Snippet");
      } else {
        source = localize("source.userSnippet", "User Snippet");
      }
    }
    for (const _prefix of Iterable.wrap(prefix)) {
      bucket.push(new Snippet(
        Boolean(isFileTemplate),
        scopes,
        name,
        _prefix,
        description,
        body,
        source,
        this.source,
        this._extension ? `${relativePath(this._extension.extensionLocation, this.location)}/${name}` : `${basename(this.location.path)}/${name}`,
        include,
        exclude,
        this._extension?.identifier
      ));
    }
  }
}
export {
  Snippet,
  SnippetFile,
  SnippetSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFxicm93c2VyXFxzbmlwcGV0c0ZpbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBqc29uUGFyc2UsIGdldE5vZGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciwgVmFyaWFibGUsIFBsYWNlaG9sZGVyLCBUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgS25vd25TbmlwcGV0VmFyaWFibGVOYW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgV2luZG93SWRsZVZhbHVlLCBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1hdGNoIGFzIG1hdGNoR2xvYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5jbGFzcyBTbmlwcGV0Qm9keUluc2lnaHRzIHtcblxuXHRyZWFkb25seSBjb2RlU25pcHBldDogc3RyaW5nO1xuXG5cdC8qKiBUaGUgc25pcHBldCB1c2VzIGJhZCBwbGFjZWhvbGRlcnMgd2hpY2ggY29sbGlkZSB3aXRoIHZhcmlhYmxlIG5hbWVzICovXG5cdHJlYWRvbmx5IGlzQm9nb3VzOiBib29sZWFuO1xuXG5cdC8qKiBUaGUgc25pcHBldCBoYXMgbm8gcGxhY2Vob2xkZXIgb2YgdGhlIGZpbmFsIHBsYWNlaG9sZGVyIGlzIGF0IHRoZSBlbmQgKi9cblx0cmVhZG9ubHkgaXNUcml2aWFsOiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IHVzZXNDbGlwYm9hcmRWYXJpYWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgdXNlc1NlbGVjdGlvblZhcmlhYmxlOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGJvZHk6IHN0cmluZykge1xuXG5cdFx0Ly8gaW5pdCB3aXRoIGRlZmF1bHRzXG5cdFx0dGhpcy5pc0JvZ291cyA9IGZhbHNlO1xuXHRcdHRoaXMuaXNUcml2aWFsID0gZmFsc2U7XG5cdFx0dGhpcy51c2VzQ2xpcGJvYXJkVmFyaWFibGUgPSBmYWxzZTtcblx0XHR0aGlzLnVzZXNTZWxlY3Rpb25WYXJpYWJsZSA9IGZhbHNlO1xuXHRcdHRoaXMuY29kZVNuaXBwZXQgPSBib2R5O1xuXG5cdFx0Ly8gY2hlY2sgc25pcHBldC4uLlxuXHRcdGNvbnN0IHRleHRtYXRlU25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoYm9keSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRsZXQgcGxhY2Vob2xkZXJNYXggPSAwO1xuXHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXIgb2YgdGV4dG1hdGVTbmlwcGV0LnBsYWNlaG9sZGVycykge1xuXHRcdFx0cGxhY2Vob2xkZXJNYXggPSBNYXRoLm1heChwbGFjZWhvbGRlck1heCwgcGxhY2Vob2xkZXIuaW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIG1hcmsgc25pcHBldCBhcyB0cml2aWFsIHdoZW4gdGhlcmUgaXMgbm8gcGxhY2Vob2xkZXJzIG9yIHdoZW4gdGhlIG9ubHlcblx0XHQvLyBwbGFjZWhvbGRlciBpcyB0aGUgZmluYWwgdGFic3RvcCBhbmQgaXQgaXMgYXQgdGhlIHZlcnkgZW5kLlxuXHRcdGlmICh0ZXh0bWF0ZVNuaXBwZXQucGxhY2Vob2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5pc1RyaXZpYWwgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAocGxhY2Vob2xkZXJNYXggPT09IDApIHtcblx0XHRcdGNvbnN0IGxhc3QgPSB0ZXh0bWF0ZVNuaXBwZXQuY2hpbGRyZW4uYXQoLTEpO1xuXHRcdFx0dGhpcy5pc1RyaXZpYWwgPSBsYXN0IGluc3RhbmNlb2YgUGxhY2Vob2xkZXIgJiYgbGFzdC5pc0ZpbmFsVGFic3RvcDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFjayA9IFsuLi50ZXh0bWF0ZVNuaXBwZXQuY2hpbGRyZW5dO1xuXHRcdHdoaWxlIChzdGFjay5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSBzdGFjay5zaGlmdCgpITtcblx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBWYXJpYWJsZSkge1xuXG5cdFx0XHRcdGlmIChtYXJrZXIuY2hpbGRyZW4ubGVuZ3RoID09PSAwICYmICFLbm93blNuaXBwZXRWYXJpYWJsZU5hbWVzW21hcmtlci5uYW1lXSkge1xuXHRcdFx0XHRcdC8vIGEgJ3ZhcmlhYmxlJyB3aXRob3V0IGEgZGVmYXVsdCB2YWx1ZSBhbmQgbm90IGJlaW5nIG9uZSBvZiBvdXIgc3VwcG9ydGVkXG5cdFx0XHRcdFx0Ly8gdmFyaWFibGVzIGlzIGF1dG9tYXRpY2FsbHkgdHVybmVkIGludG8gYSBwbGFjZWhvbGRlci4gVGhpcyBpcyB0byByZXN0b3JlXG5cdFx0XHRcdFx0Ly8gYSBidWcgd2UgaGFkIGJlZm9yZS4gU28gYCR7Zm9vfWAgYmVjb21lcyBgJHtOOmZvb31gXG5cdFx0XHRcdFx0Y29uc3QgaW5kZXggPSBwbGFjZWhvbGRlcnMuaGFzKG1hcmtlci5uYW1lKSA/IHBsYWNlaG9sZGVycy5nZXQobWFya2VyLm5hbWUpISA6ICsrcGxhY2Vob2xkZXJNYXg7XG5cdFx0XHRcdFx0cGxhY2Vob2xkZXJzLnNldChtYXJrZXIubmFtZSwgaW5kZXgpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc3ludGhldGljID0gbmV3IFBsYWNlaG9sZGVyKGluZGV4KS5hcHBlbmRDaGlsZChuZXcgVGV4dChtYXJrZXIubmFtZSkpO1xuXHRcdFx0XHRcdHRleHRtYXRlU25pcHBldC5yZXBsYWNlKG1hcmtlciwgW3N5bnRoZXRpY10pO1xuXHRcdFx0XHRcdHRoaXMuaXNCb2dvdXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3dpdGNoIChtYXJrZXIubmFtZSkge1xuXHRcdFx0XHRcdGNhc2UgJ0NMSVBCT0FSRCc6XG5cdFx0XHRcdFx0XHR0aGlzLnVzZXNDbGlwYm9hcmRWYXJpYWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdTRUxFQ1RJT04nOlxuXHRcdFx0XHRcdGNhc2UgJ1RNX1NFTEVDVEVEX1RFWFQnOlxuXHRcdFx0XHRcdFx0dGhpcy51c2VzU2VsZWN0aW9uVmFyaWFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcmVjdXJzZVxuXHRcdFx0XHRzdGFjay5wdXNoKC4uLm1hcmtlci5jaGlsZHJlbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNCb2dvdXMpIHtcblx0XHRcdHRoaXMuY29kZVNuaXBwZXQgPSB0ZXh0bWF0ZVNuaXBwZXQudG9UZXh0bWF0ZVN0cmluZygpO1xuXHRcdH1cblxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTbmlwcGV0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ib2R5SW5zaWdodHM6IFdpbmRvd0lkbGVWYWx1ZTxTbmlwcGV0Qm9keUluc2lnaHRzPjtcblxuXHRyZWFkb25seSBwcmVmaXhMb3c6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpc0ZpbGVUZW1wbGF0ZTogYm9vbGVhbixcblx0XHRyZWFkb25seSBzY29wZXM6IHN0cmluZ1tdLFxuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRyZWFkb25seSBwcmVmaXg6IHN0cmluZyxcblx0XHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGJvZHk6IHN0cmluZyxcblx0XHRyZWFkb25seSBzb3VyY2U6IHN0cmluZyxcblx0XHRyZWFkb25seSBzbmlwcGV0U291cmNlOiBTbmlwcGV0U291cmNlLFxuXHRcdHJlYWRvbmx5IHNuaXBwZXRJZGVudGlmaWVyOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgaW5jbHVkZT86IHN0cmluZ1tdLFxuXHRcdHJlYWRvbmx5IGV4Y2x1ZGU/OiBzdHJpbmdbXSxcblx0XHRyZWFkb25seSBleHRlbnNpb25JZD86IEV4dGVuc2lvbklkZW50aWZpZXIsXG5cdCkge1xuXHRcdHRoaXMucHJlZml4TG93ID0gcHJlZml4LnRvTG93ZXJDYXNlKCk7XG5cdFx0dGhpcy5fYm9keUluc2lnaHRzID0gbmV3IFdpbmRvd0lkbGVWYWx1ZShnZXRBY3RpdmVXaW5kb3coKSwgKCkgPT4gbmV3IFNuaXBwZXRCb2R5SW5zaWdodHModGhpcy5ib2R5KSk7XG5cdH1cblxuXHRnZXQgY29kZVNuaXBwZXQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYm9keUluc2lnaHRzLnZhbHVlLmNvZGVTbmlwcGV0O1xuXHR9XG5cblx0Z2V0IGlzQm9nb3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ib2R5SW5zaWdodHMudmFsdWUuaXNCb2dvdXM7XG5cdH1cblxuXHRnZXQgaXNUcml2aWFsKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ib2R5SW5zaWdodHMudmFsdWUuaXNUcml2aWFsO1xuXHR9XG5cblx0Z2V0IG5lZWRzQ2xpcGJvYXJkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ib2R5SW5zaWdodHMudmFsdWUudXNlc0NsaXBib2FyZFZhcmlhYmxlO1xuXHR9XG5cblx0Z2V0IHVzZXNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2JvZHlJbnNpZ2h0cy52YWx1ZS51c2VzU2VsZWN0aW9uVmFyaWFibGU7XG5cdH1cblxuXHRpc0ZpbGVJbmNsdWRlZChyZXNvdXJjZVVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdXJpUGF0aCA9IHJlc291cmNlVXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gcmVzb3VyY2VVcmkuZnNQYXRoIDogcmVzb3VyY2VVcmkucGF0aDtcblx0XHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKHVyaVBhdGgpO1xuXG5cdFx0Y29uc3QgZ2V0TWF0Y2hUYXJnZXQgPSAocGF0dGVybjogc3RyaW5nKTogc3RyaW5nID0+IHtcblx0XHRcdHJldHVybiBwYXR0ZXJuLmluY2x1ZGVzKCcvJykgPyB1cmlQYXRoIDogZmlsZU5hbWU7XG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLmV4Y2x1ZGUpIHtcblx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiB0aGlzLmV4Y2x1ZGUuZmlsdGVyKEJvb2xlYW4pKSB7XG5cdFx0XHRcdGlmIChtYXRjaEdsb2IocGF0dGVybiwgZ2V0TWF0Y2hUYXJnZXQocGF0dGVybiksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmluY2x1ZGUpIHtcblx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiB0aGlzLmluY2x1ZGUuZmlsdGVyKEJvb2xlYW4pKSB7XG5cdFx0XHRcdGlmIChtYXRjaEdsb2IocGF0dGVybiwgZ2V0TWF0Y2hUYXJnZXQocGF0dGVybiksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuXG5pbnRlcmZhY2UgSnNvblNlcmlhbGl6ZWRTbmlwcGV0IHtcblx0aXNGaWxlVGVtcGxhdGU/OiBib29sZWFuO1xuXHRib2R5OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0c2NvcGU/OiBzdHJpbmc7XG5cdHByZWZpeDogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGluY2x1ZGU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0ZXhjbHVkZT86IHN0cmluZyB8IHN0cmluZ1tdO1xufVxuXG5mdW5jdGlvbiBpc0pzb25TZXJpYWxpemVkU25pcHBldCh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIEpzb25TZXJpYWxpemVkU25pcHBldCB7XG5cdHJldHVybiBpc09iamVjdCh0aGluZykgJiYgQm9vbGVhbigoPEpzb25TZXJpYWxpemVkU25pcHBldD50aGluZykuYm9keSk7XG59XG5cbmludGVyZmFjZSBKc29uU2VyaWFsaXplZFNuaXBwZXRzIHtcblx0W25hbWU6IHN0cmluZ106IEpzb25TZXJpYWxpemVkU25pcHBldCB8IHsgW25hbWU6IHN0cmluZ106IEpzb25TZXJpYWxpemVkU25pcHBldCB9O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTbmlwcGV0U291cmNlIHtcblx0VXNlciA9IDEsXG5cdFdvcmtzcGFjZSA9IDIsXG5cdEV4dGVuc2lvbiA9IDMsXG59XG5cbmV4cG9ydCBjbGFzcyBTbmlwcGV0RmlsZSB7XG5cblx0cmVhZG9ubHkgZGF0YTogU25pcHBldFtdID0gW107XG5cdHJlYWRvbmx5IGlzR2xvYmFsU25pcHBldHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVXNlclNuaXBwZXRzOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX2xvYWRQcm9taXNlPzogUHJvbWlzZTx0aGlzPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzb3VyY2U6IFNuaXBwZXRTb3VyY2UsXG5cdFx0cmVhZG9ubHkgbG9jYXRpb246IFVSSSxcblx0XHRwdWJsaWMgZGVmYXVsdFNjb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuaXNHbG9iYWxTbmlwcGV0cyA9IGV4dG5hbWUobG9jYXRpb24ucGF0aCkgPT09ICcuY29kZS1zbmlwcGV0cyc7XG5cdFx0dGhpcy5pc1VzZXJTbmlwcGV0cyA9ICF0aGlzLl9leHRlbnNpb247XG5cdH1cblxuXHRzZWxlY3Qoc2VsZWN0b3I6IHN0cmluZywgYnVja2V0OiBTbmlwcGV0W10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0dsb2JhbFNuaXBwZXRzIHx8ICF0aGlzLmlzVXNlclNuaXBwZXRzKSB7XG5cdFx0XHR0aGlzLl9zY29wZVNlbGVjdChzZWxlY3RvciwgYnVja2V0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZmlsZXBhdGhTZWxlY3Qoc2VsZWN0b3IsIGJ1Y2tldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmlsZXBhdGhTZWxlY3Qoc2VsZWN0b3I6IHN0cmluZywgYnVja2V0OiBTbmlwcGV0W10pOiB2b2lkIHtcblx0XHQvLyBmb3IgYGZvb0xhbmcuanNvbmAgZmlsZXMgYXBwbHkgaW5jbHVzaW9uL2V4Y2x1c2lvbiBydWxlcyBvbmx5XG5cdFx0aWYgKHNlbGVjdG9yICsgJy5qc29uJyA9PT0gYmFzZW5hbWUodGhpcy5sb2NhdGlvbi5wYXRoKSkge1xuXHRcdFx0YnVja2V0LnB1c2goLi4udGhpcy5kYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY29wZVNlbGVjdChzZWxlY3Rvcjogc3RyaW5nLCBidWNrZXQ6IFNuaXBwZXRbXSk6IHZvaWQge1xuXHRcdC8vIGZvciBgbXkuY29kZS1zbmlwcGV0c2AgZmlsZXMgd2UgbmVlZCB0byBsb29rIGF0IGVhY2ggc25pcHBldFxuXHRcdGZvciAoY29uc3Qgc25pcHBldCBvZiB0aGlzLmRhdGEpIHtcblx0XHRcdGNvbnN0IGxlbiA9IHNuaXBwZXQuc2NvcGVzLmxlbmd0aDtcblx0XHRcdGlmIChsZW4gPT09IDApIHtcblx0XHRcdFx0Ly8gYWx3YXlzIGFjY2VwdFxuXHRcdFx0XHRidWNrZXQucHVzaChzbmlwcGV0KTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdC8vIG1hdGNoXG5cdFx0XHRcdFx0aWYgKHNuaXBwZXQuc2NvcGVzW2ldID09PSBzZWxlY3Rvcikge1xuXHRcdFx0XHRcdFx0YnVja2V0LnB1c2goc25pcHBldCk7XG5cdFx0XHRcdFx0XHRicmVhazsgLy8gbWF0Y2ggb25seSBvbmNlIVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlkeCA9IHNlbGVjdG9yLmxhc3RJbmRleE9mKCcuJyk7XG5cdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9zY29wZVNlbGVjdChzZWxlY3Rvci5zdWJzdHJpbmcoMCwgaWR4KSwgYnVja2V0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9sb2FkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UodGhpcy5sb2NhdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmxvY2F0aW9uKTtcblx0XHRcdHJldHVybiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0bG9hZCgpOiBQcm9taXNlPHRoaXM+IHtcblx0XHRpZiAoIXRoaXMuX2xvYWRQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9sb2FkUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSh0aGlzLl9sb2FkKCkpLnRoZW4oY29udGVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSA8SnNvblNlcmlhbGl6ZWRTbmlwcGV0cz5qc29uUGFyc2UoY29udGVudCk7XG5cdFx0XHRcdGlmIChnZXROb2RlVHlwZShkYXRhKSA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtuYW1lLCBzY29wZU9yVGVtcGxhdGVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEpKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNKc29uU2VyaWFsaXplZFNuaXBwZXQoc2NvcGVPclRlbXBsYXRlKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wYXJzZVNuaXBwZXQobmFtZSwgc2NvcGVPclRlbXBsYXRlLCB0aGlzLmRhdGEpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdGVtcGxhdGVdIG9mIE9iamVjdC5lbnRyaWVzKHNjb3BlT3JUZW1wbGF0ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9wYXJzZVNuaXBwZXQobmFtZSwgdGVtcGxhdGUsIHRoaXMuZGF0YSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xvYWRQcm9taXNlO1xuXHR9XG5cblx0cmVzZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9hZFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kYXRhLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZVNuaXBwZXQobmFtZTogc3RyaW5nLCBzbmlwcGV0OiBKc29uU2VyaWFsaXplZFNuaXBwZXQsIGJ1Y2tldDogU25pcHBldFtdKTogdm9pZCB7XG5cblx0XHRsZXQgeyBpc0ZpbGVUZW1wbGF0ZSwgcHJlZml4LCBib2R5LCBkZXNjcmlwdGlvbiB9ID0gc25pcHBldDtcblxuXHRcdGlmICghcHJlZml4KSB7XG5cdFx0XHRwcmVmaXggPSAnJztcblx0XHR9XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShib2R5KSkge1xuXHRcdFx0Ym9keSA9IGJvZHkuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYm9keSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShkZXNjcmlwdGlvbikpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24uam9pbignXFxuJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHNjb3Blczogc3RyaW5nW107XG5cdFx0aWYgKHRoaXMuZGVmYXVsdFNjb3Blcykge1xuXHRcdFx0c2NvcGVzID0gdGhpcy5kZWZhdWx0U2NvcGVzO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHNuaXBwZXQuc2NvcGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRzY29wZXMgPSBzbmlwcGV0LnNjb3BlLnNwbGl0KCcsJykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihCb29sZWFuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2NvcGVzID0gW107XG5cdFx0fVxuXG5cdFx0bGV0IGluY2x1ZGU6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzbmlwcGV0LmluY2x1ZGUpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHNuaXBwZXQuaW5jbHVkZSkpIHtcblx0XHRcdFx0aW5jbHVkZSA9IHNuaXBwZXQuaW5jbHVkZTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHNuaXBwZXQuaW5jbHVkZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0aW5jbHVkZSA9IFtzbmlwcGV0LmluY2x1ZGVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBleGNsdWRlOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc25pcHBldC5leGNsdWRlKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShzbmlwcGV0LmV4Y2x1ZGUpKSB7XG5cdFx0XHRcdGV4Y2x1ZGUgPSBzbmlwcGV0LmV4Y2x1ZGU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzbmlwcGV0LmV4Y2x1ZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGV4Y2x1ZGUgPSBbc25pcHBldC5leGNsdWRlXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc291cmNlOiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMuX2V4dGVuc2lvbikge1xuXHRcdFx0Ly8gZXh0ZW5zaW9uIHNuaXBwZXQgLT4gc2hvdyB0aGUgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uXG5cdFx0XHRzb3VyY2UgPSB0aGlzLl9leHRlbnNpb24uZGlzcGxheU5hbWUgfHwgdGhpcy5fZXh0ZW5zaW9uLm5hbWU7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuc291cmNlID09PSBTbmlwcGV0U291cmNlLldvcmtzcGFjZSkge1xuXHRcdFx0Ly8gd29ya3NwYWNlIC0+IG9ubHkgKi5jb2RlLXNuaXBwZXRzIGZpbGVzXG5cdFx0XHRzb3VyY2UgPSBsb2NhbGl6ZSgnc291cmNlLndvcmtzcGFjZVNuaXBwZXRHbG9iYWwnLCBcIldvcmtzcGFjZSBTbmlwcGV0XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyB1c2VyIC0+IGdsb2JhbCAoKi5jb2RlLXNuaXBwZXRzKSBhbmQgbGFuZ3VhZ2Ugc25pcHBldHNcblx0XHRcdGlmICh0aGlzLmlzR2xvYmFsU25pcHBldHMpIHtcblx0XHRcdFx0c291cmNlID0gbG9jYWxpemUoJ3NvdXJjZS51c2VyU25pcHBldEdsb2JhbCcsIFwiR2xvYmFsIFVzZXIgU25pcHBldFwiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNvdXJjZSA9IGxvY2FsaXplKCdzb3VyY2UudXNlclNuaXBwZXQnLCBcIlVzZXIgU25pcHBldFwiKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IF9wcmVmaXggb2YgSXRlcmFibGUud3JhcChwcmVmaXgpKSB7XG5cdFx0XHRidWNrZXQucHVzaChuZXcgU25pcHBldChcblx0XHRcdFx0Qm9vbGVhbihpc0ZpbGVUZW1wbGF0ZSksXG5cdFx0XHRcdHNjb3Blcyxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0X3ByZWZpeCxcblx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdGJvZHksXG5cdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0dGhpcy5zb3VyY2UsXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbiA/IGAke3JlbGF0aXZlUGF0aCh0aGlzLl9leHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHRoaXMubG9jYXRpb24pfS8ke25hbWV9YCA6IGAke2Jhc2VuYW1lKHRoaXMubG9jYXRpb24ucGF0aCl9LyR7bmFtZX1gLFxuXHRcdFx0XHRpbmNsdWRlLFxuXHRcdFx0XHRleGNsdWRlLFxuXHRcdFx0XHR0aGlzLl9leHRlbnNpb24/LmlkZW50aWZpZXIsXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxXQUFXLG1CQUFtQjtBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsZUFBZSxVQUFVLGFBQWEsWUFBWTtBQUMzRCxTQUFTLGlDQUFpQztBQUsxQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtB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SUFBSSxPQUFLLEVBQUUsS0FBSyxDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsSUFDcEUsT0FBTztBQUNOLGVBQVMsQ0FBQztBQUFBLElBQ1g7QUFFQSxRQUFJO0FBQ0osUUFBSSxRQUFRLFNBQVM7QUFDcEIsVUFBSSxNQUFNLFFBQVEsUUFBUSxPQUFPLEdBQUc7QUFDbkMsa0JBQVUsUUFBUTtBQUFBLE1BQ25CLFdBQVcsT0FBTyxRQUFRLFlBQVksVUFBVTtBQUMvQyxrQkFBVSxDQUFDLFFBQVEsT0FBTztBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSixRQUFJLFFBQVEsU0FBUztBQUNwQixVQUFJLE1BQU0sUUFBUSxRQUFRLE9BQU8sR0FBRztBQUNuQyxrQkFBVSxRQUFRO0FBQUEsTUFDbkIsV0FBVyxPQUFPLFFBQVEsWUFBWSxVQUFVO0FBQy9DLGtCQUFVLENBQUMsUUFBUSxPQUFPO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUksS0FBSyxZQUFZO0FBRXBCLGVBQVMsS0FBSyxXQUFXLGVBQWUsS0FBSyxXQUFXO0FBQUEsSUFFekQsV0FBVyxLQUFLLFdBQVcsbUJBQXlCO0FBRW5ELGVBQVMsU0FBUyxpQ0FBaUMsbUJBQW1CO0FBQUEsSUFDdkUsT0FBTztBQUVOLFVBQUksS0FBSyxrQkFBa0I7QUFDMUIsaUJBQVMsU0FBUyw0QkFBNEIscUJBQXFCO0FBQUEsTUFDcEUsT0FBTztBQUNOLGlCQUFTLFNBQVMsc0JBQXNCLGNBQWM7QUFBQSxNQUN2RDtBQUFBLElBQ0Q7QUFFQSxlQUFXLFdBQVcsU0FBUyxLQUFLLE1BQU0sR0FBRztBQUM1QyxhQUFPLEtBQUssSUFBSTtBQUFBLFFBQ2YsUUFBUSxjQUFjO0FBQUEsUUFDdEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsS0FBSyxhQUFhLEdBQUcsYUFBYSxLQUFLLFdBQVcsbUJBQW1CLEtBQUssUUFBUSxDQUFDLElBQUksSUFBSSxLQUFLLEdBQUcsU0FBUyxLQUFLLFNBQVMsSUFBSSxDQUFDLElBQUksSUFBSTtBQUFBLFFBQ3ZJO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxZQUFZO0FBQUEsTUFDbEIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIlNuaXBwZXRTb3VyY2UiLCAibmFtZSJdCn0K
