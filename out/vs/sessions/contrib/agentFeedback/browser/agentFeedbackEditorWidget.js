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
import "./media/agentFeedbackEditorWidget.css";
import { $, addDisposableListener, addStandardDisposableListener, clearNode, getTotalWidth, isHTMLElement } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Action } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { overviewRulerRangeHighlight } from "../../../../editor/common/core/editorColorRegistry.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { OverviewRulerLane } from "../../../../editor/common/model.js";
import * as nls from "../../../../nls.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { ICodeReviewService } from "../../codeReview/browser/codeReviewService.js";
import { createAgentFeedbackContext } from "./agentFeedbackEditorUtils.js";
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedbackService } from "./agentFeedbackService.js";
import { SessionEditorCommentSource, toSessionEditorCommentId } from "./sessionEditorComments.js";
function isTextInputTarget(target) {
  return isHTMLElement(target) && target.closest("textarea, input") !== null;
}
var ComposerKind = /* @__PURE__ */ ((ComposerKind2) => {
  ComposerKind2[ComposerKind2["Edit"] = 0] = "Edit";
  ComposerKind2[ComposerKind2["Reply"] = 1] = "Reply";
  return ComposerKind2;
})(ComposerKind || {});
let AgentFeedbackEditorWidget = class extends Disposable {
  constructor(_editor, _commentItems, _sessionResource, _composerDraftState, _agentFeedbackService, _codeReviewService, _markdownRendererService, _codeEditorService) {
    super();
    this._editor = _editor;
    this._commentItems = _commentItems;
    this._sessionResource = _sessionResource;
    this._composerDraftState = _composerDraftState;
    this._agentFeedbackService = _agentFeedbackService;
    this._codeReviewService = _codeReviewService;
    this._markdownRendererService = _markdownRendererService;
    this._codeEditorService = _codeEditorService;
    this._id = `agent-feedback-widget-${AgentFeedbackEditorWidget._idPool++}`;
    this._itemElements = /* @__PURE__ */ new Map();
    this._activeReplyInputs = /* @__PURE__ */ new Map();
    this._activeEditInputs = /* @__PURE__ */ new Map();
    this._actionBarElements = /* @__PURE__ */ new Map();
    this._position = null;
    this._isExpanded = false;
    this._disposed = false;
    this._startLineNumber = 1;
    this._eventStore = this._register(new DisposableStore());
    this._onDidExpand = this._register(new Emitter());
    this.onDidExpand = this._onDidExpand.event;
    this._rangeHighlightDecoration = this._editor.createDecorationsCollection();
    this._domNode = $("div.agent-feedback-widget");
    this._domNode.classList.add("collapsed");
    this._domNode.tabIndex = -1;
    this._headerNode = $("div.agent-feedback-widget-header");
    const commentIcon = renderIcon(Codicon.comment);
    commentIcon.setAttribute("aria-hidden", "true");
    this._headerNode.appendChild(commentIcon);
    this._titleNode = $("span.agent-feedback-widget-title");
    this._updateTitle();
    this._headerNode.appendChild(this._titleNode);
    this._headerNode.appendChild($("span.agent-feedback-widget-spacer"));
    this._toggleButton = $("div.agent-feedback-widget-toggle");
    this._updateToggleButton();
    this._headerNode.appendChild(this._toggleButton);
    this._domNode.appendChild(this._headerNode);
    this._bodyNode = $("div.agent-feedback-widget-body");
    this._bodyNode.classList.add("collapsed");
    this._buildFeedbackItems();
    this._domNode.appendChild(this._bodyNode);
    const arrow = $("div.agent-feedback-widget-arrow");
    this._domNode.appendChild(arrow);
    this._setupEventHandlers();
    this._domNode.classList.add("visible");
    this._editor.addOverlayWidget(this);
  }
  _setupEventHandlers() {
    this._eventStore.add(addDisposableListener(this._toggleButton, "click", (e) => {
      e.stopPropagation();
      this._toggleExpanded();
    }));
    this._eventStore.add(addDisposableListener(this._headerNode, "click", () => {
      this._toggleExpanded();
    }));
    this._eventStore.add(addStandardDisposableListener(this._domNode, "keydown", (e) => {
      if (e.keyCode !== KeyCode.Escape || !this._cancelActiveInputs()) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }));
  }
  /**
   * Closes every open edit / reply composer. Returns whether any was open.
   */
  _cancelActiveInputs() {
    const cancels = [...this._activeEditInputs.values(), ...this._activeReplyInputs.values()].map((input) => input.cancel);
    for (const cancel of cancels) {
      cancel();
    }
    return cancels.length > 0;
  }
  _setDraft(commentId, kind, text) {
    this._composerDraftState?.drafts.set(commentId, { kind, text });
  }
  _clearDraft(commentId) {
    if (!this._composerDraftState) {
      return;
    }
    this._composerDraftState.drafts.delete(commentId);
    if (this._composerDraftState.focusedCommentId === commentId) {
      this._composerDraftState.focusedCommentId = void 0;
    }
  }
  /**
   * Whether a composer should take focus: always for an explicit user action,
   * and for a restored draft only if it had focus when the widget was rebuilt.
   */
  _shouldFocusComposer(commentId, restoredText) {
    return restoredText === void 0 || this._composerDraftState?.focusedCommentId === commentId;
  }
  _focusComposer(textarea) {
    this._composerToFocus = textarea;
    if (textarea.isConnected) {
      this.restoreComposerFocus();
    }
  }
  _toggleExpanded() {
    if (this._isExpanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }
  _updateTitle() {
    const count = this._commentItems.length;
    if (count === 1) {
      this._titleNode.textContent = this._commentItems[0].text;
    } else {
      this._titleNode.textContent = nls.localize("nComments", "{0} comments", count);
    }
  }
  _updateToggleButton() {
    clearNode(this._toggleButton);
    if (this._isExpanded) {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronUp));
      this._toggleButton.title = nls.localize("collapse", "Collapse");
    } else {
      this._toggleButton.appendChild(renderIcon(Codicon.chevronDown));
      this._toggleButton.title = nls.localize("expand", "Expand");
    }
  }
  _buildFeedbackItems() {
    clearNode(this._bodyNode);
    this._itemElements.clear();
    this._activeReplyInputs.clear();
    this._activeEditInputs.clear();
    this._actionBarElements.clear();
    for (const comment of this._commentItems) {
      const item = $("div.agent-feedback-widget-item");
      item.classList.add(`agent-feedback-widget-item-${comment.source}`);
      if (comment.suggestion) {
        item.classList.add("agent-feedback-widget-item-suggestion");
      }
      this._itemElements.set(comment.id, item);
      const itemHeader = $("div.agent-feedback-widget-item-header");
      const itemMeta = $("div.agent-feedback-widget-item-meta");
      const lineInfo = $("span.agent-feedback-widget-line-info");
      if (comment.range.startLineNumber === comment.range.endLineNumber) {
        lineInfo.textContent = nls.localize("lineNumber", "Line {0}", comment.range.startLineNumber);
      } else {
        lineInfo.textContent = nls.localize("lineRange", "Lines {0}-{1}", comment.range.startLineNumber, comment.range.endLineNumber);
      }
      itemMeta.appendChild(lineInfo);
      const typeLabel = this._getTypeLabel(comment);
      if (typeLabel) {
        const typeBadge = $("span.agent-feedback-widget-item-type");
        typeBadge.textContent = typeLabel;
        itemMeta.appendChild(typeBadge);
      }
      itemHeader.appendChild(itemMeta);
      const actionBarContainer = $("div.agent-feedback-widget-item-actions");
      const actionBar = this._eventStore.add(new ActionBar(actionBarContainer));
      const itemActions = { editAction: void 0, removeAction: void 0, addReplyAction: void 0 };
      itemActions.addReplyAction = this._eventStore.add(new Action(
        "agentFeedback.widget.addReply",
        nls.localize("addToComment", "Add to Comment"),
        ThemeIcon.asClassName(Codicon.commentDiscussion),
        true,
        () => {
          this._startAddingReply(comment, item, itemActions);
        }
      ));
      actionBar.push(itemActions.addReplyAction, { icon: true, label: false });
      itemActions.editAction = this._eventStore.add(new Action(
        "agentFeedback.widget.edit",
        nls.localize("editComment", "Edit"),
        ThemeIcon.asClassName(Codicon.edit),
        true,
        () => {
          this._startEditing(comment, text, itemActions);
        }
      ));
      actionBar.push(itemActions.editAction, { icon: true, label: false });
      const showActionButtonsBar = comment.canConvertToAgentFeedback || comment.source === SessionEditorCommentSource.AgentFeedback && comment.state === AgentFeedbackState.Created;
      itemActions.removeAction = this._eventStore.add(new Action(
        "agentFeedback.widget.remove",
        nls.localize("removeComment", "Remove"),
        ThemeIcon.asClassName(Codicon.close),
        true,
        () => this._removeComment(comment)
      ));
      if (!showActionButtonsBar) {
        actionBar.push(itemActions.removeAction, { icon: true, label: false });
      }
      itemHeader.appendChild(actionBarContainer);
      item.appendChild(itemHeader);
      const text = $("div.agent-feedback-widget-text");
      const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
      this._eventStore.add(rendered);
      text.appendChild(rendered.element);
      item.appendChild(text);
      if (comment.suggestion?.edits.length) {
        item.appendChild(this._renderSuggestion(comment));
      }
      if (comment.replies?.length) {
        item.appendChild(this._renderReplies(comment.replies));
      }
      if (showActionButtonsBar) {
        this._renderActionButtons(comment, item);
      }
      this._eventStore.add(addDisposableListener(item, "mouseenter", () => {
        this._highlightRange(comment);
      }));
      this._eventStore.add(addDisposableListener(item, "mouseleave", () => {
        this._rangeHighlightDecoration.clear();
      }));
      this._eventStore.add(addDisposableListener(item, "click", (e) => {
        const target = e.target;
        if (target?.closest(".action-bar")) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-add-reply")) {
          return;
        }
        if (isTextInputTarget(target)) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text")) {
          const selection = this._domNode.ownerDocument.defaultView?.getSelection();
          if (selection && !selection.isCollapsed && this._domNode.contains(selection.anchorNode)) {
            return;
          }
        }
        this.focusFeedback(comment.id);
        this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
        this._revealComment(comment);
      }));
      const onSelectableMousedown = (e) => {
        const target = e.target;
        if (isTextInputTarget(target)) {
          return;
        }
        if (target?.closest(".agent-feedback-widget-text, .agent-feedback-widget-suggestion-text, .agent-feedback-widget-reply-text")) {
          this._domNode.focus({ preventScroll: true });
        }
      };
      this._eventStore.add(addDisposableListener(item, "mousedown", onSelectableMousedown));
      this._bodyNode.appendChild(item);
      const draft = this._composerDraftState?.drafts.get(comment.id);
      if (draft?.kind === 1 /* Reply */) {
        this._startAddingReply(comment, item, itemActions, draft.text);
      } else if (draft?.kind === 0 /* Edit */) {
        this._startEditing(comment, text, itemActions, draft.text);
      }
    }
  }
  _getTypeLabel(comment) {
    switch (comment.kind) {
      case AgentFeedbackKind.PRReview:
        return nls.localize("prReviewComment", "PR Review");
      case AgentFeedbackKind.AgentReview:
        return nls.localize("agentReviewComment", "Agent Review");
      default:
        return void 0;
    }
  }
  _renderSuggestion(comment) {
    const suggestionNode = $("div.agent-feedback-widget-suggestion");
    for (const edit of comment.suggestion?.edits ?? []) {
      const editNode = $("div.agent-feedback-widget-suggestion-edit");
      const header = $("div.agent-feedback-widget-suggestion-header");
      if (edit.range.startLineNumber === edit.range.endLineNumber) {
        header.textContent = nls.localize("suggestedChangeLine", "Suggested Change \u2022 Line {0}", edit.range.startLineNumber);
      } else {
        header.textContent = nls.localize("suggestedChangeLines", "Suggested Change \u2022 Lines {0}-{1}", edit.range.startLineNumber, edit.range.endLineNumber);
      }
      editNode.appendChild(header);
      const newText = $("pre.agent-feedback-widget-suggestion-text");
      newText.textContent = edit.newText;
      editNode.appendChild(newText);
      suggestionNode.appendChild(editNode);
    }
    return suggestionNode;
  }
  _renderReplies(replies) {
    const repliesNode = $("div.agent-feedback-widget-replies");
    for (const reply of replies) {
      const replyNode = $("div.agent-feedback-widget-reply");
      const replyText = $("div.agent-feedback-widget-reply-text");
      const rendered = this._markdownRendererService.render(new MarkdownString(reply));
      this._eventStore.add(rendered);
      replyText.appendChild(rendered.element);
      replyNode.appendChild(replyText);
      repliesNode.appendChild(replyNode);
    }
    return repliesNode;
  }
  /**
   * Renders the Accept / Remove button bar shown at the bottom of a
   * `created` agent feedback comment or a PR review comment. Clicking either
   * button performs the action and removes the bar. For PR review comments
   * "Accept" converts the comment into agent feedback; for agent feedback it
   * marks the comment as accepted.
   */
  _renderActionButtons(comment, item) {
    const buttonBar = $("div.agent-feedback-widget-actions-bar");
    const buttonStore = new DisposableStore();
    this._eventStore.add(buttonStore);
    buttonStore.add(addDisposableListener(buttonBar, "click", (e) => e.stopPropagation()));
    const dismiss = () => {
      buttonStore.dispose();
      buttonBar.remove();
      this._actionBarElements.delete(comment.id);
      this._domNode.focus({ preventScroll: true });
      this._editor.layoutOverlayWidget(this);
    };
    const isPRComment = comment.source === SessionEditorCommentSource.PRReview;
    const acceptTooltip = isPRComment ? nls.localize("acceptPRFeedbackTooltip", "Share PR comment with agent") : nls.localize("acceptAgentFeedbackTooltip", "Share comment with agent");
    const deleteTooltip = isPRComment ? nls.localize("deletePRFeedbackTooltip", "Remove and mark as resolved on GitHub") : nls.localize("deleteAgentFeedbackTooltip", "Remove agent comment");
    const acceptButton = buttonStore.add(new Button(buttonBar, {
      title: acceptTooltip,
      buttonBackground: "var(--vscode-charts-purple)",
      buttonHoverBackground: "color-mix(in srgb, var(--vscode-charts-purple) 85%, var(--vscode-foreground))",
      buttonForeground: "var(--vscode-button-foreground)",
      buttonBorder: "var(--vscode-charts-purple)"
    }));
    acceptButton.label = nls.localize("acceptFeedbackButton", "Accept");
    buttonStore.add(acceptButton.onDidClick(() => {
      if (comment.canConvertToAgentFeedback) {
        this._convertToAgentFeedback(comment);
      } else {
        this._acceptFeedback(comment);
      }
      dismiss();
    }));
    const deleteButton = buttonStore.add(new Button(buttonBar, {
      title: deleteTooltip,
      secondary: true,
      buttonSecondaryBackground: "var(--vscode-button-secondaryBackground)",
      buttonSecondaryHoverBackground: "var(--vscode-button-secondaryHoverBackground)",
      buttonSecondaryForeground: "var(--vscode-button-secondaryForeground)",
      buttonSecondaryBorder: "var(--vscode-button-secondaryBorder)"
    }));
    deleteButton.label = nls.localize("deleteFeedbackButton", "Delete");
    buttonStore.add(deleteButton.onDidClick(() => {
      this._removeComment(comment);
      dismiss();
    }));
    item.appendChild(buttonBar);
    this._actionBarElements.set(comment.id, buttonBar);
  }
  _removeComment(comment) {
    if (comment.source === SessionEditorCommentSource.PRReview) {
      this._codeReviewService.resolvePRReviewThread(this._sessionResource, comment.sourceId);
      return;
    }
    this._agentFeedbackService.removeFeedback(this._sessionResource, comment.sourceId);
  }
  _startEditing(comment, textContainer, actions, restoredText) {
    const existing = this._activeEditInputs.get(comment.id);
    if (existing) {
      existing.textarea.focus();
      return;
    }
    actions.editAction.enabled = false;
    actions.removeAction.enabled = false;
    actions.addReplyAction.enabled = false;
    const editStore = new DisposableStore();
    this._eventStore.add(editStore);
    clearNode(textContainer);
    textContainer.classList.add("editing");
    const textarea = $("textarea.agent-feedback-widget-edit-textarea");
    textarea.value = restoredText ?? comment.text;
    textarea.rows = 1;
    textContainer.appendChild(textarea);
    this._activeEditInputs.set(comment.id, {
      textarea,
      cancel: () => this._stopEditing(comment, textContainer, editStore, actions)
    });
    this._setDraft(comment.id, 0 /* Edit */, textarea.value);
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._editor.layoutOverlayWidget(this);
    };
    autoSize();
    editStore.add(addDisposableListener(textarea, "input", () => {
      this._setDraft(comment.id, 0 /* Edit */, textarea.value);
      autoSize();
    }));
    editStore.add(addStandardDisposableListener(textarea, "keydown", (e) => {
      if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const newText = textarea.value.trim();
        if (newText) {
          this._clearDraft(comment.id);
          this._saveEdit(comment, newText);
        } else {
          this._stopEditing(comment, textContainer, editStore, actions);
        }
      } else if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        this._stopEditing(comment, textContainer, editStore, actions);
      }
    }));
    if (this._shouldFocusComposer(comment.id, restoredText)) {
      this._focusComposer(textarea);
    }
  }
  _startAddingReply(comment, itemNode, actions, restoredText) {
    const existing = this._activeReplyInputs.get(comment.id);
    if (existing) {
      existing.textarea.focus();
      return;
    }
    actions.editAction.enabled = false;
    actions.removeAction.enabled = false;
    actions.addReplyAction.enabled = false;
    const replyStore = new DisposableStore();
    this._eventStore.add(replyStore);
    const replyContainer = $("div.agent-feedback-widget-add-reply");
    const textarea = $("textarea.agent-feedback-widget-edit-textarea");
    textarea.placeholder = nls.localize("addReplyPlaceholder", "Add a comment\u2026");
    textarea.rows = 1;
    if (restoredText !== void 0) {
      textarea.value = restoredText;
    }
    replyContainer.appendChild(textarea);
    const actionsBar = this._actionBarElements.get(comment.id);
    if (actionsBar) {
      itemNode.insertBefore(replyContainer, actionsBar);
    } else {
      itemNode.appendChild(replyContainer);
    }
    this._activeReplyInputs.set(comment.id, { textarea, cancel: () => cleanup() });
    this._setDraft(comment.id, 1 /* Reply */, textarea.value);
    const autoSize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._editor.layoutOverlayWidget(this);
    };
    autoSize();
    replyStore.add(addDisposableListener(textarea, "input", () => {
      this._setDraft(comment.id, 1 /* Reply */, textarea.value);
      autoSize();
    }));
    const cleanup = () => {
      replyStore.dispose();
      actions.editAction.enabled = true;
      actions.removeAction.enabled = true;
      actions.addReplyAction.enabled = true;
      this._activeReplyInputs.delete(comment.id);
      replyContainer.remove();
      this._clearDraft(comment.id);
      this._editor.layoutOverlayWidget(this);
    };
    replyStore.add(addStandardDisposableListener(textarea, "keydown", (e) => {
      if (e.keyCode === KeyCode.Enter && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const newReply = textarea.value.trim();
        if (newReply) {
          this._clearDraft(comment.id);
          this._saveReply(comment, newReply);
        } else {
          cleanup();
        }
      } else if (e.keyCode === KeyCode.Escape) {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      }
    }));
    if (this._shouldFocusComposer(comment.id, restoredText)) {
      this._focusComposer(textarea);
    }
  }
  /**
   * Focuses the composer restored from a draft, if any. Must be called once the
   * widget is in the DOM — focusing a detached element has no effect.
   */
  restoreComposerFocus() {
    const textarea = this._composerToFocus;
    this._composerToFocus = void 0;
    if (!textarea) {
      return;
    }
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
  _saveReply(comment, replyText) {
    if (comment.source === SessionEditorCommentSource.AgentFeedback) {
      this._agentFeedbackService.addReply(this._sessionResource, comment.sourceId, replyText);
      return;
    }
    if (!comment.canConvertToAgentFeedback) {
      return;
    }
    const feedback = this._agentFeedbackService.addFeedback(
      this._sessionResource,
      comment.resourceUri,
      comment.range,
      comment.text,
      comment.suggestion,
      createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
      comment.sourceId,
      AgentFeedbackKind.PRReview
    );
    this._agentFeedbackService.addReply(this._sessionResource, feedback.id, replyText);
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
    this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
  }
  _saveEdit(comment, newText) {
    if (comment.source === SessionEditorCommentSource.AgentFeedback) {
      this._agentFeedbackService.updateFeedback(this._sessionResource, comment.sourceId, newText);
    } else {
      this._convertToAgentFeedbackWithText(comment, newText);
    }
  }
  _stopEditing(comment, textContainer, editStore, actions) {
    editStore.dispose();
    this._activeEditInputs.delete(comment.id);
    this._clearDraft(comment.id);
    actions.editAction.enabled = true;
    actions.removeAction.enabled = true;
    actions.addReplyAction.enabled = true;
    textContainer.classList.remove("editing");
    clearNode(textContainer);
    const rendered = this._markdownRendererService.render(new MarkdownString(comment.text));
    this._eventStore.add(rendered);
    textContainer.appendChild(rendered.element);
    this._editor.layoutOverlayWidget(this);
  }
  _convertToAgentFeedback(comment) {
    this._convertToAgentFeedbackWithText(comment, comment.text);
  }
  /**
   * Accept a Created agent feedback item so it becomes submittable.
   */
  _acceptFeedback(comment) {
    if (comment.source !== SessionEditorCommentSource.AgentFeedback) {
      return;
    }
    this._agentFeedbackService.acceptFeedback(this._sessionResource, comment.sourceId);
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, comment.id);
  }
  /**
   * Converts a non-agent-feedback comment into an agent feedback item, optionally with edited text.
   */
  _convertToAgentFeedbackWithText(comment, text) {
    if (!comment.canConvertToAgentFeedback) {
      return;
    }
    const feedback = this._agentFeedbackService.addFeedback(
      this._sessionResource,
      comment.resourceUri,
      comment.range,
      text,
      comment.suggestion,
      createAgentFeedbackContext(this._editor, this._codeEditorService, comment.resourceUri, comment.range),
      comment.sourceId,
      AgentFeedbackKind.PRReview
    );
    this._agentFeedbackService.setNavigationAnchor(this._sessionResource, toSessionEditorCommentId(SessionEditorCommentSource.AgentFeedback, feedback.id));
    this._codeReviewService.markPRReviewCommentConverted(this._sessionResource, comment.sourceId);
  }
  /**
   * Expand the widget body.
   */
  expand() {
    const wasExpanded = this._isExpanded;
    this._isExpanded = true;
    this._domNode.classList.remove("collapsed");
    this._bodyNode.classList.remove("collapsed");
    this._updateToggleButton();
    this._editor.layoutOverlayWidget(this);
    if (!wasExpanded) {
      this._onDidExpand.fire();
    }
  }
  get isExpanded() {
    return this._isExpanded;
  }
  /**
   * Collapse the widget body.
   */
  collapse() {
    this._isExpanded = false;
    this._domNode.classList.add("collapsed");
    this._bodyNode.classList.add("collapsed");
    this._updateToggleButton();
    this.clearFocus();
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Focus a specific feedback item within this widget.
   * Highlights its range in the editor and marks it as focused.
   */
  focusFeedback(feedbackId) {
    for (const el of this._itemElements.values()) {
      el.classList.remove("focused");
    }
    const feedback = this._commentItems.find((f) => f.id === feedbackId);
    if (!feedback) {
      return;
    }
    const itemEl = this._itemElements.get(feedbackId);
    itemEl?.classList.add("focused");
    this._highlightRange(feedback);
  }
  /**
   * Clear focus state and range highlighting.
   */
  clearFocus() {
    for (const el of this._itemElements.values()) {
      el.classList.remove("focused");
    }
    this._rangeHighlightDecoration.clear();
  }
  _highlightRange(feedback) {
    const endLineNumber = feedback.range.endLineNumber;
    const range = new Range(
      feedback.range.startLineNumber,
      1,
      endLineNumber,
      this._editor.getModel()?.getLineMaxColumn(endLineNumber) ?? 1
    );
    this._rangeHighlightDecoration.set([
      {
        range,
        options: {
          description: "agent-feedback-range-highlight",
          className: "rangeHighlight",
          isWholeLine: true,
          linesDecorationsClassName: "agent-feedback-widget-range-glyph"
        }
      },
      {
        range,
        options: {
          description: "agent-feedback-range-highlight-overview",
          overviewRuler: {
            color: themeColorFromId(overviewRulerRangeHighlight),
            position: OverviewRulerLane.Full
          }
        }
      }
    ]);
  }
  /**
   * Returns true if this widget contains the given feedback item (by id).
   */
  containsFeedback(feedbackId) {
    return this._commentItems.some((f) => f.id === feedbackId);
  }
  /**
   * Returns the comment id whose open composer is the given element, or
   * `undefined` if none. Lets the contribution restore focus after a rebuild.
   */
  findComposerCommentIdForElement(element) {
    for (const [commentId, { textarea }] of [...this._activeEditInputs, ...this._activeReplyInputs]) {
      if (textarea === element) {
        return commentId;
      }
    }
    return void 0;
  }
  /**
   * Ids of the comments rendered by this widget. Used by the contribution
   * to prune draft state for comments that no longer exist.
   */
  getCommentIds() {
    return this._commentItems.map((comment) => comment.id);
  }
  /**
   * Updates the widget position and layout.
   */
  layout(startLineNumber) {
    if (this._disposed) {
      return;
    }
    if (startLineNumber !== this._startLineNumber) {
      this._cachedMinContentWidth = void 0;
    }
    this._startLineNumber = startLineNumber;
    const lineHeight = this._editor.getOption(EditorOption.lineHeight);
    const { contentLeft, contentWidth, verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const scrollTop = this._editor.getScrollTop();
    const widgetWidth = getTotalWidth(this._domNode) || 280;
    const widgetHeight = this._domNode.offsetHeight || 0;
    const headerHeight = this._headerNode.offsetHeight || lineHeight;
    const contentRelativeTop = this._editor.getTopForLineNumber(startLineNumber) + (lineHeight - headerHeight) / 2;
    const scrollHeight = this._editor.getScrollHeight();
    const clampedContentTop = Math.min(Math.max(0, contentRelativeTop), Math.max(0, scrollHeight - widgetHeight));
    this._position = {
      stackOrdinal: 2,
      preference: {
        top: clampedContentTop - scrollTop,
        left: contentLeft + contentWidth - (2 * verticalScrollbarWidth + widgetWidth)
      }
    };
    this._editor.layoutOverlayWidget(this);
  }
  /**
   * Shows or hides the widget.
   */
  toggle(show) {
    this._domNode.classList.toggle("visible", show);
    if (show && this._commentItems.length > 0) {
      this.layout(this._commentItems[0].range.startLineNumber);
    }
  }
  /**
   * Relayouts the widget at its current line number.
   */
  relayout() {
    if (this._startLineNumber) {
      this.layout(this._startLineNumber);
    }
  }
  // IOverlayWidget implementation
  getId() {
    return this._id;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return this._position;
  }
  /**
   * Reserve enough horizontal scroll width so the user can always scroll the
   * editor content out from underneath the widget. The widget is anchored to
   * the right edge of the editor content area, so without this reservation any
   * line that extends under the widget cannot be revealed because the editor
   * cannot scroll past its longest line.
   *
   * The reserved width is the widget width plus the widest content among the
   * anchored line and the lines immediately above and below it. The result is
   * computed once using the real rendered widget width and cached afterwards.
   * Until the widget DOM node has a real width we fall back to an estimate and
   * skip caching so the value is recomputed once it is actually rendered. The
   * cache is also invalidated by `layout` whenever the anchor line changes.
   */
  getMinContentWidthInPx() {
    if (this._disposed) {
      return 0;
    }
    if (this._cachedMinContentWidth !== void 0) {
      return this._cachedMinContentWidth;
    }
    const model = this._editor.getModel();
    if (!model) {
      return 0;
    }
    const renderedWidth = getTotalWidth(this._domNode);
    const hasRenderedWidth = renderedWidth > 0;
    const widgetWidth = hasRenderedWidth ? renderedWidth : AgentFeedbackEditorWidget._estimatedWidgetWidth;
    const lineCount = model.getLineCount();
    let maxLineWidth = 0;
    let measuredAnyLine = false;
    for (let lineNumber = this._startLineNumber - 1; lineNumber <= this._startLineNumber + 1; lineNumber++) {
      if (lineNumber < 1 || lineNumber > lineCount) {
        continue;
      }
      const lineWidth = this._editor.getWidthOfLine(lineNumber);
      if (lineWidth < 0) {
        continue;
      }
      measuredAnyLine = true;
      if (lineWidth > maxLineWidth) {
        maxLineWidth = lineWidth;
      }
    }
    const { verticalScrollbarWidth } = this._editor.getLayoutInfo();
    const result = maxLineWidth + widgetWidth + 2 * verticalScrollbarWidth;
    if (hasRenderedWidth && measuredAnyLine) {
      this._cachedMinContentWidth = result;
    }
    return result;
  }
  dispose() {
    if (this._disposed) {
      return;
    }
    this._disposed = true;
    this._rangeHighlightDecoration.clear();
    this._editor.removeOverlayWidget(this);
    super.dispose();
  }
  _revealComment(comment) {
    const range = new Range(
      comment.range.startLineNumber,
      1,
      comment.range.endLineNumber,
      this._editor.getModel()?.getLineMaxColumn(comment.range.endLineNumber) ?? 1
    );
    this._editor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
  }
};
AgentFeedbackEditorWidget._idPool = 0;
/**
 * Estimated widget width in px used while the widget DOM node has not been
 * laid out yet. Matches the `max-width` of `.agent-feedback-widget` so we
 * reserve enough scroll space up front; the real width replaces it once the
 * node is rendered.
 */
AgentFeedbackEditorWidget._estimatedWidgetWidth = 280;
AgentFeedbackEditorWidget = __decorateClass([
  __decorateParam(4, IAgentFeedbackService),
  __decorateParam(5, ICodeReviewService),
  __decorateParam(6, IMarkdownRendererService),
  __decorateParam(7, ICodeEditorService)
], AgentFeedbackEditorWidget);
export {
  AgentFeedbackEditorWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWdlbnRGZWVkYmFja1xcYnJvd3NlclxcYWdlbnRGZWVkYmFja0VkaXRvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0LmNzcyc7XG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIGNsZWFyTm9kZSwgZ2V0VG90YWxXaWR0aCwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBvdmVydmlld1J1bGVyUmFuZ2VIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlUmV2aWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2NvZGVSZXZpZXcvYnJvd3Nlci9jb2RlUmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudEZlZWRiYWNrQ29udGV4dCB9IGZyb20gJy4vYWdlbnRGZWVkYmFja0VkaXRvclV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tLaW5kLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4vYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25FZGl0b3JDb21tZW50LCBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZSwgdG9TZXNzaW9uRWRpdG9yQ29tbWVudElkIH0gZnJvbSAnLi9zZXNzaW9uRWRpdG9yQ29tbWVudHMuanMnO1xuXG5pbnRlcmZhY2UgSUNvbW1lbnRJdGVtQWN0aW9ucyB7XG5cdGVkaXRBY3Rpb246IEFjdGlvbjtcblx0cmVtb3ZlQWN0aW9uOiBBY3Rpb247XG5cdGFkZFJlcGx5QWN0aW9uOiBBY3Rpb247XG59XG5cbi8qKlxuICogQW4gb3BlbiBlZGl0IG9yIHJlcGx5IGNvbXBvc2VyLiBgY2FuY2VsYCBjbG9zZXMgaXQgYW5kIHJlc3RvcmVzIHRoZSBpdGVtLlxuICovXG5pbnRlcmZhY2UgSUFjdGl2ZUlucHV0IHtcblx0cmVhZG9ubHkgdGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNhbmNlbDogKCkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHRoZSBldmVudCB0YXJnZXQgbGl2ZXMgaW5zaWRlIG9uZSBvZiB0aGUgd2lkZ2V0J3MgdGV4dCBpbnB1dHMsIHdoZXJlXG4gKiBtb3VzZSBpbnRlcmFjdGlvbnMgbXVzdCBiZSBsZWZ0IHRvIHRoZSBicm93c2VyIHNvIHRoZSBjYXJldCBjYW4gYmUgcGxhY2VkLlxuICovXG5mdW5jdGlvbiBpc1RleHRJbnB1dFRhcmdldCh0YXJnZXQ6IEV2ZW50VGFyZ2V0IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNIVE1MRWxlbWVudCh0YXJnZXQpICYmIHRhcmdldC5jbG9zZXN0KCd0ZXh0YXJlYSwgaW5wdXQnKSAhPT0gbnVsbDtcbn1cblxuY29uc3QgZW51bSBDb21wb3NlcktpbmQge1xuXHRFZGl0LFxuXHRSZXBseSxcbn1cblxuLyoqXG4gKiBJbi1wcm9ncmVzcyB0ZXh0IG9mIGEgc2luZ2xlIG9wZW4gY29tcG9zZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2VyRHJhZnQge1xuXHRyZWFkb25seSBraW5kOiBDb21wb3NlcktpbmQ7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcbn1cblxuLyoqXG4gKiBTaGFyZWQgY29tcG9zZXIgc3RhdGUgdGhhdCBzdXJ2aXZlcyB3aWRnZXQgcmVidWlsZHMuIFRoZSBjb250cmlidXRpb24gb3ducyB0aGVcbiAqIHNpbmdsZSBpbnN0YW5jZSBhbmQgaGFuZHMgaXQgdG8gZWFjaCB3aWRnZXQgc28gZHJhZnRzIChhbmQgZm9jdXMpIGFyZSBub3QgbG9zdFxuICogd2hlbiB3aWRnZXRzIGFyZSByZWNyZWF0ZWQgaW4gcmVzcG9uc2UgdG8gdW5yZWxhdGVkIGZlZWRiYWNrIC8gcmV2aWV3IGNoYW5nZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2VyRHJhZnRTdGF0ZSB7XG5cdHJlYWRvbmx5IGRyYWZ0czogTWFwPHN0cmluZywgSUNvbXBvc2VyRHJhZnQ+O1xuXHRmb2N1c2VkQ29tbWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogV2lkZ2V0IHRoYXQgZGlzcGxheXMgYWdlbnQgZmVlZGJhY2sgY29tbWVudHMgZm9yIGEgZ3JvdXAgb2YgbmVhcmJ5IGZlZWRiYWNrIGl0ZW1zLlxuICogUG9zaXRpb25lZCBvbiB0aGUgcmlnaHQgc2lkZSBvZiB0aGUgZWRpdG9yIGxpa2UgYSBzcGVlY2ggYnViYmxlLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRGZWVkYmFja0VkaXRvcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJT3ZlcmxheVdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbCA9IDA7XG5cblx0LyoqXG5cdCAqIEVzdGltYXRlZCB3aWRnZXQgd2lkdGggaW4gcHggdXNlZCB3aGlsZSB0aGUgd2lkZ2V0IERPTSBub2RlIGhhcyBub3QgYmVlblxuXHQgKiBsYWlkIG91dCB5ZXQuIE1hdGNoZXMgdGhlIGBtYXgtd2lkdGhgIG9mIGAuYWdlbnQtZmVlZGJhY2std2lkZ2V0YCBzbyB3ZVxuXHQgKiByZXNlcnZlIGVub3VnaCBzY3JvbGwgc3BhY2UgdXAgZnJvbnQ7IHRoZSByZWFsIHdpZHRoIHJlcGxhY2VzIGl0IG9uY2UgdGhlXG5cdCAqIG5vZGUgaXMgcmVuZGVyZWQuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZXN0aW1hdGVkV2lkZ2V0V2lkdGggPSAyODA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IHN0cmluZyA9IGBhZ2VudC1mZWVkYmFjay13aWRnZXQtJHtBZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0Ll9pZFBvb2wrK31gO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWFkZXJOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVOb2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9nZ2xlQnV0dG9uOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtRWxlbWVudHMgPSBuZXcgTWFwPHN0cmluZywgSFRNTEVsZW1lbnQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVJlcGx5SW5wdXRzID0gbmV3IE1hcDxzdHJpbmcsIElBY3RpdmVJbnB1dD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlRWRpdElucHV0cyA9IG5ldyBNYXA8c3RyaW5nLCBJQWN0aXZlSW5wdXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbkJhckVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIEhUTUxFbGVtZW50PigpO1xuXG5cdHByaXZhdGUgX3Bvc2l0aW9uOiBJT3ZlcmxheVdpZGdldFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbXBvc2VyVG9Gb2N1czogSFRNTFRleHRBcmVhRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNFeHBhbmRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaXNwb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdGFydExpbmVOdW1iZXI6IG51bWJlciA9IDE7XG5cdHByaXZhdGUgX2NhY2hlZE1pbkNvbnRlbnRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yYW5nZUhpZ2hsaWdodERlY29yYXRpb246IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeHBhbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFeHBhbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRFeHBhbmQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50SXRlbXM6IHJlYWRvbmx5IElTZXNzaW9uRWRpdG9yQ29tbWVudFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBvc2VyRHJhZnRTdGF0ZTogSUNvbXBvc2VyRHJhZnRTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRASUFnZW50RmVlZGJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50RmVlZGJhY2tTZXJ2aWNlOiBJQWdlbnRGZWVkYmFja1NlcnZpY2UsXG5cdFx0QElDb2RlUmV2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb2RlUmV2aWV3U2VydmljZTogSUNvZGVSZXZpZXdTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24gPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cblx0XHQvLyBDcmVhdGUgRE9NIHN0cnVjdHVyZVxuXHRcdHRoaXMuX2RvbU5vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHQvLyBNYWtlIGZvY3VzYWJsZSBzbyB0aGF0IG1vdXNlZG93biBpbiBzZWxlY3RhYmxlIHJlZ2lvbnMgY2FuIHB1bGwgZm9jdXNcblx0XHQvLyBhd2F5IGZyb20gdGhlIGVkaXRvcidzIHRleHRhcmVhLCBhbGxvd2luZyBuYXRpdmUgQ3RybC9DbWQrQyB0byBjb3B5XG5cdFx0Ly8gdGhlIERPTSBzZWxlY3Rpb24gb2YgdGhlIGNvbW1lbnQgY29udGVudC5cblx0XHR0aGlzLl9kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cblx0XHQvLyBIZWFkZXJcblx0XHR0aGlzLl9oZWFkZXJOb2RlID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1oZWFkZXInKTtcblxuXHRcdC8vIENvbW1lbnQgaWNvbiAoZGVjb3JhdGl2ZSwgaGlkZGVuIGZyb20gc2NyZWVuIHJlYWRlcnMpXG5cdFx0Y29uc3QgY29tbWVudEljb24gPSByZW5kZXJJY29uKENvZGljb24uY29tbWVudCk7XG5cdFx0Y29tbWVudEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5faGVhZGVyTm9kZS5hcHBlbmRDaGlsZChjb21tZW50SWNvbik7XG5cblx0XHQvLyBUaXRsZSBzaG93aW5nIGZlZWRiYWNrIGNvdW50XG5cdFx0dGhpcy5fdGl0bGVOb2RlID0gJCgnc3Bhbi5hZ2VudC1mZWVkYmFjay13aWRnZXQtdGl0bGUnKTtcblx0XHR0aGlzLl91cGRhdGVUaXRsZSgpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdGl0bGVOb2RlKTtcblxuXHRcdC8vIFNwYWNlclxuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5hZ2VudC1mZWVkYmFjay13aWRnZXQtc3BhY2VyJykpO1xuXG5cdFx0Ly8gVG9nZ2xlIGV4cGFuZC9jb2xsYXBzZSBidXR0b25cblx0XHR0aGlzLl90b2dnbGVCdXR0b24gPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRvZ2dsZScpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpO1xuXHRcdHRoaXMuX2hlYWRlck5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fdG9nZ2xlQnV0dG9uKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5faGVhZGVyTm9kZSk7XG5cblx0XHQvLyBCb2R5IChjb2xsYXBzaWJsZSkgXHUyMDE0IHN0YXJ0cyBjb2xsYXBzZWRcblx0XHR0aGlzLl9ib2R5Tm9kZSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtYm9keScpO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNlZCcpO1xuXHRcdHRoaXMuX2J1aWxkRmVlZGJhY2tJdGVtcygpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fYm9keU5vZGUpO1xuXG5cdFx0Ly8gQXJyb3cgcG9pbnRlclxuXHRcdGNvbnN0IGFycm93ID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1hcnJvdycpO1xuXHRcdHRoaXMuX2RvbU5vZGUuYXBwZW5kQ2hpbGQoYXJyb3cpO1xuXG5cdFx0Ly8gRXZlbnQgaGFuZGxlcnNcblx0XHR0aGlzLl9zZXR1cEV2ZW50SGFuZGxlcnMoKTtcblxuXHRcdC8vIEFkZCB2aXNpYmxlIGNsYXNzIGZvciBpbml0aWFsIGRpc3BsYXlcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblxuXHRcdC8vIEFkZCB0byBlZGl0b3Jcblx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwRXZlbnRIYW5kbGVycygpOiB2b2lkIHtcblx0XHQvLyBUb2dnbGUgYnV0dG9uIGNsaWNrIC0gZXhwYW5kL2NvbGxhcHNlXG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RvZ2dsZUJ1dHRvbiwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl90b2dnbGVFeHBhbmRlZCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhlYWRlciBjbGljayAtIGFsc28gdG9nZ2xlcyBleHBhbmQvY29sbGFwc2Vcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faGVhZGVyTm9kZSwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdG9nZ2xlRXhwYW5kZWQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFc2NhcGUgaW5zaWRlIGEgdGV4dGFyZWEgaXMgaGFuZGxlZCB0aGVyZSBhbmQgc3RvcHMgcHJvcGFnYXRpbmcsIHNvIHRoaXMgb25seSBmaXJlcyBmcm9tIHRoZSB3aWRnZXQgY2hyb21lLlxuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgIT09IEtleUNvZGUuRXNjYXBlIHx8ICF0aGlzLl9jYW5jZWxBY3RpdmVJbnB1dHMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbG9zZXMgZXZlcnkgb3BlbiBlZGl0IC8gcmVwbHkgY29tcG9zZXIuIFJldHVybnMgd2hldGhlciBhbnkgd2FzIG9wZW4uXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5jZWxBY3RpdmVJbnB1dHMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2FuY2VscyA9IFsuLi50aGlzLl9hY3RpdmVFZGl0SW5wdXRzLnZhbHVlcygpLCAuLi50aGlzLl9hY3RpdmVSZXBseUlucHV0cy52YWx1ZXMoKV0ubWFwKGlucHV0ID0+IGlucHV0LmNhbmNlbCk7XG5cdFx0Zm9yIChjb25zdCBjYW5jZWwgb2YgY2FuY2Vscykge1xuXHRcdFx0Y2FuY2VsKCk7XG5cdFx0fVxuXHRcdHJldHVybiBjYW5jZWxzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREcmFmdChjb21tZW50SWQ6IHN0cmluZywga2luZDogQ29tcG9zZXJLaW5kLCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wb3NlckRyYWZ0U3RhdGU/LmRyYWZ0cy5zZXQoY29tbWVudElkLCB7IGtpbmQsIHRleHQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckRyYWZ0KGNvbW1lbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb21wb3NlckRyYWZ0U3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY29tcG9zZXJEcmFmdFN0YXRlLmRyYWZ0cy5kZWxldGUoY29tbWVudElkKTtcblx0XHRpZiAodGhpcy5fY29tcG9zZXJEcmFmdFN0YXRlLmZvY3VzZWRDb21tZW50SWQgPT09IGNvbW1lbnRJZCkge1xuXHRcdFx0dGhpcy5fY29tcG9zZXJEcmFmdFN0YXRlLmZvY3VzZWRDb21tZW50SWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBjb21wb3NlciBzaG91bGQgdGFrZSBmb2N1czogYWx3YXlzIGZvciBhbiBleHBsaWNpdCB1c2VyIGFjdGlvbixcblx0ICogYW5kIGZvciBhIHJlc3RvcmVkIGRyYWZ0IG9ubHkgaWYgaXQgaGFkIGZvY3VzIHdoZW4gdGhlIHdpZGdldCB3YXMgcmVidWlsdC5cblx0ICovXG5cdHByaXZhdGUgX3Nob3VsZEZvY3VzQ29tcG9zZXIoY29tbWVudElkOiBzdHJpbmcsIHJlc3RvcmVkVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHJlc3RvcmVkVGV4dCA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuX2NvbXBvc2VyRHJhZnRTdGF0ZT8uZm9jdXNlZENvbW1lbnRJZCA9PT0gY29tbWVudElkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDb21wb3Nlcih0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBvc2VyVG9Gb2N1cyA9IHRleHRhcmVhO1xuXHRcdGlmICh0ZXh0YXJlYS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0dGhpcy5yZXN0b3JlQ29tcG9zZXJGb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZUV4cGFuZGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0V4cGFuZGVkKSB7XG5cdFx0XHR0aGlzLmNvbGxhcHNlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXhwYW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLl9jb21tZW50SXRlbXMubGVuZ3RoO1xuXHRcdGlmIChjb3VudCA9PT0gMSkge1xuXHRcdFx0dGhpcy5fdGl0bGVOb2RlLnRleHRDb250ZW50ID0gdGhpcy5fY29tbWVudEl0ZW1zWzBdLnRleHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3RpdGxlTm9kZS50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbkNvbW1lbnRzJywgXCJ7MH0gY29tbWVudHNcIiwgY291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUodGhpcy5fdG9nZ2xlQnV0dG9uKTtcblx0XHRpZiAodGhpcy5faXNFeHBhbmRlZCkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlQnV0dG9uLmFwcGVuZENoaWxkKHJlbmRlckljb24oQ29kaWNvbi5jaGV2cm9uVXApKTtcblx0XHRcdHRoaXMuX3RvZ2dsZUJ1dHRvbi50aXRsZSA9IG5scy5sb2NhbGl6ZSgnY29sbGFwc2UnLCBcIkNvbGxhcHNlXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0XHR0aGlzLl90b2dnbGVCdXR0b24udGl0bGUgPSBubHMubG9jYWxpemUoJ2V4cGFuZCcsIFwiRXhwYW5kXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkRmVlZGJhY2tJdGVtcygpOiB2b2lkIHtcblx0XHRjbGVhck5vZGUodGhpcy5fYm9keU5vZGUpO1xuXHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGl2ZVJlcGx5SW5wdXRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fYWN0aXZlRWRpdElucHV0cy5jbGVhcigpO1xuXHRcdHRoaXMuX2FjdGlvbkJhckVsZW1lbnRzLmNsZWFyKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNvbW1lbnQgb2YgdGhpcy5fY29tbWVudEl0ZW1zKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtJyk7XG5cdFx0XHRpdGVtLmNsYXNzTGlzdC5hZGQoYGFnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtLSR7Y29tbWVudC5zb3VyY2V9YCk7XG5cdFx0XHRpZiAoY29tbWVudC5zdWdnZXN0aW9uKSB7XG5cdFx0XHRcdGl0ZW0uY2xhc3NMaXN0LmFkZCgnYWdlbnQtZmVlZGJhY2std2lkZ2V0LWl0ZW0tc3VnZ2VzdGlvbicpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faXRlbUVsZW1lbnRzLnNldChjb21tZW50LmlkLCBpdGVtKTtcblxuXHRcdFx0Y29uc3QgaXRlbUhlYWRlciA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtaXRlbS1oZWFkZXInKTtcblx0XHRcdGNvbnN0IGl0ZW1NZXRhID0gJCgnZGl2LmFnZW50LWZlZWRiYWNrLXdpZGdldC1pdGVtLW1ldGEnKTtcblxuXHRcdFx0Y29uc3QgbGluZUluZm8gPSAkKCdzcGFuLmFnZW50LWZlZWRiYWNrLXdpZGdldC1saW5lLWluZm8nKTtcblx0XHRcdGlmIChjb21tZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gY29tbWVudC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGxpbmVJbmZvLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdsaW5lTnVtYmVyJywgXCJMaW5lIHswfVwiLCBjb21tZW50LnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsaW5lSW5mby50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnbGluZVJhbmdlJywgXCJMaW5lcyB7MH0tezF9XCIsIGNvbW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb21tZW50LnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdFx0aXRlbU1ldGEuYXBwZW5kQ2hpbGQobGluZUluZm8pO1xuXG5cdFx0XHRjb25zdCB0eXBlTGFiZWwgPSB0aGlzLl9nZXRUeXBlTGFiZWwoY29tbWVudCk7XG5cdFx0XHRpZiAodHlwZUxhYmVsKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGVCYWRnZSA9ICQoJ3NwYW4uYWdlbnQtZmVlZGJhY2std2lkZ2V0LWl0ZW0tdHlwZScpO1xuXHRcdFx0XHR0eXBlQmFkZ2UudGV4dENvbnRlbnQgPSB0eXBlTGFiZWw7XG5cdFx0XHRcdGl0ZW1NZXRhLmFwcGVuZENoaWxkKHR5cGVCYWRnZSk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW1IZWFkZXIuYXBwZW5kQ2hpbGQoaXRlbU1ldGEpO1xuXG5cdFx0XHRjb25zdCBhY3Rpb25CYXJDb250YWluZXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWl0ZW0tYWN0aW9ucycpO1xuXHRcdFx0Y29uc3QgYWN0aW9uQmFyID0gdGhpcy5fZXZlbnRTdG9yZS5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25CYXJDb250YWluZXIpKTtcblxuXHRcdFx0Y29uc3QgaXRlbUFjdGlvbnM6IElDb21tZW50SXRlbUFjdGlvbnMgPSB7IGVkaXRBY3Rpb246IHVuZGVmaW5lZCEsIHJlbW92ZUFjdGlvbjogdW5kZWZpbmVkISwgYWRkUmVwbHlBY3Rpb246IHVuZGVmaW5lZCEgfTtcblxuXHRcdFx0aXRlbUFjdGlvbnMuYWRkUmVwbHlBY3Rpb24gPSB0aGlzLl9ldmVudFN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnYWdlbnRGZWVkYmFjay53aWRnZXQuYWRkUmVwbHknLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2FkZFRvQ29tbWVudCcsIFwiQWRkIHRvIENvbW1lbnRcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uKSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCk6IHZvaWQgPT4geyB0aGlzLl9zdGFydEFkZGluZ1JlcGx5KGNvbW1lbnQsIGl0ZW0sIGl0ZW1BY3Rpb25zKTsgfSxcblx0XHRcdCkpO1xuXHRcdFx0YWN0aW9uQmFyLnB1c2goaXRlbUFjdGlvbnMuYWRkUmVwbHlBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0XHRpdGVtQWN0aW9ucy5lZGl0QWN0aW9uID0gdGhpcy5fZXZlbnRTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdFx0J2FnZW50RmVlZGJhY2sud2lkZ2V0LmVkaXQnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRDb21tZW50JywgXCJFZGl0XCIpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5lZGl0KSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0KCk6IHZvaWQgPT4geyB0aGlzLl9zdGFydEVkaXRpbmcoY29tbWVudCwgdGV4dCwgaXRlbUFjdGlvbnMpOyB9LFxuXHRcdFx0KSk7XG5cdFx0XHRhY3Rpb25CYXIucHVzaChpdGVtQWN0aW9ucy5lZGl0QWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdFx0Ly8gQ29tbWVudHMgdGhhdCBjYW4gYmUgYWNjZXB0ZWQgXHUyMDE0IGVpdGhlciBjb252ZXJ0aWJsZSBQUiByZXZpZXdcblx0XHRcdC8vIGNvbW1lbnRzIG9yIGBjcmVhdGVkYCBhZ2VudCBmZWVkYmFjayBcdTIwMTQgcmVuZGVyIHRoZWlyIEFjY2VwdCAvXG5cdFx0XHQvLyBSZW1vdmUgYWZmb3JkYW5jZXMgaW4gdGhlIGFsd2F5cy12aXNpYmxlIGJvdHRvbSBidXR0b24gYmFyLCBzb1xuXHRcdFx0Ly8gdGhvc2UgYWN0aW9ucyBhcmUgb21pdHRlZCBmcm9tIHRoZSBob3ZlciB0b29sYmFyIHRvIGF2b2lkIGFcblx0XHRcdC8vIGR1cGxpY2F0ZSBhZmZvcmRhbmNlLiBUaGUgY29udmVydCAoXCJBY2NlcHRcIikgYWN0aW9uIGlzIG5ldmVyXG5cdFx0XHQvLyBzaG93biBpbiB0aGUgaG92ZXIgdG9vbGJhci5cblx0XHRcdGNvbnN0IHNob3dBY3Rpb25CdXR0b25zQmFyID0gY29tbWVudC5jYW5Db252ZXJ0VG9BZ2VudEZlZWRiYWNrXG5cdFx0XHRcdHx8IChjb21tZW50LnNvdXJjZSA9PT0gU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuQWdlbnRGZWVkYmFjayAmJiBjb21tZW50LnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQ3JlYXRlZCk7XG5cblx0XHRcdGl0ZW1BY3Rpb25zLnJlbW92ZUFjdGlvbiA9IHRoaXMuX2V2ZW50U3RvcmUuYWRkKG5ldyBBY3Rpb24oXG5cdFx0XHRcdCdhZ2VudEZlZWRiYWNrLndpZGdldC5yZW1vdmUnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbW92ZUNvbW1lbnQnLCBcIlJlbW92ZVwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9yZW1vdmVDb21tZW50KGNvbW1lbnQpLFxuXHRcdFx0KSk7XG5cdFx0XHRpZiAoIXNob3dBY3Rpb25CdXR0b25zQmFyKSB7XG5cdFx0XHRcdGFjdGlvbkJhci5wdXNoKGl0ZW1BY3Rpb25zLnJlbW92ZUFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW1IZWFkZXIuYXBwZW5kQ2hpbGQoYWN0aW9uQmFyQ29udGFpbmVyKTtcblx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQoaXRlbUhlYWRlcik7XG5cblx0XHRcdGNvbnN0IHRleHQgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXRleHQnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhjb21tZW50LnRleHQpKTtcblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKHJlbmRlcmVkKTtcblx0XHRcdHRleHQuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0XHRpdGVtLmFwcGVuZENoaWxkKHRleHQpO1xuXG5cdFx0XHRpZiAoY29tbWVudC5zdWdnZXN0aW9uPy5lZGl0cy5sZW5ndGgpIHtcblx0XHRcdFx0aXRlbS5hcHBlbmRDaGlsZCh0aGlzLl9yZW5kZXJTdWdnZXN0aW9uKGNvbW1lbnQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1lbnQucmVwbGllcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGl0ZW0uYXBwZW5kQ2hpbGQodGhpcy5fcmVuZGVyUmVwbGllcyhjb21tZW50LnJlcGxpZXMpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNob3dBY3Rpb25CdXR0b25zQmFyKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFjdGlvbkJ1dHRvbnMoY29tbWVudCwgaXRlbSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLCAnbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdFx0dGhpcy5faGlnaGxpZ2h0UmFuZ2UoY29tbWVudCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLCAnbW91c2VsZWF2ZScsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpdGVtLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0XHRpZiAodGFyZ2V0Py5jbG9zZXN0KCcuYWN0aW9uLWJhcicpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIERvbid0IHRyaWdnZXIgbmF2aWdhdGlvbiB3aGVuIGludGVyYWN0aW5nIHdpdGggdGhlIHJlcGx5IGlucHV0LlxuXHRcdFx0XHRpZiAodGFyZ2V0Py5jbG9zZXN0KCcuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWFkZC1yZXBseScpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIERvbid0IG5hdmlnYXRlIHdoZW4gcGxhY2luZyB0aGUgY2FyZXQgaW4gYSBjb21wb3Nlci5cblx0XHRcdFx0aWYgKGlzVGV4dElucHV0VGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRG9uJ3QgbmF2aWdhdGUgaWYgdGhlIHVzZXIganVzdCBzZWxlY3RlZCB0ZXh0IGluc2lkZSB0aGUgY29tbWVudC5cblx0XHRcdFx0aWYgKHRhcmdldD8uY2xvc2VzdCgnLmFnZW50LWZlZWRiYWNrLXdpZGdldC10ZXh0LCAuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXN1Z2dlc3Rpb24tdGV4dCwgLmFnZW50LWZlZWRiYWNrLXdpZGdldC1yZXBseS10ZXh0JykpIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9kb21Ob2RlLm93bmVyRG9jdW1lbnQuZGVmYXVsdFZpZXc/LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0NvbGxhcHNlZCAmJiB0aGlzLl9kb21Ob2RlLmNvbnRhaW5zKHNlbGVjdGlvbi5hbmNob3JOb2RlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmZvY3VzRmVlZGJhY2soY29tbWVudC5pZCk7XG5cdFx0XHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLnNldE5hdmlnYXRpb25BbmNob3IodGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50LmlkKTtcblx0XHRcdFx0dGhpcy5fcmV2ZWFsQ29tbWVudChjb21tZW50KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gUHVsbCBmb2N1cyB0byB0aGUgd2lkZ2V0IHdoZW4gc3RhcnRpbmcgYSBzZWxlY3Rpb24gaW4gc2VsZWN0YWJsZVxuXHRcdFx0Ly8gcmVnaW9ucyBzbyB0aGF0IEN0cmwvQ21kK0MgY29waWVzIHRoZSBET00gc2VsZWN0aW9uIGluc3RlYWQgb2Zcblx0XHRcdC8vIHRyaWdnZXJpbmcgdGhlIGVkaXRvcidzIGNvcHkgYWN0aW9uLlxuXHRcdFx0Y29uc3Qgb25TZWxlY3RhYmxlTW91c2Vkb3duID0gKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0XHQvLyBTdGVhbGluZyBmb2N1cyBoZXJlIHdvdWxkIGJsdXIgdGhlIGNvbXBvc2VyIHRoZSB1c2VyIGlzIGNsaWNraW5nIGludG8uXG5cdFx0XHRcdGlmIChpc1RleHRJbnB1dFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0YXJnZXQ/LmNsb3Nlc3QoJy5hZ2VudC1mZWVkYmFjay13aWRnZXQtdGV4dCwgLmFnZW50LWZlZWRiYWNrLXdpZGdldC1zdWdnZXN0aW9uLXRleHQsIC5hZ2VudC1mZWVkYmFjay13aWRnZXQtcmVwbHktdGV4dCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZG9tTm9kZS5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoaXRlbSwgJ21vdXNlZG93bicsIG9uU2VsZWN0YWJsZU1vdXNlZG93bikpO1xuXG5cdFx0XHR0aGlzLl9ib2R5Tm9kZS5hcHBlbmRDaGlsZChpdGVtKTtcblxuXHRcdFx0Ly8gUmVzdG9yZSBhbiBpbi1wcm9ncmVzcyBjb21wb3NlciBzbyBkcmFmdHMgc3Vydml2ZSB3aWRnZXQgcmVidWlsZHMuXG5cdFx0XHRjb25zdCBkcmFmdCA9IHRoaXMuX2NvbXBvc2VyRHJhZnRTdGF0ZT8uZHJhZnRzLmdldChjb21tZW50LmlkKTtcblx0XHRcdGlmIChkcmFmdD8ua2luZCA9PT0gQ29tcG9zZXJLaW5kLlJlcGx5KSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0QWRkaW5nUmVwbHkoY29tbWVudCwgaXRlbSwgaXRlbUFjdGlvbnMsIGRyYWZ0LnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChkcmFmdD8ua2luZCA9PT0gQ29tcG9zZXJLaW5kLkVkaXQpIHtcblx0XHRcdFx0dGhpcy5fc3RhcnRFZGl0aW5nKGNvbW1lbnQsIHRleHQsIGl0ZW1BY3Rpb25zLCBkcmFmdC50ZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUeXBlTGFiZWwoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKGNvbW1lbnQua2luZCkge1xuXHRcdFx0Y2FzZSBBZ2VudEZlZWRiYWNrS2luZC5QUlJldmlldzpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncHJSZXZpZXdDb21tZW50JywgXCJQUiBSZXZpZXdcIik7XG5cdFx0XHRjYXNlIEFnZW50RmVlZGJhY2tLaW5kLkFnZW50UmV2aWV3OlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhZ2VudFJldmlld0NvbW1lbnQnLCBcIkFnZW50IFJldmlld1wiKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU3VnZ2VzdGlvbihjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbk5vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXN1Z2dlc3Rpb24nKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdCBvZiBjb21tZW50LnN1Z2dlc3Rpb24/LmVkaXRzID8/IFtdKSB7XG5cdFx0XHRjb25zdCBlZGl0Tm9kZSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtc3VnZ2VzdGlvbi1lZGl0Jyk7XG5cblx0XHRcdGNvbnN0IGhlYWRlciA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtc3VnZ2VzdGlvbi1oZWFkZXInKTtcblx0XHRcdGlmIChlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGhlYWRlci50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdGVkQ2hhbmdlTGluZScsIFwiU3VnZ2VzdGVkIENoYW5nZSBcXHUyMDIyIExpbmUgezB9XCIsIGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhlYWRlci50ZXh0Q29udGVudCA9IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdGVkQ2hhbmdlTGluZXMnLCBcIlN1Z2dlc3RlZCBDaGFuZ2UgXFx1MjAyMiBMaW5lcyB7MH0tezF9XCIsIGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlZGl0LnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdFx0ZWRpdE5vZGUuYXBwZW5kQ2hpbGQoaGVhZGVyKTtcblxuXHRcdFx0Y29uc3QgbmV3VGV4dCA9ICQoJ3ByZS5hZ2VudC1mZWVkYmFjay13aWRnZXQtc3VnZ2VzdGlvbi10ZXh0Jyk7XG5cdFx0XHRuZXdUZXh0LnRleHRDb250ZW50ID0gZWRpdC5uZXdUZXh0O1xuXHRcdFx0ZWRpdE5vZGUuYXBwZW5kQ2hpbGQobmV3VGV4dCk7XG5cdFx0XHRzdWdnZXN0aW9uTm9kZS5hcHBlbmRDaGlsZChlZGl0Tm9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyUmVwbGllcyhyZXBsaWVzOiByZWFkb25seSBzdHJpbmdbXSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByZXBsaWVzTm9kZSA9ICQoJ2Rpdi5hZ2VudC1mZWVkYmFjay13aWRnZXQtcmVwbGllcycpO1xuXG5cdFx0Zm9yIChjb25zdCByZXBseSBvZiByZXBsaWVzKSB7XG5cdFx0XHRjb25zdCByZXBseU5vZGUgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXJlcGx5Jyk7XG5cdFx0XHRjb25zdCByZXBseVRleHQgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LXJlcGx5LXRleHQnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhyZXBseSkpO1xuXHRcdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQocmVuZGVyZWQpO1xuXHRcdFx0cmVwbHlUZXh0LmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0cmVwbHlOb2RlLmFwcGVuZENoaWxkKHJlcGx5VGV4dCk7XG5cdFx0XHRyZXBsaWVzTm9kZS5hcHBlbmRDaGlsZChyZXBseU5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXBsaWVzTm9kZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSBBY2NlcHQgLyBSZW1vdmUgYnV0dG9uIGJhciBzaG93biBhdCB0aGUgYm90dG9tIG9mIGFcblx0ICogYGNyZWF0ZWRgIGFnZW50IGZlZWRiYWNrIGNvbW1lbnQgb3IgYSBQUiByZXZpZXcgY29tbWVudC4gQ2xpY2tpbmcgZWl0aGVyXG5cdCAqIGJ1dHRvbiBwZXJmb3JtcyB0aGUgYWN0aW9uIGFuZCByZW1vdmVzIHRoZSBiYXIuIEZvciBQUiByZXZpZXcgY29tbWVudHNcblx0ICogXCJBY2NlcHRcIiBjb252ZXJ0cyB0aGUgY29tbWVudCBpbnRvIGFnZW50IGZlZWRiYWNrOyBmb3IgYWdlbnQgZmVlZGJhY2sgaXRcblx0ICogbWFya3MgdGhlIGNvbW1lbnQgYXMgYWNjZXB0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJBY3Rpb25CdXR0b25zKGNvbW1lbnQ6IElTZXNzaW9uRWRpdG9yQ29tbWVudCwgaXRlbTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBidXR0b25CYXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWFjdGlvbnMtYmFyJyk7XG5cblx0XHRjb25zdCBidXR0b25TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChidXR0b25TdG9yZSk7XG5cblx0XHQvLyBQcmV2ZW50IGNsaWNrcyBvbiB0aGUgYnV0dG9uIGJhciBmcm9tIGJ1YmJsaW5nIHVwIHRvIHRoZSBpdGVtIGNsaWNrXG5cdFx0Ly8gaGFuZGxlciAod2hpY2ggd291bGQgbmF2aWdhdGUvcmV2ZWFsIHRoZSBjb21tZW50KS5cblx0XHRidXR0b25TdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbkJhciwgJ2NsaWNrJywgZSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKSk7XG5cblx0XHRjb25zdCBkaXNtaXNzID0gKCkgPT4ge1xuXHRcdFx0YnV0dG9uU3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0YnV0dG9uQmFyLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fYWN0aW9uQmFyRWxlbWVudHMuZGVsZXRlKGNvbW1lbnQuaWQpO1xuXHRcdFx0Ly8gTW92ZSBmb2N1cyBiYWNrIHRvIHRoZSB3aWRnZXQgc28ga2V5Ym9hcmQvc2NyZWVuIHJlYWRlciB1c2Vyc1xuXHRcdFx0Ly8gZG9uJ3QgbG9zZSB0aGVpciBwbGFjZSB3aGVuIHRoZSAobm93IHJlbW92ZWQpIGJ1dHRvbiBpcyBnb25lLlxuXHRcdFx0dGhpcy5fZG9tTm9kZS5mb2N1cyh7IHByZXZlbnRTY3JvbGw6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNQUkNvbW1lbnQgPSBjb21tZW50LnNvdXJjZSA9PT0gU2Vzc2lvbkVkaXRvckNvbW1lbnRTb3VyY2UuUFJSZXZpZXc7XG5cdFx0Y29uc3QgYWNjZXB0VG9vbHRpcCA9IGlzUFJDb21tZW50XG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnYWNjZXB0UFJGZWVkYmFja1Rvb2x0aXAnLCBcIlNoYXJlIFBSIGNvbW1lbnQgd2l0aCBhZ2VudFwiKVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ2FjY2VwdEFnZW50RmVlZGJhY2tUb29sdGlwJywgXCJTaGFyZSBjb21tZW50IHdpdGggYWdlbnRcIik7XG5cdFx0Y29uc3QgZGVsZXRlVG9vbHRpcCA9IGlzUFJDb21tZW50XG5cdFx0XHQ/IG5scy5sb2NhbGl6ZSgnZGVsZXRlUFJGZWVkYmFja1Rvb2x0aXAnLCBcIlJlbW92ZSBhbmQgbWFyayBhcyByZXNvbHZlZCBvbiBHaXRIdWJcIilcblx0XHRcdDogbmxzLmxvY2FsaXplKCdkZWxldGVBZ2VudEZlZWRiYWNrVG9vbHRpcCcsIFwiUmVtb3ZlIGFnZW50IGNvbW1lbnRcIik7XG5cblx0XHRjb25zdCBhY2NlcHRCdXR0b24gPSBidXR0b25TdG9yZS5hZGQobmV3IEJ1dHRvbihidXR0b25CYXIsIHtcblx0XHRcdHRpdGxlOiBhY2NlcHRUb29sdGlwLFxuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogJ3ZhcigtLXZzY29kZS1jaGFydHMtcHVycGxlKScsXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6ICdjb2xvci1taXgoaW4gc3JnYiwgdmFyKC0tdnNjb2RlLWNoYXJ0cy1wdXJwbGUpIDg1JSwgdmFyKC0tdnNjb2RlLWZvcmVncm91bmQpKScsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1mb3JlZ3JvdW5kKScsXG5cdFx0XHRidXR0b25Cb3JkZXI6ICd2YXIoLS12c2NvZGUtY2hhcnRzLXB1cnBsZSknLFxuXHRcdH0pKTtcblx0XHRhY2NlcHRCdXR0b24ubGFiZWwgPSBubHMubG9jYWxpemUoJ2FjY2VwdEZlZWRiYWNrQnV0dG9uJywgXCJBY2NlcHRcIik7XG5cdFx0YnV0dG9uU3RvcmUuYWRkKGFjY2VwdEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdGlmIChjb21tZW50LmNhbkNvbnZlcnRUb0FnZW50RmVlZGJhY2spIHtcblx0XHRcdFx0dGhpcy5fY29udmVydFRvQWdlbnRGZWVkYmFjayhjb21tZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdEZlZWRiYWNrKGNvbW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0ZGlzbWlzcygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRlbGV0ZUJ1dHRvbiA9IGJ1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKGJ1dHRvbkJhciwge1xuXHRcdFx0dGl0bGU6IGRlbGV0ZVRvb2x0aXAsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCYWNrZ3JvdW5kKScsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6ICd2YXIoLS12c2NvZGUtYnV0dG9uLXNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCknLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogJ3ZhcigtLXZzY29kZS1idXR0b24tc2Vjb25kYXJ5Rm9yZWdyb3VuZCknLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiAndmFyKC0tdnNjb2RlLWJ1dHRvbi1zZWNvbmRhcnlCb3JkZXIpJyxcblx0XHR9KSk7XG5cdFx0ZGVsZXRlQnV0dG9uLmxhYmVsID0gbmxzLmxvY2FsaXplKCdkZWxldGVGZWVkYmFja0J1dHRvbicsIFwiRGVsZXRlXCIpO1xuXHRcdGJ1dHRvblN0b3JlLmFkZChkZWxldGVCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW1vdmVDb21tZW50KGNvbW1lbnQpO1xuXHRcdFx0ZGlzbWlzcygpO1xuXHRcdH0pKTtcblxuXHRcdGl0ZW0uYXBwZW5kQ2hpbGQoYnV0dG9uQmFyKTtcblx0XHR0aGlzLl9hY3Rpb25CYXJFbGVtZW50cy5zZXQoY29tbWVudC5pZCwgYnV0dG9uQmFyKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNvbW1lbnQoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogdm9pZCB7XG5cdFx0aWYgKGNvbW1lbnQuc291cmNlID09PSBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5QUlJldmlldykge1xuXHRcdFx0dGhpcy5fY29kZVJldmlld1NlcnZpY2UucmVzb2x2ZVBSUmV2aWV3VGhyZWFkKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSEsIGNvbW1lbnQuc291cmNlSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLnJlbW92ZUZlZWRiYWNrKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5zb3VyY2VJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydEVkaXRpbmcoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCB0ZXh0Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgYWN0aW9uczogSUNvbW1lbnRJdGVtQWN0aW9ucywgcmVzdG9yZWRUZXh0Pzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9hY3RpdmVFZGl0SW5wdXRzLmdldChjb21tZW50LmlkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLnRleHRhcmVhLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzYWJsZSBhbGwgYWN0aW9ucyB3aGlsZSBlZGl0aW5nXG5cdFx0YWN0aW9ucy5lZGl0QWN0aW9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRhY3Rpb25zLnJlbW92ZUFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0YWN0aW9ucy5hZGRSZXBseUFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBlZGl0U3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZXZlbnRTdG9yZS5hZGQoZWRpdFN0b3JlKTtcblxuXHRcdGNsZWFyTm9kZSh0ZXh0Q29udGFpbmVyKTtcblx0XHR0ZXh0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2VkaXRpbmcnKTtcblxuXHRcdGNvbnN0IHRleHRhcmVhID0gJCgndGV4dGFyZWEuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWVkaXQtdGV4dGFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRcdHRleHRhcmVhLnZhbHVlID0gcmVzdG9yZWRUZXh0ID8/IGNvbW1lbnQudGV4dDtcblx0XHR0ZXh0YXJlYS5yb3dzID0gMTtcblx0XHR0ZXh0Q29udGFpbmVyLmFwcGVuZENoaWxkKHRleHRhcmVhKTtcblxuXHRcdHRoaXMuX2FjdGl2ZUVkaXRJbnB1dHMuc2V0KGNvbW1lbnQuaWQsIHtcblx0XHRcdHRleHRhcmVhLFxuXHRcdFx0Y2FuY2VsOiAoKSA9PiB0aGlzLl9zdG9wRWRpdGluZyhjb21tZW50LCB0ZXh0Q29udGFpbmVyLCBlZGl0U3RvcmUsIGFjdGlvbnMpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3NldERyYWZ0KGNvbW1lbnQuaWQsIENvbXBvc2VyS2luZC5FZGl0LCB0ZXh0YXJlYS52YWx1ZSk7XG5cblx0XHQvLyBBdXRvLXNpemUgdGhlIHRleHRhcmVhXG5cdFx0Y29uc3QgYXV0b1NpemUgPSAoKSA9PiB7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBgJHt0ZXh0YXJlYS5zY3JvbGxIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0fTtcblx0XHRhdXRvU2l6ZSgpO1xuXG5cdFx0ZWRpdFN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGV4dGFyZWEsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdHRoaXMuX3NldERyYWZ0KGNvbW1lbnQuaWQsIENvbXBvc2VyS2luZC5FZGl0LCB0ZXh0YXJlYS52YWx1ZSk7XG5cdFx0XHRhdXRvU2l6ZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVkaXRpbmcgZW5kcyBvbmx5IG9uIEVudGVyIG9yIEVzY2FwZSBzbyBhbiBpbmNpZGVudGFsIGNsaWNrIG5ldmVyIGRpc2NhcmRzIHRoZSBkcmFmdC5cblx0XHRlZGl0U3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFlLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgbmV3VGV4dCA9IHRleHRhcmVhLnZhbHVlLnRyaW0oKTtcblx0XHRcdFx0aWYgKG5ld1RleHQpIHtcblx0XHRcdFx0XHQvLyBDbGVhciB0aGUgZHJhZnQgZmlyc3Qgc28gdGhlIHJlYnVpbHQgd2lkZ2V0IGRvZXNuJ3QgcmUtb3BlbiB0aGUgY29tcG9zZXIuXG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJEcmFmdChjb21tZW50LmlkKTtcblx0XHRcdFx0XHR0aGlzLl9zYXZlRWRpdChjb21tZW50LCBuZXdUZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zdG9wRWRpdGluZyhjb21tZW50LCB0ZXh0Q29udGFpbmVyLCBlZGl0U3RvcmUsIGFjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Fc2NhcGUpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9zdG9wRWRpdGluZyhjb21tZW50LCB0ZXh0Q29udGFpbmVyLCBlZGl0U3RvcmUsIGFjdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLl9zaG91bGRGb2N1c0NvbXBvc2VyKGNvbW1lbnQuaWQsIHJlc3RvcmVkVGV4dCkpIHtcblx0XHRcdHRoaXMuX2ZvY3VzQ29tcG9zZXIodGV4dGFyZWEpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0QWRkaW5nUmVwbHkoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCBpdGVtTm9kZTogSFRNTEVsZW1lbnQsIGFjdGlvbnM6IElDb21tZW50SXRlbUFjdGlvbnMsIHJlc3RvcmVkVGV4dD86IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIElmIGEgcmVwbHkgaW5wdXQgaXMgYWxyZWFkeSBvcGVuIGZvciB0aGlzIGl0ZW0sIGp1c3QgZm9jdXMgaXQuXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9hY3RpdmVSZXBseUlucHV0cy5nZXQoY29tbWVudC5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy50ZXh0YXJlYS5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERpc2FibGUgaXRlbSBhY3Rpb25zIHdoaWxlIHJlcGx5aW5nIHNvIHRoZSBhY3Rpb24gYmFyIGRvZXNuJ3QgY29uZmxpY3QuXG5cdFx0YWN0aW9ucy5lZGl0QWN0aW9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRhY3Rpb25zLnJlbW92ZUFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cdFx0YWN0aW9ucy5hZGRSZXBseUFjdGlvbi5lbmFibGVkID0gZmFsc2U7XG5cblx0XHRjb25zdCByZXBseVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2V2ZW50U3RvcmUuYWRkKHJlcGx5U3RvcmUpO1xuXG5cdFx0Y29uc3QgcmVwbHlDb250YWluZXIgPSAkKCdkaXYuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWFkZC1yZXBseScpO1xuXHRcdGNvbnN0IHRleHRhcmVhID0gJCgndGV4dGFyZWEuYWdlbnQtZmVlZGJhY2std2lkZ2V0LWVkaXQtdGV4dGFyZWEnKSBhcyBIVE1MVGV4dEFyZWFFbGVtZW50O1xuXHRcdHRleHRhcmVhLnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdhZGRSZXBseVBsYWNlaG9sZGVyJywgXCJBZGQgYSBjb21tZW50XFx1MjAyNlwiKTtcblx0XHR0ZXh0YXJlYS5yb3dzID0gMTtcblx0XHRpZiAocmVzdG9yZWRUZXh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRleHRhcmVhLnZhbHVlID0gcmVzdG9yZWRUZXh0O1xuXHRcdH1cblx0XHRyZXBseUNvbnRhaW5lci5hcHBlbmRDaGlsZCh0ZXh0YXJlYSk7XG5cdFx0Ly8gS2VlcCB0aGUgYWN0aW9uIGJ1dHRvbiBiYXIgKEFjY2VwdC9SZW1vdmUpIGFzIHRoZSB2ZXJ5IGxhc3QgZWxlbWVudCBzb1xuXHRcdC8vIHRoZSByZXBseSBjb21wb3NlciBhcHBlYXJzIGFib3ZlIGl0LlxuXHRcdGNvbnN0IGFjdGlvbnNCYXIgPSB0aGlzLl9hY3Rpb25CYXJFbGVtZW50cy5nZXQoY29tbWVudC5pZCk7XG5cdFx0aWYgKGFjdGlvbnNCYXIpIHtcblx0XHRcdGl0ZW1Ob2RlLmluc2VydEJlZm9yZShyZXBseUNvbnRhaW5lciwgYWN0aW9uc0Jhcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW1Ob2RlLmFwcGVuZENoaWxkKHJlcGx5Q29udGFpbmVyKTtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlUmVwbHlJbnB1dHMuc2V0KGNvbW1lbnQuaWQsIHsgdGV4dGFyZWEsIGNhbmNlbDogKCkgPT4gY2xlYW51cCgpIH0pO1xuXHRcdHRoaXMuX3NldERyYWZ0KGNvbW1lbnQuaWQsIENvbXBvc2VyS2luZC5SZXBseSwgdGV4dGFyZWEudmFsdWUpO1xuXG5cdFx0Y29uc3QgYXV0b1NpemUgPSAoKSA9PiB7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBgJHt0ZXh0YXJlYS5zY3JvbGxIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0fTtcblx0XHRhdXRvU2l6ZSgpO1xuXG5cdFx0cmVwbHlTdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCAnaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXREcmFmdChjb21tZW50LmlkLCBDb21wb3NlcktpbmQuUmVwbHksIHRleHRhcmVhLnZhbHVlKTtcblx0XHRcdGF1dG9TaXplKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHtcblx0XHRcdHJlcGx5U3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0YWN0aW9ucy5lZGl0QWN0aW9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0YWN0aW9ucy5yZW1vdmVBY3Rpb24uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRhY3Rpb25zLmFkZFJlcGx5QWN0aW9uLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fYWN0aXZlUmVwbHlJbnB1dHMuZGVsZXRlKGNvbW1lbnQuaWQpO1xuXHRcdFx0cmVwbHlDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLl9jbGVhckRyYWZ0KGNvbW1lbnQuaWQpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0fTtcblxuXHRcdC8vIFJlcGx5aW5nIGVuZHMgb25seSBvbiBFbnRlciBvciBFc2NhcGUgc28gYW4gaW5jaWRlbnRhbCBjbGljayBuZXZlciBkaXNjYXJkcyB0aGUgZHJhZnQuXG5cdFx0cmVwbHlTdG9yZS5hZGQoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGV4dGFyZWEsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWUuc2hpZnRLZXkpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRjb25zdCBuZXdSZXBseSA9IHRleHRhcmVhLnZhbHVlLnRyaW0oKTtcblx0XHRcdFx0aWYgKG5ld1JlcGx5KSB7XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgdGhlIGRyYWZ0IGZpcnN0IHNvIHRoZSByZWJ1aWx0IHdpZGdldCBkb2Vzbid0IHJlLW9wZW4gdGhlIGNvbXBvc2VyLlxuXHRcdFx0XHRcdHRoaXMuX2NsZWFyRHJhZnQoY29tbWVudC5pZCk7XG5cdFx0XHRcdFx0dGhpcy5fc2F2ZVJlcGx5KGNvbW1lbnQsIG5ld1JlcGx5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkRm9jdXNDb21wb3Nlcihjb21tZW50LmlkLCByZXN0b3JlZFRleHQpKSB7XG5cdFx0XHR0aGlzLl9mb2N1c0NvbXBvc2VyKHRleHRhcmVhKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgY29tcG9zZXIgcmVzdG9yZWQgZnJvbSBhIGRyYWZ0LCBpZiBhbnkuIE11c3QgYmUgY2FsbGVkIG9uY2UgdGhlXG5cdCAqIHdpZGdldCBpcyBpbiB0aGUgRE9NIFx1MjAxNCBmb2N1c2luZyBhIGRldGFjaGVkIGVsZW1lbnQgaGFzIG5vIGVmZmVjdC5cblx0ICovXG5cdHJlc3RvcmVDb21wb3NlckZvY3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRleHRhcmVhID0gdGhpcy5fY29tcG9zZXJUb0ZvY3VzO1xuXHRcdHRoaXMuX2NvbXBvc2VyVG9Gb2N1cyA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRleHRhcmVhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRleHRhcmVhLmZvY3VzKCk7XG5cdFx0Ly8gUGxhY2UgY2FyZXQgYXQgdGhlIGVuZCBzbyB0eXBpbmcgY29udGludWVzIHdoZXJlIHRoZSB1c2VyIGxlZnQgb2ZmLlxuXHRcdHRleHRhcmVhLnNldFNlbGVjdGlvblJhbmdlKHRleHRhcmVhLnZhbHVlLmxlbmd0aCwgdGV4dGFyZWEudmFsdWUubGVuZ3RoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVSZXBseShjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQsIHJlcGx5VGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGNvbW1lbnQuc291cmNlID09PSBTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrKSB7XG5cdFx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5hZGRSZXBseSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnQuc291cmNlSWQsIHJlcGx5VGV4dCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIFBSIHJldmlldyBjb21tZW50cywgY29udmVydCB0byBhZ2VudCBmZWVkYmFjayBmaXJzdCBwcmVzZXJ2aW5nXG5cdFx0Ly8gdGhlIG9yaWdpbmFsIHRleHQsIHRoZW4gYWRkIHRoZSByZXBseSBzbyB0aGF0IHRoZSBvcmlnaW5hbCBjb21tZW50IGFuZFxuXHRcdC8vIHRoZSByZXBseSBsaXZlIGluIHRoZSBzYW1lIHRocmVhZC5cblx0XHRpZiAoIWNvbW1lbnQuY2FuQ29udmVydFRvQWdlbnRGZWVkYmFjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZlZWRiYWNrID0gdGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkRmVlZGJhY2soXG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjb21tZW50LnJlc291cmNlVXJpLFxuXHRcdFx0Y29tbWVudC5yYW5nZSxcblx0XHRcdGNvbW1lbnQudGV4dCxcblx0XHRcdGNvbW1lbnQuc3VnZ2VzdGlvbixcblx0XHRcdGNyZWF0ZUFnZW50RmVlZGJhY2tDb250ZXh0KHRoaXMuX2VkaXRvciwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIGNvbW1lbnQucmVzb3VyY2VVcmksIGNvbW1lbnQucmFuZ2UpLFxuXHRcdFx0Y29tbWVudC5zb3VyY2VJZCxcblx0XHRcdEFnZW50RmVlZGJhY2tLaW5kLlBSUmV2aWV3LFxuXHRcdCk7XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWRkUmVwbHkodGhpcy5fc2Vzc2lvblJlc291cmNlLCBmZWVkYmFjay5pZCwgcmVwbHlUZXh0KTtcblx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5zZXROYXZpZ2F0aW9uQW5jaG9yKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgdG9TZXNzaW9uRWRpdG9yQ29tbWVudElkKFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2ssIGZlZWRiYWNrLmlkKSk7XG5cdFx0dGhpcy5fY29kZVJldmlld1NlcnZpY2UubWFya1BSUmV2aWV3Q29tbWVudENvbnZlcnRlZCh0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnQuc291cmNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZUVkaXQoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCBuZXdUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoY29tbWVudC5zb3VyY2UgPT09IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2spIHtcblx0XHRcdHRoaXMuX2FnZW50RmVlZGJhY2tTZXJ2aWNlLnVwZGF0ZUZlZWRiYWNrKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5zb3VyY2VJZCwgbmV3VGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFBSIHJldmlldyBhbmQgY29kZSByZXZpZXcgY29tbWVudHMgYXJlIGNvbnZlcnRlZCB0byBhZ2VudCBmZWVkYmFjayBvbiBlZGl0XG5cdFx0XHR0aGlzLl9jb252ZXJ0VG9BZ2VudEZlZWRiYWNrV2l0aFRleHQoY29tbWVudCwgbmV3VGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcEVkaXRpbmcoY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50LCB0ZXh0Q29udGFpbmVyOiBIVE1MRWxlbWVudCwgZWRpdFN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIGFjdGlvbnM6IElDb21tZW50SXRlbUFjdGlvbnMpOiB2b2lkIHtcblx0XHRlZGl0U3RvcmUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2FjdGl2ZUVkaXRJbnB1dHMuZGVsZXRlKGNvbW1lbnQuaWQpO1xuXHRcdHRoaXMuX2NsZWFyRHJhZnQoY29tbWVudC5pZCk7XG5cblx0XHQvLyBSZS1lbmFibGUgYWN0aW9uc1xuXHRcdGFjdGlvbnMuZWRpdEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRhY3Rpb25zLnJlbW92ZUFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRhY3Rpb25zLmFkZFJlcGx5QWN0aW9uLmVuYWJsZWQgPSB0cnVlO1xuXG5cdFx0dGV4dENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdlZGl0aW5nJyk7XG5cdFx0Y2xlYXJOb2RlKHRleHRDb250YWluZXIpO1xuXHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhjb21tZW50LnRleHQpKTtcblx0XHR0aGlzLl9ldmVudFN0b3JlLmFkZChyZW5kZXJlZCk7XG5cdFx0dGV4dENvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRUb0FnZW50RmVlZGJhY2soY29tbWVudDogSVNlc3Npb25FZGl0b3JDb21tZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udmVydFRvQWdlbnRGZWVkYmFja1dpdGhUZXh0KGNvbW1lbnQsIGNvbW1lbnQudGV4dCk7XG5cdH1cblxuXHQvKipcblx0ICogQWNjZXB0IGEgQ3JlYXRlZCBhZ2VudCBmZWVkYmFjayBpdGVtIHNvIGl0IGJlY29tZXMgc3VibWl0dGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIF9hY2NlcHRGZWVkYmFjayhjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQpOiB2b2lkIHtcblx0XHRpZiAoY29tbWVudC5zb3VyY2UgIT09IFNlc3Npb25FZGl0b3JDb21tZW50U291cmNlLkFnZW50RmVlZGJhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2UuYWNjZXB0RmVlZGJhY2sodGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50LnNvdXJjZUlkKTtcblx0XHR0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5zZXROYXZpZ2F0aW9uQW5jaG9yKHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY29tbWVudC5pZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBub24tYWdlbnQtZmVlZGJhY2sgY29tbWVudCBpbnRvIGFuIGFnZW50IGZlZWRiYWNrIGl0ZW0sIG9wdGlvbmFsbHkgd2l0aCBlZGl0ZWQgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgX2NvbnZlcnRUb0FnZW50RmVlZGJhY2tXaXRoVGV4dChjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQsIHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghY29tbWVudC5jYW5Db252ZXJ0VG9BZ2VudEZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVlZGJhY2sgPSB0aGlzLl9hZ2VudEZlZWRiYWNrU2VydmljZS5hZGRGZWVkYmFjayhcblx0XHRcdHRoaXMuX3Nlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNvbW1lbnQucmVzb3VyY2VVcmksXG5cdFx0XHRjb21tZW50LnJhbmdlLFxuXHRcdFx0dGV4dCxcblx0XHRcdGNvbW1lbnQuc3VnZ2VzdGlvbixcblx0XHRcdGNyZWF0ZUFnZW50RmVlZGJhY2tDb250ZXh0KHRoaXMuX2VkaXRvciwgdGhpcy5fY29kZUVkaXRvclNlcnZpY2UsIGNvbW1lbnQucmVzb3VyY2VVcmksIGNvbW1lbnQucmFuZ2UpLFxuXHRcdFx0Y29tbWVudC5zb3VyY2VJZCxcblx0XHRcdEFnZW50RmVlZGJhY2tLaW5kLlBSUmV2aWV3LFxuXHRcdCk7XG5cdFx0dGhpcy5fYWdlbnRGZWVkYmFja1NlcnZpY2Uuc2V0TmF2aWdhdGlvbkFuY2hvcih0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIHRvU2Vzc2lvbkVkaXRvckNvbW1lbnRJZChTZXNzaW9uRWRpdG9yQ29tbWVudFNvdXJjZS5BZ2VudEZlZWRiYWNrLCBmZWVkYmFjay5pZCkpO1xuXHRcdHRoaXMuX2NvZGVSZXZpZXdTZXJ2aWNlLm1hcmtQUlJldmlld0NvbW1lbnRDb252ZXJ0ZWQodGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50LnNvdXJjZUlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHBhbmQgdGhlIHdpZGdldCBib2R5LlxuXHQgKi9cblx0ZXhwYW5kKCk6IHZvaWQge1xuXHRcdGNvbnN0IHdhc0V4cGFuZGVkID0gdGhpcy5faXNFeHBhbmRlZDtcblx0XHR0aGlzLl9pc0V4cGFuZGVkID0gdHJ1ZTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NvbGxhcHNlZCcpO1xuXHRcdHRoaXMuX2JvZHlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2NvbGxhcHNlZCcpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvZ2dsZUJ1dHRvbigpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdGlmICghd2FzRXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkRXhwYW5kLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNFeHBhbmRlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsYXBzZSB0aGUgd2lkZ2V0IGJvZHkuXG5cdCAqL1xuXHRjb2xsYXBzZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0V4cGFuZGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl9ib2R5Tm9kZS5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzZWQnKTtcblx0XHR0aGlzLl91cGRhdGVUb2dnbGVCdXR0b24oKTtcblx0XHR0aGlzLmNsZWFyRm9jdXMoKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1cyBhIHNwZWNpZmljIGZlZWRiYWNrIGl0ZW0gd2l0aGluIHRoaXMgd2lkZ2V0LlxuXHQgKiBIaWdobGlnaHRzIGl0cyByYW5nZSBpbiB0aGUgZWRpdG9yIGFuZCBtYXJrcyBpdCBhcyBmb2N1c2VkLlxuXHQgKi9cblx0Zm9jdXNGZWVkYmFjayhmZWVkYmFja0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBwcmV2aW91cyBmb2N1c1xuXHRcdGZvciAoY29uc3QgZWwgb2YgdGhpcy5faXRlbUVsZW1lbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRlbC5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1c2VkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVlZGJhY2sgPSB0aGlzLl9jb21tZW50SXRlbXMuZmluZChmID0+IGYuaWQgPT09IGZlZWRiYWNrSWQpO1xuXHRcdGlmICghZmVlZGJhY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBZGQgZm9jdXNlZCBjbGFzcyB0byB0aGUgaXRlbVxuXHRcdGNvbnN0IGl0ZW1FbCA9IHRoaXMuX2l0ZW1FbGVtZW50cy5nZXQoZmVlZGJhY2tJZCk7XG5cdFx0aXRlbUVsPy5jbGFzc0xpc3QuYWRkKCdmb2N1c2VkJyk7XG5cblx0XHQvLyBTaG93IHJhbmdlIGhpZ2hsaWdodGluZ1xuXHRcdHRoaXMuX2hpZ2hsaWdodFJhbmdlKGZlZWRiYWNrKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhciBmb2N1cyBzdGF0ZSBhbmQgcmFuZ2UgaGlnaGxpZ2h0aW5nLlxuXHQgKi9cblx0Y2xlYXJGb2N1cygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVsIG9mIHRoaXMuX2l0ZW1FbGVtZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0ZWwuY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXNlZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9yYW5nZUhpZ2hsaWdodERlY29yYXRpb24uY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZ2hsaWdodFJhbmdlKGZlZWRiYWNrOiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gZmVlZGJhY2sucmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdGZlZWRiYWNrLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSxcblx0XHRcdGVuZExpbmVOdW1iZXIsIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpID8/IDFcblx0XHQpO1xuXHRcdHRoaXMuX3JhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbi5zZXQoW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnYWdlbnQtZmVlZGJhY2stcmFuZ2UtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0XHRjbGFzc05hbWU6ICdyYW5nZUhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdFx0bGluZXNEZWNvcmF0aW9uc0NsYXNzTmFtZTogJ2FnZW50LWZlZWRiYWNrLXdpZGdldC1yYW5nZS1nbHlwaCcsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdhZ2VudC1mZWVkYmFjay1yYW5nZS1oaWdobGlnaHQtb3ZlcnZpZXcnLFxuXHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKG92ZXJ2aWV3UnVsZXJSYW5nZUhpZ2hsaWdodCksXG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuRnVsbCxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhpcyB3aWRnZXQgY29udGFpbnMgdGhlIGdpdmVuIGZlZWRiYWNrIGl0ZW0gKGJ5IGlkKS5cblx0ICovXG5cdGNvbnRhaW5zRmVlZGJhY2soZmVlZGJhY2tJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1lbnRJdGVtcy5zb21lKGYgPT4gZi5pZCA9PT0gZmVlZGJhY2tJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY29tbWVudCBpZCB3aG9zZSBvcGVuIGNvbXBvc2VyIGlzIHRoZSBnaXZlbiBlbGVtZW50LCBvclxuXHQgKiBgdW5kZWZpbmVkYCBpZiBub25lLiBMZXRzIHRoZSBjb250cmlidXRpb24gcmVzdG9yZSBmb2N1cyBhZnRlciBhIHJlYnVpbGQuXG5cdCAqL1xuXHRmaW5kQ29tcG9zZXJDb21tZW50SWRGb3JFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFtjb21tZW50SWQsIHsgdGV4dGFyZWEgfV0gb2YgWy4uLnRoaXMuX2FjdGl2ZUVkaXRJbnB1dHMsIC4uLnRoaXMuX2FjdGl2ZVJlcGx5SW5wdXRzXSkge1xuXHRcdFx0aWYgKHRleHRhcmVhID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybiBjb21tZW50SWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogSWRzIG9mIHRoZSBjb21tZW50cyByZW5kZXJlZCBieSB0aGlzIHdpZGdldC4gVXNlZCBieSB0aGUgY29udHJpYnV0aW9uXG5cdCAqIHRvIHBydW5lIGRyYWZ0IHN0YXRlIGZvciBjb21tZW50cyB0aGF0IG5vIGxvbmdlciBleGlzdC5cblx0ICovXG5cdGdldENvbW1lbnRJZHMoKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb21tZW50SXRlbXMubWFwKGNvbW1lbnQgPT4gY29tbWVudC5pZCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkZ2V0IHBvc2l0aW9uIGFuZCBsYXlvdXQuXG5cdCAqL1xuXHRsYXlvdXQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbnZhbGlkYXRlIHRoZSByZXNlcnZlZC13aWR0aCBjYWNoZSB3aGVuIHRoZSBhbmNob3IgbGluZSBjaGFuZ2VzIHNvIGl0XG5cdFx0Ly8gaXMgcmVjb21wdXRlZCBmb3IgdGhlIG5ldyBsaW5lIGR1cmluZyBgbGF5b3V0T3ZlcmxheVdpZGdldGAgYmVsb3cuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciAhPT0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRNaW5Db250ZW50V2lkdGggPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhcnRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IHsgY29udGVudExlZnQsIGNvbnRlbnRXaWR0aCwgdmVydGljYWxTY3JvbGxiYXJXaWR0aCB9ID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cblx0XHRjb25zdCB3aWRnZXRXaWR0aCA9IGdldFRvdGFsV2lkdGgodGhpcy5fZG9tTm9kZSkgfHwgMjgwO1xuXHRcdGNvbnN0IHdpZGdldEhlaWdodCA9IHRoaXMuX2RvbU5vZGUub2Zmc2V0SGVpZ2h0IHx8IDA7XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5faGVhZGVyTm9kZS5vZmZzZXRIZWlnaHQgfHwgbGluZUhlaWdodDtcblxuXHRcdC8vIEFsaWduIHRoZSBoZWFkZXIgY2VudGVyIHdpdGggdGhlIHN0YXJ0IGxpbmUgY2VudGVyIGJlZm9yZSBjbGFtcGluZyB3aXRoaW4gdGhlIGVkaXRvciBjb250ZW50IGFyZWEuXG5cdFx0Y29uc3QgY29udGVudFJlbGF0aXZlVG9wID0gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKSArIChsaW5lSGVpZ2h0IC0gaGVhZGVySGVpZ2h0KSAvIDI7XG5cdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldFNjcm9sbEhlaWdodCgpO1xuXHRcdGNvbnN0IGNsYW1wZWRDb250ZW50VG9wID0gTWF0aC5taW4oTWF0aC5tYXgoMCwgY29udGVudFJlbGF0aXZlVG9wKSwgTWF0aC5tYXgoMCwgc2Nyb2xsSGVpZ2h0IC0gd2lkZ2V0SGVpZ2h0KSk7XG5cblx0XHR0aGlzLl9wb3NpdGlvbiA9IHtcblx0XHRcdHN0YWNrT3JkaW5hbDogMixcblx0XHRcdHByZWZlcmVuY2U6IHtcblx0XHRcdFx0dG9wOiBjbGFtcGVkQ29udGVudFRvcCAtIHNjcm9sbFRvcCxcblx0XHRcdFx0bGVmdDogY29udGVudExlZnQgKyBjb250ZW50V2lkdGggLSAoMiAqIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggKyB3aWRnZXRXaWR0aClcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3Mgb3IgaGlkZXMgdGhlIHdpZGdldC5cblx0ICovXG5cdHRvZ2dsZShzaG93OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCd2aXNpYmxlJywgc2hvdyk7XG5cdFx0aWYgKHNob3cgJiYgdGhpcy5fY29tbWVudEl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2NvbW1lbnRJdGVtc1swXS5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxheW91dHMgdGhlIHdpZGdldCBhdCBpdHMgY3VycmVudCBsaW5lIG51bWJlci5cblx0ICovXG5cdHJlbGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX3N0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSU92ZXJsYXlXaWRnZXQgaW1wbGVtZW50YXRpb25cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9wb3NpdGlvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNlcnZlIGVub3VnaCBob3Jpem9udGFsIHNjcm9sbCB3aWR0aCBzbyB0aGUgdXNlciBjYW4gYWx3YXlzIHNjcm9sbCB0aGVcblx0ICogZWRpdG9yIGNvbnRlbnQgb3V0IGZyb20gdW5kZXJuZWF0aCB0aGUgd2lkZ2V0LiBUaGUgd2lkZ2V0IGlzIGFuY2hvcmVkIHRvXG5cdCAqIHRoZSByaWdodCBlZGdlIG9mIHRoZSBlZGl0b3IgY29udGVudCBhcmVhLCBzbyB3aXRob3V0IHRoaXMgcmVzZXJ2YXRpb24gYW55XG5cdCAqIGxpbmUgdGhhdCBleHRlbmRzIHVuZGVyIHRoZSB3aWRnZXQgY2Fubm90IGJlIHJldmVhbGVkIGJlY2F1c2UgdGhlIGVkaXRvclxuXHQgKiBjYW5ub3Qgc2Nyb2xsIHBhc3QgaXRzIGxvbmdlc3QgbGluZS5cblx0ICpcblx0ICogVGhlIHJlc2VydmVkIHdpZHRoIGlzIHRoZSB3aWRnZXQgd2lkdGggcGx1cyB0aGUgd2lkZXN0IGNvbnRlbnQgYW1vbmcgdGhlXG5cdCAqIGFuY2hvcmVkIGxpbmUgYW5kIHRoZSBsaW5lcyBpbW1lZGlhdGVseSBhYm92ZSBhbmQgYmVsb3cgaXQuIFRoZSByZXN1bHQgaXNcblx0ICogY29tcHV0ZWQgb25jZSB1c2luZyB0aGUgcmVhbCByZW5kZXJlZCB3aWRnZXQgd2lkdGggYW5kIGNhY2hlZCBhZnRlcndhcmRzLlxuXHQgKiBVbnRpbCB0aGUgd2lkZ2V0IERPTSBub2RlIGhhcyBhIHJlYWwgd2lkdGggd2UgZmFsbCBiYWNrIHRvIGFuIGVzdGltYXRlIGFuZFxuXHQgKiBza2lwIGNhY2hpbmcgc28gdGhlIHZhbHVlIGlzIHJlY29tcHV0ZWQgb25jZSBpdCBpcyBhY3R1YWxseSByZW5kZXJlZC4gVGhlXG5cdCAqIGNhY2hlIGlzIGFsc28gaW52YWxpZGF0ZWQgYnkgYGxheW91dGAgd2hlbmV2ZXIgdGhlIGFuY2hvciBsaW5lIGNoYW5nZXMuXG5cdCAqL1xuXHRnZXRNaW5Db250ZW50V2lkdGhJblB4KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2FjaGVkTWluQ29udGVudFdpZHRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZWRNaW5Db250ZW50V2lkdGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHQvLyBVc2UgdGhlIHJlYWwgcmVuZGVyZWQgd2lkdGggd2hlbiBhdmFpbGFibGUsIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gYW5cblx0XHQvLyBlc3RpbWF0ZS4gV2hlbiBlc3RpbWF0aW5nIHdlIGF2b2lkIGNhY2hpbmcgc28gdGhlIHZhbHVlIGlzIHJlY29tcHV0ZWRcblx0XHQvLyBvbmNlIHRoZSB3aWRnZXQgaGFzIGFjdHVhbGx5IGJlZW4gcmVuZGVyZWQuXG5cdFx0Y29uc3QgcmVuZGVyZWRXaWR0aCA9IGdldFRvdGFsV2lkdGgodGhpcy5fZG9tTm9kZSk7XG5cdFx0Y29uc3QgaGFzUmVuZGVyZWRXaWR0aCA9IHJlbmRlcmVkV2lkdGggPiAwO1xuXHRcdGNvbnN0IHdpZGdldFdpZHRoID0gaGFzUmVuZGVyZWRXaWR0aCA/IHJlbmRlcmVkV2lkdGggOiBBZ2VudEZlZWRiYWNrRWRpdG9yV2lkZ2V0Ll9lc3RpbWF0ZWRXaWRnZXRXaWR0aDtcblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGxldCBtYXhMaW5lV2lkdGggPSAwO1xuXHRcdGxldCBtZWFzdXJlZEFueUxpbmUgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gdGhpcy5fc3RhcnRMaW5lTnVtYmVyIC0gMTsgbGluZU51bWJlciA8PSB0aGlzLl9zdGFydExpbmVOdW1iZXIgKyAxOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gbGluZUNvdW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmV0dXJucyAtMSB3aGVuIHRoZSBsaW5lIGlzIG5vdCBjdXJyZW50bHkgcmVuZGVyZWQ7IGlnbm9yZSB0aG9zZS5cblx0XHRcdGNvbnN0IGxpbmVXaWR0aCA9IHRoaXMuX2VkaXRvci5nZXRXaWR0aE9mTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChsaW5lV2lkdGggPCAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bWVhc3VyZWRBbnlMaW5lID0gdHJ1ZTtcblx0XHRcdGlmIChsaW5lV2lkdGggPiBtYXhMaW5lV2lkdGgpIHtcblx0XHRcdFx0bWF4TGluZVdpZHRoID0gbGluZVdpZHRoO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgdmVydGljYWxTY3JvbGxiYXJXaWR0aCB9ID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRjb25zdCByZXN1bHQgPSBtYXhMaW5lV2lkdGggKyB3aWRnZXRXaWR0aCArIDIgKiB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXG5cdFx0Ly8gT25seSBjYWNoZSBvbmNlIHRoZSBjb21wdXRhdGlvbiBpcyBiYXNlZCBvbiB0aGUgcmVhbCB3aWRnZXQgd2lkdGggYW5kXG5cdFx0Ly8gYXQgbGVhc3Qgb25lIGFuY2hvcmVkIGxpbmUgaGFzIGFjdHVhbGx5IGJlZW4gbWVhc3VyZWQ7IG90aGVyd2lzZSBrZWVwXG5cdFx0Ly8gcmVjb21wdXRpbmcgc28gdGhlIHZhbHVlIHNldHRsZXMgb25jZSBldmVyeXRoaW5nIGlzIHJlbmRlcmVkLlxuXHRcdGlmIChoYXNSZW5kZXJlZFdpZHRoICYmIG1lYXN1cmVkQW55TGluZSkge1xuXHRcdFx0dGhpcy5fY2FjaGVkTWluQ29udGVudFdpZHRoID0gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fcmFuZ2VIaWdobGlnaHREZWNvcmF0aW9uLmNsZWFyKCk7XG5cdFx0dGhpcy5fZWRpdG9yLnJlbW92ZU92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsQ29tbWVudChjb21tZW50OiBJU2Vzc2lvbkVkaXRvckNvbW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdGNvbW1lbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0MSxcblx0XHRcdGNvbW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lTWF4Q29sdW1uKGNvbW1lbnQucmFuZ2UuZW5kTGluZU51bWJlcikgPz8gMSxcblx0XHQpO1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocmFuZ2UsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBRVAsU0FBUyxHQUFHLHVCQUF1QiwrQkFBK0IsV0FBVyxlQUFlLHFCQUFxQjtBQUNqSCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBRzFCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUF1QyxrQkFBa0I7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBC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
