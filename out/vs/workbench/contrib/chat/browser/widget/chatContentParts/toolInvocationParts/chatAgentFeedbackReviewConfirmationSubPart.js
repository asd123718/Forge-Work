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
import * as dom from "../../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Checkbox } from "../../../../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { DisposableMap, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { FileKind } from "../../../../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../../../platform/notification/common/notification.js";
import { defaultCheckboxStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../../../browser/labels.js";
import { AgentFeedbackReviewCommandId, IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCollapsibleContentPart } from "../chatCollapsibleContentPart.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
import "../media/chatAgentFeedbackReviewConfirmation.css";
let ChatAgentFeedbackReviewConfirmationSubPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService, commandService, logService, notificationService, hoverService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.commandService = commandService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.hoverService = hoverService;
    this.codeblocks = [];
    this._rows = /* @__PURE__ */ new Map();
    this._rowStores = this._register(new DisposableMap());
    this._onDidChangeRevealButtonDisablement = this._register(new Emitter());
    const data = toolInvocation.toolSpecificData;
    if (!data || data.kind !== "agentFeedbackReviewConfirmation") {
      throw new Error("Agent feedback review confirmation data is missing");
    }
    this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    const listElement = dom.$(".chat-agent-feedback-review-list");
    void this._populate(listElement);
    const revealLabel = data.options[0] ?? localize("agentFeedback.reveal", "Reveal Selected");
    const buttons = [
      {
        label: revealLabel,
        data: () => this._onReveal(),
        disabled: true,
        onDidChangeDisablement: this._onDidChangeRevealButtonDisablement.event
      },
      {
        label: localize("agentFeedback.cancel", "Cancel"),
        isSecondary: true,
        data: () => this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.Skipped })
      }
    ];
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title: this.getTitle(),
        icon: Codicon.commentDiscussion,
        message: listElement,
        buttons
      }
    ));
    const hasToolConfirmation = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmation.set(true);
    this._register(confirmWidget.onDidClick(({ button, isTouchClick }) => {
      button.data();
      if (!isTouchClick) {
        this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
      }
    }));
    this._register(toDisposable(() => hasToolConfirmation.reset()));
    this.domNode = confirmWidget.domNode;
  }
  get _sessionResource() {
    return this.context.element.sessionResource;
  }
  async _populate(listElement) {
    let comments = [];
    try {
      comments = await this.commandService.executeCommand(
        AgentFeedbackReviewCommandId.GetComments,
        this._sessionResource
      ) ?? [];
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to fetch unreviewed comments", error);
    }
    if (this._store.isDisposed) {
      return;
    }
    dom.clearNode(listElement);
    if (!comments.length) {
      listElement.append(dom.$(".chat-agent-feedback-review-empty", void 0, localize("agentFeedback.none", "No unreviewed comments.")));
      return;
    }
    for (const comment of comments) {
      this._renderRow(listElement, comment);
    }
  }
  _renderRow(listElement, comment) {
    const rowStore = new DisposableStore();
    this._rowStores.set(comment.id, rowStore);
    const rowElement = dom.append(listElement, dom.$(".chat-agent-feedback-review-row"));
    const checkbox = rowStore.add(new Checkbox(
      localize("agentFeedback.revealComment", "Reveal this comment to the agent"),
      true,
      defaultCheckboxStyles
    ));
    dom.append(rowElement, checkbox.domNode);
    const main = dom.append(rowElement, dom.$(".chat-agent-feedback-review-main"));
    const header = dom.append(main, dom.$(".chat-agent-feedback-review-header"));
    if (comment.kindLabel) {
      dom.append(header, dom.$(".chat-agent-feedback-review-kind", void 0, comment.kindLabel));
    }
    const fileUri = URI.revive(comment.fileUri);
    const fileLabel = rowStore.add(this._resourceLabels.create(header));
    fileLabel.element.classList.add("chat-agent-feedback-review-file");
    fileLabel.setResource(
      { resource: fileUri, name: basename(fileUri) },
      { fileKind: FileKind.FILE, title: fileUri.fsPath || fileUri.path }
    );
    this._renderCommentText(rowStore, main, comment.text);
    const actionsContainer = dom.append(rowElement, dom.$(".chat-agent-feedback-review-actions"));
    const actionBar = rowStore.add(new ActionBar(actionsContainer));
    actionBar.push(rowStore.add(new Action(
      "agentFeedbackReview.reveal",
      localize("agentFeedback.openFile", "Open File and Reveal Comment"),
      ThemeIcon.asClassName(Codicon.goToFile),
      true,
      () => this._reveal(comment.id)
    )), { icon: true, label: false });
    actionBar.push(rowStore.add(new Action(
      "agentFeedbackReview.delete",
      localize("agentFeedback.delete", "Delete Comment"),
      ThemeIcon.asClassName(Codicon.closeSmall),
      true,
      () => this._delete(comment.id)
    )), { icon: true, label: false });
    this._rows.set(comment.id, { comment, checkbox, element: rowElement });
    rowStore.add(checkbox.onChange(() => this._updateRevealButtonDisablement()));
    this._updateRevealButtonDisablement();
  }
  _updateRevealButtonDisablement() {
    this._onDidChangeRevealButtonDisablement.fire(![...this._rows.values()].some((row) => row.checkbox.checked));
  }
  /**
   * Renders the comment body clamped to two visual lines by default, with an
   * expand/collapse toggle in the bottom-right corner. The toggle and the
   * fade/ellipsis affordance only appear when the text actually overflows two
   * lines; overflow is re-evaluated whenever the available width changes.
   */
  _renderCommentText(rowStore, main, text) {
    const container = dom.append(main, dom.$(".chat-agent-feedback-review-text-container"));
    const textElement = dom.append(container, dom.$(".chat-agent-feedback-review-text"));
    textElement.textContent = text;
    const toggle = dom.append(container, dom.$("button.chat-agent-feedback-review-expand-toggle"));
    toggle.type = "button";
    toggle.tabIndex = 0;
    const toggleIcon = dom.append(toggle, dom.$("span.codicon"));
    toggleIcon.setAttribute("aria-hidden", "true");
    const expandLabel = localize("agentFeedback.expandComment", "Show More");
    const collapseLabel = localize("agentFeedback.collapseComment", "Show Less");
    let expanded = false;
    const renderState = () => {
      container.classList.toggle("collapsed", !expanded);
      container.classList.toggle("expanded", expanded);
      toggleIcon.classList.toggle("codicon-chevron-down", !expanded);
      toggleIcon.classList.toggle("codicon-chevron-up", expanded);
      toggle.setAttribute("aria-label", expanded ? collapseLabel : expandLabel);
      toggle.setAttribute("aria-expanded", String(expanded));
    };
    const isOverflowing = () => {
      const wasExpanded = expanded;
      if (wasExpanded) {
        container.classList.add("collapsed");
        container.classList.remove("expanded");
      }
      const overflowing = textElement.scrollHeight - textElement.clientHeight > 1;
      if (wasExpanded) {
        container.classList.remove("collapsed");
        container.classList.add("expanded");
      }
      return overflowing;
    };
    const updateOverflow = () => {
      const overflowing = isOverflowing();
      container.classList.toggle("overflowing", overflowing);
      if (!overflowing && expanded) {
        expanded = false;
        renderState();
      }
    };
    rowStore.add(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      toggle,
      () => expanded ? collapseLabel : expandLabel
    ));
    rowStore.add(dom.addDisposableListener(toggle, dom.EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      container.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
      expanded = !expanded;
      renderState();
    }));
    renderState();
    const targetWindow = dom.getWindow(container);
    const observer = new targetWindow.ResizeObserver(() => updateOverflow());
    observer.observe(textElement);
    rowStore.add(toDisposable(() => observer.disconnect()));
  }
  async _reveal(commentId) {
    try {
      await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Reveal, this._sessionResource, commentId);
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to reveal comment", error);
    }
  }
  async _delete(commentId) {
    const row = this._rows.get(commentId);
    try {
      await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Delete, this._sessionResource, commentId);
      row?.element.remove();
      this._rows.delete(commentId);
      this._rowStores.deleteAndDispose(commentId);
      this._updateRevealButtonDisablement();
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to delete comment", error);
    }
  }
  async _onReveal() {
    const checkedIds = [];
    for (const row of this._rows.values()) {
      if (row.checkbox.checked) {
        checkedIds.push(row.comment.id);
      }
    }
    if (!checkedIds.length) {
      return;
    }
    try {
      await this.commandService.executeCommand(AgentFeedbackReviewCommandId.Accept, this._sessionResource, checkedIds);
    } catch (error) {
      this.logService.warn("[AgentFeedbackReview] Failed to accept comments", error);
      this.notificationService.notify({
        severity: Severity.Error,
        message: localize("agentFeedback.acceptFailed", "Failed to reveal the selected comments. Please try again.")
      });
      return;
    }
    this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
  }
  createContentElement() {
    return "";
  }
  getTitle() {
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return "";
    }
    const title = state.confirmationMessages?.title;
    return typeof title === "string" ? title : title?.value ?? "";
  }
};
ChatAgentFeedbackReviewConfirmationSubPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, IChatToolRiskAssessmentService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, ILogService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IHoverService)
], ChatAgentFeedbackReviewConfirmationSubPart);
export {
  ChatAgentFeedbackReviewConfirmationSubPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25TdWJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0Q2hlY2tib3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQsIElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1lbnQsIElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0luZm8sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEN1c3RvbUNvbmZpcm1hdGlvbldpZGdldCwgSUNoYXRDb25maXJtYXRpb25CdXR0b24gfSBmcm9tICcuLi9jaGF0Q29uZmlybWF0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2Fic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0ICcuLi9tZWRpYS9jaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbi5jc3MnO1xuXG5pbnRlcmZhY2UgSUNvbW1lbnRSb3cge1xuXHRyZWFkb25seSBjb21tZW50OiBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb21tZW50O1xuXHRyZWFkb25seSBjaGVja2JveDogQ2hlY2tib3g7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG4vKipcbiAqIENvbmZpcm1hdGlvbiBmb3IgdGhlIGFnZW50IGhvc3QgYHZpZXdVbnJldmlld2VkQ29tbWVudHNgIHRvb2wuIExpc3RzIHRoZVxuICogcmV2aWV3IGNvbW1lbnRzIHRoZSB1c2VyIGhhcyBub3QgYWNjZXB0ZWQgeWV0IFx1MjAxNCBlYWNoIHdpdGggYSBjaGVja2JveCAocmV2ZWFsXG4gKiB0byB0aGUgYWdlbnQgb3Igbm90KSwgYW4gYWN0aW9uIHRvIG9wZW4gdGhlIGZpbGUgYXQgdGhlIGNvbW1lbnQsIGFuZCBhblxuICogYWN0aW9uIHRvIGRlbGV0ZSB0aGUgY29tbWVudC4gQWNjZXB0aW5nIHJldmVhbHMgKGFjY2VwdHMpIHRoZSBjaGVja2VkXG4gKiBjb21tZW50cyBiZWZvcmUgYXBwcm92aW5nIHRoZSB0b29sIGNhbGw7IHRoZSBjb21tZW50cyBhbmQgYWxsIGFjdGlvbnMgYXJlXG4gKiBmZXRjaGVkL2FwcGxpZWQgdmlhIHtAbGluayBBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkfSBjb21tYW5kcyBzbyB0aGlzXG4gKiBsYXllciBzdGF5cyBkZWNvdXBsZWQgZnJvbSB0aGUgYHZzL3Nlc3Npb25zYCBmZWVkYmFjayBtb2RlbC5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uU3ViUGFydCBleHRlbmRzIEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQge1xuXHRwdWJsaWMgb3ZlcnJpZGUgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvd3MgPSBuZXcgTWFwPHN0cmluZywgSUNvbW1lbnRSb3c+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvd1N0b3JlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VMYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJldmVhbEJ1dHRvbkRpc2FibGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIHJpc2tBc3Nlc3NtZW50U2VydmljZTogSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbiwgY29udGV4dCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHJpc2tBc3Nlc3NtZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBkYXRhID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRpZiAoIWRhdGEgfHwgZGF0YS5raW5kICE9PSAnYWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvbicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgZmVlZGJhY2sgcmV2aWV3IGNvbmZpcm1hdGlvbiBkYXRhIGlzIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNvdXJjZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXG5cdFx0Y29uc3QgbGlzdEVsZW1lbnQgPSBkb20uJCgnLmNoYXQtYWdlbnQtZmVlZGJhY2stcmV2aWV3LWxpc3QnKTtcblx0XHR2b2lkIHRoaXMuX3BvcHVsYXRlKGxpc3RFbGVtZW50KTtcblxuXHRcdGNvbnN0IHJldmVhbExhYmVsID0gZGF0YS5vcHRpb25zWzBdID8/IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLnJldmVhbCcsIFwiUmV2ZWFsIFNlbGVjdGVkXCIpO1xuXHRcdGNvbnN0IGJ1dHRvbnM6IElDaGF0Q29uZmlybWF0aW9uQnV0dG9uPCgpID0+IHZvaWQ+W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiByZXZlYWxMYWJlbCxcblx0XHRcdFx0ZGF0YTogKCkgPT4gdGhpcy5fb25SZXZlYWwoKSxcblx0XHRcdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlRGlzYWJsZW1lbnQ6IHRoaXMuX29uRGlkQ2hhbmdlUmV2ZWFsQnV0dG9uRGlzYWJsZW1lbnQuZXZlbnQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRkYXRhOiAoKSA9PiB0aGlzLmNvbmZpcm1XaXRoKHRoaXMudG9vbEludm9jYXRpb24sIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgfSksXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCBjb25maXJtV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDdXN0b21Db25maXJtYXRpb25XaWRnZXQ8KCkgPT4gdm9pZD4sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiB0aGlzLmdldFRpdGxlKCksXG5cdFx0XHRcdGljb246IENvZGljb24uY29tbWVudERpc2N1c3Npb24sXG5cdFx0XHRcdG1lc3NhZ2U6IGxpc3RFbGVtZW50LFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgaGFzVG9vbENvbmZpcm1hdGlvbiA9IENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1Rvb2xDb25maXJtYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGhhc1Rvb2xDb25maXJtYXRpb24uc2V0KHRydWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlybVdpZGdldC5vbkRpZENsaWNrKCh7IGJ1dHRvbiwgaXNUb3VjaENsaWNrIH0pID0+IHtcblx0XHRcdGJ1dHRvbi5kYXRhKCk7XG5cdFx0XHRpZiAoIWlzVG91Y2hDbGljaykge1xuXHRcdFx0XHR0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk/LmZvY3VzSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gaGFzVG9vbENvbmZpcm1hdGlvbi5yZXNldCgpKSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gY29uZmlybVdpZGdldC5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX3Nlc3Npb25SZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wb3B1bGF0ZShsaXN0RWxlbWVudDogSFRNTEVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY29tbWVudHM6IHJlYWRvbmx5IElDaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1lbnRbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb21tZW50cyA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWVudFtdPihcblx0XHRcdFx0QWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZC5HZXRDb21tZW50cyxcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0KSA/PyBbXTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tBZ2VudEZlZWRiYWNrUmV2aWV3XSBGYWlsZWQgdG8gZmV0Y2ggdW5yZXZpZXdlZCBjb21tZW50cycsIGVycm9yKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5jbGVhck5vZGUobGlzdEVsZW1lbnQpO1xuXHRcdGlmICghY29tbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRsaXN0RWxlbWVudC5hcHBlbmQoZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1lbXB0eScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2FnZW50RmVlZGJhY2subm9uZScsIFwiTm8gdW5yZXZpZXdlZCBjb21tZW50cy5cIikpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNvbW1lbnQgb2YgY29tbWVudHMpIHtcblx0XHRcdHRoaXMuX3JlbmRlclJvdyhsaXN0RWxlbWVudCwgY29tbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyUm93KGxpc3RFbGVtZW50OiBIVE1MRWxlbWVudCwgY29tbWVudDogSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHJvd1N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Jvd1N0b3Jlcy5zZXQoY29tbWVudC5pZCwgcm93U3RvcmUpO1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSBkb20uYXBwZW5kKGxpc3RFbGVtZW50LCBkb20uJCgnLmNoYXQtYWdlbnQtZmVlZGJhY2stcmV2aWV3LXJvdycpKTtcblxuXHRcdGNvbnN0IGNoZWNrYm94ID0gcm93U3RvcmUuYWRkKG5ldyBDaGVja2JveChcblx0XHRcdGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLnJldmVhbENvbW1lbnQnLCBcIlJldmVhbCB0aGlzIGNvbW1lbnQgdG8gdGhlIGFnZW50XCIpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGRlZmF1bHRDaGVja2JveFN0eWxlcyxcblx0XHQpKTtcblx0XHRkb20uYXBwZW5kKHJvd0VsZW1lbnQsIGNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0Y29uc3QgbWFpbiA9IGRvbS5hcHBlbmQocm93RWxlbWVudCwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1tYWluJykpO1xuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQobWFpbiwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1oZWFkZXInKSk7XG5cdFx0aWYgKGNvbW1lbnQua2luZExhYmVsKSB7XG5cdFx0XHRkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1raW5kJywgdW5kZWZpbmVkLCBjb21tZW50LmtpbmRMYWJlbCkpO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLnJldml2ZShjb21tZW50LmZpbGVVcmkpO1xuXHRcdGNvbnN0IGZpbGVMYWJlbCA9IHJvd1N0b3JlLmFkZCh0aGlzLl9yZXNvdXJjZUxhYmVscy5jcmVhdGUoaGVhZGVyKSk7XG5cdFx0ZmlsZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctZmlsZScpO1xuXHRcdGZpbGVMYWJlbC5zZXRSZXNvdXJjZShcblx0XHRcdHsgcmVzb3VyY2U6IGZpbGVVcmksIG5hbWU6IGJhc2VuYW1lKGZpbGVVcmkpIH0sXG5cdFx0XHR7IGZpbGVLaW5kOiBGaWxlS2luZC5GSUxFLCB0aXRsZTogZmlsZVVyaS5mc1BhdGggfHwgZmlsZVVyaS5wYXRoIH0sXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlbmRlckNvbW1lbnRUZXh0KHJvd1N0b3JlLCBtYWluLCBjb21tZW50LnRleHQpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93RWxlbWVudCwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHJvd1N0b3JlLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIpKTtcblx0XHRhY3Rpb25CYXIucHVzaChyb3dTdG9yZS5hZGQobmV3IEFjdGlvbihcblx0XHRcdCdhZ2VudEZlZWRiYWNrUmV2aWV3LnJldmVhbCcsXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5vcGVuRmlsZScsIFwiT3BlbiBGaWxlIGFuZCBSZXZlYWwgQ29tbWVudFwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdvVG9GaWxlKSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLl9yZXZlYWwoY29tbWVudC5pZCksXG5cdFx0KSksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdGFjdGlvbkJhci5wdXNoKHJvd1N0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0J2FnZW50RmVlZGJhY2tSZXZpZXcuZGVsZXRlJyxcblx0XHRcdGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLmRlbGV0ZScsIFwiRGVsZXRlIENvbW1lbnRcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZVNtYWxsKSxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLl9kZWxldGUoY29tbWVudC5pZCksXG5cdFx0KSksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5fcm93cy5zZXQoY29tbWVudC5pZCwgeyBjb21tZW50LCBjaGVja2JveCwgZWxlbWVudDogcm93RWxlbWVudCB9KTtcblx0XHRyb3dTdG9yZS5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlUmV2ZWFsQnV0dG9uRGlzYWJsZW1lbnQoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVJldmVhbEJ1dHRvbkRpc2FibGVtZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZXZlYWxCdXR0b25EaXNhYmxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJldmVhbEJ1dHRvbkRpc2FibGVtZW50LmZpcmUoIVsuLi50aGlzLl9yb3dzLnZhbHVlcygpXS5zb21lKHJvdyA9PiByb3cuY2hlY2tib3guY2hlY2tlZCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIGNvbW1lbnQgYm9keSBjbGFtcGVkIHRvIHR3byB2aXN1YWwgbGluZXMgYnkgZGVmYXVsdCwgd2l0aCBhblxuXHQgKiBleHBhbmQvY29sbGFwc2UgdG9nZ2xlIGluIHRoZSBib3R0b20tcmlnaHQgY29ybmVyLiBUaGUgdG9nZ2xlIGFuZCB0aGVcblx0ICogZmFkZS9lbGxpcHNpcyBhZmZvcmRhbmNlIG9ubHkgYXBwZWFyIHdoZW4gdGhlIHRleHQgYWN0dWFsbHkgb3ZlcmZsb3dzIHR3b1xuXHQgKiBsaW5lczsgb3ZlcmZsb3cgaXMgcmUtZXZhbHVhdGVkIHdoZW5ldmVyIHRoZSBhdmFpbGFibGUgd2lkdGggY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckNvbW1lbnRUZXh0KHJvd1N0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIG1haW46IEhUTUxFbGVtZW50LCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uYXBwZW5kKG1haW4sIGRvbS4kKCcuY2hhdC1hZ2VudC1mZWVkYmFjay1yZXZpZXctdGV4dC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgdGV4dEVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy10ZXh0JykpO1xuXHRcdHRleHRFbGVtZW50LnRleHRDb250ZW50ID0gdGV4dDtcblxuXHRcdGNvbnN0IHRvZ2dsZSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJDxIVE1MQnV0dG9uRWxlbWVudD4oJ2J1dHRvbi5jaGF0LWFnZW50LWZlZWRiYWNrLXJldmlldy1leHBhbmQtdG9nZ2xlJykpO1xuXHRcdHRvZ2dsZS50eXBlID0gJ2J1dHRvbic7XG5cdFx0dG9nZ2xlLnRhYkluZGV4ID0gMDtcblx0XHRjb25zdCB0b2dnbGVJY29uID0gZG9tLmFwcGVuZCh0b2dnbGUsIGRvbS4kKCdzcGFuLmNvZGljb24nKSk7XG5cdFx0dG9nZ2xlSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGV4cGFuZExhYmVsID0gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2suZXhwYW5kQ29tbWVudCcsIFwiU2hvdyBNb3JlXCIpO1xuXHRcdGNvbnN0IGNvbGxhcHNlTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5jb2xsYXBzZUNvbW1lbnQnLCBcIlNob3cgTGVzc1wiKTtcblxuXHRcdGxldCBleHBhbmRlZCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcmVuZGVyU3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWV4cGFuZGVkKTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGV4cGFuZGVkKTtcblx0XHRcdHRvZ2dsZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnY29kaWNvbi1jaGV2cm9uLWRvd24nLCAhZXhwYW5kZWQpO1xuXHRcdFx0dG9nZ2xlSWNvbi5jbGFzc0xpc3QudG9nZ2xlKCdjb2RpY29uLWNoZXZyb24tdXAnLCBleHBhbmRlZCk7XG5cdFx0XHR0b2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZXhwYW5kZWQgPyBjb2xsYXBzZUxhYmVsIDogZXhwYW5kTGFiZWwpO1xuXHRcdFx0dG9nZ2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpc092ZXJmbG93aW5nID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Ly8gYHNjcm9sbEhlaWdodGAgcmVmbGVjdHMgdGhlIGZ1bGwgY29udGVudCBoZWlnaHQgZXZlbiB3aGlsZSBjbGFtcGVkLFxuXHRcdFx0Ly8gc28gY29tcGFyZSBpdCBhZ2FpbnN0IHRoZSAoY2xhbXBlZCkgYGNsaWVudEhlaWdodGAuIE1lYXN1cmUgaW4gdGhlXG5cdFx0XHQvLyBjb2xsYXBzZWQgc3RhdGUsIHJlc3RvcmluZyB0aGUgcHJldmlvdXMgc3RhdGUgaW4gdGhlIHNhbWUgZnJhbWUgc29cblx0XHRcdC8vIG5vIGludGVybWVkaWF0ZSBsYXlvdXQgaXMgcGFpbnRlZC5cblx0XHRcdGNvbnN0IHdhc0V4cGFuZGVkID0gZXhwYW5kZWQ7XG5cdFx0XHRpZiAod2FzRXhwYW5kZWQpIHtcblx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNlZCcpO1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZXhwYW5kZWQnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG92ZXJmbG93aW5nID0gdGV4dEVsZW1lbnQuc2Nyb2xsSGVpZ2h0IC0gdGV4dEVsZW1lbnQuY2xpZW50SGVpZ2h0ID4gMTtcblx0XHRcdGlmICh3YXNFeHBhbmRlZCkge1xuXHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY29sbGFwc2VkJyk7XG5cdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdleHBhbmRlZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG92ZXJmbG93aW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVPdmVyZmxvdyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG92ZXJmbG93aW5nID0gaXNPdmVyZmxvd2luZygpO1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ292ZXJmbG93aW5nJywgb3ZlcmZsb3dpbmcpO1xuXHRcdFx0aWYgKCFvdmVyZmxvd2luZyAmJiBleHBhbmRlZCkge1xuXHRcdFx0XHRleHBhbmRlZCA9IGZhbHNlO1xuXHRcdFx0XHRyZW5kZXJTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyb3dTdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoXG5cdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLFxuXHRcdFx0dG9nZ2xlLFxuXHRcdFx0KCkgPT4gZXhwYW5kZWQgPyBjb2xsYXBzZUxhYmVsIDogZXhwYW5kTGFiZWwsXG5cdFx0KSk7XG5cblx0XHRyb3dTdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0b2dnbGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdC8vIEFubm91bmNlIHRoZSB0b2dnbGUgYmVmb3JlIHRoZSByb3cgZ3Jvd3Mgc28gdGhlIGxpc3QgYW5jaG9ycyB0aGlzIGNvbW1lbnQgaW5zdGVhZCBvZlxuXHRcdFx0Ly8gYXV0by1zY3JvbGxpbmcgdG8gdGhlIG5ldyBlbmQgb2YgdGhlIHRyYW5zY3JpcHQgd2hlbiBpdCBpcyBhbHJlYWR5IGF0IHRoZSBib3R0b20uXG5cdFx0XHRjb250YWluZXIuZGlzcGF0Y2hFdmVudChuZXcgQ3VzdG9tRXZlbnQoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCB7IGJ1YmJsZXM6IHRydWUgfSkpO1xuXHRcdFx0ZXhwYW5kZWQgPSAhZXhwYW5kZWQ7XG5cdFx0XHRyZW5kZXJTdGF0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdHJlbmRlclN0YXRlKCk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgdGFyZ2V0V2luZG93LlJlc2l6ZU9ic2VydmVyKCgpID0+IHVwZGF0ZU92ZXJmbG93KCkpO1xuXHRcdG9ic2VydmVyLm9ic2VydmUodGV4dEVsZW1lbnQpO1xuXHRcdHJvd1N0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXZlYWwoY29tbWVudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkLlJldmVhbCwgdGhpcy5fc2Vzc2lvblJlc291cmNlLCBjb21tZW50SWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0FnZW50RmVlZGJhY2tSZXZpZXddIEZhaWxlZCB0byByZXZlYWwgY29tbWVudCcsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kZWxldGUoY29tbWVudElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByb3cgPSB0aGlzLl9yb3dzLmdldChjb21tZW50SWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQuRGVsZXRlLCB0aGlzLl9zZXNzaW9uUmVzb3VyY2UsIGNvbW1lbnRJZCk7XG5cdFx0XHRyb3c/LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLl9yb3dzLmRlbGV0ZShjb21tZW50SWQpO1xuXHRcdFx0dGhpcy5fcm93U3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoY29tbWVudElkKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJldmVhbEJ1dHRvbkRpc2FibGVtZW50KCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWdlbnRGZWVkYmFja1Jldmlld10gRmFpbGVkIHRvIGRlbGV0ZSBjb21tZW50JywgZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uUmV2ZWFsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoZWNrZWRJZHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCByb3cgb2YgdGhpcy5fcm93cy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHJvdy5jaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdGNoZWNrZWRJZHMucHVzaChyb3cuY29tbWVudC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghY2hlY2tlZElkcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQWNjZXB0IHRoZSBjaGVja2VkIGNvbW1lbnRzIGJlZm9yZSBhcHByb3ZpbmcgdGhlIHRvb2wgY2FsbCBzbyB0aGVcblx0XHQvLyBhbm5vdGF0aW9uIHdyaXRlcyBhcmUgZGlzcGF0Y2hlZCBhaGVhZCBvZiB0aGUgYXBwcm92YWwgb24gdGhlIHNhbWVcblx0XHQvLyBjb25uZWN0aW9uOyB0aGUgc2VydmVyIHRvb2wgYm9keSB0aGVuIHJlYWRzIHRoZSB1cGRhdGVkIHN0YXRlIGFuZFxuXHRcdC8vIHJldHVybnMgZXhhY3RseSB0aGUgcmV2ZWFsZWQgY29tbWVudHMuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQWdlbnRGZWVkYmFja1Jldmlld0NvbW1hbmRJZC5BY2NlcHQsIHRoaXMuX3Nlc3Npb25SZXNvdXJjZSwgY2hlY2tlZElkcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQWdlbnRGZWVkYmFja1Jldmlld10gRmFpbGVkIHRvIGFjY2VwdCBjb21tZW50cycsIGVycm9yKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLmFjY2VwdEZhaWxlZCcsIFwiRmFpbGVkIHRvIHJldmVhbCB0aGUgc2VsZWN0ZWQgY29tbWVudHMuIFBsZWFzZSB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY29uZmlybVdpdGgodGhpcy50b29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVDb250ZW50RWxlbWVudCgpOiBIVE1MRWxlbWVudCB8IHN0cmluZyB7XG5cdFx0Ly8gVGhpcyBjb25maXJtYXRpb24gYnVpbGRzIGl0cyBvd24gd2lkZ2V0IGNvbnRlbnQgKHRoZSBjb21tZW50IGxpc3QpIGluXG5cdFx0Ly8gdGhlIGNvbnN0cnVjdG9yIGFuZCBuZXZlciBnb2VzIHRocm91Z2ggdGhlIGJhc2UgYHJlbmRlcigpYCBmbG93LCBzb1xuXHRcdC8vIHRoaXMgaXMgdW51c2VkLiBSZXR1cm4gYW4gZW1wdHkgc3RyaW5nIHJhdGhlciB0aGFuIHRocm93aW5nIHNvIHRoZVxuXHRcdC8vIGNsYXNzIHN0YXlzIHNhZmUgaWYgYSBmdXR1cmUgcmVmYWN0b3Igcm91dGVzIHRocm91Z2ggYHJlbmRlcigpYC5cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGUgPSBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGU7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlPy52YWx1ZSA/PyAnJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywr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
