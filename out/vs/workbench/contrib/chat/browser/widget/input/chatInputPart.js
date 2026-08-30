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
import { addDisposableListener } from "../../../../../../base/browser/dom.js";
import { DEFAULT_FONT_FAMILY } from "../../../../../../base/browser/fonts.js";
import { hasModifierKeys } from "../../../../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import * as aria from "../../../../../../base/browser/ui/aria/aria.js";
import { ButtonWithIcon } from "../../../../../../base/browser/ui/button/button.js";
import { createInstantHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { equals as arraysEqual } from "../../../../../../base/common/arrays.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../../../base/common/async.js";
import { isDefined } from "../../../../../../base/common/types.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { mixin } from "../../../../../../base/common/objects.js";
import { autorun, constObservable, derived, derivedOpts, observableFromEvent, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { isMacintosh } from "../../../../../../base/common/platform.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOptions } from "../../../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../../editor/common/config/fontInfo.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { CopyPasteController } from "../../../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController } from "../../../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { ContentHoverController } from "../../../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { LinkDetector } from "../../../../../../editor/contrib/links/browser/links.js";
import { SuggestController } from "../../../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { MenuWorkbenchButtonBar } from "../../../../../../platform/actions/browser/buttonbar.js";
import { MenuEntryActionViewItem } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { canLog, ILogService, LogLevel } from "../../../../../../platform/log/common/log.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { bindContextKey } from "../../../../../../platform/observable/common/platformObservableUtils.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { IVoiceModeOnboardingService } from "../../../../agentsVoice/browser/voiceModeOnboarding.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ISharedWebContentExtractorService } from "../../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { ISCMService } from "../../../../scm/common/scm.js";
import { IWorkbenchLayoutService, Position } from "../../../../../services/layout/browser/layoutService.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../common/views.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../../../accessibility/common/accessibilityCommands.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from "../../../../codeEditor/browser/simpleEditorOptions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatRequestVariableSet, getImageAttachmentLimit, isPastedTextArtifact, isAgentHostCompletionVariableEntry, isBrowserViewVariableEntry, isElementVariableEntry, isExplicitFileOrImageVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry, OmittedState } from "../../../common/attachments/chatVariableEntries.js";
import { ChatMode, getModeNameForTelemetry, IChatModeService } from "../../../common/chatModes.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService, isAgentHostTarget, isIChatSessionFileChange2, localChatSessionType, SessionType } from "../../../common/chatSessionsService.js";
import { getStoredSelectedModel, storeSelectedModel } from "../../../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from "../../../common/constants.js";
import { isAutoApprovePolicyRestricted, isAutoApproveValuePolicyRestricted } from "../../../common/agentHostConfigPolicy.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatInputModelSelectionController } from "./chatInputModelSelectionController.js";
import { ChatModelConfigurationStore } from "./chatModelConfigurationStore.js";
import { ChatModelSelectionDiagnostics } from "./chatModelSelectionDiagnostics.js";
import { deserializeUntitledInputAttachments, deserializeUntitledInputState, serializeUntitledInputAttachments, serializeUntitledInputState } from "./chatInputStatePersistence.js";
import { ChatInputStateOrigin, IntendedModelSlot, logChangesToStateModel } from "../../../common/model/chatModel.js";
import { filterModelsForSession, hasModelsTargetingSession, isChatInputContentSendable, isModelHiddenInPicker, isNewConversation, mergeModelsWithCache, shouldResetOnModelListChange } from "./chatInputModelUtils.js";
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ILanguageModelToolsService } from "../../../common/tools/languageModelToolsService.js";
import { ChatHistoryNavigator } from "../../../common/widget/chatWidgetHistoryService.js";
import { ChatEditingSessionSubmitAction, ChatSessionPrimaryPickerAction, ChatSubmitAction, OpenDelegationPickerAction, OpenModelPickerAction, OpenModePickerAction, OpenPermissionPickerAction, OpenSessionTargetPickerAction, OpenWorkspacePickerAction } from "../../actions/chatExecuteActions.js";
import { ChatVoiceInputModeAction, VoiceInputModeActionViewItem } from "../../voiceInputMode/voiceInputModeActionViewItem.js";
import { ChatSpeechToTextConnectingAction, ChatSpeechToTextPreparingAction, ToggleChatSpeechToTextAction } from "../../actions/chatSpeechToTextActions.js";
import { DictationActionViewItem } from "../../speechToText/dictationActionViewItem.js";
import { DictationDownloadActionViewItem } from "../../speechToText/dictationDownloadActionViewItem.js";
import { IDictationOnboardingService } from "../../speechToText/dictationOnboarding.js";
import { notifyDictationSubmitted } from "../../speechToText/dictationSession.js";
import { VoiceModeActionViewItem } from "../../voiceClient/voiceModeActionViewItem.js";
import { IVoiceSessionController } from "../../voiceClient/voiceSessionController.js";
import { AgentSessionProviders, getAgentSessionProvider } from "../../agentSessions/agentSessions.js";
import { getAgentSessionPullRequestContextValue } from "../../agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../../agentSessions/agentSessionsService.js";
import { ChatAttachmentModel } from "../../attachments/chatAttachmentModel.js";
import { IChatAttachmentWidgetRegistry } from "../../attachments/chatAttachmentWidgetRegistry.js";
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, BrowserViewAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from "../../attachments/chatAttachmentWidgets.js";
import { ChatImplicitContexts } from "../../attachments/chatImplicitContext.js";
import { ImplicitContextAttachmentWidget } from "../../attachments/implicitContextAttachment.js";
import { IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from "../../chat.js";
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from "../../chatEditing/chatEditingActions.js";
import { resizeImage } from "../../chatImageUtils.js";
import { ChatSessionPickerActionItem } from "../../chatSessions/chatSessionPickerActionItem.js";
import { AgentHostChatInputPicker, AgentHostChatInputPickerActionViewItem } from "../../agentSessions/agentHost/agentHostChatInputPicker.js";
import { getAgentHostPickerProperty, OpenAgentHostAutoApprovePickerAction, OpenAgentHostCodexApprovalsPickerAction, OpenAgentHostModePickerAction, OpenAgentHostPermissionModePickerAction, OpenAgentHostFolderPickerAction } from "../../agentSessions/agentHost/agentHostChatInputPicker.contribution.js";
import { AgentHostGenericConfigChips } from "../../agentSessions/agentHost/agentHostGenericConfigChips.js";
import { AgentHostFolderPickerActionItem } from "../../agentSessions/agentHost/agentHostFolderPickerActionItem.js";
import { IChatPhoneInputPresenter, MobileChatInputCombinedPickerActionItem } from "./chatPhoneInputPresenter.js";
import { IChatContextService } from "../../contextContrib/chatContextService.js";
import { ChatPlanReviewPart } from "../chatContentParts/chatPlanReviewPart.js";
import { ChatQuestionCarouselPart } from "../chatContentParts/chatQuestionCarouselPart.js";
import { ChatToolConfirmationCarouselPart } from "../chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js";
import { CollapsibleListPool } from "../chatContentParts/chatReferencesContentPart.js";
import { ChatTodoListWidget } from "../chatContentParts/chatTodoListWidget.js";
import { ChatArtifactsWidget } from "../chatArtifactsWidget.js";
import { handleTerminalCommandPaste, isTerminalCommandInput, isTerminalCommandPaste as isTerminalCommandPasteContent } from "../../chatTerminalCommandPaste.js";
import { ChatDynamicVariableModel } from "../../attachments/chatDynamicVariables.js";
import { ChatDragAndDrop } from "../chatDragAndDrop.js";
import { ChatFollowups } from "./chatFollowups.js";
import { IChatInputNotificationService } from "./chatInputNotificationService.js";
import { ChatGoalBannerWidget } from "./chatGoalBannerWidget.js";
import { ChatInputNotificationWidget } from "./chatInputNotificationWidget.js";
import { ChatInputNoticeHost, ChatInputNoticeLane } from "./chatInputNoticeHost.js";
import { registerChatInputOnboardingHosts } from "./chatInputOnboardingHosts.js";
import { IChatInputNoticeHubService } from "./chatInputNoticeHub.js";
import { chatInputStackClass, chatInputStackSlotClass, ChatInputStackSlot, setChatInputStackInputFocused, setChatInputStackSlot } from "./chatInputStack.js";
import { ChatSelectedTools } from "./chatSelectedTools.js";
import { DelegationSessionPickerActionItem } from "./delegationSessionPickerActionItem.js";
import { ModelPickerActionItem } from "./modelPicker/modelPickerActionItem.js";
import { isModeConsideredBuiltIn, ModePickerActionItem } from "./modePickerActionItem.js";
import { PermissionPickerActionItem } from "./permissionPickerActionItem.js";
import { SessionTypePickerActionItem } from "./sessionTargetPickerActionItem.js";
import { WorkspacePickerActionItem } from "./workspacePickerActionItem.js";
import { ChatContextUsageWidget } from "../../widgetHosts/viewPane/chatContextUsageWidget.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { ConfigureToolsAction } from "../../actions/chatToolActions.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { PlaceholderTextContribution } from "../../../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
const $ = dom.$;
const INPUT_EDITOR_MAX_HEIGHT = 250;
const INPUT_EDITOR_LINE_HEIGHT = 20;
const INPUT_EDITOR_PADDING = { compact: { top: 2, bottom: 2 }, default: { top: 12, bottom: 12 } };
const CachedLanguageModelsKey = "chat.cachedLanguageModels.v2";
const CHAT_INPUT_PICKER_COLLAPSE_WIDTH = 280;
const PERMISSION_LEVEL_OPTION_ID = "permissionLevel";
var ChatWidgetLocation = /* @__PURE__ */ ((ChatWidgetLocation2) => {
  ChatWidgetLocation2["SidebarLeft"] = "sidebarLeft";
  ChatWidgetLocation2["SidebarRight"] = "sidebarRight";
  ChatWidgetLocation2["Panel"] = "panel";
  ChatWidgetLocation2["Editor"] = "editor";
  return ChatWidgetLocation2;
})(ChatWidgetLocation || {});
const LEGACY_SHARED_INPUT_STATE_TAGS = /* @__PURE__ */ new Set(["view", "editor", "quick"]);
function getInputStateStorageKey(widgetViewKindTag) {
  if (LEGACY_SHARED_INPUT_STATE_TAGS.has(widgetViewKindTag)) {
    return "chat.untitledInputState";
  }
  return `chat.untitledInputState.${widgetViewKindTag}`;
}
function createEmptyInputStateMemento(widgetViewKindTag) {
  return observableMemento({
    defaultValue: void 0,
    key: getInputStateStorageKey(widgetViewKindTag),
    toStorage: serializeUntitledInputState,
    fromStorage(value) {
      const obj = deserializeUntitledInputState(value);
      if (obj.selectedModel && !obj.selectedModel.metadata.isDefaultForLocation) {
        const oldIsDefault = obj.selectedModel.metadata.isDefault;
        const isDefaultForLocation = { [ChatAgentLocation.Chat]: Boolean(oldIsDefault) };
        mixin(obj.selectedModel.metadata, { isDefaultForLocation });
        delete obj.selectedModel.metadata.isDefault;
      }
      return obj;
    }
  });
}
const emptyInputAttachments = observableMemento({
  defaultValue: [],
  key: "chat.untitledInputAttachments",
  toStorage: serializeUntitledInputAttachments,
  fromStorage: deserializeUntitledInputAttachments
});
let ChatInputPart = class extends Disposable {
  constructor(location, options, styles, inline, modelService, instantiationService, contextKeyService, configurationService, keybindingService, accessibilityService, languageModelsService, logService, fileService, editorService, themeService, textModelResolverService, storageService, dialogService, agentService, sharedWebExtracterService, entitlementService, chatModeService, toolService, chatSessionsService, chatContextService, agentSessionsService, dictationOnboardingService, chatInputNoticeHubService, workspaceContextService, scmService, layoutService, viewDescriptorService, _chatAttachmentWidgetRegistry, chatInputNotificationService, chatPhoneInputPresenter, productService, voiceModeOnboardingService, chatWidgetService, voiceSessionController, chatService, environmentService) {
    super();
    this.location = location;
    this.options = options;
    this.inline = inline;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.languageModelsService = languageModelsService;
    this.logService = logService;
    this.fileService = fileService;
    this.editorService = editorService;
    this.themeService = themeService;
    this.textModelResolverService = textModelResolverService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.agentService = agentService;
    this.sharedWebExtracterService = sharedWebExtracterService;
    this.entitlementService = entitlementService;
    this.chatModeService = chatModeService;
    this.toolService = toolService;
    this.chatSessionsService = chatSessionsService;
    this.chatContextService = chatContextService;
    this.agentSessionsService = agentSessionsService;
    this.dictationOnboardingService = dictationOnboardingService;
    this.chatInputNoticeHubService = chatInputNoticeHubService;
    this.workspaceContextService = workspaceContextService;
    this.scmService = scmService;
    this.layoutService = layoutService;
    this.viewDescriptorService = viewDescriptorService;
    this._chatAttachmentWidgetRegistry = _chatAttachmentWidgetRegistry;
    this.chatInputNotificationService = chatInputNotificationService;
    this.chatPhoneInputPresenter = chatPhoneInputPresenter;
    this.productService = productService;
    this.voiceModeOnboardingService = voiceModeOnboardingService;
    this.chatWidgetService = chatWidgetService;
    this.voiceSessionController = voiceSessionController;
    this.chatService = chatService;
    this.environmentService = environmentService;
    this._workingSetCollapsed = observableValue("chatInputPart.workingSetCollapsed", true);
    this._stableInputPartWidth = observableValue("chatInputPart.stableInputPartWidth", 0);
    this._chatInputTodoListWidget = this._register(new MutableDisposable());
    this._chatArtifactsWidget = this._register(new MutableDisposable());
    this._chatQuestionCarouselWidgets = this._register(new DisposableMap());
    this._questionCarouselResponseIds = /* @__PURE__ */ new Map();
    this._questionCarouselSessionResources = /* @__PURE__ */ new Map();
    this._chatPlanReviewWidgets = this._register(new DisposableMap());
    this._planReviewResponseIds = /* @__PURE__ */ new Map();
    this._planReviewSessionResources = /* @__PURE__ */ new Map();
    this._chatToolConfirmationCarousels = this._register(new DisposableMap());
    this._onDidChangeActiveConfirmationSubagent = this._register(new Emitter());
    this.onDidChangeActiveConfirmationSubagent = this._onDidChangeActiveConfirmationSubagent.event;
    this._chatEditingTodosDisposables = this._register(new DisposableStore());
    this._onDidLoadInputState = this._register(new Emitter());
    this.onDidLoadInputState = this._onDidLoadInputState.event;
    this._toolbarRelayoutScheduler = this._register(new RunOnceScheduler(() => {
      if (typeof this.cachedWidth === "number") {
        this.layout(this.cachedWidth);
      }
    }, 0));
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidChangeContext = this._register(new Emitter());
    this.onDidChangeContext = this._onDidChangeContext.event;
    this._onDidAcceptFollowup = this._register(new Emitter());
    this.onDidAcceptFollowup = this._onDidAcceptFollowup.event;
    this._onDidClickOverlay = this._register(new Emitter());
    this.onDidClickOverlay = this._onDidClickOverlay.event;
    this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
    this._indexOfLastOpenedContext = -1;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.inputEditorHeight = 0;
    this.followupsDisposables = this._register(new DisposableStore());
    this.overlayClickListener = this._register(new MutableDisposable());
    this.attachedContextDisposables = this._register(new MutableDisposable());
    this._notificationWidget = this._register(new MutableDisposable());
    this._goalBannerWidget = this._register(new MutableDisposable());
    this._onDidDismissGoalBanner = this._register(new Emitter());
    /** Fired when the user dismisses the autopilot goal banner. */
    this.onDidDismissGoalBanner = this._onDidDismissGoalBanner.event;
    this._contextUsageDisposables = this._register(new MutableDisposable());
    /** Arbitrates which notice occupies the area above this input. */
    this.noticeHost = this._register(new ChatInputNoticeHost(() => this.focus()));
    this.height = observableValue(this, 0);
    this._forceVisibleScrollbarUntilAccept = false;
    /**
     * Speaks for the intended model while no conversation is bound — the inline request-edit input
     * part never binds one. Keeping it off the conversation is what makes that editor
     * self-contained: picking a model there to resubmit one request leaves the chat's own model
     * alone.
     */
    this._unboundIntent = new IntendedModelSlot();
    // Disposables for model observation
    this._modelSyncDisposables = this._register(new DisposableStore());
    this._currentChatModes = this._register(new MutableDisposable());
    // Flag to prevent circular updates between view and model
    this._isSyncingToOrFromInputModel = false;
    this.permissionWidgetDisposeListener = this._register(new MutableDisposable());
    this.chatSessionPickerWidgets = this._register(new DisposableMap());
    this._chatSessionOptionEmitters = this._register(new DisposableMap());
    /**
     * Map of option group ID to its context key.
     * Keys follow the pattern `chatSessionOption.<groupId>` and hold the currently selected option item ID.
     */
    this._optionContextKeys = /* @__PURE__ */ new Map();
    this._onDidChangeCurrentChatMode = this._register(new Emitter());
    this.onDidChangeCurrentChatMode = this._onDidChangeCurrentChatMode.event;
    this.inputUri = URI.parse(`${Schemas.vscodeChatInput}:input-${ChatInputPart._counter++}`);
    this._workingSetLinesAddedSpan = new Lazy(() => dom.$(".working-set-lines-added"));
    this._workingSetLinesRemovedSpan = new Lazy(() => dom.$(".working-set-lines-removed"));
    this._chatEditsActionsDisposables = this._register(new DisposableStore());
    this._chatEditsDisposables = this._register(new DisposableStore());
    this._renderingChatEdits = this._register(new MutableDisposable());
    this._attemptedWorkingSetEntriesCount = 0;
    this._chatSessionIsEmpty = false;
    this._pendingDelegationTargetObservable = observableValue(this, void 0);
    this._currentSessionTypeObservable = observableValue(this, void 0);
    this._currentSessionResourceObservable = observableValue(this, void 0);
    this._deferredNotificationsEnabled = observableValue(this, true);
    this._notificationModelTargetChatSessionType = derived(
      this,
      (reader) => this._pendingDelegationTargetObservable.read(reader) ?? this._currentSessionTypeObservable.read(reader) ?? this.getCurrentSessionType()
    );
    this._modelSelectionDiagnostics = new ChatModelSelectionDiagnostics(this.logService, this.storageService, () => ({
      surface: "workbench",
      location: this.location,
      modelTarget: this.getSelectedModelTarget(),
      sessionKey: this.getCurrentSessionType(),
      conversationKey: this._inputModelSessionResource?.toString(),
      metadata: { widgetViewKind: this.options.widgetViewKindTag }
    }));
    this._modelSelectionRuntime = {
      location: this.location,
      getCurrentModeKind: () => this.currentModeKind,
      getCurrentSessionType: () => this._currentSessionType ?? this.getCurrentSessionType(),
      isEmpty: () => !this._inputModel || this._chatSessionIsEmpty,
      getModels: (sessionType) => this.getModelsForSessionType(sessionType),
      getAllModels: () => this.getAllMergedModels(),
      requiresCustomModels: (sessionType) => this.chatSessionsService.requiresCustomModelsForSessionType(sessionType),
      getConfiguredModelValue: () => this.getConfiguredModelValue(),
      subscribeToModelChanges: (listener) => this.languageModelsService.onDidChangeLanguageModels(listener),
      getBoundConversationKey: () => this._inputModelSessionResource?.toString(),
      getIntentHolder: () => this._intentHolder,
      restoreModelConfiguration: (modelId, configuration) => this.restoreModelConfiguration(modelId, configuration),
      applyModel: () => {
        if (this.cachedWidth) {
          this.layout(this.cachedWidth);
        }
        this._syncInputStateToModel();
      }
    };
    this._modelSelectionController = this._register(new ChatInputModelSelectionController(this._modelSelectionRuntime, this._modelSelectionDiagnostics));
    this._currentLanguageModel = this._modelSelectionController.currentModel;
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((event) => {
      this._modelSelectionDiagnostics.logStorageChange(event, this._currentLanguageModel.get()?.identifier);
    }));
    this._modelConfigStore = this._register(new ChatModelConfigurationStore(
      () => this.getModelConfigurationStorageKey(),
      this.languageModelsService,
      this.storageService
    ));
    this._syncTextDebounced = this._register(new RunOnceScheduler(() => {
      logChangesToStateModel(this._inputModel, `[DEBOUNCE] _syncTextDebounced fired -> _syncInputStateToModel in ${this._currentSessionKey}`, void 0, this._inputModel?.state.get(), this.logService);
      this._syncInputStateToModel();
    }, 150));
    this._emptyInputState = this._register(createEmptyInputStateMemento(this.options.widgetViewKindTag)(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));
    this._emptyInputAttachments = this._register(emptyInputAttachments(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));
    this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
    this._currentModeObservable = observableValue("currentMode", this.options.defaultMode ?? ChatMode.Agent);
    const localModes = this.chatModeService.createModes(LocalChatSessionUri.getNewSessionUri());
    this._currentChatModes.value = localModes;
    this._currentChatModesObservable = observableValue("currentChatModes", localModes);
    this._currentPermissionLevel = observableValue("permissionLevel", this.getDefaultPermissionLevel());
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this._indexOfLastOpenedContext = -1;
      this.refreshChatSessionPickers();
    }));
    this._register(this.chatSessionsService.onDidChangeSessionOptions((e) => {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (sessionResource && isEqual(sessionResource, e.sessionResource)) {
        this.refreshChatSessionPickers();
      }
    }));
    this._register(this.chatSessionsService.onDidChangeOptionGroups((chatSessionType) => {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (sessionResource) {
        const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
        if (getChatSessionType(sessionResource) === chatSessionType || delegateSessionType === chatSessionType) {
          this.refreshChatSessionPickers();
        }
      }
    }));
    if (this.options.sessionTypePickerDelegate?.onDidChangeActiveSessionProvider) {
      this._register(this.options.sessionTypePickerDelegate.onDidChangeActiveSessionProvider(async (newSessionType) => {
        this._currentSessionType = newSessionType;
        this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());
        this.agentSessionTypeKey.set(newSessionType);
        this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(newSessionType));
        this.updateWidgetLockStateFromSessionType(newSessionType);
        this.checkModeInSessionPool(newSessionType);
        this._modelSelectionController.revalidateForSessionType(() => this.initSelectedModel());
        this.refreshChatSessionPickers();
      }));
    }
    this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
    const attachmentModel = this._attachmentModel;
    this._register(this._attachmentModel.onDidChange(() => {
      if (this._chatSessionIsEmpty) {
        this._emptyInputAttachments.set(this._attachmentModel.attachments, void 0);
      }
      this._syncInputStateToModel();
    }));
    this._register(this._modelConfigStore.onDidChange(() => this._syncInputStateToModel()));
    this.selectedToolsModel = this._register(this.instantiationService.createInstance(ChatSelectedTools, this.currentModeObs, this._currentLanguageModel));
    this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => this._widget, {
      get attachments() {
        return attachmentModel.attachments;
      },
      addAttachments: (entries) => attachmentModel.addContext(...entries)
    }, styles));
    this.inputEditorMaxHeight = this.options.inputEditorMaxHeight ?? (this.options.renderStyle === "compact" ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT);
    const padding = this.options.renderStyle === "compact" ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
    this.singleLineInputEditorHeight = INPUT_EDITOR_LINE_HEIGHT + padding.top + padding.bottom;
    this.inputEditorMinHeight = this.options.inputEditorMinLines ? this.options.inputEditorMinLines * INPUT_EDITOR_LINE_HEIGHT + padding.top + padding.bottom : void 0;
    this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
    this.inputEditorHasSendableContent = ChatContextKeys.inputHasSendableContent.bindTo(contextKeyService);
    this.inputSubmitPending = ChatContextKeys.inputSubmitPending.bindTo(contextKeyService);
    this.inputRouting = ChatContextKeys.inputRouting.bindTo(contextKeyService);
    this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
    this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
    this._hasQuestionCarouselContextKey = ChatContextKeys.Editing.hasQuestionCarousel.bindTo(contextKeyService);
    this.chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
    this.chatModeNameKey = ChatContextKeys.chatModeName.bindTo(contextKeyService);
    this.chatModelIdKey = ChatContextKeys.chatModelId.bindTo(contextKeyService);
    this.permissionLevelKey = ChatContextKeys.chatPermissionLevel.bindTo(contextKeyService);
    this.permissionLevelKey.set(this._currentPermissionLevel.get());
    this.withinEditSessionKey = ChatContextKeys.withinEditSessionDiff.bindTo(contextKeyService);
    this.filePartOfEditSessionKey = ChatContextKeys.filePartOfEditSession.bindTo(contextKeyService);
    this.chatSessionHasOptions = ChatContextKeys.chatSessionHasModels.bindTo(contextKeyService);
    this.chatSessionOptionsValid = ChatContextKeys.chatSessionOptionsValid.bindTo(contextKeyService);
    this.agentSessionTypeKey = ChatContextKeys.agentSessionType.bindTo(contextKeyService);
    this.chatSessionSupportsDelegationKey = ChatContextKeys.chatSessionSupportsDelegation.bindTo(contextKeyService);
    this.chatHasPendingDelegationTargetKey = ChatContextKeys.hasPendingDelegationTarget.bindTo(contextKeyService);
    if (this.options.sessionTypePickerDelegate?.getActiveSessionProvider) {
      const initialSessionType = this.options.sessionTypePickerDelegate.getActiveSessionProvider();
      if (initialSessionType) {
        this.agentSessionTypeKey.set(initialSessionType);
        this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(initialSessionType));
      }
    }
    this.chatSessionHasCustomAgentTarget = ChatContextKeys.chatSessionHasCustomAgentTarget.bindTo(contextKeyService);
    this.chatSessionHasTargetedModels = ChatContextKeys.chatSessionHasTargetedModels.bindTo(contextKeyService);
    this.history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, this.location));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const newOptions = {};
      if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
        this.setPermissionLevel(this._currentPermissionLevel.get());
      }
      if (e.affectsConfiguration(ChatConfiguration.DefaultPermissionLevel)) {
        if (this._chatSessionIsEmpty) {
          this.setPermissionLevel(this.getDefaultPermissionLevel());
        }
      }
      if (e.affectsConfiguration(ChatConfiguration.DefaultModel)) {
        this._modelSelectionController.applyConfiguredDefault();
      }
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
        newOptions.ariaLabel = this._getAriaLabel();
      }
      if (e.affectsConfiguration("editor.wordSegmenterLocales")) {
        newOptions.wordSegmenterLocales = this.configurationService.getValue("editor.wordSegmenterLocales");
      }
      if (e.affectsConfiguration("editor.autoClosingBrackets")) {
        newOptions.autoClosingBrackets = this.configurationService.getValue("editor.autoClosingBrackets");
      }
      if (e.affectsConfiguration("editor.autoClosingQuotes")) {
        newOptions.autoClosingQuotes = this.configurationService.getValue("editor.autoClosingQuotes");
      }
      if (e.affectsConfiguration("editor.autoSurround")) {
        newOptions.autoSurround = this.configurationService.getValue("editor.autoSurround");
      }
      this.inputEditor.updateOptions(newOptions);
    }));
    this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, MenuId.ChatEditingWidgetModifiedFilesToolbar, { verticalScrollMode: ScrollbarVisibility.Visible }));
    this._hasFileAttachmentContextKey = ChatContextKeys.hasFileAttachments.bindTo(contextKeyService);
    this.initSelectedModel();
    this._register(this._onDidChangeCurrentChatMode.event(() => {
      this._modelSelectionController.ensureCurrentModelSupported();
    }));
    const updateAfterModelListChange = (reconcileSelection) => {
      const modelIdentifier = this._currentLanguageModel.get()?.identifier;
      const models = this.getModels();
      if (canLog(this.logService.getLevel(), LogLevel.Debug)) {
        const mergedModels = this.getAllMergedModels();
        const filteredModels = filterModelsForSession(models, this.getCurrentSessionType(), this.currentModeKind, this.location);
        const messageparts = [
          `resetting current language model due to model list change from ${modelIdentifier}`,
          `this._widget?.viewModel?.model.sessionResource = ${this._widget?.viewModel?.model.sessionResource?.toString()}`,
          `this.currentModeKind = ${this.currentModeKind}`,
          `this.getCurrentSessionType = ${this.getCurrentSessionType()}`,
          `this._currentSessionType = ${this._currentSessionType}`,
          `shouldResetOnModelListChange(modelIdentifier, models) = ${shouldResetOnModelListChange(modelIdentifier, models)}`,
          `vendors: ${this.languageModelsService.getVendors().map((v) => v.vendor).join(", ")}`,
          `hiddenModelIds: ${this.languageModelsService.getHiddenModelIds().join(", ")}`,
          `model identifiers: ${models.map((m) => m.identifier).join(", ")}`,
          `model target Session Types: ${models.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `model metadataid: ${models.map((m) => m.metadata.id).join(", ")}`,
          `merged.model identifiers: ${mergedModels.map((m) => m.identifier).join(", ")}`,
          `merged.model target Session Types: ${mergedModels.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `merged.model metadataid: ${mergedModels.map((m) => m.metadata.id).join(", ")}`,
          `filtered.model identifiers: ${filteredModels.map((m) => m.identifier).join(", ")}`,
          `filtered.model target Session Types: ${filteredModels.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `filtered.model metadataid: ${filteredModels.map((m) => m.metadata.id).join(", ")}`
        ];
        if (this.getCurrentSessionType() !== SessionType.CopilotCLI) {
          const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
          if (delegateSessionType) {
            messageparts.push(`delegateSessionType = ${delegateSessionType}`);
          }
          const sessionResource = this._widget?.viewModel?.model.sessionResource;
          messageparts.push(`current session resource = ${sessionResource}`);
        }
        logChangesToStateModel(this._inputModel, messageparts.join(", "), void 0, void 0, this.logService);
      }
      if (reconcileSelection) {
        this._modelSelectionController.reconcileModelListChange(models);
      }
      this._updateInputContentContextKeys();
    };
    this._register(this.languageModelsService.onDidChangeLanguageModels(() => updateAfterModelListChange(false)));
    this._register(this.languageModelsService.onDidChangeModelVisibility(() => updateAfterModelListChange(true)));
    this._register(this.onDidChangeCurrentChatMode(() => {
      this.accessibilityService.alert(this._currentModeObservable.get().label.get());
      if (this._inputEditor) {
        this._inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
      }
      this.setImplicitContextEnablement();
    }));
    this._register(autorun((reader) => {
      const lm = this._currentLanguageModel.read(reader);
      this.chatModelIdKey.set(lm?.metadata.id.toLowerCase() ?? "");
      this.contextUsageWidget?.setSelectedModel(lm?.identifier);
      if (lm?.metadata.name) {
        this.accessibilityService.alert(lm.metadata.name);
      }
      this._inputEditor?.updateOptions({ ariaLabel: this._getAriaLabel() });
    }));
    this._register(autorun((reader) => {
      const modes = this._currentChatModesObservable.read(reader);
      reader.store.add(modes.onDidChange(() => {
        this.validateCurrentChatMode();
        this._restorePersistedCustomModeIfAvailable();
      }));
    }));
    this._register(autorun((r) => {
      const mode = this._currentModeObservable.read(r);
      this.chatModeKindKey.set(mode.kind);
      this.chatModeNameKey.set(mode.name.read(r));
      if (this.options.suppressModePreferredModel) {
        return;
      }
      const models = mode.model?.read(r);
      if (models) {
        this.switchModelByQualifiedName(models);
      }
    }));
    this.validateCurrentChatMode();
  }
  get attachmentModel() {
    return this._attachmentModel;
  }
  getAttachedContext() {
    const contextArr = new ChatRequestVariableSet();
    contextArr.add(...this.attachmentModel.attachments, ...this.chatContextService.getWorkspaceContextItems());
    return contextArr;
  }
  getAttachedAndImplicitContext() {
    const contextArr = this.getAttachedContext();
    if (this.implicitContext) {
      const implicitChatVariables = this.implicitContext.enabledBaseEntries(this.configurationService.getValue("chat.implicitContext.suggestedContext"));
      contextArr.add(...implicitChatVariables);
    }
    return contextArr;
  }
  get implicitContext() {
    return this._implicitContext;
  }
  get inputContainerElement() {
    return this.inputContainer;
  }
  get inputRowHeight() {
    return this.inputAndSideToolbar.offsetHeight;
  }
  get persistentContentContainerElement() {
    return this.persistentContentContainer;
  }
  get gettingStartedTipContainerElement() {
    return this.chatGettingStartedTipContainer;
  }
  getChatPetPlatformTop() {
    const inputTop = this.inputContainer.getBoundingClientRect().top;
    let container = this.container;
    let previousElement = this.persistentContentContainer;
    while (true) {
      const children = Array.from(container.children);
      const startIndex = previousElement ? children.indexOf(previousElement) + 1 : 0;
      let nestedContainer;
      for (let index = startIndex; index < children.length; index++) {
        const child = children[index];
        if (!dom.isHTMLElement(child)) {
          continue;
        }
        if (child === this.inputContainer) {
          return inputTop;
        }
        if (child.contains(this.inputContainer)) {
          nestedContainer = child;
          break;
        }
        const bounds = child.getBoundingClientRect();
        if (bounds.height > 0 && bounds.top <= inputTop) {
          return bounds.top;
        }
      }
      if (!nestedContainer) {
        return inputTop;
      }
      container = nestedContainer;
      previousElement = void 0;
    }
  }
  /** Whoever speaks for the intended model right now: the bound conversation, else this input part. */
  get _intentHolder() {
    return this._inputModel ?? this._unboundIntent;
  }
  get inputEditor() {
    return this._inputEditor;
  }
  setHistoryKey(historyKey) {
    this.history.setHistoryKey(historyKey);
  }
  get currentLanguageModel() {
    return this._currentLanguageModel.get()?.identifier;
  }
  get selectedLanguageModel() {
    return this._currentLanguageModel;
  }
  /** Models the current input can select, for frontend-owned voice actions. */
  get availableLanguageModels() {
    return this.getModels();
  }
  get currentModeKind() {
    const mode = this._currentModeObservable.get();
    return mode.kind === ChatModeKind.Agent && !this.agentService.hasToolsAgent ? ChatModeKind.Edit : mode.kind;
  }
  get currentModeObs() {
    return this._currentModeObservable;
  }
  get currentChatModesObs() {
    return this._currentChatModesObservable;
  }
  get currentPermissionLevelObs() {
    return this._currentPermissionLevel;
  }
  get currentModeInfo() {
    const mode = this._currentModeObservable.get();
    const modeId = mode.isBuiltin ? this.currentModeKind : "custom";
    const modeInstructions = mode.modeInstructions?.get();
    return {
      kind: this.currentModeKind,
      isBuiltin: mode.isBuiltin,
      modeInstructions: modeInstructions ? {
        uri: mode.uri?.get(),
        name: mode.name.get(),
        content: modeInstructions.content,
        toolReferences: this.toolService.toToolReferences(modeInstructions.toolReferences),
        allowedSubagents: mode.agents?.get(),
        metadata: modeInstructions.metadata,
        isBuiltin: mode.isBuiltin
      } : void 0,
      telemetryModeId: modeId,
      telemetryModeName: getModeNameForTelemetry(mode),
      applyCodeBlockSuggestionId: void 0,
      permissionLevel: this._currentPermissionLevel.get()
    };
  }
  get selectedElements() {
    const edits = [];
    const editsList = this._chatEditList?.object;
    const selectedElements = editsList?.getSelectedElements() ?? [];
    for (const element of selectedElements) {
      if (element.kind === "reference" && URI.isUri(element.reference)) {
        edits.push(element.reference);
      }
    }
    return edits;
  }
  /**
   * The number of working set entries that the user actually wanted to attach.
   * This is less than or equal to {@link ChatInputPart.chatEditWorkingSetFiles}.
   */
  get attemptedWorkingSetEntriesCount() {
    return this._attemptedWorkingSetEntriesCount;
  }
  /**
   * Gets the pending delegation target if one is set.
   * This is used when the user changes the session target picker to a different provider
   * but hasn't submitted yet, so the delegation will happen on submit.
   */
  get pendingDelegationTarget() {
    return this._pendingDelegationTarget;
  }
  get _pendingDelegationTarget() {
    return this._pendingDelegationTargetObservable.get();
  }
  set _pendingDelegationTarget(value) {
    this._pendingDelegationTargetObservable.set(value, void 0);
  }
  get _currentSessionType() {
    return this._currentSessionTypeObservable.get();
  }
  set _currentSessionType(value) {
    this._currentSessionTypeObservable.set(value, void 0);
  }
  setImplicitContextEnablement() {
    if (this.implicitContext && this.configurationService.getValue("chat.implicitContext.suggestedContext")) {
      this.implicitContext.setEnabled(this._currentModeObservable.get().name.get().toLowerCase() === "ask");
    }
  }
  setIsWithinEditSession(inInsideDiff, isFilePartOfEditSession) {
    this.withinEditSessionKey.set(inInsideDiff);
    this.filePartOfEditSessionKey.set(isFilePartOfEditSession);
  }
  getSelectedModelTarget() {
    const sessionType = this._currentSessionType;
    return sessionType && this.sessionTypeHasOwnModelPool(sessionType) ? sessionType : void 0;
  }
  /**
   * True when the session type owns its own model pool (either declared via `requiresCustomModels`,
   * or some registered model already targets it). Keeps storage keys stable before targeted models are published.
   */
  sessionTypeHasOwnModelPool(sessionType) {
    return this.chatSessionsService.requiresCustomModelsForSessionType(sessionType) || hasModelsTargetingSession(this.getAllMergedModels(), sessionType);
  }
  initSelectedModel() {
    this._modelConfigStore.clear();
    const storedSelection = getStoredSelectedModel(this.storageService, this.location, this.getSelectedModelTarget());
    this._modelSelectionController.initialize(storedSelection);
  }
  setEditing(enabled, editingSentRequest) {
    this.currentlyEditingInputKey?.set(enabled);
    this.editingSentRequestKey?.set(editingSentRequest);
  }
  switchModel(modelMetadata) {
    const models = this.getModels();
    const model = models.find((m) => m.metadata.vendor === modelMetadata.vendor && m.metadata.id === modelMetadata.id && m.metadata.family === modelMetadata.family);
    if (model) {
      this.setCurrentLanguageModel(model, true);
    }
  }
  /**
   * Switch to a model by its identifier. Returns true if a matching model
   * was found and applied.
   *
   * The remembered profile preference is updated only when both
   * `isUserAction` and `storeSelection` are true.
   */
  switchModelByIdentifier(identifier, storeSelection = false, isUserAction = false) {
    const models = this.getModels();
    const model = models.find((m) => m.identifier === identifier);
    if (model) {
      if (isUserAction) {
        this.setCurrentLanguageModel(model, true, storeSelection);
      } else {
        this._applyProgrammaticLanguageModel(model);
      }
      return true;
    }
    return false;
  }
  switchModelByQualifiedName(qualifiedModelNames) {
    const models = this.getModels();
    for (const qualifiedModelName of qualifiedModelNames) {
      const model = models.find((m) => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedModelName, m.metadata));
      if (model) {
        this._applyProgrammaticLanguageModel(model);
        return true;
      }
    }
    this.logService.warn(`[chat] Node of the models "${qualifiedModelNames.join(", ")}" not found. Use format "<name> (<vendor>)", e.g. "GPT-4o (copilot)".`);
    return false;
  }
  requestModelByIdentifier(identifier) {
    return this._requestProgrammaticLanguageModel(() => this.getModels().find((model) => model.identifier === identifier));
  }
  requestModelByQualifiedName(qualifiedModelNames) {
    return this._requestProgrammaticLanguageModel(() => {
      const models = this.getModels();
      return qualifiedModelNames.map((name) => models.find((model) => ILanguageModelChatMetadata.matchesQualifiedName(name, model.metadata))).find(isDefined);
    });
  }
  get hasPendingProgrammaticModelSelection() {
    return this._modelSelectionController.hasPendingProgrammaticSelection();
  }
  switchToNextModel() {
    const models = this.getModels();
    if (models.length > 0) {
      const currentIndex = models.findIndex((model) => model.identifier === this._currentLanguageModel.get()?.identifier);
      const nextIndex = (currentIndex + 1) % models.length;
      this.setCurrentLanguageModel(models[nextIndex], true);
    }
  }
  switchToNextPinnedModel() {
    const models = this.getModels();
    if (models.length === 0) {
      return;
    }
    const modelMap = new Map(models.map((model) => [model.identifier, model]));
    const pinnedModels = this.languageModelsService.getPinnedModelIds().map((modelId) => modelMap.get(modelId)).filter(isDefined);
    if (pinnedModels.length === 0) {
      return;
    }
    const currentIndex = pinnedModels.findIndex((model) => model.identifier === this._currentLanguageModel.get()?.identifier);
    const nextIndex = (currentIndex + 1) % pinnedModels.length;
    this.setCurrentLanguageModel(pinnedModels[nextIndex], true);
  }
  openModelPicker() {
    if (this.chatPhoneInputPresenter.enabled.get()) {
      this._showCombinedPhonePickerSheet();
      return;
    }
    this.modelWidget?.show();
  }
  openModePicker() {
    if (this.chatPhoneInputPresenter.enabled.get()) {
      this._showCombinedPhonePickerSheet();
      return;
    }
    this.modeWidget?.show();
  }
  _showCombinedPhonePickerSheet() {
    const target = this.inputActionsToolbar.getElement();
    this.chatPhoneInputPresenter.showCombinedModeAndModelSheet(target, {
      kind: "delegates",
      modeDelegate: this._createModePickerDelegate(),
      modelDelegate: this._createModelPickerDelegate()
    }).catch((err) => this.logService.error("[ChatInputPart] phone picker sheet failed", err));
  }
  _createModelPickerDelegate() {
    const inputPickerContainer = this.options.inputPickerContainer;
    const inputPickerPosition = this.options.inputPickerPosition;
    return {
      currentModel: this._currentLanguageModel,
      setModel: (model) => {
        this.setCurrentLanguageModel(model, true, !this.options.suppressModelPersistence);
        this.renderAttachedContext();
      },
      getModels: () => this.getModels(),
      isCacheWarm: () => (this._widget?.viewModel?.model.getRequests().length ?? 0) > 0,
      getPresentationOptions: () => this._getModelPickerPresentationOptions(),
      modelConfiguration: this._modelConfigStore,
      onDidChangeVisibility: this.options.onDidChangeModelPickerVisibility,
      get anchorPosition() {
        return typeof inputPickerPosition === "function" ? inputPickerPosition() : inputPickerPosition;
      },
      get actionWidgetContainer() {
        return typeof inputPickerContainer === "function" ? inputPickerContainer() : inputPickerContainer;
      },
      getActionWidgetAnchor: this.options.inputPickerAnchor,
      openOnMouseUp: this.options.inputPickerOpenOnMouseUp
    };
  }
  _getModelPickerPresentationOptions() {
    const sessionType = this.getCurrentSessionType();
    const useRichPicker = !sessionType || sessionType === localChatSessionType || isAgentHostTarget(sessionType);
    return {
      useGroupedModelPicker: useRichPicker,
      showManageModelsAction: useRichPicker,
      showUnavailableFeatured: useRichPicker,
      showFeatured: useRichPicker,
      showAutoModel: this._showAutoModel(),
      showModelIcon: this.options.isSessionsWindow || !this._usesHarnessProviderIcon()
    };
  }
  _usesHarnessProviderIcon() {
    const sessionType = this.getCurrentSessionType();
    return sessionType === SessionType.Codex || sessionType === SessionType.AgentHostClaude || sessionType === SessionType.AgentHostCodex;
  }
  /**
   * Returns this editor's snapshot of the given model's configuration (e.g.
   * context size, thinking effort), scoped to this editor rather than the
   * profile-global value. Delegates to {@link ChatModelConfigurationStore}.
   * See issue #320393.
   */
  getModelConfiguration(modelId) {
    return this._modelConfigStore.getModelConfiguration(modelId);
  }
  setModelConfiguration(modelId, values) {
    return this._modelConfigStore.setModelConfiguration(modelId, values);
  }
  /**
   * Restores a model's configuration captured in a session's persisted input
   * state. Called when the selected model is restored from session history so
   * the configuration follows the model through the same resolution hierarchy.
   * No-op for sessions that pre-date configuration capture (no value stored).
   */
  restoreModelConfiguration(modelId, modelConfiguration) {
    if (modelConfiguration) {
      this._modelConfigStore.restoreModelConfiguration(modelId, modelConfiguration);
    }
  }
  getModelConfigurationStorageKey() {
    const sessionType = this._currentSessionType;
    if (sessionType && this.sessionTypeHasOwnModelPool(sessionType)) {
      return `chat.modelConfiguration.${this.location}.${sessionType}`;
    }
    return `chat.modelConfiguration.${this.location}`;
  }
  _createModePickerDelegate() {
    const productService = this.productService;
    const currentChatModes = this.options.hideCustomChatModes ? derived((reader) => {
      const inner = this._currentChatModesObservable.read(reader);
      const filteredCustom = inner.custom.filter((m) => isModeConsideredBuiltIn(m, productService));
      const wrapped = {
        onDidChange: inner.onDidChange,
        builtin: inner.builtin,
        custom: filteredCustom,
        findModeById: (id) => inner.builtin.find((m) => m.id === id) ?? filteredCustom.find((m) => m.id === id),
        findModeByName: (name) => inner.builtin.find((m) => m.name.read(void 0) === name) ?? filteredCustom.find((m) => m.name.read(void 0) === name),
        waitForPendingUpdates: () => inner.waitForPendingUpdates()
      };
      return wrapped;
    }) : this._currentChatModesObservable;
    return {
      currentMode: this._currentModeObservable,
      currentChatModes,
      sessionResource: () => this._widget?.viewModel?.sessionResource,
      // Direct setter for hosts that embed `ChatInputPart` without
      // registering an `IChatWidget` (e.g. the automations dialog).
      // The picker only calls this when `sessionResource()` is
      // `undefined`; real chat widgets keep the command path.
      setMode: (mode) => this.setChatMode2(mode, true),
      customAgentTarget: () => {
        const sessionResource = this._widget?.viewModel?.model.sessionResource;
        return (sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource))) ?? Target.Undefined;
      }
    };
  }
  openPermissionPicker() {
    this.permissionWidget?.show();
  }
  setPermissionLevel(level) {
    level = this.getPermittedPermissionLevel(level);
    this._currentPermissionLevel.set(level, void 0);
    this.permissionLevelKey.set(level);
    this.permissionWidget?.refresh();
    const sessionResource = this.getCurrentSessionResource();
    if (sessionResource) {
      this.chatSessionsService.setSessionOption(sessionResource, PERMISSION_LEVEL_OPTION_ID, level);
    }
    logChangesToStateModel(this._inputModel, `setPermissionLevel -> _syncInputStateToModel (level=${level}, currentLanguageModel=${this._currentLanguageModel.get()?.identifier}) in ${this._currentSessionKey}`, void 0, void 0, this.logService);
    this._syncInputStateToModel();
  }
  getDefaultPermissionLevel() {
    const level = this.configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
    return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
  }
  getPermittedPermissionLevel(level) {
    if (isAutoApproveValuePolicyRestricted(level, isAutoApprovePolicyRestricted(this.configurationService))) {
      return ChatPermissionLevel.Default;
    }
    return level;
  }
  openSessionTargetPicker() {
    this.sessionTargetWidget?.show();
  }
  openDelegationPicker() {
    this.delegationWidget?.show();
  }
  openChatSessionPicker() {
    const firstWidget = this.chatSessionPickerWidgets?.values()?.next().value;
    firstWidget?.show();
  }
  /**
   * Create picker widgets for all option groups available for the current session type.
   */
  createChatSessionPickerWidgets(action, pickerOptions) {
    this._lastSessionPickerAction = action;
    this._lastSessionPickerOptions = pickerOptions;
    const sessionResource = this.getCurrentSessionResource();
    const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
    if (!visibleOptionGroups.length) {
      return [];
    }
    const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
    if (!effectiveSessionType) {
      return [];
    }
    this.chatSessionPickerWidgets.clearAndDisposeAll();
    const widgets = [];
    for (const optionGroup of visibleOptionGroups) {
      const initialItem = this.getCurrentOptionForGroup(optionGroup.id);
      const initialState = { group: optionGroup, item: initialItem };
      const itemDelegate = {
        getCurrentOption: () => this.getCurrentOptionForGroup(optionGroup.id),
        onDidChangeOption: this.getOrCreateOptionEmitter(optionGroup.id).event,
        setOption: (option) => {
          this.updateOptionContextKey(optionGroup.id, option.id);
          this.getOrCreateOptionEmitter(optionGroup.id).fire(option);
          const sessionResource2 = this._widget?.viewModel?.model.sessionResource;
          if (sessionResource2) {
            this.chatSessionsService.setSessionOption(sessionResource2, optionGroup.id, option);
          }
          this.refreshChatSessionPickers();
        },
        getOptionGroup: () => {
          const groups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
          return groups?.find((g) => g.id === optionGroup.id);
        },
        getSessionResource: () => {
          return this._widget?.viewModel?.model.sessionResource;
        }
      };
      const widget = this.instantiationService.createInstance(ChatSessionPickerActionItem, action, initialState, itemDelegate, pickerOptions);
      this.chatSessionPickerWidgets.set(optionGroup.id, widget);
      widgets.push(widget);
    }
    return widgets;
  }
  /**
   * Set the input model reference for syncing input state
   *
   * Note: We have a cyclic ref between ChatInputPart and ChatWidget,
   * When we invoke setInputModel, the property _widget is not set. Hence we don't have the SessionResource.
   * As a result, in this method when syncFromModel is called, the model state is not applied to the UI.
   * Instead, the defaults are computed and the model is updated with default values. Thereby blowing away model information.
   * Setting Widget and then calling this doesn't work either because the widget also relies on ChatInputPart (hence cyclic ref).
   * Solution is to pass the SessionResource as an argument to this method.
  */
  setInputModel(model, chatSessionIsEmpty, forSessionResource) {
    logChangesToStateModel(this._inputModel, `setInputModel for ${forSessionResource.toString()} (chatSessionIsEmpty=${chatSessionIsEmpty}, outgoing._inputModel=${this._inputModel ? "present" : "undefined"})`, model.state.get(), this._inputModel?.state.get(), this.logService);
    if (this._inputModel) {
      logChangesToStateModel(this._inputModel, `[FLUSH-PRE] setInputModel pre-flush boundInputModelSession=${this._inputModelSessionResource?.toString()} widgetSession=${this._currentSessionKey} incoming=${forSessionResource.toString()}`, void 0, this._inputModel.state.get(), this.logService);
      this._syncInputStateToModel();
    }
    this._currentSessionType = getChatSessionType(forSessionResource);
    this._inputModel = model;
    this._inputModelSessionResource = forSessionResource;
    this._modelSyncDisposables.clear();
    const chatModes = this.chatModeService.createModes(forSessionResource);
    this._currentChatModes.value = chatModes;
    this._currentChatModesObservable.set(chatModes, void 0);
    this.selectedToolsModel.resetSessionEnablementState();
    this._chatSessionIsEmpty = isNewConversation(forSessionResource, chatSessionIsEmpty);
    const ownsPool = !!this._currentSessionType && this.sessionTypeHasOwnModelPool(this._currentSessionType);
    const hadIncomingModel = !!model.state.get()?.selectedModel;
    this._modelSelectionController.beginSessionSwitch(this._chatSessionIsEmpty, ownsPool, hadIncomingModel);
    if (this._chatSessionIsEmpty) {
      const persistedState = model.state.get() ? void 0 : this._getPersistedEmptyInputState();
      if (persistedState) {
        model.setState(persistedState);
        this._syncFromModel(persistedState, forSessionResource);
      }
      this._setEmptyModelState();
      this._modelSyncDisposables.add(this.configurationService.onDidChangeConfiguration((e) => {
        if (this._chatSessionIsEmpty && e.affectsConfiguration(ChatConfiguration.DefaultNewSessionMode)) {
          this._setEmptyModelState();
        }
      }));
      this._modelSyncDisposables.add(this._currentChatModesObservable.get().onDidChange(() => {
        if (this._chatSessionIsEmpty) {
          this._setEmptyModelState();
        }
      }));
    }
    const widgetViewModelSession = this._widget?.viewModel?.model.sessionResource;
    const isStaleAtRegistration = !!widgetViewModelSession && !isEqual(widgetViewModelSession, forSessionResource);
    logChangesToStateModel(this._inputModel, `[AUTORUN-REG] registering model->view autorun for ${forSessionResource.toString()}, widgetSession=${this._currentSessionKey}, widgetViewModelSession=${widgetViewModelSession?.toString()}, isStaleAtRegistration=${isStaleAtRegistration}, model.state.selectedModel=${model.state.get()?.selectedModel?.identifier}, _currentLanguageModel=${this._currentLanguageModel.get()?.identifier}`, void 0, void 0, this.logService);
    this._modelSyncDisposables.add(autorun((reader) => {
      let state = model.state.read(reader);
      let message = `syncing from model for ${forSessionResource.toString()} in ${this._currentSessionKey}`;
      if (!state && this._chatSessionIsEmpty) {
        state = this._getPersistedEmptyInputState();
        message = `syncing from empty input state for ${forSessionResource.toString()}`;
        if (state) {
          const resolved = this._modelSelectionController.resolveDraftModel(state.selectedModel, this._currentSessionType, false);
          if (resolved.changed) {
            state = { ...state, selectedModel: resolved.model, modelConfiguration: void 0 };
          }
        }
      }
      const widgetSessionResource = this._widget?.viewModel?.model.sessionResource;
      const isStaleSession = !!this._inputModelSessionResource && !isEqual(this._inputModelSessionResource, forSessionResource);
      if (isStaleSession) {
        message = `[STALE-SESSION-AUTORUN] ${message} (widget now on ${widgetSessionResource?.toString()}, ${this._inputModelSessionResource?.toString()}, ${forSessionResource.toString()} is old)`;
      }
      const prevState = this._inputModel?.state.read(void 0);
      logChangesToStateModel(this._inputModel, message, state, prevState, this.logService);
      if (isStaleSession) {
        return;
      }
      this._syncFromModel(state, forSessionResource);
    }));
  }
  _getPersistedEmptyInputState() {
    let state = this._emptyInputState.read(void 0);
    if (!state) {
      return void 0;
    }
    const persistedAttachments = this._emptyInputAttachments.read(void 0);
    state = {
      ...state,
      attachments: persistedAttachments.length > 0 ? persistedAttachments : state.attachments
    };
    const resolved = this._modelSelectionController.resolveDraftModel(state.selectedModel, this._currentSessionType, true);
    if (resolved.changed) {
      state = { ...state, selectedModel: resolved.model, modelConfiguration: void 0 };
    }
    return state;
  }
  _setEmptyModelState() {
    logChangesToStateModel(this._inputModel, `setting empty model state for ${this._widget?.viewModel?.sessionResource.toString()} in ${this._currentSessionKey}`, void 0, void 0, this.logService);
    const currentLevel = this._inputModel?.state?.get()?.permissionLevel;
    if (currentLevel === void 0 || !isChatPermissionLevel(currentLevel)) {
      this.setPermissionLevel(this.getDefaultPermissionLevel());
    }
    if (this.entitlementService.anonymous) {
      this.setChatMode(ChatModeKind.Agent, false);
      this._modelSelectionController.ensureCurrentModelSupported();
      return;
    }
    const rawDefaultMode = this.configurationService.getValue(ChatConfiguration.DefaultNewSessionMode);
    if (typeof rawDefaultMode === "string") {
      const defaultMode = rawDefaultMode.trim();
      if (defaultMode) {
        const defaultModeLower = defaultMode.toLowerCase();
        const modes = this._currentChatModesObservable.get();
        const resolved = modes.findModeById(defaultMode) ?? modes.findModeByName(defaultMode) ?? modes.custom.find((m) => m.name.get().toLowerCase() === defaultModeLower);
        if (resolved) {
          this.logService.trace(`[ChatInputPart] Applying default mode from setting: ${defaultMode} -> ${resolved.id}`);
          this.setChatMode(resolved.id, false);
          this._modelSelectionController.ensureCurrentModelSupported();
        }
      }
    }
  }
  /**
   * Sync from model to view (when model state changes)
   */
  _syncFromModel(state, forSessionResource) {
    if (this._isSyncingToOrFromInputModel) {
      return;
    }
    try {
      this._isSyncingToOrFromInputModel = true;
      if (state) {
        const currentMode = this._currentModeObservable.get();
        if (currentMode.id !== state.mode.id) {
          this.setChatMode(state.mode.id, false);
        }
      }
      if (state?.selectedModel) {
        const sessionType = getChatSessionType(forSessionResource);
        this._modelSelectionController.syncFromConversationState(state.selectedModel, state.modelConfiguration, sessionType, forSessionResource.toString(), state.origin === ChatInputStateOrigin.Remote);
      } else if (state) {
        this._modelSelectionDiagnostics.report("conversation-state-without-model", {
          conversation: forSessionResource.toString(),
          currentModel: this._currentLanguageModel.get()?.identifier
        });
      }
      const currentAttachments = this._attachmentModel.attachments;
      if (!state) {
        this._attachmentModel.clear();
      } else if (!arraysEqual(currentAttachments, state.attachments)) {
        this._attachmentModel.clearAndSetContext(...state.attachments);
      }
      if (this._inputEditor) {
        this._inputEditor.setValue(state?.inputText || "");
        if (state?.selections.length) {
          this._inputEditor.setSelections(state.selections);
        }
      }
      if (!this.configurationService.getValue(ChatConfiguration.GlobalAutoApprove)) {
        const targetLevel = this.getPermittedPermissionLevel(state?.permissionLevel ?? ChatPermissionLevel.Default);
        if (this._currentPermissionLevel.get() !== targetLevel) {
          this._currentPermissionLevel.set(targetLevel, void 0);
          this.permissionLevelKey.set(targetLevel);
          this.permissionWidget?.refresh();
        }
      }
      if (state) {
        this._widget?.contribs.forEach((contrib) => {
          contrib.setInputState?.(state.contrib);
        });
      }
    } finally {
      this._isSyncingToOrFromInputModel = false;
      this._syncTextDebounced.cancel();
    }
  }
  /**
   * Sync current input state to the input model
   */
  _syncInputStateToModel() {
    if (this._isSyncingToOrFromInputModel) {
      return;
    }
    this._isSyncingToOrFromInputModel = true;
    const state = this.getCurrentInputState();
    if (this._chatSessionIsEmpty) {
      this._emptyInputState.set(state, void 0);
    }
    const prevState = this._inputModel?.state.get();
    logChangesToStateModel(this._inputModel, `_syncInputStateToModel boundInputModelSession=${this._inputModelSessionResource?.toString()} widgetSession=${this._currentSessionKey} mismatch=${this._inputModelSessionResource?.toString() !== this._currentSessionKey}`, state, prevState, this.logService);
    this._inputModel?.setState(state);
    this._isSyncingToOrFromInputModel = false;
    queueMicrotask(() => this.inputActionsToolbar?.relayout());
  }
  /**
   * Flush the current input state to the bound input model. Use this before
   * the host releases its model reference (e.g. on session switch) to ensure
   * an unsent draft is captured by `willDisposeModel` persistence.
   */
  flushInputStateToModel() {
    if (this._inputModel) {
      this._syncInputStateToModel();
    }
  }
  setCurrentLanguageModel(model, isUserAction = false, storeSelection = isUserAction) {
    const persistSelection = isUserAction && storeSelection;
    this._modelSelectionDiagnostics.report("set-model", {
      model: model.identifier,
      isUserAction,
      persistSelection,
      available: this.getModels().length
    }, "info");
    const apply = () => {
      if (this.cachedWidth) {
        this.layout(this.cachedWidth);
      }
      if (persistSelection) {
        storeSelectedModel(this.storageService, this.location, this.getSelectedModelTarget(), model.identifier);
      }
      this._syncInputStateToModel();
    };
    this._modelSelectionController.applySelection(model, apply, isUserAction);
  }
  _applyProgrammaticLanguageModel(model) {
    this._modelSelectionController.applyProgrammaticSelection(model);
  }
  _requestProgrammaticLanguageModel(resolveModel) {
    const result = this._modelSelectionController.requestProgrammaticSelection(
      resolveModel,
      this._inputModelSessionResource?.toString()
    );
    this._updateInputContentContextKeys();
    void result.finally(() => this._updateInputContentContextKeys());
    return result;
  }
  /**
   * By ID- prefer this method
   */
  setChatMode(mode, storeSelection = true, isUserInitiated = false) {
    if (!this.options.supportsChangingModes) {
      return;
    }
    const modes = this._currentChatModesObservable.get();
    const mode2 = modes.findModeById(mode) ?? modes.findModeByName(mode) ?? modes.findModeById(ChatModeKind.Agent) ?? ChatMode.Ask;
    this.setChatMode2(mode2, storeSelection, isUserInitiated);
  }
  setChatMode2(mode, storeSelection = true, isUserInitiated = false) {
    if (!this.options.supportsChangingModes) {
      return;
    }
    this._currentModeObservable.set(mode, void 0);
    this._onDidChangeCurrentChatMode.fire({ isUserInitiated });
    if (storeSelection) {
      logChangesToStateModel(this._inputModel, `setChatMode2 -> _syncInputStateToModel (mode=${mode.id}, storeSelection=${storeSelection}, isUserInitiated=${isUserInitiated}, currentLanguageModel=${this._currentLanguageModel.get()?.identifier}) in ${this._currentSessionKey}`, void 0, void 0, this.logService);
      this._syncInputStateToModel();
    }
  }
  /**
   * Get all models merged from live and cache, without session/mode filtering.
   * This is the canonical source for the full model pool, including cached models
   * that bridge startup races when live models haven't loaded yet.
   */
  getAllMergedModels() {
    const cachedModels = this.storageService.getObject(CachedLanguageModelsKey, StorageScope.APPLICATION, []);
    const liveModels = this.languageModelsService.getLanguageModelIds().map((modelId) => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId) }));
    const contributedVendors = new Set(this.languageModelsService.getVendors().map((v) => v.vendor));
    const resolvedVendors = /* @__PURE__ */ new Set();
    for (const v of contributedVendors) {
      if (this.languageModelsService.hasResolvedVendor(v)) {
        resolvedVendors.add(v);
      }
    }
    const models = mergeModelsWithCache(liveModels, cachedModels, contributedVendors, resolvedVendors);
    if (liveModels.length > 0 || resolvedVendors.size > 0) {
      this.storageService.store(CachedLanguageModelsKey, models, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return models;
  }
  getModels() {
    return this.getModelsForSessionType(this.getCurrentSessionType());
  }
  /**
   * True when the current session type can fall back to the synthetic "Auto"
   * model. Defaults to `true` when no session type is set. See
   * {@link hasNoAvailableModel} for the "nothing to send with" state, which
   * additionally requires an empty model list.
   */
  _showAutoModel() {
    const sessionType = this.getCurrentSessionType();
    return !sessionType || this.chatSessionsService.supportsAutoModelForSessionType(sessionType);
  }
  /**
   * True when the current session type cannot fall back to the Auto model
   * and no models are available to it — e.g. the Claude agent host for a
   * Copilot Free / Student user. In this state there is no model to send a
   * request with, so sending is blocked.
   */
  hasNoAvailableModel() {
    return !this._showAutoModel() && this.getModels().length === 0;
  }
  getModelsForSessionType(sessionType) {
    const allModels = this.getAllMergedModels();
    if (sessionType && this.chatSessionsService.requiresCustomModelsForSessionType(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
      return [];
    }
    allModels.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    const sessionFiltered = filterModelsForSession(allModels, sessionType, this.currentModeKind, this.location);
    return sessionFiltered.filter((m) => !isModelHiddenInPicker(m, (id) => this.languageModelsService.isModelHidden(id)));
  }
  /**
   * Get the chat session type for the current session, if any.
   *
   * Once a real session exists, the session resource is the authoritative
   * source for which models are valid. The picker delegate only describes the
   * welcome/new-session selection, which may not match the session that was
   * ultimately created (e.g. an agent-host pick that fell back to an
   * in-process `local` session). Preferring the delegate in that case lets an
   * agent-host model leak into a local session's pool, so we only consult the
   * delegate when there is no session yet (the welcome view has no view model).
   */
  getCurrentSessionType() {
    if (this.options.modelPickerSessionType) {
      return this.options.modelPickerSessionType;
    }
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    if (sessionResource) {
      return getChatSessionType(sessionResource);
    }
    return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
  }
  /**
   * Reset the current mode when it is not valid for the current session type.
   */
  checkModeInSessionPool(sessionType) {
    if (!sessionType) {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (!sessionResource) {
        return;
      }
      sessionType = getChatSessionType(sessionResource);
    }
    const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType);
    if (!customAgentTarget || customAgentTarget === Target.Undefined) {
      return;
    }
    const currentMode = this._currentModeObservable.get();
    if (currentMode.id === ChatMode.Agent.id) {
      return;
    }
    if (currentMode.isBuiltin) {
      this.setChatMode(ChatModeKind.Agent, false);
      return;
    }
    const modeTarget = currentMode.target.get();
    if (modeTarget !== customAgentTarget && modeTarget !== Target.Undefined) {
      this.setChatMode(ChatModeKind.Agent, false);
    }
  }
  setCurrentLanguageModelToDefault(forSessionType) {
    this._modelSelectionController.selectDefault(forSessionType ?? this.getCurrentSessionType());
  }
  /**
   * The raw configured default-model value from the
   * {@link ChatConfiguration.DefaultModel} setting (which may
   * be forced by enterprise policy). Returns `undefined` when nothing is
   * configured.
   */
  getConfiguredModelValue() {
    const model = this.configurationService.getValue(ChatConfiguration.DefaultModel)?.trim();
    return model ? model : void 0;
  }
  /** Resets the language model to the location default and cancels any pending model-selection intent. */
  resetLanguageModelToDefault() {
    this._modelSelectionController.clearIntent();
    this.setCurrentLanguageModelToDefault();
  }
  /**
   * Get the current input state for history
   */
  getCurrentInputState() {
    const mode = this._currentModeObservable.get();
    const selectedModel = this._currentLanguageModel.get();
    const state = {
      inputText: this._inputEditor?.getValue() ?? "",
      attachments: this._attachmentModel.attachments,
      mode: {
        id: mode.id,
        kind: mode.kind
      },
      selectedModel,
      modelConfiguration: selectedModel ? this._modelConfigStore.getModelConfiguration(selectedModel.identifier) : void 0,
      selections: this._inputEditor?.getSelections() || [],
      permissionLevel: this._currentPermissionLevel.get(),
      contrib: {}
    };
    for (const contrib of this._widget?.contribs || Iterable.empty()) {
      contrib.getInputState?.(state.contrib);
    }
    return state;
  }
  _getAriaLabel() {
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat);
    let kbLabel;
    if (verbose) {
      kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
    }
    const mode = this._currentModeObservable.get();
    const modelName = this._currentLanguageModel.get()?.metadata.name;
    const modelInfo = modelName ? localize("chatInput.model", ", {0}. ", modelName) : "";
    let modeLabel = "";
    if (!mode.isBuiltin) {
      const mode2 = this.currentModeObs.get();
      modeLabel = localize("chatInput.mode.custom", "({0}), {1}", mode2.label.get(), mode2.description.get());
    } else {
      switch (this.currentModeKind) {
        case ChatModeKind.Agent:
          modeLabel = localize("chatInput.mode.agent", "(Agent), edit files in your workspace.");
          break;
        case ChatModeKind.Edit:
          modeLabel = localize("chatInput.mode.edit", "(Edit), edit files in your workspace.");
          break;
        case ChatModeKind.Ask:
        default:
          modeLabel = localize("chatInput.mode.ask", "(Ask), ask questions or type / for topics.");
          break;
      }
    }
    if (verbose) {
      return kbLabel ? localize("actions.chat.accessibiltyHelp", "Chat Input {0}{1} Press Enter to send out the request. Use {2} for Chat Accessibility Help.", modeLabel, modelInfo, kbLabel) : localize("chatInput.accessibilityHelpNoKb", "Chat Input {0}{1} Press Enter to send out the request. Use the Chat Accessibility Help command for more information.", modeLabel, modelInfo);
    } else {
      return localize("chatInput.accessibilityHelp", "Chat Input {0}{1}.", modeLabel, modelInfo);
    }
  }
  validateCurrentChatMode() {
    const currentMode = this._currentModeObservable.get();
    const validMode = this._currentChatModesObservable.get().findModeById(currentMode.id);
    const isAgentModeEnabled = this.configurationService.getValue(ChatConfiguration.AgentEnabled);
    if (!validMode) {
      this.setChatMode(isAgentModeEnabled ? ChatModeKind.Agent : ChatModeKind.Ask);
      return;
    }
    if (currentMode.kind === ChatModeKind.Agent && !isAgentModeEnabled) {
      this.setChatMode(ChatModeKind.Ask);
      return;
    }
  }
  /**
   * Re-apply the session's own persisted custom agent once its mode becomes available.
   *
   * A restored agent-host session persists its selected custom agent in `mode`, but the agent
   * host's custom modes only register after the backend connects. Until then `setChatMode` falls
   * back to the builtin Agent, so when the custom modes arrive (`modes.onDidChange`) re-apply the
   * persisted custom agent. Builtin/default modes are handled by {@link validateCurrentChatMode}.
   */
  _restorePersistedCustomModeIfAvailable() {
    const persistedMode = this._inputModel?.state.get()?.mode;
    if (!persistedMode) {
      return;
    }
    const modes = this._currentChatModesObservable.get();
    const found = modes.findModeById(persistedMode.id) ?? modes.findModeByName(persistedMode.id);
    if (found && !found.isBuiltin && this._currentModeObservable.get().id !== found.id) {
      this.setChatMode(found.id, false);
    }
  }
  logInputHistory() {
    const historyStr = this.history.values.map((entry) => JSON.stringify(entry)).join("\n");
    this.logService.info(`[${this.location}] Chat input history:`, historyStr);
  }
  setVisible(visible) {
    this._onDidChangeVisibility.fire(visible);
  }
  /** If consumers are busy generating the chat input, returns the promise resolved when they finish */
  get generating() {
    return this._generating?.defer.p;
  }
  /** Disables the input submissions buttons until the disposable is disposed. */
  startGenerating() {
    this.logService.trace("ChatWidget#startGenerating");
    if (this._generating) {
      this._generating.rc++;
    } else {
      this._generating = { rc: 1, defer: new DeferredPromise() };
    }
    return toDisposable(() => {
      this.logService.trace("ChatWidget#doneGenerating");
      if (this._generating && !--this._generating.rc) {
        this._generating.defer.complete();
        this._generating = void 0;
      }
    });
  }
  get element() {
    return this.container;
  }
  async showPreviousValue() {
    if (this.history.isAtStart()) {
      return;
    }
    const state = this.getCurrentInputState();
    if (state.inputText || state.attachments.length) {
      this.history.overlay(state);
    }
    this.navigateHistory(true);
  }
  async showNextValue() {
    if (this.history.isAtEnd()) {
      return;
    }
    const state = this.getCurrentInputState();
    if (state.inputText || state.attachments.length) {
      this.history.overlay(state);
    }
    this.navigateHistory(false);
  }
  /**
   * Restores attachments to the input, re-fetching image binary data as needed.
   */
  async restoreAttachments(attachments) {
    let restored = [...attachments];
    if (restored.length > 0) {
      restored = (await Promise.all(restored.map(async (attachment) => {
        if (isImageVariableEntry(attachment) && !attachment.value && attachment.references?.length && URI.isUri(attachment.references[0].reference)) {
          const currReference = attachment.references[0].reference;
          try {
            const imageBinary = currReference.toString(true).startsWith("http") ? await this.sharedWebExtracterService.readImage(currReference, CancellationToken.None) : (await this.fileService.readFile(currReference)).value;
            if (!imageBinary) {
              return void 0;
            }
            const newAttachment = { ...attachment };
            newAttachment.value = isImageVariableEntry(attachment) && attachment.isPasted ? imageBinary.buffer : await resizeImage(imageBinary.buffer);
            return newAttachment;
          } catch (err) {
            this.logService.error("Failed to fetch and reference.", err);
            return void 0;
          }
        }
        return attachment;
      }))).filter(isDefined);
    }
    this._attachmentModel.clearAndSetContext(...restored);
  }
  async navigateHistory(previous) {
    const historyEntry = previous ? this.history.previous() : this.history.next();
    await this.restoreAttachments(historyEntry?.attachments ?? []);
    const inputText = historyEntry?.inputText ?? "";
    const contribData = historyEntry?.contrib ?? {};
    aria.status(inputText);
    this.setValue(inputText, true);
    this._widget?.contribs.forEach((contrib) => {
      contrib.setInputState?.(contribData);
    });
    this._onDidLoadInputState.fire();
    const model = this._inputEditor.getModel();
    if (!model) {
      return;
    }
    if (previous) {
      this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
    } else {
      this._inputEditor.setPosition(getLastPosition(model));
    }
  }
  setValue(value, transient) {
    this.inputEditor.setValue(value);
    const model = this.inputEditor.getModel();
    if (model) {
      this.inputEditor.setPosition(getLastPosition(model));
    }
  }
  focus() {
    this._inputEditor.focus();
  }
  hasFocus() {
    return this._inputEditor.hasWidgetFocus();
  }
  focusTodoList() {
    return this._chatInputTodoListWidget.value?.focus() ?? false;
  }
  isTodoListFocused() {
    return this._chatInputTodoListWidget.value?.hasFocus() ?? false;
  }
  hasVisibleTodos() {
    return this._chatInputTodoListWidget.value?.hasTodos() ?? false;
  }
  /**
   * Reset the input and update history.
   * @param userQuery If provided, this will be added to the history. Followups and programmatic queries should not be passed.
   */
  async acceptInput(isUserQuery, preserveFocus, preserveInput) {
    if (isUserQuery) {
      const userQuery = this.getCurrentInputState();
      this.history.append(this._getFilteredEntry(userQuery));
    }
    this.resetScrollbarVisibilityAfterAccept();
    this.chatInputNotificationService.handleMessageSent({
      sessionType: this._notificationModelTargetChatSessionType.get(),
      sessionResource: this._currentSessionResourceObservable.get()
    });
    if (this._chatSessionIsEmpty) {
      this._chatSessionIsEmpty = false;
      this._emptyInputState.set(void 0, void 0);
      this._emptyInputAttachments.set([], void 0);
    }
    if (preserveInput) {
      if (!preserveFocus) {
        this._inputEditor.focus();
      }
      return;
    }
    notifyDictationSubmitted(this._inputEditor);
    logChangesToStateModel(this._inputModel, `[ACCEPT] acceptInput -> attachmentModel.clear() in ${this._currentSessionKey}`, void 0, this._inputModel?.state.get(), this.logService);
    this.attachmentModel.clear();
    this._onDidLoadInputState.fire();
    if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
      this._acceptInputForVoiceover();
    } else if (preserveFocus) {
      this._inputEditor.setValue("");
    } else {
      this._inputEditor.focus();
      this._inputEditor.setValue("");
    }
  }
  validateAgentMode() {
    if (!this.agentService.hasToolsAgent && this._currentModeObservable.get().kind === ChatModeKind.Agent) {
      this.setChatMode(ChatModeKind.Edit);
    }
  }
  // A function that filters out specifically the `value` property of the attachment.
  _getFilteredEntry(inputState) {
    const attachmentsWithoutImageValues = inputState.attachments.map((attachment) => {
      if (isImageVariableEntry(attachment) && attachment.references?.length && attachment.value) {
        const newAttachment = { ...attachment };
        newAttachment.value = void 0;
        return newAttachment;
      }
      return attachment;
    });
    return { ...inputState, attachments: attachmentsWithoutImageValues };
  }
  _acceptInputForVoiceover() {
    const domNode = this._inputEditor.getDomNode();
    if (!domNode) {
      return;
    }
    domNode.remove();
    this._inputEditor.setValue("");
    this._inputEditorElement.appendChild(domNode);
    this._inputEditor.focus();
  }
  _handleAttachedContextChange() {
    this._hasFileAttachmentContextKey.set(Boolean(this._attachmentModel.attachments.find((a) => a.kind === "file")));
    this._updateInputContentContextKeys();
    this.renderAttachedContext();
  }
  /**
   * Toggle the "submit pending" state. While pending, the input reflects that a
   * submitted request is still being routed/dispatched (e.g. omni-chat routing,
   * where submission is intercepted and handled off-model) so the send button is
   * disabled until the submission resolves or the draft changes. Any input content
   * change clears this automatically.
   */
  setSubmitPending(pending, routing = pending) {
    this.inputSubmitPending.set(pending);
    this.inputRouting.set(routing);
  }
  _updateInputContentContextKeys() {
    const inputHasText = !!this._inputEditor?.getModel()?.getValue().trim();
    this.inputEditorHasText.set(inputHasText);
    const hasSendableContent = inputHasText || this._attachmentModel.attachments.some(isExplicitFileOrImageVariableEntry);
    this.inputEditorHasSendableContent.set(isChatInputContentSendable(hasSendableContent, this.hasNoAvailableModel()));
  }
  getOrCreateOptionEmitter(optionGroupId) {
    let emitter = this._chatSessionOptionEmitters.get(optionGroupId);
    if (!emitter) {
      emitter = new Emitter();
      this._chatSessionOptionEmitters.set(optionGroupId, emitter);
    }
    return emitter;
  }
  /**
   * Get or create a context key for an option group.
   * Context keys follow the pattern `chatSessionOption.<groupId>`.
   */
  getOrCreateOptionContextKey(optionGroupId) {
    if (!this._scopedContextKeyService) {
      return void 0;
    }
    let contextKey = this._optionContextKeys.get(optionGroupId);
    if (!contextKey) {
      const rawKey = new RawContextKey(`chatSessionOption.${optionGroupId}`, "");
      contextKey = rawKey.bindTo(this._scopedContextKeyService);
      this._optionContextKeys.set(optionGroupId, contextKey);
    }
    return contextKey;
  }
  /**
   * Update the context key for an option group with the current selection.
   * This enables `when` expressions on other option groups to react to changes.
   */
  updateOptionContextKey(optionGroupId, optionItemId) {
    const normalizedOptionId = optionItemId.trim();
    const contextKey = this.getOrCreateOptionContextKey(optionGroupId);
    if (contextKey) {
      contextKey.set(normalizedOptionId);
    }
  }
  /**
   * Evaluate whether an option group should be visible based on its `when` expression.
   * Returns true if the option group should be visible, false otherwise.
   */
  evaluateOptionGroupVisibility(optionGroup) {
    if (!optionGroup.when) {
      return true;
    }
    if (!this._scopedContextKeyService) {
      return true;
    }
    const expr = ContextKeyExpr.deserialize(optionGroup.when);
    if (!expr) {
      return true;
    }
    return this._scopedContextKeyService.contextMatchesRules(expr);
  }
  /**
   * Computes which option groups should be visible for the current session.
   *
   * A picker should show if and only if:
   * 1. We can determine a session type (from session context OR delegate)
   * 2. That session type has option groups registered
   * 3. At least one option group has items AND passes its `when` clause
   *
   * This method also updates the `chatSessionHasOptions` context key, which controls
   * whether the picker action is shown in the toolbar via its `when` clause.
   */
  getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource) {
    const sessionType = this.getEffectiveSessionType(sessionResource);
    const customAgentTarget = sessionType ? this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType) : Target.Undefined;
    this.chatSessionHasCustomAgentTarget.set(customAgentTarget !== Target.Undefined);
    const requiresCustomModels = sessionType && this.chatSessionsService.requiresCustomModelsForSessionType(sessionType);
    this.chatSessionHasTargetedModels.set(!!requiresCustomModels);
    const visibleOptionGroups = this.getVisibleOptionGroups(sessionResource);
    this.permissionWidget?.refresh();
    if (!visibleOptionGroups.length) {
      this.chatSessionHasOptions.set(false);
      this.chatSessionOptionsValid.set(true);
      this._updateInputContentContextKeys();
      return [];
    }
    const allOptionsValid = sessionResource ? this.areAllOptionsValid(sessionResource, visibleOptionGroups) : true;
    this.chatSessionHasOptions.set(true);
    this.chatSessionOptionsValid.set(allOptionsValid);
    this._updateInputContentContextKeys();
    return visibleOptionGroups;
  }
  getCurrentSessionResource() {
    return this._widget?.viewModel?.model.sessionResource;
  }
  getTerminalCommandPrefix() {
    const sessionResource = this.getCurrentSessionResource();
    return sessionResource ? this.chatSessionsService.getCapabilitiesForSessionType(getChatSessionType(sessionResource))?.terminalCommandPrefix : void 0;
  }
  isTerminalCommandPaste(pastedText, range) {
    const model = this._inputEditor.getModel();
    const prefix = this.getTerminalCommandPrefix();
    if (!model || !prefix) {
      return false;
    }
    return isTerminalCommandPasteContent({
      prefix,
      pastedText,
      currentValue: model.getValue(),
      selectionStartOffset: model.getOffsetAt(Range.getStartPosition(range)),
      selectionEndOffset: model.getOffsetAt(Range.getEndPosition(range))
    });
  }
  updateInputEditorFontFamily() {
    if (!this._inputEditor) {
      return;
    }
    const isCommand = isTerminalCommandInput(this._inputEditor.getModel()?.getLineContent(1) || "", this.getTerminalCommandPrefix());
    this._inputEditor.updateOptions({ fontFamily: isCommand ? EDITOR_FONT_DEFAULTS.fontFamily : DEFAULT_FONT_FAMILY });
  }
  handleTerminalCommandPaste(e) {
    handleTerminalCommandPaste(e, this._inputEditor, this.getTerminalCommandPrefix(), this.dialogService, this.storageService);
  }
  areAllOptionsValid(sessionResource, visibleOptionGroups) {
    for (const optionGroup of visibleOptionGroups) {
      const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
      if (currentOption) {
        const currentOptionId = typeof currentOption === "string" ? currentOption : currentOption.id;
        if (!optionGroup.items.some((item) => item.id === currentOptionId) && typeof currentOption === "string") {
          return false;
        }
      }
    }
    return true;
  }
  getAllOptionsGroups(sessionResource) {
    const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
    const effectiveSessionType = delegateSessionType ?? (sessionResource ? getChatSessionType(sessionResource) : void 0);
    if (!effectiveSessionType) {
      return [];
    }
    const allOptionGroups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
    return allOptionGroups ?? [];
  }
  getVisibleOptionGroups(sessionResource) {
    const allOptionGroups = this.getAllOptionsGroups(sessionResource);
    if (!allOptionGroups.length) {
      return [];
    }
    if (sessionResource) {
      for (const optionGroup of allOptionGroups) {
        const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
        if (currentOption) {
          const optionId = typeof currentOption === "string" ? currentOption : currentOption.id;
          this.updateOptionContextKey(optionGroup.id, optionId);
        }
      }
    }
    const visibleGroups = /* @__PURE__ */ new Map();
    for (const optionGroup of allOptionGroups) {
      if (optionGroup.kind === "permissions") {
        continue;
      }
      const hasItems = optionGroup.items.length > 0 || (optionGroup.commands || []).length > 0;
      const passesWhenClause = this.evaluateOptionGroupVisibility(optionGroup);
      const sessionHasOption = !sessionResource || this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id) !== void 0;
      if (hasItems && passesWhenClause && sessionHasOption) {
        visibleGroups.set(optionGroup.id, optionGroup);
      }
    }
    return Array.from(visibleGroups.values());
  }
  /**
   * Returns the permissions-kind option group contributed by the active session provider, if any.
   * Items from this group are surfaced inside the chat permission picker, replacing the
   * built-in `ChatPermissionLevel` items. Honors the same visibility predicates as
   * {@link getVisibleOptionGroups} so that `when` clauses are respected.
   *
   * If the provider declares more than one permissions-kind group (which the API forbids),
   * the first one wins.
   */
  getActiveExtensionPermissionGroup(sessionResource) {
    const allOptionGroups = this.getAllOptionsGroups(sessionResource);
    return allOptionGroups.find(
      (g) => g.kind === "permissions" && g.items.length > 0 && this.evaluateOptionGroupVisibility(g)
    );
  }
  /**
   * Refresh all registered option groups for the current chat session.
   * Fires events for each option group with their current selection.
   */
  refreshChatSessionPickers() {
    const sessionResource = this.getCurrentSessionResource();
    const allOptionsGroups = this.getAllOptionsGroups(sessionResource);
    const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
    if (!allOptionsGroups.length || !visibleOptionGroups.length) {
      this.hideAllSessionPickerWidgets();
      return;
    }
    const currentWidgetGroupIds = new Set(this.chatSessionPickerWidgets.keys());
    const needsRecreation = currentWidgetGroupIds.size !== visibleOptionGroups.length || !visibleOptionGroups.every((group) => currentWidgetGroupIds.has(group.id));
    if (needsRecreation && this._lastSessionPickerAction && this.chatSessionPickerContainer) {
      const widgets = this.createChatSessionPickerWidgets(this._lastSessionPickerAction, this._lastSessionPickerOptions);
      dom.clearNode(this.chatSessionPickerContainer);
      for (const widget of widgets) {
        const container = dom.$(".action-item.chat-sessionPicker-item");
        widget.render(container);
        this.chatSessionPickerContainer.appendChild(container);
      }
    }
    if (this.chatSessionPickerContainer) {
      this.chatSessionPickerContainer.style.display = "";
    }
    if (sessionResource) {
      for (const [optionGroupId] of this.chatSessionPickerWidgets) {
        const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
        if (currentOption) {
          const optionGroup = allOptionsGroups.find((g) => g.id === optionGroupId);
          if (optionGroup) {
            const currentOptionId = typeof currentOption === "string" ? currentOption : currentOption.id;
            const item = optionGroup.items.find((m) => m.id === currentOptionId);
            if (item && typeof currentOption === "string") {
              this.getOrCreateOptionEmitter(optionGroupId).fire(item);
            } else if (typeof currentOption !== "string") {
              this.getOrCreateOptionEmitter(optionGroupId).fire(currentOption);
            }
          }
        }
      }
    }
  }
  hideAllSessionPickerWidgets() {
    if (this.chatSessionPickerContainer) {
      this.chatSessionPickerContainer.style.display = "none";
    }
  }
  /**
   * Get the current option for a specific option group.
   * Returns undefined if the session doesn't have this option configured.
   */
  getCurrentOptionForGroup(optionGroupId) {
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    if (!sessionResource) {
      return;
    }
    if (this.chatSessionsService.getSessionOption(sessionResource, optionGroupId) === void 0) {
      return;
    }
    const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
    const optionGroups = effectiveSessionType ? this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType) : void 0;
    const optionGroup = optionGroups?.find((g) => g.id === optionGroupId);
    if (!optionGroup || optionGroup.items.length === 0) {
      return;
    }
    const currentOptionValue = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
    if (!currentOptionValue) {
      const defaultItem = optionGroup.items.find((item) => item.default);
      return defaultItem;
    }
    if (typeof currentOptionValue === "string") {
      const normalizedOptionId = currentOptionValue.trim();
      return optionGroup.items.find((m) => m.id === normalizedOptionId);
    } else {
      return currentOptionValue;
    }
  }
  hasWorkspaceScmRepository() {
    const folders = this.workspaceContextService.getWorkspace().folders;
    if (folders.length === 0) {
      return false;
    }
    for (const repo of this.scmService.repositories) {
      if (repo.provider.rootUri && this.workspaceContextService.getWorkspaceFolder(repo.provider.rootUri)) {
        return true;
      }
    }
    return false;
  }
  getEffectiveSessionType(sessionResource) {
    return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? (sessionResource ? getChatSessionType(sessionResource) : void 0);
  }
  /**
   * Updates the agentSessionType context key based on delegate or actual session.
   */
  updateAgentSessionTypeContextKey() {
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    const delegate = this.options.sessionTypePickerDelegate;
    const delegateSessionType = delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider?.();
    const sessionType = delegateSessionType || (sessionResource ? getChatSessionType(sessionResource) : "");
    this.agentSessionTypeKey.set(sessionType);
    this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(sessionType));
  }
  /**
   * Updates the widget lock state based on a session type.
   * Local sessions unlock from coding agent mode, while remote/cloud sessions lock to coding agent mode.
   */
  updateWidgetLockStateFromSessionType(sessionType) {
    if (sessionType === localChatSessionType) {
      this._widget?.unlockFromCodingAgent();
      return;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
    if (contribution) {
      this._widget?.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type, contribution.agentHostProviderId);
    } else {
      this._widget?.unlockFromCodingAgent();
    }
  }
  /**
   * Resolves the session type of the active chat session for the delegation picker.
   */
  getActiveSessionTypeForDelegation() {
    const sessionResource = this._widget?.viewModel?.sessionResource;
    return sessionResource ? getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource) : void 0;
  }
  /**
   * Selects (or clears) the pending delegation target. While a target is pending, the widget
   * locks to the target agent and the `hasPendingDelegationTarget` context key hides the
   * agent and model pickers. Re-selecting the active session clears the pending target and
   * restores the pickers.
   */
  continueInSession(provider) {
    this.setPendingDelegationTarget(provider);
    this.focus();
  }
  setPendingDelegationTarget(provider) {
    const isActive = this.getActiveSessionTypeForDelegation() === provider;
    this._pendingDelegationTarget = isActive ? void 0 : provider;
    this.chatHasPendingDelegationTargetKey.set(!!this._pendingDelegationTarget);
    this.updateWidgetLockStateFromSessionType(provider);
    this.updateAgentSessionTypeContextKey();
    this.refreshChatSessionPickers();
  }
  /**
   * Ensures the notification widget is instantiated and appended to the notification container.
   */
  ensureNotificationWidget() {
    if (!this._notificationWidget.value) {
      this._notificationWidget.value = this.instantiationService.createInstance(ChatInputNotificationWidget, {
        modelTargetChatSessionType: this._notificationModelTargetChatSessionType,
        sessionResource: this._currentSessionResourceObservable,
        deferredNotificationsEnabled: this._deferredNotificationsEnabled,
        openModelPicker: () => this.openModelPicker(),
        switchToModel: (modelIdentifier) => this.switchModelByIdentifier(
          modelIdentifier,
          /* storeSelection */
          true,
          /* isUserAction */
          true
        ),
        onDidChangeVisibility: (visible, focusTarget) => this.noticeHost.setOccupied(ChatInputNoticeLane.Notification, visible, focusTarget),
        focusInput: () => this.focus()
      });
      this._notificationWidget.value.attachTo(this.chatInputNotificationContainer);
    }
  }
  /**
   * Lazy-instantiate the goal banner widget on first use.
   */
  ensureGoalBannerWidget() {
    if (!this._goalBannerWidget.value) {
      const widget = new ChatGoalBannerWidget();
      this._register(widget.onDismiss(() => this._onDidDismissGoalBanner.fire()));
      this._goalBannerWidget.value = widget;
      widget.attachTo(this.chatGoalBannerContainer);
    }
    return this._goalBannerWidget.value;
  }
  /** Shows the autopilot goal banner with a loading state. */
  showGoalBannerLoading() {
    this.ensureGoalBannerWidget().setLoading();
  }
  /** Updates the goal banner with the given summary text. */
  setGoalBanner(summary) {
    this.ensureGoalBannerWidget().setGoal(summary);
  }
  /** Hides the goal banner. */
  clearGoalBanner() {
    this._goalBannerWidget.value?.clear();
  }
  /**
   * Shows the context usage details popup and focuses it.
   * @returns Whether the details were successfully shown.
   */
  showContextUsageDetails() {
    return this.contextUsageWidget?.showDetails() ?? false;
  }
  /**
   * Updates the context usage widget based on the current model.
   */
  updateContextUsageWidget() {
    this._contextUsageDisposables.clear();
    const model = this._widget?.viewModel?.model;
    if (!model || !this.contextUsageWidget) {
      return;
    }
    const store = new DisposableStore();
    this._contextUsageDisposables.value = store;
    let lastRequest = model.lastRequest;
    const observePreviousResponse = (request) => {
      if (request?.response) {
        store.add(request.response.onDidChange(() => this.contextUsageWidget?.updateSessionCost(model.sessionCost)));
      }
    };
    for (const request of model.getRequests().slice(0, -1)) {
      observePreviousResponse(request);
    }
    store.add(model.onDidChange((e) => {
      if (e.kind === "addRequest") {
        observePreviousResponse(lastRequest);
        lastRequest = e.request;
        this.contextUsageWidget?.update(model.lastRequest);
      } else if (e.kind === "completedRequest") {
        this.contextUsageWidget?.update(model.lastRequest);
      }
    }));
    store.add(this.languageModelsService.onDidChangeLanguageModels(() => {
      const lastRequest2 = model.lastRequest;
      if (lastRequest2?.modelId) {
        this.contextUsageWidget?.update(lastRequest2);
      }
    }));
    this.contextUsageWidget.update(model.lastRequest);
  }
  handleViewModelChange(e) {
    this.updateDeferredNotificationsEligibility(e);
    transaction((observableTransaction) => {
      try {
        this.updateInputEditorFontFamily();
        this.resetPendingDelegationForViewModelChange(observableTransaction);
        this.refreshViewModelScopedState();
        this.clearQuestionCarouselIfSessionChanged(e);
        this.clearPlanReviewIfSessionChanged(e);
        this._syncToolConfirmationCarouselForSession();
        this.reconcileSessionTypeForViewModelChange(e, observableTransaction);
      } finally {
        this._modelSelectionController.endSessionSwitch();
      }
    });
    this._modelSelectionController.applyConfiguredDefault();
  }
  updateDeferredNotificationsEligibility(e) {
    if (this.options.deferredNotificationsEnabled !== void 0) {
      this._deferredNotificationsEnabled.set(this.options.deferredNotificationsEnabled, void 0);
      return;
    }
    if (this.environmentService.isSessionsWindow) {
      this._deferredNotificationsEnabled.set(true, void 0);
      return;
    }
    this._isFirstWorkbenchSession ??= !this.chatService.hasSessions();
    if (this._isFirstWorkbenchSession && e?.previousSessionResource && e.currentSessionResource && !isEqual(e.previousSessionResource, e.currentSessionResource) && !isUntitledChatSession(e.previousSessionResource)) {
      this._isFirstWorkbenchSession = false;
    }
    this._deferredNotificationsEnabled.set(!this._isFirstWorkbenchSession, void 0);
  }
  resetPendingDelegationForViewModelChange(transaction2) {
    this._pendingDelegationTargetObservable.set(void 0, transaction2);
    this.chatHasPendingDelegationTargetKey.set(false);
  }
  refreshViewModelScopedState() {
    this.updateAgentSessionTypeContextKey();
    this.refreshChatSessionPickers();
    this.ensureNotificationWidget();
    this.updateContextUsageWidget();
  }
  clearQuestionCarouselIfSessionChanged(e) {
    let hasMatchingResource = false;
    if (e.currentSessionResource) {
      for (const r of this._questionCarouselSessionResources.values()) {
        if (isEqual(r, e.currentSessionResource)) {
          hasMatchingResource = true;
          break;
        }
      }
    }
    if (this._questionCarouselSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingResource)) {
      this.clearQuestionCarousel();
    }
  }
  clearPlanReviewIfSessionChanged(e) {
    let hasMatchingPlanReviewResource = false;
    if (e.currentSessionResource) {
      for (const r of this._planReviewSessionResources.values()) {
        if (isEqual(r, e.currentSessionResource)) {
          hasMatchingPlanReviewResource = true;
          break;
        }
      }
    }
    if (this._planReviewSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingPlanReviewResource)) {
      this.clearPlanReview();
    }
  }
  reconcileSessionTypeForViewModelChange(e, transaction2) {
    this._currentSessionResourceObservable.set(e.currentSessionResource, transaction2);
    const newSessionType = this.getCurrentSessionType();
    if (e.currentSessionResource && this._currentSessionType && newSessionType !== this._currentSessionType) {
      logChangesToStateModel(this._inputModel, `[CVVM].1 onDidChangeViewModel -> session change: ${this._currentSessionType} -> ${newSessionType} in ${this._currentSessionKey}, ${e.currentSessionResource.toString()}`, void 0, this._inputModel?.state.get(), this.logService);
      this._currentSessionTypeObservable.set(newSessionType, transaction2);
      this.initSelectedModel();
      this.checkModeInSessionPool();
      this._modelSelectionController.ensureCurrentModelSupported();
    } else if (e.currentSessionResource) {
      logChangesToStateModel(this._inputModel, `[CVVM].2 onDidChangeViewModel -> session change: ${this._currentSessionType} -> ${newSessionType} in ${this._currentSessionKey}, ${e.currentSessionResource.toString()}`, void 0, this._inputModel?.state.get(), this.logService);
      this._currentSessionTypeObservable.set(newSessionType, transaction2);
      this.restorePerTypeModelAfterViewModelAssignment();
      this._modelSelectionController.reinitializeIfOutsidePool(() => this.initSelectedModel());
    }
  }
  restorePerTypeModelAfterViewModelAssignment() {
    if (this._modelSelectionController.restorePerTypeModel) {
      this.initSelectedModel();
      if (!this._modelSelectionController.hasPendingIntent() && !this._modelSelectionController.isAwaitingRememberedModel()) {
        this._modelSelectionController.ensureCurrentModelSupported();
      }
    }
  }
  render(container, initialValue, widget) {
    this._widget = widget;
    this.updateDeferredNotificationsEligibility();
    this._currentSessionResourceObservable.set(widget.viewModel?.sessionResource, void 0);
    this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());
    const delegate = this.options.sessionTypePickerDelegate;
    if (delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider) {
      const initialSessionType = delegate.getActiveSessionProvider();
      if (initialSessionType) {
        this.updateWidgetLockStateFromSessionType(initialSessionType);
      }
    }
    this._register(widget.onDidChangeViewModel((e) => this.handleViewModelChange(e)));
    let elements;
    if (this.options.renderStyle === "compact") {
      elements = dom.h(".interactive-input-part", [
        dom.h(".chat-input-persistent-content@persistentContentContainer"),
        dom.h(".interactive-input-and-edit-session", [
          dom.h(".chat-plan-review-widget-container@chatPlanReviewContainer"),
          dom.h(".chat-question-carousel-widget-container@chatQuestionCarouselContainer"),
          dom.h(".chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer"),
          dom.h(`.${chatInputStackClass}`, [
            dom.h(`.chat-input-notification-container.${chatInputStackSlotClass}@chatInputNotificationContainer`),
            dom.h(`.voice-mode-onboarding-container.${chatInputStackSlotClass}@voiceModeOnboardingContainer`),
            dom.h(`.dictation-onboarding-container.${chatInputStackSlotClass}@dictationOnboardingContainer`),
            dom.h(`.chat-goal-banner-container.${chatInputStackSlotClass}@chatGoalBannerContainer`),
            dom.h(".chat-todo-list-widget-container@chatInputTodoListWidgetContainer"),
            dom.h(".chat-artifacts-widget-container@chatArtifactsWidgetContainer"),
            dom.h(".chat-editing-session@chatEditingSessionWidgetContainer"),
            dom.h(`.chat-getting-started-tip-container.${chatInputStackSlotClass}@chatGettingStartedTipContainer`),
            dom.h(".interactive-input-and-side-toolbar@inputAndSideToolbar", [
              dom.h(".chat-input-container@inputContainer", [
                dom.h(".chat-editor-container@editorContainer"),
                dom.h(".chat-input-toolbars@inputToolbars")
              ])
            ])
          ]),
          dom.h(".chat-secondary-toolbar@secondaryToolbar", [
            dom.h(".chat-context-usage-container@contextUsageWidgetContainer"),
            dom.h(".chat-input-status-container@statusToolbarContainer")
          ]),
          dom.h(".chat-attachments-container@attachmentsContainer", [
            dom.h(".chat-attached-context@attachedContextContainer")
          ]),
          dom.h(".interactive-input-followups@followupsContainer")
        ])
      ]);
    } else {
      elements = dom.h(".interactive-input-part", [
        dom.h(".chat-input-persistent-content@persistentContentContainer"),
        dom.h(".chat-plan-review-widget-container@chatPlanReviewContainer"),
        dom.h(".chat-question-carousel-widget-container@chatQuestionCarouselContainer"),
        dom.h(".chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer"),
        dom.h(".interactive-input-followups@followupsContainer"),
        dom.h(`.${chatInputStackClass}`, [
          dom.h(`.chat-input-notification-container.${chatInputStackSlotClass}@chatInputNotificationContainer`),
          dom.h(`.voice-mode-onboarding-container.${chatInputStackSlotClass}@voiceModeOnboardingContainer`),
          dom.h(`.dictation-onboarding-container.${chatInputStackSlotClass}@dictationOnboardingContainer`),
          dom.h(`.chat-goal-banner-container.${chatInputStackSlotClass}@chatGoalBannerContainer`),
          dom.h(".chat-todo-list-widget-container@chatInputTodoListWidgetContainer"),
          dom.h(".chat-artifacts-widget-container@chatArtifactsWidgetContainer"),
          dom.h(".chat-editing-session@chatEditingSessionWidgetContainer"),
          dom.h(`.chat-getting-started-tip-container.${chatInputStackSlotClass}@chatGettingStartedTipContainer`),
          dom.h(".interactive-input-and-side-toolbar@inputAndSideToolbar", [
            dom.h(".chat-input-container@inputContainer", [
              dom.h(".chat-attachments-container@attachmentsContainer", [
                dom.h(".chat-attached-context@attachedContextContainer")
              ]),
              dom.h(".chat-editor-container@editorContainer"),
              dom.h(".chat-input-toolbars@inputToolbars")
            ])
          ])
        ]),
        dom.h(".chat-secondary-toolbar@secondaryToolbar", [
          dom.h(".chat-context-usage-container@contextUsageWidgetContainer"),
          dom.h(".chat-input-status-container@statusToolbarContainer")
        ])
      ]);
    }
    this.container = elements.root;
    this.persistentContentContainer = elements.persistentContentContainer;
    this.chatInputOverlay = dom.$(".chat-input-overlay");
    container.append(this.container);
    this.container.append(this.chatInputOverlay);
    this.container.classList.toggle("compact", this.options.renderStyle === "compact");
    this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    this.followupsContainer = elements.followupsContainer;
    const inputAndSideToolbar = elements.inputAndSideToolbar;
    this.inputAndSideToolbar = inputAndSideToolbar;
    const inputContainer = elements.inputContainer;
    this.inputContainer = inputContainer;
    const editorContainer = elements.editorContainer;
    this.attachmentsContainer = elements.attachmentsContainer;
    this.attachedContextContainer = elements.attachedContextContainer;
    const toolbarsContainer = elements.inputToolbars;
    this.secondaryToolbarContainer = elements.secondaryToolbar;
    if (this.options.renderStyle === "compact") {
      this.secondaryToolbarContainer.style.display = "none";
    }
    this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
    this.chatInputTodoListWidgetContainer = elements.chatInputTodoListWidgetContainer;
    this.chatArtifactsWidgetContainer = elements.chatArtifactsWidgetContainer;
    this.chatGettingStartedTipContainer = elements.chatGettingStartedTipContainer;
    this.chatQuestionCarouselContainer = elements.chatQuestionCarouselContainer;
    this.chatPlanReviewContainer = elements.chatPlanReviewContainer;
    this.chatToolConfirmationCarouselContainer = elements.chatToolConfirmationCarouselContainer;
    dom.hide(this.chatToolConfirmationCarouselContainer);
    this._register(this.chatInputNoticeHubService.registerHost(this.noticeHost, this.container));
    this.chatInputNotificationContainer = elements.chatInputNotificationContainer;
    this._register(registerChatInputOnboardingHosts(
      this.noticeHost,
      { voice: elements.voiceModeOnboardingContainer, dictation: elements.dictationOnboardingContainer },
      this.container,
      () => this.focus(),
      this.voiceModeOnboardingService,
      this.dictationOnboardingService
    ));
    this.chatGoalBannerContainer = elements.chatGoalBannerContainer;
    this.contextUsageWidgetContainer = elements.contextUsageWidgetContainer;
    this.statusToolbarContainer = elements.statusToolbarContainer;
    if (this.options.renderStyle === "compact") {
      toolbarsContainer.prepend(this.contextUsageWidgetContainer);
    }
    this.contextUsageWidget = this._register(this.instantiationService.createInstance(ChatContextUsageWidget));
    this.contextUsageWidget.setChatWidget(widget);
    this.contextUsageWidget.setSelectedModel(this._currentLanguageModel.get()?.identifier);
    this.contextUsageWidget.setModelConfigurationResolver(
      (modelId) => this.getModelConfiguration(modelId),
      this._modelConfigStore.onDidChange
    );
    this.contextUsageWidgetContainer.appendChild(this.contextUsageWidget.domNode);
    if (this.options.enableImplicitContext && !this._implicitContext) {
      this._implicitContext = this._register(
        this.instantiationService.createInstance(ChatImplicitContexts)
      );
      this.setImplicitContextEnablement();
      this._register(this._implicitContext.onDidChangeValue(() => {
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
        this._handleAttachedContextChange();
      }));
    } else if (!this.options.enableImplicitContext && this._implicitContext) {
      this._implicitContext?.dispose();
      this._implicitContext = void 0;
    }
    this.ensureNotificationWidget();
    this._register(this._attachmentModel.onDidChange((e) => {
      if (e.added.length > 0) {
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
      }
      this._handleAttachedContextChange();
    }));
    this.renderChatEditingSessionState(null);
    this.dnd.addOverlay(this.options.dndContainer ?? container, this.options.dndContainer ?? container);
    const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
    ChatContextKeys.inChatInput.bindTo(inputScopedContextKeyService).set(true);
    this.currentlyEditingInputKey = ChatContextKeys.currentlyEditingInput.bindTo(inputScopedContextKeyService);
    this.editingSentRequestKey = ChatContextKeys.editingRequestType.bindTo(this.contextKeyService);
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
    this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
    this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;
    const options = getSimpleEditorOptions(this.configurationService);
    options.overflowWidgetsDomNode = this.options.editorOverflowWidgetsDomNode;
    options.pasteAs = EditorOptions.pasteAs.defaultValue;
    options.readOnly = false;
    options.ariaLabel = this._getAriaLabel();
    options.fontFamily = DEFAULT_FONT_FAMILY;
    options.fontSize = 13;
    options.lineHeight = INPUT_EDITOR_LINE_HEIGHT;
    options.padding = this.options.renderStyle === "compact" ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
    options.cursorWidth = 1;
    options.wrappingStrategy = "advanced";
    options.bracketPairColorization = { enabled: false };
    options.autoClosingBrackets = this.configurationService.getValue("editor.autoClosingBrackets");
    options.autoClosingQuotes = this.configurationService.getValue("editor.autoClosingQuotes");
    options.autoSurround = this.configurationService.getValue("editor.autoSurround");
    options.quickSuggestions = false;
    options.suggest = {
      showIcons: true,
      showSnippets: false,
      showWords: true,
      showStatusBar: false,
      insertMode: "insert",
      fitWidthToDetails: true
    };
    options.scrollbar = this.options.renderStyle === "compact" ? { ...options.scrollbar ?? {}, vertical: "hidden" } : {
      ...options.scrollbar ?? {},
      vertical: "auto",
      verticalScrollbarSize: 7
    };
    options.stickyScroll = { enabled: false };
    this._inputEditorElement = dom.append(editorContainer, $(chatInputEditorContainerSelector));
    const editorOptions = getSimpleCodeEditorWidgetOptions();
    editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID, GlyphHoverController.ID, DropIntoEditorController.ID, CopyPasteController.ID, LinkDetector.ID, InlineCompletionsController.ID, PlaceholderTextContribution.ID]));
    this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));
    this.updateInputEditorFontFamily();
    this._register(addDisposableListener(this._inputEditorElement, dom.EventType.PASTE, (e) => this.handleTerminalCommandPaste(e), true));
    SuggestController.get(this._inputEditor)?.forceRenderingAbove();
    options.overflowWidgetsDomNode?.classList.add("hideSuggestTextIcons");
    this._inputEditorElement.classList.add("hideSuggestTextIcons");
    this._register(this._inputEditor.onKeyDown((e) => {
      if (e.keyCode === KeyCode.Enter && !hasModifierKeys(e)) {
        for (const keybinding of this.keybindingService.lookupKeybindings(ChatSubmitAction.ID)) {
          const chords = keybinding.getDispatchChords();
          const isPlainEnter = chords.length === 1 && chords[0] === "[Enter]";
          if (isPlainEnter) {
            e.preventDefault();
            break;
          }
        }
      }
    }));
    this._register(this._inputEditor.onDidChangeModelContent(() => {
      const currentHeight = Math.min(this._inputEditor.getContentHeight(), this._effectiveInputEditorMaxHeight);
      if (currentHeight !== this.inputEditorHeight) {
        this.inputEditorHeight = currentHeight;
        if (this.cachedWidth) {
          this._layout(this.cachedWidth);
        }
      }
      this._updateInputContentContextKeys();
      this.inputSubmitPending.set(false);
      this.inputRouting.set(false);
      this.updateInputEditorFontFamily();
      this._syncTextDebounced.schedule();
    }));
    this._register(this._inputEditor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.inputEditorHeight = !this.inline ? e.contentHeight : this.inputEditorHeight;
        if (this.cachedWidth) {
          this._layout(this.cachedWidth);
        }
      }
    }));
    this._register(this._inputEditor.onDidFocusEditorText(() => {
      this.inputEditorHasFocus.set(true);
      this._onDidFocus.fire();
      inputContainer.classList.toggle("focused", true);
      setChatInputStackInputFocused(inputContainer, true);
    }));
    this._register(this._inputEditor.onDidBlurEditorText(() => {
      this.inputEditorHasFocus.set(false);
      inputContainer.classList.toggle("focused", false);
      setChatInputStackInputFocused(inputContainer, false);
      this._onDidBlur.fire();
    }));
    this._register(this._inputEditor.onDidBlurEditorWidget(() => {
      CopyPasteController.get(this._inputEditor)?.clearWidgets();
      DropIntoEditorController.get(this._inputEditor)?.clearWidgets();
    }));
    const hoverDelegate = this._register(createInstantHoverDelegate());
    const { location } = this.getWidgetLocationInfo(widget);
    const focusedWidget = observableFromEvent(this, this.chatWidgetService.onDidChangeFocusedSession, () => this.chatWidgetService.lastFocusedWidget);
    const isVoiceInputActive = derived(this, (reader) => focusedWidget.read(reader) === widget);
    const isOmniInput = this.contextKeyService.getContextKeyValue(ChatContextKeys.inChatInputWindow.key) === true;
    const isVoiceSessionActive = derived(this, (reader) => {
      const omniInputOpen = this.voiceSessionController.omniInputOpen.read(reader);
      if (omniInputOpen) {
        return isOmniInput;
      }
      if (!isVoiceInputActive.read(reader)) {
        return false;
      }
      const target = this.voiceSessionController.targetSession.read(reader);
      const hasDraftTarget = this.voiceSessionController.hasDraftTarget.read(reader);
      const resource = widget.viewModel?.sessionResource;
      return !hasDraftTarget && (!target || !!resource && isEqual(target, resource));
    });
    const pickerOptions = {
      getOverflowAnchor: () => this.inputActionsToolbar.getElement(),
      actionContext: { widget },
      compact: derived((reader) => this._stableInputPartWidth.read(reader) < CHAT_INPUT_PICKER_COLLAPSE_WIDTH),
      listOptions: this.options.inputPickerPosition === void 0 ? void 0 : {
        anchorPosition: typeof this.options.inputPickerPosition === "function" ? this.options.inputPickerPosition() : this.options.inputPickerPosition
      }
    };
    const primarySessionPickerOptions = {
      ...pickerOptions,
      compact: constObservable(true)
    };
    const secondaryPickerOptions = {
      ...pickerOptions,
      getOverflowAnchor: () => this.secondaryToolbar.getElement(),
      compact: constObservable(true)
    };
    this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, (e) => this.inputEditor.focus()));
    this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, (e) => this.inputEditor.focus()));
    const shorterChatInputActionIds = /* @__PURE__ */ new Set([
      OpenModePickerAction.ID,
      ConfigureToolsAction.ID
    ]);
    this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate,
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 48,
        getActionMinWidth: (action) => shorterChatInputActionIds.has(action.id) ? 22 : void 0
      },
      actionViewItemProvider: (action, options2) => {
        if (this.chatPhoneInputPresenter.enabled.get()) {
          if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
            if (!this._currentLanguageModel.get()) {
              this.setCurrentLanguageModelToDefault();
            }
            const modelDelegate = this._createModelPickerDelegate();
            const modeDelegate = this._createModePickerDelegate();
            return this.instantiationService.createInstance(MobileChatInputCombinedPickerActionItem, action, modeDelegate, modelDelegate);
          } else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
            return new HiddenActionViewItem(action);
          }
        }
        if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
          if (!this._currentLanguageModel.get()) {
            this._modelSelectionDiagnostics.report("no-model-at-toolbar-build", {}, "info");
            this.setCurrentLanguageModelToDefault();
          }
          const itemDelegate = this._createModelPickerDelegate();
          return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, itemDelegate, pickerOptions);
        } else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
          const delegate2 = this._createModePickerDelegate();
          return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate2, pickerOptions);
        } else if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
          const delegate2 = this.options.sessionTypePickerDelegate ?? {
            getActiveSessionProvider: () => {
              return this.getActiveSessionTypeForDelegation();
            },
            getPendingDelegationTarget: () => {
              return this._pendingDelegationTarget;
            },
            setPendingDelegationTarget: (provider) => {
              this.setPendingDelegationTarget(provider);
            },
            hasGitRepository: () => this.hasWorkspaceScmRepository()
          };
          const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
          const Picker = action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
          return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* Editor */ ? "editor" : "sidebar", delegate2, pickerOptions);
        } else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
          const widgets = this.createChatSessionPickerWidgets(action, primarySessionPickerOptions);
          if (widgets.length === 0) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
        }
        return void 0;
      }
    }));
    this.inputActionsToolbar.getElement().classList.add("chat-input-toolbar");
    this.inputActionsToolbar.context = { widget, contextPicker: this.options.contextPicker };
    this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
      const toolbarElement = this.inputActionsToolbar.getElement();
      const primaryPickerContainer = toolbarElement.querySelector(".chat-sessionPicker-container");
      if (primaryPickerContainer) {
        this.chatSessionPickerContainer = primaryPickerContainer;
      }
      if (this.cachedWidth && typeof this.cachedInputToolbarWidth === "number" && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
        this._toolbarRelayoutScheduler.schedule();
      }
    }));
    this._register(autorun((reader) => {
      pickerOptions.compact.read(reader);
      queueMicrotask(() => this.inputActionsToolbar.relayout());
    }));
    let lastPhoneEnabled = this.chatPhoneInputPresenter.enabled.get();
    this._register(autorun((reader) => {
      const enabled = this.chatPhoneInputPresenter.enabled.read(reader);
      if (enabled !== lastPhoneEnabled) {
        lastPhoneEnabled = enabled;
        this.inputActionsToolbar.refresh();
      }
    }));
    this.executeToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: {
        shouldForwardArgs: true
      },
      hoverDelegate,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      actionViewItemProvider: (action, options2) => {
        if (action.id === ChatVoiceInputModeAction.ID) {
          return this.instantiationService.createInstance(VoiceInputModeActionViewItem, action, {
            isActive: isVoiceInputActive,
            isVoiceActive: isVoiceSessionActive,
            activateVoiceMode: isOmniInput ? () => {
              this.voiceSessionController.takeOmniInputOwnership(dom.getWindow(toolbarsContainer));
            } : void 0
          });
        }
        if ((action.id === ChatSubmitAction.ID || action.id === ChatEditingSessionSubmitAction.ID) && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(class extends MenuEntryActionViewItem {
            getHoverContents() {
              return isOmniInput ? void 0 : super.getHoverContents();
            }
            render(container2) {
              super.render(container2);
              container2.classList.add("chat-submit-button");
            }
          }, action, options2);
        }
        if ((action.id === ChatSpeechToTextPreparingAction.ID || action.id === ChatSpeechToTextConnectingAction.ID) && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(DictationDownloadActionViewItem, action, options2);
        }
        if (action.id === ToggleChatSpeechToTextAction.ID && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(DictationActionViewItem, action, options2);
        }
        if ((action.id === "agentsVoice.startVoiceInChat" || action.id === "agentsVoice.pttStopInChat") && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(VoiceModeActionViewItem, action, options2);
        }
        if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
          if (!this._currentLanguageModel.get()) {
            this.setCurrentLanguageModelToDefault();
          }
          const executePickerOptions = {
            ...pickerOptions,
            getOverflowAnchor: () => this.executeToolbar?.getElement() ?? toolbarsContainer
          };
          return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, this._createModelPickerDelegate(), executePickerOptions);
        }
        return void 0;
      }
    }));
    this.executeToolbar.getElement().classList.add("chat-execute-toolbar");
    this.executeToolbar.context = { widget, contextPicker: this.options.contextPicker };
    const voiceInputActionIconClasses = new Set([
      Codicon.mic,
      Codicon.micFilled,
      Codicon.micDownloadCompact,
      Codicon.voiceModeCompact,
      Codicon.loadingCompact,
      Codicon.debugDisconnectCompact
    ].map((icon) => ThemeIcon.asClassName(icon)));
    const updateVoiceInputActionBorder = () => {
      let voiceInputActionCount = 0;
      for (let i = 0; ; i++) {
        const action = this.executeToolbar.getItemAction(i);
        if (!action) {
          break;
        }
        if (action.class && voiceInputActionIconClasses.has(action.class)) {
          voiceInputActionCount++;
        }
      }
      this.executeToolbar.getElement().classList.toggle("chat-voice-input-actions-multiple", voiceInputActionCount > 1);
    };
    updateVoiceInputActionBorder();
    this._register(this.executeToolbar.onDidChangeMenuItems(() => {
      updateVoiceInputActionBorder();
      if (this.cachedWidth && typeof this.cachedExecuteToolbarWidth === "number" && this.cachedExecuteToolbarWidth !== this.executeToolbar.getItemsWidth()) {
        this._toolbarRelayoutScheduler.schedule();
      }
    }));
    if (this.options.menus.inputSideToolbar) {
      const toolbarSide = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputAndSideToolbar, this.options.menus.inputSideToolbar, {
        telemetrySource: this.options.menus.telemetrySource,
        menuOptions: {
          shouldForwardArgs: true
        },
        hoverDelegate
      }));
      this.inputSideToolbarContainer = toolbarSide.getElement();
      toolbarSide.getElement().classList.add("chat-side-toolbar");
      toolbarSide.context = { widget, contextPicker: this.options.contextPicker };
    }
    const agentHostShortPickerMinWidths = /* @__PURE__ */ new Map([
      [OpenAgentHostModePickerAction.ID, 22],
      ["sessions.agentHost.runningSessionModePicker", 22],
      [OpenAgentHostAutoApprovePickerAction.ID, 22],
      [OpenAgentHostPermissionModePickerAction.ID, 22],
      [OpenAgentHostCodexApprovalsPickerAction.ID, 22],
      [OpenAgentHostFolderPickerAction.ID, 22],
      ["sessions.tunnelHost.toggleSharing", 16]
    ]);
    const genericChipsContainer = dom.$(".chat-secondary-generic-chips");
    const genericChipsLane = this._register(this.instantiationService.createInstance(
      AgentHostGenericConfigChips,
      widget
    ));
    genericChipsLane.render(genericChipsContainer);
    this.secondaryToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryToolbarContainer, MenuId.ChatInputSecondary, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate,
      responsiveBehavior: {
        enabled: true,
        kind: "all",
        minItems: 1,
        actionMinWidth: 48,
        // Agent-host pickers collapse to an icon-only label via a CSS
        // container query in `AgentHostChatInputPicker` when narrow.
        // Report a smaller min-width for them so the responsive layout
        // keeps them visible instead of overflowing into the menu.
        getActionMinWidth: (action) => agentHostShortPickerMinWidths.get(action.id)
      },
      actionViewItemProvider: (action, options2) => {
        const agentHostPickerProperty = getAgentHostPickerProperty(action.id);
        const customSecondaryItem = this.options.secondaryToolbarActionViewItemProvider?.(action, options2);
        if (customSecondaryItem) {
          return customSecondaryItem;
        }
        if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
          const delegate2 = this.options.sessionTypePickerDelegate ?? {
            getActiveSessionProvider: () => {
              return this.getActiveSessionTypeForDelegation();
            },
            getPendingDelegationTarget: () => {
              return this._pendingDelegationTarget;
            },
            setPendingDelegationTarget: (provider) => {
              this.setPendingDelegationTarget(provider);
            },
            hasGitRepository: () => this.hasWorkspaceScmRepository()
          };
          const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
          const Picker = action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
          return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* Editor */ ? "editor" : "sidebar", delegate2, secondaryPickerOptions);
        } else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
          if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY && this.options.workspacePickerDelegate) {
            return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, secondaryPickerOptions);
          } else {
            return new HiddenActionViewItem(action);
          }
        } else if (action.id === OpenPermissionPickerAction.ID && action instanceof MenuItemAction) {
          const delegate2 = {
            currentPermissionLevel: this._currentPermissionLevel,
            setPermissionLevel: (level) => {
              this.setPermissionLevel(level);
            },
            getExtensionPermissions: () => {
              const sessionResource = this.getCurrentSessionResource();
              const group = this.getActiveExtensionPermissionGroup(sessionResource);
              if (!group) {
                return void 0;
              }
              const current = sessionResource ? this.chatSessionsService.getSessionOption(sessionResource, group.id) : void 0;
              const defaultId = group.selected?.id ?? group.items.find((i) => i.default)?.id;
              const rawSelectedId = current === void 0 ? defaultId : typeof current === "string" ? current : current.id;
              const selectedId = rawSelectedId !== void 0 && group.items.some((i) => i.id === rawSelectedId) ? rawSelectedId : defaultId;
              const sessionType = sessionResource ? getChatSessionType(sessionResource) : this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? "";
              return { sessionType, groupId: group.id, items: group.items, selectedId };
            },
            setExtensionPermission: (groupId, item) => {
              this.updateOptionContextKey(groupId, item.id);
              this.getOrCreateOptionEmitter(groupId).fire(item);
              const sessionResource = this.getCurrentSessionResource();
              if (sessionResource) {
                this.chatSessionsService.setSessionOption(sessionResource, groupId, item);
              }
              this.permissionWidget?.refresh();
            },
            isSandboxToggleApplicable: () => this.getEffectiveSessionType(this.getCurrentSessionResource()) === SessionType.Local
          };
          const widget2 = this.instantiationService.createInstance(PermissionPickerActionItem, action, delegate2, secondaryPickerOptions);
          this.permissionWidget = widget2;
          this.permissionWidgetDisposeListener.value = widget2.onDidDispose(() => {
            if (this.permissionWidget === widget2) {
              this.permissionWidget = void 0;
            }
            this.permissionWidgetDisposeListener.clear();
          });
          return widget2;
        } else if (agentHostPickerProperty && action instanceof MenuItemAction) {
          if (this.options.isSessionsWindow) {
            return new HiddenActionViewItem(action);
          }
          const picker = this.instantiationService.createInstance(AgentHostChatInputPicker, widget, agentHostPickerProperty);
          return new AgentHostChatInputPickerActionViewItem(action, picker);
        } else if (action.id === OpenAgentHostFolderPickerAction.ID && action instanceof MenuItemAction) {
          if (this.options.isSessionsWindow) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(AgentHostFolderPickerActionItem, action, widget, secondaryPickerOptions);
        } else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
          const widgets = this.createChatSessionPickerWidgets(action, secondaryPickerOptions);
          if (widgets.length === 0) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
        }
        return void 0;
      }
    }));
    this.secondaryToolbar.getElement().classList.add("chat-secondary-input-toolbar");
    this.secondaryToolbar.context = { widget };
    dom.append(this.secondaryToolbarContainer, genericChipsContainer);
    this._register(this.secondaryToolbar.onDidChangeMenuItems(() => {
      const toolbarElement = this.secondaryToolbar.getElement();
      const container2 = toolbarElement.querySelector(".chat-sessionPicker-container");
      if (dom.isHTMLElement(container2)) {
        this.chatSessionPickerContainer = container2;
      }
    }));
    this.statusToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.statusToolbarContainer, MenuId.ChatInputStatus, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate
    }));
    this.statusToolbar.getElement().classList.add("chat-input-status-toolbar");
    this.statusToolbar.context = { widget };
    let inputModel = this.modelService.getModel(this.inputUri);
    let createdInputModel;
    if (!inputModel) {
      inputModel = createdInputModel = this.modelService.createModel("", null, this.inputUri, false);
    }
    const inputModelReference = this.textModelResolverService.createModelReference(this.inputUri);
    if (createdInputModel) {
      const model = createdInputModel;
      this._register(toDisposable(() => {
        void inputModelReference.then(
          () => model.dispose(),
          () => model.dispose()
        );
      }));
    }
    inputModelReference.then((ref) => {
      if (this._store.isDisposed) {
        ref.dispose();
        return;
      }
      this._register(ref);
    }, (error) => {
      if (!this._store.isDisposed) {
        onUnexpectedError(error);
      }
    });
    this.inputModel = inputModel;
    this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
    this._inputEditor.setModel(this.inputModel);
    if (initialValue) {
      this.inputModel.setValue(initialValue);
      const lineNumber = this.inputModel.getLineCount();
      this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
    }
    const onDidChangeCursorPosition = () => {
      const model = this._inputEditor.getModel();
      if (!model) {
        return;
      }
      const position = this._inputEditor.getPosition();
      if (!position) {
        return;
      }
      const atTop = position.lineNumber === 1 && position.column === 1;
      this.chatCursorAtTop.set(atTop);
      this.historyNavigationBackwardsEnablement.set(atTop);
      this.historyNavigationForewardsEnablement.set(position.equals(getLastPosition(model)));
      this._syncInputStateToModel();
    };
    this._register(this._inputEditor.onDidChangeCursorPosition((e) => onDidChangeCursorPosition()));
    onDidChangeCursorPosition();
    this._register(this.themeService.onDidFileIconThemeChange(() => {
      this.renderAttachedContext();
    }));
    this.renderAttachedContext();
    const updateCarouselMaxHeightScheduler = this._register(new dom.AnimationFrameScheduler(this.container, () => this.updateToolConfirmationCarouselMaxHeight()));
    const inputResizeObserver = this._register(new dom.DisposableResizeObserver("ChatInputPart.containerHeight", () => {
      updateCarouselMaxHeightScheduler.schedule();
      const newHeight = this.container.offsetHeight;
      this.height.set(newHeight, void 0);
    }));
    this._register(inputResizeObserver.observe(this.container));
    if (this.options.renderStyle === "compact") {
      const toolbarsResizeObserver = this._register(new dom.DisposableResizeObserver("ChatInputPart.compactToolbars", () => {
        if (this.cachedWidth) {
          this.layout(this.cachedWidth);
        }
      }));
      this._register(toolbarsResizeObserver.observe(toolbarsContainer));
    }
  }
  toggleChatInputOverlay(editing) {
    this.chatInputOverlay.classList.toggle("disabled", editing);
    if (editing) {
      this.overlayClickListener.value = dom.addStandardDisposableListener(this.chatInputOverlay, dom.EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onDidClickOverlay.fire();
      });
    } else {
      this.overlayClickListener.clear();
    }
  }
  renderAttachedContext() {
    const container = this.attachedContextContainer;
    const store = new DisposableStore();
    this.attachedContextDisposables.value = store;
    dom.clearNode(container);
    store.add(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.KEY_DOWN, (e) => {
      this.handleAttachmentNavigation(e);
    }));
    const attachments = this.getRenderableAttachments().map((attachment, index) => [index, attachment]);
    const hasAttachments = Boolean(attachments.length);
    let hasImplicitContext = false;
    const isSuggestedEnabled = this.configurationService.getValue("chat.implicitContext.suggestedContext");
    const hasVisibleImplicitContext = isSuggestedEnabled ? this._implicitContext?.hasValue ?? false : this._implicitContext?.values.some((v) => v.enabled || v.isSelection) ?? false;
    if (this._implicitContext && hasVisibleImplicitContext) {
      const isAttachmentAlreadyAttached = (targetUri, targetRange, targetHandle) => {
        return this._attachmentModel.attachments.some((a) => {
          const aUri = URI.isUri(a.value) ? a.value : isLocation(a.value) ? a.value.uri : void 0;
          const aRange = isLocation(a.value) ? a.value.range : void 0;
          if (targetHandle !== void 0 && isStringVariableEntry(a) && a.handle === targetHandle) {
            return true;
          }
          if (targetUri && aUri && isEqual(targetUri, aUri)) {
            if (targetRange && aRange) {
              return Range.equalsRange(targetRange, aRange);
            }
            return !targetRange && !aRange;
          }
          return false;
        });
      };
      const implicitContextWidget = this.instantiationService.createInstance(
        ImplicitContextAttachmentWidget,
        () => this._widget,
        isAttachmentAlreadyAttached,
        this._implicitContext,
        this._contextResourceLabels,
        this._attachmentModel,
        container
      );
      store.add(implicitContextWidget);
      hasImplicitContext = implicitContextWidget.hasRenderedContexts;
    }
    dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || hasImplicitContext), this.attachmentsContainer);
    dom.setVisibility(hasAttachments || hasImplicitContext, this.attachedContextContainer);
    if (!attachments.length) {
      this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
      this._indexOfLastOpenedContext = -1;
    }
    const maxImagesPerRequest = getImageAttachmentLimit(this._currentLanguageModel.get()?.metadata);
    const imageAttachments = attachments.filter(([, a]) => isImageVariableEntry(a));
    if (maxImagesPerRequest !== void 0 && imageAttachments.length > maxImagesPerRequest) {
      const excessCount = imageAttachments.length - maxImagesPerRequest;
      for (let i = 0; i < excessCount; i++) {
        const attachment = imageAttachments[i][1];
        if (attachment.omittedState === OmittedState.NotOmitted || attachment.omittedState === OmittedState.ImageLimitExceeded) {
          attachment.omittedState = OmittedState.ImageLimitExceeded;
        }
      }
      for (let i = excessCount; i < imageAttachments.length; i++) {
        if (imageAttachments[i][1].omittedState === OmittedState.ImageLimitExceeded) {
          imageAttachments[i][1].omittedState = OmittedState.NotOmitted;
        }
      }
    } else {
      for (const [, a] of imageAttachments) {
        if (a.omittedState === OmittedState.ImageLimitExceeded) {
          a.omittedState = OmittedState.NotOmitted;
        }
      }
    }
    for (const [index, attachment] of attachments) {
      const resource = URI.isUri(attachment.value) ? attachment.value : isLocation(attachment.value) ? attachment.value.uri : void 0;
      const range = isLocation(attachment.value) ? attachment.value.range : void 0;
      const shouldFocusClearButton = index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, attachments.length - 1) && this._indexOfLastAttachedContextDeletedWithKeyboard > -1;
      let attachmentWidget;
      const options = { shouldFocusClearButton, supportsDeletion: true, isCurrentInput: true };
      const lm = this._currentLanguageModel.get();
      if (attachment.kind === "tool" || attachment.kind === "toolset") {
        attachmentWidget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (resource && isNotebookOutputVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPromptFileVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPromptTextVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, void 0, options, container, this._contextResourceLabels);
      } else if (resource && (attachment.kind === "file" || attachment.kind === "directory")) {
        attachmentWidget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, void 0, lm, options, container, this._contextResourceLabels);
      } else if (attachment.kind === "terminalCommand") {
        attachmentWidget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isImageVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isElementVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPasteVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isBrowserViewVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(BrowserViewAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else {
        attachmentWidget = this._chatAttachmentWidgetRegistry.createWidget(attachment, options, container) ?? this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, void 0, lm, options, container, this._contextResourceLabels);
      }
      if (shouldFocusClearButton) {
        attachmentWidget.element.focus();
      }
      if (index === Math.min(this._indexOfLastOpenedContext, attachments.length - 1)) {
        attachmentWidget.element.focus();
      }
      store.add(attachmentWidget);
      store.add(attachmentWidget.onDidDelete((e) => {
        this.handleAttachmentDeletion(e, index, attachment);
      }));
      store.add(attachmentWidget.onDidOpen((e) => {
        this.handleAttachmentOpen(index, attachment);
      }));
    }
    this._indexOfLastOpenedContext = -1;
  }
  /**
   * Removes the inline reference bound to a deleted attachment, including one
   * trailing space, so the input is not left with a token that resolves to
   * nothing. The dynamic variable model drops the reference once its text goes.
   */
  removeInlineReferenceText(attachment) {
    if (!attachment.range || !isPastedTextArtifact(attachment)) {
      return;
    }
    const model = this._inputEditor.getModel();
    const reference = this._widget?.getContrib(ChatDynamicVariableModel.ID)?.variables.find((variable) => variable.id === attachment.id);
    if (!model || !reference) {
      return;
    }
    const range = Range.lift(reference.range);
    const endColumn = model.getValueInRange(new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn + 1)) === " " ? range.endColumn + 1 : range.endColumn;
    this._inputEditor.executeEdits("chatRemoveAttachmentReference", [{
      range: new Range(range.startLineNumber, range.startColumn, range.endLineNumber, endColumn),
      text: ""
    }]);
  }
  handleAttachmentDeletion(e, index, attachment) {
    if (dom.isKeyboardEvent(e)) {
      this._indexOfLastAttachedContextDeletedWithKeyboard = index;
    }
    this._attachmentModel.delete(attachment.id);
    this.removeInlineReferenceText(attachment);
    if (this.configurationService.getValue("chat.implicitContext.enableImplicitContext")) {
      for (const implicitContext of this._implicitContext?.values || []) {
        const implicitValue = URI.isUri(implicitContext?.value) && URI.isUri(attachment.value) && isEqual(implicitContext.value, attachment.value);
        if (implicitContext?.isFile && implicitValue) {
          implicitContext.enabled = false;
        }
      }
    }
    if (this.getRenderableAttachments().length === 0) {
      this.focus();
    }
    this._onDidChangeContext.fire({ removed: [attachment] });
    this.renderAttachedContext();
  }
  /**
   * The attachments that are rendered as pills in the input. Agent-host
   * completion entries (skills/commands) live in the model so their `_meta`
   * reaches the outgoing message, but they are shown as inline decorations
   * rather than pills, so they are excluded here.
   */
  getRenderableAttachments() {
    return this.attachmentModel.attachments.filter((attachment) => !isAgentHostCompletionVariableEntry(attachment));
  }
  handleAttachmentOpen(index, attachment) {
    this._indexOfLastOpenedContext = index;
    this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
    if (this.getRenderableAttachments().length === 0) {
      this.focus();
    }
  }
  handleAttachmentNavigation(e) {
    if (!e.equals(KeyCode.LeftArrow) && !e.equals(KeyCode.RightArrow)) {
      return;
    }
    const attachments = Array.from(this.attachedContextContainer.querySelectorAll(".chat-attached-context-attachment"));
    if (!attachments.length) {
      return;
    }
    const activeElement = dom.getWindow(this.attachmentsContainer).document.activeElement;
    const currentIndex = attachments.findIndex((attachment) => attachment === activeElement);
    let newIndex = currentIndex;
    if (e.equals(KeyCode.LeftArrow)) {
      newIndex = currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
    } else if (e.equals(KeyCode.RightArrow)) {
      newIndex = currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
    }
    if (newIndex !== -1) {
      const nextElement = attachments[newIndex];
      nextElement.focus();
      e.preventDefault();
      e.stopPropagation();
    }
  }
  async renderChatTodoListWidget(chatSessionResource) {
    const isTodoWidgetEnabled = this.configurationService.getValue(ChatConfiguration.TodosShowWidget) !== false;
    if (!isTodoWidgetEnabled) {
      return;
    }
    if (!this._chatInputTodoListWidget.value) {
      const widget = this._chatEditingTodosDisposables.add(this.instantiationService.createInstance(ChatTodoListWidget));
      this._chatInputTodoListWidget.value = widget;
      dom.clearNode(this.chatInputTodoListWidgetContainer);
      widget.attachTo(this.chatInputTodoListWidgetContainer);
    }
    this._chatInputTodoListWidget.value.render(chatSessionResource);
  }
  clearTodoListWidget(sessionResource, force) {
    this._chatInputTodoListWidget.value?.clear(sessionResource, force);
  }
  renderArtifactsWidget(chatSessionResource) {
    if (!this.configurationService.getValue(ChatConfiguration.ArtifactsEnabled)) {
      return;
    }
    if (!this._chatArtifactsWidget.value) {
      const widget = this._register(this.instantiationService.createInstance(ChatArtifactsWidget));
      this._chatArtifactsWidget.value = widget;
      dom.clearNode(this.chatArtifactsWidgetContainer);
      widget.attachTo(this.chatArtifactsWidgetContainer);
    }
    this._chatArtifactsWidget.value.setSessionResource(chatSessionResource);
  }
  clearArtifactsWidget() {
    this._chatArtifactsWidget.value?.setSessionResource(void 0);
  }
  renderQuestionCarousel(carousel, context, options) {
    const carouselKey = carousel.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ""}_${context.contentIndex}`;
    const existing = this._chatQuestionCarouselWidgets.get(carouselKey);
    if (existing) {
      return existing;
    }
    if (isResponseVM(context.element)) {
      this._questionCarouselResponseIds.set(carouselKey, context.element.requestId);
      this._questionCarouselSessionResources.set(carouselKey, context.element.sessionResource);
    }
    const part = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, options);
    this._chatQuestionCarouselWidgets.set(carouselKey, part);
    this._hasQuestionCarouselContextKey?.set(true);
    dom.append(this.chatQuestionCarouselContainer, part.domNode);
    return part;
  }
  clearQuestionCarousel(responseId, resolveId) {
    if (resolveId !== void 0) {
      const part = this._chatQuestionCarouselWidgets.get(resolveId);
      if (part) {
        part.domNode.remove();
        this._chatQuestionCarouselWidgets.deleteAndDispose(resolveId);
      }
      this._questionCarouselResponseIds.delete(resolveId);
      this._questionCarouselSessionResources.delete(resolveId);
    } else if (responseId !== void 0) {
      for (const [key, rid] of this._questionCarouselResponseIds) {
        if (rid === responseId) {
          const part = this._chatQuestionCarouselWidgets.get(key);
          if (part) {
            part.domNode.remove();
            this._chatQuestionCarouselWidgets.deleteAndDispose(key);
          }
          this._questionCarouselResponseIds.delete(key);
          this._questionCarouselSessionResources.delete(key);
        }
      }
    } else {
      this._chatQuestionCarouselWidgets.clearAndDisposeAll();
      this._questionCarouselResponseIds.clear();
      this._questionCarouselSessionResources.clear();
      dom.clearNode(this.chatQuestionCarouselContainer);
    }
    this._hasQuestionCarouselContextKey?.set(this._chatQuestionCarouselWidgets.size > 0);
  }
  get questionCarousel() {
    for (const part of this._chatQuestionCarouselWidgets.values()) {
      if (part.hasFocus()) {
        return part;
      }
    }
    return this._chatQuestionCarouselWidgets.size > 0 ? this._chatQuestionCarouselWidgets.values().next().value : void 0;
  }
  focusQuestionCarousel() {
    const carousel = this.questionCarousel;
    if (carousel) {
      carousel.focus();
      return true;
    }
    return false;
  }
  isQuestionCarouselFocused() {
    for (const part of this._chatQuestionCarouselWidgets.values()) {
      if (part.hasFocus()) {
        return true;
      }
    }
    return false;
  }
  navigateToPreviousQuestion() {
    const carousel = this.questionCarousel;
    return carousel?.navigateToPreviousQuestion() ?? false;
  }
  navigateToNextQuestion() {
    const carousel = this.questionCarousel;
    return carousel?.navigateToNextQuestion() ?? false;
  }
  focusQuestionCarouselTerminal() {
    const carousel = this.questionCarousel;
    return carousel?.focusTerminal() ?? false;
  }
  // --- Plan Review ---
  renderPlanReview(review, context, options) {
    const key = review.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ""}_${context.contentIndex}`;
    const existing = this._chatPlanReviewWidgets.get(key);
    if (existing) {
      return existing;
    }
    if (isResponseVM(context.element)) {
      this._planReviewResponseIds.set(key, context.element.requestId);
      this._planReviewSessionResources.set(key, context.element.sessionResource);
    }
    const part = this.instantiationService.createInstance(ChatPlanReviewPart, review, context, options);
    this._chatPlanReviewWidgets.set(key, part);
    dom.append(this.chatPlanReviewContainer, part.domNode);
    return part;
  }
  clearPlanReview(responseId, resolveId) {
    if (resolveId !== void 0) {
      const part = this._chatPlanReviewWidgets.get(resolveId);
      if (part) {
        part.domNode.remove();
        this._chatPlanReviewWidgets.deleteAndDispose(resolveId);
      }
      this._planReviewResponseIds.delete(resolveId);
      this._planReviewSessionResources.delete(resolveId);
    } else if (responseId !== void 0) {
      for (const [key, rid] of this._planReviewResponseIds) {
        if (rid === responseId) {
          const part = this._chatPlanReviewWidgets.get(key);
          if (part) {
            part.domNode.remove();
            this._chatPlanReviewWidgets.deleteAndDispose(key);
          }
          this._planReviewResponseIds.delete(key);
          this._planReviewSessionResources.delete(key);
        }
      }
    } else {
      this._chatPlanReviewWidgets.clearAndDisposeAll();
      this._planReviewResponseIds.clear();
      this._planReviewSessionResources.clear();
      dom.clearNode(this.chatPlanReviewContainer);
    }
  }
  get planReview() {
    return this._chatPlanReviewWidgets.size > 0 ? this._chatPlanReviewWidgets.values().next().value : void 0;
  }
  // --- Tool Confirmation Carousel ---
  get _currentSessionKey() {
    return this._widget?.viewModel?.model.sessionResource.toString();
  }
  get _currentToolConfirmationCarousel() {
    const key = this._currentSessionKey;
    return key ? this._chatToolConfirmationCarousels.get(key) : void 0;
  }
  renderToolConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    const existing = this._currentToolConfirmationCarousel;
    if (existing) {
      existing.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
      this.updateToolConfirmationCarouselMaxHeight();
      return existing;
    }
    const key = this._currentSessionKey;
    if (!key) {
      throw new Error("Cannot render tool confirmation carousel without an active session");
    }
    const part = new ChatToolConfirmationCarouselPart(factory, [], revealSubagent, revealSubagentLabel, subAgentInvocationId, agentName);
    part.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
    this._chatToolConfirmationCarousels.set(key, part);
    const capturedKey = key;
    this._register(part.onDidChangeActiveSubagent((id) => {
      if (this._currentSessionKey === capturedKey) {
        this._onDidChangeActiveConfirmationSubagent.fire(id);
      }
    }));
    if (this._currentSessionKey === capturedKey) {
      this._onDidChangeActiveConfirmationSubagent.fire(part.activeSubAgentInvocationId);
    }
    dom.append(this.chatToolConfirmationCarouselContainer, part.domNode);
    dom.show(this.chatToolConfirmationCarouselContainer);
    this.updateToolConfirmationCarouselMaxHeight();
    this._register(Event.once(part.onDidEmpty)(() => {
      this._chatToolConfirmationCarousels.deleteAndDispose(capturedKey);
      if (this._currentSessionKey === capturedKey) {
        this._onDidChangeActiveConfirmationSubagent.fire(void 0);
        dom.clearNode(this.chatToolConfirmationCarouselContainer);
        dom.hide(this.chatToolConfirmationCarouselContainer);
      }
    }));
    return part;
  }
  addToolToConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    const existing = this._currentToolConfirmationCarousel;
    if (existing) {
      existing.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
      this.updateToolConfirmationCarouselMaxHeight();
    } else {
      this.renderToolConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
    }
  }
  get activeConfirmationSubagentId() {
    return this._currentToolConfirmationCarousel?.activeSubAgentInvocationId;
  }
  /**
   * Navigates the carousel to the first pending tool from the given subagent.
   */
  activateCarouselForSubagent(subAgentInvocationId) {
    this._currentToolConfirmationCarousel?.activateFirstToolForSubagent(subAgentInvocationId);
  }
  hasToolInConfirmationCarousel(toolCallId) {
    return this._currentToolConfirmationCarousel?.hasToolInvocation(toolCallId) ?? false;
  }
  get hasActiveToolConfirmationCarousel() {
    const carousel = this._currentToolConfirmationCarousel;
    return !!carousel && carousel.pendingCount > 0;
  }
  clearToolConfirmationCarousel() {
    const key = this._currentSessionKey;
    if (key) {
      this._chatToolConfirmationCarousels.deleteAndDispose(key);
    }
    this._onDidChangeActiveConfirmationSubagent.fire(void 0);
    dom.clearNode(this.chatToolConfirmationCarouselContainer);
    dom.hide(this.chatToolConfirmationCarouselContainer);
  }
  /**
   * Swaps the visible tool confirmation carousel when switching sessions.
   */
  _syncToolConfirmationCarouselForSession() {
    dom.clearNode(this.chatToolConfirmationCarouselContainer);
    const carousel = this._currentToolConfirmationCarousel;
    if (carousel && carousel.pendingCount > 0) {
      dom.append(this.chatToolConfirmationCarouselContainer, carousel.domNode);
      dom.show(this.chatToolConfirmationCarouselContainer);
      this.updateToolConfirmationCarouselMaxHeight();
    } else {
      dom.hide(this.chatToolConfirmationCarouselContainer);
    }
    this._onDidChangeActiveConfirmationSubagent.fire(carousel?.activeSubAgentInvocationId);
  }
  setWorkingSetCollapsed(collapsed) {
    this._workingSetCollapsed.set(collapsed, void 0);
  }
  renderChatEditingSessionState(chatEditingSession) {
    this.setChatEditingSessionVisible(Boolean(chatEditingSession));
    if (chatEditingSession) {
      if (!isEqual(chatEditingSession.chatSessionResource, this._lastEditingSessionResource)) {
        this._workingSetCollapsed.set(true, void 0);
      }
      this._lastEditingSessionResource = chatEditingSession.chatSessionResource;
    }
    const modifiedEntries = derivedOpts({ equalsFn: arraysEqual }, (r) => {
      const sessionResource = chatEditingSession?.chatSessionResource ?? this._widget?.viewModel?.model.sessionResource;
      if (sessionResource && getChatSessionType(sessionResource) === AgentSessionProviders.Background) {
        return [];
      }
      return chatEditingSession?.entries.read(r).filter((entry) => entry.state.read(r) === ModifiedFileEntryState.Modified) || [];
    });
    const editSessionEntries = derived((reader) => {
      const seenEntries = new ResourceSet();
      const entries = [];
      for (const entry of modifiedEntries.read(reader)) {
        if (entry.state.read(reader) !== ModifiedFileEntryState.Modified) {
          continue;
        }
        if (!seenEntries.has(entry.modifiedURI)) {
          seenEntries.add(entry.modifiedURI);
          const linesAdded = entry.linesAdded?.read(reader);
          const linesRemoved = entry.linesRemoved?.read(reader);
          entries.push({
            reference: entry.modifiedURI,
            state: ModifiedFileEntryState.Modified,
            kind: "reference",
            options: {
              status: void 0,
              diffMeta: { added: linesAdded ?? 0, removed: linesRemoved ?? 0 },
              isDeletion: !!entry.isDeletion,
              originalUri: entry.isDeletion ? entry.originalURI : void 0
            }
          });
        }
      }
      entries.sort((a, b) => {
        if (a.kind === "reference" && b.kind === "reference") {
          if (a.state === b.state || a.state === void 0 || b.state === void 0) {
            return a.reference.toString().localeCompare(b.reference.toString());
          }
          return a.state - b.state;
        }
        return 0;
      });
      return entries;
    });
    const sessionFileChanges = observableFromEvent(
      this,
      this.agentSessionsService.model.onDidChangeSessions,
      () => {
        const sessionResource = this._widget?.viewModel?.model?.sessionResource;
        if (!sessionResource) {
          return Iterable.empty();
        }
        const model = this.agentSessionsService.getSession(sessionResource);
        return model?.changes instanceof Array ? model.changes : Iterable.empty();
      }
    );
    const sessionFiles = derived(
      (reader) => sessionFileChanges.read(reader).map((entry) => ({
        reference: isIChatSessionFileChange2(entry) ? entry.modifiedUri ?? entry.uri : entry.modifiedUri,
        state: ModifiedFileEntryState.Accepted,
        kind: "reference",
        options: {
          diffMeta: { added: entry.insertions, removed: entry.deletions },
          isDeletion: entry.modifiedUri === void 0,
          originalUri: entry.originalUri,
          status: void 0
        }
      }))
    );
    const shouldRender = derived((reader) => editSessionEntries.read(reader).length > 0 || sessionFiles.read(reader).length > 0);
    this._renderingChatEdits.value = autorun((reader) => {
      if (this.options.renderWorkingSet && shouldRender.read(reader)) {
        this.renderChatEditingSessionWithEntries(
          reader.store,
          chatEditingSession,
          editSessionEntries,
          sessionFiles
        );
      } else {
        dom.clearNode(this.chatEditingSessionWidgetContainer);
        this._chatEditsDisposables.clear();
        this._chatEditList = void 0;
        this.setChatEditingSessionVisible(false);
      }
    });
  }
  /** Show or hide the working set, and report the same to the stack. */
  setChatEditingSessionVisible(visible) {
    dom.setVisibility(visible, this.chatEditingSessionWidgetContainer);
    setChatInputStackSlot(this.chatEditingSessionWidgetContainer, visible ? ChatInputStackSlot.Docked : ChatInputStackSlot.Empty);
  }
  renderChatEditingSessionWithEntries(store, chatEditingSession, editSessionEntriesObs, sessionEntriesObs) {
    const innerContainer = this.chatEditingSessionWidgetContainer.querySelector(".chat-editing-session-container.show-file-icons") ?? dom.append(this.chatEditingSessionWidgetContainer, $(".chat-editing-session-container.show-file-icons"));
    const overviewRegion = innerContainer.querySelector(".chat-editing-session-overview") ?? dom.append(innerContainer, $(".chat-editing-session-overview"));
    const overviewTitle = overviewRegion.querySelector(".working-set-title") ?? dom.append(overviewRegion, $(".working-set-title"));
    this._chatEditsActionsDisposables.clear();
    const actionsContainer = overviewRegion.querySelector(".chat-editing-session-actions") ?? dom.append(overviewRegion, $(".chat-editing-session-actions"));
    const sessionResource = chatEditingSession?.chatSessionResource || this._widget?.viewModel?.model.sessionResource;
    const scopedContextKeyService = this._chatEditsActionsDisposables.add(this.contextKeyService.createScoped(actionsContainer));
    if (sessionResource) {
      scopedContextKeyService.createKey(ChatContextKeys.agentSessionType.key, getChatSessionType(sessionResource));
      const sessionPullRequest = observableFromEvent(
        this,
        this.agentSessionsService.model.onDidChangeSessions,
        () => {
          const session = this.agentSessionsService.getSession(sessionResource);
          return session ? getAgentSessionPullRequestContextValue(session) : "";
        }
      );
      this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.agentSessionPullRequest, scopedContextKeyService, (r) => sessionPullRequest.read(r)));
    }
    this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, (r) => !!sessionEntriesObs.read(r)?.length));
    const scopedInstantiationService = this._chatEditsActionsDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
    const workingSetContainer = innerContainer.querySelector(".chat-editing-session-list") ?? dom.append(innerContainer, $(".chat-editing-session-list"));
    const button = this._chatEditsActionsDisposables.add(new ButtonWithIcon(overviewTitle, {
      supportIcons: true,
      secondary: true,
      ariaLabel: localize("chatEditingSession.toggleWorkingSet", "Toggle changed files.")
    }));
    const topLevelStats = derived((reader) => {
      const entries = editSessionEntriesObs.read(reader);
      const sessionEntries = sessionEntriesObs.read(reader);
      let added = 0, removed = 0;
      if (entries.length > 0) {
        for (const entry of entries) {
          if (entry.kind === "reference" && entry.options?.diffMeta) {
            added += entry.options.diffMeta.added;
            removed += entry.options.diffMeta.removed;
          }
        }
      } else {
        for (const entry of sessionEntries) {
          if (entry.kind === "reference" && entry.options?.diffMeta) {
            added += entry.options.diffMeta.added;
            removed += entry.options.diffMeta.removed;
          }
        }
      }
      const files = entries.length > 0 ? entries.length : sessionEntries.length;
      const topLevelIsSessionMenu2 = entries.length === 0 && sessionEntries.length > 0;
      const shouldShowEditingSession = entries.length > 0 || sessionEntries.length > 0;
      return { files, added, removed, shouldShowEditingSession, topLevelIsSessionMenu: topLevelIsSessionMenu2 };
    });
    const topLevelIsSessionMenu = topLevelStats.map((t) => t.topLevelIsSessionMenu);
    store.add(autorun((reader) => {
      const isSessionMenu = topLevelIsSessionMenu.read(reader);
      reader.store.add(scopedInstantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, isSessionMenu ? MenuId.ChatEditingSessionChangesToolbar : MenuId.ChatEditingWidgetToolbar, {
        telemetrySource: this.options.menus.telemetrySource,
        small: true,
        menuOptions: sessionResource ? isSessionMenu ? {
          args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata]
        } : {
          arg: {
            $mid: MarshalledId.ChatViewContext,
            sessionResource
          }
        } : void 0,
        disableWhileRunning: isSessionMenu,
        buttonConfigProvider: (action) => {
          if (action.id === ChatEditingShowChangesAction.ID || action.id === ViewPreviousEditsAction.Id) {
            return { showIcon: true, showLabel: false, isSecondary: true };
          }
          if (action.id === "github.copilot.chat.cloudSessions.openPullRequestForTask") {
            return { showIcon: true, showLabel: false };
          }
          return void 0;
        }
      }));
    }));
    store.add(autorun((reader) => {
      const { files, added, removed, shouldShowEditingSession } = topLevelStats.read(reader);
      const buttonLabel = files === 1 ? localize("chatEditingSession.oneFile", "1 file changed") : localize("chatEditingSession.manyFiles", "{0} files changed", files);
      button.label = buttonLabel;
      button.element.setAttribute("aria-label", localize("chatEditingSession.ariaLabelWithCounts", "{0}, {1} lines added, {2} lines removed", buttonLabel, added, removed));
      this._workingSetLinesAddedSpan.value.textContent = `+${added}`;
      this._workingSetLinesRemovedSpan.value.textContent = `-${removed}`;
      this.setChatEditingSessionVisible(shouldShowEditingSession);
    }));
    const countsContainer = dom.$(".working-set-line-counts");
    button.element.appendChild(countsContainer);
    countsContainer.appendChild(this._workingSetLinesAddedSpan.value);
    countsContainer.appendChild(this._workingSetLinesRemovedSpan.value);
    const toggleWorkingSet = () => {
      this._workingSetCollapsed.set(!this._workingSetCollapsed.get(), void 0);
    };
    this._chatEditsActionsDisposables.add(button.onDidClick(toggleWorkingSet));
    this._chatEditsActionsDisposables.add(addDisposableListener(overviewRegion, "click", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target.closest(".monaco-button")) {
        return;
      }
      toggleWorkingSet();
    }));
    this._chatEditsActionsDisposables.add(autorun((reader) => {
      const collapsed = this._workingSetCollapsed.read(reader);
      button.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      workingSetContainer.classList.toggle("collapsed", collapsed);
    }));
    if (!this._chatEditList) {
      this._chatEditList = this._chatEditsListPool.get();
      const list = this._chatEditList.object;
      this._chatEditsDisposables.add(this._chatEditList);
      this._chatEditsDisposables.add(list.onDidFocus(() => {
        this._onDidFocus.fire();
      }));
      this._chatEditsDisposables.add(list.onDidOpen(async (e) => {
        if (e.element?.kind === "reference" && URI.isUri(e.element.reference)) {
          const modifiedFileUri = e.element.reference;
          const originalUri = e.element.options?.originalUri;
          if (e.element.options?.isDeletion && originalUri) {
            await this.editorService.openEditor({
              resource: originalUri,
              // instead of modified, because modified will not exist
              options: e.editorOptions
            }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
            return;
          }
          if (originalUri) {
            await this.editorService.openEditor({
              original: { resource: originalUri },
              modified: { resource: modifiedFileUri },
              options: e.editorOptions
            }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
            return;
          }
          const entry = chatEditingSession?.getEntry(modifiedFileUri);
          const pane = await this.editorService.openEditor({
            resource: modifiedFileUri,
            options: e.editorOptions
          }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
          if (pane) {
            entry?.getEditorIntegration(pane).reveal(true, e.editorOptions.preserveFocus);
          }
        }
      }));
      this._chatEditsDisposables.add(addDisposableListener(list.getHTMLElement(), "click", (e) => {
        if (!this.hasFocus()) {
          this._onDidFocus.fire();
        }
      }, true));
      dom.append(workingSetContainer, list.getHTMLElement());
      dom.append(innerContainer, workingSetContainer);
    }
    store.add(autorun((reader) => {
      const editEntries = editSessionEntriesObs.read(reader);
      const sessionFileEntries = sessionEntriesObs.read(reader);
      const allEntries = editEntries.concat(sessionFileEntries);
      const maxItemsShown = 6;
      const itemsShown = Math.min(allEntries.length, maxItemsShown);
      const height = itemsShown * 22;
      const list = this._chatEditList.object;
      list.layout(height);
      list.getHTMLElement().style.height = `${height}px`;
      list.splice(0, list.length, allEntries);
      workingSetContainer.classList.toggle("overflowing", allEntries.length > maxItemsShown);
    }));
  }
  async renderFollowups(items, response) {
    if (!this.options.renderFollowups) {
      return;
    }
    this.followupsDisposables.clear();
    dom.clearNode(this.followupsContainer);
    if (items && items.length > 0) {
      this.followupsDisposables.add(this.instantiationService.createInstance(ChatFollowups, this.followupsContainer, items, this.location, void 0, (followup) => this._onDidAcceptFollowup.fire({ followup, response })));
    }
  }
  /**
   * Sets the maximum height budget for the input part. The editor height will be
   * clamped so it does not grow beyond what this budget allows after accounting
   * for non-editor chrome such as attachments, toolbars, and widgets.
   */
  setMaxHeight(maxHeight) {
    this._maxHeight = maxHeight;
    this.updateToolConfirmationCarouselMaxHeight();
  }
  updateToolConfirmationCarouselMaxHeight() {
    const carousel = this._currentToolConfirmationCarousel;
    if (!carousel) {
      return;
    }
    if (this._maxHeight === void 0) {
      carousel.setMaxHeight(void 0);
      return;
    }
    const carouselHeight = this.chatToolConfirmationCarouselContainer.offsetHeight;
    const otherInputHeight = Math.max(0, this.container.offsetHeight - carouselHeight);
    carousel.setMaxHeight(this._maxHeight - otherInputHeight);
  }
  /**
   * Layout the input part with the given width. Height is intrinsic - determined by content
   * and detected via ResizeObserver, which updates `inputPartHeight` for the parent to observe.
   */
  layout(width) {
    this.cachedWidth = width;
    this._stableInputPartWidth.set(width, void 0);
    this._updateWorkingProgressAnimationDuration(width);
    return this._layout(width);
  }
  _updateWorkingProgressAnimationDuration(width) {
    if (!this.inputContainer) {
      return;
    }
    const MIN_DURATION_S = 1.4;
    const MAX_DURATION_S = 2.5;
    const safeWidth = Math.max(50, width);
    const raw = 0.55 + 0.075 * Math.sqrt(safeWidth);
    const duration = Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, raw));
    if (this._lastAnimDurationS !== void 0 && Math.abs(this._lastAnimDurationS - duration) < 0.05) {
      return;
    }
    this._lastAnimDurationS = duration;
    this.inputContainer.style.setProperty("--chat-input-anim-duration", `${duration.toFixed(2)}s`);
    if (this.inputContainer.classList.contains("working")) {
      const inputContainer = this.inputContainer;
      inputContainer.classList.add("chat-input-anim-restart");
      dom.scheduleAtNextAnimationFrame(dom.getWindow(inputContainer), () => {
        inputContainer.classList.remove("chat-input-anim-restart");
      });
    }
  }
  get _effectiveInputEditorMaxHeight() {
    if (this._maxHeight === void 0) {
      return this.inputEditorMaxHeight;
    }
    const currentEditorHeight = this.previousInputEditorDimension?.height ?? 0;
    const nonEditorHeight = Math.max(0, this.height.get() - currentEditorHeight);
    const budgetForEditor = this._maxHeight - nonEditorHeight;
    const minEditorHeight = this.inputEditorMinHeight ?? this.singleLineInputEditorHeight;
    return Math.max(minEditorHeight, Math.min(this.inputEditorMaxHeight, Math.max(0, budgetForEditor)));
  }
  _layout(width, allowRecurse = true) {
    const data = this.getLayoutData();
    const followupsWidth = width - data.inputPartHorizontalPadding;
    this.followupsContainer.style.width = `${followupsWidth}px`;
    const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
    const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.inputPartHorizontalPaddingInside - data.toolbarsWidth - data.sideToolbarWidth;
    const effectiveMaxHeight = this._effectiveInputEditorMaxHeight;
    const clampedContentHeight = Math.min(this._inputEditor.getContentHeight(), effectiveMaxHeight);
    const inputEditorHeight = this.inputEditorMinHeight ? Math.min(Math.max(this.inputEditorMinHeight, clampedContentHeight), effectiveMaxHeight) : clampedContentHeight;
    const newDimension = { width: newEditorWidth, height: inputEditorHeight };
    if (!this.previousInputEditorDimension || (this.previousInputEditorDimension.width !== newDimension.width || this.previousInputEditorDimension.height !== newDimension.height)) {
      this._inputEditor.layout(newDimension);
      this.previousInputEditorDimension = newDimension;
    }
    if (allowRecurse && initialEditorScrollWidth < 10) {
      return this._layout(width, false);
    }
  }
  getLayoutData() {
    const inputSideToolbarWidth = this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) : 0;
    const getToolbarsWidthCompact = () => {
      const toolbarItemGap = 4;
      const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
      const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
      const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * toolbarItemGap;
      const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * toolbarItemGap : 0;
      const contextUsageWidth = dom.getTotalWidth(this.contextUsageWidgetContainer);
      const inputToolbarsPadding = 12;
      return executeToolbarWidth + executeToolbarPadding + contextUsageWidth + (this.options.renderInputToolbarBelowInput ? 0 : inputToolbarWidth + inputToolbarPadding + inputToolbarsPadding);
    };
    return {
      editorBorder: 2,
      // The sessions window pads `.interactive-input-part` by 32px on each side
      // (vs the default 12px margin) so the input box aligns with the chat
      // content cards. The editor width is computed here, so it must account
      // for the same 64px total horizontal gutter or the editor overflows its
      // container and renders wider than the message content above it.
      inputPartHorizontalPadding: this.options.inputPartHorizontalPadding ?? (this.options.renderStyle === "compact" ? 16 : this.options.isSessionsWindow ? 64 : 24),
      inputPartHorizontalPaddingInside: this.options.renderStyle === "compact" ? 12 : 10,
      toolbarsWidth: this.options.renderStyle === "compact" ? getToolbarsWidthCompact() : 0,
      sideToolbarWidth: inputSideToolbarWidth > 0 ? inputSideToolbarWidth + 4 : 0
    };
  }
  /**
   * Gets the location of the chat widget and whether that location is maximized.
   */
  getWidgetLocationInfo(widget) {
    if (isIChatResourceViewContext(widget.viewContext)) {
      return { location: "editor" /* Editor */, isMaximized: false };
    }
    if (isIChatViewViewContext(widget.viewContext)) {
      const viewLocation = this.viewDescriptorService.getViewLocationById(widget.viewContext.viewId);
      const sideBarPosition = this.layoutService.getSideBarPosition();
      switch (viewLocation) {
        case ViewContainerLocation.Panel:
          return {
            location: "panel" /* Panel */,
            isMaximized: this.layoutService.isPanelMaximized()
          };
        case ViewContainerLocation.AuxiliaryBar:
          return {
            location: sideBarPosition === Position.LEFT ? "sidebarRight" /* SidebarRight */ : "sidebarLeft" /* SidebarLeft */,
            isMaximized: this.layoutService.isAuxiliaryBarMaximized()
          };
        case ViewContainerLocation.Sidebar:
        default:
          return {
            location: sideBarPosition === Position.LEFT ? "sidebarLeft" /* SidebarLeft */ : "sidebarRight" /* SidebarRight */,
            isMaximized: false
          };
      }
    }
    return { location: "editor" /* Editor */, isMaximized: false };
  }
  getDefaultScrollbarOptions() {
    const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
    return this.options.renderStyle === "compact" ? { ...scrollbar, vertical: "hidden" } : { ...scrollbar, vertical: "auto", verticalScrollbarSize: 7 };
  }
  getVisibleScrollbarOptions() {
    const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
    return this.options.renderStyle === "compact" ? { ...scrollbar, vertical: "hidden" } : { ...scrollbar, vertical: "visible", verticalScrollbarSize: 7 };
  }
  updateInputEditorScrollbarOptions() {
    this._inputEditor.updateOptions({
      scrollbar: this._forceVisibleScrollbarUntilAccept ? this.getVisibleScrollbarOptions() : this.getDefaultScrollbarOptions()
    });
  }
  showScrollbarUntilAccept() {
    this._forceVisibleScrollbarUntilAccept = true;
    this.updateInputEditorScrollbarOptions();
  }
  resetScrollbarVisibilityAfterAccept() {
    if (!this._forceVisibleScrollbarUntilAccept) {
      return;
    }
    this._forceVisibleScrollbarUntilAccept = false;
    this.updateInputEditorScrollbarOptions();
  }
};
ChatInputPart._counter = 0;
ChatInputPart = __decorateClass([
  __decorateParam(4, IModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, ITextModelService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, IDialogService),
  __decorateParam(18, IChatAgentService),
  __decorateParam(19, ISharedWebContentExtractorService),
  __decorateParam(20, IChatEntitlementService),
  __decorateParam(21, IChatModeService),
  __decorateParam(22, ILanguageModelToolsService),
  __decorateParam(23, IChatSessionsService),
  __decorateParam(24, IChatContextService),
  __decorateParam(25, IAgentSessionsService),
  __decorateParam(26, IDictationOnboardingService),
  __decorateParam(27, IChatInputNoticeHubService),
  __decorateParam(28, IWorkspaceContextService),
  __decorateParam(29, ISCMService),
  __decorateParam(30, IWorkbenchLayoutService),
  __decorateParam(31, IViewDescriptorService),
  __decorateParam(32, IChatAttachmentWidgetRegistry),
  __decorateParam(33, IChatInputNotificationService),
  __decorateParam(34, IChatPhoneInputPresenter),
  __decorateParam(35, IProductService),
  __decorateParam(36, IVoiceModeOnboardingService),
  __decorateParam(37, IChatWidgetService),
  __decorateParam(38, IVoiceSessionController),
  __decorateParam(39, IChatService),
  __decorateParam(40, IWorkbenchEnvironmentService)
], ChatInputPart);
function getLastPosition(model) {
  return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
const chatInputEditorContainerSelector = ".interactive-input-editor";
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);
class ChatSessionPickersContainerActionItem extends ActionViewItem {
  constructor(action, widgets, options) {
    super(null, action, options ?? {});
    this.widgets = widgets;
  }
  render(container) {
    container.classList.add("chat-sessionPicker-container");
    for (const widget of this.widgets) {
      const itemContainer = dom.$(".action-item.chat-sessionPicker-item");
      widget.render(itemContainer);
      container.appendChild(itemContainer);
    }
  }
  dispose() {
    for (const widget of this.widgets) {
      widget.dispose();
    }
    super.dispose();
  }
}
class HiddenActionViewItem extends BaseActionViewItem {
  constructor(action) {
    super(void 0, action);
  }
  render(container) {
    super.render(container);
    container.style.display = "none";
  }
}
export {
  ChatInputPart,
  ChatWidgetLocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRk9OVF9GQU1JTFkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9udHMuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgaGFzTW9kaWZpZXJLZXlzLCBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSwgQmFzZUFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEJ1dHRvbldpdGhJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUFuY2hvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgYXJyYXlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9ucywgSUVkaXRvck9wdGlvbnMsIElFZGl0b3JTY3JvbGxiYXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IElEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IERyb3BJbnRvRWRpdG9yQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2Ryb3BJbnRvRWRpdG9yQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEdseXBoSG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9nbHlwaEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBMaW5rRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5rcy9icm93c2VyL2xpbmtzLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaEJ1dHRvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9idXR0b25iYXIuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBbmRDcmVhdGVIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjYW5Mb2csIElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVNZW1lbnRvLCBvYnNlcnZhYmxlTWVtZW50byB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL29ic2VydmFibGVNZW1lbnRvLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWdlbnRzVm9pY2UvYnJvd3Nlci92b2ljZU1vZGVPbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJDb250ZW50RXh0cmFjdG9yL2NvbW1vbi93ZWJDb250ZW50RXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU0NNU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLCBnZXRTaW1wbGVFZGl0b3JPcHRpb25zLCBzZXR1cFNpbXBsZUVkaXRvclNlbGVjdGlvblN0eWxpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgZ2V0SW1hZ2VBdHRhY2htZW50TGltaXQsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzUGFzdGVkVGV4dEFydGlmYWN0LCBpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5LCBpc0Jyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSwgaXNFbGVtZW50VmFyaWFibGVFbnRyeSwgaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSwgaXNJbWFnZVZhcmlhYmxlRW50cnksIGlzTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5LCBpc1Bhc3RlVmFyaWFibGVFbnRyeSwgaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSwgaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSwgaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnksIGlzU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5LCBpc1N0cmluZ1ZhcmlhYmxlRW50cnksIE9taXR0ZWRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlLCBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVzLCBJQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEZvbGxvd3VwLCBJQ2hhdFBsYW5SZXZpZXcsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXAsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSwgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzQWdlbnRIb3N0VGFyZ2V0LCBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyLCBsb2NhbENoYXRTZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsLCBzdG9yZVNlbGVjdGVkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIENoYXRQZXJtaXNzaW9uTGV2ZWwsIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQsIGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0Q29uZmlnUG9saWN5LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1Nlc3Npb24sIElNb2RpZmllZEZpbGVFbnRyeSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlciwgSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSB9IGZyb20gJy4vY2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbENvbmZpZ3VyYXRpb25TdG9yZSB9IGZyb20gJy4vY2hhdE1vZGVsQ29uZmlndXJhdGlvblN0b3JlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzIH0gZnJvbSAnLi9jaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZVVudGl0bGVkSW5wdXRBdHRhY2htZW50cywgZGVzZXJpYWxpemVVbnRpdGxlZElucHV0U3RhdGUsIHNlcmlhbGl6ZVVudGl0bGVkSW5wdXRBdHRhY2htZW50cywgc2VyaWFsaXplVW50aXRsZWRJbnB1dFN0YXRlIH0gZnJvbSAnLi9jaGF0SW5wdXRTdGF0ZVBlcnNpc3RlbmNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFN0YXRlT3JpZ2luLCBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgSUNoYXRSZXF1ZXN0TW9kZUluZm8sIElDaGF0UmVxdWVzdE1vZGVsLCBJSW5wdXRNb2RlbCwgSUludGVuZGVkTW9kZWxIb2xkZXIsIEludGVuZGVkTW9kZWxTbG90LCBsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uLCBoYXNNb2RlbHNUYXJnZXRpbmdTZXNzaW9uLCBpc0NoYXRJbnB1dENvbnRlbnRTZW5kYWJsZSwgaXNNb2RlbEhpZGRlbkluUGlja2VyLCBpc05ld0NvbnZlcnNhdGlvbiwgbWVyZ2VNb2RlbHNXaXRoQ2FjaGUsIHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UgfSBmcm9tICcuL2NoYXRJbnB1dE1vZGVsVXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24sIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRIaXN0b3J5TmF2aWdhdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdTZXNzaW9uU3VibWl0QWN0aW9uLCBDaGF0U2Vzc2lvblByaW1hcnlQaWNrZXJBY3Rpb24sIENoYXRTdWJtaXRBY3Rpb24sIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQsIE9wZW5EZWxlZ2F0aW9uUGlja2VyQWN0aW9uLCBPcGVuTW9kZWxQaWNrZXJBY3Rpb24sIE9wZW5Nb2RlUGlja2VyQWN0aW9uLCBPcGVuUGVybWlzc2lvblBpY2tlckFjdGlvbiwgT3BlblNlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb24sIE9wZW5Xb3Jrc3BhY2VQaWNrZXJBY3Rpb24gfSBmcm9tICcuLi8uLi9hY3Rpb25zL2NoYXRFeGVjdXRlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24sIFZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRDb25uZWN0aW5nQWN0aW9uLCBDaGF0U3BlZWNoVG9UZXh0UHJlcGFyaW5nQWN0aW9uLCBUb2dnbGVDaGF0U3BlZWNoVG9UZXh0QWN0aW9uIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0U3BlZWNoVG9UZXh0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaWN0YXRpb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBEaWN0YXRpb25Eb3dubG9hZEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vc3BlZWNoVG9UZXh0L2RpY3RhdGlvbkRvd25sb2FkQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgbm90aWZ5RGljdGF0aW9uU3VibWl0dGVkIH0gZnJvbSAnLi4vLi4vc3BlZWNoVG9UZXh0L2RpY3RhdGlvblNlc3Npb24uanMnO1xuaW1wb3J0IHsgVm9pY2VNb2RlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi92b2ljZUNsaWVudC92b2ljZU1vZGVBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0Q29udGV4dFZhbHVlIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudE1vZGVsIH0gZnJvbSAnLi4vLi4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdENoYXRBdHRhY2htZW50V2lkZ2V0LCBFbGVtZW50Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIEZpbGVBdHRhY2htZW50V2lkZ2V0LCBJbWFnZUF0dGFjaG1lbnRXaWRnZXQsIEJyb3dzZXJWaWV3QXR0YWNobWVudFdpZGdldCwgTm90ZWJvb2tDZWxsT3V0cHV0Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIFBhc3RlQXR0YWNobWVudFdpZGdldCwgUHJvbXB0RmlsZUF0dGFjaG1lbnRXaWRnZXQsIFByb21wdFRleHRBdHRhY2htZW50V2lkZ2V0LCBTQ01IaXN0b3J5SXRlbUF0dGFjaG1lbnRXaWRnZXQsIFNDTUhpc3RvcnlJdGVtQ2hhbmdlQXR0YWNobWVudFdpZGdldCwgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUF0dGFjaG1lbnRXaWRnZXQsIFRlcm1pbmFsQ29tbWFuZEF0dGFjaG1lbnRXaWRnZXQsIFRvb2xTZXRPclRvb2xJdGVtQXR0YWNobWVudFdpZGdldCB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDaGF0SW1wbGljaXRDb250ZXh0cyB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRJbXBsaWNpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgSW1wbGljaXRDb250ZXh0QXR0YWNobWVudFdpZGdldCB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2ltcGxpY2l0Q29udGV4dEF0dGFjaG1lbnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja2VyRGVsZWdhdGUsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQsIElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlLCBpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCwgSVdvcmtzcGFjZVBpY2tlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1Nob3dDaGFuZ2VzQWN0aW9uLCBWaWV3UHJldmlvdXNFZGl0c0FjdGlvbiB9IGZyb20gJy4uLy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZXNpemVJbWFnZSB9IGZyb20gJy4uLy4uL2NoYXRJbWFnZVV0aWxzLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uUGlja2VyQWN0aW9uSXRlbSwgSUNoYXRTZXNzaW9uUGlja2VyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYXRJbnB1dFBpY2tlciwgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRIb3N0UGlja2VyUHJvcGVydHksIE9wZW5BZ2VudEhvc3RBdXRvQXBwcm92ZVBpY2tlckFjdGlvbiwgT3BlbkFnZW50SG9zdENvZGV4QXBwcm92YWxzUGlja2VyQWN0aW9uLCBPcGVuQWdlbnRIb3N0TW9kZVBpY2tlckFjdGlvbiwgT3BlbkFnZW50SG9zdFBlcm1pc3Npb25Nb2RlUGlja2VyQWN0aW9uLCBPcGVuQWdlbnRIb3N0Rm9sZGVyUGlja2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RHZW5lcmljQ29uZmlnQ2hpcHMgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RHZW5lcmljQ29uZmlnQ2hpcHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Rm9sZGVyUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEZvbGRlclBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSUNoYXRQaG9uZUlucHV0UHJlc2VudGVyLCBNb2JpbGVDaGF0SW5wdXRDb21iaW5lZFBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL2NoYXRQaG9uZUlucHV0UHJlc2VudGVyLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0Q29udHJpYi9jaGF0Q29udGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld1BhcnQsIElDaGF0UGxhblJldmlld1BhcnRPcHRpb25zIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UGxhblJldmlld1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxPcHRpb25zIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQsIFJldmVhbFN1YmFnZW50Q2FsbGJhY2ssIFRvb2xJbnZvY2F0aW9uUGFydEZhY3RvcnkgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbEludm9jYXRpb25QYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENvbGxhcHNpYmxlTGlzdFBvb2wsIElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMvY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9kb0xpc3RXaWRnZXQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NoYXRUb2RvTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0QXJ0aWZhY3RzV2lkZ2V0IH0gZnJvbSAnLi4vY2hhdEFydGlmYWN0c1dpZGdldC5qcyc7XG5pbXBvcnQgeyBoYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZSwgaXNUZXJtaW5hbENvbW1hbmRJbnB1dCwgaXNUZXJtaW5hbENvbW1hbmRQYXN0ZSBhcyBpc1Rlcm1pbmFsQ29tbWFuZFBhc3RlQ29udGVudCB9IGZyb20gJy4uLy4uL2NoYXRUZXJtaW5hbENvbW1hbmRQYXN0ZS5qcyc7XG5pbXBvcnQgeyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSBmcm9tICcuLi8uLi9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0RHJhZ0FuZERyb3AgfSBmcm9tICcuLi9jaGF0RHJhZ0FuZERyb3AuanMnO1xuaW1wb3J0IHsgQ2hhdEZvbGxvd3VwcyB9IGZyb20gJy4vY2hhdEZvbGxvd3Vwcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4vY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0R29hbEJhbm5lcldpZGdldCB9IGZyb20gJy4vY2hhdEdvYWxCYW5uZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi9jaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWNlSG9zdCwgQ2hhdElucHV0Tm90aWNlTGFuZSB9IGZyb20gJy4vY2hhdElucHV0Tm90aWNlSG9zdC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRJbnB1dE9uYm9hcmRpbmdIb3N0cyB9IGZyb20gJy4vY2hhdElucHV0T25ib2FyZGluZ0hvc3RzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0SW5wdXROb3RpY2VIdWIuanMnO1xuaW1wb3J0IHsgSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgfSBmcm9tICcuL2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgY2hhdElucHV0U3RhY2tDbGFzcywgY2hhdElucHV0U3RhY2tTbG90Q2xhc3MsIENoYXRJbnB1dFN0YWNrU2xvdCwgc2V0Q2hhdElucHV0U3RhY2tJbnB1dEZvY3VzZWQsIHNldENoYXRJbnB1dFN0YWNrU2xvdCB9IGZyb20gJy4vY2hhdElucHV0U3RhY2suanMnO1xuaW1wb3J0IHsgQ2hhdFNlbGVjdGVkVG9vbHMgfSBmcm9tICcuL2NoYXRTZWxlY3RlZFRvb2xzLmpzJztcbmltcG9ydCB7IERlbGVnYXRpb25TZXNzaW9uUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4vZGVsZWdhdGlvblNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IE1vZGVsUGlja2VyQWN0aW9uSXRlbSwgSU1vZGVsUGlja2VyRGVsZWdhdGUsIElNb2RlbFBpY2tlclByZXNlbnRhdGlvbk9wdGlvbnMgfSBmcm9tICcuL21vZGVsUGlja2VyL21vZGVsUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJTW9kZVBpY2tlckRlbGVnYXRlLCBpc01vZGVDb25zaWRlcmVkQnVpbHRJbiwgTW9kZVBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL21vZGVQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIFBlcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtIH0gZnJvbSAnLi9wZXJtaXNzaW9uUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVHlwZVBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL3Nlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL3dvcmtzcGFjZVBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRVc2FnZVdpZGdldCB9IGZyb20gJy4uLy4uL3dpZGdldEhvc3RzL3ZpZXdQYW5lL2NoYXRDb250ZXh0VXNhZ2VXaWRnZXQuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVUb29sc0FjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGxhY2Vob2xkZXJUZXh0L2Jyb3dzZXIvcGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBJTlBVVF9FRElUT1JfTUFYX0hFSUdIVCA9IDI1MDtcbmNvbnN0IElOUFVUX0VESVRPUl9MSU5FX0hFSUdIVCA9IDIwO1xuY29uc3QgSU5QVVRfRURJVE9SX1BBRERJTkcgPSB7IGNvbXBhY3Q6IHsgdG9wOiAyLCBib3R0b206IDIgfSwgZGVmYXVsdDogeyB0b3A6IDEyLCBib3R0b206IDEyIH0gfTtcbmNvbnN0IENhY2hlZExhbmd1YWdlTW9kZWxzS2V5ID0gJ2NoYXQuY2FjaGVkTGFuZ3VhZ2VNb2RlbHMudjInO1xuY29uc3QgQ0hBVF9JTlBVVF9QSUNLRVJfQ09MTEFQU0VfV0lEVEggPSAyODA7XG5jb25zdCBQRVJNSVNTSU9OX0xFVkVMX09QVElPTl9JRCA9ICdwZXJtaXNzaW9uTGV2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0SW5wdXRTdHlsZXMge1xuXHRvdmVybGF5QmFja2dyb3VuZDogc3RyaW5nO1xuXHRsaXN0Rm9yZWdyb3VuZDogc3RyaW5nO1xuXHRsaXN0QmFja2dyb3VuZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0SW5wdXRQYXJ0T3B0aW9ucyB7XG5cdGRlZmF1bHRNb2RlPzogSUNoYXRNb2RlO1xuXHRyZW5kZXJGb2xsb3d1cHM6IGJvb2xlYW47XG5cdHJlbmRlclN0eWxlPzogJ2NvbXBhY3QnO1xuXHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiBib29sZWFuO1xuXHRtZW51czoge1xuXHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQ7XG5cdFx0dGVsZW1ldHJ5U291cmNlOiBzdHJpbmc7XG5cdFx0aW5wdXRTaWRlVG9vbGJhcj86IE1lbnVJZDtcblx0fTtcblx0ZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZT86IEhUTUxFbGVtZW50O1xuXHRyZW5kZXJXb3JraW5nU2V0OiBib29sZWFuO1xuXHRlbmFibGVJbXBsaWNpdENvbnRleHQ/OiBib29sZWFuO1xuXHRzdXBwb3J0c0NoYW5naW5nTW9kZXM/OiBib29sZWFuO1xuXHRkbmRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0aW5wdXRFZGl0b3JNaW5MaW5lcz86IG51bWJlcjtcblx0aW5wdXRFZGl0b3JNYXhIZWlnaHQ/OiBudW1iZXI7XG5cdGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ/OiBib29sZWFuO1xuXHR3aWRnZXRWaWV3S2luZFRhZzogc3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgZGVsZWdhdGUgZm9yIHRoZSBzZXNzaW9uIHRhcmdldCBwaWNrZXIuXG5cdCAqIFdoZW4gcHJvdmlkZWQsIGFsbG93cyB0aGUgaW5wdXQgcGFydCB0byBtYWludGFpbiBpbmRlcGVuZGVudCBzdGF0ZSBmb3IgdGhlIHNlbGVjdGVkIHNlc3Npb24gdHlwZS5cblx0ICovXG5cdHNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU/OiBJU2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZTtcblx0LyoqIE92ZXJyaWRlIHRoZSB0ZW1wb3JhcnkgbW9kZWwncyBzZXNzaW9uIHR5cGUgZm9yIHJvdXRpbmctb25seSBzdXJmYWNlcy4gKi9cblx0bW9kZWxQaWNrZXJTZXNzaW9uVHlwZT86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGRlbGVnYXRlIGZvciB0aGUgd29ya3NwYWNlIHBpY2tlci5cblx0ICogV2hlbiBwcm92aWRlZCwgc2hvd3MgYSB3b3Jrc3BhY2UgcGlja2VyIGFsbG93aW5nIHVzZXJzIHRvIHNlbGVjdCBhIHRhcmdldCB3b3Jrc3BhY2Vcblx0ICogZm9yIHRoZWlyIGNoYXQgcmVxdWVzdC4gVGhpcyBpcyB1c2VmdWwgZm9yIGVtcHR5IHdpbmRvdyBjb250ZXh0cy5cblx0ICovXG5cdHdvcmtzcGFjZVBpY2tlckRlbGVnYXRlPzogSVdvcmtzcGFjZVBpY2tlckRlbGVnYXRlO1xuXHQvKipcblx0ICogT3B0aW9uYWwgYWN0aW9uIHZpZXcgaXRlbSBwcm92aWRlciBmb3IgaG9zdC1vd25lZCBzZWNvbmRhcnkgdG9vbGJhclxuXHQgKiBjaGlwcyByZWdpc3RlcmVkIG9uIHtAbGluayBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5fS4gVXNlZCBieSB0aGVcblx0ICogYXV0b21hdGlvbnMgZGlhbG9nIHNvIHBlci1pbnN0YW5jZSBzdGF0ZSBjYW4gc3RheSBvdXRzaWRlIHRoZSBzaGFyZWRcblx0ICogY2hhdCBpbnB1dCBwYXJ0IHdoaWxlIHN0aWxsIHVzaW5nIG1lbnUtZHJpdmVuIHJlbmRlcmluZy5cblx0ICovXG5cdHNlY29uZGFyeVRvb2xiYXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyPzogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucz86IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgdGhlIG1vZGUgcGlja2VyIGhpZGVzIGN1c3RvbSBhZ2VudHMgYW5kIG9ubHkgb2ZmZXJzIHRoZVxuXHQgKiBidWlsdC1pbiBtb2RlcyAoQWdlbnQgLyBBc2sgLyBFZGl0IC8gUGxhbiwgZ2F0ZWQgYnkgdGhlaXIgbm9ybWFsXG5cdCAqIHZpc2liaWxpdHkgcnVsZXMpLiBDdXN0b20tYWdlbnQgZGlzY292ZXJ5IGlzIHdvcmtzcGFjZS1zY29wZWQgYW5kXG5cdCAqIGRvZXNuJ3QgZm9sbG93IHRoZSBkaWFsb2cncyBmb2xkZXIgc2VsZWN0aW9uLCBzbyBzdXJmYWNpbmcgY3VzdG9tXG5cdCAqIGFnZW50cyB0aWVkIHRvIHRoZSB3b3JrYmVuY2gncyBvcGVuIGZvbGRlcnMgd291bGQgbWlzbGVhZCB0aGUgdXNlclxuXHQgKiB3aGVuIHNjaGVkdWxpbmcgYWdhaW5zdCBhIGRpZmZlcmVudCBmb2xkZXIuXG5cdCAqL1xuXHRoaWRlQ3VzdG9tQ2hhdE1vZGVzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgc3VwcHJlc3MgdGhlIGF1dG9ydW4gdGhhdCBzd2l0Y2hlcyB0aGUgY3VycmVudCBsYW5ndWFnZVxuXHQgKiBtb2RlbCB0byBhIG1vZGUncyBkZWNsYXJlZCBwcmVmZXJyZWQgbW9kZWwgKGBJQ2hhdE1vZGUubW9kZWxgKS5cblx0ICogVXNlZCBieSB0aGUgYXV0b21hdGlvbnMgZGlhbG9nIHNvIG9wZW5pbmcgXCJOZXcgQXV0b21hdGlvblwiIGFsd2F5c1xuXHQgKiBkZWZhdWx0cyB0byB0aGUgcGlja2VyJ3MgZGVmYXVsdCAoYXV0bykgcmVnYXJkbGVzcyBvZiB3aGljaCBtb2RlXG5cdCAqIHRoZSBkaWFsb2cgb3BlbnMgd2l0aC5cblx0ICpcblx0ICogVXNlci1pbml0aWF0ZWQgbW9kZWwgcGlja3MgKGNsaWNraW5nIHRoZSBtb2RlbCBwaWNrZXIsIGN5Y2xlXG5cdCAqIGtleWJpbmRpbmdzLCBldGMuKSBhcmUgdW5hZmZlY3RlZC5cblx0ICovXG5cdHN1cHByZXNzTW9kZVByZWZlcnJlZE1vZGVsPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgbW9kZWwgcGlja3MgdmlhIHRoZSBwaWNrZXIgZG8gbm90IHdyaXRlIHRvIGdsb2JhbCBzdG9yYWdlLlxuXHQgKiBOb3RlOiBgc3dpdGNoVG9OZXh0TW9kZWxgIGtleWJpbmRpbmdzIHN0aWxsIHBlcnNpc3QgZ2xvYmFsbHkuXG5cdCAqL1xuXHRzdXBwcmVzc01vZGVsUGVyc2lzdGVuY2U/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hldGhlciB3ZSBhcmUgcnVubmluZyBpbiB0aGUgc2Vzc2lvbnMgd2luZG93LlxuXHQgKiBXaGVuIHRydWUsIHRoZSBzZWNvbmRhcnkgdG9vbGJhciAocGVybWlzc2lvbnMgcGlja2VyKSBpcyBoaWRkZW4uXG5cdCAqL1xuXHRpc1Nlc3Npb25zV2luZG93PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRvdGFsIGhvcml6b250YWwgZ3V0dGVyIChpbiBwaXhlbHMpIHJlc2VydmVkIG91dHNpZGUgdGhlIGlucHV0IGJveCB3aGVuXG5cdCAqIGNvbXB1dGluZyB0aGUgZWRpdG9yIHdpZHRoLiBEZWZhdWx0cyBhY2NvdW50IGZvciB0aGUgYC5pbnRlcmFjdGl2ZS1pbnB1dC1wYXJ0YFxuXHQgKiBtYXJnaW4gdXNlZCBieSB0aGUgcGFuZWwvc2Vzc2lvbnMgY2hhdC4gSG9zdHMgdGhhdCBvdmVycmlkZSB0aGF0IG1hcmdpbiAoZS5nLlxuXHQgKiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nLCB3aGljaCByZW5kZXJzIHRoZSBjb21wb3NlciBmbHVzaCB3aXRoIGl0cyBmb3JtIGNvbHVtbilcblx0ICogY2FuIHBhc3MgYDBgIHNvIHRoZSBlZGl0b3IgZmlsbHMgdGhlIGJveCBhbmQgaXRzIHNjcm9sbGJhciBzaXRzIGF0IHRoZSBlZGdlLlxuXHQgKi9cblx0aW5wdXRQYXJ0SG9yaXpvbnRhbFBhZGRpbmc/OiBudW1iZXI7XG5cdG9uRGlkQ2hhbmdlTW9kZWxQaWNrZXJWaXNpYmlsaXR5PzogKHZpc2libGU6IGJvb2xlYW4pID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xuXHRpbnB1dFBpY2tlclBvc2l0aW9uPzogQW5jaG9yUG9zaXRpb24gfCAoKCkgPT4gQW5jaG9yUG9zaXRpb24pO1xuXHRpbnB1dFBpY2tlckNvbnRhaW5lcj86IEhUTUxFbGVtZW50IHwgKCgpID0+IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkKTtcblx0aW5wdXRQaWNrZXJBbmNob3I/OiAoYW5jaG9yOiBIVE1MRWxlbWVudCkgPT4gSFRNTEVsZW1lbnQgfCBJQW5jaG9yO1xuXHRpbnB1dFBpY2tlck9wZW5Pbk1vdXNlVXA/OiBib29sZWFuO1xuXHRjb250ZXh0UGlja2VyPzogSUNoYXRDb250ZXh0UGlja2VyRGVsZWdhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtpbmdTZXRFbnRyeSB7XG5cdHVyaTogVVJJO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0V2lkZ2V0TG9jYXRpb24ge1xuXHRTaWRlYmFyTGVmdCA9ICdzaWRlYmFyTGVmdCcsXG5cdFNpZGViYXJSaWdodCA9ICdzaWRlYmFyUmlnaHQnLFxuXHRQYW5lbCA9ICdwYW5lbCcsXG5cdEVkaXRvciA9ICdlZGl0b3InLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0V2lkZ2V0TG9jYXRpb25JbmZvIHtcblx0cmVhZG9ubHkgbG9jYXRpb246IENoYXRXaWRnZXRMb2NhdGlvbjtcblx0cmVhZG9ubHkgaXNNYXhpbWl6ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBpc1VzZXJJbml0aWF0ZWQ6IGJvb2xlYW47XG59XG5cbmNvbnN0IExFR0FDWV9TSEFSRURfSU5QVVRfU1RBVEVfVEFHUyA9IG5ldyBTZXQoWyd2aWV3JywgJ2VkaXRvcicsICdxdWljayddKTtcblxuZnVuY3Rpb24gZ2V0SW5wdXRTdGF0ZVN0b3JhZ2VLZXkod2lkZ2V0Vmlld0tpbmRUYWc6IHN0cmluZyk6IHN0cmluZyB7XG5cdC8vIExlZ2FjeSB0YWdzICh0aGUgb3JpZ2luYWwgY2hhdCBjb21wb3NlciBzdXJmYWNlcykgaGlzdG9yaWNhbGx5IHNoYXJlZFxuXHQvLyBhIHNpbmdsZSBzdG9yYWdlIGtleS4gS2VlcCB0aGVtIG9uIHRoYXQga2V5IHNvIHdlIGRvbid0IGludmFsaWRhdGVcblx0Ly8gZXhpc3RpbmcgdXNlciBkcmFmdHMuIE5ldyBzdXJmYWNlcyAoZS5nLiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nKSBnZXRcblx0Ly8gYSBwZXItdGFnIGtleSBzbyB0aGVpciBpbnB1dCBzdGF0ZSBkb2VzIG5vdCBibGVlZCBpbnRvIG9yIG91dCBvZiB0aGVcblx0Ly8gY2hhdCBjb21wb3Nlci5cblx0aWYgKExFR0FDWV9TSEFSRURfSU5QVVRfU1RBVEVfVEFHUy5oYXMod2lkZ2V0Vmlld0tpbmRUYWcpKSB7XG5cdFx0cmV0dXJuICdjaGF0LnVudGl0bGVkSW5wdXRTdGF0ZSc7XG5cdH1cblx0cmV0dXJuIGBjaGF0LnVudGl0bGVkSW5wdXRTdGF0ZS4ke3dpZGdldFZpZXdLaW5kVGFnfWA7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVtcHR5SW5wdXRTdGF0ZU1lbWVudG8od2lkZ2V0Vmlld0tpbmRUYWc6IHN0cmluZykge1xuXHRyZXR1cm4gb2JzZXJ2YWJsZU1lbWVudG88SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+KHtcblx0XHRkZWZhdWx0VmFsdWU6IHVuZGVmaW5lZCxcblx0XHRrZXk6IGdldElucHV0U3RhdGVTdG9yYWdlS2V5KHdpZGdldFZpZXdLaW5kVGFnKSxcblx0XHR0b1N0b3JhZ2U6IHNlcmlhbGl6ZVVudGl0bGVkSW5wdXRTdGF0ZSxcblx0XHRmcm9tU3RvcmFnZSh2YWx1ZSkge1xuXHRcdFx0Y29uc3Qgb2JqID0gZGVzZXJpYWxpemVVbnRpdGxlZElucHV0U3RhdGUodmFsdWUpO1xuXHRcdFx0aWYgKG9iai5zZWxlY3RlZE1vZGVsICYmICFvYmouc2VsZWN0ZWRNb2RlbC5tZXRhZGF0YS5pc0RlZmF1bHRGb3JMb2NhdGlvbikge1xuXHRcdFx0XHQvLyBNaWdyYXRlIG9sZCBgaXNEZWZhdWx0YCB0byBgaXNEZWZhdWx0Rm9yTG9jYXRpb25gXG5cdFx0XHRcdHR5cGUgT2xkSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgPSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSAmIHsgaXNEZWZhdWx0PzogYm9vbGVhbiB9O1xuXHRcdFx0XHRjb25zdCBvbGRJc0RlZmF1bHQgPSAob2JqLnNlbGVjdGVkTW9kZWwubWV0YWRhdGEgYXMgT2xkSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpLmlzRGVmYXVsdDtcblx0XHRcdFx0Y29uc3QgaXNEZWZhdWx0Rm9yTG9jYXRpb24gPSB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogQm9vbGVhbihvbGRJc0RlZmF1bHQpIH07XG5cdFx0XHRcdG1peGluKG9iai5zZWxlY3RlZE1vZGVsLm1ldGFkYXRhLCB7IGlzRGVmYXVsdEZvckxvY2F0aW9uOiBpc0RlZmF1bHRGb3JMb2NhdGlvbiB9IHNhdGlzZmllcyBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPik7XG5cdFx0XHRcdGRlbGV0ZSAob2JqLnNlbGVjdGVkTW9kZWwubWV0YWRhdGEgYXMgT2xkSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEpLmlzRGVmYXVsdDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fSxcblx0fSk7XG59XG5cbmNvbnN0IGVtcHR5SW5wdXRBdHRhY2htZW50cyA9IG9ic2VydmFibGVNZW1lbnRvPHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4oe1xuXHRkZWZhdWx0VmFsdWU6IFtdLFxuXHRrZXk6ICdjaGF0LnVudGl0bGVkSW5wdXRBdHRhY2htZW50cycsXG5cdHRvU3RvcmFnZTogc2VyaWFsaXplVW50aXRsZWRJbnB1dEF0dGFjaG1lbnRzLFxuXHRmcm9tU3RvcmFnZTogZGVzZXJpYWxpemVVbnRpdGxlZElucHV0QXR0YWNobWVudHMsXG59KTtcblxuZXhwb3J0IGNsYXNzIENoYXRJbnB1dFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IHtcblx0cHJpdmF0ZSBzdGF0aWMgX2NvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgX3dvcmtpbmdTZXRDb2xsYXBzZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2NoYXRJbnB1dFBhcnQud29ya2luZ1NldENvbGxhcHNlZCcsIHRydWUpO1xuXHRwcml2YXRlIF9zdGFibGVJbnB1dFBhcnRXaWR0aCA9IG9ic2VydmFibGVWYWx1ZSgnY2hhdElucHV0UGFydC5zdGFibGVJbnB1dFBhcnRXaWR0aCcsIDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0SW5wdXRUb2RvTGlzdFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0VG9kb0xpc3RXaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0QXJ0aWZhY3RzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRBcnRpZmFjdHNXaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENoYXRRdWVzdGlvbkNhcm91c2VsUGFydD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXN0aW9uQ2Fyb3VzZWxSZXNwb25zZUlkcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXN0aW9uQ2Fyb3VzZWxTZXNzaW9uUmVzb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0cHJpdmF0ZSBfaGFzUXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0UGxhblJldmlld1dpZGdldHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENoYXRQbGFuUmV2aWV3UGFydD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsYW5SZXZpZXdSZXNwb25zZUlkcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVDb25maXJtYXRpb25TdWJhZ2VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZyB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0RWRpdGluZ1RvZG9zRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9sYXN0RWRpdGluZ1Nlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkTG9hZElucHV0U3RhdGU6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcigpKTtcblx0cmVhZG9ubHkgb25EaWRMb2FkSW5wdXRTdGF0ZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZExvYWRJbnB1dFN0YXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sYmFyUmVsYXlvdXRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmNhY2hlZFdpZHRoID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jYWNoZWRXaWR0aCk7XG5cdFx0fVxuXHR9LCAwKSk7XG5cblx0cHJpdmF0ZSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRCbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQmx1cjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEJsdXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZW1vdmVkPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdOyBhZGRlZD86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZXh0OiBFdmVudDx7IHJlbW92ZWQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107IGFkZGVkPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQWNjZXB0Rm9sbG93dXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGZvbGxvd3VwOiBJQ2hhdEZvbGxvd3VwOyByZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB8IHVuZGVmaW5lZCB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRBY2NlcHRGb2xsb3d1cDogRXZlbnQ8eyBmb2xsb3d1cDogSUNoYXRGb2xsb3d1cDsgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfCB1bmRlZmluZWQgfT4gPSB0aGlzLl9vbkRpZEFjY2VwdEZvbGxvd3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2xpY2tPdmVybGF5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tPdmVybGF5OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2xpY2tPdmVybGF5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F0dGFjaG1lbnRNb2RlbDogQ2hhdEF0dGFjaG1lbnRNb2RlbDtcblx0cHJpdmF0ZSBfd2lkZ2V0PzogSUNoYXRXaWRnZXQ7XG5cdHB1YmxpYyBnZXQgYXR0YWNobWVudE1vZGVsKCk6IENoYXRBdHRhY2htZW50TW9kZWwge1xuXHRcdHJldHVybiB0aGlzLl9hdHRhY2htZW50TW9kZWw7XG5cdH1cblxuXHRyZWFkb25seSBzZWxlY3RlZFRvb2xzTW9kZWw6IENoYXRTZWxlY3RlZFRvb2xzO1xuXG5cdHB1YmxpYyBnZXRBdHRhY2hlZENvbnRleHQoKSB7XG5cdFx0Y29uc3QgY29udGV4dEFyciA9IG5ldyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KCk7XG5cdFx0Y29udGV4dEFyci5hZGQoLi4udGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMsIC4uLnRoaXMuY2hhdENvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUNvbnRleHRJdGVtcygpKTtcblx0XHRyZXR1cm4gY29udGV4dEFycjtcblx0fVxuXG5cdHB1YmxpYyBnZXRBdHRhY2hlZEFuZEltcGxpY2l0Q29udGV4dCgpOiBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0IHtcblxuXHRcdGNvbnN0IGNvbnRleHRBcnIgPSB0aGlzLmdldEF0dGFjaGVkQ29udGV4dCgpO1xuXG5cdFx0aWYgKHRoaXMuaW1wbGljaXRDb250ZXh0KSB7XG5cdFx0XHRjb25zdCBpbXBsaWNpdENoYXRWYXJpYWJsZXMgPSB0aGlzLmltcGxpY2l0Q29udGV4dC5lbmFibGVkQmFzZUVudHJpZXModGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignY2hhdC5pbXBsaWNpdENvbnRleHQuc3VnZ2VzdGVkQ29udGV4dCcpKTtcblx0XHRcdGNvbnRleHRBcnIuYWRkKC4uLmltcGxpY2l0Q2hhdFZhcmlhYmxlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0QXJyO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkOiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfaW5kZXhPZkxhc3RPcGVuZWRDb250ZXh0OiBudW1iZXIgPSAtMTtcblxuXHRwcml2YXRlIF9pbXBsaWNpdENvbnRleHQ6IENoYXRJbXBsaWNpdENvbnRleHRzIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGltcGxpY2l0Q29udGV4dCgpOiBDaGF0SW1wbGljaXRDb250ZXh0cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ltcGxpY2l0Q29udGV4dDtcblx0fVxuXG5cdHByaXZhdGUgX2hhc0ZpbGVBdHRhY2htZW50Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRSZXNvdXJjZUxhYmVsczogUmVzb3VyY2VMYWJlbHM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dEVkaXRvck1heEhlaWdodDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0RWRpdG9yTWluSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2luZ2xlTGluZUlucHV0RWRpdG9ySGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgaW5wdXRFZGl0b3JIZWlnaHQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX21heEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgaW5wdXRTaWRlVG9vbGJhckNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlY29uZGFyeVRvb2xiYXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWNvbmRhcnlUb29sYmFyITogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgc3RhdHVzVG9vbGJhckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHN0YXR1c1Rvb2xiYXIhOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblxuXHRwcml2YXRlIGZvbGxvd3Vwc0NvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGZvbGxvd3Vwc0Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgYXR0YWNobWVudHNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGNoYXRJbnB1dE92ZXJsYXkhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBvdmVybGF5Q2xpY2tMaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIGF0dGFjaGVkQ29udGV4dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGF0dGFjaGVkQ29udGV4dERpc3Bvc2FibGVzOiBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0cHJpdmF0ZSBjaGF0RWRpdGluZ1Nlc3Npb25XaWRnZXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjaGF0SW5wdXRUb2RvTGlzdFdpZGdldENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRBcnRpZmFjdHNXaWRnZXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRQbGFuUmV2aWV3Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRHb2FsQmFubmVyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcGVyc2lzdGVudENvbnRlbnRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBpbnB1dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlucHV0QW5kU2lkZVRvb2xiYXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dvYWxCYW5uZXJXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2hhdEdvYWxCYW5uZXJXaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc21pc3NHb2FsQmFubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKiBGaXJlZCB3aGVuIHRoZSB1c2VyIGRpc21pc3NlcyB0aGUgYXV0b3BpbG90IGdvYWwgYmFubmVyLiAqL1xuXHRyZWFkb25seSBvbkRpZERpc21pc3NHb2FsQmFubmVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRGlzbWlzc0dvYWxCYW5uZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjb250ZXh0VXNhZ2VXaWRnZXQ/OiBDaGF0Q29udGV4dFVzYWdlV2lkZ2V0O1xuXHRwcml2YXRlIGNvbnRleHRVc2FnZVdpZGdldENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0VXNhZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGdldCBpbnB1dENvbnRhaW5lckVsZW1lbnQoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmlucHV0Q29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGlucHV0Um93SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRBbmRTaWRlVG9vbGJhci5vZmZzZXRIZWlnaHQ7XG5cdH1cblxuXHRnZXQgcGVyc2lzdGVudENvbnRlbnRDb250YWluZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5wZXJzaXN0ZW50Q29udGVudENvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBnZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lckVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lcjtcblx0fVxuXG5cdC8qKiBBcmJpdHJhdGVzIHdoaWNoIG5vdGljZSBvY2N1cGllcyB0aGUgYXJlYSBhYm92ZSB0aGlzIGlucHV0LiAqL1xuXHRyZWFkb25seSBub3RpY2VIb3N0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENoYXRJbnB1dE5vdGljZUhvc3QoKCkgPT4gdGhpcy5mb2N1cygpKSk7XG5cblx0Z2V0Q2hhdFBldFBsYXRmb3JtVG9wKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgaW5wdXRUb3AgPSB0aGlzLmlucHV0Q29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRsZXQgY29udGFpbmVyID0gdGhpcy5jb250YWluZXI7XG5cdFx0bGV0IHByZXZpb3VzRWxlbWVudDogRWxlbWVudCB8IHVuZGVmaW5lZCA9IHRoaXMucGVyc2lzdGVudENvbnRlbnRDb250YWluZXI7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gQXJyYXkuZnJvbShjb250YWluZXIuY2hpbGRyZW4pO1xuXHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHByZXZpb3VzRWxlbWVudCA/IGNoaWxkcmVuLmluZGV4T2YocHJldmlvdXNFbGVtZW50KSArIDEgOiAwO1xuXHRcdFx0bGV0IG5lc3RlZENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IHN0YXJ0SW5kZXg7IGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gY2hpbGRyZW5baW5kZXhdO1xuXHRcdFx0XHRpZiAoIWRvbS5pc0hUTUxFbGVtZW50KGNoaWxkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjaGlsZCA9PT0gdGhpcy5pbnB1dENvbnRhaW5lcikge1xuXHRcdFx0XHRcdHJldHVybiBpbnB1dFRvcDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2hpbGQuY29udGFpbnModGhpcy5pbnB1dENvbnRhaW5lcikpIHtcblx0XHRcdFx0XHRuZXN0ZWRDb250YWluZXIgPSBjaGlsZDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBib3VuZHMgPSBjaGlsZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0aWYgKGJvdW5kcy5oZWlnaHQgPiAwICYmIGJvdW5kcy50b3AgPD0gaW5wdXRUb3ApIHtcblx0XHRcdFx0XHRyZXR1cm4gYm91bmRzLnRvcDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFuZXN0ZWRDb250YWluZXIpIHtcblx0XHRcdFx0cmV0dXJuIGlucHV0VG9wO1xuXHRcdFx0fVxuXHRcdFx0Y29udGFpbmVyID0gbmVzdGVkQ29udGFpbmVyO1xuXHRcdFx0cHJldmlvdXNFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJlYWRvbmx5IGhlaWdodCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KHRoaXMsIDApO1xuXG5cdHByaXZhdGUgX2lucHV0RWRpdG9yITogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfaW5wdXRFZGl0b3JFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2ZvcmNlVmlzaWJsZVNjcm9sbGJhclVudGlsQWNjZXB0ID0gZmFsc2U7XG5cblx0Ly8gUmVmZXJlbmNlIHRvIHRoZSBpbnB1dCBtb2RlbCBmb3Igc3luY2luZyBpbnB1dCBzdGF0ZVxuXHRwcml2YXRlIF9pbnB1dE1vZGVsOiBJSW5wdXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0Ly8gU2Vzc2lvbiByZXNvdXJjZSBvZiB0aGUgY3VycmVudGx5IGJvdW5kIF9pbnB1dE1vZGVsLiBVc2VkIGZvciBkaWFnbm9zdGljXG5cdC8vIGxvZ2dpbmcgc28gd2UgY2FuIGRldGVjdCB3cml0ZXMgdGhhdCB0YXJnZXQgYSBkaWZmZXJlbnQgc2Vzc2lvbiB0aGFuIHRoZVxuXHQvLyBvbmUgdGhlIHdpZGdldCB2aWV3TW9kZWwgaXMgY3VycmVudGx5IHNob3dpbmcgKGN5Y2xpYy1yZWYgd2luZG93KS5cblx0cHJpdmF0ZSBfaW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogU3BlYWtzIGZvciB0aGUgaW50ZW5kZWQgbW9kZWwgd2hpbGUgbm8gY29udmVyc2F0aW9uIGlzIGJvdW5kIFx1MjAxNCB0aGUgaW5saW5lIHJlcXVlc3QtZWRpdCBpbnB1dFxuXHQgKiBwYXJ0IG5ldmVyIGJpbmRzIG9uZS4gS2VlcGluZyBpdCBvZmYgdGhlIGNvbnZlcnNhdGlvbiBpcyB3aGF0IG1ha2VzIHRoYXQgZWRpdG9yXG5cdCAqIHNlbGYtY29udGFpbmVkOiBwaWNraW5nIGEgbW9kZWwgdGhlcmUgdG8gcmVzdWJtaXQgb25lIHJlcXVlc3QgbGVhdmVzIHRoZSBjaGF0J3Mgb3duIG1vZGVsXG5cdCAqIGFsb25lLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdW5ib3VuZEludGVudCA9IG5ldyBJbnRlbmRlZE1vZGVsU2xvdCgpO1xuXG5cdC8qKiBXaG9ldmVyIHNwZWFrcyBmb3IgdGhlIGludGVuZGVkIG1vZGVsIHJpZ2h0IG5vdzogdGhlIGJvdW5kIGNvbnZlcnNhdGlvbiwgZWxzZSB0aGlzIGlucHV0IHBhcnQuICovXG5cdHByaXZhdGUgZ2V0IF9pbnRlbnRIb2xkZXIoKTogSUludGVuZGVkTW9kZWxIb2xkZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dE1vZGVsID8/IHRoaXMuX3VuYm91bmRJbnRlbnQ7XG5cdH1cblxuXHQvLyBEaXNwb3NhYmxlcyBmb3IgbW9kZWwgb2JzZXJ2YXRpb25cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTeW5jRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50Q2hhdE1vZGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElDaGF0TW9kZXMgJiBJRGlzcG9zYWJsZT4oKSk7XG5cblx0Ly8gRmxhZyB0byBwcmV2ZW50IGNpcmN1bGFyIHVwZGF0ZXMgYmV0d2VlbiB2aWV3IGFuZCBtb2RlbFxuXHRwcml2YXRlIF9pc1N5bmNpbmdUb09yRnJvbUlucHV0TW9kZWwgPSBmYWxzZTtcblxuXHQvLyBEZWJvdW5jZWQgc2NoZWR1bGVyIGZvciBzeW5jaW5nIHRleHQgY2hhbmdlc1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zeW5jVGV4dERlYm91bmNlZDogUnVuT25jZVNjaGVkdWxlcjtcblxuXHRwcml2YXRlIGV4ZWN1dGVUb29sYmFyITogTWVudVdvcmtiZW5jaFRvb2xCYXI7XG5cdHByaXZhdGUgaW5wdXRBY3Rpb25zVG9vbGJhciE6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXG5cblxuXHRnZXQgaW5wdXRFZGl0b3IoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0RWRpdG9yO1xuXHR9XG5cblx0c2V0SGlzdG9yeUtleShoaXN0b3J5S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLmhpc3Rvcnkuc2V0SGlzdG9yeUtleShoaXN0b3J5S2V5KTtcblx0fVxuXG5cdHJlYWRvbmx5IGRuZDogQ2hhdERyYWdBbmREcm9wO1xuXG5cdHByaXZhdGUgaGlzdG9yeTogQ2hhdEhpc3RvcnlOYXZpZ2F0b3I7XG5cdHByaXZhdGUgaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50ITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaGlzdG9yeU5hdmlnYXRpb25Gb3Jld2FyZHNFbmFibGVtZW50ITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaW5wdXRNb2RlbDogSVRleHRNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbnB1dEVkaXRvckhhc1RleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlucHV0RWRpdG9ySGFzU2VuZGFibGVDb250ZW50OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dFN1Ym1pdFBlbmRpbmc6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlucHV0Um91dGluZzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdEN1cnNvckF0VG9wOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dEVkaXRvckhhc0ZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBjdXJyZW50bHlFZGl0aW5nSW5wdXRLZXkhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBlZGl0aW5nU2VudFJlcXVlc3RLZXkhOiBJQ29udGV4dEtleTxDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBjaGF0TW9kZUtpbmRLZXk6IElDb250ZXh0S2V5PENoYXRNb2RlS2luZD47XG5cdHByaXZhdGUgY2hhdE1vZGVOYW1lS2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGNoYXRNb2RlbElkS2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHdpdGhpbkVkaXRTZXNzaW9uS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmaWxlUGFydE9mRWRpdFNlc3Npb25LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGNoYXRTZXNzaW9uSGFzT3B0aW9uczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25PcHRpb25zVmFsaWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGFnZW50U2Vzc2lvblR5cGVLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb25LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGNoYXRIYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25IYXNDdXN0b21BZ2VudFRhcmdldDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25IYXNUYXJnZXRlZE1vZGVsczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbW9kZWxXaWRnZXQ6IE1vZGVsUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlV2lkZ2V0OiBNb2RlUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwZXJtaXNzaW9uV2lkZ2V0OiBQZXJtaXNzaW9uUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBwZXJtaXNzaW9uV2lkZ2V0RGlzcG9zZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBzZXNzaW9uVGFyZ2V0V2lkZ2V0OiBTZXNzaW9uVHlwZVBpY2tlckFjdGlvbkl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGVsZWdhdGlvbldpZGdldDogRGVsZWdhdGlvblNlc3Npb25QaWNrZXJBY3Rpb25JdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtPigpKTtcblx0cHJpdmF0ZSBjaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZXNzaW9uUGlja2VyQWN0aW9uOiBNZW51SXRlbUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFNlc3Npb25QaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25PcHRpb25FbWl0dGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRW1pdHRlcjxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+PigpKTtcblxuXHQvKipcblx0ICogU2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgZm9yIHRoaXMgY2hhdCBpbnB1dCBwYXJ0LlxuXHQgKiBVc2VkIHRvIGlzb2xhdGUgb3B0aW9uIGdyb3VwIGNvbnRleHQga2V5cyB0byB0aGlzIHNwZWNpZmljIGNoYXQgaW5wdXQgaW5zdGFuY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9zY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBNYXAgb2Ygb3B0aW9uIGdyb3VwIElEIHRvIGl0cyBjb250ZXh0IGtleS5cblx0ICogS2V5cyBmb2xsb3cgdGhlIHBhdHRlcm4gYGNoYXRTZXNzaW9uT3B0aW9uLjxncm91cElkPmAgYW5kIGhvbGQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBvcHRpb24gaXRlbSBJRC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbkNvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxzdHJpbmc+PiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzOiBDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcztcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyOiBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRMYW5ndWFnZU1vZGVsOiBJT2JzZXJ2YWJsZTxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlbGVjdGlvblJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWU7XG5cblx0LyoqXG5cdCAqIFBlci1lZGl0b3Igc3RvcmUgb2YgZWFjaCBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gKGUuZy4gY29udGV4dCBzaXplLCB0aGlua2luZ1xuXHQgKiBlZmZvcnQpLCBwZXJzaXN0ZWQgdG8gYSBgKGxvY2F0aW9uLCBzZXNzaW9uVHlwZSlgLXNjb3BlZCBzdG9yYWdlIGJ1Y2tldC5cblx0ICogQ2xlYXJlZCBvbiBzZXNzaW9uLXR5cGUgY2hhbmdlIHNvIHRoZSBuZXh0IHJlYWQgcmUtc2VlZHMgZnJvbSB0aGUgbmV3XG5cdCAqIGJ1Y2tldC4gU2VlIGlzc3VlICMzMjAzOTMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbENvbmZpZ1N0b3JlOiBDaGF0TW9kZWxDb25maWd1cmF0aW9uU3RvcmU7XG5cblx0Z2V0IGN1cnJlbnRMYW5ndWFnZU1vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0fVxuXG5cdGdldCBzZWxlY3RlZExhbmd1YWdlTW9kZWwoKTogSU9ic2VydmFibGU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsO1xuXHR9XG5cblx0LyoqIE1vZGVscyB0aGUgY3VycmVudCBpbnB1dCBjYW4gc2VsZWN0LCBmb3IgZnJvbnRlbmQtb3duZWQgdm9pY2UgYWN0aW9ucy4gKi9cblx0Z2V0IGF2YWlsYWJsZUxhbmd1YWdlTW9kZWxzKCk6IHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRNb2RlbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ3VycmVudENoYXRNb2RlOiBFbWl0dGVyPElDaGF0TW9kZUNoYW5nZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0TW9kZUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGU6IEV2ZW50PElDaGF0TW9kZUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ3VycmVudENoYXRNb2RlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdE1vZGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50Q2hhdE1vZGVzT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdE1vZGVzPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFBlcm1pc3Npb25MZXZlbDogSVNldHRhYmxlT2JzZXJ2YWJsZTxDaGF0UGVybWlzc2lvbkxldmVsPjtcblx0cHJpdmF0ZSBwZXJtaXNzaW9uTGV2ZWxLZXk6IElDb250ZXh0S2V5PENoYXRQZXJtaXNzaW9uTGV2ZWw+O1xuXG5cdHB1YmxpYyBnZXQgY3VycmVudE1vZGVLaW5kKCk6IENoYXRNb2RlS2luZCB7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5nZXQoKTtcblx0XHRyZXR1cm4gbW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgIXRoaXMuYWdlbnRTZXJ2aWNlLmhhc1Rvb2xzQWdlbnQgP1xuXHRcdFx0Q2hhdE1vZGVLaW5kLkVkaXQgOlxuXHRcdFx0bW9kZS5raW5kO1xuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50TW9kZU9icygpOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlO1xuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50Q2hhdE1vZGVzT2JzKCk6IElPYnNlcnZhYmxlPElDaGF0TW9kZXM+IHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWxPYnMoKTogSU9ic2VydmFibGU8Q2hhdFBlcm1pc3Npb25MZXZlbD4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsO1xuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50TW9kZUluZm8oKTogSUNoYXRSZXF1ZXN0TW9kZUluZm8ge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0Y29uc3QgbW9kZUlkOiAnYXNrJyB8ICdhZ2VudCcgfCAnZWRpdCcgfCAnY3VzdG9tJyB8IHVuZGVmaW5lZCA9IG1vZGUuaXNCdWlsdGluID8gdGhpcy5jdXJyZW50TW9kZUtpbmQgOiAnY3VzdG9tJztcblxuXHRcdGNvbnN0IG1vZGVJbnN0cnVjdGlvbnMgPSBtb2RlLm1vZGVJbnN0cnVjdGlvbnM/LmdldCgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiB0aGlzLmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdGlzQnVpbHRpbjogbW9kZS5pc0J1aWx0aW4sXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiBtb2RlSW5zdHJ1Y3Rpb25zID8ge1xuXHRcdFx0XHR1cmk6IG1vZGUudXJpPy5nZXQoKSxcblx0XHRcdFx0bmFtZTogbW9kZS5uYW1lLmdldCgpLFxuXHRcdFx0XHRjb250ZW50OiBtb2RlSW5zdHJ1Y3Rpb25zLmNvbnRlbnQsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiB0aGlzLnRvb2xTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMobW9kZUluc3RydWN0aW9ucy50b29sUmVmZXJlbmNlcyksXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IG1vZGUuYWdlbnRzPy5nZXQoKSxcblx0XHRcdFx0bWV0YWRhdGE6IG1vZGVJbnN0cnVjdGlvbnMubWV0YWRhdGEsXG5cdFx0XHRcdGlzQnVpbHRpbjogbW9kZS5pc0J1aWx0aW5cblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6IG1vZGVJZCxcblx0XHRcdHRlbGVtZXRyeU1vZGVOYW1lOiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShtb2RlKSxcblx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY2FjaGVkV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYWNoZWRFeGVjdXRlVG9vbGJhcldpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2FjaGVkSW5wdXRUb29sYmFyV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBpbnB1dFVyaTogVVJJID0gVVJJLnBhcnNlKGAke1NjaGVtYXMudnNjb2RlQ2hhdElucHV0fTppbnB1dC0ke0NoYXRJbnB1dFBhcnQuX2NvdW50ZXIrK31gKTtcblxuXHRwcml2YXRlIF93b3JraW5nU2V0TGluZXNBZGRlZFNwYW4gPSBuZXcgTGF6eSgoKSA9PiBkb20uJCgnLndvcmtpbmctc2V0LWxpbmVzLWFkZGVkJykpO1xuXHRwcml2YXRlIF93b3JraW5nU2V0TGluZXNSZW1vdmVkU3BhbiA9IG5ldyBMYXp5KCgpID0+IGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtcmVtb3ZlZCcpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0c0Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJpbmdDaGF0RWRpdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfY2hhdEVkaXRzTGlzdFBvb2w6IENvbGxhcHNpYmxlTGlzdFBvb2w7XG5cdHByaXZhdGUgX2NoYXRFZGl0TGlzdDogSURpc3Bvc2FibGVSZWZlcmVuY2U8V29ya2JlbmNoTGlzdDxJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0+PiB8IHVuZGVmaW5lZDtcblx0Z2V0IHNlbGVjdGVkRWxlbWVudHMoKTogVVJJW10ge1xuXHRcdGNvbnN0IGVkaXRzID0gW107XG5cdFx0Y29uc3QgZWRpdHNMaXN0ID0gdGhpcy5fY2hhdEVkaXRMaXN0Py5vYmplY3Q7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRFbGVtZW50cyA9IGVkaXRzTGlzdD8uZ2V0U2VsZWN0ZWRFbGVtZW50cygpID8/IFtdO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBzZWxlY3RlZEVsZW1lbnRzKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSAncmVmZXJlbmNlJyAmJiBVUkkuaXNVcmkoZWxlbWVudC5yZWZlcmVuY2UpKSB7XG5cdFx0XHRcdGVkaXRzLnB1c2goZWxlbWVudC5yZWZlcmVuY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZWRpdHM7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRlbXB0ZWRXb3JraW5nU2V0RW50cmllc0NvdW50OiBudW1iZXIgPSAwO1xuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiB3b3JraW5nIHNldCBlbnRyaWVzIHRoYXQgdGhlIHVzZXIgYWN0dWFsbHkgd2FudGVkIHRvIGF0dGFjaC5cblx0ICogVGhpcyBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8ge0BsaW5rIENoYXRJbnB1dFBhcnQuY2hhdEVkaXRXb3JraW5nU2V0RmlsZXN9LlxuXHQgKi9cblx0cHVibGljIGdldCBhdHRlbXB0ZWRXb3JraW5nU2V0RW50cmllc0NvdW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9hdHRlbXB0ZWRXb3JraW5nU2V0RW50cmllc0NvdW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHBlbmRpbmcgZGVsZWdhdGlvbiB0YXJnZXQgaWYgb25lIGlzIHNldC5cblx0ICogVGhpcyBpcyB1c2VkIHdoZW4gdGhlIHVzZXIgY2hhbmdlcyB0aGUgc2Vzc2lvbiB0YXJnZXQgcGlja2VyIHRvIGEgZGlmZmVyZW50IHByb3ZpZGVyXG5cdCAqIGJ1dCBoYXNuJ3Qgc3VibWl0dGVkIHlldCwgc28gdGhlIGRlbGVnYXRpb24gd2lsbCBoYXBwZW4gb24gc3VibWl0LlxuXHQgKi9cblx0cHVibGljIGdldCBwZW5kaW5nRGVsZWdhdGlvblRhcmdldCgpOiBBZ2VudFNlc3Npb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldDtcblx0fVxuXG5cdC8qKlxuXHQgKiBOdW1iZXIgY29uc3VtZXJzIGhvbGRpbmcgdGhlICdnZW5lcmF0aW5nJyBsb2NrLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2VuZXJhdGluZz86IHsgcmM6IG51bWJlcjsgZGVmZXI6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB9O1xuXG5cdHByaXZhdGUgX2VtcHR5SW5wdXRTdGF0ZTogT2JzZXJ2YWJsZU1lbWVudG88SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIF9lbXB0eUlucHV0QXR0YWNobWVudHM6IE9ic2VydmFibGVNZW1lbnRvPHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT47XG5cdHByaXZhdGUgX2NoYXRTZXNzaW9uSXNFbXB0eSA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRGVsZWdhdGlvblRhcmdldE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8QWdlbnRTZXNzaW9uVGFyZ2V0IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIGdldCBfcGVuZGluZ0RlbGVnYXRpb25UYXJnZXQoKTogQWdlbnRTZXNzaW9uVGFyZ2V0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0T2JzZXJ2YWJsZS5nZXQoKTsgfVxuXHRwcml2YXRlIHNldCBfcGVuZGluZ0RlbGVnYXRpb25UYXJnZXQodmFsdWU6IEFnZW50U2Vzc2lvblRhcmdldCB8IHVuZGVmaW5lZCkgeyB0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldE9ic2VydmFibGUuc2V0KHZhbHVlLCB1bmRlZmluZWQpOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgZ2V0IF9jdXJyZW50U2Vzc2lvblR5cGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZU9ic2VydmFibGUuZ2V0KCk7IH1cblx0cHJpdmF0ZSBzZXQgX2N1cnJlbnRTZXNzaW9uVHlwZSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7IHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZU9ic2VydmFibGUuc2V0KHZhbHVlLCB1bmRlZmluZWQpOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2VPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPFVSSSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmZXJyZWROb3RpZmljYXRpb25zRW5hYmxlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0cnVlKTtcblx0cHJpdmF0ZSBfaXNGaXJzdFdvcmtiZW5jaFNlc3Npb246IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PlxuXHRcdHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0T2JzZXJ2YWJsZS5yZWFkKHJlYWRlcilcblx0XHQ/PyB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGVPYnNlcnZhYmxlLnJlYWQocmVhZGVyKVxuXHRcdD8/IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKClcblx0KTtcblx0Y29uc3RydWN0b3IoXG5cdFx0Ly8gcHJpdmF0ZSByZWFkb25seSBlZGl0b3JPcHRpb25zOiBDaGF0RWRpdG9yT3B0aW9ucywgLy8gVE9ETyB0aGlzIHNob3VsZCBiZSB1c2VkXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJQ2hhdElucHV0UGFydE9wdGlvbnMsXG5cdFx0c3R5bGVzOiBJQ2hhdElucHV0U3R5bGVzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5saW5lOiBib29sZWFuLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2hhcmVkV2ViRXh0cmFjdGVyU2VydmljZTogSVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElDaGF0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TW9kZVNlcnZpY2U6IElDaGF0TW9kZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbFNlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdENvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRleHRTZXJ2aWNlOiBJQ2hhdENvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZTogSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2hhdElucHV0Tm90aWNlSHViU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2U6IElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5OiBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSxcblx0XHRASUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNoYXRQaG9uZUlucHV0UHJlc2VudGVyIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBob25lSW5wdXRQcmVzZW50ZXI6IElDaGF0UGhvbmVJbnB1dFByZXNlbnRlcixcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2U6IElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzID0gbmV3IENoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzKHRoaXMubG9nU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgKCkgPT4gKHtcblx0XHRcdHN1cmZhY2U6ICd3b3JrYmVuY2gnLFxuXHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRtb2RlbFRhcmdldDogdGhpcy5nZXRTZWxlY3RlZE1vZGVsVGFyZ2V0KCksXG5cdFx0XHRzZXNzaW9uS2V5OiB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpLFxuXHRcdFx0Y29udmVyc2F0aW9uS2V5OiB0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0bWV0YWRhdGE6IHsgd2lkZ2V0Vmlld0tpbmQ6IHRoaXMub3B0aW9ucy53aWRnZXRWaWV3S2luZFRhZyB9LFxuXHRcdH0pKTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvblJ1bnRpbWUgPSB7XG5cdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdGdldEN1cnJlbnRNb2RlS2luZDogKCkgPT4gdGhpcy5jdXJyZW50TW9kZUtpbmQsXG5cdFx0XHRnZXRDdXJyZW50U2Vzc2lvblR5cGU6ICgpID0+IHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSA/PyB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpLFxuXHRcdFx0aXNFbXB0eTogKCkgPT4gIXRoaXMuX2lucHV0TW9kZWwgfHwgdGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5LFxuXHRcdFx0Z2V0TW9kZWxzOiBzZXNzaW9uVHlwZSA9PiB0aGlzLmdldE1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKSxcblx0XHRcdGdldEFsbE1vZGVsczogKCkgPT4gdGhpcy5nZXRBbGxNZXJnZWRNb2RlbHMoKSxcblx0XHRcdHJlcXVpcmVzQ3VzdG9tTW9kZWxzOiBzZXNzaW9uVHlwZSA9PiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVxdWlyZXNDdXN0b21Nb2RlbHNGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSksXG5cdFx0XHRnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gdGhpcy5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpLFxuXHRcdFx0c3Vic2NyaWJlVG9Nb2RlbENoYW5nZXM6IGxpc3RlbmVyID0+IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMobGlzdGVuZXIpLFxuXHRcdFx0Z2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+IHRoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0XHRnZXRJbnRlbnRIb2xkZXI6ICgpID0+IHRoaXMuX2ludGVudEhvbGRlcixcblx0XHRcdHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb246IChtb2RlbElkLCBjb25maWd1cmF0aW9uKSA9PiB0aGlzLnJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZCwgY29uZmlndXJhdGlvbiksXG5cdFx0XHRhcHBseU1vZGVsOiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFdpZHRoKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jYWNoZWRXaWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlcih0aGlzLl9tb2RlbFNlbGVjdGlvblJ1bnRpbWUsIHRoaXMuX21vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MpKTtcblx0XHR0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbCA9IHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5jdXJyZW50TW9kZWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKShldmVudCA9PiB7XG5cdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzLmxvZ1N0b3JhZ2VDaGFuZ2UoZXZlbnQsIHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9tb2RlbENvbmZpZ1N0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENoYXRNb2RlbENvbmZpZ3VyYXRpb25TdG9yZShcblx0XHRcdCgpID0+IHRoaXMuZ2V0TW9kZWxDb25maWd1cmF0aW9uU3RvcmFnZUtleSgpLFxuXHRcdFx0dGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBkZWJvdW5jZWQgdGV4dCBzeW5jIHNjaGVkdWxlclxuXHRcdHRoaXMuX3N5bmNUZXh0RGVib3VuY2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgW0RFQk9VTkNFXSBfc3luY1RleHREZWJvdW5jZWQgZmlyZWQgLT4gX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWAsIHVuZGVmaW5lZCwgdGhpcy5faW5wdXRNb2RlbD8uc3RhdGUuZ2V0KCksIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHR9LCAxNTApKTtcblx0XHR0aGlzLl9lbXB0eUlucHV0U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVFbXB0eUlucHV0U3RhdGVNZW1lbnRvKHRoaXMub3B0aW9ucy53aWRnZXRWaWV3S2luZFRhZykoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZW1wdHlJbnB1dEF0dGFjaG1lbnRzID0gdGhpcy5fcmVnaXN0ZXIoZW1wdHlJbnB1dEF0dGFjaG1lbnRzKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUiwgdGhpcy5zdG9yYWdlU2VydmljZSkpO1xuXG5cdFx0dGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCB9KSk7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0TW9kZT4oJ2N1cnJlbnRNb2RlJywgdGhpcy5vcHRpb25zLmRlZmF1bHRNb2RlID8/IENoYXRNb2RlLkFnZW50KTtcblx0XHRjb25zdCBsb2NhbE1vZGVzID0gdGhpcy5jaGF0TW9kZVNlcnZpY2UuY3JlYXRlTW9kZXMoTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCkpO1xuXHRcdHRoaXMuX2N1cnJlbnRDaGF0TW9kZXMudmFsdWUgPSBsb2NhbE1vZGVzO1xuXHRcdHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0TW9kZXM+KCdjdXJyZW50Q2hhdE1vZGVzJywgbG9jYWxNb2Rlcyk7XG5cdFx0dGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbCA9IG9ic2VydmFibGVWYWx1ZTxDaGF0UGVybWlzc2lvbkxldmVsPigncGVybWlzc2lvbkxldmVsJywgdGhpcy5nZXREZWZhdWx0UGVybWlzc2lvbkxldmVsKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9pbmRleE9mTGFzdE9wZW5lZENvbnRleHQgPSAtMTtcblx0XHRcdHRoaXMucmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlYWN0IHRvIGNoYXQgc2Vzc2lvbiBvcHRpb24gY2hhbmdlcyBmb3IgdGhlIGFjdGl2ZSBzZXNzaW9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMoZSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBpc0VxdWFsKHNlc3Npb25SZXNvdXJjZSwgZS5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdC8vIE9wdGlvbnMgY2hhbmdlZCBmb3Igb3VyIGN1cnJlbnQgc2Vzc2lvbiAtIHJlZnJlc2ggcGlja2Vyc1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VPcHRpb25Hcm91cHMoY2hhdFNlc3Npb25UeXBlID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGRlbGVnYXRlU2Vzc2lvblR5cGUgPSB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKTtcblx0XHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSBjaGF0U2Vzc2lvblR5cGUgfHwgZGVsZWdhdGVTZXNzaW9uVHlwZSA9PT0gY2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQ2hhdFNlc3Npb25QaWNrZXJzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNlc3Npb24gdHlwZSBjaGFuZ2VzIGZyb20gdGhlIHdlbGNvbWUgcGFnZSBkZWxlZ2F0ZVxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8ub25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlLm9uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvblByb3ZpZGVyKGFzeW5jIChuZXdTZXNzaW9uVHlwZSkgPT4ge1xuXHRcdFx0XHQvLyBTZWVkIHRoZSBkZXN0aW5hdGlvbiB0eXBlIGJlZm9yZSB0aGUgd2VsY29tZSB3aWRnZXQgYXN5bmNocm9ub3VzbHkgcmVwbGFjZXMgaXRzIG91dGdvaW5nIHZpZXcgbW9kZWwuXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSA9IG5ld1Nlc3Npb25UeXBlO1xuXHRcdFx0XHR0aGlzLmdldFZpc2libGVPcHRpb25Hcm91cHNNb2RlQW5kVXBkYXRlQ29udGV4dEtleXModGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCkpO1xuXHRcdFx0XHR0aGlzLmFnZW50U2Vzc2lvblR5cGVLZXkuc2V0KG5ld1Nlc3Npb25UeXBlKTtcblx0XHRcdFx0dGhpcy5jaGF0U2Vzc2lvblN1cHBvcnRzRGVsZWdhdGlvbktleS5zZXQodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzRGVsZWdhdGlvbkZvclNlc3Npb25UeXBlKG5ld1Nlc3Npb25UeXBlKSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlV2lkZ2V0TG9ja1N0YXRlRnJvbVNlc3Npb25UeXBlKG5ld1Nlc3Npb25UeXBlKTtcblx0XHRcdFx0dGhpcy5jaGVja01vZGVJblNlc3Npb25Qb29sKG5ld1Nlc3Npb25UeXBlKTtcblx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnJldmFsaWRhdGVGb3JTZXNzaW9uVHlwZSgoKSA9PiB0aGlzLmluaXRTZWxlY3RlZE1vZGVsKCkpO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9hdHRhY2htZW50TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdHRhY2htZW50TW9kZWwpKTtcblx0XHRjb25zdCBhdHRhY2htZW50TW9kZWwgPSB0aGlzLl9hdHRhY2htZW50TW9kZWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXR0YWNobWVudE1vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5fZW1wdHlJbnB1dEF0dGFjaG1lbnRzLnNldCh0aGlzLl9hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHR9KSk7XG5cdFx0Ly8gQ2FwdHVyZSBtb2RlbC1jb25maWd1cmF0aW9uIGNoYW5nZXMgaW50byB0aGUgZHJhZnQgaW5wdXQgc3RhdGUgaW1tZWRpYXRlbHksXG5cdFx0Ly8gbWlycm9yaW5nIGhvdyBhIG1vZGVsIHNlbGVjdGlvbiBpcyBzeW5jZWQgaW4gYHNldEN1cnJlbnRMYW5ndWFnZU1vZGVsYC4gV2l0aG91dFxuXHRcdC8vIHRoaXMsIGEgY29uZmlnLW9ubHkgY2hhbmdlIHdvdWxkIG5vdCByZWFjaCB0aGUgZHJhZnQgc3RhdGUgdW50aWwgc29tZSBvdGhlclxuXHRcdC8vIHN5bmMtdHJpZ2dlcmluZyBldmVudCwgc28gYW4gYXV0b3NhdmUvc2VyaWFsaXplIGluIGJldHdlZW4gY291bGQgcGVyc2lzdCBhIHN0YWxlXG5cdFx0Ly8gc25hcHNob3QgdGhhdCBvdmVyd3JpdGVzIHRoZSBuZXdlciBjb25maWcgb24gcmVvcGVuLiBUaGUgYF9zeW5jRnJvbU1vZGVsYCBndWFyZFxuXHRcdC8vIGFuZCB0aGUgc3RvcmUncyByZWR1bmRhbnQtdXBkYXRlIHNob3J0LWNpcmN1aXQgcHJldmVudCBmZWVkYmFjayBsb29wcyBvbiByZXN0b3JlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21vZGVsQ29uZmlnU3RvcmUub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCkpKTtcblx0XHR0aGlzLnNlbGVjdGVkVG9vbHNNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlbGVjdGVkVG9vbHMsIHRoaXMuY3VycmVudE1vZGVPYnMsIHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsKSk7XG5cdFx0dGhpcy5kbmQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXREcmFnQW5kRHJvcCwgKCkgPT4gdGhpcy5fd2lkZ2V0LCB7XG5cdFx0XHRnZXQgYXR0YWNobWVudHMoKSB7IHJldHVybiBhdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHM7IH0sXG5cdFx0XHRhZGRBdHRhY2htZW50czogKGVudHJpZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSkgPT4gYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoLi4uZW50cmllcyksXG5cdFx0fSwgc3R5bGVzKSk7XG5cblx0XHR0aGlzLmlucHV0RWRpdG9yTWF4SGVpZ2h0ID0gdGhpcy5vcHRpb25zLmlucHV0RWRpdG9yTWF4SGVpZ2h0ID8/ICh0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyA/IElOUFVUX0VESVRPUl9NQVhfSEVJR0hUIC8gMyA6IElOUFVUX0VESVRPUl9NQVhfSEVJR0hUKTtcblx0XHRjb25zdCBwYWRkaW5nID0gdGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcgPyBJTlBVVF9FRElUT1JfUEFERElORy5jb21wYWN0IDogSU5QVVRfRURJVE9SX1BBRERJTkcuZGVmYXVsdDtcblx0XHR0aGlzLnNpbmdsZUxpbmVJbnB1dEVkaXRvckhlaWdodCA9IElOUFVUX0VESVRPUl9MSU5FX0hFSUdIVCArIHBhZGRpbmcudG9wICsgcGFkZGluZy5ib3R0b207XG5cdFx0dGhpcy5pbnB1dEVkaXRvck1pbkhlaWdodCA9IHRoaXMub3B0aW9ucy5pbnB1dEVkaXRvck1pbkxpbmVzID8gdGhpcy5vcHRpb25zLmlucHV0RWRpdG9yTWluTGluZXMgKiBJTlBVVF9FRElUT1JfTElORV9IRUlHSFQgKyBwYWRkaW5nLnRvcCArIHBhZGRpbmcuYm90dG9tIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5pbnB1dEVkaXRvckhhc1RleHQgPSBDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pbnB1dEVkaXRvckhhc1NlbmRhYmxlQ29udGVudCA9IENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1NlbmRhYmxlQ29udGVudC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5wdXRTdWJtaXRQZW5kaW5nID0gQ2hhdENvbnRleHRLZXlzLmlucHV0U3VibWl0UGVuZGluZy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5wdXRSb3V0aW5nID0gQ2hhdENvbnRleHRLZXlzLmlucHV0Um91dGluZy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdEN1cnNvckF0VG9wID0gQ2hhdENvbnRleHRLZXlzLmlucHV0Q3Vyc29yQXRUb3AuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlucHV0RWRpdG9ySGFzRm9jdXMgPSBDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNGb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc1F1ZXN0aW9uQ2Fyb3VzZWxDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzUXVlc3Rpb25DYXJvdXNlbC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdE1vZGVLaW5kS2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdE1vZGVOYW1lS2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlTmFtZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdE1vZGVsSWRLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVsSWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnBlcm1pc3Npb25MZXZlbEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0UGVybWlzc2lvbkxldmVsLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5wZXJtaXNzaW9uTGV2ZWxLZXkuc2V0KHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCkpO1xuXHRcdHRoaXMud2l0aGluRWRpdFNlc3Npb25LZXkgPSBDaGF0Q29udGV4dEtleXMud2l0aGluRWRpdFNlc3Npb25EaWZmLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5maWxlUGFydE9mRWRpdFNlc3Npb25LZXkgPSBDaGF0Q29udGV4dEtleXMuZmlsZVBhcnRPZkVkaXRTZXNzaW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbkhhc09wdGlvbnMgPSBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNNb2RlbHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5hZ2VudFNlc3Npb25UeXBlS2V5ID0gQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uU3VwcG9ydHNEZWxlZ2F0aW9uS2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uU3VwcG9ydHNEZWxlZ2F0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0SGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXRLZXkgPSBDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIEluaXRpYWxpemUgYWdlbnRTZXNzaW9uVHlwZSBmcm9tIGRlbGVnYXRlIGlmIGF2YWlsYWJsZVxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsU2Vzc2lvblR5cGUgPSB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZS5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXIoKTtcblx0XHRcdGlmIChpbml0aWFsU2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0dGhpcy5hZ2VudFNlc3Npb25UeXBlS2V5LnNldChpbml0aWFsU2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uU3VwcG9ydHNEZWxlZ2F0aW9uS2V5LnNldCh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc3VwcG9ydHNEZWxlZ2F0aW9uRm9yU2Vzc2lvblR5cGUoaW5pdGlhbFNlc3Npb25UeXBlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuY2hhdFNlc3Npb25IYXNDdXN0b21BZ2VudFRhcmdldCA9IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc0N1c3RvbUFnZW50VGFyZ2V0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbkhhc1RhcmdldGVkTW9kZWxzID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzVGFyZ2V0ZWRNb2RlbHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIHRoaXMubG9jYXRpb24pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3QgbmV3T3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7fTtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSkge1xuXHRcdFx0XHR0aGlzLnNldFBlcm1pc3Npb25MZXZlbCh0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHkpIHtcblx0XHRcdFx0XHR0aGlzLnNldFBlcm1pc3Npb25MZXZlbCh0aGlzLmdldERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbCkpIHtcblx0XHRcdFx0Ly8gVGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBtb2RlbCAoZS5nLiBlbnRlcnByaXNlIHBvbGljeVxuXHRcdFx0XHQvLyBgY2hhdC5kZWZhdWx0TW9kZWxgKSBjYW4gYXJyaXZlIGFmdGVyIHRoaXMgd2lkZ2V0IHdhc1xuXHRcdFx0XHQvLyBjb25zdHJ1Y3RlZCBcdTIwMTQgZGVza3RvcCBwb2xpY3kgdmFsdWVzIGFyZSBkZWxpdmVyZWQgYXN5bmNocm9ub3VzbHlcblx0XHRcdFx0Ly8gZnJvbSB0aGUgbWFpbiBwcm9jZXNzLCBzbyBgaW5pdFNlbGVjdGVkTW9kZWxgIG1heSBoYXZlIHJlYWQgYW4gZW1wdHlcblx0XHRcdFx0Ly8gdmFsdWUgYXQgc3RhcnR1cC4gUmUtYXBwbHkgaXQgdG8gYSBmcmVzaCBlbXB0eSBzZXNzaW9uIHdoZW4gaXQgbGFuZHMuXG5cdFx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5hcHBseUNvbmZpZ3VyZWREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXQpKSB7XG5cdFx0XHRcdG5ld09wdGlvbnMuYXJpYUxhYmVsID0gdGhpcy5fZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLndvcmRTZWdtZW50ZXJMb2NhbGVzJykpIHtcblx0XHRcdFx0bmV3T3B0aW9ucy53b3JkU2VnbWVudGVyTG9jYWxlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgc3RyaW5nW10+KCdlZGl0b3Iud29yZFNlZ21lbnRlckxvY2FsZXMnKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuYXV0b0Nsb3NpbmdCcmFja2V0cycpKSB7XG5cdFx0XHRcdG5ld09wdGlvbnMuYXV0b0Nsb3NpbmdCcmFja2V0cyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvQ2xvc2luZ0JyYWNrZXRzJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmF1dG9DbG9zaW5nUXVvdGVzJykpIHtcblx0XHRcdFx0bmV3T3B0aW9ucy5hdXRvQ2xvc2luZ1F1b3RlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvQ2xvc2luZ1F1b3RlcycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5hdXRvU3Vycm91bmQnKSkge1xuXHRcdFx0XHRuZXdPcHRpb25zLmF1dG9TdXJyb3VuZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvU3Vycm91bmQnKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKG5ld09wdGlvbnMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NoYXRFZGl0c0xpc3RQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzaWJsZUxpc3RQb29sLCB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQsIE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldE1vZGlmaWVkRmlsZXNUb29sYmFyLCB7IHZlcnRpY2FsU2Nyb2xsTW9kZTogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlIH0pKTtcblxuXHRcdHRoaXMuX2hhc0ZpbGVBdHRhY2htZW50Q29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5oYXNGaWxlQXR0YWNobWVudHMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaW5pdFNlbGVjdGVkTW9kZWwoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29uRGlkQ2hhbmdlQ3VycmVudENoYXRNb2RlLmV2ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5lbnN1cmVDdXJyZW50TW9kZWxTdXBwb3J0ZWQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVBZnRlck1vZGVsTGlzdENoYW5nZSA9IChyZWNvbmNpbGVTZWxlY3Rpb246IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsSWRlbnRpZmllciA9IHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHMoKTtcblx0XHRcdGlmIChjYW5Mb2codGhpcy5sb2dTZXJ2aWNlLmdldExldmVsKCksIExvZ0xldmVsLkRlYnVnKSkge1xuXHRcdFx0XHRjb25zdCBtZXJnZWRNb2RlbHMgPSB0aGlzLmdldEFsbE1lcmdlZE1vZGVscygpO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZE1vZGVscyA9IGZpbHRlck1vZGVsc0ZvclNlc3Npb24obW9kZWxzLCB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpLCB0aGlzLmN1cnJlbnRNb2RlS2luZCwgdGhpcy5sb2NhdGlvbik7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2VwYXJ0czogc3RyaW5nW10gPSBbXG5cdFx0XHRcdFx0YHJlc2V0dGluZyBjdXJyZW50IGxhbmd1YWdlIG1vZGVsIGR1ZSB0byBtb2RlbCBsaXN0IGNoYW5nZSBmcm9tICR7bW9kZWxJZGVudGlmaWVyfWAsXG5cdFx0XHRcdFx0YHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2UgPSAke3RoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCl9YCxcblx0XHRcdFx0XHRgdGhpcy5jdXJyZW50TW9kZUtpbmQgPSAke3RoaXMuY3VycmVudE1vZGVLaW5kfWAsXG5cdFx0XHRcdFx0YHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlID0gJHt0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpfWAsXG5cdFx0XHRcdFx0YHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSA9ICR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfWAsXG5cdFx0XHRcdFx0YHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UobW9kZWxJZGVudGlmaWVyLCBtb2RlbHMpID0gJHtzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKG1vZGVsSWRlbnRpZmllciwgbW9kZWxzKX1gLFxuXHRcdFx0XHRcdGB2ZW5kb3JzOiAke3RoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldFZlbmRvcnMoKS5tYXAodiA9PiB2LnZlbmRvcikuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBoaWRkZW5Nb2RlbElkczogJHt0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRIaWRkZW5Nb2RlbElkcygpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgbW9kZWwgaWRlbnRpZmllcnM6ICR7bW9kZWxzLm1hcChtID0+IG0uaWRlbnRpZmllcikuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBtb2RlbCB0YXJnZXQgU2Vzc2lvbiBUeXBlczogJHttb2RlbHMubWFwKG0gPT4gbS5tZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUgfHwgJycpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgbW9kZWwgbWV0YWRhdGFpZDogJHttb2RlbHMubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCkuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBtZXJnZWQubW9kZWwgaWRlbnRpZmllcnM6ICR7bWVyZ2VkTW9kZWxzLm1hcChtID0+IG0uaWRlbnRpZmllcikuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBtZXJnZWQubW9kZWwgdGFyZ2V0IFNlc3Npb24gVHlwZXM6ICR7bWVyZ2VkTW9kZWxzLm1hcChtID0+IG0ubWV0YWRhdGEudGFyZ2V0Q2hhdFNlc3Npb25UeXBlIHx8ICcnKS5qb2luKCcsICcpfWAsXG5cdFx0XHRcdFx0YG1lcmdlZC5tb2RlbCBtZXRhZGF0YWlkOiAke21lcmdlZE1vZGVscy5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5qb2luKCcsICcpfWAsXG5cdFx0XHRcdFx0YGZpbHRlcmVkLm1vZGVsIGlkZW50aWZpZXJzOiAke2ZpbHRlcmVkTW9kZWxzLm1hcChtID0+IG0uaWRlbnRpZmllcikuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBmaWx0ZXJlZC5tb2RlbCB0YXJnZXQgU2Vzc2lvbiBUeXBlczogJHtmaWx0ZXJlZE1vZGVscy5tYXAobSA9PiBtLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSB8fCAnJykuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBmaWx0ZXJlZC5tb2RlbCBtZXRhZGF0YWlkOiAke2ZpbHRlcmVkTW9kZWxzLm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XTtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkgIT09IFNlc3Npb25UeXBlLkNvcGlsb3RDTEkpIHtcblx0XHRcdFx0XHRjb25zdCBkZWxlZ2F0ZVNlc3Npb25UeXBlID0gdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU/LmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcj8uKCk7XG5cdFx0XHRcdFx0aWYgKGRlbGVnYXRlU2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2VwYXJ0cy5wdXNoKGBkZWxlZ2F0ZVNlc3Npb25UeXBlID0gJHtkZWxlZ2F0ZVNlc3Npb25UeXBlfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdG1lc3NhZ2VwYXJ0cy5wdXNoKGBjdXJyZW50IHNlc3Npb24gcmVzb3VyY2UgPSAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgbWVzc2FnZXBhcnRzLmpvaW4oJywgJyksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlY29uY2lsZVNlbGVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIucmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKG1vZGVscyk7XG5cdFx0XHR9XG5cdFx0XHQvLyBUaGUgYXZhaWxhYmxlLW1vZGVsIHNldCBjaGFuZ2VkOiByZS1ldmFsdWF0ZSB3aGV0aGVyIHNlbmRpbmcgaXNcblx0XHRcdC8vIHBvc3NpYmxlIChhIGByZXF1aXJlc0N1c3RvbU1vZGVsc2Agc2Vzc2lvbiBtYXkgbm93IGhhdmUsIG9yIGhhdmVcblx0XHRcdC8vIGxvc3QsIGl0cyBtb2RlbHMpLlxuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRDb250ZW50Q29udGV4dEtleXMoKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4gdXBkYXRlQWZ0ZXJNb2RlbExpc3RDaGFuZ2UoZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkoKCkgPT4gdXBkYXRlQWZ0ZXJNb2RlbExpc3RDaGFuZ2UodHJ1ZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5hbGVydCh0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCkubGFiZWwuZ2V0KCkpO1xuXHRcdFx0aWYgKHRoaXMuX2lucHV0RWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IHRoaXMuX2dldEFyaWFMYWJlbCgpIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXRJbXBsaWNpdENvbnRleHRFbmFibGVtZW50KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxtID0gdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5jaGF0TW9kZWxJZEtleS5zZXQobG0/Lm1ldGFkYXRhLmlkLnRvTG93ZXJDYXNlKCkgPz8gJycpO1xuXHRcdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQ/LnNldFNlbGVjdGVkTW9kZWwobG0/LmlkZW50aWZpZXIpO1xuXHRcdFx0aWYgKGxtPy5tZXRhZGF0YS5uYW1lKSB7XG5cdFx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQobG0ubWV0YWRhdGEubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbnB1dEVkaXRvcj8udXBkYXRlT3B0aW9ucyh7IGFyaWFMYWJlbDogdGhpcy5fZ2V0QXJpYUxhYmVsKCkgfSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVzID0gdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChtb2Rlcy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVDdXJyZW50Q2hhdE1vZGUoKTtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVBlcnNpc3RlZEN1c3RvbU1vZGVJZkF2YWlsYWJsZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5yZWFkKHIpO1xuXHRcdFx0dGhpcy5jaGF0TW9kZUtpbmRLZXkuc2V0KG1vZGUua2luZCk7XG5cdFx0XHR0aGlzLmNoYXRNb2RlTmFtZUtleS5zZXQobW9kZS5uYW1lLnJlYWQocikpO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5zdXBwcmVzc01vZGVQcmVmZXJyZWRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBtb2RlLm1vZGVsPy5yZWFkKHIpO1xuXHRcdFx0aWYgKG1vZGVscykge1xuXHRcdFx0XHR0aGlzLnN3aXRjaE1vZGVsQnlRdWFsaWZpZWROYW1lKG1vZGVscyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVmFsaWRhdGUgdGhlIGluaXRpYWwgbW9kZSAtIGlmIEFnZW50IG1vZGUgaXMgc2V0IGJ5IGRlZmF1bHQgYnV0IGRpc2FibGVkIGJ5IHBvbGljeSwgc3dpdGNoIHRvIEFza1xuXHRcdHRoaXMudmFsaWRhdGVDdXJyZW50Q2hhdE1vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0SW1wbGljaXRDb250ZXh0RW5hYmxlbWVudCgpIHtcblx0XHRpZiAodGhpcy5pbXBsaWNpdENvbnRleHQgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignY2hhdC5pbXBsaWNpdENvbnRleHQuc3VnZ2VzdGVkQ29udGV4dCcpKSB7XG5cdFx0XHR0aGlzLmltcGxpY2l0Q29udGV4dC5zZXRFbmFibGVkKHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5nZXQoKS5uYW1lLmdldCgpLnRvTG93ZXJDYXNlKCkgPT09ICdhc2snKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0SXNXaXRoaW5FZGl0U2Vzc2lvbihpbkluc2lkZURpZmY6IGJvb2xlYW4sIGlzRmlsZVBhcnRPZkVkaXRTZXNzaW9uOiBib29sZWFuKSB7XG5cdFx0dGhpcy53aXRoaW5FZGl0U2Vzc2lvbktleS5zZXQoaW5JbnNpZGVEaWZmKTtcblx0XHR0aGlzLmZpbGVQYXJ0T2ZFZGl0U2Vzc2lvbktleS5zZXQoaXNGaWxlUGFydE9mRWRpdFNlc3Npb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZE1vZGVsVGFyZ2V0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGU7XG5cdFx0cmV0dXJuIHNlc3Npb25UeXBlICYmIHRoaXMuc2Vzc2lvblR5cGVIYXNPd25Nb2RlbFBvb2woc2Vzc2lvblR5cGUpID8gc2Vzc2lvblR5cGUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSB3aGVuIHRoZSBzZXNzaW9uIHR5cGUgb3ducyBpdHMgb3duIG1vZGVsIHBvb2wgKGVpdGhlciBkZWNsYXJlZCB2aWEgYHJlcXVpcmVzQ3VzdG9tTW9kZWxzYCxcblx0ICogb3Igc29tZSByZWdpc3RlcmVkIG1vZGVsIGFscmVhZHkgdGFyZ2V0cyBpdCkuIEtlZXBzIHN0b3JhZ2Uga2V5cyBzdGFibGUgYmVmb3JlIHRhcmdldGVkIG1vZGVscyBhcmUgcHVibGlzaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBzZXNzaW9uVHlwZUhhc093bk1vZGVsUG9vbChzZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKVxuXHRcdFx0fHwgaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbih0aGlzLmdldEFsbE1lcmdlZE1vZGVscygpLCBzZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRTZWxlY3RlZE1vZGVsKCkge1xuXHRcdC8vIERyb3AgdGhlIHBlci1lZGl0b3IgY29uZmlndXJhdGlvbiBzbmFwc2hvdCBzbyB0aGUgbmV4dCByZWFkIHJlLXNlZWRzXG5cdFx0Ly8gZnJvbSB0aGUgbmV3IChsb2NhdGlvbiwgc2Vzc2lvblR5cGUpLXNjb3BlZCBzdG9yYWdlIGJ1Y2tldC5cblx0XHR0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLmNsZWFyKCk7XG5cblx0XHQvLyBUaGUgZGVjaXNpb24gaXRzZWxmIGlzIHJlcG9ydGVkIHN0cnVjdHVyYWxseSBieSBgQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3NgXG5cdFx0Ly8gKGBldmVudD1pbml0aWFsaXplYCksIHdoaWNoIGNhcnJpZXMgdGhlIHN0b3JhZ2Uga2V5LCBzZXNzaW9uIGFuZCBjb252ZXJzYXRpb24gYWxyZWFkeS5cblx0XHRjb25zdCBzdG9yZWRTZWxlY3Rpb24gPSBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsKHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMubG9jYXRpb24sIHRoaXMuZ2V0U2VsZWN0ZWRNb2RlbFRhcmdldCgpKTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuaW5pdGlhbGl6ZShzdG9yZWRTZWxlY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIHNldEVkaXRpbmcoZW5hYmxlZDogYm9vbGVhbiwgZWRpdGluZ1NlbnRSZXF1ZXN0OiBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5jdXJyZW50bHlFZGl0aW5nSW5wdXRLZXk/LnNldChlbmFibGVkKTtcblx0XHR0aGlzLmVkaXRpbmdTZW50UmVxdWVzdEtleT8uc2V0KGVkaXRpbmdTZW50UmVxdWVzdCk7XG5cdH1cblxuXHRwdWJsaWMgc3dpdGNoTW9kZWwobW9kZWxNZXRhZGF0YTogUGljazxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgJ3ZlbmRvcicgfCAnaWQnIHwgJ2ZhbWlseSc+KSB7XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHMoKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVscy5maW5kKG0gPT4gbS5tZXRhZGF0YS52ZW5kb3IgPT09IG1vZGVsTWV0YWRhdGEudmVuZG9yICYmIG0ubWV0YWRhdGEuaWQgPT09IG1vZGVsTWV0YWRhdGEuaWQgJiYgbS5tZXRhZGF0YS5mYW1pbHkgPT09IG1vZGVsTWV0YWRhdGEuZmFtaWx5KTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwobW9kZWwsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTd2l0Y2ggdG8gYSBtb2RlbCBieSBpdHMgaWRlbnRpZmllci4gUmV0dXJucyB0cnVlIGlmIGEgbWF0Y2hpbmcgbW9kZWxcblx0ICogd2FzIGZvdW5kIGFuZCBhcHBsaWVkLlxuXHQgKlxuXHQgKiBUaGUgcmVtZW1iZXJlZCBwcm9maWxlIHByZWZlcmVuY2UgaXMgdXBkYXRlZCBvbmx5IHdoZW4gYm90aFxuXHQgKiBgaXNVc2VyQWN0aW9uYCBhbmQgYHN0b3JlU2VsZWN0aW9uYCBhcmUgdHJ1ZS5cblx0ICovXG5cdHB1YmxpYyBzd2l0Y2hNb2RlbEJ5SWRlbnRpZmllcihpZGVudGlmaWVyOiBzdHJpbmcsIHN0b3JlU2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UsIGlzVXNlckFjdGlvbjogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHMoKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVscy5maW5kKG0gPT4gbS5pZGVudGlmaWVyID09PSBpZGVudGlmaWVyKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGlmIChpc1VzZXJBY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbChtb2RlbCwgdHJ1ZSwgc3RvcmVTZWxlY3Rpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYXBwbHlQcm9ncmFtbWF0aWNMYW5ndWFnZU1vZGVsKG1vZGVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgc3dpdGNoTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTW9kZWxOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmdldE1vZGVscygpO1xuXHRcdGZvciAoY29uc3QgcXVhbGlmaWVkTW9kZWxOYW1lIG9mIHF1YWxpZmllZE1vZGVsTmFtZXMpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxzLmZpbmQobSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZShxdWFsaWZpZWRNb2RlbE5hbWUsIG0ubWV0YWRhdGEpKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9hcHBseVByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwobW9kZWwpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtjaGF0XSBOb2RlIG9mIHRoZSBtb2RlbHMgXCIke3F1YWxpZmllZE1vZGVsTmFtZXMuam9pbignLCAnKX1cIiBub3QgZm91bmQuIFVzZSBmb3JtYXQgXCI8bmFtZT4gKDx2ZW5kb3I+KVwiLCBlLmcuIFwiR1BULTRvIChjb3BpbG90KVwiLmApO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZXF1ZXN0TW9kZWxCeUlkZW50aWZpZXIoaWRlbnRpZmllcjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RQcm9ncmFtbWF0aWNMYW5ndWFnZU1vZGVsKCgpID0+IHRoaXMuZ2V0TW9kZWxzKCkuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSBpZGVudGlmaWVyKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVxdWVzdE1vZGVsQnlRdWFsaWZpZWROYW1lKHF1YWxpZmllZE1vZGVsTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RQcm9ncmFtbWF0aWNMYW5ndWFnZU1vZGVsKCgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuZ2V0TW9kZWxzKCk7XG5cdFx0XHRyZXR1cm4gcXVhbGlmaWVkTW9kZWxOYW1lcy5tYXAobmFtZSA9PiBtb2RlbHMuZmluZChtb2RlbCA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5tYXRjaGVzUXVhbGlmaWVkTmFtZShuYW1lLCBtb2RlbC5tZXRhZGF0YSkpKS5maW5kKGlzRGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgaGFzUGVuZGluZ1Byb2dyYW1tYXRpY01vZGVsU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY1NlbGVjdGlvbigpO1xuXHR9XG5cblxuXHRwdWJsaWMgc3dpdGNoVG9OZXh0TW9kZWwoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHMoKTtcblx0XHRpZiAobW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRJbmRleCA9IG1vZGVscy5maW5kSW5kZXgobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciA9PT0gdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgbmV4dEluZGV4ID0gKGN1cnJlbnRJbmRleCArIDEpICUgbW9kZWxzLmxlbmd0aDtcblx0XHRcdHRoaXMuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwobW9kZWxzW25leHRJbmRleF0sIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzd2l0Y2hUb05leHRQaW5uZWRNb2RlbCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmdldE1vZGVscygpO1xuXHRcdGlmIChtb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxNYXAgPSBuZXcgTWFwKG1vZGVscy5tYXAobW9kZWwgPT4gW21vZGVsLmlkZW50aWZpZXIsIG1vZGVsXSkpO1xuXHRcdGNvbnN0IHBpbm5lZE1vZGVscyA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlXG5cdFx0XHQuZ2V0UGlubmVkTW9kZWxJZHMoKVxuXHRcdFx0Lm1hcChtb2RlbElkID0+IG1vZGVsTWFwLmdldChtb2RlbElkKSlcblx0XHRcdC5maWx0ZXIoaXNEZWZpbmVkKTtcblxuXHRcdGlmIChwaW5uZWRNb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gcGlubmVkTW9kZWxzLmZpbmRJbmRleChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcik7XG5cdFx0Y29uc3QgbmV4dEluZGV4ID0gKGN1cnJlbnRJbmRleCArIDEpICUgcGlubmVkTW9kZWxzLmxlbmd0aDtcblx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsKHBpbm5lZE1vZGVsc1tuZXh0SW5kZXhdLCB0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBvcGVuTW9kZWxQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5fc2hvd0NvbWJpbmVkUGhvbmVQaWNrZXJTaGVldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1vZGVsV2lkZ2V0Py5zaG93KCk7XG5cdH1cblxuXHRwdWJsaWMgb3Blbk1vZGVQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuZW5hYmxlZC5nZXQoKSkge1xuXHRcdFx0dGhpcy5fc2hvd0NvbWJpbmVkUGhvbmVQaWNrZXJTaGVldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1vZGVXaWRnZXQ/LnNob3coKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dDb21iaW5lZFBob25lUGlja2VyU2hlZXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmdldEVsZW1lbnQoKTtcblx0XHR0aGlzLmNoYXRQaG9uZUlucHV0UHJlc2VudGVyXG5cdFx0XHQuc2hvd0NvbWJpbmVkTW9kZUFuZE1vZGVsU2hlZXQodGFyZ2V0LCB7XG5cdFx0XHRcdGtpbmQ6ICdkZWxlZ2F0ZXMnLFxuXHRcdFx0XHRtb2RlRGVsZWdhdGU6IHRoaXMuX2NyZWF0ZU1vZGVQaWNrZXJEZWxlZ2F0ZSgpLFxuXHRcdFx0XHRtb2RlbERlbGVnYXRlOiB0aGlzLl9jcmVhdGVNb2RlbFBpY2tlckRlbGVnYXRlKCksXG5cdFx0XHR9KVxuXHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDaGF0SW5wdXRQYXJ0XSBwaG9uZSBwaWNrZXIgc2hlZXQgZmFpbGVkJywgZXJyKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNb2RlbFBpY2tlckRlbGVnYXRlKCk6IElNb2RlbFBpY2tlckRlbGVnYXRlIHtcblx0XHRjb25zdCBpbnB1dFBpY2tlckNvbnRhaW5lciA9IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlckNvbnRhaW5lcjtcblx0XHRjb25zdCBpbnB1dFBpY2tlclBvc2l0aW9uID0gdGhpcy5vcHRpb25zLmlucHV0UGlja2VyUG9zaXRpb247XG5cdFx0cmV0dXJuIHtcblx0XHRcdGN1cnJlbnRNb2RlbDogdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwsXG5cdFx0XHRzZXRNb2RlbDogKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbChtb2RlbCwgdHJ1ZSwgIXRoaXMub3B0aW9ucy5zdXBwcmVzc01vZGVsUGVyc2lzdGVuY2UpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckF0dGFjaGVkQ29udGV4dCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldE1vZGVsczogKCkgPT4gdGhpcy5nZXRNb2RlbHMoKSxcblx0XHRcdGlzQ2FjaGVXYXJtOiAoKSA9PiAodGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID8/IDApID4gMCxcblx0XHRcdGdldFByZXNlbnRhdGlvbk9wdGlvbnM6ICgpID0+IHRoaXMuX2dldE1vZGVsUGlja2VyUHJlc2VudGF0aW9uT3B0aW9ucygpLFxuXHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiB0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLFxuXHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLm9wdGlvbnMub25EaWRDaGFuZ2VNb2RlbFBpY2tlclZpc2liaWxpdHksXG5cdFx0XHRnZXQgYW5jaG9yUG9zaXRpb24oKSB7XG5cdFx0XHRcdHJldHVybiB0eXBlb2YgaW5wdXRQaWNrZXJQb3NpdGlvbiA9PT0gJ2Z1bmN0aW9uJyA/IGlucHV0UGlja2VyUG9zaXRpb24oKSA6IGlucHV0UGlja2VyUG9zaXRpb247XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjdGlvbldpZGdldENvbnRhaW5lcigpIHtcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiBpbnB1dFBpY2tlckNvbnRhaW5lciA9PT0gJ2Z1bmN0aW9uJyA/IGlucHV0UGlja2VyQ29udGFpbmVyKCkgOiBpbnB1dFBpY2tlckNvbnRhaW5lcjtcblx0XHRcdH0sXG5cdFx0XHRnZXRBY3Rpb25XaWRnZXRBbmNob3I6IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlckFuY2hvcixcblx0XHRcdG9wZW5Pbk1vdXNlVXA6IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlck9wZW5Pbk1vdXNlVXAsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vZGVsUGlja2VyUHJlc2VudGF0aW9uT3B0aW9ucygpOiBJTW9kZWxQaWNrZXJQcmVzZW50YXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCk7XG5cdFx0Y29uc3QgdXNlUmljaFBpY2tlciA9ICFzZXNzaW9uVHlwZSB8fCBzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUgfHwgaXNBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHVzZVJpY2hQaWNrZXIsXG5cdFx0XHRzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiB1c2VSaWNoUGlja2VyLFxuXHRcdFx0c2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IHVzZVJpY2hQaWNrZXIsXG5cdFx0XHRzaG93RmVhdHVyZWQ6IHVzZVJpY2hQaWNrZXIsXG5cdFx0XHRzaG93QXV0b01vZGVsOiB0aGlzLl9zaG93QXV0b01vZGVsKCksXG5cdFx0XHRzaG93TW9kZWxJY29uOiB0aGlzLm9wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdyB8fCAhdGhpcy5fdXNlc0hhcm5lc3NQcm92aWRlckljb24oKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlc0hhcm5lc3NQcm92aWRlckljb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdHJldHVybiBzZXNzaW9uVHlwZSA9PT0gU2Vzc2lvblR5cGUuQ29kZXhcblx0XHRcdHx8IHNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGVcblx0XHRcdHx8IHNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoaXMgZWRpdG9yJ3Mgc25hcHNob3Qgb2YgdGhlIGdpdmVuIG1vZGVsJ3MgY29uZmlndXJhdGlvbiAoZS5nLlxuXHQgKiBjb250ZXh0IHNpemUsIHRoaW5raW5nIGVmZm9ydCksIHNjb3BlZCB0byB0aGlzIGVkaXRvciByYXRoZXIgdGhhbiB0aGVcblx0ICogcHJvZmlsZS1nbG9iYWwgdmFsdWUuIERlbGVnYXRlcyB0byB7QGxpbmsgQ2hhdE1vZGVsQ29uZmlndXJhdGlvblN0b3JlfS5cblx0ICogU2VlIGlzc3VlICMzMjAzOTMuXG5cdCAqL1xuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nLCB2YWx1ZXM6IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsQ29uZmlnU3RvcmUuc2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQsIHZhbHVlcyk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzdG9yZXMgYSBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gY2FwdHVyZWQgaW4gYSBzZXNzaW9uJ3MgcGVyc2lzdGVkIGlucHV0XG5cdCAqIHN0YXRlLiBDYWxsZWQgd2hlbiB0aGUgc2VsZWN0ZWQgbW9kZWwgaXMgcmVzdG9yZWQgZnJvbSBzZXNzaW9uIGhpc3Rvcnkgc29cblx0ICogdGhlIGNvbmZpZ3VyYXRpb24gZm9sbG93cyB0aGUgbW9kZWwgdGhyb3VnaCB0aGUgc2FtZSByZXNvbHV0aW9uIGhpZXJhcmNoeS5cblx0ICogTm8tb3AgZm9yIHNlc3Npb25zIHRoYXQgcHJlLWRhdGUgY29uZmlndXJhdGlvbiBjYXB0dXJlIChubyB2YWx1ZSBzdG9yZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSByZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQ6IHN0cmluZywgbW9kZWxDb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChtb2RlbENvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRoaXMuX21vZGVsQ29uZmlnU3RvcmUucmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkLCBtb2RlbENvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxDb25maWd1cmF0aW9uU3RvcmFnZUtleSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5fY3VycmVudFNlc3Npb25UeXBlO1xuXHRcdGlmIChzZXNzaW9uVHlwZSAmJiB0aGlzLnNlc3Npb25UeXBlSGFzT3duTW9kZWxQb29sKHNlc3Npb25UeXBlKSkge1xuXHRcdFx0cmV0dXJuIGBjaGF0Lm1vZGVsQ29uZmlndXJhdGlvbi4ke3RoaXMubG9jYXRpb259LiR7c2Vzc2lvblR5cGV9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGBjaGF0Lm1vZGVsQ29uZmlndXJhdGlvbi4ke3RoaXMubG9jYXRpb259YDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU1vZGVQaWNrZXJEZWxlZ2F0ZSgpOiBJTW9kZVBpY2tlckRlbGVnYXRlIHtcblx0XHQvLyBXaGVuIGBoaWRlQ3VzdG9tQ2hhdE1vZGVzYCBpcyBzZXQgKGUuZy4gdGhlIGF1dG9tYXRpb25zIGRpYWxvZyksXG5cdFx0Ly8gc3RyaXAgZ2VudWluZWx5IHVzZXItZGVmaW5lZCBjdXN0b20gYWdlbnRzIGZyb20gdGhlIHBpY2tlclxuXHRcdC8vIHdoaWxlIHByZXNlcnZpbmcgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIG1vZGVzIChQbGFuIC8gbmV3LUFzayAvXG5cdFx0Ly8gbmV3LUVkaXQpIHRoYXQgdGhlIHBpY2tlciBjYXRlZ29yaXNlcyBhcyBidWlsdC1pbiB2aWFcblx0XHQvLyBgaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW5gLiBUaG9zZSBsaXZlIGluIGBJQ2hhdE1vZGVzLmN1c3RvbWAgYnV0XG5cdFx0Ly8gYXJlIHBhcnQgb2YgdGhlIGJ1aWx0LWluIHByb2R1Y3Qgc3VyZmFjZSwgbm90IHRoZVxuXHRcdC8vIGZvbGRlci1zY29wZWQgYWdlbnQgZmlsZXMgd2Ugd2FudCB0byBoaWRlLiBUaGUgdW5kZXJseWluZ1xuXHRcdC8vIG9ic2VydmFibGUgaXMgdW50b3VjaGVkIHNvIG1vZGUgdmFsaWRhdGlvbiwgbW9kZWwgcGlja2luZyBhbmRcblx0XHQvLyBwZXJzaXN0ZW5jZSBjb250aW51ZSB0byBzZWUgdGhlIHJlYWwgbGlzdC5cblx0XHRjb25zdCBwcm9kdWN0U2VydmljZSA9IHRoaXMucHJvZHVjdFNlcnZpY2U7XG5cdFx0Y29uc3QgY3VycmVudENoYXRNb2RlczogSU9ic2VydmFibGU8SUNoYXRNb2Rlcz4gPSB0aGlzLm9wdGlvbnMuaGlkZUN1c3RvbUNoYXRNb2Rlc1xuXHRcdFx0PyBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGlubmVyID0gdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZEN1c3RvbSA9IGlubmVyLmN1c3RvbS5maWx0ZXIobSA9PiBpc01vZGVDb25zaWRlcmVkQnVpbHRJbihtLCBwcm9kdWN0U2VydmljZSkpO1xuXHRcdFx0XHRjb25zdCB3cmFwcGVkOiBJQ2hhdE1vZGVzID0ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBpbm5lci5vbkRpZENoYW5nZSxcblx0XHRcdFx0XHRidWlsdGluOiBpbm5lci5idWlsdGluLFxuXHRcdFx0XHRcdGN1c3RvbTogZmlsdGVyZWRDdXN0b20sXG5cdFx0XHRcdFx0ZmluZE1vZGVCeUlkOiAoaWQ6IHN0cmluZykgPT4gaW5uZXIuYnVpbHRpbi5maW5kKG0gPT4gbS5pZCA9PT0gaWQpID8/IGZpbHRlcmVkQ3VzdG9tLmZpbmQobSA9PiBtLmlkID09PSBpZCksXG5cdFx0XHRcdFx0ZmluZE1vZGVCeU5hbWU6IChuYW1lOiBzdHJpbmcpID0+IGlubmVyLmJ1aWx0aW4uZmluZChtID0+IG0ubmFtZS5yZWFkKHVuZGVmaW5lZCkgPT09IG5hbWUpID8/IGZpbHRlcmVkQ3VzdG9tLmZpbmQobSA9PiBtLm5hbWUucmVhZCh1bmRlZmluZWQpID09PSBuYW1lKSxcblx0XHRcdFx0XHR3YWl0Rm9yUGVuZGluZ1VwZGF0ZXM6ICgpID0+IGlubmVyLndhaXRGb3JQZW5kaW5nVXBkYXRlcygpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gd3JhcHBlZDtcblx0XHRcdH0pXG5cdFx0XHQ6IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGN1cnJlbnRNb2RlOiB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUsXG5cdFx0XHRjdXJyZW50Q2hhdE1vZGVzLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiAoKSA9PiB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Ly8gRGlyZWN0IHNldHRlciBmb3IgaG9zdHMgdGhhdCBlbWJlZCBgQ2hhdElucHV0UGFydGAgd2l0aG91dFxuXHRcdFx0Ly8gcmVnaXN0ZXJpbmcgYW4gYElDaGF0V2lkZ2V0YCAoZS5nLiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nKS5cblx0XHRcdC8vIFRoZSBwaWNrZXIgb25seSBjYWxscyB0aGlzIHdoZW4gYHNlc3Npb25SZXNvdXJjZSgpYCBpc1xuXHRcdFx0Ly8gYHVuZGVmaW5lZGA7IHJlYWwgY2hhdCB3aWRnZXRzIGtlZXAgdGhlIGNvbW1hbmQgcGF0aC5cblx0XHRcdHNldE1vZGU6IChtb2RlOiBJQ2hhdE1vZGUpID0+IHRoaXMuc2V0Q2hhdE1vZGUyKG1vZGUsIHRydWUpLFxuXHRcdFx0Y3VzdG9tQWdlbnRUYXJnZXQ6ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0cmV0dXJuIChzZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEN1c3RvbUFnZW50VGFyZ2V0Rm9yU2Vzc2lvblR5cGUoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpKSA/PyBUYXJnZXQuVW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG9wZW5QZXJtaXNzaW9uUGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMucGVybWlzc2lvbldpZGdldD8uc2hvdygpO1xuXHR9XG5cblx0cHVibGljIHNldFBlcm1pc3Npb25MZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCk6IHZvaWQge1xuXHRcdGxldmVsID0gdGhpcy5nZXRQZXJtaXR0ZWRQZXJtaXNzaW9uTGV2ZWwobGV2ZWwpO1xuXHRcdHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuc2V0KGxldmVsLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMucGVybWlzc2lvbkxldmVsS2V5LnNldChsZXZlbCk7XG5cdFx0dGhpcy5wZXJtaXNzaW9uV2lkZ2V0Py5yZWZyZXNoKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBQRVJNSVNTSU9OX0xFVkVMX09QVElPTl9JRCwgbGV2ZWwpO1xuXHRcdH1cblx0XHQvLyBMb2cgZmlyc3Qgc28gdGhlIHVwY29taW5nIF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwgd3JpdGUgY2FuIGJlIGF0dHJpYnV0ZWRcblx0XHQvLyB0byBhIHBlcm1pc3Npb24tbGV2ZWwgY2hhbmdlICh3aGljaCBhbHNvIGluZGlyZWN0bHkgd3JpdGVzIHNlbGVjdGVkTW9kZWwpLlxuXHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYHNldFBlcm1pc3Npb25MZXZlbCAtPiBfc3luY0lucHV0U3RhdGVUb01vZGVsIChsZXZlbD0ke2xldmVsfSwgY3VycmVudExhbmd1YWdlTW9kZWw9JHt0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcn0pIGluICR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9YCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKTogQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdFx0Y29uc3QgbGV2ZWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbCk7XG5cdFx0cmV0dXJuIGlzQ2hhdFBlcm1pc3Npb25MZXZlbChsZXZlbCkgPyBsZXZlbCA6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGVybWl0dGVkUGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdFx0aWYgKGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQobGV2ZWwsIGlzQXV0b0FwcHJvdmVQb2xpY3lSZXN0cmljdGVkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSkge1xuXHRcdFx0cmV0dXJuIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDtcblx0XHR9XG5cdFx0cmV0dXJuIGxldmVsO1xuXHR9XG5cblx0cHVibGljIG9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvblRhcmdldFdpZGdldD8uc2hvdygpO1xuXHR9XG5cblx0cHVibGljIG9wZW5EZWxlZ2F0aW9uUGlja2VyKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsZWdhdGlvbldpZGdldD8uc2hvdygpO1xuXHR9XG5cblx0cHVibGljIG9wZW5DaGF0U2Vzc2lvblBpY2tlcigpOiB2b2lkIHtcblx0XHQvLyBPcGVuIHRoZSBmaXJzdCBhdmFpbGFibGUgcGlja2VyIHdpZGdldFxuXHRcdGNvbnN0IGZpcnN0V2lkZ2V0ID0gdGhpcy5jaGF0U2Vzc2lvblBpY2tlcldpZGdldHM/LnZhbHVlcygpPy5uZXh0KCkudmFsdWU7XG5cdFx0Zmlyc3RXaWRnZXQ/LnNob3coKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgcGlja2VyIHdpZGdldHMgZm9yIGFsbCBvcHRpb24gZ3JvdXBzIGF2YWlsYWJsZSBmb3IgdGhlIGN1cnJlbnQgc2Vzc2lvbiB0eXBlLlxuXHQgKi9cblx0cHJpdmF0ZSBjcmVhdGVDaGF0U2Vzc2lvblBpY2tlcldpZGdldHMoYWN0aW9uOiBNZW51SXRlbUFjdGlvbiwgcGlja2VyT3B0aW9ucz86IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zKTogQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtW10ge1xuXHRcdHRoaXMuX2xhc3RTZXNzaW9uUGlja2VyQWN0aW9uID0gYWN0aW9uO1xuXHRcdHRoaXMuX2xhc3RTZXNzaW9uUGlja2VyT3B0aW9ucyA9IHBpY2tlck9wdGlvbnM7XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTtcblx0XHRjb25zdCB2aXNpYmxlT3B0aW9uR3JvdXBzID0gdGhpcy5nZXRWaXNpYmxlT3B0aW9uR3JvdXBzTW9kZUFuZFVwZGF0ZUNvbnRleHRLZXlzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF2aXNpYmxlT3B0aW9uR3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZVNlc3Npb25UeXBlID0gdGhpcy5nZXRFZmZlY3RpdmVTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZWZmZWN0aXZlU2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblxuXHRcdGNvbnN0IHdpZGdldHM6IENoYXRTZXNzaW9uUGlja2VyQWN0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBvcHRpb25Hcm91cCBvZiB2aXNpYmxlT3B0aW9uR3JvdXBzKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsSXRlbSA9IHRoaXMuZ2V0Q3VycmVudE9wdGlvbkZvckdyb3VwKG9wdGlvbkdyb3VwLmlkKTtcblx0XHRcdGNvbnN0IGluaXRpYWxTdGF0ZSA9IHsgZ3JvdXA6IG9wdGlvbkdyb3VwLCBpdGVtOiBpbml0aWFsSXRlbSB9O1xuXG5cdFx0XHQvLyBDcmVhdGUgZGVsZWdhdGUgZm9yIHRoaXMgb3B0aW9uIGdyb3VwXG5cdFx0XHRjb25zdCBpdGVtRGVsZWdhdGU6IElDaGF0U2Vzc2lvblBpY2tlckRlbGVnYXRlID0ge1xuXHRcdFx0XHRnZXRDdXJyZW50T3B0aW9uOiAoKSA9PiB0aGlzLmdldEN1cnJlbnRPcHRpb25Gb3JHcm91cChvcHRpb25Hcm91cC5pZCksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlT3B0aW9uOiB0aGlzLmdldE9yQ3JlYXRlT3B0aW9uRW1pdHRlcihvcHRpb25Hcm91cC5pZCkuZXZlbnQsXG5cdFx0XHRcdHNldE9wdGlvbjogKG9wdGlvbjogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKSA9PiB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5IGZvciB0aGlzIG9wdGlvbiBncm91cFxuXHRcdFx0XHRcdHRoaXMudXBkYXRlT3B0aW9uQ29udGV4dEtleShvcHRpb25Hcm91cC5pZCwgb3B0aW9uLmlkKTtcblx0XHRcdFx0XHR0aGlzLmdldE9yQ3JlYXRlT3B0aW9uRW1pdHRlcihvcHRpb25Hcm91cC5pZCkuZmlyZShvcHRpb24pO1xuXG5cdFx0XHRcdFx0Ly8gTm90aWZ5IHNlc3Npb24gaWYgd2UgaGF2ZSBvbmUgKG5vdCBpbiB3ZWxjb21lIHZpZXcgYmVmb3JlIHNlc3Npb24gY3JlYXRpb24pXG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbkdyb3VwLmlkLCBvcHRpb24pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFJlZnJlc2ggcGlja2VycyB0byByZS1ldmFsdWF0ZSB2aXNpYmlsaXR5IG9mIG90aGVyIG9wdGlvbiBncm91cHNcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0T3B0aW9uR3JvdXA6ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBncm91cHMgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoZWZmZWN0aXZlU2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRcdHJldHVybiBncm91cHM/LmZpbmQoZyA9PiBnLmlkID09PSBvcHRpb25Hcm91cC5pZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFNlc3Npb25SZXNvdXJjZTogKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXNzaW9uUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCBpbml0aWFsU3RhdGUsIGl0ZW1EZWxlZ2F0ZSwgcGlja2VyT3B0aW9ucyk7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cy5zZXQob3B0aW9uR3JvdXAuaWQsIHdpZGdldCk7XG5cdFx0XHR3aWRnZXRzLnB1c2god2lkZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gd2lkZ2V0cztcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGlucHV0IG1vZGVsIHJlZmVyZW5jZSBmb3Igc3luY2luZyBpbnB1dCBzdGF0ZVxuXHQgKlxuXHQgKiBOb3RlOiBXZSBoYXZlIGEgY3ljbGljIHJlZiBiZXR3ZWVuIENoYXRJbnB1dFBhcnQgYW5kIENoYXRXaWRnZXQsXG5cdCAqIFdoZW4gd2UgaW52b2tlIHNldElucHV0TW9kZWwsIHRoZSBwcm9wZXJ0eSBfd2lkZ2V0IGlzIG5vdCBzZXQuIEhlbmNlIHdlIGRvbid0IGhhdmUgdGhlIFNlc3Npb25SZXNvdXJjZS5cblx0ICogQXMgYSByZXN1bHQsIGluIHRoaXMgbWV0aG9kIHdoZW4gc3luY0Zyb21Nb2RlbCBpcyBjYWxsZWQsIHRoZSBtb2RlbCBzdGF0ZSBpcyBub3QgYXBwbGllZCB0byB0aGUgVUkuXG5cdCAqIEluc3RlYWQsIHRoZSBkZWZhdWx0cyBhcmUgY29tcHV0ZWQgYW5kIHRoZSBtb2RlbCBpcyB1cGRhdGVkIHdpdGggZGVmYXVsdCB2YWx1ZXMuIFRoZXJlYnkgYmxvd2luZyBhd2F5IG1vZGVsIGluZm9ybWF0aW9uLlxuXHQgKiBTZXR0aW5nIFdpZGdldCBhbmQgdGhlbiBjYWxsaW5nIHRoaXMgZG9lc24ndCB3b3JrIGVpdGhlciBiZWNhdXNlIHRoZSB3aWRnZXQgYWxzbyByZWxpZXMgb24gQ2hhdElucHV0UGFydCAoaGVuY2UgY3ljbGljIHJlZikuXG5cdCAqIFNvbHV0aW9uIGlzIHRvIHBhc3MgdGhlIFNlc3Npb25SZXNvdXJjZSBhcyBhbiBhcmd1bWVudCB0byB0aGlzIG1ldGhvZC5cblx0Ki9cblx0c2V0SW5wdXRNb2RlbChtb2RlbDogSUlucHV0TW9kZWwsIGNoYXRTZXNzaW9uSXNFbXB0eTogYm9vbGVhbiwgZm9yU2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBQYXNzIHRoZSBPVVRHT0lORyBzZXNzaW9uJ3MgaW5wdXQgc3RhdGUgYXMgb2xkU3RhdGUgc28gd2UgY2FuIHNlZSB3aGF0XG5cdFx0Ly8gbW9kZWwgdGhlIHByZXZpb3VzIHNlc3Npb24gd2FzIGhvbGRpbmcgcmlnaHQgYmVmb3JlIHdlIHN3YXAgaXQgb3V0LlxuXHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYHNldElucHV0TW9kZWwgZm9yICR7Zm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IChjaGF0U2Vzc2lvbklzRW1wdHk9JHtjaGF0U2Vzc2lvbklzRW1wdHl9LCBvdXRnb2luZy5faW5wdXRNb2RlbD0ke3RoaXMuX2lucHV0TW9kZWwgPyAncHJlc2VudCcgOiAndW5kZWZpbmVkJ30pYCwgbW9kZWwuc3RhdGUuZ2V0KCksIHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlLmdldCgpLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdC8vIEZsdXNoIGN1cnJlbnQgc3RhdGUgdG8gdGhlIG91dGdvaW5nIG1vZGVsIGJlZm9yZSBzd2l0Y2hpbmcsXG5cdFx0Ly8gc28gaXQgcHJlc2VydmVzIHRoZSBsYXRlc3QgcGVybWlzc2lvbiBsZXZlbCBhbmQgb3RoZXIgcGlja2VyIHN0YXRlLlxuXHRcdGlmICh0aGlzLl9pbnB1dE1vZGVsKSB7XG5cdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBbRkxVU0gtUFJFXSBzZXRJbnB1dE1vZGVsIHByZS1mbHVzaCBib3VuZElucHV0TW9kZWxTZXNzaW9uPSR7dGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKX0gd2lkZ2V0U2Vzc2lvbj0ke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSBpbmNvbWluZz0ke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIHVuZGVmaW5lZCwgdGhpcy5faW5wdXRNb2RlbC5zdGF0ZS5nZXQoKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShmb3JTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2lucHV0TW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlID0gZm9yU2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMuX21vZGVsU3luY0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgY2hhdE1vZGVzID0gdGhpcy5jaGF0TW9kZVNlcnZpY2UuY3JlYXRlTW9kZXMoZm9yU2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jdXJyZW50Q2hhdE1vZGVzLnZhbHVlID0gY2hhdE1vZGVzO1xuXHRcdHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLnNldChjaGF0TW9kZXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5zZWxlY3RlZFRvb2xzTW9kZWwucmVzZXRTZXNzaW9uRW5hYmxlbWVudFN0YXRlKCk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5ID0gaXNOZXdDb252ZXJzYXRpb24oZm9yU2Vzc2lvblJlc291cmNlLCBjaGF0U2Vzc2lvbklzRW1wdHkpO1xuXHRcdC8vIEEgc2Vzc2lvbiB0aGF0IHdhcyBqdXN0IG9wZW5lZCBzdGFydHMgd2l0aCBubyBleHBsaWNpdCBpbi1jb252ZXJzYXRpb24gbW9kZWxcblx0XHQvLyBwaWNrLCBzbyB0aGUgY29uZmlndXJlZCBkZWZhdWx0IChlLmcuIGVudGVycHJpc2UgcG9saWN5KSBpcyBhZ2FpbiBhbGxvd2VkXG5cdFx0Ly8gdG8gd2luIGZvciBhIG5ldyBlbXB0eSBjb252ZXJzYXRpb24uXG5cdFx0Ly8gQ29tcHV0ZSB0aGUgbW9kZWwtc2VsZWN0aW9uIGRlY2lzaW9ucyBmb3IgdGhpcyBzZXNzaW9uIHN3aXRjaC4gVGhleSBhcmUgYXBwbGllZCB3aGlsZSB0aGVcblx0XHQvLyBpbnB1dCBhbmQgdmlldyBtb2RlbCBmaW5pc2ggd2lyaW5nIHRvZ2V0aGVyLCB0aGVuIGNsZWFyZWQgaW4gdGhlIHZpZXctbW9kZWwtY2hhbmdlIGZpbmFsbHkuXG5cdFx0Y29uc3Qgb3duc1Bvb2wgPSAhIXRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSAmJiB0aGlzLnNlc3Npb25UeXBlSGFzT3duTW9kZWxQb29sKHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgaGFkSW5jb21pbmdNb2RlbCA9ICEhbW9kZWwuc3RhdGUuZ2V0KCk/LnNlbGVjdGVkTW9kZWw7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmJlZ2luU2Vzc2lvblN3aXRjaCh0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHksIG93bnNQb29sLCBoYWRJbmNvbWluZ01vZGVsKTtcblxuXHRcdGlmICh0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHkpIHtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZFN0YXRlID0gbW9kZWwuc3RhdGUuZ2V0KCkgPyB1bmRlZmluZWQgOiB0aGlzLl9nZXRQZXJzaXN0ZWRFbXB0eUlucHV0U3RhdGUoKTtcblx0XHRcdGlmIChwZXJzaXN0ZWRTdGF0ZSkge1xuXHRcdFx0XHRtb2RlbC5zZXRTdGF0ZShwZXJzaXN0ZWRTdGF0ZSk7XG5cdFx0XHRcdHRoaXMuX3N5bmNGcm9tTW9kZWwocGVyc2lzdGVkU3RhdGUsIGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zZXRFbXB0eU1vZGVsU3RhdGUoKTtcblxuXHRcdFx0Ly8gVGhlIGRlZmF1bHQgbW9kZSBzZXR0aW5nIG1heSBiZSByZWdpc3RlcmVkIGFzeW5jaHJvbm91c2x5IGJ5IFRBUyxcblx0XHRcdC8vIGFuZCBjdXN0b20gbW9kZXMgKGxpa2UgUGxhbikgbG9hZCBhc3luY2hyb25vdXNseSBmcm9tIHByb21wdCBmaWxlcy5cblx0XHRcdC8vIFJlLWFwcGx5IHdoZW4gZWl0aGVyIGJlY29tZXMgYXZhaWxhYmxlLlxuXHRcdFx0dGhpcy5fbW9kZWxTeW5jRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5ICYmIGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE5ld1Nlc3Npb25Nb2RlKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEVtcHR5TW9kZWxTdGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9tb2RlbFN5bmNEaXNwb3NhYmxlcy5hZGQodGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUuZ2V0KCkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0RW1wdHlNb2RlbFN0YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBbQVVUT1JVTi1SRUddIExvZyB0aGUgbW9tZW50IHRoZSBtb2RlbC0+dmlldyBhdXRvcnVuIGlzIHJlZ2lzdGVyZWQsIHNvIHdlIGNhbiBzZWVcblx0XHQvLyB3aGV0aGVyIHdpZGdldC52aWV3TW9kZWwgc3RpbGwgcG9pbnRzIGF0IHRoZSBPVVRHT0lORyBzZXNzaW9uIGF0IHJlZ2lzdHJhdGlvbiB0aW1lXG5cdFx0Ly8gKHdoaWNoIHdvdWxkIGNhdXNlIHRoZSB2ZXJ5IGZpcnN0IHJ1biB0byBiZSBmbGFnZ2VkIHN0YWxlIGFuZCBza2lwcGVkKS5cblx0XHRjb25zdCB3aWRnZXRWaWV3TW9kZWxTZXNzaW9uID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBpc1N0YWxlQXRSZWdpc3RyYXRpb24gPSAhIXdpZGdldFZpZXdNb2RlbFNlc3Npb24gJiYgIWlzRXF1YWwod2lkZ2V0Vmlld01vZGVsU2Vzc2lvbiwgZm9yU2Vzc2lvblJlc291cmNlKTtcblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBbQVVUT1JVTi1SRUddIHJlZ2lzdGVyaW5nIG1vZGVsLT52aWV3IGF1dG9ydW4gZm9yICR7Zm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9LCB3aWRnZXRTZXNzaW9uPSR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9LCB3aWRnZXRWaWV3TW9kZWxTZXNzaW9uPSR7d2lkZ2V0Vmlld01vZGVsU2Vzc2lvbj8udG9TdHJpbmcoKX0sIGlzU3RhbGVBdFJlZ2lzdHJhdGlvbj0ke2lzU3RhbGVBdFJlZ2lzdHJhdGlvbn0sIG1vZGVsLnN0YXRlLnNlbGVjdGVkTW9kZWw9JHttb2RlbC5zdGF0ZS5nZXQoKT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn0sIF9jdXJyZW50TGFuZ3VhZ2VNb2RlbD0ke3RoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyfWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0Ly8gT2JzZXJ2ZSBjaGFuZ2VzIGZyb20gbW9kZWwgYW5kIHN5bmMgdG8gdmlld1xuXHRcdHRoaXMuX21vZGVsU3luY0Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRsZXQgc3RhdGUgPSBtb2RlbC5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgbWVzc2FnZSA9IGBzeW5jaW5nIGZyb20gbW9kZWwgZm9yICR7Zm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGluICR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9YDtcblx0XHRcdGlmICghc3RhdGUgJiYgdGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5KSB7XG5cdFx0XHRcdHN0YXRlID0gdGhpcy5fZ2V0UGVyc2lzdGVkRW1wdHlJbnB1dFN0YXRlKCk7XG5cdFx0XHRcdG1lc3NhZ2UgPSBgc3luY2luZyBmcm9tIGVtcHR5IGlucHV0IHN0YXRlIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWA7XG5cdFx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnJlc29sdmVEcmFmdE1vZGVsKHN0YXRlLnNlbGVjdGVkTW9kZWwsIHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSwgZmFsc2UpO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZC5jaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRzdGF0ZSA9IHsgLi4uc3RhdGUsIHNlbGVjdGVkTW9kZWw6IHJlc29sdmVkLm1vZGVsLCBtb2RlbENvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gRGV0ZWN0IGF1dG9ydW4gZmlyaW5nIGZvciBhIHNlc3Npb24gdGhhdCBpcyBubyBsb25nZXIgdGhlIHdpZGdldCdzXG5cdFx0XHQvLyBhY3RpdmUgc2Vzc2lvbiAtIGluZGljYXRlcyBhIGxhdGUvc3RhbGUgbW9kZWwuc3RhdGUucmVhZCgpIGxhbmRlZCBmb3Jcblx0XHRcdC8vIHRoZSBvdXRnb2luZyBzZXNzaW9uLlxuXHRcdFx0Y29uc3Qgd2lkZ2V0U2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGNvbnN0IGlzU3RhbGVTZXNzaW9uID1cblx0XHRcdFx0ISF0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlICYmICFpc0VxdWFsKHRoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2UsIGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoaXNTdGFsZVNlc3Npb24pIHtcblx0XHRcdFx0bWVzc2FnZSA9IGBbU1RBTEUtU0VTU0lPTi1BVVRPUlVOXSAke21lc3NhZ2V9ICh3aWRnZXQgbm93IG9uICR7d2lkZ2V0U2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfSwgJHt0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfSwgJHtmb3JTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gaXMgb2xkKWA7XG5cdFx0XHR9XG5cdFx0XHQvLyBVbnRyYWNrZWQgcmVhZDogd2Ugb25seSB3YW50IGEgc25hcHNob3QgZm9yIHRoZSBsb2csIG5vdCBhIGRlcGVuZGVuY3lcblx0XHRcdC8vIHRoYXQgd291bGQgcmUtdHJpZ2dlciB0aGlzIGF1dG9ydW4uXG5cdFx0XHRjb25zdCBwcmV2U3RhdGUgPSB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIG1lc3NhZ2UsIHN0YXRlLCBwcmV2U3RhdGUsIHRoaXMubG9nU2VydmljZSk7XG5cblx0XHRcdC8vIEEgc3RhbGUgYXV0b3J1biBtdXN0IE5PVCB3cml0ZSB0aGUgb3V0Z29pbmcgc2Vzc2lvbidzIG1vZGVsIGludG8gdGhlXG5cdFx0XHQvLyBzaGFyZWQgX2N1cnJlbnRMYW5ndWFnZU1vZGVsIFx1MjAxNCBkb2luZyBzbyBvdmVyd3JpdGVzIHRoZSBhY3RpdmUgc2Vzc2lvbidzXG5cdFx0XHQvLyBzZWxlY3Rpb24gKGUuZy4gZmxpcHMgaXQgdG8gQXV0bykuIFRoZSBhY3RpdmUgc2Vzc2lvbiBoYXMgaXRzIG93biBhdXRvcnVuXG5cdFx0XHQvLyB0aGF0IHN5bmNzIHRoZSBjb3JyZWN0IG1vZGVsLlxuXHRcdFx0aWYgKGlzU3RhbGVTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N5bmNGcm9tTW9kZWwoc3RhdGUsIGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UGVyc2lzdGVkRW1wdHlJbnB1dFN0YXRlKCk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgc3RhdGUgPSB0aGlzLl9lbXB0eUlucHV0U3RhdGUucmVhZCh1bmRlZmluZWQpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVyc2lzdGVkQXR0YWNobWVudHMgPSB0aGlzLl9lbXB0eUlucHV0QXR0YWNobWVudHMucmVhZCh1bmRlZmluZWQpO1xuXHRcdHN0YXRlID0ge1xuXHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRhdHRhY2htZW50czogcGVyc2lzdGVkQXR0YWNobWVudHMubGVuZ3RoID4gMCA/IHBlcnNpc3RlZEF0dGFjaG1lbnRzIDogc3RhdGUuYXR0YWNobWVudHMsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnJlc29sdmVEcmFmdE1vZGVsKHN0YXRlLnNlbGVjdGVkTW9kZWwsIHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSwgdHJ1ZSk7XG5cdFx0aWYgKHJlc29sdmVkLmNoYW5nZWQpIHtcblx0XHRcdHN0YXRlID0geyAuLi5zdGF0ZSwgc2VsZWN0ZWRNb2RlbDogcmVzb2x2ZWQubW9kZWwsIG1vZGVsQ29uZmlndXJhdGlvbjogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW1wdHlNb2RlbFN0YXRlKCkge1xuXHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYHNldHRpbmcgZW1wdHkgbW9kZWwgc3RhdGUgZm9yICR7dGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGN1cnJlbnRMZXZlbCA9IHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlPy5nZXQoKT8ucGVybWlzc2lvbkxldmVsO1xuXHRcdGlmIChjdXJyZW50TGV2ZWwgPT09IHVuZGVmaW5lZCB8fCAhaXNDaGF0UGVybWlzc2lvbkxldmVsKGN1cnJlbnRMZXZlbCkpIHtcblx0XHRcdHRoaXMuc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuZ2V0RGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzKSB7XG5cdFx0XHQvLyBCZSBkZXRlcm1pbmlzdGljIGZvciBhbm9ueW1vdXMgdXNlcnMgdG8gc3VwcG9ydFxuXHRcdFx0Ly8gYWdlbnRpYyBmbG93cyB3aXRoIGRlZmF1bHQgbW9kZWwuXG5cdFx0XHR0aGlzLnNldENoYXRNb2RlKENoYXRNb2RlS2luZC5BZ2VudCwgZmFsc2UpO1xuXHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd0RlZmF1bHRNb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZSk7XG5cdFx0aWYgKHR5cGVvZiByYXdEZWZhdWx0TW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlID0gcmF3RGVmYXVsdE1vZGUudHJpbSgpO1xuXHRcdFx0aWYgKGRlZmF1bHRNb2RlKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlTG93ZXIgPSBkZWZhdWx0TW9kZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IG1vZGVzLmZpbmRNb2RlQnlJZChkZWZhdWx0TW9kZSlcblx0XHRcdFx0XHQ/PyBtb2Rlcy5maW5kTW9kZUJ5TmFtZShkZWZhdWx0TW9kZSlcblx0XHRcdFx0XHQ/PyBtb2Rlcy5jdXN0b20uZmluZChtID0+IG0ubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSBkZWZhdWx0TW9kZUxvd2VyKTtcblx0XHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdElucHV0UGFydF0gQXBwbHlpbmcgZGVmYXVsdCBtb2RlIGZyb20gc2V0dGluZzogJHtkZWZhdWx0TW9kZX0gLT4gJHtyZXNvbHZlZC5pZH1gKTtcblx0XHRcdFx0XHR0aGlzLnNldENoYXRNb2RlKHJlc29sdmVkLmlkLCBmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN5bmMgZnJvbSBtb2RlbCB0byB2aWV3ICh3aGVuIG1vZGVsIHN0YXRlIGNoYW5nZXMpXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jRnJvbU1vZGVsKHN0YXRlOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCwgZm9yU2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBQcmV2ZW50IGNpcmN1bGFyIHVwZGF0ZXNcblx0XHRpZiAodGhpcy5faXNTeW5jaW5nVG9PckZyb21JbnB1dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzU3luY2luZ1RvT3JGcm9tSW5wdXRNb2RlbCA9IHRydWU7XG5cblx0XHRcdC8vIFN5bmMgbW9kZVxuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpO1xuXHRcdFx0XHRpZiAoY3VycmVudE1vZGUuaWQgIT09IHN0YXRlLm1vZGUuaWQpIHtcblx0XHRcdFx0XHR0aGlzLnNldENoYXRNb2RlKHN0YXRlLm1vZGUuaWQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIHNlbGVjdGVkIG1vZGVsIC0gdmFsaWRhdGUgaXQgYmVsb25ncyB0byB0aGUgY3VycmVudCBzZXNzaW9uJ3MgbW9kZWwgcG9vbFxuXHRcdFx0aWYgKHN0YXRlPy5zZWxlY3RlZE1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5zeW5jRnJvbUNvbnZlcnNhdGlvblN0YXRlKHN0YXRlLnNlbGVjdGVkTW9kZWwsIHN0YXRlLm1vZGVsQ29uZmlndXJhdGlvbiwgc2Vzc2lvblR5cGUsIGZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCBzdGF0ZS5vcmlnaW4gPT09IENoYXRJbnB1dFN0YXRlT3JpZ2luLlJlbW90ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXRlKSB7XG5cdFx0XHRcdC8vIHN0YXRlIGV4aXN0cyBidXQgc3RhdGUuc2VsZWN0ZWRNb2RlbCBpcyB1bmRlZmluZWQgLSBzeW5jIGlzIGEgTk8tT1AsXG5cdFx0XHRcdC8vIGJ1dCByZWNvcmQgaXQgc28gd2UgY2FuIHNlZSB3aGVuIGEgc2Vzc2lvbidzIHBlcnNpc3RlZCBzdGF0ZSBsb3N0IGl0cyBtb2RlbC5cblx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcy5yZXBvcnQoJ2NvbnZlcnNhdGlvbi1zdGF0ZS13aXRob3V0LW1vZGVsJywge1xuXHRcdFx0XHRcdGNvbnZlcnNhdGlvbjogZm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y3VycmVudE1vZGVsOiB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcixcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN5bmMgYXR0YWNobWVudHNcblx0XHRcdGNvbnN0IGN1cnJlbnRBdHRhY2htZW50cyA9IHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50cztcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5fYXR0YWNobWVudE1vZGVsLmNsZWFyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKCFhcnJheXNFcXVhbChjdXJyZW50QXR0YWNobWVudHMsIHN0YXRlLmF0dGFjaG1lbnRzKSkge1xuXHRcdFx0XHR0aGlzLl9hdHRhY2htZW50TW9kZWwuY2xlYXJBbmRTZXRDb250ZXh0KC4uLnN0YXRlLmF0dGFjaG1lbnRzKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU3luYyBpbnB1dCB0ZXh0XG5cdFx0XHRpZiAodGhpcy5faW5wdXRFZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRFZGl0b3Iuc2V0VmFsdWUoc3RhdGU/LmlucHV0VGV4dCB8fCAnJyk7XG5cdFx0XHRcdGlmIChzdGF0ZT8uc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLl9pbnB1dEVkaXRvci5zZXRTZWxlY3Rpb25zKHN0YXRlLnNlbGVjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN5bmMgcGVybWlzc2lvbiBsZXZlbCAoc2tpcCBpZiBnbG9iYWwgYXV0by1hcHByb3ZlIGlzIG9uLCBzbyB0aGUgcGlja2VyIHN0YXlzIHVuY2hhbmdlZClcblx0XHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSkpIHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0TGV2ZWwgPSB0aGlzLmdldFBlcm1pdHRlZFBlcm1pc3Npb25MZXZlbChzdGF0ZT8ucGVybWlzc2lvbkxldmVsID8/IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpICE9PSB0YXJnZXRMZXZlbCkge1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuc2V0KHRhcmdldExldmVsLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbkxldmVsS2V5LnNldCh0YXJnZXRMZXZlbCk7XG5cdFx0XHRcdFx0dGhpcy5wZXJtaXNzaW9uV2lkZ2V0Py5yZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX3dpZGdldD8uY29udHJpYnMuZm9yRWFjaChjb250cmliID0+IHtcblx0XHRcdFx0XHRjb250cmliLnNldElucHV0U3RhdGU/LihzdGF0ZS5jb250cmliKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzU3luY2luZ1RvT3JGcm9tSW5wdXRNb2RlbCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fc3luY1RleHREZWJvdW5jZWQuY2FuY2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN5bmMgY3VycmVudCBpbnB1dCBzdGF0ZSB0byB0aGUgaW5wdXQgbW9kZWxcblx0ICovXG5cdHByaXZhdGUgX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNTeW5jaW5nVG9PckZyb21JbnB1dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNTeW5jaW5nVG9PckZyb21JbnB1dE1vZGVsID0gdHJ1ZTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0Q3VycmVudElucHV0U3RhdGUoKTtcblx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9lbXB0eUlucHV0U3RhdGUuc2V0KHN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHQvLyBQYXNzIHRoZSBhY3R1YWwgbmV3U3RhdGUgYW5kIHRoZSBwcmV2aW91cyBzdGF0ZSBzbyBtb2RlbC1pZGVudGlmaWVyXG5cdFx0Ly8gdHJhbnNpdGlvbnMgKGluY2x1ZGluZyB0cmFuc2l0aW9ucyB0by9mcm9tIHVuZGVmaW5lZCkgYXJlIHZpc2libGUuXG5cdFx0Y29uc3QgcHJldlN0YXRlID0gdGhpcy5faW5wdXRNb2RlbD8uc3RhdGUuZ2V0KCk7XG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCBib3VuZElucHV0TW9kZWxTZXNzaW9uPSR7dGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKX0gd2lkZ2V0U2Vzc2lvbj0ke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSBtaXNtYXRjaD0ke3RoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCkgIT09IHRoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWAsIHN0YXRlLCBwcmV2U3RhdGUsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0dGhpcy5faW5wdXRNb2RlbD8uc2V0U3RhdGUoc3RhdGUpO1xuXHRcdHRoaXMuX2lzU3luY2luZ1RvT3JGcm9tSW5wdXRNb2RlbCA9IGZhbHNlO1xuXG5cdFx0Ly8gU29tZSBwaWNrZXIgbGFiZWwgY2hhbmdlZCBzaXplOyByZS1ldmFsdWF0ZSB0b29sYmFyIG92ZXJmbG93XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyPy5yZWxheW91dCgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGbHVzaCB0aGUgY3VycmVudCBpbnB1dCBzdGF0ZSB0byB0aGUgYm91bmQgaW5wdXQgbW9kZWwuIFVzZSB0aGlzIGJlZm9yZVxuXHQgKiB0aGUgaG9zdCByZWxlYXNlcyBpdHMgbW9kZWwgcmVmZXJlbmNlIChlLmcuIG9uIHNlc3Npb24gc3dpdGNoKSB0byBlbnN1cmVcblx0ICogYW4gdW5zZW50IGRyYWZ0IGlzIGNhcHR1cmVkIGJ5IGB3aWxsRGlzcG9zZU1vZGVsYCBwZXJzaXN0ZW5jZS5cblx0ICovXG5cdHB1YmxpYyBmbHVzaElucHV0U3RhdGVUb01vZGVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pbnB1dE1vZGVsKSB7XG5cdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3VycmVudExhbmd1YWdlTW9kZWwobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgaXNVc2VyQWN0aW9uID0gZmFsc2UsIHN0b3JlU2VsZWN0aW9uOiBib29sZWFuID0gaXNVc2VyQWN0aW9uKSB7XG5cdFx0Y29uc3QgcGVyc2lzdFNlbGVjdGlvbiA9IGlzVXNlckFjdGlvbiAmJiBzdG9yZVNlbGVjdGlvbjtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzLnJlcG9ydCgnc2V0LW1vZGVsJywge1xuXHRcdFx0bW9kZWw6IG1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRpc1VzZXJBY3Rpb24sXG5cdFx0XHRwZXJzaXN0U2VsZWN0aW9uLFxuXHRcdFx0YXZhaWxhYmxlOiB0aGlzLmdldE1vZGVscygpLmxlbmd0aCxcblx0XHR9LCAnaW5mbycpO1xuXHRcdGNvbnN0IGFwcGx5ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGgpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jYWNoZWRXaWR0aCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGVyc2lzdFNlbGVjdGlvbikge1xuXHRcdFx0XHRzdG9yZVNlbGVjdGVkTW9kZWwodGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy5sb2NhdGlvbiwgdGhpcy5nZXRTZWxlY3RlZE1vZGVsVGFyZ2V0KCksIG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuYXBwbHlTZWxlY3Rpb24obW9kZWwsIGFwcGx5LCBpc1VzZXJBY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlQcm9ncmFtbWF0aWNMYW5ndWFnZU1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuYXBwbHlQcm9ncmFtbWF0aWNTZWxlY3Rpb24obW9kZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWVzdFByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwocmVzb2x2ZU1vZGVsOiAoKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIucmVxdWVzdFByb2dyYW1tYXRpY1NlbGVjdGlvbihcblx0XHRcdHJlc29sdmVNb2RlbCxcblx0XHRcdHRoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCksXG5cdFx0KTtcblx0XHR0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpO1xuXHRcdHZvaWQgcmVzdWx0LmZpbmFsbHkoKCkgPT4gdGhpcy5fdXBkYXRlSW5wdXRDb250ZW50Q29udGV4dEtleXMoKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCeSBJRC0gcHJlZmVyIHRoaXMgbWV0aG9kXG5cdCAqL1xuXHRzZXRDaGF0TW9kZShtb2RlOiBDaGF0TW9kZUtpbmQgfCBzdHJpbmcsIHN0b3JlU2VsZWN0aW9uID0gdHJ1ZSwgaXNVc2VySW5pdGlhdGVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpO1xuXHRcdGNvbnN0IG1vZGUyID0gbW9kZXMuZmluZE1vZGVCeUlkKG1vZGUpID8/XG5cdFx0XHRtb2Rlcy5maW5kTW9kZUJ5TmFtZShtb2RlKSA/P1xuXHRcdFx0bW9kZXMuZmluZE1vZGVCeUlkKENoYXRNb2RlS2luZC5BZ2VudCkgPz9cblx0XHRcdENoYXRNb2RlLkFzaztcblx0XHR0aGlzLnNldENoYXRNb2RlMihtb2RlMiwgc3RvcmVTZWxlY3Rpb24sIGlzVXNlckluaXRpYXRlZCk7XG5cdH1cblxuXHRwcml2YXRlIHNldENoYXRNb2RlMihtb2RlOiBJQ2hhdE1vZGUsIHN0b3JlU2VsZWN0aW9uID0gdHJ1ZSwgaXNVc2VySW5pdGlhdGVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuc2V0KG1vZGUsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUuZmlyZSh7IGlzVXNlckluaXRpYXRlZCB9KTtcblxuXHRcdGlmIChzdG9yZVNlbGVjdGlvbikge1xuXHRcdFx0Ly8gU3luYyB0byBtb2RlbCAobW9kZSBpcyBub3cgcGVyc2lzdGVkIGluIHRoZSBtb2RlbCdzIGlucHV0IHN0YXRlKVxuXHRcdFx0Ly8gTG9nIGZpcnN0IHNvIHRoZSB1cGNvbWluZyBfc3luY0lucHV0U3RhdGVUb01vZGVsIHdyaXRlIGNhbiBiZSBhdHRyaWJ1dGVkXG5cdFx0XHQvLyB0byBhIG1vZGUgY2hhbmdlLlxuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgc2V0Q2hhdE1vZGUyIC0+IF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwgKG1vZGU9JHttb2RlLmlkfSwgc3RvcmVTZWxlY3Rpb249JHtzdG9yZVNlbGVjdGlvbn0sIGlzVXNlckluaXRpYXRlZD0ke2lzVXNlckluaXRpYXRlZH0sIGN1cnJlbnRMYW5ndWFnZU1vZGVsPSR7dGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/LmlkZW50aWZpZXJ9KSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgbW9kZWxzIG1lcmdlZCBmcm9tIGxpdmUgYW5kIGNhY2hlLCB3aXRob3V0IHNlc3Npb24vbW9kZSBmaWx0ZXJpbmcuXG5cdCAqIFRoaXMgaXMgdGhlIGNhbm9uaWNhbCBzb3VyY2UgZm9yIHRoZSBmdWxsIG1vZGVsIHBvb2wsIGluY2x1ZGluZyBjYWNoZWQgbW9kZWxzXG5cdCAqIHRoYXQgYnJpZGdlIHN0YXJ0dXAgcmFjZXMgd2hlbiBsaXZlIG1vZGVscyBoYXZlbid0IGxvYWRlZCB5ZXQuXG5cdCAqL1xuXHRwcml2YXRlIGdldEFsbE1lcmdlZE1vZGVscygpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgY2FjaGVkTW9kZWxzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10+KENhY2hlZExhbmd1YWdlTW9kZWxzS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFtdKTtcblx0XHRjb25zdCBsaXZlTW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpXG5cdFx0XHQubWFwKG1vZGVsSWQgPT4gKHsgaWRlbnRpZmllcjogbW9kZWxJZCwgbWV0YWRhdGE6IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCkhIH0pKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkVmVuZG9ycyA9IG5ldyBTZXQodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0VmVuZG9ycygpLm1hcCh2ID0+IHYudmVuZG9yKSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRWZW5kb3JzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB2IG9mIGNvbnRyaWJ1dGVkVmVuZG9ycykge1xuXHRcdFx0aWYgKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmhhc1Jlc29sdmVkVmVuZG9yKHYpKSB7XG5cdFx0XHRcdHJlc29sdmVkVmVuZG9ycy5hZGQodik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVscyA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKGxpdmVNb2RlbHMsIGNhY2hlZE1vZGVscywgY29udHJpYnV0ZWRWZW5kb3JzLCByZXNvbHZlZFZlbmRvcnMpO1xuXHRcdC8vIFBlcnNpc3Qgd2hlbmV2ZXIgd2UgaGF2ZSBhbnkgYXV0aG9yaXRhdGl2ZSBpbmZvcm1hdGlvbiBcdTIwMTQgZWl0aGVyIGxpdmVcblx0XHQvLyBtb2RlbHMsIG9yIGF0IGxlYXN0IG9uZSByZXNvbHZlZCB2ZW5kb3IgKHNvIGNhY2hlIGV2aWN0aW9uIHN0aWNrcykuXG5cdFx0aWYgKGxpdmVNb2RlbHMubGVuZ3RoID4gMCB8fCByZXNvbHZlZFZlbmRvcnMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2FjaGVkTGFuZ3VhZ2VNb2RlbHNLZXksIG1vZGVscywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbHMoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10ge1xuXHRcdHJldHVybiB0aGlzLmdldE1vZGVsc0ZvclNlc3Npb25UeXBlKHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUgY2FuIGZhbGwgYmFjayB0byB0aGUgc3ludGhldGljIFwiQXV0b1wiXG5cdCAqIG1vZGVsLiBEZWZhdWx0cyB0byBgdHJ1ZWAgd2hlbiBubyBzZXNzaW9uIHR5cGUgaXMgc2V0LiBTZWVcblx0ICoge0BsaW5rIGhhc05vQXZhaWxhYmxlTW9kZWx9IGZvciB0aGUgXCJub3RoaW5nIHRvIHNlbmQgd2l0aFwiIHN0YXRlLCB3aGljaFxuXHQgKiBhZGRpdGlvbmFsbHkgcmVxdWlyZXMgYW4gZW1wdHkgbW9kZWwgbGlzdC5cblx0ICovXG5cdHByaXZhdGUgX3Nob3dBdXRvTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdHJldHVybiAhc2Vzc2lvblR5cGUgfHwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUgY2Fubm90IGZhbGwgYmFjayB0byB0aGUgQXV0byBtb2RlbFxuXHQgKiBhbmQgbm8gbW9kZWxzIGFyZSBhdmFpbGFibGUgdG8gaXQgXHUyMDE0IGUuZy4gdGhlIENsYXVkZSBhZ2VudCBob3N0IGZvciBhXG5cdCAqIENvcGlsb3QgRnJlZSAvIFN0dWRlbnQgdXNlci4gSW4gdGhpcyBzdGF0ZSB0aGVyZSBpcyBubyBtb2RlbCB0byBzZW5kIGFcblx0ICogcmVxdWVzdCB3aXRoLCBzbyBzZW5kaW5nIGlzIGJsb2NrZWQuXG5cdCAqL1xuXHRwcml2YXRlIGhhc05vQXZhaWxhYmxlTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9zaG93QXV0b01vZGVsKCkgJiYgdGhpcy5nZXRNb2RlbHMoKS5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gdGhpcy5nZXRBbGxNZXJnZWRNb2RlbHMoKTtcblxuXHRcdC8vIFNlc3Npb24gb3ducyBhIHBvb2wgYnV0IG5vIHRhcmdldGVkIG1vZGVscyByZWdpc3RlcmVkIHlldDogcmV0dXJuIGVtcHR5IHNvIGNhbGxlcnMgZG9uJ3QgdHJlYXQgZ2VuZXJhbC1wb29sIG1vZGVscyBhcyB2YWxpZC5cblx0XHRpZiAoc2Vzc2lvblR5cGVcblx0XHRcdCYmIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKVxuXHRcdFx0JiYgIWhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24oYWxsTW9kZWxzLCBzZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRhbGxNb2RlbHMuc29ydCgoYSwgYikgPT4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uRmlsdGVyZWQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKGFsbE1vZGVscywgc2Vzc2lvblR5cGUsIHRoaXMuY3VycmVudE1vZGVLaW5kLCB0aGlzLmxvY2F0aW9uKTtcblx0XHRyZXR1cm4gc2Vzc2lvbkZpbHRlcmVkLmZpbHRlcihtID0+ICFpc01vZGVsSGlkZGVuSW5QaWNrZXIobSwgaWQgPT4gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuaXNNb2RlbEhpZGRlbihpZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNoYXQgc2Vzc2lvbiB0eXBlIGZvciB0aGUgY3VycmVudCBzZXNzaW9uLCBpZiBhbnkuXG5cdCAqXG5cdCAqIE9uY2UgYSByZWFsIHNlc3Npb24gZXhpc3RzLCB0aGUgc2Vzc2lvbiByZXNvdXJjZSBpcyB0aGUgYXV0aG9yaXRhdGl2ZVxuXHQgKiBzb3VyY2UgZm9yIHdoaWNoIG1vZGVscyBhcmUgdmFsaWQuIFRoZSBwaWNrZXIgZGVsZWdhdGUgb25seSBkZXNjcmliZXMgdGhlXG5cdCAqIHdlbGNvbWUvbmV3LXNlc3Npb24gc2VsZWN0aW9uLCB3aGljaCBtYXkgbm90IG1hdGNoIHRoZSBzZXNzaW9uIHRoYXQgd2FzXG5cdCAqIHVsdGltYXRlbHkgY3JlYXRlZCAoZS5nLiBhbiBhZ2VudC1ob3N0IHBpY2sgdGhhdCBmZWxsIGJhY2sgdG8gYW5cblx0ICogaW4tcHJvY2VzcyBgbG9jYWxgIHNlc3Npb24pLiBQcmVmZXJyaW5nIHRoZSBkZWxlZ2F0ZSBpbiB0aGF0IGNhc2UgbGV0cyBhblxuXHQgKiBhZ2VudC1ob3N0IG1vZGVsIGxlYWsgaW50byBhIGxvY2FsIHNlc3Npb24ncyBwb29sLCBzbyB3ZSBvbmx5IGNvbnN1bHQgdGhlXG5cdCAqIGRlbGVnYXRlIHdoZW4gdGhlcmUgaXMgbm8gc2Vzc2lvbiB5ZXQgKHRoZSB3ZWxjb21lIHZpZXcgaGFzIG5vIHZpZXcgbW9kZWwpLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDdXJyZW50U2Vzc2lvblR5cGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLm1vZGVsUGlja2VyU2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiB0aGlzLm9wdGlvbnMubW9kZWxQaWNrZXJTZXNzaW9uVHlwZTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNldCB0aGUgY3VycmVudCBtb2RlIHdoZW4gaXQgaXMgbm90IHZhbGlkIGZvciB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUuXG5cdCAqL1xuXHRwcml2YXRlIGNoZWNrTW9kZUluU2Vzc2lvblBvb2woc2Vzc2lvblR5cGU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXN0b21BZ2VudFRhcmdldCA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoIWN1c3RvbUFnZW50VGFyZ2V0IHx8IGN1c3RvbUFnZW50VGFyZ2V0ID09PSBUYXJnZXQuVW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnRNb2RlLmlkID09PSBDaGF0TW9kZS5BZ2VudC5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudE1vZGUuaXNCdWlsdGluKSB7XG5cdFx0XHR0aGlzLnNldENoYXRNb2RlKENoYXRNb2RlS2luZC5BZ2VudCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVUYXJnZXQgPSBjdXJyZW50TW9kZS50YXJnZXQuZ2V0KCk7XG5cdFx0aWYgKG1vZGVUYXJnZXQgIT09IGN1c3RvbUFnZW50VGFyZ2V0ICYmIG1vZGVUYXJnZXQgIT09IFRhcmdldC5VbmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkFnZW50LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbFRvRGVmYXVsdChmb3JTZXNzaW9uVHlwZT86IHN0cmluZykge1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5zZWxlY3REZWZhdWx0KGZvclNlc3Npb25UeXBlID8/IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSByYXcgY29uZmlndXJlZCBkZWZhdWx0LW1vZGVsIHZhbHVlIGZyb20gdGhlXG5cdCAqIHtAbGluayBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0TW9kZWx9IHNldHRpbmcgKHdoaWNoIG1heVxuXHQgKiBiZSBmb3JjZWQgYnkgZW50ZXJwcmlzZSBwb2xpY3kpLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm90aGluZyBpc1xuXHQgKiBjb25maWd1cmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbCk/LnRyaW0oKTtcblx0XHRyZXR1cm4gbW9kZWwgPyBtb2RlbCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBSZXNldHMgdGhlIGxhbmd1YWdlIG1vZGVsIHRvIHRoZSBsb2NhdGlvbiBkZWZhdWx0IGFuZCBjYW5jZWxzIGFueSBwZW5kaW5nIG1vZGVsLXNlbGVjdGlvbiBpbnRlbnQuICovXG5cdHB1YmxpYyByZXNldExhbmd1YWdlTW9kZWxUb0RlZmF1bHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmNsZWFySW50ZW50KCk7XG5cdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbFRvRGVmYXVsdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY3VycmVudCBpbnB1dCBzdGF0ZSBmb3IgaGlzdG9yeVxuXHQgKi9cblx0cHVibGljIGdldEN1cnJlbnRJbnB1dFN0YXRlKCk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpO1xuXHRcdGNvbnN0IHNlbGVjdGVkTW9kZWwgPSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKTtcblx0XHRjb25zdCBzdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUgPSB7XG5cdFx0XHRpbnB1dFRleHQ6IHRoaXMuX2lucHV0RWRpdG9yPy5nZXRWYWx1ZSgpID8/ICcnLFxuXHRcdFx0YXR0YWNobWVudHM6IHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50cyxcblx0XHRcdG1vZGU6IHtcblx0XHRcdFx0aWQ6IG1vZGUuaWQsXG5cdFx0XHRcdGtpbmQ6IG1vZGUua2luZFxuXHRcdFx0fSxcblx0XHRcdHNlbGVjdGVkTW9kZWwsXG5cdFx0XHRtb2RlbENvbmZpZ3VyYXRpb246IHNlbGVjdGVkTW9kZWwgPyB0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLmdldE1vZGVsQ29uZmlndXJhdGlvbihzZWxlY3RlZE1vZGVsLmlkZW50aWZpZXIpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2VsZWN0aW9uczogdGhpcy5faW5wdXRFZGl0b3I/LmdldFNlbGVjdGlvbnMoKSB8fCBbXSxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogdGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSxcblx0XHRcdGNvbnRyaWI6IHt9LFxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fd2lkZ2V0Py5jb250cmlicyB8fCBJdGVyYWJsZS5lbXB0eSgpKSB7XG5cdFx0XHRjb250cmliLmdldElucHV0U3RhdGU/LihzdGF0ZS5jb250cmliKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRjb25zdCB2ZXJib3NlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXQpO1xuXHRcdGxldCBrYkxhYmVsO1xuXHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5nZXQoKTtcblxuXHRcdC8vIEluY2x1ZGUgbW9kZWwgaW5mb3JtYXRpb24gaWYgYXZhaWxhYmxlXG5cdFx0Y29uc3QgbW9kZWxOYW1lID0gdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhLm5hbWU7XG5cdFx0Y29uc3QgbW9kZWxJbmZvID0gbW9kZWxOYW1lID8gbG9jYWxpemUoJ2NoYXRJbnB1dC5tb2RlbCcsIFwiLCB7MH0uIFwiLCBtb2RlbE5hbWUpIDogJyc7XG5cblx0XHRsZXQgbW9kZUxhYmVsID0gJyc7XG5cdFx0aWYgKCFtb2RlLmlzQnVpbHRpbikge1xuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuY3VycmVudE1vZGVPYnMuZ2V0KCk7XG5cdFx0XHRtb2RlTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdElucHV0Lm1vZGUuY3VzdG9tJywgXCIoezB9KSwgezF9XCIsIG1vZGUubGFiZWwuZ2V0KCksIG1vZGUuZGVzY3JpcHRpb24uZ2V0KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzd2l0Y2ggKHRoaXMuY3VycmVudE1vZGVLaW5kKSB7XG5cdFx0XHRcdGNhc2UgQ2hhdE1vZGVLaW5kLkFnZW50OlxuXHRcdFx0XHRcdG1vZGVMYWJlbCA9IGxvY2FsaXplKCdjaGF0SW5wdXQubW9kZS5hZ2VudCcsIFwiKEFnZW50KSwgZWRpdCBmaWxlcyBpbiB5b3VyIHdvcmtzcGFjZS5cIik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhdE1vZGVLaW5kLkVkaXQ6XG5cdFx0XHRcdFx0bW9kZUxhYmVsID0gbG9jYWxpemUoJ2NoYXRJbnB1dC5tb2RlLmVkaXQnLCBcIihFZGl0KSwgZWRpdCBmaWxlcyBpbiB5b3VyIHdvcmtzcGFjZS5cIik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhdE1vZGVLaW5kLkFzazpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRtb2RlTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdElucHV0Lm1vZGUuYXNrJywgXCIoQXNrKSwgYXNrIHF1ZXN0aW9ucyBvciB0eXBlIC8gZm9yIHRvcGljcy5cIik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh2ZXJib3NlKSB7XG5cdFx0XHRyZXR1cm4ga2JMYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhY3Rpb25zLmNoYXQuYWNjZXNzaWJpbHR5SGVscCcsIFwiQ2hhdCBJbnB1dCB7MH17MX0gUHJlc3MgRW50ZXIgdG8gc2VuZCBvdXQgdGhlIHJlcXVlc3QuIFVzZSB7Mn0gZm9yIENoYXQgQWNjZXNzaWJpbGl0eSBIZWxwLlwiLCBtb2RlTGFiZWwsIG1vZGVsSW5mbywga2JMYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdElucHV0LmFjY2Vzc2liaWxpdHlIZWxwTm9LYicsIFwiQ2hhdCBJbnB1dCB7MH17MX0gUHJlc3MgRW50ZXIgdG8gc2VuZCBvdXQgdGhlIHJlcXVlc3QuIFVzZSB0aGUgQ2hhdCBBY2Nlc3NpYmlsaXR5IEhlbHAgY29tbWFuZCBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIiwgbW9kZUxhYmVsLCBtb2RlbEluZm8pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXRJbnB1dC5hY2Nlc3NpYmlsaXR5SGVscCcsIFwiQ2hhdCBJbnB1dCB7MH17MX0uXCIsIG1vZGVMYWJlbCwgbW9kZWxJbmZvKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQ3VycmVudENoYXRNb2RlKCkge1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpO1xuXHRcdGNvbnN0IHZhbGlkTW9kZSA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpLmZpbmRNb2RlQnlJZChjdXJyZW50TW9kZS5pZCk7XG5cdFx0Y29uc3QgaXNBZ2VudE1vZGVFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpO1xuXHRcdGlmICghdmFsaWRNb2RlKSB7XG5cdFx0XHR0aGlzLnNldENoYXRNb2RlKGlzQWdlbnRNb2RlRW5hYmxlZCA/IENoYXRNb2RlS2luZC5BZ2VudCA6IENoYXRNb2RlS2luZC5Bc2spO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudE1vZGUua2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50ICYmICFpc0FnZW50TW9kZUVuYWJsZWQpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkFzayk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWFwcGx5IHRoZSBzZXNzaW9uJ3Mgb3duIHBlcnNpc3RlZCBjdXN0b20gYWdlbnQgb25jZSBpdHMgbW9kZSBiZWNvbWVzIGF2YWlsYWJsZS5cblx0ICpcblx0ICogQSByZXN0b3JlZCBhZ2VudC1ob3N0IHNlc3Npb24gcGVyc2lzdHMgaXRzIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCBpbiBgbW9kZWAsIGJ1dCB0aGUgYWdlbnRcblx0ICogaG9zdCdzIGN1c3RvbSBtb2RlcyBvbmx5IHJlZ2lzdGVyIGFmdGVyIHRoZSBiYWNrZW5kIGNvbm5lY3RzLiBVbnRpbCB0aGVuIGBzZXRDaGF0TW9kZWAgZmFsbHNcblx0ICogYmFjayB0byB0aGUgYnVpbHRpbiBBZ2VudCwgc28gd2hlbiB0aGUgY3VzdG9tIG1vZGVzIGFycml2ZSAoYG1vZGVzLm9uRGlkQ2hhbmdlYCkgcmUtYXBwbHkgdGhlXG5cdCAqIHBlcnNpc3RlZCBjdXN0b20gYWdlbnQuIEJ1aWx0aW4vZGVmYXVsdCBtb2RlcyBhcmUgaGFuZGxlZCBieSB7QGxpbmsgdmFsaWRhdGVDdXJyZW50Q2hhdE1vZGV9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yZVBlcnNpc3RlZEN1c3RvbU1vZGVJZkF2YWlsYWJsZSgpOiB2b2lkIHtcblx0XHRjb25zdCBwZXJzaXN0ZWRNb2RlID0gdGhpcy5faW5wdXRNb2RlbD8uc3RhdGUuZ2V0KCk/Lm1vZGU7XG5cdFx0aWYgKCFwZXJzaXN0ZWRNb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVzID0gdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUuZ2V0KCk7XG5cdFx0Y29uc3QgZm91bmQgPSBtb2Rlcy5maW5kTW9kZUJ5SWQocGVyc2lzdGVkTW9kZS5pZCkgPz8gbW9kZXMuZmluZE1vZGVCeU5hbWUocGVyc2lzdGVkTW9kZS5pZCk7XG5cdFx0aWYgKGZvdW5kICYmICFmb3VuZC5pc0J1aWx0aW4gJiYgdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpLmlkICE9PSBmb3VuZC5pZCkge1xuXHRcdFx0dGhpcy5zZXRDaGF0TW9kZShmb3VuZC5pZCwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGxvZ0lucHV0SGlzdG9yeSgpOiB2b2lkIHtcblx0XHRjb25zdCBoaXN0b3J5U3RyID0gdGhpcy5oaXN0b3J5LnZhbHVlcy5tYXAoZW50cnkgPT4gSlNPTi5zdHJpbmdpZnkoZW50cnkpKS5qb2luKCdcXG4nKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgWyR7dGhpcy5sb2NhdGlvbn1dIENoYXQgaW5wdXQgaGlzdG9yeTpgLCBoaXN0b3J5U3RyKTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHZpc2libGUpO1xuXHR9XG5cblx0LyoqIElmIGNvbnN1bWVycyBhcmUgYnVzeSBnZW5lcmF0aW5nIHRoZSBjaGF0IGlucHV0LCByZXR1cm5zIHRoZSBwcm9taXNlIHJlc29sdmVkIHdoZW4gdGhleSBmaW5pc2ggKi9cblx0Z2V0IGdlbmVyYXRpbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dlbmVyYXRpbmc/LmRlZmVyLnA7XG5cdH1cblxuXHQvKiogRGlzYWJsZXMgdGhlIGlucHV0IHN1Ym1pc3Npb25zIGJ1dHRvbnMgdW50aWwgdGhlIGRpc3Bvc2FibGUgaXMgZGlzcG9zZWQuICovXG5cdHN0YXJ0R2VuZXJhdGluZygpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdDaGF0V2lkZ2V0I3N0YXJ0R2VuZXJhdGluZycpO1xuXHRcdGlmICh0aGlzLl9nZW5lcmF0aW5nKSB7XG5cdFx0XHR0aGlzLl9nZW5lcmF0aW5nLnJjKys7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2dlbmVyYXRpbmcgPSB7IHJjOiAxLCBkZWZlcjogbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0NoYXRXaWRnZXQjZG9uZUdlbmVyYXRpbmcnKTtcblx0XHRcdGlmICh0aGlzLl9nZW5lcmF0aW5nICYmICEtLXRoaXMuX2dlbmVyYXRpbmcucmMpIHtcblx0XHRcdFx0dGhpcy5fZ2VuZXJhdGluZy5kZWZlci5jb21wbGV0ZSgpO1xuXHRcdFx0XHR0aGlzLl9nZW5lcmF0aW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5lcjtcblx0fVxuXG5cdGFzeW5jIHNob3dQcmV2aW91c1ZhbHVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmhpc3RvcnkuaXNBdFN0YXJ0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0Q3VycmVudElucHV0U3RhdGUoKTtcblx0XHRpZiAoc3RhdGUuaW5wdXRUZXh0IHx8IHN0YXRlLmF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5oaXN0b3J5Lm92ZXJsYXkoc3RhdGUpO1xuXHRcdH1cblx0XHR0aGlzLm5hdmlnYXRlSGlzdG9yeSh0cnVlKTtcblx0fVxuXG5cdGFzeW5jIHNob3dOZXh0VmFsdWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaGlzdG9yeS5pc0F0RW5kKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZ2V0Q3VycmVudElucHV0U3RhdGUoKTtcblx0XHRpZiAoc3RhdGUuaW5wdXRUZXh0IHx8IHN0YXRlLmF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5oaXN0b3J5Lm92ZXJsYXkoc3RhdGUpO1xuXHRcdH1cblx0XHR0aGlzLm5hdmlnYXRlSGlzdG9yeShmYWxzZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzdG9yZXMgYXR0YWNobWVudHMgdG8gdGhlIGlucHV0LCByZS1mZXRjaGluZyBpbWFnZSBiaW5hcnkgZGF0YSBhcyBuZWVkZWQuXG5cdCAqL1xuXHRhc3luYyByZXN0b3JlQXR0YWNobWVudHMoYXR0YWNobWVudHM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCByZXN0b3JlZCA9IFsuLi5hdHRhY2htZW50c107XG5cblx0XHRpZiAocmVzdG9yZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdG9yZWQgPSAoYXdhaXQgUHJvbWlzZS5hbGwocmVzdG9yZWQubWFwKGFzeW5jIChhdHRhY2htZW50KSA9PiB7XG5cdFx0XHRcdGlmIChpc0ltYWdlVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSAmJiAhYXR0YWNobWVudC52YWx1ZSAmJiBhdHRhY2htZW50LnJlZmVyZW5jZXM/Lmxlbmd0aCAmJiBVUkkuaXNVcmkoYXR0YWNobWVudC5yZWZlcmVuY2VzWzBdLnJlZmVyZW5jZSkpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyUmVmZXJlbmNlID0gYXR0YWNobWVudC5yZWZlcmVuY2VzWzBdLnJlZmVyZW5jZTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW1hZ2VCaW5hcnkgPSBjdXJyUmVmZXJlbmNlLnRvU3RyaW5nKHRydWUpLnN0YXJ0c1dpdGgoJ2h0dHAnKSA/IGF3YWl0IHRoaXMuc2hhcmVkV2ViRXh0cmFjdGVyU2VydmljZS5yZWFkSW1hZ2UoY3VyclJlZmVyZW5jZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgOiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShjdXJyUmVmZXJlbmNlKSkudmFsdWU7XG5cdFx0XHRcdFx0XHRpZiAoIWltYWdlQmluYXJ5KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdBdHRhY2htZW50ID0geyAuLi5hdHRhY2htZW50IH07XG5cdFx0XHRcdFx0XHRuZXdBdHRhY2htZW50LnZhbHVlID0gKGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmIGF0dGFjaG1lbnQuaXNQYXN0ZWQpID8gaW1hZ2VCaW5hcnkuYnVmZmVyIDogYXdhaXQgcmVzaXplSW1hZ2UoaW1hZ2VCaW5hcnkuYnVmZmVyKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXdBdHRhY2htZW50O1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gZmV0Y2ggYW5kIHJlZmVyZW5jZS4nLCBlcnIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0XHR9KSkpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5jbGVhckFuZFNldENvbnRleHQoLi4ucmVzdG9yZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBuYXZpZ2F0ZUhpc3RvcnkocHJldmlvdXM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5RW50cnkgPSBwcmV2aW91cyA/XG5cdFx0XHR0aGlzLmhpc3RvcnkucHJldmlvdXMoKSA6IHRoaXMuaGlzdG9yeS5uZXh0KCk7XG5cblx0XHRhd2FpdCB0aGlzLnJlc3RvcmVBdHRhY2htZW50cyhoaXN0b3J5RW50cnk/LmF0dGFjaG1lbnRzID8/IFtdKTtcblxuXHRcdGNvbnN0IGlucHV0VGV4dCA9IGhpc3RvcnlFbnRyeT8uaW5wdXRUZXh0ID8/ICcnO1xuXHRcdGNvbnN0IGNvbnRyaWJEYXRhID0gaGlzdG9yeUVudHJ5Py5jb250cmliID8/IHt9O1xuXHRcdGFyaWEuc3RhdHVzKGlucHV0VGV4dCk7XG5cdFx0dGhpcy5zZXRWYWx1ZShpbnB1dFRleHQsIHRydWUpO1xuXHRcdHRoaXMuX3dpZGdldD8uY29udHJpYnMuZm9yRWFjaChjb250cmliID0+IHtcblx0XHRcdGNvbnRyaWIuc2V0SW5wdXRTdGF0ZT8uKGNvbnRyaWJEYXRhKTtcblx0XHR9KTtcblx0XHR0aGlzLl9vbkRpZExvYWRJbnB1dFN0YXRlLmZpcmUoKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHQvLyBXaGVuIG5hdmlnYXRpbmcgdG8gcHJldmlvdXMgaGlzdG9yeSwgYWx3YXlzIHBvc2l0aW9uIGN1cnNvciBhdCB0aGUgc3RhcnQgKGxpbmUgMSwgY29sdW1uIDEpXG5cdFx0XHQvLyBUaGlzIGVuc3VyZXMgdGhhdCBwcmVzc2luZyB1cCBhZ2FpbiB3aWxsIGNvbnRpbnVlIHRvIG5hdmlnYXRlIGhpc3Rvcnlcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiAxIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pbnB1dEVkaXRvci5zZXRQb3NpdGlvbihnZXRMYXN0UG9zaXRpb24obW9kZWwpKTtcblx0XHR9XG5cdH1cblxuXHRzZXRWYWx1ZSh2YWx1ZTogc3RyaW5nLCB0cmFuc2llbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0RWRpdG9yLnNldFZhbHVlKHZhbHVlKTtcblx0XHQvLyBhbHdheXMgbGVhdmUgY3Vyc29yIGF0IHRoZSBlbmRcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuaW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuaW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24oZ2V0TGFzdFBvc2l0aW9uKG1vZGVsKSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dEVkaXRvci5oYXNXaWRnZXRGb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNUb2RvTGlzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWU/LmZvY3VzKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRpc1RvZG9MaXN0Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWU/Lmhhc0ZvY3VzKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRoYXNWaXNpYmxlVG9kb3MoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0LnZhbHVlPy5oYXNUb2RvcygpID8/IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc2V0IHRoZSBpbnB1dCBhbmQgdXBkYXRlIGhpc3RvcnkuXG5cdCAqIEBwYXJhbSB1c2VyUXVlcnkgSWYgcHJvdmlkZWQsIHRoaXMgd2lsbCBiZSBhZGRlZCB0byB0aGUgaGlzdG9yeS4gRm9sbG93dXBzIGFuZCBwcm9ncmFtbWF0aWMgcXVlcmllcyBzaG91bGQgbm90IGJlIHBhc3NlZC5cblx0ICovXG5cdGFzeW5jIGFjY2VwdElucHV0KGlzVXNlclF1ZXJ5PzogYm9vbGVhbiwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHByZXNlcnZlSW5wdXQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzVXNlclF1ZXJ5KSB7XG5cdFx0XHRjb25zdCB1c2VyUXVlcnkgPSB0aGlzLmdldEN1cnJlbnRJbnB1dFN0YXRlKCk7XG5cdFx0XHR0aGlzLmhpc3RvcnkuYXBwZW5kKHRoaXMuX2dldEZpbHRlcmVkRW50cnkodXNlclF1ZXJ5KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXNldFNjcm9sbGJhclZpc2liaWxpdHlBZnRlckFjY2VwdCgpO1xuXG5cdFx0Ly8gQXV0by1kaXNtaXNzIG5vdGlmaWNhdGlvbnMgdGhhdCByZXF1ZXN0ZWQgaXQuIFNjb3BlIHRvIHRoaXMgaW5wdXQnc1xuXHRcdC8vIHNlc3Npb24gc28gYSBtZXNzYWdlIGhlcmUgZG9lc24ndCBoaWRlIG5vdGlmaWNhdGlvbnMgZm9yIG90aGVyIHNlc3Npb25zLlxuXHRcdHRoaXMuY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5oYW5kbGVNZXNzYWdlU2VudCh7XG5cdFx0XHRzZXNzaW9uVHlwZTogdGhpcy5fbm90aWZpY2F0aW9uTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUuZ2V0KCksXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2VPYnNlcnZhYmxlLmdldCgpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5ID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9lbXB0eUlucHV0U3RhdGUuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2VtcHR5SW5wdXRBdHRhY2htZW50cy5zZXQoW10sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHByZXNlcnZlSW5wdXQpIHtcblx0XHRcdC8vIFRoZSBlZGl0b3IgaG9sZHMgYW4gdW5yZWxhdGVkIHVzZXIgZHJhZnQ6IGtlZXAgaXQsIGFuZCBsZWF2ZSBhbnkgcGVuZGluZ1xuXHRcdFx0Ly8gZGljdGF0aW9uIHVuLWZpbmFsaXplZCBzaW5jZSB0aGUgZHJhZnQgaXMgbmVpdGhlciBzZW50IG5vciBjbGVhcmVkLlxuXHRcdFx0aWYgKCFwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgYXR0YWNoZWQgY29udGV4dCwgZmlyZSBldmVudCB0byBjbGVhciBpbnB1dCBzdGF0ZSwgYW5kIGNsZWFyIHRoZSBpbnB1dCBlZGl0b3Jcblx0XHQvLyBNZWFzdXJlIGFueSBwZW5kaW5nIGRpY3RhdGlvbiBhY2N1cmFjeSBhZ2FpbnN0IHRoZSB0ZXh0IGFjdHVhbGx5IGJlaW5nXG5cdFx0Ly8gc2VudCwgYmVmb3JlIHRoZSBlZGl0b3IgaXMgY2xlYXJlZCBiZWxvdy5cblx0XHRub3RpZnlEaWN0YXRpb25TdWJtaXR0ZWQodGhpcy5faW5wdXRFZGl0b3IpO1xuXHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYFtBQ0NFUFRdIGFjY2VwdElucHV0IC0+IGF0dGFjaG1lbnRNb2RlbC5jbGVhcigpIGluICR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9YCwgdW5kZWZpbmVkLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLmF0dGFjaG1lbnRNb2RlbC5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkTG9hZElucHV0U3RhdGUuZmlyZSgpO1xuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkgJiYgaXNNYWNpbnRvc2gpIHtcblx0XHRcdHRoaXMuX2FjY2VwdElucHV0Rm9yVm9pY2VvdmVyKCk7XG5cdFx0fSBlbHNlIGlmIChwcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHR0aGlzLl9pbnB1dEVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR0aGlzLl9pbnB1dEVkaXRvci5zZXRWYWx1ZSgnJyk7XG5cdFx0fVxuXHR9XG5cblx0dmFsaWRhdGVBZ2VudE1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmFnZW50U2VydmljZS5oYXNUb29sc0FnZW50ICYmIHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5nZXQoKS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkVkaXQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEEgZnVuY3Rpb24gdGhhdCBmaWx0ZXJzIG91dCBzcGVjaWZpY2FsbHkgdGhlIGB2YWx1ZWAgcHJvcGVydHkgb2YgdGhlIGF0dGFjaG1lbnQuXG5cdHByaXZhdGUgX2dldEZpbHRlcmVkRW50cnkoaW5wdXRTdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUpOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHNXaXRob3V0SW1hZ2VWYWx1ZXMgPSBpbnB1dFN0YXRlLmF0dGFjaG1lbnRzLm1hcChhdHRhY2htZW50ID0+IHtcblx0XHRcdGlmIChpc0ltYWdlVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSAmJiBhdHRhY2htZW50LnJlZmVyZW5jZXM/Lmxlbmd0aCAmJiBhdHRhY2htZW50LnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0F0dGFjaG1lbnQgPSB7IC4uLmF0dGFjaG1lbnQgfTtcblx0XHRcdFx0bmV3QXR0YWNobWVudC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIG5ld0F0dGFjaG1lbnQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IC4uLmlucHV0U3RhdGUsIGF0dGFjaG1lbnRzOiBhdHRhY2htZW50c1dpdGhvdXRJbWFnZVZhbHVlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0SW5wdXRGb3JWb2ljZW92ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgZG9tTm9kZSA9IHRoaXMuX2lucHV0RWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRpZiAoIWRvbU5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRoZSBpbnB1dCBlZGl0b3IgZnJvbSB0aGUgRE9NIHRlbXBvcmFyaWx5IHRvIHByZXZlbnQgVm9pY2VPdmVyXG5cdFx0Ly8gZnJvbSByZWFkaW5nIHRoZSBjbGVhcmVkIHRleHQgKHRoZSByZXF1ZXN0KSB0byB0aGUgdXNlci5cblx0XHRkb21Ob2RlLnJlbW92ZSgpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvckVsZW1lbnQuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3IuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUF0dGFjaGVkQ29udGV4dENoYW5nZSgpIHtcblx0XHR0aGlzLl9oYXNGaWxlQXR0YWNobWVudENvbnRleHRLZXkuc2V0KEJvb2xlYW4odGhpcy5fYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLmZpbmQoYSA9PiBhLmtpbmQgPT09ICdmaWxlJykpKTtcblx0XHR0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpO1xuXHRcdHRoaXMucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIHRoZSBcInN1Ym1pdCBwZW5kaW5nXCIgc3RhdGUuIFdoaWxlIHBlbmRpbmcsIHRoZSBpbnB1dCByZWZsZWN0cyB0aGF0IGFcblx0ICogc3VibWl0dGVkIHJlcXVlc3QgaXMgc3RpbGwgYmVpbmcgcm91dGVkL2Rpc3BhdGNoZWQgKGUuZy4gb21uaS1jaGF0IHJvdXRpbmcsXG5cdCAqIHdoZXJlIHN1Ym1pc3Npb24gaXMgaW50ZXJjZXB0ZWQgYW5kIGhhbmRsZWQgb2ZmLW1vZGVsKSBzbyB0aGUgc2VuZCBidXR0b24gaXNcblx0ICogZGlzYWJsZWQgdW50aWwgdGhlIHN1Ym1pc3Npb24gcmVzb2x2ZXMgb3IgdGhlIGRyYWZ0IGNoYW5nZXMuIEFueSBpbnB1dCBjb250ZW50XG5cdCAqIGNoYW5nZSBjbGVhcnMgdGhpcyBhdXRvbWF0aWNhbGx5LlxuXHQgKi9cblx0c2V0U3VibWl0UGVuZGluZyhwZW5kaW5nOiBib29sZWFuLCByb3V0aW5nID0gcGVuZGluZyk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRTdWJtaXRQZW5kaW5nLnNldChwZW5kaW5nKTtcblx0XHR0aGlzLmlucHV0Um91dGluZy5zZXQocm91dGluZyk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dEhhc1RleHQgPSAhIXRoaXMuX2lucHV0RWRpdG9yPy5nZXRNb2RlbCgpPy5nZXRWYWx1ZSgpLnRyaW0oKTtcblx0XHR0aGlzLmlucHV0RWRpdG9ySGFzVGV4dC5zZXQoaW5wdXRIYXNUZXh0KTtcblx0XHRjb25zdCBoYXNTZW5kYWJsZUNvbnRlbnQgPSBpbnB1dEhhc1RleHQgfHwgdGhpcy5fYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLnNvbWUoaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSk7XG5cdFx0Ly8gQmxvY2sgc2VuZGluZyB3aGVuIHRoZSBzZXNzaW9uIHR5cGUgaGFzIG5vIHVzYWJsZSBtb2RlbCAoYW5kIGNhbid0XG5cdFx0Ly8gZmFsbCBiYWNrIHRvIEF1dG8pOiB0aGVyZSBpcyBub3RoaW5nIHRvIHNlbmQgdGhlIHJlcXVlc3Qgd2l0aC4gQSBsYXRlXG5cdFx0Ly8gcHJvZ3JhbW1hdGljIG1vZGVsIHByZWZlcmVuY2UgbXVzdCBub3QgZGlzYWJsZSBhbiBhbHJlYWR5IHVzYWJsZVxuXHRcdC8vIGZhbGxiYWNrIGluZGVmaW5pdGVseTsgdGhlIHNlbGVjdGlvbiBjb250cm9sbGVyIHdpbGwgc3RpbGwgYXBwbHkgdGhhdFxuXHRcdC8vIHByZWZlcmVuY2UgaWYvd2hlbiBpdHMgbW9kZWwgYXBwZWFycy5cblx0XHR0aGlzLmlucHV0RWRpdG9ySGFzU2VuZGFibGVDb250ZW50LnNldChpc0NoYXRJbnB1dENvbnRlbnRTZW5kYWJsZShoYXNTZW5kYWJsZUNvbnRlbnQsIHRoaXMuaGFzTm9BdmFpbGFibGVNb2RlbCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE9yQ3JlYXRlT3B0aW9uRW1pdHRlcihvcHRpb25Hcm91cElkOiBzdHJpbmcpOiBFbWl0dGVyPElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbT4ge1xuXHRcdGxldCBlbWl0dGVyID0gdGhpcy5fY2hhdFNlc3Npb25PcHRpb25FbWl0dGVycy5nZXQob3B0aW9uR3JvdXBJZCk7XG5cdFx0aWYgKCFlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyID0gbmV3IEVtaXR0ZXI8SUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPigpO1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25PcHRpb25FbWl0dGVycy5zZXQob3B0aW9uR3JvdXBJZCwgZW1pdHRlcik7XG5cdFx0fVxuXHRcdHJldHVybiBlbWl0dGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBvciBjcmVhdGUgYSBjb250ZXh0IGtleSBmb3IgYW4gb3B0aW9uIGdyb3VwLlxuXHQgKiBDb250ZXh0IGtleXMgZm9sbG93IHRoZSBwYXR0ZXJuIGBjaGF0U2Vzc2lvbk9wdGlvbi48Z3JvdXBJZD5gLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZU9wdGlvbkNvbnRleHRLZXkob3B0aW9uR3JvdXBJZDogc3RyaW5nKTogSUNvbnRleHRLZXk8c3RyaW5nPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGNvbnRleHRLZXkgPSB0aGlzLl9vcHRpb25Db250ZXh0S2V5cy5nZXQob3B0aW9uR3JvdXBJZCk7XG5cdFx0aWYgKCFjb250ZXh0S2V5KSB7XG5cdFx0XHRjb25zdCByYXdLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KGBjaGF0U2Vzc2lvbk9wdGlvbi4ke29wdGlvbkdyb3VwSWR9YCwgJycpO1xuXHRcdFx0Y29udGV4dEtleSA9IHJhd0tleS5iaW5kVG8odGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fb3B0aW9uQ29udGV4dEtleXMuc2V0KG9wdGlvbkdyb3VwSWQsIGNvbnRleHRLZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGV4dEtleTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGNvbnRleHQga2V5IGZvciBhbiBvcHRpb24gZ3JvdXAgd2l0aCB0aGUgY3VycmVudCBzZWxlY3Rpb24uXG5cdCAqIFRoaXMgZW5hYmxlcyBgd2hlbmAgZXhwcmVzc2lvbnMgb24gb3RoZXIgb3B0aW9uIGdyb3VwcyB0byByZWFjdCB0byBjaGFuZ2VzLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVPcHRpb25Db250ZXh0S2V5KG9wdGlvbkdyb3VwSWQ6IHN0cmluZywgb3B0aW9uSXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBub3JtYWxpemVkT3B0aW9uSWQgPSBvcHRpb25JdGVtSWQudHJpbSgpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXkgPSB0aGlzLmdldE9yQ3JlYXRlT3B0aW9uQ29udGV4dEtleShvcHRpb25Hcm91cElkKTtcblx0XHRpZiAoY29udGV4dEtleSkge1xuXHRcdFx0Y29udGV4dEtleS5zZXQobm9ybWFsaXplZE9wdGlvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXZhbHVhdGUgd2hldGhlciBhbiBvcHRpb24gZ3JvdXAgc2hvdWxkIGJlIHZpc2libGUgYmFzZWQgb24gaXRzIGB3aGVuYCBleHByZXNzaW9uLlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhlIG9wdGlvbiBncm91cCBzaG91bGQgYmUgdmlzaWJsZSwgZmFsc2Ugb3RoZXJ3aXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBldmFsdWF0ZU9wdGlvbkdyb3VwVmlzaWJpbGl0eShvcHRpb25Hcm91cDogeyBpZDogc3RyaW5nOyB3aGVuPzogc3RyaW5nIH0pOiBib29sZWFuIHtcblx0XHRpZiAoIW9wdGlvbkdyb3VwLndoZW4pIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBObyBjb25kaXRpb24gbWVhbnMgYWx3YXlzIHZpc2libGVcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gTm8gY29udGV4dCBrZXkgc2VydmljZSB5ZXQsIGRlZmF1bHQgdG8gdmlzaWJsZVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShvcHRpb25Hcm91cC53aGVuKTtcblx0XHRpZiAoIWV4cHIpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBJbnZhbGlkIGV4cHJlc3Npb24gZGVmYXVsdHMgdG8gdmlzaWJsZVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGV4cHIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIHdoaWNoIG9wdGlvbiBncm91cHMgc2hvdWxkIGJlIHZpc2libGUgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24uXG5cdCAqXG5cdCAqIEEgcGlja2VyIHNob3VsZCBzaG93IGlmIGFuZCBvbmx5IGlmOlxuXHQgKiAxLiBXZSBjYW4gZGV0ZXJtaW5lIGEgc2Vzc2lvbiB0eXBlIChmcm9tIHNlc3Npb24gY29udGV4dCBPUiBkZWxlZ2F0ZSlcblx0ICogMi4gVGhhdCBzZXNzaW9uIHR5cGUgaGFzIG9wdGlvbiBncm91cHMgcmVnaXN0ZXJlZFxuXHQgKiAzLiBBdCBsZWFzdCBvbmUgb3B0aW9uIGdyb3VwIGhhcyBpdGVtcyBBTkQgcGFzc2VzIGl0cyBgd2hlbmAgY2xhdXNlXG5cdCAqXG5cdCAqIFRoaXMgbWV0aG9kIGFsc28gdXBkYXRlcyB0aGUgYGNoYXRTZXNzaW9uSGFzT3B0aW9uc2AgY29udGV4dCBrZXksIHdoaWNoIGNvbnRyb2xzXG5cdCAqIHdoZXRoZXIgdGhlIHBpY2tlciBhY3Rpb24gaXMgc2hvd24gaW4gdGhlIHRvb2xiYXIgdmlhIGl0cyBgd2hlbmAgY2xhdXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRWaXNpYmxlT3B0aW9uR3JvdXBzTW9kZUFuZFVwZGF0ZUNvbnRleHRLZXlzKHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuZ2V0RWZmZWN0aXZlU2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBjdXN0b21BZ2VudFRhcmdldCA9IHNlc3Npb25UeXBlID8gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEN1c3RvbUFnZW50VGFyZ2V0Rm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpIDogVGFyZ2V0LlVuZGVmaW5lZDtcblx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzQ3VzdG9tQWdlbnRUYXJnZXQuc2V0KGN1c3RvbUFnZW50VGFyZ2V0ICE9PSBUYXJnZXQuVW5kZWZpbmVkKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgc2Vzc2lvbiB0eXBlIHJlcXVpcmVzIGN1c3RvbSBtb2RlbHNcblx0XHRjb25zdCByZXF1aXJlc0N1c3RvbU1vZGVscyA9IHNlc3Npb25UeXBlICYmIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzVGFyZ2V0ZWRNb2RlbHMuc2V0KCEhcmVxdWlyZXNDdXN0b21Nb2RlbHMpO1xuXG5cdFx0Y29uc3QgdmlzaWJsZU9wdGlvbkdyb3VwcyA9IHRoaXMuZ2V0VmlzaWJsZU9wdGlvbkdyb3VwcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMucGVybWlzc2lvbldpZGdldD8ucmVmcmVzaCgpO1xuXHRcdGlmICghdmlzaWJsZU9wdGlvbkdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25IYXNPcHRpb25zLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkLnNldCh0cnVlKTtcblx0XHRcdC8vIFNlc3Npb24gdHlwZSBtYXkgaGF2ZSBjaGFuZ2VkIHdoZXRoZXIgYSB1c2FibGUgbW9kZWwgZXhpc3RzOyBrZWVwXG5cdFx0XHQvLyB0aGUgc2VuZC1lbmFibGVtZW50IGNvbnRleHQga2V5IGluIHN5bmMuXG5cdFx0XHR0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbE9wdGlvbnNWYWxpZCA9IHNlc3Npb25SZXNvdXJjZSA/IHRoaXMuYXJlQWxsT3B0aW9uc1ZhbGlkKHNlc3Npb25SZXNvdXJjZSwgdmlzaWJsZU9wdGlvbkdyb3VwcykgOiB0cnVlO1xuXG5cdFx0dGhpcy5jaGF0U2Vzc2lvbkhhc09wdGlvbnMuc2V0KHRydWUpO1xuXHRcdHRoaXMuY2hhdFNlc3Npb25PcHRpb25zVmFsaWQuc2V0KGFsbE9wdGlvbnNWYWxpZCk7XG5cblx0XHQvLyBTZXNzaW9uIHR5cGUgbWF5IGhhdmUgY2hhbmdlZCB3aGV0aGVyIGEgdXNhYmxlIG1vZGVsIGV4aXN0czsga2VlcCB0aGVcblx0XHQvLyBzZW5kLWVuYWJsZW1lbnQgY29udGV4dCBrZXkgaW4gc3luYy5cblx0XHR0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpO1xuXG5cdFx0cmV0dXJuIHZpc2libGVPcHRpb25Hcm91cHM7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFRlcm1pbmFsQ29tbWFuZFByZWZpeCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSB0ZXJtaW5hbCBjb21tYW5kIHByZWZpeCBpcyBhIHN0YXRpYyBwZXItc2Vzc2lvbi10eXBlIGNhcGFiaWxpdHlcblx0XHQvLyBhZHZlcnRpc2VkIGJ5IHRoZSBhZ2VudCBob3N0LiBUaGUgaW5wdXQgdXNlcyBpdCAob24gdGhlIGxpdmUgdGV4dCkgdG9cblx0XHQvLyBzd2l0Y2ggdG8gbW9ub3NwYWNlIGFuZCB3YXJuIG9uIGNvbW1hbmQgcGFzdGVzLlxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdHJldHVybiBzZXNzaW9uUmVzb3VyY2UgPyB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2FwYWJpbGl0aWVzRm9yU2Vzc2lvblR5cGUoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpPy50ZXJtaW5hbENvbW1hbmRQcmVmaXggOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpc1Rlcm1pbmFsQ29tbWFuZFBhc3RlKHBhc3RlZFRleHQ6IHN0cmluZywgcmFuZ2U6IElSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBwcmVmaXggPSB0aGlzLmdldFRlcm1pbmFsQ29tbWFuZFByZWZpeCgpO1xuXHRcdGlmICghbW9kZWwgfHwgIXByZWZpeCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gaXNUZXJtaW5hbENvbW1hbmRQYXN0ZUNvbnRlbnQoe1xuXHRcdFx0cHJlZml4LFxuXHRcdFx0cGFzdGVkVGV4dCxcblx0XHRcdGN1cnJlbnRWYWx1ZTogbW9kZWwuZ2V0VmFsdWUoKSxcblx0XHRcdHNlbGVjdGlvblN0YXJ0T2Zmc2V0OiBtb2RlbC5nZXRPZmZzZXRBdChSYW5nZS5nZXRTdGFydFBvc2l0aW9uKHJhbmdlKSksXG5cdFx0XHRzZWxlY3Rpb25FbmRPZmZzZXQ6IG1vZGVsLmdldE9mZnNldEF0KFJhbmdlLmdldEVuZFBvc2l0aW9uKHJhbmdlKSksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUlucHV0RWRpdG9yRm9udEZhbWlseSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lucHV0RWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDb21tYW5kID0gaXNUZXJtaW5hbENvbW1hbmRJbnB1dCh0aGlzLl9pbnB1dEVkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ29udGVudCgxKSB8fCAnJywgdGhpcy5nZXRUZXJtaW5hbENvbW1hbmRQcmVmaXgoKSk7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh7IGZvbnRGYW1pbHk6IGlzQ29tbWFuZCA/IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHkgOiBERUZBVUxUX0ZPTlRfRkFNSUxZIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZShlOiBDbGlwYm9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGhhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlKGUsIHRoaXMuX2lucHV0RWRpdG9yLCB0aGlzLmdldFRlcm1pbmFsQ29tbWFuZFByZWZpeCgpLCB0aGlzLmRpYWxvZ1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcmVBbGxPcHRpb25zVmFsaWQoc2Vzc2lvblJlc291cmNlOiBVUkksIHZpc2libGVPcHRpb25Hcm91cHM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uR3JvdXAgb2YgdmlzaWJsZU9wdGlvbkdyb3Vwcykge1xuXHRcdFx0Y29uc3QgY3VycmVudE9wdGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXAuaWQpO1xuXHRcdFx0aWYgKGN1cnJlbnRPcHRpb24pIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE9wdGlvbklkID0gdHlwZW9mIGN1cnJlbnRPcHRpb24gPT09ICdzdHJpbmcnID8gY3VycmVudE9wdGlvbiA6IGN1cnJlbnRPcHRpb24uaWQ7XG5cdFx0XHRcdC8vIFRPRE86IEBvc29ydGVnYSBAam9zaHNwaWNlciBzaG91bGQgd2UgYWRkIGEgYHBsYWNlSG9sZGVyYCBpdGVtIHRvIG9wdGlvbiBncm91cHMgdG8gc3RyYWlnaHRlbiB0aGlzIGNoZWNrP1xuXHRcdFx0XHRpZiAoIW9wdGlvbkdyb3VwLml0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlkID09PSBjdXJyZW50T3B0aW9uSWQpICYmIHR5cGVvZiBjdXJyZW50T3B0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsT3B0aW9uc0dyb3VwcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB7XG5cdFx0Ly8gLSBQYW5lbC9FZGl0b3I6IFVzZSBhY3R1YWwgc2Vzc2lvbidzIHR5cGUgKGN0eCBhdmFpbGFibGUpXG5cdFx0Ly8gLSBXZWxjb21lIHZpZXc6IFVzZSBkZWxlZ2F0ZSdzIHR5cGUgKGN0eCBtYXkgbm90IGV4aXN0IHlldClcblx0XHRjb25zdCBkZWxlZ2F0ZVNlc3Npb25UeXBlID0gdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU/LmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcj8uKCk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlU2Vzc2lvblR5cGUgPSBkZWxlZ2F0ZVNlc3Npb25UeXBlID8/IChzZXNzaW9uUmVzb3VyY2UgPyBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFlZmZlY3RpdmVTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFN0ZXAgMjogR2V0IG9wdGlvbiBncm91cHMgZm9yIHRoaXMgc2Vzc2lvbiB0eXBlXG5cdFx0Y29uc3QgYWxsT3B0aW9uR3JvdXBzID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKGVmZmVjdGl2ZVNlc3Npb25UeXBlKTtcblx0XHRyZXR1cm4gYWxsT3B0aW9uR3JvdXBzID8/IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaXNpYmxlT3B0aW9uR3JvdXBzKHNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHtcblx0XHRjb25zdCBhbGxPcHRpb25Hcm91cHMgPSB0aGlzLmdldEFsbE9wdGlvbnNHcm91cHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWFsbE9wdGlvbkdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29udGV4dCBrZXlzIHdpdGggY3VycmVudCBvcHRpb24gdmFsdWVzIGJlZm9yZSBldmFsdWF0aW5nIGB3aGVuYCBjbGF1c2VzLlxuXHRcdC8vIFRoaXMgZW5zdXJlcyBpbnRlcmRlcGVuZGVudCBgd2hlbmAgZXhwcmVzc2lvbnMgd29yayBjb3JyZWN0bHkuXG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Zm9yIChjb25zdCBvcHRpb25Hcm91cCBvZiBhbGxPcHRpb25Hcm91cHMpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE9wdGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXAuaWQpO1xuXHRcdFx0XHRpZiAoY3VycmVudE9wdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IG9wdGlvbklkID0gdHlwZW9mIGN1cnJlbnRPcHRpb24gPT09ICdzdHJpbmcnID8gY3VycmVudE9wdGlvbiA6IGN1cnJlbnRPcHRpb24uaWQ7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25Db250ZXh0S2V5KG9wdGlvbkdyb3VwLmlkLCBvcHRpb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgdG8gdmlzaWJsZSBncm91cHMgKGhhcyBpdGVtcyBBTkQgcGFzc2VzIGB3aGVuYCBjbGF1c2UgQU5EIHNlc3Npb24gaGFzIG9wdGlvbiBjb25maWd1cmVkKS5cblx0XHQvLyBQZXJtaXNzaW9ucy1raW5kIGdyb3VwcyBhcmUgbm90IHJlbmRlcmVkIGFzIHN0YW5kYWxvbmUgcGlja2VyczsgdGhlaXIgaXRlbXMgYXJlIHN1cmZhY2VkXG5cdFx0Ly8gaW5zaWRlIHRoZSBjaGF0IHBlcm1pc3Npb24gcGlja2VyIGluc3RlYWQgKHNlZSBgZ2V0QWN0aXZlRXh0ZW5zaW9uUGVybWlzc2lvbkdyb3VwYCkuXG5cdFx0Y29uc3QgdmlzaWJsZUdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwPigpO1xuXHRcdGZvciAoY29uc3Qgb3B0aW9uR3JvdXAgb2YgYWxsT3B0aW9uR3JvdXBzKSB7XG5cdFx0XHRpZiAob3B0aW9uR3JvdXAua2luZCA9PT0gJ3Blcm1pc3Npb25zJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhhc0l0ZW1zID0gb3B0aW9uR3JvdXAuaXRlbXMubGVuZ3RoID4gMCB8fCAob3B0aW9uR3JvdXAuY29tbWFuZHMgfHwgW10pLmxlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBwYXNzZXNXaGVuQ2xhdXNlID0gdGhpcy5ldmFsdWF0ZU9wdGlvbkdyb3VwVmlzaWJpbGl0eShvcHRpb25Hcm91cCk7XG5cblx0XHRcdC8vIE9ubHkgc2hvdyBwaWNrZXIgaWYgdGhlIHNlc3Npb24gaGFzIHRoaXMgb3B0aW9uIGNvbmZpZ3VyZWQgb25jZSBhIHJlYWwgc2Vzc2lvbiBleGlzdHMuXG5cdFx0XHQvLyBJbiB0aGUgd2VsY29tZSB2aWV3IChubyBgY3R4YCB5ZXQpLCB0cmVhdCBncm91cHMgYXMgZWxpZ2libGUgc28gdGhleSBjYW4gYmUgcmVuZGVyZWQuXG5cdFx0XHRjb25zdCBzZXNzaW9uSGFzT3B0aW9uID0gIXNlc3Npb25SZXNvdXJjZSB8fCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbkdyb3VwLmlkKSAhPT0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoaGFzSXRlbXMgJiYgcGFzc2VzV2hlbkNsYXVzZSAmJiBzZXNzaW9uSGFzT3B0aW9uKSB7XG5cdFx0XHRcdHZpc2libGVHcm91cHMuc2V0KG9wdGlvbkdyb3VwLmlkLCBvcHRpb25Hcm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFycmF5LmZyb20odmlzaWJsZUdyb3Vwcy52YWx1ZXMoKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcGVybWlzc2lvbnMta2luZCBvcHRpb24gZ3JvdXAgY29udHJpYnV0ZWQgYnkgdGhlIGFjdGl2ZSBzZXNzaW9uIHByb3ZpZGVyLCBpZiBhbnkuXG5cdCAqIEl0ZW1zIGZyb20gdGhpcyBncm91cCBhcmUgc3VyZmFjZWQgaW5zaWRlIHRoZSBjaGF0IHBlcm1pc3Npb24gcGlja2VyLCByZXBsYWNpbmcgdGhlXG5cdCAqIGJ1aWx0LWluIGBDaGF0UGVybWlzc2lvbkxldmVsYCBpdGVtcy4gSG9ub3JzIHRoZSBzYW1lIHZpc2liaWxpdHkgcHJlZGljYXRlcyBhc1xuXHQgKiB7QGxpbmsgZ2V0VmlzaWJsZU9wdGlvbkdyb3Vwc30gc28gdGhhdCBgd2hlbmAgY2xhdXNlcyBhcmUgcmVzcGVjdGVkLlxuXHQgKlxuXHQgKiBJZiB0aGUgcHJvdmlkZXIgZGVjbGFyZXMgbW9yZSB0aGFuIG9uZSBwZXJtaXNzaW9ucy1raW5kIGdyb3VwICh3aGljaCB0aGUgQVBJIGZvcmJpZHMpLFxuXHQgKiB0aGUgZmlyc3Qgb25lIHdpbnMuXG5cdCAqL1xuXHRwcml2YXRlIGdldEFjdGl2ZUV4dGVuc2lvblBlcm1pc3Npb25Hcm91cChzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXAgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFsbE9wdGlvbkdyb3VwcyA9IHRoaXMuZ2V0QWxsT3B0aW9uc0dyb3VwcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiBhbGxPcHRpb25Hcm91cHMuZmluZChnID0+XG5cdFx0XHRnLmtpbmQgPT09ICdwZXJtaXNzaW9ucydcblx0XHRcdCYmIGcuaXRlbXMubGVuZ3RoID4gMFxuXHRcdFx0JiYgdGhpcy5ldmFsdWF0ZU9wdGlvbkdyb3VwVmlzaWJpbGl0eShnKVxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVmcmVzaCBhbGwgcmVnaXN0ZXJlZCBvcHRpb24gZ3JvdXBzIGZvciB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24uXG5cdCAqIEZpcmVzIGV2ZW50cyBmb3IgZWFjaCBvcHRpb24gZ3JvdXAgd2l0aCB0aGVpciBjdXJyZW50IHNlbGVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgcmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpOiB2b2lkIHtcblx0XHQvLyBVc2UgdGhlIHNoYXJlZCBoZWxwZXIgdG8gY29tcHV0ZSB2aXNpYmlsaXR5IGFuZCB1cGRhdGUgY29udGV4dCBrZXlzXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0Y29uc3QgYWxsT3B0aW9uc0dyb3VwcyA9IHRoaXMuZ2V0QWxsT3B0aW9uc0dyb3VwcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHZpc2libGVPcHRpb25Hcm91cHMgPSB0aGlzLmdldFZpc2libGVPcHRpb25Hcm91cHNNb2RlQW5kVXBkYXRlQ29udGV4dEtleXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWFsbE9wdGlvbnNHcm91cHMubGVuZ3RoIHx8ICF2aXNpYmxlT3B0aW9uR3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0Ly8gTm8gdmlzaWJsZSBvcHRpb25zIC0gaGVscGVyIGFscmVhZHkgdXBkYXRlZCBjb250ZXh0IGtleXNcblx0XHRcdHRoaXMuaGlkZUFsbFNlc3Npb25QaWNrZXJXaWRnZXRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgd2lkZ2V0cyBuZWVkIHJlY3JlYXRpb24gKGRpZmZlcmVudCBzZXQgb2YgdmlzaWJsZSBncm91cHMpXG5cdFx0Y29uc3QgY3VycmVudFdpZGdldEdyb3VwSWRzID0gbmV3IFNldCh0aGlzLmNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cy5rZXlzKCkpO1xuXHRcdGNvbnN0IG5lZWRzUmVjcmVhdGlvbiA9XG5cdFx0XHRjdXJyZW50V2lkZ2V0R3JvdXBJZHMuc2l6ZSAhPT0gdmlzaWJsZU9wdGlvbkdyb3Vwcy5sZW5ndGggfHxcblx0XHRcdCF2aXNpYmxlT3B0aW9uR3JvdXBzLmV2ZXJ5KGdyb3VwID0+IGN1cnJlbnRXaWRnZXRHcm91cElkcy5oYXMoZ3JvdXAuaWQpKTtcblxuXHRcdGlmIChuZWVkc1JlY3JlYXRpb24gJiYgdGhpcy5fbGFzdFNlc3Npb25QaWNrZXJBY3Rpb24gJiYgdGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcikge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0cyA9IHRoaXMuY3JlYXRlQ2hhdFNlc3Npb25QaWNrZXJXaWRnZXRzKHRoaXMuX2xhc3RTZXNzaW9uUGlja2VyQWN0aW9uLCB0aGlzLl9sYXN0U2Vzc2lvblBpY2tlck9wdGlvbnMpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRTZXNzaW9uUGlja2VyQ29udGFpbmVyKTtcblx0XHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHdpZGdldHMpIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9tLiQoJy5hY3Rpb24taXRlbS5jaGF0LXNlc3Npb25QaWNrZXItaXRlbScpO1xuXHRcdFx0XHR3aWRnZXQucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBvcHRpb24gY2hhbmdlIGV2ZW50cyBmb3IgZXhpc3Rpbmcgd2lkZ2V0cyB0byBzeW5jIHRoZWlyIHN0YXRlXG5cdFx0Ly8gKG9ubHkgaWYgd2UgaGF2ZSBhIHNlc3Npb24gY29udGV4dCAtIGluIHdlbGNvbWUgdmlldywgb3B0aW9ucyBhcmVuJ3QgcGVyc2lzdGVkIHlldClcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtvcHRpb25Hcm91cElkXSBvZiB0aGlzLmNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50T3B0aW9uID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25Hcm91cElkKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRPcHRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25Hcm91cCA9IGFsbE9wdGlvbnNHcm91cHMuZmluZChnID0+IGcuaWQgPT09IG9wdGlvbkdyb3VwSWQpO1xuXHRcdFx0XHRcdGlmIChvcHRpb25Hcm91cCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudE9wdGlvbklkID0gdHlwZW9mIGN1cnJlbnRPcHRpb24gPT09ICdzdHJpbmcnID8gY3VycmVudE9wdGlvbiA6IGN1cnJlbnRPcHRpb24uaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtID0gb3B0aW9uR3JvdXAuaXRlbXMuZmluZCgobTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKSA9PiBtLmlkID09PSBjdXJyZW50T3B0aW9uSWQpO1xuXHRcdFx0XHRcdFx0Ly8gSWYgY3VycmVudE9wdGlvbiBpcyBhbiBvYmplY3QgKG5vdCBhIHN0cmluZyBJRCksIGl0IHJlcHJlc2VudHMgYSBjb21wbGV0ZSBvcHRpb24gaXRlbSBhbmQgc2hvdWxkIGJlIHVzZWQgZGlyZWN0bHkuXG5cdFx0XHRcdFx0XHQvLyBPdGhlcndpc2UsIGlmIGl0J3MgYSBzdHJpbmcgSUQsIGxvb2sgdXAgdGhlIGNvcnJlc3BvbmRpbmcgaXRlbSBhbmQgdXNlIHRoYXQuXG5cdFx0XHRcdFx0XHRpZiAoaXRlbSAmJiB0eXBlb2YgY3VycmVudE9wdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5nZXRPckNyZWF0ZU9wdGlvbkVtaXR0ZXIob3B0aW9uR3JvdXBJZCkuZmlyZShpdGVtKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGN1cnJlbnRPcHRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ2V0T3JDcmVhdGVPcHRpb25FbWl0dGVyKG9wdGlvbkdyb3VwSWQpLmZpcmUoY3VycmVudE9wdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZGVBbGxTZXNzaW9uUGlja2VyV2lkZ2V0cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGN1cnJlbnQgb3B0aW9uIGZvciBhIHNwZWNpZmljIG9wdGlvbiBncm91cC5cblx0ICogUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlIHNlc3Npb24gZG9lc24ndCBoYXZlIHRoaXMgb3B0aW9uIGNvbmZpZ3VyZWQuXG5cdCAqL1xuXHRwcml2YXRlIGdldEN1cnJlbnRPcHRpb25Gb3JHcm91cChvcHRpb25Hcm91cElkOiBzdHJpbmcpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHJldHVybiBhbiBvcHRpb24gaWYgdGhlIHNlc3Npb24gaGFzIGl0IGNvbmZpZ3VyZWRcblx0XHRpZiAodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25Hcm91cElkKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWZmZWN0aXZlU2Vzc2lvblR5cGUgPSB0aGlzLmdldEVmZmVjdGl2ZVNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgb3B0aW9uR3JvdXBzID0gZWZmZWN0aXZlU2Vzc2lvblR5cGUgPyB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoZWZmZWN0aXZlU2Vzc2lvblR5cGUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG9wdGlvbkdyb3VwID0gb3B0aW9uR3JvdXBzPy5maW5kKGcgPT4gZy5pZCA9PT0gb3B0aW9uR3JvdXBJZCk7XG5cdFx0aWYgKCFvcHRpb25Hcm91cCB8fCBvcHRpb25Hcm91cC5pdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50T3B0aW9uVmFsdWUgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbkdyb3VwSWQpO1xuXHRcdGlmICghY3VycmVudE9wdGlvblZhbHVlKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0SXRlbSA9IG9wdGlvbkdyb3VwLml0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmRlZmF1bHQpO1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRJdGVtO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgY3VycmVudE9wdGlvblZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZE9wdGlvbklkID0gY3VycmVudE9wdGlvblZhbHVlLnRyaW0oKTtcblx0XHRcdHJldHVybiBvcHRpb25Hcm91cC5pdGVtcy5maW5kKG0gPT4gbS5pZCA9PT0gbm9ybWFsaXplZE9wdGlvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGN1cnJlbnRPcHRpb25WYWx1ZSBhcyBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW07XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGhhc1dvcmtzcGFjZVNjbVJlcG9zaXRvcnkoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRpZiAoZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByZXBvIG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdGlmIChyZXBvLnByb3ZpZGVyLnJvb3RVcmkgJiYgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVwby5wcm92aWRlci5yb290VXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZmZlY3RpdmVTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpID8/IChzZXNzaW9uUmVzb3VyY2UgPyBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgYWdlbnRTZXNzaW9uVHlwZSBjb250ZXh0IGtleSBiYXNlZCBvbiBkZWxlZ2F0ZSBvciBhY3R1YWwgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlQWdlbnRTZXNzaW9uVHlwZUNvbnRleHRLZXkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblxuXHRcdC8vIERldGVybWluZSBlZmZlY3RpdmUgc2Vzc2lvbiB0eXBlOlxuXHRcdC8vIC0gSWYgd2UgaGF2ZSBhIGRlbGVnYXRlIHdpdGggYSBzZXR0ZXIgKGUuZy4sIHdlbGNvbWUgcGFnZSksIHVzZSB0aGUgZGVsZWdhdGUncyBzZXNzaW9uIHR5cGVcblx0XHQvLyAtIE90aGVyd2lzZSwgdXNlIHRoZSBhY3R1YWwgc2Vzc2lvbidzIHR5cGVcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlO1xuXHRcdGNvbnN0IGRlbGVnYXRlU2Vzc2lvblR5cGUgPSBkZWxlZ2F0ZT8uc2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyICYmIGRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZGVsZWdhdGVTZXNzaW9uVHlwZSB8fCAoc2Vzc2lvblJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgOiAnJyk7XG5cblx0XHR0aGlzLmFnZW50U2Vzc2lvblR5cGVLZXkuc2V0KHNlc3Npb25UeXBlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uU3VwcG9ydHNEZWxlZ2F0aW9uS2V5LnNldCh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc3VwcG9ydHNEZWxlZ2F0aW9uRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWRnZXQgbG9jayBzdGF0ZSBiYXNlZCBvbiBhIHNlc3Npb24gdHlwZS5cblx0ICogTG9jYWwgc2Vzc2lvbnMgdW5sb2NrIGZyb20gY29kaW5nIGFnZW50IG1vZGUsIHdoaWxlIHJlbW90ZS9jbG91ZCBzZXNzaW9ucyBsb2NrIHRvIGNvZGluZyBhZ2VudCBtb2RlLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVXaWRnZXRMb2NrU3RhdGVGcm9tU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldD8udW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoY29udHJpYnV0aW9uKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQ/LmxvY2tUb0NvZGluZ0FnZW50KGNvbnRyaWJ1dGlvbi5uYW1lLCBjb250cmlidXRpb24uZGlzcGxheU5hbWUsIGNvbnRyaWJ1dGlvbi50eXBlLCBjb250cmlidXRpb24uYWdlbnRIb3N0UHJvdmlkZXJJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3dpZGdldD8udW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBzZXNzaW9uIHR5cGUgb2YgdGhlIGFjdGl2ZSBjaGF0IHNlc3Npb24gZm9yIHRoZSBkZWxlZ2F0aW9uIHBpY2tlci5cblx0ICovXG5cdHByaXZhdGUgZ2V0QWN0aXZlU2Vzc2lvblR5cGVGb3JEZWxlZ2F0aW9uKCk6IEFnZW50U2Vzc2lvblRhcmdldCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHQvLyBUT0RPOiBSZW1vdmUgaGFyZGNvZGVkIHByb3ZpZGVycyBmcm9tIGNvcmVcblx0XHRyZXR1cm4gc2Vzc2lvblJlc291cmNlID8gKGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKHNlc3Npb25SZXNvdXJjZSkgPz8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbGVjdHMgKG9yIGNsZWFycykgdGhlIHBlbmRpbmcgZGVsZWdhdGlvbiB0YXJnZXQuIFdoaWxlIGEgdGFyZ2V0IGlzIHBlbmRpbmcsIHRoZSB3aWRnZXRcblx0ICogbG9ja3MgdG8gdGhlIHRhcmdldCBhZ2VudCBhbmQgdGhlIGBoYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldGAgY29udGV4dCBrZXkgaGlkZXMgdGhlXG5cdCAqIGFnZW50IGFuZCBtb2RlbCBwaWNrZXJzLiBSZS1zZWxlY3RpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uIGNsZWFycyB0aGUgcGVuZGluZyB0YXJnZXQgYW5kXG5cdCAqIHJlc3RvcmVzIHRoZSBwaWNrZXJzLlxuXHQgKi9cblx0cHVibGljIGNvbnRpbnVlSW5TZXNzaW9uKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpOiB2b2lkIHtcblx0XHR0aGlzLnNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KHByb3ZpZGVyKTtcblx0XHR0aGlzLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBpc0FjdGl2ZSA9IHRoaXMuZ2V0QWN0aXZlU2Vzc2lvblR5cGVGb3JEZWxlZ2F0aW9uKCkgPT09IHByb3ZpZGVyO1xuXHRcdHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0ID0gaXNBY3RpdmUgPyB1bmRlZmluZWQgOiBwcm92aWRlcjtcblx0XHR0aGlzLmNoYXRIYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldEtleS5zZXQoISF0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldCk7XG5cdFx0dGhpcy51cGRhdGVXaWRnZXRMb2NrU3RhdGVGcm9tU2Vzc2lvblR5cGUocHJvdmlkZXIpO1xuXHRcdHRoaXMudXBkYXRlQWdlbnRTZXNzaW9uVHlwZUNvbnRleHRLZXkoKTtcblx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIHRoZSBub3RpZmljYXRpb24gd2lkZ2V0IGlzIGluc3RhbnRpYXRlZCBhbmQgYXBwZW5kZWQgdG8gdGhlIG5vdGlmaWNhdGlvbiBjb250YWluZXIuXG5cdCAqL1xuXHRwcml2YXRlIGVuc3VyZU5vdGlmaWNhdGlvbldpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX25vdGlmaWNhdGlvbldpZGdldC52YWx1ZSkge1xuXHRcdFx0Ly8gRmFsbCBiYWNrIHRvIGBnZXRDdXJyZW50U2Vzc2lvblR5cGUoKWAgc28gdGhlIHNlc3Npb24tdHlwZVxuXHRcdFx0Ly8gcGlja2VyIGRlbGVnYXRlIGlzIGNvbnN1bHRlZCBiZWZvcmUgYW55IHJlYWwgc2Vzc2lvbiBleGlzdHNcblx0XHRcdC8vIChlLmcuIGVtcHR5IHdvcmtzcGFjZSArIENvcGlsb3QgQ0xJIFtBZ2VudCBIb3N0XSBzZWxlY3RlZCkuIFdpdGhvdXRcblx0XHRcdC8vIHRoaXMgZmFsbGJhY2ssIGBfY3VycmVudFNlc3Npb25UeXBlYCBzdGF5cyB1bmRlZmluZWQgdW50aWxcblx0XHRcdC8vIHRoZSB1c2VyIGNyZWF0ZXMgYSBzZXNzaW9uIGFuZCBgc2Vzc2lvblR5cGVzYC1nYXRlZFxuXHRcdFx0Ly8gbm90aWZpY2F0aW9ucyBuZXZlciByZW5kZXIuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25XaWRnZXQudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwge1xuXHRcdFx0XHRtb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTogdGhpcy5fbm90aWZpY2F0aW9uTW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZU9ic2VydmFibGUsXG5cdFx0XHRcdGRlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQ6IHRoaXMuX2RlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQsXG5cdFx0XHRcdG9wZW5Nb2RlbFBpY2tlcjogKCkgPT4gdGhpcy5vcGVuTW9kZWxQaWNrZXIoKSxcblx0XHRcdFx0c3dpdGNoVG9Nb2RlbDogbW9kZWxJZGVudGlmaWVyID0+IHRoaXMuc3dpdGNoTW9kZWxCeUlkZW50aWZpZXIobW9kZWxJZGVudGlmaWVyLCAvKiBzdG9yZVNlbGVjdGlvbiAqLyB0cnVlLCAvKiBpc1VzZXJBY3Rpb24gKi8gdHJ1ZSksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogKHZpc2libGUsIGZvY3VzVGFyZ2V0KSA9PiB0aGlzLm5vdGljZUhvc3Quc2V0T2NjdXBpZWQoQ2hhdElucHV0Tm90aWNlTGFuZS5Ob3RpZmljYXRpb24sIHZpc2libGUsIGZvY3VzVGFyZ2V0KSxcblx0XHRcdFx0Zm9jdXNJbnB1dDogKCkgPT4gdGhpcy5mb2N1cygpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25XaWRnZXQudmFsdWUuYXR0YWNoVG8odGhpcy5jaGF0SW5wdXROb3RpZmljYXRpb25Db250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBMYXp5LWluc3RhbnRpYXRlIHRoZSBnb2FsIGJhbm5lciB3aWRnZXQgb24gZmlyc3QgdXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBlbnN1cmVHb2FsQmFubmVyV2lkZ2V0KCk6IENoYXRHb2FsQmFubmVyV2lkZ2V0IHtcblx0XHRpZiAoIXRoaXMuX2dvYWxCYW5uZXJXaWRnZXQudmFsdWUpIHtcblx0XHRcdC8vIFRoZSBgX2dvYWxCYW5uZXJXaWRnZXRgIE11dGFibGVEaXNwb3NhYmxlIG93bnMgYW5kIGRpc3Bvc2VzIHRoZSB3aWRnZXQ7XG5cdFx0XHQvLyBkbyBub3QgYWxzbyBgX3JlZ2lzdGVyYCBpdCBoZXJlIHRvIGF2b2lkIGEgZG91YmxlLWRpc3Bvc2UuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBuZXcgQ2hhdEdvYWxCYW5uZXJXaWRnZXQoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkRpc21pc3MoKCkgPT4gdGhpcy5fb25EaWREaXNtaXNzR29hbEJhbm5lci5maXJlKCkpKTtcblx0XHRcdHRoaXMuX2dvYWxCYW5uZXJXaWRnZXQudmFsdWUgPSB3aWRnZXQ7XG5cdFx0XHR3aWRnZXQuYXR0YWNoVG8odGhpcy5jaGF0R29hbEJhbm5lckNvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nb2FsQmFubmVyV2lkZ2V0LnZhbHVlO1xuXHR9XG5cblx0LyoqIFNob3dzIHRoZSBhdXRvcGlsb3QgZ29hbCBiYW5uZXIgd2l0aCBhIGxvYWRpbmcgc3RhdGUuICovXG5cdHNob3dHb2FsQmFubmVyTG9hZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZUdvYWxCYW5uZXJXaWRnZXQoKS5zZXRMb2FkaW5nKCk7XG5cdH1cblxuXHQvKiogVXBkYXRlcyB0aGUgZ29hbCBiYW5uZXIgd2l0aCB0aGUgZ2l2ZW4gc3VtbWFyeSB0ZXh0LiAqL1xuXHRzZXRHb2FsQmFubmVyKHN1bW1hcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZW5zdXJlR29hbEJhbm5lcldpZGdldCgpLnNldEdvYWwoc3VtbWFyeSk7XG5cdH1cblxuXHQvKiogSGlkZXMgdGhlIGdvYWwgYmFubmVyLiAqL1xuXHRjbGVhckdvYWxCYW5uZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fZ29hbEJhbm5lcldpZGdldC52YWx1ZT8uY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyB0aGUgY29udGV4dCB1c2FnZSBkZXRhaWxzIHBvcHVwIGFuZCBmb2N1c2VzIGl0LlxuXHQgKiBAcmV0dXJucyBXaGV0aGVyIHRoZSBkZXRhaWxzIHdlcmUgc3VjY2Vzc2Z1bGx5IHNob3duLlxuXHQgKi9cblx0c2hvd0NvbnRleHRVc2FnZURldGFpbHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Py5zaG93RGV0YWlscygpID8/IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGNvbnRleHQgdXNhZ2Ugd2lkZ2V0IGJhc2VkIG9uIHRoZSBjdXJyZW50IG1vZGVsLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVDb250ZXh0VXNhZ2VXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dFVzYWdlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdGlmICghbW9kZWwgfHwgIXRoaXMuY29udGV4dFVzYWdlV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fY29udGV4dFVzYWdlRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblx0XHRsZXQgbGFzdFJlcXVlc3QgPSBtb2RlbC5sYXN0UmVxdWVzdDtcblx0XHRjb25zdCBvYnNlcnZlUHJldmlvdXNSZXNwb25zZSA9IChyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChyZXF1ZXN0LnJlc3BvbnNlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Py51cGRhdGVTZXNzaW9uQ29zdChtb2RlbC5zZXNzaW9uQ29zdCkpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBtb2RlbC5nZXRSZXF1ZXN0cygpLnNsaWNlKDAsIC0xKSkge1xuXHRcdFx0b2JzZXJ2ZVByZXZpb3VzUmVzcG9uc2UocmVxdWVzdCk7XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gJ2FkZFJlcXVlc3QnKSB7XG5cdFx0XHRcdG9ic2VydmVQcmV2aW91c1Jlc3BvbnNlKGxhc3RSZXF1ZXN0KTtcblx0XHRcdFx0bGFzdFJlcXVlc3QgPSBlLnJlcXVlc3Q7XG5cdFx0XHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Py51cGRhdGUobW9kZWwubGFzdFJlcXVlc3QpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmtpbmQgPT09ICdjb21wbGV0ZWRSZXF1ZXN0Jykge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldD8udXBkYXRlKG1vZGVsLmxhc3RSZXF1ZXN0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZS1yZW5kZXIgd2hlbiBsYW5ndWFnZSBtb2RlbHMgYXJyaXZlIChuZWVkZWQgb24gcmVsb2FkIFx1MjAxNCBtb2RlbFxuXHRcdC8vIG1ldGFkYXRhIHByb3ZpZGluZyBjb250ZXh0IHdpbmRvdyBzaXplIG1heSBub3QgYmUgcmVnaXN0ZXJlZCB5ZXQpLlxuXHRcdHN0b3JlLmFkZCh0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHtcblx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gbW9kZWwubGFzdFJlcXVlc3Q7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3Q/Lm1vZGVsSWQpIHtcblx0XHRcdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQ/LnVwZGF0ZShsYXN0UmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5pdGlhbCB1cGRhdGVcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldC51cGRhdGUobW9kZWwubGFzdFJlcXVlc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVWaWV3TW9kZWxDaGFuZ2UoZTogSUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlRGVmZXJyZWROb3RpZmljYXRpb25zRWxpZ2liaWxpdHkoZSk7XG5cdFx0dHJhbnNhY3Rpb24ob2JzZXJ2YWJsZVRyYW5zYWN0aW9uID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRFZGl0b3JGb250RmFtaWx5KCk7XG5cdFx0XHRcdHRoaXMucmVzZXRQZW5kaW5nRGVsZWdhdGlvbkZvclZpZXdNb2RlbENoYW5nZShvYnNlcnZhYmxlVHJhbnNhY3Rpb24pO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hWaWV3TW9kZWxTY29wZWRTdGF0ZSgpO1xuXHRcdFx0XHR0aGlzLmNsZWFyUXVlc3Rpb25DYXJvdXNlbElmU2Vzc2lvbkNoYW5nZWQoZSk7XG5cdFx0XHRcdHRoaXMuY2xlYXJQbGFuUmV2aWV3SWZTZXNzaW9uQ2hhbmdlZChlKTtcblx0XHRcdFx0Ly8gU3dhcCB0aGUgdmlzaWJsZSB0b29sIGNvbmZpcm1hdGlvbiBjYXJvdXNlbCBmb3IgdGhlIG5ldyBzZXNzaW9uXG5cdFx0XHRcdHRoaXMuX3N5bmNUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxGb3JTZXNzaW9uKCk7XG5cdFx0XHRcdHRoaXMucmVjb25jaWxlU2Vzc2lvblR5cGVGb3JWaWV3TW9kZWxDaGFuZ2UoZSwgb2JzZXJ2YWJsZVRyYW5zYWN0aW9uKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdC8vIEFsd2F5cyBmaW5pc2ggdGhlIHNlc3Npb24gc3dpdGNoLCBldmVuIG9uIGFuIGV4Y2VwdGlvbiBiZWZvcmUgdGhpcyBwb2ludCwgc28gYW5cblx0XHRcdFx0Ly8gZXhwbGljaXQgdXNlciBtb2RlbCBwaWNrIGFmdGVyIHRoZSBzd2l0Y2ggcGVyc2lzdHMgbm9ybWFsbHkuXG5cdFx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5lbmRTZXNzaW9uU3dpdGNoKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBSdW5zIGFmdGVyIHRoZSBpbmNvbWluZyB2aWV3IG1vZGVsIGlzIGFzc2lnbmVkIHNvIG1vZGVsIHJlc29sdXRpb24gdXNlcyB0aGUgaW5jb21pbmcgc2Vzc2lvbiBwb29sLlxuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5hcHBseUNvbmZpZ3VyZWREZWZhdWx0KCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZURlZmVycmVkTm90aWZpY2F0aW9uc0VsaWdpYmlsaXR5KGU/OiBJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2RlZmVycmVkTm90aWZpY2F0aW9uc0VuYWJsZWQuc2V0KHRoaXMub3B0aW9ucy5kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHR0aGlzLl9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzRmlyc3RXb3JrYmVuY2hTZXNzaW9uID8/PSAhdGhpcy5jaGF0U2VydmljZS5oYXNTZXNzaW9ucygpO1xuXHRcdGlmIChcblx0XHRcdHRoaXMuX2lzRmlyc3RXb3JrYmVuY2hTZXNzaW9uXG5cdFx0XHQmJiBlPy5wcmV2aW91c1Nlc3Npb25SZXNvdXJjZVxuXHRcdFx0JiYgZS5jdXJyZW50U2Vzc2lvblJlc291cmNlXG5cdFx0XHQmJiAhaXNFcXVhbChlLnByZXZpb3VzU2Vzc2lvblJlc291cmNlLCBlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQmJiAhaXNVbnRpdGxlZENoYXRTZXNzaW9uKGUucHJldmlvdXNTZXNzaW9uUmVzb3VyY2UpXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9pc0ZpcnN0V29ya2JlbmNoU2Vzc2lvbiA9IGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9kZWZlcnJlZE5vdGlmaWNhdGlvbnNFbmFibGVkLnNldCghdGhpcy5faXNGaXJzdFdvcmtiZW5jaFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0UGVuZGluZ0RlbGVnYXRpb25Gb3JWaWV3TW9kZWxDaGFuZ2UodHJhbnNhY3Rpb246IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0T2JzZXJ2YWJsZS5zZXQodW5kZWZpbmVkLCB0cmFuc2FjdGlvbik7XG5cdFx0dGhpcy5jaGF0SGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXRLZXkuc2V0KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFZpZXdNb2RlbFNjb3BlZFN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIFVwZGF0ZSBhZ2VudFNlc3Npb25UeXBlIHdoZW4gdmlldyBtb2RlbCBjaGFuZ2VzXG5cdFx0dGhpcy51cGRhdGVBZ2VudFNlc3Npb25UeXBlQ29udGV4dEtleSgpO1xuXHRcdHRoaXMucmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpO1xuXHRcdHRoaXMuZW5zdXJlTm90aWZpY2F0aW9uV2lkZ2V0KCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZXh0VXNhZ2VXaWRnZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJRdWVzdGlvbkNhcm91c2VsSWZTZXNzaW9uQ2hhbmdlZChlOiBJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0bGV0IGhhc01hdGNoaW5nUmVzb3VyY2UgPSBmYWxzZTtcblx0XHRpZiAoZS5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fcXVlc3Rpb25DYXJvdXNlbFNlc3Npb25SZXNvdXJjZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKGlzRXF1YWwociwgZS5jdXJyZW50U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdGhhc01hdGNoaW5nUmVzb3VyY2UgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9xdWVzdGlvbkNhcm91c2VsU2Vzc2lvblJlc291cmNlcy5zaXplID4gMCAmJiAoIWUuY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCAhaGFzTWF0Y2hpbmdSZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuY2xlYXJRdWVzdGlvbkNhcm91c2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclBsYW5SZXZpZXdJZlNlc3Npb25DaGFuZ2VkKGU6IElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRsZXQgaGFzTWF0Y2hpbmdQbGFuUmV2aWV3UmVzb3VyY2UgPSBmYWxzZTtcblx0XHRpZiAoZS5jdXJyZW50U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5fcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKGlzRXF1YWwociwgZS5jdXJyZW50U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdGhhc01hdGNoaW5nUGxhblJldmlld1Jlc291cmNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMuc2l6ZSA+IDAgJiYgKCFlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgIWhhc01hdGNoaW5nUGxhblJldmlld1Jlc291cmNlKSkge1xuXHRcdFx0dGhpcy5jbGVhclBsYW5SZXZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlY29uY2lsZVNlc3Npb25UeXBlRm9yVmlld01vZGVsQ2hhbmdlKGU6IElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQsIHRyYW5zYWN0aW9uOiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlT2JzZXJ2YWJsZS5zZXQoZS5jdXJyZW50U2Vzc2lvblJlc291cmNlLCB0cmFuc2FjdGlvbik7XG5cdFx0Ly8gVHJhY2sgdGhlIGN1cnJlbnQgc2Vzc2lvbiB0eXBlIGFuZCByZS1pbml0aWFsaXplIG1vZGVsIHNlbGVjdGlvblxuXHRcdC8vIHdoZW4gdGhlIHNlc3Npb24gdHlwZSBjaGFuZ2VzIChkaWZmZXJlbnQgc2Vzc2lvbiB0eXBlcyBtYXkgaGF2ZVxuXHRcdC8vIGRpZmZlcmVudCBtb2RlbCBwb29scyB2aWEgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlKS5cblx0XHRjb25zdCBuZXdTZXNzaW9uVHlwZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCk7XG5cdFx0aWYgKGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUgJiYgbmV3U2Vzc2lvblR5cGUgIT09IHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZSkge1xuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgW0NWVk1dLjEgb25EaWRDaGFuZ2VWaWV3TW9kZWwgLT4gc2Vzc2lvbiBjaGFuZ2U6ICR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfSAtPiAke25ld1Nlc3Npb25UeXBlfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSwgJHtlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCB1bmRlZmluZWQsIHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlLmdldCgpLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZS5zZXQobmV3U2Vzc2lvblR5cGUsIHRyYW5zYWN0aW9uKTtcblx0XHRcdHRoaXMuaW5pdFNlbGVjdGVkTW9kZWwoKTtcblx0XHRcdC8vIE1vZGUgZmlyc3Q6IG1vZGVsIHZhbGlkaXR5IGRlcGVuZHMgb24gdGhlIG1vZGUgKGFnZW50LWNhcGFibGUgbW9kZWxzIGFyZSBhIHN1YnNldCksXG5cdFx0XHQvLyBzbyB2YWxpZGF0aW5nIHRoZSBtb2RlbCBhZ2FpbnN0IHRoZSBvdXRnb2luZyBtb2RlIHdvdWxkIGp1ZGdlIGl0IGJ5IHRoZSB3cm9uZyBydWxlLlxuXHRcdFx0dGhpcy5jaGVja01vZGVJblNlc3Npb25Qb29sKCk7XG5cdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuZW5zdXJlQ3VycmVudE1vZGVsU3VwcG9ydGVkKCk7XG5cdFx0fSBlbHNlIGlmIChlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYFtDVlZNXS4yIG9uRGlkQ2hhbmdlVmlld01vZGVsIC0+IHNlc3Npb24gY2hhbmdlOiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZX0gLT4gJHtuZXdTZXNzaW9uVHlwZX0gaW4gJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX0sICR7ZS5jdXJyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCwgdW5kZWZpbmVkLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZU9ic2VydmFibGUuc2V0KG5ld1Nlc3Npb25UeXBlLCB0cmFuc2FjdGlvbik7XG5cdFx0XHR0aGlzLnJlc3RvcmVQZXJUeXBlTW9kZWxBZnRlclZpZXdNb2RlbEFzc2lnbm1lbnQoKTtcblx0XHRcdC8vIFJlLWluaXRpYWxpemUgZnJvbSBzdG9yYWdlIGZpcnN0IHNvIHRoZSB1c2VyJ3MgcHJldmlvdXMgc2VsZWN0aW9uIGZvclxuXHRcdFx0Ly8gdGhpcyBwb29sIGlzIHJlc3RvcmVkXG5cdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIucmVpbml0aWFsaXplSWZPdXRzaWRlUG9vbCgoKSA9PiB0aGlzLmluaXRTZWxlY3RlZE1vZGVsKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzdG9yZVBlclR5cGVNb2RlbEFmdGVyVmlld01vZGVsQXNzaWdubWVudCgpOiB2b2lkIHtcblx0XHQvLyBGcmVzaCB1bnRpdGxlZCBvd24tcG9vbCBzZXNzaW9uOiBgc2V0SW5wdXRNb2RlbGAgcHJlLWFkdmFuY2VkIGBfY3VycmVudFNlc3Npb25UeXBlYFxuXHRcdC8vIGJlZm9yZSB0aGlzIGV2ZW50LCBzbyB0aGUgYnJhbmNoIGFib3ZlIGNhbid0IGRldGVjdCBpdC4gVGhlIHZpZXcgbW9kZWwgaXMgbm93XG5cdFx0Ly8gYXNzaWduZWQsIHNvIGBnZXRDdXJyZW50U2Vzc2lvblR5cGUoKWAgaXMgY29ycmVjdCBhbmQgaXQgaXMgc2FmZSB0byByZXN0b3JlIHRoZVxuXHRcdC8vIHJlbWVtYmVyZWQgcGVyLXNlc3Npb24tdHlwZSBtb2RlbC4gQXV0b21hdGljIHJlc3RvcmVzIHVwZGF0ZSBjb252ZXJzYXRpb24gc3RhdGUgb25seTtcblx0XHQvLyB0aGUgcmVtZW1iZXJlZCBwcmVmZXJlbmNlIGlzIHdyaXR0ZW4gZXhjbHVzaXZlbHkgYnkgZXhwbGljaXQgdXNlciBwaWNrcy5cblx0XHQvLyBJZiB0aGUgcmVtZW1iZXJlZCBtb2RlbCBoYXMgbm90IGxvYWRlZCB5ZXQsIHNraXAgcG9vbCB2YWxpZGF0aW9uIHNvIHRoZSBwaWNrZXIgZG9lcyBub3Rcblx0XHQvLyBtb3ZlIGF3YXkgZnJvbSB0aGUgbW9kZWwgdGhhdCB3aWxsIGJlIGFwcGxpZWQgd2hlbiBpdCBhcHBlYXJzLlxuXHRcdGlmICh0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIucmVzdG9yZVBlclR5cGVNb2RlbCkge1xuXHRcdFx0dGhpcy5pbml0U2VsZWN0ZWRNb2RlbCgpO1xuXHRcdFx0aWYgKCF0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuaGFzUGVuZGluZ0ludGVudCgpICYmICF0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuaXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5lbnN1cmVDdXJyZW50TW9kZWxTdXBwb3J0ZWQoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaW5pdGlhbFZhbHVlOiBzdHJpbmcsIHdpZGdldDogSUNoYXRXaWRnZXQpIHtcblx0XHR0aGlzLl93aWRnZXQgPSB3aWRnZXQ7XG5cdFx0dGhpcy51cGRhdGVEZWZlcnJlZE5vdGlmaWNhdGlvbnNFbGlnaWJpbGl0eSgpO1xuXHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2VPYnNlcnZhYmxlLnNldCh3aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5nZXRWaXNpYmxlT3B0aW9uR3JvdXBzTW9kZUFuZFVwZGF0ZUNvbnRleHRLZXlzKHRoaXMuZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpKTtcblxuXHRcdC8vIEluaXRpYWxpemUgbG9jayBzdGF0ZSB3aGVuIHJlbmRlcmluZyB3aXRoIGEgcHJlLXNlbGVjdGVkIHNlc3Npb24gcHJvdmlkZXIgKGUuZy4sIHdlbGNvbWUgdmlldyByZXN0b3JlKVxuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU7XG5cdFx0aWYgKGRlbGVnYXRlPy5zZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXIgJiYgZGVsZWdhdGU/LmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcikge1xuXHRcdFx0Y29uc3QgaW5pdGlhbFNlc3Npb25UeXBlID0gZGVsZWdhdGUuZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyKCk7XG5cdFx0XHRpZiAoaW5pdGlhbFNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlV2lkZ2V0TG9ja1N0YXRlRnJvbVNlc3Npb25UeXBlKGluaXRpYWxTZXNzaW9uVHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKGUgPT4gdGhpcy5oYW5kbGVWaWV3TW9kZWxDaGFuZ2UoZSkpKTtcblxuXHRcdGxldCBlbGVtZW50cztcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcpIHtcblx0XHRcdGVsZW1lbnRzID0gZG9tLmgoJy5pbnRlcmFjdGl2ZS1pbnB1dC1wYXJ0JywgW1xuXHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtcGVyc2lzdGVudC1jb250ZW50QHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtYW5kLWVkaXQtc2Vzc2lvbicsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtcGxhbi1yZXZpZXctd2lkZ2V0LWNvbnRhaW5lckBjaGF0UGxhblJldmlld0NvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC13aWRnZXQtY29udGFpbmVyQGNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY29uZmlybWF0aW9uLWNhcm91c2VsLWNvbnRhaW5lckBjaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoYC4ke2NoYXRJbnB1dFN0YWNrQ2xhc3N9YCwgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoYC5jaGF0LWlucHV0LW5vdGlmaWNhdGlvbi1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31AY2hhdElucHV0Tm90aWZpY2F0aW9uQ29udGFpbmVyYCksXG5cdFx0XHRcdFx0XHRkb20uaChgLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31Adm9pY2VNb2RlT25ib2FyZGluZ0NvbnRhaW5lcmApLFxuXHRcdFx0XHRcdFx0ZG9tLmgoYC5kaWN0YXRpb24tb25ib2FyZGluZy1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31AZGljdGF0aW9uT25ib2FyZGluZ0NvbnRhaW5lcmApLFxuXHRcdFx0XHRcdFx0ZG9tLmgoYC5jaGF0LWdvYWwtYmFubmVyLWNvbnRhaW5lci4ke2NoYXRJbnB1dFN0YWNrU2xvdENsYXNzfUBjaGF0R29hbEJhbm5lckNvbnRhaW5lcmApLFxuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvZG8tbGlzdC13aWRnZXQtY29udGFpbmVyQGNoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXJ0aWZhY3RzLXdpZGdldC1jb250YWluZXJAY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbkBjaGF0RWRpdGluZ1Nlc3Npb25XaWRnZXRDb250YWluZXInKSxcblx0XHRcdFx0XHRcdGRvbS5oKGAuY2hhdC1nZXR0aW5nLXN0YXJ0ZWQtdGlwLWNvbnRhaW5lci4ke2NoYXRJbnB1dFN0YWNrU2xvdENsYXNzfUBjaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXJgKSxcblx0XHRcdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtYW5kLXNpZGUtdG9vbGJhckBpbnB1dEFuZFNpZGVUb29sYmFyJywgW1xuXHRcdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtY29udGFpbmVyQGlucHV0Q29udGFpbmVyJywgW1xuXHRcdFx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1lZGl0b3ItY29udGFpbmVyQGVkaXRvckNvbnRhaW5lcicpLFxuXHRcdFx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC10b29sYmFyc0BpbnB1dFRvb2xiYXJzJyksXG5cdFx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXNlY29uZGFyeS10b29sYmFyQHNlY29uZGFyeVRvb2xiYXInLCBbXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtY29udGV4dC11c2FnZS1jb250YWluZXJAY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtc3RhdHVzLWNvbnRhaW5lckBzdGF0dXNUb29sYmFyQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWF0dGFjaG1lbnRzLWNvbnRhaW5lckBhdHRhY2htZW50c0NvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0QGF0dGFjaGVkQ29udGV4dENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtZm9sbG93dXBzQGZvbGxvd3Vwc0NvbnRhaW5lcicpLFxuXHRcdFx0XHRdKVxuXHRcdFx0XSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnRzID0gZG9tLmgoJy5pbnRlcmFjdGl2ZS1pbnB1dC1wYXJ0JywgW1xuXHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtcGVyc2lzdGVudC1jb250ZW50QHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1wbGFuLXJldmlldy13aWRnZXQtY29udGFpbmVyQGNoYXRQbGFuUmV2aWV3Q29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1xdWVzdGlvbi1jYXJvdXNlbC13aWRnZXQtY29udGFpbmVyQGNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNvbmZpcm1hdGlvbi1jYXJvdXNlbC1jb250YWluZXJAY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmludGVyYWN0aXZlLWlucHV0LWZvbGxvd3Vwc0Bmb2xsb3d1cHNDb250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoYC4ke2NoYXRJbnB1dFN0YWNrQ2xhc3N9YCwgW1xuXHRcdFx0XHRcdGRvbS5oKGAuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tY29udGFpbmVyLiR7Y2hhdElucHV0U3RhY2tTbG90Q2xhc3N9QGNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbnRhaW5lcmApLFxuXHRcdFx0XHRcdGRvbS5oKGAudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNvbnRhaW5lci4ke2NoYXRJbnB1dFN0YWNrU2xvdENsYXNzfUB2b2ljZU1vZGVPbmJvYXJkaW5nQ29udGFpbmVyYCksXG5cdFx0XHRcdFx0ZG9tLmgoYC5kaWN0YXRpb24tb25ib2FyZGluZy1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31AZGljdGF0aW9uT25ib2FyZGluZ0NvbnRhaW5lcmApLFxuXHRcdFx0XHRcdGRvbS5oKGAuY2hhdC1nb2FsLWJhbm5lci1jb250YWluZXIuJHtjaGF0SW5wdXRTdGFja1Nsb3RDbGFzc31AY2hhdEdvYWxCYW5uZXJDb250YWluZXJgKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9kby1saXN0LXdpZGdldC1jb250YWluZXJAY2hhdElucHV0VG9kb0xpc3RXaWRnZXRDb250YWluZXInKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXJ0aWZhY3RzLXdpZGdldC1jb250YWluZXJAY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1lZGl0aW5nLXNlc3Npb25AY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoYC5jaGF0LWdldHRpbmctc3RhcnRlZC10aXAtY29udGFpbmVyLiR7Y2hhdElucHV0U3RhY2tTbG90Q2xhc3N9QGNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lcmApLFxuXHRcdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtYW5kLXNpZGUtdG9vbGJhckBpbnB1dEFuZFNpZGVUb29sYmFyJywgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWlucHV0LWNvbnRhaW5lckBpbnB1dENvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWF0dGFjaG1lbnRzLWNvbnRhaW5lckBhdHRhY2htZW50c0NvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dEBhdHRhY2hlZENvbnRleHRDb250YWluZXInKSxcblx0XHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1lZGl0b3ItY29udGFpbmVyQGVkaXRvckNvbnRhaW5lcicpLFxuXHRcdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtdG9vbGJhcnNAaW5wdXRUb29sYmFycycpLFxuXHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtc2Vjb25kYXJ5LXRvb2xiYXJAc2Vjb25kYXJ5VG9vbGJhcicsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtY29udGV4dC11c2FnZS1jb250YWluZXJAY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWlucHV0LXN0YXR1cy1jb250YWluZXJAc3RhdHVzVG9vbGJhckNvbnRhaW5lcicpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRhaW5lciA9IGVsZW1lbnRzLnJvb3Q7XG5cdFx0dGhpcy5wZXJzaXN0ZW50Q29udGVudENvbnRhaW5lciA9IGVsZW1lbnRzLnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyO1xuXHRcdHRoaXMuY2hhdElucHV0T3ZlcmxheSA9IGRvbS4kKCcuY2hhdC1pbnB1dC1vdmVybGF5Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZCh0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kKHRoaXMuY2hhdElucHV0T3ZlcmxheSk7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29tcGFjdCcsIHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKTtcblxuXHRcdC8vIENyZWF0ZSBhIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIGZvciBvcHRpb24gZ3JvdXAgdmlzaWJpbGl0eSBleHByZXNzaW9uc1xuXHRcdC8vIFRoaXMgaXNvbGF0ZXMgY2hhdFNlc3Npb25PcHRpb24uKiBjb250ZXh0IGtleXMgdG8gdGhpcyBzcGVjaWZpYyBjaGF0IGlucHV0IGluc3RhbmNlXG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmNvbnRhaW5lcikpO1xuXG5cdFx0dGhpcy5mb2xsb3d1cHNDb250YWluZXIgPSBlbGVtZW50cy5mb2xsb3d1cHNDb250YWluZXI7XG5cdFx0Y29uc3QgaW5wdXRBbmRTaWRlVG9vbGJhciA9IGVsZW1lbnRzLmlucHV0QW5kU2lkZVRvb2xiYXI7IC8vIFRoZSBjaGF0IGlucHV0IGFuZCB0b29sYmFyIHRvIHRoZSByaWdodFxuXHRcdHRoaXMuaW5wdXRBbmRTaWRlVG9vbGJhciA9IGlucHV0QW5kU2lkZVRvb2xiYXI7XG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSBlbGVtZW50cy5pbnB1dENvbnRhaW5lcjsgLy8gVGhlIGNoYXQgZWRpdG9yLCBhdHRhY2htZW50cywgYW5kIHRvb2xiYXJzXG5cdFx0dGhpcy5pbnB1dENvbnRhaW5lciA9IGlucHV0Q29udGFpbmVyO1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGVsZW1lbnRzLmVkaXRvckNvbnRhaW5lcjtcblx0XHR0aGlzLmF0dGFjaG1lbnRzQ29udGFpbmVyID0gZWxlbWVudHMuYXR0YWNobWVudHNDb250YWluZXI7XG5cdFx0dGhpcy5hdHRhY2hlZENvbnRleHRDb250YWluZXIgPSBlbGVtZW50cy5hdHRhY2hlZENvbnRleHRDb250YWluZXI7XG5cdFx0Y29uc3QgdG9vbGJhcnNDb250YWluZXIgPSBlbGVtZW50cy5pbnB1dFRvb2xiYXJzO1xuXHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhckNvbnRhaW5lciA9IGVsZW1lbnRzLnNlY29uZGFyeVRvb2xiYXI7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHR0aGlzLnNlY29uZGFyeVRvb2xiYXJDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdFx0dGhpcy5jaGF0RWRpdGluZ1Nlc3Npb25XaWRnZXRDb250YWluZXIgPSBlbGVtZW50cy5jaGF0RWRpdGluZ1Nlc3Npb25XaWRnZXRDb250YWluZXI7XG5cdFx0dGhpcy5jaGF0SW5wdXRUb2RvTGlzdFdpZGdldENvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0Q29udGFpbmVyO1xuXHRcdHRoaXMuY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRBcnRpZmFjdHNXaWRnZXRDb250YWluZXI7XG5cdFx0dGhpcy5jaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXIgPSBlbGVtZW50cy5jaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXI7XG5cdFx0dGhpcy5jaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGFpbmVyO1xuXHRcdHRoaXMuY2hhdFBsYW5SZXZpZXdDb250YWluZXIgPSBlbGVtZW50cy5jaGF0UGxhblJldmlld0NvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIgPSBlbGVtZW50cy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyO1xuXHRcdGRvbS5oaWRlKHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlLnJlZ2lzdGVySG9zdCh0aGlzLm5vdGljZUhvc3QsIHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5jaGF0SW5wdXROb3RpZmljYXRpb25Db250YWluZXIgPSBlbGVtZW50cy5jaGF0SW5wdXROb3RpZmljYXRpb25Db250YWluZXI7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJDaGF0SW5wdXRPbmJvYXJkaW5nSG9zdHMoXG5cdFx0XHR0aGlzLm5vdGljZUhvc3QsXG5cdFx0XHR7IHZvaWNlOiBlbGVtZW50cy52b2ljZU1vZGVPbmJvYXJkaW5nQ29udGFpbmVyLCBkaWN0YXRpb246IGVsZW1lbnRzLmRpY3RhdGlvbk9uYm9hcmRpbmdDb250YWluZXIgfSxcblx0XHRcdHRoaXMuY29udGFpbmVyLFxuXHRcdFx0KCkgPT4gdGhpcy5mb2N1cygpLFxuXHRcdFx0dGhpcy52b2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSxcblx0XHRcdHRoaXMuZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0KSk7XG5cdFx0dGhpcy5jaGF0R29hbEJhbm5lckNvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRHb2FsQmFubmVyQ29udGFpbmVyO1xuXHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyID0gZWxlbWVudHMuY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyO1xuXHRcdHRoaXMuc3RhdHVzVG9vbGJhckNvbnRhaW5lciA9IGVsZW1lbnRzLnN0YXR1c1Rvb2xiYXJDb250YWluZXI7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcpIHtcblx0XHRcdHRvb2xiYXJzQ29udGFpbmVyLnByZXBlbmQodGhpcy5jb250ZXh0VXNhZ2VXaWRnZXRDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRleHQgdXNhZ2Ugd2lkZ2V0IFx1MjAxNCB3aWxsIGJlIHBvc2l0aW9uZWQgaW4gdGhlIHRvb2xiYXIgYWZ0ZXIgdG9vbGJhcnMgYXJlIGNyZWF0ZWRcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENvbnRleHRVc2FnZVdpZGdldCkpO1xuXHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0LnNldENoYXRXaWRnZXQod2lkZ2V0KTtcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldC5zZXRTZWxlY3RlZE1vZGVsKHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyKTtcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldC5zZXRNb2RlbENvbmZpZ3VyYXRpb25SZXNvbHZlcihcblx0XHRcdG1vZGVsSWQgPT4gdGhpcy5nZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZCksXG5cdFx0XHR0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLm9uRGlkQ2hhbmdlLFxuXHRcdCk7XG5cdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXRDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQuZG9tTm9kZSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmVuYWJsZUltcGxpY2l0Q29udGV4dCAmJiAhdGhpcy5faW1wbGljaXRDb250ZXh0KSB7XG5cdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHQgPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW1wbGljaXRDb250ZXh0cyksXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5zZXRJbXBsaWNpdENvbnRleHRFbmFibGVtZW50KCk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ltcGxpY2l0Q29udGV4dC5vbkRpZENoYW5nZVZhbHVlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID0gLTE7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUF0dGFjaGVkQ29udGV4dENoYW5nZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMub3B0aW9ucy5lbmFibGVJbXBsaWNpdENvbnRleHQgJiYgdGhpcy5faW1wbGljaXRDb250ZXh0KSB7XG5cdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHQ/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2ltcGxpY2l0Q29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLmVuc3VyZU5vdGlmaWNhdGlvbldpZGdldCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXR0YWNobWVudE1vZGVsLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZGRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2luZGV4T2ZMYXN0QXR0YWNoZWRDb250ZXh0RGVsZXRlZFdpdGhLZXlib2FyZCA9IC0xO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGFuZGxlQXR0YWNoZWRDb250ZXh0Q2hhbmdlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZShudWxsKTtcblxuXHRcdHRoaXMuZG5kLmFkZE92ZXJsYXkodGhpcy5vcHRpb25zLmRuZENvbnRhaW5lciA/PyBjb250YWluZXIsIHRoaXMub3B0aW9ucy5kbmRDb250YWluZXIgPz8gY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChpbnB1dENvbnRhaW5lcikpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dC5iaW5kVG8oaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdHRoaXMuY3VycmVudGx5RWRpdGluZ0lucHV0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmdJbnB1dC5iaW5kVG8oaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5lZGl0aW5nU2VudFJlcXVlc3RLZXkgPSBDaGF0Q29udGV4dEtleXMuZWRpdGluZ1JlcXVlc3RUeXBlLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpO1xuXG5cdFx0Y29uc3QgeyBoaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQsIGhpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50IH0gPSB0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dChpbnB1dFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCB0aGlzKSk7XG5cdFx0dGhpcy5oaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQgPSBoaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQ7XG5cdFx0dGhpcy5oaXN0b3J5TmF2aWdhdGlvbkZvcmV3YXJkc0VuYWJsZW1lbnQgPSBoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudDtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zID0gZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRvcHRpb25zLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPSB0aGlzLm9wdGlvbnMuZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTtcblx0XHRvcHRpb25zLnBhc3RlQXMgPSBFZGl0b3JPcHRpb25zLnBhc3RlQXMuZGVmYXVsdFZhbHVlO1xuXHRcdG9wdGlvbnMucmVhZE9ubHkgPSBmYWxzZTtcblx0XHRvcHRpb25zLmFyaWFMYWJlbCA9IHRoaXMuX2dldEFyaWFMYWJlbCgpO1xuXHRcdG9wdGlvbnMuZm9udEZhbWlseSA9IERFRkFVTFRfRk9OVF9GQU1JTFk7XG5cdFx0b3B0aW9ucy5mb250U2l6ZSA9IDEzO1xuXHRcdG9wdGlvbnMubGluZUhlaWdodCA9IElOUFVUX0VESVRPUl9MSU5FX0hFSUdIVDtcblx0XHRvcHRpb25zLnBhZGRpbmcgPSB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyA/IElOUFVUX0VESVRPUl9QQURESU5HLmNvbXBhY3QgOiBJTlBVVF9FRElUT1JfUEFERElORy5kZWZhdWx0O1xuXHRcdG9wdGlvbnMuY3Vyc29yV2lkdGggPSAxO1xuXHRcdG9wdGlvbnMud3JhcHBpbmdTdHJhdGVneSA9ICdhZHZhbmNlZCc7XG5cdFx0b3B0aW9ucy5icmFja2V0UGFpckNvbG9yaXphdGlvbiA9IHsgZW5hYmxlZDogZmFsc2UgfTtcblx0XHQvLyBSZXNwZWN0IHVzZXIncyBlZGl0b3Igc2V0dGluZ3MgZm9yIGF1dG8tY2xvc2luZyBhbmQgYXV0by1zdXJyb3VuZGluZyBiZWhhdmlvclxuXHRcdG9wdGlvbnMuYXV0b0Nsb3NpbmdCcmFja2V0cyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvQ2xvc2luZ0JyYWNrZXRzJyk7XG5cdFx0b3B0aW9ucy5hdXRvQ2xvc2luZ1F1b3RlcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvQ2xvc2luZ1F1b3RlcycpO1xuXHRcdG9wdGlvbnMuYXV0b1N1cnJvdW5kID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmF1dG9TdXJyb3VuZCcpO1xuXHRcdG9wdGlvbnMucXVpY2tTdWdnZXN0aW9ucyA9IGZhbHNlO1xuXHRcdG9wdGlvbnMuc3VnZ2VzdCA9IHtcblx0XHRcdHNob3dJY29uczogdHJ1ZSxcblx0XHRcdHNob3dTbmlwcGV0czogZmFsc2UsXG5cdFx0XHRzaG93V29yZHM6IHRydWUsXG5cdFx0XHRzaG93U3RhdHVzQmFyOiBmYWxzZSxcblx0XHRcdGluc2VydE1vZGU6ICdpbnNlcnQnLFxuXHRcdFx0Zml0V2lkdGhUb0RldGFpbHM6IHRydWUsXG5cdFx0fTtcblx0XHRvcHRpb25zLnNjcm9sbGJhciA9IHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnXG5cdFx0XHQ/IHsgLi4uKG9wdGlvbnMuc2Nyb2xsYmFyID8/IHt9KSwgdmVydGljYWw6ICdoaWRkZW4nIH1cblx0XHRcdDoge1xuXHRcdFx0XHQuLi4ob3B0aW9ucy5zY3JvbGxiYXIgPz8ge30pLFxuXHRcdFx0XHR2ZXJ0aWNhbDogJ2F1dG8nLFxuXHRcdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDcsXG5cdFx0XHR9O1xuXHRcdG9wdGlvbnMuc3RpY2t5U2Nyb2xsID0geyBlbmFibGVkOiBmYWxzZSB9O1xuXG5cdFx0dGhpcy5faW5wdXRFZGl0b3JFbGVtZW50ID0gZG9tLmFwcGVuZChlZGl0b3JDb250YWluZXIsICQoY2hhdElucHV0RWRpdG9yQ29udGFpbmVyU2VsZWN0b3IpKTtcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gZ2V0U2ltcGxlQ29kZUVkaXRvcldpZGdldE9wdGlvbnMoKTtcblx0XHRlZGl0b3JPcHRpb25zLmNvbnRyaWJ1dGlvbnM/LnB1c2goLi4uRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFNvbWVFZGl0b3JDb250cmlidXRpb25zKFtDb250ZW50SG92ZXJDb250cm9sbGVyLklELCBHbHlwaEhvdmVyQ29udHJvbGxlci5JRCwgRHJvcEludG9FZGl0b3JDb250cm9sbGVyLklELCBDb3B5UGFzdGVDb250cm9sbGVyLklELCBMaW5rRGV0ZWN0b3IuSUQsIElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5JRCwgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLklEXSkpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgdGhpcy5faW5wdXRFZGl0b3JFbGVtZW50LCBvcHRpb25zLCBlZGl0b3JPcHRpb25zKSk7XG5cdFx0dGhpcy51cGRhdGVJbnB1dEVkaXRvckZvbnRGYW1pbHkoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faW5wdXRFZGl0b3JFbGVtZW50LCBkb20uRXZlbnRUeXBlLlBBU1RFLCBlID0+IHRoaXMuaGFuZGxlVGVybWluYWxDb21tYW5kUGFzdGUoZSksIHRydWUpKTtcblxuXHRcdFN1Z2dlc3RDb250cm9sbGVyLmdldCh0aGlzLl9pbnB1dEVkaXRvcik/LmZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblx0XHRvcHRpb25zLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGU/LmNsYXNzTGlzdC5hZGQoJ2hpZGVTdWdnZXN0VGV4dEljb25zJyk7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3JFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGVTdWdnZXN0VGV4dEljb25zJyk7XG5cblx0XHQvLyBQcmV2ZW50IEVudGVyIGtleSBmcm9tIGNyZWF0aW5nIG5ldyBsaW5lcyAtIGJ1dCByZXNwZWN0IHVzZXIncyBjdXN0b20ga2V5YmluZGluZ3Ncblx0XHQvLyBPbmx5IHByZXZlbnQgZGVmYXVsdCBiZWhhdmlvciBpZiBDaGF0U3VibWl0QWN0aW9uIGlzIGJvdW5kIHRvIEVudGVyIEFORCBpdHMgcHJlY29uZGl0aW9uIGlzIG1ldFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lucHV0RWRpdG9yLm9uS2V5RG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhaGFzTW9kaWZpZXJLZXlzKGUpKSB7XG5cdFx0XHRcdC8vIENoZWNrIGlmIENoYXRTdWJtaXRBY3Rpb24gaGFzIGEga2V5YmluZGluZyBmb3IgcGxhaW4gRW50ZXIgaW4gdGhlIGN1cnJlbnQgY29udGV4dFxuXHRcdFx0XHQvLyBUaGlzIHJlc3BlY3RzIHVzZXIncyBjdXN0b20ga2V5YmluZGluZ3MgdGhhdCBkaXNhYmxlIHRoZSBzdWJtaXQgYWN0aW9uXG5cdFx0XHRcdGZvciAoY29uc3Qga2V5YmluZGluZyBvZiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKENoYXRTdWJtaXRBY3Rpb24uSUQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hvcmRzID0ga2V5YmluZGluZy5nZXREaXNwYXRjaENob3JkcygpO1xuXHRcdFx0XHRcdGNvbnN0IGlzUGxhaW5FbnRlciA9IGNob3Jkcy5sZW5ndGggPT09IDEgJiYgY2hvcmRzWzBdID09PSAnW0VudGVyXSc7XG5cdFx0XHRcdFx0aWYgKGlzUGxhaW5FbnRlcikge1xuXHRcdFx0XHRcdFx0Ly8gRG8gTk9UIGNhbGwgc3RvcFByb3BhZ2F0aW9uKCkgc28gdGhlIGtleWJpbmRpbmcgc2VydmljZSBjYW4gc3RpbGwgcHJvY2VzcyB0aGlzIGV2ZW50XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50SGVpZ2h0ID0gTWF0aC5taW4odGhpcy5faW5wdXRFZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpLCB0aGlzLl9lZmZlY3RpdmVJbnB1dEVkaXRvck1heEhlaWdodCk7XG5cdFx0XHRpZiAoY3VycmVudEhlaWdodCAhPT0gdGhpcy5pbnB1dEVkaXRvckhlaWdodCkge1xuXHRcdFx0XHR0aGlzLmlucHV0RWRpdG9ySGVpZ2h0ID0gY3VycmVudEhlaWdodDtcblx0XHRcdFx0Ly8gRGlyZWN0bHkgdXBkYXRlIGVkaXRvciBsYXlvdXQgLSBSZXNpemVPYnNlcnZlciB3aWxsIG5vdGlmeSBwYXJlbnQgYWJvdXQgaGVpZ2h0IGNoYW5nZVxuXHRcdFx0XHRpZiAodGhpcy5jYWNoZWRXaWR0aCkge1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpO1xuXG5cdFx0XHQvLyBBIHN1Ym1pdHRlZCByZXF1ZXN0IHdhcyBwZW5kaW5nIChlLmcuIG9tbmktY2hhdCByb3V0aW5nKSBidXQgdGhlIGRyYWZ0XG5cdFx0XHQvLyBjaGFuZ2VkOiB0aGUgdXNlciBpcyBlZGl0aW5nIGFnYWluLCBzbyByZS1lbmFibGUgc2VuZGluZy5cblx0XHRcdHRoaXMuaW5wdXRTdWJtaXRQZW5kaW5nLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLmlucHV0Um91dGluZy5zZXQoZmFsc2UpO1xuXG5cdFx0XHQvLyBVcGRhdGUgbW9ub3NwYWNlIHN0YXRlIGFzIHRoZSBjb21tYW5kIHByZWZpeCBpcyB0eXBlZC9yZW1vdmVkLlxuXHRcdFx0dGhpcy51cGRhdGVJbnB1dEVkaXRvckZvbnRGYW1pbHkoKTtcblxuXHRcdFx0Ly8gRGVib3VuY2VkIHN5bmMgdG8gbW9kZWwgZm9yIHRleHQgY2hhbmdlc1xuXHRcdFx0dGhpcy5fc3luY1RleHREZWJvdW5jZWQuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5wdXRFZGl0b3Iub25EaWRDb250ZW50U2l6ZUNoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmNvbnRlbnRIZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRFZGl0b3JIZWlnaHQgPSAhdGhpcy5pbmxpbmUgPyBlLmNvbnRlbnRIZWlnaHQgOiB0aGlzLmlucHV0RWRpdG9ySGVpZ2h0O1xuXHRcdFx0XHQvLyBEaXJlY3RseSB1cGRhdGUgZWRpdG9yIGxheW91dCAtIFJlc2l6ZU9ic2VydmVyIHdpbGwgbm90aWZ5IHBhcmVudCBhYm91dCBoZWlnaHQgY2hhbmdlXG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFdpZHRoKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGF5b3V0KHRoaXMuY2FjaGVkV2lkdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lucHV0RWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JUZXh0KCgpID0+IHtcblx0XHRcdHRoaXMuaW5wdXRFZGl0b3JIYXNGb2N1cy5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0XHRcdGlucHV0Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2ZvY3VzZWQnLCB0cnVlKTtcblx0XHRcdHNldENoYXRJbnB1dFN0YWNrSW5wdXRGb2N1c2VkKGlucHV0Q29udGFpbmVyLCB0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5wdXRFZGl0b3Iub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9ySGFzRm9jdXMuc2V0KGZhbHNlKTtcblx0XHRcdGlucHV0Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2ZvY3VzZWQnLCBmYWxzZSk7XG5cdFx0XHRzZXRDaGF0SW5wdXRTdGFja0lucHV0Rm9jdXNlZChpbnB1dENvbnRhaW5lciwgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dEVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5nZXQodGhpcy5faW5wdXRFZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHRcdERyb3BJbnRvRWRpdG9yQ29udHJvbGxlci5nZXQodGhpcy5faW5wdXRFZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cblx0XHRjb25zdCB7IGxvY2F0aW9uIH0gPSB0aGlzLmdldFdpZGdldExvY2F0aW9uSW5mbyh3aWRnZXQpO1xuXHRcdGNvbnN0IGZvY3VzZWRXaWRnZXQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiwgKCkgPT4gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCk7XG5cdFx0Y29uc3QgaXNWb2ljZUlucHV0QWN0aXZlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gZm9jdXNlZFdpZGdldC5yZWFkKHJlYWRlcikgPT09IHdpZGdldCk7XG5cdFx0Y29uc3QgaXNPbW5pSW5wdXQgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXRXaW5kb3cua2V5KSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBpc1ZvaWNlU2Vzc2lvbkFjdGl2ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG9tbmlJbnB1dE9wZW4gPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIub21uaUlucHV0T3Blbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAob21uaUlucHV0T3Blbikge1xuXHRcdFx0XHRyZXR1cm4gaXNPbW5pSW5wdXQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzVm9pY2VJbnB1dEFjdGl2ZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFzRHJhZnRUYXJnZXQgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaGFzRHJhZnRUYXJnZXQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB3aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRyZXR1cm4gIWhhc0RyYWZ0VGFyZ2V0ICYmICghdGFyZ2V0IHx8ICghIXJlc291cmNlICYmIGlzRXF1YWwodGFyZ2V0LCByZXNvdXJjZSkpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBpY2tlck9wdGlvbnM6IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zID0ge1xuXHRcdFx0Z2V0T3ZlcmZsb3dBbmNob3I6ICgpID0+IHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRFbGVtZW50KCksXG5cdFx0XHRhY3Rpb25Db250ZXh0OiB7IHdpZGdldCB9LFxuXHRcdFx0Y29tcGFjdDogZGVyaXZlZChyZWFkZXIgPT4gdGhpcy5fc3RhYmxlSW5wdXRQYXJ0V2lkdGgucmVhZChyZWFkZXIpIDwgQ0hBVF9JTlBVVF9QSUNLRVJfQ09MTEFQU0VfV0lEVEgpLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlclBvc2l0aW9uID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdGFuY2hvclBvc2l0aW9uOiB0eXBlb2YgdGhpcy5vcHRpb25zLmlucHV0UGlja2VyUG9zaXRpb24gPT09ICdmdW5jdGlvbidcblx0XHRcdFx0XHQ/IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlclBvc2l0aW9uKClcblx0XHRcdFx0XHQ6IHRoaXMub3B0aW9ucy5pbnB1dFBpY2tlclBvc2l0aW9uLFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHByaW1hcnlTZXNzaW9uUGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5waWNrZXJPcHRpb25zLFxuXHRcdFx0Y29tcGFjdDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5UGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5waWNrZXJPcHRpb25zLFxuXHRcdFx0Z2V0T3ZlcmZsb3dBbmNob3I6ICgpID0+IHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCksXG5cdFx0XHRjb21wYWN0OiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0b29sYmFyc0NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB0aGlzLmlucHV0RWRpdG9yLmZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hdHRhY2htZW50c0NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB0aGlzLmlucHV0RWRpdG9yLmZvY3VzKCkpKTtcblx0XHRjb25zdCBzaG9ydGVyQ2hhdElucHV0QWN0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KFtcblx0XHRcdE9wZW5Nb2RlUGlja2VyQWN0aW9uLklELFxuXHRcdFx0Q29uZmlndXJlVG9vbHNBY3Rpb24uSUQsXG5cdFx0XSk7XG5cdFx0dGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5vcHRpb25zLnJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgPyB0aGlzLmF0dGFjaG1lbnRzQ29udGFpbmVyIDogdG9vbGJhcnNDb250YWluZXIsIE1lbnVJZC5DaGF0SW5wdXQsIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogdGhpcy5vcHRpb25zLm1lbnVzLnRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiA0OCxcblx0XHRcdFx0Z2V0QWN0aW9uTWluV2lkdGg6IGFjdGlvbiA9PiBzaG9ydGVyQ2hhdElucHV0QWN0aW9uSWRzLmhhcyhhY3Rpb24uaWQpID8gMjIgOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHQvLyBQaG9uZS1sYXlvdXQgYnJhbmNoOiB3aGVuIGFuIGFnZW50cy13aW5kb3cgcGhvbmUgcHJlc2VudGVyXG5cdFx0XHRcdC8vIGlzIGFjdGl2ZSwgcmVwbGFjZSB0aGUgZGVza3RvcCBNb2RlICsgTW9kZWwgcGlja2VycyB3aXRoIGFcblx0XHRcdFx0Ly8gc2luZ2xlIGNoaXAgdGhhdCBvcGVucyBhIHVuaWZpZWQgYm90dG9tIHNoZWV0LiBUaGUgTW9kZVxuXHRcdFx0XHQvLyBhY3Rpb24gaXMgaGlkZGVuIHNvIGl0cyBzbG90IGlzIG5vdCBkdXBsaWNhdGVkOyB0aGUgY2hpcFxuXHRcdFx0XHQvLyAobW91bnRlZCBvbiB0aGUgTW9kZWwgYWN0aW9uJ3Mgc2xvdCkgb3BlbnMgYm90aCBwaWNrZXJzXG5cdFx0XHRcdC8vIGZyb20gb25lIHRhcC4gTWlycm9ycyB0aGUgZW1wdHkgbmV3LWNoYXQgZXhwZXJpZW5jZSBpblxuXHRcdFx0XHQvLyBgdnMvc2Vzc2lvbnNgIChzZWUgYE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcmApLlxuXHRcdFx0XHRpZiAodGhpcy5jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gT3Blbk1vZGVsUGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2V0Q3VycmVudExhbmd1YWdlTW9kZWxUb0RlZmF1bHQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsRGVsZWdhdGUgPSB0aGlzLl9jcmVhdGVNb2RlbFBpY2tlckRlbGVnYXRlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBtb2RlRGVsZWdhdGUgPSB0aGlzLl9jcmVhdGVNb2RlUGlja2VyRGVsZWdhdGUoKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZUNoYXRJbnB1dENvbWJpbmVkUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCBtb2RlRGVsZWdhdGUsIG1vZGVsRGVsZWdhdGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLmlkID09PSBPcGVuTW9kZVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIaWRkZW5BY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IE9wZW5Nb2RlbFBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MucmVwb3J0KCduby1tb2RlbC1hdC10b29sYmFyLWJ1aWxkJywge30sICdpbmZvJyk7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaXRlbURlbGVnYXRlOiBJTW9kZWxQaWNrZXJEZWxlZ2F0ZSA9IHRoaXMuX2NyZWF0ZU1vZGVsUGlja2VyRGVsZWdhdGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxQaWNrZXJBY3Rpb25JdGVtLCBhY3Rpb24sIGl0ZW1EZWxlZ2F0ZSwgcGlja2VyT3B0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLmlkID09PSBPcGVuTW9kZVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGRlbGVnYXRlOiBJTW9kZVBpY2tlckRlbGVnYXRlID0gdGhpcy5fY3JlYXRlTW9kZVBpY2tlckRlbGVnYXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZVdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZVBpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbiwgZGVsZWdhdGUsIHBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKChhY3Rpb24uaWQgPT09IE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uLklEIHx8IGFjdGlvbi5pZCA9PT0gT3BlbkRlbGVnYXRpb25QaWNrZXJBY3Rpb24uSUQpICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gVXNlIHByb3ZpZGVkIGRlbGVnYXRlIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGNyZWF0ZSBkZWZhdWx0IGRlbGVnYXRlXG5cdFx0XHRcdFx0Y29uc3QgZGVsZWdhdGU6IElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlID0gdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgPz8ge1xuXHRcdFx0XHRcdFx0Z2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldEFjdGl2ZVNlc3Npb25UeXBlRm9yRGVsZWdhdGlvbigpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGdldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldDtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldDogKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldChwcm92aWRlcik7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aGFzR2l0UmVwb3NpdG9yeTogKCkgPT4gdGhpcy5oYXNXb3Jrc3BhY2VTY21SZXBvc2l0b3J5KCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBpc1dlbGNvbWVWaWV3TW9kZSA9ICEhdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU/LnNldEFjdGl2ZVNlc3Npb25Qcm92aWRlcjtcblx0XHRcdFx0XHRjb25zdCBQaWNrZXIgPSAoYWN0aW9uLmlkID09PSBPcGVuU2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbi5JRCB8fCBpc1dlbGNvbWVWaWV3TW9kZSkgPyBTZXNzaW9uVHlwZVBpY2tlckFjdGlvbkl0ZW0gOiBEZWxlZ2F0aW9uU2Vzc2lvblBpY2tlckFjdGlvbkl0ZW07XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvblRhcmdldFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyLCBhY3Rpb24sIGxvY2F0aW9uID09PSBDaGF0V2lkZ2V0TG9jYXRpb24uRWRpdG9yID8gJ2VkaXRvcicgOiAnc2lkZWJhcicsIGRlbGVnYXRlLCBwaWNrZXJPcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IENoYXRTZXNzaW9uUHJpbWFyeVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdC8vIENsb3VkIHNlc3Npb25zIHJlbmRlciB0aGVpciBvcHRpb24tZ3JvdXAgcGlja2VycyAoZS5nLiBicmFuY2gpIG9uIHRoZSBwcmltYXJ5IHRvb2xiYXJcblx0XHRcdFx0XHRjb25zdCB3aWRnZXRzID0gdGhpcy5jcmVhdGVDaGF0U2Vzc2lvblBpY2tlcldpZGdldHMoYWN0aW9uLCBwcmltYXJ5U2Vzc2lvblBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdGlmICh3aWRnZXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIaWRkZW5BY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblBpY2tlcnNDb250YWluZXJBY3Rpb25JdGVtLCBhY3Rpb24sIHdpZGdldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1pbnB1dC10b29sYmFyJyk7XG5cdFx0dGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmNvbnRleHQgPSB7IHdpZGdldCwgY29udGV4dFBpY2tlcjogdGhpcy5vcHRpb25zLmNvbnRleHRQaWNrZXIgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4ge1xuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lciByZWZlcmVuY2UgZm9yIHRoZSBwaWNrZXJzIChjbG91ZCBzZXNzaW9ucyBob3N0IHRoZW0gaW4gdGhlIHByaW1hcnkgdG9vbGJhcilcblx0XHRcdGNvbnN0IHRvb2xiYXJFbGVtZW50ID0gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmdldEVsZW1lbnQoKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgcHJpbWFyeVBpY2tlckNvbnRhaW5lciA9IHRvb2xiYXJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXNlc3Npb25QaWNrZXItY29udGFpbmVyJyk7XG5cdFx0XHRpZiAocHJpbWFyeVBpY2tlckNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyQ29udGFpbmVyID0gcHJpbWFyeVBpY2tlckNvbnRhaW5lciBhcyBIVE1MRWxlbWVudDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNhY2hlZFdpZHRoICYmIHR5cGVvZiB0aGlzLmNhY2hlZElucHV0VG9vbGJhcldpZHRoID09PSAnbnVtYmVyJyAmJiB0aGlzLmNhY2hlZElucHV0VG9vbGJhcldpZHRoICE9PSB0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIuZ2V0SXRlbXNXaWR0aCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xiYXJSZWxheW91dFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBXaGVuIGNvbXBhY3QgY2hhbmdlcywgcGlja2VyIGl0ZW1zIGNoYW5nZSB0aGVpciByZW5kZXJlZCBzaXplXG5cdFx0Ly8gYnV0IHRoZSB0b29sYmFyJ3MgUmVzaXplT2JzZXJ2ZXIgd29uJ3QgZmlyZSAodGhlIHRvb2xiYXIgZWxlbWVudCBzaXplXG5cdFx0Ly8gZGlkbid0IGNoYW5nZSwgb25seSBpdHMgY2hpbGRyZW4gZGlkKS4gRm9yY2UgYSByZWxheW91dCBzbyB0aGVcblx0XHQvLyByZXNwb25zaXZlIG92ZXJmbG93IGxvZ2ljIHJlLWV2YWx1YXRlcyB3aXRoIHRoZSBjb3JyZWN0IGl0ZW0gd2lkdGhzLlxuXHRcdC8vIFRoZSByZWxheW91dCBpcyBkZWZlcnJlZCBieSBhIG1pY3JvdGFzayBzbyB0aGUgcGlja2VyIGFjdGlvbiB2aWV3XG5cdFx0Ly8gaXRlbXMnIG93biBhdXRvcnVucyBoYXZlIGEgY2hhbmNlIHRvIHJlLXJlbmRlciB0aGVpciBsYWJlbHMgZmlyc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0cGlja2VyT3B0aW9ucy5jb21wYWN0LnJlYWQocmVhZGVyKTtcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5yZWxheW91dCgpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHRoZSBwaG9uZS1pbnB1dCBwcmVzZW50ZXIgZmxpcHMgYmV0d2VlbiBlbmFibGVkL2Rpc2FibGVkIChlLmcuXG5cdFx0Ly8gZGV2aWNlIHJvdGF0aW9uIGNyb3NzaW5nIHRoZSBwaG9uZSBicmVha3BvaW50KSwgdGhlIGFjdGlvbiB2aWV3IGl0ZW1cblx0XHQvLyBwcm92aWRlciBhYm92ZSB3aWxsIHJldHVybiBkaWZmZXJlbnQgaXRlbXMuIEZvcmNlIHRoZSB0b29sYmFyIHRvXG5cdFx0Ly8gcmUtZXZhbHVhdGUgaXRzIGl0ZW1zIHNvIHRoZSBjaGlwIC8gZGVza3RvcCBwaWNrZXJzIHN3YXAgaW4uXG5cdFx0bGV0IGxhc3RQaG9uZUVuYWJsZWQgPSB0aGlzLmNoYXRQaG9uZUlucHV0UHJlc2VudGVyLmVuYWJsZWQuZ2V0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuZW5hYmxlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoZW5hYmxlZCAhPT0gbGFzdFBob25lRW5hYmxlZCkge1xuXHRcdFx0XHRsYXN0UGhvbmVFbmFibGVkID0gZW5hYmxlZDtcblx0XHRcdFx0dGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5leGVjdXRlVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRvb2xiYXJzQ29udGFpbmVyLCB0aGlzLm9wdGlvbnMubWVudXMuZXhlY3V0ZVRvb2xiYXIsIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogdGhpcy5vcHRpb25zLm1lbnVzLnRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLklEKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7XG5cdFx0XHRcdFx0XHRpc0FjdGl2ZTogaXNWb2ljZUlucHV0QWN0aXZlLFxuXHRcdFx0XHRcdFx0aXNWb2ljZUFjdGl2ZTogaXNWb2ljZVNlc3Npb25BY3RpdmUsXG5cdFx0XHRcdFx0XHRhY3RpdmF0ZVZvaWNlTW9kZTogaXNPbW5pSW5wdXQgPyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YWtlT21uaUlucHV0T3duZXJzaGlwKGRvbS5nZXRXaW5kb3codG9vbGJhcnNDb250YWluZXIpKTtcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChhY3Rpb24uaWQgPT09IENoYXRTdWJtaXRBY3Rpb24uSUQgfHwgYWN0aW9uLmlkID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdWJtaXRBY3Rpb24uSUQpICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoY2xhc3MgZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cdFx0XHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50cygpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGlzT21uaUlucHV0ID8gdW5kZWZpbmVkIDogc3VwZXIuZ2V0SG92ZXJDb250ZW50cygpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0XHRcdFx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc3VibWl0LWJ1dHRvbicpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChhY3Rpb24uaWQgPT09IENoYXRTcGVlY2hUb1RleHRQcmVwYXJpbmdBY3Rpb24uSUQgfHwgYWN0aW9uLmlkID09PSBDaGF0U3BlZWNoVG9UZXh0Q29ubmVjdGluZ0FjdGlvbi5JRCkgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25Eb3dubG9hZEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IFRvZ2dsZUNoYXRTcGVlY2hUb1RleHRBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25BY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBWb2ljZSBNb2RlIG1pYyBidXR0b246IGFkZCBhIHJpZ2h0LWNsaWNrIGNvbnRleHQgbWVudSAoU2VsZWN0XG5cdFx0XHRcdC8vIE1pY3JvcGhvbmUgLyBEaXNhYmxlIFZvaWNlIE1vZGUpIG1pcnJvcmluZyBkaWN0YXRpb24uIFdoaWxlXG5cdFx0XHRcdC8vIGxpc3RlbmluZyB0aGUgdG9vbGJhciBzd2FwcyB0aGUgc3RhcnQgYWN0aW9uIGZvciB0aGVcblx0XHRcdFx0Ly8gcHVzaC10by10YWxrIHN0b3AgYWN0aW9uLCBzbyBjb3ZlciBib3RoIHNvIHRoZSBtZW51IHN0YXlzIHB1dC5cblx0XHRcdFx0aWYgKChhY3Rpb24uaWQgPT09ICdhZ2VudHNWb2ljZS5zdGFydFZvaWNlSW5DaGF0JyB8fCBhY3Rpb24uaWQgPT09ICdhZ2VudHNWb2ljZS5wdHRTdG9wSW5DaGF0JykgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBPcGVuTW9kZWxQaWNrZXJBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGV4ZWN1dGVQaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdC4uLnBpY2tlck9wdGlvbnMsXG5cdFx0XHRcdFx0XHRnZXRPdmVyZmxvd0FuY2hvcjogKCkgPT4gdGhpcy5leGVjdXRlVG9vbGJhcj8uZ2V0RWxlbWVudCgpID8/IHRvb2xiYXJzQ29udGFpbmVyLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWxXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCB0aGlzLl9jcmVhdGVNb2RlbFBpY2tlckRlbGVnYXRlKCksIGV4ZWN1dGVQaWNrZXJPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5leGVjdXRlVG9vbGJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1leGVjdXRlLXRvb2xiYXInKTtcblx0XHR0aGlzLmV4ZWN1dGVUb29sYmFyLmNvbnRleHQgPSB7IHdpZGdldCwgY29udGV4dFBpY2tlcjogdGhpcy5vcHRpb25zLmNvbnRleHRQaWNrZXIgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcblx0XHQvLyBUaGUgbG9uZSBkaWN0YXRpb24gLyBWb2ljZSBNb2RlIGNvbnRyb2wgZHJvcHMgaXRzIGNpcmN1bGFyIGJvcmRlciBhbmRcblx0XHQvLyBvbmx5IHJlZ2FpbnMgaXQgd2hlbiBib3RoIHNoYXJlIHRoZSByb3cgKHNlZSB0aGUgbWF0Y2hpbmcgcnVsZXMgaW5cblx0XHQvLyBjaGF0LmNzcykuIENvdW50IHRoZSB2b2ljZS1pbnB1dCBhY3Rpb25zIGZyb20gdGhlIHRvb2xiYXIncyBhY3Rpb25cblx0XHQvLyBtb2RlbCBcdTIwMTQgbWF0Y2hpbmcgdGhlIHNhbWUgaWNvbiBzZXQgdGhlIENTUyBrZXlzIG9mZiBcdTIwMTQgcmF0aGVyIHRoYW5cblx0XHQvLyBxdWVyeWluZyB0aGUgRE9NLlxuXHRcdGNvbnN0IHZvaWNlSW5wdXRBY3Rpb25JY29uQ2xhc3NlcyA9IG5ldyBTZXQoW1xuXHRcdFx0Q29kaWNvbi5taWMsIENvZGljb24ubWljRmlsbGVkLCBDb2RpY29uLm1pY0Rvd25sb2FkQ29tcGFjdCxcblx0XHRcdENvZGljb24udm9pY2VNb2RlQ29tcGFjdCwgQ29kaWNvbi5sb2FkaW5nQ29tcGFjdCwgQ29kaWNvbi5kZWJ1Z0Rpc2Nvbm5lY3RDb21wYWN0LFxuXHRcdF0ubWFwKGljb24gPT4gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pKSk7XG5cdFx0Y29uc3QgdXBkYXRlVm9pY2VJbnB1dEFjdGlvbkJvcmRlciA9ICgpID0+IHtcblx0XHRcdGxldCB2b2ljZUlucHV0QWN0aW9uQ291bnQgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuZXhlY3V0ZVRvb2xiYXIuZ2V0SXRlbUFjdGlvbihpKTtcblx0XHRcdFx0aWYgKCFhY3Rpb24pIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uLmNsYXNzICYmIHZvaWNlSW5wdXRBY3Rpb25JY29uQ2xhc3Nlcy5oYXMoYWN0aW9uLmNsYXNzKSkge1xuXHRcdFx0XHRcdHZvaWNlSW5wdXRBY3Rpb25Db3VudCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmV4ZWN1dGVUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXZvaWNlLWlucHV0LWFjdGlvbnMtbXVsdGlwbGUnLCB2b2ljZUlucHV0QWN0aW9uQ291bnQgPiAxKTtcblx0XHR9O1xuXHRcdHVwZGF0ZVZvaWNlSW5wdXRBY3Rpb25Cb3JkZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4ZWN1dGVUb29sYmFyLm9uRGlkQ2hhbmdlTWVudUl0ZW1zKCgpID0+IHtcblx0XHRcdHVwZGF0ZVZvaWNlSW5wdXRBY3Rpb25Cb3JkZXIoKTtcblx0XHRcdGlmICh0aGlzLmNhY2hlZFdpZHRoICYmIHR5cGVvZiB0aGlzLmNhY2hlZEV4ZWN1dGVUb29sYmFyV2lkdGggPT09ICdudW1iZXInICYmIHRoaXMuY2FjaGVkRXhlY3V0ZVRvb2xiYXJXaWR0aCAhPT0gdGhpcy5leGVjdXRlVG9vbGJhci5nZXRJdGVtc1dpZHRoKCkpIHtcblx0XHRcdFx0dGhpcy5fdG9vbGJhclJlbGF5b3V0U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMubWVudXMuaW5wdXRTaWRlVG9vbGJhcikge1xuXHRcdFx0Y29uc3QgdG9vbGJhclNpZGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBpbnB1dEFuZFNpZGVUb29sYmFyLCB0aGlzLm9wdGlvbnMubWVudXMuaW5wdXRTaWRlVG9vbGJhciwge1xuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMub3B0aW9ucy5tZW51cy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5pbnB1dFNpZGVUb29sYmFyQ29udGFpbmVyID0gdG9vbGJhclNpZGUuZ2V0RWxlbWVudCgpO1xuXHRcdFx0dG9vbGJhclNpZGUuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc2lkZS10b29sYmFyJyk7XG5cdFx0XHR0b29sYmFyU2lkZS5jb250ZXh0ID0geyB3aWRnZXQsIGNvbnRleHRQaWNrZXI6IHRoaXMub3B0aW9ucy5jb250ZXh0UGlja2VyIH0gc2F0aXNmaWVzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kYXJ5IHRvb2xiYXIgKHBlcm1pc3Npb25zKSBcdTIwMTQgYmVsb3cgdGhlIGlucHV0IGJveC5cblx0XHQvLyBQZXItYWN0aW9uIG1pbmltdW0gd2lkdGhzIChpbiBwaXhlbHMpIGZvciBwaWNrZXJzIHRoYXQgY29sbGFwc2UgdG8gYW5cblx0XHQvLyBpY29uLW9ubHkgbGFiZWwgdmlhIGEgQ1NTIGNvbnRhaW5lciBxdWVyeSBpbiBgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyYC5cblx0XHQvLyBNb3N0IHBpY2tlcnMgcmVzZXJ2ZSB+MjJweCBmb3IgdGhlIGljb247IHRoZSB0dW5uZWwtc2hhcmluZyB0b2dnbGUgaGFzXG5cdFx0Ly8gbm8gY2hldnJvbiwgc28gaXQgY2FuIGNvbGxhcHNlIGZ1cnRoZXIgdG8gMTZweC5cblx0XHRjb25zdCBhZ2VudEhvc3RTaG9ydFBpY2tlck1pbldpZHRocyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KFtcblx0XHRcdFtPcGVuQWdlbnRIb3N0TW9kZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0WydzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25Nb2RlUGlja2VyJywgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RBdXRvQXBwcm92ZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RQZXJtaXNzaW9uTW9kZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb24uSUQsIDIyXSxcblx0XHRcdFsnc2Vzc2lvbnMudHVubmVsSG9zdC50b2dnbGVTaGFyaW5nJywgMTZdLFxuXHRcdF0pO1xuXHRcdC8vIERpcmVjdC1yZW5kZXJlZCBjaGlwIGxhbmUgZm9yIGFnZW50LWhvc3QgY29uZmlnIHByb3BlcnRpZXMgdGhhdFxuXHRcdC8vIGFyZSBhZHZlcnRpc2VkIGJ5IHRoZSBhZ2VudCdzIHNjaGVtYSBidXQgbm90IGhhbmRsZWQgYnkgYVxuXHRcdC8vIGRlZGljYXRlZCBgTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeWAgYWN0aW9uLiBTaXRzIGFzIGEgc2libGluZ1xuXHRcdC8vIG9mIHRoZSBzZWNvbmRhcnkgdG9vbGJhciBzbyB0aGUgdG9vbGJhciBjYW4gdGFrZSB0aGUgYXZhaWxhYmxlXG5cdFx0Ly8gc3BhY2UgKGBmbGV4OiAxIDEgMGApIHdoaWxlIHRoZSBjaGlwcyBwaW4gdG8gdGhlIHJpZ2h0IG5leHQgdG9cblx0XHQvLyB0aGUgY29udGV4dC11c2FnZSB3aWRnZXQuXG5cdFx0Y29uc3QgZ2VuZXJpY0NoaXBzQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXNlY29uZGFyeS1nZW5lcmljLWNoaXBzJyk7XG5cdFx0Y29uc3QgZ2VuZXJpY0NoaXBzTGFuZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRBZ2VudEhvc3RHZW5lcmljQ29uZmlnQ2hpcHMsXG5cdFx0XHR3aWRnZXQsXG5cdFx0KSk7XG5cdFx0Z2VuZXJpY0NoaXBzTGFuZS5yZW5kZXIoZ2VuZXJpY0NoaXBzQ29udGFpbmVyKTtcblx0XHR0aGlzLnNlY29uZGFyeVRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLnNlY29uZGFyeVRvb2xiYXJDb250YWluZXIsIE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogdGhpcy5vcHRpb25zLm1lbnVzLnRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdhbGwnLFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0YWN0aW9uTWluV2lkdGg6IDQ4LFxuXHRcdFx0XHQvLyBBZ2VudC1ob3N0IHBpY2tlcnMgY29sbGFwc2UgdG8gYW4gaWNvbi1vbmx5IGxhYmVsIHZpYSBhIENTU1xuXHRcdFx0XHQvLyBjb250YWluZXIgcXVlcnkgaW4gYEFnZW50SG9zdENoYXRJbnB1dFBpY2tlcmAgd2hlbiBuYXJyb3cuXG5cdFx0XHRcdC8vIFJlcG9ydCBhIHNtYWxsZXIgbWluLXdpZHRoIGZvciB0aGVtIHNvIHRoZSByZXNwb25zaXZlIGxheW91dFxuXHRcdFx0XHQvLyBrZWVwcyB0aGVtIHZpc2libGUgaW5zdGVhZCBvZiBvdmVyZmxvd2luZyBpbnRvIHRoZSBtZW51LlxuXHRcdFx0XHRnZXRBY3Rpb25NaW5XaWR0aDogYWN0aW9uID0+IGFnZW50SG9zdFNob3J0UGlja2VyTWluV2lkdGhzLmdldChhY3Rpb24uaWQpLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgYWdlbnRIb3N0UGlja2VyUHJvcGVydHkgPSBnZXRBZ2VudEhvc3RQaWNrZXJQcm9wZXJ0eShhY3Rpb24uaWQpO1xuXHRcdFx0XHRjb25zdCBjdXN0b21TZWNvbmRhcnlJdGVtID0gdGhpcy5vcHRpb25zLnNlY29uZGFyeVRvb2xiYXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyPy4oYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKGN1c3RvbVNlY29uZGFyeUl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9tU2Vjb25kYXJ5SXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGFjdGlvbi5pZCA9PT0gT3BlblNlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb24uSUQgfHwgYWN0aW9uLmlkID09PSBPcGVuRGVsZWdhdGlvblBpY2tlckFjdGlvbi5JRCkgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWxlZ2F0ZTogSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgPSB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSA/PyB7XG5cdFx0XHRcdFx0XHRnZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0QWN0aXZlU2Vzc2lvblR5cGVGb3JEZWxlZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Z2V0UGVuZGluZ0RlbGVnYXRpb25UYXJnZXQ6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0O1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0OiAocHJvdmlkZXI6IEFnZW50U2Vzc2lvblRhcmdldCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KHByb3ZpZGVyKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiAoKSA9PiB0aGlzLmhhc1dvcmtzcGFjZVNjbVJlcG9zaXRvcnkoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGlzV2VsY29tZVZpZXdNb2RlID0gISF0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uc2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyO1xuXHRcdFx0XHRcdGNvbnN0IFBpY2tlciA9IChhY3Rpb24uaWQgPT09IE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uLklEIHx8IGlzV2VsY29tZVZpZXdNb2RlKSA/IFNlc3Npb25UeXBlUGlja2VyQWN0aW9uSXRlbSA6IERlbGVnYXRpb25TZXNzaW9uUGlja2VyQWN0aW9uSXRlbTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uVGFyZ2V0V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQaWNrZXIsIGFjdGlvbiwgbG9jYXRpb24gPT09IENoYXRXaWRnZXRMb2NhdGlvbi5FZGl0b3IgPyAnZWRpdG9yJyA6ICdzaWRlYmFyJywgZGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gT3BlbldvcmtzcGFjZVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIHRoaXMub3B0aW9ucy53b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCB0aGlzLm9wdGlvbnMud29ya3NwYWNlUGlja2VyRGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhpZGRlbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gT3BlblBlcm1pc3Npb25QaWNrZXJBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWxlZ2F0ZTogSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSA9IHtcblx0XHRcdFx0XHRcdGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWw6IHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRcdFx0XHRzZXRQZXJtaXNzaW9uTGV2ZWw6IChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFBlcm1pc3Npb25MZXZlbChsZXZlbCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Z2V0RXh0ZW5zaW9uUGVybWlzc2lvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRBY3RpdmVFeHRlbnNpb25QZXJtaXNzaW9uR3JvdXAoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHNlc3Npb25SZXNvdXJjZSA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgZ3JvdXAuaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0SWQgPSBncm91cC5zZWxlY3RlZD8uaWQgPz8gZ3JvdXAuaXRlbXMuZmluZChpID0+IGkuZGVmYXVsdCk/LmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByYXdTZWxlY3RlZElkID0gY3VycmVudCA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0PyBkZWZhdWx0SWRcblx0XHRcdFx0XHRcdFx0XHQ6IHR5cGVvZiBjdXJyZW50ID09PSAnc3RyaW5nJyA/IGN1cnJlbnQgOiBjdXJyZW50LmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZElkID0gcmF3U2VsZWN0ZWRJZCAhPT0gdW5kZWZpbmVkICYmIGdyb3VwLml0ZW1zLnNvbWUoaSA9PiBpLmlkID09PSByYXdTZWxlY3RlZElkKVxuXHRcdFx0XHRcdFx0XHRcdD8gcmF3U2VsZWN0ZWRJZFxuXHRcdFx0XHRcdFx0XHRcdDogZGVmYXVsdElkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHRcdD8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdFx0XHRcdFx0XHQ6ICh0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKSA/PyAnJyk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHNlc3Npb25UeXBlLCBncm91cElkOiBncm91cC5pZCwgaXRlbXM6IGdyb3VwLml0ZW1zLCBzZWxlY3RlZElkIH07XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c2V0RXh0ZW5zaW9uUGVybWlzc2lvbjogKGdyb3VwSWQ6IHN0cmluZywgaXRlbTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlT3B0aW9uQ29udGV4dEtleShncm91cElkLCBpdGVtLmlkKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5nZXRPckNyZWF0ZU9wdGlvbkVtaXR0ZXIoZ3JvdXBJZCkuZmlyZShpdGVtKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIGdyb3VwSWQsIGl0ZW0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbldpZGdldD8ucmVmcmVzaCgpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGlzU2FuZGJveFRvZ2dsZUFwcGxpY2FibGU6ICgpID0+IHRoaXMuZ2V0RWZmZWN0aXZlU2Vzc2lvblR5cGUodGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCkpID09PSBTZXNzaW9uVHlwZS5Mb2NhbCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbiwgZGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbldpZGdldCA9IHdpZGdldDtcblx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXREaXNwb3NlTGlzdGVuZXIudmFsdWUgPSB3aWRnZXQub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnBlcm1pc3Npb25XaWRnZXQgPT09IHdpZGdldCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXREaXNwb3NlTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gd2lkZ2V0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFnZW50SG9zdFBpY2tlclByb3BlcnR5ICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhpZGRlbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBpY2tlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLCB3aWRnZXQsIGFnZW50SG9zdFBpY2tlclByb3BlcnR5KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEFnZW50SG9zdENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtKGFjdGlvbiwgcGlja2VyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IE9wZW5BZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgSGlkZGVuQWN0aW9uVmlld0l0ZW0oYWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Rm9sZGVyUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCB3aWRnZXQsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGFsbCBwaWNrZXJzIGFuZCByZXR1cm4gYSBjb250YWluZXIgYWN0aW9uIHZpZXcgaXRlbVxuXHRcdFx0XHRcdGNvbnN0IHdpZGdldHMgPSB0aGlzLmNyZWF0ZUNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyhhY3Rpb24sIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdGlmICh3aWRnZXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIaWRkZW5BY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDcmVhdGUgYSBjb250YWluZXIgdG8gaG9sZCBhbGwgcGlja2VyIHdpZGdldHNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblBpY2tlcnNDb250YWluZXJBY3Rpb25JdGVtLCBhY3Rpb24sIHdpZGdldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1zZWNvbmRhcnktaW5wdXQtdG9vbGJhcicpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5jb250ZXh0ID0geyB3aWRnZXQgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcblx0XHRkb20uYXBwZW5kKHRoaXMuc2Vjb25kYXJ5VG9vbGJhckNvbnRhaW5lciwgZ2VuZXJpY0NoaXBzQ29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlY29uZGFyeVRvb2xiYXIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4ge1xuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lciByZWZlcmVuY2UgZm9yIHRoZSBwaWNrZXJzIHdoZW4gdGhlIHNlY29uZGFyeSB0b29sYmFyIGhvc3RzIG9uZS5cblx0XHRcdC8vIE9ubHkgYXNzaWduIHdoZW4gZm91bmQgc28gd2UgZG9uJ3Qgb3ZlcndyaXRlIGEgdmFsaWQgcHJpbWFyeSBjb250YWluZXIgcmVmZXJlbmNlXG5cdFx0XHQvLyBmb3Igc2Vzc2lvbiB0eXBlcyB3aG9zZSBwaWNrZXJzIGxpdmUgaW4gdGhlIHByaW1hcnkgdG9vbGJhciAoZS5nLiBjbG91ZCkuXG5cdFx0XHRjb25zdCB0b29sYmFyRWxlbWVudCA9IHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRvb2xiYXJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXNlc3Npb25QaWNrZXItY29udGFpbmVyJyk7XG5cdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQoY29udGFpbmVyKSkge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyQ29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZCBzdGF0dXMgaW5kaWNhdG9yczsgbm9uLXJlc3BvbnNpdmUgc28gaXRlbXMgZG9uJ3QgY29sbGFwc2UuXG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5zdGF0dXNUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQ2hhdElucHV0U3RhdHVzLCB7XG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMub3B0aW9ucy5tZW51cy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LXN0YXR1cy10b29sYmFyJyk7XG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyLmNvbnRleHQgPSB7IHdpZGdldCB9IHNhdGlzZmllcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0O1xuXG5cdFx0bGV0IGlucHV0TW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbCh0aGlzLmlucHV0VXJpKTtcblx0XHRsZXQgY3JlYXRlZElucHV0TW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFpbnB1dE1vZGVsKSB7XG5cdFx0XHRpbnB1dE1vZGVsID0gY3JlYXRlZElucHV0TW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgdGhpcy5pbnB1dFVyaSwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0TW9kZWxSZWZlcmVuY2UgPSB0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLmlucHV0VXJpKTtcblx0XHRpZiAoY3JlYXRlZElucHV0TW9kZWwpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlZElucHV0TW9kZWw7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHQvLyBLZWVwIHRoZSBtb2RlbCBhbGl2ZSB1bnRpbCByZWZlcmVuY2UgYWNxdWlzaXRpb24gc2V0dGxlcy4gT3RoZXJ3aXNlXG5cdFx0XHRcdC8vIGltbWVkaWF0ZSB3aWRnZXQgZGlzcG9zYWwgY2FuIHJlbW92ZSBpdCB3aGlsZSBUZXh0UmVzb3VyY2VFZGl0b3JNb2RlbFxuXHRcdFx0XHQvLyBpcyBzdGlsbCByZXNvbHZpbmcgdGhlIGV4aXN0aW5nIG1vZGVsIGhhbmRsZS5cblx0XHRcdFx0dm9pZCBpbnB1dE1vZGVsUmVmZXJlbmNlLnRoZW4oXG5cdFx0XHRcdFx0KCkgPT4gbW9kZWwuZGlzcG9zZSgpLFxuXHRcdFx0XHRcdCgpID0+IG1vZGVsLmRpc3Bvc2UoKVxuXHRcdFx0XHQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRpbnB1dE1vZGVsUmVmZXJlbmNlLnRoZW4ocmVmID0+IHtcblx0XHRcdC8vIG1ha2Ugc3VyZSB0byBob2xkIGEgcmVmZXJlbmNlIHNvIHRoYXQgdGhlIG1vZGVsIGRvZXNuJ3QgZ2V0IGRpc3Bvc2VkIGJ5IHRoZSB0ZXh0IG1vZGVsIHNlcnZpY2Vcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZik7XG5cdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0Ly8gRGlzcG9zYWwgY2FuIHJhY2UgdGhlIGFzeW5jaHJvbm91cyByZWZlcmVuY2UgYWNxdWlzaXRpb24gd2hlbiBhIGNoYXRcblx0XHRcdC8vIHdpZGdldCBjbG9zZXMgaW1tZWRpYXRlbHkgYWZ0ZXIgcmVuZGVyaW5nLlxuXHRcdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuaW5wdXRNb2RlbCA9IGlucHV0TW9kZWw7XG5cdFx0dGhpcy5pbnB1dE1vZGVsLnVwZGF0ZU9wdGlvbnMoeyBicmFja2V0Q29sb3JpemF0aW9uT3B0aW9uczogeyBlbmFibGVkOiBmYWxzZSwgaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogZmFsc2UgfSB9KTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvci5zZXRNb2RlbCh0aGlzLmlucHV0TW9kZWwpO1xuXHRcdGlmIChpbml0aWFsVmFsdWUpIHtcblx0XHRcdHRoaXMuaW5wdXRNb2RlbC5zZXRWYWx1ZShpbml0aWFsVmFsdWUpO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuaW5wdXRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlciwgY29sdW1uOiB0aGlzLmlucHV0TW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhdFRvcCA9IHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IDEgJiYgcG9zaXRpb24uY29sdW1uID09PSAxO1xuXHRcdFx0dGhpcy5jaGF0Q3Vyc29yQXRUb3Auc2V0KGF0VG9wKTtcblxuXHRcdFx0dGhpcy5oaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQuc2V0KGF0VG9wKTtcblx0XHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRpb25Gb3Jld2FyZHNFbmFibGVtZW50LnNldChwb3NpdGlvbi5lcXVhbHMoZ2V0TGFzdFBvc2l0aW9uKG1vZGVsKSkpO1xuXG5cdFx0XHQvLyBTeW5jIGN1cnNvciBhbmQgc2VsZWN0aW9uIHRvIG1vZGVsXG5cdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lucHV0RWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oZSA9PiBvbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCkpKTtcblx0XHRvbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZW5kZXJBdHRhY2hlZENvbnRleHQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlbmRlckF0dGFjaGVkQ29udGV4dCgpO1xuXG5cdFx0Ly8gRGVmZXIgb25seSB0aGUgY2Fyb3VzZWwgbWF4LWhlaWdodCB1cGRhdGUgdG8gdGhlIG5leHQgYW5pbWF0aW9uXG5cdFx0Ly8gZnJhbWUuIFRoYXQgd3JpdGUgY2hhbmdlcyBhIGRlc2NlbmRhbnQgd2hvc2UgaGVpZ2h0IGZsZXhlcyBiYWNrXG5cdFx0Ly8gdXAgaW50byBgdGhpcy5jb250YWluZXJgICh0aGUgb2JzZXJ2ZWQgZWxlbWVudCksIHdoaWNoIGlzIHdoYXRcblx0XHQvLyB0cmlwcyB0aGUgYnJvd3NlcidzIFwiUmVzaXplT2JzZXJ2ZXIgbG9vcCBjb21wbGV0ZWQgd2l0aFxuXHRcdC8vIHVuZGVsaXZlcmVkIG5vdGlmaWNhdGlvbnNcIiB3YXJuaW5nIHVuZGVyIGJ1cnN0eSBpbnB1dCAoc2VlXG5cdFx0Ly8gIzMxNjUwOSkuIFB1Ymxpc2hpbmcgYHRoaXMuaGVpZ2h0YCBzdGF5cyBzeW5jaHJvbm91cyBiZWNhdXNlIGl0c1xuXHRcdC8vIGF1dG9ydW4gY29uc3VtZXJzIHJlLWxheW91dCBzaWJsaW5ncy9hbmNlc3RvcnMgb2YgdGhlIGlucHV0XG5cdFx0Ly8gY29udGFpbmVyLCBub3QgdGhlIGNvbnRhaW5lciBpdHNlbGYsIHNvIHRoZXkgZG8gbm90IGZlZWQgYmFja1xuXHRcdC8vIGludG8gdGhlIHNhbWUgb2JzZXJ2YXRpb24gcGhhc2UuXG5cdFx0Y29uc3QgdXBkYXRlQ2Fyb3VzZWxNYXhIZWlnaHRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgZG9tLkFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyKHRoaXMuY29udGFpbmVyLCAoKSA9PiB0aGlzLnVwZGF0ZVRvb2xDb25maXJtYXRpb25DYXJvdXNlbE1heEhlaWdodCgpKSk7XG5cdFx0Y29uc3QgaW5wdXRSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0SW5wdXRQYXJ0LmNvbnRhaW5lckhlaWdodCcsICgpID0+IHtcblx0XHRcdHVwZGF0ZUNhcm91c2VsTWF4SGVpZ2h0U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHRjb25zdCBuZXdIZWlnaHQgPSB0aGlzLmNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHR0aGlzLmhlaWdodC5zZXQobmV3SGVpZ2h0LCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dFJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5jb250YWluZXIpKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0Jykge1xuXHRcdFx0Y29uc3QgdG9vbGJhcnNSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0SW5wdXRQYXJ0LmNvbXBhY3RUb29sYmFycycsICgpID0+IHtcblx0XHRcdFx0Ly8gSGF2ZSB0byBsYXlvdXQgdGhlIGVkaXRvciB3aGVuIHRoZSB0b29sYmFycyBjaGFuZ2Ugc2l6ZSwgd2hlbiB0aGV5IHNoYXJlIHdpZHRoIHdpdGggdGhlIGVkaXRvci5cblx0XHRcdFx0Ly8gVGhpcyBoYW5kbGVzIGVuc3VyaW5nIHdlIGxheW91dCB3aGVuIHF1aWNrIGNoYXQgaXMgc2hvd24vaGlkZGVuLlxuXHRcdFx0XHQvLyBUaGUgdG9vbGJhciBtYXkgaGF2ZSBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IHRpbWUgaXQgd2FzIHZpc2libGUuXG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFdpZHRoKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5jYWNoZWRXaWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvb2xiYXJzUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0b29sYmFyc0NvbnRhaW5lcikpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVDaGF0SW5wdXRPdmVybGF5KGVkaXRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmNoYXRJbnB1dE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBlZGl0aW5nKTtcblx0XHRpZiAoZWRpdGluZykge1xuXHRcdFx0dGhpcy5vdmVybGF5Q2xpY2tMaXN0ZW5lci52YWx1ZSA9IGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNoYXRJbnB1dE92ZXJsYXksIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2tPdmVybGF5LmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm92ZXJsYXlDbGlja0xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbmRlckF0dGFjaGVkQ29udGV4dCgpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLmF0dGFjaGVkQ29udGV4dENvbnRhaW5lcjtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmF0dGFjaGVkQ29udGV4dERpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cblx0XHRkb20uY2xlYXJOb2RlKGNvbnRhaW5lcik7XG5cblx0XHRzdG9yZS5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYXR0YWNobWVudHNDb250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlQXR0YWNobWVudE5hdmlnYXRpb24oZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29tcGxldGlvbiByZWZlcmVuY2VzIChhZ2VudC1ob3N0IHNraWxscy9jb21tYW5kcykgcmVuZGVyIGFzIGlubGluZVxuXHRcdC8vIGRlY29yYXRpb25zIHJhdGhlciB0aGFuIGF0dGFjaG1lbnQgcGlsbHMsIHNvIGV4Y2x1ZGUgdGhlbS4gUmUtaW5kZXhcblx0XHQvLyBjb250aWd1b3VzbHkgb3ZlciB0aGUgcmVuZGVyZWQgcGlsbHMgc28gdGhlIGZvY3VzIGJvb2trZWVwaW5nICh3aGljaFxuXHRcdC8vIHN0b3Jlcy9jb21wYXJlcyBpbmRpY2VzIGFuZCBjb3VudHMpIHN0YXlzIGFsaWduZWQgd2l0aCB0aGUgdmlzaWJsZSBwaWxsc1xuXHRcdC8vIGFuZCBub3QgdGhlIG1vZGVsLCB3aGljaCBtYXkgY29udGFpbiBub24tcmVuZGVyZWQgZW50cmllcy5cblx0XHRjb25zdCBhdHRhY2htZW50cyA9IHRoaXMuZ2V0UmVuZGVyYWJsZUF0dGFjaG1lbnRzKClcblx0XHRcdC5tYXAoKGF0dGFjaG1lbnQsIGluZGV4KTogW251bWJlciwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeV0gPT4gW2luZGV4LCBhdHRhY2htZW50XSk7XG5cdFx0Y29uc3QgaGFzQXR0YWNobWVudHMgPSBCb29sZWFuKGF0dGFjaG1lbnRzLmxlbmd0aCk7XG5cblx0XHQvLyBSZW5kZXIgaW1wbGljaXQgY29udGV4dCAoYWN0aXZlIGVkaXRvciBpbiBBc2sgbW9kZSwgb3Igc2VsZWN0aW9uKVxuXHRcdGxldCBoYXNJbXBsaWNpdENvbnRleHQgPSBmYWxzZTtcblx0XHRjb25zdCBpc1N1Z2dlc3RlZEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jyk7XG5cdFx0Y29uc3QgaGFzVmlzaWJsZUltcGxpY2l0Q29udGV4dCA9IGlzU3VnZ2VzdGVkRW5hYmxlZFxuXHRcdFx0PyB0aGlzLl9pbXBsaWNpdENvbnRleHQ/Lmhhc1ZhbHVlID8/IGZhbHNlXG5cdFx0XHQ6IHRoaXMuX2ltcGxpY2l0Q29udGV4dD8udmFsdWVzLnNvbWUodiA9PiB2LmVuYWJsZWQgfHwgdi5pc1NlbGVjdGlvbikgPz8gZmFsc2U7XG5cdFx0aWYgKHRoaXMuX2ltcGxpY2l0Q29udGV4dCAmJiBoYXNWaXNpYmxlSW1wbGljaXRDb250ZXh0KSB7XG5cdFx0XHRjb25zdCBpc0F0dGFjaG1lbnRBbHJlYWR5QXR0YWNoZWQgPSAodGFyZ2V0VXJpOiBVUkkgfCB1bmRlZmluZWQsIHRhcmdldFJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQsIHRhcmdldEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuc29tZShhID0+IHtcblx0XHRcdFx0XHRjb25zdCBhVXJpID0gVVJJLmlzVXJpKGEudmFsdWUpID8gYS52YWx1ZSA6IGlzTG9jYXRpb24oYS52YWx1ZSkgPyBhLnZhbHVlLnVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBhUmFuZ2UgPSBpc0xvY2F0aW9uKGEudmFsdWUpID8gYS52YWx1ZS5yYW5nZSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodGFyZ2V0SGFuZGxlICE9PSB1bmRlZmluZWQgJiYgaXNTdHJpbmdWYXJpYWJsZUVudHJ5KGEpICYmIGEuaGFuZGxlID09PSB0YXJnZXRIYW5kbGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodGFyZ2V0VXJpICYmIGFVcmkgJiYgaXNFcXVhbCh0YXJnZXRVcmksIGFVcmkpKSB7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0UmFuZ2UgJiYgYVJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBSYW5nZS5lcXVhbHNSYW5nZSh0YXJnZXRSYW5nZSwgYVJhbmdlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiAhdGFyZ2V0UmFuZ2UgJiYgIWFSYW5nZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbXBsaWNpdENvbnRleHRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRJbXBsaWNpdENvbnRleHRBdHRhY2htZW50V2lkZ2V0LFxuXHRcdFx0XHQoKSA9PiB0aGlzLl93aWRnZXQsXG5cdFx0XHRcdGlzQXR0YWNobWVudEFscmVhZHlBdHRhY2hlZCxcblx0XHRcdFx0dGhpcy5faW1wbGljaXRDb250ZXh0LFxuXHRcdFx0XHR0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMsXG5cdFx0XHRcdHRoaXMuX2F0dGFjaG1lbnRNb2RlbCxcblx0XHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0KTtcblx0XHRcdHN0b3JlLmFkZChpbXBsaWNpdENvbnRleHRXaWRnZXQpO1xuXHRcdFx0aGFzSW1wbGljaXRDb250ZXh0ID0gaW1wbGljaXRDb250ZXh0V2lkZ2V0Lmhhc1JlbmRlcmVkQ29udGV4dHM7XG5cdFx0fVxuXG5cdFx0ZG9tLnNldFZpc2liaWxpdHkoQm9vbGVhbih0aGlzLm9wdGlvbnMucmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dCB8fCBoYXNBdHRhY2htZW50cyB8fCBoYXNJbXBsaWNpdENvbnRleHQpLCB0aGlzLmF0dGFjaG1lbnRzQ29udGFpbmVyKTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eShoYXNBdHRhY2htZW50cyB8fCBoYXNJbXBsaWNpdENvbnRleHQsIHRoaXMuYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyKTtcblx0XHRpZiAoIWF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID0gLTE7XG5cdFx0XHR0aGlzLl9pbmRleE9mTGFzdE9wZW5lZENvbnRleHQgPSAtMTtcblx0XHR9XG5cblx0XHQvLyBNYXJrIGltYWdlcyB0aGF0IGV4Y2VlZCB0aGUgbW9kZWwtc3BlY2lmaWMgcGVyLXJlcXVlc3QgbGltaXQgc28gdGhleSByZW5kZXIgd2l0aCBhIHdhcm5pbmdcblx0XHRjb25zdCBtYXhJbWFnZXNQZXJSZXF1ZXN0ID0gZ2V0SW1hZ2VBdHRhY2htZW50TGltaXQodGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhKTtcblx0XHRjb25zdCBpbWFnZUF0dGFjaG1lbnRzID0gYXR0YWNobWVudHMuZmlsdGVyKChbLCBhXSkgPT4gaXNJbWFnZVZhcmlhYmxlRW50cnkoYSkpO1xuXHRcdGlmIChtYXhJbWFnZXNQZXJSZXF1ZXN0ICE9PSB1bmRlZmluZWQgJiYgaW1hZ2VBdHRhY2htZW50cy5sZW5ndGggPiBtYXhJbWFnZXNQZXJSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCBleGNlc3NDb3VudCA9IGltYWdlQXR0YWNobWVudHMubGVuZ3RoIC0gbWF4SW1hZ2VzUGVyUmVxdWVzdDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZXhjZXNzQ291bnQ7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhdHRhY2htZW50ID0gaW1hZ2VBdHRhY2htZW50c1tpXVsxXTtcblx0XHRcdFx0aWYgKGF0dGFjaG1lbnQub21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuTm90T21pdHRlZCB8fCBhdHRhY2htZW50Lm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZCkge1xuXHRcdFx0XHRcdGF0dGFjaG1lbnQub21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IGV4Y2Vzc0NvdW50OyBpIDwgaW1hZ2VBdHRhY2htZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoaW1hZ2VBdHRhY2htZW50c1tpXVsxXS5vbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5JbWFnZUxpbWl0RXhjZWVkZWQpIHtcblx0XHRcdFx0XHRpbWFnZUF0dGFjaG1lbnRzW2ldWzFdLm9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgWywgYV0gb2YgaW1hZ2VBdHRhY2htZW50cykge1xuXHRcdFx0XHRpZiAoYS5vbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5JbWFnZUxpbWl0RXhjZWVkZWQpIHtcblx0XHRcdFx0XHRhLm9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cblx0XHRmb3IgKGNvbnN0IFtpbmRleCwgYXR0YWNobWVudF0gb2YgYXR0YWNobWVudHMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmlzVXJpKGF0dGFjaG1lbnQudmFsdWUpID8gYXR0YWNobWVudC52YWx1ZSA6IGlzTG9jYXRpb24oYXR0YWNobWVudC52YWx1ZSkgPyBhdHRhY2htZW50LnZhbHVlLnVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJhbmdlID0gaXNMb2NhdGlvbihhdHRhY2htZW50LnZhbHVlKSA/IGF0dGFjaG1lbnQudmFsdWUucmFuZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzaG91bGRGb2N1c0NsZWFyQnV0dG9uID0gaW5kZXggPT09IE1hdGgubWluKHRoaXMuX2luZGV4T2ZMYXN0QXR0YWNoZWRDb250ZXh0RGVsZXRlZFdpdGhLZXlib2FyZCwgYXR0YWNobWVudHMubGVuZ3RoIC0gMSkgJiYgdGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID4gLTE7XG5cblx0XHRcdGxldCBhdHRhY2htZW50V2lkZ2V0O1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHsgc2hvdWxkRm9jdXNDbGVhckJ1dHRvbiwgc3VwcG9ydHNEZWxldGlvbjogdHJ1ZSwgaXNDdXJyZW50SW5wdXQ6IHRydWUgfTtcblx0XHRcdGNvbnN0IGxtID0gdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5raW5kID09PSAndG9vbCcgfHwgYXR0YWNobWVudC5raW5kID09PSAndG9vbHNldCcpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9vbFNldE9yVG9vbEl0ZW1BdHRhY2htZW50V2lkZ2V0LCBhdHRhY2htZW50LCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZSAmJiBpc05vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NlbGxPdXRwdXRDaGF0QXR0YWNobWVudFdpZGdldCwgcmVzb3VyY2UsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RmlsZUF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0VGV4dEF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIHVuZGVmaW5lZCwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZSAmJiAoYXR0YWNobWVudC5raW5kID09PSAnZmlsZScgfHwgYXR0YWNobWVudC5raW5kID09PSAnZGlyZWN0b3J5JykpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUF0dGFjaG1lbnRXaWRnZXQsIHJlc291cmNlLCByYW5nZSwgYXR0YWNobWVudCwgdW5kZWZpbmVkLCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChhdHRhY2htZW50LmtpbmQgPT09ICd0ZXJtaW5hbENvbW1hbmQnKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsQ29tbWFuZEF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEltYWdlQXR0YWNobWVudFdpZGdldCwgcmVzb3VyY2UsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRWxlbWVudFZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWxlbWVudENoYXRBdHRhY2htZW50V2lkZ2V0LCBhdHRhY2htZW50LCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1Bhc3RlVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQYXN0ZUF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUhpc3RvcnlJdGVtQXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNSGlzdG9yeUl0ZW1DaGFuZ2VBdHRhY2htZW50V2lkZ2V0LCBhdHRhY2htZW50LCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VBdHRhY2htZW50V2lkZ2V0LCBhdHRhY2htZW50LCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChpc0Jyb3dzZXJWaWV3VmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyVmlld0F0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5fY2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeS5jcmVhdGVXaWRnZXQoYXR0YWNobWVudCwgb3B0aW9ucywgY29udGFpbmVyKVxuXHRcdFx0XHRcdD8/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVmYXVsdENoYXRBdHRhY2htZW50V2lkZ2V0LCByZXNvdXJjZSwgcmFuZ2UsIGF0dGFjaG1lbnQsIHVuZGVmaW5lZCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNob3VsZEZvY3VzQ2xlYXJCdXR0b24pIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldC5lbGVtZW50LmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpbmRleCA9PT0gTWF0aC5taW4odGhpcy5faW5kZXhPZkxhc3RPcGVuZWRDb250ZXh0LCBhdHRhY2htZW50cy5sZW5ndGggLSAxKSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0LmVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0c3RvcmUuYWRkKGF0dGFjaG1lbnRXaWRnZXQpO1xuXHRcdFx0c3RvcmUuYWRkKGF0dGFjaG1lbnRXaWRnZXQub25EaWREZWxldGUoZSA9PiB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlQXR0YWNobWVudERlbGV0aW9uKGUsIGluZGV4LCBhdHRhY2htZW50KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKGF0dGFjaG1lbnRXaWRnZXQub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUF0dGFjaG1lbnRPcGVuKGluZGV4LCBhdHRhY2htZW50KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pbmRleE9mTGFzdE9wZW5lZENvbnRleHQgPSAtMTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIHRoZSBpbmxpbmUgcmVmZXJlbmNlIGJvdW5kIHRvIGEgZGVsZXRlZCBhdHRhY2htZW50LCBpbmNsdWRpbmcgb25lXG5cdCAqIHRyYWlsaW5nIHNwYWNlLCBzbyB0aGUgaW5wdXQgaXMgbm90IGxlZnQgd2l0aCBhIHRva2VuIHRoYXQgcmVzb2x2ZXMgdG9cblx0ICogbm90aGluZy4gVGhlIGR5bmFtaWMgdmFyaWFibGUgbW9kZWwgZHJvcHMgdGhlIHJlZmVyZW5jZSBvbmNlIGl0cyB0ZXh0IGdvZXMuXG5cdCAqL1xuXHRwcml2YXRlIHJlbW92ZUlubGluZVJlZmVyZW5jZVRleHQoYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IHZvaWQge1xuXHRcdGlmICghYXR0YWNobWVudC5yYW5nZSB8fCAhaXNQYXN0ZWRUZXh0QXJ0aWZhY3QoYXR0YWNobWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IHRoaXMuX3dpZGdldD8uZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LnZhcmlhYmxlc1xuXHRcdFx0LmZpbmQodmFyaWFibGUgPT4gdmFyaWFibGUuaWQgPT09IGF0dGFjaG1lbnQuaWQpO1xuXHRcdGlmICghbW9kZWwgfHwgIXJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmxpZnQocmVmZXJlbmNlLnJhbmdlKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uICsgMSkpID09PSAnICdcblx0XHRcdD8gcmFuZ2UuZW5kQ29sdW1uICsgMVxuXHRcdFx0OiByYW5nZS5lbmRDb2x1bW47XG5cdFx0dGhpcy5faW5wdXRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdjaGF0UmVtb3ZlQXR0YWNobWVudFJlZmVyZW5jZScsIFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksXG5cdFx0XHR0ZXh0OiAnJyxcblx0XHR9XSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUF0dGFjaG1lbnREZWxldGlvbihlOiBLZXlib2FyZEV2ZW50IHwgdW5rbm93biwgaW5kZXg6IG51bWJlciwgYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSkge1xuXHRcdC8vIFNldCBmb2N1cyB0byB0aGUgbmV4dCBhdHRhY2hlZCBjb250ZXh0IGl0ZW0gaWYgZGVsZXRpb24gd2FzIHRyaWdnZXJlZCBieSBhIGtleXN0cm9rZSAodnMgYSBtb3VzZSBjbGljaylcblx0XHRpZiAoZG9tLmlzS2V5Ym9hcmRFdmVudChlKSkge1xuXHRcdFx0dGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID0gaW5kZXg7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXR0YWNobWVudE1vZGVsLmRlbGV0ZShhdHRhY2htZW50LmlkKTtcblx0XHR0aGlzLnJlbW92ZUlubGluZVJlZmVyZW5jZVRleHQoYXR0YWNobWVudCk7XG5cblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5lbmFibGVJbXBsaWNpdENvbnRleHQnKSkge1xuXHRcdFx0Ly8gaWYgY3VycmVudGx5IG9wZW5lZCBmaWxlIGlzIGRlbGV0ZWQsIGRvIG5vdCBzaG93IGltcGxpY2l0IGNvbnRleHRcblx0XHRcdGZvciAoY29uc3QgaW1wbGljaXRDb250ZXh0IG9mICh0aGlzLl9pbXBsaWNpdENvbnRleHQ/LnZhbHVlcyB8fCBbXSkpIHtcblx0XHRcdFx0Y29uc3QgaW1wbGljaXRWYWx1ZSA9IFVSSS5pc1VyaShpbXBsaWNpdENvbnRleHQ/LnZhbHVlKSAmJiBVUkkuaXNVcmkoYXR0YWNobWVudC52YWx1ZSkgJiYgaXNFcXVhbChpbXBsaWNpdENvbnRleHQudmFsdWUsIGF0dGFjaG1lbnQudmFsdWUpO1xuXG5cdFx0XHRcdGlmIChpbXBsaWNpdENvbnRleHQ/LmlzRmlsZSAmJiBpbXBsaWNpdFZhbHVlKSB7XG5cdFx0XHRcdFx0aW1wbGljaXRDb250ZXh0LmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdldFJlbmRlcmFibGVBdHRhY2htZW50cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5maXJlKHsgcmVtb3ZlZDogW2F0dGFjaG1lbnRdIH0pO1xuXHRcdHRoaXMucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGF0dGFjaG1lbnRzIHRoYXQgYXJlIHJlbmRlcmVkIGFzIHBpbGxzIGluIHRoZSBpbnB1dC4gQWdlbnQtaG9zdFxuXHQgKiBjb21wbGV0aW9uIGVudHJpZXMgKHNraWxscy9jb21tYW5kcykgbGl2ZSBpbiB0aGUgbW9kZWwgc28gdGhlaXIgYF9tZXRhYFxuXHQgKiByZWFjaGVzIHRoZSBvdXRnb2luZyBtZXNzYWdlLCBidXQgdGhleSBhcmUgc2hvd24gYXMgaW5saW5lIGRlY29yYXRpb25zXG5cdCAqIHJhdGhlciB0aGFuIHBpbGxzLCBzbyB0aGV5IGFyZSBleGNsdWRlZCBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRSZW5kZXJhYmxlQXR0YWNobWVudHMoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuZmlsdGVyKGF0dGFjaG1lbnQgPT4gIWlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBdHRhY2htZW50T3BlbihpbmRleDogbnVtYmVyLCBhdHRhY2htZW50OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5faW5kZXhPZkxhc3RPcGVuZWRDb250ZXh0ID0gaW5kZXg7XG5cdFx0dGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID0gLTE7XG5cblx0XHRpZiAodGhpcy5nZXRSZW5kZXJhYmxlQXR0YWNobWVudHMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUF0dGFjaG1lbnROYXZpZ2F0aW9uKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZS5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpICYmICFlLmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBBcnJheS5mcm9tKHRoaXMuYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpKTtcblx0XHRpZiAoIWF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0V2luZG93KHRoaXMuYXR0YWNobWVudHNDb250YWluZXIpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gYXR0YWNobWVudHMuZmluZEluZGV4KGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudCA9PT0gYWN0aXZlRWxlbWVudCk7XG5cdFx0bGV0IG5ld0luZGV4ID0gY3VycmVudEluZGV4O1xuXG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSkge1xuXHRcdFx0bmV3SW5kZXggPSBjdXJyZW50SW5kZXggPiAwID8gY3VycmVudEluZGV4IC0gMSA6IGF0dGFjaG1lbnRzLmxlbmd0aCAtIDE7XG5cdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRuZXdJbmRleCA9IGN1cnJlbnRJbmRleCA8IGF0dGFjaG1lbnRzLmxlbmd0aCAtIDEgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcblx0XHR9XG5cblx0XHRpZiAobmV3SW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBuZXh0RWxlbWVudCA9IGF0dGFjaG1lbnRzW25ld0luZGV4XSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdG5leHRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmRlckNoYXRUb2RvTGlzdFdpZGdldChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblxuXHRcdGNvbnN0IGlzVG9kb1dpZGdldEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvZG9zU2hvd1dpZGdldCkgIT09IGZhbHNlO1xuXHRcdGlmICghaXNUb2RvV2lkZ2V0RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWUpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRFZGl0aW5nVG9kb3NEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9kb0xpc3RXaWRnZXQpKTtcblx0XHRcdHRoaXMuX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0LnZhbHVlID0gd2lkZ2V0O1xuXG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY2hhdElucHV0VG9kb0xpc3RXaWRnZXRDb250YWluZXIpO1xuXHRcdFx0d2lkZ2V0LmF0dGFjaFRvKHRoaXMuY2hhdElucHV0VG9kb0xpc3RXaWRnZXRDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0LnZhbHVlLnJlbmRlcihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGNsZWFyVG9kb0xpc3RXaWRnZXQoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWU/LmNsZWFyKHNlc3Npb25SZXNvdXJjZSwgZm9yY2UpO1xuXHR9XG5cblx0cmVuZGVyQXJ0aWZhY3RzV2lkZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BcnRpZmFjdHNFbmFibGVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY2hhdEFydGlmYWN0c1dpZGdldC52YWx1ZSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QXJ0aWZhY3RzV2lkZ2V0KSk7XG5cdFx0XHR0aGlzLl9jaGF0QXJ0aWZhY3RzV2lkZ2V0LnZhbHVlID0gd2lkZ2V0O1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRBcnRpZmFjdHNXaWRnZXRDb250YWluZXIpO1xuXHRcdFx0d2lkZ2V0LmF0dGFjaFRvKHRoaXMuY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX2NoYXRBcnRpZmFjdHNXaWRnZXQudmFsdWUuc2V0U2Vzc2lvblJlc291cmNlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0Y2xlYXJBcnRpZmFjdHNXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdEFydGlmYWN0c1dpZGdldC52YWx1ZT8uc2V0U2Vzc2lvblJlc291cmNlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZW5kZXJRdWVzdGlvbkNhcm91c2VsKGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBvcHRpb25zOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxPcHRpb25zKTogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0IHtcblxuXHRcdGNvbnN0IGNhcm91c2VsS2V5ID0gY2Fyb3VzZWwucmVzb2x2ZUlkID8/IGAke2lzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpID8gY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZCA6ICcnfV8ke2NvbnRleHQuY29udGVudEluZGV4fWA7XG5cblx0XHQvLyBJZiBhIGNhcm91c2VsIHdpdGggdGhlIHNhbWUga2V5IGFscmVhZHkgZXhpc3RzLCByZXR1cm4gaXRcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cy5nZXQoY2Fyb3VzZWxLZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdC8vIFRyYWNrIHRoZSByZXNwb25zZSBpZCBhbmQgc2Vzc2lvbiBmb3IgdGhpcyBjYXJvdXNlbFxuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy5fcXVlc3Rpb25DYXJvdXNlbFJlc3BvbnNlSWRzLnNldChjYXJvdXNlbEtleSwgY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZCk7XG5cdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsU2Vzc2lvblJlc291cmNlcy5zZXQoY2Fyb3VzZWxLZXksIGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCwgY2Fyb3VzZWwsIGNvbnRleHQsIG9wdGlvbnMpO1xuXHRcdHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cy5zZXQoY2Fyb3VzZWxLZXksIHBhcnQpO1xuXHRcdHRoaXMuX2hhc1F1ZXN0aW9uQ2Fyb3VzZWxDb250ZXh0S2V5Py5zZXQodHJ1ZSk7XG5cblx0XHRkb20uYXBwZW5kKHRoaXMuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250YWluZXIsIHBhcnQuZG9tTm9kZSk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdGNsZWFyUXVlc3Rpb25DYXJvdXNlbChyZXNwb25zZUlkPzogc3RyaW5nLCByZXNvbHZlSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAocmVzb2x2ZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlbW92ZSBhIHNwZWNpZmljIGNhcm91c2VsIGJ5IHJlc29sdmVJZFxuXHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cy5nZXQocmVzb2x2ZUlkKTtcblx0XHRcdGlmIChwYXJ0KSB7XG5cdFx0XHRcdHBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLmRlbGV0ZUFuZERpc3Bvc2UocmVzb2x2ZUlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxSZXNwb25zZUlkcy5kZWxldGUocmVzb2x2ZUlkKTtcblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxTZXNzaW9uUmVzb3VyY2VzLmRlbGV0ZShyZXNvbHZlSWQpO1xuXHRcdH0gZWxzZSBpZiAocmVzcG9uc2VJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBSZW1vdmUgYWxsIGNhcm91c2VscyBhc3NvY2lhdGVkIHdpdGggYSBnaXZlbiByZXNwb25zZUlkXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHJpZF0gb2YgdGhpcy5fcXVlc3Rpb25DYXJvdXNlbFJlc3BvbnNlSWRzKSB7XG5cdFx0XHRcdGlmIChyaWQgPT09IHJlc3BvbnNlSWQpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLmdldChrZXkpO1xuXHRcdFx0XHRcdGlmIChwYXJ0KSB7XG5cdFx0XHRcdFx0XHRwYXJ0LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsUmVzcG9uc2VJZHMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0dGhpcy5fcXVlc3Rpb25DYXJvdXNlbFNlc3Npb25SZXNvdXJjZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQ2xlYXIgYWxsIGNhcm91c2Vsc1xuXHRcdFx0dGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0dGhpcy5fcXVlc3Rpb25DYXJvdXNlbFJlc3BvbnNlSWRzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsU2Vzc2lvblJlc291cmNlcy5jbGVhcigpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHR9XG5cdFx0dGhpcy5faGFzUXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXk/LnNldCh0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuc2l6ZSA+IDApO1xuXHR9XG5cblx0Z2V0IHF1ZXN0aW9uQ2Fyb3VzZWwoKTogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBSZXR1cm4gdGhlIGZvY3VzZWQgY2Fyb3VzZWwsIG9yIHRoZSBmaXJzdCBvbmVcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocGFydC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLnNpemUgPiAwID8gdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLnZhbHVlcygpLm5leHQoKS52YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGZvY3VzUXVlc3Rpb25DYXJvdXNlbCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBjYXJvdXNlbCA9IHRoaXMucXVlc3Rpb25DYXJvdXNlbDtcblx0XHRpZiAoY2Fyb3VzZWwpIHtcblx0XHRcdGNhcm91c2VsLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aXNRdWVzdGlvbkNhcm91c2VsRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAocGFydC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRuYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBjYXJvdXNlbCA9IHRoaXMucXVlc3Rpb25DYXJvdXNlbDtcblx0XHRyZXR1cm4gY2Fyb3VzZWw/Lm5hdmlnYXRlVG9QcmV2aW91c1F1ZXN0aW9uKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRuYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gdGhpcy5xdWVzdGlvbkNhcm91c2VsO1xuXHRcdHJldHVybiBjYXJvdXNlbD8ubmF2aWdhdGVUb05leHRRdWVzdGlvbigpID8/IGZhbHNlO1xuXHR9XG5cblx0Zm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLnF1ZXN0aW9uQ2Fyb3VzZWw7XG5cdFx0cmV0dXJuIGNhcm91c2VsPy5mb2N1c1Rlcm1pbmFsKCkgPz8gZmFsc2U7XG5cdH1cblxuXHQvLyAtLS0gUGxhbiBSZXZpZXcgLS0tXG5cblx0cmVuZGVyUGxhblJldmlldyhyZXZpZXc6IElDaGF0UGxhblJldmlldywgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIG9wdGlvbnM6IElDaGF0UGxhblJldmlld1BhcnRPcHRpb25zKTogQ2hhdFBsYW5SZXZpZXdQYXJ0IHtcblx0XHRjb25zdCBrZXkgPSByZXZpZXcucmVzb2x2ZUlkID8/IGAke2lzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpID8gY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZCA6ICcnfV8ke2NvbnRleHQuY29udGVudEluZGV4fWA7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdSZXNwb25zZUlkcy5zZXQoa2V5LCBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzLnNldChrZXksIGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQbGFuUmV2aWV3UGFydCwgcmV2aWV3LCBjb250ZXh0LCBvcHRpb25zKTtcblx0XHR0aGlzLl9jaGF0UGxhblJldmlld1dpZGdldHMuc2V0KGtleSwgcGFydCk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmNoYXRQbGFuUmV2aWV3Q29udGFpbmVyLCBwYXJ0LmRvbU5vZGUpO1xuXG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRjbGVhclBsYW5SZXZpZXcocmVzcG9uc2VJZD86IHN0cmluZywgcmVzb2x2ZUlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHJlc29sdmVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fY2hhdFBsYW5SZXZpZXdXaWRnZXRzLmdldChyZXNvbHZlSWQpO1xuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0cGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9jaGF0UGxhblJldmlld1dpZGdldHMuZGVsZXRlQW5kRGlzcG9zZShyZXNvbHZlSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGxhblJldmlld1Jlc3BvbnNlSWRzLmRlbGV0ZShyZXNvbHZlSWQpO1xuXHRcdFx0dGhpcy5fcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMuZGVsZXRlKHJlc29sdmVJZCk7XG5cdFx0fSBlbHNlIGlmIChyZXNwb25zZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgcmlkXSBvZiB0aGlzLl9wbGFuUmV2aWV3UmVzcG9uc2VJZHMpIHtcblx0XHRcdFx0aWYgKHJpZCA9PT0gcmVzcG9uc2VJZCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9jaGF0UGxhblJldmlld1dpZGdldHMuZ2V0KGtleSk7XG5cdFx0XHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0XHRcdHBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3BsYW5SZXZpZXdSZXNwb25zZUlkcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR0aGlzLl9wbGFuUmV2aWV3U2Vzc2lvblJlc291cmNlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jaGF0UGxhblJldmlld1dpZGdldHMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0XHR0aGlzLl9wbGFuUmV2aWV3UmVzcG9uc2VJZHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzLmNsZWFyKCk7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY2hhdFBsYW5SZXZpZXdDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBwbGFuUmV2aWV3KCk6IENoYXRQbGFuUmV2aWV3UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5zaXplID4gMCA/IHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy52YWx1ZXMoKS5uZXh0KCkudmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyAtLS0gVG9vbCBDb25maXJtYXRpb24gQ2Fyb3VzZWwgLS0tXG5cblx0cHJpdmF0ZSBnZXQgX2N1cnJlbnRTZXNzaW9uS2V5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsKCk6IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9jdXJyZW50U2Vzc2lvbktleTtcblx0XHRyZXR1cm4ga2V5ID8gdGhpcy5fY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbHMuZ2V0KGtleSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXJUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiwgZmFjdG9yeTogVG9vbEludm9jYXRpb25QYXJ0RmFjdG9yeSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmcsIGFnZW50TmFtZT86IHN0cmluZywgcmV2ZWFsU3ViYWdlbnQ/OiBSZXZlYWxTdWJhZ2VudENhbGxiYWNrLCByZXZlYWxTdWJhZ2VudExhYmVsPzogc3RyaW5nLCB0b29sUGFydD86IENoYXRUb29sSW52b2NhdGlvblBhcnQpOiBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuYWRkVG9vbEludm9jYXRpb24odG9vbCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwsIHRvb2xQYXJ0KTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsTWF4SGVpZ2h0KCk7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fY3VycmVudFNlc3Npb25LZXk7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlbmRlciB0b29sIGNvbmZpcm1hdGlvbiBjYXJvdXNlbCB3aXRob3V0IGFuIGFjdGl2ZSBzZXNzaW9uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydCA9IG5ldyBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydChmYWN0b3J5LCBbXSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwsIHN1YkFnZW50SW52b2NhdGlvbklkLCBhZ2VudE5hbWUpO1xuXHRcdHBhcnQuYWRkVG9vbEludm9jYXRpb24odG9vbCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwsIHRvb2xQYXJ0KTtcblx0XHR0aGlzLl9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2Vscy5zZXQoa2V5LCBwYXJ0KTtcblx0XHRjb25zdCBjYXB0dXJlZEtleSA9IGtleTtcblx0XHR0aGlzLl9yZWdpc3RlcihwYXJ0Lm9uRGlkQ2hhbmdlQWN0aXZlU3ViYWdlbnQoaWQgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRTZXNzaW9uS2V5ID09PSBjYXB0dXJlZEtleSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50LmZpcmUoaWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFNlc3Npb25LZXkgPT09IGNhcHR1cmVkS2V5KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50LmZpcmUocGFydC5hY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0fVxuXHRcdGRvbS5hcHBlbmQodGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyLCBwYXJ0LmRvbU5vZGUpO1xuXHRcdGRvbS5zaG93KHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UocGFydC5vbkRpZEVtcHR5KSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2Vscy5kZWxldGVBbmREaXNwb3NlKGNhcHR1cmVkS2V5KTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50U2Vzc2lvbktleSA9PT0gY2FwdHVyZWRLZXkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb25maXJtYXRpb25TdWJhZ2VudC5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdGFkZFRvb2xUb0NvbmZpcm1hdGlvbkNhcm91c2VsKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24sIGZhY3Rvcnk6IFRvb2xJbnZvY2F0aW9uUGFydEZhY3RvcnksIHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nLCBhZ2VudE5hbWU/OiBzdHJpbmcsIHJldmVhbFN1YmFnZW50PzogUmV2ZWFsU3ViYWdlbnRDYWxsYmFjaywgcmV2ZWFsU3ViYWdlbnRMYWJlbD86IHN0cmluZywgdG9vbFBhcnQ/OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0KTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0ZXhpc3RpbmcuYWRkVG9vbEludm9jYXRpb24odG9vbCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwsIHRvb2xQYXJ0KTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsTWF4SGVpZ2h0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsKHRvb2wsIGZhY3RvcnksIHN1YkFnZW50SW52b2NhdGlvbklkLCBhZ2VudE5hbWUsIHJldmVhbFN1YmFnZW50LCByZXZlYWxTdWJhZ2VudExhYmVsLCB0b29sUGFydCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50SWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudFRvb2xDb25maXJtYXRpb25DYXJvdXNlbD8uYWN0aXZlU3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdH1cblxuXHQvKipcblx0ICogTmF2aWdhdGVzIHRoZSBjYXJvdXNlbCB0byB0aGUgZmlyc3QgcGVuZGluZyB0b29sIGZyb20gdGhlIGdpdmVuIHN1YmFnZW50LlxuXHQgKi9cblx0YWN0aXZhdGVDYXJvdXNlbEZvclN1YmFnZW50KHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsPy5hY3RpdmF0ZUZpcnN0VG9vbEZvclN1YmFnZW50KHN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0fVxuXG5cdGhhc1Rvb2xJbkNvbmZpcm1hdGlvbkNhcm91c2VsKHRvb2xDYWxsSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsPy5oYXNUb29sSW52b2NhdGlvbih0b29sQ2FsbElkKSA/PyBmYWxzZTtcblx0fVxuXG5cdGdldCBoYXNBY3RpdmVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsO1xuXHRcdHJldHVybiAhIWNhcm91c2VsICYmIGNhcm91c2VsLnBlbmRpbmdDb3VudCA+IDA7XG5cdH1cblxuXHRjbGVhclRvb2xDb25maXJtYXRpb25DYXJvdXNlbCgpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl9jdXJyZW50U2Vzc2lvbktleTtcblx0XHRpZiAoa2V5KSB7XG5cdFx0XHR0aGlzLl9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2Vscy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQuZmlyZSh1bmRlZmluZWQpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHRkb20uaGlkZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN3YXBzIHRoZSB2aXNpYmxlIHRvb2wgY29uZmlybWF0aW9uIGNhcm91c2VsIHdoZW4gc3dpdGNoaW5nIHNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3luY1Rvb2xDb25maXJtYXRpb25DYXJvdXNlbEZvclNlc3Npb24oKTogdm9pZCB7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdGNvbnN0IGNhcm91c2VsID0gdGhpcy5fY3VycmVudFRvb2xDb25maXJtYXRpb25DYXJvdXNlbDtcblx0XHRpZiAoY2Fyb3VzZWwgJiYgY2Fyb3VzZWwucGVuZGluZ0NvdW50ID4gMCkge1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIsIGNhcm91c2VsLmRvbU5vZGUpO1xuXHRcdFx0ZG9tLnNob3codGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHRcdHRoaXMudXBkYXRlVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsTWF4SGVpZ2h0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcik7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQuZmlyZShjYXJvdXNlbD8uYWN0aXZlU3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHR9XG5cblx0c2V0V29ya2luZ1NldENvbGxhcHNlZChjb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl93b3JraW5nU2V0Q29sbGFwc2VkLnNldChjb2xsYXBzZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZShjaGF0RWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24gfCBudWxsKSB7XG5cdFx0dGhpcy5zZXRDaGF0RWRpdGluZ1Nlc3Npb25WaXNpYmxlKEJvb2xlYW4oY2hhdEVkaXRpbmdTZXNzaW9uKSk7XG5cblx0XHRpZiAoY2hhdEVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRpZiAoIWlzRXF1YWwoY2hhdEVkaXRpbmdTZXNzaW9uLmNoYXRTZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2xhc3RFZGl0aW5nU2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl93b3JraW5nU2V0Q29sbGFwc2VkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdEVkaXRpbmdTZXNzaW9uUmVzb3VyY2UgPSBjaGF0RWRpdGluZ1Nlc3Npb24uY2hhdFNlc3Npb25SZXNvdXJjZTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RpZmllZEVudHJpZXMgPSBkZXJpdmVkT3B0czxJTW9kaWZpZWRGaWxlRW50cnlbXT4oeyBlcXVhbHNGbjogYXJyYXlzRXF1YWwgfSwgciA9PiB7XG5cdFx0XHQvLyBCYWNrZ3JvdW5kIGNoYXQgc2Vzc2lvbnMgcmVuZGVyIHRoZSB3b3JraW5nIHNldCBiYXNlZCBvbiB0aGUgc2Vzc2lvbiBmaWxlcywgYW5kIG5vdCB0aGUgZWRpdGluZyBzZXNzaW9uXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBjaGF0RWRpdGluZ1Nlc3Npb24/LmNoYXRTZXNzaW9uUmVzb3VyY2UgPz8gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNoYXRFZGl0aW5nU2Vzc2lvbj8uZW50cmllcy5yZWFkKHIpLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5zdGF0ZS5yZWFkKHIpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB8fCBbXTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVkaXRTZXNzaW9uRW50cmllcyA9IGRlcml2ZWQoKHJlYWRlcik6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbVtdID0+IHtcblx0XHRcdGNvbnN0IHNlZW5FbnRyaWVzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzOiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW1bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBtb2RpZmllZEVudHJpZXMucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGlmIChlbnRyeS5zdGF0ZS5yZWFkKHJlYWRlcikgIT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghc2VlbkVudHJpZXMuaGFzKGVudHJ5Lm1vZGlmaWVkVVJJKSkge1xuXHRcdFx0XHRcdHNlZW5FbnRyaWVzLmFkZChlbnRyeS5tb2RpZmllZFVSSSk7XG5cdFx0XHRcdFx0Y29uc3QgbGluZXNBZGRlZCA9IGVudHJ5LmxpbmVzQWRkZWQ/LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBsaW5lc1JlbW92ZWQgPSBlbnRyeS5saW5lc1JlbW92ZWQ/LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdFx0cmVmZXJlbmNlOiBlbnRyeS5tb2RpZmllZFVSSSxcblx0XHRcdFx0XHRcdHN0YXRlOiBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0a2luZDogJ3JlZmVyZW5jZScsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXR1czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRkaWZmTWV0YTogeyBhZGRlZDogbGluZXNBZGRlZCA/PyAwLCByZW1vdmVkOiBsaW5lc1JlbW92ZWQgPz8gMCB9LFxuXHRcdFx0XHRcdFx0XHRpc0RlbGV0aW9uOiAhIWVudHJ5LmlzRGVsZXRpb24sXG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsVXJpOiBlbnRyeS5pc0RlbGV0aW9uID8gZW50cnkub3JpZ2luYWxVUkkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZW50cmllcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLmtpbmQgPT09ICdyZWZlcmVuY2UnICYmIGIua2luZCA9PT0gJ3JlZmVyZW5jZScpIHtcblx0XHRcdFx0XHRpZiAoYS5zdGF0ZSA9PT0gYi5zdGF0ZSB8fCBhLnN0YXRlID09PSB1bmRlZmluZWQgfHwgYi5zdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYS5yZWZlcmVuY2UudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIucmVmZXJlbmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYS5zdGF0ZSAtIGIuc3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIGVudHJpZXM7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uRmlsZUNoYW5nZXMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdFx0dGhpcyxcblx0XHRcdHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucyxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0cmV0dXJuIG1vZGVsPy5jaGFuZ2VzIGluc3RhbmNlb2YgQXJyYXkgPyBtb2RlbC5jaGFuZ2VzIDogSXRlcmFibGUuZW1wdHkoKTtcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdGNvbnN0IHNlc3Npb25GaWxlcyA9IGRlcml2ZWQocmVhZGVyID0+XG5cdFx0XHRzZXNzaW9uRmlsZUNoYW5nZXMucmVhZChyZWFkZXIpLm1hcCgoZW50cnkpOiBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW0gPT4gKHtcblx0XHRcdFx0cmVmZXJlbmNlOiBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGVudHJ5KVxuXHRcdFx0XHRcdD8gZW50cnkubW9kaWZpZWRVcmkgPz8gZW50cnkudXJpXG5cdFx0XHRcdFx0OiBlbnRyeS5tb2RpZmllZFVyaSxcblx0XHRcdFx0c3RhdGU6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQsXG5cdFx0XHRcdGtpbmQ6ICdyZWZlcmVuY2UnLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0ZGlmZk1ldGE6IHsgYWRkZWQ6IGVudHJ5Lmluc2VydGlvbnMsIHJlbW92ZWQ6IGVudHJ5LmRlbGV0aW9ucyB9LFxuXHRcdFx0XHRcdGlzRGVsZXRpb246IGVudHJ5Lm1vZGlmaWVkVXJpID09PSB1bmRlZmluZWQsXG5cdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGVudHJ5Lm9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdHN0YXR1czogdW5kZWZpbmVkXG5cdFx0XHRcdH1cblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHRjb25zdCBzaG91bGRSZW5kZXIgPSBkZXJpdmVkKHJlYWRlciA9PlxuXHRcdFx0ZWRpdFNlc3Npb25FbnRyaWVzLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwIHx8IHNlc3Npb25GaWxlcy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCk7XG5cblx0XHR0aGlzLl9yZW5kZXJpbmdDaGF0RWRpdHMudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlcldvcmtpbmdTZXQgJiYgc2hvdWxkUmVuZGVyLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvbldpdGhFbnRyaWVzKFxuXHRcdFx0XHRcdHJlYWRlci5zdG9yZSxcblx0XHRcdFx0XHRjaGF0RWRpdGluZ1Nlc3Npb24sXG5cdFx0XHRcdFx0ZWRpdFNlc3Npb25FbnRyaWVzLFxuXHRcdFx0XHRcdHNlc3Npb25GaWxlc1xuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lcik7XG5cdFx0XHRcdHRoaXMuX2NoYXRFZGl0c0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX2NoYXRFZGl0TGlzdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5zZXRDaGF0RWRpdGluZ1Nlc3Npb25WaXNpYmxlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKiBTaG93IG9yIGhpZGUgdGhlIHdvcmtpbmcgc2V0LCBhbmQgcmVwb3J0IHRoZSBzYW1lIHRvIHRoZSBzdGFjay4gKi9cblx0cHJpdmF0ZSBzZXRDaGF0RWRpdGluZ1Nlc3Npb25WaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRkb20uc2V0VmlzaWJpbGl0eSh2aXNpYmxlLCB0aGlzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lcik7XG5cdFx0c2V0Q2hhdElucHV0U3RhY2tTbG90KHRoaXMuY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyLCB2aXNpYmxlID8gQ2hhdElucHV0U3RhY2tTbG90LkRvY2tlZCA6IENoYXRJbnB1dFN0YWNrU2xvdC5FbXB0eSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvbldpdGhFbnRyaWVzKFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0Y2hhdEVkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgbnVsbCxcblx0XHRlZGl0U2Vzc2lvbkVudHJpZXNPYnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbVtdPixcblx0XHRzZXNzaW9uRW50cmllc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtW10+XG5cdCkge1xuXHRcdC8vIFN1bW1hcnkgb2YgbnVtYmVyIG9mIGZpbGVzIGNoYW5nZWRcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBpbm5lckNvbnRhaW5lciA9IHRoaXMuY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1jb250YWluZXIuc2hvdy1maWxlLWljb25zJykgYXMgSFRNTEVsZW1lbnQgPz8gZG9tLmFwcGVuZCh0aGlzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lciwgJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWNvbnRhaW5lci5zaG93LWZpbGUtaWNvbnMnKSk7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBvdmVydmlld1JlZ2lvbiA9IGlubmVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1vdmVydmlldycpIGFzIEhUTUxFbGVtZW50ID8/IGRvbS5hcHBlbmQoaW5uZXJDb250YWluZXIsICQoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1vdmVydmlldycpKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBvdmVydmlld1RpdGxlID0gb3ZlcnZpZXdSZWdpb24ucXVlcnlTZWxlY3RvcignLndvcmtpbmctc2V0LXRpdGxlJykgYXMgSFRNTEVsZW1lbnQgPz8gZG9tLmFwcGVuZChvdmVydmlld1JlZ2lvbiwgJCgnLndvcmtpbmctc2V0LXRpdGxlJykpO1xuXG5cdFx0Ly8gQ2xlYXIgb3V0IHRoZSBwcmV2aW91cyBhY3Rpb25zIChpZiBhbnkpXG5cdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBDaGF0IGVkaXRpbmcgc2Vzc2lvbiBhY3Rpb25zXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IG92ZXJ2aWV3UmVnaW9uLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1hY3Rpb25zJykgYXMgSFRNTEVsZW1lbnQgPz8gZG9tLmFwcGVuZChvdmVydmlld1JlZ2lvbiwgJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWFjdGlvbnMnKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBjaGF0RWRpdGluZ1Nlc3Npb24/LmNoYXRTZXNzaW9uUmVzb3VyY2UgfHwgdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChhY3Rpb25zQ29udGFpbmVyKSk7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0c2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmtleSwgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpO1xuXG5cdFx0XHQvLyBNZXRhZGF0YSBjYW4gYXJyaXZlIGFmdGVyIGZpcnN0IHJlbmRlciwgc28gdHJhY2sgaXQgcmF0aGVyIHRoYW4gc2FtcGxpbmcgb25jZS5cblx0XHRcdGNvbnN0IHNlc3Npb25QdWxsUmVxdWVzdCA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHRcdHRoaXMsXG5cdFx0XHRcdHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucyxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRyZXR1cm4gc2Vzc2lvbiA/IGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0Q29udGV4dFZhbHVlKHNlc3Npb24pIDogJyc7XG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uUHVsbFJlcXVlc3QsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCByID0+IHNlc3Npb25QdWxsUmVxdWVzdC5yZWFkKHIpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuaGFzQWdlbnRTZXNzaW9uQ2hhbmdlcywgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHIgPT4gISFzZXNzaW9uRW50cmllc09icy5yZWFkKHIpPy5sZW5ndGgpKTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBzY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHQvLyBXb3JraW5nIHNldFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHdvcmtpbmdTZXRDb250YWluZXIgPSBpbm5lckNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tbGlzdCcpIGFzIEhUTUxFbGVtZW50ID8/IGRvbS5hcHBlbmQoaW5uZXJDb250YWluZXIsICQoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1saXN0JykpO1xuXG5cdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uV2l0aEljb24ob3ZlcnZpZXdUaXRsZSwge1xuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnY2hhdEVkaXRpbmdTZXNzaW9uLnRvZ2dsZVdvcmtpbmdTZXQnLCAnVG9nZ2xlIGNoYW5nZWQgZmlsZXMuJyksXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdG9wTGV2ZWxTdGF0cyA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBlZGl0U2Vzc2lvbkVudHJpZXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkVudHJpZXMgPSBzZXNzaW9uRW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBhZGRlZCA9IDAsIHJlbW92ZWQgPSAwO1xuXG5cdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5raW5kID09PSAncmVmZXJlbmNlJyAmJiBlbnRyeS5vcHRpb25zPy5kaWZmTWV0YSkge1xuXHRcdFx0XHRcdFx0YWRkZWQgKz0gZW50cnkub3B0aW9ucy5kaWZmTWV0YS5hZGRlZDtcblx0XHRcdFx0XHRcdHJlbW92ZWQgKz0gZW50cnkub3B0aW9ucy5kaWZmTWV0YS5yZW1vdmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBzZXNzaW9uRW50cmllcykge1xuXHRcdFx0XHRcdGlmIChlbnRyeS5raW5kID09PSAncmVmZXJlbmNlJyAmJiBlbnRyeS5vcHRpb25zPy5kaWZmTWV0YSkge1xuXHRcdFx0XHRcdFx0YWRkZWQgKz0gZW50cnkub3B0aW9ucy5kaWZmTWV0YS5hZGRlZDtcblx0XHRcdFx0XHRcdHJlbW92ZWQgKz0gZW50cnkub3B0aW9ucy5kaWZmTWV0YS5yZW1vdmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmaWxlcyA9IGVudHJpZXMubGVuZ3RoID4gMCA/IGVudHJpZXMubGVuZ3RoIDogc2Vzc2lvbkVudHJpZXMubGVuZ3RoO1xuXHRcdFx0Y29uc3QgdG9wTGV2ZWxJc1Nlc3Npb25NZW51ID0gZW50cmllcy5sZW5ndGggPT09IDAgJiYgc2Vzc2lvbkVudHJpZXMubGVuZ3RoID4gMDtcblx0XHRcdGNvbnN0IHNob3VsZFNob3dFZGl0aW5nU2Vzc2lvbiA9IGVudHJpZXMubGVuZ3RoID4gMCB8fCBzZXNzaW9uRW50cmllcy5sZW5ndGggPiAwO1xuXG5cdFx0XHRyZXR1cm4geyBmaWxlcywgYWRkZWQsIHJlbW92ZWQsIHNob3VsZFNob3dFZGl0aW5nU2Vzc2lvbiwgdG9wTGV2ZWxJc1Nlc3Npb25NZW51IH07XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0b3BMZXZlbElzU2Vzc2lvbk1lbnUgPSB0b3BMZXZlbFN0YXRzLm1hcCh0ID0+IHQudG9wTGV2ZWxJc1Nlc3Npb25NZW51KTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpc1Nlc3Npb25NZW51ID0gdG9wTGV2ZWxJc1Nlc3Npb25NZW51LnJlYWQocmVhZGVyKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaEJ1dHRvbkJhciwgYWN0aW9uc0NvbnRhaW5lciwgaXNTZXNzaW9uTWVudSA/IE1lbnVJZC5DaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzVG9vbGJhciA6IE1lbnVJZC5DaGF0RWRpdGluZ1dpZGdldFRvb2xiYXIsIHtcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiB0aGlzLm9wdGlvbnMubWVudXMudGVsZW1ldHJ5U291cmNlLFxuXHRcdFx0XHRzbWFsbDogdHJ1ZSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHNlc3Npb25SZXNvdXJjZSA/IChpc1Nlc3Npb25NZW51ID8ge1xuXHRcdFx0XHRcdGFyZ3M6IFtzZXNzaW9uUmVzb3VyY2UsIHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpPy5tZXRhZGF0YV0sXG5cdFx0XHRcdH0gOiB7XG5cdFx0XHRcdFx0YXJnOiB7XG5cdFx0XHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ2hhdFZpZXdDb250ZXh0LFxuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dCxcblx0XHRcdFx0fSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRpc2FibGVXaGlsZVJ1bm5pbmc6IGlzU2Vzc2lvbk1lbnUsXG5cdFx0XHRcdGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gQ2hhdEVkaXRpbmdTaG93Q2hhbmdlc0FjdGlvbi5JRCB8fCBhY3Rpb24uaWQgPT09IFZpZXdQcmV2aW91c0VkaXRzQWN0aW9uLklkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBzaG93SWNvbjogdHJ1ZSwgc2hvd0xhYmVsOiBmYWxzZSwgaXNTZWNvbmRhcnk6IHRydWUgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gVGhlIGNsb3VkLWFnZW50IFwiT3BlbiBwdWxsIHJlcXVlc3RcIiBhY3Rpb24gcmVuZGVycyBpY29uLW9ubHk7IGl0cyBzaWJsaW5nXG5cdFx0XHRcdFx0Ly8gXCJDcmVhdGUgcHVsbCByZXF1ZXN0XCIgYWN0aW9uIGtlZXBzIGl0cyB0ZXh0IGxhYmVsLlxuXHRcdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09ICdnaXRodWIuY29waWxvdC5jaGF0LmNsb3VkU2Vzc2lvbnMub3BlblB1bGxSZXF1ZXN0Rm9yVGFzaycpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHNob3dJY29uOiB0cnVlLCBzaG93TGFiZWw6IGZhbHNlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgeyBmaWxlcywgYWRkZWQsIHJlbW92ZWQsIHNob3VsZFNob3dFZGl0aW5nU2Vzc2lvbiB9ID0gdG9wTGV2ZWxTdGF0cy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IGJ1dHRvbkxhYmVsID0gZmlsZXMgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdEVkaXRpbmdTZXNzaW9uLm9uZUZpbGUnLCAnMSBmaWxlIGNoYW5nZWQnKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24ubWFueUZpbGVzJywgJ3swfSBmaWxlcyBjaGFuZ2VkJywgZmlsZXMpO1xuXG5cdFx0XHRidXR0b24ubGFiZWwgPSBidXR0b25MYWJlbDtcblx0XHRcdGJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24uYXJpYUxhYmVsV2l0aENvdW50cycsICd7MH0sIHsxfSBsaW5lcyBhZGRlZCwgezJ9IGxpbmVzIHJlbW92ZWQnLCBidXR0b25MYWJlbCwgYWRkZWQsIHJlbW92ZWQpKTtcblxuXHRcdFx0dGhpcy5fd29ya2luZ1NldExpbmVzQWRkZWRTcGFuLnZhbHVlLnRleHRDb250ZW50ID0gYCske2FkZGVkfWA7XG5cdFx0XHR0aGlzLl93b3JraW5nU2V0TGluZXNSZW1vdmVkU3Bhbi52YWx1ZS50ZXh0Q29udGVudCA9IGAtJHtyZW1vdmVkfWA7XG5cblx0XHRcdHRoaXMuc2V0Q2hhdEVkaXRpbmdTZXNzaW9uVmlzaWJsZShzaG91bGRTaG93RWRpdGluZ1Nlc3Npb24pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvdW50c0NvbnRhaW5lciA9IGRvbS4kKCcud29ya2luZy1zZXQtbGluZS1jb3VudHMnKTtcblx0XHRidXR0b24uZWxlbWVudC5hcHBlbmRDaGlsZChjb3VudHNDb250YWluZXIpO1xuXHRcdGNvdW50c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl93b3JraW5nU2V0TGluZXNBZGRlZFNwYW4udmFsdWUpO1xuXHRcdGNvdW50c0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl93b3JraW5nU2V0TGluZXNSZW1vdmVkU3Bhbi52YWx1ZSk7XG5cblx0XHRjb25zdCB0b2dnbGVXb3JraW5nU2V0ID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fd29ya2luZ1NldENvbGxhcHNlZC5zZXQoIXRoaXMuX3dvcmtpbmdTZXRDb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0fTtcblxuXHRcdHRoaXMuX2NoYXRFZGl0c0FjdGlvbnNEaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2sodG9nZ2xlV29ya2luZ1NldCkpO1xuXHRcdHRoaXMuX2NoYXRFZGl0c0FjdGlvbnNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG92ZXJ2aWV3UmVnaW9uLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRpZiAodGFyZ2V0LmNsb3Nlc3QoJy5tb25hY28tYnV0dG9uJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dG9nZ2xlV29ya2luZ1NldCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NoYXRFZGl0c0FjdGlvbnNEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5fd29ya2luZ1NldENvbGxhcHNlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRidXR0b24uaWNvbiA9IGNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdHdvcmtpbmdTZXRDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgY29sbGFwc2VkKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMuX2NoYXRFZGl0TGlzdCkge1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRMaXN0ID0gdGhpcy5fY2hhdEVkaXRzTGlzdFBvb2wuZ2V0KCk7XG5cdFx0XHRjb25zdCBsaXN0ID0gdGhpcy5fY2hhdEVkaXRMaXN0Lm9iamVjdDtcblx0XHRcdHRoaXMuX2NoYXRFZGl0c0Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jaGF0RWRpdExpc3QpO1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRzRGlzcG9zYWJsZXMuYWRkKGxpc3Qub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRzRGlzcG9zYWJsZXMuYWRkKGxpc3Qub25EaWRPcGVuKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnQ/LmtpbmQgPT09ICdyZWZlcmVuY2UnICYmIFVSSS5pc1VyaShlLmVsZW1lbnQucmVmZXJlbmNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGlmaWVkRmlsZVVyaSA9IGUuZWxlbWVudC5yZWZlcmVuY2U7XG5cdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSBlLmVsZW1lbnQub3B0aW9ucz8ub3JpZ2luYWxVcmk7XG5cblx0XHRcdFx0XHRpZiAoZS5lbGVtZW50Lm9wdGlvbnM/LmlzRGVsZXRpb24gJiYgb3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IG9yaWdpbmFsVXJpLCAvLyBpbnN0ZWFkIG9mIG1vZGlmaWVkLCBiZWNhdXNlIG1vZGlmaWVkIHdpbGwgbm90IGV4aXN0XG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGUuZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHRcdFx0fSwgZS5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gSWYgdGhlcmUncyBhIG9yaWdpbmFsVXJpLCBvcGVuIGFzIGRpZmYgZWRpdG9yXG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsVXJpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBvcmlnaW5hbFVyaSB9LFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRGaWxlVXJpIH0sXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGUuZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHRcdFx0fSwgZS5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBjaGF0RWRpdGluZ1Nlc3Npb24/LmdldEVudHJ5KG1vZGlmaWVkRmlsZVVyaSk7XG5cblx0XHRcdFx0XHRjb25zdCBwYW5lID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IG1vZGlmaWVkRmlsZVVyaSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IGUuZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHRcdH0sIGUuc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVApO1xuXG5cdFx0XHRcdFx0aWYgKHBhbmUpIHtcblx0XHRcdFx0XHRcdGVudHJ5Py5nZXRFZGl0b3JJbnRlZ3JhdGlvbihwYW5lKS5yZXZlYWwodHJ1ZSwgZS5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRzRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaXN0LmdldEhUTUxFbGVtZW50KCksICdjbGljaycsIGUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB0cnVlKSk7XG5cdFx0XHRkb20uYXBwZW5kKHdvcmtpbmdTZXRDb250YWluZXIsIGxpc3QuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdFx0XHRkb20uYXBwZW5kKGlubmVyQ29udGFpbmVyLCB3b3JraW5nU2V0Q29udGFpbmVyKTtcblx0XHR9XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdEVudHJpZXMgPSBlZGl0U2Vzc2lvbkVudHJpZXNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkZpbGVFbnRyaWVzID0gc2Vzc2lvbkVudHJpZXNPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBDb21iaW5lIGVkaXQgc2Vzc2lvbiBlbnRyaWVzIHdpdGggc2Vzc2lvbiBmaWxlIGNoYW5nZXMuIEF0IHRoZSBtb21lbnQsIHdlXG5cdFx0XHQvLyB3ZSBjYW4gY29tYmluZSB0aGVzZSB0d28gYXJyYXlzIHNpbmNlIGxvY2FsIGNoYXQgc2Vzc2lvbnMgdXNlIGVkaXQgc2Vzc2lvblxuXHRcdFx0Ly8gZW50cmllcywgd2hpbGUgYmFja2dyb3VuZCBjaGF0IHNlc3Npb25zIHVzZSBzZXNzaW9uIGZpbGUgY2hhbmdlcy5cblx0XHRcdGNvbnN0IGFsbEVudHJpZXMgPSBlZGl0RW50cmllcy5jb25jYXQoc2Vzc2lvbkZpbGVFbnRyaWVzKTtcblxuXHRcdFx0Y29uc3QgbWF4SXRlbXNTaG93biA9IDY7XG5cdFx0XHRjb25zdCBpdGVtc1Nob3duID0gTWF0aC5taW4oYWxsRW50cmllcy5sZW5ndGgsIG1heEl0ZW1zU2hvd24pO1xuXHRcdFx0Y29uc3QgaGVpZ2h0ID0gaXRlbXNTaG93biAqIDIyO1xuXHRcdFx0Y29uc3QgbGlzdCA9IHRoaXMuX2NoYXRFZGl0TGlzdCEub2JqZWN0O1xuXHRcdFx0bGlzdC5sYXlvdXQoaGVpZ2h0KTtcblx0XHRcdGxpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdFx0bGlzdC5zcGxpY2UoMCwgbGlzdC5sZW5ndGgsIGFsbEVudHJpZXMpO1xuXHRcdFx0d29ya2luZ1NldENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvdmVyZmxvd2luZycsIGFsbEVudHJpZXMubGVuZ3RoID4gbWF4SXRlbXNTaG93bik7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgcmVuZGVyRm9sbG93dXBzKGl0ZW1zOiBJQ2hhdEZvbGxvd3VwW10gfCB1bmRlZmluZWQsIHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMucmVuZGVyRm9sbG93dXBzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZm9sbG93dXBzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuZm9sbG93dXBzQ29udGFpbmVyKTtcblxuXHRcdGlmIChpdGVtcyAmJiBpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmZvbGxvd3Vwc0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlPHR5cGVvZiBDaGF0Rm9sbG93dXBzPElDaGF0Rm9sbG93dXA+LCBDaGF0Rm9sbG93dXBzPElDaGF0Rm9sbG93dXA+PihDaGF0Rm9sbG93dXBzLCB0aGlzLmZvbGxvd3Vwc0NvbnRhaW5lciwgaXRlbXMsIHRoaXMubG9jYXRpb24sIHVuZGVmaW5lZCwgZm9sbG93dXAgPT4gdGhpcy5fb25EaWRBY2NlcHRGb2xsb3d1cC5maXJlKHsgZm9sbG93dXAsIHJlc3BvbnNlIH0pKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIG1heGltdW0gaGVpZ2h0IGJ1ZGdldCBmb3IgdGhlIGlucHV0IHBhcnQuIFRoZSBlZGl0b3IgaGVpZ2h0IHdpbGwgYmVcblx0ICogY2xhbXBlZCBzbyBpdCBkb2VzIG5vdCBncm93IGJleW9uZCB3aGF0IHRoaXMgYnVkZ2V0IGFsbG93cyBhZnRlciBhY2NvdW50aW5nXG5cdCAqIGZvciBub24tZWRpdG9yIGNocm9tZSBzdWNoIGFzIGF0dGFjaG1lbnRzLCB0b29sYmFycywgYW5kIHdpZGdldHMuXG5cdCAqL1xuXHRzZXRNYXhIZWlnaHQobWF4SGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9tYXhIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0dGhpcy51cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsTWF4SGVpZ2h0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gdGhpcy5fY3VycmVudFRvb2xDb25maXJtYXRpb25DYXJvdXNlbDtcblx0XHRpZiAoIWNhcm91c2VsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21heEhlaWdodCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjYXJvdXNlbC5zZXRNYXhIZWlnaHQodW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYXJvdXNlbEhlaWdodCA9IHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0Y29uc3Qgb3RoZXJJbnB1dEhlaWdodCA9IE1hdGgubWF4KDAsIHRoaXMuY29udGFpbmVyLm9mZnNldEhlaWdodCAtIGNhcm91c2VsSGVpZ2h0KTtcblx0XHRjYXJvdXNlbC5zZXRNYXhIZWlnaHQodGhpcy5fbWF4SGVpZ2h0IC0gb3RoZXJJbnB1dEhlaWdodCk7XG5cdH1cblxuXHQvKipcblx0ICogTGF5b3V0IHRoZSBpbnB1dCBwYXJ0IHdpdGggdGhlIGdpdmVuIHdpZHRoLiBIZWlnaHQgaXMgaW50cmluc2ljIC0gZGV0ZXJtaW5lZCBieSBjb250ZW50XG5cdCAqIGFuZCBkZXRlY3RlZCB2aWEgUmVzaXplT2JzZXJ2ZXIsIHdoaWNoIHVwZGF0ZXMgYGlucHV0UGFydEhlaWdodGAgZm9yIHRoZSBwYXJlbnQgdG8gb2JzZXJ2ZS5cblx0ICovXG5cdGxheW91dCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5jYWNoZWRXaWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX3N0YWJsZUlucHV0UGFydFdpZHRoLnNldCh3aWR0aCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl91cGRhdGVXb3JraW5nUHJvZ3Jlc3NBbmltYXRpb25EdXJhdGlvbih3aWR0aCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0KHdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY2FsZSB0aGUgd29ya2luZy9wcm9ncmVzcyBib3JkZXIgY29tZXQgYW5pbWF0aW9uIGR1cmF0aW9uIHdpdGhcblx0ICogdGhlIGlucHV0IHdpZHRoIHNvIHRoZSBjb21ldCdzIHBlcmNlaXZlZCBsaW5lYXIgdHJhdmVsIHNwZWVkICh0aGVcblx0ICogcmF0ZSBpdCBzd2VlcHMgYWxvbmcgdGhlIHBlcmltZXRlciBpbiBweC9zZWMpIHN0YXlzIHJvdWdobHlcblx0ICogY29uc3RhbnQuIEEgZml4ZWQgY3ljbGUgdGltZSBtYWRlIHdpZGUgaW5wdXRzIGZlZWwgc2x1Z2dpc2gsIGJ1dFxuXHQgKiBhbiBhZ2dyZXNzaXZlIGludmVyc2UgY3VydmUgbWFkZSBuYXJyb3cgaW5wdXRzIGZlZWwgc2xvdyBiZWNhdXNlXG5cdCAqIHRoZWlyIGN5Y2xlIHdhcyBjbGFtcGVkIHdoaWxlIHRoZSBjb21ldCBoYWQgbGl0dGxlIGRpc3RhbmNlIHRvXG5cdCAqIGNvdmVyLiBTdWItbGluZWFyIHNjYWxpbmcgd2l0aCB3aWR0aCAoYHNxcnQod2lkdGgpYCkgcGx1cyB0aWdodFxuXHQgKiBjbGFtcHMga2VlcHMgYm90aCBleHRyZW1lcyBsb29raW5nIGxpdmVseS5cblx0ICovXG5cdHByaXZhdGUgX2xhc3RBbmltRHVyYXRpb25TOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3VwZGF0ZVdvcmtpbmdQcm9ncmVzc0FuaW1hdGlvbkR1cmF0aW9uKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaW5wdXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU3ViLWxpbmVhciBzY2FsaW5nOiBjeWNsZSB0aW1lIGdyb3dzIHdpdGggd2lkdGggYnV0IHRhcGVycyBvZmZcblx0XHQvLyBzbyB3aWRlIGlucHV0cyBzdGlsbCBmZWVsIHNuYXBweS4gVHVuZWQgc28gfjQwMHB4IFx1MjE5MiB+MS43cyBhbmRcblx0XHQvLyB+MTAwMHB4IFx1MjE5MiB+Mi4zcyByYXRoZXIgdGhhbiB+NHMuXG5cdFx0Y29uc3QgTUlOX0RVUkFUSU9OX1MgPSAxLjQ7XG5cdFx0Y29uc3QgTUFYX0RVUkFUSU9OX1MgPSAyLjU7XG5cdFx0Y29uc3Qgc2FmZVdpZHRoID0gTWF0aC5tYXgoNTAsIHdpZHRoKTtcblx0XHRjb25zdCByYXcgPSAwLjU1ICsgMC4wNzUgKiBNYXRoLnNxcnQoc2FmZVdpZHRoKTtcblx0XHRjb25zdCBkdXJhdGlvbiA9IE1hdGgubWluKE1BWF9EVVJBVElPTl9TLCBNYXRoLm1heChNSU5fRFVSQVRJT05fUywgcmF3KSk7XG5cblx0XHQvLyBTa2lwIG5vLW9wIHVwZGF0ZXMgKGUuZy4gcmVwZWF0ZWQgbGF5b3V0IGNhbGxzIGR1cmluZyBzdGVhZHkgc3RhdGUpLlxuXHRcdGlmICh0aGlzLl9sYXN0QW5pbUR1cmF0aW9uUyAhPT0gdW5kZWZpbmVkICYmIE1hdGguYWJzKHRoaXMuX2xhc3RBbmltRHVyYXRpb25TIC0gZHVyYXRpb24pIDwgMC4wNSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0QW5pbUR1cmF0aW9uUyA9IGR1cmF0aW9uO1xuXHRcdHRoaXMuaW5wdXRDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tY2hhdC1pbnB1dC1hbmltLWR1cmF0aW9uJywgYCR7ZHVyYXRpb24udG9GaXhlZCgyKX1zYCk7XG5cblx0XHQvLyBDU1MgYW5pbWF0aW9ucyBjYXB0dXJlIGFuaW1hdGlvbi1kdXJhdGlvbiBhdCBzdGFydCB0aW1lIGFuZCBtb3N0XG5cdFx0Ly8gYnJvd3NlcnMgZG8gbm90IHJlLXBpY2sgdXAgdmFsdWVzIHRoYXQgY29tZSBmcm9tIGEgY3VzdG9tXG5cdFx0Ly8gcHJvcGVydHkgbWlkLWZsaWdodC4gSWYgdGhlIGNvbWV0IGlzIGN1cnJlbnRseSBzcGlubmluZywgcmVzdGFydFxuXHRcdC8vIGl0IG9uIHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZSBzbyBzdHlsZSBhbmQgbGF5b3V0IGNoYW5nZXMgY2FuXG5cdFx0Ly8gYmF0Y2ggd2l0aG91dCBmb3JjaW5nIGEgc3luY2hyb25vdXMgcmVmbG93LiBUb2dnbGluZyB0aGUgLndvcmtpbmdcblx0XHQvLyBjbGFzcyB3b3VsZCBjYW5jZWwgdGhlIGluLWZsaWdodCBpbmRpY2F0b3Igc3RhdGUsIHNvIGluc3RlYWQgd2Vcblx0XHQvLyBicmllZmx5IGZsaXAgYSBtYXJrZXIgY2xhc3MgdGhhdCB0aGUgQ1NTIHVzZXMgdG8gc3dhcFxuXHRcdC8vIGFuaW1hdGlvbi1uYW1lLlxuXHRcdGlmICh0aGlzLmlucHV0Q29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucygnd29ya2luZycpKSB7XG5cdFx0XHRjb25zdCBpbnB1dENvbnRhaW5lciA9IHRoaXMuaW5wdXRDb250YWluZXI7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LWFuaW0tcmVzdGFydCcpO1xuXHRcdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyhpbnB1dENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0aW5wdXRDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1pbnB1dC1hbmltLXJlc3RhcnQnKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9lZmZlY3RpdmVJbnB1dEVkaXRvck1heEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLl9tYXhIZWlnaHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXRFZGl0b3JNYXhIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHV0ZSBub24tZWRpdG9yIGhlaWdodCBmcm9tIHRoZSBjYWNoZWQgY29udGFpbmVyIGhlaWdodCAodXBkYXRlZCBieSBSZXNpemVPYnNlcnZlcilcblx0XHQvLyBtaW51cyB0aGUgY3VycmVudCBlZGl0b3IgaGVpZ2h0LiBUaGlzIGF2b2lkcyBhIGZvcmNlZCByZWZsb3cgZnJvbSByZWFkaW5nIG9mZnNldEhlaWdodC5cblx0XHRjb25zdCBjdXJyZW50RWRpdG9ySGVpZ2h0ID0gdGhpcy5wcmV2aW91c0lucHV0RWRpdG9yRGltZW5zaW9uPy5oZWlnaHQgPz8gMDtcblx0XHRjb25zdCBub25FZGl0b3JIZWlnaHQgPSBNYXRoLm1heCgwLCB0aGlzLmhlaWdodC5nZXQoKSAtIGN1cnJlbnRFZGl0b3JIZWlnaHQpO1xuXHRcdGNvbnN0IGJ1ZGdldEZvckVkaXRvciA9IHRoaXMuX21heEhlaWdodCAtIG5vbkVkaXRvckhlaWdodDtcblxuXHRcdC8vIEZsb29yIHRoZSBidWRnZXQgc28gdGhlIGVkaXRvciBrZWVwcyBhdCBsZWFzdCBvbmUgdXNhYmxlIGxpbmUuIFNlZSAjMzIyNTIzLlxuXHRcdGNvbnN0IG1pbkVkaXRvckhlaWdodCA9IHRoaXMuaW5wdXRFZGl0b3JNaW5IZWlnaHQgPz8gdGhpcy5zaW5nbGVMaW5lSW5wdXRFZGl0b3JIZWlnaHQ7XG5cdFx0cmV0dXJuIE1hdGgubWF4KG1pbkVkaXRvckhlaWdodCwgTWF0aC5taW4odGhpcy5pbnB1dEVkaXRvck1heEhlaWdodCwgTWF0aC5tYXgoMCwgYnVkZ2V0Rm9yRWRpdG9yKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmV2aW91c0lucHV0RWRpdG9yRGltZW5zaW9uOiBJRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXlvdXQod2lkdGg6IG51bWJlciwgYWxsb3dSZWN1cnNlID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdldExheW91dERhdGEoKTtcblxuXHRcdGNvbnN0IGZvbGxvd3Vwc1dpZHRoID0gd2lkdGggLSBkYXRhLmlucHV0UGFydEhvcml6b250YWxQYWRkaW5nO1xuXHRcdHRoaXMuZm9sbG93dXBzQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7Zm9sbG93dXBzV2lkdGh9cHhgO1xuXG5cdFx0Y29uc3QgaW5pdGlhbEVkaXRvclNjcm9sbFdpZHRoID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0U2Nyb2xsV2lkdGgoKTtcblx0XHRjb25zdCBuZXdFZGl0b3JXaWR0aCA9IHdpZHRoIC0gZGF0YS5pbnB1dFBhcnRIb3Jpem9udGFsUGFkZGluZyAtIGRhdGEuZWRpdG9yQm9yZGVyIC0gZGF0YS5pbnB1dFBhcnRIb3Jpem9udGFsUGFkZGluZ0luc2lkZSAtIGRhdGEudG9vbGJhcnNXaWR0aCAtIGRhdGEuc2lkZVRvb2xiYXJXaWR0aDtcblx0XHRjb25zdCBlZmZlY3RpdmVNYXhIZWlnaHQgPSB0aGlzLl9lZmZlY3RpdmVJbnB1dEVkaXRvck1heEhlaWdodDtcblx0XHRjb25zdCBjbGFtcGVkQ29udGVudEhlaWdodCA9IE1hdGgubWluKHRoaXMuX2lucHV0RWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKSwgZWZmZWN0aXZlTWF4SGVpZ2h0KTtcblx0XHRjb25zdCBpbnB1dEVkaXRvckhlaWdodCA9IHRoaXMuaW5wdXRFZGl0b3JNaW5IZWlnaHQgPyBNYXRoLm1pbihNYXRoLm1heCh0aGlzLmlucHV0RWRpdG9yTWluSGVpZ2h0LCBjbGFtcGVkQ29udGVudEhlaWdodCksIGVmZmVjdGl2ZU1heEhlaWdodCkgOiBjbGFtcGVkQ29udGVudEhlaWdodDtcblx0XHRjb25zdCBuZXdEaW1lbnNpb24gPSB7IHdpZHRoOiBuZXdFZGl0b3JXaWR0aCwgaGVpZ2h0OiBpbnB1dEVkaXRvckhlaWdodCB9O1xuXHRcdGlmICghdGhpcy5wcmV2aW91c0lucHV0RWRpdG9yRGltZW5zaW9uIHx8ICh0aGlzLnByZXZpb3VzSW5wdXRFZGl0b3JEaW1lbnNpb24ud2lkdGggIT09IG5ld0RpbWVuc2lvbi53aWR0aCB8fCB0aGlzLnByZXZpb3VzSW5wdXRFZGl0b3JEaW1lbnNpb24uaGVpZ2h0ICE9PSBuZXdEaW1lbnNpb24uaGVpZ2h0KSkge1xuXHRcdFx0Ly8gVGhpcyBsYXlvdXQgY2FsbCBoYXMgc2lkZS1lZmZlY3RzIHRoYXQgYXJlIGhhcmQgdG8gdW5kZXJzdGFuZC4gZWcgaWYgd2UgYXJlIGNhbGxpbmcgdGhpcyBpbnNpZGUgYSBvbkRpZENoYW5nZUNvbnRlbnQgaGFuZGxlciwgdGhpcyBjYW4gdHJpZ2dlciB0aGUgbmV4dCBvbkRpZENoYW5nZUNvbnRlbnQgaGFuZGxlclxuXHRcdFx0Ly8gdG8gYmUgaW52b2tlZCwgYW5kIHdlIGhhdmUgYSBsb3Qgb2YgdGhlc2Ugb24gdGhpcyBlZGl0b3IuIE9ubHkgZG9pbmcgYSBsYXlvdXQgdGhpcyB3aGVuIHRoZSBlZGl0b3Igc2l6ZSBoYXMgYWN0dWFsbHkgY2hhbmdlZCBtYWtlcyBpdCBtdWNoIGVhc2llciB0byBmb2xsb3cuXG5cdFx0XHR0aGlzLl9pbnB1dEVkaXRvci5sYXlvdXQobmV3RGltZW5zaW9uKTtcblx0XHRcdHRoaXMucHJldmlvdXNJbnB1dEVkaXRvckRpbWVuc2lvbiA9IG5ld0RpbWVuc2lvbjtcblx0XHR9XG5cblx0XHRpZiAoYWxsb3dSZWN1cnNlICYmIGluaXRpYWxFZGl0b3JTY3JvbGxXaWR0aCA8IDEwKSB7XG5cdFx0XHQvLyBUaGlzIGlzIHByb2JhYmx5IHRoZSBpbml0aWFsIGxheW91dC4gTm93IHRoYXQgdGhlIGVkaXRvciBpcyBsYXllZCBvdXQgd2l0aCBpdHMgY29ycmVjdCB3aWR0aCwgaXQgc2hvdWxkIHJlcG9ydCB0aGUgY29ycmVjdCBjb250ZW50SGVpZ2h0XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0KHdpZHRoLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYXlvdXREYXRhKCkge1xuXG5cdFx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cdFx0Ly8gIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjXG5cdFx0Ly8gIyAgICBDSEFOR0lORyBUSElTIE1FVEhPRCBIQVMgUkVOREVSSU5HIElNUExJQ0FUSU9OUyBGT1IgVEhFIENIQVQgVklFVyAgICAjXG5cdFx0Ly8gIyAgICBJRiBZT1UgTUFLRSBDSEFOR0VTIEhFUkUsIFBMRUFTRSBURVNUIFRIRSBDSEFUIFZJRVcgVEhPUk9VR0hMWTogICAgICAjXG5cdFx0Ly8gIyAgICAtIHByb2R1Y2UgdmFyaW91cyBjaGF0IHJlc3BvbnNlcyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjXG5cdFx0Ly8gIyAgICAtIGNsaWNrIHRoZSByZXNwb25zZSB0byBnZXQgYSBmb2N1cyBvdXRsaW5lICAgICAgICAgICAgICAgICAgICAgICAgICAjXG5cdFx0Ly8gIyAgICAtIGVuc3VyZSB0aGUgb3V0bGluZSBpcyBub3QgY3V0IG9mZiBhdCB0aGUgYm90dG9tICAgICAgICAgICAgICAgICAgICAjXG5cdFx0Ly8gIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjXG5cdFx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjXG5cblx0XHRjb25zdCBpbnB1dFNpZGVUb29sYmFyV2lkdGggPSB0aGlzLmlucHV0U2lkZVRvb2xiYXJDb250YWluZXIgPyBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLmlucHV0U2lkZVRvb2xiYXJDb250YWluZXIpIDogMDtcblxuXHRcdGNvbnN0IGdldFRvb2xiYXJzV2lkdGhDb21wYWN0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbGJhckl0ZW1HYXAgPSA0O1xuXHRcdFx0Y29uc3QgZXhlY3V0ZVRvb2xiYXJXaWR0aCA9IHRoaXMuY2FjaGVkRXhlY3V0ZVRvb2xiYXJXaWR0aCA9IHRoaXMuZXhlY3V0ZVRvb2xiYXIuZ2V0SXRlbXNXaWR0aCgpO1xuXHRcdFx0Y29uc3QgaW5wdXRUb29sYmFyV2lkdGggPSB0aGlzLmNhY2hlZElucHV0VG9vbGJhcldpZHRoID0gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmdldEl0ZW1zV2lkdGgoKTtcblx0XHRcdGNvbnN0IGV4ZWN1dGVUb29sYmFyUGFkZGluZyA9ICh0aGlzLmV4ZWN1dGVUb29sYmFyLmdldEl0ZW1zTGVuZ3RoKCkgLSAxKSAqIHRvb2xiYXJJdGVtR2FwO1xuXHRcdFx0Y29uc3QgaW5wdXRUb29sYmFyUGFkZGluZyA9IHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpID8gKHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRJdGVtc0xlbmd0aCgpIC0gMSkgKiB0b29sYmFySXRlbUdhcCA6IDA7XG5cdFx0XHRjb25zdCBjb250ZXh0VXNhZ2VXaWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyKTtcblx0XHRcdGNvbnN0IGlucHV0VG9vbGJhcnNQYWRkaW5nID0gMTI7IC8vIHBkYWRpbmcgYmV0d2VlbiBpbnB1dCB0b29sYmFyL2V4ZWN1dGUgdG9vbGJhci9jb250ZXh0VXNhZ2UuXG5cdFx0XHRyZXR1cm4gZXhlY3V0ZVRvb2xiYXJXaWR0aCArIGV4ZWN1dGVUb29sYmFyUGFkZGluZyArIGNvbnRleHRVc2FnZVdpZHRoICsgKHRoaXMub3B0aW9ucy5yZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0ID8gMCA6IGlucHV0VG9vbGJhcldpZHRoICsgaW5wdXRUb29sYmFyUGFkZGluZyArIGlucHV0VG9vbGJhcnNQYWRkaW5nKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVkaXRvckJvcmRlcjogMixcblx0XHRcdC8vIFRoZSBzZXNzaW9ucyB3aW5kb3cgcGFkcyBgLmludGVyYWN0aXZlLWlucHV0LXBhcnRgIGJ5IDMycHggb24gZWFjaCBzaWRlXG5cdFx0XHQvLyAodnMgdGhlIGRlZmF1bHQgMTJweCBtYXJnaW4pIHNvIHRoZSBpbnB1dCBib3ggYWxpZ25zIHdpdGggdGhlIGNoYXRcblx0XHRcdC8vIGNvbnRlbnQgY2FyZHMuIFRoZSBlZGl0b3Igd2lkdGggaXMgY29tcHV0ZWQgaGVyZSwgc28gaXQgbXVzdCBhY2NvdW50XG5cdFx0XHQvLyBmb3IgdGhlIHNhbWUgNjRweCB0b3RhbCBob3Jpem9udGFsIGd1dHRlciBvciB0aGUgZWRpdG9yIG92ZXJmbG93cyBpdHNcblx0XHRcdC8vIGNvbnRhaW5lciBhbmQgcmVuZGVycyB3aWRlciB0aGFuIHRoZSBtZXNzYWdlIGNvbnRlbnQgYWJvdmUgaXQuXG5cdFx0XHRpbnB1dFBhcnRIb3Jpem9udGFsUGFkZGluZzogdGhpcy5vcHRpb25zLmlucHV0UGFydEhvcml6b250YWxQYWRkaW5nID8/ICh0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyA/IDE2IDogKHRoaXMub3B0aW9ucy5pc1Nlc3Npb25zV2luZG93ID8gNjQgOiAyNCkpLFxuXHRcdFx0aW5wdXRQYXJ0SG9yaXpvbnRhbFBhZGRpbmdJbnNpZGU6IHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnID8gMTIgOiAxMCxcblx0XHRcdHRvb2xiYXJzV2lkdGg6IHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnID8gZ2V0VG9vbGJhcnNXaWR0aENvbXBhY3QoKSA6IDAsXG5cdFx0XHRzaWRlVG9vbGJhcldpZHRoOiBpbnB1dFNpZGVUb29sYmFyV2lkdGggPiAwID8gaW5wdXRTaWRlVG9vbGJhcldpZHRoICsgNCAvKmdhcCovIDogMCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIGxvY2F0aW9uIG9mIHRoZSBjaGF0IHdpZGdldCBhbmQgd2hldGhlciB0aGF0IGxvY2F0aW9uIGlzIG1heGltaXplZC5cblx0ICovXG5cdHByaXZhdGUgZ2V0V2lkZ2V0TG9jYXRpb25JbmZvKHdpZGdldDogSUNoYXRXaWRnZXQpOiBJQ2hhdFdpZGdldExvY2F0aW9uSW5mbyB7XG5cdFx0Ly8gRWRpdG9yIGNvbnRleHQgKHF1aWNrIGNoYXQsIGlubGluZSBjaGF0LCBldGMuKVxuXHRcdGlmIChpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm4geyBsb2NhdGlvbjogQ2hhdFdpZGdldExvY2F0aW9uLkVkaXRvciwgaXNNYXhpbWl6ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gVmlldyBjb250ZXh0IC0gZGV0ZXJtaW5lIGFjdHVhbCBsb2NhdGlvbiBmcm9tIHZpZXcgZGVzY3JpcHRvciBzZXJ2aWNlXG5cdFx0aWYgKGlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSkge1xuXHRcdFx0Y29uc3Qgdmlld0xvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh3aWRnZXQudmlld0NvbnRleHQudmlld0lkKTtcblx0XHRcdGNvbnN0IHNpZGVCYXJQb3NpdGlvbiA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKTtcblxuXHRcdFx0c3dpdGNoICh2aWV3TG9jYXRpb24pIHtcblx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiBDaGF0V2lkZ2V0TG9jYXRpb24uUGFuZWwsXG5cdFx0XHRcdFx0XHRpc01heGltaXplZDogdGhpcy5sYXlvdXRTZXJ2aWNlLmlzUGFuZWxNYXhpbWl6ZWQoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI6XG5cdFx0XHRcdFx0Ly8gQXV4aWxpYXJ5QmFyIGlzIG9uIHRoZSBvcHBvc2l0ZSBzaWRlIG9mIHRoZSBwcmltYXJ5IHNpZGViYXJcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bG9jYXRpb246IHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCA/IENoYXRXaWRnZXRMb2NhdGlvbi5TaWRlYmFyUmlnaHQgOiBDaGF0V2lkZ2V0TG9jYXRpb24uU2lkZWJhckxlZnQsXG5cdFx0XHRcdFx0XHRpc01heGltaXplZDogdGhpcy5sYXlvdXRTZXJ2aWNlLmlzQXV4aWxpYXJ5QmFyTWF4aW1pemVkKCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHQvLyBQcmltYXJ5IHNpZGViYXIgZm9sbG93cyBpdHMgY29uZmlndXJlZCBwb3NpdGlvblxuXHRcdFx0XHRcdC8vIE5vdGU6IFByaW1hcnkgc2lkZWJhciBjYW5ub3QgYmUgbWF4aW1pemVkLCBzbyBhbHdheXMgZmFsc2Vcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bG9jYXRpb246IHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCA/IENoYXRXaWRnZXRMb2NhdGlvbi5TaWRlYmFyTGVmdCA6IENoYXRXaWRnZXRMb2NhdGlvbi5TaWRlYmFyUmlnaHQsXG5cdFx0XHRcdFx0XHRpc01heGltaXplZDogZmFsc2UsXG5cdFx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayBmb3IgdW5rbm93biBjb250ZXh0c1xuXHRcdHJldHVybiB7IGxvY2F0aW9uOiBDaGF0V2lkZ2V0TG9jYXRpb24uRWRpdG9yLCBpc01heGltaXplZDogZmFsc2UgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFNjcm9sbGJhck9wdGlvbnMoKTogSUVkaXRvclNjcm9sbGJhck9wdGlvbnMge1xuXHRcdGNvbnN0IHNjcm9sbGJhciA9IHRoaXMuX2lucHV0RWRpdG9yLmdldFJhd09wdGlvbnMoKS5zY3JvbGxiYXIgPz8ge307XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnXG5cdFx0XHQ/IHsgLi4uc2Nyb2xsYmFyLCB2ZXJ0aWNhbDogJ2hpZGRlbicgfVxuXHRcdFx0OiB7IC4uLnNjcm9sbGJhciwgdmVydGljYWw6ICdhdXRvJywgdmVydGljYWxTY3JvbGxiYXJTaXplOiA3IH07XG5cdH1cblxuXHRwcml2YXRlIGdldFZpc2libGVTY3JvbGxiYXJPcHRpb25zKCk6IElFZGl0b3JTY3JvbGxiYXJPcHRpb25zIHtcblx0XHRjb25zdCBzY3JvbGxiYXIgPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRSYXdPcHRpb25zKCkuc2Nyb2xsYmFyID8/IHt9O1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0J1xuXHRcdFx0PyB7IC4uLnNjcm9sbGJhciwgdmVydGljYWw6ICdoaWRkZW4nIH1cblx0XHRcdDogeyAuLi5zY3JvbGxiYXIsIHZlcnRpY2FsOiAndmlzaWJsZScsIHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogNyB9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dEVkaXRvclNjcm9sbGJhck9wdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRzY3JvbGxiYXI6IHRoaXMuX2ZvcmNlVmlzaWJsZVNjcm9sbGJhclVudGlsQWNjZXB0XG5cdFx0XHRcdD8gdGhpcy5nZXRWaXNpYmxlU2Nyb2xsYmFyT3B0aW9ucygpXG5cdFx0XHRcdDogdGhpcy5nZXREZWZhdWx0U2Nyb2xsYmFyT3B0aW9ucygpXG5cdFx0fSk7XG5cdH1cblxuXHRzaG93U2Nyb2xsYmFyVW50aWxBY2NlcHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZm9yY2VWaXNpYmxlU2Nyb2xsYmFyVW50aWxBY2NlcHQgPSB0cnVlO1xuXHRcdHRoaXMudXBkYXRlSW5wdXRFZGl0b3JTY3JvbGxiYXJPcHRpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0U2Nyb2xsYmFyVmlzaWJpbGl0eUFmdGVyQWNjZXB0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZm9yY2VWaXNpYmxlU2Nyb2xsYmFyVW50aWxBY2NlcHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mb3JjZVZpc2libGVTY3JvbGxiYXJVbnRpbEFjY2VwdCA9IGZhbHNlO1xuXHRcdHRoaXMudXBkYXRlSW5wdXRFZGl0b3JTY3JvbGxiYXJPcHRpb25zKCk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBnZXRMYXN0UG9zaXRpb24obW9kZWw6IElUZXh0TW9kZWwpOiBJUG9zaXRpb24ge1xuXHRyZXR1cm4geyBsaW5lTnVtYmVyOiBtb2RlbC5nZXRMaW5lQ291bnQoKSwgY29sdW1uOiBtb2RlbC5nZXRMaW5lTGVuZ3RoKG1vZGVsLmdldExpbmVDb3VudCgpKSArIDEgfTtcbn1cblxuY29uc3QgY2hhdElucHV0RWRpdG9yQ29udGFpbmVyU2VsZWN0b3IgPSAnLmludGVyYWN0aXZlLWlucHV0LWVkaXRvcic7XG5zZXR1cFNpbXBsZUVkaXRvclNlbGVjdGlvblN0eWxpbmcoY2hhdElucHV0RWRpdG9yQ29udGFpbmVyU2VsZWN0b3IpO1xuXG50eXBlIENoYXRTZXNzaW9uUGlja2VyV2lkZ2V0ID0gQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtO1xuXG5jbGFzcyBDaGF0U2Vzc2lvblBpY2tlcnNDb250YWluZXJBY3Rpb25JdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aWRnZXRzOiBDaGF0U2Vzc2lvblBpY2tlcldpZGdldFtdLFxuXHRcdG9wdGlvbnM/OiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgb3B0aW9ucyA/PyB7fSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXNlc3Npb25QaWNrZXItY29udGFpbmVyJyk7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy53aWRnZXRzKSB7XG5cdFx0XHRjb25zdCBpdGVtQ29udGFpbmVyID0gZG9tLiQoJy5hY3Rpb24taXRlbS5jaGF0LXNlc3Npb25QaWNrZXItaXRlbScpO1xuXHRcdFx0d2lkZ2V0LnJlbmRlcihpdGVtQ29udGFpbmVyKTtcblx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChpdGVtQ29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMud2lkZ2V0cykge1xuXHRcdFx0d2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEhpZGRlbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoYWN0aW9uOiBJQWN0aW9uKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyx1QkFBOEM7QUFFdkQsU0FBUyxnQkFBZ0IsMEJBQWtEO0FBQzNFLFlBQVksVUFBVTtBQUN0QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtDQUFrQztBQUUzQyxTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsaUJBQWlCLHdCQUF3QjtBQUVsRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUVyQixTQUFTLFlBQVksZUFBZSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUN6RyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxpQkFBaUIsU0FBUyxhQUE2RCxxQkFBcUIsaUJBQWlCLG1CQUFtQjtBQUNsSyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7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QUFRLFdBQVcsQ0FBQyxDQUFDO0FBSGhCO0FBQUEsRUFJbEI7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFDN0MsY0FBVSxVQUFVLElBQUksOEJBQThCO0FBQ3RELGVBQVcsVUFBVSxLQUFLLFNBQVM7QUFDbEMsWUFBTSxnQkFBZ0IsSUFBSSxFQUFFLHNDQUFzQztBQUNsRSxhQUFPLE9BQU8sYUFBYTtBQUMzQixnQkFBVSxZQUFZLGFBQWE7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLGVBQVcsVUFBVSxLQUFLLFNBQVM7QUFDbEMsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFDQSxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFFQSxNQUFNLDZCQUE2QixtQkFBbUI7QUFBQSxFQUNyRCxZQUFZLFFBQWlCO0FBQzVCLFVBQU0sUUFBVyxNQUFNO0FBQUEsRUFDeEI7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFDN0MsVUFBTSxPQUFPLFNBQVM7QUFDdEIsY0FBVSxNQUFNLFVBQVU7QUFBQSxFQUMzQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJDaGF0V2lkZ2V0TG9jYXRpb24iLCAic2Vzc2lvblJlc291cmNlIiwgIm1vZGUiLCAibGFzdFJlcXVlc3QiLCAidHJhbnNhY3Rpb24iLCAib3B0aW9ucyIsICJkZWxlZ2F0ZSIsICJjb250YWluZXIiLCAid2lkZ2V0IiwgInRvcExldmVsSXNTZXNzaW9uTWVudSJdCn0K
