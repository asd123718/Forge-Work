import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import "../media/chatToolConfirmationCarousel.css";
const COLLAPSED_CAROUSEL_MAX_HEIGHT = 300;
const COLLAPSED_MESSAGE_MAX_HEIGHT = 200;
const COLLAPSED_CODE_BLOCK_MAX_HEIGHT = 150;
const MIN_CAROUSEL_MAX_HEIGHT = 80;
const EXPANDABLE_CONTENT_SELECTOR = ".interactive-result-editor, .chat-markdown-part.rendered-markdown";
class ChatToolConfirmationCarouselPart extends Disposable {
  constructor(toolPartFactory, initialTools, revealSubagent, initialRevealSubagentLabel, initialSubAgentInvocationId, initialAgentName) {
    super();
    this.toolPartFactory = toolPartFactory;
    this.revealSubagent = revealSubagent;
    this.initialRevealSubagentLabel = initialRevealSubagentLabel;
    this.initialSubAgentInvocationId = initialSubAgentInvocationId;
    this.initialAgentName = initialAgentName;
    this._onDidEmpty = this._register(new Emitter());
    this.onDidEmpty = this._onDidEmpty.event;
    this._onDidChangeActiveSubagent = this._register(new Emitter());
    this.onDidChangeActiveSubagent = this._onDidChangeActiveSubagent.event;
    this.items = [];
    this.toolCallIds = /* @__PURE__ */ new Set();
    this.activeIndex = 0;
    this._isContentExpanded = false;
    this.canExpandContent = false;
    const elements = dom.h(".chat-tool-confirmation-carousel@root", [
      dom.h(".chat-tool-carousel-overlay@overlay", [
        dom.h(".chat-tool-carousel-title-group@titleGroup", [
          dom.h("span.chat-tool-carousel-collapsed-title@collapsedTitle"),
          dom.h("button.chat-tool-carousel-agent-label@agentLabel")
        ]),
        dom.h(".chat-tool-carousel-overlay-actions@overlayActions", [
          dom.h(".chat-tool-carousel-step-indicator@stepIndicator"),
          dom.h(".chat-tool-carousel-nav-arrows@navArrows")
        ])
      ]),
      dom.h(".chat-tool-carousel-content@content")
    ]);
    this.domNode = elements.root;
    this.domNode.tabIndex = -1;
    this.domNode.setAttribute("role", "group");
    this.domNode.setAttribute("aria-label", localize("toolConfirmationCarousel", "Tool confirmation carousel"));
    this.collapsedTitle = elements.collapsedTitle;
    this.agentLabel = elements.agentLabel;
    this.contentContainer = elements.content;
    this.contentContainer.id = generateUuid();
    this.stepIndicator = elements.stepIndicator;
    this.activeContentDisposables = this._register(new DisposableStore());
    this.updateContentExpansionStateScheduler = this._register(new dom.AnimationFrameScheduler(this.domNode, () => this.updateContentExpansionState()));
    this.contentResizeObserver = this._register(new dom.DisposableResizeObserver("ChatToolConfirmationCarouselPart.contentExpansion", () => this.updateContentExpansionStateScheduler.schedule()));
    this._register(this.contentResizeObserver.observe(this.contentContainer));
    this.allowAllButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, small: true }));
    this.allowAllButton.element.classList.add("chat-tool-carousel-allow-all-button");
    this.allowAllButton.label = localize("allowAll", "Allow All");
    this._register(this.allowAllButton.onDidClick(() => this.allowAll()));
    this.expandContentButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.expandContentButton.element.classList.add("chat-tool-carousel-header-button", "chat-tool-carousel-expand-content-button");
    this.expandContentButton.element.setAttribute("aria-controls", this.contentContainer.id);
    this.updateExpandContentButton();
    dom.hide(this.expandContentButton.element);
    this._register(this.expandContentButton.onDidClick(() => this.toggleContentExpanded()));
    this.dismissButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.dismissButton.element.classList.add("chat-tool-carousel-dismiss-button");
    this.dismissButton.label = `$(${Codicon.closeSmall.id})`;
    const dismissButtonLabel = this.items.length === 1 ? localize("skip", "Skip") : localize("skipAll", "Skip All");
    this.dismissButton.element.setAttribute("aria-label", dismissButtonLabel);
    this.dismissButton.element.title = dismissButtonLabel;
    this._register(this.dismissButton.onDidClick(() => this.skipAll()));
    this.prevButton = this._register(new Button(elements.navArrows, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true
    }));
    this.prevButton.element.classList.add("chat-tool-carousel-nav-arrow");
    this.prevButton.label = `$(${Codicon.chevronLeft.id})`;
    this.prevButton.element.setAttribute("aria-label", localize("previous", "Previous"));
    this._register(this.prevButton.onDidClick(() => this.navigateRelative(-1)));
    this.nextButton = this._register(new Button(elements.navArrows, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true
    }));
    this.nextButton.element.classList.add("chat-tool-carousel-nav-arrow");
    this.nextButton.label = `$(${Codicon.chevronRight.id})`;
    this.nextButton.element.setAttribute("aria-label", localize("next", "Next"));
    this._register(this.nextButton.onDidClick(() => this.navigateRelative(1)));
    this._register(dom.addDisposableListener(this.agentLabel, "click", (e) => {
      e.preventDefault();
      this.revealActiveSubagent();
    }));
    this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => this.onKeydown(e)));
    for (const tool of initialTools) {
      this.addToolInvocation(tool, this.initialSubAgentInvocationId, this.initialAgentName, this.revealSubagent, this.initialRevealSubagentLabel);
    }
  }
  get pendingCount() {
    return this.items.length;
  }
  get activeSubAgentInvocationId() {
    return this.items[this.activeIndex]?.subAgentInvocationId;
  }
  setMaxHeight(maxHeight) {
    this.maxHeight = maxHeight;
    this.updateContentExpansionState();
  }
  hasToolInvocation(toolCallId) {
    return this.toolCallIds.has(toolCallId);
  }
  addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    if (this.toolCallIds.has(tool.toolCallId)) {
      const existing = this.items.find((item2) => item2.toolCallId === tool.toolCallId);
      if (existing && toolPart && !existing.toolPart) {
        this.replaceExternalToolPart(existing, toolPart);
      }
      return;
    }
    this.toolCallIds.add(tool.toolCallId);
    const disposables = new DisposableStore();
    const item = {
      tool,
      toolCallId: tool.toolCallId,
      disposables,
      subAgentInvocationId,
      agentName,
      revealSubagent,
      revealSubagentLabel,
      ownsToolPart: !toolPart,
      toolPart
    };
    this.items.push(item);
    if (toolPart) {
      this.watchExternalToolPart(item, toolPart);
    }
    disposables.add(autorun((reader) => {
      const currentState = tool.state.read(reader);
      if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
        this.removeItem(tool.toolCallId);
      }
    }));
    this.updateUI();
    if (this.items.length === 1) {
      this.setActiveIndex(0);
    }
  }
  replaceExternalToolPart(item, toolPart) {
    if (item.toolPart === toolPart) {
      return;
    }
    if (item.toolPart && item.ownsToolPart) {
      item.toolPart.dispose();
    }
    item.toolPart = toolPart;
    item.ownsToolPart = false;
    this.watchExternalToolPart(item, toolPart);
    if (this.items[this.activeIndex] === item) {
      this.renderActiveContent();
    }
  }
  watchExternalToolPart(item, toolPart) {
    let isItemAlive = true;
    item.disposables.add(toDisposable(() => isItemAlive = false));
    const externalPartDisposeWatcher = new MutableDisposable();
    externalPartDisposeWatcher.value = toDisposable(() => {
      if (!isItemAlive || item.toolPart !== toolPart) {
        return;
      }
      item.toolPart = void 0;
      item.ownsToolPart = true;
      if (this.items[this.activeIndex] === item) {
        this.renderActiveContent();
      }
    });
    toolPart.addDisposable(externalPartDisposeWatcher);
    item.disposables.add(toDisposable(() => externalPartDisposeWatcher.clear()));
  }
  dispose() {
    for (const item of this.items) {
      if (item.toolPart && item.ownsToolPart) {
        item.toolPart.dispose();
      }
      item.disposables.dispose();
    }
    this.items.splice(0);
    this.toolCallIds.clear();
    super.dispose();
  }
  removeItem(toolCallId) {
    const index = this.items.findIndex((i) => i.toolCallId === toolCallId);
    if (index < 0) {
      return;
    }
    const [removed] = this.items.splice(index, 1);
    this.toolCallIds.delete(toolCallId);
    if (removed.toolPart && removed.ownsToolPart) {
      removed.toolPart.dispose();
    }
    removed.disposables.dispose();
    if (this.items.length === 0) {
      dom.hide(this.domNode);
      this._onDidChangeActiveSubagent.fire(void 0);
      this._onDidEmpty.fire();
      return;
    }
    if (this.activeIndex >= this.items.length) {
      this.activeIndex = this.items.length - 1;
    }
    this.updateUI();
    this.renderActiveContent();
    this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
  }
  setActiveIndex(index) {
    this.activeIndex = index;
    this.updateUI();
    this.renderActiveContent();
    this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
  }
  navigateRelative(delta) {
    if (this.items.length <= 1) {
      return;
    }
    const newIndex = (this.activeIndex + delta + this.items.length) % this.items.length;
    this.setActiveIndex(newIndex);
  }
  onKeydown(e) {
    if (this.items.length === 0) {
      return;
    }
    if (this.shouldIgnoreNavigationKeydown(e.target)) {
      return;
    }
    const event = new StandardKeyboardEvent(e);
    const focusContentAfterNavigation = dom.isHTMLElement(e.target) && this.contentContainer.contains(e.target);
    let didNavigate = false;
    switch (event.keyCode) {
      case KeyCode.LeftArrow:
        this.navigateRelative(-1);
        didNavigate = true;
        break;
      case KeyCode.RightArrow:
        this.navigateRelative(1);
        didNavigate = true;
        break;
      case KeyCode.Home:
        this.setActiveIndex(0);
        didNavigate = true;
        break;
      case KeyCode.End:
        this.setActiveIndex(this.items.length - 1);
        didNavigate = true;
        break;
    }
    if (!didNavigate) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (focusContentAfterNavigation) {
      this.focusActiveContent();
    }
  }
  shouldIgnoreNavigationKeydown(target) {
    if (!dom.isHTMLElement(target)) {
      return false;
    }
    return !!target.closest('.monaco-editor, .interactive-result-editor, .chat-confirmation-widget-message, input, textarea, select, [contenteditable="true"]');
  }
  focusActiveContent() {
    this.domNode.focus();
  }
  updateUI() {
    const item = this.items[this.activeIndex];
    this.collapsedTitle.textContent = this.getToolTitle(item) ?? "";
    dom.setVisibility(!!this.collapsedTitle.textContent, this.collapsedTitle);
    if (item?.agentName) {
      this.agentLabel.textContent = `\u2014 ${item.agentName}`;
      this.agentLabel.disabled = !item.subAgentInvocationId || !item.revealSubagent;
      this.agentLabel.title = item.revealSubagentLabel ?? localize("scrollToSubagent", "Scroll to {0}", item.agentName);
      this.agentLabel.setAttribute("aria-label", this.agentLabel.title);
      dom.show(this.agentLabel);
    } else {
      this.agentLabel.textContent = "";
      this.agentLabel.title = "";
      this.agentLabel.removeAttribute("aria-label");
      dom.hide(this.agentLabel);
    }
    this.stepIndicator.textContent = `${this.activeIndex + 1}/${this.items.length}`;
    const multi = this.items.length > 1;
    this.prevButton.enabled = multi;
    this.nextButton.enabled = multi;
    dom.setVisibility(multi, this.stepIndicator);
    dom.setVisibility(multi, this.prevButton.element);
    dom.setVisibility(multi, this.nextButton.element);
    dom.setVisibility(multi, this.allowAllButton.element);
    dom.setVisibility(this.canExpandContent, this.expandContentButton.element);
    this.allowAllButton.label = multi ? localize("allowAll", "Allow All") : localize("allow", "Allow");
    this.updateExpandContentButton();
  }
  renderActiveContent() {
    dom.clearNode(this.contentContainer);
    this.activeContentDisposables.clear();
    this._isContentExpanded = false;
    this.canExpandContent = false;
    const item = this.items[this.activeIndex];
    if (!item) {
      this.updateContentExpansionState();
      return;
    }
    if (!item.toolPart) {
      item.toolPart = this.toolPartFactory(item.tool);
      if (item.ownsToolPart) {
        item.disposables.add(item.toolPart);
      }
    }
    this.contentContainer.appendChild(item.toolPart.domNode);
    this.activeContentDisposables.add(this.contentResizeObserver.observe(item.toolPart.domNode));
    this.observeExpandableContentElements(item.toolPart.domNode);
    this.updateContentExpansionStateScheduler.schedule();
  }
  toggleContentExpanded() {
    if (!this.canExpandContent) {
      return;
    }
    this._isContentExpanded = !this._isContentExpanded;
    this.updateContentExpansionState();
  }
  updateContentExpansionState() {
    this.canExpandContent = this.items.length > 0 && this.isActiveContentLargerThanCollapsedLimit();
    if (!this.canExpandContent) {
      this._isContentExpanded = false;
    }
    this.domNode.classList.toggle("chat-tool-carousel-content-expanded", this.canExpandContent && this._isContentExpanded);
    this.updateMaxHeightStyle();
    dom.setVisibility(this.canExpandContent, this.expandContentButton.element);
    this.updateExpandContentButton();
  }
  updateMaxHeightStyle() {
    if (this.maxHeight === void 0) {
      this.domNode.style.removeProperty("max-height");
      return;
    }
    const expanded = this.canExpandContent && this._isContentExpanded;
    const maxHeight = expanded ? Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight) : this.getCollapsedMaxHeight();
    this.domNode.style.maxHeight = `${Math.floor(maxHeight)}px`;
  }
  updateExpandContentButton() {
    const expanded = this.canExpandContent && this._isContentExpanded;
    const label = expanded ? localize("restoreConfirmationSize", "Restore Confirmation Size") : localize("expandConfirmationUp", "Expand Confirmation Up");
    this.expandContentButton.label = expanded ? `$(${Codicon.screenNormal.id})` : `$(${Codicon.screenFull.id})`;
    this.expandContentButton.element.setAttribute("aria-label", label);
    this.expandContentButton.element.setAttribute("aria-expanded", String(expanded));
    this.expandContentButton.setTitle(label);
  }
  isActiveContentLargerThanCollapsedLimit() {
    const activeContent = this.contentContainer.firstElementChild;
    if (!dom.isHTMLElement(activeContent)) {
      return false;
    }
    return this.hasInnerContentLargerThanCollapsedLimit(activeContent);
  }
  hasInnerContentLargerThanCollapsedLimit(element) {
    if (this.isExpandableContentElement(element) && this.getElementHeight(element) > this.getExpandableContentHeightLimit(element) + 1) {
      return true;
    }
    for (const child of element.children) {
      if (!dom.isHTMLElement(child)) {
        continue;
      }
      if (this.hasInnerContentLargerThanCollapsedLimit(child)) {
        return true;
      }
    }
    return false;
  }
  isExpandableContentElement(element) {
    return element.matches(EXPANDABLE_CONTENT_SELECTOR);
  }
  observeExpandableContentElements(element) {
    if (this.isExpandableContentElement(element)) {
      this.activeContentDisposables.add(this.contentResizeObserver.observe(element));
    }
    for (const child of element.children) {
      if (dom.isHTMLElement(child)) {
        this.observeExpandableContentElements(child);
      }
    }
  }
  getElementHeight(element) {
    return Math.max(element.offsetHeight, element.scrollHeight);
  }
  getExpandableContentHeightLimit(element) {
    const window = dom.getWindow(this.domNode);
    if (element.classList.contains("interactive-result-editor")) {
      return Math.min(COLLAPSED_CODE_BLOCK_MAX_HEIGHT, window.innerHeight * 0.25);
    }
    return Math.min(COLLAPSED_MESSAGE_MAX_HEIGHT, window.innerHeight * 0.3);
  }
  getCollapsedMaxHeight() {
    const configuredMaxHeight = this.maxHeight === void 0 ? Number.POSITIVE_INFINITY : Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight);
    return Math.min(configuredMaxHeight, COLLAPSED_CAROUSEL_MAX_HEIGHT, dom.getWindow(this.domNode).innerHeight * 0.45);
  }
  allowAll() {
    for (const item of [...this.items]) {
      IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
    }
  }
  skipAll() {
    for (const item of [...this.items]) {
      IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
    }
  }
  getToolTitle(item) {
    if (!item) {
      return void 0;
    }
    const messages = IChatToolInvocation.getConfirmationMessages(item.tool);
    if (!messages?.title) {
      return void 0;
    }
    return this.truncateTitle(this.toPlainText(messages.title));
  }
  truncateTitle(text) {
    text = text.replace(/\s+/g, " ").trim();
    const maxLength = 100;
    return text.length > maxLength ? `${text.substring(0, maxLength)}\u2026` : text;
  }
  toPlainText(message) {
    const markdown = typeof message === "string" ? message : message.value;
    return markdown.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text, url) => text || this.basename(url)).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/[\\*_#>]/g, "");
  }
  basename(url) {
    try {
      const path = decodeURIComponent(url.split("?")[0].split("#")[0]);
      const segments = path.split("/").filter(Boolean);
      return segments.at(-1) ?? url;
    } catch {
      return url;
    }
  }
  revealActiveSubagent() {
    const item = this.items[this.activeIndex];
    if (item?.subAgentInvocationId) {
      item.revealSubagent?.(item.subAgentInvocationId);
    }
  }
  activateFirstToolForSubagent(subAgentInvocationId) {
    const index = this.items.findIndex((i) => i.subAgentInvocationId === subAgentInvocationId);
    if (index >= 0) {
      this.setActiveIndex(index);
    }
  }
}
export {
  ChatToolConfirmationCarouselPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25QYXJ0LmpzJztcbmltcG9ydCAnLi4vbWVkaWEvY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbC5jc3MnO1xuXG5jb25zdCBDT0xMQVBTRURfQ0FST1VTRUxfTUFYX0hFSUdIVCA9IDMwMDtcbmNvbnN0IENPTExBUFNFRF9NRVNTQUdFX01BWF9IRUlHSFQgPSAyMDA7XG5jb25zdCBDT0xMQVBTRURfQ09ERV9CTE9DS19NQVhfSEVJR0hUID0gMTUwO1xuY29uc3QgTUlOX0NBUk9VU0VMX01BWF9IRUlHSFQgPSA4MDtcbmNvbnN0IEVYUEFOREFCTEVfQ09OVEVOVF9TRUxFQ1RPUiA9ICcuaW50ZXJhY3RpdmUtcmVzdWx0LWVkaXRvciwgLmNoYXQtbWFya2Rvd24tcGFydC5yZW5kZXJlZC1tYXJrZG93bic7XG5cbmV4cG9ydCB0eXBlIFRvb2xJbnZvY2F0aW9uUGFydEZhY3RvcnkgPSAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gQ2hhdFRvb2xJbnZvY2F0aW9uUGFydDtcblxuZXhwb3J0IHR5cGUgUmV2ZWFsU3ViYWdlbnRDYWxsYmFjayA9IChzdWJBZ2VudEludm9jYXRpb25JZDogc3RyaW5nKSA9PiB2b2lkO1xuXG5pbnRlcmZhY2UgSUNhcm91c2VsVG9vbEl0ZW0ge1xuXHRyZWFkb25seSB0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uO1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudE5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJldmVhbFN1YmFnZW50PzogUmV2ZWFsU3ViYWdlbnRDYWxsYmFjaztcblx0cmVhZG9ubHkgcmV2ZWFsU3ViYWdlbnRMYWJlbD86IHN0cmluZztcblx0b3duc1Rvb2xQYXJ0OiBib29sZWFuO1xuXHR0b29sUGFydD86IENoYXRUb29sSW52b2NhdGlvblBhcnQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbXB0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVtcHR5ID0gdGhpcy5fb25EaWRFbXB0eS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlU3ViYWdlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbXM6IElDYXJvdXNlbFRvb2xJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sQ2FsbElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIGFjdGl2ZUluZGV4ID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZFRpdGxlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBhZ2VudExhYmVsOiBIVE1MQnV0dG9uRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBzdGVwSW5kaWNhdG9yOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2QnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgbmV4dEJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsbG93QWxsQnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgZXhwYW5kQ29udGVudEJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc21pc3NCdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVDb250ZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50UmVzaXplT2JzZXJ2ZXI6IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlU2NoZWR1bGVyOiBkb20uQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXI7XG5cdHByaXZhdGUgX2lzQ29udGVudEV4cGFuZGVkID0gZmFsc2U7XG5cdHByaXZhdGUgY2FuRXhwYW5kQ29udGVudCA9IGZhbHNlO1xuXHRwcml2YXRlIG1heEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdG9vbFBhcnRGYWN0b3J5OiBUb29sSW52b2NhdGlvblBhcnRGYWN0b3J5LFxuXHRcdGluaXRpYWxUb29sczogSUNoYXRUb29sSW52b2NhdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmV2ZWFsU3ViYWdlbnQ/OiBSZXZlYWxTdWJhZ2VudENhbGxiYWNrLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbFJldmVhbFN1YmFnZW50TGFiZWw/OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsU3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbml0aWFsQWdlbnROYW1lPzogc3RyaW5nLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkb20uaCgnLmNoYXQtdG9vbC1jb25maXJtYXRpb24tY2Fyb3VzZWxAcm9vdCcsIFtcblx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNhcm91c2VsLW92ZXJsYXlAb3ZlcmxheScsIFtcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY2Fyb3VzZWwtdGl0bGUtZ3JvdXBAdGl0bGVHcm91cCcsIFtcblx0XHRcdFx0XHRkb20uaCgnc3Bhbi5jaGF0LXRvb2wtY2Fyb3VzZWwtY29sbGFwc2VkLXRpdGxlQGNvbGxhcHNlZFRpdGxlJyksXG5cdFx0XHRcdFx0ZG9tLmgoJ2J1dHRvbi5jaGF0LXRvb2wtY2Fyb3VzZWwtYWdlbnQtbGFiZWxAYWdlbnRMYWJlbCcpLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY2Fyb3VzZWwtb3ZlcmxheS1hY3Rpb25zQG92ZXJsYXlBY3Rpb25zJywgW1xuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNhcm91c2VsLXN0ZXAtaW5kaWNhdG9yQHN0ZXBJbmRpY2F0b3InKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9vbC1jYXJvdXNlbC1uYXYtYXJyb3dzQG5hdkFycm93cycpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY2Fyb3VzZWwtY29udGVudEBjb250ZW50JyksXG5cdFx0XSk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBlbGVtZW50cy5yb290O1xuXHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnZ3JvdXAnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3Rvb2xDb25maXJtYXRpb25DYXJvdXNlbCcsIFwiVG9vbCBjb25maXJtYXRpb24gY2Fyb3VzZWxcIikpO1xuXHRcdHRoaXMuY29sbGFwc2VkVGl0bGUgPSBlbGVtZW50cy5jb2xsYXBzZWRUaXRsZTtcblx0XHR0aGlzLmFnZW50TGFiZWwgPSBlbGVtZW50cy5hZ2VudExhYmVsO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9IGVsZW1lbnRzLmNvbnRlbnQ7XG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5zdGVwSW5kaWNhdG9yID0gZWxlbWVudHMuc3RlcEluZGljYXRvcjtcblx0XHR0aGlzLmFjdGl2ZUNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGVTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKHRoaXMuZG9tTm9kZSwgKCkgPT4gdGhpcy51cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGUoKSkpO1xuXHRcdHRoaXMuY29udGVudFJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0LmNvbnRlbnRFeHBhbnNpb24nLCAoKSA9PiB0aGlzLnVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZVNjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZW50UmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmNvbnRlbnRDb250YWluZXIpKTtcblxuXHRcdHRoaXMuYWxsb3dBbGxCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGVsZW1lbnRzLm92ZXJsYXlBY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNtYWxsOiB0cnVlIH0pKTtcblx0XHR0aGlzLmFsbG93QWxsQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC10b29sLWNhcm91c2VsLWFsbG93LWFsbC1idXR0b24nKTtcblx0XHR0aGlzLmFsbG93QWxsQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2FsbG93QWxsJywgXCJBbGxvdyBBbGxcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hbGxvd0FsbEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuYWxsb3dBbGwoKSkpO1xuXG5cdFx0dGhpcy5leHBhbmRDb250ZW50QnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihlbGVtZW50cy5vdmVybGF5QWN0aW9ucywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5leHBhbmRDb250ZW50QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC10b29sLWNhcm91c2VsLWhlYWRlci1idXR0b24nLCAnY2hhdC10b29sLWNhcm91c2VsLWV4cGFuZC1jb250ZW50LWJ1dHRvbicpO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIHRoaXMuY29udGVudENvbnRhaW5lci5pZCk7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRDb250ZW50QnV0dG9uKCk7XG5cdFx0ZG9tLmhpZGUodGhpcy5leHBhbmRDb250ZW50QnV0dG9uLmVsZW1lbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMudG9nZ2xlQ29udGVudEV4cGFuZGVkKCkpKTtcblxuXHRcdHRoaXMuZGlzbWlzc0J1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWxlbWVudHMub3ZlcmxheUFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdHRoaXMuZGlzbWlzc0J1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdG9vbC1jYXJvdXNlbC1kaXNtaXNzLWJ1dHRvbicpO1xuXHRcdHRoaXMuZGlzbWlzc0J1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jbG9zZVNtYWxsLmlkfSlgO1xuXHRcdGNvbnN0IGRpc21pc3NCdXR0b25MYWJlbCA9IHRoaXMuaXRlbXMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdza2lwJywgXCJTa2lwXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdza2lwQWxsJywgXCJTa2lwIEFsbFwiKTtcblx0XHR0aGlzLmRpc21pc3NCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBkaXNtaXNzQnV0dG9uTGFiZWwpO1xuXHRcdHRoaXMuZGlzbWlzc0J1dHRvbi5lbGVtZW50LnRpdGxlID0gZGlzbWlzc0J1dHRvbkxhYmVsO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGlzbWlzc0J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuc2tpcEFsbCgpKSk7XG5cblx0XHR0aGlzLnByZXZCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGVsZW1lbnRzLm5hdkFycm93cywge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5wcmV2QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC10b29sLWNhcm91c2VsLW5hdi1hcnJvdycpO1xuXHRcdHRoaXMucHJldkJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jaGV2cm9uTGVmdC5pZH0pYDtcblx0XHR0aGlzLnByZXZCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgncHJldmlvdXMnLCBcIlByZXZpb3VzXCIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnByZXZCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm5hdmlnYXRlUmVsYXRpdmUoLTEpKSk7XG5cblx0XHR0aGlzLm5leHRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGVsZW1lbnRzLm5hdkFycm93cywge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC10b29sLWNhcm91c2VsLW5hdi1hcnJvdycpO1xuXHRcdHRoaXMubmV4dEJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jaGV2cm9uUmlnaHQuaWR9KWA7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ25leHQnLCBcIk5leHRcIikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubmV4dEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMubmF2aWdhdGVSZWxhdGl2ZSgxKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFnZW50TGFiZWwsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5yZXZlYWxBY3RpdmVTdWJhZ2VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAna2V5ZG93bicsIGUgPT4gdGhpcy5vbktleWRvd24oZSkpKTtcblxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiBpbml0aWFsVG9vbHMpIHtcblx0XHRcdHRoaXMuYWRkVG9vbEludm9jYXRpb24odG9vbCwgdGhpcy5pbml0aWFsU3ViQWdlbnRJbnZvY2F0aW9uSWQsIHRoaXMuaW5pdGlhbEFnZW50TmFtZSwgdGhpcy5yZXZlYWxTdWJhZ2VudCwgdGhpcy5pbml0aWFsUmV2ZWFsU3ViYWdlbnRMYWJlbCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHBlbmRpbmdDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zLmxlbmd0aDtcblx0fVxuXG5cdGdldCBhY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zW3RoaXMuYWN0aXZlSW5kZXhdPy5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0fVxuXG5cdHNldE1heEhlaWdodChtYXhIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMubWF4SGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdHRoaXMudXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlKCk7XG5cdH1cblxuXHRoYXNUb29sSW52b2NhdGlvbih0b29sQ2FsbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50b29sQ2FsbElkcy5oYXModG9vbENhbGxJZCk7XG5cdH1cblxuXHRhZGRUb29sSW52b2NhdGlvbih0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBzdWJBZ2VudEludm9jYXRpb25JZD86IHN0cmluZywgYWdlbnROYW1lPzogc3RyaW5nLCByZXZlYWxTdWJhZ2VudD86IFJldmVhbFN1YmFnZW50Q2FsbGJhY2ssIHJldmVhbFN1YmFnZW50TGFiZWw/OiBzdHJpbmcsIHRvb2xQYXJ0PzogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRvb2xDYWxsSWRzLmhhcyh0b29sLnRvb2xDYWxsSWQpKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0udG9vbENhbGxJZCA9PT0gdG9vbC50b29sQ2FsbElkKTtcblx0XHRcdGlmIChleGlzdGluZyAmJiB0b29sUGFydCAmJiAhZXhpc3RpbmcudG9vbFBhcnQpIHtcblx0XHRcdFx0dGhpcy5yZXBsYWNlRXh0ZXJuYWxUb29sUGFydChleGlzdGluZywgdG9vbFBhcnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudG9vbENhbGxJZHMuYWRkKHRvb2wudG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGl0ZW06IElDYXJvdXNlbFRvb2xJdGVtID0ge1xuXHRcdFx0dG9vbCxcblx0XHRcdHRvb2xDYWxsSWQ6IHRvb2wudG9vbENhbGxJZCxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRhZ2VudE5hbWUsXG5cdFx0XHRyZXZlYWxTdWJhZ2VudCxcblx0XHRcdHJldmVhbFN1YmFnZW50TGFiZWwsXG5cdFx0XHRvd25zVG9vbFBhcnQ6ICF0b29sUGFydCxcblx0XHRcdHRvb2xQYXJ0LFxuXHRcdH07XG5cdFx0dGhpcy5pdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdGlmICh0b29sUGFydCkge1xuXHRcdFx0dGhpcy53YXRjaEV4dGVybmFsVG9vbFBhcnQoaXRlbSwgdG9vbFBhcnQpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0b29sLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUl0ZW0odG9vbC50b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZVVJKCk7XG5cblx0XHRpZiAodGhpcy5pdGVtcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlSW5kZXgoMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXBsYWNlRXh0ZXJuYWxUb29sUGFydChpdGVtOiBJQ2Fyb3VzZWxUb29sSXRlbSwgdG9vbFBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQpOiB2b2lkIHtcblx0XHRpZiAoaXRlbS50b29sUGFydCA9PT0gdG9vbFBhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS50b29sUGFydCAmJiBpdGVtLm93bnNUb29sUGFydCkge1xuXHRcdFx0aXRlbS50b29sUGFydC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0aXRlbS50b29sUGFydCA9IHRvb2xQYXJ0O1xuXHRcdGl0ZW0ub3duc1Rvb2xQYXJ0ID0gZmFsc2U7XG5cdFx0dGhpcy53YXRjaEV4dGVybmFsVG9vbFBhcnQoaXRlbSwgdG9vbFBhcnQpO1xuXHRcdGlmICh0aGlzLml0ZW1zW3RoaXMuYWN0aXZlSW5kZXhdID09PSBpdGVtKSB7XG5cdFx0XHR0aGlzLnJlbmRlckFjdGl2ZUNvbnRlbnQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdhdGNoRXh0ZXJuYWxUb29sUGFydChpdGVtOiBJQ2Fyb3VzZWxUb29sSXRlbSwgdG9vbFBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQpOiB2b2lkIHtcblx0XHRsZXQgaXNJdGVtQWxpdmUgPSB0cnVlO1xuXHRcdGl0ZW0uZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBpc0l0ZW1BbGl2ZSA9IGZhbHNlKSk7XG5cblx0XHRjb25zdCBleHRlcm5hbFBhcnREaXNwb3NlV2F0Y2hlciA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRcdGV4dGVybmFsUGFydERpc3Bvc2VXYXRjaGVyLnZhbHVlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICghaXNJdGVtQWxpdmUgfHwgaXRlbS50b29sUGFydCAhPT0gdG9vbFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtLnRvb2xQYXJ0ID0gdW5kZWZpbmVkO1xuXHRcdFx0aXRlbS5vd25zVG9vbFBhcnQgPSB0cnVlO1xuXHRcdFx0aWYgKHRoaXMuaXRlbXNbdGhpcy5hY3RpdmVJbmRleF0gPT09IGl0ZW0pIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJBY3RpdmVDb250ZW50KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dG9vbFBhcnQuYWRkRGlzcG9zYWJsZShleHRlcm5hbFBhcnREaXNwb3NlV2F0Y2hlcik7XG5cdFx0aXRlbS5kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGV4dGVybmFsUGFydERpc3Bvc2VXYXRjaGVyLmNsZWFyKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnRvb2xQYXJ0ICYmIGl0ZW0ub3duc1Rvb2xQYXJ0KSB7XG5cdFx0XHRcdGl0ZW0udG9vbFBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0aXRlbS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuaXRlbXMuc3BsaWNlKDApO1xuXHRcdHRoaXMudG9vbENhbGxJZHMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUl0ZW0odG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLml0ZW1zLmZpbmRJbmRleChpID0+IGkudG9vbENhbGxJZCA9PT0gdG9vbENhbGxJZCk7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtyZW1vdmVkXSA9IHRoaXMuaXRlbXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLnRvb2xDYWxsSWRzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRpZiAocmVtb3ZlZC50b29sUGFydCAmJiByZW1vdmVkLm93bnNUb29sUGFydCkge1xuXHRcdFx0cmVtb3ZlZC50b29sUGFydC5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJlbW92ZWQuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKHRoaXMuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudC5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZEVtcHR5LmZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3RpdmVJbmRleCA+PSB0aGlzLml0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5hY3RpdmVJbmRleCA9IHRoaXMuaXRlbXMubGVuZ3RoIC0gMTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVVJKCk7XG5cdFx0dGhpcy5yZW5kZXJBY3RpdmVDb250ZW50KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudC5maXJlKHRoaXMuYWN0aXZlU3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY3RpdmVJbmRleChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVJbmRleCA9IGluZGV4O1xuXHRcdHRoaXMudXBkYXRlVUkoKTtcblx0XHR0aGlzLnJlbmRlckFjdGl2ZUNvbnRlbnQoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50LmZpcmUodGhpcy5hY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIG5hdmlnYXRlUmVsYXRpdmUoZGVsdGE6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLml0ZW1zLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0luZGV4ID0gKHRoaXMuYWN0aXZlSW5kZXggKyBkZWx0YSArIHRoaXMuaXRlbXMubGVuZ3RoKSAlIHRoaXMuaXRlbXMubGVuZ3RoO1xuXHRcdHRoaXMuc2V0QWN0aXZlSW5kZXgobmV3SW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbktleWRvd24oZTogS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNob3VsZElnbm9yZU5hdmlnYXRpb25LZXlkb3duKGUudGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRjb25zdCBmb2N1c0NvbnRlbnRBZnRlck5hdmlnYXRpb24gPSBkb20uaXNIVE1MRWxlbWVudChlLnRhcmdldCkgJiYgdGhpcy5jb250ZW50Q29udGFpbmVyLmNvbnRhaW5zKGUudGFyZ2V0KTtcblx0XHRsZXQgZGlkTmF2aWdhdGUgPSBmYWxzZTtcblxuXHRcdHN3aXRjaCAoZXZlbnQua2V5Q29kZSkge1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkxlZnRBcnJvdzpcblx0XHRcdFx0dGhpcy5uYXZpZ2F0ZVJlbGF0aXZlKC0xKTtcblx0XHRcdFx0ZGlkTmF2aWdhdGUgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5SaWdodEFycm93OlxuXHRcdFx0XHR0aGlzLm5hdmlnYXRlUmVsYXRpdmUoMSk7XG5cdFx0XHRcdGRpZE5hdmlnYXRlID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEtleUNvZGUuSG9tZTpcblx0XHRcdFx0dGhpcy5zZXRBY3RpdmVJbmRleCgwKTtcblx0XHRcdFx0ZGlkTmF2aWdhdGUgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5FbmQ6XG5cdFx0XHRcdHRoaXMuc2V0QWN0aXZlSW5kZXgodGhpcy5pdGVtcy5sZW5ndGggLSAxKTtcblx0XHRcdFx0ZGlkTmF2aWdhdGUgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoIWRpZE5hdmlnYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRpZiAoZm9jdXNDb250ZW50QWZ0ZXJOYXZpZ2F0aW9uKSB7XG5cdFx0XHR0aGlzLmZvY3VzQWN0aXZlQ29udGVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkSWdub3JlTmF2aWdhdGlvbktleWRvd24odGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISF0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1lZGl0b3IsIC5pbnRlcmFjdGl2ZS1yZXN1bHQtZWRpdG9yLCAuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2UsIGlucHV0LCB0ZXh0YXJlYSwgc2VsZWN0LCBbY29udGVudGVkaXRhYmxlPVwidHJ1ZVwiXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0FjdGl2ZUNvbnRlbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVVJKCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW3RoaXMuYWN0aXZlSW5kZXhdO1xuXG5cdFx0dGhpcy5jb2xsYXBzZWRUaXRsZS50ZXh0Q29udGVudCA9IHRoaXMuZ2V0VG9vbFRpdGxlKGl0ZW0pID8/ICcnO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KCEhdGhpcy5jb2xsYXBzZWRUaXRsZS50ZXh0Q29udGVudCwgdGhpcy5jb2xsYXBzZWRUaXRsZSk7XG5cblx0XHRpZiAoaXRlbT8uYWdlbnROYW1lKSB7XG5cdFx0XHR0aGlzLmFnZW50TGFiZWwudGV4dENvbnRlbnQgPSBgXFx1MjAxNCAke2l0ZW0uYWdlbnROYW1lfWA7XG5cdFx0XHR0aGlzLmFnZW50TGFiZWwuZGlzYWJsZWQgPSAhaXRlbS5zdWJBZ2VudEludm9jYXRpb25JZCB8fCAhaXRlbS5yZXZlYWxTdWJhZ2VudDtcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC50aXRsZSA9IGl0ZW0ucmV2ZWFsU3ViYWdlbnRMYWJlbCA/PyBsb2NhbGl6ZSgnc2Nyb2xsVG9TdWJhZ2VudCcsIFwiU2Nyb2xsIHRvIHswfVwiLCBpdGVtLmFnZW50TmFtZSk7XG5cdFx0XHR0aGlzLmFnZW50TGFiZWwuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5hZ2VudExhYmVsLnRpdGxlKTtcblx0XHRcdGRvbS5zaG93KHRoaXMuYWdlbnRMYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy5hZ2VudExhYmVsLnRpdGxlID0gJyc7XG5cdFx0XHR0aGlzLmFnZW50TGFiZWwucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0XHRkb20uaGlkZSh0aGlzLmFnZW50TGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RlcEluZGljYXRvci50ZXh0Q29udGVudCA9IGAke3RoaXMuYWN0aXZlSW5kZXggKyAxfS8ke3RoaXMuaXRlbXMubGVuZ3RofWA7XG5cblx0XHRjb25zdCBtdWx0aSA9IHRoaXMuaXRlbXMubGVuZ3RoID4gMTtcblx0XHR0aGlzLnByZXZCdXR0b24uZW5hYmxlZCA9IG11bHRpO1xuXHRcdHRoaXMubmV4dEJ1dHRvbi5lbmFibGVkID0gbXVsdGk7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkobXVsdGksIHRoaXMuc3RlcEluZGljYXRvcik7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkobXVsdGksIHRoaXMucHJldkJ1dHRvbi5lbGVtZW50KTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eShtdWx0aSwgdGhpcy5uZXh0QnV0dG9uLmVsZW1lbnQpO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KG11bHRpLCB0aGlzLmFsbG93QWxsQnV0dG9uLmVsZW1lbnQpO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KHRoaXMuY2FuRXhwYW5kQ29udGVudCwgdGhpcy5leHBhbmRDb250ZW50QnV0dG9uLmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5hbGxvd0FsbEJ1dHRvbi5sYWJlbCA9IG11bHRpXG5cdFx0XHQ/IGxvY2FsaXplKCdhbGxvd0FsbCcsIFwiQWxsb3cgQWxsXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdhbGxvdycsIFwiQWxsb3dcIik7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRDb250ZW50QnV0dG9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckFjdGl2ZUNvbnRlbnQoKTogdm9pZCB7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNvbnRlbnRDb250YWluZXIpO1xuXHRcdHRoaXMuYWN0aXZlQ29udGVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5faXNDb250ZW50RXhwYW5kZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNhbkV4cGFuZENvbnRlbnQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW3RoaXMuYWN0aXZlSW5kZXhdO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWl0ZW0udG9vbFBhcnQpIHtcblx0XHRcdGl0ZW0udG9vbFBhcnQgPSB0aGlzLnRvb2xQYXJ0RmFjdG9yeShpdGVtLnRvb2wpO1xuXHRcdFx0aWYgKGl0ZW0ub3duc1Rvb2xQYXJ0KSB7XG5cdFx0XHRcdGl0ZW0uZGlzcG9zYWJsZXMuYWRkKGl0ZW0udG9vbFBhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtLnRvb2xQYXJ0LmRvbU5vZGUpO1xuXHRcdHRoaXMuYWN0aXZlQ29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRlbnRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGl0ZW0udG9vbFBhcnQuZG9tTm9kZSkpO1xuXHRcdHRoaXMub2JzZXJ2ZUV4cGFuZGFibGVDb250ZW50RWxlbWVudHMoaXRlbS50b29sUGFydC5kb21Ob2RlKTtcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVDb250ZW50RXhwYW5kZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhbkV4cGFuZENvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0NvbnRlbnRFeHBhbmRlZCA9ICF0aGlzLl9pc0NvbnRlbnRFeHBhbmRlZDtcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jYW5FeHBhbmRDb250ZW50ID0gdGhpcy5pdGVtcy5sZW5ndGggPiAwICYmIHRoaXMuaXNBY3RpdmVDb250ZW50TGFyZ2VyVGhhbkNvbGxhcHNlZExpbWl0KCk7XG5cdFx0aWYgKCF0aGlzLmNhbkV4cGFuZENvbnRlbnQpIHtcblx0XHRcdHRoaXMuX2lzQ29udGVudEV4cGFuZGVkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdG9vbC1jYXJvdXNlbC1jb250ZW50LWV4cGFuZGVkJywgdGhpcy5jYW5FeHBhbmRDb250ZW50ICYmIHRoaXMuX2lzQ29udGVudEV4cGFuZGVkKTtcblx0XHR0aGlzLnVwZGF0ZU1heEhlaWdodFN0eWxlKCk7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkodGhpcy5jYW5FeHBhbmRDb250ZW50LCB0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24uZWxlbWVudCk7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRDb250ZW50QnV0dG9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1heEhlaWdodFN0eWxlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1heEhlaWdodCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ21heC1oZWlnaHQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHBhbmRlZCA9IHRoaXMuY2FuRXhwYW5kQ29udGVudCAmJiB0aGlzLl9pc0NvbnRlbnRFeHBhbmRlZDtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBleHBhbmRlZCA/IE1hdGgubWF4KE1JTl9DQVJPVVNFTF9NQVhfSEVJR0hULCB0aGlzLm1heEhlaWdodCkgOiB0aGlzLmdldENvbGxhcHNlZE1heEhlaWdodCgpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSBgJHtNYXRoLmZsb29yKG1heEhlaWdodCl9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHBhbmRDb250ZW50QnV0dG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGV4cGFuZGVkID0gdGhpcy5jYW5FeHBhbmRDb250ZW50ICYmIHRoaXMuX2lzQ29udGVudEV4cGFuZGVkO1xuXHRcdGNvbnN0IGxhYmVsID0gZXhwYW5kZWRcblx0XHRcdD8gbG9jYWxpemUoJ3Jlc3RvcmVDb25maXJtYXRpb25TaXplJywgXCJSZXN0b3JlIENvbmZpcm1hdGlvbiBTaXplXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdleHBhbmRDb25maXJtYXRpb25VcCcsIFwiRXhwYW5kIENvbmZpcm1hdGlvbiBVcFwiKTtcblx0XHR0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24ubGFiZWwgPSBleHBhbmRlZFxuXHRcdFx0PyBgJCgke0NvZGljb24uc2NyZWVuTm9ybWFsLmlkfSlgXG5cdFx0XHQ6IGAkKCR7Q29kaWNvbi5zY3JlZW5GdWxsLmlkfSlgO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxhYmVsKTtcblx0XHR0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZXhwYW5kZWQpKTtcblx0XHR0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24uc2V0VGl0bGUobGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FjdGl2ZUNvbnRlbnRMYXJnZXJUaGFuQ29sbGFwc2VkTGltaXQoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWN0aXZlQ29udGVudCA9IHRoaXMuY29udGVudENvbnRhaW5lci5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KGFjdGl2ZUNvbnRlbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaGFzSW5uZXJDb250ZW50TGFyZ2VyVGhhbkNvbGxhcHNlZExpbWl0KGFjdGl2ZUNvbnRlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNJbm5lckNvbnRlbnRMYXJnZXJUaGFuQ29sbGFwc2VkTGltaXQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5pc0V4cGFuZGFibGVDb250ZW50RWxlbWVudChlbGVtZW50KSAmJiB0aGlzLmdldEVsZW1lbnRIZWlnaHQoZWxlbWVudCkgPiB0aGlzLmdldEV4cGFuZGFibGVDb250ZW50SGVpZ2h0TGltaXQoZWxlbWVudCkgKyAxKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcblx0XHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoY2hpbGQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5oYXNJbm5lckNvbnRlbnRMYXJnZXJUaGFuQ29sbGFwc2VkTGltaXQoY2hpbGQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgaXNFeHBhbmRhYmxlQ29udGVudEVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZWxlbWVudC5tYXRjaGVzKEVYUEFOREFCTEVfQ09OVEVOVF9TRUxFQ1RPUik7XG5cdH1cblxuXHRwcml2YXRlIG9ic2VydmVFeHBhbmRhYmxlQ29udGVudEVsZW1lbnRzKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNFeHBhbmRhYmxlQ29udGVudEVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuYWN0aXZlQ29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRlbnRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGVsZW1lbnQpKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGVsZW1lbnQuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChjaGlsZCkpIHtcblx0XHRcdFx0dGhpcy5vYnNlcnZlRXhwYW5kYWJsZUNvbnRlbnRFbGVtZW50cyhjaGlsZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbGVtZW50SGVpZ2h0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gTWF0aC5tYXgoZWxlbWVudC5vZmZzZXRIZWlnaHQsIGVsZW1lbnQuc2Nyb2xsSGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RXhwYW5kYWJsZUNvbnRlbnRIZWlnaHRMaW1pdChlbGVtZW50OiBIVE1MRWxlbWVudCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpO1xuXHRcdGlmIChlbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnaW50ZXJhY3RpdmUtcmVzdWx0LWVkaXRvcicpKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5taW4oQ09MTEFQU0VEX0NPREVfQkxPQ0tfTUFYX0hFSUdIVCwgd2luZG93LmlubmVySGVpZ2h0ICogMC4yNSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hdGgubWluKENPTExBUFNFRF9NRVNTQUdFX01BWF9IRUlHSFQsIHdpbmRvdy5pbm5lckhlaWdodCAqIDAuMyk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbGxhcHNlZE1heEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNYXhIZWlnaHQgPSB0aGlzLm1heEhlaWdodCA9PT0gdW5kZWZpbmVkID8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZIDogTWF0aC5tYXgoTUlOX0NBUk9VU0VMX01BWF9IRUlHSFQsIHRoaXMubWF4SGVpZ2h0KTtcblx0XHRyZXR1cm4gTWF0aC5taW4oY29uZmlndXJlZE1heEhlaWdodCwgQ09MTEFQU0VEX0NBUk9VU0VMX01BWF9IRUlHSFQsIGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKS5pbm5lckhlaWdodCAqIDAuNDUpO1xuXHR9XG5cblx0YWxsb3dBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIFsuLi50aGlzLml0ZW1zXSkge1xuXHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChpdGVtLnRvb2wsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBza2lwQWxsKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBbLi4udGhpcy5pdGVtc10pIHtcblx0XHRcdElDaGF0VG9vbEludm9jYXRpb24uY29uZmlybVdpdGgoaXRlbS50b29sLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbFRpdGxlKGl0ZW06IElDYXJvdXNlbFRvb2xJdGVtIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1lc3NhZ2VzID0gSUNoYXRUb29sSW52b2NhdGlvbi5nZXRDb25maXJtYXRpb25NZXNzYWdlcyhpdGVtLnRvb2wpO1xuXHRcdGlmICghbWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50cnVuY2F0ZVRpdGxlKHRoaXMudG9QbGFpblRleHQobWVzc2FnZXMudGl0bGUpKTtcblx0fVxuXG5cdHByaXZhdGUgdHJ1bmNhdGVUaXRsZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdFx0Y29uc3QgbWF4TGVuZ3RoID0gMTAwO1xuXHRcdHJldHVybiB0ZXh0Lmxlbmd0aCA+IG1heExlbmd0aCA/IGAke3RleHQuc3Vic3RyaW5nKDAsIG1heExlbmd0aCl9XFx1MjAyNmAgOiB0ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSB0b1BsYWluVGV4dChtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1hcmtkb3duID0gdHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnID8gbWVzc2FnZSA6IG1lc3NhZ2UudmFsdWU7XG5cdFx0cmV0dXJuIG1hcmtkb3duXG5cdFx0XHQucmVwbGFjZSgvXFxbKFteXFxdXSopXFxdXFwoKFteKV0rKVxcKS9nLCAoX21hdGNoLCB0ZXh0LCB1cmwpID0+IHRleHQgfHwgdGhpcy5iYXNlbmFtZSh1cmwpKVxuXHRcdFx0LnJlcGxhY2UoL1xcKlxcKihbXipdKylcXCpcXCovZywgJyQxJylcblx0XHRcdC5yZXBsYWNlKC9fXyhbXl9dKylfXy9nLCAnJDEnKVxuXHRcdFx0LnJlcGxhY2UoL2AoW15gXSspYC9nLCAnJDEnKVxuXHRcdFx0LnJlcGxhY2UoL1tcXFxcKl8jPl0vZywgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBiYXNlbmFtZSh1cmw6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhdGggPSBkZWNvZGVVUklDb21wb25lbnQodXJsLnNwbGl0KCc/JylbMF0uc3BsaXQoJyMnKVswXSk7XG5cdFx0XHRjb25zdCBzZWdtZW50cyA9IHBhdGguc3BsaXQoJy8nKS5maWx0ZXIoQm9vbGVhbik7XG5cdFx0XHRyZXR1cm4gc2VnbWVudHMuYXQoLTEpID8/IHVybDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1cmw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXZlYWxBY3RpdmVTdWJhZ2VudCgpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtc1t0aGlzLmFjdGl2ZUluZGV4XTtcblx0XHRpZiAoaXRlbT8uc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdGl0ZW0ucmV2ZWFsU3ViYWdlbnQ/LihpdGVtLnN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHR9XG5cdH1cblxuXHRhY3RpdmF0ZUZpcnN0VG9vbEZvclN1YmFnZW50KHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaXRlbXMuZmluZEluZGV4KGkgPT4gaS5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUluZGV4KGluZGV4KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQix1QkFBdUI7QUFF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
