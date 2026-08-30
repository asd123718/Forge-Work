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
import * as DOM from "../../../../../base/browser/dom.js";
import * as glob from "../../../../../base/common/glob.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../../base/browser/ui/list/list.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IFileService, FileKind, FileOperationResult, FileChangeType, FileSystemProviderCapabilities } from "../../../../../platform/files/common/files.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { isTemporaryWorkspace, IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { Disposable, dispose, toDisposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { TreeVisibility, TreeDragOverBubble } from "../../../../../base/browser/ui/tree/tree.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ExplorerFindProviderActive, UndoConfirmLevel } from "../../common/files.js";
import { dirname, joinPath, distinctParents, relativePath } from "../../../../../base/common/resources.js";
import { InputBox, MessageType } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { localize } from "../../../../../nls.js";
import { createSingleCallFunction } from "../../../../../base/common/functional.js";
import { equals, deepClone } from "../../../../../base/common/objects.js";
import * as path from "../../../../../base/common/path.js";
import { ExplorerItem, NewExplorerItem } from "../../common/explorerModel.js";
import { compareFileExtensionsDefault, compareFileNamesDefault, compareFileNamesUpper, compareFileExtensionsUpper, compareFileNamesLower, compareFileExtensionsLower, compareFileNamesUnicode, compareFileExtensionsUnicode } from "../../../../../base/common/comparers.js";
import { CodeDataTransfers, containsDragType } from "../../../../../platform/dnd/browser/dnd.js";
import { fillEditorsDragData } from "../../../../browser/dnd.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { Schemas } from "../../../../../base/common/network.js";
import { NativeDragAndDropData, ExternalElementsDragAndDropData, ListViewTargetSector } from "../../../../../base/browser/ui/list/listView.js";
import { isMacintosh, isWeb } from "../../../../../base/common/platform.js";
import { IDialogService, getFileNamesMessage } from "../../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceEditingService } from "../../../../services/workspaces/common/workspaceEditing.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { findValidPasteFileTarget } from "../fileActions.js";
import { createMatches } from "../../../../../base/common/filters.js";
import { Emitter, Event, EventMultiplexer } from "../../../../../base/common/event.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { isNumber } from "../../../../../base/common/types.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { ResourceFileEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { IExplorerService } from "../files.js";
import { BrowserFileUpload, ExternalFileImport, getMultipleFilesOverwriteConfirm } from "../fileImportExport.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { WebFileSystemAccess } from "../../../../../platform/files/browser/webFileSystemAccess.js";
import { IgnoreFile } from "../../../../services/search/common/ignoreFile.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { TernarySearchTree } from "../../../../../base/common/ternarySearchTree.js";
import { defaultCountBadgeStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { timeout } from "../../../../../base/common/async.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { explorerFileContribRegistry } from "../explorerFileContrib.js";
import { ISearchService, QueryType, getExcludes } from "../../../../services/search/common/search.js";
import { TreeFindMatchType, TreeFindMode } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { CountBadge } from "../../../../../base/browser/ui/countBadge/countBadge.js";
import { listFilterMatchHighlight, listFilterMatchHighlightBorder } from "../../../../../platform/theme/common/colorRegistry.js";
import { asCssVariable } from "../../../../../platform/theme/common/colorUtils.js";
const _ExplorerDelegate = class _ExplorerDelegate {
  getHeight(element) {
    return _ExplorerDelegate.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    return FilesRenderer.ID;
  }
};
_ExplorerDelegate.ITEM_HEIGHT = 22;
let ExplorerDelegate = _ExplorerDelegate;
const explorerRootErrorEmitter = new Emitter();
let ExplorerDataSource = class {
  constructor(fileFilter, findProvider, progressService, configService, notificationService, layoutService, fileService, explorerService, contextService, filesConfigService) {
    this.fileFilter = fileFilter;
    this.findProvider = findProvider;
    this.progressService = progressService;
    this.configService = configService;
    this.notificationService = notificationService;
    this.layoutService = layoutService;
    this.fileService = fileService;
    this.explorerService = explorerService;
    this.contextService = contextService;
    this.filesConfigService = filesConfigService;
  }
  getParent(element) {
    if (element.parent) {
      return element.parent;
    }
    throw new Error("getParent only supported for cached parents");
  }
  hasChildren(element) {
    return Array.isArray(element) || element.hasChildren((stat) => this.fileFilter.filter(stat, TreeVisibility.Visible));
  }
  getChildren(element) {
    if (Array.isArray(element)) {
      return element;
    }
    if (this.findProvider.isShowingFilterResults()) {
      return Array.from(element.children.values());
    }
    const hasError = element.error;
    const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
    const children = element.fetchChildren(sortOrder);
    if (Array.isArray(children)) {
      return children;
    }
    const promise = children.then(
      (children2) => {
        if (element instanceof ExplorerItem && element.isRoot && !element.error && hasError && this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
          explorerRootErrorEmitter.fire(element.resource);
        }
        return children2;
      },
      (e) => {
        if (element instanceof ExplorerItem && element.isRoot) {
          if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
            const placeholder = new ExplorerItem(element.resource, this.fileService, this.configService, this.filesConfigService, void 0, void 0, false);
            placeholder.error = e;
            return [placeholder];
          } else {
            explorerRootErrorEmitter.fire(element.resource);
          }
        } else {
          this.notificationService.error(e);
        }
        return [];
      }
    );
    this.progressService.withProgress({
      location: ProgressLocation.Explorer,
      delay: this.layoutService.isRestored() ? 800 : 1500
      // reduce progress visibility when still restoring
    }, (_progress) => promise);
    return promise;
  }
};
ExplorerDataSource = __decorateClass([
  __decorateParam(2, IProgressService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IExplorerService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IFilesConfigurationService)
], ExplorerDataSource);
class PhantomExplorerItem extends ExplorerItem {
}
class ExplorerFindHighlightTree {
  constructor() {
    this._tree = /* @__PURE__ */ new Map();
    this._highlightedItems = /* @__PURE__ */ new Map();
  }
  get highlightedItems() {
    return Array.from(this._highlightedItems.values());
  }
  get(item) {
    const result = this.find(item);
    if (result === void 0) {
      return 0;
    }
    const { treeLayer, relPath } = result;
    this._highlightedItems.set(relPath, item);
    return treeLayer.childMatches;
  }
  find(item) {
    const rootLayer = this._tree.get(item.root.name);
    if (rootLayer === void 0) {
      return void 0;
    }
    const relPath = relativePath(item.root.resource, item.resource);
    if (relPath === void 0 || relPath.startsWith("..")) {
      throw new Error("Resource is not a child of the root");
    }
    if (relPath === "") {
      return { treeLayer: rootLayer, relPath };
    }
    let treeLayer = rootLayer;
    for (const segment of relPath.split("/")) {
      if (!treeLayer.stats[segment]) {
        return void 0;
      }
      treeLayer = treeLayer.stats[segment];
    }
    return { treeLayer, relPath };
  }
  add(resource, root) {
    const relPath = relativePath(root.resource, resource);
    if (relPath === void 0 || relPath.startsWith("..")) {
      throw new Error("Resource is not a child of the root");
    }
    let rootLayer = this._tree.get(root.name);
    if (!rootLayer) {
      rootLayer = { childMatches: 0, stats: {}, isMatch: false };
      this._tree.set(root.name, rootLayer);
    }
    rootLayer.childMatches++;
    let treeLayer = rootLayer;
    for (const stat of relPath.split("/")) {
      if (!treeLayer.stats[stat]) {
        treeLayer.stats[stat] = { childMatches: 0, stats: {}, isMatch: false };
      }
      treeLayer = treeLayer.stats[stat];
      treeLayer.childMatches++;
    }
    treeLayer.childMatches--;
    treeLayer.isMatch = true;
  }
  isMatch(item) {
    const result = this.find(item);
    if (result === void 0) {
      return false;
    }
    const { treeLayer } = result;
    return treeLayer.isMatch;
  }
  clear() {
    this._tree.clear();
  }
}
let ExplorerFindProvider = class {
  constructor(filesFilter, treeProvider, searchService, fileService, configurationService, filesConfigService, progressService, explorerService, contextKeyService) {
    this.filesFilter = filesFilter;
    this.treeProvider = treeProvider;
    this.searchService = searchService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.filesConfigService = filesConfigService;
    this.progressService = progressService;
    this.explorerService = explorerService;
    this.sessionId = 0;
    this.phantomParents = /* @__PURE__ */ new Set();
    this.findHighlightTree = new ExplorerFindHighlightTree();
    this.explorerFindActiveContextKey = ExplorerFindProviderActive.bindTo(contextKeyService);
  }
  get highlightTree() {
    return this.findHighlightTree;
  }
  isShowingFilterResults() {
    return !!this.filterSessionStartState;
  }
  isVisible(element) {
    if (!this.filterSessionStartState) {
      return true;
    }
    if (this.explorerService.isEditable(element)) {
      return true;
    }
    return this.filterSessionStartState.rootsWithProviders.has(element.root) ? element.isMarkedAsFiltered() : true;
  }
  startSession() {
    this.sessionId++;
  }
  async endSession() {
    if (this.filterSessionStartState) {
      await this.endFilterSession();
    }
    if (this.highlightSessionStartState) {
      this.endHighlightSession();
    }
  }
  async find(pattern, toggles, token) {
    const promise = this.doFind(pattern, toggles, token);
    return await this.progressService.withProgress({
      location: ProgressLocation.Explorer,
      delay: 750
    }, (_progress) => promise);
  }
  async doFind(pattern, toggles, token) {
    if (toggles.findMode === TreeFindMode.Highlight) {
      if (this.filterSessionStartState) {
        await this.endFilterSession();
      }
      if (!this.highlightSessionStartState) {
        this.startHighlightSession();
      }
      return await this.doHighlightFind(pattern, toggles.matchType, token);
    }
    if (this.highlightSessionStartState) {
      this.endHighlightSession();
    }
    if (!this.filterSessionStartState) {
      this.startFilterSession();
    }
    return await this.doFilterFind(pattern, toggles.matchType, token);
  }
  // Filter
  startFilterSession() {
    const tree = this.treeProvider();
    const input = tree.getInput();
    if (!input) {
      return;
    }
    const roots = this.explorerService.roots.filter((root) => this.searchSupportsScheme(root.resource.scheme));
    this.filterSessionStartState = { viewState: tree.getViewState(), input, rootsWithProviders: new Set(roots) };
    this.explorerFindActiveContextKey.set(true);
  }
  async doFilterFind(pattern, matchType, token) {
    if (!this.filterSessionStartState) {
      throw new Error("ExplorerFindProvider: no session state");
    }
    const roots = Array.from(this.filterSessionStartState.rootsWithProviders);
    const searchResults = await this.getSearchResults(pattern, roots, matchType, token);
    if (token.isCancellationRequested) {
      return void 0;
    }
    this.clearPhantomElements();
    for (const { explorerRoot, files, directories } of searchResults) {
      this.addWorkspaceFilterResults(explorerRoot, files, directories);
    }
    const tree = this.treeProvider();
    await tree.setInput(this.filterSessionStartState.input);
    const hitMaxResults = searchResults.some(({ hitMaxResults: hitMaxResults2 }) => hitMaxResults2);
    return {
      isMatch: (item) => item.isMarkedAsFiltered(),
      matchCount: searchResults.reduce((acc, { files, directories }) => acc + files.length + directories.length, 0),
      warningMessage: hitMaxResults ? localize("searchMaxResultsWarning", "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") : void 0
    };
  }
  addWorkspaceFilterResults(root, files, directories) {
    const results = [
      ...files.map((file) => ({ resource: file, isDirectory: false })),
      ...directories.map((directory) => ({ resource: directory, isDirectory: true }))
    ];
    for (const { resource, isDirectory } of results) {
      const element = root.find(resource);
      if (element && element.root === root) {
        element.markItemAndParentsAsFiltered();
        continue;
      }
      const phantomElements = this.createPhantomItems(resource, root, isDirectory);
      if (phantomElements.length === 0) {
        throw new Error("Phantom item was not created even though it is not in the model");
      }
      const firstPhantomParent = phantomElements[0].parent;
      if (!(firstPhantomParent instanceof PhantomExplorerItem)) {
        this.phantomParents.add(firstPhantomParent);
      }
      const phantomFileElement = phantomElements[phantomElements.length - 1];
      phantomFileElement.markItemAndParentsAsFiltered();
    }
  }
  createPhantomItems(resource, root, resourceIsDirectory) {
    const relativePathToRoot = relativePath(root.resource, resource);
    if (!relativePathToRoot) {
      throw new Error("Resource is not a child of the root");
    }
    const phantomElements = [];
    let currentItem = root;
    let currentResource = root.resource;
    const pathSegments = relativePathToRoot.split("/");
    for (const stat of pathSegments) {
      currentResource = currentResource.with({ path: `${currentResource.path}/${stat}` });
      let child = currentItem.getChild(stat);
      if (!child) {
        const isDirectory = pathSegments[pathSegments.length - 1] === stat ? resourceIsDirectory : true;
        child = new PhantomExplorerItem(currentResource, this.fileService, this.configurationService, this.filesConfigService, currentItem, isDirectory);
        currentItem.addChild(child);
        phantomElements.push(child);
      }
      currentItem = child;
    }
    return phantomElements;
  }
  async endFilterSession() {
    this.clearPhantomElements();
    this.explorerFindActiveContextKey.set(false);
    if (!this.filterSessionStartState) {
      throw new Error("ExplorerFindProvider: no session state to restore");
    }
    const tree = this.treeProvider();
    await tree.setInput(this.filterSessionStartState.input, this.filterSessionStartState.viewState);
    this.filterSessionStartState = void 0;
    this.explorerService.refresh();
  }
  clearPhantomElements() {
    for (const phantomParent of this.phantomParents) {
      phantomParent.forgetChildren();
    }
    this.phantomParents.clear();
    this.explorerService.roots.forEach((root) => root.unmarkItemAndChildren());
  }
  // Highlight
  startHighlightSession() {
    const roots = this.explorerService.roots.filter((root) => this.searchSupportsScheme(root.resource.scheme));
    this.highlightSessionStartState = { rootsWithProviders: new Set(roots) };
  }
  async doHighlightFind(pattern, matchType, token) {
    if (!this.highlightSessionStartState) {
      throw new Error("ExplorerFindProvider: no highlight session state");
    }
    const roots = Array.from(this.highlightSessionStartState.rootsWithProviders);
    const searchResults = await this.getSearchResults(pattern, roots, matchType, token);
    if (token.isCancellationRequested) {
      return void 0;
    }
    this.clearHighlights();
    for (const { explorerRoot, files, directories } of searchResults) {
      this.addWorkspaceHighlightResults(explorerRoot, files.concat(directories));
    }
    const hitMaxResults = searchResults.some(({ hitMaxResults: hitMaxResults2 }) => hitMaxResults2);
    return {
      isMatch: (item) => this.findHighlightTree.isMatch(item) || this.findHighlightTree.get(item) > 0 && this.treeProvider().isCollapsed(item),
      matchCount: searchResults.reduce((acc, { files, directories }) => acc + files.length + directories.length, 0),
      warningMessage: hitMaxResults ? localize("searchMaxResultsWarning", "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") : void 0
    };
  }
  addWorkspaceHighlightResults(root, resources) {
    const highlightedDirectories = /* @__PURE__ */ new Set();
    const storeDirectories = (item) => {
      while (item) {
        highlightedDirectories.add(item);
        item = item.parent;
      }
    };
    for (const resource of resources) {
      const element = root.find(resource);
      if (element && element.root === root) {
        this.findHighlightTree.add(resource, root);
        storeDirectories(element.parent);
        continue;
      }
      const firstParent = findFirstParent(resource, root);
      if (firstParent) {
        this.findHighlightTree.add(resource, root);
        storeDirectories(firstParent.parent);
      }
    }
    const tree = this.treeProvider();
    for (const directory of highlightedDirectories) {
      if (tree.hasNode(directory)) {
        tree.rerender(directory);
      }
    }
  }
  endHighlightSession() {
    this.highlightSessionStartState = void 0;
    this.clearHighlights();
  }
  clearHighlights() {
    const tree = this.treeProvider();
    for (const item of this.findHighlightTree.highlightedItems) {
      if (tree.hasNode(item)) {
        tree.rerender(item);
      }
    }
    this.findHighlightTree.clear();
  }
  // Search
  searchSupportsScheme(scheme) {
    if (scheme !== Schemas.file && scheme !== Schemas.vscodeRemote) {
      return false;
    }
    return this.searchService.schemeHasFileSearchProvider(scheme);
  }
  async getSearchResults(pattern, roots, matchType, token) {
    const patternLowercase = pattern.toLowerCase();
    const isFuzzyMatch = matchType === TreeFindMatchType.Fuzzy;
    return await Promise.all(roots.map((root, index) => this.searchInWorkspace(patternLowercase, root, index, isFuzzyMatch, token)));
  }
  async searchInWorkspace(patternLowercase, root, rootIndex, isFuzzyMatch, token) {
    const segmentMatchPattern = isFuzzyMatch ? fuzzyMatchingGlobPattern(patternLowercase) : continousMatchingGlobPattern(patternLowercase);
    const searchExcludePattern = getExcludes(this.configurationService.getValue({ resource: root.resource })) || {};
    const searchOptions = {
      folderQueries: [{
        folder: root.resource,
        disregardIgnoreFiles: !this.configurationService.getValue("explorer.excludeGitIgnore")
      }],
      type: QueryType.File,
      shouldGlobMatchFilePattern: true,
      cacheKey: `explorerfindprovider:${root.name}:${rootIndex}:${this.sessionId}`,
      excludePattern: searchExcludePattern,
      ignoreGlobCase: true
    };
    let fileResults;
    let folderResults;
    try {
      [fileResults, folderResults] = await Promise.all([
        this.searchService.fileSearch({ ...searchOptions, filePattern: `**/${segmentMatchPattern}`, maxResults: 512 }, token),
        this.searchService.fileSearch({ ...searchOptions, filePattern: `**/${segmentMatchPattern}/**` }, token)
      ]);
    } catch (e) {
      if (!isCancellationError(e)) {
        throw e;
      }
    }
    if (!fileResults || !folderResults || token.isCancellationRequested) {
      return { explorerRoot: root, files: [], directories: [], hitMaxResults: false };
    }
    const fileResultResources = fileResults.results.map((result) => result.resource);
    const directoryResources = getMatchingDirectoriesFromFiles(folderResults.results.map((result) => result.resource), root, segmentMatchPattern);
    const filteredFileResources = fileResultResources.filter((resource) => !this.filesFilter.isIgnored(resource, root.resource, false));
    const filteredDirectoryResources = directoryResources.filter((resource) => !this.filesFilter.isIgnored(resource, root.resource, true));
    return { explorerRoot: root, files: filteredFileResources, directories: filteredDirectoryResources, hitMaxResults: !!fileResults.limitHit || !!folderResults.limitHit };
  }
};
ExplorerFindProvider = __decorateClass([
  __decorateParam(2, ISearchService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IFilesConfigurationService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IExplorerService),
  __decorateParam(8, IContextKeyService)
], ExplorerFindProvider);
function getMatchingDirectoriesFromFiles(resources, root, segmentMatchPattern) {
  const uniqueDirectories = new ResourceSet();
  for (const resource of resources) {
    const relativePathToRoot = relativePath(root.resource, resource);
    if (!relativePathToRoot) {
      throw new Error("Resource is not a child of the root");
    }
    let dirResource = root.resource;
    const stats = relativePathToRoot.split("/").slice(0, -1);
    for (const stat of stats) {
      dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
      uniqueDirectories.add(dirResource);
    }
  }
  const matchingDirectories = [];
  for (const dirResource of uniqueDirectories) {
    const stats = dirResource.path.split("/");
    const dirStat = stats[stats.length - 1];
    if (!dirStat || !glob.match(segmentMatchPattern, dirStat, { ignoreCase: true })) {
      continue;
    }
    matchingDirectories.push(dirResource);
  }
  return matchingDirectories;
}
function findFirstParent(resource, root) {
  const relativePathToRoot = relativePath(root.resource, resource);
  if (!relativePathToRoot) {
    throw new Error("Resource is not a child of the root");
  }
  let currentItem = root;
  let currentResource = root.resource;
  const pathSegments = relativePathToRoot.split("/");
  for (const stat of pathSegments) {
    currentResource = currentResource.with({ path: `${currentResource.path}/${stat}` });
    const child = currentItem.getChild(stat);
    if (!child) {
      return currentItem;
    }
    currentItem = child;
  }
  return void 0;
}
function fuzzyMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern.split("").join("*") + "*";
}
function continousMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern + "*";
}
class CompressedNavigationController {
  constructor(id, items, templateData, depth, collapsed) {
    this.id = id;
    this.items = items;
    this.depth = depth;
    this.collapsed = collapsed;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._index = items.length - 1;
    this.updateLabels(templateData);
    this._updateLabelDisposable = templateData.label.onDidRender(() => this.updateLabels(templateData));
  }
  get index() {
    return this._index;
  }
  get count() {
    return this.items.length;
  }
  get current() {
    return this.items[this._index];
  }
  get currentId() {
    return `${this.id}_${this.index}`;
  }
  get labels() {
    return this._labels;
  }
  updateLabels(templateData) {
    this._labels = Array.from(templateData.container.querySelectorAll(".label-name"));
    let parents = "";
    for (let i = 0; i < this.labels.length; i++) {
      const ariaLabel = parents.length ? `${this.items[i].name}, compact, ${parents}` : this.items[i].name;
      this.labels[i].setAttribute("aria-label", ariaLabel);
      this.labels[i].setAttribute("aria-level", `${this.depth + i}`);
      parents = parents.length ? `${this.items[i].name} ${parents}` : this.items[i].name;
    }
    this.updateCollapsed(this.collapsed);
    if (this._index < this.labels.length) {
      this.labels[this._index].classList.add("active");
    }
  }
  previous() {
    if (this._index <= 0) {
      return;
    }
    this.setIndex(this._index - 1);
  }
  next() {
    if (this._index >= this.items.length - 1) {
      return;
    }
    this.setIndex(this._index + 1);
  }
  first() {
    if (this._index === 0) {
      return;
    }
    this.setIndex(0);
  }
  last() {
    if (this._index === this.items.length - 1) {
      return;
    }
    this.setIndex(this.items.length - 1);
  }
  setIndex(index) {
    if (index < 0 || index >= this.items.length) {
      return;
    }
    this.labels[this._index].classList.remove("active");
    this._index = index;
    this.labels[this._index].classList.add("active");
    this._onDidChange.fire();
  }
  updateCollapsed(collapsed) {
    this.collapsed = collapsed;
    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  }
  dispose() {
    this._onDidChange.dispose();
    this._updateLabelDisposable.dispose();
  }
}
CompressedNavigationController.ID = 0;
let FilesRenderer = class {
  constructor(container, labels, highlightTree, updateWidth, contextViewService, themeService, configurationService, explorerService, labelService, contextService, contextMenuService, instantiationService) {
    this.labels = labels;
    this.highlightTree = highlightTree;
    this.updateWidth = updateWidth;
    this.contextViewService = contextViewService;
    this.themeService = themeService;
    this.configurationService = configurationService;
    this.explorerService = explorerService;
    this.labelService = labelService;
    this.contextService = contextService;
    this.contextMenuService = contextMenuService;
    this.instantiationService = instantiationService;
    this.compressedNavigationControllers = /* @__PURE__ */ new Map();
    this._onDidChangeActiveDescendant = new EventMultiplexer();
    this.onDidChangeActiveDescendant = this._onDidChangeActiveDescendant.event;
    this.config = this.configurationService.getValue();
    const updateOffsetStyles = () => {
      const indent = this.configurationService.getValue("workbench.tree.indent");
      const offset = Math.max(22 - indent, 0);
      container.style.setProperty(`--vscode-explorer-align-offset-margin-left`, `${offset}px`);
    };
    this.configListener = this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("explorer")) {
        this.config = this.configurationService.getValue();
      }
      if (e.affectsConfiguration("workbench.tree.indent")) {
        updateOffsetStyles();
      }
    });
    updateOffsetStyles();
  }
  getWidgetAriaLabel() {
    return localize("treeAriaLabel", "Files Explorer");
  }
  get templateId() {
    return FilesRenderer.ID;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this.labels.create(container, { supportHighlights: true }));
    templateDisposables.add(label.onDidRender(() => {
      DOM.scheduleAtNextAnimationFrame(DOM.getWindow(templateData.container), () => {
        try {
          if (templateData.currentContext) {
            this.updateWidth(templateData.currentContext);
          }
        } catch (e) {
        }
      });
    }));
    const contribs = explorerFileContribRegistry.create(this.instantiationService, container, templateDisposables);
    templateDisposables.add(explorerFileContribRegistry.onDidRegisterDescriptor((d) => {
      const contr = d.create(this.instantiationService, container);
      contribs.push(templateDisposables.add(contr));
      contr.setResource(templateData.currentContext?.resource);
    }));
    const templateData = { templateDisposables, elementDisposables: templateDisposables.add(new DisposableStore()), label, container, contribs };
    return templateData;
  }
  renderElement(node, index, templateData) {
    const stat = node.element;
    templateData.currentContext = stat;
    const editableData = this.explorerService.getEditableData(stat);
    templateData.label.element.classList.remove("compressed");
    if (!editableData) {
      templateData.label.element.style.display = "flex";
      this.renderStat(stat, stat.name, void 0, node.filterData, templateData);
    } else {
      templateData.label.element.style.display = "none";
      templateData.contribs.forEach((c) => c.setResource(void 0));
      templateData.elementDisposables.add(this.renderInputBox(templateData.container, stat, editableData));
    }
  }
  renderCompressedElements(node, index, templateData) {
    const stat = node.element.elements[node.element.elements.length - 1];
    templateData.currentContext = stat;
    const editable = node.element.elements.filter((e) => this.explorerService.isEditable(e));
    const editableData = editable.length === 0 ? void 0 : this.explorerService.getEditableData(editable[0]);
    if (!editableData) {
      templateData.label.element.classList.add("compressed");
      templateData.label.element.style.display = "flex";
      const id = `compressed-explorer_${CompressedNavigationController.ID++}`;
      const labels = node.element.elements.map((e) => e.name);
      let fuzzyScore = node.filterData;
      if (fuzzyScore && fuzzyScore.length > 2) {
        const filterDataOffset = labels.join("/").length - labels[labels.length - 1].length;
        fuzzyScore = [fuzzyScore[0], fuzzyScore[1] + filterDataOffset, ...fuzzyScore.slice(2)];
      }
      this.renderStat(stat, labels, id, fuzzyScore, templateData);
      const compressedNavigationController = new CompressedNavigationController(id, node.element.elements, templateData, node.depth, node.collapsed);
      templateData.elementDisposables.add(compressedNavigationController);
      const nodeControllers = this.compressedNavigationControllers.get(stat) ?? [];
      this.compressedNavigationControllers.set(stat, [...nodeControllers, compressedNavigationController]);
      templateData.elementDisposables.add(this._onDidChangeActiveDescendant.add(compressedNavigationController.onDidChange));
      templateData.elementDisposables.add(DOM.addDisposableListener(templateData.container, "mousedown", (e) => {
        const result = getIconLabelNameFromHTMLElement(e.target);
        if (result) {
          compressedNavigationController.setIndex(result.index);
        }
      }));
      templateData.elementDisposables.add(toDisposable(() => {
        const nodeControllers2 = this.compressedNavigationControllers.get(stat) ?? [];
        const renderedIndex = nodeControllers2.findIndex((controller) => controller === compressedNavigationController);
        if (renderedIndex < 0) {
          throw new Error("Disposing unknown navigation controller");
        }
        if (nodeControllers2.length === 1) {
          this.compressedNavigationControllers.delete(stat);
        } else {
          nodeControllers2.splice(renderedIndex, 1);
        }
      }));
    } else {
      templateData.label.element.classList.remove("compressed");
      templateData.label.element.style.display = "none";
      templateData.contribs.forEach((c) => c.setResource(void 0));
      templateData.elementDisposables.add(this.renderInputBox(templateData.container, editable[0], editableData));
    }
  }
  renderStat(stat, label, domId, filterData, templateData) {
    templateData.label.element.style.display = "flex";
    const extraClasses = ["explorer-item"];
    if (this.explorerService.isCut(stat)) {
      extraClasses.push("cut");
    }
    const theme = this.themeService.getFileIconTheme();
    const twistieContainer = templateData.container.parentElement?.parentElement?.querySelector(".monaco-tl-twistie");
    twistieContainer?.classList.toggle("force-twistie", stat.hasNests && theme.hidesExplorerArrows);
    const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
    const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;
    templateData.contribs.forEach((c) => c.setResource(stat.resource));
    templateData.label.setResource({ resource: stat.resource, name: label }, {
      fileKind: stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE,
      extraClasses: realignNestedChildren ? [...extraClasses, "align-nest-icon-with-parent-icon"] : extraClasses,
      fileDecorations: this.config.explorer.decorations,
      matches: createMatches(filterData),
      separator: this.labelService.getSeparator(stat.resource.scheme, stat.resource.authority),
      domId
    });
    const highlightResults = stat.isDirectory ? this.highlightTree.get(stat) : 0;
    if (highlightResults > 0) {
      const badge = new CountBadge(templateData.label.element.lastElementChild, {}, { ...defaultCountBadgeStyles, badgeBackground: asCssVariable(listFilterMatchHighlight), badgeBorder: asCssVariable(listFilterMatchHighlightBorder) });
      badge.setCount(highlightResults);
      badge.setTitleFormat(localize("explorerHighlightFolderBadgeTitle", "Directory contains {0} matches", highlightResults));
      templateData.elementDisposables.add(badge);
    }
    templateData.label.element.classList.toggle("highlight-badge", highlightResults > 0);
  }
  renderInputBox(container, stat, editableData) {
    const label = this.labels.create(container);
    const extraClasses = ["explorer-item", "explorer-item-edited"];
    const fileKind = stat.isRoot ? FileKind.ROOT_FOLDER : stat.isDirectory ? FileKind.FOLDER : FileKind.FILE;
    const theme = this.themeService.getFileIconTheme();
    const themeIsUnhappyWithNesting = theme.hasFileIcons && (theme.hidesExplorerArrows || !theme.hasFolderIcons);
    const realignNestedChildren = stat.nestedParent && themeIsUnhappyWithNesting;
    const labelOptions = {
      hidePath: true,
      hideLabel: true,
      fileKind,
      extraClasses: realignNestedChildren ? [...extraClasses, "align-nest-icon-with-parent-icon"] : extraClasses
    };
    const parent = stat.name ? dirname(stat.resource) : stat.resource;
    const value = stat.name || "";
    label.setFile(joinPath(parent, value || " "), labelOptions);
    label.element.firstElementChild.style.display = "none";
    const inputBox = new InputBox(label.element, this.contextViewService, {
      validationOptions: {
        validation: (value2) => {
          const message = editableData.validationMessage(value2);
          if (!message || message.severity !== Severity.Error) {
            return null;
          }
          return {
            content: message.content,
            formatContent: true,
            type: MessageType.ERROR
          };
        }
      },
      ariaLabel: localize("fileInputAriaLabel", "Type file name. Press Enter to confirm or Escape to cancel."),
      inputBoxStyles: defaultInputBoxStyles
    });
    const lastDot = value.lastIndexOf(".");
    let currentSelectionState = "prefix";
    inputBox.value = value;
    inputBox.focus();
    inputBox.select({ start: 0, end: lastDot > 0 && !stat.isDirectory ? lastDot : value.length });
    const done = createSingleCallFunction((success, finishEditing) => {
      label.element.style.display = "none";
      const value2 = inputBox.value;
      dispose(toDispose);
      label.element.remove();
      if (finishEditing) {
        editableData.onFinish(value2, success);
      }
    });
    const showInputBoxNotification = () => {
      if (inputBox.isInputValid()) {
        const message = editableData.validationMessage(inputBox.value);
        if (message) {
          inputBox.showMessage({
            content: message.content,
            formatContent: true,
            type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
          });
        } else {
          inputBox.hideMessage();
        }
      }
    };
    showInputBoxNotification();
    const toDispose = [
      inputBox,
      inputBox.onDidChange((value2) => {
        label.setFile(joinPath(parent, value2 || " "), labelOptions);
      }),
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
        if (e.equals(KeyCode.F2)) {
          const dotIndex = inputBox.value.lastIndexOf(".");
          if (stat.isDirectory || dotIndex === -1) {
            return;
          }
          if (currentSelectionState === "prefix") {
            currentSelectionState = "all";
            inputBox.select({ start: 0, end: inputBox.value.length });
          } else if (currentSelectionState === "all") {
            currentSelectionState = "suffix";
            inputBox.select({ start: dotIndex + 1, end: inputBox.value.length });
          } else {
            currentSelectionState = "prefix";
            inputBox.select({ start: 0, end: dotIndex });
          }
        } else if (e.equals(KeyCode.Enter)) {
          if (!inputBox.validate()) {
            done(true, true);
          }
        } else if (e.equals(KeyCode.Escape)) {
          done(false, true);
        }
      }),
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e) => {
        showInputBoxNotification();
      }),
      DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, async () => {
        while (true) {
          await timeout(0);
          const ownerDocument = inputBox.inputElement.ownerDocument;
          if (!ownerDocument.hasFocus()) {
            break;
          }
          if (DOM.isActiveElement(inputBox.inputElement)) {
            return;
          } else if (DOM.isHTMLElement(ownerDocument.activeElement) && DOM.hasParentWithClass(ownerDocument.activeElement, "context-view")) {
            await Event.toPromise(this.contextMenuService.onDidHideContextMenu);
          } else {
            break;
          }
        }
        done(inputBox.isInputValid(), true);
      }),
      label
    ];
    return toDisposable(() => {
      done(false, false);
    });
  }
  disposeElement(element, index, templateData) {
    templateData.currentContext = void 0;
    templateData.elementDisposables.clear();
  }
  disposeCompressedElements(node, index, templateData) {
    templateData.currentContext = void 0;
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  getCompressedNavigationController(stat) {
    return this.compressedNavigationControllers.get(stat);
  }
  // IAccessibilityProvider
  getAriaLabel(element) {
    return element.name;
  }
  getAriaLevel(element) {
    let depth = 0;
    let parent = element.parent;
    while (parent) {
      parent = parent.parent;
      depth++;
    }
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      depth = depth + 1;
    }
    return depth;
  }
  getActiveDescendantId(stat) {
    return this.compressedNavigationControllers.get(stat)?.[0]?.currentId ?? void 0;
  }
  dispose() {
    this.configListener.dispose();
  }
};
FilesRenderer.ID = "file";
FilesRenderer = __decorateClass([
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IExplorerService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IInstantiationService)
], FilesRenderer);
let FilesFilter = class {
  constructor(contextService, configurationService, explorerService, editorService, uriIdentityService, fileService) {
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.hiddenExpressionPerRoot = /* @__PURE__ */ new Map();
    this.editorsAffectingFilter = /* @__PURE__ */ new Set();
    this._onDidChange = new Emitter();
    this.toDispose = [];
    // List of ignoreFile resources. Used to detect changes to the ignoreFiles.
    this.ignoreFileResourcesPerRoot = /* @__PURE__ */ new Map();
    // Ignore tree per root. Similar to `hiddenExpressionPerRoot`
    // Note: URI in the ternary search tree is the URI of the folder containing the ignore file
    // It is not the ignore file itself. This is because of the way the IgnoreFile works and nested paths
    this.ignoreTreesPerRoot = /* @__PURE__ */ new Map();
    this.toDispose.push(this._onDidChange);
    this.toDispose.push(this.contextService.onDidChangeWorkspaceFolders(() => this.updateConfiguration()));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("files.exclude") || e.affectsConfiguration("explorer.excludeGitIgnore")) {
        this.updateConfiguration();
      }
    }));
    this.toDispose.push(this.fileService.onDidFilesChange((e) => {
      for (const [root, ignoreFileResourceSet] of this.ignoreFileResourcesPerRoot.entries()) {
        ignoreFileResourceSet.forEach(async (ignoreResource) => {
          if (e.contains(ignoreResource, FileChangeType.UPDATED)) {
            await this.processIgnoreFile(root, ignoreResource, true);
          }
          if (e.contains(ignoreResource, FileChangeType.DELETED)) {
            this.ignoreTreesPerRoot.get(root)?.delete(dirname(ignoreResource));
            ignoreFileResourceSet.delete(ignoreResource);
            this._onDidChange.fire();
          }
        });
      }
    }));
    this.toDispose.push(this.editorService.onDidVisibleEditorsChange(() => {
      const editors = this.editorService.visibleEditors;
      let shouldFire = false;
      for (const e of editors) {
        if (!e.resource) {
          continue;
        }
        const stat = this.explorerService.findClosest(e.resource);
        if (stat?.isExcluded) {
          shouldFire = true;
          break;
        }
      }
      for (const e of this.editorsAffectingFilter) {
        if (!editors.includes(e)) {
          shouldFire = true;
          break;
        }
      }
      if (shouldFire) {
        this.editorsAffectingFilter.clear();
        this._onDidChange.fire();
      }
    }));
    this.updateConfiguration();
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  updateConfiguration() {
    let shouldFire = false;
    let updatedGitIgnoreSetting = false;
    this.contextService.getWorkspace().folders.forEach((folder) => {
      const configuration = this.configurationService.getValue({ resource: folder.uri });
      const excludesConfig = configuration?.files?.exclude || /* @__PURE__ */ Object.create(null);
      const parseIgnoreFile = configuration.explorer.excludeGitIgnore;
      if (parseIgnoreFile && !this.ignoreTreesPerRoot.has(folder.uri.toString())) {
        updatedGitIgnoreSetting = true;
        this.ignoreFileResourcesPerRoot.set(folder.uri.toString(), new ResourceSet());
        this.ignoreTreesPerRoot.set(folder.uri.toString(), TernarySearchTree.forUris((uri) => this.uriIdentityService.extUri.ignorePathCasing(uri)));
      }
      if (!parseIgnoreFile && this.ignoreTreesPerRoot.has(folder.uri.toString())) {
        updatedGitIgnoreSetting = true;
        this.ignoreFileResourcesPerRoot.delete(folder.uri.toString());
        this.ignoreTreesPerRoot.delete(folder.uri.toString());
      }
      if (!shouldFire) {
        const cached = this.hiddenExpressionPerRoot.get(folder.uri.toString());
        shouldFire = !cached || !equals(cached.original, excludesConfig);
      }
      const excludesConfigCopy = deepClone(excludesConfig);
      this.hiddenExpressionPerRoot.set(folder.uri.toString(), { original: excludesConfigCopy, parsed: glob.parse(excludesConfigCopy) });
    });
    if (shouldFire || updatedGitIgnoreSetting) {
      this.editorsAffectingFilter.clear();
      this._onDidChange.fire();
    }
  }
  /**
   * Given a .gitignore file resource, processes the resource and adds it to the ignore tree which hides explorer items
   * @param root The root folder of the workspace as a string. Used for lookup key for ignore tree and resource list
   * @param ignoreFileResource The resource of the .gitignore file
   * @param update Whether or not we're updating an existing ignore file. If true it deletes the old entry
   */
  async processIgnoreFile(root, ignoreFileResource, update) {
    const dirUri = dirname(ignoreFileResource);
    const ignoreTree = this.ignoreTreesPerRoot.get(root);
    if (!ignoreTree) {
      return;
    }
    if (!update && ignoreTree.has(dirUri)) {
      return;
    }
    const content = await this.fileService.readFile(ignoreFileResource);
    if (update) {
      const ignoreFile = ignoreTree.get(dirUri);
      ignoreFile?.updateContents(content.value.toString());
    } else {
      const ignoreParent = ignoreTree.findSubstr(dirUri);
      const ignoreCase = !this.fileService.hasCapability(ignoreFileResource, FileSystemProviderCapabilities.PathCaseSensitive);
      const ignoreFile = new IgnoreFile(content.value.toString(), dirUri.path, ignoreParent, ignoreCase);
      ignoreTree.set(dirUri, ignoreFile);
      if (!this.ignoreFileResourcesPerRoot.get(root)?.has(ignoreFileResource)) {
        this.ignoreFileResourcesPerRoot.get(root)?.add(ignoreFileResource);
      }
    }
    this._onDidChange.fire();
  }
  filter(stat, parentVisibility) {
    if (stat.name === ".gitignore" && this.ignoreTreesPerRoot.has(stat.root.resource.toString())) {
      this.processIgnoreFile(stat.root.resource.toString(), stat.resource, false);
      return true;
    }
    return this.isVisible(stat, parentVisibility);
  }
  isVisible(stat, parentVisibility) {
    stat.isExcluded = false;
    if (parentVisibility === TreeVisibility.Hidden) {
      stat.isExcluded = true;
      return false;
    }
    if (this.explorerService.getEditableData(stat)) {
      return true;
    }
    const cached = this.hiddenExpressionPerRoot.get(stat.root.resource.toString());
    const globMatch = cached?.parsed(path.relative(stat.root.resource.path, stat.resource.path), stat.name, (name) => !!stat.parent?.getChild(name));
    const isHiddenResource = globMatch ? true : this.isIgnored(stat.resource, stat.root.resource, stat.isDirectory);
    if (isHiddenResource || stat.parent?.isExcluded) {
      stat.isExcluded = true;
      const editors = this.editorService.visibleEditors;
      const editor = editors.find((e) => e.resource && this.uriIdentityService.extUri.isEqualOrParent(e.resource, stat.resource));
      if (editor && stat.root === this.explorerService.findClosestRoot(stat.resource)) {
        this.editorsAffectingFilter.add(editor);
        return true;
      }
      return false;
    }
    return true;
  }
  isIgnored(resource, rootResource, isDirectory) {
    const ignoreFile = this.ignoreTreesPerRoot.get(rootResource.toString())?.findSubstr(resource);
    const isIncludedInTraversal = ignoreFile?.isPathIncludedInTraversal(resource.path, isDirectory);
    return isIncludedInTraversal === void 0 ? false : !isIncludedInTraversal;
  }
  dispose() {
    dispose(this.toDispose);
  }
};
FilesFilter = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IExplorerService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IFileService)
], FilesFilter);
let FileSorter = class {
  constructor(explorerService, contextService) {
    this.explorerService = explorerService;
    this.contextService = contextService;
  }
  compare(statA, statB) {
    if (statA.isRoot) {
      if (statB.isRoot) {
        const workspaceA = this.contextService.getWorkspaceFolder(statA.resource);
        const workspaceB = this.contextService.getWorkspaceFolder(statB.resource);
        return workspaceA && workspaceB ? workspaceA.index - workspaceB.index : -1;
      }
      return -1;
    }
    if (statB.isRoot) {
      return 1;
    }
    const sortOrder = this.explorerService.sortOrderConfiguration.sortOrder;
    const lexicographicOptions = this.explorerService.sortOrderConfiguration.lexicographicOptions;
    const reverse = this.explorerService.sortOrderConfiguration.reverse;
    if (reverse) {
      [statA, statB] = [statB, statA];
    }
    let compareFileNames;
    let compareFileExtensions;
    switch (lexicographicOptions) {
      case "upper":
        compareFileNames = compareFileNamesUpper;
        compareFileExtensions = compareFileExtensionsUpper;
        break;
      case "lower":
        compareFileNames = compareFileNamesLower;
        compareFileExtensions = compareFileExtensionsLower;
        break;
      case "unicode":
        compareFileNames = compareFileNamesUnicode;
        compareFileExtensions = compareFileExtensionsUnicode;
        break;
      default:
        compareFileNames = compareFileNamesDefault;
        compareFileExtensions = compareFileExtensionsDefault;
    }
    switch (sortOrder) {
      case "type":
        if (statA.isDirectory && !statB.isDirectory) {
          return -1;
        }
        if (statB.isDirectory && !statA.isDirectory) {
          return 1;
        }
        if (statA.isDirectory && statB.isDirectory) {
          return compareFileNames(statA.name, statB.name);
        }
        break;
      case "filesFirst":
        if (statA.isDirectory && !statB.isDirectory) {
          return 1;
        }
        if (statB.isDirectory && !statA.isDirectory) {
          return -1;
        }
        break;
      case "foldersNestsFiles":
        if (statA.isDirectory && !statB.isDirectory) {
          return -1;
        }
        if (statB.isDirectory && !statA.isDirectory) {
          return 1;
        }
        if (statA.hasNests && !statB.hasNests) {
          return -1;
        }
        if (statB.hasNests && !statA.hasNests) {
          return 1;
        }
        break;
      case "mixed":
        break;
      // not sorting when "mixed" is on
      default:
        if (statA.isDirectory && !statB.isDirectory) {
          return -1;
        }
        if (statB.isDirectory && !statA.isDirectory) {
          return 1;
        }
        break;
    }
    switch (sortOrder) {
      case "type":
        return compareFileExtensions(statA.name, statB.name);
      case "modified":
        if (statA.mtime !== statB.mtime) {
          return statA.mtime && statB.mtime && statA.mtime < statB.mtime ? 1 : -1;
        }
        return compareFileNames(statA.name, statB.name);
      default:
        return compareFileNames(statA.name, statB.name);
    }
  }
};
FileSorter = __decorateClass([
  __decorateParam(0, IExplorerService),
  __decorateParam(1, IWorkspaceContextService)
], FileSorter);
let FileDragAndDrop = class {
  constructor(isCollapsed, explorerService, editorService, dialogService, contextService, fileService, configurationService, instantiationService, workspaceEditingService, uriIdentityService) {
    this.isCollapsed = isCollapsed;
    this.explorerService = explorerService;
    this.editorService = editorService;
    this.dialogService = dialogService;
    this.contextService = contextService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.workspaceEditingService = workspaceEditingService;
    this.uriIdentityService = uriIdentityService;
    this.compressedDropTargetDisposable = Disposable.None;
    this.disposables = new DisposableStore();
    this.dropEnabled = false;
    const updateDropEnablement = (e) => {
      if (!e || e.affectsConfiguration("explorer.enableDragAndDrop")) {
        this.dropEnabled = this.configurationService.getValue("explorer.enableDragAndDrop");
      }
    };
    updateDropEnablement(void 0);
    this.disposables.add(this.configurationService.onDidChangeConfiguration((e) => updateDropEnablement(e)));
  }
  onDragOver(data, target, targetIndex, targetSector, originalEvent) {
    if (!this.dropEnabled) {
      return false;
    }
    if (target) {
      const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);
      if (compressedTarget) {
        const iconLabelName = getIconLabelNameFromHTMLElement(originalEvent.target);
        if (iconLabelName && iconLabelName.index < iconLabelName.count - 1) {
          const result = this.handleDragOver(data, compressedTarget, targetIndex, targetSector, originalEvent);
          if (result) {
            if (iconLabelName.element !== this.compressedDragOverElement) {
              this.compressedDragOverElement = iconLabelName.element;
              this.compressedDropTargetDisposable.dispose();
              this.compressedDropTargetDisposable = toDisposable(() => {
                iconLabelName.element.classList.remove("drop-target");
                this.compressedDragOverElement = void 0;
              });
              iconLabelName.element.classList.add("drop-target");
            }
            return typeof result === "boolean" ? result : { ...result, feedback: [] };
          }
          this.compressedDropTargetDisposable.dispose();
          return false;
        }
      }
    }
    this.compressedDropTargetDisposable.dispose();
    return this.handleDragOver(data, target, targetIndex, targetSector, originalEvent);
  }
  handleDragOver(data, target, targetIndex, targetSector, originalEvent) {
    const isCopy = originalEvent && (originalEvent.ctrlKey && !isMacintosh || originalEvent.altKey && isMacintosh);
    const isNative = data instanceof NativeDragAndDropData;
    const effectType = isNative || isCopy ? ListDragOverEffectType.Copy : ListDragOverEffectType.Move;
    const effect = { type: effectType, position: ListDragOverEffectPosition.Over };
    if (isNative) {
      if (!containsDragType(originalEvent, DataTransfers.FILES, CodeDataTransfers.FILES, DataTransfers.RESOURCES)) {
        return false;
      }
    } else if (data instanceof ExternalElementsDragAndDropData) {
      return false;
    } else {
      const items = FileDragAndDrop.getStatsFromDragAndDropData(data);
      const isRootsReorder = items.every((item) => item.isRoot);
      if (!target) {
        if (!isCopy && items.every((i) => !!i.parent && i.parent.isRoot)) {
          return false;
        }
        if (isRootsReorder) {
          return { accept: true, effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.After } };
        }
        return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: false };
      }
      if (!Array.isArray(items)) {
        return false;
      }
      if (!isCopy && items.every((source) => source.isReadonly)) {
        return false;
      }
      if (items.some((source) => {
        if (source.isRoot) {
          return false;
        }
        if (this.uriIdentityService.extUri.isEqual(source.resource, target.resource)) {
          return true;
        }
        if (!isCopy && this.uriIdentityService.extUri.isEqual(dirname(source.resource), target.resource)) {
          return true;
        }
        if (this.uriIdentityService.extUri.isEqualOrParent(target.resource, source.resource)) {
          return true;
        }
        return false;
      })) {
        return false;
      }
      if (isRootsReorder) {
        if (!target.isRoot) {
          return false;
        }
        let dropEffectPosition = void 0;
        switch (targetSector) {
          case ListViewTargetSector.TOP:
          case ListViewTargetSector.CENTER_TOP:
            dropEffectPosition = ListDragOverEffectPosition.Before;
            break;
          case ListViewTargetSector.CENTER_BOTTOM:
          case ListViewTargetSector.BOTTOM:
            dropEffectPosition = ListDragOverEffectPosition.After;
            break;
        }
        return { accept: true, effect: { type: ListDragOverEffectType.Move, position: dropEffectPosition } };
      }
    }
    if (!target) {
      return { accept: true, bubble: TreeDragOverBubble.Down, effect };
    } else {
      if (target.isDirectory) {
        if (target.isReadonly) {
          return false;
        }
        return { accept: true, bubble: TreeDragOverBubble.Down, effect, autoExpand: true };
      }
      if (this.contextService.getWorkspace().folders.every((folder) => folder.uri.toString() !== target.resource.toString())) {
        return { accept: true, bubble: TreeDragOverBubble.Up, effect };
      }
    }
    return false;
  }
  getDragURI(element) {
    if (this.explorerService.isEditable(element)) {
      return null;
    }
    return element.resource.toString();
  }
  getDragLabel(elements, originalEvent) {
    if (elements.length === 1) {
      const stat = FileDragAndDrop.getCompressedStatFromDragEvent(elements[0], originalEvent);
      return stat.name;
    }
    return String(elements.length);
  }
  onDragStart(data, originalEvent) {
    const items = FileDragAndDrop.getStatsFromDragAndDropData(data, originalEvent);
    if (items.length && originalEvent.dataTransfer) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, items, originalEvent));
      const fileResources = items.filter((s) => s.resource.scheme === Schemas.file).map((r) => r.resource.fsPath);
      if (fileResources.length) {
        originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
      }
    }
  }
  async drop(data, target, targetIndex, targetSector, originalEvent) {
    this.compressedDropTargetDisposable.dispose();
    if (target) {
      const compressedTarget = FileDragAndDrop.getCompressedStatFromDragEvent(target, originalEvent);
      if (compressedTarget) {
        target = compressedTarget;
      }
    }
    if (!target) {
      target = this.explorerService.roots[this.explorerService.roots.length - 1];
      targetSector = ListViewTargetSector.BOTTOM;
    }
    if (!target.isDirectory && target.parent) {
      target = target.parent;
    }
    if (target.isReadonly) {
      return;
    }
    const resolvedTarget = target;
    if (!resolvedTarget) {
      return;
    }
    try {
      if (data instanceof NativeDragAndDropData) {
        if (!isWeb || isTemporaryWorkspace(this.contextService.getWorkspace()) && WebFileSystemAccess.supported(mainWindow)) {
          const fileImport = this.instantiationService.createInstance(ExternalFileImport);
          await fileImport.import(resolvedTarget, originalEvent, mainWindow);
        } else {
          const browserUpload = this.instantiationService.createInstance(BrowserFileUpload);
          await browserUpload.upload(target, originalEvent);
        }
      } else {
        await this.handleExplorerDrop(data, resolvedTarget, targetIndex, targetSector, originalEvent);
      }
    } catch (error) {
      this.dialogService.error(toErrorMessage(error));
    }
  }
  async handleExplorerDrop(data, target, targetIndex, targetSector, originalEvent) {
    const elementsData = FileDragAndDrop.getStatsFromDragAndDropData(data);
    const distinctItems = new Map(elementsData.map((element) => [element, this.isCollapsed(element)]));
    for (const [item, collapsed] of distinctItems) {
      if (collapsed) {
        const nestedChildren = item.nestedChildren;
        if (nestedChildren) {
          for (const child of nestedChildren) {
            distinctItems.set(child, true);
          }
        }
      }
    }
    const items = distinctParents([...distinctItems.keys()], (s) => s.resource);
    const isCopy = originalEvent.ctrlKey && !isMacintosh || originalEvent.altKey && isMacintosh;
    const confirmDragAndDrop = !isCopy && this.configurationService.getValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY);
    if (confirmDragAndDrop) {
      const message = items.length > 1 && items.every((s) => s.isRoot) ? localize("confirmRootsMove", "Are you sure you want to change the order of multiple root folders in your workspace?") : items.length > 1 ? localize("confirmMultiMove", "Are you sure you want to move the following {0} files into '{1}'?", items.length, target.name) : items[0].isRoot ? localize("confirmRootMove", "Are you sure you want to change the order of root folder '{0}' in your workspace?", items[0].name) : localize("confirmMove", "Are you sure you want to move '{0}' into '{1}'?", items[0].name, target.name);
      const detail = items.length > 1 && !items.every((s) => s.isRoot) ? getFileNamesMessage(items.map((i) => i.resource)) : void 0;
      const confirmation = await this.dialogService.confirm({
        message,
        detail,
        checkbox: {
          label: localize("doNotAskAgain", "Do not ask me again")
        },
        primaryButton: localize({ key: "moveButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Move")
      });
      if (!confirmation.confirmed) {
        return;
      }
      if (confirmation.checkboxChecked === true) {
        await this.configurationService.updateValue(FileDragAndDrop.CONFIRM_DND_SETTING_KEY, false);
      }
    }
    await this.doHandleRootDrop(items.filter((s) => s.isRoot), target, targetSector);
    const sources = items.filter((s) => !s.isRoot);
    if (isCopy) {
      return this.doHandleExplorerDropOnCopy(sources, target);
    }
    return this.doHandleExplorerDropOnMove(sources, target);
  }
  async doHandleRootDrop(roots, target, targetSector) {
    if (roots.length === 0) {
      return;
    }
    const folders = this.contextService.getWorkspace().folders;
    let targetIndex;
    const sourceIndices = [];
    const workspaceCreationData = [];
    const rootsToMove = [];
    for (let index = 0; index < folders.length; index++) {
      const data = {
        uri: folders[index].uri,
        name: folders[index].name
      };
      if (target instanceof ExplorerItem && this.uriIdentityService.extUri.isEqual(folders[index].uri, target.resource)) {
        targetIndex = index;
      }
      for (const root of roots) {
        if (this.uriIdentityService.extUri.isEqual(folders[index].uri, root.resource)) {
          sourceIndices.push(index);
          break;
        }
      }
      if (roots.every((r) => r.resource.toString() !== folders[index].uri.toString())) {
        workspaceCreationData.push(data);
      } else {
        rootsToMove.push(data);
      }
    }
    if (targetIndex === void 0) {
      targetIndex = workspaceCreationData.length;
    } else {
      switch (targetSector) {
        case ListViewTargetSector.BOTTOM:
        case ListViewTargetSector.CENTER_BOTTOM:
          targetIndex++;
          break;
      }
      for (const sourceIndex of sourceIndices) {
        if (sourceIndex < targetIndex) {
          targetIndex--;
        }
      }
    }
    workspaceCreationData.splice(targetIndex, 0, ...rootsToMove);
    return this.workspaceEditingService.updateFolders(0, workspaceCreationData.length, workspaceCreationData);
  }
  async doHandleExplorerDropOnCopy(sources, target) {
    const explorerConfig = this.configurationService.getValue().explorer;
    const resourceFileEdits = [];
    for (const { resource, isDirectory } of sources) {
      const allowOverwrite = explorerConfig.incrementalNaming === "disabled";
      const newResource = await findValidPasteFileTarget(
        this.explorerService,
        this.fileService,
        this.dialogService,
        target,
        { resource, isDirectory, allowOverwrite },
        explorerConfig.incrementalNaming
      );
      if (!newResource) {
        continue;
      }
      const resourceEdit = new ResourceFileEdit(resource, newResource, { copy: true, overwrite: allowOverwrite });
      resourceFileEdits.push(resourceEdit);
    }
    const labelSuffix = getFileOrFolderLabelSuffix(sources);
    await this.explorerService.applyBulkEdit(resourceFileEdits, {
      confirmBeforeUndo: explorerConfig.confirmUndo === UndoConfirmLevel.Default || explorerConfig.confirmUndo === UndoConfirmLevel.Verbose,
      undoLabel: localize("copy", "Copy {0}", labelSuffix),
      progressLabel: localize("copying", "Copying {0}", labelSuffix)
    });
    const editors = resourceFileEdits.filter((edit) => {
      const item = edit.newResource ? this.explorerService.findClosest(edit.newResource) : void 0;
      return item && !item.isDirectory;
    }).map((edit) => ({ resource: edit.newResource, options: { pinned: true } }));
    await this.editorService.openEditors(editors);
  }
  async doHandleExplorerDropOnMove(sources, target) {
    const resourceFileEdits = sources.filter((source) => !source.isReadonly).map((source) => new ResourceFileEdit(source.resource, joinPath(target.resource, source.name)));
    const labelSuffix = getFileOrFolderLabelSuffix(sources);
    const options = {
      confirmBeforeUndo: this.configurationService.getValue().explorer.confirmUndo === UndoConfirmLevel.Verbose,
      undoLabel: localize("move", "Move {0}", labelSuffix),
      progressLabel: localize("moving", "Moving {0}", labelSuffix)
    };
    try {
      await this.explorerService.applyBulkEdit(resourceFileEdits, options);
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_MOVE_CONFLICT) {
        const overwrites = [];
        for (const edit of resourceFileEdits) {
          if (edit.newResource && await this.fileService.exists(edit.newResource)) {
            overwrites.push(edit.newResource);
          }
        }
        const confirm = getMultipleFilesOverwriteConfirm(overwrites);
        const { confirmed } = await this.dialogService.confirm(confirm);
        if (confirmed) {
          await this.explorerService.applyBulkEdit(resourceFileEdits.map((re) => new ResourceFileEdit(re.oldResource, re.newResource, { overwrite: true })), options);
        }
      } else {
        throw error;
      }
    }
  }
  static getStatsFromDragAndDropData(data, dragStartEvent) {
    if (data.context) {
      return data.context;
    }
    if (dragStartEvent && data.elements.length === 1) {
      data.context = [FileDragAndDrop.getCompressedStatFromDragEvent(data.elements[0], dragStartEvent)];
      return data.context;
    }
    return data.elements;
  }
  static getCompressedStatFromDragEvent(stat, dragEvent) {
    const target = DOM.getWindow(dragEvent).document.elementFromPoint(dragEvent.clientX, dragEvent.clientY);
    const iconLabelName = getIconLabelNameFromHTMLElement(target);
    if (iconLabelName) {
      const { count, index } = iconLabelName;
      let i = count - 1;
      while (i > index && stat.parent) {
        stat = stat.parent;
        i--;
      }
      return stat;
    }
    return stat;
  }
  onDragEnd() {
    this.compressedDropTargetDisposable.dispose();
  }
  dispose() {
    this.compressedDropTargetDisposable.dispose();
  }
};
FileDragAndDrop.CONFIRM_DND_SETTING_KEY = "explorer.confirmDragAndDrop";
FileDragAndDrop = __decorateClass([
  __decorateParam(1, IExplorerService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IWorkspaceEditingService),
  __decorateParam(9, IUriIdentityService)
], FileDragAndDrop);
function getIconLabelNameFromHTMLElement(target) {
  if (!DOM.isHTMLElement(target)) {
    return null;
  }
  let element = target;
  while (element && !element.classList.contains("monaco-list-row")) {
    if (element.classList.contains("label-name") && element.hasAttribute("data-icon-label-count")) {
      const count = Number(element.getAttribute("data-icon-label-count"));
      const index = Number(element.getAttribute("data-icon-label-index"));
      if (isNumber(count) && isNumber(index)) {
        return { element, count, index };
      }
    }
    element = element.parentElement;
  }
  return null;
}
function isCompressedFolderName(target) {
  return !!getIconLabelNameFromHTMLElement(target);
}
class ExplorerCompressionDelegate {
  isIncompressible(stat) {
    return stat.isRoot || !stat.isDirectory || stat instanceof NewExplorerItem || (!stat.parent || stat.parent.isRoot);
  }
}
function getFileOrFolderLabelSuffix(items) {
  if (items.length === 1) {
    return items[0].name;
  }
  if (items.every((i) => i.isDirectory)) {
    return localize("numberOfFolders", "{0} folders", items.length);
  }
  if (items.every((i) => !i.isDirectory)) {
    return localize("numberOfFiles", "{0} files", items.length);
  }
  return `${items.length} files and folders`;
}
export {
  CompressedNavigationController,
  ExplorerCompressionDelegate,
  ExplorerDataSource,
  ExplorerDelegate,
  ExplorerFindProvider,
  FileDragAndDrop,
  FileSorter,
  FilesFilter,
  FilesRenderer,
  PhantomExplorerItem,
  explorerRootErrorEmitter,
  isCompressedFolderName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx2aWV3c1xcZXhwbG9yZXJWaWV3ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiwgTGlzdERyYWdPdmVyRWZmZWN0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlS2luZCwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBGaWxlQ2hhbmdlVHlwZSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1RlbXBvcmFyeVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVMYWJlbE9wdGlvbnMsIElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSwgSVRyZWVGaWx0ZXIsIFRyZWVWaXNpYmlsaXR5LCBJQXN5bmNEYXRhU291cmNlLCBJVHJlZVNvcnRlciwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uLCBUcmVlRHJhZ092ZXJCdWJibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGaW5kUHJvdmlkZXJBY3RpdmUsIElGaWxlc0NvbmZpZ3VyYXRpb24sIFVuZG9Db25maXJtTGV2ZWwgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pblBhdGgsIGRpc3RpbmN0UGFyZW50cywgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElucHV0Qm94LCBNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBFeHBsb3Jlckl0ZW0sIE5ld0V4cGxvcmVySXRlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHBsb3Jlck1vZGVsLmpzJztcbmltcG9ydCB7IGNvbXBhcmVGaWxlRXh0ZW5zaW9uc0RlZmF1bHQsIGNvbXBhcmVGaWxlTmFtZXNEZWZhdWx0LCBjb21wYXJlRmlsZU5hbWVzVXBwZXIsIGNvbXBhcmVGaWxlRXh0ZW5zaW9uc1VwcGVyLCBjb21wYXJlRmlsZU5hbWVzTG93ZXIsIGNvbXBhcmVGaWxlRXh0ZW5zaW9uc0xvd2VyLCBjb21wYXJlRmlsZU5hbWVzVW5pY29kZSwgY29tcGFyZUZpbGVFeHRlbnNpb25zVW5pY29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgY29udGFpbnNEcmFnVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhLCBEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBOYXRpdmVEcmFnQW5kRHJvcERhdGEsIEV4dGVybmFsRWxlbWVudHNEcmFnQW5kRHJvcERhdGEsIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBnZXRGaWxlTmFtZXNNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VFZGl0aW5nLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBmaW5kVmFsaWRQYXN0ZUZpbGVUYXJnZXQgfSBmcm9tICcuLi9maWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlLCBjcmVhdGVNYXRjaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCwgRXZlbnRNdWx0aXBsZXhlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFUcmVlVmlld1N0YXRlLCBJQXN5bmNGaW5kUHJvdmlkZXIsIElBc3luY0ZpbmRSZXN1bHQsIElBc3luY0ZpbmRUb2dnbGVzLCBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFJlc291cmNlRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJGaWxlVXBsb2FkLCBFeHRlcm5hbEZpbGVJbXBvcnQsIGdldE11bHRpcGxlRmlsZXNPdmVyd3JpdGVDb25maXJtIH0gZnJvbSAnLi4vZmlsZUltcG9ydEV4cG9ydC5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBXZWJGaWxlU3lzdGVtQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvYnJvd3Nlci93ZWJGaWxlU3lzdGVtQWNjZXNzLmpzJztcbmltcG9ydCB7IElnbm9yZUZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL2lnbm9yZUZpbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVGVybmFyeVNlYXJjaFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90ZXJuYXJ5U2VhcmNoVHJlZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q291bnRCYWRnZVN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJGaWxlQ29udHJpYnV0aW9uLCBleHBsb3JlckZpbGVDb250cmliUmVnaXN0cnkgfSBmcm9tICcuLi9leHBsb3JlckZpbGVDb250cmliLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFNlcnZpY2UsIFF1ZXJ5VHlwZSwgZ2V0RXhjbHVkZXMsIElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoQ29tcGxldGUsIElGaWxlUXVlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBUcmVlRmluZE1hdGNoVHlwZSwgVHJlZUZpbmRNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgbGlzdEZpbHRlck1hdGNoSGlnaGxpZ2h0LCBsaXN0RmlsdGVyTWF0Y2hIaWdobGlnaHRCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEV4cGxvcmVySXRlbT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJVEVNX0hFSUdIVCA9IDIyO1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBFeHBsb3Jlckl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiBFeHBsb3JlckRlbGVnYXRlLklURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBFeHBsb3Jlckl0ZW0pOiBzdHJpbmcge1xuXHRcdHJldHVybiBGaWxlc1JlbmRlcmVyLklEO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBleHBsb3JlclJvb3RFcnJvckVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxVUkk+KCk7XG5leHBvcnQgY2xhc3MgRXhwbG9yZXJEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFeHBsb3Jlckl0ZW0gfCBFeHBsb3Jlckl0ZW1bXSwgRXhwbG9yZXJJdGVtPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlRmlsdGVyOiBGaWxlc0ZpbHRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbmRQcm92aWRlcjogRXhwbG9yZXJGaW5kUHJvdmlkZXIsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0UGFyZW50KGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IEV4cGxvcmVySXRlbSB7XG5cdFx0aWYgKGVsZW1lbnQucGFyZW50KSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdnZXRQYXJlbnQgb25seSBzdXBwb3J0ZWQgZm9yIGNhY2hlZCBwYXJlbnRzJyk7XG5cdH1cblxuXHRoYXNDaGlsZHJlbihlbGVtZW50OiBFeHBsb3Jlckl0ZW0gfCBFeHBsb3Jlckl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRcdC8vIGRvbid0IHJlbmRlciBuZXN0IHBhcmVudHMgYXMgY29udGFpbmluZyBjaGlsZHJlbiB3aGVuIGFsbCB0aGUgY2hpbGRyZW4gYXJlIGZpbHRlcmVkIG91dFxuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KGVsZW1lbnQpIHx8IGVsZW1lbnQuaGFzQ2hpbGRyZW4oKHN0YXQpID0+IHRoaXMuZmlsZUZpbHRlci5maWx0ZXIoc3RhdCwgVHJlZVZpc2liaWxpdHkuVmlzaWJsZSkpO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogRXhwbG9yZXJJdGVtIHwgRXhwbG9yZXJJdGVtW10pOiBFeHBsb3Jlckl0ZW1bXSB8IFByb21pc2U8RXhwbG9yZXJJdGVtW10+IHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZmluZFByb3ZpZGVyLmlzU2hvd2luZ0ZpbHRlclJlc3VsdHMoKSkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20oZWxlbWVudC5jaGlsZHJlbi52YWx1ZXMoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzRXJyb3IgPSBlbGVtZW50LmVycm9yO1xuXHRcdGNvbnN0IHNvcnRPcmRlciA9IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnNvcnRPcmRlckNvbmZpZ3VyYXRpb24uc29ydE9yZGVyO1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gZWxlbWVudC5mZXRjaENoaWxkcmVuKHNvcnRPcmRlcik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY2hpbGRyZW4pKSB7XG5cdFx0XHQvLyBmYXN0IHBhdGggd2hlbiBjaGlsZHJlbiBhcmUga25vd24gc3luYyAoaS5lLiBuZXN0ZWQgY2hpbGRyZW4pXG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fVxuXHRcdGNvbnN0IHByb21pc2UgPSBjaGlsZHJlbi50aGVuKFxuXHRcdFx0Y2hpbGRyZW4gPT4ge1xuXHRcdFx0XHQvLyBDbGVhciBwcmV2aW91cyBlcnJvciBkZWNvcmF0aW9uIG9uIHJvb3QgZm9sZGVyXG5cdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtICYmIGVsZW1lbnQuaXNSb290ICYmICFlbGVtZW50LmVycm9yICYmIGhhc0Vycm9yICYmIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRcdFx0ZXhwbG9yZXJSb290RXJyb3JFbWl0dGVyLmZpcmUoZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHRcdFx0fVxuXHRcdFx0LCBlID0+IHtcblxuXHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEV4cGxvcmVySXRlbSAmJiBlbGVtZW50LmlzUm9vdCkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0XHRcdFx0Ly8gU2luZ2xlIGZvbGRlciBjcmVhdGUgYSBkdW1teSBleHBsb3JlciBpdGVtIHRvIHNob3cgZXJyb3Jcblx0XHRcdFx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gbmV3IEV4cGxvcmVySXRlbShlbGVtZW50LnJlc291cmNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ1NlcnZpY2UsIHRoaXMuZmlsZXNDb25maWdTZXJ2aWNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0cGxhY2Vob2xkZXIuZXJyb3IgPSBlO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtwbGFjZWhvbGRlcl07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGV4cGxvcmVyUm9vdEVycm9yRW1pdHRlci5maXJlKGVsZW1lbnQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBEbyBub3Qgc2hvdyBlcnJvciBmb3Igcm9vdHMgc2luY2Ugd2UgYWxyZWFkeSB1c2UgYW4gZXhwbG9yZXIgZGVjb3JhdGlvbiB0byBub3RpZnkgdXNlclxuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBbXTsgLy8gd2UgY291bGQgbm90IHJlc29sdmUgYW55IGNoaWxkcmVuIGJlY2F1c2Ugb2YgYW4gZXJyb3Jcblx0XHRcdH0pO1xuXG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLkV4cGxvcmVyLFxuXHRcdFx0ZGVsYXk6IHRoaXMubGF5b3V0U2VydmljZS5pc1Jlc3RvcmVkKCkgPyA4MDAgOiAxNTAwIC8vIHJlZHVjZSBwcm9ncmVzcyB2aXNpYmlsaXR5IHdoZW4gc3RpbGwgcmVzdG9yaW5nXG5cdFx0fSwgX3Byb2dyZXNzID0+IHByb21pc2UpO1xuXG5cdFx0cmV0dXJuIHByb21pc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBoYW50b21FeHBsb3Jlckl0ZW0gZXh0ZW5kcyBFeHBsb3Jlckl0ZW0ge1xuXG59XG5cbmludGVyZmFjZSBGaW5kSGlnaGxpZ2h0TGF5ZXIge1xuXHRjaGlsZE1hdGNoZXM6IG51bWJlcjtcblx0aXNNYXRjaDogYm9vbGVhbjtcblx0c3RhdHM6IHtcblx0XHRbc3RhdE5hbWU6IHN0cmluZ106IEZpbmRIaWdobGlnaHRMYXllcjtcblx0fTtcbn1cblxuaW50ZXJmYWNlIElFeHBsb3JlckZpbmRIaWdobGlnaHRUcmVlIHtcblx0Z2V0KGl0ZW06IEV4cGxvcmVySXRlbSk6IG51bWJlcjtcblx0aXNNYXRjaChpdGVtOiBFeHBsb3Jlckl0ZW0pOiBib29sZWFuO1xufVxuXG5jbGFzcyBFeHBsb3JlckZpbmRIaWdobGlnaHRUcmVlIGltcGxlbWVudHMgSUV4cGxvcmVyRmluZEhpZ2hsaWdodFRyZWUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWUgPSBuZXcgTWFwPHN0cmluZywgRmluZEhpZ2hsaWdodExheWVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oaWdobGlnaHRlZEl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIEV4cGxvcmVySXRlbT4oKTtcblx0Z2V0IGhpZ2hsaWdodGVkSXRlbXMoKTogRXhwbG9yZXJJdGVtW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2hpZ2hsaWdodGVkSXRlbXMudmFsdWVzKCkpO1xuXHR9XG5cblx0Z2V0KGl0ZW06IEV4cGxvcmVySXRlbSk6IG51bWJlciB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5maW5kKGl0ZW0pO1xuXHRcdGlmIChyZXN1bHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0cmVlTGF5ZXIsIHJlbFBhdGggfSA9IHJlc3VsdDtcblx0XHR0aGlzLl9oaWdobGlnaHRlZEl0ZW1zLnNldChyZWxQYXRoLCBpdGVtKTtcblxuXHRcdHJldHVybiB0cmVlTGF5ZXIuY2hpbGRNYXRjaGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kKGl0ZW06IEV4cGxvcmVySXRlbSk6IHsgdHJlZUxheWVyOiBGaW5kSGlnaGxpZ2h0TGF5ZXI7IHJlbFBhdGg6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByb290TGF5ZXIgPSB0aGlzLl90cmVlLmdldChpdGVtLnJvb3QubmFtZSk7XG5cdFx0aWYgKHJvb3RMYXllciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbFBhdGggPSByZWxhdGl2ZVBhdGgoaXRlbS5yb290LnJlc291cmNlLCBpdGVtLnJlc291cmNlKTtcblx0XHRpZiAocmVsUGF0aCA9PT0gdW5kZWZpbmVkIHx8IHJlbFBhdGguc3RhcnRzV2l0aCgnLi4nKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNvdXJjZSBpcyBub3QgYSBjaGlsZCBvZiB0aGUgcm9vdCcpO1xuXHRcdH1cblxuXHRcdGlmIChyZWxQYXRoID09PSAnJykge1xuXHRcdFx0cmV0dXJuIHsgdHJlZUxheWVyOiByb290TGF5ZXIsIHJlbFBhdGggfTtcblx0XHR9XG5cblx0XHRsZXQgdHJlZUxheWVyID0gcm9vdExheWVyO1xuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiByZWxQYXRoLnNwbGl0KCcvJykpIHtcblx0XHRcdGlmICghdHJlZUxheWVyLnN0YXRzW3NlZ21lbnRdKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRyZWVMYXllciA9IHRyZWVMYXllci5zdGF0c1tzZWdtZW50XTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB0cmVlTGF5ZXIsIHJlbFBhdGggfTtcblx0fVxuXG5cdGFkZChyZXNvdXJjZTogVVJJLCByb290OiBFeHBsb3Jlckl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCByZWxQYXRoID0gcmVsYXRpdmVQYXRoKHJvb3QucmVzb3VyY2UsIHJlc291cmNlKTtcblx0XHRpZiAocmVsUGF0aCA9PT0gdW5kZWZpbmVkIHx8IHJlbFBhdGguc3RhcnRzV2l0aCgnLi4nKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNvdXJjZSBpcyBub3QgYSBjaGlsZCBvZiB0aGUgcm9vdCcpO1xuXHRcdH1cblxuXHRcdGxldCByb290TGF5ZXIgPSB0aGlzLl90cmVlLmdldChyb290Lm5hbWUpO1xuXHRcdGlmICghcm9vdExheWVyKSB7XG5cdFx0XHRyb290TGF5ZXIgPSB7IGNoaWxkTWF0Y2hlczogMCwgc3RhdHM6IHt9LCBpc01hdGNoOiBmYWxzZSB9O1xuXHRcdFx0dGhpcy5fdHJlZS5zZXQocm9vdC5uYW1lLCByb290TGF5ZXIpO1xuXHRcdH1cblx0XHRyb290TGF5ZXIuY2hpbGRNYXRjaGVzKys7XG5cblx0XHRsZXQgdHJlZUxheWVyID0gcm9vdExheWVyO1xuXHRcdGZvciAoY29uc3Qgc3RhdCBvZiByZWxQYXRoLnNwbGl0KCcvJykpIHtcblx0XHRcdGlmICghdHJlZUxheWVyLnN0YXRzW3N0YXRdKSB7XG5cdFx0XHRcdHRyZWVMYXllci5zdGF0c1tzdGF0XSA9IHsgY2hpbGRNYXRjaGVzOiAwLCBzdGF0czoge30sIGlzTWF0Y2g6IGZhbHNlIH07XG5cdFx0XHR9XG5cblx0XHRcdHRyZWVMYXllciA9IHRyZWVMYXllci5zdGF0c1tzdGF0XTtcblx0XHRcdHRyZWVMYXllci5jaGlsZE1hdGNoZXMrKztcblx0XHR9XG5cblx0XHR0cmVlTGF5ZXIuY2hpbGRNYXRjaGVzLS07IC8vIHRoZSBsYXN0IHNlZ21lbnQgaXMgdGhlIGZpbGUgaXRzZWxmXG5cdFx0dHJlZUxheWVyLmlzTWF0Y2ggPSB0cnVlO1xuXHR9XG5cblx0aXNNYXRjaChpdGVtOiBFeHBsb3Jlckl0ZW0pOiBib29sZWFuIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmZpbmQoaXRlbSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0cmVlTGF5ZXIgfSA9IHJlc3VsdDtcblx0XHRyZXR1cm4gdHJlZUxheWVyLmlzTWF0Y2g7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLmNsZWFyKCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJGaW5kUHJvdmlkZXIgaW1wbGVtZW50cyBJQXN5bmNGaW5kUHJvdmlkZXI8RXhwbG9yZXJJdGVtPiB7XG5cblx0cHJpdmF0ZSBzZXNzaW9uSWQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgZmlsdGVyU2Vzc2lvblN0YXJ0U3RhdGU6IHsgdmlld1N0YXRlOiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZTsgaW5wdXQ6IEV4cGxvcmVySXRlbVtdIHwgRXhwbG9yZXJJdGVtOyByb290c1dpdGhQcm92aWRlcnM6IFNldDxFeHBsb3Jlckl0ZW0+IH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGlnaGxpZ2h0U2Vzc2lvblN0YXJ0U3RhdGU6IHsgcm9vdHNXaXRoUHJvdmlkZXJzOiBTZXQ8RXhwbG9yZXJJdGVtPiB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGV4cGxvcmVyRmluZEFjdGl2ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHBoYW50b21QYXJlbnRzID0gbmV3IFNldDxFeHBsb3Jlckl0ZW0+KCk7XG5cdHByaXZhdGUgZmluZEhpZ2hsaWdodFRyZWUgPSBuZXcgRXhwbG9yZXJGaW5kSGlnaGxpZ2h0VHJlZSgpO1xuXHRnZXQgaGlnaGxpZ2h0VHJlZSgpOiBJRXhwbG9yZXJGaW5kSGlnaGxpZ2h0VHJlZSB7XG5cdFx0cmV0dXJuIHRoaXMuZmluZEhpZ2hsaWdodFRyZWU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVzRmlsdGVyOiBGaWxlc0ZpbHRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRyZWVQcm92aWRlcjogKCkgPT4gV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxFeHBsb3Jlckl0ZW0gfCBFeHBsb3Jlckl0ZW1bXSwgRXhwbG9yZXJJdGVtLCBGdXp6eVNjb3JlPixcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ1NlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmV4cGxvcmVyRmluZEFjdGl2ZUNvbnRleHRLZXkgPSBFeHBsb3JlckZpbmRQcm92aWRlckFjdGl2ZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0aXNTaG93aW5nRmlsdGVyUmVzdWx0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlO1xuXHR9XG5cblx0aXNWaXNpYmxlKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5maWx0ZXJTZXNzaW9uU3RhcnRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmlzRWRpdGFibGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlLnJvb3RzV2l0aFByb3ZpZGVycy5oYXMoZWxlbWVudC5yb290KSA/IGVsZW1lbnQuaXNNYXJrZWRBc0ZpbHRlcmVkKCkgOiB0cnVlO1xuXHR9XG5cblx0c3RhcnRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbklkKys7XG5cdH1cblxuXHRhc3luYyBlbmRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlc3RvcmUgdmlldyBzdGF0ZVxuXHRcdGlmICh0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVuZEZpbHRlclNlc3Npb24oKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oaWdobGlnaHRTZXNzaW9uU3RhcnRTdGF0ZSkge1xuXHRcdFx0dGhpcy5lbmRIaWdobGlnaHRTZXNzaW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZmluZChwYXR0ZXJuOiBzdHJpbmcsIHRvZ2dsZXM6IElBc3luY0ZpbmRUb2dnbGVzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBc3luY0ZpbmRSZXN1bHQ8RXhwbG9yZXJJdGVtPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb21pc2UgPSB0aGlzLmRvRmluZChwYXR0ZXJuLCB0b2dnbGVzLCB0b2tlbik7XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLkV4cGxvcmVyLFxuXHRcdFx0ZGVsYXk6IDc1MCxcblx0XHR9LCBfcHJvZ3Jlc3MgPT4gcHJvbWlzZSk7XG5cdH1cblxuXHRhc3luYyBkb0ZpbmQocGF0dGVybjogc3RyaW5nLCB0b2dnbGVzOiBJQXN5bmNGaW5kVG9nZ2xlcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQXN5bmNGaW5kUmVzdWx0PEV4cGxvcmVySXRlbT4gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodG9nZ2xlcy5maW5kTW9kZSA9PT0gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodCkge1xuXHRcdFx0aWYgKHRoaXMuZmlsdGVyU2Vzc2lvblN0YXJ0U3RhdGUpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5lbmRGaWx0ZXJTZXNzaW9uKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5oaWdobGlnaHRTZXNzaW9uU3RhcnRTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLnN0YXJ0SGlnaGxpZ2h0U2Vzc2lvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5kb0hpZ2hsaWdodEZpbmQocGF0dGVybiwgdG9nZ2xlcy5tYXRjaFR5cGUsIHRva2VuKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oaWdobGlnaHRTZXNzaW9uU3RhcnRTdGF0ZSkge1xuXHRcdFx0dGhpcy5lbmRIaWdobGlnaHRTZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlKSB7XG5cdFx0XHR0aGlzLnN0YXJ0RmlsdGVyU2Vzc2lvbigpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLmRvRmlsdGVyRmluZChwYXR0ZXJuLCB0b2dnbGVzLm1hdGNoVHlwZSwgdG9rZW4pO1xuXHR9XG5cblx0Ly8gRmlsdGVyXG5cblx0cHJpdmF0ZSBzdGFydEZpbHRlclNlc3Npb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMudHJlZVByb3ZpZGVyKCk7XG5cdFx0Y29uc3QgaW5wdXQgPSB0cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvb3RzID0gdGhpcy5leHBsb3JlclNlcnZpY2Uucm9vdHMuZmlsdGVyKHJvb3QgPT4gdGhpcy5zZWFyY2hTdXBwb3J0c1NjaGVtZShyb290LnJlc291cmNlLnNjaGVtZSkpO1xuXHRcdHRoaXMuZmlsdGVyU2Vzc2lvblN0YXJ0U3RhdGUgPSB7IHZpZXdTdGF0ZTogdHJlZS5nZXRWaWV3U3RhdGUoKSwgaW5wdXQsIHJvb3RzV2l0aFByb3ZpZGVyczogbmV3IFNldChyb290cykgfTtcblxuXHRcdHRoaXMuZXhwbG9yZXJGaW5kQWN0aXZlQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBkb0ZpbHRlckZpbmQocGF0dGVybjogc3RyaW5nLCBtYXRjaFR5cGU6IFRyZWVGaW5kTWF0Y2hUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBc3luY0ZpbmRSZXN1bHQ8RXhwbG9yZXJJdGVtPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5maWx0ZXJTZXNzaW9uU3RhcnRTdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdFeHBsb3JlckZpbmRQcm92aWRlcjogbm8gc2Vzc2lvbiBzdGF0ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvb3RzID0gQXJyYXkuZnJvbSh0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlLnJvb3RzV2l0aFByb3ZpZGVycyk7XG5cdFx0Y29uc3Qgc2VhcmNoUmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0U2VhcmNoUmVzdWx0cyhwYXR0ZXJuLCByb290cywgbWF0Y2hUeXBlLCB0b2tlbik7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5jbGVhclBoYW50b21FbGVtZW50cygpO1xuXHRcdGZvciAoY29uc3QgeyBleHBsb3JlclJvb3QsIGZpbGVzLCBkaXJlY3RvcmllcyB9IG9mIHNlYXJjaFJlc3VsdHMpIHtcblx0XHRcdHRoaXMuYWRkV29ya3NwYWNlRmlsdGVyUmVzdWx0cyhleHBsb3JlclJvb3QsIGZpbGVzLCBkaXJlY3Rvcmllcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMudHJlZVByb3ZpZGVyKCk7XG5cdFx0YXdhaXQgdHJlZS5zZXRJbnB1dCh0aGlzLmZpbHRlclNlc3Npb25TdGFydFN0YXRlLmlucHV0KTtcblxuXHRcdGNvbnN0IGhpdE1heFJlc3VsdHMgPSBzZWFyY2hSZXN1bHRzLnNvbWUoKHsgaGl0TWF4UmVzdWx0cyB9KSA9PiBoaXRNYXhSZXN1bHRzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNNYXRjaDogKGl0ZW06IEV4cGxvcmVySXRlbSkgPT4gaXRlbS5pc01hcmtlZEFzRmlsdGVyZWQoKSxcblx0XHRcdG1hdGNoQ291bnQ6IHNlYXJjaFJlc3VsdHMucmVkdWNlKChhY2MsIHsgZmlsZXMsIGRpcmVjdG9yaWVzIH0pID0+IGFjYyArIGZpbGVzLmxlbmd0aCArIGRpcmVjdG9yaWVzLmxlbmd0aCwgMCksXG5cdFx0XHR3YXJuaW5nTWVzc2FnZTogaGl0TWF4UmVzdWx0cyA/IGxvY2FsaXplKCdzZWFyY2hNYXhSZXN1bHRzV2FybmluZycsIFwiVGhlIHJlc3VsdCBzZXQgb25seSBjb250YWlucyBhIHN1YnNldCBvZiBhbGwgbWF0Y2hlcy4gQmUgbW9yZSBzcGVjaWZpYyBpbiB5b3VyIHNlYXJjaCB0byBuYXJyb3cgZG93biB0aGUgcmVzdWx0cy5cIikgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRXb3Jrc3BhY2VGaWx0ZXJSZXN1bHRzKHJvb3Q6IEV4cGxvcmVySXRlbSwgZmlsZXM6IFVSSVtdLCBkaXJlY3RvcmllczogVVJJW10pOiB2b2lkIHtcblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0Li4uZmlsZXMubWFwKGZpbGUgPT4gKHsgcmVzb3VyY2U6IGZpbGUsIGlzRGlyZWN0b3J5OiBmYWxzZSB9KSksXG5cdFx0XHQuLi5kaXJlY3Rvcmllcy5tYXAoZGlyZWN0b3J5ID0+ICh7IHJlc291cmNlOiBkaXJlY3RvcnksIGlzRGlyZWN0b3J5OiB0cnVlIH0pKVxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IHsgcmVzb3VyY2UsIGlzRGlyZWN0b3J5IH0gb2YgcmVzdWx0cykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHJvb3QuZmluZChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZWxlbWVudCAmJiBlbGVtZW50LnJvb3QgPT09IHJvb3QpIHtcblx0XHRcdFx0Ly8gRmlsZSBpcyBhbHJlYWR5IGluIHRoZSBtb2RlbFxuXHRcdFx0XHRlbGVtZW50Lm1hcmtJdGVtQW5kUGFyZW50c0FzRmlsdGVyZWQoKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbGUgaXMgbm90IGluIHRoZSBtb2RlbCwgY3JlYXRlIHBoYW50b20gaXRlbXMgZm9yIHRoZSBmaWxlIGFuZCBpdCdzIHBhcmVudHNcblx0XHRcdGNvbnN0IHBoYW50b21FbGVtZW50cyA9IHRoaXMuY3JlYXRlUGhhbnRvbUl0ZW1zKHJlc291cmNlLCByb290LCBpc0RpcmVjdG9yeSk7XG5cdFx0XHRpZiAocGhhbnRvbUVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BoYW50b20gaXRlbSB3YXMgbm90IGNyZWF0ZWQgZXZlbiB0aG91Z2ggaXQgaXMgbm90IGluIHRoZSBtb2RlbCcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTdG9yZSB0aGUgZmlyc3QgYW5jZXN0b3Igb2YgdGhlIGZpbGUgd2hpY2ggaXMgYWxyZWFkeSBwcmVzZW50IGluIHRoZSBtb2RlbFxuXHRcdFx0Y29uc3QgZmlyc3RQaGFudG9tUGFyZW50ID0gcGhhbnRvbUVsZW1lbnRzWzBdLnBhcmVudCE7XG5cdFx0XHRpZiAoIShmaXJzdFBoYW50b21QYXJlbnQgaW5zdGFuY2VvZiBQaGFudG9tRXhwbG9yZXJJdGVtKSkge1xuXHRcdFx0XHR0aGlzLnBoYW50b21QYXJlbnRzLmFkZChmaXJzdFBoYW50b21QYXJlbnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwaGFudG9tRmlsZUVsZW1lbnQgPSBwaGFudG9tRWxlbWVudHNbcGhhbnRvbUVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0cGhhbnRvbUZpbGVFbGVtZW50Lm1hcmtJdGVtQW5kUGFyZW50c0FzRmlsdGVyZWQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVBoYW50b21JdGVtcyhyZXNvdXJjZTogVVJJLCByb290OiBFeHBsb3Jlckl0ZW0sIHJlc291cmNlSXNEaXJlY3Rvcnk6IGJvb2xlYW4pOiBQaGFudG9tRXhwbG9yZXJJdGVtW10ge1xuXHRcdGNvbnN0IHJlbGF0aXZlUGF0aFRvUm9vdCA9IHJlbGF0aXZlUGF0aChyb290LnJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0aWYgKCFyZWxhdGl2ZVBhdGhUb1Jvb3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVzb3VyY2UgaXMgbm90IGEgY2hpbGQgb2YgdGhlIHJvb3QnKTtcblx0XHR9XG5cblx0XHRjb25zdCBwaGFudG9tRWxlbWVudHM6IFBoYW50b21FeHBsb3Jlckl0ZW1bXSA9IFtdO1xuXG5cdFx0bGV0IGN1cnJlbnRJdGVtID0gcm9vdDtcblx0XHRsZXQgY3VycmVudFJlc291cmNlID0gcm9vdC5yZXNvdXJjZTtcblx0XHRjb25zdCBwYXRoU2VnbWVudHMgPSByZWxhdGl2ZVBhdGhUb1Jvb3Quc3BsaXQoJy8nKTtcblx0XHRmb3IgKGNvbnN0IHN0YXQgb2YgcGF0aFNlZ21lbnRzKSB7XG5cdFx0XHRjdXJyZW50UmVzb3VyY2UgPSBjdXJyZW50UmVzb3VyY2Uud2l0aCh7IHBhdGg6IGAke2N1cnJlbnRSZXNvdXJjZS5wYXRofS8ke3N0YXR9YCB9KTtcblxuXHRcdFx0bGV0IGNoaWxkID0gY3VycmVudEl0ZW0uZ2V0Q2hpbGQoc3RhdCk7XG5cdFx0XHRpZiAoIWNoaWxkKSB7XG5cdFx0XHRcdGNvbnN0IGlzRGlyZWN0b3J5ID0gcGF0aFNlZ21lbnRzW3BhdGhTZWdtZW50cy5sZW5ndGggLSAxXSA9PT0gc3RhdCA/IHJlc291cmNlSXNEaXJlY3RvcnkgOiB0cnVlO1xuXHRcdFx0XHRjaGlsZCA9IG5ldyBQaGFudG9tRXhwbG9yZXJJdGVtKGN1cnJlbnRSZXNvdXJjZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5maWxlc0NvbmZpZ1NlcnZpY2UsIGN1cnJlbnRJdGVtLCBpc0RpcmVjdG9yeSk7XG5cdFx0XHRcdGN1cnJlbnRJdGVtLmFkZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0cGhhbnRvbUVsZW1lbnRzLnB1c2goY2hpbGQgYXMgUGhhbnRvbUV4cGxvcmVySXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdGN1cnJlbnRJdGVtID0gY2hpbGQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBoYW50b21FbGVtZW50cztcblx0fVxuXG5cdGFzeW5jIGVuZEZpbHRlclNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jbGVhclBoYW50b21FbGVtZW50cygpO1xuXG5cdFx0dGhpcy5leHBsb3JlckZpbmRBY3RpdmVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cblx0XHQvLyBSZXN0b3JlIHZpZXcgc3RhdGVcblx0XHRpZiAoIXRoaXMuZmlsdGVyU2Vzc2lvblN0YXJ0U3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRXhwbG9yZXJGaW5kUHJvdmlkZXI6IG5vIHNlc3Npb24gc3RhdGUgdG8gcmVzdG9yZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWVQcm92aWRlcigpO1xuXHRcdGF3YWl0IHRyZWUuc2V0SW5wdXQodGhpcy5maWx0ZXJTZXNzaW9uU3RhcnRTdGF0ZS5pbnB1dCwgdGhpcy5maWx0ZXJTZXNzaW9uU3RhcnRTdGF0ZS52aWV3U3RhdGUpO1xuXG5cdFx0dGhpcy5maWx0ZXJTZXNzaW9uU3RhcnRTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmV4cGxvcmVyU2VydmljZS5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyUGhhbnRvbUVsZW1lbnRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGhhbnRvbVBhcmVudCBvZiB0aGlzLnBoYW50b21QYXJlbnRzKSB7XG5cdFx0XHQvLyBDbGVhciBwaGFudG9tIG5vZGVzIGZyb20gbW9kZWxcblx0XHRcdHBoYW50b21QYXJlbnQuZm9yZ2V0Q2hpbGRyZW4oKTtcblx0XHR9XG5cdFx0dGhpcy5waGFudG9tUGFyZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnJvb3RzLmZvckVhY2gocm9vdCA9PiByb290LnVubWFya0l0ZW1BbmRDaGlsZHJlbigpKTtcblx0fVxuXG5cdC8vIEhpZ2hsaWdodFxuXG5cdHByaXZhdGUgc3RhcnRIaWdobGlnaHRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvb3RzID0gdGhpcy5leHBsb3JlclNlcnZpY2Uucm9vdHMuZmlsdGVyKHJvb3QgPT4gdGhpcy5zZWFyY2hTdXBwb3J0c1NjaGVtZShyb290LnJlc291cmNlLnNjaGVtZSkpO1xuXHRcdHRoaXMuaGlnaGxpZ2h0U2Vzc2lvblN0YXJ0U3RhdGUgPSB7IHJvb3RzV2l0aFByb3ZpZGVyczogbmV3IFNldChyb290cykgfTtcblx0fVxuXG5cdGFzeW5jIGRvSGlnaGxpZ2h0RmluZChwYXR0ZXJuOiBzdHJpbmcsIG1hdGNoVHlwZTogVHJlZUZpbmRNYXRjaFR5cGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUFzeW5jRmluZFJlc3VsdDxFeHBsb3Jlckl0ZW0+IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLmhpZ2hsaWdodFNlc3Npb25TdGFydFN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGxvcmVyRmluZFByb3ZpZGVyOiBubyBoaWdobGlnaHQgc2Vzc2lvbiBzdGF0ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvb3RzID0gQXJyYXkuZnJvbSh0aGlzLmhpZ2hsaWdodFNlc3Npb25TdGFydFN0YXRlLnJvb3RzV2l0aFByb3ZpZGVycyk7XG5cdFx0Y29uc3Qgc2VhcmNoUmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0U2VhcmNoUmVzdWx0cyhwYXR0ZXJuLCByb290cywgbWF0Y2hUeXBlLCB0b2tlbik7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5jbGVhckhpZ2hsaWdodHMoKTtcblx0XHRmb3IgKGNvbnN0IHsgZXhwbG9yZXJSb290LCBmaWxlcywgZGlyZWN0b3JpZXMgfSBvZiBzZWFyY2hSZXN1bHRzKSB7XG5cdFx0XHR0aGlzLmFkZFdvcmtzcGFjZUhpZ2hsaWdodFJlc3VsdHMoZXhwbG9yZXJSb290LCBmaWxlcy5jb25jYXQoZGlyZWN0b3JpZXMpKTtcblx0XHR9XG5cblx0XHRjb25zdCBoaXRNYXhSZXN1bHRzID0gc2VhcmNoUmVzdWx0cy5zb21lKCh7IGhpdE1heFJlc3VsdHMgfSkgPT4gaGl0TWF4UmVzdWx0cyk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzTWF0Y2g6IChpdGVtOiBFeHBsb3Jlckl0ZW0pID0+IHRoaXMuZmluZEhpZ2hsaWdodFRyZWUuaXNNYXRjaChpdGVtKSB8fCAodGhpcy5maW5kSGlnaGxpZ2h0VHJlZS5nZXQoaXRlbSkgPiAwICYmIHRoaXMudHJlZVByb3ZpZGVyKCkuaXNDb2xsYXBzZWQoaXRlbSkpLFxuXHRcdFx0bWF0Y2hDb3VudDogc2VhcmNoUmVzdWx0cy5yZWR1Y2UoKGFjYywgeyBmaWxlcywgZGlyZWN0b3JpZXMgfSkgPT4gYWNjICsgZmlsZXMubGVuZ3RoICsgZGlyZWN0b3JpZXMubGVuZ3RoLCAwKSxcblx0XHRcdHdhcm5pbmdNZXNzYWdlOiBoaXRNYXhSZXN1bHRzID8gbG9jYWxpemUoJ3NlYXJjaE1heFJlc3VsdHNXYXJuaW5nJywgXCJUaGUgcmVzdWx0IHNldCBvbmx5IGNvbnRhaW5zIGEgc3Vic2V0IG9mIGFsbCBtYXRjaGVzLiBCZSBtb3JlIHNwZWNpZmljIGluIHlvdXIgc2VhcmNoIHRvIG5hcnJvdyBkb3duIHRoZSByZXN1bHRzLlwiKSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFkZFdvcmtzcGFjZUhpZ2hsaWdodFJlc3VsdHMocm9vdDogRXhwbG9yZXJJdGVtLCByZXNvdXJjZXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ZWREaXJlY3RvcmllcyA9IG5ldyBTZXQ8RXhwbG9yZXJJdGVtPigpO1xuXHRcdGNvbnN0IHN0b3JlRGlyZWN0b3JpZXMgPSAoaXRlbTogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHR3aGlsZSAoaXRlbSkge1xuXHRcdFx0XHRoaWdobGlnaHRlZERpcmVjdG9yaWVzLmFkZChpdGVtKTtcblx0XHRcdFx0aXRlbSA9IGl0ZW0ucGFyZW50O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHJvb3QuZmluZChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZWxlbWVudCAmJiBlbGVtZW50LnJvb3QgPT09IHJvb3QpIHtcblx0XHRcdFx0Ly8gRmlsZSBpcyBhbHJlYWR5IGluIHRoZSBtb2RlbFxuXHRcdFx0XHR0aGlzLmZpbmRIaWdobGlnaHRUcmVlLmFkZChyZXNvdXJjZSwgcm9vdCk7XG5cdFx0XHRcdHN0b3JlRGlyZWN0b3JpZXMoZWxlbWVudC5wYXJlbnQpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RQYXJlbnQgPSBmaW5kRmlyc3RQYXJlbnQocmVzb3VyY2UsIHJvb3QpO1xuXHRcdFx0aWYgKGZpcnN0UGFyZW50KSB7XG5cdFx0XHRcdHRoaXMuZmluZEhpZ2hsaWdodFRyZWUuYWRkKHJlc291cmNlLCByb290KTtcblx0XHRcdFx0c3RvcmVEaXJlY3RvcmllcyhmaXJzdFBhcmVudC5wYXJlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWVQcm92aWRlcigpO1xuXHRcdGZvciAoY29uc3QgZGlyZWN0b3J5IG9mIGhpZ2hsaWdodGVkRGlyZWN0b3JpZXMpIHtcblx0XHRcdGlmICh0cmVlLmhhc05vZGUoZGlyZWN0b3J5KSkge1xuXHRcdFx0XHR0cmVlLnJlcmVuZGVyKGRpcmVjdG9yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbmRIaWdobGlnaHRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuaGlnaGxpZ2h0U2Vzc2lvblN0YXJ0U3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jbGVhckhpZ2hsaWdodHMoKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJIaWdobGlnaHRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWVQcm92aWRlcigpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLmZpbmRIaWdobGlnaHRUcmVlLmhpZ2hsaWdodGVkSXRlbXMpIHtcblx0XHRcdGlmICh0cmVlLmhhc05vZGUoaXRlbSkpIHtcblx0XHRcdFx0dHJlZS5yZXJlbmRlcihpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5maW5kSGlnaGxpZ2h0VHJlZS5jbGVhcigpO1xuXHR9XG5cblx0Ly8gU2VhcmNoXG5cblx0cHJpdmF0ZSBzZWFyY2hTdXBwb3J0c1NjaGVtZShzY2hlbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdC8vIExpbWl0ZWQgYnkgdGhlIHNlYXJjaCBBUElcblx0XHRpZiAoc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgJiYgc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZVJlbW90ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hTZXJ2aWNlLnNjaGVtZUhhc0ZpbGVTZWFyY2hQcm92aWRlcihzY2hlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRTZWFyY2hSZXN1bHRzKHBhdHRlcm46IHN0cmluZywgcm9vdHM6IEV4cGxvcmVySXRlbVtdLCBtYXRjaFR5cGU6IFRyZWVGaW5kTWF0Y2hUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgZXhwbG9yZXJSb290OiBFeHBsb3Jlckl0ZW07IGZpbGVzOiBVUklbXTsgZGlyZWN0b3JpZXM6IFVSSVtdOyBoaXRNYXhSZXN1bHRzOiBib29sZWFuIH1bXT4ge1xuXHRcdGNvbnN0IHBhdHRlcm5Mb3dlcmNhc2UgPSBwYXR0ZXJuLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgaXNGdXp6eU1hdGNoID0gbWF0Y2hUeXBlID09PSBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eTtcblx0XHRyZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwocm9vdHMubWFwKChyb290LCBpbmRleCkgPT4gdGhpcy5zZWFyY2hJbldvcmtzcGFjZShwYXR0ZXJuTG93ZXJjYXNlLCByb290LCBpbmRleCwgaXNGdXp6eU1hdGNoLCB0b2tlbikpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VhcmNoSW5Xb3Jrc3BhY2UocGF0dGVybkxvd2VyY2FzZTogc3RyaW5nLCByb290OiBFeHBsb3Jlckl0ZW0sIHJvb3RJbmRleDogbnVtYmVyLCBpc0Z1enp5TWF0Y2g6IGJvb2xlYW4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBleHBsb3JlclJvb3Q6IEV4cGxvcmVySXRlbTsgZmlsZXM6IFVSSVtdOyBkaXJlY3RvcmllczogVVJJW107IGhpdE1heFJlc3VsdHM6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IHNlZ21lbnRNYXRjaFBhdHRlcm4gPSBpc0Z1enp5TWF0Y2ggPyBmdXp6eU1hdGNoaW5nR2xvYlBhdHRlcm4ocGF0dGVybkxvd2VyY2FzZSkgOiBjb250aW5vdXNNYXRjaGluZ0dsb2JQYXR0ZXJuKHBhdHRlcm5Mb3dlcmNhc2UpO1xuXG5cdFx0Y29uc3Qgc2VhcmNoRXhjbHVkZVBhdHRlcm4gPSBnZXRFeGNsdWRlcyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiByb290LnJlc291cmNlIH0pKSB8fCB7fTtcblx0XHRjb25zdCBzZWFyY2hPcHRpb25zOiBJRmlsZVF1ZXJ5ID0ge1xuXHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0Zm9sZGVyOiByb290LnJlc291cmNlLFxuXHRcdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4cGxvcmVyLmV4Y2x1ZGVHaXRJZ25vcmUnKSxcblx0XHRcdH1dLFxuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRzaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybjogdHJ1ZSxcblx0XHRcdGNhY2hlS2V5OiBgZXhwbG9yZXJmaW5kcHJvdmlkZXI6JHtyb290Lm5hbWV9OiR7cm9vdEluZGV4fToke3RoaXMuc2Vzc2lvbklkfWAsXG5cdFx0XHRleGNsdWRlUGF0dGVybjogc2VhcmNoRXhjbHVkZVBhdHRlcm4sXG5cdFx0XHRpZ25vcmVHbG9iQ2FzZTogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0bGV0IGZpbGVSZXN1bHRzOiBJU2VhcmNoQ29tcGxldGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZvbGRlclJlc3VsdHM6IElTZWFyY2hDb21wbGV0ZSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0W2ZpbGVSZXN1bHRzLCBmb2xkZXJSZXN1bHRzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5zZWFyY2hTZXJ2aWNlLmZpbGVTZWFyY2goeyAuLi5zZWFyY2hPcHRpb25zLCBmaWxlUGF0dGVybjogYCoqLyR7c2VnbWVudE1hdGNoUGF0dGVybn1gLCBtYXhSZXN1bHRzOiA1MTIgfSwgdG9rZW4pLFxuXHRcdFx0XHR0aGlzLnNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaCh7IC4uLnNlYXJjaE9wdGlvbnMsIGZpbGVQYXR0ZXJuOiBgKiovJHtzZWdtZW50TWF0Y2hQYXR0ZXJufS8qKmAgfSwgdG9rZW4pXG5cdFx0XHRdKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWZpbGVSZXN1bHRzIHx8ICFmb2xkZXJSZXN1bHRzIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4geyBleHBsb3JlclJvb3Q6IHJvb3QsIGZpbGVzOiBbXSwgZGlyZWN0b3JpZXM6IFtdLCBoaXRNYXhSZXN1bHRzOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVSZXN1bHRSZXNvdXJjZXMgPSBmaWxlUmVzdWx0cy5yZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LnJlc291cmNlKTtcblx0XHRjb25zdCBkaXJlY3RvcnlSZXNvdXJjZXMgPSBnZXRNYXRjaGluZ0RpcmVjdG9yaWVzRnJvbUZpbGVzKGZvbGRlclJlc3VsdHMucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZXNvdXJjZSksIHJvb3QsIHNlZ21lbnRNYXRjaFBhdHRlcm4pO1xuXG5cdFx0Y29uc3QgZmlsdGVyZWRGaWxlUmVzb3VyY2VzID0gZmlsZVJlc3VsdFJlc291cmNlcy5maWx0ZXIocmVzb3VyY2UgPT4gIXRoaXMuZmlsZXNGaWx0ZXIuaXNJZ25vcmVkKHJlc291cmNlLCByb290LnJlc291cmNlLCBmYWxzZSkpO1xuXHRcdGNvbnN0IGZpbHRlcmVkRGlyZWN0b3J5UmVzb3VyY2VzID0gZGlyZWN0b3J5UmVzb3VyY2VzLmZpbHRlcihyZXNvdXJjZSA9PiAhdGhpcy5maWxlc0ZpbHRlci5pc0lnbm9yZWQocmVzb3VyY2UsIHJvb3QucmVzb3VyY2UsIHRydWUpKTtcblxuXHRcdHJldHVybiB7IGV4cGxvcmVyUm9vdDogcm9vdCwgZmlsZXM6IGZpbHRlcmVkRmlsZVJlc291cmNlcywgZGlyZWN0b3JpZXM6IGZpbHRlcmVkRGlyZWN0b3J5UmVzb3VyY2VzLCBoaXRNYXhSZXN1bHRzOiAhIWZpbGVSZXN1bHRzLmxpbWl0SGl0IHx8ICEhZm9sZGVyUmVzdWx0cy5saW1pdEhpdCB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE1hdGNoaW5nRGlyZWN0b3JpZXNGcm9tRmlsZXMocmVzb3VyY2VzOiBVUklbXSwgcm9vdDogRXhwbG9yZXJJdGVtLCBzZWdtZW50TWF0Y2hQYXR0ZXJuOiBzdHJpbmcpOiBVUklbXSB7XG5cdGNvbnN0IHVuaXF1ZURpcmVjdG9yaWVzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0Y29uc3QgcmVsYXRpdmVQYXRoVG9Sb290ID0gcmVsYXRpdmVQYXRoKHJvb3QucmVzb3VyY2UsIHJlc291cmNlKTtcblx0XHRpZiAoIXJlbGF0aXZlUGF0aFRvUm9vdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXNvdXJjZSBpcyBub3QgYSBjaGlsZCBvZiB0aGUgcm9vdCcpO1xuXHRcdH1cblxuXHRcdGxldCBkaXJSZXNvdXJjZSA9IHJvb3QucmVzb3VyY2U7XG5cdFx0Y29uc3Qgc3RhdHMgPSByZWxhdGl2ZVBhdGhUb1Jvb3Quc3BsaXQoJy8nKS5zbGljZSgwLCAtMSk7XG5cdFx0Zm9yIChjb25zdCBzdGF0IG9mIHN0YXRzKSB7XG5cdFx0XHRkaXJSZXNvdXJjZSA9IGRpclJlc291cmNlLndpdGgoeyBwYXRoOiBgJHtkaXJSZXNvdXJjZS5wYXRofS8ke3N0YXR9YCB9KTtcblx0XHRcdHVuaXF1ZURpcmVjdG9yaWVzLmFkZChkaXJSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgbWF0Y2hpbmdEaXJlY3RvcmllczogVVJJW10gPSBbXTtcblx0Zm9yIChjb25zdCBkaXJSZXNvdXJjZSBvZiB1bmlxdWVEaXJlY3Rvcmllcykge1xuXHRcdGNvbnN0IHN0YXRzID0gZGlyUmVzb3VyY2UucGF0aC5zcGxpdCgnLycpO1xuXHRcdGNvbnN0IGRpclN0YXQgPSBzdGF0c1tzdGF0cy5sZW5ndGggLSAxXTtcblx0XHRpZiAoIWRpclN0YXQgfHwgIWdsb2IubWF0Y2goc2VnbWVudE1hdGNoUGF0dGVybiwgZGlyU3RhdCwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRtYXRjaGluZ0RpcmVjdG9yaWVzLnB1c2goZGlyUmVzb3VyY2UpO1xuXHR9XG5cblx0cmV0dXJuIG1hdGNoaW5nRGlyZWN0b3JpZXM7XG59XG5cbmZ1bmN0aW9uIGZpbmRGaXJzdFBhcmVudChyZXNvdXJjZTogVVJJLCByb290OiBFeHBsb3Jlckl0ZW0pOiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQge1xuXHRjb25zdCByZWxhdGl2ZVBhdGhUb1Jvb3QgPSByZWxhdGl2ZVBhdGgocm9vdC5yZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHRpZiAoIXJlbGF0aXZlUGF0aFRvUm9vdCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignUmVzb3VyY2UgaXMgbm90IGEgY2hpbGQgb2YgdGhlIHJvb3QnKTtcblx0fVxuXG5cdGxldCBjdXJyZW50SXRlbSA9IHJvb3Q7XG5cdGxldCBjdXJyZW50UmVzb3VyY2UgPSByb290LnJlc291cmNlO1xuXHRjb25zdCBwYXRoU2VnbWVudHMgPSByZWxhdGl2ZVBhdGhUb1Jvb3Quc3BsaXQoJy8nKTtcblx0Zm9yIChjb25zdCBzdGF0IG9mIHBhdGhTZWdtZW50cykge1xuXHRcdGN1cnJlbnRSZXNvdXJjZSA9IGN1cnJlbnRSZXNvdXJjZS53aXRoKHsgcGF0aDogYCR7Y3VycmVudFJlc291cmNlLnBhdGh9LyR7c3RhdH1gIH0pO1xuXHRcdGNvbnN0IGNoaWxkID0gY3VycmVudEl0ZW0uZ2V0Q2hpbGQoc3RhdCk7XG5cdFx0aWYgKCFjaGlsZCkge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRJdGVtO1xuXHRcdH1cblxuXHRcdGN1cnJlbnRJdGVtID0gY2hpbGQ7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBmdXp6eU1hdGNoaW5nR2xvYlBhdHRlcm4ocGF0dGVybjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFwYXR0ZXJuKSB7XG5cdFx0cmV0dXJuICcqJztcblx0fVxuXHRyZXR1cm4gJyonICsgcGF0dGVybi5zcGxpdCgnJykuam9pbignKicpICsgJyonO1xufVxuXG5mdW5jdGlvbiBjb250aW5vdXNNYXRjaGluZ0dsb2JQYXR0ZXJuKHBhdHRlcm46IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghcGF0dGVybikge1xuXHRcdHJldHVybiAnKic7XG5cdH1cblx0cmV0dXJuICcqJyArIHBhdHRlcm4gKyAnKic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlciB7XG5cdHJlYWRvbmx5IGN1cnJlbnQ6IEV4cGxvcmVySXRlbTtcblx0cmVhZG9ubHkgY3VycmVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGl0ZW1zOiBFeHBsb3Jlckl0ZW1bXTtcblx0cmVhZG9ubHkgbGFiZWxzOiBIVE1MRWxlbWVudFtdO1xuXHRyZWFkb25seSBpbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cdHByZXZpb3VzKCk6IHZvaWQ7XG5cdG5leHQoKTogdm9pZDtcblx0Zmlyc3QoKTogdm9pZDtcblx0bGFzdCgpOiB2b2lkO1xuXHRzZXRJbmRleChpbmRleDogbnVtYmVyKTogdm9pZDtcblx0dXBkYXRlQ29sbGFwc2VkKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyLCBJRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIElEID0gMDtcblxuXHRwcml2YXRlIF9pbmRleDogbnVtYmVyO1xuXHRwcml2YXRlIF9sYWJlbHMhOiBIVE1MRWxlbWVudFtdO1xuXHRwcml2YXRlIF91cGRhdGVMYWJlbERpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXG5cdGdldCBpbmRleCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5faW5kZXg7IH1cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aDsgfVxuXHRnZXQgY3VycmVudCgpOiBFeHBsb3Jlckl0ZW0geyByZXR1cm4gdGhpcy5pdGVtc1t0aGlzLl9pbmRleF07IH1cblx0Z2V0IGN1cnJlbnRJZCgpOiBzdHJpbmcgeyByZXR1cm4gYCR7dGhpcy5pZH1fJHt0aGlzLmluZGV4fWA7IH1cblx0Z2V0IGxhYmVscygpOiBIVE1MRWxlbWVudFtdIHsgcmV0dXJuIHRoaXMuX2xhYmVsczsgfVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGlkOiBzdHJpbmcsIHJlYWRvbmx5IGl0ZW1zOiBFeHBsb3Jlckl0ZW1bXSwgdGVtcGxhdGVEYXRhOiBJRmlsZVRlbXBsYXRlRGF0YSwgcHJpdmF0ZSBkZXB0aDogbnVtYmVyLCBwcml2YXRlIGNvbGxhcHNlZDogYm9vbGVhbikge1xuXHRcdHRoaXMuX2luZGV4ID0gaXRlbXMubGVuZ3RoIC0gMTtcblxuXHRcdHRoaXMudXBkYXRlTGFiZWxzKHRlbXBsYXRlRGF0YSk7XG5cdFx0dGhpcy5fdXBkYXRlTGFiZWxEaXNwb3NhYmxlID0gdGVtcGxhdGVEYXRhLmxhYmVsLm9uRGlkUmVuZGVyKCgpID0+IHRoaXMudXBkYXRlTGFiZWxzKHRlbXBsYXRlRGF0YSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVMYWJlbHModGVtcGxhdGVEYXRhOiBJRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdHRoaXMuX2xhYmVscyA9IEFycmF5LmZyb20odGVtcGxhdGVEYXRhLmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubGFiZWwtbmFtZScpKTtcblx0XHRsZXQgcGFyZW50cyA9ICcnO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5sYWJlbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGFyaWFMYWJlbCA9IHBhcmVudHMubGVuZ3RoID8gYCR7dGhpcy5pdGVtc1tpXS5uYW1lfSwgY29tcGFjdCwgJHtwYXJlbnRzfWAgOiB0aGlzLml0ZW1zW2ldLm5hbWU7XG5cdFx0XHR0aGlzLmxhYmVsc1tpXS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdFx0dGhpcy5sYWJlbHNbaV0uc2V0QXR0cmlidXRlKCdhcmlhLWxldmVsJywgYCR7dGhpcy5kZXB0aCArIGl9YCk7XG5cdFx0XHRwYXJlbnRzID0gcGFyZW50cy5sZW5ndGggPyBgJHt0aGlzLml0ZW1zW2ldLm5hbWV9ICR7cGFyZW50c31gIDogdGhpcy5pdGVtc1tpXS5uYW1lO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZCh0aGlzLmNvbGxhcHNlZCk7XG5cblx0XHRpZiAodGhpcy5faW5kZXggPCB0aGlzLmxhYmVscy5sZW5ndGgpIHtcblx0XHRcdHRoaXMubGFiZWxzW3RoaXMuX2luZGV4XS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcblx0XHR9XG5cdH1cblxuXHRwcmV2aW91cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5kZXggPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5faW5kZXggLSAxKTtcblx0fVxuXG5cdG5leHQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luZGV4ID49IHRoaXMuaXRlbXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgodGhpcy5faW5kZXggKyAxKTtcblx0fVxuXG5cdGZpcnN0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbmRleCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0SW5kZXgoMCk7XG5cdH1cblxuXHRsYXN0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbmRleCA9PT0gdGhpcy5pdGVtcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXRJbmRleCh0aGlzLml0ZW1zLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0c2V0SW5kZXgoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5pdGVtcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxhYmVsc1t0aGlzLl9pbmRleF0uY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG5cdFx0dGhpcy5faW5kZXggPSBpbmRleDtcblx0XHR0aGlzLmxhYmVsc1t0aGlzLl9pbmRleF0uY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHR1cGRhdGVDb2xsYXBzZWQoY29sbGFwc2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5jb2xsYXBzZWQgPSBjb2xsYXBzZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxhYmVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5sYWJlbHNbaV0uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgY29sbGFwc2VkID8gJ2ZhbHNlJyA6ICd0cnVlJyk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdXBkYXRlTGFiZWxEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaWxlVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgbGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjb250cmliczogSUV4cGxvcmVyRmlsZUNvbnRyaWJ1dGlvbltdO1xuXHRjdXJyZW50Q29udGV4dD86IEV4cGxvcmVySXRlbTtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVzUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPEV4cGxvcmVySXRlbSwgRnV6enlTY29yZSwgSUZpbGVUZW1wbGF0ZURhdGE+LCBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxFeHBsb3Jlckl0ZW0+LCBJRGlzcG9zYWJsZSB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdmaWxlJztcblxuXHRwcml2YXRlIGNvbmZpZzogSUZpbGVzQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSBjb25maWdMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycyA9IG5ldyBNYXA8RXhwbG9yZXJJdGVtLCBDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJbXT4oKTtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQgPSBuZXcgRXZlbnRNdWx0aXBsZXhlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSBoaWdobGlnaHRUcmVlOiBJRXhwbG9yZXJGaW5kSGlnaGxpZ2h0VHJlZSxcblx0XHRwcml2YXRlIHVwZGF0ZVdpZHRoOiAoc3RhdDogRXhwbG9yZXJJdGVtKSA9PiB2b2lkLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0Y29uc3QgdXBkYXRlT2Zmc2V0U3R5bGVzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCd3b3JrYmVuY2gudHJlZS5pbmRlbnQnKTtcblx0XHRcdGNvbnN0IG9mZnNldCA9IE1hdGgubWF4KDIyIC0gaW5kZW50LCAwKTsgLy8gZGVyaXZlZCB2aWEgaW5zcGVjdGlvblxuXHRcdFx0Y29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KGAtLXZzY29kZS1leHBsb3Jlci1hbGlnbi1vZmZzZXQtbWFyZ2luLWxlZnRgLCBgJHtvZmZzZXR9cHhgKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5jb25maWdMaXN0ZW5lciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyJykpIHtcblx0XHRcdFx0dGhpcy5jb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignd29ya2JlbmNoLnRyZWUuaW5kZW50JykpIHtcblx0XHRcdFx0dXBkYXRlT2Zmc2V0U3R5bGVzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR1cGRhdGVPZmZzZXRTdHlsZXMoKTtcblx0fVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgndHJlZUFyaWFMYWJlbCcsIFwiRmlsZXMgRXhwbG9yZXJcIik7XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBGaWxlc1JlbmRlcmVyLklEO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElGaWxlVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSB9KSk7XG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobGFiZWwub25EaWRSZW5kZXIoKCkgPT4ge1xuXHRcdFx0Ly8gc2NoZWR1bGUgdGhpcyBvbiB0aGUgbmV4dCBhbmltYXRpb24gZnJhbWUgdG8gYXZvaWQgcmVuZGVyaW5nIHJlZW50cnlcblx0XHRcdERPTS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKERPTS5nZXRXaW5kb3codGVtcGxhdGVEYXRhLmNvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnRDb250ZXh0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVdpZHRoKHRlbXBsYXRlRGF0YS5jdXJyZW50Q29udGV4dCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gbm9vcCBzaW5jZSB0aGUgZWxlbWVudCBtaWdodCBubyBsb25nZXIgYmUgaW4gdGhlIHRyZWUsIG5vIHVwZGF0ZSBvZiB3aWR0aCBuZWNlc3Nhcnlcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29udHJpYnMgPSBleHBsb3JlckZpbGVDb250cmliUmVnaXN0cnkuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRhaW5lciwgdGVtcGxhdGVEaXNwb3NhYmxlcyk7XG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZXhwbG9yZXJGaWxlQ29udHJpYlJlZ2lzdHJ5Lm9uRGlkUmVnaXN0ZXJEZXNjcmlwdG9yKGQgPT4ge1xuXHRcdFx0Y29uc3QgY29udHIgPSBkLmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXIpO1xuXHRcdFx0Y29udHJpYnMucHVzaCh0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChjb250cikpO1xuXHRcdFx0Y29udHIuc2V0UmVzb3VyY2UodGVtcGxhdGVEYXRhLmN1cnJlbnRDb250ZXh0Py5yZXNvdXJjZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhOiBJRmlsZVRlbXBsYXRlRGF0YSA9IHsgdGVtcGxhdGVEaXNwb3NhYmxlcywgZWxlbWVudERpc3Bvc2FibGVzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLCBsYWJlbCwgY29udGFpbmVyLCBjb250cmlicyB9O1xuXHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdCA9IG5vZGUuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudENvbnRleHQgPSBzdGF0O1xuXG5cdFx0Y29uc3QgZWRpdGFibGVEYXRhID0gdGhpcy5leHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKHN0YXQpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY29tcHJlc3NlZCcpO1xuXG5cdFx0Ly8gRmlsZSBMYWJlbFxuXHRcdGlmICghZWRpdGFibGVEYXRhKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0dGhpcy5yZW5kZXJTdGF0KHN0YXQsIHN0YXQubmFtZSwgdW5kZWZpbmVkLCBub2RlLmZpbHRlckRhdGEsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5wdXQgQm94XG5cdFx0ZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRyaWJzLmZvckVhY2goYyA9PiBjLnNldFJlc291cmNlKHVuZGVmaW5lZCkpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5yZW5kZXJJbnB1dEJveCh0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCBzdGF0LCBlZGl0YWJsZURhdGEpKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RXhwbG9yZXJJdGVtPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ID0gbm9kZS5lbGVtZW50LmVsZW1lbnRzW25vZGUuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxXTtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudENvbnRleHQgPSBzdGF0O1xuXG5cdFx0Y29uc3QgZWRpdGFibGUgPSBub2RlLmVsZW1lbnQuZWxlbWVudHMuZmlsdGVyKGUgPT4gdGhpcy5leHBsb3JlclNlcnZpY2UuaXNFZGl0YWJsZShlKSk7XG5cdFx0Y29uc3QgZWRpdGFibGVEYXRhID0gZWRpdGFibGUubGVuZ3RoID09PSAwID8gdW5kZWZpbmVkIDogdGhpcy5leHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKGVkaXRhYmxlWzBdKTtcblxuXHRcdC8vIEZpbGUgTGFiZWxcblx0XHRpZiAoIWVkaXRhYmxlRGF0YSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29tcHJlc3NlZCcpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdFx0Y29uc3QgaWQgPSBgY29tcHJlc3NlZC1leHBsb3Jlcl8ke0NvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlci5JRCsrfWA7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBub2RlLmVsZW1lbnQuZWxlbWVudHMubWFwKGUgPT4gZS5uYW1lKTtcblxuXHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSBmdXp6eSBzY29yZSwgd2UgbmVlZCB0byBhZGp1c3QgdGhlIG9mZnNldCBvZiB0aGUgc2NvcmVcblx0XHRcdC8vIHRvIGFsaWduIHdpdGggdGhlIGxhc3Qgc3RhdCBvZiB0aGUgY29tcHJlc3NlZCBsYWJlbFxuXHRcdFx0bGV0IGZ1enp5U2NvcmUgPSBub2RlLmZpbHRlckRhdGE7XG5cdFx0XHRpZiAoZnV6enlTY29yZSAmJiBmdXp6eVNjb3JlLmxlbmd0aCA+IDIpIHtcblx0XHRcdFx0Y29uc3QgZmlsdGVyRGF0YU9mZnNldCA9IGxhYmVscy5qb2luKCcvJykubGVuZ3RoIC0gbGFiZWxzW2xhYmVscy5sZW5ndGggLSAxXS5sZW5ndGg7XG5cdFx0XHRcdGZ1enp5U2NvcmUgPSBbZnV6enlTY29yZVswXSwgZnV6enlTY29yZVsxXSArIGZpbHRlckRhdGFPZmZzZXQsIC4uLmZ1enp5U2NvcmUuc2xpY2UoMildO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlclN0YXQoc3RhdCwgbGFiZWxzLCBpZCwgZnV6enlTY29yZSwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdFx0Y29uc3QgY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyID0gbmV3IENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihpZCwgbm9kZS5lbGVtZW50LmVsZW1lbnRzLCB0ZW1wbGF0ZURhdGEsIG5vZGUuZGVwdGgsIG5vZGUuY29sbGFwc2VkKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcik7XG5cblx0XHRcdGNvbnN0IG5vZGVDb250cm9sbGVycyA9IHRoaXMuY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycy5nZXQoc3RhdCkgPz8gW107XG5cdFx0XHR0aGlzLmNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcnMuc2V0KHN0YXQsIFsuLi5ub2RlQ29udHJvbGxlcnMsIGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcl0pO1xuXG5cdFx0XHQvLyBhY2Nlc3NpYmlsaXR5XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZURlc2NlbmRhbnQuYWRkKGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlci5vbkRpZENoYW5nZSkpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5jb250YWluZXIsICdtb3VzZWRvd24nLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0SWNvbkxhYmVsTmFtZUZyb21IVE1MRWxlbWVudChlLnRhcmdldCk7XG5cblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlci5zZXRJbmRleChyZXN1bHQuaW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5vZGVDb250cm9sbGVycyA9IHRoaXMuY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycy5nZXQoc3RhdCkgPz8gW107XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkSW5kZXggPSBub2RlQ29udHJvbGxlcnMuZmluZEluZGV4KGNvbnRyb2xsZXIgPT4gY29udHJvbGxlciA9PT0gY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKTtcblxuXHRcdFx0XHRpZiAocmVuZGVyZWRJbmRleCA8IDApIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Rpc3Bvc2luZyB1bmtub3duIG5hdmlnYXRpb24gY29udHJvbGxlcicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5vZGVDb250cm9sbGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHR0aGlzLmNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcnMuZGVsZXRlKHN0YXQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5vZGVDb250cm9sbGVycy5zcGxpY2UocmVuZGVyZWRJbmRleCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBJbnB1dCBCb3hcblx0XHRlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NvbXByZXNzZWQnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udHJpYnMuZm9yRWFjaChjID0+IGMuc2V0UmVzb3VyY2UodW5kZWZpbmVkKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnJlbmRlcklucHV0Qm94KHRlbXBsYXRlRGF0YS5jb250YWluZXIsIGVkaXRhYmxlWzBdLCBlZGl0YWJsZURhdGEpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN0YXQoc3RhdDogRXhwbG9yZXJJdGVtLCBsYWJlbDogc3RyaW5nIHwgc3RyaW5nW10sIGRvbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGZpbHRlckRhdGE6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQsIHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdGNvbnN0IGV4dHJhQ2xhc3NlcyA9IFsnZXhwbG9yZXItaXRlbSddO1xuXHRcdGlmICh0aGlzLmV4cGxvcmVyU2VydmljZS5pc0N1dChzdGF0KSkge1xuXHRcdFx0ZXh0cmFDbGFzc2VzLnB1c2goJ2N1dCcpO1xuXHRcdH1cblxuXHRcdC8vIE9mZnNldCBuZXN0ZWQgY2hpbGRyZW4gdW5sZXNzIGZvbGRlcnMgaGF2ZSBib3RoIGNoZXZyb25zIGFuZCBpY29ucywgb3RoZXJ3aXNlIGFsaWdubWVudCBicmVha3Ncblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWUoKTtcblxuXHRcdC8vIEhhY2sgdG8gYWx3YXlzIHJlbmRlciBjaGV2cm9ucyBmb3IgZmlsZSBuZXN0cywgb3IgZWxzZSBtYXkgbm90IGJlIGFibGUgdG8gaWRlbnRpZnkgdGhlbS5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCB0d2lzdGllQ29udGFpbmVyID0gdGVtcGxhdGVEYXRhLmNvbnRhaW5lci5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXRsLXR3aXN0aWUnKTtcblx0XHR0d2lzdGllQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdmb3JjZS10d2lzdGllJywgc3RhdC5oYXNOZXN0cyAmJiB0aGVtZS5oaWRlc0V4cGxvcmVyQXJyb3dzKTtcblxuXHRcdC8vIHdoZW4gZXhwbG9yZXIgYXJyb3dzIGFyZSBoaWRkZW4gb3IgdGhlcmUgYXJlIG5vIGZvbGRlciBpY29ucywgbmVzdHMgZ2V0IG1pc2FsaWduZWQgYXMgdGhleSBhcmUgZm9yY2VkIHRvIGhhdmUgYXJyb3dzIGFuZCBmaWxlcyB0eXBpY2FsbHkgaGF2ZSBpY29uc1xuXHRcdC8vIEFwcGx5IHNvbWUgQ1NTIG1hZ2ljIHRvIGdldCB0aGluZ3MgbG9va2luZyBhcyByZWFzb25hYmxlIGFzIHBvc3NpYmxlLlxuXHRcdGNvbnN0IHRoZW1lSXNVbmhhcHB5V2l0aE5lc3RpbmcgPSB0aGVtZS5oYXNGaWxlSWNvbnMgJiYgKHRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MgfHwgIXRoZW1lLmhhc0ZvbGRlckljb25zKTtcblx0XHRjb25zdCByZWFsaWduTmVzdGVkQ2hpbGRyZW4gPSBzdGF0Lm5lc3RlZFBhcmVudCAmJiB0aGVtZUlzVW5oYXBweVdpdGhOZXN0aW5nO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250cmlicy5mb3JFYWNoKGMgPT4gYy5zZXRSZXNvdXJjZShzdGF0LnJlc291cmNlKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IHN0YXQucmVzb3VyY2UsIG5hbWU6IGxhYmVsIH0sIHtcblx0XHRcdGZpbGVLaW5kOiBzdGF0LmlzUm9vdCA/IEZpbGVLaW5kLlJPT1RfRk9MREVSIDogc3RhdC5pc0RpcmVjdG9yeSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRleHRyYUNsYXNzZXM6IHJlYWxpZ25OZXN0ZWRDaGlsZHJlbiA/IFsuLi5leHRyYUNsYXNzZXMsICdhbGlnbi1uZXN0LWljb24td2l0aC1wYXJlbnQtaWNvbiddIDogZXh0cmFDbGFzc2VzLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB0aGlzLmNvbmZpZy5leHBsb3Jlci5kZWNvcmF0aW9ucyxcblx0XHRcdG1hdGNoZXM6IGNyZWF0ZU1hdGNoZXMoZmlsdGVyRGF0YSksXG5cdFx0XHRzZXBhcmF0b3I6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihzdGF0LnJlc291cmNlLnNjaGVtZSwgc3RhdC5yZXNvdXJjZS5hdXRob3JpdHkpLFxuXHRcdFx0ZG9tSWRcblx0XHR9KTtcblxuXHRcdGNvbnN0IGhpZ2hsaWdodFJlc3VsdHMgPSBzdGF0LmlzRGlyZWN0b3J5ID8gdGhpcy5oaWdobGlnaHRUcmVlLmdldChzdGF0KSA6IDA7XG5cdFx0aWYgKGhpZ2hsaWdodFJlc3VsdHMgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IG5ldyBDb3VudEJhZGdlKHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50Lmxhc3RFbGVtZW50Q2hpbGQgYXMgSFRNTEVsZW1lbnQsIHt9LCB7IC4uLmRlZmF1bHRDb3VudEJhZGdlU3R5bGVzLCBiYWRnZUJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUobGlzdEZpbHRlck1hdGNoSGlnaGxpZ2h0KSwgYmFkZ2VCb3JkZXI6IGFzQ3NzVmFyaWFibGUobGlzdEZpbHRlck1hdGNoSGlnaGxpZ2h0Qm9yZGVyKSB9KTtcblx0XHRcdGJhZGdlLnNldENvdW50KGhpZ2hsaWdodFJlc3VsdHMpO1xuXHRcdFx0YmFkZ2Uuc2V0VGl0bGVGb3JtYXQobG9jYWxpemUoJ2V4cGxvcmVySGlnaGxpZ2h0Rm9sZGVyQmFkZ2VUaXRsZScsIFwiRGlyZWN0b3J5IGNvbnRhaW5zIHswfSBtYXRjaGVzXCIsIGhpZ2hsaWdodFJlc3VsdHMpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGJhZGdlKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlnaGxpZ2h0LWJhZGdlJywgaGlnaGxpZ2h0UmVzdWx0cyA+IDApO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnB1dEJveChjb250YWluZXI6IEhUTUxFbGVtZW50LCBzdGF0OiBFeHBsb3Jlckl0ZW0sIGVkaXRhYmxlRGF0YTogSUVkaXRhYmxlRGF0YSk6IElEaXNwb3NhYmxlIHtcblxuXHRcdC8vIFVzZSBhIGZpbGUgbGFiZWwgb25seSBmb3IgdGhlIGljb24gbmV4dCB0byB0aGUgaW5wdXQgYm94XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUoY29udGFpbmVyKTtcblx0XHRjb25zdCBleHRyYUNsYXNzZXMgPSBbJ2V4cGxvcmVyLWl0ZW0nLCAnZXhwbG9yZXItaXRlbS1lZGl0ZWQnXTtcblx0XHRjb25zdCBmaWxlS2luZCA9IHN0YXQuaXNSb290ID8gRmlsZUtpbmQuUk9PVF9GT0xERVIgOiBzdGF0LmlzRGlyZWN0b3J5ID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblxuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpO1xuXHRcdGNvbnN0IHRoZW1lSXNVbmhhcHB5V2l0aE5lc3RpbmcgPSB0aGVtZS5oYXNGaWxlSWNvbnMgJiYgKHRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MgfHwgIXRoZW1lLmhhc0ZvbGRlckljb25zKTtcblx0XHRjb25zdCByZWFsaWduTmVzdGVkQ2hpbGRyZW4gPSBzdGF0Lm5lc3RlZFBhcmVudCAmJiB0aGVtZUlzVW5oYXBweVdpdGhOZXN0aW5nO1xuXG5cdFx0Y29uc3QgbGFiZWxPcHRpb25zOiBJRmlsZUxhYmVsT3B0aW9ucyA9IHtcblx0XHRcdGhpZGVQYXRoOiB0cnVlLFxuXHRcdFx0aGlkZUxhYmVsOiB0cnVlLFxuXHRcdFx0ZmlsZUtpbmQsXG5cdFx0XHRleHRyYUNsYXNzZXM6IHJlYWxpZ25OZXN0ZWRDaGlsZHJlbiA/IFsuLi5leHRyYUNsYXNzZXMsICdhbGlnbi1uZXN0LWljb24td2l0aC1wYXJlbnQtaWNvbiddIDogZXh0cmFDbGFzc2VzLFxuXHRcdH07XG5cblxuXHRcdGNvbnN0IHBhcmVudCA9IHN0YXQubmFtZSA/IGRpcm5hbWUoc3RhdC5yZXNvdXJjZSkgOiBzdGF0LnJlc291cmNlO1xuXHRcdGNvbnN0IHZhbHVlID0gc3RhdC5uYW1lIHx8ICcnO1xuXG5cdFx0bGFiZWwuc2V0RmlsZShqb2luUGF0aChwYXJlbnQsIHZhbHVlIHx8ICcgJyksIGxhYmVsT3B0aW9ucyk7IC8vIFVzZSBpY29uIGZvciAnICcgaWYgbmFtZSBpcyBlbXB0eS5cblxuXHRcdC8vIGhhY2s6IGhpZGUgbGFiZWxcblx0XHQobGFiZWwuZWxlbWVudC5maXJzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCkuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdC8vIElucHV0IGZpZWxkIGZvciBuYW1lXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3gobGFiZWwuZWxlbWVudCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlZGl0YWJsZURhdGEudmFsaWRhdGlvbk1lc3NhZ2UodmFsdWUpO1xuXHRcdFx0XHRcdGlmICghbWVzc2FnZSB8fCBtZXNzYWdlLnNldmVyaXR5ICE9PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudCxcblx0XHRcdFx0XHRcdGZvcm1hdENvbnRlbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5FUlJPUlxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdmaWxlSW5wdXRBcmlhTGFiZWwnLCBcIlR5cGUgZmlsZSBuYW1lLiBQcmVzcyBFbnRlciB0byBjb25maXJtIG9yIEVzY2FwZSB0byBjYW5jZWwuXCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxhc3REb3QgPSB2YWx1ZS5sYXN0SW5kZXhPZignLicpO1xuXHRcdGxldCBjdXJyZW50U2VsZWN0aW9uU3RhdGUgPSAncHJlZml4JztcblxuXHRcdGlucHV0Qm94LnZhbHVlID0gdmFsdWU7XG5cdFx0aW5wdXRCb3guZm9jdXMoKTtcblx0XHRpbnB1dEJveC5zZWxlY3QoeyBzdGFydDogMCwgZW5kOiBsYXN0RG90ID4gMCAmJiAhc3RhdC5pc0RpcmVjdG9yeSA/IGxhc3REb3QgOiB2YWx1ZS5sZW5ndGggfSk7XG5cblx0XHRjb25zdCBkb25lID0gY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKChzdWNjZXNzOiBib29sZWFuLCBmaW5pc2hFZGl0aW5nOiBib29sZWFuKSA9PiB7XG5cdFx0XHRsYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGlucHV0Qm94LnZhbHVlO1xuXHRcdFx0ZGlzcG9zZSh0b0Rpc3Bvc2UpO1xuXHRcdFx0bGFiZWwuZWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdGlmIChmaW5pc2hFZGl0aW5nKSB7XG5cdFx0XHRcdGVkaXRhYmxlRGF0YS5vbkZpbmlzaCh2YWx1ZSwgc3VjY2Vzcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzaG93SW5wdXRCb3hOb3RpZmljYXRpb24gPSAoKSA9PiB7XG5cdFx0XHRpZiAoaW5wdXRCb3guaXNJbnB1dFZhbGlkKCkpIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVkaXRhYmxlRGF0YS52YWxpZGF0aW9uTWVzc2FnZShpbnB1dEJveC52YWx1ZSk7XG5cdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0aW5wdXRCb3guc2hvd01lc3NhZ2Uoe1xuXHRcdFx0XHRcdFx0Y29udGVudDogbWVzc2FnZS5jb250ZW50LFxuXHRcdFx0XHRcdFx0Zm9ybWF0Q29udGVudDogdHJ1ZSxcblx0XHRcdFx0XHRcdHR5cGU6IG1lc3NhZ2Uuc2V2ZXJpdHkgPT09IFNldmVyaXR5LkluZm8gPyBNZXNzYWdlVHlwZS5JTkZPIDogbWVzc2FnZS5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZyA/IE1lc3NhZ2VUeXBlLldBUk5JTkcgOiBNZXNzYWdlVHlwZS5FUlJPUlxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlucHV0Qm94LmhpZGVNZXNzYWdlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdHNob3dJbnB1dEJveE5vdGlmaWNhdGlvbigpO1xuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gW1xuXHRcdFx0aW5wdXRCb3gsXG5cdFx0XHRpbnB1dEJveC5vbkRpZENoYW5nZSh2YWx1ZSA9PiB7XG5cdFx0XHRcdGxhYmVsLnNldEZpbGUoam9pblBhdGgocGFyZW50LCB2YWx1ZSB8fCAnICcpLCBsYWJlbE9wdGlvbnMpOyAvLyB1cGRhdGUgbGFiZWwgaWNvbiB3aGlsZSB0eXBpbmchXG5cdFx0XHR9KSxcblx0XHRcdERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5GMikpIHtcblx0XHRcdFx0XHRjb25zdCBkb3RJbmRleCA9IGlucHV0Qm94LnZhbHVlLmxhc3RJbmRleE9mKCcuJyk7XG5cdFx0XHRcdFx0aWYgKHN0YXQuaXNEaXJlY3RvcnkgfHwgZG90SW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjdXJyZW50U2VsZWN0aW9uU3RhdGUgPT09ICdwcmVmaXgnKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50U2VsZWN0aW9uU3RhdGUgPSAnYWxsJztcblx0XHRcdFx0XHRcdGlucHV0Qm94LnNlbGVjdCh7IHN0YXJ0OiAwLCBlbmQ6IGlucHV0Qm94LnZhbHVlLmxlbmd0aCB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9PT0gJ2FsbCcpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9ICdzdWZmaXgnO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2VsZWN0KHsgc3RhcnQ6IGRvdEluZGV4ICsgMSwgZW5kOiBpbnB1dEJveC52YWx1ZS5sZW5ndGggfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRTZWxlY3Rpb25TdGF0ZSA9ICdwcmVmaXgnO1xuXHRcdFx0XHRcdFx0aW5wdXRCb3guc2VsZWN0KHsgc3RhcnQ6IDAsIGVuZDogZG90SW5kZXggfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0aWYgKCFpbnB1dEJveC52YWxpZGF0ZSgpKSB7XG5cdFx0XHRcdFx0XHRkb25lKHRydWUsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0XHRkb25lKGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdHNob3dJbnB1dEJveE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0fSksXG5cdFx0XHRET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5CTFVSLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0XHRcdGNvbnN0IG93bmVyRG9jdW1lbnQgPSBpbnB1dEJveC5pbnB1dEVsZW1lbnQub3duZXJEb2N1bWVudDtcblx0XHRcdFx0XHRpZiAoIW93bmVyRG9jdW1lbnQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fSBpZiAoRE9NLmlzQWN0aXZlRWxlbWVudChpbnB1dEJveC5pbnB1dEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChET00uaXNIVE1MRWxlbWVudChvd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpICYmIERPTS5oYXNQYXJlbnRXaXRoQ2xhc3Mob3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50LCAnY29udGV4dC12aWV3JykpIHtcblx0XHRcdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLmNvbnRleHRNZW51U2VydmljZS5vbkRpZEhpZGVDb250ZXh0TWVudSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRvbmUoaW5wdXRCb3guaXNJbnB1dFZhbGlkKCksIHRydWUpO1xuXHRcdFx0fSksXG5cdFx0XHRsYWJlbFxuXHRcdF07XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRvbmUoZmFsc2UsIGZhbHNlKTtcblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmN1cnJlbnRDb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RXhwbG9yZXJJdGVtPiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudENvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIoc3RhdDogRXhwbG9yZXJJdGVtKTogSUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzLmdldChzdGF0KTtcblx0fVxuXG5cdC8vIElBY2Nlc3NpYmlsaXR5UHJvdmlkZXJcblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogRXhwbG9yZXJJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWxlbWVudC5uYW1lO1xuXHR9XG5cblx0Z2V0QXJpYUxldmVsKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IG51bWJlciB7XG5cdFx0Ly8gV2UgbmVlZCB0byBjb21wdXQgYXJpYSBsZXZlbCBvbiBvdXIgb3duIHNpbmNlIGNoaWxkcmVuIG9mIGNvbXBhY3QgZm9sZGVycyB3aWxsIG90aGVyd2lzZSBoYXZlIGFuIGluY29ycmVjdCBsZXZlbFx0IzEwNzIzNVxuXHRcdGxldCBkZXB0aCA9IDA7XG5cdFx0bGV0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50O1xuXHRcdHdoaWxlIChwYXJlbnQpIHtcblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0XHRkZXB0aCsrO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0ZGVwdGggPSBkZXB0aCArIDE7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlcHRoO1xuXHR9XG5cblx0Z2V0QWN0aXZlRGVzY2VuZGFudElkKHN0YXQ6IEV4cGxvcmVySXRlbSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycy5nZXQoc3RhdCk/LlswXT8uY3VycmVudElkID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jb25maWdMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIENhY2hlZFBhcnNlZEV4cHJlc3Npb24ge1xuXHRvcmlnaW5hbDogZ2xvYi5JRXhwcmVzc2lvbjtcblx0cGFyc2VkOiBnbG9iLlBhcnNlZEV4cHJlc3Npb247XG59XG5cbi8qKlxuICogUmVzcGVjdHMgZmlsZXMuZXhjbHVkZSBzZXR0aW5nIGluIGZpbHRlcmluZyBvdXQgY29udGVudCBmcm9tIHRoZSBleHBsb3Jlci5cbiAqIE1ha2VzIHN1cmUgdGhhdCB2aXNpYmxlIGVkaXRvcnMgYXJlIGFsd2F5cyBzaG93biBpbiB0aGUgZXhwbG9yZXIgZXZlbiBpZiB0aGV5IGFyZSBmaWx0ZXJlZCBvdXQgYnkgc2V0dGluZ3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlc0ZpbHRlciBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPEV4cGxvcmVySXRlbSwgRnV6enlTY29yZT4ge1xuXHRwcml2YXRlIGhpZGRlbkV4cHJlc3Npb25QZXJSb290ID0gbmV3IE1hcDxzdHJpbmcsIENhY2hlZFBhcnNlZEV4cHJlc3Npb24+KCk7XG5cdHByaXZhdGUgZWRpdG9yc0FmZmVjdGluZ0ZpbHRlciA9IG5ldyBTZXQ8RWRpdG9ySW5wdXQ+KCk7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHJpdmF0ZSB0b0Rpc3Bvc2U6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0Ly8gTGlzdCBvZiBpZ25vcmVGaWxlIHJlc291cmNlcy4gVXNlZCB0byBkZXRlY3QgY2hhbmdlcyB0byB0aGUgaWdub3JlRmlsZXMuXG5cdHByaXZhdGUgaWdub3JlRmlsZVJlc291cmNlc1BlclJvb3QgPSBuZXcgTWFwPHN0cmluZywgUmVzb3VyY2VTZXQ+KCk7XG5cdC8vIElnbm9yZSB0cmVlIHBlciByb290LiBTaW1pbGFyIHRvIGBoaWRkZW5FeHByZXNzaW9uUGVyUm9vdGBcblx0Ly8gTm90ZTogVVJJIGluIHRoZSB0ZXJuYXJ5IHNlYXJjaCB0cmVlIGlzIHRoZSBVUkkgb2YgdGhlIGZvbGRlciBjb250YWluaW5nIHRoZSBpZ25vcmUgZmlsZVxuXHQvLyBJdCBpcyBub3QgdGhlIGlnbm9yZSBmaWxlIGl0c2VsZi4gVGhpcyBpcyBiZWNhdXNlIG9mIHRoZSB3YXkgdGhlIElnbm9yZUZpbGUgd29ya3MgYW5kIG5lc3RlZCBwYXRoc1xuXHRwcml2YXRlIGlnbm9yZVRyZWVzUGVyUm9vdCA9IG5ldyBNYXA8c3RyaW5nLCBUZXJuYXJ5U2VhcmNoVHJlZTxVUkksIElnbm9yZUZpbGU+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5fb25EaWRDaGFuZ2UpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmlsZXMuZXhjbHVkZScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLmV4Y2x1ZGVHaXRJZ25vcmUnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHQvLyBDaGVjayB0byBzZWUgaWYgdGhlIHVwZGF0ZSBjb250YWlucyBhbnkgb2YgdGhlIGlnbm9yZUZpbGVSZXNvdXJjZXNcblx0XHRcdGZvciAoY29uc3QgW3Jvb3QsIGlnbm9yZUZpbGVSZXNvdXJjZVNldF0gb2YgdGhpcy5pZ25vcmVGaWxlUmVzb3VyY2VzUGVyUm9vdC5lbnRyaWVzKCkpIHtcblx0XHRcdFx0aWdub3JlRmlsZVJlc291cmNlU2V0LmZvckVhY2goYXN5bmMgaWdub3JlUmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmNvbnRhaW5zKGlnbm9yZVJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5VUERBVEVEKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5wcm9jZXNzSWdub3JlRmlsZShyb290LCBpZ25vcmVSZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlLmNvbnRhaW5zKGlnbm9yZVJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5pZ25vcmVUcmVlc1BlclJvb3QuZ2V0KHJvb3QpPy5kZWxldGUoZGlybmFtZShpZ25vcmVSZXNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0aWdub3JlRmlsZVJlc291cmNlU2V0LmRlbGV0ZShpZ25vcmVSZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5lZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JzO1xuXHRcdFx0bGV0IHNob3VsZEZpcmUgPSBmYWxzZTtcblxuXHRcdFx0Zm9yIChjb25zdCBlIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKCFlLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzdGF0ID0gdGhpcy5leHBsb3JlclNlcnZpY2UuZmluZENsb3Nlc3QoZS5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChzdGF0Py5pc0V4Y2x1ZGVkKSB7XG5cdFx0XHRcdFx0Ly8gQSBmaWx0ZXJlZCByZXNvdXJjZSBzdWRkZW5seSBiZWNhbWUgdmlzaWJsZSBzaW5jZSB1c2VyIG9wZW5lZCBhbiBlZGl0b3Jcblx0XHRcdFx0XHRzaG91bGRGaXJlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGUgb2YgdGhpcy5lZGl0b3JzQWZmZWN0aW5nRmlsdGVyKSB7XG5cdFx0XHRcdGlmICghZWRpdG9ycy5pbmNsdWRlcyhlKSkge1xuXHRcdFx0XHRcdC8vIEVkaXRvciB0aGF0IHdhcyBhZmZlY3RpbmcgZmlsdGVyaW5nIGlzIG5vIGxvbmdlciB2aXNpYmxlXG5cdFx0XHRcdFx0c2hvdWxkRmlyZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNob3VsZEZpcmUpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JzQWZmZWN0aW5nRmlsdGVyLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCk7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHRsZXQgc2hvdWxkRmlyZSA9IGZhbHNlO1xuXHRcdGxldCB1cGRhdGVkR2l0SWdub3JlU2V0dGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5mb3JFYWNoKGZvbGRlciA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiBmb2xkZXIudXJpIH0pO1xuXHRcdFx0Y29uc3QgZXhjbHVkZXNDb25maWc6IGdsb2IuSUV4cHJlc3Npb24gPSBjb25maWd1cmF0aW9uPy5maWxlcz8uZXhjbHVkZSB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0Y29uc3QgcGFyc2VJZ25vcmVGaWxlOiBib29sZWFuID0gY29uZmlndXJhdGlvbi5leHBsb3Jlci5leGNsdWRlR2l0SWdub3JlO1xuXG5cdFx0XHQvLyBJZiB3ZSBzaG91bGQgYmUgcGFyc2luZyBpZ25vcmVGaWxlcyBmb3IgdGhpcyB3b3Jrc3BhY2UgYW5kIGRvbid0IGhhdmUgYW4gaWdub3JlIHRyZWUgaW5pdGlhbGl6ZSBvbmVcblx0XHRcdGlmIChwYXJzZUlnbm9yZUZpbGUgJiYgIXRoaXMuaWdub3JlVHJlZXNQZXJSb290Lmhhcyhmb2xkZXIudXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdHVwZGF0ZWRHaXRJZ25vcmVTZXR0aW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5pZ25vcmVGaWxlUmVzb3VyY2VzUGVyUm9vdC5zZXQoZm9sZGVyLnVyaS50b1N0cmluZygpLCBuZXcgUmVzb3VyY2VTZXQoKSk7XG5cdFx0XHRcdHRoaXMuaWdub3JlVHJlZXNQZXJSb290LnNldChmb2xkZXIudXJpLnRvU3RyaW5nKCksIFRlcm5hcnlTZWFyY2hUcmVlLmZvclVyaXMoKHVyaSkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcodXJpKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzaG91bGRuJ3QgYmUgcGFyc2luZyBpZ25vcmUgZmlsZXMgYnV0IGhhdmUgYW4gaWdub3JlIHRyZWUsIGNsZWFyIHRoZSBpZ25vcmUgdHJlZVxuXHRcdFx0aWYgKCFwYXJzZUlnbm9yZUZpbGUgJiYgdGhpcy5pZ25vcmVUcmVlc1BlclJvb3QuaGFzKGZvbGRlci51cmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0dXBkYXRlZEdpdElnbm9yZVNldHRpbmcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLmlnbm9yZUZpbGVSZXNvdXJjZXNQZXJSb290LmRlbGV0ZShmb2xkZXIudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aGlzLmlnbm9yZVRyZWVzUGVyUm9vdC5kZWxldGUoZm9sZGVyLnVyaS50b1N0cmluZygpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzaG91bGRGaXJlKSB7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuaGlkZGVuRXhwcmVzc2lvblBlclJvb3QuZ2V0KGZvbGRlci51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHNob3VsZEZpcmUgPSAhY2FjaGVkIHx8ICFlcXVhbHMoY2FjaGVkLm9yaWdpbmFsLCBleGNsdWRlc0NvbmZpZyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4Y2x1ZGVzQ29uZmlnQ29weSA9IGRlZXBDbG9uZShleGNsdWRlc0NvbmZpZyk7IC8vIGRvIG5vdCBrZWVwIHRoZSBjb25maWcsIGFzIGl0IGdldHMgbXV0YXRlZCB1bmRlciBvdXIgaG9vZHNcblxuXHRcdFx0dGhpcy5oaWRkZW5FeHByZXNzaW9uUGVyUm9vdC5zZXQoZm9sZGVyLnVyaS50b1N0cmluZygpLCB7IG9yaWdpbmFsOiBleGNsdWRlc0NvbmZpZ0NvcHksIHBhcnNlZDogZ2xvYi5wYXJzZShleGNsdWRlc0NvbmZpZ0NvcHkpIH0pO1xuXHRcdH0pO1xuXG5cdFx0aWYgKHNob3VsZEZpcmUgfHwgdXBkYXRlZEdpdElnbm9yZVNldHRpbmcpIHtcblx0XHRcdHRoaXMuZWRpdG9yc0FmZmVjdGluZ0ZpbHRlci5jbGVhcigpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIC5naXRpZ25vcmUgZmlsZSByZXNvdXJjZSwgcHJvY2Vzc2VzIHRoZSByZXNvdXJjZSBhbmQgYWRkcyBpdCB0byB0aGUgaWdub3JlIHRyZWUgd2hpY2ggaGlkZXMgZXhwbG9yZXIgaXRlbXNcblx0ICogQHBhcmFtIHJvb3QgVGhlIHJvb3QgZm9sZGVyIG9mIHRoZSB3b3Jrc3BhY2UgYXMgYSBzdHJpbmcuIFVzZWQgZm9yIGxvb2t1cCBrZXkgZm9yIGlnbm9yZSB0cmVlIGFuZCByZXNvdXJjZSBsaXN0XG5cdCAqIEBwYXJhbSBpZ25vcmVGaWxlUmVzb3VyY2UgVGhlIHJlc291cmNlIG9mIHRoZSAuZ2l0aWdub3JlIGZpbGVcblx0ICogQHBhcmFtIHVwZGF0ZSBXaGV0aGVyIG9yIG5vdCB3ZSdyZSB1cGRhdGluZyBhbiBleGlzdGluZyBpZ25vcmUgZmlsZS4gSWYgdHJ1ZSBpdCBkZWxldGVzIHRoZSBvbGQgZW50cnlcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcHJvY2Vzc0lnbm9yZUZpbGUocm9vdDogc3RyaW5nLCBpZ25vcmVGaWxlUmVzb3VyY2U6IFVSSSwgdXBkYXRlPzogYm9vbGVhbikge1xuXHRcdC8vIEdldCB0aGUgbmFtZSBvZiB0aGUgZGlyZWN0b3J5IHdoaWNoIHRoZSBpZ25vcmUgZmlsZSBpcyBpblxuXHRcdGNvbnN0IGRpclVyaSA9IGRpcm5hbWUoaWdub3JlRmlsZVJlc291cmNlKTtcblx0XHRjb25zdCBpZ25vcmVUcmVlID0gdGhpcy5pZ25vcmVUcmVlc1BlclJvb3QuZ2V0KHJvb3QpO1xuXHRcdGlmICghaWdub3JlVHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHByb2Nlc3MgYSBkaXJlY3RvcnkgaWYgd2UgYWxyZWFkeSBoYXZlIGl0IGluIHRoZSB0cmVlXG5cdFx0aWYgKCF1cGRhdGUgJiYgaWdub3JlVHJlZS5oYXMoZGlyVXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBNYXliZSB3ZSBuZWVkIGEgY2FuY2VsbGF0aW9uIHRva2VuIGhlcmUgaW4gY2FzZSBpdCdzIHN1cGVyIGxvbmc/XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoaWdub3JlRmlsZVJlc291cmNlKTtcblxuXHRcdC8vIElmIGl0J3MganVzdCBhbiB1cGRhdGUgd2UgdXBkYXRlIHRoZSBjb250ZW50cyBrZWVwaW5nIGFsbCByZWZlcmVuY2VzIHRoZSBzYW1lXG5cdFx0aWYgKHVwZGF0ZSkge1xuXHRcdFx0Y29uc3QgaWdub3JlRmlsZSA9IGlnbm9yZVRyZWUuZ2V0KGRpclVyaSk7XG5cdFx0XHRpZ25vcmVGaWxlPy51cGRhdGVDb250ZW50cyhjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBPdGhlcndpc2Ugd2UgY3JlYXRlIGEgbmV3IGlnbm9yZSBmaWxlIGFuZCBhZGQgaXQgdG8gdGhlIHRyZWVcblx0XHRcdGNvbnN0IGlnbm9yZVBhcmVudCA9IGlnbm9yZVRyZWUuZmluZFN1YnN0cihkaXJVcmkpO1xuXHRcdFx0Y29uc3QgaWdub3JlQ2FzZSA9ICF0aGlzLmZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkoaWdub3JlRmlsZVJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUpO1xuXHRcdFx0Y29uc3QgaWdub3JlRmlsZSA9IG5ldyBJZ25vcmVGaWxlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgZGlyVXJpLnBhdGgsIGlnbm9yZVBhcmVudCwgaWdub3JlQ2FzZSk7XG5cdFx0XHRpZ25vcmVUcmVlLnNldChkaXJVcmksIGlnbm9yZUZpbGUpO1xuXHRcdFx0Ly8gSWYgd2UgaGF2ZW4ndCBzZWVuIHRoaXMgcmVzb3VyY2UgYmVmb3JlIHRoZW4gd2UgbmVlZCB0byBhZGQgaXQgdG8gdGhlIGxpc3Qgb2YgcmVzb3VyY2VzIHdlJ3JlIHRyYWNraW5nXG5cdFx0XHRpZiAoIXRoaXMuaWdub3JlRmlsZVJlc291cmNlc1BlclJvb3QuZ2V0KHJvb3QpPy5oYXMoaWdub3JlRmlsZVJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLmlnbm9yZUZpbGVSZXNvdXJjZXNQZXJSb290LmdldChyb290KT8uYWRkKGlnbm9yZUZpbGVSZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm90aWZ5IHRoZSBleHBsb3JlciBvZiB0aGUgY2hhbmdlIHNvIHdlIG1heSBpZ25vcmUgdGhlc2UgZmlsZXNcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRmaWx0ZXIoc3RhdDogRXhwbG9yZXJJdGVtLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IGJvb2xlYW4ge1xuXHRcdC8vIEFkZCBuZXdseSB2aXNpdGVkIC5naXRpZ25vcmUgZmlsZXMgdG8gdGhlIGlnbm9yZSB0cmVlXG5cdFx0aWYgKHN0YXQubmFtZSA9PT0gJy5naXRpZ25vcmUnICYmIHRoaXMuaWdub3JlVHJlZXNQZXJSb290LmhhcyhzdGF0LnJvb3QucmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMucHJvY2Vzc0lnbm9yZUZpbGUoc3RhdC5yb290LnJlc291cmNlLnRvU3RyaW5nKCksIHN0YXQucmVzb3VyY2UsIGZhbHNlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlzVmlzaWJsZShzdGF0LCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0fVxuXG5cdHByaXZhdGUgaXNWaXNpYmxlKHN0YXQ6IEV4cGxvcmVySXRlbSwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBib29sZWFuIHtcblx0XHRzdGF0LmlzRXhjbHVkZWQgPSBmYWxzZTtcblx0XHRpZiAocGFyZW50VmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuSGlkZGVuKSB7XG5cdFx0XHRzdGF0LmlzRXhjbHVkZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKHN0YXQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHZpc2libGVcblx0XHR9XG5cblx0XHQvLyBIaWRlIHRob3NlIHRoYXQgbWF0Y2ggSGlkZGVuIFBhdHRlcm5zXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5oaWRkZW5FeHByZXNzaW9uUGVyUm9vdC5nZXQoc3RhdC5yb290LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGdsb2JNYXRjaCA9IGNhY2hlZD8ucGFyc2VkKHBhdGgucmVsYXRpdmUoc3RhdC5yb290LnJlc291cmNlLnBhdGgsIHN0YXQucmVzb3VyY2UucGF0aCksIHN0YXQubmFtZSwgbmFtZSA9PiAhIShzdGF0LnBhcmVudD8uZ2V0Q2hpbGQobmFtZSkpKTtcblx0XHQvLyBTbWFsbCBvcHRpbWl6YXRpb24gdG8gb25seSBydW4gaXNIaWRkZW5SZXNvdXJjZSAodHJhdmVyc2UgZ2l0SWdub3JlKSBpZiB0aGUgZ2xvYk1hdGNoIGZyb20gZmlsZUV4Y2x1ZGUgcmV0dXJuZWQgbm90aGluZ1xuXHRcdGNvbnN0IGlzSGlkZGVuUmVzb3VyY2UgPSBnbG9iTWF0Y2ggPyB0cnVlIDogdGhpcy5pc0lnbm9yZWQoc3RhdC5yZXNvdXJjZSwgc3RhdC5yb290LnJlc291cmNlLCBzdGF0LmlzRGlyZWN0b3J5KTtcblx0XHRpZiAoaXNIaWRkZW5SZXNvdXJjZSB8fCBzdGF0LnBhcmVudD8uaXNFeGNsdWRlZCkge1xuXHRcdFx0c3RhdC5pc0V4Y2x1ZGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmVkaXRvclNlcnZpY2UudmlzaWJsZUVkaXRvcnM7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JzLmZpbmQoZSA9PiBlLnJlc291cmNlICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQoZS5yZXNvdXJjZSwgc3RhdC5yZXNvdXJjZSkpO1xuXHRcdFx0aWYgKGVkaXRvciAmJiBzdGF0LnJvb3QgPT09IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmZpbmRDbG9zZXN0Um9vdChzdGF0LnJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvcnNBZmZlY3RpbmdGaWx0ZXIuYWRkKGVkaXRvcik7XG5cdFx0XHRcdHJldHVybiB0cnVlOyAvLyBTaG93IGFsbCBvcGVuZWQgZmlsZXMgYW5kIHRoZWlyIHBhcmVudHNcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBoaWRkZW4gdGhyb3VnaCBwYXR0ZXJuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpc0lnbm9yZWQocmVzb3VyY2U6IFVSSSwgcm9vdFJlc291cmNlOiBVUkksIGlzRGlyZWN0b3J5OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaWdub3JlRmlsZSA9IHRoaXMuaWdub3JlVHJlZXNQZXJSb290LmdldChyb290UmVzb3VyY2UudG9TdHJpbmcoKSk/LmZpbmRTdWJzdHIocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlzSW5jbHVkZWRJblRyYXZlcnNhbCA9IGlnbm9yZUZpbGU/LmlzUGF0aEluY2x1ZGVkSW5UcmF2ZXJzYWwocmVzb3VyY2UucGF0aCwgaXNEaXJlY3RvcnkpO1xuXG5cdFx0Ly8gRG9pbmcgIXVuZGVmaW5lZCByZXR1cm5zIHRydWUgYW5kIHdlIHdhbnQgaXQgdG8gYmUgZmFsc2Ugd2hlbiB1bmRlZmluZWQgYmVjYXVzZSB0aGF0IG1lYW5zIGl0J3Mgbm90IGluY2x1ZGVkIGluIHRoZSBpZ25vcmUgZmlsZVxuXHRcdHJldHVybiBpc0luY2x1ZGVkSW5UcmF2ZXJzYWwgPT09IHVuZGVmaW5lZCA/IGZhbHNlIDogIWlzSW5jbHVkZWRJblRyYXZlcnNhbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuLy8gRXhwbG9yZXIgU29ydGVyXG5leHBvcnQgY2xhc3MgRmlsZVNvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPEV4cGxvcmVySXRlbT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXhwbG9yZXJTZXJ2aWNlOiBJRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Y29tcGFyZShzdGF0QTogRXhwbG9yZXJJdGVtLCBzdGF0QjogRXhwbG9yZXJJdGVtKTogbnVtYmVyIHtcblx0XHQvLyBEbyBub3Qgc29ydCByb290c1xuXHRcdGlmIChzdGF0QS5pc1Jvb3QpIHtcblx0XHRcdGlmIChzdGF0Qi5pc1Jvb3QpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlQSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHN0YXRBLnJlc291cmNlKTtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlQiA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHN0YXRCLnJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZUEgJiYgd29ya3NwYWNlQiA/ICh3b3Jrc3BhY2VBLmluZGV4IC0gd29ya3NwYWNlQi5pbmRleCkgOiAtMTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0Qi5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvcnRPcmRlciA9IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnNvcnRPcmRlckNvbmZpZ3VyYXRpb24uc29ydE9yZGVyO1xuXHRcdGNvbnN0IGxleGljb2dyYXBoaWNPcHRpb25zID0gdGhpcy5leHBsb3JlclNlcnZpY2Uuc29ydE9yZGVyQ29uZmlndXJhdGlvbi5sZXhpY29ncmFwaGljT3B0aW9ucztcblx0XHRjb25zdCByZXZlcnNlID0gdGhpcy5leHBsb3JlclNlcnZpY2Uuc29ydE9yZGVyQ29uZmlndXJhdGlvbi5yZXZlcnNlO1xuXHRcdGlmIChyZXZlcnNlKSB7XG5cdFx0XHRbc3RhdEEsIHN0YXRCXSA9IFtzdGF0Qiwgc3RhdEFdO1xuXHRcdH1cblxuXHRcdGxldCBjb21wYXJlRmlsZU5hbWVzO1xuXHRcdGxldCBjb21wYXJlRmlsZUV4dGVuc2lvbnM7XG5cdFx0c3dpdGNoIChsZXhpY29ncmFwaGljT3B0aW9ucykge1xuXHRcdFx0Y2FzZSAndXBwZXInOlxuXHRcdFx0XHRjb21wYXJlRmlsZU5hbWVzID0gY29tcGFyZUZpbGVOYW1lc1VwcGVyO1xuXHRcdFx0XHRjb21wYXJlRmlsZUV4dGVuc2lvbnMgPSBjb21wYXJlRmlsZUV4dGVuc2lvbnNVcHBlcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdsb3dlcic6XG5cdFx0XHRcdGNvbXBhcmVGaWxlTmFtZXMgPSBjb21wYXJlRmlsZU5hbWVzTG93ZXI7XG5cdFx0XHRcdGNvbXBhcmVGaWxlRXh0ZW5zaW9ucyA9IGNvbXBhcmVGaWxlRXh0ZW5zaW9uc0xvd2VyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3VuaWNvZGUnOlxuXHRcdFx0XHRjb21wYXJlRmlsZU5hbWVzID0gY29tcGFyZUZpbGVOYW1lc1VuaWNvZGU7XG5cdFx0XHRcdGNvbXBhcmVGaWxlRXh0ZW5zaW9ucyA9IGNvbXBhcmVGaWxlRXh0ZW5zaW9uc1VuaWNvZGU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gJ2RlZmF1bHQnXG5cdFx0XHRcdGNvbXBhcmVGaWxlTmFtZXMgPSBjb21wYXJlRmlsZU5hbWVzRGVmYXVsdDtcblx0XHRcdFx0Y29tcGFyZUZpbGVFeHRlbnNpb25zID0gY29tcGFyZUZpbGVFeHRlbnNpb25zRGVmYXVsdDtcblx0XHR9XG5cblx0XHQvLyBTb3J0IERpcmVjdG9yaWVzXG5cdFx0c3dpdGNoIChzb3J0T3JkZXIpIHtcblx0XHRcdGNhc2UgJ3R5cGUnOlxuXHRcdFx0XHRpZiAoc3RhdEEuaXNEaXJlY3RvcnkgJiYgIXN0YXRCLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0YXRCLmlzRGlyZWN0b3J5ICYmICFzdGF0QS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0YXRBLmlzRGlyZWN0b3J5ICYmIHN0YXRCLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMoc3RhdEEubmFtZSwgc3RhdEIubmFtZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnZmlsZXNGaXJzdCc6XG5cdFx0XHRcdGlmIChzdGF0QS5pc0RpcmVjdG9yeSAmJiAhc3RhdEIuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdGF0Qi5pc0RpcmVjdG9yeSAmJiAhc3RhdEEuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSAnZm9sZGVyc05lc3RzRmlsZXMnOlxuXHRcdFx0XHRpZiAoc3RhdEEuaXNEaXJlY3RvcnkgJiYgIXN0YXRCLmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0YXRCLmlzRGlyZWN0b3J5ICYmICFzdGF0QS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHN0YXRBLmhhc05lc3RzICYmICFzdGF0Qi5oYXNOZXN0cykge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdGF0Qi5oYXNOZXN0cyAmJiAhc3RhdEEuaGFzTmVzdHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlICdtaXhlZCc6XG5cdFx0XHRcdGJyZWFrOyAvLyBub3Qgc29ydGluZyB3aGVuIFwibWl4ZWRcIiBpcyBvblxuXG5cdFx0XHRkZWZhdWx0OiAvKiAnZGVmYXVsdCcsICdtb2RpZmllZCcgKi9cblx0XHRcdFx0aWYgKHN0YXRBLmlzRGlyZWN0b3J5ICYmICFzdGF0Qi5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzdGF0Qi5pc0RpcmVjdG9yeSAmJiAhc3RhdEEuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIFNvcnQgRmlsZXNcblx0XHRzd2l0Y2ggKHNvcnRPcmRlcikge1xuXHRcdFx0Y2FzZSAndHlwZSc6XG5cdFx0XHRcdHJldHVybiBjb21wYXJlRmlsZUV4dGVuc2lvbnMoc3RhdEEubmFtZSwgc3RhdEIubmFtZSk7XG5cblx0XHRcdGNhc2UgJ21vZGlmaWVkJzpcblx0XHRcdFx0aWYgKHN0YXRBLm10aW1lICE9PSBzdGF0Qi5tdGltZSkge1xuXHRcdFx0XHRcdHJldHVybiAoc3RhdEEubXRpbWUgJiYgc3RhdEIubXRpbWUgJiYgc3RhdEEubXRpbWUgPCBzdGF0Qi5tdGltZSkgPyAxIDogLTE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gY29tcGFyZUZpbGVOYW1lcyhzdGF0QS5uYW1lLCBzdGF0Qi5uYW1lKTtcblxuXHRcdFx0ZGVmYXVsdDogLyogJ2RlZmF1bHQnLCAnbWl4ZWQnLCAnZmlsZXNGaXJzdCcgKi9cblx0XHRcdFx0cmV0dXJuIGNvbXBhcmVGaWxlTmFtZXMoc3RhdEEubmFtZSwgc3RhdEIubmFtZSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlRHJhZ0FuZERyb3AgaW1wbGVtZW50cyBJVHJlZURyYWdBbmREcm9wPEV4cGxvcmVySXRlbT4ge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDT05GSVJNX0RORF9TRVRUSU5HX0tFWSA9ICdleHBsb3Jlci5jb25maXJtRHJhZ0FuZERyb3AnO1xuXG5cdHByaXZhdGUgY29tcHJlc3NlZERyYWdPdmVyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29tcHJlc3NlZERyb3BUYXJnZXREaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGRyb3BFbmFibGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBpc0NvbGxhcHNlZDogKGl0ZW06IEV4cGxvcmVySXRlbSkgPT4gYm9vbGVhbixcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHRjb25zdCB1cGRhdGVEcm9wRW5hYmxlbWVudCA9IChlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXIuZW5hYmxlRHJhZ0FuZERyb3AnKSkge1xuXHRcdFx0XHR0aGlzLmRyb3BFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZXhwbG9yZXIuZW5hYmxlRHJhZ0FuZERyb3AnKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHVwZGF0ZURyb3BFbmFibGVtZW50KHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB1cGRhdGVEcm9wRW5hYmxlbWVudChlKSkpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXQ6IEV4cGxvcmVySXRlbSB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0aWYgKCF0aGlzLmRyb3BFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHJlc3NlZCBmb2xkZXJzXG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0Y29uc3QgY29tcHJlc3NlZFRhcmdldCA9IEZpbGVEcmFnQW5kRHJvcC5nZXRDb21wcmVzc2VkU3RhdEZyb21EcmFnRXZlbnQodGFyZ2V0LCBvcmlnaW5hbEV2ZW50KTtcblxuXHRcdFx0aWYgKGNvbXByZXNzZWRUYXJnZXQpIHtcblx0XHRcdFx0Y29uc3QgaWNvbkxhYmVsTmFtZSA9IGdldEljb25MYWJlbE5hbWVGcm9tSFRNTEVsZW1lbnQob3JpZ2luYWxFdmVudC50YXJnZXQpO1xuXG5cdFx0XHRcdGlmIChpY29uTGFiZWxOYW1lICYmIGljb25MYWJlbE5hbWUuaW5kZXggPCBpY29uTGFiZWxOYW1lLmNvdW50IC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuaGFuZGxlRHJhZ092ZXIoZGF0YSwgY29tcHJlc3NlZFRhcmdldCwgdGFyZ2V0SW5kZXgsIHRhcmdldFNlY3Rvciwgb3JpZ2luYWxFdmVudCk7XG5cblx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRpZiAoaWNvbkxhYmVsTmFtZS5lbGVtZW50ICE9PSB0aGlzLmNvbXByZXNzZWREcmFnT3ZlckVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5jb21wcmVzc2VkRHJhZ092ZXJFbGVtZW50ID0gaWNvbkxhYmVsTmFtZS5lbGVtZW50O1xuXHRcdFx0XHRcdFx0XHR0aGlzLmNvbXByZXNzZWREcm9wVGFyZ2V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuY29tcHJlc3NlZERyb3BUYXJnZXREaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpY29uTGFiZWxOYW1lLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZHJvcC10YXJnZXQnKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmNvbXByZXNzZWREcmFnT3ZlckVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRcdGljb25MYWJlbE5hbWUuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcm9wLXRhcmdldCcpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gdHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nID8gcmVzdWx0IDogeyAuLi5yZXN1bHQsIGZlZWRiYWNrOiBbXSB9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuY29tcHJlc3NlZERyb3BUYXJnZXREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmNvbXByZXNzZWREcm9wVGFyZ2V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIHRoaXMuaGFuZGxlRHJhZ092ZXIoZGF0YSwgdGFyZ2V0LCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0OiBFeHBsb3Jlckl0ZW0gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4gfCBJVHJlZURyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdGNvbnN0IGlzQ29weSA9IG9yaWdpbmFsRXZlbnQgJiYgKChvcmlnaW5hbEV2ZW50LmN0cmxLZXkgJiYgIWlzTWFjaW50b3NoKSB8fCAob3JpZ2luYWxFdmVudC5hbHRLZXkgJiYgaXNNYWNpbnRvc2gpKTtcblx0XHRjb25zdCBpc05hdGl2ZSA9IGRhdGEgaW5zdGFuY2VvZiBOYXRpdmVEcmFnQW5kRHJvcERhdGE7XG5cdFx0Y29uc3QgZWZmZWN0VHlwZSA9IChpc05hdGl2ZSB8fCBpc0NvcHkpID8gTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Db3B5IDogTGlzdERyYWdPdmVyRWZmZWN0VHlwZS5Nb3ZlO1xuXHRcdGNvbnN0IGVmZmVjdCA9IHsgdHlwZTogZWZmZWN0VHlwZSwgcG9zaXRpb246IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLk92ZXIgfTtcblxuXHRcdC8vIE5hdGl2ZSBETkRcblx0XHRpZiAoaXNOYXRpdmUpIHtcblx0XHRcdGlmICghY29udGFpbnNEcmFnVHlwZShvcmlnaW5hbEV2ZW50LCBEYXRhVHJhbnNmZXJzLkZJTEVTLCBDb2RlRGF0YVRyYW5zZmVycy5GSUxFUywgRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdGhlci1UcmVlIERORFxuXHRcdGVsc2UgaWYgKGRhdGEgaW5zdGFuY2VvZiBFeHRlcm5hbEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gSW4tRXhwbG9yZXIgRE5EXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IEZpbGVEcmFnQW5kRHJvcC5nZXRTdGF0c0Zyb21EcmFnQW5kRHJvcERhdGEoZGF0YSBhcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxFeHBsb3Jlckl0ZW0sIEV4cGxvcmVySXRlbVtdPik7XG5cdFx0XHRjb25zdCBpc1Jvb3RzUmVvcmRlciA9IGl0ZW1zLmV2ZXJ5KGl0ZW0gPT4gaXRlbS5pc1Jvb3QpO1xuXG5cdFx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0XHQvLyBEcm9wcGluZyBvbnRvIHRoZSBlbXB0eSBhcmVhLiBEbyBub3QgYWNjZXB0IGlmIGl0ZW1zIGRyYWdnZWQgYXJlIGFscmVhZHlcblx0XHRcdFx0Ly8gY2hpbGRyZW4gb2YgdGhlIHJvb3QgdW5sZXNzIHdlIGFyZSBjb3B5aW5nIHRoZSBmaWxlXG5cdFx0XHRcdGlmICghaXNDb3B5ICYmIGl0ZW1zLmV2ZXJ5KGkgPT4gISFpLnBhcmVudCAmJiBpLnBhcmVudC5pc1Jvb3QpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcm9vdCBpcyBhZGRlZCBhZnRlciBsYXN0IHJvb3QgZm9sZGVyIHdoZW4gaG92ZXJpbmcgb24gZW1wdHkgYmFja2dyb3VuZFxuXHRcdFx0XHRpZiAoaXNSb290c1Jlb3JkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGVmZmVjdDogeyB0eXBlOiBMaXN0RHJhZ092ZXJFZmZlY3RUeXBlLk1vdmUsIHBvc2l0aW9uOiBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbi5BZnRlciB9IH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGJ1YmJsZTogVHJlZURyYWdPdmVyQnViYmxlLkRvd24sIGVmZmVjdCwgYXV0b0V4cGFuZDogZmFsc2UgfTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNDb3B5ICYmIGl0ZW1zLmV2ZXJ5KChzb3VyY2UpID0+IHNvdXJjZS5pc1JlYWRvbmx5KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIENhbm5vdCBtb3ZlIHJlYWRvbmx5IGl0ZW1zIHVubGVzcyB3ZSBjb3B5XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpdGVtcy5zb21lKChzb3VyY2UpID0+IHtcblx0XHRcdFx0aWYgKHNvdXJjZS5pc1Jvb3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIFJvb3QgZm9sZGVycyBhcmUgaGFuZGxlZCBzZXBlcmF0ZWx5XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLnJlc291cmNlLCB0YXJnZXQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIENhbiBub3QgbW92ZSBhbnl0aGluZyBvbnRvIGl0c2VsZiBleGNwZXQgZm9yIHJvb3QgZm9sZGVyc1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0NvcHkgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZGlybmFtZShzb3VyY2UucmVzb3VyY2UpLCB0YXJnZXQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIENhbiBub3QgbW92ZSBhIGZpbGUgdG8gdGhlIHNhbWUgcGFyZW50IHVubGVzcyB3ZSBjb3B5XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh0YXJnZXQucmVzb3VyY2UsIHNvdXJjZS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gQ2FuIG5vdCBtb3ZlIGEgcGFyZW50IGZvbGRlciBpbnRvIG9uZSBvZiBpdHMgY2hpbGRyZW5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0pKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVvcmRlcmluZyByb290c1xuXHRcdFx0aWYgKGlzUm9vdHNSZW9yZGVyKSB7XG5cdFx0XHRcdGlmICghdGFyZ2V0LmlzUm9vdCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBkcm9wRWZmZWN0UG9zaXRpb246IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzd2l0Y2ggKHRhcmdldFNlY3Rvcikge1xuXHRcdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuVE9QOlxuXHRcdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQ0VOVEVSX1RPUDpcblx0XHRcdFx0XHRcdGRyb3BFZmZlY3RQb3NpdGlvbiA9IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLkJlZm9yZTsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBMaXN0Vmlld1RhcmdldFNlY3Rvci5DRU5URVJfQk9UVE9NOlxuXHRcdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQk9UVE9NOlxuXHRcdFx0XHRcdFx0ZHJvcEVmZmVjdFBvc2l0aW9uID0gTGlzdERyYWdPdmVyRWZmZWN0UG9zaXRpb24uQWZ0ZXI7IGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGFjY2VwdDogdHJ1ZSwgZWZmZWN0OiB7IHR5cGU6IExpc3REcmFnT3ZlckVmZmVjdFR5cGUuTW92ZSwgcG9zaXRpb246IGRyb3BFZmZlY3RQb3NpdGlvbiB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWxsICh0YXJnZXQgPSBtb2RlbClcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHsgYWNjZXB0OiB0cnVlLCBidWJibGU6IFRyZWVEcmFnT3ZlckJ1YmJsZS5Eb3duLCBlZmZlY3QgfTtcblx0XHR9XG5cblx0XHQvLyBBbGwgKHRhcmdldCA9IGZpbGUvZm9sZGVyKVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRhcmdldC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRpZiAodGFyZ2V0LmlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGJ1YmJsZTogVHJlZURyYWdPdmVyQnViYmxlLkRvd24sIGVmZmVjdCwgYXV0b0V4cGFuZDogdHJ1ZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmV2ZXJ5KGZvbGRlciA9PiBmb2xkZXIudXJpLnRvU3RyaW5nKCkgIT09IHRhcmdldC5yZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRyZXR1cm4geyBhY2NlcHQ6IHRydWUsIGJ1YmJsZTogVHJlZURyYWdPdmVyQnViYmxlLlVwLCBlZmZlY3QgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IEV4cGxvcmVySXRlbSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICh0aGlzLmV4cGxvcmVyU2VydmljZS5pc0VkaXRhYmxlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsKGVsZW1lbnRzOiBFeHBsb3Jlckl0ZW1bXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gRmlsZURyYWdBbmREcm9wLmdldENvbXByZXNzZWRTdGF0RnJvbURyYWdFdmVudChlbGVtZW50c1swXSwgb3JpZ2luYWxFdmVudCk7XG5cdFx0XHRyZXR1cm4gc3RhdC5uYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBTdHJpbmcoZWxlbWVudHMubGVuZ3RoKTtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW1zID0gRmlsZURyYWdBbmREcm9wLmdldFN0YXRzRnJvbURyYWdBbmREcm9wRGF0YShkYXRhIGFzIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPEV4cGxvcmVySXRlbSwgRXhwbG9yZXJJdGVtW10+LCBvcmlnaW5hbEV2ZW50KTtcblx0XHRpZiAoaXRlbXMubGVuZ3RoICYmIG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHQvLyBBcHBseSBzb21lIGRhdGF0cmFuc2ZlciB0eXBlcyB0byBhbGxvdyBmb3IgZHJhZ2dpbmcgdGhlIGVsZW1lbnQgb3V0c2lkZSBvZiB0aGUgYXBwbGljYXRpb25cblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgaXRlbXMsIG9yaWdpbmFsRXZlbnQpKTtcblxuXHRcdFx0Ly8gVGhlIG9ubHkgY3VzdG9tIGRhdGEgdHJhbnNmZXIgd2Ugc2V0IGZyb20gdGhlIGV4cGxvcmVyIGlzIGEgZmlsZSB0cmFuc2ZlclxuXHRcdFx0Ly8gdG8gYmUgYWJsZSB0byBETkQgYmV0d2VlbiBtdWx0aXBsZSBjb2RlIGZpbGUgZXhwbG9yZXJzIGFjcm9zcyB3aW5kb3dzXG5cdFx0XHRjb25zdCBmaWxlUmVzb3VyY2VzID0gaXRlbXMuZmlsdGVyKHMgPT4gcy5yZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKHIgPT4gci5yZXNvdXJjZS5mc1BhdGgpO1xuXHRcdFx0aWYgKGZpbGVSZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIEpTT04uc3RyaW5naWZ5KGZpbGVSZXNvdXJjZXMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldDogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNvbXByZXNzZWREcm9wVGFyZ2V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHQvLyBGaW5kIGNvbXByZXNzZWQgdGFyZ2V0XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0Y29uc3QgY29tcHJlc3NlZFRhcmdldCA9IEZpbGVEcmFnQW5kRHJvcC5nZXRDb21wcmVzc2VkU3RhdEZyb21EcmFnRXZlbnQodGFyZ2V0LCBvcmlnaW5hbEV2ZW50KTtcblxuXHRcdFx0aWYgKGNvbXByZXNzZWRUYXJnZXQpIHtcblx0XHRcdFx0dGFyZ2V0ID0gY29tcHJlc3NlZFRhcmdldDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaW5kIHBhcmVudCB0byBhZGQgdG9cblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGFyZ2V0ID0gdGhpcy5leHBsb3JlclNlcnZpY2Uucm9vdHNbdGhpcy5leHBsb3JlclNlcnZpY2Uucm9vdHMubGVuZ3RoIC0gMV07XG5cdFx0XHR0YXJnZXRTZWN0b3IgPSBMaXN0Vmlld1RhcmdldFNlY3Rvci5CT1RUT007XG5cdFx0fVxuXHRcdGlmICghdGFyZ2V0LmlzRGlyZWN0b3J5ICYmIHRhcmdldC5wYXJlbnQpIHtcblx0XHRcdHRhcmdldCA9IHRhcmdldC5wYXJlbnQ7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQuaXNSZWFkb25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlZFRhcmdldCA9IHRhcmdldDtcblx0XHRpZiAoIXJlc29sdmVkVGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblxuXHRcdFx0Ly8gRXh0ZXJuYWwgZmlsZSBETkQgKEltcG9ydC9VcGxvYWQgZmlsZSlcblx0XHRcdGlmIChkYXRhIGluc3RhbmNlb2YgTmF0aXZlRHJhZ0FuZERyb3BEYXRhKSB7XG5cdFx0XHRcdC8vIFVzZSBsb2NhbCBmaWxlIGltcG9ydCB3aGVuIHN1cHBvcnRlZFxuXHRcdFx0XHRpZiAoIWlzV2ViIHx8IChpc1RlbXBvcmFyeVdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSAmJiBXZWJGaWxlU3lzdGVtQWNjZXNzLnN1cHBvcnRlZChtYWluV2luZG93KSkpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlSW1wb3J0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlcm5hbEZpbGVJbXBvcnQpO1xuXHRcdFx0XHRcdGF3YWl0IGZpbGVJbXBvcnQuaW1wb3J0KHJlc29sdmVkVGFyZ2V0LCBvcmlnaW5hbEV2ZW50LCBtYWluV2luZG93KTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBPdGhlcndpc2UgZmFsbGJhY2sgdG8gYnJvd3NlciBiYXNlZCBmaWxlIHVwbG9hZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBicm93c2VyVXBsb2FkID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyRmlsZVVwbG9hZCk7XG5cdFx0XHRcdFx0YXdhaXQgYnJvd3NlclVwbG9hZC51cGxvYWQodGFyZ2V0LCBvcmlnaW5hbEV2ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbi1FeHBsb3JlciBETkQgKE1vdmUvQ29weSBmaWxlKVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlRXhwbG9yZXJEcm9wKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8RXhwbG9yZXJJdGVtLCBFeHBsb3Jlckl0ZW1bXT4sIHJlc29sdmVkVGFyZ2V0LCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmVycm9yKHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVFeHBsb3JlckRyb3AoZGF0YTogRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8RXhwbG9yZXJJdGVtLCBFeHBsb3Jlckl0ZW1bXT4sIHRhcmdldDogRXhwbG9yZXJJdGVtLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGVtZW50c0RhdGEgPSBGaWxlRHJhZ0FuZERyb3AuZ2V0U3RhdHNGcm9tRHJhZ0FuZERyb3BEYXRhKGRhdGEpO1xuXHRcdGNvbnN0IGRpc3RpbmN0SXRlbXMgPSBuZXcgTWFwKGVsZW1lbnRzRGF0YS5tYXAoZWxlbWVudCA9PiBbZWxlbWVudCwgdGhpcy5pc0NvbGxhcHNlZChlbGVtZW50KV0pKTtcblxuXHRcdGZvciAoY29uc3QgW2l0ZW0sIGNvbGxhcHNlZF0gb2YgZGlzdGluY3RJdGVtcykge1xuXHRcdFx0aWYgKGNvbGxhcHNlZCkge1xuXHRcdFx0XHRjb25zdCBuZXN0ZWRDaGlsZHJlbiA9IGl0ZW0ubmVzdGVkQ2hpbGRyZW47XG5cdFx0XHRcdGlmIChuZXN0ZWRDaGlsZHJlbikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgbmVzdGVkQ2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdC8vIGlmIHBhcmVudCBpcyBjb2xsYXBzZWQsIHRoZW4gdGhlIG5lc3RlZCBjaGlsZHJlbiBpcyBjb25zaWRlcmVkIGNvbGxhcHNlZCB0byBvcGVyYXRlIGFzIGEgZ3JvdXBcblx0XHRcdFx0XHRcdC8vIGFuZCBza2lwIGNvbGxhcHNlZCBzdGF0ZSBjaGVjayBzaW5jZSB0aGV5J3JlIG5vdCBpbiB0aGUgdHJlZVxuXHRcdFx0XHRcdFx0ZGlzdGluY3RJdGVtcy5zZXQoY2hpbGQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gZGlzdGluY3RQYXJlbnRzKFsuLi5kaXN0aW5jdEl0ZW1zLmtleXMoKV0sIHMgPT4gcy5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgaXNDb3B5ID0gKG9yaWdpbmFsRXZlbnQuY3RybEtleSAmJiAhaXNNYWNpbnRvc2gpIHx8IChvcmlnaW5hbEV2ZW50LmFsdEtleSAmJiBpc01hY2ludG9zaCk7XG5cblx0XHQvLyBIYW5kbGUgY29uZmlybSBzZXR0aW5nXG5cdFx0Y29uc3QgY29uZmlybURyYWdBbmREcm9wID0gIWlzQ29weSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEZpbGVEcmFnQW5kRHJvcC5DT05GSVJNX0RORF9TRVRUSU5HX0tFWSk7XG5cdFx0aWYgKGNvbmZpcm1EcmFnQW5kRHJvcCkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGl0ZW1zLmxlbmd0aCA+IDEgJiYgaXRlbXMuZXZlcnkocyA9PiBzLmlzUm9vdCkgPyBsb2NhbGl6ZSgnY29uZmlybVJvb3RzTW92ZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGNoYW5nZSB0aGUgb3JkZXIgb2YgbXVsdGlwbGUgcm9vdCBmb2xkZXJzIGluIHlvdXIgd29ya3NwYWNlP1wiKVxuXHRcdFx0XHQ6IGl0ZW1zLmxlbmd0aCA+IDEgPyBsb2NhbGl6ZSgnY29uZmlybU11bHRpTW92ZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIG1vdmUgdGhlIGZvbGxvd2luZyB7MH0gZmlsZXMgaW50byAnezF9Jz9cIiwgaXRlbXMubGVuZ3RoLCB0YXJnZXQubmFtZSlcblx0XHRcdFx0XHQ6IGl0ZW1zWzBdLmlzUm9vdCA/IGxvY2FsaXplKCdjb25maXJtUm9vdE1vdmUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjaGFuZ2UgdGhlIG9yZGVyIG9mIHJvb3QgZm9sZGVyICd7MH0nIGluIHlvdXIgd29ya3NwYWNlP1wiLCBpdGVtc1swXS5uYW1lKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29uZmlybU1vdmUnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBtb3ZlICd7MH0nIGludG8gJ3sxfSc/XCIsIGl0ZW1zWzBdLm5hbWUsIHRhcmdldC5uYW1lKTtcblx0XHRcdGNvbnN0IGRldGFpbCA9IGl0ZW1zLmxlbmd0aCA+IDEgJiYgIWl0ZW1zLmV2ZXJ5KHMgPT4gcy5pc1Jvb3QpID8gZ2V0RmlsZU5hbWVzTWVzc2FnZShpdGVtcy5tYXAoaSA9PiBpLnJlc291cmNlKSkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbiA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0ZGV0YWlsLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZG9Ob3RBc2tBZ2FpbicsIFwiRG8gbm90IGFzayBtZSBhZ2FpblwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21vdmVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk1vdmVcIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmb3IgY29uZmlybWF0aW9uIGNoZWNrYm94XG5cdFx0XHRpZiAoY29uZmlybWF0aW9uLmNoZWNrYm94Q2hlY2tlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEZpbGVEcmFnQW5kRHJvcC5DT05GSVJNX0RORF9TRVRUSU5HX0tFWSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZG9IYW5kbGVSb290RHJvcChpdGVtcy5maWx0ZXIocyA9PiBzLmlzUm9vdCksIHRhcmdldCwgdGFyZ2V0U2VjdG9yKTtcblxuXHRcdGNvbnN0IHNvdXJjZXMgPSBpdGVtcy5maWx0ZXIocyA9PiAhcy5pc1Jvb3QpO1xuXHRcdGlmIChpc0NvcHkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvSGFuZGxlRXhwbG9yZXJEcm9wT25Db3B5KHNvdXJjZXMsIHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9IYW5kbGVFeHBsb3JlckRyb3BPbk1vdmUoc291cmNlcywgdGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9IYW5kbGVSb290RHJvcChyb290czogRXhwbG9yZXJJdGVtW10sIHRhcmdldDogRXhwbG9yZXJJdGVtLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHJvb3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0bGV0IHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc291cmNlSW5kaWNlczogbnVtYmVyW10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDcmVhdGlvbkRhdGE6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSA9IFtdO1xuXHRcdGNvbnN0IHJvb3RzVG9Nb3ZlOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10gPSBbXTtcblxuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBmb2xkZXJzLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdFx0dXJpOiBmb2xkZXJzW2luZGV4XS51cmksXG5cdFx0XHRcdG5hbWU6IGZvbGRlcnNbaW5kZXhdLm5hbWVcblx0XHRcdH07XG5cblx0XHRcdC8vIElzIGN1cnJlbnQgdGFyZ2V0XG5cdFx0XHRpZiAodGFyZ2V0IGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGZvbGRlcnNbaW5kZXhdLnVyaSwgdGFyZ2V0LnJlc291cmNlKSkge1xuXHRcdFx0XHR0YXJnZXRJbmRleCA9IGluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJcyBjdXJyZW50IHNvdXJjZVxuXHRcdFx0Zm9yIChjb25zdCByb290IG9mIHJvb3RzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2xkZXJzW2luZGV4XS51cmksIHJvb3QucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0c291cmNlSW5kaWNlcy5wdXNoKGluZGV4KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAocm9vdHMuZXZlcnkociA9PiByLnJlc291cmNlLnRvU3RyaW5nKCkgIT09IGZvbGRlcnNbaW5kZXhdLnVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHR3b3Jrc3BhY2VDcmVhdGlvbkRhdGEucHVzaChkYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJvb3RzVG9Nb3ZlLnB1c2goZGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXJnZXRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0YXJnZXRJbmRleCA9IHdvcmtzcGFjZUNyZWF0aW9uRGF0YS5sZW5ndGg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAodGFyZ2V0U2VjdG9yKSB7XG5cdFx0XHRcdGNhc2UgTGlzdFZpZXdUYXJnZXRTZWN0b3IuQk9UVE9NOlxuXHRcdFx0XHRjYXNlIExpc3RWaWV3VGFyZ2V0U2VjdG9yLkNFTlRFUl9CT1RUT006XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXgrKztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdC8vIEFkanVzdCB0YXJnZXQgaW5kZXggaWYgc291cmNlIHdhcyBsb2NhdGVkIGJlZm9yZSB0YXJnZXQuXG5cdFx0XHQvLyBUaGUgbW92ZSB3aWxsIGNhdXNlIHRoZSBpbmRleCB0byBjaGFuZ2Vcblx0XHRcdGZvciAoY29uc3Qgc291cmNlSW5kZXggb2Ygc291cmNlSW5kaWNlcykge1xuXHRcdFx0XHRpZiAoc291cmNlSW5kZXggPCB0YXJnZXRJbmRleCkge1xuXHRcdFx0XHRcdHRhcmdldEluZGV4LS07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR3b3Jrc3BhY2VDcmVhdGlvbkRhdGEuc3BsaWNlKHRhcmdldEluZGV4LCAwLCAuLi5yb290c1RvTW92ZSk7XG5cblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VFZGl0aW5nU2VydmljZS51cGRhdGVGb2xkZXJzKDAsIHdvcmtzcGFjZUNyZWF0aW9uRGF0YS5sZW5ndGgsIHdvcmtzcGFjZUNyZWF0aW9uRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSGFuZGxlRXhwbG9yZXJEcm9wT25Db3B5KHNvdXJjZXM6IEV4cGxvcmVySXRlbVtdLCB0YXJnZXQ6IEV4cGxvcmVySXRlbSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gUmV1c2UgZHVwbGljYXRlIGFjdGlvbiB3aGVuIHVzZXIgY29waWVzXG5cdFx0Y29uc3QgZXhwbG9yZXJDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2VGaWxlRWRpdHM6IFJlc291cmNlRmlsZUVkaXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyByZXNvdXJjZSwgaXNEaXJlY3RvcnkgfSBvZiBzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCBhbGxvd092ZXJ3cml0ZSA9IGV4cGxvcmVyQ29uZmlnLmluY3JlbWVudGFsTmFtaW5nID09PSAnZGlzYWJsZWQnO1xuXHRcdFx0Y29uc3QgbmV3UmVzb3VyY2UgPSBhd2FpdCBmaW5kVmFsaWRQYXN0ZUZpbGVUYXJnZXQodGhpcy5leHBsb3JlclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZmlsZVNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZGlhbG9nU2VydmljZSxcblx0XHRcdFx0dGFyZ2V0LFxuXHRcdFx0XHR7IHJlc291cmNlLCBpc0RpcmVjdG9yeSwgYWxsb3dPdmVyd3JpdGUgfSxcblx0XHRcdFx0ZXhwbG9yZXJDb25maWcuaW5jcmVtZW50YWxOYW1pbmdcblx0XHRcdCk7XG5cdFx0XHRpZiAoIW5ld1Jlc291cmNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb3VyY2VFZGl0ID0gbmV3IFJlc291cmNlRmlsZUVkaXQocmVzb3VyY2UsIG5ld1Jlc291cmNlLCB7IGNvcHk6IHRydWUsIG92ZXJ3cml0ZTogYWxsb3dPdmVyd3JpdGUgfSk7XG5cdFx0XHRyZXNvdXJjZUZpbGVFZGl0cy5wdXNoKHJlc291cmNlRWRpdCk7XG5cdFx0fVxuXHRcdGNvbnN0IGxhYmVsU3VmZml4ID0gZ2V0RmlsZU9yRm9sZGVyTGFiZWxTdWZmaXgoc291cmNlcyk7XG5cdFx0YXdhaXQgdGhpcy5leHBsb3JlclNlcnZpY2UuYXBwbHlCdWxrRWRpdChyZXNvdXJjZUZpbGVFZGl0cywge1xuXHRcdFx0Y29uZmlybUJlZm9yZVVuZG86IGV4cGxvcmVyQ29uZmlnLmNvbmZpcm1VbmRvID09PSBVbmRvQ29uZmlybUxldmVsLkRlZmF1bHQgfHwgZXhwbG9yZXJDb25maWcuY29uZmlybVVuZG8gPT09IFVuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSxcblx0XHRcdHVuZG9MYWJlbDogbG9jYWxpemUoJ2NvcHknLCBcIkNvcHkgezB9XCIsIGxhYmVsU3VmZml4KSxcblx0XHRcdHByb2dyZXNzTGFiZWw6IGxvY2FsaXplKCdjb3B5aW5nJywgXCJDb3B5aW5nIHswfVwiLCBsYWJlbFN1ZmZpeCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlZGl0b3JzID0gcmVzb3VyY2VGaWxlRWRpdHMuZmlsdGVyKGVkaXQgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGVkaXQubmV3UmVzb3VyY2UgPyB0aGlzLmV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdChlZGl0Lm5ld1Jlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBpdGVtICYmICFpdGVtLmlzRGlyZWN0b3J5O1xuXHRcdH0pLm1hcChlZGl0ID0+ICh7IHJlc291cmNlOiBlZGl0Lm5ld1Jlc291cmNlLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9IH0pKTtcblxuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhlZGl0b3JzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9IYW5kbGVFeHBsb3JlckRyb3BPbk1vdmUoc291cmNlczogRXhwbG9yZXJJdGVtW10sIHRhcmdldDogRXhwbG9yZXJJdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBEbyBub3QgYWxsb3cgbW92aW5nIHJlYWRvbmx5IGl0ZW1zXG5cdFx0Y29uc3QgcmVzb3VyY2VGaWxlRWRpdHMgPSBzb3VyY2VzLmZpbHRlcihzb3VyY2UgPT4gIXNvdXJjZS5pc1JlYWRvbmx5KS5tYXAoc291cmNlID0+IG5ldyBSZXNvdXJjZUZpbGVFZGl0KHNvdXJjZS5yZXNvdXJjZSwgam9pblBhdGgodGFyZ2V0LnJlc291cmNlLCBzb3VyY2UubmFtZSkpKTtcblx0XHRjb25zdCBsYWJlbFN1ZmZpeCA9IGdldEZpbGVPckZvbGRlckxhYmVsU3VmZml4KHNvdXJjZXMpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRjb25maXJtQmVmb3JlVW5kbzogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmNvbmZpcm1VbmRvID09PSBVbmRvQ29uZmlybUxldmVsLlZlcmJvc2UsXG5cdFx0XHR1bmRvTGFiZWw6IGxvY2FsaXplKCdtb3ZlJywgXCJNb3ZlIHswfVwiLCBsYWJlbFN1ZmZpeCksXG5cdFx0XHRwcm9ncmVzc0xhYmVsOiBsb2NhbGl6ZSgnbW92aW5nJywgXCJNb3ZpbmcgezB9XCIsIGxhYmVsU3VmZml4KVxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHBsb3JlclNlcnZpY2UuYXBwbHlCdWxrRWRpdChyZXNvdXJjZUZpbGVFZGl0cywgb3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gQ29uZmxpY3Rcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PVkVfQ09ORkxJQ1QpIHtcblxuXHRcdFx0XHRjb25zdCBvdmVyd3JpdGVzOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgcmVzb3VyY2VGaWxlRWRpdHMpIHtcblx0XHRcdFx0XHRpZiAoZWRpdC5uZXdSZXNvdXJjZSAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhlZGl0Lm5ld1Jlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0b3ZlcndyaXRlcy5wdXNoKGVkaXQubmV3UmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE1vdmUgd2l0aCBvdmVyd3JpdGUgaWYgdGhlIHVzZXIgY29uZmlybXNcblx0XHRcdFx0Y29uc3QgY29uZmlybSA9IGdldE11bHRpcGxlRmlsZXNPdmVyd3JpdGVDb25maXJtKG92ZXJ3cml0ZXMpO1xuXHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oY29uZmlybSk7XG5cdFx0XHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4cGxvcmVyU2VydmljZS5hcHBseUJ1bGtFZGl0KHJlc291cmNlRmlsZUVkaXRzLm1hcChyZSA9PiBuZXcgUmVzb3VyY2VGaWxlRWRpdChyZS5vbGRSZXNvdXJjZSwgcmUubmV3UmVzb3VyY2UsIHsgb3ZlcndyaXRlOiB0cnVlIH0pKSwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQW55IG90aGVyIGVycm9yOiBidWJibGUgdXBcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBnZXRTdGF0c0Zyb21EcmFnQW5kRHJvcERhdGEoZGF0YTogRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8RXhwbG9yZXJJdGVtLCBFeHBsb3Jlckl0ZW1bXT4sIGRyYWdTdGFydEV2ZW50PzogRHJhZ0V2ZW50KTogRXhwbG9yZXJJdGVtW10ge1xuXHRcdGlmIChkYXRhLmNvbnRleHQpIHtcblx0XHRcdHJldHVybiBkYXRhLmNvbnRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IGNvbXByZXNzZWQgZm9sZGVyIGRyYWdnaW5nXG5cdFx0aWYgKGRyYWdTdGFydEV2ZW50ICYmIGRhdGEuZWxlbWVudHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRkYXRhLmNvbnRleHQgPSBbRmlsZURyYWdBbmREcm9wLmdldENvbXByZXNzZWRTdGF0RnJvbURyYWdFdmVudChkYXRhLmVsZW1lbnRzWzBdLCBkcmFnU3RhcnRFdmVudCldO1xuXHRcdFx0cmV0dXJuIGRhdGEuY29udGV4dDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGF0YS5lbGVtZW50cztcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldENvbXByZXNzZWRTdGF0RnJvbURyYWdFdmVudChzdGF0OiBFeHBsb3Jlckl0ZW0sIGRyYWdFdmVudDogRHJhZ0V2ZW50KTogRXhwbG9yZXJJdGVtIHtcblx0XHRjb25zdCB0YXJnZXQgPSBET00uZ2V0V2luZG93KGRyYWdFdmVudCkuZG9jdW1lbnQuZWxlbWVudEZyb21Qb2ludChkcmFnRXZlbnQuY2xpZW50WCwgZHJhZ0V2ZW50LmNsaWVudFkpO1xuXHRcdGNvbnN0IGljb25MYWJlbE5hbWUgPSBnZXRJY29uTGFiZWxOYW1lRnJvbUhUTUxFbGVtZW50KHRhcmdldCk7XG5cblx0XHRpZiAoaWNvbkxhYmVsTmFtZSkge1xuXHRcdFx0Y29uc3QgeyBjb3VudCwgaW5kZXggfSA9IGljb25MYWJlbE5hbWU7XG5cblx0XHRcdGxldCBpID0gY291bnQgLSAxO1xuXHRcdFx0d2hpbGUgKGkgPiBpbmRleCAmJiBzdGF0LnBhcmVudCkge1xuXHRcdFx0XHRzdGF0ID0gc3RhdC5wYXJlbnQ7XG5cdFx0XHRcdGktLTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHN0YXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXQ7XG5cdH1cblxuXHRvbkRyYWdFbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wcmVzc2VkRHJvcFRhcmdldERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXByZXNzZWREcm9wVGFyZ2V0RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0SWNvbkxhYmVsTmFtZUZyb21IVE1MRWxlbWVudCh0YXJnZXQ6IEhUTUxFbGVtZW50IHwgRXZlbnRUYXJnZXQgfCBFbGVtZW50IHwgbnVsbCk6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGNvdW50OiBudW1iZXI7IGluZGV4OiBudW1iZXIgfSB8IG51bGwge1xuXHRpZiAoIShET00uaXNIVE1MRWxlbWVudCh0YXJnZXQpKSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0bGV0IGVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IHRhcmdldDtcblxuXHR3aGlsZSAoZWxlbWVudCAmJiAhZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1saXN0LXJvdycpKSB7XG5cdFx0aWYgKGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdsYWJlbC1uYW1lJykgJiYgZWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2RhdGEtaWNvbi1sYWJlbC1jb3VudCcpKSB7XG5cdFx0XHRjb25zdCBjb3VudCA9IE51bWJlcihlbGVtZW50LmdldEF0dHJpYnV0ZSgnZGF0YS1pY29uLWxhYmVsLWNvdW50JykpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBOdW1iZXIoZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtaWNvbi1sYWJlbC1pbmRleCcpKTtcblxuXHRcdFx0aWYgKGlzTnVtYmVyKGNvdW50KSAmJiBpc051bWJlcihpbmRleCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgZWxlbWVudDogZWxlbWVudCwgY291bnQsIGluZGV4IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDb21wcmVzc2VkRm9sZGVyTmFtZSh0YXJnZXQ6IEhUTUxFbGVtZW50IHwgRXZlbnRUYXJnZXQgfCBFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFnZXRJY29uTGFiZWxOYW1lRnJvbUhUTUxFbGVtZW50KHRhcmdldCk7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHBsb3JlckNvbXByZXNzaW9uRGVsZWdhdGUgaW1wbGVtZW50cyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8RXhwbG9yZXJJdGVtPiB7XG5cblx0aXNJbmNvbXByZXNzaWJsZShzdGF0OiBFeHBsb3Jlckl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc3RhdC5pc1Jvb3QgfHwgIXN0YXQuaXNEaXJlY3RvcnkgfHwgc3RhdCBpbnN0YW5jZW9mIE5ld0V4cGxvcmVySXRlbSB8fCAoIXN0YXQucGFyZW50IHx8IHN0YXQucGFyZW50LmlzUm9vdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RmlsZU9yRm9sZGVyTGFiZWxTdWZmaXgoaXRlbXM6IEV4cGxvcmVySXRlbVtdKTogc3RyaW5nIHtcblx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdHJldHVybiBpdGVtc1swXS5uYW1lO1xuXHR9XG5cblx0aWYgKGl0ZW1zLmV2ZXJ5KGkgPT4gaS5pc0RpcmVjdG9yeSkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ251bWJlck9mRm9sZGVycycsIFwiezB9IGZvbGRlcnNcIiwgaXRlbXMubGVuZ3RoKTtcblx0fVxuXHRpZiAoaXRlbXMuZXZlcnkoaSA9PiAhaS5pc0RpcmVjdG9yeSkpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ251bWJlck9mRmlsZXMnLCBcInswfSBmaWxlc1wiLCBpdGVtcy5sZW5ndGgpO1xuXHR9XG5cblx0cmV0dXJuIGAke2l0ZW1zLmxlbmd0aH0gZmlsZXMgYW5kIGZvbGRlcnNgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxVQUFVO0FBQ3RCLFNBQStCLDRCQUE0Qiw4QkFBOEI7QUFDekYsU0FBUyxrQkFBa0Isd0JBQXlCO0FBQ3BELFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGNBQWMsVUFBOEIscUJBQXFCLGdCQUFnQixzQ0FBc0M7QUFDaEksU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0IsMEJBQTBCLHNCQUFzQjtBQUMvRSxTQUFzQixZQUFZLFNBQVMsY0FBYyx1QkFBdUI7QUFDaEYsU0FBUyxlQUFlO0FBRXhCLFNBQWlDLGdCQUF3RiwwQkFBMEI7QUFDbkosU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNB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QWEsdUJBQXVCLENBQUM7QUFFbEUsVUFBSSxTQUFTLEtBQUssS0FBSyxTQUFTLEtBQUssR0FBRztBQUN2QyxlQUFPLEVBQUUsU0FBa0IsT0FBTyxNQUFNO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBRUEsY0FBVSxRQUFRO0FBQUEsRUFDbkI7QUFFQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLHVCQUF1QixRQUE2RDtBQUNuRyxTQUFPLENBQUMsQ0FBQyxnQ0FBZ0MsTUFBTTtBQUNoRDtBQUVPLE1BQU0sNEJBQThFO0FBQUEsRUFFMUYsaUJBQWlCLE1BQTZCO0FBQzdDLFdBQU8sS0FBSyxVQUFVLENBQUMsS0FBSyxlQUFlLGdCQUFnQixvQkFBb0IsQ0FBQyxLQUFLLFVBQVUsS0FBSyxPQUFPO0FBQUEsRUFDNUc7QUFDRDtBQUVBLFNBQVMsMkJBQTJCLE9BQStCO0FBQ2xFLE1BQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsV0FBTyxNQUFNLENBQUMsRUFBRTtBQUFBLEVBQ2pCO0FBRUEsTUFBSSxNQUFNLE1BQU0sT0FBSyxFQUFFLFdBQVcsR0FBRztBQUNwQyxXQUFPLFNBQVMsbUJBQW1CLGVBQWUsTUFBTSxNQUFNO0FBQUEsRUFDL0Q7QUFDQSxNQUFJLE1BQU0sTUFBTSxPQUFLLENBQUMsRUFBRSxXQUFXLEdBQUc7QUFDckMsV0FBTyxTQUFTLGlCQUFpQixhQUFhLE1BQU0sTUFBTTtBQUFBLEVBQzNEO0FBRUEsU0FBTyxHQUFHLE1BQU0sTUFBTTtBQUN2QjsiLAogICJuYW1lcyI6IFsiY2hpbGRyZW4iLCAiaGl0TWF4UmVzdWx0cyIsICJub2RlQ29udHJvbGxlcnMiLCAidmFsdWUiXQp9Cg==
