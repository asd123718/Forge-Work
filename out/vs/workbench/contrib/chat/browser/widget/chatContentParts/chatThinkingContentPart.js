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
import { $, addDisposableListener, clearNode, DisposableResizeObserver, EventHelper, EventType, getWindow, hide, isHTMLElement, scheduleAtNextAnimationFrame } from "../../../../../../base/browser/dom.js";
import { alert } from "../../../../../../base/browser/ui/aria/aria.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { HoverStyle } from "../../../../../../base/browser/ui/hover/hover.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { IChatToolInvocation } from "../../../common/chatService/chatService.js";
import { ChatConfiguration, ThinkingDisplayMode } from "../../../common/constants.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { AccessibilityWorkbenchSettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { extractCodeblockUrisFromText } from "../../../common/widget/annotations.js";
import { basename, getComparisonKey } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { localize } from "../../../../../../nls.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { ChatMessageRole, ILanguageModelsService } from "../../../common/languageModels.js";
import "./media/chatThinkingContent.css";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { extractImagesFromToolInvocationOutputDetails } from "../../../common/chatImageExtraction.js";
import { ChatThinkingExternalResourceWidget } from "./chatThinkingExternalResourcesWidget.js";
import { LocalChatSessionUri, chatSessionResourceToId } from "../../../common/model/chatUri.js";
const SESSIONS_IS_PHONE_LAYOUT_KEY = "sessionsIsPhoneLayout";
function getEffectiveThinkingDisplayMode(configurationService, contextKeyService) {
  if (contextKeyService.getContextKeyValue(SESSIONS_IS_PHONE_LAYOUT_KEY) === true) {
    return ThinkingDisplayMode.CollapsedPreview;
  }
  return configurationService.getValue("chat.agent.thinkingStyle") ?? ThinkingDisplayMode.Collapsed;
}
function extractTextFromPart(content) {
  const raw = Array.isArray(content.value) ? content.value.join("") : content.value || "";
  return raw.trim();
}
function isEditToolId(toolId) {
  const lowerToolId = toolId.toLowerCase();
  return lowerToolId.includes("edit") || lowerToolId.includes("create") || lowerToolId.includes("replace") || lowerToolId.includes("patch");
}
function isGenericEditToolId(toolId) {
  const lowerToolId = toolId.toLowerCase();
  if (lowerToolId.includes("create") || lowerToolId.includes("notebook")) {
    return false;
  }
  return lowerToolId.includes("replace") || lowerToolId.includes("patch") || lowerToolId.includes("insertedit") || lowerToolId.includes("insert_edit") || lowerToolId.includes("editfile");
}
function isProblemsToolId(toolId) {
  switch (toolId?.toLowerCase()) {
    case "problems":
    case "get_errors":
    case "copilot_geterrors":
      return true;
    default:
      return false;
  }
}
function isNoProblemsFoundResult(toolId, resultText) {
  return isProblemsToolId(toolId) && resultText?.toLowerCase().includes("no problems found") === true;
}
function getToolInvocationIcon(toolId, registeredIcon, resultText) {
  if (isNoProblemsFoundResult(toolId, resultText)) {
    return Codicon.search;
  }
  if (registeredIcon) {
    return registeredIcon;
  }
  const lowerToolId = toolId.toLowerCase();
  if (lowerToolId.includes("comment")) {
    return Codicon.comment;
  }
  if (lowerToolId.includes("search") || lowerToolId.includes("grep") || lowerToolId.includes("find") || lowerToolId.includes("list") || lowerToolId.includes("semantic") || lowerToolId.includes("changes") || lowerToolId.includes("codebase") || lowerToolId.includes("checked")) {
    return Codicon.search;
  }
  if (lowerToolId.includes("read") || lowerToolId.includes("get_file") || lowerToolId.includes("problems")) {
    return Codicon.book;
  }
  if (isEditToolId(toolId)) {
    return Codicon.pencil;
  }
  if (lowerToolId.includes("terminal")) {
    return Codicon.terminal;
  }
  return Codicon.tools;
}
function createThinkingIcon(icon) {
  const iconElement = $("span.chat-thinking-icon");
  iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
  return iconElement;
}
function setThinkingIcon(iconElement, icon) {
  iconElement.className = "chat-thinking-icon";
  iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
}
function extractTitleFromThinkingContent(content) {
  const headerMatch = content.match(/^\*\*([^*]+)\*\*/);
  return headerMatch ? headerMatch[1] : void 0;
}
const THINKING_SCROLL_MAX_HEIGHT = 200;
const TITLE_CACHE_STORAGE_KEY = "chat.thinkingTitleCache";
const TITLE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
const TITLE_CACHE_MAX_ENTRIES = 1e3;
var WorkingMessageCategory = /* @__PURE__ */ ((WorkingMessageCategory2) => {
  WorkingMessageCategory2["Thinking"] = "thinking";
  WorkingMessageCategory2["Terminal"] = "terminal";
  WorkingMessageCategory2["Tool"] = "tool";
  return WorkingMessageCategory2;
})(WorkingMessageCategory || {});
const defaultThinkingMessages = [
  localize("chat.thinking.thinking.1", "Thinking"),
  localize("chat.thinking.thinking.2", "Reasoning"),
  localize("chat.thinking.thinking.3", "Considering"),
  localize("chat.thinking.thinking.4", "Analyzing"),
  localize("chat.thinking.thinking.5", "Evaluating"),
  localize("chat.thinking.thinking.6", "Working")
];
const terminalMessages = [
  localize("chat.thinking.terminal.1", "Executing"),
  localize("chat.thinking.terminal.2", "Running"),
  localize("chat.thinking.terminal.3", "Processing")
];
const toolMessages = [
  localize("chat.thinking.tool.1", "Processing"),
  localize("chat.thinking.tool.2", "Preparing"),
  localize("chat.thinking.tool.3", "Loading"),
  localize("chat.thinking.tool.4", "Analyzing"),
  localize("chat.thinking.tool.5", "Evaluating")
];
const funWorkingMessages = [
  // Generic
  localize("chat.working.fun.1", "Bribing the hamster"),
  localize("chat.working.fun.2", "Reticulating splines"),
  localize("chat.working.fun.3", "Untangling the spaghetti"),
  localize("chat.working.fun.4", "Communing with the codebase"),
  // Minecraft
  localize("chat.working.fun.minecraft.1", "Mining diamonds"),
  // Microsoft
  localize("chat.working.fun.ms.1", "Summoning Clippy")
];
const FUN_WORKING_MESSAGE_RATE = 50;
function getCustomThinkingPhrases(configurationService) {
  const config = configurationService.getValue(ChatConfiguration.ThinkingPhrases);
  const customPhrases = Array.isArray(config?.phrases) ? config.phrases.filter((phrase) => typeof phrase === "string").map((phrase) => phrase.trim()).filter((phrase) => phrase.length > 0) : [];
  return {
    customPhrases,
    replaceDefaults: config?.mode === "replace" && customPhrases.length > 0
  };
}
function maybePickFunWorkingMessage(configurationService, random = Math.random) {
  if (getCustomThinkingPhrases(configurationService).replaceDefaults) {
    return void 0;
  }
  if (Math.floor(random() * FUN_WORKING_MESSAGE_RATE) === 0) {
    return funWorkingMessages[Math.floor(random() * funWorkingMessages.length)];
  }
  return void 0;
}
function buildPhrasePool(defaults, configurationService) {
  const { customPhrases, replaceDefaults } = getCustomThinkingPhrases(configurationService);
  if (customPhrases.length > 0) {
    return replaceDefaults ? [...customPhrases] : [...defaults, ...customPhrases];
  }
  return [...defaults];
}
let ChatThinkingContentPart = class extends ChatCollapsibleContentPart {
  constructor(content, context, chatContentMarkdownRenderer, streamingCompleted, instantiationService, configurationService, chatMarkdownAnchorService, languageModelsService, hoverService, storageService, contextKeyService, editorService) {
    const initialText = extractTextFromPart(content);
    const containsReasoning = initialText.trim().length > 0;
    const extractedTitle = extractTitleFromThinkingContent(initialText) ?? localize("chat.thinking.header.initial", "Thinking");
    super(extractedTitle, context, void 0, hoverService, configurationService);
    this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
    this.streamingCompleted = streamingCompleted;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.languageModelsService = languageModelsService;
    this.storageService = storageService;
    this.editorService = editorService;
    this._onDidChangeHeight = this._register(new Emitter());
    this._asyncRenderCallback = () => this._onDidChangeHeight.fire();
    this.defaultTitle = localize("chat.thinking.header", "Thinking");
    this.workingTitle = localize("chat.thinking.header.working", "Working");
    this._markdownResult = this._register(new MutableDisposable());
    this.fixedScrollingMode = false;
    this.autoScrollEnabled = true;
    this.extractedTitles = [];
    this.toolInvocationCount = 0;
    this.appendedItemCount = 0;
    this.isActive = true;
    this.toolInvocations = [];
    this.allThinkingParts = [];
    this.hookCount = 0;
    this.lazyItems = [];
    this.hasExpandedOnce = false;
    this.availableMessagesByCategory = /* @__PURE__ */ new Map();
    this.toolWrappersByCallId = /* @__PURE__ */ new Map();
    this.toolIconsByCallId = /* @__PURE__ */ new Map();
    this.toolLabelsByCallId = /* @__PURE__ */ new Map();
    this.toolDisposables = this._register(new DisposableMap());
    this.ownedToolParts = /* @__PURE__ */ new Map();
    this.pendingRemovals = [];
    this.isUpdatingDimensions = false;
    this.lastKnownContentHeight = 0;
    this.lastKnownScrollTop = 0;
    this._pendingExternalResources = /* @__PURE__ */ new Map();
    this._titleDetailRendered = this._register(new MutableDisposable());
    this._pendingAppendRefresh = this._register(new MutableDisposable());
    this.diffDataByPartId = /* @__PURE__ */ new Map();
    this._aggregatedDiff = { added: 0, removed: 0 };
    this.diffButtonStore = this._register(new DisposableStore());
    this.containsGroupedItems = false;
    this.containsReasoning = containsReasoning;
    this.reasoningDurationMs = content.reasoningDurationMs;
    this.id = content.id;
    this.content = content;
    this.allThinkingParts.push(content);
    const configuredMode = getEffectiveThinkingDisplayMode(this.configurationService, contextKeyService);
    this.thinkingDisplayMode = configuredMode;
    this.fixedScrollingMode = configuredMode === ThinkingDisplayMode.FixedScrolling;
    this.currentTitle = extractedTitle;
    if (extractedTitle !== this.defaultTitle) {
      this.lastExtractedTitle = extractedTitle;
      this.extractedTitles.push(extractedTitle);
    }
    this.currentThinkingValue = initialText;
    if (initialText.trim()) {
      this.appendedItemCount++;
    }
    if (this.configurationService.getValue(AccessibilityWorkbenchSettingId.VerboseChatProgressUpdates)) {
      alert(localize("chat.thinking.started", "Thinking"));
    }
    if (configuredMode === ThinkingDisplayMode.Collapsed) {
      this.setExpanded(false);
    } else if (configuredMode === ThinkingDisplayMode.CollapsedPreview) {
      this.setExpanded(!this.streamingCompleted && !this.element.isComplete);
    } else {
      this.setExpanded(false);
    }
    const node = this.domNode;
    node.classList.add("chat-thinking-box");
    this._externalResourceWidget = this._register(this.instantiationService.createInstance(ChatThinkingExternalResourceWidget));
    this._register(this._externalResourceWidget.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
    node.appendChild(this._externalResourceWidget.domNode);
    if (!this.streamingCompleted && !this.element.isComplete) {
      if (!this.fixedScrollingMode) {
        node.classList.add("chat-thinking-active");
      }
    }
    if (!this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      this.titleShimmerSpan.textContent = extractedTitle;
      labelElement.appendChild(this.titleShimmerSpan);
    }
    if (this.fixedScrollingMode) {
      node.classList.add("chat-thinking-fixed-mode");
      this.currentTitle = this.defaultTitle;
    }
    this._register(toDisposable(() => {
      for (const d of this.ownedToolParts.values()) {
        d.dispose();
      }
      this.ownedToolParts.clear();
    }));
    this._register(autorun((r) => {
      const isExpanded = this.expanded.read(r);
      if (this._collapseButton) {
        if (this.streamingCompleted || this.element.isComplete) {
          this._collapseButton.icon = Codicon.check;
        } else if (!this.fixedScrollingMode) {
          if (isExpanded) {
            this._collapseButton.icon = Codicon.chevronDown;
          } else {
            this._collapseButton.icon = Codicon.circleFilled;
          }
        }
      }
    }));
    this._register(autorun((r) => {
      const isExpanded = this._isExpanded.read(r);
      if (isExpanded && !this.hasExpandedOnce && this.lazyItems.length > 0) {
        this.hasExpandedOnce = true;
        this.processPendingRemovals();
        for (const item of this.lazyItems) {
          this.materializeLazyItem(item);
        }
      }
      if (isExpanded && !this.shouldAllowExpansion() && (this.streamingCompleted || this.element.isComplete)) {
        this.setExpanded(false);
        return;
      }
      this._externalResourceWidget.setCollapsed(!isExpanded);
      this._onDidChangeHeight.fire();
    }));
    const label = this.lastExtractedTitle ?? "";
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(label);
    }
    if (this._collapseButton) {
      this._register(this._collapseButton.onDidClick(() => {
        if (this.fixedScrollingMode) {
          if (this.streamingCompleted) {
            this.domNode.classList.add("chat-thinking-fixed-mode-animated");
          }
          return;
        }
        if (this.streamingCompleted) {
          return;
        }
        const expanded = this.isExpanded();
        if (expanded) {
          this.collapsedTitleBeforeExpansion = this.lastExtractedTitle;
          this.setTitle(this.defaultTitle, true);
          this.currentTitle = this.defaultTitle;
        } else {
          const collapsedTitle = this.collapsedTitleBeforeExpansion ?? this.lastExtractedTitle;
          this.collapsedTitleBeforeExpansion = void 0;
          if (collapsedTitle) {
            this.setTitle(collapsedTitle);
          } else {
            this.setTitle(this.defaultTitle, true);
            this.currentTitle = this.defaultTitle;
          }
        }
      }));
    }
  }
  static _codeBlockRendererSync(_languageId, text, _raw) {
    const codeElement = $("code");
    codeElement.textContent = text;
    return codeElement;
  }
  get aggregatedDiff() {
    return this._aggregatedDiff;
  }
  getRandomWorkingMessage(category = "tool" /* Tool */) {
    const fun = maybePickFunWorkingMessage(this.configurationService);
    if (fun) {
      return fun;
    }
    let pool = this.availableMessagesByCategory.get(category);
    if (!pool || pool.length === 0) {
      let defaults;
      switch (category) {
        case "thinking" /* Thinking */:
          defaults = defaultThinkingMessages;
          break;
        case "terminal" /* Terminal */:
          defaults = terminalMessages;
          break;
        case "tool" /* Tool */:
        default:
          defaults = toolMessages;
          break;
      }
      pool = buildPhrasePool(defaults, this.configurationService);
      this.availableMessagesByCategory.set(category, pool);
    }
    const index = Math.floor(Math.random() * pool.length);
    return pool.splice(index, 1)[0];
  }
  shouldInitEarly() {
    return this.fixedScrollingMode && !this.streamingCompleted;
  }
  shouldAnimateContent() {
    return !this.fixedScrollingMode;
  }
  shouldPrepareContentAnimation() {
    return !this.fixedScrollingMode;
  }
  contentDidInitialize() {
    if (this.fixedScrollingMode && this.streamingCompleted && this.scrollableElement) {
      const scrollableDomNode = this.scrollableElement.getDomNode();
      scrollableDomNode.style.maxHeight = "0px";
      scrollableDomNode.getBoundingClientRect();
    }
  }
  expansionDidChange(expanded) {
    if (this.fixedScrollingMode && this.streamingCompleted) {
      if (expanded) {
        this.syncDimensionsAndScheduleScroll();
      } else {
        this.updateCompletedScrollAnimationState(false);
      }
    }
  }
  // @TODO: @justschen Convert to template for each setting?
  initContent() {
    this.wrapper = $(".chat-used-context-list.chat-thinking-collapsible");
    if (!this.streamingCompleted) {
      this.wrapper.classList.add("chat-thinking-streaming");
    }
    const hasLazyThinkingItems = this.lazyItems.some((item) => item.kind === "thinking");
    if (this.currentThinkingValue && !hasLazyThinkingItems) {
      this.textContainer = $(".chat-thinking-item.markdown-content");
      this.wrapper.appendChild(this.textContainer);
      this.renderMarkdown(this.currentThinkingValue);
    }
    if (!this.streamingCompleted && !this.element.isComplete) {
      this.workingSpinnerElement = $(".chat-thinking-item.chat-thinking-spinner-item");
      const spinnerIcon = createThinkingIcon(Codicon.circleFilled);
      this.workingSpinnerElement.appendChild(spinnerIcon);
      this.workingSpinnerLabel = $("span.chat-thinking-spinner-label");
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* Thinking */);
      this.workingSpinnerElement.appendChild(this.workingSpinnerLabel);
      this.wrapper.appendChild(this.workingSpinnerElement);
      this.updateWorkingSpinnerVisibility();
    }
    if (this.fixedScrollingMode) {
      this.scrollableElement = this._register(new DomScrollableElement(this.wrapper, {
        vertical: ScrollbarVisibility.Auto,
        horizontal: ScrollbarVisibility.Hidden,
        handleMouseWheel: true,
        alwaysConsumeMouseWheel: false
      }));
      this._register(this.scrollableElement.onScroll((e) => this.handleScroll(e.scrollTop)));
      let pendingMutationRefresh;
      const mutationObserver = new MutationObserver(() => {
        if (pendingMutationRefresh) {
          return;
        }
        pendingMutationRefresh = scheduleAtNextAnimationFrame(getWindow(this.wrapper), () => {
          pendingMutationRefresh = void 0;
          if (this.streamingCompleted || !this.domNode.classList.contains("chat-used-context-collapsed")) {
            return;
          }
          this.refreshContentHeight();
          this.updateScrollDimensionsFromCache();
        });
      });
      mutationObserver.observe(this.wrapper, { childList: true, subtree: true });
      this._register({
        dispose: () => {
          mutationObserver.disconnect();
          pendingMutationRefresh?.dispose();
        }
      });
      this.childResizeObserver = this._register(new DisposableResizeObserver("ChatThinkingContentPart.child", () => {
        if (this.streamingCompleted || !this.domNode.classList.contains("chat-used-context-collapsed")) {
          return;
        }
        this.syncDimensionsAndScheduleScroll();
      }));
      if (this.textContainer) {
        this._register(this.childResizeObserver.observe(this.textContainer));
      }
      if (this.workingSpinnerElement) {
        this._register(this.childResizeObserver.observe(this.workingSpinnerElement));
      }
      const wrapperResizeObserver = this._register(new DisposableResizeObserver("ChatThinkingContentPart.wrapper", (entries) => {
        if (entries[0]) {
          this.lastKnownContentHeight = this.wrapper.scrollHeight;
          if (this.streamingCompleted && this.isExpanded()) {
            this.updateScrollDimensionsForCompletion();
          } else if (!this.streamingCompleted && this.domNode.classList.contains("chat-used-context-collapsed")) {
            this.updateScrollDimensionsFromCache();
          }
        }
      }));
      this.wrapperResizeObserverDisposable = this._register(wrapperResizeObserver.observe(this.wrapper));
      this._register(this._onDidChangeHeight.event(() => {
        if (!this.streamingCompleted && this.wrapperResizeObserverDisposable) {
          this.refreshContentHeight();
          this.updateScrollDimensionsFromCache();
          return;
        }
        this.syncDimensionsAndScheduleScroll();
      }));
      this.syncDimensionsAndScheduleScroll();
      this.updateDropdownClickability();
      return this.scrollableElement.getDomNode();
    }
    this.updateDropdownClickability();
    return this.wrapper;
  }
  handleScroll(scrollTop) {
    if (!this.scrollableElement || this.isUpdatingDimensions) {
      return;
    }
    this.lastKnownScrollTop = scrollTop;
    const contentHeight = this.lastKnownContentHeight;
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    const maxScrollTop = contentHeight - viewportHeight;
    this.autoScrollEnabled = maxScrollTop <= 0 || scrollTop >= maxScrollTop - 10;
    this.updateFadeClasses(scrollTop, contentHeight, viewportHeight);
  }
  updateFadeClasses(scrollTop, contentHeight, viewportHeight) {
    if (!this.fixedScrollingMode || this.streamingCompleted) {
      this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
      return;
    }
    const currentScrollTop = scrollTop ?? this.lastKnownScrollTop;
    const currentContentHeight = contentHeight ?? this.lastKnownContentHeight;
    const currentViewportHeight = viewportHeight ?? Math.min(currentContentHeight, THINKING_SCROLL_MAX_HEIGHT);
    const maxScrollTop = currentContentHeight - currentViewportHeight;
    this.domNode.classList.toggle("chat-thinking-fade-top", currentScrollTop > 5);
    this.domNode.classList.toggle("chat-thinking-fade-bottom", maxScrollTop > 0 && currentScrollTop < maxScrollTop - 5);
  }
  // Fallback for non-ResizeObserver updates (onDidChangeHeight, initial setup).
  syncDimensionsAndScheduleScroll() {
    if (this.pendingScrollDisposable) {
      return;
    }
    this.pendingScrollDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
      this.pendingScrollDisposable = void 0;
      if (this._store.isDisposed) {
        return;
      }
      if (this.streamingCompleted) {
        this.updateScrollDimensionsForCompletion();
        return;
      }
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    });
  }
  /**
   * Re-read scrollHeight from the DOM and update cached height if changed.
   */
  refreshContentHeight() {
    if (!this.wrapper || !this.scrollableElement) {
      return;
    }
    const newHeight = this.wrapper.scrollHeight;
    if (newHeight && newHeight !== this.lastKnownContentHeight) {
      this.lastKnownContentHeight = newHeight;
    }
  }
  updateScrollDimensionsFromCache() {
    if (!this.scrollableElement || this._store.isDisposed) {
      return;
    }
    const isCollapsed = this.domNode.classList.contains("chat-used-context-collapsed");
    if (!isCollapsed) {
      return;
    }
    const contentHeight = this.lastKnownContentHeight;
    if (!contentHeight) {
      return;
    }
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    this.isUpdatingDimensions = true;
    try {
      const viewportWidth = this.scrollableElement.getDomNode().clientWidth;
      this.scrollableElement.setScrollDimensions({
        width: viewportWidth,
        scrollWidth: viewportWidth,
        height: viewportHeight,
        scrollHeight: contentHeight
      });
      if (this.autoScrollEnabled) {
        this.scrollToBottom(contentHeight);
      }
    } finally {
      this.isUpdatingDimensions = false;
    }
    this.updateFadeClasses(this.lastKnownScrollTop, this.lastKnownContentHeight);
    this.updateDropdownClickability(contentHeight);
  }
  scrollToBottom(contentHeight) {
    if (!this.scrollableElement) {
      return;
    }
    const viewportHeight = Math.min(contentHeight, THINKING_SCROLL_MAX_HEIGHT);
    if (contentHeight > viewportHeight) {
      const newScrollTop = contentHeight - viewportHeight;
      this.lastKnownScrollTop = newScrollTop;
      this.scrollableElement.setRevealOnScroll(false);
      this.scrollableElement.setScrollPosition({ scrollTop: newScrollTop });
      this.scrollableElement.setRevealOnScroll(true);
    }
  }
  /**
   * updates scroll dimensions when streaming is complete.
   */
  updateScrollDimensionsForCompletion() {
    if (!this.scrollableElement || !this.fixedScrollingMode) {
      return;
    }
    const contentHeight = this.wrapper.scrollHeight;
    this.lastKnownContentHeight = contentHeight;
    const scrollableDomNode = this.scrollableElement.getDomNode();
    scrollableDomNode.style.maxHeight = `${contentHeight}px`;
    const viewportWidth = scrollableDomNode.clientWidth;
    this.scrollableElement.setScrollDimensions({
      width: viewportWidth,
      scrollWidth: viewportWidth,
      height: contentHeight,
      scrollHeight: contentHeight
    });
    this.lastKnownScrollTop = 0;
    this.scrollableElement.setRevealOnScroll(false);
    this.scrollableElement.setScrollPosition({ scrollTop: 0 });
    this.scrollableElement.setRevealOnScroll(true);
    this.updateCompletedScrollAnimationState(this.isExpanded());
  }
  updateCompletedScrollAnimationState(expanded) {
    if (!this.scrollableElement) {
      return;
    }
    const scrollableDomNode = this.scrollableElement.getDomNode();
    scrollableDomNode.style.maxHeight = expanded ? `${this.lastKnownContentHeight}px` : "0px";
    scrollableDomNode.inert = !expanded;
  }
  renderMarkdown(content, reuseExisting) {
    if (this._store.isDisposed) {
      return;
    }
    const cleanedContent = content.trim();
    if (!cleanedContent) {
      this._markdownResult.clear();
      if (this.textContainer) {
        clearNode(this.textContainer);
      }
      return;
    }
    let contentToRender = cleanedContent;
    if (cleanedContent.startsWith("**") && cleanedContent.endsWith("**")) {
      contentToRender = cleanedContent.slice(2, -2);
    }
    const target = reuseExisting ? this._markdownResult.value?.element : void 0;
    const rendered = this.chatContentMarkdownRenderer.render(new MarkdownString(contentToRender), {
      fillInIncompleteTokens: true,
      asyncRenderCallback: this._asyncRenderCallback,
      codeBlockRendererSync: ChatThinkingContentPart._codeBlockRendererSync
    }, target);
    this._markdownResult.value = rendered;
    if (!target) {
      if (this.textContainer) {
        clearNode(this.textContainer);
        this.textContainer.appendChild(createThinkingIcon(Codicon.circleFilled));
        this.textContainer.appendChild(rendered.element);
      }
    }
  }
  setFinalizedTitle(title) {
    if (!this._collapseButton) {
      return;
    }
    const displayTitle = this.getFinalizedDisplayTitle(title);
    const labelElement = this._collapseButton.labelElement;
    labelElement.textContent = "";
    const firstSpaceIndex = displayTitle.indexOf(" ");
    if (firstSpaceIndex === -1) {
      labelElement.textContent = displayTitle;
    } else {
      const verb = displayTitle.substring(0, firstSpaceIndex);
      const rest = displayTitle.substring(firstSpaceIndex);
      const verbSpan = $("span");
      verbSpan.textContent = verb;
      labelElement.appendChild(verbSpan);
      const restSpan = $("span.chat-thinking-title-detail-text");
      restSpan.textContent = rest;
      labelElement.appendChild(restSpan);
    }
    if (this.diffDataByPartId.size > 0) {
      const { added, removed } = this._aggregatedDiff;
      if (added > 0 || removed > 0) {
        this.renderDiffButton(added, removed);
        const insertionsFragment = added === 1 ? localize("chat.thinking.insertions.one", "1 insertion") : localize("chat.thinking.insertions", "{0} insertions", added);
        const deletionsFragment = removed === 1 ? localize("chat.thinking.deletions.one", "1 deletion") : localize("chat.thinking.deletions", "{0} deletions", removed);
        this.setAriaLabel(localize("chat.thinking.titleWithDiff", "{0}, {1}, {2}", displayTitle, insertionsFragment, deletionsFragment));
      } else {
        this.clearDiffButton();
        this.setAriaLabel(displayTitle);
      }
    } else {
      this.clearDiffButton();
      this.setAriaLabel(displayTitle);
    }
  }
  renderDiffButton(added, removed) {
    const resources = this.getAggregatedDiffResources();
    if (resources.length === 0) {
      this.clearDiffButton();
      return;
    }
    if (!this.diffButton) {
      const collapseButton = this._collapseButton;
      const container = collapseButton?.element.parentElement;
      if (!container) {
        return;
      }
      collapseButton.element.classList.add("chat-thinking-title-with-diff");
      const button = this.diffButtonStore.add(new Button(container, {}));
      button.element.classList.add("chat-thinking-title-diff");
      this.diffButtonStore.add(button.onDidClick((event) => {
        EventHelper.stop(event, true);
        this.openDiffs();
      }));
      this.diffButtonStore.add(this.hoverService.setupDelayedHover(button.element, {
        content: localize("chat.thinking.viewChanges", "View File Changes"),
        style: HoverStyle.Pointer
      }));
      this.diffButton = button;
      if (this._hoverChevron) {
        container.appendChild(this._hoverChevron);
        this.diffButtonStore.add(addDisposableListener(this._hoverChevron, EventType.CLICK, (event) => {
          EventHelper.stop(event, true);
          this.toggleExpanded();
        }));
      }
    }
    this.diffButton.element.replaceChildren(
      $("span.label-added", {}, `+${added}`),
      $("span.label-removed", {}, `-${removed}`)
    );
    this.diffButton.setAriaLabel(localize(
      "chat.thinking.viewChangesAccessible",
      "View file changes, {0} lines added, {1} lines deleted",
      added,
      removed
    ));
  }
  clearDiffButton() {
    this.diffButtonStore.clear();
    this.diffButton = void 0;
    this._collapseButton?.element.classList.remove("chat-thinking-title-with-diff");
    if (this._collapseButton && this._hoverChevron) {
      this._collapseButton.element.appendChild(this._hoverChevron);
    }
  }
  getAggregatedDiffResources() {
    const result = /* @__PURE__ */ new Map();
    for (const data of this.diffDataByPartId.values()) {
      for (const resource of data.resources) {
        const key = getComparisonKey(resource.resource);
        const existing = result.get(key);
        if (existing) {
          existing.resource = resource.resource;
          existing.modifiedURI = resource.modifiedURI;
        } else {
          result.set(key, { ...resource });
        }
      }
    }
    return [...result.values()].filter((resource) => resource.originalURI !== void 0 || resource.modifiedURI !== void 0);
  }
  openDiffs() {
    const resources = this.getAggregatedDiffResources();
    if (resources.length === 0) {
      return;
    }
    const source = URI.parse(`multi-diff-editor:${Date.now().toString()}-${Math.random().toString(36).slice(2)}`);
    this.editorService.openEditor({
      multiDiffSource: source,
      label: localize("chat.thinking.changes.title", "Section File Changes"),
      resources: resources.map((resource) => ({
        original: { resource: resource.originalURI },
        modified: { resource: resource.modifiedURI },
        goToFileResource: resource.resource
      }))
    });
  }
  getFinalizedDisplayTitle(title) {
    if (this.thinkingDisplayMode !== ThinkingDisplayMode.Collapsed || !this.containsReasoning || this.containsGroupedItems || !this.reasoningDurationMs) {
      return title;
    }
    const seconds = Math.ceil(this.reasoningDurationMs / 1e3);
    const duration = localize("chat.thinking.duration.seconds", "{0}s", seconds);
    return localize("chat.thinking.titleWithDuration", "{0} - {1}", title, duration);
  }
  hasReasoningContent() {
    return this.containsReasoning;
  }
  hasGroupedItems() {
    return this.containsGroupedItems;
  }
  recordReasoningContent(content) {
    if (!content.trim()) {
      return;
    }
    this.containsReasoning = true;
  }
  setDropdownClickable(clickable) {
    if (this._collapseButton) {
      this._collapseButton.element.style.pointerEvents = clickable ? "auto" : "none";
    }
    if (!clickable && this.streamingCompleted) {
      this.setFinalizedTitle(this.lastExtractedTitle ?? this.currentTitle);
    }
  }
  shouldAllowExpansion() {
    if (this.toolInvocationCount > 0 || this.lazyItems.length > 0) {
      return true;
    }
    if (this.wrapper) {
      const meaningfulChildren = Array.from(this.wrapper.children).filter((child) => child !== this.workingSpinnerElement).length;
      if (meaningfulChildren > 1) {
        return true;
      }
    }
    const contentWithoutTitle = this.currentThinkingValue.trim();
    const titleToCompare = this.lastExtractedTitle ?? this.currentTitle;
    const stripMarkdown = (text) => {
      return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/`(.+?)`/g, "$1").trim();
    };
    const strippedContent = stripMarkdown(contentWithoutTitle);
    return !(!strippedContent || strippedContent === titleToCompare);
  }
  updateDropdownClickability(knownContentHeight) {
    let allowExpansion = this.shouldAllowExpansion();
    if (allowExpansion && this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete && this.wrapper) {
      const contentHeight = knownContentHeight ?? this.lastKnownContentHeight;
      if (!contentHeight || contentHeight <= THINKING_SCROLL_MAX_HEIGHT) {
        allowExpansion = false;
      }
    }
    if (!allowExpansion && this.isExpanded() && (this.streamingCompleted || this.element.isComplete)) {
      this.setExpanded(false);
    }
    this.setDropdownClickable(allowExpansion);
  }
  appendToWrapper(element) {
    if (!this.wrapper) {
      return;
    }
    if (this.workingSpinnerElement && this.workingSpinnerElement.parentNode === this.wrapper) {
      this.wrapper.insertBefore(element, this.workingSpinnerElement);
    } else {
      this.wrapper.appendChild(element);
    }
  }
  updateWorkingSpinnerVisibility(reader) {
    if (!this.wrapper || !this.workingSpinnerElement) {
      return;
    }
    const hasRunningTerminalTool = this.toolInvocations.some((toolInvocation) => {
      const terminalData = toolInvocation.toolSpecificData;
      if (terminalData?.kind !== "terminal" || terminalData.terminalCommandState?.exitCode !== void 0) {
        return false;
      }
      return !IChatToolInvocation.isComplete(toolInvocation, reader);
    });
    const isAttached = this.workingSpinnerElement.parentNode === this.wrapper;
    if (hasRunningTerminalTool && isAttached) {
      this.workingSpinnerElement.remove();
      this._onDidChangeHeight.fire();
    } else if (!hasRunningTerminalTool && !isAttached && !this.streamingCompleted && !this.element.isComplete) {
      this.wrapper.appendChild(this.workingSpinnerElement);
      this._onDidChangeHeight.fire();
    }
  }
  resetId() {
    this.id = void 0;
  }
  collapseContent() {
    this.setExpanded(false);
  }
  updateThinking(content) {
    if (this._store.isDisposed) {
      return;
    }
    this.content = content;
    this.reasoningDurationMs = content.reasoningDurationMs;
    for (const lazyItem of this.lazyItems) {
      if (lazyItem.kind === "thinking" && lazyItem.content.id === content.id) {
        lazyItem.content = content;
        break;
      }
    }
    const raw = extractTextFromPart(content);
    this.recordReasoningContent(raw);
    const next = raw;
    if (next === this.currentThinkingValue) {
      return;
    }
    const previousValue = this.currentThinkingValue;
    const reuseExisting = !!(this._markdownResult.value && next.startsWith(previousValue) && next.length > previousValue.length);
    this.currentThinkingValue = next;
    this.renderMarkdown(next, reuseExisting);
    if (this.fixedScrollingMode && this.scrollableElement) {
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    }
    const extractedTitle = extractTitleFromThinkingContent(raw);
    if (extractedTitle && extractedTitle !== this.currentTitle) {
      if (!this.extractedTitles.includes(extractedTitle)) {
        this.extractedTitles.push(extractedTitle);
      }
      this.lastExtractedTitle = extractedTitle;
    }
    if (!extractedTitle || extractedTitle === this.currentTitle) {
      return;
    }
    const label = this.lastExtractedTitle ?? "";
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(label);
    }
    this.updateDropdownClickability();
  }
  getIsActive() {
    return this.isActive;
  }
  /**
   * Returns true when this thinking part has no meaningful content to display:
   * no tool invocations, no lazy items, no hooks, and no thinking text.
   * This happens when a tool is removed from thinking (e.g. due to confirmation)
   * and the thinking part was only created to hold that tool.
   */
  isEffectivelyEmpty() {
    this.processPendingRemovals();
    if (this.toolInvocationCount > 0 || this.lazyItems.length > 0 || this.hookCount > 0) {
      return false;
    }
    if (this.currentThinkingValue.trim().length > 0) {
      return false;
    }
    return true;
  }
  markAsInactive() {
    this.isActive = false;
    this.domNode.classList.remove("chat-thinking-active");
    this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
    this.processPendingRemovals();
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    for (const toolInvocation of this.toolInvocations) {
      toolInvocation.isAttachedToThinking = false;
    }
  }
  finalizeTitleIfDefault() {
    this.processPendingRemovals();
    if (this.wrapper) {
      this.wrapper.classList.remove("chat-thinking-streaming");
    }
    this.domNode.classList.remove("chat-thinking-active");
    this.domNode.classList.remove("chat-thinking-fade-top", "chat-thinking-fade-bottom");
    this.streamingCompleted = true;
    this.setContentAnimationEnabled(!this.fixedScrollingMode);
    this.flushPendingExternalResources();
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
    this.updateScrollDimensionsForCompletion();
    this.updateDropdownClickability();
    if (this.content.generatedTitle) {
      this.currentTitle = this.content.generatedTitle;
      this.setGeneratedTitleOnAllParts(this.content.generatedTitle);
      this.setFinalizedTitle(this.content.generatedTitle);
      return;
    }
    const existingTitle = this.toolInvocations.find((t) => t.generatedTitle)?.generatedTitle ?? this.allThinkingParts.find((t) => t.generatedTitle)?.generatedTitle;
    if (existingTitle) {
      this.currentTitle = existingTitle;
      this.content.generatedTitle = existingTitle;
      this.setGeneratedTitleOnAllParts(existingTitle);
      this.setFinalizedTitle(existingTitle);
      return;
    }
    const allToolsSerialized = this.toolInvocations.every((t) => t.kind === "toolInvocationSerialized");
    if (allToolsSerialized && !LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
      const cacheId = this.getTitleCacheId();
      if (cacheId) {
        const cachedTitle = this.getCachedTitle(cacheId);
        if (cachedTitle) {
          this.currentTitle = cachedTitle;
          this.content.generatedTitle = cachedTitle;
          this.setGeneratedTitleOnAllParts(cachedTitle);
          this.setFinalizedTitle(cachedTitle);
          return;
        }
      }
    }
    if (this.toolInvocationCount === 1 && this.hookCount === 0 && this.currentThinkingValue.trim() === "") {
      if (!this.singleItemInfo) {
        const lazyItem = this.lazyItems.find((item) => item.kind === "tool" && item.originalParent);
        if (lazyItem && lazyItem.kind === "tool") {
          const toolInvocation = lazyItem.toolInvocationOrMarkdown && (lazyItem.toolInvocationOrMarkdown.kind === "toolInvocation" || lazyItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? lazyItem.toolInvocationOrMarkdown : void 0;
          const result = lazyItem.lazy.value;
          this.appendItemToDOM(result.domNode, lazyItem.toolInvocationId, lazyItem.toolInvocationOrMarkdown, lazyItem.originalParent);
          if (result.disposable) {
            const toolCallId = toolInvocation?.toolCallId;
            if (toolCallId) {
              this.ownedToolParts.set(toolCallId, result.disposable);
            } else {
              this._register(result.disposable);
            }
          }
        }
      }
      if (this.singleItemInfo && this.restoreSingleItemToOriginalPosition()) {
        return;
      }
    }
    if (this.extractedTitles.length === 1 && this.toolInvocationCount === 0) {
      const title = this.extractedTitles[0];
      this.currentTitle = title;
      this.content.generatedTitle = title;
      this.setGeneratedTitleOnAllParts(title);
      this.setFinalizedTitle(title);
      return;
    }
    const generateTitles = this.configurationService.getValue(ChatConfiguration.ThinkingGenerateTitles) ?? true;
    if (!generateTitles) {
      this.setFallbackTitle();
      return;
    }
    this.generateTitleViaLLM();
  }
  setGeneratedTitleOnAllParts(title) {
    for (const toolInvocation of this.toolInvocations) {
      toolInvocation.generatedTitle = title;
    }
    for (const thinkingPart of this.allThinkingParts) {
      thinkingPart.generatedTitle = title;
    }
  }
  loadTitleCache() {
    return this.storageService.getObject(TITLE_CACHE_STORAGE_KEY, StorageScope.PROFILE) ?? {};
  }
  saveTitleCache(cache) {
    if (Object.keys(cache).length === 0) {
      this.storageService.remove(TITLE_CACHE_STORAGE_KEY, StorageScope.PROFILE);
    } else {
      this.storageService.store(TITLE_CACHE_STORAGE_KEY, JSON.stringify(cache), StorageScope.PROFILE, StorageTarget.MACHINE);
    }
  }
  getTitleCacheKey(id) {
    return `${chatSessionResourceToId(this.element.sessionResource)}:${id}`;
  }
  /**
   * Stable id used to persist/restore the generated title. Tool-based blocks
   * key off the last tool call id; reasoning-only blocks fall back to the
   * thinking part id so their headers also survive a session reload.
   */
  getTitleCacheId() {
    const lastTool = this.toolInvocations[this.toolInvocations.length - 1];
    if (lastTool) {
      return lastTool.toolCallId;
    }
    return this.allThinkingParts.find((t) => t.id)?.id ?? this.content.id;
  }
  getCachedTitle(id) {
    const entry = this.loadTitleCache()[this.getTitleCacheKey(id)];
    if (!entry || Date.now() - entry.storedAt > TITLE_CACHE_TTL_MS) {
      return void 0;
    }
    return entry.title;
  }
  setCachedTitle(id, title) {
    const cache = this.loadTitleCache();
    const now = Date.now();
    for (const key of Object.keys(cache)) {
      if (now - cache[key].storedAt > TITLE_CACHE_TTL_MS) {
        delete cache[key];
      }
    }
    cache[this.getTitleCacheKey(id)] = { title, storedAt: now };
    const keys = Object.keys(cache);
    if (keys.length > TITLE_CACHE_MAX_ENTRIES) {
      const sorted = keys.sort((a, b) => cache[a].storedAt - cache[b].storedAt);
      for (let i = 0; i < sorted.length - TITLE_CACHE_MAX_ENTRIES; i++) {
        delete cache[sorted[i]];
      }
    }
    this.saveTitleCache(cache);
  }
  async generateTitleViaLLM() {
    const cts = new CancellationTokenSource();
    const timeout = setTimeout(() => cts.cancel(), 5e3);
    try {
      const models = await this.languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
      if (!models.length) {
        this.setFallbackTitle();
        return;
      }
      if (cts.token.isCancellationRequested) {
        this.setFallbackTitle();
        return;
      }
      let context;
      if (this.extractedTitles.length > 0) {
        context = this.extractedTitles.join(", ");
      } else {
        context = this.currentThinkingValue.substring(0, 1e3);
      }
      const prompt = `Summarize the following content in a SINGLE sentence (under 10 words) using past tense. Follow these rules strictly:

			OUTPUT FORMAT:
			- MUST be a single sentence
			- MUST be under 10 words
			- The FIRST word MUST be a past tense verb (e.g. "Updated", "Reviewed", "Created", "Searched", "Analyzed")
			- No quotes, no trailing punctuation

			GENERAL:
			- The content may include tool invocations (file edits, reads, searches, terminal commands), reasoning headers, or raw thinking text
			- For reasoning headers or thinking text (no tool calls), summarize WHAT was considered/analyzed, NOT that thinking occurred
			- For thinking-only summaries, use phrases like: "Considered...", "Planned...", "Analyzed...", "Reviewed..."

			TOOL NAME FILTERING:
			- NEVER include tool names like "Replace String in File", "Multi Replace String in File", "Create File", "Read File", etc. in the output
			- If an action says "Edited X and used Replace String in File", output ONLY the action on X
			- Tool names describe HOW something was done, not WHAT was done - always omit them

			VOCABULARY - Use varied synonyms for natural-sounding summaries:
			- For edits: "Updated", "Modified", "Changed", "Refactored", "Fixed", "Adjusted"
			- For reads: "Reviewed", "Examined", "Checked", "Inspected", "Analyzed", "Explored"
			- For creates: "Created", "Added", "Generated"
			- For searches: "Searched for", "Looked up", "Investigated"
			- For terminal: "Ran command", "Executed"
			- For reasoning/thinking: "Considered", "Planned", "Analyzed", "Reviewed", "Evaluated"
			- Choose the synonym that best fits the context

${this.hookCount > 0 ? `BLOCKED/DENIED CONTENT (hooks detected):
			- Only mention "blocked" if the content explicitly includes hook results that blocked or warned about a tool (e.g. "Blocked terminal" or "Warning for read_file")
			- If blocked items are present alongside normal tool calls, briefly note the block but do NOT let it dominate the summary: e.g. "Updated file.ts, blocked terminal"

			` : `IMPORTANT: Do NOT use words like "blocked", "denied", or "tried" in the summary - there are no hooks or blocked items in this content. Just summarize normally.

			`}RULES FOR TOOL CALLS:
			1. If the SAME file was both edited AND read: Use a combined phrase like "Reviewed and updated <filename>"
			2. If exactly ONE file was edited: Start with an edit synonym + "<filename>" (include actual filename)
			3. If exactly ONE file was read: Start with a read synonym + "<filename>" (include actual filename)
			4. If MULTIPLE files were edited: Start with an edit synonym + "X files"
			5. If MULTIPLE files were read: Start with a read synonym + "X files"
			6. If BOTH edits AND reads occurred on DIFFERENT files: Combine them naturally
			7. For searches: Say "searched for <term>" or "looked up <term>" with the actual search term, NOT "searched for files"
			8. After the file info, you may add a brief summary of other actions if space permits
			9. NEVER say "1 file" - always use the actual filename when there's only one file

			RULES FOR REASONING HEADERS (no tool calls):
			1. If the input contains reasoning/analysis headers without actual tool invocations, summarize the main topic and what was considered
			2. Use past tense verbs that indicate thinking, not doing: "Considered", "Planned", "Analyzed", "Evaluated"
			3. Focus on WHAT was being thought about, not that thinking occurred

			RULES FOR RAW THINKING TEXT:
			1. Extract the main topic or question being considered from the text
			2. Identify any specific files, functions, or concepts mentioned
			3. Summarize as "Analyzed <topic>" or "Considered <specific thing>"
			4. If discussing code structure: "Reviewed <component/architecture>"
			5. If discussing a problem: "Analyzed <problem description>"
			6. If discussing implementation: "Planned <feature/change>"

			EXAMPLES WITH TOOLS:
			- "Read HomePage.tsx, Edited HomePage.tsx" \u2192 "Reviewed and updated HomePage.tsx"
			- "Edited HomePage.tsx" \u2192 "Updated HomePage.tsx"
			- "Edited config.css and used Replace String in File" \u2192 "Modified config.css"
			- "Edited App.tsx, used Multi Replace String in File" \u2192 "Refactored App.tsx"
			- "Read config.json, Read package.json" \u2192 "Reviewed 2 files"
			- "Edited App.tsx, Read utils.ts" \u2192 "Updated App.tsx and checked utils.ts"
			- "Edited App.tsx, Read utils.ts, Read types.ts" \u2192 "Updated App.tsx and reviewed 2 files"
			- "Edited index.ts, Edited styles.css, Ran terminal command" \u2192 "Modified 2 files and ran command"
			- "Read README.md, Searched for AuthService" \u2192 "Checked README.md and searched for AuthService"
			- "Searched for login, Searched for authentication" \u2192 "Searched for login and authentication"
			- "Edited api.ts, Edited models.ts, Read schema.json" \u2192 "Updated 2 files and reviewed schema.json"
			- "Edited Button.tsx, Edited Button.css, Edited index.ts" \u2192 "Modified 3 files"
			- "Searched codebase for error handling" \u2192 "Looked up error handling"

${this.hookCount > 0 ? `EXAMPLES WITH BLOCKED CONTENT (from hooks):
			- "Blocked terminal, Edited config.ts" \u2192 "Edited config.ts, terminal was blocked"
			- "Blocked terminal, Blocked read_file" \u2192 "Two tools were blocked by hooks"
			- "Warning for read_file, Edited utils.ts" \u2192 "Edited utils.ts with a hook warning"

			` : ""}EXAMPLES WITH REASONING HEADERS (no tools):
			- "Analyzing component architecture" \u2192 "Considered component architecture"
			- "Planning refactor strategy" \u2192 "Planned refactor strategy"
			- "Reviewing error handling approach, Considering edge cases" \u2192 "Analyzed error handling approach"
			- "Understanding the codebase structure" \u2192 "Reviewed codebase structure"
			- "Thinking about implementation options" \u2192 "Considered implementation options"

			EXAMPLES WITH RAW THINKING TEXT:
			- "I need to understand how the authentication flow works in this app..." \u2192 "Analyzed authentication flow"
			- "Let me think about how to refactor this component to be more maintainable..." \u2192 "Planned component refactoring"
			- "The error seems to be coming from the database connection..." \u2192 "Investigated database connection issue"
			- "Looking at the UserService class, I see it handles..." \u2192 "Reviewed UserService implementation"

			Content: ${context}`;
      const response = await this.languageModelsService.sendChatRequest(
        models[0],
        void 0,
        [{ role: ChatMessageRole.User, content: [{ type: "text", value: prompt }] }],
        {},
        cts.token
      );
      let generatedTitle = "";
      for await (const part of response.stream) {
        if (cts.token.isCancellationRequested) {
          break;
        }
        if (Array.isArray(part)) {
          for (const p of part) {
            if (p.type === "text") {
              generatedTitle += p.value;
            }
          }
        } else if (part.type === "text") {
          generatedTitle += part.value;
        }
      }
      if (cts.token.isCancellationRequested) {
        this.setFallbackTitle();
        return;
      }
      await response.result;
      generatedTitle = generatedTitle.trim();
      if (generatedTitle.includes("can't assist with that")) {
        this.setFallbackTitle();
        return;
      }
      if (generatedTitle && !this._store.isDisposed) {
        this.currentTitle = generatedTitle;
        this.setFinalizedTitle(generatedTitle);
        this.content.generatedTitle = generatedTitle;
        this.setGeneratedTitleOnAllParts(generatedTitle);
        if (!LocalChatSessionUri.isLocalSession(this.element.sessionResource)) {
          const cacheId = this.getTitleCacheId();
          if (cacheId) {
            this.setCachedTitle(cacheId, generatedTitle);
          }
        }
        return;
      }
    } catch (error) {
    } finally {
      clearTimeout(timeout);
      cts.dispose();
    }
    this.setFallbackTitle();
  }
  restoreSingleItemToOriginalPosition() {
    if (!this.singleItemInfo) {
      return false;
    }
    const { element, thinkingWrapper, originalParent, originalNextSibling, restoreToOriginalParent, toolInvocation } = this.singleItemInfo;
    const hasOtherThinkingItems = this.wrapper && Array.from(this.wrapper.children).some(
      (child) => child !== thinkingWrapper && child !== this.workingSpinnerElement
    );
    if (hasOtherThinkingItems) {
      this.singleItemInfo = void 0;
      return false;
    }
    const precedingToolInvocationPart = isHTMLElement(originalNextSibling) && originalNextSibling.parentElement === originalParent ? originalNextSibling.previousElementSibling : originalParent.lastElementChild;
    if (restoreToOriginalParent) {
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(element, originalNextSibling);
      } else {
        originalParent.appendChild(element);
      }
    } else if (precedingToolInvocationPart?.classList.contains("chat-tool-invocation-part")) {
      precedingToolInvocationPart.appendChild(element);
    } else if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
      originalParent.insertBefore(element, originalNextSibling);
    } else {
      originalParent.appendChild(element);
    }
    thinkingWrapper.remove();
    if (toolInvocation) {
      this.toolWrappersByCallId.delete(toolInvocation.toolCallId);
      this.toolIconsByCallId.delete(toolInvocation.toolCallId);
      toolInvocation.isAttachedToThinking = false;
    }
    hide(this.domNode);
    this.singleItemInfo = void 0;
    return true;
  }
  updateAggregatedDiff() {
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const data of this.diffDataByPartId.values()) {
      totalAdded += data.added;
      totalRemoved += data.removed;
    }
    this._aggregatedDiff = { added: totalAdded, removed: totalRemoved };
    if (this.streamingCompleted || this.element.isComplete) {
      this.setFinalizedTitle(this.currentTitle);
    }
  }
  setFallbackTitle() {
    const finalLabel = this.appendedItemCount > 0 ? this.appendedItemCount === 1 ? localize("chat.thinking.finished.withStepsSingular", "Finished with 1 step") : localize("chat.thinking.finished.withStepsPlural", "Finished with {0} steps", this.appendedItemCount) : localize("chat.thinking.finished", "Finished Working");
    this.currentTitle = finalLabel;
    if (this.wrapper) {
      this.wrapper.classList.remove("chat-thinking-streaming");
    }
    this.domNode.classList.remove("chat-thinking-active");
    this.streamingCompleted = true;
    this.flushPendingExternalResources();
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
      this.setFinalizedTitle(finalLabel);
    }
    this.updateDropdownClickability();
  }
  /**
   * Appends a tool invocation or content item to the thinking group.
   * The factory is called lazily - only when the thinking section is expanded.
   * If already expanded, the factory is called immediately.
   *
   * When the caller has already created the content part eagerly (for example, a
   * pre-built `ChatMarkdownContentPart` wrapped in a factory), the caller MUST pass
   * that part as `eagerDisposable` so it is registered on this thinking part
   * immediately. Otherwise, if the thinking section is collapsed and the lazy item
   * is never materialized (because the user never expands it), the eagerly-created
   * part would leak: its disposable is only referenced from inside the factory's
   * closure, which nothing ever calls.
   */
  appendItem(factory, toolInvocationId, toolInvocationOrMarkdown, originalParent, onDidChangeDiff, eagerDisposable) {
    this.processPendingRemovals();
    this.containsGroupedItems = true;
    this.trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown);
    this.updateWorkingSpinnerVisibility();
    this.appendedItemCount++;
    if (onDidChangeDiff && toolInvocationId) {
      this.diffDataByPartId.set(toolInvocationId, { added: 0, removed: 0, resources: [] });
      this._register(onDidChangeDiff((data) => {
        this.diffDataByPartId.set(toolInvocationId, data);
        this.updateAggregatedDiff();
      }));
    }
    if (eagerDisposable) {
      this._register(eagerDisposable);
    }
    if (this.workingSpinnerLabel) {
      const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
      const category = isTerminalTool ? "terminal" /* Terminal */ : "tool" /* Tool */;
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
    }
    if (this.isExpanded() || this.hasExpandedOnce || this.fixedScrollingMode && !this.streamingCompleted) {
      const result = factory();
      this.appendItemToDOM(result.domNode, toolInvocationId, toolInvocationOrMarkdown, originalParent);
      if (result.disposable) {
        const toolCallId = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown.toolCallId : void 0;
        if (toolCallId) {
          this.ownedToolParts.set(toolCallId, result.disposable);
        } else {
          this._register(result.disposable);
        }
      }
    } else {
      const item = {
        kind: "tool",
        lazy: new Lazy(factory),
        toolInvocationId,
        toolInvocationOrMarkdown,
        originalParent,
        isHook: !toolInvocationOrMarkdown && !!toolInvocationId
      };
      this.lazyItems.push(item);
    }
    this.updateDropdownClickability();
  }
  removeMaterializedItem(toolCallId) {
    this.toolDisposables.deleteAndDispose(toolCallId);
    this.ownedToolParts.delete(toolCallId);
    const wrapper = this.toolWrappersByCallId.get(toolCallId);
    if (wrapper) {
      this.toolWrappersByCallId.delete(toolCallId);
      this.toolIconsByCallId.delete(toolCallId);
    }
    this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
    this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolCallId === toolCallId
    );
    if (toolInvocationsIndex !== -1) {
      const label = this.toolLabelsByCallId.get(toolCallId);
      if (label) {
        const titleIndex = this.extractedTitles.indexOf(label);
        if (titleIndex !== -1) {
          this.extractedTitles.splice(titleIndex, 1);
        }
      }
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    this.toolLabelsByCallId.delete(toolCallId);
    this._pendingExternalResources.delete(toolCallId);
    this._externalResourceWidget.removeToolInvocation(toolCallId);
    this.updateWorkingSpinnerVisibility();
    this.updateDropdownClickability();
    this._onDidChangeHeight.fire();
  }
  /**
   * Removes a markdown edit pill child by its part ID (codeblocksPartId).
   */
  removeEditPillByPartId(partId) {
    let removed = false;
    const lazyIndex = this.lazyItems.findIndex((item) => item.kind === "tool" && item.toolInvocationId === partId);
    if (lazyIndex !== -1) {
      this.lazyItems.splice(lazyIndex, 1);
      removed = true;
    }
    if (this.diffDataByPartId.delete(partId)) {
      this.updateAggregatedDiff();
      removed = true;
    }
    if (removed) {
      this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
      this.updateDropdownClickability();
      this._onDidChangeHeight.fire();
    }
  }
  /**
   * removes/re-establishes a lazy item from the thinking container
   * this is needed so we can check if there are confirmations still needed
   */
  removeLazyItem(toolInvocationId) {
    const index = this.lazyItems.findIndex((item) => item.kind === "tool" && item.toolInvocationId === toolInvocationId);
    if (index === -1) {
      return false;
    }
    const removedItem = this.lazyItems[index];
    this.lazyItems.splice(index, 1);
    this.appendedItemCount--;
    if (removedItem.kind === "tool" && removedItem.isHook) {
      this.hookCount = Math.max(0, this.hookCount - 1);
    } else {
      this.toolInvocationCount--;
    }
    if (removedItem.kind === "tool" && removedItem.toolInvocationOrMarkdown && (removedItem.toolInvocationOrMarkdown.kind === "toolInvocation" || removedItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized")) {
      removedItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
      const toolCallId = removedItem.toolInvocationOrMarkdown.toolCallId;
      this._pendingExternalResources.delete(toolCallId);
      this._externalResourceWidget.removeToolInvocation(toolCallId);
      const label = this.toolLabelsByCallId.get(toolCallId);
      if (label) {
        const titleIndex = this.extractedTitles.indexOf(label);
        if (titleIndex !== -1) {
          this.extractedTitles.splice(titleIndex, 1);
        }
      }
      this.toolLabelsByCallId.delete(toolCallId);
    }
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolId === toolInvocationId
    );
    if (toolInvocationsIndex !== -1) {
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    this.updateDropdownClickability();
    this.updateWorkingSpinnerVisibility();
    return true;
  }
  processPendingRemovals() {
    this.pendingRemovalFlushDisposable?.dispose();
    this.pendingRemovalFlushDisposable = void 0;
    if (this.pendingRemovals.length === 0) {
      return;
    }
    const pendingRemovals = this.pendingRemovals;
    this.pendingRemovals = [];
    for (const pending of pendingRemovals) {
      this.removeStreamingToolEntry(pending.toolCallId, pending.toolLabel);
    }
  }
  schedulePendingRemovalsFlush() {
    if (this.pendingRemovalFlushDisposable) {
      return;
    }
    this.pendingRemovalFlushDisposable = scheduleAtNextAnimationFrame(getWindow(this.domNode), () => {
      this.pendingRemovalFlushDisposable = void 0;
      if (this._store.isDisposed) {
        return;
      }
      this.processPendingRemovals();
    });
  }
  // removes the tool entry that was previously streaming and now is not. removes item from dom and internal tracking.
  removeStreamingToolEntry(toolCallId, toolLabel) {
    this.toolDisposables.deleteAndDispose(toolCallId);
    this.ownedToolParts.get(toolCallId)?.dispose();
    this.ownedToolParts.delete(toolCallId);
    const wrapper = this.toolWrappersByCallId.get(toolCallId);
    if (wrapper) {
      wrapper.remove();
      this.toolWrappersByCallId.delete(toolCallId);
      this.toolIconsByCallId.delete(toolCallId);
    }
    const lazyIndex = this.lazyItems.findIndex(
      (item) => item.kind === "tool" && item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && item.toolInvocationOrMarkdown.toolCallId === toolCallId
    );
    if (lazyIndex !== -1) {
      const removedLazyItem = this.lazyItems[lazyIndex];
      if (removedLazyItem.kind === "tool" && removedLazyItem.toolInvocationOrMarkdown && (removedLazyItem.toolInvocationOrMarkdown.kind === "toolInvocation" || removedLazyItem.toolInvocationOrMarkdown.kind === "toolInvocationSerialized")) {
        removedLazyItem.toolInvocationOrMarkdown.isAttachedToThinking = false;
      }
      this.lazyItems.splice(lazyIndex, 1);
    }
    this.appendedItemCount = Math.max(0, this.appendedItemCount - 1);
    this.toolInvocationCount = Math.max(0, this.toolInvocationCount - 1);
    const toolInvocationsIndex = this.toolInvocations.findIndex(
      (t) => (t.kind === "toolInvocation" || t.kind === "toolInvocationSerialized") && t.toolCallId === toolCallId
    );
    if (toolInvocationsIndex !== -1) {
      this.toolInvocations.splice(toolInvocationsIndex, 1);
    }
    const titleIndex = this.extractedTitles.indexOf(toolLabel);
    if (titleIndex !== -1) {
      this.extractedTitles.splice(titleIndex, 1);
    }
    this.toolLabelsByCallId.delete(toolCallId);
    this._pendingExternalResources.delete(toolCallId);
    this._externalResourceWidget.removeToolInvocation(toolCallId);
    this.updateWorkingSpinnerVisibility();
    this.updateDropdownClickability();
    this._onDidChangeHeight.fire();
  }
  trackToolMetadata(toolInvocationId, toolInvocationOrMarkdown) {
    if (!toolInvocationId) {
      return;
    }
    const isHook = !toolInvocationOrMarkdown;
    if (isHook) {
      this.hookCount++;
    } else {
      this.toolInvocationCount++;
    }
    if (this.toolInvocationCount === 1) {
      this.defaultTitle = this.workingTitle;
    }
    let toolCallLabel;
    const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized");
    if (isToolInvocation && toolInvocationOrMarkdown.invocationMessage) {
      const message = typeof toolInvocationOrMarkdown.invocationMessage === "string" ? toolInvocationOrMarkdown.invocationMessage : toolInvocationOrMarkdown.invocationMessage.value;
      const isStreamingEditTool = toolInvocationOrMarkdown.kind === "toolInvocation" && IChatToolInvocation.isStreaming(toolInvocationOrMarkdown) && isGenericEditToolId(toolInvocationOrMarkdown.toolId);
      if (isStreamingEditTool) {
        toolCallLabel = localize("chat.thinking.editingFiles", "Editing files");
      } else {
        toolCallLabel = message;
      }
      this.toolInvocations.push(toolInvocationOrMarkdown);
      const toolCallId = toolInvocationOrMarkdown.toolCallId;
      this.toolLabelsByCallId.set(toolCallId, toolCallLabel);
      if (toolInvocationOrMarkdown.kind === "toolInvocationSerialized") {
        this.updateExternalResourceParts(toolInvocationOrMarkdown);
        if (IChatToolInvocation.isEffectivelyHidden(toolInvocationOrMarkdown)) {
          this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: toolCallLabel });
          this.schedulePendingRemovalsFlush();
        }
      }
      if (toolInvocationOrMarkdown.kind === "toolInvocation") {
        let currentToolLabel = toolCallLabel;
        let isComplete = false;
        let isStreaming = IChatToolInvocation.isStreaming(toolInvocationOrMarkdown);
        const toolStore = new DisposableStore();
        this.toolDisposables.set(toolInvocationOrMarkdown.toolCallId, toolStore);
        const updateTitle = (updatedMessage) => {
          if (updatedMessage && updatedMessage !== currentToolLabel) {
            const oldIndex = this.extractedTitles.indexOf(currentToolLabel);
            const updatedIndex = this.extractedTitles.indexOf(updatedMessage);
            if (oldIndex !== -1) {
              if (updatedIndex !== -1 && updatedIndex !== oldIndex) {
                this.extractedTitles.splice(oldIndex, 1);
              } else {
                this.extractedTitles[oldIndex] = updatedMessage;
              }
            } else if (updatedIndex === -1) {
              this.extractedTitles.push(updatedMessage);
            }
            currentToolLabel = updatedMessage;
            this.toolLabelsByCallId.set(toolCallId, updatedMessage);
            this.lastExtractedTitle = updatedMessage;
            if (!this.fixedScrollingMode && !this._isExpanded.read(void 0)) {
              this.setTitle(updatedMessage);
            }
          }
        };
        const autorunDisposable = autorun((reader) => {
          if (isComplete) {
            return;
          }
          const currentState = toolInvocationOrMarkdown.state.read(reader);
          this.updateWorkingSpinnerVisibility(reader);
          if (isStreaming && currentState.type !== IChatToolInvocation.StateKind.Streaming) {
            isStreaming = false;
            const termData = toolInvocationOrMarkdown.toolSpecificData;
            if (termData?.kind === "terminal") {
              const iconEl = this.toolIconsByCallId.get(toolCallId);
              if (iconEl) {
                const newIcon = termData.commandLine?.isSandboxWrapped ? Codicon.terminalSecure : Codicon.terminal;
                setThinkingIcon(iconEl, newIcon);
              }
            }
            if (toolInvocationOrMarkdown.presentation === "hidden") {
              this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
              this.schedulePendingRemovalsFlush();
              isComplete = true;
              return;
            }
          }
          if (currentState.type === IChatToolInvocation.StateKind.Completed || currentState.type === IChatToolInvocation.StateKind.Cancelled) {
            if (toolInvocationOrMarkdown.presentation === "hidden" || toolInvocationOrMarkdown.presentation === "hiddenAfterComplete") {
              this.pendingRemovals.push({ toolCallId: toolInvocationOrMarkdown.toolCallId, toolLabel: currentToolLabel });
              this.schedulePendingRemovalsFlush();
            }
            if (currentState.type === IChatToolInvocation.StateKind.Completed) {
              this.updateExternalResourceParts(toolInvocationOrMarkdown);
              const completedMessage = toolInvocationOrMarkdown.pastTenseMessage ?? toolInvocationOrMarkdown.invocationMessage;
              const completedText = typeof completedMessage === "string" ? completedMessage : completedMessage.value;
              const iconElement = this.toolIconsByCallId.get(toolCallId);
              if (iconElement && isNoProblemsFoundResult(toolInvocationOrMarkdown.toolId, completedText)) {
                setThinkingIcon(iconElement, Codicon.search);
              }
            }
            isComplete = true;
            return;
          }
          if (currentState.type === IChatToolInvocation.StateKind.Streaming) {
            isStreaming = true;
            const streamingMessage = currentState.streamingMessage.read(reader);
            if (streamingMessage) {
              const updatedMessage = typeof streamingMessage === "string" ? streamingMessage : streamingMessage.value;
              updateTitle(updatedMessage);
            }
            return;
          }
          if (currentState.type === IChatToolInvocation.StateKind.Executing) {
            const progressData = currentState.progress.read(reader);
            if (progressData.message) {
              const updatedMessage = typeof progressData.message === "string" ? progressData.message : progressData.message.value;
              updateTitle(updatedMessage);
            } else {
              const invocationMsg2 = toolInvocationOrMarkdown.invocationMessage;
              if (invocationMsg2) {
                const updatedMessage = typeof invocationMsg2 === "string" ? invocationMsg2 : invocationMsg2.value;
                updateTitle(updatedMessage);
              }
            }
            return;
          }
          const invocationMsg = toolInvocationOrMarkdown.invocationMessage;
          if (invocationMsg) {
            const updatedMessage = typeof invocationMsg === "string" ? invocationMsg : invocationMsg.value;
            updateTitle(updatedMessage);
          }
        });
        toolStore.add(autorunDisposable);
      }
    } else if (toolInvocationOrMarkdown?.kind === "markdownContent") {
      const codeblockInfo = extractCodeblockUrisFromText(toolInvocationOrMarkdown.content.value);
      if (codeblockInfo?.uri) {
        const filename = basename(codeblockInfo.uri);
        toolCallLabel = localize("chat.thinking.editedFile", "Edited {0}", filename);
      } else {
        toolCallLabel = localize("chat.thinking.editingFile", "Edited file");
      }
    } else if (toolInvocationOrMarkdown?.kind === "externalEdit") {
      const filename = basename(toolInvocationOrMarkdown.uri);
      switch (toolInvocationOrMarkdown.editKind) {
        case "create":
          toolCallLabel = localize("chat.thinking.createdFile", "Created {0}", filename);
          break;
        case "delete":
          toolCallLabel = localize("chat.thinking.deletedFile", "Deleted {0}", filename);
          break;
        case "rename":
          toolCallLabel = localize("chat.thinking.renamedFile", "Renamed {0}", filename);
          break;
        case "edit":
          toolCallLabel = localize("chat.thinking.editedFile", "Edited {0}", filename);
          break;
      }
    } else {
      toolCallLabel = toolInvocationId;
    }
    if (!this.extractedTitles.includes(toolCallLabel)) {
      this.extractedTitles.push(toolCallLabel);
    }
    this.lastExtractedTitle = toolCallLabel;
    if (!this.fixedScrollingMode && !this._isExpanded.get()) {
      this.setTitle(toolCallLabel);
    }
  }
  updateExternalResourceParts(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind === "terminal") {
      return;
    }
    if (this.fixedScrollingMode && !this.streamingCompleted && !this.element.isComplete) {
      this._pendingExternalResources.set(toolInvocation.toolCallId, toolInvocation);
      return;
    }
    const extractedImages = extractImagesFromToolInvocationOutputDetails(toolInvocation, this.element.sessionResource);
    if (extractedImages.length === 0) {
      return;
    }
    const parts = extractedImages.map((image) => ({
      kind: "data",
      value: image.data.buffer,
      mimeType: image.mimeType,
      uri: image.uri
    }));
    this._externalResourceWidget.setToolInvocationParts(toolInvocation.toolCallId, parts);
  }
  flushPendingExternalResources() {
    if (this._pendingExternalResources.size === 0) {
      return;
    }
    const pending = Array.from(this._pendingExternalResources.values());
    this._pendingExternalResources.clear();
    for (const toolInvocation of pending) {
      this.updateExternalResourceParts(toolInvocation);
    }
  }
  appendItemToDOM(content, toolInvocationId, toolInvocationOrMarkdown, originalParent) {
    if (!content.hasChildNodes() || content.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const isMarkdownEdit = toolInvocationOrMarkdown?.kind === "markdownContent";
    const isExternalEdit = toolInvocationOrMarkdown?.kind === "externalEdit";
    const isTerminalTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
    const isSearchTool = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && toolInvocationOrMarkdown.toolSpecificData?.kind === "search";
    const toolInvocationIcon = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown.icon : void 0;
    let icon;
    if (isNoProblemsFoundResult(toolInvocationId, content.textContent ?? void 0)) {
      icon = Codicon.search;
    } else if (isMarkdownEdit || isExternalEdit) {
      icon = Codicon.pencil;
    } else if (isSearchTool) {
      icon = Codicon.search;
    } else if (isTerminalTool) {
      const terminalData = toolInvocationOrMarkdown.toolSpecificData;
      const exitCode = terminalData?.terminalCommandState?.exitCode;
      const isSandboxWrapped = terminalData?.commandLine?.isSandboxWrapped;
      if (exitCode !== void 0 && exitCode !== 0) {
        icon = Codicon.error;
      } else if (isSandboxWrapped) {
        icon = Codicon.terminalSecure;
      } else {
        icon = toolInvocationIcon ?? Codicon.terminal;
      }
    } else if (content.classList.contains("chat-hook-outcome-blocked")) {
      icon = Codicon.error;
    } else if (content.classList.contains("chat-hook-outcome-warning")) {
      icon = Codicon.warning;
    } else {
      icon = toolInvocationId ? getToolInvocationIcon(toolInvocationId, toolInvocationIcon, content.textContent ?? void 0) : Codicon.tools;
    }
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(iconElement);
    itemWrapper.appendChild(content);
    if (this.toolInvocationCount === 1 && this.hookCount === 0 && originalParent) {
      const toolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? toolInvocationOrMarkdown : void 0;
      this.singleItemInfo = {
        element: content,
        thinkingWrapper: itemWrapper,
        originalParent,
        originalNextSibling: this.domNode,
        restoreToOriginalParent: !!toolInvocation || isExternalEdit,
        toolInvocation
      };
    } else {
      this.singleItemInfo = void 0;
    }
    const isToolInvocation = toolInvocationOrMarkdown && (toolInvocationOrMarkdown.kind === "toolInvocation" || toolInvocationOrMarkdown.kind === "toolInvocationSerialized");
    if (isToolInvocation && toolInvocationOrMarkdown.toolCallId) {
      this.toolWrappersByCallId.set(toolInvocationOrMarkdown.toolCallId, itemWrapper);
      this.toolIconsByCallId.set(toolInvocationOrMarkdown.toolCallId, iconElement);
    }
    this.appendToWrapper(itemWrapper);
    if (this.fixedScrollingMode && this.scrollableElement) {
      if (this.childResizeObserver && !this.streamingCompleted) {
        const observeDisposable = this.childResizeObserver.observe(itemWrapper);
        const toolCallId = isToolInvocation ? toolInvocationOrMarkdown.toolCallId : void 0;
        if (toolCallId) {
          let store = this.toolDisposables.get(toolCallId);
          if (!store) {
            store = new DisposableStore();
            this.toolDisposables.set(toolCallId, store);
          }
          store.add(observeDisposable);
        } else {
          this._register(observeDisposable);
        }
      }
      this.scheduleAppendRefresh();
    }
  }
  scheduleAppendRefresh() {
    if (this._pendingAppendRefresh.value) {
      return;
    }
    this._pendingAppendRefresh.value = scheduleAtNextAnimationFrame(getWindow(this.wrapper), () => {
      this._pendingAppendRefresh.clear();
      if (this._store.isDisposed) {
        return;
      }
      this.refreshContentHeight();
      this.updateScrollDimensionsFromCache();
    });
  }
  materializeLazyItem(item) {
    if (item.kind === "thinking") {
      this.appendToWrapper(item.textContainer);
      this.textContainer = item.textContainer;
      this.id = item.content.id;
      this.updateThinking(item.content);
      return;
    }
    if (this.workingSpinnerLabel) {
      const isTerminalTool = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") && item.toolInvocationOrMarkdown.toolSpecificData?.kind === "terminal";
      const category = isTerminalTool ? "terminal" /* Terminal */ : "tool" /* Tool */;
      this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage(category);
    }
    if (item.lazy.hasValue) {
      const result2 = item.lazy.value;
      if (!result2.domNode.parentElement) {
        this.appendItemToDOM(result2.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
      }
      return;
    }
    const result = item.lazy.value;
    this.appendItemToDOM(result.domNode, item.toolInvocationId, item.toolInvocationOrMarkdown, item.originalParent);
    if (result.disposable) {
      const toolCallId = item.toolInvocationOrMarkdown && (item.toolInvocationOrMarkdown.kind === "toolInvocation" || item.toolInvocationOrMarkdown.kind === "toolInvocationSerialized") ? item.toolInvocationOrMarkdown.toolCallId : void 0;
      if (toolCallId) {
        this.ownedToolParts.set(toolCallId, result.disposable);
      } else {
        this._register(result.disposable);
      }
    }
  }
  // makes a new text container. when we update, we now update this container.
  setupThinkingContainer(content) {
    if (this._store.isDisposed) {
      return;
    }
    this.appendedItemCount++;
    this.allThinkingParts.push(content);
    this.recordReasoningContent(extractTextFromPart(content));
    this.textContainer = $(".chat-thinking-item.markdown-content");
    if (this.childResizeObserver && this.fixedScrollingMode && !this.streamingCompleted) {
      this._register(this.childResizeObserver.observe(this.textContainer));
    }
    if (content.value) {
      if (this.isExpanded() || this.hasExpandedOnce || this.fixedScrollingMode && !this.streamingCompleted) {
        this.appendToWrapper(this.textContainer);
        this.id = content.id;
        this.updateThinking(content);
      } else {
        this.content = content;
        this.id = content.id;
        const lazyThinking = {
          kind: "thinking",
          textContainer: this.textContainer,
          content
        };
        this.lazyItems.push(lazyThinking);
      }
      if (this.workingSpinnerLabel) {
        this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage("thinking" /* Thinking */);
      }
    }
    this.updateDropdownClickability();
  }
  setTitle(title, omitPrefix) {
    if (!title || this.element.isComplete) {
      return;
    }
    if (omitPrefix) {
      if (this._collapseButton) {
        const labelElement2 = this._collapseButton.labelElement;
        labelElement2.textContent = "";
        const plainSpan = $("span");
        plainSpan.textContent = title;
        labelElement2.appendChild(plainSpan);
        this._collapseButton.element.ariaLabel = title;
      }
      this.titleShimmerSpan = void 0;
      this.titleDetailContainer = void 0;
      this._titleDetailRendered.clear();
      this._titleFileWidgetStore.clear();
      this.currentTitle = title;
      return;
    }
    this.lastExtractedTitle = title;
    const thinkingLabel = localize("chat.thinking.label", "{0}: {1}", this.defaultTitle, title);
    this.currentTitle = thinkingLabel;
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      labelElement.appendChild(this.titleShimmerSpan);
    }
    this.titleShimmerSpan.textContent = localize("chat.thinking.shimmer", "{0}: ", this.defaultTitle);
    this._titleDetailRendered.clear();
    this._titleFileWidgetStore.clear();
    const result = this.chatContentMarkdownRenderer.render(new MarkdownString(title));
    result.element.classList.add("collapsible-title-content", "chat-thinking-title-detail");
    renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._titleFileWidgetStore);
    this._titleDetailRendered.value = result;
    if (this.titleDetailContainer) {
      this.titleDetailContainer.replaceWith(result.element);
    } else {
      labelElement.appendChild(result.element);
    }
    this.titleDetailContainer = result.element;
    this._collapseButton.element.ariaLabel = thinkingLabel;
    this._collapseButton.element.ariaExpanded = String(this.isExpanded());
  }
  hasSameContent(other, _followingContent, _element) {
    if (_element.isComplete) {
      return true;
    }
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolSpecificData?.kind === "subagent" && !other.subAgentInvocationId) {
      return false;
    }
    if (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized" || other.kind === "markdownContent" || other.kind === "hook") {
      return true;
    }
    if (other.kind !== "thinking") {
      return false;
    }
    return other?.id !== this.id;
  }
  dispose() {
    this.isActive = false;
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
    this.pendingRemovalFlushDisposable?.dispose();
    this.pendingRemovalFlushDisposable = void 0;
    this.pendingScrollDisposable?.dispose();
    super.dispose();
  }
};
ChatThinkingContentPart = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IChatMarkdownAnchorService),
  __decorateParam(7, ILanguageModelsService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IEditorService)
], ChatThinkingContentPart);
export {
  ChatThinkingContentPart,
  buildPhrasePool,
  createThinkingIcon,
  defaultThinkingMessages,
  getEffectiveThinkingDisplayMode,
  getToolInvocationIcon,
  maybePickFunWorkingMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFRoaW5raW5nQ29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGNsZWFyTm9kZSwgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGhpZGUsIGlzSFRNTEVsZW1lbnQsIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEV4dGVybmFsRWRpdCwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VGhpbmtpbmdQYXJ0LCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGEsIElDaGF0Q29udGVudFBhcnREaWZmUmVzb3VyY2UsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIFRoaW5raW5nRGlzcGxheU1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvYW5ub3RhdGlvbnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGdldENvbXBhcmlzb25LZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4vY2hhdElubGluZUFuY2hvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TWVzc2FnZVJvbGUsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRUaGlua2luZ0NvbnRlbnQuY3NzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uT3V0cHV0RGV0YWlscyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRoaW5raW5nRXh0ZXJuYWxSZXNvdXJjZVdpZGdldCB9IGZyb20gJy4vY2hhdFRoaW5raW5nRXh0ZXJuYWxSZXNvdXJjZXNXaWRnZXQuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSwgY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdFNlc3Npb25EaWZmU3RhdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuXG5cbi8vIENvbnRleHQga2V5IGlkIG1pcnJvcmVkIGZyb20gYHZzL3Nlc3Npb25zL2NvbW1vbi9jb250ZXh0a2V5c2AgKGBJc1Bob25lTGF5b3V0Q29udGV4dGApLlxuLy8gSW5saW5lZCBhcyBhIHN0cmluZyBiZWNhdXNlIGB2cy93b3JrYmVuY2hgIG11c3Qgbm90IGltcG9ydCBmcm9tIGB2cy9zZXNzaW9uc2AuXG5jb25zdCBTRVNTSU9OU19JU19QSE9ORV9MQVlPVVRfS0VZID0gJ3Nlc3Npb25zSXNQaG9uZUxheW91dCc7XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGVmZmVjdGl2ZSB0aGlua2luZyBkaXNwbGF5IG1vZGUuIE9uIHBob25lIGxheW91dCB3ZSBhbHdheXMgZm9yY2VcbiAqIHtAbGluayBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXd9IHNvIHN0cmVhbWluZyByZWFzb25pbmcgdGFrZXMgbGVzc1xuICogcm9vbSBhbmQgYXV0by1jb2xsYXBzZXMgb24gY29tcGxldGlvbiByZWdhcmRsZXNzIG9mIHRoZSB1c2VyJ3Mgc2V0dGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEVmZmVjdGl2ZVRoaW5raW5nRGlzcGxheU1vZGUoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IFRoaW5raW5nRGlzcGxheU1vZGUge1xuXHRpZiAoY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KFNFU1NJT05TX0lTX1BIT05FX0xBWU9VVF9LRVkpID09PSB0cnVlKSB7XG5cdFx0cmV0dXJuIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldztcblx0fVxuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VGhpbmtpbmdEaXNwbGF5TW9kZT4oJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScpID8/IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0VGV4dEZyb21QYXJ0KGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0KTogc3RyaW5nIHtcblx0Y29uc3QgcmF3ID0gQXJyYXkuaXNBcnJheShjb250ZW50LnZhbHVlKSA/IGNvbnRlbnQudmFsdWUuam9pbignJykgOiAoY29udGVudC52YWx1ZSB8fCAnJyk7XG5cdHJldHVybiByYXcudHJpbSgpO1xufVxuXG5mdW5jdGlvbiBpc0VkaXRUb29sSWQodG9vbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgbG93ZXJUb29sSWQgPSB0b29sSWQudG9Mb3dlckNhc2UoKTtcblx0cmV0dXJuIGxvd2VyVG9vbElkLmluY2x1ZGVzKCdlZGl0JykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnY3JlYXRlJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygncmVwbGFjZScpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ3BhdGNoJyk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGZvciBlZGl0IHRvb2xzIHdob3NlIGdlbmVyaWMgZGlzcGxheSBuYW1lIHNob3VsZCBiZSByZXBsYWNlZFxuICogd2l0aCBcIkVkaXRpbmcgZmlsZXNcIiB3aGlsZSBzdHJlYW1pbmcgKGUuZy4gcmVwbGFjZSwgbXVsdGktcmVwbGFjZSwgcGF0Y2gsIGluc2VydEVkaXQpLlxuICogRXhjbHVkZXMgY3JlYXRlIGFuZCBub3RlYm9vayB0b29scyB3aGljaCBhbHJlYWR5IGhhdmUgZ29vZCBsYWJlbHMuXG4gKi9cbmZ1bmN0aW9uIGlzR2VuZXJpY0VkaXRUb29sSWQodG9vbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgbG93ZXJUb29sSWQgPSB0b29sSWQudG9Mb3dlckNhc2UoKTtcblx0aWYgKGxvd2VyVG9vbElkLmluY2x1ZGVzKCdjcmVhdGUnKSB8fCBsb3dlclRvb2xJZC5pbmNsdWRlcygnbm90ZWJvb2snKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gbG93ZXJUb29sSWQuaW5jbHVkZXMoJ3JlcGxhY2UnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdwYXRjaCcpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2luc2VydGVkaXQnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdpbnNlcnRfZWRpdCcpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2VkaXRmaWxlJyk7XG59XG5cbmZ1bmN0aW9uIGlzUHJvYmxlbXNUb29sSWQodG9vbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0c3dpdGNoICh0b29sSWQ/LnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlICdwcm9ibGVtcyc6XG5cdFx0Y2FzZSAnZ2V0X2Vycm9ycyc6XG5cdFx0Y2FzZSAnY29waWxvdF9nZXRlcnJvcnMnOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc05vUHJvYmxlbXNGb3VuZFJlc3VsdCh0b29sSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVzdWx0VGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1Byb2JsZW1zVG9vbElkKHRvb2xJZCkgJiYgcmVzdWx0VGV4dD8udG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm8gcHJvYmxlbXMgZm91bmQnKSA9PT0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSWQ6IHN0cmluZywgcmVnaXN0ZXJlZEljb24/OiBUaGVtZUljb24sIHJlc3VsdFRleHQ/OiBzdHJpbmcpOiBUaGVtZUljb24ge1xuXHRpZiAoaXNOb1Byb2JsZW1zRm91bmRSZXN1bHQodG9vbElkLCByZXN1bHRUZXh0KSkge1xuXHRcdHJldHVybiBDb2RpY29uLnNlYXJjaDtcblx0fVxuXG5cdGlmIChyZWdpc3RlcmVkSWNvbikge1xuXHRcdHJldHVybiByZWdpc3RlcmVkSWNvbjtcblx0fVxuXG5cdGNvbnN0IGxvd2VyVG9vbElkID0gdG9vbElkLnRvTG93ZXJDYXNlKCk7XG5cblx0aWYgKGxvd2VyVG9vbElkLmluY2x1ZGVzKCdjb21tZW50JykpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi5jb21tZW50O1xuXHR9XG5cblx0aWYgKFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdzZWFyY2gnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdncmVwJykgfHxcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygnZmluZCcpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2xpc3QnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdzZW1hbnRpYycpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2NoYW5nZXMnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdjb2RlYmFzZScpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ2NoZWNrZWQnKVxuXHQpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi5zZWFyY2g7XG5cdH1cblxuXHRpZiAoXG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ3JlYWQnKSB8fFxuXHRcdGxvd2VyVG9vbElkLmluY2x1ZGVzKCdnZXRfZmlsZScpIHx8XG5cdFx0bG93ZXJUb29sSWQuaW5jbHVkZXMoJ3Byb2JsZW1zJylcblx0KSB7XG5cdFx0cmV0dXJuIENvZGljb24uYm9vaztcblx0fVxuXG5cdGlmIChpc0VkaXRUb29sSWQodG9vbElkKSkge1xuXHRcdHJldHVybiBDb2RpY29uLnBlbmNpbDtcblx0fVxuXG5cdGlmIChcblx0XHRsb3dlclRvb2xJZC5pbmNsdWRlcygndGVybWluYWwnKVxuXHQpIHtcblx0XHRyZXR1cm4gQ29kaWNvbi50ZXJtaW5hbDtcblx0fVxuXG5cdC8vIGRlZmF1bHQgdG8gZ2VuZXJpYyB0b29sIGljb25cblx0cmV0dXJuIENvZGljb24udG9vbHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUaGlua2luZ0ljb24oaWNvbjogVGhlbWVJY29uKTogSFRNTEVsZW1lbnQge1xuXHRjb25zdCBpY29uRWxlbWVudCA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy1pY29uJyk7XG5cdGljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRyZXR1cm4gaWNvbkVsZW1lbnQ7XG59XG5cbmZ1bmN0aW9uIHNldFRoaW5raW5nSWNvbihpY29uRWxlbWVudDogSFRNTEVsZW1lbnQsIGljb246IFRoZW1lSWNvbik6IHZvaWQge1xuXHRpY29uRWxlbWVudC5jbGFzc05hbWUgPSAnY2hhdC10aGlua2luZy1pY29uJztcblx0aWNvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RUaXRsZUZyb21UaGlua2luZ0NvbnRlbnQoY29udGVudDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgaGVhZGVyTWF0Y2ggPSBjb250ZW50Lm1hdGNoKC9eXFwqXFwqKFteKl0rKVxcKlxcKi8pO1xuXHRyZXR1cm4gaGVhZGVyTWF0Y2ggPyBoZWFkZXJNYXRjaFsxXSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBNZXRhZGF0YSBwYXNzZWQgdG8ge0BsaW5rIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LmFwcGVuZEl0ZW19IHRvIGRyaXZlXG4gKiB0aXRsZSAvIGljb24gZXh0cmFjdGlvbi4gVGhlIGBraW5kYCBkaXNjcmltaW5hdGVzIHdoaWNoIHBheWxvYWQgaXNcbiAqIGF2YWlsYWJsZTsgdGhlIHRoaW5raW5nIHBhcnQgaW5zcGVjdHMgaXQgdG8gY29tcHV0ZSBhIGxhYmVsIGxpa2VcbiAqIFwiRWRpdGVkIGZvby50c1wiIHdpdGhvdXQgcmVuZGVyaW5nIHRoZSBhY3R1YWwgY29udGVudCBpdHNlbGYgKHRoZVxuICogZmFjdG9yeSBwcm92aWRlcyB0aGUgRE9NKS5cbiAqL1xuZXhwb3J0IHR5cGUgQ2hhdFRoaW5raW5nSXRlbU1ldGFkYXRhID1cblx0fCBJQ2hhdFRvb2xJbnZvY2F0aW9uXG5cdHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWRcblx0fCBJQ2hhdE1hcmtkb3duQ29udGVudFxuXHR8IElDaGF0RXh0ZXJuYWxFZGl0O1xuXG5pbnRlcmZhY2UgSUxhenlUb29sSXRlbSB7XG5cdGtpbmQ6ICd0b29sJztcblx0bGF6eTogTGF6eTx7IGRvbU5vZGU6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGUgfT47XG5cdHRvb2xJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj86IENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YTtcblx0b3JpZ2luYWxQYXJlbnQ/OiBIVE1MRWxlbWVudDtcblx0aXNIb29rPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElMYXp5VGhpbmtpbmdJdGVtIHtcblx0a2luZDogJ3RoaW5raW5nJztcblx0dGV4dENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0O1xufVxuXG50eXBlIElMYXp5SXRlbSA9IElMYXp5VG9vbEl0ZW0gfCBJTGF6eVRoaW5raW5nSXRlbTtcbmNvbnN0IFRISU5LSU5HX1NDUk9MTF9NQVhfSEVJR0hUID0gMjAwO1xuXG5jb25zdCBUSVRMRV9DQUNIRV9TVE9SQUdFX0tFWSA9ICdjaGF0LnRoaW5raW5nVGl0bGVDYWNoZSc7XG5jb25zdCBUSVRMRV9DQUNIRV9UVExfTVMgPSA3ICogMjQgKiA2MCAqIDYwICogMTAwMDsgLy8gNyBkYXlzXG5jb25zdCBUSVRMRV9DQUNIRV9NQVhfRU5UUklFUyA9IDEwMDA7XG5cbmNvbnN0IGVudW0gV29ya2luZ01lc3NhZ2VDYXRlZ29yeSB7XG5cdFRoaW5raW5nID0gJ3RoaW5raW5nJyxcblx0VGVybWluYWwgPSAndGVybWluYWwnLFxuXHRUb29sID0gJ3Rvb2wnXG59XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0VGhpbmtpbmdNZXNzYWdlcyA9IFtcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudGhpbmtpbmcuMScsICdUaGlua2luZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aGlua2luZy4yJywgJ1JlYXNvbmluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aGlua2luZy4zJywgJ0NvbnNpZGVyaW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRoaW5raW5nLjQnLCAnQW5hbHl6aW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRoaW5raW5nLjUnLCAnRXZhbHVhdGluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aGlua2luZy42JywgJ1dvcmtpbmcnKSxcbl07XG5cbmNvbnN0IHRlcm1pbmFsTWVzc2FnZXMgPSBbXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRlcm1pbmFsLjEnLCAnRXhlY3V0aW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRlcm1pbmFsLjInLCAnUnVubmluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50ZXJtaW5hbC4zJywgJ1Byb2Nlc3NpbmcnKSxcbl07XG5cbmNvbnN0IHRvb2xNZXNzYWdlcyA9IFtcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudG9vbC4xJywgJ1Byb2Nlc3NpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudG9vbC4yJywgJ1ByZXBhcmluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50b29sLjMnLCAnTG9hZGluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50b29sLjQnLCAnQW5hbHl6aW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLnRvb2wuNScsICdFdmFsdWF0aW5nJyksXG5dO1xuXG4vKiogRWFzdGVyLWVnZyBsb2FkaW5nIG1lc3NhZ2VzLCB1c2VkIH4xIGluIHtAbGluayBGVU5fV09SS0lOR19NRVNTQUdFX1JBVEV9IHBpY2tzLiAqL1xuY29uc3QgZnVuV29ya2luZ01lc3NhZ2VzID0gW1xuXHQvLyBHZW5lcmljXG5cdGxvY2FsaXplKCdjaGF0LndvcmtpbmcuZnVuLjEnLCBcIkJyaWJpbmcgdGhlIGhhbXN0ZXJcIiksXG5cdGxvY2FsaXplKCdjaGF0LndvcmtpbmcuZnVuLjInLCBcIlJldGljdWxhdGluZyBzcGxpbmVzXCIpLFxuXHRsb2NhbGl6ZSgnY2hhdC53b3JraW5nLmZ1bi4zJywgXCJVbnRhbmdsaW5nIHRoZSBzcGFnaGV0dGlcIiksXG5cdGxvY2FsaXplKCdjaGF0LndvcmtpbmcuZnVuLjQnLCBcIkNvbW11bmluZyB3aXRoIHRoZSBjb2RlYmFzZVwiKSxcblxuXHQvLyBNaW5lY3JhZnRcblx0bG9jYWxpemUoJ2NoYXQud29ya2luZy5mdW4ubWluZWNyYWZ0LjEnLCBcIk1pbmluZyBkaWFtb25kc1wiKSxcblxuXHQvLyBNaWNyb3NvZnRcblx0bG9jYWxpemUoJ2NoYXQud29ya2luZy5mdW4ubXMuMScsIFwiU3VtbW9uaW5nIENsaXBweVwiKSxcbl07XG5cbmNvbnN0IEZVTl9XT1JLSU5HX01FU1NBR0VfUkFURSA9IDUwO1xuXG50eXBlIFRoaW5raW5nUGhyYXNlc0NvbmZpZ3VyYXRpb24gPSB7IG1vZGU/OiAncmVwbGFjZScgfCAnYXBwZW5kJzsgcGhyYXNlcz86IHN0cmluZ1tdIH07XG5cbmZ1bmN0aW9uIGdldEN1c3RvbVRoaW5raW5nUGhyYXNlcyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogeyBjdXN0b21QaHJhc2VzOiBzdHJpbmdbXTsgcmVwbGFjZURlZmF1bHRzOiBib29sZWFuIH0ge1xuXHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxUaGlua2luZ1BocmFzZXNDb25maWd1cmF0aW9uPihDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ1BocmFzZXMpO1xuXHRjb25zdCBjdXN0b21QaHJhc2VzID0gQXJyYXkuaXNBcnJheShjb25maWc/LnBocmFzZXMpXG5cdFx0PyBjb25maWcucGhyYXNlc1xuXHRcdFx0LmZpbHRlcigocGhyYXNlKTogcGhyYXNlIGlzIHN0cmluZyA9PiB0eXBlb2YgcGhyYXNlID09PSAnc3RyaW5nJylcblx0XHRcdC5tYXAocGhyYXNlID0+IHBocmFzZS50cmltKCkpXG5cdFx0XHQuZmlsdGVyKHBocmFzZSA9PiBwaHJhc2UubGVuZ3RoID4gMClcblx0XHQ6IFtdO1xuXG5cdHJldHVybiB7XG5cdFx0Y3VzdG9tUGhyYXNlcyxcblx0XHRyZXBsYWNlRGVmYXVsdHM6IGNvbmZpZz8ubW9kZSA9PT0gJ3JlcGxhY2UnICYmIGN1c3RvbVBocmFzZXMubGVuZ3RoID4gMCxcblx0fTtcbn1cblxuLyoqIFJldHVybnMgYW4gZWFzdGVyLWVnZyBtZXNzYWdlIH4xIGluIHtAbGluayBGVU5fV09SS0lOR19NRVNTQUdFX1JBVEV9LCBlbHNlIGB1bmRlZmluZWRgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUGlja0Z1bldvcmtpbmdNZXNzYWdlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHJhbmRvbSA9IE1hdGgucmFuZG9tKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGdldEN1c3RvbVRoaW5raW5nUGhyYXNlcyhjb25maWd1cmF0aW9uU2VydmljZSkucmVwbGFjZURlZmF1bHRzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChNYXRoLmZsb29yKHJhbmRvbSgpICogRlVOX1dPUktJTkdfTUVTU0FHRV9SQVRFKSA9PT0gMCkge1xuXHRcdHJldHVybiBmdW5Xb3JraW5nTWVzc2FnZXNbTWF0aC5mbG9vcihyYW5kb20oKSAqIGZ1bldvcmtpbmdNZXNzYWdlcy5sZW5ndGgpXTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHBocmFzZSBwb29sIGZyb20gZGVmYXVsdHMgYW5kIHVzZXItY29uZmlndXJlZCBjdXN0b20gcGhyYXNlcy5cbiAqIEluICdyZXBsYWNlJyBtb2RlLCBvbmx5IGN1c3RvbSBwaHJhc2VzIGFyZSB1c2VkOyBpbiAnYXBwZW5kJyBtb2RlIChkZWZhdWx0KSxcbiAqIGN1c3RvbSBwaHJhc2VzIGFyZSBhZGRlZCB0byB0aGUgZGVmYXVsdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFBocmFzZVBvb2woZGVmYXVsdHM6IHN0cmluZ1tdLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogc3RyaW5nW10ge1xuXHRjb25zdCB7IGN1c3RvbVBocmFzZXMsIHJlcGxhY2VEZWZhdWx0cyB9ID0gZ2V0Q3VzdG9tVGhpbmtpbmdQaHJhc2VzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRpZiAoY3VzdG9tUGhyYXNlcy5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHJlcGxhY2VEZWZhdWx0cyA/IFsuLi5jdXN0b21QaHJhc2VzXSA6IFsuLi5kZWZhdWx0cywgLi4uY3VzdG9tUGhyYXNlc107XG5cdH1cblx0cmV0dXJuIFsuLi5kZWZhdWx0c107XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGhpbmtpbmdDb250ZW50UGFydCBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvZGVCbG9ja1JlbmRlcmVyU3luYyhfbGFuZ3VhZ2VJZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIF9yYXc/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29kZUVsZW1lbnQgPSAkKCdjb2RlJyk7XG5cdFx0Y29kZUVsZW1lbnQudGV4dENvbnRlbnQgPSB0ZXh0O1xuXHRcdHJldHVybiBjb2RlRWxlbWVudDtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBjb2RlYmxvY2tzOiB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBjb2RlYmxvY2tzUGFydElkOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXN5bmNSZW5kZXJDYWxsYmFjayA9ICgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblxuXHRwcml2YXRlIGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGVudDogSUNoYXRUaGlua2luZ1BhcnQ7XG5cdHByaXZhdGUgY3VycmVudFRoaW5raW5nVmFsdWU6IHN0cmluZztcblx0cHJpdmF0ZSBjdXJyZW50VGl0bGU6IHN0cmluZztcblx0cHJpdmF0ZSBkZWZhdWx0VGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5oZWFkZXInLCAnVGhpbmtpbmcnKTtcblx0cHJpdmF0ZSByZWFkb25seSB3b3JraW5nVGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5oZWFkZXIud29ya2luZycsICdXb3JraW5nJyk7XG5cdHByaXZhdGUgdGV4dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZG93blJlc3VsdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVuZGVyZWRNYXJrZG93bj4oKSk7XG5cdHByaXZhdGUgd3JhcHBlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGZpeGVkU2Nyb2xsaW5nTW9kZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRoaW5raW5nRGlzcGxheU1vZGU6IFRoaW5raW5nRGlzcGxheU1vZGU7XG5cdHByaXZhdGUgYXV0b1Njcm9sbEVuYWJsZWQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIHNjcm9sbGFibGVFbGVtZW50OiBEb21TY3JvbGxhYmxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXN0RXh0cmFjdGVkVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBleHRyYWN0ZWRUaXRsZXM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgdG9vbEludm9jYXRpb25Db3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBhcHBlbmRlZEl0ZW1Db3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBpc0FjdGl2ZTogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgdG9vbEludm9jYXRpb25zOiAoSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKVtdID0gW107XG5cdHByaXZhdGUgYWxsVGhpbmtpbmdQYXJ0czogSUNoYXRUaGlua2luZ1BhcnRbXSA9IFtdO1xuXHRwcml2YXRlIGhvb2tDb3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBzaW5nbGVJdGVtSW5mbzogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgdGhpbmtpbmdXcmFwcGVyOiBIVE1MRWxlbWVudDsgb3JpZ2luYWxQYXJlbnQ6IEhUTUxFbGVtZW50OyBvcmlnaW5hbE5leHRTaWJsaW5nOiBOb2RlIHwgbnVsbDsgcmVzdG9yZVRvT3JpZ2luYWxQYXJlbnQ6IGJvb2xlYW47IHRvb2xJbnZvY2F0aW9uPzogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGF6eUl0ZW1zOiBJTGF6eUl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGhhc0V4cGFuZGVkT25jZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHdvcmtpbmdTcGlubmVyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya2luZ1NwaW5uZXJMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXZhaWxhYmxlTWVzc2FnZXNCeUNhdGVnb3J5ID0gbmV3IE1hcDxXb3JraW5nTWVzc2FnZUNhdGVnb3J5LCBzdHJpbmdbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sV3JhcHBlcnNCeUNhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sSWNvbnNCeUNhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0b29sTGFiZWxzQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvd25lZFRvb2xQYXJ0cyA9IG5ldyBNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSBwZW5kaW5nUmVtb3ZhbHM6IHsgdG9vbENhbGxJZDogc3RyaW5nOyB0b29sTGFiZWw6IHN0cmluZyB9W10gPSBbXTtcblx0cHJpdmF0ZSBwZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcGVuZGluZ1Njcm9sbERpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdyYXBwZXJSZXNpemVPYnNlcnZlckRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNoaWxkUmVzaXplT2JzZXJ2ZXI6IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpc1VwZGF0aW5nRGltZW5zaW9uczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RLbm93bkNvbnRlbnRIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgbGFzdEtub3duU2Nyb2xsVG9wOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHRpdGxlU2hpbW1lclNwYW46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRpdGxlRGV0YWlsQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb2xsYXBzZWRUaXRsZUJlZm9yZUV4cGFuc2lvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlcm5hbFJlc291cmNlV2lkZ2V0OiBDaGF0VGhpbmtpbmdFeHRlcm5hbFJlc291cmNlV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aXRsZURldGFpbFJlbmRlcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElSZW5kZXJlZE1hcmtkb3duPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0FwcGVuZFJlZnJlc2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZEYXRhQnlQYXJ0SWQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRDb250ZW50UGFydERpZmZEYXRhPigpO1xuXHRwcml2YXRlIF9hZ2dyZWdhdGVkRGlmZjogSUVkaXRTZXNzaW9uRGlmZlN0YXRzID0geyBhZGRlZDogMCwgcmVtb3ZlZDogMCB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpZmZCdXR0b25TdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgZGlmZkJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRhaW5zUmVhc29uaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIGNvbnRhaW5zR3JvdXBlZEl0ZW1zOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhc29uaW5nRHVyYXRpb25NczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBhZ2dyZWdhdGVkRGlmZigpOiBJRWRpdFNlc3Npb25EaWZmU3RhdHMgeyByZXR1cm4gdGhpcy5fYWdncmVnYXRlZERpZmY7IH1cblxuXHRwcml2YXRlIGdldFJhbmRvbVdvcmtpbmdNZXNzYWdlKGNhdGVnb3J5OiBXb3JraW5nTWVzc2FnZUNhdGVnb3J5ID0gV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5Ub29sKTogc3RyaW5nIHtcblx0XHRjb25zdCBmdW4gPSBtYXliZVBpY2tGdW5Xb3JraW5nTWVzc2FnZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoZnVuKSB7XG5cdFx0XHRyZXR1cm4gZnVuO1xuXHRcdH1cblxuXHRcdGxldCBwb29sID0gdGhpcy5hdmFpbGFibGVNZXNzYWdlc0J5Q2F0ZWdvcnkuZ2V0KGNhdGVnb3J5KTtcblx0XHRpZiAoIXBvb2wgfHwgcG9vbC5sZW5ndGggPT09IDApIHtcblx0XHRcdGxldCBkZWZhdWx0czogc3RyaW5nW107XG5cdFx0XHRzd2l0Y2ggKGNhdGVnb3J5KSB7XG5cdFx0XHRcdGNhc2UgV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5UaGlua2luZzpcblx0XHRcdFx0XHRkZWZhdWx0cyA9IGRlZmF1bHRUaGlua2luZ01lc3NhZ2VzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkuVGVybWluYWw6XG5cdFx0XHRcdFx0ZGVmYXVsdHMgPSB0ZXJtaW5hbE1lc3NhZ2VzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkuVG9vbDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRkZWZhdWx0cyA9IHRvb2xNZXNzYWdlcztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0cG9vbCA9IGJ1aWxkUGhyYXNlUG9vbChkZWZhdWx0cywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdHRoaXMuYXZhaWxhYmxlTWVzc2FnZXNCeUNhdGVnb3J5LnNldChjYXRlZ29yeSwgcG9vbCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogcG9vbC5sZW5ndGgpO1xuXHRcdHJldHVybiBwb29sLnNwbGljZShpbmRleCwgMSlbMF07XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZW50OiBJQ2hhdFRoaW5raW5nUGFydCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcjogSU1hcmtkb3duUmVuZGVyZXIsXG5cdFx0cHJpdmF0ZSBzdHJlYW1pbmdDb21wbGV0ZWQ6IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZTogSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgaW5pdGlhbFRleHQgPSBleHRyYWN0VGV4dEZyb21QYXJ0KGNvbnRlbnQpO1xuXHRcdGNvbnN0IGNvbnRhaW5zUmVhc29uaW5nID0gaW5pdGlhbFRleHQudHJpbSgpLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgZXh0cmFjdGVkVGl0bGUgPSBleHRyYWN0VGl0bGVGcm9tVGhpbmtpbmdDb250ZW50KGluaXRpYWxUZXh0KVxuXHRcdFx0Pz8gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaGVhZGVyLmluaXRpYWwnLCAnVGhpbmtpbmcnKTtcblxuXHRcdHN1cGVyKGV4dHJhY3RlZFRpdGxlLCBjb250ZXh0LCB1bmRlZmluZWQsIGhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb250YWluc1JlYXNvbmluZyA9IGNvbnRhaW5zUmVhc29uaW5nO1xuXHRcdHRoaXMucmVhc29uaW5nRHVyYXRpb25NcyA9IGNvbnRlbnQucmVhc29uaW5nRHVyYXRpb25Ncztcblx0XHR0aGlzLmlkID0gY29udGVudC5pZDtcblx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHRcdHRoaXMuYWxsVGhpbmtpbmdQYXJ0cy5wdXNoKGNvbnRlbnQpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlID0gZ2V0RWZmZWN0aXZlVGhpbmtpbmdEaXNwbGF5TW9kZSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50aGlua2luZ0Rpc3BsYXlNb2RlID0gY29uZmlndXJlZE1vZGU7XG5cblx0XHR0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSA9IGNvbmZpZ3VyZWRNb2RlID09PSBUaGlua2luZ0Rpc3BsYXlNb2RlLkZpeGVkU2Nyb2xsaW5nO1xuXG5cdFx0dGhpcy5jdXJyZW50VGl0bGUgPSBleHRyYWN0ZWRUaXRsZTtcblx0XHRpZiAoZXh0cmFjdGVkVGl0bGUgIT09IHRoaXMuZGVmYXVsdFRpdGxlKSB7XG5cdFx0XHR0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZSA9IGV4dHJhY3RlZFRpdGxlO1xuXHRcdFx0dGhpcy5leHRyYWN0ZWRUaXRsZXMucHVzaChleHRyYWN0ZWRUaXRsZSk7XG5cdFx0fVxuXHRcdHRoaXMuY3VycmVudFRoaW5raW5nVmFsdWUgPSBpbml0aWFsVGV4dDtcblxuXHRcdGlmIChpbml0aWFsVGV4dC50cmltKCkpIHtcblx0XHRcdHRoaXMuYXBwZW5kZWRJdGVtQ291bnQrKztcblx0XHR9XG5cblx0XHQvLyBBbGVydCBzY3JlZW4gcmVhZGVyIHVzZXJzIHRoYXQgdGhpbmtpbmcgaGFzIHN0YXJ0ZWRcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzKSkge1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuc3RhcnRlZCcsICdUaGlua2luZycpKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJlZE1vZGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkKSB7XG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHR9IGVsc2UgaWYgKGNvbmZpZ3VyZWRNb2RlID09PSBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXcpIHtcblx0XHRcdC8vIFN0YXJ0IGV4cGFuZGVkIGlmIHN0aWxsIGluIHByb2dyZXNzLlxuXHRcdFx0Ly8gc3RyZWFtaW5nQ29tcGxldGVkIGlzIHRydWUgd2hlbiBsb29rLWFoZWFkIGZpbmRzIHN1YnNlcXVlbnQgbm9uLXBpbm5hYmxlXG5cdFx0XHQvLyBwYXJ0cywgbWVhbmluZyB0aGlzIHRoaW5raW5nIHBhcnQgd29uJ3QgcmVjZWl2ZSBtb3JlIGNvbnRlbnQuXG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKCF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiAhdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy5kb21Ob2RlO1xuXHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy1ib3gnKTtcblxuXHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUaGlua2luZ0V4dGVybmFsUmVzb3VyY2VXaWRnZXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9leHRlcm5hbFJlc291cmNlV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKSkpO1xuXHRcdG5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fZXh0ZXJuYWxSZXNvdXJjZVdpZGdldC5kb21Ob2RlKTtcblxuXHRcdGlmICghdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgIXRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKSB7XG5cdFx0XHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiAhdGhpcy5lbGVtZW50LmlzQ29tcGxldGUgJiYgdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKTtcblx0XHRcdHRoaXMudGl0bGVTaGltbWVyU3Bhbi50ZXh0Q29udGVudCA9IGV4dHJhY3RlZFRpdGxlO1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMudGl0bGVTaGltbWVyU3Bhbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKSB7XG5cdFx0XHRub2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctZml4ZWQtbW9kZScpO1xuXHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aGlzLmRlZmF1bHRUaXRsZTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMub3duZWRUb29sUGFydHMudmFsdWVzKCkpIHtcblx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm93bmVkVG9vbFBhcnRzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gb3ZlcnJpZGUgZm9yIGNvZGljb24gY2hldnJvbiBpbiB0aGUgY29sbGFwc2libGUgcGFydFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBpc0V4cGFuZGVkID0gdGhpcy5leHBhbmRlZC5yZWFkKHIpO1xuXHRcdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRcdGlmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCB8fCB0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCF0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSkge1xuXHRcdFx0XHRcdGlmIChpc0V4cGFuZGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2lyY2xlRmlsbGVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBpc0V4cGFuZGVkID0gdGhpcy5faXNFeHBhbmRlZC5yZWFkKHIpO1xuXHRcdFx0Ly8gTWF0ZXJpYWxpemUgbGF6eSBpdGVtcyB3aGVuIGZpcnN0IGV4cGFuZGVkXG5cdFx0XHRpZiAoaXNFeHBhbmRlZCAmJiAhdGhpcy5oYXNFeHBhbmRlZE9uY2UgJiYgdGhpcy5sYXp5SXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmhhc0V4cGFuZGVkT25jZSA9IHRydWU7XG5cdFx0XHRcdC8vIEZsdXNoIHBlbmRpbmcgcmVtb3ZhbHMgc28gdGhhdCBjb21wbGV0ZWQgaGlkZGVuIHRvb2xzIGFyZSByZW1vdmVkIGZyb20gbGF6eUl0ZW1zIGJlZm9yZSBtYXRlcmlhbGl6YXRpb25cblx0XHRcdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlbW92YWxzKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLmxhenlJdGVtcykge1xuXHRcdFx0XHRcdHRoaXMubWF0ZXJpYWxpemVMYXp5SXRlbShpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBleHBhbmRlZCBidXQgY29udGVudCBtYXRjaGVzIHRpdGxlIGFuZCB0aGVyZSdzIG5vdGhpbmcgZWxzZSB0byBzaG93LCByZXZlcnQgaW1tZWRpYXRlbHkuXG5cdFx0XHQvLyBTa2lwIHRoaXMgY2hlY2sgd2hpbGUgc3RpbGwgc3RyZWFtaW5nIFx1MjAxNCBtb3JlIGNvbnRlbnQgd2lsbCBhcnJpdmUuXG5cdFx0XHRpZiAoaXNFeHBhbmRlZCAmJiAhdGhpcy5zaG91bGRBbGxvd0V4cGFuc2lvbigpICYmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCB8fCB0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSkpIHtcblx0XHRcdFx0dGhpcy5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZXh0ZXJuYWxSZXNvdXJjZVdpZGdldC5zZXRDb2xsYXBzZWQoIWlzRXhwYW5kZWQpO1xuXG5cdFx0XHQvLyBGaXJlIHdoZW4gZXhwYW5kZWQvY29sbGFwc2VkXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZSA/PyAnJztcblx0XHRpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLl9pc0V4cGFuZGVkLmdldCgpKSB7XG5cdFx0XHR0aGlzLnNldFRpdGxlKGxhYmVsKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbGxhcHNlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRoaW5raW5nLWZpeGVkLW1vZGUtYW5pbWF0ZWQnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZXhwYW5kZWQgPSB0aGlzLmlzRXhwYW5kZWQoKTtcblx0XHRcdFx0aWYgKGV4cGFuZGVkKSB7XG5cdFx0XHRcdFx0Ly8gSnVzdCBleHBhbmRlZDogc2hvdyBwbGFpbiAnV29ya2luZycgd2l0aCBubyBkZXRhaWxcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZFRpdGxlQmVmb3JlRXhwYW5zaW9uID0gdGhpcy5sYXN0RXh0cmFjdGVkVGl0bGU7XG5cdFx0XHRcdFx0dGhpcy5zZXRUaXRsZSh0aGlzLmRlZmF1bHRUaXRsZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aGlzLmRlZmF1bHRUaXRsZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBSZXN0b3JlIHRoZSB0aXRsZSB0aGF0IHdhcyB2aXNpYmxlIGJlZm9yZSBleHBhbnNpb24uIFRvb2wgc3RhdGVcblx0XHRcdFx0XHQvLyB1cGRhdGVzIGNhbiBiZWNvbWUgbGVzcyBkZXNjcmlwdGl2ZSB3aGlsZSB0aGUgc2VjdGlvbiBpcyBvcGVuLlxuXHRcdFx0XHRcdGNvbnN0IGNvbGxhcHNlZFRpdGxlID0gdGhpcy5jb2xsYXBzZWRUaXRsZUJlZm9yZUV4cGFuc2lvbiA/PyB0aGlzLmxhc3RFeHRyYWN0ZWRUaXRsZTtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZFRpdGxlQmVmb3JlRXhwYW5zaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChjb2xsYXBzZWRUaXRsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRUaXRsZShjb2xsYXBzZWRUaXRsZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0VGl0bGUodGhpcy5kZWZhdWx0VGl0bGUsIHRydWUpO1xuXHRcdFx0XHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aGlzLmRlZmF1bHRUaXRsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2hvdWxkSW5pdEVhcmx5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2hvdWxkQW5pbWF0ZUNvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRQcmVwYXJlQ29udGVudEFuaW1hdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNvbnRlbnREaWRJbml0aWFsaXplKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiB0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiB0aGlzLnNjcm9sbGFibGVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBzY3JvbGxhYmxlRG9tTm9kZSA9IHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuZ2V0RG9tTm9kZSgpO1xuXHRcdFx0c2Nyb2xsYWJsZURvbU5vZGUuc3R5bGUubWF4SGVpZ2h0ID0gJzBweCc7XG5cdFx0XHRzY3JvbGxhYmxlRG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZXhwYW5zaW9uRGlkQ2hhbmdlKGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmIHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkKSB7XG5cdFx0XHRpZiAoZXhwYW5kZWQpIHtcblx0XHRcdFx0dGhpcy5zeW5jRGltZW5zaW9uc0FuZFNjaGVkdWxlU2Nyb2xsKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBsZXRlZFNjcm9sbEFuaW1hdGlvblN0YXRlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBAVE9ETzogQGp1c3RzY2hlbiBDb252ZXJ0IHRvIHRlbXBsYXRlIGZvciBlYWNoIHNldHRpbmc/XG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbml0Q29udGVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy53cmFwcGVyID0gJCgnLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QuY2hhdC10aGlua2luZy1jb2xsYXBzaWJsZScpO1xuXHRcdGlmICghdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMud3JhcHBlci5jbGFzc0xpc3QuYWRkKCdjaGF0LXRoaW5raW5nLXN0cmVhbWluZycpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgY3JlYXRlIHRleHRDb250YWluZXIgaGVyZSBpZiB0aGVyZSdzIG5vIHBlbmRpbmcgbGF6eSB0aGlua2luZyBpdGVtLlxuXHRcdC8vIElmIHRoZXJlJ3MgYSBsYXp5IHRoaW5raW5nIGl0ZW0sIGl0IHdpbGwgYmUgcmVuZGVyZWQgdmlhIG1hdGVyaWFsaXplTGF6eUl0ZW1cblx0XHQvLyB3aXRoIHRoZSBsYXRlc3Qgc3RyZWFtaW5nIGNvbnRlbnQuXG5cdFx0Y29uc3QgaGFzTGF6eVRoaW5raW5nSXRlbXMgPSB0aGlzLmxhenlJdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5raW5kID09PSAndGhpbmtpbmcnKTtcblx0XHRpZiAodGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSAmJiAhaGFzTGF6eVRoaW5raW5nSXRlbXMpIHtcblx0XHRcdHRoaXMudGV4dENvbnRhaW5lciA9ICQoJy5jaGF0LXRoaW5raW5nLWl0ZW0ubWFya2Rvd24tY29udGVudCcpO1xuXHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKHRoaXMudGV4dENvbnRhaW5lcik7XG5cdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKHRoaXMuY3VycmVudFRoaW5raW5nVmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgIXRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9ICQoJy5jaGF0LXRoaW5raW5nLWl0ZW0uY2hhdC10aGlua2luZy1zcGlubmVyLWl0ZW0nKTtcblx0XHRcdGNvbnN0IHNwaW5uZXJJY29uID0gY3JlYXRlVGhpbmtpbmdJY29uKENvZGljb24uY2lyY2xlRmlsbGVkKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LmFwcGVuZENoaWxkKHNwaW5uZXJJY29uKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy1zcGlubmVyLWxhYmVsJyk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmdldFJhbmRvbVdvcmtpbmdNZXNzYWdlKFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkuVGhpbmtpbmcpO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy53b3JraW5nU3Bpbm5lckxhYmVsKTtcblx0XHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZCh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCk7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdTcGlubmVyVmlzaWJpbGl0eSgpO1xuXHRcdH1cblxuXHRcdC8vIHdyYXAgY29udGVudCBpbiBzY3JvbGxhYmxlIGVsZW1lbnQgZm9yIGZpeGVkIHNjcm9sbGluZyBtb2RlXG5cdFx0aWYgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKSB7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMud3JhcHBlciwge1xuXHRcdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdFx0aGFuZGxlTW91c2VXaGVlbDogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNjcm9sbGFibGVFbGVtZW50Lm9uU2Nyb2xsKGUgPT4gdGhpcy5oYW5kbGVTY3JvbGwoZS5zY3JvbGxUb3ApKSk7XG5cblx0XHRcdGxldCBwZW5kaW5nTXV0YXRpb25SZWZyZXNoOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG11dGF0aW9uT2JzZXJ2ZXIgPSBuZXcgTXV0YXRpb25PYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdGlmIChwZW5kaW5nTXV0YXRpb25SZWZyZXNoKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBlbmRpbmdNdXRhdGlvblJlZnJlc2ggPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLndyYXBwZXIpLCAoKSA9PiB7XG5cdFx0XHRcdFx0cGVuZGluZ011dGF0aW9uUmVmcmVzaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgfHwgIXRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMucmVmcmVzaENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGcm9tQ2FjaGUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdG11dGF0aW9uT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLndyYXBwZXIsIHsgY2hpbGRMaXN0OiB0cnVlLCBzdWJ0cmVlOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0bXV0YXRpb25PYnNlcnZlci5kaXNjb25uZWN0KCk7XG5cdFx0XHRcdFx0cGVuZGluZ011dGF0aW9uUmVmcmVzaD8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gT2JzZXJ2ZSBjaGlsZCBlbGVtZW50cyBmb3IgcmVzaXplcyAoZS5nLiB0ZXJtaW5hbCBvdXRwdXQgZ3Jvd2luZylcblx0XHRcdC8vIHNvIHdlIGNhbiB1cGRhdGUgc2Nyb2xsIGRpbWVuc2lvbnMgd2hlbiB0aGUgd3JhcHBlciBib3ggaXMgcGlubmVkIGF0IG1heC1oZWlnaHQuXG5cdFx0XHR0aGlzLmNoaWxkUmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0VGhpbmtpbmdDb250ZW50UGFydC5jaGlsZCcsICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkIHx8ICF0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuc3luY0RpbWVuc2lvbnNBbmRTY2hlZHVsZVNjcm9sbCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKHRoaXMudGV4dENvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoaWxkUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLnRleHRDb250YWluZXIpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoaWxkUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYWNoZSB3cmFwcGVyIHNjcm9sbEhlaWdodCBwb3N0LWxheW91dCB2aWEgUmVzaXplT2JzZXJ2ZXIgdG8gYXZvaWQgZm9yY2VkIHJlZmxvd3MuXG5cdFx0XHRjb25zdCB3cmFwcGVyUmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0VGhpbmtpbmdDb250ZW50UGFydC53cmFwcGVyJywgKGVudHJpZXMpID0+IHtcblx0XHRcdFx0aWYgKGVudHJpZXNbMF0pIHtcblx0XHRcdFx0XHR0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQgPSB0aGlzLndyYXBwZXIuc2Nyb2xsSGVpZ2h0O1xuXHRcdFx0XHRcdGlmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCAmJiB0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zRm9yQ29tcGxldGlvbigpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmIHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NoYXQtdXNlZC1jb250ZXh0LWNvbGxhcHNlZCcpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGcm9tQ2FjaGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMud3JhcHBlclJlc2l6ZU9ic2VydmVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXJSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMud3JhcHBlcikpO1xuXG5cdFx0XHQvLyBPbmNlIGNvbnRlbnQgZXhjZWVkcyBtYXgtaGVpZ2h0LCB0aGUgd3JhcHBlciBib3ggc2l6ZSBzdG9wcyBjaGFuZ2luZ1xuXHRcdFx0Ly8gc28gUmVzaXplT2JzZXJ2ZXIgd29uJ3QgZmlyZS4gRmFsbCBiYWNrIHRvIHNjcm9sbEhlaWdodCByZWFkcyBoZXJlLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmIHRoaXMud3JhcHBlclJlc2l6ZU9ic2VydmVyRGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdHRoaXMucmVmcmVzaENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGcm9tQ2FjaGUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zeW5jRGltZW5zaW9uc0FuZFNjaGVkdWxlU2Nyb2xsKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuc3luY0RpbWVuc2lvbnNBbmRTY2hlZHVsZVNjcm9sbCgpO1xuXG5cdFx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHRcdHJldHVybiB0aGlzLndyYXBwZXI7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVNjcm9sbChzY3JvbGxUb3A6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudCB8fCB0aGlzLmlzVXBkYXRpbmdEaW1lbnNpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0S25vd25TY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodDtcblx0XHRjb25zdCB2aWV3cG9ydEhlaWdodCA9IE1hdGgubWluKGNvbnRlbnRIZWlnaHQsIFRISU5LSU5HX1NDUk9MTF9NQVhfSEVJR0hUKTtcblx0XHRjb25zdCBtYXhTY3JvbGxUb3AgPSBjb250ZW50SGVpZ2h0IC0gdmlld3BvcnRIZWlnaHQ7XG5cdFx0dGhpcy5hdXRvU2Nyb2xsRW5hYmxlZCA9IG1heFNjcm9sbFRvcCA8PSAwIHx8IHNjcm9sbFRvcCA+PSBtYXhTY3JvbGxUb3AgLSAxMDtcblxuXHRcdHRoaXMudXBkYXRlRmFkZUNsYXNzZXMoc2Nyb2xsVG9wLCBjb250ZW50SGVpZ2h0LCB2aWV3cG9ydEhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZhZGVDbGFzc2VzKHNjcm9sbFRvcD86IG51bWJlciwgY29udGVudEhlaWdodD86IG51bWJlciwgdmlld3BvcnRIZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlIHx8IHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1mYWRlLXRvcCcsICdjaGF0LXRoaW5raW5nLWZhZGUtYm90dG9tJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFNjcm9sbFRvcCA9IHNjcm9sbFRvcCA/PyB0aGlzLmxhc3RLbm93blNjcm9sbFRvcDtcblx0XHRjb25zdCBjdXJyZW50Q29udGVudEhlaWdodCA9IGNvbnRlbnRIZWlnaHQgPz8gdGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0O1xuXHRcdGNvbnN0IGN1cnJlbnRWaWV3cG9ydEhlaWdodCA9IHZpZXdwb3J0SGVpZ2h0ID8/IE1hdGgubWluKGN1cnJlbnRDb250ZW50SGVpZ2h0LCBUSElOS0lOR19TQ1JPTExfTUFYX0hFSUdIVCk7XG5cdFx0Y29uc3QgbWF4U2Nyb2xsVG9wID0gY3VycmVudENvbnRlbnRIZWlnaHQgLSBjdXJyZW50Vmlld3BvcnRIZWlnaHQ7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC10aGlua2luZy1mYWRlLXRvcCcsIGN1cnJlbnRTY3JvbGxUb3AgPiA1KTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC10aGlua2luZy1mYWRlLWJvdHRvbScsIG1heFNjcm9sbFRvcCA+IDAgJiYgY3VycmVudFNjcm9sbFRvcCA8IG1heFNjcm9sbFRvcCAtIDUpO1xuXHR9XG5cblx0Ly8gRmFsbGJhY2sgZm9yIG5vbi1SZXNpemVPYnNlcnZlciB1cGRhdGVzIChvbkRpZENoYW5nZUhlaWdodCwgaW5pdGlhbCBzZXR1cCkuXG5cdHByaXZhdGUgc3luY0RpbWVuc2lvbnNBbmRTY2hlZHVsZVNjcm9sbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nU2Nyb2xsRGlzcG9zYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnBlbmRpbmdTY3JvbGxEaXNwb3NhYmxlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5wZW5kaW5nU2Nyb2xsRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGb3JDb21wbGV0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVmcmVzaENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRGltZW5zaW9uc0Zyb21DYWNoZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlYWQgc2Nyb2xsSGVpZ2h0IGZyb20gdGhlIERPTSBhbmQgdXBkYXRlIGNhY2hlZCBoZWlnaHQgaWYgY2hhbmdlZC5cblx0ICovXG5cdHByaXZhdGUgcmVmcmVzaENvbnRlbnRIZWlnaHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLndyYXBwZXIgfHwgIXRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV3SGVpZ2h0ID0gdGhpcy53cmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRpZiAobmV3SGVpZ2h0ICYmIG5ld0hlaWdodCAhPT0gdGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0KSB7XG5cdFx0XHR0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQgPSBuZXdIZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxEaW1lbnNpb25zRnJvbUNhY2hlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDb2xsYXBzZWQgPSB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LXVzZWQtY29udGV4dC1jb2xsYXBzZWQnKTtcblx0XHRpZiAoIWlzQ29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodDtcblx0XHRpZiAoIWNvbnRlbnRIZWlnaHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3cG9ydEhlaWdodCA9IE1hdGgubWluKGNvbnRlbnRIZWlnaHQsIFRISU5LSU5HX1NDUk9MTF9NQVhfSEVJR0hUKTtcblxuXHRcdHRoaXMuaXNVcGRhdGluZ0RpbWVuc2lvbnMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2aWV3cG9ydFdpZHRoID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCkuY2xpZW50V2lkdGg7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0XHR3aWR0aDogdmlld3BvcnRXaWR0aCxcblx0XHRcdFx0c2Nyb2xsV2lkdGg6IHZpZXdwb3J0V2lkdGgsXG5cdFx0XHRcdGhlaWdodDogdmlld3BvcnRIZWlnaHQsXG5cdFx0XHRcdHNjcm9sbEhlaWdodDogY29udGVudEhlaWdodFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICh0aGlzLmF1dG9TY3JvbGxFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuc2Nyb2xsVG9Cb3R0b20oY29udGVudEhlaWdodCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuaXNVcGRhdGluZ0RpbWVuc2lvbnMgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUZhZGVDbGFzc2VzKHRoaXMubGFzdEtub3duU2Nyb2xsVG9wLCB0aGlzLmxhc3RLbm93bkNvbnRlbnRIZWlnaHQpO1xuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoY29udGVudEhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIHNjcm9sbFRvQm90dG9tKGNvbnRlbnRIZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gTWF0aC5taW4oY29udGVudEhlaWdodCwgVEhJTktJTkdfU0NST0xMX01BWF9IRUlHSFQpO1xuXG5cdFx0aWYgKGNvbnRlbnRIZWlnaHQgPiB2aWV3cG9ydEhlaWdodCkge1xuXHRcdFx0Y29uc3QgbmV3U2Nyb2xsVG9wID0gY29udGVudEhlaWdodCAtIHZpZXdwb3J0SGVpZ2h0O1xuXHRcdFx0dGhpcy5sYXN0S25vd25TY3JvbGxUb3AgPSBuZXdTY3JvbGxUb3A7XG5cdFx0XHQvLyBQcmV2ZW50IHJldmVhbC1vbi1zY3JvbGwgYmVoYXZpb3IgZnJvbSBpbnRlcmZlcmluZyB3aXRoIGV4cGxpY2l0IGJvdHRvbSBwaW5uaW5nLlxuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRSZXZlYWxPblNjcm9sbChmYWxzZSk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBuZXdTY3JvbGxUb3AgfSk7XG5cdFx0XHR0aGlzLnNjcm9sbGFibGVFbGVtZW50LnNldFJldmVhbE9uU2Nyb2xsKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiB1cGRhdGVzIHNjcm9sbCBkaW1lbnNpb25zIHdoZW4gc3RyZWFtaW5nIGlzIGNvbXBsZXRlLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVTY3JvbGxEaW1lbnNpb25zRm9yQ29tcGxldGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgfHwgIXRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRoaXMud3JhcHBlci5zY3JvbGxIZWlnaHQ7XG5cdFx0dGhpcy5sYXN0S25vd25Db250ZW50SGVpZ2h0ID0gY29udGVudEhlaWdodDtcblxuXHRcdGNvbnN0IHNjcm9sbGFibGVEb21Ob2RlID0gdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCk7XG5cdFx0c2Nyb2xsYWJsZURvbU5vZGUuc3R5bGUubWF4SGVpZ2h0ID0gYCR7Y29udGVudEhlaWdodH1weGA7XG5cdFx0Y29uc3Qgdmlld3BvcnRXaWR0aCA9IHNjcm9sbGFibGVEb21Ob2RlLmNsaWVudFdpZHRoO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHR3aWR0aDogdmlld3BvcnRXaWR0aCxcblx0XHRcdHNjcm9sbFdpZHRoOiB2aWV3cG9ydFdpZHRoLFxuXHRcdFx0aGVpZ2h0OiBjb250ZW50SGVpZ2h0LFxuXHRcdFx0c2Nyb2xsSGVpZ2h0OiBjb250ZW50SGVpZ2h0XG5cdFx0fSk7XG5cdFx0dGhpcy5sYXN0S25vd25TY3JvbGxUb3AgPSAwO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0UmV2ZWFsT25TY3JvbGwoZmFsc2UpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IDAgfSk7XG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudC5zZXRSZXZlYWxPblNjcm9sbCh0cnVlKTtcblx0XHR0aGlzLnVwZGF0ZUNvbXBsZXRlZFNjcm9sbEFuaW1hdGlvblN0YXRlKHRoaXMuaXNFeHBhbmRlZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tcGxldGVkU2Nyb2xsQW5pbWF0aW9uU3RhdGUoZXhwYW5kZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSB0aGlzLnNjcm9sbGFibGVFbGVtZW50LmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlRG9tTm9kZS5zdHlsZS5tYXhIZWlnaHQgPSBleHBhbmRlZCA/IGAke3RoaXMubGFzdEtub3duQ29udGVudEhlaWdodH1weGAgOiAnMHB4Jztcblx0XHRzY3JvbGxhYmxlRG9tTm9kZS5pbmVydCA9ICFleHBhbmRlZDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2Rvd24oY29udGVudDogc3RyaW5nLCByZXVzZUV4aXN0aW5nPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEd1YXJkIGFnYWluc3QgcmVuZGVyaW5nIGFmdGVyIGRpc3Bvc2FsIHRvIGF2b2lkIGxlYWtpbmcgZGlzcG9zYWJsZXNcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjbGVhbmVkQ29udGVudCA9IGNvbnRlbnQudHJpbSgpO1xuXHRcdGlmICghY2xlYW5lZENvbnRlbnQpIHtcblx0XHRcdHRoaXMuX21hcmtkb3duUmVzdWx0LmNsZWFyKCk7XG5cdFx0XHRpZiAodGhpcy50ZXh0Q29udGFpbmVyKSB7XG5cdFx0XHRcdGNsZWFyTm9kZSh0aGlzLnRleHRDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBlbnRpcmUgY29udGVudCBpcyBib2xkZWQsIHN0cmlwIHRoZSBib2xkIG1hcmtlcnMgZm9yIHJlbmRlcmluZ1xuXHRcdGxldCBjb250ZW50VG9SZW5kZXIgPSBjbGVhbmVkQ29udGVudDtcblx0XHRpZiAoY2xlYW5lZENvbnRlbnQuc3RhcnRzV2l0aCgnKionKSAmJiBjbGVhbmVkQ29udGVudC5lbmRzV2l0aCgnKionKSkge1xuXHRcdFx0Y29udGVudFRvUmVuZGVyID0gY2xlYW5lZENvbnRlbnQuc2xpY2UoMiwgLTIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IHJldXNlRXhpc3RpbmcgPyB0aGlzLl9tYXJrZG93blJlc3VsdC52YWx1ZT8uZWxlbWVudCA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50VG9SZW5kZXIpLCB7XG5cdFx0XHRmaWxsSW5JbmNvbXBsZXRlVG9rZW5zOiB0cnVlLFxuXHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogdGhpcy5fYXN5bmNSZW5kZXJDYWxsYmFjayxcblx0XHRcdGNvZGVCbG9ja1JlbmRlcmVyU3luYzogQ2hhdFRoaW5raW5nQ29udGVudFBhcnQuX2NvZGVCbG9ja1JlbmRlcmVyU3luYyxcblx0XHR9LCB0YXJnZXQpO1xuXHRcdHRoaXMuX21hcmtkb3duUmVzdWx0LnZhbHVlID0gcmVuZGVyZWQ7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdGlmICh0aGlzLnRleHRDb250YWluZXIpIHtcblx0XHRcdFx0Y2xlYXJOb2RlKHRoaXMudGV4dENvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMudGV4dENvbnRhaW5lci5hcHBlbmRDaGlsZChjcmVhdGVUaGlua2luZ0ljb24oQ29kaWNvbi5jaXJjbGVGaWxsZWQpKTtcblx0XHRcdFx0dGhpcy50ZXh0Q29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0RmluYWxpemVkVGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwbGF5VGl0bGUgPSB0aGlzLmdldEZpbmFsaXplZERpc3BsYXlUaXRsZSh0aXRsZSk7XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWxFbGVtZW50O1xuXHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Y29uc3QgZmlyc3RTcGFjZUluZGV4ID0gZGlzcGxheVRpdGxlLmluZGV4T2YoJyAnKTtcblx0XHRpZiAoZmlyc3RTcGFjZUluZGV4ID09PSAtMSkge1xuXHRcdFx0Ly8gU2luZ2xlIHdvcmQgdGl0bGUsIG5vIG5lZWQgdG8gc3BsaXRcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGRpc3BsYXlUaXRsZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdmVyYiA9IGRpc3BsYXlUaXRsZS5zdWJzdHJpbmcoMCwgZmlyc3RTcGFjZUluZGV4KTtcblx0XHRcdGNvbnN0IHJlc3QgPSBkaXNwbGF5VGl0bGUuc3Vic3RyaW5nKGZpcnN0U3BhY2VJbmRleCk7XG5cblx0XHRcdGNvbnN0IHZlcmJTcGFuID0gJCgnc3BhbicpO1xuXHRcdFx0dmVyYlNwYW4udGV4dENvbnRlbnQgPSB2ZXJiO1xuXHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHZlcmJTcGFuKTtcblxuXHRcdFx0Y29uc3QgcmVzdFNwYW4gPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctdGl0bGUtZGV0YWlsLXRleHQnKTtcblx0XHRcdHJlc3RTcGFuLnRleHRDb250ZW50ID0gcmVzdDtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChyZXN0U3Bhbik7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBhZ2dyZWdhdGVkIGRpZmYgc3RhdHMgZnJvbSBlZGl0IHBpbGxzIChvbmx5IHdoZW4gdGhlcmUgYXJlIGFjdHVhbCBjaGFuZ2VzKVxuXHRcdGlmICh0aGlzLmRpZmZEYXRhQnlQYXJ0SWQuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IHsgYWRkZWQsIHJlbW92ZWQgfSA9IHRoaXMuX2FnZ3JlZ2F0ZWREaWZmO1xuXHRcdFx0aWYgKGFkZGVkID4gMCB8fCByZW1vdmVkID4gMCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckRpZmZCdXR0b24oYWRkZWQsIHJlbW92ZWQpO1xuXG5cdFx0XHRcdGNvbnN0IGluc2VydGlvbnNGcmFnbWVudCA9IGFkZGVkID09PSAxID8gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaW5zZXJ0aW9ucy5vbmUnLCBcIjEgaW5zZXJ0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuaW5zZXJ0aW9ucycsIFwiezB9IGluc2VydGlvbnNcIiwgYWRkZWQpO1xuXHRcdFx0XHRjb25zdCBkZWxldGlvbnNGcmFnbWVudCA9IHJlbW92ZWQgPT09IDEgPyBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5kZWxldGlvbnMub25lJywgXCIxIGRlbGV0aW9uXCIpIDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZGVsZXRpb25zJywgXCJ7MH0gZGVsZXRpb25zXCIsIHJlbW92ZWQpO1xuXHRcdFx0XHR0aGlzLnNldEFyaWFMYWJlbChsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aXRsZVdpdGhEaWZmJywgXCJ7MH0sIHsxfSwgezJ9XCIsIGRpc3BsYXlUaXRsZSwgaW5zZXJ0aW9uc0ZyYWdtZW50LCBkZWxldGlvbnNGcmFnbWVudCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbGVhckRpZmZCdXR0b24oKTtcblx0XHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwoZGlzcGxheVRpdGxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jbGVhckRpZmZCdXR0b24oKTtcblx0XHRcdHRoaXMuc2V0QXJpYUxhYmVsKGRpc3BsYXlUaXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJEaWZmQnV0dG9uKGFkZGVkOiBudW1iZXIsIHJlbW92ZWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHRoaXMuZ2V0QWdncmVnYXRlZERpZmZSZXNvdXJjZXMoKTtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5jbGVhckRpZmZCdXR0b24oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZGlmZkJ1dHRvbikge1xuXHRcdFx0Y29uc3QgY29sbGFwc2VCdXR0b24gPSB0aGlzLl9jb2xsYXBzZUJ1dHRvbjtcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGNvbGxhcHNlQnV0dG9uPy5lbGVtZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbGxhcHNlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy10aXRsZS13aXRoLWRpZmYnKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMuZGlmZkJ1dHRvblN0b3JlLmFkZChuZXcgQnV0dG9uKGNvbnRhaW5lciwge30pKTtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctdGl0bGUtZGlmZicpO1xuXHRcdFx0dGhpcy5kaWZmQnV0dG9uU3RvcmUuYWRkKGJ1dHRvbi5vbkRpZENsaWNrKGV2ZW50ID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMub3BlbkRpZmZzKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmRpZmZCdXR0b25TdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoYnV0dG9uLmVsZW1lbnQsIHtcblx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcudmlld0NoYW5nZXMnLCBcIlZpZXcgRmlsZSBDaGFuZ2VzXCIpLFxuXHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5kaWZmQnV0dG9uID0gYnV0dG9uO1xuXG5cdFx0XHRpZiAodGhpcy5faG92ZXJDaGV2cm9uKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9ob3ZlckNoZXZyb24pO1xuXHRcdFx0XHR0aGlzLmRpZmZCdXR0b25TdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2hvdmVyQ2hldnJvbiwgRXZlbnRUeXBlLkNMSUNLLCBldmVudCA9PiB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy50b2dnbGVFeHBhbmRlZCgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kaWZmQnV0dG9uLmVsZW1lbnQucmVwbGFjZUNoaWxkcmVuKFxuXHRcdFx0JCgnc3Bhbi5sYWJlbC1hZGRlZCcsIHt9LCBgKyR7YWRkZWR9YCksXG5cdFx0XHQkKCdzcGFuLmxhYmVsLXJlbW92ZWQnLCB7fSwgYC0ke3JlbW92ZWR9YCksXG5cdFx0KTtcblx0XHR0aGlzLmRpZmZCdXR0b24uc2V0QXJpYUxhYmVsKGxvY2FsaXplKFxuXHRcdFx0J2NoYXQudGhpbmtpbmcudmlld0NoYW5nZXNBY2Nlc3NpYmxlJyxcblx0XHRcdCdWaWV3IGZpbGUgY2hhbmdlcywgezB9IGxpbmVzIGFkZGVkLCB7MX0gbGluZXMgZGVsZXRlZCcsXG5cdFx0XHRhZGRlZCxcblx0XHRcdHJlbW92ZWQsXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyRGlmZkJ1dHRvbigpOiB2b2lkIHtcblx0XHR0aGlzLmRpZmZCdXR0b25TdG9yZS5jbGVhcigpO1xuXHRcdHRoaXMuZGlmZkJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbj8uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLXRpdGxlLXdpdGgtZGlmZicpO1xuXHRcdGlmICh0aGlzLl9jb2xsYXBzZUJ1dHRvbiAmJiB0aGlzLl9ob3ZlckNoZXZyb24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5faG92ZXJDaGV2cm9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFnZ3JlZ2F0ZWREaWZmUmVzb3VyY2VzKCk6IElDaGF0Q29udGVudFBhcnREaWZmUmVzb3VyY2VbXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIHtcblx0XHRcdHJlc291cmNlOiBVUkk7XG5cdFx0XHRvcmlnaW5hbFVSSTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0bW9kaWZpZWRVUkk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHR9PigpO1xuXG5cdFx0Zm9yIChjb25zdCBkYXRhIG9mIHRoaXMuZGlmZkRhdGFCeVBhcnRJZC52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBkYXRhLnJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBnZXRDb21wYXJpc29uS2V5KHJlc291cmNlLnJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSByZXN1bHQuZ2V0KGtleSk7XG5cdFx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRcdGV4aXN0aW5nLnJlc291cmNlID0gcmVzb3VyY2UucmVzb3VyY2U7XG5cdFx0XHRcdFx0ZXhpc3RpbmcubW9kaWZpZWRVUkkgPSByZXNvdXJjZS5tb2RpZmllZFVSSTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQuc2V0KGtleSwgeyAuLi5yZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBbLi4ucmVzdWx0LnZhbHVlcygpXS5maWx0ZXIocmVzb3VyY2UgPT4gcmVzb3VyY2Uub3JpZ2luYWxVUkkgIT09IHVuZGVmaW5lZCB8fCByZXNvdXJjZS5tb2RpZmllZFVSSSAhPT0gdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkRpZmZzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHRoaXMuZ2V0QWdncmVnYXRlZERpZmZSZXNvdXJjZXMoKTtcblx0XHRpZiAocmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShgbXVsdGktZGlmZi1lZGl0b3I6JHtEYXRlLm5vdygpLnRvU3RyaW5nKCl9LSR7TWF0aC5yYW5kb20oKS50b1N0cmluZygzNikuc2xpY2UoMil9YCk7XG5cdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0bXVsdGlEaWZmU291cmNlOiBzb3VyY2UsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuY2hhbmdlcy50aXRsZScsIFwiU2VjdGlvbiBGaWxlIENoYW5nZXNcIiksXG5cdFx0XHRyZXNvdXJjZXM6IHJlc291cmNlcy5tYXAocmVzb3VyY2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IHJlc291cmNlLm9yaWdpbmFsVVJJIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiByZXNvdXJjZS5tb2RpZmllZFVSSSB9LFxuXHRcdFx0XHRnb1RvRmlsZVJlc291cmNlOiByZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdH0pKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmluYWxpemVkRGlzcGxheVRpdGxlKHRpdGxlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLnRoaW5raW5nRGlzcGxheU1vZGUgIT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkIHx8ICF0aGlzLmNvbnRhaW5zUmVhc29uaW5nIHx8IHRoaXMuY29udGFpbnNHcm91cGVkSXRlbXMgfHwgIXRoaXMucmVhc29uaW5nRHVyYXRpb25Ncykge1xuXHRcdFx0cmV0dXJuIHRpdGxlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY29uZHMgPSBNYXRoLmNlaWwodGhpcy5yZWFzb25pbmdEdXJhdGlvbk1zIC8gMTAwMCk7XG5cdFx0Y29uc3QgZHVyYXRpb24gPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5kdXJhdGlvbi5zZWNvbmRzJywgXCJ7MH1zXCIsIHNlY29uZHMpO1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy50aXRsZVdpdGhEdXJhdGlvbicsIFwiezB9IC0gezF9XCIsIHRpdGxlLCBkdXJhdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgaGFzUmVhc29uaW5nQ29udGVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWluc1JlYXNvbmluZztcblx0fVxuXG5cdHB1YmxpYyBoYXNHcm91cGVkSXRlbXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbnNHcm91cGVkSXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIHJlY29yZFJlYXNvbmluZ0NvbnRlbnQoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZW50LnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRhaW5zUmVhc29uaW5nID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0RHJvcGRvd25DbGlja2FibGUoY2xpY2thYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LnN0eWxlLnBvaW50ZXJFdmVudHMgPSBjbGlja2FibGUgPyAnYXV0bycgOiAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKCFjbGlja2FibGUgJiYgdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpIHtcblx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUodGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPz8gdGhpcy5jdXJyZW50VGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQWxsb3dFeHBhbnNpb24oKTogYm9vbGVhbiB7XG5cdFx0Ly8gTXVsdGlwbGUgdG9vbCBpbnZvY2F0aW9ucyBvciBsYXp5IGl0ZW1zIG1lYW4gdGhlcmUncyBjb250ZW50IHRvIHNob3dcblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbkNvdW50ID4gMCB8fCB0aGlzLmxhenlJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDb3VudCBtZWFuaW5nZnVsIGNoaWxkcmVuIGluIHRoZSB3cmFwcGVyIChleGNsdWRlIHRoZSB3b3JraW5nIHNwaW5uZXIpXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0Y29uc3QgbWVhbmluZ2Z1bENoaWxkcmVuID0gQXJyYXkuZnJvbSh0aGlzLndyYXBwZXIuY2hpbGRyZW4pLmZpbHRlcihjaGlsZCA9PiBjaGlsZCAhPT0gdGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQpLmxlbmd0aDtcblx0XHRcdGlmIChtZWFuaW5nZnVsQ2hpbGRyZW4gPiAxKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnRXaXRob3V0VGl0bGUgPSB0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlLnRyaW0oKTtcblx0XHRjb25zdCB0aXRsZVRvQ29tcGFyZSA9IHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID8/IHRoaXMuY3VycmVudFRpdGxlO1xuXG5cdFx0Y29uc3Qgc3RyaXBNYXJrZG93biA9ICh0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiB0ZXh0XG5cdFx0XHRcdC5yZXBsYWNlKC9cXCpcXCooLis/KVxcKlxcKi9nLCAnJDEnKS5yZXBsYWNlKC9cXCooLis/KVxcKi9nLCAnJDEnKS5yZXBsYWNlKC9gKC4rPylgL2csICckMScpLnRyaW0oKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RyaXBwZWRDb250ZW50ID0gc3RyaXBNYXJrZG93bihjb250ZW50V2l0aG91dFRpdGxlKTtcblx0XHQvLyBJZiBjb250ZW50IGlzIGVtcHR5IG9yIG1hdGNoZXMgdGhlIHRpdGxlIGV4YWN0bHksIG5vdGhpbmcgdG8gZXhwYW5kXG5cdFx0cmV0dXJuICEoIXN0cmlwcGVkQ29udGVudCB8fCBzdHJpcHBlZENvbnRlbnQgPT09IHRpdGxlVG9Db21wYXJlKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoa25vd25Db250ZW50SGVpZ2h0PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IGFsbG93RXhwYW5zaW9uID0gdGhpcy5zaG91bGRBbGxvd0V4cGFuc2lvbigpO1xuXG5cdFx0Ly8gZG9uJ3QgYWxsb3cgZmVlZGJhY2sgb24gZml4ZWQgc2Nyb2xsaW5nIGJlZm9yZSByZWFjaGluZyBtYXggaGVpZ2h0LlxuXHRcdGlmIChhbGxvd0V4cGFuc2lvbiAmJiB0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgIXRoaXMuZWxlbWVudC5pc0NvbXBsZXRlICYmIHRoaXMud3JhcHBlcikge1xuXHRcdFx0Ly8gVXNlIG9ubHkgdGhlIGNhY2hlZCBoZWlnaHQgXHUyMDE0IG5ldmVyIHJlYWQgc2Nyb2xsSGVpZ2h0IGhlcmUgdG8gYXZvaWQgZm9yY2VkIHJlZmxvd3MuXG5cdFx0XHQvLyBJZiB0aGUgY2FjaGUgaXMgZW1wdHksIGNvbnNlcnZhdGl2ZWx5IGRpc2FsbG93IGV4cGFuc2lvbjsgdGhlIFJlc2l6ZU9ic2VydmVyXG5cdFx0XHQvLyB3aWxsIHBvcHVsYXRlIGxhc3RLbm93bkNvbnRlbnRIZWlnaHQgYW5kIHRyaWdnZXIgYW5vdGhlciBjYWxsIG9uY2UgbGF5b3V0IHNldHRsZXMuXG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0ga25vd25Db250ZW50SGVpZ2h0ID8/IHRoaXMubGFzdEtub3duQ29udGVudEhlaWdodDtcblx0XHRcdGlmICghY29udGVudEhlaWdodCB8fCBjb250ZW50SGVpZ2h0IDw9IFRISU5LSU5HX1NDUk9MTF9NQVhfSEVJR0hUKSB7XG5cdFx0XHRcdGFsbG93RXhwYW5zaW9uID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFhbGxvd0V4cGFuc2lvbiAmJiB0aGlzLmlzRXhwYW5kZWQoKSAmJiAodGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgfHwgdGhpcy5lbGVtZW50LmlzQ29tcGxldGUpKSB7XG5cdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHR9XG5cdFx0dGhpcy5zZXREcm9wZG93bkNsaWNrYWJsZShhbGxvd0V4cGFuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIGFwcGVuZFRvV3JhcHBlcihlbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53cmFwcGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCAmJiB0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5wYXJlbnROb2RlID09PSB0aGlzLndyYXBwZXIpIHtcblx0XHRcdHRoaXMud3JhcHBlci5pbnNlcnRCZWZvcmUoZWxlbWVudCwgdGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkocmVhZGVyPzogSVJlYWRlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy53cmFwcGVyIHx8ICF0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1J1bm5pbmdUZXJtaW5hbFRvb2wgPSB0aGlzLnRvb2xJbnZvY2F0aW9ucy5zb21lKHRvb2xJbnZvY2F0aW9uID0+IHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0ZXJtaW5hbERhdGE/LmtpbmQgIT09ICd0ZXJtaW5hbCcgfHwgdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodG9vbEludm9jYXRpb24sIHJlYWRlcik7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBpc0F0dGFjaGVkID0gdGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucGFyZW50Tm9kZSA9PT0gdGhpcy53cmFwcGVyO1xuXHRcdGlmIChoYXNSdW5uaW5nVGVybWluYWxUb29sICYmIGlzQXR0YWNoZWQpIHtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHRcdH0gZWxzZSBpZiAoIWhhc1J1bm5pbmdUZXJtaW5hbFRvb2wgJiYgIWlzQXR0YWNoZWQgJiYgIXRoaXMuc3RyZWFtaW5nQ29tcGxldGVkICYmICF0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRJZCgpOiB2b2lkIHtcblx0XHR0aGlzLmlkID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQ29udGVudCgpOiB2b2lkIHtcblx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVUaGlua2luZyhjb250ZW50OiBJQ2hhdFRoaW5raW5nUGFydCk6IHZvaWQge1xuXHRcdC8vIElmIGRpc3Bvc2VkLCBpZ25vcmUgbGF0ZSB1cGRhdGVzIGNvbWluZyBmcm9tIHJlbmRlcmVyIGRpZmZpbmdcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHRcdHRoaXMucmVhc29uaW5nRHVyYXRpb25NcyA9IGNvbnRlbnQucmVhc29uaW5nRHVyYXRpb25NcztcblxuXHRcdC8vIFVwZGF0ZSBhbnkgcGVuZGluZyBsYXp5IHRoaW5raW5nIGl0ZW0gd2l0aCBtYXRjaGluZyBJRCBzbyB0aGF0XG5cdFx0Ly8gd2hlbiBtYXRlcmlhbGl6ZWQsIGl0IHdpbGwgaGF2ZSB0aGUgbGF0ZXN0IHN0cmVhbWluZyBjb250ZW50XG5cdFx0Zm9yIChjb25zdCBsYXp5SXRlbSBvZiB0aGlzLmxhenlJdGVtcykge1xuXHRcdFx0aWYgKGxhenlJdGVtLmtpbmQgPT09ICd0aGlua2luZycgJiYgbGF6eUl0ZW0uY29udGVudC5pZCA9PT0gY29udGVudC5pZCkge1xuXHRcdFx0XHRsYXp5SXRlbS5jb250ZW50ID0gY29udGVudDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3ID0gZXh0cmFjdFRleHRGcm9tUGFydChjb250ZW50KTtcblx0XHR0aGlzLnJlY29yZFJlYXNvbmluZ0NvbnRlbnQocmF3KTtcblx0XHRjb25zdCBuZXh0ID0gcmF3O1xuXHRcdGlmIChuZXh0ID09PSB0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZpb3VzVmFsdWUgPSB0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlO1xuXHRcdGNvbnN0IHJldXNlRXhpc3RpbmcgPSAhISh0aGlzLl9tYXJrZG93blJlc3VsdC52YWx1ZSAmJiBuZXh0LnN0YXJ0c1dpdGgocHJldmlvdXNWYWx1ZSkgJiYgbmV4dC5sZW5ndGggPiBwcmV2aW91c1ZhbHVlLmxlbmd0aCk7XG5cdFx0dGhpcy5jdXJyZW50VGhpbmtpbmdWYWx1ZSA9IG5leHQ7XG5cdFx0dGhpcy5yZW5kZXJNYXJrZG93bihuZXh0LCByZXVzZUV4aXN0aW5nKTtcblxuXHRcdGlmICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiB0aGlzLnNjcm9sbGFibGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHR0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnNGcm9tQ2FjaGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBleHRyYWN0ZWRUaXRsZSA9IGV4dHJhY3RUaXRsZUZyb21UaGlua2luZ0NvbnRlbnQocmF3KTtcblx0XHRpZiAoZXh0cmFjdGVkVGl0bGUgJiYgZXh0cmFjdGVkVGl0bGUgIT09IHRoaXMuY3VycmVudFRpdGxlKSB7XG5cdFx0XHRpZiAoIXRoaXMuZXh0cmFjdGVkVGl0bGVzLmluY2x1ZGVzKGV4dHJhY3RlZFRpdGxlKSkge1xuXHRcdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5wdXNoKGV4dHJhY3RlZFRpdGxlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID0gZXh0cmFjdGVkVGl0bGU7XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRyYWN0ZWRUaXRsZSB8fCBleHRyYWN0ZWRUaXRsZSA9PT0gdGhpcy5jdXJyZW50VGl0bGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbCA9IHRoaXMubGFzdEV4dHJhY3RlZFRpdGxlID8/ICcnO1xuXHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuX2lzRXhwYW5kZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuc2V0VGl0bGUobGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJc0FjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0FjdGl2ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgd2hlbiB0aGlzIHRoaW5raW5nIHBhcnQgaGFzIG5vIG1lYW5pbmdmdWwgY29udGVudCB0byBkaXNwbGF5OlxuXHQgKiBubyB0b29sIGludm9jYXRpb25zLCBubyBsYXp5IGl0ZW1zLCBubyBob29rcywgYW5kIG5vIHRoaW5raW5nIHRleHQuXG5cdCAqIFRoaXMgaGFwcGVucyB3aGVuIGEgdG9vbCBpcyByZW1vdmVkIGZyb20gdGhpbmtpbmcgKGUuZy4gZHVlIHRvIGNvbmZpcm1hdGlvbilcblx0ICogYW5kIHRoZSB0aGlua2luZyBwYXJ0IHdhcyBvbmx5IGNyZWF0ZWQgdG8gaG9sZCB0aGF0IHRvb2wuXG5cdCAqL1xuXHRwdWJsaWMgaXNFZmZlY3RpdmVseUVtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMucHJvY2Vzc1BlbmRpbmdSZW1vdmFscygpO1xuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uQ291bnQgPiAwIHx8IHRoaXMubGF6eUl0ZW1zLmxlbmd0aCA+IDAgfHwgdGhpcy5ob29rQ291bnQgPiAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlLnRyaW0oKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG1hcmtBc0luYWN0aXZlKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1mYWRlLXRvcCcsICdjaGF0LXRoaW5raW5nLWZhZGUtYm90dG9tJyk7XG5cdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlbW92YWxzKCk7XG5cdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KSB7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRoZSBhdHRhY2hlZC10by10aGlua2luZyBmbGFnIG9uIGFsbCB0b29sIGludm9jYXRpb25zXG5cdFx0Zm9yIChjb25zdCB0b29sSW52b2NhdGlvbiBvZiB0aGlzLnRvb2xJbnZvY2F0aW9ucykge1xuXHRcdFx0dG9vbEludm9jYXRpb24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpOiB2b2lkIHtcblx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblxuXHRcdC8vIFdpdGggbGF6eSByZW5kZXJpbmcsIHdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiBjb250ZW50IGhhc24ndCBiZWVuIGV4cGFuZGVkXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0dGhpcy53cmFwcGVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGhpbmtpbmctc3RyZWFtaW5nJyk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLWFjdGl2ZScpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLWZhZGUtdG9wJywgJ2NoYXQtdGhpbmtpbmctZmFkZS1ib3R0b20nKTtcblx0XHR0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCA9IHRydWU7XG5cdFx0dGhpcy5zZXRDb250ZW50QW5pbWF0aW9uRW5hYmxlZCghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUpO1xuXG5cdFx0Ly8gTm93IHRoYXQgc3RyZWFtaW5nIGlzIGNvbXBsZXRlLCByZW5kZXIgYW55IGFnZ3JlZ2F0ZWQgaW1hZ2VzIHRoYXQgd2VyZVxuXHRcdC8vIGRlZmVycmVkIHdoaWxlIHNjcm9sbGluZyB3YXMgcGlubmVkIGluIGZpeGVkIHNjcm9sbGluZyBtb2RlLlxuXHRcdHRoaXMuZmx1c2hQZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMoKTtcblxuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzY3JvbGwgZGltZW5zaW9ucyBub3cgdGhhdCBzdHJlYW1pbmcgaXMgY29tcGxldGVcblx0XHQvLyBUaGlzIHJlbW92ZXMgdW5uZWNlc3Nhcnkgc2Nyb2xsYmFyIHdoZW4gY29udGVudCBmaXRzXG5cdFx0dGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zRm9yQ29tcGxldGlvbigpO1xuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXG5cdFx0aWYgKHRoaXMuY29udGVudC5nZW5lcmF0ZWRUaXRsZSkge1xuXHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGU7XG5cdFx0XHR0aGlzLnNldEdlbmVyYXRlZFRpdGxlT25BbGxQYXJ0cyh0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUpO1xuXHRcdFx0dGhpcy5zZXRGaW5hbGl6ZWRUaXRsZSh0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJldXNlIGFueSBleGlzdGluZyBnZW5lcmF0ZWQgdGl0bGUgZnJvbSB0b29sIGludm9jYXRpb25zIG9yIHRoaW5raW5nIHBhcnRzLlxuXHRcdGNvbnN0IGV4aXN0aW5nVGl0bGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9ucy5maW5kKHQgPT4gdC5nZW5lcmF0ZWRUaXRsZSk/LmdlbmVyYXRlZFRpdGxlXG5cdFx0XHQ/PyB0aGlzLmFsbFRoaW5raW5nUGFydHMuZmluZCh0ID0+IHQuZ2VuZXJhdGVkVGl0bGUpPy5nZW5lcmF0ZWRUaXRsZTtcblx0XHRpZiAoZXhpc3RpbmdUaXRsZSkge1xuXHRcdFx0dGhpcy5jdXJyZW50VGl0bGUgPSBleGlzdGluZ1RpdGxlO1xuXHRcdFx0dGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlID0gZXhpc3RpbmdUaXRsZTtcblx0XHRcdHRoaXMuc2V0R2VuZXJhdGVkVGl0bGVPbkFsbFBhcnRzKGV4aXN0aW5nVGl0bGUpO1xuXHRcdFx0dGhpcy5zZXRGaW5hbGl6ZWRUaXRsZShleGlzdGluZ1RpdGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGNoZWNrIHRoZSBwZXJzaXN0ZWQgY2FjaGUgd2hlbiByZS1yZW5kZXJpbmcgKHRvb2wgaW52b2NhdGlvbnMgYXJlXG5cdFx0Ly8gc2VyaWFsaXplZCksIG5vdCBkdXJpbmcgbGl2ZSBzdHJlYW1pbmcuIFJlYXNvbmluZy1vbmx5IGJsb2NrcyAobm8gdG9vbHMpXG5cdFx0Ly8gYXJlIGtleWVkIG9mZiB0aGUgc3RhYmxlIHRoaW5raW5nIHBhcnQgaWQgc28gdGhlaXIgZ2VuZXJhdGVkIGhlYWRlcnMgYXJlXG5cdFx0Ly8gYWxzbyByZXN0b3JlZCBvbiByZWxvYWQgKG5vbi1sb2NhbCBzZXNzaW9ucyBvbmx5KS5cblx0XHRjb25zdCBhbGxUb29sc1NlcmlhbGl6ZWQgPSB0aGlzLnRvb2xJbnZvY2F0aW9ucy5ldmVyeSh0ID0+IHQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdGlmIChhbGxUb29sc1NlcmlhbGl6ZWQgJiYgIUxvY2FsQ2hhdFNlc3Npb25VcmkuaXNMb2NhbFNlc3Npb24odGhpcy5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLmdldFRpdGxlQ2FjaGVJZCgpO1xuXHRcdFx0aWYgKGNhY2hlSWQpIHtcblx0XHRcdFx0Y29uc3QgY2FjaGVkVGl0bGUgPSB0aGlzLmdldENhY2hlZFRpdGxlKGNhY2hlSWQpO1xuXHRcdFx0XHRpZiAoY2FjaGVkVGl0bGUpIHtcblx0XHRcdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IGNhY2hlZFRpdGxlO1xuXHRcdFx0XHRcdHRoaXMuY29udGVudC5nZW5lcmF0ZWRUaXRsZSA9IGNhY2hlZFRpdGxlO1xuXHRcdFx0XHRcdHRoaXMuc2V0R2VuZXJhdGVkVGl0bGVPbkFsbFBhcnRzKGNhY2hlZFRpdGxlKTtcblx0XHRcdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKGNhY2hlZFRpdGxlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjYXNlIHdoZXJlIHdlIG9ubHkgaGF2ZSBvbmUgaXRlbSAodG9vbCBvciBlZGl0KSBpbiB0aGUgdGhpbmtpbmcgY29udGFpbmVyIGFuZCBubyB0aGlua2luZyBwYXJ0cywgd2Ugd2FudCB0byBtb3ZlIGl0IGJhY2sgdG8gaXRzIG9yaWdpbmFsIHBvc2l0aW9uXG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb25Db3VudCA9PT0gMSAmJiB0aGlzLmhvb2tDb3VudCA9PT0gMCAmJiB0aGlzLmN1cnJlbnRUaGlua2luZ1ZhbHVlLnRyaW0oKSA9PT0gJycpIHtcblx0XHRcdC8vIElmIHNpbmdsZUl0ZW1JbmZvIHdhc24ndCBzZXQgKGl0ZW0gd2FzIGxhenkvZGVmZXJyZWQpLCBtYXRlcmlhbGl6ZSBpdCBub3dcblx0XHRcdGlmICghdGhpcy5zaW5nbGVJdGVtSW5mbykge1xuXHRcdFx0XHRjb25zdCBsYXp5SXRlbSA9IHRoaXMubGF6eUl0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmtpbmQgPT09ICd0b29sJyAmJiBpdGVtLm9yaWdpbmFsUGFyZW50KTtcblx0XHRcdFx0aWYgKGxhenlJdGVtICYmIGxhenlJdGVtLmtpbmQgPT09ICd0b29sJykge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmIChsYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBsYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpID8gbGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGxhenlJdGVtLmxhenkudmFsdWU7XG5cdFx0XHRcdFx0dGhpcy5hcHBlbmRJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGxhenlJdGVtLnRvb2xJbnZvY2F0aW9uSWQsIGxhenlJdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biwgbGF6eUl0ZW0ub3JpZ2luYWxQYXJlbnQpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQuZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IHRvb2xJbnZvY2F0aW9uPy50b29sQ2FsbElkO1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5vd25lZFRvb2xQYXJ0cy5zZXQodG9vbENhbGxJZCwgcmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc2luZ2xlSXRlbUluZm8gJiYgdGhpcy5yZXN0b3JlU2luZ2xlSXRlbVRvT3JpZ2luYWxQb3NpdGlvbigpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBpZiBleGFjdGx5IG9uZSBhY3R1YWwgZXh0cmFjdGVkIHRpdGxlIGFuZCBubyB0b29sIGludm9jYXRpb25zLCB1c2UgdGhhdCBhcyB0aGUgZmluYWwgdGl0bGUuXG5cdFx0aWYgKHRoaXMuZXh0cmFjdGVkVGl0bGVzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLnRvb2xJbnZvY2F0aW9uQ291bnQgPT09IDApIHtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGhpcy5leHRyYWN0ZWRUaXRsZXNbMF07XG5cdFx0XHR0aGlzLmN1cnJlbnRUaXRsZSA9IHRpdGxlO1xuXHRcdFx0dGhpcy5jb250ZW50LmdlbmVyYXRlZFRpdGxlID0gdGl0bGU7XG5cdFx0XHR0aGlzLnNldEdlbmVyYXRlZFRpdGxlT25BbGxQYXJ0cyh0aXRsZSk7XG5cdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKHRpdGxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBnZW5lcmF0ZVRpdGxlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdHZW5lcmF0ZVRpdGxlcykgPz8gdHJ1ZTtcblx0XHRpZiAoIWdlbmVyYXRlVGl0bGVzKSB7XG5cdFx0XHR0aGlzLnNldEZhbGxiYWNrVGl0bGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmdlbmVyYXRlVGl0bGVWaWFMTE0oKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0R2VuZXJhdGVkVGl0bGVPbkFsbFBhcnRzKHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRvb2xJbnZvY2F0aW9uIG9mIHRoaXMudG9vbEludm9jYXRpb25zKSB7XG5cdFx0XHR0b29sSW52b2NhdGlvbi5nZW5lcmF0ZWRUaXRsZSA9IHRpdGxlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRoaW5raW5nUGFydCBvZiB0aGlzLmFsbFRoaW5raW5nUGFydHMpIHtcblx0XHRcdHRoaW5raW5nUGFydC5nZW5lcmF0ZWRUaXRsZSA9IHRpdGxlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZFRpdGxlQ2FjaGUoKTogUmVjb3JkPHN0cmluZywgeyB0aXRsZTogc3RyaW5nOyBzdG9yZWRBdDogbnVtYmVyIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8UmVjb3JkPHN0cmluZywgeyB0aXRsZTogc3RyaW5nOyBzdG9yZWRBdDogbnVtYmVyIH0+PihUSVRMRV9DQUNIRV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID8/IHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlVGl0bGVDYWNoZShjYWNoZTogUmVjb3JkPHN0cmluZywgeyB0aXRsZTogc3RyaW5nOyBzdG9yZWRBdDogbnVtYmVyIH0+KTogdm9pZCB7XG5cdFx0aWYgKE9iamVjdC5rZXlzKGNhY2hlKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRJVExFX0NBQ0hFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVElUTEVfQ0FDSEVfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGNhY2hlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUaXRsZUNhY2hlS2V5KGlkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtjaGF0U2Vzc2lvblJlc291cmNlVG9JZCh0aGlzLmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKX06JHtpZH1gO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YWJsZSBpZCB1c2VkIHRvIHBlcnNpc3QvcmVzdG9yZSB0aGUgZ2VuZXJhdGVkIHRpdGxlLiBUb29sLWJhc2VkIGJsb2Nrc1xuXHQgKiBrZXkgb2ZmIHRoZSBsYXN0IHRvb2wgY2FsbCBpZDsgcmVhc29uaW5nLW9ubHkgYmxvY2tzIGZhbGwgYmFjayB0byB0aGVcblx0ICogdGhpbmtpbmcgcGFydCBpZCBzbyB0aGVpciBoZWFkZXJzIGFsc28gc3Vydml2ZSBhIHNlc3Npb24gcmVsb2FkLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRUaXRsZUNhY2hlSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXN0VG9vbCA9IHRoaXMudG9vbEludm9jYXRpb25zW3RoaXMudG9vbEludm9jYXRpb25zLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChsYXN0VG9vbCkge1xuXHRcdFx0cmV0dXJuIGxhc3RUb29sLnRvb2xDYWxsSWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmFsbFRoaW5raW5nUGFydHMuZmluZCh0ID0+IHQuaWQpPy5pZCA/PyB0aGlzLmNvbnRlbnQuaWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENhY2hlZFRpdGxlKGlkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5sb2FkVGl0bGVDYWNoZSgpW3RoaXMuZ2V0VGl0bGVDYWNoZUtleShpZCldO1xuXHRcdGlmICghZW50cnkgfHwgKERhdGUubm93KCkgLSBlbnRyeS5zdG9yZWRBdCkgPiBUSVRMRV9DQUNIRV9UVExfTVMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBlbnRyeS50aXRsZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q2FjaGVkVGl0bGUoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNhY2hlID0gdGhpcy5sb2FkVGl0bGVDYWNoZSgpO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cblx0XHQvLyBFdmljdCBleHBpcmVkIGVudHJpZXMgb24gd3JpdGVcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhjYWNoZSkpIHtcblx0XHRcdGlmICgobm93IC0gY2FjaGVba2V5XS5zdG9yZWRBdCkgPiBUSVRMRV9DQUNIRV9UVExfTVMpIHtcblx0XHRcdFx0ZGVsZXRlIGNhY2hlW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2FjaGVbdGhpcy5nZXRUaXRsZUNhY2hlS2V5KGlkKV0gPSB7IHRpdGxlLCBzdG9yZWRBdDogbm93IH07XG5cblx0XHQvLyBDYXAgc2l6ZSBieSBkcm9wcGluZyBvbGRlc3QgZW50cmllc1xuXHRcdGNvbnN0IGtleXMgPSBPYmplY3Qua2V5cyhjYWNoZSk7XG5cdFx0aWYgKGtleXMubGVuZ3RoID4gVElUTEVfQ0FDSEVfTUFYX0VOVFJJRVMpIHtcblx0XHRcdGNvbnN0IHNvcnRlZCA9IGtleXMuc29ydCgoYSwgYikgPT4gY2FjaGVbYV0uc3RvcmVkQXQgLSBjYWNoZVtiXS5zdG9yZWRBdCk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNvcnRlZC5sZW5ndGggLSBUSVRMRV9DQUNIRV9NQVhfRU5UUklFUzsgaSsrKSB7XG5cdFx0XHRcdGRlbGV0ZSBjYWNoZVtzb3J0ZWRbaV1dO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc2F2ZVRpdGxlQ2FjaGUoY2FjaGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZW5lcmF0ZVRpdGxlVmlhTExNKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IGN0cy5jYW5jZWwoKSwgNTAwMCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gYXdhaXQgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoeyB2ZW5kb3I6ICdjb3BpbG90JywgaWQ6ICdjb3BpbG90LXV0aWxpdHktc21hbGwnIH0pO1xuXHRcdFx0aWYgKCFtb2RlbHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuc2V0RmFsbGJhY2tUaXRsZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRGYWxsYmFja1RpdGxlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGNvbnRleHQ6IHN0cmluZztcblx0XHRcdGlmICh0aGlzLmV4dHJhY3RlZFRpdGxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnRleHQgPSB0aGlzLmV4dHJhY3RlZFRpdGxlcy5qb2luKCcsICcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGV4dCA9IHRoaXMuY3VycmVudFRoaW5raW5nVmFsdWUuc3Vic3RyaW5nKDAsIDEwMDApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9tcHQgPSBgU3VtbWFyaXplIHRoZSBmb2xsb3dpbmcgY29udGVudCBpbiBhIFNJTkdMRSBzZW50ZW5jZSAodW5kZXIgMTAgd29yZHMpIHVzaW5nIHBhc3QgdGVuc2UuIEZvbGxvdyB0aGVzZSBydWxlcyBzdHJpY3RseTpcblxuXHRcdFx0T1VUUFVUIEZPUk1BVDpcblx0XHRcdC0gTVVTVCBiZSBhIHNpbmdsZSBzZW50ZW5jZVxuXHRcdFx0LSBNVVNUIGJlIHVuZGVyIDEwIHdvcmRzXG5cdFx0XHQtIFRoZSBGSVJTVCB3b3JkIE1VU1QgYmUgYSBwYXN0IHRlbnNlIHZlcmIgKGUuZy4gXCJVcGRhdGVkXCIsIFwiUmV2aWV3ZWRcIiwgXCJDcmVhdGVkXCIsIFwiU2VhcmNoZWRcIiwgXCJBbmFseXplZFwiKVxuXHRcdFx0LSBObyBxdW90ZXMsIG5vIHRyYWlsaW5nIHB1bmN0dWF0aW9uXG5cblx0XHRcdEdFTkVSQUw6XG5cdFx0XHQtIFRoZSBjb250ZW50IG1heSBpbmNsdWRlIHRvb2wgaW52b2NhdGlvbnMgKGZpbGUgZWRpdHMsIHJlYWRzLCBzZWFyY2hlcywgdGVybWluYWwgY29tbWFuZHMpLCByZWFzb25pbmcgaGVhZGVycywgb3IgcmF3IHRoaW5raW5nIHRleHRcblx0XHRcdC0gRm9yIHJlYXNvbmluZyBoZWFkZXJzIG9yIHRoaW5raW5nIHRleHQgKG5vIHRvb2wgY2FsbHMpLCBzdW1tYXJpemUgV0hBVCB3YXMgY29uc2lkZXJlZC9hbmFseXplZCwgTk9UIHRoYXQgdGhpbmtpbmcgb2NjdXJyZWRcblx0XHRcdC0gRm9yIHRoaW5raW5nLW9ubHkgc3VtbWFyaWVzLCB1c2UgcGhyYXNlcyBsaWtlOiBcIkNvbnNpZGVyZWQuLi5cIiwgXCJQbGFubmVkLi4uXCIsIFwiQW5hbHl6ZWQuLi5cIiwgXCJSZXZpZXdlZC4uLlwiXG5cblx0XHRcdFRPT0wgTkFNRSBGSUxURVJJTkc6XG5cdFx0XHQtIE5FVkVSIGluY2x1ZGUgdG9vbCBuYW1lcyBsaWtlIFwiUmVwbGFjZSBTdHJpbmcgaW4gRmlsZVwiLCBcIk11bHRpIFJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIiwgXCJDcmVhdGUgRmlsZVwiLCBcIlJlYWQgRmlsZVwiLCBldGMuIGluIHRoZSBvdXRwdXRcblx0XHRcdC0gSWYgYW4gYWN0aW9uIHNheXMgXCJFZGl0ZWQgWCBhbmQgdXNlZCBSZXBsYWNlIFN0cmluZyBpbiBGaWxlXCIsIG91dHB1dCBPTkxZIHRoZSBhY3Rpb24gb24gWFxuXHRcdFx0LSBUb29sIG5hbWVzIGRlc2NyaWJlIEhPVyBzb21ldGhpbmcgd2FzIGRvbmUsIG5vdCBXSEFUIHdhcyBkb25lIC0gYWx3YXlzIG9taXQgdGhlbVxuXG5cdFx0XHRWT0NBQlVMQVJZIC0gVXNlIHZhcmllZCBzeW5vbnltcyBmb3IgbmF0dXJhbC1zb3VuZGluZyBzdW1tYXJpZXM6XG5cdFx0XHQtIEZvciBlZGl0czogXCJVcGRhdGVkXCIsIFwiTW9kaWZpZWRcIiwgXCJDaGFuZ2VkXCIsIFwiUmVmYWN0b3JlZFwiLCBcIkZpeGVkXCIsIFwiQWRqdXN0ZWRcIlxuXHRcdFx0LSBGb3IgcmVhZHM6IFwiUmV2aWV3ZWRcIiwgXCJFeGFtaW5lZFwiLCBcIkNoZWNrZWRcIiwgXCJJbnNwZWN0ZWRcIiwgXCJBbmFseXplZFwiLCBcIkV4cGxvcmVkXCJcblx0XHRcdC0gRm9yIGNyZWF0ZXM6IFwiQ3JlYXRlZFwiLCBcIkFkZGVkXCIsIFwiR2VuZXJhdGVkXCJcblx0XHRcdC0gRm9yIHNlYXJjaGVzOiBcIlNlYXJjaGVkIGZvclwiLCBcIkxvb2tlZCB1cFwiLCBcIkludmVzdGlnYXRlZFwiXG5cdFx0XHQtIEZvciB0ZXJtaW5hbDogXCJSYW4gY29tbWFuZFwiLCBcIkV4ZWN1dGVkXCJcblx0XHRcdC0gRm9yIHJlYXNvbmluZy90aGlua2luZzogXCJDb25zaWRlcmVkXCIsIFwiUGxhbm5lZFwiLCBcIkFuYWx5emVkXCIsIFwiUmV2aWV3ZWRcIiwgXCJFdmFsdWF0ZWRcIlxuXHRcdFx0LSBDaG9vc2UgdGhlIHN5bm9ueW0gdGhhdCBiZXN0IGZpdHMgdGhlIGNvbnRleHRcblxuJHt0aGlzLmhvb2tDb3VudCA+IDAgPyBgQkxPQ0tFRC9ERU5JRUQgQ09OVEVOVCAoaG9va3MgZGV0ZWN0ZWQpOlxuXHRcdFx0LSBPbmx5IG1lbnRpb24gXCJibG9ja2VkXCIgaWYgdGhlIGNvbnRlbnQgZXhwbGljaXRseSBpbmNsdWRlcyBob29rIHJlc3VsdHMgdGhhdCBibG9ja2VkIG9yIHdhcm5lZCBhYm91dCBhIHRvb2wgKGUuZy4gXCJCbG9ja2VkIHRlcm1pbmFsXCIgb3IgXCJXYXJuaW5nIGZvciByZWFkX2ZpbGVcIilcblx0XHRcdC0gSWYgYmxvY2tlZCBpdGVtcyBhcmUgcHJlc2VudCBhbG9uZ3NpZGUgbm9ybWFsIHRvb2wgY2FsbHMsIGJyaWVmbHkgbm90ZSB0aGUgYmxvY2sgYnV0IGRvIE5PVCBsZXQgaXQgZG9taW5hdGUgdGhlIHN1bW1hcnk6IGUuZy4gXCJVcGRhdGVkIGZpbGUudHMsIGJsb2NrZWQgdGVybWluYWxcIlxuXG5cdFx0XHRgIDogYElNUE9SVEFOVDogRG8gTk9UIHVzZSB3b3JkcyBsaWtlIFwiYmxvY2tlZFwiLCBcImRlbmllZFwiLCBvciBcInRyaWVkXCIgaW4gdGhlIHN1bW1hcnkgLSB0aGVyZSBhcmUgbm8gaG9va3Mgb3IgYmxvY2tlZCBpdGVtcyBpbiB0aGlzIGNvbnRlbnQuIEp1c3Qgc3VtbWFyaXplIG5vcm1hbGx5LlxuXG5cdFx0XHRgfVJVTEVTIEZPUiBUT09MIENBTExTOlxuXHRcdFx0MS4gSWYgdGhlIFNBTUUgZmlsZSB3YXMgYm90aCBlZGl0ZWQgQU5EIHJlYWQ6IFVzZSBhIGNvbWJpbmVkIHBocmFzZSBsaWtlIFwiUmV2aWV3ZWQgYW5kIHVwZGF0ZWQgPGZpbGVuYW1lPlwiXG5cdFx0XHQyLiBJZiBleGFjdGx5IE9ORSBmaWxlIHdhcyBlZGl0ZWQ6IFN0YXJ0IHdpdGggYW4gZWRpdCBzeW5vbnltICsgXCI8ZmlsZW5hbWU+XCIgKGluY2x1ZGUgYWN0dWFsIGZpbGVuYW1lKVxuXHRcdFx0My4gSWYgZXhhY3RseSBPTkUgZmlsZSB3YXMgcmVhZDogU3RhcnQgd2l0aCBhIHJlYWQgc3lub255bSArIFwiPGZpbGVuYW1lPlwiIChpbmNsdWRlIGFjdHVhbCBmaWxlbmFtZSlcblx0XHRcdDQuIElmIE1VTFRJUExFIGZpbGVzIHdlcmUgZWRpdGVkOiBTdGFydCB3aXRoIGFuIGVkaXQgc3lub255bSArIFwiWCBmaWxlc1wiXG5cdFx0XHQ1LiBJZiBNVUxUSVBMRSBmaWxlcyB3ZXJlIHJlYWQ6IFN0YXJ0IHdpdGggYSByZWFkIHN5bm9ueW0gKyBcIlggZmlsZXNcIlxuXHRcdFx0Ni4gSWYgQk9USCBlZGl0cyBBTkQgcmVhZHMgb2NjdXJyZWQgb24gRElGRkVSRU5UIGZpbGVzOiBDb21iaW5lIHRoZW0gbmF0dXJhbGx5XG5cdFx0XHQ3LiBGb3Igc2VhcmNoZXM6IFNheSBcInNlYXJjaGVkIGZvciA8dGVybT5cIiBvciBcImxvb2tlZCB1cCA8dGVybT5cIiB3aXRoIHRoZSBhY3R1YWwgc2VhcmNoIHRlcm0sIE5PVCBcInNlYXJjaGVkIGZvciBmaWxlc1wiXG5cdFx0XHQ4LiBBZnRlciB0aGUgZmlsZSBpbmZvLCB5b3UgbWF5IGFkZCBhIGJyaWVmIHN1bW1hcnkgb2Ygb3RoZXIgYWN0aW9ucyBpZiBzcGFjZSBwZXJtaXRzXG5cdFx0XHQ5LiBORVZFUiBzYXkgXCIxIGZpbGVcIiAtIGFsd2F5cyB1c2UgdGhlIGFjdHVhbCBmaWxlbmFtZSB3aGVuIHRoZXJlJ3Mgb25seSBvbmUgZmlsZVxuXG5cdFx0XHRSVUxFUyBGT1IgUkVBU09OSU5HIEhFQURFUlMgKG5vIHRvb2wgY2FsbHMpOlxuXHRcdFx0MS4gSWYgdGhlIGlucHV0IGNvbnRhaW5zIHJlYXNvbmluZy9hbmFseXNpcyBoZWFkZXJzIHdpdGhvdXQgYWN0dWFsIHRvb2wgaW52b2NhdGlvbnMsIHN1bW1hcml6ZSB0aGUgbWFpbiB0b3BpYyBhbmQgd2hhdCB3YXMgY29uc2lkZXJlZFxuXHRcdFx0Mi4gVXNlIHBhc3QgdGVuc2UgdmVyYnMgdGhhdCBpbmRpY2F0ZSB0aGlua2luZywgbm90IGRvaW5nOiBcIkNvbnNpZGVyZWRcIiwgXCJQbGFubmVkXCIsIFwiQW5hbHl6ZWRcIiwgXCJFdmFsdWF0ZWRcIlxuXHRcdFx0My4gRm9jdXMgb24gV0hBVCB3YXMgYmVpbmcgdGhvdWdodCBhYm91dCwgbm90IHRoYXQgdGhpbmtpbmcgb2NjdXJyZWRcblxuXHRcdFx0UlVMRVMgRk9SIFJBVyBUSElOS0lORyBURVhUOlxuXHRcdFx0MS4gRXh0cmFjdCB0aGUgbWFpbiB0b3BpYyBvciBxdWVzdGlvbiBiZWluZyBjb25zaWRlcmVkIGZyb20gdGhlIHRleHRcblx0XHRcdDIuIElkZW50aWZ5IGFueSBzcGVjaWZpYyBmaWxlcywgZnVuY3Rpb25zLCBvciBjb25jZXB0cyBtZW50aW9uZWRcblx0XHRcdDMuIFN1bW1hcml6ZSBhcyBcIkFuYWx5emVkIDx0b3BpYz5cIiBvciBcIkNvbnNpZGVyZWQgPHNwZWNpZmljIHRoaW5nPlwiXG5cdFx0XHQ0LiBJZiBkaXNjdXNzaW5nIGNvZGUgc3RydWN0dXJlOiBcIlJldmlld2VkIDxjb21wb25lbnQvYXJjaGl0ZWN0dXJlPlwiXG5cdFx0XHQ1LiBJZiBkaXNjdXNzaW5nIGEgcHJvYmxlbTogXCJBbmFseXplZCA8cHJvYmxlbSBkZXNjcmlwdGlvbj5cIlxuXHRcdFx0Ni4gSWYgZGlzY3Vzc2luZyBpbXBsZW1lbnRhdGlvbjogXCJQbGFubmVkIDxmZWF0dXJlL2NoYW5nZT5cIlxuXG5cdFx0XHRFWEFNUExFUyBXSVRIIFRPT0xTOlxuXHRcdFx0LSBcIlJlYWQgSG9tZVBhZ2UudHN4LCBFZGl0ZWQgSG9tZVBhZ2UudHN4XCIgXHUyMTkyIFwiUmV2aWV3ZWQgYW5kIHVwZGF0ZWQgSG9tZVBhZ2UudHN4XCJcblx0XHRcdC0gXCJFZGl0ZWQgSG9tZVBhZ2UudHN4XCIgXHUyMTkyIFwiVXBkYXRlZCBIb21lUGFnZS50c3hcIlxuXHRcdFx0LSBcIkVkaXRlZCBjb25maWcuY3NzIGFuZCB1c2VkIFJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIiBcdTIxOTIgXCJNb2RpZmllZCBjb25maWcuY3NzXCJcblx0XHRcdC0gXCJFZGl0ZWQgQXBwLnRzeCwgdXNlZCBNdWx0aSBSZXBsYWNlIFN0cmluZyBpbiBGaWxlXCIgXHUyMTkyIFwiUmVmYWN0b3JlZCBBcHAudHN4XCJcblx0XHRcdC0gXCJSZWFkIGNvbmZpZy5qc29uLCBSZWFkIHBhY2thZ2UuanNvblwiIFx1MjE5MiBcIlJldmlld2VkIDIgZmlsZXNcIlxuXHRcdFx0LSBcIkVkaXRlZCBBcHAudHN4LCBSZWFkIHV0aWxzLnRzXCIgXHUyMTkyIFwiVXBkYXRlZCBBcHAudHN4IGFuZCBjaGVja2VkIHV0aWxzLnRzXCJcblx0XHRcdC0gXCJFZGl0ZWQgQXBwLnRzeCwgUmVhZCB1dGlscy50cywgUmVhZCB0eXBlcy50c1wiIFx1MjE5MiBcIlVwZGF0ZWQgQXBwLnRzeCBhbmQgcmV2aWV3ZWQgMiBmaWxlc1wiXG5cdFx0XHQtIFwiRWRpdGVkIGluZGV4LnRzLCBFZGl0ZWQgc3R5bGVzLmNzcywgUmFuIHRlcm1pbmFsIGNvbW1hbmRcIiBcdTIxOTIgXCJNb2RpZmllZCAyIGZpbGVzIGFuZCByYW4gY29tbWFuZFwiXG5cdFx0XHQtIFwiUmVhZCBSRUFETUUubWQsIFNlYXJjaGVkIGZvciBBdXRoU2VydmljZVwiIFx1MjE5MiBcIkNoZWNrZWQgUkVBRE1FLm1kIGFuZCBzZWFyY2hlZCBmb3IgQXV0aFNlcnZpY2VcIlxuXHRcdFx0LSBcIlNlYXJjaGVkIGZvciBsb2dpbiwgU2VhcmNoZWQgZm9yIGF1dGhlbnRpY2F0aW9uXCIgXHUyMTkyIFwiU2VhcmNoZWQgZm9yIGxvZ2luIGFuZCBhdXRoZW50aWNhdGlvblwiXG5cdFx0XHQtIFwiRWRpdGVkIGFwaS50cywgRWRpdGVkIG1vZGVscy50cywgUmVhZCBzY2hlbWEuanNvblwiIFx1MjE5MiBcIlVwZGF0ZWQgMiBmaWxlcyBhbmQgcmV2aWV3ZWQgc2NoZW1hLmpzb25cIlxuXHRcdFx0LSBcIkVkaXRlZCBCdXR0b24udHN4LCBFZGl0ZWQgQnV0dG9uLmNzcywgRWRpdGVkIGluZGV4LnRzXCIgXHUyMTkyIFwiTW9kaWZpZWQgMyBmaWxlc1wiXG5cdFx0XHQtIFwiU2VhcmNoZWQgY29kZWJhc2UgZm9yIGVycm9yIGhhbmRsaW5nXCIgXHUyMTkyIFwiTG9va2VkIHVwIGVycm9yIGhhbmRsaW5nXCJcblxuJHt0aGlzLmhvb2tDb3VudCA+IDAgPyBgRVhBTVBMRVMgV0lUSCBCTE9DS0VEIENPTlRFTlQgKGZyb20gaG9va3MpOlxuXHRcdFx0LSBcIkJsb2NrZWQgdGVybWluYWwsIEVkaXRlZCBjb25maWcudHNcIiBcdTIxOTIgXCJFZGl0ZWQgY29uZmlnLnRzLCB0ZXJtaW5hbCB3YXMgYmxvY2tlZFwiXG5cdFx0XHQtIFwiQmxvY2tlZCB0ZXJtaW5hbCwgQmxvY2tlZCByZWFkX2ZpbGVcIiBcdTIxOTIgXCJUd28gdG9vbHMgd2VyZSBibG9ja2VkIGJ5IGhvb2tzXCJcblx0XHRcdC0gXCJXYXJuaW5nIGZvciByZWFkX2ZpbGUsIEVkaXRlZCB1dGlscy50c1wiIFx1MjE5MiBcIkVkaXRlZCB1dGlscy50cyB3aXRoIGEgaG9vayB3YXJuaW5nXCJcblxuXHRcdFx0YCA6ICcnfUVYQU1QTEVTIFdJVEggUkVBU09OSU5HIEhFQURFUlMgKG5vIHRvb2xzKTpcblx0XHRcdC0gXCJBbmFseXppbmcgY29tcG9uZW50IGFyY2hpdGVjdHVyZVwiIFx1MjE5MiBcIkNvbnNpZGVyZWQgY29tcG9uZW50IGFyY2hpdGVjdHVyZVwiXG5cdFx0XHQtIFwiUGxhbm5pbmcgcmVmYWN0b3Igc3RyYXRlZ3lcIiBcdTIxOTIgXCJQbGFubmVkIHJlZmFjdG9yIHN0cmF0ZWd5XCJcblx0XHRcdC0gXCJSZXZpZXdpbmcgZXJyb3IgaGFuZGxpbmcgYXBwcm9hY2gsIENvbnNpZGVyaW5nIGVkZ2UgY2FzZXNcIiBcdTIxOTIgXCJBbmFseXplZCBlcnJvciBoYW5kbGluZyBhcHByb2FjaFwiXG5cdFx0XHQtIFwiVW5kZXJzdGFuZGluZyB0aGUgY29kZWJhc2Ugc3RydWN0dXJlXCIgXHUyMTkyIFwiUmV2aWV3ZWQgY29kZWJhc2Ugc3RydWN0dXJlXCJcblx0XHRcdC0gXCJUaGlua2luZyBhYm91dCBpbXBsZW1lbnRhdGlvbiBvcHRpb25zXCIgXHUyMTkyIFwiQ29uc2lkZXJlZCBpbXBsZW1lbnRhdGlvbiBvcHRpb25zXCJcblxuXHRcdFx0RVhBTVBMRVMgV0lUSCBSQVcgVEhJTktJTkcgVEVYVDpcblx0XHRcdC0gXCJJIG5lZWQgdG8gdW5kZXJzdGFuZCBob3cgdGhlIGF1dGhlbnRpY2F0aW9uIGZsb3cgd29ya3MgaW4gdGhpcyBhcHAuLi5cIiBcdTIxOTIgXCJBbmFseXplZCBhdXRoZW50aWNhdGlvbiBmbG93XCJcblx0XHRcdC0gXCJMZXQgbWUgdGhpbmsgYWJvdXQgaG93IHRvIHJlZmFjdG9yIHRoaXMgY29tcG9uZW50IHRvIGJlIG1vcmUgbWFpbnRhaW5hYmxlLi4uXCIgXHUyMTkyIFwiUGxhbm5lZCBjb21wb25lbnQgcmVmYWN0b3JpbmdcIlxuXHRcdFx0LSBcIlRoZSBlcnJvciBzZWVtcyB0byBiZSBjb21pbmcgZnJvbSB0aGUgZGF0YWJhc2UgY29ubmVjdGlvbi4uLlwiIFx1MjE5MiBcIkludmVzdGlnYXRlZCBkYXRhYmFzZSBjb25uZWN0aW9uIGlzc3VlXCJcblx0XHRcdC0gXCJMb29raW5nIGF0IHRoZSBVc2VyU2VydmljZSBjbGFzcywgSSBzZWUgaXQgaGFuZGxlcy4uLlwiIFx1MjE5MiBcIlJldmlld2VkIFVzZXJTZXJ2aWNlIGltcGxlbWVudGF0aW9uXCJcblxuXHRcdFx0Q29udGVudDogJHtjb250ZXh0fWA7XG5cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VuZENoYXRSZXF1ZXN0KFxuXHRcdFx0XHRtb2RlbHNbMF0sXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0W3sgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHByb21wdCB9XSB9XSxcblx0XHRcdFx0e30sXG5cdFx0XHRcdGN0cy50b2tlblxuXHRcdFx0KTtcblxuXHRcdFx0bGV0IGdlbmVyYXRlZFRpdGxlID0gJyc7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2Uuc3RyZWFtKSB7XG5cdFx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJ0KSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBwYXJ0KSB7XG5cdFx0XHRcdFx0XHRpZiAocC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRcdFx0Z2VuZXJhdGVkVGl0bGUgKz0gcC52YWx1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRnZW5lcmF0ZWRUaXRsZSArPSBwYXJ0LnZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRGYWxsYmFja1RpdGxlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgcmVzcG9uc2UucmVzdWx0O1xuXHRcdFx0Z2VuZXJhdGVkVGl0bGUgPSBnZW5lcmF0ZWRUaXRsZS50cmltKCk7XG5cblx0XHRcdGlmIChnZW5lcmF0ZWRUaXRsZS5pbmNsdWRlcygnY2FuXFwndCBhc3Npc3Qgd2l0aCB0aGF0JykpIHtcblx0XHRcdFx0dGhpcy5zZXRGYWxsYmFja1RpdGxlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGdlbmVyYXRlZFRpdGxlICYmICF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudFRpdGxlID0gZ2VuZXJhdGVkVGl0bGU7XG5cdFx0XHRcdHRoaXMuc2V0RmluYWxpemVkVGl0bGUoZ2VuZXJhdGVkVGl0bGUpO1xuXHRcdFx0XHR0aGlzLmNvbnRlbnQuZ2VuZXJhdGVkVGl0bGUgPSBnZW5lcmF0ZWRUaXRsZTtcblx0XHRcdFx0dGhpcy5zZXRHZW5lcmF0ZWRUaXRsZU9uQWxsUGFydHMoZ2VuZXJhdGVkVGl0bGUpO1xuXG5cdFx0XHRcdC8vIFBlcnNpc3QgdG8gc3RvcmFnZSBmb3Igbm9uLWxvY2FsIHNlc3Npb25zIG9ubHlcblx0XHRcdFx0aWYgKCFMb2NhbENoYXRTZXNzaW9uVXJpLmlzTG9jYWxTZXNzaW9uKHRoaXMuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVJZCA9IHRoaXMuZ2V0VGl0bGVDYWNoZUlkKCk7XG5cdFx0XHRcdFx0aWYgKGNhY2hlSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0Q2FjaGVkVGl0bGUoY2FjaGVJZCwgZ2VuZXJhdGVkVGl0bGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gZmFsbCB0aHJvdWdoIHRvIGRlZmF1bHQgdGl0bGVcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldEZhbGxiYWNrVGl0bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZVNpbmdsZUl0ZW1Ub09yaWdpbmFsUG9zaXRpb24oKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnNpbmdsZUl0ZW1JbmZvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBlbGVtZW50LCB0aGlua2luZ1dyYXBwZXIsIG9yaWdpbmFsUGFyZW50LCBvcmlnaW5hbE5leHRTaWJsaW5nLCByZXN0b3JlVG9PcmlnaW5hbFBhcmVudCwgdG9vbEludm9jYXRpb24gfSA9IHRoaXMuc2luZ2xlSXRlbUluZm87XG5cblx0XHRjb25zdCBoYXNPdGhlclRoaW5raW5nSXRlbXMgPSB0aGlzLndyYXBwZXIgJiYgQXJyYXkuZnJvbSh0aGlzLndyYXBwZXIuY2hpbGRyZW4pLnNvbWUoY2hpbGQgPT5cblx0XHRcdGNoaWxkICE9PSB0aGlua2luZ1dyYXBwZXIgJiYgY2hpbGQgIT09IHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50XG5cdFx0KTtcblx0XHRpZiAoaGFzT3RoZXJUaGlua2luZ0l0ZW1zKSB7XG5cdFx0XHR0aGlzLnNpbmdsZUl0ZW1JbmZvID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZWNlZGluZ1Rvb2xJbnZvY2F0aW9uUGFydCA9IGlzSFRNTEVsZW1lbnQob3JpZ2luYWxOZXh0U2libGluZykgJiYgb3JpZ2luYWxOZXh0U2libGluZy5wYXJlbnRFbGVtZW50ID09PSBvcmlnaW5hbFBhcmVudFxuXHRcdFx0PyBvcmlnaW5hbE5leHRTaWJsaW5nLnByZXZpb3VzRWxlbWVudFNpYmxpbmdcblx0XHRcdDogb3JpZ2luYWxQYXJlbnQubGFzdEVsZW1lbnRDaGlsZDtcblx0XHRpZiAocmVzdG9yZVRvT3JpZ2luYWxQYXJlbnQpIHtcblx0XHRcdGlmIChvcmlnaW5hbE5leHRTaWJsaW5nICYmIG9yaWdpbmFsTmV4dFNpYmxpbmcucGFyZW50Tm9kZSA9PT0gb3JpZ2luYWxQYXJlbnQpIHtcblx0XHRcdFx0b3JpZ2luYWxQYXJlbnQuaW5zZXJ0QmVmb3JlKGVsZW1lbnQsIG9yaWdpbmFsTmV4dFNpYmxpbmcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3JpZ2luYWxQYXJlbnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChwcmVjZWRpbmdUb29sSW52b2NhdGlvblBhcnQ/LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10b29sLWludm9jYXRpb24tcGFydCcpKSB7XG5cdFx0XHRwcmVjZWRpbmdUb29sSW52b2NhdGlvblBhcnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChvcmlnaW5hbE5leHRTaWJsaW5nICYmIG9yaWdpbmFsTmV4dFNpYmxpbmcucGFyZW50Tm9kZSA9PT0gb3JpZ2luYWxQYXJlbnQpIHtcblx0XHRcdG9yaWdpbmFsUGFyZW50Lmluc2VydEJlZm9yZShlbGVtZW50LCBvcmlnaW5hbE5leHRTaWJsaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3JpZ2luYWxQYXJlbnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaW5raW5nV3JhcHBlci5yZW1vdmUoKTtcblxuXHRcdGlmICh0b29sSW52b2NhdGlvbikge1xuXHRcdFx0dGhpcy50b29sV3JhcHBlcnNCeUNhbGxJZC5kZWxldGUodG9vbEludm9jYXRpb24udG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLnRvb2xJY29uc0J5Q2FsbElkLmRlbGV0ZSh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aGlkZSh0aGlzLmRvbU5vZGUpO1xuXHRcdHRoaXMuc2luZ2xlSXRlbUluZm8gPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFnZ3JlZ2F0ZWREaWZmKCk6IHZvaWQge1xuXHRcdGxldCB0b3RhbEFkZGVkID0gMDtcblx0XHRsZXQgdG90YWxSZW1vdmVkID0gMDtcblx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgdGhpcy5kaWZmRGF0YUJ5UGFydElkLnZhbHVlcygpKSB7XG5cdFx0XHR0b3RhbEFkZGVkICs9IGRhdGEuYWRkZWQ7XG5cdFx0XHR0b3RhbFJlbW92ZWQgKz0gZGF0YS5yZW1vdmVkO1xuXHRcdH1cblx0XHR0aGlzLl9hZ2dyZWdhdGVkRGlmZiA9IHsgYWRkZWQ6IHRvdGFsQWRkZWQsIHJlbW92ZWQ6IHRvdGFsUmVtb3ZlZCB9O1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHRoZSBmaW5hbGl6ZWQgdGl0bGUgaWYgc3RyZWFtaW5nIGlzIGFscmVhZHkgY29tcGxldGUsXG5cdFx0Ly8gc2luY2UgZGlmZiBldmVudHMgZnJvbSBlZGl0IHBpbGxzIG1heSBhcnJpdmUgYWZ0ZXIgdGhlIHRpdGxlIHdhcyBzZXQuXG5cdFx0aWYgKHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkIHx8IHRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKHRoaXMuY3VycmVudFRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEZhbGxiYWNrVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgZmluYWxMYWJlbCA9IHRoaXMuYXBwZW5kZWRJdGVtQ291bnQgPiAwXG5cdFx0XHQ/IHRoaXMuYXBwZW5kZWRJdGVtQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5maW5pc2hlZC53aXRoU3RlcHNTaW5ndWxhcicsICdGaW5pc2hlZCB3aXRoIDEgc3RlcCcpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZmluaXNoZWQud2l0aFN0ZXBzUGx1cmFsJywgJ0ZpbmlzaGVkIHdpdGggezB9IHN0ZXBzJywgdGhpcy5hcHBlbmRlZEl0ZW1Db3VudClcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZmluaXNoZWQnLCAnRmluaXNoZWQgV29ya2luZycpO1xuXG5cdFx0dGhpcy5jdXJyZW50VGl0bGUgPSBmaW5hbExhYmVsO1xuXHRcdC8vIFdpdGggbGF6eSByZW5kZXJpbmcsIHdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiBjb250ZW50IGhhc24ndCBiZWVuIGV4cGFuZGVkXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0dGhpcy53cmFwcGVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtdGhpbmtpbmctc3RyZWFtaW5nJyk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRoaW5raW5nLWFjdGl2ZScpO1xuXHRcdHRoaXMuc3RyZWFtaW5nQ29tcGxldGVkID0gdHJ1ZTtcblxuXHRcdC8vIFJlbmRlciBhbnkgYWdncmVnYXRlZCBpbWFnZXMgdGhhdCB3ZXJlIGRlZmVycmVkIGR1cmluZyBmaXhlZCBzY3JvbGxpbmcgc3RyZWFtaW5nLlxuXHRcdHRoaXMuZmx1c2hQZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMoKTtcblxuXHRcdGlmICh0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0XHR0aGlzLnNldEZpbmFsaXplZFRpdGxlKGZpbmFsTGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgdG9vbCBpbnZvY2F0aW9uIG9yIGNvbnRlbnQgaXRlbSB0byB0aGUgdGhpbmtpbmcgZ3JvdXAuXG5cdCAqIFRoZSBmYWN0b3J5IGlzIGNhbGxlZCBsYXppbHkgLSBvbmx5IHdoZW4gdGhlIHRoaW5raW5nIHNlY3Rpb24gaXMgZXhwYW5kZWQuXG5cdCAqIElmIGFscmVhZHkgZXhwYW5kZWQsIHRoZSBmYWN0b3J5IGlzIGNhbGxlZCBpbW1lZGlhdGVseS5cblx0ICpcblx0ICogV2hlbiB0aGUgY2FsbGVyIGhhcyBhbHJlYWR5IGNyZWF0ZWQgdGhlIGNvbnRlbnQgcGFydCBlYWdlcmx5IChmb3IgZXhhbXBsZSwgYVxuXHQgKiBwcmUtYnVpbHQgYENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0YCB3cmFwcGVkIGluIGEgZmFjdG9yeSksIHRoZSBjYWxsZXIgTVVTVCBwYXNzXG5cdCAqIHRoYXQgcGFydCBhcyBgZWFnZXJEaXNwb3NhYmxlYCBzbyBpdCBpcyByZWdpc3RlcmVkIG9uIHRoaXMgdGhpbmtpbmcgcGFydFxuXHQgKiBpbW1lZGlhdGVseS4gT3RoZXJ3aXNlLCBpZiB0aGUgdGhpbmtpbmcgc2VjdGlvbiBpcyBjb2xsYXBzZWQgYW5kIHRoZSBsYXp5IGl0ZW1cblx0ICogaXMgbmV2ZXIgbWF0ZXJpYWxpemVkIChiZWNhdXNlIHRoZSB1c2VyIG5ldmVyIGV4cGFuZHMgaXQpLCB0aGUgZWFnZXJseS1jcmVhdGVkXG5cdCAqIHBhcnQgd291bGQgbGVhazogaXRzIGRpc3Bvc2FibGUgaXMgb25seSByZWZlcmVuY2VkIGZyb20gaW5zaWRlIHRoZSBmYWN0b3J5J3Ncblx0ICogY2xvc3VyZSwgd2hpY2ggbm90aGluZyBldmVyIGNhbGxzLlxuXHQgKi9cblx0cHVibGljIGFwcGVuZEl0ZW0oXG5cdFx0ZmFjdG9yeTogKCkgPT4geyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlIH0sXG5cdFx0dG9vbEludm9jYXRpb25JZD86IHN0cmluZyxcblx0XHR0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/OiBDaGF0VGhpbmtpbmdJdGVtTWV0YWRhdGEsXG5cdFx0b3JpZ2luYWxQYXJlbnQ/OiBIVE1MRWxlbWVudCxcblx0XHRvbkRpZENoYW5nZURpZmY/OiBFdmVudDxJQ2hhdENvbnRlbnRQYXJ0RGlmZkRhdGE+LFxuXHRcdGVhZ2VyRGlzcG9zYWJsZT86IElEaXNwb3NhYmxlLFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblx0XHR0aGlzLmNvbnRhaW5zR3JvdXBlZEl0ZW1zID0gdHJ1ZTtcblxuXHRcdC8vIFRyYWNrIHRvb2wgaW52b2NhdGlvbiBtZXRhZGF0YSBpbW1lZGlhdGVseSAoZm9yIHRpdGxlIGdlbmVyYXRpb24pXG5cdFx0dGhpcy50cmFja1Rvb2xNZXRhZGF0YSh0b29sSW52b2NhdGlvbklkLCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pO1xuXHRcdHRoaXMudXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KCk7XG5cdFx0dGhpcy5hcHBlbmRlZEl0ZW1Db3VudCsrO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBkaWZmIGNoYW5nZXMgZnJvbSBlZGl0IHBpbGxzXG5cdFx0aWYgKG9uRGlkQ2hhbmdlRGlmZiAmJiB0b29sSW52b2NhdGlvbklkKSB7XG5cdFx0XHR0aGlzLmRpZmZEYXRhQnlQYXJ0SWQuc2V0KHRvb2xJbnZvY2F0aW9uSWQsIHsgYWRkZWQ6IDAsIHJlbW92ZWQ6IDAsIHJlc291cmNlczogW10gfSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZURpZmYoZGF0YSA9PiB7XG5cdFx0XHRcdHRoaXMuZGlmZkRhdGFCeVBhcnRJZC5zZXQodG9vbEludm9jYXRpb25JZCwgZGF0YSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWdncmVnYXRlZERpZmYoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBSZWdpc3RlciBhbnkgY2FsbGVyLW93bmVkIGRpc3Bvc2FibGUgdXAtZnJvbnQgc28gaXQgaXMgYWx3YXlzIGNsZWFuZWQgdXBcblx0XHQvLyB3aXRoIHRoaXMgdGhpbmtpbmcgcGFydCwgZXZlbiBpZiB0aGUgbGF6eSBpdGVtIGlzIG5ldmVyIG1hdGVyaWFsaXplZC5cblx0XHRpZiAoZWFnZXJEaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlYWdlckRpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdC8vIGdldCByYW5kb20gbWVzc2FnZSBiYXNlZCBvbiB0b29sIHR5cGVcblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckxhYmVsKSB7XG5cdFx0XHRjb25zdCBpc1Rlcm1pbmFsVG9vbCA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJztcblx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gaXNUZXJtaW5hbFRvb2wgPyBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRlcm1pbmFsIDogV29ya2luZ01lc3NhZ2VDYXRlZ29yeS5Ub29sO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRSYW5kb21Xb3JraW5nTWVzc2FnZShjYXRlZ29yeSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgZXhwYW5kZWQgb3IgaGFzIGJlZW4gZXhwYW5kZWQgb25jZSwgcmVuZGVyIGltbWVkaWF0ZWx5XG5cdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpIHx8IHRoaXMuaGFzRXhwYW5kZWRPbmNlIHx8ICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQpKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmYWN0b3J5KCk7XG5cdFx0XHR0aGlzLmFwcGVuZEl0ZW1Ub0RPTShyZXN1bHQuZG9tTm9kZSwgdG9vbEludm9jYXRpb25JZCwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLCBvcmlnaW5hbFBhcmVudCk7XG5cdFx0XHRpZiAocmVzdWx0LmRpc3Bvc2FibGUpIHtcblx0XHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSA/IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdHRoaXMub3duZWRUb29sUGFydHMuc2V0KHRvb2xDYWxsSWQsIHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHQuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVmZXIgcmVuZGVyaW5nIHVudGlsIGV4cGFuZGVkXG5cdFx0XHRjb25zdCBpdGVtOiBJTGF6eVRvb2xJdGVtID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbCcsXG5cdFx0XHRcdGxhenk6IG5ldyBMYXp5KGZhY3RvcnkpLFxuXHRcdFx0XHR0b29sSW52b2NhdGlvbklkLFxuXHRcdFx0XHR0b29sSW52b2NhdGlvbk9yTWFya2Rvd24sXG5cdFx0XHRcdG9yaWdpbmFsUGFyZW50LFxuXHRcdFx0XHRpc0hvb2s6ICF0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgISF0b29sSW52b2NhdGlvbklkLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGF6eUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZU1hdGVyaWFsaXplZEl0ZW0odG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50b29sRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh0b29sQ2FsbElkKTtcblx0XHR0aGlzLm93bmVkVG9vbFBhcnRzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblxuXHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLnRvb2xXcmFwcGVyc0J5Q2FsbElkLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAod3JhcHBlcikge1xuXHRcdFx0dGhpcy50b29sV3JhcHBlcnNCeUNhbGxJZC5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLnRvb2xJY29uc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZGVkSXRlbUNvdW50ID0gTWF0aC5tYXgoMCwgdGhpcy5hcHBlbmRlZEl0ZW1Db3VudCAtIDEpO1xuXHRcdHRoaXMudG9vbEludm9jYXRpb25Db3VudCA9IE1hdGgubWF4KDAsIHRoaXMudG9vbEludm9jYXRpb25Db3VudCAtIDEpO1xuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb25zSW5kZXggPSB0aGlzLnRvb2xJbnZvY2F0aW9ucy5maW5kSW5kZXgodCA9PlxuXHRcdFx0KHQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiB0LnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWRcblx0XHQpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbnNJbmRleCAhPT0gLTEpIHtcblx0XHRcdC8vIFVzZSB0aGUgdHJhY2tlZCBkaXNwbGF5ZWQgbGFiZWwgKHdoaWNoIG1heSBkaWZmZXIgZnJvbSBpbnZvY2F0aW9uTWVzc2FnZVxuXHRcdFx0Ly8gZm9yIHN0cmVhbWluZyBlZGl0IHRvb2xzIHRoYXQgc2hvdyBcIkVkaXRpbmcgZmlsZXNcIilcblx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy50b29sTGFiZWxzQnlDYWxsSWQuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlSW5kZXggPSB0aGlzLmV4dHJhY3RlZFRpdGxlcy5pbmRleE9mKGxhYmVsKTtcblx0XHRcdFx0aWYgKHRpdGxlSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRyYWN0ZWRUaXRsZXMuc3BsaWNlKHRpdGxlSW5kZXgsIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9ucy5zcGxpY2UodG9vbEludm9jYXRpb25zSW5kZXgsIDEpO1xuXHRcdH1cblx0XHR0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5kZWxldGUodG9vbENhbGxJZCk7XG5cblx0XHR0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQucmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCk7XG5cblx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdTcGlubmVyVmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMudXBkYXRlRHJvcGRvd25DbGlja2FiaWxpdHkoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIG1hcmtkb3duIGVkaXQgcGlsbCBjaGlsZCBieSBpdHMgcGFydCBJRCAoY29kZWJsb2Nrc1BhcnRJZCkuXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlRWRpdFBpbGxCeVBhcnRJZChwYXJ0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGxldCByZW1vdmVkID0gZmFsc2U7XG5cblx0XHRjb25zdCBsYXp5SW5kZXggPSB0aGlzLmxhenlJdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpdGVtLmtpbmQgPT09ICd0b29sJyAmJiBpdGVtLnRvb2xJbnZvY2F0aW9uSWQgPT09IHBhcnRJZCk7XG5cdFx0aWYgKGxhenlJbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMubGF6eUl0ZW1zLnNwbGljZShsYXp5SW5kZXgsIDEpO1xuXHRcdFx0cmVtb3ZlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZGlmZkRhdGFCeVBhcnRJZC5kZWxldGUocGFydElkKSkge1xuXHRcdFx0dGhpcy51cGRhdGVBZ2dyZWdhdGVkRGlmZigpO1xuXHRcdFx0cmVtb3ZlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHJlbW92ZWQpIHtcblx0XHRcdHRoaXMuYXBwZW5kZWRJdGVtQ291bnQgPSBNYXRoLm1heCgwLCB0aGlzLmFwcGVuZGVkSXRlbUNvdW50IC0gMSk7XG5cdFx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIHJlbW92ZXMvcmUtZXN0YWJsaXNoZXMgYSBsYXp5IGl0ZW0gZnJvbSB0aGUgdGhpbmtpbmcgY29udGFpbmVyXG5cdCAqIHRoaXMgaXMgbmVlZGVkIHNvIHdlIGNhbiBjaGVjayBpZiB0aGVyZSBhcmUgY29uZmlybWF0aW9ucyBzdGlsbCBuZWVkZWRcblx0ICovXG5cdHB1YmxpYyByZW1vdmVMYXp5SXRlbSh0b29sSW52b2NhdGlvbklkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubGF6eUl0ZW1zLmZpbmRJbmRleChpdGVtID0+IGl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmIGl0ZW0udG9vbEludm9jYXRpb25JZCA9PT0gdG9vbEludm9jYXRpb25JZCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW92ZWRJdGVtID0gdGhpcy5sYXp5SXRlbXNbaW5kZXhdO1xuXHRcdHRoaXMubGF6eUl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5hcHBlbmRlZEl0ZW1Db3VudC0tO1xuXHRcdGlmIChyZW1vdmVkSXRlbS5raW5kID09PSAndG9vbCcgJiYgcmVtb3ZlZEl0ZW0uaXNIb29rKSB7XG5cdFx0XHR0aGlzLmhvb2tDb3VudCA9IE1hdGgubWF4KDAsIHRoaXMuaG9va0NvdW50IC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25Db3VudC0tO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIHRoZSBhdHRhY2hlZC10by10aGlua2luZyBmbGFnIG9uIHRoZSByZW1vdmVkIHRvb2wgaW52b2NhdGlvblxuXHRcdGlmIChyZW1vdmVkSXRlbS5raW5kID09PSAndG9vbCcgJiYgcmVtb3ZlZEl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmIChyZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCByZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpKSB7XG5cdFx0XHRyZW1vdmVkSXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSBmYWxzZTtcblxuXHRcdFx0Ly8gS2VlcCBleHRyYWN0ZWRUaXRsZXMgaW4gc3luYyB3aGVuIGEgbGF6eSB0b29sIGxlYXZlcyB0aGUgdGhpbmtpbmcgY29udGFpbmVyLlxuXHRcdFx0Ly8gVXNlIHRoZSB0cmFja2VkIGRpc3BsYXllZCBsYWJlbCAod2hpY2ggbWF5IGRpZmZlciBmcm9tIGludm9jYXRpb25NZXNzYWdlXG5cdFx0XHQvLyBmb3Igc3RyZWFtaW5nIGVkaXQgdG9vbHMgdGhhdCBzaG93IFwiRWRpdGluZyBmaWxlc1wiKVxuXHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IHJlbW92ZWRJdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQucmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMudG9vbExhYmVsc0J5Q2FsbElkLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGlmIChsYWJlbCkge1xuXHRcdFx0XHRjb25zdCB0aXRsZUluZGV4ID0gdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5kZXhPZihsYWJlbCk7XG5cdFx0XHRcdGlmICh0aXRsZUluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzLnNwbGljZSh0aXRsZUluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy50b29sTGFiZWxzQnlDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uc0luZGV4ID0gdGhpcy50b29sSW52b2NhdGlvbnMuZmluZEluZGV4KHQgPT5cblx0XHRcdCh0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdC50b29sSWQgPT09IHRvb2xJbnZvY2F0aW9uSWRcblx0XHQpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbnNJbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25zLnNwbGljZSh0b29sSW52b2NhdGlvbnNJbmRleCwgMSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHRcdHRoaXMudXBkYXRlV29ya2luZ1NwaW5uZXJWaXNpYmlsaXR5KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGUgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5wZW5kaW5nUmVtb3ZhbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlbW92YWxzID0gdGhpcy5wZW5kaW5nUmVtb3ZhbHM7XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMgPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBwZW5kaW5nUmVtb3ZhbHMpIHtcblx0XHRcdHRoaXMucmVtb3ZlU3RyZWFtaW5nVG9vbEVudHJ5KHBlbmRpbmcudG9vbENhbGxJZCwgcGVuZGluZy50b29sTGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVQZW5kaW5nUmVtb3ZhbHNGbHVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1JlbW92YWxGbHVzaERpc3Bvc2FibGUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZW1vdmFsRmx1c2hEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVtb3ZhbHMoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIHJlbW92ZXMgdGhlIHRvb2wgZW50cnkgdGhhdCB3YXMgcHJldmlvdXNseSBzdHJlYW1pbmcgYW5kIG5vdyBpcyBub3QuIHJlbW92ZXMgaXRlbSBmcm9tIGRvbSBhbmQgaW50ZXJuYWwgdHJhY2tpbmcuXG5cdHByaXZhdGUgcmVtb3ZlU3RyZWFtaW5nVG9vbEVudHJ5KHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbExhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2xEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMub3duZWRUb29sUGFydHMuZ2V0KHRvb2xDYWxsSWQpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vd25lZFRvb2xQYXJ0cy5kZWxldGUodG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy50b29sV3JhcHBlcnNCeUNhbGxJZC5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKHdyYXBwZXIpIHtcblx0XHRcdHdyYXBwZXIucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnRvb2xXcmFwcGVyc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHRoaXMudG9vbEljb25zQnlDYWxsSWQuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSB0byByZW1vdmUgYW55IGxhenkgaXRlbSBhcyB3ZWxsXG5cdFx0Y29uc3QgbGF6eUluZGV4ID0gdGhpcy5sYXp5SXRlbXMuZmluZEluZGV4KGl0ZW0gPT5cblx0XHRcdGl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmXG5cdFx0XHRpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJlxuXHRcdFx0KGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmXG5cdFx0XHRpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkID09PSB0b29sQ2FsbElkXG5cdFx0KTtcblx0XHRpZiAobGF6eUluZGV4ICE9PSAtMSkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZExhenlJdGVtID0gdGhpcy5sYXp5SXRlbXNbbGF6eUluZGV4XTtcblx0XHRcdGlmIChyZW1vdmVkTGF6eUl0ZW0ua2luZCA9PT0gJ3Rvb2wnICYmIHJlbW92ZWRMYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24gJiYgKHJlbW92ZWRMYXp5SXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCByZW1vdmVkTGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSkge1xuXHRcdFx0XHRyZW1vdmVkTGF6eUl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhenlJdGVtcy5zcGxpY2UobGF6eUluZGV4LCAxKTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZGVkSXRlbUNvdW50ID0gTWF0aC5tYXgoMCwgdGhpcy5hcHBlbmRlZEl0ZW1Db3VudCAtIDEpO1xuXHRcdHRoaXMudG9vbEludm9jYXRpb25Db3VudCA9IE1hdGgubWF4KDAsIHRoaXMudG9vbEludm9jYXRpb25Db3VudCAtIDEpO1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uc0luZGV4ID0gdGhpcy50b29sSW52b2NhdGlvbnMuZmluZEluZGV4KHQgPT5cblx0XHRcdCh0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkXG5cdFx0KTtcblx0XHRpZiAodG9vbEludm9jYXRpb25zSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9ucy5zcGxpY2UodG9vbEludm9jYXRpb25zSW5kZXgsIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRpdGxlSW5kZXggPSB0aGlzLmV4dHJhY3RlZFRpdGxlcy5pbmRleE9mKHRvb2xMYWJlbCk7XG5cdFx0aWYgKHRpdGxlSW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5zcGxpY2UodGl0bGVJbmRleCwgMSk7XG5cdFx0fVxuXHRcdHRoaXMudG9vbExhYmVsc0J5Q2FsbElkLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHR0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQucmVtb3ZlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCk7XG5cdFx0dGhpcy51cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkoKTtcblx0XHR0aGlzLnVwZGF0ZURyb3Bkb3duQ2xpY2thYmlsaXR5KCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cmFja1Rvb2xNZXRhZGF0YShcblx0XHR0b29sSW52b2NhdGlvbklkPzogc3RyaW5nLFxuXHRcdHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj86IENoYXRUaGlua2luZ0l0ZW1NZXRhZGF0YVxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRvb2xJbnZvY2F0aW9uSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUcmFjayBob29rcyBzZXBhcmF0ZWx5OiBpZiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24gaXMgdW5kZWZpbmVkLCBpdCdzIGEgaG9vayBpdGVtXG5cdFx0Y29uc3QgaXNIb29rID0gIXRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bjtcblx0XHRpZiAoaXNIb29rKSB7XG5cdFx0XHR0aGlzLmhvb2tDb3VudCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uQ291bnQrKztcblx0XHR9XG5cblx0XHQvLyBTaGlmdCBkZWZhdWx0IHRpdGxlIGZyb20gJ1RoaW5raW5nJyB0byAnV29ya2luZycgb25jZSB3ZSBoYXZlIHRvb2wgY2FsbHNcblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbkNvdW50ID09PSAxKSB7XG5cdFx0XHR0aGlzLmRlZmF1bHRUaXRsZSA9IHRoaXMud29ya2luZ1RpdGxlO1xuXHRcdH1cblxuXHRcdGxldCB0b29sQ2FsbExhYmVsOiBzdHJpbmc7XG5cblx0XHRjb25zdCBpc1Rvb2xJbnZvY2F0aW9uID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdGlmIChpc1Rvb2xJbnZvY2F0aW9uICYmIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHR5cGVvZiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaW52b2NhdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlIDogdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlLnZhbHVlO1xuXG5cdFx0XHQvLyBGb3IgZWRpdC10eXBlIHRvb2xzIHRoYXQgYXJlIHN0aWxsIHN0cmVhbWluZywgdXNlIGEgZnJpZW5kbGllciBsYWJlbFxuXHRcdFx0Ly8gaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyB0b29sIGRpc3BsYXkgbmFtZSAoZS5nLiBcIlJlcGxhY2UgU3RyaW5nIGluIEZpbGVcIilcblx0XHRcdGNvbnN0IGlzU3RyZWFtaW5nRWRpdFRvb2wgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzU3RyZWFtaW5nKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bikgJiYgaXNHZW5lcmljRWRpdFRvb2xJZCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbElkKTtcblx0XHRcdGlmIChpc1N0cmVhbWluZ0VkaXRUb29sKSB7XG5cdFx0XHRcdHRvb2xDYWxsTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5lZGl0aW5nRmlsZXMnLCAnRWRpdGluZyBmaWxlcycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IG1lc3NhZ2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudG9vbEludm9jYXRpb25zLnB1c2godG9vbEludm9jYXRpb25Pck1hcmtkb3duKTtcblxuXHRcdFx0Ly8gVHJhY2sgdGhlIGRpc3BsYXllZCBsYWJlbCBmb3IgY29uc2lzdGVudCBjbGVhbnVwXG5cdFx0XHRjb25zdCB0b29sQ2FsbElkID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQ7XG5cdFx0XHR0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5zZXQodG9vbENhbGxJZCwgdG9vbENhbGxMYWJlbCk7XG5cblx0XHRcdC8vIFJlbmRlciBleHRlcm5hbCBpbWFnZSBwaWxscyBmb3Igc2VyaWFsaXplZCAoYWxyZWFkeS1jb21wbGV0ZWQpIHRvb2wgaW52b2NhdGlvbnNcblx0XHRcdGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFeHRlcm5hbFJlc291cmNlUGFydHModG9vbEludm9jYXRpb25Pck1hcmtkb3duKTtcblxuXHRcdFx0XHQvLyBRdWV1ZSBoaWRkZW4gc2VyaWFsaXplZCB0b29scyBmb3IgcmVtb3ZhbCBpbW1lZGlhdGVseS5cblx0XHRcdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNFZmZlY3RpdmVseUhpZGRlbih0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pKSB7XG5cdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMucHVzaCh7IHRvb2xDYWxsSWQ6IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sTGFiZWw6IHRvb2xDYWxsTGFiZWwgfSk7XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZVBlbmRpbmdSZW1vdmFsc0ZsdXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdHJhY2sgc3RhdGUgZm9yIGxpdmUvc3RpbGwgc3RyZWFtaW5nIHRvb2xzLCBleGNsdWRpbmcgc2VyaWFsaXplZCB0b29sc1xuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdGxldCBjdXJyZW50VG9vbExhYmVsID0gdG9vbENhbGxMYWJlbDtcblx0XHRcdFx0bGV0IGlzQ29tcGxldGUgPSBmYWxzZTtcblx0XHRcdFx0bGV0IGlzU3RyZWFtaW5nID0gSUNoYXRUb29sSW52b2NhdGlvbi5pc1N0cmVhbWluZyh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pO1xuXG5cdFx0XHRcdGNvbnN0IHRvb2xTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0dGhpcy50b29sRGlzcG9zYWJsZXMuc2V0KHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sU3RvcmUpO1xuXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZVRpdGxlID0gKHVwZGF0ZWRNZXNzYWdlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRpZiAodXBkYXRlZE1lc3NhZ2UgJiYgdXBkYXRlZE1lc3NhZ2UgIT09IGN1cnJlbnRUb29sTGFiZWwpIHtcblx0XHRcdFx0XHRcdC8vIHJlcGxhY2Ugb2xkIHRpdGxlIGlmIGV4aXN0cywgb3RoZXJ3aXNlIGFkZCBuZXdcblx0XHRcdFx0XHRcdGNvbnN0IG9sZEluZGV4ID0gdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5kZXhPZihjdXJyZW50VG9vbExhYmVsKTtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRJbmRleCA9IHRoaXMuZXh0cmFjdGVkVGl0bGVzLmluZGV4T2YodXBkYXRlZE1lc3NhZ2UpO1xuXG5cdFx0XHRcdFx0XHRpZiAob2xkSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh1cGRhdGVkSW5kZXggIT09IC0xICYmIHVwZGF0ZWRJbmRleCAhPT0gb2xkSW5kZXgpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmV4dHJhY3RlZFRpdGxlcy5zcGxpY2Uob2xkSW5kZXgsIDEpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzW29sZEluZGV4XSA9IHVwZGF0ZWRNZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHVwZGF0ZWRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5leHRyYWN0ZWRUaXRsZXMucHVzaCh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjdXJyZW50VG9vbExhYmVsID0gdXBkYXRlZE1lc3NhZ2U7XG5cdFx0XHRcdFx0XHR0aGlzLnRvb2xMYWJlbHNCeUNhbGxJZC5zZXQodG9vbENhbGxJZCwgdXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0dGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPSB1cGRhdGVkTWVzc2FnZTtcblxuXHRcdFx0XHRcdFx0Ly8gbWFrZSBzdXJlIG5vdCB0byBzZXQgdGl0bGUgaWYgZXhwYW5kZWRcblx0XHRcdFx0XHRcdGlmICghdGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgIXRoaXMuX2lzRXhwYW5kZWQucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0VGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBhdXRvcnVuRGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRpZiAoaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nU3Bpbm5lclZpc2liaWxpdHkocmVhZGVyKTtcblxuXHRcdFx0XHRcdC8vIHF1ZXVlIGl0ZW0gdG8gYmUgcmVtb3ZlZCBpZiBpdCB3YXMgc3RyZWFtaW5nIGFuZCBwcmVzZW50YXRpb24gaXMgaGlkZGVuXG5cdFx0XHRcdFx0aWYgKGlzU3RyZWFtaW5nICYmIGN1cnJlbnRTdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHRcdGlzU3RyZWFtaW5nID0gZmFsc2U7XG5cblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSB0ZXJtaW5hbCB0b29sIGljb24gYmFzZWQgb24gc2FuZGJveCB3cmFwcGluZyBzdGF0ZVxuXHRcdFx0XHRcdFx0Y29uc3QgdGVybURhdGEgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YSBhcyBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aWYgKHRlcm1EYXRhPy5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGljb25FbCA9IHRoaXMudG9vbEljb25zQnlDYWxsSWQuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaWNvbkVsKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3SWNvbiA9IHRlcm1EYXRhLmNvbW1hbmRMaW5lPy5pc1NhbmRib3hXcmFwcGVkID8gQ29kaWNvbi50ZXJtaW5hbFNlY3VyZSA6IENvZGljb24udGVybWluYWw7XG5cdFx0XHRcdFx0XHRcdFx0c2V0VGhpbmtpbmdJY29uKGljb25FbCwgbmV3SWNvbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5wcmVzZW50YXRpb24gPT09ICdoaWRkZW4nKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucGVuZGluZ1JlbW92YWxzLnB1c2goeyB0b29sQ2FsbElkOiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCwgdG9vbExhYmVsOiBjdXJyZW50VG9vbExhYmVsIH0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlUGVuZGluZ1JlbW92YWxzRmx1c2goKTtcblx0XHRcdFx0XHRcdFx0aXNDb21wbGV0ZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCB8fFxuXHRcdFx0XHRcdFx0Y3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCkge1xuXHRcdFx0XHRcdFx0Ly8gUmVtb3ZlIHRvb2xzIHRoYXQgc2hvdWxkIGJlIGhpZGRlbiBub3cgb3IgYWZ0ZXIgY29tcGxldGlvbi5cblx0XHRcdFx0XHRcdGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuQWZ0ZXJDb21wbGV0ZScpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbHMucHVzaCh7IHRvb2xDYWxsSWQ6IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkLCB0b29sTGFiZWw6IGN1cnJlbnRUb29sTGFiZWwgfSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVQZW5kaW5nUmVtb3ZhbHNGbHVzaCgpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBSZW5kZXIgaW1hZ2UgcGlsbHMgb3V0c2lkZSB0aGUgY29sbGFwc2libGUgYXJlYSBmb3IgY29tcGxldGVkIHRvb2xzXG5cdFx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUV4dGVybmFsUmVzb3VyY2VQYXJ0cyh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24pO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRNZXNzYWdlID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLnBhc3RUZW5zZU1lc3NhZ2UgPz8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRUZXh0ID0gdHlwZW9mIGNvbXBsZXRlZE1lc3NhZ2UgPT09ICdzdHJpbmcnID8gY29tcGxldGVkTWVzc2FnZSA6IGNvbXBsZXRlZE1lc3NhZ2UudmFsdWU7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGljb25FbGVtZW50ID0gdGhpcy50b29sSWNvbnNCeUNhbGxJZC5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0XHRcdGlmIChpY29uRWxlbWVudCAmJiBpc05vUHJvYmxlbXNGb3VuZFJlc3VsdCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbElkLCBjb21wbGV0ZWRUZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHNldFRoaW5raW5nSWNvbihpY29uRWxlbWVudCwgQ29kaWNvbi5zZWFyY2gpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlzQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIHN0cmVhbWluZ1xuXHRcdFx0XHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdFx0XHRpc1N0cmVhbWluZyA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCBzdHJlYW1pbmdNZXNzYWdlID0gY3VycmVudFN0YXRlLnN0cmVhbWluZ01lc3NhZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKHN0cmVhbWluZ01lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdXBkYXRlZE1lc3NhZ2UgPSB0eXBlb2Ygc3RyZWFtaW5nTWVzc2FnZSA9PT0gJ3N0cmluZycgPyBzdHJlYW1pbmdNZXNzYWdlIDogc3RyZWFtaW5nTWVzc2FnZS52YWx1ZTtcblx0XHRcdFx0XHRcdFx0dXBkYXRlVGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGV4ZWN1dGluZyAoc29tZXRoaW5nIGxpa2UgYFJlcGxhY2luZyA2NyBsaW5lcy4uLi4uYClcblx0XHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NEYXRhID0gY3VycmVudFN0YXRlLnByb2dyZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdGlmIChwcm9ncmVzc0RhdGEubWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB1cGRhdGVkTWVzc2FnZSA9IHR5cGVvZiBwcm9ncmVzc0RhdGEubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBwcm9ncmVzc0RhdGEubWVzc2FnZSA6IHByb2dyZXNzRGF0YS5tZXNzYWdlLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVUaXRsZSh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uTXNnID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRpZiAoaW52b2NhdGlvbk1zZykge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRNZXNzYWdlID0gdHlwZW9mIGludm9jYXRpb25Nc2cgPT09ICdzdHJpbmcnID8gaW52b2NhdGlvbk1zZyA6IGludm9jYXRpb25Nc2cudmFsdWU7XG5cdFx0XHRcdFx0XHRcdFx0dXBkYXRlVGl0bGUodXBkYXRlZE1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gY29uZmlybWF0aW9ucywgZmFpbHVyZXMsIGNvbXBsZXRlZCwgb3RoZXIsIGV0Y1xuXHRcdFx0XHRcdGNvbnN0IGludm9jYXRpb25Nc2cgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0XHRcdFx0aWYgKGludm9jYXRpb25Nc2cpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWRNZXNzYWdlID0gdHlwZW9mIGludm9jYXRpb25Nc2cgPT09ICdzdHJpbmcnID8gaW52b2NhdGlvbk1zZyA6IGludm9jYXRpb25Nc2cudmFsdWU7XG5cdFx0XHRcdFx0XHR1cGRhdGVUaXRsZSh1cGRhdGVkTWVzc2FnZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dG9vbFN0b3JlLmFkZChhdXRvcnVuRGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRjb25zdCBjb2RlYmxvY2tJbmZvID0gZXh0cmFjdENvZGVibG9ja1VyaXNGcm9tVGV4dCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRpZiAoY29kZWJsb2NrSW5mbz8udXJpKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gYmFzZW5hbWUoY29kZWJsb2NrSW5mby51cmkpO1xuXHRcdFx0XHR0b29sQ2FsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuZWRpdGVkRmlsZScsICdFZGl0ZWQgezB9JywgZmlsZW5hbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmVkaXRpbmdGaWxlJywgJ0VkaXRlZCBmaWxlJyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdleHRlcm5hbEVkaXQnKSB7XG5cdFx0XHRjb25zdCBmaWxlbmFtZSA9IGJhc2VuYW1lKHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi51cmkpO1xuXHRcdFx0c3dpdGNoICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24uZWRpdEtpbmQpIHtcblx0XHRcdFx0Y2FzZSAnY3JlYXRlJzpcblx0XHRcdFx0XHR0b29sQ2FsbExhYmVsID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuY3JlYXRlZEZpbGUnLCAnQ3JlYXRlZCB7MH0nLCBmaWxlbmFtZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmRlbGV0ZWRGaWxlJywgJ0RlbGV0ZWQgezB9JywgZmlsZW5hbWUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZW5hbWUnOlxuXHRcdFx0XHRcdHRvb2xDYWxsTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdC50aGlua2luZy5yZW5hbWVkRmlsZScsICdSZW5hbWVkIHswfScsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnZWRpdCc6XG5cdFx0XHRcdFx0dG9vbENhbGxMYWJlbCA9IGxvY2FsaXplKCdjaGF0LnRoaW5raW5nLmVkaXRlZEZpbGUnLCAnRWRpdGVkIHswfScsIGZpbGVuYW1lKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9vbENhbGxMYWJlbCA9IHRvb2xJbnZvY2F0aW9uSWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRvb2wgY2FsbCB0byBleHRyYWN0ZWQgdGl0bGVzIGZvciBMTE0gdGl0bGUgZ2VuZXJhdGlvblxuXHRcdGlmICghdGhpcy5leHRyYWN0ZWRUaXRsZXMuaW5jbHVkZXModG9vbENhbGxMYWJlbCkpIHtcblx0XHRcdHRoaXMuZXh0cmFjdGVkVGl0bGVzLnB1c2godG9vbENhbGxMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPSB0b29sQ2FsbExhYmVsO1xuXG5cdFx0aWYgKCF0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5faXNFeHBhbmRlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5zZXRUaXRsZSh0b29sQ2FsbExhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4dGVybmFsUmVzb3VyY2VQYXJ0cyh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJbiBmaXhlZCBzY3JvbGxpbmcgbW9kZSwgZGVmZXIgcmVuZGVyaW5nIGFnZ3JlZ2F0ZWQgaW1hZ2VzIGF0IHRoZSBib3R0b20gd2hpbGVcblx0XHQvLyB0aGUgcmVzcG9uc2UgaXMgc3RpbGwgc3RyZWFtaW5nLiBUaGUgaW1hZ2VzIHdvdWxkIG90aGVyd2lzZSBvdmVybGFwIHRoZSBwaW5uZWRcblx0XHQvLyBzY3JvbGxpbmcgdmlld3BvcnQuIFRoZXkgYXJlIGZsdXNoZWQgb25jZSBzdHJlYW1pbmcgY29tcGxldGVzLlxuXHRcdGlmICh0aGlzLmZpeGVkU2Nyb2xsaW5nTW9kZSAmJiAhdGhpcy5zdHJlYW1pbmdDb21wbGV0ZWQgJiYgIXRoaXMuZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuc2V0KHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQsIHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleHRyYWN0ZWRJbWFnZXMgPSBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uT3V0cHV0RGV0YWlscyh0b29sSW52b2NhdGlvbiwgdGhpcy5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGV4dHJhY3RlZEltYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0czogSUNoYXRDb2xsYXBzaWJsZUlPRGF0YVBhcnRbXSA9IGV4dHJhY3RlZEltYWdlcy5tYXAoaW1hZ2UgPT4gKHtcblx0XHRcdGtpbmQ6ICdkYXRhJyxcblx0XHRcdHZhbHVlOiBpbWFnZS5kYXRhLmJ1ZmZlcixcblx0XHRcdG1pbWVUeXBlOiBpbWFnZS5taW1lVHlwZSxcblx0XHRcdHVyaTogaW1hZ2UudXJpLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2V4dGVybmFsUmVzb3VyY2VXaWRnZXQuc2V0VG9vbEludm9jYXRpb25QYXJ0cyh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCBwYXJ0cyk7XG5cdH1cblxuXHRwcml2YXRlIGZsdXNoUGVuZGluZ0V4dGVybmFsUmVzb3VyY2VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwZW5kaW5nID0gQXJyYXkuZnJvbSh0aGlzLl9wZW5kaW5nRXh0ZXJuYWxSZXNvdXJjZXMudmFsdWVzKCkpO1xuXHRcdHRoaXMuX3BlbmRpbmdFeHRlcm5hbFJlc291cmNlcy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgdG9vbEludm9jYXRpb24gb2YgcGVuZGluZykge1xuXHRcdFx0dGhpcy51cGRhdGVFeHRlcm5hbFJlc291cmNlUGFydHModG9vbEludm9jYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kSXRlbVRvRE9NKFxuXHRcdGNvbnRlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHRvb2xJbnZvY2F0aW9uSWQ/OiBzdHJpbmcsXG5cdFx0dG9vbEludm9jYXRpb25Pck1hcmtkb3duPzogQ2hhdFRoaW5raW5nSXRlbU1ldGFkYXRhLFxuXHRcdG9yaWdpbmFsUGFyZW50PzogSFRNTEVsZW1lbnRcblx0KTogdm9pZCB7XG5cdFx0aWYgKCFjb250ZW50Lmhhc0NoaWxkTm9kZXMoKSB8fCBjb250ZW50LnRleHRDb250ZW50Py50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbVdyYXBwZXIgPSAkKCcuY2hhdC10aGlua2luZy10b29sLXdyYXBwZXInKTtcblx0XHRjb25zdCBpc01hcmtkb3duRWRpdCA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bj8ua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCc7XG5cdFx0Y29uc3QgaXNFeHRlcm5hbEVkaXQgPSB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24/LmtpbmQgPT09ICdleHRlcm5hbEVkaXQnO1xuXHRcdGNvbnN0IGlzVGVybWluYWxUb29sID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnO1xuXHRcdGNvbnN0IGlzU2VhcmNoVG9vbCA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3NlYXJjaCc7XG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb25JY29uID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpID8gdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmljb24gOiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgaWNvbjogVGhlbWVJY29uO1xuXHRcdGlmIChpc05vUHJvYmxlbXNGb3VuZFJlc3VsdCh0b29sSW52b2NhdGlvbklkLCBjb250ZW50LnRleHRDb250ZW50ID8/IHVuZGVmaW5lZCkpIHtcblx0XHRcdGljb24gPSBDb2RpY29uLnNlYXJjaDtcblx0XHR9IGVsc2UgaWYgKGlzTWFya2Rvd25FZGl0IHx8IGlzRXh0ZXJuYWxFZGl0KSB7XG5cdFx0XHRpY29uID0gQ29kaWNvbi5wZW5jaWw7XG5cdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRvb2wpIHtcblx0XHRcdGljb24gPSBDb2RpY29uLnNlYXJjaDtcblx0XHR9IGVsc2UgaWYgKGlzVGVybWluYWxUb29sKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSAodG9vbEludm9jYXRpb25Pck1hcmtkb3duIGFzIElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCkudG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZT86IG51bWJlciB9OyBjb21tYW5kTGluZT86IHsgaXNTYW5kYm94V3JhcHBlZD86IGJvb2xlYW4gfSB9O1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0ZXJtaW5hbERhdGE/LnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZTtcblx0XHRcdGNvbnN0IGlzU2FuZGJveFdyYXBwZWQgPSB0ZXJtaW5hbERhdGE/LmNvbW1hbmRMaW5lPy5pc1NhbmRib3hXcmFwcGVkO1xuXHRcdFx0aWYgKGV4aXRDb2RlICE9PSB1bmRlZmluZWQgJiYgZXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0aWNvbiA9IENvZGljb24uZXJyb3I7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU2FuZGJveFdyYXBwZWQpIHtcblx0XHRcdFx0aWNvbiA9IENvZGljb24udGVybWluYWxTZWN1cmU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpY29uID0gdG9vbEludm9jYXRpb25JY29uID8/IENvZGljb24udGVybWluYWw7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjb250ZW50LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC1ob29rLW91dGNvbWUtYmxvY2tlZCcpKSB7XG5cdFx0XHRpY29uID0gQ29kaWNvbi5lcnJvcjtcblx0XHR9IGVsc2UgaWYgKGNvbnRlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWhvb2stb3V0Y29tZS13YXJuaW5nJykpIHtcblx0XHRcdGljb24gPSBDb2RpY29uLndhcm5pbmc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGljb24gPSB0b29sSW52b2NhdGlvbklkID8gZ2V0VG9vbEludm9jYXRpb25JY29uKHRvb2xJbnZvY2F0aW9uSWQsIHRvb2xJbnZvY2F0aW9uSWNvbiwgY29udGVudC50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQpIDogQ29kaWNvbi50b29scztcblx0XHR9XG5cblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGNyZWF0ZVRoaW5raW5nSWNvbihpY29uKTtcblx0XHRpdGVtV3JhcHBlci5hcHBlbmRDaGlsZChpY29uRWxlbWVudCk7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoY29udGVudCk7XG5cblx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbkNvdW50ID09PSAxICYmIHRoaXMuaG9va0NvdW50ID09PSAwICYmIG9yaWdpbmFsUGFyZW50KSB7XG5cdFx0XHRjb25zdCB0b29sSW52b2NhdGlvbiA9IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAodG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgdG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSA/IHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc2luZ2xlSXRlbUluZm8gPSB7XG5cdFx0XHRcdGVsZW1lbnQ6IGNvbnRlbnQsXG5cdFx0XHRcdHRoaW5raW5nV3JhcHBlcjogaXRlbVdyYXBwZXIsXG5cdFx0XHRcdG9yaWdpbmFsUGFyZW50LFxuXHRcdFx0XHRvcmlnaW5hbE5leHRTaWJsaW5nOiB0aGlzLmRvbU5vZGUsXG5cdFx0XHRcdHJlc3RvcmVUb09yaWdpbmFsUGFyZW50OiAhIXRvb2xJbnZvY2F0aW9uIHx8IGlzRXh0ZXJuYWxFZGl0LFxuXHRcdFx0XHR0b29sSW52b2NhdGlvblxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zaW5nbGVJdGVtSW5mbyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpc1Rvb2xJbnZvY2F0aW9uID0gdG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmICh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdGlmIChpc1Rvb2xJbnZvY2F0aW9uICYmIHRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkKSB7XG5cdFx0XHR0aGlzLnRvb2xXcmFwcGVyc0J5Q2FsbElkLnNldCh0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCwgaXRlbVdyYXBwZXIpO1xuXHRcdFx0dGhpcy50b29sSWNvbnNCeUNhbGxJZC5zZXQodG9vbEludm9jYXRpb25Pck1hcmtkb3duLnRvb2xDYWxsSWQsIGljb25FbGVtZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGVuZFRvV3JhcHBlcihpdGVtV3JhcHBlcik7XG5cblx0XHRpZiAodGhpcy5maXhlZFNjcm9sbGluZ01vZGUgJiYgdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0Ly8gT2JzZXJ2ZSB0aGUgY2hpbGQgd3JhcHBlciBmb3IgcmVzaXplcyAoZS5nLiB0ZXJtaW5hbCBleHBhbmRpbmcpXG5cdFx0XHRpZiAodGhpcy5jaGlsZFJlc2l6ZU9ic2VydmVyICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkge1xuXHRcdFx0XHRjb25zdCBvYnNlcnZlRGlzcG9zYWJsZSA9IHRoaXMuY2hpbGRSZXNpemVPYnNlcnZlci5vYnNlcnZlKGl0ZW1XcmFwcGVyKTtcblx0XHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IGlzVG9vbEludm9jYXRpb24gPyB0b29sSW52b2NhdGlvbk9yTWFya2Rvd24udG9vbENhbGxJZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRsZXQgc3RvcmUgPSB0aGlzLnRvb2xEaXNwb3NhYmxlcy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0aWYgKCFzdG9yZSkge1xuXHRcdFx0XHRcdFx0c3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLnRvb2xEaXNwb3NhYmxlcy5zZXQodG9vbENhbGxJZCwgc3RvcmUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzdG9yZS5hZGQob2JzZXJ2ZURpc3Bvc2FibGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9ic2VydmVEaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDb2FsZXNjZSByZWFkcyBvZiBzY3JvbGxIZWlnaHQgdG8gYXZvaWQgZm9yY2VkIHJlZmxvd3Mgd2hlbiBtYW55IGl0ZW1zXG5cdFx0XHQvLyBhcmUgYXBwZW5kZWQgaW4gdGhlIHNhbWUgdGljayAoZS5nLiB3aGVuIHJlc3RvcmluZyBhIHNlc3Npb24pLlxuXHRcdFx0dGhpcy5zY2hlZHVsZUFwcGVuZFJlZnJlc2goKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlQXBwZW5kUmVmcmVzaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0FwcGVuZFJlZnJlc2gudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0FwcGVuZFJlZnJlc2gudmFsdWUgPSBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyh0aGlzLndyYXBwZXIpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQXBwZW5kUmVmcmVzaC5jbGVhcigpO1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWZyZXNoQ29udGVudEhlaWdodCgpO1xuXHRcdFx0dGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zRnJvbUNhY2hlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG1hdGVyaWFsaXplTGF6eUl0ZW0oaXRlbTogSUxhenlJdGVtKTogdm9pZCB7XG5cdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0Ly8gTWF0ZXJpYWxpemUgdGhpbmtpbmcgY29udGFpbmVyXG5cdFx0XHR0aGlzLmFwcGVuZFRvV3JhcHBlcihpdGVtLnRleHRDb250YWluZXIpO1xuXHRcdFx0Ly8gU3RvcmUgcmVmZXJlbmNlIHRvIHRleHRDb250YWluZXIgZm9yIHVwZGF0ZVRoaW5raW5nIGNhbGxzXG5cdFx0XHR0aGlzLnRleHRDb250YWluZXIgPSBpdGVtLnRleHRDb250YWluZXI7XG5cdFx0XHR0aGlzLmlkID0gaXRlbS5jb250ZW50LmlkO1xuXHRcdFx0Ly8gVXNlIGl0ZW0uY29udGVudCB3aGljaCBpcyBrZXB0IHVwLXRvLWRhdGUgZHVyaW5nIHN0cmVhbWluZyB2aWEgdXBkYXRlVGhpbmtpbmdcblx0XHRcdHRoaXMudXBkYXRlVGhpbmtpbmcoaXRlbS5jb250ZW50KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckxhYmVsKSB7XG5cdFx0XHRjb25zdCBpc1Rlcm1pbmFsVG9vbCA9IGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duICYmIChpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IGl0ZW0udG9vbEludm9jYXRpb25Pck1hcmtkb3duLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnO1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnkgPSBpc1Rlcm1pbmFsVG9vbCA/IFdvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkuVGVybWluYWwgOiBXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRvb2w7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmdldFJhbmRvbVdvcmtpbmdNZXNzYWdlKGNhdGVnb3J5KTtcblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgdG9vbCBpdGVtc1xuXHRcdGlmIChpdGVtLmxhenkuaGFzVmFsdWUpIHtcblx0XHRcdC8vIEFscmVhZHkgZXZhbHVhdGVkIFx1MjAxNCBidXQgbWF5IG5vdCBoYXZlIGJlZW4gcGxhY2VkIGluIHRoZSBET00geWV0XG5cdFx0XHQvLyAoZS5nLiBmaW5hbGl6ZVRpdGxlSWZEZWZhdWx0IG1hdGVyaWFsaXplZCBpdCBiZWZvcmUgdGhlIHdyYXBwZXIgZXhpc3RlZCkuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0XHRpZiAoIXJlc3VsdC5kb21Ob2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5hcHBlbmRJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGl0ZW0udG9vbEludm9jYXRpb25JZCwgaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24sIGl0ZW0ub3JpZ2luYWxQYXJlbnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGl0ZW0ubGF6eS52YWx1ZTtcblx0XHR0aGlzLmFwcGVuZEl0ZW1Ub0RPTShyZXN1bHQuZG9tTm9kZSwgaXRlbS50b29sSW52b2NhdGlvbklkLCBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biwgaXRlbS5vcmlnaW5hbFBhcmVudCk7XG5cblx0XHRpZiAocmVzdWx0LmRpc3Bvc2FibGUpIHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93biAmJiAoaXRlbS50b29sSW52b2NhdGlvbk9yTWFya2Rvd24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgPyBpdGVtLnRvb2xJbnZvY2F0aW9uT3JNYXJrZG93bi50b29sQ2FsbElkIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRvb2xDYWxsSWQpIHtcblx0XHRcdFx0dGhpcy5vd25lZFRvb2xQYXJ0cy5zZXQodG9vbENhbGxJZCwgcmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIG1ha2VzIGEgbmV3IHRleHQgY29udGFpbmVyLiB3aGVuIHdlIHVwZGF0ZSwgd2Ugbm93IHVwZGF0ZSB0aGlzIGNvbnRhaW5lci5cblx0cHVibGljIHNldHVwVGhpbmtpbmdDb250YWluZXIoY29udGVudDogSUNoYXRUaGlua2luZ1BhcnQpIHtcblx0XHQvLyBBdm9pZCBjcmVhdGluZyBuZXcgY29udGFpbmVycyBhZnRlciBkaXNwb3NhbFxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuYXBwZW5kZWRJdGVtQ291bnQrKztcblx0XHR0aGlzLmFsbFRoaW5raW5nUGFydHMucHVzaChjb250ZW50KTtcblx0XHR0aGlzLnJlY29yZFJlYXNvbmluZ0NvbnRlbnQoZXh0cmFjdFRleHRGcm9tUGFydChjb250ZW50KSk7XG5cdFx0dGhpcy50ZXh0Q29udGFpbmVyID0gJCgnLmNoYXQtdGhpbmtpbmctaXRlbS5tYXJrZG93bi1jb250ZW50Jyk7XG5cdFx0Ly8gT2JzZXJ2ZSB0aGUgbmV3IHRleHRDb250YWluZXIgZm9yIGNoaWxkIHJlc2l6ZXMgaW4gZml4ZWQgc2Nyb2xsaW5nIG1vZGVcblx0XHRpZiAodGhpcy5jaGlsZFJlc2l6ZU9ic2VydmVyICYmIHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGlsZFJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy50ZXh0Q29udGFpbmVyKSk7XG5cdFx0fVxuXHRcdGlmIChjb250ZW50LnZhbHVlKSB7XG5cdFx0XHQvLyBVc2UgbGF6eSByZW5kZXJpbmcgd2hlbiBjb2xsYXBzZWQgdG8gcHJlc2VydmUgb3JkZXIgd2l0aCB0b29sIGl0ZW1zXG5cdFx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkgfHwgdGhpcy5oYXNFeHBhbmRlZE9uY2UgfHwgKHRoaXMuZml4ZWRTY3JvbGxpbmdNb2RlICYmICF0aGlzLnN0cmVhbWluZ0NvbXBsZXRlZCkpIHtcblx0XHRcdFx0Ly8gUmVuZGVyIGltbWVkaWF0ZWx5IHdoZW4gZXhwYW5kZWRcblx0XHRcdFx0dGhpcy5hcHBlbmRUb1dyYXBwZXIodGhpcy50ZXh0Q29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5pZCA9IGNvbnRlbnQuaWQ7XG5cdFx0XHRcdHRoaXMudXBkYXRlVGhpbmtpbmcoY29udGVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBVcGRhdGUgdGhpcy5jb250ZW50IGFuZCB0aGlzLmlkIHNvIHRoYXQgc3Vic2VxdWVudCB1cGRhdGVUaGlua2luZyBjYWxsc1xuXHRcdFx0XHQvLyBvciBtYXRlcmlhbGl6ZUxhenlJdGVtIHdpbGwgdXNlIHRoZSBjb3JyZWN0IGNvbnRlbnQgZm9yIHRoaXMgc2VjdGlvblxuXHRcdFx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0XHR0aGlzLmlkID0gY29udGVudC5pZDtcblx0XHRcdFx0Ly8gRGVmZXIgcmVuZGVyaW5nIHVudGlsIGV4cGFuZGVkIHRvIHByZXNlcnZlIG9yZGVyXG5cdFx0XHRcdGNvbnN0IGxhenlUaGlua2luZzogSUxhenlUaGlua2luZ0l0ZW0gPSB7XG5cdFx0XHRcdFx0a2luZDogJ3RoaW5raW5nJyxcblx0XHRcdFx0XHR0ZXh0Q29udGFpbmVyOiB0aGlzLnRleHRDb250YWluZXIsXG5cdFx0XHRcdFx0Y29udGVudFxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLmxhenlJdGVtcy5wdXNoKGxhenlUaGlua2luZyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyTGFiZWwpIHtcblx0XHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRSYW5kb21Xb3JraW5nTWVzc2FnZShXb3JraW5nTWVzc2FnZUNhdGVnb3J5LlRoaW5raW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy51cGRhdGVEcm9wZG93bkNsaWNrYWJpbGl0eSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldFRpdGxlKHRpdGxlOiBzdHJpbmcsIG9taXRQcmVmaXg/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aXRsZSB8fCB0aGlzLmVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvbWl0UHJlZml4KSB7XG5cdFx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWxFbGVtZW50O1xuXHRcdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdFx0Y29uc3QgcGxhaW5TcGFuID0gJCgnc3BhbicpO1xuXHRcdFx0XHRwbGFpblNwYW4udGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHRcdFx0bGFiZWxFbGVtZW50LmFwcGVuZENoaWxkKHBsYWluU3Bhbik7XG5cdFx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gdGl0bGU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdGl0bGVEZXRhaWxSZW5kZXJlZC5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdGl0bGVGaWxlV2lkZ2V0U3RvcmUuY2xlYXIoKTtcblx0XHRcdHRoaXMuY3VycmVudFRpdGxlID0gdGl0bGU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0RXh0cmFjdGVkVGl0bGUgPSB0aXRsZTtcblx0XHRjb25zdCB0aGlua2luZ0xhYmVsID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcubGFiZWwnLCBcInswfTogezF9XCIsIHRoaXMuZGVmYXVsdFRpdGxlLCB0aXRsZSk7XG5cdFx0dGhpcy5jdXJyZW50VGl0bGUgPSB0aGlua2luZ0xhYmVsO1xuXG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblxuXHRcdC8vIEVuc3VyZSB0aGUgcGVyc2lzdGVudCBzaGltbWVyIHNwYW4gZXhpc3RzXG5cdFx0aWYgKCF0aGlzLnRpdGxlU2hpbW1lclNwYW4gfHwgIXRoaXMudGl0bGVTaGltbWVyU3Bhbi5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMudGl0bGVTaGltbWVyU3BhbiA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy10aXRsZS1zaGltbWVyJyk7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50aXRsZVNoaW1tZXJTcGFuKTtcblx0XHR9XG5cdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2NoYXQudGhpbmtpbmcuc2hpbW1lcicsIFwiezB9OiBcIiwgdGhpcy5kZWZhdWx0VGl0bGUpO1xuXG5cdFx0Ly8gRGlzcG9zZSBwcmV2aW91cyBkZXRhaWwgcmVuZGVyaW5nXG5cdFx0dGhpcy5fdGl0bGVEZXRhaWxSZW5kZXJlZC5jbGVhcigpO1xuXHRcdHRoaXMuX3RpdGxlRmlsZVdpZGdldFN0b3JlLmNsZWFyKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKHRpdGxlKSk7XG5cdFx0cmVzdWx0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2libGUtdGl0bGUtY29udGVudCcsICdjaGF0LXRoaW5raW5nLXRpdGxlLWRldGFpbCcpO1xuXHRcdHJlbmRlckZpbGVXaWRnZXRzKHJlc3VsdC5lbGVtZW50LCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIHRoaXMuX3RpdGxlRmlsZVdpZGdldFN0b3JlKTtcblx0XHR0aGlzLl90aXRsZURldGFpbFJlbmRlcmVkLnZhbHVlID0gcmVzdWx0O1xuXG5cdFx0aWYgKHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIpIHtcblx0XHRcdC8vIFJlcGxhY2Ugb2xkIGRldGFpbCBpbi1wbGFjZVxuXHRcdFx0dGhpcy50aXRsZURldGFpbENvbnRhaW5lci5yZXBsYWNlV2l0aChyZXN1bHQuZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChyZXN1bHQuZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIgPSByZXN1bHQuZWxlbWVudDtcblxuXHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gdGhpbmtpbmdMYWJlbDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyh0aGlzLmlzRXhwYW5kZWQoKSk7XG5cdH1cblxuXHRoYXNTYW1lQ29udGVudChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIF9mb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBfZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cblx0XHRpZiAoX2VsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICgob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJylcblx0XHRcdCYmIG90aGVyLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCdcblx0XHRcdCYmICFvdGhlci5zdWJBZ2VudEludm9jYXRpb25JZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnIHx8IG90aGVyLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IG90aGVyLmtpbmQgPT09ICdob29rJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyLmtpbmQgIT09ICd0aGlua2luZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3RoZXI/LmlkICE9PSB0aGlzLmlkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzQWN0aXZlID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KSB7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLnBlbmRpbmdSZW1vdmFsRmx1c2hEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5wZW5kaW5nUmVtb3ZhbEZsdXNoRGlzcG9zYWJsZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnBlbmRpbmdTY3JvbGxEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyx1QkFBdUIsV0FBVywwQkFBMEIsYUFBYSxXQUFXLFdBQVcsTUFBTSxlQUFlLG9DQUFvQztBQUNwSyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQXNHLDJCQUEwRDtBQUdoSyxTQUFTLG1CQUFtQiwyQkFBMkI7QUFFdkQsU0FBUyw2QkFBNkI7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LE9BQU87QUFFbkMsU0FBSyxnQkFBZ0IsUUFBUSxZQUFZO0FBQ3pDLFNBQUssZ0JBQWdCLFFBQVEsZUFBZSxPQUFPLEtBQUssV0FBVyxDQUFDO0FBQUEsRUFDckU7QUFBQSxFQUVBLGVBQWUsT0FBNkIsbUJBQTJDLFVBQWlDO0FBRXZILFFBQUksU0FBUyxZQUFZO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsU0FBSyxNQUFNLFNBQVMsb0JBQW9CLE1BQU0sU0FBUywrQkFDbkQsTUFBTSxrQkFBa0IsU0FBUyxjQUNqQyxDQUFDLE1BQU0sc0JBQXNCO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxNQUFNLFNBQVMsb0JBQW9CLE1BQU0sU0FBUyw4QkFBOEIsTUFBTSxTQUFTLHFCQUFxQixNQUFNLFNBQVMsUUFBUTtBQUM5SSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksTUFBTSxTQUFTLFlBQVk7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLE9BQU8sT0FBTyxLQUFLO0FBQUEsRUFDM0I7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssV0FBVztBQUNoQixRQUFJLEtBQUssdUJBQXVCO0FBQy9CLFdBQUssc0JBQXNCLE9BQU87QUFDbEMsV0FBSyx3QkFBd0I7QUFDN0IsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUNBLFNBQUssK0JBQStCLFFBQVE7QUFDNUMsU0FBSyxnQ0FBZ0M7QUFDckMsU0FBSyx5QkFBeUIsUUFBUTtBQUN0QyxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUE3cUVhLDBCQUFOO0FBQUEsRUEwR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FqSFU7IiwKICAibmFtZXMiOiBbIldvcmtpbmdNZXNzYWdlQ2F0ZWdvcnkiLCAiaW52b2NhdGlvbk1zZyIsICJyZXN1bHQiLCAibGFiZWxFbGVtZW50Il0KfQo=
