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
import { h } from "../../../../../../../base/browser/dom.js";
import { createPixelSpinner } from "../../../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { isMarkdownString, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { migrateLegacyTerminalToolSpecificData } from "../../../../common/chat.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { IChatWidgetService } from "../../../chat.js";
import { ChatQueryTitlePart } from "../chatConfirmationWidget.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { ChatProgressSubPart } from "../chatProgressContentPart.js";
import { ChatResourceGroupWidget } from "../chatResourceGroupWidget.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { extractImagesFromToolInvocationOutputDetails } from "../../../../common/chatImageExtraction.js";
import { TerminalToolAutoExpand } from "./terminalToolAutoExpand.js";
import { ChatCollapsibleContentPart } from "../chatCollapsibleContentPart.js";
import { isResponseVM } from "../../../../common/model/chatViewModel.js";
import "../media/chatTerminalToolProgressPart.css";
import { Action } from "../../../../../../../base/common/actions.js";
import { ActionBar } from "../../../../../../../base/browser/ui/actionbar/actionbar.js";
import { timeout } from "../../../../../../../base/common/async.js";
import { ITerminalChatService, ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../../../../terminal/browser/terminal.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalCommandDecorationTooltip } from "../../../../../terminal/browser/xterm/decorationStyles.js";
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { DomScrollableElement } from "../../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../../../base/common/scrollable.js";
import { localize } from "../../../../../../../nls.js";
import { TerminalCapability } from "../../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { stripIcons } from "../../../../../../../base/common/iconLabels.js";
import { IAccessibleViewService } from "../../../../../../../platform/accessibility/browser/accessibleView.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { AccessibilityVerbositySettingId } from "../../../../../accessibility/browser/accessibilityConfiguration.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { DetachedTerminalCommandMirror, DetachedTerminalSnapshotMirror } from "../../../../../terminal/browser/chatTerminalCommandMirror.js";
import { TerminalLocation } from "../../../../../../../platform/terminal/common/terminal.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { TerminalContribCommandId } from "../../../../../terminal/terminalContribExports.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { isNumber } from "../../../../../../../base/common/types.js";
import { removeAnsiEscapeCodes } from "../../../../../../../base/common/strings.js";
import { PANEL_BACKGROUND } from "../../../../../../common/theme.js";
import { editorBackground } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
const MIN_OUTPUT_ROWS = 1;
const MAX_OUTPUT_ROWS = 10;
const MAX_COMMAND_TITLE_LENGTH = 50;
const MAX_OUTPUT_POLL_RETRIES = 10;
const OUTPUT_POLL_DELAY_MS = 100;
const MIN_DATA_EVENTS_FOR_REAL_OUTPUT = 2;
const expandedStateByInvocation = /* @__PURE__ */ new WeakMap();
CommandsRegistry.registerCommand(TerminalContribCommandId.FocusChatInstanceAction, async (_accessor, progressPart) => {
  await progressPart?.focusTerminal();
});
CommandsRegistry.registerCommand(TerminalContribCommandId.ContinueInBackground, async (_accessor, progressPart) => {
  progressPart?.continueInBackground();
});
CommandsRegistry.registerCommand(TerminalContribCommandId.ToggleChatTerminalOutput, async (_accessor, progressPart) => {
  await progressPart?.toggleOutputFromAction();
});
let TerminalCommandDecoration = class extends Disposable {
  constructor(_options, _hoverService) {
    super();
    this._options = _options;
    this._hoverService = _hoverService;
    this._hoverRegistered = false;
    const decorationElements = h("span.chat-terminal-command-decoration@decoration", { role: "img", tabIndex: 0 });
    this._element = decorationElements.decoration;
    this._register(createPixelSpinner(this._element));
    this._attachElementToContainer();
  }
  _attachElementToContainer() {
    const container = this._options.getCommandBlock();
    if (!container) {
      return;
    }
    const decoration = this._element;
    if (!decoration.isConnected || decoration.parentElement !== container) {
      const icon = this._options.getIconElement();
      if (icon && icon.parentElement === container) {
        icon.insertAdjacentElement("afterend", decoration);
      } else {
        container.insertBefore(decoration, container.firstElementChild ?? null);
      }
    }
    if (!this._hoverRegistered) {
      this._hoverRegistered = true;
      this._register(this._hoverService.setupDelayedHover(decoration, () => ({
        content: this._getHoverText()
      })));
    }
  }
  _getHoverText() {
    const command = this._options.getResolvedCommand();
    const { effectiveCommand, storedState } = this._getDecorationInput(command);
    return getTerminalCommandDecorationTooltip(effectiveCommand, storedState) || "";
  }
  update(command) {
    this._attachElementToContainer();
    const decoration = this._element;
    const resolvedCommand = command ?? this._options.getResolvedCommand();
    this._apply(decoration, resolvedCommand);
  }
  _apply(decoration, command) {
    const terminalData = this._options.terminalData;
    if (terminalData.isPty !== false && command) {
      const existingState = terminalData.terminalCommandState ?? {};
      terminalData.terminalCommandState = {
        ...existingState,
        exitCode: command.exitCode,
        timestamp: command.timestamp ?? existingState.timestamp,
        duration: command.duration ?? existingState.duration
      };
    } else if (terminalData.isPty !== false && !terminalData.terminalCommandState) {
      const now = Date.now();
      terminalData.terminalCommandState = { exitCode: void 0, timestamp: now };
    }
    const { effectiveCommand, storedState } = this._getDecorationInput(command);
    const decorationState = getTerminalCommandDecorationState(effectiveCommand, storedState);
    const tooltip = getTerminalCommandDecorationTooltip(effectiveCommand, storedState);
    const isRunning = this._options.getIsRunning();
    decoration.className = `chat-terminal-command-decoration ${DecorationSelector.CommandDecoration}`;
    if (isRunning) {
      const nonIconClasses = decorationState.classNames.filter((c) => c !== DecorationSelector.Codicon && !c.startsWith("codicon-"));
      decoration.classList.add("chat-terminal-running-spinner", ...nonIconClasses);
    } else {
      decoration.classList.add(DecorationSelector.Codicon, ...decorationState.classNames, ...ThemeIcon.asClassNameArray(decorationState.icon));
    }
    const isInteractive = !decoration.classList.contains(DecorationSelector.Default);
    decoration.tabIndex = isInteractive ? 0 : -1;
    if (isInteractive) {
      decoration.removeAttribute("aria-disabled");
    } else {
      decoration.setAttribute("aria-disabled", "true");
    }
    const hoverText = tooltip || decorationState.hoverMessage;
    if (hoverText) {
      decoration.setAttribute("aria-label", hoverText);
    } else {
      decoration.removeAttribute("aria-label");
    }
  }
  _getDecorationInput(command) {
    let storedState = this._options.terminalData.terminalCommandState;
    if (this._options.terminalData.isPty !== false) {
      return { effectiveCommand: command, storedState };
    }
    const exitCode = this._options.getExitCode();
    storedState = exitCode === void 0 ? storedState : { ...storedState, exitCode };
    return {
      effectiveCommand: command?.exitCode === void 0 && storedState?.exitCode !== void 0 ? void 0 : command,
      storedState
    };
  }
};
TerminalCommandDecoration = __decorateClass([
  __decorateParam(1, IHoverService)
], TerminalCommandDecoration);
let ChatTerminalToolProgressPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, _instantiationService, _terminalChatService, _terminalService, _contextKeyService, _chatWidgetService, _configurationService, _terminalEditorService, _terminalGroupService, _telemetryService) {
    super(toolInvocation);
    this._instantiationService = _instantiationService;
    this._terminalChatService = _terminalChatService;
    this._terminalService = _terminalService;
    this._contextKeyService = _contextKeyService;
    this._chatWidgetService = _chatWidgetService;
    this._configurationService = _configurationService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalGroupService = _terminalGroupService;
    this._telemetryService = _telemetryService;
    // Toolbar state that drives action visibility (replaces context keys to avoid
    // accumulating listeners on the shared IContextKeyService when many parts exist)
    this._toolbarHasInstance = false;
    this._toolbarCanContinueInBackground = false;
    this._toolbarHasOutput = false;
    this._toolbarIsHiddenTerminal = false;
    this._toolbarOutputExpanded = false;
    this._actionBarActions = new DisposableStore();
    this._outputSourceListener = this._register(new MutableDisposable());
    this._userToggledOutput = false;
    this._isInThinkingContainer = false;
    this._usesCollapsibleWrapper = false;
    this._elementIndex = context.elementIndex;
    this._contentIndex = context.contentIndex;
    this._sessionResource = context.element.sessionResource;
    this._forceExpandTerminalOutput = isResponseVM(context.element) && context.element.isTerminalCommand;
    terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
    this._terminalData = terminalData;
    this._terminalCommandUri = terminalData.terminalCommandUri ? URI.revive(terminalData.terminalCommandUri) : void 0;
    this._isSerializedInvocation = toolInvocation.kind === "toolInvocationSerialized";
    const elements = h(".chat-terminal-content-part@container", [
      h(".chat-terminal-content-title@title", [
        h(".chat-terminal-command-block@commandBlock")
      ]),
      h(".chat-terminal-content-message@message")
    ]);
    this._titleElement = elements.title;
    const command = (terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
    this._commandText = command;
    this._terminalOutputContextKey = ChatContextKeys.inChatTerminalToolOutput.bindTo(this._contextKeyService);
    this._decoration = this._register(this._instantiationService.createInstance(TerminalCommandDecoration, {
      terminalData: this._terminalData,
      getCommandBlock: () => elements.commandBlock,
      getIconElement: () => void 0,
      getResolvedCommand: () => this._getResolvedCommand(),
      getIsRunning: () => this._isInvocationRunning(),
      getExitCode: () => this._outputSource?.exitCode
    }));
    const displayCommand = terminalData.presentationOverrides?.commandLine ?? command;
    const displayLanguage = terminalData.presentationOverrides?.language ?? terminalData.language;
    const titlePart = this._register(_instantiationService.createInstance(
      ChatQueryTitlePart,
      elements.commandBlock,
      new MarkdownString([
        `\`\`\`${displayLanguage}`,
        `${displayCommand.replaceAll("```", "\\`\\`\\`")}`,
        `\`\`\``
      ].join("\n"), { supportThemeIcons: true }),
      void 0
    ));
    this._register(titlePart.onDidChangeHeight(() => {
      this._decoration.update();
    }));
    this._outputView = this._register(this._instantiationService.createInstance(
      ChatTerminalToolOutputSection,
      () => this._ensureTerminalInstance(),
      () => this._getResolvedCommand(),
      () => this._outputSource,
      () => this._terminalData.terminalCommandOutput,
      () => this._commandText,
      () => this._terminalData.terminalTheme,
      () => this._isInvocationRunning(),
      !!this._terminalData.terminalToolSessionId
    ));
    if (this._terminalData.terminalToolSessionId || this._terminalData.terminalCommandOutput) {
      elements.container.append(this._outputView.domNode);
    }
    this._register(this._outputView.onDidFocus(() => this._handleOutputFocus()));
    this._register(this._outputView.onDidBlur((e) => this._handleOutputBlur(e)));
    this._register(toDisposable(() => this._handleDispose()));
    const actionBarEl = h(".chat-terminal-action-bar@actionBar");
    elements.title.append(actionBarEl.root);
    this._actionBar = this._register(new ActionBar(actionBarEl.actionBar));
    this._register(this._actionBarActions);
    let didInitializeTerminalActions = false;
    const initializeTerminalActionsOnce = () => {
      if (didInitializeTerminalActions || this._store.isDisposed) {
        return;
      }
      didInitializeTerminalActions = true;
      this._initializeTerminalActions();
    };
    initializeTerminalActionsOnce();
    this._terminalService.whenConnected.then(() => {
      initializeTerminalActionsOnce();
    });
    const terminalToolSessionId = this._terminalData.terminalToolSessionId;
    if (terminalToolSessionId) {
      if (this._terminalData.isPty === false) {
        this._attachOutputSource();
        this._register(this._terminalChatService.onDidRegisterOutputSource((sessionId) => {
          if (sessionId === terminalToolSessionId) {
            this._attachOutputSource();
          }
        }));
      }
      this._register(this._terminalChatService.onDidContinueInBackground((sessionId) => {
        if (sessionId === terminalToolSessionId) {
          this._terminalData.didContinueInBackground = true;
          this._toolbarCanContinueInBackground = false;
          this._updateToolbarActions();
        }
      }));
    }
    let pastTenseMessage;
    if (toolInvocation.pastTenseMessage) {
      pastTenseMessage = `${typeof toolInvocation.pastTenseMessage === "string" ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value}`;
    }
    const markdownContent = new MarkdownString(pastTenseMessage, {
      supportThemeIcons: true,
      isTrusted: isMarkdownString(toolInvocation.pastTenseMessage) ? toolInvocation.pastTenseMessage.isTrusted : false
    });
    const chatMarkdownContent = {
      kind: "markdownContent",
      content: markdownContent
    };
    const codeBlockRenderOptions = {
      hideToolbar: true,
      reserveWidth: 19,
      verticalPadding: 5,
      editorOptions: {
        wordWrap: "on"
      }
    };
    const markdownOptions = {
      codeBlockRenderOptions,
      accessibilityOptions: pastTenseMessage ? {
        statusMessage: localize("terminalToolCommand", "{0}", stripIcons(pastTenseMessage))
      } : void 0
    };
    this.markdownPart = this._register(_instantiationService.createInstance(ChatMarkdownContentPart, chatMarkdownContent, context, editorPool, false, codeBlockStartIndex, renderer, {}, currentWidthDelegate(), markdownOptions));
    elements.message.append(this.markdownPart.domNode);
    const progressPart = this._register(_instantiationService.createInstance(ChatProgressSubPart, elements.container, this.getIcon(), terminalData.autoApproveInfo));
    progressPart.domNode.classList.add("chat-terminal-progress-row");
    this._decoration.update();
    if (toolInvocation.kind === "toolInvocation") {
      this._register(autorun((reader) => {
        toolInvocation.state.read(reader);
        this._decoration.update();
      }));
    }
    const terminalToolsInThinking = this._configurationService.getValue(ChatConfiguration.TerminalToolsInThinking);
    const isSimpleTerminal = this._configurationService.getValue(ChatConfiguration.SimpleTerminalCollapsible);
    const requiresConfirmation = toolInvocation.kind === "toolInvocation" && IChatToolInvocation.getConfirmationMessages(toolInvocation);
    this._isInThinkingContainer = terminalToolsInThinking && !requiresConfirmation;
    this._usesCollapsibleWrapper = this._isInThinkingContainer || isSimpleTerminal;
    if (this._usesCollapsibleWrapper) {
      this.domNode = this._createCollapsibleWrapper(progressPart.domNode, displayCommand, toolInvocation, context);
    } else {
      this.domNode = progressPart.domNode;
    }
    this._renderImagePills(toolInvocation, context, elements.container);
    const hasStoredOutput = !!terminalData.terminalCommandOutput;
    const storedExpandedState = expandedStateByInvocation.get(toolInvocation);
    const hasStoredExpandedState = expandedStateByInvocation.has(toolInvocation);
    if (storedExpandedState || !hasStoredExpandedState && this._forceExpandTerminalOutput || this._isInThinkingContainer && IChatToolInvocation.isComplete(toolInvocation) && hasStoredOutput) {
      void this._toggleOutput(true);
    }
    this._register(this._terminalChatService.registerProgressPart(this));
  }
  get codeblocks() {
    return this.markdownPart?.codeblocks ?? [];
  }
  get elementIndex() {
    return this._elementIndex;
  }
  get contentIndex() {
    return this._contentIndex;
  }
  /**
   * Renders image attachment pills below the terminal output when the tool
   * result contains image data parts. For collapsible wrappers, the single
   * widget is reparented between inside/outside based on expanded state.
   */
  _renderImagePills(toolInvocation, context, innerContainer) {
    const renderImages = () => {
      const extracted = extractImagesFromToolInvocationOutputDetails(toolInvocation, context.element.sessionResource);
      const imageParts = extracted.map((img) => ({
        kind: "data",
        value: img.data.buffer,
        mimeType: img.mimeType,
        uri: img.uri
      }));
      if (imageParts.length === 0) {
        return;
      }
      const widget = this._register(this._instantiationService.createInstance(ChatResourceGroupWidget, imageParts));
      if (this._thinkingCollapsibleWrapper) {
        const wrapper = this._thinkingCollapsibleWrapper;
        const placeWidget = (expanded) => {
          if (expanded) {
            innerContainer.appendChild(widget.domNode);
          } else {
            wrapper.domNode.appendChild(widget.domNode);
          }
        };
        placeWidget(wrapper.expanded.get());
        this._register(autorun((reader) => {
          placeWidget(wrapper.expanded.read(reader));
        }));
      } else {
        innerContainer.appendChild(widget.domNode);
      }
    };
    if (toolInvocation.kind === "toolInvocationSerialized") {
      renderImages();
    } else {
      this._register(autorun((reader) => {
        const state = toolInvocation.state.read(reader);
        if (state.type === IChatToolInvocation.StateKind.Completed) {
          renderImages();
        }
      }));
    }
  }
  _createCollapsibleWrapper(contentElement, commandText, toolInvocation, context) {
    const truncatedCommand = commandText.length > MAX_COMMAND_TITLE_LENGTH ? commandText.substring(0, MAX_COMMAND_TITLE_LENGTH) + "..." : commandText;
    const toolInvocationComplete = IChatToolInvocation.isComplete(toolInvocation);
    const isRunningInBackground = toolInvocationComplete && this._isInvocationRunning();
    const isComplete = toolInvocationComplete && !isRunningInBackground;
    const isSkipped = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation)?.type === ToolConfirmKind.Skipped;
    const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
    const hasError = autoExpandFailures && this._terminalData.terminalCommandState?.exitCode !== void 0 && this._terminalData.terminalCommandState.exitCode !== 0;
    const initialExpanded = !isComplete || hasError || this._forceExpandTerminalOutput;
    const wrapper = this._register(this._instantiationService.createInstance(
      ChatTerminalThinkingCollapsibleWrapper,
      truncatedCommand,
      this._terminalData.intention,
      this._terminalData.commandLine.isSandboxWrapped === true,
      contentElement,
      context,
      initialExpanded,
      isComplete,
      isSkipped,
      isRunningInBackground,
      this._terminalData.isPty === false ? void 0 : () => this.focusTerminal()
    ));
    this._thinkingCollapsibleWrapper = wrapper;
    let isFirstRun = true;
    this._register(autorun((r) => {
      const expanded = wrapper.expanded.read(r);
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      this._toggleOutput(expanded);
    }));
    return wrapper.domNode;
  }
  expandCollapsibleWrapper() {
    this._thinkingCollapsibleWrapper?.expand();
  }
  markCollapsibleWrapperComplete() {
    this._thinkingCollapsibleWrapper?.markComplete();
  }
  async _initializeTerminalActions() {
    if (this._store.isDisposed) {
      return;
    }
    const terminalToolSessionId = this._terminalData.terminalToolSessionId;
    if (!terminalToolSessionId) {
      this._updateToolbarContextKeys();
      return;
    }
    if (this._terminalData.isPty === false) {
      this._attachOutputSource();
      this._updateToolbarContextKeys(void 0, terminalToolSessionId);
      return;
    }
    const attachInstance = async (instance) => {
      if (this._store.isDisposed) {
        return;
      }
      if (!instance) {
        if (this._isSerializedInvocation) {
          this._clearCommandAssociation();
        }
        this._updateToolbarContextKeys(void 0, terminalToolSessionId);
        return;
      }
      const isNewInstance = this._terminalInstance !== instance;
      if (isNewInstance) {
        this._terminalInstance = instance;
        this._registerInstanceListener(instance);
      }
      this._updateToolbarContextKeys(instance, terminalToolSessionId);
    };
    const initialInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
    await attachInstance(initialInstance);
    if (!initialInstance) {
      this._updateToolbarContextKeys(void 0, terminalToolSessionId);
    }
    if (this._store.isDisposed) {
      return;
    }
    if (!this._terminalSessionRegistration) {
      const listener = this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession(async (instance) => {
        const registeredInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(terminalToolSessionId);
        if (instance !== registeredInstance) {
          return;
        }
        this._terminalSessionRegistration?.dispose();
        this._terminalSessionRegistration = void 0;
        await attachInstance(instance);
      });
      this._terminalSessionRegistration = this._store.add(listener);
    }
  }
  /**
   * Updates the scoped context keys that drive toolbar action visibility.
   * The ActionBar is rebuilt with the correct set of visible actions.
   */
  _updateToolbarContextKeys(terminalInstance, terminalToolSessionId) {
    if (this._store.isDisposed) {
      return;
    }
    const resolvedCommand = this._getResolvedCommand(terminalInstance);
    this._toolbarHasInstance = !!terminalInstance;
    if (terminalInstance && terminalToolSessionId) {
      this._toolbarIsHiddenTerminal = this._terminalChatService.isBackgroundTerminal(terminalToolSessionId);
    } else {
      this._toolbarIsHiddenTerminal = false;
    }
    if (terminalInstance && terminalToolSessionId && !this._terminalData.isBackground && !this._terminalData.didContinueInBackground) {
      const isStillRunning = resolvedCommand?.exitCode === void 0 && this._terminalData.terminalCommandState?.exitCode === void 0;
      this._toolbarCanContinueInBackground = isStillRunning;
    } else {
      this._toolbarCanContinueInBackground = false;
    }
    if (!this._usesCollapsibleWrapper) {
      const hasSnapshot = !!this._terminalData.terminalCommandOutput || !!this._outputSource?.output;
      const hasOutput = !!resolvedCommand || hasSnapshot;
      this._toolbarHasOutput = hasOutput;
      if (hasOutput && !this._outputView.isExpanded) {
        const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
        const exitCode = resolvedCommand?.exitCode ?? this._outputSource?.exitCode ?? this._terminalData.terminalCommandState?.exitCode;
        if (exitCode !== void 0 && exitCode !== 0 && autoExpandFailures) {
          this._toggleOutput(true);
        }
      }
    }
    this._updateToolbarActions();
    this._decoration.update(resolvedCommand);
  }
  /**
   * Rebuilds the ActionBar actions based on current toolbar state.
   */
  _updateToolbarActions() {
    if (!this._actionBar || this._store.isDisposed) {
      return;
    }
    this._actionBar.clear();
    this._actionBarActions.clear();
    const actions = [];
    if (this._toolbarCanContinueInBackground) {
      const action = new Action(
        TerminalContribCommandId.ContinueInBackground,
        localize("continueInBackground", "Continue in Background"),
        ThemeIcon.asClassName(Codicon.debugContinueSmall),
        true,
        () => this.continueInBackground()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    if (this._toolbarHasInstance) {
      const focusLabel = this._toolbarIsHiddenTerminal ? localize("showTerminal", "Show and Focus Terminal") : localize("focusTerminal", "Focus Terminal");
      const action = new Action(
        TerminalContribCommandId.FocusChatInstanceAction,
        focusLabel,
        ThemeIcon.asClassName(Codicon.openInProduct),
        true,
        () => this.focusTerminal()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    if (this._toolbarHasOutput && !this._usesCollapsibleWrapper) {
      const toggleIcon = this._toolbarOutputExpanded ? Codicon.chevronDown : Codicon.chevronRight;
      const toggleLabel = this._toolbarOutputExpanded ? localize("hideTerminalOutput", "Hide Output") : localize("showTerminalOutput", "Show Output");
      const action = new Action(
        TerminalContribCommandId.ToggleChatTerminalOutput,
        toggleLabel,
        ThemeIcon.asClassName(toggleIcon),
        true,
        () => this.toggleOutputFromAction()
      );
      this._actionBarActions.add(action);
      actions.push(action);
    }
    this._actionBar.push(actions, { icon: true, label: false });
  }
  _getResolvedCommand(instance) {
    const target = instance ?? this._terminalInstance;
    if (!target) {
      return void 0;
    }
    return this._resolveCommand(target);
  }
  _isInvocationRunning() {
    const currentTerminalData = this.toolInvocation.toolSpecificData?.kind === "terminal" ? migrateLegacyTerminalToolSpecificData(this.toolInvocation.toolSpecificData) : this._terminalData;
    if (currentTerminalData.isPty === false) {
      if (this._outputSource?.exitCode !== void 0 || currentTerminalData.terminalCommandState?.exitCode !== void 0) {
        return false;
      }
      if (!IChatToolInvocation.isComplete(this.toolInvocation)) {
        return true;
      }
      return currentTerminalData.isBackground === true || currentTerminalData.didContinueInBackground === true;
    }
    const commandExitCode = this._getResolvedCommand()?.exitCode;
    if (commandExitCode !== void 0) {
      return false;
    }
    const storedExitCode = currentTerminalData.terminalCommandState?.exitCode;
    if (storedExitCode !== void 0) {
      return false;
    }
    if (!IChatToolInvocation.isComplete(this.toolInvocation)) {
      return true;
    }
    return currentTerminalData.isBackground === true || currentTerminalData.didContinueInBackground === true;
  }
  _clearCommandAssociation(options) {
    this._terminalCommandUri = void 0;
    if (options?.clearPersistentData) {
      if (this._terminalData.terminalCommandUri) {
        delete this._terminalData.terminalCommandUri;
      }
      if (this._terminalData.terminalToolSessionId) {
        delete this._terminalData.terminalToolSessionId;
      }
    }
    this._decoration.update();
  }
  /**
   * Determines whether the terminal output should auto-expand.
   * Returns false if already expanded, user has manually toggled, component is disposed,
   * or if the invocation was previously expanded (to preserve state across re-renders).
   */
  _shouldAutoExpand() {
    return !this._outputView.isExpanded && !this._userToggledOutput && !this._store.isDisposed && (!this._forceExpandTerminalOutput || !expandedStateByInvocation.has(this.toolInvocation)) && !expandedStateByInvocation.get(this.toolInvocation);
  }
  /**
   * Registers event listeners on the terminal instance to track command execution,
   * manage auto-expansion of output, and handle command completion.
   *
   * This method sets up:
   * - Command detection listeners for tracking command lifecycle
   * - Auto-expand logic based on command output and duration
   * - Instance disposal handling to clean up actions and state
   */
  _registerInstanceListener(terminalInstance) {
    const commandDetectionListener = this._register(new MutableDisposable());
    const tryResolveCommand = async () => {
      const resolvedCommand = this._resolveCommand(terminalInstance);
      this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      return resolvedCommand;
    };
    const attachCommandDetection = async (commandDetection) => {
      commandDetectionListener.clear();
      if (!commandDetection) {
        const ahpSource = this._terminalData.terminalToolSessionId ? this._terminalChatService.getAhpCommandSource(this._terminalData.terminalToolSessionId) : void 0;
        if (ahpSource) {
          this._attachAhpCommandSource(terminalInstance, ahpSource, commandDetectionListener);
        }
        await tryResolveCommand();
        return;
      }
      const store = new DisposableStore();
      let receivedDataCount = 0;
      const hasRealOutput = () => {
        if (this._terminalData.terminalCommandOutput?.text?.trim()) {
          return true;
        }
        const command = this._getResolvedCommand(terminalInstance);
        if (!command?.executedMarker || terminalInstance.isDisposed) {
          return false;
        }
        const buffer = terminalInstance.xterm?.raw.buffer.active;
        if (!buffer) {
          return false;
        }
        const cursorLine = buffer.baseY + buffer.cursorY;
        if (cursorLine > command.executedMarker.line) {
          return true;
        }
        return receivedDataCount > MIN_DATA_EVENTS_FOR_REAL_OUTPUT;
      };
      const autoExpand = store.add(new TerminalToolAutoExpand({
        onCommandExecuted: Event.map(commandDetection.onCommandExecuted, () => void 0),
        onCommandFinished: Event.map(commandDetection.onCommandFinished, () => void 0),
        onWillData: terminalInstance.onWillData,
        shouldAutoExpand: () => this._shouldAutoExpand(),
        hasRealOutput
      }));
      store.add(autoExpand.onDidRequestExpand(() => {
        if (this._usesCollapsibleWrapper) {
          this.expandCollapsibleWrapper();
        }
        this._toggleOutput(true);
      }));
      store.add(terminalInstance.onWillData(() => {
        receivedDataCount++;
      }));
      store.add(commandDetection.onCommandExecuted(() => {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      }));
      store.add(commandDetection.onCommandFinished(() => {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
        const resolvedCommand = this._getResolvedCommand(terminalInstance);
        this._handleCommandCompletion(resolvedCommand);
        if (resolvedCommand?.endMarker) {
          commandDetectionListener.clear();
        }
      }));
      commandDetectionListener.value = store;
      const resolvedImmediately = await tryResolveCommand();
      if (resolvedImmediately?.endMarker) {
        commandDetectionListener.clear();
        this._handleCommandCompletion(resolvedImmediately);
        return;
      }
    };
    attachCommandDetection(terminalInstance.capabilities.get(TerminalCapability.CommandDetection));
    this._register(terminalInstance.capabilities.onDidAddCommandDetectionCapability((cd) => attachCommandDetection(cd)));
    const instanceListener = this._register(terminalInstance.onDisposed(() => {
      if (this._terminalInstance === terminalInstance) {
        this._terminalInstance = void 0;
      }
      this._clearCommandAssociation({ clearPersistentData: true });
      commandDetectionListener.clear();
      this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
      instanceListener.dispose();
    }));
  }
  /**
   * Sets up listeners using an {@link IAhpTerminalCommandSource} when no local
   * `ICommandDetectionCapability` is available. Provides auto-expand, toolbar
   * context key updates, and command completion handling.
   */
  _attachAhpCommandSource(terminalInstance, ahpSource, commandDetectionListener) {
    const store = new DisposableStore();
    const hasRealOutput = () => {
      const command = this._getResolvedCommand(terminalInstance);
      if (command?.hasOutput()) {
        return true;
      }
      return !!this._terminalData.terminalCommandOutput?.text?.trim();
    };
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: Event.map(ahpSource.onCommandExecuted, () => void 0),
      onCommandFinished: Event.map(ahpSource.onCommandFinished, () => void 0),
      onWillData: terminalInstance.onWillData,
      shouldAutoExpand: () => this._shouldAutoExpand(),
      hasRealOutput
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      if (this._usesCollapsibleWrapper) {
        this.expandCollapsibleWrapper();
      }
      this._toggleOutput(true);
    }));
    store.add(ahpSource.onCommandExecuted((cmd) => {
      if (!this._terminalData.terminalCommandId && cmd.id) {
        this._terminalData.terminalCommandId = cmd.id;
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
      }
      if (this._outputView.isExpanded) {
        void this._toggleOutput(true);
      }
    }));
    store.add(ahpSource.onCommandFinished((cmd) => {
      if (this._terminalData.terminalCommandId === cmd.id) {
        this._updateToolbarContextKeys(terminalInstance, this._terminalData.terminalToolSessionId);
        const resolvedCommand2 = this._getResolvedCommand(terminalInstance);
        this._handleCommandCompletion(resolvedCommand2);
      }
    }));
    commandDetectionListener.value = store;
    const resolvedCommand = this._resolveCommand(terminalInstance);
    if (resolvedCommand?.endMarker) {
      this._handleCommandCompletion(resolvedCommand);
    }
  }
  /**
   * Handles the completion of a terminal command by updating the UI state.
   * This includes marking the collapsible wrapper as complete, auto-collapsing
   * successful commands, and keeping failed commands expanded.
   *
   * @param resolvedCommand The completed terminal command with exit code information.
   */
  _handleCommandCompletion(resolvedCommand) {
    this.markCollapsibleWrapperComplete();
    if (resolvedCommand?.exitCode === 0 && this._outputView.isExpanded && !this._userToggledOutput && !this._forceExpandTerminalOutput) {
      this._toggleOutput(false);
    }
    const autoExpandFailures = this._configurationService.getValue(ChatConfiguration.AutoExpandToolFailures);
    if (autoExpandFailures && resolvedCommand?.exitCode !== void 0 && resolvedCommand.exitCode !== 0 && this._thinkingCollapsibleWrapper) {
      this.expandCollapsibleWrapper();
    }
  }
  async _toggleOutput(expanded) {
    const didChange = await this._outputView.toggle(expanded);
    const isExpanded = this._outputView.isExpanded;
    const hasOutputSection = !!this._outputView.domNode.parentElement;
    this._titleElement.classList.toggle("chat-terminal-content-title-no-bottom-radius", isExpanded && hasOutputSection);
    this._toolbarOutputExpanded = isExpanded;
    this._updateToolbarActions();
    if (didChange) {
      expandedStateByInvocation.set(this.toolInvocation, isExpanded);
    }
    return didChange;
  }
  async _ensureTerminalInstance() {
    if (this._terminalData.isPty === false) {
      return void 0;
    }
    if (this._terminalInstance?.isDisposed) {
      this._terminalInstance = void 0;
    }
    if (!this._terminalInstance && this._terminalData.terminalToolSessionId) {
      this._terminalInstance = await this._terminalChatService.getTerminalInstanceByToolSessionId(this._terminalData.terminalToolSessionId);
      if (this._terminalInstance?.isDisposed) {
        this._terminalInstance = void 0;
      }
    }
    return this._terminalInstance;
  }
  _attachOutputSource() {
    const source = this._terminalChatService.getOutputSource(this._terminalData.terminalToolSessionId);
    if (!source || source === this._outputSource) {
      return;
    }
    this._outputSource = source;
    const store = new DisposableStore();
    const onCommandExecuted = store.add(new Emitter());
    const onCommandFinished = store.add(new Emitter());
    const autoExpand = store.add(new TerminalToolAutoExpand({
      onCommandExecuted: onCommandExecuted.event,
      onCommandFinished: onCommandFinished.event,
      onWillData: source.onDidChange,
      shouldAutoExpand: () => this._shouldAutoExpand(),
      hasRealOutput: () => !!source.output
    }));
    store.add(autoExpand.onDidRequestExpand(() => {
      if (this._usesCollapsibleWrapper) {
        this.expandCollapsibleWrapper();
      }
      void this._toggleOutput(true);
    }));
    store.add(source.onDidChange(() => {
      this._decoration.update();
      this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
      void this._outputView.refresh();
      if (source.exitCode !== void 0) {
        onCommandFinished.fire();
        this.markCollapsibleWrapperComplete();
      }
    }));
    this._outputSourceListener.value = store;
    onCommandExecuted.fire();
    if (source.exitCode !== void 0) {
      onCommandFinished.fire();
    }
    this._decoration.update();
    this._updateToolbarContextKeys(void 0, this._terminalData.terminalToolSessionId);
    void this._outputView.refresh();
  }
  _handleOutputFocus() {
    this._terminalOutputContextKey.set(true);
    this._terminalChatService.setFocusedProgressPart(this);
    this._outputView.updateAriaLabel();
  }
  _handleOutputBlur(event) {
    const nextTarget = event.relatedTarget;
    if (this._outputView.containsElement(nextTarget)) {
      return;
    }
    this._terminalOutputContextKey.reset();
    this._terminalChatService.clearFocusedProgressPart(this);
  }
  _handleDispose() {
    this._terminalOutputContextKey.reset();
    this._terminalChatService.clearFocusedProgressPart(this);
  }
  getCommandAndOutputAsText() {
    return this._outputView.getCommandAndOutputAsText();
  }
  focusOutput() {
    this._outputView.focus();
  }
  _focusChatInput() {
    const widget = this._chatWidgetService.getWidgetBySessionResource(this._sessionResource);
    widget?.focusInput();
  }
  async focusTerminal() {
    if (this._terminalData.isPty === false) {
      return;
    }
    const instance = await this._ensureTerminalInstance();
    let target = "none";
    let location = "panel";
    if (instance) {
      target = "instance";
      location = instance.target === TerminalLocation.Editor ? "editor" : "panel";
    } else if (this._terminalCommandUri) {
      target = "commandUri";
    }
    this._telemetryService.publicLog2("terminal/chatFocusInstance", { target, location });
    if (instance) {
      this._terminalService.setActiveInstance(instance);
      if (instance.target === TerminalLocation.Editor) {
        this._terminalEditorService.openEditor(instance);
      } else {
        await this._terminalGroupService.showPanel(true);
      }
      this._terminalService.setActiveInstance(instance);
      await instance.focusWhenReady(true);
      const command = this._getResolvedCommand(instance);
      if (command) {
        instance.xterm?.markTracker.revealCommand(command);
      }
      return;
    }
    if (this._terminalCommandUri) {
      this._terminalService.openResource(this._terminalCommandUri);
    }
  }
  continueInBackground() {
    const sessionId = this._terminalData.terminalToolSessionId;
    if (sessionId) {
      this._terminalChatService.continueInBackground(sessionId);
    }
  }
  async toggleOutputFromAction() {
    this._userToggledOutput = true;
    this._telemetryService.publicLog2("terminal/chatToggleOutput", {
      previousExpanded: this._outputView.isExpanded
    });
    if (!this._outputView.isExpanded) {
      await this._toggleOutput(true);
      return;
    }
    await this._toggleOutput(false);
  }
  async toggleOutputFromKeyboard() {
    this._userToggledOutput = true;
    if (!this._outputView.isExpanded) {
      await this._toggleOutput(true);
      this.focusOutput();
      return;
    }
    await this._collapseOutputAndFocusInput();
  }
  async _collapseOutputAndFocusInput() {
    if (this._outputView.isExpanded) {
      await this._toggleOutput(false);
    }
    this._focusChatInput();
  }
  _resolveCommand(instance) {
    if (instance.isDisposed) {
      return void 0;
    }
    const targetId = this._terminalData.terminalCommandId;
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    if (commandDetection && targetId) {
      const commands = commandDetection.commands;
      if (commands && commands.length > 0) {
        const fromHistory = commands.find((c) => c.id === targetId);
        if (fromHistory) {
          return fromHistory;
        }
      }
      const executing = commandDetection.executingCommandObject;
      if (executing && executing.id === targetId) {
        return executing;
      }
    }
    const sessionId = this._terminalData.terminalToolSessionId;
    if (sessionId) {
      const ahpSource = this._terminalChatService.getAhpCommandSource(sessionId);
      if (ahpSource) {
        if (targetId) {
          return ahpSource.getCommandById(targetId);
        }
        return ahpSource.executingCommandObject ?? ahpSource.commands[ahpSource.commands.length - 1];
      }
    }
    return void 0;
  }
};
ChatTerminalToolProgressPart = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ITerminalChatService),
  __decorateParam(9, ITerminalService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IChatWidgetService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, ITerminalEditorService),
  __decorateParam(14, ITerminalGroupService),
  __decorateParam(15, ITelemetryService)
], ChatTerminalToolProgressPart);
let ChatTerminalToolOutputSection = class extends Disposable {
  constructor(_ensureTerminalInstance, _resolveCommand, _getOutputSource, _getTerminalCommandOutput, _getCommandText, _getStoredTheme, _isInvocationRunning, _hasTerminalSession, _accessibleViewService, _instantiationService, _terminalConfigurationService, _themeService, _contextKeyService) {
    super();
    this._ensureTerminalInstance = _ensureTerminalInstance;
    this._resolveCommand = _resolveCommand;
    this._getOutputSource = _getOutputSource;
    this._getTerminalCommandOutput = _getTerminalCommandOutput;
    this._getCommandText = _getCommandText;
    this._getStoredTheme = _getStoredTheme;
    this._isInvocationRunning = _isInvocationRunning;
    this._hasTerminalSession = _hasTerminalSession;
    this._accessibleViewService = _accessibleViewService;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._themeService = _themeService;
    this._contextKeyService = _contextKeyService;
    this._isAtBottom = true;
    this._isProgrammaticScroll = false;
    this._onDidFocusEmitter = this._register(new Emitter());
    this._onDidBlurEmitter = this._register(new Emitter());
    const containerElements = h(".chat-terminal-output-container@container", [
      h(".chat-terminal-output-body@body", [
        h(".chat-terminal-output-content@content", [
          h(".chat-terminal-output-terminal@terminal"),
          h(".chat-terminal-output-empty@empty")
        ])
      ])
    ]);
    this.domNode = containerElements.container;
    this.domNode.classList.add("collapsed");
    this._outputBody = containerElements.body;
    this._contentContainer = containerElements.content;
    this._terminalContainer = containerElements.terminal;
    this._emptyElement = containerElements.empty;
    this._contentContainer.appendChild(this._emptyElement);
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => this._onDidFocusEmitter.fire()));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, (event) => this._onDidBlurEmitter.fire(event)));
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatTerminalToolProgressPart.handleResize", () => this._handleResize()));
    this._register(resizeObserver.observe(this.domNode));
    this._applyBackgroundColor();
    this._register(this._themeService.onDidColorThemeChange(() => this._applyBackgroundColor()));
  }
  get isExpanded() {
    return this.domNode.classList.contains("expanded");
  }
  get onDidFocus() {
    return this._onDidFocusEmitter.event;
  }
  get onDidBlur() {
    return this._onDidBlurEmitter.event;
  }
  async toggle(expanded) {
    const currentlyExpanded = this.isExpanded;
    if (expanded === currentlyExpanded) {
      if (expanded) {
        await this._updateTerminalContent();
      }
      return false;
    }
    if (!expanded) {
      this._setExpanded(false);
      this._isAtBottom = true;
      return true;
    }
    if (!this._scrollableContainer) {
      await this._createScrollableContainer();
    }
    await this._updateTerminalContent();
    this._setExpanded(true);
    await this._layoutMirrorWidth();
    this._layoutOutput();
    this._scrollOutputToBottom();
    this._scheduleOutputRelayout();
    return true;
  }
  async refresh() {
    if (this.isExpanded) {
      await this._updateTerminalContent();
    }
  }
  focus() {
    this._scrollableContainer?.getDomNode().focus();
  }
  containsElement(element) {
    return !!element && this.domNode.contains(element);
  }
  updateAriaLabel() {
    if (!this._scrollableContainer) {
      return;
    }
    const command = this._resolveCommand();
    const commandText = command?.command ?? this._getCommandText();
    if (!commandText) {
      return;
    }
    const ariaLabel = localize("chatTerminalOutputAriaLabel", "Terminal output for {0}", commandText);
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    scrollableDomNode.setAttribute("role", "region");
    const accessibleViewHint = this._accessibleViewService.getOpenAriaHint(AccessibilityVerbositySettingId.TerminalChatOutput);
    const label = accessibleViewHint ? ariaLabel + ", " + accessibleViewHint : ariaLabel;
    scrollableDomNode.setAttribute("aria-label", label);
  }
  getCommandAndOutputAsText() {
    const command = this._resolveCommand();
    const commandText = command?.command ?? this._getCommandText();
    if (!commandText) {
      return void 0;
    }
    const commandHeader = localize("chatTerminalOutputAccessibleViewHeader", "Command: {0}", commandText);
    if (command) {
      const rawOutput = command.getOutput();
      if (!rawOutput || rawOutput.trim().length === 0) {
        return `${commandHeader}
${localize("chat.terminalOutputEmpty", "No output was produced by the command.")}`;
      }
      const lines = rawOutput.split("\n");
      return `${commandHeader}
${lines.join("\n").trimEnd()}`;
    }
    const source = this._getOutputSource();
    const snapshot = source ? { text: source.output } : this._getTerminalCommandOutput();
    if (!snapshot) {
      return `${commandHeader}
${localize("chatTerminalOutputUnavailable", "Command output is no longer available.")}`;
    }
    const plain = removeAnsiEscapeCodes(snapshot.text ?? "");
    if (!plain.trim().length) {
      return `${commandHeader}
${localize("chat.terminalOutputEmpty", "No output was produced by the command.")}`;
    }
    let outputText = plain.trimEnd();
    if (snapshot.truncated) {
      outputText += `
${localize("chatTerminalOutputTruncated", "Output truncated.")}`;
    }
    return `${commandHeader}
${outputText}`;
  }
  _setExpanded(expanded) {
    this.domNode.classList.toggle("expanded", expanded);
    this.domNode.classList.toggle("collapsed", !expanded);
  }
  async _createScrollableContainer() {
    this._scrollableContainer = this._register(new DomScrollableElement(this._outputBody, {
      vertical: ScrollbarVisibility.Hidden,
      horizontal: ScrollbarVisibility.Hidden,
      handleMouseWheel: true
    }));
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    scrollableDomNode.tabIndex = 0;
    this.domNode.appendChild(scrollableDomNode);
    this.updateAriaLabel();
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_ENTER, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Auto });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Hidden });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_IN, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Auto });
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.FOCUS_OUT, () => {
      this._scrollableContainer?.updateOptions({ horizontal: ScrollbarVisibility.Hidden });
    }));
    this._register(this._scrollableContainer.onScroll(() => {
      if (this._isProgrammaticScroll) {
        return;
      }
      this._isAtBottom = this._computeIsAtBottom();
    }));
  }
  async _updateTerminalContent() {
    const outputSource = this._getOutputSource();
    if (outputSource) {
      this._disposeLiveMirror();
      if (outputSource.output) {
        await this._renderSnapshotOutput({ text: outputSource.output });
      } else if (outputSource.exitCode === void 0) {
        this._hideEmptyMessage();
        this._layoutOutput(0);
      } else {
        this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
        this._layoutOutput(0);
      }
      return;
    }
    const liveTerminalInstance = await this._resolveLiveTerminal();
    const command = liveTerminalInstance ? this._resolveCommand() : void 0;
    const snapshot = this._getTerminalCommandOutput();
    if (liveTerminalInstance && command) {
      const handled = await this._renderLiveOutput(liveTerminalInstance, command);
      if (handled) {
        return;
      }
    }
    this._disposeLiveMirror();
    if (snapshot) {
      await this._renderSnapshotOutput(snapshot);
      return;
    }
    if (!this._hasTerminalSession) {
      return;
    }
    if (this._isInvocationRunning()) {
      this._hideEmptyMessage();
      this._layoutOutput(0);
      return;
    }
    this._renderUnavailableMessage(liveTerminalInstance);
  }
  async _renderLiveOutput(liveTerminalInstance, command) {
    if (this._mirror) {
      return true;
    }
    await liveTerminalInstance.xtermReadyPromise;
    if (this._store.isDisposed || liveTerminalInstance.isDisposed || !liveTerminalInstance.xterm) {
      this._disposeLiveMirror();
      return false;
    }
    const mirror = this._register(this._instantiationService.createInstance(DetachedTerminalCommandMirror, liveTerminalInstance.xterm, command));
    this._mirror = mirror;
    this._register(mirror.onDidChangeRowHeight(() => this._handleMirrorRowHeightChange()));
    this._register(mirror.onDidUpdate((result2) => {
      if (result2.lineCount && result2.lineCount > 0) {
        this._hideEmptyMessage();
      }
      this._layoutOutput(result2.lineCount);
      if (this._isAtBottom) {
        this._scrollOutputToBottom();
      }
    }));
    this._register(mirror.onDidInput((data) => {
      if (!liveTerminalInstance.isDisposed) {
        liveTerminalInstance.sendText(data, false);
      }
    }));
    await mirror.attach(this._terminalContainer);
    await this._layoutMirrorWidth(mirror);
    let result = await mirror.renderCommand();
    let commandFinished = !!command.endMarker;
    let hasOutput = result && result.lineCount && result.lineCount > 0;
    if (!hasOutput) {
      for (let retry = 0; retry < MAX_OUTPUT_POLL_RETRIES && !hasOutput; retry++) {
        await timeout(OUTPUT_POLL_DELAY_MS);
        if (this._store.isDisposed) {
          return true;
        }
        result = await mirror.renderCommand();
        hasOutput = result && result.lineCount && result.lineCount > 0;
        commandFinished = !!command.endMarker;
        if (commandFinished) {
          break;
        }
      }
    }
    if (!hasOutput) {
      if (commandFinished) {
        this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
      }
    } else {
      this._hideEmptyMessage();
    }
    this._layoutOutput(result?.lineCount ?? 0);
    return true;
  }
  async _renderSnapshotOutput(snapshot) {
    if (this._snapshotMirror) {
      this._snapshotMirror.setOutput(snapshot);
      await this._layoutMirrorWidth(this._snapshotMirror);
      const result2 = await this._snapshotMirror.render();
      this._layoutOutput(result2?.lineCount ?? snapshot.lineCount ?? this._lastRenderedLineCount ?? 0);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    dom.clearNode(this._terminalContainer);
    this._snapshotMirror = this._register(this._instantiationService.createInstance(DetachedTerminalSnapshotMirror, snapshot, this._getStoredTheme));
    this._register(this._snapshotMirror.onDidChangeRowHeight(() => this._handleMirrorRowHeightChange()));
    await this._snapshotMirror.attach(this._terminalContainer);
    this._snapshotMirror.setOutput(snapshot);
    await this._layoutMirrorWidth(this._snapshotMirror);
    const result = await this._snapshotMirror.render();
    const hasText = !!snapshot.text && snapshot.text.length > 0;
    if (hasText) {
      this._hideEmptyMessage();
    } else {
      this._showEmptyMessage(localize("chat.terminalOutputEmpty", "No output was produced by the command."));
    }
    const lineCount = result?.lineCount ?? snapshot.lineCount ?? 0;
    this._layoutOutput(lineCount);
  }
  _renderUnavailableMessage(liveTerminalInstance) {
    dom.clearNode(this._terminalContainer);
    this._lastRenderedLineCount = void 0;
    if (!liveTerminalInstance) {
      this._showEmptyMessage(localize("chat.terminalOutputTerminalMissing", "Terminal is no longer available."));
    } else {
      this._showEmptyMessage(localize("chat.terminalOutputCommandMissing", "Command information is not available."));
    }
  }
  async _resolveLiveTerminal() {
    const instance = await this._ensureTerminalInstance();
    return instance && !instance.isDisposed ? instance : void 0;
  }
  _showEmptyMessage(message) {
    this._emptyElement.textContent = message;
    this._terminalContainer.classList.add("chat-terminal-output-terminal-no-output");
    this.domNode.classList.add("chat-terminal-output-container-no-output");
  }
  _hideEmptyMessage() {
    this._emptyElement.textContent = "";
    this._terminalContainer.classList.remove("chat-terminal-output-terminal-no-output");
    this.domNode.classList.remove("chat-terminal-output-container-no-output");
  }
  _disposeLiveMirror() {
    if (this._mirror) {
      this._mirror.dispose();
      this._mirror = void 0;
    }
  }
  _scheduleOutputRelayout() {
    dom.getWindow(this.domNode).requestAnimationFrame(() => {
      this._layoutOutput();
      this._scrollOutputToBottom();
    });
  }
  /**
   * The mirror's painted cell metrics changed: the first render replaces the pre-render
   * font estimate, and later renders can reflect DPR changes. Re-run layout so the box
   * height and wrap width match what xterm actually painted.
   */
  _handleMirrorRowHeightChange() {
    void this._layoutMirrorWidth();
    this._layoutOutput();
  }
  _handleResize() {
    if (!this._scrollableContainer) {
      return;
    }
    if (this.isExpanded) {
      void this._layoutMirrorWidth();
      this._layoutOutput();
      this._scrollOutputToBottom();
    } else {
      this._scrollableContainer.scanDomNode();
    }
  }
  /**
   * Resizes the mirror's column count to fill the currently available width. No-op while the
   * width is unmeasurable (e.g. collapsed); the mirror keeps its current cols until the next
   * layout opportunity.
   */
  async _layoutMirrorWidth(mirror = this._snapshotMirror ?? this._mirror) {
    if (!mirror) {
      return;
    }
    const width = this._terminalContainer.clientWidth || this._outputBody.clientWidth || this.domNode.clientWidth || (this.domNode.parentElement?.clientWidth ?? 0);
    if (width <= 0) {
      return;
    }
    const result = await mirror.layout(width);
    if (!this._store.isDisposed && result?.lineCount !== void 0) {
      this._layoutOutput(result.lineCount);
    }
  }
  _layoutOutput(lineCount) {
    if (!this._scrollableContainer) {
      return;
    }
    if (lineCount !== void 0) {
      this._lastRenderedLineCount = lineCount;
    } else {
      lineCount = this._lastRenderedLineCount;
    }
    this._scrollableContainer.scanDomNode();
    if (!this.isExpanded || lineCount === void 0) {
      return;
    }
    const scrollableDomNode = this._scrollableContainer.getDomNode();
    const rowHeight = this._computeRowHeightPx();
    const padding = this._getOutputPadding();
    let maxRows = MAX_OUTPUT_ROWS;
    const containerMaxHeight = Number.parseFloat(dom.getComputedStyle(this.domNode).maxHeight);
    if (!Number.isNaN(containerMaxHeight)) {
      maxRows = Math.max(Math.min(maxRows, Math.floor((containerMaxHeight - padding) / rowHeight)), MIN_OUTPUT_ROWS);
    }
    const contentRows = Math.min(Math.max(lineCount, MIN_OUTPUT_ROWS), maxRows);
    scrollableDomNode.style.height = `${contentRows * rowHeight + padding}px`;
    this._scrollableContainer.scanDomNode();
  }
  _computeIsAtBottom() {
    if (!this._scrollableContainer) {
      return true;
    }
    const dimensions = this._scrollableContainer.getScrollDimensions();
    const scrollPosition = this._scrollableContainer.getScrollPosition();
    const threshold = 5;
    return scrollPosition.scrollTop >= dimensions.scrollHeight - dimensions.height - threshold;
  }
  _scrollOutputToBottom() {
    if (!this._scrollableContainer) {
      return;
    }
    this._isProgrammaticScroll = true;
    const dimensions = this._scrollableContainer.getScrollDimensions();
    this._scrollableContainer.setScrollPosition({ scrollTop: dimensions.scrollHeight });
    this._isProgrammaticScroll = false;
  }
  _getOutputPadding() {
    const style = dom.getComputedStyle(this._outputBody);
    const paddingTop = Number.parseFloat(style.paddingTop || "0");
    const paddingBottom = Number.parseFloat(style.paddingBottom || "0");
    return paddingTop + paddingBottom;
  }
  _computeRowHeightPx() {
    const mirrorRowHeight = (this._snapshotMirror ?? this._mirror)?.getRowHeightPx();
    if (mirrorRowHeight !== void 0) {
      return mirrorRowHeight;
    }
    const window = dom.getWindow(this.domNode);
    const font = this._terminalConfigurationService.getFont(window);
    const hasCharHeight = isNumber(font.charHeight) && font.charHeight > 0;
    const hasFontSize = isNumber(font.fontSize) && font.fontSize > 0;
    const hasLineHeight = isNumber(font.lineHeight) && font.lineHeight > 0;
    const charHeight = (hasCharHeight ? font.charHeight : hasFontSize ? font.fontSize : 1) ?? 1;
    const lineHeight = hasLineHeight ? font.lineHeight : 1;
    const rowHeight = Math.ceil(charHeight * lineHeight);
    return Math.max(rowHeight, 1);
  }
  _applyBackgroundColor() {
    const theme = this._themeService.getColorTheme();
    const isInEditor = ChatContextKeys.inChatEditor.getValue(this._contextKeyService);
    const backgroundColor = theme.getColor(isInEditor ? editorBackground : PANEL_BACKGROUND);
    if (backgroundColor) {
      this.domNode.style.backgroundColor = backgroundColor.toString();
    }
  }
};
ChatTerminalToolOutputSection = __decorateClass([
  __decorateParam(8, IAccessibleViewService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ITerminalConfigurationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IContextKeyService)
], ChatTerminalToolOutputSection);
let ChatTerminalThinkingCollapsibleWrapper = class extends ChatCollapsibleContentPart {
  constructor(commandText, intention, isSandboxWrapped, contentElement, context, initialExpanded, isComplete, isSkipped, isRunningInBackground, onFocusTerminal, hoverService, configurationService) {
    const intentionText = intention && !isSkipped ? intention : void 0;
    const stateTitle = isSkipped ? localize("chat.terminal.skipped.plain", "Skipped {0}", commandText) : isRunningInBackground ? localize("chat.terminal.runningInBackground.plain", "Running {0} in background", commandText) : isComplete ? localize("chat.terminal.ran.plain", "Ran {0}", commandText) : localize("chat.terminal.running.plain", "Running {0}", commandText);
    const title = intentionText ? isRunningInBackground ? `${intentionText} ${commandText}${localize("chat.terminal.backgroundSuffix", " in background")}` : `${intentionText} ${commandText}` : stateTitle;
    super(title, context, void 0, hoverService, configurationService);
    this._showLinkDisposables = this._register(new MutableDisposable());
    this._terminalContentElement = contentElement;
    this._commandText = commandText;
    this._intention = intentionText;
    this._isSandboxWrapped = isSandboxWrapped;
    this._isComplete = isComplete;
    this._isSkipped = isSkipped;
    this._isRunningInBackground = isRunningInBackground;
    this._onFocusTerminal = onFocusTerminal;
    this.domNode.classList.add("chat-terminal-thinking-collapsible");
    if (isComplete) {
      this.icon = Codicon.check;
    }
    this._setCodeFormattedTitle();
    this._updateShowLink();
    this.setExpanded(initialExpanded);
  }
  shouldAnimateContent() {
    return true;
  }
  _setCodeFormattedTitle() {
    if (!this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    labelElement.textContent = "";
    const suffixText = this._isSandboxWrapped ? this._isRunningInBackground ? localize("chat.terminal.sandbox.backgroundSuffix", " in sandbox (background)") : localize("chat.terminal.sandbox.suffix", " in sandbox") : this._isRunningInBackground ? localize("chat.terminal.backgroundSuffix", " in background") : void 0;
    this.domNode.classList.toggle("chat-terminal-has-intention", !!this._intention);
    if (this._intention) {
      const row = dom.$("span.chat-terminal-label-flex");
      const intentionElement = dom.$("span.chat-terminal-intention");
      intentionElement.textContent = this._intention;
      const commandElement = dom.$("span.chat-terminal-command");
      const codeElement2 = document.createElement("code");
      codeElement2.textContent = this._commandText;
      commandElement.appendChild(codeElement2);
      row.appendChild(intentionElement);
      row.appendChild(commandElement);
      if (suffixText) {
        const suffixElement = dom.$("span.chat-terminal-label-suffix");
        suffixElement.textContent = suffixText;
        row.appendChild(suffixElement);
      }
      labelElement.appendChild(row);
      return;
    }
    const prefixText = this._isSandboxWrapped ? this._isSkipped ? localize("chat.terminal.skippedInSandbox.prefix", "Skipped ") : this._isComplete ? localize("chat.terminal.ranInSandbox.prefix", "Ran ") : localize("chat.terminal.runningInSandbox.prefix", "Running ") : this._isSkipped ? localize("chat.terminal.skipped.prefix", "Skipped ") : this._isComplete ? localize("chat.terminal.ran.prefix", "Ran ") : localize("chat.terminal.running.prefix", "Running ");
    labelElement.appendChild(document.createTextNode(prefixText));
    const codeElement = document.createElement("code");
    codeElement.textContent = this._commandText;
    labelElement.appendChild(codeElement);
    if (suffixText) {
      labelElement.appendChild(document.createTextNode(suffixText));
    }
  }
  _updateShowLink() {
    this._showLinkElement?.remove();
    this._showLinkElement = void 0;
    this._showLinkDisposables.value = void 0;
    if (!this._isRunningInBackground || !this._onFocusTerminal || !this._collapseButton) {
      return;
    }
    const labelElement = this._collapseButton.labelElement;
    const store = new DisposableStore();
    this._showLinkDisposables.value = store;
    const container = dom.$("span.chat-terminal-show-link-container");
    container.appendChild(document.createTextNode(" \u2014 "));
    const showLink = dom.$("span.chat-terminal-show-link");
    showLink.textContent = localize("chat.terminal.showTerminal", "Show");
    showLink.role = "button";
    showLink.tabIndex = 0;
    store.add(dom.addDisposableListener(showLink, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._onFocusTerminal?.();
    }));
    store.add(dom.addDisposableListener(showLink, dom.EventType.KEY_DOWN, (e) => {
      const keyboardEvent = new StandardKeyboardEvent(e);
      if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        this._onFocusTerminal?.();
      }
    }));
    container.appendChild(showLink);
    labelElement.appendChild(container);
    this._showLinkElement = container;
  }
  markComplete() {
    if (this._isComplete) {
      return;
    }
    this._isComplete = true;
    this._isRunningInBackground = false;
    this.icon = Codicon.check;
    this._setCodeFormattedTitle();
    this._updateShowLink();
  }
  initContent() {
    const listWrapper = dom.$(".chat-used-context-list.chat-terminal-thinking-content");
    listWrapper.appendChild(this._terminalContentElement);
    return listWrapper;
  }
  expand() {
    this.setExpanded(true);
  }
  hasSameContent(_other, _followingContent, _element) {
    return false;
  }
};
ChatTerminalThinkingCollapsibleWrapper = __decorateClass([
  __decorateParam(10, IHoverService),
  __decorateParam(11, IConfigurationService)
], ChatTerminalThinkingCollapsibleWrapper);
export {
  ChatTerminalThinkingCollapsibleWrapper,
  ChatTerminalToolOutputSection,
  ChatTerminalToolProgressPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVBpeGVsU3Bpbm5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9waXhlbFNwaW5uZXIvcGl4ZWxTcGlubmVyLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIFRvb2xDb25maXJtS2luZCwgdHlwZSBJQ2hhdE1hcmtkb3duQ29udGVudCwgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCB0eXBlIElMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdENvZGVCbG9ja0luZm8sIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXJ5VGl0bGVQYXJ0IH0gZnJvbSAnLi4vY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsIHR5cGUgSUNoYXRNYXJrZG93bkNvbnRlbnRQYXJ0T3B0aW9ucyB9IGZyb20gJy4uL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc1N1YlBhcnQgfSBmcm9tICcuLi9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzb3VyY2VHcm91cFdpZGdldCB9IGZyb20gJy4uL2NoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0IH0gZnJvbSAnLi4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IGV4dHJhY3RJbWFnZXNGcm9tVG9vbEludm9jYXRpb25PdXRwdXREZXRhaWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRJbWFnZUV4dHJhY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sQXV0b0V4cGFuZCB9IGZyb20gJy4vdGVybWluYWxUb29sQXV0b0V4cGFuZC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4uL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50LCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgJy4uL21lZGlhL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQuY3NzJztcbmltcG9ydCB0eXBlIHsgSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgfSBmcm9tICcuLi9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2UsIElDaGF0VGVybWluYWxPdXRwdXRTb3VyY2UsIElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0LCBJVGVybWluYWxDaGF0U2VydmljZSwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgdHlwZSBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uU2VsZWN0b3IsIGdldFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25TdGF0ZSwgZ2V0VGVybWluYWxDb21tYW5kRGVjb3JhdGlvblRvb2x0aXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3h0ZXJtL2RlY29yYXRpb25TdHlsZXMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb21tYW5kLCBUZXJtaW5hbENhcGFiaWxpdHksIHR5cGUgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yUG9vbCB9IGZyb20gJy4uL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yLCBEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL2NoYXRUZXJtaW5hbENvbW1hbmRNaXJyb3IuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250cmliQ29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVybWluYWwvdGVybWluYWxDb250cmliRXhwb3J0cy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGlzTnVtYmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgcmVtb3ZlQW5zaUVzY2FwZUNvZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBQQU5FTF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcblxuLyoqXG4gKiBNaW5pbXVtIG51bWJlciBvZiByb3dzIHRvIGRpc3BsYXkgaW4gdGhlIHRlcm1pbmFsIG91dHB1dCB2aWV3LlxuICovXG5jb25zdCBNSU5fT1VUUFVUX1JPV1MgPSAxO1xuXG4vKipcbiAqIE1heGltdW0gbnVtYmVyIG9mIHJvd3MgdG8gZGlzcGxheSBpbiB0aGUgdGVybWluYWwgb3V0cHV0IHZpZXcgYmVmb3JlIHNjcm9sbGluZy5cbiAqL1xuY29uc3QgTUFYX09VVFBVVF9ST1dTID0gMTA7XG5cbi8qKlxuICogTWF4aW11bSBudW1iZXIgb2YgY2hhcmFjdGVycyB0byBkaXNwbGF5IGluIHRoZSBjb21tYW5kIHRpdGxlIGJlZm9yZSB0cnVuY2F0aW5nLlxuICovXG5jb25zdCBNQVhfQ09NTUFORF9USVRMRV9MRU5HVEggPSA1MDtcblxuLyoqXG4gKiBNYXhpbXVtIG51bWJlciBvZiByZXRyaWVzIHdoZW4gd2FpdGluZyBmb3IgdGVybWluYWwgb3V0cHV0IHRvIGFwcGVhci5cbiAqL1xuY29uc3QgTUFYX09VVFBVVF9QT0xMX1JFVFJJRVMgPSAxMDtcblxuLyoqXG4gKiBEZWxheSBiZXR3ZWVuIHJldHJpZXMgd2hlbiBwb2xsaW5nIGZvciB0ZXJtaW5hbCBvdXRwdXQgKGluIG1pbGxpc2Vjb25kcykuXG4gKi9cbmNvbnN0IE9VVFBVVF9QT0xMX0RFTEFZX01TID0gMTAwO1xuXG4vKipcbiAqIE1pbmltdW0gbnVtYmVyIG9mIGRhdGEgZXZlbnRzIHRoYXQgaW5kaWNhdGUgcmVhbCBvdXRwdXQgKHZzIHNoZWxsIGludGVncmF0aW9uIHNlcXVlbmNlcykuXG4gKi9cbmNvbnN0IE1JTl9EQVRBX0VWRU5UU19GT1JfUkVBTF9PVVRQVVQgPSAyO1xuXG4vKipcbiAqIFJlbWVtYmVycyB3aGV0aGVyIGEgdG9vbCBpbnZvY2F0aW9uIHdhcyBsYXN0IGV4cGFuZGVkIHNvIHN0YXRlIHN1cnZpdmVzIHZpcnR1YWxpemF0aW9uIHJlLXJlbmRlcnMuXG4gKi9cbmNvbnN0IGV4cGFuZGVkU3RhdGVCeUludm9jYXRpb24gPSBuZXcgV2Vha01hcDxJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGJvb2xlYW4+KCk7XG5cbi8vIC0tLSBDb21tYW5kIHJlZ2lzdHJhdGlvbnMgZm9yIHRlcm1pbmFsIHRvb2wgcHJvZ3Jlc3MgdG9vbGJhciAtLS1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoVGVybWluYWxDb250cmliQ29tbWFuZElkLkZvY3VzQ2hhdEluc3RhbmNlQWN0aW9uLCBhc3luYyAoX2FjY2Vzc29yOiB1bmtub3duLCBwcm9ncmVzc1BhcnQ/OiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCkgPT4ge1xuXHRhd2FpdCBwcm9ncmVzc1BhcnQ/LmZvY3VzVGVybWluYWwoKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuQ29udGludWVJbkJhY2tncm91bmQsIGFzeW5jIChfYWNjZXNzb3I6IHVua25vd24sIHByb2dyZXNzUGFydD86IElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0KSA9PiB7XG5cdHByb2dyZXNzUGFydD8uY29udGludWVJbkJhY2tncm91bmQoKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuVG9nZ2xlQ2hhdFRlcm1pbmFsT3V0cHV0LCBhc3luYyAoX2FjY2Vzc29yOiB1bmtub3duLCBwcm9ncmVzc1BhcnQ/OiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCkgPT4ge1xuXHRhd2FpdCBwcm9ncmVzc1BhcnQ/LnRvZ2dsZU91dHB1dEZyb21BY3Rpb24oKTtcbn0pO1xuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNvbmZpZ3VyaW5nIGEgdGVybWluYWwgY29tbWFuZCBkZWNvcmF0aW9uLlxuICovXG5pbnRlcmZhY2UgSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25PcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSB0ZXJtaW5hbCBkYXRhIGFzc29jaWF0ZWQgd2l0aCB0aGUgdG9vbCBpbnZvY2F0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgdGVybWluYWxEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBIVE1MIGVsZW1lbnQgcmVwcmVzZW50aW5nIHRoZSBjb21tYW5kIGJsb2NrIGluIHRoZSB0ZXJtaW5hbCBvdXRwdXQuXG5cdCAqIE1heSByZXR1cm4gYHVuZGVmaW5lZGAgaWYgdGhlIGNvbW1hbmQgYmxvY2sgaXMgbm90IGN1cnJlbnRseSByZW5kZXJlZC5cblx0ICogQ2FsbGVkIHdoZW4gYXR0YWNoaW5nIHRoZSBkZWNvcmF0aW9uIHRvIHRoZSBjb21tYW5kIGJsb2NrIGNvbnRhaW5lci5cblx0ICovXG5cdGdldENvbW1hbmRCbG9jaygpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgSFRNTCBlbGVtZW50IHJlcHJlc2VudGluZyB0aGUgaWNvbiBmb3IgdGhlIGNvbW1hbmQsIGlmIGFueS5cblx0ICogTWF5IHJldHVybiBgdW5kZWZpbmVkYCBpZiBubyBpY29uIGlzIHByZXNlbnQuXG5cdCAqIFVzZWQgdG8gZGV0ZXJtaW5lIHdoZXJlIHRvIGluc2VydCB0aGUgZGVjb3JhdGlvbiByZWxhdGl2ZSB0byB0aGUgaWNvbi5cblx0ICovXG5cdGdldEljb25FbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByZXNvbHZlZCB0ZXJtaW5hbCBjb21tYW5kIGFzc29jaWF0ZWQgd2l0aCB0aGlzIGRlY29yYXRpb24sIGlmIGF2YWlsYWJsZS5cblx0ICogTWF5IHJldHVybiBgdW5kZWZpbmVkYCBpZiB0aGUgY29tbWFuZCBoYXMgbm90IGJlZW4gcmVzb2x2ZWQgeWV0LlxuXHQgKiBVc2VkIHRvIGFjY2VzcyBjb21tYW5kIG1ldGFkYXRhIGZvciB0aGUgZGVjb3JhdGlvbi5cblx0ICovXG5cdGdldFJlc29sdmVkQ29tbWFuZCgpOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIHRvb2wgaW52b2NhdGlvbiBpcyBjdXJyZW50bHkgcnVubmluZy5cblx0ICovXG5cdGdldElzUnVubmluZygpOiBib29sZWFuO1xuXG5cdC8qKiBSZXR1cm5zIGEgc3RydWN0dXJlZCBleGl0IGNvZGUgdGhhdCBtYXkgYXJyaXZlIHdpdGhvdXQgY29tbWFuZCBkZXRlY3Rpb24uICovXG5cdGdldEV4aXRDb2RlKCk6IG51bWJlciB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgVGVybWluYWxDb21tYW5kRGVjb3JhdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfaG92ZXJSZWdpc3RlcmVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVRlcm1pbmFsQ29tbWFuZERlY29yYXRpb25PcHRpb25zLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25FbGVtZW50cyA9IGgoJ3NwYW4uY2hhdC10ZXJtaW5hbC1jb21tYW5kLWRlY29yYXRpb25AZGVjb3JhdGlvbicsIHsgcm9sZTogJ2ltZycsIHRhYkluZGV4OiAwIH0pO1xuXHRcdHRoaXMuX2VsZW1lbnQgPSBkZWNvcmF0aW9uRWxlbWVudHMuZGVjb3JhdGlvbjtcblx0XHR0aGlzLl9yZWdpc3RlcihjcmVhdGVQaXhlbFNwaW5uZXIodGhpcy5fZWxlbWVudCkpO1xuXHRcdHRoaXMuX2F0dGFjaEVsZW1lbnRUb0NvbnRhaW5lcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNoRWxlbWVudFRvQ29udGFpbmVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuX29wdGlvbnMuZ2V0Q29tbWFuZEJsb2NrKCk7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uID0gdGhpcy5fZWxlbWVudDtcblx0XHRpZiAoIWRlY29yYXRpb24uaXNDb25uZWN0ZWQgfHwgZGVjb3JhdGlvbi5wYXJlbnRFbGVtZW50ICE9PSBjb250YWluZXIpIHtcblx0XHRcdGNvbnN0IGljb24gPSB0aGlzLl9vcHRpb25zLmdldEljb25FbGVtZW50KCk7XG5cdFx0XHRpZiAoaWNvbiAmJiBpY29uLnBhcmVudEVsZW1lbnQgPT09IGNvbnRhaW5lcikge1xuXHRcdFx0XHRpY29uLmluc2VydEFkamFjZW50RWxlbWVudCgnYWZ0ZXJlbmQnLCBkZWNvcmF0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRhaW5lci5pbnNlcnRCZWZvcmUoZGVjb3JhdGlvbiwgY29udGFpbmVyLmZpcnN0RWxlbWVudENoaWxkID8/IG51bGwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faG92ZXJSZWdpc3RlcmVkKSB7XG5cdFx0XHR0aGlzLl9ob3ZlclJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGRlY29yYXRpb24sICgpID0+ICh7XG5cdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX2dldEhvdmVyVGV4dCgpXG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEhvdmVyVGV4dCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9vcHRpb25zLmdldFJlc29sdmVkQ29tbWFuZCgpO1xuXHRcdGNvbnN0IHsgZWZmZWN0aXZlQ29tbWFuZCwgc3RvcmVkU3RhdGUgfSA9IHRoaXMuX2dldERlY29yYXRpb25JbnB1dChjb21tYW5kKTtcblx0XHRyZXR1cm4gZ2V0VGVybWluYWxDb21tYW5kRGVjb3JhdGlvblRvb2x0aXAoZWZmZWN0aXZlQ29tbWFuZCwgc3RvcmVkU3RhdGUpIHx8ICcnO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZShjb21tYW5kPzogSVRlcm1pbmFsQ29tbWFuZCk6IHZvaWQge1xuXHRcdHRoaXMuX2F0dGFjaEVsZW1lbnRUb0NvbnRhaW5lcigpO1xuXHRcdGNvbnN0IGRlY29yYXRpb24gPSB0aGlzLl9lbGVtZW50O1xuXHRcdGNvbnN0IHJlc29sdmVkQ29tbWFuZCA9IGNvbW1hbmQgPz8gdGhpcy5fb3B0aW9ucy5nZXRSZXNvbHZlZENvbW1hbmQoKTtcblx0XHR0aGlzLl9hcHBseShkZWNvcmF0aW9uLCByZXNvbHZlZENvbW1hbmQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHkoZGVjb3JhdGlvbjogSFRNTEVsZW1lbnQsIGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB0aGlzLl9vcHRpb25zLnRlcm1pbmFsRGF0YTtcblx0XHRpZiAodGVybWluYWxEYXRhLmlzUHR5ICE9PSBmYWxzZSAmJiBjb21tYW5kKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ1N0YXRlID0gdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID8/IHt9O1xuXHRcdFx0dGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlID0ge1xuXHRcdFx0XHQuLi5leGlzdGluZ1N0YXRlLFxuXHRcdFx0XHRleGl0Q29kZTogY29tbWFuZC5leGl0Q29kZSxcblx0XHRcdFx0dGltZXN0YW1wOiBjb21tYW5kLnRpbWVzdGFtcCA/PyBleGlzdGluZ1N0YXRlLnRpbWVzdGFtcCxcblx0XHRcdFx0ZHVyYXRpb246IGNvbW1hbmQuZHVyYXRpb24gPz8gZXhpc3RpbmdTdGF0ZS5kdXJhdGlvblxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHRlcm1pbmFsRGF0YS5pc1B0eSAhPT0gZmFsc2UgJiYgIXRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSkge1xuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSA9IHsgZXhpdENvZGU6IHVuZGVmaW5lZCwgdGltZXN0YW1wOiBub3cgfTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVmZmVjdGl2ZUNvbW1hbmQsIHN0b3JlZFN0YXRlIH0gPSB0aGlzLl9nZXREZWNvcmF0aW9uSW5wdXQoY29tbWFuZCk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvblN0YXRlID0gZ2V0VGVybWluYWxDb21tYW5kRGVjb3JhdGlvblN0YXRlKGVmZmVjdGl2ZUNvbW1hbmQsIHN0b3JlZFN0YXRlKTtcblx0XHRjb25zdCB0b29sdGlwID0gZ2V0VGVybWluYWxDb21tYW5kRGVjb3JhdGlvblRvb2x0aXAoZWZmZWN0aXZlQ29tbWFuZCwgc3RvcmVkU3RhdGUpO1xuXG5cdFx0Y29uc3QgaXNSdW5uaW5nID0gdGhpcy5fb3B0aW9ucy5nZXRJc1J1bm5pbmcoKTtcblxuXHRcdGRlY29yYXRpb24uY2xhc3NOYW1lID0gYGNoYXQtdGVybWluYWwtY29tbWFuZC1kZWNvcmF0aW9uICR7RGVjb3JhdGlvblNlbGVjdG9yLkNvbW1hbmREZWNvcmF0aW9ufWA7XG5cdFx0aWYgKGlzUnVubmluZykge1xuXHRcdFx0Y29uc3Qgbm9uSWNvbkNsYXNzZXMgPSBkZWNvcmF0aW9uU3RhdGUuY2xhc3NOYW1lcy5maWx0ZXIoYyA9PiBjICE9PSBEZWNvcmF0aW9uU2VsZWN0b3IuQ29kaWNvbiAmJiAhYy5zdGFydHNXaXRoKCdjb2RpY29uLScpKTtcblx0XHRcdGRlY29yYXRpb24uY2xhc3NMaXN0LmFkZCgnY2hhdC10ZXJtaW5hbC1ydW5uaW5nLXNwaW5uZXInLCAuLi5ub25JY29uQ2xhc3Nlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlY29yYXRpb24uY2xhc3NMaXN0LmFkZChEZWNvcmF0aW9uU2VsZWN0b3IuQ29kaWNvbiwgLi4uZGVjb3JhdGlvblN0YXRlLmNsYXNzTmFtZXMsIC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGRlY29yYXRpb25TdGF0ZS5pY29uKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGlzSW50ZXJhY3RpdmUgPSAhZGVjb3JhdGlvbi5jbGFzc0xpc3QuY29udGFpbnMoRGVjb3JhdGlvblNlbGVjdG9yLkRlZmF1bHQpO1xuXHRcdGRlY29yYXRpb24udGFiSW5kZXggPSBpc0ludGVyYWN0aXZlID8gMCA6IC0xO1xuXHRcdGlmIChpc0ludGVyYWN0aXZlKSB7XG5cdFx0XHRkZWNvcmF0aW9uLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZWNvcmF0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsICd0cnVlJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGhvdmVyVGV4dCA9IHRvb2x0aXAgfHwgZGVjb3JhdGlvblN0YXRlLmhvdmVyTWVzc2FnZTtcblx0XHRpZiAoaG92ZXJUZXh0KSB7XG5cdFx0XHRkZWNvcmF0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGhvdmVyVGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlY29yYXRpb24ucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVjb3JhdGlvbklucHV0KGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQpOiB7XG5cdFx0ZWZmZWN0aXZlQ29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZDtcblx0XHRzdG9yZWRTdGF0ZTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxDb21tYW5kU3RhdGUnXTtcblx0fSB7XG5cdFx0bGV0IHN0b3JlZFN0YXRlID0gdGhpcy5fb3B0aW9ucy50ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kU3RhdGU7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudGVybWluYWxEYXRhLmlzUHR5ICE9PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIHsgZWZmZWN0aXZlQ29tbWFuZDogY29tbWFuZCwgc3RvcmVkU3RhdGUgfTtcblx0XHR9XG5cdFx0Y29uc3QgZXhpdENvZGUgPSB0aGlzLl9vcHRpb25zLmdldEV4aXRDb2RlKCk7XG5cdFx0c3RvcmVkU3RhdGUgPSBleGl0Q29kZSA9PT0gdW5kZWZpbmVkID8gc3RvcmVkU3RhdGUgOiB7IC4uLnN0b3JlZFN0YXRlLCBleGl0Q29kZSB9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlZmZlY3RpdmVDb21tYW5kOiBjb21tYW5kPy5leGl0Q29kZSA9PT0gdW5kZWZpbmVkICYmIHN0b3JlZFN0YXRlPy5leGl0Q29kZSAhPT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogY29tbWFuZCxcblx0XHRcdHN0b3JlZFN0YXRlXG5cdFx0fTtcblx0fVxuXG59XG5cbi8qKlxuICogQSBjaGF0IGNvbnRlbnQgcGFydCB0aGF0IGRpc3BsYXlzIHRlcm1pbmFsIHRvb2wgaW52b2NhdGlvbiBwcm9ncmVzcy5cbiAqXG4gKiBUaGlzIGNvbXBvbmVudCBzaG93czpcbiAqIC0gVGhlIGNvbW1hbmQgYmVpbmcgZXhlY3V0ZWQgd2l0aCBzeW50YXggaGlnaGxpZ2h0aW5nXG4gKiAtIEEgc3RhdHVzIGRlY29yYXRpb24gaW5kaWNhdGluZyBzdWNjZXNzL2ZhaWx1cmUvcnVubmluZyBzdGF0ZVxuICogLSBFeHBhbmRhYmxlIHRlcm1pbmFsIG91dHB1dCB3aXRoIGxpdmUgc3RyZWFtaW5nIHN1cHBvcnRcbiAqIC0gQWN0aW9ucyB0byBmb2N1cyB0aGUgdGVybWluYWwsIHNob3cvaGlkZSBvdXRwdXQsIGFuZCBjb250aW51ZSBpbiBiYWNrZ3JvdW5kXG4gKlxuICogVGhlIGNvbXBvbmVudCBzdXBwb3J0cyB0d28gcmVuZGVyaW5nIG1vZGVzOlxuICogLSBTdGFuZGFyZCBtb2RlOiBTaG93cyBmdWxsIHByb2dyZXNzIHdpdGggc3RhdHVzIGluZGljYXRvcnNcbiAqIC0gQ29sbGFwc2libGUgd3JhcHBlciBtb2RlOiBGb3IgdGhpbmtpbmcgY29udGFpbmVycyB3aXRoIHNpbXBsaWZpZWQgVUlcbiAqXG4gKiBPdXRwdXQgYXV0by1leHBhbnNpb24gYmVoYXZpb3I6XG4gKiAtIExvbmctcnVubmluZyBjb21tYW5kcyB3aXRoIG91dHB1dCBhdXRvLWV4cGFuZCBhZnRlciBhIHNob3J0IGRlbGF5XG4gKiAtIEZhc3QgY29tbWFuZHMgdGhhdCBjb21wbGV0ZSBxdWlja2x5IGRvbid0IGF1dG8tZXhwYW5kIChwcmV2ZW50cyBmbGlja2VyaW5nKVxuICogLSBGYWlsZWQgY29tbWFuZHMgY2FuIGJlIGNvbmZpZ3VyZWQgdG8gYXV0by1leHBhbmQgdmlhIHNldHRpbmdzXG4gKiAtIFN1Y2Nlc3NmdWwgY29tbWFuZHMgYXV0by1jb2xsYXBzZSBpZiBvdXRwdXQgd2FzIGF1dG8tZXhwYW5kZWRcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgZXh0ZW5kcyBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCBpbXBsZW1lbnRzIElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dFZpZXc6IENoYXRUZXJtaW5hbFRvb2xPdXRwdXRTZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbE91dHB1dENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbFNlc3Npb25SZWdpc3RyYXRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50SW5kZXg6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudEluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25SZXNvdXJjZTogVVJJO1xuXG5cdC8vIFRvb2xiYXIgc3RhdGUgdGhhdCBkcml2ZXMgYWN0aW9uIHZpc2liaWxpdHkgKHJlcGxhY2VzIGNvbnRleHQga2V5cyB0byBhdm9pZFxuXHQvLyBhY2N1bXVsYXRpbmcgbGlzdGVuZXJzIG9uIHRoZSBzaGFyZWQgSUNvbnRleHRLZXlTZXJ2aWNlIHdoZW4gbWFueSBwYXJ0cyBleGlzdClcblx0cHJpdmF0ZSBfdG9vbGJhckhhc0luc3RhbmNlID0gZmFsc2U7XG5cdHByaXZhdGUgX3Rvb2xiYXJDYW5Db250aW51ZUluQmFja2dyb3VuZCA9IGZhbHNlO1xuXHRwcml2YXRlIF90b29sYmFySGFzT3V0cHV0ID0gZmFsc2U7XG5cdHByaXZhdGUgX3Rvb2xiYXJJc0hpZGRlblRlcm1pbmFsID0gZmFsc2U7XG5cdHByaXZhdGUgX3Rvb2xiYXJPdXRwdXRFeHBhbmRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9hY3Rpb25CYXI6IEFjdGlvbkJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9uQmFyQWN0aW9ucyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbERhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGE7XG5cdHByaXZhdGUgX3Rlcm1pbmFsQ29tbWFuZFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kVGV4dDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1NlcmlhbGl6ZWRJbnZvY2F0aW9uOiBib29sZWFuO1xuXHRwcml2YXRlIF90ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb3V0cHV0U291cmNlOiBJQ2hhdFRlcm1pbmFsT3V0cHV0U291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRTb3VyY2VMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb246IFRlcm1pbmFsQ29tbWFuZERlY29yYXRpb247XG5cdHByaXZhdGUgX3VzZXJUb2dnbGVkT3V0cHV0OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzSW5UaGlua2luZ0NvbnRhaW5lcjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF91c2VzQ29sbGFwc2libGVXcmFwcGVyOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3RoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyOiBDaGF0VGVybWluYWxUaGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9yY2VFeHBhbmRUZXJtaW5hbE91dHB1dDogYm9vbGVhbjtcblxuXHRwcml2YXRlIG1hcmtkb3duUGFydDogQ2hhdE1hcmtkb3duQ29udGVudFBhcnQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgY29kZWJsb2NrcygpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMubWFya2Rvd25QYXJ0Py5jb2RlYmxvY2tzID8/IFtdO1xuXHR9XG5cblx0cHVibGljIGdldCBlbGVtZW50SW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudEluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldCBjb250ZW50SW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEluZGV4O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCxcblx0XHR0ZXJtaW5hbERhdGE6IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRlZGl0b3JQb29sOiBFZGl0b3JQb29sLFxuXHRcdGN1cnJlbnRXaWR0aERlbGVnYXRlOiAoKSA9PiBudW1iZXIsXG5cdFx0Y29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsRWRpdG9yU2VydmljZTogSVRlcm1pbmFsRWRpdG9yU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbik7XG5cblx0XHR0aGlzLl9lbGVtZW50SW5kZXggPSBjb250ZXh0LmVsZW1lbnRJbmRleDtcblx0XHR0aGlzLl9jb250ZW50SW5kZXggPSBjb250ZXh0LmNvbnRlbnRJbmRleDtcblx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX2ZvcmNlRXhwYW5kVGVybWluYWxPdXRwdXQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjb250ZXh0LmVsZW1lbnQuaXNUZXJtaW5hbENvbW1hbmQ7XG5cblx0XHR0ZXJtaW5hbERhdGEgPSBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRlcm1pbmFsRGF0YSk7XG5cdFx0dGhpcy5fdGVybWluYWxEYXRhID0gdGVybWluYWxEYXRhO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29tbWFuZFVyaSA9IHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkgPyBVUkkucmV2aXZlKHRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2lzU2VyaWFsaXplZEludm9jYXRpb24gPSAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBoKCcuY2hhdC10ZXJtaW5hbC1jb250ZW50LXBhcnRAY29udGFpbmVyJywgW1xuXHRcdFx0aCgnLmNoYXQtdGVybWluYWwtY29udGVudC10aXRsZUB0aXRsZScsIFtcblx0XHRcdFx0aCgnLmNoYXQtdGVybWluYWwtY29tbWFuZC1ibG9ja0Bjb21tYW5kQmxvY2snKVxuXHRcdFx0XSksXG5cdFx0XHRoKCcuY2hhdC10ZXJtaW5hbC1jb250ZW50LW1lc3NhZ2VAbWVzc2FnZScpXG5cdFx0XSk7XG5cdFx0dGhpcy5fdGl0bGVFbGVtZW50ID0gZWxlbWVudHMudGl0bGU7XG5cblx0XHRjb25zdCBjb21tYW5kID0gKHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5ID8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkID8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkID8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCkudHJpbVN0YXJ0KCk7XG5cdFx0dGhpcy5fY29tbWFuZFRleHQgPSBjb21tYW5kO1xuXHRcdHRoaXMuX3Rlcm1pbmFsT3V0cHV0Q29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5pbkNoYXRUZXJtaW5hbFRvb2xPdXRwdXQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbENvbW1hbmREZWNvcmF0aW9uLCB7XG5cdFx0XHR0ZXJtaW5hbERhdGE6IHRoaXMuX3Rlcm1pbmFsRGF0YSxcblx0XHRcdGdldENvbW1hbmRCbG9jazogKCkgPT4gZWxlbWVudHMuY29tbWFuZEJsb2NrLFxuXHRcdFx0Z2V0SWNvbkVsZW1lbnQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGdldFJlc29sdmVkQ29tbWFuZDogKCkgPT4gdGhpcy5fZ2V0UmVzb2x2ZWRDb21tYW5kKCksXG5cdFx0XHRnZXRJc1J1bm5pbmc6ICgpID0+IHRoaXMuX2lzSW52b2NhdGlvblJ1bm5pbmcoKSxcblx0XHRcdGdldEV4aXRDb2RlOiAoKSA9PiB0aGlzLl9vdXRwdXRTb3VyY2U/LmV4aXRDb2RlLFxuXHRcdH0pKTtcblxuXHRcdC8vIFVzZSBwcmVzZW50YXRpb25PdmVycmlkZXMgZm9yIGRpc3BsYXkgaWYgYXZhaWxhYmxlIChlLmcuLCBleHRyYWN0ZWQgUHl0aG9uIGNvZGUgd2l0aCBzeW50YXggaGlnaGxpZ2h0aW5nKVxuXHRcdGNvbnN0IGRpc3BsYXlDb21tYW5kID0gdGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8uY29tbWFuZExpbmUgPz8gY29tbWFuZDtcblx0XHRjb25zdCBkaXNwbGF5TGFuZ3VhZ2UgPSB0ZXJtaW5hbERhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzPy5sYW5ndWFnZSA/PyB0ZXJtaW5hbERhdGEubGFuZ3VhZ2U7XG5cdFx0Y29uc3QgdGl0bGVQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFF1ZXJ5VGl0bGVQYXJ0LFxuXHRcdFx0ZWxlbWVudHMuY29tbWFuZEJsb2NrLFxuXHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKFtcblx0XHRcdFx0YFxcYFxcYFxcYCR7ZGlzcGxheUxhbmd1YWdlfWAsXG5cdFx0XHRcdGAke2Rpc3BsYXlDb21tYW5kLnJlcGxhY2VBbGwoJ2BgYCcsICdcXFxcYFxcXFxgXFxcXGAnKX1gLFxuXHRcdFx0XHRgXFxgXFxgXFxgYFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aXRsZVBhcnQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbi51cGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9vdXRwdXRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VGVybWluYWxUb29sT3V0cHV0U2VjdGlvbixcblx0XHRcdCgpID0+IHRoaXMuX2Vuc3VyZVRlcm1pbmFsSW5zdGFuY2UoKSxcblx0XHRcdCgpID0+IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCgpLFxuXHRcdFx0KCkgPT4gdGhpcy5fb3V0cHV0U291cmNlLFxuXHRcdFx0KCkgPT4gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCxcblx0XHRcdCgpID0+IHRoaXMuX2NvbW1hbmRUZXh0LFxuXHRcdFx0KCkgPT4gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVGhlbWUsXG5cdFx0XHQoKSA9PiB0aGlzLl9pc0ludm9jYXRpb25SdW5uaW5nKCksXG5cdFx0XHQhIXRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0KSk7XG5cdFx0Ly8gT25seSBhcHBlbmQgdGhlIG91dHB1dCBzZWN0aW9uIGlmIHRoZXJlJ3MgYSB0ZXJtaW5hbCBzZXNzaW9uIG9yIHN0b3JlZCBvdXRwdXQ7XG5cdFx0Ly8gZGlzcGxheS1vbmx5IGludm9jYXRpb25zIHdpdGggbm8gb3V0cHV0IGRvbid0IG5lZWQgdGhlIG91dHB1dCBhcmVhIGF0IGFsbFxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkIHx8IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQpIHtcblx0XHRcdGVsZW1lbnRzLmNvbnRhaW5lci5hcHBlbmQodGhpcy5fb3V0cHV0Vmlldy5kb21Ob2RlKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3V0cHV0Vmlldy5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX2hhbmRsZU91dHB1dEZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vdXRwdXRWaWV3Lm9uRGlkQmx1cihlID0+IHRoaXMuX2hhbmRsZU91dHB1dEJsdXIoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5faGFuZGxlRGlzcG9zZSgpKSk7XG5cblx0XHQvLyBVc2UgYSBsaWdodHdlaWdodCBBY3Rpb25CYXIgaW5zdGVhZCBvZiBNZW51V29ya2JlbmNoVG9vbEJhciB0byBhdm9pZFxuXHRcdC8vIGFjY3VtdWxhdGluZyBsaXN0ZW5lcnMgb24gdGhlIHNoYXJlZCBJQ29udGV4dEtleVNlcnZpY2Ugd2hlbiBtYW55XG5cdFx0Ly8gdGVybWluYWwgdG9vbCBwcm9ncmVzcyBwYXJ0cyBleGlzdCBjb25jdXJyZW50bHkgKGZpeGVzIGxpc3RlbmVyIExFQUspLlxuXHRcdGNvbnN0IGFjdGlvbkJhckVsID0gaCgnLmNoYXQtdGVybWluYWwtYWN0aW9uLWJhckBhY3Rpb25CYXInKTtcblx0XHRlbGVtZW50cy50aXRsZS5hcHBlbmQoYWN0aW9uQmFyRWwucm9vdCk7XG5cdFx0dGhpcy5fYWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihhY3Rpb25CYXJFbC5hY3Rpb25CYXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hY3Rpb25CYXJBY3Rpb25zKTtcblx0XHRsZXQgZGlkSW5pdGlhbGl6ZVRlcm1pbmFsQWN0aW9ucyA9IGZhbHNlO1xuXHRcdGNvbnN0IGluaXRpYWxpemVUZXJtaW5hbEFjdGlvbnNPbmNlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGRpZEluaXRpYWxpemVUZXJtaW5hbEFjdGlvbnMgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkaWRJbml0aWFsaXplVGVybWluYWxBY3Rpb25zID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2luaXRpYWxpemVUZXJtaW5hbEFjdGlvbnMoKTtcblx0XHR9O1xuXHRcdGluaXRpYWxpemVUZXJtaW5hbEFjdGlvbnNPbmNlKCk7XG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLndoZW5Db25uZWN0ZWQudGhlbigoKSA9PiB7XG5cdFx0XHRpbml0aWFsaXplVGVybWluYWxBY3Rpb25zT25jZSgpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjb250aW51ZSBpbiBiYWNrZ3JvdW5kIFx1MjAxNCB1cGRhdGVzIHRvb2xiYXIgdG8gYXV0by1oaWRlIHRoZSBhY3Rpb25cblx0XHRjb25zdCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkO1xuXHRcdGlmICh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaE91dHB1dFNvdXJjZSgpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLm9uRGlkUmVnaXN0ZXJPdXRwdXRTb3VyY2Uoc2Vzc2lvbklkID0+IHtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbklkID09PSB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2F0dGFjaE91dHB1dFNvdXJjZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5vbkRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kKHNlc3Npb25JZCA9PiB7XG5cdFx0XHRcdGlmIChzZXNzaW9uSWQgPT09IHRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsRGF0YS5kaWRDb250aW51ZUluQmFja2dyb3VuZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5fdG9vbGJhckNhbkNvbnRpbnVlSW5CYWNrZ3JvdW5kID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckFjdGlvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRsZXQgcGFzdFRlbnNlTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlKSB7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlID0gYCR7dHlwZW9mIHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA6IHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UudmFsdWV9YDtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2Rvd25Db250ZW50ID0gbmV3IE1hcmtkb3duU3RyaW5nKHBhc3RUZW5zZU1lc3NhZ2UsIHtcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLFxuXHRcdFx0aXNUcnVzdGVkOiBpc01hcmtkb3duU3RyaW5nKHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UpID8gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZS5pc1RydXN0ZWQgOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBjaGF0TWFya2Rvd25Db250ZW50OiBJQ2hhdE1hcmtkb3duQ29udGVudCA9IHtcblx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0Y29udGVudDogbWFya2Rvd25Db250ZW50LFxuXHRcdH07XG5cblx0XHRjb25zdCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zOiBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucyA9IHtcblx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0d29yZFdyYXA6ICdvbidcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFya2Rvd25PcHRpb25zOiBJQ2hhdE1hcmtkb3duQ29udGVudFBhcnRPcHRpb25zID0ge1xuXHRcdFx0Y29kZUJsb2NrUmVuZGVyT3B0aW9ucyxcblx0XHRcdGFjY2Vzc2liaWxpdHlPcHRpb25zOiBwYXN0VGVuc2VNZXNzYWdlID8ge1xuXHRcdFx0XHRzdGF0dXNNZXNzYWdlOiBsb2NhbGl6ZSgndGVybWluYWxUb29sQ29tbWFuZCcsICd7MH0nLCBzdHJpcEljb25zKHBhc3RUZW5zZU1lc3NhZ2UpKVxuXHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHR0aGlzLm1hcmtkb3duUGFydCA9IHRoaXMuX3JlZ2lzdGVyKF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWFya2Rvd25Db250ZW50UGFydCwgY2hhdE1hcmtkb3duQ29udGVudCwgY29udGV4dCwgZWRpdG9yUG9vbCwgZmFsc2UsIGNvZGVCbG9ja1N0YXJ0SW5kZXgsIHJlbmRlcmVyLCB7fSwgY3VycmVudFdpZHRoRGVsZWdhdGUoKSwgbWFya2Rvd25PcHRpb25zKSk7XG5cblx0XHRlbGVtZW50cy5tZXNzYWdlLmFwcGVuZCh0aGlzLm1hcmtkb3duUGFydC5kb21Ob2RlKTtcblx0XHRjb25zdCBwcm9ncmVzc1BhcnQgPSB0aGlzLl9yZWdpc3RlcihfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFByb2dyZXNzU3ViUGFydCwgZWxlbWVudHMuY29udGFpbmVyLCB0aGlzLmdldEljb24oKSwgdGVybWluYWxEYXRhLmF1dG9BcHByb3ZlSW5mbykpO1xuXHRcdHByb2dyZXNzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdGVybWluYWwtcHJvZ3Jlc3Mtcm93Jyk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbi51cGRhdGUoKTtcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHR0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0aGlua2luZy1jb250YWluZXIgc2VtYW50aWNzIHNlcGFyYXRlIGZyb20gd3JhcHBlciBzZW1hbnRpY3MuXG5cdFx0Y29uc3QgdGVybWluYWxUb29sc0luVGhpbmtpbmcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5UZXJtaW5hbFRvb2xzSW5UaGlua2luZyk7XG5cdFx0Y29uc3QgaXNTaW1wbGVUZXJtaW5hbCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlNpbXBsZVRlcm1pbmFsQ29sbGFwc2libGUpO1xuXHRcdGNvbnN0IHJlcXVpcmVzQ29uZmlybWF0aW9uID0gdG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmdldENvbmZpcm1hdGlvbk1lc3NhZ2VzKHRvb2xJbnZvY2F0aW9uKTtcblx0XHR0aGlzLl9pc0luVGhpbmtpbmdDb250YWluZXIgPSB0ZXJtaW5hbFRvb2xzSW5UaGlua2luZyAmJiAhcmVxdWlyZXNDb25maXJtYXRpb247XG5cdFx0dGhpcy5fdXNlc0NvbGxhcHNpYmxlV3JhcHBlciA9IHRoaXMuX2lzSW5UaGlua2luZ0NvbnRhaW5lciB8fCBpc1NpbXBsZVRlcm1pbmFsO1xuXG5cdFx0aWYgKHRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuX2NyZWF0ZUNvbGxhcHNpYmxlV3JhcHBlcihwcm9ncmVzc1BhcnQuZG9tTm9kZSwgZGlzcGxheUNvbW1hbmQsIHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kb21Ob2RlID0gcHJvZ3Jlc3NQYXJ0LmRvbU5vZGU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVySW1hZ2VQaWxscyh0b29sSW52b2NhdGlvbiwgY29udGV4dCwgZWxlbWVudHMuY29udGFpbmVyKTtcblxuXHRcdC8vIE9ubHkgYXV0by1leHBhbmQgaW4gdGhpbmtpbmcgY29udGFpbmVycyBpZiB0aGVyZSdzIGFjdHVhbCBvdXRwdXQgdG8gc2hvd1xuXHRcdGNvbnN0IGhhc1N0b3JlZE91dHB1dCA9ICEhdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dDtcblx0XHRjb25zdCBzdG9yZWRFeHBhbmRlZFN0YXRlID0gZXhwYW5kZWRTdGF0ZUJ5SW52b2NhdGlvbi5nZXQodG9vbEludm9jYXRpb24pO1xuXHRcdGNvbnN0IGhhc1N0b3JlZEV4cGFuZGVkU3RhdGUgPSBleHBhbmRlZFN0YXRlQnlJbnZvY2F0aW9uLmhhcyh0b29sSW52b2NhdGlvbik7XG5cdFx0aWYgKHN0b3JlZEV4cGFuZGVkU3RhdGUgfHwgKCFoYXNTdG9yZWRFeHBhbmRlZFN0YXRlICYmIHRoaXMuX2ZvcmNlRXhwYW5kVGVybWluYWxPdXRwdXQpIHx8ICh0aGlzLl9pc0luVGhpbmtpbmdDb250YWluZXIgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRvb2xJbnZvY2F0aW9uKSAmJiBoYXNTdG9yZWRPdXRwdXQpKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5yZWdpc3RlclByb2dyZXNzUGFydCh0aGlzKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBpbWFnZSBhdHRhY2htZW50IHBpbGxzIGJlbG93IHRoZSB0ZXJtaW5hbCBvdXRwdXQgd2hlbiB0aGUgdG9vbFxuXHQgKiByZXN1bHQgY29udGFpbnMgaW1hZ2UgZGF0YSBwYXJ0cy4gRm9yIGNvbGxhcHNpYmxlIHdyYXBwZXJzLCB0aGUgc2luZ2xlXG5cdCAqIHdpZGdldCBpcyByZXBhcmVudGVkIGJldHdlZW4gaW5zaWRlL291dHNpZGUgYmFzZWQgb24gZXhwYW5kZWQgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW5kZXJJbWFnZVBpbGxzKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBpbm5lckNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCByZW5kZXJJbWFnZXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHRyYWN0ZWQgPSBleHRyYWN0SW1hZ2VzRnJvbVRvb2xJbnZvY2F0aW9uT3V0cHV0RGV0YWlscyh0b29sSW52b2NhdGlvbiwgY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBpbWFnZVBhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdID0gZXh0cmFjdGVkLm1hcChpbWcgPT4gKHtcblx0XHRcdFx0a2luZDogJ2RhdGEnLFxuXHRcdFx0XHR2YWx1ZTogaW1nLmRhdGEuYnVmZmVyLFxuXHRcdFx0XHRtaW1lVHlwZTogaW1nLm1pbWVUeXBlLFxuXHRcdFx0XHR1cmk6IGltZy51cmksXG5cdFx0XHR9KSk7XG5cdFx0XHRpZiAoaW1hZ2VQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVzb3VyY2VHcm91cFdpZGdldCwgaW1hZ2VQYXJ0cykpO1xuXG5cdFx0XHRpZiAodGhpcy5fdGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdFx0Ly8gUmVwYXJlbnQgdGhlIHNpbmdsZSB3aWRnZXQgYmV0d2VlbiBpbm5lciAoZXhwYW5kZWQpIGFuZCBvdXRlciAoY29sbGFwc2VkKVxuXHRcdFx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fdGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXI7XG5cdFx0XHRcdGNvbnN0IHBsYWNlV2lkZ2V0ID0gKGV4cGFuZGVkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGV4cGFuZGVkKSB7XG5cdFx0XHRcdFx0XHRpbm5lckNvbnRhaW5lci5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHdyYXBwZXIuZG9tTm9kZS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRwbGFjZVdpZGdldCh3cmFwcGVyLmV4cGFuZGVkLmdldCgpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdHBsYWNlV2lkZ2V0KHdyYXBwZXIuZXhwYW5kZWQucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5uZXJDb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdHJlbmRlckltYWdlcygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0cmVuZGVySW1hZ2VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb2xsYXBzaWJsZVdyYXBwZXIoY29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb21tYW5kVGV4dDogc3RyaW5nLCB0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCk6IEhUTUxFbGVtZW50IHtcblx0XHQvLyB0cnVuY2F0ZSBoZWFkZXIgd2hlbiBpdCdzIHRvbyBsb25nXG5cdFx0Y29uc3QgdHJ1bmNhdGVkQ29tbWFuZCA9IGNvbW1hbmRUZXh0Lmxlbmd0aCA+IE1BWF9DT01NQU5EX1RJVExFX0xFTkdUSFxuXHRcdFx0PyBjb21tYW5kVGV4dC5zdWJzdHJpbmcoMCwgTUFYX0NPTU1BTkRfVElUTEVfTEVOR1RIKSArICcuLi4nXG5cdFx0XHQ6IGNvbW1hbmRUZXh0O1xuXG5cdFx0Ly8gQSBiYWNrZ3JvdW5kIHRlcm1pbmFsIG1heSBoYXZlIGl0cyB0b29sIGludm9jYXRpb24gbWFya2VkIGNvbXBsZXRlICh0aGVcblx0XHQvLyB0b29sIHJldHVybmVkKSB3aGlsZSB0aGUgdGVybWluYWwgY29tbWFuZCBpcyBzdGlsbCBydW5uaW5nLiBEZXRlY3QgdGhpc1xuXHRcdC8vIHNvIHRoZSB3cmFwcGVyIHNob3dzIFwiUnVubmluZyBcdTIwMjYgaW4gYmFja2dyb3VuZFwiIGluc3RlYWQgb2YgXCJSYW4gXHUyMDI2XCIuXG5cdFx0Y29uc3QgdG9vbEludm9jYXRpb25Db21wbGV0ZSA9IElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbik7XG5cdFx0Y29uc3QgaXNSdW5uaW5nSW5CYWNrZ3JvdW5kID0gdG9vbEludm9jYXRpb25Db21wbGV0ZSAmJiB0aGlzLl9pc0ludm9jYXRpb25SdW5uaW5nKCk7XG5cdFx0Y29uc3QgaXNDb21wbGV0ZSA9IHRvb2xJbnZvY2F0aW9uQ29tcGxldGUgJiYgIWlzUnVubmluZ0luQmFja2dyb3VuZDtcblx0XHRjb25zdCBpc1NraXBwZWQgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmV4ZWN1dGlvbkNvbmZpcm1lZE9yRGVuaWVkKHRvb2xJbnZvY2F0aW9uKT8udHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQ7XG5cdFx0Y29uc3QgYXV0b0V4cGFuZEZhaWx1cmVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0V4cGFuZFRvb2xGYWlsdXJlcyk7XG5cdFx0Y29uc3QgaGFzRXJyb3IgPSBhdXRvRXhwYW5kRmFpbHVyZXMgJiYgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSAhPT0gMDtcblx0XHRjb25zdCBpbml0aWFsRXhwYW5kZWQgPSAhaXNDb21wbGV0ZSB8fCBoYXNFcnJvciB8fCB0aGlzLl9mb3JjZUV4cGFuZFRlcm1pbmFsT3V0cHV0O1xuXG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRlcm1pbmFsVGhpbmtpbmdDb2xsYXBzaWJsZVdyYXBwZXIsXG5cdFx0XHR0cnVuY2F0ZWRDb21tYW5kLFxuXHRcdFx0dGhpcy5fdGVybWluYWxEYXRhLmludGVudGlvbixcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5pc1NhbmRib3hXcmFwcGVkID09PSB0cnVlLFxuXHRcdFx0Y29udGVudEVsZW1lbnQsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0aW5pdGlhbEV4cGFuZGVkLFxuXHRcdFx0aXNDb21wbGV0ZSxcblx0XHRcdGlzU2tpcHBlZCxcblx0XHRcdGlzUnVubmluZ0luQmFja2dyb3VuZCxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRGF0YS5pc1B0eSA9PT0gZmFsc2UgPyB1bmRlZmluZWQgOiAoKSA9PiB0aGlzLmZvY3VzVGVybWluYWwoKSxcblx0XHQpKTtcblx0XHR0aGlzLl90aGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlciA9IHdyYXBwZXI7XG5cblx0XHQvLyBTeW5jIHRlcm1pbmFsIG91dHB1dCBleHBhbnNpb24gd2l0aCB0aGUgY29sbGFwc2libGUgd3JhcHBlci5cblx0XHQvLyBTa2lwIHRoZSBpbml0aWFsIHJ1biBcdTIwMTQgaW5pdGlhbCBzdGF0ZSBpcyBoYW5kbGVkIHNlcGFyYXRlbHkuXG5cdFx0bGV0IGlzRmlyc3RSdW4gPSB0cnVlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IHdyYXBwZXIuZXhwYW5kZWQucmVhZChyKTtcblx0XHRcdGlmIChpc0ZpcnN0UnVuKSB7XG5cdFx0XHRcdGlzRmlyc3RSdW4gPSBmYWxzZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdG9nZ2xlT3V0cHV0KGV4cGFuZGVkKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gd3JhcHBlci5kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZENvbGxhcHNpYmxlV3JhcHBlcigpOiB2b2lkIHtcblx0XHR0aGlzLl90aGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlcj8uZXhwYW5kKCk7XG5cdH1cblxuXHRwdWJsaWMgbWFya0NvbGxhcHNpYmxlV3JhcHBlckNvbXBsZXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RoaW5raW5nQ29sbGFwc2libGVXcmFwcGVyPy5tYXJrQ29tcGxldGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2luaXRpYWxpemVUZXJtaW5hbEFjdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGVybWluYWxUb29sU2Vzc2lvbklkID0gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZDtcblx0XHRpZiAoIXRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEuaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hPdXRwdXRTb3VyY2UoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh1bmRlZmluZWQsIHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0YWNoSW5zdGFuY2UgPSBhc3luYyAoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1NlcmlhbGl6ZWRJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJDb21tYW5kQXNzb2NpYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModW5kZWZpbmVkLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc05ld0luc3RhbmNlID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZSAhPT0gaW5zdGFuY2U7XG5cdFx0XHRpZiAoaXNOZXdJbnN0YW5jZSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlID0gaW5zdGFuY2U7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVySW5zdGFuY2VMaXN0ZW5lcihpbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXMoaW5zdGFuY2UsIHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluaXRpYWxJbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0VGVybWluYWxJbnN0YW5jZUJ5VG9vbFNlc3Npb25JZCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdGF3YWl0IGF0dGFjaEluc3RhbmNlKGluaXRpYWxJbnN0YW5jZSk7XG5cblx0XHRpZiAoIWluaXRpYWxJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHVuZGVmaW5lZCwgdGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fdGVybWluYWxTZXNzaW9uUmVnaXN0cmF0aW9uKSB7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uub25EaWRSZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoVG9vbFNlc3Npb24oYXN5bmMgaW5zdGFuY2UgPT4ge1xuXHRcdFx0XHRjb25zdCByZWdpc3RlcmVkSW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldFRlcm1pbmFsSW5zdGFuY2VCeVRvb2xTZXNzaW9uSWQodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdFx0aWYgKGluc3RhbmNlICE9PSByZWdpc3RlcmVkSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXNzaW9uUmVnaXN0cmF0aW9uPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2Vzc2lvblJlZ2lzdHJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0YXdhaXQgYXR0YWNoSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlc3Npb25SZWdpc3RyYXRpb24gPSB0aGlzLl9zdG9yZS5hZGQobGlzdGVuZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBzY29wZWQgY29udGV4dCBrZXlzIHRoYXQgZHJpdmUgdG9vbGJhciBhY3Rpb24gdmlzaWJpbGl0eS5cblx0ICogVGhlIEFjdGlvbkJhciBpcyByZWJ1aWx0IHdpdGggdGhlIGNvcnJlY3Qgc2V0IG9mIHZpc2libGUgYWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh0ZXJtaW5hbEluc3RhbmNlPzogSVRlcm1pbmFsSW5zdGFuY2UsIHRlcm1pbmFsVG9vbFNlc3Npb25JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVkQ29tbWFuZCA9IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblxuXHRcdC8vIEZvY3VzIHRlcm1pbmFsIGFjdGlvblxuXHRcdHRoaXMuX3Rvb2xiYXJIYXNJbnN0YW5jZSA9ICEhdGVybWluYWxJbnN0YW5jZTtcblx0XHRpZiAodGVybWluYWxJbnN0YW5jZSAmJiB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Rvb2xiYXJJc0hpZGRlblRlcm1pbmFsID0gdGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5pc0JhY2tncm91bmRUZXJtaW5hbCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b29sYmFySXNIaWRkZW5UZXJtaW5hbCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENvbnRpbnVlIGluIGJhY2tncm91bmQgYWN0aW9uXG5cdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UgJiYgdGVybWluYWxUb29sU2Vzc2lvbklkICYmICF0aGlzLl90ZXJtaW5hbERhdGEuaXNCYWNrZ3JvdW5kICYmICF0aGlzLl90ZXJtaW5hbERhdGEuZGlkQ29udGludWVJbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IGlzU3RpbGxSdW5uaW5nID0gcmVzb2x2ZWRDb21tYW5kPy5leGl0Q29kZSA9PT0gdW5kZWZpbmVkICYmIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGUgPT09IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3Rvb2xiYXJDYW5Db250aW51ZUluQmFja2dyb3VuZCA9IGlzU3RpbGxSdW5uaW5nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90b29sYmFyQ2FuQ29udGludWVJbkJhY2tncm91bmQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBTaG93IG91dHB1dCBhY3Rpb24gKG9ubHkgd2hlbiBOT1QgdXNpbmcgY29sbGFwc2libGUgd3JhcHBlcilcblx0XHRpZiAoIXRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdGNvbnN0IGhhc1NuYXBzaG90ID0gISF0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kT3V0cHV0IHx8ICEhdGhpcy5fb3V0cHV0U291cmNlPy5vdXRwdXQ7XG5cdFx0XHRjb25zdCBoYXNPdXRwdXQgPSAhIXJlc29sdmVkQ29tbWFuZCB8fCBoYXNTbmFwc2hvdDtcblx0XHRcdHRoaXMuX3Rvb2xiYXJIYXNPdXRwdXQgPSBoYXNPdXRwdXQ7XG5cblx0XHRcdC8vIEF1dG8tZXhwYW5kIG9uIGZpcnN0IGRldGVjdGlvbiBvZiBmYWlsZWQgb3V0cHV0XG5cdFx0XHRpZiAoaGFzT3V0cHV0ICYmICF0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQpIHtcblx0XHRcdFx0Y29uc3QgYXV0b0V4cGFuZEZhaWx1cmVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0V4cGFuZFRvb2xGYWlsdXJlcyk7XG5cdFx0XHRcdGNvbnN0IGV4aXRDb2RlID0gcmVzb2x2ZWRDb21tYW5kPy5leGl0Q29kZSA/PyB0aGlzLl9vdXRwdXRTb3VyY2U/LmV4aXRDb2RlID8/IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGU7XG5cdFx0XHRcdGlmIChleGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIGV4aXRDb2RlICE9PSAwICYmIGF1dG9FeHBhbmRGYWlsdXJlcykge1xuXHRcdFx0XHRcdHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbi51cGRhdGUocmVzb2x2ZWRDb21tYW5kKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJ1aWxkcyB0aGUgQWN0aW9uQmFyIGFjdGlvbnMgYmFzZWQgb24gY3VycmVudCB0b29sYmFyIHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlVG9vbGJhckFjdGlvbnMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3Rpb25CYXIgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3Rpb25CYXJBY3Rpb25zLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKHRoaXMuX3Rvb2xiYXJDYW5Db250aW51ZUluQmFja2dyb3VuZCkge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IEFjdGlvbihcblx0XHRcdFx0VGVybWluYWxDb250cmliQ29tbWFuZElkLkNvbnRpbnVlSW5CYWNrZ3JvdW5kLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY29udGludWVJbkJhY2tncm91bmQnLCAnQ29udGludWUgaW4gQmFja2dyb3VuZCcpLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5kZWJ1Z0NvbnRpbnVlU21hbGwpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNvbnRpbnVlSW5CYWNrZ3JvdW5kKClcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25CYXJBY3Rpb25zLmFkZChhY3Rpb24pO1xuXHRcdFx0YWN0aW9ucy5wdXNoKGFjdGlvbik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90b29sYmFySGFzSW5zdGFuY2UpIHtcblx0XHRcdGNvbnN0IGZvY3VzTGFiZWwgPSB0aGlzLl90b29sYmFySXNIaWRkZW5UZXJtaW5hbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdzaG93VGVybWluYWwnLCAnU2hvdyBhbmQgRm9jdXMgVGVybWluYWwnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdmb2N1c1Rlcm1pbmFsJywgJ0ZvY3VzIFRlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgQWN0aW9uKFxuXHRcdFx0XHRUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuRm9jdXNDaGF0SW5zdGFuY2VBY3Rpb24sXG5cdFx0XHRcdGZvY3VzTGFiZWwsXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLm9wZW5JblByb2R1Y3QpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmZvY3VzVGVybWluYWwoKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2FjdGlvbkJhckFjdGlvbnMuYWRkKGFjdGlvbik7XG5cdFx0XHRhY3Rpb25zLnB1c2goYWN0aW9uKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Rvb2xiYXJIYXNPdXRwdXQgJiYgIXRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdGNvbnN0IHRvZ2dsZUljb24gPSB0aGlzLl90b29sYmFyT3V0cHV0RXhwYW5kZWQgPyBDb2RpY29uLmNoZXZyb25Eb3duIDogQ29kaWNvbi5jaGV2cm9uUmlnaHQ7XG5cdFx0XHRjb25zdCB0b2dnbGVMYWJlbCA9IHRoaXMuX3Rvb2xiYXJPdXRwdXRFeHBhbmRlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdoaWRlVGVybWluYWxPdXRwdXQnLCAnSGlkZSBPdXRwdXQnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzaG93VGVybWluYWxPdXRwdXQnLCAnU2hvdyBPdXRwdXQnKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBBY3Rpb24oXG5cdFx0XHRcdFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZC5Ub2dnbGVDaGF0VGVybWluYWxPdXRwdXQsXG5cdFx0XHRcdHRvZ2dsZUxhYmVsLFxuXHRcdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUodG9nZ2xlSWNvbiksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHRoaXMudG9nZ2xlT3V0cHV0RnJvbUFjdGlvbigpXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fYWN0aW9uQmFyQWN0aW9ucy5hZGQoYWN0aW9uKTtcblx0XHRcdGFjdGlvbnMucHVzaChhY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc29sdmVkQ29tbWFuZChpbnN0YW5jZT86IElUZXJtaW5hbEluc3RhbmNlKTogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gaW5zdGFuY2UgPz8gdGhpcy5fdGVybWluYWxJbnN0YW5jZTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVDb21tYW5kKHRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0ludm9jYXRpb25SdW5uaW5nKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGN1cnJlbnRUZXJtaW5hbERhdGEgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCdcblx0XHRcdD8gbWlncmF0ZUxlZ2FjeVRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpXG5cdFx0XHQ6IHRoaXMuX3Rlcm1pbmFsRGF0YTtcblx0XHRpZiAoY3VycmVudFRlcm1pbmFsRGF0YS5pc1B0eSA9PT0gZmFsc2UpIHtcblx0XHRcdGlmICh0aGlzLl9vdXRwdXRTb3VyY2U/LmV4aXRDb2RlICE9PSB1bmRlZmluZWQgfHwgY3VycmVudFRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0aGlzLnRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjdXJyZW50VGVybWluYWxEYXRhLmlzQmFja2dyb3VuZCA9PT0gdHJ1ZSB8fCBjdXJyZW50VGVybWluYWxEYXRhLmRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kID09PSB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kRXhpdENvZGUgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQoKT8uZXhpdENvZGU7XG5cdFx0aWYgKGNvbW1hbmRFeGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlZEV4aXRDb2RlID0gY3VycmVudFRlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZT8uZXhpdENvZGU7XG5cdFx0aWYgKHN0b3JlZEV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodGhpcy50b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudFRlcm1pbmFsRGF0YS5pc0JhY2tncm91bmQgPT09IHRydWUgfHwgY3VycmVudFRlcm1pbmFsRGF0YS5kaWRDb250aW51ZUluQmFja2dyb3VuZCA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQ29tbWFuZEFzc29jaWF0aW9uKG9wdGlvbnM/OiB7IGNsZWFyUGVyc2lzdGVudERhdGE/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbENvbW1hbmRVcmkgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnM/LmNsZWFyUGVyc2lzdGVudERhdGEpIHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kVXJpKSB7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kVXJpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdFx0ZGVsZXRlIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCBvdXRwdXQgc2hvdWxkIGF1dG8tZXhwYW5kLlxuXHQgKiBSZXR1cm5zIGZhbHNlIGlmIGFscmVhZHkgZXhwYW5kZWQsIHVzZXIgaGFzIG1hbnVhbGx5IHRvZ2dsZWQsIGNvbXBvbmVudCBpcyBkaXNwb3NlZCxcblx0ICogb3IgaWYgdGhlIGludm9jYXRpb24gd2FzIHByZXZpb3VzbHkgZXhwYW5kZWQgKHRvIHByZXNlcnZlIHN0YXRlIGFjcm9zcyByZS1yZW5kZXJzKS5cblx0ICovXG5cdHByaXZhdGUgX3Nob3VsZEF1dG9FeHBhbmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQgJiZcblx0XHRcdCF0aGlzLl91c2VyVG9nZ2xlZE91dHB1dCAmJlxuXHRcdFx0IXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiZcblx0XHRcdCghdGhpcy5fZm9yY2VFeHBhbmRUZXJtaW5hbE91dHB1dCB8fCAhZXhwYW5kZWRTdGF0ZUJ5SW52b2NhdGlvbi5oYXModGhpcy50b29sSW52b2NhdGlvbikpICYmXG5cdFx0XHQhZXhwYW5kZWRTdGF0ZUJ5SW52b2NhdGlvbi5nZXQodGhpcy50b29sSW52b2NhdGlvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGV2ZW50IGxpc3RlbmVycyBvbiB0aGUgdGVybWluYWwgaW5zdGFuY2UgdG8gdHJhY2sgY29tbWFuZCBleGVjdXRpb24sXG5cdCAqIG1hbmFnZSBhdXRvLWV4cGFuc2lvbiBvZiBvdXRwdXQsIGFuZCBoYW5kbGUgY29tbWFuZCBjb21wbGV0aW9uLlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBzZXRzIHVwOlxuXHQgKiAtIENvbW1hbmQgZGV0ZWN0aW9uIGxpc3RlbmVycyBmb3IgdHJhY2tpbmcgY29tbWFuZCBsaWZlY3ljbGVcblx0ICogLSBBdXRvLWV4cGFuZCBsb2dpYyBiYXNlZCBvbiBjb21tYW5kIG91dHB1dCBhbmQgZHVyYXRpb25cblx0ICogLSBJbnN0YW5jZSBkaXNwb3NhbCBoYW5kbGluZyB0byBjbGVhbiB1cCBhY3Rpb25zIGFuZCBzdGF0ZVxuXHQgKi9cblx0cHJpdmF0ZSBfcmVnaXN0ZXJJbnN0YW5jZUxpc3RlbmVyKHRlcm1pbmFsSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRjb25zdCB0cnlSZXNvbHZlQ29tbWFuZCA9IGFzeW5jICgpOiBQcm9taXNlPElUZXJtaW5hbENvbW1hbmQgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29tbWFuZCA9IHRoaXMuX3Jlc29sdmVDb21tYW5kKHRlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHRlcm1pbmFsSW5zdGFuY2UsIHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVkQ29tbWFuZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXR0YWNoQ29tbWFuZERldGVjdGlvbiA9IGFzeW5jIChjb21tYW5kRGV0ZWN0aW9uOiBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0aWYgKCFjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRcdC8vIFRyeSBBSFAgY29tbWFuZCBzb3VyY2UgYXMgZmFsbGJhY2tcblx0XHRcdFx0Y29uc3QgYWhwU291cmNlID0gdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZFxuXHRcdFx0XHRcdD8gdGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5nZXRBaHBDb21tYW5kU291cmNlKHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChhaHBTb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9hdHRhY2hBaHBDb21tYW5kU291cmNlKHRlcm1pbmFsSW5zdGFuY2UsIGFocFNvdXJjZSwgY29tbWFuZERldGVjdGlvbkxpc3RlbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0cnlSZXNvbHZlQ29tbWFuZCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IHJlY2VpdmVkRGF0YUNvdW50ID0gMDtcblxuXHRcdFx0Y29uc3QgaGFzUmVhbE91dHB1dCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHNuYXBzaG90IG91dHB1dFxuXHRcdFx0XHRpZiAodGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dD8udHJpbSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGxpdmUgb3V0cHV0IChjdXJzb3IgbW92ZWQgcGFzdCBleGVjdXRlZCBtYXJrZXIpXG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQodGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdGlmICghY29tbWFuZD8uZXhlY3V0ZWRNYXJrZXIgfHwgdGVybWluYWxJbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IHRlcm1pbmFsSW5zdGFuY2UueHRlcm0/LnJhdy5idWZmZXIuYWN0aXZlO1xuXHRcdFx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJzb3JMaW5lID0gYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclk7XG5cdFx0XHRcdGlmIChjdXJzb3JMaW5lID4gY29tbWFuZC5leGVjdXRlZE1hcmtlci5saW5lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWYgd2UndmUgcmVjZWl2ZWQgbWFueSBkYXRhIGV2ZW50cywgdHJlYXQgaXQgYXMgcmVhbCBvdXRwdXQgZXZlbiBpZiBjdXJzb3Jcblx0XHRcdFx0Ly8gaGFzbid0IG1vdmVkIHBhc3QgdGhlIG1hcmtlciAoZS5nLiwgcHJvZ3Jlc3MgYmFycyB1cGRhdGluZyBvbiBzYW1lIGxpbmUpXG5cdFx0XHRcdC8vIFNoZWxsIGludGVncmF0aW9uIHNlcXVlbmNlcyBmaXJlIGEgY291cGxlIHRpbWVzIHBlciBjb21tYW5kIChQcm9tcHRTdGFydCwgQ29tbWFuZFN0YXJ0LFxuXHRcdFx0XHQvLyBDb21tYW5kRXhlY3V0ZWQpLCBzbyB3ZSBuZWVkIGEgc21hbGwgdGhyZXNob2xkIHRvIGZpbHRlciB0aG9zZSBvdXRcblx0XHRcdFx0cmV0dXJuIHJlY2VpdmVkRGF0YUNvdW50ID4gTUlOX0RBVEFfRVZFTlRTX0ZPUl9SRUFMX09VVFBVVDtcblx0XHRcdH07XG5cblx0XHRcdC8vIFVzZSB0aGUgZXh0cmFjdGVkIGF1dG8tZXhwYW5kIGxvZ2ljXG5cdFx0XHRjb25zdCBhdXRvRXhwYW5kID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kKHtcblx0XHRcdFx0b25Db21tYW5kRXhlY3V0ZWQ6IEV2ZW50Lm1hcChjb21tYW5kRGV0ZWN0aW9uLm9uQ29tbWFuZEV4ZWN1dGVkLCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogRXZlbnQubWFwKGNvbW1hbmREZXRlY3Rpb24ub25Db21tYW5kRmluaXNoZWQsICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRcdG9uV2lsbERhdGE6IHRlcm1pbmFsSW5zdGFuY2Uub25XaWxsRGF0YSxcblx0XHRcdFx0c2hvdWxkQXV0b0V4cGFuZDogKCkgPT4gdGhpcy5fc2hvdWxkQXV0b0V4cGFuZCgpLFxuXHRcdFx0XHRoYXNSZWFsT3V0cHV0LFxuXHRcdFx0fSkpO1xuXHRcdFx0c3RvcmUuYWRkKGF1dG9FeHBhbmQub25EaWRSZXF1ZXN0RXhwYW5kKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdFx0XHR0aGlzLmV4cGFuZENvbGxhcHNpYmxlV3JhcHBlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gVHJhY2sgZGF0YSBldmVudHMgdG8gaGVscCBoYXNSZWFsT3V0cHV0IGRldGVjdCBwcm9ncmVzcy1zdHlsZSBvdXRwdXRcblx0XHRcdHN0b3JlLmFkZCh0ZXJtaW5hbEluc3RhbmNlLm9uV2lsbERhdGEoKCkgPT4ge1xuXHRcdFx0XHRyZWNlaXZlZERhdGFDb3VudCsrO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoY29tbWFuZERldGVjdGlvbi5vbkNvbW1hbmRFeGVjdXRlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXJDb250ZXh0S2V5cyh0ZXJtaW5hbEluc3RhbmNlLCB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGNvbW1hbmREZXRlY3Rpb24ub25Db21tYW5kRmluaXNoZWQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModGVybWluYWxJbnN0YW5jZSwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkQ29tbWFuZCA9IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblxuXHRcdFx0XHR0aGlzLl9oYW5kbGVDb21tYW5kQ29tcGxldGlvbihyZXNvbHZlZENvbW1hbmQpO1xuXG5cdFx0XHRcdGlmIChyZXNvbHZlZENvbW1hbmQ/LmVuZE1hcmtlcikge1xuXHRcdFx0XHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIudmFsdWUgPSBzdG9yZTtcblxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRJbW1lZGlhdGVseSA9IGF3YWl0IHRyeVJlc29sdmVDb21tYW5kKCk7XG5cdFx0XHRpZiAocmVzb2x2ZWRJbW1lZGlhdGVseT8uZW5kTWFya2VyKSB7XG5cdFx0XHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVDb21tYW5kQ29tcGxldGlvbihyZXNvbHZlZEltbWVkaWF0ZWx5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhdHRhY2hDb21tYW5kRGV0ZWN0aW9uKHRlcm1pbmFsSW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsSW5zdGFuY2UuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkoY2QgPT4gYXR0YWNoQ29tbWFuZERldGVjdGlvbihjZCkpKTtcblxuXHRcdGNvbnN0IGluc3RhbmNlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3Rlcih0ZXJtaW5hbEluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgPT09IHRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NsZWFyQ29tbWFuZEFzc29jaWF0aW9uKHsgY2xlYXJQZXJzaXN0ZW50RGF0YTogdHJ1ZSB9KTtcblx0XHRcdGNvbW1hbmREZXRlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHVuZGVmaW5lZCwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRpbnN0YW5jZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB1cCBsaXN0ZW5lcnMgdXNpbmcgYW4ge0BsaW5rIElBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2V9IHdoZW4gbm8gbG9jYWxcblx0ICogYElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eWAgaXMgYXZhaWxhYmxlLiBQcm92aWRlcyBhdXRvLWV4cGFuZCwgdG9vbGJhclxuXHQgKiBjb250ZXh0IGtleSB1cGRhdGVzLCBhbmQgY29tbWFuZCBjb21wbGV0aW9uIGhhbmRsaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXR0YWNoQWhwQ29tbWFuZFNvdXJjZShcblx0XHR0ZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRhaHBTb3VyY2U6IElBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2UsXG5cdFx0Y29tbWFuZERldGVjdGlvbkxpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4sXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgaGFzUmVhbE91dHB1dCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdC8vIEZvciBBSFAgdGVybWluYWxzLCBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMgYXJlIHN0cmlwcGVkIHNlcnZlci1zaWRlLlxuXHRcdFx0Ly8gUmVhbCBvdXRwdXQgaXMgc2ltcGx5IHdoZXRoZXIgdGhlIGNvbW1hbmQgaGFzIG5vbi1lbXB0eSBvdXRwdXQuXG5cdFx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fZ2V0UmVzb2x2ZWRDb21tYW5kKHRlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdFx0aWYgKGNvbW1hbmQ/Lmhhc091dHB1dCgpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICEhdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dD8udHJpbSgpO1xuXHRcdH07XG5cblx0XHRjb25zdCBhdXRvRXhwYW5kID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kKHtcblx0XHRcdG9uQ29tbWFuZEV4ZWN1dGVkOiBFdmVudC5tYXAoYWhwU291cmNlLm9uQ29tbWFuZEV4ZWN1dGVkLCAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IEV2ZW50Lm1hcChhaHBTb3VyY2Uub25Db21tYW5kRmluaXNoZWQsICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRvbldpbGxEYXRhOiB0ZXJtaW5hbEluc3RhbmNlLm9uV2lsbERhdGEsXG5cdFx0XHRzaG91bGRBdXRvRXhwYW5kOiAoKSA9PiB0aGlzLl9zaG91bGRBdXRvRXhwYW5kKCksXG5cdFx0XHRoYXNSZWFsT3V0cHV0LFxuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoYXV0b0V4cGFuZC5vbkRpZFJlcXVlc3RFeHBhbmQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3VzZXNDb2xsYXBzaWJsZVdyYXBwZXIpIHtcblx0XHRcdFx0dGhpcy5leHBhbmRDb2xsYXBzaWJsZVdyYXBwZXIoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoYWhwU291cmNlLm9uQ29tbWFuZEV4ZWN1dGVkKGNtZCA9PiB7XG5cdFx0XHQvLyBTZXQgdGVybWluYWxDb21tYW5kSWQgb24gdG9vbCBpbnZvY2F0aW9uIGRhdGEgZm9yIGZ1dHVyZSBsb29rdXBzXG5cdFx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRJZCAmJiBjbWQuaWQpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsQ29tbWFuZElkID0gY21kLmlkO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModGVybWluYWxJbnN0YW5jZSwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fdG9nZ2xlT3V0cHV0KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChhaHBTb3VyY2Uub25Db21tYW5kRmluaXNoZWQoY21kID0+IHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxDb21tYW5kSWQgPT09IGNtZC5pZCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyQ29udGV4dEtleXModGVybWluYWxJbnN0YW5jZSwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkQ29tbWFuZCA9IHRoaXMuX2dldFJlc29sdmVkQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdFx0dGhpcy5faGFuZGxlQ29tbWFuZENvbXBsZXRpb24ocmVzb2x2ZWRDb21tYW5kKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb21tYW5kRGV0ZWN0aW9uTGlzdGVuZXIudmFsdWUgPSBzdG9yZTtcblxuXHRcdC8vIENoZWNrIGlmIHRoZSBjb21tYW5kIHdhcyBhbHJlYWR5IHJlc29sdmVkIChlLmcuIGR1cmluZyBjb250ZW50IHJlcGxheSlcblx0XHRjb25zdCByZXNvbHZlZENvbW1hbmQgPSB0aGlzLl9yZXNvbHZlQ29tbWFuZCh0ZXJtaW5hbEluc3RhbmNlKTtcblx0XHRpZiAocmVzb2x2ZWRDb21tYW5kPy5lbmRNYXJrZXIpIHtcblx0XHRcdHRoaXMuX2hhbmRsZUNvbW1hbmRDb21wbGV0aW9uKHJlc29sdmVkQ29tbWFuZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgdGhlIGNvbXBsZXRpb24gb2YgYSB0ZXJtaW5hbCBjb21tYW5kIGJ5IHVwZGF0aW5nIHRoZSBVSSBzdGF0ZS5cblx0ICogVGhpcyBpbmNsdWRlcyBtYXJraW5nIHRoZSBjb2xsYXBzaWJsZSB3cmFwcGVyIGFzIGNvbXBsZXRlLCBhdXRvLWNvbGxhcHNpbmdcblx0ICogc3VjY2Vzc2Z1bCBjb21tYW5kcywgYW5kIGtlZXBpbmcgZmFpbGVkIGNvbW1hbmRzIGV4cGFuZGVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gcmVzb2x2ZWRDb21tYW5kIFRoZSBjb21wbGV0ZWQgdGVybWluYWwgY29tbWFuZCB3aXRoIGV4aXQgY29kZSBpbmZvcm1hdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUNvbW1hbmRDb21wbGV0aW9uKHJlc29sdmVkQ29tbWFuZDogSVRlcm1pbmFsQ29tbWFuZCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIFVwZGF0ZSB0aXRsZSB0byBzaG93IGNvbXBsZXRpb24gc3RhdGVcblx0XHR0aGlzLm1hcmtDb2xsYXBzaWJsZVdyYXBwZXJDb21wbGV0ZSgpO1xuXG5cdFx0Ly8gQXV0by1jb2xsYXBzZSBvbiBzdWNjZXNzIChleGl0IGNvZGUgMClcblx0XHRpZiAocmVzb2x2ZWRDb21tYW5kPy5leGl0Q29kZSA9PT0gMCAmJiB0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQgJiYgIXRoaXMuX3VzZXJUb2dnbGVkT3V0cHV0ICYmICF0aGlzLl9mb3JjZUV4cGFuZFRlcm1pbmFsT3V0cHV0KSB7XG5cdFx0XHR0aGlzLl90b2dnbGVPdXRwdXQoZmFsc2UpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgb3V0ZXIgd3JhcHBlciBleHBhbmRlZCBvbiBlcnJvciBmb3IgdmlzaWJpbGl0eVxuXHRcdGNvbnN0IGF1dG9FeHBhbmRGYWlsdXJlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkF1dG9FeHBhbmRUb29sRmFpbHVyZXMpO1xuXHRcdGlmIChhdXRvRXhwYW5kRmFpbHVyZXMgJiYgcmVzb2x2ZWRDb21tYW5kPy5leGl0Q29kZSAhPT0gdW5kZWZpbmVkICYmIHJlc29sdmVkQ29tbWFuZC5leGl0Q29kZSAhPT0gMCAmJiB0aGlzLl90aGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlcikge1xuXHRcdFx0dGhpcy5leHBhbmRDb2xsYXBzaWJsZVdyYXBwZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90b2dnbGVPdXRwdXQoZXhwYW5kZWQ6IGJvb2xlYW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSBhd2FpdCB0aGlzLl9vdXRwdXRWaWV3LnRvZ2dsZShleHBhbmRlZCk7XG5cdFx0Y29uc3QgaXNFeHBhbmRlZCA9IHRoaXMuX291dHB1dFZpZXcuaXNFeHBhbmRlZDtcblx0XHQvLyBPbmx5IGRyb3AgdGhlIHRpdGxlJ3MgYm90dG9tIGJvcmRlci9yYWRpdXMgd2hlbiB0aGUgb3V0cHV0IHNlY3Rpb24gaXNcblx0XHQvLyBhY3R1YWxseSByZW5kZXJlZCBiZWxvdyB0aGUgdGl0bGUgdG8gdmlzdWFsbHkgY2xvc2UgdGhlIGJveC4gRGlzcGxheS1vbmx5XG5cdFx0Ly8gaW52b2NhdGlvbnMgKGUuZy4gYSBkZW5pZWQgY29tbWFuZCB3aXRoIG5vIHRlcm1pbmFsIHNlc3Npb24gb3Igb3V0cHV0KSBuZXZlclxuXHRcdC8vIGFwcGVuZCB0aGUgb3V0cHV0IHNlY3Rpb24gKHNlZSBjb25zdHJ1Y3RvciksIHNvIHJlbW92aW5nIHRoZSB0aXRsZSdzIGJvdHRvbVxuXHRcdC8vIGJvcmRlciBoZXJlIHdvdWxkIGxlYXZlIGFuIG9wZW4tYm90dG9tZWQgYm94LlxuXHRcdGNvbnN0IGhhc091dHB1dFNlY3Rpb24gPSAhIXRoaXMuX291dHB1dFZpZXcuZG9tTm9kZS5wYXJlbnRFbGVtZW50O1xuXHRcdHRoaXMuX3RpdGxlRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXRlcm1pbmFsLWNvbnRlbnQtdGl0bGUtbm8tYm90dG9tLXJhZGl1cycsIGlzRXhwYW5kZWQgJiYgaGFzT3V0cHV0U2VjdGlvbik7XG5cdFx0dGhpcy5fdG9vbGJhck91dHB1dEV4cGFuZGVkID0gaXNFeHBhbmRlZDtcblx0XHR0aGlzLl91cGRhdGVUb29sYmFyQWN0aW9ucygpO1xuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdGV4cGFuZGVkU3RhdGVCeUludm9jYXRpb24uc2V0KHRoaXMudG9vbEludm9jYXRpb24sIGlzRXhwYW5kZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlkQ2hhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlVGVybWluYWxJbnN0YW5jZSgpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRGF0YS5pc1B0eSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbEluc3RhbmNlPy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgJiYgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0VGVybWluYWxJbnN0YW5jZUJ5VG9vbFNlc3Npb25JZCh0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEluc3RhbmNlPy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNoT3V0cHV0U291cmNlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0T3V0cHV0U291cmNlKHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdGlmICghc291cmNlIHx8IHNvdXJjZSA9PT0gdGhpcy5fb3V0cHV0U291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX291dHB1dFNvdXJjZSA9IHNvdXJjZTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBvbkNvbW1hbmRFeGVjdXRlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZCA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBhdXRvRXhwYW5kID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbFRvb2xBdXRvRXhwYW5kKHtcblx0XHRcdG9uQ29tbWFuZEV4ZWN1dGVkOiBvbkNvbW1hbmRFeGVjdXRlZC5ldmVudCxcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBvbkNvbW1hbmRGaW5pc2hlZC5ldmVudCxcblx0XHRcdG9uV2lsbERhdGE6IHNvdXJjZS5vbkRpZENoYW5nZSxcblx0XHRcdHNob3VsZEF1dG9FeHBhbmQ6ICgpID0+IHRoaXMuX3Nob3VsZEF1dG9FeHBhbmQoKSxcblx0XHRcdGhhc1JlYWxPdXRwdXQ6ICgpID0+ICEhc291cmNlLm91dHB1dCxcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9FeHBhbmQub25EaWRSZXF1ZXN0RXhwYW5kKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl91c2VzQ29sbGFwc2libGVXcmFwcGVyKSB7XG5cdFx0XHRcdHRoaXMuZXhwYW5kQ29sbGFwc2libGVXcmFwcGVyKCk7XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNvdXJjZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uLnVwZGF0ZSgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHVuZGVmaW5lZCwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHR2b2lkIHRoaXMuX291dHB1dFZpZXcucmVmcmVzaCgpO1xuXHRcdFx0aWYgKHNvdXJjZS5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkLmZpcmUoKTtcblx0XHRcdFx0dGhpcy5tYXJrQ29sbGFwc2libGVXcmFwcGVyQ29tcGxldGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fb3V0cHV0U291cmNlTGlzdGVuZXIudmFsdWUgPSBzdG9yZTtcblx0XHRvbkNvbW1hbmRFeGVjdXRlZC5maXJlKCk7XG5cdFx0aWYgKHNvdXJjZS5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZC5maXJlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RlY29yYXRpb24udXBkYXRlKCk7XG5cdFx0dGhpcy5fdXBkYXRlVG9vbGJhckNvbnRleHRLZXlzKHVuZGVmaW5lZCwgdGhpcy5fdGVybWluYWxEYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0dm9pZCB0aGlzLl9vdXRwdXRWaWV3LnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU91dHB1dEZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rlcm1pbmFsT3V0cHV0Q29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5zZXRGb2N1c2VkUHJvZ3Jlc3NQYXJ0KHRoaXMpO1xuXHRcdHRoaXMuX291dHB1dFZpZXcudXBkYXRlQXJpYUxhYmVsKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVPdXRwdXRCbHVyKGV2ZW50OiBGb2N1c0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbmV4dFRhcmdldCA9IGV2ZW50LnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdGlmICh0aGlzLl9vdXRwdXRWaWV3LmNvbnRhaW5zRWxlbWVudChuZXh0VGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbE91dHB1dENvbnRleHRLZXkucmVzZXQoKTtcblx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmNsZWFyRm9jdXNlZFByb2dyZXNzUGFydCh0aGlzKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZURpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdGVybWluYWxPdXRwdXRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0dGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5jbGVhckZvY3VzZWRQcm9ncmVzc1BhcnQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29tbWFuZEFuZE91dHB1dEFzVGV4dCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vdXRwdXRWaWV3LmdldENvbW1hbmRBbmRPdXRwdXRBc1RleHQoKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c091dHB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vdXRwdXRWaWV3LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c0NoYXRJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZSh0aGlzLl9zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHdpZGdldD8uZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZvY3VzVGVybWluYWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsRGF0YS5pc1B0eSA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLl9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKCk7XG5cblx0XHR0eXBlIEZvY3VzQ2hhdEluc3RhbmNlVGVsZW1ldHJ5RXZlbnQgPSB7XG5cdFx0XHR0YXJnZXQ6ICdpbnN0YW5jZScgfCAnY29tbWFuZFVyaScgfCAnbm9uZSc7XG5cdFx0XHRsb2NhdGlvbjogJ3BhbmVsJyB8ICdlZGl0b3InO1xuXHRcdH07XG5cblx0XHR0eXBlIEZvY3VzQ2hhdEluc3RhbmNlVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ21lZ2Fucm9nZ2UnO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrIHVzYWdlIG9mIHRoZSBmb2N1cyBjaGF0IHRlcm1pbmFsIGFjdGlvbi4nO1xuXHRcdFx0dGFyZ2V0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBmb2N1c2luZyB0YXJnZXRlZCBhbiBleGlzdGluZyBpbnN0YW5jZSBvciBvcGVuZWQgYSBjb21tYW5kIFVSSS4nIH07XG5cdFx0XHRsb2NhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0xvY2F0aW9uIG9mIHRoZSB0ZXJtaW5hbCBpbnN0YW5jZSB3aGVuIGZvY3VzaW5nLicgfTtcblx0XHR9O1xuXG5cdFx0bGV0IHRhcmdldDogRm9jdXNDaGF0SW5zdGFuY2VUZWxlbWV0cnlFdmVudFsndGFyZ2V0J10gPSAnbm9uZSc7XG5cdFx0bGV0IGxvY2F0aW9uOiBGb2N1c0NoYXRJbnN0YW5jZVRlbGVtZXRyeUV2ZW50Wydsb2NhdGlvbiddID0gJ3BhbmVsJztcblx0XHRpZiAoaW5zdGFuY2UpIHtcblx0XHRcdHRhcmdldCA9ICdpbnN0YW5jZSc7XG5cdFx0XHRsb2NhdGlvbiA9IGluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgPyAnZWRpdG9yJyA6ICdwYW5lbCc7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl90ZXJtaW5hbENvbW1hbmRVcmkpIHtcblx0XHRcdHRhcmdldCA9ICdjb21tYW5kVXJpJztcblx0XHR9XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEZvY3VzQ2hhdEluc3RhbmNlVGVsZW1ldHJ5RXZlbnQsIEZvY3VzQ2hhdEluc3RhbmNlVGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC9jaGF0Rm9jdXNJbnN0YW5jZScsIHsgdGFyZ2V0LCBsb2NhdGlvbiB9KTtcblxuXHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGlmIChpbnN0YW5jZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGluc3RhbmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSh0cnVlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSB0aGlzLl9nZXRSZXNvbHZlZENvbW1hbmQoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0aW5zdGFuY2UueHRlcm0/Lm1hcmtUcmFja2VyLnJldmVhbENvbW1hbmQoY29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsQ29tbWFuZFVyaSkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLm9wZW5SZXNvdXJjZSh0aGlzLl90ZXJtaW5hbENvbW1hbmRVcmkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjb250aW51ZUluQmFja2dyb3VuZCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl90ZXJtaW5hbERhdGEudGVybWluYWxUb29sU2Vzc2lvbklkO1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuY29udGludWVJbkJhY2tncm91bmQoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9nZ2xlT3V0cHV0RnJvbUFjdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl91c2VyVG9nZ2xlZE91dHB1dCA9IHRydWU7XG5cblx0XHR0eXBlIFRvZ2dsZUNoYXRUZXJtaW5hbE91dHB1dFRlbGVtZXRyeUV2ZW50ID0ge1xuXHRcdFx0cHJldmlvdXNFeHBhbmRlZDogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHR5cGUgVG9nZ2xlQ2hhdFRlcm1pbmFsT3V0cHV0VGVsZW1ldHJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ21lZ2Fucm9nZ2UnO1xuXHRcdFx0Y29tbWVudDogJ1RyYWNrIHVzYWdlIG9mIHRoZSB0b2dnbGUgY2hhdCB0ZXJtaW5hbCBvdXRwdXQgYWN0aW9uLic7XG5cdFx0XHRwcmV2aW91c0V4cGFuZGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdGVybWluYWwgb3V0cHV0IHdhcyBleHBhbmRlZCBiZWZvcmUgdGhlIHRvZ2dsZS4nIH07XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VG9nZ2xlQ2hhdFRlcm1pbmFsT3V0cHV0VGVsZW1ldHJ5RXZlbnQsIFRvZ2dsZUNoYXRUZXJtaW5hbE91dHB1dFRlbGVtZXRyeUNsYXNzaWZpY2F0aW9uPigndGVybWluYWwvY2hhdFRvZ2dsZU91dHB1dCcsIHtcblx0XHRcdHByZXZpb3VzRXhwYW5kZWQ6IHRoaXMuX291dHB1dFZpZXcuaXNFeHBhbmRlZFxuXHRcdH0pO1xuXG5cdFx0aWYgKCF0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3RvZ2dsZU91dHB1dCh0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fdG9nZ2xlT3V0cHV0KGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0b2dnbGVPdXRwdXRGcm9tS2V5Ym9hcmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fdXNlclRvZ2dsZWRPdXRwdXQgPSB0cnVlO1xuXHRcdGlmICghdGhpcy5fb3V0cHV0Vmlldy5pc0V4cGFuZGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90b2dnbGVPdXRwdXQodHJ1ZSk7XG5cdFx0XHR0aGlzLmZvY3VzT3V0cHV0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2NvbGxhcHNlT3V0cHV0QW5kRm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGFwc2VPdXRwdXRBbmRGb2N1c0lucHV0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9vdXRwdXRWaWV3LmlzRXhwYW5kZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3RvZ2dsZU91dHB1dChmYWxzZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2ZvY3VzQ2hhdElucHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ29tbWFuZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaW5zdGFuY2UuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRJZCA9IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbENvbW1hbmRJZDtcblxuXHRcdC8vIFRyeSBsb2NhbCBzaGVsbCBpbnRlZ3JhdGlvbiBjb21tYW5kIGRldGVjdGlvbiBmaXJzdFxuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRpZiAoY29tbWFuZERldGVjdGlvbiAmJiB0YXJnZXRJZCkge1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBjb21tYW5kRGV0ZWN0aW9uLmNvbW1hbmRzO1xuXHRcdFx0aWYgKGNvbW1hbmRzICYmIGNvbW1hbmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZnJvbUhpc3RvcnkgPSBjb21tYW5kcy5maW5kKGMgPT4gYy5pZCA9PT0gdGFyZ2V0SWQpO1xuXHRcdFx0XHRpZiAoZnJvbUhpc3RvcnkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZnJvbUhpc3Rvcnk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZXhlY3V0aW5nID0gY29tbWFuZERldGVjdGlvbi5leGVjdXRpbmdDb21tYW5kT2JqZWN0O1xuXHRcdFx0aWYgKGV4ZWN1dGluZyAmJiBleGVjdXRpbmcuaWQgPT09IHRhcmdldElkKSB7XG5cdFx0XHRcdHJldHVybiBleGVjdXRpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIEFIUCBjb21tYW5kIHNvdXJjZVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Rlcm1pbmFsRGF0YS50ZXJtaW5hbFRvb2xTZXNzaW9uSWQ7XG5cdFx0aWYgKHNlc3Npb25JZCkge1xuXHRcdFx0Y29uc3QgYWhwU291cmNlID0gdGhpcy5fdGVybWluYWxDaGF0U2VydmljZS5nZXRBaHBDb21tYW5kU291cmNlKHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoYWhwU291cmNlKSB7XG5cdFx0XHRcdGlmICh0YXJnZXRJZCkge1xuXHRcdFx0XHRcdHJldHVybiBhaHBTb3VyY2UuZ2V0Q29tbWFuZEJ5SWQodGFyZ2V0SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5vIHNwZWNpZmljIGNvbW1hbmQgSUQgXHUyMDE0IHJldHVybiBleGVjdXRpbmcgb3IgbW9zdCByZWNlbnRcblx0XHRcdFx0cmV0dXJuIGFocFNvdXJjZS5leGVjdXRpbmdDb21tYW5kT2JqZWN0ID8/IGFocFNvdXJjZS5jb21tYW5kc1thaHBTb3VyY2UuY29tbWFuZHMubGVuZ3RoIC0gMV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIEEgY29tcG9uZW50IHRoYXQgZGlzcGxheXMgdGVybWluYWwgY29tbWFuZCBvdXRwdXQgaW4gYW4gZXhwYW5kYWJsZS9jb2xsYXBzaWJsZSBzZWN0aW9uLlxuICpcbiAqIFRoaXMgY29tcG9uZW50IHN1cHBvcnRzIHR3byBtb2RlcyBvZiBkaXNwbGF5aW5nIG91dHB1dDpcbiAqIC0gKipMaXZlIG91dHB1dCoqOiBNaXJyb3JzIHRoZSBvdXRwdXQgZnJvbSBhIHJ1bm5pbmcgdGVybWluYWwgaW5zdGFuY2UgaW4gcmVhbC10aW1lLFxuICogICBzdXBwb3J0aW5nIHN0cmVhbWluZyB1cGRhdGVzLCBzY3JvbGwtbG9jayBiZWhhdmlvciwgYW5kIHVzZXIgaW5wdXQgZm9yd2FyZGluZy5cbiAqIC0gKipTbmFwc2hvdCBvdXRwdXQqKjogRGlzcGxheXMgYSBzdGF0aWMgc25hcHNob3Qgb2YgcHJldmlvdXNseSBjYXB0dXJlZCB0ZXJtaW5hbCBvdXRwdXQsXG4gKiAgIHVzZWZ1bCBmb3Igc2VyaWFsaXplZC9yZXN0b3JlZCBjaGF0IHNlc3Npb25zLlxuICpcbiAqIEZlYXR1cmVzOlxuICogLSBBdXRvbWF0aWMgaGVpZ2h0IGNhbGN1bGF0aW9uIGJhc2VkIG9uIGxpbmUgY291bnQgKG1pbi9tYXggcm93IGxpbWl0cylcbiAqIC0gU2Nyb2xsLWxvY2sgYmVoYXZpb3I6IHN0YXlzIGF0IGJvdHRvbSBkdXJpbmcgc3RyZWFtaW5nLCByZXNwZWN0cyB1c2VyIHNjcm9sbCBwb3NpdGlvblxuICogLSBBY2Nlc3NpYmlsaXR5OiBwcm9wZXIgQVJJQSBsYWJlbHMgYW5kIGFjY2Vzc2libGUgdmlldyBzdXBwb3J0XG4gKiAtIFRoZW1lLWF3YXJlIGJhY2tncm91bmQgY29sb3IgdGhhdCBhZGFwdHMgdG8gcGFuZWwgdnMgZWRpdG9yIGNvbnRleHRcbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRUZXJtaW5hbFRvb2xPdXRwdXRTZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgZ2V0IGlzRXhwYW5kZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vdXRwdXRCb2R5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc2Nyb2xsYWJsZUNvbnRhaW5lcjogRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzQXRCb3R0b206IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF9pc1Byb2dyYW1tYXRpY1Njcm9sbDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9taXJyb3I6IERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zbmFwc2hvdE1pcnJvcjogRGV0YWNoZWRUZXJtaW5hbFNuYXBzaG90TWlycm9yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbXB0eUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9sYXN0UmVuZGVyZWRMaW5lQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkRm9jdXMoKSB7IHJldHVybiB0aGlzLl9vbkRpZEZvY3VzRW1pdHRlci5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXJFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Rm9jdXNFdmVudD4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRCbHVyKCkgeyByZXR1cm4gdGhpcy5fb25EaWRCbHVyRW1pdHRlci5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Vuc3VyZVRlcm1pbmFsSW5zdGFuY2U6ICgpID0+IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVDb21tYW5kOiAoKSA9PiBJVGVybWluYWxDb21tYW5kIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldE91dHB1dFNvdXJjZTogKCkgPT4gSUNoYXRUZXJtaW5hbE91dHB1dFNvdXJjZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRUZXJtaW5hbENvbW1hbmRPdXRwdXQ6ICgpID0+IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsQ29tbWFuZE91dHB1dCddIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENvbW1hbmRUZXh0OiAoKSA9PiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U3RvcmVkVGhlbWU6ICgpID0+IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGFbJ3Rlcm1pbmFsVGhlbWUnXSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pc0ludm9jYXRpb25SdW5uaW5nOiAoKSA9PiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhc1Rlcm1pbmFsU2Vzc2lvbjogYm9vbGVhbixcblx0XHRASUFjY2Vzc2libGVWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmxlVmlld1NlcnZpY2U6IElBY2Nlc3NpYmxlVmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb250YWluZXJFbGVtZW50cyA9IGgoJy5jaGF0LXRlcm1pbmFsLW91dHB1dC1jb250YWluZXJAY29udGFpbmVyJywgW1xuXHRcdFx0aCgnLmNoYXQtdGVybWluYWwtb3V0cHV0LWJvZHlAYm9keScsIFtcblx0XHRcdFx0aCgnLmNoYXQtdGVybWluYWwtb3V0cHV0LWNvbnRlbnRAY29udGVudCcsIFtcblx0XHRcdFx0XHRoKCcuY2hhdC10ZXJtaW5hbC1vdXRwdXQtdGVybWluYWxAdGVybWluYWwnKSxcblx0XHRcdFx0XHRoKCcuY2hhdC10ZXJtaW5hbC1vdXRwdXQtZW1wdHlAZW1wdHknKVxuXHRcdFx0XHRdKVxuXHRcdFx0XSlcblx0XHRdKTtcblx0XHR0aGlzLmRvbU5vZGUgPSBjb250YWluZXJFbGVtZW50cy5jb250YWluZXI7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NvbGxhcHNlZCcpO1xuXHRcdHRoaXMuX291dHB1dEJvZHkgPSBjb250YWluZXJFbGVtZW50cy5ib2R5O1xuXHRcdHRoaXMuX2NvbnRlbnRDb250YWluZXIgPSBjb250YWluZXJFbGVtZW50cy5jb250ZW50O1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyID0gY29udGFpbmVyRWxlbWVudHMudGVybWluYWw7XG5cblx0XHR0aGlzLl9lbXB0eUVsZW1lbnQgPSBjb250YWluZXJFbGVtZW50cy5lbXB0eTtcblx0XHR0aGlzLl9jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2VtcHR5RWxlbWVudCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5GT0NVU19JTiwgKCkgPT4gdGhpcy5fb25EaWRGb2N1c0VtaXR0ZXIuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVNfT1VULCBldmVudCA9PiB0aGlzLl9vbkRpZEJsdXJFbWl0dGVyLmZpcmUoZXZlbnQpKSk7XG5cblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0LmhhbmRsZVJlc2l6ZScsICgpID0+IHRoaXMuX2hhbmRsZVJlc2l6ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmRvbU5vZGUpKTtcblxuXHRcdHRoaXMuX2FwcGx5QmFja2dyb3VuZENvbG9yKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLl9hcHBseUJhY2tncm91bmRDb2xvcigpKSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdG9nZ2xlKGV4cGFuZGVkOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY3VycmVudGx5RXhwYW5kZWQgPSB0aGlzLmlzRXhwYW5kZWQ7XG5cdFx0aWYgKGV4cGFuZGVkID09PSBjdXJyZW50bHlFeHBhbmRlZCkge1xuXHRcdFx0aWYgKGV4cGFuZGVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVRlcm1pbmFsQ29udGVudCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghZXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX3NldEV4cGFuZGVkKGZhbHNlKTtcblx0XHRcdHRoaXMuX2lzQXRCb3R0b20gPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVTY3JvbGxhYmxlQ29udGFpbmVyKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVRlcm1pbmFsQ29udGVudCgpO1xuXG5cdFx0Ly8gT25seSBub3cgc2hvdyB0aGUgZXhwYW5kZWQgc3RhdGUgKGFmdGVyIGNvbnRlbnQgaXMgcmVhZHkpXG5cdFx0dGhpcy5fc2V0RXhwYW5kZWQodHJ1ZSk7XG5cdFx0YXdhaXQgdGhpcy5fbGF5b3V0TWlycm9yV2lkdGgoKTtcblx0XHR0aGlzLl9sYXlvdXRPdXRwdXQoKTtcblx0XHR0aGlzLl9zY3JvbGxPdXRwdXRUb0JvdHRvbSgpO1xuXHRcdHRoaXMuX3NjaGVkdWxlT3V0cHV0UmVsYXlvdXQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzRXhwYW5kZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVRlcm1pbmFsQ29udGVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyPy5nZXREb21Ob2RlKCkuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBjb250YWluc0VsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhZWxlbWVudCAmJiB0aGlzLmRvbU5vZGUuY29udGFpbnMoZWxlbWVudCk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQXJpYUxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fcmVzb2x2ZUNvbW1hbmQoKTtcblx0XHRjb25zdCBjb21tYW5kVGV4dCA9IGNvbW1hbmQ/LmNvbW1hbmQgPz8gdGhpcy5fZ2V0Q29tbWFuZFRleHQoKTtcblx0XHRpZiAoIWNvbW1hbmRUZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IGxvY2FsaXplKCdjaGF0VGVybWluYWxPdXRwdXRBcmlhTGFiZWwnLCAnVGVybWluYWwgb3V0cHV0IGZvciB7MH0nLCBjb21tYW5kVGV4dCk7XG5cdFx0Y29uc3Qgc2Nyb2xsYWJsZURvbU5vZGUgPSB0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlRG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncmVnaW9uJyk7XG5cdFx0Y29uc3QgYWNjZXNzaWJsZVZpZXdIaW50ID0gdGhpcy5fYWNjZXNzaWJsZVZpZXdTZXJ2aWNlLmdldE9wZW5BcmlhSGludChBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsQ2hhdE91dHB1dCk7XG5cdFx0Y29uc3QgbGFiZWwgPSBhY2Nlc3NpYmxlVmlld0hpbnRcblx0XHRcdD8gYXJpYUxhYmVsICsgJywgJyArIGFjY2Vzc2libGVWaWV3SGludFxuXHRcdFx0OiBhcmlhTGFiZWw7XG5cdFx0c2Nyb2xsYWJsZURvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHR9XG5cblx0cHVibGljIGdldENvbW1hbmRBbmRPdXRwdXRBc1RleHQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fcmVzb2x2ZUNvbW1hbmQoKTtcblx0XHRjb25zdCBjb21tYW5kVGV4dCA9IGNvbW1hbmQ/LmNvbW1hbmQgPz8gdGhpcy5fZ2V0Q29tbWFuZFRleHQoKTtcblx0XHRpZiAoIWNvbW1hbmRUZXh0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kSGVhZGVyID0gbG9jYWxpemUoJ2NoYXRUZXJtaW5hbE91dHB1dEFjY2Vzc2libGVWaWV3SGVhZGVyJywgJ0NvbW1hbmQ6IHswfScsIGNvbW1hbmRUZXh0KTtcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgcmF3T3V0cHV0ID0gY29tbWFuZC5nZXRPdXRwdXQoKTtcblx0XHRcdGlmICghcmF3T3V0cHV0IHx8IHJhd091dHB1dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBgJHtjb21tYW5kSGVhZGVyfVxcbiR7bG9jYWxpemUoJ2NoYXQudGVybWluYWxPdXRwdXRFbXB0eScsICdObyBvdXRwdXQgd2FzIHByb2R1Y2VkIGJ5IHRoZSBjb21tYW5kLicpfWA7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lcyA9IHJhd091dHB1dC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRyZXR1cm4gYCR7Y29tbWFuZEhlYWRlcn1cXG4ke2xpbmVzLmpvaW4oJ1xcbicpLnRyaW1FbmQoKX1gO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX2dldE91dHB1dFNvdXJjZSgpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gc291cmNlID8geyB0ZXh0OiBzb3VyY2Uub3V0cHV0IH0gOiB0aGlzLl9nZXRUZXJtaW5hbENvbW1hbmRPdXRwdXQoKTtcblx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHRyZXR1cm4gYCR7Y29tbWFuZEhlYWRlcn1cXG4ke2xvY2FsaXplKCdjaGF0VGVybWluYWxPdXRwdXRVbmF2YWlsYWJsZScsICdDb21tYW5kIG91dHB1dCBpcyBubyBsb25nZXIgYXZhaWxhYmxlLicpfWA7XG5cdFx0fVxuXHRcdGNvbnN0IHBsYWluID0gcmVtb3ZlQW5zaUVzY2FwZUNvZGVzKChzbmFwc2hvdC50ZXh0ID8/ICcnKSk7XG5cdFx0aWYgKCFwbGFpbi50cmltKCkubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gYCR7Y29tbWFuZEhlYWRlcn1cXG4ke2xvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0RW1wdHknLCAnTm8gb3V0cHV0IHdhcyBwcm9kdWNlZCBieSB0aGUgY29tbWFuZC4nKX1gO1xuXHRcdH1cblx0XHRsZXQgb3V0cHV0VGV4dCA9IHBsYWluLnRyaW1FbmQoKTtcblx0XHRpZiAoc25hcHNob3QudHJ1bmNhdGVkKSB7XG5cdFx0XHRvdXRwdXRUZXh0ICs9IGBcXG4ke2xvY2FsaXplKCdjaGF0VGVybWluYWxPdXRwdXRUcnVuY2F0ZWQnLCAnT3V0cHV0IHRydW5jYXRlZC4nKX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7Y29tbWFuZEhlYWRlcn1cXG4ke291dHB1dFRleHR9YDtcblx0fVxuXG5cdHByaXZhdGUgX3NldEV4cGFuZGVkKGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZXhwYW5kZWQpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCAhZXhwYW5kZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlU2Nyb2xsYWJsZUNvbnRhaW5lcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMuX291dHB1dEJvZHksIHtcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0aGFuZGxlTW91c2VXaGVlbDogdHJ1ZVxuXHRcdH0pKTtcblx0XHRjb25zdCBzY3JvbGxhYmxlRG9tTm9kZSA9IHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuZ2V0RG9tTm9kZSgpO1xuXHRcdHNjcm9sbGFibGVEb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoc2Nyb2xsYWJsZURvbU5vZGUpO1xuXHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cblx0XHQvLyBTaG93IGhvcml6b250YWwgc2Nyb2xsYmFyIG9uIGhvdmVyL2ZvY3VzLCBoaWRlIG90aGVyd2lzZSB0byBwcmV2ZW50IGZsaWNrZXJpbmcgZHVyaW5nIHN0cmVhbWluZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyPy51cGRhdGVPcHRpb25zKHsgaG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvIH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcj8udXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuIH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5GT0NVU19JTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcj8udXBkYXRlT3B0aW9ucyh7IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVNfT1VULCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyPy51cGRhdGVPcHRpb25zKHsgaG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4gfSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJhY2sgc2Nyb2xsIHN0YXRlIHRvIGVuYWJsZSBzY3JvbGwgbG9jayBiZWhhdmlvciAob25seSBmb3IgdXNlciBzY3JvbGxzKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIub25TY3JvbGwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzUHJvZ3JhbW1hdGljU2Nyb2xsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lzQXRCb3R0b20gPSB0aGlzLl9jb21wdXRlSXNBdEJvdHRvbSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVRlcm1pbmFsQ29udGVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvdXRwdXRTb3VyY2UgPSB0aGlzLl9nZXRPdXRwdXRTb3VyY2UoKTtcblx0XHRpZiAob3V0cHV0U291cmNlKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NlTGl2ZU1pcnJvcigpO1xuXHRcdFx0aWYgKG91dHB1dFNvdXJjZS5vdXRwdXQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVuZGVyU25hcHNob3RPdXRwdXQoeyB0ZXh0OiBvdXRwdXRTb3VyY2Uub3V0cHV0IH0pO1xuXHRcdFx0fSBlbHNlIGlmIChvdXRwdXRTb3VyY2UuZXhpdENvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9oaWRlRW1wdHlNZXNzYWdlKCk7XG5cdFx0XHRcdHRoaXMuX2xheW91dE91dHB1dCgwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dFbXB0eU1lc3NhZ2UobG9jYWxpemUoJ2NoYXQudGVybWluYWxPdXRwdXRFbXB0eScsICdObyBvdXRwdXQgd2FzIHByb2R1Y2VkIGJ5IHRoZSBjb21tYW5kLicpKTtcblx0XHRcdFx0dGhpcy5fbGF5b3V0T3V0cHV0KDApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaXZlVGVybWluYWxJbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVMaXZlVGVybWluYWwoKTtcblx0XHRjb25zdCBjb21tYW5kID0gbGl2ZVRlcm1pbmFsSW5zdGFuY2UgPyB0aGlzLl9yZXNvbHZlQ29tbWFuZCgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kT3V0cHV0KCk7XG5cblx0XHRpZiAobGl2ZVRlcm1pbmFsSW5zdGFuY2UgJiYgY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IHRoaXMuX3JlbmRlckxpdmVPdXRwdXQobGl2ZVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmQpO1xuXHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3Bvc2VMaXZlTWlycm9yKCk7XG5cblx0XHRpZiAoc25hcHNob3QpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlbmRlclNuYXBzaG90T3V0cHV0KHNuYXBzaG90KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2hhc1Rlcm1pbmFsU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc0ludm9jYXRpb25SdW5uaW5nKCkpIHtcblx0XHRcdHRoaXMuX2hpZGVFbXB0eU1lc3NhZ2UoKTtcblx0XHRcdHRoaXMuX2xheW91dE91dHB1dCgwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJVbmF2YWlsYWJsZU1lc3NhZ2UobGl2ZVRlcm1pbmFsSW5zdGFuY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVuZGVyTGl2ZU91dHB1dChsaXZlVGVybWluYWxJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNvbW1hbmQ6IElUZXJtaW5hbENvbW1hbmQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5fbWlycm9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0YXdhaXQgbGl2ZVRlcm1pbmFsSW5zdGFuY2UueHRlcm1SZWFkeVByb21pc2U7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgbGl2ZVRlcm1pbmFsSW5zdGFuY2UuaXNEaXNwb3NlZCB8fCAhbGl2ZVRlcm1pbmFsSW5zdGFuY2UueHRlcm0pIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VMaXZlTWlycm9yKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IG1pcnJvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERldGFjaGVkVGVybWluYWxDb21tYW5kTWlycm9yLCBsaXZlVGVybWluYWxJbnN0YW5jZS54dGVybSwgY29tbWFuZCkpO1xuXHRcdHRoaXMuX21pcnJvciA9IG1pcnJvcjtcblx0XHR0aGlzLl9yZWdpc3RlcihtaXJyb3Iub25EaWRDaGFuZ2VSb3dIZWlnaHQoKCkgPT4gdGhpcy5faGFuZGxlTWlycm9yUm93SGVpZ2h0Q2hhbmdlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtaXJyb3Iub25EaWRVcGRhdGUocmVzdWx0ID0+IHtcblx0XHRcdC8vIEhpZGUgZW1wdHkgbWVzc2FnZSBhcyBzb29uIGFzIHdlIGdldCBvdXRwdXRcblx0XHRcdGlmIChyZXN1bHQubGluZUNvdW50ICYmIHJlc3VsdC5saW5lQ291bnQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2hpZGVFbXB0eU1lc3NhZ2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xheW91dE91dHB1dChyZXN1bHQubGluZUNvdW50KTtcblx0XHRcdGlmICh0aGlzLl9pc0F0Qm90dG9tKSB7XG5cdFx0XHRcdHRoaXMuX3Njcm9sbE91dHB1dFRvQm90dG9tKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIEZvcndhcmQgaW5wdXQgZnJvbSB0aGUgbWlycm9yIHRlcm1pbmFsIHRvIHRoZSBsaXZlIHRlcm1pbmFsIGluc3RhbmNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIobWlycm9yLm9uRGlkSW5wdXQoZGF0YSA9PiB7XG5cdFx0XHRpZiAoIWxpdmVUZXJtaW5hbEluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0bGl2ZVRlcm1pbmFsSW5zdGFuY2Uuc2VuZFRleHQoZGF0YSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRhd2FpdCBtaXJyb3IuYXR0YWNoKHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyKTtcblx0XHRhd2FpdCB0aGlzLl9sYXlvdXRNaXJyb3JXaWR0aChtaXJyb3IpO1xuXHRcdGxldCByZXN1bHQgPSBhd2FpdCBtaXJyb3IucmVuZGVyQ29tbWFuZCgpO1xuXHRcdC8vIE9ubHkgc2hvdyBcIk5vIG91dHB1dFwiIG1lc3NhZ2UgaWY6XG5cdFx0Ly8gMS4gQ29tbWFuZCBoYXMgZmluaXNoZWQgKGhhcyBlbmRNYXJrZXIpLCBBTkRcblx0XHQvLyAyLiBUaGVyZSdzIG5vIG91dHB1dCBhZnRlciByZXRyeWluZ1xuXHRcdC8vIElmIGNvbW1hbmQgaXMgc3RpbGwgcnVubmluZywgZG9uJ3Qgc2hvdyB0aGUgbWVzc2FnZSAtIG91dHB1dCBtYXkgY29tZSBsYXRlclxuXHRcdGxldCBjb21tYW5kRmluaXNoZWQgPSAhIWNvbW1hbmQuZW5kTWFya2VyO1xuXHRcdGxldCBoYXNPdXRwdXQgPSByZXN1bHQgJiYgcmVzdWx0LmxpbmVDb3VudCAmJiByZXN1bHQubGluZUNvdW50ID4gMDtcblxuXHRcdC8vIElmIHdlIGdvdCBubyBvdXRwdXQsIHBvbGwgdW50aWwgZWl0aGVyIG91dHB1dCBhcHBlYXJzIG9yIGNvbW1hbmQgZmluaXNoZXNcblx0XHQvLyBUaGlzIGhhbmRsZXMgY2FzZXMgd2hlcmU6XG5cdFx0Ly8gMS4gQ29tbWFuZCBpcyBydW5uaW5nIGJ1dCBleGVjdXRlZE1hcmtlciBpc24ndCBzZXQgeWV0IChyZW5kZXJDb21tYW5kIHJldHVybnMgdW5kZWZpbmVkKVxuXHRcdC8vIDIuIENvbW1hbmQgZmluaXNoZWQgcXVpY2tseSBidXQgYnVmZmVyIGlzbid0IHJlYWR5IHlldFxuXHRcdGlmICghaGFzT3V0cHV0KSB7XG5cdFx0XHRmb3IgKGxldCByZXRyeSA9IDA7IHJldHJ5IDwgTUFYX09VVFBVVF9QT0xMX1JFVFJJRVMgJiYgIWhhc091dHB1dDsgcmV0cnkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KE9VVFBVVF9QT0xMX0RFTEFZX01TKTtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBtaXJyb3IucmVuZGVyQ29tbWFuZCgpO1xuXHRcdFx0XHRoYXNPdXRwdXQgPSByZXN1bHQgJiYgcmVzdWx0LmxpbmVDb3VudCAmJiByZXN1bHQubGluZUNvdW50ID4gMDtcblx0XHRcdFx0Y29tbWFuZEZpbmlzaGVkID0gISFjb21tYW5kLmVuZE1hcmtlcjtcblx0XHRcdFx0Ly8gU3RvcCBwb2xsaW5nIGlmIGNvbW1hbmQgZmluaXNoZWQgKHdlJ2xsIHNob3cgXCJubyBvdXRwdXRcIiBvciBvdXRwdXQpXG5cdFx0XHRcdGlmIChjb21tYW5kRmluaXNoZWQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzT3V0cHV0KSB7XG5cdFx0XHRpZiAoY29tbWFuZEZpbmlzaGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dFbXB0eU1lc3NhZ2UobG9jYWxpemUoJ2NoYXQudGVybWluYWxPdXRwdXRFbXB0eScsICdObyBvdXRwdXQgd2FzIHByb2R1Y2VkIGJ5IHRoZSBjb21tYW5kLicpKTtcblx0XHRcdH1cblx0XHRcdC8vIElmIGNvbW1hbmQgaXMgc3RpbGwgcnVubmluZywgbGVhdmUgY29udGVudCBlbXB0eSBidXQgZG9uJ3Qgc2hvdyBcIm5vIG91dHB1dFwiIG1lc3NhZ2Vcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faGlkZUVtcHR5TWVzc2FnZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9sYXlvdXRPdXRwdXQocmVzdWx0Py5saW5lQ291bnQgPz8gMCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW5kZXJTbmFwc2hvdE91dHB1dChzbmFwc2hvdDogTm9uTnVsbGFibGU8SUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVsndGVybWluYWxDb21tYW5kT3V0cHV0J10+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3NuYXBzaG90TWlycm9yKSB7XG5cdFx0XHR0aGlzLl9zbmFwc2hvdE1pcnJvci5zZXRPdXRwdXQoc25hcHNob3QpO1xuXHRcdFx0YXdhaXQgdGhpcy5fbGF5b3V0TWlycm9yV2lkdGgodGhpcy5fc25hcHNob3RNaXJyb3IpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc25hcHNob3RNaXJyb3IucmVuZGVyKCk7XG5cdFx0XHR0aGlzLl9sYXlvdXRPdXRwdXQocmVzdWx0Py5saW5lQ291bnQgPz8gc25hcHNob3QubGluZUNvdW50ID8/IHRoaXMuX2xhc3RSZW5kZXJlZExpbmVDb3VudCA/PyAwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cdFx0dGhpcy5fc25hcHNob3RNaXJyb3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZXRhY2hlZFRlcm1pbmFsU25hcHNob3RNaXJyb3IsIHNuYXBzaG90LCB0aGlzLl9nZXRTdG9yZWRUaGVtZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NuYXBzaG90TWlycm9yLm9uRGlkQ2hhbmdlUm93SGVpZ2h0KCgpID0+IHRoaXMuX2hhbmRsZU1pcnJvclJvd0hlaWdodENoYW5nZSgpKSk7XG5cdFx0YXdhaXQgdGhpcy5fc25hcHNob3RNaXJyb3IuYXR0YWNoKHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyKTtcblx0XHR0aGlzLl9zbmFwc2hvdE1pcnJvci5zZXRPdXRwdXQoc25hcHNob3QpO1xuXHRcdGF3YWl0IHRoaXMuX2xheW91dE1pcnJvcldpZHRoKHRoaXMuX3NuYXBzaG90TWlycm9yKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9zbmFwc2hvdE1pcnJvci5yZW5kZXIoKTtcblx0XHRjb25zdCBoYXNUZXh0ID0gISFzbmFwc2hvdC50ZXh0ICYmIHNuYXBzaG90LnRleHQubGVuZ3RoID4gMDtcblx0XHRpZiAoaGFzVGV4dCkge1xuXHRcdFx0dGhpcy5faGlkZUVtcHR5TWVzc2FnZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaG93RW1wdHlNZXNzYWdlKGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0RW1wdHknLCAnTm8gb3V0cHV0IHdhcyBwcm9kdWNlZCBieSB0aGUgY29tbWFuZC4nKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHJlc3VsdD8ubGluZUNvdW50ID8/IHNuYXBzaG90LmxpbmVDb3VudCA/PyAwO1xuXHRcdHRoaXMuX2xheW91dE91dHB1dChsaW5lQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyVW5hdmFpbGFibGVNZXNzYWdlKGxpdmVUZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdGVybWluYWxDb250YWluZXIpO1xuXHRcdHRoaXMuX2xhc3RSZW5kZXJlZExpbmVDb3VudCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIWxpdmVUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl9zaG93RW1wdHlNZXNzYWdlKGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0VGVybWluYWxNaXNzaW5nJywgJ1Rlcm1pbmFsIGlzIG5vIGxvbmdlciBhdmFpbGFibGUuJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaG93RW1wdHlNZXNzYWdlKGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsT3V0cHV0Q29tbWFuZE1pc3NpbmcnLCAnQ29tbWFuZCBpbmZvcm1hdGlvbiBpcyBub3QgYXZhaWxhYmxlLicpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlTGl2ZVRlcm1pbmFsKCk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVRlcm1pbmFsSW5zdGFuY2UoKTtcblx0XHRyZXR1cm4gaW5zdGFuY2UgJiYgIWluc3RhbmNlLmlzRGlzcG9zZWQgPyBpbnN0YW5jZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dFbXB0eU1lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZW1wdHlFbGVtZW50LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXRlcm1pbmFsLW91dHB1dC10ZXJtaW5hbC1uby1vdXRwdXQnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2hhdC10ZXJtaW5hbC1vdXRwdXQtY29udGFpbmVyLW5vLW91dHB1dCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZUVtcHR5TWVzc2FnZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9lbXB0eUVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXRlcm1pbmFsLW91dHB1dC10ZXJtaW5hbC1uby1vdXRwdXQnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC10ZXJtaW5hbC1vdXRwdXQtY29udGFpbmVyLW5vLW91dHB1dCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUxpdmVNaXJyb3IoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21pcnJvcikge1xuXHRcdFx0dGhpcy5fbWlycm9yLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX21pcnJvciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZU91dHB1dFJlbGF5b3V0KCk6IHZvaWQge1xuXHRcdGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGF5b3V0T3V0cHV0KCk7XG5cdFx0XHR0aGlzLl9zY3JvbGxPdXRwdXRUb0JvdHRvbSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtaXJyb3IncyBwYWludGVkIGNlbGwgbWV0cmljcyBjaGFuZ2VkOiB0aGUgZmlyc3QgcmVuZGVyIHJlcGxhY2VzIHRoZSBwcmUtcmVuZGVyXG5cdCAqIGZvbnQgZXN0aW1hdGUsIGFuZCBsYXRlciByZW5kZXJzIGNhbiByZWZsZWN0IERQUiBjaGFuZ2VzLiBSZS1ydW4gbGF5b3V0IHNvIHRoZSBib3hcblx0ICogaGVpZ2h0IGFuZCB3cmFwIHdpZHRoIG1hdGNoIHdoYXQgeHRlcm0gYWN0dWFsbHkgcGFpbnRlZC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZU1pcnJvclJvd0hlaWdodENoYW5nZSgpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuX2xheW91dE1pcnJvcldpZHRoKCk7XG5cdFx0dGhpcy5fbGF5b3V0T3V0cHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZXNpemUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzRXhwYW5kZWQpIHtcblx0XHRcdHZvaWQgdGhpcy5fbGF5b3V0TWlycm9yV2lkdGgoKTtcblx0XHRcdHRoaXMuX2xheW91dE91dHB1dCgpO1xuXHRcdFx0dGhpcy5fc2Nyb2xsT3V0cHV0VG9Cb3R0b20oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5zY2FuRG9tTm9kZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNpemVzIHRoZSBtaXJyb3IncyBjb2x1bW4gY291bnQgdG8gZmlsbCB0aGUgY3VycmVudGx5IGF2YWlsYWJsZSB3aWR0aC4gTm8tb3Agd2hpbGUgdGhlXG5cdCAqIHdpZHRoIGlzIHVubWVhc3VyYWJsZSAoZS5nLiBjb2xsYXBzZWQpOyB0aGUgbWlycm9yIGtlZXBzIGl0cyBjdXJyZW50IGNvbHMgdW50aWwgdGhlIG5leHRcblx0ICogbGF5b3V0IG9wcG9ydHVuaXR5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbGF5b3V0TWlycm9yV2lkdGgobWlycm9yOiBEZXRhY2hlZFRlcm1pbmFsQ29tbWFuZE1pcnJvciB8IERldGFjaGVkVGVybWluYWxTbmFwc2hvdE1pcnJvciB8IHVuZGVmaW5lZCA9IHRoaXMuX3NuYXBzaG90TWlycm9yID8/IHRoaXMuX21pcnJvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbWlycm9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fdGVybWluYWxDb250YWluZXIuY2xpZW50V2lkdGggfHwgdGhpcy5fb3V0cHV0Qm9keS5jbGllbnRXaWR0aCB8fCB0aGlzLmRvbU5vZGUuY2xpZW50V2lkdGggfHwgKHRoaXMuZG9tTm9kZS5wYXJlbnRFbGVtZW50Py5jbGllbnRXaWR0aCA/PyAwKTtcblx0XHRpZiAod2lkdGggPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtaXJyb3IubGF5b3V0KHdpZHRoKTtcblx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiYgcmVzdWx0Py5saW5lQ291bnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmUtd3JhcHBpbmcgY2FuIGNoYW5nZSB0aGUgbnVtYmVyIG9mIHJlbmRlcmVkIHJvd3MsIHNvIHJlZnJlc2ggdGhlIGJveCBoZWlnaHRcblx0XHRcdHRoaXMuX2xheW91dE91dHB1dChyZXN1bHQubGluZUNvdW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sYXlvdXRPdXRwdXQobGluZUNvdW50PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVDb3VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sYXN0UmVuZGVyZWRMaW5lQ291bnQgPSBsaW5lQ291bnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpbmVDb3VudCA9IHRoaXMuX2xhc3RSZW5kZXJlZExpbmVDb3VudDtcblx0XHR9XG5cblx0XHR0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLnNjYW5Eb21Ob2RlKCk7XG5cdFx0aWYgKCF0aGlzLmlzRXhwYW5kZWQgfHwgbGluZUNvdW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxhYmxlRG9tTm9kZSA9IHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuZ2V0RG9tTm9kZSgpO1xuXHRcdGNvbnN0IHJvd0hlaWdodCA9IHRoaXMuX2NvbXB1dGVSb3dIZWlnaHRQeCgpO1xuXHRcdGNvbnN0IHBhZGRpbmcgPSB0aGlzLl9nZXRPdXRwdXRQYWRkaW5nKCk7XG5cdFx0Ly8gVGhlIGNvbnRhaW5lciBjYXJyaWVzIGEgQ1NTIG1heC1oZWlnaHQgd2l0aCBvdmVyZmxvdzogaGlkZGVuOyBrZWVwIHRoZSByb3cgY2FwXG5cdFx0Ly8gdW5kZXIgaXQgc28gdGhlIENTUyBsaW1pdCBjYW4gbmV2ZXIgc2xpY2UgYSByb3cgdGhhdCB0aGUgaGVpZ2h0IG1hdGggYWxsb3dlZC5cblx0XHRsZXQgbWF4Um93cyA9IE1BWF9PVVRQVVRfUk9XUztcblx0XHRjb25zdCBjb250YWluZXJNYXhIZWlnaHQgPSBOdW1iZXIucGFyc2VGbG9hdChkb20uZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLmRvbU5vZGUpLm1heEhlaWdodCk7XG5cdFx0aWYgKCFOdW1iZXIuaXNOYU4oY29udGFpbmVyTWF4SGVpZ2h0KSkge1xuXHRcdFx0bWF4Um93cyA9IE1hdGgubWF4KE1hdGgubWluKG1heFJvd3MsIE1hdGguZmxvb3IoKGNvbnRhaW5lck1heEhlaWdodCAtIHBhZGRpbmcpIC8gcm93SGVpZ2h0KSksIE1JTl9PVVRQVVRfUk9XUyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnRSb3dzID0gTWF0aC5taW4oTWF0aC5tYXgobGluZUNvdW50LCBNSU5fT1VUUFVUX1JPV1MpLCBtYXhSb3dzKTtcblx0XHQvLyBVc2UgdGhlIGxpbmUtY291bnQtYmFzZWQgY2FsY3VsYXRpb24gZGlyZWN0bHkgcmF0aGVyIHRoYW4gY29uc3RyYWluaW5nIGJ5XG5cdFx0Ly8gX291dHB1dEJvZHkuY2xpZW50SGVpZ2h0LiBUaGUgRE9NIG1lYXN1cmVtZW50IHJhY2VzIHdpdGggeHRlcm0ncyBhc3luY1xuXHRcdC8vIHJlbmRlcmluZyBcdTIwMTQgd2hlbiBuZXcgbGluZXMgYXJyaXZlLCBjbGllbnRIZWlnaHQgcmVmbGVjdHMgdGhlIHN0YWxlXG5cdFx0Ly8gKHByZS1yZW5kZXIpIHNpemUsIGNhdXNpbmcgdGhlIHZpZXdwb3J0IHRvIGJlIHRvbyBzaG9ydCBhbmQgY2xpcHBpbmcgdGhlXG5cdFx0Ly8gbGFzdCBsaW5lLiBUaGUgaGVpZ2h0IGlzIGFuIGV4YWN0IG11bHRpcGxlIG9mIHRoZSBtaXJyb3IncyBwYWludGVkIHJvd1xuXHRcdC8vIGhlaWdodCAocGx1cyB0aGUgb3V0cHV0IHBhZGRpbmcpIHdpdGggbm8gcm91bmRpbmcgc2xhY2ssIHNvIHRoZSBib3ggYWx3YXlzXG5cdFx0Ly8gZW5kcyBvbiBhIHdob2xlIHJvdy5cblx0XHRzY3JvbGxhYmxlRG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtjb250ZW50Um93cyAqIHJvd0hlaWdodCArIHBhZGRpbmd9cHhgO1xuXHRcdHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVJc0F0Qm90dG9tKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGRpbWVuc2lvbnMgPSB0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyLmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRjb25zdCBzY3JvbGxQb3NpdGlvbiA9IHRoaXMuX3Njcm9sbGFibGVDb250YWluZXIuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHQvLyBDb25zaWRlciBcImF0IGJvdHRvbVwiIGlmIHdpdGhpbiBhIHNtYWxsIHRocmVzaG9sZCB0byBhY2NvdW50IGZvciByb3VuZGluZ1xuXHRcdGNvbnN0IHRocmVzaG9sZCA9IDU7XG5cdFx0cmV0dXJuIHNjcm9sbFBvc2l0aW9uLnNjcm9sbFRvcCA+PSBkaW1lbnNpb25zLnNjcm9sbEhlaWdodCAtIGRpbWVuc2lvbnMuaGVpZ2h0IC0gdGhyZXNob2xkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Nyb2xsT3V0cHV0VG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zY3JvbGxhYmxlQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzUHJvZ3JhbW1hdGljU2Nyb2xsID0gdHJ1ZTtcblx0XHRjb25zdCBkaW1lbnNpb25zID0gdGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5nZXRTY3JvbGxEaW1lbnNpb25zKCk7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZUNvbnRhaW5lci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogZGltZW5zaW9ucy5zY3JvbGxIZWlnaHQgfSk7XG5cdFx0dGhpcy5faXNQcm9ncmFtbWF0aWNTY3JvbGwgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE91dHB1dFBhZGRpbmcoKTogbnVtYmVyIHtcblx0XHRjb25zdCBzdHlsZSA9IGRvbS5nZXRDb21wdXRlZFN0eWxlKHRoaXMuX291dHB1dEJvZHkpO1xuXHRcdGNvbnN0IHBhZGRpbmdUb3AgPSBOdW1iZXIucGFyc2VGbG9hdChzdHlsZS5wYWRkaW5nVG9wIHx8ICcwJyk7XG5cdFx0Y29uc3QgcGFkZGluZ0JvdHRvbSA9IE51bWJlci5wYXJzZUZsb2F0KHN0eWxlLnBhZGRpbmdCb3R0b20gfHwgJzAnKTtcblx0XHRyZXR1cm4gcGFkZGluZ1RvcCArIHBhZGRpbmdCb3R0b207XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlUm93SGVpZ2h0UHgoKTogbnVtYmVyIHtcblx0XHQvLyBQcmVmZXIgdGhlIG1pcnJvcidzIG93biByb3cgaGVpZ2h0OiBvbmNlIGl0cyByZW5kZXJlciBoYXMgaW5pdGlhbGl6ZWQgdGhpcyBpcyB0aGVcblx0XHQvLyBleGFjdCBjZWxsIGhlaWdodCB4dGVybSBwYWludHMsIHNvIHRoZSBib3ggZW5kcyBvbiBhIHdob2xlIHJvdyBpbnN0ZWFkIG9mIHNsaWNpbmdcblx0XHQvLyB0aGUgbGFzdCBvbmUgdmlhIHRoZSBjb25maWctYmFzZWQgZXN0aW1hdGUgYmVsb3cuXG5cdFx0Y29uc3QgbWlycm9yUm93SGVpZ2h0ID0gKHRoaXMuX3NuYXBzaG90TWlycm9yID8/IHRoaXMuX21pcnJvcik/LmdldFJvd0hlaWdodFB4KCk7XG5cdFx0aWYgKG1pcnJvclJvd0hlaWdodCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbWlycm9yUm93SGVpZ2h0O1xuXHRcdH1cblx0XHRjb25zdCB3aW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSk7XG5cdFx0Y29uc3QgZm9udCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Rm9udCh3aW5kb3cpO1xuXHRcdGNvbnN0IGhhc0NoYXJIZWlnaHQgPSBpc051bWJlcihmb250LmNoYXJIZWlnaHQpICYmIGZvbnQuY2hhckhlaWdodCA+IDA7XG5cdFx0Y29uc3QgaGFzRm9udFNpemUgPSBpc051bWJlcihmb250LmZvbnRTaXplKSAmJiBmb250LmZvbnRTaXplID4gMDtcblx0XHRjb25zdCBoYXNMaW5lSGVpZ2h0ID0gaXNOdW1iZXIoZm9udC5saW5lSGVpZ2h0KSAmJiBmb250LmxpbmVIZWlnaHQgPiAwO1xuXHRcdGNvbnN0IGNoYXJIZWlnaHQgPSAoaGFzQ2hhckhlaWdodCA/IGZvbnQuY2hhckhlaWdodCA6IChoYXNGb250U2l6ZSA/IGZvbnQuZm9udFNpemUgOiAxKSkgPz8gMTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gaGFzTGluZUhlaWdodCA/IGZvbnQubGluZUhlaWdodCA6IDE7XG5cdFx0Y29uc3Qgcm93SGVpZ2h0ID0gTWF0aC5jZWlsKGNoYXJIZWlnaHQgKiBsaW5lSGVpZ2h0KTtcblx0XHRyZXR1cm4gTWF0aC5tYXgocm93SGVpZ2h0LCAxKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5QmFja2dyb3VuZENvbG9yKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBpc0luRWRpdG9yID0gQ2hhdENvbnRleHRLZXlzLmluQ2hhdEVkaXRvci5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IoaXNJbkVkaXRvciA/IGVkaXRvckJhY2tncm91bmQgOiBQQU5FTF9CQUNLR1JPVU5EKTtcblx0XHRpZiAoYmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZENvbG9yLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VGVybWluYWxUaGlua2luZ0NvbGxhcHNpYmxlV3JhcHBlciBleHRlbmRzIENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IHtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb250ZW50RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRUZXh0OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ludGVudGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1NhbmRib3hXcmFwcGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc0NvbXBsZXRlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1NraXBwZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2lzUnVubmluZ0luQmFja2dyb3VuZDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Gb2N1c1Rlcm1pbmFsOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dMaW5rRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfc2hvd0xpbmtFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb21tYW5kVGV4dDogc3RyaW5nLFxuXHRcdGludGVudGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGlzU2FuZGJveFdyYXBwZWQ6IGJvb2xlYW4sXG5cdFx0Y29udGVudEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdGluaXRpYWxFeHBhbmRlZDogYm9vbGVhbixcblx0XHRpc0NvbXBsZXRlOiBib29sZWFuLFxuXHRcdGlzU2tpcHBlZDogYm9vbGVhbixcblx0XHRpc1J1bm5pbmdJbkJhY2tncm91bmQ6IGJvb2xlYW4sXG5cdFx0b25Gb2N1c1Rlcm1pbmFsOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gV2hlbiB0aGUgbW9kZWwgc3VwcGxpZWQgYW4gaW50ZW50aW9uICh3aHkgaXQncyBydW5uaW5nIHRoZSBjb21tYW5kKSxcblx0XHQvLyB1c2UgaXQgYXMgdGhlIGRlc2NyaXB0aXZlIHRleHQgaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyB2ZXJiLiBTa2lwcGVkXG5cdFx0Ly8gY29tbWFuZHMga2VlcCB0aGUgZXhwbGljaXQgXCJTa2lwcGVkXCIgd29yZGluZyBzaW5jZSB0aGV5IG5ldmVyIHJhbi5cblx0XHQvLyBUaGUgaW50ZW50aW9uIGFuZCBjb21tYW5kIGFyZSBub3QgbG9jYWxpemFibGUsIHNvIHRoZXkgYXJlIGNvbWJpbmVkXG5cdFx0Ly8gZGlyZWN0bHk7IG9ubHkgdGhlIHN0YXRlIHN1ZmZpeCBpcyBleHRlcm5hbGl6ZWQuXG5cdFx0Y29uc3QgaW50ZW50aW9uVGV4dCA9IGludGVudGlvbiAmJiAhaXNTa2lwcGVkID8gaW50ZW50aW9uIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHN0YXRlVGl0bGUgPSBpc1NraXBwZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2tpcHBlZC5wbGFpbicsIFwiU2tpcHBlZCB7MH1cIiwgY29tbWFuZFRleHQpXG5cdFx0XHQ6IGlzUnVubmluZ0luQmFja2dyb3VuZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLnJ1bm5pbmdJbkJhY2tncm91bmQucGxhaW4nLCBcIlJ1bm5pbmcgezB9IGluIGJhY2tncm91bmRcIiwgY29tbWFuZFRleHQpXG5cdFx0XHRcdDogaXNDb21wbGV0ZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwucmFuLnBsYWluJywgXCJSYW4gezB9XCIsIGNvbW1hbmRUZXh0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGVybWluYWwucnVubmluZy5wbGFpbicsIFwiUnVubmluZyB7MH1cIiwgY29tbWFuZFRleHQpO1xuXHRcdGNvbnN0IHRpdGxlID0gaW50ZW50aW9uVGV4dFxuXHRcdFx0PyBpc1J1bm5pbmdJbkJhY2tncm91bmRcblx0XHRcdFx0PyBgJHtpbnRlbnRpb25UZXh0fSAke2NvbW1hbmRUZXh0fSR7bG9jYWxpemUoJ2NoYXQudGVybWluYWwuYmFja2dyb3VuZFN1ZmZpeCcsIFwiIGluIGJhY2tncm91bmRcIil9YFxuXHRcdFx0XHQ6IGAke2ludGVudGlvblRleHR9ICR7Y29tbWFuZFRleHR9YFxuXHRcdFx0OiBzdGF0ZVRpdGxlO1xuXHRcdHN1cGVyKHRpdGxlLCBjb250ZXh0LCB1bmRlZmluZWQsIGhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fdGVybWluYWxDb250ZW50RWxlbWVudCA9IGNvbnRlbnRFbGVtZW50O1xuXHRcdHRoaXMuX2NvbW1hbmRUZXh0ID0gY29tbWFuZFRleHQ7XG5cdFx0dGhpcy5faW50ZW50aW9uID0gaW50ZW50aW9uVGV4dDtcblx0XHR0aGlzLl9pc1NhbmRib3hXcmFwcGVkID0gaXNTYW5kYm94V3JhcHBlZDtcblx0XHR0aGlzLl9pc0NvbXBsZXRlID0gaXNDb21wbGV0ZTtcblx0XHR0aGlzLl9pc1NraXBwZWQgPSBpc1NraXBwZWQ7XG5cdFx0dGhpcy5faXNSdW5uaW5nSW5CYWNrZ3JvdW5kID0gaXNSdW5uaW5nSW5CYWNrZ3JvdW5kO1xuXHRcdHRoaXMuX29uRm9jdXNUZXJtaW5hbCA9IG9uRm9jdXNUZXJtaW5hbDtcblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdjaGF0LXRlcm1pbmFsLXRoaW5raW5nLWNvbGxhcHNpYmxlJyk7XG5cblx0XHRpZiAoaXNDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy5pY29uID0gQ29kaWNvbi5jaGVjaztcblx0XHR9XG5cblx0XHR0aGlzLl9zZXRDb2RlRm9ybWF0dGVkVGl0bGUoKTtcblx0XHR0aGlzLl91cGRhdGVTaG93TGluaygpO1xuXHRcdHRoaXMuc2V0RXhwYW5kZWQoaW5pdGlhbEV4cGFuZGVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzaG91bGRBbmltYXRlQ29udGVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldENvZGVGb3JtYXR0ZWRUaXRsZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbGxhcHNlQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWxFbGVtZW50O1xuXHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0Y29uc3Qgc3VmZml4VGV4dCA9IHRoaXMuX2lzU2FuZGJveFdyYXBwZWRcblx0XHRcdD8gdGhpcy5faXNSdW5uaW5nSW5CYWNrZ3JvdW5kXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2FuZGJveC5iYWNrZ3JvdW5kU3VmZml4JywgXCIgaW4gc2FuZGJveCAoYmFja2dyb3VuZClcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5zYW5kYm94LnN1ZmZpeCcsIFwiIGluIHNhbmRib3hcIilcblx0XHRcdDogdGhpcy5faXNSdW5uaW5nSW5CYWNrZ3JvdW5kXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuYmFja2dyb3VuZFN1ZmZpeCcsIFwiIGluIGJhY2tncm91bmRcIilcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHQvLyBJbnRlbnRpb24gbGF5b3V0OiB0aGUgaW50ZW50aW9uIGFuZCB0aGUgY29tbWFuZCBzaGFyZSB0aGUgcm93IGFzIHR3b1xuXHRcdC8vIGZsZXggY2VsbHMgdGhhdCBzdGF5IG9uIG9uZSBsaW5lIGFuZCBlYWNoIGVsbGlwc2lzLXRydW5jYXRlLCBzcGxpdHRpbmdcblx0XHQvLyB0aGUgYXZhaWxhYmxlIHdpZHRoIGVxdWFsbHkgd2hlbiB0aGUgY29udGVudCBvdmVyZmxvd3MuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdGVybWluYWwtaGFzLWludGVudGlvbicsICEhdGhpcy5faW50ZW50aW9uKTtcblx0XHRpZiAodGhpcy5faW50ZW50aW9uKSB7XG5cdFx0XHRjb25zdCByb3cgPSBkb20uJCgnc3Bhbi5jaGF0LXRlcm1pbmFsLWxhYmVsLWZsZXgnKTtcblx0XHRcdGNvbnN0IGludGVudGlvbkVsZW1lbnQgPSBkb20uJCgnc3Bhbi5jaGF0LXRlcm1pbmFsLWludGVudGlvbicpO1xuXHRcdFx0aW50ZW50aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX2ludGVudGlvbjtcblx0XHRcdGNvbnN0IGNvbW1hbmRFbGVtZW50ID0gZG9tLiQoJ3NwYW4uY2hhdC10ZXJtaW5hbC1jb21tYW5kJyk7XG5cdFx0XHRjb25zdCBjb2RlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcblx0XHRcdGNvZGVFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fY29tbWFuZFRleHQ7XG5cdFx0XHRjb21tYW5kRWxlbWVudC5hcHBlbmRDaGlsZChjb2RlRWxlbWVudCk7XG5cdFx0XHRyb3cuYXBwZW5kQ2hpbGQoaW50ZW50aW9uRWxlbWVudCk7XG5cdFx0XHRyb3cuYXBwZW5kQ2hpbGQoY29tbWFuZEVsZW1lbnQpO1xuXHRcdFx0aWYgKHN1ZmZpeFRleHQpIHtcblx0XHRcdFx0Y29uc3Qgc3VmZml4RWxlbWVudCA9IGRvbS4kKCdzcGFuLmNoYXQtdGVybWluYWwtbGFiZWwtc3VmZml4Jyk7XG5cdFx0XHRcdHN1ZmZpeEVsZW1lbnQudGV4dENvbnRlbnQgPSBzdWZmaXhUZXh0O1xuXHRcdFx0XHRyb3cuYXBwZW5kQ2hpbGQoc3VmZml4RWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQocm93KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVmaXhUZXh0ID0gdGhpcy5faXNTYW5kYm94V3JhcHBlZFxuXHRcdFx0PyB0aGlzLl9pc1NraXBwZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5za2lwcGVkSW5TYW5kYm94LnByZWZpeCcsIFwiU2tpcHBlZCBcIilcblx0XHRcdFx0OiB0aGlzLl9pc0NvbXBsZXRlXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5yYW5JblNhbmRib3gucHJlZml4JywgXCJSYW4gXCIpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5ydW5uaW5nSW5TYW5kYm94LnByZWZpeCcsIFwiUnVubmluZyBcIilcblx0XHRcdDogdGhpcy5faXNTa2lwcGVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwuc2tpcHBlZC5wcmVmaXgnLCBcIlNraXBwZWQgXCIpXG5cdFx0XHRcdDogdGhpcy5faXNDb21wbGV0ZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQudGVybWluYWwucmFuLnByZWZpeCcsIFwiUmFuIFwiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQudGVybWluYWwucnVubmluZy5wcmVmaXgnLCBcIlJ1bm5pbmcgXCIpO1xuXHRcdGxhYmVsRWxlbWVudC5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShwcmVmaXhUZXh0KSk7XG5cdFx0Y29uc3QgY29kZUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb2RlJyk7XG5cdFx0Y29kZUVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9jb21tYW5kVGV4dDtcblx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoY29kZUVsZW1lbnQpO1xuXHRcdGlmIChzdWZmaXhUZXh0KSB7XG5cdFx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoc3VmZml4VGV4dCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNob3dMaW5rKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dMaW5rRWxlbWVudD8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5fc2hvd0xpbmtFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Nob3dMaW5rRGlzcG9zYWJsZXMudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCF0aGlzLl9pc1J1bm5pbmdJbkJhY2tncm91bmQgfHwgIXRoaXMuX29uRm9jdXNUZXJtaW5hbCB8fCAhdGhpcy5fY29sbGFwc2VCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gdGhpcy5fY29sbGFwc2VCdXR0b24ubGFiZWxFbGVtZW50O1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Nob3dMaW5rRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnc3Bhbi5jaGF0LXRlcm1pbmFsLXNob3ctbGluay1jb250YWluZXInKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyBcXHUyMDE0ICcpKTtcblx0XHRjb25zdCBzaG93TGluayA9IGRvbS4kKCdzcGFuLmNoYXQtdGVybWluYWwtc2hvdy1saW5rJyk7XG5cdFx0c2hvd0xpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC5zaG93VGVybWluYWwnLCBcIlNob3dcIik7XG5cdFx0c2hvd0xpbmsucm9sZSA9ICdidXR0b24nO1xuXHRcdHNob3dMaW5rLnRhYkluZGV4ID0gMDtcblx0XHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzaG93TGluaywgZG9tLkV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0dGhpcy5fb25Gb2N1c1Rlcm1pbmFsPy4oKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd0xpbmssIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlKSA9PiB7XG5cdFx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fb25Gb2N1c1Rlcm1pbmFsPy4oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHNob3dMaW5rKTtcblx0XHRsYWJlbEVsZW1lbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHR0aGlzLl9zaG93TGlua0VsZW1lbnQgPSBjb250YWluZXI7XG5cdH1cblxuXHRwdWJsaWMgbWFya0NvbXBsZXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzQ29tcGxldGUgPSB0cnVlO1xuXHRcdHRoaXMuX2lzUnVubmluZ0luQmFja2dyb3VuZCA9IGZhbHNlO1xuXHRcdHRoaXMuaWNvbiA9IENvZGljb24uY2hlY2s7XG5cdFx0dGhpcy5fc2V0Q29kZUZvcm1hdHRlZFRpdGxlKCk7XG5cdFx0dGhpcy5fdXBkYXRlU2hvd0xpbmsoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbml0Q29udGVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgbGlzdFdyYXBwZXIgPSBkb20uJCgnLmNoYXQtdXNlZC1jb250ZXh0LWxpc3QuY2hhdC10ZXJtaW5hbC10aGlua2luZy1jb250ZW50Jyk7XG5cdFx0bGlzdFdyYXBwZXIuYXBwZW5kQ2hpbGQodGhpcy5fdGVybWluYWxDb250ZW50RWxlbWVudCk7XG5cdFx0cmV0dXJuIGxpc3RXcmFwcGVyO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZCgpOiB2b2lkIHtcblx0XHR0aGlzLnNldEV4cGFuZGVkKHRydWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzU2FtZUNvbnRlbnQoX290aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgX2ZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIF9lbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtc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
