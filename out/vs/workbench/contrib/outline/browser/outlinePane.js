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
import "./outlinePane.css";
import * as dom from "../../../../base/browser/dom.js";
import { ProgressBar } from "../../../../base/browser/ui/progressbar/progressbar.js";
import { TimeoutTimer, timeout } from "../../../../base/common/async.js";
import { toDisposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../base/common/map.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchDataTree } from "../../../../platform/list/browser/listService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { basename } from "../../../../base/common/resources.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { OutlineViewState } from "./outlineViewState.js";
import { IOutlineService, OutlineTarget } from "../../../services/outline/browser/outline.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { AbstractTreeViewState, TreeFindMode } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ctxAllCollapsed, ctxFilterOnType, ctxFocused, ctxFollowsCursor, ctxSortMode, OutlineSortOrder } from "./outline.js";
import { defaultProgressBarStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
class OutlineTreeSorter {
  constructor(_comparator, order) {
    this._comparator = _comparator;
    this.order = order;
  }
  compare(a, b) {
    if (this.order === OutlineSortOrder.ByKind) {
      return this._comparator.compareByType(a, b);
    } else if (this.order === OutlineSortOrder.ByName) {
      return this._comparator.compareByName(a, b);
    } else {
      return this._comparator.compareByPosition(a, b);
    }
  }
}
let OutlinePane = class extends ViewPane {
  constructor(options, _outlineService, _instantiationService, viewDescriptorService, _storageService, _editorService, configurationService, keybindingService, contextKeyService, contextMenuService, openerService, themeService, hoverService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, _instantiationService, openerService, themeService, hoverService);
    this._outlineService = _outlineService;
    this._instantiationService = _instantiationService;
    this._storageService = _storageService;
    this._editorService = _editorService;
    this._disposables = new DisposableStore();
    this._editorControlDisposables = new DisposableStore();
    this._editorPaneDisposables = new DisposableStore();
    this._outlineViewState = new OutlineViewState();
    this._editorListener = new MutableDisposable();
    this._treeStates = new LRUCache(10);
    this._editorControlChangePromise = Promise.resolve();
    this._outlineViewState.restore(this._storageService);
    this._disposables.add(this._outlineViewState);
    contextKeyService.bufferChangeEvents(() => {
      this._ctxFollowsCursor = ctxFollowsCursor.bindTo(contextKeyService);
      this._ctxFilterOnType = ctxFilterOnType.bindTo(contextKeyService);
      this._ctxSortMode = ctxSortMode.bindTo(contextKeyService);
      this._ctxAllCollapsed = ctxAllCollapsed.bindTo(contextKeyService);
    });
    const updateContext = () => {
      this._ctxFollowsCursor.set(this._outlineViewState.followCursor);
      this._ctxFilterOnType.set(this._outlineViewState.filterOnType);
      this._ctxSortMode.set(this._outlineViewState.sortBy);
    };
    updateContext();
    this._disposables.add(this._outlineViewState.onDidChange(updateContext));
  }
  dispose() {
    this._disposables.dispose();
    this._editorPaneDisposables.dispose();
    this._editorControlDisposables.dispose();
    this._editorListener.dispose();
    super.dispose();
  }
  focus() {
    this._editorControlChangePromise.then(() => {
      super.focus();
      this._tree?.domFocus();
    });
  }
  renderBody(container) {
    super.renderBody(container);
    this._domNode = container;
    container.classList.add("outline-pane");
    const progressContainer = dom.$(".outline-progress");
    this._message = dom.$(".outline-message");
    this._progressBar = new ProgressBar(progressContainer, defaultProgressBarStyles);
    this._treeContainer = dom.$(".outline-tree");
    dom.append(container, progressContainer, this._message, this._treeContainer);
    this._disposables.add(this.onDidChangeBodyVisibility((visible) => {
      if (!visible) {
        this._editorListener.clear();
        this._editorPaneDisposables.clear();
        this._editorControlDisposables.clear();
      } else if (!this._editorListener.value) {
        const event = Event.any(this._editorService.onDidActiveEditorChange, this._outlineService.onDidChange);
        this._editorListener.value = event(() => this._handleEditorChanged(this._editorService.activeEditorPane));
        this._handleEditorChanged(this._editorService.activeEditorPane);
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._tree?.layout(height, width);
    this._treeDimensions = new dom.Dimension(width, height);
  }
  collapseAll() {
    this._tree?.collapseAll();
  }
  expandAll() {
    this._tree?.expandAll();
  }
  get outlineViewState() {
    return this._outlineViewState;
  }
  _showMessage(message) {
    this._domNode.classList.add("message");
    this._progressBar.stop().hide();
    this._message.textContent = message;
  }
  _captureViewState(uri) {
    if (this._tree) {
      const oldOutline = this._tree.getInput();
      if (!uri) {
        uri = oldOutline?.uri;
      }
      if (oldOutline && uri) {
        this._treeStates.set(`${oldOutline.outlineKind}/${uri}`, this._tree.getViewState());
        return true;
      }
    }
    return false;
  }
  _handleEditorChanged(pane) {
    this._editorPaneDisposables.clear();
    if (pane) {
      this._editorPaneDisposables.add(pane.onDidChangeControl(() => {
        this._editorControlChangePromise = this._handleEditorControlChanged(pane);
      }));
    }
    this._editorControlChangePromise = this._handleEditorControlChanged(pane);
  }
  async _handleEditorControlChanged(pane) {
    const resource = EditorResourceAccessor.getOriginalUri(pane?.input);
    const didCapture = this._captureViewState();
    this._editorControlDisposables.clear();
    if (!pane || !this._outlineService.canCreateOutline(pane) || !resource) {
      return this._showMessage(localize("no-editor", "The active editor cannot provide outline information."));
    }
    let loadingMessage;
    if (!didCapture) {
      loadingMessage = new TimeoutTimer(() => {
        this._showMessage(localize("loading", "Loading document symbols for '{0}'...", basename(resource)));
      }, 100);
    }
    this._progressBar.infinite().show(500);
    const cts = new CancellationTokenSource();
    this._editorControlDisposables.add(toDisposable(() => cts.dispose(true)));
    const newOutline = await this._outlineService.createOutline(pane, OutlineTarget.OutlinePane, cts.token);
    loadingMessage?.dispose();
    if (!newOutline) {
      return;
    }
    if (cts.token.isCancellationRequested) {
      newOutline?.dispose();
      return;
    }
    this._editorControlDisposables.add(newOutline);
    this._progressBar.stop().hide();
    const sorter = new OutlineTreeSorter(newOutline.config.comparator, this._outlineViewState.sortBy);
    const tree = this._instantiationService.createInstance(
      WorkbenchDataTree,
      "OutlinePane",
      this._treeContainer,
      newOutline.config.delegate,
      newOutline.config.renderers,
      newOutline.config.treeDataSource,
      {
        ...newOutline.config.options,
        sorter,
        expandOnDoubleClick: false,
        expandOnlyOnTwistieClick: true,
        multipleSelectionSupport: false,
        hideTwistiesOfChildlessElements: true,
        defaultFindMode: this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles
      }
    );
    ctxFocused.bindTo(tree.contextKeyService);
    const updateTree = () => {
      if (newOutline.isEmpty) {
        this._showMessage(localize("no-symbols", "No symbols found in document '{0}'", basename(resource)));
        this._captureViewState(resource);
        tree.setInput(void 0);
      } else if (!tree.getInput()) {
        this._domNode.classList.remove("message");
        const state = this._treeStates.get(`${newOutline.outlineKind}/${newOutline.uri}`);
        tree.setInput(newOutline, state && AbstractTreeViewState.lift(state));
      } else {
        this._domNode.classList.remove("message");
        tree.updateChildren();
      }
    };
    updateTree();
    this._editorControlDisposables.add(newOutline.onDidChange(updateTree));
    this._editorControlDisposables.add(this.viewDescriptorService.onDidChangeLocation(({ views }) => {
      if (views.some((v) => v.id === this.id)) {
        tree.updateOptions({ overrideStyles: this.getLocationBasedColors().listOverrideStyles });
      }
    }));
    this._editorControlDisposables.add(tree.onDidChangeFindMode((mode) => this._outlineViewState.filterOnType = mode === TreeFindMode.Filter));
    let idPool = 0;
    this._editorControlDisposables.add(tree.onDidOpen(async (e) => {
      const myId = ++idPool;
      const isDoubleClick = e.browserEvent?.type === "dblclick";
      if (!isDoubleClick) {
        await timeout(150);
        if (myId !== idPool) {
          return;
        }
      }
      await newOutline.reveal(e.element, e.editorOptions, e.sideBySide, isDoubleClick);
    }));
    const revealActiveElement = () => {
      if (!this._outlineViewState.followCursor || !newOutline.activeElement) {
        return;
      }
      let item = newOutline.activeElement;
      while (item) {
        const top = tree.getRelativeTop(item);
        if (top === null) {
          tree.reveal(item, 0.5);
        }
        if (tree.getRelativeTop(item) !== null) {
          tree.setFocus([item]);
          tree.setSelection([item]);
          break;
        }
        item = tree.getParentElement(item);
      }
    };
    revealActiveElement();
    this._editorControlDisposables.add(newOutline.onDidChange(revealActiveElement));
    this._editorControlDisposables.add(this._outlineViewState.onDidChange((e) => {
      this._outlineViewState.persist(this._storageService);
      if (e.filterOnType) {
        tree.findMode = this._outlineViewState.filterOnType ? TreeFindMode.Filter : TreeFindMode.Highlight;
      }
      if (e.followCursor) {
        revealActiveElement();
      }
      if (e.sortBy) {
        sorter.order = this._outlineViewState.sortBy;
        tree.resort();
      }
    }));
    let viewState;
    this._editorControlDisposables.add(tree.onDidChangeFindPattern((pattern) => {
      if (tree.findMode === TreeFindMode.Highlight) {
        return;
      }
      if (!viewState && pattern) {
        viewState = tree.getViewState();
        tree.expandAll();
      } else if (!pattern && viewState) {
        tree.setInput(tree.getInput(), viewState);
        viewState = void 0;
      }
    }));
    const updateAllCollapsedCtx = () => {
      this._ctxAllCollapsed.set(tree.getNode(null).children.every((node) => !node.collapsible || node.collapsed));
    };
    this._editorControlDisposables.add(tree.onDidChangeCollapseState(updateAllCollapsedCtx));
    this._editorControlDisposables.add(tree.onDidChangeModel(updateAllCollapsedCtx));
    updateAllCollapsedCtx();
    tree.layout(this._treeDimensions?.height, this._treeDimensions?.width);
    this._tree = tree;
    this._editorControlDisposables.add(toDisposable(() => {
      tree.dispose();
      this._tree = void 0;
    }));
  }
};
OutlinePane.Id = "outline";
OutlinePane = __decorateClass([
  __decorateParam(1, IOutlineService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IContextMenuService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService)
], OutlinePane);
export {
  OutlinePane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG91dGxpbmVcXGJyb3dzZXJcXG91dGxpbmVQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL291dGxpbmVQYW5lLmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaERhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3bGV0Vmlld09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdzVmlld2xldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgT3V0bGluZVZpZXdTdGF0ZSB9IGZyb20gJy4vb3V0bGluZVZpZXdTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZSwgSU91dGxpbmVDb21wYXJhdG9yLCBJT3V0bGluZVNlcnZpY2UsIE91dGxpbmVUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVHJlZVNvcnRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUcmVlVmlld1N0YXRlLCBJQWJzdHJhY3RUcmVlVmlld1N0YXRlLCBUcmVlRmluZE1vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGN0eEFsbENvbGxhcHNlZCwgY3R4RmlsdGVyT25UeXBlLCBjdHhGb2N1c2VkLCBjdHhGb2xsb3dzQ3Vyc29yLCBjdHhTb3J0TW9kZSwgSU91dGxpbmVQYW5lLCBPdXRsaW5lU29ydE9yZGVyIH0gZnJvbSAnLi9vdXRsaW5lLmpzJztcbmltcG9ydCB7IGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmNsYXNzIE91dGxpbmVUcmVlU29ydGVyPEU+IGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8RT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2NvbXBhcmF0b3I6IElPdXRsaW5lQ29tcGFyYXRvcjxFPixcblx0XHRwdWJsaWMgb3JkZXI6IE91dGxpbmVTb3J0T3JkZXJcblx0KSB7IH1cblxuXHRjb21wYXJlKGE6IEUsIGI6IEUpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLm9yZGVyID09PSBPdXRsaW5lU29ydE9yZGVyLkJ5S2luZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbXBhcmF0b3IuY29tcGFyZUJ5VHlwZShhLCBiKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMub3JkZXIgPT09IE91dGxpbmVTb3J0T3JkZXIuQnlOYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tcGFyYXRvci5jb21wYXJlQnlOYW1lKGEsIGIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29tcGFyYXRvci5jb21wYXJlQnlQb3NpdGlvbihhLCBiKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE91dGxpbmVQYW5lIGV4dGVuZHMgVmlld1BhbmUgaW1wbGVtZW50cyBJT3V0bGluZVBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJZCA9ICdvdXRsaW5lJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclBhbmVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb3V0bGluZVZpZXdTdGF0ZSA9IG5ldyBPdXRsaW5lVmlld1N0YXRlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yTGlzdGVuZXIgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblxuXHRwcml2YXRlIF9kb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX21lc3NhZ2UhOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSBfcHJvZ3Jlc3NCYXIhOiBQcm9ncmVzc0Jhcjtcblx0cHJpdmF0ZSBfdHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF90cmVlPzogV29ya2JlbmNoRGF0YVRyZWU8SU91dGxpbmU8dW5rbm93bj4gfCB1bmRlZmluZWQsIHVua25vd24sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIF90cmVlRGltZW5zaW9ucz86IGRvbS5EaW1lbnNpb247XG5cdHByaXZhdGUgX3RyZWVTdGF0ZXMgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBJQWJzdHJhY3RUcmVlVmlld1N0YXRlPigxMCk7XG5cblx0cHJpdmF0ZSBfY3R4Rm9sbG93c0N1cnNvciE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9jdHhGaWx0ZXJPblR5cGUhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfY3R4U29ydE1vZGUhOiBJQ29udGV4dEtleTxPdXRsaW5lU29ydE9yZGVyPjtcblx0cHJpdmF0ZSBfY3R4QWxsQ29sbGFwc2VkITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdsZXRWaWV3T3B0aW9ucyxcblx0XHRASU91dGxpbmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX291dGxpbmVTZXJ2aWNlOiBJT3V0bGluZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIF9pbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdHRoaXMuX291dGxpbmVWaWV3U3RhdGUucmVzdG9yZSh0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX291dGxpbmVWaWV3U3RhdGUpO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX2N0eEZvbGxvd3NDdXJzb3IgPSBjdHhGb2xsb3dzQ3Vyc29yLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdHhGaWx0ZXJPblR5cGUgPSBjdHhGaWx0ZXJPblR5cGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N0eFNvcnRNb2RlID0gY3R4U29ydE1vZGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N0eEFsbENvbGxhcHNlZCA9IGN0eEFsbENvbGxhcHNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdXBkYXRlQ29udGV4dCA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2N0eEZvbGxvd3NDdXJzb3Iuc2V0KHRoaXMuX291dGxpbmVWaWV3U3RhdGUuZm9sbG93Q3Vyc29yKTtcblx0XHRcdHRoaXMuX2N0eEZpbHRlck9uVHlwZS5zZXQodGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5maWx0ZXJPblR5cGUpO1xuXHRcdFx0dGhpcy5fY3R4U29ydE1vZGUuc2V0KHRoaXMuX291dGxpbmVWaWV3U3RhdGUuc29ydEJ5KTtcblx0XHR9O1xuXHRcdHVwZGF0ZUNvbnRleHQoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5vbkRpZENoYW5nZSh1cGRhdGVDb250ZXh0KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3JQYW5lRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZWRpdG9yTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xDaGFuZ2VQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRcdHRoaXMuX3RyZWU/LmRvbUZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGNvbnRhaW5lcjtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnb3V0bGluZS1wYW5lJyk7XG5cblx0XHRjb25zdCBwcm9ncmVzc0NvbnRhaW5lciA9IGRvbS4kKCcub3V0bGluZS1wcm9ncmVzcycpO1xuXHRcdHRoaXMuX21lc3NhZ2UgPSBkb20uJCgnLm91dGxpbmUtbWVzc2FnZScpO1xuXG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIgPSBuZXcgUHJvZ3Jlc3NCYXIocHJvZ3Jlc3NDb250YWluZXIsIGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyk7XG5cblx0XHR0aGlzLl90cmVlQ29udGFpbmVyID0gZG9tLiQoJy5vdXRsaW5lLXRyZWUnKTtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgcHJvZ3Jlc3NDb250YWluZXIsIHRoaXMuX21lc3NhZ2UsIHRoaXMuX3RyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHQvLyBzdG9wIGV2ZXJ5dGhpbmcgd2hlbiBub3QgdmlzaWJsZVxuXHRcdFx0XHR0aGlzLl9lZGl0b3JMaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JQYW5lRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuX2VkaXRvckxpc3RlbmVyLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gRXZlbnQuYW55KHRoaXMuX2VkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsIHRoaXMuX291dGxpbmVTZXJ2aWNlLm9uRGlkQ2hhbmdlKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yTGlzdGVuZXIudmFsdWUgPSBldmVudCgoKSA9PiB0aGlzLl9oYW5kbGVFZGl0b3JDaGFuZ2VkKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSkpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVFZGl0b3JDaGFuZ2VkKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuX3RyZWU/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl90cmVlRGltZW5zaW9ucyA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0Y29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZT8uY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlPy5leHBhbmRBbGwoKTtcblx0fVxuXG5cdGdldCBvdXRsaW5lVmlld1N0YXRlKCkge1xuXHRcdHJldHVybiB0aGlzLl9vdXRsaW5lVmlld1N0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0dGhpcy5fcHJvZ3Jlc3NCYXIuc3RvcCgpLmhpZGUoKTtcblx0XHR0aGlzLl9tZXNzYWdlLnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0fVxuXG5cdHByaXZhdGUgX2NhcHR1cmVWaWV3U3RhdGUodXJpPzogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3RyZWUpIHtcblx0XHRcdGNvbnN0IG9sZE91dGxpbmUgPSB0aGlzLl90cmVlLmdldElucHV0KCk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHR1cmkgPSBvbGRPdXRsaW5lPy51cmk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob2xkT3V0bGluZSAmJiB1cmkpIHtcblx0XHRcdFx0dGhpcy5fdHJlZVN0YXRlcy5zZXQoYCR7b2xkT3V0bGluZS5vdXRsaW5lS2luZH0vJHt1cml9YCwgdGhpcy5fdHJlZS5nZXRWaWV3U3RhdGUoKSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9lZGl0b3JDb250cm9sQ2hhbmdlUHJvbWlzZTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF9oYW5kbGVFZGl0b3JDaGFuZ2VkKHBhbmU6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yUGFuZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAocGFuZSkge1xuXHRcdFx0Ly8gcmVhY3QgdG8gY29udHJvbCBjaGFuZ2VzIGZyb20gd2l0aGluIHBhbmUgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzQwMDgpXG5cdFx0XHR0aGlzLl9lZGl0b3JQYW5lRGlzcG9zYWJsZXMuYWRkKHBhbmUub25EaWRDaGFuZ2VDb250cm9sKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yQ29udHJvbENoYW5nZVByb21pc2UgPSB0aGlzLl9oYW5kbGVFZGl0b3JDb250cm9sQ2hhbmdlZChwYW5lKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JDb250cm9sQ2hhbmdlUHJvbWlzZSA9IHRoaXMuX2hhbmRsZUVkaXRvckNvbnRyb2xDaGFuZ2VkKHBhbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRWRpdG9yQ29udHJvbENoYW5nZWQocGFuZTogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIHBlcnNpc3Qgc3RhdGVcblx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkocGFuZT8uaW5wdXQpO1xuXHRcdGNvbnN0IGRpZENhcHR1cmUgPSB0aGlzLl9jYXB0dXJlVmlld1N0YXRlKCk7XG5cblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICghcGFuZSB8fCAhdGhpcy5fb3V0bGluZVNlcnZpY2UuY2FuQ3JlYXRlT3V0bGluZShwYW5lKSB8fCAhcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zaG93TWVzc2FnZShsb2NhbGl6ZSgnbm8tZWRpdG9yJywgXCJUaGUgYWN0aXZlIGVkaXRvciBjYW5ub3QgcHJvdmlkZSBvdXRsaW5lIGluZm9ybWF0aW9uLlwiKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGxvYWRpbmdNZXNzYWdlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWRpZENhcHR1cmUpIHtcblx0XHRcdGxvYWRpbmdNZXNzYWdlID0gbmV3IFRpbWVvdXRUaW1lcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Nob3dNZXNzYWdlKGxvY2FsaXplKCdsb2FkaW5nJywgXCJMb2FkaW5nIGRvY3VtZW50IHN5bWJvbHMgZm9yICd7MH0nLi4uXCIsIGJhc2VuYW1lKHJlc291cmNlKSkpO1xuXHRcdFx0fSwgMTAwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm9ncmVzc0Jhci5pbmZpbml0ZSgpLnNob3coNTAwKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRjb25zdCBuZXdPdXRsaW5lID0gYXdhaXQgdGhpcy5fb3V0bGluZVNlcnZpY2UuY3JlYXRlT3V0bGluZShwYW5lLCBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lLCBjdHMudG9rZW4pO1xuXHRcdGxvYWRpbmdNZXNzYWdlPy5kaXNwb3NlKCk7XG5cblx0XHRpZiAoIW5ld091dGxpbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRuZXdPdXRsaW5lPy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZChuZXdPdXRsaW5lKTtcblx0XHR0aGlzLl9wcm9ncmVzc0Jhci5zdG9wKCkuaGlkZSgpO1xuXG5cdFx0Y29uc3Qgc29ydGVyID0gbmV3IE91dGxpbmVUcmVlU29ydGVyKG5ld091dGxpbmUuY29uZmlnLmNvbXBhcmF0b3IsIHRoaXMuX291dGxpbmVWaWV3U3RhdGUuc29ydEJ5KTtcblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaERhdGFUcmVlPElPdXRsaW5lPHVua25vd24+IHwgdW5kZWZpbmVkLCB1bmtub3duLCBGdXp6eVNjb3JlPixcblx0XHRcdCdPdXRsaW5lUGFuZScsXG5cdFx0XHR0aGlzLl90cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3T3V0bGluZS5jb25maWcuZGVsZWdhdGUsXG5cdFx0XHRuZXdPdXRsaW5lLmNvbmZpZy5yZW5kZXJlcnMsXG5cdFx0XHRuZXdPdXRsaW5lLmNvbmZpZy50cmVlRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0Li4ubmV3T3V0bGluZS5jb25maWcub3B0aW9ucyxcblx0XHRcdFx0c29ydGVyLFxuXHRcdFx0XHRleHBhbmRPbkRvdWJsZUNsaWNrOiBmYWxzZSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHRoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1vZGU6IHRoaXMuX291dGxpbmVWaWV3U3RhdGUuZmlsdGVyT25UeXBlID8gVHJlZUZpbmRNb2RlLkZpbHRlciA6IFRyZWVGaW5kTW9kZS5IaWdobGlnaHQsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y3R4Rm9jdXNlZC5iaW5kVG8odHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyB1cGRhdGUgdHJlZSwgbGlzdGVuIHRvIGNoYW5nZXNcblx0XHRjb25zdCB1cGRhdGVUcmVlID0gKCkgPT4ge1xuXHRcdFx0aWYgKG5ld091dGxpbmUuaXNFbXB0eSkge1xuXHRcdFx0XHQvLyBubyBtb3JlIGVsZW1lbnRzXG5cdFx0XHRcdHRoaXMuX3Nob3dNZXNzYWdlKGxvY2FsaXplKCduby1zeW1ib2xzJywgXCJObyBzeW1ib2xzIGZvdW5kIGluIGRvY3VtZW50ICd7MH0nXCIsIGJhc2VuYW1lKHJlc291cmNlKSkpO1xuXHRcdFx0XHR0aGlzLl9jYXB0dXJlVmlld1N0YXRlKHJlc291cmNlKTtcblx0XHRcdFx0dHJlZS5zZXRJbnB1dCh1bmRlZmluZWQpO1xuXG5cdFx0XHR9IGVsc2UgaWYgKCF0cmVlLmdldElucHV0KCkpIHtcblx0XHRcdFx0Ly8gZmlyc3Q6IGluaXQgdHJlZVxuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ21lc3NhZ2UnKTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl90cmVlU3RhdGVzLmdldChgJHtuZXdPdXRsaW5lLm91dGxpbmVLaW5kfS8ke25ld091dGxpbmUudXJpfWApO1xuXHRcdFx0XHR0cmVlLnNldElucHV0KG5ld091dGxpbmUsIHN0YXRlICYmIEFic3RyYWN0VHJlZVZpZXdTdGF0ZS5saWZ0KHN0YXRlKSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHVwZGF0ZTogcmVmcmVzaCB0cmVlXG5cdFx0XHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnbWVzc2FnZScpO1xuXHRcdFx0XHR0cmVlLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR1cGRhdGVUcmVlKCk7XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZChuZXdPdXRsaW5lLm9uRGlkQ2hhbmdlKHVwZGF0ZVRyZWUpKTtcblxuXHRcdC8vIGZlYXR1cmU6IGFwcGx5IHBhbmVsIGJhY2tncm91bmQgdG8gdHJlZVxuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VMb2NhdGlvbigoeyB2aWV3cyB9KSA9PiB7XG5cdFx0XHRpZiAodmlld3Muc29tZSh2ID0+IHYuaWQgPT09IHRoaXMuaWQpKSB7XG5cdFx0XHRcdHRyZWUudXBkYXRlT3B0aW9ucyh7IG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZmVhdHVyZTogZmlsdGVyIG9uIHR5cGUgLSBrZWVwIHRyZWUgYW5kIG1lbnUgaW4gc3luY1xuXHRcdHRoaXMuX2VkaXRvckNvbnRyb2xEaXNwb3NhYmxlcy5hZGQodHJlZS5vbkRpZENoYW5nZUZpbmRNb2RlKG1vZGUgPT4gdGhpcy5fb3V0bGluZVZpZXdTdGF0ZS5maWx0ZXJPblR5cGUgPSBtb2RlID09PSBUcmVlRmluZE1vZGUuRmlsdGVyKSk7XG5cblx0XHQvLyBmZWF0dXJlOiByZXZlYWwgb3V0bGluZSBzZWxlY3Rpb24gaW4gZWRpdG9yXG5cdFx0Ly8gb24gY2hhbmdlIC0+IHJldmVhbC9zZWxlY3QgZGVmaW5pbmcgcmFuZ2Vcblx0XHRsZXQgaWRQb29sID0gMDtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRPcGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgbXlJZCA9ICsraWRQb29sO1xuXHRcdFx0Y29uc3QgaXNEb3VibGVDbGljayA9IGUuYnJvd3NlckV2ZW50Py50eXBlID09PSAnZGJsY2xpY2snO1xuXHRcdFx0aWYgKCFpc0RvdWJsZUNsaWNrKSB7XG5cdFx0XHRcdC8vIHdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDY0MjRcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxNTApO1xuXHRcdFx0XHRpZiAobXlJZCAhPT0gaWRQb29sKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBuZXdPdXRsaW5lLnJldmVhbChlLmVsZW1lbnQsIGUuZWRpdG9yT3B0aW9ucywgZS5zaWRlQnlTaWRlLCBpc0RvdWJsZUNsaWNrKTtcblx0XHR9KSk7XG5cdFx0Ly8gZmVhdHVyZTogcmV2ZWFsIGVkaXRvciBzZWxlY3Rpb24gaW4gb3V0bGluZVxuXHRcdGNvbnN0IHJldmVhbEFjdGl2ZUVsZW1lbnQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX291dGxpbmVWaWV3U3RhdGUuZm9sbG93Q3Vyc29yIHx8ICFuZXdPdXRsaW5lLmFjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGl0ZW0gPSBuZXdPdXRsaW5lLmFjdGl2ZUVsZW1lbnQ7XG5cdFx0XHR3aGlsZSAoaXRlbSkge1xuXHRcdFx0XHRjb25zdCB0b3AgPSB0cmVlLmdldFJlbGF0aXZlVG9wKGl0ZW0pO1xuXHRcdFx0XHRpZiAodG9wID09PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gbm90IHZpc2libGUgLT4gcmV2ZWFsXG5cdFx0XHRcdFx0dHJlZS5yZXZlYWwoaXRlbSwgMC41KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHJlZS5nZXRSZWxhdGl2ZVRvcChpdGVtKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHRyZWUuc2V0Rm9jdXMoW2l0ZW1dKTtcblx0XHRcdFx0XHR0cmVlLnNldFNlbGVjdGlvbihbaXRlbV0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFNUSUxMIG5vdCB2aXNpYmxlIC0+IHRyeSBwYXJlbnRcblx0XHRcdFx0aXRlbSA9IHRyZWUuZ2V0UGFyZW50RWxlbWVudChpdGVtKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHJldmVhbEFjdGl2ZUVsZW1lbnQoKTtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKG5ld091dGxpbmUub25EaWRDaGFuZ2UocmV2ZWFsQWN0aXZlRWxlbWVudCkpO1xuXG5cdFx0Ly8gZmVhdHVyZTogdXBkYXRlIHZpZXcgd2hlbiB1c2VyIHN0YXRlIGNoYW5nZXNcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRoaXMuX291dGxpbmVWaWV3U3RhdGUub25EaWRDaGFuZ2UoKGU6IHsgZm9sbG93Q3Vyc29yPzogYm9vbGVhbjsgc29ydEJ5PzogYm9vbGVhbjsgZmlsdGVyT25UeXBlPzogYm9vbGVhbiB9KSA9PiB7XG5cdFx0XHR0aGlzLl9vdXRsaW5lVmlld1N0YXRlLnBlcnNpc3QodGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0aWYgKGUuZmlsdGVyT25UeXBlKSB7XG5cdFx0XHRcdHRyZWUuZmluZE1vZGUgPSB0aGlzLl9vdXRsaW5lVmlld1N0YXRlLmZpbHRlck9uVHlwZSA/IFRyZWVGaW5kTW9kZS5GaWx0ZXIgOiBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuZm9sbG93Q3Vyc29yKSB7XG5cdFx0XHRcdHJldmVhbEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLnNvcnRCeSkge1xuXHRcdFx0XHRzb3J0ZXIub3JkZXIgPSB0aGlzLl9vdXRsaW5lVmlld1N0YXRlLnNvcnRCeTtcblx0XHRcdFx0dHJlZS5yZXNvcnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBmZWF0dXJlOiBleHBhbmQgYWxsIG5vZGVzIHdoZW4gZmlsdGVyaW5nIChub3Qgd2hlbiBmaW5kaW5nKVxuXHRcdGxldCB2aWV3U3RhdGU6IEFic3RyYWN0VHJlZVZpZXdTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRDaGFuZ2VGaW5kUGF0dGVybihwYXR0ZXJuID0+IHtcblx0XHRcdGlmICh0cmVlLmZpbmRNb2RlID09PSBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdmlld1N0YXRlICYmIHBhdHRlcm4pIHtcblx0XHRcdFx0dmlld1N0YXRlID0gdHJlZS5nZXRWaWV3U3RhdGUoKTtcblx0XHRcdFx0dHJlZS5leHBhbmRBbGwoKTtcblx0XHRcdH0gZWxzZSBpZiAoIXBhdHRlcm4gJiYgdmlld1N0YXRlKSB7XG5cdFx0XHRcdHRyZWUuc2V0SW5wdXQodHJlZS5nZXRJbnB1dCgpISwgdmlld1N0YXRlKTtcblx0XHRcdFx0dmlld1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGZlYXR1cmU6IHVwZGF0ZSBhbGwtY29sbGFwc2VkIGNvbnRleHQga2V5XG5cdFx0Y29uc3QgdXBkYXRlQWxsQ29sbGFwc2VkQ3R4ID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fY3R4QWxsQ29sbGFwc2VkLnNldCh0cmVlLmdldE5vZGUobnVsbCkuY2hpbGRyZW4uZXZlcnkobm9kZSA9PiAhbm9kZS5jb2xsYXBzaWJsZSB8fCBub2RlLmNvbGxhcHNlZCkpO1xuXHRcdH07XG5cdFx0dGhpcy5fZWRpdG9yQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSh1cGRhdGVBbGxDb2xsYXBzZWRDdHgpKTtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRyZWUub25EaWRDaGFuZ2VNb2RlbCh1cGRhdGVBbGxDb2xsYXBzZWRDdHgpKTtcblx0XHR1cGRhdGVBbGxDb2xsYXBzZWRDdHgoKTtcblxuXHRcdC8vIGxhc3Q6IHNldCB0cmVlIHByb3BlcnR5IGFuZCB3aXJlIGl0IHVwIHRvIG9uZSBvZiBvdXIgY29udGV4dCBrZXlzXG5cdFx0dHJlZS5sYXlvdXQodGhpcy5fdHJlZURpbWVuc2lvbnM/LmhlaWdodCwgdGhpcy5fdHJlZURpbWVuc2lvbnM/LndpZHRoKTtcblx0XHR0aGlzLl90cmVlID0gdHJlZTtcblx0XHR0aGlzLl9lZGl0b3JDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0cmVlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3RyZWUgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjLGVBQWU7QUFDdEMsU0FBc0IsY0FBYyxpQkFBaUIseUJBQXlCO0FBQzlFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUF1QyxpQkFBaUIscUJBQXFCO0FBQzdFLFNBQVMsOEJBQTJDO0FBQ3BELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsYUFBYTtBQUV0QixTQUFTLHVCQUErQyxvQkFBb0I7QUFF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
