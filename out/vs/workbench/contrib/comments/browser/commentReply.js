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
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { MOUSE_CURSOR_TEXT_CSS_CLASS_NAME } from "../../../../base/browser/ui/mouseCursor/mouseCursor.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { CommentFormActions } from "./commentFormActions.js";
import { ICommentService } from "./commentService.js";
import { CommentContextKeys } from "../common/commentContextKeys.js";
import { MIN_EDITOR_HEIGHT, SimpleCommentEditor, calculateEditorHeight } from "./simpleCommentEditor.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Position } from "../../../../editor/common/core/position.js";
let INMEM_MODEL_ID = 0;
const COMMENTEDITOR_DECORATION_KEY = "commenteditordecoration";
let CommentReply = class extends Disposable {
  constructor(owner, container, _parentEditor, _commentThread, _scopedInstatiationService, _contextKeyService, _commentMenus, _commentOptions, _pendingComment, _parentThread, focus, _actionRunDelegate, commentService, configurationService, keybindingService, contextMenuService, hoverService, textModelService) {
    super();
    this.owner = owner;
    this._parentEditor = _parentEditor;
    this._commentThread = _commentThread;
    this._scopedInstatiationService = _scopedInstatiationService;
    this._contextKeyService = _contextKeyService;
    this._commentMenus = _commentMenus;
    this._commentOptions = _commentOptions;
    this._pendingComment = _pendingComment;
    this._parentThread = _parentThread;
    this._actionRunDelegate = _actionRunDelegate;
    this.commentService = commentService;
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.textModelService = textModelService;
    this._commentThreadDisposables = [];
    this._editorHeight = MIN_EDITOR_HEIGHT;
    this._container = dom.append(container, dom.$(".comment-form-container"));
    this._form = dom.append(this._container, dom.$(".comment-form"));
    this.commentEditor = this._register(this._scopedInstatiationService.createInstance(SimpleCommentEditor, this._form, SimpleCommentEditor.getEditorOptions(configurationService), _contextKeyService, this._parentThread));
    this.commentEditorIsEmpty = CommentContextKeys.commentIsEmpty.bindTo(this._contextKeyService);
    this.commentEditorIsEmpty.set(!this._pendingComment);
    this.initialize(focus);
  }
  async initialize(focus) {
    this.avatar = dom.append(this._form, dom.$(".avatar-container"));
    this.updateAuthorInfo();
    const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
    const modeId = generateUuid() + "-" + (hasExistingComments ? this._commentThread.threadId : ++INMEM_MODEL_ID);
    let resource = URI.from({
      scheme: Schemas.commentsInput,
      path: `/${this._commentThread.extensionId}/commentinput-${modeId}.md`
    });
    const commentController = this.commentService.getCommentController(this.owner);
    if (commentController) {
      resource = resource.with({ authority: commentController.id });
    }
    const model = await this.textModelService.createModelReference(resource);
    model.object.textEditorModel.setValue(this._pendingComment?.body || "");
    this._register(model);
    this.commentEditor.setModel(model.object.textEditorModel);
    if (this._pendingComment) {
      this.commentEditor.setPosition(this._pendingComment.cursor);
    }
    this.calculateEditorHeight();
    this._register(model.object.textEditorModel.onDidChangeContent(() => {
      this.setCommentEditorDecorations();
      this.commentEditorIsEmpty?.set(!this.commentEditor.getValue());
      if (this.calculateEditorHeight()) {
        this.commentEditor.layout({ height: this._editorHeight, width: this.commentEditor.getLayoutInfo().width });
        this.commentEditor.render(true);
      }
    }));
    this.createTextModelListener(this.commentEditor, this._form);
    this.setCommentEditorDecorations();
    if (this._pendingComment) {
      this.expandReplyArea();
    } else if (hasExistingComments) {
      this.createReplyButton(this.commentEditor, this._form);
    } else if (this._commentThread.comments && this._commentThread.comments.length === 0) {
      this.expandReplyArea(focus);
    }
    this._error = dom.append(this._container, dom.$(".validation-error.hidden"));
    const formActions = dom.append(this._container, dom.$(".form-actions"));
    this._formActions = dom.append(formActions, dom.$(".other-actions"));
    this.createCommentWidgetFormActions(this._formActions, model.object.textEditorModel);
    this._editorActions = dom.append(formActions, dom.$(".editor-actions"));
    this.createCommentWidgetEditorActions(this._editorActions, model.object.textEditorModel);
  }
  calculateEditorHeight() {
    const newEditorHeight = calculateEditorHeight(this._parentEditor, this.commentEditor, this._editorHeight);
    if (newEditorHeight !== this._editorHeight) {
      this._editorHeight = newEditorHeight;
      return true;
    }
    return false;
  }
  updateCommentThread(commentThread) {
    const isReplying = this.commentEditor.hasTextFocus();
    const oldAndNewBothEmpty = !this._commentThread.comments?.length && !commentThread.comments?.length;
    if (!this._reviewThreadReplyButton) {
      this.createReplyButton(this.commentEditor, this._form);
    }
    if (this._commentThread.comments && this._commentThread.comments.length === 0 && !oldAndNewBothEmpty) {
      this.expandReplyArea();
    }
    if (isReplying) {
      this.commentEditor.focus();
    }
  }
  getPendingComment() {
    const model = this.commentEditor.getModel();
    if (model && model.getValueLength() > 0) {
      return { body: model.getValue(), cursor: this.commentEditor.getPosition() ?? new Position(1, 1) };
    }
    return void 0;
  }
  setPendingComment(pending) {
    this._pendingComment = pending;
    this.expandReplyArea();
    this.commentEditor.setValue(pending.body);
    this.commentEditor.setPosition(pending.cursor);
  }
  layout(widthInPixel) {
    this.commentEditor.layout({
      height: this._editorHeight,
      width: widthInPixel - 54
      /* margin 20px * 10 + scrollbar 14px*/
    });
  }
  focusIfNeeded() {
    if (!this._commentThread.comments || !this._commentThread.comments.length) {
      this.commentEditor.focus();
    } else if ((this.commentEditor.getModel()?.getValueLength() ?? 0) > 0) {
      this.expandReplyArea();
    }
  }
  focusCommentEditor() {
    this.commentEditor.focus();
  }
  expandReplyAreaAndFocusCommentEditor() {
    this.expandReplyArea();
    this.commentEditor.focus();
  }
  isCommentEditorFocused() {
    return this.commentEditor.hasWidgetFocus();
  }
  updateAuthorInfo() {
    this.avatar.textContent = "";
    if (typeof this._commentThread.canReply !== "boolean" && this._commentThread.canReply.iconPath) {
      this.avatar.style.display = "block";
      const img = dom.append(this.avatar, dom.$("img.avatar"));
      img.src = FileAccess.uriToBrowserUri(URI.revive(this._commentThread.canReply.iconPath)).toString(true);
    } else {
      this.avatar.style.display = "none";
    }
  }
  updateCanReply() {
    this.updateAuthorInfo();
    if (!this._commentThread.canReply) {
      this._container.style.display = "none";
    } else {
      this._container.style.display = "block";
    }
  }
  async submitComment() {
    await this._commentFormActions?.triggerDefaultAction();
    this._pendingComment = void 0;
  }
  setCommentEditorDecorations() {
    const hasExistingComments = this._commentThread.comments && this._commentThread.comments.length > 0;
    const placeholder = hasExistingComments ? this._commentOptions?.placeHolder || nls.localize("reply", "Reply...") : this._commentOptions?.placeHolder || nls.localize("newComment", "Type a new comment");
    this.commentEditor.updateOptions({ placeholder });
  }
  createTextModelListener(commentEditor, commentForm) {
    this._commentThreadDisposables.push(commentEditor.onDidFocusEditorWidget(() => {
      this._commentThread.input = {
        uri: commentEditor.getModel().uri,
        value: commentEditor.getValue()
      };
      this.commentService.setActiveEditingCommentThread(this._commentThread);
      this.commentService.setActiveCommentAndThread(this.owner, { thread: this._commentThread });
    }));
    this._commentThreadDisposables.push(commentEditor.getModel().onDidChangeContent(() => {
      const modelContent = commentEditor.getValue();
      if (this._commentThread.input && this._commentThread.input.uri === commentEditor.getModel().uri && this._commentThread.input.value !== modelContent) {
        const newInput = this._commentThread.input;
        newInput.value = modelContent;
        this._commentThread.input = newInput;
      }
      this.commentService.setActiveEditingCommentThread(this._commentThread);
    }));
    this._commentThreadDisposables.push(this._commentThread.onDidChangeInput((input) => {
      const thread = this._commentThread;
      const model = commentEditor.getModel();
      if (thread.input && model && thread.input.uri !== model.uri) {
        return;
      }
      if (!input) {
        return;
      }
      if (commentEditor.getValue() !== input.value) {
        commentEditor.setValue(input.value);
        if (input.value === "") {
          this._pendingComment = { body: "", cursor: new Position(1, 1) };
          commentForm.classList.remove("expand");
          commentEditor.getDomNode().style.outline = "";
          this._error.textContent = "";
          this._error.classList.add("hidden");
        }
      }
    }));
  }
  /**
   * Command based actions.
   */
  createCommentWidgetFormActions(container, model) {
    const menu = this._commentMenus.getCommentThreadActions(this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange(() => {
      this._commentFormActions.setActions(menu);
    }));
    this._commentFormActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action) => {
      await this._actionRunDelegate?.();
      await action.run({
        thread: this._commentThread,
        text: this.commentEditor.getValue(),
        $mid: MarshalledId.CommentThreadReply
      });
      this.hideReplyArea();
    });
    this._register(this._commentFormActions);
    this._commentFormActions.setActions(menu);
  }
  createCommentWidgetEditorActions(container, model) {
    const editorMenu = this._commentMenus.getCommentEditorActions(this._contextKeyService);
    this._register(editorMenu);
    this._register(editorMenu.onDidChange(() => {
      this._commentEditorActions.setActions(editorMenu, true);
    }));
    this._commentEditorActions = new CommentFormActions(this.keybindingService, this._contextKeyService, this.contextMenuService, container, async (action) => {
      this._actionRunDelegate?.();
      action.run({
        thread: this._commentThread,
        text: this.commentEditor.getValue(),
        $mid: MarshalledId.CommentThreadReply
      });
      this.focusCommentEditor();
    });
    this._register(this._commentEditorActions);
    this._commentEditorActions.setActions(editorMenu, true);
  }
  get isReplyExpanded() {
    return this._container.classList.contains("expand");
  }
  expandReplyArea(focus = true) {
    if (!this.isReplyExpanded) {
      this._container.classList.add("expand");
      if (focus) {
        this.commentEditor.focus();
      }
      this.commentEditor.layout();
    }
  }
  clearAndExpandReplyArea() {
    if (!this.isReplyExpanded) {
      this.commentEditor.setValue("");
      this.expandReplyArea();
    }
  }
  hideReplyArea() {
    const domNode = this.commentEditor.getDomNode();
    if (domNode) {
      domNode.style.outline = "";
    }
    this.commentEditor.setValue("");
    this._pendingComment = { body: "", cursor: new Position(1, 1) };
    this._container.classList.remove("expand");
    this._error.textContent = "";
    this._error.classList.add("hidden");
  }
  createReplyButton(commentEditor, commentForm) {
    this._reviewThreadReplyButton = dom.append(commentForm, dom.$(`button.review-thread-reply-button.${MOUSE_CURSOR_TEXT_CSS_CLASS_NAME}`));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._reviewThreadReplyButton, this._commentOptions?.prompt || nls.localize("reply", "Reply...")));
    this._reviewThreadReplyButton.textContent = this._commentOptions?.prompt || nls.localize("reply", "Reply...");
    this._register(dom.addDisposableListener(this._reviewThreadReplyButton, "click", (_) => this.clearAndExpandReplyArea()));
    this._register(dom.addDisposableListener(this._reviewThreadReplyButton, "focus", (_) => this.clearAndExpandReplyArea()));
    this._register(commentEditor.onDidBlurEditorWidget(() => {
      if (commentEditor.getModel().getValueLength() === 0 && commentForm.classList.contains("expand")) {
        commentForm.classList.remove("expand");
      }
    }));
  }
  dispose() {
    super.dispose();
    dispose(this._commentThreadDisposables);
  }
};
CommentReply = __decorateClass([
  __decorateParam(12, ICommentService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IKeybindingService),
  __decorateParam(15, IContextMenuService),
  __decorateParam(16, IHoverService),
  __decorateParam(17, ITextModelService)
], CommentReply);
export {
  COMMENTEDITOR_DECORATION_KEY,
  CommentReply
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvbW1lbnRzXFxicm93c2VyXFxjb21tZW50UmVwbHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9tb3VzZUN1cnNvci9tb3VzZUN1cnNvci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ29tbWVudEZvcm1BY3Rpb25zIH0gZnJvbSAnLi9jb21tZW50Rm9ybUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWVudE1lbnVzIH0gZnJvbSAnLi9jb21tZW50TWVudXMuanMnO1xuaW1wb3J0IHsgSUNvbW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi9jb21tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tZW50Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vY29tbWVudENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDb21tZW50VGhyZWFkV2lkZ2V0IH0gZnJvbSAnLi4vY29tbW9uL2NvbW1lbnRUaHJlYWRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IExheW91dGFibGVFZGl0b3IsIE1JTl9FRElUT1JfSEVJR0hULCBTaW1wbGVDb21tZW50RWRpdG9yLCBjYWxjdWxhdGVFZGl0b3JIZWlnaHQgfSBmcm9tICcuL3NpbXBsZUNvbW1lbnRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuXG5sZXQgSU5NRU1fTU9ERUxfSUQgPSAwO1xuZXhwb3J0IGNvbnN0IENPTU1FTlRFRElUT1JfREVDT1JBVElPTl9LRVkgPSAnY29tbWVudGVkaXRvcmRlY29yYXRpb24nO1xuXG5leHBvcnQgY2xhc3MgQ29tbWVudFJlcGx5PFQgZXh0ZW5kcyBJUmFuZ2UgfCBJQ2VsbFJhbmdlPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb21tZW50RWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZm9ybTogSFRNTEVsZW1lbnQ7XG5cdGNvbW1lbnRFZGl0b3JJc0VtcHR5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBhdmF0YXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZXJyb3IhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZm9ybUFjdGlvbnMhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZWRpdG9yQWN0aW9ucyE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBfY29tbWVudEZvcm1BY3Rpb25zITogQ29tbWVudEZvcm1BY3Rpb25zO1xuXHRwcml2YXRlIF9jb21tZW50RWRpdG9yQWN0aW9ucyE6IENvbW1lbnRGb3JtQWN0aW9ucztcblx0cHJpdmF0ZSBfcmV2aWV3VGhyZWFkUmVwbHlCdXR0b24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZWRpdG9ySGVpZ2h0ID0gTUlOX0VESVRPUl9IRUlHSFQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgb3duZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudEVkaXRvcjogTGF5b3V0YWJsZUVkaXRvcixcblx0XHRwcml2YXRlIF9jb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxUPixcblx0XHRwcml2YXRlIF9zY29wZWRJbnN0YXRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIF9jb21tZW50TWVudXM6IENvbW1lbnRNZW51cyxcblx0XHRwcml2YXRlIF9jb21tZW50T3B0aW9uczogbGFuZ3VhZ2VzLkNvbW1lbnRPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3BlbmRpbmdDb21tZW50OiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBfcGFyZW50VGhyZWFkOiBJQ29tbWVudFRocmVhZFdpZGdldCxcblx0XHRmb2N1czogYm9vbGVhbixcblx0XHRwcml2YXRlIF9hY3Rpb25SdW5EZWxlZ2F0ZTogKCgpID0+IHZvaWQpIHwgbnVsbCxcblx0XHRASUNvbW1lbnRTZXJ2aWNlIHByaXZhdGUgY29tbWVudFNlcnZpY2U6IElDb21tZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LWZvcm0tY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX2Zvcm0gPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LWZvcm0nKSk7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGF0aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaW1wbGVDb21tZW50RWRpdG9yLCB0aGlzLl9mb3JtLCBTaW1wbGVDb21tZW50RWRpdG9yLmdldEVkaXRvck9wdGlvbnMoY29uZmlndXJhdGlvblNlcnZpY2UpLCBfY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX3BhcmVudFRocmVhZCkpO1xuXHRcdHRoaXMuY29tbWVudEVkaXRvcklzRW1wdHkgPSBDb21tZW50Q29udGV4dEtleXMuY29tbWVudElzRW1wdHkuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3JJc0VtcHR5LnNldCghdGhpcy5fcGVuZGluZ0NvbW1lbnQpO1xuXG5cdFx0dGhpcy5pbml0aWFsaXplKGZvY3VzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZShmb2N1czogYm9vbGVhbikge1xuXHRcdHRoaXMuYXZhdGFyID0gZG9tLmFwcGVuZCh0aGlzLl9mb3JtLCBkb20uJCgnLmF2YXRhci1jb250YWluZXInKSk7XG5cdFx0dGhpcy51cGRhdGVBdXRob3JJbmZvKCk7XG5cdFx0Y29uc3QgaGFzRXhpc3RpbmdDb21tZW50cyA9IHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IG1vZGVJZCA9IGdlbmVyYXRlVXVpZCgpICsgJy0nICsgKGhhc0V4aXN0aW5nQ29tbWVudHMgPyB0aGlzLl9jb21tZW50VGhyZWFkLnRocmVhZElkIDogKytJTk1FTV9NT0RFTF9JRCk7XG5cblx0XHRsZXQgcmVzb3VyY2UgPSBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuY29tbWVudHNJbnB1dCxcblx0XHRcdHBhdGg6IGAvJHt0aGlzLl9jb21tZW50VGhyZWFkLmV4dGVuc2lvbklkfS9jb21tZW50aW5wdXQtJHttb2RlSWR9Lm1kYFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1lbnRDb250cm9sbGVyID0gdGhpcy5jb21tZW50U2VydmljZS5nZXRDb21tZW50Q29udHJvbGxlcih0aGlzLm93bmVyKTtcblx0XHRpZiAoY29tbWVudENvbnRyb2xsZXIpIHtcblx0XHRcdHJlc291cmNlID0gcmVzb3VyY2Uud2l0aCh7IGF1dGhvcml0eTogY29tbWVudENvbnRyb2xsZXIuaWQgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpO1xuXHRcdG1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuc2V0VmFsdWUodGhpcy5fcGVuZGluZ0NvbW1lbnQ/LmJvZHkgfHwgJycpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwpO1xuXHRcdHRoaXMuY29tbWVudEVkaXRvci5zZXRNb2RlbChtb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0NvbW1lbnQpIHtcblx0XHRcdHRoaXMuY29tbWVudEVkaXRvci5zZXRQb3NpdGlvbih0aGlzLl9wZW5kaW5nQ29tbWVudC5jdXJzb3IpO1xuXHRcdH1cblx0XHR0aGlzLmNhbGN1bGF0ZUVkaXRvckhlaWdodCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXRDb21tZW50RWRpdG9yRGVjb3JhdGlvbnMoKTtcblx0XHRcdHRoaXMuY29tbWVudEVkaXRvcklzRW1wdHk/LnNldCghdGhpcy5jb21tZW50RWRpdG9yLmdldFZhbHVlKCkpO1xuXHRcdFx0aWYgKHRoaXMuY2FsY3VsYXRlRWRpdG9ySGVpZ2h0KCkpIHtcblx0XHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLmxheW91dCh7IGhlaWdodDogdGhpcy5fZWRpdG9ySGVpZ2h0LCB3aWR0aDogdGhpcy5jb21tZW50RWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCB9KTtcblx0XHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLnJlbmRlcih0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmNyZWF0ZVRleHRNb2RlbExpc3RlbmVyKHRoaXMuY29tbWVudEVkaXRvciwgdGhpcy5fZm9ybSk7XG5cblx0XHR0aGlzLnNldENvbW1lbnRFZGl0b3JEZWNvcmF0aW9ucygpO1xuXG5cdFx0Ly8gT25seSBhZGQgdGhlIGFkZGl0aW9uYWwgc3RlcCBvZiBjbGlja2luZyBhIHJlcGx5IGJ1dHRvbiB0byBleHBhbmQgdGhlIHRleHRhcmVhIHdoZW4gdGhlcmUgYXJlIGV4aXN0aW5nIGNvbW1lbnRzXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdDb21tZW50KSB7XG5cdFx0XHR0aGlzLmV4cGFuZFJlcGx5QXJlYSgpO1xuXHRcdH0gZWxzZSBpZiAoaGFzRXhpc3RpbmdDb21tZW50cykge1xuXHRcdFx0dGhpcy5jcmVhdGVSZXBseUJ1dHRvbih0aGlzLmNvbW1lbnRFZGl0b3IsIHRoaXMuX2Zvcm0pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cyAmJiB0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoZm9jdXMpO1xuXHRcdH1cblx0XHR0aGlzLl9lcnJvciA9IGRvbS5hcHBlbmQodGhpcy5fY29udGFpbmVyLCBkb20uJCgnLnZhbGlkYXRpb24tZXJyb3IuaGlkZGVuJykpO1xuXHRcdGNvbnN0IGZvcm1BY3Rpb25zID0gZG9tLmFwcGVuZCh0aGlzLl9jb250YWluZXIsIGRvbS4kKCcuZm9ybS1hY3Rpb25zJykpO1xuXHRcdHRoaXMuX2Zvcm1BY3Rpb25zID0gZG9tLmFwcGVuZChmb3JtQWN0aW9ucywgZG9tLiQoJy5vdGhlci1hY3Rpb25zJykpO1xuXHRcdHRoaXMuY3JlYXRlQ29tbWVudFdpZGdldEZvcm1BY3Rpb25zKHRoaXMuX2Zvcm1BY3Rpb25zLCBtb2RlbC5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblx0XHR0aGlzLl9lZGl0b3JBY3Rpb25zID0gZG9tLmFwcGVuZChmb3JtQWN0aW9ucywgZG9tLiQoJy5lZGl0b3ItYWN0aW9ucycpKTtcblx0XHR0aGlzLmNyZWF0ZUNvbW1lbnRXaWRnZXRFZGl0b3JBY3Rpb25zKHRoaXMuX2VkaXRvckFjdGlvbnMsIG1vZGVsLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYWxjdWxhdGVFZGl0b3JIZWlnaHQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbmV3RWRpdG9ySGVpZ2h0ID0gY2FsY3VsYXRlRWRpdG9ySGVpZ2h0KHRoaXMuX3BhcmVudEVkaXRvciwgdGhpcy5jb21tZW50RWRpdG9yLCB0aGlzLl9lZGl0b3JIZWlnaHQpO1xuXHRcdGlmIChuZXdFZGl0b3JIZWlnaHQgIT09IHRoaXMuX2VkaXRvckhlaWdodCkge1xuXHRcdFx0dGhpcy5fZWRpdG9ySGVpZ2h0ID0gbmV3RWRpdG9ySGVpZ2h0O1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVDb21tZW50VGhyZWFkKGNvbW1lbnRUaHJlYWQ6IGxhbmd1YWdlcy5Db21tZW50VGhyZWFkPElSYW5nZSB8IElDZWxsUmFuZ2U+KSB7XG5cdFx0Y29uc3QgaXNSZXBseWluZyA9IHRoaXMuY29tbWVudEVkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0XHRjb25zdCBvbGRBbmROZXdCb3RoRW1wdHkgPSAhdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cz8ubGVuZ3RoICYmICFjb21tZW50VGhyZWFkLmNvbW1lbnRzPy5sZW5ndGg7XG5cblx0XHRpZiAoIXRoaXMuX3Jldmlld1RocmVhZFJlcGx5QnV0dG9uKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVJlcGx5QnV0dG9uKHRoaXMuY29tbWVudEVkaXRvciwgdGhpcy5fZm9ybSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbW1lbnRUaHJlYWQuY29tbWVudHMgJiYgdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cy5sZW5ndGggPT09IDAgJiYgIW9sZEFuZE5ld0JvdGhFbXB0eSkge1xuXHRcdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoKTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZXBseWluZykge1xuXHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFBlbmRpbmdDb21tZW50KCk6IGxhbmd1YWdlcy5QZW5kaW5nQ29tbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKTtcblxuXHRcdGlmIChtb2RlbCAmJiBtb2RlbC5nZXRWYWx1ZUxlbmd0aCgpID4gMCkgeyAvLyBjaGVja2luZyBsZW5ndGggaXMgY2hlYXBcblx0XHRcdHJldHVybiB7IGJvZHk6IG1vZGVsLmdldFZhbHVlKCksIGN1cnNvcjogdGhpcy5jb21tZW50RWRpdG9yLmdldFBvc2l0aW9uKCkgPz8gbmV3IFBvc2l0aW9uKDEsIDEpIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRQZW5kaW5nQ29tbWVudChwZW5kaW5nOiBsYW5ndWFnZXMuUGVuZGluZ0NvbW1lbnQpIHtcblx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudCA9IHBlbmRpbmc7XG5cdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoKTtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0VmFsdWUocGVuZGluZy5ib2R5KTtcblx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0UG9zaXRpb24ocGVuZGluZy5jdXJzb3IpO1xuXHR9XG5cblx0cHVibGljIGxheW91dCh3aWR0aEluUGl4ZWw6IG51bWJlcikge1xuXHRcdHRoaXMuY29tbWVudEVkaXRvci5sYXlvdXQoeyBoZWlnaHQ6IHRoaXMuX2VkaXRvckhlaWdodCwgd2lkdGg6IHdpZHRoSW5QaXhlbCAtIDU0IC8qIG1hcmdpbiAyMHB4ICogMTAgKyBzY3JvbGxiYXIgMTRweCovIH0pO1xuXHR9XG5cblx0cHVibGljIGZvY3VzSWZOZWVkZWQoKSB7XG5cdFx0aWYgKCF0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzIHx8ICF0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICgodGhpcy5jb21tZW50RWRpdG9yLmdldE1vZGVsKCk/LmdldFZhbHVlTGVuZ3RoKCkgPz8gMCkgPiAwKSB7XG5cdFx0XHR0aGlzLmV4cGFuZFJlcGx5QXJlYSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmb2N1c0NvbW1lbnRFZGl0b3IoKSB7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgZXhwYW5kUmVwbHlBcmVhQW5kRm9jdXNDb21tZW50RWRpdG9yKCkge1xuXHRcdHRoaXMuZXhwYW5kUmVwbHlBcmVhKCk7XG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgaXNDb21tZW50RWRpdG9yRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb21tZW50RWRpdG9yLmhhc1dpZGdldEZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUF1dGhvckluZm8oKSB7XG5cdFx0dGhpcy5hdmF0YXIudGV4dENvbnRlbnQgPSAnJztcblx0XHRpZiAodHlwZW9mIHRoaXMuX2NvbW1lbnRUaHJlYWQuY2FuUmVwbHkgIT09ICdib29sZWFuJyAmJiB0aGlzLl9jb21tZW50VGhyZWFkLmNhblJlcGx5Lmljb25QYXRoKSB7XG5cdFx0XHR0aGlzLmF2YXRhci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdGNvbnN0IGltZyA9IGRvbS5hcHBlbmQodGhpcy5hdmF0YXIsIGRvbS4kKCdpbWcuYXZhdGFyJykpIGFzIEhUTUxJbWFnZUVsZW1lbnQ7XG5cdFx0XHRpbWcuc3JjID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoVVJJLnJldml2ZSh0aGlzLl9jb21tZW50VGhyZWFkLmNhblJlcGx5Lmljb25QYXRoKSkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXZhdGFyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHVwZGF0ZUNhblJlcGx5KCkge1xuXHRcdHRoaXMudXBkYXRlQXV0aG9ySW5mbygpO1xuXHRcdGlmICghdGhpcy5fY29tbWVudFRocmVhZC5jYW5SZXBseSkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdWJtaXRDb21tZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucz8udHJpZ2dlckRlZmF1bHRBY3Rpb24oKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldENvbW1lbnRFZGl0b3JEZWNvcmF0aW9ucygpIHtcblx0XHRjb25zdCBoYXNFeGlzdGluZ0NvbW1lbnRzID0gdGhpcy5fY29tbWVudFRocmVhZC5jb21tZW50cyAmJiB0aGlzLl9jb21tZW50VGhyZWFkLmNvbW1lbnRzLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBoYXNFeGlzdGluZ0NvbW1lbnRzXG5cdFx0XHQ/ICh0aGlzLl9jb21tZW50T3B0aW9ucz8ucGxhY2VIb2xkZXIgfHwgbmxzLmxvY2FsaXplKCdyZXBseScsIFwiUmVwbHkuLi5cIikpXG5cdFx0XHQ6ICh0aGlzLl9jb21tZW50T3B0aW9ucz8ucGxhY2VIb2xkZXIgfHwgbmxzLmxvY2FsaXplKCduZXdDb21tZW50JywgXCJUeXBlIGEgbmV3IGNvbW1lbnRcIikpO1xuXG5cdFx0dGhpcy5jb21tZW50RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlciB9KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGV4dE1vZGVsTGlzdGVuZXIoY29tbWVudEVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbW1lbnRGb3JtOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX2NvbW1lbnRUaHJlYWREaXNwb3NhYmxlcy5wdXNoKGNvbW1lbnRFZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50VGhyZWFkLmlucHV0ID0ge1xuXHRcdFx0XHR1cmk6IGNvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKSEudXJpLFxuXHRcdFx0XHR2YWx1ZTogY29tbWVudEVkaXRvci5nZXRWYWx1ZSgpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5jb21tZW50U2VydmljZS5zZXRBY3RpdmVFZGl0aW5nQ29tbWVudFRocmVhZCh0aGlzLl9jb21tZW50VGhyZWFkKTtcblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlQ29tbWVudEFuZFRocmVhZCh0aGlzLm93bmVyLCB7IHRocmVhZDogdGhpcy5fY29tbWVudFRocmVhZCB9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb21tZW50VGhyZWFkRGlzcG9zYWJsZXMucHVzaChjb21tZW50RWRpdG9yLmdldE1vZGVsKCkhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbENvbnRlbnQgPSBjb21tZW50RWRpdG9yLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAodGhpcy5fY29tbWVudFRocmVhZC5pbnB1dCAmJiB0aGlzLl9jb21tZW50VGhyZWFkLmlucHV0LnVyaSA9PT0gY29tbWVudEVkaXRvci5nZXRNb2RlbCgpIS51cmkgJiYgdGhpcy5fY29tbWVudFRocmVhZC5pbnB1dC52YWx1ZSAhPT0gbW9kZWxDb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IG5ld0lucHV0OiBsYW5ndWFnZXMuQ29tbWVudElucHV0ID0gdGhpcy5fY29tbWVudFRocmVhZC5pbnB1dDtcblx0XHRcdFx0bmV3SW5wdXQudmFsdWUgPSBtb2RlbENvbnRlbnQ7XG5cdFx0XHRcdHRoaXMuX2NvbW1lbnRUaHJlYWQuaW5wdXQgPSBuZXdJbnB1dDtcblx0XHRcdH1cblx0XHRcdHRoaXMuY29tbWVudFNlcnZpY2Uuc2V0QWN0aXZlRWRpdGluZ0NvbW1lbnRUaHJlYWQodGhpcy5fY29tbWVudFRocmVhZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzLnB1c2godGhpcy5fY29tbWVudFRocmVhZC5vbkRpZENoYW5nZUlucHV0KGlucHV0ID0+IHtcblx0XHRcdGNvbnN0IHRocmVhZCA9IHRoaXMuX2NvbW1lbnRUaHJlYWQ7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICh0aHJlYWQuaW5wdXQgJiYgbW9kZWwgJiYgKHRocmVhZC5pbnB1dC51cmkgIT09IG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb21tZW50RWRpdG9yLmdldFZhbHVlKCkgIT09IGlucHV0LnZhbHVlKSB7XG5cdFx0XHRcdGNvbW1lbnRFZGl0b3Iuc2V0VmFsdWUoaW5wdXQudmFsdWUpO1xuXG5cdFx0XHRcdGlmIChpbnB1dC52YWx1ZSA9PT0gJycpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ29tbWVudCA9IHsgYm9keTogJycsIGN1cnNvcjogbmV3IFBvc2l0aW9uKDEsIDEpIH07XG5cdFx0XHRcdFx0Y29tbWVudEZvcm0uY2xhc3NMaXN0LnJlbW92ZSgnZXhwYW5kJyk7XG5cdFx0XHRcdFx0Y29tbWVudEVkaXRvci5nZXREb21Ob2RlKCkhLnN0eWxlLm91dGxpbmUgPSAnJztcblx0XHRcdFx0XHR0aGlzLl9lcnJvci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuX2Vycm9yLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbW1hbmQgYmFzZWQgYWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlQ29tbWVudFdpZGdldEZvcm1BY3Rpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX2NvbW1lbnRNZW51cy5nZXRDb21tZW50VGhyZWFkQWN0aW9ucyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihtZW51KTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucy5zZXRBY3Rpb25zKG1lbnUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyA9IG5ldyBDb21tZW50Rm9ybUFjdGlvbnModGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCBjb250YWluZXIsIGFzeW5jIChhY3Rpb246IElBY3Rpb24pID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX2FjdGlvblJ1bkRlbGVnYXRlPy4oKTtcblxuXHRcdFx0YXdhaXQgYWN0aW9uLnJ1bih7XG5cdFx0XHRcdHRocmVhZDogdGhpcy5fY29tbWVudFRocmVhZCxcblx0XHRcdFx0dGV4dDogdGhpcy5jb21tZW50RWRpdG9yLmdldFZhbHVlKCksXG5cdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5Db21tZW50VGhyZWFkUmVwbHlcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLmhpZGVSZXBseUFyZWEoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyk7XG5cdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zLnNldEFjdGlvbnMobWVudSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbW1lbnRXaWRnZXRFZGl0b3JBY3Rpb25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0Y29uc3QgZWRpdG9yTWVudSA9IHRoaXMuX2NvbW1lbnRNZW51cy5nZXRDb21tZW50RWRpdG9yQWN0aW9ucyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yTWVudSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yTWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb21tZW50RWRpdG9yQWN0aW9ucy5zZXRBY3Rpb25zKGVkaXRvck1lbnUsIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRFZGl0b3JBY3Rpb25zID0gbmV3IENvbW1lbnRGb3JtQWN0aW9ucyh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIGNvbnRhaW5lciwgYXN5bmMgKGFjdGlvbjogSUFjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVuRGVsZWdhdGU/LigpO1xuXG5cdFx0XHRhY3Rpb24ucnVuKHtcblx0XHRcdFx0dGhyZWFkOiB0aGlzLl9jb21tZW50VGhyZWFkLFxuXHRcdFx0XHR0ZXh0OiB0aGlzLmNvbW1lbnRFZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkNvbW1lbnRUaHJlYWRSZXBseVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuZm9jdXNDb21tZW50RWRpdG9yKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb21tZW50RWRpdG9yQWN0aW9ucyk7XG5cdFx0dGhpcy5fY29tbWVudEVkaXRvckFjdGlvbnMuc2V0QWN0aW9ucyhlZGl0b3JNZW51LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzUmVwbHlFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnZXhwYW5kJyk7XG5cdH1cblxuXHRwcml2YXRlIGV4cGFuZFJlcGx5QXJlYShmb2N1czogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRpZiAoIXRoaXMuaXNSZXBseUV4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZXhwYW5kJyk7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0dGhpcy5jb21tZW50RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbW1lbnRFZGl0b3IubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckFuZEV4cGFuZFJlcGx5QXJlYSgpIHtcblx0XHRpZiAoIXRoaXMuaXNSZXBseUV4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0VmFsdWUoJycpO1xuXHRcdFx0dGhpcy5leHBhbmRSZXBseUFyZWEoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZGVSZXBseUFyZWEoKSB7XG5cdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuY29tbWVudEVkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0aWYgKGRvbU5vZGUpIHtcblx0XHRcdGRvbU5vZGUuc3R5bGUub3V0bGluZSA9ICcnO1xuXHRcdH1cblx0XHR0aGlzLmNvbW1lbnRFZGl0b3Iuc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tZW50ID0geyBib2R5OiAnJywgY3Vyc29yOiBuZXcgUG9zaXRpb24oMSwgMSkgfTtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZXhwYW5kJyk7XG5cdFx0dGhpcy5fZXJyb3IudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLl9lcnJvci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVwbHlCdXR0b24oY29tbWVudEVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbW1lbnRGb3JtOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX3Jldmlld1RocmVhZFJlcGx5QnV0dG9uID0gPEhUTUxCdXR0b25FbGVtZW50PmRvbS5hcHBlbmQoY29tbWVudEZvcm0sIGRvbS4kKGBidXR0b24ucmV2aWV3LXRocmVhZC1yZXBseS1idXR0b24uJHtNT1VTRV9DVVJTT1JfVEVYVF9DU1NfQ0xBU1NfTkFNRX1gKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuX3Jldmlld1RocmVhZFJlcGx5QnV0dG9uLCB0aGlzLl9jb21tZW50T3B0aW9ucz8ucHJvbXB0IHx8IG5scy5sb2NhbGl6ZSgncmVwbHknLCBcIlJlcGx5Li4uXCIpKSk7XG5cblx0XHR0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbi50ZXh0Q29udGVudCA9IHRoaXMuX2NvbW1lbnRPcHRpb25zPy5wcm9tcHQgfHwgbmxzLmxvY2FsaXplKCdyZXBseScsIFwiUmVwbHkuLi5cIik7XG5cdFx0Ly8gYmluZCBjbGljay9lc2NhcGUgYWN0aW9ucyBmb3IgcmV2aWV3VGhyZWFkUmVwbHlCdXR0b24gYW5kIHRleHRBcmVhXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9yZXZpZXdUaHJlYWRSZXBseUJ1dHRvbiwgJ2NsaWNrJywgXyA9PiB0aGlzLmNsZWFyQW5kRXhwYW5kUmVwbHlBcmVhKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3Jldmlld1RocmVhZFJlcGx5QnV0dG9uLCAnZm9jdXMnLCBfID0+IHRoaXMuY2xlYXJBbmRFeHBhbmRSZXBseUFyZWEoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29tbWVudEVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0aWYgKGNvbW1lbnRFZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWVMZW5ndGgoKSA9PT0gMCAmJiBjb21tZW50Rm9ybS5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZCcpKSB7XG5cdFx0XHRcdGNvbW1lbnRGb3JtLmNsYXNzTGlzdC5yZW1vdmUoJ2V4cGFuZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5fY29tbWVudFRocmVhZERpc3Bvc2FibGVzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3Q0FBd0M7QUFFakQsU0FBUyxZQUF5QixlQUFlO0FBQ2pELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWSxlQUFlO0FB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
