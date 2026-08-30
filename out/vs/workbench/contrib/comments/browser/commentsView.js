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
import "./media/panel.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { basename } from "../../../../base/common/resources.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { CommentNode, ResourceWithCommentThreads } from "../common/commentModel.js";
import { ICommentService } from "./commentService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { CommentsList, COMMENTS_VIEW_TITLE, Filter } from "./commentsTreeViewer.js";
import { FilterViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { CommentsViewFilterFocusContextKey } from "./comments.js";
import { CommentsFilters, CommentsSortOrder } from "./commentsViewActions.js";
import { Memento } from "../../../common/memento.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { FilterOptions } from "./commentsFilterOptions.js";
import { CommentThreadApplicability, CommentThreadState } from "../../../../editor/common/languages.js";
import { revealCommentThread } from "./commentsController.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { CommentsModel, threadHasMeaningfulComments } from "./commentsModel.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibleViewAction } from "../../accessibility/browser/accessibleViewActions.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
const CONTEXT_KEY_HAS_COMMENTS = new RawContextKey("commentsView.hasComments", false);
const CONTEXT_KEY_SOME_COMMENTS_EXPANDED = new RawContextKey("commentsView.someCommentsExpanded", false);
const CONTEXT_KEY_COMMENT_FOCUSED = new RawContextKey("commentsView.commentFocused", false);
const VIEW_STORAGE_ID = "commentsViewState";
function createResourceCommentsIterator(model) {
  const result = [];
  for (const m of model.resourceCommentThreads) {
    const children = [];
    for (const r of m.commentThreads) {
      if (threadHasMeaningfulComments(r.thread)) {
        children.push({ element: r });
      }
    }
    if (children.length > 0) {
      result.push({ element: m, children });
    }
  }
  return result;
}
let CommentsPanel = class extends FilterViewPane {
  constructor(options, instantiationService, viewDescriptorService, editorService, configurationService, contextKeyService, contextMenuService, keybindingService, openerService, themeService, commentService, hoverService, uriIdentityService, storageService, pathService) {
    const stateMemento = new Memento(VIEW_STORAGE_ID, storageService);
    const viewState = stateMemento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    super({
      ...options,
      filterOptions: {
        placeholder: nls.localize("comments.filter.placeholder", "Filter (e.g. text, author)"),
        ariaLabel: nls.localize("comments.filter.ariaLabel", "Filter comments"),
        history: viewState.filterHistory || [],
        text: viewState.filter || "",
        focusContextKey: CommentsViewFilterFocusContextKey.key
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.commentService = commentService;
    this.uriIdentityService = uriIdentityService;
    this.pathService = pathService;
    this.totalComments = 0;
    this.currentHeight = 0;
    this.currentWidth = 0;
    this.cachedFilterStats = void 0;
    this.onDidChangeVisibility = this.onDidChangeBodyVisibility;
    this.hasCommentsContextKey = CONTEXT_KEY_HAS_COMMENTS.bindTo(contextKeyService);
    this.someCommentsExpandedContextKey = CONTEXT_KEY_SOME_COMMENTS_EXPANDED.bindTo(contextKeyService);
    this.commentsFocusedContextKey = CONTEXT_KEY_COMMENT_FOCUSED.bindTo(contextKeyService);
    this.stateMemento = stateMemento;
    this.viewState = viewState;
    this.filters = this._register(new CommentsFilters({
      showResolved: this.viewState.showResolved !== false,
      showUnresolved: this.viewState.showUnresolved !== false,
      sortBy: this.viewState.sortBy ?? CommentsSortOrder.ResourceAscending
    }, this.contextKeyService));
    this.filter = new Filter(new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved));
    this._register(this.filters.onDidChange((event) => {
      if (event.showResolved || event.showUnresolved) {
        this.updateFilter();
      }
      if (event.sortBy) {
        this.refresh();
      }
    }));
    this._register(this.filterWidget.onDidChangeFilterText(() => this.updateFilter()));
  }
  get focusedCommentNode() {
    const focused = this.tree?.getFocus();
    if (focused?.length === 1 && focused[0] instanceof CommentNode) {
      return focused[0];
    }
    return void 0;
  }
  get focusedCommentInfo() {
    if (!this.focusedCommentNode) {
      return;
    }
    return this.getScreenReaderInfoForNode(this.focusedCommentNode);
  }
  focusNextNode() {
    if (!this.tree) {
      return;
    }
    const focused = this.tree.getFocus()?.[0];
    if (!focused) {
      return;
    }
    let next = this.tree.navigate(focused).next();
    while (next && !(next instanceof CommentNode)) {
      next = this.tree.navigate(next).next();
    }
    if (!next) {
      return;
    }
    this.tree.setFocus([next]);
  }
  focusPreviousNode() {
    if (!this.tree) {
      return;
    }
    const focused = this.tree.getFocus()?.[0];
    if (!focused) {
      return;
    }
    let previous = this.tree.navigate(focused).previous();
    while (previous && !(previous instanceof CommentNode)) {
      previous = this.tree.navigate(previous).previous();
    }
    if (!previous) {
      return;
    }
    this.tree.setFocus([previous]);
  }
  saveState() {
    this.viewState.filter = this.filterWidget.getFilterText();
    this.viewState.filterHistory = this.filterWidget.getHistory();
    this.viewState.showResolved = this.filters.showResolved;
    this.viewState.showUnresolved = this.filters.showUnresolved;
    this.viewState.sortBy = this.filters.sortBy;
    this.stateMemento.saveMemento();
    super.saveState();
  }
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "commentsView",
      focusNotifiers: [this, this.filterWidget],
      focusNextWidget: () => {
        if (this.filterWidget.hasFocus()) {
          this.focus();
        }
      },
      focusPreviousWidget: () => {
        if (!this.filterWidget.hasFocus()) {
          this.focusFilter();
        }
      }
    }));
  }
  focusFilter() {
    this.filterWidget.focus();
  }
  clearFilterText() {
    this.filterWidget.setFilterText("");
  }
  getFilterStats() {
    if (!this.cachedFilterStats) {
      this.cachedFilterStats = {
        total: this.totalComments,
        filtered: this.tree?.getVisibleItemCount() ?? 0
      };
    }
    return this.cachedFilterStats;
  }
  updateFilter() {
    this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.filters.showResolved, this.filters.showUnresolved);
    this.tree?.filterComments();
    this.cachedFilterStats = void 0;
    const { total, filtered } = this.getFilterStats();
    this.filterWidget.updateBadge(total === filtered || total === 0 ? void 0 : nls.localize("showing filtered results", "Showing {0} of {1}", filtered, total));
    this.filterWidget.checkMoreFilters(!this.filters.showResolved || !this.filters.showUnresolved);
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("comments-panel");
    const domContainer = dom.append(container, dom.$(".comments-panel-container"));
    this.treeContainer = dom.append(domContainer, dom.$(".tree-container"));
    this.treeContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    this.cachedFilterStats = void 0;
    this.createTree();
    this.createMessageBox(domContainer);
    this._register(this.commentService.onDidSetAllCommentThreads(this.onAllCommentsChanged, this));
    this._register(this.commentService.onDidUpdateCommentThreads(this.onCommentsUpdated, this));
    this._register(this.commentService.onDidDeleteDataProvider(this.onDataProviderDeleted, this));
    this._register(this.onDidChangeBodyVisibility((visible) => {
      if (visible) {
        this.refresh();
      }
    }));
    this.renderComments();
  }
  focus() {
    super.focus();
    const element = this.tree?.getHTMLElement();
    if (element && dom.isActiveElement(element)) {
      return;
    }
    if (!this.commentService.commentsModel.hasCommentThreads() && this.messageBoxContainer) {
      this.messageBoxContainer.focus();
    } else if (this.tree) {
      this.tree.domFocus();
    }
  }
  renderComments() {
    this.treeContainer.classList.toggle("hidden", !this.commentService.commentsModel.hasCommentThreads());
    this.renderMessage();
    this.tree?.setChildren(null, createResourceCommentsIterator(this.commentService.commentsModel));
  }
  collapseAll() {
    if (this.tree) {
      this.tree.collapseAll();
      this.tree.setSelection([]);
      this.tree.setFocus([]);
      this.tree.domFocus();
      this.tree.focusFirst();
    }
  }
  expandAll() {
    if (this.tree) {
      this.tree.expandAll();
      this.tree.setSelection([]);
      this.tree.setFocus([]);
      this.tree.domFocus();
      this.tree.focusFirst();
    }
  }
  get hasRendered() {
    return !!this.tree;
  }
  layoutBodyContent(height = this.currentHeight, width = this.currentWidth) {
    if (this.messageBoxContainer) {
      this.messageBoxContainer.style.height = `${height}px`;
    }
    this.tree?.layout(height, width);
    this.currentHeight = height;
    this.currentWidth = width;
  }
  createMessageBox(parent) {
    this.messageBoxContainer = dom.append(parent, dom.$(".message-box-container"));
    this.messageBoxContainer.setAttribute("tabIndex", "0");
  }
  renderMessage() {
    this.messageBoxContainer.textContent = this.commentService.commentsModel.getMessage();
    this.messageBoxContainer.classList.toggle("hidden", this.commentService.commentsModel.hasCommentThreads());
  }
  makeCommentLocationLabel(file, range) {
    const fileLabel = basename(file);
    if (!range) {
      return nls.localize("fileCommentLabel", "in {0}", fileLabel);
    }
    if (range.startLineNumber === range.endLineNumber) {
      return nls.localize("oneLineCommentLabel", "at line {0} column {1} in {2}", range.startLineNumber, range.startColumn, fileLabel);
    } else {
      return nls.localize("multiLineCommentLabel", "from line {0} to line {1} in {2}", range.startLineNumber, range.endLineNumber, fileLabel);
    }
  }
  makeScreenReaderLabelInfo(element, forAriaLabel) {
    const userName = element.comment.userName;
    const locationLabel = this.makeCommentLocationLabel(element.resource, element.range);
    const replyCountLabel = this.getReplyCountAsString(element, forAriaLabel);
    const bodyLabel = typeof element.comment.body === "string" ? element.comment.body : element.comment.body.value;
    return { userName, locationLabel, replyCountLabel, bodyLabel };
  }
  getScreenReaderInfoForNode(element, forAriaLabel) {
    let accessibleViewHint = "";
    if (forAriaLabel && this.configurationService.getValue(AccessibilityVerbositySettingId.Comments)) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibleViewAction.id)?.getAriaLabel();
      accessibleViewHint = kbLabel ? nls.localize("accessibleViewHint", "\nInspect this in the accessible view ({0}).", kbLabel) : nls.localize("acessibleViewHintNoKbOpen", "\nInspect this in the accessible view via the command Open Accessible View which is currently not triggerable via keybinding.");
    }
    const replies = this.getRepliesAsString(element, forAriaLabel);
    const editor = this.editorService.findEditors(element.resource);
    const codeEditor = this.editorService.activeEditorPane?.getControl();
    let relevantLines;
    if (element.range && editor?.length && isCodeEditor(codeEditor)) {
      relevantLines = codeEditor.getModel()?.getValueInRange(element.range);
      if (relevantLines) {
        relevantLines = "\nCorresponding code: \n" + relevantLines;
      }
    }
    if (!relevantLines) {
      relevantLines = "";
    }
    const labelInfo = this.makeScreenReaderLabelInfo(element, forAriaLabel);
    if (element.threadRelevance === CommentThreadApplicability.Outdated) {
      return nls.localize(
        "resourceWithCommentLabelOutdated",
        "Outdated from {0}: {1}\n{2}\n{3}\n{4}",
        labelInfo.userName,
        labelInfo.bodyLabel,
        labelInfo.locationLabel,
        labelInfo.replyCountLabel,
        relevantLines
      ) + replies + accessibleViewHint;
    } else {
      return nls.localize(
        "resourceWithCommentLabel",
        "{0}: {1}\n{2}\n{3}\n{4}",
        labelInfo.userName,
        labelInfo.bodyLabel,
        labelInfo.locationLabel,
        labelInfo.replyCountLabel,
        relevantLines
      ) + replies + accessibleViewHint;
    }
  }
  getRepliesAsString(node, forAriaLabel) {
    if (!node.replies.length || forAriaLabel) {
      return "";
    }
    return "\n" + node.replies.map(
      (reply) => nls.localize(
        "resourceWithRepliesLabel",
        "{0} {1}",
        reply.comment.userName,
        typeof reply.comment.body === "string" ? reply.comment.body : reply.comment.body.value
      )
    ).join("\n");
  }
  getReplyCountAsString(node, forAriaLabel) {
    return node.replies.length && !forAriaLabel ? nls.localize("replyCount", " {0} replies,", node.replies.length) : "";
  }
  createTree() {
    this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, this));
    this.tree = this._register(this.instantiationService.createInstance(CommentsList, this.treeLabels, this.treeContainer, {
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      selectionNavigation: true,
      filter: this.filter,
      sorter: {
        compare: (a, b) => {
          if (a instanceof CommentsModel || b instanceof CommentsModel) {
            return 0;
          }
          if (this.filters.sortBy === CommentsSortOrder.UpdatedAtDescending) {
            return a.lastUpdatedAt > b.lastUpdatedAt ? -1 : 1;
          } else if (this.filters.sortBy === CommentsSortOrder.ResourceAscending) {
            if (a instanceof ResourceWithCommentThreads && b instanceof ResourceWithCommentThreads) {
              const workspaceScheme = this.pathService.defaultUriScheme;
              if (a.resource.scheme !== b.resource.scheme && (a.resource.scheme === workspaceScheme || b.resource.scheme === workspaceScheme)) {
                return b.resource.scheme === workspaceScheme ? 1 : -1;
              }
              return a.resource.toString() > b.resource.toString() ? 1 : -1;
            } else if (a instanceof CommentNode && b instanceof CommentNode && a.thread.range && b.thread.range) {
              return a.thread.range?.startLineNumber > b.thread.range?.startLineNumber ? 1 : -1;
            }
          }
          return 0;
        }
      },
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: (item) => {
          return void 0;
        }
      },
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element instanceof CommentsModel) {
            return nls.localize("rootCommentsLabel", "Comments for current workspace");
          }
          if (element instanceof ResourceWithCommentThreads) {
            return nls.localize("resourceWithCommentThreadsLabel", "Comments in {0}, full path {1}", basename(element.resource), element.resource.fsPath);
          }
          if (element instanceof CommentNode) {
            return this.getScreenReaderInfoForNode(element, true);
          }
          return "";
        },
        getWidgetAriaLabel() {
          return COMMENTS_VIEW_TITLE.value;
        }
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      this.openFile(e.element, e.editorOptions.pinned, e.editorOptions.preserveFocus, e.sideBySide);
    }));
    this._register(this.tree.onDidChangeModel(() => {
      this.updateSomeCommentsExpanded();
    }));
    this._register(this.tree.onDidChangeCollapseState(() => {
      this.updateSomeCommentsExpanded();
    }));
    this._register(this.tree.onDidFocus(() => this.commentsFocusedContextKey.set(true)));
    this._register(this.tree.onDidBlur(() => this.commentsFocusedContextKey.set(false)));
  }
  openFile(element, pinned, preserveFocus, sideBySide) {
    if (!element) {
      return;
    }
    if (!(element instanceof ResourceWithCommentThreads || element instanceof CommentNode)) {
      return;
    }
    const threadToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].thread : element.thread;
    const commentToReveal = element instanceof ResourceWithCommentThreads ? element.commentThreads[0].comment : void 0;
    return revealCommentThread(this.commentService, this.editorService, this.uriIdentityService, threadToReveal, commentToReveal, false, pinned, preserveFocus, sideBySide);
  }
  async refresh() {
    if (!this.tree) {
      return;
    }
    if (this.isVisible()) {
      this.hasCommentsContextKey.set(this.commentService.commentsModel.hasCommentThreads());
      this.cachedFilterStats = void 0;
      this.renderComments();
      if (this.tree.getSelection().length === 0 && this.commentService.commentsModel.hasCommentThreads()) {
        const firstComment = this.commentService.commentsModel.resourceCommentThreads[0].commentThreads[0];
        if (firstComment && this.tree.hasElement(firstComment)) {
          this.tree.setFocus([firstComment]);
          this.tree.setSelection([firstComment]);
        }
      }
    }
  }
  onAllCommentsChanged(e) {
    this.cachedFilterStats = void 0;
    this.totalComments += e.commentThreads.length;
    let unresolved = 0;
    for (const thread of e.commentThreads) {
      if (thread.state === CommentThreadState.Unresolved) {
        unresolved++;
      }
    }
    this.refresh();
  }
  onCommentsUpdated(e) {
    this.cachedFilterStats = void 0;
    this.totalComments += e.added.length;
    this.totalComments -= e.removed.length;
    let unresolved = 0;
    for (const resource of this.commentService.commentsModel.resourceCommentThreads) {
      for (const thread of resource.commentThreads) {
        if (thread.threadState === CommentThreadState.Unresolved) {
          unresolved++;
        }
      }
    }
    this.refresh();
  }
  onDataProviderDeleted(owner) {
    this.cachedFilterStats = void 0;
    this.totalComments = 0;
    this.refresh();
  }
  updateSomeCommentsExpanded() {
    this.someCommentsExpandedContextKey.set(this.isSomeCommentsExpanded());
  }
  areAllCommentsExpanded() {
    if (!this.tree) {
      return false;
    }
    const navigator = this.tree.navigate();
    while (navigator.next()) {
      if (this.tree.isCollapsed(navigator.current())) {
        return false;
      }
    }
    return true;
  }
  isSomeCommentsExpanded() {
    if (!this.tree) {
      return false;
    }
    const navigator = this.tree.navigate();
    while (navigator.next()) {
      if (!this.tree.isCollapsed(navigator.current())) {
        return true;
      }
    }
    return false;
  }
};
CommentsPanel = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, ICommentService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IUriIdentityService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IPathService)
], CommentsPanel);
export {
  CONTEXT_KEY_COMMENT_FOCUSED,
  CONTEXT_KEY_HAS_COMMENTS,
  CONTEXT_KEY_SOME_COMMENTS_EXPANDED,
  CommentsPanel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50c1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvcGFuZWwuY3NzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50Tm9kZSwgSUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQsIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VDb21tZW50VGhyZWFkc0V2ZW50IH0gZnJvbSAnLi9jb21tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IENvbW1lbnRzTGlzdCwgQ09NTUVOVFNfVklFV19USVRMRSwgRmlsdGVyIH0gZnJvbSAnLi9jb21tZW50c1RyZWVWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgRmlsdGVyVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBDb21tZW50c1ZpZXdGaWx0ZXJGb2N1c0NvbnRleHRLZXksIElDb21tZW50c1ZpZXcgfSBmcm9tICcuL2NvbW1lbnRzLmpzJztcbmltcG9ydCB7IENvbW1lbnRzRmlsdGVycywgQ29tbWVudHNGaWx0ZXJzQ2hhbmdlRXZlbnQsIENvbW1lbnRzU29ydE9yZGVyIH0gZnJvbSAnLi9jb21tZW50c1ZpZXdBY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRmlsdGVyT3B0aW9ucyB9IGZyb20gJy4vY29tbWVudHNGaWx0ZXJPcHRpb25zLmpzJztcbmltcG9ydCB7IENvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5LCBDb21tZW50VGhyZWFkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyByZXZlYWxDb21tZW50VGhyZWFkIH0gZnJvbSAnLi9jb21tZW50c0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2lkZ2V0TmF2aWdhdGlvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbW1lbnRzTW9kZWwsIHRocmVhZEhhc01lYW5pbmdmdWxDb21tZW50cywgdHlwZSBJQ29tbWVudHNNb2RlbCB9IGZyb20gJy4vY29tbWVudHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3QWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUcmVlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfS0VZX0hBU19DT01NRU5UUyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjb21tZW50c1ZpZXcuaGFzQ29tbWVudHMnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9LRVlfU09NRV9DT01NRU5UU19FWFBBTkRFRCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdjb21tZW50c1ZpZXcuc29tZUNvbW1lbnRzRXhwYW5kZWQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9LRVlfQ09NTUVOVF9GT0NVU0VEID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2NvbW1lbnRzVmlldy5jb21tZW50Rm9jdXNlZCcsIGZhbHNlKTtcbmNvbnN0IFZJRVdfU1RPUkFHRV9JRCA9ICdjb21tZW50c1ZpZXdTdGF0ZSc7XG5cbmludGVyZmFjZSBDb21tZW50c1ZpZXdTdGF0ZSB7XG5cdGZpbHRlcj86IHN0cmluZztcblx0ZmlsdGVySGlzdG9yeT86IHN0cmluZ1tdO1xuXHRzaG93UmVzb2x2ZWQ/OiBib29sZWFuO1xuXHRzaG93VW5yZXNvbHZlZD86IGJvb2xlYW47XG5cdHNvcnRCeT86IENvbW1lbnRzU29ydE9yZGVyO1xufVxuXG50eXBlIENvbW1lbnRzVHJlZU5vZGUgPSBDb21tZW50c01vZGVsIHwgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfCBDb21tZW50Tm9kZTtcblxuZnVuY3Rpb24gY3JlYXRlUmVzb3VyY2VDb21tZW50c0l0ZXJhdG9yKG1vZGVsOiBJQ29tbWVudHNNb2RlbCk6IEl0ZXJhYmxlPElUcmVlRWxlbWVudDxDb21tZW50c1RyZWVOb2RlPj4ge1xuXHRjb25zdCByZXN1bHQ6IElUcmVlRWxlbWVudDxDb21tZW50c1RyZWVOb2RlPltdID0gW107XG5cblx0Zm9yIChjb25zdCBtIG9mIG1vZGVsLnJlc291cmNlQ29tbWVudFRocmVhZHMpIHtcblx0XHRjb25zdCBjaGlsZHJlbiA9IFtdO1xuXHRcdGZvciAoY29uc3QgciBvZiBtLmNvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRpZiAodGhyZWFkSGFzTWVhbmluZ2Z1bENvbW1lbnRzKHIudGhyZWFkKSkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKHsgZWxlbWVudDogciB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgZWxlbWVudDogbSwgY2hpbGRyZW4gfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50c1BhbmVsIGV4dGVuZHMgRmlsdGVyVmlld1BhbmUgaW1wbGVtZW50cyBJQ29tbWVudHNWaWV3IHtcblx0cHJpdmF0ZSB0cmVlTGFiZWxzITogUmVzb3VyY2VMYWJlbHM7XG5cdHByaXZhdGUgdHJlZTogQ29tbWVudHNMaXN0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBtZXNzYWdlQm94Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG90YWxDb21tZW50czogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBoYXNDb21tZW50c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNvbWVDb21tZW50c0V4cGFuZGVkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tbWVudHNGb2N1c2VkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyOiBGaWx0ZXI7XG5cdHJlYWRvbmx5IGZpbHRlcnM6IENvbW1lbnRzRmlsdGVycztcblxuXHRwcml2YXRlIGN1cnJlbnRIZWlnaHQgPSAwO1xuXHRwcml2YXRlIGN1cnJlbnRXaWR0aCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld1N0YXRlOiBDb21tZW50c1ZpZXdTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBzdGF0ZU1lbWVudG86IE1lbWVudG88Q29tbWVudHNWaWV3U3RhdGU+O1xuXHRwcml2YXRlIGNhY2hlZEZpbHRlclN0YXRzOiB7IHRvdGFsOiBudW1iZXI7IGZpbHRlcmVkOiBudW1iZXIgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHk7XG5cblx0Z2V0IGZvY3VzZWRDb21tZW50Tm9kZSgpOiBDb21tZW50Tm9kZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMudHJlZT8uZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZD8ubGVuZ3RoID09PSAxICYmIGZvY3VzZWRbMF0gaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkge1xuXHRcdFx0cmV0dXJuIGZvY3VzZWRbMF07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZm9jdXNlZENvbW1lbnRJbmZvKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmZvY3VzZWRDb21tZW50Tm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRTY3JlZW5SZWFkZXJJbmZvRm9yTm9kZSh0aGlzLmZvY3VzZWRDb21tZW50Tm9kZSk7XG5cdH1cblxuXHRmb2N1c05leHROb2RlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKT8uWzBdO1xuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgbmV4dCA9IHRoaXMudHJlZS5uYXZpZ2F0ZShmb2N1c2VkKS5uZXh0KCk7XG5cdFx0d2hpbGUgKG5leHQgJiYgIShuZXh0IGluc3RhbmNlb2YgQ29tbWVudE5vZGUpKSB7XG5cdFx0XHRuZXh0ID0gdGhpcy50cmVlLm5hdmlnYXRlKG5leHQpLm5leHQoKTtcblx0XHR9XG5cdFx0aWYgKCFuZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbbmV4dF0pO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c05vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRyZWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMudHJlZS5nZXRGb2N1cygpPy5bMF07XG5cdFx0aWYgKCFmb2N1c2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBwcmV2aW91cyA9IHRoaXMudHJlZS5uYXZpZ2F0ZShmb2N1c2VkKS5wcmV2aW91cygpO1xuXHRcdHdoaWxlIChwcmV2aW91cyAmJiAhKHByZXZpb3VzIGluc3RhbmNlb2YgQ29tbWVudE5vZGUpKSB7XG5cdFx0XHRwcmV2aW91cyA9IHRoaXMudHJlZS5uYXZpZ2F0ZShwcmV2aW91cykucHJldmlvdXMoKTtcblx0XHR9XG5cdFx0aWYgKCFwcmV2aW91cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW3ByZXZpb3VzXSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb21tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1lbnRTZXJ2aWNlOiBJQ29tbWVudFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3Qgc3RhdGVNZW1lbnRvID0gbmV3IE1lbWVudG88Q29tbWVudHNWaWV3U3RhdGU+KFZJRVdfU1RPUkFHRV9JRCwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHN0YXRlTWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGZpbHRlck9wdGlvbnM6IHtcblx0XHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuZmlsdGVyLnBsYWNlaG9sZGVyJywgXCJGaWx0ZXIgKGUuZy4gdGV4dCwgYXV0aG9yKVwiKSxcblx0XHRcdFx0YXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ2NvbW1lbnRzLmZpbHRlci5hcmlhTGFiZWwnLCBcIkZpbHRlciBjb21tZW50c1wiKSxcblx0XHRcdFx0aGlzdG9yeTogdmlld1N0YXRlLmZpbHRlckhpc3RvcnkgfHwgW10sXG5cdFx0XHRcdHRleHQ6IHZpZXdTdGF0ZS5maWx0ZXIgfHwgJycsXG5cdFx0XHRcdGZvY3VzQ29udGV4dEtleTogQ29tbWVudHNWaWV3RmlsdGVyRm9jdXNDb250ZXh0S2V5LmtleVxuXHRcdFx0fVxuXHRcdH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzQ29tbWVudHNDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlfSEFTX0NPTU1FTlRTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zb21lQ29tbWVudHNFeHBhbmRlZENvbnRleHRLZXkgPSBDT05URVhUX0tFWV9TT01FX0NPTU1FTlRTX0VYUEFOREVELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jb21tZW50c0ZvY3VzZWRDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlfQ09NTUVOVF9GT0NVU0VELmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zdGF0ZU1lbWVudG8gPSBzdGF0ZU1lbWVudG87XG5cdFx0dGhpcy52aWV3U3RhdGUgPSB2aWV3U3RhdGU7XG5cblx0XHR0aGlzLmZpbHRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tbWVudHNGaWx0ZXJzKHtcblx0XHRcdHNob3dSZXNvbHZlZDogdGhpcy52aWV3U3RhdGUuc2hvd1Jlc29sdmVkICE9PSBmYWxzZSxcblx0XHRcdHNob3dVbnJlc29sdmVkOiB0aGlzLnZpZXdTdGF0ZS5zaG93VW5yZXNvbHZlZCAhPT0gZmFsc2UsXG5cdFx0XHRzb3J0Qnk6IHRoaXMudmlld1N0YXRlLnNvcnRCeSA/PyBDb21tZW50c1NvcnRPcmRlci5SZXNvdXJjZUFzY2VuZGluZyxcblx0XHR9LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5maWx0ZXIgPSBuZXcgRmlsdGVyKG5ldyBGaWx0ZXJPcHRpb25zKHRoaXMuZmlsdGVyV2lkZ2V0LmdldEZpbHRlclRleHQoKSwgdGhpcy5maWx0ZXJzLnNob3dSZXNvbHZlZCwgdGhpcy5maWx0ZXJzLnNob3dVbnJlc29sdmVkKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbHRlcnMub25EaWRDaGFuZ2UoKGV2ZW50OiBDb21tZW50c0ZpbHRlcnNDaGFuZ2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LnNob3dSZXNvbHZlZCB8fCBldmVudC5zaG93VW5yZXNvbHZlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZpbHRlcigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV2ZW50LnNvcnRCeSkge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWx0ZXJXaWRnZXQub25EaWRDaGFuZ2VGaWx0ZXJUZXh0KCgpID0+IHRoaXMudXBkYXRlRmlsdGVyKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdTdGF0ZS5maWx0ZXIgPSB0aGlzLmZpbHRlcldpZGdldC5nZXRGaWx0ZXJUZXh0KCk7XG5cdFx0dGhpcy52aWV3U3RhdGUuZmlsdGVySGlzdG9yeSA9IHRoaXMuZmlsdGVyV2lkZ2V0LmdldEhpc3RvcnkoKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5zaG93UmVzb2x2ZWQgPSB0aGlzLmZpbHRlcnMuc2hvd1Jlc29sdmVkO1xuXHRcdHRoaXMudmlld1N0YXRlLnNob3dVbnJlc29sdmVkID0gdGhpcy5maWx0ZXJzLnNob3dVbnJlc29sdmVkO1xuXHRcdHRoaXMudmlld1N0YXRlLnNvcnRCeSA9IHRoaXMuZmlsdGVycy5zb3J0Qnk7XG5cdFx0dGhpcy5zdGF0ZU1lbWVudG8uc2F2ZU1lbWVudG8oKTtcblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcigpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lcih7XG5cdFx0XHRuYW1lOiAnY29tbWVudHNWaWV3Jyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbdGhpcywgdGhpcy5maWx0ZXJXaWRnZXRdLFxuXHRcdFx0Zm9jdXNOZXh0V2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmZpbHRlcldpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuZmlsdGVyV2lkZ2V0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzRmlsdGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNGaWx0ZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhckZpbHRlclRleHQoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuc2V0RmlsdGVyVGV4dCgnJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RmlsdGVyU3RhdHMoKTogeyB0b3RhbDogbnVtYmVyOyBmaWx0ZXJlZDogbnVtYmVyIH0ge1xuXHRcdGlmICghdGhpcy5jYWNoZWRGaWx0ZXJTdGF0cykge1xuXHRcdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHtcblx0XHRcdFx0dG90YWw6IHRoaXMudG90YWxDb21tZW50cyxcblx0XHRcdFx0ZmlsdGVyZWQ6IHRoaXMudHJlZT8uZ2V0VmlzaWJsZUl0ZW1Db3VudCgpID8/IDBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkRmlsdGVyU3RhdHM7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZpbHRlcigpIHtcblx0XHR0aGlzLmZpbHRlci5vcHRpb25zID0gbmV3IEZpbHRlck9wdGlvbnModGhpcy5maWx0ZXJXaWRnZXQuZ2V0RmlsdGVyVGV4dCgpLCB0aGlzLmZpbHRlcnMuc2hvd1Jlc29sdmVkLCB0aGlzLmZpbHRlcnMuc2hvd1VucmVzb2x2ZWQpO1xuXHRcdHRoaXMudHJlZT8uZmlsdGVyQ29tbWVudHMoKTtcblxuXHRcdHRoaXMuY2FjaGVkRmlsdGVyU3RhdHMgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgeyB0b3RhbCwgZmlsdGVyZWQgfSA9IHRoaXMuZ2V0RmlsdGVyU3RhdHMoKTtcblx0XHR0aGlzLmZpbHRlcldpZGdldC51cGRhdGVCYWRnZSh0b3RhbCA9PT0gZmlsdGVyZWQgfHwgdG90YWwgPT09IDAgPyB1bmRlZmluZWQgOiBubHMubG9jYWxpemUoJ3Nob3dpbmcgZmlsdGVyZWQgcmVzdWx0cycsIFwiU2hvd2luZyB7MH0gb2YgezF9XCIsIGZpbHRlcmVkLCB0b3RhbCkpO1xuXHRcdHRoaXMuZmlsdGVyV2lkZ2V0LmNoZWNrTW9yZUZpbHRlcnMoIXRoaXMuZmlsdGVycy5zaG93UmVzb2x2ZWQgfHwgIXRoaXMuZmlsdGVycy5zaG93VW5yZXNvbHZlZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbW1lbnRzLXBhbmVsJyk7XG5cblx0XHRjb25zdCBkb21Db250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50cy1wYW5lbC1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLnRyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKGRvbUNvbnRhaW5lciwgZG9tLiQoJy50cmVlLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUnLCAnc2hvdy1maWxlLWljb25zJyk7XG5cblx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3JlYXRlVHJlZSgpO1xuXHRcdHRoaXMuY3JlYXRlTWVzc2FnZUJveChkb21Db250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21tZW50U2VydmljZS5vbkRpZFNldEFsbENvbW1lbnRUaHJlYWRzKHRoaXMub25BbGxDb21tZW50c0NoYW5nZWQsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbW1lbnRTZXJ2aWNlLm9uRGlkVXBkYXRlQ29tbWVudFRocmVhZHModGhpcy5vbkNvbW1lbnRzVXBkYXRlZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29tbWVudFNlcnZpY2Uub25EaWREZWxldGVEYXRhUHJvdmlkZXIodGhpcy5vbkRhdGFQcm92aWRlckRlbGV0ZWQsIHRoaXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVuZGVyQ29tbWVudHMoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMudHJlZT8uZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRpZiAoZWxlbWVudCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmNvbW1lbnRTZXJ2aWNlLmNvbW1lbnRzTW9kZWwuaGFzQ29tbWVudFRocmVhZHMoKSAmJiB0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIpIHtcblx0XHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lci5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy50cmVlKSB7XG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbW1lbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmhhc0NvbW1lbnRUaHJlYWRzKCkpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZSgpO1xuXHRcdHRoaXMudHJlZT8uc2V0Q2hpbGRyZW4obnVsbCwgY3JlYXRlUmVzb3VyY2VDb21tZW50c0l0ZXJhdG9yKHRoaXMuY29tbWVudFNlcnZpY2UuY29tbWVudHNNb2RlbCkpO1xuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQWxsKCkge1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHR0aGlzLnRyZWUuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBleHBhbmRBbGwoKSB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0dGhpcy50cmVlLmV4cGFuZEFsbCgpO1xuXHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHR0aGlzLnRyZWUuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgaGFzUmVuZGVyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy50cmVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGxheW91dEJvZHlDb250ZW50KGhlaWdodDogbnVtYmVyID0gdGhpcy5jdXJyZW50SGVpZ2h0LCB3aWR0aDogbnVtYmVyID0gdGhpcy5jdXJyZW50V2lkdGgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZXNzYWdlQm94Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9XG5cdFx0dGhpcy50cmVlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5jdXJyZW50SGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMuY3VycmVudFdpZHRoID0gd2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1lc3NhZ2VCb3gocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm1lc3NhZ2UtYm94LWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWJJbmRleCcsICcwJyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlQm94Q29udGFpbmVyLnRleHRDb250ZW50ID0gdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmdldE1lc3NhZ2UoKTtcblx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmhhc0NvbW1lbnRUaHJlYWRzKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYWtlQ29tbWVudExvY2F0aW9uTGFiZWwoZmlsZTogVVJJLCByYW5nZT86IElSYW5nZSkge1xuXHRcdGNvbnN0IGZpbGVMYWJlbCA9IGJhc2VuYW1lKGZpbGUpO1xuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2ZpbGVDb21tZW50TGFiZWwnLCBcImluIHswfVwiLCBmaWxlTGFiZWwpO1xuXHRcdH1cblx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdvbmVMaW5lQ29tbWVudExhYmVsJywgXCJhdCBsaW5lIHswfSBjb2x1bW4gezF9IGluIHsyfVwiLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCBmaWxlTGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdtdWx0aUxpbmVDb21tZW50TGFiZWwnLCBcImZyb20gbGluZSB7MH0gdG8gbGluZSB7MX0gaW4gezJ9XCIsIHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlciwgZmlsZUxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1ha2VTY3JlZW5SZWFkZXJMYWJlbEluZm8oZWxlbWVudDogQ29tbWVudE5vZGUsIGZvckFyaWFMYWJlbD86IGJvb2xlYW4pIHtcblx0XHRjb25zdCB1c2VyTmFtZSA9IGVsZW1lbnQuY29tbWVudC51c2VyTmFtZTtcblx0XHRjb25zdCBsb2NhdGlvbkxhYmVsID0gdGhpcy5tYWtlQ29tbWVudExvY2F0aW9uTGFiZWwoZWxlbWVudC5yZXNvdXJjZSwgZWxlbWVudC5yYW5nZSk7XG5cdFx0Y29uc3QgcmVwbHlDb3VudExhYmVsID0gdGhpcy5nZXRSZXBseUNvdW50QXNTdHJpbmcoZWxlbWVudCwgZm9yQXJpYUxhYmVsKTtcblx0XHRjb25zdCBib2R5TGFiZWwgPSAodHlwZW9mIGVsZW1lbnQuY29tbWVudC5ib2R5ID09PSAnc3RyaW5nJykgPyBlbGVtZW50LmNvbW1lbnQuYm9keSA6IGVsZW1lbnQuY29tbWVudC5ib2R5LnZhbHVlO1xuXG5cdFx0cmV0dXJuIHsgdXNlck5hbWUsIGxvY2F0aW9uTGFiZWwsIHJlcGx5Q291bnRMYWJlbCwgYm9keUxhYmVsIH07XG5cdH1cblxuXHRwcml2YXRlIGdldFNjcmVlblJlYWRlckluZm9Gb3JOb2RlKGVsZW1lbnQ6IENvbW1lbnROb2RlLCBmb3JBcmlhTGFiZWw/OiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRsZXQgYWNjZXNzaWJsZVZpZXdIaW50ID0gJyc7XG5cdFx0aWYgKGZvckFyaWFMYWJlbCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ29tbWVudHMpKSB7XG5cdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2libGVWaWV3QWN0aW9uLmlkKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRhY2Nlc3NpYmxlVmlld0hpbnQgPSBrYkxhYmVsID8gbmxzLmxvY2FsaXplKCdhY2Nlc3NpYmxlVmlld0hpbnQnLCBcIlxcbkluc3BlY3QgdGhpcyBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3ICh7MH0pLlwiLCBrYkxhYmVsKSA6IG5scy5sb2NhbGl6ZSgnYWNlc3NpYmxlVmlld0hpbnROb0tiT3BlbicsIFwiXFxuSW5zcGVjdCB0aGlzIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcgdmlhIHRoZSBjb21tYW5kIE9wZW4gQWNjZXNzaWJsZSBWaWV3IHdoaWNoIGlzIGN1cnJlbnRseSBub3QgdHJpZ2dlcmFibGUgdmlhIGtleWJpbmRpbmcuXCIpO1xuXHRcdH1cblx0XHRjb25zdCByZXBsaWVzID0gdGhpcy5nZXRSZXBsaWVzQXNTdHJpbmcoZWxlbWVudCwgZm9yQXJpYUxhYmVsKTtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMoZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cdFx0bGV0IHJlbGV2YW50TGluZXM7XG5cdFx0aWYgKGVsZW1lbnQucmFuZ2UgJiYgZWRpdG9yPy5sZW5ndGggJiYgaXNDb2RlRWRpdG9yKGNvZGVFZGl0b3IpKSB7XG5cdFx0XHRyZWxldmFudExpbmVzID0gY29kZUVkaXRvci5nZXRNb2RlbCgpPy5nZXRWYWx1ZUluUmFuZ2UoZWxlbWVudC5yYW5nZSk7XG5cdFx0XHRpZiAocmVsZXZhbnRMaW5lcykge1xuXHRcdFx0XHRyZWxldmFudExpbmVzID0gJ1xcbkNvcnJlc3BvbmRpbmcgY29kZTogXFxuJyArIHJlbGV2YW50TGluZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghcmVsZXZhbnRMaW5lcykge1xuXHRcdFx0cmVsZXZhbnRMaW5lcyA9ICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsSW5mbyA9IHRoaXMubWFrZVNjcmVlblJlYWRlckxhYmVsSW5mbyhlbGVtZW50LCBmb3JBcmlhTGFiZWwpO1xuXG5cdFx0aWYgKGVsZW1lbnQudGhyZWFkUmVsZXZhbmNlID09PSBDb21tZW50VGhyZWFkQXBwbGljYWJpbGl0eS5PdXRkYXRlZCkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVzb3VyY2VXaXRoQ29tbWVudExhYmVsT3V0ZGF0ZWQnLFxuXHRcdFx0XHRcIk91dGRhdGVkIGZyb20gezB9OiB7MX1cXG57Mn1cXG57M31cXG57NH1cIixcblx0XHRcdFx0bGFiZWxJbmZvLnVzZXJOYW1lLFxuXHRcdFx0XHRsYWJlbEluZm8uYm9keUxhYmVsLFxuXHRcdFx0XHRsYWJlbEluZm8ubG9jYXRpb25MYWJlbCxcblx0XHRcdFx0bGFiZWxJbmZvLnJlcGx5Q291bnRMYWJlbCxcblx0XHRcdFx0cmVsZXZhbnRMaW5lc1xuXHRcdFx0KSArIHJlcGxpZXMgKyBhY2Nlc3NpYmxlVmlld0hpbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3Jlc291cmNlV2l0aENvbW1lbnRMYWJlbCcsXG5cdFx0XHRcdFwiezB9OiB7MX1cXG57Mn1cXG57M31cXG57NH1cIixcblx0XHRcdFx0bGFiZWxJbmZvLnVzZXJOYW1lLFxuXHRcdFx0XHRsYWJlbEluZm8uYm9keUxhYmVsLFxuXHRcdFx0XHRsYWJlbEluZm8ubG9jYXRpb25MYWJlbCxcblx0XHRcdFx0bGFiZWxJbmZvLnJlcGx5Q291bnRMYWJlbCxcblx0XHRcdFx0cmVsZXZhbnRMaW5lc1xuXHRcdFx0KSArIHJlcGxpZXMgKyBhY2Nlc3NpYmxlVmlld0hpbnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXBsaWVzQXNTdHJpbmcobm9kZTogQ29tbWVudE5vZGUsIGZvckFyaWFMYWJlbD86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmICghbm9kZS5yZXBsaWVzLmxlbmd0aCB8fCBmb3JBcmlhTGFiZWwpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuICdcXG4nICsgbm9kZS5yZXBsaWVzLm1hcChyZXBseSA9PiBubHMubG9jYWxpemUoJ3Jlc291cmNlV2l0aFJlcGxpZXNMYWJlbCcsXG5cdFx0XHRcInswfSB7MX1cIixcblx0XHRcdHJlcGx5LmNvbW1lbnQudXNlck5hbWUsXG5cdFx0XHQodHlwZW9mIHJlcGx5LmNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpID8gcmVwbHkuY29tbWVudC5ib2R5IDogcmVwbHkuY29tbWVudC5ib2R5LnZhbHVlKVxuXHRcdCkuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlcGx5Q291bnRBc1N0cmluZyhub2RlOiBDb21tZW50Tm9kZSwgZm9yQXJpYUxhYmVsPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5vZGUucmVwbGllcy5sZW5ndGggJiYgIWZvckFyaWFMYWJlbCA/IG5scy5sb2NhbGl6ZSgncmVwbHlDb3VudCcsIFwiIHswfSByZXBsaWVzLFwiLCBub2RlLnJlcGxpZXMubGVuZ3RoKSA6ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHRoaXMpKTtcblx0XHR0aGlzLnRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1lbnRzTGlzdCwgdGhpcy50cmVlTGFiZWxzLCB0aGlzLnRyZWVDb250YWluZXIsIHtcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRzZWxlY3Rpb25OYXZpZ2F0aW9uOiB0cnVlLFxuXHRcdFx0ZmlsdGVyOiB0aGlzLmZpbHRlcixcblx0XHRcdHNvcnRlcjoge1xuXHRcdFx0XHRjb21wYXJlOiAoYTogQ29tbWVudHNUcmVlTm9kZSwgYjogQ29tbWVudHNUcmVlTm9kZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgQ29tbWVudHNNb2RlbCB8fCBiIGluc3RhbmNlb2YgQ29tbWVudHNNb2RlbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLmZpbHRlcnMuc29ydEJ5ID09PSBDb21tZW50c1NvcnRPcmRlci5VcGRhdGVkQXREZXNjZW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYS5sYXN0VXBkYXRlZEF0ID4gYi5sYXN0VXBkYXRlZEF0ID8gLTEgOiAxO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5maWx0ZXJzLnNvcnRCeSA9PT0gQ29tbWVudHNTb3J0T3JkZXIuUmVzb3VyY2VBc2NlbmRpbmcpIHtcblx0XHRcdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgJiYgYiBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVNjaGVtZSA9IHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZTtcblx0XHRcdFx0XHRcdFx0aWYgKChhLnJlc291cmNlLnNjaGVtZSAhPT0gYi5yZXNvdXJjZS5zY2hlbWUpICYmIChhLnJlc291cmNlLnNjaGVtZSA9PT0gd29ya3NwYWNlU2NoZW1lIHx8IGIucmVzb3VyY2Uuc2NoZW1lID09PSB3b3Jrc3BhY2VTY2hlbWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gV29ya3NwYWNlIHNjaGVtZSBzaG91bGQgYWx3YXlzIGNvbWUgZmlyc3Rcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gYi5yZXNvdXJjZS5zY2hlbWUgPT09IHdvcmtzcGFjZVNjaGVtZSA/IDEgOiAtMTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYS5yZXNvdXJjZS50b1N0cmluZygpID4gYi5yZXNvdXJjZS50b1N0cmluZygpID8gMSA6IC0xO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChhIGluc3RhbmNlb2YgQ29tbWVudE5vZGUgJiYgYiBpbnN0YW5jZW9mIENvbW1lbnROb2RlICYmIGEudGhyZWFkLnJhbmdlICYmIGIudGhyZWFkLnJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBhLnRocmVhZC5yYW5nZT8uc3RhcnRMaW5lTnVtYmVyID4gYi50aHJlYWQucmFuZ2U/LnN0YXJ0TGluZU51bWJlciA/IDEgOiAtMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGl0ZW06IENvbW1lbnRzVHJlZU5vZGUpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogKGVsZW1lbnQ6IGFueSk6IHN0cmluZyA9PiB7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50c01vZGVsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyb290Q29tbWVudHNMYWJlbCcsIFwiQ29tbWVudHMgZm9yIGN1cnJlbnQgd29ya3NwYWNlXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkc0xhYmVsJywgXCJDb21tZW50cyBpbiB7MH0sIGZ1bGwgcGF0aCB7MX1cIiwgYmFzZW5hbWUoZWxlbWVudC5yZXNvdXJjZSksIGVsZW1lbnQucmVzb3VyY2UuZnNQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0U2NyZWVuUmVhZGVySW5mb0Zvck5vZGUoZWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIENPTU1FTlRTX1ZJRVdfVElUTEUudmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0dGhpcy5vcGVuRmlsZShlLmVsZW1lbnQsIGUuZWRpdG9yT3B0aW9ucy5waW5uZWQsIGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLCBlLnNpZGVCeVNpZGUpO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVTb21lQ29tbWVudHNFeHBhbmRlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU29tZUNvbW1lbnRzRXhwYW5kZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5jb21tZW50c0ZvY3VzZWRDb250ZXh0S2V5LnNldCh0cnVlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZEJsdXIoKCkgPT4gdGhpcy5jb21tZW50c0ZvY3VzZWRDb250ZXh0S2V5LnNldChmYWxzZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkZpbGUoZWxlbWVudDogYW55LCBwaW5uZWQ/OiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgc2lkZUJ5U2lkZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIShlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfHwgZWxlbWVudCBpbnN0YW5jZW9mIENvbW1lbnROb2RlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0aHJlYWRUb1JldmVhbCA9IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyA/IGVsZW1lbnQuY29tbWVudFRocmVhZHNbMF0udGhyZWFkIDogZWxlbWVudC50aHJlYWQ7XG5cdFx0Y29uc3QgY29tbWVudFRvUmV2ZWFsID0gZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzID8gZWxlbWVudC5jb21tZW50VGhyZWFkc1swXS5jb21tZW50IDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiByZXZlYWxDb21tZW50VGhyZWFkKHRoaXMuY29tbWVudFNlcnZpY2UsIHRoaXMuZWRpdG9yU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHRocmVhZFRvUmV2ZWFsLCBjb21tZW50VG9SZXZlYWwsIGZhbHNlLCBwaW5uZWQsIHByZXNlcnZlRm9jdXMsIHNpZGVCeVNpZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLmhhc0NvbW1lbnRzQ29udGV4dEtleS5zZXQodGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmhhc0NvbW1lbnRUaHJlYWRzKCkpO1xuXHRcdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVuZGVyQ29tbWVudHMoKTtcblxuXHRcdFx0aWYgKHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKS5sZW5ndGggPT09IDAgJiYgdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLmhhc0NvbW1lbnRUaHJlYWRzKCkpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3RDb21tZW50ID0gdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLnJlc291cmNlQ29tbWVudFRocmVhZHNbMF0uY29tbWVudFRocmVhZHNbMF07XG5cdFx0XHRcdGlmIChmaXJzdENvbW1lbnQgJiYgdGhpcy50cmVlLmhhc0VsZW1lbnQoZmlyc3RDb21tZW50KSkge1xuXHRcdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbZmlyc3RDb21tZW50XSk7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbZmlyc3RDb21tZW50XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQWxsQ29tbWVudHNDaGFuZ2VkKGU6IElXb3Jrc3BhY2VDb21tZW50VGhyZWFkc0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRvdGFsQ29tbWVudHMgKz0gZS5jb21tZW50VGhyZWFkcy5sZW5ndGg7XG5cblx0XHRsZXQgdW5yZXNvbHZlZCA9IDA7XG5cdFx0Zm9yIChjb25zdCB0aHJlYWQgb2YgZS5jb21tZW50VGhyZWFkcykge1xuXHRcdFx0aWYgKHRocmVhZC5zdGF0ZSA9PT0gQ29tbWVudFRocmVhZFN0YXRlLlVucmVzb2x2ZWQpIHtcblx0XHRcdFx0dW5yZXNvbHZlZCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db21tZW50c1VwZGF0ZWQoZTogSUNvbW1lbnRUaHJlYWRDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy50b3RhbENvbW1lbnRzICs9IGUuYWRkZWQubGVuZ3RoO1xuXHRcdHRoaXMudG90YWxDb21tZW50cyAtPSBlLnJlbW92ZWQubGVuZ3RoO1xuXG5cdFx0bGV0IHVucmVzb2x2ZWQgPSAwO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgdGhpcy5jb21tZW50U2VydmljZS5jb21tZW50c01vZGVsLnJlc291cmNlQ29tbWVudFRocmVhZHMpIHtcblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIHJlc291cmNlLmNvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRcdGlmICh0aHJlYWQudGhyZWFkU3RhdGUgPT09IENvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dW5yZXNvbHZlZCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRhdGFQcm92aWRlckRlbGV0ZWQob3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGVkRmlsdGVyU3RhdHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50b3RhbENvbW1lbnRzID0gMDtcblx0XHR0aGlzLnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU29tZUNvbW1lbnRzRXhwYW5kZWQoKSB7XG5cdFx0dGhpcy5zb21lQ29tbWVudHNFeHBhbmRlZENvbnRleHRLZXkuc2V0KHRoaXMuaXNTb21lQ29tbWVudHNFeHBhbmRlZCgpKTtcblx0fVxuXG5cdHB1YmxpYyBhcmVBbGxDb21tZW50c0V4cGFuZGVkKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG5hdmlnYXRvciA9IHRoaXMudHJlZS5uYXZpZ2F0ZSgpO1xuXHRcdHdoaWxlIChuYXZpZ2F0b3IubmV4dCgpKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2VkKG5hdmlnYXRvci5jdXJyZW50KCkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgaXNTb21lQ29tbWVudHNFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMudHJlZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBuYXZpZ2F0b3IgPSB0aGlzLnRyZWUubmF2aWdhdGUoKTtcblx0XHR3aGlsZSAobmF2aWdhdG9yLm5leHQoKSkge1xuXHRcdFx0aWYgKCF0aGlzLnRyZWUuaXNDb2xsYXBzZWQobmF2aWdhdG9yLmN1cnJlbnQoKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQXlDLGtDQUFrQztBQUNwRixTQUFTLHVCQUFzRDtBQUMvRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGNBQWMscUJBQXFCLGNBQWM7QUFDMUQsU0FBMkIsc0JBQXNCO0FBQ2pELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLG9CQUFvQixxQkFBcUI7QUFDL0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5Q0FBd0Q7QUFDakUsU0FBUyxpQkFBNkMseUJBQXlCO0FBQy9FLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QiwwQkFBMEI7QUFDL0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxlQUFlLG1DQUF3RDtBQUNoRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLG9CQUFv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
