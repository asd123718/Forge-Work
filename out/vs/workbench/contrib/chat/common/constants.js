import { Schemas } from "../../../../base/common/network.js";
import { IChatSessionsService, isAgentHostTarget, localChatSessionType, SessionType } from "./chatSessionsService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatEntitlementContextKeys } from "../../../services/chat/common/chatEntitlementService.js";
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { LocalChatSessionUri } from "./model/chatUri.js";
import { clearUserSelectedSessionType, getRememberedSessionType, storeUserSelectedSessionType } from "./chatSessionTypePreference.js";
import { isForgeAdvertisedSessionTypeId } from "../../../../platform/agentHost/common/forgeSessionTypes.js";
import product from "../../../../platform/product/common/product.js";
import { IAgentHostEnablementService } from "../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
var BYOKUtilityModelDefault = /* @__PURE__ */ ((BYOKUtilityModelDefault2) => {
  BYOKUtilityModelDefault2["None"] = "none";
  BYOKUtilityModelDefault2["MainAgent"] = "mainAgent";
  BYOKUtilityModelDefault2["Copilot"] = "copilot";
  return BYOKUtilityModelDefault2;
})(BYOKUtilityModelDefault || {});
var ChatConfiguration = /* @__PURE__ */ ((ChatConfiguration2) => {
  ChatConfiguration2["PluginsEnabled"] = "chat.plugins.enabled";
  ChatConfiguration2["PluginLocations"] = "chat.pluginLocations";
  ChatConfiguration2["PluginMarketplaces"] = "chat.plugins.marketplaces";
  ChatConfiguration2["ExtraMarketplaces"] = "chat.plugins.extraMarketplaces";
  ChatConfiguration2["StrictMarketplaces"] = "chat.plugins.strictMarketplaces";
  ChatConfiguration2["EnabledPlugins"] = "chat.plugins.enabledPlugins";
  ChatConfiguration2["AgentEnabled"] = "chat.agent.enabled";
  ChatConfiguration2["PlanAgentDefaultModel"] = "chat.planAgent.defaultModel";
  ChatConfiguration2["ExploreAgentDefaultModel"] = "chat.exploreAgent.defaultModel";
  ChatConfiguration2["UtilityModel"] = "chat.utilityModel";
  ChatConfiguration2["UtilitySmallModel"] = "chat.utilitySmallModel";
  ChatConfiguration2["BYOKUtilityModelDefault"] = "chat.byokUtilityModelDefault";
  ChatConfiguration2["RequestQueueingDefaultAction"] = "chat.requestQueuing.defaultAction";
  ChatConfiguration2["SaveBeforeSend"] = "chat.saveBeforeSend";
  ChatConfiguration2["AgentStatusEnabled"] = "chat.agentsControl.enabled";
  ChatConfiguration2["EditorAssociations"] = "chat.editorAssociations";
  ChatConfiguration2["UnifiedAgentsBar"] = "chat.unifiedAgentsBar.enabled";
  ChatConfiguration2["AgentSessionProjectionEnabled"] = "chat.agentSessionProjection.enabled";
  ChatConfiguration2["MigrateLegacyCopilotCliSessions"] = "chat.agentSessions.migrateLegacyCopilotCli";
  ChatConfiguration2["ShowExternalAgentSessions"] = "chat.agentSessions.showExternal";
  ChatConfiguration2["ExtensionToolsEnabled"] = "chat.extensionTools.enabled";
  ChatConfiguration2["RepoInfoEnabled"] = "chat.repoInfo.enabled";
  ChatConfiguration2["EditRequests"] = "chat.editRequests";
  ChatConfiguration2["InlineReferencesStyle"] = "chat.inlineReferences.style";
  ChatConfiguration2["AutoReply"] = "chat.autoReply";
  ChatConfiguration2["GlobalAutoApprove"] = "chat.tools.global.autoApprove";
  ChatConfiguration2["AutoApproveEdits"] = "chat.tools.edits.autoApprove";
  ChatConfiguration2["AutoApprovedUrls"] = "chat.tools.urls.autoApprove";
  ChatConfiguration2["EligibleForAutoApproval"] = "chat.tools.eligibleForAutoApproval";
  ChatConfiguration2["EnableMath"] = "chat.math.enabled";
  ChatConfiguration2["CheckpointsEnabled"] = "chat.checkpoints.enabled";
  ChatConfiguration2["ThinkingStyle"] = "chat.agent.thinkingStyle";
  ChatConfiguration2["ThinkingGenerateTitles"] = "chat.agent.thinking.generateTitles";
  ChatConfiguration2["TerminalToolsInThinking"] = "chat.agent.thinking.terminalTools";
  ChatConfiguration2["CollapseCompletedResponses"] = "chat.agent.collapseCompletedResponses";
  ChatConfiguration2["SimpleTerminalCollapsible"] = "chat.tools.terminal.simpleCollapsible";
  ChatConfiguration2["CompressOutputEnabled"] = "chat.tools.compressOutput.enabled";
  ChatConfiguration2["ThinkingPhrases"] = "chat.agent.thinking.phrases";
  ChatConfiguration2["AutoExpandToolFailures"] = "chat.tools.autoExpandFailures";
  ChatConfiguration2["TodosShowWidget"] = "chat.tools.todos.showWidget";
  ChatConfiguration2["NotifyWindowOnConfirmation"] = "chat.notifyWindowOnConfirmation";
  ChatConfiguration2["NotifyWindowOnResponseReceived"] = "chat.notifyWindowOnResponseReceived";
  ChatConfiguration2["ChatViewSessionsEnabled"] = "chat.viewSessions.enabled";
  ChatConfiguration2["SessionSyncEnabled"] = "chat.sessionSync.enabled";
  ChatConfiguration2["SessionSyncExcludeRepositories"] = "chat.sessionSync.excludeRepositories";
  ChatConfiguration2["ChatViewSessionsGrouping"] = "chat.viewSessions.grouping";
  ChatConfiguration2["ChatViewSessionsOrientation"] = "chat.viewSessions.orientation";
  ChatConfiguration2["ChatViewProgressBadgeEnabled"] = "chat.viewProgressBadge.enabled";
  ChatConfiguration2["ChatContextUsageEnabled"] = "chat.contextUsage.enabled";
  ChatConfiguration2["Verbose"] = "chat.verbose";
  ChatConfiguration2["ProgressBorder"] = "chat.progressBorder.enabled";
  ChatConfiguration2["SubagentToolCustomAgents"] = "chat.customAgentInSubagent.enabled";
  ChatConfiguration2["SubagentsAllowInvocationsFromSubagents"] = "chat.subagents.allowInvocationsFromSubagents";
  ChatConfiguration2["SubagentsUseRichRendering"] = "chat.subagents.useRichRendering";
  ChatConfiguration2["ShowCodeBlockProgressAnimation"] = "chat.agent.codeBlockProgress";
  ChatConfiguration2["RestoreLastPanelSession"] = "chat.restoreLastPanelSession";
  ChatConfiguration2["ExitAfterDelegation"] = "chat.exitAfterDelegation";
  ChatConfiguration2["ExplainChangesEnabled"] = "chat.editing.explainChanges.enabled";
  ChatConfiguration2["RevealNextChangeOnResolve"] = "chat.editing.revealNextChangeOnResolve";
  ChatConfiguration2["OpenChangedFileInDiffEditor"] = "chat.editing.openChangedFileInDiffEditor";
  ChatConfiguration2["GrowthNotificationEnabled"] = "chat.growthNotification.enabled";
  ChatConfiguration2["TitleBarSignInEnabled"] = "chat.titleBar.signIn.enabled";
  ChatConfiguration2["TitleBarOpenInAgentsWindowEnabled"] = "chat.titleBar.openInAgentsWindow.enabled";
  ChatConfiguration2["ChatCustomizationsStructuredPreviewEnabled"] = "chat.customizations.structuredPreview.enabled";
  ChatConfiguration2["ChatCustomizationsPromptMigrationEnabled"] = "chat.customizations.promptMigration.enabled";
  ChatConfiguration2["ChatCustomizationsUserDataMigrationEnabled"] = "chat.customizations.userDataMigration.enabled";
  ChatConfiguration2["AutopilotAdvancedEnabled"] = "chat.autopilot.advanced.enabled";
  ChatConfiguration2["DefaultPermissionLevel"] = "chat.permissions.default";
  ChatConfiguration2["AssistedPermissionsEnabled"] = "chat.assistedPermissions.enabled";
  ChatConfiguration2["PermissionsSandboxToggleEnabled"] = "chat.experimental.permissionsSandboxToggle.enabled";
  ChatConfiguration2["DefaultConfiguration"] = "chat.defaultConfiguration";
  ChatConfiguration2["DefaultModel"] = "chat.defaultModel";
  ChatConfiguration2["ImageCarouselEnabled"] = "imageCarousel.chat.enabled";
  ChatConfiguration2["ArtifactsEnabled"] = "chat.artifacts.enabled";
  ChatConfiguration2["ArtifactsRulesByMimeType"] = "chat.artifacts.rules.byMimeType";
  ChatConfiguration2["ArtifactsRulesByFilePath"] = "chat.artifacts.rules.byFilePath";
  ChatConfiguration2["ArtifactsRulesByMemoryFilePath"] = "chat.artifacts.rules.byMemoryFilePath";
  ChatConfiguration2["ToolConfirmationCarousel"] = "chat.tools.confirmationCarousel.enabled";
  ChatConfiguration2["ToolRiskAssessmentEnabled"] = "chat.tools.riskAssessment.enabled";
  ChatConfiguration2["ToolRiskAssessmentModel"] = "chat.tools.riskAssessment.model";
  ChatConfiguration2["DefaultNewSessionMode"] = "chat.newSession.defaultMode";
  ChatConfiguration2["EditorPreferCopilotHarness"] = "chat.editor.preferCopilotHarness";
  ChatConfiguration2["DefaultToCopilotHarness"] = "chat.defaultToCopilotHarness";
  ChatConfiguration2["DefaultToCodexHarness"] = "chat.defaultToCodexHarness";
  ChatConfiguration2["EditorLocalAgentEnabled"] = "chat.editor.localAgent.enabled";
  ChatConfiguration2["AgentsHandoffTipMode"] = "chat.agentsHandoffTip.mode";
  ChatConfiguration2["TurnStatusPills"] = "chat.turnStatusPills";
  ChatConfiguration2["IncrementalRendering"] = "chat.experimental.incrementalRendering.enabled";
  ChatConfiguration2["IncrementalRenderingStyle"] = "chat.experimental.incrementalRendering.animationStyle";
  ChatConfiguration2["IncrementalRenderingBuffering"] = "chat.experimental.incrementalRendering.buffering";
  ChatConfiguration2["RichLinks"] = "chat.experimental.richLinks.enabled";
  ChatConfiguration2["CollectInstructionsInExtension"] = "chat.experimental.collectInstructionsInExtension";
  ChatConfiguration2["ImplicitContextActiveEditor"] = "chat.implicitContext.includeActiveEditor";
  return ChatConfiguration2;
})(ChatConfiguration || {});
var ChatModeKind = /* @__PURE__ */ ((ChatModeKind2) => {
  ChatModeKind2["Ask"] = "ask";
  ChatModeKind2["Edit"] = "edit";
  ChatModeKind2["Agent"] = "agent";
  return ChatModeKind2;
})(ChatModeKind || {});
var ChatPermissionLevel = /* @__PURE__ */ ((ChatPermissionLevel2) => {
  ChatPermissionLevel2["Default"] = "default";
  ChatPermissionLevel2["Assisted"] = "assisted";
  ChatPermissionLevel2["AutoApprove"] = "autoApprove";
  ChatPermissionLevel2["Autopilot"] = "autopilot";
  return ChatPermissionLevel2;
})(ChatPermissionLevel || {});
const chatPermissionLevels = new Set(Object.values(ChatPermissionLevel));
function isChatPermissionLevel(level) {
  return chatPermissionLevels.has(level);
}
var ChatDefaultPermissionLevel = /* @__PURE__ */ ((ChatDefaultPermissionLevel2) => {
  ChatDefaultPermissionLevel2["Manual"] = "manual";
  ChatDefaultPermissionLevel2["Assisted"] = "assisted";
  ChatDefaultPermissionLevel2["AllowAll"] = "allowAll";
  return ChatDefaultPermissionLevel2;
})(ChatDefaultPermissionLevel || {});
function getChatPermissionLevelFromDefaultConfiguration(value) {
  switch (value) {
    case "manual" /* Manual */:
    case "default" /* Default */:
      return "default" /* Default */;
    case "assisted" /* Assisted */:
      return "assisted" /* Assisted */;
    case "allowAll" /* AllowAll */:
    case "autoApprove" /* AutoApprove */:
      return "autoApprove" /* AutoApprove */;
    default:
      return void 0;
  }
}
function isAutoApproveLevel(level) {
  return level === "autoApprove" /* AutoApprove */ || level === "autopilot" /* Autopilot */;
}
function isAutopilotLevel(level) {
  return level === "autopilot" /* Autopilot */;
}
var ThinkingDisplayMode = /* @__PURE__ */ ((ThinkingDisplayMode2) => {
  ThinkingDisplayMode2["Collapsed"] = "collapsed";
  ThinkingDisplayMode2["CollapsedPreview"] = "collapsedPreview";
  ThinkingDisplayMode2["FixedScrolling"] = "fixedScrolling";
  return ThinkingDisplayMode2;
})(ThinkingDisplayMode || {});
var CollapsedToolsDisplayMode = /* @__PURE__ */ ((CollapsedToolsDisplayMode2) => {
  CollapsedToolsDisplayMode2["Off"] = "off";
  CollapsedToolsDisplayMode2["WithThinking"] = "withThinking";
  CollapsedToolsDisplayMode2["Always"] = "always";
  return CollapsedToolsDisplayMode2;
})(CollapsedToolsDisplayMode || {});
var ChatNotificationMode = /* @__PURE__ */ ((ChatNotificationMode2) => {
  ChatNotificationMode2["Off"] = "off";
  ChatNotificationMode2["WindowNotFocused"] = "windowNotFocused";
  ChatNotificationMode2["Always"] = "always";
  return ChatNotificationMode2;
})(ChatNotificationMode || {});
var ChatAgentLocation = /* @__PURE__ */ ((ChatAgentLocation2) => {
  ChatAgentLocation2["Chat"] = "panel";
  ChatAgentLocation2["Terminal"] = "terminal";
  ChatAgentLocation2["Notebook"] = "notebook";
  ChatAgentLocation2["EditorInline"] = "editor";
  return ChatAgentLocation2;
})(ChatAgentLocation || {});
((ChatAgentLocation2) => {
  function fromRaw(value) {
    switch (value) {
      case "panel":
        return "panel" /* Chat */;
      case "terminal":
        return "terminal" /* Terminal */;
      case "notebook":
        return "notebook" /* Notebook */;
      case "editor":
        return "editor" /* EditorInline */;
    }
    return "panel" /* Chat */;
  }
  ChatAgentLocation2.fromRaw = fromRaw;
})(ChatAgentLocation || (ChatAgentLocation = {}));
const chatAlwaysUnsupportedFileSchemes = /* @__PURE__ */ new Set([
  Schemas.vscodeChatEditor,
  // Chat's own read-only resources, such as a pasted-text artifact: their
  // contents already reach the model through the attachment they belong to.
  Schemas.vscodeChatResponseResource,
  Schemas.walkThrough,
  Schemas.vscodeLocalChatSession,
  Schemas.vscodeSettings,
  Schemas.webviewPanel,
  Schemas.vscodeUserData,
  Schemas.extension,
  "ccreq",
  "openai-codex"
  // Codex session custom editor scheme
]);
const chatInputSchemes = [Schemas.vscodeChatInput, Schemas.sessionsChatInput];
function isChatInputModel(uri) {
  return chatInputSchemes.includes(uri.scheme);
}
function isSupportedChatFileScheme(accessor, scheme) {
  const chatService = accessor.get(IChatSessionsService);
  if (chatAlwaysUnsupportedFileSchemes.has(scheme)) {
    return false;
  }
  if (chatService.getContentProviderSchemes().includes(scheme)) {
    return false;
  }
  return true;
}
function getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled) {
  if (isVirtualWorkspace(workspace)) {
    return localChatSessionType;
  }
  if (agentHostEnabled && configurationService.getValue("chat.defaultToCodexHarness" /* DefaultToCodexHarness */)) {
    return SessionType.AgentHostCodex;
  }
  if (agentHostEnabled && configurationService.getValue("chat.defaultToCopilotHarness" /* DefaultToCopilotHarness */)) {
    return SessionType.AgentHostCopilot;
  }
  if (isEditorLocalAgentEnabled(configurationService, workspace)) {
    return localChatSessionType;
  }
  return getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace)[0] ?? localChatSessionType;
}
function getComputedDefaultSessionResource(configurationService, chatSessionsService, workspace, agentHostEnabled) {
  const defaultType = getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
  return defaultType === localChatSessionType ? LocalChatSessionUri.getNewSessionUri() : URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}
function isNewChatSessionTypeUsable(sessionType, configurationService, chatSessionsService, workspace, agentHostEnabled = true) {
  if (sessionType === localChatSessionType) {
    return isEditorLocalAgentEnabled(configurationService, workspace);
  }
  if (isAgentHostTarget(sessionType)) {
    return agentHostEnabled;
  }
  return isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace);
}
function getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
  if (options?.explicitOverride) {
    return options.explicitOverride;
  }
  if (isVirtualWorkspace(workspace)) {
    return localChatSessionType;
  }
  if (agentHostEnabled && configurationService.getValue("chat.defaultToCodexHarness" /* DefaultToCodexHarness */)) {
    return SessionType.AgentHostCodex;
  }
  const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace, agentHostEnabled);
  if (remembered) {
    return remembered;
  }
  if (options?.currentSessionType && isNewChatSessionTypeUsable(options.currentSessionType, configurationService, chatSessionsService, workspace, agentHostEnabled)) {
    return options.currentSessionType;
  }
  return getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
}
function resolveDefaultNewChatSessionType(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const chatSessionsService = accessor.get(IChatSessionsService);
  const storageService = accessor.get(IStorageService);
  const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
  const agentHostEnabled = accessor.get(IAgentHostEnablementService).enabled.get();
  if (options?.explicitOverride) {
    return { sessionType: options.explicitOverride };
  }
  if (isVirtualWorkspace(workspace)) {
    return { sessionType: localChatSessionType };
  }
  if (agentHostEnabled && configurationService.getValue("chat.defaultToCodexHarness" /* DefaultToCodexHarness */)) {
    return { sessionType: SessionType.AgentHostCodex };
  }
  const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace, agentHostEnabled);
  if (remembered && remembered !== localChatSessionType) {
    return { sessionType: remembered };
  }
  if (options?.currentSessionType === localChatSessionType && agentHostEnabled && configurationService.getValue("chat.editor.preferCopilotHarness" /* EditorPreferCopilotHarness */)) {
    return { sessionType: SessionType.AgentHostCopilot };
  }
  return { sessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) };
}
function getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace, agentHostEnabled) {
  const remembered = getRememberedSessionType(storageService);
  return remembered && isNewChatSessionTypeUsable(remembered, configurationService, chatSessionsService, workspace, agentHostEnabled) ? remembered : void 0;
}
function getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
  const defaultType = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options);
  return defaultType === localChatSessionType ? LocalChatSessionUri.getNewSessionUri() : URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}
function recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, workspace, sessionType, agentHostEnabled) {
  if (sessionType === getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled)) {
    clearUserSelectedSessionType(storageService);
  } else {
    storeUserSelectedSessionType(storageService, sessionType);
  }
}
function isEditorLocalAgentEnabled(configurationService, workspace) {
  return isVirtualWorkspace(workspace) || configurationService.getValue("chat.editor.localAgent.enabled" /* EditorLocalAgentEnabled */) === true;
}
function isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace) {
  if (product.applicationName === "forge-ai") {
    return isForgeAdvertisedSessionTypeId(sessionType) && !!chatSessionsService.getChatSessionContribution(sessionType);
  }
  if (sessionType === localChatSessionType) {
    return isEditorLocalAgentEnabled(configurationService, workspace);
  }
  if (sessionType === SessionType.CopilotCLI || sessionType === SessionType.CopilotCloud || sessionType === SessionType.AgentHostCopilot || sessionType === SessionType.AgentHostClaude) {
    return false;
  }
  return !!chatSessionsService.getChatSessionContribution(sessionType);
}
function getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace) {
  const sessionTypes = /* @__PURE__ */ new Set();
  for (const contribution of chatSessionsService.getAllChatSessionContributions()) {
    if (contribution.type !== localChatSessionType && isVisibleEditorChatSessionType(contribution.type, configurationService, chatSessionsService, workspace)) {
      sessionTypes.add(contribution.type);
    }
  }
  return Array.from(sessionTypes);
}
const MANAGE_CHAT_COMMAND_ID = "workbench.action.chat.manage";
const CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID = "workbench.action.chat.openAgentHostChat";
const CHAT_SUBAGENT_RESOURCE_QUERY_PARAM = "subagentChatResource";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID = "workbench.action.openWorkspaceInAgentsWindow";
const OPEN_AGENTS_WINDOW_COMMAND_ID = "workbench.action.openAgentsWindow";
const OPEN_AGENTS_WINDOW_PRECONDITION = ContextKeyExpr.and(
  ChatEntitlementContextKeys.Setup.hidden.negate(),
  ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
  IsSessionsWindowContext.negate(),
  ContextKeyExpr.has(`config.${"chat.agent.enabled" /* AgentEnabled */}`),
  IsAuxiliaryWindowContext.negate()
);
const ChatEditorTitleMaxLength = 30;
const CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES = 1e3;
const CONTEXT_MODELS_EDITOR = new RawContextKey("inModelsEditor", false);
const CONTEXT_MODELS_SEARCH_FOCUS = new RawContextKey("inModelsSearch", false);
export {
  BYOKUtilityModelDefault,
  CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
  CHAT_SUBAGENT_RESOURCE_QUERY_PARAM,
  CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES,
  CONTEXT_MODELS_EDITOR,
  CONTEXT_MODELS_SEARCH_FOCUS,
  ChatAIDisabledSettingId,
  ChatAgentLocation,
  ChatConfiguration,
  ChatDefaultPermissionLevel,
  ChatEditorTitleMaxLength,
  ChatModeKind,
  ChatNotificationMode,
  ChatPermissionLevel,
  CollapsedToolsDisplayMode,
  MANAGE_CHAT_COMMAND_ID,
  OPEN_AGENTS_WINDOW_COMMAND_ID,
  OPEN_AGENTS_WINDOW_PRECONDITION,
  OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
  ThinkingDisplayMode,
  chatInputSchemes,
  getChatPermissionLevelFromDefaultConfiguration,
  getComputedDefaultSessionResource,
  getComputedDefaultSessionType,
  getDefaultNewChatSessionResource,
  getDefaultNewChatSessionType,
  isAutoApproveLevel,
  isAutopilotLevel,
  isChatInputModel,
  isChatPermissionLevel,
  isEditorLocalAgentEnabled,
  isNewChatSessionTypeUsable,
  isSupportedChatFileScheme,
  isVisibleEditorChatSessionType,
  recordUserSelectedSessionType,
  resolveDefaultNewChatSessionType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcY29uc3RhbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGlzQWdlbnRIb3N0VGFyZ2V0LCBsb2NhbENoYXRTZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzVmlydHVhbFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBjbGVhclVzZXJTZWxlY3RlZFNlc3Npb25UeXBlLCBnZXRSZW1lbWJlcmVkU2Vzc2lvblR5cGUsIHN0b3JlVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUgfSBmcm9tICcuL2NoYXRTZXNzaW9uVHlwZVByZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgaXNGb3JnZUFkdmVydGlzZWRTZXNzaW9uVHlwZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9mb3JnZVNlc3Npb25UeXBlcy5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0IHtcblx0Tm9uZSA9ICdub25lJyxcblx0TWFpbkFnZW50ID0gJ21haW5BZ2VudCcsXG5cdENvcGlsb3QgPSAnY29waWxvdCcsXG59XG5cbmV4cG9ydCBlbnVtIENoYXRDb25maWd1cmF0aW9uIHtcblx0UGx1Z2luc0VuYWJsZWQgPSAnY2hhdC5wbHVnaW5zLmVuYWJsZWQnLFxuXHRQbHVnaW5Mb2NhdGlvbnMgPSAnY2hhdC5wbHVnaW5Mb2NhdGlvbnMnLFxuXHRQbHVnaW5NYXJrZXRwbGFjZXMgPSAnY2hhdC5wbHVnaW5zLm1hcmtldHBsYWNlcycsXG5cdEV4dHJhTWFya2V0cGxhY2VzID0gJ2NoYXQucGx1Z2lucy5leHRyYU1hcmtldHBsYWNlcycsXG5cdFN0cmljdE1hcmtldHBsYWNlcyA9ICdjaGF0LnBsdWdpbnMuc3RyaWN0TWFya2V0cGxhY2VzJyxcblx0RW5hYmxlZFBsdWdpbnMgPSAnY2hhdC5wbHVnaW5zLmVuYWJsZWRQbHVnaW5zJyxcblx0QWdlbnRFbmFibGVkID0gJ2NoYXQuYWdlbnQuZW5hYmxlZCcsXG5cdFBsYW5BZ2VudERlZmF1bHRNb2RlbCA9ICdjaGF0LnBsYW5BZ2VudC5kZWZhdWx0TW9kZWwnLFxuXHRFeHBsb3JlQWdlbnREZWZhdWx0TW9kZWwgPSAnY2hhdC5leHBsb3JlQWdlbnQuZGVmYXVsdE1vZGVsJyxcblx0VXRpbGl0eU1vZGVsID0gJ2NoYXQudXRpbGl0eU1vZGVsJyxcblx0VXRpbGl0eVNtYWxsTW9kZWwgPSAnY2hhdC51dGlsaXR5U21hbGxNb2RlbCcsXG5cdEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0ID0gJ2NoYXQuYnlva1V0aWxpdHlNb2RlbERlZmF1bHQnLFxuXHRSZXF1ZXN0UXVldWVpbmdEZWZhdWx0QWN0aW9uID0gJ2NoYXQucmVxdWVzdFF1ZXVpbmcuZGVmYXVsdEFjdGlvbicsXG5cdFNhdmVCZWZvcmVTZW5kID0gJ2NoYXQuc2F2ZUJlZm9yZVNlbmQnLFxuXHRBZ2VudFN0YXR1c0VuYWJsZWQgPSAnY2hhdC5hZ2VudHNDb250cm9sLmVuYWJsZWQnLFxuXHRFZGl0b3JBc3NvY2lhdGlvbnMgPSAnY2hhdC5lZGl0b3JBc3NvY2lhdGlvbnMnLFxuXHRVbmlmaWVkQWdlbnRzQmFyID0gJ2NoYXQudW5pZmllZEFnZW50c0Jhci5lbmFibGVkJyxcblx0QWdlbnRTZXNzaW9uUHJvamVjdGlvbkVuYWJsZWQgPSAnY2hhdC5hZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmVuYWJsZWQnLFxuXHRNaWdyYXRlTGVnYWN5Q29waWxvdENsaVNlc3Npb25zID0gJ2NoYXQuYWdlbnRTZXNzaW9ucy5taWdyYXRlTGVnYWN5Q29waWxvdENsaScsXG5cdFNob3dFeHRlcm5hbEFnZW50U2Vzc2lvbnMgPSAnY2hhdC5hZ2VudFNlc3Npb25zLnNob3dFeHRlcm5hbCcsXG5cdEV4dGVuc2lvblRvb2xzRW5hYmxlZCA9ICdjaGF0LmV4dGVuc2lvblRvb2xzLmVuYWJsZWQnLFxuXHRSZXBvSW5mb0VuYWJsZWQgPSAnY2hhdC5yZXBvSW5mby5lbmFibGVkJyxcblx0RWRpdFJlcXVlc3RzID0gJ2NoYXQuZWRpdFJlcXVlc3RzJyxcblx0SW5saW5lUmVmZXJlbmNlc1N0eWxlID0gJ2NoYXQuaW5saW5lUmVmZXJlbmNlcy5zdHlsZScsXG5cdEF1dG9SZXBseSA9ICdjaGF0LmF1dG9SZXBseScsXG5cdEdsb2JhbEF1dG9BcHByb3ZlID0gJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJyxcblx0QXV0b0FwcHJvdmVFZGl0cyA9ICdjaGF0LnRvb2xzLmVkaXRzLmF1dG9BcHByb3ZlJyxcblx0QXV0b0FwcHJvdmVkVXJscyA9ICdjaGF0LnRvb2xzLnVybHMuYXV0b0FwcHJvdmUnLFxuXHRFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCA9ICdjaGF0LnRvb2xzLmVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsJyxcblx0RW5hYmxlTWF0aCA9ICdjaGF0Lm1hdGguZW5hYmxlZCcsXG5cdENoZWNrcG9pbnRzRW5hYmxlZCA9ICdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLFxuXHRUaGlua2luZ1N0eWxlID0gJ2NoYXQuYWdlbnQudGhpbmtpbmdTdHlsZScsXG5cdFRoaW5raW5nR2VuZXJhdGVUaXRsZXMgPSAnY2hhdC5hZ2VudC50aGlua2luZy5nZW5lcmF0ZVRpdGxlcycsXG5cdFRlcm1pbmFsVG9vbHNJblRoaW5raW5nID0gJ2NoYXQuYWdlbnQudGhpbmtpbmcudGVybWluYWxUb29scycsXG5cdENvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VzID0gJ2NoYXQuYWdlbnQuY29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMnLFxuXHRTaW1wbGVUZXJtaW5hbENvbGxhcHNpYmxlID0gJ2NoYXQudG9vbHMudGVybWluYWwuc2ltcGxlQ29sbGFwc2libGUnLFxuXHRDb21wcmVzc091dHB1dEVuYWJsZWQgPSAnY2hhdC50b29scy5jb21wcmVzc091dHB1dC5lbmFibGVkJyxcblx0VGhpbmtpbmdQaHJhc2VzID0gJ2NoYXQuYWdlbnQudGhpbmtpbmcucGhyYXNlcycsXG5cdEF1dG9FeHBhbmRUb29sRmFpbHVyZXMgPSAnY2hhdC50b29scy5hdXRvRXhwYW5kRmFpbHVyZXMnLFxuXHRUb2Rvc1Nob3dXaWRnZXQgPSAnY2hhdC50b29scy50b2Rvcy5zaG93V2lkZ2V0Jyxcblx0Tm90aWZ5V2luZG93T25Db25maXJtYXRpb24gPSAnY2hhdC5ub3RpZnlXaW5kb3dPbkNvbmZpcm1hdGlvbicsXG5cdE5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZCA9ICdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZCcsXG5cdENoYXRWaWV3U2Vzc2lvbnNFbmFibGVkID0gJ2NoYXQudmlld1Nlc3Npb25zLmVuYWJsZWQnLFxuXHRTZXNzaW9uU3luY0VuYWJsZWQgPSAnY2hhdC5zZXNzaW9uU3luYy5lbmFibGVkJyxcblx0U2Vzc2lvblN5bmNFeGNsdWRlUmVwb3NpdG9yaWVzID0gJ2NoYXQuc2Vzc2lvblN5bmMuZXhjbHVkZVJlcG9zaXRvcmllcycsXG5cdENoYXRWaWV3U2Vzc2lvbnNHcm91cGluZyA9ICdjaGF0LnZpZXdTZXNzaW9ucy5ncm91cGluZycsXG5cdENoYXRWaWV3U2Vzc2lvbnNPcmllbnRhdGlvbiA9ICdjaGF0LnZpZXdTZXNzaW9ucy5vcmllbnRhdGlvbicsXG5cdENoYXRWaWV3UHJvZ3Jlc3NCYWRnZUVuYWJsZWQgPSAnY2hhdC52aWV3UHJvZ3Jlc3NCYWRnZS5lbmFibGVkJyxcblx0Q2hhdENvbnRleHRVc2FnZUVuYWJsZWQgPSAnY2hhdC5jb250ZXh0VXNhZ2UuZW5hYmxlZCcsXG5cdFZlcmJvc2UgPSAnY2hhdC52ZXJib3NlJyxcblx0UHJvZ3Jlc3NCb3JkZXIgPSAnY2hhdC5wcm9ncmVzc0JvcmRlci5lbmFibGVkJyxcblx0U3ViYWdlbnRUb29sQ3VzdG9tQWdlbnRzID0gJ2NoYXQuY3VzdG9tQWdlbnRJblN1YmFnZW50LmVuYWJsZWQnLFxuXHRTdWJhZ2VudHNBbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cyA9ICdjaGF0LnN1YmFnZW50cy5hbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cycsXG5cdFN1YmFnZW50c1VzZVJpY2hSZW5kZXJpbmcgPSAnY2hhdC5zdWJhZ2VudHMudXNlUmljaFJlbmRlcmluZycsXG5cdFNob3dDb2RlQmxvY2tQcm9ncmVzc0FuaW1hdGlvbiA9ICdjaGF0LmFnZW50LmNvZGVCbG9ja1Byb2dyZXNzJyxcblx0UmVzdG9yZUxhc3RQYW5lbFNlc3Npb24gPSAnY2hhdC5yZXN0b3JlTGFzdFBhbmVsU2Vzc2lvbicsXG5cdEV4aXRBZnRlckRlbGVnYXRpb24gPSAnY2hhdC5leGl0QWZ0ZXJEZWxlZ2F0aW9uJyxcblx0RXhwbGFpbkNoYW5nZXNFbmFibGVkID0gJ2NoYXQuZWRpdGluZy5leHBsYWluQ2hhbmdlcy5lbmFibGVkJyxcblx0UmV2ZWFsTmV4dENoYW5nZU9uUmVzb2x2ZSA9ICdjaGF0LmVkaXRpbmcucmV2ZWFsTmV4dENoYW5nZU9uUmVzb2x2ZScsXG5cdE9wZW5DaGFuZ2VkRmlsZUluRGlmZkVkaXRvciA9ICdjaGF0LmVkaXRpbmcub3BlbkNoYW5nZWRGaWxlSW5EaWZmRWRpdG9yJyxcblx0R3Jvd3RoTm90aWZpY2F0aW9uRW5hYmxlZCA9ICdjaGF0Lmdyb3d0aE5vdGlmaWNhdGlvbi5lbmFibGVkJyxcblx0VGl0bGVCYXJTaWduSW5FbmFibGVkID0gJ2NoYXQudGl0bGVCYXIuc2lnbkluLmVuYWJsZWQnLFxuXHRUaXRsZUJhck9wZW5JbkFnZW50c1dpbmRvd0VuYWJsZWQgPSAnY2hhdC50aXRsZUJhci5vcGVuSW5BZ2VudHNXaW5kb3cuZW5hYmxlZCcsXG5cblx0Q2hhdEN1c3RvbWl6YXRpb25zU3RydWN0dXJlZFByZXZpZXdFbmFibGVkID0gJ2NoYXQuY3VzdG9taXphdGlvbnMuc3RydWN0dXJlZFByZXZpZXcuZW5hYmxlZCcsXG5cdENoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWQgPSAnY2hhdC5jdXN0b21pemF0aW9ucy5wcm9tcHRNaWdyYXRpb24uZW5hYmxlZCcsXG5cdENoYXRDdXN0b21pemF0aW9uc1VzZXJEYXRhTWlncmF0aW9uRW5hYmxlZCA9ICdjaGF0LmN1c3RvbWl6YXRpb25zLnVzZXJEYXRhTWlncmF0aW9uLmVuYWJsZWQnLFxuXHRBdXRvcGlsb3RBZHZhbmNlZEVuYWJsZWQgPSAnY2hhdC5hdXRvcGlsb3QuYWR2YW5jZWQuZW5hYmxlZCcsXG5cdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwgPSAnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0Jyxcblx0QXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQgPSAnY2hhdC5hc3Npc3RlZFBlcm1pc3Npb25zLmVuYWJsZWQnLFxuXHRQZXJtaXNzaW9uc1NhbmRib3hUb2dnbGVFbmFibGVkID0gJ2NoYXQuZXhwZXJpbWVudGFsLnBlcm1pc3Npb25zU2FuZGJveFRvZ2dsZS5lbmFibGVkJyxcblx0RGVmYXVsdENvbmZpZ3VyYXRpb24gPSAnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsXG5cdERlZmF1bHRNb2RlbCA9ICdjaGF0LmRlZmF1bHRNb2RlbCcsXG5cdEltYWdlQ2Fyb3VzZWxFbmFibGVkID0gJ2ltYWdlQ2Fyb3VzZWwuY2hhdC5lbmFibGVkJyxcblx0QXJ0aWZhY3RzRW5hYmxlZCA9ICdjaGF0LmFydGlmYWN0cy5lbmFibGVkJyxcblx0QXJ0aWZhY3RzUnVsZXNCeU1pbWVUeXBlID0gJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5TWltZVR5cGUnLFxuXHRBcnRpZmFjdHNSdWxlc0J5RmlsZVBhdGggPSAnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlGaWxlUGF0aCcsXG5cdEFydGlmYWN0c1J1bGVzQnlNZW1vcnlGaWxlUGF0aCA9ICdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieU1lbW9yeUZpbGVQYXRoJyxcblx0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsID0gJ2NoYXQudG9vbHMuY29uZmlybWF0aW9uQ2Fyb3VzZWwuZW5hYmxlZCcsXG5cdFRvb2xSaXNrQXNzZXNzbWVudEVuYWJsZWQgPSAnY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkJyxcblx0VG9vbFJpc2tBc3Nlc3NtZW50TW9kZWwgPSAnY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5tb2RlbCcsXG5cdERlZmF1bHROZXdTZXNzaW9uTW9kZSA9ICdjaGF0Lm5ld1Nlc3Npb24uZGVmYXVsdE1vZGUnLFxuXHRFZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzcyA9ICdjaGF0LmVkaXRvci5wcmVmZXJDb3BpbG90SGFybmVzcycsXG5cdERlZmF1bHRUb0NvcGlsb3RIYXJuZXNzID0gJ2NoYXQuZGVmYXVsdFRvQ29waWxvdEhhcm5lc3MnLFxuXHREZWZhdWx0VG9Db2RleEhhcm5lc3MgPSAnY2hhdC5kZWZhdWx0VG9Db2RleEhhcm5lc3MnLFxuXHRFZGl0b3JMb2NhbEFnZW50RW5hYmxlZCA9ICdjaGF0LmVkaXRvci5sb2NhbEFnZW50LmVuYWJsZWQnLFxuXHRBZ2VudHNIYW5kb2ZmVGlwTW9kZSA9ICdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZScsXG5cdFR1cm5TdGF0dXNQaWxscyA9ICdjaGF0LnR1cm5TdGF0dXNQaWxscycsXG5cblx0SW5jcmVtZW50YWxSZW5kZXJpbmcgPSAnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuZW5hYmxlZCcsXG5cdEluY3JlbWVudGFsUmVuZGVyaW5nU3R5bGUgPSAnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUnLFxuXHRJbmNyZW1lbnRhbFJlbmRlcmluZ0J1ZmZlcmluZyA9ICdjaGF0LmV4cGVyaW1lbnRhbC5pbmNyZW1lbnRhbFJlbmRlcmluZy5idWZmZXJpbmcnLFxuXHRSaWNoTGlua3MgPSAnY2hhdC5leHBlcmltZW50YWwucmljaExpbmtzLmVuYWJsZWQnLFxuXG5cdENvbGxlY3RJbnN0cnVjdGlvbnNJbkV4dGVuc2lvbiA9ICdjaGF0LmV4cGVyaW1lbnRhbC5jb2xsZWN0SW5zdHJ1Y3Rpb25zSW5FeHRlbnNpb24nLFxuXHRJbXBsaWNpdENvbnRleHRBY3RpdmVFZGl0b3IgPSAnY2hhdC5pbXBsaWNpdENvbnRleHQuaW5jbHVkZUFjdGl2ZUVkaXRvcicsXG59XG5cbi8qKlxuICogVGhlIFwia2luZFwiIG9mIGFnZW50cyBmb3IgY3VzdG9tIGFnZW50cy5cbiAqL1xuZXhwb3J0IGVudW0gQ2hhdE1vZGVLaW5kIHtcblx0QXNrID0gJ2FzaycsXG5cdEVkaXQgPSAnZWRpdCcsXG5cdEFnZW50ID0gJ2FnZW50J1xufVxuXG4vKipcbiAqIFRoZSBwZXJtaXNzaW9uIGxldmVsIGNvbnRyb2xsaW5nIHRvb2wgYXV0by1hcHByb3ZhbCBiZWhhdmlvci5cbiAqL1xuZXhwb3J0IGVudW0gQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdC8qKiBVc2UgZXhpc3RpbmcgYXV0by1hcHByb3ZlIHNldHRpbmdzICovXG5cdERlZmF1bHQgPSAnZGVmYXVsdCcsXG5cdC8qKiBEZWxlZ2F0ZSBhcHByb3ZhbCBkZWNpc2lvbnMgdG8gYSBtb2RlbCAqL1xuXHRBc3Npc3RlZCA9ICdhc3Npc3RlZCcsXG5cdC8qKiBBdXRvLWFwcHJvdmUgYWxsIHRvb2wgY2FsbHMsIGF1dG8tcmV0cnkgb24gZXJyb3IgKi9cblx0QXV0b0FwcHJvdmUgPSAnYXV0b0FwcHJvdmUnLFxuXHQvKiogRXZlcnl0aGluZyBBdXRvQXBwcm92ZSBkb2VzIHBsdXMgYW4gaW50ZXJuYWwgc3RvcCBob29rIHRoYXQgY29udGludWVzIHVudGlsIHRoZSB0YXNrIGlzIGRvbmUgKi9cblx0QXV0b3BpbG90ID0gJ2F1dG9waWxvdCdcbn1cblxuY29uc3QgY2hhdFBlcm1pc3Npb25MZXZlbHMgPSBuZXcgU2V0PHN0cmluZz4oT2JqZWN0LnZhbHVlcyhDaGF0UGVybWlzc2lvbkxldmVsKSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRQZXJtaXNzaW9uTGV2ZWwobGV2ZWw6IHVua25vd24gfCB1bmRlZmluZWQpOiBsZXZlbCBpcyBDaGF0UGVybWlzc2lvbkxldmVsIHtcblx0cmV0dXJuIGNoYXRQZXJtaXNzaW9uTGV2ZWxzLmhhcyhsZXZlbCBhcyBzdHJpbmcpO1xufVxuXG4vKipcbiAqIFNoYXBlIG9mIHRoZSB7QGxpbmsgQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdENvbmZpZ3VyYXRpb259XG4gKiBvYmplY3Qgc2V0dGluZy4gQ29udHJvbHMgdGhlIHN0YXJ0aW5nIGBtb2RlYCBhbmQgYGFwcHJvdmFsc2AgZm9yIG5ldyBhZ2VudC1ob3N0XG4gKiBzZXNzaW9ucyAoc3VjaCBhcyBDb3BpbG90IENMSSkuIEFsbCBwcm9wZXJ0aWVzIGFyZSBvcHRpb25hbCBcdTIwMTQgYSBtaXNzaW5nIHByb3BlcnR5XG4gKiBmYWxscyBiYWNrIHRvIHRoZSBwZXItYXhpcyBkZWZhdWx0LlxuICovXG5leHBvcnQgdHlwZSBBZ2VudFNlc3Npb25Nb2RlID0gJ2ludGVyYWN0aXZlJyB8ICdwbGFuJyB8ICdhdXRvcGlsb3QnO1xuXG4vKiogQXBwcm92YWwgdmFsdWVzIGV4cG9zZWQgYnkgdGhlIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBzZXR0aW5nLiAqL1xuZXhwb3J0IGVudW0gQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwge1xuXHRNYW51YWwgPSAnbWFudWFsJyxcblx0QXNzaXN0ZWQgPSAnYXNzaXN0ZWQnLFxuXHRBbGxvd0FsbCA9ICdhbGxvd0FsbCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbiB7XG5cdC8qKiBTdGFydGluZyBhZ2VudCBtb2RlOiBgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC8gYGF1dG9waWxvdGAuICovXG5cdHJlYWRvbmx5IG1vZGU/OiBBZ2VudFNlc3Npb25Nb2RlO1xuXHQvKiogU3RhcnRpbmcgYXBwcm92YWwgbGV2ZWw6IGBtYW51YWxgIC8gYGFzc2lzdGVkYCAvIGBhbGxvd0FsbGAuICovXG5cdHJlYWRvbmx5IGFwcHJvdmFscz86IENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsO1xufVxuXG4vKiogTWFwcyBhIGRlZmF1bHQtY29uZmlndXJhdGlvbiB2YWx1ZSB0byB0aGUgaW50ZXJuYWwgQWdlbnQgSG9zdCBwZXJtaXNzaW9uIGxldmVsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENoYXRQZXJtaXNzaW9uTGV2ZWxGcm9tRGVmYXVsdENvbmZpZ3VyYXRpb24odmFsdWU6IHVua25vd24pOiBDaGF0UGVybWlzc2lvbkxldmVsIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdGNhc2UgQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwuTWFudWFsOlxuXHRcdGNhc2UgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0OlxuXHRcdFx0cmV0dXJuIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdDtcblx0XHRjYXNlIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkOlxuXHRcdFx0cmV0dXJuIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQ7XG5cdFx0Y2FzZSBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5BbGxvd0FsbDpcblx0XHRjYXNlIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmU6XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgcGVybWlzc2lvbiBsZXZlbCBlbmFibGVzIGF1dG8tYXBwcm92YWwgb2YgYWxsIHRvb2wgY2FsbHMuXG4gKiBCb3RoIHtAbGluayBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlfSBhbmQge0BsaW5rIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90fSBlbmFibGUgYXV0by1hcHByb3ZhbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0b0FwcHJvdmVMZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUgfHwgbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90O1xufVxuXG4vKipcbiAqIFRydWUgZm9yIHtAbGluayBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdH0gb25seS4gVW5saWtlIHtAbGluayBpc0F1dG9BcHByb3ZlTGV2ZWx9LCB0aGlzXG4gKiBleGNsdWRlcyB7QGxpbmsgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZX0sIHNvIGl0IGNhbiBnYXRlIEF1dG9waWxvdC1vbmx5IGJlaGF2aW9yIHN1Y2ggYXNcbiAqIHJpc2stYmFzZWQgc2tpcHBpbmcgb2YgdG9vbCBjYWxscy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQXV0b3BpbG90TGV2ZWwobGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdDtcbn1cblxuLy8gVGhpbmtpbmcgZGlzcGxheSBtb2RlcyBmb3IgcGlubmVkIGNvbnRlbnRcbmV4cG9ydCBlbnVtIFRoaW5raW5nRGlzcGxheU1vZGUge1xuXHRDb2xsYXBzZWQgPSAnY29sbGFwc2VkJyxcblx0Q29sbGFwc2VkUHJldmlldyA9ICdjb2xsYXBzZWRQcmV2aWV3Jyxcblx0Rml4ZWRTY3JvbGxpbmcgPSAnZml4ZWRTY3JvbGxpbmcnLFxufVxuXG5leHBvcnQgZW51bSBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlIHtcblx0T2ZmID0gJ29mZicsXG5cdFdpdGhUaGlua2luZyA9ICd3aXRoVGhpbmtpbmcnLFxuXHRBbHdheXMgPSAnYWx3YXlzJyxcbn1cblxuZXhwb3J0IGVudW0gQ2hhdE5vdGlmaWNhdGlvbk1vZGUge1xuXHRPZmYgPSAnb2ZmJyxcblx0V2luZG93Tm90Rm9jdXNlZCA9ICd3aW5kb3dOb3RGb2N1c2VkJyxcblx0QWx3YXlzID0gJ2Fsd2F5cycsXG59XG5cbmV4cG9ydCB0eXBlIFJhd0NoYXRQYXJ0aWNpcGFudExvY2F0aW9uID0gJ3BhbmVsJyB8ICd0ZXJtaW5hbCcgfCAnbm90ZWJvb2snIHwgJ2VkaXRpbmctc2Vzc2lvbic7XG5cbmV4cG9ydCBlbnVtIENoYXRBZ2VudExvY2F0aW9uIHtcblx0LyoqXG5cdCAqIFRoaXMgaXMgY2hhdCwgd2hldGhlciBpdCdzIGluIHRoZSBzaWRlYmFyLCBhIGNoYXQgZWRpdG9yLCBvciBxdWljayBjaGF0LlxuXHQgKiBMZWF2aW5nIHRoZSB2YWx1ZXMgYWxvbmUgYXMgdGhleSBhcmUgaW4gc3RvcmVkIGRhdGEgc28gd2UgZG9uJ3QgaGF2ZSB0byBub3JtYWxpemUgdGhlbS5cblx0ICovXG5cdENoYXQgPSAncGFuZWwnLFxuXHRUZXJtaW5hbCA9ICd0ZXJtaW5hbCcsXG5cdE5vdGVib29rID0gJ25vdGVib29rJyxcblx0LyoqXG5cdCAqIEVkaXRvcklubGluZSBtZWFucyBpbmxpbmUgY2hhdCBpbiBhIHRleHQgZWRpdG9yLlxuXHQgKi9cblx0RWRpdG9ySW5saW5lID0gJ2VkaXRvcicsXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEFnZW50TG9jYXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVJhdyh2YWx1ZTogUmF3Q2hhdFBhcnRpY2lwYW50TG9jYXRpb24gfCBzdHJpbmcpOiBDaGF0QWdlbnRMb2NhdGlvbiB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAncGFuZWwnOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0XHRcdGNhc2UgJ3Rlcm1pbmFsJzogcmV0dXJuIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsO1xuXHRcdFx0Y2FzZSAnbm90ZWJvb2snOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2s7XG5cdFx0XHRjYXNlICdlZGl0b3InOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lO1xuXHRcdH1cblx0XHRyZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDtcblx0fVxufVxuXG4vKipcbiAqIExpc3Qgb2YgZmlsZSBzY2hlbWVzIHRoYXQgYXJlIGFsd2F5cyB1bnN1cHBvcnRlZCBmb3IgdXNlIGluIGNoYXRcbiAqL1xuY29uc3QgY2hhdEFsd2F5c1Vuc3VwcG9ydGVkRmlsZVNjaGVtZXMgPSBuZXcgU2V0KFtcblx0U2NoZW1hcy52c2NvZGVDaGF0RWRpdG9yLFxuXHQvLyBDaGF0J3Mgb3duIHJlYWQtb25seSByZXNvdXJjZXMsIHN1Y2ggYXMgYSBwYXN0ZWQtdGV4dCBhcnRpZmFjdDogdGhlaXJcblx0Ly8gY29udGVudHMgYWxyZWFkeSByZWFjaCB0aGUgbW9kZWwgdGhyb3VnaCB0aGUgYXR0YWNobWVudCB0aGV5IGJlbG9uZyB0by5cblx0U2NoZW1hcy52c2NvZGVDaGF0UmVzcG9uc2VSZXNvdXJjZSxcblx0U2NoZW1hcy53YWxrVGhyb3VnaCxcblx0U2NoZW1hcy52c2NvZGVMb2NhbENoYXRTZXNzaW9uLFxuXHRTY2hlbWFzLnZzY29kZVNldHRpbmdzLFxuXHRTY2hlbWFzLndlYnZpZXdQYW5lbCxcblx0U2NoZW1hcy52c2NvZGVVc2VyRGF0YSxcblx0U2NoZW1hcy5leHRlbnNpb24sXG5cdCdjY3JlcScsXG5cdCdvcGVuYWktY29kZXgnLCAvLyBDb2RleCBzZXNzaW9uIGN1c3RvbSBlZGl0b3Igc2NoZW1lXG5dKTtcblxuLyoqIFNjaGVtZXMgd2hvc2UgbW9kZWxzIGFyZSBjaGF0IGlucHV0IGVkaXRvcnMuICovXG5leHBvcnQgY29uc3QgY2hhdElucHV0U2NoZW1lczogcmVhZG9ubHkgc3RyaW5nW10gPSBbU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIFNjaGVtYXMuc2Vzc2lvbnNDaGF0SW5wdXRdO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0SW5wdXRNb2RlbCh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY2hhdElucHV0U2NoZW1lcy5pbmNsdWRlcyh1cmkuc2NoZW1lKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNjaGVtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlKTtcblxuXHQvLyBFeGNsdWRlIHNjaGVtZXMgd2UgYWx3YXlzIGtub3cgYXJlIGJhZFxuXHRpZiAoY2hhdEFsd2F5c1Vuc3VwcG9ydGVkRmlsZVNjaGVtZXMuaGFzKHNjaGVtZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBQbHVzIGFueSBzY2hlbWVzIHVzZWQgYnkgY29udGVudCBwcm92aWRlcnNcblx0aWYgKGNoYXRTZXJ2aWNlLmdldENvbnRlbnRQcm92aWRlclNjaGVtZXMoKS5pbmNsdWRlcyhzY2hlbWUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gRXZlcnl0aGluZyBlbHNlIGlzIHN1cHBvcnRlZFxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBlZmZlY3RpdmUgZGVmYXVsdCBzZXNzaW9uIHR5cGUgZm9yIGEgbmV3IGNoYXQgaW4gdGhlIFZTIENvZGVcbiAqIGVkaXRvciB3aW5kb3cuXG4gKlxuICogVmlydHVhbCB3b3Jrc3BhY2VzIGFsd2F5cyBkZWZhdWx0IHRvIHtAbGluayBsb2NhbENoYXRTZXNzaW9uVHlwZX0uIE90aGVyd2lzZSxcbiAqIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCwgRm9yZ2UgY2FuIHByZWZlciBDb2RleCBvciB0aGUgQ29waWxvdFxuICogaGFybmVzcyB0aHJvdWdoIGl0cyBkZWZhdWx0LWhhcm5lc3Mgc2V0dGluZ3MuIEl0IGZhbGxzIGJhY2sgdG8gdGhlIGxvY2FsXG4gKiBoYXJuZXNzIHdoZW4gZW5hYmxlZCwgb3IgdG8gdGhlIGZpcnN0IHZpc2libGUgbm9uLWxvY2FsIHByb3ZpZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhblxuKTogc3RyaW5nIHtcblx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xuXHR9XG5cblx0aWYgKGFnZW50SG9zdEVuYWJsZWQgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29kZXhIYXJuZXNzKSkge1xuXHRcdHJldHVybiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleDtcblx0fVxuXG5cdGlmIChhZ2VudEhvc3RFbmFibGVkICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzKSkge1xuXHRcdHJldHVybiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90O1xuXHR9XG5cblx0aWYgKGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHdvcmtzcGFjZSkpIHtcblx0XHRyZXR1cm4gbG9jYWxDaGF0U2Vzc2lvblR5cGU7XG5cdH1cblxuXHRyZXR1cm4gZ2V0VmlzaWJsZU5vbkxvY2FsRWRpdG9yQ2hhdFNlc3Npb25UeXBlcyhjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKVswXSA/PyBsb2NhbENoYXRTZXNzaW9uVHlwZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25SZXNvdXJjZShcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0Y2hhdFNlc3Npb25zU2VydmljZTogUGljazxJQ2hhdFNlc3Npb25zU2VydmljZSwgJ2dldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uJyB8ICdnZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMnPixcblx0d29ya3NwYWNlOiBJV29ya3NwYWNlLFxuXHRhZ2VudEhvc3RFbmFibGVkOiBib29sZWFuXG4pOiBVUkkge1xuXHRjb25zdCBkZWZhdWx0VHlwZSA9IGdldENvbXB1dGVkRGVmYXVsdFNlc3Npb25UeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UsIGFnZW50SG9zdEVuYWJsZWQpO1xuXHRyZXR1cm4gZGVmYXVsdFR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlXG5cdFx0PyBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKVxuXHRcdDogVVJJLmZyb20oeyBzY2hlbWU6IGRlZmF1bHRUeXBlLCBwYXRoOiBgL3VudGl0bGVkLSR7Z2VuZXJhdGVVdWlkKCl9YCB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTmV3Q2hhdFNlc3Npb25UeXBlVXNhYmxlKFxuXHRzZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdGFnZW50SG9zdEVuYWJsZWQgPSB0cnVlLFxuKTogYm9vbGVhbiB7XG5cdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRyZXR1cm4gaXNFZGl0b3JMb2NhbEFnZW50RW5hYmxlZChjb25maWd1cmF0aW9uU2VydmljZSwgd29ya3NwYWNlKTtcblx0fVxuXHRpZiAoaXNBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpKSB7XG5cdFx0cmV0dXJuIGFnZW50SG9zdEVuYWJsZWQ7XG5cdH1cblx0cmV0dXJuIGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGVPcHRpb25zIHtcblx0cmVhZG9ubHkgZXhwbGljaXRPdmVycmlkZT86IHN0cmluZztcblx0cmVhZG9ubHkgY3VycmVudFNlc3Npb25UeXBlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZE5ld0NoYXRTZXNzaW9uVHlwZSB7XG5cdC8qKiBUaGUgc2Vzc2lvbiB0eXBlIHRvIG9wZW4gZm9yIHRoZSBuZXcgY2hhdC4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvblR5cGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhbixcblx0b3B0aW9ucz86IElEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlT3B0aW9uc1xuKTogc3RyaW5nIHtcblx0aWYgKG9wdGlvbnM/LmV4cGxpY2l0T3ZlcnJpZGUpIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5leHBsaWNpdE92ZXJyaWRlO1xuXHR9XG5cblx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xuXHR9XG5cblx0aWYgKGFnZW50SG9zdEVuYWJsZWQgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29kZXhIYXJuZXNzKSkge1xuXHRcdHJldHVybiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleDtcblx0fVxuXG5cdGNvbnN0IHJlbWVtYmVyZWQgPSBnZXRVc2FibGVSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UsIGFnZW50SG9zdEVuYWJsZWQpO1xuXHRpZiAocmVtZW1iZXJlZCkge1xuXHRcdHJldHVybiByZW1lbWJlcmVkO1xuXHR9XG5cblx0aWYgKG9wdGlvbnM/LmN1cnJlbnRTZXNzaW9uVHlwZSAmJiBpc05ld0NoYXRTZXNzaW9uVHlwZVVzYWJsZShvcHRpb25zLmN1cnJlbnRTZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCkpIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5jdXJyZW50U2Vzc2lvblR5cGU7XG5cdH1cblxuXHRyZXR1cm4gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdG9wdGlvbnM/OiBJRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZU9wdGlvbnNcbik6IElSZXNvbHZlZE5ld0NoYXRTZXNzaW9uVHlwZSB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKS5nZXRXb3Jrc3BhY2UoKTtcblx0Y29uc3QgYWdlbnRIb3N0RW5hYmxlZCA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UpLmVuYWJsZWQuZ2V0KCk7XG5cblx0aWYgKG9wdGlvbnM/LmV4cGxpY2l0T3ZlcnJpZGUpIHtcblx0XHRyZXR1cm4geyBzZXNzaW9uVHlwZTogb3B0aW9ucy5leHBsaWNpdE92ZXJyaWRlIH07XG5cdH1cblxuXHRpZiAoaXNWaXJ0dWFsV29ya3NwYWNlKHdvcmtzcGFjZSkpIHtcblx0XHRyZXR1cm4geyBzZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfTtcblx0fVxuXG5cdGlmIChhZ2VudEhvc3RFbmFibGVkICYmIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvZGV4SGFybmVzcykpIHtcblx0XHRyZXR1cm4geyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29kZXggfTtcblx0fVxuXG5cdGNvbnN0IHJlbWVtYmVyZWQgPSBnZXRVc2FibGVSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UsIGFnZW50SG9zdEVuYWJsZWQpO1xuXHRpZiAocmVtZW1iZXJlZCAmJiByZW1lbWJlcmVkICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdHJldHVybiB7IHNlc3Npb25UeXBlOiByZW1lbWJlcmVkIH07XG5cdH1cblxuXHRpZiAob3B0aW9ucz8uY3VycmVudFNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZVxuXHRcdCYmIGFnZW50SG9zdEVuYWJsZWRcblx0XHQmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzcykpIHtcblx0XHRyZXR1cm4geyBzZXNzaW9uVHlwZTogU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB9O1xuXHR9XG5cblx0cmV0dXJuIHsgc2Vzc2lvblR5cGU6IGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIGFnZW50SG9zdEVuYWJsZWQsIG9wdGlvbnMpIH07XG59XG5cbmZ1bmN0aW9uIGdldFVzYWJsZVJlbWVtYmVyZWRTZXNzaW9uVHlwZShcblx0c3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0Y2hhdFNlc3Npb25zU2VydmljZTogUGljazxJQ2hhdFNlc3Npb25zU2VydmljZSwgJ2dldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uJyB8ICdnZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMnPixcblx0d29ya3NwYWNlOiBJV29ya3NwYWNlLFxuXHRhZ2VudEhvc3RFbmFibGVkOiBib29sZWFuLFxuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVtZW1iZXJlZCA9IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSk7XG5cdHJldHVybiByZW1lbWJlcmVkICYmIGlzTmV3Q2hhdFNlc3Npb25UeXBlVXNhYmxlKHJlbWVtYmVyZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UsIGFnZW50SG9zdEVuYWJsZWQpID8gcmVtZW1iZXJlZCA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW4sXG5cdG9wdGlvbnM/OiBJRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZU9wdGlvbnNcbik6IFVSSSB7XG5cdGNvbnN0IGRlZmF1bHRUeXBlID0gZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCwgb3B0aW9ucyk7XG5cdHJldHVybiBkZWZhdWx0VHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGVcblx0XHQ/IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpXG5cdFx0OiBVUkkuZnJvbSh7IHNjaGVtZTogZGVmYXVsdFR5cGUsIHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0c2Vzc2lvblR5cGU6IHN0cmluZyxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhblxuKTogdm9pZCB7XG5cdGlmIChzZXNzaW9uVHlwZSA9PT0gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCkpIHtcblx0XHRjbGVhclVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlKTtcblx0fSBlbHNlIHtcblx0XHRzdG9yZVVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBzZXNzaW9uVHlwZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgd29ya3NwYWNlOiBJV29ya3NwYWNlKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1ZpcnR1YWxXb3Jrc3BhY2Uod29ya3NwYWNlKSB8fCBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JMb2NhbEFnZW50RW5hYmxlZCkgPT09IHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Zpc2libGVFZGl0b3JDaGF0U2Vzc2lvblR5cGUoXG5cdHNlc3Npb25UeXBlOiBzdHJpbmcsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZVxuKTogYm9vbGVhbiB7XG5cdGlmIChwcm9kdWN0LmFwcGxpY2F0aW9uTmFtZSA9PT0gJ2ZvcmdlLWFpJykge1xuXHRcdHJldHVybiBpc0ZvcmdlQWR2ZXJ0aXNlZFNlc3Npb25UeXBlSWQoc2Vzc2lvblR5cGUpICYmICEhY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRpZiAoc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0cmV0dXJuIGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHdvcmtzcGFjZSk7XG5cdH1cblxuXHRpZiAoc2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkNvcGlsb3RDTEkgfHwgc2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkNvcGlsb3RDbG91ZCB8fCBzZXNzaW9uVHlwZSA9PT0gU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCB8fCBzZXNzaW9uVHlwZSA9PT0gU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q2xhdWRlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuICEhY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG59XG5cbmZ1bmN0aW9uIGdldFZpc2libGVOb25Mb2NhbEVkaXRvckNoYXRTZXNzaW9uVHlwZXMoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZVxuKTogc3RyaW5nW10ge1xuXHRjb25zdCBzZXNzaW9uVHlwZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKSkge1xuXHRcdGlmIChjb250cmlidXRpb24udHlwZSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUgJiYgaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKGNvbnRyaWJ1dGlvbi50eXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKSkge1xuXHRcdFx0c2Vzc2lvblR5cGVzLmFkZChjb250cmlidXRpb24udHlwZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBBcnJheS5mcm9tKHNlc3Npb25UeXBlcyk7XG59XG5cbmV4cG9ydCBjb25zdCBNQU5BR0VfQ0hBVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2UnO1xuZXhwb3J0IGNvbnN0IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbkFnZW50SG9zdENoYXQnO1xuZXhwb3J0IGNvbnN0IENIQVRfU1VCQUdFTlRfUkVTT1VSQ0VfUVVFUllfUEFSQU0gPSAnc3ViYWdlbnRDaGF0UmVzb3VyY2UnO1xuXG5leHBvcnQgY29uc3QgT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93JztcbmV4cG9ydCBjb25zdCBPUEVOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5BZ2VudHNXaW5kb3cnO1xuZXhwb3J0IGNvbnN0IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0Q2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkfWApLFxuXHRJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQubmVnYXRlKClcbik7XG5cbmV4cG9ydCBjb25zdCBDaGF0RWRpdG9yVGl0bGVNYXhMZW5ndGggPSAzMDtcblxuZXhwb3J0IGNvbnN0IENIQVRfVEVSTUlOQUxfT1VUUFVUX01BWF9QUkVWSUVXX0xJTkVTID0gMTAwMDtcbmV4cG9ydCBjb25zdCBDT05URVhUX01PREVMU19FRElUT1IgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaW5Nb2RlbHNFZGl0b3InLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9NT0RFTFNfU0VBUkNIX0ZPQ1VTID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2luTW9kZWxzU2VhcmNoJywgZmFsc2UpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCLG1CQUFtQixzQkFBc0IsbUJBQW1CO0FBQzNGLFNBQVMsNkJBQTZC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LFNBQVMsMEJBQTBCLHNCQUE2QyxXQUFnQztBQUN0SCxTQUFPLG1CQUFtQixTQUFTLEtBQUsscUJBQXFCLFNBQWtCLDhEQUF5QyxNQUFNO0FBQy9IO0FBRU8sU0FBUywrQkFDZixhQUNBLHNCQUNBLHFCQUNBLFdBQ1U7QUFDVixNQUFJLFFBQVEsb0JBQW9CLFlBQVk7QUFDM0MsV0FBTywrQkFBK0IsV0FBVyxLQUFLLENBQUMsQ0FBQyxvQkFBb0IsMkJBQTJCLFdBQVc7QUFBQSxFQUNuSDtBQUVBLE1BQUksZ0JBQWdCLHNCQUFzQjtBQUN6QyxXQUFPLDBCQUEwQixzQkFBc0IsU0FBUztBQUFBLEVBQ2pFO0FBRUEsTUFBSSxnQkFBZ0IsWUFBWSxjQUFjLGdCQUFnQixZQUFZLGdCQUFnQixnQkFBZ0IsWUFBWSxvQkFBb0IsZ0JBQWdCLFlBQVksaUJBQWlCO0FBQ3RMLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxDQUFDLENBQUMsb0JBQW9CLDJCQUEyQixXQUFXO0FBQ3BFO0FBRUEsU0FBUyx5Q0FDUixzQkFDQSxxQkFDQSxXQUNXO0FBQ1gsUUFBTSxlQUFlLG9CQUFJLElBQVk7QUFDckMsYUFBVyxnQkFBZ0Isb0JBQW9CLCtCQUErQixHQUFHO0FBQ2hGLFFBQUksYUFBYSxTQUFTLHdCQUF3QiwrQkFBK0IsYUFBYSxNQUFNLHNCQUFzQixxQkFBcUIsU0FBUyxHQUFHO0FBQzFKLG1CQUFhLElBQUksYUFBYSxJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQ0EsU0FBTyxNQUFNLEtBQUssWUFBWTtBQUMvQjtBQUVPLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sdUNBQXVDO0FBQzdDLE1BQU0scUNBQXFDO0FBRTNDLE1BQU0sNkNBQTZDO0FBQ25ELE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sa0NBQWtDLGVBQWU7QUFBQSxFQUM3RCwyQkFBMkIsTUFBTSxPQUFPLE9BQU87QUFBQSxFQUMvQywyQkFBMkIsTUFBTSxvQkFBb0IsT0FBTztBQUFBLEVBQzVELHdCQUF3QixPQUFPO0FBQUEsRUFDL0IsZUFBZSxJQUFJLFVBQVUsdUNBQThCLEVBQUU7QUFBQSxFQUM3RCx5QkFBeUIsT0FBTztBQUNqQztBQUVPLE1BQU0sMkJBQTJCO0FBRWpDLE1BQU0seUNBQXlDO0FBQy9DLE1BQU0sd0JBQXdCLElBQUksY0FBdUIsa0JBQWtCLEtBQUs7QUFDaEYsTUFBTSw4QkFBOEIsSUFBSSxjQUF1QixrQkFBa0IsS0FBSzsiLAogICJuYW1lcyI6IFsiQllPS1V0aWxpdHlNb2RlbERlZmF1bHQiLCAiQ2hhdENvbmZpZ3VyYXRpb24iLCAiQ2hhdE1vZGVLaW5kIiwgIkNoYXRQZXJtaXNzaW9uTGV2ZWwiLCAiQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwiLCAiVGhpbmtpbmdEaXNwbGF5TW9kZSIsICJDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlIiwgIkNoYXROb3RpZmljYXRpb25Nb2RlIiwgIkNoYXRBZ2VudExvY2F0aW9uIl0KfQo=
