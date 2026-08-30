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
import { $, AnimationFrameScheduler, DisposableResizeObserver } from "../../../../../../base/browser/dom.js";
import { Action } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Event } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { rcut } from "../../../../../../base/common/strings.js";
import { localize } from "../../../../../../nls.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { HiddenItemStrategy, WorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatConfiguration } from "../../../common/constants.js";
import { isAgentHostTarget } from "../../../common/chatSessionsService.js";
import { formatCopilotCredits, IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from "../../../common/chatService/chatService.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { ChatCollapsibleContentPart } from "./chatCollapsibleContentPart.js";
import { ChatCollapsibleMarkdownContentPart } from "./chatCollapsibleMarkdownContentPart.js";
import { renderFileWidgets } from "./chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "./chatMarkdownAnchorService.js";
import { buildPhrasePool, createThinkingIcon, getToolInvocationIcon } from "./chatThinkingContentPart.js";
import { ChatToolInvocationPart } from "./toolInvocationParts/chatToolInvocationPart.js";
import "./media/chatSubagentContent.css";
const MAX_TITLE_LENGTH = 100;
const subagentWorkingMessages = [
  localize("chat.subagent.working.1", "Processing"),
  localize("chat.subagent.working.2", "Preparing"),
  localize("chat.subagent.working.3", "Loading"),
  localize("chat.subagent.working.4", "Analyzing"),
  localize("chat.subagent.working.5", "Evaluating")
];
let ChatSubagentContentPart = class extends ChatCollapsibleContentPart {
  constructor(subAgentInvocationId, toolInvocation, context, chatContentMarkdownRenderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, instantiationService, chatMarkdownAnchorService, hoverService, configurationService, accessibilityService, actionViewItemService, menuService, contextKeyService, environmentService) {
    const { description, isDefaultDescription, agentName, prompt, modelName, credits } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
    const rawPrefix = agentName || localize("chat.subagent.prefix", "Subagent");
    const prefix = rawPrefix.charAt(0).toUpperCase() + rawPrefix.slice(1);
    const initialTitle = `${prefix}: ${description}`;
    super(initialTitle, context, void 0, hoverService, configurationService);
    this.subAgentInvocationId = subAgentInvocationId;
    this.context = context;
    this.chatContentMarkdownRenderer = chatContentMarkdownRenderer;
    this.listPool = listPool;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.announcedToolProgressKeys = announcedToolProgressKeys;
    this.instantiationService = instantiationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.actionViewItemService = actionViewItemService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.hasToolItems = false;
    // Lazy rendering support
    this.lazyItems = [];
    this.hasExpandedOnce = false;
    this.pendingPromptRender = false;
    this.activeToolPresentations = /* @__PURE__ */ new Map();
    this._hoverDisposable = this._register(new MutableDisposable());
    this._openChatActionListeners = this._register(new MutableDisposable());
    this._openChatActionViewRegistration = this._register(new MutableDisposable());
    // Confirmation auto-expand tracking
    this.toolsWaitingForConfirmation = 0;
    this.userManuallyExpanded = false;
    this.autoExpandedForConfirmation = false;
    this._confirmationPlaceholderDisposable = this._register(new MutableDisposable());
    this._activeConfirmationTracker = this._register(new MutableDisposable());
    this._useCarouselForConfirmations = false;
    this.toolsWaitingForCarouselConfirmation = 0;
    this._confirmationActive = false;
    /** Per-tool-invocation autoruns observing tool state; each is disposed once its tool reaches a terminal state so listeners don't accumulate for the widget's lifetime. */
    this._toolStateTracking = this._register(new DisposableStore());
    this._toolPresentationBatchDepth = 0;
    this._toolPresentationDirty = false;
    this._titleDetailRendered = this._register(new MutableDisposable());
    this.description = rcut(description, MAX_TITLE_LENGTH);
    this._isDefaultDescription = isDefaultDescription;
    this.agentName = agentName;
    this.prompt = prompt;
    this.modelName = modelName;
    this.credits = credits;
    this.isInitiallyComplete = IChatToolInvocation.isComplete(toolInvocation);
    this.isExternallyActive = toolInvocation.toolSpecificData?.kind === "subagent" && toolInvocation.toolSpecificData.isActive === true;
    this.isActive = toolInvocation.toolSpecificData?.kind === "subagent" ? toolInvocation.toolSpecificData.isActive ?? !this.isInitiallyComplete : !this.isInitiallyComplete;
    this.subagentActivity = toolInvocation.toolSpecificData?.kind === "subagent" ? toolInvocation.toolSpecificData.activity : void 0;
    this._subagentToolInvocation = toolInvocation;
    this._register(this.configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatConfiguration.SubagentsUseRichRendering)) {
        this._updateOpenChatLink();
      }
    }));
    if (isResponseVM(context.element)) {
      const response = context.element;
      const finalizeOnTerminal = () => {
        if (this.isActive && (response.isComplete || response.isCanceled)) {
          this.markAsInactive(true);
        }
      };
      finalizeOnTerminal();
      if (!response.isComplete && !response.isCanceled) {
        this._register(Event.once(Event.filter(response.model.onDidChange, () => response.isComplete || response.isCanceled))(finalizeOnTerminal));
      }
    }
    const node = this.domNode;
    node.classList.add("chat-thinking-box", "chat-thinking-fixed-mode", "chat-subagent-part");
    const animationContainer = this.contentAnimationContainer;
    if (animationContainer) {
      const pendingAnimationCleanup = this._register(new MutableDisposable());
      this._register(dom.addDisposableListener(node, ChatCollapsibleContentPart.userToggleEvent, (e) => {
        if (e.target === node && this.isActive && !this.accessibilityService.isMotionReduced()) {
          this.setContentAnimationEnabled(true);
          animationContainer.getBoundingClientRect();
        }
      }));
      const finishActiveToggleAnimation = (e) => {
        if (this.isActive && e.target === animationContainer && e.propertyName === "grid-template-rows") {
          pendingAnimationCleanup.clear();
          this.setContentAnimationEnabled(false);
        }
      };
      this._register(dom.addDisposableListener(animationContainer, "transitionend", finishActiveToggleAnimation));
      this._register(dom.addDisposableListener(animationContainer, "transitioncancel", finishActiveToggleAnimation));
    }
    this._updateOpenChatLink();
    if (this.isActive) {
      node.classList.add("chat-thinking-active");
    }
    if (this.isActive && this._collapseButton) {
      const labelElement = this._collapseButton.labelElement;
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      this.titleShimmerSpan.textContent = initialTitle;
      labelElement.appendChild(this.titleShimmerSpan);
    }
    if (this._collapseButton && this.isActive) {
      this._collapseButton.icon = Codicon.circleFilled;
    }
    this._register(autorun((r) => {
      this.expanded.read(r);
      if (this._collapseButton) {
        if (this.isActive) {
          this._collapseButton.icon = Codicon.circleFilled;
        } else {
          this._collapseButton.icon = Codicon.check;
        }
      }
    }));
    this._register(autorun((r) => {
      if (this._isExpanded.read(r) && !this.hasExpandedOnce) {
        this.hasExpandedOnce = true;
        this.materializePendingContent();
      }
    }));
    this.setExpanded(false);
    this._register(autorun((r) => {
      const expanded = this._isExpanded.read(r);
      if (expanded) {
        if (!this.autoExpandedForConfirmation) {
          this.userManuallyExpanded = true;
        }
      } else {
        if (this.autoExpandedForConfirmation) {
          this.autoExpandedForConfirmation = false;
        }
        if (this.userManuallyExpanded) {
          this.userManuallyExpanded = false;
        }
      }
    }));
    this.layoutScheduler = this._register(new AnimationFrameScheduler(this.domNode, () => this.performLayout()));
    this.updateHover();
    this.renderPromptSection();
    this.watchToolCompletion(toolInvocation);
  }
  /**
   * Check if a tool invocation is the parent subagent tool (the tool that spawns a subagent).
   * A parent subagent tool has subagent toolSpecificData but no subAgentInvocationId.
   */
  static isParentSubagentTool(toolInvocation) {
    return toolInvocation.toolSpecificData?.kind === "subagent" && !toolInvocation.subAgentInvocationId;
  }
  /**
   * Extracts subagent info (description, agentName, prompt) from a tool invocation.
   */
  static extractSubagentInfo(toolInvocation) {
    const defaultDescription = localize("chat.subagent.defaultDescription", "Running subagent");
    if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
      return { description: defaultDescription, isDefaultDescription: true, agentName: void 0, prompt: void 0, modelName: void 0, credits: void 0 };
    }
    if (toolInvocation.toolSpecificData?.kind === "subagent") {
      const hasDescription = !!toolInvocation.toolSpecificData.description;
      return {
        description: toolInvocation.toolSpecificData.description ?? defaultDescription,
        isDefaultDescription: !hasDescription,
        agentName: toolInvocation.toolSpecificData.agentName,
        prompt: toolInvocation.toolSpecificData.prompt,
        modelName: toolInvocation.toolSpecificData.modelName,
        credits: toolInvocation.toolSpecificData.credits
      };
    }
    if (toolInvocation.kind === "toolInvocation") {
      const state = toolInvocation.state.get();
      const params = state.type !== IChatToolInvocation.StateKind.Streaming ? state.parameters : void 0;
      const hasDescription = !!params?.description;
      return {
        description: params?.description ?? defaultDescription,
        isDefaultDescription: !hasDescription,
        agentName: params?.agentName,
        prompt: params?.prompt,
        modelName: void 0,
        credits: void 0
      };
    }
    return { description: defaultDescription, isDefaultDescription: true, agentName: void 0, prompt: void 0, modelName: void 0, credits: void 0 };
  }
  /** The subagent's own chat resource (URI string), when it runs as a distinct chat. */
  _getChatResource() {
    const data = this._subagentToolInvocation.toolSpecificData;
    return data?.kind === "subagent" ? data.chatResource : void 0;
  }
  /**
   * Creates (once) and toggles the subagent header toolbar that hosts the
   * `MenuId.ChatSubagentContent` menu. The Agents window contributes an "Open
   * Subagent" pill into that menu to reveal the subagent's own (read-only)
   * chat; in the regular chat view the menu is empty and nothing renders. The
   * subagent chat resource can arrive after the part is first constructed, so
   * this is also called from the tool-completion autorun.
   */
  _updateOpenChatLink() {
    const resource = this._shouldUseOpenChatPresentation() ? this._getChatResource() : void 0;
    this.domNode.classList.toggle("chat-subagent-has-chat", !!resource);
    this._updateOpenChatOnlyMode();
    if (!this._collapseButton) {
      return;
    }
    if (!resource) {
      this._openChatToolbarContainer?.classList.add("hidden");
      this._updateOpenChatOnlyMode();
      return;
    }
    if (!this._ensureOpenChatToolbar()) {
      return;
    }
    this._updateOpenChatToolbarContext();
    this._openChatToolbarContainer.classList.remove("hidden");
  }
  _ensureOpenChatToolbar() {
    if (this._openChatToolbar) {
      return true;
    }
    const menuAction = this._getOpenChatMenuAction();
    if (!menuAction) {
      return false;
    }
    const actionViewItemProvider = this.actionViewItemService.lookUp(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
    if (!actionViewItemProvider) {
      if (!this._openChatActionViewRegistration.value) {
        this._openChatActionViewRegistration.value = Event.once(Event.filter(
          this.actionViewItemService.onDidChange,
          (menuId) => menuId === MenuId.ChatSubagentContent
        ))(() => {
          this._openChatActionViewRegistration.clear();
          this._updateOpenChatLink();
        });
      }
      return false;
    }
    this._openChatActionViewRegistration.clear();
    const container = $(".chat-subagent-open-chat-toolbar");
    this._collapseButton?.element.parentElement?.insertBefore(container, this._collapseButton.element);
    this._openChatToolbarContainer = container;
    this._openChatToolbar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, container, {
      hiddenItemStrategy: HiddenItemStrategy.Ignore,
      actionViewItemProvider: (action, options) => actionViewItemProvider(
        action,
        options,
        this.instantiationService,
        dom.getWindow(container).vscodeWindowId
      )
    }));
    this._openChatToolbar.setActions([menuAction]);
    this._trackOpenChatActions();
    return true;
  }
  _getOpenChatMenuAction() {
    for (const [, actions] of this.menuService.getMenuActions(MenuId.ChatSubagentContent, this.contextKeyService, { shouldForwardArgs: true })) {
      const action = actions.find((action2) => action2.id === CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID);
      if (action instanceof MenuItemAction) {
        return action;
      }
    }
    return void 0;
  }
  _trackOpenChatActions() {
    const store = new DisposableStore();
    const itemCount = this._openChatToolbar?.getItemsLength() ?? 0;
    for (let index = 0; index < itemCount; index++) {
      const action = this._openChatToolbar?.getItemAction(index);
      if (action instanceof Action) {
        store.add(action.onDidChange(() => this._updateOpenChatOnlyMode()));
      }
    }
    this._openChatActionListeners.value = store;
    this._updateOpenChatOnlyMode();
  }
  _updateOpenChatOnlyMode() {
    if (!this._collapseButton) {
      return;
    }
    let openChatOnly = false;
    if (this._openChatToolbar) {
      const itemCount = this._openChatToolbar.getItemsLength();
      openChatOnly = this._shouldUseOpenChatPresentation() && !!this._getChatResource();
      for (let index = 0; index < itemCount; index++) {
        if (!this._openChatToolbar.getItemAction(index)?.enabled) {
          openChatOnly = false;
          break;
        }
      }
    }
    this.domNode.classList.toggle("chat-subagent-open-chat-only", openChatOnly);
    if (openChatOnly || this._shouldReserveOpenChatPresentation()) {
      dom.hide(this._collapseButton.element);
      if (this.contentAnimationContainer) {
        dom.hide(this.contentAnimationContainer);
      }
      this.setExpanded(false);
    } else {
      dom.show(this._collapseButton.element);
      if (this.contentAnimationContainer) {
        dom.show(this.contentAnimationContainer);
      }
    }
  }
  _updateOpenChatToolbarContext() {
    const chatResource = this._getChatResource();
    if (chatResource && this._openChatToolbar) {
      const data = this._subagentToolInvocation.toolSpecificData;
      const response = isResponseVM(this.context.element) ? this.context.element : void 0;
      const selectedModel = response?.session?.model.inputModel.state.get()?.selectedModel;
      const parentModelId = response?.model.request?.modelId ?? selectedModel?.identifier;
      const parentModelName = selectedModel?.metadata.name;
      const resolvedModel = response?.model.result?.metadata?.resolvedModel;
      const parentResolvedModelId = typeof resolvedModel === "string" ? resolvedModel : selectedModel?.metadata.id;
      const activeTool = Array.from(this.activeToolPresentations.entries()).at(-1);
      const displayedTool = activeTool ? { callId: activeTool[0], ...activeTool[1] } : this.subagentActivity !== "markdown" ? this.mostRecentToolPresentation : void 0;
      this._openChatToolbar.context = {
        chatResource,
        parentSessionResource: this.context.element.sessionResource.toString(),
        title: this.description,
        confirmationCount: this.toolsWaitingForCarouselConfirmation,
        confirmationActive: this._confirmationActive,
        startedAt: data?.kind === "subagent" ? data.startedAt : void 0,
        duration: data?.kind === "subagent" ? data.duration : void 0,
        isActive: this.isActive,
        ...this.modelName ? { modelName: this.modelName } : {},
        ...parentModelId ? { parentModelId } : {},
        ...parentModelName ? { parentModelName } : {},
        ...parentResolvedModelId ? { parentResolvedModelId } : {},
        ...this.isActive && displayedTool ? { activeToolCallId: displayedTool.callId, activeToolLabel: displayedTool.label, activeToolIcon: displayedTool.icon } : {}
      };
    }
  }
  _shouldUseOpenChatPresentation() {
    return this.environmentService.isSessionsWindow || this.configurationService.getValue(ChatConfiguration.SubagentsUseRichRendering);
  }
  _shouldReserveOpenChatPresentation() {
    return this._shouldUseOpenChatPresentation() && isAgentHostTarget(getChatSessionType(this.context.element.sessionResource));
  }
  getRandomWorkingMessage() {
    if (!this.availableMessages || this.availableMessages.length === 0) {
      this.availableMessages = buildPhrasePool(subagentWorkingMessages, this.configurationService);
    }
    const index = Math.floor(Math.random() * this.availableMessages.length);
    return this.availableMessages.splice(index, 1)[0];
  }
  createWorkingSpinner() {
    if (this.workingSpinnerElement || !this.wrapper) {
      return;
    }
    this.workingSpinnerElement = $(".chat-thinking-item.chat-thinking-spinner-item");
    const spinnerIcon = createThinkingIcon(Codicon.circleFilled);
    this.workingSpinnerElement.appendChild(spinnerIcon);
    this.workingSpinnerLabel = $("span.chat-thinking-spinner-label");
    this.workingSpinnerLabel.textContent = this.getRandomWorkingMessage();
    this.workingSpinnerElement.appendChild(this.workingSpinnerLabel);
    this.wrapper.appendChild(this.workingSpinnerElement);
  }
  removeWorkingSpinner() {
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.remove();
      this.workingSpinnerElement = void 0;
      this.workingSpinnerLabel = void 0;
    }
  }
  showWorkingSpinner() {
    if (this.workingSpinnerElement) {
      this.workingSpinnerElement.style.display = "";
    } else {
      this.createWorkingSpinner();
    }
  }
  initContent() {
    this.wrapper = $(".chat-used-context-list.chat-thinking-collapsible");
    if (!this.hasToolItems) {
      this.wrapper.style.display = "none";
    }
    this.materializePendingContent();
    if (this.isActive && !this.isInitiallyComplete && !this.hasToolsWaitingForConfirmation) {
      this.showWorkingSpinner();
    }
    const resizeObserver = this._register(new DisposableResizeObserver("ChatSubagentContentPart.layout", () => this.layoutScheduler.schedule()));
    this._register(resizeObserver.observe(this.wrapper));
    return this.wrapper;
  }
  /**
   * Renders the prompt as a collapsible section at the start of the content.
   * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
   * this is deferred until expanded.
   */
  renderPromptSection() {
    if (!this.prompt || this.promptContainer) {
      return;
    }
    if (!this.wrapper || this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
      this.pendingPromptRender = true;
      return;
    }
    this.pendingPromptRender = false;
    this.doRenderPromptSection();
  }
  doRenderPromptSection() {
    if (!this.prompt || this.promptContainer) {
      return;
    }
    const lines = this.prompt.split("\n");
    const rawFirstLine = lines[0] || localize("chat.subagent.prompt", "Prompt");
    const restOfLines = lines.slice(1).join("\n").trim();
    const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
    const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
    const title = wasTruncated ? titleContent + "\u2026" : titleContent;
    const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : "";
    const content = titleRemainder ? titleRemainder + (restOfLines ? "\n" + restOfLines : "") : restOfLines || this.prompt;
    const collapsiblePart = this._register(this.instantiationService.createInstance(
      ChatCollapsibleMarkdownContentPart,
      title,
      content,
      this.context,
      this.chatContentMarkdownRenderer
    ));
    this.promptContainer = $(".chat-thinking-tool-wrapper.chat-subagent-section");
    const promptIcon = createThinkingIcon(Codicon.comment);
    this.promptContainer.appendChild(promptIcon);
    this.promptContainer.appendChild(collapsiblePart.domNode);
    if (this.wrapper) {
      if (this.wrapper.firstChild) {
        this.wrapper.insertBefore(this.promptContainer, this.wrapper.firstChild);
      } else {
        dom.append(this.wrapper, this.promptContainer);
      }
      if (this.wrapper.style.display === "none") {
        this.wrapper.style.display = "";
      }
    }
  }
  getIsActive() {
    return this.isActive;
  }
  shouldRemainActive() {
    return this.isExternallyActive;
  }
  get hasToolsWaitingForConfirmation() {
    return this.toolsWaitingForConfirmation > 0;
  }
  beginToolPresentationBatch() {
    this._toolPresentationBatchDepth++;
  }
  endToolPresentationBatch() {
    if (this._toolPresentationBatchDepth === 0) {
      return;
    }
    this._toolPresentationBatchDepth--;
    if (this._toolPresentationBatchDepth === 0 && this._toolPresentationDirty) {
      this._toolPresentationDirty = false;
      this._updateToolPresentation();
    }
  }
  _updateToolPresentation() {
    if (this._toolPresentationBatchDepth > 0) {
      this._toolPresentationDirty = true;
      return;
    }
    this._updateOpenChatToolbarContext();
    this.updateTitle();
  }
  /** Routes this subagent's initial confirmations to the input carousel. */
  enableCarouselMode(navigateToCarousel, addToolToCarousel, shouldUseCarouselForTool, onDidChangeActiveSubagent) {
    this._useCarouselForConfirmations = true;
    this._navigateToCarousel = navigateToCarousel;
    this._addToolToCarousel = addToolToCarousel;
    this._shouldUseCarouselForTool = shouldUseCarouselForTool;
    this._activeConfirmationTracker.value = onDidChangeActiveSubagent?.((id) => this.setConfirmationActive(id === this.subAgentInvocationId));
  }
  getChatResource() {
    return this._getChatResource();
  }
  setConfirmationActive(active) {
    if (active !== this._confirmationActive) {
      this._confirmationActive = active;
      this._updateOpenChatToolbarContext();
    }
  }
  getAgentLabel() {
    if (this.agentName) {
      return this.agentName;
    }
    if (!this._isDefaultDescription && this.description) {
      return this.description;
    }
    return localize("chat.subagent.prefix", "Subagent");
  }
  markAsInactive(force = false) {
    if (force && this._subagentToolInvocation.toolSpecificData?.kind === "subagent") {
      const data = this._subagentToolInvocation.toolSpecificData;
      data.isActive = false;
      if (data.duration === void 0 && data.startedAt !== void 0) {
        data.duration = Math.max(0, Date.now() - data.startedAt);
      }
    }
    this.isActive = false;
    this._updateOpenChatToolbarContext();
    this.domNode.classList.remove("chat-thinking-active");
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
    this.removeWorkingSpinner();
    this.hideConfirmationPlaceholder();
    if (this._isDefaultDescription) {
      this.description = localize("chat.subagent.completedDefaultDescription", "Ran subagent");
    }
    this.finalizeTitle();
    this.setExpanded(false);
    this.setContentAnimationEnabled(true);
  }
  markAsActive() {
    if (this.isActive) {
      return;
    }
    this.isActive = true;
    this.setContentAnimationEnabled(false);
    this.domNode.classList.add("chat-thinking-active");
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.circleFilled;
    }
    if (this.wrapper && !this.hasToolsWaitingForConfirmation) {
      this.showWorkingSpinner();
    }
    this._updateOpenChatToolbarContext();
    this.updateTitle();
  }
  refreshActiveStateFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    this._updateOpenChatToolbarContext();
    if (toolInvocation.toolSpecificData.isActive === void 0) {
      return;
    }
    this.isExternallyActive = toolInvocation.toolSpecificData.isActive;
    if (toolInvocation.toolSpecificData.isActive) {
      this.markAsActive();
    } else {
      this.markAsInactive();
    }
  }
  finalizeTitle() {
    this.updateTitle();
    if (this._collapseButton) {
      this._collapseButton.icon = Codicon.check;
    }
  }
  updateTitle() {
    const rawName = this.agentName || localize("chat.subagent.prefix", "Subagent");
    const prefix = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const shimmerText = `${prefix}: ${this.description}`;
    const toolCallText = this.currentRunningToolMessage && this.isActive ? ` \u2014 ${this.currentRunningToolMessage}` : ``;
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    if (!this.isActive) {
      labelElement.textContent = "";
      this.titleShimmerSpan = void 0;
      this._titleDetailRendered.clear();
      this._titleFileWidgetStore.clear();
      this.titleDetailContainer = void 0;
      const prefixSpan = $("span");
      prefixSpan.textContent = `${prefix}:`;
      labelElement.appendChild(prefixSpan);
      const descSpan = $("span.chat-thinking-title-detail-text");
      descSpan.textContent = ` ${this.description}`;
      labelElement.appendChild(descSpan);
      this._collapseButton.element.ariaLabel = shimmerText;
      this._collapseButton.element.ariaExpanded = String(this.isExpanded());
      return;
    }
    if (!this.titleShimmerSpan || !this.titleShimmerSpan.parentElement) {
      labelElement.textContent = "";
      this.titleShimmerSpan = $("span.chat-thinking-title-shimmer");
      labelElement.appendChild(this.titleShimmerSpan);
    }
    this.titleShimmerSpan.textContent = shimmerText;
    this._titleDetailRendered.clear();
    this._titleFileWidgetStore.clear();
    if (!toolCallText) {
      if (this.titleDetailContainer) {
        this.titleDetailContainer.remove();
        this.titleDetailContainer = void 0;
      }
    } else {
      const result = this.chatContentMarkdownRenderer.render(new MarkdownString(toolCallText));
      result.element.classList.add("collapsible-title-content", "chat-thinking-title-detail");
      renderFileWidgets(result.element, this.instantiationService, this.chatMarkdownAnchorService, this._titleFileWidgetStore);
      this._titleDetailRendered.value = result;
      if (this.titleDetailContainer) {
        this.titleDetailContainer.replaceWith(result.element);
      } else {
        labelElement.appendChild(result.element);
      }
      this.titleDetailContainer = result.element;
    }
    const fullLabel = `${shimmerText}${toolCallText}`;
    this._collapseButton.element.ariaLabel = fullLabel;
    this._collapseButton.element.ariaExpanded = String(this.isExpanded());
  }
  updateHover() {
    if (!this._collapseButton) {
      return;
    }
    const parts = [];
    if (this.modelName) {
      parts.push(localize("chat.subagent.modelTooltip", "Model: {0}", this.modelName));
    }
    if (typeof this.credits === "number" && this.credits > 0) {
      const formatted = formatCopilotCredits(this.credits);
      parts.push(formatted === "1" ? localize("chat.subagent.creditTooltip", "{0} credit", formatted) : localize("chat.subagent.creditsTooltip", "{0} credits", formatted));
    }
    if (parts.length === 0) {
      this._hoverDisposable.clear();
      return;
    }
    this._hoverDisposable.value = this.hoverService.setupDelayedHover(this._collapseButton.element, {
      content: parts.join(" \u2022 ")
    });
  }
  /**
   * Re-reads the subagent's credit (AIC) usage from `toolSpecificData` and
   * refreshes the hover tooltip when it has changed. Credits can arrive
   * incrementally while the subagent runs and continue updating until its
   * child turns report their final usage.
   */
  refreshCreditsFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    const credits = toolInvocation.toolSpecificData.credits;
    if (typeof credits === "number" && credits !== this.credits) {
      this.credits = credits;
      this.updateHover();
    }
  }
  /**
   * Re-reads the subagent's model name from `toolSpecificData` and refreshes
   * the hover when it changes. The model can arrive incrementally (e.g. agent
   * host subagents report it via their child turns' usage events).
   */
  refreshModelFromToolData(toolInvocation) {
    if (toolInvocation.toolSpecificData?.kind !== "subagent") {
      return;
    }
    const modelName = toolInvocation.toolSpecificData.modelName;
    if (modelName && modelName !== this.modelName) {
      this.modelName = modelName;
      this.updateHover();
      this._updateOpenChatToolbarContext();
    }
  }
  getToolLabel(toolInvocation, state = toolInvocation.state.get()) {
    if (state.type === IChatToolInvocation.StateKind.Streaming) {
      return void 0;
    }
    if (toolInvocation.toolSpecificData?.kind === "terminal" && !isLegacyChatTerminalToolInvocationData(toolInvocation.toolSpecificData)) {
      const intention = toolInvocation.toolSpecificData.intention?.replace(/\s+/g, " ").trim();
      if (intention) {
        return intention;
      }
    }
    const message = toolInvocation.invocationMessage;
    const messageText = typeof message === "string" ? message : message.value;
    const label = messageText.replace(/\s+/g, " ").trim();
    if (!label) {
      return void 0;
    }
    const toolIdWords = toolInvocation.toolId.replace(/([a-z\d])([A-Z])/g, "$1 $2").split(/[^a-zA-Z\d]+/).filter(Boolean);
    const normalizedLabel = label.toLocaleLowerCase();
    const genericLabels = [toolIdWords[0], toolIdWords.join(" ")].filter((candidate) => !!candidate).map((candidate) => candidate.toLocaleLowerCase());
    return genericLabels.includes(normalizedLabel) ? void 0 : label;
  }
  /**
   * Tracks a tool invocation's state for:
   * 1. Updating the title with the current tool message (persists even after completion)
   * 2. Auto-expanding when a tool is waiting for confirmation
   * 3. Auto-collapsing when the confirmation is addressed
   * This method is public to support testing.
   */
  trackToolState(toolInvocation) {
    if (toolInvocation.kind !== "toolInvocation") {
      return;
    }
    const initialState = toolInvocation.state.get();
    let wasStreamingForPresentation = initialState.type === IChatToolInvocation.StateKind.Streaming;
    if (!wasStreamingForPresentation) {
      this.currentRunningToolCallId = toolInvocation.toolCallId;
      this.currentRunningToolMessage = this.getToolLabel(toolInvocation, initialState);
      this.currentRunningToolIcon = this.currentRunningToolMessage ? getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon) : void 0;
      this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, initialState);
      this._updateToolPresentation();
    }
    if (initialState.type === IChatToolInvocation.StateKind.Completed || initialState.type === IChatToolInvocation.StateKind.Cancelled) {
      return;
    }
    const addToolToCarousel = this._addToolToCarousel;
    const shouldUseCarouselForTool = this._shouldUseCarouselForTool;
    let wasWaitingForConfirmation = false;
    let wasWaitingForCarouselConfirmation = false;
    const toolStateAutorun = autorun((r) => {
      const state = toolInvocation.state.read(r);
      if (wasStreamingForPresentation && state.type !== IChatToolInvocation.StateKind.Streaming) {
        wasStreamingForPresentation = false;
        this.currentRunningToolCallId = toolInvocation.toolCallId;
        this.currentRunningToolMessage = this.getToolLabel(toolInvocation, state);
        this.currentRunningToolIcon = this.currentRunningToolMessage ? getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon) : void 0;
        this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, state);
        this._updateToolPresentation();
      }
      if (this.currentRunningToolCallId === toolInvocation.toolCallId) {
        const toolLabel = this.getToolLabel(toolInvocation, state);
        if (toolLabel && toolLabel !== this.currentRunningToolMessage) {
          this.currentRunningToolMessage = toolLabel;
          this.currentRunningToolIcon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon);
          this.updateActiveToolPresentation(toolInvocation.toolCallId, this.currentRunningToolMessage, this.currentRunningToolIcon, state);
          this._updateToolPresentation();
        }
      }
      const isWaitingForConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval || state.type === IChatToolInvocation.StateKind.WaitingForAuthentication;
      const isWaitingForCarouselConfirmation = !!addToolToCarousel && shouldUseCarouselForTool?.(toolInvocation, state) === true;
      if (isWaitingForConfirmation && !wasWaitingForConfirmation) {
        this.toolsWaitingForConfirmation++;
        if (!this.isExpanded()) {
          this.autoExpandedForConfirmation = true;
          this.setExpanded(true);
        }
        this.removeWorkingSpinner();
      } else if (!isWaitingForConfirmation && wasWaitingForConfirmation) {
        this.toolsWaitingForConfirmation--;
        if (this.toolsWaitingForConfirmation === 0 && this.autoExpandedForConfirmation && !this.userManuallyExpanded) {
          this.autoExpandedForConfirmation = false;
          this.setExpanded(false);
        }
        if (this.toolsWaitingForConfirmation === 0 && this.isActive) {
          this.showWorkingSpinner();
        }
      }
      if (isWaitingForCarouselConfirmation && !wasWaitingForCarouselConfirmation) {
        this.toolsWaitingForCarouselConfirmation++;
        this._updateToolPresentation();
        addToolToCarousel(toolInvocation);
        this.showConfirmationPlaceholder();
      } else if (!isWaitingForCarouselConfirmation && wasWaitingForCarouselConfirmation) {
        this.toolsWaitingForCarouselConfirmation--;
        this._updateToolPresentation();
        if (this.toolsWaitingForCarouselConfirmation === 0) {
          this.hideConfirmationPlaceholder();
        } else {
          this.updateConfirmationPlaceholderLabel();
        }
      }
      wasWaitingForConfirmation = isWaitingForConfirmation;
      wasWaitingForCarouselConfirmation = isWaitingForCarouselConfirmation;
      if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
        if (this.activeToolPresentations.delete(toolInvocation.toolCallId)) {
          this._updateToolPresentation();
        }
        queueMicrotask(() => this._toolStateTracking.delete(toolStateAutorun));
      }
    });
    this._toolStateTracking.add(toolStateAutorun);
  }
  updateActiveToolPresentation(toolCallId, label, icon, state) {
    this.activeToolPresentations.delete(toolCallId);
    if (label && icon) {
      this.mostRecentToolPresentation = { callId: toolCallId, label, icon };
    }
    if (label && icon && state.type !== IChatToolInvocation.StateKind.Completed && state.type !== IChatToolInvocation.StateKind.Cancelled) {
      this.activeToolPresentations.set(toolCallId, { label, icon });
    }
  }
  getConfirmationPlaceholderText() {
    const count = this.toolsWaitingForCarouselConfirmation;
    return count === 1 ? localize("chat.subagent.pendingConfirmation", "1 pending confirmation") : localize("chat.subagent.pendingConfirmations", "{0} pending confirmations", count);
  }
  updateConfirmationPlaceholderLabel() {
    if (this._confirmationPlaceholderLabel) {
      this._confirmationPlaceholderLabel.textContent = this.getConfirmationPlaceholderText();
    }
  }
  /** Shows a placeholder that jumps back to the carousel. */
  showConfirmationPlaceholder() {
    if (this._confirmationPlaceholder) {
      this.updateConfirmationPlaceholderLabel();
      return;
    }
    const placeholder = $("button.chat-subagent-confirmation-placeholder");
    const label = $("span.chat-subagent-placeholder-label");
    label.textContent = this.getConfirmationPlaceholderText();
    placeholder.appendChild(label);
    this._confirmationPlaceholder = placeholder;
    this._confirmationPlaceholderLabel = label;
    const placeholderDisposables = new DisposableStore();
    placeholderDisposables.add(dom.addDisposableListener(placeholder, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._navigateToCarousel?.(this.subAgentInvocationId);
    }));
    this._confirmationPlaceholderDisposable.value = placeholderDisposables;
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    if (!this.isExpanded()) {
      this.autoExpandedForConfirmation = true;
      this.setExpanded(true);
    }
    if (this.wrapper) {
      this.wrapper.appendChild(placeholder);
    }
    this.layoutScheduler.schedule();
  }
  hideConfirmationPlaceholder() {
    if (this._confirmationPlaceholder) {
      this._confirmationPlaceholder.remove();
      this._confirmationPlaceholder = void 0;
      this._confirmationPlaceholderLabel = void 0;
      this._confirmationPlaceholderDisposable.clear();
      this.layoutScheduler.schedule();
    }
  }
  /** Keeps the carousel placeholder after visible tool output. */
  ensurePlaceholderAtBottom() {
    if (this._confirmationPlaceholder?.parentElement === this.wrapper) {
      this.wrapper.appendChild(this._confirmationPlaceholder);
    }
  }
  /**
   * Watches the tool invocation for completion and renders the result.
   * Handles both live and serialized invocations.
   */
  watchToolCompletion(toolInvocation) {
    if (!ChatSubagentContentPart.isParentSubagentTool(toolInvocation)) {
      return;
    }
    if (toolInvocation.kind === "toolInvocation") {
      let wasStreaming = toolInvocation.state.get().type === IChatToolInvocation.StateKind.Streaming;
      this._register(autorun((r) => {
        const state = toolInvocation.state.read(r);
        this.refreshActiveStateFromToolData(toolInvocation);
        this.refreshActivityFromToolData(toolInvocation);
        if (state.type === IChatToolInvocation.StateKind.Completed) {
          wasStreaming = false;
          const textParts = (state.contentForModel || []).filter((part) => part.kind === "text").map((part) => part.value);
          if (textParts.length > 0) {
            this.renderResultText(textParts.join("\n"));
          }
          if (toolInvocation.toolSpecificData?.kind === "subagent") {
            if (toolInvocation.toolSpecificData.description) {
              this.description = toolInvocation.toolSpecificData.description;
              this._isDefaultDescription = false;
            }
            if (toolInvocation.toolSpecificData.modelName) {
              this.modelName = toolInvocation.toolSpecificData.modelName;
              this.updateHover();
              this._updateOpenChatToolbarContext();
            }
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this._updateOpenChatLink();
          if (!this.isExternallyActive) {
            this.markAsInactive();
          }
        } else if (wasStreaming && state.type !== IChatToolInvocation.StateKind.Streaming) {
          wasStreaming = false;
          const { description, isDefaultDescription, agentName, prompt, modelName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
          this.description = description;
          this._isDefaultDescription = isDefaultDescription;
          this.agentName = agentName;
          this.prompt = prompt;
          if (modelName) {
            this.modelName = modelName;
            this.updateHover();
            this._updateOpenChatToolbarContext();
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this.renderPromptSection();
          this.updateTitle();
        } else if (toolInvocation.toolSpecificData?.kind === "subagent") {
          const { description, isDefaultDescription, agentName } = ChatSubagentContentPart.extractSubagentInfo(toolInvocation);
          const descriptionChanged = this._isDefaultDescription && !isDefaultDescription;
          const agentNameChanged = !!agentName && agentName !== this.agentName;
          if (descriptionChanged || agentNameChanged) {
            if (descriptionChanged) {
              this.description = description;
              this._isDefaultDescription = isDefaultDescription;
            }
            if (agentNameChanged) {
              this.agentName = agentName;
            }
            this.updateTitle();
          }
          this.refreshCreditsFromToolData(toolInvocation);
          this.refreshModelFromToolData(toolInvocation);
          this._updateOpenChatLink();
        }
      }));
    } else if (toolInvocation.toolSpecificData?.kind === "subagent" && toolInvocation.toolSpecificData.result) {
      this.renderResultText(toolInvocation.toolSpecificData.result);
      this.markAsInactive();
    }
  }
  refreshActivityFromToolData(toolInvocation) {
    const activity = toolInvocation.toolSpecificData?.kind === "subagent" ? toolInvocation.toolSpecificData.activity : void 0;
    if (activity !== this.subagentActivity) {
      this.subagentActivity = activity;
      this._updateOpenChatToolbarContext();
    }
  }
  /**
   * Renders the result text as a collapsible section.
   * If the wrapper doesn't exist yet (lazy init) or subagent is initially complete,
   * this is deferred until expanded.
   */
  renderResultText(resultText) {
    if (this.resultContainer || !resultText) {
      return;
    }
    if (!this.wrapper || this.isInitiallyComplete && !this.isExpanded() && !this.hasExpandedOnce) {
      this.pendingResultText = resultText;
      return;
    }
    this.pendingResultText = void 0;
    this.doRenderResultText(resultText);
  }
  doRenderResultText(resultText) {
    if (this.resultContainer || !resultText) {
      return;
    }
    const lines = resultText.split("\n");
    const rawFirstLine = lines[0] || "";
    const restOfLines = lines.slice(1).join("\n").trim();
    const titleContent = rcut(rawFirstLine, MAX_TITLE_LENGTH);
    const wasTruncated = rawFirstLine.length > MAX_TITLE_LENGTH;
    const title = wasTruncated ? titleContent + "\u2026" : titleContent;
    const titleRemainder = rawFirstLine.length > titleContent.length ? rawFirstLine.slice(titleContent.length).trim() : "";
    const content = titleRemainder ? titleRemainder + (restOfLines ? "\n" + restOfLines : "") : restOfLines;
    const collapsiblePart = this._register(this.instantiationService.createInstance(
      ChatCollapsibleMarkdownContentPart,
      title,
      content,
      this.context,
      this.chatContentMarkdownRenderer
    ));
    this.resultContainer = $(".chat-thinking-tool-wrapper.chat-subagent-section");
    const resultIcon = createThinkingIcon(Codicon.check);
    this.resultContainer.appendChild(resultIcon);
    this.resultContainer.appendChild(collapsiblePart.domNode);
    if (this.wrapper) {
      dom.append(this.wrapper, this.resultContainer);
      if (this.wrapper.style.display === "none") {
        this.wrapper.style.display = "";
      }
    }
  }
  /**
   * Appends a tool invocation to the subagent group.
   * The tool part is created lazily - only when the subagent section is expanded,
   * unless it's actively streaming (not initially complete), in which case render immediately.
   */
  appendToolInvocation(toolInvocation, codeBlockStartIndex) {
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    this.trackToolState(toolInvocation);
    if (this.isExpanded() || this.hasExpandedOnce) {
      const part = this.createToolPart(toolInvocation, codeBlockStartIndex);
      this.appendToolPartToDOM(part, toolInvocation);
    } else {
      const item = {
        kind: "tool",
        lazy: new Lazy(() => this.createToolPart(toolInvocation, codeBlockStartIndex)),
        toolInvocation,
        codeBlockStartIndex
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a markdown item (e.g., an edit pill) to the subagent content part.
   * This is used to route codeblockUri parts with subAgentInvocationId to this subagent's container.
   *
   * When the caller has already created the content part eagerly (for example, a
   * pre-built `ChatMarkdownContentPart` wrapped in a factory), the caller MUST pass
   * that part as `eagerDisposable` so it is registered on this subagent part
   * immediately. Otherwise, if the subagent section is collapsed and the lazy item
   * is never materialized, the eagerly-created part would leak.
   */
  appendMarkdownItem(factory, _codeblocksPartId, _markdown, _originalParent, eagerDisposable) {
    if (eagerDisposable) {
      this._register(eagerDisposable);
    }
    if (this.isExpanded() || this.hasExpandedOnce) {
      const result = factory();
      this.appendMarkdownItemToDOM(result.domNode);
      if (result.disposable && result.disposable !== eagerDisposable) {
        this._register(result.disposable);
      }
    } else {
      const item = {
        kind: "markdown",
        lazy: new Lazy(factory),
        eagerlyRegistered: !!eagerDisposable
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a hook item (blocked/warning) to the subagent content part.
   */
  appendHookItem(factory, hookPart) {
    const hookMessage = hookPart.stopReason ? hookPart.toolDisplayName ? localize("hook.subagent.blocked", "Blocked {0}", hookPart.toolDisplayName) : localize("hook.subagent.blockedGeneric", "Blocked by hook") : hookPart.toolDisplayName ? localize("hook.subagent.warning", "Warning for {0}", hookPart.toolDisplayName) : localize("hook.subagent.warningGeneric", "Hook warning");
    this.currentRunningToolMessage = hookMessage;
    this.currentRunningToolCallId = void 0;
    this.currentRunningToolIcon = hookPart.stopReason ? Codicon.error : Codicon.warning;
    this._updateToolPresentation();
    if (this.isExpanded() || this.hasExpandedOnce) {
      const result = factory();
      this.appendHookItemToDOM(result.domNode, hookPart);
      if (result.disposable) {
        this._register(result.disposable);
      }
    } else {
      const item = {
        kind: "hook",
        lazy: new Lazy(factory),
        hookPart
      };
      this.lazyItems.push(item);
    }
  }
  /**
   * Appends a hook item's DOM node to the wrapper.
   */
  appendHookItemToDOM(domNode, hookPart) {
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const icon = hookPart.stopReason ? Codicon.error : Codicon.warning;
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(iconElement);
    itemWrapper.appendChild(domNode);
    if (!this.hasToolItems) {
      this.hasToolItems = true;
      if (this.wrapper) {
        this.wrapper.style.display = "";
      }
    }
    if (this.wrapper) {
      if (this.resultContainer) {
        this.wrapper.insertBefore(itemWrapper, this.resultContainer);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  /**
   * Appends a markdown item's DOM node to the wrapper.
   */
  appendMarkdownItemToDOM(domNode) {
    if (!domNode.hasChildNodes() || domNode.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const iconElement = createThinkingIcon(Codicon.edit);
    itemWrapper.appendChild(domNode);
    itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
    if (this.wrapper) {
      if (this.resultContainer) {
        this.wrapper.insertBefore(itemWrapper, this.resultContainer);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  shouldInitEarly() {
    return false;
  }
  shouldAnimateContent() {
    return !this.isActive;
  }
  shouldPrepareContentAnimation() {
    return true;
  }
  /**
   * Creates a ChatToolInvocationPart for the given tool invocation.
   */
  createToolPart(toolInvocation, codeBlockStartIndex) {
    const part = this.instantiationService.createInstance(
      ChatToolInvocationPart,
      toolInvocation,
      this.context,
      this.chatContentMarkdownRenderer,
      this.listPool,
      this.editorPool,
      this.currentWidthDelegate,
      this.announcedToolProgressKeys,
      codeBlockStartIndex
    );
    this._register(part);
    return part;
  }
  /**
   * Appends a tool part's DOM node to the wrapper with appropriate icon wrapper.
   */
  appendToolPartToDOM(part, toolInvocation) {
    const content = part.domNode;
    if (!content.hasChildNodes() || content.textContent?.trim() === "") {
      return;
    }
    const itemWrapper = $(".chat-thinking-tool-wrapper");
    const icon = getToolInvocationIcon(toolInvocation.toolId, toolInvocation.icon);
    const iconElement = createThinkingIcon(icon);
    itemWrapper.appendChild(content);
    if (toolInvocation.kind === "toolInvocation") {
      const shouldUseCarouselForTool = this._shouldUseCarouselForTool;
      const iconAutorun = autorun((r) => {
        const state = toolInvocation.state.read(r);
        const hasConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval;
        const shouldHideInline = shouldUseCarouselForTool?.(toolInvocation, state) === true;
        if (hasConfirmation) {
          iconElement.remove();
          if (shouldHideInline) {
            itemWrapper.style.display = "none";
          } else {
            itemWrapper.style.display = "";
          }
        } else {
          if (!iconElement.parentElement) {
            itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
          }
          if (this._useCarouselForConfirmations) {
            itemWrapper.style.display = "";
            this.ensurePlaceholderAtBottom();
          }
        }
        if (state.type === IChatToolInvocation.StateKind.Completed || state.type === IChatToolInvocation.StateKind.Cancelled) {
          queueMicrotask(() => this._toolStateTracking.delete(iconAutorun));
        }
      });
      this._toolStateTracking.add(iconAutorun);
    } else {
      itemWrapper.insertBefore(iconElement, itemWrapper.firstChild);
    }
    if (this.wrapper) {
      const anchor = this._confirmationPlaceholder ?? this.workingSpinnerElement ?? this.resultContainer;
      if (anchor) {
        this.wrapper.insertBefore(itemWrapper, anchor);
      } else {
        this.wrapper.appendChild(itemWrapper);
      }
    }
    this.lastItemWrapper = itemWrapper;
    this.layoutScheduler.schedule();
  }
  /**
   * Materializes a lazy item by creating the content and adding it to the DOM.
   */
  materializeLazyItem(item) {
    if (item.lazy.hasValue) {
      return;
    }
    if (item.kind === "tool") {
      const part = item.lazy.value;
      this.appendToolPartToDOM(part, item.toolInvocation);
    } else if (item.kind === "markdown") {
      const result = item.lazy.value;
      this.appendMarkdownItemToDOM(result.domNode);
      if (result.disposable && !item.eagerlyRegistered) {
        this._register(result.disposable);
      }
    } else if (item.kind === "hook") {
      const result = item.lazy.value;
      this.appendHookItemToDOM(result.domNode, item.hookPart);
      if (result.disposable) {
        this._register(result.disposable);
      }
    }
  }
  /**
   * Materializes all pending lazy content (prompt, tool items, result) when the section is expanded.
   * This is called when first expanded, but the wrapper must exist (created by base class initContent).
   */
  materializePendingContent() {
    if (!this.wrapper) {
      return;
    }
    if (this.pendingPromptRender) {
      this.pendingPromptRender = false;
      this.doRenderPromptSection();
    }
    for (const item of this.lazyItems) {
      this.materializeLazyItem(item);
    }
    if (this.pendingResultText) {
      const resultText = this.pendingResultText;
      this.pendingResultText = void 0;
      this.doRenderResultText(resultText);
    }
  }
  performLayout() {
    if (this.lastItemWrapper && this.wrapper) {
      const height = this.lastItemWrapper.offsetHeight;
      if (height > 0) {
        this.wrapper.style.setProperty("--chat-subagent-last-item-height", `${height}px`);
      }
    }
    if (this.isActive && !this.isInitiallyComplete && this.wrapper) {
      const scrollHeight = this.wrapper.scrollHeight;
      this.wrapper.scrollTop = scrollHeight;
    }
  }
  hasSameContent(other, _followingContent, _element) {
    return (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && ChatSubagentContentPart.isParentSubagentTool(other) && this.subAgentInvocationId === other.toolCallId;
  }
};
ChatSubagentContentPart = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IChatMarkdownAnchorService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IAccessibilityService),
  __decorateParam(13, IActionViewItemService),
  __decorateParam(14, IMenuService),
  __decorateParam(15, IContextKeyService),
  __decorateParam(16, IWorkbenchEnvironmentService)
], ChatSubagentContentPart);
export {
  ChatSubagentContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFN1YmFnZW50Q29udGVudFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyAkLCBBbmltYXRpb25GcmFtZVNjaGVkdWxlciwgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyByY3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZm9ybWF0Q29waWxvdENyZWRpdHMsIElDaGF0SG9va1BhcnQsIElDaGF0TWFya2Rvd25Db250ZW50LCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgaXNMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRSZW5kZXJlckNvbnRlbnQsIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElSdW5TdWJhZ2VudFRvb2xJbnB1dFBhcmFtcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9idWlsdGluVG9vbHMvcnVuU3ViYWdlbnRUb29sLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZU1hcmtkb3duQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb2xsYXBzaWJsZU1hcmtkb3duQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgcmVuZGVyRmlsZVdpZGdldHMgfSBmcm9tICcuL2NoYXRJbmxpbmVBbmNob3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgfSBmcm9tICcuL2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2libGVMaXN0UG9vbCB9IGZyb20gJy4vY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBidWlsZFBocmFzZVBvb2wsIGNyZWF0ZVRoaW5raW5nSWNvbiwgZ2V0VG9vbEludm9jYXRpb25JY29uIH0gZnJvbSAnLi9jaGF0VGhpbmtpbmdDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IH0gZnJvbSAnLi90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblBhcnQuanMnO1xuaW1wb3J0ICcuL21lZGlhL2NoYXRTdWJhZ2VudENvbnRlbnQuY3NzJztcblxuY29uc3QgTUFYX1RJVExFX0xFTkdUSCA9IDEwMDtcblxuY29uc3Qgc3ViYWdlbnRXb3JraW5nTWVzc2FnZXMgPSBbXG5cdGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LndvcmtpbmcuMScsICdQcm9jZXNzaW5nJyksXG5cdGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LndvcmtpbmcuMicsICdQcmVwYXJpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2luZy4zJywgJ0xvYWRpbmcnKSxcblx0bG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2luZy40JywgJ0FuYWx5emluZycpLFxuXHRsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC53b3JraW5nLjUnLCAnRXZhbHVhdGluZycpLFxuXTtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgbGF6eSB0b29sIGl0ZW0gdGhhdCB3aWxsIGJlIGNyZWF0ZWQgd2hlbiB0aGUgc3ViYWdlbnQgc2VjdGlvbiBpcyBleHBhbmRlZC5cbiAqL1xuaW50ZXJmYWNlIElMYXp5VG9vbEl0ZW0ge1xuXHRraW5kOiAndG9vbCc7XG5cdGxhenk6IExhenk8Q2hhdFRvb2xJbnZvY2F0aW9uUGFydD47XG5cdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgbGF6eSBtYXJrZG93biBpdGVtIChlLmcuLCBlZGl0IHBpbGwpIHRoYXQgd2lsbCBiZSByZW5kZXJlZCB3aGVuIGV4cGFuZGVkLlxuICovXG5pbnRlcmZhY2UgSUxhenlNYXJrZG93bkl0ZW0ge1xuXHRraW5kOiAnbWFya2Rvd24nO1xuXHRsYXp5OiBMYXp5PHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSB9Pjtcblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY2FsbGVyIHBhc3NlZCBhbiBlYWdlckRpc3Bvc2FibGUgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIHJlZ2lzdGVyZWQgb24gdGhpc1xuXHQgKiBzdWJhZ2VudCBwYXJ0LiBJbiB0aGF0IGNhc2UsIG1hdGVyaWFsaXplTGF6eUl0ZW0gbXVzdCBub3QgcmVnaXN0ZXIgdGhlIGZhY3RvcnkncyByZXR1cm5lZFxuXHQgKiBkaXNwb3NhYmxlIGFnYWluLlxuXHQgKi9cblx0ZWFnZXJseVJlZ2lzdGVyZWQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBsYXp5IGhvb2sgaXRlbSAoYmxvY2tlZC93YXJuaW5nKSB0aGF0IHdpbGwgYmUgcmVuZGVyZWQgd2hlbiBleHBhbmRlZC5cbiAqL1xuaW50ZXJmYWNlIElMYXp5SG9va0l0ZW0ge1xuXHRraW5kOiAnaG9vayc7XG5cdGxhenk6IExhenk8eyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZT86IElEaXNwb3NhYmxlIH0+O1xuXHRob29rUGFydDogSUNoYXRIb29rUGFydDtcbn1cblxudHlwZSBJTGF6eUl0ZW0gPSBJTGF6eVRvb2xJdGVtIHwgSUxhenlNYXJrZG93bkl0ZW0gfCBJTGF6eUhvb2tJdGVtO1xuXG4vKipcbiAqIFRoaXMgaXMgZ2VuZXJhbGx5IGNvcGllZCBmcm9tIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LiBXZSBhcmUgc3RpbGwgZXhwZXJpbWVudGluZyB3aXRoIGJvdGggVUlzIHNvIEknbSBub3RcbiAqIHRyeWluZyB0byByZWZhY3RvciB0byBzaGFyZSBjb2RlLiBCb3RoIGNvdWxkIHByb2JhYmx5IGJlIHNpbXBsaWZpZWQgd2hlbiBzdGFibGUuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0U3ViYWdlbnRDb250ZW50UGFydCBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHByaXZhdGUgd3JhcHBlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuO1xuXHRwcml2YXRlIGlzRXh0ZXJuYWxseUFjdGl2ZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBoYXNUb29sSXRlbXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBpc0luaXRpYWxseUNvbXBsZXRlOiBib29sZWFuO1xuXHRwcml2YXRlIHByb21wdENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVzdWx0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBsYXN0SXRlbVdyYXBwZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxheW91dFNjaGVkdWxlcjogQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXI7XG5cdHByaXZhdGUgZGVzY3JpcHRpb246IHN0cmluZztcblx0cHJpdmF0ZSBhZ2VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcm9tcHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvLyBMYXp5IHJlbmRlcmluZyBzdXBwb3J0XG5cdHByaXZhdGUgcmVhZG9ubHkgbGF6eUl0ZW1zOiBJTGF6eUl0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGhhc0V4cGFuZGVkT25jZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHBlbmRpbmdQcm9tcHRSZW5kZXI6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBwZW5kaW5nUmVzdWx0VGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8vIEN1cnJlbnQgdG9vbCBtZXNzYWdlIGZvciBjb2xsYXBzZWQgdGl0bGUgKHBlcnNpc3RzIGV2ZW4gYWZ0ZXIgdG9vbCBjb21wbGV0ZXMpXG5cdHByaXZhdGUgY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRSdW5uaW5nVG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRSdW5uaW5nVG9vbEljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVUb29sUHJlc2VudGF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IGxhYmVsOiBzdHJpbmc7IGljb246IFRoZW1lSWNvbiB9PigpO1xuXHRwcml2YXRlIG1vc3RSZWNlbnRUb29sUHJlc2VudGF0aW9uOiB7IGNhbGxJZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyBpY29uOiBUaGVtZUljb24gfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdWJhZ2VudEFjdGl2aXR5OiAnbWFya2Rvd24nIHwgJ3JlYXNvbmluZycgfCB1bmRlZmluZWQ7XG5cblx0Ly8gTW9kZWwgbmFtZSB1c2VkIGJ5IHRoaXMgc3ViYWdlbnQgZm9yIGhvdmVyIHRvb2x0aXBcblx0cHJpdmF0ZSBtb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Ly8gQ29waWxvdCBjcmVkaXRzIChBSUMpIGNvbnN1bWVkIGJ5IHRoaXMgc3ViYWdlbnQsIHNob3duIGluIHRoZSBob3ZlciB0b29sdGlwXG5cdHByaXZhdGUgY3JlZGl0czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pc0RlZmF1bHREZXNjcmlwdGlvbjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8vIFRoZSBzdWJhZ2VudCB0b29sIGludm9jYXRpb24sIGtlcHQgc28gdGhlIFwiT3BlbiBTdWJhZ2VudFwiIGFjdGlvbiBjYW4gcmUtcmVhZFxuXHQvLyB0aGUgc3ViYWdlbnQgY2hhdCByZXNvdXJjZSBhcyBpdCBhcnJpdmVzL2NoYW5nZXMuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YmFnZW50VG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0LyoqXG5cdCAqIFRvb2xiYXIgaG9zdGluZyB0aGUgYE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50YCBtZW51IGluIHRoZSBzdWJhZ2VudFxuXHQgKiBoZWFkZXIuIFRoZSBBZ2VudHMgd2luZG93IGNvbnRyaWJ1dGVzIGFuIFwiT3BlbiBTdWJhZ2VudFwiIGFjdGlvbiAocmVuZGVyZWRcblx0ICogYXMgYSBwaWxsKSBpbnRvIHRoaXMgbWVudTsgZWxzZXdoZXJlIHRoZSBtZW51IGlzIGVtcHR5IGFuZCBub3RoaW5nIHNob3dzLlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlbkNoYXRUb29sYmFyOiBXb3JrYmVuY2hUb29sQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vcGVuQ2hhdFRvb2xiYXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuQ2hhdEFjdGlvbkxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuQ2hhdEFjdGlvblZpZXdSZWdpc3RyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Ly8gQ29uZmlybWF0aW9uIGF1dG8tZXhwYW5kIHRyYWNraW5nXG5cdHByaXZhdGUgdG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHVzZXJNYW51YWxseUV4cGFuZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgYXV0b0V4cGFuZGVkRm9yQ29uZmlybWF0aW9uOiBib29sZWFuID0gZmFsc2U7XG5cblx0Ly8gQ2Fyb3VzZWwgY29uZmlybWF0aW9uIHBsYWNlaG9sZGVyXG5cdHByaXZhdGUgX25hdmlnYXRlVG9DYXJvdXNlbDogKChzdWJBZ2VudEludm9jYXRpb25JZDogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWRkVG9vbFRvQ2Fyb3VzZWw6ICgodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nob3VsZFVzZUNhcm91c2VsRm9yVG9vbDogKCh0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZSkgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29uZmlybWF0aW9uUGxhY2Vob2xkZXJMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyRGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlQ29uZmlybWF0aW9uVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfdXNlQ2Fyb3VzZWxGb3JDb25maXJtYXRpb25zOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgdG9vbHNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb246IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXG5cdC8qKiBQZXItdG9vbC1pbnZvY2F0aW9uIGF1dG9ydW5zIG9ic2VydmluZyB0b29sIHN0YXRlOyBlYWNoIGlzIGRpc3Bvc2VkIG9uY2UgaXRzIHRvb2wgcmVhY2hlcyBhIHRlcm1pbmFsIHN0YXRlIHNvIGxpc3RlbmVycyBkb24ndCBhY2N1bXVsYXRlIGZvciB0aGUgd2lkZ2V0J3MgbGlmZXRpbWUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xTdGF0ZVRyYWNraW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfdG9vbFByZXNlbnRhdGlvbkJhdGNoRGVwdGggPSAwO1xuXHRwcml2YXRlIF90b29sUHJlc2VudGF0aW9uRGlydHkgPSBmYWxzZTtcblxuXHQvLyBXb3JraW5nIHNwaW5uZXIgZWxlbWVudHMgZm9yIGV4cGFuZGVkIHN0YXRlXG5cdHByaXZhdGUgd29ya2luZ1NwaW5uZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3b3JraW5nU3Bpbm5lckxhYmVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhdmFpbGFibGVNZXNzYWdlczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0Ly8gUGVyc2lzdGVudCB0aXRsZSBlbGVtZW50cyBmb3Igc2hpbW1lclxuXHRwcml2YXRlIHRpdGxlU2hpbW1lclNwYW46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRpdGxlRGV0YWlsQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVEZXRhaWxSZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVuZGVyZWRNYXJrZG93bj4oKSk7XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIGEgdG9vbCBpbnZvY2F0aW9uIGlzIHRoZSBwYXJlbnQgc3ViYWdlbnQgdG9vbCAodGhlIHRvb2wgdGhhdCBzcGF3bnMgYSBzdWJhZ2VudCkuXG5cdCAqIEEgcGFyZW50IHN1YmFnZW50IHRvb2wgaGFzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgYnV0IG5vIHN1YkFnZW50SW52b2NhdGlvbklkLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgaXNQYXJlbnRTdWJhZ2VudFRvb2wodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmICF0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFeHRyYWN0cyBzdWJhZ2VudCBpbmZvIChkZXNjcmlwdGlvbiwgYWdlbnROYW1lLCBwcm9tcHQpIGZyb20gYSB0b29sIGludm9jYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBleHRyYWN0U3ViYWdlbnRJbmZvKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGlzRGVmYXVsdERlc2NyaXB0aW9uOiBib29sZWFuOyBhZ2VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDsgcHJvbXB0OiBzdHJpbmcgfCB1bmRlZmluZWQ7IG1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBjcmVkaXRzOiBudW1iZXIgfCB1bmRlZmluZWQgfSB7XG5cdFx0Y29uc3QgZGVmYXVsdERlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuZGVmYXVsdERlc2NyaXB0aW9uJywgJ1J1bm5pbmcgc3ViYWdlbnQnKTtcblxuXHRcdC8vIE9ubHkgcGFyZW50IHN1YmFnZW50IHRvb2xzIGNvbnRhaW4gdGhlIGZ1bGwgc3ViYWdlbnQgaW5mb1xuXHRcdGlmICghQ2hhdFN1YmFnZW50Q29udGVudFBhcnQuaXNQYXJlbnRTdWJhZ2VudFRvb2wodG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4geyBkZXNjcmlwdGlvbjogZGVmYXVsdERlc2NyaXB0aW9uLCBpc0RlZmF1bHREZXNjcmlwdGlvbjogdHJ1ZSwgYWdlbnROYW1lOiB1bmRlZmluZWQsIHByb21wdDogdW5kZWZpbmVkLCBtb2RlbE5hbWU6IHVuZGVmaW5lZCwgY3JlZGl0czogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdG9vbFNwZWNpZmljRGF0YSBmaXJzdCAod29ya3MgZm9yIGJvdGggbGl2ZSBhbmQgc2VyaWFsaXplZClcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0Y29uc3QgaGFzRGVzY3JpcHRpb24gPSAhIXRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb247XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5kZXNjcmlwdGlvbiA/PyBkZWZhdWx0RGVzY3JpcHRpb24sXG5cdFx0XHRcdGlzRGVmYXVsdERlc2NyaXB0aW9uOiAhaGFzRGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUsXG5cdFx0XHRcdHByb21wdDogdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5wcm9tcHQsXG5cdFx0XHRcdG1vZGVsTmFtZTogdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUsXG5cdFx0XHRcdGNyZWRpdHM6IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2sgdG8gcGFyYW1ldGVycyBmb3IgbGl2ZSBpbnZvY2F0aW9uc1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0Y29uc3QgcGFyYW1zID0gc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nID9cblx0XHRcdFx0c3RhdGUucGFyYW1ldGVycyBhcyBJUnVuU3ViYWdlbnRUb29sSW5wdXRQYXJhbXMgfCB1bmRlZmluZWRcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBoYXNEZXNjcmlwdGlvbiA9ICEhcGFyYW1zPy5kZXNjcmlwdGlvbjtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBwYXJhbXM/LmRlc2NyaXB0aW9uID8/IGRlZmF1bHREZXNjcmlwdGlvbixcblx0XHRcdFx0aXNEZWZhdWx0RGVzY3JpcHRpb246ICFoYXNEZXNjcmlwdGlvbixcblx0XHRcdFx0YWdlbnROYW1lOiBwYXJhbXM/LmFnZW50TmFtZSxcblx0XHRcdFx0cHJvbXB0OiBwYXJhbXM/LnByb21wdCxcblx0XHRcdFx0bW9kZWxOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNyZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZGVzY3JpcHRpb246IGRlZmF1bHREZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb246IHRydWUsIGFnZW50TmFtZTogdW5kZWZpbmVkLCBwcm9tcHQ6IHVuZGVmaW5lZCwgbW9kZWxOYW1lOiB1bmRlZmluZWQsIGNyZWRpdHM6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0LyoqIFRoZSBzdWJhZ2VudCdzIG93biBjaGF0IHJlc291cmNlIChVUkkgc3RyaW5nKSwgd2hlbiBpdCBydW5zIGFzIGEgZGlzdGluY3QgY2hhdC4gKi9cblx0cHJpdmF0ZSBfZ2V0Q2hhdFJlc291cmNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3N1YmFnZW50VG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRyZXR1cm4gZGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IGRhdGEuY2hhdFJlc291cmNlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgKG9uY2UpIGFuZCB0b2dnbGVzIHRoZSBzdWJhZ2VudCBoZWFkZXIgdG9vbGJhciB0aGF0IGhvc3RzIHRoZVxuXHQgKiBgTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnRgIG1lbnUuIFRoZSBBZ2VudHMgd2luZG93IGNvbnRyaWJ1dGVzIGFuIFwiT3BlblxuXHQgKiBTdWJhZ2VudFwiIHBpbGwgaW50byB0aGF0IG1lbnUgdG8gcmV2ZWFsIHRoZSBzdWJhZ2VudCdzIG93biAocmVhZC1vbmx5KVxuXHQgKiBjaGF0OyBpbiB0aGUgcmVndWxhciBjaGF0IHZpZXcgdGhlIG1lbnUgaXMgZW1wdHkgYW5kIG5vdGhpbmcgcmVuZGVycy4gVGhlXG5cdCAqIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgY2FuIGFycml2ZSBhZnRlciB0aGUgcGFydCBpcyBmaXJzdCBjb25zdHJ1Y3RlZCwgc29cblx0ICogdGhpcyBpcyBhbHNvIGNhbGxlZCBmcm9tIHRoZSB0b29sLWNvbXBsZXRpb24gYXV0b3J1bi5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZU9wZW5DaGF0TGluaygpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX3Nob3VsZFVzZU9wZW5DaGF0UHJlc2VudGF0aW9uKCkgPyB0aGlzLl9nZXRDaGF0UmVzb3VyY2UoKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1oYXMtY2hhdCcsICEhcmVzb3VyY2UpO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0T25seU1vZGUoKTtcblx0XHRpZiAoIXRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFdoZW4gdGhlIHN1YmFnZW50IGhhcyBpdHMgb3duIG9wZW5hYmxlIGNoYXQsIGtlZXAgdGhlIGlubGluZSBibG9ja1xuXHRcdC8vIGNvbGxhcHNlZCB0byBqdXN0IHRoZSBoZWFkZXIgKyBcIk9wZW4gU3ViYWdlbnRcIiBwaWxsIFx1MjAxNCB0aGUgZnVsbCB0cmFuc2NyaXB0XG5cdFx0Ly8gbGl2ZXMgaW4gdGhlIGRlZGljYXRlZCByZWFkLW9ubHkgY2hhdC4gVG9nZ2xlIGEgY2xhc3MgdGhlIENTUyB1c2VzIHRvXG5cdFx0Ly8gc3VwcHJlc3MgdGhlIGNvbGxhcHNlZCBzdHJlYW1pbmcgcGVlay5cblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9vcGVuQ2hhdFRvb2xiYXJDb250YWluZXI/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRPbmx5TW9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2Vuc3VyZU9wZW5DaGF0VG9vbGJhcigpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHR0aGlzLl9vcGVuQ2hhdFRvb2xiYXJDb250YWluZXIhLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGRlbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlT3BlbkNoYXRUb29sYmFyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9vcGVuQ2hhdFRvb2xiYXIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBtZW51QWN0aW9uID0gdGhpcy5fZ2V0T3BlbkNoYXRNZW51QWN0aW9uKCk7XG5cdFx0aWYgKCFtZW51QWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIgPSB0aGlzLmFjdGlvblZpZXdJdGVtU2VydmljZS5sb29rVXAoTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQsIENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCk7XG5cdFx0aWYgKCFhY3Rpb25WaWV3SXRlbVByb3ZpZGVyKSB7XG5cdFx0XHRpZiAoIXRoaXMuX29wZW5DaGF0QWN0aW9uVmlld1JlZ2lzdHJhdGlvbi52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLl9vcGVuQ2hhdEFjdGlvblZpZXdSZWdpc3RyYXRpb24udmFsdWUgPSBFdmVudC5vbmNlKEV2ZW50LmZpbHRlcihcblx0XHRcdFx0XHR0aGlzLmFjdGlvblZpZXdJdGVtU2VydmljZS5vbkRpZENoYW5nZSxcblx0XHRcdFx0XHRtZW51SWQgPT4gbWVudUlkID09PSBNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudFxuXHRcdFx0XHQpKSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fb3BlbkNoYXRBY3Rpb25WaWV3UmVnaXN0cmF0aW9uLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRMaW5rKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX29wZW5DaGF0QWN0aW9uVmlld1JlZ2lzdHJhdGlvbi5jbGVhcigpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy5jaGF0LXN1YmFnZW50LW9wZW4tY2hhdC10b29sYmFyJyk7XG5cdFx0dGhpcy5fY29sbGFwc2VCdXR0b24/LmVsZW1lbnQucGFyZW50RWxlbWVudD8uaW5zZXJ0QmVmb3JlKGNvbnRhaW5lciwgdGhpcy5fY29sbGFwc2VCdXR0b24uZWxlbWVudCk7XG5cdFx0dGhpcy5fb3BlbkNoYXRUb29sYmFyQ29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHRoaXMuX29wZW5DaGF0VG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgY29udGFpbmVyLCB7XG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5JZ25vcmUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyKFxuXHRcdFx0XHRhY3Rpb24sXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdGRvbS5nZXRXaW5kb3coY29udGFpbmVyKS52c2NvZGVXaW5kb3dJZFxuXHRcdFx0KSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fb3BlbkNoYXRUb29sYmFyLnNldEFjdGlvbnMoW21lbnVBY3Rpb25dKTtcblx0XHR0aGlzLl90cmFja09wZW5DaGF0QWN0aW9ucygpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3BlbkNoYXRNZW51QWN0aW9uKCk6IE1lbnVJdGVtQWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFssIGFjdGlvbnNdIG9mIHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQpO1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90cmFja09wZW5DaGF0QWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpdGVtQ291bnQgPSB0aGlzLl9vcGVuQ2hhdFRvb2xiYXI/LmdldEl0ZW1zTGVuZ3RoKCkgPz8gMDtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaXRlbUNvdW50OyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLl9vcGVuQ2hhdFRvb2xiYXI/LmdldEl0ZW1BY3Rpb24oaW5kZXgpO1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikge1xuXHRcdFx0XHRzdG9yZS5hZGQoYWN0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZU9wZW5DaGF0T25seU1vZGUoKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vcGVuQ2hhdEFjdGlvbkxpc3RlbmVycy52YWx1ZSA9IHN0b3JlO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0T25seU1vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU9wZW5DaGF0T25seU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgb3BlbkNoYXRPbmx5ID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX29wZW5DaGF0VG9vbGJhcikge1xuXHRcdFx0Y29uc3QgaXRlbUNvdW50ID0gdGhpcy5fb3BlbkNoYXRUb29sYmFyLmdldEl0ZW1zTGVuZ3RoKCk7XG5cdFx0XHRvcGVuQ2hhdE9ubHkgPSB0aGlzLl9zaG91bGRVc2VPcGVuQ2hhdFByZXNlbnRhdGlvbigpICYmICEhdGhpcy5fZ2V0Q2hhdFJlc291cmNlKCk7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgaXRlbUNvdW50OyBpbmRleCsrKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fb3BlbkNoYXRUb29sYmFyLmdldEl0ZW1BY3Rpb24oaW5kZXgpPy5lbmFibGVkKSB7XG5cdFx0XHRcdFx0b3BlbkNoYXRPbmx5ID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtc3ViYWdlbnQtb3Blbi1jaGF0LW9ubHknLCBvcGVuQ2hhdE9ubHkpO1xuXHRcdGlmIChvcGVuQ2hhdE9ubHkgfHwgdGhpcy5fc2hvdWxkUmVzZXJ2ZU9wZW5DaGF0UHJlc2VudGF0aW9uKCkpIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQpO1xuXHRcdFx0aWYgKHRoaXMuY29udGVudEFuaW1hdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLmNvbnRlbnRBbmltYXRpb25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvbS5zaG93KHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQpO1xuXHRcdFx0aWYgKHRoaXMuY29udGVudEFuaW1hdGlvbkNvbnRhaW5lcikge1xuXHRcdFx0XHRkb20uc2hvdyh0aGlzLmNvbnRlbnRBbmltYXRpb25Db250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFJlc291cmNlID0gdGhpcy5fZ2V0Q2hhdFJlc291cmNlKCk7XG5cdFx0aWYgKGNoYXRSZXNvdXJjZSAmJiB0aGlzLl9vcGVuQ2hhdFRvb2xiYXIpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9zdWJhZ2VudFRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGlzUmVzcG9uc2VWTSh0aGlzLmNvbnRleHQuZWxlbWVudCkgPyB0aGlzLmNvbnRleHQuZWxlbWVudCA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlbGVjdGVkTW9kZWwgPSByZXNwb25zZT8uc2Vzc2lvbj8ubW9kZWwuaW5wdXRNb2RlbC5zdGF0ZS5nZXQoKT8uc2VsZWN0ZWRNb2RlbDtcblx0XHRcdGNvbnN0IHBhcmVudE1vZGVsSWQgPSByZXNwb25zZT8ubW9kZWwucmVxdWVzdD8ubW9kZWxJZCA/PyBzZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyO1xuXHRcdFx0Y29uc3QgcGFyZW50TW9kZWxOYW1lID0gc2VsZWN0ZWRNb2RlbD8ubWV0YWRhdGEubmFtZTtcblx0XHRcdGNvbnN0IHJlc29sdmVkTW9kZWwgPSByZXNwb25zZT8ubW9kZWwucmVzdWx0Py5tZXRhZGF0YT8ucmVzb2x2ZWRNb2RlbDtcblx0XHRcdGNvbnN0IHBhcmVudFJlc29sdmVkTW9kZWxJZCA9IHR5cGVvZiByZXNvbHZlZE1vZGVsID09PSAnc3RyaW5nJyA/IHJlc29sdmVkTW9kZWwgOiBzZWxlY3RlZE1vZGVsPy5tZXRhZGF0YS5pZDtcblx0XHRcdGNvbnN0IGFjdGl2ZVRvb2wgPSBBcnJheS5mcm9tKHRoaXMuYWN0aXZlVG9vbFByZXNlbnRhdGlvbnMuZW50cmllcygpKS5hdCgtMSk7XG5cdFx0XHRjb25zdCBkaXNwbGF5ZWRUb29sID0gYWN0aXZlVG9vbFxuXHRcdFx0XHQ/IHsgY2FsbElkOiBhY3RpdmVUb29sWzBdLCAuLi5hY3RpdmVUb29sWzFdIH1cblx0XHRcdFx0OiB0aGlzLnN1YmFnZW50QWN0aXZpdHkgIT09ICdtYXJrZG93bidcblx0XHRcdFx0XHQ/IHRoaXMubW9zdFJlY2VudFRvb2xQcmVzZW50YXRpb25cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29wZW5DaGF0VG9vbGJhci5jb250ZXh0ID0ge1xuXHRcdFx0XHRjaGF0UmVzb3VyY2UsXG5cdFx0XHRcdHBhcmVudFNlc3Npb25SZXNvdXJjZTogdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHRpdGxlOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRjb25maXJtYXRpb25Db3VudDogdGhpcy50b29sc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbixcblx0XHRcdFx0Y29uZmlybWF0aW9uQWN0aXZlOiB0aGlzLl9jb25maXJtYXRpb25BY3RpdmUsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogZGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IGRhdGEuc3RhcnRlZEF0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkdXJhdGlvbjogZGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IGRhdGEuZHVyYXRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzQWN0aXZlOiB0aGlzLmlzQWN0aXZlLFxuXHRcdFx0XHQuLi4odGhpcy5tb2RlbE5hbWUgPyB7IG1vZGVsTmFtZTogdGhpcy5tb2RlbE5hbWUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBhcmVudE1vZGVsSWQgPyB7IHBhcmVudE1vZGVsSWQgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBhcmVudE1vZGVsTmFtZSA/IHsgcGFyZW50TW9kZWxOYW1lIH0gOiB7fSksXG5cdFx0XHRcdC4uLihwYXJlbnRSZXNvbHZlZE1vZGVsSWQgPyB7IHBhcmVudFJlc29sdmVkTW9kZWxJZCB9IDoge30pLFxuXHRcdFx0XHQuLi4odGhpcy5pc0FjdGl2ZSAmJiBkaXNwbGF5ZWRUb29sID8geyBhY3RpdmVUb29sQ2FsbElkOiBkaXNwbGF5ZWRUb29sLmNhbGxJZCwgYWN0aXZlVG9vbExhYmVsOiBkaXNwbGF5ZWRUb29sLmxhYmVsLCBhY3RpdmVUb29sSWNvbjogZGlzcGxheWVkVG9vbC5pY29uIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFVzZU9wZW5DaGF0UHJlc2VudGF0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93IHx8IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uU3ViYWdlbnRzVXNlUmljaFJlbmRlcmluZyk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRSZXNlcnZlT3BlbkNoYXRQcmVzZW50YXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZFVzZU9wZW5DaGF0UHJlc2VudGF0aW9uKCkgJiYgaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSkpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcsXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUG9vbDogRWRpdG9yUG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXaWR0aERlbGVnYXRlOiAoKSA9PiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlOiBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIEV4dHJhY3QgZGVzY3JpcHRpb24sIGFnZW50TmFtZSwgYW5kIHByb21wdCBmcm9tIHRvb2xJbnZvY2F0aW9uXG5cdFx0Y29uc3QgeyBkZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb24sIGFnZW50TmFtZSwgcHJvbXB0LCBtb2RlbE5hbWUsIGNyZWRpdHMgfSA9IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmV4dHJhY3RTdWJhZ2VudEluZm8odG9vbEludm9jYXRpb24pO1xuXG5cdFx0Ly8gQnVpbGQgdGl0bGU6IFwiQWdlbnROYW1lOiBkZXNjcmlwdGlvblwiIG9yIFwiU3ViYWdlbnQ6IGRlc2NyaXB0aW9uXCJcblx0XHRjb25zdCByYXdQcmVmaXggPSBhZ2VudE5hbWUgfHwgbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQucHJlZml4JywgJ1N1YmFnZW50Jyk7XG5cdFx0Y29uc3QgcHJlZml4ID0gcmF3UHJlZml4LmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcmF3UHJlZml4LnNsaWNlKDEpO1xuXHRcdGNvbnN0IGluaXRpYWxUaXRsZSA9IGAke3ByZWZpeH06ICR7ZGVzY3JpcHRpb259YDtcblx0XHRzdXBlcihpbml0aWFsVGl0bGUsIGNvbnRleHQsIHVuZGVmaW5lZCwgaG92ZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gcmN1dChkZXNjcmlwdGlvbiwgTUFYX1RJVExFX0xFTkdUSCk7XG5cdFx0dGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gPSBpc0RlZmF1bHREZXNjcmlwdGlvbjtcblx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHR0aGlzLnByb21wdCA9IHByb21wdDtcblx0XHR0aGlzLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHR0aGlzLmNyZWRpdHMgPSBjcmVkaXRzO1xuXHRcdHRoaXMuaXNJbml0aWFsbHlDb21wbGV0ZSA9IElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbik7XG5cdFx0dGhpcy5pc0V4dGVybmFsbHlBY3RpdmUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPT09IHRydWU7XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCdcblx0XHRcdD8gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA/PyAhdGhpcy5pc0luaXRpYWxseUNvbXBsZXRlXG5cdFx0XHQ6ICF0aGlzLmlzSW5pdGlhbGx5Q29tcGxldGU7XG5cdFx0dGhpcy5zdWJhZ2VudEFjdGl2aXR5ID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuYWN0aXZpdHkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc3ViYWdlbnRUb29sSW52b2NhdGlvbiA9IHRvb2xJbnZvY2F0aW9uO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5TdWJhZ2VudHNVc2VSaWNoUmVuZGVyaW5nKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdExpbmsoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGNvbnRleHQuZWxlbWVudDtcblx0XHRcdGNvbnN0IGZpbmFsaXplT25UZXJtaW5hbCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNBY3RpdmUgJiYgKHJlc3BvbnNlLmlzQ29tcGxldGUgfHwgcmVzcG9uc2UuaXNDYW5jZWxlZCkpIHtcblx0XHRcdFx0XHR0aGlzLm1hcmtBc0luYWN0aXZlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0ZmluYWxpemVPblRlcm1pbmFsKCk7XG5cdFx0XHRpZiAoIXJlc3BvbnNlLmlzQ29tcGxldGUgJiYgIXJlc3BvbnNlLmlzQ2FuY2VsZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZShFdmVudC5maWx0ZXIocmVzcG9uc2UubW9kZWwub25EaWRDaGFuZ2UsICgpID0+IHJlc3BvbnNlLmlzQ29tcGxldGUgfHwgcmVzcG9uc2UuaXNDYW5jZWxlZCkpKGZpbmFsaXplT25UZXJtaW5hbCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmRvbU5vZGU7XG5cdFx0bm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRoaW5raW5nLWJveCcsICdjaGF0LXRoaW5raW5nLWZpeGVkLW1vZGUnLCAnY2hhdC1zdWJhZ2VudC1wYXJ0Jyk7XG5cdFx0Y29uc3QgYW5pbWF0aW9uQ29udGFpbmVyID0gdGhpcy5jb250ZW50QW5pbWF0aW9uQ29udGFpbmVyO1xuXHRcdGlmIChhbmltYXRpb25Db250YWluZXIpIHtcblx0XHRcdGNvbnN0IHBlbmRpbmdBbmltYXRpb25DbGVhbnVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobm9kZSwgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBlID0+IHtcblx0XHRcdFx0aWYgKGUudGFyZ2V0ID09PSBub2RlXG5cdFx0XHRcdFx0JiYgdGhpcy5pc0FjdGl2ZVxuXHRcdFx0XHRcdCYmICF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDb250ZW50QW5pbWF0aW9uRW5hYmxlZCh0cnVlKTtcblx0XHRcdFx0XHRhbmltYXRpb25Db250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IGZpbmlzaEFjdGl2ZVRvZ2dsZUFuaW1hdGlvbiA9IChlOiBUcmFuc2l0aW9uRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNBY3RpdmUgJiYgZS50YXJnZXQgPT09IGFuaW1hdGlvbkNvbnRhaW5lciAmJiBlLnByb3BlcnR5TmFtZSA9PT0gJ2dyaWQtdGVtcGxhdGUtcm93cycpIHtcblx0XHRcdFx0XHRwZW5kaW5nQW5pbWF0aW9uQ2xlYW51cC5jbGVhcigpO1xuXHRcdFx0XHRcdHRoaXMuc2V0Q29udGVudEFuaW1hdGlvbkVuYWJsZWQoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhbmltYXRpb25Db250YWluZXIsICd0cmFuc2l0aW9uZW5kJywgZmluaXNoQWN0aXZlVG9nZ2xlQW5pbWF0aW9uKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGFuaW1hdGlvbkNvbnRhaW5lciwgJ3RyYW5zaXRpb25jYW5jZWwnLCBmaW5pc2hBY3RpdmVUb2dnbGVBbmltYXRpb24pKTtcblx0XHR9XG5cblx0XHQvLyBBbmNob3IgdGhlIGBNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudGAgbWVudSBpbiB0aGUgc3ViYWdlbnQgaGVhZGVyIHNvXG5cdFx0Ly8gdGhlIEFnZW50cyB3aW5kb3cgY2FuIGNvbnRyaWJ1dGUgYW4gXCJPcGVuIFN1YmFnZW50XCIgcGlsbCB0byByZXZlYWwgdGhlXG5cdFx0Ly8gc3ViYWdlbnQncyBvd24gKHJlYWQtb25seSkgY2hhdCB3aGVuIGl0IHJ1bnMgYXMgYSBkaXN0aW5jdCBjaGF0LlxuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0TGluaygpO1xuXG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdG5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBzaGltbWVyIHRvIHRoZSBpbml0aWFsIHRpdGxlIHdoZW4gc3RpbGwgYWN0aXZlXG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUgJiYgdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKTtcblx0XHRcdHRoaXMudGl0bGVTaGltbWVyU3Bhbi50ZXh0Q29udGVudCA9IGluaXRpYWxUaXRsZTtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2hpbW1lclNwYW4pO1xuXHRcdH1cblxuXHRcdC8vIE5vdGU6IHdyYXBwZXIgaXMgY3JlYXRlZCBsYXppbHkgaW4gaW5pdENvbnRlbnQoKSwgc28gd2UgY2FuJ3Qgc2V0IGl0cyBzdHlsZSBoZXJlXG5cblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24gJiYgdGhpcy5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2lyY2xlRmlsbGVkO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHR0aGlzLmV4cGFuZGVkLnJlYWQocik7XG5cdFx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdFx0aWYgKHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaXJjbGVGaWxsZWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fY29sbGFwc2VCdXR0b24uaWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNYXRlcmlhbGl6ZSBsYXp5IGl0ZW1zIHdoZW4gZmlyc3QgZXhwYW5kZWRcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzRXhwYW5kZWQucmVhZChyKSAmJiAhdGhpcy5oYXNFeHBhbmRlZE9uY2UpIHtcblx0XHRcdFx0dGhpcy5oYXNFeHBhbmRlZE9uY2UgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLm1hdGVyaWFsaXplUGVuZGluZ0NvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTdGFydCBjb2xsYXBzZWQgLSBmaXhlZCBzY3JvbGxpbmcgbW9kZSBzaG93cyBsaW1pdGVkIGhlaWdodCB3aGVuIGNvbGxhcHNlZFxuXHRcdHRoaXMuc2V0RXhwYW5kZWQoZmFsc2UpO1xuXG5cdFx0Ly8gVHJhY2sgdXNlciBtYW51YWwgZXhwYW5zaW9uXG5cdFx0Ly8gSWYgdGhlIHVzZXIgZXhwYW5kcyAobm90IHZpYSBhdXRvLWV4cGFuZCBmb3IgY29uZmlybWF0aW9uKSwgbWFyayBpdCBhcyBtYW51YWxcblx0XHQvLyBPbmx5IGNsZWFyIGF1dG9FeHBhbmRlZEZvckNvbmZpcm1hdGlvbiB3aGVuIHVzZXIgY29sbGFwc2VzLCBzbyByZS1leHBhbmQgaXMgZGV0ZWN0ZWQgYXMgbWFudWFsXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGV4cGFuZGVkID0gdGhpcy5faXNFeHBhbmRlZC5yZWFkKHIpO1xuXHRcdFx0aWYgKGV4cGFuZGVkKSB7XG5cdFx0XHRcdGlmICghdGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLnVzZXJNYW51YWxseUV4cGFuZGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXNlciBjb2xsYXBzZWQgLSByZXNldCBmbGFncyBzbyBuZXh0IGNvbmZpcm1hdGlvbiBjeWNsZSBjYW4gYXV0by1jb2xsYXBzZSBhZ2FpblxuXHRcdFx0XHRpZiAodGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLmF1dG9FeHBhbmRlZEZvckNvbmZpcm1hdGlvbiA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFJlc2V0IG1hbnVhbCBleHBhbnNpb24gZmxhZyB3aGVuIHVzZXIgY29sbGFwc2VzLCBzbyBmdXR1cmUgY29uZmlybWF0aW9uIGN5Y2xlcyBjYW4gYXV0by1jb2xsYXBzZVxuXHRcdFx0XHRpZiAodGhpcy51c2VyTWFudWFsbHlFeHBhbmRlZCkge1xuXHRcdFx0XHRcdHRoaXMudXNlck1hbnVhbGx5RXhwYW5kZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNjaGVkdWxlciBmb3IgY29hbGVzY2luZyBsYXlvdXQgb3BlcmF0aW9uc1xuXHRcdHRoaXMubGF5b3V0U2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKHRoaXMuZG9tTm9kZSwgKCkgPT4gdGhpcy5wZXJmb3JtTGF5b3V0KCkpKTtcblxuXHRcdC8vIFNldCB1cCBob3ZlciB0b29sdGlwIHdpdGggbW9kZWwgbmFtZSBpZiBhdmFpbGFibGVcblx0XHR0aGlzLnVwZGF0ZUhvdmVyKCk7XG5cblx0XHQvLyBSZW5kZXIgdGhlIHByb21wdCBzZWN0aW9uIGF0IHRoZSBzdGFydCBpZiBhdmFpbGFibGUgKG11c3QgYmUgYWZ0ZXIgd3JhcHBlciBpcyBpbml0aWFsaXplZClcblx0XHR0aGlzLnJlbmRlclByb21wdFNlY3Rpb24oKTtcblxuXHRcdC8vIFdhdGNoIGZvciBjb21wbGV0aW9uIGFuZCByZW5kZXIgcmVzdWx0XG5cdFx0dGhpcy53YXRjaFRvb2xDb21wbGV0aW9uKHRvb2xJbnZvY2F0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmFuZG9tV29ya2luZ01lc3NhZ2UoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuYXZhaWxhYmxlTWVzc2FnZXMgfHwgdGhpcy5hdmFpbGFibGVNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuYXZhaWxhYmxlTWVzc2FnZXMgPSBidWlsZFBocmFzZVBvb2woc3ViYWdlbnRXb3JraW5nTWVzc2FnZXMsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRoaXMuYXZhaWxhYmxlTWVzc2FnZXMubGVuZ3RoKTtcblx0XHRyZXR1cm4gdGhpcy5hdmFpbGFibGVNZXNzYWdlcy5zcGxpY2UoaW5kZXgsIDEpWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVXb3JraW5nU3Bpbm5lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQgfHwgIXRoaXMud3JhcHBlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCA9ICQoJy5jaGF0LXRoaW5raW5nLWl0ZW0uY2hhdC10aGlua2luZy1zcGlubmVyLWl0ZW0nKTtcblx0XHRjb25zdCBzcGlubmVySWNvbiA9IGNyZWF0ZVRoaW5raW5nSWNvbihDb2RpY29uLmNpcmNsZUZpbGxlZCk7XG5cdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQuYXBwZW5kQ2hpbGQoc3Bpbm5lckljb24pO1xuXHRcdHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCA9ICQoJ3NwYW4uY2hhdC10aGlua2luZy1zcGlubmVyLWxhYmVsJyk7XG5cdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRSYW5kb21Xb3JraW5nTWVzc2FnZSgpO1xuXHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50LmFwcGVuZENoaWxkKHRoaXMud29ya2luZ1NwaW5uZXJMYWJlbCk7XG5cdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlV29ya2luZ1NwaW5uZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50KSB7XG5cdFx0XHR0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1dvcmtpbmdTcGlubmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndvcmtpbmdTcGlubmVyRWxlbWVudCkge1xuXHRcdFx0dGhpcy53b3JraW5nU3Bpbm5lckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNyZWF0ZVdvcmtpbmdTcGlubmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGluaXRDb250ZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLndyYXBwZXIgPSAkKCcuY2hhdC11c2VkLWNvbnRleHQtbGlzdC5jaGF0LXRoaW5raW5nLWNvbGxhcHNpYmxlJyk7XG5cblx0XHQvLyBIaWRlIGluaXRpYWxseSB1bnRpbCB0aGVyZSBhcmUgdG9vbCBjYWxsc1xuXHRcdGlmICghdGhpcy5oYXNUb29sSXRlbXMpIHtcblx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIE1hdGVyaWFsaXplIGFueSBkZWZlcnJlZCBjb250ZW50IG5vdyB0aGF0IHdyYXBwZXIgZXhpc3RzXG5cdFx0Ly8gVGhpcyBoYW5kbGVzIHRoZSBjYXNlIHdoZXJlIHRoZSBzdWJjbGFzcyBhdXRvcnVuIHJhbiBiZWZvcmUgdGhpcyBiYXNlIGNsYXNzIGF1dG9ydW5cblx0XHR0aGlzLm1hdGVyaWFsaXplUGVuZGluZ0NvbnRlbnQoKTtcblx0XHRpZiAodGhpcy5pc0FjdGl2ZSAmJiAhdGhpcy5pc0luaXRpYWxseUNvbXBsZXRlICYmICF0aGlzLmhhc1Rvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0dGhpcy5zaG93V29ya2luZ1NwaW5uZXIoKTtcblx0XHR9XG5cblx0XHQvLyBVc2UgUmVzaXplT2JzZXJ2ZXIgdG8gdHJpZ2dlciBsYXlvdXQgd2hlbiB3cmFwcGVyIGNvbnRlbnQgY2hhbmdlc1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdFN1YmFnZW50Q29udGVudFBhcnQubGF5b3V0JywgKCkgPT4gdGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy53cmFwcGVyKSk7XG5cblx0XHRyZXR1cm4gdGhpcy53cmFwcGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgdGhlIHByb21wdCBhcyBhIGNvbGxhcHNpYmxlIHNlY3Rpb24gYXQgdGhlIHN0YXJ0IG9mIHRoZSBjb250ZW50LlxuXHQgKiBJZiB0aGUgd3JhcHBlciBkb2Vzbid0IGV4aXN0IHlldCAobGF6eSBpbml0KSBvciBzdWJhZ2VudCBpcyBpbml0aWFsbHkgY29tcGxldGUsXG5cdCAqIHRoaXMgaXMgZGVmZXJyZWQgdW50aWwgZXhwYW5kZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclByb21wdFNlY3Rpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnByb21wdCB8fCB0aGlzLnByb21wdENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERlZmVyIHJlbmRlcmluZyB3aGVuIHdyYXBwZXIgZG9lc24ndCBleGlzdCB5ZXQgKGxhenkgaW5pdCkgb3IgZm9yIG9sZCBjb21wbGV0ZWQgc3ViYWdlbnRzIHVudGlsIGV4cGFuZGVkXG5cdFx0aWYgKCF0aGlzLndyYXBwZXIgfHwgKHRoaXMuaXNJbml0aWFsbHlDb21wbGV0ZSAmJiAhdGhpcy5pc0V4cGFuZGVkKCkgJiYgIXRoaXMuaGFzRXhwYW5kZWRPbmNlKSkge1xuXHRcdFx0dGhpcy5wZW5kaW5nUHJvbXB0UmVuZGVyID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdQcm9tcHRSZW5kZXIgPSBmYWxzZTtcblx0XHR0aGlzLmRvUmVuZGVyUHJvbXB0U2VjdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbmRlclByb21wdFNlY3Rpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnByb21wdCB8fCB0aGlzLnByb21wdENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNwbGl0IGludG8gZmlyc3QgbGluZSBhbmQgcmVzdFxuXHRcdGNvbnN0IGxpbmVzID0gdGhpcy5wcm9tcHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IHJhd0ZpcnN0TGluZSA9IGxpbmVzWzBdIHx8IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnByb21wdCcsICdQcm9tcHQnKTtcblx0XHRjb25zdCByZXN0T2ZMaW5lcyA9IGxpbmVzLnNsaWNlKDEpLmpvaW4oJ1xcbicpLnRyaW0oKTtcblxuXHRcdC8vIExpbWl0IGZpcnN0IGxpbmUgbGVuZ3RoLCBtb3Zpbmcgb3ZlcmZsb3cgdG8gY29udGVudFxuXHRcdGNvbnN0IHRpdGxlQ29udGVudCA9IHJjdXQocmF3Rmlyc3RMaW5lLCBNQVhfVElUTEVfTEVOR1RIKTtcblx0XHRjb25zdCB3YXNUcnVuY2F0ZWQgPSByYXdGaXJzdExpbmUubGVuZ3RoID4gTUFYX1RJVExFX0xFTkdUSDtcblx0XHRjb25zdCB0aXRsZSA9IHdhc1RydW5jYXRlZCA/IHRpdGxlQ29udGVudCArICdcdTIwMjYnIDogdGl0bGVDb250ZW50O1xuXHRcdGNvbnN0IHRpdGxlUmVtYWluZGVyID0gcmF3Rmlyc3RMaW5lLmxlbmd0aCA+IHRpdGxlQ29udGVudC5sZW5ndGggPyByYXdGaXJzdExpbmUuc2xpY2UodGl0bGVDb250ZW50Lmxlbmd0aCkudHJpbSgpIDogJyc7XG5cdFx0Y29uc3QgY29udGVudCA9IHRpdGxlUmVtYWluZGVyXG5cdFx0XHQ/ICh0aXRsZVJlbWFpbmRlciArIChyZXN0T2ZMaW5lcyA/ICdcXG4nICsgcmVzdE9mTGluZXMgOiAnJykpXG5cdFx0XHQ6IChyZXN0T2ZMaW5lcyB8fCB0aGlzLnByb21wdCk7XG5cblx0XHQvLyBDcmVhdGUgY29sbGFwc2libGUgcHJvbXB0IHBhcnRcblx0XHRjb25zdCBjb2xsYXBzaWJsZVBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdENvbGxhcHNpYmxlTWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyXG5cdFx0KSk7XG5cblx0XHQvLyBXcmFwIGluIGEgY29udGFpbmVyIGZvciBjaGFpbiBvZiB0aG91Z2h0IGxpbmUgc3R5bGluZ1xuXHRcdHRoaXMucHJvbXB0Q29udGFpbmVyID0gJCgnLmNoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyLmNoYXQtc3ViYWdlbnQtc2VjdGlvbicpO1xuXHRcdGNvbnN0IHByb21wdEljb24gPSBjcmVhdGVUaGlua2luZ0ljb24oQ29kaWNvbi5jb21tZW50KTtcblx0XHR0aGlzLnByb21wdENvbnRhaW5lci5hcHBlbmRDaGlsZChwcm9tcHRJY29uKTtcblx0XHR0aGlzLnByb21wdENvbnRhaW5lci5hcHBlbmRDaGlsZChjb2xsYXBzaWJsZVBhcnQuZG9tTm9kZSk7XG5cblx0XHQvLyBJbnNlcnQgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgd3JhcHBlclxuXHRcdC8vIFdpdGggbGF6eSByZW5kZXJpbmcsIHdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiBjb250ZW50IGhhc24ndCBiZWVuIGV4cGFuZGVkXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0aWYgKHRoaXMud3JhcHBlci5maXJzdENoaWxkKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5pbnNlcnRCZWZvcmUodGhpcy5wcm9tcHRDb250YWluZXIsIHRoaXMud3JhcHBlci5maXJzdENoaWxkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRvbS5hcHBlbmQodGhpcy53cmFwcGVyLCB0aGlzLnByb21wdENvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNob3cgdGhlIGNvbnRhaW5lciBpZiBpdCB3YXMgaGlkZGVuIChubyB0b29sIGl0ZW1zIHlldClcblx0XHRcdGlmICh0aGlzLndyYXBwZXIuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldElzQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzQWN0aXZlO1xuXHR9XG5cblx0cHVibGljIHNob3VsZFJlbWFpbkFjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc0V4dGVybmFsbHlBY3RpdmU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhhc1Rvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50b29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPiAwO1xuXHR9XG5cblx0cHVibGljIGJlZ2luVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xQcmVzZW50YXRpb25CYXRjaERlcHRoKys7XG5cdH1cblxuXHRwdWJsaWMgZW5kVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl90b29sUHJlc2VudGF0aW9uQmF0Y2hEZXB0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90b29sUHJlc2VudGF0aW9uQmF0Y2hEZXB0aC0tO1xuXHRcdGlmICh0aGlzLl90b29sUHJlc2VudGF0aW9uQmF0Y2hEZXB0aCA9PT0gMCAmJiB0aGlzLl90b29sUHJlc2VudGF0aW9uRGlydHkpIHtcblx0XHRcdHRoaXMuX3Rvb2xQcmVzZW50YXRpb25EaXJ0eSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbFByZXNlbnRhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRvb2xQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Rvb2xQcmVzZW50YXRpb25CYXRjaERlcHRoID4gMCkge1xuXHRcdFx0dGhpcy5fdG9vbFByZXNlbnRhdGlvbkRpcnR5ID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0fVxuXG5cdC8qKiBSb3V0ZXMgdGhpcyBzdWJhZ2VudCdzIGluaXRpYWwgY29uZmlybWF0aW9ucyB0byB0aGUgaW5wdXQgY2Fyb3VzZWwuICovXG5cdHB1YmxpYyBlbmFibGVDYXJvdXNlbE1vZGUoXG5cdFx0bmF2aWdhdGVUb0Nhcm91c2VsOiAoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZykgPT4gdm9pZCxcblx0XHRhZGRUb29sVG9DYXJvdXNlbDogKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IHZvaWQsXG5cdFx0c2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sOiAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiwgc3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUpID0+IGJvb2xlYW4sXG5cdFx0b25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudD86IEV2ZW50PHN0cmluZyB8IHVuZGVmaW5lZD4sXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzZUNhcm91c2VsRm9yQ29uZmlybWF0aW9ucyA9IHRydWU7XG5cdFx0dGhpcy5fbmF2aWdhdGVUb0Nhcm91c2VsID0gbmF2aWdhdGVUb0Nhcm91c2VsO1xuXHRcdHRoaXMuX2FkZFRvb2xUb0Nhcm91c2VsID0gYWRkVG9vbFRvQ2Fyb3VzZWw7XG5cdFx0dGhpcy5fc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sO1xuXHRcdHRoaXMuX2FjdGl2ZUNvbmZpcm1hdGlvblRyYWNrZXIudmFsdWUgPSBvbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50Py4oaWQgPT4gdGhpcy5zZXRDb25maXJtYXRpb25BY3RpdmUoaWQgPT09IHRoaXMuc3ViQWdlbnRJbnZvY2F0aW9uSWQpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDaGF0UmVzb3VyY2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q2hhdFJlc291cmNlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29uZmlybWF0aW9uQWN0aXZlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChhY3RpdmUgIT09IHRoaXMuX2NvbmZpcm1hdGlvbkFjdGl2ZSkge1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQWN0aXZlID0gYWN0aXZlO1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBZ2VudExhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuYWdlbnROYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hZ2VudE5hbWU7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gJiYgdGhpcy5kZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5wcmVmaXgnLCAnU3ViYWdlbnQnKTtcblx0fVxuXG5cdHB1YmxpYyBtYXJrQXNJbmFjdGl2ZShmb3JjZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKGZvcmNlICYmIHRoaXMuX3N1YmFnZW50VG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3N1YmFnZW50VG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdGRhdGEuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHRcdGlmIChkYXRhLmR1cmF0aW9uID09PSB1bmRlZmluZWQgJiYgZGF0YS5zdGFydGVkQXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRkYXRhLmR1cmF0aW9uID0gTWF0aC5tYXgoMCwgRGF0ZS5ub3coKSAtIGRhdGEuc3RhcnRlZEF0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10aGlua2luZy1hY3RpdmUnKTtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlV29ya2luZ1NwaW5uZXIoKTtcblx0XHR0aGlzLmhpZGVDb25maXJtYXRpb25QbGFjZWhvbGRlcigpO1xuXG5cdFx0aWYgKHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuY29tcGxldGVkRGVmYXVsdERlc2NyaXB0aW9uJywgJ1JhbiBzdWJhZ2VudCcpO1xuXHRcdH1cblx0XHR0aGlzLmZpbmFsaXplVGl0bGUoKTtcblx0XHQvLyBDb2xsYXBzZSB3aGVuIGRvbmVcblx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHR0aGlzLnNldENvbnRlbnRBbmltYXRpb25FbmFibGVkKHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBtYXJrQXNBY3RpdmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pc0FjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy5zZXRDb250ZW50QW5pbWF0aW9uRW5hYmxlZChmYWxzZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGhpbmtpbmctYWN0aXZlJyk7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5pY29uID0gQ29kaWNvbi5jaXJjbGVGaWxsZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLndyYXBwZXIgJiYgIXRoaXMuaGFzVG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHR0aGlzLnNob3dXb3JraW5nU3Bpbm5lcigpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoQWN0aXZlU3RhdGVGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaXNFeHRlcm5hbGx5QWN0aXZlID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZTtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5tYXJrQXNBY3RpdmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrQXNJbmFjdGl2ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmaW5hbGl6ZVRpdGxlKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmF3TmFtZSA9IHRoaXMuYWdlbnROYW1lIHx8IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnByZWZpeCcsICdTdWJhZ2VudCcpO1xuXHRcdGNvbnN0IHByZWZpeCA9IHJhd05hbWUuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByYXdOYW1lLnNsaWNlKDEpO1xuXHRcdGNvbnN0IHNoaW1tZXJUZXh0ID0gYCR7cHJlZml4fTogJHt0aGlzLmRlc2NyaXB0aW9ufWA7XG5cdFx0Y29uc3QgdG9vbENhbGxUZXh0ID0gdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlICYmIHRoaXMuaXNBY3RpdmUgPyBgIFxcdTIwMTQgJHt0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2V9YCA6IGBgO1xuXG5cdFx0aWYgKCF0aGlzLl9jb2xsYXBzZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudCA9IHRoaXMuX2NvbGxhcHNlQnV0dG9uLmxhYmVsRWxlbWVudDtcblxuXHRcdGlmICghdGhpcy5pc0FjdGl2ZSkge1xuXHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4gPSB1bmRlZmluZWQ7XG5cblx0XHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3RpdGxlRmlsZVdpZGdldFN0b3JlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBwcmVmaXhTcGFuID0gJCgnc3BhbicpO1xuXHRcdFx0cHJlZml4U3Bhbi50ZXh0Q29udGVudCA9IGAke3ByZWZpeH06YDtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChwcmVmaXhTcGFuKTtcblxuXHRcdFx0Y29uc3QgZGVzY1NwYW4gPSAkKCdzcGFuLmNoYXQtdGhpbmtpbmctdGl0bGUtZGV0YWlsLXRleHQnKTtcblx0XHRcdGRlc2NTcGFuLnRleHRDb250ZW50ID0gYCAke3RoaXMuZGVzY3JpcHRpb259YDtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChkZXNjU3Bhbik7XG5cblx0XHRcdHRoaXMuX2NvbGxhcHNlQnV0dG9uLmVsZW1lbnQuYXJpYUxhYmVsID0gc2hpbW1lclRleHQ7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyh0aGlzLmlzRXhwYW5kZWQoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRoZSBwZXJzaXN0ZW50IHNoaW1tZXIgc3BhbiBleGlzdHNcblx0XHRpZiAoIXRoaXMudGl0bGVTaGltbWVyU3BhbiB8fCAhdGhpcy50aXRsZVNoaW1tZXJTcGFuLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy50aXRsZVNoaW1tZXJTcGFuID0gJCgnc3Bhbi5jaGF0LXRoaW5raW5nLXRpdGxlLXNoaW1tZXInKTtcblx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRpdGxlU2hpbW1lclNwYW4pO1xuXHRcdH1cblx0XHR0aGlzLnRpdGxlU2hpbW1lclNwYW4udGV4dENvbnRlbnQgPSBzaGltbWVyVGV4dDtcblxuXHRcdC8vIERpc3Bvc2UgcHJldmlvdXMgZGV0YWlsIHJlbmRlcmluZ1xuXHRcdHRoaXMuX3RpdGxlRGV0YWlsUmVuZGVyZWQuY2xlYXIoKTtcblx0XHR0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZS5jbGVhcigpO1xuXG5cdFx0aWYgKCF0b29sQ2FsbFRleHQpIHtcblx0XHRcdGlmICh0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMudGl0bGVEZXRhaWxDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcodG9vbENhbGxUZXh0KSk7XG5cdFx0XHRyZXN1bHQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb2xsYXBzaWJsZS10aXRsZS1jb250ZW50JywgJ2NoYXQtdGhpbmtpbmctdGl0bGUtZGV0YWlsJyk7XG5cdFx0XHRyZW5kZXJGaWxlV2lkZ2V0cyhyZXN1bHQuZWxlbWVudCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl90aXRsZUZpbGVXaWRnZXRTdG9yZSk7XG5cdFx0XHR0aGlzLl90aXRsZURldGFpbFJlbmRlcmVkLnZhbHVlID0gcmVzdWx0O1xuXG5cdFx0XHRpZiAodGhpcy50aXRsZURldGFpbENvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyLnJlcGxhY2VXaXRoKHJlc3VsdC5lbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChyZXN1bHQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRpdGxlRGV0YWlsQ29udGFpbmVyID0gcmVzdWx0LmVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnVsbExhYmVsID0gYCR7c2hpbW1lclRleHR9JHt0b29sQ2FsbFRleHR9YDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFMYWJlbCA9IGZ1bGxMYWJlbDtcblx0XHR0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LmFyaWFFeHBhbmRlZCA9IFN0cmluZyh0aGlzLmlzRXhwYW5kZWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUhvdmVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5tb2RlbE5hbWUpIHtcblx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQubW9kZWxUb29sdGlwJywgJ01vZGVsOiB7MH0nLCB0aGlzLm1vZGVsTmFtZSkpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHRoaXMuY3JlZGl0cyA9PT0gJ251bWJlcicgJiYgdGhpcy5jcmVkaXRzID4gMCkge1xuXHRcdFx0Y29uc3QgZm9ybWF0dGVkID0gZm9ybWF0Q29waWxvdENyZWRpdHModGhpcy5jcmVkaXRzKTtcblx0XHRcdHBhcnRzLnB1c2goZm9ybWF0dGVkID09PSAnMSdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5jcmVkaXRUb29sdGlwJywgJ3swfSBjcmVkaXQnLCBmb3JtYXR0ZWQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuY3JlZGl0c1Rvb2x0aXAnLCAnezB9IGNyZWRpdHMnLCBmb3JtYXR0ZWQpKTtcblx0XHR9XG5cblx0XHRpZiAocGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLl9jb2xsYXBzZUJ1dHRvbi5lbGVtZW50LCB7XG5cdFx0XHRjb250ZW50OiBwYXJ0cy5qb2luKCcgXHUyMDIyICcpLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLXJlYWRzIHRoZSBzdWJhZ2VudCdzIGNyZWRpdCAoQUlDKSB1c2FnZSBmcm9tIGB0b29sU3BlY2lmaWNEYXRhYCBhbmRcblx0ICogcmVmcmVzaGVzIHRoZSBob3ZlciB0b29sdGlwIHdoZW4gaXQgaGFzIGNoYW5nZWQuIENyZWRpdHMgY2FuIGFycml2ZVxuXHQgKiBpbmNyZW1lbnRhbGx5IHdoaWxlIHRoZSBzdWJhZ2VudCBydW5zIGFuZCBjb250aW51ZSB1cGRhdGluZyB1bnRpbCBpdHNcblx0ICogY2hpbGQgdHVybnMgcmVwb3J0IHRoZWlyIGZpbmFsIHVzYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgIT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3JlZGl0cyA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cztcblx0XHRpZiAodHlwZW9mIGNyZWRpdHMgPT09ICdudW1iZXInICYmIGNyZWRpdHMgIT09IHRoaXMuY3JlZGl0cykge1xuXHRcdFx0dGhpcy5jcmVkaXRzID0gY3JlZGl0cztcblx0XHRcdHRoaXMudXBkYXRlSG92ZXIoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmUtcmVhZHMgdGhlIHN1YmFnZW50J3MgbW9kZWwgbmFtZSBmcm9tIGB0b29sU3BlY2lmaWNEYXRhYCBhbmQgcmVmcmVzaGVzXG5cdCAqIHRoZSBob3ZlciB3aGVuIGl0IGNoYW5nZXMuIFRoZSBtb2RlbCBjYW4gYXJyaXZlIGluY3JlbWVudGFsbHkgKGUuZy4gYWdlbnRcblx0ICogaG9zdCBzdWJhZ2VudHMgcmVwb3J0IGl0IHZpYSB0aGVpciBjaGlsZCB0dXJucycgdXNhZ2UgZXZlbnRzKS5cblx0ICovXG5cdHByaXZhdGUgcmVmcmVzaE1vZGVsRnJvbVRvb2xEYXRhKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiB2b2lkIHtcblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCAhPT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbE5hbWUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZTtcblx0XHRpZiAobW9kZWxOYW1lICYmIG1vZGVsTmFtZSAhPT0gdGhpcy5tb2RlbE5hbWUpIHtcblx0XHRcdHRoaXMubW9kZWxOYW1lID0gbW9kZWxOYW1lO1xuXHRcdFx0dGhpcy51cGRhdGVIb3ZlcigpO1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbExhYmVsKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJyAmJiAhaXNMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSkpIHtcblx0XHRcdGNvbnN0IGludGVudGlvbiA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaW50ZW50aW9uPy5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRcdFx0aWYgKGludGVudGlvbikge1xuXHRcdFx0XHRyZXR1cm4gaW50ZW50aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlID0gdG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0Y29uc3QgbWVzc2FnZVRleHQgPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZTtcblx0XHRjb25zdCBsYWJlbCA9IG1lc3NhZ2VUZXh0LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdFx0aWYgKCFsYWJlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbElkV29yZHMgPSB0b29sSW52b2NhdGlvbi50b29sSWRcblx0XHRcdC5yZXBsYWNlKC8oW2EtelxcZF0pKFtBLVpdKS9nLCAnJDEgJDInKVxuXHRcdFx0LnNwbGl0KC9bXmEtekEtWlxcZF0rLylcblx0XHRcdC5maWx0ZXIoQm9vbGVhbik7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZExhYmVsID0gbGFiZWwudG9Mb2NhbGVMb3dlckNhc2UoKTtcblx0XHRjb25zdCBnZW5lcmljTGFiZWxzID0gW3Rvb2xJZFdvcmRzWzBdLCB0b29sSWRXb3Jkcy5qb2luKCcgJyldXG5cdFx0XHQuZmlsdGVyKChjYW5kaWRhdGUpOiBjYW5kaWRhdGUgaXMgc3RyaW5nID0+ICEhY2FuZGlkYXRlKVxuXHRcdFx0Lm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnRvTG9jYWxlTG93ZXJDYXNlKCkpO1xuXHRcdHJldHVybiBnZW5lcmljTGFiZWxzLmluY2x1ZGVzKG5vcm1hbGl6ZWRMYWJlbCkgPyB1bmRlZmluZWQgOiBsYWJlbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFja3MgYSB0b29sIGludm9jYXRpb24ncyBzdGF0ZSBmb3I6XG5cdCAqIDEuIFVwZGF0aW5nIHRoZSB0aXRsZSB3aXRoIHRoZSBjdXJyZW50IHRvb2wgbWVzc2FnZSAocGVyc2lzdHMgZXZlbiBhZnRlciBjb21wbGV0aW9uKVxuXHQgKiAyLiBBdXRvLWV4cGFuZGluZyB3aGVuIGEgdG9vbCBpcyB3YWl0aW5nIGZvciBjb25maXJtYXRpb25cblx0ICogMy4gQXV0by1jb2xsYXBzaW5nIHdoZW4gdGhlIGNvbmZpcm1hdGlvbiBpcyBhZGRyZXNzZWRcblx0ICogVGhpcyBtZXRob2QgaXMgcHVibGljIHRvIHN1cHBvcnQgdGVzdGluZy5cblx0ICovXG5cdHB1YmxpYyB0cmFja1Rvb2xTdGF0ZSh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogdm9pZCB7XG5cdFx0Ly8gT25seSB0cmFjayBsaXZlIHRvb2wgaW52b2NhdGlvbnNcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRpYWxTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGxldCB3YXNTdHJlYW1pbmdGb3JQcmVzZW50YXRpb24gPSBpbml0aWFsU3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nO1xuXHRcdGlmICghd2FzU3RyZWFtaW5nRm9yUHJlc2VudGF0aW9uKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbENhbGxJZCA9IHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQ7XG5cdFx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UgPSB0aGlzLmdldFRvb2xMYWJlbCh0b29sSW52b2NhdGlvbiwgaW5pdGlhbFN0YXRlKTtcblx0XHRcdHRoaXMuY3VycmVudFJ1bm5pbmdUb29sSWNvbiA9IHRoaXMuY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZSA/IGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSW52b2NhdGlvbi50b29sSWQsIHRvb2xJbnZvY2F0aW9uLmljb24pIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVBY3RpdmVUb29sUHJlc2VudGF0aW9uKHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQsIHRoaXMuY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZSwgdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xJY29uLCBpbml0aWFsU3RhdGUpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbFByZXNlbnRhdGlvbigpO1xuXHRcdH1cblx0XHRpZiAoaW5pdGlhbFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCB8fCBpbml0aWFsU3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFkZFRvb2xUb0Nhcm91c2VsID0gdGhpcy5fYWRkVG9vbFRvQ2Fyb3VzZWw7XG5cdFx0Y29uc3Qgc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gdGhpcy5fc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sO1xuXG5cdFx0bGV0IHdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRsZXQgd2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cdFx0Y29uc3QgdG9vbFN0YXRlQXV0b3J1biA9IGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocik7XG5cdFx0XHRpZiAod2FzU3RyZWFtaW5nRm9yUHJlc2VudGF0aW9uICYmIHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHR3YXNTdHJlYW1pbmdGb3JQcmVzZW50YXRpb24gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xDYWxsSWQgPSB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UgPSB0aGlzLmdldFRvb2xMYWJlbCh0b29sSW52b2NhdGlvbiwgc3RhdGUpO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbEljb24gPSB0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UgPyBnZXRUb29sSW52b2NhdGlvbkljb24odG9vbEludm9jYXRpb24udG9vbElkLCB0b29sSW52b2NhdGlvbi5pY29uKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy51cGRhdGVBY3RpdmVUb29sUHJlc2VudGF0aW9uKHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQsIHRoaXMuY3VycmVudFJ1bm5pbmdUb29sTWVzc2FnZSwgdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xJY29uLCBzdGF0ZSk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xQcmVzZW50YXRpb24oKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbENhbGxJZCA9PT0gdG9vbEludm9jYXRpb24udG9vbENhbGxJZCkge1xuXHRcdFx0XHRjb25zdCB0b29sTGFiZWwgPSB0aGlzLmdldFRvb2xMYWJlbCh0b29sSW52b2NhdGlvbiwgc3RhdGUpO1xuXHRcdFx0XHRpZiAodG9vbExhYmVsICYmIHRvb2xMYWJlbCAhPT0gdGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlID0gdG9vbExhYmVsO1xuXHRcdFx0XHRcdHRoaXMuY3VycmVudFJ1bm5pbmdUb29sSWNvbiA9IGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSW52b2NhdGlvbi50b29sSWQsIHRvb2xJbnZvY2F0aW9uLmljb24pO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQWN0aXZlVG9vbFByZXNlbnRhdGlvbih0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCB0aGlzLmN1cnJlbnRSdW5uaW5nVG9vbE1lc3NhZ2UsIHRoaXMuY3VycmVudFJ1bm5pbmdUb29sSWNvbiwgc3RhdGUpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xQcmVzZW50YXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0XHRcdHx8IHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWxcblx0XHRcdFx0fHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uO1xuXHRcdFx0Y29uc3QgaXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24gPSAhIWFkZFRvb2xUb0Nhcm91c2VsICYmIHNob3VsZFVzZUNhcm91c2VsRm9yVG9vbD8uKHRvb2xJbnZvY2F0aW9uLCBzdGF0ZSkgPT09IHRydWU7XG5cblx0XHRcdGlmIChpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgIXdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0dGhpcy50b29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24rKztcblx0XHRcdFx0aWYgKCF0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMuYXV0b0V4cGFuZGVkRm9yQ29uZmlybWF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgd29ya2luZyBzcGlubmVyIHdoaWxlIGNvbmZpcm1hdGlvbiBpcyBzaG93blxuXHRcdFx0XHR0aGlzLnJlbW92ZVdvcmtpbmdTcGlubmVyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgd2FzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHR0aGlzLnRvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbi0tO1xuXHRcdFx0XHRpZiAodGhpcy50b29sc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPT09IDAgJiYgdGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gJiYgIXRoaXMudXNlck1hbnVhbGx5RXhwYW5kZWQpIHtcblx0XHRcdFx0XHQvLyBBdXRvLWNvbGxhcHNlIG9ubHkgaWYgd2UgYXV0by1leHBhbmRlZCBhbmQgdXNlciBkaWRuJ3QgbWFudWFsbHkgZXhwYW5kXG5cdFx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLnNldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTaG93IHRoZSB3b3JraW5nIHNwaW5uZXIgYWdhaW4gaWYgc3RpbGwgYWN0aXZlIGFuZCBubyBtb3JlIGNvbmZpcm1hdGlvbnNcblx0XHRcdFx0aWYgKHRoaXMudG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID09PSAwICYmIHRoaXMuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHR0aGlzLnNob3dXb3JraW5nU3Bpbm5lcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbiAmJiAhd2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdHRoaXMudG9vbHNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24rKztcblx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbFByZXNlbnRhdGlvbigpO1xuXHRcdFx0XHRhZGRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdHRoaXMuc2hvd0NvbmZpcm1hdGlvblBsYWNlaG9sZGVyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbiAmJiB3YXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb24pIHtcblx0XHRcdFx0dGhpcy50b29sc1dhaXRpbmdGb3JDYXJvdXNlbENvbmZpcm1hdGlvbi0tO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sUHJlc2VudGF0aW9uKCk7XG5cdFx0XHRcdGlmICh0aGlzLnRvb2xzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5oaWRlQ29uZmlybWF0aW9uUGxhY2Vob2xkZXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpcm1hdGlvblBsYWNlaG9sZGVyTGFiZWwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR3YXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID0gaXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uO1xuXHRcdFx0d2FzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uID0gaXNXYWl0aW5nRm9yQ2Fyb3VzZWxDb25maXJtYXRpb247XG5cblx0XHRcdC8vIE9uIHRlcm1pbmFsIHN0YXRlLCBkaXNwb3NlIHRoaXMgYXV0b3J1biAoZGVmZXJyZWQgc28gd2UgZG9uJ3QgZGlzcG9zZSBpdCBtaWQtcnVuKSB0byBhdm9pZCBsZWFraW5nIGEgbGlzdGVuZXIgcGVyIHRvb2wgaW52b2NhdGlvbi5cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLmFjdGl2ZVRvb2xQcmVzZW50YXRpb25zLmRlbGV0ZSh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xQcmVzZW50YXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB0aGlzLl90b29sU3RhdGVUcmFja2luZy5kZWxldGUodG9vbFN0YXRlQXV0b3J1bikpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3Rvb2xTdGF0ZVRyYWNraW5nLmFkZCh0b29sU3RhdGVBdXRvcnVuKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWN0aXZlVG9vbFByZXNlbnRhdGlvbih0b29sQ2FsbElkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCwgc3RhdGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZVRvb2xQcmVzZW50YXRpb25zLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRpZiAobGFiZWwgJiYgaWNvbikge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50VG9vbFByZXNlbnRhdGlvbiA9IHsgY2FsbElkOiB0b29sQ2FsbElkLCBsYWJlbCwgaWNvbiB9O1xuXHRcdH1cblx0XHRpZiAobGFiZWwgJiYgaWNvbiAmJiBzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgJiYgc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZVRvb2xQcmVzZW50YXRpb25zLnNldCh0b29sQ2FsbElkLCB7IGxhYmVsLCBpY29uIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlybWF0aW9uUGxhY2Vob2xkZXJUZXh0KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLnRvb2xzV2FpdGluZ0ZvckNhcm91c2VsQ29uZmlybWF0aW9uO1xuXHRcdHJldHVybiBjb3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5wZW5kaW5nQ29uZmlybWF0aW9uJywgJzEgcGVuZGluZyBjb25maXJtYXRpb24nKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5wZW5kaW5nQ29uZmlybWF0aW9ucycsICd7MH0gcGVuZGluZyBjb25maXJtYXRpb25zJywgY291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5nZXRDb25maXJtYXRpb25QbGFjZWhvbGRlclRleHQoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogU2hvd3MgYSBwbGFjZWhvbGRlciB0aGF0IGp1bXBzIGJhY2sgdG8gdGhlIGNhcm91c2VsLiAqL1xuXHRwcml2YXRlIHNob3dDb25maXJtYXRpb25QbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXIpIHtcblx0XHRcdHRoaXMudXBkYXRlQ29uZmlybWF0aW9uUGxhY2Vob2xkZXJMYWJlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gJCgnYnV0dG9uLmNoYXQtc3ViYWdlbnQtY29uZmlybWF0aW9uLXBsYWNlaG9sZGVyJyk7XG5cdFx0Y29uc3QgbGFiZWwgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGxhY2Vob2xkZXItbGFiZWwnKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuZ2V0Q29uZmlybWF0aW9uUGxhY2Vob2xkZXJUZXh0KCk7XG5cdFx0cGxhY2Vob2xkZXIuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0dGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHR0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlckxhYmVsID0gbGFiZWw7XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHBsYWNlaG9sZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocGxhY2Vob2xkZXIsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fbmF2aWdhdGVUb0Nhcm91c2VsPy4odGhpcy5zdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyRGlzcG9zYWJsZS52YWx1ZSA9IHBsYWNlaG9sZGVyRGlzcG9zYWJsZXM7XG5cblx0XHRpZiAoIXRoaXMuaGFzVG9vbEl0ZW1zKSB7XG5cdFx0XHR0aGlzLmhhc1Rvb2xJdGVtcyA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0dGhpcy5hdXRvRXhwYW5kZWRGb3JDb25maXJtYXRpb24gPSB0cnVlO1xuXHRcdFx0dGhpcy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHR0aGlzLndyYXBwZXIuYXBwZW5kQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdH1cblx0XHR0aGlzLmxheW91dFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlQ29uZmlybWF0aW9uUGxhY2Vob2xkZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtYXRpb25QbGFjZWhvbGRlci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXJMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyRGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogS2VlcHMgdGhlIGNhcm91c2VsIHBsYWNlaG9sZGVyIGFmdGVyIHZpc2libGUgdG9vbCBvdXRwdXQuICovXG5cdHByaXZhdGUgZW5zdXJlUGxhY2Vob2xkZXJBdEJvdHRvbSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlybWF0aW9uUGxhY2Vob2xkZXI/LnBhcmVudEVsZW1lbnQgPT09IHRoaXMud3JhcHBlcikge1xuXHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2F0Y2hlcyB0aGUgdG9vbCBpbnZvY2F0aW9uIGZvciBjb21wbGV0aW9uIGFuZCByZW5kZXJzIHRoZSByZXN1bHQuXG5cdCAqIEhhbmRsZXMgYm90aCBsaXZlIGFuZCBzZXJpYWxpemVkIGludm9jYXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSB3YXRjaFRvb2xDb21wbGV0aW9uKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiB2b2lkIHtcblx0XHQvLyBPbmx5IHdhdGNoIHBhcmVudCBzdWJhZ2VudCB0b29scyBmb3IgY29tcGxldGlvblxuXHRcdGlmICghQ2hhdFN1YmFnZW50Q29udGVudFBhcnQuaXNQYXJlbnRTdWJhZ2VudFRvb2wodG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdC8vIFdhdGNoIGZvciBjb21wbGV0aW9uIGFuZCByZW5kZXIgdGhlIHJlc3VsdFxuXHRcdFx0bGV0IHdhc1N0cmVhbWluZyA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZztcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyKTtcblx0XHRcdFx0dGhpcy5yZWZyZXNoQWN0aXZlU3RhdGVGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hBY3Rpdml0eUZyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpIHtcblx0XHRcdFx0XHR3YXNTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdFx0XHQvLyBFeHRyYWN0IHRleHQgZnJvbSByZXN1bHRcblx0XHRcdFx0XHRjb25zdCB0ZXh0UGFydHMgPSAoc3RhdGUuY29udGVudEZvck1vZGVsIHx8IFtdKVxuXHRcdFx0XHRcdFx0LmZpbHRlcigocGFydCk6IHBhcnQgaXMgeyBraW5kOiAndGV4dCc7IHZhbHVlOiBzdHJpbmcgfSA9PiBwYXJ0LmtpbmQgPT09ICd0ZXh0Jylcblx0XHRcdFx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LnZhbHVlKTtcblxuXHRcdFx0XHRcdGlmICh0ZXh0UGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJSZXN1bHRUZXh0KHRleHRQYXJ0cy5qb2luKCdcXG4nKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGRlc2NyaXB0aW9uIGFuZCBtb2RlbCBuYW1lIGZyb20gdG9vbFNwZWNpZmljRGF0YSAoc2V0IGR1cmluZyBpbnZva2UoKSlcblx0XHRcdFx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5kZXNjcmlwdGlvbiA9IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5tb2RlbE5hbWUgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZTtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVIb3ZlcigpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVPcGVuQ2hhdFRvb2xiYXJDb250ZXh0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIENyZWRpdHMgKEFJQykgbWF5IGFycml2ZSBhdCBvciBhZnRlciBjb21wbGV0aW9uIGFzIHRoZVxuXHRcdFx0XHRcdC8vIHN1YmFnZW50J3MgY2hpbGQgdHVybnMgcmVwb3J0IHRoZWlyIGZpbmFsIHVzYWdlLlxuXHRcdFx0XHRcdHRoaXMucmVmcmVzaENyZWRpdHNGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb24pO1xuXG5cdFx0XHRcdFx0Ly8gVGhlIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgbWF5IGhhdmUgYXJyaXZlZCB3aXRoIGNvbXBsZXRpb24uXG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRMaW5rKCk7XG5cblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNFeHRlcm5hbGx5QWN0aXZlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1hcmtBc0luYWN0aXZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHdhc1N0cmVhbWluZyAmJiBzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0XHR3YXNTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdFx0XHQvLyBVcGRhdGUgdGhpbmdzIHRoYXQgY2hhbmdlIHdoZW4gdG9vbCBpcyBkb25lIHN0cmVhbWluZ1xuXHRcdFx0XHRcdGNvbnN0IHsgZGVzY3JpcHRpb24sIGlzRGVmYXVsdERlc2NyaXB0aW9uLCBhZ2VudE5hbWUsIHByb21wdCwgbW9kZWxOYW1lIH0gPSBDaGF0U3ViYWdlbnRDb250ZW50UGFydC5leHRyYWN0U3ViYWdlbnRJbmZvKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0dGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gPSBpc0RlZmF1bHREZXNjcmlwdGlvbjtcblx0XHRcdFx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHRcdFx0XHR0aGlzLnByb21wdCA9IHByb21wdDtcblx0XHRcdFx0XHRpZiAobW9kZWxOYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlSG92ZXIoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0VG9vbGJhckNvbnRleHQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJQcm9tcHRTZWN0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVUaXRsZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0XHQvLyB0b29sU3BlY2lmaWNEYXRhIHdhcyB1cGRhdGVkIGFmdGVyIGluaXRpYWwgcmVuZGVyIChlLmcuXG5cdFx0XHRcdFx0Ly8gc3ViYWdlbnQgY29udGVudCBhcnJpdmVkIHZpYSBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZFxuXHRcdFx0XHRcdC8vIGFmdGVyIHRoZSBwYXJ0IHdhcyBmaXJzdCBjb25zdHJ1Y3RlZCBpbiBQZW5kaW5nQ29uZmlybWF0aW9uKS5cblx0XHRcdFx0XHQvLyBSZS1yZWFkIG1ldGFkYXRhIGFuZCB1cGRhdGUgdGhlIHRpdGxlIGlmIHJlYWwgdmFsdWVzIGFyZVxuXHRcdFx0XHRcdC8vIG5vdyBhdmFpbGFibGUgdGhhdCB3ZSBkaWRuJ3QgaGF2ZSBiZWZvcmUuXG5cdFx0XHRcdFx0Y29uc3QgeyBkZXNjcmlwdGlvbiwgaXNEZWZhdWx0RGVzY3JpcHRpb24sIGFnZW50TmFtZSB9ID0gQ2hhdFN1YmFnZW50Q29udGVudFBhcnQuZXh0cmFjdFN1YmFnZW50SW5mbyh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb25DaGFuZ2VkID0gdGhpcy5faXNEZWZhdWx0RGVzY3JpcHRpb24gJiYgIWlzRGVmYXVsdERlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50TmFtZUNoYW5nZWQgPSAhIWFnZW50TmFtZSAmJiBhZ2VudE5hbWUgIT09IHRoaXMuYWdlbnROYW1lO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbkNoYW5nZWQgfHwgYWdlbnROYW1lQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0aWYgKGRlc2NyaXB0aW9uQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2lzRGVmYXVsdERlc2NyaXB0aW9uID0gaXNEZWZhdWx0RGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoYWdlbnROYW1lQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlVGl0bGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ3JlZGl0c0Zyb21Ub29sRGF0YSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoTW9kZWxGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU9wZW5DaGF0TGluaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmVzdWx0KSB7XG5cdFx0XHQvLyBSZW5kZXIgdGhlIHBlcnNpc3RlZCByZXN1bHQgZm9yIHNlcmlhbGl6ZWQgaW52b2NhdGlvbnNcblx0XHRcdHRoaXMucmVuZGVyUmVzdWx0VGV4dCh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJlc3VsdCk7XG5cdFx0XHQvLyBBbHJlYWR5IGNvbXBsZXRlLCBtYXJrIGFzIGluYWN0aXZlXG5cdFx0XHR0aGlzLm1hcmtBc0luYWN0aXZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoQWN0aXZpdHlGcm9tVG9vbERhdGEodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2aXR5ID0gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuYWN0aXZpdHkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGl2aXR5ICE9PSB0aGlzLnN1YmFnZW50QWN0aXZpdHkpIHtcblx0XHRcdHRoaXMuc3ViYWdlbnRBY3Rpdml0eSA9IGFjdGl2aXR5O1xuXHRcdFx0dGhpcy5fdXBkYXRlT3BlbkNoYXRUb29sYmFyQ29udGV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSByZXN1bHQgdGV4dCBhcyBhIGNvbGxhcHNpYmxlIHNlY3Rpb24uXG5cdCAqIElmIHRoZSB3cmFwcGVyIGRvZXNuJ3QgZXhpc3QgeWV0IChsYXp5IGluaXQpIG9yIHN1YmFnZW50IGlzIGluaXRpYWxseSBjb21wbGV0ZSxcblx0ICogdGhpcyBpcyBkZWZlcnJlZCB1bnRpbCBleHBhbmRlZC5cblx0ICovXG5cdHB1YmxpYyByZW5kZXJSZXN1bHRUZXh0KHJlc3VsdFRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnJlc3VsdENvbnRhaW5lciB8fCAhcmVzdWx0VGV4dCkge1xuXHRcdFx0cmV0dXJuOyAvLyBBbHJlYWR5IHJlbmRlcmVkIG9yIG5vIGNvbnRlbnRcblx0XHR9XG5cblx0XHQvLyBEZWZlciByZW5kZXJpbmcgd2hlbiB3cmFwcGVyIGRvZXNuJ3QgZXhpc3QgeWV0IChsYXp5IGluaXQpIG9yIGZvciBvbGQgY29tcGxldGVkIHN1YmFnZW50cyB1bnRpbCBleHBhbmRlZFxuXHRcdGlmICghdGhpcy53cmFwcGVyIHx8ICh0aGlzLmlzSW5pdGlhbGx5Q29tcGxldGUgJiYgIXRoaXMuaXNFeHBhbmRlZCgpICYmICF0aGlzLmhhc0V4cGFuZGVkT25jZSkpIHtcblx0XHRcdHRoaXMucGVuZGluZ1Jlc3VsdFRleHQgPSByZXN1bHRUZXh0O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1Jlc3VsdFRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kb1JlbmRlclJlc3VsdFRleHQocmVzdWx0VGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVuZGVyUmVzdWx0VGV4dChyZXN1bHRUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5yZXN1bHRDb250YWluZXIgfHwgIXJlc3VsdFRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTcGxpdCBpbnRvIGZpcnN0IGxpbmUgYW5kIHJlc3Rcblx0XHRjb25zdCBsaW5lcyA9IHJlc3VsdFRleHQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IHJhd0ZpcnN0TGluZSA9IGxpbmVzWzBdIHx8ICcnO1xuXHRcdGNvbnN0IHJlc3RPZkxpbmVzID0gbGluZXMuc2xpY2UoMSkuam9pbignXFxuJykudHJpbSgpO1xuXG5cdFx0Ly8gTGltaXQgZmlyc3QgbGluZSBsZW5ndGgsIG1vdmluZyBvdmVyZmxvdyB0byBjb250ZW50XG5cdFx0Y29uc3QgdGl0bGVDb250ZW50ID0gcmN1dChyYXdGaXJzdExpbmUsIE1BWF9USVRMRV9MRU5HVEgpO1xuXHRcdGNvbnN0IHdhc1RydW5jYXRlZCA9IHJhd0ZpcnN0TGluZS5sZW5ndGggPiBNQVhfVElUTEVfTEVOR1RIO1xuXHRcdGNvbnN0IHRpdGxlID0gd2FzVHJ1bmNhdGVkID8gdGl0bGVDb250ZW50ICsgJ1x1MjAyNicgOiB0aXRsZUNvbnRlbnQ7XG5cdFx0Y29uc3QgdGl0bGVSZW1haW5kZXIgPSByYXdGaXJzdExpbmUubGVuZ3RoID4gdGl0bGVDb250ZW50Lmxlbmd0aCA/IHJhd0ZpcnN0TGluZS5zbGljZSh0aXRsZUNvbnRlbnQubGVuZ3RoKS50cmltKCkgOiAnJztcblx0XHRjb25zdCBjb250ZW50ID0gdGl0bGVSZW1haW5kZXJcblx0XHRcdD8gKHRpdGxlUmVtYWluZGVyICsgKHJlc3RPZkxpbmVzID8gJ1xcbicgKyByZXN0T2ZMaW5lcyA6ICcnKSlcblx0XHRcdDogcmVzdE9mTGluZXM7XG5cblx0XHQvLyBDcmVhdGUgY29sbGFwc2libGUgcmVzdWx0IHBhcnRcblx0XHRjb25zdCBjb2xsYXBzaWJsZVBhcnQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdENvbGxhcHNpYmxlTWFya2Rvd25Db250ZW50UGFydCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdHRoaXMuY29udGV4dCxcblx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyXG5cdFx0KSk7XG5cblx0XHQvLyBXcmFwIGluIGEgY29udGFpbmVyIGZvciBjaGFpbiBvZiB0aG91Z2h0IGxpbmUgc3R5bGluZ1xuXHRcdHRoaXMucmVzdWx0Q29udGFpbmVyID0gJCgnLmNoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyLmNoYXQtc3ViYWdlbnQtc2VjdGlvbicpO1xuXHRcdGNvbnN0IHJlc3VsdEljb24gPSBjcmVhdGVUaGlua2luZ0ljb24oQ29kaWNvbi5jaGVjayk7XG5cdFx0dGhpcy5yZXN1bHRDb250YWluZXIuYXBwZW5kQ2hpbGQocmVzdWx0SWNvbik7XG5cdFx0dGhpcy5yZXN1bHRDb250YWluZXIuYXBwZW5kQ2hpbGQoY29sbGFwc2libGVQYXJ0LmRvbU5vZGUpO1xuXG5cdFx0Ly8gV2l0aCBsYXp5IHJlbmRlcmluZywgd3JhcHBlciBtYXkgbm90IGJlIGNyZWF0ZWQgeWV0IGlmIGNvbnRlbnQgaGFzbid0IGJlZW4gZXhwYW5kZWRcblx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMud3JhcHBlciwgdGhpcy5yZXN1bHRDb250YWluZXIpO1xuXG5cdFx0XHQvLyBTaG93IHRoZSBjb250YWluZXIgaWYgaXQgd2FzIGhpZGRlblxuXHRcdFx0aWYgKHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBhIHRvb2wgaW52b2NhdGlvbiB0byB0aGUgc3ViYWdlbnQgZ3JvdXAuXG5cdCAqIFRoZSB0b29sIHBhcnQgaXMgY3JlYXRlZCBsYXppbHkgLSBvbmx5IHdoZW4gdGhlIHN1YmFnZW50IHNlY3Rpb24gaXMgZXhwYW5kZWQsXG5cdCAqIHVubGVzcyBpdCdzIGFjdGl2ZWx5IHN0cmVhbWluZyAobm90IGluaXRpYWxseSBjb21wbGV0ZSksIGluIHdoaWNoIGNhc2UgcmVuZGVyIGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0cHVibGljIGFwcGVuZFRvb2xJbnZvY2F0aW9uKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIFNob3cgdGhlIGNvbnRhaW5lciB3aGVuIGZpcnN0IHRvb2wgaXRlbSBpcyBhZGRlZFxuXHRcdGlmICghdGhpcy5oYXNUb29sSXRlbXMpIHtcblx0XHRcdHRoaXMuaGFzVG9vbEl0ZW1zID0gdHJ1ZTtcblx0XHRcdC8vIFdpdGggbGF6eSByZW5kZXJpbmcsIHdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiBjb250ZW50IGhhc24ndCBiZWVuIGV4cGFuZGVkXG5cdFx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgdG9vbCBzdGF0ZSBmb3IgdGl0bGUgdXBkYXRlcyBhbmQgYXV0by1leHBhbmQvY29sbGFwc2Ugb24gY29uZmlybWF0aW9uXG5cdFx0dGhpcy50cmFja1Rvb2xTdGF0ZSh0b29sSW52b2NhdGlvbik7XG5cblx0XHQvLyBSZW5kZXIgaW1tZWRpYXRlbHkgb25seSBpZiBhbHJlYWR5IGV4cGFuZGVkIG9yIGhhcyBiZWVuIGV4cGFuZGVkIGJlZm9yZVxuXHRcdGlmICh0aGlzLmlzRXhwYW5kZWQoKSB8fCB0aGlzLmhhc0V4cGFuZGVkT25jZSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuY3JlYXRlVG9vbFBhcnQodG9vbEludm9jYXRpb24sIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0dGhpcy5hcHBlbmRUb29sUGFydFRvRE9NKHBhcnQsIHRvb2xJbnZvY2F0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVmZXIgcmVuZGVyaW5nIHVudGlsIGV4cGFuZGVkXG5cdFx0XHRjb25zdCBpdGVtOiBJTGF6eVRvb2xJdGVtID0ge1xuXHRcdFx0XHRraW5kOiAndG9vbCcsXG5cdFx0XHRcdGxhenk6IG5ldyBMYXp5KCgpID0+IHRoaXMuY3JlYXRlVG9vbFBhcnQodG9vbEludm9jYXRpb24sIGNvZGVCbG9ja1N0YXJ0SW5kZXgpKSxcblx0XHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5sYXp5SXRlbXMucHVzaChpdGVtKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwZW5kcyBhIG1hcmtkb3duIGl0ZW0gKGUuZy4sIGFuIGVkaXQgcGlsbCkgdG8gdGhlIHN1YmFnZW50IGNvbnRlbnQgcGFydC5cblx0ICogVGhpcyBpcyB1c2VkIHRvIHJvdXRlIGNvZGVibG9ja1VyaSBwYXJ0cyB3aXRoIHN1YkFnZW50SW52b2NhdGlvbklkIHRvIHRoaXMgc3ViYWdlbnQncyBjb250YWluZXIuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIGNhbGxlciBoYXMgYWxyZWFkeSBjcmVhdGVkIHRoZSBjb250ZW50IHBhcnQgZWFnZXJseSAoZm9yIGV4YW1wbGUsIGFcblx0ICogcHJlLWJ1aWx0IGBDaGF0TWFya2Rvd25Db250ZW50UGFydGAgd3JhcHBlZCBpbiBhIGZhY3RvcnkpLCB0aGUgY2FsbGVyIE1VU1QgcGFzc1xuXHQgKiB0aGF0IHBhcnQgYXMgYGVhZ2VyRGlzcG9zYWJsZWAgc28gaXQgaXMgcmVnaXN0ZXJlZCBvbiB0aGlzIHN1YmFnZW50IHBhcnRcblx0ICogaW1tZWRpYXRlbHkuIE90aGVyd2lzZSwgaWYgdGhlIHN1YmFnZW50IHNlY3Rpb24gaXMgY29sbGFwc2VkIGFuZCB0aGUgbGF6eSBpdGVtXG5cdCAqIGlzIG5ldmVyIG1hdGVyaWFsaXplZCwgdGhlIGVhZ2VybHktY3JlYXRlZCBwYXJ0IHdvdWxkIGxlYWsuXG5cdCAqL1xuXHRwdWJsaWMgYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdGZhY3Rvcnk6ICgpID0+IHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSB9LFxuXHRcdF9jb2RlYmxvY2tzUGFydElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0X21hcmtkb3duOiBJQ2hhdE1hcmtkb3duQ29udGVudCxcblx0XHRfb3JpZ2luYWxQYXJlbnQ/OiBIVE1MRWxlbWVudCxcblx0XHRlYWdlckRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSxcblx0KTogdm9pZCB7XG5cdFx0Ly8gUmVnaXN0ZXIgYW55IGNhbGxlci1vd25lZCBkaXNwb3NhYmxlIHVwLWZyb250IHNvIGl0IGlzIGFsd2F5cyBjbGVhbmVkIHVwXG5cdFx0Ly8gd2l0aCB0aGlzIHN1YmFnZW50IHBhcnQsIGV2ZW4gaWYgdGhlIGxhenkgaXRlbSBpcyBuZXZlciBtYXRlcmlhbGl6ZWQuXG5cdFx0aWYgKGVhZ2VyRGlzcG9zYWJsZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWFnZXJEaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHQvLyBJZiBleHBhbmRlZCBvciBoYXMgYmVlbiBleHBhbmRlZCBvbmNlLCByZW5kZXIgaW1tZWRpYXRlbHlcblx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkgfHwgdGhpcy5oYXNFeHBhbmRlZE9uY2UpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZhY3RvcnkoKTtcblx0XHRcdHRoaXMuYXBwZW5kTWFya2Rvd25JdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUpO1xuXHRcdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlICYmIHJlc3VsdC5kaXNwb3NhYmxlICE9PSBlYWdlckRpc3Bvc2FibGUpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVzdWx0LmRpc3Bvc2FibGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBEZWZlciByZW5kZXJpbmcgdW50aWwgZXhwYW5kZWRcblx0XHRcdGNvbnN0IGl0ZW06IElMYXp5TWFya2Rvd25JdGVtID0ge1xuXHRcdFx0XHRraW5kOiAnbWFya2Rvd24nLFxuXHRcdFx0XHRsYXp5OiBuZXcgTGF6eShmYWN0b3J5KSxcblx0XHRcdFx0ZWFnZXJseVJlZ2lzdGVyZWQ6ICEhZWFnZXJEaXNwb3NhYmxlLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGF6eUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSBob29rIGl0ZW0gKGJsb2NrZWQvd2FybmluZykgdG8gdGhlIHN1YmFnZW50IGNvbnRlbnQgcGFydC5cblx0ICovXG5cdHB1YmxpYyBhcHBlbmRIb29rSXRlbShcblx0XHRmYWN0b3J5OiAoKSA9PiB7IGRvbU5vZGU6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGUgfSxcblx0XHRob29rUGFydDogSUNoYXRIb29rUGFydFxuXHQpOiB2b2lkIHtcblx0XHQvLyB1cGRhdGUgdGl0bGUgd2l0aCBob29rIG1lc3NhZ2Vcblx0XHRjb25zdCBob29rTWVzc2FnZSA9IGhvb2tQYXJ0LnN0b3BSZWFzb25cblx0XHRcdD8gKGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdob29rLnN1YmFnZW50LmJsb2NrZWQnLCAnQmxvY2tlZCB7MH0nLCBob29rUGFydC50b29sRGlzcGxheU5hbWUpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2hvb2suc3ViYWdlbnQuYmxvY2tlZEdlbmVyaWMnLCAnQmxvY2tlZCBieSBob29rJykpXG5cdFx0XHQ6IChob29rUGFydC50b29sRGlzcGxheU5hbWVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnaG9vay5zdWJhZ2VudC53YXJuaW5nJywgJ1dhcm5pbmcgZm9yIHswfScsIGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnaG9vay5zdWJhZ2VudC53YXJuaW5nR2VuZXJpYycsICdIb29rIHdhcm5pbmcnKSk7XG5cdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xNZXNzYWdlID0gaG9va01lc3NhZ2U7XG5cdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xDYWxsSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50UnVubmluZ1Rvb2xJY29uID0gaG9va1BhcnQuc3RvcFJlYXNvbiA/IENvZGljb24uZXJyb3IgOiBDb2RpY29uLndhcm5pbmc7XG5cdFx0dGhpcy5fdXBkYXRlVG9vbFByZXNlbnRhdGlvbigpO1xuXG5cdFx0aWYgKHRoaXMuaXNFeHBhbmRlZCgpIHx8IHRoaXMuaGFzRXhwYW5kZWRPbmNlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmYWN0b3J5KCk7XG5cdFx0XHR0aGlzLmFwcGVuZEhvb2tJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGhvb2tQYXJ0KTtcblx0XHRcdGlmIChyZXN1bHQuZGlzcG9zYWJsZSkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXN1bHQuZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW06IElMYXp5SG9va0l0ZW0gPSB7XG5cdFx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdFx0bGF6eTogbmV3IExhenkoZmFjdG9yeSksXG5cdFx0XHRcdGhvb2tQYXJ0LFxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGF6eUl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSBob29rIGl0ZW0ncyBET00gbm9kZSB0byB0aGUgd3JhcHBlci5cblx0ICovXG5cdHByaXZhdGUgYXBwZW5kSG9va0l0ZW1Ub0RPTShkb21Ob2RlOiBIVE1MRWxlbWVudCwgaG9va1BhcnQ6IElDaGF0SG9va1BhcnQpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtV3JhcHBlciA9ICQoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpO1xuXHRcdGNvbnN0IGljb24gPSBob29rUGFydC5zdG9wUmVhc29uID8gQ29kaWNvbi5lcnJvciA6IENvZGljb24ud2FybmluZztcblx0XHRjb25zdCBpY29uRWxlbWVudCA9IGNyZWF0ZVRoaW5raW5nSWNvbihpY29uKTtcblx0XHRpdGVtV3JhcHBlci5hcHBlbmRDaGlsZChpY29uRWxlbWVudCk7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cblx0XHQvLyBUcmVhdCBob29rIGl0ZW1zIGFzIHRvb2wgaXRlbXMgZm9yIHZpc2liaWxpdHkgcHVycG9zZXNcblx0XHRpZiAoIXRoaXMuaGFzVG9vbEl0ZW1zKSB7XG5cdFx0XHR0aGlzLmhhc1Rvb2xJdGVtcyA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud3JhcHBlcikge1xuXHRcdFx0aWYgKHRoaXMucmVzdWx0Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5pbnNlcnRCZWZvcmUoaXRlbVdyYXBwZXIsIHRoaXMucmVzdWx0Q29udGFpbmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMud3JhcHBlci5hcHBlbmRDaGlsZChpdGVtV3JhcHBlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubGFzdEl0ZW1XcmFwcGVyID0gaXRlbVdyYXBwZXI7XG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgbWFya2Rvd24gaXRlbSdzIERPTSBub2RlIHRvIHRoZSB3cmFwcGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhcHBlbmRNYXJrZG93bkl0ZW1Ub0RPTShkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICghZG9tTm9kZS5oYXNDaGlsZE5vZGVzKCkgfHwgZG9tTm9kZS50ZXh0Q29udGVudD8udHJpbSgpID09PSAnJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdyYXAgd2l0aCBpY29uIGxpa2Ugb3RoZXIgaXRlbXNcblx0XHRjb25zdCBpdGVtV3JhcHBlciA9ICQoJy5jaGF0LXRoaW5raW5nLXRvb2wtd3JhcHBlcicpO1xuXHRcdGNvbnN0IGljb25FbGVtZW50ID0gY3JlYXRlVGhpbmtpbmdJY29uKENvZGljb24uZWRpdCk7XG5cdFx0aXRlbVdyYXBwZXIuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0aXRlbVdyYXBwZXIuaW5zZXJ0QmVmb3JlKGljb25FbGVtZW50LCBpdGVtV3JhcHBlci5maXJzdENoaWxkKTtcblxuXHRcdC8vIEluc2VydCBiZWZvcmUgcmVzdWx0IGNvbnRhaW5lciBpZiBpdCBleGlzdHMsIG90aGVyd2lzZSBhcHBlbmRcblx0XHRpZiAodGhpcy53cmFwcGVyKSB7XG5cdFx0XHRpZiAodGhpcy5yZXN1bHRDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmluc2VydEJlZm9yZShpdGVtV3JhcHBlciwgdGhpcy5yZXN1bHRDb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKGl0ZW1XcmFwcGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sYXN0SXRlbVdyYXBwZXIgPSBpdGVtV3JhcHBlcjtcblxuXHRcdC8vIFNjaGVkdWxlIGxheW91dCB0byBtZWFzdXJlIGxhc3QgaXRlbSBhbmQgc2Nyb2xsXG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRJbml0RWFybHkoKTogYm9vbGVhbiB7XG5cdFx0Ly8gTmV2ZXIgaW5pdCBlYXJseSAtIHN1YmFnZW50IGlzIGNvbGxhcHNlZCB3aGlsZSBydW5uaW5nLCBjb250ZW50IG9ubHkgc2hvd24gb24gZXhwYW5kXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3VsZEFuaW1hdGVDb250ZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5pc0FjdGl2ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRQcmVwYXJlQ29udGVudEFuaW1hdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCBmb3IgdGhlIGdpdmVuIHRvb2wgaW52b2NhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlVG9vbFBhcnQodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyKTogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbEludm9jYXRpb25QYXJ0LFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcixcblx0XHRcdHRoaXMubGlzdFBvb2wsXG5cdFx0XHR0aGlzLmVkaXRvclBvb2wsXG5cdFx0XHR0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlLFxuXHRcdFx0dGhpcy5hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLFxuXHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgdG9vbCBwYXJ0J3MgRE9NIG5vZGUgdG8gdGhlIHdyYXBwZXIgd2l0aCBhcHByb3ByaWF0ZSBpY29uIHdyYXBwZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFwcGVuZFRvb2xQYXJ0VG9ET00ocGFydDogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBwYXJ0LmRvbU5vZGU7XG5cdFx0aWYgKCFjb250ZW50Lmhhc0NoaWxkTm9kZXMoKSB8fCBjb250ZW50LnRleHRDb250ZW50Py50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV3JhcCB3aXRoIGljb24gbGlrZSB0aGlua2luZyBwYXJ0cyBkb1xuXHRcdGNvbnN0IGl0ZW1XcmFwcGVyID0gJCgnLmNoYXQtdGhpbmtpbmctdG9vbC13cmFwcGVyJyk7XG5cdFx0Y29uc3QgaWNvbiA9IGdldFRvb2xJbnZvY2F0aW9uSWNvbih0b29sSW52b2NhdGlvbi50b29sSWQsIHRvb2xJbnZvY2F0aW9uLmljb24pO1xuXHRcdGNvbnN0IGljb25FbGVtZW50ID0gY3JlYXRlVGhpbmtpbmdJY29uKGljb24pO1xuXHRcdGl0ZW1XcmFwcGVyLmFwcGVuZENoaWxkKGNvbnRlbnQpO1xuXG5cdFx0Ly8gRHluYW1pY2FsbHkgYWRkL3JlbW92ZSBpY29uIGJhc2VkIG9uIGNvbmZpcm1hdGlvbiBzdGF0ZVxuXHRcdGlmICh0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRjb25zdCBzaG91bGRVc2VDYXJvdXNlbEZvclRvb2wgPSB0aGlzLl9zaG91bGRVc2VDYXJvdXNlbEZvclRvb2w7XG5cdFx0XHRjb25zdCBpY29uQXV0b3J1biA9IGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyKTtcblx0XHRcdFx0Y29uc3QgaGFzQ29uZmlybWF0aW9uID0gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiB8fFxuXHRcdFx0XHRcdHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWw7XG5cdFx0XHRcdGNvbnN0IHNob3VsZEhpZGVJbmxpbmUgPSBzaG91bGRVc2VDYXJvdXNlbEZvclRvb2w/Lih0b29sSW52b2NhdGlvbiwgc3RhdGUpID09PSB0cnVlO1xuXHRcdFx0XHRpZiAoaGFzQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0aWNvbkVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0aWYgKHNob3VsZEhpZGVJbmxpbmUpIHtcblx0XHRcdFx0XHRcdGl0ZW1XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGl0ZW1XcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFpY29uRWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpdGVtV3JhcHBlci5pbnNlcnRCZWZvcmUoaWNvbkVsZW1lbnQsIGl0ZW1XcmFwcGVyLmZpcnN0Q2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGhpcy5fdXNlQ2Fyb3VzZWxGb3JDb25maXJtYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRpdGVtV3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0XHQvLyBSZS1wb3NpdGlvbiB0aGUgY29uZmlybWF0aW9uIHBsYWNlaG9sZGVyIHRvIHN0YXkgYXQgdGhlIGJvdHRvbVxuXHRcdFx0XHRcdFx0dGhpcy5lbnN1cmVQbGFjZWhvbGRlckF0Qm90dG9tKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGVybWluYWwgc3RhdGUgaXMgZmluYWwgYW5kIHNldHRsZXMgaW50byB0aGUgbm9uLWNvbmZpcm1hdGlvbiBicmFuY2ggYWJvdmUsIHNvIGRpc3Bvc2UgKGRlZmVycmVkIHNvIHdlIGRvbid0IGRpc3Bvc2UgaXQgbWlkLXJ1bikgdG8gYXZvaWQgbGVha2luZyBhIGxpc3RlbmVyIHBlciB0b29sIGludm9jYXRpb24uXG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQgfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5fdG9vbFN0YXRlVHJhY2tpbmcuZGVsZXRlKGljb25BdXRvcnVuKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdG9vbFN0YXRlVHJhY2tpbmcuYWRkKGljb25BdXRvcnVuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRm9yIHNlcmlhbGl6ZWQgaW52b2NhdGlvbnMsIGFsd2F5cyBzaG93IGljb24gKGFscmVhZHkgY29tcGxldGVkKVxuXHRcdFx0aXRlbVdyYXBwZXIuaW5zZXJ0QmVmb3JlKGljb25FbGVtZW50LCBpdGVtV3JhcHBlci5maXJzdENoaWxkKTtcblx0XHR9XG5cblx0XHQvLyBLZWVwIG5ld2x5LXZpc2libGUgdG9vbCByZXN1bHRzIGFib3ZlIHRoZSBwbGFjZWhvbGRlci9zcGlubmVyLlxuXHRcdGlmICh0aGlzLndyYXBwZXIpIHtcblx0XHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX2NvbmZpcm1hdGlvblBsYWNlaG9sZGVyID8/IHRoaXMud29ya2luZ1NwaW5uZXJFbGVtZW50ID8/IHRoaXMucmVzdWx0Q29udGFpbmVyO1xuXHRcdFx0aWYgKGFuY2hvcikge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuaW5zZXJ0QmVmb3JlKGl0ZW1XcmFwcGVyLCBhbmNob3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53cmFwcGVyLmFwcGVuZENoaWxkKGl0ZW1XcmFwcGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sYXN0SXRlbVdyYXBwZXIgPSBpdGVtV3JhcHBlcjtcblxuXHRcdC8vIFNjaGVkdWxlIGxheW91dCB0byBtZWFzdXJlIGxhc3QgaXRlbSBhbmQgc2Nyb2xsXG5cdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXRlcmlhbGl6ZXMgYSBsYXp5IGl0ZW0gYnkgY3JlYXRpbmcgdGhlIGNvbnRlbnQgYW5kIGFkZGluZyBpdCB0byB0aGUgRE9NLlxuXHQgKi9cblx0cHJpdmF0ZSBtYXRlcmlhbGl6ZUxhenlJdGVtKGl0ZW06IElMYXp5SXRlbSk6IHZvaWQge1xuXHRcdGlmIChpdGVtLmxhenkuaGFzVmFsdWUpIHtcblx0XHRcdHJldHVybjsgLy8gQWxyZWFkeSBtYXRlcmlhbGl6ZWRcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0XHR0aGlzLmFwcGVuZFRvb2xQYXJ0VG9ET00ocGFydCwgaXRlbS50b29sSW52b2NhdGlvbik7XG5cdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdtYXJrZG93bicpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGl0ZW0ubGF6eS52YWx1ZTtcblx0XHRcdHRoaXMuYXBwZW5kTWFya2Rvd25JdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUpO1xuXHRcdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlICYmICFpdGVtLmVhZ2VybHlSZWdpc3RlcmVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGl0ZW0ua2luZCA9PT0gJ2hvb2snKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBpdGVtLmxhenkudmFsdWU7XG5cdFx0XHR0aGlzLmFwcGVuZEhvb2tJdGVtVG9ET00ocmVzdWx0LmRvbU5vZGUsIGl0ZW0uaG9va1BhcnQpO1xuXHRcdFx0aWYgKHJlc3VsdC5kaXNwb3NhYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc3VsdC5kaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTWF0ZXJpYWxpemVzIGFsbCBwZW5kaW5nIGxhenkgY29udGVudCAocHJvbXB0LCB0b29sIGl0ZW1zLCByZXN1bHQpIHdoZW4gdGhlIHNlY3Rpb24gaXMgZXhwYW5kZWQuXG5cdCAqIFRoaXMgaXMgY2FsbGVkIHdoZW4gZmlyc3QgZXhwYW5kZWQsIGJ1dCB0aGUgd3JhcHBlciBtdXN0IGV4aXN0IChjcmVhdGVkIGJ5IGJhc2UgY2xhc3MgaW5pdENvbnRlbnQpLlxuXHQgKi9cblx0cHJpdmF0ZSBtYXRlcmlhbGl6ZVBlbmRpbmdDb250ZW50KCk6IHZvaWQge1xuXHRcdC8vIFdyYXBwZXIgbWF5IG5vdCBiZSBjcmVhdGVkIHlldCBpZiB0aGlzIGF1dG9ydW4gcnVucyBiZWZvcmUgdGhlIGJhc2UgY2xhc3MgYXV0b3J1blxuXHRcdC8vIHRoYXQgY2FsbHMgaW5pdENvbnRlbnQoKS4gSW4gdGhhdCBjYXNlLCBpbml0Q29udGVudCgpIHdpbGwgY2FsbCB0aGlzIGxvZ2ljLlxuXHRcdGlmICghdGhpcy53cmFwcGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIHBlbmRpbmcgcHJvbXB0IHNlY3Rpb25cblx0XHRpZiAodGhpcy5wZW5kaW5nUHJvbXB0UmVuZGVyKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdQcm9tcHRSZW5kZXIgPSBmYWxzZTtcblx0XHRcdHRoaXMuZG9SZW5kZXJQcm9tcHRTZWN0aW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gTWF0ZXJpYWxpemUgbGF6eSB0b29sIGl0ZW1zXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMubGF6eUl0ZW1zKSB7XG5cdFx0XHR0aGlzLm1hdGVyaWFsaXplTGF6eUl0ZW0oaXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIHBlbmRpbmcgcmVzdWx0IHRleHRcblx0XHRpZiAodGhpcy5wZW5kaW5nUmVzdWx0VGV4dCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0VGV4dCA9IHRoaXMucGVuZGluZ1Jlc3VsdFRleHQ7XG5cdFx0XHR0aGlzLnBlbmRpbmdSZXN1bHRUZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5kb1JlbmRlclJlc3VsdFRleHQocmVzdWx0VGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwZXJmb3JtTGF5b3V0KCk6IHZvaWQge1xuXHRcdC8vIE1lYXN1cmUgbGFzdCBpdGVtIGhlaWdodCBvbmNlIGFmdGVyIGxheW91dCwgc2V0IENTUyB2YXJpYWJsZSBmb3IgY29sbGFwc2VkIG1heC1oZWlnaHRcblx0XHRpZiAodGhpcy5sYXN0SXRlbVdyYXBwZXIgJiYgdGhpcy53cmFwcGVyKSB7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmxhc3RJdGVtV3JhcHBlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRpZiAoaGVpZ2h0ID4gMCkge1xuXHRcdFx0XHR0aGlzLndyYXBwZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tY2hhdC1zdWJhZ2VudC1sYXN0LWl0ZW0taGVpZ2h0JywgYCR7aGVpZ2h0fXB4YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXV0by1zY3JvbGwgdG8gYm90dG9tIG9ubHkgd2hlbiBhY3RpdmVseSBzdHJlYW1pbmcgKG5vdCBmb3IgY29tcGxldGVkIHJlc3BvbnNlcylcblx0XHRpZiAodGhpcy5pc0FjdGl2ZSAmJiAhdGhpcy5pc0luaXRpYWxseUNvbXBsZXRlICYmIHRoaXMud3JhcHBlcikge1xuXHRcdFx0Y29uc3Qgc2Nyb2xsSGVpZ2h0ID0gdGhpcy53cmFwcGVyLnNjcm9sbEhlaWdodDtcblx0XHRcdHRoaXMud3JhcHBlci5zY3JvbGxUb3AgPSBzY3JvbGxIZWlnaHQ7XG5cdFx0fVxuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBfZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgX2VsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJylcblx0XHRcdCYmIENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmlzUGFyZW50U3ViYWdlbnRUb29sKG90aGVyKVxuXHRcdFx0JiYgdGhpcy5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gb3RoZXIudG9vbENhbGxJZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxHQUFHLHlCQUF5QixnQ0FBZ0M7QUFDckUsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBRXJCLFNBQVMsaUJBQThCLHlCQUF5QjtBQUNoRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBRXJCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsb0JBQW9CLHdCQUF3QjtBQUNyRCxTQUFTLGNBQWMsUUFBUSxzQkFBc0I7QUFDckQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQ0FBc0MseUJBQXlCO0FBQ3hFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQTJELHFCQUFvRCw4Q0FBOEM7QUFDdEssU0FBUywwQkFBMEI7QUFDbkMsU0FBK0Isb0JBQW9CO0FBR25ELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMENBQTBDO0FBR25ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsaUJBQWlCLG9CQUFvQiw2QkFBNkI7QUFDM0UsU0FBUyw4QkFBOEI7QUFDdkMsT0FBTztBQUVQLE1BQU0sbUJBQW1CO0FBRXpCLE1BQU0sMEJBQTBCO0FBQUEsRUFDL0IsU0FBUywyQkFBMkIsWUFBWTtBQUFB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QUFPLGNBQWMsQ0FBQyxLQUFLLG1CQUFtQjtBQUNqRCxhQUFLLFVBQVUsT0FBTyxVQUFVO0FBQUEsTUFDakM7QUFBQSxJQUNELFdBQVcsS0FBSyxTQUFTLFFBQVE7QUFDaEMsWUFBTSxTQUFTLEtBQUssS0FBSztBQUN6QixXQUFLLG9CQUFvQixPQUFPLFNBQVMsS0FBSyxRQUFRO0FBQ3RELFVBQUksT0FBTyxZQUFZO0FBQ3RCLGFBQUssVUFBVSxPQUFPLFVBQVU7QUFBQSxNQUNqQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLDRCQUFrQztBQUd6QyxRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsSUFDRDtBQUdBLFFBQUksS0FBSyxxQkFBcUI7QUFDN0IsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUdBLGVBQVcsUUFBUSxLQUFLLFdBQVc7QUFDbEMsV0FBSyxvQkFBb0IsSUFBSTtBQUFBLElBQzlCO0FBR0EsUUFBSSxLQUFLLG1CQUFtQjtBQUMzQixZQUFNLGFBQWEsS0FBSztBQUN4QixXQUFLLG9CQUFvQjtBQUN6QixXQUFLLG1CQUFtQixVQUFVO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBc0I7QUFFN0IsUUFBSSxLQUFLLG1CQUFtQixLQUFLLFNBQVM7QUFDekMsWUFBTSxTQUFTLEtBQUssZ0JBQWdCO0FBQ3BDLFVBQUksU0FBUyxHQUFHO0FBQ2YsYUFBSyxRQUFRLE1BQU0sWUFBWSxvQ0FBb0MsR0FBRyxNQUFNLElBQUk7QUFBQSxNQUNqRjtBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssWUFBWSxDQUFDLEtBQUssdUJBQXVCLEtBQUssU0FBUztBQUMvRCxZQUFNLGVBQWUsS0FBSyxRQUFRO0FBQ2xDLFdBQUssUUFBUSxZQUFZO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxlQUFlLE9BQTZCLG1CQUEyQyxVQUFpQztBQUN2SCxZQUFRLE1BQU0sU0FBUyxvQkFBb0IsTUFBTSxTQUFTLCtCQUN0RCx3QkFBd0IscUJBQXFCLEtBQUssS0FDbEQsS0FBSyx5QkFBeUIsTUFBTTtBQUFBLEVBQ3pDO0FBQ0Q7QUF2akRhLDBCQUFOO0FBQUEsRUF5VEo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBalVVOyIsCiAgIm5hbWVzIjogWyJhY3Rpb24iXQp9Cg==
