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
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString, isMarkdownString } from "../../../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IMarkdownRendererService } from "../../../../../../platform/markdown/browser/markdownRenderer.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../../../base/browser/ui/inputbox/inputBox.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Checkbox } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { findQuestionValidationFailure, getDisplayedQuestionText, getOptionsWithDefaultsFirst } from "../../../common/chatService/chatQuestionCarouselHelpers.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { getChatMarkdownRenderOptions } from "../chatContentMarkdownRenderer.js";
import "./media/chatQuestionCarousel.css";
const PREVIOUS_QUESTION_ACTION_ID = "workbench.action.chat.previousQuestion";
const NEXT_QUESTION_ACTION_ID = "workbench.action.chat.nextQuestion";
class ChatQuestionAnswerCollapsiblePart extends ChatCollapsibleContentPart {
  constructor(title, prefix, value, answerIcon, context, contentFactory, onDidChangeHeight, hoverService, configurationService) {
    super(title, context, void 0, hoverService, configurationService);
    this.prefix = prefix;
    this.value = value;
    this.answerIcon = answerIcon;
    this.contentFactory = contentFactory;
    this.onDidChangeHeight = onDidChangeHeight;
  }
  init() {
    const element = super.init();
    element.classList.toggle("chat-question-answer-expandable", !!this.contentFactory);
    if (this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      const icon = dom.$("span.chat-question-summary-answer-icon");
      icon.classList.add(...ThemeIcon.asClassNameArray(this.answerIcon));
      icon.setAttribute("aria-hidden", "true");
      const value = dom.$("span.chat-question-summary-answer-value");
      value.textContent = this.value;
      this._register(this.hoverService.setupDelayedHover(value, { content: this.value }));
      labelElement.appendChild(icon);
      if (this.prefix) {
        const prefix = dom.$("span.chat-question-summary-prefix");
        prefix.textContent = this.prefix;
        labelElement.append(prefix, labelElement.ownerDocument.createTextNode(" "));
      }
      labelElement.appendChild(value);
      if (!this.contentFactory) {
        this._collapseButton.element.tabIndex = -1;
        this._collapseButton.element.setAttribute("aria-disabled", "true");
        this._collapseButton.element.removeAttribute("aria-expanded");
        this._hoverChevron?.remove();
      }
    }
    return element;
  }
  initContent() {
    return this.contentFactory?.() ?? dom.$(".chat-question-summary-empty-content");
  }
  expansionDidChange() {
    this.onDidChangeHeight();
  }
  hasSameContent(_other, _followingContent, _element) {
    return false;
  }
}
let ChatQuestionCarouselPart = class extends Disposable {
  constructor(carousel, _context, _options, _markdownRendererService, _hoverService, _accessibilityService, _contextKeyService, _keybindingService, _commandService, _configurationService, _terminalChatService) {
    super();
    this.carousel = carousel;
    this._context = _context;
    this._options = _options;
    this._markdownRendererService = _markdownRendererService;
    this._hoverService = _hoverService;
    this._accessibilityService = _accessibilityService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._terminalChatService = _terminalChatService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._currentIndex = 0;
    this._answers = /* @__PURE__ */ new Map();
    this._isCollapsed = false;
    this._isSkipped = false;
    this._textInputBoxes = /* @__PURE__ */ new Map();
    this._singleSelectItems = /* @__PURE__ */ new Map();
    this._multiSelectCheckboxes = /* @__PURE__ */ new Map();
    this._freeformTextareas = /* @__PURE__ */ new Map();
    this._inputBoxes = this._register(new DisposableStore());
    this._questionRenderStore = this._register(new MutableDisposable());
    /**
     * Disposable store for interactive UI components (header, nav buttons, etc.)
     * that should be disposed when transitioning to summary view.
     */
    this._interactiveUIStore = this._register(new MutableDisposable());
    this.domNode = dom.$(".chat-question-carousel-container");
    this.domNode.classList.toggle("chat-question-carousel-conversation", carousel.answerPresentation === "conversation");
    this.domNode.classList.toggle("chat-question-carousel-fit-content", this._options.fitContent === true);
    this.domNode.id = generateUuid();
    this._inChatQuestionCarouselContextKey = ChatContextKeys.inChatQuestionCarousel.bindTo(this._contextKeyService);
    this._chatQuestionCarouselHasTerminalContextKey = ChatContextKeys.chatQuestionCarouselHasTerminal.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => {
      this._inChatQuestionCarouselContextKey.set(true);
      this._chatQuestionCarouselHasTerminalContextKey.set(!!this.carousel.terminalId);
    }));
    this._register(focusTracker.onDidBlur(() => {
      this._inChatQuestionCarouselContextKey.set(false);
      this._chatQuestionCarouselHasTerminalContextKey.reset();
    }));
    this._register({ dispose: () => {
      this._inChatQuestionCarouselContextKey.reset();
      this._chatQuestionCarouselHasTerminalContextKey.reset();
    } });
    this.domNode.tabIndex = 0;
    this.domNode.setAttribute("role", "region");
    this.domNode.setAttribute("aria-roledescription", localize("chat.questionCarousel.roleDescription", "chat question"));
    this._updateAriaLabel();
    if (carousel instanceof ChatQuestionCarouselData) {
      if (typeof carousel.draftCurrentIndex === "number") {
        this._currentIndex = Math.max(0, Math.min(carousel.draftCurrentIndex, carousel.questions.length - 1));
      }
      if (typeof carousel.draftCollapsed === "boolean") {
        this._isCollapsed = carousel.draftCollapsed;
      }
      if (carousel.draftAnswers) {
        for (const [key, value] of Object.entries(carousel.draftAnswers)) {
          this._answers.set(key, value);
        }
      }
    }
    if (carousel.data) {
      for (const [key, value] of Object.entries(carousel.data)) {
        this._answers.set(key, value);
      }
    }
    const responseIsComplete = isResponseVM(this._context.element) && this._context.element.isComplete;
    if (carousel.isUsed || responseIsComplete) {
      this._isSkipped = true;
      this.domNode.classList.add("chat-question-carousel-used");
      this.renderSummary();
      return;
    }
    const interactiveStore = new DisposableStore();
    this._interactiveUIStore.value = interactiveStore;
    this._questionContainer = dom.$(".chat-question-carousel-content");
    this.domNode.append(this._questionContainer);
    this._headerActionsContainer = dom.$(".chat-question-header-actions");
    const collapseToggleTitle = localize("chat.questionCarousel.collapseTitle", "Collapse Questions");
    const collapseButton = interactiveStore.add(new Button(this._headerActionsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    collapseButton.element.classList.add("chat-question-collapse-toggle");
    collapseButton.element.setAttribute("aria-label", collapseToggleTitle);
    this._collapseButton = collapseButton;
    if (carousel.allowSkip) {
      this._closeButtonContainer = dom.$(".chat-question-close-container");
      const skipAllTitle = localize("chat.questionCarousel.skipAllTitle", "Skip all questions");
      const skipAllButton = interactiveStore.add(new Button(this._closeButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      skipAllButton.label = `$(${Codicon.closeSmall.id})`;
      skipAllButton.element.classList.add("chat-question-close");
      skipAllButton.element.setAttribute("aria-label", skipAllTitle);
      interactiveStore.add(this._hoverService.setupDelayedHover(skipAllButton.element, { content: skipAllTitle }));
      this._skipAllButton = skipAllButton;
    }
    if (carousel.terminalId) {
      this._focusTerminalButtonContainer = dom.$(".chat-question-focus-terminal-container");
      const focusTerminalTitle = localize("chat.questionCarousel.focusTerminalTitle", "Focus Terminal");
      const kbLabel = this._keybindingService.lookupKeybinding("workbench.action.chat.focusQuestionCarouselTerminal")?.getLabel();
      const focusTerminalAriaLabel = kbLabel ? localize("chat.questionCarousel.focusTerminalAriaLabel", "Focus Terminal ({0})", kbLabel) : focusTerminalTitle;
      const focusTerminalButton = interactiveStore.add(new Button(this._focusTerminalButtonContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      focusTerminalButton.label = `$(${Codicon.terminal.id})`;
      focusTerminalButton.element.classList.add("chat-question-focus-terminal");
      focusTerminalButton.element.setAttribute("aria-label", focusTerminalAriaLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(focusTerminalButton.element, { content: focusTerminalTitle }));
      interactiveStore.add(focusTerminalButton.onDidClick(() => this._focusTerminal()));
      const terminalInstance = this._terminalChatService.getTerminalInstanceByExecutionId(carousel.terminalId);
      if (terminalInstance) {
        interactiveStore.add(terminalInstance.onDidInputData(() => {
          if (!this._isSkipped) {
            if (carousel instanceof ChatQuestionCarouselData) {
              carousel.dismissedByTerminalInput = true;
            }
            this.ignore();
          }
        }));
      }
    }
    interactiveStore.add(collapseButton.onDidClick(() => this.toggleCollapsed()));
    if (this._skipAllButton) {
      interactiveStore.add(this._skipAllButton.onDidClick(() => this.ignore()));
    }
    interactiveStore.add(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.Escape && this.carousel.allowSkip) {
        e.preventDefault();
        e.stopPropagation();
        this.ignore();
      } else if (event.keyCode === KeyCode.Enter && (event.metaKey || event.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        this.submit();
      } else if (event.keyCode === KeyCode.Enter && !event.shiftKey) {
        const target = e.target;
        const isTextInput = target.tagName === "INPUT" && target.type === "text";
        const isFreeformTextarea = target.tagName === "TEXTAREA" && target.classList.contains("chat-question-freeform-textarea");
        if (isTextInput || isFreeformTextarea) {
          e.preventDefault();
          e.stopPropagation();
          this.handleNextOrSubmit();
        }
      } else if ((event.ctrlKey || event.metaKey) && (event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Delete)) {
        e.stopPropagation();
      }
    }));
    this.renderCurrentQuestion();
  }
  /**
   * Saves the current question's answer to the answers map.
   */
  saveCurrentAnswer() {
    const currentQuestion = this.carousel.questions[this._currentIndex];
    const answer = this.getCurrentAnswer();
    if (answer !== void 0) {
      this._answers.set(currentQuestion.id, answer);
    } else {
      this._answers.delete(currentQuestion.id);
    }
    if (currentQuestion?.validation && typeof answer === "string" && answer !== "") {
      const error = this.getValidationError(answer, currentQuestion.validation);
      if (error) {
        this.showValidationError(error);
      } else {
        this.clearValidationError();
      }
    } else {
      this.clearValidationError();
    }
    this.updateFooterState();
    this.persistDraftState();
  }
  persistDraftState() {
    if (this.carousel.isUsed || !(this.carousel instanceof ChatQuestionCarouselData)) {
      return;
    }
    this.carousel.draftAnswers = Object.fromEntries(this._answers.entries());
    this.carousel.draftCurrentIndex = this._currentIndex;
    this.carousel.draftCollapsed = this._isCollapsed;
  }
  toggleCollapsed() {
    this._isCollapsed = !this._isCollapsed;
    this.persistDraftState();
    this.updateCollapsedPresentation();
    this._onDidChangeHeight.fire();
  }
  _focusTerminal() {
    const terminalId = this.carousel.terminalId;
    if (!terminalId) {
      return;
    }
    this._commandService.executeCommand("workbench.action.terminal.chat.focusTerminalByExecutionId", terminalId);
  }
  updateCollapsedPresentation() {
    this.domNode.classList.toggle("chat-question-carousel-collapsed", this._isCollapsed);
    if (this._collapseButton) {
      const collapsed = this._isCollapsed;
      const buttonTitle = collapsed ? localize("chat.questionCarousel.expandTitle", "Expand Questions") : localize("chat.questionCarousel.collapseTitle", "Collapse Questions");
      const contentId = this.domNode.id;
      this._collapseButton.label = collapsed ? `$(${Codicon.chevronUp.id})` : `$(${Codicon.chevronDown.id})`;
      this._collapseButton.element.setAttribute("aria-label", buttonTitle);
      this._collapseButton.element.setAttribute("aria-expanded", String(!collapsed));
      this._collapseButton.element.setAttribute("aria-controls", contentId);
      this._collapseButton.setTitle(buttonTitle);
    }
  }
  /**
   * Navigates the carousel by the given delta.
   * @param delta Negative for previous, positive for next
   */
  navigate(delta) {
    const newIndex = this._currentIndex + delta;
    if (newIndex >= 0 && newIndex < this.carousel.questions.length) {
      this.saveCurrentAnswer();
      this._currentIndex = newIndex;
      this.persistDraftState();
      this.renderCurrentQuestion(true);
      this.domNode.focus();
    }
  }
  /**
   * Handles the next/submit behavior for keyboard and option selection flows.
   * Either advances to the next question or submits when on the last question.
   */
  handleNextOrSubmit() {
    this.saveCurrentAnswer();
    if (!this.validateCurrentQuestion()) {
      return;
    }
    if (this._currentIndex < this.carousel.questions.length - 1) {
      this._currentIndex++;
      this.persistDraftState();
      this.renderCurrentQuestion(true);
    } else {
      if (!this.validateRequiredFields()) {
        return;
      }
      this._options.onSubmit(this._answers);
      this.hideAndShowSummary();
    }
  }
  /**
   * Handles explicit submit action from the dedicated submit button.
   */
  submit() {
    this.saveCurrentAnswer();
    if (!this.validateCurrentQuestion()) {
      return;
    }
    if (!this.validateRequiredFields()) {
      return;
    }
    this._options.onSubmit(this._answers);
    this.hideAndShowSummary();
  }
  /**
   * Focuses the container element and announces the question for screen reader users.
   */
  _focusContainerAndAnnounce() {
    this.domNode.focus();
    const question = this.carousel.questions[this._currentIndex];
    if (question) {
      const questionText = getDisplayedQuestionText(question);
      const messageContent = this.getQuestionText(questionText);
      const questionCount = this.carousel.questions.length;
      const alertMessage = questionCount === 1 ? messageContent : localize("chat.questionCarousel.questionAlertMulti", "Question {0} of {1}: {2}", this._currentIndex + 1, questionCount, messageContent);
      this._accessibilityService.alert(alertMessage);
    }
  }
  /**
   * Hides the carousel UI and shows a summary of answers.
   */
  hideAndShowSummary() {
    if (this._store.isDisposed) {
      return;
    }
    this._isSkipped = true;
    this.domNode.classList.add("chat-question-carousel-used");
    this.clearInteractiveResources();
    dom.clearNode(this.domNode);
    this.renderSummary();
    this._onDidChangeHeight.fire();
  }
  /**
   * Clears and disposes all interactive UI resources (header, nav buttons, input boxes, etc.)
   * and resets references to disposed elements.
   */
  clearInteractiveResources() {
    this._interactiveUIStore.clear();
    this._questionRenderStore.clear();
    this._inputBoxes.clear();
    this._textInputBoxes.clear();
    this._singleSelectItems.clear();
    this._multiSelectCheckboxes.clear();
    this._freeformTextareas.clear();
    this._prevButton = void 0;
    this._nextButton = void 0;
    this._submitButton = void 0;
    this._skipAllButton = void 0;
    this._questionContainer = void 0;
    this._headerActionsContainer = void 0;
    this._closeButtonContainer = void 0;
    this._focusTerminalButtonContainer = void 0;
    this._collapseButton = void 0;
    this._footerRow = void 0;
    this._stepIndicator = void 0;
    this._submitHint = void 0;
    this._inputScrollable = void 0;
  }
  layoutInputScrollable(inputScrollable) {
    if (!this._questionContainer) {
      return;
    }
    const scrollableNode = inputScrollable.getDomNode();
    const scrollableContent = scrollableNode.firstElementChild;
    if (!dom.isHTMLElement(scrollableContent)) {
      return;
    }
    if (scrollableNode.style.height !== "" || scrollableNode.style.maxHeight !== "") {
      scrollableNode.style.height = "";
      scrollableNode.style.maxHeight = "";
    }
    if (scrollableContent.style.height !== "" || scrollableContent.style.maxHeight !== "") {
      scrollableContent.style.height = "";
      scrollableContent.style.maxHeight = "";
    }
    const maxContainerHeight = this._questionContainer.clientHeight;
    const computedStyle = dom.getWindow(this._questionContainer).getComputedStyle(this._questionContainer);
    const contentVerticalPadding = Number.parseFloat(computedStyle.paddingTop || "0") + Number.parseFloat(computedStyle.paddingBottom || "0");
    const nonScrollableContentHeight = Array.from(this._questionContainer.children).filter((child) => child !== scrollableNode).reduce((sum, child) => sum + child.offsetHeight, 0);
    const availableScrollableHeight = Math.floor(maxContainerHeight - contentVerticalPadding - nonScrollableContentHeight);
    const contentScrollableHeight = scrollableContent.scrollHeight;
    const constrainedScrollableHeight = this._options.fitContent ? contentScrollableHeight : Math.max(0, Math.min(availableScrollableHeight, contentScrollableHeight));
    const constrainedScrollableHeightPx = `${constrainedScrollableHeight}px`;
    if (scrollableNode.style.height !== constrainedScrollableHeightPx || scrollableNode.style.maxHeight !== constrainedScrollableHeightPx) {
      scrollableNode.style.height = constrainedScrollableHeightPx;
      scrollableNode.style.maxHeight = constrainedScrollableHeightPx;
    }
    if (scrollableContent.style.height !== constrainedScrollableHeightPx || scrollableContent.style.maxHeight !== constrainedScrollableHeightPx) {
      scrollableContent.style.height = constrainedScrollableHeightPx;
      scrollableContent.style.maxHeight = constrainedScrollableHeightPx;
    }
    inputScrollable.scanDomNode();
  }
  /**
   * Skips the carousel with default values - called when user wants to proceed quickly.
   * Returns defaults for all questions.
   *
   * `carousel.isUsed` covers resolution that did not come from this part: a
   * voice answer dismisses the carousel directly, and a later auto-skip on
   * request submit would otherwise overwrite the answer that actually landed
   * with defaults.
   */
  skip() {
    if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
      return false;
    }
    const defaults = this.getDefaultAnswers();
    this._options.onSubmit(defaults);
    this._answers.clear();
    for (const [key, value] of defaults) {
      this._answers.set(key, value);
    }
    this.hideAndShowSummary();
    return true;
  }
  /**
   * Ignores the carousel completely - called when user wants to dismiss without data.
   * Returns undefined to signal the carousel was ignored.
   *
   * Guarded on `carousel.isUsed` for the same reason as {@link skip}.
   */
  ignore() {
    if (this._isSkipped || this.carousel.isUsed || !this.carousel.allowSkip) {
      return false;
    }
    this._isSkipped = true;
    this._options.onSubmit(void 0);
    this.clearInteractiveResources();
    this.domNode.classList.add("chat-question-carousel-used");
    dom.clearNode(this.domNode);
    this.renderTerminalStateMessage();
    this._onDidChangeHeight.fire();
    return true;
  }
  /**
   * Collects default values for all questions in the carousel.
   */
  getDefaultAnswers() {
    const answers = /* @__PURE__ */ new Map();
    for (const question of this.carousel.questions) {
      const defaultAnswer = this.getDefaultAnswerForQuestion(question);
      if (defaultAnswer !== void 0) {
        answers.set(question.id, defaultAnswer);
      }
    }
    return answers;
  }
  /**
   * Gets the default answer for a specific question.
   */
  getDefaultAnswerForQuestion(question) {
    switch (question.type) {
      case "text":
        return typeof question.defaultValue === "string" ? question.defaultValue : void 0;
      case "singleSelect": {
        const defaultOptionId = typeof question.defaultValue === "string" ? question.defaultValue : void 0;
        const defaultOption = defaultOptionId !== void 0 ? question.options?.find((opt) => opt.id === defaultOptionId) : void 0;
        const selectedValue = defaultOption?.value;
        return selectedValue !== void 0 ? { selectedValue, freeformValue: void 0 } : void 0;
      }
      case "multiSelect": {
        const defaultIds = Array.isArray(question.defaultValue) ? question.defaultValue : typeof question.defaultValue === "string" ? [question.defaultValue] : [];
        const selectedValues = question.options?.filter((opt) => defaultIds.includes(opt.id)).map((opt) => opt.value).filter((v) => v !== void 0) ?? [];
        return selectedValues.length > 0 ? { selectedValues, freeformValue: void 0 } : void 0;
      }
      default:
        return typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0;
    }
  }
  /**
   * Returns whether auto-focus should be enabled.
   * Disabled when screen reader mode is active or when explicitly disabled via options.
   */
  _shouldAutoFocus() {
    if (this._options.shouldAutoFocus === false) {
      return false;
    }
    return !this._accessibilityService.isScreenReaderOptimized();
  }
  /**
   * Updates the aria-label of the carousel container based on the current question.
   */
  _updateAriaLabel() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      this.domNode.setAttribute("aria-label", localize("chat.questionCarousel.label", "Chat question"));
      return;
    }
    const questionText = getDisplayedQuestionText(question);
    const messageContent = this.getQuestionText(questionText);
    const questionCount = this.carousel.questions.length;
    let label;
    if (questionCount === 1) {
      label = localize("chat.questionCarousel.singleQuestionLabel", "Chat question: {0}", messageContent);
    } else {
      label = localize("chat.questionCarousel.multiQuestionLabel", "Chat question {0} of {1}: {2}", this._currentIndex + 1, questionCount, messageContent);
    }
    const verbose = this._configurationService.getValue(AccessibilityVerbositySettingId.ChatQuestionCarousel);
    if (verbose && this.carousel.terminalId) {
      const kbLabel = this._keybindingService.lookupKeybinding("workbench.action.chat.focusQuestionCarouselTerminal")?.getLabel();
      if (kbLabel) {
        label = localize("chat.questionCarousel.combinedFocusTerminalHint", "{0} Use {1} to focus the terminal.", label, kbLabel);
      } else {
        label = localize("chat.questionCarousel.combinedFocusTerminalHintNoKb", "{0} Use the Focus Terminal from Question Carousel command to focus the terminal.", label);
      }
    }
    this.domNode.setAttribute("aria-label", label);
  }
  /**
   * Focuses the carousel container element.
   */
  focus() {
    this.domNode.focus();
  }
  /**
   * Returns whether the carousel container has focus.
   */
  hasFocus() {
    return dom.isAncestorOfActiveElement(this.domNode);
  }
  navigateToPreviousQuestion() {
    if (this._currentIndex <= 0) {
      return false;
    }
    this.navigate(-1);
    return true;
  }
  navigateToNextQuestion() {
    if (this._currentIndex >= this.carousel.questions.length - 1) {
      return false;
    }
    this.navigate(1);
    return true;
  }
  focusTerminal() {
    if (!this.carousel.terminalId) {
      return false;
    }
    this._focusTerminal();
    return true;
  }
  renderCurrentQuestion(focusContainerForScreenReader = false) {
    if (!this._questionContainer) {
      return;
    }
    const questionRenderStore = new DisposableStore();
    this._questionRenderStore.value = questionRenderStore;
    this._inputScrollable = void 0;
    this._inputBoxes.clear();
    this._textInputBoxes.clear();
    this._singleSelectItems.clear();
    this._multiSelectCheckboxes.clear();
    this._freeformTextareas.clear();
    dom.clearNode(this._questionContainer);
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return;
    }
    const headerRow = dom.$(".chat-question-header-row");
    const titleRow = dom.$(".chat-question-title-row");
    if (this.carousel.message && this._currentIndex === 0) {
      const messageMd = isMarkdownString(this.carousel.message) ? MarkdownString.lift(this.carousel.message) : new MarkdownString(this.carousel.message);
      const carouselMessage = dom.$(".chat-question-carousel-message");
      const renderedMessage = questionRenderStore.add(this._markdownRendererService.render(messageMd, getChatMarkdownRenderOptions()));
      carouselMessage.appendChild(renderedMessage.element);
      headerRow.appendChild(carouselMessage);
    }
    const questionText = getDisplayedQuestionText(question);
    if (questionText) {
      const title = dom.$(".chat-question-title");
      const messageContent = this.getQuestionText(questionText);
      title.setAttribute("aria-label", messageContent);
      const rawValue = isMarkdownString(questionText) ? questionText.value : questionText;
      const suffixed = question.required ? `${rawValue} *` : rawValue;
      const md = isMarkdownString(questionText) ? MarkdownString.lift({ ...questionText, value: suffixed }) : new MarkdownString(suffixed);
      const rendered = questionRenderStore.add(this._markdownRendererService.render(md, getChatMarkdownRenderOptions()));
      title.appendChild(rendered.element);
      titleRow.appendChild(title);
    }
    headerRow.appendChild(titleRow);
    if (this._headerActionsContainer) {
      dom.clearNode(this._headerActionsContainer);
      if (this._focusTerminalButtonContainer) {
        this._headerActionsContainer.appendChild(this._focusTerminalButtonContainer);
      }
      if (this._closeButtonContainer) {
        this._headerActionsContainer.appendChild(this._closeButtonContainer);
      }
      if (this._collapseButton) {
        this._headerActionsContainer.appendChild(this._collapseButton.element);
      }
      titleRow.appendChild(this._headerActionsContainer);
    }
    this._questionContainer.appendChild(headerRow);
    if (question.description) {
      const descriptionEl = dom.$(".chat-question-description");
      descriptionEl.textContent = question.description;
      this._questionContainer.appendChild(descriptionEl);
    }
    const inputContainer = dom.$(".chat-question-input-container");
    if (question.detailedMessage) {
      const detailedMd = isMarkdownString(question.detailedMessage) ? MarkdownString.lift(question.detailedMessage) : new MarkdownString(question.detailedMessage);
      const detailedMessageEl = dom.$(".chat-question-detailed-message");
      const renderedDetailedMessage = questionRenderStore.add(this._markdownRendererService.render(detailedMd, getChatMarkdownRenderOptions()));
      detailedMessageEl.appendChild(renderedDetailedMessage.element);
      inputContainer.appendChild(detailedMessageEl);
    }
    this.renderInput(inputContainer, question);
    const inputScrollable = questionRenderStore.add(new DomScrollableElement(inputContainer, {
      vertical: ScrollbarVisibility.Visible,
      horizontal: ScrollbarVisibility.Hidden,
      consumeMouseWheelIfScrollbarIsNeeded: true
    }));
    this._inputScrollable = inputScrollable;
    const inputScrollableNode = inputScrollable.getDomNode();
    inputScrollableNode.classList.add("chat-question-input-scrollable");
    this._questionContainer.appendChild(inputScrollableNode);
    this._validationMessageElement = dom.$(".chat-question-validation-message");
    this._validationMessageElement.style.display = "none";
    this._questionContainer.appendChild(this._validationMessageElement);
    const isSingleQuestion = this.carousel.questions.length === 1;
    if (!isSingleQuestion) {
      this.renderFooter();
    } else {
      this.renderSingleQuestionFooter();
    }
    let relayoutScheduled = false;
    const relayoutScheduler = questionRenderStore.add(new MutableDisposable());
    const scheduleLayoutInputScrollable = () => {
      if (relayoutScheduled) {
        return;
      }
      relayoutScheduled = true;
      relayoutScheduler.value = dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
        relayoutScheduled = false;
        this.layoutInputScrollable(inputScrollable);
      });
    };
    const inputResizeObserver = questionRenderStore.add(new dom.DisposableResizeObserver("ChatQuestionCarouselPart.inputScrollable", () => scheduleLayoutInputScrollable()));
    questionRenderStore.add(inputResizeObserver.observe(inputScrollableNode));
    questionRenderStore.add(inputResizeObserver.observe(inputContainer));
    questionRenderStore.add(dom.addDisposableListener(dom.getWindow(this.domNode), dom.EventType.RESIZE, () => scheduleLayoutInputScrollable()));
    scheduleLayoutInputScrollable();
    questionRenderStore.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(this.domNode), () => {
      inputContainer.scrollTop = 0;
      inputContainer.scrollLeft = 0;
      inputScrollable.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      inputScrollable.scanDomNode();
    }));
    this._updateAriaLabel();
    this.updateCollapsedPresentation();
    if (focusContainerForScreenReader && this._accessibilityService.isScreenReaderOptimized()) {
      this._focusContainerAndAnnounce();
    }
    this._onDidChangeHeight.fire();
  }
  /**
   * Renders or updates the persistent footer with nav arrows, step indicator, and submit button.
   */
  renderFooter() {
    if (!this._footerRow) {
      const interactiveStore = this._interactiveUIStore.value;
      if (!interactiveStore) {
        return;
      }
      this._footerRow = dom.$(".chat-question-footer-row");
      const leftControls = dom.$(".chat-question-footer-left.chat-question-carousel-nav");
      leftControls.setAttribute("role", "navigation");
      leftControls.setAttribute("aria-label", localize("chat.questionCarousel.navigation", "Question navigation"));
      const arrowsContainer = dom.$(".chat-question-nav-arrows");
      const previousLabel = this.getLabelWithKeybinding(localize("previous", "Previous"), PREVIOUS_QUESTION_ACTION_ID);
      const prevButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      prevButton.element.classList.add("chat-question-nav-arrow", "chat-question-nav-prev");
      prevButton.label = `$(${Codicon.chevronLeft.id})`;
      prevButton.element.setAttribute("aria-label", previousLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(prevButton.element, { content: previousLabel }));
      interactiveStore.add(prevButton.onDidClick(() => this.navigate(-1)));
      this._prevButton = prevButton;
      const nextLabel = this.getLabelWithKeybinding(localize("next", "Next"), NEXT_QUESTION_ACTION_ID);
      const nextButton = interactiveStore.add(new Button(arrowsContainer, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
      nextButton.element.classList.add("chat-question-nav-arrow", "chat-question-nav-next");
      nextButton.label = `$(${Codicon.chevronRight.id})`;
      nextButton.element.setAttribute("aria-label", nextLabel);
      interactiveStore.add(this._hoverService.setupDelayedHover(nextButton.element, { content: nextLabel }));
      interactiveStore.add(nextButton.onDidClick(() => this.navigate(1)));
      this._nextButton = nextButton;
      leftControls.appendChild(arrowsContainer);
      this._stepIndicator = dom.$(".chat-question-step-indicator");
      leftControls.appendChild(this._stepIndicator);
      this._footerRow.appendChild(leftControls);
      const rightControls = dom.$(".chat-question-footer-right");
      const hint = dom.$("span.chat-question-submit-hint");
      hint.textContent = isMacintosh ? localize("chat.questionCarousel.submitHintMac", "\u2318\u23CE to submit") : localize("chat.questionCarousel.submitHintOther", "Ctrl+Enter to submit");
      rightControls.appendChild(hint);
      this._submitHint = hint;
      const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
      submitButton.element.classList.add("chat-question-submit-button");
      submitButton.label = localize("submit", "Submit");
      interactiveStore.add(submitButton.onDidClick(() => this.submit()));
      this._submitButton = submitButton;
      this._footerRow.appendChild(rightControls);
      this.domNode.append(this._footerRow);
    }
    this.updateFooterState();
  }
  /**
   * Updates the footer nav button enabled state and step indicator text.
   */
  updateFooterState() {
    if (this._prevButton) {
      this._prevButton.enabled = this._currentIndex > 0;
    }
    if (this._nextButton) {
      const canAdvance = this._currentIndex < this.carousel.questions.length - 1;
      const question = this.carousel.questions[this._currentIndex];
      const answer = this._answers.get(question?.id);
      const hasAnswer = answer !== void 0 && answer !== "";
      const hasValidationError = !!this._currentValidationError;
      this._nextButton.enabled = canAdvance && (!question?.required || hasAnswer) && !hasValidationError;
    }
    if (this._stepIndicator) {
      this._stepIndicator.textContent = localize(
        "chat.questionCarousel.stepIndicator",
        "{0}/{1}",
        this._currentIndex + 1,
        this.carousel.questions.length
      );
    }
    if (this._submitButton) {
      const isLastQuestion = this._currentIndex === this.carousel.questions.length - 1;
      this._submitButton.element.style.display = isLastQuestion ? "" : "none";
      if (this._submitHint) {
        this._submitHint.style.display = isLastQuestion ? "" : "none";
      }
    }
  }
  /**
   * Renders a simplified footer with just a submit button for single-question multi-select carousels.
   */
  renderSingleQuestionFooter() {
    if (!this._footerRow) {
      const interactiveStore = this._interactiveUIStore.value;
      if (!interactiveStore) {
        return;
      }
      this._footerRow = dom.$(".chat-question-footer-row");
      const leftControls = dom.$(".chat-question-footer-left.chat-question-carousel-nav");
      leftControls.setAttribute("role", "navigation");
      leftControls.setAttribute("aria-label", localize("chat.questionCarousel.navigation", "Question navigation"));
      this._footerRow.appendChild(leftControls);
      const rightControls = dom.$(".chat-question-footer-right");
      const hint = dom.$("span.chat-question-submit-hint");
      hint.textContent = isMacintosh ? localize("chat.questionCarousel.submitHintMac", "\u2318\u23CE to submit") : localize("chat.questionCarousel.submitHintOther", "Ctrl+Enter to submit");
      rightControls.appendChild(hint);
      this._submitHint = hint;
      const submitButton = interactiveStore.add(new Button(rightControls, { ...defaultButtonStyles }));
      submitButton.element.classList.add("chat-question-submit-button");
      submitButton.label = localize("submit", "Submit");
      interactiveStore.add(submitButton.onDidClick(() => this.submit()));
      this._submitButton = submitButton;
      this._footerRow.appendChild(rightControls);
      this.domNode.append(this._footerRow);
    }
  }
  getLabelWithKeybinding(label, actionId) {
    const keybindingLabel = this._keybindingService.lookupKeybinding(actionId, this._contextKeyService)?.getLabel();
    return keybindingLabel ? localize("chat.questionCarousel.labelWithKeybinding", "{0} ({1})", label, keybindingLabel) : label;
  }
  renderInput(container, question) {
    switch (question.type) {
      case "text":
        this.renderTextInput(container, question);
        break;
      case "singleSelect":
        this.renderSingleSelect(container, question);
        break;
      case "multiSelect":
        this.renderMultiSelect(container, question);
        break;
    }
  }
  /**
   * Sets up auto-resize behavior for a textarea element.
   * @returns A function that triggers the resize manually (useful for initial sizing).
   */
  setupTextareaAutoResize(textarea) {
    const autoResize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      if (this._inputScrollable) {
        this.layoutInputScrollable(this._inputScrollable);
      }
      this._onDidChangeHeight.fire();
    };
    this._inputBoxes.add(dom.addDisposableListener(textarea, dom.EventType.INPUT, autoResize));
    return autoResize;
  }
  renderTextInput(container, question) {
    const inputBox = this._inputBoxes.add(new InputBox(container, void 0, {
      placeholder: localize("chat.questionCarousel.enterText", "Enter your answer"),
      inputBoxStyles: defaultInputBoxStyles,
      validationOptions: question.validation ? {
        validation: (value) => {
          if (!value && !question.required) {
            return null;
          }
          const error = this.getValidationError(value, question.validation);
          if (error) {
            return { type: 2, content: error };
          }
          return null;
        }
      } : void 0
    }));
    this._inputBoxes.add(inputBox.onDidChange(() => {
      this.saveCurrentAnswer();
    }));
    const previousAnswer = this._answers.get(question.id);
    if (previousAnswer !== void 0) {
      inputBox.value = String(previousAnswer);
    } else if (question.defaultValue !== void 0) {
      inputBox.value = String(question.defaultValue);
    }
    this._textInputBoxes.set(question.id, inputBox);
    if (this._shouldAutoFocus()) {
      this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(inputBox.element), () => inputBox.focus()));
    }
  }
  renderSingleSelect(container, question) {
    const orderedOptions = getOptionsWithDefaultsFirst(question);
    const selectContainer = dom.$(".chat-question-list");
    selectContainer.setAttribute("role", "listbox");
    selectContainer.setAttribute("aria-label", question.title);
    selectContainer.tabIndex = 0;
    container.appendChild(selectContainer);
    const previousAnswer = this._answers.get(question.id);
    const prevSingle = typeof previousAnswer === "object" && previousAnswer !== null && hasKey(previousAnswer, { selectedValue: true }) ? previousAnswer : void 0;
    const previousFreeform = prevSingle?.freeformValue;
    const previousSelectedValue = prevSingle?.selectedValue;
    const defaultOptionId = typeof question.defaultValue === "string" ? question.defaultValue : void 0;
    let selectedIndex = -1;
    orderedOptions.forEach(({ option }, index) => {
      if (previousSelectedValue !== void 0 && option.value === previousSelectedValue) {
        selectedIndex = index;
      } else if (selectedIndex === -1 && !previousFreeform && defaultOptionId !== void 0 && option.id === defaultOptionId) {
        selectedIndex = index;
      }
    });
    const listItems = [];
    const indicators = [];
    const updateSelection = (newIndex) => {
      listItems.forEach((item, i) => {
        const isSelected = i === newIndex;
        item.classList.toggle("selected", isSelected);
        item.setAttribute("aria-selected", String(isSelected));
        const indicator = indicators[i];
        indicator.classList.toggle("codicon", isSelected);
        indicator.classList.toggle("codicon-check", isSelected);
      });
      if (newIndex >= 0 && newIndex < listItems.length) {
        selectContainer.setAttribute("aria-activedescendant", listItems[newIndex].id);
      }
      const data = this._singleSelectItems.get(question.id);
      if (data) {
        data.selectedIndex = newIndex;
      }
      this.saveCurrentAnswer();
    };
    orderedOptions.forEach(({ option }, index) => {
      const isSelected = index === selectedIndex;
      const listItem = dom.$(".chat-question-list-item");
      listItem.setAttribute("role", "option");
      listItem.setAttribute("aria-selected", String(isSelected));
      listItem.setAttribute("aria-label", localize("chat.questionCarousel.optionLabel", "Option {0}: {1}", index + 1, option.label));
      listItem.id = `option-${question.id}-${index}`;
      listItem.tabIndex = -1;
      const number = dom.$(".chat-question-list-number");
      number.textContent = `${index + 1}`;
      listItem.appendChild(number);
      const indicator = dom.$(".chat-question-list-indicator");
      if (isSelected) {
        indicator.classList.add("codicon", "codicon-check");
      }
      indicators.push(indicator);
      const label = dom.$(".chat-question-list-label");
      const separatorIndex = option.label.indexOf(" - ");
      if (separatorIndex !== -1) {
        listItem.classList.add("has-description");
        const titleSpan = dom.$("span.chat-question-list-label-title");
        titleSpan.textContent = option.label.substring(0, separatorIndex);
        label.appendChild(titleSpan);
        const descSpan = dom.$("span.chat-question-list-label-desc");
        descSpan.textContent = option.label.substring(separatorIndex + 3);
        label.appendChild(descSpan);
      } else {
        label.textContent = option.label;
      }
      listItem.appendChild(label);
      listItem.appendChild(indicator);
      if (isSelected) {
        listItem.classList.add("selected");
      }
      this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateSelection(index);
        const freeform = this._freeformTextareas.get(question.id);
        if (freeform) {
          freeform.value = "";
        }
        this.handleNextOrSubmit();
      }));
      this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
        content: option.label,
        position: { hoverPosition: HoverPosition.BELOW },
        appearance: { showPointer: true }
      }));
      selectContainer.appendChild(listItem);
      listItems.push(listItem);
    });
    this._singleSelectItems.set(question.id, { items: listItems, selectedIndex, optionIndices: orderedOptions.map((o) => o.originalIndex) });
    if (selectedIndex >= 0 && selectedIndex < listItems.length) {
      selectContainer.setAttribute("aria-activedescendant", listItems[selectedIndex].id);
    }
    let freeformTextarea;
    if (question.allowFreeformInput !== false) {
      const freeformContainer = dom.$(".chat-question-freeform");
      const freeformNumber = dom.$(".chat-question-freeform-number");
      freeformNumber.textContent = `${orderedOptions.length + 1}`;
      freeformContainer.appendChild(freeformNumber);
      freeformTextarea = dom.$("textarea.chat-question-freeform-textarea");
      freeformTextarea.placeholder = localize("chat.questionCarousel.enterCustomAnswer", "Enter custom answer");
      freeformTextarea.rows = 1;
      if (previousFreeform !== void 0) {
        freeformTextarea.value = previousFreeform;
      }
      const autoResize = this.setupTextareaAutoResize(freeformTextarea);
      const capturedFreeform = freeformTextarea;
      this._inputBoxes.add(dom.addDisposableListener(capturedFreeform, dom.EventType.INPUT, () => {
        if (capturedFreeform.value.length > 0) {
          updateSelection(-1);
        } else {
          this.saveCurrentAnswer();
        }
      }));
      freeformContainer.appendChild(freeformTextarea);
      container.appendChild(freeformContainer);
      this._freeformTextareas.set(question.id, freeformTextarea);
      if (previousFreeform !== void 0) {
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => autoResize()));
      }
    }
    this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      const data = this._singleSelectItems.get(question.id);
      if (!data || !listItems.length) {
        return;
      }
      let newIndex = data.selectedIndex;
      if (event.keyCode === KeyCode.DownArrow) {
        e.preventDefault();
        newIndex = Math.min(data.selectedIndex + 1, listItems.length - 1);
      } else if (event.keyCode === KeyCode.UpArrow) {
        e.preventDefault();
        newIndex = Math.max(data.selectedIndex - 1, 0);
      } else if ((event.keyCode === KeyCode.Enter || event.keyCode === KeyCode.Space) && !event.metaKey && !event.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        this.handleNextOrSubmit();
        return;
      } else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
        const numberIndex = event.keyCode - KeyCode.Digit1;
        if (numberIndex < listItems.length) {
          e.preventDefault();
          updateSelection(numberIndex);
        } else if (freeformTextarea && numberIndex === listItems.length) {
          e.preventDefault();
          updateSelection(-1);
          freeformTextarea.focus();
        }
        return;
      }
      if (newIndex !== data.selectedIndex && newIndex >= 0) {
        updateSelection(newIndex);
      }
    }));
    if (this._shouldAutoFocus()) {
      if (freeformTextarea && previousFreeform) {
        const capturedFreeform = freeformTextarea;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
          capturedFreeform.focus();
        }));
      } else if (listItems.length > 0) {
        const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
        if (selectedIndex < 0) {
          updateSelection(0);
        }
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
          listItems[focusIndex]?.focus();
        }));
      }
    }
  }
  renderMultiSelect(container, question) {
    const orderedOptions = getOptionsWithDefaultsFirst(question);
    const selectContainer = dom.$(".chat-question-list");
    selectContainer.setAttribute("role", "listbox");
    selectContainer.setAttribute("aria-multiselectable", "true");
    selectContainer.setAttribute("aria-label", question.title);
    selectContainer.tabIndex = 0;
    container.appendChild(selectContainer);
    const previousAnswer = this._answers.get(question.id);
    const prevMulti = typeof previousAnswer === "object" && previousAnswer !== null && hasKey(previousAnswer, { selectedValues: true }) ? previousAnswer : void 0;
    const previousFreeform = prevMulti?.freeformValue;
    const previousSelectedValues = prevMulti?.selectedValues ?? [];
    const defaultOptionIds = Array.isArray(question.defaultValue) ? question.defaultValue : typeof question.defaultValue === "string" ? [question.defaultValue] : [];
    const checkboxes = [];
    const listItems = [];
    let focusedIndex = 0;
    let firstCheckedIndex = -1;
    orderedOptions.forEach(({ option }, index) => {
      let isChecked = false;
      if (previousSelectedValues && previousSelectedValues.length > 0) {
        isChecked = previousSelectedValues.includes(option.value);
      } else if (!previousFreeform && defaultOptionIds.includes(option.id)) {
        isChecked = true;
      }
      const listItem = dom.$(".chat-question-list-item.multi-select");
      listItem.setAttribute("role", "option");
      listItem.setAttribute("aria-selected", String(isChecked));
      listItem.setAttribute("aria-label", localize("chat.questionCarousel.optionLabel", "Option {0}: {1}", index + 1, option.label));
      listItem.id = `option-${question.id}-${index}`;
      listItem.tabIndex = -1;
      const number = dom.$(".chat-question-list-number");
      number.textContent = `${index + 1}`;
      listItem.appendChild(number);
      const checkbox = this._inputBoxes.add(new Checkbox(option.label, isChecked, defaultCheckboxStyles));
      checkbox.domNode.classList.add("chat-question-list-checkbox");
      checkbox.domNode.tabIndex = -1;
      listItem.appendChild(checkbox.domNode);
      const label = dom.$(".chat-question-list-label");
      const separatorIndex = option.label.indexOf(" - ");
      if (separatorIndex !== -1) {
        listItem.classList.add("has-description");
        const titleSpan = dom.$("span.chat-question-list-label-title");
        titleSpan.textContent = option.label.substring(0, separatorIndex);
        label.appendChild(titleSpan);
        const descSpan = dom.$("span.chat-question-list-label-desc");
        descSpan.textContent = option.label.substring(separatorIndex + 3);
        label.appendChild(descSpan);
      } else {
        label.textContent = option.label;
      }
      listItem.appendChild(label);
      if (isChecked) {
        listItem.classList.add("checked");
        if (firstCheckedIndex === -1) {
          firstCheckedIndex = index;
        }
      }
      this._inputBoxes.add(checkbox.onChange(() => {
        listItem.classList.toggle("checked", checkbox.checked);
        listItem.setAttribute("aria-selected", String(checkbox.checked));
        this.saveCurrentAnswer();
      }));
      this._inputBoxes.add(dom.addDisposableListener(listItem, dom.EventType.CLICK, (e) => {
        focusedIndex = index;
        if (e.target !== checkbox.domNode && !checkbox.domNode.contains(e.target)) {
          checkbox.domNode.click();
        }
      }));
      this._inputBoxes.add(this._hoverService.setupDelayedHover(listItem, {
        content: option.label,
        position: { hoverPosition: HoverPosition.BELOW },
        appearance: { showPointer: true }
      }));
      selectContainer.appendChild(listItem);
      checkboxes.push(checkbox);
      listItems.push(listItem);
    });
    this._multiSelectCheckboxes.set(question.id, { checkboxes, optionIndices: orderedOptions.map((o) => o.originalIndex) });
    let freeformTextarea;
    if (question.allowFreeformInput !== false) {
      const freeformContainer = dom.$(".chat-question-freeform");
      const freeformNumber = dom.$(".chat-question-freeform-number");
      freeformNumber.textContent = `${orderedOptions.length + 1}`;
      freeformContainer.appendChild(freeformNumber);
      freeformTextarea = dom.$("textarea.chat-question-freeform-textarea");
      freeformTextarea.placeholder = localize("chat.questionCarousel.enterCustomAnswer", "Enter custom answer");
      freeformTextarea.rows = 1;
      if (previousFreeform !== void 0) {
        freeformTextarea.value = previousFreeform;
      }
      const autoResize = this.setupTextareaAutoResize(freeformTextarea);
      this._inputBoxes.add(dom.addDisposableListener(freeformTextarea, dom.EventType.INPUT, () => this.saveCurrentAnswer()));
      freeformContainer.appendChild(freeformTextarea);
      container.appendChild(freeformContainer);
      this._freeformTextareas.set(question.id, freeformTextarea);
      if (previousFreeform !== void 0) {
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(freeformTextarea), () => autoResize()));
      }
    }
    this._inputBoxes.add(dom.addDisposableListener(selectContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (!listItems.length) {
        return;
      }
      if (event.keyCode === KeyCode.DownArrow) {
        e.preventDefault();
        focusedIndex = Math.min(focusedIndex + 1, listItems.length - 1);
        listItems[focusedIndex].focus();
      } else if (event.keyCode === KeyCode.UpArrow) {
        e.preventDefault();
        focusedIndex = Math.max(focusedIndex - 1, 0);
        listItems[focusedIndex].focus();
      } else if (event.keyCode === KeyCode.Enter && !event.metaKey && !event.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        this.handleNextOrSubmit();
      } else if (event.keyCode === KeyCode.Space) {
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < checkboxes.length) {
          checkboxes[focusedIndex].domNode.click();
        }
      } else if (event.keyCode >= KeyCode.Digit1 && event.keyCode <= KeyCode.Digit9) {
        const numberIndex = event.keyCode - KeyCode.Digit1;
        if (numberIndex < checkboxes.length) {
          e.preventDefault();
          checkboxes[numberIndex].domNode.click();
        } else if (freeformTextarea && numberIndex === checkboxes.length) {
          e.preventDefault();
          freeformTextarea.focus();
        }
      }
    }));
    if (this._shouldAutoFocus()) {
      if (freeformTextarea && previousFreeform) {
        const capturedFreeform = freeformTextarea;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(capturedFreeform), () => {
          capturedFreeform.focus();
        }));
      } else if (listItems.length > 0) {
        const initialFocusIndex = firstCheckedIndex >= 0 ? firstCheckedIndex : 0;
        focusedIndex = initialFocusIndex;
        this._inputBoxes.add(dom.runAtThisOrScheduleAtNextAnimationFrame(dom.getWindow(selectContainer), () => {
          listItems[initialFocusIndex]?.focus();
        }));
      }
    }
  }
  getCurrentAnswer() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return void 0;
    }
    switch (question.type) {
      case "text": {
        const inputBox = this._textInputBoxes.get(question.id);
        return inputBox?.value ?? (typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0);
      }
      case "singleSelect": {
        const data = this._singleSelectItems.get(question.id);
        let selectedValue = void 0;
        if (data && data.selectedIndex >= 0) {
          const originalIndex = data.optionIndices[data.selectedIndex];
          selectedValue = originalIndex !== void 0 ? question.options?.[originalIndex]?.value : void 0;
        }
        if (selectedValue === void 0 && typeof question.defaultValue === "string") {
          const defaultOption = question.options?.find((opt) => opt.id === question.defaultValue);
          selectedValue = defaultOption?.value;
        }
        const freeformTextarea = this._freeformTextareas.get(question.id);
        const freeformValue = freeformTextarea?.value !== "" ? freeformTextarea?.value : void 0;
        if (freeformValue) {
          return { selectedValue: void 0, freeformValue };
        }
        if (selectedValue !== void 0) {
          return { selectedValue, freeformValue: void 0 };
        }
        return void 0;
      }
      case "multiSelect": {
        const data = this._multiSelectCheckboxes.get(question.id);
        const selectedValues = [];
        if (data) {
          data.checkboxes.forEach((checkbox, index) => {
            if (checkbox.checked) {
              const originalIndex = data.optionIndices[index];
              const value = originalIndex !== void 0 ? question.options?.[originalIndex]?.value : void 0;
              if (value !== void 0) {
                selectedValues.push(value);
              }
            }
          });
        }
        const freeformTextarea = this._freeformTextareas.get(question.id);
        const freeformValue = freeformTextarea?.value !== "" ? freeformTextarea?.value : void 0;
        if (freeformValue || selectedValues.length > 0) {
          return { selectedValues, freeformValue };
        }
        return void 0;
      }
      default:
        return typeof question.defaultValue === "string" ? question.defaultValue : Array.isArray(question.defaultValue) ? { selectedValues: question.defaultValue } : void 0;
    }
  }
  /**
   * Renders a terminal-state message (Skipped/Answered) when the carousel is
   * dismissed without structured answers.
   */
  renderTerminalStateMessage() {
    const summaryContainer = dom.$(".chat-question-carousel-summary");
    const isDismissedByTerminal = this.carousel instanceof ChatQuestionCarouselData && this.carousel.dismissedByTerminalInput;
    if (this.carousel.answeredExternally) {
      const answeredMessage = dom.$(".chat-question-summary-answered");
      answeredMessage.textContent = localize("chat.questionCarousel.answered", "Answered");
      summaryContainer.appendChild(answeredMessage);
    } else {
      const skippedMessage = dom.$(".chat-question-summary-skipped");
      skippedMessage.textContent = isDismissedByTerminal ? localize("chat.questionCarousel.deferredToTerminal", "Deferring to user's input in the terminal") : localize("chat.questionCarousel.skipped", "Skipped question");
      summaryContainer.appendChild(skippedMessage);
    }
    this.domNode.appendChild(summaryContainer);
  }
  /**
   * Renders a summary of answers when the carousel is already used.
   */
  renderSummary() {
    if (this._answers.size === 0) {
      if (this.carousel.answerPresentation === "conversation") {
        if (this.carousel.autoReply) {
          this.renderConversationSummary({
            answerFallback: localize("chat.questionCarousel.answeredAutomatically", "Answered automatically"),
            answerIcon: Codicon.copilotCompact
          });
        } else if (this.carousel.answeredExternally) {
          this.renderTerminalStateMessage();
        } else if (this.carousel.isUsed) {
          this.renderConversationSummary({
            answerFallback: localize("chat.questionCarousel.skippedConversation", "Skipped question"),
            answerIcon: Codicon.closeCompact,
            hideAnswerPrefix: true
          });
        }
        return;
      }
      if (this.carousel.isUsed) {
        this.renderTerminalStateMessage();
      }
      return;
    }
    if (this.carousel.answerPresentation === "conversation") {
      this.renderConversationSummary();
      return;
    }
    const summaryContainer = dom.$(".chat-question-carousel-summary");
    for (const question of this.carousel.questions) {
      const answer = this._answers.get(question.id);
      const summaryItem = dom.$(".chat-question-summary-item");
      const questionRow = dom.$("div.chat-question-summary-label");
      const questionText = getDisplayedQuestionText(question);
      let labelText = typeof questionText === "string" ? questionText : questionText.value;
      labelText = labelText.replace(/[:\s]+$/, "");
      questionRow.textContent = localize("chat.questionCarousel.summaryQuestion", "Q: {0}", labelText);
      summaryItem.appendChild(questionRow);
      if (answer !== void 0) {
        const formattedAnswer = this.formatAnswerForSummary(question, answer);
        const answerRow = dom.$("div.chat-question-summary-answer-title");
        answerRow.textContent = localize("chat.questionCarousel.summaryAnswer", "A: {0}", formattedAnswer);
        summaryItem.appendChild(answerRow);
      } else {
        const unanswered = dom.$("div.chat-question-summary-unanswered");
        unanswered.textContent = localize("chat.questionCarousel.notAnsweredYet", "Not answered yet");
        summaryItem.appendChild(unanswered);
      }
      summaryContainer.appendChild(summaryItem);
    }
    this.domNode.appendChild(summaryContainer);
  }
  renderConversationSummary(options) {
    const summaryStore = new DisposableStore();
    this._interactiveUIStore.value = summaryStore;
    const summaryContainer = dom.$(".chat-question-carousel-summary.chat-question-carousel-conversation-summary");
    this.domNode.setAttribute("aria-label", localize("chat.questionCarousel.answeredQuestions", "Answered chat questions"));
    for (const question of this.carousel.questions) {
      const answer = this._answers.get(question.id);
      const summaryItem = dom.$(".chat-question-summary-item");
      const questionValue = dom.$(".chat-question-summary-question");
      const questionText = getDisplayedQuestionText(question);
      const displayedQuestion = (typeof questionText === "string" ? questionText : questionText.value).replace(/[:\s]+$/, "");
      const questionPrefix = dom.$("span.chat-question-summary-prefix");
      questionPrefix.textContent = localize("chat.questionCarousel.questionPrefix", "Question:");
      const questionTextValue = dom.$("span.chat-question-summary-question-value");
      questionTextValue.textContent = displayedQuestion;
      summaryStore.add(this._hoverService.setupDelayedHover(questionTextValue, { content: displayedQuestion }));
      questionValue.append(questionPrefix, questionValue.ownerDocument.createTextNode(" "), questionTextValue);
      summaryItem.appendChild(questionValue);
      const decision = dom.$(".chat-question-summary-decision");
      const answerValue = answer === void 0 ? options?.answerFallback ?? localize("chat.questionCarousel.conversationNotAnswered", "Not answered yet") : this.formatAnswerForSummary(question, answer);
      const answerPrefix = options?.hideAnswerPrefix ? void 0 : localize("chat.questionCarousel.answerPrefix", "Answered:");
      const answerTitle = answerPrefix ? localize("chat.questionCarousel.conversationAnswer", "{0} {1}", answerPrefix, answerValue) : answerValue;
      const collapsibleContext = {
        ...this._context,
        content: this._context.content ?? [],
        contentIndex: this._context.contentIndex ?? 0
      };
      const answerPart = summaryStore.add(new ChatQuestionAnswerCollapsiblePart(
        answerTitle,
        answerPrefix,
        answerValue,
        options?.answerIcon ?? (this.carousel.autoReply ? Codicon.copilotCompact : Codicon.comment),
        collapsibleContext,
        question.options?.length ? () => this.renderConversationOptions(question, answer) : void 0,
        () => this._onDidChangeHeight.fire(),
        this._hoverService,
        this._configurationService
      ));
      answerPart.domNode.classList.add("chat-question-answer-collapsible");
      decision.appendChild(answerPart.domNode);
      summaryItem.appendChild(decision);
      summaryContainer.appendChild(summaryItem);
    }
    this.domNode.appendChild(summaryContainer);
  }
  renderConversationOptions(question, answer) {
    const selectedValues = /* @__PURE__ */ new Set();
    let freeformValue;
    if (typeof answer === "string") {
      selectedValues.add(answer);
    } else if (answer) {
      if (hasKey(answer, { selectedValues: true })) {
        for (const selectedValue of answer.selectedValues) {
          selectedValues.add(selectedValue);
        }
        freeformValue = answer.freeformValue;
      } else {
        const singleAnswer = answer;
        if (singleAnswer.selectedValue !== void 0) {
          selectedValues.add(singleAnswer.selectedValue);
        }
        freeformValue = singleAnswer.freeformValue;
      }
    }
    const container = dom.$(".chat-question-summary-option-details.chat-used-context-list");
    const optionsTitle = dom.$(".chat-question-summary-options-title");
    optionsTitle.textContent = localize("chat.questionCarousel.optionsTitle", "Options");
    container.appendChild(optionsTitle);
    const optionList = dom.$("ul.chat-question-summary-option-list");
    for (const option of question.options ?? []) {
      const selected = selectedValues.has(option.value);
      const optionItem = dom.$("li.chat-question-summary-option");
      optionItem.classList.toggle("selected", selected);
      optionItem.setAttribute("aria-label", selected ? localize("chat.questionCarousel.selectedOptionAriaLabel", "{0}, selected", option.label) : option.label);
      const optionLabel = dom.$("span.chat-question-summary-option-label");
      optionLabel.textContent = option.label;
      optionItem.appendChild(optionLabel);
      if (selected) {
        optionItem.appendChild(this.renderSelectedOptionState());
      }
      optionList.appendChild(optionItem);
    }
    if (freeformValue) {
      const customItem = dom.$("li.chat-question-summary-option.selected");
      customItem.setAttribute("aria-label", localize("chat.questionCarousel.selectedCustomAnswerAriaLabel", "Custom answer: {0}, selected", freeformValue));
      const customLabel = dom.$("span.chat-question-summary-option-label");
      customLabel.textContent = localize("chat.questionCarousel.customAnswer", "Custom answer: {0}", freeformValue);
      customItem.append(customLabel, this.renderSelectedOptionState());
      optionList.appendChild(customItem);
    }
    container.appendChild(optionList);
    return container;
  }
  renderSelectedOptionState() {
    const selectedState = dom.$("span.chat-question-summary-option-selected");
    const selectedIcon = dom.$("span");
    selectedIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.checkCompact));
    selectedIcon.setAttribute("aria-hidden", "true");
    selectedState.appendChild(selectedIcon);
    return selectedState;
  }
  /**
   * Formats an answer for display in the summary.
   */
  formatAnswerForSummary(question, answer) {
    if (this.carousel.autoReply && answer === AgentHostAutoReplyAnswer) {
      return localize("chat.questionCarousel.autoReplyAnswer", "The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.");
    }
    switch (question.type) {
      case "text":
        return String(answer);
      case "singleSelect": {
        if (typeof answer === "object") {
          const { selectedValue, freeformValue } = answer;
          const selectedLabel = selectedValue !== void 0 ? question.options?.find((opt) => opt.value === selectedValue)?.label : void 0;
          if (freeformValue) {
            return freeformValue;
          }
          return selectedLabel ?? String(selectedValue ?? "");
        }
        const label = question.options?.find((opt) => opt.value === answer)?.label;
        return label ?? String(answer);
      }
      case "multiSelect": {
        if (typeof answer === "object" && hasKey(answer, { selectedValues: true })) {
          const { selectedValues, freeformValue } = answer;
          const labels = selectedValues.map((v) => question.options?.find((opt) => opt.value === v)?.label ?? String(v));
          if (freeformValue) {
            labels.push(freeformValue);
          }
          return labels.join(localize("chat.questionCarousel.listSeparator", ", "));
        }
        return String(answer);
      }
      default:
        return String(answer);
    }
  }
  getQuestionText(questionText) {
    const md = typeof questionText === "string" ? new MarkdownString(questionText) : questionText;
    return renderAsPlaintext(md);
  }
  /**
   * Validates the current question's answer against its validation rules.
   * Returns true if valid, false if validation errors were shown.
   */
  validateCurrentQuestion() {
    const question = this.carousel.questions[this._currentIndex];
    if (!question) {
      return true;
    }
    const answer = this._answers.get(question.id);
    if (question.required && (answer === void 0 || answer === "")) {
      this.showValidationError(localize("chat.questionCarousel.required", "This field is required"));
      return false;
    }
    if (question.type === "text" && question.validation && typeof answer === "string" && answer !== "") {
      const error = this.getValidationError(answer, question.validation);
      if (error) {
        this.showValidationError(error);
        return false;
      }
    }
    this.clearValidationError();
    return true;
  }
  /**
   * Validates that all required questions have been answered.
   * Returns true if all required fields are satisfied.
   */
  validateRequiredFields() {
    for (let i = 0; i < this.carousel.questions.length; i++) {
      const question = this.carousel.questions[i];
      if (!question.required) {
        continue;
      }
      const answer = this._answers.get(question.id);
      if (answer === void 0 || answer === "") {
        this.saveCurrentAnswer();
        this._currentIndex = i;
        this.persistDraftState();
        this.renderCurrentQuestion(true);
        this.showValidationError(localize("chat.questionCarousel.required", "This field is required"));
        return false;
      }
    }
    return true;
  }
  /**
   * Returns a validation error message for the given value, or undefined if valid.
   */
  getValidationError(value, validation) {
    const failure = findQuestionValidationFailure(value, validation);
    switch (failure?.kind) {
      case void 0:
        return void 0;
      case "minLength":
        return localize("chat.questionCarousel.validation.minLength", "Minimum length is {0}", failure.limit);
      case "maxLength":
        return localize("chat.questionCarousel.validation.maxLength", "Maximum length is {0}", failure.limit);
      case "email":
        return localize("chat.questionCarousel.validation.email", "Please enter a valid email address");
      case "uri":
        return localize("chat.questionCarousel.validation.uri", "Please enter a valid URI");
      case "date":
        return localize("chat.questionCarousel.validation.date", "Please enter a valid date (YYYY-MM-DD)");
      case "dateTime":
        return localize("chat.questionCarousel.validation.dateTime", "Please enter a valid date-time");
      case "number":
        return localize("chat.questionCarousel.validation.number", "Please enter a valid number");
      case "integer":
        return localize("chat.questionCarousel.validation.integer", "Please enter a valid integer");
      case "minimum":
        return localize("chat.questionCarousel.validation.minimum", "Minimum value is {0}", failure.limit);
      case "maximum":
        return localize("chat.questionCarousel.validation.maximum", "Maximum value is {0}", failure.limit);
    }
  }
  showValidationError(message) {
    this._currentValidationError = message;
    if (this._validationMessageElement) {
      this._validationMessageElement.textContent = message;
      this._validationMessageElement.style.display = "";
    }
  }
  clearValidationError() {
    this._currentValidationError = void 0;
    if (this._validationMessageElement) {
      this._validationMessageElement.textContent = "";
      this._validationMessageElement.style.display = "none";
    }
  }
  hasSameContent(other, _followingContent, element) {
    if (!this._isSkipped && !this.carousel.isUsed && isResponseVM(element) && element.isComplete) {
      return false;
    }
    return other.kind === "questionCarousel" && other === this.carousel;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
  dispose() {
    if (!this._isSkipped && !this.carousel.isUsed) {
      this.saveCurrentAnswer();
    }
    super.dispose();
  }
};
ChatQuestionCarouselPart = __decorateClass([
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IAccessibilityService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, ITerminalChatService)
], ChatQuestionCarouselPart);
export {
  ChatQuestionCarouselPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRDaGVja2JveFN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElDaGF0UXVlc3Rpb24sIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlLCBJQ2hhdFF1ZXN0aW9uVmFsaWRhdGlvbiwgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXIsIElDaGF0TXVsdGlTZWxlY3RBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUsIGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dCwgZ2V0T3B0aW9uc1dpdGhEZWZhdWx0c0ZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRRdWVzdGlvbkNhcm91c2VsSGVscGVycy5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50LCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0TWFya2Rvd25SZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0UXVlc3Rpb25DYXJvdXNlbC5jc3MnO1xuXG5jb25zdCBQUkVWSU9VU19RVUVTVElPTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnByZXZpb3VzUXVlc3Rpb24nO1xuY29uc3QgTkVYVF9RVUVTVElPTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5leHRRdWVzdGlvbic7XG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UXVlc3Rpb25DYXJvdXNlbE9wdGlvbnMge1xuXHRvblN1Ym1pdDogKGFuc3dlcnM6IE1hcDxzdHJpbmcsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZT4gfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHNob3VsZEF1dG9Gb2N1cz86IGJvb2xlYW47XG5cdGZpdENvbnRlbnQ/OiBib29sZWFuO1xufVxuXG5jbGFzcyBDaGF0UXVlc3Rpb25BbnN3ZXJDb2xsYXBzaWJsZVBhcnQgZXh0ZW5kcyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRpdGxlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZhbHVlOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhbnN3ZXJJY29uOiBUaGVtZUljb24sXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZW50RmFjdG9yeTogKCgpID0+IEhUTUxFbGVtZW50KSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiAoKSA9PiB2b2lkLFxuXHRcdGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0aXRsZSwgY29udGV4dCwgdW5kZWZpbmVkLCBob3ZlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbml0KCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlbGVtZW50ID0gc3VwZXIuaW5pdCgpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1xdWVzdGlvbi1hbnN3ZXItZXhwYW5kYWJsZScsICEhdGhpcy5jb250ZW50RmFjdG9yeSk7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLl9jb2xsYXBzZUJ1dHRvbi5sYWJlbEVsZW1lbnQ7XG5cdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdGNvbnN0IGljb24gPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyLWljb24nKTtcblx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh0aGlzLmFuc3dlckljb24pKTtcblx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1hbnN3ZXItdmFsdWUnKTtcblx0XHRcdHZhbHVlLnRleHRDb250ZW50ID0gdGhpcy52YWx1ZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHZhbHVlLCB7IGNvbnRlbnQ6IHRoaXMudmFsdWUgfSkpO1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKGljb24pO1xuXHRcdFx0aWYgKHRoaXMucHJlZml4KSB7XG5cdFx0XHRcdGNvbnN0IHByZWZpeCA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1wcmVmaXgnKTtcblx0XHRcdFx0cHJlZml4LnRleHRDb250ZW50ID0gdGhpcy5wcmVmaXg7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmQocHJlZml4LCBsYWJlbEVsZW1lbnQub3duZXJEb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnICcpKTtcblx0XHRcdH1cblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZCh2YWx1ZSk7XG5cdFx0XHRpZiAoIXRoaXMuY29udGVudEZhY3RvcnkpIHtcblx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsICd0cnVlJyk7XG5cdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyk7XG5cdFx0XHRcdHRoaXMuX2hvdmVyQ2hldnJvbj8ucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluaXRDb250ZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZW50RmFjdG9yeT8uKCkgPz8gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktZW1wdHktY29udGVudCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGV4cGFuc2lvbkRpZENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlSGVpZ2h0KCk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChfb3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgX2N1cnJlbnRJbmRleCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Fuc3dlcnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlPigpO1xuXHRwcml2YXRlIF9pc0NvbGxhcHNlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX3F1ZXN0aW9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGVhZGVyQWN0aW9uc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Nsb3NlQnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9vdGVyUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RlcEluZGljYXRvcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N1Ym1pdEhpbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdWJtaXRCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29sbGFwc2VCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldkJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9uZXh0QnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NraXBBbGxCdXR0b246IEJ1dHRvbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9pc1NraXBwZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0SW5wdXRCb3hlczogTWFwPHN0cmluZywgSW5wdXRCb3g+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaW5nbGVTZWxlY3RJdGVtczogTWFwPHN0cmluZywgeyBpdGVtczogSFRNTEVsZW1lbnRbXTsgc2VsZWN0ZWRJbmRleDogbnVtYmVyOyBvcHRpb25JbmRpY2VzOiBudW1iZXJbXSB9PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbXVsdGlTZWxlY3RDaGVja2JveGVzOiBNYXA8c3RyaW5nLCB7IGNoZWNrYm94ZXM6IENoZWNrYm94W107IG9wdGlvbkluZGljZXM6IG51bWJlcltdIH0+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mcmVlZm9ybVRleHRhcmVhczogTWFwPHN0cmluZywgSFRNTFRleHRBcmVhRWxlbWVudD4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94ZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXN0aW9uUmVuZGVyU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfaW5wdXRTY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogRGlzcG9zYWJsZSBzdG9yZSBmb3IgaW50ZXJhY3RpdmUgVUkgY29tcG9uZW50cyAoaGVhZGVyLCBuYXYgYnV0dG9ucywgZXRjLilcblx0ICogdGhhdCBzaG91bGQgYmUgZGlzcG9zZWQgd2hlbiB0cmFuc2l0aW9uaW5nIHRvIHN1bW1hcnkgdmlldy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ludGVyYWN0aXZlVUlTdG9yZTogTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5DaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRWYWxpZGF0aW9uRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9jdXNUZXJtaW5hbEJ1dHRvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUNoYXRRdWVzdGlvbkNhcm91c2VsT3B0aW9ucyxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbnZlcnNhdGlvbicsIGNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9PT0gJ2NvbnZlcnNhdGlvbicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWZpdC1jb250ZW50JywgdGhpcy5fb3B0aW9ucy5maXRDb250ZW50ID09PSB0cnVlKTtcblx0XHR0aGlzLmRvbU5vZGUuaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLl9pbkNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5pbkNoYXRRdWVzdGlvbkNhcm91c2VsLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIYXNUZXJtaW5hbENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIYXNUZXJtaW5hbC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHRoaXMuZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuX2luQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWxDb250ZXh0S2V5LnNldCghIXRoaXMuY2Fyb3VzZWwudGVybWluYWxJZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5faW5DaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWxDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4geyB0aGlzLl9pbkNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleS5yZXNldCgpOyB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsQ29udGV4dEtleS5yZXNldCgpOyB9IH0pO1xuXG5cdFx0Ly8gU2V0IHVwIGFjY2Vzc2liaWxpdHkgYXR0cmlidXRlcyBmb3IgdGhlIGNhcm91c2VsIGNvbnRhaW5lclxuXHRcdHRoaXMuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdyZWdpb24nKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLXJvbGVkZXNjcmlwdGlvbicsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwucm9sZURlc2NyaXB0aW9uJywgJ2NoYXQgcXVlc3Rpb24nKSk7XG5cdFx0dGhpcy5fdXBkYXRlQXJpYUxhYmVsKCk7XG5cblx0XHQvLyBSZXN0b3JlIGRyYWZ0IHN0YXRlIGZyb20gdHJhbnNpZW50IHJ1bnRpbWUgZmllbGRzIHdoZW4gYXZhaWxhYmxlLlxuXHRcdGlmIChjYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkge1xuXHRcdFx0aWYgKHR5cGVvZiBjYXJvdXNlbC5kcmFmdEN1cnJlbnRJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXgsIGNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggLSAxKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0eXBlb2YgY2Fyb3VzZWwuZHJhZnRDb2xsYXBzZWQgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9IGNhcm91c2VsLmRyYWZ0Q29sbGFwc2VkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2Fyb3VzZWwuZHJhZnRBbnN3ZXJzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGNhcm91c2VsLmRyYWZ0QW5zd2VycykpIHtcblx0XHRcdFx0XHR0aGlzLl9hbnN3ZXJzLnNldChrZXksIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgc3VibWl0dGVkIGFuc3dlcnMgZm9yIHN1bW1hcnkgcmVuZGVyaW5nLlxuXHRcdGlmIChjYXJvdXNlbC5kYXRhKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjYXJvdXNlbC5kYXRhKSkge1xuXHRcdFx0XHR0aGlzLl9hbnN3ZXJzLnNldChrZXksIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBjYXJvdXNlbCB3YXMgYWxyZWFkeSB1c2VkIE9SIHRoZSByZXNwb25zZSBpcyBjb21wbGV0ZSwgc2hvdyBzdW1tYXJ5IG9mIGFuc3dlcnNcblx0XHQvLyBXaGVuIHJlc3BvbnNlIGlzIGNvbXBsZXRlLCB0aGUgY2Fyb3VzZWwgY2FuIG5vIGxvbmdlciBiZSBpbnRlcmFjdGVkIHdpdGhcblx0XHRjb25zdCByZXNwb25zZUlzQ29tcGxldGUgPSBpc1Jlc3BvbnNlVk0odGhpcy5fY29udGV4dC5lbGVtZW50KSAmJiB0aGlzLl9jb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZTtcblx0XHRpZiAoY2Fyb3VzZWwuaXNVc2VkIHx8IHJlc3BvbnNlSXNDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy5faXNTa2lwcGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXVzZWQnKTtcblx0XHRcdHRoaXMucmVuZGVyU3VtbWFyeSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBkaXNwb3NhYmxlIHN0b3JlIGZvciBpbnRlcmFjdGl2ZSBVSSBjb21wb25lbnRzXG5cdFx0Y29uc3QgaW50ZXJhY3RpdmVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9pbnRlcmFjdGl2ZVVJU3RvcmUudmFsdWUgPSBpbnRlcmFjdGl2ZVN0b3JlO1xuXG5cdFx0Ly8gUXVlc3Rpb24gY29udGFpbmVyXG5cdFx0dGhpcy5fcXVlc3Rpb25Db250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtY29udGVudCcpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQodGhpcy5fcXVlc3Rpb25Db250YWluZXIpO1xuXHRcdHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24taGVhZGVyLWFjdGlvbnMnKTtcblxuXHRcdGNvbnN0IGNvbGxhcHNlVG9nZ2xlVGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmNvbGxhcHNlVGl0bGUnLCAnQ29sbGFwc2UgUXVlc3Rpb25zJyk7XG5cdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSBpbnRlcmFjdGl2ZVN0b3JlLmFkZChuZXcgQnV0dG9uKHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdGNvbGxhcHNlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1jb2xsYXBzZS10b2dnbGUnKTtcblx0XHRjb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGNvbGxhcHNlVG9nZ2xlVGl0bGUpO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uID0gY29sbGFwc2VCdXR0b247XG5cblx0XHQvLyBDbG9zZS9za2lwIGJ1dHRvbiAoWCkgLSBwbGFjZWQgaW4gaGVhZGVyIHJvdywgb25seSBzaG93biB3aGVuIGFsbG93U2tpcCBpcyB0cnVlXG5cdFx0aWYgKGNhcm91c2VsLmFsbG93U2tpcCkge1xuXHRcdFx0dGhpcy5fY2xvc2VCdXR0b25Db250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tY2xvc2UtY29udGFpbmVyJyk7XG5cdFx0XHRjb25zdCBza2lwQWxsVGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNraXBBbGxUaXRsZScsICdTa2lwIGFsbCBxdWVzdGlvbnMnKTtcblx0XHRcdGNvbnN0IHNraXBBbGxCdXR0b24gPSBpbnRlcmFjdGl2ZVN0b3JlLmFkZChuZXcgQnV0dG9uKHRoaXMuX2Nsb3NlQnV0dG9uQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRcdHNraXBBbGxCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uY2xvc2VTbWFsbC5pZH0pYDtcblx0XHRcdHNraXBBbGxCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLWNsb3NlJyk7XG5cdFx0XHRza2lwQWxsQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc2tpcEFsbFRpdGxlKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihza2lwQWxsQnV0dG9uLmVsZW1lbnQsIHsgY29udGVudDogc2tpcEFsbFRpdGxlIH0pKTtcblx0XHRcdHRoaXMuX3NraXBBbGxCdXR0b24gPSBza2lwQWxsQnV0dG9uO1xuXHRcdH1cblxuXHRcdC8vIEZvY3VzIFRlcm1pbmFsIGJ1dHRvbiAtIHNob3duIHdoZW4gdGhlIGNhcm91c2VsIHdhcyB0cmlnZ2VyZWQgYnkgdGVybWluYWwgaW5wdXRcblx0XHRpZiAoY2Fyb3VzZWwudGVybWluYWxJZCkge1xuXHRcdFx0dGhpcy5fZm9jdXNUZXJtaW5hbEJ1dHRvbkNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mb2N1cy10ZXJtaW5hbC1jb250YWluZXInKTtcblx0XHRcdGNvbnN0IGZvY3VzVGVybWluYWxUaXRsZSA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZm9jdXNUZXJtaW5hbFRpdGxlJywgJ0ZvY3VzIFRlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvY3VzUXVlc3Rpb25DYXJvdXNlbFRlcm1pbmFsJyk/LmdldExhYmVsKCk7XG5cdFx0XHRjb25zdCBmb2N1c1Rlcm1pbmFsQXJpYUxhYmVsID0ga2JMYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZm9jdXNUZXJtaW5hbEFyaWFMYWJlbCcsICdGb2N1cyBUZXJtaW5hbCAoezB9KScsIGtiTGFiZWwpXG5cdFx0XHRcdDogZm9jdXNUZXJtaW5hbFRpdGxlO1xuXHRcdFx0Y29uc3QgZm9jdXNUZXJtaW5hbEJ1dHRvbiA9IGludGVyYWN0aXZlU3RvcmUuYWRkKG5ldyBCdXR0b24odGhpcy5fZm9jdXNUZXJtaW5hbEJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0XHRmb2N1c1Rlcm1pbmFsQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLnRlcm1pbmFsLmlkfSlgO1xuXHRcdFx0Zm9jdXNUZXJtaW5hbEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tZm9jdXMtdGVybWluYWwnKTtcblx0XHRcdGZvY3VzVGVybWluYWxCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBmb2N1c1Rlcm1pbmFsQXJpYUxhYmVsKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihmb2N1c1Rlcm1pbmFsQnV0dG9uLmVsZW1lbnQsIHsgY29udGVudDogZm9jdXNUZXJtaW5hbFRpdGxlIH0pKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKGZvY3VzVGVybWluYWxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLl9mb2N1c1Rlcm1pbmFsKCkpKTtcblxuXHRcdFx0Ly8gRGlzbWlzcyB0aGUgY2Fyb3VzZWwgd2hlbiB0aGUgdXNlciB0eXBlcyBkaXJlY3RseSBpbiB0aGUgdGVybWluYWwsXG5cdFx0XHQvLyBzaW5jZSB0aGV5IGFyZSBhbnN3ZXJpbmcgdGhlIHByb21wdCB0aGVtc2VsdmVzLlxuXHRcdFx0Y29uc3QgdGVybWluYWxJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0VGVybWluYWxJbnN0YW5jZUJ5RXhlY3V0aW9uSWQoY2Fyb3VzZWwudGVybWluYWxJZCk7XG5cdFx0XHRpZiAodGVybWluYWxJbnN0YW5jZSkge1xuXHRcdFx0XHRpbnRlcmFjdGl2ZVN0b3JlLmFkZCh0ZXJtaW5hbEluc3RhbmNlLm9uRGlkSW5wdXREYXRhKCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2lzU2tpcHBlZCkge1xuXHRcdFx0XHRcdFx0aWYgKGNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSB7XG5cdFx0XHRcdFx0XHRcdGNhcm91c2VsLmRpc21pc3NlZEJ5VGVybWluYWxJbnB1dCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmlnbm9yZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIGV2ZW50IGxpc3RlbmVyc1xuXHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKGNvbGxhcHNlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy50b2dnbGVDb2xsYXBzZWQoKSkpO1xuXG5cdFx0aWYgKHRoaXMuX3NraXBBbGxCdXR0b24pIHtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHRoaXMuX3NraXBBbGxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmlnbm9yZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIga2V5Ym9hcmQgbmF2aWdhdGlvblxuXHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlICYmIHRoaXMuY2Fyb3VzZWwuYWxsb3dTa2lwKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5pZ25vcmUoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAoZXZlbnQubWV0YUtleSB8fCBldmVudC5jdHJsS2V5KSkge1xuXHRcdFx0XHQvLyBDbWQvQ3RybCtFbnRlciBzdWJtaXRzIGltbWVkaWF0ZWx5IGZyb20gYW55d2hlcmVcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLnN1Ym1pdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFldmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0Y29uc3QgaXNUZXh0SW5wdXQgPSB0YXJnZXQudGFnTmFtZSA9PT0gJ0lOUFVUJyAmJiAodGFyZ2V0IGFzIEhUTUxJbnB1dEVsZW1lbnQpLnR5cGUgPT09ICd0ZXh0Jztcblx0XHRcdFx0Y29uc3QgaXNGcmVlZm9ybVRleHRhcmVhID0gdGFyZ2V0LnRhZ05hbWUgPT09ICdURVhUQVJFQScgJiYgdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0XHRpZiAoaXNUZXh0SW5wdXQgfHwgaXNGcmVlZm9ybVRleHRhcmVhKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVOZXh0T3JTdWJtaXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICgoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSAmJiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5CYWNrc3BhY2UgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5EZWxldGUpKSB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgY2Fyb3VzZWxcblx0XHR0aGlzLnJlbmRlckN1cnJlbnRRdWVzdGlvbigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNhdmVzIHRoZSBjdXJyZW50IHF1ZXN0aW9uJ3MgYW5zd2VyIHRvIHRoZSBhbnN3ZXJzIG1hcC5cblx0ICovXG5cdHByaXZhdGUgc2F2ZUN1cnJlbnRBbnN3ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRjb25zdCBhbnN3ZXIgPSB0aGlzLmdldEN1cnJlbnRBbnN3ZXIoKTtcblx0XHRpZiAoYW5zd2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2Fuc3dlcnMuc2V0KGN1cnJlbnRRdWVzdGlvbi5pZCwgYW5zd2VyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYW5zd2Vycy5kZWxldGUoY3VycmVudFF1ZXN0aW9uLmlkKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBvbiBjaGFuZ2UgdG8gdXBkYXRlIHRoZSBOZXh0IGJ1dHRvbiBzdGF0ZVxuXHRcdGlmIChjdXJyZW50UXVlc3Rpb24/LnZhbGlkYXRpb24gJiYgdHlwZW9mIGFuc3dlciA9PT0gJ3N0cmluZycgJiYgYW5zd2VyICE9PSAnJykge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSB0aGlzLmdldFZhbGlkYXRpb25FcnJvcihhbnN3ZXIsIGN1cnJlbnRRdWVzdGlvbi52YWxpZGF0aW9uKTtcblx0XHRcdGlmIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLnNob3dWYWxpZGF0aW9uRXJyb3IoZXJyb3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbGVhclZhbGlkYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsZWFyVmFsaWRhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVGb290ZXJTdGF0ZSgpO1xuXHRcdHRoaXMucGVyc2lzdERyYWZ0U3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcGVyc2lzdERyYWZ0U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2Fyb3VzZWwuaXNVc2VkIHx8ICEodGhpcy5jYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNhcm91c2VsLmRyYWZ0QW5zd2VycyA9IE9iamVjdC5mcm9tRW50cmllcyh0aGlzLl9hbnN3ZXJzLmVudHJpZXMoKSk7XG5cdFx0dGhpcy5jYXJvdXNlbC5kcmFmdEN1cnJlbnRJbmRleCA9IHRoaXMuX2N1cnJlbnRJbmRleDtcblx0XHR0aGlzLmNhcm91c2VsLmRyYWZ0Q29sbGFwc2VkID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUNvbGxhcHNlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0NvbGxhcHNlZCA9ICF0aGlzLl9pc0NvbGxhcHNlZDtcblx0XHR0aGlzLnBlcnNpc3REcmFmdFN0YXRlKCk7XG5cdFx0dGhpcy51cGRhdGVDb2xsYXBzZWRQcmVzZW50YXRpb24oKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c1Rlcm1pbmFsKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRlcm1pbmFsSWQgPSB0aGlzLmNhcm91c2VsLnRlcm1pbmFsSWQ7XG5cdFx0aWYgKCF0ZXJtaW5hbElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZm9jdXNUZXJtaW5hbEJ5RXhlY3V0aW9uSWQnLCB0ZXJtaW5hbElkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29sbGFwc2VkUHJlc2VudGF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLWNvbGxhcHNlZCcsIHRoaXMuX2lzQ29sbGFwc2VkKTtcblxuXHRcdGlmICh0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5faXNDb2xsYXBzZWQ7XG5cdFx0XHRjb25zdCBidXR0b25UaXRsZSA9IGNvbGxhcHNlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZXhwYW5kVGl0bGUnLCAnRXhwYW5kIFF1ZXN0aW9ucycpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5jb2xsYXBzZVRpdGxlJywgJ0NvbGxhcHNlIFF1ZXN0aW9ucycpO1xuXHRcdFx0Y29uc3QgY29udGVudElkID0gdGhpcy5kb21Ob2RlLmlkO1xuXHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWwgPSBjb2xsYXBzZWQgPyBgJCgke0NvZGljb24uY2hldnJvblVwLmlkfSlgIDogYCQoJHtDb2RpY29uLmNoZXZyb25Eb3duLmlkfSlgO1xuXHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBidXR0b25UaXRsZSk7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghY29sbGFwc2VkKSk7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jb250cm9scycsIGNvbnRlbnRJZCk7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5zZXRUaXRsZShidXR0b25UaXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE5hdmlnYXRlcyB0aGUgY2Fyb3VzZWwgYnkgdGhlIGdpdmVuIGRlbHRhLlxuXHQgKiBAcGFyYW0gZGVsdGEgTmVnYXRpdmUgZm9yIHByZXZpb3VzLCBwb3NpdGl2ZSBmb3IgbmV4dFxuXHQgKi9cblx0cHJpdmF0ZSBuYXZpZ2F0ZShkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3SW5kZXggPSB0aGlzLl9jdXJyZW50SW5kZXggKyBkZWx0YTtcblx0XHRpZiAobmV3SW5kZXggPj0gMCAmJiBuZXdJbmRleCA8IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdFx0dGhpcy5fY3VycmVudEluZGV4ID0gbmV3SW5kZXg7XG5cdFx0XHR0aGlzLnBlcnNpc3REcmFmdFN0YXRlKCk7XG5cdFx0XHR0aGlzLnJlbmRlckN1cnJlbnRRdWVzdGlvbih0cnVlKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSBuZXh0L3N1Ym1pdCBiZWhhdmlvciBmb3Iga2V5Ym9hcmQgYW5kIG9wdGlvbiBzZWxlY3Rpb24gZmxvd3MuXG5cdCAqIEVpdGhlciBhZHZhbmNlcyB0byB0aGUgbmV4dCBxdWVzdGlvbiBvciBzdWJtaXRzIHdoZW4gb24gdGhlIGxhc3QgcXVlc3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGhhbmRsZU5leHRPclN1Ym1pdCgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cblx0XHRpZiAoIXRoaXMudmFsaWRhdGVDdXJyZW50UXVlc3Rpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPCB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggLSAxKSB7XG5cdFx0XHQvLyBNb3ZlIHRvIG5leHQgcXVlc3Rpb25cblx0XHRcdHRoaXMuX2N1cnJlbnRJbmRleCsrO1xuXHRcdFx0dGhpcy5wZXJzaXN0RHJhZnRTdGF0ZSgpO1xuXHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50UXVlc3Rpb24odHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFN1Ym1pdFxuXHRcdFx0aWYgKCF0aGlzLnZhbGlkYXRlUmVxdWlyZWRGaWVsZHMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vcHRpb25zLm9uU3VibWl0KHRoaXMuX2Fuc3dlcnMpO1xuXHRcdFx0dGhpcy5oaWRlQW5kU2hvd1N1bW1hcnkoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBleHBsaWNpdCBzdWJtaXQgYWN0aW9uIGZyb20gdGhlIGRlZGljYXRlZCBzdWJtaXQgYnV0dG9uLlxuXHQgKi9cblx0cHJpdmF0ZSBzdWJtaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdGlmICghdGhpcy52YWxpZGF0ZUN1cnJlbnRRdWVzdGlvbigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy52YWxpZGF0ZVJlcXVpcmVkRmllbGRzKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdCh0aGlzLl9hbnN3ZXJzKTtcblx0XHR0aGlzLmhpZGVBbmRTaG93U3VtbWFyeSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGNvbnRhaW5lciBlbGVtZW50IGFuZCBhbm5vdW5jZXMgdGhlIHF1ZXN0aW9uIGZvciBzY3JlZW4gcmVhZGVyIHVzZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZm9jdXNDb250YWluZXJBbmRBbm5vdW5jZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuZm9jdXMoKTtcblx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zW3RoaXMuX2N1cnJlbnRJbmRleF07XG5cdFx0aWYgKHF1ZXN0aW9uKSB7XG5cdFx0XHRjb25zdCBxdWVzdGlvblRleHQgPSBnZXREaXNwbGF5ZWRRdWVzdGlvblRleHQocXVlc3Rpb24pO1xuXHRcdFx0Y29uc3QgbWVzc2FnZUNvbnRlbnQgPSB0aGlzLmdldFF1ZXN0aW9uVGV4dChxdWVzdGlvblRleHQpO1xuXHRcdFx0Y29uc3QgcXVlc3Rpb25Db3VudCA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aDtcblx0XHRcdGNvbnN0IGFsZXJ0TWVzc2FnZSA9IHF1ZXN0aW9uQ291bnQgPT09IDFcblx0XHRcdFx0PyBtZXNzYWdlQ29udGVudFxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwucXVlc3Rpb25BbGVydE11bHRpJywgJ1F1ZXN0aW9uIHswfSBvZiB7MX06IHsyfScsIHRoaXMuX2N1cnJlbnRJbmRleCArIDEsIHF1ZXN0aW9uQ291bnQsIG1lc3NhZ2VDb250ZW50KTtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGFsZXJ0TWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGVzIHRoZSBjYXJvdXNlbCBVSSBhbmQgc2hvd3MgYSBzdW1tYXJ5IG9mIGFuc3dlcnMuXG5cdCAqL1xuXHRwcml2YXRlIGhpZGVBbmRTaG93U3VtbWFyeSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzU2tpcHBlZCA9IHRydWU7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtdXNlZCcpO1xuXG5cdFx0Ly8gRGlzcG9zZSBpbnRlcmFjdGl2ZSBVSSBhbmQgY2xlYXIgRE9NXG5cdFx0dGhpcy5jbGVhckludGVyYWN0aXZlUmVzb3VyY2VzKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmRvbU5vZGUpO1xuXG5cdFx0Ly8gUmVuZGVyIHN1bW1hcnlcblx0XHR0aGlzLnJlbmRlclN1bW1hcnkoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIGFuZCBkaXNwb3NlcyBhbGwgaW50ZXJhY3RpdmUgVUkgcmVzb3VyY2VzIChoZWFkZXIsIG5hdiBidXR0b25zLCBpbnB1dCBib3hlcywgZXRjLilcblx0ICogYW5kIHJlc2V0cyByZWZlcmVuY2VzIHRvIGRpc3Bvc2VkIGVsZW1lbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBjbGVhckludGVyYWN0aXZlUmVzb3VyY2VzKCk6IHZvaWQge1xuXHRcdC8vIERpc3Bvc2UgaW50ZXJhY3RpdmUgVUkgZGlzcG9zYWJsZXMgKGhlYWRlciwgbmF2IGJ1dHRvbnMsIGV0Yy4pXG5cdFx0dGhpcy5faW50ZXJhY3RpdmVVSVN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fcXVlc3Rpb25SZW5kZXJTdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuX2lucHV0Qm94ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl90ZXh0SW5wdXRCb3hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3NpbmdsZVNlbGVjdEl0ZW1zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbXVsdGlTZWxlY3RDaGVja2JveGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZnJlZWZvcm1UZXh0YXJlYXMuY2xlYXIoKTtcblxuXHRcdC8vIENsZWFyIHJlZmVyZW5jZXMgdG8gZGlzcG9zZWQgZWxlbWVudHNcblx0XHR0aGlzLl9wcmV2QnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX25leHRCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3VibWl0QnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NraXBBbGxCdXR0b24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcXVlc3Rpb25Db250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faGVhZGVyQWN0aW9uc0NvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jbG9zZUJ1dHRvbkNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9mb2N1c1Rlcm1pbmFsQnV0dG9uQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2Zvb3RlclJvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdGVwSW5kaWNhdG9yID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N1Ym1pdEhpbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faW5wdXRTY3JvbGxhYmxlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRJbnB1dFNjcm9sbGFibGUoaW5wdXRTY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcXVlc3Rpb25Db250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxhYmxlTm9kZSA9IGlucHV0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZUNvbnRlbnQgPSBzY3JvbGxhYmxlTm9kZS5maXJzdEVsZW1lbnRDaGlsZDtcblx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KHNjcm9sbGFibGVDb250ZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHN0YWxlIHNpemUgY29uc3RyYWludHMgZmlyc3Qgc28gdGhpcyBzdGVwIGNhbiBzaHJpbmsgYWZ0ZXJcblx0XHQvLyBuYXZpZ2F0aW5nIGZyb20gYSB0YWxsZXIgcXVlc3Rpb24uXG5cdFx0aWYgKHNjcm9sbGFibGVOb2RlLnN0eWxlLmhlaWdodCAhPT0gJycgfHwgc2Nyb2xsYWJsZU5vZGUuc3R5bGUubWF4SGVpZ2h0ICE9PSAnJykge1xuXHRcdFx0c2Nyb2xsYWJsZU5vZGUuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHRzY3JvbGxhYmxlTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSAnJztcblx0XHR9XG5cdFx0aWYgKHNjcm9sbGFibGVDb250ZW50LnN0eWxlLmhlaWdodCAhPT0gJycgfHwgc2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUubWF4SGVpZ2h0ICE9PSAnJykge1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gJyc7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5zdHlsZS5tYXhIZWlnaHQgPSAnJztcblx0XHR9XG5cblx0XHQvLyBVc2UgdGhlIGZsZXgtcmVzb2x2ZWQgY29udGFpbmVyIGhlaWdodCAoY29uc3RyYWluZWQgYnkgQ1NTIG1heC1oZWlnaHQpXG5cdFx0Ly8gaW5zdGVhZCBvZiB3aW5kb3cuaW5uZXJIZWlnaHQsIHNvIHRoZSBzY3JvbGwgdmlld3BvcnQgdHJhY2tzIGFjdHVhbCBjaGF0IHNwYWNlLlxuXHRcdGNvbnN0IG1heENvbnRhaW5lckhlaWdodCA9IHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmNsaWVudEhlaWdodDtcblxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBkb20uZ2V0V2luZG93KHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyKS5nZXRDb21wdXRlZFN0eWxlKHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyKTtcblx0XHRjb25zdCBjb250ZW50VmVydGljYWxQYWRkaW5nID1cblx0XHRcdE51bWJlci5wYXJzZUZsb2F0KGNvbXB1dGVkU3R5bGUucGFkZGluZ1RvcCB8fCAnMCcpICtcblx0XHRcdE51bWJlci5wYXJzZUZsb2F0KGNvbXB1dGVkU3R5bGUucGFkZGluZ0JvdHRvbSB8fCAnMCcpO1xuXG5cdFx0Y29uc3Qgbm9uU2Nyb2xsYWJsZUNvbnRlbnRIZWlnaHQgPSBBcnJheS5mcm9tKHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmNoaWxkcmVuKVxuXHRcdFx0LmZpbHRlcihjaGlsZCA9PiBjaGlsZCAhPT0gc2Nyb2xsYWJsZU5vZGUpXG5cdFx0XHQucmVkdWNlKChzdW0sIGNoaWxkKSA9PiBzdW0gKyAoY2hpbGQgYXMgSFRNTEVsZW1lbnQpLm9mZnNldEhlaWdodCwgMCk7XG5cblx0XHRjb25zdCBhdmFpbGFibGVTY3JvbGxhYmxlSGVpZ2h0ID0gTWF0aC5mbG9vcihtYXhDb250YWluZXJIZWlnaHQgLSBjb250ZW50VmVydGljYWxQYWRkaW5nIC0gbm9uU2Nyb2xsYWJsZUNvbnRlbnRIZWlnaHQpO1xuXG5cdFx0Y29uc3QgY29udGVudFNjcm9sbGFibGVIZWlnaHQgPSBzY3JvbGxhYmxlQ29udGVudC5zY3JvbGxIZWlnaHQ7XG5cdFx0Y29uc3QgY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0ID0gdGhpcy5fb3B0aW9ucy5maXRDb250ZW50XG5cdFx0XHQ/IGNvbnRlbnRTY3JvbGxhYmxlSGVpZ2h0XG5cdFx0XHQ6IE1hdGgubWF4KDAsIE1hdGgubWluKGF2YWlsYWJsZVNjcm9sbGFibGVIZWlnaHQsIGNvbnRlbnRTY3JvbGxhYmxlSGVpZ2h0KSk7XG5cdFx0Y29uc3QgY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHggPSBgJHtjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHR9cHhgO1xuXG5cdFx0Ly8gQ29uc3RyYWluIHdyYXBwZXIgKyBjb250ZW50IHNvIG5vIHN0YWxlIGZsZXggc2l6aW5nIHN1cnZpdmVzIGJldHdlZW4gc3RlcHMuXG5cdFx0aWYgKHNjcm9sbGFibGVOb2RlLnN0eWxlLmhlaWdodCAhPT0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHggfHwgc2Nyb2xsYWJsZU5vZGUuc3R5bGUubWF4SGVpZ2h0ICE9PSBjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHRQeCkge1xuXHRcdFx0c2Nyb2xsYWJsZU5vZGUuc3R5bGUuaGVpZ2h0ID0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHg7XG5cdFx0XHRzY3JvbGxhYmxlTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSBjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHRQeDtcblx0XHR9XG5cblx0XHQvLyBDb25zdHJhaW4gdGhlIGNvbnRlbnQgZWxlbWVudCAoRG9tU2Nyb2xsYWJsZUVsZW1lbnQuX2VsZW1lbnQpIHNvIHRoYXRcblx0XHQvLyBzY2FuRG9tTm9kZSBzZWVzIGNsaWVudEhlaWdodCA8IHNjcm9sbEhlaWdodCBhbmQgZW5hYmxlcyBzY3JvbGxpbmcuXG5cdFx0aWYgKHNjcm9sbGFibGVDb250ZW50LnN0eWxlLmhlaWdodCAhPT0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHggfHwgc2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUubWF4SGVpZ2h0ICE9PSBjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHRQeCkge1xuXHRcdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc3R5bGUuaGVpZ2h0ID0gY29uc3RyYWluZWRTY3JvbGxhYmxlSGVpZ2h0UHg7XG5cdFx0XHRzY3JvbGxhYmxlQ29udGVudC5zdHlsZS5tYXhIZWlnaHQgPSBjb25zdHJhaW5lZFNjcm9sbGFibGVIZWlnaHRQeDtcblx0XHR9XG5cdFx0aW5wdXRTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2tpcHMgdGhlIGNhcm91c2VsIHdpdGggZGVmYXVsdCB2YWx1ZXMgLSBjYWxsZWQgd2hlbiB1c2VyIHdhbnRzIHRvIHByb2NlZWQgcXVpY2tseS5cblx0ICogUmV0dXJucyBkZWZhdWx0cyBmb3IgYWxsIHF1ZXN0aW9ucy5cblx0ICpcblx0ICogYGNhcm91c2VsLmlzVXNlZGAgY292ZXJzIHJlc29sdXRpb24gdGhhdCBkaWQgbm90IGNvbWUgZnJvbSB0aGlzIHBhcnQ6IGFcblx0ICogdm9pY2UgYW5zd2VyIGRpc21pc3NlcyB0aGUgY2Fyb3VzZWwgZGlyZWN0bHksIGFuZCBhIGxhdGVyIGF1dG8tc2tpcCBvblxuXHQgKiByZXF1ZXN0IHN1Ym1pdCB3b3VsZCBvdGhlcndpc2Ugb3ZlcndyaXRlIHRoZSBhbnN3ZXIgdGhhdCBhY3R1YWxseSBsYW5kZWRcblx0ICogd2l0aCBkZWZhdWx0cy5cblx0ICovXG5cdHB1YmxpYyBza2lwKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9pc1NraXBwZWQgfHwgdGhpcy5jYXJvdXNlbC5pc1VzZWQgfHwgIXRoaXMuY2Fyb3VzZWwuYWxsb3dTa2lwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdHMgPSB0aGlzLmdldERlZmF1bHRBbnN3ZXJzKCk7XG5cdFx0dGhpcy5fb3B0aW9ucy5vblN1Ym1pdChkZWZhdWx0cyk7XG5cblx0XHQvLyBSZXNldCBhbnN3ZXJzIHRvIG1hdGNoIHN1Ym1pdHRlZCBkZWZhdWx0cyBmb3Igc3VtbWFyeSBkaXNwbGF5XG5cdFx0dGhpcy5fYW5zd2Vycy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIGRlZmF1bHRzKSB7XG5cdFx0XHR0aGlzLl9hbnN3ZXJzLnNldChrZXksIHZhbHVlKTtcblx0XHR9XG5cdFx0dGhpcy5oaWRlQW5kU2hvd1N1bW1hcnkoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZ25vcmVzIHRoZSBjYXJvdXNlbCBjb21wbGV0ZWx5IC0gY2FsbGVkIHdoZW4gdXNlciB3YW50cyB0byBkaXNtaXNzIHdpdGhvdXQgZGF0YS5cblx0ICogUmV0dXJucyB1bmRlZmluZWQgdG8gc2lnbmFsIHRoZSBjYXJvdXNlbCB3YXMgaWdub3JlZC5cblx0ICpcblx0ICogR3VhcmRlZCBvbiBgY2Fyb3VzZWwuaXNVc2VkYCBmb3IgdGhlIHNhbWUgcmVhc29uIGFzIHtAbGluayBza2lwfS5cblx0ICovXG5cdHB1YmxpYyBpZ25vcmUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2lzU2tpcHBlZCB8fCB0aGlzLmNhcm91c2VsLmlzVXNlZCB8fCAhdGhpcy5jYXJvdXNlbC5hbGxvd1NraXApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5faXNTa2lwcGVkID0gdHJ1ZTtcblxuXHRcdHRoaXMuX29wdGlvbnMub25TdWJtaXQodW5kZWZpbmVkKTtcblxuXHRcdC8vIERpc3Bvc2UgaW50ZXJhY3RpdmUgVUkgYW5kIGNsZWFyIERPTVxuXHRcdHRoaXMuY2xlYXJJbnRlcmFjdGl2ZVJlc291cmNlcygpO1xuXG5cdFx0Ly8gSGlkZSBVSSBhbmQgc2hvdyB0ZXJtaW5hbC1zdGF0ZSAoU2tpcHBlZC9BbnN3ZXJlZCkgbWVzc2FnZVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXVzZWQnKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZG9tTm9kZSk7XG5cdFx0dGhpcy5yZW5kZXJUZXJtaW5hbFN0YXRlTWVzc2FnZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2xsZWN0cyBkZWZhdWx0IHZhbHVlcyBmb3IgYWxsIHF1ZXN0aW9ucyBpbiB0aGUgY2Fyb3VzZWwuXG5cdCAqL1xuXHRwcml2YXRlIGdldERlZmF1bHRBbnN3ZXJzKCk6IE1hcDxzdHJpbmcsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZT4ge1xuXHRcdGNvbnN0IGFuc3dlcnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlPigpO1xuXHRcdGZvciAoY29uc3QgcXVlc3Rpb24gb2YgdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnMpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBbnN3ZXIgPSB0aGlzLmdldERlZmF1bHRBbnN3ZXJGb3JRdWVzdGlvbihxdWVzdGlvbik7XG5cdFx0XHRpZiAoZGVmYXVsdEFuc3dlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGFuc3dlcnMuc2V0KHF1ZXN0aW9uLmlkLCBkZWZhdWx0QW5zd2VyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGFuc3dlcnM7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgZGVmYXVsdCBhbnN3ZXIgZm9yIGEgc3BlY2lmaWMgcXVlc3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGdldERlZmF1bHRBbnN3ZXJGb3JRdWVzdGlvbihxdWVzdGlvbjogSUNoYXRRdWVzdGlvbik6IElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChxdWVzdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjYXNlICdzaW5nbGVTZWxlY3QnOiB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRPcHRpb25JZCA9IHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0T3B0aW9uID0gZGVmYXVsdE9wdGlvbklkICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHF1ZXN0aW9uLm9wdGlvbnM/LmZpbmQob3B0ID0+IG9wdC5pZCA9PT0gZGVmYXVsdE9wdGlvbklkKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZFZhbHVlID0gZGVmYXVsdE9wdGlvbj8udmFsdWU7XG5cblx0XHRcdFx0cmV0dXJuIHNlbGVjdGVkVmFsdWUgIT09IHVuZGVmaW5lZCA/IHsgc2VsZWN0ZWRWYWx1ZSwgZnJlZWZvcm1WYWx1ZTogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICdtdWx0aVNlbGVjdCc6IHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdElkcyA9IEFycmF5LmlzQXJyYXkocXVlc3Rpb24uZGVmYXVsdFZhbHVlKVxuXHRcdFx0XHRcdD8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlXG5cdFx0XHRcdFx0OiAodHlwZW9mIHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA9PT0gJ3N0cmluZycgPyBbcXVlc3Rpb24uZGVmYXVsdFZhbHVlXSA6IFtdKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRWYWx1ZXMgPSBxdWVzdGlvbi5vcHRpb25zXG5cdFx0XHRcdFx0Py5maWx0ZXIob3B0ID0+IGRlZmF1bHRJZHMuaW5jbHVkZXMob3B0LmlkKSlcblx0XHRcdFx0XHQubWFwKG9wdCA9PiBvcHQudmFsdWUpXG5cdFx0XHRcdFx0LmZpbHRlcih2ID0+IHYgIT09IHVuZGVmaW5lZCkgPz8gW107XG5cblx0XHRcdFx0cmV0dXJuIHNlbGVjdGVkVmFsdWVzLmxlbmd0aCA+IDAgPyB7IHNlbGVjdGVkVmFsdWVzLCBmcmVlZm9ybVZhbHVlOiB1bmRlZmluZWQgfSBzYXRpc2ZpZXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlIDogQXJyYXkuaXNBcnJheShxdWVzdGlvbi5kZWZhdWx0VmFsdWUpID8geyBzZWxlY3RlZFZhbHVlczogcXVlc3Rpb24uZGVmYXVsdFZhbHVlIH0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBhdXRvLWZvY3VzIHNob3VsZCBiZSBlbmFibGVkLlxuXHQgKiBEaXNhYmxlZCB3aGVuIHNjcmVlbiByZWFkZXIgbW9kZSBpcyBhY3RpdmUgb3Igd2hlbiBleHBsaWNpdGx5IGRpc2FibGVkIHZpYSBvcHRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvdWxkQXV0b0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnNob3VsZEF1dG9Gb2N1cyA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gRGlzYWJsZSBhdXRvLWZvY3VzIGZvciBzY3JlZW4gcmVhZGVyIHVzZXJzIHRvIGFsbG93IHRoZW0gdG8gcmVhZCB0aGUgcXVlc3Rpb24gZmlyc3Rcblx0XHRyZXR1cm4gIXRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgYXJpYS1sYWJlbCBvZiB0aGUgY2Fyb3VzZWwgY29udGFpbmVyIGJhc2VkIG9uIHRoZSBjdXJyZW50IHF1ZXN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlQXJpYUxhYmVsKCk6IHZvaWQge1xuXHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRpZiAoIXF1ZXN0aW9uKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5sYWJlbCcsICdDaGF0IHF1ZXN0aW9uJykpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbik7XG5cdFx0Y29uc3QgbWVzc2FnZUNvbnRlbnQgPSB0aGlzLmdldFF1ZXN0aW9uVGV4dChxdWVzdGlvblRleHQpO1xuXHRcdGNvbnN0IHF1ZXN0aW9uQ291bnQgPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGg7XG5cblx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRpZiAocXVlc3Rpb25Db3VudCA9PT0gMSkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNpbmdsZVF1ZXN0aW9uTGFiZWwnLCAnQ2hhdCBxdWVzdGlvbjogezB9JywgbWVzc2FnZUNvbnRlbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubXVsdGlRdWVzdGlvbkxhYmVsJywgJ0NoYXQgcXVlc3Rpb24gezB9IG9mIHsxfTogezJ9JywgdGhpcy5fY3VycmVudEluZGV4ICsgMSwgcXVlc3Rpb25Db3VudCwgbWVzc2FnZUNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZlcmJvc2UgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXRRdWVzdGlvbkNhcm91c2VsKTtcblx0XHRpZiAodmVyYm9zZSAmJiB0aGlzLmNhcm91c2VsLnRlcm1pbmFsSWQpIHtcblx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwnKT8uZ2V0TGFiZWwoKTtcblx0XHRcdGlmIChrYkxhYmVsKSB7XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5jb21iaW5lZEZvY3VzVGVybWluYWxIaW50JywgXCJ7MH0gVXNlIHsxfSB0byBmb2N1cyB0aGUgdGVybWluYWwuXCIsIGxhYmVsLCBrYkxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5jb21iaW5lZEZvY3VzVGVybWluYWxIaW50Tm9LYicsIFwiezB9IFVzZSB0aGUgRm9jdXMgVGVybWluYWwgZnJvbSBRdWVzdGlvbiBDYXJvdXNlbCBjb21tYW5kIHRvIGZvY3VzIHRoZSB0ZXJtaW5hbC5cIiwgbGFiZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgY2Fyb3VzZWwgY29udGFpbmVyIGVsZW1lbnQuXG5cdCAqL1xuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBjYXJvdXNlbCBjb250YWluZXIgaGFzIGZvY3VzLlxuXHQgKi9cblx0cHVibGljIGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0aGlzLmRvbU5vZGUpO1xuXHR9XG5cblx0cHVibGljIG5hdmlnYXRlVG9QcmV2aW91c1F1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50SW5kZXggPD0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMubmF2aWdhdGUoLTEpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG5hdmlnYXRlVG9OZXh0UXVlc3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmRleCA+PSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5uYXZpZ2F0ZSgxKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c1Rlcm1pbmFsKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5jYXJvdXNlbC50ZXJtaW5hbElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2ZvY3VzVGVybWluYWwoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VycmVudFF1ZXN0aW9uKGZvY3VzQ29udGFpbmVyRm9yU2NyZWVuUmVhZGVyOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVlc3Rpb25SZW5kZXJTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9xdWVzdGlvblJlbmRlclN0b3JlLnZhbHVlID0gcXVlc3Rpb25SZW5kZXJTdG9yZTtcblx0XHR0aGlzLl9pbnB1dFNjcm9sbGFibGUgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBDbGVhciBwcmV2aW91cyBpbnB1dCBib3hlcyBhbmQgc3RhbGUgcmVmZXJlbmNlc1xuXHRcdHRoaXMuX2lucHV0Qm94ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl90ZXh0SW5wdXRCb3hlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3NpbmdsZVNlbGVjdEl0ZW1zLmNsZWFyKCk7XG5cdFx0dGhpcy5fbXVsdGlTZWxlY3RDaGVja2JveGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZnJlZWZvcm1UZXh0YXJlYXMuY2xlYXIoKTtcblxuXHRcdC8vIENsZWFyIHByZXZpb3VzIGNvbnRlbnRcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRpZiAoIXF1ZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVyUm93ID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWhlYWRlci1yb3cnKTtcblx0XHRjb25zdCB0aXRsZVJvdyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi10aXRsZS1yb3cnKTtcblxuXHRcdC8vIFJlbmRlciBjYXJvdXNlbC1sZXZlbCBtZXNzYWdlIGlmIHByZXNlbnQgKGUuZy4gZnJvbSBNQ1AgZWxpY2l0YXRpb24pXG5cdFx0aWYgKHRoaXMuY2Fyb3VzZWwubWVzc2FnZSAmJiB0aGlzLl9jdXJyZW50SW5kZXggPT09IDApIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VNZCA9IGlzTWFya2Rvd25TdHJpbmcodGhpcy5jYXJvdXNlbC5tZXNzYWdlKSA/IE1hcmtkb3duU3RyaW5nLmxpZnQodGhpcy5jYXJvdXNlbC5tZXNzYWdlKSA6IG5ldyBNYXJrZG93blN0cmluZyh0aGlzLmNhcm91c2VsLm1lc3NhZ2UpO1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWxNZXNzYWdlID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLW1lc3NhZ2UnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWVzc2FnZSA9IHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtZXNzYWdlTWQsIGdldENoYXRNYXJrZG93blJlbmRlck9wdGlvbnMoKSkpO1xuXHRcdFx0Y2Fyb3VzZWxNZXNzYWdlLmFwcGVuZENoaWxkKHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50KTtcblx0XHRcdGhlYWRlclJvdy5hcHBlbmRDaGlsZChjYXJvdXNlbE1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXN0aW9uVGV4dCA9IGdldERpc3BsYXllZFF1ZXN0aW9uVGV4dChxdWVzdGlvbik7XG5cdFx0aWYgKHF1ZXN0aW9uVGV4dCkge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tdGl0bGUnKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VDb250ZW50ID0gdGhpcy5nZXRRdWVzdGlvblRleHQocXVlc3Rpb25UZXh0KTtcblx0XHRcdHRpdGxlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG1lc3NhZ2VDb250ZW50KTtcblxuXHRcdFx0Y29uc3QgcmF3VmFsdWUgPSBpc01hcmtkb3duU3RyaW5nKHF1ZXN0aW9uVGV4dCkgPyBxdWVzdGlvblRleHQudmFsdWUgOiBxdWVzdGlvblRleHQ7XG5cdFx0XHRjb25zdCBzdWZmaXhlZCA9IHF1ZXN0aW9uLnJlcXVpcmVkID8gYCR7cmF3VmFsdWV9ICpgIDogcmF3VmFsdWU7XG5cdFx0XHRjb25zdCBtZCA9IGlzTWFya2Rvd25TdHJpbmcocXVlc3Rpb25UZXh0KVxuXHRcdFx0XHQ/IE1hcmtkb3duU3RyaW5nLmxpZnQoeyAuLi5xdWVzdGlvblRleHQsIHZhbHVlOiBzdWZmaXhlZCB9KVxuXHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhzdWZmaXhlZCk7XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKHRoaXMuX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtZCwgZ2V0Q2hhdE1hcmtkb3duUmVuZGVyT3B0aW9ucygpKSk7XG5cdFx0XHR0aXRsZS5hcHBlbmRDaGlsZChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdHRpdGxlUm93LmFwcGVuZENoaWxkKHRpdGxlKTtcblx0XHR9XG5cblx0XHRoZWFkZXJSb3cuYXBwZW5kQ2hpbGQodGl0bGVSb3cpO1xuXG5cdFx0aWYgKHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5faGVhZGVyQWN0aW9uc0NvbnRhaW5lcik7XG5cdFx0XHRpZiAodGhpcy5fZm9jdXNUZXJtaW5hbEJ1dHRvbkNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2ZvY3VzVGVybWluYWxCdXR0b25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2Nsb3NlQnV0dG9uQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY2xvc2VCdXR0b25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRcdHRoaXMuX2hlYWRlckFjdGlvbnNDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHR0aXRsZVJvdy5hcHBlbmRDaGlsZCh0aGlzLl9oZWFkZXJBY3Rpb25zQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9xdWVzdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChoZWFkZXJSb3cpO1xuXG5cdFx0Ly8gUmVuZGVyIGRlc2NyaXB0aW9uIGlmIHByZXNlbnRcblx0XHRpZiAocXVlc3Rpb24uZGVzY3JpcHRpb24pIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uRWwgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZGVzY3JpcHRpb24nKTtcblx0XHRcdGRlc2NyaXB0aW9uRWwudGV4dENvbnRlbnQgPSBxdWVzdGlvbi5kZXNjcmlwdGlvbjtcblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKGRlc2NyaXB0aW9uRWwpO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBpbnB1dCBiYXNlZCBvbiBxdWVzdGlvbiB0eXBlXG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24taW5wdXQtY29udGFpbmVyJyk7XG5cblx0XHQvLyBSZW5kZXIgZGV0YWlsZWQgbWFya2Rvd24gbWVzc2FnZSBpbnNpZGUgdGhlIHNjcm9sbGFibGUgaW5wdXQgYXJlYVxuXHRcdGlmIChxdWVzdGlvbi5kZXRhaWxlZE1lc3NhZ2UpIHtcblx0XHRcdGNvbnN0IGRldGFpbGVkTWQgPSBpc01hcmtkb3duU3RyaW5nKHF1ZXN0aW9uLmRldGFpbGVkTWVzc2FnZSlcblx0XHRcdFx0PyBNYXJrZG93blN0cmluZy5saWZ0KHF1ZXN0aW9uLmRldGFpbGVkTWVzc2FnZSlcblx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcocXVlc3Rpb24uZGV0YWlsZWRNZXNzYWdlKTtcblx0XHRcdGNvbnN0IGRldGFpbGVkTWVzc2FnZUVsID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWRldGFpbGVkLW1lc3NhZ2UnKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRGV0YWlsZWRNZXNzYWdlID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQodGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRldGFpbGVkTWQsIGdldENoYXRNYXJrZG93blJlbmRlck9wdGlvbnMoKSkpO1xuXHRcdFx0ZGV0YWlsZWRNZXNzYWdlRWwuYXBwZW5kQ2hpbGQocmVuZGVyZWREZXRhaWxlZE1lc3NhZ2UuZWxlbWVudCk7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5hcHBlbmRDaGlsZChkZXRhaWxlZE1lc3NhZ2VFbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJJbnB1dChpbnB1dENvbnRhaW5lciwgcXVlc3Rpb24pO1xuXG5cdFx0Y29uc3QgaW5wdXRTY3JvbGxhYmxlID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGlucHV0Q29udGFpbmVyLCB7XG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX2lucHV0U2Nyb2xsYWJsZSA9IGlucHV0U2Nyb2xsYWJsZTtcblx0XHRjb25zdCBpbnB1dFNjcm9sbGFibGVOb2RlID0gaW5wdXRTY3JvbGxhYmxlLmdldERvbU5vZGUoKTtcblx0XHRpbnB1dFNjcm9sbGFibGVOb2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24taW5wdXQtc2Nyb2xsYWJsZScpO1xuXHRcdHRoaXMuX3F1ZXN0aW9uQ29udGFpbmVyLmFwcGVuZENoaWxkKGlucHV0U2Nyb2xsYWJsZU5vZGUpO1xuXG5cdFx0Ly8gVmFsaWRhdGlvbiBtZXNzYWdlIGVsZW1lbnQgYmVsb3cgdGhlIHNjcm9sbGFibGUgYXJlYSAobm90IGluc2lkZSBpdClcblx0XHR0aGlzLl92YWxpZGF0aW9uTWVzc2FnZUVsZW1lbnQgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tdmFsaWRhdGlvbi1tZXNzYWdlJyk7XG5cdFx0dGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5fcXVlc3Rpb25Db250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50KTtcblxuXHRcdGNvbnN0IGlzU2luZ2xlUXVlc3Rpb24gPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggPT09IDE7XG5cblx0XHQvLyBSZW5kZXIgZm9vdGVyIGJlZm9yZSBmaXJzdCBsYXlvdXQgc28gdGhlIHNjcm9sbGFibGUgYXJlYSBpcyBtZWFzdXJlZCBhZ2FpbnN0XG5cdFx0Ly8gaXRzIGZpbmFsIGF2YWlsYWJsZSBoZWlnaHQgYW5kIGRvZXMgbm90IHZpc2libHkgcmVzaXplIHR3aWNlLlxuXHRcdGlmICghaXNTaW5nbGVRdWVzdGlvbikge1xuXHRcdFx0dGhpcy5yZW5kZXJGb290ZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJTaW5nbGVRdWVzdGlvbkZvb3RlcigpO1xuXHRcdH1cblxuXHRcdGxldCByZWxheW91dFNjaGVkdWxlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlbGF5b3V0U2NoZWR1bGVyID0gcXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IHNjaGVkdWxlTGF5b3V0SW5wdXRTY3JvbGxhYmxlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHJlbGF5b3V0U2NoZWR1bGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cmVsYXlvdXRTY2hlZHVsZWQgPSB0cnVlO1xuXHRcdFx0cmVsYXlvdXRTY2hlZHVsZXIudmFsdWUgPSBkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0XHRyZWxheW91dFNjaGVkdWxlZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLmxheW91dElucHV0U2Nyb2xsYWJsZShpbnB1dFNjcm9sbGFibGUpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlucHV0UmVzaXplT2JzZXJ2ZXIgPSBxdWVzdGlvblJlbmRlclN0b3JlLmFkZChuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmlucHV0U2Nyb2xsYWJsZScsICgpID0+IHNjaGVkdWxlTGF5b3V0SW5wdXRTY3JvbGxhYmxlKCkpKTtcblx0XHRxdWVzdGlvblJlbmRlclN0b3JlLmFkZChpbnB1dFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoaW5wdXRTY3JvbGxhYmxlTm9kZSkpO1xuXHRcdHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKGlucHV0UmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShpbnB1dENvbnRhaW5lcikpO1xuXHRcdHF1ZXN0aW9uUmVuZGVyU3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCBkb20uRXZlbnRUeXBlLlJFU0laRSwgKCkgPT4gc2NoZWR1bGVMYXlvdXRJbnB1dFNjcm9sbGFibGUoKSkpO1xuXHRcdHNjaGVkdWxlTGF5b3V0SW5wdXRTY3JvbGxhYmxlKCk7XG5cdFx0cXVlc3Rpb25SZW5kZXJTdG9yZS5hZGQoZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSksICgpID0+IHtcblx0XHRcdGlucHV0Q29udGFpbmVyLnNjcm9sbFRvcCA9IDA7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5zY3JvbGxMZWZ0ID0gMDtcblx0XHRcdGlucHV0U2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogMCwgc2Nyb2xsTGVmdDogMCB9KTtcblx0XHRcdGlucHV0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFVwZGF0ZSBhcmlhLWxhYmVsIHRvIHJlZmxlY3QgdGhlIGN1cnJlbnQgcXVlc3Rpb25cblx0XHR0aGlzLl91cGRhdGVBcmlhTGFiZWwoKTtcblx0XHR0aGlzLnVwZGF0ZUNvbGxhcHNlZFByZXNlbnRhdGlvbigpO1xuXG5cdFx0Ly8gSW4gc2NyZWVuIHJlYWRlciBtb2RlLCBmb2N1cyB0aGUgY29udGFpbmVyIGFuZCBhbm5vdW5jZSB0aGUgcXVlc3Rpb25cblx0XHQvLyBUaGlzIG11c3QgaGFwcGVuIGFmdGVyIGFsbCByZW5kZXIgY2FsbHMgdG8gYXZvaWQgZm9jdXMgYmVpbmcgc3RvbGVuXG5cdFx0aWYgKGZvY3VzQ29udGFpbmVyRm9yU2NyZWVuUmVhZGVyICYmIHRoaXMuX2FjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdHRoaXMuX2ZvY3VzQ29udGFpbmVyQW5kQW5ub3VuY2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBvciB1cGRhdGVzIHRoZSBwZXJzaXN0ZW50IGZvb3RlciB3aXRoIG5hdiBhcnJvd3MsIHN0ZXAgaW5kaWNhdG9yLCBhbmQgc3VibWl0IGJ1dHRvbi5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyRm9vdGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZm9vdGVyUm93KSB7XG5cdFx0XHRjb25zdCBpbnRlcmFjdGl2ZVN0b3JlID0gdGhpcy5faW50ZXJhY3RpdmVVSVN0b3JlLnZhbHVlO1xuXHRcdFx0aWYgKCFpbnRlcmFjdGl2ZVN0b3JlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZm9vdGVyUm93ID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZvb3Rlci1yb3cnKTtcblxuXHRcdFx0Ly8gTGVmdCBzaWRlOiBuYXYgYXJyb3dzICsgc3RlcCBpbmRpY2F0b3Jcblx0XHRcdGNvbnN0IGxlZnRDb250cm9scyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mb290ZXItbGVmdC5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLW5hdicpO1xuXHRcdFx0bGVmdENvbnRyb2xzLnNldEF0dHJpYnV0ZSgncm9sZScsICduYXZpZ2F0aW9uJyk7XG5cdFx0XHRsZWZ0Q29udHJvbHMuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5uYXZpZ2F0aW9uJywgJ1F1ZXN0aW9uIG5hdmlnYXRpb24nKSk7XG5cblx0XHRcdGNvbnN0IGFycm93c0NvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1uYXYtYXJyb3dzJyk7XG5cblx0XHRcdGNvbnN0IHByZXZpb3VzTGFiZWwgPSB0aGlzLmdldExhYmVsV2l0aEtleWJpbmRpbmcobG9jYWxpemUoJ3ByZXZpb3VzJywgJ1ByZXZpb3VzJyksIFBSRVZJT1VTX1FVRVNUSU9OX0FDVElPTl9JRCk7XG5cdFx0XHRjb25zdCBwcmV2QnV0dG9uID0gaW50ZXJhY3RpdmVTdG9yZS5hZGQobmV3IEJ1dHRvbihhcnJvd3NDb250YWluZXIsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdFx0cHJldkJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tbmF2LWFycm93JywgJ2NoYXQtcXVlc3Rpb24tbmF2LXByZXYnKTtcblx0XHRcdHByZXZCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uY2hldnJvbkxlZnQuaWR9KWA7XG5cdFx0XHRwcmV2QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgcHJldmlvdXNMYWJlbCk7XG5cdFx0XHRpbnRlcmFjdGl2ZVN0b3JlLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIocHJldkJ1dHRvbi5lbGVtZW50LCB7IGNvbnRlbnQ6IHByZXZpb3VzTGFiZWwgfSkpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQocHJldkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMubmF2aWdhdGUoLTEpKSk7XG5cdFx0XHR0aGlzLl9wcmV2QnV0dG9uID0gcHJldkJ1dHRvbjtcblxuXHRcdFx0Y29uc3QgbmV4dExhYmVsID0gdGhpcy5nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCduZXh0JywgJ05leHQnKSwgTkVYVF9RVUVTVElPTl9BQ1RJT05fSUQpO1xuXHRcdFx0Y29uc3QgbmV4dEJ1dHRvbiA9IGludGVyYWN0aXZlU3RvcmUuYWRkKG5ldyBCdXR0b24oYXJyb3dzQ29udGFpbmVyLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHRcdG5leHRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLW5hdi1hcnJvdycsICdjaGF0LXF1ZXN0aW9uLW5hdi1uZXh0Jyk7XG5cdFx0XHRuZXh0QnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmNoZXZyb25SaWdodC5pZH0pYDtcblx0XHRcdG5leHRCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBuZXh0TGFiZWwpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKG5leHRCdXR0b24uZWxlbWVudCwgeyBjb250ZW50OiBuZXh0TGFiZWwgfSkpO1xuXHRcdFx0aW50ZXJhY3RpdmVTdG9yZS5hZGQobmV4dEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMubmF2aWdhdGUoMSkpKTtcblx0XHRcdHRoaXMuX25leHRCdXR0b24gPSBuZXh0QnV0dG9uO1xuXG5cdFx0XHRsZWZ0Q29udHJvbHMuYXBwZW5kQ2hpbGQoYXJyb3dzQ29udGFpbmVyKTtcblxuXHRcdFx0dGhpcy5fc3RlcEluZGljYXRvciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdGVwLWluZGljYXRvcicpO1xuXHRcdFx0bGVmdENvbnRyb2xzLmFwcGVuZENoaWxkKHRoaXMuX3N0ZXBJbmRpY2F0b3IpO1xuXG5cdFx0XHR0aGlzLl9mb290ZXJSb3cuYXBwZW5kQ2hpbGQobGVmdENvbnRyb2xzKTtcblxuXHRcdFx0Ly8gUmlnaHQgc2lkZTogaGludCArIHN1Ym1pdFxuXHRcdFx0Y29uc3QgcmlnaHRDb250cm9scyA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1mb290ZXItcmlnaHQnKTtcblxuXHRcdFx0Y29uc3QgaGludCA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VibWl0LWhpbnQnKTtcblx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBpc01hY2ludG9zaFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc3VibWl0SGludE1hYycsICdcXHUyMzE4XFx1MjNDRSB0byBzdWJtaXQnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc3VibWl0SGludE90aGVyJywgJ0N0cmwrRW50ZXIgdG8gc3VibWl0Jyk7XG5cdFx0XHRyaWdodENvbnRyb2xzLmFwcGVuZENoaWxkKGhpbnQpO1xuXHRcdFx0dGhpcy5fc3VibWl0SGludCA9IGhpbnQ7XG5cblx0XHRcdGNvbnN0IHN1Ym1pdEJ1dHRvbiA9IGludGVyYWN0aXZlU3RvcmUuYWRkKG5ldyBCdXR0b24ocmlnaHRDb250cm9scywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tc3VibWl0LWJ1dHRvbicpO1xuXHRcdFx0c3VibWl0QnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3N1Ym1pdCcsICdTdWJtaXQnKTtcblx0XHRcdGludGVyYWN0aXZlU3RvcmUuYWRkKHN1Ym1pdEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuc3VibWl0KCkpKTtcblx0XHRcdHRoaXMuX3N1Ym1pdEJ1dHRvbiA9IHN1Ym1pdEJ1dHRvbjtcblxuXHRcdFx0dGhpcy5fZm9vdGVyUm93LmFwcGVuZENoaWxkKHJpZ2h0Q29udHJvbHMpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZCh0aGlzLl9mb290ZXJSb3cpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRm9vdGVyU3RhdGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBmb290ZXIgbmF2IGJ1dHRvbiBlbmFibGVkIHN0YXRlIGFuZCBzdGVwIGluZGljYXRvciB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVGb290ZXJTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJldkJ1dHRvbikge1xuXHRcdFx0dGhpcy5fcHJldkJ1dHRvbi5lbmFibGVkID0gdGhpcy5fY3VycmVudEluZGV4ID4gMDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX25leHRCdXR0b24pIHtcblx0XHRcdGNvbnN0IGNhbkFkdmFuY2UgPSB0aGlzLl9jdXJyZW50SW5kZXggPCB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggLSAxO1xuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9uc1t0aGlzLl9jdXJyZW50SW5kZXhdO1xuXHRcdFx0Y29uc3QgYW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24/LmlkKTtcblx0XHRcdGNvbnN0IGhhc0Fuc3dlciA9IGFuc3dlciAhPT0gdW5kZWZpbmVkICYmIGFuc3dlciAhPT0gJyc7XG5cdFx0XHRjb25zdCBoYXNWYWxpZGF0aW9uRXJyb3IgPSAhIXRoaXMuX2N1cnJlbnRWYWxpZGF0aW9uRXJyb3I7XG5cdFx0XHR0aGlzLl9uZXh0QnV0dG9uLmVuYWJsZWQgPSBjYW5BZHZhbmNlICYmICghcXVlc3Rpb24/LnJlcXVpcmVkIHx8IGhhc0Fuc3dlcikgJiYgIWhhc1ZhbGlkYXRpb25FcnJvcjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0ZXBJbmRpY2F0b3IpIHtcblx0XHRcdHRoaXMuX3N0ZXBJbmRpY2F0b3IudGV4dENvbnRlbnQgPSBsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQucXVlc3Rpb25DYXJvdXNlbC5zdGVwSW5kaWNhdG9yJyxcblx0XHRcdFx0J3swfS97MX0nLFxuXHRcdFx0XHR0aGlzLl9jdXJyZW50SW5kZXggKyAxLFxuXHRcdFx0XHR0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGhcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdWJtaXRCdXR0b24pIHtcblx0XHRcdGNvbnN0IGlzTGFzdFF1ZXN0aW9uID0gdGhpcy5fY3VycmVudEluZGV4ID09PSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggLSAxO1xuXHRcdFx0dGhpcy5fc3VibWl0QnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGlzTGFzdFF1ZXN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0XHRpZiAodGhpcy5fc3VibWl0SGludCkge1xuXHRcdFx0XHR0aGlzLl9zdWJtaXRIaW50LnN0eWxlLmRpc3BsYXkgPSBpc0xhc3RRdWVzdGlvbiA/ICcnIDogJ25vbmUnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIGEgc2ltcGxpZmllZCBmb290ZXIgd2l0aCBqdXN0IGEgc3VibWl0IGJ1dHRvbiBmb3Igc2luZ2xlLXF1ZXN0aW9uIG11bHRpLXNlbGVjdCBjYXJvdXNlbHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclNpbmdsZVF1ZXN0aW9uRm9vdGVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZm9vdGVyUm93KSB7XG5cdFx0XHRjb25zdCBpbnRlcmFjdGl2ZVN0b3JlID0gdGhpcy5faW50ZXJhY3RpdmVVSVN0b3JlLnZhbHVlO1xuXHRcdFx0aWYgKCFpbnRlcmFjdGl2ZVN0b3JlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZm9vdGVyUm93ID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZvb3Rlci1yb3cnKTtcblxuXHRcdFx0Ly8gU3BhY2VyIHRvIHB1c2ggY29udHJvbHMgdG8gdGhlIHJpZ2h0XG5cdFx0XHRjb25zdCBsZWZ0Q29udHJvbHMgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZm9vdGVyLWxlZnQuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1uYXYnKTtcblx0XHRcdGxlZnRDb250cm9scy5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbmF2aWdhdGlvbicpO1xuXHRcdFx0bGVmdENvbnRyb2xzLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubmF2aWdhdGlvbicsICdRdWVzdGlvbiBuYXZpZ2F0aW9uJykpO1xuXHRcdFx0dGhpcy5fZm9vdGVyUm93LmFwcGVuZENoaWxkKGxlZnRDb250cm9scyk7XG5cblx0XHRcdGNvbnN0IHJpZ2h0Q29udHJvbHMgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZm9vdGVyLXJpZ2h0Jyk7XG5cblx0XHRcdGNvbnN0IGhpbnQgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1Ym1pdC1oaW50Jyk7XG5cdFx0XHRoaW50LnRleHRDb250ZW50ID0gaXNNYWNpbnRvc2hcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnN1Ym1pdEhpbnRNYWMnLCAnXFx1MjMxOFxcdTIzQ0UgdG8gc3VibWl0Jylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnN1Ym1pdEhpbnRPdGhlcicsICdDdHJsK0VudGVyIHRvIHN1Ym1pdCcpO1xuXHRcdFx0cmlnaHRDb250cm9scy5hcHBlbmRDaGlsZChoaW50KTtcblx0XHRcdHRoaXMuX3N1Ym1pdEhpbnQgPSBoaW50O1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdXR0b24gPSBpbnRlcmFjdGl2ZVN0b3JlLmFkZChuZXcgQnV0dG9uKHJpZ2h0Q29udHJvbHMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0XHRzdWJtaXRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXF1ZXN0aW9uLXN1Ym1pdC1idXR0b24nKTtcblx0XHRcdHN1Ym1pdEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdzdWJtaXQnLCAnU3VibWl0Jyk7XG5cdFx0XHRpbnRlcmFjdGl2ZVN0b3JlLmFkZChzdWJtaXRCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnN1Ym1pdCgpKSk7XG5cdFx0XHR0aGlzLl9zdWJtaXRCdXR0b24gPSBzdWJtaXRCdXR0b247XG5cblx0XHRcdHRoaXMuX2Zvb3RlclJvdy5hcHBlbmRDaGlsZChyaWdodENvbnRyb2xzKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQodGhpcy5fZm9vdGVyUm93KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldExhYmVsV2l0aEtleWJpbmRpbmcobGFiZWw6IHN0cmluZywgYWN0aW9uSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb25JZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpPy5nZXRMYWJlbCgpO1xuXHRcdHJldHVybiBrZXliaW5kaW5nTGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5sYWJlbFdpdGhLZXliaW5kaW5nJywgJ3swfSAoezF9KScsIGxhYmVsLCBrZXliaW5kaW5nTGFiZWwpXG5cdFx0XHQ6IGxhYmVsO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbnB1dChjb250YWluZXI6IEhUTUxFbGVtZW50LCBxdWVzdGlvbjogSUNoYXRRdWVzdGlvbik6IHZvaWQge1xuXHRcdHN3aXRjaCAocXVlc3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdHRoaXMucmVuZGVyVGV4dElucHV0KGNvbnRhaW5lciwgcXVlc3Rpb24pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3NpbmdsZVNlbGVjdCc6XG5cdFx0XHRcdHRoaXMucmVuZGVyU2luZ2xlU2VsZWN0KGNvbnRhaW5lciwgcXVlc3Rpb24pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ211bHRpU2VsZWN0Jzpcblx0XHRcdFx0dGhpcy5yZW5kZXJNdWx0aVNlbGVjdChjb250YWluZXIsIHF1ZXN0aW9uKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdXAgYXV0by1yZXNpemUgYmVoYXZpb3IgZm9yIGEgdGV4dGFyZWEgZWxlbWVudC5cblx0ICogQHJldHVybnMgQSBmdW5jdGlvbiB0aGF0IHRyaWdnZXJzIHRoZSByZXNpemUgbWFudWFsbHkgKHVzZWZ1bCBmb3IgaW5pdGlhbCBzaXppbmcpLlxuXHQgKi9cblx0cHJpdmF0ZSBzZXR1cFRleHRhcmVhQXV0b1Jlc2l6ZSh0ZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCk6ICgpID0+IHZvaWQge1xuXHRcdGNvbnN0IGF1dG9SZXNpemUgPSAoKSA9PiB7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSAnYXV0byc7XG5cdFx0XHR0ZXh0YXJlYS5zdHlsZS5oZWlnaHQgPSBgJHtNYXRoLm1pbih0ZXh0YXJlYS5zY3JvbGxIZWlnaHQsIDIwMCl9cHhgO1xuXHRcdFx0aWYgKHRoaXMuX2lucHV0U2Nyb2xsYWJsZSkge1xuXHRcdFx0XHR0aGlzLmxheW91dElucHV0U2Nyb2xsYWJsZSh0aGlzLl9pbnB1dFNjcm9sbGFibGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH07XG5cdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXh0YXJlYSwgZG9tLkV2ZW50VHlwZS5JTlBVVCwgYXV0b1Jlc2l6ZSkpO1xuXHRcdHJldHVybiBhdXRvUmVzaXplO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUZXh0SW5wdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcXVlc3Rpb246IElDaGF0UXVlc3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dEJveCA9IHRoaXMuX2lucHV0Qm94ZXMuYWRkKG5ldyBJbnB1dEJveChjb250YWluZXIsIHVuZGVmaW5lZCwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZW50ZXJUZXh0JywgJ0VudGVyIHlvdXIgYW5zd2VyJyksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHF1ZXN0aW9uLnZhbGlkYXRpb24gPyB7XG5cdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF2YWx1ZSAmJiAhcXVlc3Rpb24ucmVxdWlyZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBlcnJvciA9IHRoaXMuZ2V0VmFsaWRhdGlvbkVycm9yKHZhbHVlLCBxdWVzdGlvbi52YWxpZGF0aW9uISk7XG5cdFx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAyIC8qIE1lc3NhZ2VUeXBlLldBUk5JTkcgKi8sIGNvbnRlbnQ6IGVycm9yIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChpbnB1dEJveC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzdG9yZSBwcmV2aW91cyBhbnN3ZXIgaWYgZXhpc3RzXG5cdFx0Y29uc3QgcHJldmlvdXNBbnN3ZXIgPSB0aGlzLl9hbnN3ZXJzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0aWYgKHByZXZpb3VzQW5zd2VyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlucHV0Qm94LnZhbHVlID0gU3RyaW5nKHByZXZpb3VzQW5zd2VyKTtcblx0XHR9IGVsc2UgaWYgKHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpbnB1dEJveC52YWx1ZSA9IFN0cmluZyhxdWVzdGlvbi5kZWZhdWx0VmFsdWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RleHRJbnB1dEJveGVzLnNldChxdWVzdGlvbi5pZCwgaW5wdXRCb3gpO1xuXG5cdFx0Ly8gRm9jdXMgb24gaW5wdXQgd2hlbiByZW5kZXJlZCB1c2luZyBwcm9wZXIgRE9NIHNjaGVkdWxpbmdcblx0XHRpZiAodGhpcy5fc2hvdWxkQXV0b0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhpbnB1dEJveC5lbGVtZW50KSwgKCkgPT4gaW5wdXRCb3guZm9jdXMoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU2luZ2xlU2VsZWN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3JkZXJlZE9wdGlvbnMgPSBnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3QocXVlc3Rpb24pO1xuXHRcdGNvbnN0IHNlbGVjdENvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0Jyk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Ym94Jyk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHF1ZXN0aW9uLnRpdGxlKTtcblx0XHRzZWxlY3RDb250YWluZXIudGFiSW5kZXggPSAwO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChzZWxlY3RDb250YWluZXIpO1xuXG5cdFx0Ly8gUmVzdG9yZSBwcmV2aW91cyBhbnN3ZXIgaWYgZXhpc3RzXG5cdFx0Y29uc3QgcHJldmlvdXNBbnN3ZXIgPSB0aGlzLl9hbnN3ZXJzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0Y29uc3QgcHJldlNpbmdsZSA9IHR5cGVvZiBwcmV2aW91c0Fuc3dlciA9PT0gJ29iamVjdCcgJiYgcHJldmlvdXNBbnN3ZXIgIT09IG51bGwgJiYgaGFzS2V5KHByZXZpb3VzQW5zd2VyLCB7IHNlbGVjdGVkVmFsdWU6IHRydWUgfSkgPyBwcmV2aW91c0Fuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmV2aW91c0ZyZWVmb3JtID0gcHJldlNpbmdsZT8uZnJlZWZvcm1WYWx1ZTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGVkVmFsdWUgPSBwcmV2U2luZ2xlPy5zZWxlY3RlZFZhbHVlO1xuXG5cdFx0Ly8gR2V0IGRlZmF1bHQgb3B0aW9uIGlkIChmb3Igc2luZ2xlU2VsZWN0LCBkZWZhdWx0VmFsdWUgaXMgYSBzaW5nbGUgc3RyaW5nKVxuXHRcdGNvbnN0IGRlZmF1bHRPcHRpb25JZCA9IHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gcXVlc3Rpb24uZGVmYXVsdFZhbHVlIDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGluaXRpYWxseSBzZWxlY3RlZCBpbmRleFxuXHRcdGxldCBzZWxlY3RlZEluZGV4ID0gLTE7XG5cdFx0b3JkZXJlZE9wdGlvbnMuZm9yRWFjaCgoeyBvcHRpb24gfSwgaW5kZXgpID0+IHtcblx0XHRcdGlmIChwcmV2aW91c1NlbGVjdGVkVmFsdWUgIT09IHVuZGVmaW5lZCAmJiBvcHRpb24udmFsdWUgPT09IHByZXZpb3VzU2VsZWN0ZWRWYWx1ZSkge1xuXHRcdFx0XHRzZWxlY3RlZEluZGV4ID0gaW5kZXg7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkSW5kZXggPT09IC0xICYmICFwcmV2aW91c0ZyZWVmb3JtICYmIGRlZmF1bHRPcHRpb25JZCAhPT0gdW5kZWZpbmVkICYmIG9wdGlvbi5pZCA9PT0gZGVmYXVsdE9wdGlvbklkKSB7XG5cdFx0XHRcdHNlbGVjdGVkSW5kZXggPSBpbmRleDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGxpc3RJdGVtczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGluZGljYXRvcnM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRjb25zdCB1cGRhdGVTZWxlY3Rpb24gPSAobmV3SW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0Ly8gVXBkYXRlIHZpc3VhbCBzdGF0ZVxuXHRcdFx0bGlzdEl0ZW1zLmZvckVhY2goKGl0ZW0sIGkpID0+IHtcblx0XHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IGkgPT09IG5ld0luZGV4O1xuXHRcdFx0XHRpdGVtLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgaXNTZWxlY3RlZCk7XG5cdFx0XHRcdGl0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgU3RyaW5nKGlzU2VsZWN0ZWQpKTtcblx0XHRcdFx0Y29uc3QgaW5kaWNhdG9yID0gaW5kaWNhdG9yc1tpXTtcblx0XHRcdFx0aW5kaWNhdG9yLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGljb24nLCBpc1NlbGVjdGVkKTtcblx0XHRcdFx0aW5kaWNhdG9yLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGljb24tY2hlY2snLCBpc1NlbGVjdGVkKTtcblx0XHRcdH0pO1xuXHRcdFx0Ly8gVXBkYXRlIGFyaWEtYWN0aXZlZGVzY2VuZGFudCBmb3Igc2NyZWVuIHJlYWRlciBhbm5vdW5jZW1lbnRzXG5cdFx0XHRpZiAobmV3SW5kZXggPj0gMCAmJiBuZXdJbmRleCA8IGxpc3RJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50JywgbGlzdEl0ZW1zW25ld0luZGV4XS5pZCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBVcGRhdGUgdHJhY2tlZCBzdGF0ZVxuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3NpbmdsZVNlbGVjdEl0ZW1zLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRkYXRhLnNlbGVjdGVkSW5kZXggPSBuZXdJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zYXZlQ3VycmVudEFuc3dlcigpO1xuXHRcdH07XG5cblx0XHRvcmRlcmVkT3B0aW9ucy5mb3JFYWNoKCh7IG9wdGlvbiB9LCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgaXNTZWxlY3RlZCA9IGluZGV4ID09PSBzZWxlY3RlZEluZGV4O1xuXHRcdFx0Y29uc3QgbGlzdEl0ZW0gPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1pdGVtJyk7XG5cdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnb3B0aW9uJyk7XG5cdFx0XHRsaXN0SXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCBTdHJpbmcoaXNTZWxlY3RlZCkpO1xuXHRcdFx0bGlzdEl0ZW0uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5vcHRpb25MYWJlbCcsIFwiT3B0aW9uIHswfTogezF9XCIsIGluZGV4ICsgMSwgb3B0aW9uLmxhYmVsKSk7XG5cdFx0XHRsaXN0SXRlbS5pZCA9IGBvcHRpb24tJHtxdWVzdGlvbi5pZH0tJHtpbmRleH1gO1xuXHRcdFx0bGlzdEl0ZW0udGFiSW5kZXggPSAtMTtcblxuXHRcdFx0Y29uc3QgbnVtYmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtbnVtYmVyJyk7XG5cdFx0XHRudW1iZXIudGV4dENvbnRlbnQgPSBgJHtpbmRleCArIDF9YDtcblx0XHRcdGxpc3RJdGVtLmFwcGVuZENoaWxkKG51bWJlcik7XG5cblx0XHRcdC8vIFNlbGVjdGlvbiBpbmRpY2F0b3IgKGNoZWNrbWFyayB3aGVuIHNlbGVjdGVkKVxuXHRcdFx0Y29uc3QgaW5kaWNhdG9yID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaW5kaWNhdG9yJyk7XG5cdFx0XHRpZiAoaXNTZWxlY3RlZCkge1xuXHRcdFx0XHRpbmRpY2F0b3IuY2xhc3NMaXN0LmFkZCgnY29kaWNvbicsICdjb2RpY29uLWNoZWNrJyk7XG5cdFx0XHR9XG5cdFx0XHRpbmRpY2F0b3JzLnB1c2goaW5kaWNhdG9yKTtcblxuXHRcdFx0Ly8gTGFiZWwgd2l0aCBvcHRpb25hbCBkZXNjcmlwdGlvbiAoZm9ybWF0OiBcIlRpdGxlIC0gRGVzY3JpcHRpb25cIilcblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtbGFiZWwnKTtcblx0XHRcdGNvbnN0IHNlcGFyYXRvckluZGV4ID0gb3B0aW9uLmxhYmVsLmluZGV4T2YoJyAtICcpO1xuXHRcdFx0aWYgKHNlcGFyYXRvckluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRsaXN0SXRlbS5jbGFzc0xpc3QuYWRkKCdoYXMtZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0Y29uc3QgdGl0bGVTcGFuID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1saXN0LWxhYmVsLXRpdGxlJyk7XG5cdFx0XHRcdHRpdGxlU3Bhbi50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbC5zdWJzdHJpbmcoMCwgc2VwYXJhdG9ySW5kZXgpO1xuXHRcdFx0XHRsYWJlbC5hcHBlbmRDaGlsZCh0aXRsZVNwYW4pO1xuXG5cdFx0XHRcdGNvbnN0IGRlc2NTcGFuID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1saXN0LWxhYmVsLWRlc2MnKTtcblx0XHRcdFx0ZGVzY1NwYW4udGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWwuc3Vic3RyaW5nKHNlcGFyYXRvckluZGV4ICsgMyk7XG5cdFx0XHRcdGxhYmVsLmFwcGVuZENoaWxkKGRlc2NTcGFuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0bGlzdEl0ZW0uYXBwZW5kQ2hpbGQobGFiZWwpO1xuXHRcdFx0bGlzdEl0ZW0uYXBwZW5kQ2hpbGQoaW5kaWNhdG9yKTtcblxuXHRcdFx0aWYgKGlzU2VsZWN0ZWQpIHtcblx0XHRcdFx0bGlzdEl0ZW0uY2xhc3NMaXN0LmFkZCgnc2VsZWN0ZWQnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaWYgd2Ugc2VsZWN0IGFuIG9wdGlvbiwgY2xlYXIgdGV4dCBhbmQgZ28gdG8gbmV4dCBxdWVzdGlvblxuXHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaXN0SXRlbSwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR1cGRhdGVTZWxlY3Rpb24oaW5kZXgpO1xuXHRcdFx0XHRjb25zdCBmcmVlZm9ybSA9IHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChmcmVlZm9ybSkge1xuXHRcdFx0XHRcdGZyZWVmb3JtLnZhbHVlID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVOZXh0T3JTdWJtaXQoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGxpc3RJdGVtLCB7XG5cdFx0XHRcdGNvbnRlbnQ6IG9wdGlvbi5sYWJlbCxcblx0XHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyB9LFxuXHRcdFx0XHRhcHBlYXJhbmNlOiB7IHNob3dQb2ludGVyOiB0cnVlIH1cblx0XHRcdH0pKTtcblxuXHRcdFx0c2VsZWN0Q29udGFpbmVyLmFwcGVuZENoaWxkKGxpc3RJdGVtKTtcblx0XHRcdGxpc3RJdGVtcy5wdXNoKGxpc3RJdGVtKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NpbmdsZVNlbGVjdEl0ZW1zLnNldChxdWVzdGlvbi5pZCwgeyBpdGVtczogbGlzdEl0ZW1zLCBzZWxlY3RlZEluZGV4LCBvcHRpb25JbmRpY2VzOiBvcmRlcmVkT3B0aW9ucy5tYXAobyA9PiBvLm9yaWdpbmFsSW5kZXgpIH0pO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgYXJpYS1hY3RpdmVkZXNjZW5kYW50IGlmIHRoZXJlJ3MgYSBzZWxlY3RlZCBpdGVtXG5cdFx0aWYgKHNlbGVjdGVkSW5kZXggPj0gMCAmJiBzZWxlY3RlZEluZGV4IDwgbGlzdEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50JywgbGlzdEl0ZW1zW3NlbGVjdGVkSW5kZXhdLmlkKTtcblx0XHR9XG5cblx0XHQvLyBTaG93IGZyZWVmb3JtIGlucHV0IG9ubHkgd2hlbiBleHBsaWNpdGx5IGFsbG93ZWRcblx0XHRsZXQgZnJlZWZvcm1UZXh0YXJlYTogSFRNTFRleHRBcmVhRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlc3Rpb24uYWxsb3dGcmVlZm9ybUlucHV0ICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgZnJlZWZvcm1Db250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZnJlZWZvcm0nKTtcblxuXHRcdFx0Y29uc3QgZnJlZWZvcm1OdW1iZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tZnJlZWZvcm0tbnVtYmVyJyk7XG5cdFx0XHRmcmVlZm9ybU51bWJlci50ZXh0Q29udGVudCA9IGAke29yZGVyZWRPcHRpb25zLmxlbmd0aCArIDF9YDtcblx0XHRcdGZyZWVmb3JtQ29udGFpbmVyLmFwcGVuZENoaWxkKGZyZWVmb3JtTnVtYmVyKTtcblxuXHRcdFx0ZnJlZWZvcm1UZXh0YXJlYSA9IGRvbS4kPEhUTUxUZXh0QXJlYUVsZW1lbnQ+KCd0ZXh0YXJlYS5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLXRleHRhcmVhJyk7XG5cdFx0XHRmcmVlZm9ybVRleHRhcmVhLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5lbnRlckN1c3RvbUFuc3dlcicsICdFbnRlciBjdXN0b20gYW5zd2VyJyk7XG5cdFx0XHRmcmVlZm9ybVRleHRhcmVhLnJvd3MgPSAxO1xuXG5cdFx0XHRpZiAocHJldmlvdXNGcmVlZm9ybSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGZyZWVmb3JtVGV4dGFyZWEudmFsdWUgPSBwcmV2aW91c0ZyZWVmb3JtO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXR1cCBhdXRvLXJlc2l6ZSBiZWhhdmlvclxuXHRcdFx0Y29uc3QgYXV0b1Jlc2l6ZSA9IHRoaXMuc2V0dXBUZXh0YXJlYUF1dG9SZXNpemUoZnJlZWZvcm1UZXh0YXJlYSk7XG5cblx0XHRcdC8vIGNsZWFyIHdoZW4gd2Ugc3RhcnQgdHlwaW5nIGluIGZyZWVmb3JtXG5cdFx0XHRjb25zdCBjYXB0dXJlZEZyZWVmb3JtID0gZnJlZWZvcm1UZXh0YXJlYTtcblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FwdHVyZWRGcmVlZm9ybSwgZG9tLkV2ZW50VHlwZS5JTlBVVCwgKCkgPT4ge1xuXHRcdFx0XHRpZiAoY2FwdHVyZWRGcmVlZm9ybS52YWx1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uKC0xKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZnJlZWZvcm1Db250YWluZXIuYXBwZW5kQ2hpbGQoZnJlZWZvcm1UZXh0YXJlYSk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZnJlZWZvcm1Db250YWluZXIpO1xuXHRcdFx0dGhpcy5fZnJlZWZvcm1UZXh0YXJlYXMuc2V0KHF1ZXN0aW9uLmlkLCBmcmVlZm9ybVRleHRhcmVhKTtcblxuXHRcdFx0Ly8gUmVzaXplIHRleHRhcmVhIGlmIGl0IGhhcyByZXN0b3JlZCBjb250ZW50XG5cdFx0XHRpZiAocHJldmlvdXNGcmVlZm9ybSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhjYXB0dXJlZEZyZWVmb3JtKSwgKCkgPT4gYXV0b1Jlc2l6ZSgpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gS2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIGxpc3Rcblx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlbGVjdENvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9zaW5nbGVTZWxlY3RJdGVtcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0aWYgKCFkYXRhIHx8ICFsaXN0SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBuZXdJbmRleCA9IGRhdGEuc2VsZWN0ZWRJbmRleDtcblxuXHRcdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0bmV3SW5kZXggPSBNYXRoLm1pbihkYXRhLnNlbGVjdGVkSW5kZXggKyAxLCBsaXN0SXRlbXMubGVuZ3RoIC0gMSk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdG5ld0luZGV4ID0gTWF0aC5tYXgoZGF0YS5zZWxlY3RlZEluZGV4IC0gMSwgMCk7XG5cdFx0XHR9IGVsc2UgaWYgKChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UpICYmICFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5KSB7XG5cdFx0XHRcdC8vIEVudGVyIGNvbmZpcm1zIGN1cnJlbnQgc2VsZWN0aW9uIGFuZCBhZHZhbmNlcyB0byBuZXh0IHF1ZXN0aW9uXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5oYW5kbGVOZXh0T3JTdWJtaXQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID49IEtleUNvZGUuRGlnaXQxICYmIGV2ZW50LmtleUNvZGUgPD0gS2V5Q29kZS5EaWdpdDkpIHtcblx0XHRcdFx0Ly8gTnVtYmVyIGtleXMgMS05IHNlbGVjdCB0aGUgY29ycmVzcG9uZGluZyBvcHRpb24sIG9yIGZvY3VzIGZyZWVmb3JtIGZvciBuZXh0IG51bWJlclxuXHRcdFx0XHRjb25zdCBudW1iZXJJbmRleCA9IGV2ZW50LmtleUNvZGUgLSBLZXlDb2RlLkRpZ2l0MTtcblx0XHRcdFx0aWYgKG51bWJlckluZGV4IDwgbGlzdEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR1cGRhdGVTZWxlY3Rpb24obnVtYmVySW5kZXgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGZyZWVmb3JtVGV4dGFyZWEgJiYgbnVtYmVySW5kZXggPT09IGxpc3RJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dXBkYXRlU2VsZWN0aW9uKC0xKTtcblx0XHRcdFx0XHRmcmVlZm9ybVRleHRhcmVhLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV3SW5kZXggIT09IGRhdGEuc2VsZWN0ZWRJbmRleCAmJiBuZXdJbmRleCA+PSAwKSB7XG5cdFx0XHRcdHVwZGF0ZVNlbGVjdGlvbihuZXdJbmRleCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZm9jdXMgb24gdGhlIHJvdyB3aGVuIGZpcnN0IHJlbmRlcmVkIG9yIHRleHRhcmVhIGlmIGl0IGhhcyBjb250ZW50XG5cdFx0aWYgKHRoaXMuX3Nob3VsZEF1dG9Gb2N1cygpKSB7XG5cdFx0XHRpZiAoZnJlZWZvcm1UZXh0YXJlYSAmJiBwcmV2aW91c0ZyZWVmb3JtKSB7XG5cdFx0XHRcdGNvbnN0IGNhcHR1cmVkRnJlZWZvcm0gPSBmcmVlZm9ybVRleHRhcmVhO1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20ucnVuQXRUaGlzT3JTY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coY2FwdHVyZWRGcmVlZm9ybSksICgpID0+IHtcblx0XHRcdFx0XHRjYXB0dXJlZEZyZWVmb3JtLmZvY3VzKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSBpZiAobGlzdEl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNJbmRleCA9IHNlbGVjdGVkSW5kZXggPj0gMCA/IHNlbGVjdGVkSW5kZXggOiAwO1xuXHRcdFx0XHQvLyBpZiBubyBkZWZhdWx0IGFuZCBubyBmcmVlZm9ybSB0ZXh0LCBzZWxlY3QgdGhlIGZpcnN0IGFuc3dlclxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRJbmRleCA8IDApIHtcblx0XHRcdFx0XHR1cGRhdGVTZWxlY3Rpb24oMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHNlbGVjdENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0XHRsaXN0SXRlbXNbZm9jdXNJbmRleF0/LmZvY3VzKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck11bHRpU2VsZWN0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3JkZXJlZE9wdGlvbnMgPSBnZXRPcHRpb25zV2l0aERlZmF1bHRzRmlyc3QocXVlc3Rpb24pO1xuXHRcdGNvbnN0IHNlbGVjdENvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0Jyk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Ym94Jyk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1tdWx0aXNlbGVjdGFibGUnLCAndHJ1ZScpO1xuXHRcdHNlbGVjdENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBxdWVzdGlvbi50aXRsZSk7XG5cdFx0c2VsZWN0Q29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc2VsZWN0Q29udGFpbmVyKTtcblxuXHRcdC8vIFJlc3RvcmUgcHJldmlvdXMgYW5zd2VyIGlmIGV4aXN0c1xuXHRcdGNvbnN0IHByZXZpb3VzQW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdGNvbnN0IHByZXZNdWx0aSA9IHR5cGVvZiBwcmV2aW91c0Fuc3dlciA9PT0gJ29iamVjdCcgJiYgcHJldmlvdXNBbnN3ZXIgIT09IG51bGwgJiYgaGFzS2V5KHByZXZpb3VzQW5zd2VyLCB7IHNlbGVjdGVkVmFsdWVzOiB0cnVlIH0pID8gcHJldmlvdXNBbnN3ZXIgYXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmV2aW91c0ZyZWVmb3JtID0gcHJldk11bHRpPy5mcmVlZm9ybVZhbHVlO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMgPSBwcmV2TXVsdGk/LnNlbGVjdGVkVmFsdWVzID8/IFtdO1xuXG5cdFx0Ly8gR2V0IGRlZmF1bHQgb3B0aW9uIGlkcyAoZm9yIG11bHRpU2VsZWN0LCBkZWZhdWx0VmFsdWUgY2FuIGJlIHN0cmluZyBvciBzdHJpbmdbXSlcblx0XHRjb25zdCBkZWZhdWx0T3B0aW9uSWRzOiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkocXVlc3Rpb24uZGVmYXVsdFZhbHVlKVxuXHRcdFx0PyBxdWVzdGlvbi5kZWZhdWx0VmFsdWVcblx0XHRcdDogKHR5cGVvZiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09ICdzdHJpbmcnID8gW3F1ZXN0aW9uLmRlZmF1bHRWYWx1ZV0gOiBbXSk7XG5cblx0XHRjb25zdCBjaGVja2JveGVzOiBDaGVja2JveFtdID0gW107XG5cdFx0Y29uc3QgbGlzdEl0ZW1zOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0bGV0IGZvY3VzZWRJbmRleCA9IDA7XG5cdFx0bGV0IGZpcnN0Q2hlY2tlZEluZGV4ID0gLTE7XG5cblx0XHRvcmRlcmVkT3B0aW9ucy5mb3JFYWNoKCh7IG9wdGlvbiB9LCBpbmRleCkgPT4ge1xuXHRcdFx0Ly8gRGV0ZXJtaW5lIGluaXRpYWwgY2hlY2tlZCBzdGF0ZVxuXHRcdFx0bGV0IGlzQ2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0aWYgKHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMgJiYgcHJldmlvdXNTZWxlY3RlZFZhbHVlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGlzQ2hlY2tlZCA9IHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMuaW5jbHVkZXMob3B0aW9uLnZhbHVlKTtcblx0XHRcdH0gZWxzZSBpZiAoIXByZXZpb3VzRnJlZWZvcm0gJiYgZGVmYXVsdE9wdGlvbklkcy5pbmNsdWRlcyhvcHRpb24uaWQpKSB7XG5cdFx0XHRcdGlzQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpc3RJdGVtID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWxpc3QtaXRlbS5tdWx0aS1zZWxlY3QnKTtcblx0XHRcdGxpc3RJdGVtLnNldEF0dHJpYnV0ZSgncm9sZScsICdvcHRpb24nKTtcblx0XHRcdGxpc3RJdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhpc0NoZWNrZWQpKTtcblx0XHRcdGxpc3RJdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwub3B0aW9uTGFiZWwnLCBcIk9wdGlvbiB7MH06IHsxfVwiLCBpbmRleCArIDEsIG9wdGlvbi5sYWJlbCkpO1xuXHRcdFx0bGlzdEl0ZW0uaWQgPSBgb3B0aW9uLSR7cXVlc3Rpb24uaWR9LSR7aW5kZXh9YDtcblx0XHRcdGxpc3RJdGVtLnRhYkluZGV4ID0gLTE7XG5cblx0XHRcdGNvbnN0IG51bWJlciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1saXN0LW51bWJlcicpO1xuXHRcdFx0bnVtYmVyLnRleHRDb250ZW50ID0gYCR7aW5kZXggKyAxfWA7XG5cdFx0XHRsaXN0SXRlbS5hcHBlbmRDaGlsZChudW1iZXIpO1xuXG5cdFx0XHQvLyBDcmVhdGUgY2hlY2tib3ggdXNpbmcgdGhlIFZTIENvZGUgQ2hlY2tib3ggY29tcG9uZW50XG5cdFx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMuX2lucHV0Qm94ZXMuYWRkKG5ldyBDaGVja2JveChvcHRpb24ubGFiZWwsIGlzQ2hlY2tlZCwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdFx0XHRjaGVja2JveC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcXVlc3Rpb24tbGlzdC1jaGVja2JveCcpO1xuXHRcdFx0Ly8gUmVtb3ZlIGNoZWNrYm94IGZyb20gdGFiIG9yZGVyIHNpbmNlIGxpc3QgaXRlbXMgYXJlIG5hdmlnYWJsZSB3aXRoIGFycm93IGtleXNcblx0XHRcdGNoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHRcdGxpc3RJdGVtLmFwcGVuZENoaWxkKGNoZWNrYm94LmRvbU5vZGUpO1xuXG5cdFx0XHQvLyBMYWJlbCB3aXRoIG9wdGlvbmFsIGRlc2NyaXB0aW9uIChmb3JtYXQ6IFwiVGl0bGUgLSBEZXNjcmlwdGlvblwiKVxuXHRcdFx0Y29uc3QgbGFiZWwgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tbGlzdC1sYWJlbCcpO1xuXHRcdFx0Y29uc3Qgc2VwYXJhdG9ySW5kZXggPSBvcHRpb24ubGFiZWwuaW5kZXhPZignIC0gJyk7XG5cdFx0XHRpZiAoc2VwYXJhdG9ySW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGxpc3RJdGVtLmNsYXNzTGlzdC5hZGQoJ2hhcy1kZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRjb25zdCB0aXRsZVNwYW4gPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLWxpc3QtbGFiZWwtdGl0bGUnKTtcblx0XHRcdFx0dGl0bGVTcGFuLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsLnN1YnN0cmluZygwLCBzZXBhcmF0b3JJbmRleCk7XG5cdFx0XHRcdGxhYmVsLmFwcGVuZENoaWxkKHRpdGxlU3Bhbik7XG5cblx0XHRcdFx0Y29uc3QgZGVzY1NwYW4gPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLWxpc3QtbGFiZWwtZGVzYycpO1xuXHRcdFx0XHRkZXNjU3Bhbi50ZXh0Q29udGVudCA9IG9wdGlvbi5sYWJlbC5zdWJzdHJpbmcoc2VwYXJhdG9ySW5kZXggKyAzKTtcblx0XHRcdFx0bGFiZWwuYXBwZW5kQ2hpbGQoZGVzY1NwYW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBvcHRpb24ubGFiZWw7XG5cdFx0XHR9XG5cdFx0XHRsaXN0SXRlbS5hcHBlbmRDaGlsZChsYWJlbCk7XG5cblx0XHRcdGlmIChpc0NoZWNrZWQpIHtcblx0XHRcdFx0bGlzdEl0ZW0uY2xhc3NMaXN0LmFkZCgnY2hlY2tlZCcpO1xuXHRcdFx0XHRpZiAoZmlyc3RDaGVja2VkSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Zmlyc3RDaGVja2VkSW5kZXggPSBpbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIGNoZWNrYm94IHN0YXRlIHdpdGggbGlzdCBpdGVtIHZpc3VhbCBzdGF0ZVxuXHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRsaXN0SXRlbS5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja2VkJywgY2hlY2tib3guY2hlY2tlZCk7XG5cdFx0XHRcdGxpc3RJdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhjaGVja2JveC5jaGVja2VkKSk7XG5cdFx0XHRcdHRoaXMuc2F2ZUN1cnJlbnRBbnN3ZXIoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gQ2xpY2sgaGFuZGxlciBmb3IgdGhlIGVudGlyZSByb3cgKHRvZ2dsZSBjaGVja2JveClcblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobGlzdEl0ZW0sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdC8vIFVwZGF0ZSBmb2N1c2VkSW5kZXggd2hlbiBjbGlja2luZyBhIHJvd1xuXHRcdFx0XHRmb2N1c2VkSW5kZXggPSBpbmRleDtcblx0XHRcdFx0Ly8gRG9uJ3QgdG9nZ2xlIGlmIHRoZSBjbGljayB3YXMgb24gdGhlIGNoZWNrYm94IGl0c2VsZiAoaXQgaGFuZGxlcyBpdHNlbGYpXG5cdFx0XHRcdGlmIChlLnRhcmdldCAhPT0gY2hlY2tib3guZG9tTm9kZSAmJiAhY2hlY2tib3guZG9tTm9kZS5jb250YWlucyhlLnRhcmdldCBhcyBOb2RlKSkge1xuXHRcdFx0XHRcdC8vIFVzZSBjbGljaygpIHRvIHRyaWdnZXIgb25DaGFuZ2UgYW5kIHN5bmMgdmlzdWFsIHN0YXRlXG5cdFx0XHRcdFx0Y2hlY2tib3guZG9tTm9kZS5jbGljaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihsaXN0SXRlbSwge1xuXHRcdFx0XHRjb250ZW50OiBvcHRpb24ubGFiZWwsXG5cdFx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1cgfSxcblx0XHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHNlbGVjdENvbnRhaW5lci5hcHBlbmRDaGlsZChsaXN0SXRlbSk7XG5cdFx0XHRjaGVja2JveGVzLnB1c2goY2hlY2tib3gpO1xuXHRcdFx0bGlzdEl0ZW1zLnB1c2gobGlzdEl0ZW0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fbXVsdGlTZWxlY3RDaGVja2JveGVzLnNldChxdWVzdGlvbi5pZCwgeyBjaGVja2JveGVzLCBvcHRpb25JbmRpY2VzOiBvcmRlcmVkT3B0aW9ucy5tYXAobyA9PiBvLm9yaWdpbmFsSW5kZXgpIH0pO1xuXG5cdFx0Ly8gU2hvdyBmcmVlZm9ybSBpbnB1dCBvbmx5IHdoZW4gZXhwbGljaXRseSBhbGxvd2VkXG5cdFx0bGV0IGZyZWVmb3JtVGV4dGFyZWE6IEhUTUxUZXh0QXJlYUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCAhPT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IGZyZWVmb3JtQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtJyk7XG5cblx0XHRcdC8vIE51bWJlciBpbmRpY2F0b3IgZm9yIGZyZWVmb3JtIChjb21lcyBhZnRlciBhbGwgb3B0aW9ucylcblx0XHRcdGNvbnN0IGZyZWVmb3JtTnVtYmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWZyZWVmb3JtLW51bWJlcicpO1xuXHRcdFx0ZnJlZWZvcm1OdW1iZXIudGV4dENvbnRlbnQgPSBgJHtvcmRlcmVkT3B0aW9ucy5sZW5ndGggKyAxfWA7XG5cdFx0XHRmcmVlZm9ybUNvbnRhaW5lci5hcHBlbmRDaGlsZChmcmVlZm9ybU51bWJlcik7XG5cblx0XHRcdGZyZWVmb3JtVGV4dGFyZWEgPSBkb20uJDxIVE1MVGV4dEFyZWFFbGVtZW50PigndGV4dGFyZWEuY2hhdC1xdWVzdGlvbi1mcmVlZm9ybS10ZXh0YXJlYScpO1xuXHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZW50ZXJDdXN0b21BbnN3ZXInLCAnRW50ZXIgY3VzdG9tIGFuc3dlcicpO1xuXHRcdFx0ZnJlZWZvcm1UZXh0YXJlYS5yb3dzID0gMTtcblxuXHRcdFx0aWYgKHByZXZpb3VzRnJlZWZvcm0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRmcmVlZm9ybVRleHRhcmVhLnZhbHVlID0gcHJldmlvdXNGcmVlZm9ybTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0dXAgYXV0by1yZXNpemUgYmVoYXZpb3Jcblx0XHRcdGNvbnN0IGF1dG9SZXNpemUgPSB0aGlzLnNldHVwVGV4dGFyZWFBdXRvUmVzaXplKGZyZWVmb3JtVGV4dGFyZWEpO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmcmVlZm9ybVRleHRhcmVhLCBkb20uRXZlbnRUeXBlLklOUFVULCAoKSA9PiB0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCkpKTtcblxuXHRcdFx0ZnJlZWZvcm1Db250YWluZXIuYXBwZW5kQ2hpbGQoZnJlZWZvcm1UZXh0YXJlYSk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZnJlZWZvcm1Db250YWluZXIpO1xuXHRcdFx0dGhpcy5fZnJlZWZvcm1UZXh0YXJlYXMuc2V0KHF1ZXN0aW9uLmlkLCBmcmVlZm9ybVRleHRhcmVhKTtcblxuXHRcdFx0Ly8gUmVzaXplIHRleHRhcmVhIGlmIGl0IGhhcyByZXN0b3JlZCBjb250ZW50XG5cdFx0XHRpZiAocHJldmlvdXNGcmVlZm9ybSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhmcmVlZm9ybVRleHRhcmVhKSwgKCkgPT4gYXV0b1Jlc2l6ZSgpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gS2V5Ym9hcmQgbmF2aWdhdGlvbiBmb3IgdGhlIGxpc3Rcblx0XHR0aGlzLl9pbnB1dEJveGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlbGVjdENvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0Ly8gR3VhcmQgYWdhaW5zdCBlbXB0eSBsaXN0XG5cdFx0XHRpZiAoIWxpc3RJdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRmb2N1c2VkSW5kZXggPSBNYXRoLm1pbihmb2N1c2VkSW5kZXggKyAxLCBsaXN0SXRlbXMubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdGxpc3RJdGVtc1tmb2N1c2VkSW5kZXhdLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdykge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGZvY3VzZWRJbmRleCA9IE1hdGgubWF4KGZvY3VzZWRJbmRleCAtIDEsIDApO1xuXHRcdFx0XHRsaXN0SXRlbXNbZm9jdXNlZEluZGV4XS5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyICYmICFldmVudC5tZXRhS2V5ICYmICFldmVudC5jdHJsS2V5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5oYW5kbGVOZXh0T3JTdWJtaXQoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdC8vIFRvZ2dsZSB0aGUgY3VycmVudGx5IGZvY3VzZWQgY2hlY2tib3ggdXNpbmcgY2xpY2soKSB0byB0cmlnZ2VyIG9uQ2hhbmdlXG5cdFx0XHRcdGlmIChmb2N1c2VkSW5kZXggPj0gMCAmJiBmb2N1c2VkSW5kZXggPCBjaGVja2JveGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNoZWNrYm94ZXNbZm9jdXNlZEluZGV4XS5kb21Ob2RlLmNsaWNrKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MSAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuRGlnaXQ5KSB7XG5cdFx0XHRcdC8vIE51bWJlciBrZXlzIDEtOSB0b2dnbGUgdGhlIGNvcnJlc3BvbmRpbmcgY2hlY2tib3gsIG9yIGZvY3VzIGZyZWVmb3JtIGZvciBuZXh0IG51bWJlclxuXHRcdFx0XHRjb25zdCBudW1iZXJJbmRleCA9IGV2ZW50LmtleUNvZGUgLSBLZXlDb2RlLkRpZ2l0MTtcblx0XHRcdFx0aWYgKG51bWJlckluZGV4IDwgY2hlY2tib3hlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0Y2hlY2tib3hlc1tudW1iZXJJbmRleF0uZG9tTm9kZS5jbGljaygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGZyZWVmb3JtVGV4dGFyZWEgJiYgbnVtYmVySW5kZXggPT09IGNoZWNrYm94ZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGZyZWVmb3JtVGV4dGFyZWEuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEZvY3VzIG9uIHRoZSBhcHByb3ByaWF0ZSByb3cgd2hlbiByZW5kZXJlZCBvciB0ZXh0YXJlYSBpZiBpdCBoYXMgY29udGVudFxuXHRcdGlmICh0aGlzLl9zaG91bGRBdXRvRm9jdXMoKSkge1xuXHRcdFx0aWYgKGZyZWVmb3JtVGV4dGFyZWEgJiYgcHJldmlvdXNGcmVlZm9ybSkge1xuXHRcdFx0XHRjb25zdCBjYXB0dXJlZEZyZWVmb3JtID0gZnJlZWZvcm1UZXh0YXJlYTtcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hlcy5hZGQoZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGNhcHR1cmVkRnJlZWZvcm0pLCAoKSA9PiB7XG5cdFx0XHRcdFx0Y2FwdHVyZWRGcmVlZm9ybS5mb2N1cygpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpc3RJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxGb2N1c0luZGV4ID0gZmlyc3RDaGVja2VkSW5kZXggPj0gMCA/IGZpcnN0Q2hlY2tlZEluZGV4IDogMDtcblx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gaW5pdGlhbEZvY3VzSW5kZXg7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94ZXMuYWRkKGRvbS5ydW5BdFRoaXNPclNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhzZWxlY3RDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0bGlzdEl0ZW1zW2luaXRpYWxGb2N1c0luZGV4XT8uZm9jdXMoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VycmVudEFuc3dlcigpOiBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHF1ZXN0aW9uID0gdGhpcy5jYXJvdXNlbC5xdWVzdGlvbnNbdGhpcy5fY3VycmVudEluZGV4XTtcblx0XHRpZiAoIXF1ZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAocXVlc3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSAndGV4dCc6IHtcblx0XHRcdFx0Y29uc3QgaW5wdXRCb3ggPSB0aGlzLl90ZXh0SW5wdXRCb3hlcy5nZXQocXVlc3Rpb24uaWQpO1xuXHRcdFx0XHRyZXR1cm4gaW5wdXRCb3g/LnZhbHVlID8/ICh0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA6IEFycmF5LmlzQXJyYXkocXVlc3Rpb24uZGVmYXVsdFZhbHVlKSA/IHsgc2VsZWN0ZWRWYWx1ZXM6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSB9IDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnc2luZ2xlU2VsZWN0Jzoge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5fc2luZ2xlU2VsZWN0SXRlbXMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRcdFx0bGV0IHNlbGVjdGVkVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGRhdGEgJiYgZGF0YS5zZWxlY3RlZEluZGV4ID49IDApIHtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbEluZGV4ID0gZGF0YS5vcHRpb25JbmRpY2VzW2RhdGEuc2VsZWN0ZWRJbmRleF07XG5cdFx0XHRcdFx0c2VsZWN0ZWRWYWx1ZSA9IG9yaWdpbmFsSW5kZXggIT09IHVuZGVmaW5lZCA/IHF1ZXN0aW9uLm9wdGlvbnM/LltvcmlnaW5hbEluZGV4XT8udmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRmluZCBkZWZhdWx0IG9wdGlvbiBpZiBub3RoaW5nIHNlbGVjdGVkIChkZWZhdWx0VmFsdWUgaXMgdGhlIG9wdGlvbiBpZClcblx0XHRcdFx0aWYgKHNlbGVjdGVkVmFsdWUgPT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgcXVlc3Rpb24uZGVmYXVsdFZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRPcHRpb24gPSBxdWVzdGlvbi5vcHRpb25zPy5maW5kKG9wdCA9PiBvcHQuaWQgPT09IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSk7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWYWx1ZSA9IGRlZmF1bHRPcHRpb24/LnZhbHVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRm9yIHNpbmdsZS1zZWxlY3Q6IGlmIGZyZWVmb3JtIGlzIHByb3ZpZGVkLCB1c2UgT05MWSBmcmVlZm9ybSAoaWdub3JlIHNlbGVjdGlvbilcblx0XHRcdFx0Y29uc3QgZnJlZWZvcm1UZXh0YXJlYSA9IHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRcdGNvbnN0IGZyZWVmb3JtVmFsdWUgPSBmcmVlZm9ybVRleHRhcmVhPy52YWx1ZSAhPT0gJycgPyBmcmVlZm9ybVRleHRhcmVhPy52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGZyZWVmb3JtVmFsdWUpIHtcblx0XHRcdFx0XHQvLyBGcmVlZm9ybSB0YWtlcyBwcmlvcml0eSAtIGlnbm9yZSBzZWxlY3RlZFZhbHVlXG5cdFx0XHRcdFx0cmV0dXJuIHsgc2VsZWN0ZWRWYWx1ZTogdW5kZWZpbmVkLCBmcmVlZm9ybVZhbHVlIH0gc2F0aXNmaWVzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzZWxlY3RlZFZhbHVlLCBmcmVlZm9ybVZhbHVlOiB1bmRlZmluZWQgfSBzYXRpc2ZpZXMgSUNoYXRTaW5nbGVTZWxlY3RBbnN3ZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSAnbXVsdGlTZWxlY3QnOiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9tdWx0aVNlbGVjdENoZWNrYm94ZXMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRWYWx1ZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0ZGF0YS5jaGVja2JveGVzLmZvckVhY2goKGNoZWNrYm94LCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGNoZWNrYm94LmNoZWNrZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxJbmRleCA9IGRhdGEub3B0aW9uSW5kaWNlc1tpbmRleF07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gb3JpZ2luYWxJbmRleCAhPT0gdW5kZWZpbmVkID8gcXVlc3Rpb24ub3B0aW9ucz8uW29yaWdpbmFsSW5kZXhdPy52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRzZWxlY3RlZFZhbHVlcy5wdXNoKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWx3YXlzIGluY2x1ZGUgZnJlZWZvcm0gdmFsdWUgZm9yIG11bHRpLXNlbGVjdCBxdWVzdGlvbnNcblx0XHRcdFx0Y29uc3QgZnJlZWZvcm1UZXh0YXJlYSA9IHRoaXMuX2ZyZWVmb3JtVGV4dGFyZWFzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRcdGNvbnN0IGZyZWVmb3JtVmFsdWUgPSBmcmVlZm9ybVRleHRhcmVhPy52YWx1ZSAhPT0gJycgPyBmcmVlZm9ybVRleHRhcmVhPy52YWx1ZSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBSZXR1cm4gd2hhdGV2ZXIgd2FzIHNlbGVjdGVkIC0gZGVmYXVsdHMgYXJlIGFwcGxpZWQgYXQgcmVuZGVyIHRpbWUgd2hlblxuXHRcdFx0XHQvLyBjaGVja2JveGVzIGFyZSBpbml0aWFsbHkgY2hlY2tlZCwgc28gZW1wdHkgc2VsZWN0aW9uIG1lYW5zIHVzZXIgdW5jaGVja2VkIGFsbFxuXHRcdFx0XHRpZiAoZnJlZWZvcm1WYWx1ZSB8fCBzZWxlY3RlZFZhbHVlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2VsZWN0ZWRWYWx1ZXMsIGZyZWVmb3JtVmFsdWUgfSBzYXRpc2ZpZXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZW9mIHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSA9PT0gJ3N0cmluZycgPyBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgOiBBcnJheS5pc0FycmF5KHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSkgPyB7IHNlbGVjdGVkVmFsdWVzOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgfSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBhIHRlcm1pbmFsLXN0YXRlIG1lc3NhZ2UgKFNraXBwZWQvQW5zd2VyZWQpIHdoZW4gdGhlIGNhcm91c2VsIGlzXG5cdCAqIGRpc21pc3NlZCB3aXRob3V0IHN0cnVjdHVyZWQgYW5zd2Vycy5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyVGVybWluYWxTdGF0ZU1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VtbWFyeUNvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1zdW1tYXJ5Jyk7XG5cdFx0Y29uc3QgaXNEaXNtaXNzZWRCeVRlcm1pbmFsID0gdGhpcy5jYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSAmJiB0aGlzLmNhcm91c2VsLmRpc21pc3NlZEJ5VGVybWluYWxJbnB1dDtcblx0XHRpZiAodGhpcy5jYXJvdXNlbC5hbnN3ZXJlZEV4dGVybmFsbHkpIHtcblx0XHRcdGNvbnN0IGFuc3dlcmVkTWVzc2FnZSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWFuc3dlcmVkJyk7XG5cdFx0XHRhbnN3ZXJlZE1lc3NhZ2UudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmFuc3dlcmVkJywgJ0Fuc3dlcmVkJyk7XG5cdFx0XHRzdW1tYXJ5Q29udGFpbmVyLmFwcGVuZENoaWxkKGFuc3dlcmVkTWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNraXBwZWRNZXNzYWdlID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktc2tpcHBlZCcpO1xuXHRcdFx0c2tpcHBlZE1lc3NhZ2UudGV4dENvbnRlbnQgPSBpc0Rpc21pc3NlZEJ5VGVybWluYWxcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmRlZmVycmVkVG9UZXJtaW5hbCcsIFwiRGVmZXJyaW5nIHRvIHVzZXIncyBpbnB1dCBpbiB0aGUgdGVybWluYWxcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnNraXBwZWQnLCAnU2tpcHBlZCBxdWVzdGlvbicpO1xuXHRcdFx0c3VtbWFyeUNvbnRhaW5lci5hcHBlbmRDaGlsZChza2lwcGVkTWVzc2FnZSk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChzdW1tYXJ5Q29udGFpbmVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIGEgc3VtbWFyeSBvZiBhbnN3ZXJzIHdoZW4gdGhlIGNhcm91c2VsIGlzIGFscmVhZHkgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyU3VtbWFyeSgpOiB2b2lkIHtcblx0XHQvLyBJZiBubyBhbnN3ZXJzLCBzaG93IHRoZSB0ZXJtaW5hbC1zdGF0ZSAoU2tpcHBlZC9BbnN3ZXJlZCkgbWVzc2FnZVxuXHRcdGlmICh0aGlzLl9hbnN3ZXJzLnNpemUgPT09IDApIHtcblx0XHRcdGlmICh0aGlzLmNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9PT0gJ2NvbnZlcnNhdGlvbicpIHtcblx0XHRcdFx0aWYgKHRoaXMuY2Fyb3VzZWwuYXV0b1JlcGx5KSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJDb252ZXJzYXRpb25TdW1tYXJ5KHtcblx0XHRcdFx0XHRcdGFuc3dlckZhbGxiYWNrOiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmFuc3dlcmVkQXV0b21hdGljYWxseScsIFwiQW5zd2VyZWQgYXV0b21hdGljYWxseVwiKSxcblx0XHRcdFx0XHRcdGFuc3dlckljb246IENvZGljb24uY29waWxvdENvbXBhY3QsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jYXJvdXNlbC5hbnN3ZXJlZEV4dGVybmFsbHkpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlclRlcm1pbmFsU3RhdGVNZXNzYWdlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5jYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckNvbnZlcnNhdGlvblN1bW1hcnkoe1xuXHRcdFx0XHRcdFx0YW5zd2VyRmFsbGJhY2s6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc2tpcHBlZENvbnZlcnNhdGlvbicsIFwiU2tpcHBlZCBxdWVzdGlvblwiKSxcblx0XHRcdFx0XHRcdGFuc3dlckljb246IENvZGljb24uY2xvc2VDb21wYWN0LFxuXHRcdFx0XHRcdFx0aGlkZUFuc3dlclByZWZpeDogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJUZXJtaW5hbFN0YXRlTWVzc2FnZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9PT0gJ2NvbnZlcnNhdGlvbicpIHtcblx0XHRcdHRoaXMucmVuZGVyQ29udmVyc2F0aW9uU3VtbWFyeSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1bW1hcnlDb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtc3VtbWFyeScpO1xuXG5cdFx0Zm9yIChjb25zdCBxdWVzdGlvbiBvZiB0aGlzLmNhcm91c2VsLnF1ZXN0aW9ucykge1xuXHRcdFx0Y29uc3QgYW5zd2VyID0gdGhpcy5fYW5zd2Vycy5nZXQocXVlc3Rpb24uaWQpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5SXRlbSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWl0ZW0nKTtcblxuXHRcdFx0Y29uc3QgcXVlc3Rpb25Sb3cgPSBkb20uJCgnZGl2LmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1sYWJlbCcpO1xuXHRcdFx0Y29uc3QgcXVlc3Rpb25UZXh0ID0gZ2V0RGlzcGxheWVkUXVlc3Rpb25UZXh0KHF1ZXN0aW9uKTtcblx0XHRcdGxldCBsYWJlbFRleHQgPSB0eXBlb2YgcXVlc3Rpb25UZXh0ID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uVGV4dCA6IHF1ZXN0aW9uVGV4dC52YWx1ZTtcblx0XHRcdGxhYmVsVGV4dCA9IGxhYmVsVGV4dC5yZXBsYWNlKC9bOlxcc10rJC8sICcnKTtcblx0XHRcdHF1ZXN0aW9uUm93LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5zdW1tYXJ5UXVlc3Rpb24nLCAnUTogezB9JywgbGFiZWxUZXh0KTtcblx0XHRcdHN1bW1hcnlJdGVtLmFwcGVuZENoaWxkKHF1ZXN0aW9uUm93KTtcblxuXHRcdFx0aWYgKGFuc3dlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGZvcm1hdHRlZEFuc3dlciA9IHRoaXMuZm9ybWF0QW5zd2VyRm9yU3VtbWFyeShxdWVzdGlvbiwgYW5zd2VyKTtcblx0XHRcdFx0Y29uc3QgYW5zd2VyUm93ID0gZG9tLiQoJ2Rpdi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktYW5zd2VyLXRpdGxlJyk7XG5cdFx0XHRcdGFuc3dlclJvdy50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc3VtbWFyeUFuc3dlcicsICdBOiB7MH0nLCBmb3JtYXR0ZWRBbnN3ZXIpO1xuXHRcdFx0XHRzdW1tYXJ5SXRlbS5hcHBlbmRDaGlsZChhbnN3ZXJSb3cpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdW5hbnN3ZXJlZCA9IGRvbS4kKCdkaXYuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXVuYW5zd2VyZWQnKTtcblx0XHRcdFx0dW5hbnN3ZXJlZC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubm90QW5zd2VyZWRZZXQnLCAnTm90IGFuc3dlcmVkIHlldCcpO1xuXHRcdFx0XHRzdW1tYXJ5SXRlbS5hcHBlbmRDaGlsZCh1bmFuc3dlcmVkKTtcblx0XHRcdH1cblxuXHRcdFx0c3VtbWFyeUNvbnRhaW5lci5hcHBlbmRDaGlsZChzdW1tYXJ5SXRlbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHN1bW1hcnlDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb252ZXJzYXRpb25TdW1tYXJ5KG9wdGlvbnM/OiB7IGFuc3dlckZhbGxiYWNrPzogc3RyaW5nOyBhbnN3ZXJJY29uPzogVGhlbWVJY29uOyBoaWRlQW5zd2VyUHJlZml4PzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VtbWFyeVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2ludGVyYWN0aXZlVUlTdG9yZS52YWx1ZSA9IHN1bW1hcnlTdG9yZTtcblx0XHRjb25zdCBzdW1tYXJ5Q29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXN1bW1hcnkuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC1jb252ZXJzYXRpb24tc3VtbWFyeScpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmFuc3dlcmVkUXVlc3Rpb25zJywgXCJBbnN3ZXJlZCBjaGF0IHF1ZXN0aW9uc1wiKSk7XG5cblx0XHRmb3IgKGNvbnN0IHF1ZXN0aW9uIG9mIHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zKSB7XG5cdFx0XHRjb25zdCBhbnN3ZXIgPSB0aGlzLl9hbnN3ZXJzLmdldChxdWVzdGlvbi5pZCk7XG5cdFx0XHRjb25zdCBzdW1tYXJ5SXRlbSA9IGRvbS4kKCcuY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LWl0ZW0nKTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uVmFsdWUgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1xdWVzdGlvbicpO1xuXHRcdFx0Y29uc3QgcXVlc3Rpb25UZXh0ID0gZ2V0RGlzcGxheWVkUXVlc3Rpb25UZXh0KHF1ZXN0aW9uKTtcblx0XHRcdGNvbnN0IGRpc3BsYXllZFF1ZXN0aW9uID0gKHR5cGVvZiBxdWVzdGlvblRleHQgPT09ICdzdHJpbmcnID8gcXVlc3Rpb25UZXh0IDogcXVlc3Rpb25UZXh0LnZhbHVlKS5yZXBsYWNlKC9bOlxcc10rJC8sICcnKTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uUHJlZml4ID0gZG9tLiQoJ3NwYW4uY2hhdC1xdWVzdGlvbi1zdW1tYXJ5LXByZWZpeCcpO1xuXHRcdFx0cXVlc3Rpb25QcmVmaXgudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnF1ZXN0aW9uUHJlZml4JywgXCJRdWVzdGlvbjpcIik7XG5cdFx0XHRjb25zdCBxdWVzdGlvblRleHRWYWx1ZSA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1xdWVzdGlvbi12YWx1ZScpO1xuXHRcdFx0cXVlc3Rpb25UZXh0VmFsdWUudGV4dENvbnRlbnQgPSBkaXNwbGF5ZWRRdWVzdGlvbjtcblx0XHRcdHN1bW1hcnlTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHF1ZXN0aW9uVGV4dFZhbHVlLCB7IGNvbnRlbnQ6IGRpc3BsYXllZFF1ZXN0aW9uIH0pKTtcblx0XHRcdHF1ZXN0aW9uVmFsdWUuYXBwZW5kKHF1ZXN0aW9uUHJlZml4LCBxdWVzdGlvblZhbHVlLm93bmVyRG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnKSwgcXVlc3Rpb25UZXh0VmFsdWUpO1xuXHRcdFx0c3VtbWFyeUl0ZW0uYXBwZW5kQ2hpbGQocXVlc3Rpb25WYWx1ZSk7XG5cblx0XHRcdGNvbnN0IGRlY2lzaW9uID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktZGVjaXNpb24nKTtcblx0XHRcdGNvbnN0IGFuc3dlclZhbHVlID0gYW5zd2VyID09PSB1bmRlZmluZWRcblx0XHRcdFx0PyBvcHRpb25zPy5hbnN3ZXJGYWxsYmFjayA/PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmNvbnZlcnNhdGlvbk5vdEFuc3dlcmVkJywgXCJOb3QgYW5zd2VyZWQgeWV0XCIpXG5cdFx0XHRcdDogdGhpcy5mb3JtYXRBbnN3ZXJGb3JTdW1tYXJ5KHF1ZXN0aW9uLCBhbnN3ZXIpO1xuXHRcdFx0Y29uc3QgYW5zd2VyUHJlZml4ID0gb3B0aW9ucz8uaGlkZUFuc3dlclByZWZpeCA/IHVuZGVmaW5lZCA6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuYW5zd2VyUHJlZml4JywgXCJBbnN3ZXJlZDpcIik7XG5cdFx0XHRjb25zdCBhbnN3ZXJUaXRsZSA9IGFuc3dlclByZWZpeFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuY29udmVyc2F0aW9uQW5zd2VyJywgXCJ7MH0gezF9XCIsIGFuc3dlclByZWZpeCwgYW5zd2VyVmFsdWUpXG5cdFx0XHRcdDogYW5zd2VyVmFsdWU7XG5cdFx0XHRjb25zdCBjb2xsYXBzaWJsZUNvbnRleHQgPSB7XG5cdFx0XHRcdC4uLnRoaXMuX2NvbnRleHQsXG5cdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX2NvbnRleHQuY29udGVudCA/PyBbXSxcblx0XHRcdFx0Y29udGVudEluZGV4OiB0aGlzLl9jb250ZXh0LmNvbnRlbnRJbmRleCA/PyAwLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFuc3dlclBhcnQgPSBzdW1tYXJ5U3RvcmUuYWRkKG5ldyBDaGF0UXVlc3Rpb25BbnN3ZXJDb2xsYXBzaWJsZVBhcnQoXG5cdFx0XHRcdGFuc3dlclRpdGxlLFxuXHRcdFx0XHRhbnN3ZXJQcmVmaXgsXG5cdFx0XHRcdGFuc3dlclZhbHVlLFxuXHRcdFx0XHRvcHRpb25zPy5hbnN3ZXJJY29uID8/ICh0aGlzLmNhcm91c2VsLmF1dG9SZXBseSA/IENvZGljb24uY29waWxvdENvbXBhY3QgOiBDb2RpY29uLmNvbW1lbnQpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZUNvbnRleHQsXG5cdFx0XHRcdHF1ZXN0aW9uLm9wdGlvbnM/Lmxlbmd0aCA/ICgpID0+IHRoaXMucmVuZGVyQ29udmVyc2F0aW9uT3B0aW9ucyhxdWVzdGlvbiwgYW5zd2VyKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0KCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpLFxuXHRcdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0XHRhbnN3ZXJQYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC1xdWVzdGlvbi1hbnN3ZXItY29sbGFwc2libGUnKTtcblx0XHRcdGRlY2lzaW9uLmFwcGVuZENoaWxkKGFuc3dlclBhcnQuZG9tTm9kZSk7XG5cdFx0XHRzdW1tYXJ5SXRlbS5hcHBlbmRDaGlsZChkZWNpc2lvbik7XG5cdFx0XHRzdW1tYXJ5Q29udGFpbmVyLmFwcGVuZENoaWxkKHN1bW1hcnlJdGVtKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoc3VtbWFyeUNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbnZlcnNhdGlvbk9wdGlvbnMocXVlc3Rpb246IElDaGF0UXVlc3Rpb24sIGFuc3dlcjogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlIHwgdW5kZWZpbmVkKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHNlbGVjdGVkVmFsdWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IGZyZWVmb3JtVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHNlbGVjdGVkVmFsdWVzLmFkZChhbnN3ZXIpO1xuXHRcdH0gZWxzZSBpZiAoYW5zd2VyKSB7XG5cdFx0XHRpZiAoaGFzS2V5KGFuc3dlciwgeyBzZWxlY3RlZFZhbHVlczogdHJ1ZSB9KSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGVkVmFsdWUgb2YgYW5zd2VyLnNlbGVjdGVkVmFsdWVzKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRWYWx1ZXMuYWRkKHNlbGVjdGVkVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZyZWVmb3JtVmFsdWUgPSBhbnN3ZXIuZnJlZWZvcm1WYWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNpbmdsZUFuc3dlciA9IGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdFx0aWYgKHNpbmdsZUFuc3dlci5zZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzZWxlY3RlZFZhbHVlcy5hZGQoc2luZ2xlQW5zd2VyLnNlbGVjdGVkVmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZyZWVmb3JtVmFsdWUgPSBzaW5nbGVBbnN3ZXIuZnJlZWZvcm1WYWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb24tZGV0YWlscy5jaGF0LXVzZWQtY29udGV4dC1saXN0Jyk7XG5cdFx0Y29uc3Qgb3B0aW9uc1RpdGxlID0gZG9tLiQoJy5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9ucy10aXRsZScpO1xuXHRcdG9wdGlvbnNUaXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwub3B0aW9uc1RpdGxlJywgXCJPcHRpb25zXCIpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChvcHRpb25zVGl0bGUpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uTGlzdCA9IGRvbS4kKCd1bC5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLWxpc3QnKTtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBxdWVzdGlvbi5vcHRpb25zID8/IFtdKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHNlbGVjdGVkVmFsdWVzLmhhcyhvcHRpb24udmFsdWUpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uSXRlbSA9IGRvbS4kKCdsaS5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uJyk7XG5cdFx0XHRvcHRpb25JdGVtLmNsYXNzTGlzdC50b2dnbGUoJ3NlbGVjdGVkJywgc2VsZWN0ZWQpO1xuXHRcdFx0b3B0aW9uSXRlbS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBzZWxlY3RlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc2VsZWN0ZWRPcHRpb25BcmlhTGFiZWwnLCBcInswfSwgc2VsZWN0ZWRcIiwgb3B0aW9uLmxhYmVsKVxuXHRcdFx0XHQ6IG9wdGlvbi5sYWJlbCk7XG5cdFx0XHRjb25zdCBvcHRpb25MYWJlbCA9IGRvbS4kKCdzcGFuLmNoYXQtcXVlc3Rpb24tc3VtbWFyeS1vcHRpb24tbGFiZWwnKTtcblx0XHRcdG9wdGlvbkxhYmVsLnRleHRDb250ZW50ID0gb3B0aW9uLmxhYmVsO1xuXHRcdFx0b3B0aW9uSXRlbS5hcHBlbmRDaGlsZChvcHRpb25MYWJlbCk7XG5cdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0b3B0aW9uSXRlbS5hcHBlbmRDaGlsZCh0aGlzLnJlbmRlclNlbGVjdGVkT3B0aW9uU3RhdGUoKSk7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25MaXN0LmFwcGVuZENoaWxkKG9wdGlvbkl0ZW0pO1xuXHRcdH1cblx0XHRpZiAoZnJlZWZvcm1WYWx1ZSkge1xuXHRcdFx0Y29uc3QgY3VzdG9tSXRlbSA9IGRvbS4kKCdsaS5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLnNlbGVjdGVkJyk7XG5cdFx0XHRjdXN0b21JdGVtLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuc2VsZWN0ZWRDdXN0b21BbnN3ZXJBcmlhTGFiZWwnLCBcIkN1c3RvbSBhbnN3ZXI6IHswfSwgc2VsZWN0ZWRcIiwgZnJlZWZvcm1WYWx1ZSkpO1xuXHRcdFx0Y29uc3QgY3VzdG9tTGFiZWwgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLWxhYmVsJyk7XG5cdFx0XHRjdXN0b21MYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuY3VzdG9tQW5zd2VyJywgXCJDdXN0b20gYW5zd2VyOiB7MH1cIiwgZnJlZWZvcm1WYWx1ZSk7XG5cdFx0XHRjdXN0b21JdGVtLmFwcGVuZChjdXN0b21MYWJlbCwgdGhpcy5yZW5kZXJTZWxlY3RlZE9wdGlvblN0YXRlKCkpO1xuXHRcdFx0b3B0aW9uTGlzdC5hcHBlbmRDaGlsZChjdXN0b21JdGVtKTtcblx0XHR9XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKG9wdGlvbkxpc3QpO1xuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNlbGVjdGVkT3B0aW9uU3RhdGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHNlbGVjdGVkU3RhdGUgPSBkb20uJCgnc3Bhbi5jaGF0LXF1ZXN0aW9uLXN1bW1hcnktb3B0aW9uLXNlbGVjdGVkJyk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJY29uID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRzZWxlY3RlZEljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrQ29tcGFjdCkpO1xuXHRcdHNlbGVjdGVkSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRzZWxlY3RlZFN0YXRlLmFwcGVuZENoaWxkKHNlbGVjdGVkSWNvbik7XG5cdFx0cmV0dXJuIHNlbGVjdGVkU3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogRm9ybWF0cyBhbiBhbnN3ZXIgZm9yIGRpc3BsYXkgaW4gdGhlIHN1bW1hcnkuXG5cdCAqL1xuXHRwcml2YXRlIGZvcm1hdEFuc3dlckZvclN1bW1hcnkocXVlc3Rpb246IElDaGF0UXVlc3Rpb24sIGFuc3dlcjogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5jYXJvdXNlbC5hdXRvUmVwbHkgJiYgYW5zd2VyID09PSBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLmF1dG9SZXBseUFuc3dlcicsIFwiVGhlIHVzZXIgaXMgbm90IGF2YWlsYWJsZSB0byBhbnN3ZXIgeW91ciBxdWVzdGlvbi4gQ2hvb3NlIGEgcHJhZ21hdGljIG9wdGlvbiBiZXN0IGFsaWduZWQgd2l0aCB0aGUgY29udGV4dCBvZiB0aGUgcmVxdWVzdC5cIik7XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChxdWVzdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyhhbnN3ZXIpO1xuXG5cdFx0XHRjYXNlICdzaW5nbGVTZWxlY3QnOiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGNvbnN0IHsgc2VsZWN0ZWRWYWx1ZSwgZnJlZWZvcm1WYWx1ZSB9ID0gYW5zd2VyIGFzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGVkTGFiZWwgPSBzZWxlY3RlZFZhbHVlICE9PSB1bmRlZmluZWQgPyBxdWVzdGlvbi5vcHRpb25zPy5maW5kKG9wdCA9PiBvcHQudmFsdWUgPT09IHNlbGVjdGVkVmFsdWUpPy5sYWJlbCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHQvLyBGb3Igc2luZ2xlU2VsZWN0LCBmcmVlZm9ybSB0YWtlcyBwcmlvcml0eSBvdmVyIHNlbGVjdGlvblxuXHRcdFx0XHRcdGlmIChmcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZnJlZWZvcm1WYWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHNlbGVjdGVkTGFiZWwgPz8gU3RyaW5nKHNlbGVjdGVkVmFsdWUgPz8gJycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gcXVlc3Rpb24ub3B0aW9ucz8uZmluZChvcHQgPT4gb3B0LnZhbHVlID09PSBhbnN3ZXIpPy5sYWJlbDtcblx0XHRcdFx0cmV0dXJuIGxhYmVsID8/IFN0cmluZyhhbnN3ZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlICdtdWx0aVNlbGVjdCc6IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBhbnN3ZXIgPT09ICdvYmplY3QnICYmIGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZXM6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRjb25zdCB7IHNlbGVjdGVkVmFsdWVzLCBmcmVlZm9ybVZhbHVlIH0gPSBhbnN3ZXI7XG5cdFx0XHRcdFx0Y29uc3QgbGFiZWxzID0gc2VsZWN0ZWRWYWx1ZXNcblx0XHRcdFx0XHRcdC5tYXAodiA9PiBxdWVzdGlvbi5vcHRpb25zPy5maW5kKG9wdCA9PiBvcHQudmFsdWUgPT09IHYpPy5sYWJlbCA/PyBTdHJpbmcodikpO1xuXHRcdFx0XHRcdC8vIEZvciBtdWx0aVNlbGVjdCwgY29tYmluZSBzZWxlY3Rpb25zIGFuZCBmcmVlZm9ybSB3aXRoIGNvbW1hIHNlcGFyYXRvclxuXHRcdFx0XHRcdGlmIChmcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdFx0XHRsYWJlbHMucHVzaChmcmVlZm9ybVZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGxhYmVscy5qb2luKGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwubGlzdFNlcGFyYXRvcicsICcsICcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKGFuc3dlcik7XG5cdFx0XHR9XG5cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcoYW5zd2VyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFF1ZXN0aW9uVGV4dChxdWVzdGlvblRleHQ6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWQgPSB0eXBlb2YgcXVlc3Rpb25UZXh0ID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyhxdWVzdGlvblRleHQpIDogcXVlc3Rpb25UZXh0O1xuXHRcdHJldHVybiByZW5kZXJBc1BsYWludGV4dChtZCk7XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIHRoZSBjdXJyZW50IHF1ZXN0aW9uJ3MgYW5zd2VyIGFnYWluc3QgaXRzIHZhbGlkYXRpb24gcnVsZXMuXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB2YWxpZCwgZmFsc2UgaWYgdmFsaWRhdGlvbiBlcnJvcnMgd2VyZSBzaG93bi5cblx0ICovXG5cdHByaXZhdGUgdmFsaWRhdGVDdXJyZW50UXVlc3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcXVlc3Rpb24gPSB0aGlzLmNhcm91c2VsLnF1ZXN0aW9uc1t0aGlzLl9jdXJyZW50SW5kZXhdO1xuXHRcdGlmICghcXVlc3Rpb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFuc3dlciA9IHRoaXMuX2Fuc3dlcnMuZ2V0KHF1ZXN0aW9uLmlkKTtcblxuXHRcdC8vIENoZWNrIHJlcXVpcmVkXG5cdFx0aWYgKHF1ZXN0aW9uLnJlcXVpcmVkICYmIChhbnN3ZXIgPT09IHVuZGVmaW5lZCB8fCBhbnN3ZXIgPT09ICcnKSkge1xuXHRcdFx0dGhpcy5zaG93VmFsaWRhdGlvbkVycm9yKGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwucmVxdWlyZWQnLCAnVGhpcyBmaWVsZCBpcyByZXF1aXJlZCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSB0ZXh0IGlucHV0c1xuXHRcdGlmIChxdWVzdGlvbi50eXBlID09PSAndGV4dCcgJiYgcXVlc3Rpb24udmFsaWRhdGlvbiAmJiB0eXBlb2YgYW5zd2VyID09PSAnc3RyaW5nJyAmJiBhbnN3ZXIgIT09ICcnKSB7XG5cdFx0XHRjb25zdCBlcnJvciA9IHRoaXMuZ2V0VmFsaWRhdGlvbkVycm9yKGFuc3dlciwgcXVlc3Rpb24udmFsaWRhdGlvbik7XG5cdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5zaG93VmFsaWRhdGlvbkVycm9yKGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY2xlYXJWYWxpZGF0aW9uRXJyb3IoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBWYWxpZGF0ZXMgdGhhdCBhbGwgcmVxdWlyZWQgcXVlc3Rpb25zIGhhdmUgYmVlbiBhbnN3ZXJlZC5cblx0ICogUmV0dXJucyB0cnVlIGlmIGFsbCByZXF1aXJlZCBmaWVsZHMgYXJlIHNhdGlzZmllZC5cblx0ICovXG5cdHByaXZhdGUgdmFsaWRhdGVSZXF1aXJlZEZpZWxkcygpOiBib29sZWFuIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBxdWVzdGlvbiA9IHRoaXMuY2Fyb3VzZWwucXVlc3Rpb25zW2ldO1xuXHRcdFx0aWYgKCFxdWVzdGlvbi5yZXF1aXJlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFuc3dlciA9IHRoaXMuX2Fuc3dlcnMuZ2V0KHF1ZXN0aW9uLmlkKTtcblx0XHRcdGlmIChhbnN3ZXIgPT09IHVuZGVmaW5lZCB8fCBhbnN3ZXIgPT09ICcnKSB7XG5cdFx0XHRcdC8vIE5hdmlnYXRlIHRvIHRoZSB1bmFuc3dlcmVkIHJlcXVpcmVkIHF1ZXN0aW9uXG5cdFx0XHRcdHRoaXMuc2F2ZUN1cnJlbnRBbnN3ZXIoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudEluZGV4ID0gaTtcblx0XHRcdFx0dGhpcy5wZXJzaXN0RHJhZnRTdGF0ZSgpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckN1cnJlbnRRdWVzdGlvbih0cnVlKTtcblx0XHRcdFx0dGhpcy5zaG93VmFsaWRhdGlvbkVycm9yKGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwucmVxdWlyZWQnLCAnVGhpcyBmaWVsZCBpcyByZXF1aXJlZCcpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgdmFsaWRhdGlvbiBlcnJvciBtZXNzYWdlIGZvciB0aGUgZ2l2ZW4gdmFsdWUsIG9yIHVuZGVmaW5lZCBpZiB2YWxpZC5cblx0ICovXG5cdHByaXZhdGUgZ2V0VmFsaWRhdGlvbkVycm9yKHZhbHVlOiBzdHJpbmcsIHZhbGlkYXRpb246IElDaGF0UXVlc3Rpb25WYWxpZGF0aW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmYWlsdXJlID0gZmluZFF1ZXN0aW9uVmFsaWRhdGlvbkZhaWx1cmUodmFsdWUsIHZhbGlkYXRpb24pO1xuXHRcdHN3aXRjaCAoZmFpbHVyZT8ua2luZCkge1xuXHRcdFx0Y2FzZSB1bmRlZmluZWQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRjYXNlICdtaW5MZW5ndGgnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLm1pbkxlbmd0aCcsICdNaW5pbXVtIGxlbmd0aCBpcyB7MH0nLCBmYWlsdXJlLmxpbWl0KTtcblx0XHRcdGNhc2UgJ21heExlbmd0aCc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnZhbGlkYXRpb24ubWF4TGVuZ3RoJywgJ01heGltdW0gbGVuZ3RoIGlzIHswfScsIGZhaWx1cmUubGltaXQpO1xuXHRcdFx0Y2FzZSAnZW1haWwnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLmVtYWlsJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGVtYWlsIGFkZHJlc3MnKTtcblx0XHRcdGNhc2UgJ3VyaSc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnZhbGlkYXRpb24udXJpJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIFVSSScpO1xuXHRcdFx0Y2FzZSAnZGF0ZSc6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsLnZhbGlkYXRpb24uZGF0ZScsICdQbGVhc2UgZW50ZXIgYSB2YWxpZCBkYXRlIChZWVlZLU1NLUREKScpO1xuXHRcdFx0Y2FzZSAnZGF0ZVRpbWUnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLmRhdGVUaW1lJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGRhdGUtdGltZScpO1xuXHRcdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5udW1iZXInLCAnUGxlYXNlIGVudGVyIGEgdmFsaWQgbnVtYmVyJyk7XG5cdFx0XHRjYXNlICdpbnRlZ2VyJzpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwudmFsaWRhdGlvbi5pbnRlZ2VyJywgJ1BsZWFzZSBlbnRlciBhIHZhbGlkIGludGVnZXInKTtcblx0XHRcdGNhc2UgJ21pbmltdW0nOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLm1pbmltdW0nLCAnTWluaW11bSB2YWx1ZSBpcyB7MH0nLCBmYWlsdXJlLmxpbWl0KTtcblx0XHRcdGNhc2UgJ21heGltdW0nOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC52YWxpZGF0aW9uLm1heGltdW0nLCAnTWF4aW11bSB2YWx1ZSBpcyB7MH0nLCBmYWlsdXJlLmxpbWl0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dWYWxpZGF0aW9uRXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFZhbGlkYXRpb25FcnJvciA9IG1lc3NhZ2U7XG5cdFx0aWYgKHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclZhbGlkYXRpb25FcnJvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50VmFsaWRhdGlvbkVycm9yID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl92YWxpZGF0aW9uTWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX3ZhbGlkYXRpb25NZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy5fdmFsaWRhdGlvbk1lc3NhZ2VFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0Ly8gZG9lcyBub3QgaGF2ZSBzYW1lIGNvbnRlbnQgd2hlbiBpdCBpcyBub3Qgc2tpcHBlZCBhbmQgaXMgYWN0aXZlIGFuZCB3ZSBzdG9wIHRoZSByZXNwb25zZVxuXHRcdGlmICghdGhpcy5faXNTa2lwcGVkICYmICF0aGlzLmNhcm91c2VsLmlzVXNlZCAmJiBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBvdGhlci5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcgJiYgb3RoZXIgPT09IHRoaXMuY2Fyb3VzZWw7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IHsgZGlzcG9zZSgpOiB2b2lkIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1NraXBwZWQgJiYgIXRoaXMuY2Fyb3VzZWwuaXNVc2VkKSB7XG5cdFx0XHR0aGlzLnNhdmVDdXJyZW50QW5zd2VyKCk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQXNCO0FBQy9CLFNBQTBCLGdCQUFnQix3QkFBd0I7QUFDbEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQix1QkFBdUIsNkJBQTZCO0FBQ2xGLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQiwwQkFBMEIsbUNBQW1DO0FBQ3JHLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQStCLG9CQUFvQjtBQUVuRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0NBQWtD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
