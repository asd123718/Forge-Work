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
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
import { registerEditorFeature } from "../../../../editor/common/editorFeatures.js";
import * as nls from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import "../../../../platform/agentHost/browser/agentHostEnablementService.js";
import "../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostMapLegacySettingsToManagedSettingsSettingId } from "../../../../platform/agentHost/common/agentHostManagedSettings.js";
import { AgentHostAutoReplyEnabledConfigKey, AgentHostEditAutoApprovePatternsConfigKey, AgentHostExternalSessionsMode, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostShowExternalSessionsConfigKey } from "../../../../platform/agentHost/common/agentHostSchema.js";
import "../../../../platform/agentHost/common/agentHostStarter.config.contribution.js";
import { AgentHostAhpJsonlLoggingSettingId, AgentHostAllowSignedOutWhenUsableSettingId, AgentHostSdkSandboxEnabledSettingId, AgentHostSdkSandboxWindowsEnabledSettingId, CodexPreferAgentHostEditorSettingId } from "../../../../platform/agentHost/common/agentService.js";
import { AgentHostCopilotModelCapabilityOverridesSettingId, AgentHostCopilotSdkLogLevelSettingId, AgentHostCustomTerminalToolEnabledSettingId, AgentHostOpus48PromptEnabledSettingId, AgentHostReasoningEffortOverrideSettingId, AgentHostReasoningSummaryEnabledSettingId, AgentHostToolSearchDeferThresholdSettingId, AgentHostToolSearchEnabledSettingId, copilotSdkLogLevelSettingValues } from "../../../../platform/agentHost/common/copilotCliConfig.js";
import { DEFAULT_EDIT_AUTO_APPROVE_PATTERNS, mergeChatEditAutoApprovePatterns } from "../../../../platform/chat/common/chatSettings.js";
import { reasoningEffortLevels } from "../../../../platform/agentHost/common/reasoningEffort.js";
import { ChatSessionArchiveActionWordingSettingId } from "../../../../platform/chat/common/sessionArchiveActions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL } from "../../../../platform/localTranscription/common/localTranscription.js";
import { McpAccessValue, McpAutoStartValue, mcpAccessConfig, mcpAllowedServersConfig, mcpAppsEnabledConfig, mcpAutoStartConfig, mcpDeniedServersConfig, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from "../../../../platform/mcp/common/mcpManagement.js";
import { AgentNetworkFilterService, IAgentNetworkFilterService } from "../../../../platform/networkFilter/common/networkFilterService.js";
import { AgentNetworkDomainSettingId } from "../../../../platform/networkFilter/common/settings.js";
import { COPILOT_ALLOWED_MCP_SERVERS_KEY, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY, COPILOT_DENIED_MCP_SERVERS_KEY, COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_MODEL_KEY, COPILOT_STRICT_MARKETPLACES_KEY, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY, COPILOT_TOP_LEVEL_MODEL_KEY, managedModelValue, managedSettingValue } from "../../../../platform/policy/common/copilotManagedSettings.js";
import product from "../../../../platform/product/common/product.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../platform/sandbox/common/settings.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions } from "../../../common/configuration.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AddConfigurationType, AssistedTypes } from "../../mcp/browser/mcpCommandsAddConfiguration.js";
import { McpCollisionBehavior, allDiscoverySources, discoverySourceSettingsLabel, mcpDiscoverySection, mcpEnterpriseManagedAuthIdpSection, mcpServerCollisionBehaviorSection, mcpServerSamplingSection } from "../../mcp/common/mcpConfiguration.js";
import { IChatVariablesService } from "../common/attachments/chatVariables.js";
import { IChatDebugService } from "../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../common/chatDebugServiceImpl.js";
import { ChatModeService, IChatModeService } from "../common/chatModes.js";
import { IChatService } from "../common/chatService/chatService.js";
import { ChatRequestOriginService, IChatRequestOriginService } from "../common/chatRequestOrigin.js";
import { ChatService } from "../common/chatService/chatServiceImpl.js";
import { IChatSessionsService } from "../common/chatSessionsService.js";
import { ChatSideChatService, IChatSideChatService } from "../common/chatSideChatService.js";
import { BYOKUtilityModelDefault, ChatAIDisabledSettingId, ChatAgentLocation, ChatConfiguration, ChatDefaultPermissionLevel, ChatNotificationMode, ChatPermissionLevel } from "../common/constants.js";
import { CodeMapperService, ICodeMapperService } from "../common/editing/chatCodeMapperService.js";
import { IChatEditingService } from "../common/editing/chatEditingService.js";
import { ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService } from "../common/ignoredFiles.js";
import { ILanguageModelsService, LanguageModelsService } from "../common/languageModels.js";
import { ILanguageModelStatsService, LanguageModelStatsService } from "../common/languageModelStats.js";
import { ChatTransferService, IChatTransferService } from "../common/model/chatTransferService.js";
import { ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from "../common/participants/chatAgents.js";
import { ChatSlashCommandService, IChatSlashCommandService } from "../common/participants/chatSlashCommands.js";
import { AgentPluginDiscoveryPriority, IAgentPluginService, agentPluginDiscoveryRegistry } from "../common/plugins/agentPluginService.js";
import { ChatPromptFilesExtensionPointHandler } from "../common/promptSyntax/chatPromptFilesContribution.js";
import { PromptsConfig, isTildePath } from "../common/promptSyntax/config/config.js";
import { AGENTS_SOURCE_FOLDER, AGENT_FILE_EXTENSION, CLAUDE_AGENTS_SOURCE_FOLDER, COPILOT_USER_AGENTS_SOURCE_FOLDER, DEFAULT_HOOK_FILE_PATHS, DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS, DEFAULT_SKILL_SOURCE_FOLDERS, INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION, SKILL_FILENAME } from "../common/promptSyntax/config/promptFileLocations.js";
import { HOOK_SCHEMA_URI, hookFileSchema } from "../common/promptSyntax/hookSchema.js";
import { AGENT_DOCUMENTATION_URL, AgentHostAgentDebugLogEnabledSettingId, AgentHostAgentDebugLogMaxEventsSettingId, HOOK_DOCUMENTATION_URL, INSTRUCTIONS_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, PromptFileSource, PromptsType, SKILL_DOCUMENTATION_URL } from "../common/promptSyntax/promptTypes.js";
import { IPromptsService } from "../common/promptSyntax/service/promptsService.js";
import { PromptsService } from "../common/promptSyntax/service/promptsServiceImpl.js";
import { ISessionRouter } from "../common/sessionRouter.js";
import { BuiltinToolsContribution } from "../common/tools/builtinTools/tools.js";
import { ChatArtifactsService, IChatArtifactsService } from "../common/tools/chatArtifactsService.js";
import { ChatTodoListService, IChatTodoListService } from "../common/tools/chatTodoListService.js";
import { ILanguageModelToolsConfirmationService } from "../common/tools/languageModelToolsConfirmationService.js";
import { LanguageModelToolsExtensionPointHandler } from "../common/tools/languageModelToolsContribution.js";
import { ILanguageModelToolsService } from "../common/tools/languageModelToolsService.js";
import { IVoiceChatService, VoiceChatService } from "../common/voiceChatService.js";
import "../common/widget/chatColors.js";
import { IChatLayoutService } from "../common/widget/chatLayoutService.js";
import { ChatResponseResourceFileSystemProvider, ChatResponseResourceWorkbenchContribution, IChatResponseResourceFileSystemProvider } from "../common/widget/chatResponseResourceFileSystemProvider.js";
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from "../common/widget/chatWidgetHistoryService.js";
import { registerChatAccessibilityActions } from "./actions/chatAccessibilityActions.js";
import { AgentChatAccessibilityHelp, ChatInputWindowAccessibilityHelp, EditsChatAccessibilityHelp, PanelChatAccessibilityHelp, QuickChatAccessibilityHelp } from "./actions/chatAccessibilityHelp.js";
import { ModeOpenChatGlobalAction, registerChatActions } from "./actions/chatActions.js";
import { ChatAgentRecommendation } from "./actions/chatAgentRecommendationActions.js";
import { CodeBlockActionRendering, registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from "./actions/chatCodeblockActions.js";
import { ChatContextContributions } from "./actions/chatContext.js";
import { registerChatContextActions } from "./actions/chatContextActions.js";
import { ChatCopyActionRendering, registerChatCopyActions } from "./actions/chatCopyActions.js";
import { registerChatDeveloperActions } from "./actions/chatDeveloperActions.js";
import { registerChatElicitationActions } from "./actions/chatElicitationActions.js";
import { registerChatExecuteActions } from "./actions/chatExecuteActions.js";
import { registerChatFileTreeActions } from "./actions/chatFileTreeActions.js";
import { registerChatFindActions } from "./actions/chatFindActions.js";
import { ChatGettingStartedContribution } from "./actions/chatGettingStarted.js";
import { registerChatExportActions } from "./actions/chatImportExport.js";
import { registerLanguageModelActions } from "./actions/chatLanguageModelActions.js";
import { registerMoveActions } from "./actions/chatMoveActions.js";
import { registerNewChatActions } from "./actions/chatNewActions.js";
import { registerChatOpenAgentDebugPanelAction } from "./actions/chatOpenAgentDebugPanelAction.js";
import { registerChatPluginActions } from "./actions/chatPluginActions.js";
import { registerChatPromptNavigationActions } from "./actions/chatPromptNavigationActions.js";
import { registerChatQueueActions } from "./actions/chatQueueActions.js";
import { registerQuickChatActions } from "./actions/chatQuickInputActions.js";
import { registerChatSpeechToTextActions } from "./actions/chatSpeechToTextActions.js";
import { registerChatTitleActions } from "./actions/chatTitleActions.js";
import { registerChatToolActions } from "./actions/chatToolActions.js";
import { ChatTransferContribution } from "./actions/chatTransfer.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID, registerConfigureSpeechInstructionsActions } from "./actions/configureVoiceInstructionsAction.js";
import "./agentSessions/agentSessions.contribution.js";
import { AgentHostChatDebugContribution } from "./chatDebug/agentHostChatDebugProvider.js";
import { ChatDebugEditor } from "./chatDebug/chatDebugEditor.js";
import { ChatDebugEditorInput, ChatDebugEditorInputSerializer } from "./chatDebug/chatDebugEditorInput.js";
import { ChatGoalSummaryService, IChatGoalSummaryService } from "./chatGoalSummaryService.js";
import { ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from "./chatSubmitRequestHandlerService.js";
import { PromptsDebugContribution } from "./promptsDebugContribution.js";
import { PromptLanguageFeaturesProvider } from "./promptSyntax/promptFileContributions.js";
import { SessionRouterService } from "./sessionRouter/sessionRouterService.js";
import { ChatSpeechToTextService, DictationSettingId, IChatSpeechToTextService } from "./speechToText/chatSpeechToTextService.js";
import "./telemetry/chatModelCountTelemetry.js";
import { ChatToolRiskAssessmentService, IChatToolRiskAssessmentService } from "./tools/chatToolRiskAssessmentService.js";
import { ClientToolSetsContribution } from "./tools/clientToolSetsContribution.js";
import { RenameToolContribution } from "./tools/renameTool.js";
import { UsagesToolContribution } from "./tools/usagesTool.js";
import "./voiceClient/micCaptureService.js";
import "./voiceClient/ttsPlaybackService.js";
import "./voiceClient/voiceClientService.js";
import "./voiceClient/voiceSessionController.js";
import "./voiceClient/voiceToolDispatchService.js";
import "./voiceInputMode/voiceInputMode.js";
import { ChatVoiceInputModeAction, ChatVoiceInputModeToggleListenAction, registerVoiceInputModeSimulateActions } from "./voiceInputMode/voiceInputModeActionViewItem.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { ChatAccessibilityService } from "./accessibility/chatAccessibilityService.js";
import "./aiCustomization/aiCustomizationItemsModel.js";
import "./aiCustomization/aiCustomizationManagement.contribution.js";
import "./aiCustomization/aiCustomizationWorkspaceService.js";
import "./aiCustomization/customizationHarnessService.js";
import "./attachments/chatAttachmentModel.js";
import { ChatAttachmentResolveService, IChatAttachmentResolveService } from "./attachments/chatAttachmentResolveService.js";
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from "./attachments/chatAttachmentWidgetRegistry.js";
import { ChatContextPickService, IChatContextPickService } from "./attachments/chatContextPickService.js";
import { ChatReferenceAttachmentWidgetContribution } from "./attachments/chatReferenceAttachmentWidget.contribution.js";
import { TranscriptContextAttachmentWidgetContribution } from "./attachments/transcriptContextAttachmentWidget.contribution.js";
import { ChatViewId, IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatPasteTargetService, IChatWidgetService, IQuickChatService, isIChatResourceViewContext, isIChatViewViewContext } from "./chat.js";
import { ChatEditingEditorAccessibility } from "./chatEditing/chatEditingEditorAccessibility.js";
import { registerChatEditorActions } from "./chatEditing/chatEditingEditorActions.js";
import { ChatEditingEditorContextKeys } from "./chatEditing/chatEditingEditorContextKeys.js";
import { ChatEditingEditorOverlay } from "./chatEditing/chatEditingEditorOverlay.js";
import { ChatEditingService } from "./chatEditing/chatEditingServiceImpl.js";
import { ChatEditingNotebookFileSystemProviderContrib } from "./chatEditing/notebook/chatEditingNotebookFileSystemProvider.js";
import "./chatManagement/chatManagement.contribution.js";
import { ChatOutlineCreator } from "./chatOutlineCreator.js";
import { ChatLanguageModelsDataContribution, LanguageModelsConfigurationService } from "./languageModelsConfigurationService.js";
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from "./widget/chatContentParts/chatMarkdownAnchorService.js";
import { ChatLayoutService } from "./widget/chatLayoutService.js";
import "./widget/input/chatInputNoticeHub.js";
import "./widget/input/chatInputNotificationService.js";
import { ChatInputBoxContentProvider } from "./widget/input/editor/chatEditorInputContentProvider.js";
import { ChatEditor } from "./widgetHosts/editor/chatEditor.js";
import { ChatEditorInput, ChatEditorInputSerializer } from "./widgetHosts/editor/chatEditorInput.js";
import { ILanguageModelsConfigurationService } from "../common/languageModelsConfiguration.js";
import { IAgentPluginRepositoryService } from "../common/plugins/agentPluginRepositoryService.js";
import { AgentPluginService, ConfiguredAgentPluginDiscovery, CopilotCliAgentPluginDiscovery, ExtensionAgentPluginDiscovery, MarketplaceAgentPluginDiscovery } from "../common/plugins/agentPluginServiceImpl.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
import { IPluginInstallService } from "../common/plugins/pluginInstallService.js";
import { IPluginMarketplaceService, PluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
import { IWorkspacePluginSettingsService, WorkspacePluginSettingsService } from "../common/plugins/workspacePluginSettingsService.js";
import { VALID_PROMPT_FOLDER_PATTERN } from "../common/promptSyntax/utils/promptFilesLocator.js";
import { IToolResultCompressor } from "../common/tools/toolResultCompressor.js";
import { ChatResponseAccessibleView } from "./accessibility/chatResponseAccessibleView.js";
import { ChatTerminalOutputAccessibleView } from "./accessibility/chatTerminalOutputAccessibleView.js";
import { AgentPluginCommandsContribution } from "./agentPluginCommands.js";
import { AgentPluginEditor } from "./agentPluginEditor/agentPluginEditor.js";
import { AgentPluginEditorInput } from "./agentPluginEditor/agentPluginEditorInput.js";
import { AgentPluginRepositoryService } from "./agentPluginRepositoryService.js";
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from "./agentSessions/agentHost/agentHostImportConversationStore.js";
import { ChatDynamicVariableModel } from "./attachments/chatDynamicVariables.js";
import { ChatImplicitContextContribution } from "./attachments/chatImplicitContext.js";
import { ChatPasteTargetService } from "./attachments/chatPasteTargetService.js";
import { ChatVariablesService } from "./attachments/chatVariables.js";
import { ChatImageCarouselService, IChatImageCarouselService } from "./chatImageCarouselService.js";
import { ChatOutputRendererService, IChatOutputRendererService } from "./chatOutputItemRenderer.js";
import { ChatCompatibilityNotifier, ChatExtensionPointHandler } from "./chatParticipant.contribution.js";
import { ChatPetService, IChatPetService } from "./chatPetService.js";
import { ChatPromoNotificationContribution } from "./chatPromoNotification.js";
import { ChatQuotaNotificationContribution } from "./chatQuotaNotification.js";
import { ChatRepoInfoContribution } from "./chatRepoInfo.js";
import { ChatSetupContribution, ChatTeardownContribution } from "./chatSetup/chatSetupContributions.js";
import { ChatSessionOptionSlashCommandsContribution, ChatSlashCommandsContribution } from "./chatSlashCommands.js";
import { ChatStatusBarEntry } from "./chatStatus/chatStatusEntry.js";
import { ChatTipService, IChatTipService } from "./chatTipService.js";
import { ChatWindowNotifier } from "./chatWindowNotifier.js";
import { AgentPluginRecommendations } from "./claudePluginRecommendations.js";
import { ChatCodeBlockContextProviderService } from "./codeBlockContextProviderService.js";
import { ExploreAgentDefaultModel } from "./exploreAgentDefaultModel.js";
import { HasByokModelsContribution } from "./hasByokModelsContribution.js";
import { PlanAgentDefaultModel } from "./planAgentDefaultModel.js";
import "./planReviewFeedback/planReviewFeedbackEditorOverlay.js";
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from "./planReviewFeedback/planReviewFeedbackService.js";
import { PluginAutoUpdate } from "./pluginAutoUpdate.js";
import { BrowserPluginGitCommandService } from "./pluginGitCommandService.js";
import { PluginInstallService } from "./pluginInstallService.js";
import { PluginUrlHandler } from "./pluginUrlHandler.js";
import "./promptSyntax/promptCodingAgentActionContribution.js";
import "./promptSyntax/promptToolsCodeLensProvider.js";
import "./promptSyntax/promptToolSetsCodeLensProvider.js";
import { PromptUrlHandler } from "./promptSyntax/promptUrlHandler.js";
import "./promptTimeline/promptTimeline.contribution.js";
import { LanguageModelToolsConfirmationService } from "./tools/languageModelToolsConfirmationService.js";
import { LanguageModelToolsService, globalAutoApproveDescription } from "./tools/languageModelToolsService.js";
import { ToolResultCompressorService } from "./tools/toolResultCompressorService.js";
import { ConfigureToolSets, UserToolSetsContributions } from "./tools/toolSetsContribution.js";
import { UtilityModelContribution, UtilitySmallModelContribution } from "./utilityModelContribution.js";
import { ChatViewsWelcomeHandler } from "./viewsWelcome/chatViewsWelcomeHandler.js";
import "./widget/chatContentParts/chatSubagentOpenChat.js";
import { ChatFindAccessibilityHelp } from "./widget/chatFind/chatFindAccessibilityHelp.js";
import { ChatWidget } from "./widget/chatWidget.js";
import { ChatWidgetService } from "./widget/chatWidgetService.js";
import { ChatQueuePickerRendering } from "./widget/input/chatQueuePickerActionItem.js";
import "./widget/input/editor/agentHostInputCompletions.js";
import "./widget/input/editor/chatInputCommandArgumentHint.js";
import "./widget/input/editor/chatInputCompletions.js";
import "./widget/input/editor/chatInputEditorContrib.js";
import "./widget/input/editor/chatInputEditorHover.js";
import { ChatPasteProvidersFeature } from "./widget/input/editor/chatPasteProviders.js";
import { QuickChatService } from "./widgetHosts/chatQuick.js";
CommandsRegistry.registerCommand("_chat.notifyQuestionCarouselAnswer", (accessor, resolveId, answers) => {
  accessor.get(IChatService).notifyQuestionCarouselAnswer("", resolveId, answers);
});
const toolReferenceNameEnumValues = [];
const toolReferenceNameEnumDescriptions = [];
const jsonContributionRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonContributionRegistry.registerSchema(HOOK_SCHEMA_URI, hookFileSchema);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "chatSidebar",
  title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
  type: "object",
  properties: {
    "chat.experimentalSessionsWindowOverride": {
      type: "boolean",
      description: nls.localize("chat.experimentalSessionsWindowOverride", "When true, enables sessions-window-specific behavior for extensions."),
      default: false,
      tags: ["experimental"],
      agentsWindow: { default: true }
    },
    "chat.omni.enabled": {
      type: "boolean",
      markdownDescription: nls.localize("chat.omni.enabled", "Enables the floating chat input window and its entry points. Requests submitted from the window are scored against existing agent sessions and routed with an advisory badge."),
      default: false,
      tags: ["experimental"]
    },
    "chat.fontSize": {
      type: "number",
      description: nls.localize("chat.fontSize", "Controls the font size in pixels in chat messages."),
      default: 13,
      minimum: 6,
      maximum: 100
    },
    "chat.fontFamily": {
      type: "string",
      description: nls.localize("chat.fontFamily", "Controls the font family in chat messages."),
      default: "default"
    },
    "dictation.enabled": {
      type: "boolean",
      markdownDescription: nls.localize("dictation.enabled", "Enables dictation across the product (chat input, editor, and terminal). When enabled on a supported platform, a microphone button appears in the chat input and the dictation shortcut becomes available; the on-device transcription model is downloaded on first use and runs locally."),
      default: true,
      tags: ["experimental"],
      policy: {
        name: "DictationEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.131",
        localization: {
          description: {
            key: "dictation.enabled.policy",
            value: nls.localize("dictation.enabled.policy", "Controls whether dictation is available across the product (chat input, editor, and terminal).")
          }
        }
      }
    },
    "dictation.model": {
      type: "string",
      enum: [
        DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
        "mai"
      ],
      enumItemLabels: [
        nls.localize("dictation.model.nemotronMultilingual.label", "Nemotron 3.5 ASR (Multilingual) \u2014 On-Device"),
        nls.localize("dictation.model.mai.label", "MAI \u2014 Cloud")
      ],
      markdownEnumDescriptions: [
        nls.localize("dictation.model.nemotronMultilingual", "NVIDIA Nemotron 3.5 multilingual streaming RNN-T, run on-device through Microsoft Foundry Local. Works offline; no audio leaves the device. Automatic language selection follows the Voice Mode language setting; when that setting is Automatic, dictation uses the configured display language when supported, then the system or browser locale, with model detection as a fallback. Downloaded on first use and cached on disk."),
        nls.localize("dictation.model.mai", "Cloud transcription through the same Microsoft AI voice service used by Voice Mode. Requires a network connection and GitHub sign-in; audio is streamed to the service.")
      ],
      markdownDescription: nls.localize("dictation.model", "The model used for dictation. On-device models download on first use and run locally through Microsoft Foundry Local; the cloud option streams audio to the Microsoft AI voice service."),
      default: DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
      tags: ["experimental"],
      experiment: { mode: "auto" }
    },
    [DictationSettingId.ShowTranscript]: {
      type: "boolean",
      markdownDescription: nls.localize("dictation.showTranscript", "Controls whether the transcript is shown while dictating. The final transcript is inserted when dictation ends."),
      default: true,
      tags: ["experimental"]
    },
    [DictationSettingId.ShowButton]: {
      type: "boolean",
      markdownDescription: nls.localize("dictation.showButton", "Controls whether the dictation microphone button is shown in the chat input. When hidden, dictation can still be started with its keyboard shortcut."),
      default: true,
      tags: ["experimental"]
    },
    "dictation.experimental.llmCleanup": {
      type: "boolean",
      markdownDescription: nls.localize("dictation.experimental.llmCleanup", "Experimental: when dictation ends, the final transcript is passed through a small language model to restore punctuation, capitalization, paragraphs, and lists. Requires Copilot to be enabled; the transcript is sent to the language model for cleanup. Falls back to the raw transcript when no model is available. Use [dictation instructions](command:{0}) to customize terminology and formatting.", CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID),
      default: true,
      tags: ["experimental"]
    },
    "chat.editor.fontSize": {
      type: "number",
      description: nls.localize("interactiveSession.editor.fontSize", "Controls the font size in pixels in chat codeblocks."),
      default: isMacintosh ? 12 : 14
    },
    "chat.editor.fontFamily": {
      type: "string",
      description: nls.localize("interactiveSession.editor.fontFamily", "Controls the font family in chat codeblocks."),
      default: "default"
    },
    "chat.editor.fontWeight": {
      type: "string",
      description: nls.localize("interactiveSession.editor.fontWeight", "Controls the font weight in chat codeblocks."),
      default: "default"
    },
    "chat.editor.wordWrap": {
      type: "string",
      description: nls.localize("interactiveSession.editor.wordWrap", "Controls whether lines should wrap in chat codeblocks."),
      default: "off",
      enum: ["on", "off"]
    },
    "chat.editor.lineHeight": {
      type: "number",
      description: nls.localize("interactiveSession.editor.lineHeight", "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
      default: 0
    },
    [ChatConfiguration.AgentStatusEnabled]: {
      type: "string",
      enum: ["hidden", "badge", "compact"],
      enumDescriptions: [
        nls.localize("chat.agentsControl.hidden", "The agent status indicator is hidden from the title bar."),
        nls.localize("chat.agentsControl.badge", "Shows the agent status as a badge next to the command center."),
        nls.localize("chat.agentsControl.compact", "Replaces the command center search box with a compact agent status indicator and unified chat widget.")
      ],
      markdownDescription: nls.localize("chat.agentsControl.enabled", "Controls how the 'Agent Status' indicator appears in the title bar command center. When set to `hidden`, the indicator is not shown. Other values show the indicator and automatically enable {0}. The unread and in-progress session indicators require {1} to be enabled.", "`#window.commandCenter#`", "`#chat.viewSessions.enabled#`"),
      default: "compact",
      tags: ["experimental"]
    },
    [ChatConfiguration.UnifiedAgentsBar]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.unifiedAgentsBar.enabled", "Replaces the command center search box with a unified chat and search widget."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.AgentSessionProjectionEnabled]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentSessionProjection.enabled", "Controls whether Agent Session Projection mode is enabled for reviewing agent sessions in a focused workspace."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.MigrateLegacyCopilotCliSessions]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentSessions.migrateLegacyCopilotCli", "Controls whether legacy extension host Copilot CLI chat sessions are migrated in place to the Agent host when opened, so their history becomes editable. When disabled, legacy sessions open as before."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "startup"
      },
      agentHost: { key: AgentHostMigrateLegacyCopilotCliEnabledConfigKey }
    },
    [ChatConfiguration.ShowExternalAgentSessions]: {
      type: "string",
      enum: [AgentHostExternalSessionsMode.None, AgentHostExternalSessionsMode.All, AgentHostExternalSessionsMode.Last24Hours, AgentHostExternalSessionsMode.Last7Days],
      enumDescriptions: [
        nls.localize("chat.agentSessions.showExternal.none", "Only shows sessions created by the Agent Host."),
        nls.localize("chat.agentSessions.showExternal.all", "Shows all sessions discovered from supported external agent applications."),
        nls.localize("chat.agentSessions.showExternal.last24Hours", "Shows external sessions updated in the last 24 hours."),
        nls.localize("chat.agentSessions.showExternal.last7Days", "Shows external sessions updated in the last 7 days.")
      ],
      default: AgentHostExternalSessionsMode.Last7Days,
      markdownDescription: nls.localize("chat.agentSessions.showExternal", "Controls which external agent sessions, created outside VS Code's Agent Host, are shown."),
      agentHost: { key: AgentHostShowExternalSessionsConfigKey }
    },
    [ChatConfiguration.SaveBeforeSend]: {
      type: "boolean",
      description: nls.localize("chat.saveBeforeSend", "Controls whether all dirty editors except untitled editors are saved before sending a chat message."),
      default: true
    },
    "chat.implicitContext.enabled": {
      type: "object",
      description: nls.localize("chat.implicitContext.enabled.1", "Enables automatically using the active editor as chat context for specified chat locations."),
      additionalProperties: {
        type: "string",
        enum: ["never", "first", "always"],
        description: nls.localize("chat.implicitContext.value", "The value for the implicit context."),
        enumDescriptions: [
          nls.localize("chat.implicitContext.value.never", "Implicit context is never enabled."),
          nls.localize("chat.implicitContext.value.first", "Implicit context is enabled for the first interaction."),
          nls.localize("chat.implicitContext.value.always", "Implicit context is always enabled.")
        ]
      },
      default: {
        "panel": "always"
      },
      tags: ["experimental"],
      experiment: {
        mode: "startup"
      },
      agentsWindow: { default: { "panel": "never" } }
    },
    "chat.implicitContext.suggestedContext": {
      type: "boolean",
      markdownDescription: nls.localize("chat.implicitContext.suggestedContext", "Controls whether the new implicit context flow is shown. In Ask and Edit modes, the context will automatically be included. When using an agent, context will be suggested as an attachment. Selections are always included as context."),
      default: true,
      agentsWindow: { default: false }
    },
    "chat.implicitContext.includeActiveEditor": {
      type: "boolean",
      markdownDescription: nls.localize("chat.implicitContext.includeActiveEditor", "When enabled, the active editor is automatically forwarded as context, even when it would otherwise only be suggested. Selections and explicitly attached files are always included regardless of this setting.\n\nNote: this setting currently only applies to Agent Host sessions (such as Copilot)."),
      default: true,
      tags: ["experimental"],
      agentsWindow: { default: false }
    },
    "chat.editing.autoAcceptDelay": {
      type: "number",
      markdownDescription: nls.localize("chat.editing.autoAcceptDelay", "Delay after which changes made by chat are automatically accepted. Values are in seconds, `0` means disabled and `100` seconds is the maximum."),
      default: 0,
      minimum: 0,
      maximum: 100
    },
    "chat.editing.confirmEditRequestRemoval": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: nls.localize("chat.editing.confirmEditRequestRemoval", "Whether to show a confirmation before removing a request and its associated edits."),
      default: true
    },
    "chat.editing.confirmEditRequestRetry": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: nls.localize("chat.editing.confirmEditRequestRetry", "Whether to show a confirmation before retrying a request and its associated edits."),
      default: true
    },
    "chat.editing.explainChanges.enabled": {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.explainChanges.enabled", "Controls whether the Explain button in the Chat panel and the Explain Changes context menu in the SCM view are shown. This is an experimental feature."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.RevealNextChangeOnResolve]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.revealNextChangeOnResolve", "Controls whether the editor automatically reveals the next change after keeping or undoing a chat edit."),
      default: true
    },
    [ChatConfiguration.OpenChangedFileInDiffEditor]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.openChangedFileInDiffEditor", "Controls whether selecting a file in the changed files list of a chat response opens it in a diff editor showing the changes made by chat, or in a regular editor. Holding `kbstyle(Alt)` while selecting the file opens it with the opposite behavior."),
      default: true
    },
    "chat.tips.enabled": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      description: nls.localize("chat.tips.enabled", "Controls whether tips are shown above user messages in chat. New tips are added frequently, so this is a helpful way to stay up to date with the latest features."),
      default: true
    },
    "chat.upvoteAnimation": {
      type: "string",
      enum: ["off", "confetti", "floatingThumbs", "pulseWave", "radiantLines"],
      enumDescriptions: [
        nls.localize("chat.upvoteAnimation.off", "No animation is shown."),
        nls.localize("chat.upvoteAnimation.confetti", "Shows a confetti burst animation around the thumbs up button."),
        nls.localize("chat.upvoteAnimation.floatingThumbs", "Shows floating thumbs up icons rising from the button."),
        nls.localize("chat.upvoteAnimation.pulseWave", "Shows expanding pulse rings from the button."),
        nls.localize("chat.upvoteAnimation.radiantLines", "Shows radiant lines emanating from the button.")
      ],
      description: nls.localize("chat.upvoteAnimation", "Controls whether an animation is shown when clicking the thumbs up button on a chat response."),
      default: "floatingThumbs"
    },
    "chat.experimental.detectParticipant.enabled": {
      type: "boolean",
      deprecationMessage: nls.localize("chat.experimental.detectParticipant.enabled.deprecated", "This setting is deprecated. Please use `chat.detectParticipant.enabled` instead."),
      description: nls.localize("chat.experimental.detectParticipant.enabled", "Enables chat participant autodetection for panel chat."),
      default: null
    },
    [ChatConfiguration.IncrementalRendering]: {
      type: "boolean",
      description: nls.localize("chat.experimental.incrementalRendering.enabled", "Enables incremental rendering with optional block-level animation when streaming chat responses."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.RichLinks]: {
      type: "boolean",
      description: nls.localize("chat.experimental.richLinks.enabled", "Controls whether supported links in chat are rendered as rich links with live metadata. Enabling this may make authenticated requests to services such as GitHub."),
      default: false,
      tags: ["experimental"],
      experiment: { mode: "auto" }
    },
    [ChatConfiguration.IncrementalRenderingStyle]: {
      type: "string",
      enum: ["none", "fade", "rise", "blur", "scale", "slide", "reveal"],
      enumDescriptions: [
        nls.localize("chat.experimental.incrementalRendering.animationStyle.none", "No animation. Content appears instantly."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.fade", "Simple opacity fade from 0 to 1."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.rise", "Content fades in while rising upward."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.blur", "Content fades in from a blurred state."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.scale", "Content scales up from slightly smaller."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.slide", "Content slides in from the left."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.reveal", "Content reveals top-to-bottom with a soft gradient edge.")
      ],
      description: nls.localize("chat.experimental.incrementalRendering.animationStyle", "Controls the animation style for incremental rendering."),
      default: "fade",
      tags: ["experimental"]
    },
    [ChatConfiguration.IncrementalRenderingBuffering]: {
      type: "string",
      enum: ["off", "word", "paragraph"],
      enumDescriptions: [
        nls.localize("chat.experimental.incrementalRendering.buffering.off", "Renders content immediately as tokens arrive."),
        nls.localize("chat.experimental.incrementalRendering.buffering.word", "Reveals content word by word."),
        nls.localize("chat.experimental.incrementalRendering.buffering.paragraph", "Buffers content until a paragraph break before rendering.")
      ],
      description: nls.localize("chat.experimental.incrementalRendering.buffering", "Controls how content is buffered before rendering during incremental rendering. Lower buffering levels render faster but may show incomplete sentences or partially formed markdown."),
      default: "word",
      tags: ["experimental"]
    },
    [ChatConfiguration.CollapseCompletedResponses]: {
      type: "boolean",
      description: nls.localize("chat.agent.collapseCompletedResponses", "Controls whether completed chat responses collapse intermediate work while keeping the final response visible."),
      default: product.quality !== "stable"
    },
    "chat.detectParticipant.enabled": {
      type: "boolean",
      description: nls.localize("chat.detectParticipant.enabled", "Enables chat participant autodetection for panel chat."),
      default: true
    },
    [ChatConfiguration.InlineReferencesStyle]: {
      type: "string",
      enum: ["box", "link"],
      enumDescriptions: [
        nls.localize("chat.inlineReferences.style.box", "Display file and symbol references as boxed widgets with icons."),
        nls.localize("chat.inlineReferences.style.link", "Display file and symbol references as simple blue links without icons.")
      ],
      description: nls.localize("chat.inlineReferences.style", "Controls how file and symbol references are displayed in chat messages."),
      default: "box"
    },
    [ChatConfiguration.EditorAssociations]: {
      type: "object",
      markdownDescription: nls.localize("chat.editorAssociations", 'Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors for opening files from chat (for example `"*.md": "vscode.markdown.preview.editor"`).'),
      additionalProperties: {
        type: "string"
      },
      default: {}
    },
    [ChatConfiguration.NotifyWindowOnConfirmation]: {
      type: "string",
      enum: ["off", "windowNotFocused", "always"],
      enumDescriptions: [
        nls.localize("chat.notifyWindowOnConfirmation.off", "Never show OS notifications for confirmations."),
        nls.localize("chat.notifyWindowOnConfirmation.windowNotFocused", "Show OS notifications for confirmations when the window is not focused."),
        nls.localize("chat.notifyWindowOnConfirmation.always", "Always show OS notifications for confirmations, even when the window is focused.")
      ],
      description: nls.localize("chat.notifyWindowOnConfirmation", "Controls whether a chat session should present the user with an OS notification when a confirmation or question needs input. This includes a window badge as well as notification toast."),
      default: "windowNotFocused"
    },
    [ChatConfiguration.AutoReply]: {
      default: false,
      markdownDescription: nls.localize("chat.autoReply.description", "Automatically skip question carousels by telling the agent that the user is not available and to use its best judgment. This is an advanced setting and can lead to unintended choices or actions based on incomplete context."),
      type: "boolean",
      scope: ConfigurationScope.APPLICATION_MACHINE,
      tags: ["experimental", "advanced"],
      agentHost: { key: AgentHostAutoReplyEnabledConfigKey }
    },
    [ChatConfiguration.AutopilotAdvancedEnabled]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.autopilot.advanced.enabled", "Enables **Advanced Autopilot**, a single switch that turns on all advanced Autopilot behaviors that delegate more of the loop to the agent. Currently, after each Autopilot turn a small, fast model evaluates whether your original request is complete; if not, Autopilot keeps working using that evaluation as guidance for the next turn, instead of relying on the agent to signal completion itself."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.DefaultPermissionLevel]: {
      type: "string",
      enum: [ChatPermissionLevel.Default, ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot],
      enumItemLabels: [
        nls.localize("chat.permissions.default.default.label", "Default Permissions"),
        nls.localize("chat.permissions.default.autoApprove.label", "Bypass Approvals"),
        nls.localize("chat.permissions.default.autopilot.label", "Autopilot (Preview)")
      ],
      enumDescriptions: [
        nls.localize("chat.permissions.default.default.description", "Start new chat sessions with Default Permissions."),
        nls.localize("chat.permissions.default.autoApprove.description", "Start new chat sessions in Bypass Approvals mode."),
        nls.localize("chat.permissions.default.autopilot.description", "Start new chat sessions in Autopilot mode.")
      ],
      description: nls.localize("chat.permissions.default.settingDescription", "Controls the default permissions picker mode for new local chat sessions. You can still change the permission mode per session, and each session remembers the permission mode that was used. If enterprise policy disables auto approval, new sessions use Default Permissions."),
      default: ChatPermissionLevel.Default
    },
    [ChatConfiguration.AssistedPermissionsEnabled]: {
      type: "boolean",
      default: product.quality !== "stable",
      description: nls.localize("chat.assistedPermissions.enabled", "Controls whether Assisted permissions is shown in Agent Host approval pickers."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.PermissionsSandboxToggleEnabled]: {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("chat.experimental.permissionsSandboxToggle.enabled", 'Controls whether the permissions picker shows an inline "Sandboxing for terminal" toggle on the Manual permissions option. For Copilot SDK sessions using the built-in shell tool, the toggle reflects and updates `#chat.agentHost.sdkSandbox.enabled#` or `#chat.agentHost.sdkSandbox.enabledWindows#`.'),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.DefaultConfiguration]: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["interactive", "plan", "autopilot"],
          enumDescriptions: [
            nls.localize("chat.defaultConfiguration.mode.interactive", "Interactive \u2014 step-by-step collaboration."),
            nls.localize("chat.defaultConfiguration.mode.plan", "Plan \u2014 plan first, execute when ready."),
            nls.localize("chat.defaultConfiguration.mode.autopilot", "Autopilot \u2014 autonomously iterate from start to finish.")
          ],
          default: "interactive",
          description: nls.localize("chat.defaultConfiguration.mode.description", "The starting mode for new agent sessions.")
        },
        approvals: {
          type: "string",
          enum: [ChatDefaultPermissionLevel.Manual, ChatDefaultPermissionLevel.Assisted, ChatDefaultPermissionLevel.AllowAll],
          enumDescriptions: [
            nls.localize("chat.defaultConfiguration.approvals.manual", "Manual permissions \u2014 asks when approval settings don't apply."),
            nls.localize("chat.defaultConfiguration.approvals.assisted", "Assisted permissions \u2014 evaluates risk before running tools."),
            nls.localize("chat.defaultConfiguration.approvals.allowAll", "Allow All \u2014 runs tool calls without asking.")
          ],
          default: ChatDefaultPermissionLevel.Manual,
          description: nls.localize("chat.defaultConfiguration.approvals.description", "The starting approval behavior for new agent sessions. If enterprise policy disables auto approval, new sessions use Manual permissions.")
        }
      },
      default: { mode: "interactive", approvals: ChatDefaultPermissionLevel.Manual },
      markdownDescription: nls.localize("chat.defaultConfiguration.settingDescription", "Controls the default configuration for new agent sessions (such as Copilot). You can still change the mode and approval behavior per session, and each session remembers what was used.")
    },
    [ChatConfiguration.DefaultModel]: {
      type: "string",
      default: "",
      markdownDescription: nls.localize("chat.defaultModel.description", 'The default model for new chat conversations. Use "auto" to let Copilot pick a model, a model family name (such as "opus" or "gemini") to use the latest available model in that family, or a full model id. You can still switch the model within a conversation; each new conversation starts at this model.'),
      experiment: {
        mode: "auto"
      },
      policy: {
        name: "ChatDefaultModel",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedModelValue(),
        managedSettings: {
          [COPILOT_MODEL_KEY]: { type: "string" },
          [COPILOT_TOP_LEVEL_MODEL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.defaultModel.policy",
            value: nls.localize("chat.defaultModel.policy", 'Sets the default chat model for new conversations. Accepts "auto", a model family name (such as "opus" or "gemini"), or a full model id. Users can still switch the model within a conversation.')
          }
        }
      }
    },
    [ChatConfiguration.GlobalAutoApprove]: {
      default: false,
      markdownDescription: globalAutoApproveDescription.value,
      type: "boolean",
      scope: ConfigurationScope.APPLICATION_MACHINE,
      tags: ["experimental"],
      agentHost: { key: AgentHostGlobalAutoApproveEnabledConfigKey },
      policy: {
        name: "ChatToolsAutoApprove",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" || policyData.chat_preview_features_enabled === false ? false : void 0,
        managedSettings: {
          [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "autoApprove3.description",
            value: nls.localize("autoApprove3.description", 'Global auto approve also known as "YOLO mode" disables manual approval completely for all tools in all workspaces, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like Codespaces and Dev Containers have user keys forwarded into the container that could be compromised.\n\nThis feature disables critical security protections and makes it much easier for an attacker to compromise the machine.\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the `#chat.autoReply#` setting.')
          }
        }
      }
    },
    [ChatConfiguration.SessionSyncEnabled]: {
      default: false,
      markdownDescription: nls.localize("chat.sessionSync.enabled", "Enable session sync to GitHub.com. When enabled, Copilot session data is synced to your GitHub account for cross-device access and richer insights. Requires `#github.copilot.chat.localIndex.enabled#` to also be enabled."),
      type: "boolean",
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      },
      policy: {
        name: "CopilotSessionSync",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.121",
        value: (policyData) => policyData.cloud_session_storage_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.sessionSync.enabled.policy",
            value: nls.localize("chat.sessionSync.enabled.policy", "Enable session sync to GitHub.com for cross-device Copilot session history. When disabled by organization policy, session data is kept local only.")
          }
        }
      },
      agentHost: { key: AgentHostSessionSyncEnabledConfigKey }
    },
    [ChatConfiguration.SessionSyncExcludeRepositories]: {
      type: "array",
      items: { type: "string" },
      default: [],
      markdownDescription: nls.localize("chat.sessionSync.excludeRepositories", "Repository patterns to exclude from session sync. Use exact `owner/repo` names or glob patterns like `my-org/*`. Sessions from matching repositories will only be stored locally."),
      tags: ["experimental", "advanced"]
    },
    [ChatConfiguration.AutoApproveEdits]: {
      default: DEFAULT_EDIT_AUTO_APPROVE_PATTERNS,
      markdownDescription: nls.localize("chat.tools.autoApprove.edits", "Controls whether edits made by the agent are automatically approved. The default is to approve all edits except those made to certain files which have the potential to cause immediate unintended side-effects, such as `**/.vscode/*.json`.\n\nSet to `true` to automatically approve edits to matching files, `false` to always require explicit approval. The last pattern matching a given file will determine whether the edit is automatically approved."),
      type: "object",
      additionalProperties: {
        type: "boolean"
      },
      scope: ConfigurationScope.APPLICATION,
      agentHost: {
        key: AgentHostEditAutoApprovePatternsConfigKey,
        transform: mergeChatEditAutoApprovePatterns
      }
    },
    [ChatConfiguration.AutoApprovedUrls]: {
      default: {
        "https://code.visualstudio.com": true,
        "https://github.com/microsoft/vscode/wiki/*": true
      },
      markdownDescription: nls.localize("chat.tools.fetchPage.approvedUrls", 'Controls which URLs are automatically approved when requested by chat tools. Keys are URL patterns and values can be `true` to approve both requests and responses, `false` to deny, or an object with `approveRequest` and `approveResponse` properties for granular control.\n\nExamples:\n- `"https://example.com": true` - Approve all requests to example.com\n- `"https://*.example.com": true` - Approve all requests to any subdomain of example.com\n- `"https://example.com/api/*": { "approveRequest": true, "approveResponse": false }` - Approve requests but not responses for example.com/api paths'),
      type: "object",
      additionalProperties: {
        oneOf: [
          { type: "boolean" },
          {
            type: "object",
            properties: {
              approveRequest: { type: "boolean" },
              approveResponse: { type: "boolean" }
            }
          }
        ]
      }
    },
    [ChatConfiguration.EligibleForAutoApproval]: {
      default: {},
      markdownDescription: nls.localize("chat.tools.eligibleForAutoApproval", "Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options."),
      type: "object",
      propertyNames: {
        enum: toolReferenceNameEnumValues,
        enumDescriptions: toolReferenceNameEnumDescriptions
      },
      additionalProperties: {
        type: "boolean"
      },
      examples: [
        {
          "fetch": false,
          "runTask": false
        }
      ],
      policy: {
        name: "ChatToolsEligibleForAutoApproval",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.107",
        localization: {
          description: {
            key: "chat.tools.eligibleForAutoApproval",
            value: nls.localize("chat.tools.eligibleForAutoApproval", "Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options.")
          }
        }
      }
    },
    [ChatConfiguration.ArtifactsEnabled]: {
      default: false,
      description: nls.localize("chat.artifacts.enabled", "Controls whether the artifacts view is available in chat."),
      type: "boolean",
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByMimeType]: {
      default: {
        "image/*": { groupName: "Screenshots", onlyShowGroup: true }
      },
      description: nls.localize("chat.artifacts.rules.byMimeType", "Rules for extracting artifacts from tool results by MIME type. Maps MIME type patterns (e.g. 'image/*') to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByFilePath]: {
      default: {
        "**/*plan*.md": { groupName: "Plans" }
      },
      description: nls.localize("chat.artifacts.rules.byFilePath", "Rules for extracting artifacts from written files by file path pattern. Maps glob patterns to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.byFilePath.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.byFilePath.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByMemoryFilePath]: {
      default: {
        "**/*plan*.md": { groupName: "Plans" }
      },
      description: nls.localize("chat.artifacts.rules.byMemoryFilePath", "Rules for extracting artifacts from memory tool calls by memory file path pattern. Maps glob patterns to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.byMemoryFilePath.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.byMemoryFilePath.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    "chat.undoRequests.restoreInput": {
      default: true,
      markdownDescription: nls.localize("chat.undoRequests.restoreInput", "Controls whether the input of the chat should be restored when an undo request is made. The input will be filled with the text of the request that was restored."),
      type: "boolean"
    },
    "chat.editRequests": {
      markdownDescription: nls.localize("chat.editRequests", "Enables editing of requests in the chat. This allows you to change the request content and resubmit it to the model."),
      type: "string",
      enum: ["inline", "hover", "input", "none"],
      default: "inline"
    },
    [ChatConfiguration.ChatViewSessionsEnabled]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.viewSessions.enabled", "Show chat agent sessions when chat is empty or to the side when chat view is wide enough."),
      agentsWindow: { default: false }
    },
    [ChatConfiguration.ChatViewSessionsOrientation]: {
      type: "string",
      enum: ["stacked", "sideBySide"],
      enumDescriptions: [
        nls.localize("chat.viewSessions.orientation.stacked", "Display chat sessions vertically stacked above the chat input unless a chat session is visible."),
        nls.localize("chat.viewSessions.orientation.sideBySide", "Display chat sessions side by side if space is sufficient, otherwise fallback to stacked above the chat input unless a chat session is visible.")
      ],
      default: "sideBySide",
      description: nls.localize("chat.viewSessions.orientation", "Controls the orientation of the chat agent sessions view when it is shown alongside the chat.")
    },
    [ChatConfiguration.ChatViewProgressBadgeEnabled]: {
      type: "boolean",
      default: false,
      description: nls.localize("chat.viewProgressBadge.enabled", "Show a progress badge on the chat view when an agent session is in progress that is opened in that view.")
    },
    [ChatSessionArchiveActionWordingSettingId]: {
      type: "string",
      enum: ["archive", "done"],
      enumDescriptions: [
        nls.localize("chat.experimental.sessionArchiveActionWording.archive", "Use Archive, Archive All, Unarchive, and Unarchive All."),
        nls.localize("chat.experimental.sessionArchiveActionWording.done", "Use Mark as Done, Mark All as Done, Restore, and Restore All.")
      ],
      default: "archive",
      tags: ["experimental"],
      experiment: { mode: "startup" },
      description: nls.localize("chat.experimental.sessionArchiveActionWording", "Controls the wording and icons used by actions that archive and unarchive chat sessions, as well as the label of the archived sessions section.")
    },
    [ChatConfiguration.AgentsHandoffTipMode]: {
      type: "string",
      enum: ["hidden", "default", "custom"],
      enumDescriptions: [
        nls.localize("chat.agentsHandoffTip.mode.hidden", "Never show the handoff tip."),
        nls.localize("chat.agentsHandoffTip.mode.default", "Show the handoff tip with the default description."),
        nls.localize("chat.agentsHandoffTip.mode.custom", "Show the handoff tip with an alternate description.")
      ],
      default: "hidden",
      tags: ["experimental"],
      experiment: { mode: "startup" },
      description: nls.localize("chat.agentsHandoffTip.mode", "Controls the tip shown above the chat input offering to continue eligible agent sessions in the Agents Window.")
    },
    [CodexPreferAgentHostEditorSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editor.codex.preferAgentHost", "When enabled, Codex sessions opened from the regular workbench (sidebar chat) run inside the agent host process using the Codex App Server instead of the OpenAI extension. Only one Codex implementation surfaces per window. Requires `#chat.agentHost.codexAgent.enabled#`."),
      default: true,
      tags: ["experimental"],
      experiment: { mode: "startup" }
    },
    [ChatConfiguration.ChatContextUsageEnabled]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.contextUsage.enabled", "Show the context window usage indicator in the chat input.")
    },
    [ChatConfiguration.Verbose]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.verbose", "Show request and completion timestamps. Hover over a completion timestamp to show the elapsed response time.")
    },
    [ChatConfiguration.ProgressBorder]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.progressBorder.enabled", "Show an animated gradient border around the chat input while the agent is working or thinking. Has no effect when reduced motion is enabled.")
    },
    [ChatConfiguration.NotifyWindowOnResponseReceived]: {
      type: "string",
      enum: ["off", "windowNotFocused", "always"],
      enumDescriptions: [
        nls.localize("chat.notifyWindowOnResponseReceived.off", "Never show OS notifications for responses."),
        nls.localize("chat.notifyWindowOnResponseReceived.windowNotFocused", "Show OS notifications for responses when the window is not focused."),
        nls.localize("chat.notifyWindowOnResponseReceived.always", "Always show OS notifications for responses, even when the window is focused.")
      ],
      default: "windowNotFocused",
      description: nls.localize("chat.notifyWindowOnResponseReceived", "Controls whether a chat session should present the user with an OS notification when a response is received. This includes a window badge as well as notification toast.")
    },
    "chat.checkpoints.enabled": {
      type: "boolean",
      default: true,
      description: nls.localize("chat.checkpoints.enabled", "Enables checkpoints in chat. Checkpoints allow you to restore the chat to a previous state.")
    },
    "chat.checkpoints.showFileChanges": {
      type: "boolean",
      description: nls.localize("chat.checkpoints.showFileChanges", "Controls whether to show chat checkpoint file changes."),
      default: false
    },
    [ChatConfiguration.TurnStatusPills]: {
      anyOf: [
        {
          type: "boolean"
        },
        {
          type: "object",
          properties: {
            changes: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.changes", "Show a pill summarizing the files changed and the lines added and removed in the turn.")
            },
            preview: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.preview", "Show a pill to preview a Markdown or HTML file created or edited in the turn.")
            },
            browser: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.browser", "Show a pill for browser activity in the turn.")
            }
          },
          additionalProperties: false,
          deprecationMessage: nls.localize("chat.turnStatusPills.objectDeprecated", "The per-pill object form is deprecated. Use a boolean value instead.")
        }
      ],
      markdownDescription: nls.localize("chat.turnStatusPills", "Controls whether agent status pills are shown above the chat input while a turn is in progress and inside the completed response. Only applies to agent sessions."),
      default: true
    },
    [mcpAccessConfig]: {
      type: "string",
      description: nls.localize("chat.mcp.access", "Controls access to installed Model Context Protocol servers."),
      enum: [
        McpAccessValue.None,
        McpAccessValue.Registry,
        McpAccessValue.All
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.access.none", "No access to MCP servers."),
        nls.localize("chat.mcp.access.registry", "Allows access to MCP servers listed in the registry that VS Code is connected to."),
        nls.localize("chat.mcp.access.any", "Allow access to any installed MCP server.")
      ],
      default: McpAccessValue.All,
      policy: {
        name: "ChatMCP",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => {
          if (policyData.mcp === false) {
            return McpAccessValue.None;
          }
          if (policyData.mcpAccess === "registry_only") {
            return McpAccessValue.Registry;
          }
          return void 0;
        },
        localization: {
          description: {
            key: "chat.mcp.access",
            value: nls.localize("chat.mcp.access", "Controls access to installed Model Context Protocol servers.")
          },
          enumDescriptions: [
            {
              key: "chat.mcp.access.none",
              value: nls.localize("chat.mcp.access.none", "No access to MCP servers.")
            },
            {
              key: "chat.mcp.access.registry",
              value: nls.localize("chat.mcp.access.registry", "Allows access to MCP servers listed in the registry that VS Code is connected to.")
            },
            {
              key: "chat.mcp.access.any",
              value: nls.localize("chat.mcp.access.any", "Allow access to any installed MCP server.")
            }
          ]
        }
      }
    },
    [mcpAllowedServersConfig]: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          serverName: { type: "string", minLength: 1, description: nls.localize("chat.mcp.allowedServers.serverName", "Match a server by its configured name.") },
          serverUrl: { type: "string", minLength: 1, description: nls.localize("chat.mcp.allowedServers.serverUrl", "Match a remote server by its URL. Supports `*` wildcards, for example `https://*.example.com/*`.") },
          serverCommand: { type: "array", minItems: 1, items: { type: "string" }, description: nls.localize("chat.mcp.allowedServers.serverCommand", "Match a local server by its exact command invocation, given as the command followed by its arguments.") }
        },
        oneOf: [
          { required: ["serverName"] },
          { required: ["serverUrl"] },
          { required: ["serverCommand"] }
        ]
      },
      markdownDescription: nls.localize("chat.mcp.allowedServers", "Enterprise-managed allowlist that controls which Model Context Protocol servers may be installed and run. When set, only servers matching an entry are permitted; any other server is blocked. Servers can be matched by name, remote URL pattern (with `*` wildcards), or local command invocation. Omit entirely to allow all servers (subject to the deny list). Delivered via enterprise policy for governance; this setting is not surfaced to end users."),
      default: null,
      scope: ConfigurationScope.APPLICATION,
      // Governance-only: delivered via the `ChatAllowedMcpServers` enterprise policy and hidden
      // from the Settings UI so it is not configurable by end users.
      included: false,
      policy: {
        name: "ChatAllowedMcpServers",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.130",
        value: managedSettingValue(COPILOT_ALLOWED_MCP_SERVERS_KEY),
        managedSettings: {
          [COPILOT_ALLOWED_MCP_SERVERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.mcp.allowedServers.policy",
            value: nls.localize("chat.mcp.allowedServers.policy", "Allowlist of Model Context Protocol servers. When set, only servers matching an entry may be installed or run; omit entirely to allow all servers (subject to the deny list).")
          }
        }
      }
    },
    [mcpDeniedServersConfig]: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          serverName: { type: "string", minLength: 1, description: nls.localize("chat.mcp.deniedServers.serverName", "Match a server by its configured name.") },
          serverUrl: { type: "string", minLength: 1, description: nls.localize("chat.mcp.deniedServers.serverUrl", "Match a remote server by its URL. Supports `*` wildcards, for example `https://*.example.com/*`.") },
          serverCommand: { type: "array", minItems: 1, items: { type: "string" }, description: nls.localize("chat.mcp.deniedServers.serverCommand", "Match a local server by its exact command invocation, given as the command followed by its arguments.") }
        },
        oneOf: [
          { required: ["serverName"] },
          { required: ["serverUrl"] },
          { required: ["serverCommand"] }
        ]
      },
      markdownDescription: nls.localize("chat.mcp.deniedServers", "Enterprise-managed denylist of Model Context Protocol servers. Servers matching any entry are unconditionally blocked from being installed or run, even if they also match the allow list \u2014 deny rules always take precedence. Servers can be matched by name, remote URL pattern (with `*` wildcards), or local command invocation. Delivered via enterprise policy for governance; this setting is not surfaced to end users."),
      default: null,
      scope: ConfigurationScope.APPLICATION,
      // Governance-only: delivered via the `ChatDeniedMcpServers` enterprise policy and hidden
      // from the Settings UI so it is not configurable by end users.
      included: false,
      policy: {
        name: "ChatDeniedMcpServers",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.130",
        value: managedSettingValue(COPILOT_DENIED_MCP_SERVERS_KEY),
        managedSettings: {
          [COPILOT_DENIED_MCP_SERVERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.mcp.deniedServers.policy",
            value: nls.localize("chat.mcp.deniedServers.policy", "Denylist of Model Context Protocol servers. Servers matching any entry are blocked from being installed or run, even if they also match the allow list; deny rules always take precedence.")
          }
        }
      }
    },
    [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.mcp.allowManagedServersOnly", "Use only the enterprise-managed MCP allowlist when deciding which servers may run."),
      policy: {
        name: "ChatAllowManagedMcpServersOnly",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY),
        managedSettings: {
          [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.mcp.allowManagedServersOnly.policy",
            value: nls.localize("chat.mcp.allowManagedServersOnly.policy", "Use only the enterprise-managed MCP allowlist when deciding which servers may run.")
          }
        }
      }
    },
    [mcpAutoStartConfig]: {
      type: "string",
      description: nls.localize("chat.mcp.autostart", "Controls whether MCP servers should be automatically started when the chat messages are submitted."),
      default: McpAutoStartValue.NewAndOutdated,
      enum: [
        McpAutoStartValue.Never,
        McpAutoStartValue.OnlyNew,
        McpAutoStartValue.NewAndOutdated
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.autostart.never", "Never automatically start MCP servers."),
        nls.localize("chat.mcp.autostart.onlyNew", "Only automatically start new MCP servers that have never been run."),
        nls.localize("chat.mcp.autostart.newAndOutdated", "Automatically start new and outdated MCP servers that are not yet running.")
      ],
      tags: ["experimental"]
    },
    [mcpAppsEnabledConfig]: {
      type: "boolean",
      description: nls.localize("chat.mcp.ui.enabled", "Controls whether MCP servers can provide custom UI for tool invocations."),
      default: true,
      tags: ["experimental"]
    },
    [mcpEnterpriseManagedAuthIdpSection]: {
      type: "object",
      default: {},
      scope: ConfigurationScope.APPLICATION,
      tags: ["preview", "experimental"],
      additionalProperties: false,
      included: false,
      properties: {
        issuer: {
          type: "string",
          format: "uri",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.issuer", "The OAuth/OIDC issuer URL of the SSO authorization server. Must be an `https://` URL.")
        },
        clientId: {
          type: "string",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.clientId", "The OAuth client ID registered with the SSO issuer for this device.")
        },
        clientSecret: {
          type: "string",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.clientSecret", "The OAuth client secret paired with `clientId`. Intended for local development only.")
        }
      },
      markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp", "(Preview) The OAuth/OIDC IdP configuration used for enterprise-managed Model Context Protocol (MCP) servers. Typically delivered via enterprise policy (Windows Group Policy / macOS managed preferences / Linux `/etc/vscode/policy.json`); developers may hand-edit `settings.json` for local testing. Properties: `issuer` (HTTPS URL), `clientId`, `clientSecret`."),
      policy: {
        name: "McpEnterpriseManagedAuthIdp",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        localization: {
          description: {
            key: "mcp.enterpriseManagedAuth.idp.policy",
            value: nls.localize("mcp.enterpriseManagedAuth.idp.policy", "The OAuth/OIDC IdP configuration used for enterprise-managed Model Context Protocol (MCP) server authentication.")
          }
        }
      }
    },
    [mcpServerCollisionBehaviorSection]: {
      type: "string",
      description: nls.localize("chat.mcp.collisionBehavior", "Controls behavior when multiple MCP servers are discovered with the same name. 'disable' disables lower-priority duplicates. 'suffix' appends numeric suffixes to disambiguate."),
      enum: [
        McpCollisionBehavior.Disable,
        McpCollisionBehavior.Suffix
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.collisionBehavior.disable", "Disable lower-priority servers with duplicate names."),
        nls.localize("chat.mcp.collisionBehavior.suffix", "Append numeric suffixes to servers with duplicate names.")
      ],
      default: McpCollisionBehavior.Disable
    },
    [mcpServerSamplingSection]: {
      type: "object",
      description: nls.localize("chat.mcp.serverSampling", "Configures which models are exposed to MCP servers for sampling (making model requests in the background). This setting can be edited in a graphical way under the `{0}` command.", "MCP: " + nls.localize("mcp.list", "List Servers")),
      scope: ConfigurationScope.RESOURCE,
      additionalProperties: {
        type: "object",
        properties: {
          allowedDuringChat: {
            type: "boolean",
            description: nls.localize("chat.mcp.serverSampling.allowedDuringChat", "Whether this server is allowed to make sampling requests during its tool calls in a chat session."),
            default: true
          },
          allowedOutsideChat: {
            type: "boolean",
            description: nls.localize("chat.mcp.serverSampling.allowedOutsideChat", "Whether this server is allowed to make sampling requests outside of a chat session."),
            default: false
          },
          allowedModels: {
            type: "array",
            items: {
              type: "string",
              description: nls.localize("chat.mcp.serverSampling.model", "A model the MCP server has access to.")
            }
          }
        }
      }
    },
    [AssistedTypes[AddConfigurationType.NuGetPackage].enabledConfigKey]: {
      type: "boolean",
      description: nls.localize("chat.mcp.assisted.nuget.enabled.description", "Enables NuGet packages for AI-assisted MCP server installation. Used to install MCP servers by name from the central registry for .NET packages (NuGet.org)."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "startup"
      }
    },
    [ChatConfiguration.ExtensionToolsEnabled]: {
      type: "boolean",
      description: nls.localize("chat.extensionToolsEnabled", "Enable using tools contributed by third-party extensions."),
      default: true,
      policy: {
        name: "ChatAgentExtensionTools",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "chat.extensionToolsEnabled",
            value: nls.localize("chat.extensionToolsEnabled", "Enable using tools contributed by third-party extensions.")
          }
        }
      }
    },
    [ChatConfiguration.PluginsEnabled]: {
      type: "boolean",
      description: nls.localize("chat.plugins.enabled", "Enable agent plugin integration in chat."),
      default: true,
      policy: {
        name: "ChatPluginsEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.plugins.enabled",
            value: nls.localize("chat.plugins.enabled", "Enable agent plugin integration in chat.")
          }
        }
      }
    },
    [ChatConfiguration.PluginLocations]: {
      type: "object",
      additionalProperties: { type: "boolean" },
      restricted: true,
      markdownDescription: nls.localize("chat.pluginLocations", "Plugin directories to discover. Each key is a path that points directly to a plugin folder, and the value enables (`true`) or disables (`false`) it. Paths can be absolute, relative to the workspace root, or start with `~/` for the user's home directory."),
      scope: ConfigurationScope.MACHINE,
      tags: ["experimental"]
    },
    [ChatConfiguration.EnabledPlugins]: {
      type: "object",
      additionalProperties: { type: "boolean" },
      markdownDescription: nls.localize("chat.plugins.enabledPlugins", "Controls which [agent plugins](https://aka.ms/vscode-agent-plugins) are enabled or disabled. Keys are plugin IDs in `<plugin>@<marketplace>` form (where marketplace is defined in {1}); values enable (`true`) or disable (`false`) the plugin. Discovered alongside the path-keyed entries in {0}. When set by policy, entries are additive: plugins mapped to `true` are enabled in addition to the user's own plugins, and only plugins mapped to `false` are blocked from loading.", `\`#${ChatConfiguration.PluginLocations}#\``, `\`#${ChatConfiguration.PluginMarketplaces}#\``),
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "ChatEnabledPlugins",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_ENABLED_PLUGINS_KEY),
        managedSettings: {
          [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.enabledPlugins.policy",
            value: nls.localize("chat.plugins.enabledPlugins.policy", "Plugin enablement. Keys are plugin IDs in `{plugin}@{marketplace}` form; values enable or disable the plugin.")
          }
        }
      }
    },
    [ChatConfiguration.PluginMarketplaces]: {
      type: "array",
      items: {
        type: "string"
      },
      markdownDescription: nls.localize("chat.plugins.marketplaces", "Plugin marketplaces to query. Entries may be GitHub shorthand (`owner/repo` or `owner/repo#ref`), direct Git repository URIs (`https://...git`, `ssh://...git`, or `git@host:path.git`, each optionally suffixed with `#ref`), or local repository URIs (`file:///...`). Equivalent GitHub shorthand and URI entries are deduplicated."),
      default: ["github/copilot-plugins", "github/awesome-copilot#marketplace"],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental"]
    },
    [ChatConfiguration.ExtraMarketplaces]: {
      // Policy-only delivery slot for enterprise-managed marketplace entries (via the
      // `ChatExtraMarketplaces` policy). Consumers union this with `chat.plugins.marketplaces`.
      //
      // Stored as a named string map. Explicit update overrides are JSON-encoded
      // inside the value string so the Settings Editor can use its inline object renderer.
      // This ensures:
      //   - The Settings Editor (ComplexObject renderer) can display entries inline when
      //     managed by policy, rather than only showing "Edit in settings.json".
      //   - Marketplace names are preserved for `enabledPlugins["plugin@<name>"]` resolution.
      //
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      markdownDescription: nls.localize("chat.plugins.extraMarketplaces", "Enterprise-managed additional plugin marketplaces. Unioned with {0}. An entry's `autoUpdate` value overrides {1} for plugins from that marketplace.", `\`#${ChatConfiguration.PluginMarketplaces}#\``, "`#extensions.autoUpdate#`"),
      policy: {
        name: "ChatExtraMarketplaces",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_EXTRA_MARKETPLACES_KEY),
        managedSettings: {
          [COPILOT_EXTRA_MARKETPLACES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.extraMarketplaces.policy",
            value: nls.localize("chat.plugins.extraMarketplaces.policy", "Additional plugin marketplaces to query. Keys are marketplace names; values are GitHub shorthand (`owner/repo[#ref]`) or Git URIs (`{url}[#ref]`), optionally with an enterprise-managed auto-update override.")
          }
        }
      }
    },
    [ChatConfiguration.StrictMarketplaces]: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["github", "git", "url", "npm", "file", "directory", "hostPattern", "pathPattern"]
          },
          repo: { type: "string" },
          url: { type: "string" },
          ref: { type: "string" },
          path: { type: "string" },
          package: { type: "string" },
          hostPattern: { type: "string" },
          pathPattern: { type: "string" },
          headers: { type: "object", additionalProperties: { type: "string" } }
        },
        required: ["source"]
      },
      markdownDescription: nls.localize("chat.plugins.strictMarketplaces", "Enterprise-managed allowlist of plugin marketplace sources. When set, only marketplaces matching one of these entries can be installed; an empty array blocks all marketplaces. This does not retroactively disable already-installed plugins. Each entry is an object with a `source` discriminator (`github`, `git`, `url`, `npm`, `file`, `directory`, `hostPattern`, or `pathPattern`) and the corresponding fields. Typically delivered via enterprise policy."),
      default: null,
      restricted: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental"],
      policy: {
        name: "ChatStrictMarketplaces",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_STRICT_MARKETPLACES_KEY),
        managedSettings: {
          [COPILOT_STRICT_MARKETPLACES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.strictMarketplaces.policy",
            value: nls.localize("chat.plugins.strictMarketplaces.policy", "Allowlist of plugin marketplace sources. When set, only marketplaces matching an entry are trusted; an empty array blocks all marketplaces.")
          }
        }
      }
    },
    [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.customizations.strictPluginOnlyCustomization", "Blocks standalone user and workspace skills, agents, hooks, instructions, and MCP servers while keeping eligible plugin customizations available."),
      policy: {
        name: "ChatStrictPluginOnlyCustomization",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY),
        managedSettings: {
          [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.customizations.strictPluginOnlyCustomization.policy",
            value: nls.localize("chat.customizations.strictPluginOnlyCustomization.policy", "Blocks standalone user and workspace skills, agents, hooks, instructions, and MCP servers while keeping eligible plugin customizations available.")
          }
        }
      }
    },
    [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.hooks.allowManagedOnly", "Allows hooks only from enterprise-managed sources and plugins force-enabled by policy."),
      policy: {
        name: "ChatAllowManagedHooksOnly",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY),
        managedSettings: {
          [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.hooks.allowManagedOnly.policy",
            value: nls.localize("chat.hooks.allowManagedOnly.policy", "Allows hooks only from enterprise-managed sources and plugins force-enabled by policy.")
          }
        }
      }
    },
    [ChatConfiguration.AgentEnabled]: {
      type: "boolean",
      description: nls.localize("chat.agent.enabled.description", "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used."),
      default: true,
      order: 1,
      policy: {
        name: "ChatAgentMode",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => policyData.chat_agent_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agent.enabled.description",
            value: nls.localize("chat.agent.enabled.description", "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used.")
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.NetworkFilter]: {
      markdownDescription: nls.localize("chat.agent.networkFilter", "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
      type: "boolean",
      default: false,
      restricted: true,
      policy: {
        name: "ChatAgentNetworkFilter",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.networkFilter",
            value: nls.localize("chat.agent.networkFilter", "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.AllowedNetworkDomains]: {
      markdownDescription: nls.localize("chat.agent.allowedNetworkDomains", "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {2} is enabled, all domains are allowed. Supports wildcards like {3}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, "`*.example.com`", `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
      type: "array",
      items: { type: "string" },
      default: [],
      restricted: true,
      policy: {
        name: "ChatAgentAllowedNetworkDomains",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.allowedNetworkDomains",
            value: nls.localize("chat.agent.allowedNetworkDomains", "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {2} is enabled, all domains are allowed. Supports wildcards like {3}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, "`*.example.com`", `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``)
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
      markdownDescription: nls.localize("chat.agent.deniedNetworkDomains", "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. This does not apply when {2} is enabled. Takes precedence over {3}. Supports wildcards like {4}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, "`*.example.com`"),
      type: "array",
      items: { type: "string" },
      default: [],
      restricted: true,
      policy: {
        name: "ChatAgentDeniedNetworkDomains",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.deniedNetworkDomains",
            value: nls.localize("chat.agent.deniedNetworkDomains", "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. This does not apply when {2} is enabled. Takes precedence over {3}. Supports wildcards like {4}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, "`*.example.com`")
          }
        }
      }
    },
    [ChatConfiguration.DefaultNewSessionMode]: {
      type: "string",
      description: nls.localize("chat.newSession.defaultMode", "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
      default: ""
    },
    [AgentHostAhpJsonlLoggingSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.ahpJsonlLogging", "When enabled, logs all AHP transport messages for agent host connections to JSONL files under the window's log directory."),
      default: product.quality !== "stable",
      tags: ["experimental", "advanced"]
    },
    [AgentHostAgentDebugLogEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.agentDebugLog.enabled", "Enable agent debug logging for agent host sessions: surface their debug events in the agent debug panel. Takes effect immediately; only sessions that run while this is enabled are captured."),
      default: false,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "startup"
      }
    },
    [AgentHostAgentDebugLogMaxEventsSettingId]: {
      type: "number",
      minimum: 10,
      markdownDescription: nls.localize("chat.agentHost.agentDebugLog.maxEventsInMemory", "Maximum number of debug events kept in memory per agent host session for the agent debug panel. Older events beyond this limit are dropped from the in-memory buffer, which also lowers the totals (such as token usage) shown in the panel overview."),
      default: 1e4,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "startup"
      }
    },
    [AgentHostCustomTerminalToolEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.customTerminalTool.enabled", "When enabled, Copilot SDK sessions use the Agent Host terminal tool override instead of the SDK's default terminal behavior."),
      default: false,
      tags: ["experimental", "advanced"]
    },
    [AgentHostCopilotSdkLogLevelSettingId]: {
      type: "string",
      enum: [...copilotSdkLogLevelSettingValues],
      enumDescriptions: [
        nls.localize("chat.agentHost.copilotSdk.logLevel.info", "Log informational messages. Running VS Code with trace logging still enables all Copilot SDK runtime diagnostics."),
        nls.localize("chat.agentHost.copilotSdk.logLevel.trace", "Log all Copilot SDK runtime diagnostics.")
      ],
      markdownDescription: nls.localize("chat.agentHost.copilotSdk.logLevel", "Controls the log level for the Copilot SDK runtime used by the local agent host. Changing this setting restarts the Copilot SDK client; active sessions are reloaded when next used."),
      default: "info",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostMapLegacySettingsToManagedSettingsSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.copilot.mapLegacySettingsToManagedSettings", "When enabled, maps supported legacy VS Code settings to equivalent Copilot SDK managed settings for local Agent Host sessions. This compatibility bridge is temporary and is not used for new settings."),
      default: false,
      scope: ConfigurationScope.APPLICATION_MACHINE,
      tags: ["experimental", "advanced"]
    },
    [AgentHostOpus48PromptEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.opus48Prompt.enabled", "When enabled, Copilot SDK sessions running a Claude Opus 4.8 model apply Opus 4.8-tuned system-prompt section overrides on top of the default system message."),
      default: false,
      tags: ["experimental", "advanced"]
    },
    [AgentHostToolSearchEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.copilot.toolSearch.enabled", "When enabled, Copilot SDK sessions defer MCP and non-core VS Code tools behind a tool-search tool so the model discovers them on demand instead of loading every tool definition up front."),
      default: true,
      tags: ["experimental", "advanced"]
    },
    [AgentHostToolSearchDeferThresholdSettingId]: {
      type: "number",
      description: nls.localize("chat.agentHost.copilot.toolSearch.deferThreshold", "Minimum number of tools before MCP and external tools are deferred behind tool search. Set to 0 to always defer external tools. Only effective when tool search is enabled."),
      default: 1,
      minimum: 0,
      tags: ["experimental", "advanced"]
    },
    [AgentHostReasoningEffortOverrideSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.reasoningEffortOverride", "Overrides the reasoning effort for Copilot SDK agent sessions regardless of the per-model picker value. Set it to a level the selected model supports (for example `low`, `medium`, `high`, or `xhigh`) \u2014 choosing a level the model does not support may be rejected by the model. A value that isn't a recognized effort level is ignored and the session falls back to the picker value. Applied when a session is created and when its model changes. Only affects Copilot CLI agent sessions.\n\n**Note**: This is an advanced setting for experimentation."),
      default: "",
      tags: ["experimental", "advanced"]
    },
    [AgentHostReasoningSummaryEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.reasoningSummary", "When enabled, requests concise reasoning summaries for supported Copilot SDK agent sessions."),
      default: false,
      experiment: { mode: "startup" },
      tags: ["experimental", "advanced"]
    },
    [AgentHostCopilotModelCapabilityOverridesSettingId]: {
      type: "object",
      markdownDescription: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides", "Per-model capability overrides for Copilot SDK agent sessions, keyed by model id (`*` matches every model; a specific entry wins field-by-field), intended for evaluating models against an existing model's profile. Declare an aliased `family` (for example `claude-opus-4.8`) to route the model to that family's tuned system prompt and tool profile without changing the model id sent to the runtime \u2014 so a preview model can be evaluated against a known prompt while still running on its own endpoint \u2014 a `reasoningEffort` to pin its effort level, `availableTools`/`excludedTools` to filter its tool set, or `modelCapabilities` to override individual capability limits (e.g. vision support, context window size) passed through to the SDK. All overrides apply when a session launches or resumes. On a mid-session model change, only the new model's `reasoningEffort` is applied; the session keeps its launch-time family, tool filters, and model capabilities. Only affects Copilot agent sessions.\n\n**Note**: This is an advanced setting for experimentation."),
      additionalProperties: {
        type: "object",
        properties: {
          family: {
            type: "string",
            description: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides.family", "Route the model to another family's tuned system prompt and tool profile (e.g. `claude-opus-4.8`). The model id sent to the runtime is unaffected, so the session still runs on the selected model.")
          },
          reasoningEffort: {
            type: "string",
            enum: [...reasoningEffortLevels],
            description: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides.reasoningEffort", "Reasoning effort for sessions on this model, overriding the model picker's thinking level. Use the `*` entry to set it for every model. Unrecognized values are ignored.")
          },
          availableTools: {
            type: "array",
            items: { type: "string" },
            description: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides.availableTools", "When set, only matching tools are available to sessions on this model. Patterns: bare tool names, `builtin:*` or `builtin:<name>` (Copilot runtime tools), `mcp:*` or `mcp:<name>` (MCP server tools), and `custom:*` or `custom:<name>` (every tool VS Code registers with the SDK, including the agent host's own terminal tools); a bare `*` expands to all three sources.")
          },
          excludedTools: {
            type: "array",
            items: { type: "string" },
            description: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides.excludedTools", "Tools disabled for sessions on this model; same pattern syntax as `availableTools` and takes precedence over it. Note that `custom:*` and a bare `*` also disable the agent host's own terminal tools registered with the SDK.")
          },
          modelCapabilities: {
            type: "object",
            additionalProperties: true,
            description: nls.localize("chat.agentHost.copilot.modelCapabilityOverrides.modelCapabilities", 'Per-property model capability overrides passed through to the Copilot SDK\'s `modelCapabilities` session field (e.g. `{ "supports": { "vision": false }, "limits": { "max_context_window_tokens": 64000 } }`), deep-merged over the runtime\'s resolved defaults for this model. Applied when the session launches or resumes.')
          }
        }
      },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostAllowSignedOutWhenUsableSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.allowSignedOutWhenUsable", "When enabled, Agent Host sessions remain available while signed out. The Agents window opens without forcing GitHub sign-in, and editor chat lets you select the Copilot harness. Agents usable without GitHub (for example Codex with ChatGPT authentication or Claude in native mode with your own Anthropic credentials) work while signed out; agents that require GitHub prompt you to add a model or sign in. When disabled (the default), GitHub sign-in is required before the Agents window opens."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      experiment: { mode: "startup" }
    },
    [AgentHostSdkSandboxEnabledSettingId]: {
      type: "string",
      enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
      enumDescriptions: [
        nls.localize("chat.agentHost.sdkSandbox.enabled.off", "No sandbox policy is forwarded for the SDK's built-in shell tool \u2014 commands run unsandboxed."),
        nls.localize("chat.agentHost.sdkSandbox.enabled.on", "The SDK's built-in shell tool runs inside a sandbox using the configured filesystem policy with outbound network blocked.")
      ],
      markdownDescription: nls.localize("chat.agentHost.sdkSandbox.enabled", "Sandbox mode for the Copilot SDK's built-in shell tool on macOS and Linux. Only takes effect when `#chat.agentHost.customTerminalTool.enabled#` is `false`; when the Agent Host's own terminal tool is enabled, the engine sandbox is controlled by `#chat.agent.sandbox.enabled#`. The sandbox applies only to requests that run with manual permissions \u2014 not when approvals are bypassed. Unrestricted network is controlled by `#chat.agent.sandbox.allowNetwork#`. Use `#chat.agentHost.sdkSandbox.enabledWindows#` on Windows."),
      default: AgentSandboxEnabledValue.Off,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "auto"
      }
    },
    [AgentHostSdkSandboxWindowsEnabledSettingId]: {
      type: "string",
      enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On],
      enumDescriptions: [
        nls.localize("chat.agentHost.sdkSandbox.enabledWindows.off", "No sandbox policy is forwarded for the SDK's built-in shell tool on Windows \u2014 commands run unsandboxed."),
        nls.localize("chat.agentHost.sdkSandbox.enabledWindows.on", "The SDK's built-in shell tool runs inside the Windows sandbox using the configured filesystem policy.")
      ],
      markdownDescription: nls.localize("chat.agentHost.sdkSandbox.enabledWindows", "Sandbox mode for the Copilot SDK's built-in shell tool on Windows. Only takes effect when `#chat.agentHost.customTerminalTool.enabled#` is `false`. This setting is independent of `#chat.agentHost.sdkSandbox.enabled#` so Windows sandbox support can be enabled separately. Unrestricted network is controlled by `#chat.agent.sandbox.allowNetwork#`."),
      default: AgentSandboxEnabledValue.Off,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ToolConfirmationCarousel]: {
      type: "boolean",
      description: nls.localize("chat.tools.confirmationCarousel", "When enabled, multiple tool confirmations are batched into a carousel above the input."),
      default: true
    },
    [ChatConfiguration.ToolRiskAssessmentEnabled]: {
      type: "boolean",
      description: nls.localize("chat.tools.riskAssessment.enabled", "When enabled, tool confirmations show an LLM-generated risk level (Safe / Caution / Review carefully) and a short explanation."),
      default: true,
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ToolRiskAssessmentModel]: {
      type: "string",
      description: nls.localize("chat.tools.riskAssessment.model", "The language model id used to generate tool risk assessments. Should be a small, fast model."),
      default: "copilot-utility-small",
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.PlanAgentDefaultModel]: {
      type: "string",
      description: nls.localize("chat.planAgent.defaultModel.description", "Select the default language model to use for the Plan agent from the available providers."),
      default: "",
      enum: PlanAgentDefaultModel.modelIds,
      enumItemLabels: PlanAgentDefaultModel.modelLabels,
      markdownEnumDescriptions: PlanAgentDefaultModel.modelDescriptions
    },
    [ChatConfiguration.ExploreAgentDefaultModel]: {
      type: "string",
      description: nls.localize("chat.exploreAgent.defaultModel.description", "Select the default language model to use for the Explore subagent from the available providers."),
      default: "",
      enum: ExploreAgentDefaultModel.modelIds,
      enumItemLabels: ExploreAgentDefaultModel.modelLabels,
      markdownEnumDescriptions: ExploreAgentDefaultModel.modelDescriptions
    },
    [ChatConfiguration.BYOKUtilityModelDefault]: {
      type: "string",
      markdownDescription: nls.localize("chat.byokUtilityModelDefault.description", "Controls the default model used by built-in utility flows when the selected main agent model is a bring your own key (BYOK) model. This setting has no effect when the selected main agent model is provided by GitHub Copilot. A specific model configured in {0} or {1} takes precedence.", "`#chat.utilityModel#`", "`#chat.utilitySmallModel#`"),
      enum: [BYOKUtilityModelDefault.None, BYOKUtilityModelDefault.MainAgent, BYOKUtilityModelDefault.Copilot],
      enumItemLabels: [
        nls.localize("chat.byokUtilityModelDefault.none.label", "None"),
        nls.localize("chat.byokUtilityModelDefault.mainAgent.label", "Main Agent Model"),
        nls.localize("chat.byokUtilityModelDefault.copilot.label", "GitHub Copilot")
      ],
      markdownEnumDescriptions: [
        nls.localize("chat.byokUtilityModelDefault.none.description", "Do not use a default utility model."),
        nls.localize("chat.byokUtilityModelDefault.mainAgent.description", "Use the selected BYOK main agent model."),
        nls.localize("chat.byokUtilityModelDefault.copilot.description", "Use the default GitHub Copilot utility models.")
      ],
      default: BYOKUtilityModelDefault.Copilot
    },
    [ChatConfiguration.UtilityModel]: {
      type: "string",
      description: nls.localize("chat.utilityModel.description", "Override the language model used by built-in utility flows. Leave empty to use the configured default behavior."),
      default: "",
      enum: UtilityModelContribution.modelIds,
      enumItemLabels: UtilityModelContribution.modelLabels,
      markdownEnumDescriptions: UtilityModelContribution.modelDescriptions
    },
    [ChatConfiguration.UtilitySmallModel]: {
      type: "string",
      description: nls.localize("chat.utilitySmallModel.description", "Override the language model used by built-in small/fast utility flows. A fast and inexpensive model is recommended. Leave empty to use the configured default behavior."),
      default: "",
      enum: UtilitySmallModelContribution.modelIds,
      enumItemLabels: UtilitySmallModelContribution.modelLabels,
      markdownEnumDescriptions: UtilitySmallModelContribution.modelDescriptions
    },
    [ChatConfiguration.RequestQueueingDefaultAction]: {
      type: "string",
      enum: ["queue", "steer"],
      enumDescriptions: [
        nls.localize("chat.requestQueuing.defaultAction.queue", "Queue the message to send after the current request completes."),
        nls.localize("chat.requestQueuing.defaultAction.steer", "Steer the current request by sending the message immediately, signaling the current request to yield.")
      ],
      description: nls.localize("chat.requestQueuing.defaultAction.description", "Controls which action is the default for the queue button when a request is in progress."),
      default: "steer"
    },
    [ChatConfiguration.EnableMath]: {
      type: "boolean",
      description: nls.localize("chat.mathEnabled.description", "Enable math rendering in chat responses using KaTeX."),
      default: true
    },
    [ChatConfiguration.ShowCodeBlockProgressAnimation]: {
      type: "boolean",
      description: nls.localize("chat.codeBlock.showProgressAnimation.description", "When applying edits, show a progress animation in the code block pill. If disabled, shows the progress percentage instead."),
      default: true,
      tags: ["experimental"]
    },
    [mcpDiscoverySection]: {
      type: "object",
      properties: Object.fromEntries(allDiscoverySources.map((k) => [k, { type: "boolean", description: discoverySourceSettingsLabel[k] }])),
      additionalProperties: false,
      default: Object.fromEntries(allDiscoverySources.map((k) => [k, false])),
      markdownDescription: nls.localize("mcp.discovery.enabled", "Configures discovery of Model Context Protocol servers from configuration from various other applications.")
    },
    [mcpGalleryServiceEnablementConfig]: {
      type: "boolean",
      default: false,
      tags: ["preview"],
      description: nls.localize("chat.mcp.gallery.enabled", "Enables the default Marketplace for Model Context Protocol (MCP) servers."),
      included: product.quality === "stable"
    },
    [mcpGalleryServiceUrlConfig]: {
      type: "string",
      description: nls.localize("mcp.gallery.serviceUrl", "Configure the MCP Gallery service URL to connect to"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices", "advanced"],
      included: false,
      policy: {
        name: "McpGalleryServiceUrl",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.101",
        value: (policyData) => policyData.mcpRegistryUrl,
        localization: {
          description: {
            key: "mcp.gallery.serviceUrl",
            value: nls.localize("mcp.gallery.serviceUrl", "Configure the MCP Gallery service URL to connect to")
          }
        }
      }
    },
    [PromptsConfig.INSTRUCTIONS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.instructions.config.locations.title",
        "Instructions File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.instructions.config.locations.description",
        "Specify location(s) of instructions files (`*{0}`) that can be attached in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        INSTRUCTION_FILE_EXTENSION,
        INSTRUCTIONS_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.instructionsLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS[0].path]: true
        },
        {
          [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/instructions": true
        }
      ]
    },
    [PromptsConfig.PROMPT_LOCATIONS_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.reusablePrompts.config.locations.title",
        "Prompt File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.reusablePrompts.config.locations.description",
        "Specify location(s) of reusable prompt files (`*{0}`) that can be run in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        PROMPT_FILE_EXTENSION,
        PROMPT_DOCUMENTATION_URL
      ),
      default: {
        [PROMPT_DEFAULT_SOURCE_FOLDER]: true
      },
      additionalProperties: { type: "boolean" },
      unevaluatedProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.promptFileLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [PROMPT_DEFAULT_SOURCE_FOLDER]: true
        },
        {
          [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/prompts": true
        }
      ]
    },
    [PromptsConfig.MODE_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.mode.config.locations.title",
        "Mode File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.mode.config.locations.description",
        "Specify location(s) of custom chat mode files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        LEGACY_MODE_FILE_EXTENSION,
        AGENT_DOCUMENTATION_URL
      ),
      default: {
        [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true
      },
      deprecationMessage: nls.localize("chat.mode.config.locations.deprecated", "This setting is deprecated and will be removed in future releases. Chat modes are now called custom agents and are located in `.github/agents`"),
      additionalProperties: { type: "boolean" },
      unevaluatedProperties: { type: "boolean" },
      restricted: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true
        },
        {
          [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/chatmodes": true
        }
      ]
    },
    [PromptsConfig.AGENTS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.agents.config.locations.title",
        "Agent File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.agents.config.locations.description",
        "Specify location(s) of custom agent files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        AGENT_FILE_EXTENSION,
        AGENT_DOCUMENTATION_URL
      ),
      default: {
        [AGENTS_SOURCE_FOLDER]: true,
        [CLAUDE_AGENTS_SOURCE_FOLDER]: true,
        [COPILOT_USER_AGENTS_SOURCE_FOLDER]: true
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.agentLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [AGENTS_SOURCE_FOLDER]: true
        },
        {
          [AGENTS_SOURCE_FOLDER]: true,
          "my-agents": true,
          "../shared-agents": true,
          "~/.copilot/agents": true
        }
      ]
    },
    [PromptsConfig.USE_AGENT_MD]: {
      type: "boolean",
      title: nls.localize("chat.useAgentMd.title", "Use AGENTS.md file"),
      markdownDescription: nls.localize("chat.useAgentMd.description", "Controls whether instructions from `AGENTS.md` file found in a workspace roots are attached to all chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_NESTED_AGENT_MD]: {
      type: "boolean",
      title: nls.localize("chat.useNestedAgentMd.title", "Use nested AGENTS.md files"),
      markdownDescription: nls.localize("chat.useNestedAgentMd.description", "Controls whether instructions from nested `AGENTS.md` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_CLAUDE_MD]: {
      type: "boolean",
      title: nls.localize("chat.useClaudeMd.title", "Use CLAUDE.md file"),
      markdownDescription: nls.localize("chat.useClaudeMd.description", "Controls whether instructions from `CLAUDE.md` file found in workspace roots, .claude and ~/.claude folder are attached to all chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_AGENT_SKILLS]: {
      type: "boolean",
      title: nls.localize("chat.useAgentSkills.title", "Use Agent skills"),
      markdownDescription: nls.localize("chat.useAgentSkills.description", "Controls whether skills are provided as specialized capabilities to the chat requests. Skills are loaded from the folders configured in `#chat.agentSkillsLocations#`. The language model can load these skills on-demand if the `read` tool is available. Learn more about [Agent Skills](https://aka.ms/vscode-agent-skills). This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_SKILL_ADHERENCE_PROMPT]: {
      type: "boolean",
      title: nls.localize("chat.useSkillAdherencePrompt.title", "Use Skill Adherence Prompt"),
      markdownDescription: nls.localize("chat.useSkillAdherencePrompt.description", "Controls whether a stronger skill adherence prompt is used that encourages the model to immediately invoke skills when relevant rather than just announcing them. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"],
      experiment: {
        mode: "auto"
      }
    },
    [PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS]: {
      type: "boolean",
      title: nls.localize("chat.includeApplyingInstructions.title", "Include Applying Instructions"),
      markdownDescription: nls.localize("chat.includeApplyingInstructions.description", "Controls whether instructions with a matching 'applyTo' attribute are automatically included in chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS]: {
      type: "boolean",
      title: nls.localize("chat.includeReferencedInstructions.title", "Include Referenced Instructions"),
      markdownDescription: nls.localize("chat.includeReferencedInstructions.description", "Controls whether referenced instructions are automatically included in chat requests. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: {
      type: "boolean",
      title: nls.localize("chat.useCustomizationsInParentRepos.title", "Use Customizations in Parent Repositories"),
      markdownDescription: nls.localize("chat.useCustomizationsInParentRepos.description", "Controls whether to use chat customization files in parent repositories. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.SKILLS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize("chat.agentSkillsLocations.title", "Agent Skills Locations"),
      markdownDescription: nls.localize(
        "chat.agentSkillsLocations.description",
        "Specify location(s) of agent skills (`{0}`) that can be used in Chat Sessions. [Learn More]({1}).\n\nEach path should contain skill subfolders with SKILL.md files (e.g., add `my-skills` if you have `my-skills/skillA/SKILL.md`). Relative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        SKILL_FILENAME,
        SKILL_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_SKILL_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.agentSkillsLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true
        },
        {
          [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true,
          "my-skills": true,
          "../shared-skills": true,
          "~/.custom/skills": true
        }
      ]
    },
    [PromptsConfig.HOOKS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize("chat.hookFilesLocations.title", "Hook File Locations"),
      markdownDescription: nls.localize(
        "chat.hookFilesLocations.description",
        "Specify paths to hook configuration files that define custom shell commands to execute at strategic points in an agent's workflow. [Learn More]({0}).\n\nRelative paths are resolved from the root folder(s) of your workspace. Supports Copilot hooks (`*.json`) and Claude Code hooks (`settings.json`, `settings.local.json`).\n\nThis setting is only used by the Local agent harness.",
        HOOK_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_HOOK_FILE_PATHS.map((f) => ({ [f.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.hookFilesLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["preview", "prompts", "hooks", "agent"],
      examples: [
        {
          [DEFAULT_HOOK_FILE_PATHS[0].path]: true
        },
        {
          [DEFAULT_HOOK_FILE_PATHS[0].path]: true,
          "custom-hooks/hooks.json": true
        }
      ],
      agentsWindow: { default: { ".claude/settings.local.json": false, ".claude/settings.json": false, "~/.claude/settings.json": false } }
    },
    [PromptsConfig.USE_CHAT_HOOKS]: {
      type: "boolean",
      title: nls.localize("chat.useHooks.title", "Use Chat Hooks"),
      markdownDescription: nls.localize("chat.useHooks.description", "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["preview", "prompts", "hooks", "agent"],
      policy: {
        name: "ChatHooks",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.109",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.useHooks.description",
            value: nls.localize("chat.useHooks.description", "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness.")
          }
        }
      }
    },
    [PromptsConfig.USE_CLAUDE_HOOKS]: {
      type: "boolean",
      title: nls.localize("chat.useClaudeHooks.title", "Use Claude Hooks"),
      markdownDescription: nls.localize("chat.useClaudeHooks.description", "Controls whether hooks from Claude configuration files can execute. When disabled, only Copilot-format hooks are used. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["preview", "prompts", "hooks", "agent"]
    },
    [PromptsConfig.PROMPT_FILES_SUGGEST_KEY]: {
      type: "object",
      scope: ConfigurationScope.RESOURCE,
      title: nls.localize(
        "chat.promptFilesRecommendations.title",
        "Prompt File Recommendations"
      ),
      markdownDescription: nls.localize(
        "chat.promptFilesRecommendations.description",
        "Configure which prompt files to recommend in the chat welcome view. Each key is a prompt file name, and the value can be `true` to always recommend, `false` to never recommend, or a [when clause](https://aka.ms/vscode-when-clause) expression like `resourceExtname == .js` or `resourceLangId == markdown`."
      ),
      default: {},
      additionalProperties: {
        oneOf: [
          { type: "boolean" },
          { type: "string" }
        ]
      },
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          "plan": true,
          "a11y-audit": "resourceExtname == .html",
          "document": "resourceLangId == markdown"
        }
      ]
    },
    [ChatConfiguration.TodosShowWidget]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.tools.todos.showWidget", "Controls whether to show the todo list widget above the chat input. When enabled, the widget displays todo items created by the agent and updates as progress is made.")
    },
    [ChatConfiguration.ThinkingStyle]: {
      type: "string",
      default: "fixedScrolling",
      enum: ["collapsed", "collapsedPreview", "fixedScrolling"],
      enumDescriptions: [
        nls.localize("chat.agent.thinkingMode.collapsed", "Thinking parts will be collapsed by default."),
        nls.localize("chat.agent.thinkingMode.collapsedPreview", "Thinking parts will be expanded first, then collapse once we reach a part that is not thinking."),
        nls.localize("chat.agent.thinkingMode.fixedScrolling", "Show thinking in a fixed-height streaming panel that auto-scrolls; click header to expand to full height.")
      ],
      description: nls.localize("chat.agent.thinkingStyle", "Controls how thinking is rendered."),
      tags: ["experimental"]
    },
    [ChatConfiguration.ThinkingGenerateTitles]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.agent.thinking.generateTitles", "Controls whether to use an LLM to generate summary titles for thinking sections."),
      tags: ["experimental"]
    },
    "chat.agent.thinking.collapsedTools": {
      type: "string",
      default: "always",
      enum: ["off", "withThinking", "always"],
      enumDescriptions: [
        nls.localize("chat.agent.thinking.collapsedTools.off", "Tool calls are shown separately, not collapsed into thinking."),
        nls.localize("chat.agent.thinking.collapsedTools.withThinking", "Tool calls are collapsed into thinking sections when thinking is present."),
        nls.localize("chat.agent.thinking.collapsedTools.always", "Tool calls are always collapsed, even without thinking.")
      ],
      markdownDescription: nls.localize("chat.agent.thinking.collapsedTools", "Controls how tool calls are displayed in relation to thinking sections."),
      tags: ["experimental"]
    },
    [ChatConfiguration.TerminalToolsInThinking]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.agent.thinking.terminalTools", "When enabled, terminal tool calls are displayed inside the thinking dropdown with a simplified view."),
      tags: ["experimental"]
    },
    [ChatConfiguration.SimpleTerminalCollapsible]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.tools.terminal.simpleCollapsible", "When enabled, terminal tool calls are always displayed in a collapsible container with a simplified view."),
      tags: ["experimental"]
    },
    [ChatConfiguration.CompressOutputEnabled]: {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("chat.tools.compressOutput.enabled", "Post-process tool output (for example `git diff`, `ls -l`, or `npm install`) to reduce token usage before it is sent to the model."),
      tags: ["preview"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ThinkingPhrases]: {
      type: "object",
      default: {
        mode: "append",
        phrases: []
      },
      properties: {
        mode: {
          type: "string",
          enum: ["replace", "append"],
          default: "append",
          description: nls.localize("chat.agent.thinking.phrases.mode", "'replace' replaces all default phrases entirely; 'append' adds your phrases to all default categories.")
        },
        phrases: {
          type: "array",
          items: { type: "string" },
          default: [],
          description: nls.localize("chat.agent.thinking.phrases.phrases", "Custom loading messages to show during thinking, working progress, terminal, and tool operations.")
        }
      },
      additionalProperties: false,
      markdownDescription: nls.localize("chat.agent.thinking.phrases", 'Customize the loading messages shown during agent thinking and progress indicators. Use `"mode": "replace"` to use only your phrases, or `"mode": "append"` to add them to the defaults.'),
      tags: ["experimental"]
    },
    [ChatConfiguration.AutoExpandToolFailures]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.tools.autoExpandFailures", "When enabled, terminal tool failures are automatically expanded in the chat UI to show error details.")
    },
    [ChatAIDisabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.disableAIFeatures", "Disable and hide built-in AI features provided by GitHub Copilot, including chat and inline suggestions."),
      default: false,
      scope: ConfigurationScope.WINDOW
    },
    [ChatConfiguration.TitleBarSignInEnabled]: {
      type: "boolean",
      description: nls.localize("chat.titleBar.signIn.enabled", "Controls whether the Copilot Sign In button is shown in the title bar when signed out. When disabled, the Sign In affordance falls back to the status bar."),
      default: true
    },
    [ChatConfiguration.TitleBarOpenInAgentsWindowEnabled]: {
      type: "boolean",
      description: nls.localize("chat.titleBar.openInAgentsWindow.enabled", "Controls whether the Open in Agents Window button is shown in the title bar."),
      default: true
    },
    "chat.approvedAccountOrganizations": {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.approvedAccountOrganizations", "List of GitHub organization logins whose members are permitted to use AI features. When set to a non-empty list, AI features are disabled until the user signs into a GitHub account that belongs to one of the specified organizations and account-level policy data has been resolved. Set to '*' to allow any authenticated GitHub or GitHub Enterprise account."),
      default: [],
      included: false,
      policy: {
        name: "ChatApprovedAccountOrganizations",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.118",
        localization: {
          description: {
            key: "chat.approvedAccountOrganizations.policy.description",
            value: nls.localize("chat.approvedAccountOrganizations.policy.description", "Setting this policy to a non-empty list activates the Approved Account gate: all AI features are disabled until the user signs into a GitHub account whose organizations intersect this list AND the account-side policy data has resolved. Comparison is case-insensitive. Use '*' as a wildcard to accept any signed-in GitHub or GHE account (use this for GHE deployments where the organization list is not surfaced).")
          }
        }
      }
    },
    "chat.allowAnonymousAccess": {
      // TODO@bpasero remove me eventually
      type: "boolean",
      description: nls.localize("chat.allowAnonymousAccess", "Controls whether anonymous access is allowed in chat."),
      default: false,
      included: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.GrowthNotificationEnabled]: {
      type: "boolean",
      description: nls.localize("chat.growthNotification", "Controls whether to show a growth notification in the agent sessions view to encourage new users to try Copilot."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.RestoreLastPanelSession]: {
      type: "boolean",
      description: nls.localize("chat.restoreLastPanelSession", "Controls whether the last session is restored in panel after restart."),
      default: false
    },
    [ChatConfiguration.ExitAfterDelegation]: {
      type: "boolean",
      description: nls.localize("chat.exitAfterDelegation", "Controls whether the chat panel automatically exits after delegating a request to another session."),
      default: false,
      tags: ["preview"]
    },
    "chat.extensionUnification.enabled": {
      type: "boolean",
      description: nls.localize("chat.extensionUnification.enabled", "Enables the unification of GitHub Copilot extensions. When enabled, all GitHub Copilot functionality is served from the GitHub Copilot Chat extension. When disabled, the GitHub Copilot and GitHub Copilot Chat extensions operate independently."),
      default: true,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: {
      type: "boolean",
      description: nls.localize("chat.subagents.allowInvocationsFromSubagents", "Allow subagents to invoke subagents."),
      markdownDescription: nls.localize("chat.subagents.allowInvocationsFromSubagents.md", "Controls whether subagents can invoke other subagents. When enabled, nesting is limited to a maximum depth of 5."),
      default: false,
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.SubagentsUseRichRendering]: {
      type: "boolean",
      description: nls.localize("chat.subagents.useRichRendering", "Controls whether subagents in chat editors use a rich presentation that opens each subagent in its own editor instead of rendering its full activity inline in the parent chat."),
      default: true
    },
    [ChatConfiguration.CollectInstructionsInExtension]: {
      type: "boolean",
      description: nls.localize("chat.experimental.collectInstructionsInExtension", "When enabled, automatic instruction collection (.instructions.md, agent instructions, customizations index) is performed by the GitHub Copilot Chat extension instead of the core workbench."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: {
      type: "boolean",
      tags: ["preview"],
      description: nls.localize("chat.customizations.structuredPreview.enabled", "Controls whether the Chat Customizations editor shows a structured preview for markdown customization files (agents, skills, instructions, prompts). When disabled, the editor always opens the raw markdown in the embedded code editor."),
      default: false
    },
    [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: {
      type: "boolean",
      tags: ["experimental"],
      description: nls.localize("chat.customizations.promptMigration.enabled", "Controls whether the Chat Customizations editor offers to convert prompt files into skills for agent-host harnesses, which ignore prompt files. When disabled, the migration card and sidebar shortcut are hidden."),
      default: false
    },
    [ChatConfiguration.ChatCustomizationsUserDataMigrationEnabled]: {
      type: "boolean",
      tags: ["experimental"],
      description: nls.localize("chat.customizations.userDataMigration.enabled", "Controls whether the Chat Customizations editor offers to move agents and instructions stored in user data to the active agent-host harness, which ignores the user data location. When disabled, the migration card and sidebar shortcut are hidden."),
      default: false
    }
  }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ChatEditor,
    ChatEditorInput.EditorID,
    nls.localize("chat", "Chat")
  ),
  [
    new SyncDescriptor(ChatEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ChatDebugEditor,
    ChatDebugEditorInput.ID,
    nls.localize("chatDebug", "Debug View")
  ),
  [
    new SyncDescriptor(ChatDebugEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    AgentPluginEditor,
    AgentPluginEditor.ID,
    nls.localize("agentPlugin", "Agent Plugin")
  ),
  [
    new SyncDescriptor(AgentPluginEditorInput)
  ]
);
function isStringKeyedObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function migrateChatDefaultConfiguration(value) {
  if (!isStringKeyedObject(value)) {
    return void 0;
  }
  let approvals;
  switch (value.approvals) {
    case ChatPermissionLevel.Default:
      approvals = ChatDefaultPermissionLevel.Manual;
      break;
    case ChatPermissionLevel.AutoApprove:
      approvals = ChatDefaultPermissionLevel.AllowAll;
      break;
    default:
      return void 0;
  }
  return { ...value, approvals };
}
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([
  {
    key: "chat.agentSessions.defaultConfiguration",
    migrateFn: (value, _accessor) => [
      ["chat.agentSessions.defaultConfiguration", { value: void 0 }],
      [ChatConfiguration.DefaultConfiguration, { value: migrateChatDefaultConfiguration(value) ?? value }]
    ]
  },
  {
    key: ChatConfiguration.DefaultConfiguration,
    migrateFn: (value) => ({ value: migrateChatDefaultConfiguration(value) ?? value })
  },
  {
    key: "chat.experimental.autoApprovals.enabled",
    migrateFn: (value, accessor) => {
      const pairs = [["chat.experimental.autoApprovals.enabled", { value: void 0 }]];
      if (accessor(ChatConfiguration.AssistedPermissionsEnabled) === void 0) {
        pairs.push([ChatConfiguration.AssistedPermissionsEnabled, { value }]);
      }
      return pairs;
    }
  },
  {
    key: "chat.experimental.detectParticipant.enabled",
    migrateFn: (value, _accessor) => [
      ["chat.experimental.detectParticipant.enabled", { value: void 0 }],
      ["chat.detectParticipant.enabled", { value: value !== false }]
    ]
  },
  {
    key: "chat.useCopilotModelsForUtilityModels",
    migrateFn: (value, valueAccessor) => {
      const result = [["chat.useCopilotModelsForUtilityModels", { value: void 0 }]];
      if (typeof value === "boolean" && valueAccessor(ChatConfiguration.BYOKUtilityModelDefault) === void 0) {
        result.push([ChatConfiguration.BYOKUtilityModelDefault, { value: value ? BYOKUtilityModelDefault.Copilot : BYOKUtilityModelDefault.None }]);
      }
      return result;
    }
  },
  {
    key: "chat.useClaudeSkills",
    migrateFn: (value, _accessor) => [
      ["chat.useClaudeSkills", { value: void 0 }],
      ["chat.useAgentSkills", { value }]
    ]
  },
  {
    key: mcpDiscoverySection,
    migrateFn: (value) => {
      if (typeof value === "boolean") {
        return { value: Object.fromEntries(allDiscoverySources.map((k) => [k, value])) };
      }
      return { value };
    }
  },
  {
    key: ChatConfiguration.NotifyWindowOnConfirmation,
    migrateFn: (value) => {
      if (value === true) {
        return { value: ChatNotificationMode.WindowNotFocused };
      } else if (value === false) {
        return { value: ChatNotificationMode.Off };
      }
      return [];
    }
  },
  {
    key: ChatConfiguration.NotifyWindowOnResponseReceived,
    migrateFn: (value) => {
      if (value === true) {
        return { value: ChatNotificationMode.WindowNotFocused };
      } else if (value === false) {
        return { value: ChatNotificationMode.Off };
      }
      return [];
    }
  },
  {
    key: "chat.plugins.paths",
    migrateFn: (value, _accessor) => [
      ["chat.plugins.paths", { value: void 0 }],
      [ChatConfiguration.PluginLocations, { value }]
    ]
  },
  {
    // The on-device dictation runtime moved to Foundry Local; the old
    // transformers.js/onnxruntime model IDs no longer resolve and would fail
    // with an unknown-model error. Map any explicitly-stored legacy value to
    // the new default so existing users keep working. Also migrate the setting
    // from its old `chat.speechToText.model` id to `dictation.model`.
    key: "chat.speechToText.model",
    migrateFn: (value, accessor) => {
      const legacyModelIds = [
        "onnx-community/whisper-tiny",
        "onnx-community/whisper-base",
        "onnx-community/whisper-small",
        "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4",
        "nemotron-speech-streaming-en-0.6b"
      ];
      const migrated = typeof value === "string" && legacyModelIds.includes(value) ? DEFAULT_LOCAL_TRANSCRIPTION_MODEL : value;
      const pairs = [["chat.speechToText.model", { value: void 0 }]];
      if (accessor("dictation.model") === void 0) {
        pairs.push(["dictation.model", { value: migrated }]);
      }
      return pairs;
    }
  },
  {
    // Existing users may have the former English-only default stored
    // explicitly. Move them to the multilingual replacement as well.
    key: "dictation.model",
    migrateFn: (value) => ({
      value: value === "nemotron-speech-streaming-en-0.6b" ? DEFAULT_LOCAL_TRANSCRIPTION_MODEL : value
    })
  },
  {
    // Dictation settings were regrouped under the top-level `dictation.*`
    // namespace (they govern dictation across chat, editor, and terminal).
    key: "chat.speechToText.enabled",
    migrateFn: (value, accessor) => {
      const pairs = [["chat.speechToText.enabled", { value: void 0 }]];
      if (accessor("dictation.enabled") === void 0) {
        pairs.push(["dictation.enabled", { value }]);
      }
      return pairs;
    }
  },
  {
    // `chat.speechToText.mode` was removed (the shortcut is always tap-toggle /
    // hold-to-talk); clear it so it does not linger as an unknown setting.
    key: "chat.speechToText.mode",
    migrateFn: () => [["chat.speechToText.mode", { value: void 0 }]]
  }
]);
let ChatResolverContribution = class extends Disposable {
  constructor(chatSessionsService, editorResolverService, instantiationService) {
    super();
    this.editorResolverService = editorResolverService;
    this.instantiationService = instantiationService;
    this._editorRegistrations = this._register(new DisposableMap());
    this._registerEditor(Schemas.vscodeChatEditor);
    this._registerEditor(Schemas.vscodeLocalChatSession);
    this._register(chatSessionsService.onDidChangeContentProviderSchemes((e) => {
      for (const scheme of e.added) {
        this._registerEditor(scheme);
      }
      for (const scheme of e.removed) {
        this._editorRegistrations.deleteAndDispose(scheme);
      }
    }));
    for (const scheme of chatSessionsService.getContentProviderSchemes()) {
      this._registerEditor(scheme);
    }
  }
  _registerEditor(scheme) {
    this._editorRegistrations.set(scheme, this.editorResolverService.registerEditor(
      `${scheme}:**/**`,
      {
        id: ChatEditorInput.EditorID,
        label: nls.localize("chat", "Chat"),
        priority: RegisteredEditorPriority.builtin
      },
      {
        singlePerResource: true,
        canSupportResource: (resource) => resource.scheme === scheme
      },
      {
        createEditorInput: ({ resource, options }) => {
          return {
            editor: this.instantiationService.createInstance(ChatEditorInput, resource, options),
            options
          };
        }
      }
    ));
  }
};
ChatResolverContribution.ID = "workbench.contrib.chatResolver";
ChatResolverContribution = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, IInstantiationService)
], ChatResolverContribution);
let CopilotTelemetryContribution = class extends Disposable {
  constructor(telemetryService, chatEntitlementService) {
    super();
    this.telemetryService = telemetryService;
    this.chatEntitlementService = chatEntitlementService;
    this.updateCommonProperties();
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.updateCommonProperties();
    }));
  }
  updateCommonProperties() {
    const copilotTrackingId = this.chatEntitlementService.copilotTrackingId;
    if (copilotTrackingId) {
      this.telemetryService.setCommonProperty("common.copilotTrackingId", copilotTrackingId);
    }
    if (this.chatEntitlementService.isInternal) {
      this.telemetryService.setCommonProperty("common.msftInternal", true);
    }
  }
};
CopilotTelemetryContribution.ID = "workbench.contrib.copilotTelemetry";
CopilotTelemetryContribution = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IChatEntitlementService)
], CopilotTelemetryContribution);
let ChatDebugResolverContribution = class {
  constructor(editorResolverService) {
    editorResolverService.registerEditor(
      `${ChatDebugEditorInput.RESOURCE.scheme}:**/**`,
      {
        id: ChatDebugEditorInput.ID,
        label: nls.localize("chatDebug", "Debug View"),
        priority: RegisteredEditorPriority.exclusive
      },
      {
        singlePerResource: true,
        canSupportResource: (resource) => resource.scheme === ChatDebugEditorInput.RESOURCE.scheme
      },
      {
        createEditorInput: () => {
          return {
            editor: ChatDebugEditorInput.instance,
            options: { pinned: true }
          };
        }
      }
    );
  }
};
ChatDebugResolverContribution.ID = "workbench.contrib.chatDebugResolver";
ChatDebugResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService)
], ChatDebugResolverContribution);
let ChatAgentSettingContribution = class extends Disposable {
  constructor(experimentService, entitlementService, contextKeyService) {
    super();
    this.experimentService = experimentService;
    this.entitlementService = entitlementService;
    this.contextKeyService = contextKeyService;
    this.newChatButtonExperimentIcon = ChatContextKeys.newChatButtonExperimentIcon.bindTo(this.contextKeyService);
    this.registerMaxRequestsSetting();
    this.registerNewChatButtonIcon();
    this.registerDefaultModeSetting();
  }
  registerMaxRequestsSetting() {
    let lastNode;
    const registerMaxRequestsSetting = () => {
      const treatmentId = this.entitlementService.entitlement === ChatEntitlement.Free ? "chatAgentMaxRequestsFree" : "chatAgentMaxRequestsPro";
      this.experimentService.getTreatment(treatmentId).then((value) => {
        const node = {
          id: "chatSidebar",
          title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
          type: "object",
          properties: {
            "chat.agent.maxRequests": {
              type: "number",
              markdownDescription: nls.localize("chat.agent.maxRequests", "The maximum number of requests to allow per-turn when using an agent. When the limit is reached, will ask to confirm to continue."),
              default: value ?? 50,
              order: 2,
              agentsWindow: { default: 1e3 }
            }
          }
        };
        configurationRegistry.updateConfigurations({ remove: lastNode ? [lastNode] : [], add: [node] });
        lastNode = node;
      });
    };
    this._register(Event.runAndSubscribe(Event.debounce(this.entitlementService.onDidChangeEntitlement, () => {
    }, 1e3), () => registerMaxRequestsSetting()));
  }
  registerNewChatButtonIcon() {
    this.experimentService.getTreatment("chatNewButtonIcon").then((value) => {
      const supportedValues = ["copilot", "new-session", "comment"];
      if (typeof value === "string" && supportedValues.includes(value)) {
        this.newChatButtonExperimentIcon.set(value);
      } else {
        this.newChatButtonExperimentIcon.reset();
      }
    });
  }
  registerDefaultModeSetting() {
    this.experimentService.getTreatment("chatDefaultNewSessionMode").then((value) => {
      const node = {
        id: "chatSidebar",
        title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
        type: "object",
        properties: {
          [ChatConfiguration.DefaultNewSessionMode]: {
            type: "string",
            description: nls.localize("chat.newSession.defaultMode", "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
            default: typeof value === "string" ? value : ""
          }
        }
      };
      configurationRegistry.updateConfigurations({ add: [node], remove: [] });
    });
  }
};
ChatAgentSettingContribution.ID = "workbench.contrib.chatAgentSetting";
ChatAgentSettingContribution = __decorateClass([
  __decorateParam(0, IWorkbenchAssignmentService),
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, IContextKeyService)
], ChatAgentSettingContribution);
let ChatForegroundSessionCountContribution = class extends Disposable {
  constructor(contextKeyService, chatWidgetService, viewsService) {
    super();
    this.contextKeyService = contextKeyService;
    this.chatWidgetService = chatWidgetService;
    this.viewsService = viewsService;
    this.foregroundSessionCountContextKey = ChatContextKeys.foregroundSessionCount.bindTo(this.contextKeyService);
    this._register(this.chatWidgetService.onDidAddWidget(() => {
      this.updateForegroundSessionCount();
    }));
    this._register(this.chatWidgetService.onDidChangeWidgetVisibility(() => {
      this.updateForegroundSessionCount();
    }));
    this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, (e) => e.id === ChatViewId)(() => {
      this.updateForegroundSessionCount();
    }));
    this.updateForegroundSessionCount();
  }
  updateForegroundSessionCount() {
    let count = this.viewsService.isViewVisible(ChatViewId) ? 1 : 0;
    for (const widget of this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)) {
      if (!widget.visible) {
        continue;
      }
      if (isIChatViewViewContext(widget.viewContext)) {
        continue;
      }
      if (isIChatResourceViewContext(widget.viewContext) && widget.viewContext.isQuickChat) {
        continue;
      }
      count++;
    }
    this.foregroundSessionCountContextKey.set(count);
  }
};
ChatForegroundSessionCountContribution.ID = "workbench.contrib.chatForegroundSessionCount";
ChatForegroundSessionCountContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IViewsService)
], ChatForegroundSessionCountContribution);
function getCustomModesWithUniqueNames(builtinModes, customModes) {
  const customModeIds = /* @__PURE__ */ new Set();
  const builtinNames = new Set(builtinModes.map((mode) => mode.name.get()));
  const customNameToId = /* @__PURE__ */ new Map();
  for (const mode of customModes) {
    const modeName = mode.name.get();
    if (builtinNames.has(modeName)) {
      continue;
    }
    const existingId = customNameToId.get(modeName);
    if (existingId) {
      customModeIds.delete(existingId);
    }
    customNameToId.set(modeName, mode.id);
    customModeIds.add(mode.id);
  }
  return customModeIds;
}
let ChatAgentActionsContribution = class extends Disposable {
  constructor(_chatModeService, chatWidgetService) {
    super();
    this.chatWidgetService = chatWidgetService;
    this._modeActionDisposables = new DisposableMap();
    this._store.add(this._modeActionDisposables);
    const focusedWidget = observableFromEvent(this, this.chatWidgetService.onDidChangeFocusedSession, () => this.chatWidgetService.lastFocusedWidget);
    this._register(autorun((reader) => {
      const chatModes = focusedWidget.read(reader)?.input.currentChatModesObs.read(reader);
      this._syncModeActions(chatModes);
    }));
  }
  _syncModeActions(chatModes) {
    if (!chatModes) {
      this._modeActionDisposables.clearAndDisposeAll();
      return;
    }
    const { builtin, custom } = chatModes;
    const currentModeIds = getCustomModesWithUniqueNames(builtin, custom);
    for (const modeId of this._modeActionDisposables.keys()) {
      if (!currentModeIds.has(modeId)) {
        this._modeActionDisposables.deleteAndDispose(modeId);
      }
    }
    for (const mode of custom) {
      if (currentModeIds.has(mode.id) && !this._modeActionDisposables.has(mode.id)) {
        this._registerModeAction(mode);
      }
    }
  }
  _registerModeAction(mode) {
    const actionClass = class extends ModeOpenChatGlobalAction {
      constructor() {
        super(mode);
      }
    };
    this._modeActionDisposables.set(mode.id, registerAction2(actionClass));
  }
};
ChatAgentActionsContribution.ID = "workbench.contrib.chatAgentActions";
ChatAgentActionsContribution = __decorateClass([
  __decorateParam(0, IChatModeService),
  __decorateParam(1, IChatWidgetService)
], ChatAgentActionsContribution);
let HookSchemaAssociationContribution = class extends Disposable {
  constructor(_configurationService, _pathService) {
    super();
    this._configurationService = _configurationService;
    this._pathService = _pathService;
    this._registrations = this._register(new DisposableStore());
    this._updateAssociations();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PromptsConfig.HOOKS_LOCATION_KEY)) {
        this._updateAssociations();
      }
    }));
  }
  async _updateAssociations() {
    this._registrations.clear();
    const folders = PromptsConfig.promptSourceFolders(this._configurationService, PromptsType.hook);
    const userHomeUri = await this._pathService.userHome();
    const userHome = userHomeUri.fsPath ?? userHomeUri.path;
    for (const folder of folders) {
      if (folder.source === PromptFileSource.ClaudeWorkspace || folder.source === PromptFileSource.ClaudeWorkspaceLocal || folder.source === PromptFileSource.ClaudePersonal) {
        continue;
      }
      const resolvedPath = isTildePath(folder.path) ? userHome + folder.path.substring(1) : folder.path;
      const glob = resolvedPath.toLowerCase().endsWith(".json") ? resolvedPath : `${resolvedPath}/*.json`;
      this._registrations.add(
        jsonContributionRegistry.registerSchemaAssociation(HOOK_SCHEMA_URI, glob)
      );
    }
  }
};
HookSchemaAssociationContribution.ID = "workbench.contrib.hookSchemaAssociation";
HookSchemaAssociationContribution = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IPathService)
], HookSchemaAssociationContribution);
let ToolReferenceNamesContribution = class extends Disposable {
  constructor(_languageModelToolsService) {
    super();
    this._languageModelToolsService = _languageModelToolsService;
    this._updateToolReferenceNames();
    this._register(this._languageModelToolsService.onDidChangeTools(() => this._updateToolReferenceNames()));
  }
  _updateToolReferenceNames() {
    const tools = Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled()).filter((tool) => typeof tool.toolReferenceName === "string").sort((a, b) => a.toolReferenceName.localeCompare(b.toolReferenceName));
    toolReferenceNameEnumValues.length = 0;
    toolReferenceNameEnumDescriptions.length = 0;
    for (const tool of tools) {
      toolReferenceNameEnumValues.push(tool.toolReferenceName);
      toolReferenceNameEnumDescriptions.push(nls.localize(
        "chat.toolReferenceName.description",
        "{0} - {1}",
        tool.toolReferenceName,
        tool.userDescription || tool.displayName
      ));
    }
    configurationRegistry.notifyConfigurationSchemaUpdated({
      id: "chatSidebar",
      properties: {
        [ChatConfiguration.EligibleForAutoApproval]: {}
      }
    });
  }
};
ToolReferenceNamesContribution.ID = "workbench.contrib.toolReferenceNames";
ToolReferenceNamesContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService)
], ToolReferenceNamesContribution);
let ChatSpeechToTextInitContribution = class {
  constructor(_chatSpeechToTextService) {
  }
};
ChatSpeechToTextInitContribution.ID = "workbench.contrib.chatSpeechToTextInit";
ChatSpeechToTextInitContribution = __decorateClass([
  __decorateParam(0, IChatSpeechToTextService)
], ChatSpeechToTextInitContribution);
AccessibleViewRegistry.register(new ChatTerminalOutputAccessibleView());
AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new PanelChatAccessibilityHelp());
AccessibleViewRegistry.register(new QuickChatAccessibilityHelp());
AccessibleViewRegistry.register(new EditsChatAccessibilityHelp());
AccessibleViewRegistry.register(new AgentChatAccessibilityHelp());
AccessibleViewRegistry.register(new ChatInputWindowAccessibilityHelp());
AccessibleViewRegistry.register(new ChatFindAccessibilityHelp());
registerEditorFeature(ChatInputBoxContentProvider);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatDebugEditorInput.ID, ChatDebugEditorInputSerializer);
registerWorkbenchContribution2(CopilotTelemetryContribution.ID, CopilotTelemetryContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSpeechToTextInitContribution.ID, ChatSpeechToTextInitContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatDebugResolverContribution.ID, ChatDebugResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(PromptsDebugContribution.ID, PromptsDebugContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(AgentHostChatDebugContribution.ID, AgentHostChatDebugContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatLanguageModelsDataContribution.ID, ChatLanguageModelsDataContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSlashCommandsContribution.ID, ChatSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSessionOptionSlashCommandsContribution.ID, ChatSessionOptionSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatOutlineCreator.ID, ChatOutlineCreator, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatPromptFilesExtensionPointHandler.ID, ChatPromptFilesExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(CodeBlockActionRendering.ID, CodeBlockActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCopyActionRendering.ID, ChatCopyActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatImplicitContextContribution.ID, ChatImplicitContextContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatViewsWelcomeHandler.ID, ChatViewsWelcomeHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatGettingStartedContribution.ID, ChatGettingStartedContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSetupContribution.ID, ChatSetupContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatQuotaNotificationContribution.ID, ChatQuotaNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatPromoNotificationContribution.ID, ChatPromoNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(HasByokModelsContribution.ID, HasByokModelsContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatTeardownContribution.ID, ChatTeardownContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatStatusBarEntry.ID, ChatStatusBarEntry, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(BuiltinToolsContribution.ID, BuiltinToolsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ClientToolSetsContribution.ID, ClientToolSetsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(UsagesToolContribution.ID, UsagesToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(RenameToolContribution.ID, RenameToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatAgentSettingContribution.ID, ChatAgentSettingContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatForegroundSessionCountContribution.ID, ChatForegroundSessionCountContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentActionsContribution.ID, ChatAgentActionsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(HookSchemaAssociationContribution.ID, HookSchemaAssociationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ToolReferenceNamesContribution.ID, ToolReferenceNamesContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentRecommendation.ID, ChatAgentRecommendation, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatEditingEditorAccessibility.ID, ChatEditingEditorAccessibility, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatQueuePickerRendering.ID, ChatQueuePickerRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingEditorOverlay.ID, ChatEditingEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorContextKeys.ID, ChatEditingEditorContextKeys, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatTransferContribution.ID, ChatTransferContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatContextContributions.ID, ChatContextContributions, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PromptUrlHandler.ID, PromptUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(PluginUrlHandler.ID, PluginUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatResponseResourceWorkbenchContribution.ID, ChatResponseResourceWorkbenchContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(UserToolSetsContributions.ID, UserToolSetsContributions, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(PromptLanguageFeaturesProvider.ID, PromptLanguageFeaturesProvider, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatWindowNotifier.ID, ChatWindowNotifier, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatRepoInfoContribution.ID, ChatRepoInfoContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AgentPluginRecommendations.ID, AgentPluginRecommendations, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AgentPluginCommandsContribution.ID, AgentPluginCommandsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PluginAutoUpdate.ID, PluginAutoUpdate, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatReferenceAttachmentWidgetContribution.ID, ChatReferenceAttachmentWidgetContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(TranscriptContextAttachmentWidgetContribution.ID, TranscriptContextAttachmentWidgetContribution, WorkbenchPhase.AfterRestored);
registerChatActions();
registerChatAccessibilityActions();
registerChatCopyActions();
registerChatOpenAgentDebugPanelAction();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatPromptNavigationActions();
registerChatTitleActions();
registerChatExecuteActions();
registerChatFindActions();
registerAction2(ChatVoiceInputModeAction);
registerAction2(ChatVoiceInputModeToggleListenAction);
registerVoiceInputModeSimulateActions();
registerChatSpeechToTextActions();
registerConfigureSpeechInstructionsActions();
registerChatQueueActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();
registerChatContextActions();
registerChatDeveloperActions();
registerChatEditorActions();
registerChatElicitationActions();
registerChatToolActions();
registerLanguageModelActions();
registerChatPluginActions();
registerAction2(ConfigureToolSets);
registerEditorFeature(ChatPasteProvidersFeature);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ConfiguredAgentPluginDiscovery), AgentPluginDiscoveryPriority.Configured);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(MarketplaceAgentPluginDiscovery), AgentPluginDiscoveryPriority.Marketplace);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ExtensionAgentPluginDiscovery), AgentPluginDiscoveryPriority.Extension);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(CopilotCliAgentPluginDiscovery), AgentPluginDiscoveryPriority.CopilotCli);
registerSingleton(IChatResponseResourceFileSystemProvider, ChatResponseResourceFileSystemProvider, InstantiationType.Delayed);
registerSingleton(IChatSpeechToTextService, ChatSpeechToTextService, InstantiationType.Eager);
registerSingleton(IChatTransferService, ChatTransferService, InstantiationType.Delayed);
registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IChatPasteTargetService, ChatPasteTargetService, InstantiationType.Delayed);
registerSingleton(IChatSideChatService, ChatSideChatService, InstantiationType.Delayed);
registerSingleton(IChatRequestOriginService, ChatRequestOriginService, InstantiationType.Delayed);
registerSingleton(IChatPetService, ChatPetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsConfigurationService, LanguageModelsConfigurationService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ISessionRouter, SessionRouterService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(IAgentPluginService, AgentPluginService, InstantiationType.Delayed);
registerSingleton(IPluginMarketplaceService, PluginMarketplaceService, InstantiationType.Delayed);
registerSingleton(IWorkspacePluginSettingsService, WorkspacePluginSettingsService, InstantiationType.Delayed);
registerSingleton(IAgentPluginRepositoryService, AgentPluginRepositoryService, InstantiationType.Delayed);
registerSingleton(IPluginGitService, BrowserPluginGitCommandService, InstantiationType.Delayed);
registerSingleton(IPluginInstallService, PluginInstallService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IToolResultCompressor, ToolResultCompressorService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, InstantiationType.Delayed);
registerSingleton(IChatToolRiskAssessmentService, ChatToolRiskAssessmentService, InstantiationType.Delayed);
registerSingleton(IChatGoalSummaryService, ChatGoalSummaryService, InstantiationType.Delayed);
registerSingleton(IChatSubmitRequestHandlerService, ChatSubmitRequestHandlerService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
registerSingleton(ICodeMapperService, CodeMapperService, InstantiationType.Delayed);
registerSingleton(IChatEditingService, ChatEditingService, InstantiationType.Delayed);
registerSingleton(IChatMarkdownAnchorService, ChatMarkdownAnchorService, InstantiationType.Delayed);
registerSingleton(IAgentNetworkFilterService, AgentNetworkFilterService, InstantiationType.Delayed);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, InstantiationType.Delayed);
registerSingleton(IPromptsService, PromptsService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, ChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatModeService, ChatModeService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentResolveService, ChatAttachmentResolveService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentWidgetRegistry, ChatAttachmentWidgetRegistry, InstantiationType.Delayed);
registerSingleton(IChatTodoListService, ChatTodoListService, InstantiationType.Delayed);
registerSingleton(IChatArtifactsService, ChatArtifactsService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, InstantiationType.Delayed);
registerSingleton(IChatLayoutService, ChatLayoutService, InstantiationType.Delayed);
registerSingleton(IPlanReviewFeedbackService, PlanReviewFeedbackService, InstantiationType.Delayed);
registerSingleton(IChatTipService, ChatTipService, InstantiationType.Delayed);
registerSingleton(IChatDebugService, ChatDebugServiceImpl, InstantiationType.Delayed);
registerSingleton(IChatImageCarouselService, ChatImageCarouselService, InstantiationType.Delayed);
registerSingleton(IAgentHostImportConversationStore, AgentHostImportConversationStore, InstantiationType.Delayed);
ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXQuc2hhcmVkLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgUG9saWN5Q2F0ZWdvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJFZGl0b3JGZWF0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE1hcExlZ2FjeVNldHRpbmdzVG9NYW5hZ2VkU2V0dGluZ3NTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RFZGl0QXV0b0FwcHJvdmVQYXR0ZXJuc0NvbmZpZ0tleSwgQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUsIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0TWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFNob3dFeHRlcm5hbFNlc3Npb25zQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFN0YXJ0ZXIuY29uZmlnLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBaHBKc29ubExvZ2dpbmdTZXR0aW5nSWQsIEFnZW50SG9zdEFsbG93U2lnbmVkT3V0V2hlblVzYWJsZVNldHRpbmdJZCwgQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdFNka1NhbmRib3hXaW5kb3dzRW5hYmxlZFNldHRpbmdJZCwgQ29kZXhQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb3BpbG90TW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzU2V0dGluZ0lkLCBBZ2VudEhvc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nSWQsIEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdE9wdXM0OFByb21wdEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlU2V0dGluZ0lkLCBBZ2VudEhvc3RSZWFzb25pbmdTdW1tYXJ5RW5hYmxlZFNldHRpbmdJZCwgQWdlbnRIb3N0VG9vbFNlYXJjaERlZmVyVGhyZXNob2xkU2V0dGluZ0lkLCBBZ2VudEhvc3RUb29sU2VhcmNoRW5hYmxlZFNldHRpbmdJZCwgY29waWxvdFNka0xvZ0xldmVsU2V0dGluZ1ZhbHVlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRfQVVUT19BUFBST1ZFX1BBVFRFUk5TLCBtZXJnZUNoYXRFZGl0QXV0b0FwcHJvdmVQYXR0ZXJucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyByZWFzb25pbmdFZmZvcnRMZXZlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlYXNvbmluZ0VmZm9ydC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vc2Vzc2lvbkFyY2hpdmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2NhbFRyYW5zY3JpcHRpb24vY29tbW9uL2xvY2FsVHJhbnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBNY3BBY2Nlc3NWYWx1ZSwgTWNwQXV0b1N0YXJ0VmFsdWUsIG1jcEFjY2Vzc0NvbmZpZywgbWNwQWxsb3dlZFNlcnZlcnNDb25maWcsIG1jcEFwcHNFbmFibGVkQ29uZmlnLCBtY3BBdXRvU3RhcnRDb25maWcsIG1jcERlbmllZFNlcnZlcnNDb25maWcsIG1jcEdhbGxlcnlTZXJ2aWNlRW5hYmxlbWVudENvbmZpZywgbWNwR2FsbGVyeVNlcnZpY2VVcmxDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRmlsdGVyU2VydmljZSwgSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9uZXR3b3JrRmlsdGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uZXR3b3JrRmlsdGVyL2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0FMTE9XRURfTUNQX1NFUlZFUlNfS0VZLCBDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9DT05GSUcsIENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0tFWSwgQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfQ09ORklHLCBDT1BJTE9UX0FMTE9XX01BTkFHRURfTUNQX1NFUlZFUlNfT05MWV9LRVksIENPUElMT1RfREVOSUVEX01DUF9TRVJWRVJTX0tFWSwgQ09QSUxPVF9ESVNBQkxFX0JZUEFTU19QRVJNSVNTSU9OU19NT0RFX0tFWSwgQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZLCBDT1BJTE9UX0VYVFJBX01BUktFVFBMQUNFU19LRVksIENPUElMT1RfTU9ERUxfS0VZLCBDT1BJTE9UX1NUUklDVF9NQVJLRVRQTEFDRVNfS0VZLCBDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRywgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVksIENPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWSwgbWFuYWdlZE1vZGVsVmFsdWUsIG1hbmFnZWRTZXR0aW5nVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUsIEFnZW50U2FuZGJveFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyB0eXBlIENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFkZENvbmZpZ3VyYXRpb25UeXBlLCBBc3Npc3RlZFR5cGVzIH0gZnJvbSAnLi4vLi4vbWNwL2Jyb3dzZXIvbWNwQ29tbWFuZHNBZGRDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1jcENvbGxpc2lvbkJlaGF2aW9yLCBhbGxEaXNjb3ZlcnlTb3VyY2VzLCBkaXNjb3ZlcnlTb3VyY2VTZXR0aW5nc0xhYmVsLCBtY3BEaXNjb3ZlcnlTZWN0aW9uLCBtY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uLCBtY3BTZXJ2ZXJDb2xsaXNpb25CZWhhdmlvclNlY3Rpb24sIG1jcFNlcnZlclNhbXBsaW5nU2VjdGlvbiB9IGZyb20gJy4uLy4uL21jcC9jb21tb24vbWNwQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z1NlcnZpY2VJbXBsIH0gZnJvbSAnLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENoYXRNb2RlU2VydmljZSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlLCBJQ2hhdE1vZGVzIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RPcmlnaW5TZXJ2aWNlLCBJQ2hhdFJlcXVlc3RPcmlnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRSZXF1ZXN0T3JpZ2luLmpzJztcbmltcG9ydCB7IENoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTaWRlQ2hhdFNlcnZpY2UsIElDaGF0U2lkZUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTaWRlQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQllPS1V0aWxpdHlNb2RlbERlZmF1bHQsIENoYXRBSURpc2FibGVkU2V0dGluZ0lkLCBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLCBDaGF0Tm90aWZpY2F0aW9uTW9kZSwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ29kZU1hcHBlclNlcnZpY2UsIElDb2RlTWFwcGVyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRDb2RlTWFwcGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vaWdub3JlZEZpbGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIExhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFN0YXRzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbFN0YXRzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVsU3RhdHMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyYW5zZmVyU2VydmljZSwgSUNoYXRUcmFuc2ZlclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvY2hhdFRyYW5zZmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnROYW1lU2VydmljZSwgQ2hhdEFnZW50U2VydmljZSwgSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0U2xhc2hDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkRpc2NvdmVyeVByaW9yaXR5LCBJQWdlbnRQbHVnaW5TZXJ2aWNlLCBhZ2VudFBsdWdpbkRpc2NvdmVyeVJlZ2lzdHJ5IH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRQcm9tcHRGaWxlc0V4dGVuc2lvblBvaW50SGFuZGxlciB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY2hhdFByb21wdEZpbGVzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFByb21wdHNDb25maWcsIGlzVGlsZGVQYXRoIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IEFHRU5UU19TT1VSQ0VfRk9MREVSLCBBR0VOVF9GSUxFX0VYVEVOU0lPTiwgQ0xBVURFX0FHRU5UU19TT1VSQ0VfRk9MREVSLCBDT1BJTE9UX1VTRVJfQUdFTlRTX1NPVVJDRV9GT0xERVIsIERFRkFVTFRfSE9PS19GSUxFX1BBVEhTLCBERUZBVUxUX0lOU1RSVUNUSU9OU19TT1VSQ0VfRk9MREVSUywgREVGQVVMVF9TS0lMTF9TT1VSQ0VfRk9MREVSUywgSU5TVFJVQ1RJT05TX0RFRkFVTFRfU09VUkNFX0ZPTERFUiwgSU5TVFJVQ1RJT05fRklMRV9FWFRFTlNJT04sIExFR0FDWV9NT0RFX0RFRkFVTFRfU09VUkNFX0ZPTERFUiwgTEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04sIFBST01QVF9ERUZBVUxUX1NPVVJDRV9GT0xERVIsIFBST01QVF9GSUxFX0VYVEVOU0lPTiwgU0tJTExfRklMRU5BTUUgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IEhPT0tfU0NIRU1BX1VSSSwgaG9va0ZpbGVTY2hlbWEgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgQUdFTlRfRE9DVU1FTlRBVElPTl9VUkwsIEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkLCBBZ2VudEhvc3RBZ2VudERlYnVnTG9nTWF4RXZlbnRzU2V0dGluZ0lkLCBIT09LX0RPQ1VNRU5UQVRJT05fVVJMLCBJTlNUUlVDVElPTlNfRE9DVU1FTlRBVElPTl9VUkwsIFBST01QVF9ET0NVTUVOVEFUSU9OX1VSTCwgUHJvbXB0RmlsZVNvdXJjZSwgUHJvbXB0c1R5cGUsIFNLSUxMX0RPQ1VNRU5UQVRJT05fVVJMIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElTZXNzaW9uUm91dGVyIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25Sb3V0ZXIuanMnO1xuaW1wb3J0IHsgQnVpbHRpblRvb2xzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy90b29scy5qcyc7XG5pbXBvcnQgeyBDaGF0QXJ0aWZhY3RzU2VydmljZSwgSUNoYXRBcnRpZmFjdHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2NoYXRBcnRpZmFjdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUb2RvTGlzdFNlcnZpY2UsIElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludEhhbmRsZXIgfSBmcm9tICcuLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlQ2hhdFNlcnZpY2UsIFZvaWNlQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdm9pY2VDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgJy4uL2NvbW1vbi93aWRnZXQvY2hhdENvbG9ycy5qcyc7XG5pbXBvcnQgeyBJQ2hhdExheW91dFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd2lkZ2V0L2NoYXRMYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXNwb25zZVJlc291cmNlRmlsZVN5c3RlbVByb3ZpZGVyLCBDaGF0UmVzcG9uc2VSZXNvdXJjZVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSUNoYXRSZXNwb25zZVJlc291cmNlRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vY29tbW9uL3dpZGdldC9jaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRBY2Nlc3NpYmlsaXR5QWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0QWNjZXNzaWJpbGl0eUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRDaGF0QWNjZXNzaWJpbGl0eUhlbHAsIENoYXRJbnB1dFdpbmRvd0FjY2Vzc2liaWxpdHlIZWxwLCBFZGl0c0NoYXRBY2Nlc3NpYmlsaXR5SGVscCwgUGFuZWxDaGF0QWNjZXNzaWJpbGl0eUhlbHAsIFF1aWNrQ2hhdEFjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBNb2RlT3BlbkNoYXRHbG9iYWxBY3Rpb24sIHJlZ2lzdGVyQ2hhdEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50UmVjb21tZW5kYXRpb24gfSBmcm9tICcuL2FjdGlvbnMvY2hhdEFnZW50UmVjb21tZW5kYXRpb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGVCbG9ja0FjdGlvblJlbmRlcmluZywgcmVnaXN0ZXJDaGF0Q29kZUJsb2NrQWN0aW9ucywgcmVnaXN0ZXJDaGF0Q29kZUNvbXBhcmVCbG9ja0FjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdENvZGVibG9ja0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRDb250cmlidXRpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdENvbnRleHRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRDb250ZXh0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29weUFjdGlvblJlbmRlcmluZywgcmVnaXN0ZXJDaGF0Q29weUFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdENvcHlBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdERldmVsb3BlckFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdERldmVsb3BlckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0RWxpY2l0YXRpb25BY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRFbGljaXRhdGlvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0RXhlY3V0ZUFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEZpbGVUcmVlQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0RmlsZVRyZWVBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEZpbmRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRGaW5kQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0R2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb24gfSBmcm9tICcuL2FjdGlvbnMvY2hhdEdldHRpbmdTdGFydGVkLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEV4cG9ydEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEltcG9ydEV4cG9ydC5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckxhbmd1YWdlTW9kZWxBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRMYW5ndWFnZU1vZGVsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck1vdmVBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRNb3ZlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5ld0NoYXRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXROZXdBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdE9wZW5BZ2VudERlYnVnUGFuZWxBY3Rpb24gfSBmcm9tICcuL2FjdGlvbnMvY2hhdE9wZW5BZ2VudERlYnVnUGFuZWxBY3Rpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0UGx1Z2luQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0UGx1Z2luQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRQcm9tcHROYXZpZ2F0aW9uQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0UHJvbXB0TmF2aWdhdGlvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0UXVldWVBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRRdWV1ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJRdWlja0NoYXRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRRdWlja0lucHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRTcGVlY2hUb1RleHRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRTcGVlY2hUb1RleHRBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdFRpdGxlQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0VGl0bGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdFRvb2xBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRUb29sQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0VHJhbnNmZXJDb250cmlidXRpb24gfSBmcm9tICcuL2FjdGlvbnMvY2hhdFRyYW5zZmVyLmpzJztcbmltcG9ydCB7IENPTkZJR1VSRV9ESUNUQVRJT05fSU5TVFJVQ1RJT05TX0FDVElPTl9JRCwgcmVnaXN0ZXJDb25maWd1cmVTcGVlY2hJbnN0cnVjdGlvbnNBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCAnLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYXREZWJ1Z0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vY2hhdERlYnVnL2FnZW50SG9zdENoYXREZWJ1Z1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0VkaXRvciB9IGZyb20gJy4vY2hhdERlYnVnL2NoYXREZWJ1Z0VkaXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdFZGl0b3JJbnB1dCwgQ2hhdERlYnVnRWRpdG9ySW5wdXRTZXJpYWxpemVyIH0gZnJvbSAnLi9jaGF0RGVidWcvY2hhdERlYnVnRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSwgSUNoYXRHb2FsU3VtbWFyeVNlcnZpY2UgfSBmcm9tICcuL2NoYXRHb2FsU3VtbWFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuL2NoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9wcm9tcHRzRGVidWdDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgUHJvbXB0TGFuZ3VhZ2VGZWF0dXJlc1Byb3ZpZGVyIH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZUNvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblJvdXRlclNlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25Sb3V0ZXIvc2Vzc2lvblJvdXRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIERpY3RhdGlvblNldHRpbmdJZCwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi9zcGVlY2hUb1RleHQvY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL3RlbGVtZXRyeS9jaGF0TW9kZWxDb3VudFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSwgSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIH0gZnJvbSAnLi90b29scy9jaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vdG9vbHMvY2xpZW50VG9vbFNldHNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgUmVuYW1lVG9vbENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vdG9vbHMvcmVuYW1lVG9vbC5qcyc7XG5pbXBvcnQgeyBVc2FnZXNUb29sQ29udHJpYnV0aW9uIH0gZnJvbSAnLi90b29scy91c2FnZXNUb29sLmpzJztcbmltcG9ydCAnLi92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vdm9pY2VDbGllbnQvdHRzUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi92b2ljZUNsaWVudC92b2ljZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICcuL3ZvaWNlQ2xpZW50L3ZvaWNlVG9vbERpc3BhdGNoU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGUuanMnO1xuaW1wb3J0IHsgQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLCBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24sIHJlZ2lzdGVyVm9pY2VJbnB1dE1vZGVTaW11bGF0ZUFjdGlvbnMgfSBmcm9tICcuL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0uanMnO1xuXG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuXG5pbXBvcnQgeyBDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuL2FjY2Vzc2liaWxpdHkvY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgJy4vYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vYWlDdXN0b21pemF0aW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLCBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5LCBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVmZXJlbmNlQXR0YWNobWVudFdpZGdldENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXQuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFRyYW5zY3JpcHRDb250ZXh0QXR0YWNobWVudFdpZGdldENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYXR0YWNobWVudHMvdHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50V2lkZ2V0LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBJQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UsIElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlLCBJQ2hhdFdpZGdldFNlcnZpY2UsIElRdWlja0NoYXRTZXJ2aWNlLCBpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCB9IGZyb20gJy4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0VkaXRvckFjY2Vzc2liaWxpdHkgfSBmcm9tICcuL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yQWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRFZGl0b3JBY3Rpb25zIH0gZnJvbSAnLi9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0VkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0VkaXRvck92ZXJsYXkgfSBmcm9tICcuL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yT3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdOb3RlYm9va0ZpbGVTeXN0ZW1Qcm92aWRlckNvbnRyaWIgfSBmcm9tICcuL2NoYXRFZGl0aW5nL25vdGVib29rL2NoYXRFZGl0aW5nTm90ZWJvb2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0ICcuL2NoYXRNYW5hZ2VtZW50L2NoYXRNYW5hZ2VtZW50LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0T3V0bGluZUNyZWF0b3IgfSBmcm9tICcuL2NoYXRPdXRsaW5lQ3JlYXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0TGFuZ3VhZ2VNb2RlbHNEYXRhQ29udHJpYnV0aW9uLCBMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi93aWRnZXQvY2hhdExheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpY2VIdWIuanMnO1xuaW1wb3J0ICcuL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dEJveENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0RWRpdG9ySW5wdXRDb250ZW50UHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvciwgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9ySW5wdXQsIENoYXRFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgfSBmcm9tICcuL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuXG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luU2VydmljZSwgQ29uZmlndXJlZEFnZW50UGx1Z2luRGlzY292ZXJ5LCBDb3BpbG90Q2xpQWdlbnRQbHVnaW5EaXNjb3ZlcnksIEV4dGVuc2lvbkFnZW50UGx1Z2luRGlzY292ZXJ5LCBNYXJrZXRwbGFjZUFnZW50UGx1Z2luRGlzY292ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VQbHVnaW5TZXR0aW5nc1NlcnZpY2UsIFdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3dvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWQUxJRF9QUk9NUFRfRk9MREVSX1BBVFRFUk4gfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci5qcyc7XG5pbXBvcnQgeyBJVG9vbFJlc3VsdENvbXByZXNzb3IgfSBmcm9tICcuLi9jb21tb24vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3IuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcgfSBmcm9tICcuL2FjY2Vzc2liaWxpdHkvY2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgQ2hhdFRlcm1pbmFsT3V0cHV0QWNjZXNzaWJsZVZpZXcgfSBmcm9tICcuL2FjY2Vzc2liaWxpdHkvY2hhdFRlcm1pbmFsT3V0cHV0QWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5Db21tYW5kc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYWdlbnRQbHVnaW5Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkVkaXRvciB9IGZyb20gJy4vYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5FZGl0b3IuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5FZGl0b3JJbnB1dCB9IGZyb20gJy4vYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5FZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLCBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEltcGxpY2l0Q29udGV4dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdEltcGxpY2l0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlIH0gZnJvbSAnLi9hdHRhY2htZW50cy9jaGF0UGFzdGVUYXJnZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRWYXJpYWJsZXNTZXJ2aWNlIH0gZnJvbSAnLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXRJbWFnZUNhcm91c2VsU2VydmljZSwgSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSB9IGZyb20gJy4vY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRPdXRwdXRSZW5kZXJlclNlcnZpY2UsIElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0T3V0cHV0SXRlbVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENoYXRDb21wYXRpYmlsaXR5Tm90aWZpZXIsIENoYXRFeHRlbnNpb25Qb2ludEhhbmRsZXIgfSBmcm9tICcuL2NoYXRQYXJ0aWNpcGFudC5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFBldFNlcnZpY2UsIElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4vY2hhdFBldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9jaGF0UHJvbW9Ob3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFF1b3RhTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9jaGF0UXVvdGFOb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFJlcG9JbmZvQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9jaGF0UmVwb0luZm8uanMnO1xuaW1wb3J0IHsgQ2hhdFNldHVwQ29udHJpYnV0aW9uLCBDaGF0VGVhcmRvd25Db250cmlidXRpb24gfSBmcm9tICcuL2NoYXRTZXR1cC9jaGF0U2V0dXBDb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uT3B0aW9uU2xhc2hDb21tYW5kc0NvbnRyaWJ1dGlvbiwgQ2hhdFNsYXNoQ29tbWFuZHNDb250cmlidXRpb24gfSBmcm9tICcuL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IENoYXRTdGF0dXNCYXJFbnRyeSB9IGZyb20gJy4vY2hhdFN0YXR1cy9jaGF0U3RhdHVzRW50cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFRpcFNlcnZpY2UsIElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4vY2hhdFRpcFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFdpbmRvd05vdGlmaWVyIH0gZnJvbSAnLi9jaGF0V2luZG93Tm90aWZpZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5SZWNvbW1lbmRhdGlvbnMgfSBmcm9tICcuL2NsYXVkZVBsdWdpblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZSB9IGZyb20gJy4vY29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlQWdlbnREZWZhdWx0TW9kZWwgfSBmcm9tICcuL2V4cGxvcmVBZ2VudERlZmF1bHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBIYXNCeW9rTW9kZWxzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9oYXNCeW9rTW9kZWxzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFBsYW5BZ2VudERlZmF1bHRNb2RlbCB9IGZyb20gJy4vcGxhbkFnZW50RGVmYXVsdE1vZGVsLmpzJztcbmltcG9ydCAnLi9wbGFuUmV2aWV3RmVlZGJhY2svcGxhblJldmlld0ZlZWRiYWNrRWRpdG9yT3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSwgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4vcGxhblJldmlld0ZlZWRiYWNrL3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGx1Z2luQXV0b1VwZGF0ZSB9IGZyb20gJy4vcGx1Z2luQXV0b1VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UgfSBmcm9tICcuL3BsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQbHVnaW5VcmxIYW5kbGVyIH0gZnJvbSAnLi9wbHVnaW5VcmxIYW5kbGVyLmpzJztcbmltcG9ydCAnLi9wcm9tcHRTeW50YXgvcHJvbXB0Q29kaW5nQWdlbnRBY3Rpb25Db250cmlidXRpb24uanMnO1xuaW1wb3J0ICcuL3Byb21wdFN5bnRheC9wcm9tcHRUb29sc0NvZGVMZW5zUHJvdmlkZXIuanMnO1xuaW1wb3J0ICcuL3Byb21wdFN5bnRheC9wcm9tcHRUb29sU2V0c0NvZGVMZW5zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgUHJvbXB0VXJsSGFuZGxlciB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3Byb21wdFVybEhhbmRsZXIuanMnO1xuaW1wb3J0ICcuL3Byb21wdFRpbWVsaW5lL3Byb21wdFRpbWVsaW5lLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24gfSBmcm9tICcuL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9vbFJlc3VsdENvbXByZXNzb3JTZXJ2aWNlIH0gZnJvbSAnLi90b29scy90b29sUmVzdWx0Q29tcHJlc3NvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlVG9vbFNldHMsIFVzZXJUb29sU2V0c0NvbnRyaWJ1dGlvbnMgfSBmcm9tICcuL3Rvb2xzL3Rvb2xTZXRzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFV0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbiwgVXRpbGl0eVNtYWxsTW9kZWxDb250cmlidXRpb24gfSBmcm9tICcuL3V0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld3NXZWxjb21lSGFuZGxlciB9IGZyb20gJy4vdmlld3NXZWxjb21lL2NoYXRWaWV3c1dlbGNvbWVIYW5kbGVyLmpzJztcbmltcG9ydCAnLi93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3ViYWdlbnRPcGVuQ2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0RmluZEFjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi93aWRnZXQvY2hhdEZpbmQvY2hhdEZpbmRBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0IH0gZnJvbSAnLi93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4vd2lkZ2V0L2NoYXRXaWRnZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRRdWV1ZVBpY2tlclJlbmRlcmluZyB9IGZyb20gJy4vd2lkZ2V0L2lucHV0L2NoYXRRdWV1ZVBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0ICcuL3dpZGdldC9pbnB1dC9lZGl0b3IvYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRDb21tYW5kQXJndW1lbnRIaW50LmpzJztcbmltcG9ydCAnLi93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dENvbXBsZXRpb25zLmpzJztcbmltcG9ydCAnLi93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIuanMnO1xuaW1wb3J0ICcuL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0RWRpdG9ySG92ZXIuanMnO1xuaW1wb3J0IHsgQ2hhdFBhc3RlUHJvdmlkZXJzRmVhdHVyZSB9IGZyb20gJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0UGFzdGVQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgUXVpY2tDaGF0U2VydmljZSB9IGZyb20gJy4vd2lkZ2V0SG9zdHMvY2hhdFF1aWNrLmpzJztcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19jaGF0Lm5vdGlmeVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXInLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc29sdmVJZDogc3RyaW5nLCBhbnN3ZXJzPzogaW1wb3J0KCcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnKS5JQ2hhdFF1ZXN0aW9uQW5zd2VycykgPT4ge1xuXHRhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKS5ub3RpZnlRdWVzdGlvbkNhcm91c2VsQW5zd2VyKCcnLCByZXNvbHZlSWQsIGFuc3dlcnMpO1xufSk7XG5cbmNvbnN0IHRvb2xSZWZlcmVuY2VOYW1lRW51bVZhbHVlczogc3RyaW5nW10gPSBbXTtcbmNvbnN0IHRvb2xSZWZlcmVuY2VOYW1lRW51bURlc2NyaXB0aW9uczogc3RyaW5nW10gPSBbXTtcblxuLy8gUmVnaXN0ZXIgSlNPTiBzY2hlbWEgZm9yIGhvb2sgZmlsZXNcbmNvbnN0IGpzb25Db250cmlidXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKEhPT0tfU0NIRU1BX1VSSSwgaG9va0ZpbGVTY2hlbWEpO1xuXG4vLyBSZWdpc3RlciBjb25maWd1cmF0aW9uXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2NoYXRTaWRlYmFyJyxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnaW50ZXJhY3RpdmVTZXNzaW9uQ29uZmlndXJhdGlvblRpdGxlJywgXCJDaGF0XCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdCdjaGF0LmV4cGVyaW1lbnRhbFNlc3Npb25zV2luZG93T3ZlcnJpZGUnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbFNlc3Npb25zV2luZG93T3ZlcnJpZGUnLCBcIldoZW4gdHJ1ZSwgZW5hYmxlcyBzZXNzaW9ucy13aW5kb3ctc3BlY2lmaWMgYmVoYXZpb3IgZm9yIGV4dGVuc2lvbnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHRydWUgfSxcblx0XHR9LFxuXHRcdCdjaGF0Lm9tbmkuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5vbW5pLmVuYWJsZWQnLCBcIkVuYWJsZXMgdGhlIGZsb2F0aW5nIGNoYXQgaW5wdXQgd2luZG93IGFuZCBpdHMgZW50cnkgcG9pbnRzLiBSZXF1ZXN0cyBzdWJtaXR0ZWQgZnJvbSB0aGUgd2luZG93IGFyZSBzY29yZWQgYWdhaW5zdCBleGlzdGluZyBhZ2VudCBzZXNzaW9ucyBhbmQgcm91dGVkIHdpdGggYW4gYWR2aXNvcnkgYmFkZ2UuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddXG5cdFx0fSxcblx0XHQnY2hhdC5mb250U2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5mb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBpbiBwaXhlbHMgaW4gY2hhdCBtZXNzYWdlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAxMyxcblx0XHRcdG1pbmltdW06IDYsXG5cdFx0XHRtYXhpbXVtOiAxMDBcblx0XHR9LFxuXHRcdCdjaGF0LmZvbnRGYW1pbHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IGluIGNoYXQgbWVzc2FnZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHQnZGljdGF0aW9uLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5lbmFibGVkJywgXCJFbmFibGVzIGRpY3RhdGlvbiBhY3Jvc3MgdGhlIHByb2R1Y3QgKGNoYXQgaW5wdXQsIGVkaXRvciwgYW5kIHRlcm1pbmFsKS4gV2hlbiBlbmFibGVkIG9uIGEgc3VwcG9ydGVkIHBsYXRmb3JtLCBhIG1pY3JvcGhvbmUgYnV0dG9uIGFwcGVhcnMgaW4gdGhlIGNoYXQgaW5wdXQgYW5kIHRoZSBkaWN0YXRpb24gc2hvcnRjdXQgYmVjb21lcyBhdmFpbGFibGU7IHRoZSBvbi1kZXZpY2UgdHJhbnNjcmlwdGlvbiBtb2RlbCBpcyBkb3dubG9hZGVkIG9uIGZpcnN0IHVzZSBhbmQgcnVucyBsb2NhbGx5LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdEaWN0YXRpb25FbmFibGVkJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEzMScsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdkaWN0YXRpb24uZW5hYmxlZC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLmVuYWJsZWQucG9saWN5JywgXCJDb250cm9scyB3aGV0aGVyIGRpY3RhdGlvbiBpcyBhdmFpbGFibGUgYWNyb3NzIHRoZSBwcm9kdWN0IChjaGF0IGlucHV0LCBlZGl0b3IsIGFuZCB0ZXJtaW5hbCkuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2RpY3RhdGlvbi5tb2RlbCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHRERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUwsXG5cdFx0XHRcdCdtYWknLFxuXHRcdFx0XSxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLm1vZGVsLm5lbW90cm9uTXVsdGlsaW5ndWFsLmxhYmVsJywgXCJOZW1vdHJvbiAzLjUgQVNSIChNdWx0aWxpbmd1YWwpIFx1MjAxNCBPbi1EZXZpY2VcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLm1vZGVsLm1haS5sYWJlbCcsIFwiTUFJIFx1MjAxNCBDbG91ZFwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWN0YXRpb24ubW9kZWwubmVtb3Ryb25NdWx0aWxpbmd1YWwnLCBcIk5WSURJQSBOZW1vdHJvbiAzLjUgbXVsdGlsaW5ndWFsIHN0cmVhbWluZyBSTk4tVCwgcnVuIG9uLWRldmljZSB0aHJvdWdoIE1pY3Jvc29mdCBGb3VuZHJ5IExvY2FsLiBXb3JrcyBvZmZsaW5lOyBubyBhdWRpbyBsZWF2ZXMgdGhlIGRldmljZS4gQXV0b21hdGljIGxhbmd1YWdlIHNlbGVjdGlvbiBmb2xsb3dzIHRoZSBWb2ljZSBNb2RlIGxhbmd1YWdlIHNldHRpbmc7IHdoZW4gdGhhdCBzZXR0aW5nIGlzIEF1dG9tYXRpYywgZGljdGF0aW9uIHVzZXMgdGhlIGNvbmZpZ3VyZWQgZGlzcGxheSBsYW5ndWFnZSB3aGVuIHN1cHBvcnRlZCwgdGhlbiB0aGUgc3lzdGVtIG9yIGJyb3dzZXIgbG9jYWxlLCB3aXRoIG1vZGVsIGRldGVjdGlvbiBhcyBhIGZhbGxiYWNrLiBEb3dubG9hZGVkIG9uIGZpcnN0IHVzZSBhbmQgY2FjaGVkIG9uIGRpc2suXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5tb2RlbC5tYWknLCBcIkNsb3VkIHRyYW5zY3JpcHRpb24gdGhyb3VnaCB0aGUgc2FtZSBNaWNyb3NvZnQgQUkgdm9pY2Ugc2VydmljZSB1c2VkIGJ5IFZvaWNlIE1vZGUuIFJlcXVpcmVzIGEgbmV0d29yayBjb25uZWN0aW9uIGFuZCBHaXRIdWIgc2lnbi1pbjsgYXVkaW8gaXMgc3RyZWFtZWQgdG8gdGhlIHNlcnZpY2UuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLm1vZGVsJywgXCJUaGUgbW9kZWwgdXNlZCBmb3IgZGljdGF0aW9uLiBPbi1kZXZpY2UgbW9kZWxzIGRvd25sb2FkIG9uIGZpcnN0IHVzZSBhbmQgcnVuIGxvY2FsbHkgdGhyb3VnaCBNaWNyb3NvZnQgRm91bmRyeSBMb2NhbDsgdGhlIGNsb3VkIG9wdGlvbiBzdHJlYW1zIGF1ZGlvIHRvIHRoZSBNaWNyb3NvZnQgQUkgdm9pY2Ugc2VydmljZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUwsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnYXV0bycgfVxuXHRcdH0sXG5cdFx0W0RpY3RhdGlvblNldHRpbmdJZC5TaG93VHJhbnNjcmlwdF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLnNob3dUcmFuc2NyaXB0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB0cmFuc2NyaXB0IGlzIHNob3duIHdoaWxlIGRpY3RhdGluZy4gVGhlIGZpbmFsIHRyYW5zY3JpcHQgaXMgaW5zZXJ0ZWQgd2hlbiBkaWN0YXRpb24gZW5kcy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0RpY3RhdGlvblNldHRpbmdJZC5TaG93QnV0dG9uXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkaWN0YXRpb24uc2hvd0J1dHRvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZGljdGF0aW9uIG1pY3JvcGhvbmUgYnV0dG9uIGlzIHNob3duIGluIHRoZSBjaGF0IGlucHV0LiBXaGVuIGhpZGRlbiwgZGljdGF0aW9uIGNhbiBzdGlsbCBiZSBzdGFydGVkIHdpdGggaXRzIGtleWJvYXJkIHNob3J0Y3V0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddXG5cdFx0fSxcblx0XHQnZGljdGF0aW9uLmV4cGVyaW1lbnRhbC5sbG1DbGVhbnVwJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkaWN0YXRpb24uZXhwZXJpbWVudGFsLmxsbUNsZWFudXAnLCBcIkV4cGVyaW1lbnRhbDogd2hlbiBkaWN0YXRpb24gZW5kcywgdGhlIGZpbmFsIHRyYW5zY3JpcHQgaXMgcGFzc2VkIHRocm91Z2ggYSBzbWFsbCBsYW5ndWFnZSBtb2RlbCB0byByZXN0b3JlIHB1bmN0dWF0aW9uLCBjYXBpdGFsaXphdGlvbiwgcGFyYWdyYXBocywgYW5kIGxpc3RzLiBSZXF1aXJlcyBDb3BpbG90IHRvIGJlIGVuYWJsZWQ7IHRoZSB0cmFuc2NyaXB0IGlzIHNlbnQgdG8gdGhlIGxhbmd1YWdlIG1vZGVsIGZvciBjbGVhbnVwLiBGYWxscyBiYWNrIHRvIHRoZSByYXcgdHJhbnNjcmlwdCB3aGVuIG5vIG1vZGVsIGlzIGF2YWlsYWJsZS4gVXNlIFtkaWN0YXRpb24gaW5zdHJ1Y3Rpb25zXShjb21tYW5kOnswfSkgdG8gY3VzdG9taXplIHRlcm1pbm9sb2d5IGFuZCBmb3JtYXR0aW5nLlwiLCBDT05GSUdVUkVfRElDVEFUSU9OX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRvci5mb250U2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW50ZXJhY3RpdmVTZXNzaW9uLmVkaXRvci5mb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBpbiBwaXhlbHMgaW4gY2hhdCBjb2RlYmxvY2tzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGlzTWFjaW50b3NoID8gMTIgOiAxNCxcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRvci5mb250RmFtaWx5Jzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb24uZWRpdG9yLmZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIHRoZSBmb250IGZhbWlseSBpbiBjaGF0IGNvZGVibG9ja3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0b3IuZm9udFdlaWdodCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW50ZXJhY3RpdmVTZXNzaW9uLmVkaXRvci5mb250V2VpZ2h0JywgXCJDb250cm9scyB0aGUgZm9udCB3ZWlnaHQgaW4gY2hhdCBjb2RlYmxvY2tzLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0J1xuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdG9yLndvcmRXcmFwJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb24uZWRpdG9yLndvcmRXcmFwJywgXCJDb250cm9scyB3aGV0aGVyIGxpbmVzIHNob3VsZCB3cmFwIGluIGNoYXQgY29kZWJsb2Nrcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnb2ZmJyxcblx0XHRcdGVudW06IFsnb24nLCAnb2ZmJ11cblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRvci5saW5lSGVpZ2h0Jzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb24uZWRpdG9yLmxpbmVIZWlnaHQnLCBcIkNvbnRyb2xzIHRoZSBsaW5lIGhlaWdodCBpbiBwaXhlbHMgaW4gY2hhdCBjb2RlYmxvY2tzLiBVc2UgMCB0byBjb21wdXRlIHRoZSBsaW5lIGhlaWdodCBmcm9tIHRoZSBmb250IHNpemUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogMFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFnZW50U3RhdHVzRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWRkZW4nLCAnYmFkZ2UnLCAnY29tcGFjdCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRzQ29udHJvbC5oaWRkZW4nLCBcIlRoZSBhZ2VudCBzdGF0dXMgaW5kaWNhdG9yIGlzIGhpZGRlbiBmcm9tIHRoZSB0aXRsZSBiYXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRzQ29udHJvbC5iYWRnZScsIFwiU2hvd3MgdGhlIGFnZW50IHN0YXR1cyBhcyBhIGJhZGdlIG5leHQgdG8gdGhlIGNvbW1hbmQgY2VudGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0NvbnRyb2wuY29tcGFjdCcsIFwiUmVwbGFjZXMgdGhlIGNvbW1hbmQgY2VudGVyIHNlYXJjaCBib3ggd2l0aCBhIGNvbXBhY3QgYWdlbnQgc3RhdHVzIGluZGljYXRvciBhbmQgdW5pZmllZCBjaGF0IHdpZGdldC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0NvbnRyb2wuZW5hYmxlZCcsIFwiQ29udHJvbHMgaG93IHRoZSAnQWdlbnQgU3RhdHVzJyBpbmRpY2F0b3IgYXBwZWFycyBpbiB0aGUgdGl0bGUgYmFyIGNvbW1hbmQgY2VudGVyLiBXaGVuIHNldCB0byBgaGlkZGVuYCwgdGhlIGluZGljYXRvciBpcyBub3Qgc2hvd24uIE90aGVyIHZhbHVlcyBzaG93IHRoZSBpbmRpY2F0b3IgYW5kIGF1dG9tYXRpY2FsbHkgZW5hYmxlIHswfS4gVGhlIHVucmVhZCBhbmQgaW4tcHJvZ3Jlc3Mgc2Vzc2lvbiBpbmRpY2F0b3JzIHJlcXVpcmUgezF9IHRvIGJlIGVuYWJsZWQuXCIsICdgI3dpbmRvdy5jb21tYW5kQ2VudGVyI2AnLCAnYCNjaGF0LnZpZXdTZXNzaW9ucy5lbmFibGVkI2AnKSxcblx0XHRcdGRlZmF1bHQ6ICdjb21wYWN0Jyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5VbmlmaWVkQWdlbnRzQmFyXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVuaWZpZWRBZ2VudHNCYXIuZW5hYmxlZCcsIFwiUmVwbGFjZXMgdGhlIGNvbW1hbmQgY2VudGVyIHNlYXJjaCBib3ggd2l0aCBhIHVuaWZpZWQgY2hhdCBhbmQgc2VhcmNoIHdpZGdldC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BZ2VudFNlc3Npb25Qcm9qZWN0aW9uRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgQWdlbnQgU2Vzc2lvbiBQcm9qZWN0aW9uIG1vZGUgaXMgZW5hYmxlZCBmb3IgcmV2aWV3aW5nIGFnZW50IHNlc3Npb25zIGluIGEgZm9jdXNlZCB3b3Jrc3BhY2UuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk1pZ3JhdGVMZWdhY3lDb3BpbG90Q2xpU2Vzc2lvbnNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRTZXNzaW9ucy5taWdyYXRlTGVnYWN5Q29waWxvdENsaScsIFwiQ29udHJvbHMgd2hldGhlciBsZWdhY3kgZXh0ZW5zaW9uIGhvc3QgQ29waWxvdCBDTEkgY2hhdCBzZXNzaW9ucyBhcmUgbWlncmF0ZWQgaW4gcGxhY2UgdG8gdGhlIEFnZW50IGhvc3Qgd2hlbiBvcGVuZWQsIHNvIHRoZWlyIGhpc3RvcnkgYmVjb21lcyBlZGl0YWJsZS4gV2hlbiBkaXNhYmxlZCwgbGVnYWN5IHNlc3Npb25zIG9wZW4gYXMgYmVmb3JlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9LFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0TWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkQ29uZmlnS2V5IH0sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uU2hvd0V4dGVybmFsQWdlbnRTZXNzaW9uc106IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW0FnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLk5vbmUsIEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLkFsbCwgQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUuTGFzdDI0SG91cnMsIEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLkxhc3Q3RGF5c10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudFNlc3Npb25zLnNob3dFeHRlcm5hbC5ub25lJywgXCJPbmx5IHNob3dzIHNlc3Npb25zIGNyZWF0ZWQgYnkgdGhlIEFnZW50IEhvc3QuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRTZXNzaW9ucy5zaG93RXh0ZXJuYWwuYWxsJywgXCJTaG93cyBhbGwgc2Vzc2lvbnMgZGlzY292ZXJlZCBmcm9tIHN1cHBvcnRlZCBleHRlcm5hbCBhZ2VudCBhcHBsaWNhdGlvbnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRTZXNzaW9ucy5zaG93RXh0ZXJuYWwubGFzdDI0SG91cnMnLCBcIlNob3dzIGV4dGVybmFsIHNlc3Npb25zIHVwZGF0ZWQgaW4gdGhlIGxhc3QgMjQgaG91cnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRTZXNzaW9ucy5zaG93RXh0ZXJuYWwubGFzdDdEYXlzJywgXCJTaG93cyBleHRlcm5hbCBzZXNzaW9ucyB1cGRhdGVkIGluIHRoZSBsYXN0IDcgZGF5cy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUuTGFzdDdEYXlzLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50U2Vzc2lvbnMuc2hvd0V4dGVybmFsJywgXCJDb250cm9scyB3aGljaCBleHRlcm5hbCBhZ2VudCBzZXNzaW9ucywgY3JlYXRlZCBvdXRzaWRlIFZTIENvZGUncyBBZ2VudCBIb3N0LCBhcmUgc2hvd24uXCIpLFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0U2hvd0V4dGVybmFsU2Vzc2lvbnNDb25maWdLZXkgfSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TYXZlQmVmb3JlU2VuZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuc2F2ZUJlZm9yZVNlbmQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWxsIGRpcnR5IGVkaXRvcnMgZXhjZXB0IHVudGl0bGVkIGVkaXRvcnMgYXJlIHNhdmVkIGJlZm9yZSBzZW5kaW5nIGEgY2hhdCBtZXNzYWdlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHQnY2hhdC5pbXBsaWNpdENvbnRleHQuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQuZW5hYmxlZC4xJywgXCJFbmFibGVzIGF1dG9tYXRpY2FsbHkgdXNpbmcgdGhlIGFjdGl2ZSBlZGl0b3IgYXMgY2hhdCBjb250ZXh0IGZvciBzcGVjaWZpZWQgY2hhdCBsb2NhdGlvbnMuXCIpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnbmV2ZXInLCAnZmlyc3QnLCAnYWx3YXlzJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuaW1wbGljaXRDb250ZXh0LnZhbHVlJywgXCJUaGUgdmFsdWUgZm9yIHRoZSBpbXBsaWNpdCBjb250ZXh0LlwiKSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQudmFsdWUubmV2ZXInLCBcIkltcGxpY2l0IGNvbnRleHQgaXMgbmV2ZXIgZW5hYmxlZC5cIiksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmltcGxpY2l0Q29udGV4dC52YWx1ZS5maXJzdCcsIFwiSW1wbGljaXQgY29udGV4dCBpcyBlbmFibGVkIGZvciB0aGUgZmlyc3QgaW50ZXJhY3Rpb24uXCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQudmFsdWUuYWx3YXlzJywgXCJJbXBsaWNpdCBjb250ZXh0IGlzIGFsd2F5cyBlbmFibGVkLlwiKVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQncGFuZWwnOiAnYWx3YXlzJyxcblx0XHRcdH0sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnc3RhcnR1cCdcblx0XHRcdH0sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogeyAncGFuZWwnOiAnbmV2ZXInIH0gfSxcblx0XHR9LFxuXHRcdCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBuZXcgaW1wbGljaXQgY29udGV4dCBmbG93IGlzIHNob3duLiBJbiBBc2sgYW5kIEVkaXQgbW9kZXMsIHRoZSBjb250ZXh0IHdpbGwgYXV0b21hdGljYWxseSBiZSBpbmNsdWRlZC4gV2hlbiB1c2luZyBhbiBhZ2VudCwgY29udGV4dCB3aWxsIGJlIHN1Z2dlc3RlZCBhcyBhbiBhdHRhY2htZW50LiBTZWxlY3Rpb25zIGFyZSBhbHdheXMgaW5jbHVkZWQgYXMgY29udGV4dC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnY2hhdC5pbXBsaWNpdENvbnRleHQuaW5jbHVkZUFjdGl2ZUVkaXRvcic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQuaW5jbHVkZUFjdGl2ZUVkaXRvcicsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWN0aXZlIGVkaXRvciBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZCBhcyBjb250ZXh0LCBldmVuIHdoZW4gaXQgd291bGQgb3RoZXJ3aXNlIG9ubHkgYmUgc3VnZ2VzdGVkLiBTZWxlY3Rpb25zIGFuZCBleHBsaWNpdGx5IGF0dGFjaGVkIGZpbGVzIGFyZSBhbHdheXMgaW5jbHVkZWQgcmVnYXJkbGVzcyBvZiB0aGlzIHNldHRpbmcuXFxuXFxuTm90ZTogdGhpcyBzZXR0aW5nIGN1cnJlbnRseSBvbmx5IGFwcGxpZXMgdG8gQWdlbnQgSG9zdCBzZXNzaW9ucyAoc3VjaCBhcyBDb3BpbG90KS5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiBmYWxzZSB9LFxuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdGluZy5hdXRvQWNjZXB0RGVsYXknOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheScsIFwiRGVsYXkgYWZ0ZXIgd2hpY2ggY2hhbmdlcyBtYWRlIGJ5IGNoYXQgYXJlIGF1dG9tYXRpY2FsbHkgYWNjZXB0ZWQuIFZhbHVlcyBhcmUgaW4gc2Vjb25kcywgYDBgIG1lYW5zIGRpc2FibGVkIGFuZCBgMTAwYCBzZWNvbmRzIGlzIHRoZSBtYXhpbXVtLlwiKSxcblx0XHRcdGRlZmF1bHQ6IDAsXG5cdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0bWF4aW11bTogMTAwXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJlbW92YWwnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmVtb3ZhbCcsIFwiV2hldGhlciB0byBzaG93IGEgY29uZmlybWF0aW9uIGJlZm9yZSByZW1vdmluZyBhIHJlcXVlc3QgYW5kIGl0cyBhc3NvY2lhdGVkIGVkaXRzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJldHJ5Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJldHJ5JywgXCJXaGV0aGVyIHRvIHNob3cgYSBjb25maXJtYXRpb24gYmVmb3JlIHJldHJ5aW5nIGEgcmVxdWVzdCBhbmQgaXRzIGFzc29jaWF0ZWQgZWRpdHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRpbmcuZXhwbGFpbkNoYW5nZXMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLmV4cGxhaW5DaGFuZ2VzLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxhaW4gYnV0dG9uIGluIHRoZSBDaGF0IHBhbmVsIGFuZCB0aGUgRXhwbGFpbiBDaGFuZ2VzIGNvbnRleHQgbWVudSBpbiB0aGUgU0NNIHZpZXcgYXJlIHNob3duLiBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUmV2ZWFsTmV4dENoYW5nZU9uUmVzb2x2ZV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLnJldmVhbE5leHRDaGFuZ2VPblJlc29sdmUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBhdXRvbWF0aWNhbGx5IHJldmVhbHMgdGhlIG5leHQgY2hhbmdlIGFmdGVyIGtlZXBpbmcgb3IgdW5kb2luZyBhIGNoYXQgZWRpdC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk9wZW5DaGFuZ2VkRmlsZUluRGlmZkVkaXRvcl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0aW5nLm9wZW5DaGFuZ2VkRmlsZUluRGlmZkVkaXRvcicsIFwiQ29udHJvbHMgd2hldGhlciBzZWxlY3RpbmcgYSBmaWxlIGluIHRoZSBjaGFuZ2VkIGZpbGVzIGxpc3Qgb2YgYSBjaGF0IHJlc3BvbnNlIG9wZW5zIGl0IGluIGEgZGlmZiBlZGl0b3Igc2hvd2luZyB0aGUgY2hhbmdlcyBtYWRlIGJ5IGNoYXQsIG9yIGluIGEgcmVndWxhciBlZGl0b3IuIEhvbGRpbmcgYGtic3R5bGUoQWx0KWAgd2hpbGUgc2VsZWN0aW5nIHRoZSBmaWxlIG9wZW5zIGl0IHdpdGggdGhlIG9wcG9zaXRlIGJlaGF2aW9yLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHQnY2hhdC50aXBzLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50aXBzLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGlwcyBhcmUgc2hvd24gYWJvdmUgdXNlciBtZXNzYWdlcyBpbiBjaGF0LiBOZXcgdGlwcyBhcmUgYWRkZWQgZnJlcXVlbnRseSwgc28gdGhpcyBpcyBhIGhlbHBmdWwgd2F5IHRvIHN0YXkgdXAgdG8gZGF0ZSB3aXRoIHRoZSBsYXRlc3QgZmVhdHVyZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdCdjaGF0LnVwdm90ZUFuaW1hdGlvbic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvZmYnLCAnY29uZmV0dGknLCAnZmxvYXRpbmdUaHVtYnMnLCAncHVsc2VXYXZlJywgJ3JhZGlhbnRMaW5lcyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQudXB2b3RlQW5pbWF0aW9uLm9mZicsIFwiTm8gYW5pbWF0aW9uIGlzIHNob3duLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnVwdm90ZUFuaW1hdGlvbi5jb25mZXR0aScsIFwiU2hvd3MgYSBjb25mZXR0aSBidXJzdCBhbmltYXRpb24gYXJvdW5kIHRoZSB0aHVtYnMgdXAgYnV0dG9uLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnVwdm90ZUFuaW1hdGlvbi5mbG9hdGluZ1RodW1icycsIFwiU2hvd3MgZmxvYXRpbmcgdGh1bWJzIHVwIGljb25zIHJpc2luZyBmcm9tIHRoZSBidXR0b24uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQudXB2b3RlQW5pbWF0aW9uLnB1bHNlV2F2ZScsIFwiU2hvd3MgZXhwYW5kaW5nIHB1bHNlIHJpbmdzIGZyb20gdGhlIGJ1dHRvbi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC51cHZvdGVBbmltYXRpb24ucmFkaWFudExpbmVzJywgXCJTaG93cyByYWRpYW50IGxpbmVzIGVtYW5hdGluZyBmcm9tIHRoZSBidXR0b24uXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXB2b3RlQW5pbWF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGFuIGFuaW1hdGlvbiBpcyBzaG93biB3aGVuIGNsaWNraW5nIHRoZSB0aHVtYnMgdXAgYnV0dG9uIG9uIGEgY2hhdCByZXNwb25zZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZmxvYXRpbmdUaHVtYnMnLFxuXHRcdH0sXG5cdFx0J2NoYXQuZXhwZXJpbWVudGFsLmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZC5kZXByZWNhdGVkJywgXCJUaGlzIHNldHRpbmcgaXMgZGVwcmVjYXRlZC4gUGxlYXNlIHVzZSBgY2hhdC5kZXRlY3RQYXJ0aWNpcGFudC5lbmFibGVkYCBpbnN0ZWFkLlwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnLCBcIkVuYWJsZXMgY2hhdCBwYXJ0aWNpcGFudCBhdXRvZGV0ZWN0aW9uIGZvciBwYW5lbCBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IG51bGxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmVuYWJsZWQnLCBcIkVuYWJsZXMgaW5jcmVtZW50YWwgcmVuZGVyaW5nIHdpdGggb3B0aW9uYWwgYmxvY2stbGV2ZWwgYW5pbWF0aW9uIHdoZW4gc3RyZWFtaW5nIGNoYXQgcmVzcG9uc2VzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5SaWNoTGlua3NdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5yaWNoTGlua3MuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBzdXBwb3J0ZWQgbGlua3MgaW4gY2hhdCBhcmUgcmVuZGVyZWQgYXMgcmljaCBsaW5rcyB3aXRoIGxpdmUgbWV0YWRhdGEuIEVuYWJsaW5nIHRoaXMgbWF5IG1ha2UgYXV0aGVudGljYXRlZCByZXF1ZXN0cyB0byBzZXJ2aWNlcyBzdWNoIGFzIEdpdEh1Yi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdhdXRvJyB9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nU3R5bGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnbm9uZScsICdmYWRlJywgJ3Jpc2UnLCAnYmx1cicsICdzY2FsZScsICdzbGlkZScsICdyZXZlYWwnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5pbmNyZW1lbnRhbFJlbmRlcmluZy5hbmltYXRpb25TdHlsZS5ub25lJywgXCJObyBhbmltYXRpb24uIENvbnRlbnQgYXBwZWFycyBpbnN0YW50bHkuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLmZhZGUnLCBcIlNpbXBsZSBvcGFjaXR5IGZhZGUgZnJvbSAwIHRvIDEuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLnJpc2UnLCBcIkNvbnRlbnQgZmFkZXMgaW4gd2hpbGUgcmlzaW5nIHVwd2FyZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuYmx1cicsIFwiQ29udGVudCBmYWRlcyBpbiBmcm9tIGEgYmx1cnJlZCBzdGF0ZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuc2NhbGUnLCBcIkNvbnRlbnQgc2NhbGVzIHVwIGZyb20gc2xpZ2h0bHkgc21hbGxlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuc2xpZGUnLCBcIkNvbnRlbnQgc2xpZGVzIGluIGZyb20gdGhlIGxlZnQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLnJldmVhbCcsIFwiQ29udGVudCByZXZlYWxzIHRvcC10by1ib3R0b20gd2l0aCBhIHNvZnQgZ3JhZGllbnQgZWRnZS5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUnLCBcIkNvbnRyb2xzIHRoZSBhbmltYXRpb24gc3R5bGUgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZmFkZScsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nQnVmZmVyaW5nXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICd3b3JkJywgJ3BhcmFncmFwaCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmJ1ZmZlcmluZy5vZmYnLCBcIlJlbmRlcnMgY29udGVudCBpbW1lZGlhdGVseSBhcyB0b2tlbnMgYXJyaXZlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5pbmNyZW1lbnRhbFJlbmRlcmluZy5idWZmZXJpbmcud29yZCcsIFwiUmV2ZWFscyBjb250ZW50IHdvcmQgYnkgd29yZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYnVmZmVyaW5nLnBhcmFncmFwaCcsIFwiQnVmZmVycyBjb250ZW50IHVudGlsIGEgcGFyYWdyYXBoIGJyZWFrIGJlZm9yZSByZW5kZXJpbmcuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmJ1ZmZlcmluZycsIFwiQ29udHJvbHMgaG93IGNvbnRlbnQgaXMgYnVmZmVyZWQgYmVmb3JlIHJlbmRlcmluZyBkdXJpbmcgaW5jcmVtZW50YWwgcmVuZGVyaW5nLiBMb3dlciBidWZmZXJpbmcgbGV2ZWxzIHJlbmRlciBmYXN0ZXIgYnV0IG1heSBzaG93IGluY29tcGxldGUgc2VudGVuY2VzIG9yIHBhcnRpYWxseSBmb3JtZWQgbWFya2Rvd24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ3dvcmQnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQuY29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY29tcGxldGVkIGNoYXQgcmVzcG9uc2VzIGNvbGxhcHNlIGludGVybWVkaWF0ZSB3b3JrIHdoaWxlIGtlZXBpbmcgdGhlIGZpbmFsIHJlc3BvbnNlIHZpc2libGUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJyxcblx0XHR9LFxuXHRcdCdjaGF0LmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnLCBcIkVuYWJsZXMgY2hhdCBwYXJ0aWNpcGFudCBhdXRvZGV0ZWN0aW9uIGZvciBwYW5lbCBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5JbmxpbmVSZWZlcmVuY2VzU3R5bGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYm94JywgJ2xpbmsnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmlubGluZVJlZmVyZW5jZXMuc3R5bGUuYm94JywgXCJEaXNwbGF5IGZpbGUgYW5kIHN5bWJvbCByZWZlcmVuY2VzIGFzIGJveGVkIHdpZGdldHMgd2l0aCBpY29ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbmxpbmVSZWZlcmVuY2VzLnN0eWxlLmxpbmsnLCBcIkRpc3BsYXkgZmlsZSBhbmQgc3ltYm9sIHJlZmVyZW5jZXMgYXMgc2ltcGxlIGJsdWUgbGlua3Mgd2l0aG91dCBpY29ucy5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmlubGluZVJlZmVyZW5jZXMuc3R5bGUnLCBcIkNvbnRyb2xzIGhvdyBmaWxlIGFuZCBzeW1ib2wgcmVmZXJlbmNlcyBhcmUgZGlzcGxheWVkIGluIGNoYXQgbWVzc2FnZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2JveCdcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JBc3NvY2lhdGlvbnNdOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0b3JBc3NvY2lhdGlvbnMnLCBcIkNvbmZpZ3VyZSBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIHRvIGVkaXRvcnMgZm9yIG9wZW5pbmcgZmlsZXMgZnJvbSBjaGF0IChmb3IgZXhhbXBsZSBgXFxcIioubWRcXFwiOiBcXFwidnNjb2RlLm1hcmtkb3duLnByZXZpZXcuZWRpdG9yXFxcImApLlwiKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uQ29uZmlybWF0aW9uXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICd3aW5kb3dOb3RGb2N1c2VkJywgJ2Fsd2F5cyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24ub2ZmJywgXCJOZXZlciBzaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIGNvbmZpcm1hdGlvbnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24ud2luZG93Tm90Rm9jdXNlZCcsIFwiU2hvdyBPUyBub3RpZmljYXRpb25zIGZvciBjb25maXJtYXRpb25zIHdoZW4gdGhlIHdpbmRvdyBpcyBub3QgZm9jdXNlZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ub3RpZnlXaW5kb3dPbkNvbmZpcm1hdGlvbi5hbHdheXMnLCBcIkFsd2F5cyBzaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIGNvbmZpcm1hdGlvbnMsIGV2ZW4gd2hlbiB0aGUgd2luZG93IGlzIGZvY3VzZWQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBjaGF0IHNlc3Npb24gc2hvdWxkIHByZXNlbnQgdGhlIHVzZXIgd2l0aCBhbiBPUyBub3RpZmljYXRpb24gd2hlbiBhIGNvbmZpcm1hdGlvbiBvciBxdWVzdGlvbiBuZWVkcyBpbnB1dC4gVGhpcyBpbmNsdWRlcyBhIHdpbmRvdyBiYWRnZSBhcyB3ZWxsIGFzIG5vdGlmaWNhdGlvbiB0b2FzdC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnd2luZG93Tm90Rm9jdXNlZCcsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5XToge1xuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXV0b1JlcGx5LmRlc2NyaXB0aW9uJywgXCJBdXRvbWF0aWNhbGx5IHNraXAgcXVlc3Rpb24gY2Fyb3VzZWxzIGJ5IHRlbGxpbmcgdGhlIGFnZW50IHRoYXQgdGhlIHVzZXIgaXMgbm90IGF2YWlsYWJsZSBhbmQgdG8gdXNlIGl0cyBiZXN0IGp1ZGdtZW50LiBUaGlzIGlzIGFuIGFkdmFuY2VkIHNldHRpbmcgYW5kIGNhbiBsZWFkIHRvIHVuaW50ZW5kZWQgY2hvaWNlcyBvciBhY3Rpb25zIGJhc2VkIG9uIGluY29tcGxldGUgY29udGV4dC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0QXV0b1JlcGx5RW5hYmxlZENvbmZpZ0tleSB9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkF1dG9waWxvdEFkdmFuY2VkRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hdXRvcGlsb3QuYWR2YW5jZWQuZW5hYmxlZCcsIFwiRW5hYmxlcyAqKkFkdmFuY2VkIEF1dG9waWxvdCoqLCBhIHNpbmdsZSBzd2l0Y2ggdGhhdCB0dXJucyBvbiBhbGwgYWR2YW5jZWQgQXV0b3BpbG90IGJlaGF2aW9ycyB0aGF0IGRlbGVnYXRlIG1vcmUgb2YgdGhlIGxvb3AgdG8gdGhlIGFnZW50LiBDdXJyZW50bHksIGFmdGVyIGVhY2ggQXV0b3BpbG90IHR1cm4gYSBzbWFsbCwgZmFzdCBtb2RlbCBldmFsdWF0ZXMgd2hldGhlciB5b3VyIG9yaWdpbmFsIHJlcXVlc3QgaXMgY29tcGxldGU7IGlmIG5vdCwgQXV0b3BpbG90IGtlZXBzIHdvcmtpbmcgdXNpbmcgdGhhdCBldmFsdWF0aW9uIGFzIGd1aWRhbmNlIGZvciB0aGUgbmV4dCB0dXJuLCBpbnN0ZWFkIG9mIHJlbHlpbmcgb24gdGhlIGFnZW50IHRvIHNpZ25hbCBjb21wbGV0aW9uIGl0c2VsZi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW0NoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3RdLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQuZGVmYXVsdC5sYWJlbCcsIFwiRGVmYXVsdCBQZXJtaXNzaW9uc1wiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQuYXV0b0FwcHJvdmUubGFiZWwnLCBcIkJ5cGFzcyBBcHByb3ZhbHNcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0LmF1dG9waWxvdC5sYWJlbCcsIFwiQXV0b3BpbG90IChQcmV2aWV3KVwiKSxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0LmRlZmF1bHQuZGVzY3JpcHRpb24nLCBcIlN0YXJ0IG5ldyBjaGF0IHNlc3Npb25zIHdpdGggRGVmYXVsdCBQZXJtaXNzaW9ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0LmF1dG9BcHByb3ZlLmRlc2NyaXB0aW9uJywgXCJTdGFydCBuZXcgY2hhdCBzZXNzaW9ucyBpbiBCeXBhc3MgQXBwcm92YWxzIG1vZGUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQucGVybWlzc2lvbnMuZGVmYXVsdC5hdXRvcGlsb3QuZGVzY3JpcHRpb24nLCBcIlN0YXJ0IG5ldyBjaGF0IHNlc3Npb25zIGluIEF1dG9waWxvdCBtb2RlLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQuc2V0dGluZ0Rlc2NyaXB0aW9uJywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBwZXJtaXNzaW9ucyBwaWNrZXIgbW9kZSBmb3IgbmV3IGxvY2FsIGNoYXQgc2Vzc2lvbnMuIFlvdSBjYW4gc3RpbGwgY2hhbmdlIHRoZSBwZXJtaXNzaW9uIG1vZGUgcGVyIHNlc3Npb24sIGFuZCBlYWNoIHNlc3Npb24gcmVtZW1iZXJzIHRoZSBwZXJtaXNzaW9uIG1vZGUgdGhhdCB3YXMgdXNlZC4gSWYgZW50ZXJwcmlzZSBwb2xpY3kgZGlzYWJsZXMgYXV0byBhcHByb3ZhbCwgbmV3IHNlc3Npb25zIHVzZSBEZWZhdWx0IFBlcm1pc3Npb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Bc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFzc2lzdGVkUGVybWlzc2lvbnMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBBc3Npc3RlZCBwZXJtaXNzaW9ucyBpcyBzaG93biBpbiBBZ2VudCBIb3N0IGFwcHJvdmFsIHBpY2tlcnMuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlBlcm1pc3Npb25zU2FuZGJveFRvZ2dsZUVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwucGVybWlzc2lvbnNTYW5kYm94VG9nZ2xlLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHBlcm1pc3Npb25zIHBpY2tlciBzaG93cyBhbiBpbmxpbmUgXFxcIlNhbmRib3hpbmcgZm9yIHRlcm1pbmFsXFxcIiB0b2dnbGUgb24gdGhlIE1hbnVhbCBwZXJtaXNzaW9ucyBvcHRpb24uIEZvciBDb3BpbG90IFNESyBzZXNzaW9ucyB1c2luZyB0aGUgYnVpbHQtaW4gc2hlbGwgdG9vbCwgdGhlIHRvZ2dsZSByZWZsZWN0cyBhbmQgdXBkYXRlcyBgI2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZCNgIG9yIGAjY2hhdC5hZ2VudEhvc3Quc2RrU2FuZGJveC5lbmFibGVkV2luZG93cyNgLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbl06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRtb2RlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbi5tb2RlLmludGVyYWN0aXZlJywgXCJJbnRlcmFjdGl2ZSBcdTIwMTQgc3RlcC1ieS1zdGVwIGNvbGxhYm9yYXRpb24uXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLm1vZGUucGxhbicsIFwiUGxhbiBcdTIwMTQgcGxhbiBmaXJzdCwgZXhlY3V0ZSB3aGVuIHJlYWR5LlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbi5tb2RlLmF1dG9waWxvdCcsIFwiQXV0b3BpbG90IFx1MjAxNCBhdXRvbm9tb3VzbHkgaXRlcmF0ZSBmcm9tIHN0YXJ0IHRvIGZpbmlzaC5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnaW50ZXJhY3RpdmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24ubW9kZS5kZXNjcmlwdGlvbicsIFwiVGhlIHN0YXJ0aW5nIG1vZGUgZm9yIG5ldyBhZ2VudCBzZXNzaW9ucy5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFwcHJvdmFsczoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFtDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5NYW51YWwsIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLCBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5BbGxvd0FsbF0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLmFwcHJvdmFscy5tYW51YWwnLCBcIk1hbnVhbCBwZXJtaXNzaW9ucyBcdTIwMTQgYXNrcyB3aGVuIGFwcHJvdmFsIHNldHRpbmdzIGRvbid0IGFwcGx5LlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbi5hcHByb3ZhbHMuYXNzaXN0ZWQnLCBcIkFzc2lzdGVkIHBlcm1pc3Npb25zIFx1MjAxNCBldmFsdWF0ZXMgcmlzayBiZWZvcmUgcnVubmluZyB0b29scy5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24uYXBwcm92YWxzLmFsbG93QWxsJywgXCJBbGxvdyBBbGwgXHUyMDE0IHJ1bnMgdG9vbCBjYWxscyB3aXRob3V0IGFza2luZy5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5NYW51YWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbi5hcHByb3ZhbHMuZGVzY3JpcHRpb24nLCBcIlRoZSBzdGFydGluZyBhcHByb3ZhbCBiZWhhdmlvciBmb3IgbmV3IGFnZW50IHNlc3Npb25zLiBJZiBlbnRlcnByaXNlIHBvbGljeSBkaXNhYmxlcyBhdXRvIGFwcHJvdmFsLCBuZXcgc2Vzc2lvbnMgdXNlIE1hbnVhbCBwZXJtaXNzaW9ucy5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDogeyBtb2RlOiAnaW50ZXJhY3RpdmUnLCBhcHByb3ZhbHM6IENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLk1hbnVhbCB9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLnNldHRpbmdEZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgdGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBmb3IgbmV3IGFnZW50IHNlc3Npb25zIChzdWNoIGFzIENvcGlsb3QpLiBZb3UgY2FuIHN0aWxsIGNoYW5nZSB0aGUgbW9kZSBhbmQgYXBwcm92YWwgYmVoYXZpb3IgcGVyIHNlc3Npb24sIGFuZCBlYWNoIHNlc3Npb24gcmVtZW1iZXJzIHdoYXQgd2FzIHVzZWQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdE1vZGVsLmRlc2NyaXB0aW9uJywgXCJUaGUgZGVmYXVsdCBtb2RlbCBmb3IgbmV3IGNoYXQgY29udmVyc2F0aW9ucy4gVXNlIFxcXCJhdXRvXFxcIiB0byBsZXQgQ29waWxvdCBwaWNrIGEgbW9kZWwsIGEgbW9kZWwgZmFtaWx5IG5hbWUgKHN1Y2ggYXMgXFxcIm9wdXNcXFwiIG9yIFxcXCJnZW1pbmlcXFwiKSB0byB1c2UgdGhlIGxhdGVzdCBhdmFpbGFibGUgbW9kZWwgaW4gdGhhdCBmYW1pbHksIG9yIGEgZnVsbCBtb2RlbCBpZC4gWW91IGNhbiBzdGlsbCBzd2l0Y2ggdGhlIG1vZGVsIHdpdGhpbiBhIGNvbnZlcnNhdGlvbjsgZWFjaCBuZXcgY29udmVyc2F0aW9uIHN0YXJ0cyBhdCB0aGlzIG1vZGVsLlwiKSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0RGVmYXVsdE1vZGVsJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkTW9kZWxWYWx1ZSgpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9NT0RFTF9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0W0NPUElMT1RfVE9QX0xFVkVMX01PREVMX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuZGVmYXVsdE1vZGVsLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRNb2RlbC5wb2xpY3knLCBcIlNldHMgdGhlIGRlZmF1bHQgY2hhdCBtb2RlbCBmb3IgbmV3IGNvbnZlcnNhdGlvbnMuIEFjY2VwdHMgXFxcImF1dG9cXFwiLCBhIG1vZGVsIGZhbWlseSBuYW1lIChzdWNoIGFzIFxcXCJvcHVzXFxcIiBvciBcXFwiZ2VtaW5pXFxcIiksIG9yIGEgZnVsbCBtb2RlbCBpZC4gVXNlcnMgY2FuIHN0aWxsIHN3aXRjaCB0aGUgbW9kZWwgd2l0aGluIGEgY29udmVyc2F0aW9uLlwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmVdOiB7XG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24udmFsdWUsXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5IH0sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRUb29sc0F1dG9BcHByb3ZlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0dmFsdWU6IChwb2xpY3lEYXRhKSA9PiBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldID09PSAnZGlzYWJsZScgfHwgcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdhdXRvQXBwcm92ZTMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnYXV0b0FwcHJvdmUzLmRlc2NyaXB0aW9uJywgJ0dsb2JhbCBhdXRvIGFwcHJvdmUgYWxzbyBrbm93biBhcyBcIllPTE8gbW9kZVwiIGRpc2FibGVzIG1hbnVhbCBhcHByb3ZhbCBjb21wbGV0ZWx5IGZvciBhbGwgdG9vbHMgaW4gYWxsIHdvcmtzcGFjZXMsIGFsbG93aW5nIHRoZSBhZ2VudCB0byBhY3QgZnVsbHkgYXV0b25vbW91c2x5LiBUaGlzIGlzIGV4dHJlbWVseSBkYW5nZXJvdXMgYW5kIGlzICpuZXZlciogcmVjb21tZW5kZWQsIGV2ZW4gY29udGFpbmVyaXplZCBlbnZpcm9ubWVudHMgbGlrZSBDb2Rlc3BhY2VzIGFuZCBEZXYgQ29udGFpbmVycyBoYXZlIHVzZXIga2V5cyBmb3J3YXJkZWQgaW50byB0aGUgY29udGFpbmVyIHRoYXQgY291bGQgYmUgY29tcHJvbWlzZWQuXFxuXFxuVGhpcyBmZWF0dXJlIGRpc2FibGVzIGNyaXRpY2FsIHNlY3VyaXR5IHByb3RlY3Rpb25zIGFuZCBtYWtlcyBpdCBtdWNoIGVhc2llciBmb3IgYW4gYXR0YWNrZXIgdG8gY29tcHJvbWlzZSB0aGUgbWFjaGluZS5cXG5cXG5Ob3RlOiBUaGlzIHNldHRpbmcgb25seSBjb250cm9scyB0b29sIGFwcHJvdmFsIGFuZCBkb2VzIG5vdCBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGFza2luZyBxdWVzdGlvbnMuIFRvIGF1dG9tYXRpY2FsbHkgYW5zd2VyIGFnZW50IHF1ZXN0aW9ucywgdXNlIHRoZSBgI2NoYXQuYXV0b1JlcGx5I2Agc2V0dGluZy4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TZXNzaW9uU3luY0VuYWJsZWRdOiB7XG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5zZXNzaW9uU3luYy5lbmFibGVkJywgXCJFbmFibGUgc2Vzc2lvbiBzeW5jIHRvIEdpdEh1Yi5jb20uIFdoZW4gZW5hYmxlZCwgQ29waWxvdCBzZXNzaW9uIGRhdGEgaXMgc3luY2VkIHRvIHlvdXIgR2l0SHViIGFjY291bnQgZm9yIGNyb3NzLWRldmljZSBhY2Nlc3MgYW5kIHJpY2hlciBpbnNpZ2h0cy4gUmVxdWlyZXMgYCNnaXRodWIuY29waWxvdC5jaGF0LmxvY2FsSW5kZXguZW5hYmxlZCNgIHRvIGFsc28gYmUgZW5hYmxlZC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH0sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RTZXNzaW9uU3luYycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjEnLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEuY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LnNlc3Npb25TeW5jLmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuc2Vzc2lvblN5bmMuZW5hYmxlZC5wb2xpY3knLCBcIkVuYWJsZSBzZXNzaW9uIHN5bmMgdG8gR2l0SHViLmNvbSBmb3IgY3Jvc3MtZGV2aWNlIENvcGlsb3Qgc2Vzc2lvbiBoaXN0b3J5LiBXaGVuIGRpc2FibGVkIGJ5IG9yZ2FuaXphdGlvbiBwb2xpY3ksIHNlc3Npb24gZGF0YSBpcyBrZXB0IGxvY2FsIG9ubHkuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRhZ2VudEhvc3Q6IHsga2V5OiBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXkgfSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TZXNzaW9uU3luY0V4Y2x1ZGVSZXBvc2l0b3JpZXNdOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnNlc3Npb25TeW5jLmV4Y2x1ZGVSZXBvc2l0b3JpZXMnLCBcIlJlcG9zaXRvcnkgcGF0dGVybnMgdG8gZXhjbHVkZSBmcm9tIHNlc3Npb24gc3luYy4gVXNlIGV4YWN0IGBvd25lci9yZXBvYCBuYW1lcyBvciBnbG9iIHBhdHRlcm5zIGxpa2UgYG15LW9yZy8qYC4gU2Vzc2lvbnMgZnJvbSBtYXRjaGluZyByZXBvc2l0b3JpZXMgd2lsbCBvbmx5IGJlIHN0b3JlZCBsb2NhbGx5LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVFZGl0c106IHtcblx0XHRcdGRlZmF1bHQ6IERFRkFVTFRfRURJVF9BVVRPX0FQUFJPVkVfUEFUVEVSTlMsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuYXV0b0FwcHJvdmUuZWRpdHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZWRpdHMgbWFkZSBieSB0aGUgYWdlbnQgYXJlIGF1dG9tYXRpY2FsbHkgYXBwcm92ZWQuIFRoZSBkZWZhdWx0IGlzIHRvIGFwcHJvdmUgYWxsIGVkaXRzIGV4Y2VwdCB0aG9zZSBtYWRlIHRvIGNlcnRhaW4gZmlsZXMgd2hpY2ggaGF2ZSB0aGUgcG90ZW50aWFsIHRvIGNhdXNlIGltbWVkaWF0ZSB1bmludGVuZGVkIHNpZGUtZWZmZWN0cywgc3VjaCBhcyBgKiovLnZzY29kZS8qLmpzb25gLlxcblxcblNldCB0byBgdHJ1ZWAgdG8gYXV0b21hdGljYWxseSBhcHByb3ZlIGVkaXRzIHRvIG1hdGNoaW5nIGZpbGVzLCBgZmFsc2VgIHRvIGFsd2F5cyByZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsLiBUaGUgbGFzdCBwYXR0ZXJuIG1hdGNoaW5nIGEgZ2l2ZW4gZmlsZSB3aWxsIGRldGVybWluZSB3aGV0aGVyIHRoZSBlZGl0IGlzIGF1dG9tYXRpY2FsbHkgYXBwcm92ZWQuXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR9LFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdGFnZW50SG9zdDoge1xuXHRcdFx0XHRrZXk6IEFnZW50SG9zdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zQ29uZmlnS2V5LFxuXHRcdFx0XHR0cmFuc2Zvcm06IG1lcmdlQ2hhdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zLFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BdXRvQXBwcm92ZWRVcmxzXToge1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20nOiB0cnVlLFxuXHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvd2lraS8qJzogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuZmV0Y2hQYWdlLmFwcHJvdmVkVXJscycsIFwiQ29udHJvbHMgd2hpY2ggVVJMcyBhcmUgYXV0b21hdGljYWxseSBhcHByb3ZlZCB3aGVuIHJlcXVlc3RlZCBieSBjaGF0IHRvb2xzLiBLZXlzIGFyZSBVUkwgcGF0dGVybnMgYW5kIHZhbHVlcyBjYW4gYmUgYHRydWVgIHRvIGFwcHJvdmUgYm90aCByZXF1ZXN0cyBhbmQgcmVzcG9uc2VzLCBgZmFsc2VgIHRvIGRlbnksIG9yIGFuIG9iamVjdCB3aXRoIGBhcHByb3ZlUmVxdWVzdGAgYW5kIGBhcHByb3ZlUmVzcG9uc2VgIHByb3BlcnRpZXMgZm9yIGdyYW51bGFyIGNvbnRyb2wuXFxuXFxuRXhhbXBsZXM6XFxuLSBgXFxcImh0dHBzOi8vZXhhbXBsZS5jb21cXFwiOiB0cnVlYCAtIEFwcHJvdmUgYWxsIHJlcXVlc3RzIHRvIGV4YW1wbGUuY29tXFxuLSBgXFxcImh0dHBzOi8vKi5leGFtcGxlLmNvbVxcXCI6IHRydWVgIC0gQXBwcm92ZSBhbGwgcmVxdWVzdHMgdG8gYW55IHN1YmRvbWFpbiBvZiBleGFtcGxlLmNvbVxcbi0gYFxcXCJodHRwczovL2V4YW1wbGUuY29tL2FwaS8qXFxcIjogeyBcXFwiYXBwcm92ZVJlcXVlc3RcXFwiOiB0cnVlLCBcXFwiYXBwcm92ZVJlc3BvbnNlXFxcIjogZmFsc2UgfWAgLSBBcHByb3ZlIHJlcXVlc3RzIGJ1dCBub3QgcmVzcG9uc2VzIGZvciBleGFtcGxlLmNvbS9hcGkgcGF0aHNcIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0YXBwcm92ZVJlcXVlc3Q6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVSZXNwb25zZTogeyB0eXBlOiAnYm9vbGVhbicgfVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsXToge1xuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuZWxpZ2libGVGb3JBdXRvQXBwcm92YWwnLCAnQ29udHJvbHMgd2hpY2ggdG9vbHMgYXJlIGVsaWdpYmxlIGZvciBhdXRvbWF0aWMgYXBwcm92YWwuIFRvb2xzIHNldCB0byBcXCdmYWxzZVxcJyB3aWxsIGFsd2F5cyBwcmVzZW50IGEgY29uZmlybWF0aW9uIGFuZCB3aWxsIG5ldmVyIG9mZmVyIHRoZSBvcHRpb24gdG8gYXV0by1hcHByb3ZlLiBUaGUgZGVmYXVsdCBiZWhhdmlvciAob3Igc2V0dGluZyBhIHRvb2wgdG8gXFwndHJ1ZVxcJykgbWF5IHJlc3VsdCBpbiB0aGUgdG9vbCBvZmZlcmluZyBhdXRvLWFwcHJvdmFsIG9wdGlvbnMuJyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdFx0ZW51bTogdG9vbFJlZmVyZW5jZU5hbWVFbnVtVmFsdWVzLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiB0b29sUmVmZXJlbmNlTmFtZUVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0fSxcblx0XHRcdGV4YW1wbGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnZmV0Y2gnOiBmYWxzZSxcblx0XHRcdFx0XHQncnVuVGFzayc6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRUb29sc0VsaWdpYmxlRm9yQXV0b0FwcHJvdmFsJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEwNycsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LnRvb2xzLmVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuZWxpZ2libGVGb3JBdXRvQXBwcm92YWwnLCAnQ29udHJvbHMgd2hpY2ggdG9vbHMgYXJlIGVsaWdpYmxlIGZvciBhdXRvbWF0aWMgYXBwcm92YWwuIFRvb2xzIHNldCB0byBcXCdmYWxzZVxcJyB3aWxsIGFsd2F5cyBwcmVzZW50IGEgY29uZmlybWF0aW9uIGFuZCB3aWxsIG5ldmVyIG9mZmVyIHRoZSBvcHRpb24gdG8gYXV0by1hcHByb3ZlLiBUaGUgZGVmYXVsdCBiZWhhdmlvciAob3Igc2V0dGluZyBhIHRvb2wgdG8gXFwndHJ1ZVxcJykgbWF5IHJlc3VsdCBpbiB0aGUgdG9vbCBvZmZlcmluZyBhdXRvLWFwcHJvdmFsIG9wdGlvbnMuJylcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXJ0aWZhY3RzRW5hYmxlZF06IHtcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgYXJ0aWZhY3RzIHZpZXcgaXMgYXZhaWxhYmxlIGluIGNoYXQuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFydGlmYWN0c1J1bGVzQnlNaW1lVHlwZV06IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2ltYWdlLyonOiB7IGdyb3VwTmFtZTogJ1NjcmVlbnNob3RzJywgb25seVNob3dHcm91cDogdHJ1ZSB9XG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlNaW1lVHlwZScsIFwiUnVsZXMgZm9yIGV4dHJhY3RpbmcgYXJ0aWZhY3RzIGZyb20gdG9vbCByZXN1bHRzIGJ5IE1JTUUgdHlwZS4gTWFwcyBNSU1FIHR5cGUgcGF0dGVybnMgKGUuZy4gJ2ltYWdlLyonKSB0byBncm91cCBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRncm91cE5hbWU6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmdyb3VwTmFtZScsIFwiRGlzcGxheSBuYW1lIGZvciB0aGUgYXJ0aWZhY3QgZ3JvdXAuXCIpIH0sXG5cdFx0XHRcdFx0b25seVNob3dHcm91cDogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLm9ubHlTaG93R3JvdXAnLCBcIldoZW4gdHJ1ZSwgc2hvdyBvbmx5IHRoZSBncm91cCBoZWFkZXIgaW5zdGVhZCBvZiBpbmRpdmlkdWFsIGl0ZW1zLlwiKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2dyb3VwTmFtZSddXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFydGlmYWN0c1J1bGVzQnlGaWxlUGF0aF06IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0JyoqLypwbGFuKi5tZCc6IHsgZ3JvdXBOYW1lOiAnUGxhbnMnIH1cblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieUZpbGVQYXRoJywgXCJSdWxlcyBmb3IgZXh0cmFjdGluZyBhcnRpZmFjdHMgZnJvbSB3cml0dGVuIGZpbGVzIGJ5IGZpbGUgcGF0aCBwYXR0ZXJuLiBNYXBzIGdsb2IgcGF0dGVybnMgdG8gZ3JvdXAgY29uZmlndXJhdGlvbi5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieUZpbGVQYXRoLmdyb3VwTmFtZScsIFwiRGlzcGxheSBuYW1lIGZvciB0aGUgYXJ0aWZhY3QgZ3JvdXAuXCIpIH0sXG5cdFx0XHRcdFx0b25seVNob3dHcm91cDogeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5RmlsZVBhdGgub25seVNob3dHcm91cCcsIFwiV2hlbiB0cnVlLCBzaG93IG9ubHkgdGhlIGdyb3VwIGhlYWRlciBpbnN0ZWFkIG9mIGluZGl2aWR1YWwgaXRlbXMuXCIpIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnZ3JvdXBOYW1lJ11cblx0XHRcdH0sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXJ0aWZhY3RzUnVsZXNCeU1lbW9yeUZpbGVQYXRoXToge1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnKiovKnBsYW4qLm1kJzogeyBncm91cE5hbWU6ICdQbGFucycgfVxuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5TWVtb3J5RmlsZVBhdGgnLCBcIlJ1bGVzIGZvciBleHRyYWN0aW5nIGFydGlmYWN0cyBmcm9tIG1lbW9yeSB0b29sIGNhbGxzIGJ5IG1lbW9yeSBmaWxlIHBhdGggcGF0dGVybi4gTWFwcyBnbG9iIHBhdHRlcm5zIHRvIGdyb3VwIGNvbmZpZ3VyYXRpb24uXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGdyb3VwTmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlNZW1vcnlGaWxlUGF0aC5ncm91cE5hbWUnLCBcIkRpc3BsYXkgbmFtZSBmb3IgdGhlIGFydGlmYWN0IGdyb3VwLlwiKSB9LFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieU1lbW9yeUZpbGVQYXRoLm9ubHlTaG93R3JvdXAnLCBcIldoZW4gdHJ1ZSwgc2hvdyBvbmx5IHRoZSBncm91cCBoZWFkZXIgaW5zdGVhZCBvZiBpbmRpdmlkdWFsIGl0ZW1zLlwiKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2dyb3VwTmFtZSddXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0J2NoYXQudW5kb1JlcXVlc3RzLnJlc3RvcmVJbnB1dCc6IHtcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudW5kb1JlcXVlc3RzLnJlc3RvcmVJbnB1dCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgaW5wdXQgb2YgdGhlIGNoYXQgc2hvdWxkIGJlIHJlc3RvcmVkIHdoZW4gYW4gdW5kbyByZXF1ZXN0IGlzIG1hZGUuIFRoZSBpbnB1dCB3aWxsIGJlIGZpbGxlZCB3aXRoIHRoZSB0ZXh0IG9mIHRoZSByZXF1ZXN0IHRoYXQgd2FzIHJlc3RvcmVkLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRSZXF1ZXN0cyc6IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0UmVxdWVzdHMnLCBcIkVuYWJsZXMgZWRpdGluZyBvZiByZXF1ZXN0cyBpbiB0aGUgY2hhdC4gVGhpcyBhbGxvd3MgeW91IHRvIGNoYW5nZSB0aGUgcmVxdWVzdCBjb250ZW50IGFuZCByZXN1Ym1pdCBpdCB0byB0aGUgbW9kZWwuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2lubGluZScsICdob3ZlcicsICdpbnB1dCcsICdub25lJ10sXG5cdFx0XHRkZWZhdWx0OiAnaW5saW5lJyxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnZpZXdTZXNzaW9ucy5lbmFibGVkJywgXCJTaG93IGNoYXQgYWdlbnQgc2Vzc2lvbnMgd2hlbiBjaGF0IGlzIGVtcHR5IG9yIHRvIHRoZSBzaWRlIHdoZW4gY2hhdCB2aWV3IGlzIHdpZGUgZW5vdWdoLlwiKSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiBmYWxzZSB9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3U2Vzc2lvbnNPcmllbnRhdGlvbl06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzdGFja2VkJywgJ3NpZGVCeVNpZGUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnZpZXdTZXNzaW9ucy5vcmllbnRhdGlvbi5zdGFja2VkJywgXCJEaXNwbGF5IGNoYXQgc2Vzc2lvbnMgdmVydGljYWxseSBzdGFja2VkIGFib3ZlIHRoZSBjaGF0IGlucHV0IHVubGVzcyBhIGNoYXQgc2Vzc2lvbiBpcyB2aXNpYmxlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnZpZXdTZXNzaW9ucy5vcmllbnRhdGlvbi5zaWRlQnlTaWRlJywgXCJEaXNwbGF5IGNoYXQgc2Vzc2lvbnMgc2lkZSBieSBzaWRlIGlmIHNwYWNlIGlzIHN1ZmZpY2llbnQsIG90aGVyd2lzZSBmYWxsYmFjayB0byBzdGFja2VkIGFib3ZlIHRoZSBjaGF0IGlucHV0IHVubGVzcyBhIGNoYXQgc2Vzc2lvbiBpcyB2aXNpYmxlLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdzaWRlQnlTaWRlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudmlld1Nlc3Npb25zLm9yaWVudGF0aW9uJywgXCJDb250cm9scyB0aGUgb3JpZW50YXRpb24gb2YgdGhlIGNoYXQgYWdlbnQgc2Vzc2lvbnMgdmlldyB3aGVuIGl0IGlzIHNob3duIGFsb25nc2lkZSB0aGUgY2hhdC5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdQcm9ncmVzc0JhZGdlRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC52aWV3UHJvZ3Jlc3NCYWRnZS5lbmFibGVkJywgXCJTaG93IGEgcHJvZ3Jlc3MgYmFkZ2Ugb24gdGhlIGNoYXQgdmlldyB3aGVuIGFuIGFnZW50IHNlc3Npb24gaXMgaW4gcHJvZ3Jlc3MgdGhhdCBpcyBvcGVuZWQgaW4gdGhhdCB2aWV3LlwiKSxcblx0XHR9LFxuXHRcdFtDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2FyY2hpdmUnLCAnZG9uZSddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLnNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5hcmNoaXZlJywgXCJVc2UgQXJjaGl2ZSwgQXJjaGl2ZSBBbGwsIFVuYXJjaGl2ZSwgYW5kIFVuYXJjaGl2ZSBBbGwuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLnNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5kb25lJywgXCJVc2UgTWFyayBhcyBEb25lLCBNYXJrIEFsbCBhcyBEb25lLCBSZXN0b3JlLCBhbmQgUmVzdG9yZSBBbGwuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdhcmNoaXZlJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuc2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nJywgXCJDb250cm9scyB0aGUgd29yZGluZyBhbmQgaWNvbnMgdXNlZCBieSBhY3Rpb25zIHRoYXQgYXJjaGl2ZSBhbmQgdW5hcmNoaXZlIGNoYXQgc2Vzc2lvbnMsIGFzIHdlbGwgYXMgdGhlIGxhYmVsIG9mIHRoZSBhcmNoaXZlZCBzZXNzaW9ucyBzZWN0aW9uLlwiKSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWRkZW4nLCAnZGVmYXVsdCcsICdjdXN0b20nXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5oaWRkZW4nLCBcIk5ldmVyIHNob3cgdGhlIGhhbmRvZmYgdGlwLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5kZWZhdWx0JywgXCJTaG93IHRoZSBoYW5kb2ZmIHRpcCB3aXRoIHRoZSBkZWZhdWx0IGRlc2NyaXB0aW9uLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5jdXN0b20nLCBcIlNob3cgdGhlIGhhbmRvZmYgdGlwIHdpdGggYW4gYWx0ZXJuYXRlIGRlc2NyaXB0aW9uLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnaGlkZGVuJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmVGlwLm1vZGUnLCBcIkNvbnRyb2xzIHRoZSB0aXAgc2hvd24gYWJvdmUgdGhlIGNoYXQgaW5wdXQgb2ZmZXJpbmcgdG8gY29udGludWUgZWxpZ2libGUgYWdlbnQgc2Vzc2lvbnMgaW4gdGhlIEFnZW50cyBXaW5kb3cuXCIpLFxuXHRcdH0sXG5cdFx0W0NvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRvci5jb2RleC5wcmVmZXJBZ2VudEhvc3QnLCBcIldoZW4gZW5hYmxlZCwgQ29kZXggc2Vzc2lvbnMgb3BlbmVkIGZyb20gdGhlIHJlZ3VsYXIgd29ya2JlbmNoIChzaWRlYmFyIGNoYXQpIHJ1biBpbnNpZGUgdGhlIGFnZW50IGhvc3QgcHJvY2VzcyB1c2luZyB0aGUgQ29kZXggQXBwIFNlcnZlciBpbnN0ZWFkIG9mIHRoZSBPcGVuQUkgZXh0ZW5zaW9uLiBPbmx5IG9uZSBDb2RleCBpbXBsZW1lbnRhdGlvbiBzdXJmYWNlcyBwZXIgd2luZG93LiBSZXF1aXJlcyBgI2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuZW5hYmxlZCNgLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNvbnRleHRVc2FnZS5lbmFibGVkJywgXCJTaG93IHRoZSBjb250ZXh0IHdpbmRvdyB1c2FnZSBpbmRpY2F0b3IgaW4gdGhlIGNoYXQgaW5wdXQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlZlcmJvc2VdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC52ZXJib3NlJywgXCJTaG93IHJlcXVlc3QgYW5kIGNvbXBsZXRpb24gdGltZXN0YW1wcy4gSG92ZXIgb3ZlciBhIGNvbXBsZXRpb24gdGltZXN0YW1wIHRvIHNob3cgdGhlIGVsYXBzZWQgcmVzcG9uc2UgdGltZS5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUHJvZ3Jlc3NCb3JkZXJdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnByb2dyZXNzQm9yZGVyLmVuYWJsZWQnLCBcIlNob3cgYW4gYW5pbWF0ZWQgZ3JhZGllbnQgYm9yZGVyIGFyb3VuZCB0aGUgY2hhdCBpbnB1dCB3aGlsZSB0aGUgYWdlbnQgaXMgd29ya2luZyBvciB0aGlua2luZy4gSGFzIG5vIGVmZmVjdCB3aGVuIHJlZHVjZWQgbW90aW9uIGlzIGVuYWJsZWQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvZmYnLCAnd2luZG93Tm90Rm9jdXNlZCcsICdhbHdheXMnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZC5vZmYnLCBcIk5ldmVyIHNob3cgT1Mgbm90aWZpY2F0aW9ucyBmb3IgcmVzcG9uc2VzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZC53aW5kb3dOb3RGb2N1c2VkJywgXCJTaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIHJlc3BvbnNlcyB3aGVuIHRoZSB3aW5kb3cgaXMgbm90IGZvY3VzZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25SZXNwb25zZVJlY2VpdmVkLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgT1Mgbm90aWZpY2F0aW9ucyBmb3IgcmVzcG9uc2VzLCBldmVuIHdoZW4gdGhlIHdpbmRvdyBpcyBmb2N1c2VkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnd2luZG93Tm90Rm9jdXNlZCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZCcsIFwiQ29udHJvbHMgd2hldGhlciBhIGNoYXQgc2Vzc2lvbiBzaG91bGQgcHJlc2VudCB0aGUgdXNlciB3aXRoIGFuIE9TIG5vdGlmaWNhdGlvbiB3aGVuIGEgcmVzcG9uc2UgaXMgcmVjZWl2ZWQuIFRoaXMgaW5jbHVkZXMgYSB3aW5kb3cgYmFkZ2UgYXMgd2VsbCBhcyBub3RpZmljYXRpb24gdG9hc3QuXCIpLFxuXHRcdH0sXG5cdFx0J2NoYXQuY2hlY2twb2ludHMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBcIkVuYWJsZXMgY2hlY2twb2ludHMgaW4gY2hhdC4gQ2hlY2twb2ludHMgYWxsb3cgeW91IHRvIHJlc3RvcmUgdGhlIGNoYXQgdG8gYSBwcmV2aW91cyBzdGF0ZS5cIiksXG5cdFx0fSxcblx0XHQnY2hhdC5jaGVja3BvaW50cy5zaG93RmlsZUNoYW5nZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGNoYXQgY2hlY2twb2ludCBmaWxlIGNoYW5nZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHNdOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Y2hhbmdlczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnR1cm5TdGF0dXNQaWxscy5jaGFuZ2VzJywgXCJTaG93IGEgcGlsbCBzdW1tYXJpemluZyB0aGUgZmlsZXMgY2hhbmdlZCBhbmQgdGhlIGxpbmVzIGFkZGVkIGFuZCByZW1vdmVkIGluIHRoZSB0dXJuLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmV2aWV3OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudHVyblN0YXR1c1BpbGxzLnByZXZpZXcnLCBcIlNob3cgYSBwaWxsIHRvIHByZXZpZXcgYSBNYXJrZG93biBvciBIVE1MIGZpbGUgY3JlYXRlZCBvciBlZGl0ZWQgaW4gdGhlIHR1cm4uXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGJyb3dzZXI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50dXJuU3RhdHVzUGlsbHMuYnJvd3NlcicsIFwiU2hvdyBhIHBpbGwgZm9yIGJyb3dzZXIgYWN0aXZpdHkgaW4gdGhlIHR1cm4uXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2hhdC50dXJuU3RhdHVzUGlsbHMub2JqZWN0RGVwcmVjYXRlZCcsIFwiVGhlIHBlci1waWxsIG9iamVjdCBmb3JtIGlzIGRlcHJlY2F0ZWQuIFVzZSBhIGJvb2xlYW4gdmFsdWUgaW5zdGVhZC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnR1cm5TdGF0dXNQaWxscycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBzdGF0dXMgcGlsbHMgYXJlIHNob3duIGFib3ZlIHRoZSBjaGF0IGlucHV0IHdoaWxlIGEgdHVybiBpcyBpbiBwcm9ncmVzcyBhbmQgaW5zaWRlIHRoZSBjb21wbGV0ZWQgcmVzcG9uc2UuIE9ubHkgYXBwbGllcyB0byBhZ2VudCBzZXNzaW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W21jcEFjY2Vzc0NvbmZpZ106IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzJywgXCJDb250cm9scyBhY2Nlc3MgdG8gaW5zdGFsbGVkIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycy5cIiksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcEFjY2Vzc1ZhbHVlLk5vbmUsXG5cdFx0XHRcdE1jcEFjY2Vzc1ZhbHVlLlJlZ2lzdHJ5LFxuXHRcdFx0XHRNY3BBY2Nlc3NWYWx1ZS5BbGxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLm5vbmUnLCBcIk5vIGFjY2VzcyB0byBNQ1Agc2VydmVycy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgXCJBbGxvd3MgYWNjZXNzIHRvIE1DUCBzZXJ2ZXJzIGxpc3RlZCBpbiB0aGUgcmVnaXN0cnkgdGhhdCBWUyBDb2RlIGlzIGNvbm5lY3RlZCB0by5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLmFueScsIFwiQWxsb3cgYWNjZXNzIHRvIGFueSBpbnN0YWxsZWQgTUNQIHNlcnZlci5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiBNY3BBY2Nlc3NWYWx1ZS5BbGwsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRNQ1AnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuOTknLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHtcblx0XHRcdFx0XHRpZiAocG9saWN5RGF0YS5tY3AgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTWNwQWNjZXNzVmFsdWUuTm9uZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBvbGljeURhdGEubWNwQWNjZXNzID09PSAncmVnaXN0cnlfb25seScpIHtcblx0XHRcdFx0XHRcdHJldHVybiBNY3BBY2Nlc3NWYWx1ZS5SZWdpc3RyeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmFjY2VzcycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hY2Nlc3MnLCBcIkNvbnRyb2xzIGFjY2VzcyB0byBpbnN0YWxsZWQgTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXJzLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdjaGF0Lm1jcC5hY2Nlc3Mubm9uZScsIHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFjY2Vzcy5ub25lJywgXCJObyBhY2Nlc3MgdG8gTUNQIHNlcnZlcnMuXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgXCJBbGxvd3MgYWNjZXNzIHRvIE1DUCBzZXJ2ZXJzIGxpc3RlZCBpbiB0aGUgcmVnaXN0cnkgdGhhdCBWUyBDb2RlIGlzIGNvbm5lY3RlZCB0by5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdjaGF0Lm1jcC5hY2Nlc3MuYW55JywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLmFueScsIFwiQWxsb3cgYWNjZXNzIHRvIGFueSBpbnN0YWxsZWQgTUNQIHNlcnZlci5cIilcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwQWxsb3dlZFNlcnZlcnNDb25maWddOiB7XG5cdFx0XHR0eXBlOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRzZXJ2ZXJOYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnNlcnZlck5hbWUnLCBcIk1hdGNoIGEgc2VydmVyIGJ5IGl0cyBjb25maWd1cmVkIG5hbWUuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyVXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnNlcnZlclVybCcsIFwiTWF0Y2ggYSByZW1vdGUgc2VydmVyIGJ5IGl0cyBVUkwuIFN1cHBvcnRzIGAqYCB3aWxkY2FyZHMsIGZvciBleGFtcGxlIGBodHRwczovLyouZXhhbXBsZS5jb20vKmAuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyQ29tbWFuZDogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMSwgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMuc2VydmVyQ29tbWFuZCcsIFwiTWF0Y2ggYSBsb2NhbCBzZXJ2ZXIgYnkgaXRzIGV4YWN0IGNvbW1hbmQgaW52b2NhdGlvbiwgZ2l2ZW4gYXMgdGhlIGNvbW1hbmQgZm9sbG93ZWQgYnkgaXRzIGFyZ3VtZW50cy5cIikgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHR7IHJlcXVpcmVkOiBbJ3NlcnZlck5hbWUnXSB9LFxuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyVXJsJ10gfSxcblx0XHRcdFx0XHR7IHJlcXVpcmVkOiBbJ3NlcnZlckNvbW1hbmQnXSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhbGxvd2xpc3QgdGhhdCBjb250cm9scyB3aGljaCBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlcnMgbWF5IGJlIGluc3RhbGxlZCBhbmQgcnVuLiBXaGVuIHNldCwgb25seSBzZXJ2ZXJzIG1hdGNoaW5nIGFuIGVudHJ5IGFyZSBwZXJtaXR0ZWQ7IGFueSBvdGhlciBzZXJ2ZXIgaXMgYmxvY2tlZC4gU2VydmVycyBjYW4gYmUgbWF0Y2hlZCBieSBuYW1lLCByZW1vdGUgVVJMIHBhdHRlcm4gKHdpdGggYCpgIHdpbGRjYXJkcyksIG9yIGxvY2FsIGNvbW1hbmQgaW52b2NhdGlvbi4gT21pdCBlbnRpcmVseSB0byBhbGxvdyBhbGwgc2VydmVycyAoc3ViamVjdCB0byB0aGUgZGVueSBsaXN0KS4gRGVsaXZlcmVkIHZpYSBlbnRlcnByaXNlIHBvbGljeSBmb3IgZ292ZXJuYW5jZTsgdGhpcyBzZXR0aW5nIGlzIG5vdCBzdXJmYWNlZCB0byBlbmQgdXNlcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHQvLyBHb3Zlcm5hbmNlLW9ubHk6IGRlbGl2ZXJlZCB2aWEgdGhlIGBDaGF0QWxsb3dlZE1jcFNlcnZlcnNgIGVudGVycHJpc2UgcG9saWN5IGFuZCBoaWRkZW5cblx0XHRcdC8vIGZyb20gdGhlIFNldHRpbmdzIFVJIHNvIGl0IGlzIG5vdCBjb25maWd1cmFibGUgYnkgZW5kIHVzZXJzLlxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0QWxsb3dlZE1jcFNlcnZlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMwJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9BTExPV0VEX01DUF9TRVJWRVJTX0tFWSksXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX0FMTE9XRURfTUNQX1NFUlZFUlNfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnBvbGljeScsIFwiQWxsb3dsaXN0IG9mIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycy4gV2hlbiBzZXQsIG9ubHkgc2VydmVycyBtYXRjaGluZyBhbiBlbnRyeSBtYXkgYmUgaW5zdGFsbGVkIG9yIHJ1bjsgb21pdCBlbnRpcmVseSB0byBhbGxvdyBhbGwgc2VydmVycyAoc3ViamVjdCB0byB0aGUgZGVueSBsaXN0KS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwRGVuaWVkU2VydmVyc0NvbmZpZ106IHtcblx0XHRcdHR5cGU6IFsnYXJyYXknLCAnbnVsbCddLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHNlcnZlck5hbWU6IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuZGVuaWVkU2VydmVycy5zZXJ2ZXJOYW1lJywgXCJNYXRjaCBhIHNlcnZlciBieSBpdHMgY29uZmlndXJlZCBuYW1lLlwiKSB9LFxuXHRcdFx0XHRcdHNlcnZlclVybDogeyB0eXBlOiAnc3RyaW5nJywgbWluTGVuZ3RoOiAxLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5kZW5pZWRTZXJ2ZXJzLnNlcnZlclVybCcsIFwiTWF0Y2ggYSByZW1vdGUgc2VydmVyIGJ5IGl0cyBVUkwuIFN1cHBvcnRzIGAqYCB3aWxkY2FyZHMsIGZvciBleGFtcGxlIGBodHRwczovLyouZXhhbXBsZS5jb20vKmAuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyQ29tbWFuZDogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMSwgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuZGVuaWVkU2VydmVycy5zZXJ2ZXJDb21tYW5kJywgXCJNYXRjaCBhIGxvY2FsIHNlcnZlciBieSBpdHMgZXhhY3QgY29tbWFuZCBpbnZvY2F0aW9uLCBnaXZlbiBhcyB0aGUgY29tbWFuZCBmb2xsb3dlZCBieSBpdHMgYXJndW1lbnRzLlwiKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyTmFtZSddIH0sXG5cdFx0XHRcdFx0eyByZXF1aXJlZDogWydzZXJ2ZXJVcmwnXSB9LFxuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyQ29tbWFuZCddIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5kZW5pZWRTZXJ2ZXJzJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgZGVueWxpc3Qgb2YgTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXJzLiBTZXJ2ZXJzIG1hdGNoaW5nIGFueSBlbnRyeSBhcmUgdW5jb25kaXRpb25hbGx5IGJsb2NrZWQgZnJvbSBiZWluZyBpbnN0YWxsZWQgb3IgcnVuLCBldmVuIGlmIHRoZXkgYWxzbyBtYXRjaCB0aGUgYWxsb3cgbGlzdCBcdTIwMTQgZGVueSBydWxlcyBhbHdheXMgdGFrZSBwcmVjZWRlbmNlLiBTZXJ2ZXJzIGNhbiBiZSBtYXRjaGVkIGJ5IG5hbWUsIHJlbW90ZSBVUkwgcGF0dGVybiAod2l0aCBgKmAgd2lsZGNhcmRzKSwgb3IgbG9jYWwgY29tbWFuZCBpbnZvY2F0aW9uLiBEZWxpdmVyZWQgdmlhIGVudGVycHJpc2UgcG9saWN5IGZvciBnb3Zlcm5hbmNlOyB0aGlzIHNldHRpbmcgaXMgbm90IHN1cmZhY2VkIHRvIGVuZCB1c2Vycy5cIiksXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdC8vIEdvdmVybmFuY2Utb25seTogZGVsaXZlcmVkIHZpYSB0aGUgYENoYXREZW5pZWRNY3BTZXJ2ZXJzYCBlbnRlcnByaXNlIHBvbGljeSBhbmQgaGlkZGVuXG5cdFx0XHQvLyBmcm9tIHRoZSBTZXR0aW5ncyBVSSBzbyBpdCBpcyBub3QgY29uZmlndXJhYmxlIGJ5IGVuZCB1c2Vycy5cblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdERlbmllZE1jcFNlcnZlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMwJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9ERU5JRURfTUNQX1NFUlZFUlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfREVOSUVEX01DUF9TRVJWRVJTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmRlbmllZFNlcnZlcnMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmRlbmllZFNlcnZlcnMucG9saWN5JywgXCJEZW55bGlzdCBvZiBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlcnMuIFNlcnZlcnMgbWF0Y2hpbmcgYW55IGVudHJ5IGFyZSBibG9ja2VkIGZyb20gYmVpbmcgaW5zdGFsbGVkIG9yIHJ1biwgZXZlbiBpZiB0aGV5IGFsc28gbWF0Y2ggdGhlIGFsbG93IGxpc3Q7IGRlbnkgcnVsZXMgYWx3YXlzIHRha2UgcHJlY2VkZW5jZS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dNYW5hZ2VkU2VydmVyc09ubHknLCBcIlVzZSBvbmx5IHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIGFsbG93bGlzdCB3aGVuIGRlY2lkaW5nIHdoaWNoIHNlcnZlcnMgbWF5IHJ1bi5cIiksXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBbGxvd01hbmFnZWRNY3BTZXJ2ZXJzT25seScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMzInLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX0FMTE9XX01BTkFHRURfTUNQX1NFUlZFUlNfT05MWV9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmFsbG93TWFuYWdlZFNlcnZlcnNPbmx5LnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hbGxvd01hbmFnZWRTZXJ2ZXJzT25seS5wb2xpY3knLCBcIlVzZSBvbmx5IHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIGFsbG93bGlzdCB3aGVuIGRlY2lkaW5nIHdoaWNoIHNlcnZlcnMgbWF5IHJ1bi5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwQXV0b1N0YXJ0Q29uZmlnXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hdXRvc3RhcnQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgTUNQIHNlcnZlcnMgc2hvdWxkIGJlIGF1dG9tYXRpY2FsbHkgc3RhcnRlZCB3aGVuIHRoZSBjaGF0IG1lc3NhZ2VzIGFyZSBzdWJtaXR0ZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogTWNwQXV0b1N0YXJ0VmFsdWUuTmV3QW5kT3V0ZGF0ZWQsXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcEF1dG9TdGFydFZhbHVlLk5ldmVyLFxuXHRcdFx0XHRNY3BBdXRvU3RhcnRWYWx1ZS5Pbmx5TmV3LFxuXHRcdFx0XHRNY3BBdXRvU3RhcnRWYWx1ZS5OZXdBbmRPdXRkYXRlZFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hdXRvc3RhcnQubmV2ZXInLCBcIk5ldmVyIGF1dG9tYXRpY2FsbHkgc3RhcnQgTUNQIHNlcnZlcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubWNwLmF1dG9zdGFydC5vbmx5TmV3JywgXCJPbmx5IGF1dG9tYXRpY2FsbHkgc3RhcnQgbmV3IE1DUCBzZXJ2ZXJzIHRoYXQgaGF2ZSBuZXZlciBiZWVuIHJ1bi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYXV0b3N0YXJ0Lm5ld0FuZE91dGRhdGVkJywgXCJBdXRvbWF0aWNhbGx5IHN0YXJ0IG5ldyBhbmQgb3V0ZGF0ZWQgTUNQIHNlcnZlcnMgdGhhdCBhcmUgbm90IHlldCBydW5uaW5nLlwiKVxuXHRcdFx0XSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbbWNwQXBwc0VuYWJsZWRDb25maWddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC51aS5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIE1DUCBzZXJ2ZXJzIGNhbiBwcm92aWRlIGN1c3RvbSBVSSBmb3IgdG9vbCBpbnZvY2F0aW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFttY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnLCAnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlzc3Vlcjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGZvcm1hdDogJ3VyaScsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5pc3N1ZXInLCBcIlRoZSBPQXV0aC9PSURDIGlzc3VlciBVUkwgb2YgdGhlIFNTTyBhdXRob3JpemF0aW9uIHNlcnZlci4gTXVzdCBiZSBhbiBgaHR0cHM6Ly9gIFVSTC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsaWVudElkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5jbGllbnRJZCcsIFwiVGhlIE9BdXRoIGNsaWVudCBJRCByZWdpc3RlcmVkIHdpdGggdGhlIFNTTyBpc3N1ZXIgZm9yIHRoaXMgZGV2aWNlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2xpZW50U2VjcmV0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5jbGllbnRTZWNyZXQnLCBcIlRoZSBPQXV0aCBjbGllbnQgc2VjcmV0IHBhaXJlZCB3aXRoIGBjbGllbnRJZGAuIEludGVuZGVkIGZvciBsb2NhbCBkZXZlbG9wbWVudCBvbmx5LlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwJywgXCIoUHJldmlldykgVGhlIE9BdXRoL09JREMgSWRQIGNvbmZpZ3VyYXRpb24gdXNlZCBmb3IgZW50ZXJwcmlzZS1tYW5hZ2VkIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgKE1DUCkgc2VydmVycy4gVHlwaWNhbGx5IGRlbGl2ZXJlZCB2aWEgZW50ZXJwcmlzZSBwb2xpY3kgKFdpbmRvd3MgR3JvdXAgUG9saWN5IC8gbWFjT1MgbWFuYWdlZCBwcmVmZXJlbmNlcyAvIExpbnV4IGAvZXRjL3ZzY29kZS9wb2xpY3kuanNvbmApOyBkZXZlbG9wZXJzIG1heSBoYW5kLWVkaXQgYHNldHRpbmdzLmpzb25gIGZvciBsb2NhbCB0ZXN0aW5nLiBQcm9wZXJ0aWVzOiBgaXNzdWVyYCAoSFRUUFMgVVJMKSwgYGNsaWVudElkYCwgYGNsaWVudFNlY3JldGAuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHAnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5wb2xpY3knLCBcIlRoZSBPQXV0aC9PSURDIElkUCBjb25maWd1cmF0aW9uIHVzZWQgZm9yIGVudGVycHJpc2UtbWFuYWdlZCBNb2RlbCBDb250ZXh0IFByb3RvY29sIChNQ1ApIHNlcnZlciBhdXRoZW50aWNhdGlvbi5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W21jcFNlcnZlckNvbGxpc2lvbkJlaGF2aW9yU2VjdGlvbl06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuY29sbGlzaW9uQmVoYXZpb3InLCBcIkNvbnRyb2xzIGJlaGF2aW9yIHdoZW4gbXVsdGlwbGUgTUNQIHNlcnZlcnMgYXJlIGRpc2NvdmVyZWQgd2l0aCB0aGUgc2FtZSBuYW1lLiAnZGlzYWJsZScgZGlzYWJsZXMgbG93ZXItcHJpb3JpdHkgZHVwbGljYXRlcy4gJ3N1ZmZpeCcgYXBwZW5kcyBudW1lcmljIHN1ZmZpeGVzIHRvIGRpc2FtYmlndWF0ZS5cIiksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcENvbGxpc2lvbkJlaGF2aW9yLkRpc2FibGUsXG5cdFx0XHRcdE1jcENvbGxpc2lvbkJlaGF2aW9yLlN1ZmZpeCxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuY29sbGlzaW9uQmVoYXZpb3IuZGlzYWJsZScsIFwiRGlzYWJsZSBsb3dlci1wcmlvcml0eSBzZXJ2ZXJzIHdpdGggZHVwbGljYXRlIG5hbWVzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5jb2xsaXNpb25CZWhhdmlvci5zdWZmaXgnLCBcIkFwcGVuZCBudW1lcmljIHN1ZmZpeGVzIHRvIHNlcnZlcnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IE1jcENvbGxpc2lvbkJlaGF2aW9yLkRpc2FibGUsXG5cdFx0fSxcblx0XHRbbWNwU2VydmVyU2FtcGxpbmdTZWN0aW9uXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5zZXJ2ZXJTYW1wbGluZycsIFwiQ29uZmlndXJlcyB3aGljaCBtb2RlbHMgYXJlIGV4cG9zZWQgdG8gTUNQIHNlcnZlcnMgZm9yIHNhbXBsaW5nIChtYWtpbmcgbW9kZWwgcmVxdWVzdHMgaW4gdGhlIGJhY2tncm91bmQpLiBUaGlzIHNldHRpbmcgY2FuIGJlIGVkaXRlZCBpbiBhIGdyYXBoaWNhbCB3YXkgdW5kZXIgdGhlIGB7MH1gIGNvbW1hbmQuXCIsICdNQ1A6ICcgKyBubHMubG9jYWxpemUoJ21jcC5saXN0JywgJ0xpc3QgU2VydmVycycpKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFsbG93ZWREdXJpbmdDaGF0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5zZXJ2ZXJTYW1wbGluZy5hbGxvd2VkRHVyaW5nQ2hhdCcsIFwiV2hldGhlciB0aGlzIHNlcnZlciBpcyBhbGxvd2VkIHRvIG1ha2Ugc2FtcGxpbmcgcmVxdWVzdHMgZHVyaW5nIGl0cyB0b29sIGNhbGxzIGluIGEgY2hhdCBzZXNzaW9uLlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxvd2VkT3V0c2lkZUNoYXQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLnNlcnZlclNhbXBsaW5nLmFsbG93ZWRPdXRzaWRlQ2hhdCcsIFwiV2hldGhlciB0aGlzIHNlcnZlciBpcyBhbGxvd2VkIHRvIG1ha2Ugc2FtcGxpbmcgcmVxdWVzdHMgb3V0c2lkZSBvZiBhIGNoYXQgc2Vzc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsbG93ZWRNb2RlbHM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3Auc2VydmVyU2FtcGxpbmcubW9kZWwnLCBcIkEgbW9kZWwgdGhlIE1DUCBzZXJ2ZXIgaGFzIGFjY2VzcyB0by5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBc3Npc3RlZFR5cGVzW0FkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZV0uZW5hYmxlZENvbmZpZ0tleV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFzc2lzdGVkLm51Z2V0LmVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIkVuYWJsZXMgTnVHZXQgcGFja2FnZXMgZm9yIEFJLWFzc2lzdGVkIE1DUCBzZXJ2ZXIgaW5zdGFsbGF0aW9uLiBVc2VkIHRvIGluc3RhbGwgTUNQIHNlcnZlcnMgYnkgbmFtZSBmcm9tIHRoZSBjZW50cmFsIHJlZ2lzdHJ5IGZvciAuTkVUIHBhY2thZ2VzIChOdUdldC5vcmcpLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHRlbnNpb25Ub29sc0VuYWJsZWQnLCBcIkVuYWJsZSB1c2luZyB0b29scyBjb250cmlidXRlZCBieSB0aGlyZC1wYXJ0eSBleHRlbnNpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudEV4dGVuc2lvblRvb2xzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuZXh0ZW5zaW9uVG9vbHNFbmFibGVkJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuZXh0ZW5zaW9uVG9vbHNFbmFibGVkJywgXCJFbmFibGUgdXNpbmcgdG9vbHMgY29udHJpYnV0ZWQgYnkgdGhpcmQtcGFydHkgZXh0ZW5zaW9ucy5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBsdWdpbnMuZW5hYmxlZCcsIFwiRW5hYmxlIGFnZW50IHBsdWdpbiBpbnRlZ3JhdGlvbiBpbiBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRQbHVnaW5zRW5hYmxlZCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTYnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5wbHVnaW5zLmVuYWJsZWQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWQnLCBcIkVuYWJsZSBhZ2VudCBwbHVnaW4gaW50ZWdyYXRpb24gaW4gY2hhdC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5Mb2NhdGlvbnNdOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5Mb2NhdGlvbnMnLCBcIlBsdWdpbiBkaXJlY3RvcmllcyB0byBkaXNjb3Zlci4gRWFjaCBrZXkgaXMgYSBwYXRoIHRoYXQgcG9pbnRzIGRpcmVjdGx5IHRvIGEgcGx1Z2luIGZvbGRlciwgYW5kIHRoZSB2YWx1ZSBlbmFibGVzIChgdHJ1ZWApIG9yIGRpc2FibGVzIChgZmFsc2VgKSBpdC4gUGF0aHMgY2FuIGJlIGFic29sdXRlLCByZWxhdGl2ZSB0byB0aGUgd29ya3NwYWNlIHJvb3QsIG9yIHN0YXJ0IHdpdGggYH4vYCBmb3IgdGhlIHVzZXIncyBob21lIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWRQbHVnaW5zJywgXCJDb250cm9scyB3aGljaCBbYWdlbnQgcGx1Z2luc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWFnZW50LXBsdWdpbnMpIGFyZSBlbmFibGVkIG9yIGRpc2FibGVkLiBLZXlzIGFyZSBwbHVnaW4gSURzIGluIGA8cGx1Z2luPkA8bWFya2V0cGxhY2U+YCBmb3JtICh3aGVyZSBtYXJrZXRwbGFjZSBpcyBkZWZpbmVkIGluIHsxfSk7IHZhbHVlcyBlbmFibGUgKGB0cnVlYCkgb3IgZGlzYWJsZSAoYGZhbHNlYCkgdGhlIHBsdWdpbi4gRGlzY292ZXJlZCBhbG9uZ3NpZGUgdGhlIHBhdGgta2V5ZWQgZW50cmllcyBpbiB7MH0uIFdoZW4gc2V0IGJ5IHBvbGljeSwgZW50cmllcyBhcmUgYWRkaXRpdmU6IHBsdWdpbnMgbWFwcGVkIHRvIGB0cnVlYCBhcmUgZW5hYmxlZCBpbiBhZGRpdGlvbiB0byB0aGUgdXNlcidzIG93biBwbHVnaW5zLCBhbmQgb25seSBwbHVnaW5zIG1hcHBlZCB0byBgZmFsc2VgIGFyZSBibG9ja2VkIGZyb20gbG9hZGluZy5cIiwgYFxcYCMke0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9uc30jXFxgYCwgYFxcYCMke0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc30jXFxgYCksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0RW5hYmxlZFBsdWdpbnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5lbmFibGVkUGx1Z2lucy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWRQbHVnaW5zLnBvbGljeScsIFwiUGx1Z2luIGVuYWJsZW1lbnQuIEtleXMgYXJlIHBsdWdpbiBJRHMgaW4gYHtwbHVnaW59QHttYXJrZXRwbGFjZX1gIGZvcm07IHZhbHVlcyBlbmFibGUgb3IgZGlzYWJsZSB0aGUgcGx1Z2luLlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXMnLCBcIlBsdWdpbiBtYXJrZXRwbGFjZXMgdG8gcXVlcnkuIEVudHJpZXMgbWF5IGJlIEdpdEh1YiBzaG9ydGhhbmQgKGBvd25lci9yZXBvYCBvciBgb3duZXIvcmVwbyNyZWZgKSwgZGlyZWN0IEdpdCByZXBvc2l0b3J5IFVSSXMgKGBodHRwczovLy4uLmdpdGAsIGBzc2g6Ly8uLi5naXRgLCBvciBgZ2l0QGhvc3Q6cGF0aC5naXRgLCBlYWNoIG9wdGlvbmFsbHkgc3VmZml4ZWQgd2l0aCBgI3JlZmApLCBvciBsb2NhbCByZXBvc2l0b3J5IFVSSXMgKGBmaWxlOi8vLy4uLmApLiBFcXVpdmFsZW50IEdpdEh1YiBzaG9ydGhhbmQgYW5kIFVSSSBlbnRyaWVzIGFyZSBkZWR1cGxpY2F0ZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogWydnaXRodWIvY29waWxvdC1wbHVnaW5zJywgJ2dpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2UnXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkV4dHJhTWFya2V0cGxhY2VzXToge1xuXHRcdFx0Ly8gUG9saWN5LW9ubHkgZGVsaXZlcnkgc2xvdCBmb3IgZW50ZXJwcmlzZS1tYW5hZ2VkIG1hcmtldHBsYWNlIGVudHJpZXMgKHZpYSB0aGVcblx0XHRcdC8vIGBDaGF0RXh0cmFNYXJrZXRwbGFjZXNgIHBvbGljeSkuIENvbnN1bWVycyB1bmlvbiB0aGlzIHdpdGggYGNoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXNgLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFN0b3JlZCBhcyBhIG5hbWVkIHN0cmluZyBtYXAuIEV4cGxpY2l0IHVwZGF0ZSBvdmVycmlkZXMgYXJlIEpTT04tZW5jb2RlZFxuXHRcdFx0Ly8gaW5zaWRlIHRoZSB2YWx1ZSBzdHJpbmcgc28gdGhlIFNldHRpbmdzIEVkaXRvciBjYW4gdXNlIGl0cyBpbmxpbmUgb2JqZWN0IHJlbmRlcmVyLlxuXHRcdFx0Ly8gVGhpcyBlbnN1cmVzOlxuXHRcdFx0Ly8gICAtIFRoZSBTZXR0aW5ncyBFZGl0b3IgKENvbXBsZXhPYmplY3QgcmVuZGVyZXIpIGNhbiBkaXNwbGF5IGVudHJpZXMgaW5saW5lIHdoZW5cblx0XHRcdC8vICAgICBtYW5hZ2VkIGJ5IHBvbGljeSwgcmF0aGVyIHRoYW4gb25seSBzaG93aW5nIFwiRWRpdCBpbiBzZXR0aW5ncy5qc29uXCIuXG5cdFx0XHQvLyAgIC0gTWFya2V0cGxhY2UgbmFtZXMgYXJlIHByZXNlcnZlZCBmb3IgYGVuYWJsZWRQbHVnaW5zW1wicGx1Z2luQDxuYW1lPlwiXWAgcmVzb2x1dGlvbi5cblx0XHRcdC8vXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6IFsnc3RyaW5nJ10gYXMgWydzdHJpbmcnXSB9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBsdWdpbnMuZXh0cmFNYXJrZXRwbGFjZXMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhZGRpdGlvbmFsIHBsdWdpbiBtYXJrZXRwbGFjZXMuIFVuaW9uZWQgd2l0aCB7MH0uIEFuIGVudHJ5J3MgYGF1dG9VcGRhdGVgIHZhbHVlIG92ZXJyaWRlcyB7MX0gZm9yIHBsdWdpbnMgZnJvbSB0aGF0IG1hcmtldHBsYWNlLlwiLCBgXFxgIyR7Q2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzfSNcXGBgLCAnYCNleHRlbnNpb25zLmF1dG9VcGRhdGUjYCcpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0RXh0cmFNYXJrZXRwbGFjZXMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5leHRyYU1hcmtldHBsYWNlcy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzLnBvbGljeScsIFwiQWRkaXRpb25hbCBwbHVnaW4gbWFya2V0cGxhY2VzIHRvIHF1ZXJ5LiBLZXlzIGFyZSBtYXJrZXRwbGFjZSBuYW1lczsgdmFsdWVzIGFyZSBHaXRIdWIgc2hvcnRoYW5kIChgb3duZXIvcmVwb1sjcmVmXWApIG9yIEdpdCBVUklzIChge3VybH1bI3JlZl1gKSwgb3B0aW9uYWxseSB3aXRoIGFuIGVudGVycHJpc2UtbWFuYWdlZCBhdXRvLXVwZGF0ZSBvdmVycmlkZS5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TdHJpY3RNYXJrZXRwbGFjZXNdOiB7XG5cdFx0XHR0eXBlOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZ2l0aHViJywgJ2dpdCcsICd1cmwnLCAnbnBtJywgJ2ZpbGUnLCAnZGlyZWN0b3J5JywgJ2hvc3RQYXR0ZXJuJywgJ3BhdGhQYXR0ZXJuJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXBvOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0dXJsOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0cmVmOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0cGF0aDogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdHBhY2thZ2U6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRob3N0UGF0dGVybjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdHBhdGhQYXR0ZXJuOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0aGVhZGVyczogeyB0eXBlOiAnb2JqZWN0JywgYWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ3N0cmluZycgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydzb3VyY2UnXSxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhbGxvd2xpc3Qgb2YgcGx1Z2luIG1hcmtldHBsYWNlIHNvdXJjZXMuIFdoZW4gc2V0LCBvbmx5IG1hcmtldHBsYWNlcyBtYXRjaGluZyBvbmUgb2YgdGhlc2UgZW50cmllcyBjYW4gYmUgaW5zdGFsbGVkOyBhbiBlbXB0eSBhcnJheSBibG9ja3MgYWxsIG1hcmtldHBsYWNlcy4gVGhpcyBkb2VzIG5vdCByZXRyb2FjdGl2ZWx5IGRpc2FibGUgYWxyZWFkeS1pbnN0YWxsZWQgcGx1Z2lucy4gRWFjaCBlbnRyeSBpcyBhbiBvYmplY3Qgd2l0aCBhIGBzb3VyY2VgIGRpc2NyaW1pbmF0b3IgKGBnaXRodWJgLCBgZ2l0YCwgYHVybGAsIGBucG1gLCBgZmlsZWAsIGBkaXJlY3RvcnlgLCBgaG9zdFBhdHRlcm5gLCBvciBgcGF0aFBhdHRlcm5gKSBhbmQgdGhlIGNvcnJlc3BvbmRpbmcgZmllbGRzLiBUeXBpY2FsbHkgZGVsaXZlcmVkIHZpYSBlbnRlcnByaXNlIHBvbGljeS5cIiksXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0U3RyaWN0TWFya2V0cGxhY2VzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyMicsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfU1RSSUNUX01BUktFVFBMQUNFU19LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9TVFJJQ1RfTUFSS0VUUExBQ0VTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMucG9saWN5JywgXCJBbGxvd2xpc3Qgb2YgcGx1Z2luIG1hcmtldHBsYWNlIHNvdXJjZXMuIFdoZW4gc2V0LCBvbmx5IG1hcmtldHBsYWNlcyBtYXRjaGluZyBhbiBlbnRyeSBhcmUgdHJ1c3RlZDsgYW4gZW1wdHkgYXJyYXkgYmxvY2tzIGFsbCBtYXJrZXRwbGFjZXMuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmN1c3RvbWl6YXRpb25zLnN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uJywgXCJCbG9ja3Mgc3RhbmRhbG9uZSB1c2VyIGFuZCB3b3Jrc3BhY2Ugc2tpbGxzLCBhZ2VudHMsIGhvb2tzLCBpbnN0cnVjdGlvbnMsIGFuZCBNQ1Agc2VydmVycyB3aGlsZSBrZWVwaW5nIGVsaWdpYmxlIHBsdWdpbiBjdXN0b21pemF0aW9ucyBhdmFpbGFibGUuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0U3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24nLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVldOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5jdXN0b21pemF0aW9ucy5zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5jdXN0b21pemF0aW9ucy5zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5wb2xpY3knLCBcIkJsb2NrcyBzdGFuZGFsb25lIHVzZXIgYW5kIHdvcmtzcGFjZSBza2lsbHMsIGFnZW50cywgaG9va3MsIGluc3RydWN0aW9ucywgYW5kIE1DUCBzZXJ2ZXJzIHdoaWxlIGtlZXBpbmcgZWxpZ2libGUgcGx1Z2luIGN1c3RvbWl6YXRpb25zIGF2YWlsYWJsZS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5ob29rcy5hbGxvd01hbmFnZWRPbmx5JywgXCJBbGxvd3MgaG9va3Mgb25seSBmcm9tIGVudGVycHJpc2UtbWFuYWdlZCBzb3VyY2VzIGFuZCBwbHVnaW5zIGZvcmNlLWVuYWJsZWQgYnkgcG9saWN5LlwiKSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEFsbG93TWFuYWdlZEhvb2tzT25seScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMzInLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuaG9va3MuYWxsb3dNYW5hZ2VkT25seS5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5ob29rcy5hbGxvd01hbmFnZWRPbmx5LnBvbGljeScsIFwiQWxsb3dzIGhvb2tzIG9ubHkgZnJvbSBlbnRlcnByaXNlLW1hbmFnZWQgc291cmNlcyBhbmQgcGx1Z2lucyBmb3JjZS1lbmFibGVkIGJ5IHBvbGljeS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5lbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGVuIGVuYWJsZWQsIGFnZW50IG1vZGUgY2FuIGJlIGFjdGl2YXRlZCBmcm9tIGNoYXQgYW5kIHRvb2xzIGluIGFnZW50aWMgY29udGV4dHMgd2l0aCBzaWRlIGVmZmVjdHMgY2FuIGJlIHVzZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0QWdlbnRNb2RlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0dmFsdWU6IChwb2xpY3lEYXRhKSA9PiBwb2xpY3lEYXRhLmNoYXRfYWdlbnRfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQuZW5hYmxlZC5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LmVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZW4gZW5hYmxlZCwgYWdlbnQgbW9kZSBjYW4gYmUgYWN0aXZhdGVkIGZyb20gY2hhdCBhbmQgdG9vbHMgaW4gYWdlbnRpYyBjb250ZXh0cyB3aXRoIHNpZGUgZWZmZWN0cyBjYW4gYmUgdXNlZC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLk5ldHdvcmtGaWx0ZXJdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQubmV0d29ya0ZpbHRlcicsIFwiV2hlbiBlbmFibGVkLCBuZXR3b3JrIGFjY2VzcyBieSBhZ2VudCB0b29scyAoZmV0Y2ggdG9vbCwgaW50ZWdyYXRlZCBicm93c2VyKSBpcyByZXN0cmljdGVkIGFjY29yZGluZyB0byB7MH0gYW5kIHsxfS4gRG9tYWluIGZpbHRlcmluZyBpcyBhbHNvIGFwcGxpZWQgdG8gdGhvc2UgdG9vbHMgd2hlbiB7Mn0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnN9I1xcYGAsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnN9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudE5ldHdvcmtGaWx0ZXInLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQubmV0d29ya0ZpbHRlcicsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50Lm5ldHdvcmtGaWx0ZXInLCBcIldoZW4gZW5hYmxlZCwgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikgaXMgcmVzdHJpY3RlZCBhY2NvcmRpbmcgdG8gezB9IGFuZCB7MX0uIERvbWFpbiBmaWx0ZXJpbmcgaXMgYWxzbyBhcHBsaWVkIHRvIHRob3NlIHRvb2xzIHdoZW4gezJ9IGlzIGVuYWJsZWQuXCIsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zfSNcXGBgLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkRlbmllZE5ldHdvcmtEb21haW5zfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQuYWxsb3dlZE5ldHdvcmtEb21haW5zJywgXCJBbGxvd2VkIGRvbWFpbnMgZm9yIG5ldHdvcmsgYWNjZXNzIGJ5IGFnZW50IHRvb2xzIChmZXRjaCB0b29sLCBpbnRlZ3JhdGVkIGJyb3dzZXIpLiBBcHBsaWVzIHdoZW4gezB9IG9yIHsxfSBpcyBlbmFibGVkLiBXaGVuIHsyfSBpcyBlbmFibGVkLCBhbGwgZG9tYWlucyBhcmUgYWxsb3dlZC4gU3VwcG9ydHMgd2lsZGNhcmRzIGxpa2UgezN9LiBXaGVuIGJvdGggYWxsb3dlZCBhbmQgZGVuaWVkIGxpc3RzIGFyZSBlbXB0eSwgYWxsIGRvbWFpbnMgYXJlIGJsb2NrZWQuIERlbmllZCBkb21haW5zIChzZWUgezR9KSB0YWtlIHByZWNlZGVuY2UuXCIsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuTmV0d29ya0ZpbHRlcn0jXFxgYCwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya30jXFxgYCwgJ2AqLmV4YW1wbGUuY29tYCcsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnN9I1xcYGApLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudEFsbG93ZWROZXR3b3JrRG9tYWlucycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTYnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMnLCBcIkFsbG93ZWQgZG9tYWlucyBmb3IgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikuIEFwcGxpZXMgd2hlbiB7MH0gb3IgezF9IGlzIGVuYWJsZWQuIFdoZW4gezJ9IGlzIGVuYWJsZWQsIGFsbCBkb21haW5zIGFyZSBhbGxvd2VkLiBTdXBwb3J0cyB3aWxkY2FyZHMgbGlrZSB7M30uIFdoZW4gYm90aCBhbGxvd2VkIGFuZCBkZW5pZWQgbGlzdHMgYXJlIGVtcHR5LCBhbGwgZG9tYWlucyBhcmUgYmxvY2tlZC4gRGVuaWVkIGRvbWFpbnMgKHNlZSB7NH0pIHRha2UgcHJlY2VkZW5jZS5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5OZXR3b3JrRmlsdGVyfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgLCAnYCouZXhhbXBsZS5jb21gJywgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5EZW5pZWROZXR3b3JrRG9tYWluc30jXFxgYCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkRlbmllZE5ldHdvcmtEb21haW5zXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zJywgXCJEZW5pZWQgZG9tYWlucyBmb3IgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikuIEFwcGxpZXMgd2hlbiB7MH0gb3IgezF9IGlzIGVuYWJsZWQuIFRoaXMgZG9lcyBub3QgYXBwbHkgd2hlbiB7Mn0gaXMgZW5hYmxlZC4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHszfS4gU3VwcG9ydHMgd2lsZGNhcmRzIGxpa2UgezR9LlwiLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLk5ldHdvcmtGaWx0ZXJ9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmt9I1xcYGAsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zfSNcXGBgLCAnYCouZXhhbXBsZS5jb21gJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEFnZW50RGVuaWVkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQuZGVuaWVkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucycsIFwiRGVuaWVkIGRvbWFpbnMgZm9yIG5ldHdvcmsgYWNjZXNzIGJ5IGFnZW50IHRvb2xzIChmZXRjaCB0b29sLCBpbnRlZ3JhdGVkIGJyb3dzZXIpLiBBcHBsaWVzIHdoZW4gezB9IG9yIHsxfSBpcyBlbmFibGVkLiBUaGlzIGRvZXMgbm90IGFwcGx5IHdoZW4gezJ9IGlzIGVuYWJsZWQuIFRha2VzIHByZWNlZGVuY2Ugb3ZlciB7M30uIFN1cHBvcnRzIHdpbGRjYXJkcyBsaWtlIHs0fS5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5OZXR3b3JrRmlsdGVyfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkFsbG93ZWROZXR3b3JrRG9tYWluc30jXFxgYCwgJ2AqLmV4YW1wbGUuY29tYCcpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5uZXdTZXNzaW9uLmRlZmF1bHRNb2RlJywgXCJUaGUgZGVmYXVsdCBtb2RlIGZvciBuZXcgY2hhdCBzZXNzaW9ucy4gV2hlbiBlbXB0eSwgdGhlIGNoYXQgdmlldydzIGRlZmF1bHQgbW9kZSBpcyB1c2VkLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFocEpzb25sTG9nZ2luZ1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmFocEpzb25sTG9nZ2luZycsIFwiV2hlbiBlbmFibGVkLCBsb2dzIGFsbCBBSFAgdHJhbnNwb3J0IG1lc3NhZ2VzIGZvciBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIHRvIEpTT05MIGZpbGVzIHVuZGVyIHRoZSB3aW5kb3cncyBsb2cgZGlyZWN0b3J5LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5hZ2VudERlYnVnTG9nLmVuYWJsZWQnLCBcIkVuYWJsZSBhZ2VudCBkZWJ1ZyBsb2dnaW5nIGZvciBhZ2VudCBob3N0IHNlc3Npb25zOiBzdXJmYWNlIHRoZWlyIGRlYnVnIGV2ZW50cyBpbiB0aGUgYWdlbnQgZGVidWcgcGFuZWwuIFRha2VzIGVmZmVjdCBpbW1lZGlhdGVseTsgb25seSBzZXNzaW9ucyB0aGF0IHJ1biB3aGlsZSB0aGlzIGlzIGVuYWJsZWQgYXJlIGNhcHR1cmVkLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFnZW50RGVidWdMb2dNYXhFdmVudHNTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1pbmltdW06IDEwLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5hZ2VudERlYnVnTG9nLm1heEV2ZW50c0luTWVtb3J5JywgXCJNYXhpbXVtIG51bWJlciBvZiBkZWJ1ZyBldmVudHMga2VwdCBpbiBtZW1vcnkgcGVyIGFnZW50IGhvc3Qgc2Vzc2lvbiBmb3IgdGhlIGFnZW50IGRlYnVnIHBhbmVsLiBPbGRlciBldmVudHMgYmV5b25kIHRoaXMgbGltaXQgYXJlIGRyb3BwZWQgZnJvbSB0aGUgaW4tbWVtb3J5IGJ1ZmZlciwgd2hpY2ggYWxzbyBsb3dlcnMgdGhlIHRvdGFscyAoc3VjaCBhcyB0b2tlbiB1c2FnZSkgc2hvd24gaW4gdGhlIHBhbmVsIG92ZXJ2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IDEwMDAwLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jdXN0b21UZXJtaW5hbFRvb2wuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb3BpbG90IFNESyBzZXNzaW9ucyB1c2UgdGhlIEFnZW50IEhvc3QgdGVybWluYWwgdG9vbCBvdmVycmlkZSBpbnN0ZWFkIG9mIHRoZSBTREsncyBkZWZhdWx0IHRlcm1pbmFsIGJlaGF2aW9yLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsuLi5jb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nVmFsdWVzXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90U2RrLmxvZ0xldmVsLmluZm8nLCBcIkxvZyBpbmZvcm1hdGlvbmFsIG1lc3NhZ2VzLiBSdW5uaW5nIFZTIENvZGUgd2l0aCB0cmFjZSBsb2dnaW5nIHN0aWxsIGVuYWJsZXMgYWxsIENvcGlsb3QgU0RLIHJ1bnRpbWUgZGlhZ25vc3RpY3MuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvcGlsb3RTZGsubG9nTGV2ZWwudHJhY2UnLCBcIkxvZyBhbGwgQ29waWxvdCBTREsgcnVudGltZSBkaWFnbm9zdGljcy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90U2RrLmxvZ0xldmVsJywgXCJDb250cm9scyB0aGUgbG9nIGxldmVsIGZvciB0aGUgQ29waWxvdCBTREsgcnVudGltZSB1c2VkIGJ5IHRoZSBsb2NhbCBhZ2VudCBob3N0LiBDaGFuZ2luZyB0aGlzIHNldHRpbmcgcmVzdGFydHMgdGhlIENvcGlsb3QgU0RLIGNsaWVudDsgYWN0aXZlIHNlc3Npb25zIGFyZSByZWxvYWRlZCB3aGVuIG5leHQgdXNlZC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnaW5mbycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RNYXBMZWdhY3lTZXR0aW5nc1RvTWFuYWdlZFNldHRpbmdzU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90Lm1hcExlZ2FjeVNldHRpbmdzVG9NYW5hZ2VkU2V0dGluZ3MnLCBcIldoZW4gZW5hYmxlZCwgbWFwcyBzdXBwb3J0ZWQgbGVnYWN5IFZTIENvZGUgc2V0dGluZ3MgdG8gZXF1aXZhbGVudCBDb3BpbG90IFNESyBtYW5hZ2VkIHNldHRpbmdzIGZvciBsb2NhbCBBZ2VudCBIb3N0IHNlc3Npb25zLiBUaGlzIGNvbXBhdGliaWxpdHkgYnJpZGdlIGlzIHRlbXBvcmFyeSBhbmQgaXMgbm90IHVzZWQgZm9yIG5ldyBzZXR0aW5ncy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T3B1czQ4UHJvbXB0RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm9wdXM0OFByb21wdC5lbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIENvcGlsb3QgU0RLIHNlc3Npb25zIHJ1bm5pbmcgYSBDbGF1ZGUgT3B1cyA0LjggbW9kZWwgYXBwbHkgT3B1cyA0LjgtdHVuZWQgc3lzdGVtLXByb21wdCBzZWN0aW9uIG92ZXJyaWRlcyBvbiB0b3Agb2YgdGhlIGRlZmF1bHQgc3lzdGVtIG1lc3NhZ2UuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdFRvb2xTZWFyY2hFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29waWxvdC50b29sU2VhcmNoLmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgQ29waWxvdCBTREsgc2Vzc2lvbnMgZGVmZXIgTUNQIGFuZCBub24tY29yZSBWUyBDb2RlIHRvb2xzIGJlaGluZCBhIHRvb2wtc2VhcmNoIHRvb2wgc28gdGhlIG1vZGVsIGRpc2NvdmVycyB0aGVtIG9uIGRlbWFuZCBpbnN0ZWFkIG9mIGxvYWRpbmcgZXZlcnkgdG9vbCBkZWZpbml0aW9uIHVwIGZyb250LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdFRvb2xTZWFyY2hEZWZlclRocmVzaG9sZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29waWxvdC50b29sU2VhcmNoLmRlZmVyVGhyZXNob2xkJywgXCJNaW5pbXVtIG51bWJlciBvZiB0b29scyBiZWZvcmUgTUNQIGFuZCBleHRlcm5hbCB0b29scyBhcmUgZGVmZXJyZWQgYmVoaW5kIHRvb2wgc2VhcmNoLiBTZXQgdG8gMCB0byBhbHdheXMgZGVmZXIgZXh0ZXJuYWwgdG9vbHMuIE9ubHkgZWZmZWN0aXZlIHdoZW4gdG9vbCBzZWFyY2ggaXMgZW5hYmxlZC5cIiksXG5cdFx0XHRkZWZhdWx0OiAxLFxuXHRcdFx0bWluaW11bTogMCxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0UmVhc29uaW5nRWZmb3J0T3ZlcnJpZGVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QucmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUnLCBcIk92ZXJyaWRlcyB0aGUgcmVhc29uaW5nIGVmZm9ydCBmb3IgQ29waWxvdCBTREsgYWdlbnQgc2Vzc2lvbnMgcmVnYXJkbGVzcyBvZiB0aGUgcGVyLW1vZGVsIHBpY2tlciB2YWx1ZS4gU2V0IGl0IHRvIGEgbGV2ZWwgdGhlIHNlbGVjdGVkIG1vZGVsIHN1cHBvcnRzIChmb3IgZXhhbXBsZSBgbG93YCwgYG1lZGl1bWAsIGBoaWdoYCwgb3IgYHhoaWdoYCkgXHUyMDE0IGNob29zaW5nIGEgbGV2ZWwgdGhlIG1vZGVsIGRvZXMgbm90IHN1cHBvcnQgbWF5IGJlIHJlamVjdGVkIGJ5IHRoZSBtb2RlbC4gQSB2YWx1ZSB0aGF0IGlzbid0IGEgcmVjb2duaXplZCBlZmZvcnQgbGV2ZWwgaXMgaWdub3JlZCBhbmQgdGhlIHNlc3Npb24gZmFsbHMgYmFjayB0byB0aGUgcGlja2VyIHZhbHVlLiBBcHBsaWVkIHdoZW4gYSBzZXNzaW9uIGlzIGNyZWF0ZWQgYW5kIHdoZW4gaXRzIG1vZGVsIGNoYW5nZXMuIE9ubHkgYWZmZWN0cyBDb3BpbG90IENMSSBhZ2VudCBzZXNzaW9ucy5cXG5cXG4qKk5vdGUqKjogVGhpcyBpcyBhbiBhZHZhbmNlZCBzZXR0aW5nIGZvciBleHBlcmltZW50YXRpb24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdFJlYXNvbmluZ1N1bW1hcnlFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5yZWFzb25pbmdTdW1tYXJ5JywgXCJXaGVuIGVuYWJsZWQsIHJlcXVlc3RzIGNvbmNpc2UgcmVhc29uaW5nIHN1bW1hcmllcyBmb3Igc3VwcG9ydGVkIENvcGlsb3QgU0RLIGFnZW50IHNlc3Npb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q29waWxvdE1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlc1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90Lm1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcycsIFwiUGVyLW1vZGVsIGNhcGFiaWxpdHkgb3ZlcnJpZGVzIGZvciBDb3BpbG90IFNESyBhZ2VudCBzZXNzaW9ucywga2V5ZWQgYnkgbW9kZWwgaWQgKGAqYCBtYXRjaGVzIGV2ZXJ5IG1vZGVsOyBhIHNwZWNpZmljIGVudHJ5IHdpbnMgZmllbGQtYnktZmllbGQpLCBpbnRlbmRlZCBmb3IgZXZhbHVhdGluZyBtb2RlbHMgYWdhaW5zdCBhbiBleGlzdGluZyBtb2RlbCdzIHByb2ZpbGUuIERlY2xhcmUgYW4gYWxpYXNlZCBgZmFtaWx5YCAoZm9yIGV4YW1wbGUgYGNsYXVkZS1vcHVzLTQuOGApIHRvIHJvdXRlIHRoZSBtb2RlbCB0byB0aGF0IGZhbWlseSdzIHR1bmVkIHN5c3RlbSBwcm9tcHQgYW5kIHRvb2wgcHJvZmlsZSB3aXRob3V0IGNoYW5naW5nIHRoZSBtb2RlbCBpZCBzZW50IHRvIHRoZSBydW50aW1lIFx1MjAxNCBzbyBhIHByZXZpZXcgbW9kZWwgY2FuIGJlIGV2YWx1YXRlZCBhZ2FpbnN0IGEga25vd24gcHJvbXB0IHdoaWxlIHN0aWxsIHJ1bm5pbmcgb24gaXRzIG93biBlbmRwb2ludCBcdTIwMTQgYSBgcmVhc29uaW5nRWZmb3J0YCB0byBwaW4gaXRzIGVmZm9ydCBsZXZlbCwgYGF2YWlsYWJsZVRvb2xzYC9gZXhjbHVkZWRUb29sc2AgdG8gZmlsdGVyIGl0cyB0b29sIHNldCwgb3IgYG1vZGVsQ2FwYWJpbGl0aWVzYCB0byBvdmVycmlkZSBpbmRpdmlkdWFsIGNhcGFiaWxpdHkgbGltaXRzIChlLmcuIHZpc2lvbiBzdXBwb3J0LCBjb250ZXh0IHdpbmRvdyBzaXplKSBwYXNzZWQgdGhyb3VnaCB0byB0aGUgU0RLLiBBbGwgb3ZlcnJpZGVzIGFwcGx5IHdoZW4gYSBzZXNzaW9uIGxhdW5jaGVzIG9yIHJlc3VtZXMuIE9uIGEgbWlkLXNlc3Npb24gbW9kZWwgY2hhbmdlLCBvbmx5IHRoZSBuZXcgbW9kZWwncyBgcmVhc29uaW5nRWZmb3J0YCBpcyBhcHBsaWVkOyB0aGUgc2Vzc2lvbiBrZWVwcyBpdHMgbGF1bmNoLXRpbWUgZmFtaWx5LCB0b29sIGZpbHRlcnMsIGFuZCBtb2RlbCBjYXBhYmlsaXRpZXMuIE9ubHkgYWZmZWN0cyBDb3BpbG90IGFnZW50IHNlc3Npb25zLlxcblxcbioqTm90ZSoqOiBUaGlzIGlzIGFuIGFkdmFuY2VkIHNldHRpbmcgZm9yIGV4cGVyaW1lbnRhdGlvbi5cIiksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGZhbWlseToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90Lm1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcy5mYW1pbHknLCBcIlJvdXRlIHRoZSBtb2RlbCB0byBhbm90aGVyIGZhbWlseSdzIHR1bmVkIHN5c3RlbSBwcm9tcHQgYW5kIHRvb2wgcHJvZmlsZSAoZS5nLiBgY2xhdWRlLW9wdXMtNC44YCkuIFRoZSBtb2RlbCBpZCBzZW50IHRvIHRoZSBydW50aW1lIGlzIHVuYWZmZWN0ZWQsIHNvIHRoZSBzZXNzaW9uIHN0aWxsIHJ1bnMgb24gdGhlIHNlbGVjdGVkIG1vZGVsLlwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbLi4ucmVhc29uaW5nRWZmb3J0TGV2ZWxzXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvcGlsb3QubW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzLnJlYXNvbmluZ0VmZm9ydCcsIFwiUmVhc29uaW5nIGVmZm9ydCBmb3Igc2Vzc2lvbnMgb24gdGhpcyBtb2RlbCwgb3ZlcnJpZGluZyB0aGUgbW9kZWwgcGlja2VyJ3MgdGhpbmtpbmcgbGV2ZWwuIFVzZSB0aGUgYCpgIGVudHJ5IHRvIHNldCBpdCBmb3IgZXZlcnkgbW9kZWwuIFVucmVjb2duaXplZCB2YWx1ZXMgYXJlIGlnbm9yZWQuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YXZhaWxhYmxlVG9vbHM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29waWxvdC5tb2RlbENhcGFiaWxpdHlPdmVycmlkZXMuYXZhaWxhYmxlVG9vbHMnLCBcIldoZW4gc2V0LCBvbmx5IG1hdGNoaW5nIHRvb2xzIGFyZSBhdmFpbGFibGUgdG8gc2Vzc2lvbnMgb24gdGhpcyBtb2RlbC4gUGF0dGVybnM6IGJhcmUgdG9vbCBuYW1lcywgYGJ1aWx0aW46KmAgb3IgYGJ1aWx0aW46PG5hbWU+YCAoQ29waWxvdCBydW50aW1lIHRvb2xzKSwgYG1jcDoqYCBvciBgbWNwOjxuYW1lPmAgKE1DUCBzZXJ2ZXIgdG9vbHMpLCBhbmQgYGN1c3RvbToqYCBvciBgY3VzdG9tOjxuYW1lPmAgKGV2ZXJ5IHRvb2wgVlMgQ29kZSByZWdpc3RlcnMgd2l0aCB0aGUgU0RLLCBpbmNsdWRpbmcgdGhlIGFnZW50IGhvc3QncyBvd24gdGVybWluYWwgdG9vbHMpOyBhIGJhcmUgYCpgIGV4cGFuZHMgdG8gYWxsIHRocmVlIHNvdXJjZXMuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZXhjbHVkZWRUb29sczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90Lm1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcy5leGNsdWRlZFRvb2xzJywgXCJUb29scyBkaXNhYmxlZCBmb3Igc2Vzc2lvbnMgb24gdGhpcyBtb2RlbDsgc2FtZSBwYXR0ZXJuIHN5bnRheCBhcyBgYXZhaWxhYmxlVG9vbHNgIGFuZCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgaXQuIE5vdGUgdGhhdCBgY3VzdG9tOipgIGFuZCBhIGJhcmUgYCpgIGFsc28gZGlzYWJsZSB0aGUgYWdlbnQgaG9zdCdzIG93biB0ZXJtaW5hbCB0b29scyByZWdpc3RlcmVkIHdpdGggdGhlIFNESy5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtb2RlbENhcGFiaWxpdGllczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvcGlsb3QubW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzLm1vZGVsQ2FwYWJpbGl0aWVzJywgXCJQZXItcHJvcGVydHkgbW9kZWwgY2FwYWJpbGl0eSBvdmVycmlkZXMgcGFzc2VkIHRocm91Z2ggdG8gdGhlIENvcGlsb3QgU0RLJ3MgYG1vZGVsQ2FwYWJpbGl0aWVzYCBzZXNzaW9uIGZpZWxkIChlLmcuIGB7IFxcXCJzdXBwb3J0c1xcXCI6IHsgXFxcInZpc2lvblxcXCI6IGZhbHNlIH0sIFxcXCJsaW1pdHNcXFwiOiB7IFxcXCJtYXhfY29udGV4dF93aW5kb3dfdG9rZW5zXFxcIjogNjQwMDAgfSB9YCksIGRlZXAtbWVyZ2VkIG92ZXIgdGhlIHJ1bnRpbWUncyByZXNvbHZlZCBkZWZhdWx0cyBmb3IgdGhpcyBtb2RlbC4gQXBwbGllZCB3aGVuIHRoZSBzZXNzaW9uIGxhdW5jaGVzIG9yIHJlc3VtZXMuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmFsbG93U2lnbmVkT3V0V2hlblVzYWJsZScsIFwiV2hlbiBlbmFibGVkLCBBZ2VudCBIb3N0IHNlc3Npb25zIHJlbWFpbiBhdmFpbGFibGUgd2hpbGUgc2lnbmVkIG91dC4gVGhlIEFnZW50cyB3aW5kb3cgb3BlbnMgd2l0aG91dCBmb3JjaW5nIEdpdEh1YiBzaWduLWluLCBhbmQgZWRpdG9yIGNoYXQgbGV0cyB5b3Ugc2VsZWN0IHRoZSBDb3BpbG90IGhhcm5lc3MuIEFnZW50cyB1c2FibGUgd2l0aG91dCBHaXRIdWIgKGZvciBleGFtcGxlIENvZGV4IHdpdGggQ2hhdEdQVCBhdXRoZW50aWNhdGlvbiBvciBDbGF1ZGUgaW4gbmF0aXZlIG1vZGUgd2l0aCB5b3VyIG93biBBbnRocm9waWMgY3JlZGVudGlhbHMpIHdvcmsgd2hpbGUgc2lnbmVkIG91dDsgYWdlbnRzIHRoYXQgcmVxdWlyZSBHaXRIdWIgcHJvbXB0IHlvdSB0byBhZGQgYSBtb2RlbCBvciBzaWduIGluLiBXaGVuIGRpc2FibGVkICh0aGUgZGVmYXVsdCksIEdpdEh1YiBzaWduLWluIGlzIHJlcXVpcmVkIGJlZm9yZSB0aGUgQWdlbnRzIHdpbmRvdyBvcGVucy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9XG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFtBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT25dLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZC5vZmYnLCBcIk5vIHNhbmRib3ggcG9saWN5IGlzIGZvcndhcmRlZCBmb3IgdGhlIFNESydzIGJ1aWx0LWluIHNoZWxsIHRvb2wgXHUyMDE0IGNvbW1hbmRzIHJ1biB1bnNhbmRib3hlZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Quc2RrU2FuZGJveC5lbmFibGVkLm9uJywgXCJUaGUgU0RLJ3MgYnVpbHQtaW4gc2hlbGwgdG9vbCBydW5zIGluc2lkZSBhIHNhbmRib3ggdXNpbmcgdGhlIGNvbmZpZ3VyZWQgZmlsZXN5c3RlbSBwb2xpY3kgd2l0aCBvdXRib3VuZCBuZXR3b3JrIGJsb2NrZWQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Quc2RrU2FuZGJveC5lbmFibGVkJywgXCJTYW5kYm94IG1vZGUgZm9yIHRoZSBDb3BpbG90IFNESydzIGJ1aWx0LWluIHNoZWxsIHRvb2wgb24gbWFjT1MgYW5kIExpbnV4LiBPbmx5IHRha2VzIGVmZmVjdCB3aGVuIGAjY2hhdC5hZ2VudEhvc3QuY3VzdG9tVGVybWluYWxUb29sLmVuYWJsZWQjYCBpcyBgZmFsc2VgOyB3aGVuIHRoZSBBZ2VudCBIb3N0J3Mgb3duIHRlcm1pbmFsIHRvb2wgaXMgZW5hYmxlZCwgdGhlIGVuZ2luZSBzYW5kYm94IGlzIGNvbnRyb2xsZWQgYnkgYCNjaGF0LmFnZW50LnNhbmRib3guZW5hYmxlZCNgLiBUaGUgc2FuZGJveCBhcHBsaWVzIG9ubHkgdG8gcmVxdWVzdHMgdGhhdCBydW4gd2l0aCBtYW51YWwgcGVybWlzc2lvbnMgXHUyMDE0IG5vdCB3aGVuIGFwcHJvdmFscyBhcmUgYnlwYXNzZWQuIFVucmVzdHJpY3RlZCBuZXR3b3JrIGlzIGNvbnRyb2xsZWQgYnkgYCNjaGF0LmFnZW50LnNhbmRib3guYWxsb3dOZXR3b3JrI2AuIFVzZSBgI2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZFdpbmRvd3MjYCBvbiBXaW5kb3dzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmYsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0U2RrU2FuZGJveFdpbmRvd3NFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZiwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5zZGtTYW5kYm94LmVuYWJsZWRXaW5kb3dzLm9mZicsIFwiTm8gc2FuZGJveCBwb2xpY3kgaXMgZm9yd2FyZGVkIGZvciB0aGUgU0RLJ3MgYnVpbHQtaW4gc2hlbGwgdG9vbCBvbiBXaW5kb3dzIFx1MjAxNCBjb21tYW5kcyBydW4gdW5zYW5kYm94ZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZFdpbmRvd3Mub24nLCBcIlRoZSBTREsncyBidWlsdC1pbiBzaGVsbCB0b29sIHJ1bnMgaW5zaWRlIHRoZSBXaW5kb3dzIHNhbmRib3ggdXNpbmcgdGhlIGNvbmZpZ3VyZWQgZmlsZXN5c3RlbSBwb2xpY3kuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Quc2RrU2FuZGJveC5lbmFibGVkV2luZG93cycsIFwiU2FuZGJveCBtb2RlIGZvciB0aGUgQ29waWxvdCBTREsncyBidWlsdC1pbiBzaGVsbCB0b29sIG9uIFdpbmRvd3MuIE9ubHkgdGFrZXMgZWZmZWN0IHdoZW4gYCNjaGF0LmFnZW50SG9zdC5jdXN0b21UZXJtaW5hbFRvb2wuZW5hYmxlZCNgIGlzIGBmYWxzZWAuIFRoaXMgc2V0dGluZyBpcyBpbmRlcGVuZGVudCBvZiBgI2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZCNgIHNvIFdpbmRvd3Mgc2FuZGJveCBzdXBwb3J0IGNhbiBiZSBlbmFibGVkIHNlcGFyYXRlbHkuIFVucmVzdHJpY3RlZCBuZXR3b3JrIGlzIGNvbnRyb2xsZWQgYnkgYCNjaGF0LmFnZW50LnNhbmRib3guYWxsb3dOZXR3b3JrI2AuXCIpLFxuXHRcdFx0ZGVmYXVsdDogQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Ub29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmNvbmZpcm1hdGlvbkNhcm91c2VsJywgXCJXaGVuIGVuYWJsZWQsIG11bHRpcGxlIHRvb2wgY29uZmlybWF0aW9ucyBhcmUgYmF0Y2hlZCBpbnRvIGEgY2Fyb3VzZWwgYWJvdmUgdGhlIGlucHV0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVG9vbFJpc2tBc3Nlc3NtZW50RW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMucmlza0Fzc2Vzc21lbnQuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCB0b29sIGNvbmZpcm1hdGlvbnMgc2hvdyBhbiBMTE0tZ2VuZXJhdGVkIHJpc2sgbGV2ZWwgKFNhZmUgLyBDYXV0aW9uIC8gUmV2aWV3IGNhcmVmdWxseSkgYW5kIGEgc2hvcnQgZXhwbGFuYXRpb24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRvb2xSaXNrQXNzZXNzbWVudE1vZGVsXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLnJpc2tBc3Nlc3NtZW50Lm1vZGVsJywgXCJUaGUgbGFuZ3VhZ2UgbW9kZWwgaWQgdXNlZCB0byBnZW5lcmF0ZSB0b29sIHJpc2sgYXNzZXNzbWVudHMuIFNob3VsZCBiZSBhIHNtYWxsLCBmYXN0IG1vZGVsLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdjb3BpbG90LXV0aWxpdHktc21hbGwnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsYW5BZ2VudERlZmF1bHRNb2RlbF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5wbGFuQWdlbnQuZGVmYXVsdE1vZGVsLmRlc2NyaXB0aW9uJywgXCJTZWxlY3QgdGhlIGRlZmF1bHQgbGFuZ3VhZ2UgbW9kZWwgdG8gdXNlIGZvciB0aGUgUGxhbiBhZ2VudCBmcm9tIHRoZSBhdmFpbGFibGUgcHJvdmlkZXJzLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0ZW51bTogUGxhbkFnZW50RGVmYXVsdE1vZGVsLm1vZGVsSWRzLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFBsYW5BZ2VudERlZmF1bHRNb2RlbC5tb2RlbExhYmVscyxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogUGxhbkFnZW50RGVmYXVsdE1vZGVsLm1vZGVsRGVzY3JpcHRpb25zXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXhwbG9yZUFnZW50RGVmYXVsdE1vZGVsXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4cGxvcmVBZ2VudC5kZWZhdWx0TW9kZWwuZGVzY3JpcHRpb24nLCBcIlNlbGVjdCB0aGUgZGVmYXVsdCBsYW5ndWFnZSBtb2RlbCB0byB1c2UgZm9yIHRoZSBFeHBsb3JlIHN1YmFnZW50IGZyb20gdGhlIGF2YWlsYWJsZSBwcm92aWRlcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRlbnVtOiBFeHBsb3JlQWdlbnREZWZhdWx0TW9kZWwubW9kZWxJZHMsXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogRXhwbG9yZUFnZW50RGVmYXVsdE1vZGVsLm1vZGVsTGFiZWxzLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBFeHBsb3JlQWdlbnREZWZhdWx0TW9kZWwubW9kZWxEZXNjcmlwdGlvbnNcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5CWU9LVXRpbGl0eU1vZGVsRGVmYXVsdF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0LmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBtb2RlbCB1c2VkIGJ5IGJ1aWx0LWluIHV0aWxpdHkgZmxvd3Mgd2hlbiB0aGUgc2VsZWN0ZWQgbWFpbiBhZ2VudCBtb2RlbCBpcyBhIGJyaW5nIHlvdXIgb3duIGtleSAoQllPSykgbW9kZWwuIFRoaXMgc2V0dGluZyBoYXMgbm8gZWZmZWN0IHdoZW4gdGhlIHNlbGVjdGVkIG1haW4gYWdlbnQgbW9kZWwgaXMgcHJvdmlkZWQgYnkgR2l0SHViIENvcGlsb3QuIEEgc3BlY2lmaWMgbW9kZWwgY29uZmlndXJlZCBpbiB7MH0gb3IgezF9IHRha2VzIHByZWNlZGVuY2UuXCIsICdgI2NoYXQudXRpbGl0eU1vZGVsI2AnLCAnYCNjaGF0LnV0aWxpdHlTbWFsbE1vZGVsI2AnKSxcblx0XHRcdGVudW06IFtCWU9LVXRpbGl0eU1vZGVsRGVmYXVsdC5Ob25lLCBCWU9LVXRpbGl0eU1vZGVsRGVmYXVsdC5NYWluQWdlbnQsIEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0LkNvcGlsb3RdLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0Lm5vbmUubGFiZWwnLCBcIk5vbmVcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ieW9rVXRpbGl0eU1vZGVsRGVmYXVsdC5tYWluQWdlbnQubGFiZWwnLCBcIk1haW4gQWdlbnQgTW9kZWxcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ieW9rVXRpbGl0eU1vZGVsRGVmYXVsdC5jb3BpbG90LmxhYmVsJywgXCJHaXRIdWIgQ29waWxvdFwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0Lm5vbmUuZGVzY3JpcHRpb24nLCBcIkRvIG5vdCB1c2UgYSBkZWZhdWx0IHV0aWxpdHkgbW9kZWwuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYnlva1V0aWxpdHlNb2RlbERlZmF1bHQubWFpbkFnZW50LmRlc2NyaXB0aW9uJywgXCJVc2UgdGhlIHNlbGVjdGVkIEJZT0sgbWFpbiBhZ2VudCBtb2RlbC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ieW9rVXRpbGl0eU1vZGVsRGVmYXVsdC5jb3BpbG90LmRlc2NyaXB0aW9uJywgXCJVc2UgdGhlIGRlZmF1bHQgR2l0SHViIENvcGlsb3QgdXRpbGl0eSBtb2RlbHMuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0LkNvcGlsb3QsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVXRpbGl0eU1vZGVsXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnV0aWxpdHlNb2RlbC5kZXNjcmlwdGlvbicsIFwiT3ZlcnJpZGUgdGhlIGxhbmd1YWdlIG1vZGVsIHVzZWQgYnkgYnVpbHQtaW4gdXRpbGl0eSBmbG93cy4gTGVhdmUgZW1wdHkgdG8gdXNlIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgYmVoYXZpb3IuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRlbnVtOiBVdGlsaXR5TW9kZWxDb250cmlidXRpb24ubW9kZWxJZHMsXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogVXRpbGl0eU1vZGVsQ29udHJpYnV0aW9uLm1vZGVsTGFiZWxzLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBVdGlsaXR5TW9kZWxDb250cmlidXRpb24ubW9kZWxEZXNjcmlwdGlvbnNcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5VdGlsaXR5U21hbGxNb2RlbF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51dGlsaXR5U21hbGxNb2RlbC5kZXNjcmlwdGlvbicsIFwiT3ZlcnJpZGUgdGhlIGxhbmd1YWdlIG1vZGVsIHVzZWQgYnkgYnVpbHQtaW4gc21hbGwvZmFzdCB1dGlsaXR5IGZsb3dzLiBBIGZhc3QgYW5kIGluZXhwZW5zaXZlIG1vZGVsIGlzIHJlY29tbWVuZGVkLiBMZWF2ZSBlbXB0eSB0byB1c2UgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBiZWhhdmlvci5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdGVudW06IFV0aWxpdHlTbWFsbE1vZGVsQ29udHJpYnV0aW9uLm1vZGVsSWRzLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFV0aWxpdHlTbWFsbE1vZGVsQ29udHJpYnV0aW9uLm1vZGVsTGFiZWxzLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBVdGlsaXR5U21hbGxNb2RlbENvbnRyaWJ1dGlvbi5tb2RlbERlc2NyaXB0aW9uc1xuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlJlcXVlc3RRdWV1ZWluZ0RlZmF1bHRBY3Rpb25dOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsncXVldWUnLCAnc3RlZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnJlcXVlc3RRdWV1aW5nLmRlZmF1bHRBY3Rpb24ucXVldWUnLCBcIlF1ZXVlIHRoZSBtZXNzYWdlIHRvIHNlbmQgYWZ0ZXIgdGhlIGN1cnJlbnQgcmVxdWVzdCBjb21wbGV0ZXMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQucmVxdWVzdFF1ZXVpbmcuZGVmYXVsdEFjdGlvbi5zdGVlcicsIFwiU3RlZXIgdGhlIGN1cnJlbnQgcmVxdWVzdCBieSBzZW5kaW5nIHRoZSBtZXNzYWdlIGltbWVkaWF0ZWx5LCBzaWduYWxpbmcgdGhlIGN1cnJlbnQgcmVxdWVzdCB0byB5aWVsZC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5yZXF1ZXN0UXVldWluZy5kZWZhdWx0QWN0aW9uLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGljaCBhY3Rpb24gaXMgdGhlIGRlZmF1bHQgZm9yIHRoZSBxdWV1ZSBidXR0b24gd2hlbiBhIHJlcXVlc3QgaXMgaW4gcHJvZ3Jlc3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ3N0ZWVyJyxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVNYXRoXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tYXRoRW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiRW5hYmxlIG1hdGggcmVuZGVyaW5nIGluIGNoYXQgcmVzcG9uc2VzIHVzaW5nIEthVGVYLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uU2hvd0NvZGVCbG9ja1Byb2dyZXNzQW5pbWF0aW9uXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5jb2RlQmxvY2suc2hvd1Byb2dyZXNzQW5pbWF0aW9uLmRlc2NyaXB0aW9uJywgXCJXaGVuIGFwcGx5aW5nIGVkaXRzLCBzaG93IGEgcHJvZ3Jlc3MgYW5pbWF0aW9uIGluIHRoZSBjb2RlIGJsb2NrIHBpbGwuIElmIGRpc2FibGVkLCBzaG93cyB0aGUgcHJvZ3Jlc3MgcGVyY2VudGFnZSBpbnN0ZWFkLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W21jcERpc2NvdmVyeVNlY3Rpb25dOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5mcm9tRW50cmllcyhhbGxEaXNjb3ZlcnlTb3VyY2VzLm1hcChrID0+IFtrLCB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246IGRpc2NvdmVyeVNvdXJjZVNldHRpbmdzTGFiZWxba10gfV0pKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdGRlZmF1bHQ6IE9iamVjdC5mcm9tRW50cmllcyhhbGxEaXNjb3ZlcnlTb3VyY2VzLm1hcChrID0+IFtrLCBmYWxzZV0pKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5lbmFibGVkJywgXCJDb25maWd1cmVzIGRpc2NvdmVyeSBvZiBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlcnMgZnJvbSBjb25maWd1cmF0aW9uIGZyb20gdmFyaW91cyBvdGhlciBhcHBsaWNhdGlvbnMuXCIpLFxuXHRcdH0sXG5cdFx0W21jcEdhbGxlcnlTZXJ2aWNlRW5hYmxlbWVudENvbmZpZ106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5nYWxsZXJ5LmVuYWJsZWQnLCBcIkVuYWJsZXMgdGhlIGRlZmF1bHQgTWFya2V0cGxhY2UgZm9yIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgKE1DUCkgc2VydmVycy5cIiksXG5cdFx0XHRpbmNsdWRlZDogcHJvZHVjdC5xdWFsaXR5ID09PSAnc3RhYmxlJ1xuXHRcdH0sXG5cdFx0W21jcEdhbGxlcnlTZXJ2aWNlVXJsQ29uZmlnXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZ2FsbGVyeS5zZXJ2aWNlVXJsJywgXCJDb25maWd1cmUgdGhlIE1DUCBHYWxsZXJ5IHNlcnZpY2UgVVJMIHRvIGNvbm5lY3QgdG9cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcycsICdhZHZhbmNlZCddLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdNY3BHYWxsZXJ5U2VydmljZVVybCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMDEnLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEubWNwUmVnaXN0cnlVcmwsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdtY3AuZ2FsbGVyeS5zZXJ2aWNlVXJsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ21jcC5nYWxsZXJ5LnNlcnZpY2VVcmwnLCBcIkNvbmZpZ3VyZSB0aGUgTUNQIEdhbGxlcnkgc2VydmljZSBVUkwgdG8gY29ubmVjdCB0b1wiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5JTlNUUlVDVElPTlNfTE9DQVRJT05fS0VZXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5pbnN0cnVjdGlvbnMuY29uZmlnLmxvY2F0aW9ucy50aXRsZScsXG5cdFx0XHRcdFwiSW5zdHJ1Y3Rpb25zIEZpbGUgTG9jYXRpb25zXCIsXG5cdFx0XHQpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5pbnN0cnVjdGlvbnMuY29uZmlnLmxvY2F0aW9ucy5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFwiU3BlY2lmeSBsb2NhdGlvbihzKSBvZiBpbnN0cnVjdGlvbnMgZmlsZXMgKGAqezB9YCkgdGhhdCBjYW4gYmUgYXR0YWNoZWQgaW4gQ2hhdCBzZXNzaW9ucy4gW0xlYXJuIE1vcmVdKHsxfSkuXFxuXFxuUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdElOU1RSVUNUSU9OX0ZJTEVfRVhURU5TSU9OLFxuXHRcdFx0XHRJTlNUUlVDVElPTlNfRE9DVU1FTlRBVElPTl9VUkwsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQuLi5ERUZBVUxUX0lOU1RSVUNUSU9OU19TT1VSQ0VfRk9MREVSUy5tYXAoKGZvbGRlcikgPT4gKHsgW2ZvbGRlci5wYXRoXTogdHJ1ZSB9KSkucmVkdWNlKChhY2MsIGN1cnIpID0+ICh7IC4uLmFjYywgLi4uY3VyciB9KSwge30pLFxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0cHJvcGVydHlOYW1lczoge1xuXHRcdFx0XHRwYXR0ZXJuOiBWQUxJRF9QUk9NUFRfRk9MREVSX1BBVFRFUk4sXG5cdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2hhdC5pbnN0cnVjdGlvbnNMb2NhdGlvbnMuaW52YWxpZFBhdGgnLCBcIlBhdGhzIG11c3QgYmUgcmVsYXRpdmUgb3Igc3RhcnQgd2l0aCAnfi8nLiBBYnNvbHV0ZSBwYXRocyBhbmQgJ1xcXFwnIHNlcGFyYXRvcnMgYXJlIG5vdCBzdXBwb3J0ZWQuIEdsb2IgcGF0dGVybnMgYXJlIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgdmVyc2lvbnMuXCIpLFxuXHRcdFx0fSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0RFRkFVTFRfSU5TVFJVQ1RJT05TX1NPVVJDRV9GT0xERVJTWzBdLnBhdGhdOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0lOU1RSVUNUSU9OU19ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRcdCcvVXNlcnMvdnNjb2RlL3JlcG9zL2luc3RydWN0aW9ucyc6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuUFJPTVBUX0xPQ0FUSU9OU19LRVldOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnJldXNhYmxlUHJvbXB0cy5jb25maWcubG9jYXRpb25zLnRpdGxlJyxcblx0XHRcdFx0XCJQcm9tcHQgRmlsZSBMb2NhdGlvbnNcIixcblx0XHRcdCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnJldXNhYmxlUHJvbXB0cy5jb25maWcubG9jYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJTcGVjaWZ5IGxvY2F0aW9uKHMpIG9mIHJldXNhYmxlIHByb21wdCBmaWxlcyAoYCp7MH1gKSB0aGF0IGNhbiBiZSBydW4gaW4gQ2hhdCBzZXNzaW9ucy4gW0xlYXJuIE1vcmVdKHsxfSkuXFxuXFxuUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdFBST01QVF9GSUxFX0VYVEVOU0lPTixcblx0XHRcdFx0UFJPTVBUX0RPQ1VNRU5UQVRJT05fVVJMLFxuXHRcdFx0KSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0W1BST01QVF9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0dW5ldmFsdWF0ZWRQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0cHJvcGVydHlOYW1lczoge1xuXHRcdFx0XHRwYXR0ZXJuOiBWQUxJRF9QUk9NUFRfRk9MREVSX1BBVFRFUk4sXG5cdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2hhdC5wcm9tcHRGaWxlTG9jYXRpb25zLmludmFsaWRQYXRoJywgXCJQYXRocyBtdXN0IGJlIHJlbGF0aXZlIG9yIHN0YXJ0IHdpdGggJ34vJy4gQWJzb2x1dGUgcGF0aHMgYW5kICdcXFxcJyBzZXBhcmF0b3JzIGFyZSBub3Qgc3VwcG9ydGVkLiBHbG9iIHBhdHRlcm5zIGFyZSBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gZnV0dXJlIHZlcnNpb25zLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddLFxuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtQUk9NUFRfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtQUk9NUFRfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0XHQnL1VzZXJzL3ZzY29kZS9yZXBvcy9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5NT0RFX0xPQ0FUSU9OX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQubW9kZS5jb25maWcubG9jYXRpb25zLnRpdGxlJyxcblx0XHRcdFx0XCJNb2RlIEZpbGUgTG9jYXRpb25zXCIsXG5cdFx0XHQpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5tb2RlLmNvbmZpZy5sb2NhdGlvbnMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcIlNwZWNpZnkgbG9jYXRpb24ocykgb2YgY3VzdG9tIGNoYXQgbW9kZSBmaWxlcyAoYCp7MH1gKS4gW0xlYXJuIE1vcmVdKHsxfSkuXFxuXFxuUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdExFR0FDWV9NT0RFX0ZJTEVfRVhURU5TSU9OLFxuXHRcdFx0XHRBR0VOVF9ET0NVTUVOVEFUSU9OX1VSTCxcblx0XHRcdCksXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFtMRUdBQ1lfTU9ERV9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0Lm1vZGUuY29uZmlnLmxvY2F0aW9ucy5kZXByZWNhdGVkJywgXCJUaGlzIHNldHRpbmcgaXMgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSByZW1vdmVkIGluIGZ1dHVyZSByZWxlYXNlcy4gQ2hhdCBtb2RlcyBhcmUgbm93IGNhbGxlZCBjdXN0b20gYWdlbnRzIGFuZCBhcmUgbG9jYXRlZCBpbiBgLmdpdGh1Yi9hZ2VudHNgXCIpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHR1bmV2YWx1YXRlZFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXSxcblx0XHRcdGV4YW1wbGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbTEVHQUNZX01PREVfREVGQVVMVF9TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtMRUdBQ1lfTU9ERV9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRcdCcvVXNlcnMvdnNjb2RlL3JlcG9zL2NoYXRtb2Rlcyc6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuQUdFTlRTX0xPQ0FUSU9OX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuYWdlbnRzLmNvbmZpZy5sb2NhdGlvbnMudGl0bGUnLFxuXHRcdFx0XHRcIkFnZW50IEZpbGUgTG9jYXRpb25zXCIsXG5cdFx0XHQpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5hZ2VudHMuY29uZmlnLmxvY2F0aW9ucy5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFwiU3BlY2lmeSBsb2NhdGlvbihzKSBvZiBjdXN0b20gYWdlbnQgZmlsZXMgKGAqezB9YCkuIFtMZWFybiBNb3JlXSh7MX0pLlxcblxcblJlbGF0aXZlIHBhdGhzIGFyZSByZXNvbHZlZCBmcm9tIHRoZSByb290IGZvbGRlcihzKSBvZiB5b3VyIHdvcmtzcGFjZS5cXG5cXG5UaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLFxuXHRcdFx0XHRBR0VOVF9GSUxFX0VYVEVOU0lPTixcblx0XHRcdFx0QUdFTlRfRE9DVU1FTlRBVElPTl9VUkwsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRbQUdFTlRTX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRbQ0xBVURFX0FHRU5UU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0W0NPUElMT1RfVVNFUl9BR0VOVFNfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTixcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50TG9jYXRpb25zLmludmFsaWRQYXRoJywgXCJQYXRocyBtdXN0IGJlIHJlbGF0aXZlIG9yIHN0YXJ0IHdpdGggJ34vJy4gQWJzb2x1dGUgcGF0aHMgYW5kICdcXFxcJyBzZXBhcmF0b3JzIGFyZSBub3Qgc3VwcG9ydGVkLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddLFxuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtBR0VOVFNfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbQUdFTlRTX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRcdCdteS1hZ2VudHMnOiB0cnVlLFxuXHRcdFx0XHRcdCcuLi9zaGFyZWQtYWdlbnRzJzogdHJ1ZSxcblx0XHRcdFx0XHQnfi8uY29waWxvdC9hZ2VudHMnOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9NRF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQWdlbnRNZC50aXRsZScsIFwiVXNlIEFHRU5UUy5tZCBmaWxlXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VBZ2VudE1kLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGluc3RydWN0aW9ucyBmcm9tIGBBR0VOVFMubWRgIGZpbGUgZm91bmQgaW4gYSB3b3Jrc3BhY2Ugcm9vdHMgYXJlIGF0dGFjaGVkIHRvIGFsbCBjaGF0IHJlcXVlc3RzLiBUaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLCksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdGRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ11cblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLlVTRV9ORVNURURfQUdFTlRfTURdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LnVzZU5lc3RlZEFnZW50TWQudGl0bGUnLCBcIlVzZSBuZXN0ZWQgQUdFTlRTLm1kIGZpbGVzXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VOZXN0ZWRBZ2VudE1kLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGluc3RydWN0aW9ucyBmcm9tIG5lc3RlZCBgQUdFTlRTLm1kYCBmaWxlcyBmb3VuZCBpbiB0aGUgd29ya3NwYWNlIGFyZSBsaXN0ZWQgaW4gYWxsIGNoYXQgcmVxdWVzdHMuIFRoZSBsYW5ndWFnZSBtb2RlbCBjYW4gbG9hZCB0aGVzZSBza2lsbHMgb24tZGVtYW5kIGlmIHRoZSBgcmVhZGAgdG9vbCBpcyBhdmFpbGFibGUuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdGRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX01EXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VDbGF1ZGVNZC50aXRsZScsIFwiVXNlIENMQVVERS5tZCBmaWxlXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VDbGF1ZGVNZC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBpbnN0cnVjdGlvbnMgZnJvbSBgQ0xBVURFLm1kYCBmaWxlIGZvdW5kIGluIHdvcmtzcGFjZSByb290cywgLmNsYXVkZSBhbmQgfi8uY2xhdWRlIGZvbGRlciBhcmUgYXR0YWNoZWQgdG8gYWxsIGNoYXQgcmVxdWVzdHMuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMU106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQWdlbnRTa2lsbHMudGl0bGUnLCBcIlVzZSBBZ2VudCBza2lsbHNcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUFnZW50U2tpbGxzLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHNraWxscyBhcmUgcHJvdmlkZWQgYXMgc3BlY2lhbGl6ZWQgY2FwYWJpbGl0aWVzIHRvIHRoZSBjaGF0IHJlcXVlc3RzLiBTa2lsbHMgYXJlIGxvYWRlZCBmcm9tIHRoZSBmb2xkZXJzIGNvbmZpZ3VyZWQgaW4gYCNjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zI2AuIFRoZSBsYW5ndWFnZSBtb2RlbCBjYW4gbG9hZCB0aGVzZSBza2lsbHMgb24tZGVtYW5kIGlmIHRoZSBgcmVhZGAgdG9vbCBpcyBhdmFpbGFibGUuIExlYXJuIG1vcmUgYWJvdXQgW0FnZW50IFNraWxsc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWFnZW50LXNraWxscykuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX1NLSUxMX0FESEVSRU5DRV9QUk9NUFRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LnVzZVNraWxsQWRoZXJlbmNlUHJvbXB0LnRpdGxlJywgXCJVc2UgU2tpbGwgQWRoZXJlbmNlIFByb21wdFwiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXNlU2tpbGxBZGhlcmVuY2VQcm9tcHQuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBzdHJvbmdlciBza2lsbCBhZGhlcmVuY2UgcHJvbXB0IGlzIHVzZWQgdGhhdCBlbmNvdXJhZ2VzIHRoZSBtb2RlbCB0byBpbW1lZGlhdGVseSBpbnZva2Ugc2tpbGxzIHdoZW4gcmVsZXZhbnQgcmF0aGVyIHRoYW4ganVzdCBhbm5vdW5jaW5nIHRoZW0uIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuSU5DTFVERV9BUFBMWUlOR19JTlNUUlVDVElPTlNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LmluY2x1ZGVBcHBseWluZ0luc3RydWN0aW9ucy50aXRsZScsIFwiSW5jbHVkZSBBcHBseWluZyBJbnN0cnVjdGlvbnNcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmluY2x1ZGVBcHBseWluZ0luc3RydWN0aW9ucy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBpbnN0cnVjdGlvbnMgd2l0aCBhIG1hdGNoaW5nICdhcHBseVRvJyBhdHRyaWJ1dGUgYXJlIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgaW4gY2hhdCByZXF1ZXN0cy4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5JTkNMVURFX1JFRkVSRU5DRURfSU5TVFJVQ1RJT05TXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC5pbmNsdWRlUmVmZXJlbmNlZEluc3RydWN0aW9ucy50aXRsZScsIFwiSW5jbHVkZSBSZWZlcmVuY2VkIEluc3RydWN0aW9uc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuaW5jbHVkZVJlZmVyZW5jZWRJbnN0cnVjdGlvbnMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgcmVmZXJlbmNlZCBpbnN0cnVjdGlvbnMgYXJlIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgaW4gY2hhdCByZXF1ZXN0cy4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPU106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQ3VzdG9taXphdGlvbnNJblBhcmVudFJlcG9zLnRpdGxlJywgXCJVc2UgQ3VzdG9taXphdGlvbnMgaW4gUGFyZW50IFJlcG9zaXRvcmllc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQ3VzdG9taXphdGlvbnNJblBhcmVudFJlcG9zLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSBjaGF0IGN1c3RvbWl6YXRpb24gZmlsZXMgaW4gcGFyZW50IHJlcG9zaXRvcmllcy4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuU0tJTExTX0xPQ0FUSU9OX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudFNraWxsc0xvY2F0aW9ucy50aXRsZScsIFwiQWdlbnQgU2tpbGxzIExvY2F0aW9uc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJTcGVjaWZ5IGxvY2F0aW9uKHMpIG9mIGFnZW50IHNraWxscyAoYHswfWApIHRoYXQgY2FuIGJlIHVzZWQgaW4gQ2hhdCBTZXNzaW9ucy4gW0xlYXJuIE1vcmVdKHsxfSkuXFxuXFxuRWFjaCBwYXRoIHNob3VsZCBjb250YWluIHNraWxsIHN1YmZvbGRlcnMgd2l0aCBTS0lMTC5tZCBmaWxlcyAoZS5nLiwgYWRkIGBteS1za2lsbHNgIGlmIHlvdSBoYXZlIGBteS1za2lsbHMvc2tpbGxBL1NLSUxMLm1kYCkuIFJlbGF0aXZlIHBhdGhzIGFyZSByZXNvbHZlZCBmcm9tIHRoZSByb290IGZvbGRlcihzKSBvZiB5b3VyIHdvcmtzcGFjZS5cXG5cXG5UaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLFxuXHRcdFx0XHRTS0lMTF9GSUxFTkFNRSxcblx0XHRcdFx0U0tJTExfRE9DVU1FTlRBVElPTl9VUkwsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQuLi5ERUZBVUxUX1NLSUxMX1NPVVJDRV9GT0xERVJTLm1hcCgoZm9sZGVyKSA9PiAoeyBbZm9sZGVyLnBhdGhdOiB0cnVlIH0pKS5yZWR1Y2UoKGFjYywgY3VycikgPT4gKHsgLi4uYWNjLCAuLi5jdXJyIH0pLCB7fSksXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTixcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zLmludmFsaWRQYXRoJywgXCJQYXRocyBtdXN0IGJlIHJlbGF0aXZlIG9yIHN0YXJ0IHdpdGggJ34vJy4gQWJzb2x1dGUgcGF0aHMgYW5kICdcXFxcJyBzZXBhcmF0b3JzIGFyZSBub3Qgc3VwcG9ydGVkLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddLFxuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtERUZBVUxUX1NLSUxMX1NPVVJDRV9GT0xERVJTWzBdLnBhdGhdOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0RFRkFVTFRfU0tJTExfU09VUkNFX0ZPTERFUlNbMF0ucGF0aF06IHRydWUsXG5cdFx0XHRcdFx0J215LXNraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0Jy4uL3NoYXJlZC1za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdCd+Ly5jdXN0b20vc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVldOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zLnRpdGxlJywgXCJIb29rIEZpbGUgTG9jYXRpb25zXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJTcGVjaWZ5IHBhdGhzIHRvIGhvb2sgY29uZmlndXJhdGlvbiBmaWxlcyB0aGF0IGRlZmluZSBjdXN0b20gc2hlbGwgY29tbWFuZHMgdG8gZXhlY3V0ZSBhdCBzdHJhdGVnaWMgcG9pbnRzIGluIGFuIGFnZW50J3Mgd29ya2Zsb3cuIFtMZWFybiBNb3JlXSh7MH0pLlxcblxcblJlbGF0aXZlIHBhdGhzIGFyZSByZXNvbHZlZCBmcm9tIHRoZSByb290IGZvbGRlcihzKSBvZiB5b3VyIHdvcmtzcGFjZS4gU3VwcG9ydHMgQ29waWxvdCBob29rcyAoYCouanNvbmApIGFuZCBDbGF1ZGUgQ29kZSBob29rcyAoYHNldHRpbmdzLmpzb25gLCBgc2V0dGluZ3MubG9jYWwuanNvbmApLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdEhPT0tfRE9DVU1FTlRBVElPTl9VUkwsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQuLi5ERUZBVUxUX0hPT0tfRklMRV9QQVRIUy5tYXAoKGYpID0+ICh7IFtmLnBhdGhdOiB0cnVlIH0pKS5yZWR1Y2UoKGFjYywgY3VycikgPT4gKHsgLi4uYWNjLCAuLi5jdXJyIH0pLCB7fSksXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTixcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0Lmhvb2tGaWxlc0xvY2F0aW9ucy5pbnZhbGlkUGF0aCcsIFwiUGF0aHMgbXVzdCBiZSByZWxhdGl2ZSBvciBzdGFydCB3aXRoICd+LycuIEFic29sdXRlIHBhdGhzIGFuZCAnXFxcXCcgc2VwYXJhdG9ycyBhcmUgbm90IHN1cHBvcnRlZC5cIiksXG5cdFx0XHR9LFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJldmlldycsICdwcm9tcHRzJywgJ2hvb2tzJywgJ2FnZW50J10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0RFRkFVTFRfSE9PS19GSUxFX1BBVEhTWzBdLnBhdGhdOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0RFRkFVTFRfSE9PS19GSUxFX1BBVEhTWzBdLnBhdGhdOiB0cnVlLFxuXHRcdFx0XHRcdCdjdXN0b20taG9va3MvaG9va3MuanNvbic6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IHsgJy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbic6IGZhbHNlLCAnLmNsYXVkZS9zZXR0aW5ncy5qc29uJzogZmFsc2UsICd+Ly5jbGF1ZGUvc2V0dGluZ3MuanNvbic6IGZhbHNlIH0gfSxcblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VIb29rcy50aXRsZScsIFwiVXNlIENoYXQgSG9va3NcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUhvb2tzLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGNoYXQgaG9va3MgYXJlIGV4ZWN1dGVkIGF0IHN0cmF0ZWdpYyBwb2ludHMgZHVyaW5nIGFuIGFnZW50J3Mgd29ya2Zsb3cuIEhvb2tzIGFyZSBsb2FkZWQgZnJvbSB0aGUgZmlsZXMgY29uZmlndXJlZCBpbiBgI2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zI2AuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJldmlldycsICdwcm9tcHRzJywgJ2hvb2tzJywgJ2FnZW50J10sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRIb29rcycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMDknLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LnVzZUhvb2tzLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlSG9va3MuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2hhdCBob29rcyBhcmUgZXhlY3V0ZWQgYXQgc3RyYXRlZ2ljIHBvaW50cyBkdXJpbmcgYW4gYWdlbnQncyB3b3JrZmxvdy4gSG9va3MgYXJlIGxvYWRlZCBmcm9tIHRoZSBmaWxlcyBjb25maWd1cmVkIGluIGAjY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMjYC4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX0NMQVVERV9IT09LU106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQ2xhdWRlSG9va3MudGl0bGUnLCBcIlVzZSBDbGF1ZGUgSG9va3NcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUNsYXVkZUhvb2tzLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGhvb2tzIGZyb20gQ2xhdWRlIGNvbmZpZ3VyYXRpb24gZmlsZXMgY2FuIGV4ZWN1dGUuIFdoZW4gZGlzYWJsZWQsIG9ubHkgQ29waWxvdC1mb3JtYXQgaG9va3MgYXJlIHVzZWQuIEhvb2tzIGFyZSBsb2FkZWQgZnJvbSB0aGUgZmlsZXMgY29uZmlndXJlZCBpbiBgI2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zI2AuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdGRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnLCAncHJvbXB0cycsICdob29rcycsICdhZ2VudCddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5QUk9NUFRfRklMRVNfU1VHR0VTVF9LRVldOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5wcm9tcHRGaWxlc1JlY29tbWVuZGF0aW9ucy50aXRsZScsXG5cdFx0XHRcdFwiUHJvbXB0IEZpbGUgUmVjb21tZW5kYXRpb25zXCIsXG5cdFx0XHQpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5wcm9tcHRGaWxlc1JlY29tbWVuZGF0aW9ucy5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFwiQ29uZmlndXJlIHdoaWNoIHByb21wdCBmaWxlcyB0byByZWNvbW1lbmQgaW4gdGhlIGNoYXQgd2VsY29tZSB2aWV3LiBFYWNoIGtleSBpcyBhIHByb21wdCBmaWxlIG5hbWUsIGFuZCB0aGUgdmFsdWUgY2FuIGJlIGB0cnVlYCB0byBhbHdheXMgcmVjb21tZW5kLCBgZmFsc2VgIHRvIG5ldmVyIHJlY29tbWVuZCwgb3IgYSBbd2hlbiBjbGF1c2VdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS13aGVuLWNsYXVzZSkgZXhwcmVzc2lvbiBsaWtlIGByZXNvdXJjZUV4dG5hbWUgPT0gLmpzYCBvciBgcmVzb3VyY2VMYW5nSWQgPT0gbWFya2Rvd25gLlwiLFxuXHRcdFx0KSxcblx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddLFxuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdwbGFuJzogdHJ1ZSxcblx0XHRcdFx0XHQnYTExeS1hdWRpdCc6ICdyZXNvdXJjZUV4dG5hbWUgPT0gLmh0bWwnLFxuXHRcdFx0XHRcdCdkb2N1bWVudCc6ICdyZXNvdXJjZUxhbmdJZCA9PSBtYXJrZG93bidcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Ub2Rvc1Nob3dXaWRnZXRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50b29scy50b2Rvcy5zaG93V2lkZ2V0JywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIHRvZG8gbGlzdCB3aWRnZXQgYWJvdmUgdGhlIGNoYXQgaW5wdXQuIFdoZW4gZW5hYmxlZCwgdGhlIHdpZGdldCBkaXNwbGF5cyB0b2RvIGl0ZW1zIGNyZWF0ZWQgYnkgdGhlIGFnZW50IGFuZCB1cGRhdGVzIGFzIHByb2dyZXNzIGlzIG1hZGUuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nU3R5bGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICdmaXhlZFNjcm9sbGluZycsXG5cdFx0XHRlbnVtOiBbJ2NvbGxhcHNlZCcsICdjb2xsYXBzZWRQcmV2aWV3JywgJ2ZpeGVkU2Nyb2xsaW5nJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZ01vZGUuY29sbGFwc2VkJywgXCJUaGlua2luZyBwYXJ0cyB3aWxsIGJlIGNvbGxhcHNlZCBieSBkZWZhdWx0LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nTW9kZS5jb2xsYXBzZWRQcmV2aWV3JywgXCJUaGlua2luZyBwYXJ0cyB3aWxsIGJlIGV4cGFuZGVkIGZpcnN0LCB0aGVuIGNvbGxhcHNlIG9uY2Ugd2UgcmVhY2ggYSBwYXJ0IHRoYXQgaXMgbm90IHRoaW5raW5nLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nTW9kZS5maXhlZFNjcm9sbGluZycsIFwiU2hvdyB0aGlua2luZyBpbiBhIGZpeGVkLWhlaWdodCBzdHJlYW1pbmcgcGFuZWwgdGhhdCBhdXRvLXNjcm9sbHM7IGNsaWNrIGhlYWRlciB0byBleHBhbmQgdG8gZnVsbCBoZWlnaHQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsIFwiQ29udHJvbHMgaG93IHRoaW5raW5nIGlzIHJlbmRlcmVkLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdHZW5lcmF0ZVRpdGxlc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLmdlbmVyYXRlVGl0bGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSBhbiBMTE0gdG8gZ2VuZXJhdGUgc3VtbWFyeSB0aXRsZXMgZm9yIHRoaW5raW5nIHNlY3Rpb25zLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHQnY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scyc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJ2Fsd2F5cycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICd3aXRoVGhpbmtpbmcnLCAnYWx3YXlzJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scy5vZmYnLCBcIlRvb2wgY2FsbHMgYXJlIHNob3duIHNlcGFyYXRlbHksIG5vdCBjb2xsYXBzZWQgaW50byB0aGlua2luZy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scy53aXRoVGhpbmtpbmcnLCBcIlRvb2wgY2FsbHMgYXJlIGNvbGxhcHNlZCBpbnRvIHRoaW5raW5nIHNlY3Rpb25zIHdoZW4gdGhpbmtpbmcgaXMgcHJlc2VudC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scy5hbHdheXMnLCBcIlRvb2wgY2FsbHMgYXJlIGFsd2F5cyBjb2xsYXBzZWQsIGV2ZW4gd2l0aG91dCB0aGlua2luZy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJywgXCJDb250cm9scyBob3cgdG9vbCBjYWxscyBhcmUgZGlzcGxheWVkIGluIHJlbGF0aW9uIHRvIHRoaW5raW5nIHNlY3Rpb25zLlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGVybWluYWxUb29sc0luVGhpbmtpbmddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLnRlcm1pbmFsVG9vbHMnLCBcIldoZW4gZW5hYmxlZCwgdGVybWluYWwgdG9vbCBjYWxscyBhcmUgZGlzcGxheWVkIGluc2lkZSB0aGUgdGhpbmtpbmcgZHJvcGRvd24gd2l0aCBhIHNpbXBsaWZpZWQgdmlldy5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlNpbXBsZVRlcm1pbmFsQ29sbGFwc2libGVdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLnRlcm1pbmFsLnNpbXBsZUNvbGxhcHNpYmxlJywgXCJXaGVuIGVuYWJsZWQsIHRlcm1pbmFsIHRvb2wgY2FsbHMgYXJlIGFsd2F5cyBkaXNwbGF5ZWQgaW4gYSBjb2xsYXBzaWJsZSBjb250YWluZXIgd2l0aCBhIHNpbXBsaWZpZWQgdmlldy5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNvbXByZXNzT3V0cHV0RW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmNvbXByZXNzT3V0cHV0LmVuYWJsZWQnLCBcIlBvc3QtcHJvY2VzcyB0b29sIG91dHB1dCAoZm9yIGV4YW1wbGUgYGdpdCBkaWZmYCwgYGxzIC1sYCwgb3IgYG5wbSBpbnN0YWxsYCkgdG8gcmVkdWNlIHRva2VuIHVzYWdlIGJlZm9yZSBpdCBpcyBzZW50IHRvIHRoZSBtb2RlbC5cIiksXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdQaHJhc2VzXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdG1vZGU6ICdhcHBlbmQnLFxuXHRcdFx0XHRwaHJhc2VzOiBbXVxuXHRcdFx0fSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bW9kZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsncmVwbGFjZScsICdhcHBlbmQnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnYXBwZW5kJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMubW9kZScsIFwiJ3JlcGxhY2UnIHJlcGxhY2VzIGFsbCBkZWZhdWx0IHBocmFzZXMgZW50aXJlbHk7ICdhcHBlbmQnIGFkZHMgeW91ciBwaHJhc2VzIHRvIGFsbCBkZWZhdWx0IGNhdGVnb3JpZXMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBocmFzZXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZy5waHJhc2VzLnBocmFzZXMnLCBcIkN1c3RvbSBsb2FkaW5nIG1lc3NhZ2VzIHRvIHNob3cgZHVyaW5nIHRoaW5raW5nLCB3b3JraW5nIHByb2dyZXNzLCB0ZXJtaW5hbCwgYW5kIHRvb2wgb3BlcmF0aW9ucy5cIilcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZy5waHJhc2VzJywgXCJDdXN0b21pemUgdGhlIGxvYWRpbmcgbWVzc2FnZXMgc2hvd24gZHVyaW5nIGFnZW50IHRoaW5raW5nIGFuZCBwcm9ncmVzcyBpbmRpY2F0b3JzLiBVc2UgYFxcXCJtb2RlXFxcIjogXFxcInJlcGxhY2VcXFwiYCB0byB1c2Ugb25seSB5b3VyIHBocmFzZXMsIG9yIGBcXFwibW9kZVxcXCI6IFxcXCJhcHBlbmRcXFwiYCB0byBhZGQgdGhlbSB0byB0aGUgZGVmYXVsdHMuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BdXRvRXhwYW5kVG9vbEZhaWx1cmVzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50b29scy5hdXRvRXhwYW5kRmFpbHVyZXMnLCBcIldoZW4gZW5hYmxlZCwgdGVybWluYWwgdG9vbCBmYWlsdXJlcyBhcmUgYXV0b21hdGljYWxseSBleHBhbmRlZCBpbiB0aGUgY2hhdCBVSSB0byBzaG93IGVycm9yIGRldGFpbHMuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRBSURpc2FibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5kaXNhYmxlQUlGZWF0dXJlcycsIFwiRGlzYWJsZSBhbmQgaGlkZSBidWlsdC1pbiBBSSBmZWF0dXJlcyBwcm92aWRlZCBieSBHaXRIdWIgQ29waWxvdCwgaW5jbHVkaW5nIGNoYXQgYW5kIGlubGluZSBzdWdnZXN0aW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyU2lnbkluRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudGl0bGVCYXIuc2lnbkluLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIENvcGlsb3QgU2lnbiBJbiBidXR0b24gaXMgc2hvd24gaW4gdGhlIHRpdGxlIGJhciB3aGVuIHNpZ25lZCBvdXQuIFdoZW4gZGlzYWJsZWQsIHRoZSBTaWduIEluIGFmZm9yZGFuY2UgZmFsbHMgYmFjayB0byB0aGUgc3RhdHVzIGJhci5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyT3BlbkluQWdlbnRzV2luZG93RW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudGl0bGVCYXIub3BlbkluQWdlbnRzV2luZG93LmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIE9wZW4gaW4gQWdlbnRzIFdpbmRvdyBidXR0b24gaXMgc2hvd24gaW4gdGhlIHRpdGxlIGJhci5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0J2NoYXQuYXBwcm92ZWRBY2NvdW50T3JnYW5pemF0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcHByb3ZlZEFjY291bnRPcmdhbml6YXRpb25zJywgXCJMaXN0IG9mIEdpdEh1YiBvcmdhbml6YXRpb24gbG9naW5zIHdob3NlIG1lbWJlcnMgYXJlIHBlcm1pdHRlZCB0byB1c2UgQUkgZmVhdHVyZXMuIFdoZW4gc2V0IHRvIGEgbm9uLWVtcHR5IGxpc3QsIEFJIGZlYXR1cmVzIGFyZSBkaXNhYmxlZCB1bnRpbCB0aGUgdXNlciBzaWducyBpbnRvIGEgR2l0SHViIGFjY291bnQgdGhhdCBiZWxvbmdzIHRvIG9uZSBvZiB0aGUgc3BlY2lmaWVkIG9yZ2FuaXphdGlvbnMgYW5kIGFjY291bnQtbGV2ZWwgcG9saWN5IGRhdGEgaGFzIGJlZW4gcmVzb2x2ZWQuIFNldCB0byAnKicgdG8gYWxsb3cgYW55IGF1dGhlbnRpY2F0ZWQgR2l0SHViIG9yIEdpdEh1YiBFbnRlcnByaXNlIGFjY291bnQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBcHByb3ZlZEFjY291bnRPcmdhbml6YXRpb25zJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjExOCcsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFwcHJvdmVkQWNjb3VudE9yZ2FuaXphdGlvbnMucG9saWN5LmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYXBwcm92ZWRBY2NvdW50T3JnYW5pemF0aW9ucy5wb2xpY3kuZGVzY3JpcHRpb24nLCBcIlNldHRpbmcgdGhpcyBwb2xpY3kgdG8gYSBub24tZW1wdHkgbGlzdCBhY3RpdmF0ZXMgdGhlIEFwcHJvdmVkIEFjY291bnQgZ2F0ZTogYWxsIEFJIGZlYXR1cmVzIGFyZSBkaXNhYmxlZCB1bnRpbCB0aGUgdXNlciBzaWducyBpbnRvIGEgR2l0SHViIGFjY291bnQgd2hvc2Ugb3JnYW5pemF0aW9ucyBpbnRlcnNlY3QgdGhpcyBsaXN0IEFORCB0aGUgYWNjb3VudC1zaWRlIHBvbGljeSBkYXRhIGhhcyByZXNvbHZlZC4gQ29tcGFyaXNvbiBpcyBjYXNlLWluc2Vuc2l0aXZlLiBVc2UgJyonIGFzIGEgd2lsZGNhcmQgdG8gYWNjZXB0IGFueSBzaWduZWQtaW4gR2l0SHViIG9yIEdIRSBhY2NvdW50ICh1c2UgdGhpcyBmb3IgR0hFIGRlcGxveW1lbnRzIHdoZXJlIHRoZSBvcmdhbml6YXRpb24gbGlzdCBpcyBub3Qgc3VyZmFjZWQpLlwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2NoYXQuYWxsb3dBbm9ueW1vdXNBY2Nlc3MnOiB7IC8vIFRPRE9AYnBhc2VybyByZW1vdmUgbWUgZXZlbnR1YWxseVxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hbGxvd0Fub255bW91c0FjY2VzcycsIFwiQ29udHJvbHMgd2hldGhlciBhbm9ueW1vdXMgYWNjZXNzIGlzIGFsbG93ZWQgaW4gY2hhdC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkdyb3d0aE5vdGlmaWNhdGlvbkVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lmdyb3d0aE5vdGlmaWNhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGEgZ3Jvd3RoIG5vdGlmaWNhdGlvbiBpbiB0aGUgYWdlbnQgc2Vzc2lvbnMgdmlldyB0byBlbmNvdXJhZ2UgbmV3IHVzZXJzIHRvIHRyeSBDb3BpbG90LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUmVzdG9yZUxhc3RQYW5lbFNlc3Npb25dOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlc3RvcmVMYXN0UGFuZWxTZXNzaW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBsYXN0IHNlc3Npb24gaXMgcmVzdG9yZWQgaW4gcGFuZWwgYWZ0ZXIgcmVzdGFydC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkV4aXRBZnRlckRlbGVnYXRpb25dOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4aXRBZnRlckRlbGVnYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGNoYXQgcGFuZWwgYXV0b21hdGljYWxseSBleGl0cyBhZnRlciBkZWxlZ2F0aW5nIGEgcmVxdWVzdCB0byBhbm90aGVyIHNlc3Npb24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHR9LFxuXHRcdCdjaGF0LmV4dGVuc2lvblVuaWZpY2F0aW9uLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4dGVuc2lvblVuaWZpY2F0aW9uLmVuYWJsZWQnLCBcIkVuYWJsZXMgdGhlIHVuaWZpY2F0aW9uIG9mIEdpdEh1YiBDb3BpbG90IGV4dGVuc2lvbnMuIFdoZW4gZW5hYmxlZCwgYWxsIEdpdEh1YiBDb3BpbG90IGZ1bmN0aW9uYWxpdHkgaXMgc2VydmVkIGZyb20gdGhlIEdpdEh1YiBDb3BpbG90IENoYXQgZXh0ZW5zaW9uLiBXaGVuIGRpc2FibGVkLCB0aGUgR2l0SHViIENvcGlsb3QgYW5kIEdpdEh1YiBDb3BpbG90IENoYXQgZXh0ZW5zaW9ucyBvcGVyYXRlIGluZGVwZW5kZW50bHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlN1YmFnZW50c0FsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudHMuYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMnLCBcIkFsbG93IHN1YmFnZW50cyB0byBpbnZva2Ugc3ViYWdlbnRzLlwiKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudHMuYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMubWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3ViYWdlbnRzIGNhbiBpbnZva2Ugb3RoZXIgc3ViYWdlbnRzLiBXaGVuIGVuYWJsZWQsIG5lc3RpbmcgaXMgbGltaXRlZCB0byBhIG1heGltdW0gZGVwdGggb2YgNS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uU3ViYWdlbnRzVXNlUmljaFJlbmRlcmluZ106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuc3ViYWdlbnRzLnVzZVJpY2hSZW5kZXJpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3ViYWdlbnRzIGluIGNoYXQgZWRpdG9ycyB1c2UgYSByaWNoIHByZXNlbnRhdGlvbiB0aGF0IG9wZW5zIGVhY2ggc3ViYWdlbnQgaW4gaXRzIG93biBlZGl0b3IgaW5zdGVhZCBvZiByZW5kZXJpbmcgaXRzIGZ1bGwgYWN0aXZpdHkgaW5saW5lIGluIHRoZSBwYXJlbnQgY2hhdC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNvbGxlY3RJbnN0cnVjdGlvbnNJbkV4dGVuc2lvbl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmNvbGxlY3RJbnN0cnVjdGlvbnNJbkV4dGVuc2lvbicsIFwiV2hlbiBlbmFibGVkLCBhdXRvbWF0aWMgaW5zdHJ1Y3Rpb24gY29sbGVjdGlvbiAoLmluc3RydWN0aW9ucy5tZCwgYWdlbnQgaW5zdHJ1Y3Rpb25zLCBjdXN0b21pemF0aW9ucyBpbmRleCkgaXMgcGVyZm9ybWVkIGJ5IHRoZSBHaXRIdWIgQ29waWxvdCBDaGF0IGV4dGVuc2lvbiBpbnN0ZWFkIG9mIHRoZSBjb3JlIHdvcmtiZW5jaC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zU3RydWN0dXJlZFByZXZpZXdFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGFnczogWydwcmV2aWV3J10sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmN1c3RvbWl6YXRpb25zLnN0cnVjdHVyZWRQcmV2aWV3LmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIENoYXQgQ3VzdG9taXphdGlvbnMgZWRpdG9yIHNob3dzIGEgc3RydWN0dXJlZCBwcmV2aWV3IGZvciBtYXJrZG93biBjdXN0b21pemF0aW9uIGZpbGVzIChhZ2VudHMsIHNraWxscywgaW5zdHJ1Y3Rpb25zLCBwcm9tcHRzKS4gV2hlbiBkaXNhYmxlZCwgdGhlIGVkaXRvciBhbHdheXMgb3BlbnMgdGhlIHJhdyBtYXJrZG93biBpbiB0aGUgZW1iZWRkZWQgY29kZSBlZGl0b3IuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zUHJvbXB0TWlncmF0aW9uRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmN1c3RvbWl6YXRpb25zLnByb21wdE1pZ3JhdGlvbi5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIGVkaXRvciBvZmZlcnMgdG8gY29udmVydCBwcm9tcHQgZmlsZXMgaW50byBza2lsbHMgZm9yIGFnZW50LWhvc3QgaGFybmVzc2VzLCB3aGljaCBpZ25vcmUgcHJvbXB0IGZpbGVzLiBXaGVuIGRpc2FibGVkLCB0aGUgbWlncmF0aW9uIGNhcmQgYW5kIHNpZGViYXIgc2hvcnRjdXQgYXJlIGhpZGRlbi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNVc2VyRGF0YU1pZ3JhdGlvbkVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5jdXN0b21pemF0aW9ucy51c2VyRGF0YU1pZ3JhdGlvbi5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIGVkaXRvciBvZmZlcnMgdG8gbW92ZSBhZ2VudHMgYW5kIGluc3RydWN0aW9ucyBzdG9yZWQgaW4gdXNlciBkYXRhIHRvIHRoZSBhY3RpdmUgYWdlbnQtaG9zdCBoYXJuZXNzLCB3aGljaCBpZ25vcmVzIHRoZSB1c2VyIGRhdGEgbG9jYXRpb24uIFdoZW4gZGlzYWJsZWQsIHRoZSBtaWdyYXRpb24gY2FyZCBhbmQgc2lkZWJhciBzaG9ydGN1dCBhcmUgaGlkZGVuLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH1cblx0fVxufSk7XG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdENoYXRFZGl0b3IsXG5cdFx0Q2hhdEVkaXRvcklucHV0LkVkaXRvcklELFxuXHRcdG5scy5sb2NhbGl6ZSgnY2hhdCcsIFwiQ2hhdFwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKENoYXRFZGl0b3JJbnB1dClcblx0XVxuKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0Q2hhdERlYnVnRWRpdG9yLFxuXHRcdENoYXREZWJ1Z0VkaXRvcklucHV0LklELFxuXHRcdG5scy5sb2NhbGl6ZSgnY2hhdERlYnVnJywgXCJEZWJ1ZyBWaWV3XCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdERlYnVnRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEFnZW50UGx1Z2luRWRpdG9yLFxuXHRcdEFnZW50UGx1Z2luRWRpdG9yLklELFxuXHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRQbHVnaW4nLCBcIkFnZW50IFBsdWdpblwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKEFnZW50UGx1Z2luRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5mdW5jdGlvbiBpc1N0cmluZ0tleWVkT2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRyZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gbWlncmF0ZUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbih2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpc1N0cmluZ0tleWVkT2JqZWN0KHZhbHVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0bGV0IGFwcHJvdmFsczogQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWw7XG5cdHN3aXRjaCAodmFsdWUuYXBwcm92YWxzKSB7XG5cdFx0Y2FzZSBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ6XG5cdFx0XHRhcHByb3ZhbHMgPSBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5NYW51YWw7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmU6XG5cdFx0XHRhcHByb3ZhbHMgPSBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5BbGxvd0FsbDtcblx0XHRcdGJyZWFrO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IC4uLnZhbHVlLCBhcHByb3ZhbHMgfTtcbn1cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFtcblx0e1xuXHRcdGtleTogJ2NoYXQuYWdlbnRTZXNzaW9ucy5kZWZhdWx0Q29uZmlndXJhdGlvbicsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIF9hY2Nlc3NvcikgPT4gKFtcblx0XHRcdFsnY2hhdC5hZ2VudFNlc3Npb25zLmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRDb25maWd1cmF0aW9uLCB7IHZhbHVlOiBtaWdyYXRlQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uKHZhbHVlKSA/PyB2YWx1ZSB9XVxuXHRcdF0pXG5cdH0sXG5cdHtcblx0XHRrZXk6IENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRDb25maWd1cmF0aW9uLFxuXHRcdG1pZ3JhdGVGbjogdmFsdWUgPT4gKHsgdmFsdWU6IG1pZ3JhdGVDaGF0RGVmYXVsdENvbmZpZ3VyYXRpb24odmFsdWUpID8/IHZhbHVlIH0pXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0LmV4cGVyaW1lbnRhbC5hdXRvQXBwcm92YWxzLmVuYWJsZWQnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgcGFpcnM6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW1snY2hhdC5leHBlcmltZW50YWwuYXV0b0FwcHJvdmFscy5lbmFibGVkJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXTtcblx0XHRcdGlmIChhY2Nlc3NvcihDaGF0Q29uZmlndXJhdGlvbi5Bc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYWlycy5wdXNoKFtDaGF0Q29uZmlndXJhdGlvbi5Bc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZCwgeyB2YWx1ZSB9XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFpcnM7XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIF9hY2Nlc3NvcikgPT4gKFtcblx0XHRcdFsnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSxcblx0XHRcdFsnY2hhdC5kZXRlY3RQYXJ0aWNpcGFudC5lbmFibGVkJywgeyB2YWx1ZTogdmFsdWUgIT09IGZhbHNlIH1dXG5cdFx0XSlcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQudXNlQ29waWxvdE1vZGVsc0ZvclV0aWxpdHlNb2RlbHMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlOiB1bmtub3duLCB2YWx1ZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW1snY2hhdC51c2VDb3BpbG90TW9kZWxzRm9yVXRpbGl0eU1vZGVscycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XV07XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgJiYgdmFsdWVBY2Nlc3NvcihDaGF0Q29uZmlndXJhdGlvbi5CWU9LVXRpbGl0eU1vZGVsRGVmYXVsdCkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbQ2hhdENvbmZpZ3VyYXRpb24uQllPS1V0aWxpdHlNb2RlbERlZmF1bHQsIHsgdmFsdWU6IHZhbHVlID8gQllPS1V0aWxpdHlNb2RlbERlZmF1bHQuQ29waWxvdCA6IEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0Lk5vbmUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0LnVzZUNsYXVkZVNraWxscycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIF9hY2Nlc3NvcikgPT4gKFtcblx0XHRcdFsnY2hhdC51c2VDbGF1ZGVTa2lsbHMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRbJ2NoYXQudXNlQWdlbnRTa2lsbHMnLCB7IHZhbHVlIH1dXG5cdFx0XSlcblx0fSxcblx0e1xuXHRcdGtleTogbWNwRGlzY292ZXJ5U2VjdGlvbixcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlOiBPYmplY3QuZnJvbUVudHJpZXMoYWxsRGlzY292ZXJ5U291cmNlcy5tYXAoayA9PiBbaywgdmFsdWVdKSkgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgdmFsdWUgfTtcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRrZXk6IENoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uQ29uZmlybWF0aW9uLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IENoYXROb3RpZmljYXRpb25Nb2RlLldpbmRvd05vdEZvY3VzZWQgfTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlOiBDaGF0Tm90aWZpY2F0aW9uTW9kZS5PZmYgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRrZXk6IENoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZCxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlOiBDaGF0Tm90aWZpY2F0aW9uTW9kZS5XaW5kb3dOb3RGb2N1c2VkIH07XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBmYWxzZSkge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogQ2hhdE5vdGlmaWNhdGlvbk1vZGUuT2ZmIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC5wbHVnaW5zLnBhdGhzJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93biwgX2FjY2Vzc29yKSA9PiAoW1xuXHRcdFx0WydjaGF0LnBsdWdpbnMucGF0aHMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTG9jYXRpb25zLCB7IHZhbHVlIH1dXG5cdFx0XSlcblx0fSxcblx0e1xuXHRcdC8vIFRoZSBvbi1kZXZpY2UgZGljdGF0aW9uIHJ1bnRpbWUgbW92ZWQgdG8gRm91bmRyeSBMb2NhbDsgdGhlIG9sZFxuXHRcdC8vIHRyYW5zZm9ybWVycy5qcy9vbm54cnVudGltZSBtb2RlbCBJRHMgbm8gbG9uZ2VyIHJlc29sdmUgYW5kIHdvdWxkIGZhaWxcblx0XHQvLyB3aXRoIGFuIHVua25vd24tbW9kZWwgZXJyb3IuIE1hcCBhbnkgZXhwbGljaXRseS1zdG9yZWQgbGVnYWN5IHZhbHVlIHRvXG5cdFx0Ly8gdGhlIG5ldyBkZWZhdWx0IHNvIGV4aXN0aW5nIHVzZXJzIGtlZXAgd29ya2luZy4gQWxzbyBtaWdyYXRlIHRoZSBzZXR0aW5nXG5cdFx0Ly8gZnJvbSBpdHMgb2xkIGBjaGF0LnNwZWVjaFRvVGV4dC5tb2RlbGAgaWQgdG8gYGRpY3RhdGlvbi5tb2RlbGAuXG5cdFx0a2V5OiAnY2hhdC5zcGVlY2hUb1RleHQubW9kZWwnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlOiB1bmtub3duLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgbGVnYWN5TW9kZWxJZHMgPSBbXG5cdFx0XHRcdCdvbm54LWNvbW11bml0eS93aGlzcGVyLXRpbnknLFxuXHRcdFx0XHQnb25ueC1jb21tdW5pdHkvd2hpc3Blci1iYXNlJyxcblx0XHRcdFx0J29ubngtY29tbXVuaXR5L3doaXNwZXItc21hbGwnLFxuXHRcdFx0XHQnb25ueC1jb21tdW5pdHkvbmVtb3Ryb24tMy41LWFzci1zdHJlYW1pbmctMC42Yi1vbm54LWludDQnLFxuXHRcdFx0XHQnbmVtb3Ryb24tc3BlZWNoLXN0cmVhbWluZy1lbi0wLjZiJyxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtaWdyYXRlZCA9ICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIGxlZ2FjeU1vZGVsSWRzLmluY2x1ZGVzKHZhbHVlKSlcblx0XHRcdFx0PyBERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUxcblx0XHRcdFx0OiB2YWx1ZTtcblx0XHRcdGNvbnN0IHBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbJ2NoYXQuc3BlZWNoVG9UZXh0Lm1vZGVsJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXTtcblx0XHRcdC8vIE5ldmVyIGNsb2JiZXIgYW4gZXhwbGljaXRseSBjb25maWd1cmVkIG5ldyBrZXkgKGUuZy4gYWZ0ZXIgc2V0dGluZ3Ncblx0XHRcdC8vIHN5bmMgYnJvdWdodCBib3RoIGtleXMgYWNyb3NzIHZlcnNpb25zKS5cblx0XHRcdGlmIChhY2Nlc3NvcignZGljdGF0aW9uLm1vZGVsJykgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYWlycy5wdXNoKFsnZGljdGF0aW9uLm1vZGVsJywgeyB2YWx1ZTogbWlncmF0ZWQgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhaXJzO1xuXHRcdH1cblx0fSxcblx0e1xuXHRcdC8vIEV4aXN0aW5nIHVzZXJzIG1heSBoYXZlIHRoZSBmb3JtZXIgRW5nbGlzaC1vbmx5IGRlZmF1bHQgc3RvcmVkXG5cdFx0Ly8gZXhwbGljaXRseS4gTW92ZSB0aGVtIHRvIHRoZSBtdWx0aWxpbmd1YWwgcmVwbGFjZW1lbnQgYXMgd2VsbC5cblx0XHRrZXk6ICdkaWN0YXRpb24ubW9kZWwnLFxuXHRcdG1pZ3JhdGVGbjogdmFsdWUgPT4gKHtcblx0XHRcdHZhbHVlOiB2YWx1ZSA9PT0gJ25lbW90cm9uLXNwZWVjaC1zdHJlYW1pbmctZW4tMC42Yidcblx0XHRcdFx0PyBERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUxcblx0XHRcdFx0OiB2YWx1ZVxuXHRcdH0pXG5cdH0sXG5cdHtcblx0XHQvLyBEaWN0YXRpb24gc2V0dGluZ3Mgd2VyZSByZWdyb3VwZWQgdW5kZXIgdGhlIHRvcC1sZXZlbCBgZGljdGF0aW9uLipgXG5cdFx0Ly8gbmFtZXNwYWNlICh0aGV5IGdvdmVybiBkaWN0YXRpb24gYWNyb3NzIGNoYXQsIGVkaXRvciwgYW5kIHRlcm1pbmFsKS5cblx0XHRrZXk6ICdjaGF0LnNwZWVjaFRvVGV4dC5lbmFibGVkJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93biwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IHBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbJ2NoYXQuc3BlZWNoVG9UZXh0LmVuYWJsZWQnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1dO1xuXHRcdFx0aWYgKGFjY2Vzc29yKCdkaWN0YXRpb24uZW5hYmxlZCcpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFpcnMucHVzaChbJ2RpY3RhdGlvbi5lbmFibGVkJywgeyB2YWx1ZSB9XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFpcnM7XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0Ly8gYGNoYXQuc3BlZWNoVG9UZXh0Lm1vZGVgIHdhcyByZW1vdmVkICh0aGUgc2hvcnRjdXQgaXMgYWx3YXlzIHRhcC10b2dnbGUgL1xuXHRcdC8vIGhvbGQtdG8tdGFsayk7IGNsZWFyIGl0IHNvIGl0IGRvZXMgbm90IGxpbmdlciBhcyBhbiB1bmtub3duIHNldHRpbmcuXG5cdFx0a2V5OiAnY2hhdC5zcGVlY2hUb1RleHQubW9kZScsXG5cdFx0bWlncmF0ZUZuOiAoKSA9PiAoW1snY2hhdC5zcGVlY2hUb1RleHQubW9kZScsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XV0pXG5cdH0sXG5dKTtcblxuY2xhc3MgQ2hhdFJlc29sdmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRSZXNvbHZlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJFZGl0b3IoU2NoZW1hcy52c2NvZGVDaGF0RWRpdG9yKTtcblx0XHR0aGlzLl9yZWdpc3RlckVkaXRvcihTY2hlbWFzLnZzY29kZUxvY2FsQ2hhdFNlc3Npb24pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENoYW5nZUNvbnRlbnRQcm92aWRlclNjaGVtZXMoKGUpID0+IHtcblx0XHRcdGZvciAoY29uc3Qgc2NoZW1lIG9mIGUuYWRkZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJFZGl0b3Ioc2NoZW1lKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgc2NoZW1lIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2NoZW1lKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENvbnRlbnRQcm92aWRlclNjaGVtZXMoKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJFZGl0b3Ioc2NoZW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckVkaXRvcihzY2hlbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvclJlZ2lzdHJhdGlvbnMuc2V0KHNjaGVtZSwgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoYCR7c2NoZW1lfToqKi8qKmAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NoYXQnLCBcIkNoYXRcIiksXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpblxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6IHRydWUsXG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogcmVzb3VyY2UgPT4gcmVzb3VyY2Uuc2NoZW1lID09PSBzY2hlbWUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRvcklucHV0LCByZXNvdXJjZSwgb3B0aW9ucyBhcyBJQ2hhdEVkaXRvck9wdGlvbnMpLFxuXHRcdFx0XHRcdFx0b3B0aW9uc1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKTtcblx0fVxufVxuXG5jbGFzcyBDb3BpbG90VGVsZW1ldHJ5Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jb3BpbG90VGVsZW1ldHJ5JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudXBkYXRlQ29tbW9uUHJvcGVydGllcygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDb21tb25Qcm9wZXJ0aWVzKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21tb25Qcm9wZXJ0aWVzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvcGlsb3RUcmFja2luZ0lkID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmNvcGlsb3RUcmFja2luZ0lkO1xuXHRcdGlmIChjb3BpbG90VHJhY2tpbmdJZCkge1xuXHRcdFx0Ly8gX19HRFBSX19DT01NT05fXyBcImNvbW1vbi5jb3BpbG90VHJhY2tpbmdJZFwiIDogeyBcImVuZFBvaW50XCI6IFwiR29vZ2xlQW5hbHl0aWNzSURcIiwgXCJjbGFzc2lmaWNhdGlvblwiOiBcIkVuZFVzZXJQc2V1ZG9ueW1pemVkSW5mb3JtYXRpb25cIiwgXCJwdXJwb3NlXCI6IFwiQnVzaW5lc3NJbnNpZ2h0XCIsIFwiY29tbWVudFwiOiBcIlRoZSBhbm9ueW1pemVkIENvcGlsb3QgYW5hbHl0aWNzIHRyYWNraW5nIElEIGZyb20gdGhlIGVudGl0bGVtZW50IEFQSS5cIiB9XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2Uuc2V0Q29tbW9uUHJvcGVydHkoJ2NvbW1vbi5jb3BpbG90VHJhY2tpbmdJZCcsIGNvcGlsb3RUcmFja2luZ0lkKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmlzSW50ZXJuYWwpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5zZXRDb21tb25Qcm9wZXJ0eSgnY29tbW9uLm1zZnRJbnRlcm5hbCcsIHRydWUpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBDaGF0RGVidWdSZXNvbHZlckNvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0RGVidWdSZXNvbHZlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoXG5cdFx0XHRgJHtDaGF0RGVidWdFZGl0b3JJbnB1dC5SRVNPVVJDRS5zY2hlbWV9OioqLyoqYCxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IENoYXREZWJ1Z0VkaXRvcklucHV0LklELFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjaGF0RGVidWcnLCBcIkRlYnVnIFZpZXdcIiksXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogdHJ1ZSxcblx0XHRcdFx0Y2FuU3VwcG9ydFJlc291cmNlOiByZXNvdXJjZSA9PiByZXNvdXJjZS5zY2hlbWUgPT09IENoYXREZWJ1Z0VkaXRvcklucHV0LlJFU09VUkNFLnNjaGVtZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBDaGF0RGVidWdFZGl0b3JJbnB1dC5pbnN0YW5jZSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlIH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuXG5jbGFzcyBDaGF0QWdlbnRTZXR0aW5nQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0QWdlbnRTZXR0aW5nJztcblx0cHJpdmF0ZSByZWFkb25seSBuZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4cGVyaW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbiA9IENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucmVnaXN0ZXJNYXhSZXF1ZXN0c1NldHRpbmcoKTtcblx0XHR0aGlzLnJlZ2lzdGVyTmV3Q2hhdEJ1dHRvbkljb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyRGVmYXVsdE1vZGVTZXR0aW5nKCk7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVnaXN0ZXJNYXhSZXF1ZXN0c1NldHRpbmcoKTogdm9pZCB7XG5cdFx0bGV0IGxhc3ROb2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVnaXN0ZXJNYXhSZXF1ZXN0c1NldHRpbmcgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmVhdG1lbnRJZCA9IHRoaXMuZW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZSA/XG5cdFx0XHRcdCdjaGF0QWdlbnRNYXhSZXF1ZXN0c0ZyZWUnIDpcblx0XHRcdFx0J2NoYXRBZ2VudE1heFJlcXVlc3RzUHJvJztcblx0XHRcdHRoaXMuZXhwZXJpbWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PG51bWJlcj4odHJlYXRtZW50SWQpLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdFx0XHRpZDogJ2NoYXRTaWRlYmFyJyxcblx0XHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb25Db25maWd1cmF0aW9uVGl0bGUnLCBcIkNoYXRcIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0J2NoYXQuYWdlbnQubWF4UmVxdWVzdHMnOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQubWF4UmVxdWVzdHMnLCBcIlRoZSBtYXhpbXVtIG51bWJlciBvZiByZXF1ZXN0cyB0byBhbGxvdyBwZXItdHVybiB3aGVuIHVzaW5nIGFuIGFnZW50LiBXaGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLCB3aWxsIGFzayB0byBjb25maXJtIHRvIGNvbnRpbnVlLlwiKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogdmFsdWUgPz8gNTAsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHRcdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogMTAwMCB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS51cGRhdGVDb25maWd1cmF0aW9ucyh7IHJlbW92ZTogbGFzdE5vZGUgPyBbbGFzdE5vZGVdIDogW10sIGFkZDogW25vZGVdIH0pO1xuXHRcdFx0XHRsYXN0Tm9kZSA9IG5vZGU7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShFdmVudC5kZWJvdW5jZSh0aGlzLmVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50LCAoKSA9PiB7IH0sIDEwMDApLCAoKSA9PiByZWdpc3Rlck1heFJlcXVlc3RzU2V0dGluZygpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTmV3Q2hhdEJ1dHRvbkljb24oKTogdm9pZCB7XG5cdFx0dGhpcy5leHBlcmltZW50U2VydmljZS5nZXRUcmVhdG1lbnQ8c3RyaW5nPignY2hhdE5ld0J1dHRvbkljb24nKS50aGVuKCh2YWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydGVkVmFsdWVzID0gWydjb3BpbG90JywgJ25ldy1zZXNzaW9uJywgJ2NvbW1lbnQnXTtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnICYmIHN1cHBvcnRlZFZhbHVlcy5pbmNsdWRlcyh2YWx1ZSkpIHtcblx0XHRcdFx0dGhpcy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uc2V0KHZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyRGVmYXVsdE1vZGVTZXR0aW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuZXhwZXJpbWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PHN0cmluZz4oJ2NoYXREZWZhdWx0TmV3U2Vzc2lvbk1vZGUnKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdGNvbnN0IG5vZGU6IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0XHRcdFx0aWQ6ICdjaGF0U2lkZWJhcicsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2ludGVyYWN0aXZlU2Vzc2lvbkNvbmZpZ3VyYXRpb25UaXRsZScsIFwiQ2hhdFwiKSxcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE5ld1Nlc3Npb25Nb2RlXToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm5ld1Nlc3Npb24uZGVmYXVsdE1vZGUnLCBcIlRoZSBkZWZhdWx0IG1vZGUgZm9yIG5ldyBjaGF0IHNlc3Npb25zLiBXaGVuIGVtcHR5LCB0aGUgY2hhdCB2aWV3J3MgZGVmYXVsdCBtb2RlIGlzIHVzZWQuXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogJycsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnVwZGF0ZUNvbmZpZ3VyYXRpb25zKHsgYWRkOiBbbm9kZV0sIHJlbW92ZTogW10gfSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdEZvcmVncm91bmRTZXNzaW9uQ291bnRDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRGb3JlZ3JvdW5kU2Vzc2lvbkNvdW50JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZvcmVncm91bmRTZXNzaW9uQ291bnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQWRkV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRm9yZWdyb3VuZFNlc3Npb25Db3VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VXaWRnZXRWaXNpYmlsaXR5KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRm9yZWdyb3VuZFNlc3Npb25Db3VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLnZpZXdzU2VydmljZS5vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5LCBlID0+IGUuaWQgPT09IENoYXRWaWV3SWQpKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRm9yZWdyb3VuZFNlc3Npb25Db3VudCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlRm9yZWdyb3VuZFNlc3Npb25Db3VudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGb3JlZ3JvdW5kU2Vzc2lvbkNvdW50KCk6IHZvaWQge1xuXHRcdGxldCBjb3VudCA9IHRoaXMudmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoQ2hhdFZpZXdJZCkgPyAxIDogMDtcblxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0c0J5TG9jYXRpb25zKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSB7XG5cdFx0XHRpZiAoIXdpZGdldC52aXNpYmxlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNJQ2hhdFJlc291cmNlVmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSAmJiB3aWRnZXQudmlld0NvbnRleHQuaXNRdWlja0NoYXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvdW50Kys7XG5cdFx0fVxuXG5cdFx0dGhpcy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udGV4dEtleS5zZXQoY291bnQpO1xuXHR9XG59XG5cblxuLyoqXG4gKiBHaXZlbiBidWlsdGluIGFuZCBjdXN0b20gbW9kZXMsIHJldHVybnMgb25seSB0aGUgY3VzdG9tIG1vZGUgSURzIHRoYXQgc2hvdWxkIGhhdmUgYWN0aW9ucyByZWdpc3RlcmVkLlxuICogQ3VzdG9tIG1vZGVzIHdob3NlIG5hbWVzIGNvbmZsaWN0IHdpdGggYnVpbHRpbiBtb2RlcyBhcmUgZXhjbHVkZWQuXG4gKiBJZiB0aGVyZSBhcmUgbmFtZSBjb2xsaXNpb25zIGFtb25nIGN1c3RvbSBtb2RlcywgdGhlIGxhdGVyIG1vZGUgaW4gdGhlIGxpc3Qgd2lucy5cbiAqL1xuZnVuY3Rpb24gZ2V0Q3VzdG9tTW9kZXNXaXRoVW5pcXVlTmFtZXMoYnVpbHRpbk1vZGVzOiByZWFkb25seSBJQ2hhdE1vZGVbXSwgY3VzdG9tTW9kZXM6IHJlYWRvbmx5IElDaGF0TW9kZVtdKTogU2V0PHN0cmluZz4ge1xuXHRjb25zdCBjdXN0b21Nb2RlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGJ1aWx0aW5OYW1lcyA9IG5ldyBTZXQoYnVpbHRpbk1vZGVzLm1hcChtb2RlID0+IG1vZGUubmFtZS5nZXQoKSkpO1xuXHRjb25zdCBjdXN0b21OYW1lVG9JZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Zm9yIChjb25zdCBtb2RlIG9mIGN1c3RvbU1vZGVzKSB7XG5cdFx0Y29uc3QgbW9kZU5hbWUgPSBtb2RlLm5hbWUuZ2V0KCk7XG5cblx0XHQvLyBTa2lwIGN1c3RvbSBtb2RlcyB0aGF0IGNvbmZsaWN0IHdpdGggYnVpbHRpbiBtb2RlIG5hbWVzXG5cdFx0aWYgKGJ1aWx0aW5OYW1lcy5oYXMobW9kZU5hbWUpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBhIG5hbWUgY29sbGlzaW9uIGFtb25nIGN1c3RvbSBtb2RlcywgdGhlIGxhdGVyIG9uZSBpbiB0aGUgbGlzdCB3aW5zXG5cdFx0Y29uc3QgZXhpc3RpbmdJZCA9IGN1c3RvbU5hbWVUb0lkLmdldChtb2RlTmFtZSk7XG5cdFx0aWYgKGV4aXN0aW5nSWQpIHtcblx0XHRcdGN1c3RvbU1vZGVJZHMuZGVsZXRlKGV4aXN0aW5nSWQpO1xuXHRcdH1cblxuXHRcdGN1c3RvbU5hbWVUb0lkLnNldChtb2RlTmFtZSwgbW9kZS5pZCk7XG5cdFx0Y3VzdG9tTW9kZUlkcy5hZGQobW9kZS5pZCk7XG5cdH1cblxuXHRyZXR1cm4gY3VzdG9tTW9kZUlkcztcbn1cblxuLyoqXG4gKiBXb3JrYmVuY2ggY29udHJpYnV0aW9uIHRvIHJlZ2lzdGVyIGFjdGlvbnMgZm9yIGN1c3RvbSBjaGF0IG1vZGVzIHZpYSBldmVudHNcbiAqL1xuY2xhc3MgQ2hhdEFnZW50QWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdEFnZW50QWN0aW9ucyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZUFjdGlvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIF9jaGF0TW9kZVNlcnZpY2U6IElDaGF0TW9kZVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX21vZGVBY3Rpb25EaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBmb2N1c2VkV2lkZ2V0ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24sICgpID0+IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNoYXRNb2RlcyA9IGZvY3VzZWRXaWRnZXQucmVhZChyZWFkZXIpPy5pbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3N5bmNNb2RlQWN0aW9ucyhjaGF0TW9kZXMpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNNb2RlQWN0aW9ucyhjaGF0TW9kZXM6IElDaGF0TW9kZXMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWNoYXRNb2Rlcykge1xuXHRcdFx0dGhpcy5fbW9kZUFjdGlvbkRpc3Bvc2FibGVzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgYnVpbHRpbiwgY3VzdG9tIH0gPSBjaGF0TW9kZXM7XG5cdFx0Y29uc3QgY3VycmVudE1vZGVJZHMgPSBnZXRDdXN0b21Nb2Rlc1dpdGhVbmlxdWVOYW1lcyhidWlsdGluLCBjdXN0b20pO1xuXG5cdFx0Ly8gUmVtb3ZlIG1vZGVzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IGFuZCB0aG9zZSByZXBsYWNlZCBieSBtb2RlcyBsYXRlciBpbiB0aGUgbGlzdCB3aXRoIHNhbWUgbmFtZS5cblx0XHRmb3IgKGNvbnN0IG1vZGVJZCBvZiB0aGlzLl9tb2RlQWN0aW9uRGlzcG9zYWJsZXMua2V5cygpKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRNb2RlSWRzLmhhcyhtb2RlSWQpKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVBY3Rpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKG1vZGVJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVnaXN0ZXIgbmV3IG1vZGVzLlxuXHRcdGZvciAoY29uc3QgbW9kZSBvZiBjdXN0b20pIHtcblx0XHRcdGlmIChjdXJyZW50TW9kZUlkcy5oYXMobW9kZS5pZCkgJiYgIXRoaXMuX21vZGVBY3Rpb25EaXNwb3NhYmxlcy5oYXMobW9kZS5pZCkpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJNb2RlQWN0aW9uKG1vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTW9kZUFjdGlvbihtb2RlOiBJQ2hhdE1vZGUpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25DbGFzcyA9IGNsYXNzIGV4dGVuZHMgTW9kZU9wZW5DaGF0R2xvYmFsQWN0aW9uIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihtb2RlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX21vZGVBY3Rpb25EaXNwb3NhYmxlcy5zZXQobW9kZS5pZCwgcmVnaXN0ZXJBY3Rpb24yKGFjdGlvbkNsYXNzKSk7XG5cdH1cbn1cblxuY2xhc3MgSG9va1NjaGVtYUFzc29jaWF0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5ob29rU2NoZW1hQXNzb2NpYXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdXBkYXRlQXNzb2NpYXRpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5IT09LU19MT0NBVElPTl9LRVkpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUFzc29jaWF0aW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUFzc29jaWF0aW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLmNsZWFyKCk7XG5cblx0XHRjb25zdCBmb2xkZXJzID0gUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRjb25zdCB1c2VySG9tZVVyaSA9IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB1c2VySG9tZVVyaS5mc1BhdGggPz8gdXNlckhvbWVVcmkucGF0aDtcblxuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGZvbGRlcnMpIHtcblx0XHRcdC8vIFNraXAgQ2xhdWRlIHNldHRpbmdzIGZpbGVzIFx1MjAxNCB0aGV5IHVzZSBhIGRpZmZlcmVudCBzY2hlbWEgZm9ybWF0XG5cdFx0XHRpZiAoZm9sZGVyLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2UgfHwgZm9sZGVyLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2VMb2NhbCB8fCBmb2xkZXIuc291cmNlID09PSBQcm9tcHRGaWxlU291cmNlLkNsYXVkZVBlcnNvbmFsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFeHBhbmQgdGlsZGUgcGF0aHMgdG8gYWJzb2x1dGUgcGF0aHMgc28gdGhlIEpTT04gbGFuZ3VhZ2Ugc2VydmljZSBjYW4gbWF0Y2ggdGhlbVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRQYXRoID0gaXNUaWxkZVBhdGgoZm9sZGVyLnBhdGgpXG5cdFx0XHRcdD8gdXNlckhvbWUgKyBmb2xkZXIucGF0aC5zdWJzdHJpbmcoMSlcblx0XHRcdFx0OiBmb2xkZXIucGF0aDtcblxuXHRcdFx0Ly8gSWYgaXQncyBhIHNwZWNpZmljIC5qc29uIGZpbGUsIHVzZSBpdCBkaXJlY3RseTsgb3RoZXJ3aXNlIHRyZWF0IGFzIGRpcmVjdG9yeVxuXHRcdFx0Y29uc3QgZ2xvYiA9IHJlc29sdmVkUGF0aC50b0xvd2VyQ2FzZSgpLmVuZHNXaXRoKCcuanNvbicpXG5cdFx0XHRcdD8gcmVzb2x2ZWRQYXRoXG5cdFx0XHRcdDogYCR7cmVzb2x2ZWRQYXRofS8qLmpzb25gO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLmFkZChcblx0XHRcdFx0anNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hQXNzb2NpYXRpb24oSE9PS19TQ0hFTUFfVVJJLCBnbG9iKVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVG9vbFJlZmVyZW5jZU5hbWVzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50b29sUmVmZXJlbmNlTmFtZXMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl91cGRhdGVUb29sUmVmZXJlbmNlTmFtZXMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlVG9vbHMoKCkgPT4gdGhpcy5fdXBkYXRlVG9vbFJlZmVyZW5jZU5hbWVzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRvb2xSZWZlcmVuY2VOYW1lcygpOiB2b2lkIHtcblx0XHRjb25zdCB0b29scyA9XG5cdFx0XHRBcnJheS5mcm9tKHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0QWxsVG9vbHNJbmNsdWRpbmdEaXNhYmxlZCgpKVxuXHRcdFx0XHQuZmlsdGVyKCh0b29sKTogdG9vbCBpcyB0eXBlb2YgdG9vbCAmIHsgdG9vbFJlZmVyZW5jZU5hbWU6IHN0cmluZyB9ID0+IHR5cGVvZiB0b29sLnRvb2xSZWZlcmVuY2VOYW1lID09PSAnc3RyaW5nJylcblx0XHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudG9vbFJlZmVyZW5jZU5hbWUubG9jYWxlQ29tcGFyZShiLnRvb2xSZWZlcmVuY2VOYW1lKSk7XG5cdFx0dG9vbFJlZmVyZW5jZU5hbWVFbnVtVmFsdWVzLmxlbmd0aCA9IDA7XG5cdFx0dG9vbFJlZmVyZW5jZU5hbWVFbnVtRGVzY3JpcHRpb25zLmxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzKSB7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZUVudW1WYWx1ZXMucHVzaCh0b29sLnRvb2xSZWZlcmVuY2VOYW1lKTtcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lRW51bURlc2NyaXB0aW9ucy5wdXNoKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQudG9vbFJlZmVyZW5jZU5hbWUuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcInswfSAtIHsxfVwiLFxuXHRcdFx0XHR0b29sLnRvb2xSZWZlcmVuY2VOYW1lLFxuXHRcdFx0XHR0b29sLnVzZXJEZXNjcmlwdGlvbiB8fCB0b29sLmRpc3BsYXlOYW1lXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5Lm5vdGlmeUNvbmZpZ3VyYXRpb25TY2hlbWFVcGRhdGVkKHtcblx0XHRcdGlkOiAnY2hhdFNpZGViYXInLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRWxpZ2libGVGb3JBdXRvQXBwcm92YWxdOiB7fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogRm9yY2VzIHRoZSBlYWdlciB7QGxpbmsgQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2V9IHRvIGluc3RhbnRpYXRlIGF0IHN0YXJ0dXAgc29cbiAqIGl0IGNhbiBwdWJsaXNoIHRoZSBgY2hhdFNwZWVjaFRvVGV4dENvbmZpZ3VyZWRgIGNvbnRleHQga2V5IHRoYXQgZ2F0ZXMgdGhlXG4gKiBkaWN0YXRpb24gKG1pYykgYnV0dG9uLiBSZWdpc3RlcmVkIHNpbmdsZXRvbnMgYXJlIGNyZWF0ZWQgbGF6aWx5IG9uIGZpcnN0XG4gKiBhY2Nlc3MsIHNvIHdpdGhvdXQgdGhpcyB0aGUga2V5IHdvdWxkIG5ldmVyIGJlIHNldCBhbmQgdGhlIGJ1dHRvbiBuZXZlciBzaG93cy5cbiAqL1xuY2xhc3MgQ2hhdFNwZWVjaFRvVGV4dEluaXRDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFNwZWVjaFRvVGV4dEluaXQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgX2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlOiBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIEluamVjdGluZyB0aGUgc2VydmljZSBpcyBlbm91Z2ggdG8gY29uc3RydWN0IGl0LlxuXHR9XG59XG5cbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IENoYXRUZXJtaW5hbE91dHB1dEFjY2Vzc2libGVWaWV3KCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVZpZXcoKSk7XG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBQYW5lbENoYXRBY2Nlc3NpYmlsaXR5SGVscCgpKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IFF1aWNrQ2hhdEFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgRWRpdHNDaGF0QWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBBZ2VudENoYXRBY2Nlc3NpYmlsaXR5SGVscCgpKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IENoYXRJbnB1dFdpbmRvd0FjY2Vzc2liaWxpdHlIZWxwKCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgQ2hhdEZpbmRBY2Nlc3NpYmlsaXR5SGVscCgpKTtcblxucmVnaXN0ZXJFZGl0b3JGZWF0dXJlKENoYXRJbnB1dEJveENvbnRlbnRQcm92aWRlcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihDaGF0RWRpdG9ySW5wdXQuVHlwZUlELCBDaGF0RWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKENoYXREZWJ1Z0VkaXRvcklucHV0LklELCBDaGF0RGVidWdFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ29waWxvdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbi5JRCwgQ29waWxvdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0U3BlZWNoVG9UZXh0SW5pdENvbnRyaWJ1dGlvbi5JRCwgQ2hhdFNwZWVjaFRvVGV4dEluaXRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFJlc29sdmVyQ29udHJpYnV0aW9uLklELCBDaGF0UmVzb2x2ZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdERlYnVnUmVzb2x2ZXJDb250cmlidXRpb24uSUQsIENoYXREZWJ1Z1Jlc29sdmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5JRCwgUHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEFnZW50SG9zdENoYXREZWJ1Z0NvbnRyaWJ1dGlvbi5JRCwgQWdlbnRIb3N0Q2hhdERlYnVnQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRMYW5ndWFnZU1vZGVsc0RhdGFDb250cmlidXRpb24uSUQsIENoYXRMYW5ndWFnZU1vZGVsc0RhdGFDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFNsYXNoQ29tbWFuZHNDb250cmlidXRpb24uSUQsIENoYXRTbGFzaENvbW1hbmRzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0U2Vzc2lvbk9wdGlvblNsYXNoQ29tbWFuZHNDb250cmlidXRpb24uSUQsIENoYXRTZXNzaW9uT3B0aW9uU2xhc2hDb21tYW5kc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdE91dGxpbmVDcmVhdG9yLklELCBDaGF0T3V0bGluZUNyZWF0b3IsIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEV4dGVuc2lvblBvaW50SGFuZGxlci5JRCwgQ2hhdEV4dGVuc2lvblBvaW50SGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihMYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludEhhbmRsZXIuSUQsIExhbmd1YWdlTW9kZWxUb29sc0V4dGVuc2lvblBvaW50SGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0UHJvbXB0RmlsZXNFeHRlbnNpb25Qb2ludEhhbmRsZXIuSUQsIENoYXRQcm9tcHRGaWxlc0V4dGVuc2lvblBvaW50SGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0Q29tcGF0aWJpbGl0eU5vdGlmaWVyLklELCBDaGF0Q29tcGF0aWJpbGl0eU5vdGlmaWVyLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDb2RlQmxvY2tBY3Rpb25SZW5kZXJpbmcuSUQsIENvZGVCbG9ja0FjdGlvblJlbmRlcmluZywgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0Q29weUFjdGlvblJlbmRlcmluZy5JRCwgQ2hhdENvcHlBY3Rpb25SZW5kZXJpbmcsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEltcGxpY2l0Q29udGV4dENvbnRyaWJ1dGlvbi5JRCwgQ2hhdEltcGxpY2l0Q29udGV4dENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFZpZXdzV2VsY29tZUhhbmRsZXIuSUQsIENoYXRWaWV3c1dlbGNvbWVIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRHZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbi5JRCwgQ2hhdEdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0U2V0dXBDb250cmlidXRpb24uSUQsIENoYXRTZXR1cENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24uSUQsIENoYXRRdW90YU5vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uLklELCBDaGF0UHJvbW9Ob3RpZmljYXRpb25Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEhhc0J5b2tNb2RlbHNDb250cmlidXRpb24uSUQsIEhhc0J5b2tNb2RlbHNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFRlYXJkb3duQ29udHJpYnV0aW9uLklELCBDaGF0VGVhcmRvd25Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRTdGF0dXNCYXJFbnRyeS5JRCwgQ2hhdFN0YXR1c0JhckVudHJ5LCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEJ1aWx0aW5Ub29sc0NvbnRyaWJ1dGlvbi5JRCwgQnVpbHRpblRvb2xzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbi5JRCwgQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFVzYWdlc1Rvb2xDb250cmlidXRpb24uSUQsIFVzYWdlc1Rvb2xDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVuYW1lVG9vbENvbnRyaWJ1dGlvbi5JRCwgUmVuYW1lVG9vbENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0QWdlbnRTZXR0aW5nQ29udHJpYnV0aW9uLklELCBDaGF0QWdlbnRTZXR0aW5nQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0Rm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRyaWJ1dGlvbi5JRCwgQ2hhdEZvcmVncm91bmRTZXNzaW9uQ291bnRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRBZ2VudEFjdGlvbnNDb250cmlidXRpb24uSUQsIENoYXRBZ2VudEFjdGlvbnNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEhvb2tTY2hlbWFBc3NvY2lhdGlvbkNvbnRyaWJ1dGlvbi5JRCwgSG9va1NjaGVtYUFzc29jaWF0aW9uQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihUb29sUmVmZXJlbmNlTmFtZXNDb250cmlidXRpb24uSUQsIFRvb2xSZWZlcmVuY2VOYW1lc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEFnZW50UmVjb21tZW5kYXRpb24uSUQsIENoYXRBZ2VudFJlY29tbWVuZGF0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0RWRpdGluZ0VkaXRvckFjY2Vzc2liaWxpdHkuSUQsIENoYXRFZGl0aW5nRWRpdG9yQWNjZXNzaWJpbGl0eSwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFF1ZXVlUGlja2VyUmVuZGVyaW5nLklELCBDaGF0UXVldWVQaWNrZXJSZW5kZXJpbmcsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEVkaXRpbmdFZGl0b3JPdmVybGF5LklELCBDaGF0RWRpdGluZ0VkaXRvck92ZXJsYXksIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRFZGl0aW5nRWRpdG9yQ29udGV4dEtleXMuSUQsIENoYXRFZGl0aW5nRWRpdG9yQ29udGV4dEtleXMsIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRUcmFuc2ZlckNvbnRyaWJ1dGlvbi5JRCwgQ2hhdFRyYW5zZmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRDb250ZXh0Q29udHJpYnV0aW9ucy5JRCwgQ2hhdENvbnRleHRDb250cmlidXRpb25zLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihQcm9tcHRVcmxIYW5kbGVyLklELCBQcm9tcHRVcmxIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFBsdWdpblVybEhhbmRsZXIuSUQsIFBsdWdpblVybEhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEVkaXRpbmdOb3RlYm9va0ZpbGVTeXN0ZW1Qcm92aWRlckNvbnRyaWIuSUQsIENoYXRFZGl0aW5nTm90ZWJvb2tGaWxlU3lzdGVtUHJvdmlkZXJDb250cmliLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRSZXNwb25zZVJlc291cmNlV29ya2JlbmNoQ29udHJpYnV0aW9uLklELCBDaGF0UmVzcG9uc2VSZXNvdXJjZVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoVXNlclRvb2xTZXRzQ29udHJpYnV0aW9ucy5JRCwgVXNlclRvb2xTZXRzQ29udHJpYnV0aW9ucywgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUHJvbXB0TGFuZ3VhZ2VGZWF0dXJlc1Byb3ZpZGVyLklELCBQcm9tcHRMYW5ndWFnZUZlYXR1cmVzUHJvdmlkZXIsIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRXaW5kb3dOb3RpZmllci5JRCwgQ2hhdFdpbmRvd05vdGlmaWVyLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0UmVwb0luZm9Db250cmlidXRpb24uSUQsIENoYXRSZXBvSW5mb0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRQbHVnaW5SZWNvbW1lbmRhdGlvbnMuSUQsIEFnZW50UGx1Z2luUmVjb21tZW5kYXRpb25zLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBZ2VudFBsdWdpbkNvbW1hbmRzQ29udHJpYnV0aW9uLklELCBBZ2VudFBsdWdpbkNvbW1hbmRzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihQbHVnaW5BdXRvVXBkYXRlLklELCBQbHVnaW5BdXRvVXBkYXRlLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0UmVmZXJlbmNlQXR0YWNobWVudFdpZGdldENvbnRyaWJ1dGlvbi5JRCwgQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFRyYW5zY3JpcHRDb250ZXh0QXR0YWNobWVudFdpZGdldENvbnRyaWJ1dGlvbi5JRCwgVHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50V2lkZ2V0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJDaGF0QWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0QWNjZXNzaWJpbGl0eUFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdENvcHlBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRPcGVuQWdlbnREZWJ1Z1BhbmVsQWN0aW9uKCk7XG5yZWdpc3RlckNoYXRDb2RlQmxvY2tBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRDb2RlQ29tcGFyZUJsb2NrQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RmlsZVRyZWVBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRQcm9tcHROYXZpZ2F0aW9uQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0VGl0bGVBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RmluZEFjdGlvbnMoKTtcbnJlZ2lzdGVyQWN0aW9uMihDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbik7XG5yZWdpc3RlclZvaWNlSW5wdXRNb2RlU2ltdWxhdGVBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRTcGVlY2hUb1RleHRBY3Rpb25zKCk7XG5yZWdpc3RlckNvbmZpZ3VyZVNwZWVjaEluc3RydWN0aW9uc0FjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdFF1ZXVlQWN0aW9ucygpO1xucmVnaXN0ZXJRdWlja0NoYXRBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRFeHBvcnRBY3Rpb25zKCk7XG5yZWdpc3Rlck1vdmVBY3Rpb25zKCk7XG5yZWdpc3Rlck5ld0NoYXRBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRDb250ZXh0QWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RGV2ZWxvcGVyQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RWRpdG9yQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RWxpY2l0YXRpb25BY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRUb29sQWN0aW9ucygpO1xucmVnaXN0ZXJMYW5ndWFnZU1vZGVsQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0UGx1Z2luQWN0aW9ucygpO1xucmVnaXN0ZXJBY3Rpb24yKENvbmZpZ3VyZVRvb2xTZXRzKTtcbnJlZ2lzdGVyRWRpdG9yRmVhdHVyZShDaGF0UGFzdGVQcm92aWRlcnNGZWF0dXJlKTtcblxuYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeS5yZWdpc3RlcihuZXcgU3luY0Rlc2NyaXB0b3IoQ29uZmlndXJlZEFnZW50UGx1Z2luRGlzY292ZXJ5KSwgQWdlbnRQbHVnaW5EaXNjb3ZlcnlQcmlvcml0eS5Db25maWd1cmVkKTtcbmFnZW50UGx1Z2luRGlzY292ZXJ5UmVnaXN0cnkucmVnaXN0ZXIobmV3IFN5bmNEZXNjcmlwdG9yKE1hcmtldHBsYWNlQWdlbnRQbHVnaW5EaXNjb3ZlcnkpLCBBZ2VudFBsdWdpbkRpc2NvdmVyeVByaW9yaXR5Lk1hcmtldHBsYWNlKTtcbmFnZW50UGx1Z2luRGlzY292ZXJ5UmVnaXN0cnkucmVnaXN0ZXIobmV3IFN5bmNEZXNjcmlwdG9yKEV4dGVuc2lvbkFnZW50UGx1Z2luRGlzY292ZXJ5KSwgQWdlbnRQbHVnaW5EaXNjb3ZlcnlQcmlvcml0eS5FeHRlbnNpb24pO1xuYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeS5yZWdpc3RlcihuZXcgU3luY0Rlc2NyaXB0b3IoQ29waWxvdENsaUFnZW50UGx1Z2luRGlzY292ZXJ5KSwgQWdlbnRQbHVnaW5EaXNjb3ZlcnlQcmlvcml0eS5Db3BpbG90Q2xpKTtcblxucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRSZXNwb25zZVJlc291cmNlRmlsZVN5c3RlbVByb3ZpZGVyLCBDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIENoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFRyYW5zZmVyU2VydmljZSwgQ2hhdFRyYW5zZmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFNlcnZpY2UsIENoYXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0V2lkZ2V0U2VydmljZSwgQ2hhdFdpZGdldFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsIENoYXRQYXN0ZVRhcmdldFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRTaWRlQ2hhdFNlcnZpY2UsIENoYXRTaWRlQ2hhdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRSZXF1ZXN0T3JpZ2luU2VydmljZSwgQ2hhdFJlcXVlc3RPcmlnaW5TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0UGV0U2VydmljZSwgQ2hhdFBldFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVF1aWNrQ2hhdFNlcnZpY2UsIFF1aWNrQ2hhdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIENoYXRXaWRnZXRIaXN0b3J5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSwgTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVNlc3Npb25Sb3V0ZXIsIFNlc3Npb25Sb3V0ZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBZ2VudFNlcnZpY2UsIENoYXRBZ2VudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLCBDaGF0QWdlbnROYW1lU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFZhcmlhYmxlc1NlcnZpY2UsIENoYXRWYXJpYWJsZXNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudFBsdWdpblNlcnZpY2UsIEFnZW50UGx1Z2luU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwgV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElQbHVnaW5HaXRTZXJ2aWNlLCBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCBQbHVnaW5JbnN0YWxsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJVG9vbFJlc3VsdENvbXByZXNzb3IsIFRvb2xSZXN1bHRDb21wcmVzc29yU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIENoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0R29hbFN1bW1hcnlTZXJ2aWNlLCBDaGF0R29hbFN1bW1hcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLCBDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElWb2ljZUNoYXRTZXJ2aWNlLCBWb2ljZUNoYXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0Q29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZSwgQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvZGVNYXBwZXJTZXJ2aWNlLCBDb2RlTWFwcGVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBDaGF0RWRpdGluZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIENoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIEFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0TW9kZVNlcnZpY2UsIENoYXRNb2RlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSwgQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFRvZG9MaXN0U2VydmljZSwgQ2hhdFRvZG9MaXN0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdEFydGlmYWN0c1NlcnZpY2UsIENoYXRBcnRpZmFjdHNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCBDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0TGF5b3V0U2VydmljZSwgQ2hhdExheW91dFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UsIFBsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRUaXBTZXJ2aWNlLCBDaGF0VGlwU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdERlYnVnU2VydmljZSwgQ2hhdERlYnVnU2VydmljZUltcGwsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSwgQ2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuXG5DaGF0V2lkZ2V0LkNPTlRSSUJTLnB1c2goQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxlQUFlLHVCQUF1QjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLDJCQUEyQjtBQUM3QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFNBQVM7QUFDckIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLDREQUE0RDtBQUNyRSxTQUFTLG9DQUFvQywyQ0FBMkMsK0JBQStCLDRDQUE0QyxrREFBa0Qsc0NBQXNDLDhDQUE4QztBQUN6UyxPQUFPO0FBQ1AsU0FBUyxtQ0FBbUMsNENBQTRDLHFDQUFxQyw0Q0FBNEMsMkNBQTJDO0FBQ3BOLFNBQVMsbURBQW1ELHNDQUFzQyw2Q0FBNkMsdUNBQXVDLDJDQUEyQywyQ0FBMkMsNENB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
