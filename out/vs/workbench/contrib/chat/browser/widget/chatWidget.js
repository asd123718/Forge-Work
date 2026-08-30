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
import "./media/chat.css";
import "./media/chatAgentHover.css";
import "./media/chatViewWelcome.css";
import * as dom from "../../../../../base/browser/dom.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { disposableTimeout, timeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { hash } from "../../../../../base/common/hash.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable, thenIfNotDisposed } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { filter } from "../../../../../base/common/objects.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { extUri, isEqual } from "../../../../../base/common/resources.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ChatPerfMark, clearChatMarks, markChat } from "../../common/chatPerf.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { bindContextKey } from "../../../../../platform/observable/common/platformObservableUtils.js";
import product from "../../../../../platform/product/common/product.js";
import { Progress } from "../../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { SaveReason } from "../../../../common/editor.js";
import { ChatEntitlementContextKeys, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { checkModeOption } from "../../common/chat.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, inChatEditingSessionContextKey, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { IChatLayoutService } from "../../common/widget/chatLayoutService.js";
import { logChangesToStateModel } from "../../common/model/chatModel.js";
import { ChatMode, getModeNameForTelemetry } from "../../common/chatModes.js";
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from "../../common/requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../../common/requestParser/chatRequestParser.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../attachments/chatVariables.js";
import { ChatWidgetPasteTarget } from "../attachments/chatWidgetPasteTarget.js";
import { ChatRequestQueueKind, ChatSendResult, IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { IChatSlashCommandService } from "../../common/participants/chatSlashCommands.js";
import { IChatTodoListService } from "../../common/tools/chatTodoListService.js";
import { ChatRequestVariableSet, isPastedTextArtifact, isPromptFileVariableEntry, isPromptTextVariableEntry, isWorkspaceVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { ChatViewModel, isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatMessageRole } from "../../common/languageModels.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, ThinkingDisplayMode } from "../../common/constants.js";
import { IChatGoalSummaryService } from "../chatGoalSummaryService.js";
import { ILanguageModelToolsService, isToolSet } from "../../common/tools/languageModelToolsService.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, handleModeSwitch } from "../actions/chatActions.js";
import { IChatAccessibilityService, IChatPasteTargetService, IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from "../chat.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { ChatDynamicVariableModel } from "../attachments/chatDynamicVariables.js";
import { ChatAttachmentsContentPart } from "./chatContentParts/chatAttachmentsContentPart.js";
import { ChatSuggestNextWidget } from "./chatContentParts/chatSuggestNextWidget.js";
import { resolveEditedRequestSelection } from "./input/chatInputModelUtils.js";
import { ChatInputPart } from "./input/chatInputPart.js";
import { setChatInputStackInputWorking } from "./input/chatInputStack.js";
import { ChatListWidget } from "./chatListWidget.js";
import { ChatFindWidget } from "./chatFind/chatFindWidget.js";
import { ChatEditorOptions } from "./chatOptions.js";
import { ChatViewWelcomePart } from "../viewsWelcome/chatViewWelcomeController.js";
import { hasImmutablePrimaryWorkingDirectory } from "../agentSessions/agentHost/agentHostNewSessionFolderService.js";
import { IChatTipService } from "../chatTipService.js";
import { ChatInputTipPresenter } from "./input/chatInputTipPresenter.js";
import { ChatProgressSubPart } from "./chatContentParts/chatProgressContentPart.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { CHAT_READ_ONLY_BANNER_HEIGHT, ChatReadOnlyBanner } from "./chatReadOnlyBanner.js";
import { IChatSubmitRequestHandlerService } from "../chatSubmitRequestHandlerService.js";
import { ChatPetWidget, isChatPetVisible } from "./chatPetWidget.js";
import { IChatPetService } from "../chatPetService.js";
import { stopDictationForEditor } from "../speechToText/dictationSession.js";
import { ChatContentMarkdownRenderer } from "./chatContentMarkdownRenderer.js";
const $ = dom.$;
const SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING = 64;
function isQuickChat(widget) {
  return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isQuickChat);
}
function isInlineChat(widget) {
  return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isInlineChat);
}
function getImmediateSilentSlashCommandPart(parsedRequest) {
  return parsedRequest.parts.find(
    (part) => part instanceof ChatRequestSlashCommandPart && part.range.start === 0 && part.slashCommand.executeImmediately === true && part.slashCommand.silent === true
  );
}
function shouldShowChatWelcome(itemCount, hasTranscriptOverlay) {
  if (itemCount === void 0 && !hasTranscriptOverlay) {
    return void 0;
  }
  return itemCount === 0 && !hasTranscriptOverlay;
}
function shouldShowChatTip(itemCount, hasTranscriptOverlay, isLoading) {
  return !isLoading && shouldShowChatWelcome(itemCount, hasTranscriptOverlay) === true;
}
async function saveAllBeforeChatSend(configurationService, editorService) {
  if (configurationService.getValue(ChatConfiguration.SaveBeforeSend) !== false) {
    await editorService.saveAll({ includeUntitled: false, reason: SaveReason.EXPLICIT });
  }
}
async function acceptAndAwaitSentRequest(result, onRequestAccepted) {
  if (ChatSendResult.isRejected(result)) {
    return void 0;
  }
  onRequestAccepted?.();
  const sent = ChatSendResult.isQueued(result) ? await result.deferred : result;
  return ChatSendResult.isSent(sent) ? sent : void 0;
}
const supportsAllAttachments = {
  supportsFileAttachments: true,
  supportsToolAttachments: true,
  supportsMCPAttachments: true,
  supportsImageAttachments: true,
  supportsSearchResultAttachments: true,
  supportsInstructionAttachments: true,
  supportsSourceControlAttachments: true,
  supportsProblemAttachments: true,
  supportsSymbolAttachments: true,
  supportsTerminalAttachments: true,
  supportsPromptAttachments: true,
  supportsHandOffs: true,
  supportsCheckpoints: true
};
const DISCLAIMER = localize("chatDisclaimer", "AI responses may be inaccurate");
let ChatWidget = class extends Disposable {
  constructor(location, viewContext, viewOptions, styles, codeEditorService, configurationService, editorService, dialogService, contextKeyService, instantiationService, chatService, chatAgentService, chatWidgetService, chatPasteTargetService, chatAccessibilityService, logService, themeService, chatSlashCommandService, chatEditingService, telemetryService, promptsService, customizationHarnessService, toolsService, chatLayoutService, chatEntitlementService, chatSessionsService, agentSessionsService, chatTodoListService, lifecycleService, chatAttachmentResolveService, chatTipService, chatDebugService, accessibilityService, chatGoalSummaryService, chatSubmitRequestHandlerService, chatPetService, _agentHostService) {
    super();
    this.viewOptions = viewOptions;
    this.styles = styles;
    this.codeEditorService = codeEditorService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.dialogService = dialogService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.chatService = chatService;
    this.chatAgentService = chatAgentService;
    this.chatWidgetService = chatWidgetService;
    this.chatPasteTargetService = chatPasteTargetService;
    this.chatAccessibilityService = chatAccessibilityService;
    this.logService = logService;
    this.themeService = themeService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.telemetryService = telemetryService;
    this.promptsService = promptsService;
    this.customizationHarnessService = customizationHarnessService;
    this.toolsService = toolsService;
    this.chatLayoutService = chatLayoutService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatSessionsService = chatSessionsService;
    this.agentSessionsService = agentSessionsService;
    this.chatTodoListService = chatTodoListService;
    this.lifecycleService = lifecycleService;
    this.chatAttachmentResolveService = chatAttachmentResolveService;
    this.chatTipService = chatTipService;
    this.chatDebugService = chatDebugService;
    this.accessibilityService = accessibilityService;
    this.chatGoalSummaryService = chatGoalSummaryService;
    this.chatSubmitRequestHandlerService = chatSubmitRequestHandlerService;
    this.chatPetService = chatPetService;
    this._agentHostService = _agentHostService;
    this._onDidSubmitAgent = this._register(new Emitter());
    this.onDidSubmitAgent = this._onDidSubmitAgent.event;
    this._onDidChangeAgent = this._register(new Emitter());
    this.onDidChangeAgent = this._onDidChangeAgent.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeViewModel = this._register(new Emitter());
    this.onDidChangeViewModel = this._onDidChangeViewModel.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidAcceptInput = this._register(new Emitter());
    this.onDidAcceptInput = this._onDidAcceptInput.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidChangeParsedInput = this._register(new Emitter());
    this.onDidChangeParsedInput = this._onDidChangeParsedInput.event;
    this._onDidChangeActiveInputEditor = this._register(new Emitter());
    this.onDidChangeActiveInputEditor = this._onDidChangeActiveInputEditor.event;
    this._onWillMaybeChangeHeight = this._register(new Emitter());
    this.onWillMaybeChangeHeight = this._onWillMaybeChangeHeight.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidLayout = this._register(new Emitter());
    this.onDidLayout = this._onDidLayout.event;
    this._onDidChangeEmptyState = this._register(new Emitter());
    this.onDidChangeEmptyState = this._onDidChangeEmptyState.event;
    this._onDidChangeFindableContent = this._register(new Emitter());
    this.contribs = [];
    this.transcriptProgressPart = this._register(new MutableDisposable());
    this.transcriptProgressActive = false;
    this.transcriptContextPart = this._register(new MutableDisposable());
    this.visibilityTimeoutDisposable = this._register(new MutableDisposable());
    this.visibilityAnimationFrameDisposable = this._register(new MutableDisposable());
    this.inputPartDisposable = this._register(new MutableDisposable());
    this.inlineInputPartDisposable = this._register(new MutableDisposable());
    this.mainPasteTargetRegistration = this._register(new MutableDisposable());
    this.inlinePasteTargetRegistration = this._register(new MutableDisposable());
    this.recentlyRestoredCheckpoint = false;
    /** Suppresses auto-scroll for the duration of an inline request edit. */
    this._editingAutoScrollHold = this._register(new MutableDisposable());
    this.welcomePart = this._register(new MutableDisposable());
    this._gettingStartedTip = this._register(new MutableDisposable());
    this.visibleChangeCount = 0;
    this._visible = false;
    this._inputVisible = true;
    this._readOnly = false;
    this._isRenderingWelcome = false;
    this._isLoading = false;
    this._attachmentCapabilities = supportsAllAttachments;
    this._goalBannerDismissedForCurrentRequest = false;
    this._goalBannerDismissListener = this._register(new MutableDisposable());
    this.viewModelDisposables = this._register(new DisposableStore());
    this._editingSession = observableValue(this, void 0);
    this._viewModelObs = observableFromEvent(this, this.onDidChangeViewModel, () => this.viewModel);
    this.readOnlyBanner = viewOptions.isSessionsWindow ? void 0 : this._register(instantiationService.createInstance(
      ChatReadOnlyBanner,
      viewOptions.readOnlyBannerAtTop ? localize("chatReadOnlyBanner.message", "This chat is read-only") : void 0
    ));
    this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);
    this._lockedCodingAgentIdContextKey = ChatContextKeys.lockedCodingAgentId.bindTo(this.contextKeyService);
    this._readOnlyContextKey = ChatContextKeys.readOnly.bindTo(this.contextKeyService);
    this._chatIsAgentHostSessionContextKey = ChatContextKeys.chatIsAgentHostSession.bindTo(this.contextKeyService);
    this._chatAgentHostProviderIdContextKey = ChatContextKeys.chatAgentHostProviderId.bindTo(this.contextKeyService);
    this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey = ChatContextKeys.chatAgentHostHasImmutablePrimaryWorkingDirectory.bindTo(this.contextKeyService);
    this._chatSessionSupportsForkContextKey = ChatContextKeys.chatSessionSupportsFork.bindTo(this.contextKeyService);
    this._agentSupportsAttachmentsContextKey = ChatContextKeys.agentSupportsAttachments.bindTo(this.contextKeyService);
    this._sessionIsEmptyContextKey = ChatContextKeys.chatSessionIsEmpty.bindTo(this.contextKeyService);
    this._hasPendingRequestsContextKey = ChatContextKeys.hasPendingRequests.bindTo(this.contextKeyService);
    this._sessionHasDebugDataContextKey = ChatContextKeys.chatSessionHasDebugData.bindTo(this.contextKeyService);
    this._register(this.chatDebugService.onDidAddEvent((e) => {
      const sessionResource = this.viewModel?.sessionResource;
      if (sessionResource && e.sessionResource.toString() === sessionResource.toString()) {
        this._sessionHasDebugDataContextKey.set(true);
      }
    }));
    const rootStateListeners = this._register(new DisposableStore());
    const bindRootState = () => {
      rootStateListeners.clear();
      const rootState = this._agentHostService.rootState;
      rootStateListeners.add(rootState.onDidChange(() => this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId)));
      if (rootState.onDidError) {
        rootStateListeners.add(rootState.onDidError(() => this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId)));
      }
      this._updateAgentHostWorkingDirectoryContextKeys(this._lockedAgent?.agentHostProviderId);
    };
    bindRootState();
    this._register(this._agentHostService.onAgentHostStart(bindRootState));
    this.viewContext = viewContext ?? {};
    const viewModelObs = this._viewModelObs;
    if (typeof location === "object") {
      this._location = location;
    } else {
      this._location = { location };
    }
    ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
    ChatContextKeys.location.bindTo(contextKeyService).set(this._location.location);
    ChatContextKeys.inQuickChat.bindTo(contextKeyService).set(isQuickChat(this));
    ChatContextKeys.findSupported.bindTo(contextKeyService).set(!!this.viewOptions.enableFind);
    this._register(this.onDidChangeViewModel(() => this._onDidChangeFindableContent.fire()));
    this.agentInInput = ChatContextKeys.inputHasAgent.bindTo(contextKeyService);
    this.requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);
    this.hasActiveRequest = ChatContextKeys.hasActiveRequest.bindTo(contextKeyService);
    this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this.renderWelcomeViewContentIfNeeded()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.tips.enabled")) {
        if (!this.configurationService.getValue("chat.tips.enabled")) {
          this.clearGettingStartedTip();
        } else {
          this.updateChatViewVisibility();
        }
      }
      if (e.affectsConfiguration(ChatConfiguration.ProgressBorder)) {
        this.updateWorkingProgressBorder();
      }
    }));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      this.updateWorkingProgressBorder();
      if (this.visible) {
        this.listWidget.rerender();
      }
    }));
    this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      if (!currentSession) {
        return;
      }
      const entries = currentSession.entries.read(reader);
      const decidedEntries = entries.filter((entry) => entry.state.read(reader) !== ModifiedFileEntryState.Modified);
      return decidedEntries.map((entry) => entry.entryId);
    }));
    this._register(bindContextKey(hasUndecidedChatEditingResourceContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      const entries = currentSession?.entries.read(reader) ?? [];
      const decidedEntries = entries.filter((entry) => entry.state.read(reader) === ModifiedFileEntryState.Modified);
      return decidedEntries.length > 0;
    }));
    this._register(bindContextKey(hasAppliedChatEditsContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      if (!currentSession) {
        return false;
      }
      const entries = currentSession.entries.read(reader);
      return entries.length > 0;
    }));
    this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
      return this._editingSession.read(reader) !== null;
    }));
    this._register(bindContextKey(ChatContextKeys.chatEditingCanUndo, contextKeyService, (r) => {
      return this._editingSession.read(r)?.canUndo.read(r) || false;
    }));
    this._register(bindContextKey(ChatContextKeys.chatEditingCanRedo, contextKeyService, (r) => {
      return this._editingSession.read(r)?.canRedo.read(r) || false;
    }));
    this._register(bindContextKey(applyingChatEditsFailedContextKey, contextKeyService, (r) => {
      const chatModel = viewModelObs.read(r)?.model;
      const editingSession = this._editingSession.read(r);
      if (!editingSession || !chatModel) {
        return false;
      }
      const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response).read(r);
      return lastResponse?.result?.errorDetails && !lastResponse?.result?.errorDetails.responseIsIncomplete;
    }));
    this.chatSuggestNextWidget = this._register(this.instantiationService.createInstance(ChatSuggestNextWidget));
    this._register(autorun((r) => {
      const viewModel = viewModelObs.read(r);
      const inProgress = viewModel?.model.requestInProgress.read(r) ?? false;
      if (!inProgress) {
        this._cancelGoalSummary();
        this.inputPartDisposable.value?.clearGoalBanner();
      }
    }));
    this._register(autorun((r) => {
      const viewModel = viewModelObs.read(r);
      const sessions = chatEditingService.editingSessionsObs.read(r);
      const session = sessions.find((candidate) => isEqual(candidate.chatSessionResource, viewModel?.sessionResource));
      this._editingSession.set(void 0, void 0);
      this.renderChatEditingSessionState();
      if (!session) {
        return;
      }
      const entries = session.entries.read(r);
      for (const entry of entries) {
        entry.state.read(r);
      }
      this._editingSession.set(session, void 0);
      r.store.add(session.onDidDispose(() => {
        this._editingSession.set(void 0, void 0);
        this.renderChatEditingSessionState();
      }));
      r.store.add(this.inputEditor.onDidChangeModelContent(() => {
        if (this.getInput() === "") {
          this.refreshParsedInput();
        }
      }));
      this.renderChatEditingSessionState();
    }));
    this._register(this.codeEditorService.registerCodeEditorOpenHandler(async (input, _source, _sideBySide) => {
      const resource = input.resource;
      if (resource.scheme !== Schemas.vscodeChatCodeBlock) {
        return null;
      }
      const responseId = resource.path.split("/").at(1);
      if (!responseId) {
        return null;
      }
      const item = this.viewModel?.getItems().find((item2) => item2.id === responseId);
      if (!item) {
        return null;
      }
      this.reveal(item);
      await timeout(0);
      for (const codeBlockPart of this.listWidget.editorsInUse()) {
        if (extUri.isEqual(codeBlockPart.uri, resource, true)) {
          const editor = codeBlockPart.editor;
          let relativeTop = 0;
          const editorDomNode = editor.getDomNode();
          if (editorDomNode) {
            const row = dom.findParentWithClass(editorDomNode, "monaco-list-row");
            if (row) {
              relativeTop = dom.getTopLeftOffset(editorDomNode).top - dom.getTopLeftOffset(row).top;
            }
          }
          if (input.options?.selection) {
            const editorSelectionTopOffset = editor.getTopForPosition(input.options.selection.startLineNumber, input.options.selection.startColumn);
            relativeTop += editorSelectionTopOffset;
            editor.focus();
            editor.setSelection({
              startLineNumber: input.options.selection.startLineNumber,
              startColumn: input.options.selection.startColumn,
              endLineNumber: input.options.selection.endLineNumber ?? input.options.selection.startLineNumber,
              endColumn: input.options.selection.endColumn ?? input.options.selection.startColumn
            });
          }
          this.reveal(item, relativeTop);
          return editor;
        }
      }
      return null;
    }));
    this._register(this.onDidChangeParsedInput(() => this.updateChatInputContext()));
    this._register(this.chatTodoListService.onDidUpdateTodos((sessionResource) => {
      if (isEqual(this.viewModel?.sessionResource, sessionResource)) {
        this.inputPart.renderChatTodoListWidget(sessionResource);
      }
    }));
  }
  get domNode() {
    return this.container;
  }
  /**
   * Shared across the main and inline input parts: it resolves the active part
   * through {@link input}, so one instance serves whichever is in use.
   */
  get pasteTarget() {
    return this._pasteTarget ??= new ChatWidgetPasteTarget(this);
  }
  get visible() {
    return this._visible;
  }
  set viewModel(viewModel) {
    if (this._viewModel === viewModel) {
      return;
    }
    const previousSessionResource = this._viewModel?.sessionResource;
    this.viewModelDisposables.clear();
    this._viewModel = viewModel;
    if (viewModel) {
      this.viewModelDisposables.add(viewModel);
      this.logService.debug("ChatWidget#setViewModel: have viewModel");
      if (viewModel.model.requestInProgress.get()) {
        this.chatAccessibilityService.acceptRequest(viewModel.sessionResource, true);
      }
    } else {
      this.logService.debug("ChatWidget#setViewModel: no viewModel");
    }
    this._onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: this._viewModel?.sessionResource });
  }
  get viewModel() {
    return this._viewModel;
  }
  get parsedInput() {
    if (this.parsedChatRequest === void 0) {
      if (!this.viewModel) {
        return { text: "", parts: [] };
      }
      this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, {
        selectedAgent: this._lastSelectedAgent,
        mode: this.input.currentModeKind,
        attachmentCapabilities: this.attachmentCapabilities,
        forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0,
        sessionType: getChatSessionType(this.viewModel.model.sessionResource)
      });
      this._onDidChangeParsedInput.fire();
    }
    return this.parsedChatRequest;
  }
  get scopedContextKeyService() {
    return this.contextKeyService;
  }
  get location() {
    return this._location.location;
  }
  get supportsChangingModes() {
    return !!this.viewOptions.supportsChangingModes;
  }
  get locationData() {
    return this._location.resolveData?.();
  }
  set lastSelectedAgent(agent) {
    this.parsedChatRequest = void 0;
    this._lastSelectedAgent = agent;
    this._updateAgentCapabilitiesContextKeys(agent);
    this._onDidChangeParsedInput.fire();
  }
  get lastSelectedAgent() {
    return this._lastSelectedAgent;
  }
  _updateAgentCapabilitiesContextKeys(agent) {
    const capabilities = agent?.capabilities ?? (this._lockedAgent ? this.chatSessionsService.getCapabilitiesForSessionType(this._lockedAgent.id) : void 0);
    this._attachmentCapabilities = capabilities ?? supportsAllAttachments;
    const supportsAttachments = Object.keys(filter(this._attachmentCapabilities, (key, value) => value === true)).length > 0;
    this._agentSupportsAttachmentsContextKey.set(supportsAttachments);
  }
  /**
   * Updates the context key that gates the multi-root folder picker: it is set
   * only when the locked Agent Host provider pins an immutable primary working
   * directory. Defaults to (and falls back to) `false`, so the picker stays
   * hidden until the provider's capabilities are known.
   */
  _updateAgentHostWorkingDirectoryContextKeys(agentHostProviderId) {
    this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey.set(
      !!agentHostProviderId && hasImmutablePrimaryWorkingDirectory(this._agentHostService.rootState.value, agentHostProviderId)
    );
  }
  get supportsFileReferences() {
    return !!this.viewOptions.supportsFileReferences;
  }
  get rendersInputOnTop() {
    return this.viewOptions.renderInputOnTop ?? false;
  }
  get attachmentCapabilities() {
    return this._attachmentCapabilities;
  }
  /**
   * Either the inline input (when editing) or the main input part
   */
  get input() {
    return this.viewModel?.editing && this.configurationService.getValue("chat.editRequests") !== "input" ? this.inlineInputPart : this.inputPart;
  }
  get contextPicker() {
    return this.viewOptions.contextPicker;
  }
  /**
   * The main input part at the buttom of the chat widget. Use `input` to get the active input (main or inline editing part).
   */
  get inputPart() {
    return this.inputPartDisposable.value;
  }
  get inlineInputPart() {
    return this.inlineInputPartDisposable.value;
  }
  updateWorkingProgressBorder() {
    const inputPart = this.inputPartDisposable.value;
    if (!inputPart) {
      return;
    }
    const inputContainer = inputPart.inputContainerElement;
    if (!inputContainer) {
      return;
    }
    const enabled = this.configurationService.getValue(ChatConfiguration.ProgressBorder) === true && !this.accessibilityService.isMotionReduced() && !isInlineChat(this);
    const inProgress = !!this.viewModel?.model.requestInProgress.get();
    const working = enabled && inProgress;
    inputContainer.classList.toggle("working", working);
    setChatInputStackInputWorking(inputContainer, working);
  }
  get inputEditor() {
    return this.input.inputEditor;
  }
  get contentHeight() {
    return this.input.height.get() + this.listWidget.contentHeight + this.chatSuggestNextWidget.height;
  }
  get scrollTop() {
    return this.listWidget.scrollTop;
  }
  set scrollTop(value) {
    this.listWidget.scrollTop = value;
  }
  getViewState() {
    return {
      scrollTop: this.listWidget.scrollTop,
      isAtBottom: this.listWidget.isScrolledToBottom
    };
  }
  restoreViewState(state) {
    if (state.isAtBottom) {
      this.listWidget.scrollToEnd();
    } else {
      this.listWidget.scrollTop = state.scrollTop;
    }
  }
  holdAutoScroll() {
    return this.listWidget.acquireAutoScrollHold();
  }
  get transcriptDomNode() {
    return this.listWidget.domNode;
  }
  get scrollHeight() {
    return this.listWidget.scrollHeight;
  }
  get viewportHeight() {
    return this.listWidget.renderHeight;
  }
  get attachmentModel() {
    return this.input.attachmentModel;
  }
  render(parent, petMovementBounds) {
    const viewId = isIChatViewViewContext(this.viewContext) ? this.viewContext.viewId : void 0;
    this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
    const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
    const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
    const renderStyle = this.viewOptions.renderStyle;
    const renderInputToolbarBelowInput = this.viewOptions.renderInputToolbarBelowInput ?? false;
    this.container = dom.append(parent, $(".interactive-session"));
    this.welcomeMessageContainer = dom.append(this.container, $(".chat-welcome-view-container", { style: "display: none" }));
    this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));
    this._register(this.chatSuggestNextWidget.onDidChangeHeight(() => {
      if (this.bodyDimension) {
        this.layout(this.bodyDimension.height, this.bodyDimension.width);
      }
    }));
    this._register(this.chatSuggestNextWidget.onDidSelectPrompt(({ handoff, agentId, withAutopilot }) => {
      this.handleNextPromptSelection(handoff, agentId, withAutopilot);
    }));
    if (renderInputOnTop) {
      if (this.readOnlyBanner && !this.viewOptions.readOnlyBannerAtTop) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
      if (this.readOnlyBanner && this.viewOptions.readOnlyBannerAtTop) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.listContainer = dom.append(this.container, $(`.interactive-list`));
    } else {
      if (this.readOnlyBanner && this.viewOptions.readOnlyBannerAtTop) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.listContainer = dom.append(this.container, $(`.interactive-list`));
      dom.append(this.container, this.chatSuggestNextWidget.domNode);
      if (this.readOnlyBanner && !this.viewOptions.readOnlyBannerAtTop) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
    }
    if (this.location === ChatAgentLocation.Chat && !isInlineChat(this) && !this.scopedContextKeyService.contextMatchesRules(ChatContextKeys.inChatInputWindow)) {
      const inputContainer = this.inputPart.inputContainerElement;
      const petHost = this.inputPart.element;
      const inputHasContent = observableFromEvent(this, this.inputEditor.onDidChangeModelContent, () => this.inputEditor.getValue().length > 0);
      const targetWindow = dom.getWindow(this.container);
      const isLatestFocusedWidgetInWindow = observableValue(this, this.chatWidgetService.lastFocusedWidget === this);
      this._register(this.chatWidgetService.onDidChangeFocusedWidget((focusedWidget) => {
        if (focusedWidget && dom.getWindow(focusedWidget.domNode) === targetWindow) {
          isLatestFocusedWidgetInWindow.set(focusedWidget === this, void 0);
        }
      }));
      const petVisible = derived(this, (reader) => isChatPetVisible(this.chatPetService.enabled.read(reader), isLatestFocusedWidgetInWindow.read(reader)));
      this._register(autorun((reader) => this.container.classList.toggle("chat-pet-enabled", petVisible.read(reader))));
      const petWidget = this._register(this.instantiationService.createInstance(ChatPetWidget, petHost, inputContainer ?? petHost, petMovementBounds ?? parent, this._viewModelObs.map((viewModel) => viewModel?.model), inputHasContent, petVisible, this.inputEditor.onDidChangeModelContent));
      petWidget.setPlatformTopProvider(() => this.inputPart.getChatPetPlatformTop());
    }
    this.renderWelcomeViewContentIfNeeded();
    this.createList(this.listContainer, {
      editable: !isInlineChat(this) && !isQuickChat(this),
      contentHorizontalPadding: this.viewOptions.isSessionsWindow ? SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING : void 0,
      ...this.viewOptions.rendererOptions,
      renderStyle
    });
    if (this.viewOptions.enableFind) {
      const host = {
        transcriptDomNode: this.listWidget.domNode,
        getItems: () => this.viewModel?.getItems() ?? [],
        onDidChangeContent: this._onDidChangeFindableContent.event,
        reveal: (item, relativeTop) => this.reveal(item, relativeTop),
        getTemplateDataForRequestId: (requestId) => this.getTemplateDataForRequestId(requestId),
        onDidRerenderRow: this.onDidRerenderRow,
        editorsInUse: () => this.listWidget.editorsInUse()
      };
      this._findController = this._register(this.instantiationService.createInstance(ChatFindWidget, host));
      this._register(this._findController.focusTracker.onDidFocus(() => this._onDidFocus.fire()));
      if (this.bodyDimension) {
        this._findController.layout(this.bodyDimension.width);
      }
    }
    this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_WHEEL, (e) => {
      if (e.defaultPrevented || e.target !== this.container) {
        return;
      }
      this.listWidget.delegateScrollFromMouseWheelEvent(e);
    }));
    this._register(dom.addDisposableListener(parent, dom.EventType.MOUSE_WHEEL, (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target && dom.isAncestor(target, this.container)) {
        return;
      }
      this.listWidget.delegateScrollFromMouseWheelEvent(e);
    }));
    this._register(autorun((reader) => {
      const fontFamily = this.chatLayoutService.fontFamily.read(reader);
      const fontSize = this.chatLayoutService.fontSize.read(reader);
      this.container.style.setProperty("--vscode-chat-font-family", fontFamily);
      this.container.style.fontSize = `${fontSize}px`;
      if (this.visible) {
        this.listWidget.rerender();
      }
    }));
    this._register(Event.runAndSubscribe(this.editorOptions.onDidChange, () => this.onDidStyleChange()));
    if (this.viewModel) {
      this.onDidChangeItems();
      this.listWidget.scrollToEnd();
    }
    this.contribs = ChatWidget.CONTRIBS.map((contrib) => {
      try {
        return this._register(this.instantiationService.createInstance(contrib, this));
      } catch (err) {
        this.logService.error("Failed to instantiate chat widget contrib", toErrorMessage(err));
        return void 0;
      }
    }).filter(isDefined);
    this._register(this.chatWidgetService.register(this));
    const parsedInput = observableFromEvent(this.onDidChangeParsedInput, () => this.parsedInput);
    this._register(autorun((r) => {
      const input = parsedInput.read(r);
      const newPromptAttachments = /* @__PURE__ */ new Map();
      const oldPromptAttachments = /* @__PURE__ */ new Set();
      for (const attachment of this.attachmentModel.attachments) {
        if (attachment.range) {
          oldPromptAttachments.add(attachment.id);
        }
      }
      for (const part of input.parts) {
        if (part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart || part instanceof ChatRequestDynamicVariablePart) {
          const entry = part.toVariableEntry();
          if (part instanceof ChatRequestDynamicVariablePart && part.isAttachmentReference) {
            const attachment = this.attachmentModel.attachments.find((attachment2) => attachment2.id === part.id);
            if (attachment && isPastedTextArtifact(attachment)) {
              newPromptAttachments.set(attachment.id, { ...attachment, range: part.range });
              oldPromptAttachments.delete(attachment.id);
            }
            continue;
          }
          newPromptAttachments.set(entry.id, entry);
          oldPromptAttachments.delete(entry.id);
        }
      }
      this.attachmentModel.updateContext(oldPromptAttachments, newPromptAttachments.values());
    }));
    if (!this.focusedInputDOM) {
      this.focusedInputDOM = this.container.appendChild(dom.$(".focused-input-dom"));
    }
  }
  focusInput() {
    if (!this._inputVisible) {
      if (this.listWidget.focusLastItem(true) < 0) {
        this.listWidget.focus();
      }
      this._onDidFocus.fire();
      return;
    }
    this.input.focus();
    this._onDidFocus.fire();
  }
  focusTodosView() {
    if (!this.input.hasVisibleTodos()) {
      return false;
    }
    return this.input.focusTodoList();
  }
  toggleTodosViewFocus() {
    if (!this.input.hasVisibleTodos()) {
      return false;
    }
    if (this.input.isTodoListFocused()) {
      this.focusInput();
      return true;
    }
    return this.input.focusTodoList();
  }
  focusQuestionCarousel() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.focusQuestionCarousel();
  }
  toggleQuestionCarouselFocus() {
    if (!this.input.questionCarousel) {
      return false;
    }
    if (this.input.isQuestionCarouselFocused()) {
      this.focusInput();
      return true;
    }
    return this.input.focusQuestionCarousel();
  }
  navigateToPreviousQuestion() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.navigateToPreviousQuestion();
  }
  navigateToNextQuestion() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.navigateToNextQuestion();
  }
  focusQuestionCarouselTerminal() {
    return this.input.focusQuestionCarouselTerminal();
  }
  hasInputFocus() {
    return this.input.hasFocus();
  }
  refreshParsedInput() {
    if (!this.viewModel) {
      return;
    }
    const previous = this.parsedChatRequest;
    const context = {
      selectedAgent: this._lastSelectedAgent,
      mode: this.input.currentModeKind,
      attachmentCapabilities: this.attachmentCapabilities,
      sessionType: getChatSessionType(this.viewModel.model.sessionResource),
      forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0
    };
    this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, context);
    if (!previous || !IParsedChatRequest.equals(previous, this.parsedChatRequest)) {
      this._onDidChangeParsedInput.fire();
    }
  }
  getSibling(item, type) {
    if (!isResponseVM(item)) {
      return;
    }
    const items = this.viewModel?.getItems();
    if (!items) {
      return;
    }
    const responseItems = items.filter((i) => isResponseVM(i));
    const targetIndex = responseItems.indexOf(item);
    if (targetIndex === void 0) {
      return;
    }
    const indexToFocus = type === "next" ? targetIndex + 1 : targetIndex - 1;
    if (indexToFocus < 0 || indexToFocus > responseItems.length - 1) {
      return;
    }
    return responseItems[indexToFocus];
  }
  async clear(targetSessionType) {
    this.logService.debug("ChatWidget#clear");
    if (this._dynamicMessageLayoutData) {
      this._dynamicMessageLayoutData.enabled = true;
    }
    if (this.viewModel?.editing) {
      this.finishedEditing();
    }
    if (this.viewModel) {
      this.viewModel.resetInputPlaceholder();
    }
    if (this._lockedAgent) {
      this.lockToCodingAgent(this._lockedAgent.name, this._lockedAgent.displayName, this._lockedAgent.id, this._lockedAgent.agentHostProviderId);
    } else {
      this.unlockFromCodingAgent();
    }
    this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
    this.inputPart?.clearArtifactsWidget();
    this.chatSuggestNextWidget.hide();
    await this.viewOptions.clear?.(targetSessionType);
  }
  onDidChangeItems(skipDynamicLayout) {
    if (this._visible || !this.viewModel) {
      const items = this.viewModel?.getItems() ?? [];
      if (items.length > 0) {
        this.updateChatViewVisibility();
      } else {
        this.renderWelcomeViewContentIfNeeded();
      }
      this._onWillMaybeChangeHeight.fire();
      this.listWidget.setVisibleChangeCount(this.visibleChangeCount);
      this.listWidget.refresh();
      if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
        this.layoutDynamicChatTreeItemMode();
      }
      this.renderFollowups();
    }
  }
  /**
   * Updates the DOM visibility of welcome view and chat list immediately
   */
  updateChatViewVisibility() {
    const showWelcome = shouldShowChatWelcome(
      this.viewModel?.getItems().length,
      this.transcriptProgressActive || this.transcriptContextValue !== void 0
    );
    if (showWelcome !== void 0) {
      dom.setVisibility(showWelcome, this.welcomeMessageContainer);
      dom.setVisibility(!showWelcome, this.listContainer);
      this.renderGettingStartedTipIfNeeded();
    }
    this.container.classList.toggle(
      "chat-view-getting-started-disabled",
      this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels
    );
    this._onDidChangeEmptyState.fire();
  }
  isEmpty() {
    return (this.viewModel?.getItems().length ?? 0) === 0;
  }
  setTranscriptProgress(message, ariaLabel = message) {
    if (!this.transcriptProgress) {
      const container = dom.append(this.listContainer, $(".chat-transcript-progress"));
      container.hidden = true;
      container.setAttribute("role", "status");
      container.setAttribute("aria-live", "polite");
      const content = dom.append(container, $(".interactive-item-container"));
      content.setAttribute("aria-hidden", "true");
      this.transcriptProgress = { container, content };
    }
    this.transcriptProgressPart.clear();
    dom.clearNode(this.transcriptProgress.content);
    if (message) {
      const store = new DisposableStore();
      const renderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
      const renderedMessage = store.add(renderer.render(new MarkdownString().appendText(message)));
      const progressPart = store.add(this.instantiationService.createInstance(ChatProgressSubPart, renderedMessage.element, Codicon.check, void 0));
      progressPart.domNode.classList.add("shimmer-progress");
      dom.append(this.transcriptProgress.content, progressPart.domNode);
      this.transcriptProgressPart.value = store;
    }
    this.transcriptProgress.container.setAttribute("aria-label", ariaLabel ?? "");
    this.transcriptProgress.container.hidden = message === void 0;
    this.transcriptProgressActive = message !== void 0;
    this.container.classList.toggle("chat-transcript-progress-active", message !== void 0);
    this.updateChatViewVisibility();
  }
  setTranscriptContext(context) {
    this.transcriptContextValue = context;
    if (!this.transcriptContext) {
      this.transcriptContext = dom.append(this.listContainer, $(".chat-transcript-context.chat-attached-context"));
      this.transcriptContext.hidden = true;
    }
    this.transcriptContext.hidden = context === void 0;
    if (context) {
      this.transcriptContextPart.value = this.instantiationService.createInstance(ChatAttachmentsContentPart, {
        variables: [context],
        domNode: this.transcriptContext
      });
    } else {
      this.transcriptContextPart.clear();
      dom.clearNode(this.transcriptContext);
    }
    this.container.classList.toggle("chat-transcript-context-active", context !== void 0);
    this.updateChatViewVisibility();
  }
  /**
   * Renders the welcome view content when needed.
   */
  renderWelcomeViewContentIfNeeded() {
    if (this._isRenderingWelcome) {
      return;
    }
    if (!this.inputPartDisposable.value) {
      return;
    }
    this._isRenderingWelcome = true;
    try {
      if (this.viewOptions.renderStyle === "compact" || this.viewOptions.renderStyle === "minimal" || this.lifecycleService.willShutdown) {
        return;
      }
      const numItems = this.viewModel?.getItems().length ?? 0;
      if (!numItems) {
        const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
        let additionalMessage;
        if (this.chatEntitlementService.anonymous && !this.chatEntitlementService.sentiment.completed && product.defaultChatAgent) {
          const providers = product.defaultChatAgent.provider;
          additionalMessage = new MarkdownString(localize({ key: "settings", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3}).", providers.default.name, providers.default.name, product.defaultChatAgent.termsStatementUrl, product.defaultChatAgent.privacyStatementUrl), { isTrusted: true });
        } else {
          additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
        }
        if (!additionalMessage && !this._lockedAgent) {
          additionalMessage = this._getGenerateInstructionsMessage();
        }
        const welcomeContent = this.getWelcomeViewContent(additionalMessage);
        if (!this.welcomePart.value || this.welcomePart.value.needsRerender(welcomeContent)) {
          dom.clearNode(this.welcomeMessageContainer);
          this.welcomePart.value = this.instantiationService.createInstance(
            ChatViewWelcomePart,
            welcomeContent,
            {
              location: this.location,
              isWidgetAgentWelcomeViewContent: this.input?.currentModeKind === ChatModeKind.Agent
            }
          );
          dom.append(this.welcomeMessageContainer, this.welcomePart.value.element);
        }
      }
      this.updateChatViewVisibility();
    } finally {
      this._isRenderingWelcome = false;
    }
  }
  renderGettingStartedTipIfNeeded() {
    this._gettingStartedTip.value?.update();
  }
  updateGettingStartedTip() {
    this.renderGettingStartedTipIfNeeded();
  }
  /**
   * Whether this surface currently wants to show a getting-started tip. Mirrors
   * the conditions under which the welcome view is shown, since the tip only
   * belongs to the empty state of the standard chat layout.
   */
  isGettingStartedTipEligible() {
    if (typeof this.viewOptions.renderGettingStartedTip === "function" ? !this.viewOptions.renderGettingStartedTip() : this.viewOptions.renderGettingStartedTip === false) {
      return false;
    }
    if (this.viewOptions.renderStyle === "compact" || this.viewOptions.renderStyle === "minimal") {
      return false;
    }
    if (!this.viewModel) {
      return false;
    }
    if (this._isLoading) {
      return false;
    }
    return shouldShowChatTip(this.viewModel.getItems().length, this.transcriptProgressActive || this.transcriptContextValue !== void 0, this._isLoading);
  }
  clearGettingStartedTip() {
    this._gettingStartedTip.value?.clear();
  }
  _getGenerateInstructionsMessage() {
    if (!this._instructionFilesCheckPromise) {
      this._instructionFilesCheckPromise = this._checkForAgentInstructionFiles();
      this._register(thenIfNotDisposed(this._instructionFilesCheckPromise, (hasFiles) => {
        this._instructionFilesExist = hasFiles;
        const hasViewModelItems = this.viewModel?.getItems().length ?? 0;
        if (hasViewModelItems === 0) {
          this.renderWelcomeViewContentIfNeeded();
        }
      }));
    }
    if (this._instructionFilesExist === true) {
      return new MarkdownString("");
    } else if (this._instructionFilesExist === false) {
      return new MarkdownString(localize(
        "chatWidget.instructions",
        "[Generate Agent Instructions]({0}) to onboard AI onto your codebase.",
        `command:${GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID}`
      ), { isTrusted: { enabledCommands: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID] } });
    }
    return new MarkdownString("");
  }
  /**
   * Checks if any agent instruction files (.github/copilot-instructions.md or AGENTS.md) exist in the workspace.
   * Used to determine whether to show the "Generate Agent Instructions" hint.
   *
   * @returns true if instruction files exist OR if instruction features are disabled (to hide the hint)
   */
  async _checkForAgentInstructionFiles() {
    try {
      return (await this.promptsService.listAgentInstructions(CancellationToken.None)).length > 0;
    } catch (error) {
      this.logService.warn("[ChatWidget] Error checking for instruction files:", error);
      return false;
    }
  }
  getWelcomeViewContent(additionalMessage) {
    if (this.isLockedToCodingAgent) {
      const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : void 0;
      const providerIcon = contribution?.icon;
      const providerTitle = contribution?.welcomeTitle;
      const providerMessage = contribution?.welcomeMessage;
      const message = providerMessage ? new MarkdownString(providerMessage) : this._lockedAgent?.prefix === "@copilot " ? new MarkdownString(localize("copilotCodingAgentMessage", "This chat session will be forwarded to the {0} [coding agent]({1}) where work is completed in the background. ", this._lockedAgent.prefix, "https://aka.ms/coding-agent-docs") + DISCLAIMER, { isTrusted: true }) : new MarkdownString(localize("genericCodingAgentMessage", "This chat session will be forwarded to the {0} coding agent where work is completed in the background. ", this._lockedAgent?.prefix) + DISCLAIMER);
      return {
        title: providerTitle ?? localize("codingAgentTitle", "Delegate to {0}", this._lockedAgent?.prefix),
        message,
        icon: providerIcon ?? Codicon.sendToRemoteAgent,
        additionalMessage,
        useLargeIcon: !!providerIcon
      };
    }
    let title;
    if (this.input.currentModeKind === ChatModeKind.Ask) {
      title = localize("chatDescription", "Ask about your code");
    } else if (this.input.currentModeKind === ChatModeKind.Edit) {
      title = localize("editsTitle", "Edit in context");
    } else {
      title = localize("agentTitle", "Build with Agent");
    }
    return {
      title,
      message: new MarkdownString(DISCLAIMER),
      icon: Codicon.chatSparkle,
      additionalMessage
    };
  }
  async renderChatEditingSessionState() {
    if (!this.input) {
      return;
    }
    this.input.renderChatEditingSessionState(this._editingSession.get() ?? null);
  }
  async renderFollowups() {
    const lastItem = this.listWidget.lastItem;
    if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
      this.input.renderFollowups(lastItem.replyFollowups, lastItem);
    } else {
      this.input.renderFollowups(void 0, void 0);
    }
  }
  renderChatSuggestNextWidget() {
    if (this.lifecycleService.willShutdown) {
      return;
    }
    if (this._readOnly) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    if (this.isLockedToCodingAgent && !this._attachmentCapabilities.supportsHandOffs) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    const items = this.viewModel?.getItems() ?? [];
    if (!items.length) {
      return;
    }
    const lastItem = items[items.length - 1];
    const lastResponseComplete = lastItem && isResponseVM(lastItem) && lastItem.isComplete;
    if (!lastResponseComplete || lastItem.isCanceled) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    const modeInfo = lastItem.model.request?.modeInfo;
    let responseMode;
    const modes = this.input.currentChatModesObs.get();
    if (modeInfo?.modeInstructions?.name) {
      responseMode = modes.findModeByName(modeInfo.modeInstructions.name);
    } else {
      responseMode = this.input.currentModeObs.get();
    }
    const handoffs = responseMode?.handOffs?.get();
    if (responseMode && handoffs && handoffs.length > 0) {
      const permissionLevel = this.inputPart.currentModeInfo.permissionLevel;
      if (permissionLevel === ChatPermissionLevel.Autopilot) {
        const autoSendHandoff = handoffs.find((h) => h.send);
        if (autoSendHandoff) {
          this.handleNextPromptSelection(autoSendHandoff);
          return;
        }
      }
      const wasHidden = this.chatSuggestNextWidget.domNode.style.display === "none";
      this.chatSuggestNextWidget.render(responseMode);
      if (wasHidden) {
        this.telemetryService.publicLog2("chat.handoffWidgetShown", {
          agent: getModeNameForTelemetry(responseMode),
          handoffCount: handoffs.length
        });
      }
    } else {
      this.chatSuggestNextWidget.hide();
    }
    if (this.bodyDimension) {
      this.layout(this.bodyDimension.height, this.bodyDimension.width);
    }
  }
  handleNextPromptSelection(handoff, agentId, withAutopilot) {
    this.chatSuggestNextWidget.hide();
    if (withAutopilot) {
      this.inputPart.setPermissionLevel(ChatPermissionLevel.Autopilot);
    }
    const promptToUse = handoff.prompt;
    const currentMode = this.input.currentModeObs.get();
    const toMode = handoff.agent ? this.input.currentChatModesObs.get().findModeByName(handoff.agent) : void 0;
    this.telemetryService.publicLog2("chat.handoffClicked", {
      fromAgent: getModeNameForTelemetry(currentMode),
      toAgent: agentId || (toMode ? getModeNameForTelemetry(toMode) : ""),
      hasPrompt: Boolean(promptToUse),
      autoSend: Boolean(handoff.send)
    });
    this.executeHandoff(handoff, agentId).catch((e) => {
      const target = agentId ?? handoff.agent ?? "unknown";
      this.logService.error(`[Handoff] Failed to execute handoff '${handoff.label}' to '${target}'`, e);
    });
  }
  async executeHandoff(handoff, agentId) {
    this.chatSuggestNextWidget.hide();
    const promptToUse = handoff.prompt;
    if (agentId) {
      this.input.setValue(`@${agentId} ${promptToUse}`, false);
      this.input.focus();
      this.acceptInput().catch((e) => this.logService.error(`[Handoff] Failed to submit delegated handoff to '@${agentId}'`, e));
    } else if (handoff.agent) {
      const switched = await this._switchToAgentByName(handoff.agent);
      if (!switched) {
        this.logService.warn(`[Handoff] Did not execute handoff '${handoff.label}' to '${handoff.agent}' because switching agents was unsuccessful`);
        return;
      }
      const modelReady = handoff.model ? this.input.requestModelByQualifiedName([handoff.model]) : void 0;
      this.input.setValue(promptToUse, false);
      this.input.focus();
      if (handoff.send) {
        if (modelReady && !await modelReady) {
          return;
        }
        this.acceptInput().catch((e) => this.logService.error(`[Handoff] Failed to submit handoff to '${handoff.agent}'`, e));
      }
    }
  }
  async handleDelegationExitIfNeeded(sourceAgent, targetAgent) {
    if (!this._shouldExitAfterDelegation(sourceAgent, targetAgent)) {
      return;
    }
    this.logService.debug(`[Delegation] Will exit after delegation: sourceAgent=${sourceAgent?.id}, targetAgent=${targetAgent?.id}`);
    try {
      await this._handleDelegationExit();
    } catch (e) {
      this.logService.error("[Delegation] Failed to handle delegation exit", e);
    }
  }
  _shouldExitAfterDelegation(sourceAgent, targetAgent) {
    if (!targetAgent) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (no targetAgent)");
      return false;
    }
    if (!this.configurationService.getValue(ChatConfiguration.ExitAfterDelegation)) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (ExitAfterDelegation config disabled)");
      return false;
    }
    if (sourceAgent && sourceAgent.id === targetAgent.id) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (source and target agents are the same)");
      return false;
    }
    if (!isIChatViewViewContext(this.viewContext)) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (not in chat view context)");
      return false;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(targetAgent.id);
    if (!contribution) {
      this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (no contribution found for targetAgent.id=${targetAgent.id})`);
      return false;
    }
    if (contribution.canDelegate !== true) {
      this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (contribution.canDelegate=${contribution.canDelegate}, expected true)`);
      return false;
    }
    this.logService.debug("[Delegation] _shouldExitAfterDelegation: true");
    return true;
  }
  /**
   * Handles the exit of the panel chat when a delegation to another session occurs.
   * Waits for the response to complete and any pending confirmations to be resolved,
   * then clears the widget unless the final message is an error.
   */
  async _handleDelegationExit() {
    const viewModel = this.viewModel;
    if (!viewModel) {
      this.logService.debug("[Delegation] _handleDelegationExit: no viewModel, returning");
      return;
    }
    const parentSessionResource = viewModel.sessionResource;
    this.logService.debug(`[Delegation] _handleDelegationExit: parentSessionResource=${parentSessionResource.toString()}`);
    const checkIfShouldClear = () => {
      const items = viewModel.getItems();
      const lastItem = items[items.length - 1];
      if (lastItem && isResponseVM(lastItem) && lastItem.model && lastItem.isComplete && !lastItem.model.isPendingConfirmation.get()) {
        const hasError = Boolean(lastItem.result?.errorDetails);
        return !hasError;
      }
      return false;
    };
    if (checkIfShouldClear()) {
      this.logService.debug("[Delegation] Response complete, archiving session before clearing");
      await this.archiveLocalParentSession(parentSessionResource);
      await this.clear();
      return;
    }
    this.logService.debug("[Delegation] Waiting for response to complete...");
    const shouldClear = await new Promise((resolve) => {
      const disposable = viewModel.onDidChange(() => {
        const result = checkIfShouldClear();
        if (result) {
          cleanup();
          resolve(true);
        }
      });
      const timeout2 = setTimeout(() => {
        this.logService.debug("[Delegation] Timeout waiting for response to complete");
        cleanup();
        resolve(false);
      }, 3e4);
      const cleanup = () => {
        clearTimeout(timeout2);
        disposable.dispose();
      };
    });
    if (shouldClear) {
      this.logService.debug("[Delegation] Response completed, archiving session before clearing");
      await this.archiveLocalParentSession(parentSessionResource);
      await this.clear();
    } else {
      this.logService.debug("[Delegation] Not clearing (timeout or error)");
    }
  }
  async archiveLocalParentSession(sessionResource) {
    if (getChatSessionType(sessionResource) !== localChatSessionType && !IsSessionsWindowContext.getValue(this.contextKeyService)) {
      return;
    }
    this.logService.debug(`[Delegation] archiveLocalParentSession: archiving session ${sessionResource.toString()}`);
    await this.chatService.getSession(sessionResource)?.editingSession?.accept();
    const session = this.agentSessionsService.getSession(sessionResource);
    if (session) {
      session.setArchived(true);
      this.logService.debug("[Delegation] archiveLocalParentSession: session archived successfully");
    } else {
      this.logService.warn(`[Delegation] archiveLocalParentSession: session not found in agentSessionsService for ${sessionResource.toString()}`);
    }
  }
  /**
   * Mark the chat shown in this widget as read-only (non-interactive) or not.
   * Read-only chats hide the composer and expose a context key so mutating
   * actions (e.g. Start Over, Restore Checkpoint) are not offered.
   */
  setReadOnly(readOnly) {
    const wasReadOnly = this._readOnly;
    this._readOnly = readOnly;
    this._readOnlyContextKey.set(readOnly);
    if (readOnly) {
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.chatSuggestNextWidget.hide();
      if (this.hasInputFocus()) {
        if (this.listWidget.focusLastItem(true) < 0) {
          this.listWidget.focus();
        }
      }
    } else if (wasReadOnly) {
      this.renderChatSuggestNextWidget();
    }
    this.readOnlyBanner?.setVisible(readOnly);
    this.setInputVisible(!readOnly);
    this._applyRendererEditable(!readOnly);
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  /**
   * Applies the renderer's `editable` option, forcing it off while the chat is
   * read-only so the lock/unlock transitions can never re-enable request
   * editing on a read-only chat.
   */
  _applyRendererEditable(editable) {
    this.listWidget?.updateRendererOptions({ editable: editable && !this._readOnly });
  }
  /**
   * Show or hide the input part. Hidden inputs are removed from the DOM flow
   * unless they contain persistent content. Used to render read-only chats
   * without a composer while retaining input-adjacent status controls.
   */
  setInputVisible(visible) {
    const changed = this._inputVisible !== visible;
    this._inputVisible = visible;
    this._applyInputVisibility();
    if (changed && this.bodyDimension) {
      this._layoutListForInputHeight();
    }
  }
  _applyInputVisibility() {
    const inputElement = this.inputPartDisposable.value?.element;
    if (inputElement) {
      inputElement.classList.toggle("chat-input-hidden", !this._inputVisible);
      inputElement.style.display = "";
    }
  }
  setVisible(visible) {
    const wasVisible = this._visible;
    this._visible = visible;
    this.visibleChangeCount++;
    this.listWidget.setVisible(visible);
    this.input.setVisible(visible);
    if (visible) {
      if (!wasVisible) {
        this.visibilityTimeoutDisposable.value = disposableTimeout(() => {
          if (this._visible) {
            this.onDidChangeItems(true);
          }
        }, 0);
        this.visibilityAnimationFrameDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
          this._onDidShow.fire();
        });
      }
    } else if (wasVisible) {
      this._onDidHide.fire();
    }
  }
  createList(listContainer, options) {
    const overflowWidgetsContainer = document.createElement("div");
    overflowWidgetsContainer.classList.add("chat-overflow-widget-container", "monaco-editor");
    listContainer.append(overflowWidgetsContainer);
    this.listWidget = this._register(this.instantiationService.createInstance(
      ChatListWidget,
      listContainer,
      {
        rendererOptions: options,
        defaultElementHeight: this.viewOptions.defaultElementHeight ?? 200,
        overflowWidgetsDomNode: overflowWidgetsContainer,
        styles: {
          listForeground: this.styles.listForeground,
          listBackground: this.styles.listBackground
        },
        currentChatMode: () => this.input.currentModeKind,
        filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions) } : void 0,
        viewModel: this.viewModel,
        editorOptions: this.editorOptions,
        location: this.location,
        getSelectedModelRequestOptions: () => this.getSelectedModelRequestOptions(),
        getCurrentModeInfo: () => this.input.currentModeInfo
      }
    ));
    this._register(this.listWidget.onDidClickRequest(async (item) => {
      this.clickedRequest(item);
    }));
    this._register(this.listWidget.onDidRerender((item) => {
      if (isRequestVM(item.currentElement) && this.configurationService.getValue("chat.editRequests") !== "input") {
        if (!item.rowContainer.contains(this.inputContainer)) {
          item.requestTimestampContainer.before(this.inputContainer);
        }
        this.input.focus();
      }
    }));
    this._register(this.listWidget.onDidDispose(() => {
      this.focusedInputDOM.appendChild(this.inputContainer);
      this.input.focus();
    }));
    this._register(this.listWidget.onDidFocusOutside(() => {
      this.finishedEditing();
    }));
    this._register(this.listWidget.onDidClickFollowup((item) => {
      this.acceptInput(item.message);
    }));
    this._register(this.listWidget.onDidChangeContentHeight(() => {
      this._onDidChangeContentHeight.fire();
    }));
    this._register(this.listWidget.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
    this._register(this.listWidget.onDidScroll(() => {
      this._onDidScroll.fire();
    }));
  }
  startEditing(requestId) {
    if (this._readOnly) {
      return;
    }
    const editedRequest = this.listWidget.getTemplateDataForRequestId(requestId);
    if (editedRequest) {
      this.clickedRequest(editedRequest);
    }
  }
  clickedRequest(item) {
    const currentElement = item.currentElement;
    if (isRequestVM(currentElement) && !this.viewModel?.editing) {
      const requests = this.viewModel?.model.getRequests();
      if (!requests || !this.viewModel?.sessionResource) {
        return;
      }
      if (this.viewModel?.model.checkpoint) {
        this.recentlyRestoredCheckpoint = true;
      }
      this.viewModel?.model.setCheckpoint(currentElement.id);
      const currentContext = [];
      const addedContextIds = /* @__PURE__ */ new Set();
      const addToContext = (entry) => {
        const dedupKey = entry.range ? `${entry.id}:${entry.range.start}-${entry.range.endExclusive}` : entry.id;
        if (addedContextIds.has(dedupKey) || isWorkspaceVariableEntry(entry)) {
          return;
        }
        if ((isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) && entry.automaticallyAdded) {
          return;
        }
        addedContextIds.add(dedupKey);
        currentContext.push(entry);
      };
      for (let i = requests.length - 1; i >= 0; i -= 1) {
        const request = requests[i];
        if (request.id === currentElement.id) {
          request.setShouldBeBlocked(false);
          request.attachedContext?.forEach(addToContext);
        }
      }
      currentElement.variables.forEach(addToContext);
      this.viewModel?.setEditing(currentElement);
      if (item?.contextKeyService) {
        ChatContextKeys.currentlyEditing.bindTo(item.contextKeyService).set(true);
      }
      const isEditingSentRequest = currentElement.pendingKind === void 0 ? ChatContextKeys.EditingRequestType.Sent : currentElement.pendingKind === ChatRequestQueueKind.Queued ? ChatContextKeys.EditingRequestType.Queue : ChatContextKeys.EditingRequestType.Steer;
      const isInput = this.configurationService.getValue("chat.editRequests") === "input";
      this.inputPart?.setEditing(!!this.viewModel?.editing && isInput, isEditingSentRequest);
      if (!isInput) {
        this.inputContainer = dom.$(".chat-edit-input-container");
        item.requestTimestampContainer.before(this.inputContainer);
        this.createInput(this.inputContainer);
        this.input.setChatMode(this.inputPart.currentModeObs.get().id);
        this.input.setPermissionLevel(this.inputPart.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
        this.input.setEditing(true, isEditingSentRequest);
        this._onDidChangeActiveInputEditor.fire();
      } else {
        this.inputPart.element.classList.add("editing");
      }
      if (currentElement.modelId) {
        void this.input.requestModelByIdentifier(currentElement.modelId);
      }
      this.inputPart.toggleChatInputOverlay(!isInput);
      if (currentContext.length > 0) {
        this.input.attachmentModel.addContext(...currentContext);
      }
      this.inputPart.dnd.setDisabledOverlay(!isInput);
      this.input.renderAttachedContext();
      this.input.setValue(currentElement.messageText, false);
      const dynamicVariableModel = this.getContrib(ChatDynamicVariableModel.ID);
      const editorModel = this.input.inputEditor.getModel();
      if (dynamicVariableModel && editorModel) {
        const modelTextLength = editorModel.getValueLength();
        for (const entry of currentContext) {
          if (entry.range) {
            if (entry.range.start >= entry.range.endExclusive) {
              continue;
            }
            if (entry.range.start < 0 || entry.range.endExclusive > modelTextLength) {
              continue;
            }
            const startPos = editorModel.getPositionAt(entry.range.start);
            const endPos = editorModel.getPositionAt(entry.range.endExclusive);
            dynamicVariableModel.addReference({
              id: entry.id,
              range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              data: entry.value,
              fullName: entry.fullName,
              icon: entry.icon,
              modelDescription: entry.modelDescription,
              isFile: entry.kind === "file",
              isDirectory: entry.kind === "directory"
            });
          }
        }
      }
      this._editingAutoScrollHold.value = this.listWidget.acquireAutoScrollHold();
      this.onDidChangeItems();
      this.input.inputEditor.focus();
      this._register(this.inputPart.onDidClickOverlay(() => {
        if (this.viewModel?.editing && this.configurationService.getValue("chat.editRequests") !== "input") {
          this.finishedEditing();
        }
      }));
      if (!isInput) {
        this._register(this.inlineInputPart.inputEditor.onDidChangeModelContent(() => {
          this.listWidget.scrollToCurrentItem(currentElement);
        }));
        this._register(this.inlineInputPart.inputEditor.onDidChangeCursorSelection((e) => {
          this.listWidget.scrollToCurrentItem(currentElement);
        }));
      }
    }
    this.telemetryService.publicLog2("chat.startEditingRequests", {
      editRequestType: this.configurationService.getValue("chat.editRequests")
    });
  }
  finishedEditing(completedEdit) {
    this._editingAutoScrollHold.clear();
    const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
    if (this.recentlyRestoredCheckpoint) {
      this.recentlyRestoredCheckpoint = false;
    } else {
      this.viewModel?.model.setCheckpoint(void 0);
    }
    this.inputPart.dnd.setDisabledOverlay(false);
    if (editedRequest?.contextKeyService) {
      ChatContextKeys.currentlyEditing.bindTo(editedRequest.contextKeyService).set(false);
    }
    const isInput = this.configurationService.getValue("chat.editRequests") === "input";
    if (!isInput) {
      this.inputPart?.toggleChatInputOverlay(false);
      try {
        if (editedRequest?.rowContainer?.contains(this.inputContainer)) {
          editedRequest.rowContainer.removeChild(this.inputContainer);
        } else if (this.inputContainer.parentElement) {
          this.inputContainer.parentElement.removeChild(this.inputContainer);
        }
      } catch (e) {
        this.logService.error("Error occurred while finishing editing:", e);
      }
      this.inputContainer = dom.$(".empty-chat-state");
      this.input.dispose();
    }
    if (isInput) {
      this.inputPart.element.classList.remove("editing");
    }
    this.viewModel?.setEditing(void 0);
    this.inputPart?.setEditing(false, void 0);
    if (!isInput) {
      this._onDidChangeActiveInputEditor.fire();
    }
    this.onDidChangeItems();
    this.telemetryService.publicLog2("chat.editRequestsFinished", {
      editRequestType: this.configurationService.getValue("chat.editRequests"),
      editCanceled: !completedEdit
    });
    this.inputPart.focus();
  }
  getWidgetViewKindTag() {
    if (!this.viewContext) {
      return "editor";
    } else if (isIChatViewViewContext(this.viewContext)) {
      return "view";
    } else {
      return "quick";
    }
  }
  createInput(container, options) {
    const commonConfig = {
      renderFollowups: options?.renderFollowups ?? true,
      renderStyle: options?.renderStyle === "minimal" ? "compact" : options?.renderStyle,
      renderInputToolbarBelowInput: options?.renderInputToolbarBelowInput ?? false,
      menus: {
        executeToolbar: MenuId.ChatExecute,
        telemetrySource: "chatWidget",
        ...this.viewOptions.menus
      },
      editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
      enableImplicitContext: this.viewOptions.enableImplicitContext,
      renderWorkingSet: this.viewOptions.enableWorkingSet === "explicit",
      supportsChangingModes: this.viewOptions.supportsChangingModes,
      dndContainer: this.viewOptions.dndContainer,
      inputEditorMinLines: this.viewOptions.inputEditorMinLines,
      inputEditorMaxHeight: this.viewOptions.inputEditorMaxHeight,
      deferredNotificationsEnabled: this.viewOptions.deferredNotificationsEnabled,
      widgetViewKindTag: this.getWidgetViewKindTag(),
      defaultMode: this.viewOptions.defaultMode,
      sessionTypePickerDelegate: this.viewOptions.sessionTypePickerDelegate,
      modelPickerSessionType: this.viewOptions.modelPickerSessionType,
      workspacePickerDelegate: this.viewOptions.workspacePickerDelegate,
      isSessionsWindow: this.viewOptions.isSessionsWindow,
      onDidChangeModelPickerVisibility: this.viewOptions.onDidChangeModelPickerVisibility,
      inputPickerPosition: this.viewOptions.inputPickerPosition,
      inputPickerContainer: this.viewOptions.inputPickerContainer,
      inputPickerAnchor: this.viewOptions.inputPickerAnchor,
      inputPickerOpenOnMouseUp: this.viewOptions.inputPickerOpenOnMouseUp,
      contextPicker: this.viewOptions.contextPicker
    };
    if (this.viewModel?.editing) {
      const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
      const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
      this.inlineInputPartDisposable.value = scopedInstantiationService.createInstance(
        ChatInputPart,
        this.location,
        commonConfig,
        this.styles,
        true
      );
      this.inlinePasteTargetRegistration.value = this.chatPasteTargetService.registerTarget(this.inlineInputPart.inputUri, this.pasteTarget);
    } else {
      this.inputPartDisposable.value = this.instantiationService.createInstance(
        ChatInputPart,
        this.location,
        commonConfig,
        this.styles,
        false
      );
      this.mainPasteTargetRegistration.value = this.chatPasteTargetService.registerTarget(this.inputPart.inputUri, this.pasteTarget);
      this._register(autorun((reader) => {
        this.inputPart.height.read(reader);
        if (!this.listWidget) {
          return;
        }
        if (this.bodyDimension) {
          this._layoutListForInputHeight();
        }
        this._onDidChangeContentHeight.fire();
      }));
    }
    this.input.render(container, "", this);
    this._gettingStartedTip.value = this.instantiationService.createInstance(
      ChatInputTipPresenter,
      {
        container: this.input.gettingStartedTipContainerElement,
        isEligible: () => this.isGettingStartedTipEligible(),
        focusInput: () => this.focusInput()
      },
      this.input.noticeHost
    );
    this._applyInputVisibility();
    if (this.bodyDimension?.width) {
      this.input.layout(this.bodyDimension.width);
    }
    this._register(this.input.onDidLoadInputState(() => {
      this.refreshParsedInput();
    }));
    this._register(this.input.onDidFocus(() => this._onDidFocus.fire()));
    this._register(this.input.onDidAcceptFollowup((e) => {
      if (!this.viewModel) {
        return;
      }
      let msg = "";
      if (e.followup.agentId && e.followup.agentId !== this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind)?.id) {
        const agent = this.chatAgentService.getAgent(e.followup.agentId);
        if (!agent) {
          return;
        }
        this.lastSelectedAgent = agent;
        msg = `${chatAgentLeader}${agent.name} `;
        if (e.followup.subCommand) {
          msg += `${chatSubcommandLeader}${e.followup.subCommand} `;
        }
      } else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand, getChatSessionType(this.viewModel.model.sessionResource))) {
        msg = `${chatSubcommandLeader}${e.followup.subCommand} `;
      }
      msg += e.followup.message;
      this.acceptInput(msg);
      if (!e.response) {
        return;
      }
      this.chatService.notifyUserAction({
        sessionResource: this.viewModel.sessionResource,
        requestId: e.response.requestId,
        agentId: e.response.agent?.id,
        command: e.response.slashCommand?.name,
        result: e.response.result,
        action: {
          kind: "followUp",
          followup: e.followup
        }
      });
    }));
    this._register(this.inputEditor.onDidChangeModelContent(() => {
      this.parsedChatRequest = void 0;
      this.updateChatInputContext();
    }));
    this._register(this.chatAgentService.onDidChangeAgents(() => {
      this.parsedChatRequest = void 0;
      this.renderWelcomeViewContentIfNeeded();
    }));
    this._register(this.input.onDidChangeCurrentChatMode(() => {
      this.renderWelcomeViewContentIfNeeded();
      this.refreshParsedInput();
      this.renderFollowups();
      this.renderChatSuggestNextWidget();
    }));
    const foregroundSessionCountContextKeys = /* @__PURE__ */ new Set([ChatContextKeys.foregroundSessionCount.key]);
    const hasByokModelsContextKeys = /* @__PURE__ */ new Set([ChatEntitlementContextKeys.hasByokModels.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(foregroundSessionCountContextKeys) && this.isEmpty()) {
        this.renderGettingStartedTipIfNeeded();
      }
      if (e.affectsSome(hasByokModelsContextKeys)) {
        this.updateChatViewVisibility();
      }
    }));
    let previousModelIdentifier;
    this._register(autorun((reader) => {
      const modelIdentifier = this.inputPart.selectedLanguageModel.read(reader)?.identifier;
      if (previousModelIdentifier === void 0) {
        previousModelIdentifier = modelIdentifier;
        return;
      }
      if (previousModelIdentifier === modelIdentifier) {
        return;
      }
      previousModelIdentifier = modelIdentifier;
      if (!this._gettingStartedTip.value?.current) {
        return;
      }
      this.chatTipService.getWelcomeTip(this.contextKeyService);
    }));
    this._register(autorun((r) => {
      const toolSetIds = /* @__PURE__ */ new Set();
      const toolIds = /* @__PURE__ */ new Set();
      for (const [entry, enabled] of this.input.selectedToolsModel.entriesMap.read(r)) {
        if (enabled) {
          if (isToolSet(entry)) {
            toolSetIds.add(entry.id);
          } else {
            toolIds.add(entry.id);
          }
        }
      }
      const disabledTools = this.input.attachmentModel.attachments.filter((a) => a.kind === "tool" && !toolIds.has(a.id) || a.kind === "toolset" && !toolSetIds.has(a.id)).map((a) => a.id);
      this.input.attachmentModel.updateContext(disabledTools, Iterable.empty());
      this.refreshParsedInput();
    }));
  }
  onDidStyleChange() {
    this.container.style.setProperty("--vscode-interactive-result-editor-background-color", this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? "");
    this.container.style.setProperty("--vscode-interactive-session-foreground", this.editorOptions.configuration.foreground?.toString() ?? "");
    this.container.style.setProperty("--vscode-chat-list-background", this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? "");
  }
  /**
   * Updates the widget's color styles after construction. Propagates the new
   * `listForeground`/`listBackground` to the list widget, pushes the new color
   * tokens into `editorOptions` so subscribers (code blocks, result/input editor
   * backgrounds, container CSS variables) pick them up via `onDidChange`, and
   * refreshes the CSS variables the chat container exposes for stylesheet rules.
   */
  setStyles(styles) {
    const oldStyles = this.styles;
    this.styles = styles;
    const listColorsChanged = oldStyles.listBackground !== styles.listBackground || oldStyles.listForeground !== styles.listForeground;
    if (listColorsChanged) {
      this.listWidget?.setStyles({
        listForeground: styles.listForeground,
        listBackground: styles.listBackground
      });
    }
    const editorColorsChanged = oldStyles.listForeground !== styles.listForeground || oldStyles.inputEditorBackground !== styles.inputEditorBackground || oldStyles.resultEditorBackground !== styles.resultEditorBackground;
    if (editorColorsChanged && this.container) {
      this.editorOptions.setColors(styles.listForeground, styles.inputEditorBackground, styles.resultEditorBackground);
    }
  }
  setModel(model) {
    if (!this.container || !this.inputPart) {
      this.logService.warn("ChatWidget#setModel called before render() completed");
      return;
    }
    const currentInputModel = this.viewModel?.model?.inputModel?.state?.get();
    if (!model) {
      logChangesToStateModel(this.viewModel?.model?.inputModel, `ChatWidget.setModel to empty, old ${this.viewModel?.sessionResource.toString()}`, void 0, currentInputModel, this.logService);
      this.inputPart.flushInputStateToModel();
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.clearGettingStartedTip();
      this.viewModel = void 0;
      this.updateWorkingProgressBorder();
      this.onDidChangeItems();
      this._hasPendingRequestsContextKey.set(false);
      if (!this.viewOptions.isSessionsWindow) {
        this.setReadOnly(false);
      }
      return;
    }
    if (isEqual(model.sessionResource, this.viewModel?.sessionResource)) {
      return;
    }
    logChangesToStateModel(model.inputModel, `ChatWidget.setModel new ${model.sessionResource.toString()}, old ${this.viewModel?.sessionResource.toString()}`, model.inputModel.state.get(), currentInputModel, this.logService);
    if (this.viewModel?.editing) {
      this.finishedEditing();
    }
    this.inputPart?.clearTodoListWidget(model.sessionResource, false);
    this.inputPart?.clearArtifactsWidget();
    this.chatSuggestNextWidget.hide();
    this.chatTipService.resetSession();
    this.clearGettingStartedTip();
    this.inputPart.setInputModel(model.inputModel, model.getRequests().length === 0, model.sessionResource);
    this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, void 0);
    if (!this.viewOptions.isSessionsWindow) {
      this.viewModelDisposables.add(autorun((reader) => this.setReadOnly(model.isReadOnly.read(reader))));
    }
    this.listWidget.setViewModel(this.viewModel);
    if (this._lockedAgent) {
      let placeholder = this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id)?.inputPlaceholder;
      if (!placeholder) {
        placeholder = localize("chat.input.placeholder.lockedToAgent", "Chat with {0}", this._lockedAgent.displayName || this._lockedAgent.name);
      }
      this.viewModel.setInputPlaceholder(placeholder);
      this.inputEditor.updateOptions({ placeholder });
    } else if (this.viewModel.inputPlaceholder) {
      this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
    }
    this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange), ((events) => {
      if (!this.viewModel || this._store.isDisposed) {
        return;
      }
      this.requestInProgress.set(this.viewModel.model.requestInProgress.get());
      this.hasActiveRequest.set(this.viewModel.model.hasActiveRequest.get());
      this.updateWorkingProgressBorder();
      if (events?.some((e) => e?.kind === "changePlaceholder")) {
        this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
      }
      this.onDidChangeItems();
      if (events?.some((e) => e?.kind === "addRequest") && this.visible && !this.listWidget.isAutoScrollHeld) {
        this.listWidget.scrollToEnd();
      }
      this._onDidChangeFindableContent.fire();
    })));
    this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.viewModel = void 0;
      this.updateWorkingProgressBorder();
      this.onDidChangeItems();
    }));
    this._sessionIsEmptyContextKey.set(model.getRequests().length === 0);
    const updateSupportsFork = () => {
      const supportsFork = this.chatSessionsService.sessionSupportsFork(model.sessionResource);
      this._chatSessionSupportsForkContextKey.set(supportsFork);
      this.listWidget?.updateRendererOptions({ supportsFork });
    };
    updateSupportsFork();
    this.viewModelDisposables.add(this.chatSessionsService.onDidChangeAvailability(() => updateSupportsFork()));
    this._sessionHasDebugDataContextKey.set(this.chatDebugService.getEvents(model.sessionResource).length > 0);
    let lastSteeringCount = 0;
    const updatePendingRequestKeys = (announceSteering) => {
      const pendingRequests = model.getPendingRequests();
      const pendingCount = pendingRequests.length;
      this._hasPendingRequestsContextKey.set(pendingCount > 0);
      const steeringCount = pendingRequests.filter((pending) => pending.kind === ChatRequestQueueKind.Steering).length;
      if (announceSteering && steeringCount > 0 && lastSteeringCount === 0) {
        status(localize("chat.pendingRequests.steeringQueued", "Steering"));
      }
      lastSteeringCount = steeringCount;
    };
    updatePendingRequestKeys(false);
    this.viewModelDisposables.add(model.onDidChangePendingRequests(() => updatePendingRequestKeys(true)));
    this.refreshParsedInput();
    this.viewModelDisposables.add(model.onDidChange((e) => {
      if (e.kind === "setAgent") {
        this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
        this._updateAgentCapabilitiesContextKeys(e.agent);
      }
      if (e.kind === "addRequest") {
        this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, false);
        this._sessionIsEmptyContextKey.set(false);
        this.chatSuggestNextWidget.hide();
      }
      if (e.kind === "removeRequest") {
        this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
        this.chatSuggestNextWidget.hide();
        this._sessionIsEmptyContextKey.set((this.viewModel?.model.getRequests().length ?? 0) === 0);
      }
      if (e.kind === "completedRequest") {
        const lastRequest = this.viewModel?.model.getRequests().at(-1);
        const wasCancelled = lastRequest?.response?.isCanceled ?? false;
        if (wasCancelled) {
          this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
        }
        this.renderChatSuggestNextWidget();
        if (this.visible && this.viewModel?.sessionResource) {
          this.agentSessionsService.getSession(this.viewModel.sessionResource)?.setRead(true);
        }
      }
    }));
    if (this.listWidget && this.visible) {
      this.onDidChangeItems();
      this.listWidget.scrollToEnd();
    }
    this.renderChatSuggestNextWidget();
    this.updateChatInputContext();
    this.input.renderChatTodoListWidget(this.viewModel.sessionResource);
    this.input.renderArtifactsWidget(this.viewModel.sessionResource);
  }
  setLoading(isLoading) {
    this._isLoading = isLoading;
    this.renderGettingStartedTipIfNeeded();
  }
  getFocus() {
    return this.listWidget.getFocus()[0] ?? void 0;
  }
  reveal(item, relativeTop) {
    this.listWidget.reveal(item, relativeTop);
  }
  /**
   * The top offset of an item in transcript content space (same space as
   * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list.
   * Virtualization-safe for off-screen items (reads the layout height model).
   */
  getElementTop(item) {
    return this.listWidget.getElementTop(item);
  }
  focus(item) {
    if (!this.listWidget.hasElement(item)) {
      return;
    }
    this.listWidget.focusItem(item);
  }
  setInputPlaceholder(placeholder) {
    this.viewModel?.setInputPlaceholder(placeholder);
  }
  resetInputPlaceholder() {
    this.viewModel?.resetInputPlaceholder();
  }
  setInput(value = "") {
    this.input.setValue(value, false);
    this.refreshParsedInput();
  }
  getInput() {
    return this.input.inputEditor.getValue();
  }
  getContrib(id) {
    return this.contribs.find((c) => c.id === id);
  }
  // Coding agent locking methods
  lockToCodingAgent(name, displayName, agentId, agentHostProviderId) {
    if (this._lockedAgent?.id === agentId && this._lockedAgent.name === name && this._lockedAgent.displayName === displayName && this._lockedAgent.agentHostProviderId === agentHostProviderId) {
      return;
    }
    this._lockedAgent = {
      id: agentId,
      name,
      prefix: `@${name} `,
      displayName,
      agentHostProviderId
    };
    this._lockedToCodingAgentContextKey.set(true);
    this._lockedCodingAgentIdContextKey.set(agentId);
    this._chatIsAgentHostSessionContextKey.set(!!agentHostProviderId);
    this._chatAgentHostProviderIdContextKey.set(agentHostProviderId ?? "");
    this._updateAgentHostWorkingDirectoryContextKeys(agentHostProviderId);
    this.renderWelcomeViewContentIfNeeded();
    const agent = this.chatAgentService.getAgent(agentId);
    this._updateAgentCapabilitiesContextKeys(agent);
    const supportsCheckpoints = this._attachmentCapabilities.supportsCheckpoints ?? false;
    this.listWidget?.updateRendererOptions({ restorable: supportsCheckpoints, editable: supportsCheckpoints && !this._readOnly, noFooter: false, progressMessageAtBottomOfResponse: true });
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  unlockFromCodingAgent() {
    if (!this._lockedAgent) {
      return;
    }
    this._lockedAgent = void 0;
    this._lockedToCodingAgentContextKey.set(false);
    this._lockedCodingAgentIdContextKey.set("");
    this._chatIsAgentHostSessionContextKey.set(false);
    this._chatAgentHostProviderIdContextKey.set("");
    this._chatAgentHostHasImmutablePrimaryWorkingDirectoryContextKey.set(false);
    this._chatSessionSupportsForkContextKey.set(false);
    this._updateAgentCapabilitiesContextKeys(void 0);
    this.renderWelcomeViewContentIfNeeded();
    if (this.viewModel) {
      this.viewModel.resetInputPlaceholder();
    }
    this.inputEditor?.updateOptions({ placeholder: void 0 });
    this.listWidget?.updateRendererOptions({ restorable: true, editable: !this._readOnly, progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask });
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  get isLockedToCodingAgent() {
    return !!this._lockedAgent;
  }
  get lockedAgentId() {
    return this._lockedAgent?.id;
  }
  logInputHistory() {
    this.input.logInputHistory();
  }
  async acceptInput(query, options) {
    if (this._readOnly || this.input.hasPendingProgrammaticModelSelection) {
      return void 0;
    }
    if (!options?.preserveInput) {
      await stopDictationForEditor(this.inputEditor);
    }
    if (this.viewModel) {
      markChat(this.viewModel.sessionResource, ChatPerfMark.RequestStart);
    }
    return this._acceptInput(query ? { query } : void 0, options);
  }
  async rerunLastRequest() {
    if (this._readOnly || !this.viewModel) {
      return;
    }
    const sessionResource = this.viewModel.sessionResource;
    const lastRequest = this.chatService.getSession(sessionResource)?.getRequests().at(-1);
    if (!lastRequest) {
      return;
    }
    const options = {
      attempt: lastRequest.attempt + 1,
      location: this.location,
      ...this.getSelectedModelRequestOptions(),
      modeInfo: this.input.currentModeInfo
    };
    const result = await this.chatService.resendRequest(lastRequest, options);
    this.logThinkingStyleUsage("rerun");
    return result;
  }
  getConfiguredThinkingStyle() {
    const thinkingStyle = this.configurationService.getValue(ChatConfiguration.ThinkingStyle);
    switch (thinkingStyle) {
      case ThinkingDisplayMode.Collapsed:
      case ThinkingDisplayMode.CollapsedPreview:
      case ThinkingDisplayMode.FixedScrolling:
        return thinkingStyle;
      default:
        return ThinkingDisplayMode.FixedScrolling;
    }
  }
  logThinkingStyleUsage(requestKind) {
    this.telemetryService.publicLog2("chat.thinkingStyleUsage", {
      thinkingStyle: this.getConfiguredThinkingStyle(),
      location: this.location,
      requestKind
    });
  }
  _cancelGoalSummary() {
    this._goalSummaryTokenSource?.dispose(true);
    this._goalSummaryTokenSource = void 0;
  }
  _maybeStartGoalSummary(prompt) {
    const inputPart = this.inputPartDisposable.value;
    if (!inputPart) {
      return;
    }
    const sessionResource = this.viewModel?.model.sessionResource;
    const isLocalHarness = !!sessionResource && getChatSessionType(sessionResource) === localChatSessionType;
    const permissionLevel = inputPart.currentModeInfo?.permissionLevel;
    const goalModeOn = this.configurationService.getValue(ChatConfiguration.AutopilotAdvancedEnabled) === true;
    if (!isLocalHarness || permissionLevel !== ChatPermissionLevel.Autopilot || !goalModeOn) {
      this._cancelGoalSummary();
      inputPart.clearGoalBanner();
      return;
    }
    this._goalBannerDismissedForCurrentRequest = false;
    this._goalBannerDismissListener.value = inputPart.onDidDismissGoalBanner(() => {
      this._goalBannerDismissedForCurrentRequest = true;
      this._cancelGoalSummary();
    });
    this._cancelGoalSummary();
    const cts = new CancellationTokenSource();
    this._goalSummaryTokenSource = cts;
    inputPart.showGoalBannerLoading();
    this.chatGoalSummaryService.summarize(prompt, cts.token).then((summary) => {
      if (cts.token.isCancellationRequested || this._goalBannerDismissedForCurrentRequest) {
        return;
      }
      const current = this.inputPartDisposable.value;
      if (!current) {
        return;
      }
      if (summary) {
        current.setGoalBanner(summary);
      } else {
        current.clearGoalBanner();
      }
    }, () => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.inputPartDisposable.value?.clearGoalBanner();
    });
  }
  /**
   * @returns `false` when the prompt metadata requested an agent switch that the
   * user cancelled, signalling that input submission should be aborted.
   */
  async _applyPromptFileIfSet(requestInput, sessionResource) {
    const agentSlashPromptPart = this.parsedInput.parts.find((r) => r instanceof ChatRequestSlashPromptPart);
    if (!agentSlashPromptPart) {
      return true;
    }
    this.chatTipService.recordSlashCommandUsage(agentSlashPromptPart.name);
    const slashCommand = await this.customizationHarnessService.resolvePromptSlashCommand(agentSlashPromptPart.name, sessionResource, CancellationToken.None);
    if (!slashCommand) {
      return true;
    }
    const parseResult = slashCommand.parsedPromptFile;
    const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
    const toolReferences = this.toolsService.toToolReferences(refs);
    requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, void 0, true, toolReferences));
    const promptRunEvent = {
      storage: slashCommand.storage
    };
    if (slashCommand.extension) {
      promptRunEvent.extensionId = slashCommand.extension.identifier.value;
      promptRunEvent.promptName = slashCommand.name;
    } else {
      promptRunEvent.promptNameHash = hash(slashCommand.name).toString(16);
    }
    this.telemetryService.publicLog2("chat.promptRun", promptRunEvent);
    if (parseResult.header) {
      const applied = await this._applyPromptMetadata(parseResult.header, requestInput);
      if (!applied) {
        return false;
      }
    }
    return true;
  }
  async _acceptInput(query, options = {}) {
    if (!query && this.input.generating) {
      const generatingAutoSubmitWindow = 500;
      const start = Date.now();
      await this.input.generating;
      if (Date.now() - start > generatingAutoSubmitWindow) {
        return;
      }
    }
    while (!this._viewModel && !this._store.isDisposed) {
      await Event.toPromise(this.onDidChangeViewModel, this._store);
    }
    if (!this.viewModel) {
      return;
    }
    let savedBeforeSend = false;
    if (this.viewOptions.submitHandler) {
      const inputValue2 = !query ? this.getInput() : query.query;
      await saveAllBeforeChatSend(this.configurationService, this.editorService);
      savedBeforeSend = true;
      const attachedContext2 = this.input.getAttachedContext().asArray();
      const handled = await this.viewOptions.submitHandler(inputValue2, this.input.currentModeKind, attachedContext2, options.isVoiceModeInput);
      if (handled) {
        return;
      }
    }
    const isUserQuery = !query;
    const inputValue = isUserQuery ? this.getInput() : query.query;
    if (this.viewModel.model.hasActiveRequest.get() && await this._tryExecuteImmediateSlashCommand(inputValue, isUserQuery ? this.parsedInput : void 0)) {
      this.setInput("");
      return;
    }
    if (isUserQuery) {
      const preSubmitResult = await this.chatSubmitRequestHandlerService.tryHandle({
        sessionResource: this.viewModel.sessionResource,
        input: inputValue
      });
      if (preSubmitResult) {
        this.setInput("");
        return;
      }
    }
    if (!savedBeforeSend) {
      await saveAllBeforeChatSend(this.configurationService, this.editorService);
    }
    if (!options.preserveInput) {
      this._onDidAcceptInput.fire();
    }
    this.listWidget.setScrollLock(this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll));
    const requestInputs = {
      input: inputValue,
      // preserveInput means the input box holds an unrelated draft, so its
      // attachments belong to that draft and must not be sent with this query.
      attachedContext: options?.preserveInput ? new ChatRequestVariableSet() : options?.enableImplicitContext === false ? this.input.getAttachedContext() : this.input.getAttachedAndImplicitContext()
    };
    const attachedContext = this._getAttachedContextForConcurrentSlashCommand(options.preserveInput);
    if (await this._executeSlashCommandDuringRequest(requestInputs.input, { attachedContext }, isUserQuery, options.preserveFocus)) {
      return;
    }
    const isEditing = this.viewModel?.editing;
    const isInlineEdit = isEditing && this.configurationService.getValue("chat.editRequests") !== "input";
    const editedModelRequestOptions = isInlineEdit ? this.getSelectedModelRequestOptions() : void 0;
    const editedModeKind = isInlineEdit ? this.input.currentModeKind : void 0;
    const editedModeInfo = isInlineEdit ? this.input.currentModeInfo : void 0;
    const editedModeRequestOptions = isInlineEdit ? this.getModeRequestOptions() : void 0;
    const editedInstructionRouting = isInlineEdit ? this._getInstructionRouting() : void 0;
    let cancelledCurrentRequest = false;
    if (isEditing) {
      this.inputPart?.clearToolConfirmationCarousel();
      const editingPendingRequest = this.viewModel.editing.pendingKind;
      if (editingPendingRequest !== void 0) {
        const editingRequestId = this.viewModel.editing.id;
        this.chatService.removePendingRequest(this.viewModel.sessionResource, editingRequestId);
        if (!options.cancelCurrentRequest) {
          options.queue ??= editingPendingRequest;
        }
      } else {
        await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-editing");
        cancelledCurrentRequest = true;
        options.queue = void 0;
      }
      const preserveCheckpoint = this._lockedAgent && !!this._attachmentCapabilities.supportsCheckpoints;
      if (preserveCheckpoint) {
        this.recentlyRestoredCheckpoint = true;
      }
      this.finishedEditing(true);
      if (!preserveCheckpoint) {
        this.viewModel.model?.setCheckpoint(void 0);
      }
    }
    const model = this.viewModel.model;
    if (options.cancelCurrentRequest && model.requestInProgress.get() && !cancelledCurrentRequest) {
      await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-stopAndSend");
      cancelledCurrentRequest = true;
      options.queue = void 0;
    }
    const requestInProgress = model.requestInProgress.get();
    if (!options.cancelCurrentRequest && model.requestNeedsInput.get() && !model.getPendingRequests().length) {
      await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-needsInput");
      options.queue ??= ChatRequestQueueKind.Queued;
    }
    if (requestInProgress && !options.cancelCurrentRequest) {
      options.queue ??= ChatRequestQueueKind.Queued;
    }
    if (!requestInProgress && !isEditing && !await this.confirmPendingRequestsBeforeSend(model, options)) {
      return;
    }
    if (!options.preserveInput) {
      const promptApplied = await this._applyPromptFileIfSet(requestInputs, this.viewModel.sessionResource);
      if (!promptApplied) {
        return;
      }
    }
    if (this.viewOptions.enableWorkingSet !== void 0 && resolveEditedRequestSelection(editedModeKind, this.input.currentModeKind) === ChatModeKind.Edit) {
      const uniqueWorkingSetEntries = new ResourceSet();
      const editingSessionAttachedContext = requestInputs.attachedContext;
      const previousRequests = this.viewModel.model.getRequests();
      for (const request of previousRequests) {
        for (const variable of request.variableData.variables) {
          if (URI.isUri(variable.value) && variable.kind === "file") {
            const uri = variable.value;
            if (!uniqueWorkingSetEntries.has(uri)) {
              editingSessionAttachedContext.add(variable);
              uniqueWorkingSetEntries.add(variable.value);
            }
          }
        }
      }
      requestInputs.attachedContext = editingSessionAttachedContext;
      this.telemetryService.publicLog2("chatEditing/workingSetSize", { originalSize: uniqueWorkingSetEntries.size, actualSize: uniqueWorkingSetEntries.size });
    }
    this.input.validateAgentMode();
    if (this.viewModel.model.checkpoint) {
      const requests = this.viewModel.model.getRequests();
      for (let i = requests.length - 1; i >= 0; i -= 1) {
        const request = requests[i];
        if (request.shouldBeBlocked.get() || request === this.viewModel.model.checkpoint) {
          this.chatService.removeRequest(this.viewModel.sessionResource, request.id);
        }
      }
      this.viewModel.model.setCheckpoint(void 0);
    }
    const resolvedImageVariables = await this._resolveDirectoryImageAttachments(requestInputs.attachedContext.asArray());
    const submittedSessionResource = this.viewModel.sessionResource;
    const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : void 0;
    const autoAttachEnabled = contribution ? contribution.autoAttachReferences === true : true;
    const modeKind = resolveEditedRequestSelection(editedModeKind, this.input.currentModeKind);
    const modeInfo = resolveEditedRequestSelection(editedModeInfo, this.input.currentModeInfo);
    const selectedModelRequestOptions = resolveEditedRequestSelection(editedModelRequestOptions, this.getSelectedModelRequestOptions());
    const transcriptContext = this.transcriptContextValue;
    if (transcriptContext) {
      requestInputs.attachedContext.insertFirst(transcriptContext);
      this.setTranscriptContext(void 0);
    }
    let result;
    try {
      result = await this.chatService.sendRequest(this.viewModel.sessionResource, requestInputs.input, {
        ...selectedModelRequestOptions,
        location: this.location,
        locationData: this._location.resolveData?.(),
        parserContext: { selectedAgent: this._lastSelectedAgent, mode: modeKind, attachmentCapabilities: this._lastSelectedAgent?.capabilities ?? this.attachmentCapabilities },
        attachedContext: requestInputs.attachedContext.asArray(),
        resolvedVariables: resolvedImageVariables,
        noCommandDetection: options?.noCommandDetection,
        isVoiceModeInput: options?.isVoiceModeInput,
        ...resolveEditedRequestSelection(editedModeRequestOptions, this.getModeRequestOptions()),
        modeInfo,
        agentIdSilent: this._lockedAgent?.id,
        queue: options?.queue,
        instructionContext: autoAttachEnabled ? {
          modeKind,
          ...resolveEditedRequestSelection(editedInstructionRouting, this._getInstructionRouting())
        } : void 0
      });
    } catch (error) {
      if (transcriptContext) {
        this.setTranscriptContext(transcriptContext);
      }
      throw error;
    }
    if (ChatSendResult.isRejected(result)) {
      if (transcriptContext) {
        this.setTranscriptContext(transcriptContext);
      }
      if (result.newSessionResource) {
        const newModel = this.chatService.getSession(result.newSessionResource);
        if (newModel) {
          this.setModel(newModel);
        }
      }
      return;
    }
    this.logThinkingStyleUsage("submit");
    this.updateChatViewVisibility();
    this.input.acceptInput(options?.storeToHistory ?? isUserQuery, options?.preserveFocus, options?.preserveInput);
    if (!options.preserveInput) {
      this._maybeStartGoalSummary(requestInputs.input);
    }
    const sent = await acceptAndAwaitSentRequest(result, options.onRequestAccepted);
    if (!sent) {
      return;
    }
    if (!options.preserveInput) {
      this._onDidSubmitAgent.fire({ agent: sent.data.agent, slashCommand: sent.data.slashCommand });
    }
    this.handleDelegationExitIfNeeded(this._lockedAgent, sent.data.agent);
    if (sent.newSessionResource) {
      const newModel = this.chatService.getSession(sent.newSessionResource);
      if (newModel) {
        this.setModel(newModel);
      }
    }
    sent.data.responseCreatedPromise.then(() => {
      this.chatAccessibilityService.acceptRequest(submittedSessionResource);
      sent.data.responseCompletePromise.then(() => {
        const responses = this.viewModel?.getItems().filter(isResponseVM);
        const lastResponse = responses?.[responses.length - 1];
        this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, submittedSessionResource, options?.isVoiceInput);
        if (lastResponse?.result?.nextQuestion) {
          const { prompt, participant, command } = lastResponse.result.nextQuestion;
          const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
          if (question) {
            this.input.setValue(question, false);
          }
        }
      });
    });
    return sent.data.responseCreatedPromise;
  }
  _getAttachedContextForConcurrentSlashCommand(preserveInput) {
    return preserveInput ? [] : this.input.getAttachedContext().asArray();
  }
  async _executeSlashCommandDuringRequest(input, requestOptions, storeToHistory, preserveFocus) {
    const viewModel = this.viewModel;
    if (!viewModel?.model.hasActiveRequest.get()) {
      return false;
    }
    const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(
      viewModel.sessionResource,
      input,
      this.location,
      {
        selectedAgent: this._lastSelectedAgent,
        mode: this.input.currentModeKind,
        attachmentCapabilities: this.attachmentCapabilities,
        forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0
      }
    );
    const commandPart = parsedRequest.parts.find((part) => part instanceof ChatRequestSlashCommandPart);
    if (!commandPart?.slashCommand.executeDuringRequest || commandPart.slashCommand.silent !== true) {
      return false;
    }
    const history = [];
    for (const request of viewModel.model.getRequests()) {
      if (!request.response) {
        continue;
      }
      history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: request.message.text }] });
      history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: request.response.response.toString() }] });
    }
    this.input.acceptInput(storeToHistory, preserveFocus);
    const prompt = parsedRequest.text.slice(commandPart.range.endExclusive).trimStart();
    try {
      await this.chatSlashCommandService.executeCommand(
        commandPart.slashCommand.command,
        prompt,
        Progress.None,
        history,
        this.location,
        viewModel.sessionResource,
        CancellationToken.None,
        requestOptions
      );
    } finally {
      clearChatMarks(viewModel.sessionResource);
    }
    return true;
  }
  // Resolve images from directory attachments to send as additional variables.
  async _resolveDirectoryImageAttachments(attachments) {
    const imagePromises = [];
    for (const attachment of attachments) {
      if (attachment.kind === "directory" && URI.isUri(attachment.value)) {
        imagePromises.push(
          this.chatAttachmentResolveService.resolveDirectoryImages(attachment.value)
        );
      }
    }
    if (imagePromises.length === 0) {
      return [];
    }
    const resolved = await Promise.all(imagePromises);
    return resolved.flat();
  }
  async _tryExecuteImmediateSlashCommand(input, parsedInput) {
    const viewModel = this.viewModel;
    if (!viewModel) {
      return false;
    }
    const parsedRequest = parsedInput ?? this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), input, this.location, {
      selectedAgent: this._lastSelectedAgent,
      mode: this.input.currentModeKind,
      attachmentCapabilities: this.attachmentCapabilities,
      forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0,
      sessionType: getChatSessionType(viewModel.model.sessionResource)
    });
    const commandPart = getImmediateSilentSlashCommandPart(parsedRequest);
    if (!commandPart) {
      return false;
    }
    const history = [];
    for (const request of viewModel.model.getRequests()) {
      if (!request.response) {
        continue;
      }
      history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: request.message.text }] });
      history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: request.response.response.toString() }] });
    }
    const command = commandPart.slashCommand.command;
    await this.chatSlashCommandService.executeCommand(
      command,
      input.slice(commandPart.range.endExclusive).trimStart(),
      new Progress(() => {
      }),
      history,
      this.location,
      viewModel.sessionResource,
      CancellationToken.None
    );
    return true;
  }
  async confirmPendingRequestsBeforeSend(model, options) {
    if (options.queue) {
      return true;
    }
    const hasPendingRequests = model.getPendingRequests().length > 0;
    if (!hasPendingRequests) {
      return true;
    }
    const promptResult = await this.dialogService.prompt({
      type: "question",
      message: localize("chat.pendingRequests.prompt.message", "You already have pending requests."),
      detail: localize("chat.pendingRequests.prompt.detail", "Do you want to keep them in the queue or remove them before sending this message?"),
      buttons: [
        {
          label: localize("chat.pendingRequests.prompt.keep", "Keep Pending Requests"),
          run: () => "keep"
        },
        {
          label: localize("chat.pendingRequests.prompt.remove", "Remove Pending Requests"),
          run: () => "remove"
        }
      ],
      cancelButton: true
    });
    if (!promptResult.result) {
      return false;
    }
    if (promptResult.result === "remove") {
      for (const pendingRequest of [...model.getPendingRequests()]) {
        this.chatService.removePendingRequest(model.sessionResource, pendingRequest.request.id);
      }
    }
    return true;
  }
  // Keep the selected model and its editor-scoped configuration together so
  // resend/confirmation flows preserve custom per-model settings.
  getSelectedModelRequestOptions() {
    const modelId = this.input.currentLanguageModel;
    return {
      userSelectedModelId: modelId,
      userSelectedModelConfiguration: modelId ? this.input.getModelConfiguration(modelId) : void 0
    };
  }
  /** The tool and subagent routing of whichever input this is called on, for its current mode. */
  _getInstructionRouting() {
    const isAgent = this.input.currentModeKind === ChatModeKind.Agent;
    return {
      enabledTools: isAgent ? this.input.selectedToolsModel.userSelectedTools.get() : void 0,
      enabledSubAgents: isAgent ? this.input.currentModeObs.get().agents?.get() : void 0
    };
  }
  getModeRequestOptions() {
    if (!this.inputPartDisposable.value) {
      return {};
    }
    const sessionResource = this.viewModel?.sessionResource;
    const capturedModeId = this.input.currentModeObs.get().id;
    const userSelectedTools = this.input.selectedToolsModel.userSelectedTools;
    let lastToolsSnapshot = userSelectedTools.get();
    const scopedTools = derived((reader) => {
      if (this._store.isDisposed) {
        return lastToolsSnapshot;
      }
      const activeSession = this._viewModelObs.read(reader)?.sessionResource;
      const currentModeId = this.input.currentModeObs.read(reader).id;
      if (isEqual(activeSession, sessionResource) && currentModeId === capturedModeId) {
        const tools = userSelectedTools.read(reader);
        lastToolsSnapshot = tools;
        return tools;
      }
      return lastToolsSnapshot;
    });
    return {
      modeInfo: this.input.currentModeInfo,
      userSelectedTools: scopedTools
    };
  }
  getCodeBlockInfosForResponse(response) {
    return this.listWidget.getCodeBlockInfosForResponse(response);
  }
  getCodeBlockInfoForEditor(uri) {
    return this.listWidget.getCodeBlockInfoForEditor(uri);
  }
  getFileTreeInfosForResponse(response) {
    return this.listWidget.getFileTreeInfosForResponse(response);
  }
  getLastFocusedFileTreeForResponse(response) {
    return this.listWidget.getLastFocusedFileTreeForResponse(response);
  }
  getElementFromNode(node) {
    return this.listWidget.getElementFromNode(node);
  }
  getFindController() {
    return this._findController;
  }
  /** @internal Used by {@link ChatFindWidget} to locate a row's rendered template. Not part of `IChatWidget`. */
  getTemplateDataForRequestId(requestId) {
    return this.listWidget.getTemplateDataForRequestId(requestId);
  }
  /** @internal Used by {@link ChatFindWidget} to know when a row remounts. Not part of `IChatWidget`. */
  get onDidRerenderRow() {
    return this.listWidget.onDidRerender;
  }
  focusResponseItem(lastFocused) {
    this.listWidget.focusLastItem(lastFocused);
  }
  setInputPartMaxHeightOverride(maxHeight) {
    this.inputPartMaxHeightOverride = maxHeight;
  }
  layout(height, width) {
    width = Math.min(width, this.viewOptions.renderStyle === "minimal" ? width : 950);
    this.bodyDimension = new dom.Dimension(width, height);
    this._findController?.layout(width);
    if (this.viewModel?.editing) {
      this.inlineInputPart?.layout(width);
    }
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const inputMaxHeight = this._dynamicMessageLayoutData || this.location !== ChatAgentLocation.Chat ? void 0 : this.inputPartMaxHeightOverride !== void 0 ? Math.max(0, this.inputPartMaxHeightOverride - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT) : Math.max(0, height - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT);
    this.inputPart.setMaxHeight(inputMaxHeight);
    this.inputPart.layout(width);
    this._layoutListForInputHeight();
    this._onDidLayout.fire({ width, height });
  }
  /**
   * Updates the widget's available space after the intrinsic input height changed.
   * The input has already laid itself out, so this only resizes the list-side
   * surfaces and must not call {@link ChatInputPart.layout}.
   */
  layoutForInputHeight(height, width) {
    width = Math.min(width, this.viewOptions.renderStyle === "minimal" ? width : 950);
    this.bodyDimension = new dom.Dimension(width, height);
    this._layoutListForInputHeight();
  }
  /**
   * Re-layout just the list, welcome container, and list container to match
   * the current input-part height. Called both from {@link layout} and from
   * the inputPart.height autorun so we never re-enter inputPart.layout when
   * only the input height changed.
   */
  _layoutListForInputHeight() {
    if (!this.bodyDimension) {
      return;
    }
    const { height, width } = this.bodyDimension;
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const inputHeight = this._inputVisible ? this.inputPart.height.get() : this.inputPart.element.offsetHeight;
    const readOnlyBannerHeight = this.readOnlyBanner?.visible ? CHAT_READ_ONLY_BANNER_HEIGHT : 0;
    const lastElementVisible = this.listWidget.isScrolledToBottom;
    const lastItem = this.listWidget.lastItem;
    const contentHeight = Math.max(0, height - inputHeight - readOnlyBannerHeight - chatSuggestNextWidgetHeight);
    this.listWidget.layout(contentHeight, width);
    this.welcomeMessageContainer.style.height = `${contentHeight}px`;
    const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
    if (lastElementVisible && !this.listWidget.isAutoScrollHeld && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
      this.listWidget.scrollToEnd();
    }
    this.listContainer.style.height = `${contentHeight}px`;
    this._onDidChangeHeight.fire(height);
  }
  // An alternative to layout, this allows you to specify the number of ChatTreeItems
  // you want to show, and the max height of the container. It will then layout the
  // tree to show that many items.
  // TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
  setDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
    this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
    this._register(this.listWidget.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));
    const mutableDisposable = this._register(new MutableDisposable());
    this._register(this.listWidget.onDidScroll((e) => {
      if (!this._dynamicMessageLayoutData?.enabled) {
        return;
      }
      mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
        if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
          return;
        }
        const renderHeight = e.height;
        const diff = e.scrollHeight - renderHeight - e.scrollTop;
        if (diff === 0) {
          return;
        }
        const possibleMaxHeight = this._dynamicMessageLayoutData?.maxHeight ?? maxHeight;
        const width = this.bodyDimension?.width ?? this.container.offsetWidth;
        this.input.layout(width);
        const inputPartHeight = this.input.height.get();
        const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
        const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight - chatSuggestNextWidgetHeight);
        this.layout(newHeight + inputPartHeight + chatSuggestNextWidgetHeight, width);
      });
    }));
  }
  updateDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
    this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
    let hasChanged = false;
    let height = this.bodyDimension.height;
    let width = this.bodyDimension.width;
    if (maxHeight < this.bodyDimension.height) {
      height = maxHeight;
      hasChanged = true;
    }
    const containerWidth = this.container.offsetWidth;
    if (this.bodyDimension?.width !== containerWidth) {
      width = containerWidth;
      hasChanged = true;
    }
    if (hasChanged) {
      this.layout(height, width);
    }
  }
  get isDynamicChatTreeItemLayoutEnabled() {
    return this._dynamicMessageLayoutData?.enabled ?? false;
  }
  set isDynamicChatTreeItemLayoutEnabled(value) {
    if (!this._dynamicMessageLayoutData) {
      return;
    }
    this._dynamicMessageLayoutData.enabled = value;
  }
  layoutDynamicChatTreeItemMode() {
    if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
      return;
    }
    const width = this.bodyDimension?.width ?? this.container.offsetWidth;
    this.input.layout(width);
    const inputHeight = this.input.height.get();
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const totalMessages = this.viewModel.getItems();
    const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);
    const needsRerender = messages.some((m) => m.currentRenderedHeight === void 0);
    const listHeight = needsRerender ? this._dynamicMessageLayoutData.maxHeight : messages.reduce((acc, message) => acc + message.currentRenderedHeight, 0);
    this.layout(
      Math.min(
        // we add an additional 18px in order to show that there is scrollable content
        inputHeight + chatSuggestNextWidgetHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
        this._dynamicMessageLayoutData.maxHeight
      ),
      width
    );
    if (needsRerender || !listHeight) {
      this.listWidget.scrollToEnd();
    }
  }
  saveState() {
  }
  getInputState() {
    return this.input.getCurrentInputState();
  }
  updateChatInputContext() {
    const currentAgent = this.parsedInput.parts.find((part) => part instanceof ChatRequestAgentPart);
    this.agentInInput.set(!!currentAgent);
  }
  async _switchToAgentByName(agentName) {
    const currentAgent = this.input.currentModeObs.get();
    if (agentName === currentAgent.name.get()) {
      return true;
    }
    const agent = this.input.currentChatModesObs.get().findModeByName(agentName);
    if (!agent) {
      return false;
    }
    if (currentAgent.kind !== agent.kind) {
      const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentAgent.kind, agent.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model);
      if (!chatModeCheck) {
        return false;
      }
      if (chatModeCheck.needToClearSession) {
        await this.clear();
      }
    }
    this.input.setChatMode(agent.id);
    return true;
  }
  /**
   * @returns `false` when the agent switch was cancelled (e.g. user dismissed the
   * mode-switch confirmation dialog), signalling that the caller should abort the
   * current input submission.
   */
  async _applyPromptMetadata({ agent, tools, model }, requestInput) {
    if (tools !== void 0 && !agent && this.input.currentModeKind !== ChatModeKind.Agent) {
      agent = ChatMode.Agent.name.get();
    }
    if (agent) {
      const switched = await this._switchToAgentByName(agent);
      if (!switched) {
        return false;
      }
    }
    if (tools !== void 0 && this.input.currentModeKind === ChatModeKind.Agent) {
      const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools, this.input.selectedLanguageModel.get()?.metadata);
      this.input.selectedToolsModel.set(enablementMap, true);
    }
    if (model !== void 0) {
      return this.input.requestModelByQualifiedName(model);
    }
    return true;
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.listWidget.delegateScrollFromMouseWheelEvent(browserEvent);
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ChatWidget.CONTRIBS = [];
ChatWidget = __decorateClass([
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IChatService),
  __decorateParam(11, IChatAgentService),
  __decorateParam(12, IChatWidgetService),
  __decorateParam(13, IChatPasteTargetService),
  __decorateParam(14, IChatAccessibilityService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IThemeService),
  __decorateParam(17, IChatSlashCommandService),
  __decorateParam(18, IChatEditingService),
  __decorateParam(19, ITelemetryService),
  __decorateParam(20, IPromptsService),
  __decorateParam(21, ICustomizationHarnessService),
  __decorateParam(22, ILanguageModelToolsService),
  __decorateParam(23, IChatLayoutService),
  __decorateParam(24, IChatEntitlementService),
  __decorateParam(25, IChatSessionsService),
  __decorateParam(26, IAgentSessionsService),
  __decorateParam(27, IChatTodoListService),
  __decorateParam(28, ILifecycleService),
  __decorateParam(29, IChatAttachmentResolveService),
  __decorateParam(30, IChatTipService),
  __decorateParam(31, IChatDebugService),
  __decorateParam(32, IAccessibilityService),
  __decorateParam(33, IChatGoalSummaryService),
  __decorateParam(34, IChatSubmitRequestHandlerService),
  __decorateParam(35, IChatPetService),
  __decorateParam(36, IAgentHostService)
], ChatWidget);
function layoutChatWidgetForInputHeight(widget, inputMaxHeight, height, width) {
  widget.setInputPartMaxHeightOverride(inputMaxHeight);
  widget.layoutForInputHeight(height, width);
}
const MIN_LIST_HEIGHT = 50;
export {
  ChatWidget,
  acceptAndAwaitSentRequest,
  getImmediateSilentSlashCommandPart,
  isQuickChat,
  layoutChatWidgetForInputHeight,
  saveAllBeforeChatSend,
  shouldShowChatTip,
  shouldShowChatWelcome
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdEFnZW50SG92ZXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0Vmlld1dlbGNvbWUuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0aGVuSWZOb3REaXNwb3NlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGF0UGVyZk1hcmssIGNsZWFyQ2hhdE1hcmtzLCBtYXJrQ2hhdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcblxuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNoZWNrTW9kZU9wdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRBdHRhY2htZW50Q2FwYWJpbGl0aWVzLCBJQ2hhdEFnZW50Q29tbWFuZCwgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBhcHBseWluZ0NoYXRFZGl0c0ZhaWxlZENvbnRleHRLZXksIGRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgaGFzQXBwbGllZENoYXRFZGl0c0NvbnRleHRLZXksIGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LCBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBpbkNoYXRFZGl0aW5nU2Vzc2lvbkNvbnRleHRLZXksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dpZGdldC9jaGF0TGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgSUNoYXRSZXNwb25zZU1vZGVsLCBsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgZ2V0TW9kZU5hbWVGb3JUZWxlbWV0cnksIElDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBDaGF0UmVxdWVzdEFnZW50UGFydCwgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0LCBDaGF0UmVxdWVzdFRvb2xQYXJ0LCBDaGF0UmVxdWVzdFRvb2xTZXRQYXJ0LCBjaGF0U3ViY29tbWFuZExlYWRlciwgZm9ybWF0Q2hhdFF1ZXN0aW9uLCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RQYXJzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0LCBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldFBhc3RlVGFyZ2V0IH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdFdpZGdldFBhc3RlVGFyZ2V0LmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgQ2hhdFNlbmRSZXN1bHRTZW50LCBJQ2hhdExvY2F0aW9uRGF0YSwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc1Bhc3RlZFRleHRBcnRpZmFjdCwgaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSwgaXNXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5LCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRNZXNzYWdlUm9sZSwgSUNoYXRNZXNzYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBDaGF0UGVybWlzc2lvbkxldmVsLCBUaGlua2luZ0Rpc3BsYXlNb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSB9IGZyb20gJy4uL2NoYXRHb2FsU3VtbWFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGlzVG9vbFNldCB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIYW5kT2ZmLCBQcm9tcHRIZWFkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCwgaGFuZGxlTW9kZVN3aXRjaCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucywgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdEZpbGVUcmVlSW5mbywgSUNoYXRGaW5kQ29udHJvbGxlciwgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucywgSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIElDaGF0V2lkZ2V0Vmlld0NvbnRleHQsIElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQsIElDaGF0V2lkZ2V0Vmlld09wdGlvbnMsIElDaGF0V2lkZ2V0Vmlld1N0YXRlLCBpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRNb2RlbCB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXREeW5hbWljVmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRTdWdnZXN0TmV4dFdpZGdldCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3VnZ2VzdE5leHRXaWRnZXQuanMnO1xuaW1wb3J0IHsgcmVzb2x2ZUVkaXRlZFJlcXVlc3RTZWxlY3Rpb24gfSBmcm9tICcuL2lucHV0L2NoYXRJbnB1dE1vZGVsVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGFydCwgSUNoYXRJbnB1dFBhcnRPcHRpb25zLCBJQ2hhdElucHV0U3R5bGVzIH0gZnJvbSAnLi9pbnB1dC9jaGF0SW5wdXRQYXJ0LmpzJztcbmltcG9ydCB7IHNldENoYXRJbnB1dFN0YWNrSW5wdXRXb3JraW5nIH0gZnJvbSAnLi9pbnB1dC9jaGF0SW5wdXRTdGFjay5qcyc7XG5pbXBvcnQgeyBJQ2hhdExpc3RJdGVtVGVtcGxhdGUgfSBmcm9tICcuL2NoYXRMaXN0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2hhdExpc3RXaWRnZXQgfSBmcm9tICcuL2NoYXRMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRGaW5kV2lkZ2V0LCBJQ2hhdEZpbmRIb3N0IH0gZnJvbSAnLi9jaGF0RmluZC9jaGF0RmluZFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vY2hhdE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdXZWxjb21lUGFydCwgSUNoYXRWaWV3V2VsY29tZUNvbnRlbnQgfSBmcm9tICcuLi92aWV3c1dlbGNvbWUvY2hhdFZpZXdXZWxjb21lQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBoYXNJbW11dGFibGVQcmltYXJ5V29ya2luZ0RpcmVjdG9yeSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdE5ld1Nlc3Npb25Gb2xkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFRpcFByZXNlbnRlciB9IGZyb20gJy4vaW5wdXQvY2hhdElucHV0VGlwUHJlc2VudGVyLmpzJztcbmltcG9ydCB7IENoYXRQcm9ncmVzc1N1YlBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFByb2dyZXNzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfUkVBRF9PTkxZX0JBTk5FUl9IRUlHSFQsIENoYXRSZWFkT25seUJhbm5lciB9IGZyb20gJy4vY2hhdFJlYWRPbmx5QmFubmVyLmpzJztcbmltcG9ydCB7IElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGV0V2lkZ2V0LCBpc0NoYXRQZXRWaXNpYmxlIH0gZnJvbSAnLi9jaGF0UGV0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4uL2NoYXRQZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHN0b3BEaWN0YXRpb25Gb3JFZGl0b3IgfSBmcm9tICcuLi9zcGVlY2hUb1RleHQvZGljdGF0aW9uU2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuL2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuLyoqXG4gKiBUb3RhbCBob3Jpem9udGFsIHBhZGRpbmcgb2YgYSBjaGF0IGl0ZW0gaW4gdGhlIGFnZW50cyB3aW5kb3cgKGAuaW50ZXJhY3RpdmUtaXRlbS1jb250YWluZXJgLFxuICogYHBhZGRpbmc6IDAgMzJweGAgaW4gc2Vzc2lvbnMgYHN0eWxlLmNzc2ApLiBSZXNlcnZlZCB3aGVuIGxheWluZyBvdXQgZW1iZWRkZWQgZWRpdG9ycyBzbyBjb2RlXG4gKiBibG9ja3MgbWF0Y2ggdGhlIHJlbmRlcmVkIGNvbnRlbnQgd2lkdGguIFNlZSB7QGxpbmsgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucy5jb250ZW50SG9yaXpvbnRhbFBhZGRpbmd9LlxuICovXG5jb25zdCBTRVNTSU9OU19DSEFUX0lURU1fSE9SSVpPTlRBTF9QQURESU5HID0gNjQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRXaWRnZXRTdHlsZXMgZXh0ZW5kcyBJQ2hhdElucHV0U3R5bGVzIHtcblx0cmVhZG9ubHkgaW5wdXRFZGl0b3JCYWNrZ3JvdW5kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3VsdEVkaXRvckJhY2tncm91bmQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFdpZGdldENvbnRyaWIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHQvKipcblx0ICogQSBwaWVjZSBvZiBzdGF0ZSB3aGljaCBpcyByZWxhdGVkIHRvIHRoZSBpbnB1dCBlZGl0b3Igb2YgdGhlIGNoYXQgd2lkZ2V0LlxuXHQgKiBUYWtlcyBpbiB0aGUgYGNvbnRyaWJgIG9iamVjdCB0aGF0IHdpbGwgYmUgc2F2ZWQgaW4gdGhlIHtAbGluayBJQ2hhdE1vZGVsSW5wdXRTdGF0ZX0uXG5cdCAqL1xuXHRnZXRJbnB1dFN0YXRlPyhjb250cmliOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aXRoIHRoZSByZXN1bHQgb2YgZ2V0SW5wdXRTdGF0ZSB3aGVuIG5hdmlnYXRpbmcgaW5wdXQgaGlzdG9yeS5cblx0ICovXG5cdHNldElucHV0U3RhdGU/KGNvbnRyaWI6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+Pik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJQ2hhdFJlcXVlc3RJbnB1dE9wdGlvbnMge1xuXHRpbnB1dDogc3RyaW5nO1xuXHRhdHRhY2hlZENvbnRleHQ6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMge1xuXHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247XG5cblx0cmVzb2x2ZURhdGE/KCk6IElDaGF0TG9jYXRpb25EYXRhIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNRdWlja0NoYXQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNJQ2hhdFJlc291cmNlVmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSAmJiBCb29sZWFuKHdpZGdldC52aWV3Q29udGV4dC5pc1F1aWNrQ2hhdCk7XG59XG5cbmZ1bmN0aW9uIGlzSW5saW5lQ2hhdCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpICYmIEJvb2xlYW4od2lkZ2V0LnZpZXdDb250ZXh0LmlzSW5saW5lQ2hhdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0KHBhcnNlZFJlcXVlc3Q6IElQYXJzZWRDaGF0UmVxdWVzdCk6IENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBwYXJzZWRSZXF1ZXN0LnBhcnRzLmZpbmQoKHBhcnQpOiBwYXJ0IGlzIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydCA9PlxuXHRcdHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnRcblx0XHQmJiBwYXJ0LnJhbmdlLnN0YXJ0ID09PSAwXG5cdFx0JiYgcGFydC5zbGFzaENvbW1hbmQuZXhlY3V0ZUltbWVkaWF0ZWx5ID09PSB0cnVlXG5cdFx0JiYgcGFydC5zbGFzaENvbW1hbmQuc2lsZW50ID09PSB0cnVlXG5cdCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRTaG93Q2hhdFdlbGNvbWUoaXRlbUNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQsIGhhc1RyYW5zY3JpcHRPdmVybGF5OiBib29sZWFuKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdGlmIChpdGVtQ291bnQgPT09IHVuZGVmaW5lZCAmJiAhaGFzVHJhbnNjcmlwdE92ZXJsYXkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBpdGVtQ291bnQgPT09IDAgJiYgIWhhc1RyYW5zY3JpcHRPdmVybGF5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd0NoYXRUaXAoaXRlbUNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQsIGhhc1RyYW5zY3JpcHRPdmVybGF5OiBib29sZWFuLCBpc0xvYWRpbmc6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuICFpc0xvYWRpbmcgJiYgc2hvdWxkU2hvd0NoYXRXZWxjb21lKGl0ZW1Db3VudCwgaGFzVHJhbnNjcmlwdE92ZXJsYXkpID09PSB0cnVlO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZUFsbEJlZm9yZUNoYXRTZW5kKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmIChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5TYXZlQmVmb3JlU2VuZCkgIT09IGZhbHNlKSB7XG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5zYXZlQWxsKHsgaW5jbHVkZVVudGl0bGVkOiBmYWxzZSwgcmVhc29uOiBTYXZlUmVhc29uLkVYUExJQ0lUIH0pO1xuXHR9XG59XG5cbi8qKlxuICogU2V0dGxlcyB0aGUgb3V0Y29tZSBvZiBhIGBJQ2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3RgIGNhbGwuXG4gKlxuICogQSByZXF1ZXN0IHRoYXQgY291bGQgbm90IGJlIGhhbmRlZCBvdmVyIHRvIHRoZSBjaGF0IHNlcnZpY2UgaXMgbmV2ZXIgYWNjZXB0ZWQuIEFueXRoaW5nIGVsc2UgaXNcbiAqIGFjY2VwdGVkIHJpZ2h0IGF3YXkgXHUyMDE0IGEgcXVldWVkIHJlcXVlc3QgaXMgYWNjZXB0ZWQgdGhlIG1vbWVudCBpdCBlbnRlcnMgdGhlIHF1ZXVlLCB3aGljaCBpc1xuICogcG90ZW50aWFsbHkgbG9uZyBiZWZvcmUgaXQgcnVucyBcdTIwMTQgc28ge0BsaW5rIG9uUmVxdWVzdEFjY2VwdGVkfSBmaXJlcyBiZWZvcmUgdGhlIHF1ZXVlZCByZXF1ZXN0XG4gKiBzZXR0bGVzLiBSZXNvbHZlcyB3aXRoIHRoZSByZXF1ZXN0IG9uY2UgaXQgaGFzIGFjdHVhbGx5IGJlZW4gc2VudCwgb3IgYHVuZGVmaW5lZGAgaWYgaXQgbmV2ZXIgd2FzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYWNjZXB0QW5kQXdhaXRTZW50UmVxdWVzdChyZXN1bHQ6IENoYXRTZW5kUmVzdWx0LCBvblJlcXVlc3RBY2NlcHRlZD86ICgpID0+IHZvaWQpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0U2VudCB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoQ2hhdFNlbmRSZXN1bHQuaXNSZWplY3RlZChyZXN1bHQpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG9uUmVxdWVzdEFjY2VwdGVkPy4oKTtcblxuXHRjb25zdCBzZW50ID0gQ2hhdFNlbmRSZXN1bHQuaXNRdWV1ZWQocmVzdWx0KSA/IGF3YWl0IHJlc3VsdC5kZWZlcnJlZCA6IHJlc3VsdDtcblx0cmV0dXJuIENoYXRTZW5kUmVzdWx0LmlzU2VudChzZW50KSA/IHNlbnQgOiB1bmRlZmluZWQ7XG59XG5cbnR5cGUgQ2hhdEhhbmRvZmZDbGlja0V2ZW50ID0ge1xuXHRmcm9tQWdlbnQ6IHN0cmluZztcblx0dG9BZ2VudDogc3RyaW5nO1xuXHRoYXNQcm9tcHQ6IGJvb2xlYW47XG5cdGF1dG9TZW5kOiBib29sZWFuO1xufTtcblxudHlwZSBDaGF0SGFuZG9mZkNsaWNrQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdGNvbW1lbnQ6ICdFdmVudCBmaXJlZCB3aGVuIGEgdXNlciBjbGlja3Mgb24gYSBoYW5kb2ZmIHByb21wdCBpbiB0aGUgY2hhdCBzdWdnZXN0LW5leHQgd2lkZ2V0Jztcblx0ZnJvbUFnZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFnZW50L21vZGUgdGhlIHVzZXIgd2FzIGluIGJlZm9yZSBjbGlja2luZyB0aGUgaGFuZG9mZicgfTtcblx0dG9BZ2VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhZ2VudC9tb2RlIHNwZWNpZmllZCBpbiB0aGUgaGFuZG9mZicgfTtcblx0aGFzUHJvbXB0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgaGFuZG9mZiBpbmNsdWRlcyBhIHByb21wdCcgfTtcblx0YXV0b1NlbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBoYW5kb2ZmIGF1dG9tYXRpY2FsbHkgc3VibWl0cyB0aGUgcmVxdWVzdCcgfTtcbn07XG5cbnR5cGUgQ2hhdEhhbmRvZmZXaWRnZXRTaG93bkV2ZW50ID0ge1xuXHRhZ2VudDogc3RyaW5nO1xuXHRoYW5kb2ZmQ291bnQ6IG51bWJlcjtcbn07XG5cbnR5cGUgQ2hhdEhhbmRvZmZXaWRnZXRTaG93bkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnRXZlbnQgZmlyZWQgd2hlbiB0aGUgc3VnZ2VzdC1uZXh0IHdpZGdldCBpcyBzaG93biB3aXRoIGhhbmRvZmYgcHJvbXB0cyc7XG5cdGFnZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGN1cnJlbnQgYWdlbnQvbW9kZSB0aGF0IGhhcyBoYW5kb2ZmcyBkZWZpbmVkJyB9O1xuXHRoYW5kb2ZmQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgaGFuZG9mZiBvcHRpb25zIHNob3duIHRvIHRoZSB1c2VyJyB9O1xufTtcblxudHlwZSBDaGF0UHJvbXB0UnVuRXZlbnQgPSB7XG5cdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlO1xuXHRleHRlbnNpb25JZD86IHN0cmluZztcblx0cHJvbXB0TmFtZT86IHN0cmluZztcblx0cHJvbXB0TmFtZUhhc2g/OiBzdHJpbmc7XG59O1xuXG50eXBlIENoYXRQcm9tcHRSdW5DbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gYSBwcm9tcHQgc2xhc2ggY29tbWFuZCBpcyByZXNvbHZlZCBpbnRvIGEgZm9sbG93IGluc3RydWN0aW9ucyByZXF1ZXN0Jztcblx0c3RvcmFnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXJlIHRoZSBwcm9tcHQgaXMgc3RvcmVkIChsb2NhbCwgdXNlciwgZXh0ZW5zaW9uKS4nIH07XG5cdGV4dGVuc2lvbklkPzogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJZGVudGlmaWVyIG9mIHRoZSBleHRlbnNpb24gdGhhdCBjb250cmlidXRlZCB0aGUgcHJvbXB0LCB3aGVuIGFwcGxpY2FibGUuJyB9O1xuXHRwcm9tcHROYW1lPzogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdOYW1lIG9mIHRoZSBjb3JlIG9yIGV4dGVuc2lvbi1jb250cmlidXRlZCBwcm9tcHQuJyB9O1xuXHRwcm9tcHROYW1lSGFzaD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIYXNoZWQgbmFtZSBvZiBsb2NhbCBvciB1c2VyIHByb21wdCBmb3IgcHJpdmFjeS4nIH07XG59O1xuXG50eXBlIENoYXRUaGlua2luZ1N0eWxlVXNhZ2VFdmVudCA9IHtcblx0dGhpbmtpbmdTdHlsZTogVGhpbmtpbmdEaXNwbGF5TW9kZTtcblx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uO1xuXHRyZXF1ZXN0S2luZDogJ3N1Ym1pdCcgfCAncmVydW4nO1xufTtcblxudHlwZSBDaGF0VGhpbmtpbmdTdHlsZVVzYWdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnanVzdHNjaGVuJztcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gYSBjaGF0IHJlcXVlc3QgdXNlcyB0aGUgY29uZmlndXJlZCB0aGlua2luZyBzdHlsZSByZW5kZXJpbmcgbW9kZS4nO1xuXHR0aGlua2luZ1N0eWxlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNvbmZpZ3VyZWQgcmVuZGVyaW5nIG1vZGUgZm9yIHRoaW5raW5nIGNvbnRlbnQuJyB9O1xuXHRsb2NhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBsb2NhdGlvbiB3aGVyZSB0aGUgcmVxdWVzdCB3YXMgbWFkZS4nIH07XG5cdHJlcXVlc3RLaW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgcmVxdWVzdCB3YXMgYSBuZXcgc3VibWl0IG9yIGEgcmVydW4uJyB9O1xufTtcblxuY29uc3Qgc3VwcG9ydHNBbGxBdHRhY2htZW50czogUmVxdWlyZWQ8T21pdDxJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgJ3Rlcm1pbmFsQ29tbWFuZFByZWZpeCc+PiA9IHtcblx0c3VwcG9ydHNGaWxlQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzVG9vbEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRzdXBwb3J0c01DUEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRzdXBwb3J0c0ltYWdlQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzU2VhcmNoUmVzdWx0QXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzSW5zdHJ1Y3Rpb25BdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNTb3VyY2VDb250cm9sQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzUHJvYmxlbUF0dGFjaG1lbnRzOiB0cnVlLFxuXHRzdXBwb3J0c1N5bWJvbEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRzdXBwb3J0c1Rlcm1pbmFsQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzSGFuZE9mZnM6IHRydWUsXG5cdHN1cHBvcnRzQ2hlY2twb2ludHM6IHRydWUsXG59O1xuXG5jb25zdCBESVNDTEFJTUVSID0gbG9jYWxpemUoJ2NoYXREaXNjbGFpbWVyJywgXCJBSSByZXNwb25zZXMgbWF5IGJlIGluYWNjdXJhdGVcIik7XG5cbmV4cG9ydCBjbGFzcyBDaGF0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0V2lkZ2V0IHtcblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRzdGF0aWMgcmVhZG9ubHkgQ09OVFJJQlM6IHsgbmV3KC4uLmFyZ3M6IFtJQ2hhdFdpZGdldCwgLi4uYW55XSk6IElDaGF0V2lkZ2V0Q29udHJpYiB9W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1Ym1pdEFnZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZ2VudDogSUNoYXRBZ2VudERhdGE7IHNsYXNoQ29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFN1Ym1pdEFnZW50ID0gdGhpcy5fb25EaWRTdWJtaXRBZ2VudC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUFnZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZ2VudDogSUNoYXRBZ2VudERhdGE7IHNsYXNoQ29tbWFuZD86IElDaGF0QWdlbnRDb21tYW5kIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFnZW50ID0gdGhpcy5fb25EaWRDaGFuZ2VBZ2VudC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlld01vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlld01vZGVsID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRTY3JvbGwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGwgPSB0aGlzLl9vbkRpZFNjcm9sbC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEFjY2VwdElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWNjZXB0SW5wdXQgPSB0aGlzLl9vbkRpZEFjY2VwdElucHV0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkSGlkZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEhpZGUgPSB0aGlzLl9vbkRpZEhpZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRTaG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2hvdyA9IHRoaXMuX29uRGlkU2hvdy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVBhcnNlZElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFyc2VkSW5wdXQgPSB0aGlzLl9vbkRpZENoYW5nZVBhcnNlZElucHV0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvciA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTWF5YmVDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsTWF5YmVDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25XaWxsTWF5YmVDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXQgPSB0aGlzLl9vbkRpZExheW91dC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUVtcHR5U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbXB0eVN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VFbXB0eVN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRmluZGFibGVDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0Y29udHJpYnM6IFJlYWRvbmx5QXJyYXk8SUNoYXRXaWRnZXRDb250cmliPiA9IFtdO1xuXG5cdHByaXZhdGUgbGlzdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRyYW5zY3JpcHRQcm9ncmVzczogeyByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50OyByZWFkb25seSBjb250ZW50OiBIVE1MRWxlbWVudCB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zY3JpcHRQcm9ncmVzc1BhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSB0cmFuc2NyaXB0UHJvZ3Jlc3NBY3RpdmUgPSBmYWxzZTtcblx0cHJpdmF0ZSB0cmFuc2NyaXB0Q29udGV4dDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhbnNjcmlwdENvbnRleHRQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0PigpKTtcblx0cHJpdmF0ZSB0cmFuc2NyaXB0Q29udGV4dFZhbHVlOiBJQ2hhdFJlcXVlc3RUcmFuc2NyaXB0Q29udGV4dFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGRvbU5vZGUoKSB7IHJldHVybiB0aGlzLmNvbnRhaW5lcjsgfVxuXG5cdHByaXZhdGUgbGlzdFdpZGdldCE6IENoYXRMaXN0V2lkZ2V0O1xuXHRwcml2YXRlIF9maW5kQ29udHJvbGxlcjogQ2hhdEZpbmRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2liaWxpdHlUaW1lb3V0RGlzcG9zYWJsZTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHZpc2liaWxpdHlBbmltYXRpb25GcmFtZURpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0UGFydERpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPENoYXRJbnB1dFBhcnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlubGluZUlucHV0UGFydERpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPENoYXRJbnB1dFBhcnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFpblBhc3RlVGFyZ2V0UmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlubGluZVBhc3RlVGFyZ2V0UmVnaXN0cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9wYXN0ZVRhcmdldDogQ2hhdFdpZGdldFBhc3RlVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBTaGFyZWQgYWNyb3NzIHRoZSBtYWluIGFuZCBpbmxpbmUgaW5wdXQgcGFydHM6IGl0IHJlc29sdmVzIHRoZSBhY3RpdmUgcGFydFxuXHQgKiB0aHJvdWdoIHtAbGluayBpbnB1dH0sIHNvIG9uZSBpbnN0YW5jZSBzZXJ2ZXMgd2hpY2hldmVyIGlzIGluIHVzZS5cblx0ICovXG5cdHByaXZhdGUgZ2V0IHBhc3RlVGFyZ2V0KCk6IENoYXRXaWRnZXRQYXN0ZVRhcmdldCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bhc3RlVGFyZ2V0ID8/PSBuZXcgQ2hhdFdpZGdldFBhc3RlVGFyZ2V0KHRoaXMpO1xuXHR9XG5cdHByaXZhdGUgaW5wdXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBmb2N1c2VkSW5wdXRET00hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JPcHRpb25zITogQ2hhdEVkaXRvck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVhZE9ubHlCYW5uZXI6IENoYXRSZWFkT25seUJhbm5lciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlY2VudGx5UmVzdG9yZWRDaGVja3BvaW50OiBib29sZWFuID0gZmFsc2U7XG5cblx0LyoqIFN1cHByZXNzZXMgYXV0by1zY3JvbGwgZm9yIHRoZSBkdXJhdGlvbiBvZiBhbiBpbmxpbmUgcmVxdWVzdCBlZGl0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0aW5nQXV0b1Njcm9sbEhvbGQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgd2VsY29tZU1lc3NhZ2VDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSB3ZWxjb21lUGFydDogTXV0YWJsZURpc3Bvc2FibGU8Q2hhdFZpZXdXZWxjb21lUGFydD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0dGluZ1N0YXJ0ZWRUaXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2hhdElucHV0VGlwUHJlc2VudGVyPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYXRTdWdnZXN0TmV4dFdpZGdldDogQ2hhdFN1Z2dlc3ROZXh0V2lkZ2V0O1xuXG5cdHByaXZhdGUgYm9keURpbWVuc2lvbjogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aXNpYmxlQ2hhbmdlQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlcXVlc3RJblByb2dyZXNzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNBY3RpdmVSZXF1ZXN0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBhZ2VudEluSW5wdXQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX3Zpc2libGUgPSBmYWxzZTtcblx0Z2V0IHZpc2libGUoKSB7IHJldHVybiB0aGlzLl92aXNpYmxlOyB9XG5cblx0cHJpdmF0ZSBfaW5wdXRWaXNpYmxlID0gdHJ1ZTtcblx0cHJpdmF0ZSBfcmVhZE9ubHkgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9pbnN0cnVjdGlvbkZpbGVzQ2hlY2tQcm9taXNlOiBQcm9taXNlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9pbnN0cnVjdGlvbkZpbGVzRXhpc3Q6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfaXNSZW5kZXJpbmdXZWxjb21lID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzTG9hZGluZyA9IGZhbHNlO1xuXG5cdC8vIENvZGluZyBhZ2VudCBsb2NraW5nIHN0YXRlXG5cdHByaXZhdGUgX2xvY2tlZEFnZW50Pzoge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0bmFtZTogc3RyaW5nO1xuXHRcdHByZWZpeDogc3RyaW5nO1xuXHRcdGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdFx0YWdlbnRIb3N0UHJvdmlkZXJJZD86IHN0cmluZztcblx0fTtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9ja2VkVG9Db2RpbmdBZ2VudENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NrZWRDb2RpbmdBZ2VudElkQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZE9ubHlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdElzQWdlbnRIb3N0U2Vzc2lvbkNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZENvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudEhvc3RIYXNJbW11dGFibGVQcmltYXJ5V29ya2luZ0RpcmVjdG9yeUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvblN1cHBvcnRzRm9ya0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklzRW1wdHlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzUGVuZGluZ1JlcXVlc3RzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25IYXNEZWJ1Z0RhdGFDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYXR0YWNobWVudENhcGFiaWxpdGllczogSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgPSBzdXBwb3J0c0FsbEF0dGFjaG1lbnRzO1xuXG5cdC8vIEF1dG9waWxvdCBnb2FsIGJhbm5lciBzdGF0ZSBcdTIwMTQgdG9rZW4gc291cmNlIGNhbmNlbHMgaW4tZmxpZ2h0IGdvYWwtc3VtbWFyeVxuXHQvLyByZXF1ZXN0cyB3aGVuIHRoZSB1c2VyIHN0YXJ0cyBhIG5ldyBzdWJtaXNzaW9uIG9yIHRoZSBydW4gY29tcGxldGVzLlxuXHRwcml2YXRlIF9nb2FsU3VtbWFyeVRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZ29hbEJhbm5lckRpc21pc3NlZEZvckN1cnJlbnRSZXF1ZXN0ID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dvYWxCYW5uZXJEaXNtaXNzTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF92aWV3TW9kZWw6IENoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzZXQgdmlld01vZGVsKHZpZXdNb2RlbDogQ2hhdFZpZXdNb2RlbCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl92aWV3TW9kZWwgPT09IHZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvblJlc291cmNlID0gdGhpcy5fdmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0dGhpcy52aWV3TW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGhpcy5fdmlld01vZGVsID0gdmlld01vZGVsO1xuXHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NoYXRXaWRnZXQjc2V0Vmlld01vZGVsOiBoYXZlIHZpZXdNb2RlbCcpO1xuXG5cdFx0XHQvLyBJZiBzd2l0Y2hpbmcgdG8gYSBtb2RlbCB3aXRoIGEgcmVxdWVzdCBpbiBwcm9ncmVzcywgcGxheSBwcm9ncmVzcyBzb3VuZFxuXHRcdFx0aWYgKHZpZXdNb2RlbC5tb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLmNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5hY2NlcHRSZXF1ZXN0KHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NoYXRXaWRnZXQjc2V0Vmlld01vZGVsOiBubyB2aWV3TW9kZWwnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlbC5maXJlKHsgcHJldmlvdXNTZXNzaW9uUmVzb3VyY2UsIGN1cnJlbnRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuX3ZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlIH0pO1xuXHR9XG5cblx0Z2V0IHZpZXdNb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld01vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdGluZ1Nlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGVsT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLm9uRGlkQ2hhbmdlVmlld01vZGVsLCAoKSA9PiB0aGlzLnZpZXdNb2RlbCk7XG5cblx0cHJpdmF0ZSBwYXJzZWRDaGF0UmVxdWVzdDogSVBhcnNlZENoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRnZXQgcGFyc2VkSW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4geyB0ZXh0OiAnJywgcGFydHM6IFtdIH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKVxuXHRcdFx0XHQucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQodGhpcyksIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0KHRoaXMpLCB0aGlzLmdldElucHV0KCksIHRoaXMubG9jYXRpb24sIHtcblx0XHRcdFx0XHRzZWxlY3RlZEFnZW50OiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudCxcblx0XHRcdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB0aGlzLmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMsXG5cdFx0XHRcdFx0Zm9yY2VkQWdlbnQ6IHRoaXMuX2xvY2tlZEFnZW50Py5pZCA/IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudCh0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJzZWRJbnB1dC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucGFyc2VkQ2hhdFJlcXVlc3Q7XG5cdH1cblxuXHRnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0S2V5U2VydmljZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucztcblx0Z2V0IGxvY2F0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbi5sb2NhdGlvbjtcblx0fVxuXG5cdHJlYWRvbmx5IHZpZXdDb250ZXh0OiBJQ2hhdFdpZGdldFZpZXdDb250ZXh0O1xuXG5cdGdldCBzdXBwb3J0c0NoYW5naW5nTW9kZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52aWV3T3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXM7XG5cdH1cblxuXHRnZXQgbG9jYXRpb25EYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbi5yZXNvbHZlRGF0YT8uKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24gfCBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyxcblx0XHR2aWV3Q29udGV4dDogSUNoYXRXaWRnZXRWaWV3Q29udGV4dCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdPcHRpb25zOiBJQ2hhdFdpZGdldFZpZXdPcHRpb25zLFxuXHRcdHByaXZhdGUgc3R5bGVzOiBJQ2hhdFdpZGdldFN0eWxlcyxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0UGFzdGVUYXJnZXRTZXJ2aWNlOiBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSxcblx0XHRASUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZTogSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U6IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdExheW91dFNlcnZpY2U6IElDaGF0TGF5b3V0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlOiBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSxcblx0XHRASUNoYXRUaXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFRpcFNlcnZpY2U6IElDaGF0VGlwU2VydmljZSxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNoYXRHb2FsU3VtbWFyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0R29hbFN1bW1hcnlTZXJ2aWNlOiBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSxcblx0XHRASUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlOiBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSxcblx0XHRASUNoYXRQZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0XHRASUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0U2VydmljZTogSUFnZW50SG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlYWRPbmx5QmFubmVyID0gdmlld09wdGlvbnMuaXNTZXNzaW9uc1dpbmRvd1xuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRSZWFkT25seUJhbm5lcixcblx0XHRcdFx0dmlld09wdGlvbnMucmVhZE9ubHlCYW5uZXJBdFRvcCA/IGxvY2FsaXplKCdjaGF0UmVhZE9ubHlCYW5uZXIubWVzc2FnZScsIFwiVGhpcyBjaGF0IGlzIHJlYWQtb25seVwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdCkpO1xuXHRcdHRoaXMuX2xvY2tlZFRvQ29kaW5nQWdlbnRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2xvY2tlZENvZGluZ0FnZW50SWRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmxvY2tlZENvZGluZ0FnZW50SWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlYWRPbmx5Q29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5yZWFkT25seS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdElzQWdlbnRIb3N0U2Vzc2lvbkNvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdElzQWdlbnRIb3N0U2Vzc2lvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdEFnZW50SG9zdFByb3ZpZGVySWRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRBZ2VudEhvc3RQcm92aWRlcklkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0SGFzSW1tdXRhYmxlUHJpbWFyeVdvcmtpbmdEaXJlY3RvcnlDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRBZ2VudEhvc3RIYXNJbW11dGFibGVQcmltYXJ5V29ya2luZ0RpcmVjdG9yeS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdXBwb3J0c0ZvcmtDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uU3VwcG9ydHNGb3JrLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmFnZW50U3VwcG9ydHNBdHRhY2htZW50cy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc2Vzc2lvbklzRW1wdHlDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSXNFbXB0eS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzUGVuZGluZ1JlcXVlc3RzQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5oYXNQZW5kaW5nUmVxdWVzdHMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Nlc3Npb25IYXNEZWJ1Z0RhdGFDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzRGVidWdEYXRhLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdERlYnVnU2VydmljZS5vbkRpZEFkZEV2ZW50KGUgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgZS5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkhhc0RlYnVnRGF0YUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRoZSBmb2xkZXIgcGlja2VyJ3MgdmlzaWJpbGl0eSBkZXBlbmRzIG9uIHdoZXRoZXIgdGhlIGxvY2tlZCBBZ2VudCBIb3N0XG5cdFx0Ly8gcHJvdmlkZXIgcGlucyBhbiBpbW11dGFibGUgcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeS4gVGhhdCBjYXBhYmlsaXR5XG5cdFx0Ly8gaHlkcmF0ZXMgYWZ0ZXIgdGhlIGFnZW50IGhvc3QgY29ubmVjdHMgKGFuZCBjYW4gcmVzZXQgb24gcmVzdGFydCksIGFuZFxuXHRcdC8vIGByb290U3RhdGVgIGlzIGEgcGxhY2Vob2xkZXIgc3Vic2NyaXB0aW9uIHdob3NlIGBvbkRpZENoYW5nZWAgaXNcblx0XHQvLyBgRXZlbnQuTm9uZWAgdW50aWwgdGhlbiBcdTIwMTQgc28gKHJlKWJpbmQgb24gZXZlcnkgc3RhcnQgYW5kIGxpc3RlbiBmb3IgYm90aFxuXHRcdC8vIHZhbHVlIGFuZCBlcnJvciB0cmFuc2l0aW9ucywgbWlycm9yaW5nIGFnZW50SG9zdFNpZ25lZE91dE1vZGVsc05vdGlmaWNhdGlvbi5cblx0XHRjb25zdCByb290U3RhdGVMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGJpbmRSb290U3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRyb290U3RhdGVMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdGNvbnN0IHJvb3RTdGF0ZSA9IHRoaXMuX2FnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlO1xuXHRcdFx0cm9vdFN0YXRlTGlzdGVuZXJzLmFkZChyb290U3RhdGUub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlQWdlbnRIb3N0V29ya2luZ0RpcmVjdG9yeUNvbnRleHRLZXlzKHRoaXMuX2xvY2tlZEFnZW50Py5hZ2VudEhvc3RQcm92aWRlcklkKSkpO1xuXHRcdFx0aWYgKHJvb3RTdGF0ZS5vbkRpZEVycm9yKSB7XG5cdFx0XHRcdHJvb3RTdGF0ZUxpc3RlbmVycy5hZGQocm9vdFN0YXRlLm9uRGlkRXJyb3IoKCkgPT4gdGhpcy5fdXBkYXRlQWdlbnRIb3N0V29ya2luZ0RpcmVjdG9yeUNvbnRleHRLZXlzKHRoaXMuX2xvY2tlZEFnZW50Py5hZ2VudEhvc3RQcm92aWRlcklkKSkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdXBkYXRlQWdlbnRIb3N0V29ya2luZ0RpcmVjdG9yeUNvbnRleHRLZXlzKHRoaXMuX2xvY2tlZEFnZW50Py5hZ2VudEhvc3RQcm92aWRlcklkKTtcblx0XHR9O1xuXHRcdGJpbmRSb290U3RhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLm9uQWdlbnRIb3N0U3RhcnQoYmluZFJvb3RTdGF0ZSkpO1xuXG5cdFx0dGhpcy52aWV3Q29udGV4dCA9IHZpZXdDb250ZXh0ID8/IHt9O1xuXG5cdFx0Y29uc3Qgdmlld01vZGVsT2JzID0gdGhpcy5fdmlld01vZGVsT2JzO1xuXG5cdFx0aWYgKHR5cGVvZiBsb2NhdGlvbiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHRoaXMuX2xvY2F0aW9uID0gbG9jYXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvY2F0aW9uID0geyBsb2NhdGlvbiB9O1xuXHRcdH1cblxuXHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLl9sb2NhdGlvbi5sb2NhdGlvbik7XG5cdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KGlzUXVpY2tDaGF0KHRoaXMpKTtcblx0XHRDaGF0Q29udGV4dEtleXMuZmluZFN1cHBvcnRlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpLnNldCghIXRoaXMudmlld09wdGlvbnMuZW5hYmxlRmluZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVZpZXdNb2RlbCgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUZpbmRhYmxlQ29udGVudC5maXJlKCkpKTtcblx0XHR0aGlzLmFnZW50SW5JbnB1dCA9IENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc0FnZW50LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5yZXF1ZXN0SW5Qcm9ncmVzcyA9IENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzQWN0aXZlUmVxdWVzdCA9IENoYXRDb250ZXh0S2V5cy5oYXNBY3RpdmVSZXF1ZXN0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBbm9ueW1vdXMoKCkgPT4gdGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdjaGF0LnRpcHMuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignY2hhdC50aXBzLmVuYWJsZWQnKSkge1xuXHRcdFx0XHRcdHRoaXMuY2xlYXJHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ2hhdFZpZXdWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlByb2dyZXNzQm9yZGVyKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0JvcmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2luZ1Byb2dyZXNzQm9yZGVyKCk7XG5cdFx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMubGlzdFdpZGdldC5yZXJlbmRlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KGRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgY29udGV4dEtleVNlcnZpY2UsIChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gdGhpcy5fZWRpdGluZ1Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjdXJyZW50U2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gY3VycmVudFNlc3Npb24uZW50cmllcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBkZWNpZGVkRW50cmllcyA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnN0YXRlLnJlYWQocmVhZGVyKSAhPT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdFx0XHRyZXR1cm4gZGVjaWRlZEVudHJpZXMubWFwKGVudHJ5ID0+IGVudHJ5LmVudHJ5SWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShoYXNVbmRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgY29udGV4dEtleVNlcnZpY2UsIChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gdGhpcy5fZWRpdGluZ1Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IGN1cnJlbnRTZXNzaW9uPy5lbnRyaWVzLnJlYWQocmVhZGVyKSA/PyBbXTsgLy8gdXNpbmcgY3VycmVudFNlc3Npb24gaGVyZVxuXHRcdFx0Y29uc3QgZGVjaWRlZEVudHJpZXMgPSBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5zdGF0ZS5yZWFkKHJlYWRlcikgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXHRcdFx0cmV0dXJuIGRlY2lkZWRFbnRyaWVzLmxlbmd0aCA+IDA7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KGhhc0FwcGxpZWRDaGF0RWRpdHNDb250ZXh0S2V5LCBjb250ZXh0S2V5U2VydmljZSwgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb24gPSB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJpZXMgPSBjdXJyZW50U2Vzc2lvbi5lbnRyaWVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBlbnRyaWVzLmxlbmd0aCA+IDA7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KGluQ2hhdEVkaXRpbmdTZXNzaW9uQ29udGV4dEtleSwgY29udGV4dEtleVNlcnZpY2UsIChyZWFkZXIpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHJlYWRlcikgIT09IG51bGw7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5jaGF0RWRpdGluZ0NhblVuZG8sIGNvbnRleHRLZXlTZXJ2aWNlLCAocikgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocik/LmNhblVuZG8ucmVhZChyKSB8fCBmYWxzZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRFZGl0aW5nQ2FuUmVkbywgY29udGV4dEtleVNlcnZpY2UsIChyKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZWRpdGluZ1Nlc3Npb24ucmVhZChyKT8uY2FuUmVkby5yZWFkKHIpIHx8IGZhbHNlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShhcHBseWluZ0NoYXRFZGl0c0ZhaWxlZENvbnRleHRLZXksIGNvbnRleHRLZXlTZXJ2aWNlLCAocikgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gdmlld01vZGVsT2JzLnJlYWQocik/Lm1vZGVsO1xuXHRcdFx0Y29uc3QgZWRpdGluZ1Nlc3Npb24gPSB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHIpO1xuXHRcdFx0aWYgKCFlZGl0aW5nU2Vzc2lvbiB8fCAhY2hhdE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RSZXNwb25zZSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgY2hhdE1vZGVsLm9uRGlkQ2hhbmdlLCAoKSA9PiBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk/LnJlc3BvbnNlKS5yZWFkKHIpO1xuXHRcdFx0cmV0dXJuIGxhc3RSZXNwb25zZT8ucmVzdWx0Py5lcnJvckRldGFpbHMgJiYgIWxhc3RSZXNwb25zZT8ucmVzdWx0Py5lcnJvckRldGFpbHMucmVzcG9uc2VJc0luY29tcGxldGU7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTdWdnZXN0TmV4dFdpZGdldCkpO1xuXG5cdFx0Ly8gQ2xlYXIgdGhlIGF1dG9waWxvdCBnb2FsIGJhbm5lciB3aGVuZXZlciB0aGUgYWN0aXZlIHJlcXVlc3QgZmluaXNoZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHZpZXdNb2RlbE9icy5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IHZpZXdNb2RlbD8ubW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyKSA/PyBmYWxzZTtcblx0XHRcdGlmICghaW5Qcm9ncmVzcykge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxHb2FsU3VtbWFyeSgpO1xuXHRcdFx0XHR0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWU/LmNsZWFyR29hbEJhbm5lcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB2aWV3TW9kZWxPYnMucmVhZChyKTtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gY2hhdEVkaXRpbmdTZXJ2aWNlLmVkaXRpbmdTZXNzaW9uc09icy5yZWFkKHIpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnMuZmluZChjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUuY2hhdFNlc3Npb25SZXNvdXJjZSwgdmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdHRoaXMuX2VkaXRpbmdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvblN0YXRlKCk7IC8vIHRoaXMgaXMgbmVjZXNzYXJ5IHRvIG1ha2Ugc3VyZSB3ZSBkaXNwb3NlIHByZXZpb3VzIGJ1dHRvbnMsIGV0Yy5cblxuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdC8vIG5vbmUgb3IgZm9yIGEgZGlmZmVyZW50IGNoYXQgd2lkZ2V0XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IHNlc3Npb24uZW50cmllcy5yZWFkKHIpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGVudHJ5LnN0YXRlLnJlYWQocik7IC8vIFNJR05BTFxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lZGl0aW5nU2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0ci5zdG9yZS5hZGQoc2Vzc2lvbi5vbkRpZERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0aW5nU2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvblN0YXRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRyLnN0b3JlLmFkZCh0aGlzLmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0SW5wdXQoKSA9PT0gJycpIHtcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvblN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckNvZGVFZGl0b3JPcGVuSGFuZGxlcihhc3luYyAoaW5wdXQ6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgX3NvdXJjZTogSUNvZGVFZGl0b3IgfCBudWxsLCBfc2lkZUJ5U2lkZT86IGJvb2xlYW4pOiBQcm9taXNlPElDb2RlRWRpdG9yIHwgbnVsbD4gPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpbnB1dC5yZXNvdXJjZTtcblx0XHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jaykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzcG9uc2VJZCA9IHJlc291cmNlLnBhdGguc3BsaXQoJy8nKS5hdCgxKTtcblx0XHRcdGlmICghcmVzcG9uc2VJZCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpLmZpbmQoaXRlbSA9PiBpdGVtLmlkID09PSByZXNwb25zZUlkKTtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVE9ETzogbmVlZHMgdG8gcmV2ZWFsIHRoZSBjaGF0IHZpZXdcblxuXHRcdFx0dGhpcy5yZXZlYWwoaXRlbSk7XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIHdhaXQgZm9yIGxpc3QgdG8gYWN0dWFsbHkgcmVuZGVyXG5cblx0XHRcdGZvciAoY29uc3QgY29kZUJsb2NrUGFydCBvZiB0aGlzLmxpc3RXaWRnZXQuZWRpdG9yc0luVXNlKCkpIHtcblx0XHRcdFx0aWYgKGV4dFVyaS5pc0VxdWFsKGNvZGVCbG9ja1BhcnQudXJpLCByZXNvdXJjZSwgdHJ1ZSkpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3IgPSBjb2RlQmxvY2tQYXJ0LmVkaXRvcjtcblxuXHRcdFx0XHRcdGxldCByZWxhdGl2ZVRvcCA9IDA7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yRG9tTm9kZSA9IGVkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0XHRcdFx0aWYgKGVkaXRvckRvbU5vZGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJvdyA9IGRvbS5maW5kUGFyZW50V2l0aENsYXNzKGVkaXRvckRvbU5vZGUsICdtb25hY28tbGlzdC1yb3cnKTtcblx0XHRcdFx0XHRcdGlmIChyb3cpIHtcblx0XHRcdFx0XHRcdFx0cmVsYXRpdmVUb3AgPSBkb20uZ2V0VG9wTGVmdE9mZnNldChlZGl0b3JEb21Ob2RlKS50b3AgLSBkb20uZ2V0VG9wTGVmdE9mZnNldChyb3cpLnRvcDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoaW5wdXQub3B0aW9ucz8uc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JTZWxlY3Rpb25Ub3BPZmZzZXQgPSBlZGl0b3IuZ2V0VG9wRm9yUG9zaXRpb24oaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLCBpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydENvbHVtbik7XG5cdFx0XHRcdFx0XHRyZWxhdGl2ZVRvcCArPSBlZGl0b3JTZWxlY3Rpb25Ub3BPZmZzZXQ7XG5cblx0XHRcdFx0XHRcdGVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRzdGFydENvbHVtbjogaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGlucHV0Lm9wdGlvbnMuc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgPz8gaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRlbmRDb2x1bW46IGlucHV0Lm9wdGlvbnMuc2VsZWN0aW9uLmVuZENvbHVtbiA/PyBpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydENvbHVtblxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5yZXZlYWwoaXRlbSwgcmVsYXRpdmVUb3ApO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZVBhcnNlZElucHV0KCgpID0+IHRoaXMudXBkYXRlQ2hhdElucHV0Q29udGV4dCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2Uub25EaWRVcGRhdGVUb2Rvcygoc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRpZiAoaXNFcXVhbCh0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0LnJlbmRlckNoYXRUb2RvTGlzdFdpZGdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBfbGFzdFNlbGVjdGVkQWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkO1xuXHRzZXQgbGFzdFNlbGVjdGVkQWdlbnQoYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5wYXJzZWRDaGF0UmVxdWVzdCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudCA9IGFnZW50O1xuXHRcdHRoaXMuX3VwZGF0ZUFnZW50Q2FwYWJpbGl0aWVzQ29udGV4dEtleXMoYWdlbnQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFyc2VkSW5wdXQuZmlyZSgpO1xuXHR9XG5cblx0Z2V0IGxhc3RTZWxlY3RlZEFnZW50KCk6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFNlbGVjdGVkQWdlbnQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBZ2VudENhcGFiaWxpdGllc0NvbnRleHRLZXlzKGFnZW50OiBJQ2hhdEFnZW50RGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdC8vIENoZWNrIGlmIHRoZSBhZ2VudCBoYXMgY2FwYWJpbGl0aWVzIGRlZmluZWQgZGlyZWN0bHlcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBhZ2VudD8uY2FwYWJpbGl0aWVzID8/ICh0aGlzLl9sb2NrZWRBZ2VudCA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZSh0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2F0dGFjaG1lbnRDYXBhYmlsaXRpZXMgPSBjYXBhYmlsaXRpZXMgPz8gc3VwcG9ydHNBbGxBdHRhY2htZW50cztcblxuXHRcdGNvbnN0IHN1cHBvcnRzQXR0YWNobWVudHMgPSBPYmplY3Qua2V5cyhmaWx0ZXIodGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcywgKGtleSwgdmFsdWUpID0+IHZhbHVlID09PSB0cnVlKSkubGVuZ3RoID4gMDtcblx0XHR0aGlzLl9hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNDb250ZXh0S2V5LnNldChzdXBwb3J0c0F0dGFjaG1lbnRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBjb250ZXh0IGtleSB0aGF0IGdhdGVzIHRoZSBtdWx0aS1yb290IGZvbGRlciBwaWNrZXI6IGl0IGlzIHNldFxuXHQgKiBvbmx5IHdoZW4gdGhlIGxvY2tlZCBBZ2VudCBIb3N0IHByb3ZpZGVyIHBpbnMgYW4gaW1tdXRhYmxlIHByaW1hcnkgd29ya2luZ1xuXHQgKiBkaXJlY3RvcnkuIERlZmF1bHRzIHRvIChhbmQgZmFsbHMgYmFjayB0bykgYGZhbHNlYCwgc28gdGhlIHBpY2tlciBzdGF5c1xuXHQgKiBoaWRkZW4gdW50aWwgdGhlIHByb3ZpZGVyJ3MgY2FwYWJpbGl0aWVzIGFyZSBrbm93bi5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUFnZW50SG9zdFdvcmtpbmdEaXJlY3RvcnlDb250ZXh0S2V5cyhhZ2VudEhvc3RQcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0SGFzSW1tdXRhYmxlUHJpbWFyeVdvcmtpbmdEaXJlY3RvcnlDb250ZXh0S2V5LnNldChcblx0XHRcdCEhYWdlbnRIb3N0UHJvdmlkZXJJZCAmJiBoYXNJbW11dGFibGVQcmltYXJ5V29ya2luZ0RpcmVjdG9yeSh0aGlzLl9hZ2VudEhvc3RTZXJ2aWNlLnJvb3RTdGF0ZS52YWx1ZSwgYWdlbnRIb3N0UHJvdmlkZXJJZCkpO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRzRmlsZVJlZmVyZW5jZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52aWV3T3B0aW9ucy5zdXBwb3J0c0ZpbGVSZWZlcmVuY2VzO1xuXHR9XG5cblx0Z2V0IHJlbmRlcnNJbnB1dE9uVG9wKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdPcHRpb25zLnJlbmRlcklucHV0T25Ub3AgPz8gZmFsc2U7XG5cdH1cblxuXHRnZXQgYXR0YWNobWVudENhcGFiaWxpdGllcygpOiBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnRDYXBhYmlsaXRpZXM7XG5cdH1cblxuXHQvKipcblx0ICogRWl0aGVyIHRoZSBpbmxpbmUgaW5wdXQgKHdoZW4gZWRpdGluZykgb3IgdGhlIG1haW4gaW5wdXQgcGFydFxuXHQgKi9cblx0Z2V0IGlucHV0KCk6IENoYXRJbnB1dFBhcnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdpbnB1dCcgPyB0aGlzLmlubGluZUlucHV0UGFydCA6IHRoaXMuaW5wdXRQYXJ0O1xuXHR9XG5cblx0Z2V0IGNvbnRleHRQaWNrZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMudmlld09wdGlvbnMuY29udGV4dFBpY2tlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBpbnB1dCBwYXJ0IGF0IHRoZSBidXR0b20gb2YgdGhlIGNoYXQgd2lkZ2V0LiBVc2UgYGlucHV0YCB0byBnZXQgdGhlIGFjdGl2ZSBpbnB1dCAobWFpbiBvciBpbmxpbmUgZWRpdGluZyBwYXJ0KS5cblx0ICovXG5cdGdldCBpbnB1dFBhcnQoKTogQ2hhdElucHV0UGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZSE7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpbmxpbmVJbnB1dFBhcnQoKTogQ2hhdElucHV0UGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5saW5lSW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZSE7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdvcmtpbmdQcm9ncmVzc0JvcmRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFBhcnQgPSB0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWU7XG5cdFx0aWYgKCFpbnB1dFBhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBpbnB1dFBhcnQuaW5wdXRDb250YWluZXJFbGVtZW50O1xuXHRcdGlmICghaW5wdXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUHJvZ3Jlc3NCb3JkZXIpID09PSB0cnVlXG5cdFx0XHQmJiAhdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKVxuXHRcdFx0JiYgIWlzSW5saW5lQ2hhdCh0aGlzKTtcblx0XHRjb25zdCBpblByb2dyZXNzID0gISF0aGlzLnZpZXdNb2RlbD8ubW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCk7XG5cdFx0Y29uc3Qgd29ya2luZyA9IGVuYWJsZWQgJiYgaW5Qcm9ncmVzcztcblx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3b3JraW5nJywgd29ya2luZyk7XG5cdFx0c2V0Q2hhdElucHV0U3RhY2tJbnB1dFdvcmtpbmcoaW5wdXRDb250YWluZXIsIHdvcmtpbmcpO1xuXHR9XG5cblx0Z2V0IGlucHV0RWRpdG9yKCk6IElDb2RlRWRpdG9yIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5pbnB1dEVkaXRvcjtcblx0fVxuXG5cdGdldCBjb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuaGVpZ2h0LmdldCgpICsgdGhpcy5saXN0V2lkZ2V0LmNvbnRlbnRIZWlnaHQgKyB0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oZWlnaHQ7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb3A7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHZhbHVlOiBudW1iZXIpIHtcblx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9wID0gdmFsdWU7XG5cdH1cblxuXHRnZXRWaWV3U3RhdGUoKTogSUNoYXRXaWRnZXRWaWV3U3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxUb3A6IHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb3AsXG5cdFx0XHRpc0F0Qm90dG9tOiB0aGlzLmxpc3RXaWRnZXQuaXNTY3JvbGxlZFRvQm90dG9tLFxuXHRcdH07XG5cdH1cblxuXHRyZXN0b3JlVmlld1N0YXRlKHN0YXRlOiBJQ2hhdFdpZGdldFZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdGlmIChzdGF0ZS5pc0F0Qm90dG9tKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9FbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnNjcm9sbFRvcCA9IHN0YXRlLnNjcm9sbFRvcDtcblx0XHR9XG5cdH1cblxuXHRob2xkQXV0b1Njcm9sbCgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5hY3F1aXJlQXV0b1Njcm9sbEhvbGQoKTtcblx0fVxuXG5cdGdldCB0cmFuc2NyaXB0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cdGdldCB2aWV3cG9ydEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGF0dGFjaG1lbnRNb2RlbCgpOiBDaGF0QXR0YWNobWVudE1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5hdHRhY2htZW50TW9kZWw7XG5cdH1cblxuXHRyZW5kZXIocGFyZW50OiBIVE1MRWxlbWVudCwgcGV0TW92ZW1lbnRCb3VuZHM/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdJZCA9IGlzSUNoYXRWaWV3Vmlld0NvbnRleHQodGhpcy52aWV3Q29udGV4dCkgPyB0aGlzLnZpZXdDb250ZXh0LnZpZXdJZCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmVkaXRvck9wdGlvbnMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0b3JPcHRpb25zLCB2aWV3SWQsIHRoaXMuc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLCB0aGlzLnN0eWxlcy5pbnB1dEVkaXRvckJhY2tncm91bmQsIHRoaXMuc3R5bGVzLnJlc3VsdEVkaXRvckJhY2tncm91bmQpKTtcblx0XHRjb25zdCByZW5kZXJJbnB1dE9uVG9wID0gdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJJbnB1dE9uVG9wID8/IGZhbHNlO1xuXHRcdGNvbnN0IHJlbmRlckZvbGxvd3VwcyA9IHRoaXMudmlld09wdGlvbnMucmVuZGVyRm9sbG93dXBzID8/ICFyZW5kZXJJbnB1dE9uVG9wO1xuXHRcdGNvbnN0IHJlbmRlclN0eWxlID0gdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJTdHlsZTtcblx0XHRjb25zdCByZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0ID0gdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0ID8/IGZhbHNlO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgJCgnLmludGVyYWN0aXZlLXNlc3Npb24nKSk7XG5cdFx0dGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsICQoJy5jaGF0LXdlbGNvbWUtdmlldy1jb250YWluZXInLCB7IHN0eWxlOiAnZGlzcGxheTogbm9uZScgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLndlbGNvbWVNZXNzYWdlQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLmZvY3VzSW5wdXQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuYm9keURpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmJvZHlEaW1lbnNpb24uaGVpZ2h0LCB0aGlzLmJvZHlEaW1lbnNpb24ud2lkdGgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5vbkRpZFNlbGVjdFByb21wdCgoeyBoYW5kb2ZmLCBhZ2VudElkLCB3aXRoQXV0b3BpbG90IH0pID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlTmV4dFByb21wdFNlbGVjdGlvbihoYW5kb2ZmLCBhZ2VudElkLCB3aXRoQXV0b3BpbG90KTtcblx0XHR9KSk7XG5cblx0XHRpZiAocmVuZGVySW5wdXRPblRvcCkge1xuXHRcdFx0aWYgKHRoaXMucmVhZE9ubHlCYW5uZXIgJiYgIXRoaXMudmlld09wdGlvbnMucmVhZE9ubHlCYW5uZXJBdFRvcCkge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnJlYWRPbmx5QmFubmVyLmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jcmVhdGVJbnB1dCh0aGlzLmNvbnRhaW5lciwgeyByZW5kZXJGb2xsb3d1cHMsIHJlbmRlclN0eWxlLCByZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0IH0pO1xuXHRcdFx0aWYgKHRoaXMucmVhZE9ubHlCYW5uZXIgJiYgdGhpcy52aWV3T3B0aW9ucy5yZWFkT25seUJhbm5lckF0VG9wKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucmVhZE9ubHlCYW5uZXIuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGAuaW50ZXJhY3RpdmUtbGlzdGApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMucmVhZE9ubHlCYW5uZXIgJiYgdGhpcy52aWV3T3B0aW9ucy5yZWFkT25seUJhbm5lckF0VG9wKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucmVhZE9ubHlCYW5uZXIuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGAuaW50ZXJhY3RpdmUtbGlzdGApKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsIHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0aWYgKHRoaXMucmVhZE9ubHlCYW5uZXIgJiYgIXRoaXMudmlld09wdGlvbnMucmVhZE9ubHlCYW5uZXJBdFRvcCkge1xuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnJlYWRPbmx5QmFubmVyLmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jcmVhdGVJbnB1dCh0aGlzLmNvbnRhaW5lciwgeyByZW5kZXJGb2xsb3d1cHMsIHJlbmRlclN0eWxlLCByZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0IH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0ICYmICFpc0lubGluZUNoYXQodGhpcykgJiYgIXRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXRXaW5kb3cpKSB7XG5cdFx0XHRjb25zdCBpbnB1dENvbnRhaW5lciA9IHRoaXMuaW5wdXRQYXJ0LmlucHV0Q29udGFpbmVyRWxlbWVudDtcblx0XHRcdGNvbnN0IHBldEhvc3QgPSB0aGlzLmlucHV0UGFydC5lbGVtZW50O1xuXHRcdFx0Y29uc3QgaW5wdXRIYXNDb250ZW50ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50LCAoKSA9PiB0aGlzLmlucHV0RWRpdG9yLmdldFZhbHVlKCkubGVuZ3RoID4gMCk7XG5cdFx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGlzTGF0ZXN0Rm9jdXNlZFdpZGdldEluV2luZG93ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQgPT09IHRoaXMpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRXaWRnZXQoZm9jdXNlZFdpZGdldCA9PiB7XG5cdFx0XHRcdGlmIChmb2N1c2VkV2lkZ2V0ICYmIGRvbS5nZXRXaW5kb3coZm9jdXNlZFdpZGdldC5kb21Ob2RlKSA9PT0gdGFyZ2V0V2luZG93KSB7XG5cdFx0XHRcdFx0aXNMYXRlc3RGb2N1c2VkV2lkZ2V0SW5XaW5kb3cuc2V0KGZvY3VzZWRXaWRnZXQgPT09IHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHBldFZpc2libGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBpc0NoYXRQZXRWaXNpYmxlKHRoaXMuY2hhdFBldFNlcnZpY2UuZW5hYmxlZC5yZWFkKHJlYWRlciksIGlzTGF0ZXN0Rm9jdXNlZFdpZGdldEluV2luZG93LnJlYWQocmVhZGVyKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4gdGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1wZXQtZW5hYmxlZCcsIHBldFZpc2libGUucmVhZChyZWFkZXIpKSkpO1xuXHRcdFx0Y29uc3QgcGV0V2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGV0V2lkZ2V0LCBwZXRIb3N0LCBpbnB1dENvbnRhaW5lciA/PyBwZXRIb3N0LCBwZXRNb3ZlbWVudEJvdW5kcyA/PyBwYXJlbnQsIHRoaXMuX3ZpZXdNb2RlbE9icy5tYXAodmlld01vZGVsID0+IHZpZXdNb2RlbD8ubW9kZWwpLCBpbnB1dEhhc0NvbnRlbnQsIHBldFZpc2libGUsIHRoaXMuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQpKTtcblx0XHRcdHBldFdpZGdldC5zZXRQbGF0Zm9ybVRvcFByb3ZpZGVyKCgpID0+IHRoaXMuaW5wdXRQYXJ0LmdldENoYXRQZXRQbGF0Zm9ybVRvcCgpKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcldlbGNvbWVWaWV3Q29udGVudElmTmVlZGVkKCk7XG5cdFx0dGhpcy5jcmVhdGVMaXN0KHRoaXMubGlzdENvbnRhaW5lciwge1xuXHRcdFx0ZWRpdGFibGU6ICFpc0lubGluZUNoYXQodGhpcykgJiYgIWlzUXVpY2tDaGF0KHRoaXMpLFxuXHRcdFx0Y29udGVudEhvcml6b250YWxQYWRkaW5nOiB0aGlzLnZpZXdPcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cgPyBTRVNTSU9OU19DSEFUX0lURU1fSE9SSVpPTlRBTF9QQURESU5HIDogdW5kZWZpbmVkLFxuXHRcdFx0Li4udGhpcy52aWV3T3B0aW9ucy5yZW5kZXJlck9wdGlvbnMsXG5cdFx0XHRyZW5kZXJTdHlsZVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMudmlld09wdGlvbnMuZW5hYmxlRmluZCkge1xuXHRcdFx0Y29uc3QgaG9zdDogSUNoYXRGaW5kSG9zdCA9IHtcblx0XHRcdFx0dHJhbnNjcmlwdERvbU5vZGU6IHRoaXMubGlzdFdpZGdldC5kb21Ob2RlLFxuXHRcdFx0XHRnZXRJdGVtczogKCkgPT4gdGhpcy52aWV3TW9kZWw/LmdldEl0ZW1zKCkgPz8gW10sXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ29udGVudDogdGhpcy5fb25EaWRDaGFuZ2VGaW5kYWJsZUNvbnRlbnQuZXZlbnQsXG5cdFx0XHRcdHJldmVhbDogKGl0ZW0sIHJlbGF0aXZlVG9wKSA9PiB0aGlzLnJldmVhbChpdGVtLCByZWxhdGl2ZVRvcCksXG5cdFx0XHRcdGdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZDogKHJlcXVlc3RJZCkgPT4gdGhpcy5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkKSxcblx0XHRcdFx0b25EaWRSZXJlbmRlclJvdzogdGhpcy5vbkRpZFJlcmVuZGVyUm93LFxuXHRcdFx0XHRlZGl0b3JzSW5Vc2U6ICgpID0+IHRoaXMubGlzdFdpZGdldC5lZGl0b3JzSW5Vc2UoKSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9maW5kQ29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEZpbmRXaWRnZXQsIGhvc3QpKTtcblx0XHRcdC8vIEZvY3VzaW5nIHRoZSBGaW5kIHdpZGdldCBtdXN0IGNvdW50IGFzIGZvY3VzaW5nIHRoaXMgd2lkZ2V0LCBzb1xuXHRcdFx0Ly8gZm9jdXMtdGFyZ2V0ZWQgY29tbWFuZHMgKEVzY2FwZSwgRjMsIHRvb2xiYXIgYWN0aW9ucykgYWx3YXlzXG5cdFx0XHQvLyByZXNvbHZlIHRvIHRoZSBwYW5lIHRoZSB1c2VyIGlzIGFjdHVhbGx5IHR5cGluZy9zZWFyY2hpbmcgaW4uXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9maW5kQ29udHJvbGxlci5mb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKSkpO1xuXHRcdFx0aWYgKHRoaXMuYm9keURpbWVuc2lvbikge1xuXHRcdFx0XHR0aGlzLl9maW5kQ29udHJvbGxlci5sYXlvdXQodGhpcy5ib2R5RGltZW5zaW9uLndpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGb3J3YXJkIHdoZWVsIGV2ZW50cyB0aGF0IHRhcmdldCB0aGUgY2hhdCBjb250YWluZXIgaXRzZWxmICh0aGUgbWFyZ2luc1xuXHRcdC8vIGFyb3VuZCB0aGUgbGlzdCBhbmQgaW5wdXQpIHRvIHRoZSBjaGF0IGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5NT1VTRV9XSEVFTCwgKGU6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQgfHwgZS50YXJnZXQgIT09IHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBGb3J3YXJkIHdoZWVsIGV2ZW50cyBmcm9tIHRoZSBhcmVhIGFyb3VuZCB0aGUgY2hhdCB3aWRnZXQgKGUuZy4gdGhlXG5cdFx0Ly8gbWF4LXdpZHRoIG1hcmdpbnMgaW4gdGhlIGNsYXNzaWMgVlMgQ29kZSBjaGF0IHZpZXcpIHRvIHRoZSBjaGF0IGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfV0hFRUwsIChlOiBJTW91c2VXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgTm9kZSB8IG51bGw7XG5cdFx0XHRpZiAodGFyZ2V0ICYmIGRvbS5pc0FuY2VzdG9yKHRhcmdldCwgdGhpcy5jb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIGZvbnQgZmFtaWx5IGFuZCBzaXplXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9udEZhbWlseSA9IHRoaXMuY2hhdExheW91dFNlcnZpY2UuZm9udEZhbWlseS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmb250U2l6ZSA9IHRoaXMuY2hhdExheW91dFNlcnZpY2UuZm9udFNpemUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY2hhdC1mb250LWZhbWlseScsIGZvbnRGYW1pbHkpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBgJHtmb250U2l6ZX1weGA7XG5cblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJlcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuZWRpdG9yT3B0aW9ucy5vbkRpZENoYW5nZSwgKCkgPT4gdGhpcy5vbkRpZFN0eWxlQ2hhbmdlKCkpKTtcblxuXHRcdC8vIERvIGluaXRpYWwgcmVuZGVyXG5cdFx0aWYgKHRoaXMudmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXMoKTtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0VuZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udHJpYnMgPSBDaGF0V2lkZ2V0LkNPTlRSSUJTLm1hcChjb250cmliID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNvbnRyaWIsIHRoaXMpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBpbnN0YW50aWF0ZSBjaGF0IHdpZGdldCBjb250cmliJywgdG9FcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLnJlZ2lzdGVyKHRoaXMpKTtcblxuXHRcdGNvbnN0IHBhcnNlZElucHV0ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLm9uRGlkQ2hhbmdlUGFyc2VkSW5wdXQsICgpID0+IHRoaXMucGFyc2VkSW5wdXQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHBhcnNlZElucHV0LnJlYWQocik7XG5cblx0XHRcdGNvbnN0IG5ld1Byb21wdEF0dGFjaG1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+KCk7XG5cdFx0XHRjb25zdCBvbGRQcm9tcHRBdHRhY2htZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHQvLyBnZXQgYWxsIGF0dGFjaG1lbnRzLCBrbm93IHRob3NlIHRoYXQgYXJlIHByb21wdC1yZWZlcmVuY2VkXG5cdFx0XHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgdGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMpIHtcblx0XHRcdFx0aWYgKGF0dGFjaG1lbnQucmFuZ2UpIHtcblx0XHRcdFx0XHRvbGRQcm9tcHRBdHRhY2htZW50cy5hZGQoYXR0YWNobWVudC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlL2luc2VydCBwcm9tcHQtcmVmZXJlbmNlZCBhdHRhY2htZW50c1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGlucHV0LnBhcnRzKSB7XG5cdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sUGFydCB8fCBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sU2V0UGFydCB8fCBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0KSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBwYXJ0LnRvVmFyaWFibGVFbnRyeSgpO1xuXHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0ICYmIHBhcnQuaXNBdHRhY2htZW50UmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gdGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuZmluZChhdHRhY2htZW50ID0+IGF0dGFjaG1lbnQuaWQgPT09IHBhcnQuaWQpO1xuXHRcdFx0XHRcdFx0aWYgKGF0dGFjaG1lbnQgJiYgaXNQYXN0ZWRUZXh0QXJ0aWZhY3QoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0XHRcdFx0bmV3UHJvbXB0QXR0YWNobWVudHMuc2V0KGF0dGFjaG1lbnQuaWQsIHsgLi4uYXR0YWNobWVudCwgcmFuZ2U6IHBhcnQucmFuZ2UgfSk7XG5cdFx0XHRcdFx0XHRcdG9sZFByb21wdEF0dGFjaG1lbnRzLmRlbGV0ZShhdHRhY2htZW50LmlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRuZXdQcm9tcHRBdHRhY2htZW50cy5zZXQoZW50cnkuaWQsIGVudHJ5KTtcblx0XHRcdFx0XHRvbGRQcm9tcHRBdHRhY2htZW50cy5kZWxldGUoZW50cnkuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLnVwZGF0ZUNvbnRleHQob2xkUHJvbXB0QXR0YWNobWVudHMsIG5ld1Byb21wdEF0dGFjaG1lbnRzLnZhbHVlcygpKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMuZm9jdXNlZElucHV0RE9NKSB7XG5cdFx0XHR0aGlzLmZvY3VzZWRJbnB1dERPTSA9IHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKGRvbS4kKCcuZm9jdXNlZC1pbnB1dC1kb20nKSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNJbnB1dCgpOiB2b2lkIHtcblx0XHQvLyBSZWFkLW9ubHkgY2hhdHMgaGlkZSB0aGUgaW5wdXQ7IGZvY3VzIHRoZSBtZXNzYWdlIGxpc3QgaW5zdGVhZC5cblx0XHRpZiAoIXRoaXMuX2lucHV0VmlzaWJsZSkge1xuXHRcdFx0aWYgKHRoaXMubGlzdFdpZGdldC5mb2N1c0xhc3RJdGVtKHRydWUpIDwgMCkge1xuXHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblxuXHRcdC8vIFNvbWV0aW1lcyBmb2N1c2luZyB0aGUgaW5wdXQgcGFydCBpcyBub3QgcG9zc2libGUsXG5cdFx0Ly8gYnV0IHdlJ2QgbGlrZSB0byBiZSB0aGUgbGFzdCBmb2N1c2VkIGNoYXQgd2lkZ2V0LFxuXHRcdC8vIHNvIHdlIGVtaXQgYW4gb3B0aW1pc3RpYyBvbkRpZEZvY3VzIGV2ZW50IG5vbmV0aGVsZXNzLlxuXHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHR9XG5cblx0Zm9jdXNUb2Rvc1ZpZXcoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0Lmhhc1Zpc2libGVUb2RvcygpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZm9jdXNUb2RvTGlzdCgpO1xuXHR9XG5cblx0dG9nZ2xlVG9kb3NWaWV3Rm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0Lmhhc1Zpc2libGVUb2RvcygpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXQuaXNUb2RvTGlzdEZvY3VzZWQoKSkge1xuXHRcdFx0dGhpcy5mb2N1c0lucHV0KCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5mb2N1c1RvZG9MaXN0KCk7XG5cdH1cblxuXHRmb2N1c1F1ZXN0aW9uQ2Fyb3VzZWwoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0LnF1ZXN0aW9uQ2Fyb3VzZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWwoKTtcblx0fVxuXG5cdHRvZ2dsZVF1ZXN0aW9uQ2Fyb3VzZWxGb2N1cygpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaW5wdXQucXVlc3Rpb25DYXJvdXNlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0LmlzUXVlc3Rpb25DYXJvdXNlbEZvY3VzZWQoKSkge1xuXHRcdFx0dGhpcy5mb2N1c0lucHV0KCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWwoKTtcblx0fVxuXG5cdG5hdmlnYXRlVG9QcmV2aW91c1F1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5pbnB1dC5xdWVzdGlvbkNhcm91c2VsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQubmF2aWdhdGVUb1ByZXZpb3VzUXVlc3Rpb24oKTtcblx0fVxuXG5cdG5hdmlnYXRlVG9OZXh0UXVlc3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0LnF1ZXN0aW9uQ2Fyb3VzZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5uYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk7XG5cdH1cblxuXHRmb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbCgpO1xuXHR9XG5cblx0aGFzSW5wdXRGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5oYXNGb2N1cygpO1xuXHR9XG5cblx0cmVmcmVzaFBhcnNlZElucHV0KCkge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMucGFyc2VkQ2hhdFJlcXVlc3Q7XG5cdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdHNlbGVjdGVkQWdlbnQ6IHRoaXMuX2xhc3RTZWxlY3RlZEFnZW50LFxuXHRcdFx0bW9kZTogdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQsXG5cdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB0aGlzLmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMsXG5cdFx0XHRzZXNzaW9uVHlwZTogZ2V0Q2hhdFNlc3Npb25UeXBlKHRoaXMudmlld01vZGVsLm1vZGVsLnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRmb3JjZWRBZ2VudDogdGhpcy5fbG9ja2VkQWdlbnQ/LmlkID8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHRoaXMuX2xvY2tlZEFnZW50LmlkKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKS5wYXJzZUNoYXRSZXF1ZXN0V2l0aFJlZmVyZW5jZXMoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh0aGlzKSwgZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQodGhpcyksIHRoaXMuZ2V0SW5wdXQoKSwgdGhpcy5sb2NhdGlvbiwgY29udGV4dCk7XG5cdFx0aWYgKCFwcmV2aW91cyB8fCAhSVBhcnNlZENoYXRSZXF1ZXN0LmVxdWFscyhwcmV2aW91cywgdGhpcy5wYXJzZWRDaGF0UmVxdWVzdCkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUGFyc2VkSW5wdXQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNpYmxpbmcoaXRlbTogQ2hhdFRyZWVJdGVtLCB0eXBlOiAnbmV4dCcgfCAncHJldmlvdXMnKTogQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpO1xuXHRcdGlmICghaXRlbXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVzcG9uc2VJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGlzUmVzcG9uc2VWTShpKSk7XG5cdFx0Y29uc3QgdGFyZ2V0SW5kZXggPSByZXNwb25zZUl0ZW1zLmluZGV4T2YoaXRlbSk7XG5cdFx0aWYgKHRhcmdldEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXhUb0ZvY3VzID0gdHlwZSA9PT0gJ25leHQnID8gdGFyZ2V0SW5kZXggKyAxIDogdGFyZ2V0SW5kZXggLSAxO1xuXHRcdGlmIChpbmRleFRvRm9jdXMgPCAwIHx8IGluZGV4VG9Gb2N1cyA+IHJlc3BvbnNlSXRlbXMubGVuZ3RoIC0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzcG9uc2VJdGVtc1tpbmRleFRvRm9jdXNdO1xuXHR9XG5cblx0YXN5bmMgY2xlYXIodGFyZ2V0U2Vzc2lvblR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NoYXRXaWRnZXQjY2xlYXInKTtcblx0XHRpZiAodGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhKSB7XG5cdFx0XHR0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEuZW5hYmxlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwucmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9sb2NrZWRBZ2VudCkge1xuXHRcdFx0dGhpcy5sb2NrVG9Db2RpbmdBZ2VudCh0aGlzLl9sb2NrZWRBZ2VudC5uYW1lLCB0aGlzLl9sb2NrZWRBZ2VudC5kaXNwbGF5TmFtZSwgdGhpcy5fbG9ja2VkQWdlbnQuaWQsIHRoaXMuX2xvY2tlZEFnZW50LmFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnVubG9ja0Zyb21Db2RpbmdBZ2VudCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXRQYXJ0Py5jbGVhclRvZG9MaXN0V2lkZ2V0KHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdHRoaXMuaW5wdXRQYXJ0Py5jbGVhckFydGlmYWN0c1dpZGdldCgpO1xuXHRcdHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhpZGUoKTtcblx0XHRhd2FpdCB0aGlzLnZpZXdPcHRpb25zLmNsZWFyPy4odGFyZ2V0U2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUl0ZW1zKHNraXBEeW5hbWljTGF5b3V0PzogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl92aXNpYmxlIHx8ICF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKSA/PyBbXTtcblxuXHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyV2VsY29tZVZpZXdDb250ZW50SWZOZWVkZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25XaWxsTWF5YmVDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXG5cdFx0XHQvLyBVcGRhdGUgbGlzdCB3aWRnZXQgc3RhdGUgYW5kIHJlZnJlc2hcblx0XHRcdHRoaXMubGlzdFdpZGdldC5zZXRWaXNpYmxlQ2hhbmdlQ291bnQodGhpcy52aXNpYmxlQ2hhbmdlQ291bnQpO1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblxuXHRcdFx0aWYgKCFza2lwRHluYW1pY0xheW91dCAmJiB0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXREeW5hbWljQ2hhdFRyZWVJdGVtTW9kZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlckZvbGxvd3VwcygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBET00gdmlzaWJpbGl0eSBvZiB3ZWxjb21lIHZpZXcgYW5kIGNoYXQgbGlzdCBpbW1lZGlhdGVseVxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2hvd1dlbGNvbWUgPSBzaG91bGRTaG93Q2hhdFdlbGNvbWUoXG5cdFx0XHR0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGgsXG5cdFx0XHR0aGlzLnRyYW5zY3JpcHRQcm9ncmVzc0FjdGl2ZSB8fCB0aGlzLnRyYW5zY3JpcHRDb250ZXh0VmFsdWUgIT09IHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGlmIChzaG93V2VsY29tZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkb20uc2V0VmlzaWJpbGl0eShzaG93V2VsY29tZSwgdGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lcik7XG5cdFx0XHRkb20uc2V0VmlzaWJpbGl0eSghc2hvd1dlbGNvbWUsIHRoaXMubGlzdENvbnRhaW5lcik7XG5cblx0XHRcdC8vIFJlLWV2YWx1YXRlIHRoZSBnZXR0aW5nLXN0YXJ0ZWQgdGlwLiBXaGVuIHRoZSBlbXB0eSBzdGF0ZSBnb2VzIGF3YXkgdGhlXG5cdFx0XHQvLyBwcmVzZW50ZXIgZHJvcHMgdGhlIGNhY2hlZCB0aXAgc28gdGhlIG5leHQgZW1wdHkgc3RhdGUgcGlja3MgYSBmcmVzaFxuXHRcdFx0Ly8gKHJvdGF0ZWQpIG9uZSBpbnN0ZWFkIG9mIHJlLXNob3dpbmcgdGhlIHN0YWxlIHRpcC5cblx0XHRcdHRoaXMucmVuZGVyR2V0dGluZ1N0YXJ0ZWRUaXBJZk5lZWRlZCgpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgc2hvdyB3ZWxjb21lIGdldHRpbmcgc3RhcnRlZCB1bnRpbCBzZXR1cCBpcyBjb21wbGV0ZWRcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKFxuXHRcdFx0J2NoYXQtdmlldy1nZXR0aW5nLXN0YXJ0ZWQtZGlzYWJsZWQnLFxuXHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmhhc0J5b2tNb2RlbHMpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbXB0eVN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPz8gMCkgPT09IDA7XG5cdH1cblxuXHRzZXRUcmFuc2NyaXB0UHJvZ3Jlc3MobWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBhcmlhTGFiZWwgPSBtZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnRyYW5zY3JpcHRQcm9ncmVzcykge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmxpc3RDb250YWluZXIsICQoJy5jaGF0LXRyYW5zY3JpcHQtcHJvZ3Jlc3MnKSk7XG5cdFx0XHRjb250YWluZXIuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG5cdFx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAncG9saXRlJyk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5pbnRlcmFjdGl2ZS1pdGVtLWNvbnRhaW5lcicpKTtcblx0XHRcdGNvbnRlbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHR0aGlzLnRyYW5zY3JpcHRQcm9ncmVzcyA9IHsgY29udGFpbmVyLCBjb250ZW50IH07XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNjcmlwdFByb2dyZXNzUGFydC5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy50cmFuc2NyaXB0UHJvZ3Jlc3MuY29udGVudCk7XG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHRjb25zdCByZW5kZXJlZE1lc3NhZ2UgPSBzdG9yZS5hZGQocmVuZGVyZXIucmVuZGVyKG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQobWVzc2FnZSkpKTtcblx0XHRcdGNvbnN0IHByb2dyZXNzUGFydCA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQcm9ncmVzc1N1YlBhcnQsIHJlbmRlcmVkTWVzc2FnZS5lbGVtZW50LCBDb2RpY29uLmNoZWNrLCB1bmRlZmluZWQpKTtcblx0XHRcdHByb2dyZXNzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3NoaW1tZXItcHJvZ3Jlc3MnKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy50cmFuc2NyaXB0UHJvZ3Jlc3MuY29udGVudCwgcHJvZ3Jlc3NQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy50cmFuc2NyaXB0UHJvZ3Jlc3NQYXJ0LnZhbHVlID0gc3RvcmU7XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNjcmlwdFByb2dyZXNzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwgPz8gJycpO1xuXHRcdHRoaXMudHJhbnNjcmlwdFByb2dyZXNzLmNvbnRhaW5lci5oaWRkZW4gPSBtZXNzYWdlID09PSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50cmFuc2NyaXB0UHJvZ3Jlc3NBY3RpdmUgPSBtZXNzYWdlICE9PSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC10cmFuc2NyaXB0LXByb2dyZXNzLWFjdGl2ZScsIG1lc3NhZ2UgIT09IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0fVxuXG5cdHNldFRyYW5zY3JpcHRDb250ZXh0KGNvbnRleHQ6IElDaGF0UmVxdWVzdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMudHJhbnNjcmlwdENvbnRleHRWYWx1ZSA9IGNvbnRleHQ7XG5cdFx0aWYgKCF0aGlzLnRyYW5zY3JpcHRDb250ZXh0KSB7XG5cdFx0XHR0aGlzLnRyYW5zY3JpcHRDb250ZXh0ID0gZG9tLmFwcGVuZCh0aGlzLmxpc3RDb250YWluZXIsICQoJy5jaGF0LXRyYW5zY3JpcHQtY29udGV4dC5jaGF0LWF0dGFjaGVkLWNvbnRleHQnKSk7XG5cdFx0XHR0aGlzLnRyYW5zY3JpcHRDb250ZXh0LmhpZGRlbiA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMudHJhbnNjcmlwdENvbnRleHQuaGlkZGVuID0gY29udGV4dCA9PT0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHR0aGlzLnRyYW5zY3JpcHRDb250ZXh0UGFydC52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsIHtcblx0XHRcdFx0dmFyaWFibGVzOiBbY29udGV4dF0sXG5cdFx0XHRcdGRvbU5vZGU6IHRoaXMudHJhbnNjcmlwdENvbnRleHQsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmFuc2NyaXB0Q29udGV4dFBhcnQuY2xlYXIoKTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy50cmFuc2NyaXB0Q29udGV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdHJhbnNjcmlwdC1jb250ZXh0LWFjdGl2ZScsIGNvbnRleHQgIT09IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSB3ZWxjb21lIHZpZXcgY29udGVudCB3aGVuIG5lZWRlZC5cblx0ICovXG5cdHByaXZhdGUgcmVuZGVyV2VsY29tZVZpZXdDb250ZW50SWZOZWVkZWQoKSB7XG5cdFx0aWYgKHRoaXMuX2lzUmVuZGVyaW5nV2VsY29tZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBpbnB1dCBwYXJ0IG1heSBub3QgYmUgcmVuZGVyZWQgeWV0IChvciBtYXkgaGF2ZSBiZWVuIGRpc3Bvc2VkKSB3aGVuIHRoaXMgaXNcblx0XHQvLyBjYWxsZWQgZnJvbSBhc3luYyBmbG93cyBzdWNoIGFzIGBsb2NrVG9Db2RpbmdBZ2VudGAgLyBgdW5sb2NrRnJvbUNvZGluZ0FnZW50YCB0aGF0XG5cdFx0Ly8gcnVuIGFmdGVyIGBzaG93TW9kZWxgIHJlc29sdmVzLiBCYWlsIG91dCB0byBhdm9pZCBkZXJlZmVyZW5jaW5nIGFuIHVuZGVmaW5lZCBpbnB1dC5cblx0XHRpZiAoIXRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzUmVuZGVyaW5nV2VsY29tZSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0aGlzLnZpZXdPcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcgfHwgdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ21pbmltYWwnIHx8IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBudW1JdGVtcyA9IHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpLmxlbmd0aCA/PyAwO1xuXHRcdFx0aWYgKCFudW1JdGVtcykge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KHRoaXMubG9jYXRpb24sIHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kKTtcblx0XHRcdFx0bGV0IGFkZGl0aW9uYWxNZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzICYmICF0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmNvbXBsZXRlZCAmJiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlcnMgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXI7XG5cdFx0XHRcdFx0YWRkaXRpb25hbE1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoeyBrZXk6ICdzZXR0aW5ncycsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezJ9KVwifScsICd7TG9ja2VkPVwiXSh7M30pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nIHdpdGggezB9IENvcGlsb3QsIHlvdSBhZ3JlZSB0byB7MX0ncyBbVGVybXNdKHsyfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezN9KS5cIiwgcHJvdmlkZXJzLmRlZmF1bHQubmFtZSwgcHJvdmlkZXJzLmRlZmF1bHQubmFtZSwgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50LnRlcm1zU3RhdGVtZW50VXJsLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQucHJpdmFjeVN0YXRlbWVudFVybCksIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNZXNzYWdlID0gZGVmYXVsdEFnZW50Py5tZXRhZGF0YS5hZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFhZGRpdGlvbmFsTWVzc2FnZSAmJiAhdGhpcy5fbG9ja2VkQWdlbnQpIHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTWVzc2FnZSA9IHRoaXMuX2dldEdlbmVyYXRlSW5zdHJ1Y3Rpb25zTWVzc2FnZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdlbGNvbWVDb250ZW50ID0gdGhpcy5nZXRXZWxjb21lVmlld0NvbnRlbnQoYWRkaXRpb25hbE1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAoIXRoaXMud2VsY29tZVBhcnQudmFsdWUgfHwgdGhpcy53ZWxjb21lUGFydC52YWx1ZS5uZWVkc1JlcmVuZGVyKHdlbGNvbWVDb250ZW50KSkge1xuXHRcdFx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lcik7XG5cblx0XHRcdFx0XHR0aGlzLndlbGNvbWVQYXJ0LnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdENoYXRWaWV3V2VsY29tZVBhcnQsXG5cdFx0XHRcdFx0XHR3ZWxjb21lQ29udGVudCxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRcdFx0XHRcdGlzV2lkZ2V0QWdlbnRXZWxjb21lVmlld0NvbnRlbnQ6IHRoaXMuaW5wdXQ/LmN1cnJlbnRNb2RlS2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRkb20uYXBwZW5kKHRoaXMud2VsY29tZU1lc3NhZ2VDb250YWluZXIsIHRoaXMud2VsY29tZVBhcnQudmFsdWUuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNSZW5kZXJpbmdXZWxjb21lID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJHZXR0aW5nU3RhcnRlZFRpcElmTmVlZGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwLnZhbHVlPy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZUdldHRpbmdTdGFydGVkVGlwKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyR2V0dGluZ1N0YXJ0ZWRUaXBJZk5lZWRlZCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBzdXJmYWNlIGN1cnJlbnRseSB3YW50cyB0byBzaG93IGEgZ2V0dGluZy1zdGFydGVkIHRpcC4gTWlycm9yc1xuXHQgKiB0aGUgY29uZGl0aW9ucyB1bmRlciB3aGljaCB0aGUgd2VsY29tZSB2aWV3IGlzIHNob3duLCBzaW5jZSB0aGUgdGlwIG9ubHlcblx0ICogYmVsb25ncyB0byB0aGUgZW1wdHkgc3RhdGUgb2YgdGhlIHN0YW5kYXJkIGNoYXQgbGF5b3V0LlxuXHQgKi9cblx0cHJpdmF0ZSBpc0dldHRpbmdTdGFydGVkVGlwRWxpZ2libGUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLnZpZXdPcHRpb25zLnJlbmRlckdldHRpbmdTdGFydGVkVGlwID09PSAnZnVuY3Rpb24nXG5cdFx0XHQ/ICF0aGlzLnZpZXdPcHRpb25zLnJlbmRlckdldHRpbmdTdGFydGVkVGlwKClcblx0XHRcdDogdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJHZXR0aW5nU3RhcnRlZFRpcCA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld09wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyB8fCB0aGlzLnZpZXdPcHRpb25zLnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNMb2FkaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBzaG91bGRTaG93Q2hhdFRpcCh0aGlzLnZpZXdNb2RlbC5nZXRJdGVtcygpLmxlbmd0aCwgdGhpcy50cmFuc2NyaXB0UHJvZ3Jlc3NBY3RpdmUgfHwgdGhpcy50cmFuc2NyaXB0Q29udGV4dFZhbHVlICE9PSB1bmRlZmluZWQsIHRoaXMuX2lzTG9hZGluZyk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyR2V0dGluZ1N0YXJ0ZWRUaXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2V0dGluZ1N0YXJ0ZWRUaXAudmFsdWU/LmNsZWFyKCk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2dldEdlbmVyYXRlSW5zdHJ1Y3Rpb25zTWVzc2FnZSgpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdC8vIFN0YXJ0IGNoZWNraW5nIGZvciBpbnN0cnVjdGlvbiBmaWxlcyBpbW1lZGlhdGVseSBpZiBub3QgYWxyZWFkeSBkb25lXG5cdFx0aWYgKCF0aGlzLl9pbnN0cnVjdGlvbkZpbGVzQ2hlY2tQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9pbnN0cnVjdGlvbkZpbGVzQ2hlY2tQcm9taXNlID0gdGhpcy5fY2hlY2tGb3JBZ2VudEluc3RydWN0aW9uRmlsZXMoKTtcblx0XHRcdC8vIFVzZSBWUyBDb2RlJ3MgaWRpb21hdGljIHBhdHRlcm4gZm9yIGRpc3Bvc2FsLXNhZmUgcHJvbWlzZSBjYWxsYmFja3Ncblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW5JZk5vdERpc3Bvc2VkKHRoaXMuX2luc3RydWN0aW9uRmlsZXNDaGVja1Byb21pc2UsIGhhc0ZpbGVzID0+IHtcblx0XHRcdFx0dGhpcy5faW5zdHJ1Y3Rpb25GaWxlc0V4aXN0ID0gaGFzRmlsZXM7XG5cdFx0XHRcdC8vIE9ubHkgcmUtcmVuZGVyIGlmIHRoZSBjdXJyZW50IHZpZXcgc3RpbGwgZG9lc24ndCBoYXZlIGl0ZW1zIGFuZCB3ZSdyZSBzaG93aW5nIHRoZSB3ZWxjb21lIG1lc3NhZ2Vcblx0XHRcdFx0Y29uc3QgaGFzVmlld01vZGVsSXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPz8gMDtcblx0XHRcdFx0aWYgKGhhc1ZpZXdNb2RlbEl0ZW1zID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBrbm93IHRoZSByZXN1bHQsIHVzZSBpdFxuXHRcdGlmICh0aGlzLl9pbnN0cnVjdGlvbkZpbGVzRXhpc3QgPT09IHRydWUpIHtcblx0XHRcdC8vIERvbid0IHNob3cgZ2VuZXJhdGUgaW5zdHJ1Y3Rpb25zIG1lc3NhZ2UgaWYgZmlsZXMgZXhpc3Rcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faW5zdHJ1Y3Rpb25GaWxlc0V4aXN0ID09PSBmYWxzZSkge1xuXHRcdFx0Ly8gU2hvdyBnZW5lcmF0ZSBpbnN0cnVjdGlvbnMgbWVzc2FnZSBpZiBubyBmaWxlcyBleGlzdFxuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXRXaWRnZXQuaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XCJbR2VuZXJhdGUgQWdlbnQgSW5zdHJ1Y3Rpb25zXSh7MH0pIHRvIG9uYm9hcmQgQUkgb250byB5b3VyIGNvZGViYXNlLlwiLFxuXHRcdFx0XHRgY29tbWFuZDoke0dFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEfWBcblx0XHRcdCksIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW0dFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEXSB9IH0pO1xuXHRcdH1cblxuXHRcdC8vIFdoaWxlIGNoZWNraW5nLCBkb24ndCBzaG93IHRoZSBnZW5lcmF0ZSBpbnN0cnVjdGlvbnMgbWVzc2FnZVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhbnkgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgKC5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQgb3IgQUdFTlRTLm1kKSBleGlzdCBpbiB0aGUgd29ya3NwYWNlLlxuXHQgKiBVc2VkIHRvIGRldGVybWluZSB3aGV0aGVyIHRvIHNob3cgdGhlIFwiR2VuZXJhdGUgQWdlbnQgSW5zdHJ1Y3Rpb25zXCIgaGludC5cblx0ICpcblx0ICogQHJldHVybnMgdHJ1ZSBpZiBpbnN0cnVjdGlvbiBmaWxlcyBleGlzdCBPUiBpZiBpbnN0cnVjdGlvbiBmZWF0dXJlcyBhcmUgZGlzYWJsZWQgKHRvIGhpZGUgdGhlIGhpbnQpXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jaGVja0ZvckFnZW50SW5zdHJ1Y3Rpb25GaWxlcygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubGVuZ3RoID4gMDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gT24gZXJyb3IsIGFzc3VtZSBubyBpbnN0cnVjdGlvbiBmaWxlcyBleGlzdCB0byBiZSBzYWZlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0NoYXRXaWRnZXRdIEVycm9yIGNoZWNraW5nIGZvciBpbnN0cnVjdGlvbiBmaWxlczonLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXZWxjb21lVmlld0NvbnRlbnQoYWRkaXRpb25hbE1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IElDaGF0Vmlld1dlbGNvbWVDb250ZW50IHtcblx0XHRpZiAodGhpcy5pc0xvY2tlZFRvQ29kaW5nQWdlbnQpIHtcblx0XHRcdC8vIENoZWNrIGZvciBwcm92aWRlci1zcGVjaWZpYyBjdXN0b21pemF0aW9ucyBmcm9tIGNoYXQgc2Vzc2lvbnMgc2VydmljZVxuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fbG9ja2VkQWdlbnQgPyB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24odGhpcy5fbG9ja2VkQWdlbnQuaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJJY29uID0gY29udHJpYnV0aW9uPy5pY29uO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJUaXRsZSA9IGNvbnRyaWJ1dGlvbj8ud2VsY29tZVRpdGxlO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJNZXNzYWdlID0gY29udHJpYnV0aW9uPy53ZWxjb21lTWVzc2FnZTtcblxuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gZGVmYXVsdCBtZXNzYWdlcyBpZiBwcm92aWRlciBkb2Vzbid0IHNwZWNpZnlcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwcm92aWRlck1lc3NhZ2Vcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcocHJvdmlkZXJNZXNzYWdlKVxuXHRcdFx0XHQ6ICh0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4ID09PSAnQGNvcGlsb3QgJ1xuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjb3BpbG90Q29kaW5nQWdlbnRNZXNzYWdlJywgXCJUaGlzIGNoYXQgc2Vzc2lvbiB3aWxsIGJlIGZvcndhcmRlZCB0byB0aGUgezB9IFtjb2RpbmcgYWdlbnRdKHsxfSkgd2hlcmUgd29yayBpcyBjb21wbGV0ZWQgaW4gdGhlIGJhY2tncm91bmQuIFwiLCB0aGlzLl9sb2NrZWRBZ2VudC5wcmVmaXgsICdodHRwczovL2FrYS5tcy9jb2RpbmctYWdlbnQtZG9jcycpICsgRElTQ0xBSU1FUiwgeyBpc1RydXN0ZWQ6IHRydWUgfSlcblx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZ2VuZXJpY0NvZGluZ0FnZW50TWVzc2FnZScsIFwiVGhpcyBjaGF0IHNlc3Npb24gd2lsbCBiZSBmb3J3YXJkZWQgdG8gdGhlIHswfSBjb2RpbmcgYWdlbnQgd2hlcmUgd29yayBpcyBjb21wbGV0ZWQgaW4gdGhlIGJhY2tncm91bmQuIFwiLCB0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4KSArIERJU0NMQUlNRVIpKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHByb3ZpZGVyVGl0bGUgPz8gbG9jYWxpemUoJ2NvZGluZ0FnZW50VGl0bGUnLCBcIkRlbGVnYXRlIHRvIHswfVwiLCB0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4KSxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0aWNvbjogcHJvdmlkZXJJY29uID8/IENvZGljb24uc2VuZFRvUmVtb3RlQWdlbnQsXG5cdFx0XHRcdGFkZGl0aW9uYWxNZXNzYWdlLFxuXHRcdFx0XHR1c2VMYXJnZUljb246ICEhcHJvdmlkZXJJY29uLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZztcblx0XHRpZiAodGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQgPT09IENoYXRNb2RlS2luZC5Bc2spIHtcblx0XHRcdHRpdGxlID0gbG9jYWxpemUoJ2NoYXREZXNjcmlwdGlvbicsIFwiQXNrIGFib3V0IHlvdXIgY29kZVwiKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kID09PSBDaGF0TW9kZUtpbmQuRWRpdCkge1xuXHRcdFx0dGl0bGUgPSBsb2NhbGl6ZSgnZWRpdHNUaXRsZScsIFwiRWRpdCBpbiBjb250ZXh0XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aXRsZSA9IGxvY2FsaXplKCdhZ2VudFRpdGxlJywgXCJCdWlsZCB3aXRoIEFnZW50XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0aXRsZSxcblx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhESVNDTEFJTUVSKSxcblx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRhZGRpdGlvbmFsTWVzc2FnZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuaW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dC5yZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSh0aGlzLl9lZGl0aW5nU2Vzc2lvbi5nZXQoKSA/PyBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyRm9sbG93dXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhc3RJdGVtID0gdGhpcy5saXN0V2lkZ2V0Lmxhc3RJdGVtO1xuXHRcdGlmIChsYXN0SXRlbSAmJiBpc1Jlc3BvbnNlVk0obGFzdEl0ZW0pICYmIGxhc3RJdGVtLmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyRm9sbG93dXBzKGxhc3RJdGVtLnJlcGx5Rm9sbG93dXBzLCBsYXN0SXRlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyRm9sbG93dXBzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRTdWdnZXN0TmV4dFdpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZWFkT25seSkge1xuXHRcdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgcmVuZGVyaW5nIGluIGNvZGluZyBhZ2VudCBzZXNzaW9ucyB1bmxlc3MgdGhlIGFnZW50IHN1cHBvcnRzIGhhbmQtb2Zmc1xuXHRcdGlmICh0aGlzLmlzTG9ja2VkVG9Db2RpbmdBZ2VudCAmJiAhdGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c0hhbmRPZmZzKSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKSA/PyBbXTtcblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RJdGVtID0gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlQ29tcGxldGUgPSBsYXN0SXRlbSAmJiBpc1Jlc3BvbnNlVk0obGFzdEl0ZW0pICYmIGxhc3RJdGVtLmlzQ29tcGxldGU7XG5cdFx0aWYgKCFsYXN0UmVzcG9uc2VDb21wbGV0ZSB8fCBsYXN0SXRlbS5pc0NhbmNlbGVkKSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVyaXZlIGhhbmRvZmZzIGZyb20gdGhlIG1vZGUgdGhhdCBnZW5lcmF0ZWQgdGhlIGxhc3QgcmVzcG9uc2UsIG5vdCB0aGUgY3VycmVudCBVSSBzZWxlY3Rpb24uXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIGhhbmRvZmZzIHJlZmxlY3Qgd2hhdCB0aGUgcmVzcG9uc2UgYWdlbnQgb2ZmZXJzLCByZWdhcmRsZXNzIG9mIG1vZGUgcGlja2VyIHN0YXRlLlxuXHRcdC8vIEZhbGwgYmFjayB0byB0aGUgY3VycmVudCBtb2RlIHBpY2tlciBmb3Igb2xkIHNlc3Npb25zIHdoZXJlIG1vZGVJbmZvIHdhcyBub3QgcGVyc2lzdGVkLlxuXHRcdGNvbnN0IG1vZGVJbmZvID0gbGFzdEl0ZW0ubW9kZWwucmVxdWVzdD8ubW9kZUluZm87XG5cdFx0bGV0IHJlc3BvbnNlTW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGVzID0gdGhpcy5pbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLmdldCgpO1xuXHRcdGlmIChtb2RlSW5mbz8ubW9kZUluc3RydWN0aW9ucz8ubmFtZSkge1xuXHRcdFx0cmVzcG9uc2VNb2RlID0gbW9kZXMuZmluZE1vZGVCeU5hbWUobW9kZUluZm8ubW9kZUluc3RydWN0aW9ucy5uYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzcG9uc2VNb2RlID0gdGhpcy5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kb2ZmcyA9IHJlc3BvbnNlTW9kZT8uaGFuZE9mZnM/LmdldCgpO1xuXG5cdFx0aWYgKHJlc3BvbnNlTW9kZSAmJiBoYW5kb2ZmcyAmJiBoYW5kb2Zmcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBJbiBBdXRvcGlsb3QgbW9kZSwgYXV0b21hdGljYWxseSB0cmlnZ2VyIHRoZSBmaXJzdCBhdXRvLXNlbmQgaGFuZG9mZlxuXHRcdFx0Ly8gc28gdGhlIHBsYW4gZmxvd3Mgc2VhbWxlc3NseSBpbnRvIGltcGxlbWVudGF0aW9uIHdpdGhvdXQgdXNlciBpbnRlcmFjdGlvbi5cblx0XHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IHRoaXMuaW5wdXRQYXJ0LmN1cnJlbnRNb2RlSW5mby5wZXJtaXNzaW9uTGV2ZWw7XG5cdFx0XHRpZiAocGVybWlzc2lvbkxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCkge1xuXHRcdFx0XHRjb25zdCBhdXRvU2VuZEhhbmRvZmYgPSBoYW5kb2Zmcy5maW5kKGggPT4gaC5zZW5kKTtcblx0XHRcdFx0aWYgKGF1dG9TZW5kSGFuZG9mZikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlTmV4dFByb21wdFNlbGVjdGlvbihhdXRvU2VuZEhhbmRvZmYpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb2cgdGVsZW1ldHJ5IG9ubHkgd2hlbiB3aWRnZXQgdHJhbnNpdGlvbnMgZnJvbSBoaWRkZW4gdG8gdmlzaWJsZVxuXHRcdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZSc7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5yZW5kZXIocmVzcG9uc2VNb2RlKTtcblxuXHRcdFx0aWYgKHdhc0hpZGRlbikge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0SGFuZG9mZldpZGdldFNob3duRXZlbnQsIENoYXRIYW5kb2ZmV2lkZ2V0U2hvd25DbGFzc2lmaWNhdGlvbj4oJ2NoYXQuaGFuZG9mZldpZGdldFNob3duJywge1xuXHRcdFx0XHRcdGFnZW50OiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShyZXNwb25zZU1vZGUpLFxuXHRcdFx0XHRcdGhhbmRvZmZDb3VudDogaGFuZG9mZnMubGVuZ3RoXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciBsYXlvdXQgdXBkYXRlXG5cdFx0aWYgKHRoaXMuYm9keURpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5ib2R5RGltZW5zaW9uLmhlaWdodCwgdGhpcy5ib2R5RGltZW5zaW9uLndpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU5leHRQcm9tcHRTZWxlY3Rpb24oaGFuZG9mZjogSUhhbmRPZmYsIGFnZW50SWQ/OiBzdHJpbmcsIHdpdGhBdXRvcGlsb3Q/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gSGlkZSB0aGUgd2lkZ2V0IGFmdGVyIHNlbGVjdGlvblxuXHRcdHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhpZGUoKTtcblxuXHRcdC8vIElmIHN0YXJ0aW5nIHdpdGggQXV0b3BpbG90LCBzZXQgcGVybWlzc2lvbiBsZXZlbCBiZWZvcmUgc3VibWl0dGluZ1xuXHRcdGlmICh3aXRoQXV0b3BpbG90KSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydC5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdFRvVXNlID0gaGFuZG9mZi5wcm9tcHQ7XG5cblx0XHQvLyBMb2cgdGVsZW1ldHJ5XG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpO1xuXHRcdGNvbnN0IHRvTW9kZSA9IGhhbmRvZmYuYWdlbnQgPyB0aGlzLmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCkuZmluZE1vZGVCeU5hbWUoaGFuZG9mZi5hZ2VudCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdEhhbmRvZmZDbGlja0V2ZW50LCBDaGF0SGFuZG9mZkNsaWNrQ2xhc3NpZmljYXRpb24+KCdjaGF0LmhhbmRvZmZDbGlja2VkJywge1xuXHRcdFx0ZnJvbUFnZW50OiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShjdXJyZW50TW9kZSksXG5cdFx0XHR0b0FnZW50OiBhZ2VudElkIHx8ICh0b01vZGUgPyBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeSh0b01vZGUpIDogJycpLFxuXHRcdFx0aGFzUHJvbXB0OiBCb29sZWFuKHByb21wdFRvVXNlKSxcblx0XHRcdGF1dG9TZW5kOiBCb29sZWFuKGhhbmRvZmYuc2VuZClcblx0XHR9KTtcblxuXHRcdHRoaXMuZXhlY3V0ZUhhbmRvZmYoaGFuZG9mZiwgYWdlbnRJZCkuY2F0Y2goZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhZ2VudElkID8/IGhhbmRvZmYuYWdlbnQgPz8gJ3Vua25vd24nO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIGV4ZWN1dGUgaGFuZG9mZiAnJHtoYW5kb2ZmLmxhYmVsfScgdG8gJyR7dGFyZ2V0fSdgLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGV4ZWN1dGVIYW5kb2ZmKGhhbmRvZmY6IElIYW5kT2ZmLCBhZ2VudElkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXG5cdFx0Y29uc3QgcHJvbXB0VG9Vc2UgPSBoYW5kb2ZmLnByb21wdDtcblxuXHRcdC8vIElmIGFnZW50SWQgaXMgcHJvdmlkZWQgKGZyb20gY2hldnJvbiBkcm9wZG93biksIGRlbGVnYXRlIHRvIHRoYXQgY2hhdCBzZXNzaW9uXG5cdFx0Ly8gT3RoZXJ3aXNlLCBzd2l0Y2ggdG8gdGhlIGhhbmRvZmYgYWdlbnRcblx0XHRpZiAoYWdlbnRJZCkge1xuXHRcdFx0Ly8gRGVsZWdhdGUgdG8gY2hhdCBzZXNzaW9uIChlLmcuLCBAYmFja2dyb3VuZCBvciBAY2xvdWQpXG5cdFx0XHR0aGlzLmlucHV0LnNldFZhbHVlKGBAJHthZ2VudElkfSAke3Byb21wdFRvVXNlfWAsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0XHRcdC8vIEF1dG8tc3VibWl0IGZvciBkZWxlZ2F0ZWQgY2hhdCBzZXNzaW9uc1xuXHRcdFx0dGhpcy5hY2NlcHRJbnB1dCgpLmNhdGNoKGUgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIHN1Ym1pdCBkZWxlZ2F0ZWQgaGFuZG9mZiB0byAnQCR7YWdlbnRJZH0nYCwgZSkpO1xuXHRcdH0gZWxzZSBpZiAoaGFuZG9mZi5hZ2VudCkge1xuXHRcdFx0Ly8gUmVndWxhciBoYW5kb2ZmIHRvIHNwZWNpZmllZCBhZ2VudFxuXHRcdFx0Y29uc3Qgc3dpdGNoZWQgPSBhd2FpdCB0aGlzLl9zd2l0Y2hUb0FnZW50QnlOYW1lKGhhbmRvZmYuYWdlbnQpO1xuXHRcdFx0aWYgKCFzd2l0Y2hlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0hhbmRvZmZdIERpZCBub3QgZXhlY3V0ZSBoYW5kb2ZmICcke2hhbmRvZmYubGFiZWx9JyB0byAnJHtoYW5kb2ZmLmFnZW50fScgYmVjYXVzZSBzd2l0Y2hpbmcgYWdlbnRzIHdhcyB1bnN1Y2Nlc3NmdWxgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU3dpdGNoIHRvIHRoZSBzcGVjaWZpZWQgbW9kZWwgaWYgcHJvdmlkZWRcblx0XHRcdGNvbnN0IG1vZGVsUmVhZHkgPSBoYW5kb2ZmLm1vZGVsID8gdGhpcy5pbnB1dC5yZXF1ZXN0TW9kZWxCeVF1YWxpZmllZE5hbWUoW2hhbmRvZmYubW9kZWxdKSA6IHVuZGVmaW5lZDtcblx0XHRcdC8vIEluc2VydCB0aGUgaGFuZG9mZiBwcm9tcHQgaW50byB0aGUgaW5wdXRcblx0XHRcdHRoaXMuaW5wdXQuc2V0VmFsdWUocHJvbXB0VG9Vc2UsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblxuXHRcdFx0Ly8gQXV0by1zdWJtaXQgaWYgc2VuZCBmbGFnIGlzIHRydWVcblx0XHRcdGlmIChoYW5kb2ZmLnNlbmQpIHtcblx0XHRcdFx0aWYgKG1vZGVsUmVhZHkgJiYgIWF3YWl0IG1vZGVsUmVhZHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hY2NlcHRJbnB1dCgpLmNhdGNoKGUgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIHN1Ym1pdCBoYW5kb2ZmIHRvICcke2hhbmRvZmYuYWdlbnR9J2AsIGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBoYW5kbGVEZWxlZ2F0aW9uRXhpdElmTmVlZGVkKHNvdXJjZUFnZW50OiBQaWNrPElDaGF0QWdlbnREYXRhLCAnaWQnIHwgJ25hbWUnPiB8IHVuZGVmaW5lZCwgdGFyZ2V0QWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uKHNvdXJjZUFnZW50LCB0YXJnZXRBZ2VudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBXaWxsIGV4aXQgYWZ0ZXIgZGVsZWdhdGlvbjogc291cmNlQWdlbnQ9JHtzb3VyY2VBZ2VudD8uaWR9LCB0YXJnZXRBZ2VudD0ke3RhcmdldEFnZW50Py5pZH1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlRGVsZWdhdGlvbkV4aXQoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWxlZ2F0aW9uXSBGYWlsZWQgdG8gaGFuZGxlIGRlbGVnYXRpb24gZXhpdCcsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb24oc291cmNlQWdlbnQ6IFBpY2s8SUNoYXRBZ2VudERhdGEsICdpZCcgfCAnbmFtZSc+IHwgdW5kZWZpbmVkLCB0YXJnZXRBZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRhcmdldEFnZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBfc2hvdWxkRXhpdEFmdGVyRGVsZWdhdGlvbjogZmFsc2UgKG5vIHRhcmdldEFnZW50KScpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5FeGl0QWZ0ZXJEZWxlZ2F0aW9uKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb246IGZhbHNlIChFeGl0QWZ0ZXJEZWxlZ2F0aW9uIGNvbmZpZyBkaXNhYmxlZCknKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBleGl0IGlmIHRoZSBzb3VyY2UgYW5kIHRhcmdldCBhcmUgdGhlIHNhbWUgKHRoYXQgbWVhbnMgdGhhdCB5b3UncmUgcHJvdmlkaW5nIGEgZm9sbG93IHVwLCBldGMuKVxuXHRcdC8vIE5PVEU6IHNvdXJjZUFnZW50IHdvdWxkIGJlIHRoZSBjaGF0V2lkZ2V0J3MgJ2xvY2tlZEFnZW50J1xuXHRcdGlmIChzb3VyY2VBZ2VudCAmJiBzb3VyY2VBZ2VudC5pZCA9PT0gdGFyZ2V0QWdlbnQuaWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAoc291cmNlIGFuZCB0YXJnZXQgYWdlbnRzIGFyZSB0aGUgc2FtZSknKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWlzSUNoYXRWaWV3Vmlld0NvbnRleHQodGhpcy52aWV3Q29udGV4dCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAobm90IGluIGNoYXQgdmlldyBjb250ZXh0KScpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih0YXJnZXRBZ2VudC5pZCk7XG5cdFx0aWYgKCFjb250cmlidXRpb24pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAobm8gY29udHJpYnV0aW9uIGZvdW5kIGZvciB0YXJnZXRBZ2VudC5pZD0ke3RhcmdldEFnZW50LmlkfSlgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY29udHJpYnV0aW9uLmNhbkRlbGVnYXRlICE9PSB0cnVlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBfc2hvdWxkRXhpdEFmdGVyRGVsZWdhdGlvbjogZmFsc2UgKGNvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZT0ke2NvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZX0sIGV4cGVjdGVkIHRydWUpYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb246IHRydWUnKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSBleGl0IG9mIHRoZSBwYW5lbCBjaGF0IHdoZW4gYSBkZWxlZ2F0aW9uIHRvIGFub3RoZXIgc2Vzc2lvbiBvY2N1cnMuXG5cdCAqIFdhaXRzIGZvciB0aGUgcmVzcG9uc2UgdG8gY29tcGxldGUgYW5kIGFueSBwZW5kaW5nIGNvbmZpcm1hdGlvbnMgdG8gYmUgcmVzb2x2ZWQsXG5cdCAqIHRoZW4gY2xlYXJzIHRoZSB3aWRnZXQgdW5sZXNzIHRoZSBmaW5hbCBtZXNzYWdlIGlzIGFuIGVycm9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRGVsZWdhdGlvbkV4aXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWw7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9oYW5kbGVEZWxlZ2F0aW9uRXhpdDogbm8gdmlld01vZGVsLCByZXR1cm5pbmcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uUmVzb3VyY2UgPSB2aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlbGVnYXRpb25dIF9oYW5kbGVEZWxlZ2F0aW9uRXhpdDogcGFyZW50U2Vzc2lvblJlc291cmNlPSR7cGFyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cblx0XHQvLyBDaGVjayBpZiByZXNwb25zZSBpcyBjb21wbGV0ZSwgbm90IHBlbmRpbmcgY29uZmlybWF0aW9uLCBhbmQgaGFzIG5vIGVycm9yXG5cdFx0Y29uc3QgY2hlY2tJZlNob3VsZENsZWFyID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKTtcblx0XHRcdGNvbnN0IGxhc3RJdGVtID0gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAobGFzdEl0ZW0gJiYgaXNSZXNwb25zZVZNKGxhc3RJdGVtKSAmJiBsYXN0SXRlbS5tb2RlbCAmJiBsYXN0SXRlbS5pc0NvbXBsZXRlICYmICFsYXN0SXRlbS5tb2RlbC5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCkpIHtcblx0XHRcdFx0Y29uc3QgaGFzRXJyb3IgPSBCb29sZWFuKGxhc3RJdGVtLnJlc3VsdD8uZXJyb3JEZXRhaWxzKTtcblx0XHRcdFx0cmV0dXJuICFoYXNFcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0aWYgKGNoZWNrSWZTaG91bGRDbGVhcigpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBSZXNwb25zZSBjb21wbGV0ZSwgYXJjaGl2aW5nIHNlc3Npb24gYmVmb3JlIGNsZWFyaW5nJyk7XG5cdFx0XHQvLyBBcmNoaXZlIEJFRk9SRSBjbGVhcmluZyB0byBlbnN1cmUgc2Vzc2lvbiBzdGlsbCBleGlzdHMgaW4gYWdlbnRTZXNzaW9uc1NlcnZpY2Vcblx0XHRcdGF3YWl0IHRoaXMuYXJjaGl2ZUxvY2FsUGFyZW50U2Vzc2lvbihwYXJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIFdhaXRpbmcgZm9yIHJlc3BvbnNlIHRvIGNvbXBsZXRlLi4uJyk7XG5cdFx0Y29uc3Qgc2hvdWxkQ2xlYXIgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB2aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBjaGVja0lmU2hvdWxkQ2xlYXIoKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gVGltZW91dCB3YWl0aW5nIGZvciByZXNwb25zZSB0byBjb21wbGV0ZScpO1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlc29sdmUoZmFsc2UpO1xuXHRcdFx0fSwgMzBfMDAwKTsgLy8gMzAgc2Vjb25kIHRpbWVvdXRcblx0XHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0aWYgKHNob3VsZENsZWFyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBSZXNwb25zZSBjb21wbGV0ZWQsIGFyY2hpdmluZyBzZXNzaW9uIGJlZm9yZSBjbGVhcmluZycpO1xuXHRcdFx0YXdhaXQgdGhpcy5hcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uKHBhcmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmNsZWFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIE5vdCBjbGVhcmluZyAodGltZW91dCBvciBlcnJvciknKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFyY2hpdmVMb2NhbFBhcmVudFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBJbiB0aGUgcmVndWxhciB3b3JrYmVuY2gsIG9ubHkgYXJjaGl2ZSBsb2NhbCBjaGF0IHNlc3Npb25zLlxuXHRcdC8vIEluIHRoZSBzZXNzaW9ucyB3aW5kb3csIGFsbG93IGFyY2hpdmluZyBhbnkgc2Vzc2lvbiB0eXBlIGFmdGVyIGRlbGVnYXRpb24uXG5cdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSAmJiAhSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBhcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uOiBhcmNoaXZpbmcgc2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXG5cdFx0Ly8gSW1wbGljaXRseSBrZWVwIHBhcmVudCBzZXNzaW9uJ3MgY2hhbmdlcyBhcyB0aGV5J3ZlIG5vdyBiZWVuIGRlbGVnYXRlZCB0byB0aGUgbmV3IGFnZW50LlxuXHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpPy5lZGl0aW5nU2Vzc2lvbj8uYWNjZXB0KCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBhcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uOiBzZXNzaW9uIGFyY2hpdmVkIHN1Y2Nlc3NmdWxseScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlbGVnYXRpb25dIGFyY2hpdmVMb2NhbFBhcmVudFNlc3Npb246IHNlc3Npb24gbm90IGZvdW5kIGluIGFnZW50U2Vzc2lvbnNTZXJ2aWNlIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrIHRoZSBjaGF0IHNob3duIGluIHRoaXMgd2lkZ2V0IGFzIHJlYWQtb25seSAobm9uLWludGVyYWN0aXZlKSBvciBub3QuXG5cdCAqIFJlYWQtb25seSBjaGF0cyBoaWRlIHRoZSBjb21wb3NlciBhbmQgZXhwb3NlIGEgY29udGV4dCBrZXkgc28gbXV0YXRpbmdcblx0ICogYWN0aW9ucyAoZS5nLiBTdGFydCBPdmVyLCBSZXN0b3JlIENoZWNrcG9pbnQpIGFyZSBub3Qgb2ZmZXJlZC5cblx0ICovXG5cdHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzUmVhZE9ubHkgPSB0aGlzLl9yZWFkT25seTtcblx0XHR0aGlzLl9yZWFkT25seSA9IHJlYWRPbmx5O1xuXHRcdHRoaXMuX3JlYWRPbmx5Q29udGV4dEtleS5zZXQocmVhZE9ubHkpO1xuXHRcdGlmIChyZWFkT25seSkge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRcdHRoaXMuZmluaXNoZWRFZGl0aW5nKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRpZiAodGhpcy5oYXNJbnB1dEZvY3VzKCkpIHtcblx0XHRcdFx0aWYgKHRoaXMubGlzdFdpZGdldC5mb2N1c0xhc3RJdGVtKHRydWUpIDwgMCkge1xuXHRcdFx0XHRcdHRoaXMubGlzdFdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh3YXNSZWFkT25seSkge1xuXHRcdFx0dGhpcy5yZW5kZXJDaGF0U3VnZ2VzdE5leHRXaWRnZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5yZWFkT25seUJhbm5lcj8uc2V0VmlzaWJsZShyZWFkT25seSk7XG5cdFx0dGhpcy5zZXRJbnB1dFZpc2libGUoIXJlYWRPbmx5KTtcblx0XHQvLyBBdXRob3JpdGF0aXZlIG92ZXIgdGhlIGxvY2svdW5sb2NrIGBlZGl0YWJsZWAgdG9nZ2xlcyBiZWxvdy5cblx0XHR0aGlzLl9hcHBseVJlbmRlcmVyRWRpdGFibGUoIXJlYWRPbmx5KTtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LnJlcmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIHJlbmRlcmVyJ3MgYGVkaXRhYmxlYCBvcHRpb24sIGZvcmNpbmcgaXQgb2ZmIHdoaWxlIHRoZSBjaGF0IGlzXG5cdCAqIHJlYWQtb25seSBzbyB0aGUgbG9jay91bmxvY2sgdHJhbnNpdGlvbnMgY2FuIG5ldmVyIHJlLWVuYWJsZSByZXF1ZXN0XG5cdCAqIGVkaXRpbmcgb24gYSByZWFkLW9ubHkgY2hhdC5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5UmVuZGVyZXJFZGl0YWJsZShlZGl0YWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMubGlzdFdpZGdldD8udXBkYXRlUmVuZGVyZXJPcHRpb25zKHsgZWRpdGFibGU6IGVkaXRhYmxlICYmICF0aGlzLl9yZWFkT25seSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IG9yIGhpZGUgdGhlIGlucHV0IHBhcnQuIEhpZGRlbiBpbnB1dHMgYXJlIHJlbW92ZWQgZnJvbSB0aGUgRE9NIGZsb3dcblx0ICogdW5sZXNzIHRoZXkgY29udGFpbiBwZXJzaXN0ZW50IGNvbnRlbnQuIFVzZWQgdG8gcmVuZGVyIHJlYWQtb25seSBjaGF0c1xuXHQgKiB3aXRob3V0IGEgY29tcG9zZXIgd2hpbGUgcmV0YWluaW5nIGlucHV0LWFkamFjZW50IHN0YXR1cyBjb250cm9scy5cblx0ICovXG5cdHNldElucHV0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IHRoaXMuX2lucHV0VmlzaWJsZSAhPT0gdmlzaWJsZTtcblx0XHR0aGlzLl9pbnB1dFZpc2libGUgPSB2aXNpYmxlO1xuXHRcdC8vIFJlLWFwcGxpZWQgaW4gYGNyZWF0ZUlucHV0YCBzbyBhIHJlYnVpbHQgaW5wdXQgcGFydCBrZWVwcyB0aGUgY29ycmVjdCB2aXNpYmlsaXR5LlxuXHRcdHRoaXMuX2FwcGx5SW5wdXRWaXNpYmlsaXR5KCk7XG5cdFx0aWYgKGNoYW5nZWQgJiYgdGhpcy5ib2R5RGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRMaXN0Rm9ySW5wdXRIZWlnaHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUlucHV0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSB0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWU/LmVsZW1lbnQ7XG5cdFx0aWYgKGlucHV0RWxlbWVudCkge1xuXHRcdFx0aW5wdXRFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtaW5wdXQtaGlkZGVuJywgIXRoaXMuX2lucHV0VmlzaWJsZSk7XG5cdFx0XHRpbnB1dEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLl92aXNpYmxlO1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMudmlzaWJsZUNoYW5nZUNvdW50Kys7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0dGhpcy5pbnB1dC5zZXRWaXNpYmxlKHZpc2libGUpO1xuXG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmICghd2FzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlUaW1lb3V0RGlzcG9zYWJsZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBQcm9ncmVzc2l2ZSByZW5kZXJpbmcgcGF1c2VkIHdoaWxlIGhpZGRlbiwgc28gc3RhcnQgaXQgdXAgYWdhaW4uXG5cdFx0XHRcdFx0Ly8gRG8gaXQgYWZ0ZXIgYSB0aW1lb3V0IGJlY2F1c2UgdGhlIGNvbnRhaW5lciBpcyBub3QgdmlzaWJsZSB5ZXQgKGl0IHNob3VsZCBiZSBidXQgb2Zmc2V0SGVpZ2h0IHJldHVybnMgMCBoZXJlKVxuXHRcdFx0XHRcdGlmICh0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXModHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAwKTtcblxuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlBbmltYXRpb25GcmFtZURpc3Bvc2FibGUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMubGlzdENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNob3cuZmlyZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHdhc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMaXN0KGxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0Ly8gQ3JlYXRlIGEgZG9tIGVsZW1lbnQgdG8gaG9sZCBVSSBmcm9tIGVkaXRvciB3aWRnZXRzIGVtYmVkZGVkIGluIGNoYXQgbWVzc2FnZXNcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVyZmxvd1dpZGdldHNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1vdmVyZmxvdy13aWRnZXQtY29udGFpbmVyJywgJ21vbmFjby1lZGl0b3InKTtcblx0XHRsaXN0Q29udGFpbmVyLmFwcGVuZChvdmVyZmxvd1dpZGdldHNDb250YWluZXIpO1xuXG5cdFx0Ly8gQ3JlYXRlIGNoYXQgbGlzdCB3aWRnZXRcblx0XHR0aGlzLmxpc3RXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RXaWRnZXQsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRyZW5kZXJlck9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0XHRcdGRlZmF1bHRFbGVtZW50SGVpZ2h0OiB0aGlzLnZpZXdPcHRpb25zLmRlZmF1bHRFbGVtZW50SGVpZ2h0ID8/IDIwMCxcblx0XHRcdFx0b3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogb3ZlcmZsb3dXaWRnZXRzQ29udGFpbmVyLFxuXHRcdFx0XHRzdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0Rm9yZWdyb3VuZDogdGhpcy5zdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHRoaXMuc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGU6ICgpID0+IHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kLFxuXHRcdFx0XHRmaWx0ZXI6IHRoaXMudmlld09wdGlvbnMuZmlsdGVyID8geyBmaWx0ZXI6IHRoaXMudmlld09wdGlvbnMuZmlsdGVyLmJpbmQodGhpcy52aWV3T3B0aW9ucykgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmlld01vZGVsOiB0aGlzLnZpZXdNb2RlbCxcblx0XHRcdFx0ZWRpdG9yT3B0aW9uczogdGhpcy5lZGl0b3JPcHRpb25zLFxuXHRcdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdFx0Z2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zOiAoKSA9PiB0aGlzLmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpLFxuXHRcdFx0XHRnZXRDdXJyZW50TW9kZUluZm86ICgpID0+IHRoaXMuaW5wdXQuY3VycmVudE1vZGVJbmZvLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gV2lyZSB1cCBDaGF0V2lkZ2V0LXNwZWNpZmljIGxpc3Qgd2lkZ2V0IGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZENsaWNrUmVxdWVzdChhc3luYyBpdGVtID0+IHtcblx0XHRcdHRoaXMuY2xpY2tlZFJlcXVlc3QoaXRlbSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkUmVyZW5kZXIoaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbS5jdXJyZW50RWxlbWVudCkgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpICE9PSAnaW5wdXQnKSB7XG5cdFx0XHRcdGlmICghaXRlbS5yb3dDb250YWluZXIuY29udGFpbnModGhpcy5pbnB1dENvbnRhaW5lcikpIHtcblx0XHRcdFx0XHRpdGVtLnJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIuYmVmb3JlKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RXaWRnZXQub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuZm9jdXNlZElucHV0RE9NLmFwcGVuZENoaWxkKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0dGhpcy5pbnB1dC5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZEZvY3VzT3V0c2lkZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZENsaWNrRm9sbG93dXAoaXRlbSA9PiB7XG5cdFx0XHQvLyBpcyB0aGlzIHVzZWQgYW55bW9yZT9cblx0XHRcdHRoaXMuYWNjZXB0SW5wdXQoaXRlbS5tZXNzYWdlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbC5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c3RhcnRFZGl0aW5nKHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdGVkUmVxdWVzdCA9IHRoaXMubGlzdFdpZGdldC5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkKTtcblx0XHRpZiAoZWRpdGVkUmVxdWVzdCkge1xuXHRcdFx0dGhpcy5jbGlja2VkUmVxdWVzdChlZGl0ZWRSZXF1ZXN0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsaWNrZWRSZXF1ZXN0KGl0ZW06IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXG5cdFx0Y29uc3QgY3VycmVudEVsZW1lbnQgPSBpdGVtLmN1cnJlbnRFbGVtZW50O1xuXHRcdGlmIChpc1JlcXVlc3RWTShjdXJyZW50RWxlbWVudCkgJiYgIXRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cblx0XHRcdGNvbnN0IHJlcXVlc3RzID0gdGhpcy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0XHRpZiAoIXJlcXVlc3RzIHx8ICF0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhpcyB3aWxsIG9ubHkgZXZlciBiZSB0cnVlIGlmIHdlIHJlc3RvcmVkIGEgY2hlY2twb2ludFxuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5tb2RlbC5jaGVja3BvaW50KSB7XG5cdFx0XHRcdHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXdNb2RlbD8ubW9kZWwuc2V0Q2hlY2twb2ludChjdXJyZW50RWxlbWVudC5pZCk7XG5cblx0XHRcdC8vIHNldCBjb250ZXh0cyBhbmQgcmVxdWVzdCB0byBmYWxzZVxuXHRcdFx0Y29uc3QgY3VycmVudENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWRkZWRDb250ZXh0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBhZGRUb0NvbnRleHQgPSAoZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVkdXBLZXkgPSBlbnRyeS5yYW5nZSA/IGAke2VudHJ5LmlkfToke2VudHJ5LnJhbmdlLnN0YXJ0fS0ke2VudHJ5LnJhbmdlLmVuZEV4Y2x1c2l2ZX1gIDogZW50cnkuaWQ7XG5cdFx0XHRcdGlmIChhZGRlZENvbnRleHRJZHMuaGFzKGRlZHVwS2V5KSB8fCBpc1dvcmtzcGFjZVZhcmlhYmxlRW50cnkoZW50cnkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICgoaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeShlbnRyeSkgfHwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeShlbnRyeSkpICYmIGVudHJ5LmF1dG9tYXRpY2FsbHlBZGRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZGRlZENvbnRleHRJZHMuYWRkKGRlZHVwS2V5KTtcblx0XHRcdFx0Y3VycmVudENvbnRleHQucHVzaChlbnRyeSk7XG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaSAtPSAxKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSByZXF1ZXN0c1tpXTtcblx0XHRcdFx0aWYgKHJlcXVlc3QuaWQgPT09IGN1cnJlbnRFbGVtZW50LmlkKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5zZXRTaG91bGRCZUJsb2NrZWQoZmFsc2UpOyAvLyB1bmJsb2NraW5nIGp1c3QgdGhpcyByZXF1ZXN0LlxuXHRcdFx0XHRcdHJlcXVlc3QuYXR0YWNoZWRDb250ZXh0Py5mb3JFYWNoKGFkZFRvQ29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGN1cnJlbnRFbGVtZW50LnZhcmlhYmxlcy5mb3JFYWNoKGFkZFRvQ29udGV4dCk7XG5cblx0XHRcdC8vIHNldCBzdGF0ZXNcblx0XHRcdHRoaXMudmlld01vZGVsPy5zZXRFZGl0aW5nKGN1cnJlbnRFbGVtZW50KTtcblx0XHRcdGlmIChpdGVtPy5jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5iaW5kVG8oaXRlbS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0VkaXRpbmdTZW50UmVxdWVzdCA9IGN1cnJlbnRFbGVtZW50LnBlbmRpbmdLaW5kID09PSB1bmRlZmluZWRcblx0XHRcdFx0PyBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlNlbnRcblx0XHRcdFx0OiBjdXJyZW50RWxlbWVudC5wZW5kaW5nS2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkXG5cdFx0XHRcdFx0PyBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlF1ZXVlXG5cdFx0XHRcdFx0OiBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlN0ZWVyO1xuXHRcdFx0Y29uc3QgaXNJbnB1dCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSA9PT0gJ2lucHV0Jztcblx0XHRcdHRoaXMuaW5wdXRQYXJ0Py5zZXRFZGl0aW5nKCEhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcgJiYgaXNJbnB1dCwgaXNFZGl0aW5nU2VudFJlcXVlc3QpO1xuXG5cdFx0XHRpZiAoIWlzSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1lZGl0LWlucHV0LWNvbnRhaW5lcicpO1xuXHRcdFx0XHRpdGVtLnJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIuYmVmb3JlKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUlucHV0KHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmlucHV0LnNldENoYXRNb2RlKHRoaXMuaW5wdXRQYXJ0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkKTtcblx0XHRcdFx0dGhpcy5pbnB1dC5zZXRQZXJtaXNzaW9uTGV2ZWwodGhpcy5pbnB1dFBhcnQuY3VycmVudE1vZGVJbmZvLnBlcm1pc3Npb25MZXZlbCA/PyBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdFx0XHR0aGlzLmlucHV0LnNldEVkaXRpbmcodHJ1ZSwgaXNFZGl0aW5nU2VudFJlcXVlc3QpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yLmZpcmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZWRpdGluZycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50Lm1vZGVsSWQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLmlucHV0LnJlcXVlc3RNb2RlbEJ5SWRlbnRpZmllcihjdXJyZW50RWxlbWVudC5tb2RlbElkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pbnB1dFBhcnQudG9nZ2xlQ2hhdElucHV0T3ZlcmxheSghaXNJbnB1dCk7XG5cdFx0XHRpZiAoY3VycmVudENvbnRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmlucHV0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmN1cnJlbnRDb250ZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVyZW5kZXJzXG5cdFx0XHR0aGlzLmlucHV0UGFydC5kbmQuc2V0RGlzYWJsZWRPdmVybGF5KCFpc0lucHV0KTtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cdFx0XHR0aGlzLmlucHV0LnNldFZhbHVlKGN1cnJlbnRFbGVtZW50Lm1lc3NhZ2VUZXh0LCBmYWxzZSk7XG5cblx0XHRcdC8vIHJlc3RvcmUgZHluYW1pYyB2YXJpYWJsZXMgaW4gdGhlIG1vZGVsIHNvIGRlY29yYXRpb25zIGFuZCBwYXJzaW5nIHdvcmtcblx0XHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZU1vZGVsID0gdGhpcy5nZXRDb250cmliPENoYXREeW5hbWljVmFyaWFibGVNb2RlbD4oQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEKTtcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5pbnB1dC5pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGR5bmFtaWNWYXJpYWJsZU1vZGVsICYmIGVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsVGV4dExlbmd0aCA9IGVkaXRvck1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgY3VycmVudENvbnRleHQpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkucmFuZ2UpIHtcblx0XHRcdFx0XHRcdGlmIChlbnRyeS5yYW5nZS5zdGFydCA+PSBlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChlbnRyeS5yYW5nZS5zdGFydCA8IDAgfHwgZW50cnkucmFuZ2UuZW5kRXhjbHVzaXZlID4gbW9kZWxUZXh0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydFBvcyA9IGVkaXRvck1vZGVsLmdldFBvc2l0aW9uQXQoZW50cnkucmFuZ2Uuc3RhcnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5kUG9zID0gZWRpdG9yTW9kZWwuZ2V0UG9zaXRpb25BdChlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdFx0XHRcdFx0ZHluYW1pY1ZhcmlhYmxlTW9kZWwuYWRkUmVmZXJlbmNlKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0UG9zLmxpbmVOdW1iZXIsIHN0YXJ0UG9zLmNvbHVtbiwgZW5kUG9zLmxpbmVOdW1iZXIsIGVuZFBvcy5jb2x1bW4pLFxuXHRcdFx0XHRcdFx0XHRkYXRhOiBlbnRyeS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0ZnVsbE5hbWU6IGVudHJ5LmZ1bGxOYW1lLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBlbnRyeS5pY29uLFxuXHRcdFx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBlbnRyeS5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRpc0ZpbGU6IGVudHJ5LmtpbmQgPT09ICdmaWxlJyxcblx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGVudHJ5LmtpbmQgPT09ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VkaXRpbmdBdXRvU2Nyb2xsSG9sZC52YWx1ZSA9IHRoaXMubGlzdFdpZGdldC5hY3F1aXJlQXV0b1Njcm9sbEhvbGQoKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VJdGVtcygpO1xuXHRcdFx0dGhpcy5pbnB1dC5pbnB1dEVkaXRvci5mb2N1cygpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGFydC5vbkRpZENsaWNrT3ZlcmxheSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdpbnB1dCcpIHtcblx0XHRcdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIGxpc3RlbmVyc1xuXHRcdFx0aWYgKCFpc0lucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5saW5lSW5wdXRQYXJ0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9DdXJyZW50SXRlbShjdXJyZW50RWxlbWVudCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlubGluZUlucHV0UGFydC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0N1cnJlbnRJdGVtKGN1cnJlbnRFbGVtZW50KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHR5cGUgU3RhcnRSZXF1ZXN0RXZlbnQgPSB7IGVkaXRSZXF1ZXN0VHlwZTogc3RyaW5nIH07XG5cblx0XHR0eXBlIFN0YXJ0UmVxdWVzdEV2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdFx0XHRjb21tZW50OiAnRXZlbnQgdXNlZCB0byBnYWluIGluc2lnaHRzIGludG8gd2hlbiBlZGl0cyBhcmUgYmVpbmcgcHJlc3NlZC4nO1xuXHRcdFx0ZWRpdFJlcXVlc3RUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQ3VycmVudCBlbnRyeSBwb2ludCBmb3IgZWRpdGluZyBhIHJlcXVlc3QuJyB9O1xuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTdGFydFJlcXVlc3RFdmVudCwgU3RhcnRSZXF1ZXN0RXZlbnRDbGFzc2lmaWNhdGlvbj4oJ2NoYXQuc3RhcnRFZGl0aW5nUmVxdWVzdHMnLCB7XG5cdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSxcblx0XHR9KTtcblx0fVxuXG5cdGZpbmlzaGVkRWRpdGluZyhjb21wbGV0ZWRFZGl0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIHJlc2V0IHN0YXRlc1xuXHRcdHRoaXMuX2VkaXRpbmdBdXRvU2Nyb2xsSG9sZC5jbGVhcigpO1xuXHRcdGNvbnN0IGVkaXRlZFJlcXVlc3QgPSB0aGlzLmxpc3RXaWRnZXQuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKHRoaXMudmlld01vZGVsPy5lZGl0aW5nPy5pZCk7XG5cdFx0aWYgKHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQpIHtcblx0XHRcdHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3TW9kZWw/Lm1vZGVsLnNldENoZWNrcG9pbnQodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFBhcnQuZG5kLnNldERpc2FibGVkT3ZlcmxheShmYWxzZSk7XG5cdFx0aWYgKGVkaXRlZFJlcXVlc3Q/LmNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5iaW5kVG8oZWRpdGVkUmVxdWVzdC5jb250ZXh0S2V5U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0lucHV0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpID09PSAnaW5wdXQnO1xuXG5cdFx0aWYgKCFpc0lucHV0KSB7XG5cdFx0XHQvLyBUaGUgaW5saW5lIGVkaXRvciBpcyBzZWxmLWNvbnRhaW5lZDogaXQgc2hvd3MgdGhlIG1vZGVsIGl0cyByZXF1ZXN0IHJhbiBvbiwgc3VibWl0c1xuXHRcdFx0Ly8gd2l0aCBpdCAoc2VlIGBhY2NlcHRJbnB1dGAsIHdoaWNoIHJlYWRzIHRoZSBtb2RlbCBmcm9tIGhlcmUgYmVmb3JlIHRoaXMgcnVucyksIGFuZFxuXHRcdFx0Ly8gZGlzYXBwZWFycy4gVGhlIGJvdHRvbSBpbnB1dCBrZWVwcyB3aGF0ZXZlciB0aGUgdXNlciBsZWZ0IGl0IG9uLlxuXHRcdFx0dGhpcy5pbnB1dFBhcnQ/LnRvZ2dsZUNoYXRJbnB1dE92ZXJsYXkoZmFsc2UpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKGVkaXRlZFJlcXVlc3Q/LnJvd0NvbnRhaW5lcj8uY29udGFpbnModGhpcy5pbnB1dENvbnRhaW5lcikpIHtcblx0XHRcdFx0XHRlZGl0ZWRSZXF1ZXN0LnJvd0NvbnRhaW5lci5yZW1vdmVDaGlsZCh0aGlzLmlucHV0Q29udGFpbmVyKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmlucHV0Q29udGFpbmVyLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmlucHV0Q29udGFpbmVyLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQodGhpcy5pbnB1dENvbnRhaW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciBvY2N1cnJlZCB3aGlsZSBmaW5pc2hpbmcgZWRpdGluZzonLCBlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuaW5wdXRDb250YWluZXIgPSBkb20uJCgnLmVtcHR5LWNoYXQtc3RhdGUnKTtcblxuXHRcdFx0Ly8gb25seSBkaXNwb3NlIGlmIHdlIGtub3cgdGhlIGlucHV0IGlzIG5vdCB0aGUgYm90dG9tIGlucHV0IG9iamVjdC5cblx0XHRcdHRoaXMuaW5wdXQuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmIChpc0lucHV0KSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2VkaXRpbmcnKTtcblx0XHR9XG5cdFx0dGhpcy52aWV3TW9kZWw/LnNldEVkaXRpbmcodW5kZWZpbmVkKTtcblx0XHR0aGlzLmlucHV0UGFydD8uc2V0RWRpdGluZyhmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICghaXNJbnB1dCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvci5maXJlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUl0ZW1zKCk7XG5cblx0XHR0eXBlIENhbmNlbFJlcXVlc3RFZGl0RXZlbnQgPSB7XG5cdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHN0cmluZztcblx0XHRcdGVkaXRDYW5jZWxlZDogYm9vbGVhbjtcblx0XHR9O1xuXG5cdFx0dHlwZSBDYW5jZWxSZXF1ZXN0RXZlbnRFZGl0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDdXJyZW50IGVudHJ5IHBvaW50IGZvciBlZGl0aW5nIGEgcmVxdWVzdC4nIH07XG5cdFx0XHRlZGl0Q2FuY2VsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgd2hldGhlciB0aGUgZWRpdCB3YXMgY2FuY2VsZWQuJyB9O1xuXHRcdFx0Y29tbWVudDogJ0V2ZW50IHVzZWQgdG8gZ2FpbiBpbnNpZ2h0cyBpbnRvIHdoZW4gZWRpdHMgYXJlIGJlaW5nIGNhbmNlbGVkLic7XG5cdFx0fTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENhbmNlbFJlcXVlc3RFZGl0RXZlbnQsIENhbmNlbFJlcXVlc3RFdmVudEVkaXRDbGFzc2lmaWNhdGlvbj4oJ2NoYXQuZWRpdFJlcXVlc3RzRmluaXNoZWQnLCB7XG5cdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSxcblx0XHRcdGVkaXRDYW5jZWxlZDogIWNvbXBsZXRlZEVkaXRcblx0XHR9KTtcblxuXHRcdHRoaXMuaW5wdXRQYXJ0LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFdpZGdldFZpZXdLaW5kVGFnKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLnZpZXdDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gJ2VkaXRvcic7XG5cdFx0fSBlbHNlIGlmIChpc0lDaGF0Vmlld1ZpZXdDb250ZXh0KHRoaXMudmlld0NvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm4gJ3ZpZXcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJ3F1aWNrJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUlucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM/OiB7IHJlbmRlckZvbGxvd3VwczogYm9vbGVhbjsgcmVuZGVyU3R5bGU/OiAnY29tcGFjdCcgfCAnbWluaW1hbCc7IHJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQ/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRjb25zdCBjb21tb25Db25maWc6IElDaGF0SW5wdXRQYXJ0T3B0aW9ucyA9IHtcblx0XHRcdHJlbmRlckZvbGxvd3Vwczogb3B0aW9ucz8ucmVuZGVyRm9sbG93dXBzID8/IHRydWUsXG5cdFx0XHRyZW5kZXJTdHlsZTogb3B0aW9ucz8ucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyA/ICdjb21wYWN0JyA6IG9wdGlvbnM/LnJlbmRlclN0eWxlLFxuXHRcdFx0cmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dDogb3B0aW9ucz8ucmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dCA/PyBmYWxzZSxcblx0XHRcdG1lbnVzOiB7XG5cdFx0XHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NoYXRXaWRnZXQnLFxuXHRcdFx0XHQuLi50aGlzLnZpZXdPcHRpb25zLm1lbnVzXG5cdFx0XHR9LFxuXHRcdFx0ZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogdGhpcy52aWV3T3B0aW9ucy5lZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlLFxuXHRcdFx0ZW5hYmxlSW1wbGljaXRDb250ZXh0OiB0aGlzLnZpZXdPcHRpb25zLmVuYWJsZUltcGxpY2l0Q29udGV4dCxcblx0XHRcdHJlbmRlcldvcmtpbmdTZXQ6IHRoaXMudmlld09wdGlvbnMuZW5hYmxlV29ya2luZ1NldCA9PT0gJ2V4cGxpY2l0Jyxcblx0XHRcdHN1cHBvcnRzQ2hhbmdpbmdNb2RlczogdGhpcy52aWV3T3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXMsXG5cdFx0XHRkbmRDb250YWluZXI6IHRoaXMudmlld09wdGlvbnMuZG5kQ29udGFpbmVyLFxuXHRcdFx0aW5wdXRFZGl0b3JNaW5MaW5lczogdGhpcy52aWV3T3B0aW9ucy5pbnB1dEVkaXRvck1pbkxpbmVzLFxuXHRcdFx0aW5wdXRFZGl0b3JNYXhIZWlnaHQ6IHRoaXMudmlld09wdGlvbnMuaW5wdXRFZGl0b3JNYXhIZWlnaHQsXG5cdFx0XHRkZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkOiB0aGlzLnZpZXdPcHRpb25zLmRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQsXG5cdFx0XHR3aWRnZXRWaWV3S2luZFRhZzogdGhpcy5nZXRXaWRnZXRWaWV3S2luZFRhZygpLFxuXHRcdFx0ZGVmYXVsdE1vZGU6IHRoaXMudmlld09wdGlvbnMuZGVmYXVsdE1vZGUsXG5cdFx0XHRzZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlOiB0aGlzLnZpZXdPcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUsXG5cdFx0XHRtb2RlbFBpY2tlclNlc3Npb25UeXBlOiB0aGlzLnZpZXdPcHRpb25zLm1vZGVsUGlja2VyU2Vzc2lvblR5cGUsXG5cdFx0XHR3b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZTogdGhpcy52aWV3T3B0aW9ucy53b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSxcblx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IHRoaXMudmlld09wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdyxcblx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxQaWNrZXJWaXNpYmlsaXR5OiB0aGlzLnZpZXdPcHRpb25zLm9uRGlkQ2hhbmdlTW9kZWxQaWNrZXJWaXNpYmlsaXR5LFxuXHRcdFx0aW5wdXRQaWNrZXJQb3NpdGlvbjogdGhpcy52aWV3T3B0aW9ucy5pbnB1dFBpY2tlclBvc2l0aW9uLFxuXHRcdFx0aW5wdXRQaWNrZXJDb250YWluZXI6IHRoaXMudmlld09wdGlvbnMuaW5wdXRQaWNrZXJDb250YWluZXIsXG5cdFx0XHRpbnB1dFBpY2tlckFuY2hvcjogdGhpcy52aWV3T3B0aW9ucy5pbnB1dFBpY2tlckFuY2hvcixcblx0XHRcdGlucHV0UGlja2VyT3Blbk9uTW91c2VVcDogdGhpcy52aWV3T3B0aW9ucy5pbnB1dFBpY2tlck9wZW5Pbk1vdXNlVXAsXG5cdFx0XHRjb250ZXh0UGlja2VyOiB0aGlzLnZpZXdPcHRpb25zLmNvbnRleHRQaWNrZXIsXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0Y29uc3QgZWRpdGVkUmVxdWVzdCA9IHRoaXMubGlzdFdpZGdldC5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQodGhpcy52aWV3TW9kZWw/LmVkaXRpbmc/LmlkKTtcblx0XHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgZWRpdGVkUmVxdWVzdD8uY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdFx0dGhpcy5pbmxpbmVJbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0UGFydCxcblx0XHRcdFx0dGhpcy5sb2NhdGlvbixcblx0XHRcdFx0Y29tbW9uQ29uZmlnLFxuXHRcdFx0XHR0aGlzLnN0eWxlcyxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuaW5saW5lUGFzdGVUYXJnZXRSZWdpc3RyYXRpb24udmFsdWUgPSB0aGlzLmNoYXRQYXN0ZVRhcmdldFNlcnZpY2UucmVnaXN0ZXJUYXJnZXQodGhpcy5pbmxpbmVJbnB1dFBhcnQuaW5wdXRVcmksIHRoaXMucGFzdGVUYXJnZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dFBhcnQsXG5cdFx0XHRcdHRoaXMubG9jYXRpb24sXG5cdFx0XHRcdGNvbW1vbkNvbmZpZyxcblx0XHRcdFx0dGhpcy5zdHlsZXMsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5tYWluUGFzdGVUYXJnZXRSZWdpc3RyYXRpb24udmFsdWUgPSB0aGlzLmNoYXRQYXN0ZVRhcmdldFNlcnZpY2UucmVnaXN0ZXJUYXJnZXQodGhpcy5pbnB1dFBhcnQuaW5wdXRVcmksIHRoaXMucGFzdGVUYXJnZXQpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHR0aGlzLmlucHV0UGFydC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXRoaXMubGlzdFdpZGdldCkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgc2V0IHVwIGJlZm9yZSB0aGUgbGlzdC9yZW5kZXJlciBhcmUgY3JlYXRlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmJvZHlEaW1lbnNpb24pIHtcblx0XHRcdFx0XHQvLyBPbmx5IHJlLWxheW91dCB0aGUgbGlzdC9jb250YWluZXJzIHRvIG1hdGNoIHRoZSBuZXcgaW5wdXRcblx0XHRcdFx0XHQvLyBoZWlnaHQuIERvIE5PVCByZS1jYWxsIHRoaXMubGF5b3V0KCkgaGVyZTogdGhlIGlucHV0IHBhcnRcblx0XHRcdFx0XHQvLyBoYXMgYWxyZWFkeSBsYWlkIGl0c2VsZiBvdXQgYW5kIHJlLWVudGVyaW5nIGlucHV0UGFydC5sYXlvdXRcblx0XHRcdFx0XHQvLyBjcmVhdGVzIGEgbGF5b3V0IGxvb3Agd2hlbiB0aGUgdmlld1BhbmUgYWxzbyByZWFjdHMuXG5cdFx0XHRcdFx0dGhpcy5fbGF5b3V0TGlzdEZvcklucHV0SGVpZ2h0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXQucmVuZGVyKGNvbnRhaW5lciwgJycsIHRoaXMpO1xuXHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRJbnB1dFRpcFByZXNlbnRlcixcblx0XHRcdHtcblx0XHRcdFx0Y29udGFpbmVyOiB0aGlzLmlucHV0LmdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyRWxlbWVudCxcblx0XHRcdFx0aXNFbGlnaWJsZTogKCkgPT4gdGhpcy5pc0dldHRpbmdTdGFydGVkVGlwRWxpZ2libGUoKSxcblx0XHRcdFx0Zm9jdXNJbnB1dDogKCkgPT4gdGhpcy5mb2N1c0lucHV0KCksXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5pbnB1dC5ub3RpY2VIb3N0LFxuXHRcdCk7XG5cdFx0Ly8gS2VlcCByZWFkLW9ubHkgY2hhdHMnIGNvbXBvc2VyIGhpZGRlbiBpZiB0aGUgaW5wdXQgcGFydCB3YXMgcmVidWlsdC5cblx0XHR0aGlzLl9hcHBseUlucHV0VmlzaWJpbGl0eSgpO1xuXHRcdGlmICh0aGlzLmJvZHlEaW1lbnNpb24/LndpZHRoKSB7XG5cdFx0XHR0aGlzLmlucHV0LmxheW91dCh0aGlzLmJvZHlEaW1lbnNpb24ud2lkdGgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXQub25EaWRMb2FkSW5wdXRTdGF0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0Lm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5fb25EaWRGb2N1cy5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0Lm9uRGlkQWNjZXB0Rm9sbG93dXAoZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG1zZyA9ICcnO1xuXHRcdFx0aWYgKGUuZm9sbG93dXAuYWdlbnRJZCAmJiBlLmZvbGxvd3VwLmFnZW50SWQgIT09IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQodGhpcy5sb2NhdGlvbiwgdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQpPy5pZCkge1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChlLmZvbGxvd3VwLmFnZW50SWQpO1xuXHRcdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sYXN0U2VsZWN0ZWRBZ2VudCA9IGFnZW50O1xuXHRcdFx0XHRtc2cgPSBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfSBgO1xuXHRcdFx0XHRpZiAoZS5mb2xsb3d1cC5zdWJDb21tYW5kKSB7XG5cdFx0XHRcdFx0bXNnICs9IGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7ZS5mb2xsb3d1cC5zdWJDb21tYW5kfSBgO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCFlLmZvbGxvd3VwLmFnZW50SWQgJiYgZS5mb2xsb3d1cC5zdWJDb21tYW5kICYmIHRoaXMuY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UuaGFzQ29tbWFuZChlLmZvbGxvd3VwLnN1YkNvbW1hbmQsIGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpKSkge1xuXHRcdFx0XHRtc2cgPSBgJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke2UuZm9sbG93dXAuc3ViQ29tbWFuZH0gYDtcblx0XHRcdH1cblxuXHRcdFx0bXNnICs9IGUuZm9sbG93dXAubWVzc2FnZTtcblx0XHRcdHRoaXMuYWNjZXB0SW5wdXQobXNnKTtcblxuXHRcdFx0aWYgKCFlLnJlc3BvbnNlKSB7XG5cdFx0XHRcdC8vIEZvbGxvd3VwcyBjYW4gYmUgc2hvd24gYnkgdGhlIHdlbGNvbWUgbWVzc2FnZSwgdGhlbiB0aGVyZSBpcyBubyByZXNwb25zZSBhc3NvY2lhdGVkLlxuXHRcdFx0XHQvLyBBdCBzb21lIHBvaW50IHdlIHByb2JhYmx5IHdhbnQgdGVsZW1ldHJ5IGZvciB0aGVzZSB0b28uXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jaGF0U2VydmljZS5ub3RpZnlVc2VyQWN0aW9uKHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiB0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogZS5yZXNwb25zZS5yZXF1ZXN0SWQsXG5cdFx0XHRcdGFnZW50SWQ6IGUucmVzcG9uc2UuYWdlbnQ/LmlkLFxuXHRcdFx0XHRjb21tYW5kOiBlLnJlc3BvbnNlLnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0cmVzdWx0OiBlLnJlc3BvbnNlLnJlc3VsdCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0a2luZDogJ2ZvbGxvd1VwJyxcblx0XHRcdFx0XHRmb2xsb3d1cDogZS5mb2xsb3d1cFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5wYXJzZWRDaGF0UmVxdWVzdCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudXBkYXRlQ2hhdElucHV0Q29udGV4dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRBZ2VudFNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5wYXJzZWRDaGF0UmVxdWVzdCA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIFRvb2xzIGFnZW50IGxvYWRzIC0+IHdlbGNvbWUgY29udGVudCBjaGFuZ2VzXG5cdFx0XHR0aGlzLnJlbmRlcldlbGNvbWVWaWV3Q29udGVudElmTmVlZGVkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXQub25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHRcdHRoaXMucmVuZGVyRm9sbG93dXBzKCk7XG5cdFx0XHR0aGlzLnJlbmRlckNoYXRTdWdnZXN0TmV4dFdpZGdldCgpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBmb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udGV4dEtleXMgPSBuZXcgU2V0KFtDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5rZXldKTtcblx0XHRjb25zdCBoYXNCeW9rTW9kZWxzQ29udGV4dEtleXMgPSBuZXcgU2V0KFtDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5oYXNCeW9rTW9kZWxzLmtleV0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoZm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRleHRLZXlzKSAmJiB0aGlzLmlzRW1wdHkoKSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckdldHRpbmdTdGFydGVkVGlwSWZOZWVkZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGhhc0J5b2tNb2RlbHNDb250ZXh0S2V5cykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0bGV0IHByZXZpb3VzTW9kZWxJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxJZGVudGlmaWVyID0gdGhpcy5pbnB1dFBhcnQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLnJlYWQocmVhZGVyKT8uaWRlbnRpZmllcjtcblx0XHRcdGlmIChwcmV2aW91c01vZGVsSWRlbnRpZmllciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHByZXZpb3VzTW9kZWxJZGVudGlmaWVyID0gbW9kZWxJZGVudGlmaWVyO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2aW91c01vZGVsSWRlbnRpZmllciA9PT0gbW9kZWxJZGVudGlmaWVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cHJldmlvdXNNb2RlbElkZW50aWZpZXIgPSBtb2RlbElkZW50aWZpZXI7XG5cdFx0XHRpZiAoIXRoaXMuX2dldHRpbmdTdGFydGVkVGlwLnZhbHVlPy5jdXJyZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmUtc2VsZWN0cyB0aGUgdGlwIGZvciB0aGUgbmV3IG1vZGVsOyBwcm9tb3Rpb24vcm90YXRpb24gcmVhY2hlcyB0aGVcblx0XHRcdC8vIHJlbmRlcmVkIHRpcCB0aHJvdWdoIGBvbkRpZE5hdmlnYXRlVGlwYCwgc28gdGhlIHJlc3VsdCBpcyB1bnVzZWQgaGVyZS5cblx0XHRcdHRoaXMuY2hhdFRpcFNlcnZpY2UuZ2V0V2VsY29tZVRpcCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbFNldElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgdG9vbElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBbZW50cnksIGVuYWJsZWRdIG9mIHRoaXMuaW5wdXQuc2VsZWN0ZWRUb29sc01vZGVsLmVudHJpZXNNYXAucmVhZChyKSkge1xuXHRcdFx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0XHRcdGlmIChpc1Rvb2xTZXQoZW50cnkpKSB7XG5cdFx0XHRcdFx0XHR0b29sU2V0SWRzLmFkZChlbnRyeS5pZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRvb2xJZHMuYWRkKGVudHJ5LmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc2FibGVkVG9vbHMgPSB0aGlzLmlucHV0LmF0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50c1xuXHRcdFx0XHQuZmlsdGVyKGEgPT4gYS5raW5kID09PSAndG9vbCcgJiYgIXRvb2xJZHMuaGFzKGEuaWQpIHx8IGEua2luZCA9PT0gJ3Rvb2xzZXQnICYmICF0b29sU2V0SWRzLmhhcyhhLmlkKSlcblx0XHRcdFx0Lm1hcChhID0+IGEuaWQpO1xuXG5cdFx0XHR0aGlzLmlucHV0LmF0dGFjaG1lbnRNb2RlbC51cGRhdGVDb250ZXh0KGRpc2FibGVkVG9vbHMsIEl0ZXJhYmxlLmVtcHR5KCkpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkU3R5bGVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWludGVyYWN0aXZlLXJlc3VsdC1lZGl0b3ItYmFja2dyb3VuZC1jb2xvcicsIHRoaXMuZWRpdG9yT3B0aW9ucy5jb25maWd1cmF0aW9uLnJlc3VsdEVkaXRvci5iYWNrZ3JvdW5kQ29sb3I/LnRvU3RyaW5nKCkgPz8gJycpO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1pbnRlcmFjdGl2ZS1zZXNzaW9uLWZvcmVncm91bmQnLCB0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5mb3JlZ3JvdW5kPy50b1N0cmluZygpID8/ICcnKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY2hhdC1saXN0LWJhY2tncm91bmQnLCB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IodGhpcy5zdHlsZXMubGlzdEJhY2tncm91bmQpPy50b1N0cmluZygpID8/ICcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWRnZXQncyBjb2xvciBzdHlsZXMgYWZ0ZXIgY29uc3RydWN0aW9uLiBQcm9wYWdhdGVzIHRoZSBuZXdcblx0ICogYGxpc3RGb3JlZ3JvdW5kYC9gbGlzdEJhY2tncm91bmRgIHRvIHRoZSBsaXN0IHdpZGdldCwgcHVzaGVzIHRoZSBuZXcgY29sb3Jcblx0ICogdG9rZW5zIGludG8gYGVkaXRvck9wdGlvbnNgIHNvIHN1YnNjcmliZXJzIChjb2RlIGJsb2NrcywgcmVzdWx0L2lucHV0IGVkaXRvclxuXHQgKiBiYWNrZ3JvdW5kcywgY29udGFpbmVyIENTUyB2YXJpYWJsZXMpIHBpY2sgdGhlbSB1cCB2aWEgYG9uRGlkQ2hhbmdlYCwgYW5kXG5cdCAqIHJlZnJlc2hlcyB0aGUgQ1NTIHZhcmlhYmxlcyB0aGUgY2hhdCBjb250YWluZXIgZXhwb3NlcyBmb3Igc3R5bGVzaGVldCBydWxlcy5cblx0ICovXG5cdHNldFN0eWxlcyhzdHlsZXM6IElDaGF0V2lkZ2V0U3R5bGVzKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkU3R5bGVzID0gdGhpcy5zdHlsZXM7XG5cdFx0dGhpcy5zdHlsZXMgPSBzdHlsZXM7XG5cblx0XHQvLyB1cGRhdGUgbGlzdCBpZiBuZWVkZWRcblx0XHRjb25zdCBsaXN0Q29sb3JzQ2hhbmdlZCA9XG5cdFx0XHRvbGRTdHlsZXMubGlzdEJhY2tncm91bmQgIT09IHN0eWxlcy5saXN0QmFja2dyb3VuZCB8fFxuXHRcdFx0b2xkU3R5bGVzLmxpc3RGb3JlZ3JvdW5kICE9PSBzdHlsZXMubGlzdEZvcmVncm91bmQ7XG5cblx0XHRpZiAobGlzdENvbG9yc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldD8uc2V0U3R5bGVzKHtcblx0XHRcdFx0bGlzdEZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBlZGl0b3IgY29sb3JzIGlmIG5lZWRlZFxuXHRcdGNvbnN0IGVkaXRvckNvbG9yc0NoYW5nZWQgPVxuXHRcdFx0b2xkU3R5bGVzLmxpc3RGb3JlZ3JvdW5kICE9PSBzdHlsZXMubGlzdEZvcmVncm91bmQgfHxcblx0XHRcdG9sZFN0eWxlcy5pbnB1dEVkaXRvckJhY2tncm91bmQgIT09IHN0eWxlcy5pbnB1dEVkaXRvckJhY2tncm91bmQgfHxcblx0XHRcdG9sZFN0eWxlcy5yZXN1bHRFZGl0b3JCYWNrZ3JvdW5kICE9PSBzdHlsZXMucmVzdWx0RWRpdG9yQmFja2dyb3VuZDtcblxuXHRcdGlmIChlZGl0b3JDb2xvcnNDaGFuZ2VkICYmIHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHQvLyBVcGRhdGluZyBlZGl0b3JPcHRpb25zIGZpcmVzIG9uRGlkQ2hhbmdlIHdoaWNoIHRyaWdnZXJzIG9uRGlkU3R5bGVDaGFuZ2Vcblx0XHRcdC8vIGFuZCBhbHNvIHByb3BhZ2F0ZXMgdGhlIG5ldyBjb2xvcnMgdG8gc3Vic2NyaWJlcnMgbGlrZSBDb2RlQmxvY2tQYXJ0LlxuXHRcdFx0dGhpcy5lZGl0b3JPcHRpb25zLnNldENvbG9ycyhzdHlsZXMubGlzdEZvcmVncm91bmQsIHN0eWxlcy5pbnB1dEVkaXRvckJhY2tncm91bmQsIHN0eWxlcy5yZXN1bHRFZGl0b3JCYWNrZ3JvdW5kKTtcblx0XHR9XG5cdH1cblxuXG5cdHNldE1vZGVsKG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRhaW5lciB8fCAhdGhpcy5pbnB1dFBhcnQpIHtcblx0XHRcdC8vIFdpZGdldCBoYXNuJ3QgZmluaXNoZWQgcmVuZGVyaW5nIHlldDsgc2tpcCByYXRoZXIgdGhhbiBjcmFzaCBhbmRcblx0XHRcdC8vIGJyZWFrIHRoZSBzZXNzaW9uIHZpZXcuIENhbGxlciB3aWxsIHJlLWludm9rZSBvbmNlIHJlbmRlcmVkLlxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ0NoYXRXaWRnZXQjc2V0TW9kZWwgY2FsbGVkIGJlZm9yZSByZW5kZXIoKSBjb21wbGV0ZWQnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SW5wdXRNb2RlbCA9IHRoaXMudmlld01vZGVsPy5tb2RlbD8uaW5wdXRNb2RlbD8uc3RhdGU/LmdldCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy52aWV3TW9kZWw/Lm1vZGVsPy5pbnB1dE1vZGVsLCBgQ2hhdFdpZGdldC5zZXRNb2RlbCB0byBlbXB0eSwgb2xkICR7dGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIHVuZGVmaW5lZCwgY3VycmVudElucHV0TW9kZWwsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHQvLyBGbHVzaCBhbnkgdW5zZW50IGRyYWZ0IHRvIHRoZSBvdXRnb2luZyBpbnB1dCBtb2RlbCBiZWZvcmUgd2UgZHJvcCBvdXJcblx0XHRcdC8vIHJlZmVyZW5jZSB0byBpdCwgc28gdGhlIGhvc3QncyBgd2lsbERpc3Bvc2VNb2RlbGAgcGVyc2lzdGVuY2Ugc2VlcyBpdC5cblx0XHRcdHRoaXMuaW5wdXRQYXJ0LmZsdXNoSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jbGVhckdldHRpbmdTdGFydGVkVGlwKCk7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudXBkYXRlV29ya2luZ1Byb2dyZXNzQm9yZGVyKCk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXMoKTtcblx0XHRcdHRoaXMuX2hhc1BlbmRpbmdSZXF1ZXN0c0NvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdGlmICghdGhpcy52aWV3T3B0aW9ucy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdHRoaXMuc2V0UmVhZE9ubHkoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc0VxdWFsKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgdGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG1vZGVsLmlucHV0TW9kZWwsIGBDaGF0V2lkZ2V0LnNldE1vZGVsIG5ldyAke21vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSwgb2xkICR7dGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIG1vZGVsLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCksIGN1cnJlbnRJbnB1dE1vZGVsLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdH1cblx0XHR0aGlzLmlucHV0UGFydD8uY2xlYXJUb2RvTGlzdFdpZGdldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGZhbHNlKTtcblx0XHR0aGlzLmlucHV0UGFydD8uY2xlYXJBcnRpZmFjdHNXaWRnZXQoKTtcblx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0dGhpcy5jaGF0VGlwU2VydmljZS5yZXNldFNlc3Npb24oKTtcblxuXHRcdC8vIFN3aXRjaGluZyBzZXNzaW9ucyByZXNldHMgdGlwIHNlcnZpY2Ugc3RhdGU7IGNsZWFyIGFueSByZW5kZXJlZCB0aXAgc29cblx0XHQvLyBlbXB0eS1zdGF0ZSByZW5kZXJpbmcgcGlja3MgYSBmcmVzaCwgY29udGV4dC1hcHByb3ByaWF0ZSB0aXAuXG5cdFx0dGhpcy5jbGVhckdldHRpbmdTdGFydGVkVGlwKCk7XG5cblx0XHQvLyBTZXQgdGhlIGlucHV0IG1vZGVsIG9uIHRoZSBpbnB1dFBhcnQgYmVmb3JlIGFzc2lnbmluZyB0aGlzLnZpZXdNb2RlbC4gQXNzaWduaW5nIHRoaXMudmlld01vZGVsXG5cdFx0Ly8gZmlyZXMgb25EaWRDaGFuZ2VWaWV3TW9kZWwsIHdoaWNoIENoYXRJbnB1dFBhcnQgbGlzdGVucyB0byBhbmQgZXhwZWN0cyB0aGUgaW5wdXQgbW9kZWwgdG8gYmUgaW5pdGlhbGl6ZWQuXG5cdFx0Ly8gUGFzcyBpbnB1dCBtb2RlbCByZWZlcmVuY2UgdG8gaW5wdXQgcGFydCBmb3Igc3RhdGUgc3luY2luZ1xuXHRcdHRoaXMuaW5wdXRQYXJ0LnNldElucHV0TW9kZWwobW9kZWwuaW5wdXRNb2RlbCwgbW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDAsIG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFZpZXdNb2RlbCwgbW9kZWwsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKCF0aGlzLnZpZXdPcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuc2V0UmVhZE9ubHkobW9kZWwuaXNSZWFkT25seS5yZWFkKHJlYWRlcikpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5saXN0V2lkZ2V0LnNldFZpZXdNb2RlbCh0aGlzLnZpZXdNb2RlbCk7XG5cblx0XHRpZiAodGhpcy5fbG9ja2VkQWdlbnQpIHtcblx0XHRcdGxldCBwbGFjZWhvbGRlciA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih0aGlzLl9sb2NrZWRBZ2VudC5pZCk/LmlucHV0UGxhY2Vob2xkZXI7XG5cdFx0XHRpZiAoIXBsYWNlaG9sZGVyKSB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NoYXQuaW5wdXQucGxhY2Vob2xkZXIubG9ja2VkVG9BZ2VudCcsIFwiQ2hhdCB3aXRoIHswfVwiLCB0aGlzLl9sb2NrZWRBZ2VudC5kaXNwbGF5TmFtZSB8fCB0aGlzLl9sb2NrZWRBZ2VudC5uYW1lKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudmlld01vZGVsLnNldElucHV0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXIgfSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnZpZXdNb2RlbC5pbnB1dFBsYWNlaG9sZGVyKSB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlcjogdGhpcy52aWV3TW9kZWwuaW5wdXRQbGFjZWhvbGRlciB9KTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdNb2RlbERpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUoRXZlbnQuYWNjdW11bGF0ZSh0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZSksIChldmVudHMgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCB0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc4OTY5XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZXF1ZXN0SW5Qcm9ncmVzcy5zZXQodGhpcy52aWV3TW9kZWwubW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCkpO1xuXHRcdFx0dGhpcy5oYXNBY3RpdmVSZXF1ZXN0LnNldCh0aGlzLnZpZXdNb2RlbC5tb2RlbC5oYXNBY3RpdmVSZXF1ZXN0LmdldCgpKTtcblx0XHRcdHRoaXMudXBkYXRlV29ya2luZ1Byb2dyZXNzQm9yZGVyKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSB0aGUgZWRpdG9yJ3MgcGxhY2Vob2xkZXIgdGV4dCB3aGVuIGl0IGNoYW5nZXMgaW4gdGhlIHZpZXcgbW9kZWxcblx0XHRcdGlmIChldmVudHM/LnNvbWUoZSA9PiBlPy5raW5kID09PSAnY2hhbmdlUGxhY2Vob2xkZXInKSkge1xuXHRcdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlcjogdGhpcy52aWV3TW9kZWwuaW5wdXRQbGFjZWhvbGRlciB9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUl0ZW1zKCk7XG5cdFx0XHRpZiAoZXZlbnRzPy5zb21lKGUgPT4gZT8ua2luZCA9PT0gJ2FkZFJlcXVlc3QnKSAmJiB0aGlzLnZpc2libGUgJiYgIXRoaXMubGlzdFdpZGdldC5pc0F1dG9TY3JvbGxIZWxkKSB7XG5cdFx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0VuZCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaW5kYWJsZUNvbnRlbnQuZmlyZSgpO1xuXHRcdH0pKSk7XG5cdFx0dGhpcy52aWV3TW9kZWxEaXNwb3NhYmxlcy5hZGQodGhpcy52aWV3TW9kZWwub25EaWREaXNwb3NlTW9kZWwoKCkgPT4ge1xuXHRcdFx0Ly8gRW5zdXJlIHRoYXQgdmlldyBzdGF0ZSBpcyBzYXZlZCBoZXJlLCBiZWNhdXNlIHdlIHdpbGwgbG9hZCBpdCBhZ2FpbiB3aGVuIGEgbmV3IG1vZGVsIGlzIGFzc2lnbmVkXG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdFx0dGhpcy5maW5pc2hlZEVkaXRpbmcoKTtcblx0XHRcdH1cblx0XHRcdC8vIERpc3Bvc2VzIHRoZSB2aWV3bW9kZWwgYW5kIGxpc3RlbmVyc1xuXHRcdFx0dGhpcy52aWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0JvcmRlcigpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUl0ZW1zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Nlc3Npb25Jc0VtcHR5Q29udGV4dEtleS5zZXQobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDApO1xuXHRcdGNvbnN0IHVwZGF0ZVN1cHBvcnRzRm9yayA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN1cHBvcnRzRm9yayA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXNzaW9uU3VwcG9ydHNGb3JrKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvblN1cHBvcnRzRm9ya0NvbnRleHRLZXkuc2V0KHN1cHBvcnRzRm9yayk7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LnVwZGF0ZVJlbmRlcmVyT3B0aW9ucyh7IHN1cHBvcnRzRm9yayB9KTtcblx0XHR9O1xuXHRcdHVwZGF0ZVN1cHBvcnRzRm9yaygpO1xuXHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJpbGl0eSgoKSA9PiB1cGRhdGVTdXBwb3J0c0ZvcmsoKSkpO1xuXHRcdHRoaXMuX3Nlc3Npb25IYXNEZWJ1Z0RhdGFDb250ZXh0S2V5LnNldCh0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0RXZlbnRzKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkubGVuZ3RoID4gMCk7XG5cdFx0bGV0IGxhc3RTdGVlcmluZ0NvdW50ID0gMDtcblx0XHRjb25zdCB1cGRhdGVQZW5kaW5nUmVxdWVzdEtleXMgPSAoYW5ub3VuY2VTdGVlcmluZzogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3RzID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCk7XG5cdFx0XHRjb25zdCBwZW5kaW5nQ291bnQgPSBwZW5kaW5nUmVxdWVzdHMubGVuZ3RoO1xuXHRcdFx0dGhpcy5faGFzUGVuZGluZ1JlcXVlc3RzQ29udGV4dEtleS5zZXQocGVuZGluZ0NvdW50ID4gMCk7XG5cdFx0XHRjb25zdCBzdGVlcmluZ0NvdW50ID0gcGVuZGluZ1JlcXVlc3RzLmZpbHRlcihwZW5kaW5nID0+IHBlbmRpbmcua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpLmxlbmd0aDtcblx0XHRcdGlmIChhbm5vdW5jZVN0ZWVyaW5nICYmIHN0ZWVyaW5nQ291bnQgPiAwICYmIGxhc3RTdGVlcmluZ0NvdW50ID09PSAwKSB7XG5cdFx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnY2hhdC5wZW5kaW5nUmVxdWVzdHMuc3RlZXJpbmdRdWV1ZWQnLCBcIlN0ZWVyaW5nXCIpKTtcblx0XHRcdH1cblx0XHRcdGxhc3RTdGVlcmluZ0NvdW50ID0gc3RlZXJpbmdDb3VudDtcblx0XHR9O1xuXHRcdHVwZGF0ZVBlbmRpbmdSZXF1ZXN0S2V5cyhmYWxzZSk7XG5cdFx0dGhpcy52aWV3TW9kZWxEaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4gdXBkYXRlUGVuZGluZ1JlcXVlc3RLZXlzKHRydWUpKSk7XG5cblx0XHR0aGlzLnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kID09PSAnc2V0QWdlbnQnKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWdlbnQuZmlyZSh7IGFnZW50OiBlLmFnZW50LCBzbGFzaENvbW1hbmQ6IGUuY29tbWFuZCB9KTtcblx0XHRcdFx0Ly8gVXBkYXRlIGNhcGFiaWxpdGllcyBjb250ZXh0IGtleXMgd2hlbiBhZ2VudCBjaGFuZ2VzXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFnZW50Q2FwYWJpbGl0aWVzQ29udGV4dEtleXMoZS5hZ2VudCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5raW5kID09PSAnYWRkUmVxdWVzdCcpIHtcblx0XHRcdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyVG9kb0xpc3RXaWRnZXQodGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSwgZmFsc2UpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uSXNFbXB0eUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSGlkZSB3aWRnZXQgb24gcmVxdWVzdCByZW1vdmFsXG5cdFx0XHRpZiAoZS5raW5kID09PSAncmVtb3ZlUmVxdWVzdCcpIHtcblx0XHRcdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyVG9kb0xpc3RXaWRnZXQodGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhpZGUoKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbklzRW1wdHlDb250ZXh0S2V5LnNldCgodGhpcy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID8/IDApID09PSAwKTtcblx0XHRcdH1cblx0XHRcdC8vIFNob3cgbmV4dCBzdGVwcyB3aWRnZXQgd2hlbiByZXNwb25zZSBjb21wbGV0ZXMgKG5vdCB3aGVuIHJlcXVlc3Qgc3RhcnRzKVxuXHRcdFx0aWYgKGUua2luZCA9PT0gJ2NvbXBsZXRlZFJlcXVlc3QnKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gdGhpcy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRjb25zdCB3YXNDYW5jZWxsZWQgPSBsYXN0UmVxdWVzdD8ucmVzcG9uc2U/LmlzQ2FuY2VsZWQgPz8gZmFsc2U7XG5cdFx0XHRcdGlmICh3YXNDYW5jZWxsZWQpIHtcblx0XHRcdFx0XHQvLyBDbGVhciB0b2RvIGxpc3Qgd2hlbiByZXF1ZXN0IGlzIGNhbmNlbGxlZFxuXHRcdFx0XHRcdHRoaXMuaW5wdXRQYXJ0Py5jbGVhclRvZG9MaXN0V2lkZ2V0KHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE9ubHkgc2hvdyBpZiByZXNwb25zZSB3YXNuJ3QgY2FuY2VsZWRcblx0XHRcdFx0dGhpcy5yZW5kZXJDaGF0U3VnZ2VzdE5leHRXaWRnZXQoKTtcblxuXHRcdFx0XHQvLyBNYXJrIHRoZSBzZXNzaW9uIGFzIHJlYWQgd2hlbiB0aGUgcmVxdWVzdCBjb21wbGV0ZXMgYW5kIHRoZSB3aWRnZXQgaXMgdmlzaWJsZVxuXHRcdFx0XHRpZiAodGhpcy52aXNpYmxlICYmIHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24odGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKT8uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQgJiYgdGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXMoKTtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0VuZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyQ2hhdFN1Z2dlc3ROZXh0V2lkZ2V0KCk7XG5cdFx0dGhpcy51cGRhdGVDaGF0SW5wdXRDb250ZXh0KCk7XG5cdFx0dGhpcy5pbnB1dC5yZW5kZXJDaGF0VG9kb0xpc3RXaWRnZXQodGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLmlucHV0LnJlbmRlckFydGlmYWN0c1dpZGdldCh0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0c2V0TG9hZGluZyhpc0xvYWRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0xvYWRpbmcgPSBpc0xvYWRpbmc7XG5cdFx0dGhpcy5yZW5kZXJHZXR0aW5nU3RhcnRlZFRpcElmTmVlZGVkKCk7XG5cdH1cblxuXHRnZXRGb2N1cygpOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuZ2V0Rm9jdXMoKVswXSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXZlYWwoaXRlbTogQ2hhdFRyZWVJdGVtLCByZWxhdGl2ZVRvcD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGlzdFdpZGdldC5yZXZlYWwoaXRlbSwgcmVsYXRpdmVUb3ApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB0b3Agb2Zmc2V0IG9mIGFuIGl0ZW0gaW4gdHJhbnNjcmlwdCBjb250ZW50IHNwYWNlIChzYW1lIHNwYWNlIGFzXG5cdCAqIGBzY3JvbGxUb3BgL2BzY3JvbGxIZWlnaHRgKSwgb3IgYHVuZGVmaW5lZGAgaWYgaXQgaXMgbm90IGluIHRoZSBsaXN0LlxuXHQgKiBWaXJ0dWFsaXphdGlvbi1zYWZlIGZvciBvZmYtc2NyZWVuIGl0ZW1zIChyZWFkcyB0aGUgbGF5b3V0IGhlaWdodCBtb2RlbCkuXG5cdCAqL1xuXHRnZXRFbGVtZW50VG9wKGl0ZW06IENoYXRUcmVlSXRlbSk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRFbGVtZW50VG9wKGl0ZW0pO1xuXHR9XG5cblx0Zm9jdXMoaXRlbTogQ2hhdFRyZWVJdGVtKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmxpc3RXaWRnZXQuaGFzRWxlbWVudChpdGVtKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGlzdFdpZGdldC5mb2N1c0l0ZW0oaXRlbSk7XG5cdH1cblxuXHRzZXRJbnB1dFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbD8uc2V0SW5wdXRQbGFjZWhvbGRlcihwbGFjZWhvbGRlcik7XG5cdH1cblxuXHRyZXNldElucHV0UGxhY2Vob2xkZXIoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZWw/LnJlc2V0SW5wdXRQbGFjZWhvbGRlcigpO1xuXHR9XG5cblx0c2V0SW5wdXQodmFsdWUgPSAnJyk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQuc2V0VmFsdWUodmFsdWUsIGZhbHNlKTtcblx0XHR0aGlzLnJlZnJlc2hQYXJzZWRJbnB1dCgpO1xuXHR9XG5cblx0Z2V0SW5wdXQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC5pbnB1dEVkaXRvci5nZXRWYWx1ZSgpO1xuXHR9XG5cblx0Z2V0Q29udHJpYjxUIGV4dGVuZHMgSUNoYXRXaWRnZXRDb250cmliPihpZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udHJpYnMuZmluZChjID0+IGMuaWQgPT09IGlkKSBhcyBUIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gQ29kaW5nIGFnZW50IGxvY2tpbmcgbWV0aG9kc1xuXHRsb2NrVG9Db2RpbmdBZ2VudChuYW1lOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcsIGFnZW50SWQ6IHN0cmluZywgYWdlbnRIb3N0UHJvdmlkZXJJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sb2NrZWRBZ2VudD8uaWQgPT09IGFnZW50SWQgJiYgdGhpcy5fbG9ja2VkQWdlbnQubmFtZSA9PT0gbmFtZSAmJiB0aGlzLl9sb2NrZWRBZ2VudC5kaXNwbGF5TmFtZSA9PT0gZGlzcGxheU5hbWUgJiYgdGhpcy5fbG9ja2VkQWdlbnQuYWdlbnRIb3N0UHJvdmlkZXJJZCA9PT0gYWdlbnRIb3N0UHJvdmlkZXJJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvY2tlZEFnZW50ID0ge1xuXHRcdFx0aWQ6IGFnZW50SWQsXG5cdFx0XHRuYW1lLFxuXHRcdFx0cHJlZml4OiBgQCR7bmFtZX0gYCxcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0YWdlbnRIb3N0UHJvdmlkZXJJZFxuXHRcdH07XG5cdFx0dGhpcy5fbG9ja2VkVG9Db2RpbmdBZ2VudENvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdHRoaXMuX2xvY2tlZENvZGluZ0FnZW50SWRDb250ZXh0S2V5LnNldChhZ2VudElkKTtcblx0XHR0aGlzLl9jaGF0SXNBZ2VudEhvc3RTZXNzaW9uQ29udGV4dEtleS5zZXQoISFhZ2VudEhvc3RQcm92aWRlcklkKTtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZENvbnRleHRLZXkuc2V0KGFnZW50SG9zdFByb3ZpZGVySWQgPz8gJycpO1xuXHRcdHRoaXMuX3VwZGF0ZUFnZW50SG9zdFdvcmtpbmdEaXJlY3RvcnlDb250ZXh0S2V5cyhhZ2VudEhvc3RQcm92aWRlcklkKTtcblx0XHR0aGlzLnJlbmRlcldlbGNvbWVWaWV3Q29udGVudElmTmVlZGVkKCk7XG5cdFx0Ly8gVXBkYXRlIGNhcGFiaWxpdGllcyBmb3IgdGhlIGxvY2tlZCBhZ2VudFxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGFnZW50SWQpO1xuXHRcdHRoaXMuX3VwZGF0ZUFnZW50Q2FwYWJpbGl0aWVzQ29udGV4dEtleXMoYWdlbnQpO1xuXHRcdGNvbnN0IHN1cHBvcnRzQ2hlY2twb2ludHMgPSB0aGlzLl9hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzQ2hlY2twb2ludHMgPz8gZmFsc2U7XG5cdFx0dGhpcy5saXN0V2lkZ2V0Py51cGRhdGVSZW5kZXJlck9wdGlvbnMoeyByZXN0b3JhYmxlOiBzdXBwb3J0c0NoZWNrcG9pbnRzLCBlZGl0YWJsZTogc3VwcG9ydHNDaGVja3BvaW50cyAmJiAhdGhpcy5fcmVhZE9ubHksIG5vRm9vdGVyOiBmYWxzZSwgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiB0cnVlIH0pO1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldD8ucmVyZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHR1bmxvY2tGcm9tQ29kaW5nQWdlbnQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9sb2NrZWRBZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGFsbCBzdGF0ZSByZWxhdGVkIHRvIGxvY2tpbmdcblx0XHR0aGlzLl9sb2NrZWRBZ2VudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2NrZWRUb0NvZGluZ0FnZW50Q29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX2xvY2tlZENvZGluZ0FnZW50SWRDb250ZXh0S2V5LnNldCgnJyk7XG5cdFx0dGhpcy5fY2hhdElzQWdlbnRIb3N0U2Vzc2lvbkNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZENvbnRleHRLZXkuc2V0KCcnKTtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0SGFzSW1tdXRhYmxlUHJpbWFyeVdvcmtpbmdEaXJlY3RvcnlDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdXBwb3J0c0ZvcmtDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fdXBkYXRlQWdlbnRDYXBhYmlsaXRpZXNDb250ZXh0S2V5cyh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRXhwbGljaXRseSB1cGRhdGUgdGhlIERPTSB0byByZWZsZWN0IHVubG9ja2VkIHN0YXRlXG5cdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXG5cdFx0Ly8gUmVzZXQgdG8gZGVmYXVsdCBwbGFjZWhvbGRlclxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwucmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk7XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXRFZGl0b3I/LnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlcjogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMubGlzdFdpZGdldD8udXBkYXRlUmVuZGVyZXJPcHRpb25zKHsgcmVzdG9yYWJsZTogdHJ1ZSwgZWRpdGFibGU6ICF0aGlzLl9yZWFkT25seSwgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2sgfSk7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py5yZXJlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc0xvY2tlZFRvQ29kaW5nQWdlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbG9ja2VkQWdlbnQ7XG5cdH1cblxuXHRnZXQgbG9ja2VkQWdlbnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sb2NrZWRBZ2VudD8uaWQ7XG5cdH1cblxuXHRsb2dJbnB1dEhpc3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dC5sb2dJbnB1dEhpc3RvcnkoKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdElucHV0KHF1ZXJ5Pzogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRBY2NlcHRJbnB1dE9wdGlvbnMpOiBQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9yZWFkT25seSB8fCB0aGlzLmlucHV0Lmhhc1BlbmRpbmdQcm9ncmFtbWF0aWNNb2RlbFNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnM/LnByZXNlcnZlSW5wdXQpIHtcblx0XHRcdC8vIHByZXNlcnZlSW5wdXQgc3VibWlzc2lvbnMgKGUuZy4gL2NvbXBhY3Qgb3IgcHJvZ3JhbW1hdGljIG1haW50ZW5hbmNlXG5cdFx0XHQvLyByZXF1ZXN0cykgbGVhdmUgdGhlIGlucHV0IGRyYWZ0IHVudG91Y2hlZCwgc28gdGhleSBtdXN0IG5vdCBzdG9wIGFuXG5cdFx0XHQvLyB1bnJlbGF0ZWQgZGljdGF0aW9uIGFuZCBmbHVzaCBpdHMgZmluYWwgdHJhbnNjcmlwdCBpbnRvIHRoYXQgZHJhZnQuXG5cdFx0XHRhd2FpdCBzdG9wRGljdGF0aW9uRm9yRWRpdG9yKHRoaXMuaW5wdXRFZGl0b3IpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0bWFya0NoYXQodGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCBDaGF0UGVyZk1hcmsuUmVxdWVzdFN0YXJ0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2FjY2VwdElucHV0KHF1ZXJ5ID8geyBxdWVyeSB9IDogdW5kZWZpbmVkLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHJlcnVuTGFzdFJlcXVlc3QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3JlYWRPbmx5IHx8ICF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpPy5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRpZiAoIWxhc3RSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHRhdHRlbXB0OiBsYXN0UmVxdWVzdC5hdHRlbXB0ICsgMSxcblx0XHRcdGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uLFxuXHRcdFx0Li4udGhpcy5nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMoKSxcblx0XHRcdG1vZGVJbmZvOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlSW5mbyxcblx0XHR9O1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UucmVzZW5kUmVxdWVzdChsYXN0UmVxdWVzdCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5sb2dUaGlua2luZ1N0eWxlVXNhZ2UoJ3JlcnVuJyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlZFRoaW5raW5nU3R5bGUoKTogVGhpbmtpbmdEaXNwbGF5TW9kZSB7XG5cdFx0Y29uc3QgdGhpbmtpbmdTdHlsZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VGhpbmtpbmdEaXNwbGF5TW9kZT4oQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdTdHlsZSk7XG5cdFx0c3dpdGNoICh0aGlua2luZ1N0eWxlKSB7XG5cdFx0XHRjYXNlIFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkOlxuXHRcdFx0Y2FzZSBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZFByZXZpZXc6XG5cdFx0XHRjYXNlIFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmc6XG5cdFx0XHRcdHJldHVybiB0aGlua2luZ1N0eWxlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFRoaW5raW5nRGlzcGxheU1vZGUuRml4ZWRTY3JvbGxpbmc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2dUaGlua2luZ1N0eWxlVXNhZ2UocmVxdWVzdEtpbmQ6IENoYXRUaGlua2luZ1N0eWxlVXNhZ2VFdmVudFsncmVxdWVzdEtpbmQnXSk6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRUaGlua2luZ1N0eWxlVXNhZ2VFdmVudCwgQ2hhdFRoaW5raW5nU3R5bGVVc2FnZUNsYXNzaWZpY2F0aW9uPignY2hhdC50aGlua2luZ1N0eWxlVXNhZ2UnLCB7XG5cdFx0XHR0aGlua2luZ1N0eWxlOiB0aGlzLmdldENvbmZpZ3VyZWRUaGlua2luZ1N0eWxlKCksXG5cdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdHJlcXVlc3RLaW5kLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsR29hbFN1bW1hcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ29hbFN1bW1hcnlUb2tlblNvdXJjZT8uZGlzcG9zZSh0cnVlKTtcblx0XHR0aGlzLl9nb2FsU3VtbWFyeVRva2VuU291cmNlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF5YmVTdGFydEdvYWxTdW1tYXJ5KHByb21wdDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRQYXJ0ID0gdGhpcy5pbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlO1xuXHRcdGlmICghaW5wdXRQYXJ0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGFkdmFuY2VkIGF1dG9waWxvdCBnb2FsIGJhbm5lciBpcyBvbmx5IHN1cHBvcnRlZCBpbiB0aGUgbG9jYWwgY2hhdFxuXHRcdC8vIGhhcm5lc3MuIEFnZW50LWhvc3QgYmFja2VkIHNlc3Npb25zIChDb3BpbG90IENMSSwgQ2xhdWRlLCBDb2RleCBhbmQgdGhlXG5cdFx0Ly8gbG9jYWwvcmVtb3RlIGFnZW50IGhvc3RzKSBtdXN0IG5ldmVyIHJlbmRlciBpdC5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGlzTG9jYWxIYXJuZXNzID0gISFzZXNzaW9uUmVzb3VyY2UgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IGlucHV0UGFydC5jdXJyZW50TW9kZUluZm8/LnBlcm1pc3Npb25MZXZlbDtcblx0XHRjb25zdCBnb2FsTW9kZU9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BdXRvcGlsb3RBZHZhbmNlZEVuYWJsZWQpID09PSB0cnVlO1xuXHRcdGlmICghaXNMb2NhbEhhcm5lc3MgfHwgcGVybWlzc2lvbkxldmVsICE9PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCB8fCAhZ29hbE1vZGVPbikge1xuXHRcdFx0dGhpcy5fY2FuY2VsR29hbFN1bW1hcnkoKTtcblx0XHRcdGlucHV0UGFydC5jbGVhckdvYWxCYW5uZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZXNldCBwZXItcmVxdWVzdCBkaXNtaXNzYWwgc3RhdGUgYW5kIChyZSliaW5kIHRoZSBkaXNtaXNzIGxpc3RlbmVyIHRvIHRoZVxuXHRcdC8vIGN1cnJlbnQgaW5wdXQgcGFydC4gQSBNdXRhYmxlRGlzcG9zYWJsZSBkaXNwb3NlcyBhbnkgcHJpb3IgYmluZGluZywgc28gdGhpc1xuXHRcdC8vIHN0YXlzIGNvcnJlY3QgZXZlbiBpZiB0aGUgaW5wdXQgcGFydCBpcyByZWNyZWF0ZWQuXG5cdFx0dGhpcy5fZ29hbEJhbm5lckRpc21pc3NlZEZvckN1cnJlbnRSZXF1ZXN0ID0gZmFsc2U7XG5cdFx0dGhpcy5fZ29hbEJhbm5lckRpc21pc3NMaXN0ZW5lci52YWx1ZSA9IGlucHV0UGFydC5vbkRpZERpc21pc3NHb2FsQmFubmVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2dvYWxCYW5uZXJEaXNtaXNzZWRGb3JDdXJyZW50UmVxdWVzdCA9IHRydWU7XG5cdFx0XHR0aGlzLl9jYW5jZWxHb2FsU3VtbWFyeSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fY2FuY2VsR29hbFN1bW1hcnkoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9nb2FsU3VtbWFyeVRva2VuU291cmNlID0gY3RzO1xuXHRcdGlucHV0UGFydC5zaG93R29hbEJhbm5lckxvYWRpbmcoKTtcblxuXHRcdHRoaXMuY2hhdEdvYWxTdW1tYXJ5U2VydmljZS5zdW1tYXJpemUocHJvbXB0LCBjdHMudG9rZW4pLnRoZW4oc3VtbWFyeSA9PiB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IHRoaXMuX2dvYWxCYW5uZXJEaXNtaXNzZWRGb3JDdXJyZW50UmVxdWVzdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5pbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlO1xuXHRcdFx0aWYgKCFjdXJyZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHRcdGN1cnJlbnQuc2V0R29hbEJhbm5lcihzdW1tYXJ5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnQuY2xlYXJHb2FsQmFubmVyKCk7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWU/LmNsZWFyR29hbEJhbm5lcigpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIGBmYWxzZWAgd2hlbiB0aGUgcHJvbXB0IG1ldGFkYXRhIHJlcXVlc3RlZCBhbiBhZ2VudCBzd2l0Y2ggdGhhdCB0aGVcblx0ICogdXNlciBjYW5jZWxsZWQsIHNpZ25hbGxpbmcgdGhhdCBpbnB1dCBzdWJtaXNzaW9uIHNob3VsZCBiZSBhYm9ydGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlQcm9tcHRGaWxlSWZTZXQocmVxdWVzdElucHV0OiBJQ2hhdFJlcXVlc3RJbnB1dE9wdGlvbnMsIHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gZmlyc3QgY2hlY2sgaWYgdGhlIGlucHV0IGhhcyBhIHByb21wdCBzbGFzaCBjb21tYW5kXG5cdFx0Y29uc3QgYWdlbnRTbGFzaFByb21wdFBhcnQgPSB0aGlzLnBhcnNlZElucHV0LnBhcnRzLmZpbmQoKHIpOiByIGlzIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCk7XG5cdFx0aWYgKCFhZ2VudFNsYXNoUHJvbXB0UGFydCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHNsYXNoIGNvbW1hbmRzIGFyZSB0cmFuc2Zvcm1lZCBvdXQgb2YgdGhlIGlucHV0IGJlZm9yZSBzZW5kUmVxdWVzdC5cblx0XHQvLyBUcmFjayB0aGVtIG5vdyBzbyB0aXAgZXhjbHVzaW9ucyBzdGlsbCB1cGRhdGUgZm9yIGNvbW1hbmRzIGxpa2UgL2luaXQuXG5cdFx0dGhpcy5jaGF0VGlwU2VydmljZS5yZWNvcmRTbGFzaENvbW1hbmRVc2FnZShhZ2VudFNsYXNoUHJvbXB0UGFydC5uYW1lKTtcblxuXHRcdC8vIG5lZWQgdG8gcmVzb2x2ZSB0aGUgc2xhc2ggY29tbWFuZCB0byBnZXQgdGhlIHByb21wdCBmaWxlXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kID0gYXdhaXQgdGhpcy5jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChhZ2VudFNsYXNoUHJvbXB0UGFydC5uYW1lLCBzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghc2xhc2hDb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VSZXN1bHQgPSBzbGFzaENvbW1hbmQucGFyc2VkUHJvbXB0RmlsZTtcblx0XHQvLyBhZGQgdGhlIHByb21wdCBmaWxlIHRvIHRoZSBjb250ZXh0XG5cdFx0Y29uc3QgcmVmcyA9IHBhcnNlUmVzdWx0LmJvZHk/LnZhcmlhYmxlUmVmZXJlbmNlcy5tYXAoKHsgbmFtZSwgb2Zmc2V0LCBmdWxsTGVuZ3RoIH0pID0+ICh7IG5hbWUsIHJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2Uob2Zmc2V0LCBvZmZzZXQgKyBmdWxsTGVuZ3RoKSB9KSkgPz8gW107XG5cdFx0Y29uc3QgdG9vbFJlZmVyZW5jZXMgPSB0aGlzLnRvb2xzU2VydmljZS50b1Rvb2xSZWZlcmVuY2VzKHJlZnMpO1xuXHRcdHJlcXVlc3RJbnB1dC5hdHRhY2hlZENvbnRleHQuaW5zZXJ0Rmlyc3QodG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeShwYXJzZVJlc3VsdC51cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuUHJvbXB0RmlsZSwgdW5kZWZpbmVkLCB0cnVlLCB0b29sUmVmZXJlbmNlcykpO1xuXG5cdFx0Y29uc3QgcHJvbXB0UnVuRXZlbnQ6IENoYXRQcm9tcHRSdW5FdmVudCA9IHtcblx0XHRcdHN0b3JhZ2U6IHNsYXNoQ29tbWFuZC5zdG9yYWdlLFxuXHRcdH07XG5cdFx0aWYgKHNsYXNoQ29tbWFuZC5leHRlbnNpb24pIHtcblx0XHRcdHByb21wdFJ1bkV2ZW50LmV4dGVuc2lvbklkID0gc2xhc2hDb21tYW5kLmV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdFx0cHJvbXB0UnVuRXZlbnQucHJvbXB0TmFtZSA9IHNsYXNoQ29tbWFuZC5uYW1lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm9tcHRSdW5FdmVudC5wcm9tcHROYW1lSGFzaCA9IGhhc2goc2xhc2hDb21tYW5kLm5hbWUpLnRvU3RyaW5nKDE2KTtcblx0XHR9XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFByb21wdFJ1bkV2ZW50LCBDaGF0UHJvbXB0UnVuQ2xhc3NpZmljYXRpb24+KCdjaGF0LnByb21wdFJ1bicsIHByb21wdFJ1bkV2ZW50KTtcblxuXHRcdGlmIChwYXJzZVJlc3VsdC5oZWFkZXIpIHtcblx0XHRcdGNvbnN0IGFwcGxpZWQgPSBhd2FpdCB0aGlzLl9hcHBseVByb21wdE1ldGFkYXRhKHBhcnNlUmVzdWx0LmhlYWRlciwgcmVxdWVzdElucHV0KTtcblx0XHRcdGlmICghYXBwbGllZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hY2NlcHRJbnB1dChxdWVyeTogeyBxdWVyeTogc3RyaW5nIH0gfCB1bmRlZmluZWQsIG9wdGlvbnM6IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zID0ge30pOiBQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghcXVlcnkgJiYgdGhpcy5pbnB1dC5nZW5lcmF0aW5nKSB7XG5cdFx0XHQvLyBpZiB0aGUgdXNlciBzdWJtaXRzIHRoZSBpbnB1dCBhbmQgZ2VuZXJhdGlvbiBmaW5pc2hlcyBxdWlja2x5LCBqdXN0IHN1Ym1pdCBpdCBmb3IgdGhlbVxuXHRcdFx0Y29uc3QgZ2VuZXJhdGluZ0F1dG9TdWJtaXRXaW5kb3cgPSA1MDA7XG5cdFx0XHRjb25zdCBzdGFydCA9IERhdGUubm93KCk7XG5cdFx0XHRhd2FpdCB0aGlzLmlucHV0LmdlbmVyYXRpbmc7XG5cdFx0XHRpZiAoRGF0ZS5ub3coKSAtIHN0YXJ0ID4gZ2VuZXJhdGluZ0F1dG9TdWJtaXRXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdoaWxlICghdGhpcy5fdmlld01vZGVsICYmICF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5vbkRpZENoYW5nZVZpZXdNb2RlbCwgdGhpcy5fc3RvcmUpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2F2ZWRCZWZvcmVTZW5kID0gZmFsc2U7XG5cdFx0Ly8gQ2hlY2sgaWYgYSBjdXN0b20gc3VibWl0IGhhbmRsZXIgd2FudHMgdG8gaGFuZGxlIHRoaXMgc3VibWlzc2lvblxuXHRcdGlmICh0aGlzLnZpZXdPcHRpb25zLnN1Ym1pdEhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IGlucHV0VmFsdWUgPSAhcXVlcnkgPyB0aGlzLmdldElucHV0KCkgOiBxdWVyeS5xdWVyeTtcblx0XHRcdGF3YWl0IHNhdmVBbGxCZWZvcmVDaGF0U2VuZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdFx0c2F2ZWRCZWZvcmVTZW5kID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGF0dGFjaGVkQ29udGV4dCA9IHRoaXMuaW5wdXQuZ2V0QXR0YWNoZWRDb250ZXh0KCkuYXNBcnJheSgpO1xuXHRcdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IHRoaXMudmlld09wdGlvbnMuc3VibWl0SGFuZGxlcihpbnB1dFZhbHVlLCB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCwgYXR0YWNoZWRDb250ZXh0LCBvcHRpb25zLmlzVm9pY2VNb2RlSW5wdXQpO1xuXHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlzVXNlclF1ZXJ5ID0gIXF1ZXJ5O1xuXHRcdGNvbnN0IGlucHV0VmFsdWUgPSBpc1VzZXJRdWVyeSA/IHRoaXMuZ2V0SW5wdXQoKSA6IHF1ZXJ5LnF1ZXJ5O1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5tb2RlbC5oYXNBY3RpdmVSZXF1ZXN0LmdldCgpICYmIGF3YWl0IHRoaXMuX3RyeUV4ZWN1dGVJbW1lZGlhdGVTbGFzaENvbW1hbmQoaW5wdXRWYWx1ZSwgaXNVc2VyUXVlcnkgPyB0aGlzLnBhcnNlZElucHV0IDogdW5kZWZpbmVkKSkge1xuXHRcdFx0dGhpcy5zZXRJbnB1dCgnJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1VzZXJRdWVyeSkge1xuXHRcdFx0Y29uc3QgcHJlU3VibWl0UmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLnRyeUhhbmRsZSh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRpbnB1dDogaW5wdXRWYWx1ZSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHByZVN1Ym1pdFJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLnNldElucHV0KCcnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc2F2ZWRCZWZvcmVTZW5kKSB7XG5cdFx0XHRhd2FpdCBzYXZlQWxsQmVmb3JlQ2hhdFNlbmQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnMucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0Ly8gV291bGQgc3RvcCBkaWN0YXRpb24gdGhlIHByZXNlcnZlZCBkcmFmdCBtYXkgc3RpbGwgYmUgdXNpbmcuXG5cdFx0XHR0aGlzLl9vbkRpZEFjY2VwdElucHV0LmZpcmUoKTtcblx0XHR9XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnNldFNjcm9sbExvY2sodGhpcy5pc0xvY2tlZFRvQ29kaW5nQWdlbnQgfHwgISFjaGVja01vZGVPcHRpb24odGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQsIHRoaXMudmlld09wdGlvbnMuYXV0b1Njcm9sbCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdElucHV0czogSUNoYXRSZXF1ZXN0SW5wdXRPcHRpb25zID0ge1xuXHRcdFx0aW5wdXQ6IGlucHV0VmFsdWUsXG5cdFx0XHQvLyBwcmVzZXJ2ZUlucHV0IG1lYW5zIHRoZSBpbnB1dCBib3ggaG9sZHMgYW4gdW5yZWxhdGVkIGRyYWZ0LCBzbyBpdHNcblx0XHRcdC8vIGF0dGFjaG1lbnRzIGJlbG9uZyB0byB0aGF0IGRyYWZ0IGFuZCBtdXN0IG5vdCBiZSBzZW50IHdpdGggdGhpcyBxdWVyeS5cblx0XHRcdGF0dGFjaGVkQ29udGV4dDogb3B0aW9ucz8ucHJlc2VydmVJbnB1dFxuXHRcdFx0XHQ/IG5ldyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KClcblx0XHRcdFx0OiBvcHRpb25zPy5lbmFibGVJbXBsaWNpdENvbnRleHQgPT09IGZhbHNlID8gdGhpcy5pbnB1dC5nZXRBdHRhY2hlZENvbnRleHQoKSA6IHRoaXMuaW5wdXQuZ2V0QXR0YWNoZWRBbmRJbXBsaWNpdENvbnRleHQoKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgYXR0YWNoZWRDb250ZXh0ID0gdGhpcy5fZ2V0QXR0YWNoZWRDb250ZXh0Rm9yQ29uY3VycmVudFNsYXNoQ29tbWFuZChvcHRpb25zLnByZXNlcnZlSW5wdXQpO1xuXHRcdGlmIChhd2FpdCB0aGlzLl9leGVjdXRlU2xhc2hDb21tYW5kRHVyaW5nUmVxdWVzdChyZXF1ZXN0SW5wdXRzLmlucHV0LCB7IGF0dGFjaGVkQ29udGV4dCB9LCBpc1VzZXJRdWVyeSwgb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpc0VkaXRpbmcgPSB0aGlzLnZpZXdNb2RlbD8uZWRpdGluZztcblx0XHQvLyBDYXB0dXJlZCBiZWZvcmUgYGZpbmlzaGVkRWRpdGluZ2AgdGVhcnMgdGhlIGlubGluZSBlZGl0b3IgZG93biwgd2hpbGUgYHRoaXMuaW5wdXRgIHN0aWxsXG5cdFx0Ly8gcmVzb2x2ZXMgdG8gaXQuIFRoZSBpbmxpbmUgZWRpdG9yIG93bnMgdGhlIG1vZGVsIGFuZCBtb2RlIGZvciBhIHJlc3VibWl0IFx1MjAxNCB0aG9zZSBhcmUgdGhlXG5cdFx0Ly8gcGlja2VycyB0aGUgdXNlciBhY3R1YWxseSBjaG9zZSBpbiBcdTIwMTQgc28gdGhlc2Ugc3RheSBhdXRob3JpdGF0aXZlIG92ZXIgdGhlIGJvdHRvbSBpbnB1dC5cblx0XHRjb25zdCBpc0lubGluZUVkaXQgPSBpc0VkaXRpbmcgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpICE9PSAnaW5wdXQnO1xuXHRcdGNvbnN0IGVkaXRlZE1vZGVsUmVxdWVzdE9wdGlvbnMgPSBpc0lubGluZUVkaXQgPyB0aGlzLmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVkaXRlZE1vZGVLaW5kID0gaXNJbmxpbmVFZGl0ID8gdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZWRpdGVkTW9kZUluZm8gPSBpc0lubGluZUVkaXQgPyB0aGlzLmlucHV0LmN1cnJlbnRNb2RlSW5mbyA6IHVuZGVmaW5lZDtcblx0XHQvLyBUb29scyBhbmQgaW5zdHJ1Y3Rpb24gcm91dGluZyBiZWxvbmcgdG8gdGhlIG1vZGUsIHNvIHRoZXkgY29tZSBmcm9tIHRoZSBzYW1lIGVkaXRvciBhdCB0aGVcblx0XHQvLyBzYW1lIG1vbWVudC5cblx0XHRjb25zdCBlZGl0ZWRNb2RlUmVxdWVzdE9wdGlvbnMgPSBpc0lubGluZUVkaXQgPyB0aGlzLmdldE1vZGVSZXF1ZXN0T3B0aW9ucygpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVkaXRlZEluc3RydWN0aW9uUm91dGluZyA9IGlzSW5saW5lRWRpdCA/IHRoaXMuX2dldEluc3RydWN0aW9uUm91dGluZygpIDogdW5kZWZpbmVkO1xuXHRcdGxldCBjYW5jZWxsZWRDdXJyZW50UmVxdWVzdCA9IGZhbHNlO1xuXHRcdGlmIChpc0VkaXRpbmcpIHtcblx0XHRcdC8vIENsZWFyIHRoZSBjYXJvdXNlbCBzaW5jZSB0aGUgZXhpc3RpbmcgcmVxdWVzdCBpcyBiZWluZyByZXBsYWNlZFxuXHRcdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsKCk7XG5cblx0XHRcdGNvbnN0IGVkaXRpbmdQZW5kaW5nUmVxdWVzdCA9IHRoaXMudmlld01vZGVsLmVkaXRpbmchLnBlbmRpbmdLaW5kO1xuXHRcdFx0aWYgKGVkaXRpbmdQZW5kaW5nUmVxdWVzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRpbmdSZXF1ZXN0SWQgPSB0aGlzLnZpZXdNb2RlbC5lZGl0aW5nIS5pZDtcblx0XHRcdFx0dGhpcy5jaGF0U2VydmljZS5yZW1vdmVQZW5kaW5nUmVxdWVzdCh0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGVkaXRpbmdSZXF1ZXN0SWQpO1xuXHRcdFx0XHRpZiAoIW9wdGlvbnMuY2FuY2VsQ3VycmVudFJlcXVlc3QpIHtcblx0XHRcdFx0XHRvcHRpb25zLnF1ZXVlID8/PSBlZGl0aW5nUGVuZGluZ1JlcXVlc3Q7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ2FjY2VwdElucHV0LWVkaXRpbmcnKTtcblx0XHRcdFx0Y2FuY2VsbGVkQ3VycmVudFJlcXVlc3QgPSB0cnVlO1xuXHRcdFx0XHRvcHRpb25zLnF1ZXVlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb3IgYWdlbnRzIHRoYXQgc3VwcG9ydCBjaGVja3BvaW50cywgcHJlc2VydmUgdGhlIGNoZWNrcG9pbnRcblx0XHRcdC8vIHRocm91Z2ggZmluaXNoZWRFZGl0aW5nIHNvIGJsb2NrZWQgcmVxdWVzdHMgYXJlIHJlbW92ZWQgYmVsb3dcblx0XHRcdC8vIGFuZCB0aGUgYWdlbnQgaG9zdCBjYW4gZGlzcGF0Y2ggYSBwcm90b2NvbCB0cnVuY2F0aW9uIGFjdGlvbi5cblx0XHRcdGNvbnN0IHByZXNlcnZlQ2hlY2twb2ludCA9IHRoaXMuX2xvY2tlZEFnZW50ICYmICEhdGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c0NoZWNrcG9pbnRzO1xuXHRcdFx0aWYgKHByZXNlcnZlQ2hlY2twb2ludCkge1xuXHRcdFx0XHR0aGlzLnJlY2VudGx5UmVzdG9yZWRDaGVja3BvaW50ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZmluaXNoZWRFZGl0aW5nKHRydWUpO1xuXHRcdFx0aWYgKCFwcmVzZXJ2ZUNoZWNrcG9pbnQpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwubW9kZWw/LnNldENoZWNrcG9pbnQodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMudmlld01vZGVsLm1vZGVsO1xuXHRcdGlmIChvcHRpb25zLmNhbmNlbEN1cnJlbnRSZXF1ZXN0ICYmIG1vZGVsLnJlcXVlc3RJblByb2dyZXNzLmdldCgpICYmICFjYW5jZWxsZWRDdXJyZW50UmVxdWVzdCkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24odGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnYWNjZXB0SW5wdXQtc3RvcEFuZFNlbmQnKTtcblx0XHRcdGNhbmNlbGxlZEN1cnJlbnRSZXF1ZXN0ID0gdHJ1ZTtcblx0XHRcdG9wdGlvbnMucXVldWUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVlc3RJblByb2dyZXNzID0gbW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCk7XG5cdFx0Ly8gQ2FuY2VsIHRoZSByZXF1ZXN0IGlmIHRoZSB1c2VyIGNob29zZXMgdG8gdGFrZSBhIGRpZmZlcmVudCBwYXRoLlxuXHRcdC8vIFRoaXMgaXMgYSBiaXQgb2YgYSBoZXVyaXN0aWMgZm9yIHRoZSBjb21tb24gY2FzZSBvZiB0b29sIGNvbmZpcm1hdGlvbityZXJvdXRlLlxuXHRcdC8vIEJ1dCB3ZSBkb24ndCBkbyB0aGlzIGlmIHRoZXJlIGFyZSBxdWV1ZWQgbWVzc2FnZXMsIGJlY2F1c2Ugd2Ugd291bGQgZWl0aGVyXG5cdFx0Ly8gZGlzY2FyZCB0aGVtIG9yIG5lZWQgYSBwcm9tcHQgKGFzIGluIGBjb25maXJtUGVuZGluZ1JlcXVlc3RzQmVmb3JlU2VuZGApXG5cdFx0Ly8gd2hpY2ggY291bGQgYmUgYSBzdXJwcmlzaW5nIGJlaGF2aW9yIGlmIHRoZSB1c2VyIGZpbmlzaGVzIHR5cGluZyBhIHN0ZWVyaW5nXG5cdFx0Ly8gcmVxdWVzdCBqdXN0IGFzIGNvbmZpcm1hdGlvbiBpcyB0cmlnZ2VyZWQuXG5cdFx0aWYgKCFvcHRpb25zLmNhbmNlbEN1cnJlbnRSZXF1ZXN0ICYmIG1vZGVsLnJlcXVlc3ROZWVkc0lucHV0LmdldCgpICYmICFtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ2FjY2VwdElucHV0LW5lZWRzSW5wdXQnKTtcblx0XHRcdG9wdGlvbnMucXVldWUgPz89IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZDtcblx0XHR9XG5cdFx0aWYgKHJlcXVlc3RJblByb2dyZXNzICYmICFvcHRpb25zLmNhbmNlbEN1cnJlbnRSZXF1ZXN0KSB7XG5cdFx0XHRvcHRpb25zLnF1ZXVlID8/PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5RdWV1ZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVxdWVzdEluUHJvZ3Jlc3MgJiYgIWlzRWRpdGluZyAmJiAhKGF3YWl0IHRoaXMuY29uZmlybVBlbmRpbmdSZXF1ZXN0c0JlZm9yZVNlbmQobW9kZWwsIG9wdGlvbnMpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHByb2Nlc3MgdGhlIHByb21wdCBjb21tYW5kXG5cdFx0Ly8gU2tpcHBlZCBmb3IgcHJlc2VydmVJbnB1dDogcGFyc2VkSW5wdXQgaXMgdGhlIGRyYWZ0LCBhbmQgYW4gYWdlbnQgc3dpdGNoIGNhbiBjbGVhciB0aGUgc2Vzc2lvbi5cblx0XHRpZiAoIW9wdGlvbnMucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0Y29uc3QgcHJvbXB0QXBwbGllZCA9IGF3YWl0IHRoaXMuX2FwcGx5UHJvbXB0RmlsZUlmU2V0KHJlcXVlc3RJbnB1dHMsIHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXByb21wdEFwcGxpZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdPcHRpb25zLmVuYWJsZVdvcmtpbmdTZXQgIT09IHVuZGVmaW5lZCAmJiByZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbihlZGl0ZWRNb2RlS2luZCwgdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQpID09PSBDaGF0TW9kZUtpbmQuRWRpdCkge1xuXHRcdFx0Y29uc3QgdW5pcXVlV29ya2luZ1NldEVudHJpZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTsgLy8gTk9URTogdGhpcyBpcyB1c2VkIGZvciBib29ra2VlcGluZyBzbyB0aGUgVUkgY2FuIGF2b2lkIHJlbmRlcmluZyByZWZlcmVuY2VzIGluIHRoZSBVSSB0aGF0IGFyZSBhbHJlYWR5IHNob3duIGluIHRoZSB3b3JraW5nIHNldFxuXHRcdFx0Y29uc3QgZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQ6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQgPSByZXF1ZXN0SW5wdXRzLmF0dGFjaGVkQ29udGV4dDtcblxuXHRcdFx0Ly8gQ29sbGVjdCBmaWxlIHZhcmlhYmxlcyBmcm9tIHByZXZpb3VzIHJlcXVlc3RzIGJlZm9yZSBzZW5kaW5nIHRoZSByZXF1ZXN0XG5cdFx0XHRjb25zdCBwcmV2aW91c1JlcXVlc3RzID0gdGhpcy52aWV3TW9kZWwubW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBwcmV2aW91c1JlcXVlc3RzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgcmVxdWVzdC52YXJpYWJsZURhdGEudmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaSh2YXJpYWJsZS52YWx1ZSkgJiYgdmFyaWFibGUua2luZCA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSB2YXJpYWJsZS52YWx1ZTtcblx0XHRcdFx0XHRcdGlmICghdW5pcXVlV29ya2luZ1NldEVudHJpZXMuaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdFx0ZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQuYWRkKHZhcmlhYmxlKTtcblx0XHRcdFx0XHRcdFx0dW5pcXVlV29ya2luZ1NldEVudHJpZXMuYWRkKHZhcmlhYmxlLnZhbHVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlcXVlc3RJbnB1dHMuYXR0YWNoZWRDb250ZXh0ID0gZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQ7XG5cblx0XHRcdHR5cGUgQ2hhdEVkaXRpbmdXb3JraW5nU2V0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnam95Y2VlcmhsJztcblx0XHRcdFx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFib3V0IHRoZSB3b3JraW5nIHNldCBzaXplIGluIGEgY2hhdCBlZGl0aW5nIHJlcXVlc3QnO1xuXHRcdFx0XHRvcmlnaW5hbFNpemU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZpbGVzIHRoYXQgdGhlIHVzZXIgdHJpZWQgdG8gYXR0YWNoIGluIHRoZWlyIGVkaXRpbmcgcmVxdWVzdC4nIH07XG5cdFx0XHRcdGFjdHVhbFNpemU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZpbGVzIHRoYXQgd2VyZSBhY3R1YWxseSBzZW50IGluIHRoZWlyIGVkaXRpbmcgcmVxdWVzdC4nIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBDaGF0RWRpdGluZ1dvcmtpbmdTZXRFdmVudCA9IHtcblx0XHRcdFx0b3JpZ2luYWxTaXplOiBudW1iZXI7XG5cdFx0XHRcdGFjdHVhbFNpemU6IG51bWJlcjtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RWRpdGluZ1dvcmtpbmdTZXRFdmVudCwgQ2hhdEVkaXRpbmdXb3JraW5nU2V0Q2xhc3NpZmljYXRpb24+KCdjaGF0RWRpdGluZy93b3JraW5nU2V0U2l6ZScsIHsgb3JpZ2luYWxTaXplOiB1bmlxdWVXb3JraW5nU2V0RW50cmllcy5zaXplLCBhY3R1YWxTaXplOiB1bmlxdWVXb3JraW5nU2V0RW50cmllcy5zaXplIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXQudmFsaWRhdGVBZ2VudE1vZGUoKTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5tb2RlbC5jaGVja3BvaW50KSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMudmlld01vZGVsLm1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0XHRmb3IgKGxldCBpID0gcmVxdWVzdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpIC09IDEpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHJlcXVlc3RzW2ldO1xuXHRcdFx0XHRpZiAocmVxdWVzdC5zaG91bGRCZUJsb2NrZWQuZ2V0KCkgfHwgcmVxdWVzdCA9PT0gdGhpcy52aWV3TW9kZWwubW9kZWwuY2hlY2twb2ludCkge1xuXHRcdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UucmVtb3ZlUmVxdWVzdCh0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5tb2RlbC5zZXRDaGVja3BvaW50KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwYW5kIGRpcmVjdG9yeSBhdHRhY2htZW50czogZXh0cmFjdCBpbWFnZXMgYXMgYmluYXJ5IGVudHJpZXNcblx0XHRjb25zdCByZXNvbHZlZEltYWdlVmFyaWFibGVzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZURpcmVjdG9yeUltYWdlQXR0YWNobWVudHMocmVxdWVzdElucHV0cy5hdHRhY2hlZENvbnRleHQuYXNBcnJheSgpKTtcblx0XHRjb25zdCBzdWJtaXR0ZWRTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHQvLyBGb3IgY29udHJpYnV0ZWQgc2Vzc2lvbiB0eXBlcywgb25seSBjb2xsZWN0IGF1dG9tYXRpYyBpbnN0cnVjdGlvbnMgd2hlblxuXHRcdC8vIHRoZSBjb250cmlidXRpb24gZXhwbGljaXRseSBvcHRzIGluIHZpYSBhdXRvQXR0YWNoUmVmZXJlbmNlcy5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9sb2NrZWRBZ2VudCA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXV0b0F0dGFjaEVuYWJsZWQgPSBjb250cmlidXRpb24gPyBjb250cmlidXRpb24uYXV0b0F0dGFjaFJlZmVyZW5jZXMgPT09IHRydWUgOiB0cnVlO1xuXG5cdFx0Y29uc3QgbW9kZUtpbmQgPSByZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbihlZGl0ZWRNb2RlS2luZCwgdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQpO1xuXHRcdGNvbnN0IG1vZGVJbmZvID0gcmVzb2x2ZUVkaXRlZFJlcXVlc3RTZWxlY3Rpb24oZWRpdGVkTW9kZUluZm8sIHRoaXMuaW5wdXQuY3VycmVudE1vZGVJbmZvKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMgPSByZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbihlZGl0ZWRNb2RlbFJlcXVlc3RPcHRpb25zLCB0aGlzLmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpKTtcblxuXHRcdGNvbnN0IHRyYW5zY3JpcHRDb250ZXh0ID0gdGhpcy50cmFuc2NyaXB0Q29udGV4dFZhbHVlO1xuXHRcdGlmICh0cmFuc2NyaXB0Q29udGV4dCkge1xuXHRcdFx0cmVxdWVzdElucHV0cy5hdHRhY2hlZENvbnRleHQuaW5zZXJ0Rmlyc3QodHJhbnNjcmlwdENvbnRleHQpO1xuXHRcdFx0dGhpcy5zZXRUcmFuc2NyaXB0Q29udGV4dCh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0OiBDaGF0U2VuZFJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5zZW5kUmVxdWVzdCh0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJbnB1dHMuaW5wdXQsIHtcblx0XHRcdFx0Li4uc2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zLFxuXHRcdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdFx0bG9jYXRpb25EYXRhOiB0aGlzLl9sb2NhdGlvbi5yZXNvbHZlRGF0YT8uKCksXG5cdFx0XHRcdHBhcnNlckNvbnRleHQ6IHsgc2VsZWN0ZWRBZ2VudDogdGhpcy5fbGFzdFNlbGVjdGVkQWdlbnQsIG1vZGU6IG1vZGVLaW5kLCBhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudD8uY2FwYWJpbGl0aWVzID8/IHRoaXMuYXR0YWNobWVudENhcGFiaWxpdGllcyB9LFxuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQ6IHJlcXVlc3RJbnB1dHMuYXR0YWNoZWRDb250ZXh0LmFzQXJyYXkoKSxcblx0XHRcdFx0cmVzb2x2ZWRWYXJpYWJsZXM6IHJlc29sdmVkSW1hZ2VWYXJpYWJsZXMsXG5cdFx0XHRcdG5vQ29tbWFuZERldGVjdGlvbjogb3B0aW9ucz8ubm9Db21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0XHRpc1ZvaWNlTW9kZUlucHV0OiBvcHRpb25zPy5pc1ZvaWNlTW9kZUlucHV0LFxuXHRcdFx0XHQuLi5yZXNvbHZlRWRpdGVkUmVxdWVzdFNlbGVjdGlvbihlZGl0ZWRNb2RlUmVxdWVzdE9wdGlvbnMsIHRoaXMuZ2V0TW9kZVJlcXVlc3RPcHRpb25zKCkpLFxuXHRcdFx0XHRtb2RlSW5mbyxcblx0XHRcdFx0YWdlbnRJZFNpbGVudDogdGhpcy5fbG9ja2VkQWdlbnQ/LmlkLFxuXHRcdFx0XHRxdWV1ZTogb3B0aW9ucz8ucXVldWUsXG5cdFx0XHRcdGluc3RydWN0aW9uQ29udGV4dDogYXV0b0F0dGFjaEVuYWJsZWQgPyB7XG5cdFx0XHRcdFx0bW9kZUtpbmQsXG5cdFx0XHRcdFx0Li4ucmVzb2x2ZUVkaXRlZFJlcXVlc3RTZWxlY3Rpb24oZWRpdGVkSW5zdHJ1Y3Rpb25Sb3V0aW5nLCB0aGlzLl9nZXRJbnN0cnVjdGlvblJvdXRpbmcoKSksXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRyYW5zY3JpcHRDb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VHJhbnNjcmlwdENvbnRleHQodHJhbnNjcmlwdENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0aWYgKENoYXRTZW5kUmVzdWx0LmlzUmVqZWN0ZWQocmVzdWx0KSkge1xuXHRcdFx0aWYgKHRyYW5zY3JpcHRDb250ZXh0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VHJhbnNjcmlwdENvbnRleHQodHJhbnNjcmlwdENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5uZXdTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgbmV3TW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVzdWx0Lm5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChuZXdNb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0TW9kZWwobmV3TW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dUaGlua2luZ1N0eWxlVXNhZ2UoJ3N1Ym1pdCcpO1xuXG5cdFx0Ly8gdmlzaWJpbGl0eSBzeW5jIGJlZm9yZSBmaXJpbmcgZXZlbnRzIHRvIGhpZGUgdGhlIHdlbGNvbWUgdmlld1xuXHRcdHRoaXMudXBkYXRlQ2hhdFZpZXdWaXNpYmlsaXR5KCk7XG5cdFx0dGhpcy5pbnB1dC5hY2NlcHRJbnB1dChvcHRpb25zPy5zdG9yZVRvSGlzdG9yeSA/PyBpc1VzZXJRdWVyeSwgb3B0aW9ucz8ucHJlc2VydmVGb2N1cywgb3B0aW9ucz8ucHJlc2VydmVJbnB1dCk7XG5cblx0XHRpZiAoIW9wdGlvbnMucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0Ly8gQSBtYWludGVuYW5jZSBjb21tYW5kIGlzIG5vdCB0aGUgdXNlcidzIGdvYWwuXG5cdFx0XHR0aGlzLl9tYXliZVN0YXJ0R29hbFN1bW1hcnkocmVxdWVzdElucHV0cy5pbnB1dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VudCA9IGF3YWl0IGFjY2VwdEFuZEF3YWl0U2VudFJlcXVlc3QocmVzdWx0LCBvcHRpb25zLm9uUmVxdWVzdEFjY2VwdGVkKTtcblx0XHRpZiAoIXNlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIW9wdGlvbnMucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0Ly8gTm90IGEgdXNlciBzdWJtaXNzaW9uOyBsaXN0ZW5lcnMgd291bGQgY29uc3VtZSBkcmFmdCBzdGF0ZS4gQWxzbyBza2lwcyBlZGl0b3IgcGlubmluZy5cblx0XHRcdHRoaXMuX29uRGlkU3VibWl0QWdlbnQuZmlyZSh7IGFnZW50OiBzZW50LmRhdGEuYWdlbnQsIHNsYXNoQ29tbWFuZDogc2VudC5kYXRhLnNsYXNoQ29tbWFuZCB9KTtcblx0XHR9XG5cdFx0dGhpcy5oYW5kbGVEZWxlZ2F0aW9uRXhpdElmTmVlZGVkKHRoaXMuX2xvY2tlZEFnZW50LCBzZW50LmRhdGEuYWdlbnQpO1xuXG5cdFx0Ly8gSWYgdGhlIHNlc3Npb24gd2FzIHJlcGxhY2VkICh1bnRpdGxlZCAtPiByZWFsIGNvbnRyaWJ1dGVkIHNlc3Npb24pLCBzd2FwIHRoZSB3aWRnZXQncyBtb2RlbFxuXHRcdGlmIChzZW50Lm5ld1Nlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgbmV3TW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2VudC5uZXdTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKG5ld01vZGVsKSB7XG5cdFx0XHRcdHRoaXMuc2V0TW9kZWwobmV3TW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHNlbnQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0Ly8gT25seSBzdGFydCBhY2Nlc3NpYmlsaXR5IHByb2dyZXNzIG9uY2UgYSByZWFsIHJlcXVlc3QvcmVzcG9uc2UgbW9kZWwgZXhpc3RzLlxuXHRcdFx0dGhpcy5jaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UuYWNjZXB0UmVxdWVzdChzdWJtaXR0ZWRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0c2VudC5kYXRhLnJlc3BvbnNlQ29tcGxldGVQcm9taXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5maWx0ZXIoaXNSZXNwb25zZVZNKTtcblx0XHRcdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gcmVzcG9uc2VzPy5bcmVzcG9uc2VzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHR0aGlzLmNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5hY2NlcHRSZXNwb25zZSh0aGlzLCB0aGlzLmNvbnRhaW5lciwgbGFzdFJlc3BvbnNlLCBzdWJtaXR0ZWRTZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnM/LmlzVm9pY2VJbnB1dCk7XG5cdFx0XHRcdGlmIChsYXN0UmVzcG9uc2U/LnJlc3VsdD8ubmV4dFF1ZXN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBwcm9tcHQsIHBhcnRpY2lwYW50LCBjb21tYW5kIH0gPSBsYXN0UmVzcG9uc2UucmVzdWx0Lm5leHRRdWVzdGlvbjtcblx0XHRcdFx0XHRjb25zdCBxdWVzdGlvbiA9IGZvcm1hdENoYXRRdWVzdGlvbih0aGlzLmNoYXRBZ2VudFNlcnZpY2UsIHRoaXMubG9jYXRpb24sIHByb21wdCwgcGFydGljaXBhbnQsIGNvbW1hbmQpO1xuXHRcdFx0XHRcdGlmIChxdWVzdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5pbnB1dC5zZXRWYWx1ZShxdWVzdGlvbiwgZmFsc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc2VudC5kYXRhLnJlc3BvbnNlQ3JlYXRlZFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdHRhY2hlZENvbnRleHRGb3JDb25jdXJyZW50U2xhc2hDb21tYW5kKHByZXNlcnZlSW5wdXQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10ge1xuXHRcdHJldHVybiBwcmVzZXJ2ZUlucHV0ID8gW10gOiB0aGlzLmlucHV0LmdldEF0dGFjaGVkQ29udGV4dCgpLmFzQXJyYXkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2V4ZWN1dGVTbGFzaENvbW1hbmREdXJpbmdSZXF1ZXN0KGlucHV0OiBzdHJpbmcsIHJlcXVlc3RPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgc3RvcmVUb0hpc3Rvcnk6IGJvb2xlYW4sIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbDtcblx0XHRpZiAoIXZpZXdNb2RlbD8ubW9kZWwuaGFzQWN0aXZlUmVxdWVzdC5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcikucGFyc2VDaGF0UmVxdWVzdChcblx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRpbnB1dCxcblx0XHRcdHRoaXMubG9jYXRpb24sXG5cdFx0XHR7XG5cdFx0XHRcdHNlbGVjdGVkQWdlbnQ6IHRoaXMuX2xhc3RTZWxlY3RlZEFnZW50LFxuXHRcdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdFx0YXR0YWNobWVudENhcGFiaWxpdGllczogdGhpcy5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRmb3JjZWRBZ2VudDogdGhpcy5fbG9ja2VkQWdlbnQ/LmlkID8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHRoaXMuX2xvY2tlZEFnZW50LmlkKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRjb25zdCBjb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpO1xuXHRcdGlmICghY29tbWFuZFBhcnQ/LnNsYXNoQ29tbWFuZC5leGVjdXRlRHVyaW5nUmVxdWVzdCB8fCBjb21tYW5kUGFydC5zbGFzaENvbW1hbmQuc2lsZW50ICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2Ygdmlld01vZGVsLm1vZGVsLmdldFJlcXVlc3RzKCkpIHtcblx0XHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiByZXF1ZXN0Lm1lc3NhZ2UudGV4dCB9XSB9KTtcblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudG9TdHJpbmcoKSB9XSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLmlucHV0LmFjY2VwdElucHV0KHN0b3JlVG9IaXN0b3J5LCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRjb25zdCBwcm9tcHQgPSBwYXJzZWRSZXF1ZXN0LnRleHQuc2xpY2UoY29tbWFuZFBhcnQucmFuZ2UuZW5kRXhjbHVzaXZlKS50cmltU3RhcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChcblx0XHRcdFx0Y29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRcdHByb21wdCxcblx0XHRcdFx0UHJvZ3Jlc3MuTm9uZSxcblx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0dGhpcy5sb2NhdGlvbixcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdFx0cmVxdWVzdE9wdGlvbnMsXG5cdFx0XHQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbGVhckNoYXRNYXJrcyh2aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBSZXNvbHZlIGltYWdlcyBmcm9tIGRpcmVjdG9yeSBhdHRhY2htZW50cyB0byBzZW5kIGFzIGFkZGl0aW9uYWwgdmFyaWFibGVzLlxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRGlyZWN0b3J5SW1hZ2VBdHRhY2htZW50cyhhdHRhY2htZW50czogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+IHtcblx0XHRjb25zdCBpbWFnZVByb21pc2VzOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT5bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBhdHRhY2htZW50IG9mIGF0dGFjaG1lbnRzKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5raW5kID09PSAnZGlyZWN0b3J5JyAmJiBVUkkuaXNVcmkoYXR0YWNobWVudC52YWx1ZSkpIHtcblx0XHRcdFx0aW1hZ2VQcm9taXNlcy5wdXNoKFxuXHRcdFx0XHRcdHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlRGlyZWN0b3J5SW1hZ2VzKGF0dGFjaG1lbnQudmFsdWUpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGltYWdlUHJvbWlzZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBQcm9taXNlLmFsbChpbWFnZVByb21pc2VzKTtcblx0XHRyZXR1cm4gcmVzb2x2ZWQuZmxhdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ5RXhlY3V0ZUltbWVkaWF0ZVNsYXNoQ29tbWFuZChpbnB1dDogc3RyaW5nLCBwYXJzZWRJbnB1dDogSVBhcnNlZENoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWw7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHBhcnNlZElucHV0ID8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpXG5cdFx0XHQucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQodGhpcyksIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0KHRoaXMpLCBpbnB1dCwgdGhpcy5sb2NhdGlvbiwge1xuXHRcdFx0XHRzZWxlY3RlZEFnZW50OiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudCxcblx0XHRcdFx0bW9kZTogdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQsXG5cdFx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHRoaXMuYXR0YWNobWVudENhcGFiaWxpdGllcyxcblx0XHRcdFx0Zm9yY2VkQWdlbnQ6IHRoaXMuX2xvY2tlZEFnZW50Py5pZCA/IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudCh0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiBnZXRDaGF0U2Vzc2lvblR5cGUodmlld01vZGVsLm1vZGVsLnNlc3Npb25SZXNvdXJjZSlcblx0XHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1hbmRQYXJ0ID0gZ2V0SW1tZWRpYXRlU2lsZW50U2xhc2hDb21tYW5kUGFydChwYXJzZWRSZXF1ZXN0KTtcblx0XHRpZiAoIWNvbW1hbmRQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2Ygdmlld01vZGVsLm1vZGVsLmdldFJlcXVlc3RzKCkpIHtcblx0XHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiByZXF1ZXN0Lm1lc3NhZ2UudGV4dCB9XSB9KTtcblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudG9TdHJpbmcoKSB9XSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gY29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmNvbW1hbmQ7XG5cdFx0YXdhaXQgdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChcblx0XHRcdGNvbW1hbmQsXG5cdFx0XHRpbnB1dC5zbGljZShjb21tYW5kUGFydC5yYW5nZS5lbmRFeGNsdXNpdmUpLnRyaW1TdGFydCgpLFxuXHRcdFx0bmV3IFByb2dyZXNzKCgpID0+IHsgfSksXG5cdFx0XHRoaXN0b3J5LFxuXHRcdFx0dGhpcy5sb2NhdGlvbixcblx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbmZpcm1QZW5kaW5nUmVxdWVzdHNCZWZvcmVTZW5kKG1vZGVsOiBJQ2hhdE1vZGVsLCBvcHRpb25zOiBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChvcHRpb25zLnF1ZXVlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNQZW5kaW5nUmVxdWVzdHMgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGggPiAwO1xuXHRcdGlmICghaGFzUGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9tcHRSZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6ICdxdWVzdGlvbicsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2hhdC5wZW5kaW5nUmVxdWVzdHMucHJvbXB0Lm1lc3NhZ2UnLCBcIllvdSBhbHJlYWR5IGhhdmUgcGVuZGluZyByZXF1ZXN0cy5cIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjaGF0LnBlbmRpbmdSZXF1ZXN0cy5wcm9tcHQuZGV0YWlsJywgXCJEbyB5b3Ugd2FudCB0byBrZWVwIHRoZW0gaW4gdGhlIHF1ZXVlIG9yIHJlbW92ZSB0aGVtIGJlZm9yZSBzZW5kaW5nIHRoaXMgbWVzc2FnZT9cIiksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQucGVuZGluZ1JlcXVlc3RzLnByb21wdC5rZWVwJywgXCJLZWVwIFBlbmRpbmcgUmVxdWVzdHNcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiAna2VlcCdcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5wZW5kaW5nUmVxdWVzdHMucHJvbXB0LnJlbW92ZScsIFwiUmVtb3ZlIFBlbmRpbmcgUmVxdWVzdHNcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiAncmVtb3ZlJ1xuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRpZiAoIXByb21wdFJlc3VsdC5yZXN1bHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAocHJvbXB0UmVzdWx0LnJlc3VsdCA9PT0gJ3JlbW92ZScpIHtcblx0XHRcdGZvciAoY29uc3QgcGVuZGluZ1JlcXVlc3Qgb2YgWy4uLm1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpXSkge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXJ2aWNlLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgcGVuZGluZ1JlcXVlc3QucmVxdWVzdC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBLZWVwIHRoZSBzZWxlY3RlZCBtb2RlbCBhbmQgaXRzIGVkaXRvci1zY29wZWQgY29uZmlndXJhdGlvbiB0b2dldGhlciBzb1xuXHQvLyByZXNlbmQvY29uZmlybWF0aW9uIGZsb3dzIHByZXNlcnZlIGN1c3RvbSBwZXItbW9kZWwgc2V0dGluZ3MuXG5cdGdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpOiBQaWNrPElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCAndXNlclNlbGVjdGVkTW9kZWxJZCcgfCAndXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uJz4ge1xuXHRcdGNvbnN0IG1vZGVsSWQgPSB0aGlzLmlucHV0LmN1cnJlbnRMYW5ndWFnZU1vZGVsO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiBtb2RlbElkLFxuXHRcdFx0dXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uOiBtb2RlbElkID8gdGhpcy5pbnB1dC5nZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBUaGUgdG9vbCBhbmQgc3ViYWdlbnQgcm91dGluZyBvZiB3aGljaGV2ZXIgaW5wdXQgdGhpcyBpcyBjYWxsZWQgb24sIGZvciBpdHMgY3VycmVudCBtb2RlLiAqL1xuXHRwcml2YXRlIF9nZXRJbnN0cnVjdGlvblJvdXRpbmcoKTogUGljazxOb25OdWxsYWJsZTxJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9uc1snaW5zdHJ1Y3Rpb25Db250ZXh0J10+LCAnZW5hYmxlZFRvb2xzJyB8ICdlbmFibGVkU3ViQWdlbnRzJz4ge1xuXHRcdGNvbnN0IGlzQWdlbnQgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkVG9vbHM6IGlzQWdlbnQgPyB0aGlzLmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC51c2VyU2VsZWN0ZWRUb29scy5nZXQoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWRTdWJBZ2VudHM6IGlzQWdlbnQgPyB0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmFnZW50cz8uZ2V0KCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGdldE1vZGVSZXF1ZXN0T3B0aW9ucygpOiBQYXJ0aWFsPElDaGF0U2VuZFJlcXVlc3RPcHRpb25zPiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWUpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGNhcHR1cmVkTW9kZUlkID0gdGhpcy5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKS5pZDtcblx0XHRjb25zdCB1c2VyU2VsZWN0ZWRUb29scyA9IHRoaXMuaW5wdXQuc2VsZWN0ZWRUb29sc01vZGVsLnVzZXJTZWxlY3RlZFRvb2xzO1xuXG5cdFx0bGV0IGxhc3RUb29sc1NuYXBzaG90ID0gdXNlclNlbGVjdGVkVG9vbHMuZ2V0KCk7XG5cblx0XHQvLyBXaGVuIHRoZSB3aWRnZXQgaGFzIGxvYWRlZCBhIG5ldyBzZXNzaW9uLCByZXR1cm4gYSBzbmFwc2hvdCBvZiB0aGUgdG9vbHMgZm9yIHRoaXMgc2Vzc2lvbi5cblx0XHQvLyBPbmx5IHN5bmMgd2l0aCB0aGUgdG9vbHMgbW9kZWwgd2hlbiB0aGlzIHNlc3Npb24gaXMgc2hvd24gd2l0aCB0aGUgc2FtZSBtb2RlLlxuXHRcdGNvbnN0IHNjb3BlZFRvb2xzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RUb29sc1NuYXBzaG90O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuX3ZpZXdNb2RlbE9icy5yZWFkKHJlYWRlcik/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlSWQgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLnJlYWQocmVhZGVyKS5pZDtcblx0XHRcdGlmIChpc0VxdWFsKGFjdGl2ZVNlc3Npb24sIHNlc3Npb25SZXNvdXJjZSkgJiYgY3VycmVudE1vZGVJZCA9PT0gY2FwdHVyZWRNb2RlSWQpIHtcblx0XHRcdFx0Y29uc3QgdG9vbHMgPSB1c2VyU2VsZWN0ZWRUb29scy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxhc3RUb29sc1NuYXBzaG90ID0gdG9vbHM7XG5cdFx0XHRcdHJldHVybiB0b29scztcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXN0VG9vbHNTbmFwc2hvdDtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlSW5mbzogdGhpcy5pbnB1dC5jdXJyZW50TW9kZUluZm8sXG5cdFx0XHR1c2VyU2VsZWN0ZWRUb29sczogc2NvcGVkVG9vbHMsXG5cdFx0fTtcblx0fVxuXG5cdGdldENvZGVCbG9ja0luZm9zRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRDb2RlQmxvY2tJbmZvc0ZvclJlc3BvbnNlKHJlc3BvbnNlKTtcblx0fVxuXG5cdGdldENvZGVCbG9ja0luZm9Gb3JFZGl0b3IodXJpOiBVUkkpOiBJQ2hhdENvZGVCbG9ja0luZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuZ2V0Q29kZUJsb2NrSW5mb0ZvckVkaXRvcih1cmkpO1xuXHR9XG5cblx0Z2V0RmlsZVRyZWVJbmZvc0ZvclJlc3BvbnNlKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRGaWxlVHJlZUluZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRGaWxlVHJlZUluZm9zRm9yUmVzcG9uc2UocmVzcG9uc2UpO1xuXHR9XG5cblx0Z2V0TGFzdEZvY3VzZWRGaWxlVHJlZUZvclJlc3BvbnNlKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRGaWxlVHJlZUluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuZ2V0TGFzdEZvY3VzZWRGaWxlVHJlZUZvclJlc3BvbnNlKHJlc3BvbnNlKTtcblx0fVxuXG5cdGdldEVsZW1lbnRGcm9tTm9kZShub2RlOiBIVE1MRWxlbWVudCk6IENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRFbGVtZW50RnJvbU5vZGUobm9kZSk7XG5cdH1cblxuXHRnZXRGaW5kQ29udHJvbGxlcigpOiBJQ2hhdEZpbmRDb250cm9sbGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZENvbnRyb2xsZXI7XG5cdH1cblxuXHQvKiogQGludGVybmFsIFVzZWQgYnkge0BsaW5rIENoYXRGaW5kV2lkZ2V0fSB0byBsb2NhdGUgYSByb3cncyByZW5kZXJlZCB0ZW1wbGF0ZS4gTm90IHBhcnQgb2YgYElDaGF0V2lkZ2V0YC4gKi9cblx0Z2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LmdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZChyZXF1ZXN0SWQpO1xuXHR9XG5cblx0LyoqIEBpbnRlcm5hbCBVc2VkIGJ5IHtAbGluayBDaGF0RmluZFdpZGdldH0gdG8ga25vdyB3aGVuIGEgcm93IHJlbW91bnRzLiBOb3QgcGFydCBvZiBgSUNoYXRXaWRnZXRgLiAqL1xuXHRnZXQgb25EaWRSZXJlbmRlclJvdygpOiBFdmVudDxJQ2hhdExpc3RJdGVtVGVtcGxhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0Lm9uRGlkUmVyZW5kZXI7XG5cdH1cblxuXHRmb2N1c1Jlc3BvbnNlSXRlbShsYXN0Rm9jdXNlZD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmxpc3RXaWRnZXQuZm9jdXNMYXN0SXRlbShsYXN0Rm9jdXNlZCk7XG5cdH1cblxuXHRzZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZShtYXhIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGUgPSBtYXhIZWlnaHQ7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR3aWR0aCA9IE1hdGgubWluKHdpZHRoLCB0aGlzLnZpZXdPcHRpb25zLnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcgPyB3aWR0aCA6IDk1MCk7IC8vIG5vIG1pbiB3aWR0aCBvZiBpbmxpbmUgY2hhdFxuXG5cdFx0dGhpcy5ib2R5RGltZW5zaW9uID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fZmluZENvbnRyb2xsZXI/LmxheW91dCh3aWR0aCk7XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdHRoaXMuaW5saW5lSW5wdXRQYXJ0Py5sYXlvdXQod2lkdGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTdWdnZXN0TmV4dFdpZGdldEhlaWdodCA9IHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhlaWdodDtcblx0XHRjb25zdCBpbnB1dE1heEhlaWdodCA9IHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YSB8fCB0aGlzLmxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiB0aGlzLmlucHV0UGFydE1heEhlaWdodE92ZXJyaWRlICE9PSB1bmRlZmluZWRcblx0XHRcdFx0PyBNYXRoLm1heCgwLCB0aGlzLmlucHV0UGFydE1heEhlaWdodE92ZXJyaWRlIC0gY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0IC0gTUlOX0xJU1RfSEVJR0hUKVxuXHRcdFx0XHQ6IE1hdGgubWF4KDAsIGhlaWdodCAtIGNoYXRTdWdnZXN0TmV4dFdpZGdldEhlaWdodCAtIE1JTl9MSVNUX0hFSUdIVCk7XG5cdFx0dGhpcy5pbnB1dFBhcnQuc2V0TWF4SGVpZ2h0KGlucHV0TWF4SGVpZ2h0KTtcblx0XHR0aGlzLmlucHV0UGFydC5sYXlvdXQod2lkdGgpO1xuXG5cdFx0dGhpcy5fbGF5b3V0TGlzdEZvcklucHV0SGVpZ2h0KCk7XG5cdFx0dGhpcy5fb25EaWRMYXlvdXQuZmlyZSh7IHdpZHRoLCBoZWlnaHQgfSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkZ2V0J3MgYXZhaWxhYmxlIHNwYWNlIGFmdGVyIHRoZSBpbnRyaW5zaWMgaW5wdXQgaGVpZ2h0IGNoYW5nZWQuXG5cdCAqIFRoZSBpbnB1dCBoYXMgYWxyZWFkeSBsYWlkIGl0c2VsZiBvdXQsIHNvIHRoaXMgb25seSByZXNpemVzIHRoZSBsaXN0LXNpZGVcblx0ICogc3VyZmFjZXMgYW5kIG11c3Qgbm90IGNhbGwge0BsaW5rIENoYXRJbnB1dFBhcnQubGF5b3V0fS5cblx0ICovXG5cdGxheW91dEZvcklucHV0SGVpZ2h0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0d2lkdGggPSBNYXRoLm1pbih3aWR0aCwgdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ21pbmltYWwnID8gd2lkdGggOiA5NTApO1xuXHRcdHRoaXMuYm9keURpbWVuc2lvbiA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdHRoaXMuX2xheW91dExpc3RGb3JJbnB1dEhlaWdodCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWxheW91dCBqdXN0IHRoZSBsaXN0LCB3ZWxjb21lIGNvbnRhaW5lciwgYW5kIGxpc3QgY29udGFpbmVyIHRvIG1hdGNoXG5cdCAqIHRoZSBjdXJyZW50IGlucHV0LXBhcnQgaGVpZ2h0LiBDYWxsZWQgYm90aCBmcm9tIHtAbGluayBsYXlvdXR9IGFuZCBmcm9tXG5cdCAqIHRoZSBpbnB1dFBhcnQuaGVpZ2h0IGF1dG9ydW4gc28gd2UgbmV2ZXIgcmUtZW50ZXIgaW5wdXRQYXJ0LmxheW91dCB3aGVuXG5cdCAqIG9ubHkgdGhlIGlucHV0IGhlaWdodCBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGF5b3V0TGlzdEZvcklucHV0SGVpZ2h0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ib2R5RGltZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBoZWlnaHQsIHdpZHRoIH0gPSB0aGlzLmJvZHlEaW1lbnNpb247XG5cdFx0Y29uc3QgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0ID0gdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGVpZ2h0O1xuXG5cdFx0Y29uc3QgaW5wdXRIZWlnaHQgPSB0aGlzLl9pbnB1dFZpc2libGUgPyB0aGlzLmlucHV0UGFydC5oZWlnaHQuZ2V0KCkgOiB0aGlzLmlucHV0UGFydC5lbGVtZW50Lm9mZnNldEhlaWdodDtcblx0XHRjb25zdCByZWFkT25seUJhbm5lckhlaWdodCA9IHRoaXMucmVhZE9ubHlCYW5uZXI/LnZpc2libGUgPyBDSEFUX1JFQURfT05MWV9CQU5ORVJfSEVJR0hUIDogMDtcblx0XHRjb25zdCBsYXN0RWxlbWVudFZpc2libGUgPSB0aGlzLmxpc3RXaWRnZXQuaXNTY3JvbGxlZFRvQm90dG9tO1xuXHRcdGNvbnN0IGxhc3RJdGVtID0gdGhpcy5saXN0V2lkZ2V0Lmxhc3RJdGVtO1xuXG5cdFx0Y29uc3QgY29udGVudEhlaWdodCA9IE1hdGgubWF4KDAsIGhlaWdodCAtIGlucHV0SGVpZ2h0IC0gcmVhZE9ubHlCYW5uZXJIZWlnaHQgLSBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQpO1xuXHRcdHRoaXMubGlzdFdpZGdldC5sYXlvdXQoY29udGVudEhlaWdodCwgd2lkdGgpO1xuXG5cdFx0dGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtjb250ZW50SGVpZ2h0fXB4YDtcblxuXHRcdGNvbnN0IGxhc3RSZXNwb25zZUlzUmVuZGVyaW5nID0gaXNSZXNwb25zZVZNKGxhc3RJdGVtKSAmJiBsYXN0SXRlbS5yZW5kZXJEYXRhO1xuXHRcdGlmIChsYXN0RWxlbWVudFZpc2libGUgJiYgIXRoaXMubGlzdFdpZGdldC5pc0F1dG9TY3JvbGxIZWxkICYmICghbGFzdFJlc3BvbnNlSXNSZW5kZXJpbmcgfHwgY2hlY2tNb2RlT3B0aW9uKHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kLCB0aGlzLnZpZXdPcHRpb25zLmF1dG9TY3JvbGwpKSkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnNjcm9sbFRvRW5kKCk7XG5cdFx0fVxuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtjb250ZW50SGVpZ2h0fXB4YDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YT86IHsgbnVtT2ZNZXNzYWdlczogbnVtYmVyOyBtYXhIZWlnaHQ6IG51bWJlcjsgZW5hYmxlZDogYm9vbGVhbiB9O1xuXG5cdC8vIEFuIGFsdGVybmF0aXZlIHRvIGxheW91dCwgdGhpcyBhbGxvd3MgeW91IHRvIHNwZWNpZnkgdGhlIG51bWJlciBvZiBDaGF0VHJlZUl0ZW1zXG5cdC8vIHlvdSB3YW50IHRvIHNob3csIGFuZCB0aGUgbWF4IGhlaWdodCBvZiB0aGUgY29udGFpbmVyLiBJdCB3aWxsIHRoZW4gbGF5b3V0IHRoZVxuXHQvLyB0cmVlIHRvIHNob3cgdGhhdCBtYW55IGl0ZW1zLlxuXHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0OiBUaGlzIGNvdWxkIHVzZSBzb21lIHJlZmFjdG9yaW5nIHRvIG1ha2UgaXQgY2xlYXIgd2hpY2ggbGF5b3V0IHN0cmF0ZWd5IGlzIGJlaW5nIHVzZWRcblx0c2V0RHluYW1pY0NoYXRUcmVlSXRlbUxheW91dChudW1PZkNoYXRUcmVlSXRlbXM6IG51bWJlciwgbWF4SGVpZ2h0OiBudW1iZXIpIHtcblx0XHR0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEgPSB7IG51bU9mTWVzc2FnZXM6IG51bU9mQ2hhdFRyZWVJdGVtcywgbWF4SGVpZ2h0LCBlbmFibGVkOiB0cnVlIH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkQ2hhbmdlSXRlbUhlaWdodCgoKSA9PiB0aGlzLmxheW91dER5bmFtaWNDaGF0VHJlZUl0ZW1Nb2RlKCkpKTtcblxuXHRcdGNvbnN0IG11dGFibGVEaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZFNjcm9sbCgoZSkgPT4ge1xuXHRcdFx0Ly8gVE9ET0BUeWxlckxlb25oYXJkdCB0aGlzIHNob3VsZCBwcm9iYWJseSBqdXN0IGJlIGRpc3Bvc2VkIHdoZW4gdGhpcyBpcyBkaXNhYmxlZFxuXHRcdFx0Ly8gYW5kIHRoZW4gc2V0IHVwIGFnYWluIHdoZW4gaXQgaXMgZW5hYmxlZCBhZ2FpblxuXHRcdFx0aWYgKCF0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGE/LmVuYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bXV0YWJsZURpc3Bvc2FibGUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMubGlzdENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0aWYgKCFlLnNjcm9sbFRvcENoYW5nZWQgfHwgZS5oZWlnaHRDaGFuZ2VkIHx8IGUuc2Nyb2xsSGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZW5kZXJIZWlnaHQgPSBlLmhlaWdodDtcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGUuc2Nyb2xsSGVpZ2h0IC0gcmVuZGVySGVpZ2h0IC0gZS5zY3JvbGxUb3A7XG5cdFx0XHRcdGlmIChkaWZmID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcG9zc2libGVNYXhIZWlnaHQgPSAodGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhPy5tYXhIZWlnaHQgPz8gbWF4SGVpZ2h0KTtcblx0XHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLmJvZHlEaW1lbnNpb24/LndpZHRoID8/IHRoaXMuY29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdFx0XHR0aGlzLmlucHV0LmxheW91dCh3aWR0aCk7XG5cdFx0XHRcdGNvbnN0IGlucHV0UGFydEhlaWdodCA9IHRoaXMuaW5wdXQuaGVpZ2h0LmdldCgpO1xuXHRcdFx0XHRjb25zdCBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQgPSB0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oZWlnaHQ7XG5cdFx0XHRcdGNvbnN0IG5ld0hlaWdodCA9IE1hdGgubWluKHJlbmRlckhlaWdodCArIGRpZmYsIHBvc3NpYmxlTWF4SGVpZ2h0IC0gaW5wdXRQYXJ0SGVpZ2h0IC0gY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0KTtcblx0XHRcdFx0dGhpcy5sYXlvdXQobmV3SGVpZ2h0ICsgaW5wdXRQYXJ0SGVpZ2h0ICsgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGVEeW5hbWljQ2hhdFRyZWVJdGVtTGF5b3V0KG51bU9mQ2hhdFRyZWVJdGVtczogbnVtYmVyLCBtYXhIZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YSA9IHsgbnVtT2ZNZXNzYWdlczogbnVtT2ZDaGF0VHJlZUl0ZW1zLCBtYXhIZWlnaHQsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHRsZXQgaGFzQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdGxldCBoZWlnaHQgPSB0aGlzLmJvZHlEaW1lbnNpb24hLmhlaWdodDtcblx0XHRsZXQgd2lkdGggPSB0aGlzLmJvZHlEaW1lbnNpb24hLndpZHRoO1xuXHRcdGlmIChtYXhIZWlnaHQgPCB0aGlzLmJvZHlEaW1lbnNpb24hLmhlaWdodCkge1xuXHRcdFx0aGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdFx0aGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRhaW5lcldpZHRoID0gdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0aWYgKHRoaXMuYm9keURpbWVuc2lvbj8ud2lkdGggIT09IGNvbnRhaW5lcldpZHRoKSB7XG5cdFx0XHR3aWR0aCA9IGNvbnRhaW5lcldpZHRoO1xuXHRcdFx0aGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChoYXNDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNEeW5hbWljQ2hhdFRyZWVJdGVtTGF5b3V0RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhPy5lbmFibGVkID8/IGZhbHNlO1xuXHR9XG5cblx0c2V0IGlzRHluYW1pY0NoYXRUcmVlSXRlbUxheW91dEVuYWJsZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEuZW5hYmxlZCA9IHZhbHVlO1xuXHR9XG5cblx0bGF5b3V0RHluYW1pY0NoYXRUcmVlSXRlbU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCB8fCAhdGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhPy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLmJvZHlEaW1lbnNpb24/LndpZHRoID8/IHRoaXMuY29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdHRoaXMuaW5wdXQubGF5b3V0KHdpZHRoKTtcblx0XHRjb25zdCBpbnB1dEhlaWdodCA9IHRoaXMuaW5wdXQuaGVpZ2h0LmdldCgpO1xuXHRcdGNvbnN0IGNoYXRTdWdnZXN0TmV4dFdpZGdldEhlaWdodCA9IHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhlaWdodDtcblxuXHRcdGNvbnN0IHRvdGFsTWVzc2FnZXMgPSB0aGlzLnZpZXdNb2RlbC5nZXRJdGVtcygpO1xuXHRcdC8vIGdyYWIgdGhlIGxhc3QgTiBtZXNzYWdlc1xuXHRcdGNvbnN0IG1lc3NhZ2VzID0gdG90YWxNZXNzYWdlcy5zbGljZSgtdGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhLm51bU9mTWVzc2FnZXMpO1xuXG5cdFx0Y29uc3QgbmVlZHNSZXJlbmRlciA9IG1lc3NhZ2VzLnNvbWUobSA9PiBtLmN1cnJlbnRSZW5kZXJlZEhlaWdodCA9PT0gdW5kZWZpbmVkKTtcblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gbmVlZHNSZXJlbmRlclxuXHRcdFx0PyB0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEubWF4SGVpZ2h0XG5cdFx0XHQ6IG1lc3NhZ2VzLnJlZHVjZSgoYWNjLCBtZXNzYWdlKSA9PiBhY2MgKyBtZXNzYWdlLmN1cnJlbnRSZW5kZXJlZEhlaWdodCEsIDApO1xuXG5cdFx0dGhpcy5sYXlvdXQoXG5cdFx0XHRNYXRoLm1pbihcblx0XHRcdFx0Ly8gd2UgYWRkIGFuIGFkZGl0aW9uYWwgMThweCBpbiBvcmRlciB0byBzaG93IHRoYXQgdGhlcmUgaXMgc2Nyb2xsYWJsZSBjb250ZW50XG5cdFx0XHRcdGlucHV0SGVpZ2h0ICsgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0ICsgbGlzdEhlaWdodCArICh0b3RhbE1lc3NhZ2VzLmxlbmd0aCA+IDIgPyAxOCA6IDApLFxuXHRcdFx0XHR0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEubWF4SGVpZ2h0XG5cdFx0XHQpLFxuXHRcdFx0d2lkdGhcblx0XHQpO1xuXG5cdFx0aWYgKG5lZWRzUmVyZW5kZXIgfHwgIWxpc3RIZWlnaHQpIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0VuZCgpO1xuXHRcdH1cblx0fVxuXG5cdHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0Z2V0SW5wdXRTdGF0ZSgpOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZ2V0Q3VycmVudElucHV0U3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hhdElucHV0Q29udGV4dCgpIHtcblx0XHRjb25zdCBjdXJyZW50QWdlbnQgPSB0aGlzLnBhcnNlZElucHV0LnBhcnRzLmZpbmQocGFydCA9PiBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdHRoaXMuYWdlbnRJbklucHV0LnNldCghIWN1cnJlbnRBZ2VudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zd2l0Y2hUb0FnZW50QnlOYW1lKGFnZW50TmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY3VycmVudEFnZW50ID0gdGhpcy5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblxuXHRcdC8vIGFscmVhZHkgb24gdGhlIHRhcmdldCBhZ2VudFxuXHRcdGlmIChhZ2VudE5hbWUgPT09IGN1cnJlbnRBZ2VudC5uYW1lLmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBtb2RlIG9iamVjdCB0byBnZXQgaXRzIGtpbmRcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuaW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKS5maW5kTW9kZUJ5TmFtZShhZ2VudE5hbWUpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEFnZW50LmtpbmQgIT09IGFnZW50LmtpbmQpIHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlQ2hlY2sgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGhhbmRsZU1vZGVTd2l0Y2gsIGN1cnJlbnRBZ2VudC5raW5kLCBhZ2VudC5raW5kLCB0aGlzLnZpZXdNb2RlbD8ubW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPz8gMCwgdGhpcy52aWV3TW9kZWw/Lm1vZGVsKTtcblx0XHRcdGlmICghY2hhdE1vZGVDaGVjaykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaGF0TW9kZUNoZWNrLm5lZWRUb0NsZWFyU2Vzc2lvbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXQuc2V0Q2hhdE1vZGUoYWdlbnQuaWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIGBmYWxzZWAgd2hlbiB0aGUgYWdlbnQgc3dpdGNoIHdhcyBjYW5jZWxsZWQgKGUuZy4gdXNlciBkaXNtaXNzZWQgdGhlXG5cdCAqIG1vZGUtc3dpdGNoIGNvbmZpcm1hdGlvbiBkaWFsb2cpLCBzaWduYWxsaW5nIHRoYXQgdGhlIGNhbGxlciBzaG91bGQgYWJvcnQgdGhlXG5cdCAqIGN1cnJlbnQgaW5wdXQgc3VibWlzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5UHJvbXB0TWV0YWRhdGEoeyBhZ2VudCwgdG9vbHMsIG1vZGVsIH06IFByb21wdEhlYWRlciwgcmVxdWVzdElucHV0OiBJQ2hhdFJlcXVlc3RJbnB1dE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdGlmICh0b29scyAhPT0gdW5kZWZpbmVkICYmICFhZ2VudCAmJiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCAhPT0gQ2hhdE1vZGVLaW5kLkFnZW50KSB7XG5cdFx0XHRhZ2VudCA9IENoYXRNb2RlLkFnZW50Lm5hbWUuZ2V0KCk7XG5cdFx0fVxuXHRcdC8vIHN3aXRjaCB0byBhcHByb3ByaWF0ZSBhZ2VudCBpZiBuZWVkZWRcblx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdGNvbnN0IHN3aXRjaGVkID0gYXdhaXQgdGhpcy5fc3dpdGNoVG9BZ2VudEJ5TmFtZShhZ2VudCk7XG5cdFx0XHRpZiAoIXN3aXRjaGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBpZiBub3QgdG9vbHMgdG8gZW5hYmxlIGFyZSBwcmVzZW50LCB3ZSBhcmUgZG9uZVxuXHRcdGlmICh0b29scyAhPT0gdW5kZWZpbmVkICYmIHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQpIHtcblx0XHRcdGNvbnN0IGVuYWJsZW1lbnRNYXAgPSB0aGlzLnRvb2xzU2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCh0b29scywgdGhpcy5pbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhKTtcblx0XHRcdHRoaXMuaW5wdXQuc2VsZWN0ZWRUb29sc01vZGVsLnNldChlbmFibGVtZW50TWFwLCB0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXQucmVxdWVzdE1vZGVsQnlRdWFsaWZpZWROYW1lKG1vZGVsKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3RXaWRnZXQuZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxheW91dENoYXRXaWRnZXRGb3JJbnB1dEhlaWdodCh3aWRnZXQ6IFBpY2s8Q2hhdFdpZGdldCwgJ3NldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlJyB8ICdsYXlvdXRGb3JJbnB1dEhlaWdodCc+LCBpbnB1dE1heEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkLCBoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHR3aWRnZXQuc2V0SW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGUoaW5wdXRNYXhIZWlnaHQpO1xuXHR3aWRnZXQubGF5b3V0Rm9ySW5wdXRIZWlnaHQoaGVpZ2h0LCB3aWR0aCk7XG59XG5cbmNvbnN0IE1JTl9MSVNUX0hFSUdIVCA9IDUwO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsbUJBQW1CLGVBQWU7QUFDM0MsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVk7QUFDckIsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLHlCQUF5QjtBQUMvRixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyxTQUFTLHFCQUFxQix1QkFBdUI7QUFDdkUsU0FBUyxRQUFRLGVBQWU7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsY0FBYyxnQkFBZ0IsZ0JBQWdCO0FBRXZELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FB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QWEsS0FBSyxNQUFNLG9CQUFvQixhQUFhLE9BQU87QUFDN0UsWUFBTSxnQkFBZ0IsS0FBSyxhQUFhLDhCQUE4QixPQUFPLEtBQUssTUFBTSxzQkFBc0IsSUFBSSxHQUFHLFFBQVE7QUFDN0gsV0FBSyxNQUFNLG1CQUFtQixJQUFJLGVBQWUsSUFBSTtBQUFBLElBQ3REO0FBRUEsUUFBSSxVQUFVLFFBQVc7QUFDeEIsYUFBTyxLQUFLLE1BQU0sNEJBQTRCLEtBQUs7QUFBQSxJQUNwRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxrQ0FBa0MsY0FBc0M7QUFDdkUsU0FBSyxXQUFXLGtDQUFrQyxZQUFZO0FBQUEsRUFDL0Q7QUFDRDtBQUFBO0FBejFHYSxXQUdJLFdBQTBFLENBQUM7QUFIL0UsYUFBTjtBQUFBLEVBbU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5RVTtBQTIxR04sU0FBUywrQkFBK0IsUUFBb0YsZ0JBQW9DLFFBQWdCLE9BQXFCO0FBQzNNLFNBQU8sOEJBQThCLGNBQWM7QUFDbkQsU0FBTyxxQkFBcUIsUUFBUSxLQUFLO0FBQzFDO0FBRUEsTUFBTSxrQkFBa0I7IiwKICAibmFtZXMiOiBbIml0ZW0iLCAiYXR0YWNobWVudCIsICJ0aW1lb3V0IiwgImlucHV0VmFsdWUiLCAiYXR0YWNoZWRDb250ZXh0Il0KfQo=
