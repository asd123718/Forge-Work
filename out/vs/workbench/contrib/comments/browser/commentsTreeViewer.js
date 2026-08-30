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
import * as dom from "../../../../base/browser/dom.js";
import * as nls from "../../../../nls.js";
import { renderMarkdown } from "../../../../base/browser/markdownRenderer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CommentNode, ResourceWithCommentThreads } from "../common/commentModel.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IListService, WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { TimestampWidget } from "./timestamp.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { commentViewThreadStateColorVar, getCommentThreadStateIconColor } from "./commentColors.js";
import { CommentThreadApplicability, CommentThreadState, CommentState } from "../../../../editor/common/languages.js";
import { FilterOptions } from "./commentsFilterOptions.js";
import { basename } from "../../../../base/common/resources.js";
import { CommentsModel } from "./commentsModel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const COMMENTS_VIEW_ID = "workbench.panel.comments";
const COMMENTS_VIEW_STORAGE_ID = "Comments";
const COMMENTS_VIEW_TITLE = nls.localize2("comments.view.title", "Comments");
const _CommentsModelVirtualDelegate = class _CommentsModelVirtualDelegate {
  getHeight(element) {
    if (element instanceof CommentNode && element.hasReply()) {
      return 44;
    }
    return 22;
  }
  getTemplateId(element) {
    if (element instanceof ResourceWithCommentThreads) {
      return _CommentsModelVirtualDelegate.RESOURCE_ID;
    }
    if (element instanceof CommentNode) {
      return _CommentsModelVirtualDelegate.COMMENT_ID;
    }
    return "";
  }
};
_CommentsModelVirtualDelegate.RESOURCE_ID = "resource-with-comments";
_CommentsModelVirtualDelegate.COMMENT_ID = "comment-node";
let CommentsModelVirtualDelegate = _CommentsModelVirtualDelegate;
class ResourceWithCommentsRenderer {
  constructor(labels) {
    this.labels = labels;
    this.templateId = "resource-with-comments";
  }
  renderTemplate(container) {
    const labelContainer = dom.append(container, dom.$(".resource-container"));
    const resourceLabel = this.labels.create(labelContainer);
    const separator = dom.append(labelContainer, dom.$(".separator"));
    const owner = labelContainer.appendChild(dom.$(".owner"));
    return { resourceLabel, owner, separator };
  }
  renderElement(node, index, templateData) {
    templateData.resourceLabel.setFile(node.element.resource);
    templateData.separator.innerText = "\xB7";
    if (node.element.ownerLabel) {
      templateData.owner.innerText = node.element.ownerLabel;
      templateData.separator.style.display = "inline";
    } else {
      templateData.owner.innerText = "";
      templateData.separator.style.display = "none";
    }
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
  }
}
let CommentsMenus = class {
  constructor(menuService) {
    this.menuService = menuService;
  }
  getResourceActions(element) {
    const actions = this.getActions(MenuId.CommentsViewThreadActions, element);
    return { actions: actions.primary };
  }
  getResourceContextActions(element) {
    return this.getActions(MenuId.CommentsViewThreadActions, element).secondary;
  }
  setContextKeyService(service) {
    this.contextKeyService = service;
  }
  getActions(menuId, element) {
    if (!this.contextKeyService) {
      return { primary: [], secondary: [] };
    }
    const overlay = [
      ["commentController", element.owner],
      ["resourceScheme", element.resource.scheme],
      ["commentThread", element.contextValue],
      ["canReply", element.thread.canReply]
    ];
    const contextKeyService = this.contextKeyService.createOverlay(overlay);
    const menu = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
    return getContextMenuActions(menu, "inline");
  }
  dispose() {
    this.contextKeyService = void 0;
  }
};
CommentsMenus = __decorateClass([
  __decorateParam(0, IMenuService)
], CommentsMenus);
let CommentNodeRenderer = class {
  constructor(actionViewItemProvider, menus, configurationService, hoverService, themeService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this.menus = menus;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.themeService = themeService;
    this.templateId = "comment-node";
  }
  renderTemplate(container) {
    const threadContainer = dom.append(container, dom.$(".comment-thread-container"));
    const metadataContainer = dom.append(threadContainer, dom.$(".comment-metadata-container"));
    const metadata = dom.append(metadataContainer, dom.$(".comment-metadata"));
    const icon = dom.append(metadata, dom.$(".icon"));
    const userNames = dom.append(metadata, dom.$(".user"));
    const timestamp = new TimestampWidget(this.configurationService, this.hoverService, dom.append(metadata, dom.$(".timestamp-container")));
    const relevance = dom.append(metadata, dom.$(".relevance"));
    const separator = dom.append(metadata, dom.$(".separator"));
    const commentPreview = dom.append(metadata, dom.$(".text"));
    const rangeContainer = dom.append(metadata, dom.$(".range"));
    const range = dom.$("p");
    rangeContainer.appendChild(range);
    const threadMetadata = {
      icon,
      userNames,
      timestamp,
      relevance,
      separator,
      commentPreview,
      range
    };
    threadMetadata.separator.innerText = "\xB7";
    const actionsContainer = dom.append(metadataContainer, dom.$(".actions"));
    const actionBar = new ActionBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider
    });
    const snippetContainer = dom.append(threadContainer, dom.$(".comment-snippet-container"));
    const repliesMetadata = {
      container: snippetContainer,
      icon: dom.append(snippetContainer, dom.$(".icon")),
      count: dom.append(snippetContainer, dom.$(".count")),
      lastReplyDetail: dom.append(snippetContainer, dom.$(".reply-detail")),
      separator: dom.append(snippetContainer, dom.$(".separator")),
      timestamp: new TimestampWidget(this.configurationService, this.hoverService, dom.append(snippetContainer, dom.$(".timestamp-container")))
    };
    repliesMetadata.separator.innerText = "\xB7";
    repliesMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.indent));
    const disposables = [threadMetadata.timestamp, repliesMetadata.timestamp];
    return { threadMetadata, repliesMetadata, actionBar, disposables, elementDisposables: new DisposableStore() };
  }
  getCountString(commentCount) {
    if (commentCount > 2) {
      return nls.localize("commentsCountReplies", "{0} replies", commentCount - 1);
    } else if (commentCount === 2) {
      return nls.localize("commentsCountReply", "1 reply");
    } else {
      return nls.localize("commentCount", "1 comment");
    }
  }
  getRenderedComment(commentBody) {
    const renderedComment = renderMarkdown(commentBody, {}, document.createElement("span"));
    const images = renderedComment.element.getElementsByTagName("img");
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const textDescription = dom.$("");
      textDescription.textContent = image.alt ? nls.localize("imageWithLabel", "Image: {0}", image.alt) : nls.localize("image", "Image");
      image.replaceWith(textDescription);
    }
    const headings = [...renderedComment.element.getElementsByTagName("h1"), ...renderedComment.element.getElementsByTagName("h2"), ...renderedComment.element.getElementsByTagName("h3"), ...renderedComment.element.getElementsByTagName("h4"), ...renderedComment.element.getElementsByTagName("h5"), ...renderedComment.element.getElementsByTagName("h6")];
    for (const heading of headings) {
      const textNode = document.createTextNode(heading.textContent || "");
      heading.replaceWith(textNode);
    }
    while (renderedComment.element.children.length > 1 && renderedComment.element.firstElementChild?.tagName === "HR") {
      renderedComment.element.removeChild(renderedComment.element.firstElementChild);
    }
    return renderedComment;
  }
  getIcon(threadState, hasDraft) {
    if (hasDraft) {
      return Codicon.commentDraft;
    } else if (threadState === CommentThreadState.Unresolved) {
      return Codicon.commentUnresolved;
    } else {
      return Codicon.comment;
    }
  }
  renderElement(node, index, templateData) {
    templateData.actionBar.clear();
    const commentCount = node.element.replies.length + 1;
    if (node.element.threadRelevance === CommentThreadApplicability.Outdated) {
      templateData.threadMetadata.relevance.style.display = "";
      templateData.threadMetadata.relevance.innerText = nls.localize("outdated", "Outdated");
      templateData.threadMetadata.separator.style.display = "none";
    } else {
      templateData.threadMetadata.relevance.innerText = "";
      templateData.threadMetadata.relevance.style.display = "none";
      templateData.threadMetadata.separator.style.display = "";
    }
    templateData.threadMetadata.icon.classList.remove(...Array.from(templateData.threadMetadata.icon.classList.values()).filter((value) => value.startsWith("codicon")));
    const hasDraft = node.element.thread.comments?.some((comment) => comment.state === CommentState.Draft);
    templateData.threadMetadata.icon.classList.add(...ThemeIcon.asClassNameArray(this.getIcon(node.element.threadState, hasDraft)));
    if (node.element.threadState !== void 0) {
      const color = this.getCommentThreadWidgetStateColor(node.element.threadState, this.themeService.getColorTheme());
      templateData.threadMetadata.icon.style.setProperty(commentViewThreadStateColorVar, `${color}`);
      templateData.threadMetadata.icon.style.color = `var(${commentViewThreadStateColorVar})`;
    }
    templateData.threadMetadata.userNames.textContent = node.element.comment.userName;
    templateData.threadMetadata.timestamp.setTimestamp(node.element.comment.timestamp ? new Date(node.element.comment.timestamp) : void 0);
    const originalComment = node.element;
    templateData.threadMetadata.commentPreview.innerText = "";
    templateData.threadMetadata.commentPreview.style.height = "22px";
    if (typeof originalComment.comment.body === "string") {
      templateData.threadMetadata.commentPreview.innerText = originalComment.comment.body;
    } else {
      const renderedComment = this.getRenderedComment(originalComment.comment.body);
      templateData.elementDisposables.add(renderedComment);
      for (let i = renderedComment.element.children.length - 1; i >= 1; i--) {
        renderedComment.element.removeChild(renderedComment.element.children[i]);
      }
      templateData.threadMetadata.commentPreview.appendChild(renderedComment.element);
      templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), templateData.threadMetadata.commentPreview, renderedComment.element.textContent ?? ""));
    }
    if (node.element.range) {
      if (node.element.range.startLineNumber === node.element.range.endLineNumber) {
        templateData.threadMetadata.range.textContent = nls.localize("commentLine", "[Ln {0}]", node.element.range.startLineNumber);
      } else {
        templateData.threadMetadata.range.textContent = nls.localize("commentRange", "[Ln {0}-{1}]", node.element.range.startLineNumber, node.element.range.endLineNumber);
      }
    }
    const menuActions = this.menus.getResourceActions(node.element);
    templateData.actionBar.push(menuActions.actions, { icon: true, label: false });
    templateData.actionBar.context = {
      commentControlHandle: node.element.controllerHandle,
      commentThreadHandle: node.element.threadHandle,
      $mid: MarshalledId.CommentThread
    };
    if (!node.element.hasReply()) {
      templateData.repliesMetadata.container.style.display = "none";
      return;
    }
    templateData.repliesMetadata.container.style.display = "";
    templateData.repliesMetadata.count.textContent = this.getCountString(commentCount);
    const lastComment = node.element.replies[node.element.replies.length - 1].comment;
    templateData.repliesMetadata.lastReplyDetail.textContent = nls.localize("lastReplyFrom", "Last reply from {0}", lastComment.userName);
    templateData.repliesMetadata.timestamp.setTimestamp(lastComment.timestamp ? new Date(lastComment.timestamp) : void 0);
  }
  getCommentThreadWidgetStateColor(state, theme) {
    return state !== void 0 ? getCommentThreadStateIconColor(state, theme) : void 0;
  }
  disposeElement(_node, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.forEach((disposeable) => disposeable.dispose());
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
CommentNodeRenderer = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IThemeService)
], CommentNodeRenderer);
var FilterDataType = /* @__PURE__ */ ((FilterDataType2) => {
  FilterDataType2[FilterDataType2["Resource"] = 0] = "Resource";
  FilterDataType2[FilterDataType2["Comment"] = 1] = "Comment";
  return FilterDataType2;
})(FilterDataType || {});
class Filter {
  constructor(options) {
    this.options = options;
  }
  filter(element, parentVisibility) {
    if (this.options.filter === "" && this.options.showResolved && this.options.showUnresolved) {
      return TreeVisibility.Visible;
    }
    if (element instanceof ResourceWithCommentThreads) {
      return this.filterResourceMarkers(element);
    } else {
      return this.filterCommentNode(element, parentVisibility);
    }
  }
  filterResourceMarkers(resourceMarkers) {
    if (this.options.textFilter.text && !this.options.textFilter.negate) {
      const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
      if (uriMatches) {
        return { visibility: true, data: { type: 0 /* Resource */, uriMatches: uriMatches || [] } };
      }
    }
    return TreeVisibility.Recurse;
  }
  filterCommentNode(comment, parentVisibility) {
    const matchesResolvedState = comment.threadState === void 0 || this.options.showResolved && CommentThreadState.Resolved === comment.threadState || this.options.showUnresolved && CommentThreadState.Unresolved === comment.threadState;
    if (!matchesResolvedState) {
      return false;
    }
    if (!this.options.textFilter.text) {
      return true;
    }
    const textMatches = (
      // Check body of comment for value
      FilterOptions._messageFilter(this.options.textFilter.text, typeof comment.comment.body === "string" ? comment.comment.body : comment.comment.body.value) || FilterOptions._messageFilter(this.options.textFilter.text, comment.comment.userName) || comment.replies.map((reply) => {
        return FilterOptions._messageFilter(this.options.textFilter.text, reply.comment.userName) || FilterOptions._messageFilter(this.options.textFilter.text, typeof reply.comment.body === "string" ? reply.comment.body : reply.comment.body.value);
      }).filter((value) => !!value).flat()
    );
    if (textMatches.length && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 1 /* Comment */, textMatches } };
    }
    if (textMatches.length && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (textMatches.length === 0 && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
}
let CommentsList = class extends WorkbenchObjectTree {
  constructor(labels, container, options, contextKeyService, listService, instantiationService, configurationService, contextMenuService, keybindingService) {
    const delegate = new CommentsModelVirtualDelegate();
    const actionViewItemProvider = createActionViewItem.bind(void 0, instantiationService);
    const menus = instantiationService.createInstance(CommentsMenus);
    menus.setContextKeyService(contextKeyService);
    const renderers = [
      instantiationService.createInstance(ResourceWithCommentsRenderer, labels),
      instantiationService.createInstance(CommentNodeRenderer, actionViewItemProvider, menus)
    ];
    super(
      "CommentsTree",
      container,
      delegate,
      renderers,
      {
        accessibilityProvider: options.accessibilityProvider,
        identityProvider: {
          getId: (element) => {
            if (element instanceof CommentsModel) {
              return "root";
            }
            if (element instanceof ResourceWithCommentThreads) {
              return `${element.uniqueOwner}-${element.id}`;
            }
            if (element instanceof CommentNode) {
              return `${element.uniqueOwner}-${element.resource.toString()}-${element.threadId}-${element.comment.uniqueIdInThread}` + (element.isRoot ? "-root" : "");
            }
            return "";
          }
        },
        expandOnlyOnTwistieClick: true,
        collapseByDefault: false,
        overrideStyles: options.overrideStyles,
        filter: options.filter,
        sorter: options.sorter,
        findWidgetEnabled: false,
        multipleSelectionSupport: false
      },
      instantiationService,
      contextKeyService,
      listService,
      configurationService
    );
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menus = menus;
    this.disposables.add(this.onContextMenu((e) => this.commentsOnContextMenu(e)));
  }
  commentsOnContextMenu(treeEvent) {
    const node = treeEvent.element;
    if (!(node instanceof CommentNode)) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    this.setFocus([node]);
    const actions = this.menus.getResourceContextActions(node);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.domFocus();
        }
      },
      getActionsContext: () => ({
        commentControlHandle: node.controllerHandle,
        commentThreadHandle: node.threadHandle,
        $mid: MarshalledId.CommentThread,
        thread: node.thread
      })
    });
  }
  filterComments() {
    this.refilter();
  }
  getVisibleItemCount() {
    let filtered = 0;
    const root = this.getNode();
    for (const resourceNode of root.children) {
      for (const commentNode of resourceNode.children) {
        if (commentNode.visible && resourceNode.visible) {
          filtered++;
        }
      }
    }
    return filtered;
  }
};
CommentsList = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IListService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService)
], CommentsList);
export {
  COMMENTS_VIEW_ID,
  COMMENTS_VIEW_STORAGE_ID,
  COMMENTS_VIEW_TITLE,
  CommentNodeRenderer,
  CommentsList,
  CommentsMenus,
  Filter,
  ResourceWithCommentsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50c1RyZWVWaWV3ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBDb21tZW50Tm9kZSwgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfSBmcm9tICcuLi9jb21tb24vY29tbWVudE1vZGVsLmpzJztcbmltcG9ydCB7IElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVGaWx0ZXIsIElUcmVlTm9kZSwgVHJlZUZpbHRlclJlc3VsdCwgVHJlZVZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnMsIFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGltZXN0YW1wV2lkZ2V0IH0gZnJvbSAnLi90aW1lc3RhbXAuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBjb21tZW50Vmlld1RocmVhZFN0YXRlQ29sb3JWYXIsIGdldENvbW1lbnRUaHJlYWRTdGF0ZUljb25Db2xvciB9IGZyb20gJy4vY29tbWVudENvbG9ycy5qcyc7XG5pbXBvcnQgeyBDb21tZW50VGhyZWFkQXBwbGljYWJpbGl0eSwgQ29tbWVudFRocmVhZFN0YXRlLCBDb21tZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRmlsdGVyT3B0aW9ucyB9IGZyb20gJy4vY29tbWVudHNGaWx0ZXJPcHRpb25zLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElTdHlsZU92ZXJyaWRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29tbWVudHNNb2RlbCB9IGZyb20gJy4vY29tbWVudHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRDb21tZW50VGhyZWFkLCBNYXJzaGFsbGVkQ29tbWVudFRocmVhZEludGVybmFsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbW1lbnRzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuZXhwb3J0IGNvbnN0IENPTU1FTlRTX1ZJRVdfSUQgPSAnd29ya2JlbmNoLnBhbmVsLmNvbW1lbnRzJztcbmV4cG9ydCBjb25zdCBDT01NRU5UU19WSUVXX1NUT1JBR0VfSUQgPSAnQ29tbWVudHMnO1xuZXhwb3J0IGNvbnN0IENPTU1FTlRTX1ZJRVdfVElUTEU6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdjb21tZW50cy52aWV3LnRpdGxlJywgXCJDb21tZW50c1wiKTtcblxuaW50ZXJmYWNlIElSZXNvdXJjZVRlbXBsYXRlRGF0YSB7XG5cdHJlc291cmNlTGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRzZXBhcmF0b3I6IEhUTUxFbGVtZW50O1xuXHRvd25lcjogSFRNTEVsZW1lbnQ7XG59XG5cbmludGVyZmFjZSBJQ29tbWVudFRocmVhZFRlbXBsYXRlRGF0YSB7XG5cdHRocmVhZE1ldGFkYXRhOiB7XG5cdFx0cmVsZXZhbmNlOiBIVE1MRWxlbWVudDtcblx0XHRpY29uOiBIVE1MRWxlbWVudDtcblx0XHR1c2VyTmFtZXM6IEhUTUxTcGFuRWxlbWVudDtcblx0XHR0aW1lc3RhbXA6IFRpbWVzdGFtcFdpZGdldDtcblx0XHRzZXBhcmF0b3I6IEhUTUxFbGVtZW50O1xuXHRcdGNvbW1lbnRQcmV2aWV3OiBIVE1MU3BhbkVsZW1lbnQ7XG5cdFx0cmFuZ2U6IEhUTUxFbGVtZW50O1xuXHR9O1xuXHRyZXBsaWVzTWV0YWRhdGE6IHtcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRcdGljb246IEhUTUxFbGVtZW50O1xuXHRcdGNvdW50OiBIVE1MU3BhbkVsZW1lbnQ7XG5cdFx0bGFzdFJlcGx5RGV0YWlsOiBIVE1MU3BhbkVsZW1lbnQ7XG5cdFx0c2VwYXJhdG9yOiBIVE1MRWxlbWVudDtcblx0XHR0aW1lc3RhbXA6IFRpbWVzdGFtcFdpZGdldDtcblx0fTtcblx0YWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQ29tbWVudHNNb2RlbFZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIHwgQ29tbWVudE5vZGU+IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVTT1VSQ0VfSUQgPSAncmVzb3VyY2Utd2l0aC1jb21tZW50cyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENPTU1FTlRfSUQgPSAnY29tbWVudC1ub2RlJztcblxuXG5cdGdldEhlaWdodChlbGVtZW50OiBhbnkpOiBudW1iZXIge1xuXHRcdGlmICgoZWxlbWVudCBpbnN0YW5jZW9mIENvbW1lbnROb2RlKSAmJiBlbGVtZW50Lmhhc1JlcGx5KCkpIHtcblx0XHRcdHJldHVybiA0NDtcblx0XHR9XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0cHVibGljIGdldFRlbXBsYXRlSWQoZWxlbWVudDogYW55KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzKSB7XG5cdFx0XHRyZXR1cm4gQ29tbWVudHNNb2RlbFZpcnR1YWxEZWxlZ2F0ZS5SRVNPVVJDRV9JRDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkge1xuXHRcdFx0cmV0dXJuIENvbW1lbnRzTW9kZWxWaXJ0dWFsRGVsZWdhdGUuQ09NTUVOVF9JRDtcblx0XHR9XG5cblx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc291cmNlV2l0aENvbW1lbnRzUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcz4sIElSZXNvdXJjZVRlbXBsYXRlRGF0YT4ge1xuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAncmVzb3VyY2Utd2l0aC1jb21tZW50cyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcucmVzb3VyY2UtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWwgPSB0aGlzLmxhYmVscy5jcmVhdGUobGFiZWxDb250YWluZXIpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGRvbS5hcHBlbmQobGFiZWxDb250YWluZXIsIGRvbS4kKCcuc2VwYXJhdG9yJykpO1xuXHRcdGNvbnN0IG93bmVyID0gbGFiZWxDb250YWluZXIuYXBwZW5kQ2hpbGQoZG9tLiQoJy5vd25lcicpKTtcblxuXHRcdHJldHVybiB7IHJlc291cmNlTGFiZWwsIG93bmVyLCBzZXBhcmF0b3IgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5zZXRGaWxlKG5vZGUuZWxlbWVudC5yZXNvdXJjZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnNlcGFyYXRvci5pbm5lclRleHQgPSAnXFx1MDBiNyc7XG5cblx0XHRpZiAobm9kZS5lbGVtZW50Lm93bmVyTGFiZWwpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5vd25lci5pbm5lclRleHQgPSBub2RlLmVsZW1lbnQub3duZXJMYWJlbDtcblx0XHRcdHRlbXBsYXRlRGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEub3duZXIuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVJlc291cmNlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50c01lbnVzIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXRSZXNvdXJjZUFjdGlvbnMoZWxlbWVudDogQ29tbWVudE5vZGUpOiB7IGFjdGlvbnM6IElBY3Rpb25bXSB9IHtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRBY3Rpb25zKE1lbnVJZC5Db21tZW50c1ZpZXdUaHJlYWRBY3Rpb25zLCBlbGVtZW50KTtcblx0XHRyZXR1cm4geyBhY3Rpb25zOiBhY3Rpb25zLnByaW1hcnkgfTtcblx0fVxuXG5cdGdldFJlc291cmNlQ29udGV4dEFjdGlvbnMoZWxlbWVudDogQ29tbWVudE5vZGUpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLmdldEFjdGlvbnMoTWVudUlkLkNvbW1lbnRzVmlld1RocmVhZEFjdGlvbnMsIGVsZW1lbnQpLnNlY29uZGFyeTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb250ZXh0S2V5U2VydmljZShzZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gc2VydmljZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucyhtZW51SWQ6IE1lbnVJZCwgZWxlbWVudDogQ29tbWVudE5vZGUpOiB7IHByaW1hcnk6IElBY3Rpb25bXTsgc2Vjb25kYXJ5OiBJQWN0aW9uW10gfSB7XG5cdFx0aWYgKCF0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4geyBwcmltYXJ5OiBbXSwgc2Vjb25kYXJ5OiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG92ZXJsYXk6IFtzdHJpbmcsIGFueV1bXSA9IFtcblx0XHRcdFsnY29tbWVudENvbnRyb2xsZXInLCBlbGVtZW50Lm93bmVyXSxcblx0XHRcdFsncmVzb3VyY2VTY2hlbWUnLCBlbGVtZW50LnJlc291cmNlLnNjaGVtZV0sXG5cdFx0XHRbJ2NvbW1lbnRUaHJlYWQnLCBlbGVtZW50LmNvbnRleHRWYWx1ZV0sXG5cdFx0XHRbJ2NhblJlcGx5JywgZWxlbWVudC50aHJlYWQuY2FuUmVwbHldXG5cdFx0XTtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShvdmVybGF5KTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKG1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51LCAnaW5saW5lJyk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbW1lbnROb2RlUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxDb21tZW50Tm9kZT4sIElDb21tZW50VGhyZWFkVGVtcGxhdGVEYXRhPiB7XG5cdHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdjb21tZW50LW5vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSBtZW51czogQ29tbWVudHNNZW51cyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCB0aHJlYWRDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LXRocmVhZC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbWV0YWRhdGFDb250YWluZXIgPSBkb20uYXBwZW5kKHRocmVhZENvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LW1ldGFkYXRhLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBtZXRhZGF0YSA9IGRvbS5hcHBlbmQobWV0YWRhdGFDb250YWluZXIsIGRvbS4kKCcuY29tbWVudC1tZXRhZGF0YScpKTtcblxuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKG1ldGFkYXRhLCBkb20uJCgnLmljb24nKSk7XG5cdFx0Y29uc3QgdXNlck5hbWVzID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy51c2VyJykpO1xuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IG5ldyBUaW1lc3RhbXBXaWRnZXQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UsIGRvbS5hcHBlbmQobWV0YWRhdGEsIGRvbS4kKCcudGltZXN0YW1wLWNvbnRhaW5lcicpKSk7XG5cdFx0Y29uc3QgcmVsZXZhbmNlID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy5yZWxldmFuY2UnKSk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gZG9tLmFwcGVuZChtZXRhZGF0YSwgZG9tLiQoJy5zZXBhcmF0b3InKSk7XG5cdFx0Y29uc3QgY29tbWVudFByZXZpZXcgPSBkb20uYXBwZW5kKG1ldGFkYXRhLCBkb20uJCgnLnRleHQnKSk7XG5cdFx0Y29uc3QgcmFuZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKG1ldGFkYXRhLCBkb20uJCgnLnJhbmdlJykpO1xuXHRcdGNvbnN0IHJhbmdlID0gZG9tLiQoJ3AnKTtcblx0XHRyYW5nZUNvbnRhaW5lci5hcHBlbmRDaGlsZChyYW5nZSk7XG5cblx0XHRjb25zdCB0aHJlYWRNZXRhZGF0YSA9IHtcblx0XHRcdGljb24sXG5cdFx0XHR1c2VyTmFtZXMsXG5cdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRyZWxldmFuY2UsXG5cdFx0XHRzZXBhcmF0b3IsXG5cdFx0XHRjb21tZW50UHJldmlldyxcblx0XHRcdHJhbmdlXG5cdFx0fTtcblx0XHR0aHJlYWRNZXRhZGF0YS5zZXBhcmF0b3IuaW5uZXJUZXh0ID0gJ1xcdTAwYjcnO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQobWV0YWRhdGFDb250YWluZXIsIGRvbS4kKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlclxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc25pcHBldENvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhyZWFkQ29udGFpbmVyLCBkb20uJCgnLmNvbW1lbnQtc25pcHBldC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgcmVwbGllc01ldGFkYXRhID0ge1xuXHRcdFx0Y29udGFpbmVyOiBzbmlwcGV0Q29udGFpbmVyLFxuXHRcdFx0aWNvbjogZG9tLmFwcGVuZChzbmlwcGV0Q29udGFpbmVyLCBkb20uJCgnLmljb24nKSksXG5cdFx0XHRjb3VudDogZG9tLmFwcGVuZChzbmlwcGV0Q29udGFpbmVyLCBkb20uJCgnLmNvdW50JykpLFxuXHRcdFx0bGFzdFJlcGx5RGV0YWlsOiBkb20uYXBwZW5kKHNuaXBwZXRDb250YWluZXIsIGRvbS4kKCcucmVwbHktZGV0YWlsJykpLFxuXHRcdFx0c2VwYXJhdG9yOiBkb20uYXBwZW5kKHNuaXBwZXRDb250YWluZXIsIGRvbS4kKCcuc2VwYXJhdG9yJykpLFxuXHRcdFx0dGltZXN0YW1wOiBuZXcgVGltZXN0YW1wV2lkZ2V0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuaG92ZXJTZXJ2aWNlLCBkb20uYXBwZW5kKHNuaXBwZXRDb250YWluZXIsIGRvbS4kKCcudGltZXN0YW1wLWNvbnRhaW5lcicpKSksXG5cdFx0fTtcblx0XHRyZXBsaWVzTWV0YWRhdGEuc2VwYXJhdG9yLmlubmVyVGV4dCA9ICdcXHUwMGI3Jztcblx0XHRyZXBsaWVzTWV0YWRhdGEuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uaW5kZW50KSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IFt0aHJlYWRNZXRhZGF0YS50aW1lc3RhbXAsIHJlcGxpZXNNZXRhZGF0YS50aW1lc3RhbXBdO1xuXHRcdHJldHVybiB7IHRocmVhZE1ldGFkYXRhLCByZXBsaWVzTWV0YWRhdGEsIGFjdGlvbkJhciwgZGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdH1cblxuXHRwcml2YXRlIGdldENvdW50U3RyaW5nKGNvbW1lbnRDb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAoY29tbWVudENvdW50ID4gMikge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnY29tbWVudHNDb3VudFJlcGxpZXMnLCBcInswfSByZXBsaWVzXCIsIGNvbW1lbnRDb3VudCAtIDEpO1xuXHRcdH0gZWxzZSBpZiAoY29tbWVudENvdW50ID09PSAyKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdjb21tZW50c0NvdW50UmVwbHknLCBcIjEgcmVwbHlcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2NvbW1lbnRDb3VudCcsIFwiMSBjb21tZW50XCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVuZGVyZWRDb21tZW50KGNvbW1lbnRCb2R5OiBJTWFya2Rvd25TdHJpbmcpIHtcblx0XHRjb25zdCByZW5kZXJlZENvbW1lbnQgPSByZW5kZXJNYXJrZG93bihjb21tZW50Qm9keSwge30sIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaW1hZ2VzID0gcmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2ltZycpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW1hZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpbWFnZSA9IGltYWdlc1tpXTtcblx0XHRcdGNvbnN0IHRleHREZXNjcmlwdGlvbiA9IGRvbS4kKCcnKTtcblx0XHRcdHRleHREZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IGltYWdlLmFsdCA/IG5scy5sb2NhbGl6ZSgnaW1hZ2VXaXRoTGFiZWwnLCBcIkltYWdlOiB7MH1cIiwgaW1hZ2UuYWx0KSA6IG5scy5sb2NhbGl6ZSgnaW1hZ2UnLCBcIkltYWdlXCIpO1xuXHRcdFx0aW1hZ2UucmVwbGFjZVdpdGgodGV4dERlc2NyaXB0aW9uKTtcblx0XHR9XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgaGVhZGluZ3MgPSBbLi4ucmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2gxJyksIC4uLnJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoMicpLCAuLi5yZW5kZXJlZENvbW1lbnQuZWxlbWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDMnKSwgLi4ucmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2g0JyksIC4uLnJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdoNScpLCAuLi5yZW5kZXJlZENvbW1lbnQuZWxlbWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZSgnaDYnKV07XG5cdFx0Zm9yIChjb25zdCBoZWFkaW5nIG9mIGhlYWRpbmdzKSB7XG5cdFx0XHRjb25zdCB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKGhlYWRpbmcudGV4dENvbnRlbnQgfHwgJycpO1xuXHRcdFx0aGVhZGluZy5yZXBsYWNlV2l0aCh0ZXh0Tm9kZSk7XG5cdFx0fVxuXHRcdHdoaWxlICgocmVuZGVyZWRDb21tZW50LmVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMSkgJiYgKHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LmZpcnN0RWxlbWVudENoaWxkPy50YWdOYW1lID09PSAnSFInKSkge1xuXHRcdFx0cmVuZGVyZWRDb21tZW50LmVsZW1lbnQucmVtb3ZlQ2hpbGQocmVuZGVyZWRDb21tZW50LmVsZW1lbnQuZmlyc3RFbGVtZW50Q2hpbGQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVuZGVyZWRDb21tZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJY29uKHRocmVhZFN0YXRlPzogQ29tbWVudFRocmVhZFN0YXRlLCBoYXNEcmFmdD86IGJvb2xlYW4pOiBUaGVtZUljb24ge1xuXHRcdC8vIFByaW9yaXR5OiBkcmFmdCA+IHVucmVzb2x2ZWQgPiByZXNvbHZlZFxuXHRcdGlmIChoYXNEcmFmdCkge1xuXHRcdFx0cmV0dXJuIENvZGljb24uY29tbWVudERyYWZ0O1xuXHRcdH0gZWxzZSBpZiAodGhyZWFkU3RhdGUgPT09IENvbW1lbnRUaHJlYWRTdGF0ZS5VbnJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm4gQ29kaWNvbi5jb21tZW50VW5yZXNvbHZlZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIENvZGljb24uY29tbWVudDtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDb21tZW50Tm9kZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbW1lbnRUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cblx0XHRjb25zdCBjb21tZW50Q291bnQgPSBub2RlLmVsZW1lbnQucmVwbGllcy5sZW5ndGggKyAxO1xuXHRcdGlmIChub2RlLmVsZW1lbnQudGhyZWFkUmVsZXZhbmNlID09PSBDb21tZW50VGhyZWFkQXBwbGljYWJpbGl0eS5PdXRkYXRlZCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnJlbGV2YW5jZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEucmVsZXZhbmNlLmlubmVyVGV4dCA9IG5scy5sb2NhbGl6ZSgnb3V0ZGF0ZWQnLCBcIk91dGRhdGVkXCIpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEucmVsZXZhbmNlLmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnJlbGV2YW5jZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLmljb24uY2xhc3NMaXN0LnJlbW92ZSguLi5BcnJheS5mcm9tKHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5pY29uLmNsYXNzTGlzdC52YWx1ZXMoKSlcblx0XHRcdC5maWx0ZXIodmFsdWUgPT4gdmFsdWUuc3RhcnRzV2l0aCgnY29kaWNvbicpKSk7XG5cdFx0Ly8gQ2hlY2sgaWYgYW55IGNvbW1lbnQgaW4gdGhlIHRocmVhZCBoYXMgZHJhZnQgc3RhdGVcblx0XHRjb25zdCBoYXNEcmFmdCA9IG5vZGUuZWxlbWVudC50aHJlYWQuY29tbWVudHM/LnNvbWUoY29tbWVudCA9PiBjb21tZW50LnN0YXRlID09PSBDb21tZW50U3RhdGUuRHJhZnQpO1xuXHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5pY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5nZXRJY29uKG5vZGUuZWxlbWVudC50aHJlYWRTdGF0ZSwgaGFzRHJhZnQpKSk7XG5cdFx0aWYgKG5vZGUuZWxlbWVudC50aHJlYWRTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjb2xvciA9IHRoaXMuZ2V0Q29tbWVudFRocmVhZFdpZGdldFN0YXRlQ29sb3Iobm9kZS5lbGVtZW50LnRocmVhZFN0YXRlLCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLmljb24uc3R5bGUuc2V0UHJvcGVydHkoY29tbWVudFZpZXdUaHJlYWRTdGF0ZUNvbG9yVmFyLCBgJHtjb2xvcn1gKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5pY29uLnN0eWxlLmNvbG9yID0gYHZhcigke2NvbW1lbnRWaWV3VGhyZWFkU3RhdGVDb2xvclZhcn0pYDtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnVzZXJOYW1lcy50ZXh0Q29udGVudCA9IG5vZGUuZWxlbWVudC5jb21tZW50LnVzZXJOYW1lO1xuXHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS50aW1lc3RhbXAuc2V0VGltZXN0YW1wKG5vZGUuZWxlbWVudC5jb21tZW50LnRpbWVzdGFtcCA/IG5ldyBEYXRlKG5vZGUuZWxlbWVudC5jb21tZW50LnRpbWVzdGFtcCkgOiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IG9yaWdpbmFsQ29tbWVudCA9IG5vZGUuZWxlbWVudDtcblxuXHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5jb21tZW50UHJldmlldy5pbm5lclRleHQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuY29tbWVudFByZXZpZXcuc3R5bGUuaGVpZ2h0ID0gJzIycHgnO1xuXHRcdGlmICh0eXBlb2Ygb3JpZ2luYWxDb21tZW50LmNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5jb21tZW50UHJldmlldy5pbm5lclRleHQgPSBvcmlnaW5hbENvbW1lbnQuY29tbWVudC5ib2R5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZENvbW1lbnQgPSB0aGlzLmdldFJlbmRlcmVkQ29tbWVudChvcmlnaW5hbENvbW1lbnQuY29tbWVudC5ib2R5KTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkQ29tbWVudCk7XG5cdFx0XHRmb3IgKGxldCBpID0gcmVuZGVyZWRDb21tZW50LmVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAxOyBpLS0pIHtcblx0XHRcdFx0cmVuZGVyZWRDb21tZW50LmVsZW1lbnQucmVtb3ZlQ2hpbGQocmVuZGVyZWRDb21tZW50LmVsZW1lbnQuY2hpbGRyZW5baV0pO1xuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLmNvbW1lbnRQcmV2aWV3LmFwcGVuZENoaWxkKHJlbmRlcmVkQ29tbWVudC5lbGVtZW50KTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0ZW1wbGF0ZURhdGEudGhyZWFkTWV0YWRhdGEuY29tbWVudFByZXZpZXcsIHJlbmRlcmVkQ29tbWVudC5lbGVtZW50LnRleHRDb250ZW50ID8/ICcnKSk7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUuZWxlbWVudC5yYW5nZSkge1xuXHRcdFx0aWYgKG5vZGUuZWxlbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IG5vZGUuZWxlbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS50aHJlYWRNZXRhZGF0YS5yYW5nZS50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnY29tbWVudExpbmUnLCBcIltMbiB7MH1dXCIsIG5vZGUuZWxlbWVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnRocmVhZE1ldGFkYXRhLnJhbmdlLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdjb21tZW50UmFuZ2UnLCBcIltMbiB7MH0tezF9XVwiLCBub2RlLmVsZW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBub2RlLmVsZW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLm1lbnVzLmdldFJlc291cmNlQWN0aW9ucyhub2RlLmVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChtZW51QWN0aW9ucy5hY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSB7XG5cdFx0XHRjb21tZW50Q29udHJvbEhhbmRsZTogbm9kZS5lbGVtZW50LmNvbnRyb2xsZXJIYW5kbGUsXG5cdFx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiBub2RlLmVsZW1lbnQudGhyZWFkSGFuZGxlLFxuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWRcblx0XHR9IHNhdGlzZmllcyBNYXJzaGFsbGVkQ29tbWVudFRocmVhZDtcblxuXHRcdGlmICghbm9kZS5lbGVtZW50Lmhhc1JlcGx5KCkpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5yZXBsaWVzTWV0YWRhdGEuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnJlcGxpZXNNZXRhZGF0YS5jb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXBsaWVzTWV0YWRhdGEuY291bnQudGV4dENvbnRlbnQgPSB0aGlzLmdldENvdW50U3RyaW5nKGNvbW1lbnRDb3VudCk7XG5cdFx0Y29uc3QgbGFzdENvbW1lbnQgPSBub2RlLmVsZW1lbnQucmVwbGllc1tub2RlLmVsZW1lbnQucmVwbGllcy5sZW5ndGggLSAxXS5jb21tZW50O1xuXHRcdHRlbXBsYXRlRGF0YS5yZXBsaWVzTWV0YWRhdGEubGFzdFJlcGx5RGV0YWlsLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdsYXN0UmVwbHlGcm9tJywgXCJMYXN0IHJlcGx5IGZyb20gezB9XCIsIGxhc3RDb21tZW50LnVzZXJOYW1lKTtcblx0XHR0ZW1wbGF0ZURhdGEucmVwbGllc01ldGFkYXRhLnRpbWVzdGFtcC5zZXRUaW1lc3RhbXAobGFzdENvbW1lbnQudGltZXN0YW1wID8gbmV3IERhdGUobGFzdENvbW1lbnQudGltZXN0YW1wKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbW1lbnRUaHJlYWRXaWRnZXRTdGF0ZUNvbG9yKHN0YXRlOiBDb21tZW50VGhyZWFkU3RhdGUgfCB1bmRlZmluZWQsIHRoZW1lOiBJQ29sb3JUaGVtZSk6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gKHN0YXRlICE9PSB1bmRlZmluZWQpID8gZ2V0Q29tbWVudFRocmVhZFN0YXRlSWNvbkNvbG9yKHN0YXRlLCB0aGVtZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfbm9kZTogSVRyZWVOb2RlPENvbW1lbnROb2RlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbW1lbnRUaHJlYWRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQ29tbWVudFRocmVhZFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5mb3JFYWNoKGRpc3Bvc2VhYmxlID0+IGRpc3Bvc2VhYmxlLmRpc3Bvc2UoKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWVudHNMaXN0T3B0aW9ucyBleHRlbmRzIElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uczxhbnksIGFueT4ge1xuXHRvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcbn1cblxuY29uc3QgZW51bSBGaWx0ZXJEYXRhVHlwZSB7XG5cdFJlc291cmNlLFxuXHRDb21tZW50XG59XG5cbmludGVyZmFjZSBSZXNvdXJjZUZpbHRlckRhdGEge1xuXHR0eXBlOiBGaWx0ZXJEYXRhVHlwZS5SZXNvdXJjZTtcblx0dXJpTWF0Y2hlczogSU1hdGNoW107XG59XG5cbmludGVyZmFjZSBDb21tZW50RmlsdGVyRGF0YSB7XG5cdHR5cGU6IEZpbHRlckRhdGFUeXBlLkNvbW1lbnQ7XG5cdHRleHRNYXRjaGVzOiBJTWF0Y2hbXTtcbn1cblxudHlwZSBGaWx0ZXJEYXRhID0gUmVzb3VyY2VGaWx0ZXJEYXRhIHwgQ29tbWVudEZpbHRlckRhdGE7XG5cbmV4cG9ydCBjbGFzcyBGaWx0ZXIgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB8IENvbW1lbnROb2RlLCBGaWx0ZXJEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IocHVibGljIG9wdGlvbnM6IEZpbHRlck9wdGlvbnMpIHsgfVxuXG5cdGZpbHRlcihlbGVtZW50OiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB8IENvbW1lbnROb2RlLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZmlsdGVyID09PSAnJyAmJiB0aGlzLm9wdGlvbnMuc2hvd1Jlc29sdmVkICYmIHRoaXMub3B0aW9ucy5zaG93VW5yZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsdGVyUmVzb3VyY2VNYXJrZXJzKGVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWx0ZXJDb21tZW50Tm9kZShlbGVtZW50LCBwYXJlbnRWaXNpYmlsaXR5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlc291cmNlTWFya2VycyhyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzKTogVHJlZUZpbHRlclJlc3VsdDxGaWx0ZXJEYXRhPiB7XG5cdFx0Ly8gRmlsdGVyIGJ5IHRleHQuIERvIG5vdCBhcHBseSBuZWdhdGVkIGZpbHRlcnMgb24gcmVzb3VyY2VzIGluc3RlYWQgdXNlIGV4Y2x1ZGUgcGF0dGVybnNcblx0XHRpZiAodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCAmJiAhdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlKSB7XG5cdFx0XHRjb25zdCB1cmlNYXRjaGVzID0gRmlsdGVyT3B0aW9ucy5fZmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIGJhc2VuYW1lKHJlc291cmNlTWFya2Vycy5yZXNvdXJjZSkpO1xuXHRcdFx0aWYgKHVyaU1hdGNoZXMpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmlzaWJpbGl0eTogdHJ1ZSwgZGF0YTogeyB0eXBlOiBGaWx0ZXJEYXRhVHlwZS5SZXNvdXJjZSwgdXJpTWF0Y2hlczogdXJpTWF0Y2hlcyB8fCBbXSB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2U7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckNvbW1lbnROb2RlKGNvbW1lbnQ6IENvbW1lbnROb2RlLCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RmlsdGVyRGF0YT4ge1xuXHRcdGNvbnN0IG1hdGNoZXNSZXNvbHZlZFN0YXRlID0gKGNvbW1lbnQudGhyZWFkU3RhdGUgPT09IHVuZGVmaW5lZCkgfHwgKHRoaXMub3B0aW9ucy5zaG93UmVzb2x2ZWQgJiYgQ29tbWVudFRocmVhZFN0YXRlLlJlc29sdmVkID09PSBjb21tZW50LnRocmVhZFN0YXRlKSB8fFxuXHRcdFx0KHRoaXMub3B0aW9ucy5zaG93VW5yZXNvbHZlZCAmJiBDb21tZW50VGhyZWFkU3RhdGUuVW5yZXNvbHZlZCA9PT0gY29tbWVudC50aHJlYWRTdGF0ZSk7XG5cblx0XHRpZiAoIW1hdGNoZXNSZXNvbHZlZFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0TWF0Y2hlcyA9XG5cdFx0XHQvLyBDaGVjayBib2R5IG9mIGNvbW1lbnQgZm9yIHZhbHVlXG5cdFx0XHRGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIHR5cGVvZiBjb21tZW50LmNvbW1lbnQuYm9keSA9PT0gJ3N0cmluZycgPyBjb21tZW50LmNvbW1lbnQuYm9keSA6IGNvbW1lbnQuY29tbWVudC5ib2R5LnZhbHVlKVxuXHRcdFx0Ly8gQ2hlY2sgZmlyc3QgdXNlciBmb3IgdmFsdWVcblx0XHRcdHx8IEZpbHRlck9wdGlvbnMuX21lc3NhZ2VGaWx0ZXIodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgY29tbWVudC5jb21tZW50LnVzZXJOYW1lKVxuXHRcdFx0Ly8gQ2hlY2sgYWxsIHJlcGxpZXMgZm9yIHZhbHVlXG5cdFx0XHR8fCAoY29tbWVudC5yZXBsaWVzLm1hcChyZXBseSA9PiB7XG5cdFx0XHRcdC8vIENoZWNrIHVzZXIgZm9yIHZhbHVlXG5cdFx0XHRcdHJldHVybiBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIHJlcGx5LmNvbW1lbnQudXNlck5hbWUpXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgYm9keSBvZiByZXBseSBmb3IgdmFsdWVcblx0XHRcdFx0XHR8fCBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIHR5cGVvZiByZXBseS5jb21tZW50LmJvZHkgPT09ICdzdHJpbmcnID8gcmVwbHkuY29tbWVudC5ib2R5IDogcmVwbHkuY29tbWVudC5ib2R5LnZhbHVlKTtcblx0XHRcdH0pLmZpbHRlcih2YWx1ZSA9PiAhIXZhbHVlKSBhcyBJTWF0Y2hbXVtdKS5mbGF0KCk7XG5cblx0XHQvLyBNYXRjaGVkIGFuZCBub3QgbmVnYXRlZFxuXHRcdGlmICh0ZXh0TWF0Y2hlcy5sZW5ndGggJiYgIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkge1xuXHRcdFx0cmV0dXJuIHsgdmlzaWJpbGl0eTogdHJ1ZSwgZGF0YTogeyB0eXBlOiBGaWx0ZXJEYXRhVHlwZS5Db21tZW50LCB0ZXh0TWF0Y2hlcyB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGV4Y2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKHRleHRNYXRjaGVzLmxlbmd0aCAmJiB0aGlzLm9wdGlvbnMudGV4dEZpbHRlci5uZWdhdGUgJiYgcGFyZW50VmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIE5vdCBtYXRjaGVkIGFuZCBuZWdhdGVkIC0gaW5jbHVkZSBpdCBvbmx5IGlmIHBhcmVudCB2aXNpYmlsaXR5IGlzIG5vdCBzZXRcblx0XHRpZiAoKHRleHRNYXRjaGVzLmxlbmd0aCA9PT0gMCkgJiYgdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlICYmIHBhcmVudFZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJlbnRWaXNpYmlsaXR5O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50c0xpc3QgZXh0ZW5kcyBXb3JrYmVuY2hPYmplY3RUcmVlPENvbW1lbnRzTW9kZWwgfCBSZXNvdXJjZVdpdGhDb21tZW50VGhyZWFkcyB8IENvbW1lbnROb2RlLCBhbnk+IHtcblx0cHJpdmF0ZSByZWFkb25seSBtZW51czogQ29tbWVudHNNZW51cztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogSUNvbW1lbnRzTGlzdE9wdGlvbnMsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IENvbW1lbnRzTW9kZWxWaXJ0dWFsRGVsZWdhdGUoKTtcblx0XHRjb25zdCBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyID0gY3JlYXRlQWN0aW9uVmlld0l0ZW0uYmluZCh1bmRlZmluZWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBtZW51cyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1lbnRzTWVudXMpO1xuXHRcdG1lbnVzLnNldENvbnRleHRLZXlTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCByZW5kZXJlcnMgPSBbXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZVdpdGhDb21tZW50c1JlbmRlcmVyLCBsYWJlbHMpLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWVudE5vZGVSZW5kZXJlciwgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciwgbWVudXMpXG5cdFx0XTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0J0NvbW1lbnRzVHJlZScsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHJlbmRlcmVycyxcblx0XHRcdHtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcixcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZWxlbWVudDogYW55KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIENvbW1lbnRzTW9kZWwpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuICdyb290Jztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke2VsZW1lbnQudW5pcXVlT3duZXJ9LSR7ZWxlbWVudC5pZH1gO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBDb21tZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYCR7ZWxlbWVudC51bmlxdWVPd25lcn0tJHtlbGVtZW50LnJlc291cmNlLnRvU3RyaW5nKCl9LSR7ZWxlbWVudC50aHJlYWRJZH0tJHtlbGVtZW50LmNvbW1lbnQudW5pcXVlSWRJblRocmVhZH1gICsgKGVsZW1lbnQuaXNSb290ID8gJy1yb290JyA6ICcnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogb3B0aW9ucy5vdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0ZmlsdGVyOiBvcHRpb25zLmZpbHRlcixcblx0XHRcdFx0c29ydGVyOiBvcHRpb25zLnNvcnRlcixcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRsaXN0U2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdCk7XG5cdFx0dGhpcy5tZW51cyA9IG1lbnVzO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25Db250ZXh0TWVudShlID0+IHRoaXMuY29tbWVudHNPbkNvbnRleHRNZW51KGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbW1lbnRzT25Db250ZXh0TWVudSh0cmVlRXZlbnQ6IElUcmVlQ29udGV4dE1lbnVFdmVudDxDb21tZW50c01vZGVsIHwgUmVzb3VyY2VXaXRoQ29tbWVudFRocmVhZHMgfCBDb21tZW50Tm9kZSB8IG51bGw+KTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZTogQ29tbWVudHNNb2RlbCB8IFJlc291cmNlV2l0aENvbW1lbnRUaHJlYWRzIHwgQ29tbWVudE5vZGUgfCBudWxsID0gdHJlZUV2ZW50LmVsZW1lbnQ7XG5cdFx0aWYgKCEobm9kZSBpbnN0YW5jZW9mIENvbW1lbnROb2RlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBldmVudDogVUlFdmVudCA9IHRyZWVFdmVudC5icm93c2VyRXZlbnQ7XG5cblx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0dGhpcy5zZXRGb2N1cyhbbm9kZV0pO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLm1lbnVzLmdldFJlc291cmNlQ29udGV4dEFjdGlvbnMobm9kZSk7XG5cdFx0aWYgKCFhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0cmVlRXZlbnQuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdGdldEFjdGlvblZpZXdJdGVtOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgYWN0aW9uLCB7IGxhYmVsOiB0cnVlLCBrZXliaW5kaW5nOiBrZXliaW5kaW5nLmdldExhYmVsKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICh3YXNDYW5jZWxsZWQ/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmICh3YXNDYW5jZWxsZWQpIHtcblx0XHRcdFx0XHR0aGlzLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCk6IE1hcnNoYWxsZWRDb21tZW50VGhyZWFkSW50ZXJuYWwgPT4gKHtcblx0XHRcdFx0Y29tbWVudENvbnRyb2xIYW5kbGU6IG5vZGUuY29udHJvbGxlckhhbmRsZSxcblx0XHRcdFx0Y29tbWVudFRocmVhZEhhbmRsZTogbm9kZS50aHJlYWRIYW5kbGUsXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkLFxuXHRcdFx0XHR0aHJlYWQ6IG5vZGUudGhyZWFkXG5cdFx0XHR9KVxuXHRcdH0pO1xuXHR9XG5cblx0ZmlsdGVyQ29tbWVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWZpbHRlcigpO1xuXHR9XG5cblx0Z2V0VmlzaWJsZUl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdGxldCBmaWx0ZXJlZCA9IDA7XG5cdFx0Y29uc3Qgcm9vdCA9IHRoaXMuZ2V0Tm9kZSgpO1xuXG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZU5vZGUgb2Ygcm9vdC5jaGlsZHJlbikge1xuXHRcdFx0Zm9yIChjb25zdCBjb21tZW50Tm9kZSBvZiByZXNvdXJjZU5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGNvbW1lbnROb2RlLnZpc2libGUgJiYgcmVzb3VyY2VOb2RlLnZpc2libGUpIHtcblx0XHRcdFx0XHRmaWx0ZXJlZCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbHRlcmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBc0IsdUJBQXVCO0FBRTdDLFNBQVMsYUFBYSxrQ0FBa0M7QUFDeEQsU0FBMEUsc0JBQXNCO0FBRWhHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBOEMsMkJBQTJCO0FBQ2xGLFNBQXNCLHFCQUFxQjtBQUMzQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtB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
