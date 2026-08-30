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
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import * as languages from "../../../../editor/common/languages.js";
import { ActionsOrientation, ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action, Separator, ActionRunner } from "../../../../base/common/actions.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { TimeoutTimer } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommentService } from "./commentService.js";
import { MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from "./simpleCommentEditor.js";
import { Emitter } from "../../../../base/common/event.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { ToggleReactionsAction, ReactionAction, ReactionActionViewItem } from "./reactionsAction.js";
import { MenuItemAction, SubmenuItemAction, MenuId } from "../../../../platform/actions/common/actions.js";
import { MenuEntryActionViewItem, SubmenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CommentFormActions } from "./commentFormActions.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { TimestampWidget } from "./timestamp.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Scrollable, ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { SmoothScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { COMMENTS_SECTION } from "../common/commentsConfiguration.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { Position } from "../../../../editor/common/core/position.js";
class CommentsActionRunner extends ActionRunner {
  async runAction(action, context) {
    await action.run(...context);
  }
}
let CommentNode = class extends Disposable {
  constructor(parentEditor, commentThread, comment, pendingEdit, owner, resource, parentThread, markdownRendererOptions, instantiationService, commentService, notificationService, contextMenuService, contextKeyService, configurationService, hoverService, keybindingService, textModelService, markdownRendererService) {
    super();
    this.parentEditor = parentEditor;
    this.commentThread = commentThread;
    this.comment = comment;
    this.pendingEdit = pendingEdit;
    this.owner = owner;
    this.resource = resource;
    this.parentThread = parentThread;
    this.markdownRendererOptions = markdownRendererOptions;
    this.instantiationService = instantiationService;
    this.commentService = commentService;
    this.notificationService = notificationService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.keybindingService = keybindingService;
    this.textModelService = textModelService;
    this.markdownRendererService = markdownRendererService;
    this._md = this._register(new MutableDisposable());
    this._focusClearTimer = this._register(new TimeoutTimer());
    this._editAction = null;
    this._commentEditContainer = null;
    this._reactionsActionBar = this._register(new MutableDisposable());
    this._reactionActions = this._register(new DisposableStore());
    this._commentEditor = null;
    this._commentEditorModel = null;
    this._editorHeight = MIN_EDITOR_HEIGHT;
    this._actionRunner = this._register(new CommentsActionRunner());
    this.toolbar = this._register(new MutableDisposable());
    this._commentFormActions = null;
    this._commentEditorActions = null;
    this._onDidClick = this._register(new Emitter());
    this.isEditing = false;
    this._editModeDisposables = this._register(new DisposableStore());
    this._domNode = dom.$("div.review-comment");
    this._contextKeyService = this._register(contextKeyService.createScoped(this._domNode));
    this._commentContextValue = CommentContextKeys.commentContext.bindTo(this._contextKeyService);
    if (this.comment.contextValue) {
      this._commentContextValue.set(this.comment.contextValue);
    }
    this._commentMenus = this.commentService.getCommentMenus(this.owner);
    this._domNode.tabIndex = -1;
    this._avatar = dom.append(this._domNode, dom.$("div.avatar-container"));
    this.updateCommentUserIcon(this.comment.userIconPath);
    this._commentDetailsContainer = dom.append(this._domNode, dom.$(".review-comment-contents"));
    this.createHeader(this._commentDetailsContainer);
    this._body = document.createElement(`div`);
    this._body.classList.add("comment-body", MOUSE_CURSOR_TEXT_CSS_CLASS_NAME);
    if (configurationService.getValue(COMMENTS_SECTION)?.maxHeight !== false) {
      this._body.classList.add("comment-body-max-height");
    }
    this.createScroll(this._commentDetailsContainer, this._body);
    this.updateCommentBody(this.comment.body);
    this.createReactionsContainer(this._commentDetailsContainer);
    this._domNode.setAttribute("aria-label", `${comment.userName}, ${this.commentBodyValue}`);
    this._domNode.setAttribute("role", "treeitem");
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.CLICK, () => this.isEditing || this._onDidClick.fire(this)));
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.CONTEXT_MENU, (e) => {
      return this.onContextMenu(e);
    }));
    if (pendingEdit) {
      this.switchToEditMode();
    }
    this.activeCommentListeners();
  }
  get domNode() {
    return this._domNode;
  }
  activeCommentListeners() {
    this._register(dom.addDisposableListener(this._domNode, dom.EventType.FOCUS_IN, () => {
      this.commentService.setActiveCommentAndThread(this.owner, { thread: this.commentThread, comment: this.comment });
    }, true));
  }
  createScroll(container, body) {
    this._scrollable = this._register(new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 125,
      scheduleAtNextAnimationFrame: (cb) => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), cb)
    }));
    this._scrollableElement = this._register(new SmoothScrollableElement(body, {
      horizontal: ScrollbarVisibility.Visible,
      vertical: ScrollbarVisibility.Visible
    }, this._scrollable));
    this._register(this._scrollableElement.onScroll((e) => {
      if (e.scrollLeftChanged) {
        body.scrollLeft = e.scrollLeft;
      }
      if (e.scrollTopChanged) {
        body.scrollTop = e.scrollTop;
      }
    }));
    const onDidScrollViewContainer = this._register(new DomEmitter(body, "scroll")).event;
    this._register(onDidScrollViewContainer((_) => {
      const position = this._scrollableElement.getScrollPosition();
      const scrollLeft = Math.abs(body.scrollLeft - position.scrollLeft) <= 1 ? void 0 : body.scrollLeft;
      const scrollTop = Math.abs(body.scrollTop - position.scrollTop) <= 1 ? void 0 : body.scrollTop;
      if (scrollLeft !== void 0 || scrollTop !== void 0) {
        this._scrollableElement.setScrollPosition({ scrollLeft, scrollTop });
      }
    }));
    container.appendChild(this._scrollableElement.getDomNode());
  }
  updateCommentBody(body) {
    this._body.innerText = "";
    this._md.clear();
    this._plainText = void 0;
    if (typeof body === "string") {
      this._plainText = dom.append(this._body, dom.$(".comment-body-plainstring"));
      this._plainText.innerText = body;
    } else {
      this._md.value = this.markdownRendererService.render(body, this.markdownRendererOptions);
      this._body.appendChild(this._md.value.element);
    }
  }
  updateCommentUserIcon(userIconPath) {
    this._avatar.textContent = "";
    if (userIconPath) {
      const img = dom.append(this._avatar, dom.$("img.avatar"));
      img.src = FileAccess.uriToBrowserUri(URI.revive(userIconPath)).toString(true);
      img.onerror = (_) => img.remove();
    }
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  createTimestamp(container) {
    this._timestamp = dom.append(container, dom.$("span.timestamp-container"));
    this.updateTimestamp(this.comment.timestamp);
  }
  updateTimestamp(raw) {
    if (!this._timestamp) {
      return;
    }
    const timestamp = raw !== void 0 ? new Date(raw) : void 0;
    if (!timestamp) {
      this._timestampWidget?.dispose();
    } else {
      if (!this._timestampWidget) {
        this._timestampWidget = new TimestampWidget(this.configurationService, this.hoverService, this._timestamp, timestamp);
        this._register(this._timestampWidget);
      } else {
        this._timestampWidget.setTimestamp(timestamp);
      }
    }
  }
  createHeader(commentDetailsContainer) {
    const header = dom.append(commentDetailsContainer, dom.$(`div.comment-title.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    const infoContainer = dom.append(header, dom.$("comment-header-info"));
    const author = dom.append(infoContainer, dom.$("strong.author"));
    author.innerText = this.comment.userName;
    this.createTimestamp(infoContainer);
    this._isPendingLabel = dom.append(infoContainer, dom.$("span.isPending"));
    if (this.comment.label) {
      this._isPendingLabel.innerText = this.comment.label;
    } else {
      this._isPendingLabel.innerText = "";
    }
    this._actionsToolbarContainer = dom.append(header, dom.$(".comment-actions"));
    this.createActionsToolbar();
  }
  getToolbarActions(menu) {
    const contributedActions = menu.getActions({ shouldForwardArgs: true });
    const primary = [];
    const secondary = [];
    const result = { primary, secondary };
    fillInActions(contributedActions, result, false, (g) => /^inline/.test(g));
    return result;
  }
  get commentNodeContext() {
    return [
      {
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        $mid: MarshalledId.CommentNode
      },
      {
        commentControlHandle: this.commentThread.controllerHandle,
        commentThreadHandle: this.commentThread.commentThreadHandle,
        $mid: MarshalledId.CommentThread
      }
    ];
  }
  createToolbar() {
    this.toolbar.value = new ToolBar(this._actionsToolbarContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === ToggleReactionsAction.ID) {
          return new DropdownMenuActionViewItem(
            action,
            action.menuActions,
            this.contextMenuService,
            {
              ...options,
              actionViewItemProvider: (action2, options2) => this.actionViewItemProvider(action2, options2),
              classNames: ["toolbar-toggle-pickReactions", ...ThemeIcon.asClassNameArray(Codicon.reactions)],
              anchorAlignmentProvider: () => AnchorAlignment.RIGHT
            }
          );
        }
        return this.actionViewItemProvider(action, options);
      },
      orientation: ActionsOrientation.HORIZONTAL
    });
    this.toolbar.value.context = this.commentNodeContext;
    this.toolbar.value.actionRunner = this._actionRunner;
  }
  createActionsToolbar() {
    const actions = [];
    const menu = this._commentMenus.getCommentTitleActions(this.comment, this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange((e) => {
      const { primary: primary2, secondary: secondary2 } = this.getToolbarActions(menu);
      if (!this.toolbar && (primary2.length || secondary2.length)) {
        this.createToolbar();
      }
      this.toolbar.value.setActions(primary2, secondary2);
    }));
    const { primary, secondary } = this.getToolbarActions(menu);
    actions.push(...primary);
    if (actions.length || secondary.length) {
      this.createToolbar();
      this.toolbar.value.setActions(actions, secondary);
    }
  }
  actionViewItemProvider(action, options) {
    if (action.id === ToggleReactionsAction.ID) {
      options = { label: false, icon: true };
    } else {
      options = { label: false, icon: true };
    }
    if (action.id === ReactionAction.ID) {
      const item = new ReactionActionViewItem(action);
      return item;
    } else if (action instanceof MenuItemAction) {
      return this.instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate });
    } else if (action instanceof SubmenuItemAction) {
      return this.instantiationService.createInstance(SubmenuEntryActionViewItem, action, options);
    } else {
      const item = new ActionViewItem({}, action, options);
      return item;
    }
  }
  async submitComment() {
    if (this._commentEditor && this._commentFormActions) {
      await this._commentFormActions.triggerDefaultAction();
      this.pendingEdit = void 0;
    }
  }
  createReactionPicker(reactionGroup) {
    const toggleReactionAction = this._reactionActions.add(new ToggleReactionsAction(() => {
      toggleReactionActionViewItem?.show();
    }, nls.localize("commentToggleReaction", "Toggle Reaction")));
    let reactionMenuActions = [];
    if (reactionGroup && reactionGroup.length) {
      reactionMenuActions = reactionGroup.map((reaction) => {
        return this._reactionActions.add(new Action(`reaction.command.${reaction.label}`, `${reaction.label}`, "", true, async () => {
          try {
            await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
          } catch (e) {
            const error = e.message ? nls.localize("commentToggleReactionError", "Toggling the comment reaction failed: {0}.", e.message) : nls.localize("commentToggleReactionDefaultError", "Toggling the comment reaction failed");
            this.notificationService.error(error);
          }
        }));
      });
    }
    toggleReactionAction.menuActions = reactionMenuActions;
    const toggleReactionActionViewItem = this._reactionActions.add(new DropdownMenuActionViewItem(
      toggleReactionAction,
      toggleReactionAction.menuActions,
      this.contextMenuService,
      {
        actionViewItemProvider: (action, options) => {
          if (action.id === ToggleReactionsAction.ID) {
            return toggleReactionActionViewItem;
          }
          return this.actionViewItemProvider(action, options);
        },
        classNames: "toolbar-toggle-pickReactions",
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    ));
    return toggleReactionAction;
  }
  createReactionsContainer(commentDetailsContainer) {
    this._reactionActionsContainer?.remove();
    this._reactionsActionBar.clear();
    this._reactionActions.clear();
    const hasReactionHandler = this.commentService.hasReactionHandler(this.owner);
    const reactions = this.comment.commentReactions?.filter((reaction) => !!reaction.count) || [];
    if (reactions.length === 0 && !hasReactionHandler) {
      return;
    }
    this._reactionActionsContainer = dom.append(commentDetailsContainer, dom.$("div.comment-reactions"));
    this._reactionsActionBar.value = new ActionBar(this._reactionActionsContainer, {
      actionViewItemProvider: (action, options) => {
        if (action.id === ToggleReactionsAction.ID) {
          return new DropdownMenuActionViewItem(
            action,
            action.menuActions,
            this.contextMenuService,
            {
              actionViewItemProvider: (action2, options2) => this.actionViewItemProvider(action2, options2),
              classNames: ["toolbar-toggle-pickReactions", ...ThemeIcon.asClassNameArray(Codicon.reactions)],
              anchorAlignmentProvider: () => AnchorAlignment.RIGHT
            }
          );
        }
        return this.actionViewItemProvider(action, options);
      }
    });
    reactions.map((reaction) => {
      const action = this._reactionActions.add(new ReactionAction(`reaction.${reaction.label}`, `${reaction.label}`, reaction.hasReacted && (reaction.canEdit || hasReactionHandler) ? "active" : "", reaction.canEdit || hasReactionHandler, async () => {
        try {
          await this.commentService.toggleReaction(this.owner, this.resource, this.commentThread, this.comment, reaction);
        } catch (e) {
          let error;
          if (reaction.hasReacted) {
            error = e.message ? nls.localize("commentDeleteReactionError", "Deleting the comment reaction failed: {0}.", e.message) : nls.localize("commentDeleteReactionDefaultError", "Deleting the comment reaction failed");
          } else {
            error = e.message ? nls.localize("commentAddReactionError", "Deleting the comment reaction failed: {0}.", e.message) : nls.localize("commentAddReactionDefaultError", "Deleting the comment reaction failed");
          }
          this.notificationService.error(error);
        }
      }, reaction.reactors, reaction.iconPath, reaction.count));
      this._reactionsActionBar.value?.push(action, { label: true, icon: true });
    });
    if (hasReactionHandler) {
      const toggleReactionAction = this.createReactionPicker(this.comment.commentReactions || []);
      this._reactionsActionBar.value?.push(toggleReactionAction, { label: false, icon: true });
    }
  }
  get commentBodyValue() {
    return typeof this.comment.body === "string" ? this.comment.body : this.comment.body.value;
  }
  async createCommentEditor(editContainer) {
    this._editModeDisposables.clear();
    const container = dom.append(editContainer, dom.$(".edit-textarea"));
    this._commentEditor = this.instantiationService.createInstance(SimpleCommentEditor, container, SimpleCommentEditor.getEditorOptions(this.configurationService), this._contextKeyService, this.parentThread);
    this._editModeDisposables.add(this._commentEditor);
    const resource = URI.from({
      scheme: Schemas.commentsInput,
      path: `/commentinput-${this.comment.uniqueIdInThread}-${Date.now()}.md`
    });
    const modelRef = await this.textModelService.createModelReference(resource);
    this._commentEditorModel = modelRef;
    this._editModeDisposables.add(this._commentEditorModel);
    this._commentEditor.setModel(this._commentEditorModel.object.textEditorModel);
    this._commentEditor.setValue(this.pendingEdit?.body ?? this.commentBodyValue);
    if (this.pendingEdit) {
      this._commentEditor.setPosition(this.pendingEdit.cursor);
    } else {
      const lastLine = this._commentEditorModel.object.textEditorModel.getLineCount();
      const lastColumn = this._commentEditorModel.object.textEditorModel.getLineLength(lastLine) + 1;
      this._commentEditor.setPosition(new Position(lastLine, lastColumn));
    }
    this.pendingEdit = void 0;
    this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
    this._commentEditor.focus();
    dom.scheduleAtNextAnimationFrame(dom.getWindow(editContainer), () => {
      this._commentEditor.layout({ width: container.clientWidth - 14, height: this._editorHeight });
      this._commentEditor.focus();
    });
    const commentThread = this.commentThread;
    commentThread.input = {
      uri: this._commentEditor.getModel().uri,
      value: this.commentBodyValue
    };
    this.commentService.setActiveEditingCommentThread(commentThread);
    this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
    this._editModeDisposables.add(this._commentEditor.onDidFocusEditorWidget(() => {
      commentThread.input = {
        uri: this._commentEditor.getModel().uri,
        value: this.commentBodyValue
      };
      this.commentService.setActiveEditingCommentThread(commentThread);
      this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
    }));
    this._editModeDisposables.add(this._commentEditor.onDidChangeModelContent((e) => {
      if (commentThread.input && this._commentEditor && this._commentEditor.getModel().uri === commentThread.input.uri) {
        const newVal = this._commentEditor.getValue();
        if (newVal !== commentThread.input.value) {
          const input = commentThread.input;
          input.value = newVal;
          commentThread.input = input;
          this.commentService.setActiveEditingCommentThread(commentThread);
          this.commentService.setActiveCommentAndThread(this.owner, { thread: commentThread, comment: this.comment });
        }
      }
    }));
    this.calculateEditorHeight();
    this._editModeDisposables.add(this._commentEditorModel.object.textEditorModel.onDidChangeContent(() => {
      if (this._commentEditor && this.calculateEditorHeight()) {
        this._commentEditor.layout({ height: this._editorHeight, width: this._commentEditor.getLayoutInfo().width });
        this._commentEditor.render(true);
      }
    }));
  }
  calculateEditorHeight() {
    if (this._commentEditor) {
      const newEditorHeight = calculateEditorHeight(this.parentEditor, this._commentEditor, this._editorHeight);
      if (newEditorHeight !== this._editorHeight) {
        this._editorHeight = newEditorHeight;
        return true;
      }
    }
    return false;
  }
  getPendingEdit() {
    const model = this._commentEditor?.getModel();
    if (this._commentEditor && model && model.getValueLength() > 0) {
      return { body: model.getValue(), cursor: this._commentEditor.getPosition() };
    }
    return void 0;
  }
  removeCommentEditor() {
    this.isEditing = false;
    if (this._editAction) {
      this._editAction.enabled = true;
    }
    this._body.classList.remove("hidden");
    this._editModeDisposables.clear();
    this._commentEditor = null;
    this._commentEditContainer.remove();
  }
  layout(widthInPixel) {
    const editorWidth = widthInPixel !== void 0 ? widthInPixel - 72 : this._commentEditor?.getLayoutInfo().width ?? 0;
    this._commentEditor?.layout({ width: editorWidth, height: this._editorHeight });
    const scrollWidth = this._body.scrollWidth;
    const width = dom.getContentWidth(this._body);
    const scrollHeight = this._body.scrollHeight;
    const height = dom.getContentHeight(this._body) + 4;
    this._scrollableElement.setScrollDimensions({ width, scrollWidth, height, scrollHeight });
  }
  async switchToEditMode() {
    if (this.isEditing) {
      return;
    }
    this.isEditing = true;
    this._body.classList.add("hidden");
    this._commentEditContainer = dom.append(this._commentDetailsContainer, dom.$(".edit-container"));
    await this.createCommentEditor(this._commentEditContainer);
    const formActions = dom.append(this._commentEditContainer, dom.$(".form-actions"));
    const otherActions = dom.append(formActions, dom.$(".other-actions"));
    this.createCommentWidgetFormActions(otherActions);
    const editorActions = dom.append(formActions, dom.$(".editor-actions"));
    this.createCommentWidgetEditorActions(editorActions);
  }
  createCommentWidgetFormActions(container) {
    const menus = this.commentService.getCommentMenus(this.owner);
    const menu = menus.getCommentActions(this.comment, this._contextKeyService);
    this._editModeDisposables.add(menu);
    this._editModeDisposables.add(menu.onDidChange(() => {
      this._commentFormActions?.setActions(menu);
    }));
    this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
      const text = this._commentEditor.getValue();
      action.run({
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        text,
        $mid: MarshalledId.CommentThreadNode
      });
      this.removeCommentEditor();
    });
    this._editModeDisposables.add(this._commentFormActions);
    this._commentFormActions.setActions(menu);
  }
  createCommentWidgetEditorActions(container) {
    const menus = this.commentService.getCommentMenus(this.owner);
    const menu = menus.getCommentEditorActions(this._contextKeyService);
    this._editModeDisposables.add(menu);
    this._editModeDisposables.add(menu.onDidChange(() => {
      this._commentEditorActions?.setActions(menu, true);
    }));
    this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, (action) => {
      const text = this._commentEditor.getValue();
      action.run({
        thread: this.commentThread,
        commentUniqueId: this.comment.uniqueIdInThread,
        text,
        $mid: MarshalledId.CommentThreadNode
      });
      this._commentEditor?.focus();
    });
    this._editModeDisposables.add(this._commentEditorActions);
    this._commentEditorActions.setActions(menu, true);
  }
  setFocus(focused, visible = false) {
    if (focused) {
      this._domNode.focus();
      this._actionsToolbarContainer.classList.add("tabfocused");
      this._domNode.tabIndex = 0;
      if (this.comment.mode === languages.CommentMode.Editing) {
        this._commentEditor?.focus();
      }
    } else {
      if (this._actionsToolbarContainer.classList.contains("tabfocused") && !this._actionsToolbarContainer.classList.contains("mouseover")) {
        this._domNode.tabIndex = -1;
      }
      this._actionsToolbarContainer.classList.remove("tabfocused");
    }
  }
  async update(newComment) {
    if (newComment.body !== this.comment.body) {
      this.updateCommentBody(newComment.body);
    }
    if (this.comment.userIconPath && newComment.userIconPath && URI.from(this.comment.userIconPath).toString() !== URI.from(newComment.userIconPath).toString()) {
      this.updateCommentUserIcon(newComment.userIconPath);
    }
    const isChangingMode = newComment.mode !== void 0 && newComment.mode !== this.comment.mode;
    this.comment = newComment;
    if (isChangingMode) {
      if (newComment.mode === languages.CommentMode.Editing) {
        await this.switchToEditMode();
      } else {
        this.removeCommentEditor();
      }
    }
    if (newComment.label) {
      this._isPendingLabel.innerText = newComment.label;
    } else {
      this._isPendingLabel.innerText = "";
    }
    this.createReactionsContainer(this._commentDetailsContainer);
    if (this.comment.contextValue) {
      this._commentContextValue.set(this.comment.contextValue);
    } else {
      this._commentContextValue.reset();
    }
    if (this.comment.timestamp) {
      this.updateTimestamp(this.comment.timestamp);
    }
  }
  onContextMenu(e) {
    const event = new StandardMouseEvent(dom.getWindow(this._domNode), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId: MenuId.CommentThreadCommentContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: this._contextKeyService,
      actionRunner: this._actionRunner,
      getActionsContext: () => {
        return this.commentNodeContext;
      }
    });
  }
  focus() {
    this.domNode.focus();
    this.domNode.classList.add("focus");
    this._focusClearTimer.setIfNotSet(() => this.domNode.classList.remove("focus"), 3e3);
  }
};
CommentNode = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ICommentService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IContextMenuService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IKeybindingService),
  __decorateParam(16, ITextModelService),
  __decorateParam(17, IMarkdownRendererService)
], CommentNode);
function fillInActions(groups, target, useAlternativeActions, isPrimaryGroup = (group) => group === "navigation") {
  for (const tuple of groups) {
    let [group, actions] = tuple;
    if (useAlternativeActions) {
      actions = actions.map((a) => a instanceof MenuItemAction && !!a.alt ? a.alt : a);
    }
    if (isPrimaryGroup(group)) {
      const to = Array.isArray(target) ? target : target.primary;
      to.unshift(...actions);
    } else {
      const to = Array.isArray(target) ? target : target.secondary;
      if (to.length > 0) {
        to.push(new Separator());
      }
      to.push(...actions);
    }
  }
}
export {
  CommentNode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50Tm9kZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEFjdGlvbnNPcmllbnRhdGlvbiwgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IsIEFjdGlvblJ1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJFeHRyYU9wdGlvbnMsIElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJUmVuZGVyZWRNYXJrZG93biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9jb21tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYXlvdXRhYmxlRWRpdG9yLCBNSU5fRURJVE9SX0hFSUdIVCwgU2ltcGxlQ29tbWVudEVkaXRvciwgY2FsY3VsYXRlRWRpdG9ySGVpZ2h0IH0gZnJvbSAnLi9zaW1wbGVDb21tZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgVG9nZ2xlUmVhY3Rpb25zQWN0aW9uLCBSZWFjdGlvbkFjdGlvbiwgUmVhY3Rpb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vcmVhY3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tZW50VGhyZWFkV2lkZ2V0IH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRUaHJlYWRXaWRnZXQuanMnO1xuaW1wb3J0IHsgTWVudUl0ZW1BY3Rpb24sIFN1Ym1lbnVJdGVtQWN0aW9uLCBJTWVudSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgU3VibWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBJQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29tbWVudEZvcm1BY3Rpb25zIH0gZnJvbSAnLi9jb21tZW50Rm9ybUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbW91c2VDdXJzb3IvbW91c2VDdXJzb3IuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgVGltZXN0YW1wV2lkZ2V0IH0gZnJvbSAnLi90aW1lc3RhbXAuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IENvbW1lbnRNZW51cyB9IGZyb20gJy4vY29tbWVudE1lbnVzLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGUsIFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFNtb290aFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCB7IENvbW1lbnRDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQ09NTUVOVFNfU0VDVElPTiwgSUNvbW1lbnRzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb21tZW50c0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkQ29tbWVudFRocmVhZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21tZW50cy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuXG5jbGFzcyBDb21tZW50c0FjdGlvblJ1bm5lciBleHRlbmRzIEFjdGlvblJ1bm5lciB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0OiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBhY3Rpb24ucnVuKC4uLmNvbnRleHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21tZW50Tm9kZTxUIGV4dGVuZHMgSVJhbmdlIHwgSUNlbGxSYW5nZT4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2JvZHk6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9hdmF0YXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZDogTXV0YWJsZURpc3Bvc2FibGU8SVJlbmRlcmVkTWFya2Rvd24+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9wbGFpblRleHQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c0NsZWFyVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGltZW91dFRpbWVyKCkpO1xuXG5cdHByaXZhdGUgX2VkaXRBY3Rpb246IEFjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb21tZW50RWRpdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY29tbWVudERldGFpbHNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9hY3Rpb25zVG9vbGJhckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWFjdGlvbnNBY3Rpb25CYXI6IE11dGFibGVEaXNwb3NhYmxlPEFjdGlvbkJhcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWN0aW9uQWN0aW9uczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfcmVhY3Rpb25BY3Rpb25zQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2NvbW1lbnRFZGl0b3I6IFNpbXBsZUNvbW1lbnRFZGl0b3IgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY29tbWVudEVkaXRvck1vZGVsOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfZWRpdG9ySGVpZ2h0ID0gTUlOX0VESVRPUl9IRUlHSFQ7XG5cblx0cHJpdmF0ZSBfaXNQZW5kaW5nTGFiZWwhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdGltZXN0YW1wOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGltZXN0YW1wV2lkZ2V0OiBUaW1lc3RhbXBXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgX2NvbW1lbnRDb250ZXh0VmFsdWU6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgX2NvbW1lbnRNZW51czogQ29tbWVudE1lbnVzO1xuXG5cdHByaXZhdGUgX3Njcm9sbGFibGUhOiBTY3JvbGxhYmxlO1xuXHRwcml2YXRlIF9zY3JvbGxhYmxlRWxlbWVudCE6IFNtb290aFNjcm9sbGFibGVFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblJ1bm5lcjogQ29tbWVudHNBY3Rpb25SdW5uZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tbWVudHNBY3Rpb25SdW5uZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbGJhcjogTXV0YWJsZURpc3Bvc2FibGU8VG9vbEJhcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX2NvbW1lbnRGb3JtQWN0aW9uczogQ29tbWVudEZvcm1BY3Rpb25zIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbW1lbnRFZGl0b3JBY3Rpb25zOiBDb21tZW50Rm9ybUFjdGlvbnMgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29tbWVudE5vZGU8VD4+KCkpO1xuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgaXNFZGl0aW5nOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYXJlbnRFZGl0b3I6IExheW91dGFibGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSBjb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxUPixcblx0XHRwdWJsaWMgY29tbWVudDogbGFuZ3VhZ2VzLkNvbW1lbnQsXG5cdFx0cHJpdmF0ZSBwZW5kaW5nRWRpdDogbGFuZ3VhZ2VzLlBlbmRpbmdDb21tZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgb3duZXI6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSBwYXJlbnRUaHJlYWQ6IElDb21tZW50VGhyZWFkV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlck9wdGlvbnM6IElNYXJrZG93blJlbmRlcmVyRXh0cmFPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWVudFNlcnZpY2UgcHJpdmF0ZSBjb21tZW50U2VydmljZTogSUNvbW1lbnRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb20uJCgnZGl2LnJldmlldy1jb21tZW50Jyk7XG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fZG9tTm9kZSkpO1xuXHRcdHRoaXMuX2NvbW1lbnRDb250ZXh0VmFsdWUgPSBDb21tZW50Q29udGV4dEtleXMuY29tbWVudENvbnRleHQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5jb21tZW50LmNvbnRleHRWYWx1ZSkge1xuXHRcdFx0dGhpcy5fY29tbWVudENvbnRleHRWYWx1ZS5zZXQodGhpcy5jb21tZW50LmNvbnRleHRWYWx1ZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1lbnRNZW51cyA9IHRoaXMuY29tbWVudFNlcnZpY2UuZ2V0Q29tbWVudE1lbnVzKHRoaXMub3duZXIpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX2F2YXRhciA9IGRvbS5hcHBlbmQodGhpcy5fZG9tTm9kZSwgZG9tLiQoJ2Rpdi5hdmF0YXItY29udGFpbmVyJykpO1xuXHRcdHRoaXMudXBkYXRlQ29tbWVudFVzZXJJY29uKHRoaXMuY29tbWVudC51c2VySWNvblBhdGgpO1xuXG5cdFx0dGhpcy5fY29tbWVudERldGFpbHNDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsIGRvbS4kKCcucmV2aWV3LWNvbW1lbnQtY29udGVudHMnKSk7XG5cblx0XHR0aGlzLmNyZWF0ZUhlYWRlcih0aGlzLl9jb21tZW50RGV0YWlsc0NvbnRhaW5lcik7XG5cdFx0dGhpcy5fYm9keSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoYGRpdmApO1xuXHRcdHRoaXMuX2JvZHkuY2xhc3NMaXN0LmFkZCgnY29tbWVudC1ib2R5JywgTU9VU0VfQ1VSU09SX1RFWFRfQ1NTX0NMQVNTX05BTUUpO1xuXHRcdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJQ29tbWVudHNDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkPihDT01NRU5UU19TRUNUSU9OKT8ubWF4SGVpZ2h0ICE9PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5fYm9keS5jbGFzc0xpc3QuYWRkKCdjb21tZW50LWJvZHktbWF4LWhlaWdodCcpO1xuXHRcdH1cblxuXHRcdHRoaXMuY3JlYXRlU2Nyb2xsKHRoaXMuX2NvbW1lbnREZXRhaWxzQ29udGFpbmVyLCB0aGlzLl9ib2R5KTtcblx0XHR0aGlzLnVwZGF0ZUNvbW1lbnRCb2R5KHRoaXMuY29tbWVudC5ib2R5KTtcblxuXHRcdHRoaXMuY3JlYXRlUmVhY3Rpb25zQ29udGFpbmVyKHRoaXMuX2NvbW1lbnREZXRhaWxzQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYCR7Y29tbWVudC51c2VyTmFtZX0sICR7dGhpcy5jb21tZW50Qm9keVZhbHVlfWApO1xuXHRcdHRoaXMuX2RvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RyZWVpdGVtJyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuaXNFZGl0aW5nIHx8IHRoaXMuX29uRGlkQ2xpY2suZmlyZSh0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMub25Db250ZXh0TWVudShlKTtcblx0XHR9KSk7XG5cblx0XHRpZiAocGVuZGluZ0VkaXQpIHtcblx0XHRcdHRoaXMuc3dpdGNoVG9FZGl0TW9kZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuYWN0aXZlQ29tbWVudExpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhY3RpdmVDb21tZW50TGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5GT0NVU19JTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHRoaXMub3duZXIsIHsgdGhyZWFkOiB0aGlzLmNvbW1lbnRUaHJlYWQsIGNvbW1lbnQ6IHRoaXMuY29tbWVudCB9KTtcblx0XHR9LCB0cnVlKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNjcm9sbChjb250YWluZXI6IEhUTUxFbGVtZW50LCBib2R5OiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX3Njcm9sbGFibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Nyb2xsYWJsZSh7XG5cdFx0XHRmb3JjZUludGVnZXJWYWx1ZXM6IHRydWUsXG5cdFx0XHRzbW9vdGhTY3JvbGxEdXJhdGlvbjogMTI1LFxuXHRcdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZTogY2IgPT4gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhjb250YWluZXIpLCBjYilcblx0XHR9KSk7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgU21vb3RoU2Nyb2xsYWJsZUVsZW1lbnQoYm9keSwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZVxuXHRcdH0sIHRoaXMuX3Njcm9sbGFibGUpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njcm9sbGFibGVFbGVtZW50Lm9uU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQpIHtcblx0XHRcdFx0Ym9keS5zY3JvbGxMZWZ0ID0gZS5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHRib2R5LnNjcm9sbFRvcCA9IGUuc2Nyb2xsVG9wO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG9uRGlkU2Nyb2xsVmlld0NvbnRhaW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKGJvZHksICdzY3JvbGwnKSkuZXZlbnQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRTY3JvbGxWaWV3Q29udGFpbmVyKF8gPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IE1hdGguYWJzKGJvZHkuc2Nyb2xsTGVmdCAtIHBvc2l0aW9uLnNjcm9sbExlZnQpIDw9IDEgPyB1bmRlZmluZWQgOiBib2R5LnNjcm9sbExlZnQ7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSBNYXRoLmFicyhib2R5LnNjcm9sbFRvcCAtIHBvc2l0aW9uLnNjcm9sbFRvcCkgPD0gMSA/IHVuZGVmaW5lZCA6IGJvZHkuc2Nyb2xsVG9wO1xuXG5cdFx0XHRpZiAoc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkIHx8IHNjcm9sbFRvcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3Njcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsTGVmdCwgc2Nyb2xsVG9wIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21tZW50Qm9keShib2R5OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpIHtcblx0XHR0aGlzLl9ib2R5LmlubmVyVGV4dCA9ICcnO1xuXHRcdHRoaXMuX21kLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGxhaW5UZXh0ID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX3BsYWluVGV4dCA9IGRvbS5hcHBlbmQodGhpcy5fYm9keSwgZG9tLiQoJy5jb21tZW50LWJvZHktcGxhaW5zdHJpbmcnKSk7XG5cdFx0XHR0aGlzLl9wbGFpblRleHQuaW5uZXJUZXh0ID0gYm9keTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWQudmFsdWUgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihib2R5LCB0aGlzLm1hcmtkb3duUmVuZGVyZXJPcHRpb25zKTtcblx0XHRcdHRoaXMuX2JvZHkuYXBwZW5kQ2hpbGQodGhpcy5fbWQudmFsdWUuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21tZW50VXNlckljb24odXNlckljb25QYXRoOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fYXZhdGFyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0aWYgKHVzZXJJY29uUGF0aCkge1xuXHRcdFx0Y29uc3QgaW1nID0gZG9tLmFwcGVuZCh0aGlzLl9hdmF0YXIsIGRvbS4kKCdpbWcuYXZhdGFyJykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRpbWcuc3JjID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoVVJJLnJldml2ZSh1c2VySWNvblBhdGgpKS50b1N0cmluZyh0cnVlKTtcblx0XHRcdGltZy5vbmVycm9yID0gXyA9PiBpbWcucmVtb3ZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZENsaWNrKCk6IEV2ZW50PENvbW1lbnROb2RlPFQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRpbWVzdGFtcChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5fdGltZXN0YW1wID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdzcGFuLnRpbWVzdGFtcC1jb250YWluZXInKSk7XG5cdFx0dGhpcy51cGRhdGVUaW1lc3RhbXAodGhpcy5jb21tZW50LnRpbWVzdGFtcCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRpbWVzdGFtcChyYXc/OiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuX3RpbWVzdGFtcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IHJhdyAhPT0gdW5kZWZpbmVkID8gbmV3IERhdGUocmF3KSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRpbWVzdGFtcCkge1xuXHRcdFx0dGhpcy5fdGltZXN0YW1wV2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICghdGhpcy5fdGltZXN0YW1wV2lkZ2V0KSB7XG5cdFx0XHRcdHRoaXMuX3RpbWVzdGFtcFdpZGdldCA9IG5ldyBUaW1lc3RhbXBXaWRnZXQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMuX3RpbWVzdGFtcCwgdGltZXN0YW1wKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGltZXN0YW1wV2lkZ2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3RpbWVzdGFtcFdpZGdldC5zZXRUaW1lc3RhbXAodGltZXN0YW1wKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUhlYWRlcihjb21tZW50RGV0YWlsc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKGNvbW1lbnREZXRhaWxzQ29udGFpbmVyLCBkb20uJChgZGl2LmNvbW1lbnQtdGl0bGUuJHtNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRX1gKSk7XG5cdFx0Y29uc3QgaW5mb0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnY29tbWVudC1oZWFkZXItaW5mbycpKTtcblx0XHRjb25zdCBhdXRob3IgPSBkb20uYXBwZW5kKGluZm9Db250YWluZXIsIGRvbS4kKCdzdHJvbmcuYXV0aG9yJykpO1xuXHRcdGF1dGhvci5pbm5lclRleHQgPSB0aGlzLmNvbW1lbnQudXNlck5hbWU7XG5cdFx0dGhpcy5jcmVhdGVUaW1lc3RhbXAoaW5mb0NvbnRhaW5lcik7XG5cdFx0dGhpcy5faXNQZW5kaW5nTGFiZWwgPSBkb20uYXBwZW5kKGluZm9Db250YWluZXIsIGRvbS4kKCdzcGFuLmlzUGVuZGluZycpKTtcblxuXHRcdGlmICh0aGlzLmNvbW1lbnQubGFiZWwpIHtcblx0XHRcdHRoaXMuX2lzUGVuZGluZ0xhYmVsLmlubmVyVGV4dCA9IHRoaXMuY29tbWVudC5sYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faXNQZW5kaW5nTGFiZWwuaW5uZXJUZXh0ID0gJyc7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5jb21tZW50LWFjdGlvbnMnKSk7XG5cdFx0dGhpcy5jcmVhdGVBY3Rpb25zVG9vbGJhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb29sYmFyQWN0aW9ucyhtZW51OiBJTWVudSk6IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9IHtcblx0XHRjb25zdCBjb250cmlidXRlZEFjdGlvbnMgPSBtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRjb25zdCBwcmltYXJ5OiBJQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBzZWNvbmRhcnk6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH07XG5cdFx0ZmlsbEluQWN0aW9ucyhjb250cmlidXRlZEFjdGlvbnMsIHJlc3VsdCwgZmFsc2UsIGcgPT4gL15pbmxpbmUvLnRlc3QoZykpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBjb21tZW50Tm9kZUNvbnRleHQoKTogW3sgdGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxUPjsgY29tbWVudFVuaXF1ZUlkOiBudW1iZXI7ICRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50Tm9kZSB9LCBNYXJzaGFsbGVkQ29tbWVudFRocmVhZF0ge1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dGhyZWFkOiB0aGlzLmNvbW1lbnRUaHJlYWQsXG5cdFx0XHRjb21tZW50VW5pcXVlSWQ6IHRoaXMuY29tbWVudC51bmlxdWVJZEluVGhyZWFkLFxuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNvbW1lbnROb2RlXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRjb21tZW50Q29udHJvbEhhbmRsZTogdGhpcy5jb21tZW50VGhyZWFkLmNvbnRyb2xsZXJIYW5kbGUsXG5cdFx0XHRjb21tZW50VGhyZWFkSGFuZGxlOiB0aGlzLmNvbW1lbnRUaHJlYWQuY29tbWVudFRocmVhZEhhbmRsZSxcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkXG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRvb2xiYXIoKSB7XG5cdFx0dGhpcy50b29sYmFyLnZhbHVlID0gbmV3IFRvb2xCYXIodGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IFRvZ2dsZVJlYWN0aW9uc0FjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0oXG5cdFx0XHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdFx0XHQoPFRvZ2dsZVJlYWN0aW9uc0FjdGlvbj5hY3Rpb24pLm1lbnVBY3Rpb25zLFxuXHRcdFx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24gYXMgQWN0aW9uLCBvcHRpb25zKSxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lczogWyd0b29sYmFyLXRvZ2dsZS1waWNrUmVhY3Rpb25zJywgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5yZWFjdGlvbnMpXSxcblx0XHRcdFx0XHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24gYXMgQWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdH0sXG5cdFx0XHRvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUxcblx0XHR9KTtcblxuXHRcdHRoaXMudG9vbGJhci52YWx1ZS5jb250ZXh0ID0gdGhpcy5jb21tZW50Tm9kZUNvbnRleHQ7XG5cdFx0dGhpcy50b29sYmFyLnZhbHVlLmFjdGlvblJ1bm5lciA9IHRoaXMuX2FjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWN0aW9uc1Rvb2xiYXIoKSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fY29tbWVudE1lbnVzLmdldENvbW1lbnRUaXRsZUFjdGlvbnModGhpcy5jb21tZW50LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVudSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobWVudS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSB0aGlzLmdldFRvb2xiYXJBY3Rpb25zKG1lbnUpO1xuXHRcdFx0aWYgKCF0aGlzLnRvb2xiYXIgJiYgKHByaW1hcnkubGVuZ3RoIHx8IHNlY29uZGFyeS5sZW5ndGgpKSB7XG5cdFx0XHRcdHRoaXMuY3JlYXRlVG9vbGJhcigpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50b29sYmFyLnZhbHVlIS5zZXRBY3Rpb25zKHByaW1hcnksIHNlY29uZGFyeSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IHRoaXMuZ2V0VG9vbGJhckFjdGlvbnMobWVudSk7XG5cdFx0YWN0aW9ucy5wdXNoKC4uLnByaW1hcnkpO1xuXG5cdFx0aWYgKGFjdGlvbnMubGVuZ3RoIHx8IHNlY29uZGFyeS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY3JlYXRlVG9vbGJhcigpO1xuXHRcdFx0dGhpcy50b29sYmFyLnZhbHVlIS5zZXRBY3Rpb25zKGFjdGlvbnMsIHNlY29uZGFyeSk7XG5cdFx0fVxuXHR9XG5cblx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb246IEFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdGlmIChhY3Rpb24uaWQgPT09IFRvZ2dsZVJlYWN0aW9uc0FjdGlvbi5JRCkge1xuXHRcdFx0b3B0aW9ucyA9IHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9wdGlvbnMgPSB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdGlmIChhY3Rpb24uaWQgPT09IFJlYWN0aW9uQWN0aW9uLklEKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gbmV3IFJlYWN0aW9uQWN0aW9uVmlld0l0ZW0oYWN0aW9uKTtcblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdH0gZWxzZSBpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Ym1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpdGVtID0gbmV3IEFjdGlvblZpZXdJdGVtKHt9LCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3VibWl0Q29tbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29tbWVudEVkaXRvciAmJiB0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucy50cmlnZ2VyRGVmYXVsdEFjdGlvbigpO1xuXHRcdFx0dGhpcy5wZW5kaW5nRWRpdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlYWN0aW9uUGlja2VyKHJlYWN0aW9uR3JvdXA6IGxhbmd1YWdlcy5Db21tZW50UmVhY3Rpb25bXSk6IFRvZ2dsZVJlYWN0aW9uc0FjdGlvbiB7XG5cdFx0Y29uc3QgdG9nZ2xlUmVhY3Rpb25BY3Rpb24gPSB0aGlzLl9yZWFjdGlvbkFjdGlvbnMuYWRkKG5ldyBUb2dnbGVSZWFjdGlvbnNBY3Rpb24oKCkgPT4ge1xuXHRcdFx0dG9nZ2xlUmVhY3Rpb25BY3Rpb25WaWV3SXRlbT8uc2hvdygpO1xuXHRcdH0sIG5scy5sb2NhbGl6ZSgnY29tbWVudFRvZ2dsZVJlYWN0aW9uJywgXCJUb2dnbGUgUmVhY3Rpb25cIikpKTtcblxuXHRcdGxldCByZWFjdGlvbk1lbnVBY3Rpb25zOiBBY3Rpb25bXSA9IFtdO1xuXHRcdGlmIChyZWFjdGlvbkdyb3VwICYmIHJlYWN0aW9uR3JvdXAubGVuZ3RoKSB7XG5cdFx0XHRyZWFjdGlvbk1lbnVBY3Rpb25zID0gcmVhY3Rpb25Hcm91cC5tYXAoKHJlYWN0aW9uKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWFjdGlvbkFjdGlvbnMuYWRkKG5ldyBBY3Rpb24oYHJlYWN0aW9uLmNvbW1hbmQuJHtyZWFjdGlvbi5sYWJlbH1gLCBgJHtyZWFjdGlvbi5sYWJlbH1gLCAnJywgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1lbnRTZXJ2aWNlLnRvZ2dsZVJlYWN0aW9uKHRoaXMub3duZXIsIHRoaXMucmVzb3VyY2UsIHRoaXMuY29tbWVudFRocmVhZCwgdGhpcy5jb21tZW50LCByZWFjdGlvbik7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSBlLm1lc3NhZ2Vcblx0XHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbW1lbnRUb2dnbGVSZWFjdGlvbkVycm9yJywgXCJUb2dnbGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWQ6IHswfS5cIiwgZS5tZXNzYWdlKVxuXHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY29tbWVudFRvZ2dsZVJlYWN0aW9uRGVmYXVsdEVycm9yJywgXCJUb2dnbGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWRcIik7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dG9nZ2xlUmVhY3Rpb25BY3Rpb24ubWVudUFjdGlvbnMgPSByZWFjdGlvbk1lbnVBY3Rpb25zO1xuXG5cdFx0Y29uc3QgdG9nZ2xlUmVhY3Rpb25BY3Rpb25WaWV3SXRlbTogRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gPSB0aGlzLl9yZWFjdGlvbkFjdGlvbnMuYWRkKG5ldyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbShcblx0XHRcdHRvZ2dsZVJlYWN0aW9uQWN0aW9uLFxuXHRcdFx0KDxUb2dnbGVSZWFjdGlvbnNBY3Rpb24+dG9nZ2xlUmVhY3Rpb25BY3Rpb24pLm1lbnVBY3Rpb25zLFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBUb2dnbGVSZWFjdGlvbnNBY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0b2dnbGVSZWFjdGlvbkFjdGlvblZpZXdJdGVtO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbiBhcyBBY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjbGFzc05hbWVzOiAndG9vbGJhci10b2dnbGUtcGlja1JlYWN0aW9ucycsXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFRcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHJldHVybiB0b2dnbGVSZWFjdGlvbkFjdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVhY3Rpb25zQ29udGFpbmVyKGNvbW1lbnREZXRhaWxzQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlYWN0aW9uQWN0aW9uc0NvbnRhaW5lcj8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5fcmVhY3Rpb25zQWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVhY3Rpb25BY3Rpb25zLmNsZWFyKCk7XG5cblx0XHRjb25zdCBoYXNSZWFjdGlvbkhhbmRsZXIgPSB0aGlzLmNvbW1lbnRTZXJ2aWNlLmhhc1JlYWN0aW9uSGFuZGxlcih0aGlzLm93bmVyKTtcblx0XHRjb25zdCByZWFjdGlvbnMgPSB0aGlzLmNvbW1lbnQuY29tbWVudFJlYWN0aW9ucz8uZmlsdGVyKHJlYWN0aW9uID0+ICEhcmVhY3Rpb24uY291bnQpIHx8IFtdO1xuXG5cdFx0Ly8gT25seSBjcmVhdGUgdGhlIGNvbnRhaW5lciBpZiB0aGVyZSBhcmUgcmVhY3Rpb25zIHRvIHNob3cgb3IgaWYgdGhlcmUncyBhIHJlYWN0aW9uIGhhbmRsZXJcblx0XHRpZiAocmVhY3Rpb25zLmxlbmd0aCA9PT0gMCAmJiAhaGFzUmVhY3Rpb25IYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVhY3Rpb25BY3Rpb25zQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb21tZW50RGV0YWlsc0NvbnRhaW5lciwgZG9tLiQoJ2Rpdi5jb21tZW50LXJlYWN0aW9ucycpKTtcblx0XHR0aGlzLl9yZWFjdGlvbnNBY3Rpb25CYXIudmFsdWUgPSBuZXcgQWN0aW9uQmFyKHRoaXMuX3JlYWN0aW9uQWN0aW9uc0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBUb2dnbGVSZWFjdGlvbnNBY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0KDxUb2dnbGVSZWFjdGlvbnNBY3Rpb24+YWN0aW9uKS5tZW51QWN0aW9ucyxcblx0XHRcdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uIGFzIEFjdGlvbiwgb3B0aW9ucyksXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZXM6IFsndG9vbGJhci10b2dnbGUtcGlja1JlYWN0aW9ucycsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ucmVhY3Rpb25zKV0sXG5cdFx0XHRcdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uIGFzIEFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZWFjdGlvbnMubWFwKHJlYWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuX3JlYWN0aW9uQWN0aW9ucy5hZGQobmV3IFJlYWN0aW9uQWN0aW9uKGByZWFjdGlvbi4ke3JlYWN0aW9uLmxhYmVsfWAsIGAke3JlYWN0aW9uLmxhYmVsfWAsIHJlYWN0aW9uLmhhc1JlYWN0ZWQgJiYgKHJlYWN0aW9uLmNhbkVkaXQgfHwgaGFzUmVhY3Rpb25IYW5kbGVyKSA/ICdhY3RpdmUnIDogJycsIChyZWFjdGlvbi5jYW5FZGl0IHx8IGhhc1JlYWN0aW9uSGFuZGxlciksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1lbnRTZXJ2aWNlLnRvZ2dsZVJlYWN0aW9uKHRoaXMub3duZXIsIHRoaXMucmVzb3VyY2UsIHRoaXMuY29tbWVudFRocmVhZCwgdGhpcy5jb21tZW50LCByZWFjdGlvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRsZXQgZXJyb3I6IHN0cmluZztcblxuXHRcdFx0XHRcdGlmIChyZWFjdGlvbi5oYXNSZWFjdGVkKSB7XG5cdFx0XHRcdFx0XHRlcnJvciA9IGUubWVzc2FnZVxuXHRcdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY29tbWVudERlbGV0ZVJlYWN0aW9uRXJyb3InLCBcIkRlbGV0aW5nIHRoZSBjb21tZW50IHJlYWN0aW9uIGZhaWxlZDogezB9LlwiLCBlLm1lc3NhZ2UpXG5cdFx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdjb21tZW50RGVsZXRlUmVhY3Rpb25EZWZhdWx0RXJyb3InLCBcIkRlbGV0aW5nIHRoZSBjb21tZW50IHJlYWN0aW9uIGZhaWxlZFwiKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXJyb3IgPSBlLm1lc3NhZ2Vcblx0XHRcdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NvbW1lbnRBZGRSZWFjdGlvbkVycm9yJywgXCJEZWxldGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWQ6IHswfS5cIiwgZS5tZXNzYWdlKVxuXHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnY29tbWVudEFkZFJlYWN0aW9uRGVmYXVsdEVycm9yJywgXCJEZWxldGluZyB0aGUgY29tbWVudCByZWFjdGlvbiBmYWlsZWRcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHJlYWN0aW9uLnJlYWN0b3JzLCByZWFjdGlvbi5pY29uUGF0aCwgcmVhY3Rpb24uY291bnQpKTtcblxuXHRcdFx0dGhpcy5fcmVhY3Rpb25zQWN0aW9uQmFyLnZhbHVlPy5wdXNoKGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdGlmIChoYXNSZWFjdGlvbkhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IHRvZ2dsZVJlYWN0aW9uQWN0aW9uID0gdGhpcy5jcmVhdGVSZWFjdGlvblBpY2tlcih0aGlzLmNvbW1lbnQuY29tbWVudFJlYWN0aW9ucyB8fCBbXSk7XG5cdFx0XHR0aGlzLl9yZWFjdGlvbnNBY3Rpb25CYXIudmFsdWU/LnB1c2godG9nZ2xlUmVhY3Rpb25BY3Rpb24sIHsgbGFiZWw6IGZhbHNlLCBpY29uOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjb21tZW50Qm9keVZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICh0eXBlb2YgdGhpcy5jb21tZW50LmJvZHkgPT09ICdzdHJpbmcnKSA/IHRoaXMuY29tbWVudC5ib2R5IDogdGhpcy5jb21tZW50LmJvZHkudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUNvbW1lbnRFZGl0b3IoZWRpdENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZChlZGl0Q29udGFpbmVyLCBkb20uJCgnLmVkaXQtdGV4dGFyZWEnKSk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2ltcGxlQ29tbWVudEVkaXRvciwgY29udGFpbmVyLCBTaW1wbGVDb21tZW50RWRpdG9yLmdldEVkaXRvck9wdGlvbnModGhpcy5jb25maWd1cmF0aW9uU2VydmljZSksIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnBhcmVudFRocmVhZCk7XG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudEVkaXRvcik7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy5jb21tZW50c0lucHV0LFxuXHRcdFx0cGF0aDogYC9jb21tZW50aW5wdXQtJHt0aGlzLmNvbW1lbnQudW5pcXVlSWRJblRocmVhZH0tJHtEYXRlLm5vdygpfS5tZGBcblx0XHR9KTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRvck1vZGVsID0gbW9kZWxSZWY7XG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudEVkaXRvck1vZGVsKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3Iuc2V0TW9kZWwodGhpcy5fY29tbWVudEVkaXRvck1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3Iuc2V0VmFsdWUodGhpcy5wZW5kaW5nRWRpdD8uYm9keSA/PyB0aGlzLmNvbW1lbnRCb2R5VmFsdWUpO1xuXHRcdGlmICh0aGlzLnBlbmRpbmdFZGl0KSB7XG5cdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yLnNldFBvc2l0aW9uKHRoaXMucGVuZGluZ0VkaXQuY3Vyc29yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGFzdExpbmUgPSB0aGlzLl9jb21tZW50RWRpdG9yTW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IGxhc3RDb2x1bW4gPSB0aGlzLl9jb21tZW50RWRpdG9yTW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRMaW5lTGVuZ3RoKGxhc3RMaW5lKSArIDE7XG5cdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbihsYXN0TGluZSwgbGFzdENvbHVtbikpO1xuXHRcdH1cblx0XHR0aGlzLnBlbmRpbmdFZGl0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IubGF5b3V0KHsgd2lkdGg6IGNvbnRhaW5lci5jbGllbnRXaWR0aCAtIDE0LCBoZWlnaHQ6IHRoaXMuX2VkaXRvckhlaWdodCB9KTtcblx0XHR0aGlzLl9jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cblx0XHRkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGVkaXRDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yIS5sYXlvdXQoeyB3aWR0aDogY29udGFpbmVyLmNsaWVudFdpZHRoIC0gMTQsIGhlaWdodDogdGhpcy5fZWRpdG9ySGVpZ2h0IH0pO1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvciEuZm9jdXMoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbW1lbnRUaHJlYWQgPSB0aGlzLmNvbW1lbnRUaHJlYWQ7XG5cdFx0Y29tbWVudFRocmVhZC5pbnB1dCA9IHtcblx0XHRcdHVyaTogdGhpcy5fY29tbWVudEVkaXRvci5nZXRNb2RlbCgpIS51cmksXG5cdFx0XHR2YWx1ZTogdGhpcy5jb21tZW50Qm9keVZhbHVlXG5cdFx0fTtcblx0XHR0aGlzLmNvbW1lbnRTZXJ2aWNlLnNldEFjdGl2ZUVkaXRpbmdDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQpO1xuXHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLm93bmVyLCB7IHRocmVhZDogY29tbWVudFRocmVhZCwgY29tbWVudDogdGhpcy5jb21tZW50IH0pO1xuXG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudEVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdGNvbW1lbnRUaHJlYWQuaW5wdXQgPSB7XG5cdFx0XHRcdHVyaTogdGhpcy5fY29tbWVudEVkaXRvciEuZ2V0TW9kZWwoKSEudXJpLFxuXHRcdFx0XHR2YWx1ZTogdGhpcy5jb21tZW50Qm9keVZhbHVlXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZChjb21tZW50VGhyZWFkKTtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLm93bmVyLCB7IHRocmVhZDogY29tbWVudFRocmVhZCwgY29tbWVudDogdGhpcy5jb21tZW50IH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbW1lbnRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZSA9PiB7XG5cdFx0XHRpZiAoY29tbWVudFRocmVhZC5pbnB1dCAmJiB0aGlzLl9jb21tZW50RWRpdG9yICYmIHRoaXMuX2NvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKSEudXJpID09PSBjb21tZW50VGhyZWFkLmlucHV0LnVyaSkge1xuXHRcdFx0XHRjb25zdCBuZXdWYWwgPSB0aGlzLl9jb21tZW50RWRpdG9yLmdldFZhbHVlKCk7XG5cdFx0XHRcdGlmIChuZXdWYWwgIT09IGNvbW1lbnRUaHJlYWQuaW5wdXQudmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dCA9IGNvbW1lbnRUaHJlYWQuaW5wdXQ7XG5cdFx0XHRcdFx0aW5wdXQudmFsdWUgPSBuZXdWYWw7XG5cdFx0XHRcdFx0Y29tbWVudFRocmVhZC5pbnB1dCA9IGlucHV0O1xuXHRcdFx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQoY29tbWVudFRocmVhZCk7XG5cdFx0XHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVDb21tZW50QW5kVGhyZWFkKHRoaXMub3duZXIsIHsgdGhyZWFkOiBjb21tZW50VGhyZWFkLCBjb21tZW50OiB0aGlzLmNvbW1lbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNhbGN1bGF0ZUVkaXRvckhlaWdodCgpO1xuXG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQoKHRoaXMuX2NvbW1lbnRFZGl0b3JNb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudEVkaXRvciAmJiB0aGlzLmNhbGN1bGF0ZUVkaXRvckhlaWdodCgpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRFZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLl9lZGl0b3JIZWlnaHQsIHdpZHRoOiB0aGlzLl9jb21tZW50RWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCB9KTtcblx0XHRcdFx0dGhpcy5fY29tbWVudEVkaXRvci5yZW5kZXIodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVFZGl0b3JIZWlnaHQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRFZGl0b3IpIHtcblx0XHRcdGNvbnN0IG5ld0VkaXRvckhlaWdodCA9IGNhbGN1bGF0ZUVkaXRvckhlaWdodCh0aGlzLnBhcmVudEVkaXRvciwgdGhpcy5fY29tbWVudEVkaXRvciwgdGhpcy5fZWRpdG9ySGVpZ2h0KTtcblx0XHRcdGlmIChuZXdFZGl0b3JIZWlnaHQgIT09IHRoaXMuX2VkaXRvckhlaWdodCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JIZWlnaHQgPSBuZXdFZGl0b3JIZWlnaHQ7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRQZW5kaW5nRWRpdCgpOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY29tbWVudEVkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRpZiAodGhpcy5fY29tbWVudEVkaXRvciAmJiBtb2RlbCAmJiBtb2RlbC5nZXRWYWx1ZUxlbmd0aCgpID4gMCkge1xuXHRcdFx0cmV0dXJuIHsgYm9keTogbW9kZWwuZ2V0VmFsdWUoKSwgY3Vyc29yOiB0aGlzLl9jb21tZW50RWRpdG9yLmdldFBvc2l0aW9uKCkhIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUNvbW1lbnRFZGl0b3IoKSB7XG5cdFx0dGhpcy5pc0VkaXRpbmcgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fZWRpdEFjdGlvbikge1xuXHRcdFx0dGhpcy5fZWRpdEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cdFx0dGhpcy5fYm9keS5jbGFzc0xpc3QucmVtb3ZlKCdoaWRkZW4nKTtcblx0XHR0aGlzLl9lZGl0TW9kZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRvciA9IG51bGw7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRDb250YWluZXIhLnJlbW92ZSgpO1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoSW5QaXhlbD86IG51bWJlcikge1xuXHRcdGNvbnN0IGVkaXRvcldpZHRoID0gd2lkdGhJblBpeGVsICE9PSB1bmRlZmluZWQgPyB3aWR0aEluUGl4ZWwgLSA3MiAvKiAtIG1hcmdpbiBhbmQgc2Nyb2xsYmFyKi8gOiAodGhpcy5fY29tbWVudEVkaXRvcj8uZ2V0TGF5b3V0SW5mbygpLndpZHRoID8/IDApO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3I/LmxheW91dCh7IHdpZHRoOiBlZGl0b3JXaWR0aCwgaGVpZ2h0OiB0aGlzLl9lZGl0b3JIZWlnaHQgfSk7XG5cdFx0Y29uc3Qgc2Nyb2xsV2lkdGggPSB0aGlzLl9ib2R5LnNjcm9sbFdpZHRoO1xuXHRcdGNvbnN0IHdpZHRoID0gZG9tLmdldENvbnRlbnRXaWR0aCh0aGlzLl9ib2R5KTtcblx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSB0aGlzLl9ib2R5LnNjcm9sbEhlaWdodDtcblx0XHRjb25zdCBoZWlnaHQgPSBkb20uZ2V0Q29udGVudEhlaWdodCh0aGlzLl9ib2R5KSArIDQ7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHdpZHRoLCBzY3JvbGxXaWR0aCwgaGVpZ2h0LCBzY3JvbGxIZWlnaHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3dpdGNoVG9FZGl0TW9kZSgpIHtcblx0XHRpZiAodGhpcy5pc0VkaXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlzRWRpdGluZyA9IHRydWU7XG5cdFx0dGhpcy5fYm9keS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0aGlzLl9jb21tZW50RWRpdENvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5fY29tbWVudERldGFpbHNDb250YWluZXIsIGRvbS4kKCcuZWRpdC1jb250YWluZXInKSk7XG5cdFx0YXdhaXQgdGhpcy5jcmVhdGVDb21tZW50RWRpdG9yKHRoaXMuX2NvbW1lbnRFZGl0Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGZvcm1BY3Rpb25zID0gZG9tLmFwcGVuZCh0aGlzLl9jb21tZW50RWRpdENvbnRhaW5lciwgZG9tLiQoJy5mb3JtLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3Qgb3RoZXJBY3Rpb25zID0gZG9tLmFwcGVuZChmb3JtQWN0aW9ucywgZG9tLiQoJy5vdGhlci1hY3Rpb25zJykpO1xuXHRcdHRoaXMuY3JlYXRlQ29tbWVudFdpZGdldEZvcm1BY3Rpb25zKG90aGVyQWN0aW9ucyk7XG5cdFx0Y29uc3QgZWRpdG9yQWN0aW9ucyA9IGRvbS5hcHBlbmQoZm9ybUFjdGlvbnMsIGRvbS4kKCcuZWRpdG9yLWFjdGlvbnMnKSk7XG5cdFx0dGhpcy5jcmVhdGVDb21tZW50V2lkZ2V0RWRpdG9yQWN0aW9ucyhlZGl0b3JBY3Rpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRNb2RlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgY3JlYXRlQ29tbWVudFdpZGdldEZvcm1BY3Rpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBtZW51cyA9IHRoaXMuY29tbWVudFNlcnZpY2UuZ2V0Q29tbWVudE1lbnVzKHRoaXMub3duZXIpO1xuXHRcdGNvbnN0IG1lbnUgPSBtZW51cy5nZXRDb21tZW50QWN0aW9ucyh0aGlzLmNvbW1lbnQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKG1lbnUpO1xuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zPy5zZXRBY3Rpb25zKG1lbnUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyA9IG5ldyBDb21tZW50Rm9ybUFjdGlvbnModGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBjb250YWluZXIsIChhY3Rpb246IElBY3Rpb24pOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLl9jb21tZW50RWRpdG9yIS5nZXRWYWx1ZSgpO1xuXG5cdFx0XHRhY3Rpb24ucnVuKHtcblx0XHRcdFx0dGhyZWFkOiB0aGlzLmNvbW1lbnRUaHJlYWQsXG5cdFx0XHRcdGNvbW1lbnRVbmlxdWVJZDogdGhpcy5jb21tZW50LnVuaXF1ZUlkSW5UaHJlYWQsXG5cdFx0XHRcdHRleHQ6IHRleHQsXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkTm9kZVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMucmVtb3ZlQ29tbWVudEVkaXRvcigpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudEZvcm1BY3Rpb25zKTtcblx0XHR0aGlzLl9jb21tZW50Rm9ybUFjdGlvbnMuc2V0QWN0aW9ucyhtZW51KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29tbWVudFdpZGdldEVkaXRvckFjdGlvbnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IG1lbnVzID0gdGhpcy5jb21tZW50U2VydmljZS5nZXRDb21tZW50TWVudXModGhpcy5vd25lcik7XG5cdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldENvbW1lbnRFZGl0b3JBY3Rpb25zKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKG1lbnUpO1xuXHRcdHRoaXMuX2VkaXRNb2RlRGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnM/LnNldEFjdGlvbnMobWVudSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnMgPSBuZXcgQ29tbWVudEZvcm1BY3Rpb25zKHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgY29udGFpbmVyLCAoYWN0aW9uOiBJQWN0aW9uKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fY29tbWVudEVkaXRvciEuZ2V0VmFsdWUoKTtcblxuXHRcdFx0YWN0aW9uLnJ1bih7XG5cdFx0XHRcdHRocmVhZDogdGhpcy5jb21tZW50VGhyZWFkLFxuXHRcdFx0XHRjb21tZW50VW5pcXVlSWQ6IHRoaXMuY29tbWVudC51bmlxdWVJZEluVGhyZWFkLFxuXHRcdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZE5vZGVcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yPy5mb2N1cygpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZWRpdE1vZGVEaXNwb3NhYmxlcy5hZGQodGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnMpO1xuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zLnNldEFjdGlvbnMobWVudSwgdHJ1ZSk7XG5cdH1cblxuXHRzZXRGb2N1cyhmb2N1c2VkOiBib29sZWFuLCB2aXNpYmxlOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5mb2N1cygpO1xuXHRcdFx0dGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGFiZm9jdXNlZCcpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0XHRpZiAodGhpcy5jb21tZW50Lm1vZGUgPT09IGxhbmd1YWdlcy5Db21tZW50TW9kZS5FZGl0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRFZGl0b3I/LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9hY3Rpb25zVG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ3RhYmZvY3VzZWQnKSAmJiAhdGhpcy5fYWN0aW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb3VzZW92ZXInKSkge1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3Rpb25zVG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd0YWJmb2N1c2VkJyk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlKG5ld0NvbW1lbnQ6IGxhbmd1YWdlcy5Db21tZW50KSB7XG5cblx0XHRpZiAobmV3Q29tbWVudC5ib2R5ICE9PSB0aGlzLmNvbW1lbnQuYm9keSkge1xuXHRcdFx0dGhpcy51cGRhdGVDb21tZW50Qm9keShuZXdDb21tZW50LmJvZHkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbW1lbnQudXNlckljb25QYXRoICYmIG5ld0NvbW1lbnQudXNlckljb25QYXRoICYmIChVUkkuZnJvbSh0aGlzLmNvbW1lbnQudXNlckljb25QYXRoKS50b1N0cmluZygpICE9PSBVUkkuZnJvbShuZXdDb21tZW50LnVzZXJJY29uUGF0aCkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMudXBkYXRlQ29tbWVudFVzZXJJY29uKG5ld0NvbW1lbnQudXNlckljb25QYXRoKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NoYW5naW5nTW9kZTogYm9vbGVhbiA9IG5ld0NvbW1lbnQubW9kZSAhPT0gdW5kZWZpbmVkICYmIG5ld0NvbW1lbnQubW9kZSAhPT0gdGhpcy5jb21tZW50Lm1vZGU7XG5cblx0XHR0aGlzLmNvbW1lbnQgPSBuZXdDb21tZW50O1xuXG5cdFx0aWYgKGlzQ2hhbmdpbmdNb2RlKSB7XG5cdFx0XHRpZiAobmV3Q29tbWVudC5tb2RlID09PSBsYW5ndWFnZXMuQ29tbWVudE1vZGUuRWRpdGluZykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnN3aXRjaFRvRWRpdE1vZGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlQ29tbWVudEVkaXRvcigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChuZXdDb21tZW50LmxhYmVsKSB7XG5cdFx0XHR0aGlzLl9pc1BlbmRpbmdMYWJlbC5pbm5lclRleHQgPSBuZXdDb21tZW50LmxhYmVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pc1BlbmRpbmdMYWJlbC5pbm5lclRleHQgPSAnJztcblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgY29tbWVudCByZWFjdGlvbnNcblx0XHR0aGlzLmNyZWF0ZVJlYWN0aW9uc0NvbnRhaW5lcih0aGlzLl9jb21tZW50RGV0YWlsc0NvbnRhaW5lcik7XG5cblx0XHRpZiAodGhpcy5jb21tZW50LmNvbnRleHRWYWx1ZSkge1xuXHRcdFx0dGhpcy5fY29tbWVudENvbnRleHRWYWx1ZS5zZXQodGhpcy5jb21tZW50LmNvbnRleHRWYWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbW1lbnRDb250ZXh0VmFsdWUucmVzZXQoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb21tZW50LnRpbWVzdGFtcCkge1xuXHRcdFx0dGhpcy51cGRhdGVUaW1lc3RhbXAodGhpcy5jb21tZW50LnRpbWVzdGFtcCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IE1vdXNlRXZlbnQpIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZG9tLmdldFdpbmRvdyh0aGlzLl9kb21Ob2RlKSwgZSk7XG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5Db21tZW50VGhyZWFkQ29tbWVudENvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLl9hY3Rpb25SdW5uZXIsXG5cdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jb21tZW50Tm9kZUNvbnRleHQ7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2ZvY3VzJyk7XG5cdFx0dGhpcy5fZm9jdXNDbGVhclRpbWVyLnNldElmTm90U2V0KCgpID0+IHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1cycpLCAzMDAwKTtcblx0fVxufVxuXG5mdW5jdGlvbiBmaWxsSW5BY3Rpb25zKGdyb3VwczogW3N0cmluZywgQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dW10sIHRhcmdldDogSUFjdGlvbltdIHwgeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0sIHVzZUFsdGVybmF0aXZlQWN0aW9uczogYm9vbGVhbiwgaXNQcmltYXJ5R3JvdXA6IChncm91cDogc3RyaW5nKSA9PiBib29sZWFuID0gZ3JvdXAgPT4gZ3JvdXAgPT09ICduYXZpZ2F0aW9uJyk6IHZvaWQge1xuXHRmb3IgKGNvbnN0IHR1cGxlIG9mIGdyb3Vwcykge1xuXHRcdGxldCBbZ3JvdXAsIGFjdGlvbnNdID0gdHVwbGU7XG5cdFx0aWYgKHVzZUFsdGVybmF0aXZlQWN0aW9ucykge1xuXHRcdFx0YWN0aW9ucyA9IGFjdGlvbnMubWFwKGEgPT4gKGEgaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikgJiYgISFhLmFsdCA/IGEuYWx0IDogYSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJpbWFyeUdyb3VwKGdyb3VwKSkge1xuXHRcdFx0Y29uc3QgdG8gPSBBcnJheS5pc0FycmF5KHRhcmdldCkgPyB0YXJnZXQgOiB0YXJnZXQucHJpbWFyeTtcblxuXHRcdFx0dG8udW5zaGlmdCguLi5hY3Rpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG8gPSBBcnJheS5pc0FycmF5KHRhcmdldCkgPyB0YXJnZXQgOiB0YXJnZXQuc2Vjb25kYXJ5O1xuXG5cdFx0XHRpZiAodG8ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0by5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRvLnB1c2goLi4uYWN0aW9ucyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsb0JBQW9CLGlCQUFpQjtBQUM5QyxTQUFTLFFBQWlCLFdBQVcsb0JBQW9CO0FBQ3pELFNBQVMsWUFBWSxpQkFBNkIseUJBQXlCO0FBQzNFLFNBQVMsb0JBQW9CO0FB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O0FBQUEsRUFtREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTVEVTtBQXFxQmIsU0FBUyxjQUFjLFFBQStELFFBQWtFLHVCQUFnQyxpQkFBNkMsV0FBUyxVQUFVLGNBQW9CO0FBQzNRLGFBQVcsU0FBUyxRQUFRO0FBQzNCLFFBQUksQ0FBQyxPQUFPLE9BQU8sSUFBSTtBQUN2QixRQUFJLHVCQUF1QjtBQUMxQixnQkFBVSxRQUFRLElBQUksT0FBTSxhQUFhLGtCQUFtQixDQUFDLENBQUMsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO0FBQUEsSUFDaEY7QUFFQSxRQUFJLGVBQWUsS0FBSyxHQUFHO0FBQzFCLFlBQU0sS0FBSyxNQUFNLFFBQVEsTUFBTSxJQUFJLFNBQVMsT0FBTztBQUVuRCxTQUFHLFFBQVEsR0FBRyxPQUFPO0FBQUEsSUFDdEIsT0FBTztBQUNOLFlBQU0sS0FBSyxNQUFNLFFBQVEsTUFBTSxJQUFJLFNBQVMsT0FBTztBQUVuRCxVQUFJLEdBQUcsU0FBUyxHQUFHO0FBQ2xCLFdBQUcsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUFBLE1BQ3hCO0FBRUEsU0FBRyxLQUFLLEdBQUcsT0FBTztBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJhY3Rpb24iLCAib3B0aW9ucyIsICJwcmltYXJ5IiwgInNlY29uZGFyeSJdCn0K
