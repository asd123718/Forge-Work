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
import { Emitter } from "../../../../../base/common/event.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { TernarySearchTree } from "../../../../../base/common/ternarySearchTree.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IReplaceService } from "./../replace.js";
import { resultIsMatch } from "../../../../services/search/common/search.js";
import { isSearchTreeFolderMatchWorkspaceRoot, isSearchTreeFolderMatchNoRoot, FOLDER_MATCH_PREFIX, getFileMatches } from "./searchTreeCommon.js";
import { isINotebookFileMatchNoModel } from "../../common/searchNotebookHelpers.js";
import { NotebookCompatibleFileMatch } from "../notebookSearch/notebookSearchModel.js";
import { isINotebookFileMatchWithModel, getIDFromINotebookCellMatch } from "../notebookSearch/searchNotebookHelpers.js";
import { isNotebookFileMatch } from "../notebookSearch/notebookSearchModelBase.js";
import { textSearchResultToMatches } from "./match.js";
let FolderMatchImpl = class extends Disposable {
  constructor(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService) {
    super();
    this._resource = _resource;
    this._index = _index;
    this._query = _query;
    this._parent = _parent;
    this._searchResult = _searchResult;
    this._closestRoot = _closestRoot;
    this.replaceService = replaceService;
    this.instantiationService = instantiationService;
    this.uriIdentityService = uriIdentityService;
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._onDispose = this._register(new Emitter());
    this.onDispose = this._onDispose.event;
    this._replacingAll = false;
    this._fileMatches = new ResourceMap();
    this._folderMatches = new ResourceMap();
    this._folderMatchesMap = TernarySearchTree.forUris((key) => this.uriIdentityService.extUri.ignorePathCasing(key));
    this._unDisposedFileMatches = new ResourceMap();
    this._unDisposedFolderMatches = new ResourceMap();
    this._name = new Lazy(() => this.resource ? labelService.getUriBasenameLabel(this.resource) : "");
    this._id = FOLDER_MATCH_PREFIX + _id;
  }
  get searchModel() {
    return this._searchResult.searchModel;
  }
  get showHighlights() {
    return this._parent.showHighlights;
  }
  get closestRoot() {
    return this._closestRoot;
  }
  set replacingAll(b) {
    this._replacingAll = b;
  }
  id() {
    return this._id;
  }
  get resource() {
    return this._resource;
  }
  index() {
    return this._index;
  }
  name() {
    return this._name.value;
  }
  parent() {
    return this._parent;
  }
  isAIContributed() {
    return false;
  }
  get hasChildren() {
    return this._fileMatches.size > 0 || this._folderMatches.size > 0;
  }
  bindModel(model) {
    const fileMatch = this._fileMatches.get(model.uri);
    if (fileMatch) {
      fileMatch.bindModel(model);
    } else {
      const folderMatch = this.getFolderMatch(model.uri);
      const match = folderMatch?.getDownstreamFileMatch(model.uri);
      match?.bindModel(model);
    }
  }
  createIntermediateFolderMatch(resource, id, index, query, baseWorkspaceFolder) {
    const folderMatch = this._register(this.instantiationService.createInstance(FolderMatchWithResourceImpl, resource, id, index, query, this, this._searchResult, baseWorkspaceFolder));
    this.configureIntermediateMatch(folderMatch);
    this.doAddFolder(folderMatch);
    return folderMatch;
  }
  configureIntermediateMatch(folderMatch) {
    const disposable = folderMatch.onChange((event) => this.onFolderChange(folderMatch, event));
    this._register(folderMatch.onDispose(() => disposable.dispose()));
  }
  clear(clearingAll = false) {
    const changed = this.allDownstreamFileMatches();
    this.disposeMatches();
    this._onChange.fire({ elements: changed, removed: true, added: false, clearingAll });
  }
  remove(matches) {
    if (!Array.isArray(matches)) {
      matches = [matches];
    }
    const allMatches = getFileMatches(matches);
    this.doRemoveFile(allMatches);
  }
  async replace(match) {
    return this.replaceService.replace([match]).then(() => {
      this.doRemoveFile([match], true, true, true);
    });
  }
  replaceAll() {
    const matches = this.matches();
    return this.batchReplace(matches);
  }
  matches() {
    return [...this.fileMatchesIterator(), ...this.folderMatchesIterator()];
  }
  fileMatchesIterator() {
    return this._fileMatches.values();
  }
  folderMatchesIterator() {
    return this._folderMatches.values();
  }
  isEmpty() {
    return this.fileCount() + this.folderCount() === 0;
  }
  getDownstreamFileMatch(uri) {
    const directChildFileMatch = this._fileMatches.get(uri);
    if (directChildFileMatch) {
      return directChildFileMatch;
    }
    const folderMatch = this.getFolderMatch(uri);
    const match = folderMatch?.getDownstreamFileMatch(uri);
    if (match) {
      return match;
    }
    return null;
  }
  allDownstreamFileMatches() {
    let recursiveChildren = [];
    const iterator = this.folderMatchesIterator();
    for (const elem of iterator) {
      recursiveChildren = recursiveChildren.concat(elem.allDownstreamFileMatches());
    }
    return [...this.fileMatchesIterator(), ...recursiveChildren];
  }
  fileCount() {
    return this._fileMatches.size;
  }
  folderCount() {
    return this._folderMatches.size;
  }
  count() {
    return this.fileCount() + this.folderCount();
  }
  recursiveFileCount() {
    return this.allDownstreamFileMatches().length;
  }
  recursiveMatchCount() {
    return this.allDownstreamFileMatches().reduce((prev, match) => prev + match.count(), 0);
  }
  get query() {
    return this._query;
  }
  doAddFile(fileMatch) {
    this._fileMatches.set(fileMatch.resource, fileMatch);
    this._unDisposedFileMatches.delete(fileMatch.resource);
  }
  hasOnlyReadOnlyMatches() {
    return Array.from(this._fileMatches.values()).every((fm) => fm.hasOnlyReadOnlyMatches());
  }
  uriHasParent(parent, child) {
    return this.uriIdentityService.extUri.isEqualOrParent(child, parent) && !this.uriIdentityService.extUri.isEqual(child, parent);
  }
  isInParentChain(folderMatch) {
    let matchItem = this;
    while (matchItem instanceof FolderMatchImpl) {
      if (matchItem.id() === folderMatch.id()) {
        return true;
      }
      matchItem = matchItem.parent();
    }
    return false;
  }
  getFolderMatch(resource) {
    const folderMatch = this._folderMatchesMap.findSubstr(resource);
    return folderMatch;
  }
  doAddFolder(folderMatch) {
    if (this.resource && !this.uriHasParent(this.resource, folderMatch.resource)) {
      throw Error(`${folderMatch.resource} does not belong as a child of ${this.resource}`);
    } else if (this.isInParentChain(folderMatch)) {
      throw Error(`${folderMatch.resource} is a parent of ${this.resource}`);
    }
    this._folderMatches.set(folderMatch.resource, folderMatch);
    this._folderMatchesMap.set(folderMatch.resource, folderMatch);
    this._unDisposedFolderMatches.delete(folderMatch.resource);
  }
  async batchReplace(matches) {
    const allMatches = getFileMatches(matches);
    await this.replaceService.replace(allMatches);
    this.doRemoveFile(allMatches, true, true, true);
  }
  onFileChange(fileMatch, removed = false) {
    let added = false;
    if (!this._fileMatches.has(fileMatch.resource)) {
      this.doAddFile(fileMatch);
      added = true;
    }
    if (fileMatch.count() === 0) {
      this.doRemoveFile([fileMatch], false, false);
      added = false;
      removed = true;
    }
    if (!this._replacingAll) {
      this._onChange.fire({ elements: [fileMatch], added, removed });
    }
  }
  onFolderChange(folderMatch, event) {
    if (!this._folderMatches.has(folderMatch.resource)) {
      this.doAddFolder(folderMatch);
    }
    if (folderMatch.isEmpty()) {
      this._folderMatches.delete(folderMatch.resource);
      folderMatch.dispose();
    }
    this._onChange.fire(event);
  }
  doRemoveFile(fileMatches, dispose = true, trigger = true, keepReadonly = false) {
    const removed = [];
    for (const match of fileMatches) {
      if (this._fileMatches.get(match.resource)) {
        if (keepReadonly && match.hasReadonlyMatches()) {
          continue;
        }
        this._fileMatches.delete(match.resource);
        if (dispose) {
          match.dispose();
        } else {
          this._unDisposedFileMatches.set(match.resource, match);
        }
        removed.push(match);
      } else {
        const folder = this.getFolderMatch(match.resource);
        if (folder) {
          folder.doRemoveFile([match], dispose, trigger);
        } else {
          throw Error(`FileMatch ${match.resource} is not located within FolderMatch ${this.resource}`);
        }
      }
    }
    if (trigger) {
      this._onChange.fire({ elements: removed, removed: true });
    }
  }
  async bindNotebookEditorWidget(editor, resource) {
    const fileMatch = this._fileMatches.get(resource);
    if (isNotebookFileMatch(fileMatch)) {
      if (fileMatch) {
        fileMatch.bindNotebookEditorWidget(editor);
        await fileMatch.updateMatchesForEditorWidget();
      } else {
        const folderMatches = this.folderMatchesIterator();
        for (const elem of folderMatches) {
          await elem.bindNotebookEditorWidget(editor, resource);
        }
      }
    }
  }
  addFileMatch(raw, silent, searchInstanceID) {
    const added = [];
    const updated = [];
    raw.forEach((rawFileMatch) => {
      const existingFileMatch = this.getDownstreamFileMatch(rawFileMatch.resource);
      if (existingFileMatch) {
        if (rawFileMatch.results) {
          rawFileMatch.results.filter(resultIsMatch).forEach((m) => {
            textSearchResultToMatches(m, existingFileMatch, false).forEach((m2) => existingFileMatch.add(m2));
          });
        }
        if (isINotebookFileMatchWithModel(rawFileMatch) || isINotebookFileMatchNoModel(rawFileMatch)) {
          rawFileMatch.cellResults?.forEach((rawCellMatch) => {
            if (isNotebookFileMatch(existingFileMatch)) {
              const existingCellMatch = existingFileMatch.getCellMatch(getIDFromINotebookCellMatch(rawCellMatch));
              if (existingCellMatch) {
                existingCellMatch.addContentMatches(rawCellMatch.contentResults);
                existingCellMatch.addWebviewMatches(rawCellMatch.webviewResults);
              } else {
                existingFileMatch.addCellMatch(rawCellMatch);
              }
            }
          });
        }
        updated.push(existingFileMatch);
        if (rawFileMatch.results && rawFileMatch.results.length > 0) {
          existingFileMatch.addContext(rawFileMatch.results);
        }
      } else {
        if (isSearchTreeFolderMatchWorkspaceRoot(this) || isSearchTreeFolderMatchNoRoot(this)) {
          const fileMatch = this.createAndConfigureFileMatch(rawFileMatch, searchInstanceID);
          added.push(fileMatch);
        }
      }
    });
    const elements = [...added, ...updated];
    if (!silent && elements.length) {
      this._onChange.fire({ elements, added: !!added.length });
    }
  }
  unbindNotebookEditorWidget(editor, resource) {
    const fileMatch = this._fileMatches.get(resource);
    if (isNotebookFileMatch(fileMatch)) {
      if (fileMatch) {
        fileMatch.unbindNotebookEditorWidget(editor);
      } else {
        const folderMatches = this.folderMatchesIterator();
        for (const elem of folderMatches) {
          elem.unbindNotebookEditorWidget(editor, resource);
        }
      }
    }
  }
  disposeMatches() {
    [...this._fileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
    [...this._folderMatches.values()].forEach((folderMatch) => folderMatch.disposeMatches());
    [...this._unDisposedFileMatches.values()].forEach((fileMatch) => fileMatch.dispose());
    [...this._unDisposedFolderMatches.values()].forEach((folderMatch) => folderMatch.disposeMatches());
    this._fileMatches.clear();
    this._folderMatches.clear();
    this._unDisposedFileMatches.clear();
    this._unDisposedFolderMatches.clear();
  }
  dispose() {
    this.disposeMatches();
    this._onDispose.fire();
    super.dispose();
  }
};
FolderMatchImpl = __decorateClass([
  __decorateParam(7, IReplaceService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IUriIdentityService)
], FolderMatchImpl);
let FolderMatchWithResourceImpl = class extends FolderMatchImpl {
  constructor(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService) {
    super(_resource, _id, _index, _query, _parent, _searchResult, _closestRoot, replaceService, instantiationService, labelService, uriIdentityService);
    this._normalizedResource = new Lazy(() => this.uriIdentityService.extUri.removeTrailingPathSeparator(this.uriIdentityService.extUri.normalizePath(
      this.resource
    )));
  }
  get resource() {
    return this._resource;
  }
  get normalizedResource() {
    return this._normalizedResource.value;
  }
};
FolderMatchWithResourceImpl = __decorateClass([
  __decorateParam(7, IReplaceService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IUriIdentityService)
], FolderMatchWithResourceImpl);
let FolderMatchWorkspaceRootImpl = class extends FolderMatchWithResourceImpl {
  constructor(_resource, _id, _index, _query, _parent, replaceService, instantiationService, labelService, uriIdentityService) {
    super(_resource, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
  }
  normalizedUriParent(uri) {
    return this.uriIdentityService.extUri.normalizePath(this.uriIdentityService.extUri.dirname(uri));
  }
  uriEquals(uri1, ur2) {
    return this.uriIdentityService.extUri.isEqual(uri1, ur2);
  }
  createFileMatch(query, previewOptions, maxResults, parent, rawFileMatch, closestRoot, searchInstanceID) {
    const fileMatch = this.instantiationService.createInstance(
      NotebookCompatibleFileMatch,
      query,
      previewOptions,
      maxResults,
      parent,
      rawFileMatch,
      closestRoot,
      searchInstanceID
    );
    fileMatch.createMatches();
    parent.doAddFile(fileMatch);
    const disposable = fileMatch.onChange(({ didRemove }) => parent.onFileChange(fileMatch, didRemove));
    this._register(fileMatch.onDispose(() => disposable.dispose()));
    return fileMatch;
  }
  createAndConfigureFileMatch(rawFileMatch, searchInstanceID) {
    if (!this.uriHasParent(this.resource, rawFileMatch.resource)) {
      throw Error(`${rawFileMatch.resource} is not a descendant of ${this.resource}`);
    }
    const fileMatchParentParts = [];
    let uri = this.normalizedUriParent(rawFileMatch.resource);
    while (!this.uriEquals(this.normalizedResource, uri)) {
      fileMatchParentParts.unshift(uri);
      const prevUri = uri;
      uri = this.uriIdentityService.extUri.removeTrailingPathSeparator(this.normalizedUriParent(uri));
      if (this.uriEquals(prevUri, uri)) {
        throw Error(`${rawFileMatch.resource} is not correctly configured as a child of ${this.normalizedResource}`);
      }
    }
    const root = this.closestRoot ?? this;
    let parent = this;
    for (let i = 0; i < fileMatchParentParts.length; i++) {
      let folderMatch = parent.getFolderMatch(fileMatchParentParts[i]);
      if (!folderMatch) {
        folderMatch = parent.createIntermediateFolderMatch(fileMatchParentParts[i], fileMatchParentParts[i].toString(), -1, this._query, root);
      }
      parent = folderMatch;
    }
    const contentPatternToUse = typeof this._query.contentPattern === "string" ? { pattern: this._query.contentPattern } : this._query.contentPattern;
    return this.createFileMatch(contentPatternToUse, this._query.previewOptions, this._query.maxResults, parent, rawFileMatch, root, searchInstanceID);
  }
};
FolderMatchWorkspaceRootImpl = __decorateClass([
  __decorateParam(5, IReplaceService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IUriIdentityService)
], FolderMatchWorkspaceRootImpl);
let FolderMatchNoRootImpl = class extends FolderMatchImpl {
  constructor(_id, _index, _query, _parent, replaceService, instantiationService, labelService, uriIdentityService) {
    super(null, _id, _index, _query, _parent, _parent.parent(), null, replaceService, instantiationService, labelService, uriIdentityService);
  }
  createAndConfigureFileMatch(rawFileMatch, searchInstanceID) {
    const contentPatternToUse = typeof this._query.contentPattern === "string" ? { pattern: this._query.contentPattern } : this._query.contentPattern;
    const fileMatch = this._register(this.instantiationService.createInstance(
      NotebookCompatibleFileMatch,
      contentPatternToUse,
      this._query.previewOptions,
      this._query.maxResults,
      this,
      rawFileMatch,
      null,
      searchInstanceID
    ));
    fileMatch.createMatches();
    this.doAddFile(fileMatch);
    const disposable = fileMatch.onChange(({ didRemove }) => this.onFileChange(fileMatch, didRemove));
    this._register(fileMatch.onDispose(() => disposable.dispose()));
    return fileMatch;
  }
};
FolderMatchNoRootImpl = __decorateClass([
  __decorateParam(4, IReplaceService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IUriIdentityService)
], FolderMatchNoRootImpl);
export {
  FolderMatchImpl,
  FolderMatchNoRootImpl,
  FolderMatchWithResourceImpl,
  FolderMatchWorkspaceRootImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoVHJlZU1vZGVsXFxmb2xkZXJNYXRjaC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBUZXJuYXJ5U2VhcmNoVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Rlcm5hcnlTZWFyY2hUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJUmVwbGFjZVNlcnZpY2UgfSBmcm9tICcuLy4uL3JlcGxhY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVNYXRjaCwgSVBhdHRlcm5JbmZvLCBJVGV4dFF1ZXJ5LCBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zLCByZXN1bHRJc01hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuXG5pbXBvcnQgeyBGaWxlTWF0Y2hJbXBsIH0gZnJvbSAnLi9maWxlTWF0Y2guanMnO1xuaW1wb3J0IHsgSUNoYW5nZUV2ZW50LCBJU2VhcmNoVHJlZUZpbGVNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdCwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QsIElTZWFyY2hNb2RlbCwgSVNlYXJjaFJlc3VsdCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290LCBJVGV4dFNlYXJjaEhlYWRpbmcsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290LCBGT0xERVJfTUFUQ0hfUFJFRklYLCBnZXRGaWxlTWF0Y2hlcyB9IGZyb20gJy4vc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgaXNJTm90ZWJvb2tGaWxlTWF0Y2hOb01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlYXJjaE5vdGVib29rSGVscGVycy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NvbXBhdGlibGVGaWxlTWF0Y2ggfSBmcm9tICcuLi9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IGlzSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsLCBnZXRJREZyb21JTm90ZWJvb2tDZWxsTWF0Y2ggfSBmcm9tICcuLi9ub3RlYm9va1NlYXJjaC9zZWFyY2hOb3RlYm9va0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgaXNOb3RlYm9va0ZpbGVNYXRjaCB9IGZyb20gJy4uL25vdGVib29rU2VhcmNoL25vdGVib29rU2VhcmNoTW9kZWxCYXNlLmpzJztcbmltcG9ydCB7IHRleHRTZWFyY2hSZXN1bHRUb01hdGNoZXMgfSBmcm9tICcuL21hdGNoLmpzJztcblxuZXhwb3J0IGNsYXNzIEZvbGRlck1hdGNoSW1wbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VhcmNoVHJlZUZvbGRlck1hdGNoIHtcblxuXHRwcm90ZWN0ZWQgX29uQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25DaGFuZ2U6IEV2ZW50PElDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlzcG9zZS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgX2ZpbGVNYXRjaGVzOiBSZXNvdXJjZU1hcDxJU2VhcmNoVHJlZUZpbGVNYXRjaD47XG5cdHByb3RlY3RlZCBfZm9sZGVyTWF0Y2hlczogUmVzb3VyY2VNYXA8Rm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsPjtcblx0cHJvdGVjdGVkIF9mb2xkZXJNYXRjaGVzTWFwOiBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbD47XG5cdHByb3RlY3RlZCBfdW5EaXNwb3NlZEZpbGVNYXRjaGVzOiBSZXNvdXJjZU1hcDxJU2VhcmNoVHJlZUZpbGVNYXRjaD47XG5cdHByb3RlY3RlZCBfdW5EaXNwb3NlZEZvbGRlck1hdGNoZXM6IFJlc291cmNlTWFwPEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbD47XG5cdHByaXZhdGUgX3JlcGxhY2luZ0FsbDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9uYW1lOiBMYXp5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIF9yZXNvdXJjZTogVVJJIHwgbnVsbCxcblx0XHRfaWQ6IHN0cmluZyxcblx0XHRwcm90ZWN0ZWQgX2luZGV4OiBudW1iZXIsXG5cdFx0cHJvdGVjdGVkIF9xdWVyeTogSVRleHRRdWVyeSxcblx0XHRwcml2YXRlIF9wYXJlbnQ6IElUZXh0U2VhcmNoSGVhZGluZyB8IEZvbGRlck1hdGNoSW1wbCxcblx0XHRwcml2YXRlIF9zZWFyY2hSZXN1bHQ6IElTZWFyY2hSZXN1bHQsXG5cdFx0cHJpdmF0ZSBfY2xvc2VzdFJvb3Q6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290IHwgbnVsbCxcblx0XHRASVJlcGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVwbGFjZVNlcnZpY2U6IElSZXBsYWNlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZmlsZU1hdGNoZXMgPSBuZXcgUmVzb3VyY2VNYXA8SVNlYXJjaFRyZWVGaWxlTWF0Y2g+KCk7XG5cdFx0dGhpcy5fZm9sZGVyTWF0Y2hlcyA9IG5ldyBSZXNvdXJjZU1hcDxGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUltcGw+KCk7XG5cdFx0dGhpcy5fZm9sZGVyTWF0Y2hlc01hcCA9IFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXM8Rm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsPihrZXkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcoa2V5KSk7XG5cdFx0dGhpcy5fdW5EaXNwb3NlZEZpbGVNYXRjaGVzID0gbmV3IFJlc291cmNlTWFwPElTZWFyY2hUcmVlRmlsZU1hdGNoPigpO1xuXHRcdHRoaXMuX3VuRGlzcG9zZWRGb2xkZXJNYXRjaGVzID0gbmV3IFJlc291cmNlTWFwPEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbD4oKTtcblx0XHR0aGlzLl9uYW1lID0gbmV3IExhenkoKCkgPT4gdGhpcy5yZXNvdXJjZSA/IGxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHRoaXMucmVzb3VyY2UpIDogJycpO1xuXHRcdHRoaXMuX2lkID0gRk9MREVSX01BVENIX1BSRUZJWCArIF9pZDtcblx0fVxuXG5cdGdldCBzZWFyY2hNb2RlbCgpOiBJU2VhcmNoTW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hSZXN1bHQuc2VhcmNoTW9kZWw7XG5cdH1cblxuXHRnZXQgc2hvd0hpZ2hsaWdodHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5zaG93SGlnaGxpZ2h0cztcblx0fVxuXG5cdGdldCBjbG9zZXN0Um9vdCgpOiBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9jbG9zZXN0Um9vdDtcblx0fVxuXG5cdHNldCByZXBsYWNpbmdBbGwoYjogYm9vbGVhbikge1xuXHRcdHRoaXMuX3JlcGxhY2luZ0FsbCA9IGI7XG5cdH1cblxuXHRpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldCByZXNvdXJjZSgpOiBVUkkgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2U7XG5cdH1cblxuXHRpbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbmRleDtcblx0fVxuXG5cdG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fbmFtZS52YWx1ZTtcblx0fVxuXG5cdHBhcmVudCgpOiBJVGV4dFNlYXJjaEhlYWRpbmcgfCBGb2xkZXJNYXRjaEltcGwge1xuXHRcdHJldHVybiB0aGlzLl9wYXJlbnQ7XG5cdH1cblxuXHRpc0FJQ29udHJpYnV0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0IGhhc0NoaWxkcmVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9maWxlTWF0Y2hlcy5zaXplID4gMCB8fCB0aGlzLl9mb2xkZXJNYXRjaGVzLnNpemUgPiAwO1xuXHR9XG5cblx0YmluZE1vZGVsKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsZU1hdGNoID0gdGhpcy5fZmlsZU1hdGNoZXMuZ2V0KG1vZGVsLnVyaSk7XG5cblx0XHRpZiAoZmlsZU1hdGNoKSB7XG5cdFx0XHRmaWxlTWF0Y2guYmluZE1vZGVsKG1vZGVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZm9sZGVyTWF0Y2ggPSB0aGlzLmdldEZvbGRlck1hdGNoKG1vZGVsLnVyaSk7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGZvbGRlck1hdGNoPy5nZXREb3duc3RyZWFtRmlsZU1hdGNoKG1vZGVsLnVyaSk7XG5cdFx0XHRtYXRjaD8uYmluZE1vZGVsKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlSW50ZXJtZWRpYXRlRm9sZGVyTWF0Y2gocmVzb3VyY2U6IFVSSSwgaWQ6IHN0cmluZywgaW5kZXg6IG51bWJlciwgcXVlcnk6IElUZXh0UXVlcnksIGJhc2VXb3Jrc3BhY2VGb2xkZXI6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KTogRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsIHtcblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsLCByZXNvdXJjZSwgaWQsIGluZGV4LCBxdWVyeSwgdGhpcywgdGhpcy5fc2VhcmNoUmVzdWx0LCBiYXNlV29ya3NwYWNlRm9sZGVyKSk7XG5cdFx0dGhpcy5jb25maWd1cmVJbnRlcm1lZGlhdGVNYXRjaChmb2xkZXJNYXRjaCk7XG5cdFx0dGhpcy5kb0FkZEZvbGRlcihmb2xkZXJNYXRjaCk7XG5cdFx0cmV0dXJuIGZvbGRlck1hdGNoO1xuXHR9XG5cblx0cHVibGljIGNvbmZpZ3VyZUludGVybWVkaWF0ZU1hdGNoKGZvbGRlck1hdGNoOiBGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUltcGwpIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZm9sZGVyTWF0Y2gub25DaGFuZ2UoKGV2ZW50KSA9PiB0aGlzLm9uRm9sZGVyQ2hhbmdlKGZvbGRlck1hdGNoLCBldmVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvbGRlck1hdGNoLm9uRGlzcG9zZSgoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSkpO1xuXHR9XG5cblx0Y2xlYXIoY2xlYXJpbmdBbGwgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWQ6IElTZWFyY2hUcmVlRmlsZU1hdGNoW10gPSB0aGlzLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpO1xuXHRcdHRoaXMuZGlzcG9zZU1hdGNoZXMoKTtcblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZWxlbWVudHM6IGNoYW5nZWQsIHJlbW92ZWQ6IHRydWUsIGFkZGVkOiBmYWxzZSwgY2xlYXJpbmdBbGwgfSk7XG5cdH1cblxuXHRyZW1vdmUobWF0Y2hlczogSVNlYXJjaFRyZWVGaWxlTWF0Y2ggfCBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlIHwgKElTZWFyY2hUcmVlRmlsZU1hdGNoIHwgSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSlbXSk6IHZvaWQge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShtYXRjaGVzKSkge1xuXHRcdFx0bWF0Y2hlcyA9IFttYXRjaGVzXTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsTWF0Y2hlcyA9IGdldEZpbGVNYXRjaGVzKG1hdGNoZXMpO1xuXHRcdHRoaXMuZG9SZW1vdmVGaWxlKGFsbE1hdGNoZXMpO1xuXHR9XG5cblx0YXN5bmMgcmVwbGFjZShtYXRjaDogRmlsZU1hdGNoSW1wbCk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZVNlcnZpY2UucmVwbGFjZShbbWF0Y2hdKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuZG9SZW1vdmVGaWxlKFttYXRjaF0sIHRydWUsIHRydWUsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVwbGFjZUFsbCgpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IG1hdGNoZXMgPSB0aGlzLm1hdGNoZXMoKTtcblx0XHRyZXR1cm4gdGhpcy5iYXRjaFJlcGxhY2UobWF0Y2hlcyk7XG5cdH1cblxuXHRtYXRjaGVzKCk6IChJU2VhcmNoVHJlZUZpbGVNYXRjaCB8IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2UpW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5maWxlTWF0Y2hlc0l0ZXJhdG9yKCksIC4uLnRoaXMuZm9sZGVyTWF0Y2hlc0l0ZXJhdG9yKCldO1xuXHR9XG5cblx0ZmlsZU1hdGNoZXNJdGVyYXRvcigpOiBJdGVyYWJsZUl0ZXJhdG9yPElTZWFyY2hUcmVlRmlsZU1hdGNoPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVNYXRjaGVzLnZhbHVlcygpO1xuXHR9XG5cblx0Zm9sZGVyTWF0Y2hlc0l0ZXJhdG9yKCk6IEl0ZXJhYmxlSXRlcmF0b3I8SVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZT4ge1xuXHRcdHJldHVybiB0aGlzLl9mb2xkZXJNYXRjaGVzLnZhbHVlcygpO1xuXHR9XG5cblx0aXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZmlsZUNvdW50KCkgKyB0aGlzLmZvbGRlckNvdW50KCkpID09PSAwO1xuXHR9XG5cblx0Z2V0RG93bnN0cmVhbUZpbGVNYXRjaCh1cmk6IFVSSSk6IElTZWFyY2hUcmVlRmlsZU1hdGNoIHwgbnVsbCB7XG5cdFx0Y29uc3QgZGlyZWN0Q2hpbGRGaWxlTWF0Y2ggPSB0aGlzLl9maWxlTWF0Y2hlcy5nZXQodXJpKTtcblx0XHRpZiAoZGlyZWN0Q2hpbGRGaWxlTWF0Y2gpIHtcblx0XHRcdHJldHVybiBkaXJlY3RDaGlsZEZpbGVNYXRjaDtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IHRoaXMuZ2V0Rm9sZGVyTWF0Y2godXJpKTtcblx0XHRjb25zdCBtYXRjaCA9IGZvbGRlck1hdGNoPy5nZXREb3duc3RyZWFtRmlsZU1hdGNoKHVyaSk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKTogSVNlYXJjaFRyZWVGaWxlTWF0Y2hbXSB7XG5cdFx0bGV0IHJlY3Vyc2l2ZUNoaWxkcmVuOiBJU2VhcmNoVHJlZUZpbGVNYXRjaFtdID0gW107XG5cdFx0Y29uc3QgaXRlcmF0b3IgPSB0aGlzLmZvbGRlck1hdGNoZXNJdGVyYXRvcigpO1xuXHRcdGZvciAoY29uc3QgZWxlbSBvZiBpdGVyYXRvcikge1xuXHRcdFx0cmVjdXJzaXZlQ2hpbGRyZW4gPSByZWN1cnNpdmVDaGlsZHJlbi5jb25jYXQoZWxlbS5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi50aGlzLmZpbGVNYXRjaGVzSXRlcmF0b3IoKSwgLi4ucmVjdXJzaXZlQ2hpbGRyZW5dO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWxlQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsZU1hdGNoZXMuc2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgZm9sZGVyQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9sZGVyTWF0Y2hlcy5zaXplO1xuXHR9XG5cblx0Y291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlQ291bnQoKSArIHRoaXMuZm9sZGVyQ291bnQoKTtcblx0fVxuXG5cdHJlY3Vyc2l2ZUZpbGVDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpLmxlbmd0aDtcblx0fVxuXG5cdHJlY3Vyc2l2ZU1hdGNoQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKS5yZWR1Y2U8bnVtYmVyPigocHJldiwgbWF0Y2gpID0+IHByZXYgKyBtYXRjaC5jb3VudCgpLCAwKTtcblx0fVxuXG5cdGdldCBxdWVyeSgpOiBJVGV4dFF1ZXJ5IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3F1ZXJ5O1xuXHR9XG5cblx0ZG9BZGRGaWxlKGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2gpOiB2b2lkIHtcblx0XHR0aGlzLl9maWxlTWF0Y2hlcy5zZXQoZmlsZU1hdGNoLnJlc291cmNlLCBmaWxlTWF0Y2gpO1xuXHRcdHRoaXMuX3VuRGlzcG9zZWRGaWxlTWF0Y2hlcy5kZWxldGUoZmlsZU1hdGNoLnJlc291cmNlKTtcblx0fVxuXG5cdGhhc09ubHlSZWFkT25seU1hdGNoZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fZmlsZU1hdGNoZXMudmFsdWVzKCkpLmV2ZXJ5KGZtID0+IGZtLmhhc09ubHlSZWFkT25seU1hdGNoZXMoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXJpSGFzUGFyZW50KHBhcmVudDogVVJJLCBjaGlsZDogVVJJKSB7XG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoY2hpbGQsIHBhcmVudCkgJiYgIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGNoaWxkLCBwYXJlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0luUGFyZW50Q2hhaW4oZm9sZGVyTWF0Y2g6IEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbCkge1xuXG5cdFx0bGV0IG1hdGNoSXRlbTogRm9sZGVyTWF0Y2hJbXBsIHwgSVRleHRTZWFyY2hIZWFkaW5nID0gdGhpcztcblx0XHR3aGlsZSAobWF0Y2hJdGVtIGluc3RhbmNlb2YgRm9sZGVyTWF0Y2hJbXBsKSB7XG5cdFx0XHRpZiAobWF0Y2hJdGVtLmlkKCkgPT09IGZvbGRlck1hdGNoLmlkKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRtYXRjaEl0ZW0gPSBtYXRjaEl0ZW0ucGFyZW50KCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb2xkZXJNYXRjaChyZXNvdXJjZTogVVJJKTogRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IHRoaXMuX2ZvbGRlck1hdGNoZXNNYXAuZmluZFN1YnN0cihyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGZvbGRlck1hdGNoO1xuXHR9XG5cblx0ZG9BZGRGb2xkZXIoZm9sZGVyTWF0Y2g6IEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbCkge1xuXHRcdGlmICh0aGlzLnJlc291cmNlICYmICF0aGlzLnVyaUhhc1BhcmVudCh0aGlzLnJlc291cmNlLCBmb2xkZXJNYXRjaC5yZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IEVycm9yKGAke2ZvbGRlck1hdGNoLnJlc291cmNlfSBkb2VzIG5vdCBiZWxvbmcgYXMgYSBjaGlsZCBvZiAke3RoaXMucmVzb3VyY2V9YCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlzSW5QYXJlbnRDaGFpbihmb2xkZXJNYXRjaCkpIHtcblx0XHRcdHRocm93IEVycm9yKGAke2ZvbGRlck1hdGNoLnJlc291cmNlfSBpcyBhIHBhcmVudCBvZiAke3RoaXMucmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZm9sZGVyTWF0Y2hlcy5zZXQoZm9sZGVyTWF0Y2gucmVzb3VyY2UsIGZvbGRlck1hdGNoKTtcblx0XHR0aGlzLl9mb2xkZXJNYXRjaGVzTWFwLnNldChmb2xkZXJNYXRjaC5yZXNvdXJjZSwgZm9sZGVyTWF0Y2gpO1xuXHRcdHRoaXMuX3VuRGlzcG9zZWRGb2xkZXJNYXRjaGVzLmRlbGV0ZShmb2xkZXJNYXRjaC5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGJhdGNoUmVwbGFjZShtYXRjaGVzOiAoSVNlYXJjaFRyZWVGaWxlTWF0Y2ggfCBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlKVtdKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBhbGxNYXRjaGVzID0gZ2V0RmlsZU1hdGNoZXMobWF0Y2hlcyk7XG5cblx0XHRhd2FpdCB0aGlzLnJlcGxhY2VTZXJ2aWNlLnJlcGxhY2UoYWxsTWF0Y2hlcyk7XG5cdFx0dGhpcy5kb1JlbW92ZUZpbGUoYWxsTWF0Y2hlcywgdHJ1ZSwgdHJ1ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwdWJsaWMgb25GaWxlQ2hhbmdlKGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2gsIHJlbW92ZWQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGxldCBhZGRlZCA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5fZmlsZU1hdGNoZXMuaGFzKGZpbGVNYXRjaC5yZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuZG9BZGRGaWxlKGZpbGVNYXRjaCk7XG5cdFx0XHRhZGRlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChmaWxlTWF0Y2guY291bnQoKSA9PT0gMCkge1xuXHRcdFx0dGhpcy5kb1JlbW92ZUZpbGUoW2ZpbGVNYXRjaF0sIGZhbHNlLCBmYWxzZSk7XG5cdFx0XHRhZGRlZCA9IGZhbHNlO1xuXHRcdFx0cmVtb3ZlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcmVwbGFjaW5nQWxsKSB7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZWxlbWVudHM6IFtmaWxlTWF0Y2hdLCBhZGRlZDogYWRkZWQsIHJlbW92ZWQ6IHJlbW92ZWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9uRm9sZGVyQ2hhbmdlKGZvbGRlck1hdGNoOiBGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUltcGwsIGV2ZW50OiBJQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2ZvbGRlck1hdGNoZXMuaGFzKGZvbGRlck1hdGNoLnJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5kb0FkZEZvbGRlcihmb2xkZXJNYXRjaCk7XG5cdFx0fVxuXHRcdGlmIChmb2xkZXJNYXRjaC5pc0VtcHR5KCkpIHtcblx0XHRcdHRoaXMuX2ZvbGRlck1hdGNoZXMuZGVsZXRlKGZvbGRlck1hdGNoLnJlc291cmNlKTtcblx0XHRcdGZvbGRlck1hdGNoLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGRvUmVtb3ZlRmlsZShmaWxlTWF0Y2hlczogSVNlYXJjaFRyZWVGaWxlTWF0Y2hbXSwgZGlzcG9zZTogYm9vbGVhbiA9IHRydWUsIHRyaWdnZXI6IGJvb2xlYW4gPSB0cnVlLCBrZWVwUmVhZG9ubHkgPSBmYWxzZSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcmVtb3ZlZCA9IFtdO1xuXHRcdGZvciAoY29uc3QgbWF0Y2ggb2YgZmlsZU1hdGNoZXMgYXMgSVNlYXJjaFRyZWVGaWxlTWF0Y2hbXSkge1xuXHRcdFx0aWYgKHRoaXMuX2ZpbGVNYXRjaGVzLmdldChtYXRjaC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKGtlZXBSZWFkb25seSAmJiBtYXRjaC5oYXNSZWFkb25seU1hdGNoZXMoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2ZpbGVNYXRjaGVzLmRlbGV0ZShtYXRjaC5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChkaXNwb3NlKSB7XG5cdFx0XHRcdFx0bWF0Y2guZGlzcG9zZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3VuRGlzcG9zZWRGaWxlTWF0Y2hlcy5zZXQobWF0Y2gucmVzb3VyY2UsIG1hdGNoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZW1vdmVkLnB1c2gobWF0Y2gpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5nZXRGb2xkZXJNYXRjaChtYXRjaC5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRmb2xkZXIuZG9SZW1vdmVGaWxlKFttYXRjaF0sIGRpc3Bvc2UsIHRyaWdnZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IEVycm9yKGBGaWxlTWF0Y2ggJHttYXRjaC5yZXNvdXJjZX0gaXMgbm90IGxvY2F0ZWQgd2l0aGluIEZvbGRlck1hdGNoICR7dGhpcy5yZXNvdXJjZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0cmlnZ2VyKSB7XG5cdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgZWxlbWVudHM6IHJlbW92ZWQsIHJlbW92ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYmluZE5vdGVib29rRWRpdG9yV2lkZ2V0KGVkaXRvcjogTm90ZWJvb2tFZGl0b3JXaWRnZXQsIHJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBmaWxlTWF0Y2ggPSB0aGlzLl9maWxlTWF0Y2hlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmIChpc05vdGVib29rRmlsZU1hdGNoKGZpbGVNYXRjaCkpIHtcblx0XHRcdGlmIChmaWxlTWF0Y2gpIHtcblx0XHRcdFx0ZmlsZU1hdGNoLmJpbmROb3RlYm9va0VkaXRvcldpZGdldChlZGl0b3IpO1xuXHRcdFx0XHRhd2FpdCBmaWxlTWF0Y2gudXBkYXRlTWF0Y2hlc0ZvckVkaXRvcldpZGdldCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyTWF0Y2hlcyA9IHRoaXMuZm9sZGVyTWF0Y2hlc0l0ZXJhdG9yKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZWxlbSBvZiBmb2xkZXJNYXRjaGVzKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWxlbS5iaW5kTm90ZWJvb2tFZGl0b3JXaWRnZXQoZWRpdG9yLCByZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhZGRGaWxlTWF0Y2gocmF3OiBJRmlsZU1hdGNoW10sIHNpbGVudDogYm9vbGVhbiwgc2VhcmNoSW5zdGFuY2VJRDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gd2hlbiBhZGRpbmcgYSBmaWxlTWF0Y2ggdGhhdCBoYXMgaW50ZXJtZWRpYXRlIGRpcmVjdG9yaWVzXG5cdFx0Y29uc3QgYWRkZWQ6IElTZWFyY2hUcmVlRmlsZU1hdGNoW10gPSBbXTtcblx0XHRjb25zdCB1cGRhdGVkOiBJU2VhcmNoVHJlZUZpbGVNYXRjaFtdID0gW107XG5cblx0XHRyYXcuZm9yRWFjaChyYXdGaWxlTWF0Y2ggPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdGaWxlTWF0Y2ggPSB0aGlzLmdldERvd25zdHJlYW1GaWxlTWF0Y2gocmF3RmlsZU1hdGNoLnJlc291cmNlKTtcblx0XHRcdGlmIChleGlzdGluZ0ZpbGVNYXRjaCkge1xuXG5cdFx0XHRcdGlmIChyYXdGaWxlTWF0Y2gucmVzdWx0cykge1xuXHRcdFx0XHRcdHJhd0ZpbGVNYXRjaFxuXHRcdFx0XHRcdFx0LnJlc3VsdHNcblx0XHRcdFx0XHRcdC5maWx0ZXIocmVzdWx0SXNNYXRjaClcblx0XHRcdFx0XHRcdC5mb3JFYWNoKG0gPT4ge1xuXHRcdFx0XHRcdFx0XHR0ZXh0U2VhcmNoUmVzdWx0VG9NYXRjaGVzKG0sIGV4aXN0aW5nRmlsZU1hdGNoLCBmYWxzZSlcblx0XHRcdFx0XHRcdFx0XHQuZm9yRWFjaChtID0+IGV4aXN0aW5nRmlsZU1hdGNoLmFkZChtKSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGFkZCBjZWxsIG1hdGNoZXNcblx0XHRcdFx0aWYgKGlzSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsKHJhd0ZpbGVNYXRjaCkgfHwgaXNJTm90ZWJvb2tGaWxlTWF0Y2hOb01vZGVsKHJhd0ZpbGVNYXRjaCkpIHtcblx0XHRcdFx0XHRyYXdGaWxlTWF0Y2guY2VsbFJlc3VsdHM/LmZvckVhY2gocmF3Q2VsbE1hdGNoID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc05vdGVib29rRmlsZU1hdGNoKGV4aXN0aW5nRmlsZU1hdGNoKSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBleGlzdGluZ0NlbGxNYXRjaCA9IGV4aXN0aW5nRmlsZU1hdGNoLmdldENlbGxNYXRjaChnZXRJREZyb21JTm90ZWJvb2tDZWxsTWF0Y2gocmF3Q2VsbE1hdGNoKSk7XG5cdFx0XHRcdFx0XHRcdGlmIChleGlzdGluZ0NlbGxNYXRjaCkge1xuXHRcdFx0XHRcdFx0XHRcdGV4aXN0aW5nQ2VsbE1hdGNoLmFkZENvbnRlbnRNYXRjaGVzKHJhd0NlbGxNYXRjaC5jb250ZW50UmVzdWx0cyk7XG5cdFx0XHRcdFx0XHRcdFx0ZXhpc3RpbmdDZWxsTWF0Y2guYWRkV2Vidmlld01hdGNoZXMocmF3Q2VsbE1hdGNoLndlYnZpZXdSZXN1bHRzKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRleGlzdGluZ0ZpbGVNYXRjaC5hZGRDZWxsTWF0Y2gocmF3Q2VsbE1hdGNoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dXBkYXRlZC5wdXNoKGV4aXN0aW5nRmlsZU1hdGNoKTtcblxuXHRcdFx0XHRpZiAocmF3RmlsZU1hdGNoLnJlc3VsdHMgJiYgcmF3RmlsZU1hdGNoLnJlc3VsdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGV4aXN0aW5nRmlsZU1hdGNoLmFkZENvbnRleHQocmF3RmlsZU1hdGNoLnJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KHRoaXMpIHx8IGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290KHRoaXMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZU1hdGNoID0gdGhpcy5jcmVhdGVBbmRDb25maWd1cmVGaWxlTWF0Y2gocmF3RmlsZU1hdGNoLCBzZWFyY2hJbnN0YW5jZUlEKTtcblx0XHRcdFx0XHRhZGRlZC5wdXNoKGZpbGVNYXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gWy4uLmFkZGVkLCAuLi51cGRhdGVkXTtcblx0XHRpZiAoIXNpbGVudCAmJiBlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoeyBlbGVtZW50cywgYWRkZWQ6ICEhYWRkZWQubGVuZ3RoIH0pO1xuXHRcdH1cblx0fVxuXG5cdHVuYmluZE5vdGVib29rRWRpdG9yV2lkZ2V0KGVkaXRvcjogTm90ZWJvb2tFZGl0b3JXaWRnZXQsIHJlc291cmNlOiBVUkkpIHtcblx0XHRjb25zdCBmaWxlTWF0Y2ggPSB0aGlzLl9maWxlTWF0Y2hlcy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0aWYgKGlzTm90ZWJvb2tGaWxlTWF0Y2goZmlsZU1hdGNoKSkge1xuXHRcdFx0aWYgKGZpbGVNYXRjaCkge1xuXHRcdFx0XHRmaWxlTWF0Y2gudW5iaW5kTm90ZWJvb2tFZGl0b3JXaWRnZXQoZWRpdG9yKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlck1hdGNoZXMgPSB0aGlzLmZvbGRlck1hdGNoZXNJdGVyYXRvcigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVsZW0gb2YgZm9sZGVyTWF0Y2hlcykge1xuXHRcdFx0XHRcdGVsZW0udW5iaW5kTm90ZWJvb2tFZGl0b3JXaWRnZXQoZWRpdG9yLCByZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdGRpc3Bvc2VNYXRjaGVzKCk6IHZvaWQge1xuXHRcdFsuLi50aGlzLl9maWxlTWF0Y2hlcy52YWx1ZXMoKV0uZm9yRWFjaCgoZmlsZU1hdGNoOiBJU2VhcmNoVHJlZUZpbGVNYXRjaCkgPT4gZmlsZU1hdGNoLmRpc3Bvc2UoKSk7XG5cdFx0Wy4uLnRoaXMuX2ZvbGRlck1hdGNoZXMudmFsdWVzKCldLmZvckVhY2goKGZvbGRlck1hdGNoOiBGb2xkZXJNYXRjaEltcGwpID0+IGZvbGRlck1hdGNoLmRpc3Bvc2VNYXRjaGVzKCkpO1xuXHRcdFsuLi50aGlzLl91bkRpc3Bvc2VkRmlsZU1hdGNoZXMudmFsdWVzKCldLmZvckVhY2goKGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2gpID0+IGZpbGVNYXRjaC5kaXNwb3NlKCkpO1xuXHRcdFsuLi50aGlzLl91bkRpc3Bvc2VkRm9sZGVyTWF0Y2hlcy52YWx1ZXMoKV0uZm9yRWFjaCgoZm9sZGVyTWF0Y2g6IEZvbGRlck1hdGNoSW1wbCkgPT4gZm9sZGVyTWF0Y2guZGlzcG9zZU1hdGNoZXMoKSk7XG5cdFx0dGhpcy5fZmlsZU1hdGNoZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9mb2xkZXJNYXRjaGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdW5EaXNwb3NlZEZpbGVNYXRjaGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdW5EaXNwb3NlZEZvbGRlck1hdGNoZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlTWF0Y2hlcygpO1xuXHRcdHRoaXMuX29uRGlzcG9zZS5maXJlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUltcGwgZXh0ZW5kcyBGb2xkZXJNYXRjaEltcGwgaW1wbGVtZW50cyBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlIHtcblxuXHRwcm90ZWN0ZWQgX25vcm1hbGl6ZWRSZXNvdXJjZTogTGF6eTxVUkk+O1xuXG5cdGNvbnN0cnVjdG9yKF9yZXNvdXJjZTogVVJJLFxuXHRcdF9pZDogc3RyaW5nLFxuXHRcdF9pbmRleDogbnVtYmVyLFxuXHRcdF9xdWVyeTogSVRleHRRdWVyeSxcblx0XHRfcGFyZW50OiBJVGV4dFNlYXJjaEhlYWRpbmcgfCBGb2xkZXJNYXRjaEltcGwsXG5cdFx0X3NlYXJjaFJlc3VsdDogSVNlYXJjaFJlc3VsdCxcblx0XHRfY2xvc2VzdFJvb3Q6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290IHwgbnVsbCxcblx0XHRASVJlcGxhY2VTZXJ2aWNlIHJlcGxhY2VTZXJ2aWNlOiBJUmVwbGFjZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoX3Jlc291cmNlLCBfaWQsIF9pbmRleCwgX3F1ZXJ5LCBfcGFyZW50LCBfc2VhcmNoUmVzdWx0LCBfY2xvc2VzdFJvb3QsIHJlcGxhY2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbGFiZWxTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdHRoaXMuX25vcm1hbGl6ZWRSZXNvdXJjZSA9IG5ldyBMYXp5KCgpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLm5vcm1hbGl6ZVBhdGgoXG5cdFx0XHR0aGlzLnJlc291cmNlKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlITtcblx0fVxuXG5cdGdldCBub3JtYWxpemVkUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fbm9ybWFsaXplZFJlc291cmNlLnZhbHVlO1xuXHR9XG59XG5cbi8qKlxuICogRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290ID0+IGZvbGRlciBmb3Igd29ya3NwYWNlIHJvb3RcbiAqL1xuZXhwb3J0IGNsYXNzIEZvbGRlck1hdGNoV29ya3NwYWNlUm9vdEltcGwgZXh0ZW5kcyBGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUltcGwgaW1wbGVtZW50cyBJU2VhcmNoVHJlZUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdCB7XG5cdGNvbnN0cnVjdG9yKF9yZXNvdXJjZTogVVJJLCBfaWQ6IHN0cmluZywgX2luZGV4OiBudW1iZXIsIF9xdWVyeTogSVRleHRRdWVyeSwgX3BhcmVudDogSVRleHRTZWFyY2hIZWFkaW5nLFxuXHRcdEBJUmVwbGFjZVNlcnZpY2UgcmVwbGFjZVNlcnZpY2U6IElSZXBsYWNlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihfcmVzb3VyY2UsIF9pZCwgX2luZGV4LCBfcXVlcnksIF9wYXJlbnQsIF9wYXJlbnQucGFyZW50KCksIG51bGwsIHJlcGxhY2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbGFiZWxTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVkVXJpUGFyZW50KHVyaTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLm5vcm1hbGl6ZVBhdGgodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUodXJpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVyaUVxdWFscyh1cmkxOiBVUkksIHVyMjogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHVyaTEsIHVyMik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZpbGVNYXRjaChxdWVyeTogSVBhdHRlcm5JbmZvLCBwcmV2aWV3T3B0aW9uczogSVRleHRTZWFyY2hQcmV2aWV3T3B0aW9ucyB8IHVuZGVmaW5lZCwgbWF4UmVzdWx0czogbnVtYmVyIHwgdW5kZWZpbmVkLCBwYXJlbnQ6IEZvbGRlck1hdGNoSW1wbCwgcmF3RmlsZU1hdGNoOiBJRmlsZU1hdGNoLCBjbG9zZXN0Um9vdDogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QgfCBudWxsLCBzZWFyY2hJbnN0YW5jZUlEOiBzdHJpbmcpOiBGaWxlTWF0Y2hJbXBsIHtcblx0XHQvLyBUT0RPOiBjYW4gcHJvYmFibHkganVzdCBjcmVhdGUgRmlsZU1hdGNoSW1wbCBpZiB3ZSBkb24ndCBleHBlY3QgY2VsbCByZXN1bHRzIGZyb20gdGhlIGZpbGUuXG5cdFx0Y29uc3QgZmlsZU1hdGNoID1cblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdE5vdGVib29rQ29tcGF0aWJsZUZpbGVNYXRjaCxcblx0XHRcdFx0cXVlcnksXG5cdFx0XHRcdHByZXZpZXdPcHRpb25zLFxuXHRcdFx0XHRtYXhSZXN1bHRzLFxuXHRcdFx0XHRwYXJlbnQsXG5cdFx0XHRcdHJhd0ZpbGVNYXRjaCxcblx0XHRcdFx0Y2xvc2VzdFJvb3QsXG5cdFx0XHRcdHNlYXJjaEluc3RhbmNlSUQsXG5cdFx0XHQpO1xuXHRcdGZpbGVNYXRjaC5jcmVhdGVNYXRjaGVzKCk7XG5cdFx0cGFyZW50LmRvQWRkRmlsZShmaWxlTWF0Y2gpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBmaWxlTWF0Y2gub25DaGFuZ2UoKHsgZGlkUmVtb3ZlIH0pID0+IHBhcmVudC5vbkZpbGVDaGFuZ2UoZmlsZU1hdGNoLCBkaWRSZW1vdmUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlTWF0Y2gub25EaXNwb3NlKCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKSk7XG5cdFx0cmV0dXJuIGZpbGVNYXRjaDtcblx0fVxuXG5cdGNyZWF0ZUFuZENvbmZpZ3VyZUZpbGVNYXRjaChyYXdGaWxlTWF0Y2g6IElGaWxlTWF0Y2g8VVJJPiwgc2VhcmNoSW5zdGFuY2VJRDogc3RyaW5nKTogRmlsZU1hdGNoSW1wbCB7XG5cblx0XHRpZiAoIXRoaXMudXJpSGFzUGFyZW50KHRoaXMucmVzb3VyY2UsIHJhd0ZpbGVNYXRjaC5yZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IEVycm9yKGAke3Jhd0ZpbGVNYXRjaC5yZXNvdXJjZX0gaXMgbm90IGEgZGVzY2VuZGFudCBvZiAke3RoaXMucmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZU1hdGNoUGFyZW50UGFydHM6IFVSSVtdID0gW107XG5cdFx0bGV0IHVyaSA9IHRoaXMubm9ybWFsaXplZFVyaVBhcmVudChyYXdGaWxlTWF0Y2gucmVzb3VyY2UpO1xuXG5cdFx0d2hpbGUgKCF0aGlzLnVyaUVxdWFscyh0aGlzLm5vcm1hbGl6ZWRSZXNvdXJjZSwgdXJpKSkge1xuXHRcdFx0ZmlsZU1hdGNoUGFyZW50UGFydHMudW5zaGlmdCh1cmkpO1xuXHRcdFx0Y29uc3QgcHJldlVyaSA9IHVyaTtcblx0XHRcdHVyaSA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5yZW1vdmVUcmFpbGluZ1BhdGhTZXBhcmF0b3IodGhpcy5ub3JtYWxpemVkVXJpUGFyZW50KHVyaSkpO1xuXHRcdFx0aWYgKHRoaXMudXJpRXF1YWxzKHByZXZVcmksIHVyaSkpIHtcblx0XHRcdFx0dGhyb3cgRXJyb3IoYCR7cmF3RmlsZU1hdGNoLnJlc291cmNlfSBpcyBub3QgY29ycmVjdGx5IGNvbmZpZ3VyZWQgYXMgYSBjaGlsZCBvZiAke3RoaXMubm9ybWFsaXplZFJlc291cmNlfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLmNsb3Nlc3RSb290ID8/IHRoaXM7XG5cdFx0bGV0IHBhcmVudDogRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VJbXBsID0gdGhpcztcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVNYXRjaFBhcmVudFBhcnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRsZXQgZm9sZGVyTWF0Y2g6IEZvbGRlck1hdGNoV2l0aFJlc291cmNlSW1wbCB8IHVuZGVmaW5lZCA9IHBhcmVudC5nZXRGb2xkZXJNYXRjaChmaWxlTWF0Y2hQYXJlbnRQYXJ0c1tpXSk7XG5cdFx0XHRpZiAoIWZvbGRlck1hdGNoKSB7XG5cdFx0XHRcdGZvbGRlck1hdGNoID0gcGFyZW50LmNyZWF0ZUludGVybWVkaWF0ZUZvbGRlck1hdGNoKGZpbGVNYXRjaFBhcmVudFBhcnRzW2ldLCBmaWxlTWF0Y2hQYXJlbnRQYXJ0c1tpXS50b1N0cmluZygpLCAtMSwgdGhpcy5fcXVlcnksIHJvb3QpO1xuXHRcdFx0fVxuXHRcdFx0cGFyZW50ID0gZm9sZGVyTWF0Y2g7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnRQYXR0ZXJuVG9Vc2UgPSB0eXBlb2YgKHRoaXMuX3F1ZXJ5LmNvbnRlbnRQYXR0ZXJuKSA9PT0gJ3N0cmluZycgPyB7IHBhdHRlcm46IHRoaXMuX3F1ZXJ5LmNvbnRlbnRQYXR0ZXJuIH0gOiB0aGlzLl9xdWVyeS5jb250ZW50UGF0dGVybjtcblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVGaWxlTWF0Y2goY29udGVudFBhdHRlcm5Ub1VzZSwgdGhpcy5fcXVlcnkucHJldmlld09wdGlvbnMsIHRoaXMuX3F1ZXJ5Lm1heFJlc3VsdHMsIHBhcmVudCwgcmF3RmlsZU1hdGNoLCByb290LCBzZWFyY2hJbnN0YW5jZUlEKTtcblx0fVxufVxuXG4vLyBjdXJyZW50bHksIG5vIHN1cHBvcnQgZm9yIEFJIHJlc3VsdHMgaW4gb3V0LW9mLXdvcmtzcGFjZSBmaWxlc1xuZXhwb3J0IGNsYXNzIEZvbGRlck1hdGNoTm9Sb290SW1wbCBleHRlbmRzIEZvbGRlck1hdGNoSW1wbCBpbXBsZW1lbnRzIElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hOb1Jvb3Qge1xuXHRjb25zdHJ1Y3RvcihfaWQ6IHN0cmluZywgX2luZGV4OiBudW1iZXIsIF9xdWVyeTogSVRleHRRdWVyeSwgX3BhcmVudDogSVRleHRTZWFyY2hIZWFkaW5nLFxuXHRcdEBJUmVwbGFjZVNlcnZpY2UgcmVwbGFjZVNlcnZpY2U6IElSZXBsYWNlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBfaWQsIF9pbmRleCwgX3F1ZXJ5LCBfcGFyZW50LCBfcGFyZW50LnBhcmVudCgpLCBudWxsLCByZXBsYWNlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxhYmVsU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0fVxuXG5cdGNyZWF0ZUFuZENvbmZpZ3VyZUZpbGVNYXRjaChyYXdGaWxlTWF0Y2g6IElGaWxlTWF0Y2gsIHNlYXJjaEluc3RhbmNlSUQ6IHN0cmluZyk6IElTZWFyY2hUcmVlRmlsZU1hdGNoIHtcblx0XHRjb25zdCBjb250ZW50UGF0dGVyblRvVXNlID0gdHlwZW9mICh0aGlzLl9xdWVyeS5jb250ZW50UGF0dGVybikgPT09ICdzdHJpbmcnID8geyBwYXR0ZXJuOiB0aGlzLl9xdWVyeS5jb250ZW50UGF0dGVybiB9IDogdGhpcy5fcXVlcnkuY29udGVudFBhdHRlcm47XG5cdFx0Ly8gVE9ETzogY2FuIHByb2JhYmx5IGp1c3QgY3JlYXRlIEZpbGVNYXRjaEltcGwgaWYgd2UgZG9uJ3QgZXhwZWN0IGNlbGwgcmVzdWx0cyBmcm9tIHRoZSBmaWxlLlxuXHRcdGNvbnN0IGZpbGVNYXRjaCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHROb3RlYm9va0NvbXBhdGlibGVGaWxlTWF0Y2gsXG5cdFx0XHRjb250ZW50UGF0dGVyblRvVXNlLFxuXHRcdFx0dGhpcy5fcXVlcnkucHJldmlld09wdGlvbnMsXG5cdFx0XHR0aGlzLl9xdWVyeS5tYXhSZXN1bHRzLFxuXHRcdFx0dGhpcywgcmF3RmlsZU1hdGNoLFxuXHRcdFx0bnVsbCxcblx0XHRcdHNlYXJjaEluc3RhbmNlSUQsXG5cdFx0KSk7XG5cdFx0ZmlsZU1hdGNoLmNyZWF0ZU1hdGNoZXMoKTtcblx0XHR0aGlzLmRvQWRkRmlsZShmaWxlTWF0Y2gpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBmaWxlTWF0Y2gub25DaGFuZ2UoKHsgZGlkUmVtb3ZlIH0pID0+IHRoaXMub25GaWxlQ2hhbmdlKGZpbGVNYXRjaCwgZGlkUmVtb3ZlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZU1hdGNoLm9uRGlzcG9zZSgoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSkpO1xuXHRcdHJldHVybiBmaWxlTWF0Y2g7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMEUscUJBQXFCO0FBRy9GLFNBQXlNLHNDQUEwRCwrQkFBK0IscUJBQXFCLHNCQUFzQjtBQUU3VSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLCtCQUErQixtQ0FBbUM7QUFDM0UsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBaUM7QUFFbkMsSUFBTSxrQkFBTixjQUE4QixXQUE2QztBQUFBLEVBaUJqRixZQUNXLFdBQ1YsS0FDVSxRQUNBLFFBQ0YsU0FDQSxlQUNBLGNBQzBCLGdCQUNRLHNCQUMzQixjQUN5Qixv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
