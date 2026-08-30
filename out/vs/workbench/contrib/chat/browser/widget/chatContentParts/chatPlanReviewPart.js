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
import * as dom from "../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { status } from "../../../../../../base/browser/ui/aria/aria.js";
import { Button, ButtonWithDropdown } from "../../../../../../base/browser/ui/button/button.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import Severity from "../../../../../../base/common/severity.js";
import { basename, isEqual } from "../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { localize } from "../../../../../../nls.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { FileChangeType, IFileService } from "../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IAgentEditorCommentsBridge } from "../../../../../services/agentEditorComments/common/agentEditorComments.js";
import { ITextFileService } from "../../../../../services/textfile/common/textfiles.js";
import { IPlanReviewFeedbackService } from "../../planReviewFeedback/planReviewFeedbackService.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { getChatMarkdownRenderOptions } from "../chatContentMarkdownRenderer.js";
import "./media/chatPlanReview.css";
const MARKDOWN_EDITOR_ID = "vscode.markdown.editor";
let ChatPlanReviewPart = class extends Disposable {
  constructor(review, context, _options, _markdownRendererService, _contextMenuService, _dialogService, _editorService, _hoverService, _planReviewFeedbackService, _agentEditorCommentsBridge, _textFileService, _modelService, _fileService) {
    super();
    this.review = review;
    this._options = _options;
    this._markdownRendererService = _markdownRendererService;
    this._contextMenuService = _contextMenuService;
    this._dialogService = _dialogService;
    this._editorService = _editorService;
    this._hoverService = _hoverService;
    this._planReviewFeedbackService = _planReviewFeedbackService;
    this._agentEditorCommentsBridge = _agentEditorCommentsBridge;
    this._textFileService = _textFileService;
    this._modelService = _modelService;
    this._fileService = _fileService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._buttonStore = this._register(new DisposableStore());
    this._renderedSubmitInlineCount = -1;
    this._messageContentDisposables = this._register(new MutableDisposable());
    this._planChangeListeners = this._register(new DisposableStore());
    this._isCollapsed = false;
    this._isSubmitted = false;
    this._isSubmitting = false;
    this._isFeedbackMode = false;
    this._planReviewRegistration = this._register(new MutableDisposable());
    this._commentRowDisposables = this._register(new DisposableStore());
    this._selectedAction = review.actions.find((a) => a.default) ?? review.actions[0];
    if (review instanceof ChatPlanReviewData && typeof review.draftCollapsed === "boolean") {
      this._isCollapsed = review.draftCollapsed;
    }
    const isResponseComplete = isResponseVM(context.element) && context.element.isComplete;
    this._isSubmitted = !!review.isUsed || isResponseComplete;
    if (review instanceof ChatPlanReviewData) {
      this._register(review.onDidDismiss(() => {
        if (this.updatePlanContentFromModel()) {
          this.renderMarkdown();
        }
        this._isSubmitted = true;
        void this.markUsed();
      }));
    }
    if (review.planUri && review.canProvideFeedback && !this._isSubmitted) {
      const planUri = URI.revive(review.planUri);
      const planUriString = planUri.toString();
      const registrationStore = new DisposableStore();
      registrationStore.add(this._planReviewFeedbackService.registerPlanReview(planUri, {
        sessionResource: context.element.sessionResource,
        actions: review.actions,
        hasOverallFeedback: () => !!this._feedbackTextarea?.value.trim(),
        submitFeedback: () => this.submitFeedback(),
        submitAction: (action) => this.submitApproval(action),
        reject: () => this.submitRejection()
      }));
      registrationStore.add(this._planReviewFeedbackService.onDidChangeFeedback((uri) => {
        if (uri.toString() === planUriString) {
          this.onInlineFeedbackChanged();
        }
      }));
      registrationStore.add(this._agentEditorCommentsBridge.onDidChangeComments(() => this.onInlineFeedbackChanged()));
      this._planReviewRegistration.value = registrationStore;
    }
    const elements = dom.h(".chat-confirmation-widget-container.chat-plan-review-container@container", [
      dom.h(".chat-confirmation-widget2.chat-plan-review@root", [
        dom.h(".chat-confirmation-widget-title.chat-plan-review-title@title", [
          dom.h(".chat-plan-review-title-content", [
            dom.h(".chat-plan-review-title-label@titleLabel"),
            dom.h("span.chat-plan-review-outdated@outdatedBadge")
          ]),
          dom.h(".chat-plan-review-inline-actions@inlineActions"),
          dom.h(".chat-plan-review-title-actions@titleActions")
        ]),
        dom.h(".chat-confirmation-widget-message.chat-plan-review-body@message"),
        dom.h(".chat-plan-review-feedback@feedback"),
        dom.h(".chat-confirmation-widget-buttons.chat-plan-review-footer", [
          dom.h(".chat-buttons@footerButtons")
        ])
      ])
    ]);
    this.domNode = elements.container;
    this.domNode.id = generateUuid();
    this.domNode.setAttribute("role", "region");
    this.domNode.setAttribute("aria-label", localize("chat.planReview.ariaLabel", "Plan review: {0}", review.title));
    this._titleActionsEl = elements.titleActions;
    this._outdatedBadgeEl = elements.outdatedBadge;
    this._inlineActionsEl = elements.inlineActions;
    this._footerButtonsEl = elements.footerButtons;
    this._messageEl = elements.message;
    elements.titleLabel.textContent = review.title;
    this._register(this._hoverService.setupDelayedHover(elements.titleLabel, { content: review.title }));
    this._outdatedBadgeEl.textContent = localize("chat.planReview.outdated", "Outdated");
    this._outdatedBadgeEl.setAttribute("aria-label", localize("chat.planReview.outdatedAriaLabel", "Plan summary is outdated"));
    if (!review.isOutdated) {
      dom.hide(this._outdatedBadgeEl);
    }
    this.watchPlanChanges();
    if (review.planUri) {
      const fileName = basename(URI.revive(review.planUri));
      const reviewButtonTooltip = review.canProvideFeedback ? localize("chat.planReview.reviewTooltip", "Review {0}", fileName) : localize("chat.planReview.openTooltip", "Open {0}", fileName);
      const reviewButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: reviewButtonTooltip, ariaLabel: reviewButtonTooltip }));
      reviewButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-review-button");
      this._reviewButton = reviewButton;
      this._register(reviewButton.onDidClick(() => void this.enterReviewMode()));
    }
    this._collapseButton = this._register(new Button(this._titleActionsEl, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this._collapseButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-title-icon-button");
    this._register(this._collapseButton.onDidClick(() => this.toggleCollapsed()));
    const messageParent = this._messageEl.parentElement;
    const messageNextSibling = this._messageEl.nextSibling;
    this._messageScrollable = this._register(new DomScrollableElement(this._messageEl, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._messageScrollable.getDomNode().classList.add("chat-confirmation-widget-message-scrollable", "chat-plan-review-body-scrollable");
    messageParent.insertBefore(this._messageScrollable.getDomNode(), messageNextSibling);
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatPlanReviewPart.messageScrollable", () => this._messageScrollable.scanDomNode()));
    this._register(resizeObserver.observe(this._messageScrollable.getDomNode()));
    this.renderMarkdown();
    if (review.canProvideFeedback) {
      this.renderFeedback(elements.feedback);
      this._feedbackSection = elements.feedback;
      if (review.planUri) {
        dom.hide(elements.feedback);
      } else {
        this.domNode.classList.add("chat-plan-review-textarea-mode");
      }
    } else {
      dom.hide(elements.feedback);
    }
    this.renderActionButtons(
      this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl,
      { includeReject: !this._isCollapsed }
    );
    this.updateCollapsedPresentation();
    if (this._isSubmitted) {
      this.domNode.classList.add("chat-plan-review-used");
    }
    if (this._feedbackTextarea && review instanceof ChatPlanReviewData && review.draftFeedback) {
      this._feedbackTextarea.value = review.draftFeedback;
      this._feedbackTextarea.style.height = "auto";
      this._feedbackTextarea.style.height = `${this._feedbackTextarea.scrollHeight}px`;
    }
    if (!this._isSubmitted && this.getInlineFeedbackItems().length > 0) {
      void this.enterFeedbackMode({ focus: false });
    }
  }
  watchPlanChanges() {
    if (!this.review.planUri || this.review.isOutdated) {
      return;
    }
    const planUri = URI.revive(this.review.planUri);
    const modelListener = this._planChangeListeners.add(new MutableDisposable());
    const watchModel = (model2) => {
      if (isEqual(model2.uri, planUri)) {
        modelListener.value = model2.onDidChangeContent(() => this.markOutdated());
      }
    };
    const model = this._modelService.getModel(planUri);
    if (model) {
      watchModel(model);
    }
    this._planChangeListeners.add(this._modelService.onModelAdded(watchModel));
    const watcher = this._planChangeListeners.add(this._fileService.createWatcher(planUri, { recursive: false, excludes: [] }));
    this._planChangeListeners.add(watcher.onDidChange((event) => {
      if (event.contains(planUri, FileChangeType.DELETED) || !this._modelService.getModel(planUri) && event.contains(planUri, FileChangeType.ADDED, FileChangeType.UPDATED)) {
        this.markOutdated();
      }
    }));
  }
  markOutdated() {
    if (this.review.isOutdated) {
      return;
    }
    this.review.isOutdated = true;
    dom.show(this._outdatedBadgeEl);
    this._planChangeListeners.clear();
    status(localize("chat.planReview.outdatedAnnouncement", "Plan summary is outdated"));
  }
  hasSameContent(other, _followingContent, _element) {
    if (other.kind !== "planReview") {
      return false;
    }
    if (!!other.isUsed !== !!this.review.isUsed) {
      return false;
    }
    if (this.review.resolveId && other.resolveId) {
      return this.review.resolveId === other.resolveId;
    }
    return other === this.review;
  }
  renderMarkdown() {
    dom.clearNode(this._messageEl);
    const store = new DisposableStore();
    this._messageContentDisposables.value = store;
    const rendered = store.add(this._markdownRendererService.render(
      new MarkdownString(this.review.content, { supportThemeIcons: true, isTrusted: false }),
      getChatMarkdownRenderOptions({ asyncRenderCallback: () => this._messageScrollable.scanDomNode() })
    ));
    this._messageEl.append(rendered.element);
    this._messageScrollable.scanDomNode();
  }
  renderFeedback(section) {
    dom.clearNode(section);
    const header = dom.append(section, dom.$(".chat-plan-review-feedback-header"));
    const label = dom.append(header, dom.$(".chat-plan-review-feedback-label"));
    label.textContent = localize("chat.planReview.feedbackLabel", "Feedback");
    const headerActions = dom.append(header, dom.$(".chat-plan-review-feedback-header-actions"));
    if (this.review.planUri) {
      const clearAllLabel = localize("chat.planReview.clearAll", "Clear All");
      const clearAllButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: clearAllLabel, ariaLabel: clearAllLabel }));
      clearAllButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-feedback-clear-all");
      clearAllButton.label = clearAllLabel;
      this._register(clearAllButton.onDidClick(() => this.clearAllInlineFeedback()));
      this._clearAllButtonEl = clearAllButton.element;
    }
    if (this.review.planUri) {
      const closeButtonLabel = localize("chat.planReview.close", "Close");
      const closeButton = this._register(new Button(headerActions, { ...defaultButtonStyles, secondary: true, supportIcons: true, title: closeButtonLabel, ariaLabel: closeButtonLabel }));
      closeButton.element.classList.add("chat-plan-review-title-button", "chat-plan-review-title-icon-button", "chat-plan-review-feedback-close");
      closeButton.label = `$(${Codicon.closeSmall.id})`;
      this._register(closeButton.onDidClick(() => this.exitFeedbackMode()));
    }
    this._commentsListEl = dom.$(".chat-plan-review-comments-list");
    this._commentsListScrollable = this._register(new DomScrollableElement(this._commentsListEl, {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._commentsListScrollable.getDomNode().classList.add("chat-plan-review-comments-list-scrollable");
    dom.append(section, this._commentsListScrollable.getDomNode());
    dom.hide(this._commentsListScrollable.getDomNode());
    this.renderCommentsList();
    const textarea = dom.append(section, dom.$("textarea.chat-plan-review-feedback-textarea"));
    textarea.rows = 1;
    textarea.placeholder = localize("chat.planReview.feedbackPlaceholder", "Add an overall comment for the agent...");
    this._feedbackTextarea = textarea;
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
      this._onDidChangeHeight.fire();
    };
    this._register(dom.addDisposableListener(textarea, dom.EventType.INPUT, () => {
      autoResize();
      this._messageScrollable.scanDomNode();
      if (this.review instanceof ChatPlanReviewData) {
        this.review.draftFeedback = textarea.value;
      }
      if (this.review.planUri) {
        this._planReviewFeedbackService.notifyFeedbackChanged(URI.revive(this.review.planUri));
      }
      this.updateSubmitButtonState();
    }));
    if (this.review.planUri) {
      this._register(dom.addDisposableListener(textarea, dom.EventType.KEY_DOWN, (e) => {
        const ev = new StandardKeyboardEvent(e);
        if (ev.keyCode === KeyCode.Enter && !ev.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          void this.submitFeedback();
        }
      }));
    }
  }
  renderCommentsList() {
    if (!this._commentsListEl) {
      return;
    }
    this._commentRowDisposables.clear();
    dom.clearNode(this._commentsListEl);
    const items = this.getInlineFeedbackItems();
    if (this._clearAllButtonEl) {
      if (items.length > 0) {
        dom.show(this._clearAllButtonEl);
      } else {
        dom.hide(this._clearAllButtonEl);
      }
    }
    const scrollableNode = this._commentsListScrollable?.getDomNode();
    if (items.length === 0) {
      if (scrollableNode) {
        dom.hide(scrollableNode);
      }
      this._commentsListScrollable?.scanDomNode();
      return;
    }
    if (scrollableNode) {
      dom.show(scrollableNode);
    }
    for (const item of items) {
      const row = dom.append(this._commentsListEl, dom.$(".chat-plan-review-comment-row"));
      const rowLabel = localize("chat.planReview.commentRowAriaLabel", "Line {0}: {1}", item.line, item.text);
      const revealButton = dom.append(row, dom.$("button.chat-plan-review-comment-reveal"));
      revealButton.type = "button";
      revealButton.setAttribute("aria-label", rowLabel);
      const lineEl = dom.append(revealButton, dom.$("span.chat-plan-review-comment-line"));
      lineEl.textContent = localize("chat.planReview.commentRowLine", "Line {0}", item.line);
      const textEl = dom.append(revealButton, dom.$("span.chat-plan-review-comment-text"));
      textEl.textContent = item.text;
      this._commentRowDisposables.add(dom.addDisposableListener(revealButton, dom.EventType.CLICK, () => {
        this.revealInlineComment(item);
      }));
      const removeLabel = localize("chat.planReview.removeComment", "Remove comment on line {0}", item.line);
      const removeButton = dom.append(row, dom.$("button.chat-plan-review-comment-remove"));
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", removeLabel);
      removeButton.title = removeLabel;
      removeButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.closeSmall));
      this._commentRowDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this.removeInlineComment(item.id);
      }));
    }
    this._commentsListScrollable?.scanDomNode();
  }
  getInlineFeedbackItems() {
    return this.review.planUri ? this._planReviewFeedbackService.getFeedback(URI.revive(this.review.planUri)) : [];
  }
  async revealInlineComment(item) {
    const planUri = this.review.planUri ? URI.revive(this.review.planUri) : void 0;
    if (!planUri) {
      return;
    }
    this._planReviewFeedbackService.setNavigationAnchor(planUri, item.id);
    await this._editorService.openEditor({
      resource: item.resource,
      options: {
        pinned: true,
        ...isEqual(item.resource, planUri) ? { override: MARKDOWN_EDITOR_ID } : {},
        selection: { startLineNumber: item.line, startColumn: item.column }
      }
    });
  }
  removeInlineComment(itemId) {
    if (this._isSubmitted) {
      return;
    }
    if (this.review.planUri) {
      this._planReviewFeedbackService.removeFeedback(URI.revive(this.review.planUri), itemId);
    }
  }
  async clearAllInlineFeedback() {
    if (this._isSubmitted) {
      return;
    }
    const items = this.getInlineFeedbackItems();
    if (items.length === 0) {
      return;
    }
    const result = await this._dialogService.confirm({
      type: Severity.Warning,
      message: localize("chat.planReview.clearAllConfirm", "Clear {0} inline comment(s)?", items.length),
      detail: localize("chat.planReview.clearAllDetail", "These comments will be removed from the plan file and not sent to the agent."),
      primaryButton: localize("chat.planReview.clearAllConfirmPrimary", "Clear All")
    });
    if (!result.confirmed) {
      return;
    }
    if (this.review.planUri) {
      this._planReviewFeedbackService.clearFeedback(URI.revive(this.review.planUri));
    }
  }
  onInlineFeedbackChanged() {
    if (this._isSubmitted) {
      return;
    }
    const items = this.getInlineFeedbackItems();
    if (items.length > 0 && !this._isFeedbackMode) {
      void this.enterFeedbackMode({ focus: false });
      return;
    }
    this.renderCommentsList();
    if (this._isFeedbackMode) {
      this.updateSubmitButtonState();
    }
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  /**
   * Render the action buttons into the active container (footer when
   * expanded, inline title slot when collapsed). Clears the inactive slot
   * so the same buttons can never appear in two places at once.
   */
  renderCurrentActionButtons() {
    if (this._isSubmitted) {
      return;
    }
    const target = this._isCollapsed ? this._inlineActionsEl : this._footerButtonsEl;
    const other = this._isCollapsed ? this._footerButtonsEl : this._inlineActionsEl;
    dom.clearNode(other);
    this.renderActionButtons(target, { includeReject: !this._isCollapsed });
  }
  renderActionButtons(container, options) {
    const includeReject = options?.includeReject ?? true;
    this._buttonStore.clear();
    this._submitButton = void 0;
    this._renderedSubmitInlineCount = -1;
    dom.clearNode(container);
    if (this._isFeedbackMode) {
      const inlineCount = this.getInlineFeedbackItems().length;
      const submitButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
      submitButton.label = this.computeSubmitLabel(inlineCount);
      submitButton.enabled = this.canSubmitFeedback();
      this._submitButton = submitButton;
      this._renderedSubmitInlineCount = inlineCount;
      this._buttonStore.add(submitButton);
      this._buttonStore.add(submitButton.onDidClick(() => void this.submitFeedback()));
      if (includeReject) {
        const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
        rejectButton.label = localize("chat.planReview.reject", "Reject");
        this._buttonStore.add(rejectButton);
        this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
      }
      return;
    }
    const primary = this._selectedAction;
    const moreActions = this.review.actions.filter((a) => a !== primary);
    let approveButton;
    if (moreActions.length > 0) {
      approveButton = new ButtonWithDropdown(container, {
        ...defaultButtonStyles,
        supportIcons: true,
        contextMenuProvider: this._contextMenuService,
        addPrimaryActionToDropdown: false,
        actions: moreActions.map((action) => {
          const button = new Action(
            action.label,
            action.label,
            void 0,
            true,
            () => {
              this.submitApproval(action);
              return Promise.resolve();
            }
          );
          button.tooltip = action.description || "";
          return this._buttonStore.add(button);
        })
      });
    } else {
      approveButton = new Button(container, { ...defaultButtonStyles, supportIcons: true });
    }
    this._buttonStore.add(approveButton);
    approveButton.label = primary.label;
    if (primary.description) {
      approveButton.element.title = primary.description;
    }
    this._buttonStore.add(approveButton.onDidClick(() => this.submitApproval(primary)));
    if (includeReject) {
      const rejectButton = new Button(container, { ...defaultButtonStyles, secondary: true });
      rejectButton.label = localize("chat.planReview.reject", "Reject");
      this._buttonStore.add(rejectButton);
      this._buttonStore.add(rejectButton.onDidClick(() => this.submitRejection()));
    }
  }
  canSubmitFeedback() {
    const textareaText = this._feedbackTextarea?.value.trim() ?? "";
    if (textareaText) {
      return true;
    }
    return this.getInlineFeedbackItems().length > 0;
  }
  computeSubmitLabel(inlineCount) {
    return inlineCount > 0 ? localize("chat.planReview.submitFeedbackWithCount", "Submit Feedback ({0})", inlineCount) : localize("chat.planReview.submitFeedback", "Submit Feedback");
  }
  /**
   * Update the cached Submit button's enabled state and label without
   * destroying the button row. Cheap enough to run on every keystroke.
   */
  updateSubmitButtonState() {
    if (!this._submitButton || !this._isFeedbackMode) {
      return;
    }
    this._submitButton.enabled = this.canSubmitFeedback();
    const inlineCount = this.getInlineFeedbackItems().length;
    if (inlineCount !== this._renderedSubmitInlineCount) {
      this._submitButton.label = this.computeSubmitLabel(inlineCount);
      this._renderedSubmitInlineCount = inlineCount;
    }
  }
  toggleCollapsed() {
    this.domNode.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
    this._isCollapsed = !this._isCollapsed;
    if (this.review instanceof ChatPlanReviewData) {
      this.review.draftCollapsed = this._isCollapsed;
    }
    this.updateCollapsedPresentation();
    this._onDidChangeHeight.fire();
  }
  updateCollapsedPresentation() {
    this.domNode.classList.toggle("chat-plan-review-collapsed", this._isCollapsed);
    this._collapseButton.label = this._isCollapsed ? `$(${Codicon.chevronUp.id})` : `$(${Codicon.chevronDown.id})`;
    const collapseTooltip = this._isCollapsed ? localize("chat.planReview.expand", "Expand") : localize("chat.planReview.collapse", "Collapse");
    this._collapseButton.element.setAttribute("aria-label", collapseTooltip);
    this._collapseButton.element.setAttribute("aria-expanded", String(!this._isCollapsed));
    this._collapseButton.setTitle(collapseTooltip);
    if (this._reviewButton) {
      const isIconOnly = this._isCollapsed;
      this._reviewButton.element.classList.toggle("chat-plan-review-title-icon-button", isIconOnly);
      let label;
      let tooltip;
      if (isIconOnly) {
        label = `$(${Codicon.edit.id})`;
        const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : "";
        tooltip = this.review.canProvideFeedback ? localize("chat.planReview.reviewTooltip", "Review {0}", fileName) : localize("chat.planReview.openTooltip", "Open {0}", fileName);
      } else {
        const fileName = this.review.planUri ? basename(URI.revive(this.review.planUri)) : "";
        if (this.review.canProvideFeedback) {
          label = localize("chat.planReview.reviewButtonLabel", "Open Full Plan");
          tooltip = localize("chat.planReview.reviewTooltip", "Review {0}", fileName);
        } else {
          label = localize("chat.planReview.openButtonLabel", "Open Plan");
          tooltip = localize("chat.planReview.openTooltip", "Open {0}", fileName);
        }
      }
      this._reviewButton.label = label;
      this._reviewButton.element.setAttribute("aria-label", tooltip);
      this._reviewButton.setTitle(tooltip);
    }
    this.renderCurrentActionButtons();
  }
  async enterReviewMode() {
    if (!this.review.canProvideFeedback || this._isSubmitted) {
      if (this.review.planUri) {
        await this._editorService.openEditor({
          resource: URI.revive(this.review.planUri),
          options: { pinned: true, override: MARKDOWN_EDITOR_ID }
        });
      }
      return;
    }
    if (this._isCollapsed) {
      this._isCollapsed = false;
      if (this.review instanceof ChatPlanReviewData) {
        this.review.draftCollapsed = false;
      }
      this.updateCollapsedPresentation();
    }
    await this.enterFeedbackMode({ focus: true });
  }
  async submitApproval(action) {
    if (this._isSubmitted || this._isSubmitting) {
      return;
    }
    this._isSubmitting = true;
    try {
      if (action.permissionLevel === "autopilot") {
        const confirmed = await this.confirmAutopilot();
        if (!confirmed) {
          return;
        }
      }
      if (this.review.planUri && !await this.savePlanFile()) {
        return;
      }
      this._isSubmitted = true;
      const ridesAlong = !this.review.planUri;
      const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : void 0;
      this._options.onSubmit({
        action: action.label,
        ...action.id ? { actionId: action.id } : {},
        rejected: false,
        ...textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}
      });
      void this.markUsed();
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async submitRejection() {
    if (this._isSubmitted || this._isSubmitting) {
      return;
    }
    this._isSubmitting = true;
    try {
      if (this.review.planUri && !await this.savePlanFile()) {
        return;
      }
      this._isSubmitted = true;
      const ridesAlong = !this.review.planUri;
      const textareaFeedback = ridesAlong ? this._feedbackTextarea?.value.trim() : void 0;
      this._options.onSubmit({
        rejected: true,
        ...textareaFeedback ? { feedback: textareaFeedback, feedbackOverall: textareaFeedback } : {}
      });
      void this.markUsed();
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async savePlanFile() {
    if (!this.review.planUri) {
      return true;
    }
    const planUri = URI.revive(this.review.planUri);
    if (this._textFileService.isDirty(planUri) && !await this._textFileService.save(planUri)) {
      return false;
    }
    if (this.review instanceof ChatPlanReviewData) {
      if (!this.updatePlanContentFromModel()) {
        this.review.content = (await this._textFileService.read(planUri)).value;
      }
      this.renderMarkdown();
    }
    return true;
  }
  updatePlanContentFromModel() {
    if (!(this.review instanceof ChatPlanReviewData) || !this.review.planUri) {
      return false;
    }
    const model = this._textFileService.files.get(URI.revive(this.review.planUri));
    if (!model?.isResolved()) {
      return false;
    }
    this.review.content = model.textEditorModel.getValue();
    return true;
  }
  async enterFeedbackMode(options) {
    if (this._isFeedbackMode) {
      if (this.review.planUri) {
        await this._editorService.openEditor({
          resource: URI.revive(this.review.planUri),
          options: { pinned: true, override: MARKDOWN_EDITOR_ID }
        });
      } else if (options?.focus) {
        this.focusFeedbackInput();
      }
      return;
    }
    this._isFeedbackMode = true;
    if (this._feedbackSection) {
      dom.show(this._feedbackSection);
    }
    this.domNode.classList.add("chat-plan-review-feedback-mode");
    this.renderCommentsList();
    this.updateCollapsedPresentation();
    if (this.review.planUri) {
      await this._editorService.openEditor({
        resource: URI.revive(this.review.planUri),
        options: { pinned: true, override: MARKDOWN_EDITOR_ID }
      });
    }
    if (!this.review.planUri && options?.focus !== false) {
      this.focusFeedbackInput();
    }
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  async exitFeedbackMode() {
    if (!this._isFeedbackMode) {
      return;
    }
    this._isFeedbackMode = false;
    if (this._feedbackSection) {
      dom.hide(this._feedbackSection);
    }
    this.domNode.classList.remove("chat-plan-review-feedback-mode");
    this.updateCollapsedPresentation();
    this._messageScrollable.scanDomNode();
    this._onDidChangeHeight.fire();
  }
  focusFeedbackInput() {
    this._feedbackTextarea?.focus();
  }
  async submitFeedback() {
    if (this._isSubmitted || this._isSubmitting) {
      return false;
    }
    const textareaFeedback = this._feedbackTextarea?.value.trim();
    const editorFeedbackItems = [...this.getInlineFeedbackItems()];
    if (!textareaFeedback && editorFeedbackItems.length === 0) {
      return false;
    }
    this._isSubmitting = true;
    try {
      if (!await this.savePlanFile()) {
        return false;
      }
      let feedbackInlineMarkdown;
      if (editorFeedbackItems.length > 0) {
        const itemsByResource = /* @__PURE__ */ new Map();
        for (const item of editorFeedbackItems) {
          const key = item.resource.toString();
          const items = itemsByResource.get(key) ?? [];
          items.push(item);
          itemsByResource.set(key, items);
        }
        const sections2 = [...itemsByResource.values()].flatMap((items) => [
          localize("chat.planReview.inlineCommentsHeading", "Inline comments on `{0}`:", basename(items[0].resource)),
          ...items.map((item) => {
            const location = item.column > 1 ? localize("chat.planReview.inlineCommentLocation", "Line {0}, Column {1}", item.line, item.column) : localize("chat.planReview.inlineCommentLocationLine", "Line {0}", item.line);
            return `- **${location}:** ${item.text}`;
          })
        ]);
        feedbackInlineMarkdown = sections2.join("\n");
      }
      const sections = [];
      if (textareaFeedback) {
        sections.push(textareaFeedback);
      }
      if (feedbackInlineMarkdown) {
        sections.push(feedbackInlineMarkdown);
      }
      const feedback = sections.join("\n\n");
      this._isSubmitted = true;
      const planUri = this.review.planUri ? URI.revive(this.review.planUri) : void 0;
      if (planUri) {
        for (const item of editorFeedbackItems) {
          this._planReviewFeedbackService.removeFeedback(planUri, item.id);
        }
      }
      this._options.onSubmit({
        rejected: false,
        feedback,
        feedbackOverall: textareaFeedback || void 0,
        feedbackInlineMarkdown
      });
      await this.markUsed();
      return true;
    } finally {
      if (!this._isSubmitted) {
        this._isSubmitting = false;
      }
    }
  }
  async confirmAutopilot() {
    const result = await this._dialogService.prompt({
      type: Severity.Warning,
      message: localize("chat.planReview.autopilot.title", "Enable Autopilot?"),
      buttons: [
        {
          label: localize("chat.planReview.autopilot.confirm", "Enable"),
          run: () => true
        },
        {
          label: localize("chat.planReview.autopilot.cancel", "Cancel"),
          run: () => false
        }
      ],
      custom: {
        icon: Codicon.rocket,
        markdownDetails: [{
          markdown: new MarkdownString(localize("chat.planReview.autopilot.detail", "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only."))
        }]
      }
    });
    return result.result === true;
  }
  async markUsed() {
    this.domNode.classList.add("chat-plan-review-used");
    this._buttonStore.clear();
    this._submitButton = void 0;
    this._renderedSubmitInlineCount = -1;
    this._planReviewRegistration.clear();
    if (this._feedbackTextarea) {
      this._feedbackTextarea.disabled = true;
    }
  }
};
ChatPlanReviewPart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IPlanReviewFeedbackService),
  __decorateParam(9, IAgentEditorCommentsBridge),
  __decorateParam(10, ITextFileService),
  __decorateParam(11, IModelService),
  __decorateParam(12, IFileService)
], ChatPlanReviewPart);
export {
  ChatPlanReviewPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFBsYW5SZXZpZXdQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvbldpdGhEcm9wZG93biwgSUJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEVkaXRvckNvbW1lbnRzQnJpZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRFZGl0b3JDb21tZW50cy9jb21tb24vYWdlbnRFZGl0b3JDb21tZW50cy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBsYW5BcHByb3ZhbEFjdGlvbiwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsYW5SZXZpZXdGZWVkYmFja0l0ZW0sIElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhblJldmlld0ZlZWRiYWNrL3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdE1hcmtkb3duUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4uL2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdFBsYW5SZXZpZXcuY3NzJztcblxuY29uc3QgTUFSS0RPV05fRURJVE9SX0lEID0gJ3ZzY29kZS5tYXJrZG93bi5lZGl0b3InO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UGxhblJldmlld1BhcnRPcHRpb25zIHtcblx0b25TdWJtaXQ6IChyZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRQbGFuUmV2aWV3UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9idXR0b25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX3N1Ym1pdEJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50ID0gLTE7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGxhbkNoYW5nZUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVBY3Rpb25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRkYXRlZEJhZGdlRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVBY3Rpb25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mb290ZXJCdXR0b25zRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlRWw6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlU2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxhcHNlQnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgX3Jldmlld0J1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzQ29sbGFwc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3VibWl0dGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3VibWl0dGluZyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zZWxlY3RlZEFjdGlvbjogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb247XG5cdHByaXZhdGUgX2ZlZWRiYWNrVGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZlZWRiYWNrU2VjdGlvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbW1lbnRzTGlzdEVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29tbWVudHNMaXN0U2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NsZWFyQWxsQnV0dG9uRWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0ZlZWRiYWNrTW9kZSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wbGFuUmV2aWV3UmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tZW50Um93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXZpZXc6IElDaGF0UGxhblJldmlldyxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQ2hhdFBsYW5SZXZpZXdQYXJ0T3B0aW9ucyxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlOiBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSxcblx0XHRASUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRFZGl0b3JDb21tZW50c0JyaWRnZTogSUFnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zZWxlY3RlZEFjdGlvbiA9IHJldmlldy5hY3Rpb25zLmZpbmQoYSA9PiBhLmRlZmF1bHQpID8/IHJldmlldy5hY3Rpb25zWzBdO1xuXG5cdFx0aWYgKHJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSAmJiB0eXBlb2YgcmV2aWV3LmRyYWZ0Q29sbGFwc2VkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuX2lzQ29sbGFwc2VkID0gcmV2aWV3LmRyYWZ0Q29sbGFwc2VkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzUmVzcG9uc2VDb21wbGV0ZSA9IGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlO1xuXHRcdHRoaXMuX2lzU3VibWl0dGVkID0gISFyZXZpZXcuaXNVc2VkIHx8IGlzUmVzcG9uc2VDb21wbGV0ZTtcblx0XHRpZiAocmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZXZpZXcub25EaWREaXNtaXNzKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMudXBkYXRlUGxhbkNvbnRlbnRGcm9tTW9kZWwoKSkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9pc1N1Ym1pdHRlZCA9IHRydWU7XG5cdFx0XHRcdHZvaWQgdGhpcy5tYXJrVXNlZCgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIHdpdGggdGhlIHBsYW4gcmV2aWV3IGZlZWRiYWNrIHNlcnZpY2Ugc28gdGhlIGVkaXRvclxuXHRcdC8vIGNvbnRyaWJ1dGlvbiBjYW4gc2hvdyBpbmxpbmUgZmVlZGJhY2sgaW5wdXQgZm9yIHRoaXMgcGxhbiBmaWxlLlxuXHRcdC8vIFN1YnNjcmliZSB0byBmZWVkYmFjayBjaGFuZ2VzIHNvIHRoZSBjb21tZW50cyBsaXN0IGFuZCBTdWJtaXRcblx0XHQvLyBidXR0b24gbGFiZWwgc3RheSBpbiBzeW5jLlxuXHRcdGlmIChyZXZpZXcucGxhblVyaSAmJiByZXZpZXcuY2FuUHJvdmlkZUZlZWRiYWNrICYmICF0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkpO1xuXHRcdFx0Y29uc3QgcGxhblVyaVN0cmluZyA9IHBsYW5VcmkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHJlZ2lzdHJhdGlvblN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cmVnaXN0cmF0aW9uU3RvcmUuYWRkKHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UucmVnaXN0ZXJQbGFuUmV2aWV3KHBsYW5VcmksIHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRhY3Rpb25zOiByZXZpZXcuYWN0aW9ucyxcblx0XHRcdFx0aGFzT3ZlcmFsbEZlZWRiYWNrOiAoKSA9PiAhIXRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LnZhbHVlLnRyaW0oKSxcblx0XHRcdFx0c3VibWl0RmVlZGJhY2s6ICgpID0+IHRoaXMuc3VibWl0RmVlZGJhY2soKSxcblx0XHRcdFx0c3VibWl0QWN0aW9uOiBhY3Rpb24gPT4gdGhpcy5zdWJtaXRBcHByb3ZhbChhY3Rpb24pLFxuXHRcdFx0XHRyZWplY3Q6ICgpID0+IHRoaXMuc3VibWl0UmVqZWN0aW9uKCksXG5cdFx0XHR9KSk7XG5cdFx0XHRyZWdpc3RyYXRpb25TdG9yZS5hZGQodGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5vbkRpZENoYW5nZUZlZWRiYWNrKHVyaSA9PiB7XG5cdFx0XHRcdGlmICh1cmkudG9TdHJpbmcoKSA9PT0gcGxhblVyaVN0cmluZykge1xuXHRcdFx0XHRcdHRoaXMub25JbmxpbmVGZWVkYmFja0NoYW5nZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0cmVnaXN0cmF0aW9uU3RvcmUuYWRkKHRoaXMuX2FnZW50RWRpdG9yQ29tbWVudHNCcmlkZ2Uub25EaWRDaGFuZ2VDb21tZW50cygoKSA9PiB0aGlzLm9uSW5saW5lRmVlZGJhY2tDaGFuZ2VkKCkpKTtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdSZWdpc3RyYXRpb24udmFsdWUgPSByZWdpc3RyYXRpb25TdG9yZTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCBET00gdGhhdCBtaXJyb3JzIGNoYXQtY29uZmlybWF0aW9uLXdpZGdldDIgc28gd2UgaW5oZXJpdCBpdHNcblx0XHQvLyBzdHlsaW5nICh0aXRsZSBiYXIsIHNjcm9sbGFibGUgbWVzc2FnZSwgYmx1ZS9ncmV5IGJ1dHRvbiByb3cpLlxuXHRcdGNvbnN0IGVsZW1lbnRzID0gZG9tLmgoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtY29udGFpbmVyLmNoYXQtcGxhbi1yZXZpZXctY29udGFpbmVyQGNvbnRhaW5lcicsIFtcblx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0Mi5jaGF0LXBsYW4tcmV2aWV3QHJvb3QnLCBbXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LXRpdGxlLmNoYXQtcGxhbi1yZXZpZXctdGl0bGVAdGl0bGUnLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWNvbnRlbnQnLCBbXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtcGxhbi1yZXZpZXctdGl0bGUtbGFiZWxAdGl0bGVMYWJlbCcpLFxuXHRcdFx0XHRcdFx0ZG9tLmgoJ3NwYW4uY2hhdC1wbGFuLXJldmlldy1vdXRkYXRlZEBvdXRkYXRlZEJhZGdlJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LWlubGluZS1hY3Rpb25zQGlubGluZUFjdGlvbnMnKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtcGxhbi1yZXZpZXctdGl0bGUtYWN0aW9uc0B0aXRsZUFjdGlvbnMnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2UuY2hhdC1wbGFuLXJldmlldy1ib2R5QG1lc3NhZ2UnKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrQGZlZWRiYWNrJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LWJ1dHRvbnMuY2hhdC1wbGFuLXJldmlldy1mb290ZXInLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWJ1dHRvbnNAZm9vdGVyQnV0dG9ucycpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZWxlbWVudHMuY29udGFpbmVyO1xuXHRcdHRoaXMuZG9tTm9kZS5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuYXJpYUxhYmVsJywgJ1BsYW4gcmV2aWV3OiB7MH0nLCByZXZpZXcudGl0bGUpKTtcblxuXHRcdHRoaXMuX3RpdGxlQWN0aW9uc0VsID0gZWxlbWVudHMudGl0bGVBY3Rpb25zO1xuXHRcdHRoaXMuX291dGRhdGVkQmFkZ2VFbCA9IGVsZW1lbnRzLm91dGRhdGVkQmFkZ2U7XG5cdFx0dGhpcy5faW5saW5lQWN0aW9uc0VsID0gZWxlbWVudHMuaW5saW5lQWN0aW9ucztcblx0XHR0aGlzLl9mb290ZXJCdXR0b25zRWwgPSBlbGVtZW50cy5mb290ZXJCdXR0b25zO1xuXHRcdHRoaXMuX21lc3NhZ2VFbCA9IGVsZW1lbnRzLm1lc3NhZ2U7XG5cblx0XHQvLyBUaXRsZSBsYWJlbCArIGhvdmVyIGZvciB0cnVuY2F0ZWQgdGl0bGVzLlxuXHRcdGVsZW1lbnRzLnRpdGxlTGFiZWwudGV4dENvbnRlbnQgPSByZXZpZXcudGl0bGU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGVsZW1lbnRzLnRpdGxlTGFiZWwsIHsgY29udGVudDogcmV2aWV3LnRpdGxlIH0pKTtcblx0XHR0aGlzLl9vdXRkYXRlZEJhZGdlRWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3Lm91dGRhdGVkJywgJ091dGRhdGVkJyk7XG5cdFx0dGhpcy5fb3V0ZGF0ZWRCYWRnZUVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3V0ZGF0ZWRBcmlhTGFiZWwnLCAnUGxhbiBzdW1tYXJ5IGlzIG91dGRhdGVkJykpO1xuXHRcdGlmICghcmV2aWV3LmlzT3V0ZGF0ZWQpIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuX291dGRhdGVkQmFkZ2VFbCk7XG5cdFx0fVxuXHRcdHRoaXMud2F0Y2hQbGFuQ2hhbmdlcygpO1xuXG5cdFx0Ly8gUmV2aWV3IGJ1dHRvbiBcdTIwMTQgb3BlbnMgdGhlIHBsYW4gZmlsZSBhbmQgZW50ZXJzIGZlZWRiYWNrIG1vZGUuXG5cdFx0aWYgKHJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKFVSSS5yZXZpdmUocmV2aWV3LnBsYW5VcmkpKTtcblx0XHRcdGNvbnN0IHJldmlld0J1dHRvblRvb2x0aXAgPSByZXZpZXcuY2FuUHJvdmlkZUZlZWRiYWNrXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5yZXZpZXdUb29sdGlwJywgJ1JldmlldyB7MH0nLCBmaWxlTmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3Lm9wZW5Ub29sdGlwJywgJ09wZW4gezB9JywgZmlsZU5hbWUpO1xuXHRcdFx0Y29uc3QgcmV2aWV3QnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLl90aXRsZUFjdGlvbnNFbCwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgdGl0bGU6IHJldmlld0J1dHRvblRvb2x0aXAsIGFyaWFMYWJlbDogcmV2aWV3QnV0dG9uVG9vbHRpcCB9KSk7XG5cdFx0XHRyZXZpZXdCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LXJldmlldy1idXR0b24nKTtcblx0XHRcdHRoaXMuX3Jldmlld0J1dHRvbiA9IHJldmlld0J1dHRvbjtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJldmlld0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHZvaWQgdGhpcy5lbnRlclJldmlld01vZGUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIENoZXZyb24gY29sbGFwc2UgdG9nZ2xlLlxuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLl90aXRsZUFjdGlvbnNFbCwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29sbGFwc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnRvZ2dsZUNvbGxhcHNlZCgpKSk7XG5cblx0XHQvLyBTY3JvbGxhYmxlIG1lc3NhZ2UgYXJlYSAobWFya2Rvd24pLlxuXHRcdGNvbnN0IG1lc3NhZ2VQYXJlbnQgPSB0aGlzLl9tZXNzYWdlRWwucGFyZW50RWxlbWVudCE7XG5cdFx0Y29uc3QgbWVzc2FnZU5leHRTaWJsaW5nID0gdGhpcy5fbWVzc2FnZUVsLm5leHRTaWJsaW5nO1xuXHRcdHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuX21lc3NhZ2VFbCwge1xuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byxcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2Utc2Nyb2xsYWJsZScsICdjaGF0LXBsYW4tcmV2aWV3LWJvZHktc2Nyb2xsYWJsZScpO1xuXHRcdG1lc3NhZ2VQYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlLmdldERvbU5vZGUoKSwgbWVzc2FnZU5leHRTaWJsaW5nKTtcblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0UGxhblJldmlld1BhcnQubWVzc2FnZVNjcm9sbGFibGUnLCAoKSA9PiB0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpKSk7XG5cdFx0Ly8gVGhlIGlubmVyIGBfbWVzc2FnZUVsYCBpcyBgaGVpZ2h0OiAxMDAlYCwgc28gb2JzZXJ2aW5nIG9ubHkgdGhlXG5cdFx0Ly8gd3JhcHBlciBpcyBlbm91Z2g7IG1hcmtkb3duIGNvbnRlbnQgcmVmbG93IGlzIGhhbmRsZWQgYnkgdGhlXG5cdFx0Ly8gcmVuZGVyZXIncyBgYXN5bmNSZW5kZXJDYWxsYmFja2AuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpKTtcblxuXHRcdHRoaXMucmVuZGVyTWFya2Rvd24oKTtcblxuXHRcdGlmIChyZXZpZXcuY2FuUHJvdmlkZUZlZWRiYWNrKSB7XG5cdFx0XHR0aGlzLnJlbmRlckZlZWRiYWNrKGVsZW1lbnRzLmZlZWRiYWNrKTtcblx0XHRcdHRoaXMuX2ZlZWRiYWNrU2VjdGlvbiA9IGVsZW1lbnRzLmZlZWRiYWNrO1xuXHRcdFx0aWYgKHJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRcdGRvbS5oaWRlKGVsZW1lbnRzLmZlZWRiYWNrKTsgLy8gSGlkZGVuIHVudGlsIHRoZSB1c2VyIGVudGVycyByZXZpZXcgbW9kZSBvciBpbmxpbmUgZmVlZGJhY2sgZXhpc3RzLlxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm8gcGxhbiBmaWxlOiB0aGVyZSdzIG5vIGlubGluZSBlZGl0b3Igc3VyZmFjZSB0byBjb29yZGluYXRlXG5cdFx0XHRcdC8vIHdpdGgsIHNvIHdlIGRvbid0IHRvZ2dsZSBpbnRvIFwiZmVlZGJhY2sgbW9kZVwiLiBJbnN0ZWFkIGxlYXZlXG5cdFx0XHRcdC8vIHRoZSB0ZXh0YXJlYSB2aXNpYmxlIGFsb25nc2lkZSB0aGUgcmVndWxhciBBcHByb3ZlL1JlamVjdFxuXHRcdFx0XHQvLyBidXR0b25zIGFuZCBsZXQgdGhlIHVzZXIgb3B0aW9uYWxseSB0eXBlIGEgY29tbWVudCB0aGF0XG5cdFx0XHRcdC8vIHJpZGVzIGFsb25nIHdpdGggd2hpY2hldmVyIGFjdGlvbiB0aGV5IHBpY2suXG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXRleHRhcmVhLW1vZGUnKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9tLmhpZGUoZWxlbWVudHMuZmVlZGJhY2spO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyQWN0aW9uQnV0dG9ucyhcblx0XHRcdHRoaXMuX2lzQ29sbGFwc2VkID8gdGhpcy5faW5saW5lQWN0aW9uc0VsIDogdGhpcy5fZm9vdGVyQnV0dG9uc0VsLFxuXHRcdFx0eyBpbmNsdWRlUmVqZWN0OiAhdGhpcy5faXNDb2xsYXBzZWQgfSxcblx0XHQpO1xuXG5cdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTtcblxuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctdXNlZCcpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9mZWVkYmFja1RleHRhcmVhICYmIHJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSAmJiByZXZpZXcuZHJhZnRGZWVkYmFjaykge1xuXHRcdFx0dGhpcy5fZmVlZGJhY2tUZXh0YXJlYS52YWx1ZSA9IHJldmlldy5kcmFmdEZlZWRiYWNrO1xuXHRcdFx0Ly8gTWF0Y2ggdGhlIGF1dG8tcmVzaXplIHdpcmVkIHVwIG9uIGBpbnB1dGAgc28gYSBtdWx0aS1saW5lXG5cdFx0XHQvLyByZXN0b3JlZCBkcmFmdCByZW5kZXJzIHdpdGggdGhlIHJpZ2h0IGhlaWdodC5cblx0XHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEuc3R5bGUuaGVpZ2h0ID0gJ2F1dG8nO1xuXHRcdFx0dGhpcy5fZmVlZGJhY2tUZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBgJHt0aGlzLl9mZWVkYmFja1RleHRhcmVhLnNjcm9sbEhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbW90ZSBpbnRvIHJldmlldyBtb2RlIGlmIGlubGluZSBmZWVkYmFjayBpcyBhbHJlYWR5IHByZXNlbnRcblx0XHQvLyAoZS5nLiByZXN0b3JlZCBmcm9tIGEgcHJpb3Igc2Vzc2lvbikuXG5cdFx0aWYgKCF0aGlzLl9pc1N1Ym1pdHRlZCAmJiB0aGlzLmdldElubGluZUZlZWRiYWNrSXRlbXMoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR2b2lkIHRoaXMuZW50ZXJGZWVkYmFja01vZGUoeyBmb2N1czogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3YXRjaFBsYW5DaGFuZ2VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5yZXZpZXcucGxhblVyaSB8fCB0aGlzLnJldmlldy5pc091dGRhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhblVyaSA9IFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSk7XG5cdFx0Y29uc3QgbW9kZWxMaXN0ZW5lciA9IHRoaXMuX3BsYW5DaGFuZ2VMaXN0ZW5lcnMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCB3YXRjaE1vZGVsID0gKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbChtb2RlbC51cmksIHBsYW5VcmkpKSB7XG5cdFx0XHRcdG1vZGVsTGlzdGVuZXIudmFsdWUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy5tYXJrT3V0ZGF0ZWQoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHBsYW5VcmkpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0d2F0Y2hNb2RlbChtb2RlbCk7XG5cdFx0fVxuXHRcdHRoaXMuX3BsYW5DaGFuZ2VMaXN0ZW5lcnMuYWRkKHRoaXMuX21vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQod2F0Y2hNb2RlbCkpO1xuXHRcdGNvbnN0IHdhdGNoZXIgPSB0aGlzLl9wbGFuQ2hhbmdlTGlzdGVuZXJzLmFkZCh0aGlzLl9maWxlU2VydmljZS5jcmVhdGVXYXRjaGVyKHBsYW5VcmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblx0XHR0aGlzLl9wbGFuQ2hhbmdlTGlzdGVuZXJzLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5jb250YWlucyhwbGFuVXJpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSB8fCAoIXRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChwbGFuVXJpKSAmJiBldmVudC5jb250YWlucyhwbGFuVXJpLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCkpKSB7XG5cdFx0XHRcdHRoaXMubWFya091dGRhdGVkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXJrT3V0ZGF0ZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucmV2aWV3LmlzT3V0ZGF0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJldmlldy5pc091dGRhdGVkID0gdHJ1ZTtcblx0XHRkb20uc2hvdyh0aGlzLl9vdXRkYXRlZEJhZGdlRWwpO1xuXHRcdHRoaXMuX3BsYW5DaGFuZ2VMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5vdXRkYXRlZEFubm91bmNlbWVudCcsICdQbGFuIHN1bW1hcnkgaXMgb3V0ZGF0ZWQnKSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIF9mb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBfZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKG90aGVyLmtpbmQgIT09ICdwbGFuUmV2aWV3Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoISFvdGhlci5pc1VzZWQgIT09ICEhdGhpcy5yZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJldmlldy5yZXNvbHZlSWQgJiYgb3RoZXIucmVzb2x2ZUlkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXZpZXcucmVzb2x2ZUlkID09PSBvdGhlci5yZXNvbHZlSWQ7XG5cdFx0fVxuXHRcdHJldHVybiBvdGhlciA9PT0gdGhpcy5yZXZpZXc7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duKCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fbWVzc2FnZUVsKTtcblx0XHQvLyBQYXJlbnQgdGhlIHN0b3JlIGJlZm9yZSBwb3B1bGF0aW5nIHNvIHRoZSBsZWFrIHRyYWNrZXIgZG9lc24ndCBmbGFnIGl0LlxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX21lc3NhZ2VDb250ZW50RGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCByZW5kZXJlZCA9IHN0b3JlLmFkZCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoXG5cdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcodGhpcy5yZXZpZXcuY29udGVudCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSwgaXNUcnVzdGVkOiBmYWxzZSB9KSxcblx0XHRcdGdldENoYXRNYXJrZG93blJlbmRlck9wdGlvbnMoeyBhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpIH0pXG5cdFx0KSk7XG5cdFx0dGhpcy5fbWVzc2FnZUVsLmFwcGVuZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGZWVkYmFjayhzZWN0aW9uOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUoc2VjdGlvbik7XG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChzZWN0aW9uLCBkb20uJCgnLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2staGVhZGVyJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuZmVlZGJhY2tMYWJlbCcsICdGZWVkYmFjaycpO1xuXG5cdFx0Y29uc3QgaGVhZGVyQWN0aW9ucyA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2staGVhZGVyLWFjdGlvbnMnKSk7XG5cblx0XHQvLyBDbGVhciBBbGwgXHUyMDE0IHZpc2liaWxpdHkgaXMgdG9nZ2xlZCB3aXRoIHRoZSBjb21tZW50cyBsaXN0LlxuXHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRjb25zdCBjbGVhckFsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jbGVhckFsbCcsIFwiQ2xlYXIgQWxsXCIpO1xuXHRcdFx0Y29uc3QgY2xlYXJBbGxCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGhlYWRlckFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIHRpdGxlOiBjbGVhckFsbExhYmVsLCBhcmlhTGFiZWw6IGNsZWFyQWxsTGFiZWwgfSkpO1xuXHRcdFx0Y2xlYXJBbGxCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLWNsZWFyLWFsbCcpO1xuXHRcdFx0Y2xlYXJBbGxCdXR0b24ubGFiZWwgPSBjbGVhckFsbExhYmVsO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2xlYXJBbGxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmNsZWFyQWxsSW5saW5lRmVlZGJhY2soKSkpO1xuXHRcdFx0dGhpcy5fY2xlYXJBbGxCdXR0b25FbCA9IGNsZWFyQWxsQnV0dG9uLmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xvc2UgXHUyMDE0IG5vbi1kZXN0cnVjdGl2ZSBleGl0IGZyb20gZmVlZGJhY2sgbW9kZS4gUGVyLXJvdyBcdTAwRDcgYnV0dG9uc1xuXHRcdC8vIGFuZCBDbGVhciBBbGwgaGFuZGxlIGRlbGV0aW9uIGV4cGxpY2l0bHkuXG5cdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdGNvbnN0IGNsb3NlQnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmNsb3NlJywgXCJDbG9zZVwiKTtcblx0XHRcdGNvbnN0IGNsb3NlQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihoZWFkZXJBY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCB0aXRsZTogY2xvc2VCdXR0b25MYWJlbCwgYXJpYUxhYmVsOiBjbG9zZUJ1dHRvbkxhYmVsIH0pKTtcblx0XHRcdGNsb3NlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1wbGFuLXJldmlldy10aXRsZS1idXR0b24nLCAnY2hhdC1wbGFuLXJldmlldy10aXRsZS1pY29uLWJ1dHRvbicsICdjaGF0LXBsYW4tcmV2aWV3LWZlZWRiYWNrLWNsb3NlJyk7XG5cdFx0XHRjbG9zZUJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jbG9zZVNtYWxsLmlkfSlgO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2xvc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmV4aXRGZWVkYmFja01vZGUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIElubGluZSBjb21tZW50cyBsaXN0IFx1MjAxNCB3cmFwcGVkIGluIGEgTW9uYWNvIHNjcm9sbGFibGUgZm9yIGEgc3R5bGVkXG5cdFx0Ly8gc2Nyb2xsYmFyIGNvbnNpc3RlbnQgd2l0aCB0aGUgcmVzdCBvZiB0aGUgd29ya2JlbmNoLlxuXHRcdHRoaXMuX2NvbW1lbnRzTGlzdEVsID0gZG9tLiQoJy5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnRzLWxpc3QnKTtcblx0XHR0aGlzLl9jb21tZW50c0xpc3RTY3JvbGxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuX2NvbW1lbnRzTGlzdEVsLCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX2NvbW1lbnRzTGlzdFNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctY29tbWVudHMtbGlzdC1zY3JvbGxhYmxlJyk7XG5cdFx0ZG9tLmFwcGVuZChzZWN0aW9uLCB0aGlzLl9jb21tZW50c0xpc3RTY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cdFx0ZG9tLmhpZGUodGhpcy5fY29tbWVudHNMaXN0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMucmVuZGVyQ29tbWVudHNMaXN0KCk7XG5cblx0XHRjb25zdCB0ZXh0YXJlYSA9IGRvbS5hcHBlbmQoc2VjdGlvbiwgZG9tLiQ8SFRNTFRleHRBcmVhRWxlbWVudD4oJ3RleHRhcmVhLmNoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stdGV4dGFyZWEnKSk7XG5cdFx0dGV4dGFyZWEucm93cyA9IDE7XG5cdFx0dGV4dGFyZWEucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmZlZWRiYWNrUGxhY2Vob2xkZXInLCAnQWRkIGFuIG92ZXJhbGwgY29tbWVudCBmb3IgdGhlIGFnZW50Li4uJyk7XG5cdFx0dGhpcy5fZmVlZGJhY2tUZXh0YXJlYSA9IHRleHRhcmVhO1xuXG5cdFx0Ly8gTWF0Y2hlcyB0aGUgYmVoYXZpb3VyIG9mIHRoZSBxdWVzdGlvbiBjYXJvdXNlbCBmcmVlZm9ybSB0ZXh0YXJlYTpcblx0XHQvLyBncm93IHRvIGZpdCBjb250ZW50LCBjYXBwZWQgdmlhIENTUyBgbWF4LWhlaWdodGAuXG5cdFx0Y29uc3QgYXV0b1Jlc2l6ZSA9ICgpID0+IHtcblx0XHRcdHRleHRhcmVhLnN0eWxlLmhlaWdodCA9ICdhdXRvJztcblx0XHRcdHRleHRhcmVhLnN0eWxlLmhlaWdodCA9IGAke3RleHRhcmVhLnNjcm9sbEhlaWdodH1weGA7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGV4dGFyZWEsIGRvbS5FdmVudFR5cGUuSU5QVVQsICgpID0+IHtcblx0XHRcdGF1dG9SZXNpemUoKTtcblx0XHRcdC8vIEF1dG8tcmVzaXplIGZpcmVzIF9vbkRpZENoYW5nZUhlaWdodCB3aGljaCBjYW4gc2hpZnQgc2libGluZ1xuXHRcdFx0Ly8gbGF5b3V0OyByZXNjYW4gc28gdGhlIGJvZHkncyBzY3JvbGxiYXIgZ2VvbWV0cnkgc3RheXMgYWNjdXJhdGUuXG5cdFx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0aWYgKHRoaXMucmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhKSB7XG5cdFx0XHRcdHRoaXMucmV2aWV3LmRyYWZ0RmVlZGJhY2sgPSB0ZXh0YXJlYS52YWx1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRcdHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2Uubm90aWZ5RmVlZGJhY2tDaGFuZ2VkKFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBjYWNoZWQgU3VibWl0IGJ1dHRvbiByYXRoZXIgdGhhbiByZS1yZW5kZXJpbmcgdGhlXG5cdFx0XHQvLyB3aG9sZSBidXR0b24gcm93IG9uIGV2ZXJ5IGtleXN0cm9rZS5cblx0XHRcdHRoaXMudXBkYXRlU3VibWl0QnV0dG9uU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFbnRlciBzdWJtaXRzIGZlZWRiYWNrOyBTaGlmdCtFbnRlciBpbnNlcnRzIGEgbmV3bGluZS4gT25seSB3aXJlZFxuXHRcdC8vIHVwIGluIHBsYW4tbW9kZSAod2hlcmUgU3VibWl0IEZlZWRiYWNrIGlzIHRoZSBwcmltYXJ5IGFjdGlvbikuXG5cdFx0Ly8gSW4gdGhlIG5vLXBsYW5VcmkgdGV4dGFyZWEtb25seSBmbG93IHRoZSB1c2VyIG11c3QgZXhwbGljaXRseSBwaWNrXG5cdFx0Ly8gQXBwcm92ZSBvciBSZWplY3QsIHNvIEVudGVyIGZhbGxzIHRocm91Z2ggdG8gdGhlIGRlZmF1bHQgbmV3bGluZVxuXHRcdC8vIGJlaGF2aW91ciB0byBhdm9pZCBhbiBhY2NpZGVudGFsIGZlZWRiYWNrLW9ubHkgc3VibWl0LlxuXHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRleHRhcmVhLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBldiA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRcdGlmIChldi5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFldi5zaGlmdEtleSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5zdWJtaXRGZWVkYmFjaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb21tZW50c0xpc3QoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb21tZW50c0xpc3RFbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50Um93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NvbW1lbnRzTGlzdEVsKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCk7XG5cdFx0aWYgKHRoaXMuX2NsZWFyQWxsQnV0dG9uRWwpIHtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGRvbS5zaG93KHRoaXMuX2NsZWFyQWxsQnV0dG9uRWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5fY2xlYXJBbGxCdXR0b25FbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNjcm9sbGFibGVOb2RlID0gdGhpcy5fY29tbWVudHNMaXN0U2Nyb2xsYWJsZT8uZ2V0RG9tTm9kZSgpO1xuXHRcdGlmIChpdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGlmIChzY3JvbGxhYmxlTm9kZSkge1xuXHRcdFx0XHRkb20uaGlkZShzY3JvbGxhYmxlTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb21tZW50c0xpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Nyb2xsYWJsZU5vZGUpIHtcblx0XHRcdGRvbS5zaG93KHNjcm9sbGFibGVOb2RlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IHJvdyA9IGRvbS5hcHBlbmQodGhpcy5fY29tbWVudHNMaXN0RWwsIGRvbS4kKCcuY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXJvdycpKTtcblx0XHRcdGNvbnN0IHJvd0xhYmVsID0gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jb21tZW50Um93QXJpYUxhYmVsJywgJ0xpbmUgezB9OiB7MX0nLCBpdGVtLmxpbmUsIGl0ZW0udGV4dCk7XG5cblx0XHRcdGNvbnN0IHJldmVhbEJ1dHRvbiA9IGRvbS5hcHBlbmQocm93LCBkb20uJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmV2ZWFsJykpO1xuXHRcdFx0cmV2ZWFsQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdHJldmVhbEJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByb3dMYWJlbCk7XG5cblx0XHRcdGNvbnN0IGxpbmVFbCA9IGRvbS5hcHBlbmQocmV2ZWFsQnV0dG9uLCBkb20uJCgnc3Bhbi5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtbGluZScpKTtcblx0XHRcdGxpbmVFbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuY29tbWVudFJvd0xpbmUnLCAnTGluZSB7MH0nLCBpdGVtLmxpbmUpO1xuXG5cdFx0XHRjb25zdCB0ZXh0RWwgPSBkb20uYXBwZW5kKHJldmVhbEJ1dHRvbiwgZG9tLiQoJ3NwYW4uY2hhdC1wbGFuLXJldmlldy1jb21tZW50LXRleHQnKSk7XG5cdFx0XHR0ZXh0RWwudGV4dENvbnRlbnQgPSBpdGVtLnRleHQ7XG5cblx0XHRcdHRoaXMuX2NvbW1lbnRSb3dEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyZXZlYWxCdXR0b24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZXZlYWxJbmxpbmVDb21tZW50KGl0ZW0pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCByZW1vdmVMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmVtb3ZlQ29tbWVudCcsIFwiUmVtb3ZlIGNvbW1lbnQgb24gbGluZSB7MH1cIiwgaXRlbS5saW5lKTtcblx0XHRcdGNvbnN0IHJlbW92ZUJ1dHRvbiA9IGRvbS5hcHBlbmQocm93LCBkb20uJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5jaGF0LXBsYW4tcmV2aWV3LWNvbW1lbnQtcmVtb3ZlJykpO1xuXHRcdFx0cmVtb3ZlQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdHJlbW92ZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByZW1vdmVMYWJlbCk7XG5cdFx0XHRyZW1vdmVCdXR0b24udGl0bGUgPSByZW1vdmVMYWJlbDtcblx0XHRcdHJlbW92ZUJ1dHRvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uY2xvc2VTbWFsbCkpO1xuXG5cdFx0XHR0aGlzLl9jb21tZW50Um93RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocmVtb3ZlQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5yZW1vdmVJbmxpbmVDb21tZW50KGl0ZW0uaWQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tZW50c0xpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCk6IHJlYWRvbmx5IElQbGFuUmV2aWV3RmVlZGJhY2tJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLnJldmlldy5wbGFuVXJpXG5cdFx0XHQ/IHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2soVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSlcblx0XHRcdDogW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldmVhbElubGluZUNvbW1lbnQoaXRlbTogSVBsYW5SZXZpZXdGZWVkYmFja0l0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwbGFuVXJpID0gdGhpcy5yZXZpZXcucGxhblVyaSA/IFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFwbGFuVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2Uuc2V0TmF2aWdhdGlvbkFuY2hvcihwbGFuVXJpLCBpdGVtLmlkKTtcblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IGl0ZW0ucmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0Li4uKGlzRXF1YWwoaXRlbS5yZXNvdXJjZSwgcGxhblVyaSkgPyB7IG92ZXJyaWRlOiBNQVJLRE9XTl9FRElUT1JfSUQgfSA6IHt9KSxcblx0XHRcdFx0c2VsZWN0aW9uOiB7IHN0YXJ0TGluZU51bWJlcjogaXRlbS5saW5lLCBzdGFydENvbHVtbjogaXRlbS5jb2x1bW4gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUlubGluZUNvbW1lbnQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UucmVtb3ZlRmVlZGJhY2soVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSwgaXRlbUlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFyQWxsSW5saW5lRmVlZGJhY2soKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuY2xlYXJBbGxDb25maXJtJywgJ0NsZWFyIHswfSBpbmxpbmUgY29tbWVudChzKT8nLCBpdGVtcy5sZW5ndGgpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmNsZWFyQWxsRGV0YWlsJywgJ1RoZXNlIGNvbW1lbnRzIHdpbGwgYmUgcmVtb3ZlZCBmcm9tIHRoZSBwbGFuIGZpbGUgYW5kIG5vdCBzZW50IHRvIHRoZSBhZ2VudC4nKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuY2xlYXJBbGxDb25maXJtUHJpbWFyeScsICdDbGVhciBBbGwnKSxcblx0XHR9KTtcblx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuY2xlYXJGZWVkYmFjayhVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uSW5saW5lRmVlZGJhY2tDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpO1xuXG5cdFx0Ly8gQXV0by1wcm9tb3RlIGludG8gcmV2aWV3IG1vZGUgdGhlIGZpcnN0IHRpbWUgYSBjb21tZW50IHNob3dzIHVwLlxuXHRcdGlmIChpdGVtcy5sZW5ndGggPiAwICYmICF0aGlzLl9pc0ZlZWRiYWNrTW9kZSkge1xuXHRcdFx0dm9pZCB0aGlzLmVudGVyRmVlZGJhY2tNb2RlKHsgZm9jdXM6IGZhbHNlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyQ29tbWVudHNMaXN0KCk7XG5cdFx0aWYgKHRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN1Ym1pdEJ1dHRvblN0YXRlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX21lc3NhZ2VTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgYWN0aW9uIGJ1dHRvbnMgaW50byB0aGUgYWN0aXZlIGNvbnRhaW5lciAoZm9vdGVyIHdoZW5cblx0ICogZXhwYW5kZWQsIGlubGluZSB0aXRsZSBzbG90IHdoZW4gY29sbGFwc2VkKS4gQ2xlYXJzIHRoZSBpbmFjdGl2ZSBzbG90XG5cdCAqIHNvIHRoZSBzYW1lIGJ1dHRvbnMgY2FuIG5ldmVyIGFwcGVhciBpbiB0d28gcGxhY2VzIGF0IG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckN1cnJlbnRBY3Rpb25CdXR0b25zKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9pc0NvbGxhcHNlZCA/IHRoaXMuX2lubGluZUFjdGlvbnNFbCA6IHRoaXMuX2Zvb3RlckJ1dHRvbnNFbDtcblx0XHRjb25zdCBvdGhlciA9IHRoaXMuX2lzQ29sbGFwc2VkID8gdGhpcy5fZm9vdGVyQnV0dG9uc0VsIDogdGhpcy5faW5saW5lQWN0aW9uc0VsO1xuXHRcdGRvbS5jbGVhck5vZGUob3RoZXIpO1xuXHRcdHRoaXMucmVuZGVyQWN0aW9uQnV0dG9ucyh0YXJnZXQsIHsgaW5jbHVkZVJlamVjdDogIXRoaXMuX2lzQ29sbGFwc2VkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBY3Rpb25CdXR0b25zKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM/OiB7IGluY2x1ZGVSZWplY3Q/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBpbmNsdWRlUmVqZWN0ID0gb3B0aW9ucz8uaW5jbHVkZVJlamVjdCA/PyB0cnVlO1xuXHRcdHRoaXMuX2J1dHRvblN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3VibWl0QnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlbmRlcmVkU3VibWl0SW5saW5lQ291bnQgPSAtMTtcblx0XHRkb20uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHQvLyBJbiBmZWVkYmFjayBtb2RlLCBzaG93IFN1Ym1pdCArIFJlamVjdC4gU3VibWl0J3MgbGFiZWwgaW5jbHVkZXNcblx0XHQvLyB0aGUgY291bnQgb2YgcGVuZGluZyBpbmxpbmUgY29tbWVudHMuXG5cdFx0aWYgKHRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHRjb25zdCBpbmxpbmVDb3VudCA9IHRoaXMuZ2V0SW5saW5lRmVlZGJhY2tJdGVtcygpLmxlbmd0aDtcblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IG5ldyBCdXR0b24oY29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHN1cHBvcnRJY29uczogdHJ1ZSB9KTtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5sYWJlbCA9IHRoaXMuY29tcHV0ZVN1Ym1pdExhYmVsKGlubGluZUNvdW50KTtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5lbmFibGVkID0gdGhpcy5jYW5TdWJtaXRGZWVkYmFjaygpO1xuXHRcdFx0dGhpcy5fc3VibWl0QnV0dG9uID0gc3VibWl0QnV0dG9uO1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRTdWJtaXRJbmxpbmVDb3VudCA9IGlubGluZUNvdW50O1xuXHRcdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKHN1Ym1pdEJ1dHRvbik7XG5cdFx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQoc3VibWl0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdm9pZCB0aGlzLnN1Ym1pdEZlZWRiYWNrKCkpKTtcblxuXHRcdFx0aWYgKGluY2x1ZGVSZWplY3QpIHtcblx0XHRcdFx0Y29uc3QgcmVqZWN0QnV0dG9uID0gbmV3IEJ1dHRvbihjb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pO1xuXHRcdFx0XHRyZWplY3RCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJlamVjdCcsICdSZWplY3QnKTtcblx0XHRcdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKHJlamVjdEJ1dHRvbik7XG5cdFx0XHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChyZWplY3RCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnN1Ym1pdFJlamVjdGlvbigpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQXBwcm92ZSBidXR0b24gZmlyc3QgKGJsdWUpLiBVc2VzIEJ1dHRvbldpdGhEcm9wZG93biB3aGVuIHRoZXJlIGFyZVxuXHRcdC8vIGV4dHJhIGFjdGlvbnM7IG90aGVyd2lzZSBhIHBsYWluIEJ1dHRvbi5cblx0XHRjb25zdCBwcmltYXJ5ID0gdGhpcy5fc2VsZWN0ZWRBY3Rpb247XG5cdFx0Y29uc3QgbW9yZUFjdGlvbnMgPSB0aGlzLnJldmlldy5hY3Rpb25zLmZpbHRlcihhID0+IGEgIT09IHByaW1hcnkpO1xuXG5cdFx0bGV0IGFwcHJvdmVCdXR0b246IElCdXR0b247XG5cdFx0aWYgKG1vcmVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGFwcHJvdmVCdXR0b24gPSBuZXcgQnV0dG9uV2l0aERyb3Bkb3duKGNvbnRhaW5lciwge1xuXHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuX2NvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0YWRkUHJpbWFyeUFjdGlvblRvRHJvcGRvd246IGZhbHNlLFxuXHRcdFx0XHRhY3Rpb25zOiBtb3JlQWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdFx0XHRjb25zdCBidXR0b24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zdWJtaXRBcHByb3ZhbChhY3Rpb24pO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0YnV0dG9uLnRvb2x0aXAgPSBhY3Rpb24uZGVzY3JpcHRpb24gfHwgJyc7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2J1dHRvblN0b3JlLmFkZChidXR0b24pO1xuXHRcdFx0XHR9KSBhcyAoQWN0aW9uIHwgU2VwYXJhdG9yKVtdLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFwcHJvdmVCdXR0b24gPSBuZXcgQnV0dG9uKGNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzdXBwb3J0SWNvbnM6IHRydWUgfSk7XG5cdFx0fVxuXHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChhcHByb3ZlQnV0dG9uKTtcblx0XHRhcHByb3ZlQnV0dG9uLmxhYmVsID0gcHJpbWFyeS5sYWJlbDtcblx0XHRpZiAocHJpbWFyeS5kZXNjcmlwdGlvbikge1xuXHRcdFx0YXBwcm92ZUJ1dHRvbi5lbGVtZW50LnRpdGxlID0gcHJpbWFyeS5kZXNjcmlwdGlvbjtcblx0XHR9XG5cdFx0dGhpcy5fYnV0dG9uU3RvcmUuYWRkKGFwcHJvdmVCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnN1Ym1pdEFwcHJvdmFsKHByaW1hcnkpKSk7XG5cblx0XHQvLyBSZWplY3QgYnV0dG9uIChncmV5IHNlY29uZGFyeSkgaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIGFwcHJvdmUgYnV0dG9uXG5cdFx0Ly8gc28gdGhlIHByaW1hcnkgQXBwcm92ZSAvIFJlamVjdCBwYWlyIHN0YXlzIGdyb3VwZWQgdG9nZXRoZXIgXHUyMDE0XG5cdFx0Ly8gb21pdHRlZCBpbiB0aGUgY29sbGFwc2VkIHRpdGxlIGJhciAocGFyaXR5IHdpdGhcblx0XHQvLyBjaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydCB3aGljaCBvbmx5IHN1cmZhY2VzIHRoZSBwcmltYXJ5XG5cdFx0Ly8gYWN0aW9uIHdoZW4gY29sbGFwc2VkKS5cblx0XHRpZiAoaW5jbHVkZVJlamVjdCkge1xuXHRcdFx0Y29uc3QgcmVqZWN0QnV0dG9uID0gbmV3IEJ1dHRvbihjb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlIH0pO1xuXHRcdFx0cmVqZWN0QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5yZWplY3QnLCAnUmVqZWN0Jyk7XG5cdFx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQocmVqZWN0QnV0dG9uKTtcblx0XHRcdHRoaXMuX2J1dHRvblN0b3JlLmFkZChyZWplY3RCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnN1Ym1pdFJlamVjdGlvbigpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYW5TdWJtaXRGZWVkYmFjaygpOiBib29sZWFuIHtcblx0XHRjb25zdCB0ZXh0YXJlYVRleHQgPSB0aGlzLl9mZWVkYmFja1RleHRhcmVhPy52YWx1ZS50cmltKCkgPz8gJyc7XG5cdFx0aWYgKHRleHRhcmVhVGV4dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldElubGluZUZlZWRiYWNrSXRlbXMoKS5sZW5ndGggPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlU3VibWl0TGFiZWwoaW5saW5lQ291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGlubGluZUNvdW50ID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnN1Ym1pdEZlZWRiYWNrV2l0aENvdW50JywgJ1N1Ym1pdCBGZWVkYmFjayAoezB9KScsIGlubGluZUNvdW50KVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnN1Ym1pdEZlZWRiYWNrJywgJ1N1Ym1pdCBGZWVkYmFjaycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgY2FjaGVkIFN1Ym1pdCBidXR0b24ncyBlbmFibGVkIHN0YXRlIGFuZCBsYWJlbCB3aXRob3V0XG5cdCAqIGRlc3Ryb3lpbmcgdGhlIGJ1dHRvbiByb3cuIENoZWFwIGVub3VnaCB0byBydW4gb24gZXZlcnkga2V5c3Ryb2tlLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVTdWJtaXRCdXR0b25TdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3N1Ym1pdEJ1dHRvbiB8fCAhdGhpcy5faXNGZWVkYmFja01vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3VibWl0QnV0dG9uLmVuYWJsZWQgPSB0aGlzLmNhblN1Ym1pdEZlZWRiYWNrKCk7XG5cdFx0Y29uc3QgaW5saW5lQ291bnQgPSB0aGlzLmdldElubGluZUZlZWRiYWNrSXRlbXMoKS5sZW5ndGg7XG5cdFx0aWYgKGlubGluZUNvdW50ICE9PSB0aGlzLl9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50KSB7XG5cdFx0XHR0aGlzLl9zdWJtaXRCdXR0b24ubGFiZWwgPSB0aGlzLmNvbXB1dGVTdWJtaXRMYWJlbChpbmxpbmVDb3VudCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50ID0gaW5saW5lQ291bnQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVDb2xsYXBzZWQoKTogdm9pZCB7XG5cdFx0Ly8gQW5ub3VuY2UgdGhlIHRvZ2dsZSBiZWZvcmUgdGhlIHJvdyBncm93cyBzbyB0aGUgbGlzdCBhbmNob3JzIHRoaXMgcGFydCdzIGhlYWRlciBpbnN0ZWFkXG5cdFx0Ly8gb2YgYXV0by1zY3JvbGxpbmcgdG8gdGhlIG5ldyBlbmQgb2YgdGhlIHRyYW5zY3JpcHQgd2hlbiBpdCBpcyBhbHJlYWR5IGF0IHRoZSBib3R0b20uXG5cdFx0dGhpcy5kb21Ob2RlLmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9ICF0aGlzLl9pc0NvbGxhcHNlZDtcblx0XHRpZiAodGhpcy5yZXZpZXcgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdHRoaXMucmV2aWV3LmRyYWZ0Q29sbGFwc2VkID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQ29sbGFwc2VkUHJlc2VudGF0aW9uKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcGxhbi1yZXZpZXctY29sbGFwc2VkJywgdGhpcy5faXNDb2xsYXBzZWQpO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsID0gdGhpcy5faXNDb2xsYXBzZWRcblx0XHRcdD8gYCQoJHtDb2RpY29uLmNoZXZyb25VcC5pZH0pYFxuXHRcdFx0OiBgJCgke0NvZGljb24uY2hldnJvbkRvd24uaWR9KWA7XG5cdFx0Y29uc3QgY29sbGFwc2VUb29sdGlwID0gdGhpcy5faXNDb2xsYXBzZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5leHBhbmQnLCAnRXhwYW5kJylcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5jb2xsYXBzZScsICdDb2xsYXBzZScpO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY29sbGFwc2VUb29sdGlwKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghdGhpcy5faXNDb2xsYXBzZWQpKTtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5zZXRUaXRsZShjb2xsYXBzZVRvb2x0aXApO1xuXG5cdFx0Ly8gQ29sbGFwc2VkIHRpdGxlIGJhciB1c2VzIGEgcGVuY2lsIGljb247IGV4cGFuZGVkIHVzZXMgYSB0ZXh0XG5cdFx0Ly8gbGFiZWwgdGhhdCBoaW50cyBhdCB0aGUgZmVlZGJhY2sgZmxvdy5cblx0XHRpZiAodGhpcy5fcmV2aWV3QnV0dG9uKSB7XG5cdFx0XHRjb25zdCBpc0ljb25Pbmx5ID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdFx0XHR0aGlzLl9yZXZpZXdCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXBsYW4tcmV2aWV3LXRpdGxlLWljb24tYnV0dG9uJywgaXNJY29uT25seSk7XG5cdFx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRcdGxldCB0b29sdGlwOiBzdHJpbmc7XG5cdFx0XHRpZiAoaXNJY29uT25seSkge1xuXHRcdFx0XHRsYWJlbCA9IGAkKCR7Q29kaWNvbi5lZGl0LmlkfSlgO1xuXHRcdFx0XHRjb25zdCBmaWxlTmFtZSA9IHRoaXMucmV2aWV3LnBsYW5VcmkgPyBiYXNlbmFtZShVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpKSA6ICcnO1xuXHRcdFx0XHR0b29sdGlwID0gdGhpcy5yZXZpZXcuY2FuUHJvdmlkZUZlZWRiYWNrXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJldmlld1Rvb2x0aXAnLCAnUmV2aWV3IHswfScsIGZpbGVOYW1lKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5vcGVuVG9vbHRpcCcsICdPcGVuIHswfScsIGZpbGVOYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gdGhpcy5yZXZpZXcucGxhblVyaSA/IGJhc2VuYW1lKFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpIDogJyc7XG5cdFx0XHRcdGlmICh0aGlzLnJldmlldy5jYW5Qcm92aWRlRmVlZGJhY2spIHtcblx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmV2aWV3QnV0dG9uTGFiZWwnLCBcIk9wZW4gRnVsbCBQbGFuXCIpO1xuXHRcdFx0XHRcdHRvb2x0aXAgPSBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJldmlld1Rvb2x0aXAnLCAnUmV2aWV3IHswfScsIGZpbGVOYW1lKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlbkJ1dHRvbkxhYmVsJywgXCJPcGVuIFBsYW5cIik7XG5cdFx0XHRcdFx0dG9vbHRpcCA9IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlblRvb2x0aXAnLCAnT3BlbiB7MH0nLCBmaWxlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jldmlld0J1dHRvbi5sYWJlbCA9IGxhYmVsO1xuXHRcdFx0dGhpcy5fcmV2aWV3QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdG9vbHRpcCk7XG5cdFx0XHR0aGlzLl9yZXZpZXdCdXR0b24uc2V0VGl0bGUodG9vbHRpcCk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBhY3Rpb24gYnV0dG9ucyBiZXR3ZWVuIGZvb3RlciAoZXhwYW5kZWQpIGFuZCBpbmxpbmUgdGl0bGVcblx0XHQvLyBzbG90IChjb2xsYXBzZWQpLiBSZWplY3QgaXMgb21pdHRlZCB3aGVuIGNvbGxhcHNlZC5cblx0XHR0aGlzLnJlbmRlckN1cnJlbnRBY3Rpb25CdXR0b25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVudGVyUmV2aWV3TW9kZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBSZWFkLW9ubHkgLyBzdWJtaXR0ZWQgcGxhbnM6IGZhbGwgYmFjayB0byBvcGVuaW5nIHRoZSBmaWxlIGluIGFuIGVkaXRvci5cblx0XHRpZiAoIXRoaXMucmV2aWV3LmNhblByb3ZpZGVGZWVkYmFjayB8fCB0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0aWYgKHRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgb3ZlcnJpZGU6IE1BUktET1dOX0VESVRPUl9JRCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzQ29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHRoaXMucmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhKSB7XG5cdFx0XHRcdHRoaXMucmV2aWV3LmRyYWZ0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmVudGVyRmVlZGJhY2tNb2RlKHsgZm9jdXM6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdEFwcHJvdmFsKGFjdGlvbjogSUNoYXRQbGFuQXBwcm92YWxBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQgfHwgdGhpcy5faXNTdWJtaXR0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhY3Rpb24ucGVybWlzc2lvbkxldmVsID09PSAnYXV0b3BpbG90Jykge1xuXHRcdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1BdXRvcGlsb3QoKTtcblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpICYmICFhd2FpdCB0aGlzLnNhdmVQbGFuRmlsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdC8vIE9ubHkgdGhlIHRleHRhcmVhLW9ubHkgZmxvdyAobm8gcGxhblVyaSkgYXR0YWNoZXMgYSBkcmFmdCB0byB0aGUgYWN0aW9uIGNsaWNrLlxuXHRcdFx0Y29uc3QgcmlkZXNBbG9uZyA9ICF0aGlzLnJldmlldy5wbGFuVXJpO1xuXHRcdFx0Y29uc3QgdGV4dGFyZWFGZWVkYmFjayA9IHJpZGVzQWxvbmcgPyB0aGlzLl9mZWVkYmFja1RleHRhcmVhPy52YWx1ZS50cmltKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vcHRpb25zLm9uU3VibWl0KHtcblx0XHRcdFx0YWN0aW9uOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdC4uLihhY3Rpb24uaWQgPyB7IGFjdGlvbklkOiBhY3Rpb24uaWQgfSA6IHt9KSxcblx0XHRcdFx0cmVqZWN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHQuLi4odGV4dGFyZWFGZWVkYmFjayA/IHsgZmVlZGJhY2s6IHRleHRhcmVhRmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0XHR2b2lkIHRoaXMubWFya1VzZWQoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0XHR0aGlzLl9pc1N1Ym1pdHRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdFJlamVjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5faXNTdWJtaXR0ZWQgfHwgdGhpcy5faXNTdWJtaXR0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpICYmICFhd2FpdCB0aGlzLnNhdmVQbGFuRmlsZSgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHJpZGVzQWxvbmcgPSAhdGhpcy5yZXZpZXcucGxhblVyaTtcblx0XHRcdGNvbnN0IHRleHRhcmVhRmVlZGJhY2sgPSByaWRlc0Fsb25nID8gdGhpcy5fZmVlZGJhY2tUZXh0YXJlYT8udmFsdWUudHJpbSgpIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdCh7XG5cdFx0XHRcdHJlamVjdGVkOiB0cnVlLFxuXHRcdFx0XHQuLi4odGV4dGFyZWFGZWVkYmFjayA/IHsgZmVlZGJhY2s6IHRleHRhcmVhRmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0XHR2b2lkIHRoaXMubWFya1VzZWQoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N1Ym1pdHRlZCkge1xuXHRcdFx0XHR0aGlzLl9pc1N1Ym1pdHRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVQbGFuRmlsZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBwbGFuVXJpID0gVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKTtcblx0XHRpZiAodGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkocGxhblVyaSkgJiYgIWF3YWl0IHRoaXMuX3RleHRGaWxlU2VydmljZS5zYXZlKHBsYW5VcmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0aWYgKCF0aGlzLnVwZGF0ZVBsYW5Db250ZW50RnJvbU1vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5yZXZpZXcuY29udGVudCA9IChhd2FpdCB0aGlzLl90ZXh0RmlsZVNlcnZpY2UucmVhZChwbGFuVXJpKSkudmFsdWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQbGFuQ29udGVudEZyb21Nb2RlbCgpOiBib29sZWFuIHtcblx0XHRpZiAoISh0aGlzLnJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkgfHwgIXRoaXMucmV2aWV3LnBsYW5VcmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl90ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KFVSSS5yZXZpdmUodGhpcy5yZXZpZXcucGxhblVyaSkpO1xuXHRcdGlmICghbW9kZWw/LmlzUmVzb2x2ZWQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLnJldmlldy5jb250ZW50ID0gbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVudGVyRmVlZGJhY2tNb2RlKG9wdGlvbnM/OiB7IGZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHRpZiAodGhpcy5yZXZpZXcucGxhblVyaSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucmV2aXZlKHRoaXMucmV2aWV3LnBsYW5VcmkpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBvdmVycmlkZTogTUFSS0RPV05fRURJVE9SX0lEIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChvcHRpb25zPy5mb2N1cykge1xuXHRcdFx0XHR0aGlzLmZvY3VzRmVlZGJhY2tJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc0ZlZWRiYWNrTW9kZSA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrU2VjdGlvbikge1xuXHRcdFx0ZG9tLnNob3codGhpcy5fZmVlZGJhY2tTZWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcGxhbi1yZXZpZXctZmVlZGJhY2stbW9kZScpO1xuXHRcdHRoaXMucmVuZGVyQ29tbWVudHNMaXN0KCk7XG5cdFx0Ly8gYHVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbmAgcmUtcmVuZGVycyB0aGUgYWN0aW9uIGJ1dHRvbnMsIHNvIHdlIGRvbid0IGNhbGxcblx0XHQvLyBgcmVuZGVyQ3VycmVudEFjdGlvbkJ1dHRvbnNgIGV4cGxpY2l0bHkgaGVyZSB0byBhdm9pZCBkb3VibGUgd29yay5cblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXHRcdGlmICh0aGlzLnJldmlldy5wbGFuVXJpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSxcblx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIG92ZXJyaWRlOiBNQVJLRE9XTl9FRElUT1JfSUQgfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMucmV2aWV3LnBsYW5VcmkgJiYgb3B0aW9ucz8uZm9jdXMgIT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLmZvY3VzRmVlZGJhY2tJbnB1dCgpO1xuXHRcdH1cblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZXhpdEZlZWRiYWNrTW9kZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzRmVlZGJhY2tNb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNGZWVkYmFja01vZGUgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fZmVlZGJhY2tTZWN0aW9uKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl9mZWVkYmFja1NlY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1wbGFuLXJldmlldy1mZWVkYmFjay1tb2RlJyk7XG5cdFx0Ly8gYHVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbmAgcmUtcmVuZGVycyB0aGUgYWN0aW9uIGJ1dHRvbnMuXG5cdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTtcblx0XHR0aGlzLl9tZXNzYWdlU2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNGZWVkYmFja0lucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN1Ym1pdEZlZWRiYWNrKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9pc1N1Ym1pdHRlZCB8fCB0aGlzLl9pc1N1Ym1pdHRpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dGFyZWFGZWVkYmFjayA9IHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWE/LnZhbHVlLnRyaW0oKTtcblxuXHRcdGNvbnN0IGVkaXRvckZlZWRiYWNrSXRlbXMgPSBbLi4udGhpcy5nZXRJbmxpbmVGZWVkYmFja0l0ZW1zKCldO1xuXG5cdFx0aWYgKCF0ZXh0YXJlYUZlZWRiYWNrICYmIGVkaXRvckZlZWRiYWNrSXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5zYXZlUGxhbkZpbGUoKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEtlZXAgb3ZlcmFsbCBhbmQgaW5saW5lIGJsb2NrcyBzZXBhcmF0ZSBzbyB0aGUgdHJhbnNjcmlwdCBjYW4gcmVuZGVyIHRoZW0gZGlzdGluY3RseS5cblx0XHRcdGxldCBmZWVkYmFja0lubGluZU1hcmtkb3duOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZWRpdG9yRmVlZGJhY2tJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zQnlSZXNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBJUGxhblJldmlld0ZlZWRiYWNrSXRlbVtdPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZWRpdG9yRmVlZGJhY2tJdGVtcykge1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IGl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtcyA9IGl0ZW1zQnlSZXNvdXJjZS5nZXQoa2V5KSA/PyBbXTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdGl0ZW1zQnlSZXNvdXJjZS5zZXQoa2V5LCBpdGVtcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2VjdGlvbnMgPSBbLi4uaXRlbXNCeVJlc291cmNlLnZhbHVlcygpXS5mbGF0TWFwKGl0ZW1zID0+IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmlubGluZUNvbW1lbnRzSGVhZGluZycsIFwiSW5saW5lIGNvbW1lbnRzIG9uIGB7MH1gOlwiLCBiYXNlbmFtZShpdGVtc1swXS5yZXNvdXJjZSkpLFxuXHRcdFx0XHRcdC4uLml0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gaXRlbS5jb2x1bW4gPiAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5pbmxpbmVDb21tZW50TG9jYXRpb24nLCBcIkxpbmUgezB9LCBDb2x1bW4gezF9XCIsIGl0ZW0ubGluZSwgaXRlbS5jb2x1bW4pXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5pbmxpbmVDb21tZW50TG9jYXRpb25MaW5lJywgXCJMaW5lIHswfVwiLCBpdGVtLmxpbmUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGAtICoqJHtsb2NhdGlvbn06KiogJHtpdGVtLnRleHR9YDtcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGZlZWRiYWNrSW5saW5lTWFya2Rvd24gPSBzZWN0aW9ucy5qb2luKCdcXG4nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodGV4dGFyZWFGZWVkYmFjaykge1xuXHRcdFx0XHRzZWN0aW9ucy5wdXNoKHRleHRhcmVhRmVlZGJhY2spO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZlZWRiYWNrSW5saW5lTWFya2Rvd24pIHtcblx0XHRcdFx0c2VjdGlvbnMucHVzaChmZWVkYmFja0lubGluZU1hcmtkb3duKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmVlZGJhY2sgPSBzZWN0aW9ucy5qb2luKCdcXG5cXG4nKTtcblx0XHRcdHRoaXMuX2lzU3VibWl0dGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHBsYW5VcmkgPSB0aGlzLnJldmlldy5wbGFuVXJpID8gVVJJLnJldml2ZSh0aGlzLnJldmlldy5wbGFuVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwbGFuVXJpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBlZGl0b3JGZWVkYmFja0l0ZW1zKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGxhblJldmlld0ZlZWRiYWNrU2VydmljZS5yZW1vdmVGZWVkYmFjayhwbGFuVXJpLCBpdGVtLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdCh7XG5cdFx0XHRcdHJlamVjdGVkOiBmYWxzZSxcblx0XHRcdFx0ZmVlZGJhY2ssXG5cdFx0XHRcdGZlZWRiYWNrT3ZlcmFsbDogdGV4dGFyZWFGZWVkYmFjayB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdGZlZWRiYWNrSW5saW5lTWFya2Rvd24sXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMubWFya1VzZWQoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzU3VibWl0dGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lzU3VibWl0dGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybUF1dG9waWxvdCgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5hdXRvcGlsb3QudGl0bGUnLCAnRW5hYmxlIEF1dG9waWxvdD8nKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmF1dG9waWxvdC5jb25maXJtJywgJ0VuYWJsZScpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuYXV0b3BpbG90LmNhbmNlbCcsICdDYW5jZWwnKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGljb246IENvZGljb24ucm9ja2V0LFxuXHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7XG5cdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmF1dG9waWxvdC5kZXRhaWwnLCAnQXV0b3BpbG90IHdpbGwgYXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzIGFuZCBjb250aW51ZSB3b3JraW5nIGF1dG9ub21vdXNseSB1bnRpbCB0aGUgdGFzayBpcyBjb21wbGV0ZS4gVGhpcyBpbmNsdWRlcyB0ZXJtaW5hbCBjb21tYW5kcywgZmlsZSBlZGl0cywgYW5kIGV4dGVybmFsIHRvb2wgY2FsbHMuIFRoZSBhZ2VudCB3aWxsIG1ha2UgZGVjaXNpb25zIG9uIHlvdXIgYmVoYWxmIHdpdGhvdXQgYXNraW5nIGZvciBjb25maXJtYXRpb24uXFxuXFxuWW91IGNhbiBzdG9wIHRoZSBhZ2VudCBhdCBhbnkgdGltZSBieSBjbGlja2luZyB0aGUgc3RvcCBidXR0b24uIFRoaXMgYXBwbGllcyB0byB0aGUgY3VycmVudCBzZXNzaW9uIG9ubHkuJykpLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5yZXN1bHQgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1hcmtVc2VkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXBsYW4tcmV2aWV3LXVzZWQnKTtcblx0XHR0aGlzLl9idXR0b25TdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX3N1Ym1pdEJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZW5kZXJlZFN1Ym1pdElubGluZUNvdW50ID0gLTE7XG5cdFx0Ly8gSGlkZSB0aGUgZWRpdG9yIGNvbnRyaWJ1dGlvbiBldmVuIGlmIHRoZSBwbGFuIGZpbGUgaXMgc3RpbGwgb3Blbi5cblx0XHR0aGlzLl9wbGFuUmV2aWV3UmVnaXN0cmF0aW9uLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEpIHtcblx0XHRcdHRoaXMuX2ZlZWRiYWNrVGV4dGFyZWEuZGlzYWJsZWQgPSB0cnVlO1xuXHRcdH1cblx0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
