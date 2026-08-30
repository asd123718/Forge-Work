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
import * as nls from "../../../../../nls.js";
import * as perf from "../../../../../base/common/performance.js";
import { memoize } from "../../../../../base/common/decorators.js";
import { ExplorerFolderContext, FilesExplorerFocusedContext, ExplorerFocusedContext, ExplorerRootContext, ExplorerResourceReadonlyContext, ExplorerResourceCut, ExplorerResourceMoveableToTrash, ExplorerCompressedFocusContext, ExplorerCompressedFirstFocusContext, ExplorerCompressedLastFocusContext, ExplorerResourceAvailableEditorIdsContext, VIEW_ID, ExplorerResourceWritableContext, ViewHasSomeCollapsibleRootItemContext, FoldersViewVisibleContext, ExplorerResourceParentReadOnlyContext, ExplorerFindProviderActive } from "../../common/files.js";
import { FileCopiedContext, NEW_FILE_COMMAND_ID, NEW_FOLDER_COMMAND_ID } from "../fileActions.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ResourceContextKey } from "../../../../common/contextkeys.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../../platform/list/browser/listService.js";
import { DelayedDragHandler } from "../../../../../base/browser/dnd.js";
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from "../../../../services/editor/common/editorService.js";
import { ViewPane } from "../../../../browser/parts/views/viewPane.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ExplorerDelegate, ExplorerDataSource, FilesRenderer, FilesFilter, FileSorter, FileDragAndDrop, ExplorerCompressionDelegate, isCompressedFolderName, ExplorerFindProvider } from "./explorerViewer.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TreeVisibility } from "../../../../../base/browser/ui/tree/tree.js";
import { MenuId, Action2, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ExplorerItem, NewExplorerItem } from "../../common/explorerModel.js";
import { ResourceLabels } from "../../../../browser/labels.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IFileService, FileSystemProviderCapabilities } from "../../../../../platform/files/common/files.js";
import { Event } from "../../../../../base/common/event.js";
import { IViewDescriptorService } from "../../../../common/views.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../../common/editor.js";
import { IExplorerService } from "../files.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IEditorResolverService } from "../../../../services/editor/common/editorResolverService.js";
import { EditorOpenSource } from "../../../../../platform/editor/common/editor.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { AbstractTreePart } from "../../../../../base/browser/ui/tree/abstractTree.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
function hasExpandedRootChild(tree, treeInput) {
  for (const folder of treeInput) {
    if (tree.hasNode(folder) && !tree.isCollapsed(folder)) {
      for (const [, child] of folder.children.entries()) {
        if (tree.hasNode(child) && tree.isCollapsible(child) && !tree.isCollapsed(child)) {
          return true;
        }
      }
    }
  }
  return false;
}
function hasExpandedNode(tree, treeInput) {
  for (const folder of treeInput) {
    if (tree.hasNode(folder) && !tree.isCollapsed(folder)) {
      return true;
    }
  }
  return false;
}
const identityProvider = {
  getId: (stat) => {
    if (stat instanceof NewExplorerItem) {
      return `new:${stat.getId()}`;
    }
    return stat.getId();
  }
};
function getContext(focus, selection, respectMultiSelection, compressedNavigationControllerProvider) {
  let focusedStat;
  focusedStat = focus.length ? focus[0] : void 0;
  if (respectMultiSelection && selection.length > 1) {
    focusedStat = void 0;
  }
  const compressedNavigationControllers = focusedStat && compressedNavigationControllerProvider.getCompressedNavigationController(focusedStat);
  const compressedNavigationController = compressedNavigationControllers?.length ? compressedNavigationControllers[0] : void 0;
  focusedStat = compressedNavigationController ? compressedNavigationController.current : focusedStat;
  const selectedStats = [];
  for (const stat of selection) {
    const controllers = compressedNavigationControllerProvider.getCompressedNavigationController(stat);
    const controller = controllers?.at(0);
    if (controller && focusedStat && controller === compressedNavigationController) {
      if (stat === focusedStat) {
        selectedStats.push(stat);
      }
      continue;
    }
    if (controller) {
      selectedStats.push(...controller.items);
    } else {
      selectedStats.push(stat);
    }
  }
  if (!focusedStat) {
    if (respectMultiSelection) {
      return selectedStats;
    } else {
      return [];
    }
  }
  if (respectMultiSelection && selectedStats.indexOf(focusedStat) >= 0) {
    return selectedStats;
  }
  return [focusedStat];
}
let ExplorerView = class extends ViewPane {
  constructor(options, contextMenuService, viewDescriptorService, instantiationService, contextService, progressService, editorService, editorResolverService, layoutService, keybindingService, contextKeyService, configurationService, labelService, themeService, telemetryService, hoverService, explorerService, storageService, clipboardService, fileService, uriIdentityService, commandService, openerService, accessibilityService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.contextService = contextService;
    this.progressService = progressService;
    this.editorService = editorService;
    this.editorResolverService = editorResolverService;
    this.layoutService = layoutService;
    this.labelService = labelService;
    this.telemetryService = telemetryService;
    this.explorerService = explorerService;
    this.storageService = storageService;
    this.clipboardService = clipboardService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.commandService = commandService;
    this.accessibilityService = accessibilityService;
    this._autoReveal = false;
    this.delegate = options.delegate;
    this.resourceContext = instantiationService.createInstance(ResourceContextKey);
    this._register(this.resourceContext);
    this.parentReadonlyContext = ExplorerResourceParentReadOnlyContext.bindTo(contextKeyService);
    this.folderContext = ExplorerFolderContext.bindTo(contextKeyService);
    this.readonlyContext = ExplorerResourceReadonlyContext.bindTo(contextKeyService);
    this.availableEditorIdsContext = ExplorerResourceAvailableEditorIdsContext.bindTo(contextKeyService);
    this.rootContext = ExplorerRootContext.bindTo(contextKeyService);
    this.resourceMoveableToTrash = ExplorerResourceMoveableToTrash.bindTo(contextKeyService);
    this.compressedFocusContext = ExplorerCompressedFocusContext.bindTo(contextKeyService);
    this.compressedFocusFirstContext = ExplorerCompressedFirstFocusContext.bindTo(contextKeyService);
    this.compressedFocusLastContext = ExplorerCompressedLastFocusContext.bindTo(contextKeyService);
    this.viewHasSomeCollapsibleRootItem = ViewHasSomeCollapsibleRootItemContext.bindTo(contextKeyService);
    this.viewVisibleContextKey = FoldersViewVisibleContext.bindTo(contextKeyService);
    this.explorerService.registerView(this);
  }
  get singleViewPaneContainerTitle() {
    return this.name;
  }
  get autoReveal() {
    return this._autoReveal;
  }
  set autoReveal(autoReveal) {
    this._autoReveal = autoReveal;
  }
  get name() {
    return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
  }
  get title() {
    return this.name;
  }
  set title(_) {
  }
  setVisible(visible) {
    this.viewVisibleContextKey.set(visible);
    super.setVisible(visible);
  }
  get fileCopiedContextKey() {
    return FileCopiedContext.bindTo(this.contextKeyService);
  }
  get resourceCutContextKey() {
    return ExplorerResourceCut.bindTo(this.contextKeyService);
  }
  // Split view methods
  renderHeader(container) {
    super.renderHeader(container);
    this.dragHandler = new DelayedDragHandler(container, () => this.setExpanded(true));
    const titleElement = container.querySelector(".title");
    const setHeader = () => {
      titleElement.textContent = this.name;
      this.updateTitle(this.name);
      this.ariaHeaderLabel = nls.localize("explorerSection", "Explorer Section: {0}", this.name);
      titleElement.setAttribute("aria-label", this.ariaHeaderLabel);
    };
    this._register(this.contextService.onDidChangeWorkspaceName(setHeader));
    this._register(this.labelService.onDidChangeFormatters(setHeader));
    setHeader();
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  renderBody(container) {
    super.renderBody(container);
    this.container = container;
    this.treeContainer = DOM.append(container, DOM.$(".explorer-folders-view"));
    this.createTree(this.treeContainer);
    this._register(this.labelService.onDidChangeFormatters(() => {
      this._onDidChangeTitleArea.fire();
    }));
    this.onConfigurationUpdated(void 0);
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this.selectActiveFile();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.onDidChangeBodyVisibility(async (visible) => {
      if (visible) {
        await this.setTreeInput();
        this.updateAnyCollapsedContext();
        this.selectActiveFile(true);
      }
    }));
    this._register(DOM.addDisposableListener(DOM.getWindow(this.container), DOM.EventType.PASTE, async (event) => {
      if (!this.hasFocus() || this.readonlyContext.get()) {
        return;
      }
      if (event.clipboardData?.files?.length) {
        await this.commandService.executeCommand("filesExplorer.paste", event.clipboardData?.files);
      }
    }));
  }
  focus() {
    super.focus();
    this.tree.domFocus();
    if (this.tree.getFocusedPart() === AbstractTreePart.Tree) {
      const focused = this.tree.getFocus();
      if (focused.length === 1 && this._autoReveal) {
        this.tree.reveal(focused[0], 0.5);
      }
    }
  }
  hasFocus() {
    return DOM.isAncestorOfActiveElement(this.container);
  }
  getFocus() {
    return this.tree.getFocus();
  }
  focusNext() {
    this.tree.focusNext();
  }
  focusLast() {
    this.tree.focusLast();
  }
  getContext(respectMultiSelection) {
    const focusedItems = this.tree.getFocusedPart() === AbstractTreePart.StickyScroll ? this.tree.getStickyScrollFocus() : this.tree.getFocus();
    return getContext(focusedItems, this.tree.getSelection(), respectMultiSelection, this.renderer);
  }
  isItemVisible(item) {
    if (!this.filter) {
      return false;
    }
    return this.filter.filter(item, TreeVisibility.Visible);
  }
  isItemCollapsed(item) {
    return this.tree.isCollapsed(item);
  }
  async setEditable(stat, isEditing) {
    if (isEditing) {
      this.horizontalScrolling = this.tree.options.horizontalScrolling;
      if (this.horizontalScrolling) {
        this.tree.updateOptions({ horizontalScrolling: false });
      }
      await this.tree.expand(stat.parent);
    } else {
      if (this.horizontalScrolling !== void 0) {
        this.tree.updateOptions({ horizontalScrolling: this.horizontalScrolling });
      }
      this.horizontalScrolling = void 0;
      this.treeContainer.classList.remove("highlight");
    }
    await this.refresh(false, stat.parent, false);
    if (isEditing) {
      this.treeContainer.classList.add("highlight");
      this.tree.reveal(stat);
    } else {
      this.tree.domFocus();
    }
  }
  async selectActiveFile(reveal = this._autoReveal) {
    if (this._autoReveal) {
      const activeFile = EditorResourceAccessor.getCanonicalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
      if (activeFile) {
        const focus = this.tree.getFocus();
        const selection = this.tree.getSelection();
        if (focus.length === 1 && this.uriIdentityService.extUri.isEqual(focus[0].resource, activeFile) && selection.length === 1 && this.uriIdentityService.extUri.isEqual(selection[0].resource, activeFile)) {
          return;
        }
        return this.explorerService.select(activeFile, reveal);
      }
    }
  }
  createTree(container) {
    this.filter = this.instantiationService.createInstance(FilesFilter);
    this._register(this.filter);
    this._register(this.filter.onDidChange(() => this.refresh(true)));
    const explorerLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this._register(explorerLabels);
    this.findProvider = this.instantiationService.createInstance(ExplorerFindProvider, this.filter, () => this.tree);
    const updateWidth = (stat) => this.tree.updateWidth(stat);
    this.renderer = this.instantiationService.createInstance(FilesRenderer, container, explorerLabels, this.findProvider.highlightTree, updateWidth);
    this._register(this.renderer);
    this._register(createFileIconThemableTreeContainerScope(container, this.themeService));
    const isCompressionEnabled = () => {
      const configValue = this.configurationService.getValue("explorer.compactFolders");
      if (this.accessibilityService.isScreenReaderOptimized()) {
        return false;
      }
      return configValue;
    };
    const getFileNestingSettings = (item) => this.configurationService.getValue({ resource: item?.root.resource }).explorer.fileNesting;
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "FileExplorer",
      container,
      new ExplorerDelegate(),
      new ExplorerCompressionDelegate(),
      [this.renderer],
      this.instantiationService.createInstance(ExplorerDataSource, this.filter, this.findProvider),
      {
        compressionEnabled: isCompressionEnabled(),
        accessibilityProvider: this.renderer,
        identityProvider,
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (stat) => {
            if (this.explorerService.isEditable(stat)) {
              return void 0;
            }
            return stat.name;
          },
          getCompressedNodeKeyboardNavigationLabel: (stats) => {
            if (stats.some((stat) => this.explorerService.isEditable(stat))) {
              return void 0;
            }
            return stats.map((stat) => stat.name).join("/");
          }
        },
        multipleSelectionSupport: true,
        filter: this.filter,
        sorter: this.instantiationService.createInstance(FileSorter),
        dnd: this.instantiationService.createInstance(FileDragAndDrop, (item) => this.isItemCollapsed(item)),
        collapseByDefault: (e) => {
          if (e instanceof ExplorerItem) {
            if (e.hasNests && getFileNestingSettings(e).expand) {
              return false;
            }
            if (this.findProvider.isShowingFilterResults()) {
              return false;
            }
          }
          return true;
        },
        autoExpandSingleChildren: true,
        expandOnlyOnTwistieClick: (e) => {
          if (e instanceof ExplorerItem) {
            if (e.hasNests) {
              return true;
            } else if (this.configurationService.getValue("workbench.tree.expandMode") === "doubleClick") {
              return true;
            }
          }
          return false;
        },
        paddingBottom: ExplorerDelegate.ITEM_HEIGHT,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        findProvider: this.findProvider
      }
    );
    this._register(this.tree);
    this._register(this.themeService.onDidColorThemeChange(() => this.tree.rerender()));
    const onDidChangeCompressionConfiguration = Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("explorer.compactFolders"));
    this._register(onDidChangeCompressionConfiguration((_) => this.tree.updateOptions({ compressionEnabled: isCompressionEnabled() })));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => {
      this.tree.updateOptions({ compressionEnabled: isCompressionEnabled() });
    }));
    FilesExplorerFocusedContext.bindTo(this.tree.contextKeyService);
    ExplorerFocusedContext.bindTo(this.tree.contextKeyService);
    this._register(this.tree.onDidChangeFocus((e) => this.onFocusChanged(e.elements)));
    this.onFocusChanged([]);
    this._register(this.tree.onDidOpen(async (e) => {
      const element = e.element;
      if (!element) {
        return;
      }
      const shiftDown = DOM.isKeyboardEvent(e.browserEvent) && e.browserEvent.shiftKey;
      if (!shiftDown) {
        if (element.isDirectory || this.explorerService.isEditable(void 0)) {
          return;
        }
        this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.files.openFile", from: "explorer" });
        try {
          this.delegate?.willOpenElement(e.browserEvent);
          await this.editorService.openEditor({ resource: element.resource, options: { preserveFocus: e.editorOptions.preserveFocus, pinned: e.editorOptions.pinned, source: EditorOpenSource.USER } }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
        } finally {
          this.delegate?.didOpenElement();
        }
      }
    }));
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.tree.onDidScroll(async (e) => {
      const editable = this.explorerService.getEditable();
      if (e.scrollTopChanged && editable && this.tryGetRelativeTop(editable.stat) === null) {
        await editable.data.onFinish("", false);
      }
    }));
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const element = e.node.element?.element;
      if (element) {
        const navigationControllers = this.renderer.getCompressedNavigationController(Array.isArray(element) ? element[0] : element);
        navigationControllers?.forEach((controller) => controller.updateCollapsed(e.node.collapsed));
      }
      this.updateAnyCollapsedContext();
    }));
    this.updateAnyCollapsedContext();
    this._register(this.tree.onMouseDblClick((e) => {
      const scrollingByPage = this.configurationService.getValue("workbench.list.scrollByPage");
      if (e.element === null && !scrollingByPage) {
        this.commandService.executeCommand(NEW_FILE_COMMAND_ID);
      }
    }));
    this._register(this.storageService.onWillSaveState(() => {
      this.storeTreeViewState();
    }));
  }
  // React on events
  onConfigurationUpdated(event) {
    if (!event || event.affectsConfiguration("explorer.autoReveal")) {
      const configuration = this.configurationService.getValue();
      this._autoReveal = configuration?.explorer?.autoReveal;
    }
    if (event && (event.affectsConfiguration("explorer.decorations.colors") || event.affectsConfiguration("explorer.decorations.badges"))) {
      this.refresh(true);
    }
  }
  storeTreeViewState() {
    this.storageService.store(ExplorerView.TREE_VIEW_STATE_STORAGE_KEY, JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  setContextKeys(stat) {
    const folders = this.contextService.getWorkspace().folders;
    const resource = stat ? stat.resource : folders[folders.length - 1].uri;
    stat = stat || this.explorerService.findClosest(resource);
    this.resourceContext.set(resource);
    this.folderContext.set(!!stat && stat.isDirectory);
    this.readonlyContext.set(!!stat && !!stat.isReadonly);
    this.parentReadonlyContext.set(Boolean(stat?.parent?.isReadonly));
    this.rootContext.set(!!stat && stat.isRoot);
    if (resource) {
      const overrides = resource ? this.editorResolverService.getEditors(resource).map((editor) => editor.id) : [];
      this.availableEditorIdsContext.set(overrides.join(","));
    } else {
      this.availableEditorIdsContext.reset();
    }
  }
  async onContextMenu(e) {
    if (DOM.isEditableElement(e.browserEvent.target)) {
      return;
    }
    const stat = e.element;
    let anchor = e.anchor;
    if (DOM.isHTMLElement(anchor)) {
      if (stat) {
        const controllers = this.renderer.getCompressedNavigationController(stat);
        if (controllers && controllers.length > 0) {
          if (DOM.isKeyboardEvent(e.browserEvent) || isCompressedFolderName(e.browserEvent.target)) {
            anchor = controllers[0].labels[controllers[0].index];
          } else {
            controllers.forEach((controller) => controller.last());
          }
        }
      }
    }
    this.fileCopiedContextKey.set(await this.clipboardService.hasResources());
    this.setContextKeys(stat);
    const selection = this.tree.getSelection();
    const roots = this.explorerService.roots;
    let arg;
    if (stat instanceof ExplorerItem) {
      const compressedControllers = this.renderer.getCompressedNavigationController(stat);
      arg = compressedControllers?.length ? compressedControllers[0].current.resource : stat.resource;
    } else {
      arg = roots.length === 1 ? roots[0].resource : {};
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.ExplorerContext,
      menuActionOptions: { arg, shouldForwardArgs: true },
      contextKeyService: this.tree.contextKeyService,
      getAnchor: () => anchor,
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.tree.domFocus();
        }
      },
      getActionsContext: () => stat && selection && selection.indexOf(stat) >= 0 ? selection.map((fs) => fs.resource) : stat instanceof ExplorerItem ? [stat.resource] : []
    });
  }
  onFocusChanged(elements) {
    const stat = elements.at(0);
    this.setContextKeys(stat);
    if (stat) {
      const enableTrash = Boolean(this.configurationService.getValue().files?.enableTrash);
      const hasCapability = this.fileService.hasCapability(stat.resource, FileSystemProviderCapabilities.Trash);
      this.resourceMoveableToTrash.set(enableTrash && hasCapability);
    } else {
      this.resourceMoveableToTrash.reset();
    }
    const compressedNavigationControllers = stat && this.renderer.getCompressedNavigationController(stat);
    if (!compressedNavigationControllers) {
      this.compressedFocusContext.set(false);
      return;
    }
    this.compressedFocusContext.set(true);
    compressedNavigationControllers.forEach((controller) => {
      this.updateCompressedNavigationContextKeys(controller);
    });
  }
  // General methods
  /**
   * Safely queries the file explorer tree for the relative top of an element.
   *
   * `hasNode()` and `getRelativeTop()` consult different internal maps in the
   * compressible async data tree. During an async refresh (e.g. when the
   * underlying file system provider changes, or file nesting settings update)
   * there is a microtask gap where one map has been updated but the other has
   * not. In that window `getRelativeTop()` can throw
   * `TreeError [FileExplorer] Tree element not found` (issue #188365) even
   * though the caller reasonably believed the element was still present.
   *
   * Treat such a failure as "not currently visible" so that callers fall back
   * to their not-visible branch (e.g. finishing editable state, or calling
   * `reveal()`), which is safe when the element is still in the data source
   * even if the view has not caught up yet.
   */
  tryGetRelativeTop(element) {
    if (!this.tree) {
      return null;
    }
    try {
      return this.tree.getRelativeTop(element);
    } catch {
      return null;
    }
  }
  /**
   * Refresh the contents of the explorer to get up to date data from the disk about the file structure.
   * If the item is passed we refresh only that level of the tree, otherwise we do a full refresh.
   */
  refresh(recursive, item, cancelEditing = true) {
    if (!this.tree || !this.isBodyVisible() || item && !this.tree.hasNode(item) || this.findProvider?.isShowingFilterResults() && recursive) {
      return Promise.resolve(void 0);
    }
    if (cancelEditing && this.explorerService.isEditable(void 0)) {
      this.tree.domFocus();
    }
    const toRefresh = item || this.tree.getInput();
    return this.tree.updateChildren(toRefresh, recursive, !!item);
  }
  getOptimalWidth() {
    const parentNode = this.tree.getHTMLElement();
    const childNodes = [].slice.call(parentNode.querySelectorAll(".explorer-item .label-name"));
    return DOM.getLargestChildWidth(parentNode, childNodes);
  }
  async setTreeInput() {
    if (!this.isBodyVisible()) {
      return Promise.resolve(void 0);
    }
    if (this.setTreeInputPromise) {
      await this.setTreeInputPromise;
    }
    const initialInputSetup = !this.tree.getInput();
    if (initialInputSetup) {
      perf.mark("code/willResolveExplorer");
    }
    const roots = this.explorerService.roots;
    let input = roots[0];
    if (this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER || roots[0].error) {
      input = roots;
    }
    let viewState;
    if (this.tree?.getInput()) {
      viewState = this.tree.getViewState();
    } else {
      const rawViewState = this.storageService.get(ExplorerView.TREE_VIEW_STATE_STORAGE_KEY, StorageScope.WORKSPACE);
      if (rawViewState) {
        viewState = JSON.parse(rawViewState);
      }
    }
    const previousInput = this.tree.getInput();
    const promise = this.setTreeInputPromise = this.tree.setInput(input, viewState).then(async () => {
      if (Array.isArray(input)) {
        if (!viewState || previousInput instanceof ExplorerItem) {
          for (let i = 0; i < Math.min(input.length, 5); i++) {
            try {
              await this.tree.expand(input[i]);
            } catch (e) {
            }
          }
        }
        if (!previousInput && input.length === 1 && this.configurationService.getValue().explorer.expandSingleFolderWorkspaces) {
          await this.tree.expand(input[0]).catch(() => {
          });
        }
        if (Array.isArray(previousInput)) {
          const previousRoots = new ResourceMap();
          previousInput.forEach((previousRoot) => previousRoots.set(previousRoot.resource, true));
          await Promise.all(input.map(async (item) => {
            if (!previousRoots.has(item.resource)) {
              try {
                await this.tree.expand(item);
              } catch (e) {
              }
            }
          }));
        }
      }
      if (initialInputSetup) {
        perf.mark("code/didResolveExplorer");
      }
    });
    this.progressService.withProgress({
      location: ProgressLocation.Explorer,
      delay: this.layoutService.isRestored() ? 800 : 1500
      // reduce progress visibility when still restoring
    }, (_progress) => promise);
    await promise;
  }
  async selectResource(resource, reveal = this._autoReveal, retry = 0) {
    if (retry === 2) {
      return;
    }
    if (!resource || !this.isBodyVisible()) {
      return;
    }
    if (this.setTreeInputPromise) {
      await this.setTreeInputPromise;
    }
    let item = this.explorerService.findClosestRoot(resource);
    while (item && item.resource.toString() !== resource.toString()) {
      try {
        await this.tree.expand(item);
      } catch (e) {
        return this.selectResource(resource, reveal, retry + 1);
      }
      if (!item.children.size) {
        item = null;
      } else {
        for (const child of item.children.values()) {
          if (this.uriIdentityService.extUri.isEqualOrParent(resource, child.resource)) {
            item = child;
            break;
          }
          item = null;
        }
      }
    }
    if (item) {
      if (item === this.tree.getInput()) {
        this.tree.setFocus([]);
        this.tree.setSelection([]);
        return;
      }
      try {
        if (item.nestedParent) {
          await this.tree.expand(item.nestedParent);
        }
        if ((reveal === true || reveal === "force") && this.tree.getRelativeTop(item) === null) {
          this.tree.reveal(item, 0.5);
        }
        this.tree.setFocus([item]);
        this.tree.setSelection([item]);
      } catch (e) {
        return this.selectResource(resource, reveal, retry + 1);
      }
    }
  }
  itemsCopied(stats, cut, previousCut) {
    this.fileCopiedContextKey.set(stats.length > 0);
    this.resourceCutContextKey.set(cut && stats.length > 0);
    previousCut?.forEach((item) => this.tree.rerender(item));
    if (cut) {
      stats.forEach((s) => this.tree.rerender(s));
    }
  }
  expandAll() {
    if (this.explorerService.isEditable(void 0)) {
      this.tree.domFocus();
    }
    this.tree.expandAll();
  }
  collapseAll() {
    if (this.explorerService.isEditable(void 0)) {
      this.tree.domFocus();
    }
    const treeInput = this.tree.getInput();
    if (Array.isArray(treeInput)) {
      if (hasExpandedRootChild(this.tree, treeInput)) {
        treeInput.forEach((folder) => {
          folder.children.forEach((child) => this.tree.hasNode(child) && this.tree.collapse(child, true));
        });
        return;
      }
    }
    this.tree.collapseAll();
  }
  previousCompressedStat() {
    const focused = this.tree.getFocus();
    if (!focused.length) {
      return;
    }
    const compressedNavigationControllers = this.renderer.getCompressedNavigationController(focused[0]);
    compressedNavigationControllers.forEach((controller) => {
      controller.previous();
      this.updateCompressedNavigationContextKeys(controller);
    });
  }
  nextCompressedStat() {
    const focused = this.tree.getFocus();
    if (!focused.length) {
      return;
    }
    const compressedNavigationControllers = this.renderer.getCompressedNavigationController(focused[0]);
    compressedNavigationControllers.forEach((controller) => {
      controller.next();
      this.updateCompressedNavigationContextKeys(controller);
    });
  }
  firstCompressedStat() {
    const focused = this.tree.getFocus();
    if (!focused.length) {
      return;
    }
    const compressedNavigationControllers = this.renderer.getCompressedNavigationController(focused[0]);
    compressedNavigationControllers.forEach((controller) => {
      controller.first();
      this.updateCompressedNavigationContextKeys(controller);
    });
  }
  lastCompressedStat() {
    const focused = this.tree.getFocus();
    if (!focused.length) {
      return;
    }
    const compressedNavigationControllers = this.renderer.getCompressedNavigationController(focused[0]);
    compressedNavigationControllers.forEach((controller) => {
      controller.last();
      this.updateCompressedNavigationContextKeys(controller);
    });
  }
  updateCompressedNavigationContextKeys(controller) {
    this.compressedFocusFirstContext.set(controller.index === 0);
    this.compressedFocusLastContext.set(controller.index === controller.count - 1);
  }
  updateAnyCollapsedContext() {
    const treeInput = this.tree.getInput();
    if (treeInput === void 0) {
      return;
    }
    const treeInputArray = Array.isArray(treeInput) ? treeInput : Array.from(treeInput.children.values());
    this.viewHasSomeCollapsibleRootItem.set(hasExpandedNode(this.tree, treeInputArray));
    this.storeTreeViewState();
  }
  hasPhantomElements() {
    return !!this.findProvider?.isShowingFilterResults();
  }
  dispose() {
    this.dragHandler?.dispose();
    super.dispose();
  }
};
ExplorerView.TREE_VIEW_STATE_STORAGE_KEY = "workbench.explorer.treeViewState";
__decorateClass([
  memoize
], ExplorerView.prototype, "fileCopiedContextKey", 1);
__decorateClass([
  memoize
], ExplorerView.prototype, "resourceCutContextKey", 1);
ExplorerView = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IProgressService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IEditorResolverService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, ITelemetryService),
  __decorateParam(15, IHoverService),
  __decorateParam(16, IExplorerService),
  __decorateParam(17, IStorageService),
  __decorateParam(18, IClipboardService),
  __decorateParam(19, IFileService),
  __decorateParam(20, IUriIdentityService),
  __decorateParam(21, ICommandService),
  __decorateParam(22, IOpenerService),
  __decorateParam(23, IAccessibilityService)
], ExplorerView);
function createFileIconThemableTreeContainerScope(container, themeService) {
  container.classList.add("file-icon-themable-tree");
  container.classList.add("show-file-icons");
  const onDidChangeFileIconTheme = (theme) => {
    container.classList.toggle("align-icons-and-twisties", theme.hasFileIcons && !theme.hasFolderIcons);
    container.classList.toggle("hide-arrows", theme.hidesExplorerArrows === true);
  };
  onDidChangeFileIconTheme(themeService.getFileIconTheme());
  return themeService.onDidFileIconThemeChange(onDidChangeFileIconTheme);
}
const CanCreateContext = ContextKeyExpr.or(
  // Folder: can create unless readonly
  ContextKeyExpr.and(ExplorerFolderContext, ExplorerResourceWritableContext),
  // File: can create unless parent is readonly
  ContextKeyExpr.and(ExplorerFolderContext.toNegated(), ExplorerResourceParentReadOnlyContext.toNegated())
);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.files.action.createFileFromExplorer",
      title: nls.localize("createNewFile", "New File..."),
      f1: false,
      icon: Codicon.newFile,
      precondition: CanCreateContext,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VIEW_ID),
        order: 10
      }
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    commandService.executeCommand(NEW_FILE_COMMAND_ID);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.files.action.createFolderFromExplorer",
      title: nls.localize("createNewFolder", "New Folder..."),
      f1: false,
      icon: Codicon.newFolder,
      precondition: CanCreateContext,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VIEW_ID),
        order: 20
      }
    });
  }
  run(accessor) {
    const commandService = accessor.get(ICommandService);
    commandService.executeCommand(NEW_FOLDER_COMMAND_ID);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.files.action.refreshFilesExplorer",
      title: nls.localize2("refreshExplorer", "Refresh Explorer"),
      f1: true,
      icon: Codicon.refresh,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VIEW_ID),
        order: 30
      },
      metadata: {
        description: nls.localize2("refreshExplorerMetadata", "Forces a refresh of the Explorer.")
      },
      precondition: ExplorerFindProviderActive.negate()
    });
  }
  async run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const explorerService = accessor.get(IExplorerService);
    await viewsService.openView(VIEW_ID);
    await explorerService.refresh();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.files.action.collapseExplorerFolders",
      title: nls.localize2("collapseExplorerFolders", "Collapse Folders in Explorer"),
      f1: true,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        group: "navigation",
        when: ContextKeyExpr.equals("view", VIEW_ID),
        order: 40
      },
      metadata: {
        description: nls.localize2("collapseExplorerFoldersMetadata", "Folds all folders in the Explorer.")
      }
    });
  }
  run(accessor) {
    const viewsService = accessor.get(IViewsService);
    const view = viewsService.getViewWithId(VIEW_ID);
    if (view !== null) {
      const explorerView = view;
      explorerView.collapseAll();
    }
  }
});
export {
  ExplorerView,
  createFileIconThemableTreeContainerScope,
  getContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFx2aWV3c1xcZXhwbG9yZXJWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcGVyZiBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uLCBFeHBsb3JlckZvbGRlckNvbnRleHQsIEZpbGVzRXhwbG9yZXJGb2N1c2VkQ29udGV4dCwgRXhwbG9yZXJGb2N1c2VkQ29udGV4dCwgRXhwbG9yZXJSb290Q29udGV4dCwgRXhwbG9yZXJSZXNvdXJjZVJlYWRvbmx5Q29udGV4dCwgRXhwbG9yZXJSZXNvdXJjZUN1dCwgRXhwbG9yZXJSZXNvdXJjZU1vdmVhYmxlVG9UcmFzaCwgRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LCBFeHBsb3JlckNvbXByZXNzZWRGaXJzdEZvY3VzQ29udGV4dCwgRXhwbG9yZXJDb21wcmVzc2VkTGFzdEZvY3VzQ29udGV4dCwgRXhwbG9yZXJSZXNvdXJjZUF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQsIFZJRVdfSUQsIEV4cGxvcmVyUmVzb3VyY2VXcml0YWJsZUNvbnRleHQsIFZpZXdIYXNTb21lQ29sbGFwc2libGVSb290SXRlbUNvbnRleHQsIEZvbGRlcnNWaWV3VmlzaWJsZUNvbnRleHQsIEV4cGxvcmVyUmVzb3VyY2VQYXJlbnRSZWFkT25seUNvbnRleHQsIEV4cGxvcmVyRmluZFByb3ZpZGVyQWN0aXZlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVDb3BpZWRDb250ZXh0LCBORVdfRklMRV9DT01NQU5EX0lELCBORVdfRk9MREVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi9maWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleSwgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERlbGF5ZWREcmFnSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAsIEFDVElWRV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld1BhbmVPcHRpb25zLCBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlckRlbGVnYXRlLCBFeHBsb3JlckRhdGFTb3VyY2UsIEZpbGVzUmVuZGVyZXIsIElDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIsIEZpbGVzRmlsdGVyLCBGaWxlU29ydGVyLCBGaWxlRHJhZ0FuZERyb3AsIEV4cGxvcmVyQ29tcHJlc3Npb25EZWxlZ2F0ZSwgaXNDb21wcmVzc2VkRm9sZGVyTmFtZSwgRXhwbG9yZXJGaW5kUHJvdmlkZXIgfSBmcm9tICcuL2V4cGxvcmVyVmlld2VyLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIElGaWxlSWNvblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJJdGVtLCBOZXdFeHBsb3Jlckl0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vZXhwbG9yZXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJTZXJ2aWNlLCBJRXhwbG9yZXJWaWV3IH0gZnJvbSAnLi4vZmlsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3BlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VHJlZVBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cblxuZnVuY3Rpb24gaGFzRXhwYW5kZWRSb290Q2hpbGQodHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxFeHBsb3Jlckl0ZW0gfCBFeHBsb3Jlckl0ZW1bXSwgRXhwbG9yZXJJdGVtLCBGdXp6eVNjb3JlPiwgdHJlZUlucHV0OiBFeHBsb3Jlckl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0cmVlSW5wdXQpIHtcblx0XHRpZiAodHJlZS5oYXNOb2RlKGZvbGRlcikgJiYgIXRyZWUuaXNDb2xsYXBzZWQoZm9sZGVyKSkge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgZm9sZGVyLmNoaWxkcmVuLmVudHJpZXMoKSkge1xuXHRcdFx0XHRpZiAodHJlZS5oYXNOb2RlKGNoaWxkKSAmJiB0cmVlLmlzQ29sbGFwc2libGUoY2hpbGQpICYmICF0cmVlLmlzQ29sbGFwc2VkKGNoaWxkKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIG9yIG5vdCBhbnkgb2YgdGhlIG5vZGVzIGluIHRoZSB0cmVlIGFyZSBleHBhbmRlZFxuICovXG5mdW5jdGlvbiBoYXNFeHBhbmRlZE5vZGUodHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxFeHBsb3Jlckl0ZW0gfCBFeHBsb3Jlckl0ZW1bXSwgRXhwbG9yZXJJdGVtLCBGdXp6eVNjb3JlPiwgdHJlZUlucHV0OiBFeHBsb3Jlckl0ZW1bXSk6IGJvb2xlYW4ge1xuXHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0cmVlSW5wdXQpIHtcblx0XHRpZiAodHJlZS5oYXNOb2RlKGZvbGRlcikgJiYgIXRyZWUuaXNDb2xsYXBzZWQoZm9sZGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuY29uc3QgaWRlbnRpdHlQcm92aWRlciA9IHtcblx0Z2V0SWQ6IChzdGF0OiBFeHBsb3Jlckl0ZW0pID0+IHtcblx0XHRpZiAoc3RhdCBpbnN0YW5jZW9mIE5ld0V4cGxvcmVySXRlbSkge1xuXHRcdFx0cmV0dXJuIGBuZXc6JHtzdGF0LmdldElkKCl9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdC5nZXRJZCgpO1xuXHR9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGV4dChmb2N1czogRXhwbG9yZXJJdGVtW10sIHNlbGVjdGlvbjogRXhwbG9yZXJJdGVtW10sIHJlc3BlY3RNdWx0aVNlbGVjdGlvbjogYm9vbGVhbixcblx0Y29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyUHJvdmlkZXI6IHsgZ2V0Q29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKHN0YXQ6IEV4cGxvcmVySXRlbSk6IElDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJbXSB8IHVuZGVmaW5lZCB9KTogRXhwbG9yZXJJdGVtW10ge1xuXG5cdGxldCBmb2N1c2VkU3RhdDogRXhwbG9yZXJJdGVtIHwgdW5kZWZpbmVkO1xuXHRmb2N1c2VkU3RhdCA9IGZvY3VzLmxlbmd0aCA/IGZvY3VzWzBdIDogdW5kZWZpbmVkO1xuXG5cdC8vIElmIHdlIGFyZSByZXNwZWN0aW5nIG11bHRpLXNlbGVjdCBhbmQgd2UgaGF2ZSBhIG11bHRpLXNlbGVjdGlvbiB3ZSBpZ25vcmUgZm9jdXMgYXMgd2Ugd2FudCB0byBhY3Qgb24gdGhlIHNlbGVjdGlvblxuXHRpZiAocmVzcGVjdE11bHRpU2VsZWN0aW9uICYmIHNlbGVjdGlvbi5sZW5ndGggPiAxKSB7XG5cdFx0Zm9jdXNlZFN0YXQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzID0gZm9jdXNlZFN0YXQgJiYgY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyUHJvdmlkZXIuZ2V0Q29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKGZvY3VzZWRTdGF0KTtcblx0Y29uc3QgY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyID0gY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycz8ubGVuZ3RoID8gY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyc1swXSA6IHVuZGVmaW5lZDtcblx0Zm9jdXNlZFN0YXQgPSBjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIgPyBjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIuY3VycmVudCA6IGZvY3VzZWRTdGF0O1xuXG5cdGNvbnN0IHNlbGVjdGVkU3RhdHM6IEV4cGxvcmVySXRlbVtdID0gW107XG5cblx0Zm9yIChjb25zdCBzdGF0IG9mIHNlbGVjdGlvbikge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJzID0gY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyUHJvdmlkZXIuZ2V0Q29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKHN0YXQpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjb250cm9sbGVycz8uYXQoMCk7XG5cdFx0aWYgKGNvbnRyb2xsZXIgJiYgZm9jdXNlZFN0YXQgJiYgY29udHJvbGxlciA9PT0gY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKSB7XG5cdFx0XHRpZiAoc3RhdCA9PT0gZm9jdXNlZFN0YXQpIHtcblx0XHRcdFx0c2VsZWN0ZWRTdGF0cy5wdXNoKHN0YXQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWdub3JlIHN0YXRzIHdoaWNoIGFyZSBzZWxlY3RlZCBidXQgYXJlIHBhcnQgb2YgdGhlIHNhbWUgY29tcGFjdCBub2RlIGFzIHRoZSBmb2N1c2VkIHN0YXRcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRzZWxlY3RlZFN0YXRzLnB1c2goLi4uY29udHJvbGxlci5pdGVtcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlbGVjdGVkU3RhdHMucHVzaChzdGF0KTtcblx0XHR9XG5cdH1cblx0aWYgKCFmb2N1c2VkU3RhdCkge1xuXHRcdGlmIChyZXNwZWN0TXVsdGlTZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiBzZWxlY3RlZFN0YXRzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0aWYgKHJlc3BlY3RNdWx0aVNlbGVjdGlvbiAmJiBzZWxlY3RlZFN0YXRzLmluZGV4T2YoZm9jdXNlZFN0YXQpID49IDApIHtcblx0XHRyZXR1cm4gc2VsZWN0ZWRTdGF0cztcblx0fVxuXG5cdHJldHVybiBbZm9jdXNlZFN0YXRdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHBsb3JlclZpZXdDb250YWluZXJEZWxlZ2F0ZSB7XG5cdHdpbGxPcGVuRWxlbWVudChldmVudD86IFVJRXZlbnQpOiB2b2lkO1xuXHRkaWRPcGVuRWxlbWVudChldmVudD86IFVJRXZlbnQpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHBsb3JlclZpZXdQYW5lT3B0aW9ucyBleHRlbmRzIElWaWV3UGFuZU9wdGlvbnMge1xuXHRkZWxlZ2F0ZTogSUV4cGxvcmVyVmlld0NvbnRhaW5lckRlbGVnYXRlO1xufVxuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJWaWV3IGV4dGVuZHMgVmlld1BhbmUgaW1wbGVtZW50cyBJRXhwbG9yZXJWaWV3IHtcblx0c3RhdGljIHJlYWRvbmx5IFRSRUVfVklFV19TVEFURV9TVE9SQUdFX0tFWTogc3RyaW5nID0gJ3dvcmtiZW5jaC5leHBsb3Jlci50cmVlVmlld1N0YXRlJztcblxuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPEV4cGxvcmVySXRlbSB8IEV4cGxvcmVySXRlbVtdLCBFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIGZpbHRlciE6IEZpbGVzRmlsdGVyO1xuXHRwcml2YXRlIGZpbmRQcm92aWRlciE6IEV4cGxvcmVyRmluZFByb3ZpZGVyO1xuXG5cdHByaXZhdGUgcmVzb3VyY2VDb250ZXh0OiBSZXNvdXJjZUNvbnRleHRLZXk7XG5cdHByaXZhdGUgZm9sZGVyQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcGFyZW50UmVhZG9ubHlDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0cHJpdmF0ZSByb290Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVzb3VyY2VNb3ZlYWJsZVRvVHJhc2g6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVuZGVyZXIhOiBGaWxlc1JlbmRlcmVyO1xuXG5cdHByaXZhdGUgdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbXByZXNzZWRGb2N1c0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGNvbXByZXNzZWRGb2N1c0ZpcnN0Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY29tcHJlc3NlZEZvY3VzTGFzdENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgdmlld0hhc1NvbWVDb2xsYXBzaWJsZVJvb3RJdGVtOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB2aWV3VmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgc2V0VHJlZUlucHV0UHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZHJhZ0hhbmRsZXIhOiBEZWxheWVkRHJhZ0hhbmRsZXI7XG5cdHByaXZhdGUgX2F1dG9SZXZlYWw6IGJvb2xlYW4gfCAnZm9yY2UnIHwgJ2ZvY3VzTm9TY3JvbGwnID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElFeHBsb3JlclZpZXdDb250YWluZXJEZWxlZ2F0ZSB8IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBnZXQgc2luZ2xlVmlld1BhbmVDb250YWluZXJUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm5hbWU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJRXhwbG9yZXJWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGxvcmVyU2VydmljZTogSUV4cGxvcmVyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHR0aGlzLmRlbGVnYXRlID0gb3B0aW9ucy5kZWxlZ2F0ZTtcblx0XHR0aGlzLnJlc291cmNlQ29udGV4dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlQ29udGV4dEtleSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZXNvdXJjZUNvbnRleHQpO1xuXG5cdFx0dGhpcy5wYXJlbnRSZWFkb25seUNvbnRleHQgPSBFeHBsb3JlclJlc291cmNlUGFyZW50UmVhZE9ubHlDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5mb2xkZXJDb250ZXh0ID0gRXhwbG9yZXJGb2xkZXJDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5yZWFkb25seUNvbnRleHQgPSBFeHBsb3JlclJlc291cmNlUmVhZG9ubHlDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0ID0gRXhwbG9yZXJSZXNvdXJjZUF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJvb3RDb250ZXh0ID0gRXhwbG9yZXJSb290Q29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucmVzb3VyY2VNb3ZlYWJsZVRvVHJhc2ggPSBFeHBsb3JlclJlc291cmNlTW92ZWFibGVUb1RyYXNoLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jb21wcmVzc2VkRm9jdXNDb250ZXh0ID0gRXhwbG9yZXJDb21wcmVzc2VkRm9jdXNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jb21wcmVzc2VkRm9jdXNGaXJzdENvbnRleHQgPSBFeHBsb3JlckNvbXByZXNzZWRGaXJzdEZvY3VzQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY29tcHJlc3NlZEZvY3VzTGFzdENvbnRleHQgPSBFeHBsb3JlckNvbXByZXNzZWRMYXN0Rm9jdXNDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy52aWV3SGFzU29tZUNvbGxhcHNpYmxlUm9vdEl0ZW0gPSBWaWV3SGFzU29tZUNvbGxhcHNpYmxlUm9vdEl0ZW1Db250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy52aWV3VmlzaWJsZUNvbnRleHRLZXkgPSBGb2xkZXJzVmlld1Zpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblxuXHRcdHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnJlZ2lzdGVyVmlldyh0aGlzKTtcblx0fVxuXG5cdGdldCBhdXRvUmV2ZWFsKCkge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvUmV2ZWFsO1xuXHR9XG5cblx0c2V0IGF1dG9SZXZlYWwoYXV0b1JldmVhbDogYm9vbGVhbiB8ICdmb3JjZScgfCAnZm9jdXNOb1Njcm9sbCcpIHtcblx0XHR0aGlzLl9hdXRvUmV2ZWFsID0gYXV0b1JldmVhbDtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubmFtZTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCB0aXRsZShfOiBzdHJpbmcpIHtcblx0XHQvLyBub29wXG5cdH1cblxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdWaXNpYmxlQ29udGV4dEtleS5zZXQodmlzaWJsZSk7XG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdEBtZW1vaXplIHByaXZhdGUgZ2V0IGZpbGVDb3BpZWRDb250ZXh0S2V5KCk6IElDb250ZXh0S2V5PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gRmlsZUNvcGllZENvbnRleHQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0QG1lbW9pemUgcHJpdmF0ZSBnZXQgcmVzb3VyY2VDdXRDb250ZXh0S2V5KCk6IElDb250ZXh0S2V5PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gRXhwbG9yZXJSZXNvdXJjZUN1dC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHQvLyBTcGxpdCB2aWV3IG1ldGhvZHNcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJIZWFkZXIoY29udGFpbmVyKTtcblxuXHRcdC8vIEV4cGFuZCBvbiBkcmFnIG92ZXJcblx0XHR0aGlzLmRyYWdIYW5kbGVyID0gbmV3IERlbGF5ZWREcmFnSGFuZGxlcihjb250YWluZXIsICgpID0+IHRoaXMuc2V0RXhwYW5kZWQodHJ1ZSkpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGl0bGVFbGVtZW50ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy50aXRsZScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnN0IHNldEhlYWRlciA9ICgpID0+IHtcblx0XHRcdHRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMubmFtZTtcblx0XHRcdHRoaXMudXBkYXRlVGl0bGUodGhpcy5uYW1lKTtcblx0XHRcdHRoaXMuYXJpYUhlYWRlckxhYmVsID0gbmxzLmxvY2FsaXplKCdleHBsb3JlclNlY3Rpb24nLCBcIkV4cGxvcmVyIFNlY3Rpb246IHswfVwiLCB0aGlzLm5hbWUpO1xuXHRcdFx0dGl0bGVFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYXJpYUhlYWRlckxhYmVsKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUoc2V0SGVhZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKHNldEhlYWRlcikpO1xuXHRcdHNldEhlYWRlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuZXhwbG9yZXItZm9sZGVycy12aWV3JykpO1xuXG5cdFx0dGhpcy5jcmVhdGVUcmVlKHRoaXMudHJlZUNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUaXRsZUFyZWEuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBjb25maWd1cmF0aW9uXG5cdFx0dGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBXaGVuIHRoZSBleHBsb3JlciB2aWV3ZXIgaXMgbG9hZGVkLCBsaXN0ZW4gdG8gY2hhbmdlcyB0byB0aGUgZWRpdG9yIGlucHV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuc2VsZWN0QWN0aXZlRmlsZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEFsc28gaGFuZGxlIGNvbmZpZ3VyYXRpb24gdXBkYXRlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkoYXN5bmMgdmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHQvLyBBbHdheXMgcmVmcmVzaCBleHBsb3JlciB3aGVuIGl0IGJlY29tZXMgdmlzaWJsZSB0byBjb21wZW5zYXRlIGZvciBtaXNzaW5nIGZpbGUgZXZlbnRzICMxMjY4MTdcblx0XHRcdFx0YXdhaXQgdGhpcy5zZXRUcmVlSW5wdXQoKTtcblx0XHRcdFx0Ly8gVXBkYXRlIHRoZSBjb2xsYXBzZSAvIGV4cGFuZCAgYnV0dG9uIHN0YXRlXG5cdFx0XHRcdHRoaXMudXBkYXRlQW55Q29sbGFwc2VkQ29udGV4dCgpO1xuXHRcdFx0XHQvLyBGaW5kIHJlc291cmNlIHRvIGZvY3VzIGZyb20gYWN0aXZlIGVkaXRvciBpbnB1dCBpZiBzZXRcblx0XHRcdFx0dGhpcy5zZWxlY3RBY3RpdmVGaWxlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN1cHBvcnQgZm9yIHBhc3RlIG9mIGZpbGVzIGludG8gZXhwbG9yZXJcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKERPTS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpLCBET00uRXZlbnRUeXBlLlBBU1RFLCBhc3luYyBldmVudCA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaGFzRm9jdXMoKSB8fCB0aGlzLnJlYWRvbmx5Q29udGV4dC5nZXQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuY2xpcGJvYXJkRGF0YT8uZmlsZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdmaWxlc0V4cGxvcmVyLnBhc3RlJywgZXZlbnQuY2xpcGJvYXJkRGF0YT8uZmlsZXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cblx0XHRpZiAodGhpcy50cmVlLmdldEZvY3VzZWRQYXJ0KCkgPT09IEFic3RyYWN0VHJlZVBhcnQuVHJlZSkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAxICYmIHRoaXMuX2F1dG9SZXZlYWwpIHtcblx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChmb2N1c2VkWzBdLCAwLjUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBET00uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLmNvbnRhaW5lcik7XG5cdH1cblxuXHRnZXRGb2N1cygpOiBFeHBsb3Jlckl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNOZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5mb2N1c05leHQoKTtcblx0fVxuXG5cdGZvY3VzTGFzdCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZm9jdXNMYXN0KCk7XG5cdH1cblxuXHRnZXRDb250ZXh0KHJlc3BlY3RNdWx0aVNlbGVjdGlvbjogYm9vbGVhbik6IEV4cGxvcmVySXRlbVtdIHtcblx0XHRjb25zdCBmb2N1c2VkSXRlbXMgPSB0aGlzLnRyZWUuZ2V0Rm9jdXNlZFBhcnQoKSA9PT0gQWJzdHJhY3RUcmVlUGFydC5TdGlja3lTY3JvbGwgP1xuXHRcdFx0dGhpcy50cmVlLmdldFN0aWNreVNjcm9sbEZvY3VzKCkgOlxuXHRcdFx0dGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0cmV0dXJuIGdldENvbnRleHQoZm9jdXNlZEl0ZW1zLCB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCksIHJlc3BlY3RNdWx0aVNlbGVjdGlvbiwgdGhpcy5yZW5kZXJlcik7XG5cdH1cblxuXHRpc0l0ZW1WaXNpYmxlKGl0ZW06IEV4cGxvcmVySXRlbSk6IGJvb2xlYW4ge1xuXHRcdC8vIElmIGZpbHRlciBpcyB1bmRlZmluZWQgaXQgbWVhbnMgdGhlIHRyZWUgaGFzbid0IGJlZW4gcmVuZGVyZWQgeWV0LCBzbyBub3RoaW5nIGlzIHZpc2libGVcblx0XHRpZiAoIXRoaXMuZmlsdGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmZpbHRlci5maWx0ZXIoaXRlbSwgVHJlZVZpc2liaWxpdHkuVmlzaWJsZSk7XG5cdH1cblxuXHRpc0l0ZW1Db2xsYXBzZWQoaXRlbTogRXhwbG9yZXJJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5pc0NvbGxhcHNlZChpdGVtKTtcblx0fVxuXG5cdGFzeW5jIHNldEVkaXRhYmxlKHN0YXQ6IEV4cGxvcmVySXRlbSwgaXNFZGl0aW5nOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gdGhpcy50cmVlLm9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZztcblxuXHRcdFx0aWYgKHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZykge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKHN0YXQucGFyZW50ISk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWxTY3JvbGxpbmc6IHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyB9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZ2hsaWdodCcpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMucmVmcmVzaChmYWxzZSwgc3RhdC5wYXJlbnQsIGZhbHNlKTtcblxuXHRcdGlmIChpc0VkaXRpbmcpIHtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWdobGlnaHQnKTtcblx0XHRcdHRoaXMudHJlZS5yZXZlYWwoc3RhdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VsZWN0QWN0aXZlRmlsZShyZXZlYWwgPSB0aGlzLl9hdXRvUmV2ZWFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2F1dG9SZXZlYWwpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUZpbGUgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHRcdGlmIChhY3RpdmVGaWxlKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0aWYgKGZvY3VzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2N1c1swXS5yZXNvdXJjZSwgYWN0aXZlRmlsZSkgJiYgc2VsZWN0aW9uLmxlbmd0aCA9PT0gMSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzZWxlY3Rpb25bMF0ucmVzb3VyY2UsIGFjdGl2ZUZpbGUpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gYWN0aW9uIG5lZWRlZCwgYWN0aXZlIGZpbGUgaXMgYWxyZWFkeSBmb2N1c2VkIGFuZCBzZWxlY3RlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5leHBsb3JlclNlcnZpY2Uuc2VsZWN0KGFjdGl2ZUZpbGUsIHJldmVhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZXNGaWx0ZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsdGVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbHRlci5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLnJlZnJlc2godHJ1ZSkpKTtcblx0XHRjb25zdCBleHBsb3JlckxhYmVscyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXhwbG9yZXJMYWJlbHMpO1xuXG5cdFx0dGhpcy5maW5kUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4cGxvcmVyRmluZFByb3ZpZGVyLCB0aGlzLmZpbHRlciwgKCkgPT4gdGhpcy50cmVlKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVdpZHRoID0gKHN0YXQ6IEV4cGxvcmVySXRlbSkgPT4gdGhpcy50cmVlLnVwZGF0ZVdpZHRoKHN0YXQpO1xuXHRcdHRoaXMucmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVzUmVuZGVyZXIsIGNvbnRhaW5lciwgZXhwbG9yZXJMYWJlbHMsIHRoaXMuZmluZFByb3ZpZGVyLmhpZ2hsaWdodFRyZWUsIHVwZGF0ZVdpZHRoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbmRlcmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUZpbGVJY29uVGhlbWFibGVUcmVlQ29udGFpbmVyU2NvcGUoY29udGFpbmVyLCB0aGlzLnRoZW1lU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgaXNDb21wcmVzc2lvbkVuYWJsZWQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4cGxvcmVyLmNvbXBhY3RGb2xkZXJzJyk7XG5cdFx0XHQvLyBEaXNhYmxlIGNvbXBhY3QgZm9sZGVycyB3aGVuIHNjcmVlbiByZWFkZXIgaXMgb3B0aW1pemVkIGZvciBiZXR0ZXIgYWNjZXNzaWJpbGl0eVxuXHRcdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY29uZmlnVmFsdWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldEZpbGVOZXN0aW5nU2V0dGluZ3MgPSAoaXRlbT86IEV4cGxvcmVySXRlbSkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiBpdGVtPy5yb290LnJlc291cmNlIH0pLmV4cGxvcmVyLmZpbGVOZXN0aW5nO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPEV4cGxvcmVySXRlbSB8IEV4cGxvcmVySXRlbVtdLCBFeHBsb3Jlckl0ZW0sIEZ1enp5U2NvcmU+LCAnRmlsZUV4cGxvcmVyJywgY29udGFpbmVyLCBuZXcgRXhwbG9yZXJEZWxlZ2F0ZSgpLCBuZXcgRXhwbG9yZXJDb21wcmVzc2lvbkRlbGVnYXRlKCksIFt0aGlzLnJlbmRlcmVyXSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhwbG9yZXJEYXRhU291cmNlLCB0aGlzLmZpbHRlciwgdGhpcy5maW5kUHJvdmlkZXIpLCB7XG5cdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IGlzQ29tcHJlc3Npb25FbmFibGVkKCksXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHRoaXMucmVuZGVyZXIsXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKHN0YXQ6IEV4cGxvcmVySXRlbSkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmV4cGxvcmVyU2VydmljZS5pc0VkaXRhYmxlKHN0YXQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzdGF0Lm5hbWU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChzdGF0czogRXhwbG9yZXJJdGVtW10pID0+IHtcblx0XHRcdFx0XHRpZiAoc3RhdHMuc29tZShzdGF0ID0+IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmlzRWRpdGFibGUoc3RhdCkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzdGF0cy5tYXAoc3RhdCA9PiBzdGF0Lm5hbWUpLmpvaW4oJy8nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdHJ1ZSxcblx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRzb3J0ZXI6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVNvcnRlciksXG5cdFx0XHRkbmQ6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZURyYWdBbmREcm9wLCAoaXRlbSkgPT4gdGhpcy5pc0l0ZW1Db2xsYXBzZWQoaXRlbSkpLFxuXHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IChlKSA9PiB7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtKSB7XG5cdFx0XHRcdFx0aWYgKGUuaGFzTmVzdHMgJiYgZ2V0RmlsZU5lc3RpbmdTZXR0aW5ncyhlKS5leHBhbmQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuZmluZFByb3ZpZGVyLmlzU2hvd2luZ0ZpbHRlclJlc3VsdHMoKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0XHRhdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW46IHRydWUsXG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtKSB7XG5cdFx0XHRcdFx0aWYgKGUuaGFzTmVzdHMpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdzaW5nbGVDbGljaycgfCAnZG91YmxlQ2xpY2snPignd29ya2JlbmNoLnRyZWUuZXhwYW5kTW9kZScpID09PSAnZG91YmxlQ2xpY2snKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSxcblx0XHRcdHBhZGRpbmdCb3R0b206IEV4cGxvcmVyRGVsZWdhdGUuSVRFTV9IRUlHSFQsXG5cdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0ZmluZFByb3ZpZGVyOiB0aGlzLmZpbmRQcm92aWRlcixcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLnRyZWUucmVyZW5kZXIoKSkpO1xuXG5cdFx0Ly8gQmluZCBjb25maWd1cmF0aW9uXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb21wcmVzc2lvbkNvbmZpZ3VyYXRpb24gPSBFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXIuY29tcGFjdEZvbGRlcnMnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VDb21wcmVzc2lvbkNvbmZpZ3VyYXRpb24oXyA9PiB0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IGNvbXByZXNzaW9uRW5hYmxlZDogaXNDb21wcmVzc2lvbkVuYWJsZWQoKSB9KSkpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbXByZXNzaW9uIHdoZW4gc2NyZWVuIHJlYWRlciBtb2RlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHtcblx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgY29tcHJlc3Npb25FbmFibGVkOiBpc0NvbXByZXNzaW9uRW5hYmxlZCgpIH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIEJpbmQgY29udGV4dCBrZXlzXG5cdFx0RmlsZXNFeHBsb3JlckZvY3VzZWRDb250ZXh0LmJpbmRUbyh0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdEV4cGxvcmVyRm9jdXNlZENvbnRleHQuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBVcGRhdGUgcmVzb3VyY2UgY29udGV4dCBiYXNlZCBvbiBmb2N1c2VkIGVsZW1lbnRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VGb2N1cyhlID0+IHRoaXMub25Gb2N1c0NoYW5nZWQoZS5lbGVtZW50cykpKTtcblx0XHR0aGlzLm9uRm9jdXNDaGFuZ2VkKFtdKTtcblx0XHQvLyBPcGVuIHdoZW4gc2VsZWN0aW5nIHZpYSBrZXlib2FyZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXHRcdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIERvIG5vdCByZWFjdCBpZiB0aGUgdXNlciBpcyBleHBhbmRpbmcgc2VsZWN0aW9uIHZpYSBrZXlib2FyZC5cblx0XHRcdC8vIENoZWNrIGlmIHRoZSBpdGVtIHdhcyBwcmV2aW91c2x5IGFsc28gc2VsZWN0ZWQsIGlmIHllcyB0aGUgdXNlciBpcyBzaW1wbHkgZXhwYW5kaW5nIC8gY29sbGFwc2luZyBjdXJyZW50IHNlbGVjdGlvbiAjNjY1ODkuXG5cdFx0XHRjb25zdCBzaGlmdERvd24gPSBET00uaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSAmJiBlLmJyb3dzZXJFdmVudC5zaGlmdEtleTtcblx0XHRcdGlmICghc2hpZnREb3duKSB7XG5cdFx0XHRcdGlmIChlbGVtZW50LmlzRGlyZWN0b3J5IHx8IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmlzRWRpdGFibGUodW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdC8vIERvIG5vdCByZWFjdCBpZiB1c2VyIGlzIGNsaWNraW5nIG9uIGV4cGxvcmVyIGl0ZW1zIHdoaWxlIHNvbWUgYXJlIGJlaW5nIGVkaXRlZCAjNzAyNzZcblx0XHRcdFx0XHQvLyBEbyBub3QgcmVhY3QgaWYgY2xpY2tpbmcgb24gZGlyZWN0b3JpZXNcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogJ3dvcmtiZW5jaC5maWxlcy5vcGVuRmlsZScsIGZyb206ICdleHBsb3JlcicgfSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dGhpcy5kZWxlZ2F0ZT8ud2lsbE9wZW5FbGVtZW50KGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBlbGVtZW50LnJlc291cmNlLCBvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLCBwaW5uZWQ6IGUuZWRpdG9yT3B0aW9ucy5waW5uZWQsIHNvdXJjZTogRWRpdG9yT3BlblNvdXJjZS5VU0VSIH0gfSwgZS5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5kZWxlZ2F0ZT8uZGlkT3BlbkVsZW1lbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRTY3JvbGwoYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0YWJsZSA9IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmdldEVkaXRhYmxlKCk7XG5cdFx0XHRpZiAoZS5zY3JvbGxUb3BDaGFuZ2VkICYmIGVkaXRhYmxlICYmIHRoaXMudHJ5R2V0UmVsYXRpdmVUb3AoZWRpdGFibGUuc3RhdCkgPT09IG51bGwpIHtcblx0XHRcdFx0YXdhaXQgZWRpdGFibGUuZGF0YS5vbkZpbmlzaCgnJywgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZS5ub2RlLmVsZW1lbnQ/LmVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBuYXZpZ2F0aW9uQ29udHJvbGxlcnMgPSB0aGlzLnJlbmRlcmVyLmdldENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihBcnJheS5pc0FycmF5KGVsZW1lbnQpID8gZWxlbWVudFswXSA6IGVsZW1lbnQpO1xuXHRcdFx0XHRuYXZpZ2F0aW9uQ29udHJvbGxlcnM/LmZvckVhY2goY29udHJvbGxlciA9PiBjb250cm9sbGVyLnVwZGF0ZUNvbGxhcHNlZChlLm5vZGUuY29sbGFwc2VkKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBVcGRhdGUgc2hvd2luZyBleHBhbmQgLyBjb2xsYXBzZSBidXR0b25cblx0XHRcdHRoaXMudXBkYXRlQW55Q29sbGFwc2VkQ29udGV4dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlQW55Q29sbGFwc2VkQ29udGV4dCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uTW91c2VEYmxDbGljayhlID0+IHtcblx0XHRcdC8vIElmIGVtcHR5IHNwYWNlIGlzIGNsaWNrZWQsIGFuZCBub3Qgc2Nyb2xsaW5nIGJ5IHBhZ2UgZW5hYmxlZCAjMTczMjYxXG5cdFx0XHRjb25zdCBzY3JvbGxpbmdCeVBhZ2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2gubGlzdC5zY3JvbGxCeVBhZ2UnKTtcblx0XHRcdGlmIChlLmVsZW1lbnQgPT09IG51bGwgJiYgIXNjcm9sbGluZ0J5UGFnZSkge1xuXHRcdFx0XHQvLyBjbGljayBpbiBlbXB0eSBhcmVhIC0+IGNyZWF0ZSBhIG5ldyBmaWxlICMxMTY2NzZcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChORVdfRklMRV9DT01NQU5EX0lEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBzYXZlIHZpZXcgc3RhdGVcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnN0b3JlVHJlZVZpZXdTdGF0ZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8vIFJlYWN0IG9uIGV2ZW50c1xuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uVXBkYXRlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghZXZlbnQgfHwgZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2V4cGxvcmVyLmF1dG9SZXZlYWwnKSkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKTtcblx0XHRcdHRoaXMuX2F1dG9SZXZlYWwgPSBjb25maWd1cmF0aW9uPy5leHBsb3Jlcj8uYXV0b1JldmVhbDtcblx0XHR9XG5cblx0XHQvLyBQdXNoIGRvd24gY29uZmlnIHVwZGF0ZXMgdG8gY29tcG9uZW50cyBvZiB2aWV3ZXJcblx0XHRpZiAoZXZlbnQgJiYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5kZWNvcmF0aW9ucy5jb2xvcnMnKSB8fCBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignZXhwbG9yZXIuZGVjb3JhdGlvbnMuYmFkZ2VzJykpKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2godHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZVRyZWVWaWV3U3RhdGUoKSB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFeHBsb3JlclZpZXcuVFJFRV9WSUVXX1NUQVRFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRDb250ZXh0S2V5cyhzdGF0OiBFeHBsb3Jlckl0ZW0gfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRjb25zdCByZXNvdXJjZSA9IHN0YXQgPyBzdGF0LnJlc291cmNlIDogZm9sZGVyc1tmb2xkZXJzLmxlbmd0aCAtIDFdLnVyaTtcblx0XHRzdGF0ID0gc3RhdCB8fCB0aGlzLmV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdChyZXNvdXJjZSk7XG5cdFx0dGhpcy5yZXNvdXJjZUNvbnRleHQuc2V0KHJlc291cmNlKTtcblx0XHR0aGlzLmZvbGRlckNvbnRleHQuc2V0KCEhc3RhdCAmJiBzdGF0LmlzRGlyZWN0b3J5KTtcblx0XHR0aGlzLnJlYWRvbmx5Q29udGV4dC5zZXQoISFzdGF0ICYmICEhc3RhdC5pc1JlYWRvbmx5KTtcblx0XHR0aGlzLnBhcmVudFJlYWRvbmx5Q29udGV4dC5zZXQoQm9vbGVhbihzdGF0Py5wYXJlbnQ/LmlzUmVhZG9ubHkpKTtcblx0XHR0aGlzLnJvb3RDb250ZXh0LnNldCghIXN0YXQgJiYgc3RhdC5pc1Jvb3QpO1xuXG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBvdmVycmlkZXMgPSByZXNvdXJjZSA/IHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmdldEVkaXRvcnMocmVzb3VyY2UpLm1hcChlZGl0b3IgPT4gZWRpdG9yLmlkKSA6IFtdO1xuXHRcdFx0dGhpcy5hdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LnNldChvdmVycmlkZXMuam9pbignLCcpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LnJlc2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxFeHBsb3Jlckl0ZW0+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKERPTS5pc0VkaXRhYmxlRWxlbWVudChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdCA9IGUuZWxlbWVudDtcblx0XHRsZXQgYW5jaG9yID0gZS5hbmNob3I7XG5cblx0XHQvLyBBZGp1c3QgZm9yIGNvbXByZXNzZWQgZm9sZGVycyAoZXhjZXB0IHdoZW4gbW91c2UgaXMgdXNlZClcblx0XHRpZiAoRE9NLmlzSFRNTEVsZW1lbnQoYW5jaG9yKSkge1xuXHRcdFx0aWYgKHN0YXQpIHtcblx0XHRcdFx0Y29uc3QgY29udHJvbGxlcnMgPSB0aGlzLnJlbmRlcmVyLmdldENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihzdGF0KTtcblxuXHRcdFx0XHRpZiAoY29udHJvbGxlcnMgJiYgY29udHJvbGxlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGlmIChET00uaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSB8fCBpc0NvbXByZXNzZWRGb2xkZXJOYW1lKGUuYnJvd3NlckV2ZW50LnRhcmdldCkpIHtcblx0XHRcdFx0XHRcdGFuY2hvciA9IGNvbnRyb2xsZXJzWzBdLmxhYmVsc1tjb250cm9sbGVyc1swXS5pbmRleF07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnRyb2xsZXJzLmZvckVhY2goY29udHJvbGxlciA9PiBjb250cm9sbGVyLmxhc3QoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIGR5bmFtaWMgY29udGV4dHNcblx0XHR0aGlzLmZpbGVDb3BpZWRDb250ZXh0S2V5LnNldChhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2UuaGFzUmVzb3VyY2VzKCkpO1xuXHRcdHRoaXMuc2V0Q29udGV4dEtleXMoc3RhdCk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRjb25zdCByb290cyA9IHRoaXMuZXhwbG9yZXJTZXJ2aWNlLnJvb3RzOyAvLyBJZiB0aGUgY2xpY2sgaXMgb3V0c2lkZSBvZiB0aGUgZWxlbWVudHMgcGFzcyB0aGUgcm9vdCByZXNvdXJjZSBpZiB0aGVyZSBpcyBvbmx5IG9uZSByb290LiBJZiB0aGVyZSBhcmUgbXVsdGlwbGUgcm9vdHMgcGFzcyBlbXB0eSBvYmplY3QuXG5cdFx0bGV0IGFyZzogVVJJIHwge307XG5cdFx0aWYgKHN0YXQgaW5zdGFuY2VvZiBFeHBsb3Jlckl0ZW0pIHtcblx0XHRcdGNvbnN0IGNvbXByZXNzZWRDb250cm9sbGVycyA9IHRoaXMucmVuZGVyZXIuZ2V0Q29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKHN0YXQpO1xuXHRcdFx0YXJnID0gY29tcHJlc3NlZENvbnRyb2xsZXJzPy5sZW5ndGggPyBjb21wcmVzc2VkQ29udHJvbGxlcnNbMF0uY3VycmVudC5yZXNvdXJjZSA6IHN0YXQucmVzb3VyY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFyZyA9IHJvb3RzLmxlbmd0aCA9PT0gMSA/IHJvb3RzWzBdLnJlc291cmNlIDoge307XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdG1lbnVJZDogTWVudUlkLkV4cGxvcmVyQ29udGV4dCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IGFyZywgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGFuY2hvcixcblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHdhc0NhbmNlbGxlZCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHN0YXQgJiYgc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5pbmRleE9mKHN0YXQpID49IDBcblx0XHRcdFx0PyBzZWxlY3Rpb24ubWFwKChmczogRXhwbG9yZXJJdGVtKSA9PiBmcy5yZXNvdXJjZSlcblx0XHRcdFx0OiBzdGF0IGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtID8gW3N0YXQucmVzb3VyY2VdIDogW11cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1c0NoYW5nZWQoZWxlbWVudHM6IHJlYWRvbmx5IEV4cGxvcmVySXRlbVtdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdCA9IGVsZW1lbnRzLmF0KDApO1xuXHRcdHRoaXMuc2V0Q29udGV4dEtleXMoc3RhdCk7XG5cblx0XHRpZiAoc3RhdCkge1xuXHRcdFx0Y29uc3QgZW5hYmxlVHJhc2ggPSBCb29sZWFuKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5maWxlcz8uZW5hYmxlVHJhc2gpO1xuXHRcdFx0Y29uc3QgaGFzQ2FwYWJpbGl0eSA9IHRoaXMuZmlsZVNlcnZpY2UuaGFzQ2FwYWJpbGl0eShzdGF0LnJlc291cmNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2gpO1xuXHRcdFx0dGhpcy5yZXNvdXJjZU1vdmVhYmxlVG9UcmFzaC5zZXQoZW5hYmxlVHJhc2ggJiYgaGFzQ2FwYWJpbGl0eSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVzb3VyY2VNb3ZlYWJsZVRvVHJhc2gucmVzZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzID0gc3RhdCAmJiB0aGlzLnJlbmRlcmVyLmdldENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihzdGF0KTtcblxuXHRcdGlmICghY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycykge1xuXHRcdFx0dGhpcy5jb21wcmVzc2VkRm9jdXNDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21wcmVzc2VkRm9jdXNDb250ZXh0LnNldCh0cnVlKTtcblx0XHRjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzLmZvckVhY2goY29udHJvbGxlciA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udGV4dEtleXMoY29udHJvbGxlcik7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyBHZW5lcmFsIG1ldGhvZHNcblxuXHQvKipcblx0ICogU2FmZWx5IHF1ZXJpZXMgdGhlIGZpbGUgZXhwbG9yZXIgdHJlZSBmb3IgdGhlIHJlbGF0aXZlIHRvcCBvZiBhbiBlbGVtZW50LlxuXHQgKlxuXHQgKiBgaGFzTm9kZSgpYCBhbmQgYGdldFJlbGF0aXZlVG9wKClgIGNvbnN1bHQgZGlmZmVyZW50IGludGVybmFsIG1hcHMgaW4gdGhlXG5cdCAqIGNvbXByZXNzaWJsZSBhc3luYyBkYXRhIHRyZWUuIER1cmluZyBhbiBhc3luYyByZWZyZXNoIChlLmcuIHdoZW4gdGhlXG5cdCAqIHVuZGVybHlpbmcgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgY2hhbmdlcywgb3IgZmlsZSBuZXN0aW5nIHNldHRpbmdzIHVwZGF0ZSlcblx0ICogdGhlcmUgaXMgYSBtaWNyb3Rhc2sgZ2FwIHdoZXJlIG9uZSBtYXAgaGFzIGJlZW4gdXBkYXRlZCBidXQgdGhlIG90aGVyIGhhc1xuXHQgKiBub3QuIEluIHRoYXQgd2luZG93IGBnZXRSZWxhdGl2ZVRvcCgpYCBjYW4gdGhyb3dcblx0ICogYFRyZWVFcnJvciBbRmlsZUV4cGxvcmVyXSBUcmVlIGVsZW1lbnQgbm90IGZvdW5kYCAoaXNzdWUgIzE4ODM2NSkgZXZlblxuXHQgKiB0aG91Z2ggdGhlIGNhbGxlciByZWFzb25hYmx5IGJlbGlldmVkIHRoZSBlbGVtZW50IHdhcyBzdGlsbCBwcmVzZW50LlxuXHQgKlxuXHQgKiBUcmVhdCBzdWNoIGEgZmFpbHVyZSBhcyBcIm5vdCBjdXJyZW50bHkgdmlzaWJsZVwiIHNvIHRoYXQgY2FsbGVycyBmYWxsIGJhY2tcblx0ICogdG8gdGhlaXIgbm90LXZpc2libGUgYnJhbmNoIChlLmcuIGZpbmlzaGluZyBlZGl0YWJsZSBzdGF0ZSwgb3IgY2FsbGluZ1xuXHQgKiBgcmV2ZWFsKClgKSwgd2hpY2ggaXMgc2FmZSB3aGVuIHRoZSBlbGVtZW50IGlzIHN0aWxsIGluIHRoZSBkYXRhIHNvdXJjZVxuXHQgKiBldmVuIGlmIHRoZSB2aWV3IGhhcyBub3QgY2F1Z2h0IHVwIHlldC5cblx0ICovXG5cdHByaXZhdGUgdHJ5R2V0UmVsYXRpdmVUb3AoZWxlbWVudDogRXhwbG9yZXJJdGVtKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLnRyZWUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2ggdGhlIGNvbnRlbnRzIG9mIHRoZSBleHBsb3JlciB0byBnZXQgdXAgdG8gZGF0ZSBkYXRhIGZyb20gdGhlIGRpc2sgYWJvdXQgdGhlIGZpbGUgc3RydWN0dXJlLlxuXHQgKiBJZiB0aGUgaXRlbSBpcyBwYXNzZWQgd2UgcmVmcmVzaCBvbmx5IHRoYXQgbGV2ZWwgb2YgdGhlIHRyZWUsIG90aGVyd2lzZSB3ZSBkbyBhIGZ1bGwgcmVmcmVzaC5cblx0ICovXG5cdHJlZnJlc2gocmVjdXJzaXZlOiBib29sZWFuLCBpdGVtPzogRXhwbG9yZXJJdGVtLCBjYW5jZWxFZGl0aW5nOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy50cmVlIHx8ICF0aGlzLmlzQm9keVZpc2libGUoKSB8fCAoaXRlbSAmJiAhdGhpcy50cmVlLmhhc05vZGUoaXRlbSkpIHx8ICh0aGlzLmZpbmRQcm92aWRlcj8uaXNTaG93aW5nRmlsdGVyUmVzdWx0cygpICYmIHJlY3Vyc2l2ZSkpIHtcblx0XHRcdC8vIFRyZWUgbm9kZSBkb2Vzbid0IGV4aXN0IHlldCwgd2hlbiBpdCBiZWNvbWVzIHZpc2libGUgd2Ugd2lsbCByZWZyZXNoXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhbmNlbEVkaXRpbmcgJiYgdGhpcy5leHBsb3JlclNlcnZpY2UuaXNFZGl0YWJsZSh1bmRlZmluZWQpKSB7XG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b1JlZnJlc2ggPSBpdGVtIHx8IHRoaXMudHJlZS5nZXRJbnB1dCgpO1xuXHRcdHJldHVybiB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4odG9SZWZyZXNoLCByZWN1cnNpdmUsICEhaXRlbSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBwYXJlbnROb2RlID0gdGhpcy50cmVlLmdldEhUTUxFbGVtZW50KCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgY2hpbGROb2RlcyA9IChbXSBhcyBIVE1MRWxlbWVudFtdKS5zbGljZS5jYWxsKHBhcmVudE5vZGUucXVlcnlTZWxlY3RvckFsbCgnLmV4cGxvcmVyLWl0ZW0gLmxhYmVsLW5hbWUnKSk7IC8vIHNlbGVjdCBhbGwgZmlsZSBsYWJlbHNcblxuXHRcdHJldHVybiBET00uZ2V0TGFyZ2VzdENoaWxkV2lkdGgocGFyZW50Tm9kZSwgY2hpbGROb2Rlcyk7XG5cdH1cblxuXHRhc3luYyBzZXRUcmVlSW5wdXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBsYXN0IGV4ZWN1dGlvbiB0byBjb21wbGV0ZSBiZWZvcmUgZXhlY3V0aW5nXG5cdFx0aWYgKHRoaXMuc2V0VHJlZUlucHV0UHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zZXRUcmVlSW5wdXRQcm9taXNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRpYWxJbnB1dFNldHVwID0gIXRoaXMudHJlZS5nZXRJbnB1dCgpO1xuXHRcdGlmIChpbml0aWFsSW5wdXRTZXR1cCkge1xuXHRcdFx0cGVyZi5tYXJrKCdjb2RlL3dpbGxSZXNvbHZlRXhwbG9yZXInKTtcblx0XHR9XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLmV4cGxvcmVyU2VydmljZS5yb290cztcblx0XHRsZXQgaW5wdXQ6IEV4cGxvcmVySXRlbSB8IEV4cGxvcmVySXRlbVtdID0gcm9vdHNbMF07XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRk9MREVSIHx8IHJvb3RzWzBdLmVycm9yKSB7XG5cdFx0XHQvLyBEaXNwbGF5IHJvb3RzIG9ubHkgd2hlbiBtdWx0aSBmb2xkZXIgd29ya3NwYWNlXG5cdFx0XHRpbnB1dCA9IHJvb3RzO1xuXHRcdH1cblxuXHRcdGxldCB2aWV3U3RhdGU6IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLnRyZWU/LmdldElucHV0KCkpIHtcblx0XHRcdHZpZXdTdGF0ZSA9IHRoaXMudHJlZS5nZXRWaWV3U3RhdGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmF3Vmlld1N0YXRlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoRXhwbG9yZXJWaWV3LlRSRUVfVklFV19TVEFURV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAocmF3Vmlld1N0YXRlKSB7XG5cdFx0XHRcdHZpZXdTdGF0ZSA9IEpTT04ucGFyc2UocmF3Vmlld1N0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c0lucHV0ID0gdGhpcy50cmVlLmdldElucHV0KCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuc2V0VHJlZUlucHV0UHJvbWlzZSA9IHRoaXMudHJlZS5zZXRJbnB1dChpbnB1dCwgdmlld1N0YXRlKS50aGVuKGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSkge1xuXHRcdFx0XHRpZiAoIXZpZXdTdGF0ZSB8fCBwcmV2aW91c0lucHV0IGluc3RhbmNlb2YgRXhwbG9yZXJJdGVtKSB7XG5cdFx0XHRcdFx0Ly8gVGhlcmUgaXMgbm8gdmlldyBzdGF0ZSBmb3IgdGhpcyB3b3Jrc3BhY2UgKHdlIHRyYW5zaXRpb25lZCBmcm9tIGEgZm9sZGVyIHdvcmtzcGFjZT8pLCBleHBhbmQgdXAgdG8gZml2ZSByb290cy5cblx0XHRcdFx0XHQvLyBJZiB0aGVyZSBhcmUgbWFueSByb290cyBpbiBhIHdvcmtzcGFjZSwgZXhwYW5kaW5nIHRoZW0gYWxsIHdvdWxkIGNhbiBjYXVzZSBwZXJmb3JtYW5jZSBpc3N1ZXMgIzE3NjIyNlxuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgTWF0aC5taW4oaW5wdXQubGVuZ3RoLCA1KTsgaSsrKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGlucHV0W2ldKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZWxvYWRlZCBvciB0cmFuc2l0aW9uZWQgZnJvbSBhbiBlbXB0eSB3b3Jrc3BhY2UsIGJ1dCBvbmx5IGhhdmUgYSBzaW5nbGUgZm9sZGVyIGluIHRoZSB3b3Jrc3BhY2UuXG5cdFx0XHRcdGlmICghcHJldmlvdXNJbnB1dCAmJiBpbnB1dC5sZW5ndGggPT09IDEgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLmV4cGxvcmVyLmV4cGFuZFNpbmdsZUZvbGRlcldvcmtzcGFjZXMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGlucHV0WzBdKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHByZXZpb3VzSW5wdXQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJldmlvdXNSb290cyA9IG5ldyBSZXNvdXJjZU1hcDx0cnVlPigpO1xuXHRcdFx0XHRcdHByZXZpb3VzSW5wdXQuZm9yRWFjaChwcmV2aW91c1Jvb3QgPT4gcHJldmlvdXNSb290cy5zZXQocHJldmlvdXNSb290LnJlc291cmNlLCB0cnVlKSk7XG5cblx0XHRcdFx0XHQvLyBSb290cyBhZGRlZCB0byB0aGUgZXhwbG9yZXIgLT4gZXhwYW5kIHRoZW0uXG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5wdXQubWFwKGFzeW5jIGl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFwcmV2aW91c1Jvb3RzLmhhcyhpdGVtLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQoaXRlbSk7XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHsgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGluaXRpYWxJbnB1dFNldHVwKSB7XG5cdFx0XHRcdHBlcmYubWFyaygnY29kZS9kaWRSZXNvbHZlRXhwbG9yZXInKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7XG5cdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHBsb3Jlcixcblx0XHRcdGRlbGF5OiB0aGlzLmxheW91dFNlcnZpY2UuaXNSZXN0b3JlZCgpID8gODAwIDogMTUwMCAvLyByZWR1Y2UgcHJvZ3Jlc3MgdmlzaWJpbGl0eSB3aGVuIHN0aWxsIHJlc3RvcmluZ1xuXHRcdH0sIF9wcm9ncmVzcyA9PiBwcm9taXNlKTtcblxuXHRcdGF3YWl0IHByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2VsZWN0UmVzb3VyY2UocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgcmV2ZWFsID0gdGhpcy5fYXV0b1JldmVhbCwgcmV0cnkgPSAwKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gZG8gbm8gcmV0cnkgbW9yZSB0aGFuIG9uY2UgdG8gcHJldmVudCBpbmZpbml0ZSBsb29wcyBpbiBjYXNlcyBvZiBpbmNvbnNpc3RlbnQgbW9kZWxcblx0XHRpZiAocmV0cnkgPT09IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXJlc291cmNlIHx8ICF0aGlzLmlzQm9keVZpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHNvbWV0aGluZyBpcyByZWZyZXNoaW5nIHRoZSBleHBsb3Jlciwgd2UgbXVzdCBhd2FpdCBpdCBvciBlbHNlIGEgc2VsZWN0aW9uIHJhY2UgY29uZGl0aW9uIGNhbiBvY2N1clxuXHRcdGlmICh0aGlzLnNldFRyZWVJbnB1dFByb21pc2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuc2V0VHJlZUlucHV0UHJvbWlzZTtcblx0XHR9XG5cblx0XHQvLyBFeHBhbmQgYWxsIHN0YXRzIGluIHRoZSBwYXJlbnQgY2hhaW4uXG5cdFx0bGV0IGl0ZW06IEV4cGxvcmVySXRlbSB8IG51bGwgPSB0aGlzLmV4cGxvcmVyU2VydmljZS5maW5kQ2xvc2VzdFJvb3QocmVzb3VyY2UpO1xuXG5cdFx0d2hpbGUgKGl0ZW0gJiYgaXRlbS5yZXNvdXJjZS50b1N0cmluZygpICE9PSByZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKGl0ZW0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZWxlY3RSZXNvdXJjZShyZXNvdXJjZSwgcmV2ZWFsLCByZXRyeSArIDEpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpdGVtLmNoaWxkcmVuLnNpemUpIHtcblx0XHRcdFx0aXRlbSA9IG51bGw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGl0ZW0uY2hpbGRyZW4udmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRpdGVtID0gY2hpbGQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aXRlbSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0aWYgKGl0ZW0gPT09IHRoaXMudHJlZS5nZXRJbnB1dCgpKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFdlIG11c3QgZXhwYW5kIHRoZSBuZXN0IHRvIGhhdmUgaXQgYmUgcG9wdWxhdGVkIGluIHRoZSB0cmVlXG5cdFx0XHRcdGlmIChpdGVtLm5lc3RlZFBhcmVudCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQoaXRlbS5uZXN0ZWRQYXJlbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKChyZXZlYWwgPT09IHRydWUgfHwgcmV2ZWFsID09PSAnZm9yY2UnKSAmJiB0aGlzLnRyZWUuZ2V0UmVsYXRpdmVUb3AoaXRlbSkgPT09IG51bGwpIHtcblx0XHRcdFx0XHQvLyBEb24ndCBzY3JvbGwgdG8gdGhlIGl0ZW0gaWYgaXQncyBhbHJlYWR5IHZpc2libGUsIG9yIGlmIHNldCBub3QgdG8uXG5cdFx0XHRcdFx0dGhpcy50cmVlLnJldmVhbChpdGVtLCAwLjUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtpdGVtXSk7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW2l0ZW1dKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gRWxlbWVudCBtaWdodCBub3QgYmUgaW4gdGhlIHRyZWUsIHRyeSBhZ2FpbiBhbmQgc2lsZW50bHkgZmFpbFxuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZWxlY3RSZXNvdXJjZShyZXNvdXJjZSwgcmV2ZWFsLCByZXRyeSArIDEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGl0ZW1zQ29waWVkKHN0YXRzOiBFeHBsb3Jlckl0ZW1bXSwgY3V0OiBib29sZWFuLCBwcmV2aW91c0N1dDogRXhwbG9yZXJJdGVtW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVDb3BpZWRDb250ZXh0S2V5LnNldChzdGF0cy5sZW5ndGggPiAwKTtcblx0XHR0aGlzLnJlc291cmNlQ3V0Q29udGV4dEtleS5zZXQoY3V0ICYmIHN0YXRzLmxlbmd0aCA+IDApO1xuXHRcdHByZXZpb3VzQ3V0Py5mb3JFYWNoKGl0ZW0gPT4gdGhpcy50cmVlLnJlcmVuZGVyKGl0ZW0pKTtcblx0XHRpZiAoY3V0KSB7XG5cdFx0XHRzdGF0cy5mb3JFYWNoKHMgPT4gdGhpcy50cmVlLnJlcmVuZGVyKHMpKTtcblx0XHR9XG5cdH1cblxuXHRleHBhbmRBbGwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmlzRWRpdGFibGUodW5kZWZpbmVkKSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmVlLmV4cGFuZEFsbCgpO1xuXHR9XG5cblx0Y29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhwbG9yZXJTZXJ2aWNlLmlzRWRpdGFibGUodW5kZWZpbmVkKSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZUlucHV0ID0gdGhpcy50cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodHJlZUlucHV0KSkge1xuXHRcdFx0aWYgKGhhc0V4cGFuZGVkUm9vdENoaWxkKHRoaXMudHJlZSwgdHJlZUlucHV0KSkge1xuXHRcdFx0XHR0cmVlSW5wdXQuZm9yRWFjaChmb2xkZXIgPT4ge1xuXHRcdFx0XHRcdGZvbGRlci5jaGlsZHJlbi5mb3JFYWNoKGNoaWxkID0+IHRoaXMudHJlZS5oYXNOb2RlKGNoaWxkKSAmJiB0aGlzLnRyZWUuY29sbGFwc2UoY2hpbGQsIHRydWUpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHJldmlvdXNDb21wcmVzc2VkU3RhdCgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKCFmb2N1c2VkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcnMgPSB0aGlzLnJlbmRlcmVyLmdldENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihmb2N1c2VkWzBdKSE7XG5cdFx0Y29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycy5mb3JFYWNoKGNvbnRyb2xsZXIgPT4ge1xuXHRcdFx0Y29udHJvbGxlci5wcmV2aW91cygpO1xuXHRcdFx0dGhpcy51cGRhdGVDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRleHRLZXlzKGNvbnRyb2xsZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0bmV4dENvbXByZXNzZWRTdGF0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoIWZvY3VzZWQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycyA9IHRoaXMucmVuZGVyZXIuZ2V0Q29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVyKGZvY3VzZWRbMF0pITtcblx0XHRjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzLmZvckVhY2goY29udHJvbGxlciA9PiB7XG5cdFx0XHRjb250cm9sbGVyLm5leHQoKTtcblx0XHRcdHRoaXMudXBkYXRlQ29tcHJlc3NlZE5hdmlnYXRpb25Db250ZXh0S2V5cyhjb250cm9sbGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGZpcnN0Q29tcHJlc3NlZFN0YXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHRcdGlmICghZm9jdXNlZC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXJzID0gdGhpcy5yZW5kZXJlci5nZXRDb21wcmVzc2VkTmF2aWdhdGlvbkNvbnRyb2xsZXIoZm9jdXNlZFswXSkhO1xuXHRcdGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcnMuZm9yRWFjaChjb250cm9sbGVyID0+IHtcblx0XHRcdGNvbnRyb2xsZXIuZmlyc3QoKTtcblx0XHRcdHRoaXMudXBkYXRlQ29tcHJlc3NlZE5hdmlnYXRpb25Db250ZXh0S2V5cyhjb250cm9sbGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGxhc3RDb21wcmVzc2VkU3RhdCgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cdFx0aWYgKCFmb2N1c2VkLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcnMgPSB0aGlzLnJlbmRlcmVyLmdldENvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcihmb2N1c2VkWzBdKSE7XG5cdFx0Y29tcHJlc3NlZE5hdmlnYXRpb25Db250cm9sbGVycy5mb3JFYWNoKGNvbnRyb2xsZXIgPT4ge1xuXHRcdFx0Y29udHJvbGxlci5sYXN0KCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udGV4dEtleXMoY29udHJvbGxlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udGV4dEtleXMoY29udHJvbGxlcjogSUNvbXByZXNzZWROYXZpZ2F0aW9uQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdHRoaXMuY29tcHJlc3NlZEZvY3VzRmlyc3RDb250ZXh0LnNldChjb250cm9sbGVyLmluZGV4ID09PSAwKTtcblx0XHR0aGlzLmNvbXByZXNzZWRGb2N1c0xhc3RDb250ZXh0LnNldChjb250cm9sbGVyLmluZGV4ID09PSBjb250cm9sbGVyLmNvdW50IC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFueUNvbGxhcHNlZENvbnRleHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdHJlZUlucHV0ID0gdGhpcy50cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKHRyZWVJbnB1dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRyZWVJbnB1dEFycmF5ID0gQXJyYXkuaXNBcnJheSh0cmVlSW5wdXQpID8gdHJlZUlucHV0IDogQXJyYXkuZnJvbSh0cmVlSW5wdXQuY2hpbGRyZW4udmFsdWVzKCkpO1xuXHRcdC8vIEhhcyBjb2xsYXBzaWJsZSByb290IHdoZW4gYW55dGhpbmcgaXMgZXhwYW5kZWRcblx0XHR0aGlzLnZpZXdIYXNTb21lQ29sbGFwc2libGVSb290SXRlbS5zZXQoaGFzRXhwYW5kZWROb2RlKHRoaXMudHJlZSwgdHJlZUlucHV0QXJyYXkpKTtcblx0XHQvLyBzeW5jaHJvbml6ZSBzdGF0ZSB0byBjYWNoZVxuXHRcdHRoaXMuc3RvcmVUcmVlVmlld1N0YXRlKCk7XG5cdH1cblxuXHRoYXNQaGFudG9tRWxlbWVudHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5maW5kUHJvdmlkZXI/LmlzU2hvd2luZ0ZpbHRlclJlc3VsdHMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kcmFnSGFuZGxlcj8uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRmlsZUljb25UaGVtYWJsZVRyZWVDb250YWluZXJTY29wZShjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmaWxlLWljb24tdGhlbWFibGUtdHJlZScpO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2hvdy1maWxlLWljb25zJyk7XG5cblx0Y29uc3Qgb25EaWRDaGFuZ2VGaWxlSWNvblRoZW1lID0gKHRoZW1lOiBJRmlsZUljb25UaGVtZSkgPT4ge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhbGlnbi1pY29ucy1hbmQtdHdpc3RpZXMnLCB0aGVtZS5oYXNGaWxlSWNvbnMgJiYgIXRoZW1lLmhhc0ZvbGRlckljb25zKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZS1hcnJvd3MnLCB0aGVtZS5oaWRlc0V4cGxvcmVyQXJyb3dzID09PSB0cnVlKTtcblx0fTtcblxuXHRvbkRpZENoYW5nZUZpbGVJY29uVGhlbWUodGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWUoKSk7XG5cdHJldHVybiB0aGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKG9uRGlkQ2hhbmdlRmlsZUljb25UaGVtZSk7XG59XG5cbmNvbnN0IENhbkNyZWF0ZUNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5vcihcblx0Ly8gRm9sZGVyOiBjYW4gY3JlYXRlIHVubGVzcyByZWFkb25seVxuXHRDb250ZXh0S2V5RXhwci5hbmQoRXhwbG9yZXJGb2xkZXJDb250ZXh0LCBFeHBsb3JlclJlc291cmNlV3JpdGFibGVDb250ZXh0KSxcblx0Ly8gRmlsZTogY2FuIGNyZWF0ZSB1bmxlc3MgcGFyZW50IGlzIHJlYWRvbmx5XG5cdENvbnRleHRLZXlFeHByLmFuZChFeHBsb3JlckZvbGRlckNvbnRleHQudG9OZWdhdGVkKCksIEV4cGxvcmVyUmVzb3VyY2VQYXJlbnRSZWFkT25seUNvbnRleHQudG9OZWdhdGVkKCkpXG4pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLmNyZWF0ZUZpbGVGcm9tRXhwbG9yZXInLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY3JlYXRlTmV3RmlsZScsIFwiTmV3IEZpbGUuLi5cIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLm5ld0ZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IENhbkNyZWF0ZUNvbnRleHQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSxcblx0XHRcdFx0b3JkZXI6IDEwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE5FV19GSUxFX0NPTU1BTkRfSUQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5jcmVhdGVGb2xkZXJGcm9tRXhwbG9yZXInLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY3JlYXRlTmV3Rm9sZGVyJywgXCJOZXcgRm9sZGVyLi4uXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5uZXdGb2xkZXIsXG5cdFx0XHRwcmVjb25kaXRpb246IENhbkNyZWF0ZUNvbnRleHQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSxcblx0XHRcdFx0b3JkZXI6IDIwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE5FV19GT0xERVJfQ09NTUFORF9JRCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLnJlZnJlc2hGaWxlc0V4cGxvcmVyJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZWZyZXNoRXhwbG9yZXInLCBcIlJlZnJlc2ggRXhwbG9yZXJcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfSUQpLFxuXHRcdFx0XHRvcmRlcjogMzAsXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3JlZnJlc2hFeHBsb3Jlck1ldGFkYXRhJywgXCJGb3JjZXMgYSByZWZyZXNoIG9mIHRoZSBFeHBsb3Jlci5cIilcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IEV4cGxvcmVyRmluZFByb3ZpZGVyQWN0aXZlLm5lZ2F0ZSgpXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhWSUVXX0lEKTtcblx0XHRhd2FpdCBleHBsb3JlclNlcnZpY2UucmVmcmVzaCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmZpbGVzLmFjdGlvbi5jb2xsYXBzZUV4cGxvcmVyRm9sZGVycycsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignY29sbGFwc2VFeHBsb3JlckZvbGRlcnMnLCBcIkNvbGxhcHNlIEZvbGRlcnMgaW4gRXhwbG9yZXJcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSxcblx0XHRcdFx0b3JkZXI6IDQwXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2NvbGxhcHNlRXhwbG9yZXJGb2xkZXJzTWV0YWRhdGEnLCBcIkZvbGRzIGFsbCBmb2xkZXJzIGluIHRoZSBFeHBsb3Jlci5cIilcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3ID0gdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQoVklFV19JRCk7XG5cdFx0aWYgKHZpZXcgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGV4cGxvcmVyVmlldyA9IHZpZXcgYXMgRXhwbG9yZXJWaWV3O1xuXHRcdFx0ZXhwbG9yZXJWaWV3LmNvbGxhcHNlQWxsKCk7XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFlBQVksVUFBVTtBQUV0QixTQUFTLGVBQWU7QUFDeEIsU0FBOEIsdUJBQXVCLDZCQUE2Qix3QkFBd0IscUJBQXFCLGlDQUFpQyxxQkFBcUIsaUNBQWlDLGdDQUFnQyxxQ0FBcUMsb0NBQW9DLDJDQUEyQyxTQUFTLGlDQUFpQyx1Q0FBdUMsMkJBQTJCLHVDQUF1QyxrQ0FBa0M7QUFDL2hCLFNBQVMsbUJBQW1CLHFCQUFxQiw2QkFBNkI7QUFDOUUsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLDZCQUF3RDtBQUNqRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBaUMsc0JBQXNCO0FBQ2hFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCLFlBQVksb0JBQW9CO0FBQ3pELFNBQTJCLGdCQUFnQjtBQUMzQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQixvQkFBb0IsZUFB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QUFDbkQsbUJBQWUsZUFBZSxxQkFBcUI7QUFBQSxFQUNwRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sSUFBSSxVQUFVLG1CQUFtQixrQkFBa0I7QUFBQSxNQUMxRCxJQUFJO0FBQUEsTUFDSixNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLE9BQU8sUUFBUSxPQUFPO0FBQUEsUUFDM0MsT0FBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULGFBQWEsSUFBSSxVQUFVLDJCQUEyQixtQ0FBbUM7QUFBQSxNQUMxRjtBQUFBLE1BQ0EsY0FBYywyQkFBMkIsT0FBTztBQUFBLElBQ2pELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFVBQU0sa0JBQWtCLFNBQVMsSUFBSSxnQkFBZ0I7QUFDckQsVUFBTSxhQUFhLFNBQVMsT0FBTztBQUNuQyxVQUFNLGdCQUFnQixRQUFRO0FBQUEsRUFDL0I7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSwyQkFBMkIsOEJBQThCO0FBQUEsTUFDOUUsSUFBSTtBQUFBLE1BQ0osTUFBTSxRQUFRO0FBQUEsTUFDZCxNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE1BQU0sZUFBZSxPQUFPLFFBQVEsT0FBTztBQUFBLFFBQzNDLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxhQUFhLElBQUksVUFBVSxtQ0FBbUMsb0NBQW9DO0FBQUEsTUFDbkc7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQTRCO0FBQy9CLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxVQUFNLE9BQU8sYUFBYSxjQUFjLE9BQU87QUFDL0MsUUFBSSxTQUFTLE1BQU07QUFDbEIsWUFBTSxlQUFlO0FBQ3JCLG1CQUFhLFlBQVk7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
