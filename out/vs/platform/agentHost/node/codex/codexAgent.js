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
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { CancellationError } from "../../../../base/common/errors.js";
import { Limiter, raceTimeout, retry } from "../../../../base/common/async.js";
import { fetchResourceMetadata } from "../../../../base/common/oauth.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase, isEqual } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { createSchema, platformRootSchema, platformSessionSchema, schemaProperty, AgentHostCodexMultiRootEnabledConfigKey, AgentHostMcpServersConfigKey } from "../../common/agentHostSchema.js";
import { createPricingMetaFromBilling, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID, createAgentModelSourceMeta } from "../../common/agentModelSource.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../../common/agentHostCustomizationConfig.js";
import { CODEX_ACCOUNT_META_KEY, CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY, CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY } from "../../common/codexAccount.js";
import { FORGE_MODELS_FILE_NAME, CODEX_MODELS_ROOT_CONFIG_KEY, codexProviderSecretResource, codexProviderStoredApiKeyEnv, isCodexProviderStoredApiKeyEnv, isEmptyCodexModelsConfig, normalizeCodexModelsConfig, preferCodexModelsConfig, withDefaultCodexRouting } from "../../common/codexModelsConfig.js";
import { DEEPSEEK_ACCOUNT_SECRET_RESOURCE, GROK_ACCOUNT_SECRET_RESOURCE } from "../../common/forgeVendorAccount.js";
import { findOfficialModelProvider, officialCardsEqual, remainingPercentFromUsed, removeOfficialModelProvider, resolveCodexOfficialRoute, shouldIncludeOfficialProviderInCodexPicker, upsertOfficialModelProvider } from "../../common/officialModelCards.js";
import { ForgeVendorAccountHost } from "../orchestration/forgeVendorAccountHost.js";
import { providerSecretId, setVendorAccountSecret } from "../orchestration/vendorAccountSecrets.js";
import { getReasoningEffortDescription, getReasoningEffortLabel, resolveDefaultReasoningEffort } from "../../common/reasoningEffort.js";
import { AgentSession, CODEX_AGENT_PROVIDER_ID, resolveAgentChatContext, resolveAgentHostInstructions } from "../../common/agent.js";
import { AgentHostCodexAgentBinaryArgsEnvVar, AgentHostCodexAgentCodexHomeEnvVar, AgentHostCodexAgentSdkRootEnvVar } from "../../common/agentService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../common/state/sessionProtocol.js";
import { ActionType, isChatAction } from "../../common/state/sessionActions.js";
import { parseLeadingSlashCommand } from "../../common/agentHostSlashCommand.js";
import { buildDefaultChatUri, isDefaultChatUri, parseRequiredSessionUriFromChatUri, withSessionWorkspaceless, CustomizationType, ToolResultContentType, ResponsePartKind } from "../../common/state/sessionState.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { McpCustomizationController } from "../shared/mcpCustomizationController.js";
import { buildCodexMcpReadResult, codexMcpListToInventory, codexMcpServersFromConfig, codexMcpToolsChanged, codexStartupErrorNeedsAuth, injectCodexMcpAuthTokens, inventoryToSdkServers, normalizeCodexMcpResourceUrl, translateCodexMcpStartupState } from "./codexMcpServers.js";
import { codexHooksToContainers, codexSelectedCapabilityRootCandidates, codexSkillsToContainers, discoverCodexWorkspaceAgents } from "./codexCustomizations.js";
import { CodexClientCustomizationStore, codexAgentRoleToml, codexCustomizationConfig, codexMcpServersFromPlugins, codexPluginMcpServerSources, codexSkillCapabilityRoots, codexSkillRootsFromPlugins, parsedPluginChildren } from "./codexClientCustomizations.js";
import { IAgentHostCustomizationEnablementService, targetForUnownedMcpServer } from "../agentHostCustomizationEnablementService.js";
import { isCustomizationSdkEligible, resolveCustomizationEnablement, targetForMcpServer } from "../shared/customizationEnablementGate.js";
import { isCustomizationEnabled } from "../../common/customizationEnablement.js";
import { buildElicitationRequest, cancelledElicitationResponse, declinedElicitationResponse, elicitationResponseFromAnswers } from "./codexElicitationMapper.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../files/common/files.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { parsePlugin } from "../../../agentPlugins/common/pluginParsers.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { IAgentHostSessionTitleSignal } from "../agentHostSessionTitleSignal.js";
import { IAgentHostCheckpointService } from "../../common/agentHostCheckpointService.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { extractForwardedErrorInfo } from "../shared/proxyChatError.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
import { IAgentSdkDownloader } from "../agentSdkDownloader.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { CodexAppServerClient, JsonRpcError, transportFromChildProcess } from "./codexAppServerClient.js";
import { getActiveForgeDiagnosticsLog } from "../forgeDiagnosticsLog.js";
import { ICodexProxyService } from "./codexProxyService.js";
import { createCodexSessionMapState, extractUserInputText, finalizeCodexTurnMapState, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapErrorNotification, mapFileChangeOutputDelta, mapFileChangePatchUpdated, mapFileChangeStarted, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnDiffUpdated, mapTurnStarted } from "./codexMapAppServerEvents.js";
import { unwrapShellInvocation } from "./codexShellCommand.js";
import { planForkedTurnIdMap, resolveForkBoundary } from "./codexForkPlan.js";
import { resolveCodexInput } from "./codexPromptResolver.js";
import { buildUserInputRequest, emptyUserInputResponse, userInputResponseFromAnswers } from "./codexUserInputMapper.js";
import { replayThreadToTurns } from "./codexReplayMapper.js";
import { CodexSessionMetadataStore } from "./codexSessionMetadataStore.js";
import { buildCodexLaunchConfig, buildCodexResumeParams, CODEX_APPLY_PATCH_STREAMING_FEATURE } from "./codexLaunchConfig.js";
import { codexDelegationDisplayText } from "./codexDelegation.js";
import { THREAD_LIST_MAX_PAGES, collectThreadListPages } from "./codexThreadList.js";
import { readCodexRolloutMetadata } from "./codexRolloutMetadata.js";
import { codexAccountRateLimitFromResponse, codexAccountStateFromResponse } from "./codexAccountState.js";
import { discoverCodexLocalModels } from "./codexLocalModelDiscovery.js";
import { CodexSessionConfigKey, CODEX_DEFAULT_PERMISSIONS_PRESET, CODEX_PERMISSIONS_PRESETS, collaborationModeKind, inferCodexPermissionsPreset, migrateCodexPermissionValues, narrowAdditionalDirectories, narrowBoolean, narrowCodexPermissionsPreset, narrowPersonality, narrowReasoningEffort, narrowReasoningSummary, narrowWebSearchMode, resolveCodexPermissions, resolveCodexPermissionsPreset } from "./codexSessionConfigKeys.js";
import { formatGuardianDenialNotification, summarizeGuardianReviewAction, toGuardianAssessmentEventJson } from "./codexGuardianReview.js";
import { CODEX_COMPACT_SLASH_COMMAND } from "../codexCompactCommand.js";
import { detectExistingCodexChatGPTSetup } from "./codexLocalAuth.js";
import { prepareForgeCodexHome, resolveForgeCodexHome } from "./codexHome.js";
import { CodexFileEditObserver } from "./codexFileEditObserver.js";
import { applyWriteFileTool, CODEX_WRITE_FILE_TOOL_NAME, parseWriteFileArgs, resolveWritableWorkspacePath, writeFileToolDefinition } from "./codexWriteFileTool.js";
const CLIENT_INFO = {
  name: "vscode_agent_host",
  title: "VS Code Agent Host",
  // The codex `clientInfo.version` is informational. Hardcoded to a
  // non-empty placeholder; bumping it isn't required when our code
  // changes.
  version: "0.1.0"
};
function summarizeCodexRpcMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { valueType: typeof message };
  }
  const record = message;
  const params = record["params"];
  const paramsRecord = params && typeof params === "object" && !Array.isArray(params) ? params : void 0;
  const identifiers = {};
  for (const key of ["threadId", "turnId", "itemId", "callId", "toolCallId", "conversationId", "id"]) {
    if (paramsRecord && paramsRecord[key] !== void 0) {
      identifiers[key] = paramsRecord[key];
    }
  }
  return {
    method: record["method"],
    id: record["id"],
    paramsKeys: paramsRecord ? Object.keys(paramsRecord) : void 0,
    identifiers,
    hasResult: Object.prototype.hasOwnProperty.call(record, "result"),
    error: record["error"]
  };
}
const CODEX_DESKTOP_ROLLOUT_PREFIX_LENGTH = 16 * 1024;
const CODEX_DESKTOP_ROLLOUT_PREFIX_CONCURRENCY = 8;
const CODEX_COLD_SESSION_READ_CONCURRENCY = 8;
const CODEX_DESKTOP_WORKSPACE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CODEX_DESKTOP_SESSION_META_PATTERN = /"type"\s*:\s*"session_meta".*"payload"\s*:\s*\{[^}]*"originator"\s*:\s*"Codex Desktop"/s;
const FORGE_LIVE_EDIT_INSTRUCTIONS = [
  "If your tool list includes a native apply_patch function or freeform tool, use that for workspace text edits.",
  "Otherwise you MUST use the write_file function tool: pass path plus the complete file contents in one call. Never split one file across multiple writes.",
  "Never invoke apply_patch, apply_patch.bat, or `codex.exe --codex-run-as-apply-patch` through shell_command. On Windows that wrapper cannot carry large or quoted patches and will fail. If a shell apply_patch call fails, do not retry it \u2014 switch to write_file or the native apply_patch tool.",
  "Do not use PowerShell Set-Content, Out-File, redirection, or scripts to write workspace source files.",
  "Shell commands remain appropriate for reading files, searching, testing, building, and other non-edit operations."
].join(" ");
function isCodexDesktopGeneratedWorkspace(cwd, userHome) {
  const relativePath = extUriBiasedIgnorePathCase.relativePath(userHome, URI.file(cwd));
  const segments = relativePath?.split("/");
  return segments?.length === 4 && segments[0].toLowerCase() === "documents" && segments[1].toLowerCase() === "codex" && CODEX_DESKTOP_WORKSPACE_DATE_PATTERN.test(segments[2]) && segments[3].length > 0;
}
const CODEX_THINKING_LEVEL_KEY = "thinkingLevel";
const USER_AGENT_PREFIX = "vscode_codex";
const CODEX_REASONING_EFFORTS = ["minimal", "low", "medium", "high"];
const CODEX_MCP_APP_CAPABILITIES = {
  serverTools: { listChanged: true },
  serverResources: {}
};
const MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX = "mcp_tool_call_approval_";
const MCP_TOOL_APPROVAL_ANSWER_ALLOW = "Allow";
const MCP_TOOL_APPROVAL_ANSWER_DECLINE = "__codex_mcp_decline__";
const CODEX_RESPONSES_ENDPOINT = "/responses";
const CODEX_COPILOT_MODEL_PROVIDER = "vscode-proxy";
const CODEX_OPENAI_MODEL_PROVIDER = "openai";
const CODEX_NON_OVERRIDABLE_BUILT_IN_MODEL_PROVIDERS = /* @__PURE__ */ new Set(["openai", "ollama", "lmstudio"]);
function isCodexNonOverridableBuiltInProvider(providerId) {
  return CODEX_NON_OVERRIDABLE_BUILT_IN_MODEL_PROVIDERS.has(providerId.toLowerCase());
}
function codexManagedModelProviderEdits(previous, next) {
  const edits = [];
  for (const provider of previous.providers) {
    if (!isCodexNonOverridableBuiltInProvider(provider.id) && !next.providers.some((candidate) => candidate.id === provider.id)) {
      edits.push({ keyPath: `model_providers.${provider.id}`, value: null, mergeStrategy: "replace" });
    }
  }
  for (const provider of next.providers) {
    if (isCodexNonOverridableBuiltInProvider(provider.id)) {
      continue;
    }
    if (provider.official && provider.baseUrl.trim() === "") {
      edits.push({ keyPath: `model_providers.${provider.id}`, value: null, mergeStrategy: "replace" });
      continue;
    }
    const envKey = provider.authMode === "stored" ? codexProviderStoredApiKeyEnv(provider.id) : provider.authMode === "environment" ? provider.envKey : "";
    edits.push(
      { keyPath: `model_providers.${provider.id}.name`, value: provider.name, mergeStrategy: "replace" },
      { keyPath: `model_providers.${provider.id}.wire_api`, value: provider.wireApi, mergeStrategy: "replace" },
      { keyPath: `model_providers.${provider.id}.requires_openai_auth`, value: false, mergeStrategy: "replace" },
      { keyPath: `model_providers.${provider.id}.base_url`, value: provider.baseUrl === "" ? null : provider.baseUrl, mergeStrategy: "replace" },
      { keyPath: `model_providers.${provider.id}.env_key`, value: envKey === "" ? null : envKey, mergeStrategy: "replace" }
    );
  }
  return edits;
}
const CODEX_MODEL_SELECTION_PREFIX = "@provider=";
function toCodexModelSelectionId(modelProvider, modelId) {
  return `${CODEX_MODEL_SELECTION_PREFIX}${encodeURIComponent(modelProvider)}:${encodeURIComponent(modelId)}`;
}
function parseCodexModelSelection(selection) {
  if (!selection.id.startsWith(CODEX_MODEL_SELECTION_PREFIX)) {
    return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
  }
  const separator = selection.id.indexOf(":", CODEX_MODEL_SELECTION_PREFIX.length);
  if (separator < CODEX_MODEL_SELECTION_PREFIX.length) {
    return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
  }
  try {
    return {
      modelProvider: decodeURIComponent(selection.id.slice(CODEX_MODEL_SELECTION_PREFIX.length, separator)),
      modelId: decodeURIComponent(selection.id.slice(separator + 1))
    };
  } catch {
    return { modelProvider: CODEX_COPILOT_MODEL_PROVIDER, modelId: selection.id };
  }
}
function createCodexModeSchema() {
  const base = platformSessionSchema.definition[SessionConfigKey.Mode].protocol;
  const kept = (base.enum ?? []).flatMap((value, index) => value === "autopilot" ? [] : [index]);
  return schemaProperty({
    ...base,
    enum: kept.map((index) => base.enum[index]),
    enumLabels: base.enumLabels && kept.map((index) => base.enumLabels[index]),
    enumDescriptions: base.enumDescriptions && kept.map((index) => base.enumDescriptions[index])
  });
}
const codexSessionConfigSchema = createSchema({
  [CodexSessionConfigKey.PermissionsPreset]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.permissionsPreset", "Permissions"),
    description: localize("codex.sessionConfig.permissionsPresetDescription", "How much Codex can do on its own before asking for approval. Default asks before deleting files, using the internet, or leaving the workspace."),
    enum: [...CODEX_PERMISSIONS_PRESETS],
    enumLabels: [
      localize("codex.sessionConfig.permissionsPreset.default", "Default Permissions"),
      localize("codex.sessionConfig.permissionsPreset.autoReview", "Auto-Review"),
      localize("codex.sessionConfig.permissionsPreset.fullAccess", "Full Access")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.permissionsPreset.defaultDescription", "Codex can read and edit files in the workspace and run routine local commands. It asks before deleting files, using the internet, or going beyond the workspace."),
      localize("codex.sessionConfig.permissionsPreset.autoReviewDescription", "Same workspace access as Default, but approval requests are routed through the auto-reviewer instead of prompting you."),
      localize("codex.sessionConfig.permissionsPreset.fullAccessDescription", "Codex can edit or delete files outside the workspace and use the internet without asking. Use only when you want full machine access.")
    ],
    default: CODEX_DEFAULT_PERMISSIONS_PRESET,
    sessionMutable: true
  }),
  [CodexSessionConfigKey.ApprovalPolicy]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.approvalPolicy", "Approvals"),
    description: localize("codex.sessionConfig.approvalPolicyDescription", "How Codex requests approval for tool calls."),
    enum: ["never", "on-request", "untrusted"],
    enumLabels: [
      localize("codex.sessionConfig.approvalPolicy.never", "No Escalations"),
      localize("codex.sessionConfig.approvalPolicy.onRequest", "Ask When Needed"),
      localize("codex.sessionConfig.approvalPolicy.untrusted", "Ask More Often")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.approvalPolicy.neverDescription", "Never ask for elevated permission; commands that cannot run in the sandbox are rejected."),
      localize("codex.sessionConfig.approvalPolicy.onRequestDescription", "Ask only when Codex determines a command needs elevated permission."),
      localize("codex.sessionConfig.approvalPolicy.untrustedDescription", "Ask before more command categories so you can review actions more closely.")
    ],
    default: "on-request",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.SandboxMode]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.sandboxMode", "Sandbox"),
    description: localize("codex.sessionConfig.sandboxModeDescription", "Filesystem and network restrictions applied to tool calls."),
    enum: ["read-only", "workspace-write", "danger-full-access"],
    enumLabels: [
      localize("codex.sessionConfig.sandboxMode.readOnly", "Read-Only"),
      localize("codex.sessionConfig.sandboxMode.workspaceWrite", "Workspace Write"),
      localize("codex.sessionConfig.sandboxMode.dangerFullAccess", "Full Access (Dangerous)")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.sandboxMode.readOnlyDescription", "Tool calls can read the workspace but cannot modify files."),
      localize("codex.sessionConfig.sandboxMode.workspaceWriteDescription", "Tool calls can read and write within the workspace; network is controlled separately."),
      localize("codex.sessionConfig.sandboxMode.dangerFullAccessDescription", "Tool calls have unrestricted disk and network access.")
    ],
    default: "workspace-write",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.WebSearchMode]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.webSearchMode", "Web Search"),
    description: localize("codex.sessionConfig.webSearchModeDescription", "Web-search tool availability for the model."),
    enum: ["disabled", "cached", "live"],
    enumLabels: [
      localize("codex.sessionConfig.webSearchMode.disabled", "Disabled"),
      localize("codex.sessionConfig.webSearchMode.cached", "Cached Only"),
      localize("codex.sessionConfig.webSearchMode.live", "Live")
    ],
    default: "disabled",
    sessionMutable: false
  }),
  [CodexSessionConfigKey.ModelReasoningEffort]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.modelReasoningEffort", "Reasoning Effort"),
    description: localize("codex.sessionConfig.modelReasoningEffortDescription", "Controls how much reasoning effort Codex uses."),
    enum: [...CODEX_REASONING_EFFORTS],
    enumLabels: CODEX_REASONING_EFFORTS.map(getReasoningEffortLabel),
    enumDescriptions: CODEX_REASONING_EFFORTS.map((effort) => getReasoningEffortDescription(effort) ?? ""),
    default: "medium",
    sessionMutable: true
  }),
  [SessionConfigKey.Mode]: createCodexModeSchema(),
  [CodexSessionConfigKey.Personality]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.personality", "Personality"),
    description: localize("codex.sessionConfig.personalityDescription", "Tone Codex uses when communicating."),
    enum: ["none", "friendly", "pragmatic"],
    enumLabels: [
      localize("codex.sessionConfig.personality.none", "Default"),
      localize("codex.sessionConfig.personality.friendly", "Friendly"),
      localize("codex.sessionConfig.personality.pragmatic", "Pragmatic")
    ],
    enumDescriptions: [
      localize("codex.sessionConfig.personality.noneDescription", "Use Codex's built-in default tone."),
      localize("codex.sessionConfig.personality.friendlyDescription", "Warmer, more conversational tone."),
      localize("codex.sessionConfig.personality.pragmaticDescription", "Terse, no-nonsense tone focused on actions.")
    ],
    default: "none",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.ReasoningSummary]: schemaProperty({
    type: "string",
    title: localize("codex.sessionConfig.reasoningSummary", "Reasoning Summary"),
    description: localize("codex.sessionConfig.reasoningSummaryDescription", "How Codex summarizes its reasoning in the response stream."),
    enum: ["auto", "concise", "detailed", "none"],
    enumLabels: [
      localize("codex.sessionConfig.reasoningSummary.auto", "Auto"),
      localize("codex.sessionConfig.reasoningSummary.concise", "Concise"),
      localize("codex.sessionConfig.reasoningSummary.detailed", "Detailed"),
      localize("codex.sessionConfig.reasoningSummary.none", "None")
    ],
    default: "auto",
    sessionMutable: true
  }),
  [CodexSessionConfigKey.AdditionalDirectories]: schemaProperty({
    type: "array",
    title: localize("codex.sessionConfig.additionalDirectories", "Additional Writable Directories"),
    description: localize("codex.sessionConfig.additionalDirectoriesDescription", "Absolute paths the sandbox is allowed to write to, in addition to the workspace. Only applies when Sandbox is Workspace Write."),
    items: { type: "string", title: localize("codex.sessionConfig.additionalDirectories.item", "Directory") },
    enumDynamic: true,
    default: [],
    sessionMutable: true
  }),
  [CodexSessionConfigKey.NetworkAccessEnabled]: schemaProperty({
    type: "boolean",
    title: localize("codex.sessionConfig.networkAccessEnabled", "Network"),
    description: localize("codex.sessionConfig.networkAccessEnabledDescription", "Allow sandboxed tool calls to make outbound network requests. Only applies when Sandbox is Workspace Write."),
    default: true,
    sessionMutable: true
  }),
  [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
});
const codexVisibleSessionConfigSchema = createSchema({
  [SessionConfigKey.Mode]: codexSessionConfigSchema.definition[SessionConfigKey.Mode],
  [CodexSessionConfigKey.PermissionsPreset]: codexSessionConfigSchema.definition[CodexSessionConfigKey.PermissionsPreset],
  [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
});
const codexSessionConfigDefaults = {
  [CodexSessionConfigKey.PermissionsPreset]: CODEX_DEFAULT_PERMISSIONS_PRESET,
  [CodexSessionConfigKey.ApprovalPolicy]: "on-request",
  [CodexSessionConfigKey.SandboxMode]: "workspace-write",
  [CodexSessionConfigKey.WebSearchMode]: "disabled",
  [CodexSessionConfigKey.ModelReasoningEffort]: "medium",
  [CodexSessionConfigKey.AdditionalDirectories]: [],
  [CodexSessionConfigKey.NetworkAccessEnabled]: true,
  [SessionConfigKey.Mode]: "interactive",
  [CodexSessionConfigKey.Personality]: "none",
  [CodexSessionConfigKey.ReasoningSummary]: "auto"
};
function distinctAbsolutePaths(paths) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const path of paths) {
    const normalized = normalize(path);
    const key = filesystemPathComparisonKey(normalized);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}
function distinctWorkingDirectories(directories) {
  if (!directories) {
    return void 0;
  }
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const directory of directories) {
    const path = normalize(directory.fsPath);
    const key = filesystemPathComparisonKey(path);
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(directory);
    }
  }
  return result.length > 0 ? result : void 0;
}
function filesystemPathComparisonKey(path) {
  if (!isAbsolute(path)) {
    return void 0;
  }
  const resource = extUriBiasedIgnorePathCase.removeTrailingPathSeparator(URI.file(path));
  return extUriBiasedIgnorePathCase.getComparisonKey(resource);
}
const CodexPrewarmTtlMs = 6e4;
function toRolloutModelSelection(model) {
  return model ? { id: toCodexModelSelectionId(model.modelProvider, model.modelId) } : void 0;
}
function toRolloutTurnModels(metadata) {
  if (!metadata || metadata.modelsByTurnId.size === 0) {
    return void 0;
  }
  return new Map([...metadata.modelsByTurnId].map(([turnId, model]) => [turnId, { id: toCodexModelSelectionId(model.modelProvider, model.modelId) }]));
}
const CodexSdkPackage = {
  id: "codex",
  displayName: "Codex",
  devOverrideEnvVar: AgentHostCodexAgentSdkRootEnvVar,
  hasSeparateMuslLinuxPackage: false
};
function dynamicToolResponseFromResult(result) {
  const contentItems = [];
  for (const c of result.content ?? []) {
    if (c.type === ToolResultContentType.Text) {
      contentItems.push({ type: "inputText", text: c.text });
    }
  }
  if (contentItems.length === 0) {
    const summary = typeof result.pastTenseMessage === "string" && result.pastTenseMessage.length > 0 ? result.pastTenseMessage : result.success ? "Tool completed with no output." : "Tool failed with no output.";
    contentItems.push({ type: "inputText", text: summary });
  }
  return { contentItems, success: result.success };
}
function toolsSignature(tools) {
  if (!tools || tools.length === 0) {
    return "";
  }
  return tools.map((t) => `${t.name}\0${t.description ?? ""}\0${JSON.stringify(t.inputSchema ?? null)}`).sort().join("");
}
function mcpServersSignature(servers) {
  const names = Object.keys(servers).sort();
  return names.map((name) => `${name}\0${JSON.stringify(servers[name])}`).join("");
}
function encodeCodexChat(chat) {
  return JSON.stringify(chat);
}
function decodeCodexChat(data) {
  if (data === void 0) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed.sessionId === "string") {
      return parsed;
    }
  } catch {
  }
  return void 0;
}
class CodexActiveClientHandle {
  constructor(_resolveSession, clientId, displayName, _onToolsSet, _syncCustomizations) {
    this._resolveSession = _resolveSession;
    this.clientId = clientId;
    this.displayName = displayName;
    this._onToolsSet = _onToolsSet;
    this._syncCustomizations = _syncCustomizations;
    this._tools = [];
    this._customizations = [];
  }
  get tools() {
    return this._tools;
  }
  set tools(tools) {
    this._tools = tools;
    this._resolveSession()?.clientToolSet.set(this.clientId, tools);
    this._onToolsSet(tools);
  }
  get customizations() {
    return this._customizations;
  }
  set customizations(customizations) {
    this._customizations = customizations;
    const session = this._resolveSession();
    if (session) {
      this._syncCustomizations(session, customizations);
    }
  }
  remove() {
    const session = this._resolveSession();
    if (session) {
      session.clientToolSet.delete(this.clientId);
      session.clientCustomizations.removeClient(this.clientId);
    }
  }
}
function narrowFileChangeDecision(decision) {
  switch (decision) {
    case "accept":
    case "acceptForSession":
    case "decline":
    case "cancel":
      return decision;
    default:
      return "decline";
  }
}
let CodexAgent = class extends Disposable {
  constructor(_logService, _copilotApiService, _codexProxyService, _configurationService, _gitHubEndpointService, _checkpointService, _agentSdkDownloader, _productService, _pluginManager, _fileService, _environmentService, _instantiationService, _sessionDataService, _otelService, _customizationEnablementService, sessionTitleSignal) {
    super();
    this._logService = _logService;
    this._copilotApiService = _copilotApiService;
    this._codexProxyService = _codexProxyService;
    this._configurationService = _configurationService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._checkpointService = _checkpointService;
    this._agentSdkDownloader = _agentSdkDownloader;
    this._productService = _productService;
    this._pluginManager = _pluginManager;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._instantiationService = _instantiationService;
    this._sessionDataService = _sessionDataService;
    this._otelService = _otelService;
    this._customizationEnablementService = _customizationEnablementService;
    this.id = CODEX_AGENT_PROVIDER_ID;
    this._onDidChatProgress = this._register(new Emitter());
    this.onDidChatProgress = this._onDidChatProgress.event;
    this._onDidMaterializeChat = this._register(new Emitter());
    this.onDidMaterializeChat = this._onDidMaterializeChat.event;
    /** Codex's peer-chat backing blob never changes after creation, so this never fires. */
    this.onDidChangeChatData = Event.None;
    /**
     * Codex subagent spawns are detected from the `subagent_started` signal on
     * {@link onDidChatProgress} (see {@link SubagentChatSignal}), so the agent
     * never fires this membership channel itself.
     */
    this.onDidSpawnChat = Event.None;
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    this._desktopThreadIds = /* @__PURE__ */ new Set();
    this._desktopRolloutPrefixLimiter = this._register(new Limiter(CODEX_DESKTOP_ROLLOUT_PREFIX_CONCURRENCY));
    this._coldSessionReadLimiter = this._register(new Limiter(CODEX_COLD_SESSION_READ_CONCURRENCY));
    this._openAIAccountState = { usageSource: "openai", status: "unknown" };
    this._providerConfigurationValues = {};
    this._providerConfigurationWrite = Promise.resolve();
    this._providerConfigurationReady = false;
    this._pendingProviderConfigurationWrite = false;
    this._forgeModelsReady = false;
    /** Keyed by caller-facing sessionId (the URI host). */
    this._sessions = /* @__PURE__ */ new Map();
    /** Native diff snapshots keyed by Codex thread id (parent and subagent). */
    this._fileEditObservers = this._register(new DisposableMap());
    /** Keyed by `${chat.toString()}\u0000${clientId}` — exact-chat, exact-client membership; no session- or sibling-level entries. */
    this._activeClientHandles = /* @__PURE__ */ new Map();
    /** Host-supplied chat URI to Codex session id routing. */
    this._sessionIdByChatUri = /* @__PURE__ */ new Map();
    /** Inverse map: codex threadId → caller-facing sessionId, for routing codex notifications back to sessions. */
    this._sessionIdByThreadId = /* @__PURE__ */ new Map();
    /** Managed directories retained by non-destructively released sessions. */
    this._releasedManagedWorkingDirectories = /* @__PURE__ */ new Map();
    /**
     * Chats currently registered under each host session's configuration
     * scope ({@link IAgentChatContext.configurationResource}), keyed by the
     * scope's URI string. Used purely to detect when the last chat for a
     * scope has been disposed so the scope's managed working directory (if
     * any) can be reclaimed — Agent Host owns chat roles, so Codex never
     * infers "this is the default chat" here, only bare membership.
     */
    this._configScopeChats = /* @__PURE__ */ new Map();
    /**
     * Inverse of {@link _configScopeChats}: the exact scope key a chat was
     * registered under, keyed by chat URI string. Recorded at track time so
     * untracking always agrees with the original registration even when a
     * chat's runtime binding (its backing thread id) differs from the scope
     * it was created under — e.g. a peer chat backed by its own thread.
     */
    this._configScopeByChat = /* @__PURE__ */ new Map();
    /**
     * Live subagent (collab-agent) child threads, keyed by the child codex
     * thread id. Populated when a parent session's `spawnAgent` collab tool
     * call completes (carrying the child `receiverThreadIds`); the child's
     * subsequent `turn/*` and `item/*` notifications route here instead of
     * {@link _sessionIdByThreadId}. Removed on the child's `turn/completed`.
     */
    this._subagentsByThreadId = /* @__PURE__ */ new Map();
    /** Preserve app-server ordering while asynchronous file previews are persisted. */
    this._fileEventDispatches = /* @__PURE__ */ new Map();
    /**
     * Connection-global MCP server inventory reported by the codex
     * app-server (`mcpServerStatus/list` + `mcpServer/startupStatus/updated`).
     * Codex owns MCP servers at the process level — shared across every
     * thread — so the inventory lives on the agent and is mirrored onto each
     * session's {@link ICodexSession.mcpController}. Keyed by server name.
     */
    this._mcpInventory = /* @__PURE__ */ new Map();
    /**
     * OAuth bearer tokens acquired for auth-gated http MCP servers, keyed by
     * the server's {@link normalizeCodexMcpResourceUrl | normalized URL}.
     * Populated by {@link handleAuthenticationToken} after the workbench
     * completes the sign-in, then injected into the per-thread `http_headers`
     * by {@link _buildSessionMcpServers}. Process-global: a token for a given
     * server URL applies to every session/thread that uses it (codex runs one
     * shared app-server).
     */
    this._mcpAuthTokens = /* @__PURE__ */ new Map();
    /**
     * Association from a normalized OAuth `resource` (what the workbench
     * authenticates) to the normalized MCP server URL(s) it unlocks. RFC 9728
     * discovery can return a `resource` that differs from the configured server
     * URL (e.g. root `https://host/` for a `https://host/mcp` endpoint), so the
     * token the workbench pushes back is keyed by the resource, not the server
     * URL. Recorded in {@link _surfaceMcpAuthRequired} at discovery time and
     * read by {@link handleAuthenticationToken} to route the token to the right
     * server(s).
     */
    this._mcpAuthServerUrlsByResource = /* @__PURE__ */ new Map();
    this._modelProviderApiKeys = /* @__PURE__ */ new Map();
    this._connection = { kind: "idle" };
    this._connectionGeneration = 0;
    this._onDidDiscoverChats = this._register(new Emitter({
      onDidAddFirstListener: () => {
        void this._startCodexChatDiscovery();
      }
    }));
    this.onDidDiscoverChats = this._onDidDiscoverChats.event;
    this._copilotModels = [];
    this._codexModels = [];
    this._localModelDiscoveryCache = /* @__PURE__ */ new Map();
    // ---- Chat surface ------------------------------------------------------
    //
    // Codex supports multiple chats per session, and every one of them — the
    // chat a session is provisioned with as much as any later one, fresh or
    // forked — is created through the one `createChat` seam and backed by its
    // own top-level Codex thread bound to the concrete chat URI AH supplies.
    // While the owning session has no backing yet, the chat's runtime adopts the
    // session's own identity so every session-addressed call keeps resolving;
    // any further chat is identified by the thread it mints and reports it as a
    // `backingSession` so the orchestrator suppresses it from the top-level
    // session list. Addressed operations resolve only through an explicit
    // binding or transient host context.
    /**
     * The chat-addressed operation surface for the conversations within a
     * session. Creation is one method running one algorithm
     * ({@link _createChat}) for every form — fresh or forked
     * ({@link IAgentCreateChatOptions.fork}), a session's first chat or an
     * additional one — so there is no caller-visible chat classification and no
     * second creation entry point. The remaining methods operate on the concrete
     * chat URI AH has already bound to a runtime.
     */
    this.chats = {
      createChat: (chat, context, options) => {
        return this._createChat(chat, resolveAgentChatContext(context, chat), options);
      },
      disposeChat: (chat, context) => this._disposeChat(chat, context),
      releaseChat: (chat, context) => this._releaseChat(chat, context),
      sendMessage: (chat, prompt, workingDirectoriesOrDirectory, attachments, turnId, _senderClientId, clientTypeOrContext, context) => {
        const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : void 0;
        const operationContext = context ?? (typeof clientTypeOrContext === "string" ? void 0 : clientTypeOrContext);
        return this._sendMessage(chat, prompt, attachments, turnId, workingDirectories, operationContext);
      },
      abort: (chat, context) => {
        return this._abort(chat, context);
      },
      changeModel: (chat, model, context) => {
        return this._changeModel(chat, model, context);
      },
      changeAgent: (chat, agent, context) => this._changeAgent(chat, agent, context),
      getMessages: (chat, context) => {
        return this._getChatMessages(chat, context);
      }
    };
    this._configuredCodexHome = process.env[AgentHostCodexAgentCodexHomeEnvVar];
    this._codexHome = resolveForgeCodexHome(this._environmentService.userHome.fsPath, this._configuredCodexHome);
    this._metadataStore = this._instantiationService.createInstance(CodexSessionMetadataStore);
    this._publishAccountInfo({ status: "unknown" });
    this._register(sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, conversationId, title }) => {
      if (provider === this.id) {
        this._otelService.emitSessionTitleChanged(conversationId, session.toString(), title);
      }
    }));
    this._hydrateForgeModelsFromDisk();
    this._logService.info(`[Codex] model cards: ${this._forgeModelsFilePath()}`);
    this._register(this._configurationService.onDidRootConfigChange(() => {
      const signInRequest = this._configurationService.getRootConfigValues?.()[CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY];
      if (typeof signInRequest === "string" && signInRequest !== this._lastSignInRequest) {
        this._lastSignInRequest = signInRequest;
        this._configurationService.updateRootConfig({ [CODEX_ACCOUNT_SIGN_IN_REQUEST_KEY]: void 0 });
        void this._signInToChatGPT(signInRequest);
      }
      const signOutRequest = this._configurationService.getRootConfigValues?.()[CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY];
      if (typeof signOutRequest === "string" && signOutRequest !== this._lastSignOutRequest) {
        this._lastSignOutRequest = signOutRequest;
        this._configurationService.updateRootConfig({ [CODEX_ACCOUNT_SIGN_OUT_REQUEST_KEY]: void 0 });
        void this._signOutOfChatGPT();
      }
      this._startModelRefreshForExistingChatGPTSetup();
      this._queueProviderConfigurationWrite();
    }));
    void this._refreshProviderConfiguration();
    this._startModelRefreshForExistingChatGPTSetup();
  }
  _setOpenAIAccountState(state, _publish = true) {
    this._openAIAccountState = state;
    if (state.status !== "signedIn" || state.authType !== "chatgpt") {
      this._openAIAccountRateLimit = void 0;
    }
    if (_publish) {
      this._publishAccountInfo(this._toAccountInfo(state));
    }
  }
  _publishAccountInfo(account) {
    getActiveForgeDiagnosticsLog()?.record("agent", "ACCOUNT.STATUS", {
      status: account.status,
      email: account.email,
      planType: account.planType,
      requiresOpenaiAuth: account.requiresOpenaiAuth,
      rateLimit: account.rateLimit,
      hasAuthUrl: !!account.authUrl,
      error: account.error
    });
    this._configurationService.publishRootTransientValues?.({ [CODEX_ACCOUNT_META_KEY]: account });
  }
  async _signInToChatGPT(request) {
    const progressInterest = this._agentSdkDownloader.acquireDownloadProgressInterest(CodexSdkPackage);
    try {
      if (!await this._isSdkResolvableWithoutDownload()) {
        this._publishAccountInfo({ status: "downloading" });
      }
      const connection = await this._ensureConnection();
      const account = await this._refreshAccount(connection.client);
      if (account.status === "signedIn" && account.authType === "chatgpt") {
        return;
      }
      const response = await connection.client.request("account/login/start", { type: "chatgpt" });
      if (response.type === "chatgpt") {
        this._publishAccountInfo({ ...this._toAccountInfo(this._openAIAccountState), authUrl: response.authUrl, authUrlNonce: request });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._setOpenAIAccountState({ usageSource: "openai", status: "error", error: message });
    } finally {
      progressInterest.dispose();
    }
  }
  async _signOutOfChatGPT() {
    try {
      const connection = await this._ensureConnection();
      await connection.client.request("account/logout", void 0);
      await this._refreshAccount(connection.client);
      this._syncOfficialCodexCard([]);
      this._queueModelRefresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._setOpenAIAccountState({ usageSource: "openai", status: "error", error: message });
    }
  }
  _toAccountInfo(state) {
    return {
      status: state.status,
      email: state.authType === "chatgpt" ? state.email : void 0,
      planType: state.authType === "chatgpt" ? state.planType : void 0,
      requiresOpenaiAuth: state.requiresOpenaiAuth,
      rateLimit: state.authType === "chatgpt" ? this._openAIAccountRateLimit : void 0,
      error: state.status === "error" ? state.error : void 0
    };
  }
  _resetSessionForModelProviderChange(session, modelProvider) {
    if (session.threadId === void 0) {
      return;
    }
    this._logService.info(`[Codex:${session.sessionId}] replacing thread ${session.threadId} with a fresh ${modelProvider} thread`);
    this._sessionIdByThreadId.delete(session.threadId);
    session.threadId = void 0;
    session.materializePromise = void 0;
    session.materializedToolsSig = void 0;
    session.materializedMcpSig = void 0;
    session.materializedCustomizationsSig = void 0;
    session.materializedPermissionsSig = void 0;
    session.materializedModelProvider = void 0;
    session.needsResume = false;
    session.hostTurnIdByAppTurnId.clear();
    session.codexTurnIdByHostTurnId.clear();
  }
  // #region Auth
  getProtectedResources() {
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    const modelProviders = normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()[CODEX_MODELS_ROOT_CONFIG_KEY]).providers.filter((provider) => provider.authMode === "stored").map((provider) => ({
      resource: codexProviderSecretResource(provider.id),
      resource_name: provider.name || provider.id,
      bearer_methods_supported: ["header"],
      required: false
    }));
    return [
      this._hasExistingChatGPTSetup() ? { ...copilotResource, required: false } : copilotResource,
      this._gitHubEndpointService.getRepoResource(),
      {
        resource: GROK_ACCOUNT_SECRET_RESOURCE,
        resource_name: "Grok Build",
        bearer_methods_supported: ["header"],
        required: false
      },
      {
        resource: DEEPSEEK_ACCOUNT_SECRET_RESOURCE,
        resource_name: "DeepSeek Harness",
        bearer_methods_supported: ["header"],
        required: false
      },
      ...modelProviders
    ];
  }
  async authenticate(resource, token) {
    if (ForgeVendorAccountHost.consumeAuthenticate(resource, token)) {
      return true;
    }
    const configuredProvider = normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()[CODEX_MODELS_ROOT_CONFIG_KEY]).providers.find((provider) => provider.authMode === "stored" && codexProviderSecretResource(provider.id) === resource);
    if (configuredProvider) {
      setVendorAccountSecret(providerSecretId(configuredProvider.id), token || void 0);
      const previous = this._modelProviderApiKeys.get(configuredProvider.id);
      if (token) {
        this._modelProviderApiKeys.set(configuredProvider.id, token);
      } else {
        this._modelProviderApiKeys.delete(configuredProvider.id);
      }
      if (previous !== (token || void 0)) {
        const pendingConfigurationWrite = this._providerConfigurationWrite;
        const connectionGeneration = this._connectionGeneration;
        void pendingConfigurationWrite.finally(() => {
          const current = this._modelProviderApiKeys.get(configuredProvider.id);
          if (current === (token || void 0) && connectionGeneration === this._connectionGeneration) {
            this._disposeConnection();
            void this._queueModelRefresh();
          }
        });
      }
      this._logService.info(`[Codex] API key ${token ? "updated" : "cleared"} for model provider ${configuredProvider.id}`);
      return true;
    }
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    const normalizedToken = token || void 0;
    const changed = this._githubToken !== normalizedToken;
    this._githubToken = normalizedToken;
    if (changed && this._connection.kind === "ready" && this._connection.proxyHandle) {
      this._connection.proxyHandle.setToken(normalizedToken ?? "");
      this._queueModelRefresh();
    } else if (changed) {
      this._queueModelRefresh();
    }
    this._logService.info(normalizedToken ? "[Codex] Auth token updated" : "[Codex] Auth token cleared");
    void this._refreshProviderConfiguration();
    return true;
  }
  /**
   * Receives a bearer token the workbench acquired for a protected resource
   * (the `authenticate` command is fanned out to every agent). If the
   * resource maps to one or more configured auth-gated http MCP servers
   * (via the association recorded at discovery time, or a direct URL match),
   * store the token per server URL (so {@link _buildSessionMcpServers} injects
   * it) and reconnect the affected threads so codex picks it up. This is the
   * codex end of the *same* OAuth mechanism the Copilot agent uses: the
   * workbench does the sign-in, the agent injects the resulting bearer.
   * Returns whether the token was consumed by an MCP server (the GitHub agent
   * token flows through {@link authenticate} instead).
   */
  async handleAuthenticationToken(params) {
    const normalizedResource = normalizeCodexMcpResourceUrl(params.resource);
    if (normalizedResource === void 0) {
      return false;
    }
    const serverUrls = new Set(this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? []);
    if (this._isConfiguredHttpServerUrl(normalizedResource)) {
      serverUrls.add(normalizedResource);
    }
    if (serverUrls.size === 0) {
      return false;
    }
    let changed = false;
    for (const serverUrl of serverUrls) {
      if (this._mcpAuthTokens.get(serverUrl) !== params.token) {
        this._mcpAuthTokens.set(serverUrl, params.token);
        changed = true;
      }
    }
    if (!changed) {
      return true;
    }
    this._logService.info(`[Codex] stored MCP auth token for ${params.resource}; reconnecting affected sessions`);
    await this._reconnectSessionsForMcpAuth(serverUrls);
    return true;
  }
  /** Whether `normalizedUrl` is a currently-configured http MCP server (root config or any session's client plugins). */
  _isConfiguredHttpServerUrl(normalizedUrl) {
    if (Object.values(codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey))).some((server) => server.url !== void 0 && normalizeCodexMcpResourceUrl(server.url) === normalizedUrl)) {
      return true;
    }
    return [...this._sessions.values()].some(
      (session) => [...this._httpMcpServerUrls(session).values()].includes(normalizedUrl)
    );
  }
  /**
   * Reconnects every materialized session whose merged MCP servers include one
   * of `normalizedUrls` so codex re-reads `config.mcp_servers` with the
   * injected `Authorization` header. A thread that has not yet committed a
   * turn is restarted (`thread/start`, lossless); one with history is resumed
   * (`thread/resume` carries the same `config` field, loading history from the
   * rollout) on its next turn via {@link ICodexSession.needsResume}.
   */
  async _reconnectSessionsForMcpAuth(normalizedUrls) {
    for (const session of this._sessions.values()) {
      if (session.disposed || session.threadId === void 0) {
        continue;
      }
      if (![...this._httpMcpServerUrls(session).values()].some((url) => normalizedUrls.has(url))) {
        continue;
      }
      if (!session.firstTurnSent) {
        try {
          await this._restartThreadWithCurrentTools(session);
        } catch (err) {
          this._logService.warn(`[Codex:${session.sessionId}] reconnect after MCP auth failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        this._markSessionForReload(session);
      }
    }
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh — from
   * an account change or an earlier tick — rather than issuing a
   * second enumeration, and never rejects: {@link _refreshModels} logs and
   * applies its own stale-write guards on failure.
   */
  refreshModels() {
    return this._modelsRefreshPromise ?? this._queueModelRefresh();
  }
  _queueModelRefresh() {
    if (this._store.isDisposed) {
      return Promise.resolve();
    }
    const refreshPromise = this._refreshModels().finally(() => {
      if (this._modelsRefreshPromise === refreshPromise) {
        this._modelsRefreshPromise = void 0;
      }
    });
    this._modelsRefreshPromise = refreshPromise;
    return refreshPromise;
  }
  _ensureModelProviderAuthenticated(model) {
    const modelProvider = model ? parseCodexModelSelection(model).modelProvider : CODEX_COPILOT_MODEL_PROVIDER;
    if (modelProvider !== CODEX_COPILOT_MODEL_PROVIDER) {
      return;
    }
    const token = this._githubToken;
    if (!token) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        "Authentication is required to use Codex",
        this.getProtectedResources()
      );
    }
  }
  _imageGenerationEnabledForModelProvider(modelProvider) {
    return modelProvider === CODEX_OPENAI_MODEL_PROVIDER && this._openAIAccountState.status === "signedIn" && this._openAIAccountState.authType === "chatgpt";
  }
  _defaultModel() {
    const models = this._models.get();
    const chosen = models[0];
    return chosen ? { id: chosen.id } : void 0;
  }
  _supportedModelOrUndefined(model) {
    if (model && this._models.get().some((m) => m.id === model.id)) {
      return model;
    }
    if (model) {
      this._logService.warn(`[Codex] Unknown model '${model.id}'`);
      return void 0;
    }
    return this._defaultModel();
  }
  async _resolveModel(session) {
    if (this._models.get().length === 0 && this._modelsRefreshPromise) {
      await this._modelsRefreshPromise;
    }
    const selected = this._supportedModelOrUndefined(session.model);
    if (selected) {
      session.model = selected;
      return selected;
    }
    throw new Error("Codex has no available models.");
  }
  _createReasoningEffortConfigSchema(supportedEfforts, declaredDefault, modelId) {
    if (!supportedEfforts?.length) {
      return void 0;
    }
    const efforts = supportedEfforts.map((option) => option.reasoningEffort);
    return {
      type: "object",
      properties: {
        [CODEX_THINKING_LEVEL_KEY]: {
          type: "string",
          title: localize("codex.modelThinkingLevel.title", "Thinking Level"),
          description: localize("codex.modelThinkingLevel.description", "Controls how much reasoning effort Codex uses."),
          default: resolveDefaultReasoningEffort(efforts, declaredDefault, modelId),
          enum: efforts,
          enumLabels: efforts.map(getReasoningEffortLabel),
          enumDescriptions: supportedEfforts.map((option) => option.description || getReasoningEffortDescription(option.reasoningEffort) || "")
        }
      }
    };
  }
  _getReasoningEffort(session, configResource) {
    const modelConfigEffort = narrowReasoningEffort(session.model?.config?.[CODEX_THINKING_LEVEL_KEY]);
    if (modelConfigEffort) {
      return modelConfigEffort;
    }
    const config = this._configurationService.getSessionConfigValues(configResource.toString());
    return narrowReasoningEffort(config?.[CodexSessionConfigKey.ModelReasoningEffort]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ModelReasoningEffort];
  }
  _readSessionConfig(configResource) {
    return codexSessionConfigSchema.validateOrDefault(
      this._configurationService.getSessionConfigValues(configResource.toString()),
      codexSessionConfigDefaults
    );
  }
  /**
   * Resolve the Codex security axes (approval policy, sandbox, reviewer) for a
   * live or restored session from its RAW persisted config values.
   *
   * The raw values are normalized through {@link migrateCodexPermissionValues}
   * (the same migration the restore path applies) before resolving, so the
   * axes we send to the app-server always match the preset the "Approvals" chip
   * displays. This matters for two legacy shapes:
   * - a session that persisted only `sandboxMode = 'read-only'` is preserved
   *   verbatim, so it is NOT silently escalated back to `workspace-write` on
   *   resume (the chip over-promises, but the session stays more locked down);
   * - a session that persisted `approvalPolicy = 'never'` + `workspace-write`
   *   (which the chip renders as "Default Permissions") is snapped onto the
   *   `default` preset's `on-request` policy so it actually prompts, instead of
   *   running commands unprompted while the chip claims it would ask.
   */
  _permissionAxisDefaults() {
    const preset = narrowCodexPermissionsPreset(this._providerConfigurationValues["codex.permissionsPreset"]) ?? CODEX_DEFAULT_PERMISSIONS_PRESET;
    const axes = resolveCodexPermissionsPreset(preset);
    return { approvalPolicy: axes.approvalPolicy, sandboxMode: axes.sandboxMode };
  }
  _resolveSessionPermissions(configResource) {
    const rawValues = this._configurationService.getSessionConfigValues(configResource.toString());
    const defaults = this._permissionAxisDefaults();
    return resolveCodexPermissions(migrateCodexPermissionValues(rawValues, defaults), defaults);
  }
  _permissionsSignature(configResource) {
    const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(configResource);
    return `${approvalPolicy}|${sandboxMode}|${approvalsReviewer}`;
  }
  _sandboxPolicy(session, config, mode) {
    if (mode === "danger-full-access") {
      return { type: "dangerFullAccess" };
    }
    const networkAccess = narrowBoolean(config[CodexSessionConfigKey.NetworkAccessEnabled]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.NetworkAccessEnabled];
    if (mode === "read-only") {
      return { type: "readOnly", networkAccess: false };
    }
    const additionalDirectories = narrowAdditionalDirectories(config[CodexSessionConfigKey.AdditionalDirectories]) ?? [];
    const writableRoots = this._isMultiRootActive(session) ? distinctAbsolutePaths([
      ...this._runtimeWorkspaceRoots(session),
      ...additionalDirectories
    ]) : [
      ...session.workingDirectory ? [session.workingDirectory.fsPath] : [],
      ...additionalDirectories
    ];
    return {
      type: "workspaceWrite",
      writableRoots,
      networkAccess,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false
    };
  }
  _turnStartOptions(session, modelId, developerInstructions, configResource = session.sessionUri) {
    const config = this._readSessionConfig(configResource);
    const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(configResource);
    const sandboxPolicy = this._sandboxPolicy(session, config, sandboxMode);
    const runtimeWorkspaceRoots = this._isMultiRootActive(session) ? this._runtimeWorkspaceRoots(session) : sandboxPolicy.type === "workspaceWrite" ? sandboxPolicy.writableRoots : void 0;
    const effort = this._getReasoningEffort(session, configResource);
    const personality = narrowPersonality(config[CodexSessionConfigKey.Personality]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.Personality];
    const summary = narrowReasoningSummary(config[CodexSessionConfigKey.ReasoningSummary]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.ReasoningSummary];
    const mode = collaborationModeKind(config[SessionConfigKey.Mode]);
    const forgeDeveloperInstructions = [developerInstructions, FORGE_LIVE_EDIT_INSTRUCTIONS].filter(Boolean).join("\n\n");
    const collaborationMode = {
      mode,
      settings: { model: modelId, reasoning_effort: effort ?? null, developer_instructions: forgeDeveloperInstructions }
    };
    this._logService.info(`[Codex] turn options session=${session.sessionUri.toString()} sandbox=${sandboxPolicy.type} approval=${approvalPolicy} reviewer=${approvalsReviewer}`);
    return {
      approvalPolicy,
      sandboxPolicy,
      approvalsReviewer,
      effort,
      personality,
      summary,
      collaborationMode,
      ...runtimeWorkspaceRoots ? { runtimeWorkspaceRoots } : {}
    };
  }
  _workingDirectories(session) {
    return session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : []);
  }
  _runtimeWorkspaceRoots(session) {
    return distinctAbsolutePaths(this._workingDirectories(session).map((directory) => directory.fsPath));
  }
  _isMultiRootActive(session) {
    return session.multiRootEnabled && (session.workingDirectories?.length ?? 0) > 1;
  }
  async _selectedCapabilityRoots(session) {
    const candidates = codexSelectedCapabilityRootCandidates(session.workingDirectories ?? []);
    const resolved = await Promise.all(candidates.map(async (candidate) => {
      try {
        const stat = await this._fileService.stat(URI.file(candidate.location.path));
        return stat.isDirectory ? candidate : void 0;
      } catch (error) {
        const result = toFileOperationResult(error);
        if (result !== FileOperationResult.FILE_NOT_FOUND) {
          this._logService.warn(`[Codex] selected capability root metadata lookup failed: id=${candidate.id}, result=${result}`);
        }
        return void 0;
      }
    }));
    return resolved.filter((candidate) => candidate !== void 0);
  }
  async _buildCustomizationLaunch(session) {
    const plugins = this._enabledClientPlugins(session);
    const workspaceAgents = await discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService);
    const customization = await codexCustomizationConfig(workspaceAgents.agents, plugins, session.agent, this._fileService);
    const config = {};
    if (customization.agentRoles.length > 0) {
      const root = session.customizationDirectory?.fsPath ?? await fs.promises.mkdtemp(join(os.tmpdir(), "vscode-agent-codex-customizations-"));
      const agentsDirectory = join(root, "agents");
      await fs.promises.mkdir(agentsDirectory, { recursive: true });
      const agents = {};
      for (const [index, role] of customization.agentRoles.entries()) {
        const rolePath = join(agentsDirectory, `${index}.toml`);
        await fs.promises.writeFile(rolePath, codexAgentRoleToml(role), "utf8");
        agents[role.name] = { description: role.description, config_file: rolePath };
      }
      config.agents = agents;
      session.customizationDirectory ??= URI.file(root);
    }
    const selectedCapabilityRoots = codexSkillCapabilityRoots(plugins).map((uri, index) => ({
      id: `client-plugin-skills-${index}-${uri.fsPath}`,
      location: { type: "environment", environmentId: "local", path: uri.fsPath }
    }));
    const signature = JSON.stringify({
      agent: session.agent?.uri,
      agentRoles: customization.agentRoles,
      developerInstructions: customization.developerInstructions,
      selectedCapabilityRoots: selectedCapabilityRoots.map((root) => root.location.path)
    });
    return {
      config,
      ...customization.developerInstructions ? { developerInstructions: customization.developerInstructions } : {},
      selectedCapabilityRoots,
      signature
    };
  }
  _enabledClientPlugins(session) {
    const plugins = session.clientCustomizations.plugins();
    const candidates = plugins.map((plugin) => ({
      ...plugin.synced.customization,
      ...plugin.parsed ? { children: parsedPluginChildren(plugin.parsed) } : {}
    }));
    const clientPlugins = /* @__PURE__ */ new Map();
    const childEnablement = /* @__PURE__ */ new Map();
    for (const plugin of plugins) {
      if (plugin.input !== void 0) {
        clientPlugins.set(plugin.input.uri, plugin.input);
        if (plugin.input.childEnablement !== void 0) {
          childEnablement.set(plugin.input.uri, plugin.input.childEnablement);
        }
      }
    }
    const resolution = resolveCustomizationEnablement(
      this._customizationEnablementService,
      session.sessionUri,
      candidates,
      childEnablement,
      clientPlugins
    );
    const enabled = [];
    for (const [index, plugin] of plugins.entries()) {
      const customization = resolution.customizations[index];
      if (plugin.parsed !== void 0 && customization.type === CustomizationType.Plugin && isCustomizationSdkEligible(resolution, candidates[index])) {
        const resolved = { ...plugin, customization };
        if (session.clientCustomizations.isEnabled(resolved)) {
          enabled.push(resolved);
        }
      }
    }
    return enabled;
  }
  async _refreshModels() {
    await Promise.all([this._refreshCopilotModels(), this._refreshCodexModels()]);
    this._models.set([...this._copilotModels, ...this._codexModels], void 0);
  }
  _hasExistingChatGPTSetup() {
    const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
    if (!allowSignedOutWhenUsable) {
      return false;
    }
    if (this._openAIAccountState.status === "signedIn") {
      return this._openAIAccountState.authType === "chatgpt";
    }
    if (this._openAIAccountState.status === "unavailable") {
      return this._openAIAccountState.requiresOpenaiAuth === false;
    }
    if (this._openAIAccountState.status === "signedOut" || this._openAIAccountState.status === "error") {
      return false;
    }
    return detectExistingCodexChatGPTSetup(
      this._environmentService.userHome.fsPath,
      process.env,
      this._codexHome
    ) || this._configuredCodexHome === void 0 && detectExistingCodexChatGPTSetup(
      this._environmentService.userHome.fsPath,
      process.env,
      join(this._environmentService.userHome.fsPath, ".codex")
    );
  }
  /**
   * Match Claude native mode: once persisted credentials make the provider
   * usable without GitHub, eagerly materialize the SDK and publish only the
   * authoritative app-server model catalog. Until that finishes the provider
   * remains present but unusable; no cached or synthetic model is advertised.
   */
  _startModelRefreshForExistingChatGPTSetup() {
    if (this._store.isDisposed || !this._hasExistingChatGPTSetup() || this._codexModels.length > 0) {
      return;
    }
    queueMicrotask(() => {
      if (!this._store.isDisposed) {
        void this.refreshModels();
      }
    });
  }
  async _refreshCopilotModels() {
    const token = this._githubToken;
    if (!token) {
      this._copilotModels = [];
      return;
    }
    try {
      const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
      const all = await this._copilotApiService.models(token, { headers: { "User-Agent": userAgent }, suppressIntegrationId: true });
      if (this._githubToken !== token) {
        return;
      }
      const models = all.filter((m) => m.supported_endpoints?.includes(CODEX_RESPONSES_ENDPOINT)).sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default)).map((m) => ({
        provider: "copilot",
        id: toCodexModelSelectionId(CODEX_COPILOT_MODEL_PROVIDER, m.id),
        name: m.name ?? m.id,
        maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
        maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
        maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
        supportsVision: !!m.capabilities?.supports?.vision,
        configSchema: this._createReasoningEffortConfigSchema(
          m.capabilities?.supports?.reasoning_effort?.map((reasoningEffort) => ({ reasoningEffort })),
          void 0,
          m.id
        ),
        policyState: m.policy?.state,
        _meta: createPricingMetaFromBilling(
          normalizeCAPIBilling(m.billing),
          typeof m.model_picker_price_category === "string" ? m.model_picker_price_category : void 0
        )
      }));
      this._copilotModels = models;
    } catch (err) {
      this._logService.warn(`[Codex] Failed to refresh models: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async _refreshCodexModels() {
    try {
      const configuredModels = normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()[CODEX_MODELS_ROOT_CONFIG_KEY]);
      const configuredProvider = configuredModels.providers.find((provider) => provider.id === configuredModels.modelProvider);
      const localKind = configuredProvider?.kind === "ollama" || configuredProvider?.kind === "lmstudio" ? configuredProvider.kind : configuredModels.modelProvider === "ollama" || configuredModels.modelProvider === "lmstudio" ? configuredModels.modelProvider : void 0;
      if (localKind) {
        const baseUrl = configuredProvider?.baseUrl || (localKind === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1");
        let discovered = [];
        try {
          discovered = await this._discoverLocalModels(localKind, baseUrl);
        } catch (error) {
          this._logService.warn(`[Codex] ${localKind} model discovery failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        const modelIds = new Map(discovered.map((model) => [model.id, model.name]));
        if (configuredModels.model) {
          modelIds.set(configuredModels.model, modelIds.get(configuredModels.model) ?? configuredModels.model);
        }
        this._codexModels = [...modelIds].map(([model, name]) => ({
          provider: configuredModels.modelProvider,
          id: toCodexModelSelectionId(configuredModels.modelProvider, model),
          name,
          supportsVision: false
        }));
        return;
      }
      let liveById = /* @__PURE__ */ new Map();
      let liveModelProvider;
      let chatGPTSubscription = false;
      if (this._connection.kind === "idle" && !await this._isSdkResolvableWithoutDownload() && !this._hasExistingChatGPTSetup()) {
        this._codexModels = this._pickerModelsFromCards(void 0, liveById);
        return;
      }
      try {
        const connection = await this._ensureConnection();
        const account = await this._refreshAccount(connection.client, false);
        if ((account.status === "signedOut" || account.status === "error") && (configuredModels.modelProvider === "" || configuredModels.modelProvider === CODEX_OPENAI_MODEL_PROVIDER)) {
          this._syncOfficialCodexCard([]);
          this._codexModels = [];
          return;
        }
        const configResponse = await connection.client.request("config/read", { includeLayers: false });
        const config = configResponse.config && typeof configResponse.config === "object" && !Array.isArray(configResponse.config) ? configResponse.config : {};
        const configuredLiveProvider = this._readConfigurationValue(config, "model_provider");
        liveModelProvider = typeof configuredLiveProvider === "string" && configuredLiveProvider !== "" ? configuredLiveProvider : CODEX_OPENAI_MODEL_PROVIDER;
        chatGPTSubscription = account.status === "signedIn" && account.authType === "chatgpt" && account.requiresOpenaiAuth !== false && liveModelProvider === CODEX_OPENAI_MODEL_PROVIDER;
        const data = [];
        let cursor = null;
        do {
          const response = await connection.client.request("model/list", { cursor, limit: 100, includeHidden: false });
          data.push(...response.data);
          cursor = response.nextCursor;
        } while (cursor !== null);
        liveById = new Map(data.map((model) => [model.model, model]));
        if (chatGPTSubscription) {
          this._syncOfficialCodexCard(data.sort((left, right) => Number(right.isDefault) - Number(left.isDefault)).map((model) => model.model));
        } else {
          this._syncOfficialCodexCard([]);
        }
      } catch (error) {
        this._logService.warn(`[Codex] official model list failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (chatGPTSubscription) {
        const fromCards = this._pickerModelsFromCards(void 0, liveById);
        if (fromCards.length > 0) {
          this._codexModels = fromCards;
          return;
        }
      }
      if (liveById.size > 0) {
        const modelProvider = liveModelProvider ?? CODEX_OPENAI_MODEL_PROVIDER;
        this._codexModels = [...liveById.values()].map((model) => ({
          provider: chatGPTSubscription ? "chatgpt" : modelProvider,
          id: toCodexModelSelectionId(modelProvider, model.model),
          name: model.displayName,
          supportsVision: model.inputModalities.includes("image"),
          configSchema: this._createReasoningEffortConfigSchema(model.supportedReasoningEfforts, model.defaultReasoningEffort, model.model),
          _meta: createAgentModelSourceMeta(chatGPTSubscription ? CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID : void 0)
        }));
        return;
      }
      this._codexModels = [];
    } catch (err) {
      this._logService.warn(`[Codex] Failed to refresh OpenAI models: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _pickerModelsFromCards(config, liveById) {
    const models = config ?? normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const remaining = remainingPercentFromUsed(this._openAIAccountRateLimit?.usedPercent);
    const official = findOfficialModelProvider(models, "codex");
    const hasOfficialApiKey = !!(official && this._modelProviderApiKeys.get(official.id));
    const picker = [];
    for (const provider of models.providers) {
      if (!shouldIncludeOfficialProviderInCodexPicker(provider)) {
        continue;
      }
      for (const model of provider.models) {
        const name = model.name.trim();
        if (!model.enabled || name === "") {
          continue;
        }
        const routed = resolveCodexOfficialRoute({
          modelProvider: provider.id,
          modelId: name,
          config: models,
          remainingPercent: remaining,
          hasOfficialApiKey
        });
        const live = liveById.get(name);
        picker.push({
          provider: provider.official && routed.modelProvider === CODEX_OPENAI_MODEL_PROVIDER ? "chatgpt" : provider.id,
          id: toCodexModelSelectionId(routed.modelProvider, routed.modelId),
          name: live?.displayName || name,
          supportsVision: live?.inputModalities.includes("image") ?? false,
          configSchema: live ? this._createReasoningEffortConfigSchema(live.supportedReasoningEfforts, live.defaultReasoningEffort, live.model) : void 0,
          _meta: createAgentModelSourceMeta(provider.official && routed.modelProvider === CODEX_OPENAI_MODEL_PROVIDER ? CHATGPT_SUBSCRIPTION_MODEL_SOURCE_ID : void 0)
        });
      }
    }
    return picker;
  }
  _syncOfficialCodexCard(officialNames) {
    const current = normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const next = officialNames.length > 0 ? upsertOfficialModelProvider(current, "codex", officialNames) : removeOfficialModelProvider(current, "codex");
    if (officialCardsEqual(current, next)) {
      return;
    }
    this._configurationService.updateRootConfig({ [CODEX_MODELS_ROOT_CONFIG_KEY]: next });
  }
  _routeCodexModel(selection) {
    const parsed = parseCodexModelSelection(selection);
    const config = normalizeCodexModelsConfig(this._configurationService.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const official = findOfficialModelProvider(config, "codex");
    return resolveCodexOfficialRoute({
      modelProvider: parsed.modelProvider,
      modelId: parsed.modelId,
      config,
      remainingPercent: remainingPercentFromUsed(this._openAIAccountRateLimit?.usedPercent),
      hasOfficialApiKey: !!(official && this._modelProviderApiKeys.get(official.id))
    });
  }
  _discoverLocalModels(kind, baseUrl) {
    const key = `${kind}\0${baseUrl}`;
    const cached = this._localModelDiscoveryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.promise;
    }
    const promise = discoverCodexLocalModels(kind, baseUrl).catch((error) => {
      if (this._localModelDiscoveryCache.get(key)?.promise === promise) {
        this._localModelDiscoveryCache.delete(key);
      }
      throw error;
    });
    this._localModelDiscoveryCache.set(key, { expiresAt: Date.now() + 5 * 6e4, promise });
    return promise;
  }
  // #endregion
  // #region Connection lifecycle
  /**
   * Lazily spawn the codex app-server, initialize the connection,
   * authenticate via apiKey, and return the ready connection. Idempotent
   * — concurrent callers share the same promise.
   */
  async _ensureConnection() {
    if (this._connection.kind === "ready") {
      return Promise.resolve(this._connection);
    }
    if (this._connection.kind === "starting") {
      return this._connection.promise;
    }
    const generation = this._connectionGeneration;
    const startPromise = this._startConnection();
    const promise = startPromise.then((ready) => {
      if (generation !== this._connectionGeneration) {
        ready.client.dispose();
        ready.proxyHandle.dispose();
        try {
          ready.child.kill("SIGKILL");
        } catch {
        }
        throw new Error("Codex app-server was replaced while starting");
      }
      ready.proxyHandle.setToken(this._githubToken ?? "");
      this._connection = { kind: "ready", ...ready };
      void this._refreshProviderConfiguration();
      return ready;
    }).catch((err) => {
      if (generation === this._connectionGeneration) {
        this._connection = { kind: "idle" };
      }
      throw err;
    });
    this._connection = { kind: "starting", promise };
    return promise;
  }
  /**
   * Resolve the Codex SDK root — the directory whose
   * `node_modules/@openai/codex-<target>/…` holds the native binary.
   *
   * Mirrors the three-tier resolution in `ClaudeAgentSdkService._loadSdk`:
   *   1. dev override / product download, via the downloader, when the SDK
   *      `isAvailable` (env override || `product.agentSdks.codex`);
   *   2. dev fallback to this repo's `node_modules`, where `@openai/codex`
   *      and its per-host binary package are devDependencies — this is what
   *      lets running-from-source (and dev smoke tests) spawn Codex without
   *      an env-var override.
   *
   * `isAvailable` is already false in dev, so it discriminates the two
   * without injecting `INativeEnvironmentService`. When neither path
   * resolves we defer to the downloader so callers get its actionable
   * "not configured" diagnostic.
   */
  async _resolveSdkRoot() {
    if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
      return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
    }
    const devRoot = await resolveCodexDevSdkRoot();
    if (devRoot) {
      this._logService.info(`[Codex] resolving SDK from repo node_modules (dev fallback): ${devRoot}`);
      return devRoot;
    }
    return this._agentSdkDownloader.loadSdkRoot(CodexSdkPackage, CancellationToken.None);
  }
  async _isSdkResolvableWithoutDownload() {
    if (this._agentSdkDownloader.isAvailable(CodexSdkPackage)) {
      return this._agentSdkDownloader.isSdkResolvableWithoutDownload(CodexSdkPackage);
    }
    return await resolveCodexDevSdkRoot() !== void 0;
  }
  async _startConnection() {
    const root = await this._resolveSdkRoot();
    const codexTarget = codexPackageSuffix(process.platform, process.arch);
    if (!codexTarget) {
      throw new Error(`Codex: unsupported platform ${process.platform}-${process.arch}`);
    }
    const triple = codexBinaryTriple(codexTarget);
    if (!triple) {
      throw new Error(`Codex: no binary triple known for sdkTarget '${codexTarget}'`);
    }
    const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
    const binaryPath = resolveCodexBinaryPath(root, codexTarget, triple, binaryName);
    try {
      fs.accessSync(binaryPath, fs.constants.F_OK);
    } catch (err) {
      throw new Error(`Codex binary not executable: ${binaryPath} (${err instanceof Error ? err.message : String(err)})`);
    }
    const proxyHandle = await this._codexProxyService.start(this._githubToken ?? "");
    const extraArgs = parseBinaryArgs(process.env[AgentHostCodexAgentBinaryArgsEnvVar]);
    const telemetry = await this._otelService.getNativeSdkTelemetryConfig();
    const launchConfig = buildCodexLaunchConfig(process.env, proxyHandle, extraArgs, telemetry);
    const env = launchConfig.env;
    for (const [providerId, apiKey] of this._modelProviderApiKeys) {
      env[codexProviderStoredApiKeyEnv(providerId)] = apiKey;
    }
    const codexHome = prepareForgeCodexHome(
      this._environmentService.userHome.fsPath,
      this._configuredCodexHome,
      (fileName) => this._logService.info(`[Codex] migrated ${fileName} into Forge's isolated Codex home`)
    );
    env.CODEX_HOME = codexHome;
    const args = [...launchConfig.args];
    this._logService.info(`[Codex] spawning with additive model providers ${binaryPath} ${args.join(" ")}`);
    const diagnosticsLog = getActiveForgeDiagnosticsLog();
    diagnosticsLog?.record("protocol", "CODEX.PROCESS.SPAWN", { binaryPath, args: launchConfig.args, codexHome });
    const child = spawn(binaryPath, args, { env, stdio: ["pipe", "pipe", "pipe"] });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      this._logService.info(`[Codex stderr] ${text.trimEnd()}`);
      diagnosticsLog?.recordStream("protocol", "codex-app-server:stderr", "CODEX.STDERR", text);
    });
    const transport = transportFromChildProcess(child);
    const client = new CodexAppServerClient(transport, (level, msg) => {
      this._logService.info(`[CodexClient ${level}] ${msg}`);
      diagnosticsLog?.record(level === "error" ? "errors" : "protocol", `CODEX.CLIENT.${level.toUpperCase()}`, { message: msg });
    }, void 0, (direction, message) => {
      diagnosticsLog?.record("protocol", direction === "client-to-server" ? "CODEX.RPC.SEND" : "CODEX.RPC.RECEIVE", summarizeCodexRpcMessage(message));
    });
    client.onExit((e) => {
      diagnosticsLog?.flushStreams("codex-app-server:");
      diagnosticsLog?.record("protocol", "CODEX.PROCESS.EXIT", e);
      this._logService.warn(`[Codex] app-server exited code=${e.code} signal=${e.signal}`);
      this._handleConnectionLost();
    });
    client.onTransportError((err) => {
      diagnosticsLog?.record("errors", "CODEX.TRANSPORT.ERROR", { message: err.message, stack: err.stack });
      this._logService.error(`[Codex] transport error: ${err.message}`);
      this._handleConnectionLost();
    });
    try {
      await client.request("initialize", {
        clientInfo: CLIENT_INFO,
        capabilities: { experimentalApi: true, requestAttestation: false, optOutNotificationMethods: null }
      });
      client.notify("initialized", void 0);
      void this._refreshAccount(client);
    } catch (err) {
      client.dispose();
      proxyHandle.dispose();
      try {
        child.kill("SIGKILL");
      } catch {
      }
      throw err;
    }
    this._registerIgnoredNotifications(client);
    this._register(client.onNotification("account/login/completed", () => {
      void this._refreshAccount(client).then(() => this._queueModelRefresh());
    }));
    this._register(client.onNotification("account/updated", () => {
      if (this._connection.kind === "ready" && this._connection.client === client) {
        void this._refreshAccount(client);
        this._queueModelRefresh();
      }
    }));
    this._register(client.onNotification("account/rateLimits/updated", () => {
      if (this._connection.kind === "ready" && this._connection.client === client && this._openAIAccountState.status === "signedIn" && this._openAIAccountState.authType === "chatgpt") {
        void this._refreshAccountRateLimits(client);
      }
    }));
    this._register(client.onNotification("turn/started", (params) => this._dispatchByThread(params.threadId, (s) => this._handleTurnStartedNotification(s, params))));
    this._register(client.onNotification("turn/diff/updated", (params) => this._queueFileEvent(params.threadId, () => this._dispatchTurnDiffUpdated(params))));
    this._register(client.onNotification("error", (params) => this._dispatchByThread(params.threadId, (s) => this._handleErrorNotification(s, params))));
    this._register(client.onNotification("item/started", (params) => {
      if (params.item.type === "commandExecution") {
        this._queueFileEvent(params.threadId, () => this._dispatchItemStarted(params));
      } else {
        this._dispatchByThread(params.threadId, (s) => this._handleItemStarted(s, params));
      }
    }));
    this._register(client.onNotification("item/agentMessage/delta", (params) => this._dispatchByThread(params.threadId, (s) => mapAgentMessageDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/commandExecution/outputDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapCommandExecutionOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/fileChange/patchUpdated", (params) => this._queueFileEvent(params.threadId, () => this._dispatchFileChangePatchUpdated(params))));
    this._register(client.onNotification("item/fileChange/outputDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapFileChangeOutputDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/mcpToolCall/progress", (params) => this._dispatchByThread(params.threadId, (s) => mapMcpToolCallProgress(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/summaryPartAdded", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningSummaryPartAdded(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/summaryTextDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningSummaryTextDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("item/reasoning/textDelta", (params) => this._dispatchByThread(params.threadId, (s) => mapReasoningTextDelta(s.mapState, this._withHostTurnId(s, params)))));
    this._register(client.onNotification("thread/tokenUsage/updated", (params) => this._dispatchByThread(params.threadId, (s) => s.currentTurnId ? mapTokenUsageUpdated(this._withHostTurnId(s, params), s.model?.id) : [])));
    this._register(client.onNotification("item/completed", (params) => this._queueFileEvent(params.threadId, () => this._dispatchItemCompleted(params))));
    this._register(client.onNotification("turn/completed", (params) => this._queueFileEvent(params.threadId, () => {
      this._dispatchTurnCompleted(params);
    })));
    this._register(client.onNotification("guardianWarning", (params) => this._dispatchByThread(params.threadId, (s) => this._handleGuardianWarning(s, params))));
    this._register(client.onNotification("item/autoApprovalReview/completed", (params) => {
      void this._handleGuardianReviewCompleted(client, params);
    }));
    this._register(client.onNotification("mcpServer/startupStatus/updated", (params) => this._handleMcpStartupStatus(client, params.name, params.status, params.error)));
    this._register(client.onRequest(
      "item/commandExecution/requestApproval",
      (params) => this._handleCommandApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/fileChange/requestApproval",
      (params) => this._handleFileChangeApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/permissions/requestApproval",
      (params) => this._handlePermissionsApprovalRequestRpc(params)
    ));
    this._register(client.onRequest(
      "item/tool/call",
      (params) => this._handleDynamicToolCallRpc(params)
    ));
    this._register(client.onRequest(
      "item/tool/requestUserInput",
      (params) => this._handleUserInputRequestRpc(params)
    ));
    this._register(client.onRequest(
      "mcpServer/elicitation/request",
      (params) => this._handleElicitationRequestRpc(params)
    ));
    void this._refreshMcpInventory(client);
    return { client, proxyHandle, child };
  }
  /**
   * Builds the `mcp_servers` object for a session's `thread/start.config`:
   * the workbench's root `mcpServers` config merged with the session's
   * enabled client-plugin MCP servers. Passing them per-thread (rather than
   * as process-global `-c` spawn overrides) means each new session picks up
   * the current root config without restarting the shared app-server, and it
   * merges with (leaves intact) the user's global `~/.codex/config.toml`.
   * Client-plugin servers win a name collision with the root config. Any
   * OAuth bearer token acquired for an auth-gated http server (see
   * {@link handleAuthenticationToken}) is injected as an `Authorization`
   * header so codex connects authenticated.
   */
  _buildSessionMcpServers(session) {
    const root = Object.fromEntries(
      Object.entries(codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey))).filter(([name]) => this._isMcpServerEnabledForSdk(session, name))
    );
    const clientPlugins = codexMcpServersFromPlugins(this._enabledClientPlugins(session));
    return injectCodexMcpAuthTokens({ ...root, ...clientPlugins }, this._mcpAuthTokens);
  }
  _isMcpServerEnabledForSdk(session, name) {
    const resolution = this._customizationEnablementService?.resolve(session.sessionUri.toString(), targetForUnownedMcpServer(name));
    return resolution?.kind === "resolved" && resolution.enabled;
  }
  /**
   * The normalized URLs of every configured http MCP server (root config +
   * the session's client plugins), keyed by server name. Used to (a) surface
   * an auth-required server's resource for the workbench sign-in and (b)
   * match a workbench-acquired token back to the server(s) it unlocks.
   * Computed from a token-free build so the URLs are the bare server URLs.
   */
  _httpMcpServerUrls(session) {
    const root = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
    const clientPlugins = codexMcpServersFromPlugins(this._enabledClientPlugins(session));
    const urls = /* @__PURE__ */ new Map();
    for (const [name, server] of Object.entries({ ...root, ...clientPlugins })) {
      const normalized = server.url !== void 0 ? normalizeCodexMcpResourceUrl(server.url) : void 0;
      if (normalized !== void 0) {
        urls.set(name, normalized);
      }
    }
    return urls;
  }
  /** The bare (un-normalized) URL of a configured http MCP server by name, across all sessions. */
  _mcpServerUrlForName(name) {
    const root = codexMcpServersFromConfig(this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey));
    if (root[name]?.url !== void 0) {
      return root[name].url;
    }
    for (const session of this._sessions.values()) {
      const fromPlugins = codexMcpServersFromPlugins(this._enabledClientPlugins(session));
      if (fromPlugins[name]?.url !== void 0) {
        return fromPlugins[name].url;
      }
    }
    return void 0;
  }
  _hostServerToolNames() {
    return /* @__PURE__ */ new Set([...this._serverToolHost?.toolNames ?? [], CODEX_WRITE_FILE_TOOL_NAME]);
  }
  _workspaceRoots(session) {
    const roots = this._workingDirectories(session);
    return roots.length > 0 ? [...roots] : [];
  }
  /**
   * Map the session's tools into codex `dynamicTools` specs: the agent host's
   * server tools (executed in-process) plus the workbench client's tools
   * (round-tripped to the client). Both are registered with codex the same
   * way — at `thread/start` — and dispatched apart in
   * {@link _handleDynamicToolCallRpc} by name.
   */
  _buildDynamicTools(session) {
    const serverTools = this._serverToolHost?.definitions ?? [];
    const clientTools = session.clientToolSet.merged();
    const seen = /* @__PURE__ */ new Set();
    const all = [];
    for (const t of [writeFileToolDefinition, ...serverTools, ...clientTools]) {
      if (seen.has(t.name)) {
        continue;
      }
      seen.add(t.name);
      all.push(t);
    }
    if (all.length === 0) {
      return void 0;
    }
    return all.map((t) => ({
      type: "function",
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema ?? { type: "object" }
    }));
  }
  /**
   * The scope Codex hands {@link IAgentServerToolHost} for a session's
   * server-tool confirmation/execution: the same host-supplied
   * configuration scope {@link IAgentServerToolHost.advertise} was called
   * with for this chat (see {@link _configScope}), never the runtime's own
   * identity. A peer chat's runtime is keyed by its own thread id (e.g.
   * `codex:/<threadId>`) once materialized, which is neither the addressed
   * AH session nor the chat channel and — critically — not the scope the
   * host indexes its per-session tool state under. Falls back to the
   * runtime's own URI only when the chat has never been tracked (there is
   * no better scope to route through).
   */
  _serverToolScope(session) {
    return session.chatChannel ? this._configScope(session.chatChannel) : session.sessionUri;
  }
  async _handleDynamicToolCallRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = (sessionId ? this._sessions.get(sessionId) : void 0) ?? this._subagentsByThreadId.get(params.threadId)?.session;
    if (!session) {
      return { result: this._toolFailure(`Codex tool call for unknown thread ${params.threadId}`) };
    }
    const host = this._serverToolHost;
    if (params.namespace === null && params.tool === CODEX_WRITE_FILE_TOOL_NAME) {
      return this._handleWriteFileTool(session, params);
    }
    if (host && params.namespace === null && host.toolNames.includes(params.tool)) {
      try {
        const scope = this._serverToolScope(session).toString();
        if (host.requiresConfirmation(scope, params.tool)) {
          const entry = session.mapState.itemToToolCall.get(params.callId);
          if (!entry) {
            return { result: this._toolFailure(`No pending server tool call for ${params.tool} (callId ${params.callId})`) };
          }
          const invocationMessage = getServerToolDisplay(params.tool, params.arguments)?.invocationMessage ?? `Calling ${params.tool}`;
          const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
            this._fire(session.sessionUri, {
              type: ActionType.ChatToolCallReady,
              turnId: entry.turnId,
              toolCallId: entry.toolCallId,
              invocationMessage,
              confirmationTitle: localize("codex.serverToolConfirmation.title", "Allow tool call?")
            });
          });
          if (decision !== "accept" && decision !== "acceptForSession") {
            return { result: this._toolFailure(`Server tool ${params.tool} was not approved`) };
          }
        }
        const text = host.executeTool(scope, params.tool, params.arguments);
        return { result: { contentItems: [{ type: "inputText", text: await text }], success: true } };
      } catch (err) {
        return { result: this._toolFailure(`Server tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
      }
    }
    const toolCallId = session.mapState.itemToToolCall.get(params.callId)?.toolCallId;
    if (toolCallId === void 0) {
      return { result: this._toolFailure(`No pending client tool call for ${params.tool} (callId ${params.callId})`) };
    }
    if (session.clientToolSet.size === 0) {
      return { result: this._toolFailure(`No client available to run ${params.tool}`) };
    }
    try {
      const result = await session.pendingClientToolCalls.register(toolCallId);
      return { result: dynamicToolResponseFromResult(result) };
    } catch (err) {
      if (err instanceof CancellationError) {
        return { result: this._toolFailure(`Client tool ${params.tool} was cancelled`) };
      }
      return { result: this._toolFailure(`Client tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
    }
  }
  async _handleWriteFileTool(session, params) {
    const observer = this._fileEditObserver(session);
    try {
      await (this._fileEventDispatches.get(params.threadId) ?? Promise.resolve());
      const { path, contents } = parseWriteFileArgs(params.arguments);
      const target = resolveWritableWorkspacePath(path, this._workspaceRoots(session));
      const entry = session.mapState.itemToToolCall.get(params.callId);
      if (observer) {
        await observer.beginDirectWrite(params.callId, target.fsPath, contents);
        if (entry) {
          const preview = await observer.snapshotDirectWrite(entry.turnId, entry.toolCallId, params.callId, contents);
          if (preview) {
            this._emitForThread(params.threadId, session, {
              type: ActionType.ChatToolCallContentChanged,
              turnId: entry.turnId,
              toolCallId: entry.toolCallId,
              content: [preview]
            });
          }
        }
      }
      if (session.disposed || entry && session.currentTurnId !== entry.turnId) {
        observer?.abandonDirectWrite(params.callId);
        return { result: this._toolFailure(`Server tool ${params.tool} was cancelled`) };
      }
      const text = await applyWriteFileTool(this._fileService, this._workspaceRoots(session), params.arguments);
      return { result: { contentItems: [{ type: "inputText", text }], success: true } };
    } catch (err) {
      observer?.abandonDirectWrite(params.callId);
      return { result: this._toolFailure(`Server tool ${params.tool} failed: ${err instanceof Error ? err.message : String(err)}`) };
    }
  }
  _emitForThread(threadId, session, action) {
    const subagent = this._subagentsByThreadId.get(threadId);
    if (subagent) {
      this._fireSubagent(subagent, action);
    } else {
      this._fire(session.sessionUri, action);
    }
  }
  _toolFailure(message) {
    this._logService.warn(`[Codex] dynamic tool call failed: ${message}`);
    return { contentItems: [{ type: "inputText", text: message }], success: false };
  }
  async _handleUserInputRequestRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      return { result: emptyUserInputResponse(params.questions) };
    }
    if (!session.currentTurnId) {
      this._logService.warn(`[Codex] user input request without an active turn for threadId=${params.threadId}; returning empty answers`);
      return { result: emptyUserInputResponse(params.questions) };
    }
    const approvalQuestion = params.questions.length === 1 && params.questions[0].id.startsWith(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX) ? params.questions[0] : void 0;
    if (approvalQuestion) {
      const callId = approvalQuestion.id.slice(MCP_TOOL_APPROVAL_QUESTION_ID_PREFIX.length);
      const entry = session.mapState.itemToToolCall.get(callId);
      if (entry) {
        return this._handleMcpToolApprovalViaCard(session, approvalQuestion, entry);
      }
    }
    const requestId = generateUuid();
    const request = buildUserInputRequest(requestId, params.questions);
    try {
      const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
        this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
      });
      return { result: userInputResponseFromAnswers(params.questions, result.response, result.answers) };
    } catch (err) {
      return { result: emptyUserInputResponse(params.questions) };
    }
  }
  /**
   * Renders an MCP tool-call approval on the normal tool-approval card
   * (a pending-confirmation `ChatToolCallReady` on the originating
   * `mcpToolCall` host tool call) rather than as a chat-input question.
   * The user's Allow/Deny decision is mapped back to the answer string
   * codex expects (`Allow` / `__codex_mcp_decline__`). Mirrors the shell
   * command approval flow ({@link CodexAgent._handleCommandApprovalRequest}).
   */
  async _handleMcpToolApprovalViaCard(session, question, entry) {
    const confirmationTitle = question.question || question.header || "Run MCP tool";
    let decision;
    try {
      decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallReady,
          turnId: entry.turnId,
          toolCallId: entry.toolCallId,
          invocationMessage: confirmationTitle,
          toolInput: confirmationTitle,
          confirmationTitle
        });
      });
    } catch (err) {
      decision = "decline";
    }
    const allow = decision === "accept" || decision === "acceptForSession";
    const answer = allow ? MCP_TOOL_APPROVAL_ANSWER_ALLOW : MCP_TOOL_APPROVAL_ANSWER_DECLINE;
    return { result: { answers: { [question.id]: { answers: [answer] } } } };
  }
  async _handleElicitationRequestRpc(params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    this._logService.info(`[Codex] elicitation request threadId=${params.threadId} mode=${params.mode} server=${params.serverName} session=${session ? session.sessionId : "NONE"}`);
    if (!session) {
      this._logService.warn(`[Codex] elicitation request for unknown threadId=${params.threadId}; declining`);
      return { result: declinedElicitationResponse() };
    }
    if (!session.currentTurnId) {
      this._logService.warn(`[Codex] elicitation request without an active turn for threadId=${params.threadId}; declining`);
      return { result: declinedElicitationResponse() };
    }
    const requestId = generateUuid();
    const request = buildElicitationRequest(requestId, params);
    try {
      const result = await session.pendingUserInputs.registerAndFire(requestId, () => {
        this._fire(session.sessionUri, { type: ActionType.ChatInputRequested, request });
      });
      this._logService.info(`[Codex] elicitation resolved requestId=${requestId} response=${result.response}`);
      return { result: elicitationResponseFromAnswers(params, result.response, result.answers) };
    } catch (err) {
      this._logService.info(`[Codex] elicitation cancelled requestId=${requestId}: ${err instanceof Error ? err.message : String(err)}`);
      return { result: cancelledElicitationResponse() };
    }
  }
  _hostTurnId(session, appTurnId) {
    return session.hostTurnIdByAppTurnId.get(appTurnId) ?? appTurnId;
  }
  _withHostTurnId(session, params) {
    const turnId = this._hostTurnId(session, params.turnId);
    return turnId === params.turnId ? params : { ...params, turnId };
  }
  _withHostTurn(session, params) {
    const appTurnId = params.turn.id;
    const hostTurnId = session.currentTurnId ?? this._hostTurnId(session, appTurnId);
    session.hostTurnIdByAppTurnId.set(appTurnId, hostTurnId);
    session.currentAppTurnId = appTurnId;
    return hostTurnId === appTurnId ? params : { ...params, turn: { ...params.turn, id: hostTurnId } };
  }
  _handleTurnStartedNotification(session, params) {
    mapTurnStarted(session.mapState, this._withHostTurn(session, params), session.lastPromptText);
    return [];
  }
  _handleErrorNotification(session, params) {
    const hostTurnId = this._hostTurnId(session, params.turnId);
    const message = params.error.message || "Codex turn failed";
    this._logService.warn(`[Codex:${session.sessionId}] turn error (willRetry=${params.willRetry}): ${message}`);
    if (!session.currentTurnId && !session.hostTurnIdByAppTurnId.has(params.turnId)) {
      return [];
    }
    const elapsed = session.turnStopWatch?.elapsed();
    return mapErrorNotification(params, hostTurnId, typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0);
  }
  _handleTurnCompletedNotification(session, params) {
    const appTurnId = params.turn.id;
    const hostTurnId = this._hostTurnId(session, appTurnId);
    const out = mapTurnCompleted(session.mapState, this._withHostTurn(session, params), this._clearTurnStopWatch(session));
    this._fileEditObserver(session)?.clearTurnDiff(hostTurnId);
    session.codexTurnIdByHostTurnId.set(hostTurnId, appTurnId);
    if (session.currentAppTurnId === appTurnId || session.currentTurnId === hostTurnId) {
      session.currentTurnId = void 0;
      session.currentAppTurnId = void 0;
    }
    session.hostTurnIdByAppTurnId.delete(appTurnId);
    this._drainPendingSteering(session);
    if (session.pendingGuardianReviewCards.size > 0) {
      for (const guardianToolCallId of [...session.pendingGuardianReviewCards]) {
        session.pendingCommandApprovals.respond(guardianToolCallId, "cancel");
      }
    }
    return [{ type: ActionType.ChatActivityChanged, activity: void 0 }, ...out];
  }
  /**
   * Dispatch a codex `item/started` notification. `userMessage` items are
   * intercepted here (rather than in the pure mapper) because steering
   * promotion needs the agent's per-session turn-correlation state; all
   * other item kinds defer to {@link mapItemStarted}.
   */
  _handleItemStarted(session, params) {
    if (params.item.type === "userMessage") {
      return this._handleSteeredUserMessage(session, params.item.content);
    }
    const actions = mapItemStarted(session.mapState, this._withHostTurnId(session, params));
    if (params.item.type === "fileChange") {
      this._fileEditObserver(session)?.begin(params.item.id, session.workingDirectory, params.item.changes);
    }
    return actions;
  }
  _fileEditObserver(session) {
    if (!session.threadId) {
      return void 0;
    }
    let observer = this._fileEditObservers.get(session.threadId);
    if (!observer) {
      observer = this._instantiationService.createInstance(
        CodexFileEditObserver,
        session.sessionUri,
        this._sessionDataService.openDatabase(session.sessionUri)
      );
      this._fileEditObservers.set(session.threadId, observer);
    }
    return observer;
  }
  /**
   * Codex echoes every user message — the turn opener (already shown by
   * the workbench before `sendMessage`) and any steered input — as a
   * `userMessage` item. Only steered input is buffered in
   * {@link ICodexSession.pendingSteeringFlips}; a buffered match is
   * promoted into its own visible turn and everything else is dropped.
   */
  _handleSteeredUserMessage(session, content) {
    const text = extractUserInputText(content);
    const steering = this._takeMatchingPendingSteering(session, text);
    if (!steering) {
      return [];
    }
    return this._beginSteeringTurn(session, steering);
  }
  /**
   * Pop the buffered steering message whose text matches the echoed
   * `userMessage` content. Matching by content (not FIFO) keeps the
   * mapping correct when several steering messages with different texts
   * are in flight.
   */
  _takeMatchingPendingSteering(session, text) {
    for (const [id, msg] of session.pendingSteeringFlips) {
      if (msg.message.text === text) {
        session.pendingSteeringFlips.delete(id);
        return msg;
      }
    }
    return void 0;
  }
  /**
   * Promote a steered message into its own protocol turn: complete the
   * in-flight turn (so its response parts settle into history) and open a
   * fresh turn whose user message is the steering content. The
   * `queuedMessageId` clears the corresponding pending steering bubble.
   * Subsequent codex items for the same app-server turn are re-mapped to
   * the new host turn id so the steering response lands there.
   */
  _beginSteeringTurn(session, steering) {
    const actions = [];
    const appTurnId = session.currentAppTurnId;
    const previousHostTurnId = session.currentTurnId ?? (appTurnId ? this._hostTurnId(session, appTurnId) : void 0);
    actions.push(...finalizeCodexTurnMapState(session.mapState, "Turn was superseded by a steering message before the tool reported completion"));
    if (previousHostTurnId) {
      actions.push({ type: ActionType.ChatTurnComplete, turnId: previousHostTurnId, duration: this._clearTurnStopWatch(session) });
    }
    const newHostTurnId = generateUuid();
    if (appTurnId) {
      session.hostTurnIdByAppTurnId.set(appTurnId, newHostTurnId);
    }
    session.currentTurnId = newHostTurnId;
    actions.push({
      type: ActionType.ChatTurnStarted,
      turnId: newHostTurnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: steering.message,
      queuedMessageId: steering.id
    });
    this._startTurnStopWatch(session);
    return actions;
  }
  /**
   * Clear any steering messages still buffered (never echoed by codex)
   * and fire `steering_consumed` for each so the chat UI removes the
   * lingering pending bubble. Called on turn completion, abort, dispose,
   * and connection loss.
   */
  _drainPendingSteering(session) {
    if (session.pendingSteeringFlips.size === 0) {
      return;
    }
    const ids = [...session.pendingSteeringFlips.keys()];
    session.pendingSteeringFlips.clear();
    for (const id of ids) {
      this._fireSteeringConsumed(session, id);
    }
  }
  _fireSteeringConsumed(session, id) {
    this._onDidChatProgress.fire({ kind: "steering_consumed", chat: session.chatChannel, id });
  }
  _registerIgnoredNotifications(client) {
    const ignored = [
      "thread/started",
      // thread/start response is authoritative for session materialization.
      "thread/status/changed",
      // Codex thread status is not surfaced in Agent Host state yet.
      "thread/settings/updated",
      // VS Code owns session config; Codex settings echoes are not consumed yet.
      "thread/goal/updated",
      // Goals are not surfaced in the Agent Host UI yet.
      "thread/goal/cleared",
      // Goals are not surfaced in the Agent Host UI yet.
      "thread/compacted",
      // Deprecated completion echo; the contextCompaction item owns UI progress.
      "remoteControl/status/changed",
      // Remote-control state is not part of the VS Code integration.
      "serverRequest/resolved",
      // We resolve requests through JSON-RPC responses, so this echo is informational.
      "item/autoApprovalReview/started"
      // Informational; the completed notification drives the denied-action card.
    ];
    for (const method of ignored) {
      this._register(client.onNotification(method, () => {
      }));
    }
  }
  async _refreshAccount(client, publish = true) {
    try {
      const response = await client.request("account/read", { refreshToken: false });
      const state = codexAccountStateFromResponse(response);
      this._setOpenAIAccountState(state, publish);
      if (publish && state.status === "signedIn" && state.authType === "chatgpt") {
        void this._refreshAccountRateLimits(client, state.email);
      }
      this._logService.info(`[Codex] account/read accountType=${response.account?.type ?? "none"} requiresOpenaiAuth=${response.requiresOpenaiAuth}${state.planType ? ` planType=${state.planType}` : ""}`);
      return state;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[Codex] account/read failed: ${message}`);
      const state = { usageSource: "openai", status: "error", error: message };
      this._setOpenAIAccountState(state, publish);
      return state;
    }
  }
  async _refreshAccountRateLimits(client, accountEmail = this._openAIAccountState.email) {
    try {
      const response = await client.request("account/rateLimits/read", void 0);
      if (this._connection.kind !== "ready" || this._connection.client !== client || this._openAIAccountState.status !== "signedIn" || this._openAIAccountState.authType !== "chatgpt" || this._openAIAccountState.email !== accountEmail) {
        return;
      }
      this._openAIAccountRateLimit = codexAccountRateLimitFromResponse(response);
      this._publishAccountInfo(this._toAccountInfo(this._openAIAccountState));
      void this._queueModelRefresh();
    } catch (error) {
      this._logService.warn(`[Codex] account/rateLimits/read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async _readProviderConfiguration() {
    const connection = await this._ensureConnection();
    const response = await connection.client.request("config/read", { includeLayers: true });
    const userLayer = response.layers?.find((layer) => layer.name.type === "user" && layer.name.profile === null) ?? response.layers?.find((layer) => layer.name.type === "user");
    const config = userLayer?.config && typeof userLayer.config === "object" && !Array.isArray(userLayer.config) ? userLayer.config : {};
    return {
      "codex.permissionsPreset": inferCodexPermissionsPreset(
        this._readConfigurationValue(config, "approval_policy"),
        this._readConfigurationValue(config, "sandbox_mode"),
        this._readConfigurationValue(config, "approvals_reviewer")
      ),
      "codex.personality": this._readConfigurationValue(config, "personality") ?? "default",
      "codex.autoReviewPolicy": this._readConfigurationValue(config, "auto_review.policy") ?? "",
      [CODEX_MODELS_ROOT_CONFIG_KEY]: preferCodexModelsConfig(
        this._readForgeModelsFile(),
        this._readModelsConfiguration(config),
        this._configurationService.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY]
      ) ?? this._readModelsConfiguration(config)
    };
  }
  _forgeModelsFilePath() {
    return join(this._codexHome, FORGE_MODELS_FILE_NAME);
  }
  _readForgeModelsFile() {
    try {
      const raw = fs.readFileSync(this._forgeModelsFilePath(), "utf8");
      const parsed = normalizeCodexModelsConfig(JSON.parse(raw));
      return isEmptyCodexModelsConfig(parsed) ? void 0 : parsed;
    } catch {
      return void 0;
    }
  }
  _writeForgeModelsFile(config) {
    fs.mkdirSync(this._codexHome, { recursive: true });
    fs.writeFileSync(this._forgeModelsFilePath(), `${JSON.stringify(config, null, 2)}
`, "utf8");
    this._logService.info(`[Codex] wrote ${this._forgeModelsFilePath()} providers=${config.providers.length}`);
  }
  _readModelsConfiguration(config) {
    const model = this._readConfigurationValue(config, "model");
    const modelProvider = this._readConfigurationValue(config, "model_provider");
    const rawProviders = this._readConfigurationValue(config, "model_providers");
    const providers = [];
    if (rawProviders && typeof rawProviders === "object" && !Array.isArray(rawProviders)) {
      for (const [id, raw] of Object.entries(rawProviders)) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          continue;
        }
        const entry = raw;
        const envKey = typeof entry.env_key === "string" ? entry.env_key : "";
        const normalizedId = id.toLowerCase();
        if (normalizedId === "vscode-proxy") {
          continue;
        }
        const kind = normalizedId.includes("ollama") || entry.base_url === "http://localhost:11434/v1" ? "ollama" : normalizedId.includes("lmstudio") || entry.base_url === "http://localhost:1234/v1" ? "lmstudio" : "responses";
        providers.push({
          id,
          catalogId: kind === "ollama" ? "ollama" : kind === "lmstudio" ? "lmstudio" : "openai",
          name: typeof entry.name === "string" ? entry.name : id,
          baseUrl: typeof entry.base_url === "string" ? entry.base_url : "",
          envKey,
          kind,
          authMode: isCodexProviderStoredApiKeyEnv(envKey) ? "stored" : envKey === "" ? "none" : "environment",
          wireApi: "responses",
          enabled: true,
          models: [],
          selectedModel: typeof model === "string" && (typeof modelProvider === "string" ? modelProvider : "") === id ? model : ""
        });
      }
    }
    return normalizeCodexModelsConfig({
      model: typeof model === "string" ? model : "",
      modelProvider: typeof modelProvider === "string" ? modelProvider : "",
      providers
    });
  }
  async _writeProviderConfiguration(key, value) {
    if (key === CODEX_MODELS_ROOT_CONFIG_KEY) {
      await this._writeModelsConfiguration(value);
      return;
    }
    const connection = await this._ensureConnection();
    let edits;
    if (key === "codex.permissionsPreset") {
      const preset = narrowCodexPermissionsPreset(value) ?? CODEX_DEFAULT_PERMISSIONS_PRESET;
      const axes = resolveCodexPermissionsPreset(preset);
      edits = [
        { keyPath: "approval_policy", value: axes.approvalPolicy, mergeStrategy: "replace" },
        { keyPath: "sandbox_mode", value: axes.sandboxMode, mergeStrategy: "replace" },
        { keyPath: "approvals_reviewer", value: axes.approvalsReviewer, mergeStrategy: "replace" },
        { keyPath: "sandbox_workspace_write.network_access", value: true, mergeStrategy: "replace" }
      ];
      if (preset === "full-access") {
        edits.push({ keyPath: "windows.sandbox", value: null, mergeStrategy: "replace" });
      }
    } else if (key === "codex.autoReviewPolicy" && value === "") {
      edits = [{ keyPath: "auto_review", value: null, mergeStrategy: "replace" }];
    } else if (key === "codex.personality" && value === "default") {
      edits = [{ keyPath: "personality", value: null, mergeStrategy: "replace" }];
    } else {
      edits = [{ keyPath: key === "codex.personality" ? "personality" : "auto_review.policy", value, mergeStrategy: "replace" }];
    }
    await connection.client.request("config/batchWrite", {
      edits,
      expectedVersion: null,
      reloadUserConfig: true
    });
    if (key === "codex.permissionsPreset") {
      const preset = narrowCodexPermissionsPreset(value) ?? CODEX_DEFAULT_PERMISSIONS_PRESET;
      this._logService.info(`[Codex] wrote permissions preset=${preset} to config.toml`);
      for (const session of this._sessions.values()) {
        this._configurationService.updateSessionConfig(session.sessionUri.toString(), {
          [CodexSessionConfigKey.PermissionsPreset]: preset
        });
        if (session.threadId !== void 0 && !session.firstTurnSent && !session.disposed) {
          void this._restartThreadWithCurrentTools(session).catch((error) => {
            this._logService.warn(`[Codex] failed to rematerialize session=${session.sessionUri.toString()} after permissions change: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
      }
    }
  }
  async _writeModelsConfiguration(value) {
    const next = withDefaultCodexRouting(normalizeCodexModelsConfig(value));
    this._writeForgeModelsFile(next);
    void this._queueModelRefresh();
    let connection;
    try {
      connection = await this._ensureConnection();
    } catch (error) {
      this._logService.warn(`[Codex] wrote ${FORGE_MODELS_FILE_NAME}; config.toml sync deferred: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const previous = normalizeCodexModelsConfig(this._providerConfigurationValues[CODEX_MODELS_ROOT_CONFIG_KEY]);
    const edits = [];
    if (next.model !== previous.model) {
      edits.push({ keyPath: "model", value: next.model === "" ? null : next.model, mergeStrategy: "replace" });
    }
    if (next.modelProvider !== previous.modelProvider) {
      edits.push({ keyPath: "model_provider", value: next.modelProvider === "" ? null : next.modelProvider, mergeStrategy: "replace" });
    }
    edits.push(...codexManagedModelProviderEdits(previous, next));
    if (edits.length === 0) {
      return;
    }
    await connection.client.request("config/batchWrite", {
      edits,
      expectedVersion: null,
      reloadUserConfig: true
    });
    this._disposeConnection();
    void this._queueModelRefresh();
  }
  _hydrateForgeModelsFromDisk() {
    const fileModels = this._readForgeModelsFile();
    const current = this._configurationService.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY];
    const resolved = preferCodexModelsConfig(fileModels, current);
    if (!resolved) {
      return;
    }
    this._providerConfigurationValues = {
      ...this._providerConfigurationValues,
      [CODEX_MODELS_ROOT_CONFIG_KEY]: resolved
    };
    this._configurationService.updateRootConfig({ [CODEX_MODELS_ROOT_CONFIG_KEY]: resolved });
    this._forgeModelsReady = true;
  }
  _persistForgeModelsFromRootConfig() {
    if (!this._forgeModelsReady) {
      return;
    }
    const models = this._configurationService.getRootConfigValues?.()?.[CODEX_MODELS_ROOT_CONFIG_KEY];
    if (models === void 0) {
      return;
    }
    const next = withDefaultCodexRouting(normalizeCodexModelsConfig(models));
    const existing = this._readForgeModelsFile();
    if (existing && JSON.stringify(existing) === JSON.stringify(next)) {
      return;
    }
    try {
      this._writeForgeModelsFile(next);
      this._providerConfigurationValues = {
        ...this._providerConfigurationValues,
        [CODEX_MODELS_ROOT_CONFIG_KEY]: next
      };
    } catch (error) {
      this._logService.error(`[Codex] Failed to write ${FORGE_MODELS_FILE_NAME}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  _refreshProviderConfiguration() {
    return this._providerConfigurationRefresh ??= (async () => {
      try {
        if (this._connection.kind === "idle" && !await this._isSdkResolvableWithoutDownload()) {
          this._hydrateForgeModelsFromDisk();
          this._forgeModelsReady = true;
          return;
        }
        this._providerConfigurationValues = await this._readProviderConfiguration();
        this._providerConfigurationReady = true;
        this._forgeModelsReady = true;
        if (!this._pendingProviderConfigurationWrite) {
          this._configurationService.updateRootConfig(this._providerConfigurationValues);
        }
      } catch (error) {
        this._logService.warn(`[Codex] Failed to read config.toml: ${error instanceof Error ? error.message : String(error)}`);
        this._hydrateForgeModelsFromDisk();
        this._forgeModelsReady = true;
      } finally {
        this._providerConfigurationRefresh = void 0;
        if (this._pendingProviderConfigurationWrite && this._providerConfigurationReady) {
          this._pendingProviderConfigurationWrite = false;
          this._queueProviderConfigurationWrite();
        } else if (this._pendingProviderConfigurationWrite && this._forgeModelsReady) {
          this._pendingProviderConfigurationWrite = false;
          this._persistForgeModelsFromRootConfig();
        }
      }
    })();
  }
  _queueProviderConfigurationWrite() {
    this._persistForgeModelsFromRootConfig();
    if (!this._providerConfigurationReady) {
      this._pendingProviderConfigurationWrite = true;
      void this._refreshProviderConfiguration();
      return;
    }
    const values = this._configurationService.getRootConfigValues?.() ?? {};
    for (const key of ["codex.permissionsPreset", "codex.personality", "codex.autoReviewPolicy", CODEX_MODELS_ROOT_CONFIG_KEY]) {
      if (values[key] === this._providerConfigurationValues[key]) {
        continue;
      }
      const value = values[key];
      if (value === void 0) {
        continue;
      }
      this._providerConfigurationWrite = this._providerConfigurationWrite.then(async () => {
        if (this._providerConfigurationValues[key] === value) {
          return;
        }
        await this._writeProviderConfiguration(key, value);
        this._providerConfigurationValues[key] = value;
      }).catch((error) => this._logService.error(`[Codex] Failed to update config.toml: ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  _readConfigurationValue(config, keyPath) {
    let value = config;
    for (const segment of keyPath.split(".")) {
      if (!value || Array.isArray(value) || typeof value !== "object") {
        return void 0;
      }
      value = value[segment];
    }
    return value;
  }
  _dispatchByThread(threadId, mapFn) {
    const subagent = this._subagentsByThreadId.get(threadId);
    if (subagent) {
      const actions2 = mapFn(subagent.session);
      for (const action of actions2) {
        this._fireSubagent(subagent, action);
      }
      return;
    }
    const sessionId = this._sessionIdByThreadId.get(threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] Ignoring notification for untracked threadId=${threadId}; likely unclaimed prewarm`);
      return;
    }
    const actions = mapFn(session);
    for (const action of actions) {
      this._fire(session.sessionUri, action);
    }
  }
  /**
   * `item/completed` dispatch. In addition to the normal per-thread mapping,
   * a parent session's completed `spawnAgent` collab tool call now carries
   * the child `receiverThreadIds`, so we register each spawned subagent and
   * emit a `subagent_started` signal (before mapping the completion, so the
   * shared orchestrator has attached the subagent-chat block to the parent
   * tool call by the time it completes).
   */
  _queueFileEvent(threadId, task) {
    const previous = this._fileEventDispatches.get(threadId) ?? Promise.resolve();
    const next = previous.then(task, task).catch((error) => {
      this._logService.error(`[Codex] File event dispatch failed for threadId=${threadId}: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => {
      if (this._fileEventDispatches.get(threadId) === next) {
        this._fileEventDispatches.delete(threadId);
      }
    });
    this._fileEventDispatches.set(threadId, next);
  }
  async _dispatchFileChangePatchUpdated(params) {
    const diagnosticsLog = getActiveForgeDiagnosticsLog();
    for (const change of params.changes) {
      diagnosticsLog?.recordLatestText("files", `codex-patch:${params.threadId}:${params.turnId}:${params.itemId}:${change.path}`, "FILE.PATCH", change.diff, { thread: params.threadId, turn: params.turnId, item: params.itemId, path: change.path, kind: change.kind });
    }
    const subagent = this._subagentsByThreadId.get(params.threadId);
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = subagent?.session ?? (sessionId ? this._sessions.get(sessionId) : void 0);
    if (!session) {
      this._logService.trace(`[Codex] Ignoring fileChange/patchUpdated for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
      return;
    }
    const mappedParams = this._withHostTurnId(session, params);
    const startActions = mapFileChangeStarted(session.mapState, mappedParams.turnId, mappedParams.itemId, mappedParams.changes);
    const entry = session.mapState.itemToToolCall.get(params.itemId);
    const snapshot = entry ? await this._fileEditObserver(session)?.snapshot(entry.turnId, entry.toolCallId, params.itemId, session.workingDirectory, params.changes) : void 0;
    const fileEdits = snapshot?.edits ?? [];
    const actions = [...startActions, ...mapFileChangePatchUpdated(session.mapState, mappedParams, fileEdits, snapshot?.previewUnavailable)];
    for (const action of actions) {
      if (subagent) {
        this._fireSubagent(subagent, action);
      } else {
        this._fire(session.sessionUri, action);
      }
    }
  }
  async _dispatchTurnDiffUpdated(params) {
    getActiveForgeDiagnosticsLog()?.recordLatestText("files", `codex-turn-diff:${params.threadId}:${params.turnId}`, "UNIFIED-DIFF", params.diff, { thread: params.threadId, turn: params.turnId });
    const subagent = this._subagentsByThreadId.get(params.threadId);
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = subagent?.session ?? (sessionId ? this._sessions.get(sessionId) : void 0);
    if (!session) {
      this._logService.trace(`[Codex] Ignoring turn/diff/updated for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
      return;
    }
    const turnId = this._hostTurnId(session, params.turnId);
    const toolCallId = session.mapState.turnDiffToolCall?.turnId === turnId ? session.mapState.turnDiffToolCall.toolCallId : generateUuid();
    const fileEdits = await this._fileEditObserver(session)?.snapshotTurnDiff(
      turnId,
      toolCallId,
      this._workingDirectories(session),
      params.diff
    ) ?? [];
    const actions = mapTurnDiffUpdated(session.mapState, turnId, toolCallId, fileEdits);
    for (const action of actions) {
      if (subagent) {
        this._fireSubagent(subagent, action);
      } else {
        this._fire(session.sessionUri, action);
      }
    }
  }
  async _dispatchItemStarted(params) {
    const subagent = this._subagentsByThreadId.get(params.threadId);
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = subagent?.session ?? (sessionId ? this._sessions.get(sessionId) : void 0);
    if (!session) {
      this._logService.trace(`[Codex] Ignoring item/started for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
      return;
    }
    if (params.item.type === "commandExecution") {
      await this._fileEditObserver(session)?.beginShell(
        params.item.id,
        params.item.command ?? "",
        params.item.cwd || session.workingDirectory?.fsPath,
        this._workingDirectories(session)
      );
    }
    const actions = this._handleItemStarted(session, params);
    for (const action of actions) {
      if (subagent) {
        this._fireSubagent(subagent, action);
      } else {
        this._fire(session.sessionUri, action);
      }
    }
  }
  async _dispatchItemCompleted(params) {
    const subagent = this._subagentsByThreadId.get(params.threadId);
    if (subagent) {
      const entry2 = subagent.session.mapState.itemToToolCall.get(params.item.id);
      const fileEdits2 = await this._fileEditsForCompletedItem(subagent.session, params, entry2);
      const actions2 = mapItemCompleted(subagent.session.mapState, this._withHostTurnId(subagent.session, params), fileEdits2);
      for (const action of actions2) {
        this._fireSubagent(subagent, action);
      }
      return;
    }
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] Ignoring item/completed for untracked threadId=${params.threadId}; likely unclaimed prewarm`);
      return;
    }
    this._maybeRegisterSubagents(session, params);
    const entry = session.mapState.itemToToolCall.get(params.item.id);
    const fileEdits = await this._fileEditsForCompletedItem(session, params, entry);
    const actions = mapItemCompleted(session.mapState, this._withHostTurnId(session, params), fileEdits);
    for (const action of actions) {
      this._fire(session.sessionUri, action);
    }
  }
  async _fileEditsForCompletedItem(session, params, entry) {
    if (!entry) {
      return [];
    }
    const observer = this._fileEditObserver(session);
    if (!observer) {
      return [];
    }
    if (params.item.type === "fileChange") {
      const completedEdits = await observer.complete(entry.turnId, entry.toolCallId, params.item.id, session.workingDirectory, params.item.changes, session.model?.id);
      return params.item.status === "completed" ? completedEdits : [];
    }
    if (params.item.type === "commandExecution") {
      const completedEdits = await observer.completeShell(entry.turnId, entry.toolCallId, params.item.id);
      return params.item.status === "completed" ? completedEdits : [];
    }
    if (params.item.type === "dynamicToolCall" && params.item.tool === CODEX_WRITE_FILE_TOOL_NAME) {
      const success = params.item.success === true || params.item.status === "completed";
      if (!success) {
        observer.abandonDirectWrite(params.item.id);
        return [];
      }
      return observer.completeDirectWrite(entry.turnId, entry.toolCallId, params.item.id, session.model?.id);
    }
    return [];
  }
  /**
   * `turn/completed` dispatch. For a subagent child thread, route the turn's
   * flush/orphan actions to the child conversation but suppress its
   * `ChatTurnComplete` — the child conversation's turn is closed cleanly
   * (without the parent's checkpoint/changeset/title side effects) by the
   * `subagent_completed` signal, which also tears down the child-thread
   * tracking.
   */
  _dispatchTurnCompleted(params) {
    const subagent = this._subagentsByThreadId.get(params.threadId);
    if (subagent) {
      const actions = this._handleTurnCompletedNotification(subagent.session, params);
      for (const action of actions) {
        if (action.type === ActionType.ChatTurnComplete) {
          continue;
        }
        this._fireSubagent(subagent, action);
      }
      this._subagentsByThreadId.delete(params.threadId);
      this._fileEditObservers.deleteAndDispose(params.threadId);
      subagent.session.pendingCommandApprovals.denyAll("decline");
      this._onDidChatProgress.fire({
        kind: "subagent_completed",
        chat: subagent.session.chatChannel,
        toolCallId: subagent.toolCallId
      });
      return;
    }
    this._dispatchByThread(params.threadId, (s) => this._handleTurnCompletedNotification(s, params));
  }
  /**
   * When a parent session's `spawnAgent` collab tool call completes it
   * carries the child thread id(s) in `receiverThreadIds`. Register an
   * isolated subagent session for each new child thread and emit a
   * `subagent_started` signal so the shared orchestrator opens the read-only
   * child conversation and attaches its discovery block to the parent tool
   * call.
   */
  _maybeRegisterSubagents(session, params) {
    const item = params.item;
    if (item.type !== "collabAgentToolCall" || item.tool !== "spawnAgent") {
      return;
    }
    const entry = session.mapState.itemToToolCall.get(item.id);
    if (!entry) {
      return;
    }
    const parentChat = session.chatChannel;
    const model = item.model || void 0;
    const taskDescription = item.prompt || void 0;
    for (const childThreadId of item.receiverThreadIds) {
      if (this._subagentsByThreadId.has(childThreadId)) {
        continue;
      }
      const subSession = this._createSubagentSession(session, childThreadId);
      this._subagentsByThreadId.set(childThreadId, {
        parentSessionId: session.sessionId,
        toolCallId: entry.toolCallId,
        session: subSession
      });
      this._onDidChatProgress.fire({
        kind: "subagent_started",
        chat: parentChat,
        toolCallId: entry.toolCallId,
        agentName: model ?? "codex",
        agentDisplayName: model ?? "Subagent",
        taskDescription,
        // Codex surfaces the full delegated instruction as `item.prompt`.
        taskPrompt: typeof item.prompt === "string" && item.prompt.length > 0 ? item.prompt : void 0
      });
      this._logService.trace(`[Codex:${session.sessionId}] subagent spawned thread=${childThreadId} toolCall=${entry.toolCallId} model=${model ?? "(default)"}`);
    }
  }
  /**
   * Build an isolated {@link ICodexSession} used to run the shared event
   * mappers for a subagent child thread. It shares the parent's `sessionUri`
   * (so side effects target the parent's working tree and the fired actions
   * resolve to the parent chat channel) and `acceptedForSession` memo (so the
   * accept-for-session decision spans parent + subagents), but has its own
   * fresh map/turn state and approval registry so the child's events don't
   * collide with the parent's.
   */
  _createSubagentSession(parent, childThreadId) {
    const clientToolSet = new ActiveClientToolSet();
    return {
      sessionId: parent.sessionId,
      threadId: childThreadId,
      sessionUri: parent.sessionUri,
      startTime: parent.startTime,
      modifiedTime: parent.modifiedTime,
      summary: parent.summary,
      chatChannel: parent.chatChannel,
      workingDirectory: parent.workingDirectory,
      workingDirectories: parent.workingDirectories,
      multiRootEnabled: parent.multiRootEnabled,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(this._hostServerToolNames(), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: parent.acceptedForSession,
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      materializedCustomizationsSig: void 0,
      materializedPermissionsSig: void 0,
      materializedModelProvider: parent.materializedModelProvider,
      firstTurnSent: true,
      model: parent.model,
      agent: parent.agent,
      customizationDirectory: void 0,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: false,
      unsubscribeBeforeResume: false,
      resumePromise: void 0,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: true,
      prewarmTimer: void 0,
      prewarmClaimed: true,
      serverToolsAdvertised: true,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
  }
  /**
   * Fire a subagent action tagged with the parent `spawnAgent` tool call.
   * The `resource` is the parent chat channel (the key the subagent
   * conversation is registered under in the orchestrator); `parentToolCallId`
   * routes the action into the child's read-only conversation.
   */
  _fireSubagent(subagent, action) {
    this._onDidChatProgress.fire({
      kind: "action",
      resource: subagent.session.chatChannel,
      action,
      parentToolCallId: subagent.toolCallId
    });
  }
  /**
   * Phase 4: handle `item/commandExecution/requestApproval` from
   * codex. Look up the host-side tool call for the item, emit a
   * `ChatToolCallReady` in PendingConfirmation, park on a deferred
   * keyed by toolCallId, and resolve when the user (or the
   * accept-for-session memo) decides. Unknown sessions / items
   * decline silently so codex stops blocking.
   */
  async _handleCommandApprovalRequestRpc(params) {
    const decision = await this._handleCommandApprovalRequest(params);
    return { result: { decision } };
  }
  async _handleCommandApprovalRequest(params) {
    const target = this._resolveApprovalTarget(params.threadId);
    if (!target) {
      this._logService.warn(`[Codex] commandExecution/requestApproval for unknown threadId=${params.threadId}; declining`);
      return "decline";
    }
    const session = target.session;
    const entry = session.mapState.itemToToolCall.get(params.itemId);
    if (!entry) {
      this._logService.warn(`[Codex:${session.sessionId}] commandExecution/requestApproval for unknown itemId=${params.itemId}; declining`);
      return "decline";
    }
    const command = params.command ?? "";
    const displayCommand = unwrapShellInvocation(command);
    if (command && session.acceptedForSession.has(command)) {
      return "acceptForSession";
    }
    const confirmationTitle = params.reason ?? "Run shell command";
    const decision = await session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
      this._fireApproval(target, {
        type: ActionType.ChatToolCallReady,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        invocationMessage: displayCommand,
        toolInput: displayCommand,
        confirmationTitle
      });
    });
    if (decision === "acceptForSession" && command) {
      session.acceptedForSession.add(command);
    }
    return decision;
  }
  async _handleFileChangeApprovalRequestRpc(params) {
    const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? "Apply file changes");
    return { result: { decision: narrowFileChangeDecision(decision) } };
  }
  async _handlePermissionsApprovalRequestRpc(params) {
    const decision = await this._requestItemApproval(params.threadId, params.itemId, params.reason ?? "Grant elevated permissions");
    const granted = decision === "accept" || decision === "acceptForSession";
    return {
      result: {
        // Grant exactly what was requested on accept; nothing on decline.
        permissions: granted ? { network: params.permissions.network ?? void 0, fileSystem: params.permissions.fileSystem ?? void 0 } : {},
        scope: decision === "acceptForSession" ? "session" : "turn"
      }
    };
  }
  /**
   * Shared approval flow for item-scoped `requestApproval` requests that
   * don't carry their own command string: look up the host tool call for
   * the item, fire a pending-confirmation `ChatToolCallReady`, and resolve
   * when the user (via {@link respondToPermissionRequest}) decides. Declines
   * if the session or item is unknown.
   */
  async _requestItemApproval(threadId, itemId, confirmationTitle) {
    const target = this._resolveApprovalTarget(threadId);
    if (!target) {
      this._logService.warn(`[Codex] approval request for unknown threadId=${threadId}; declining`);
      return "decline";
    }
    const session = target.session;
    const entry = session.mapState.itemToToolCall.get(itemId);
    if (!entry) {
      this._logService.warn(`[Codex:${session.sessionId}] approval request for unknown itemId=${itemId}; declining`);
      return "decline";
    }
    return session.pendingCommandApprovals.registerAndFire(entry.toolCallId, () => {
      this._fireApproval(target, {
        type: ActionType.ChatToolCallReady,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        invocationMessage: confirmationTitle,
        toolInput: confirmationTitle,
        confirmationTitle
      });
    });
  }
  /**
   * Resolve the {@link ICodexSession} that owns a codex thread for an
   * approval request, plus the subagent wrapper when the thread is a
   * collab-agent child. A subagent tool call's pending-confirmation
   * `ChatToolCallReady` must be fired with the parent `spawnAgent` tool call
   * as its `parentToolCallId` (via {@link _fireApproval}) so it lands in the
   * child's read-only conversation — where the matching
   * `ChatToolCallStart` lives — instead of on the parent session.
   */
  _resolveApprovalTarget(threadId) {
    const subagent = this._subagentsByThreadId.get(threadId);
    if (subagent) {
      return { session: subagent.session, subagent };
    }
    const sessionId = this._sessionIdByThreadId.get(threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    return session ? { session } : void 0;
  }
  /** Fire an approval action to the parent session or the subagent conversation. */
  _fireApproval(target, action) {
    if (target.subagent) {
      this._fireSubagent(target.subagent, action);
    } else {
      this._fire(target.session.sessionUri, action);
    }
  }
  _handleGuardianWarning(session, params) {
    const turnId = session.currentTurnId;
    if (turnId === void 0) {
      this._logService.trace(`[Codex:${session.sessionId}] guardianWarning without active turn; ignoring`);
      return [];
    }
    return [{
      type: ActionType.ChatResponsePart,
      turnId,
      part: {
        kind: ResponsePartKind.SystemNotification,
        content: params.message
      }
    }];
  }
  async _handleGuardianReviewCompleted(client, params) {
    const sessionId = this._sessionIdByThreadId.get(params.threadId);
    const session = sessionId ? this._sessions.get(sessionId) : void 0;
    if (!session) {
      this._logService.trace(`[Codex] autoApprovalReview/completed for unknown threadId=${params.threadId}; ignoring`);
      return;
    }
    if (params.review.status !== "denied") {
      return;
    }
    if (session.handledGuardianReviews.has(params.reviewId)) {
      return;
    }
    const turnId = this._hostTurnId(session, params.turnId);
    if (session.currentTurnId !== turnId) {
      this._logService.trace(`[Codex:${sessionId}] autoApprovalReview/completed for non-current turn ${turnId} (current=${session.currentTurnId ?? "(none)"}); ignoring reviewId=${params.reviewId}`);
      return;
    }
    session.handledGuardianReviews.add(params.reviewId);
    const summary = summarizeGuardianReviewAction(params.action);
    this._fire(session.sessionUri, {
      type: ActionType.ChatResponsePart,
      turnId,
      part: {
        kind: ResponsePartKind.Markdown,
        id: generateUuid(),
        content: formatGuardianDenialNotification(summary, params.review.rationale)
      }
    });
    const toolCallId = generateUuid();
    const invocationMessage = summary.detail || summary.title;
    const confirmationTitle = "Approve anyway";
    session.pendingGuardianReviewCards.add(toolCallId);
    let decision;
    try {
      decision = await session.pendingCommandApprovals.registerAndFire(toolCallId, () => {
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallStart,
          turnId,
          toolCallId,
          toolName: "auto_review_denied",
          displayName: summary.title,
          intention: invocationMessage
        });
        this._fire(session.sessionUri, {
          type: ActionType.ChatToolCallReady,
          turnId,
          toolCallId,
          invocationMessage,
          confirmationTitle
        });
      });
    } catch (err) {
      this._logService.trace(`[Codex:${sessionId}] guardian approval cancelled for reviewId=${params.reviewId}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      session.pendingGuardianReviewCards.delete(toolCallId);
    }
    if (decision !== "accept" && decision !== "acceptForSession") {
      return;
    }
    if (session.currentTurnId !== turnId) {
      this._logService.trace(`[Codex:${sessionId}] turn ended before guardian approval could be applied for reviewId=${params.reviewId}`);
      return;
    }
    try {
      await client.request("thread/approveGuardianDeniedAction", {
        threadId: params.threadId,
        event: toGuardianAssessmentEventJson(params)
      });
      this._fire(session.sessionUri, {
        type: ActionType.ChatToolCallComplete,
        turnId,
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Approved anyway"
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[Codex:${sessionId}] approveGuardianDeniedAction failed for reviewId=${params.reviewId}: ${message}`);
      this._fire(session.sessionUri, {
        type: ActionType.ChatToolCallComplete,
        turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: "Approval failed",
          error: { message }
        }
      });
    }
  }
  _handleConnectionLost() {
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    this._connection = { kind: "idle" };
    for (const session of this._sessions.values()) {
      session.pendingCommandApprovals.denyAll("decline");
      session.pendingClientToolCalls.rejectAll(new CancellationError());
      session.pendingUserInputs.rejectAll(new CancellationError());
      this._drainPendingSteering(session);
      const turnId = session.currentTurnId;
      const appTurnId = session.currentAppTurnId;
      session.currentTurnId = void 0;
      session.currentAppTurnId = void 0;
      if (appTurnId) {
        session.hostTurnIdByAppTurnId.delete(appTurnId);
      }
      if (turnId) {
        const duration = this._clearTurnStopWatch(session);
        this._fire(session.sessionUri, {
          type: ActionType.ChatError,
          turnId,
          duration,
          error: { errorType: "CodexDisconnected", message: "Codex app-server disconnected; session must restart." }
        });
        this._fire(session.sessionUri, { type: ActionType.ChatTurnComplete, turnId, duration });
      }
    }
    for (const subagent of this._subagentsByThreadId.values()) {
      subagent.session.pendingCommandApprovals.denyAll("decline");
      subagent.session.pendingClientToolCalls.rejectAll(new CancellationError());
      subagent.session.pendingUserInputs.rejectAll(new CancellationError());
      subagent.session.currentTurnId = void 0;
      subagent.session.currentAppTurnId = void 0;
    }
    this._subagentsByThreadId.clear();
    try {
      conn.client.dispose();
    } catch (err) {
      this._logService.error(`[Codex] Failed to dispose app-server client after connection lost: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      conn.proxyHandle?.dispose();
    } catch (err) {
      this._logService.error(`[Codex] Failed to dispose proxy handle after connection lost: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _disposeConnection() {
    const connection = this._connection;
    this._connectionGeneration++;
    this._connection = { kind: "idle" };
    if (connection.kind !== "ready") {
      return;
    }
    try {
      connection.client.dispose();
    } catch {
    }
    try {
      connection.proxyHandle?.dispose();
    } catch {
    }
    try {
      connection.child.kill("SIGKILL");
    } catch {
    }
  }
  // #endregion
  // #region IAgent methods
  getDescriptor() {
    return {
      provider: this.id,
      displayName: localize("codexAgent.displayName", "Codex"),
      description: localize("codexAgent.description", "Codex agent using session-selected model providers"),
      capabilities: {
        multipleChats: { fork: true },
        ...this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
      }
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostCodexMultiRootEnabledConfigKey) === true;
  }
  /**
   * Resolve a host-addressed Codex chat to the session of the runtime backing
   * it. Resolution has exactly two sources, in order: the binding this agent
   * recorded when the chat was provisioned or restored, and the transient
   * `{ configurationResource, resource }` context Agent Host supplies for
   * operations that run before a binding exists. There is deliberately no
   * third fallback — neither chat-URI shape parsing, nor host-side
   * membership heuristics, nor the legacy "a session URI addresses its own
   * chat" adapter — so an unaddressable chat surfaces as `undefined` instead
   * of silently routing to some other conversation.
   */
  _resolveConversationSession(address, sessionOrContext) {
    const sessionId = this._sessionIdByChatUri.get(address.toString());
    if (sessionId) {
      return AgentSession.uri(this.id, sessionId);
    }
    return sessionOrContext ? resolveAgentChatContext(sessionOrContext, address).configurationResource : void 0;
  }
  /**
   * Resolve the configuration scope `chat` is (or was) registered under, for
   * ref-tracking only. Always prefers the scope this agent itself recorded
   * when the chat was tracked (see {@link _trackConfigScopeChat}) — a peer
   * chat's backing runtime can be keyed by its own thread id, which differs
   * from the session/config scope it was created under, so re-deriving the
   * scope from the runtime binding (as {@link _resolveConversationSession}
   * does) would disagree with the scope it was originally counted against.
   * Only for a chat this agent never tracked (e.g. a legacy-recovered or
   * subagent chat) does this fall back to the host-supplied context, and
   * finally to the chat's own address.
   */
  _configScope(chat, context) {
    const tracked = this._configScopeByChat.get(chat.toString());
    if (tracked) {
      return URI.parse(tracked);
    }
    if (context) {
      return resolveAgentChatContext(context, chat).configurationResource;
    }
    return this._resolveConversationSession(chat) ?? chat;
  }
  /** Registers `chat` as live under `configurationResource`'s ref-tracked scope. Idempotent. */
  _trackConfigScopeChat(configurationResource, chat) {
    const key = configurationResource.toString();
    let chats = this._configScopeChats.get(key);
    if (!chats) {
      chats = /* @__PURE__ */ new Set();
      this._configScopeChats.set(key, chats);
    }
    chats.add(chat.toString());
    this._configScopeByChat.set(chat.toString(), key);
  }
  /**
   * Drops `chat` from its configuration scope's ref set. Returns `true` once
   * every chat ever registered under that scope has been disposed — the
   * signal that it is safe to reclaim scope-level resources — or `false`
   * while others remain.
   */
  _untrackConfigScopeChat(configurationResource, chat) {
    this._configScopeByChat.delete(chat.toString());
    const key = configurationResource.toString();
    const chats = this._configScopeChats.get(key);
    if (!chats) {
      return true;
    }
    chats.delete(chat.toString());
    if (chats.size > 0) {
      return false;
    }
    this._configScopeChats.delete(key);
    return true;
  }
  /**
   * Reclaims a configuration scope's managed working directory once its ref
   * count has dropped to zero and the scope's own runtime identity
   * (`AgentSession.id(configurationResource)`) is not currently live —
   * mirroring the reclaim a live runtime already performs on its own
   * destructive teardown ({@link _teardownSessionInMemory}), for the case
   * where that runtime was never (or no longer) resident in memory. Every
   * caller of this method (`_disposeChat`'s scope release, and
   * `_disposeRuntimeSession`'s destructive path for an already-gone
   * runtime) is on a destructive-only path, so this also releases the
   * scope's OTel trace context — `sessionUri` here round-trips to the exact
   * key `_traceContext` acquired it under whenever this scope was the
   * runtime's own adopted identity (see {@link ICodexSession.threadId}).
   */
  async _reclaimManagedWorkingDirectoryIfNotLive(sessionUri) {
    const sessionId = AgentSession.id(sessionUri);
    if (this._sessions.has(sessionId)) {
      return;
    }
    this._otelService.releaseSessionTraceContext(sessionUri.toString());
    const overlay = await this._metadataStore.read(sessionUri);
    const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId) ?? overlay.managedWorkingDirectory;
    if (managedWorkingDirectory) {
      await this._removeManagedWorkingDirectory(managedWorkingDirectory);
    }
    this._releasedManagedWorkingDirectories.delete(sessionId);
  }
  /**
   * Untracks `chat` from its configuration scope's ref count and, once no
   * chat remains registered under that scope, reclaims the scope's managed
   * working directory. Driven entirely by the ref count reaching zero —
   * never by whether `chat` happens to be "the default chat" or by an
   * Agent-Host-guaranteed teardown order.
   */
  async _releaseConfigScopeIfDone(chat, context) {
    const configurationResource = this._configScope(chat, context);
    if (this._untrackConfigScopeChat(configurationResource, chat)) {
      await this._reclaimManagedWorkingDirectoryIfNotLive(configurationResource);
    }
  }
  /**
   * Record the concrete host chat URI that addresses this runtime.
   */
  _recordChatTarget(chat, sessionUri) {
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (session) {
      session.chatChannel = chat;
    }
    this._sessionIdByChatUri.set(chat.toString(), sessionId);
  }
  async _changeAgent(chat, agent, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const sessionUri = this._resolveConversationSession(chat, operationContext);
    if (!sessionUri) {
      throw new Error(`Codex conversation is not bound: ${chat.toString()}`);
    }
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (!session) {
      await this._metadataStore.write(sessionUri, { agent: agent ?? null });
      return;
    }
    session.agent = agent;
    await this._metadataStore.write(sessionUri, { agent: agent ?? null });
    if (session.threadId === void 0) {
      return;
    }
    if (!session.firstTurnSent) {
      await this._restartThreadWithCurrentTools(session);
      this._persistMaterializedSession(session);
    } else {
      this._markSessionForReload(session);
    }
  }
  /**
   * Single creation path for every Codex chat (fresh or forked, first or
   * additional). Records the chat→backing binding as part of this call, not
   * as a follow-up assignment.
   *
   * Identity of the new backing: while the owning session has no backing
   * yet, the runtime adopts the session's own identity (kept provisional,
   * see {@link ICodexSession.threadId}); otherwise it is identified by the
   * thread it mints and started eagerly.
   *
   * A fresh create (not a rebind of an already-bound chat) is transactional:
   * a failure anywhere after the config-scope ref is registered — import
   * rejection, model resolution, fork/start-backing, the eager active-client
   * seed, or the server-tool advertise — rolls back every bit of state that
   * step (or an earlier one in this same call) may have committed: the
   * config-scope ref count and any managed working directory it alone was
   * keeping alive, plus, once a runtime was actually registered, that
   * runtime itself, its active-client handle, and its timers. A caller that
   * retries after a failed create must see a clean slate, never a
   * half-registered chat piling onto the next attempt.
   */
  async _createChat(chat, context, options) {
    const target = { resource: chat };
    const owningSessionId = AgentSession.id(context.configurationResource);
    this._logService.info(`[Codex DEBUG] createChat accountStatus=${this._openAIAccountState.status} session=${context.configurationResource.toString()} chat=${chat.toString()} model=${options?.model?.id ?? "(none)"} cwd=${options?.workingDirectories?.[0]?.toString() ?? "(none)"}`);
    this._trackConfigScopeChat(context.configurationResource, chat);
    const boundSessionId = this._sessionIdByChatUri.get(chat.toString());
    if (boundSessionId !== void 0) {
      return this._rebindChat(boundSessionId, context, target, options);
    }
    try {
      if (options?.importConversation) {
        throw new Error("Codex does not support importing an existing conversation into a new chat.");
      }
      if (this._models.get().length === 0 && this._modelsRefreshPromise) {
        await this._modelsRefreshPromise;
      }
      const adoptedSessionId = this._hasSessionBacking(owningSessionId) ? void 0 : owningSessionId;
      const session = options?.fork ? await this._forkChatBacking(options.fork, options, adoptedSessionId, target) : adoptedSessionId !== void 0 ? this._deferChatBacking(adoptedSessionId, options, target) : await this._startChatBacking(context, options, target);
      try {
        await this._seedEagerActiveClient(session.sessionUri, chat, context, options?.activeClient);
        if (session.threadId === void 0) {
          this._schedulePrewarm(session);
        }
        if (!session.serverToolsAdvertised && this._serverToolHost) {
          session.serverToolsAdvertised = true;
          this._serverToolHost.advertise(context.configurationResource.toString());
        }
      } catch (err) {
        await this._rollbackRegisteredChatCreation(session, chat);
        throw err;
      }
      this._logService.info(`[Codex] created chat ${chat.toString()} backed by ${session.sessionUri.toString()} thread=${session.threadId ?? "(deferred)"} (session ${context.configurationResource.toString()})`);
      return this._createChatResult(context, session);
    } catch (err) {
      await this._releaseConfigScopeIfDone(chat, context);
      throw err;
    }
  }
  /**
   * Undo a runtime this same {@link _createChat} call just registered, once
   * a later step in that call (the eager active-client seed or the
   * server-tool advertise) fails. Mirrors the destructive
   * {@link _disposeChat} path exactly — same active-client handle removal,
   * same {@link _teardownSessionInMemory} teardown (pending registries,
   * MCP controller, timers, managed working directory, OTel trace context)
   * — because a runtime a failed create leaves behind is indistinguishable
   * from one a caller created and immediately disposed.
   */
  async _rollbackRegisteredChatCreation(session, chat) {
    this._removeActiveClientHandlesForChat(chat);
    await this._teardownSessionInMemory(session, session.sessionId, true);
    this._sessionIdByChatUri.delete(chat.toString());
  }
  /**
   * Hand back the backing already bound to a chat, refreshed with the
   * caller's resolved options. Creation is idempotent: a second create for an
   * already-bound chat must neither mint a second thread nor leave the
   * runtime unbound.
   */
  async _rebindChat(sessionId, context, target, options) {
    const existing = this._sessions.get(sessionId);
    if (!existing) {
      const backingSession = AgentSession.uri(this.id, sessionId);
      const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId);
      return {
        ...isEqual(backingSession, context.configurationResource) ? {} : { backingSession },
        providerData: encodeCodexChat({
          sessionId,
          ...managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}
        })
      };
    }
    if (options?.model) {
      existing.model = this._resolveCreationModel(options.model) ?? existing.model;
    }
    if (options?.agent) {
      existing.agent = options.agent;
    }
    this._recordChatTarget(target.resource, existing.sessionUri);
    await this._seedEagerActiveClient(existing.sessionUri, target.resource, context, options?.activeClient);
    return this._createChatResult(context, existing);
  }
  /**
   * Whether a runtime already backs `sessionId` — live, or released but still
   * bound to a chat. A creation adopts the owning session's identity only
   * while it is free; every later chat mints a backing thread of its own.
   */
  _hasSessionBacking(sessionId) {
    if (this._sessions.has(sessionId)) {
      return true;
    }
    for (const boundSessionId of this._sessionIdByChatUri.values()) {
      if (boundSessionId === sessionId) {
        return true;
      }
    }
    return false;
  }
  /**
   * Resolve the model a creation runs with: the caller's explicit selection
   * when the catalog knows it, else the `fallback` a forked chat inherits
   * from its source, else Codex's default. An explicitly requested model the
   * catalog does not know is rejected rather than silently replaced, and the
   * resolved model's provider must be authenticated before any thread work.
   */
  _resolveCreationModel(requested, fallback) {
    const selection = requested ?? fallback;
    const model = this._supportedModelOrUndefined(selection);
    if (selection && !model) {
      throw new Error(`Codex model '${selection.id}' is not available.`);
    }
    this._ensureModelProviderAuthenticated(model);
    return model;
  }
  /**
   * Describe the exact backing this creation bound to the chat.
   *
   * `backingSession` names the app-server thread whenever that thread is a
   * record of its own, so the orchestrator can suppress it from the top-level
   * session list; the session's own record is never reported as an internal
   * chat backing, since that marker would hide the session itself. The
   * result never reports which identity the backing adopted — the
   * orchestrator already owns that session URI and never needs it echoed
   * back.
   */
  _createChatResult(context, session) {
    const backingSession = AgentSession.uri(this.id, session.threadId ?? session.sessionId);
    const managedWorkingDirectory = session.managedWorkingDirectory ?? this._releasedManagedWorkingDirectories.get(session.sessionId);
    return {
      ...session.workingDirectory ? { resolvedWorkingDirectory: session.workingDirectory } : {},
      ...session.threadId === void 0 ? { provisional: true } : {},
      ...isEqual(backingSession, context.configurationResource) ? {} : { backingSession },
      providerData: encodeCodexChat({
        sessionId: session.sessionId,
        ...session.model ? { model: session.model } : {},
        ...managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}
      })
    };
  }
  /**
   * Register a backing whose codex thread is deferred (see
   * {@link ICodexSession.threadId} for why). `thread/start` happens on
   * prewarm, the first `sendMessage`, or `getChatMetadata` for restore — by
   * which point a managed temp folder can be created lazily if the client
   * gave no working directory, instead of rejecting the creation.
   */
  _deferChatBacking(sessionId, options, target) {
    const model = this._resolveCreationModel(options?.model);
    const multiRootEnabled = this._isMultiRootEnabled();
    const workingDirectories = multiRootEnabled && (options?.workingDirectories?.length ?? 0) > 1 ? distinctWorkingDirectories(options?.workingDirectories) : void 0;
    const clientToolSet = new ActiveClientToolSet();
    const now = Date.now();
    const session = {
      sessionId,
      threadId: void 0,
      sessionUri: AgentSession.uri(this.id, sessionId),
      startTime: now,
      modifiedTime: now,
      summary: void 0,
      chatChannel: target.resource,
      workingDirectory: options?.workingDirectories?.[0],
      workingDirectories,
      multiRootEnabled,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(this._hostServerToolNames(), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: /* @__PURE__ */ new Set(),
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      materializedCustomizationsSig: void 0,
      materializedPermissionsSig: void 0,
      materializedModelProvider: void 0,
      firstTurnSent: false,
      model,
      agent: options?.agent,
      customizationDirectory: void 0,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: false,
      unsubscribeBeforeResume: false,
      resumePromise: void 0,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: false,
      prewarmTimer: void 0,
      prewarmClaimed: false,
      serverToolsAdvertised: false,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
    this._sessions.set(sessionId, session);
    this._sessionIdByChatUri.set(target.resource.toString(), sessionId);
    return session;
  }
  /**
   * Start a backing thread now and register the runtime it identifies. Used
   * when the owning session's identity is already taken: the new chat is a
   * top-level codex thread of its own (session id == thread id), so the
   * thread has to exist before the creation can name it as the chat's exact
   * backing. It runs in the host-resolved working directory, or in a managed
   * temp folder when the session has none, and inherits nothing from the
   * parent session beyond the resolved options and its live active clients.
   */
  async _startChatBacking(context, options, target) {
    const owningSessionId = AgentSession.id(context.configurationResource);
    const model = this._resolveCreationModel(options?.model);
    if (!model) {
      throw new Error("Codex has no available models.");
    }
    const hostWorkingDirectory = options?.workingDirectories?.[0];
    const managedWorkingDirectory = hostWorkingDirectory ? void 0 : await this._createManagedWorkingDirectory(`chat-${generateUuid()}`);
    const workingDirectory = hostWorkingDirectory ?? managedWorkingDirectory;
    if (!workingDirectory) {
      throw new Error(`[Codex] createChat: failed to resolve a working directory for session ${context.configurationResource.toString()}`);
    }
    try {
      const resolvedConfig = options?.config ?? {};
      const permissionDefaults = this._permissionAxisDefaults();
      const { approvalPolicy, sandboxMode, approvalsReviewer } = resolveCodexPermissions(
        migrateCodexPermissionValues(resolvedConfig, permissionDefaults),
        permissionDefaults
      );
      const scratch = this._createResumedSessionEntry(owningSessionId, "", workingDirectory, model, target);
      const mcpServers = this._buildSessionMcpServers(scratch);
      const dynamicTools = this._buildDynamicTools(scratch);
      const validatedConfig = codexSessionConfigSchema.validateOrDefault(resolvedConfig, codexSessionConfigDefaults);
      const threadConfig = {
        web_search: narrowWebSearchMode(validatedConfig[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
        [CODEX_APPLY_PATCH_STREAMING_FEATURE]: true
      };
      if (Object.keys(mcpServers).length > 0) {
        threadConfig.mcp_servers = mcpServers;
      }
      const conn = await this._ensureConnection();
      const resolvedModel = this._routeCodexModel(model);
      const startResult = await conn.client.request("thread/start", {
        cwd: workingDirectory.fsPath,
        model: resolvedModel.modelId,
        modelProvider: resolvedModel.modelProvider,
        approvalPolicy,
        sandbox: sandboxMode,
        approvalsReviewer,
        config: threadConfig,
        dynamicTools
      });
      const threadId = startResult.thread.id;
      const session = this._createResumedSessionEntry(threadId, threadId, workingDirectory, model, target, void 0, void 0, options?.agent);
      session.needsResume = false;
      session.firstTurnSent = false;
      session.materializedEventFired = false;
      session.materializedMcpSig = mcpServersSignature(mcpServers);
      session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
      session.managedWorkingDirectory = managedWorkingDirectory;
      this._sessions.set(threadId, session);
      this._sessionIdByThreadId.set(threadId, threadId);
      this._sessionIdByChatUri.set(target.resource.toString(), threadId);
      this._persistMaterializedSession(session);
      return session;
    } catch (err) {
      if (managedWorkingDirectory) {
        await this._removeManagedWorkingDirectory(managedWorkingDirectory);
      }
      throw err;
    }
  }
  /**
   * Re-attach a chat's backing thread on restore. The orchestrator
   * hands back the opaque `providerData` produced by
   * {@link _createChat}; we rebuild a resumable session entry keyed
   * by the backing thread id and bind it to the chat URI before its history is
   * read. Its first send issues a `thread/resume`.
   */
  async materializeChat(chat, context, providerData) {
    const operationContext = resolveAgentChatContext(context, chat);
    const target = { resource: chat };
    let decoded;
    if (providerData === void 0) {
      if (!isDefaultChatUri(chat)) {
        return;
      }
      decoded = { sessionId: AgentSession.id(operationContext.configurationResource) };
    } else {
      decoded = decodeCodexChat(providerData);
      if (!decoded) {
        this._logService.warn(`[Codex] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
        return;
      }
    }
    this._trackConfigScopeChat(operationContext.configurationResource, chat);
    const sessionId = decoded.sessionId;
    const existing = this._sessions.get(sessionId);
    if (existing) {
      existing.chatChannel = chat;
      this._sessionIdByChatUri.set(chat.toString(), existing.sessionId);
      return providerData === void 0 ? { providerData: encodeCodexChat(decoded) } : void 0;
    }
    const sessionUri = AgentSession.uri(this.id, sessionId);
    const overlay = await this._metadataStore.read(sessionUri);
    const threadId = overlay.threadId ?? sessionId;
    const managedWorkingDirectory = this._releasedManagedWorkingDirectories.get(sessionId) ?? overlay.managedWorkingDirectory;
    const workingDirectory = overlay.cwd ?? managedWorkingDirectory;
    if (this._models.get().length === 0) {
      await this.refreshModels();
    }
    const model = this._supportedModelOrUndefined(overlay.modelId ? { id: overlay.modelId } : decoded.model);
    const session = this._createResumedSessionEntry(sessionId, threadId, workingDirectory, model, target, void 0, void 0, overlay.agent);
    if (managedWorkingDirectory) {
      session.managedWorkingDirectory = managedWorkingDirectory;
    }
    this._releasedManagedWorkingDirectories.delete(sessionId);
    this._sessions.set(sessionId, session);
    this._sessionIdByThreadId.set(threadId, sessionId);
    this._sessionIdByChatUri.set(chat.toString(), sessionId);
    if (!session.serverToolsAdvertised && this._serverToolHost) {
      session.serverToolsAdvertised = true;
      this._serverToolHost.advertise(operationContext.configurationResource.toString());
    }
    if (providerData === void 0) {
      return { providerData: encodeCodexChat(decoded) };
    }
  }
  async recoverLegacyChat(chat, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const sessionId = AgentSession.id(operationContext.configurationResource);
    this._recordChatTarget(chat, AgentSession.uri(this.id, sessionId));
    return { providerData: encodeCodexChat({ sessionId }) };
  }
  /**
   * Seed the active client supplied with {@link IAgentChats.createChat} before the agent
   * host asks for the initial customization snapshot. The initial state is
   * assigned directly rather than dispatched as `session/activeClientSet`, so
   * without this step Codex would not receive the client's tools or
   * customizations until a later turn happened to re-register the client.
   *
   * `chat` is the one exact chat this seed applies to — the chat the
   * creating call is binding. The agent never invents a chat URI to stand in
   * for it, and never propagates the seed to any sibling chat.
   */
  async _seedEagerActiveClient(sessionUri, chat, context, activeClient) {
    if (!activeClient) {
      return;
    }
    const handle = this.getOrCreateActiveClient(chat, context, { clientId: activeClient.clientId, displayName: activeClient.displayName });
    handle.tools = activeClient.tools;
    if (activeClient.customizations !== void 0) {
      await this._syncClientCustomizations(sessionUri, activeClient.clientId, activeClient.customizations, { quiet: true });
    }
  }
  /**
   * Build an {@link ICodexSession} entry for a thread that already exists on
   * the app-server (a restored session or a freshly forked one). Such a
   * session skips materialization — its first {@link _sendMessage} issues a
   * `thread/resume` (`needsResume: true`) — so the prewarm/first-turn flags
   * are pre-set to their post-materialization values.
   *
   * `sessionUri` is *derived* from `sessionId` rather than supplied — see
   * {@link ICodexSession.sessionUri} for why that must always hold.
   */
  _createResumedSessionEntry(sessionId, threadId, workingDirectory, model, target, workingDirectories, multiRootEnabled, agent, materializedModelProvider) {
    const clientToolSet = new ActiveClientToolSet();
    const effectiveWorkingDirectories = distinctWorkingDirectories(workingDirectories);
    const now = Date.now();
    return {
      sessionId,
      threadId,
      sessionUri: AgentSession.uri(this.id, sessionId),
      startTime: now,
      modifiedTime: now,
      summary: void 0,
      chatChannel: target?.resource,
      workingDirectory: effectiveWorkingDirectories?.[0] ?? workingDirectory,
      workingDirectories: effectiveWorkingDirectories,
      multiRootEnabled: multiRootEnabled ?? (effectiveWorkingDirectories?.length ?? 0) > 1,
      managedWorkingDirectory: void 0,
      mapState: createCodexSessionMapState(this._hostServerToolNames(), clientToolSet),
      pendingCommandApprovals: new PendingRequestRegistry(),
      acceptedForSession: /* @__PURE__ */ new Set(),
      handledGuardianReviews: /* @__PURE__ */ new Set(),
      pendingGuardianReviewCards: /* @__PURE__ */ new Set(),
      pendingSteeringFlips: /* @__PURE__ */ new Map(),
      clientToolSet,
      pendingClientToolCalls: new PendingRequestRegistry(),
      pendingUserInputs: new PendingRequestRegistry(),
      materializedToolsSig: void 0,
      materializedMcpSig: void 0,
      materializedCustomizationsSig: void 0,
      materializedPermissionsSig: void 0,
      materializedModelProvider,
      firstTurnSent: true,
      model,
      agent,
      customizationDirectory: void 0,
      currentTurnId: void 0,
      turnStopWatch: void 0,
      currentAppTurnId: void 0,
      hostTurnIdByAppTurnId: /* @__PURE__ */ new Map(),
      codexTurnIdByHostTurnId: /* @__PURE__ */ new Map(),
      needsResume: true,
      unsubscribeBeforeResume: false,
      resumePromise: void 0,
      lastPromptText: "",
      disposed: false,
      materializePromise: void 0,
      materializedEventFired: true,
      prewarmTimer: void 0,
      prewarmClaimed: true,
      serverToolsAdvertised: false,
      mcpController: void 0,
      clientCustomizations: new CodexClientCustomizationStore()
    };
  }
  /**
   * Fork the exact source chat's backing thread into a new backing for the
   * chat being created.
   *
   * `fork.source` resolves solely through the exact-chat binding this agent
   * recorded when the source chat was created or materialized — never
   * through a host-supplied session hint or chat-URI shape. An unbound
   * source therefore fails fast rather than guessing its owning session.
   *
   * We `thread/fork` the source thread — which copies its full history — then
   * `thread/rollback` the trailing turns so the fork retains only the turns up
   * to and including `fork.turnId`. The forked thread already exists on the
   * app-server, so the runtime is registered as resumable (its first send
   * issues a `thread/resume`).
   *
   * `adoptedSessionId`, when set, is the owning session's identity this
   * backing adopts (the session's runtime is stood up by this fork); otherwise
   * the runtime is keyed by the forked thread id, preserving the Codex
   * convention that a chat-owned session id equals its thread id.
   */
  async _forkChatBacking(fork, options, adoptedSessionId, target) {
    const sourceSessionUri = this._resolveConversationSession(fork.source);
    if (!sourceSessionUri) {
      throw new Error(`Cannot fork codex chat ${fork.source.toString()}: backing thread could not be resolved`);
    }
    const sourceRead = await this._readSession(sourceSessionUri);
    if (!sourceRead) {
      throw new Error(`Cannot fork codex chat ${fork.source.toString()}: source thread could not be read`);
    }
    const sourceThreadId = sourceRead.thread.id;
    const sourceTurns = sourceRead.thread.turns ?? [];
    const sourceSession = this._sessions.get(AgentSession.id(sourceSessionUri));
    const sourceOverlay = sourceSession ? void 0 : await this._metadataStore.read(sourceSessionUri);
    const sourceManagedWorkingDirectory = sourceSession?.managedWorkingDirectory ?? this._releasedManagedWorkingDirectories.get(AgentSession.id(sourceSessionUri)) ?? sourceOverlay?.managedWorkingDirectory;
    const sourcePrimary = sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : options?.workingDirectories?.[0];
    const sourceStoredWorkingDirectories = sourceSession?.workingDirectories ?? sourceRead.persistedWorkingDirectories;
    const inheritedWorkingDirectories = sourcePrimary ? distinctWorkingDirectories([sourcePrimary, ...sourceStoredWorkingDirectories?.slice(1) ?? []]) : void 0;
    const multiRootEnabled = sourceSession?.multiRootEnabled ?? (inheritedWorkingDirectories?.length ?? 0) > 1;
    const runtimeWorkspaceRoots = multiRootEnabled && inheritedWorkingDirectories && inheritedWorkingDirectories.length > 1 ? distinctAbsolutePaths(inheritedWorkingDirectories.map((directory) => directory.fsPath)) : void 0;
    const codexTurnId = sourceSession?.codexTurnIdByHostTurnId.get(fork.turnId) ?? fork.turnId;
    const fallbackTurnIndex = fork.turnIndex ?? -1;
    const boundary = resolveForkBoundary(sourceTurns.map((t) => t.id), codexTurnId, fallbackTurnIndex);
    if (!boundary.resolved) {
      throw new Error(`Cannot fork codex session ${sourceThreadId}: unable to resolve fork boundary for turn ${fork.turnId} (turnIndex=${fallbackTurnIndex}, turns=${sourceTurns.length})`);
    }
    const { keepThroughIndex, numTurnsToDrop } = boundary;
    const conn = await this._ensureConnection();
    const inheritedModel = sourceSession?.model ?? (sourceRead.persistedModelId ? { id: sourceRead.persistedModelId } : void 0) ?? this._models.get().find((candidate) => parseCodexModelSelection(candidate).modelProvider === sourceRead.thread.modelProvider);
    const model = this._resolveCreationModel(options?.model, inheritedModel);
    const resolvedModel = model ? this._routeCodexModel(model) : void 0;
    const sourceConfigValues = this._configurationService.getSessionConfigValues(sourceSessionUri.toString());
    const forkDefaults = this._permissionAxisDefaults();
    const { approvalPolicy, sandboxMode, approvalsReviewer } = resolveCodexPermissions(
      migrateCodexPermissionValues({ ...sourceConfigValues, ...options?.config }, forkDefaults),
      forkDefaults
    );
    const forkManagedWorkingDirectory = sourceManagedWorkingDirectory ? await this._createManagedWorkingDirectory(`fork-${generateUuid()}`) : void 0;
    if (forkManagedWorkingDirectory && sourceManagedWorkingDirectory) {
      try {
        await fs.promises.cp(sourceManagedWorkingDirectory.fsPath, forkManagedWorkingDirectory.fsPath, { recursive: true });
      } catch (err) {
        await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
        throw err;
      }
    }
    let forkResult;
    try {
      forkResult = await conn.client.request("thread/fork", {
        threadId: sourceThreadId,
        ...forkManagedWorkingDirectory ? {
          cwd: forkManagedWorkingDirectory.fsPath
        } : runtimeWorkspaceRoots?.length ? {
          cwd: runtimeWorkspaceRoots[0],
          runtimeWorkspaceRoots
        } : {},
        ...resolvedModel ? { model: resolvedModel.modelId, modelProvider: resolvedModel.modelProvider } : {},
        config: {
          [CODEX_APPLY_PATCH_STREAMING_FEATURE]: true,
          "features.image_generation": this._imageGenerationEnabledForModelProvider(resolvedModel?.modelProvider ?? sourceRead.thread.modelProvider)
        },
        approvalPolicy,
        sandbox: sandboxMode,
        approvalsReviewer
      });
    } catch (err) {
      if (forkManagedWorkingDirectory) {
        await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
      }
      throw err;
    }
    const newThreadId = forkResult.thread.id;
    if (numTurnsToDrop > 0) {
      try {
        await conn.client.request("thread/rollback", { threadId: newThreadId, numTurns: numTurnsToDrop });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this._logService.warn(`[Codex:${newThreadId}] fork rollback failed (numTurns=${numTurnsToDrop}); discarding fork: ${message}`);
        try {
          await conn.client.request("thread/archive", { threadId: newThreadId });
        } catch (archiveErr) {
          this._logService.warn(`[Codex:${newThreadId}] failed to archive orphaned fork after rollback failure: ${archiveErr instanceof Error ? archiveErr.message : String(archiveErr)}`);
        }
        if (forkManagedWorkingDirectory) {
          await this._removeManagedWorkingDirectory(forkManagedWorkingDirectory);
        }
        throw new Error(`Failed to fork codex session ${sourceThreadId}: could not roll back forked thread ${newThreadId} to the requested turn (${message})`);
      }
    }
    const sessionId = adoptedSessionId ?? newThreadId;
    const workingDirectory = forkManagedWorkingDirectory ?? (forkResult.cwd ? URI.file(forkResult.cwd) : sourceRead.thread.cwd ? URI.file(sourceRead.thread.cwd) : options?.workingDirectories?.[0]);
    const forkWorkingDirectories = multiRootEnabled ? distinctWorkingDirectories(
      forkResult.runtimeWorkspaceRoots?.length ? forkResult.runtimeWorkspaceRoots.map((path) => URI.file(path)) : inheritedWorkingDirectories
    ) : void 0;
    const session = this._createResumedSessionEntry(
      sessionId,
      newThreadId,
      workingDirectory,
      model,
      target,
      forkWorkingDirectories,
      multiRootEnabled,
      options?.agent ?? sourceSession?.agent,
      forkResult.thread.modelProvider ?? resolvedModel?.modelProvider ?? sourceRead.thread.modelProvider
    );
    session.managedWorkingDirectory = forkManagedWorkingDirectory;
    this._sessions.set(sessionId, session);
    this._sessionIdByThreadId.set(newThreadId, sessionId);
    this._sessionIdByChatUri.set(target.resource.toString(), sessionId);
    this._persistMaterializedSession(session);
    if (fork.turnIdMapping && fork.turnIdMapping.size > 0) {
      try {
        const forkedRead = await this._readSession(session.sessionUri);
        const forkedTurns = forkedRead?.thread.turns ?? [];
        const entries = planForkedTurnIdMap(
          sourceTurns.map((t) => t.id),
          forkedTurns.map((t) => t.id),
          keepThroughIndex,
          sourceSession?.hostTurnIdByAppTurnId,
          fork.turnIdMapping
        );
        for (const [hostTurnId, forkedCodexTurnId] of entries) {
          session.codexTurnIdByHostTurnId.set(hostTurnId, forkedCodexTurnId);
        }
      } catch (err) {
        this._logService.warn(`[Codex:${newThreadId}] failed to seed forked turn-id map: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._logService.info(`[Codex] forked chat ${target.resource.toString()} from ${fork.source.toString()}: thread ${sourceThreadId} \u2192 ${newThreadId} (kept ${sourceTurns.length - numTurnsToDrop}/${sourceTurns.length} turns)`);
    return session;
  }
  /**
   * Lazily start (or resume) a codex thread for `session`. Idempotent:
   * if `threadId` is already populated, just returns. Called from
   * `sendMessage` before the first `turn/start`.
   */
  async _materializeIfNeeded(session, configResource = session.sessionUri, fireMaterializedEvent = true) {
    if (session.disposed || !session.chatChannel) {
      return;
    }
    if (session.threadId !== void 0) {
      if (fireMaterializedEvent) {
        this._fireMaterialized(session);
      }
      return;
    }
    if (session.materializePromise) {
      await session.materializePromise;
      if (fireMaterializedEvent) {
        this._fireMaterialized(session);
      }
      return;
    }
    session.materializePromise = this._materialize(session, configResource).finally(() => {
      session.materializePromise = void 0;
    });
    await session.materializePromise;
    if (fireMaterializedEvent) {
      this._fireMaterialized(session);
    }
  }
  _traceContext(session) {
    return this._otelService.getSessionTraceContext(session.sessionId, session.sessionUri.toString());
  }
  async _createManagedWorkingDirectory(ownerId) {
    const directory = URI.file(join(os.tmpdir(), "vscode-agent-codex", ownerId));
    await fs.promises.mkdir(directory.fsPath, { recursive: true });
    return directory;
  }
  async _removeManagedWorkingDirectory(directory) {
    try {
      await fs.promises.rm(directory.fsPath, { recursive: true, force: true });
    } catch (err) {
      this._logService.info(`[Codex] failed to remove managed temp folder ${directory.fsPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  /**
   * Abandon this session's own managed temp folder ahead of adopting a
   * different (host- or user-supplied) working directory. Clears the
   * in-memory field, removes the folder from disk via its known explicit
   * path, and persists the clear so a later reclaim — this process or a
   * future one restored from the same overlay — never has to infer a
   * managed path from `cwd` again. Must run before `session.workingDirectory`
   * is overwritten, so the folder being abandoned is never confused with the
   * folder being adopted.
   */
  async _abandonManagedWorkingDirectory(session) {
    const directory = session.managedWorkingDirectory;
    if (!directory) {
      return;
    }
    session.managedWorkingDirectory = void 0;
    await this._removeManagedWorkingDirectory(directory);
    await this._metadataStore.write(session.sessionUri, { managedWorkingDirectory: null, ownsManagedWorkingDirectory: false });
  }
  async _materialize(session, configResource) {
    if (session.disposed || !session.chatChannel) {
      return;
    }
    await this._customizationEnablementService?.initializeSession(session.sessionUri.toString());
    if (!session.workingDirectory) {
      session.workingDirectory = await this._createManagedWorkingDirectory(session.sessionId);
      session.managedWorkingDirectory = session.workingDirectory;
      this._logService.info(`[Codex] no working directory supplied for session=${session.sessionUri.toString()}; using managed temp folder ${session.workingDirectory.fsPath}`);
    }
    const conn = await this._ensureConnection();
    const config = this._readSessionConfig(configResource);
    const model = await this._resolveModel(session);
    const { approvalPolicy, sandboxMode, approvalsReviewer } = this._resolveSessionPermissions(configResource);
    const mcpServers = this._buildSessionMcpServers(session);
    const customizationLaunch = await this._buildCustomizationLaunch(session);
    const resolvedModel = this._routeCodexModel(model);
    const threadConfig = {
      web_search: narrowWebSearchMode(config[CodexSessionConfigKey.WebSearchMode]) ?? codexSessionConfigDefaults[CodexSessionConfigKey.WebSearchMode],
      ...customizationLaunch.config,
      [CODEX_APPLY_PATCH_STREAMING_FEATURE]: true,
      "features.image_generation": this._imageGenerationEnabledForModelProvider(resolvedModel.modelProvider)
    };
    const mcpServerNames = Object.keys(mcpServers);
    if (mcpServerNames.length > 0) {
      threadConfig.mcp_servers = mcpServers;
      this._logService.info(`[Codex] thread/start for session=${session.sessionUri.toString()} with ${mcpServerNames.length} MCP server(s): ${mcpServerNames.join(", ")}`);
    }
    const multiRootActive = this._isMultiRootActive(session);
    const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : void 0;
    const selectedCapabilityRoots = [
      ...multiRootActive ? await this._selectedCapabilityRoots(session) : [],
      ...customizationLaunch.selectedCapabilityRoots
    ];
    const startResult = await conn.client.request("thread/start", {
      cwd: session.workingDirectory.fsPath,
      ...runtimeWorkspaceRoots?.length ? { runtimeWorkspaceRoots } : {},
      ...selectedCapabilityRoots.length ? { selectedCapabilityRoots } : {},
      model: resolvedModel.modelId,
      modelProvider: resolvedModel.modelProvider,
      approvalPolicy,
      sandbox: sandboxMode,
      approvalsReviewer,
      config: threadConfig,
      developerInstructions: customizationLaunch.developerInstructions,
      dynamicTools: this._buildDynamicTools(session)
    }, this._traceContext(session));
    const threadId = startResult.thread.id;
    if (multiRootActive && !session.workingDirectories && startResult.runtimeWorkspaceRoots?.length) {
      session.workingDirectories = startResult.runtimeWorkspaceRoots.map((path) => URI.file(path));
      session.workingDirectory = session.workingDirectories[0];
    }
    if (session.disposed) {
      try {
        await conn.client.request("thread/unsubscribe", { threadId });
      } catch (err) {
        this._logService.info(`[Codex:${threadId}] thread/unsubscribe after disposed prewarm failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    session.threadId = threadId;
    session.materializedMcpSig = mcpServersSignature(mcpServers);
    session.materializedCustomizationsSig = customizationLaunch.signature;
    session.materializedPermissionsSig = this._permissionsSignature(configResource);
    session.materializedToolsSig = toolsSignature(session.clientToolSet.merged());
    session.materializedModelProvider = resolvedModel.modelProvider;
    this._logService.info(`[Codex] materialized session=${session.sessionUri.toString()} threadId=${session.threadId} sandbox=${sandboxMode} approval=${approvalPolicy} reviewer=${approvalsReviewer}`);
    this._sessionIdByThreadId.set(session.threadId, session.sessionId);
    if (!session.serverToolsAdvertised && this._serverToolHost) {
      session.serverToolsAdvertised = true;
      this._serverToolHost.advertise(configResource.toString());
    }
    void this._refreshSkillHookCustomizations(session);
    void this._refreshSkillExtraRoots();
  }
  /**
   * Tear down the current codex thread and start a fresh one so the
   * session's current client tools are registered as `dynamicTools`.
   * Only safe before any turn has committed history on the thread.
   */
  async _restartThreadWithCurrentTools(session, configResource = session.sessionUri) {
    const conn = this._connection;
    const oldThreadId = session.threadId;
    this._logService.info(`[Codex:${session.sessionId}] restarting thread ${oldThreadId} to apply client tools [${session.clientToolSet.merged().map((t) => t.name).join(", ") || "(none)"}]`);
    if (conn.kind === "ready" && oldThreadId !== void 0) {
      this._sessionIdByThreadId.delete(oldThreadId);
      try {
        await conn.client.request("thread/unsubscribe", { threadId: oldThreadId });
      } catch (err) {
        this._logService.info(`[Codex:${oldThreadId}] thread/unsubscribe during tool restart failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    session.threadId = void 0;
    session.materializePromise = void 0;
    await this._materializeIfNeeded(session, configResource, true);
  }
  _fireMaterialized(session) {
    if (session.disposed || !session.chatChannel) {
      return;
    }
    if (session.materializedEventFired) {
      return;
    }
    session.materializedEventFired = true;
    const chat = session.chatChannel;
    this._onDidMaterializeChat.fire({
      chat,
      project: void 0,
      workingDirectories: session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : void 0),
      // providerData records the runtime's own durable id, not the
      // app-server thread id — see {@link ICodexPersistedChat}. The
      // thread id is still reported as `backingSession`.
      ...session.threadId ? {
        result: {
          providerData: encodeCodexChat({
            sessionId: session.sessionId,
            ...session.model ? { model: session.model } : {},
            ...session.managedWorkingDirectory ? { ownsManagedWorkingDirectory: true } : {}
          }),
          backingSession: AgentSession.uri(this.id, session.threadId)
        }
      } : {}
    });
  }
  _schedulePrewarm(session) {
    if (!session.workingDirectory) {
      return;
    }
    if (this._configurationService.isWorkingDirectoryPending(session.sessionUri.toString())) {
      return;
    }
    void (async () => {
      if (!await this._isSdkResolvableWithoutDownload()) {
        this._logService.info(`[Codex] SDK not downloaded yet; skipping prewarm for session=${session.sessionUri.toString()} until a message triggers the download`);
        return;
      }
      await this._materializeIfNeeded(session, session.sessionUri, false);
      if (session.prewarmClaimed || session.threadId === void 0) {
        return;
      }
      this._logService.info(`[Codex] prewarm ready session=${session.sessionUri.toString()} threadId=${session.threadId}`);
      const prewarmTimer = setTimeout(() => {
        void this._expirePrewarm(session);
      }, CodexPrewarmTtlMs);
      session.prewarmTimer = prewarmTimer;
    })().catch((err) => {
      this._logService.warn(`[Codex] prewarm failed session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  async _expirePrewarm(session) {
    if (session.disposed || session.prewarmClaimed || session.threadId === void 0) {
      return;
    }
    const threadId = session.threadId;
    session.threadId = void 0;
    this._sessionIdByThreadId.delete(threadId);
    try {
      const conn = await this._ensureConnection();
      await conn.client.request("thread/unsubscribe", { threadId });
      this._logService.info(`[Codex] prewarm TTL eviction session=${session.sessionUri.toString()} threadId=${threadId}`);
    } catch (err) {
      this._logService.warn(`[Codex] prewarm TTL eviction failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _persistMaterializedSession(session) {
    if (session.disposed || !session.threadId) {
      return;
    }
    const multiRootActive = this._isMultiRootActive(session);
    const fields = {
      threadId: session.threadId,
      cwd: session.workingDirectory,
      modelId: session.model?.id,
      agent: session.agent,
      workingDirectories: multiRootActive ? session.workingDirectories : void 0,
      ownsManagedWorkingDirectory: session.managedWorkingDirectory !== void 0,
      managedWorkingDirectory: session.managedWorkingDirectory ?? null
    };
    void this._metadataStore.write(session.sessionUri, fields);
    if (multiRootActive) {
      const canonicalSessionUri = AgentSession.uri(this.id, session.threadId);
      if (!isEqual(session.sessionUri, canonicalSessionUri)) {
        void this._metadataStore.write(canonicalSessionUri, fields);
      }
    }
  }
  async _persistSessionModel(session) {
    if (session.disposed || !session.model) {
      return;
    }
    const fields = { modelId: session.model.id };
    await this._metadataStore.write(session.sessionUri, fields);
    if (this._isMultiRootActive(session)) {
      const canonicalSessionUri = AgentSession.uri(this.id, session.threadId ?? session.sessionId);
      if (canonicalSessionUri.toString() !== session.sessionUri.toString()) {
        await this._metadataStore.write(canonicalSessionUri, fields);
      }
    }
  }
  _claimPrewarm(session) {
    session.prewarmClaimed = true;
    if (session.prewarmTimer) {
      clearTimeout(session.prewarmTimer);
      session.prewarmTimer = void 0;
    }
  }
  async _adoptWorkingDirectoryBeforeSend(session, workingDirectory) {
    if (!workingDirectory || isEqual(session.workingDirectory, workingDirectory)) {
      return;
    }
    if (session.prewarmClaimed) {
      if (session.threadId === void 0 && !session.materializePromise) {
        await this._abandonManagedWorkingDirectory(session);
        session.workingDirectory = workingDirectory;
        if (this._isMultiRootActive(session)) {
          session.workingDirectories = distinctWorkingDirectories([
            workingDirectory,
            ...session.workingDirectories?.slice(1) ?? []
          ]);
        }
      }
      return;
    }
    this._claimPrewarm(session);
    const materializePromise = session.materializePromise;
    if (materializePromise) {
      try {
        await materializePromise;
      } catch (err) {
        this._logService.info(`[Codex] stale prewarm failed before working directory changed for session=${session.sessionUri.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const threadId = session.threadId;
    if (threadId !== void 0) {
      session.threadId = void 0;
      this._sessionIdByThreadId.delete(threadId);
      const conn = this._connection;
      if (conn.kind === "ready") {
        try {
          await conn.client.request("thread/unsubscribe", { threadId });
        } catch (err) {
          this._logService.warn(`[Codex] stale prewarm unsubscribe failed session=${session.sessionUri.toString()} threadId=${threadId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    await this._abandonManagedWorkingDirectory(session);
    session.workingDirectory = workingDirectory;
  }
  _startTurnStopWatch(session) {
    const stopWatch = StopWatch.create(false);
    session.turnStopWatch = stopWatch;
    return stopWatch;
  }
  _clearTurnStopWatch(session) {
    const elapsed = session.turnStopWatch?.elapsed();
    session.turnStopWatch = void 0;
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  async _sendMessage(chat, prompt, attachments, turnId, workingDirectories, context) {
    const operationContext = context ? resolveAgentChatContext(context, chat) : void 0;
    const sessionUri = this._resolveConversationSession(chat, context);
    if (!sessionUri) {
      throw new Error(`Codex conversation is not bound: ${chat.toString()}`);
    }
    this._logService.info(`[Codex DEBUG] sendMessage session=${sessionUri.toString()} prompt=${JSON.stringify(prompt).slice(0, 60)}`);
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Codex session not found: ${sessionUri.toString()} (chat=${chat.toString()}, binding=${this._sessionIdByChatUri.get(chat.toString()) ?? "none"}, sessions=${[...this._sessions.keys()].join(",") || "none"})`);
    }
    const configResource = operationContext?.configurationResource ?? sessionUri;
    this._ensureModelProviderAuthenticated(session.model);
    await this._adoptWorkingDirectoryBeforeSend(session, workingDirectories?.[0]);
    if (workingDirectories) {
      session.workingDirectories = session.multiRootEnabled && workingDirectories.length > 1 ? distinctWorkingDirectories([
        session.workingDirectory ?? workingDirectories[0],
        ...workingDirectories.slice(1)
      ]) : workingDirectories;
    }
    const conn = await this._ensureConnection();
    const effectiveTurnId = turnId ?? generateUuid();
    try {
      this._claimPrewarm(session);
      await this._materializeIfNeeded(session, configResource, true);
      this._persistMaterializedSession(session);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.error(`[Codex:${sessionId}] materialize failed: ${message}`);
      const duration = this._clearTurnStopWatch(session);
      this._fire(sessionUri, {
        type: ActionType.ChatError,
        turnId: effectiveTurnId,
        duration,
        error: { errorType: "CodexMaterializeFailed", message }
      });
      this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
      return;
    }
    if (!session.firstTurnSent && !session.needsResume) {
      const baselineWorkingDirectories = session.workingDirectories ?? (session.workingDirectory ? [session.workingDirectory] : void 0);
      this._checkpointService.captureBaselineCheckpoint(configResource, baselineWorkingDirectories).catch((err) => {
        this._logService.warn(`[Codex:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    const toolsChanged = toolsSignature(session.clientToolSet.merged()) !== session.materializedToolsSig;
    const mcpChanged = mcpServersSignature(this._buildSessionMcpServers(session)) !== session.materializedMcpSig;
    const customizationLaunch = await this._buildCustomizationLaunch(session);
    const customizationsChanged = customizationLaunch.signature !== session.materializedCustomizationsSig;
    const permissionsChanged = this._permissionsSignature(configResource) !== session.materializedPermissionsSig;
    if (!session.firstTurnSent && !session.needsResume && (toolsChanged || mcpChanged || customizationsChanged || permissionsChanged)) {
      try {
        await this._restartThreadWithCurrentTools(session, configResource);
        this._persistMaterializedSession(session);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this._logService.error(`[Codex:${sessionId}] tool re-materialize failed: ${message}`);
        const duration = this._clearTurnStopWatch(session);
        this._fire(sessionUri, {
          type: ActionType.ChatError,
          turnId: effectiveTurnId,
          duration,
          error: { errorType: "CodexMaterializeFailed", message }
        });
        this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
        return;
      }
    } else if (session.firstTurnSent && !session.needsResume && customizationsChanged) {
      this._markSessionForReload(session);
    }
    if (session.needsResume) {
      try {
        await this._resumeSession(session, conn);
      } catch (err) {
        const duration = this._clearTurnStopWatch(session);
        this._fire(sessionUri, {
          type: ActionType.ChatError,
          turnId: effectiveTurnId,
          duration,
          error: {
            errorType: "CodexResumeFailed",
            message: err instanceof Error ? err.message : String(err)
          }
        });
        this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
        return;
      }
    }
    const threadId = session.threadId;
    session.lastPromptText = prompt;
    session.currentTurnId = effectiveTurnId;
    session.modifiedTime = Date.now();
    this._startTurnStopWatch(session);
    let cleanupPaths = [];
    const isCompactCommand = parseLeadingSlashCommand(prompt)?.command === CODEX_COMPACT_SLASH_COMMAND;
    try {
      if (isCompactCommand) {
        await conn.client.request("thread/compact/start", { threadId }, this._traceContext(session));
        session.firstTurnSent = true;
        return;
      }
      const resolvedInput = resolveCodexInput(prompt, attachments);
      cleanupPaths = resolvedInput.cleanupPaths;
      const model = await this._resolveModel(session);
      const resolvedModel = this._routeCodexModel(model);
      const turnOptions = this._turnStartOptions(session, resolvedModel.modelId, customizationLaunch.developerInstructions, configResource);
      const hostInstructions = resolveAgentHostInstructions(operationContext);
      await conn.client.request("turn/start", {
        threadId,
        input: resolvedInput.input.slice(),
        model: resolvedModel.modelId,
        ...turnOptions,
        ...hostInstructions?.length ? {
          additionalContext: {
            "vscode.agentHost": { kind: "application", value: hostInstructions.join("\n\n") }
          }
        } : {}
      }, this._traceContext(session));
      session.firstTurnSent = true;
    } catch (err) {
      if (err instanceof CancellationError) {
        this._fire(sessionUri, { type: ActionType.ChatTurnCancelled, turnId: effectiveTurnId, duration: this._clearTurnStopWatch(session) });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      const operation = isCompactCommand ? "thread/compact/start" : "turn/start";
      this._logService.error(`[Codex:${sessionId}] ${operation} error: ${message}`);
      const duration = this._clearTurnStopWatch(session);
      this._fire(sessionUri, {
        type: ActionType.ChatError,
        turnId: effectiveTurnId,
        duration,
        error: { errorType: isCompactCommand ? "CodexCompactionError" : "CodexTurnError", ...extractForwardedErrorInfo(message) }
      });
      this._fire(sessionUri, { type: ActionType.ChatTurnComplete, turnId: effectiveTurnId, duration });
    } finally {
      if (cleanupPaths.length > 0) {
        setTimeout(() => {
          for (const p of cleanupPaths) {
            try {
              fs.unlinkSync(p);
            } catch {
            }
          }
        }, 3e4);
      }
    }
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    if (!steeringMessage) {
      return;
    }
    const sessionUri = this._resolveConversationSession(chat);
    if (!sessionUri) {
      return;
    }
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.pendingSteeringFlips.has(steeringMessage.id)) {
      return;
    }
    const appTurnId = session.currentAppTurnId;
    const conn = this._connection;
    const text = steeringMessage.message.text;
    const hasContent = text.length > 0 || (steeringMessage.message.attachments?.length ?? 0) > 0;
    if (!appTurnId || conn.kind !== "ready" || session.threadId === void 0 || !hasContent) {
      this._fireSteeringConsumed(session, steeringMessage.id);
      return;
    }
    const { input } = resolveCodexInput(text, steeringMessage.message.attachments);
    const threadId = session.threadId;
    session.pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
    void conn.client.request("turn/steer", {
      threadId,
      input: input.slice(),
      expectedTurnId: appTurnId
    }).catch((err) => {
      if (session.pendingSteeringFlips.delete(steeringMessage.id)) {
        this._fireSteeringConsumed(session, steeringMessage.id);
      }
      if (err instanceof JsonRpcError) {
        this._logService.info(`[Codex:${sessionId}] turn/steer skipped: ${err.message}`);
        return;
      }
      this._logService.warn(`[Codex:${sessionId}] turn/steer failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
  async _abort(chat, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const sessionUri = this._resolveConversationSession(chat, operationContext);
    if (!sessionUri) {
      return;
    }
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      return;
    }
    this._drainPendingSteering(session);
    if (!session.currentAppTurnId || session.threadId === void 0) {
      return;
    }
    const threadId = session.threadId;
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    try {
      await conn.client.request("turn/interrupt", {
        threadId,
        turnId: session.currentAppTurnId
      });
    } catch (err) {
      this._logService.warn(`[Codex:${sessionId}] turn/interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  /**
   * Drop the active-client handles addressed to exactly this chat. Called
   * on disposal so a departing chat never leaks its handles in
   * {@link _activeClientHandles} — there is no sibling inference, so a
   * sibling chat's handles are left untouched.
   */
  _removeActiveClientHandlesForChat(chat) {
    const prefix = `${chat.toString()}\0`;
    for (const [key, handle] of this._activeClientHandles) {
      if (key.startsWith(prefix)) {
        handle.remove();
        this._activeClientHandles.delete(key);
      }
    }
  }
  async _disposeChat(chat, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const runtimeSession = this._resolveConversationSession(chat, operationContext);
    this._removeActiveClientHandlesForChat(chat);
    await this._releaseConfigScopeIfDone(chat, operationContext);
    if (!runtimeSession) {
      return;
    }
    await this._disposeRuntimeSession(runtimeSession, true);
    this._sessionIdByChatUri.delete(chat.toString());
  }
  async _releaseChat(chat, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const runtimeSession = this._resolveConversationSession(chat, operationContext);
    if (!runtimeSession) {
      return;
    }
    await this._disposeRuntimeSession(runtimeSession, false);
  }
  /**
   * Tear down the runtime backing a chat, addressed by the runtime's own
   * session URI. `deleteManagedWorkingDirectory` distinguishes the
   * destructive {@link IAgentChats.disposeChat} path from the
   * non-destructive {@link IAgentChats.releaseChat} (idle-eviction) path.
   *
   * Only a release (`deleteManagedWorkingDirectory === false`) no-ops for
   * runtimes with nothing durable to resume from (provisional runtimes whose
   * codex thread was never started — evicting them from memory would lose
   * their only copy of state) and for runtimes with a turn in flight —
   * `thread/unsubscribe` mid-turn would drop live progress. A destructive
   * dispose has no durable state to preserve either way, so it always tears
   * a provisional runtime down; leaving one behind would leak its pending
   * registries, MCP controller, prewarm timer, and (once claimed) managed
   * working directory, and would let a still-running prewarm continuation
   * materialize a thread for a chat the host already considers gone.
   */
  async _disposeRuntimeSession(sessionUri, deleteManagedWorkingDirectory) {
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      if (deleteManagedWorkingDirectory) {
        await this._reclaimManagedWorkingDirectoryIfNotLive(sessionUri);
      }
      return;
    }
    if (!deleteManagedWorkingDirectory) {
      if (session.threadId === void 0 || session.currentTurnId !== void 0) {
        return;
      }
    }
    if (session.threadId !== void 0) {
      this._logService.info(`[Codex:${session.threadId}] Releasing idle session from memory (durable state preserved)`);
    } else {
      this._logService.info(`[Codex] Disposing provisional session ${session.sessionUri.toString()} (codex thread never started)`);
    }
    if (!deleteManagedWorkingDirectory && session.managedWorkingDirectory) {
      this._releasedManagedWorkingDirectories.set(sessionId, session.managedWorkingDirectory);
    }
    await this._teardownSessionInMemory(session, sessionId, deleteManagedWorkingDirectory);
  }
  /**
   * Shared in-memory teardown for a codex session: drops the tracked entry,
   * disposes its MCP controller, unparks pending approvals / client tool calls
   * / user inputs, and unsubscribes the codex thread (`thread/unsubscribe`).
   * The codex thread's on-disk rollout is always preserved (there is no
   * app-server delete), so a released session can still be resumed later —
   * but a destructive `deleteManagedWorkingDirectory` also releases this
   * runtime's retained OTel trace context (see {@link _traceContext}), since
   * that context is scoped to this exact runtime's lifetime, not to its
   * durable rollout. Idle eviction must not release it: a released runtime
   * is expected to be re-addressed later and should keep the same trace
   * parent when it is. Shared by the destructive chat-dispose path (which
   * the orchestrator pairs with durable deletion) and the non-destructive
   * chat-release (idle eviction) path.
   */
  async _teardownSessionInMemory(session, sessionId, deleteManagedWorkingDirectory) {
    session.disposed = true;
    this._claimPrewarm(session);
    this._sessions.delete(sessionId);
    session.mcpController?.dispose();
    if (!session.clientCustomizations.isEmpty()) {
      void this._refreshSkillExtraRoots();
    }
    if (deleteManagedWorkingDirectory && session.managedWorkingDirectory) {
      await this._removeManagedWorkingDirectory(session.managedWorkingDirectory);
    }
    if (deleteManagedWorkingDirectory) {
      this._releasedManagedWorkingDirectories.delete(sessionId);
      this._otelService.releaseSessionTraceContext(session.sessionUri.toString());
    }
    if (session.customizationDirectory) {
      const dir = session.customizationDirectory.fsPath;
      fs.promises.rm(dir, { recursive: true, force: true }).catch((err) => {
        this._logService.info(`[Codex] failed to remove customization folder ${dir}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    if (session.threadId !== void 0) {
      this._sessionIdByThreadId.delete(session.threadId);
      this._fileEditObservers.deleteAndDispose(session.threadId);
    }
    session.pendingCommandApprovals.denyAll("decline");
    session.pendingClientToolCalls.rejectAll(new CancellationError());
    session.pendingUserInputs.rejectAll(new CancellationError());
    this._drainPendingSteering(session);
    for (const [childThreadId, subagent] of this._subagentsByThreadId) {
      if (subagent.parentSessionId === sessionId) {
        subagent.session.pendingCommandApprovals.denyAll("decline");
        this._subagentsByThreadId.delete(childThreadId);
        this._fileEditObservers.deleteAndDispose(childThreadId);
      }
    }
    const conn = this._connection;
    if (conn.kind === "ready" && session.threadId !== void 0) {
      const threadId = session.threadId;
      try {
        await conn.client.request("thread/unsubscribe", { threadId });
      } catch (err) {
        this._logService.info(`[Codex:${threadId}] thread/unsubscribe failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  async _changeModel(chat, model, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const sessionUri = this._resolveConversationSession(chat, operationContext);
    if (!sessionUri) {
      return;
    }
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (session) {
      const supported = this._supportedModelOrUndefined(model);
      if (!supported) {
        throw new Error(`Codex model '${model.id}' is not available.`);
      }
      const previousProvider = session.materializedModelProvider ?? (session.model ? parseCodexModelSelection(session.model).modelProvider : void 0);
      const nextProvider = this._routeCodexModel(supported).modelProvider;
      this._ensureModelProviderAuthenticated(supported);
      session.model = supported;
      if (previousProvider !== void 0 && previousProvider !== nextProvider) {
        this._resetSessionForModelProviderChange(session, nextProvider);
      }
      await this._persistSessionModel(session);
      this._persistMaterializedSession(session);
    }
  }
  /**
   * Truncate the chat Agent Host addresses, not the session it belongs to.
   *
   * Codex backs every chat with its own thread, so the rollback target is the
   * runtime bound to `chat` — resolved through the recorded binding or the
   * host-supplied context, never by re-deriving membership from a URI. When
   * `chat` is omitted (a session-addressed caller) the session's own runtime
   * is the target, which is also what an unresolvable chat falls back to via
   * the host context's owning session.
   *
   * Codex rolls back by a count of trailing turns. Resolve how many turns
   * follow `turnId` (or all of them when omitted) from the persisted thread,
   * whose turn ids match the workbench's restored turn ids (see
   * {@link replayThreadToTurns}). Unknown ids no-op to avoid data loss.
   */
  async truncateChat(chat, turnId, context) {
    const targetUri = this._resolveConversationSession(chat, context);
    if (!targetUri) {
      return;
    }
    const read = await this._readSession(targetUri);
    if (!read) {
      return;
    }
    const turns = read.thread.turns ?? [];
    if (turns.length === 0) {
      return;
    }
    let numTurns;
    if (turnId === void 0) {
      numTurns = turns.length;
    } else {
      const session = this._sessions.get(AgentSession.id(targetUri));
      const codexTurnId = session?.codexTurnIdByHostTurnId.get(turnId) ?? turnId;
      const index = turns.findIndex((t) => t.id === codexTurnId);
      if (index === -1) {
        this._logService.warn(`[Codex] truncateChat: turnId ${turnId} not found in thread ${read.thread.id}; skipping`);
        return;
      }
      numTurns = turns.length - (index + 1);
    }
    if (numTurns <= 0) {
      return;
    }
    try {
      const conn = await this._ensureConnection();
      await conn.client.request("thread/rollback", { threadId: read.thread.id, numTurns });
    } catch (err) {
      this._logService.warn(`[Codex:${read.thread.id}] thread/rollback failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async onArchivedChanged(sessionUri, isArchived) {
    const threadId = await this._resolveThreadId(sessionUri);
    if (threadId === void 0) {
      return;
    }
    const conn = this._connection;
    if (conn.kind !== "ready") {
      return;
    }
    try {
      if (isArchived) {
        await conn.client.request("thread/archive", { threadId });
      } else {
        await conn.client.request("thread/unarchive", { threadId });
      }
    } catch (err) {
      this._logService.warn(`[Codex:${threadId}] thread/${isArchived ? "archive" : "unarchive"} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  /** Resolve the codex thread id for a session: in-memory → persisted overlay. */
  async _resolveThreadId(sessionUri) {
    const existing = this._sessions.get(AgentSession.id(sessionUri));
    if (existing?.threadId !== void 0) {
      return existing.threadId;
    }
    const overlay = await this._metadataStore.read(sessionUri);
    return overlay.threadId;
  }
  respondToPermissionRequest(requestId, approved) {
    const sessions = [
      ...this._sessions.values(),
      ...[...this._subagentsByThreadId.values()].map((s) => s.session)
    ];
    for (const session of sessions) {
      if (session.pendingCommandApprovals.respond(requestId, approved ? "accept" : "decline")) {
        if (!approved) {
          session.mapState.declinedToolCalls.add(requestId);
        }
        return;
      }
    }
    this._logService.info(`[Codex] respondToPermissionRequest: unknown requestId=${requestId}`);
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const session of this._sessions.values()) {
      if (session.pendingUserInputs.respond(requestId, { response, answers })) {
        return;
      }
    }
    this._logService.info(`[Codex] respondToUserInputRequest: unknown requestId=${requestId}`);
  }
  /**
   * Reconstruct the turns of an addressed chat from its backing thread's
   * persisted rollout. Chat-addressed only: the owning session comes from the
   * recorded binding or the host-supplied context, never from the URI.
   */
  async _getChatMessages(chat, context) {
    const operationContext = resolveAgentChatContext(context, chat);
    const sessionUri = this._resolveConversationSession(chat, operationContext);
    if (!sessionUri) {
      return [];
    }
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (session?.needsResume) {
      await this._resumeSession(session);
    }
    const read = await this._readSession(sessionUri);
    return read ? replayThreadToTurns(read.thread, toRolloutTurnModels(read.rolloutMetadata), read.rolloutMetadata?.threadCoordinationByTurnId) : [];
  }
  async _resumeSession(session, connection) {
    if (!session.needsResume) {
      await session.resumePromise;
      return;
    }
    if (!session.resumePromise) {
      session.resumePromise = (async () => {
        const threadId = session.threadId;
        if (!threadId) {
          throw new Error(`Cannot resume Codex session ${session.sessionId}: no backing thread`);
        }
        const conn = connection ?? await this._ensureConnection();
        if (session.unsubscribeBeforeResume) {
          await conn.client.request("thread/unsubscribe", { threadId });
        }
        const mcpServers = this._buildSessionMcpServers(session);
        const customizationLaunch = await this._buildCustomizationLaunch(session);
        const multiRootActive = this._isMultiRootActive(session);
        const runtimeWorkspaceRoots = multiRootActive ? this._runtimeWorkspaceRoots(session) : void 0;
        const resolvedModel = this._routeCodexModel(await this._resolveModel(session));
        const resumeResult = await conn.client.request(
          "thread/resume",
          buildCodexResumeParams(
            resolvedModel.modelProvider,
            threadId,
            mcpServers,
            runtimeWorkspaceRoots,
            customizationLaunch.config,
            customizationLaunch.developerInstructions,
            this._imageGenerationEnabledForModelProvider(resolvedModel.modelProvider)
          ),
          this._traceContext(session)
        );
        if (multiRootActive && !session.workingDirectories && resumeResult.runtimeWorkspaceRoots?.length) {
          session.workingDirectories = resumeResult.runtimeWorkspaceRoots.map((path) => URI.file(path));
          session.workingDirectory = session.workingDirectories[0];
        }
        session.materializedMcpSig = mcpServersSignature(mcpServers);
        session.materializedCustomizationsSig = customizationLaunch.signature;
        session.materializedPermissionsSig = this._permissionsSignature(session.sessionUri);
        session.needsResume = false;
        session.unsubscribeBeforeResume = false;
      })().finally(() => {
        session.resumePromise = void 0;
      });
    }
    await session.resumePromise;
  }
  _markSessionForReload(session) {
    session.unsubscribeBeforeResume = true;
    session.needsResume = true;
  }
  /**
   * Describe a host-addressed chat. `providerData` is the opaque backing
   * this agent minted for the chat, so it — not the addressed chat URI —
   * names the runtime to restore (they coincide for a session-backing
   * runtime and differ for anything re-keyed onto another conversation).
   *
   * The registered entry is deliberately keyed and addressed by that backing
   * id: `_createResumedSessionEntry` derives its `sessionUri`, so this can
   * never mint an entry whose key and URI disagree. The *addressed* chat
   * URI stays host-facing only — it labels the returned metadata, while the
   * context's `configurationResource` names the session the host's server
   * tools are advertised on.
   */
  async getChatMetadata(chat, context, providerData) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    const backing = providerData ? decodeCodexChat(providerData) : void 0;
    const sessionId = backing?.sessionId ?? AgentSession.id(session);
    const live = this._sessions.get(sessionId);
    if (live?.threadId) {
      return {
        chat,
        startTime: live.startTime,
        modifiedTime: live.modifiedTime,
        summary: live.summary,
        workingDirectories: live.workingDirectories ?? (live.workingDirectory ? [live.workingDirectory] : void 0)
      };
    }
    const backingUri = backing ? AgentSession.uri(this.id, backing.sessionId) : session;
    const read = await this._readSession(backingUri);
    if (!read) {
      return void 0;
    }
    const metadata = this._withWorkingDirectories(
      await this._threadToMetadata(read.thread, chat, read.rolloutMetadata),
      read.persistedWorkingDirectories
    );
    if (!this._sessions.has(sessionId)) {
      const workingDirectory = read.thread.cwd ? URI.file(read.thread.cwd) : void 0;
      const threadId = read.thread.id;
      const overlay = await this._metadataStore.read(backingUri);
      const restoredModel = metadata.model ?? (read.persistedModelId ? { id: read.persistedModelId } : void 0);
      const materializedModelProvider = read.rolloutMetadata?.selectedModel?.modelProvider ?? read.rolloutMetadata?.originModelProvider ?? read.thread.modelProvider;
      const restored = this._createResumedSessionEntry(sessionId, threadId, workingDirectory, restoredModel, void 0, metadata.workingDirectories, void 0, overlay.agent, materializedModelProvider);
      restored.startTime = metadata.startTime || restored.startTime;
      restored.modifiedTime = metadata.modifiedTime || restored.modifiedTime;
      restored.summary = metadata.summary;
      if (overlay.managedWorkingDirectory && workingDirectory && isEqual(overlay.managedWorkingDirectory, workingDirectory)) {
        restored.managedWorkingDirectory = workingDirectory;
      }
      this._sessions.set(sessionId, restored);
      this._sessionIdByThreadId.set(threadId, sessionId);
      if (restoredModel && parseCodexModelSelection(restoredModel).modelProvider !== materializedModelProvider) {
        this._resetSessionForModelProviderChange(restored, parseCodexModelSelection(restoredModel).modelProvider);
      }
      if (!restored.serverToolsAdvertised && this._serverToolHost) {
        restored.serverToolsAdvertised = true;
        this._serverToolHost.advertise(session.toString());
      }
    }
    return metadata;
  }
  _readSession(session) {
    return this._sessions.has(AgentSession.id(session)) ? this._doReadSession(session) : this._coldSessionReadLimiter.queue(() => this._doReadSession(session));
  }
  async _doReadSession(session) {
    const sessionId = AgentSession.id(session);
    const existing = this._sessions.get(sessionId);
    let threadId = existing?.threadId;
    let persistedWorkingDirectories = existing?.workingDirectories;
    let persistedModelId = existing?.model?.id;
    if (threadId === void 0) {
      const overlay = await this._metadataStore.read(session);
      threadId = overlay.threadId ?? sessionId;
      persistedWorkingDirectories = overlay.workingDirectories;
      persistedModelId = overlay.modelId;
    }
    const conn = await this._ensureConnection();
    const readThread = async (candidateThreadId) => {
      const response = await conn.client.request("thread/read", {
        threadId: candidateThreadId,
        includeTurns: true
      });
      const rolloutMetadata = await this._readCodexRolloutMetadata(response.thread);
      return { ...response, persistedWorkingDirectories, persistedModelId, rolloutMetadata };
    };
    try {
      if (!existing && threadId !== sessionId) {
        try {
          const original = await readThread(sessionId);
          if (original.rolloutMetadata?.isDesktop) {
            const originalModel = toRolloutModelSelection(original.rolloutMetadata.selectedModel);
            await this._metadataStore.write(session, {
              threadId: original.thread.id,
              cwd: original.thread.cwd ? URI.file(original.thread.cwd) : void 0,
              modelId: originalModel?.id
            });
            return {
              ...original,
              persistedWorkingDirectories: void 0,
              persistedModelId: originalModel?.id
            };
          }
        } catch {
        }
      }
      const read = await readThread(threadId);
      if (read.rolloutMetadata?.isDesktop) {
        const originalModel = toRolloutModelSelection(read.rolloutMetadata.selectedModel);
        await this._metadataStore.write(session, {
          threadId: read.thread.id,
          cwd: read.thread.cwd ? URI.file(read.thread.cwd) : void 0,
          modelId: originalModel?.id
        });
        return {
          ...read,
          persistedWorkingDirectories: void 0,
          persistedModelId: originalModel?.id
        };
      }
      return read;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/thread not loaded/i.test(message)) {
        this._logService.info(`[Codex:${threadId}] thread/read: not loaded yet (will resume on first send)`);
      } else {
        this._logService.warn(`[Codex:${threadId}] thread/read failed: ${message}`);
      }
      return void 0;
    }
  }
  async _listCodexChats() {
    try {
      const conn = await this._ensureConnection();
      const threads = await collectThreadListPages(
        (request) => conn.client.request("thread/list", request),
        (collected) => this._logService.warn(`[Codex] thread/list hit the ${THREAD_LIST_MAX_PAGES}-page cap after ${collected} threads; some sessions may be missing`)
      );
      const liveUriByThreadId = /* @__PURE__ */ new Map();
      for (const s of this._sessions.values()) {
        if (s.threadId !== void 0) {
          liveUriByThreadId.set(s.threadId, s.sessionUri);
        }
      }
      return Promise.all(threads.map(async (thread) => {
        const sessionUri = liveUriByThreadId.get(thread.id) ?? AgentSession.uri(this.id, thread.id);
        const liveWorkingDirectories = this._sessions.get(AgentSession.id(sessionUri))?.workingDirectories;
        const isDesktop = thread.modelProvider === CODEX_OPENAI_MODEL_PROVIDER ? await this._desktopRolloutPrefixLimiter.queue(() => this._readCodexDesktopRolloutPrefix(thread)) !== null : this._desktopThreadIds.has(thread.id);
        const chat = URI.parse(buildDefaultChatUri(sessionUri));
        return this._withWorkingDirectories(await this._threadToMetadata(thread, chat, void 0, isDesktop), liveWorkingDirectories);
      }));
    } catch (err) {
      this._logService.warn(`[Codex] thread/list failed: ${err instanceof Error ? err.message : String(err)}`);
      return void 0;
    }
  }
  async listChatsToMigrate() {
    try {
      await this._resolveSdkRoot();
    } catch (err) {
      this._logService.warn(`[Codex] SDK unavailable while listing chats to migrate: ${err instanceof Error ? err.message : String(err)}`);
      return void 0;
    }
    const chats = await this._listCodexChats();
    if (!chats) {
      return void 0;
    }
    const limiter = new Limiter(4);
    const known = await Promise.all(chats.map((chat) => limiter.queue(async () => {
      return await this._isKnownCodexChat(chat) ? chat : void 0;
    })));
    return known.filter((chat) => chat !== void 0);
  }
  _startCodexChatDiscovery() {
    if (!this._codexChatDiscovery) {
      this._codexChatDiscovery = retry(async () => {
        await this._resolveSdkRoot();
        if (!await this._emitCodexChats()) {
          throw new Error("Codex chat catalog is not available");
        }
      }, 5e3, 3).catch((err) => this._logService.warn(`[Codex] Chat discovery failed: ${err instanceof Error ? err.message : String(err)}`));
    }
    return this._codexChatDiscovery;
  }
  async _emitCodexChats() {
    try {
      const chats = await this._listCodexChats();
      if (chats) {
        const limiter = new Limiter(4);
        const unknown = await Promise.all(chats.map((chat) => limiter.queue(async () => {
          return await this._isKnownCodexChat(chat) ? void 0 : { ...chat, external: true };
        })));
        const discovered = unknown.filter((chat) => chat !== void 0);
        this._onDidDiscoverChats.fire(discovered);
        return true;
      }
    } catch (err) {
      this._logService.warn(`[Codex] Failed to emit discovered chats: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }
  async _isKnownCodexChat(chat) {
    try {
      const session = URI.parse(parseRequiredSessionUriFromChatUri(chat.chat));
      return await this._metadataStore.hasKnownSession(session);
    } catch (err) {
      this._logService.warn(`[Codex] Failed to inspect stored metadata for ${chat.chat.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
  async _threadToMetadata(thread, chat, rolloutMetadata, isDesktopHint) {
    const generatedWorkspace = isCodexDesktopGeneratedWorkspace(thread.cwd, this._environmentService.userHome);
    let isDesktop = rolloutMetadata?.isDesktop ?? isDesktopHint;
    if (generatedWorkspace && isDesktop === void 0) {
      isDesktop = await this._desktopRolloutPrefixLimiter.queue(() => this._readCodexDesktopRolloutPrefix(thread)) !== null;
    }
    const model = toRolloutModelSelection(rolloutMetadata?.selectedModel);
    return {
      chat,
      // Codex returns Unix seconds; the agent host expects ms.
      startTime: (thread.createdAt ?? 0) * 1e3,
      modifiedTime: (thread.updatedAt ?? thread.createdAt ?? 0) * 1e3,
      summary: codexDelegationDisplayText(thread.name) ?? codexDelegationDisplayText(thread.preview),
      workingDirectories: thread.cwd ? [URI.file(thread.cwd)] : void 0,
      ...model ? { model } : {},
      ...generatedWorkspace && isDesktop ? { _meta: withSessionWorkspaceless(void 0, true) } : {}
    };
  }
  async _readCodexRolloutMetadata(thread) {
    if (thread.source !== "vscode" || !thread.path) {
      return void 0;
    }
    try {
      const metadata = await readCodexRolloutMetadata(this._fileService, thread.path);
      if (metadata.isDesktop) {
        this._desktopThreadIds.add(thread.id);
      }
      return metadata;
    } catch (error) {
      this._logService.warn(`[Codex] Failed to read desktop rollout metadata for ${thread.id}: result=${toFileOperationResult(error)}`);
      return void 0;
    }
  }
  async _readCodexDesktopRolloutPrefix(thread) {
    if (thread.source !== "vscode" || !thread.path) {
      return null;
    }
    try {
      const prefix = await this._fileService.readFile(URI.file(thread.path), { length: CODEX_DESKTOP_ROLLOUT_PREFIX_LENGTH });
      const value = prefix.value.toString();
      if (!CODEX_DESKTOP_SESSION_META_PATTERN.test(value)) {
        return null;
      }
      this._desktopThreadIds.add(thread.id);
      return value;
    } catch (error) {
      this._logService.warn(`[Codex] Failed to inspect desktop session metadata for ${thread.id}: result=${toFileOperationResult(error)}`);
      return null;
    }
  }
  _withWorkingDirectories(metadata, storedWorkingDirectories) {
    const primary = metadata.workingDirectories?.[0];
    if (!primary || !storedWorkingDirectories || storedWorkingDirectories.length <= 1) {
      return metadata;
    }
    const workingDirectories = distinctWorkingDirectories([
      primary,
      ...storedWorkingDirectories.slice(1)
    ]);
    return workingDirectories && workingDirectories.length > 1 ? { ...metadata, workingDirectories } : metadata;
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  /**
   * `chat` is the one exact chat this handle contributes to — no fan-out to
   * chat-array membership or sibling inference; Agent Host calls this once
   * per addressed chat. `context` only resolves the chat's backing runtime
   * when it has no live binding yet, mirroring
   * {@link _resolveConversationSession}. `hostCustomizations` is unused:
   * Codex reconciles pushed plugin customizations via
   * {@link _syncClientCustomizations}.
   */
  getOrCreateActiveClient(chat, context, client, _hostCustomizations) {
    const key = `${chat.toString()}\0${client.clientId}`;
    const existing = this._activeClientHandles.get(key);
    if (existing) {
      return existing;
    }
    const resolveSession = () => {
      const runtimeUri = this._resolveConversationSession(chat, context);
      return runtimeUri ? this._sessions.get(AgentSession.id(runtimeUri)) : void 0;
    };
    const handle = new CodexActiveClientHandle(
      resolveSession,
      client.clientId,
      client.displayName,
      (tools) => this._logService.info(`[Codex] active client ${client.clientId} tools=[${tools.map((t) => t.name).join(", ") || "(none)"}] chat=${chat.toString()}`),
      (session, customizations) => {
        void this._syncClientCustomizations(session.sessionUri, client.clientId, [...customizations], { quiet: false });
      }
    );
    this._activeClientHandles.set(key, handle);
    return handle;
  }
  removeActiveClient(chat, context, clientId) {
    const key = `${chat.toString()}\0${clientId}`;
    const handle = this._activeClientHandles.get(key);
    this._activeClientHandles.delete(key);
    if (!handle) {
      return;
    }
    handle.remove();
    const runtimeUri = this._resolveConversationSession(chat, context);
    const sess = runtimeUri ? this._sessions.get(AgentSession.id(runtimeUri)) : void 0;
    if (sess) {
      void this._refreshSkillExtraRoots();
      void this._reconcileMaterializedCustomizations(sess);
    }
  }
  onClientToolCallComplete(chat, toolCallId, result, context) {
    const runtime = this._resolveConversationSession(chat, context);
    const sess = runtime ? this._sessions.get(AgentSession.id(runtime)) : void 0;
    sess?.pendingClientToolCalls.respondOrBuffer(toolCallId, result);
  }
  // ---- Client-pushed plugin customizations -------------------------------
  /**
   * Materialize + parse a client's pushed plugin customizations and store
   * them on the session. Mirrors the Claude client-plugin path: the shared
   * {@link IAgentPluginManager} copies each plugin to local disk (nonce
   * cached), we parse the resulting directory into its
   * {@link IParsedPlugin | components}, publish the customization surface,
   * and refresh the process-global skill roots. MCP servers are attached
   * per-thread at the next {@link _materialize}.
   */
  async _syncClientCustomizations(sessionUri, clientId, customizations, options) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (!session) {
      return;
    }
    await this._customizationEnablementService?.initializeSession(sessionUri.toString());
    const synced = await this._pluginManager.syncCustomizations(
      clientId,
      [...customizations],
      (status) => {
        if (!options?.quiet) {
          this._fire(sessionUri, { type: ActionType.SessionCustomizationUpdated, customization: status });
        }
      }
    );
    if (session.disposed) {
      return;
    }
    const inputs = new Map(customizations.map((customization) => [customization.uri, customization]));
    const plugins = await Promise.all(synced.map((item) => this._parseClientPlugin(session, item, inputs.get(item.customization.uri))));
    if (session.disposed) {
      return;
    }
    session.clientCustomizations.setClient(clientId, plugins);
    if (!options?.quiet) {
      this._publishClientCustomizations(session);
    }
    await this._refreshSkillExtraRoots();
    await this._reconcileMaterializedCustomizations(session);
  }
  async _reconcileMaterializedCustomizations(session) {
    if (session.threadId === void 0) {
      return;
    }
    const launch = await this._buildCustomizationLaunch(session);
    if (launch.signature === session.materializedCustomizationsSig) {
      return;
    }
    if (!session.firstTurnSent) {
      await this._restartThreadWithCurrentTools(session);
      this._persistMaterializedSession(session);
    } else {
      this._markSessionForReload(session);
    }
  }
  /** Parse one synced plugin directory into its components (best-effort). */
  async _parseClientPlugin(session, synced, input) {
    if (!synced.pluginDir) {
      return { synced, parsed: void 0, input };
    }
    try {
      const parsed = await parsePlugin(synced.pluginDir, this._fileService, session.workingDirectory, this._environmentService.userHome, synced.pluginDir);
      const candidate = { ...synced.customization, children: parsedPluginChildren(parsed) };
      const clientPlugins = input ? /* @__PURE__ */ new Map([[input.uri, input]]) : void 0;
      const resolution = resolveCustomizationEnablement(this._customizationEnablementService, session.sessionUri, [candidate], input?.childEnablement ? /* @__PURE__ */ new Map([[input.uri, input.childEnablement]]) : void 0, clientPlugins);
      const resolved = resolution.customizations[0];
      return {
        synced,
        parsed,
        input,
        customization: resolved.type === CustomizationType.Plugin ? resolved : candidate
      };
    } catch (err) {
      this._logService.warn(`[Codex] failed to parse client plugin ${synced.customization.uri}: ${err instanceof Error ? err.message : String(err)}`);
      return { synced, parsed: void 0, input };
    }
  }
  /** Publish the session's client-plugin customizations as upsert actions. */
  _publishClientCustomizations(session) {
    for (const customization of session.clientCustomizations.toCustomizations()) {
      this._fire(session.sessionUri, { type: ActionType.SessionCustomizationUpdated, customization });
    }
  }
  /**
   * Recompute the process-global skill roots from every live session's
   * enabled client plugins and push them to codex via `skills/extraRoots/set`.
   * codex's extra skill roots are a single shared list (there is no per-thread
   * equivalent), so we send the union across all sessions — which matches the
   * global nature of client plugin choices. No-op when the connection is not
   * ready; the next {@link _materialize} re-applies.
   */
  async _refreshSkillExtraRoots() {
    if (this._connection.kind !== "ready") {
      return;
    }
    const plugins = [];
    for (const session of this._sessions.values()) {
      if (!session.disposed) {
        plugins.push(...this._enabledClientPlugins(session));
      }
    }
    const roots = codexSkillRootsFromPlugins(plugins);
    try {
      await this._connection.client.request("skills/extraRoots/set", { extraRoots: roots });
      if (roots.length > 0) {
        this._logService.info(`[Codex] applied ${roots.length} client-plugin skill root(s)`);
      }
    } catch (err) {
      this._logService.warn(`[Codex] skills/extraRoots/set failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // ---- MCP servers -------------------------------------------------------
  /**
   * Surfaces codex's MCP servers to AHP clients as per-session
   * customizations. Codex has no plugin/directory customization layer, so
   * every server is a bare top-level {@link McpServerCustomization}. The
   * returned snapshot reflects the current connection-global inventory;
   * subsequent lifecycle transitions arrive as customization actions
   * emitted by the session's {@link McpCustomizationController}.
   * `hostCustomizations` is unused: codex reconciles a client's pushed
   * plugin customizations directly (see {@link _syncClientCustomizations}),
   * so the host's copy carries nothing this method needs.
   */
  async getChatCustomizations(chat, context, _hostCustomizations) {
    const sessionUri = resolveAgentChatContext(context, chat).configurationResource;
    const session = this._sessions.get(AgentSession.id(sessionUri));
    if (!session) {
      return [];
    }
    const controller = this._getOrCreateMcpController(session);
    controller.applyAll(inventoryToSdkServers(this._mcpInventory));
    this._refreshMcpCustomizationIds(session, controller);
    const [workspaceAgents, skillHookContainers] = await Promise.all([
      discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService),
      this._fetchSkillHookContainers(session)
    ]);
    return [
      ...workspaceAgents.containers,
      ...session.clientCustomizations.toCustomizations(),
      ...controller.topLevelCustomizations(),
      ...skillHookContainers
    ];
  }
  /**
   * Fetches the skills and hooks codex has loaded for `session`'s working
   * directory (`skills/list` + `hooks/list`, both cwd-scoped) and projects
   * them into {@link DirectoryCustomization} containers. Best-effort: returns
   * an empty array when no connection is ready, no working directory is known,
   * or the app-server rejects the request.
   */
  async _fetchSkillHookContainers(session) {
    if (this._connection.kind !== "ready" || !session.workingDirectory) {
      return [];
    }
    const cwd = session.workingDirectory.fsPath;
    const client = this._connection.client;
    const [skills, hooks] = await Promise.all([
      client.request("skills/list", { cwds: [cwd] }).catch((err) => {
        this._logService.warn(`[Codex] skills/list failed: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      }),
      client.request("hooks/list", { cwds: [cwd] }).catch((err) => {
        this._logService.warn(`[Codex] hooks/list failed: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      })
    ]);
    return [...codexSkillsToContainers(skills), ...codexHooksToContainers(hooks)];
  }
  /**
   * Re-fetches this session's workspace agent, skill, and hook customizations and upserts each
   * container into session state via {@link ActionType.SessionCustomizationUpdated}.
   * Called after materialization (when the connection is ready and the cwd is
   * known) so the workbench Customizations surface reflects workspace agents
   * and what codex loaded from the working directory's `.agents`/`.codex`
   * folders. Upserts (keyed by customization id) leave MCP customizations
   * untouched.
   */
  async _refreshSkillHookCustomizations(session) {
    if (session.disposed) {
      return;
    }
    const [workspaceAgents, skillHookContainers] = await Promise.all([
      discoverCodexWorkspaceAgents(this._workingDirectories(session), this._fileService),
      this._fetchSkillHookContainers(session)
    ]);
    if (session.disposed) {
      return;
    }
    for (const container of [...workspaceAgents.containers, ...skillHookContainers]) {
      this._fire(session.sessionUri, { type: ActionType.SessionCustomizationUpdated, customization: container });
    }
  }
  /**
   * Routes an MCP request received on this session's `mcp://` side channel
   * to codex. Read-only methods (`tools/list`, `resources/list`,
   * `resources/templates/list`) are answered from the cached inventory;
   * `tools/call` and `resources/read` round-trip to the app-server with the
   * session's thread id. Unknown servers / methods reject with
   * `Method not found` so the protocol server maps them to JSON-RPC
   * `-32601`.
   */
  async handleMcpRequest(sessionUri, serverName, method, params) {
    const sessionId = AgentSession.id(sessionUri);
    const session = this._sessions.get(sessionId);
    if (!session) {
      throw new Error(`Method not found: no active session ${sessionId}`);
    }
    const entry = this._mcpInventory.get(serverName);
    if (!entry) {
      throw new Error(`Method not found: unknown MCP server '${serverName}'`);
    }
    const read = buildCodexMcpReadResult(method, entry);
    if (read.handled) {
      return read.result;
    }
    switch (method) {
      case "tools/call": {
        const tool = params && typeof params["name"] === "string" ? params["name"] : void 0;
        if (!tool) {
          throw new Error(`tools/call missing 'name' parameter`);
        }
        const threadId = await this._ensureThreadId(session);
        const conn = await this._ensureConnection();
        return conn.client.request("mcpServer/tool/call", {
          threadId,
          server: serverName,
          tool,
          arguments: params ? params["arguments"] : void 0
        });
      }
      case "resources/read": {
        const uri = params && typeof params["uri"] === "string" ? params["uri"] : void 0;
        if (!uri) {
          throw new Error(`resources/read missing 'uri' parameter`);
        }
        const threadId = await this._ensureThreadId(session);
        const conn = await this._ensureConnection();
        return conn.client.request("mcpServer/resource/read", {
          threadId,
          server: serverName,
          uri
        });
      }
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
  async startMcpServer(sessionUri, id) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    const serverName = session ? this._resolveMcpServerName(session, id) : void 0;
    if (!session || !serverName) {
      this._logService.warn(`[Codex] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    const conn = await this._ensureConnection();
    await conn.client.request("config/mcpServer/reload", void 0);
    await this._refreshMcpInventory(conn.client);
  }
  async stopMcpServer(sessionUri, id) {
    const session = this._sessions.get(AgentSession.id(sessionUri));
    const serverName = session ? this._resolveMcpServerName(session, id) : void 0;
    if (!session || !serverName) {
      this._logService.warn(`[Codex] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
  }
  _resolveMcpServerName(session, id) {
    const controller = this._getOrCreateMcpController(session);
    controller.applyAll(inventoryToSdkServers(this._mcpInventory));
    this._refreshMcpCustomizationIds(session, controller);
    return controller.serverNameForCustomizationId(id);
  }
  /**
   * Lazily create the per-session {@link McpCustomizationController}. Not
   * registered on the agent (sessions come and go) — disposed explicitly
   * when the session is removed.
   */
  _getOrCreateMcpController(session) {
    if (!session.mcpController) {
      session.mcpController = this._instantiationService.createInstance(McpCustomizationController, {
        providerId: this.id,
        sessionId: session.sessionId,
        sessionUri: session.sessionUri,
        emit: (action) => this._fire(session.sessionUri, action),
        capabilities: CODEX_MCP_APP_CAPABILITIES,
        pluginMcpServerSources: () => codexPluginMcpServerSources(session.clientCustomizations.plugins()),
        resolveEnablement: (server, owningPluginUri) => {
          const resolution = this._customizationEnablementService.resolve(session.sessionUri.toString(), targetForMcpServer(server, owningPluginUri, false));
          return resolution.kind === "resolved" ? resolution.enablement : void 0;
        }
      });
    }
    return session.mcpController;
  }
  /** Mirrors the connection-global inventory onto every live session. */
  _applyMcpInventoryToSessions() {
    const servers = inventoryToSdkServers(this._mcpInventory);
    for (const session of this._sessions.values()) {
      if (session.disposed) {
        continue;
      }
      const controller = this._getOrCreateMcpController(session);
      controller.applyAll(servers);
      this._refreshMcpCustomizationIds(session, controller);
    }
  }
  /**
   * Refreshes the session's mapper snapshot of server name → customization id
   * (read when stamping the MCP contributor on tool calls). Plain data, owned
   * here — the mapper never reaches back into the controller. Must run on every
   * inventory change because MCP servers are discovered asynchronously, after a
   * session (and possibly its first tool call) already exists.
   */
  _refreshMcpCustomizationIds(session, controller) {
    const ids = session.mapState.mcpCustomizationIds;
    ids.clear();
    for (const serverName of this._mcpInventory.keys()) {
      const id = controller.customizationIdForServer(serverName);
      if (id !== void 0) {
        ids.set(serverName, id);
      }
    }
  }
  /**
   * Re-reads the full MCP inventory from the app-server (paginated) and
   * re-publishes it to every session. Fires `notifications/tools/list_changed`
   * on each ready channel whose tool set changed.
   */
  async _refreshMcpInventory(client, preserveMissingReadyServer) {
    let data = [];
    try {
      let cursor = null;
      do {
        const response = await client.request("mcpServerStatus/list", { cursor, detail: "full" });
        data = data.concat(response.data);
        cursor = response.nextCursor;
      } while (cursor);
    } catch (err) {
      this._logService.warn(`[Codex] Failed to list MCP servers: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    const next = codexMcpListToInventory(data);
    const toolsChanged = [];
    for (const [name, entry] of next) {
      const prev = this._mcpInventory.get(name);
      if (prev && codexMcpToolsChanged(prev, entry)) {
        toolsChanged.push(name);
      }
    }
    for (const [name, entry] of this._mcpInventory) {
      if (!next.has(name) && (entry.state.kind !== McpServerStatus.Ready || name === preserveMissingReadyServer)) {
        next.set(name, entry);
      }
    }
    this._mcpInventory.clear();
    for (const [name, entry] of next) {
      this._mcpInventory.set(name, entry);
    }
    this._logService.info(`[Codex] MCP inventory refreshed: ${this._mcpInventory.size === 0 ? "(none)" : [...this._mcpInventory].map(([name, entry]) => `${name} [${entry.state.kind}, ${entry.tools.length} tool(s)]`).join(", ")}`);
    this._applyMcpInventoryToSessions();
    for (const name of toolsChanged) {
      this._fireMcpToolsListChanged(name);
    }
  }
  /**
   * Handles a `mcpServer/startupStatus/updated` notification. `ready`
   * triggers a full inventory refresh (to pull the now-loaded tools);
   * other transitions update the cached state in place so the UI sees the
   * server settle into starting/error/stopped promptly.
   */
  _handleMcpStartupStatus(client, name, status, error) {
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    this._logService.info(`[Codex] MCP server '${name}' startup status: ${status}${error ? ` (${error})` : ""}`);
    if (status === "ready") {
      this._setMcpServerState(name, translateCodexMcpStartupState(status, error));
      void this._refreshMcpInventory(client, name);
      return;
    }
    if (status === "failed" && codexStartupErrorNeedsAuth(error)) {
      const url = this._mcpServerUrlForName(name);
      const normalized = url !== void 0 ? normalizeCodexMcpResourceUrl(url) : void 0;
      if (url !== void 0 && normalized !== void 0) {
        if (this._mcpAuthTokens.delete(normalized)) {
          this._logService.info(`[Codex] MCP server '${name}' rejected the stored token; clearing it to allow re-authentication`);
        }
        void this._surfaceMcpAuthRequired(client, name, url, error);
        return;
      }
    }
    this._setMcpServerState(name, translateCodexMcpStartupState(status, error));
  }
  /** Upserts a server's lifecycle state in the inventory (preserving cached tools) and republishes. */
  _setMcpServerState(name, state) {
    const prev = this._mcpInventory.get(name);
    this._mcpInventory.set(name, {
      state,
      tools: prev?.tools ?? [],
      resources: prev?.resources ?? [],
      resourceTemplates: prev?.resourceTemplates ?? []
    });
    this._applyMcpInventoryToSessions();
  }
  /**
   * Surfaces an auth-gated http MCP server as {@link McpServerStatus.AuthRequired}
   * so the workbench runs the *same* OAuth sign-in it uses for the Copilot
   * agent. codex's `failed` notification carries no RFC 9728 metadata, and the
   * workbench's `resolveMcpServerAuthentication` needs the resource's
   * `authorization_servers` to know where to sign in — so we discover the
   * Protected Resource Metadata (`<url>/.well-known/oauth-protected-resource`)
   * here, mirroring the discovery the Copilot SDK does internally. On
   * discovery failure we still surface `AuthRequired` with bare metadata (the
   * server genuinely needs auth); the one-click sign-in just can't complete
   * without the authorization server, which is logged.
   */
  async _surfaceMcpAuthRequired(client, name, url, error) {
    const configuredChildren = [...this._sessions.values()].flatMap((session) => session.clientCustomizations.toCustomizations()).flatMap((plugin) => plugin.children ?? []).filter((child) => child.type === CustomizationType.McpServer && child.name === name);
    if (configuredChildren.length > 0 && configuredChildren.every((child) => !isCustomizationEnabled(child))) {
      this._logService.info(`[Codex] Suppressed authentication request from disabled MCP server '${name}'`);
      return;
    }
    let resource = { resource: url, resource_name: name };
    let requiredScopes;
    try {
      const discovered = await raceTimeout(fetchResourceMetadata(url, void 0), 15e3);
      if (discovered) {
        resource = discovered.metadata;
        requiredScopes = discovered.metadata.scopes_supported;
        this._logService.info(`[Codex] discovered OAuth metadata for MCP server '${name}': authorization_servers=[${(discovered.metadata.authorization_servers ?? []).join(", ")}]`);
      } else {
        this._logService.warn(`[Codex] timed out discovering OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete`);
      }
    } catch (err) {
      this._logService.warn(`[Codex] failed to discover OAuth metadata for MCP server '${name}' at ${url}; the Authenticate action may not be able to complete: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this._connection.kind === "ready" && this._connection.client !== client) {
      return;
    }
    const normalizedServer = normalizeCodexMcpResourceUrl(url);
    const normalizedResource = normalizeCodexMcpResourceUrl(resource.resource) ?? normalizedServer;
    if (normalizedServer !== void 0 && normalizedResource !== void 0) {
      const servers = this._mcpAuthServerUrlsByResource.get(normalizedResource) ?? /* @__PURE__ */ new Set();
      servers.add(normalizedServer);
      this._mcpAuthServerUrlsByResource.set(normalizedResource, servers);
    }
    this._logService.info(`[Codex] MCP server '${name}' requires authentication for ${url}`);
    this._setMcpServerState(name, {
      kind: McpServerStatus.AuthRequired,
      reason: McpAuthRequiredReason.Required,
      resource,
      requiredScopes: requiredScopes && requiredScopes.length > 0 ? requiredScopes : void 0,
      description: error ?? void 0
    });
  }
  /**
   * Broadcasts `notifications/tools/list_changed` for `serverName` on every
   * session whose channel for that server is currently ready. Clients
   * refetch `tools/list` in response.
   */
  _fireMcpToolsListChanged(serverName) {
    for (const session of this._sessions.values()) {
      const channel = session.mcpController?.channelForServer(serverName);
      if (channel) {
        this._onMcpNotification.fire({ channel, method: "notifications/tools/list_changed" });
      }
    }
  }
  /**
   * Ensures the session has a materialized codex thread and returns its id.
   * MCP tool calls (`mcpServer/tool/call`) are thread-scoped, so a call
   * arriving before the first turn lazily starts the thread.
   */
  async _ensureThreadId(session) {
    await this._materializeIfNeeded(session, session.sessionUri, false);
    if (session.threadId === void 0) {
      throw new Error(`Cannot run MCP tool: codex session ${session.sessionId} is not materialized`);
    }
    return session.threadId;
  }
  async shutdown() {
    this._disposeConnection();
    for (const s of this._sessions.values()) {
      s.pendingCommandApprovals.denyAll("decline");
      s.pendingClientToolCalls.rejectAll(new CancellationError());
      s.pendingUserInputs.rejectAll(new CancellationError());
      s.mcpController?.dispose();
    }
    this._sessions.clear();
    this._sessionIdByThreadId.clear();
    this._fileEditObservers.clearAndDisposeAll();
    this._mcpInventory.clear();
  }
  resolveChatConfig(params) {
    const values = codexSessionConfigSchema.validateOrDefault(params.config, codexSessionConfigDefaults);
    const schema = codexVisibleSessionConfigSchema.toProtocol();
    const resolvedValues = {
      ...params.config,
      [SessionConfigKey.Mode]: values[SessionConfigKey.Mode]
    };
    delete resolvedValues[CodexSessionConfigKey.PermissionsPreset];
    delete resolvedValues[CodexSessionConfigKey.ApprovalPolicy];
    delete resolvedValues[CodexSessionConfigKey.SandboxMode];
    Object.assign(resolvedValues, migrateCodexPermissionValues(params.config, this._permissionAxisDefaults()));
    return Promise.resolve({ values: resolvedValues, schema });
  }
  getInheritedChatConfig(config) {
    const inherited = migrateCodexPermissionValues(config, this._permissionAxisDefaults());
    if (config[SessionConfigKey.Permissions] !== void 0) {
      inherited[SessionConfigKey.Permissions] = config[SessionConfigKey.Permissions];
    }
    return Object.keys(inherited).length > 0 ? inherited : void 0;
  }
  async chatConfigCompletions(params) {
    if (params.property !== CodexSessionConfigKey.AdditionalDirectories) {
      return { items: [] };
    }
    const query = params.query?.trim();
    if (!query) {
      return { items: [] };
    }
    const workingDirectory = params.workingDirectory?.fsPath;
    const resolved = isAbsolute(query) ? query : resolve(workingDirectory ?? process.cwd(), query);
    const parent = query.endsWith(sep) ? resolved : dirname(resolved);
    const prefix = query.endsWith(sep) ? "" : basename(resolved).toLowerCase();
    try {
      const entries = await fs.promises.readdir(parent, { withFileTypes: true });
      return {
        items: entries.filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith(prefix)).slice(0, 50).map((entry) => {
          const value = join(parent, entry.name);
          return { value, label: entry.name, description: value };
        })
      };
    } catch {
      return { items: [] };
    }
  }
  // #endregion
  _fire(sessionUri, action) {
    if (isChatAction(action)) {
      const chatChannel = this._sessions.get(AgentSession.id(sessionUri))?.chatChannel;
      if (!chatChannel) {
        throw new Error(`Codex session ${sessionUri.toString()} has no bound chat channel`);
      }
      this._onDidChatProgress.fire({ kind: "action", resource: chatChannel, action });
      return;
    }
    this._onDidChatProgress.fire({ kind: "action", resource: sessionUri, action });
  }
  dispose() {
    this._disposeConnection();
    for (const s of this._sessions.values()) {
      s.pendingCommandApprovals.denyAll("decline");
      s.pendingClientToolCalls.rejectAll(new CancellationError());
      s.pendingUserInputs.rejectAll(new CancellationError());
      s.mcpController?.dispose();
    }
    for (const subagent of this._subagentsByThreadId.values()) {
      subagent.session.pendingCommandApprovals.denyAll("decline");
    }
    this._subagentsByThreadId.clear();
    this._sessions.clear();
    this._sessionIdByThreadId.clear();
    this._fileEditObservers.clearAndDisposeAll();
    this._mcpInventory.clear();
    super.dispose();
  }
};
CodexAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService),
  __decorateParam(2, ICodexProxyService),
  __decorateParam(3, IAgentConfigurationService),
  __decorateParam(4, IAgentHostGitHubEndpointService),
  __decorateParam(5, IAgentHostCheckpointService),
  __decorateParam(6, IAgentSdkDownloader),
  __decorateParam(7, IProductService),
  __decorateParam(8, IAgentPluginManager),
  __decorateParam(9, IFileService),
  __decorateParam(10, INativeEnvironmentService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, ISessionDataService),
  __decorateParam(13, IAgentHostOTelService),
  __decorateParam(14, IAgentHostCustomizationEnablementService),
  __decorateParam(15, IAgentHostSessionTitleSignal)
], CodexAgent);
function parseBinaryArgs(json) {
  if (!json) {
    return [];
  }
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
function codexPackageSuffix(platform, arch) {
  if (platform !== "linux" && platform !== "darwin" && platform !== "win32" || arch !== "x64" && arch !== "arm64") {
    return void 0;
  }
  return `${platform}-${arch}`;
}
function codexBinaryTriple(sdkTarget) {
  switch (sdkTarget) {
    case "linux-x64":
      return "x86_64-unknown-linux-musl";
    case "linux-arm64":
      return "aarch64-unknown-linux-musl";
    case "darwin-x64":
      return "x86_64-apple-darwin";
    case "darwin-arm64":
      return "aarch64-apple-darwin";
    case "win32-x64":
      return "x86_64-pc-windows-msvc";
    case "win32-arm64":
      return "aarch64-pc-windows-msvc";
    default:
      return void 0;
  }
}
function resolveCodexNodeModulesDirName(sdkRoot, codexTarget, triple, binaryName) {
  const platformPackage = `@openai/codex-${codexTarget}`;
  const relativeTail = [platformPackage, "vendor", triple, "bin", binaryName];
  const unpackedPath = join(sdkRoot, "node_modules.asar.unpacked", ...relativeTail);
  if (fs.existsSync(unpackedPath)) {
    return "node_modules.asar.unpacked";
  }
  return "node_modules";
}
function resolveCodexBinaryPath(sdkRoot, codexTarget, triple, binaryName) {
  const nodeModulesDir = resolveCodexNodeModulesDirName(sdkRoot, codexTarget, triple, binaryName);
  return join(sdkRoot, nodeModulesDir, `@openai/codex-${codexTarget}`, "vendor", triple, "bin", binaryName);
}
async function resolveCodexDevSdkRoot(resolvePackageJsonPath = defaultResolveCodexPackageJsonPath) {
  try {
    const pkgJson = await resolvePackageJsonPath();
    return dirname(dirname(dirname(dirname(pkgJson))));
  } catch {
    return void 0;
  }
}
async function defaultResolveCodexPackageJsonPath() {
  const { createRequire } = await import("node:module");
  return createRequire(import.meta.url).resolve("@openai/codex/package.json");
}
export {
  CodexAgent,
  CodexSdkPackage,
  FORGE_LIVE_EDIT_INSTRUCTIONS,
  codexBinaryTriple,
  codexManagedModelProviderEdits,
  codexPackageSuffix,
  isCodexNonOverridableBuiltInProvider,
  parseCodexModelSelection,
  resolveCodexBinaryPath,
  resolveCodexDevSdkRoot,
  resolveCodexNodeModulesDirName,
  toCodexModelSelectionId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb2RleFxcY29kZXhBZ2VudC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNwYXduLCB0eXBlIENoaWxkUHJvY2Vzc1dpdGhvdXROdWxsU3RyZWFtcyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgTGltaXRlciwgcmFjZVRpbWVvdXQsIHJldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZmV0Y2hSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHR5cGUgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGlzQWJzb2x1dGUsIGpvaW4sIG5vcm1hbGl6ZSwgcmVzb2x2ZSwgc2VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNjaGVtYSwgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIHNjaGVtYVByb3BlcnR5LCBBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXksIHR5cGUgSVNjaGVtYVByb3BlcnR5LCB0eXBlIFNlc3Npb25Nb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQcmljaW5nTWV0YUZyb21CaWxsaW5nLCBub3JtYWxpemVDQVBJQmlsbGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudE1vZGVsUHJpY2luZy5qcyc7XG5pbXBvcnQgeyBDSEFUR1BUX1NVQlNDUklQVElPTl9NT0RFTF9TT1VSQ0VfSUQsIGNyZWF0ZUFnZW50TW9kZWxTb3VyY2VNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50TW9kZWxTb3VyY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29uZmlnS2V5LCBhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgQ09ERVhfQUNDT1VOVF9NRVRBX0tFWSwgQ09ERVhfQUNDT1VOVF9TSUdOX0lOX1JFUVVFU1RfS0VZLCBDT0RFWF9BQ0NPVU5UX1NJR05fT1VUX1JFUVVFU1RfS0VZLCB0eXBlIElDb2RleEFjY291bnRJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvZGV4QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBGT1JHRV9NT0RFTFNfRklMRV9OQU1FLCBDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZLCBjb2RleFByb3ZpZGVyU2VjcmV0UmVzb3VyY2UsIGNvZGV4UHJvdmlkZXJTdG9yZWRBcGlLZXlFbnYsIGlzQ29kZXhQcm92aWRlclN0b3JlZEFwaUtleUVudiwgaXNFbXB0eUNvZGV4TW9kZWxzQ29uZmlnLCBub3JtYWxpemVDb2RleE1vZGVsc0NvbmZpZywgcHJlZmVyQ29kZXhNb2RlbHNDb25maWcsIHdpdGhEZWZhdWx0Q29kZXhSb3V0aW5nLCB0eXBlIElDb2RleE1vZGVsUHJvdmlkZXJFbnRyeSwgdHlwZSBJQ29kZXhNb2RlbHNDb25maWcgfSBmcm9tICcuLi8uLi9jb21tb24vY29kZXhNb2RlbHNDb25maWcuanMnO1xuaW1wb3J0IHsgREVFUFNFRUtfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UsIEdST0tfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UgfSBmcm9tICcuLi8uLi9jb21tb24vZm9yZ2VWZW5kb3JBY2NvdW50LmpzJztcbmltcG9ydCB7IGZpbmRPZmZpY2lhbE1vZGVsUHJvdmlkZXIsIG9mZmljaWFsQ2FyZHNFcXVhbCwgcmVtYWluaW5nUGVyY2VudEZyb21Vc2VkLCByZW1vdmVPZmZpY2lhbE1vZGVsUHJvdmlkZXIsIHJlc29sdmVDb2RleE9mZmljaWFsUm91dGUsIHNob3VsZEluY2x1ZGVPZmZpY2lhbFByb3ZpZGVySW5Db2RleFBpY2tlciwgdXBzZXJ0T2ZmaWNpYWxNb2RlbFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL29mZmljaWFsTW9kZWxDYXJkcy5qcyc7XG5pbXBvcnQgeyBGb3JnZVZlbmRvckFjY291bnRIb3N0IH0gZnJvbSAnLi4vb3JjaGVzdHJhdGlvbi9mb3JnZVZlbmRvckFjY291bnRIb3N0LmpzJztcbmltcG9ydCB7IHByb3ZpZGVyU2VjcmV0SWQsIHNldFZlbmRvckFjY291bnRTZWNyZXQgfSBmcm9tICcuLi9vcmNoZXN0cmF0aW9uL3ZlbmRvckFjY291bnRTZWNyZXRzLmpzJztcbmltcG9ydCB7IGdldFJlYXNvbmluZ0VmZm9ydERlc2NyaXB0aW9uLCBnZXRSZWFzb25pbmdFZmZvcnRMYWJlbCwgcmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIENPREVYX0FHRU5UX1BST1ZJREVSX0lELCBJQWN0aXZlQ2xpZW50LCBJQWdlbnQsIElBZ2VudENoYXRDb25maWdDb21wbGV0aW9uc1BhcmFtcywgSUFnZW50Q2hhdENvbnRleHQsIElBZ2VudENoYXREYXRhQ2hhbmdlLCBJQWdlbnRDaGF0TWV0YWRhdGEsIElBZ2VudENoYXRzLCBJQWdlbnRDcmVhdGVDaGF0Rm9ya1NvdXJjZSwgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsIElBZ2VudERlc2NyaXB0b3IsIElBZ2VudERpc2NvdmVyZWRDaGF0LCBJQWdlbnRNYXRlcmlhbGl6ZUNoYXRFdmVudCwgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRSZXNvbHZlQ2hhdENvbmZpZ1BhcmFtcywgSUFnZW50U3Bhd25DaGF0RXZlbnQsIElNY3BOb3RpZmljYXRpb24sIHJlc29sdmVBZ2VudENoYXRDb250ZXh0LCByZXNvbHZlQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zLCB0eXBlIEFnZW50UHJvdmlkZXIsIHR5cGUgQXV0aGVudGljYXRlUGFyYW1zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzRW52VmFyLCBBZ2VudEhvc3RDb2RleEFnZW50Q29kZXhIb21lRW52VmFyLCBBZ2VudEhvc3RDb2RleEFnZW50U2RrUm9vdEVudlZhciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBSFBfQVVUSF9SRVFVSVJFRCwgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgaXNDaGF0QWN0aW9uLCB0eXBlIFNlc3Npb25BY3Rpb24sIHR5cGUgQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBwYXJzZUxlYWRpbmdTbGFzaENvbW1hbmQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2xhc2hDb21tYW5kLmpzJztcbmltcG9ydCB0eXBlIHsgQ29uZmlnU2NoZW1hLCBNb2RlbFNlbGVjdGlvbiwgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgVG9vbERlZmluaXRpb24sIEFnZW50U2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIFNlc3Npb25Db25maWdDb21wbGV0aW9uc1Jlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBidWlsZERlZmF1bHRDaGF0VXJpLCBpc0RlZmF1bHRDaGF0VXJpLCBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MsIEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIENoYXRJbnB1dEFuc3dlciwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCB0eXBlIFBvbGljeVN0YXRlLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCBUb29sUmVzdWx0Q29udGVudFR5cGUsIHR5cGUgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCwgdHlwZSBUdXJuLCBSZXNwb25zZVBhcnRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFNlcnZlclRvb2xIb3N0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmVyVG9vbHMuanMnO1xuaW1wb3J0IHsgQWN0aXZlQ2xpZW50VG9vbFNldCB9IGZyb20gJy4uL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB7IE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyIH0gZnJvbSAnLi4vc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29kZXhNY3BSZWFkUmVzdWx0LCBjb2RleE1jcExpc3RUb0ludmVudG9yeSwgY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZywgY29kZXhNY3BUb29sc0NoYW5nZWQsIGNvZGV4U3RhcnR1cEVycm9yTmVlZHNBdXRoLCBpbmplY3RDb2RleE1jcEF1dGhUb2tlbnMsIGludmVudG9yeVRvU2RrU2VydmVycywgbm9ybWFsaXplQ29kZXhNY3BSZXNvdXJjZVVybCwgdHJhbnNsYXRlQ29kZXhNY3BTdGFydHVwU3RhdGUsIHR5cGUgSUNvZGV4TWNwU2VydmVyQ29uZmlnSnNvbiwgdHlwZSBJQ29kZXhNY3BTZXJ2ZXJFbnRyeSB9IGZyb20gJy4vY29kZXhNY3BTZXJ2ZXJzLmpzJztcbmltcG9ydCB7IGNvZGV4SG9va3NUb0NvbnRhaW5lcnMsIGNvZGV4U2VsZWN0ZWRDYXBhYmlsaXR5Um9vdENhbmRpZGF0ZXMsIGNvZGV4U2tpbGxzVG9Db250YWluZXJzLCBkaXNjb3ZlckNvZGV4V29ya3NwYWNlQWdlbnRzIH0gZnJvbSAnLi9jb2RleEN1c3RvbWl6YXRpb25zLmpzJztcbmltcG9ydCB7IENvZGV4Q2xpZW50Q3VzdG9taXphdGlvblN0b3JlLCBjb2RleEFnZW50Um9sZVRvbWwsIGNvZGV4Q3VzdG9taXphdGlvbkNvbmZpZywgY29kZXhNY3BTZXJ2ZXJzRnJvbVBsdWdpbnMsIGNvZGV4UGx1Z2luTWNwU2VydmVyU291cmNlcywgY29kZXhTa2lsbENhcGFiaWxpdHlSb290cywgY29kZXhTa2lsbFJvb3RzRnJvbVBsdWdpbnMsIHBhcnNlZFBsdWdpbkNoaWxkcmVuLCB0eXBlIElDb2RleENsaWVudFBsdWdpbiB9IGZyb20gJy4vY29kZXhDbGllbnRDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0YXJnZXRGb3JVbm93bmVkTWNwU2VydmVyIH0gZnJvbSAnLi4vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ3VzdG9taXphdGlvblNka0VsaWdpYmxlLCByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQsIHRhcmdldEZvck1jcFNlcnZlciB9IGZyb20gJy4uL3NoYXJlZC9jdXN0b21pemF0aW9uRW5hYmxlbWVudEdhdGUuanMnO1xuaW1wb3J0IHsgaXNDdXN0b21pemF0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdCwgY2FuY2VsbGVkRWxpY2l0YXRpb25SZXNwb25zZSwgZGVjbGluZWRFbGljaXRhdGlvblJlc3BvbnNlLCBlbGljaXRhdGlvblJlc3BvbnNlRnJvbUFuc3dlcnMgfSBmcm9tICcuL2NvZGV4RWxpY2l0YXRpb25NYXBwZXIuanMnO1xuaW1wb3J0IHsgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgQWhwTWNwVWlIb3N0Q2FwYWJpbGl0aWVzLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciwgdHlwZSBJU3luY2VkQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgcGFyc2VQbHVnaW4gfSBmcm9tICcuLi8uLi8uLi9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIH0gZnJvbSAnLi4vYWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0cmFjdEZvcndhcmRlZEVycm9ySW5mbyB9IGZyb20gJy4uL3NoYXJlZC9wcm94eUNoYXRFcnJvci5qcyc7XG5pbXBvcnQgeyBnZXRTZXJ2ZXJUb29sRGlzcGxheSB9IGZyb20gJy4uL3NoYXJlZC9zZXJ2ZXJUb29sR3JvdXBzLmpzJztcbmltcG9ydCB7IElBZ2VudFNka0Rvd25sb2FkZXIsIElBZ2VudFNka1BhY2thZ2UgfSBmcm9tICcuLi9hZ2VudFNka0Rvd25sb2FkZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGV4QXBwU2VydmVyQ2xpZW50LCBKc29uUnBjRXJyb3IsIHRyYW5zcG9ydEZyb21DaGlsZFByb2Nlc3MsIHR5cGUgSUNvZGV4QXBwU2VydmVyQ2xpZW50LCB0eXBlIFNlcnZlclJlcXVlc3RIYW5kbGVyUmVzdWx0IH0gZnJvbSAnLi9jb2RleEFwcFNlcnZlckNsaWVudC5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVGb3JnZURpYWdub3N0aWNzTG9nIH0gZnJvbSAnLi4vZm9yZ2VEaWFnbm9zdGljc0xvZy5qcyc7XG5pbXBvcnQgeyBJQ29kZXhQcm94eVNlcnZpY2UsIHR5cGUgSUNvZGV4UHJveHlIYW5kbGUgfSBmcm9tICcuL2NvZGV4UHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlLCBleHRyYWN0VXNlcklucHV0VGV4dCwgZmluYWxpemVDb2RleFR1cm5NYXBTdGF0ZSwgbWFwQWdlbnRNZXNzYWdlRGVsdGEsIG1hcENvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YSwgbWFwRXJyb3JOb3RpZmljYXRpb24sIG1hcEZpbGVDaGFuZ2VPdXRwdXREZWx0YSwgbWFwRmlsZUNoYW5nZVBhdGNoVXBkYXRlZCwgbWFwRmlsZUNoYW5nZVN0YXJ0ZWQsIG1hcEl0ZW1Db21wbGV0ZWQsIG1hcEl0ZW1TdGFydGVkLCBtYXBNY3BUb29sQ2FsbFByb2dyZXNzLCBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkLCBtYXBSZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhLCBtYXBSZWFzb25pbmdUZXh0RGVsdGEsIG1hcFRva2VuVXNhZ2VVcGRhdGVkLCBtYXBUdXJuQ29tcGxldGVkLCBtYXBUdXJuRGlmZlVwZGF0ZWQsIG1hcFR1cm5TdGFydGVkLCB0eXBlIElDb2RleFNlc3Npb25NYXBTdGF0ZSB9IGZyb20gJy4vY29kZXhNYXBBcHBTZXJ2ZXJFdmVudHMuanMnO1xuaW1wb3J0IHsgdW53cmFwU2hlbGxJbnZvY2F0aW9uIH0gZnJvbSAnLi9jb2RleFNoZWxsQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBwbGFuRm9ya2VkVHVybklkTWFwLCByZXNvbHZlRm9ya0JvdW5kYXJ5IH0gZnJvbSAnLi9jb2RleEZvcmtQbGFuLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb2RleElucHV0IH0gZnJvbSAnLi9jb2RleFByb21wdFJlc29sdmVyLmpzJztcbmltcG9ydCB7IGJ1aWxkVXNlcklucHV0UmVxdWVzdCwgZW1wdHlVc2VySW5wdXRSZXNwb25zZSwgdXNlcklucHV0UmVzcG9uc2VGcm9tQW5zd2VycyB9IGZyb20gJy4vY29kZXhVc2VySW5wdXRNYXBwZXIuanMnO1xuaW1wb3J0IHsgcmVwbGF5VGhyZWFkVG9UdXJucyB9IGZyb20gJy4vY29kZXhSZXBsYXlNYXBwZXIuanMnO1xuaW1wb3J0IHsgQ29kZXhTZXNzaW9uTWV0YWRhdGFTdG9yZSB9IGZyb20gJy4vY29kZXhTZXNzaW9uTWV0YWRhdGFTdG9yZS5qcyc7XG5pbXBvcnQgeyBidWlsZENvZGV4TGF1bmNoQ29uZmlnLCBidWlsZENvZGV4UmVzdW1lUGFyYW1zLCBDT0RFWF9BUFBMWV9QQVRDSF9TVFJFQU1JTkdfRkVBVFVSRSB9IGZyb20gJy4vY29kZXhMYXVuY2hDb25maWcuanMnO1xuaW1wb3J0IHsgY29kZXhEZWxlZ2F0aW9uRGlzcGxheVRleHQgfSBmcm9tICcuL2NvZGV4RGVsZWdhdGlvbi5qcyc7XG5pbXBvcnQgeyBUSFJFQURfTElTVF9NQVhfUEFHRVMsIGNvbGxlY3RUaHJlYWRMaXN0UGFnZXMgfSBmcm9tICcuL2NvZGV4VGhyZWFkTGlzdC5qcyc7XG5pbXBvcnQgeyBJQ29kZXhSb2xsb3V0TWV0YWRhdGEsIElDb2RleFJvbGxvdXRNb2RlbCwgcmVhZENvZGV4Um9sbG91dE1ldGFkYXRhIH0gZnJvbSAnLi9jb2RleFJvbGxvdXRNZXRhZGF0YS5qcyc7XG5pbXBvcnQgeyBjb2RleEFjY291bnRSYXRlTGltaXRGcm9tUmVzcG9uc2UsIGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlLCB0eXBlIElDb2RleEFjY291bnRTdGF0ZSB9IGZyb20gJy4vY29kZXhBY2NvdW50U3RhdGUuanMnO1xuaW1wb3J0IHsgZGlzY292ZXJDb2RleExvY2FsTW9kZWxzLCB0eXBlIElDb2RleERpc2NvdmVyZWRMb2NhbE1vZGVsIH0gZnJvbSAnLi9jb2RleExvY2FsTW9kZWxEaXNjb3ZlcnkuanMnO1xuaW1wb3J0IHsgQ29kZXhTZXNzaW9uQ29uZmlnS2V5LCBDT0RFWF9ERUZBVUxUX1BFUk1JU1NJT05TX1BSRVNFVCwgQ09ERVhfUEVSTUlTU0lPTlNfUFJFU0VUUywgY29sbGFib3JhdGlvbk1vZGVLaW5kLCBpbmZlckNvZGV4UGVybWlzc2lvbnNQcmVzZXQsIG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXMsIG5hcnJvd0FkZGl0aW9uYWxEaXJlY3RvcmllcywgbmFycm93Qm9vbGVhbiwgbmFycm93Q29kZXhQZXJtaXNzaW9uc1ByZXNldCwgbmFycm93UGVyc29uYWxpdHksIG5hcnJvd1JlYXNvbmluZ0VmZm9ydCwgbmFycm93UmVhc29uaW5nU3VtbWFyeSwgbmFycm93V2ViU2VhcmNoTW9kZSwgcmVzb2x2ZUNvZGV4UGVybWlzc2lvbnMsIHJlc29sdmVDb2RleFBlcm1pc3Npb25zUHJlc2V0LCB0eXBlIENvZGV4QXBwcm92YWxQb2xpY3ksIHR5cGUgQ29kZXhQZXJtaXNzaW9uc1ByZXNldCwgdHlwZSBJQ29kZXhSZXNvbHZlZFBlcm1pc3Npb25zIH0gZnJvbSAnLi9jb2RleFNlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB0eXBlIHsgUmVhc29uaW5nRWZmb3J0IH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvUmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB0eXBlIHsgUmVhc29uaW5nU3VtbWFyeSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL1JlYXNvbmluZ1N1bW1hcnkuanMnO1xuaW1wb3J0IHR5cGUgeyBQZXJzb25hbGl0eSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL1BlcnNvbmFsaXR5LmpzJztcbmltcG9ydCB0eXBlIHsgV2ViU2VhcmNoTW9kZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL1dlYlNlYXJjaE1vZGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTYW5kYm94TW9kZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NhbmRib3hNb2RlLmpzJztcbmltcG9ydCB0eXBlIHsgU2FuZGJveFBvbGljeSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NhbmRib3hQb2xpY3kuanMnO1xuaW1wb3J0IHR5cGUgeyBTZWxlY3RlZENhcGFiaWxpdHlSb290IH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdC5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvQ29tbWFuZEV4ZWN1dGlvbkFwcHJvdmFsRGVjaXNpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBDb21tYW5kRXhlY3V0aW9uUmVxdWVzdEFwcHJvdmFsUGFyYW1zIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvQ29tbWFuZEV4ZWN1dGlvblJlcXVlc3RBcHByb3ZhbFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRFeGVjdXRpb25SZXF1ZXN0QXBwcm92YWxSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbW1hbmRFeGVjdXRpb25SZXF1ZXN0QXBwcm92YWxSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VBcHByb3ZhbERlY2lzaW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRmlsZUNoYW5nZUFwcHJvdmFsRGVjaXNpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBGaWxlQ2hhbmdlUmVxdWVzdEFwcHJvdmFsUGFyYW1zIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRmlsZUNoYW5nZVJlcXVlc3RBcHByb3ZhbFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VSZXF1ZXN0QXBwcm92YWxSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVDaGFuZ2VSZXF1ZXN0QXBwcm92YWxSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFBlcm1pc3Npb25zUmVxdWVzdEFwcHJvdmFsUGFyYW1zIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUGVybWlzc2lvbnNSZXF1ZXN0QXBwcm92YWxQYXJhbXMuanMnO1xuaW1wb3J0IHR5cGUgeyBQZXJtaXNzaW9uc1JlcXVlc3RBcHByb3ZhbFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUGVybWlzc2lvbnNSZXF1ZXN0QXBwcm92YWxSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IER5bmFtaWNUb29sU3BlYyB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0R5bmFtaWNUb29sU3BlYy5qcyc7XG5pbXBvcnQgdHlwZSB7IER5bmFtaWNUb29sQ2FsbFBhcmFtcyB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0R5bmFtaWNUb29sQ2FsbFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IER5bmFtaWNUb29sQ2FsbFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRHluYW1pY1Rvb2xDYWxsUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBEeW5hbWljVG9vbENhbGxPdXRwdXRDb250ZW50SXRlbSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0R5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlcXVlc3RVc2VySW5wdXRQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ub29sUmVxdWVzdFVzZXJJbnB1dFBhcmFtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRvb2xSZXF1ZXN0VXNlcklucHV0UXVlc3Rpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ub29sUmVxdWVzdFVzZXJJbnB1dFF1ZXN0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbFJlcXVlc3RVc2VySW5wdXRSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1Rvb2xSZXF1ZXN0VXNlcklucHV0UmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBKc29uVmFsdWUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC9zZXJkZV9qc29uL0pzb25WYWx1ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEdldEFjY291bnRSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0dldEFjY291bnRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEdldEFjY291bnRSYXRlTGltaXRzUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9HZXRBY2NvdW50UmF0ZUxpbWl0c1Jlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgTG9naW5BY2NvdW50UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Mb2dpbkFjY291bnRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1vZGVsTGlzdFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTW9kZWxMaXN0UmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUaHJlYWQgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWQuanMnO1xuaW1wb3J0IHR5cGUgeyBUaHJlYWRMaXN0UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRMaXN0UmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUaHJlYWRSZWFkUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRSZWFkUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUaHJlYWRGb3JrUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRGb3JrUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUaHJlYWRTdGFydFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVGhyZWFkU3RhcnRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFRocmVhZFJlc3VtZVJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVGhyZWFkUmVzdW1lUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVHVybkNvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFR1cm5TdGFydGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVHVyblN0YXJ0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBUdXJuRGlmZlVwZGF0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuRGlmZlVwZGF0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJdGVtU3RhcnRlZE5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0l0ZW1TdGFydGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0l0ZW1Db21wbGV0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBUdXJuU3RhcnRQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuU3RhcnRQYXJhbXMuanMnO1xuaW1wb3J0IHR5cGUgeyBVc2VySW5wdXQgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Vc2VySW5wdXQuanMnO1xuaW1wb3J0IHR5cGUgeyBMaXN0TWNwU2VydmVyU3RhdHVzUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9MaXN0TWNwU2VydmVyU3RhdHVzUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJUb29sQ2FsbFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwU2VydmVyVG9vbENhbGxSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFJlc291cmNlUmVhZFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwUmVzb3VyY2VSZWFkUmVzcG9uc2UuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJTdGFydHVwU3RhdGUgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9NY3BTZXJ2ZXJTdGFydHVwU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9NY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMuanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL01jcFNlcnZlckVsaWNpdGF0aW9uUmVxdWVzdFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgU2tpbGxzTGlzdFJlc3BvbnNlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvU2tpbGxzTGlzdFJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgSG9va3NMaXN0UmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ib29rc0xpc3RSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEl0ZW1HdWFyZGlhbkFwcHJvdmFsUmV2aWV3Q29tcGxldGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbUd1YXJkaWFuQXBwcm92YWxSZXZpZXdDb21wbGV0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBHdWFyZGlhbldhcm5pbmdOb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9HdWFyZGlhbldhcm5pbmdOb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBFcnJvck5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0Vycm9yTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVGhyZWFkQXBwcm92ZUd1YXJkaWFuRGVuaWVkQWN0aW9uUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRBcHByb3ZlR3VhcmRpYW5EZW5pZWRBY3Rpb25SZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbmZpZ1JlYWRSZXNwb25zZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbmZpZ1JlYWRSZXNwb25zZS5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbmZpZ1dyaXRlUmVzcG9uc2UgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db25maWdXcml0ZVJlc3BvbnNlLmpzJztcbmltcG9ydCB0eXBlIHsgQ29uZmlnRWRpdCB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbmZpZ0VkaXQuanMnO1xuaW1wb3J0IHsgZm9ybWF0R3VhcmRpYW5EZW5pYWxOb3RpZmljYXRpb24sIHN1bW1hcml6ZUd1YXJkaWFuUmV2aWV3QWN0aW9uLCB0b0d1YXJkaWFuQXNzZXNzbWVudEV2ZW50SnNvbiB9IGZyb20gJy4vY29kZXhHdWFyZGlhblJldmlldy5qcyc7XG5pbXBvcnQgeyBDT0RFWF9DT01QQUNUX1NMQVNIX0NPTU1BTkQgfSBmcm9tICcuLi9jb2RleENvbXBhY3RDb21tYW5kLmpzJztcbmltcG9ydCB7IGRldGVjdEV4aXN0aW5nQ29kZXhDaGF0R1BUU2V0dXAgfSBmcm9tICcuL2NvZGV4TG9jYWxBdXRoLmpzJztcbmltcG9ydCB7IHByZXBhcmVGb3JnZUNvZGV4SG9tZSwgcmVzb2x2ZUZvcmdlQ29kZXhIb21lIH0gZnJvbSAnLi9jb2RleEhvbWUuanMnO1xuaW1wb3J0IHsgQ29kZXhGaWxlRWRpdE9ic2VydmVyIH0gZnJvbSAnLi9jb2RleEZpbGVFZGl0T2JzZXJ2ZXIuanMnO1xuaW1wb3J0IHsgYXBwbHlXcml0ZUZpbGVUb29sLCBDT0RFWF9XUklURV9GSUxFX1RPT0xfTkFNRSwgcGFyc2VXcml0ZUZpbGVBcmdzLCByZXNvbHZlV3JpdGFibGVXb3Jrc3BhY2VQYXRoLCB3cml0ZUZpbGVUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4vY29kZXhXcml0ZUZpbGVUb29sLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZUNoYW5nZVBhdGNoVXBkYXRlZE5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWROb3RpZmljYXRpb24uanMnO1xuXG5jb25zdCBDTElFTlRfSU5GTyA9IHtcblx0bmFtZTogJ3ZzY29kZV9hZ2VudF9ob3N0Jyxcblx0dGl0bGU6ICdWUyBDb2RlIEFnZW50IEhvc3QnLFxuXHQvLyBUaGUgY29kZXggYGNsaWVudEluZm8udmVyc2lvbmAgaXMgaW5mb3JtYXRpb25hbC4gSGFyZGNvZGVkIHRvIGFcblx0Ly8gbm9uLWVtcHR5IHBsYWNlaG9sZGVyOyBidW1waW5nIGl0IGlzbid0IHJlcXVpcmVkIHdoZW4gb3VyIGNvZGVcblx0Ly8gY2hhbmdlcy5cblx0dmVyc2lvbjogJzAuMS4wJyxcbn07XG5cbi8qKiBLZWVwIHByb3RvY29sIGxvZ3MgY29tcGFjdDogZG9tYWluIHBheWxvYWRzIGFyZSBhbHJlYWR5IHJlY29yZGVkIGluIGNoYXQvdG9vbC9maWxlIGxvZ3MuICovXG5mdW5jdGlvbiBzdW1tYXJpemVDb2RleFJwY01lc3NhZ2UobWVzc2FnZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0aWYgKCFtZXNzYWdlIHx8IHR5cGVvZiBtZXNzYWdlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KG1lc3NhZ2UpKSB7XG5cdFx0cmV0dXJuIHsgdmFsdWVUeXBlOiB0eXBlb2YgbWVzc2FnZSB9O1xuXHR9XG5cdGNvbnN0IHJlY29yZCA9IG1lc3NhZ2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnN0IHBhcmFtcyA9IHJlY29yZFsncGFyYW1zJ107XG5cdGNvbnN0IHBhcmFtc1JlY29yZCA9IHBhcmFtcyAmJiB0eXBlb2YgcGFyYW1zID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwYXJhbXMpID8gcGFyYW1zIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDogdW5kZWZpbmVkO1xuXHRjb25zdCBpZGVudGlmaWVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0Zm9yIChjb25zdCBrZXkgb2YgWyd0aHJlYWRJZCcsICd0dXJuSWQnLCAnaXRlbUlkJywgJ2NhbGxJZCcsICd0b29sQ2FsbElkJywgJ2NvbnZlcnNhdGlvbklkJywgJ2lkJ10pIHtcblx0XHRpZiAocGFyYW1zUmVjb3JkICYmIHBhcmFtc1JlY29yZFtrZXldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlkZW50aWZpZXJzW2tleV0gPSBwYXJhbXNSZWNvcmRba2V5XTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHtcblx0XHRtZXRob2Q6IHJlY29yZFsnbWV0aG9kJ10sXG5cdFx0aWQ6IHJlY29yZFsnaWQnXSxcblx0XHRwYXJhbXNLZXlzOiBwYXJhbXNSZWNvcmQgPyBPYmplY3Qua2V5cyhwYXJhbXNSZWNvcmQpIDogdW5kZWZpbmVkLFxuXHRcdGlkZW50aWZpZXJzLFxuXHRcdGhhc1Jlc3VsdDogT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlY29yZCwgJ3Jlc3VsdCcpLFxuXHRcdGVycm9yOiByZWNvcmRbJ2Vycm9yJ10sXG5cdH07XG59XG5cbmNvbnN0IENPREVYX0RFU0tUT1BfUk9MTE9VVF9QUkVGSVhfTEVOR1RIID0gMTYgKiAxMDI0O1xuY29uc3QgQ09ERVhfREVTS1RPUF9ST0xMT1VUX1BSRUZJWF9DT05DVVJSRU5DWSA9IDg7XG5jb25zdCBDT0RFWF9DT0xEX1NFU1NJT05fUkVBRF9DT05DVVJSRU5DWSA9IDg7XG5jb25zdCBDT0RFWF9ERVNLVE9QX1dPUktTUEFDRV9EQVRFX1BBVFRFUk4gPSAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC87XG5jb25zdCBDT0RFWF9ERVNLVE9QX1NFU1NJT05fTUVUQV9QQVRURVJOID0gL1widHlwZVwiXFxzKjpcXHMqXCJzZXNzaW9uX21ldGFcIi4qXCJwYXlsb2FkXCJcXHMqOlxccypcXHtbXn1dKlwib3JpZ2luYXRvclwiXFxzKjpcXHMqXCJDb2RleCBEZXNrdG9wXCIvcztcbmV4cG9ydCBjb25zdCBGT1JHRV9MSVZFX0VESVRfSU5TVFJVQ1RJT05TID0gW1xuXHQnSWYgeW91ciB0b29sIGxpc3QgaW5jbHVkZXMgYSBuYXRpdmUgYXBwbHlfcGF0Y2ggZnVuY3Rpb24gb3IgZnJlZWZvcm0gdG9vbCwgdXNlIHRoYXQgZm9yIHdvcmtzcGFjZSB0ZXh0IGVkaXRzLicsXG5cdCdPdGhlcndpc2UgeW91IE1VU1QgdXNlIHRoZSB3cml0ZV9maWxlIGZ1bmN0aW9uIHRvb2w6IHBhc3MgcGF0aCBwbHVzIHRoZSBjb21wbGV0ZSBmaWxlIGNvbnRlbnRzIGluIG9uZSBjYWxsLiBOZXZlciBzcGxpdCBvbmUgZmlsZSBhY3Jvc3MgbXVsdGlwbGUgd3JpdGVzLicsXG5cdCdOZXZlciBpbnZva2UgYXBwbHlfcGF0Y2gsIGFwcGx5X3BhdGNoLmJhdCwgb3IgYGNvZGV4LmV4ZSAtLWNvZGV4LXJ1bi1hcy1hcHBseS1wYXRjaGAgdGhyb3VnaCBzaGVsbF9jb21tYW5kLiBPbiBXaW5kb3dzIHRoYXQgd3JhcHBlciBjYW5ub3QgY2FycnkgbGFyZ2Ugb3IgcXVvdGVkIHBhdGNoZXMgYW5kIHdpbGwgZmFpbC4gSWYgYSBzaGVsbCBhcHBseV9wYXRjaCBjYWxsIGZhaWxzLCBkbyBub3QgcmV0cnkgaXQgXHUyMDE0IHN3aXRjaCB0byB3cml0ZV9maWxlIG9yIHRoZSBuYXRpdmUgYXBwbHlfcGF0Y2ggdG9vbC4nLFxuXHQnRG8gbm90IHVzZSBQb3dlclNoZWxsIFNldC1Db250ZW50LCBPdXQtRmlsZSwgcmVkaXJlY3Rpb24sIG9yIHNjcmlwdHMgdG8gd3JpdGUgd29ya3NwYWNlIHNvdXJjZSBmaWxlcy4nLFxuXHQnU2hlbGwgY29tbWFuZHMgcmVtYWluIGFwcHJvcHJpYXRlIGZvciByZWFkaW5nIGZpbGVzLCBzZWFyY2hpbmcsIHRlc3RpbmcsIGJ1aWxkaW5nLCBhbmQgb3RoZXIgbm9uLWVkaXQgb3BlcmF0aW9ucy4nLFxuXS5qb2luKCcgJyk7XG5cbmZ1bmN0aW9uIGlzQ29kZXhEZXNrdG9wR2VuZXJhdGVkV29ya3NwYWNlKGN3ZDogc3RyaW5nLCB1c2VySG9tZTogVVJJKTogYm9vbGVhbiB7XG5cdGNvbnN0IHJlbGF0aXZlUGF0aCA9IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLnJlbGF0aXZlUGF0aCh1c2VySG9tZSwgVVJJLmZpbGUoY3dkKSk7XG5cdGNvbnN0IHNlZ21lbnRzID0gcmVsYXRpdmVQYXRoPy5zcGxpdCgnLycpO1xuXHRyZXR1cm4gc2VnbWVudHM/Lmxlbmd0aCA9PT0gNFxuXHRcdCYmIHNlZ21lbnRzWzBdLnRvTG93ZXJDYXNlKCkgPT09ICdkb2N1bWVudHMnXG5cdFx0JiYgc2VnbWVudHNbMV0udG9Mb3dlckNhc2UoKSA9PT0gJ2NvZGV4J1xuXHRcdCYmIENPREVYX0RFU0tUT1BfV09SS1NQQUNFX0RBVEVfUEFUVEVSTi50ZXN0KHNlZ21lbnRzWzJdKVxuXHRcdCYmIHNlZ21lbnRzWzNdLmxlbmd0aCA+IDA7XG59XG5cbmNvbnN0IENPREVYX1RISU5LSU5HX0xFVkVMX0tFWSA9ICd0aGlua2luZ0xldmVsJztcblxuLyoqXG4gKiBVc2VyLWFnZW50IHByZWZpeCBhcHBsaWVkIHRvIHRoZSBDb2RleCBhZ2VudCdzIG91dGJvdW5kIENBUEkgY2FsbHMgKGUuZy4gdGhlXG4gKiBtb2RlbC1saXN0IGZldGNoKSBzbyB0aGUgdHJhZmZpYyBpcyBpZGVudGlmaWFibGUgc2VydmVyLXNpZGUuIE1pcnJvcnNcbiAqIGBjbGF1ZGVBZ2VudC50c2AgYW5kIHRoZSBgdnNjb2RlX2NvZGV4YCBwcmVmaXggdXNlZCBieSBgY29kZXhQcm94eVNlcnZpY2UudHNgXG4gKiBhbmQgYG9haUxhbmd1YWdlTW9kZWxTZXJ2ZXIudHNgLlxuICovXG5jb25zdCBVU0VSX0FHRU5UX1BSRUZJWCA9ICd2c2NvZGVfY29kZXgnO1xuXG5jb25zdCBDT0RFWF9SRUFTT05JTkdfRUZGT1JUUzogcmVhZG9ubHkgUmVhc29uaW5nRWZmb3J0W10gPSBbJ21pbmltYWwnLCAnbG93JywgJ21lZGl1bScsICdoaWdoJ107XG5cbi8qKlxuICogTUNQIEFwcCBjYXBhYmlsaXRpZXMgYWR2ZXJ0aXNlZCBvbiBldmVyeSBjb2RleCBNQ1Agc2VydmVyLiBNaXJyb3JzXG4gKiB7QGxpbmsgREVGQVVMVF9NQ1BfQVBQX0NBUEFCSUxJVElFU30gYnV0IG9taXRzIGBzYW1wbGluZ2A6IGNvZGV4IG93bnNcbiAqIHRoZSBtb2RlbCBjb25uZWN0aW9uICh0aHJvdWdoIHRoZSBgdnNjb2RlLXByb3h5YCBwcm92aWRlcikgYW5kIGV4cG9zZXNcbiAqIG5vIGFwcC1zZXJ2ZXIgUlBDIGZvciBBcHAtaW5pdGlhdGVkIGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlYCwgc28gdGhlXG4gKiBob3N0IGNhbm5vdCBzZXJ2ZSB0aGF0IGNhcGFiaWxpdHkgZm9yIGNvZGV4LlxuICovXG5jb25zdCBDT0RFWF9NQ1BfQVBQX0NBUEFCSUxJVElFUzogQWhwTWNwVWlIb3N0Q2FwYWJpbGl0aWVzID0ge1xuXHRzZXJ2ZXJUb29sczogeyBsaXN0Q2hhbmdlZDogdHJ1ZSB9LFxuXHRzZXJ2ZXJSZXNvdXJjZXM6IHt9LFxufTtcblxuLyoqXG4gKiBDb2RleCBzdXJmYWNlcyBhbiBNQ1AgdG9vbC1jYWxsIGFwcHJvdmFsIGFzIGEgYHJlcXVlc3RfdXNlcl9pbnB1dGBcbiAqIHF1ZXN0aW9uIHdob3NlIGlkIGlzIGBtY3BfdG9vbF9jYWxsX2FwcHJvdmFsXzxjYWxsSWQ+YCAodGhlIGA8Y2FsbElkPmBcbiAqIG1hdGNoZXMgdGhlIGBtY3BUb29sQ2FsbGAgaXRlbSBpZCkuIFRoZSBob3N0IGludGVyY2VwdHMgdGhlc2UgYW5kIHJlbmRlcnNcbiAqIHRoZW0gb24gdGhlIG5vcm1hbCB0b29sLWFwcHJvdmFsIGNhcmQgaW5zdGVhZCBvZiBhIGNoYXQtaW5wdXQgcXVlc3Rpb247XG4gKiBzZWUge0BsaW5rIENvZGV4QWdlbnQuX2hhbmRsZU1jcFRvb2xBcHByb3ZhbFZpYUNhcmR9LlxuICpcbiAqIENvZGV4IGRlY29kZXMgdGhlIGFuc3dlciBzdHJpbmcgYmFjayBpbnRvIGEgZGVjaXNpb246IGBBbGxvd2AgYWNjZXB0cyB0aGVcbiAqIGNhbGwsIHRoZSBzeW50aGV0aWMgYF9fY29kZXhfbWNwX2RlY2xpbmVfX2AgcmVqZWN0cyBpdCAoYW55dGhpbmcgZWxzZSBpc1xuICogdHJlYXRlZCBhcyBhIGNhbmNlbCkuIFRoZXNlIG1pcnJvciB0aGUgY29uc3RhbnRzIGluIGNvZGV4XG4gKiBgY29yZS9zcmMvbWNwX3Rvb2xfY2FsbC5yc2AuXG4gKi9cbmNvbnN0IE1DUF9UT09MX0FQUFJPVkFMX1FVRVNUSU9OX0lEX1BSRUZJWCA9ICdtY3BfdG9vbF9jYWxsX2FwcHJvdmFsXyc7XG5jb25zdCBNQ1BfVE9PTF9BUFBST1ZBTF9BTlNXRVJfQUxMT1cgPSAnQWxsb3cnO1xuY29uc3QgTUNQX1RPT0xfQVBQUk9WQUxfQU5TV0VSX0RFQ0xJTkUgPSAnX19jb2RleF9tY3BfZGVjbGluZV9fJztcblxuLyoqXG4gKiBgc3VwcG9ydGVkX2VuZHBvaW50c2AgdmFsdWUgKG9uIGEgQ29waWxvdCBDQVBJIHtAbGluayBDQ0FNb2RlbH0pIHRoYXQgbWFya3NcbiAqIGEgbW9kZWwgYXMgcmVhY2hhYmxlIHRocm91Z2ggQ0FQSSdzIE9wZW5BSS1zaGFwZWQgUmVzcG9uc2VzIGVuZHBvaW50LiBDb2RleFxuICogb25seSBkcml2ZXMgbW9kZWxzIHZpYSB0aGlzIGVuZHBvaW50ICh0aGUgYHZzY29kZS1wcm94eWAgcHJvdmlkZXIgdXNlc1xuICogYHdpcmVfYXBpPVwicmVzcG9uc2VzXCJgKSwgc28gdGhlIG1vZGVsIHBpY2tlciBpcyBmaWx0ZXJlZCB0byBtb2RlbHMgdGhhdFxuICogYWR2ZXJ0aXNlIGl0LiBDb25maXJtZWQgYWdhaW5zdCB0aGUgbGl2ZSBDQVBJIGNhdGFsb2c6IGdwdC01LnggLyBncHQtNSotY29kZXhcbiAqIC8gbWFpLWNvZGUgY2FycnkgYC9yZXNwb25zZXNgOyBBbnRocm9waWMgbW9kZWxzIGNhcnJ5IGAvdjEvbWVzc2FnZXNgIGFuZFxuICogY2hhdC1vbmx5IG1vZGVscyBjYXJyeSBgL2NoYXQvY29tcGxldGlvbnNgIChuZWl0aGVyIGlzIHVzYWJsZSBieSBjb2RleCkuXG4gKi9cbmNvbnN0IENPREVYX1JFU1BPTlNFU19FTkRQT0lOVCA9ICcvcmVzcG9uc2VzJztcbmNvbnN0IENPREVYX0NPUElMT1RfTU9ERUxfUFJPVklERVIgPSAndnNjb2RlLXByb3h5JztcbmNvbnN0IENPREVYX09QRU5BSV9NT0RFTF9QUk9WSURFUiA9ICdvcGVuYWknO1xuY29uc3QgQ09ERVhfTk9OX09WRVJSSURBQkxFX0JVSUxUX0lOX01PREVMX1BST1ZJREVSUyA9IG5ldyBTZXQoWydvcGVuYWknLCAnb2xsYW1hJywgJ2xtc3R1ZGlvJ10pO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNDb2RleE5vbk92ZXJyaWRhYmxlQnVpbHRJblByb3ZpZGVyKHByb3ZpZGVySWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gQ09ERVhfTk9OX09WRVJSSURBQkxFX0JVSUxUX0lOX01PREVMX1BST1ZJREVSUy5oYXMocHJvdmlkZXJJZC50b0xvd2VyQ2FzZSgpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvZGV4TWFuYWdlZE1vZGVsUHJvdmlkZXJFZGl0cyhwcmV2aW91czogSUNvZGV4TW9kZWxzQ29uZmlnLCBuZXh0OiBJQ29kZXhNb2RlbHNDb25maWcpOiBDb25maWdFZGl0W10ge1xuXHRjb25zdCBlZGl0czogQ29uZmlnRWRpdFtdID0gW107XG5cdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJldmlvdXMucHJvdmlkZXJzKSB7XG5cdFx0aWYgKCFpc0NvZGV4Tm9uT3ZlcnJpZGFibGVCdWlsdEluUHJvdmlkZXIocHJvdmlkZXIuaWQpICYmICFuZXh0LnByb3ZpZGVycy5zb21lKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuaWQgPT09IHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0ZWRpdHMucHVzaCh7IGtleVBhdGg6IGBtb2RlbF9wcm92aWRlcnMuJHtwcm92aWRlci5pZH1gLCB2YWx1ZTogbnVsbCwgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH0pO1xuXHRcdH1cblx0fVxuXHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIG5leHQucHJvdmlkZXJzKSB7XG5cdFx0Ly8gQ29kZXggQ29yZSBvd25zIHRoZXNlIGJ1aWx0LWlucy4gQWRkaW5nIHRoZW0gdW5kZXIgYG1vZGVsX3Byb3ZpZGVyc2Bcblx0XHQvLyBtYWtlcyB0aGUgZW50aXJlIGJhdGNoIGludmFsaWQ7IHNlbGVjdGluZyBvbmUgb25seSByZXF1aXJlcyB0aGUgdG9wLWxldmVsXG5cdFx0Ly8gYG1vZGVsX3Byb3ZpZGVyYCBhbmQgYG1vZGVsYCB2YWx1ZXMuXG5cdFx0aWYgKGlzQ29kZXhOb25PdmVycmlkYWJsZUJ1aWx0SW5Qcm92aWRlcihwcm92aWRlci5pZCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXIub2ZmaWNpYWwgJiYgcHJvdmlkZXIuYmFzZVVybC50cmltKCkgPT09ICcnKSB7XG5cdFx0XHRlZGl0cy5wdXNoKHsga2V5UGF0aDogYG1vZGVsX3Byb3ZpZGVycy4ke3Byb3ZpZGVyLmlkfWAsIHZhbHVlOiBudWxsLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgZW52S2V5ID0gcHJvdmlkZXIuYXV0aE1vZGUgPT09ICdzdG9yZWQnXG5cdFx0XHQ/IGNvZGV4UHJvdmlkZXJTdG9yZWRBcGlLZXlFbnYocHJvdmlkZXIuaWQpXG5cdFx0XHQ6IHByb3ZpZGVyLmF1dGhNb2RlID09PSAnZW52aXJvbm1lbnQnID8gcHJvdmlkZXIuZW52S2V5IDogJyc7XG5cdFx0ZWRpdHMucHVzaChcblx0XHRcdHsga2V5UGF0aDogYG1vZGVsX3Byb3ZpZGVycy4ke3Byb3ZpZGVyLmlkfS5uYW1lYCwgdmFsdWU6IHByb3ZpZGVyLm5hbWUsIG1lcmdlU3RyYXRlZ3k6ICdyZXBsYWNlJyB9LFxuXHRcdFx0eyBrZXlQYXRoOiBgbW9kZWxfcHJvdmlkZXJzLiR7cHJvdmlkZXIuaWR9LndpcmVfYXBpYCwgdmFsdWU6IHByb3ZpZGVyLndpcmVBcGksIG1lcmdlU3RyYXRlZ3k6ICdyZXBsYWNlJyB9LFxuXHRcdFx0eyBrZXlQYXRoOiBgbW9kZWxfcHJvdmlkZXJzLiR7cHJvdmlkZXIuaWR9LnJlcXVpcmVzX29wZW5haV9hdXRoYCwgdmFsdWU6IGZhbHNlLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSxcblx0XHRcdHsga2V5UGF0aDogYG1vZGVsX3Byb3ZpZGVycy4ke3Byb3ZpZGVyLmlkfS5iYXNlX3VybGAsIHZhbHVlOiBwcm92aWRlci5iYXNlVXJsID09PSAnJyA/IG51bGwgOiBwcm92aWRlci5iYXNlVXJsLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSxcblx0XHRcdHsga2V5UGF0aDogYG1vZGVsX3Byb3ZpZGVycy4ke3Byb3ZpZGVyLmlkfS5lbnZfa2V5YCwgdmFsdWU6IGVudktleSA9PT0gJycgPyBudWxsIDogZW52S2V5LCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSxcblx0XHQpO1xuXHR9XG5cdHJldHVybiBlZGl0cztcbn1cbmNvbnN0IENPREVYX01PREVMX1NFTEVDVElPTl9QUkVGSVggPSAnQHByb3ZpZGVyPSc7XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZChtb2RlbFByb3ZpZGVyOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBgJHtDT0RFWF9NT0RFTF9TRUxFQ1RJT05fUFJFRklYfSR7ZW5jb2RlVVJJQ29tcG9uZW50KG1vZGVsUHJvdmlkZXIpfToke2VuY29kZVVSSUNvbXBvbmVudChtb2RlbElkKX1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb2RleE1vZGVsU2VsZWN0aW9uKHNlbGVjdGlvbjogTW9kZWxTZWxlY3Rpb24pOiB7IHJlYWRvbmx5IG1vZGVsUHJvdmlkZXI6IHN0cmluZzsgcmVhZG9ubHkgbW9kZWxJZDogc3RyaW5nIH0ge1xuXHRpZiAoIXNlbGVjdGlvbi5pZC5zdGFydHNXaXRoKENPREVYX01PREVMX1NFTEVDVElPTl9QUkVGSVgpKSB7XG5cdFx0cmV0dXJuIHsgbW9kZWxQcm92aWRlcjogQ09ERVhfQ09QSUxPVF9NT0RFTF9QUk9WSURFUiwgbW9kZWxJZDogc2VsZWN0aW9uLmlkIH07XG5cdH1cblx0Y29uc3Qgc2VwYXJhdG9yID0gc2VsZWN0aW9uLmlkLmluZGV4T2YoJzonLCBDT0RFWF9NT0RFTF9TRUxFQ1RJT05fUFJFRklYLmxlbmd0aCk7XG5cdGlmIChzZXBhcmF0b3IgPCBDT0RFWF9NT0RFTF9TRUxFQ1RJT05fUFJFRklYLmxlbmd0aCkge1xuXHRcdHJldHVybiB7IG1vZGVsUHJvdmlkZXI6IENPREVYX0NPUElMT1RfTU9ERUxfUFJPVklERVIsIG1vZGVsSWQ6IHNlbGVjdGlvbi5pZCB9O1xuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGVsUHJvdmlkZXI6IGRlY29kZVVSSUNvbXBvbmVudChzZWxlY3Rpb24uaWQuc2xpY2UoQ09ERVhfTU9ERUxfU0VMRUNUSU9OX1BSRUZJWC5sZW5ndGgsIHNlcGFyYXRvcikpLFxuXHRcdFx0bW9kZWxJZDogZGVjb2RlVVJJQ29tcG9uZW50KHNlbGVjdGlvbi5pZC5zbGljZShzZXBhcmF0b3IgKyAxKSksXG5cdFx0fTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHsgbW9kZWxQcm92aWRlcjogQ09ERVhfQ09QSUxPVF9NT0RFTF9QUk9WSURFUiwgbW9kZWxJZDogc2VsZWN0aW9uLmlkIH07XG5cdH1cbn1cblxuLyoqXG4gKiBDb2RleCdzIEFnZW50IE1vZGUgc2NoZW1hLCBkZXJpdmVkIGZyb20gdGhlIHBsYXRmb3JtLWdlbmVyaWMgTW9kZSBzY2hlbWEgYnV0XG4gKiB3aXRoIFwiQXV0b3BpbG90XCIgcmVtb3ZlZC4gQ29kZXggaGFzIG9ubHkgdHdvIG5hdGl2ZSBjb2xsYWJvcmF0aW9uIG1vZGVzIFx1MjAxNFxuICogYHBsYW5gIGFuZCBgZGVmYXVsdGAgKHNlZSB7QGxpbmsgTW9kZUtpbmR9KSBcdTIwMTQgc28gXCJBdXRvcGlsb3RcIiB3b3VsZCBtYXAgdG9cbiAqIGBkZWZhdWx0YCwgaWRlbnRpY2FsIHRvIFwiSW50ZXJhY3RpdmVcIiwgYW5kIG9mZmVyaW5nIGl0IGluIHRoZSBwaWNrZXIgd291bGQgYmVcbiAqIGEgbm8tb3AgZHVwbGljYXRlLiBMYWJlbHMgYW5kIGRlc2NyaXB0aW9ucyBhcmUgc2xpY2VkIGJ5IGluZGV4IHNvIHRoZXkgc3RheVxuICogaW4gc3luYyB3aXRoIHRoZSBwbGF0Zm9ybSBzY2hlbWEuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUNvZGV4TW9kZVNjaGVtYSgpOiBJU2NoZW1hUHJvcGVydHk8U2Vzc2lvbk1vZGU+IHtcblx0Y29uc3QgYmFzZSA9IHBsYXRmb3JtU2Vzc2lvblNjaGVtYS5kZWZpbml0aW9uW1Nlc3Npb25Db25maWdLZXkuTW9kZV0ucHJvdG9jb2w7XG5cdGNvbnN0IGtlcHQgPSAoYmFzZS5lbnVtID8/IFtdKS5mbGF0TWFwKCh2YWx1ZSwgaW5kZXgpID0+IHZhbHVlID09PSAnYXV0b3BpbG90JyA/IFtdIDogW2luZGV4XSk7XG5cdHJldHVybiBzY2hlbWFQcm9wZXJ0eTxTZXNzaW9uTW9kZT4oe1xuXHRcdC4uLmJhc2UsXG5cdFx0ZW51bToga2VwdC5tYXAoaW5kZXggPT4gYmFzZS5lbnVtIVtpbmRleF0pLFxuXHRcdGVudW1MYWJlbHM6IGJhc2UuZW51bUxhYmVscyAmJiBrZXB0Lm1hcChpbmRleCA9PiBiYXNlLmVudW1MYWJlbHMhW2luZGV4XSksXG5cdFx0ZW51bURlc2NyaXB0aW9uczogYmFzZS5lbnVtRGVzY3JpcHRpb25zICYmIGtlcHQubWFwKGluZGV4ID0+IGJhc2UuZW51bURlc2NyaXB0aW9ucyFbaW5kZXhdKSxcblx0fSk7XG59XG5cbmNvbnN0IGNvZGV4U2Vzc2lvbkNvbmZpZ1NjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXRdOiBzY2hlbWFQcm9wZXJ0eTxDb2RleFBlcm1pc3Npb25zUHJlc2V0Pih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0JywgXCJQZXJtaXNzaW9uc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVybWlzc2lvbnNQcmVzZXREZXNjcmlwdGlvbicsIFwiSG93IG11Y2ggQ29kZXggY2FuIGRvIG9uIGl0cyBvd24gYmVmb3JlIGFza2luZyBmb3IgYXBwcm92YWwuIERlZmF1bHQgYXNrcyBiZWZvcmUgZGVsZXRpbmcgZmlsZXMsIHVzaW5nIHRoZSBpbnRlcm5ldCwgb3IgbGVhdmluZyB0aGUgd29ya3NwYWNlLlwiKSxcblx0XHRlbnVtOiBbLi4uQ09ERVhfUEVSTUlTU0lPTlNfUFJFU0VUU10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVybWlzc2lvbnNQcmVzZXQuZGVmYXVsdCcsIFwiRGVmYXVsdCBQZXJtaXNzaW9uc1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zUHJlc2V0LmF1dG9SZXZpZXcnLCBcIkF1dG8tUmV2aWV3XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVybWlzc2lvbnNQcmVzZXQuZnVsbEFjY2VzcycsIFwiRnVsbCBBY2Nlc3NcIiksXG5cdFx0XSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldC5kZWZhdWx0RGVzY3JpcHRpb24nLCBcIkNvZGV4IGNhbiByZWFkIGFuZCBlZGl0IGZpbGVzIGluIHRoZSB3b3Jrc3BhY2UgYW5kIHJ1biByb3V0aW5lIGxvY2FsIGNvbW1hbmRzLiBJdCBhc2tzIGJlZm9yZSBkZWxldGluZyBmaWxlcywgdXNpbmcgdGhlIGludGVybmV0LCBvciBnb2luZyBiZXlvbmQgdGhlIHdvcmtzcGFjZS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldC5hdXRvUmV2aWV3RGVzY3JpcHRpb24nLCBcIlNhbWUgd29ya3NwYWNlIGFjY2VzcyBhcyBEZWZhdWx0LCBidXQgYXBwcm92YWwgcmVxdWVzdHMgYXJlIHJvdXRlZCB0aHJvdWdoIHRoZSBhdXRvLXJldmlld2VyIGluc3RlYWQgb2YgcHJvbXB0aW5nIHlvdS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uc1ByZXNldC5mdWxsQWNjZXNzRGVzY3JpcHRpb24nLCBcIkNvZGV4IGNhbiBlZGl0IG9yIGRlbGV0ZSBmaWxlcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2UgYW5kIHVzZSB0aGUgaW50ZXJuZXQgd2l0aG91dCBhc2tpbmcuIFVzZSBvbmx5IHdoZW4geW91IHdhbnQgZnVsbCBtYWNoaW5lIGFjY2Vzcy5cIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiBDT0RFWF9ERUZBVUxUX1BFUk1JU1NJT05TX1BSRVNFVCxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuQXBwcm92YWxQb2xpY3ldOiBzY2hlbWFQcm9wZXJ0eTxDb2RleEFwcHJvdmFsUG9saWN5Pih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5JywgXCJBcHByb3ZhbHNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5RGVzY3JpcHRpb24nLCBcIkhvdyBDb2RleCByZXF1ZXN0cyBhcHByb3ZhbCBmb3IgdG9vbCBjYWxscy5cIiksXG5cdFx0ZW51bTogWyduZXZlcicsICdvbi1yZXF1ZXN0JywgJ3VudHJ1c3RlZCddLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5Lm5ldmVyJywgXCJObyBFc2NhbGF0aW9uc1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5Lm9uUmVxdWVzdCcsIFwiQXNrIFdoZW4gTmVlZGVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYXBwcm92YWxQb2xpY3kudW50cnVzdGVkJywgXCJBc2sgTW9yZSBPZnRlblwiKSxcblx0XHRdLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5Lm5ldmVyRGVzY3JpcHRpb24nLCBcIk5ldmVyIGFzayBmb3IgZWxldmF0ZWQgcGVybWlzc2lvbjsgY29tbWFuZHMgdGhhdCBjYW5ub3QgcnVuIGluIHRoZSBzYW5kYm94IGFyZSByZWplY3RlZC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5hcHByb3ZhbFBvbGljeS5vblJlcXVlc3REZXNjcmlwdGlvbicsIFwiQXNrIG9ubHkgd2hlbiBDb2RleCBkZXRlcm1pbmVzIGEgY29tbWFuZCBuZWVkcyBlbGV2YXRlZCBwZXJtaXNzaW9uLlwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFwcHJvdmFsUG9saWN5LnVudHJ1c3RlZERlc2NyaXB0aW9uJywgXCJBc2sgYmVmb3JlIG1vcmUgY29tbWFuZCBjYXRlZ29yaWVzIHNvIHlvdSBjYW4gcmV2aWV3IGFjdGlvbnMgbW9yZSBjbG9zZWx5LlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdvbi1yZXF1ZXN0Jyxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuU2FuZGJveE1vZGVdOiBzY2hlbWFQcm9wZXJ0eTxTYW5kYm94TW9kZT4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZScsIFwiU2FuZGJveFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuc2FuZGJveE1vZGVEZXNjcmlwdGlvbicsIFwiRmlsZXN5c3RlbSBhbmQgbmV0d29yayByZXN0cmljdGlvbnMgYXBwbGllZCB0byB0b29sIGNhbGxzLlwiKSxcblx0XHRlbnVtOiBbJ3JlYWQtb25seScsICd3b3Jrc3BhY2Utd3JpdGUnLCAnZGFuZ2VyLWZ1bGwtYWNjZXNzJ10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuc2FuZGJveE1vZGUucmVhZE9ubHknLCBcIlJlYWQtT25seVwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnNhbmRib3hNb2RlLndvcmtzcGFjZVdyaXRlJywgXCJXb3Jrc3BhY2UgV3JpdGVcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZS5kYW5nZXJGdWxsQWNjZXNzJywgXCJGdWxsIEFjY2VzcyAoRGFuZ2Vyb3VzKVwiKSxcblx0XHRdLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnNhbmRib3hNb2RlLnJlYWRPbmx5RGVzY3JpcHRpb24nLCBcIlRvb2wgY2FsbHMgY2FuIHJlYWQgdGhlIHdvcmtzcGFjZSBidXQgY2Fubm90IG1vZGlmeSBmaWxlcy5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5zYW5kYm94TW9kZS53b3Jrc3BhY2VXcml0ZURlc2NyaXB0aW9uJywgXCJUb29sIGNhbGxzIGNhbiByZWFkIGFuZCB3cml0ZSB3aXRoaW4gdGhlIHdvcmtzcGFjZTsgbmV0d29yayBpcyBjb250cm9sbGVkIHNlcGFyYXRlbHkuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuc2FuZGJveE1vZGUuZGFuZ2VyRnVsbEFjY2Vzc0Rlc2NyaXB0aW9uJywgXCJUb29sIGNhbGxzIGhhdmUgdW5yZXN0cmljdGVkIGRpc2sgYW5kIG5ldHdvcmsgYWNjZXNzLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICd3b3Jrc3BhY2Utd3JpdGUnLFxuXHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHR9KSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5XZWJTZWFyY2hNb2RlXTogc2NoZW1hUHJvcGVydHk8V2ViU2VhcmNoTW9kZT4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy53ZWJTZWFyY2hNb2RlJywgXCJXZWIgU2VhcmNoXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy53ZWJTZWFyY2hNb2RlRGVzY3JpcHRpb24nLCBcIldlYi1zZWFyY2ggdG9vbCBhdmFpbGFiaWxpdHkgZm9yIHRoZSBtb2RlbC5cIiksXG5cdFx0ZW51bTogWydkaXNhYmxlZCcsICdjYWNoZWQnLCAnbGl2ZSddLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLndlYlNlYXJjaE1vZGUuZGlzYWJsZWQnLCBcIkRpc2FibGVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcud2ViU2VhcmNoTW9kZS5jYWNoZWQnLCBcIkNhY2hlZCBPbmx5XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcud2ViU2VhcmNoTW9kZS5saXZlJywgXCJMaXZlXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2Rpc2FibGVkJyxcblx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdH0pLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5Lk1vZGVsUmVhc29uaW5nRWZmb3J0XTogc2NoZW1hUHJvcGVydHk8UmVhc29uaW5nRWZmb3J0Pih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLm1vZGVsUmVhc29uaW5nRWZmb3J0JywgXCJSZWFzb25pbmcgRWZmb3J0XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5tb2RlbFJlYXNvbmluZ0VmZm9ydERlc2NyaXB0aW9uJywgXCJDb250cm9scyBob3cgbXVjaCByZWFzb25pbmcgZWZmb3J0IENvZGV4IHVzZXMuXCIpLFxuXHRcdGVudW06IFsuLi5DT0RFWF9SRUFTT05JTkdfRUZGT1JUU10sXG5cdFx0ZW51bUxhYmVsczogQ09ERVhfUkVBU09OSU5HX0VGRk9SVFMubWFwKGdldFJlYXNvbmluZ0VmZm9ydExhYmVsKSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBDT0RFWF9SRUFTT05JTkdfRUZGT1JUUy5tYXAoZWZmb3J0ID0+IGdldFJlYXNvbmluZ0VmZm9ydERlc2NyaXB0aW9uKGVmZm9ydCkgPz8gJycpLFxuXHRcdGRlZmF1bHQ6ICdtZWRpdW0nLFxuXHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHR9KSxcblx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06IGNyZWF0ZUNvZGV4TW9kZVNjaGVtYSgpLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcnNvbmFsaXR5XTogc2NoZW1hUHJvcGVydHk8UGVyc29uYWxpdHk+KHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHknLCBcIlBlcnNvbmFsaXR5XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5wZXJzb25hbGl0eURlc2NyaXB0aW9uJywgXCJUb25lIENvZGV4IHVzZXMgd2hlbiBjb21tdW5pY2F0aW5nLlwiKSxcblx0XHRlbnVtOiBbJ25vbmUnLCAnZnJpZW5kbHknLCAncHJhZ21hdGljJ10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkubm9uZScsIFwiRGVmYXVsdFwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcnNvbmFsaXR5LmZyaWVuZGx5JywgXCJGcmllbmRseVwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnBlcnNvbmFsaXR5LnByYWdtYXRpYycsIFwiUHJhZ21hdGljXCIpLFxuXHRcdF0sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkubm9uZURlc2NyaXB0aW9uJywgXCJVc2UgQ29kZXgncyBidWlsdC1pbiBkZWZhdWx0IHRvbmUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkuZnJpZW5kbHlEZXNjcmlwdGlvbicsIFwiV2FybWVyLCBtb3JlIGNvbnZlcnNhdGlvbmFsIHRvbmUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucGVyc29uYWxpdHkucHJhZ21hdGljRGVzY3JpcHRpb24nLCBcIlRlcnNlLCBuby1ub25zZW5zZSB0b25lIGZvY3VzZWQgb24gYWN0aW9ucy5cIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnbm9uZScsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlJlYXNvbmluZ1N1bW1hcnldOiBzY2hlbWFQcm9wZXJ0eTxSZWFzb25pbmdTdW1tYXJ5Pih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnJlYXNvbmluZ1N1bW1hcnknLCBcIlJlYXNvbmluZyBTdW1tYXJ5XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5yZWFzb25pbmdTdW1tYXJ5RGVzY3JpcHRpb24nLCBcIkhvdyBDb2RleCBzdW1tYXJpemVzIGl0cyByZWFzb25pbmcgaW4gdGhlIHJlc3BvbnNlIHN0cmVhbS5cIiksXG5cdFx0ZW51bTogWydhdXRvJywgJ2NvbmNpc2UnLCAnZGV0YWlsZWQnLCAnbm9uZSddLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnJlYXNvbmluZ1N1bW1hcnkuYXV0bycsIFwiQXV0b1wiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnJlYXNvbmluZ1N1bW1hcnkuY29uY2lzZScsIFwiQ29uY2lzZVwiKSxcblx0XHRcdGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLnJlYXNvbmluZ1N1bW1hcnkuZGV0YWlsZWQnLCBcIkRldGFpbGVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcucmVhc29uaW5nU3VtbWFyeS5ub25lJywgXCJOb25lXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2F1dG8nLFxuXHRcdHNlc3Npb25NdXRhYmxlOiB0cnVlLFxuXHR9KSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXNdOiBzY2hlbWFQcm9wZXJ0eTxzdHJpbmdbXT4oe1xuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFkZGl0aW9uYWxEaXJlY3RvcmllcycsIFwiQWRkaXRpb25hbCBXcml0YWJsZSBEaXJlY3Rvcmllc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcuYWRkaXRpb25hbERpcmVjdG9yaWVzRGVzY3JpcHRpb24nLCBcIkFic29sdXRlIHBhdGhzIHRoZSBzYW5kYm94IGlzIGFsbG93ZWQgdG8gd3JpdGUgdG8sIGluIGFkZGl0aW9uIHRvIHRoZSB3b3Jrc3BhY2UuIE9ubHkgYXBwbGllcyB3aGVuIFNhbmRib3ggaXMgV29ya3NwYWNlIFdyaXRlLlwiKSxcblx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6IGxvY2FsaXplKCdjb2RleC5zZXNzaW9uQ29uZmlnLmFkZGl0aW9uYWxEaXJlY3Rvcmllcy5pdGVtJywgXCJEaXJlY3RvcnlcIikgfSxcblx0XHRlbnVtRHluYW1pYzogdHJ1ZSxcblx0XHRkZWZhdWx0OiBbXSxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2Vzc2lvbkNvbmZpZy5uZXR3b3JrQWNjZXNzRW5hYmxlZCcsIFwiTmV0d29ya1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvZGV4LnNlc3Npb25Db25maWcubmV0d29ya0FjY2Vzc0VuYWJsZWREZXNjcmlwdGlvbicsIFwiQWxsb3cgc2FuZGJveGVkIHRvb2wgY2FsbHMgdG8gbWFrZSBvdXRib3VuZCBuZXR3b3JrIHJlcXVlc3RzLiBPbmx5IGFwcGxpZXMgd2hlbiBTYW5kYm94IGlzIFdvcmtzcGFjZSBXcml0ZS5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogcGxhdGZvcm1TZXNzaW9uU2NoZW1hLmRlZmluaXRpb25bU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10sXG59KTtcblxuY29uc3QgY29kZXhWaXNpYmxlU2Vzc2lvbkNvbmZpZ1NjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiBjb2RleFNlc3Npb25Db25maWdTY2hlbWEuZGVmaW5pdGlvbltTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XTogY29kZXhTZXNzaW9uQ29uZmlnU2NoZW1hLmRlZmluaXRpb25bQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zUHJlc2V0XSxcblx0W1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdOiBwbGF0Zm9ybVNlc3Npb25TY2hlbWEuZGVmaW5pdGlvbltTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXSxcbn0pO1xuXG5pbnRlcmZhY2UgSUNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzIHtcblx0cmVhZG9ubHkgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06IENvZGV4UGVybWlzc2lvbnNQcmVzZXQ7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuQXBwcm92YWxQb2xpY3ldOiBDb2RleEFwcHJvdmFsUG9saWN5O1xuXHRyZWFkb25seSBbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTogU2FuZGJveE1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV06IFdlYlNlYXJjaE1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuTW9kZWxSZWFzb25pbmdFZmZvcnRdOiBSZWFzb25pbmdFZmZvcnQ7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuQWRkaXRpb25hbERpcmVjdG9yaWVzXTogc3RyaW5nW107XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdOiBib29sZWFuO1xuXHRyZWFkb25seSBbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogU2Vzc2lvbk1vZGU7XG5cdHJlYWRvbmx5IFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVyc29uYWxpdHldOiBQZXJzb25hbGl0eTtcblx0cmVhZG9ubHkgW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTogUmVhc29uaW5nU3VtbWFyeTtcbn1cblxuY29uc3QgY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHM6IElDb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyA9IHtcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc1ByZXNldF06IENPREVYX0RFRkFVTFRfUEVSTUlTU0lPTlNfUFJFU0VULFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LkFwcHJvdmFsUG9saWN5XTogJ29uLXJlcXVlc3QnLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlNhbmRib3hNb2RlXTogJ3dvcmtzcGFjZS13cml0ZScsXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV06ICdkaXNhYmxlZCcsXG5cdFtDb2RleFNlc3Npb25Db25maWdLZXkuTW9kZWxSZWFzb25pbmdFZmZvcnRdOiAnbWVkaXVtJyxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5BZGRpdGlvbmFsRGlyZWN0b3JpZXNdOiBbXSxcblx0W0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5OZXR3b3JrQWNjZXNzRW5hYmxlZF06IHRydWUsXG5cdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAnaW50ZXJhY3RpdmUnLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlBlcnNvbmFsaXR5XTogJ25vbmUnLFxuXHRbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LlJlYXNvbmluZ1N1bW1hcnldOiAnYXV0bycsXG59O1xuXG5mdW5jdGlvbiBkaXN0aW5jdEFic29sdXRlUGF0aHMocGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZShwYXRoKTtcblx0XHRjb25zdCBrZXkgPSBmaWxlc3lzdGVtUGF0aENvbXBhcmlzb25LZXkobm9ybWFsaXplZCk7XG5cdFx0aWYgKGtleSAmJiAhc2Vlbi5oYXMoa2V5KSkge1xuXHRcdFx0c2Vlbi5hZGQoa2V5KTtcblx0XHRcdHJlc3VsdC5wdXNoKG5vcm1hbGl6ZWQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBkaXN0aW5jdFdvcmtpbmdEaXJlY3RvcmllcyhkaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZGlyZWN0b3JpZXMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBkaXJlY3Rvcmllcykge1xuXHRcdGNvbnN0IHBhdGggPSBub3JtYWxpemUoZGlyZWN0b3J5LmZzUGF0aCk7XG5cdFx0Y29uc3Qga2V5ID0gZmlsZXN5c3RlbVBhdGhDb21wYXJpc29uS2V5KHBhdGgpO1xuXHRcdGlmIChrZXkgJiYgIXNlZW4uaGFzKGtleSkpIHtcblx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRyZXN1bHQucHVzaChkaXJlY3RvcnkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0Lmxlbmd0aCA+IDAgPyByZXN1bHQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGZpbGVzeXN0ZW1QYXRoQ29tcGFyaXNvbktleShwYXRoOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIWlzQWJzb2x1dGUocGF0aCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc291cmNlID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UucmVtb3ZlVHJhaWxpbmdQYXRoU2VwYXJhdG9yKFVSSS5maWxlKHBhdGgpKTtcblx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmdldENvbXBhcmlzb25LZXkocmVzb3VyY2UpO1xufVxuXG5jb25zdCBDb2RleFByZXdhcm1UdGxNcyA9IDYwXzAwMDtcblxuLyoqXG4gKiBQZXItc2Vzc2lvbiBib29ra2VlcGluZy4gVGhlIGNvZGV4IHRocmVhZCBpcyBvd25lZCBieSB0aGUgc2hhcmVkXG4gKiBjb25uZWN0aW9uIGluIHtAbGluayBDb2RleEFnZW50fTsgdGhpcyBzdHJ1Y3Qgb25seSB0cmFja3Mgd2hhdCB0aGVcbiAqIGBJQWdlbnRgIHN1cmZhY2UgbmVlZHMuXG4gKi9cbi8qKiBSZXNvbHZlZCB1c2VyLWlucHV0IGFuc3dlciBjYXB0dXJlZCBmcm9tIHRoZSBjbGllbnQncyBgY2hhdC9pbnB1dENvbXBsZXRlZGAuICovXG5pbnRlcmZhY2UgSUNvZGV4VXNlcklucHV0UmVzdWx0IHtcblx0cmVhZG9ubHkgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDtcblx0cmVhZG9ubHkgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj47XG59XG5cbi8qKlxuICogVGhlIGV4YWN0IGNoYXQgYSBDb2RleCBydW50aW1lIGlzIGJvdW5kIHRvLlxuICovXG5pbnRlcmZhY2UgSUNvZGV4VGFyZ2V0Q2hhdCB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG59XG5cbmludGVyZmFjZSBJQ29kZXhTZXNzaW9uIHtcblx0LyoqIENhbGxlci1mYWNpbmcgc2Vzc2lvbiBpZCB1c2VkIGluIHRoZSBgY29kZXg6LzxpZD5gIFVSSTsgbWF5IGRpZmZlciBmcm9tIHRoZSBjb2RleCB0aHJlYWQgaWQuICovXG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHQvKipcblx0ICogQ29kZXggYXBwLXNlcnZlciB0aHJlYWQgaWQgdXNlZCBpbiBKU09OLVJQQyBgdGhyZWFkLypgIGFuZCBgdHVybi8qYCBjYWxscy5cblx0ICogVW5kZWZpbmVkIHVudGlsIHRoZSBydW50aW1lIGhhcyBiZWVuIG1hdGVyaWFsaXplZCAoZmlyc3QgYHNlbmRNZXNzYWdlYFxuXHQgKiB0cmlnZ2VycyBgdGhyZWFkL3N0YXJ0YCkuIERlY291cGxpbmcgbWF0ZXJpYWxpemF0aW9uIGZyb21cblx0ICoge0BsaW5rIElBZ2VudENoYXRzLmNyZWF0ZUNoYXR9IG1pcnJvcnMgdGhlIENsYXVkZSBoYXJuZXNzJ3Ncblx0ICogcHJvdmlzaW9uYWwvbWF0ZXJpYWxpemUgc3BsaXQgYW5kIGF2b2lkcyBzcGF3bmluZyBhbiBvcnBoYW4gY29kZXggdGhyZWFkXG5cdCAqIHdoZW4gdGhlIHdvcmtiZW5jaCByZWJpbmRzIGEgcHJvdmlzaW9uYWwgVVJJIGFmdGVyIGEgY2hpcC1zZWxlY3Rpb24uXG5cdCAqL1xuXHR0aHJlYWRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhpcyBydW50aW1lJ3Mgb3duIGFkZHJlc3MsIGFuZCB0aGUgc2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgcmVhY2hpbmdcblx0ICogaXQ6IGBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSlgIGlzIGFsd2F5cyB0aGUge0BsaW5rIENvZGV4QWdlbnR9XG5cdCAqIGBfc2Vzc2lvbnNgIGtleSB0aGlzIGVudHJ5IGlzIHJlZ2lzdGVyZWQgdW5kZXIuIEV2ZXJ5IHBhdGggdGhhdCBzdGFydHNcblx0ICogZnJvbSBhbiBlbnRyeSBhbmQgZW5kcyBpbiBhIG1hcCByZWFkIFx1MjAxNCBmaXJpbmcgYW4gYWN0aW9uLCB0ZWFyaW5nIHRoZVxuXHQgKiBydW50aW1lIGRvd24sIHJlYWRpbmcgaXRzIHBlcnNpc3RlZCBvdmVybGF5IFx1MjAxNCByb3VuZC10cmlwcyB0aHJvdWdoIGl0LCBzb1xuXHQgKiBzdGFtcGluZyBhbiBlbnRyeSB3aXRoIGEgZGlmZmVyZW50IHNlc3Npb24ncyBVUkkgKGUuZy4gdGhlIGhvc3Qgc2Vzc2lvblxuXHQgKiB0aGF0IG93bnMgYSByZS1rZXllZCBjaGF0KSBzaWxlbnRseSB1bmFkZHJlc3NlcyB0aGUgcnVudGltZS4gQ29uc3RydWN0aW9uXG5cdCAqIGRlcml2ZXMgaXQgZnJvbSB7QGxpbmsgc2Vzc2lvbklkfSBzbyB0aGF0IGNhbm5vdCBoYXBwZW4uXG5cdCAqL1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdC8qKlxuXHQgKiBXaGVuIHRoaXMgY29udmVyc2F0aW9uIGJlZ2FuIGFuZCB3aGVuIGl0IGxhc3Qgc2F3IGFjdGl2aXR5LCBpbiBlcG9jaCBtcy5cblx0ICogQW5zd2VycyB7QGxpbmsgQ29kZXhBZ2VudC5nZXRDaGF0TWV0YWRhdGF9IGZvciBhIGxpdmUgcnVudGltZSB3aXRob3V0XG5cdCAqIGFuIGFwcC1zZXJ2ZXIgcm91bmQgdHJpcCwgc28gYm90aCBtdXN0IGJlIHJlYWwgY2xvY2sgdmFsdWVzOiBgMGAgd291bGRcblx0ICogZGF0ZSBldmVyeSBsaXZlIHNlc3Npb24gdG8gMTk3MCBhbmQgc2lsZW50bHkgaW52ZXJ0IHRoZSBob3N0J3Ncblx0ICogY3JlYXRlZC1iZWZvcmUgLyBjcmVhdGVkLWFmdGVyIHNlc3Npb24gZmlsdGVycy4gU2VlZGVkIGF0IGNvbnN0cnVjdGlvblxuXHQgKiBhbmQgcmVwbGFjZWQgd2l0aCB0aGUgYmFja2luZyB0aHJlYWQncyBvd24gdGltZXN0YW1wcyB3aGVuIGEgcmVzdG9yZVxuXHQgKiByZWFkcyB0aGVtLlxuXHQgKi9cblx0c3RhcnRUaW1lOiBudW1iZXI7XG5cdG1vZGlmaWVkVGltZTogbnVtYmVyO1xuXHQvKipcblx0ICogTGFzdCBzdW1tYXJ5IHJlYWQgZnJvbSB0aGUgYmFja2luZyBDb2RleCB0aHJlYWQuIEEgY29sZCBtZXRhZGF0YSBsb29rdXBcblx0ICogaHlkcmF0ZXMgYSBsaXZlIHJ1bnRpbWUsIGFuZCBldmVyeSBsYXRlciBsb29rdXAgbXVzdCBwcmVzZXJ2ZSB0aGF0IHRpdGxlXG5cdCAqIHdoaWxlIGFuc3dlcmluZyBmcm9tIG1lbW9yeTsgZHJvcHBpbmcgaXQgbWFrZXMgQWdlbnQgSG9zdCByZXBsYWNlIGFuXG5cdCAqIGV4aXN0aW5nIHNlc3Npb24gdGl0bGUgd2l0aCBpdHMgZ2VuZXJpYyBcIlNlc3Npb25cIiBmYWxsYmFjay5cblx0ICovXG5cdHN1bW1hcnk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIENvbmNyZXRlIGhvc3QgY2hhdCBVUkkgb25jZSBib3VuZDsgdW5kZWZpbmVkIG9ubHkgZm9yIGRpcmVjdCBjcmVhdGUvZm9yayBiZWZvcmUgQUggYmluZHMgaXQuICovXG5cdGNoYXRDaGFubmVsOiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBFZmZlY3RpdmUgd29ya2luZyBkaXJlY3RvcnkuIFN0YXJ0cyBhcyB0aGUgZm9sZGVyIEFnZW50IEhvc3QgcmVzb2x2ZWQgZm9yXG5cdCAqIHtAbGluayBJQWdlbnRDaGF0cy5jcmVhdGVDaGF0fTsgYXQgZmlyc3QgbWF0ZXJpYWxpemF0aW9uIGl0IGlzXG5cdCAqIHJlcGxhY2VkIHdpdGggdGhlIGhvc3QtcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkgKHRoZSBpc29sYXRlZCB3b3JrdHJlZVxuXHQgKiBmb3Igd29ya3RyZWUtaXNvbGF0aW9uIHNlc3Npb25zKSBiZWZvcmUgYHRocmVhZC9zdGFydGAgbG9ja3MgdGhlIGNvZGV4XG5cdCAqIHN1YnByb2Nlc3MgYGN3ZGAuIFdoZW4gdGhlIGNsaWVudCBzdXBwbGllcyBub25lIChlLmcuIGFuIGVkaXRvciB3aW5kb3dcblx0ICogd2l0aCBubyB3b3Jrc3BhY2UgZm9sZGVyIG9wZW4pLCBhIG1hbmFnZWQgdGVtcCBmb2xkZXIgaXMgbGF6aWx5IGNyZWF0ZWRcblx0ICogYXMgYSBmYWxsYmFjayBhdCBtYXRlcmlhbGl6ZSB0aW1lICh0cmFja2VkIGJ5XG5cdCAqIHtAbGluayBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeX0gZm9yIGNsZWFudXApLiBNdXRhYmxlIHNvIGJvdGggdGhlXG5cdCAqIHdvcmt0cmVlIHN3YXAgYW5kIHRoZSBsYXp5IGFzc2lnbm1lbnQgY2FuIGhhcHBlbiBhZnRlciBhIHByb3Zpc2lvbmFsXG5cdCAqIGNyZWF0aW9uLlxuXHQgKi9cblx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhlIGN1cnJlbnQgZnVsbCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgKGluZGV4IDAgPSB0aGUgcHJvY2VzcyByb290LFxuXHQgKiBtaXJyb3JlZCBpbiB7QGxpbmsgd29ya2luZ0RpcmVjdG9yeX07IHRoZSB0YWlsIGNhcnJpZXMgYWRkaXRpb25hbCBzZXNzaW9uXG5cdCAqIHJvb3RzKS4gV29ya3NwYWNlLWZvbGRlciByZWNvbmNpbGlhdGlvbiBjYW4gcmVwbGFjZSB0aGUgdGFpbCBiZWZvcmUgYVxuXHQgKiB0dXJuOyBgdHVybi9zdGFydC5ydW50aW1lV29ya3NwYWNlUm9vdHNgIGFwcGxpZXMgdGhlIGxhdGVzdCBzZXQgdG8gdGhlXG5cdCAqIGV4aXN0aW5nIHRocmVhZC5cblx0ICovXG5cdHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdO1xuXHRyZWFkb25seSBtdWx0aVJvb3RFbmFibGVkOiBib29sZWFuO1xuXHQvKipcblx0ICogU2V0IHRvIHRoZSB0ZW1wIGZvbGRlciBjcmVhdGVkIGZvciB0aGlzIHNlc3Npb24gd2hlbiBubyB3b3JraW5nXG5cdCAqIGRpcmVjdG9yeSB3YXMgc3VwcGxpZWQsIHNvIHRoZSBjaGF0LWRpc3Bvc2UgcmVmLXRyYWNraW5nIHJlY2xhaW1cblx0ICogKHNlZSB7QGxpbmsgQ29kZXhBZ2VudC5fcmVjbGFpbU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5SWZOb3RMaXZlfSkgY2FuXG5cdCAqIHJlbW92ZSBpdC4gYHVuZGVmaW5lZGAgd2hlbiB0aGUgY2xpZW50IHN1cHBsaWVkIGEgd29ya2luZyBkaXJlY3RvcnkuXG5cdCAqL1xuXHRtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtYXBTdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlO1xuXHQvKipcblx0ICogUGhhc2UgNDogcGFya2VkIGRlZmVycmVkcyBmb3IgYGl0ZW0vY29tbWFuZEV4ZWN1dGlvbi9yZXF1ZXN0QXBwcm92YWxgLFxuXHQgKiBrZXllZCBieSB0aGUgaG9zdC1zaWRlIHRvb2xDYWxsSWQuIFJlc29sdmVkIGJ5XG5cdCAqIHtAbGluayBDb2RleEFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0fS5cblx0ICovXG5cdHJlYWRvbmx5IHBlbmRpbmdDb21tYW5kQXBwcm92YWxzOiBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uPjtcblx0LyoqXG5cdCAqIFBlci1zZXNzaW9uIHNldCBvZiBcImFjY2VwdCBmb3Igc2Vzc2lvblwiIGRlY2lzaW9ucy4gV2hlbiB0aGUgdXNlclxuXHQgKiBwaWNrcyBBY2NlcHQtZm9yLVNlc3Npb24gaW4gYSBwcmV2aW91cyBhcHByb3ZhbCwgc3Vic2VxdWVudFxuXHQgKiBhcHByb3ZhbCByZXF1ZXN0cyBvbiB0aGUgc2FtZSBzZXNzaW9uIHJlc29sdmUgYXV0b21hdGljYWxseS5cblx0ICovXG5cdHJlYWRvbmx5IGFjY2VwdGVkRm9yU2Vzc2lvbjogU2V0PHN0cmluZz47XG5cdC8qKlxuXHQgKiBHdWFyZGlhbiAoYXV0by1yZXZpZXcpIGByZXZpZXdJZGBzIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW4gc3VyZmFjZWQgdG9cblx0ICogdGhlIHVzZXIgYXMgYSBkZW5pZWQtYWN0aW9uIGFwcHJvdmFsIGNhcmQuIEd1YXJkcyBhZ2FpbnN0IGFjdGluZyB0d2ljZVxuXHQgKiBvbiB0aGUgc2FtZSByZXZpZXcgaWYgdGhlIGNvbXBsZXRlZCBub3RpZmljYXRpb24gaXMgcmVkZWxpdmVyZWQuXG5cdCAqL1xuXHRyZWFkb25seSBoYW5kbGVkR3VhcmRpYW5SZXZpZXdzOiBTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIEhvc3Qtc2lkZSB0b29sQ2FsbElkcyBvZiB0aGUgc3ludGhldGljIFwiQXBwcm92ZSBhbnl3YXlcIiBjYXJkcyBjcmVhdGVkIGZvclxuXHQgKiBndWFyZGlhbiAoYXV0by1yZXZpZXcpIGRlbmlhbHMgdGhhdCBhcmUgc3RpbGwgYXdhaXRpbmcgYSB1c2VyIGRlY2lzaW9uLlxuXHQgKiBVbmxpa2UgY29kZXgncyBibG9ja2luZyBjb21tYW5kIGFwcHJvdmFscywgdGhlc2UgY2FyZHMgbGl2ZSBpbnNpZGUgdGhlXG5cdCAqIGFjdGl2ZSB0dXJuIGJ1dCBjb2RleCBkb2VzICpub3QqIHdhaXQgb24gdGhlbSBcdTIwMTQgc28gd2hlbiB0aGUgdHVybiBlbmRzXG5cdCAqIChvZnRlbiB2aWEgdGhlIGF1dG8tcmV2aWV3IGNpcmN1aXQtYnJlYWtlciBpbnRlcnJ1cHQpIHRoZSByZWR1Y2VyIGNhbmNlbHNcblx0ICogdGhlIGNhcmQuIFdlIHVzZSB0aGlzIHNldCB0byB1bndpbmQgdGhlIHBhcmtlZCBkZWZlcnJlZCBvbiB0dXJuIGVuZCBzbyB0aGVcblx0ICogc3VzcGVuZGVkIHtAbGluayBDb2RleEFnZW50Ll9oYW5kbGVHdWFyZGlhblJldmlld0NvbXBsZXRlZH0gZnJhbWUgZG9lc24ndFxuXHQgKiBsZWFrLlxuXHQgKi9cblx0cmVhZG9ubHkgcGVuZGluZ0d1YXJkaWFuUmV2aWV3Q2FyZHM6IFNldDxzdHJpbmc+O1xuXHQvKipcblx0ICogU3RlZXJpbmcgbWVzc2FnZXMgaGFuZGVkIHRvIGNvZGV4IHZpYSBgdHVybi9zdGVlcmAgdGhhdCBhcmUgYXdhaXRpbmdcblx0ICogdGhlIG1hdGNoaW5nIGB1c2VyTWVzc2FnZWAgaXRlbSBlY2hvLCB3aGljaCBwcm9tb3RlcyB0aGVtIGludG8gdGhlaXJcblx0ICogb3duIHZpc2libGUgdHVybi4gS2V5ZWQgYnkge0BsaW5rIFBlbmRpbmdNZXNzYWdlLmlkfS4gRHJhaW5lZCAod2l0aCBhXG5cdCAqIGBzdGVlcmluZ19jb25zdW1lZGAgc2lnbmFsKSBvbiB0dXJuIGNvbXBsZXRpb24sIGFib3J0LCBkaXNwb3NlLCBvciBhXG5cdCAqIGB0dXJuL3N0ZWVyYCByZWplY3Rpb24gc28gdGhlIGNoYXQgVUkncyBwZW5kaW5nIGJ1YmJsZSBuZXZlciBzdGlja3MuXG5cdCAqL1xuXHRyZWFkb25seSBwZW5kaW5nU3RlZXJpbmdGbGlwczogTWFwPHN0cmluZywgUGVuZGluZ01lc3NhZ2U+O1xuXHQvKipcblx0ICogQ2xpZW50LXByb3ZpZGVkIHRvb2wgZGVmaW5pdGlvbnMgZm9yIHRoaXMgc2Vzc2lvbiwga2V5ZWQgYnkgdGhlXG5cdCAqIGNvbnRyaWJ1dGluZyB3b3JrYmVuY2ggY2xpZW50LiBUaGUgbWVyZ2VkIHNldCBpcyByZWdpc3RlcmVkIHdpdGggY29kZXhcblx0ICogYXMgYGR5bmFtaWNUb29sc2AgYXQgYHRocmVhZC9zdGFydGAuIEVtcHR5IHVudGlsIHRoZSBmaXJzdCBhY3RpdmUgY2xpZW50XG5cdCAqIHNldHMgaXRzIHRvb2xzLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xpZW50VG9vbFNldDogQWN0aXZlQ2xpZW50VG9vbFNldDtcblx0LyoqXG5cdCAqIFBhcmtlZCBkZWZlcnJlZHMgZm9yIGluLWZsaWdodCBjbGllbnQtdG9vbCBjYWxscyAoY29kZXhcblx0ICogYGl0ZW0vdG9vbC9jYWxsYCksIGtleWVkIGJ5IHRoZSBob3N0LXNpZGUgdG9vbENhbGxJZC4gUmVzb2x2ZWQgYnlcblx0ICoge0BsaW5rIENvZGV4QWdlbnQub25DbGllbnRUb29sQ2FsbENvbXBsZXRlfS5cblx0ICovXG5cdHJlYWRvbmx5IHBlbmRpbmdDbGllbnRUb29sQ2FsbHM6IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8VG9vbENhbGxSZXN1bHQ+O1xuXHQvKipcblx0ICogUGFya2VkIGRlZmVycmVkcyBmb3IgaW4tZmxpZ2h0IHVzZXItaW5wdXQgcmVxdWVzdHMgKGNvZGV4XG5cdCAqIGBpdGVtL3Rvb2wvcmVxdWVzdFVzZXJJbnB1dGAsIGkuZS4gdGhlIG1vZGVsJ3MgYGFza191c2VyYCksIGtleWVkIGJ5IGFcblx0ICogaG9zdC1nZW5lcmF0ZWQgcmVxdWVzdElkLiBSZXNvbHZlZCBieVxuXHQgKiB7QGxpbmsgQ29kZXhBZ2VudC5yZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0fS5cblx0ICovXG5cdHJlYWRvbmx5IHBlbmRpbmdVc2VySW5wdXRzOiBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PElDb2RleFVzZXJJbnB1dFJlc3VsdD47XG5cdC8qKlxuXHQgKiBTaWduYXR1cmUgb2YgdGhlIHtAbGluayBjbGllbnRUb29sc30gdGhlIGNvZGV4IHRocmVhZCB3YXMgc3RhcnRlZFxuXHQgKiB3aXRoLiBDb2RleCBvbmx5IGFjY2VwdHMgYGR5bmFtaWNUb29sc2AgYXQgYHRocmVhZC9zdGFydGAsIHNvIGlmIHRoZVxuXHQgKiB0b29scyBjaGFuZ2UgYmVmb3JlIHRoZSBmaXJzdCB0dXJuIChlLmcuIHRoZSBwcmV3YXJtZWQgdGhyZWFkIHN0YXJ0ZWRcblx0ICogYmVmb3JlIHtAbGluayBzZXRDbGllbnRUb29sc30gYXJyaXZlZCkgdGhlIHRocmVhZCBpcyByZXN0YXJ0ZWQgdG8gcGlja1xuXHQgKiB0aGVtIHVwLiBgdW5kZWZpbmVkYCB1bnRpbCBtYXRlcmlhbGl6ZWQuXG5cdCAqL1xuXHRtYXRlcmlhbGl6ZWRUb29sc1NpZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogU2lnbmF0dXJlIG9mIHRoZSBgbWNwX3NlcnZlcnNgIChyb290IGNvbmZpZyArIGNsaWVudCBwbHVnaW5zKSB0aGUgY29kZXhcblx0ICogdGhyZWFkIHdhcyBzdGFydGVkIHdpdGguIENvZGV4IG9ubHkgYWNjZXB0cyBgY29uZmlnLm1jcF9zZXJ2ZXJzYCBhdFxuXHQgKiBgdGhyZWFkL3N0YXJ0YCwgc28gaWYgdGhlIHNldCBjaGFuZ2VzIGJlZm9yZSB0aGUgZmlyc3QgdHVybiB0aGUgdGhyZWFkIGlzXG5cdCAqIHJlc3RhcnRlZCB0byBwaWNrIHRoZW0gdXAuIGB1bmRlZmluZWRgIHVudGlsIG1hdGVyaWFsaXplZC5cblx0ICovXG5cdG1hdGVyaWFsaXplZE1jcFNpZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogU2lnbmF0dXJlIG9mIGN1c3RvbSBhZ2VudHMsIGluc3RydWN0aW9ucywgYW5kIHNraWxsIGNhcGFiaWxpdHkgcm9vdHMgYXBwbGllZCB0byB0aGUgdGhyZWFkLiAqL1xuXHRtYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9uc1NpZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogQXBwcm92YWwvc2FuZGJveC9yZXZpZXdlciBheGVzIHRoZSBjdXJyZW50IHRocmVhZCB3YXMgc3RhcnRlZCB3aXRoLiAqL1xuXHRtYXRlcmlhbGl6ZWRQZXJtaXNzaW9uc1NpZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogTW9kZWwgcHJvdmlkZXIgYmFja2luZyB0aGUgY3VycmVudCBtYXRlcmlhbGl6ZWQgdGhyZWFkLiAqL1xuXHRtYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBUcnVlIG9uY2UgYSB0dXJuIGhhcyBiZWVuIHN0YXJ0ZWQgb24gdGhlIChtYXRlcmlhbGl6ZWQpIHRocmVhZC4gKi9cblx0Zmlyc3RUdXJuU2VudDogYm9vbGVhbjtcblx0bW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIFdvcmtiZW5jaC1mYWNpbmcgdHVybiBpZCBmb3IgdGhlIGFjdGl2ZSB0dXJuLiAqL1xuXHRjdXJyZW50VHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBMb2NhbCBtb25vdG9uaWMgdGltZXIgZm9yIHRoZSBhY3RpdmUgd29ya2JlbmNoLWZhY2luZyB0dXJuLiAqL1xuXHR0dXJuU3RvcFdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQ7XG5cdC8qKiBDb2RleCBhcHAtc2VydmVyIHR1cm4gaWQgZm9yIHRoZSBhY3RpdmUgdHVybi4gKi9cblx0Y3VycmVudEFwcFR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogQ29kZXggYXBwLXNlcnZlciB0dXJuIGlkIC0+IHdvcmtiZW5jaC1mYWNpbmcgdHVybiBpZC4gKi9cblx0cmVhZG9ubHkgaG9zdFR1cm5JZEJ5QXBwVHVybklkOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKipcblx0ICogV29ya2JlbmNoLWZhY2luZyB0dXJuIGlkIC0+IGNvZGV4IGFwcC1zZXJ2ZXIgdHVybiBpZCwgcmV0YWluZWQgYWNyb3NzXG5cdCAqIHR1cm4gY29tcGxldGlvbiBzbyB7QGxpbmsgQ29kZXhBZ2VudC50cnVuY2F0ZUNoYXR9IGNhbiB0cmFuc2xhdGUgYVxuXHQgKiBsaXZlIGhvc3QgdHVybiBpZCB0byBhIGB0aHJlYWQvcm9sbGJhY2tgIHRhcmdldC5cblx0ICovXG5cdHJlYWRvbmx5IGNvZGV4VHVybklkQnlIb3N0VHVybklkOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKiogU2V0IHdoZW4gdGhpcyBzZXNzaW9uIHdhcyByZXN0b3JlZCAoUGhhc2UgMykgYW5kIG5lZWRzIGB0aHJlYWQvcmVzdW1lYCBiZWZvcmUgdGhlIGZpcnN0IGB0dXJuL3N0YXJ0YC4gKi9cblx0bmVlZHNSZXN1bWU6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTZXQgd2hlbiBsYXVuY2gtb25seSBzZXR0aW5ncyBjaGFuZ2VkIG9uIGEgc3Vic2NyaWJlZCBsaXZlIHRocmVhZC4gQ29kZXhcblx0ICogaWdub3JlcyBgdGhyZWFkL3Jlc3VtZWAgb3ZlcnJpZGVzIGZvciBzdWNoIGEgdGhyZWFkLCBzbyByZWxlYXNlIHRoZSBsaXZlXG5cdCAqIHN1YnNjcmlwdGlvbiBiZWZvcmUgcmVzdW1pbmcgaXRzIHBlcnNpc3RlZCBoaXN0b3J5IHdpdGggdGhlIG5ldyBzZXR0aW5ncy5cblx0ICovXG5cdHVuc3Vic2NyaWJlQmVmb3JlUmVzdW1lOiBib29sZWFuO1xuXHQvKiogSW4tZmxpZ2h0IHJlc3VtZSBzaGFyZWQgYnkgaGlzdG9yeSBsb2FkaW5nIGFuZCB0aGUgZmlyc3Qgc2VuZC4gKi9cblx0cmVzdW1lUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0LyoqIE1vc3QgcmVjZW50IHVzZXIgcHJvbXB0IHNlbnQgb24gdGhpcyBzZXNzaW9uIFx1MjAxNCB1c2VkIGFzIGZhbGxiYWNrIHVzZXJNZXNzYWdlIHRleHQgaW4gYHR1cm4vc3RhcnRlZGAuICovXG5cdGxhc3RQcm9tcHRUZXh0OiBzdHJpbmc7XG5cdC8qKiBUcnVlIG9uY2UgdGhlIHdvcmtiZW5jaCBoYXMgZGlzcG9zZWQgdGhpcyBzZXNzaW9uLiBHdWFyZHMgYmFja2dyb3VuZCBwcmV3YXJtIGNvbnRpbnVhdGlvbnMuICovXG5cdGRpc3Bvc2VkOiBib29sZWFuO1xuXHQvKiogSW4tZmxpZ2h0IGJhY2tncm91bmQgb3IgZm9yZWdyb3VuZCBtYXRlcmlhbGl6YXRpb24sIHNoYXJlZCBhY3Jvc3MgY2FsbGVycy4gKi9cblx0bWF0ZXJpYWxpemVQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGUgd29ya2JlbmNoLWZhY2luZyBtYXRlcmlhbGl6ZSBldmVudCBoYXMgYmVlbiBlbWl0dGVkLiAqL1xuXHRtYXRlcmlhbGl6ZWRFdmVudEZpcmVkOiBib29sZWFuO1xuXHQvKiogVFRMIHRpbWVyIGZvciBhIG1hdGVyaWFsaXplZC1idXQtdW51c2VkIHByZXdhcm1lZCB0aHJlYWQuICovXG5cdHByZXdhcm1UaW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdC8qKiBUcnVlIG9uY2UgdGhlIHByZXdhcm1lZCBzZXNzaW9uIGhhcyBiZWVuIGNsYWltZWQgYnkgYSB1c2VyIHR1cm4uICovXG5cdHByZXdhcm1DbGFpbWVkOiBib29sZWFuO1xuXHQvKiogVHJ1ZSBvbmNlIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzIGhhdmUgYmVlbiBhZHZlcnRpc2VkIG9uIHRoaXMgc2Vzc2lvbi4gKi9cblx0c2VydmVyVG9vbHNBZHZlcnRpc2VkOiBib29sZWFuO1xuXHQvKipcblx0ICogUGVyLXNlc3Npb24gTUNQIGN1c3RvbWl6YXRpb24gc3VyZmFjZS4gQ3JlYXRlZCBsYXppbHkgdGhlIGZpcnN0IHRpbWVcblx0ICogdGhlIHNlc3Npb24gbmVlZHMgdG8gc3VyZmFjZSBjb2RleCdzIE1DUCBzZXJ2ZXJzIChlaXRoZXIgdmlhXG5cdCAqIHtAbGluayBDb2RleEFnZW50LmdldENoYXRDdXN0b21pemF0aW9uc30gb3Igd2hlbiB0aGUgY29ubmVjdGlvbidzXG5cdCAqIE1DUCBpbnZlbnRvcnkgaXMgYXBwbGllZCkuIERpc3Bvc2VkIHdoZW4gdGhlIHNlc3Npb24gaXMgcmVtb3ZlZC5cblx0ICovXG5cdG1jcENvbnRyb2xsZXI6IE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogU3RvcmUgb2YgY2xpZW50LXB1c2hlZCAoXCJPcGVuIFBsdWdpblwiKSBjdXN0b21pemF0aW9ucyBzeW5jZWQgdG8gdGhpc1xuXHQgKiBzZXNzaW9uLiBUaGVpciBNQ1Agc2VydmVycyBhcmUgYXR0YWNoZWQgcGVyLXRocmVhZCBhdCBgdGhyZWFkL3N0YXJ0YFxuXHQgKiBhbmQgdGhlaXIgc2tpbGxzIGZlZWQgY29kZXgncyBwcm9jZXNzLWdsb2JhbCBgc2tpbGxzL2V4dHJhUm9vdHMvc2V0YC5cblx0ICovXG5cdHJlYWRvbmx5IGNsaWVudEN1c3RvbWl6YXRpb25zOiBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZTtcbn1cblxudHlwZSBJQ29kZXhTZXNzaW9uUmVhZCA9IFRocmVhZFJlYWRSZXNwb25zZSAmIHtcblx0cmVhZG9ubHkgcGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107XG5cdHJlYWRvbmx5IHBlcnNpc3RlZE1vZGVsSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJvbGxvdXRNZXRhZGF0YT86IElDb2RleFJvbGxvdXRNZXRhZGF0YTtcbn07XG5cbmZ1bmN0aW9uIHRvUm9sbG91dE1vZGVsU2VsZWN0aW9uKG1vZGVsOiBJQ29kZXhSb2xsb3V0TW9kZWwgfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBtb2RlbCA/IHsgaWQ6IHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkKG1vZGVsLm1vZGVsUHJvdmlkZXIsIG1vZGVsLm1vZGVsSWQpIH0gOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRvUm9sbG91dFR1cm5Nb2RlbHMobWV0YWRhdGE6IElDb2RleFJvbGxvdXRNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IFJlYWRvbmx5TWFwPHN0cmluZywgTW9kZWxTZWxlY3Rpb24+IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFtZXRhZGF0YSB8fCBtZXRhZGF0YS5tb2RlbHNCeVR1cm5JZC5zaXplID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gbmV3IE1hcChbLi4ubWV0YWRhdGEubW9kZWxzQnlUdXJuSWRdLm1hcCgoW3R1cm5JZCwgbW9kZWxdKSA9PiBbdHVybklkLCB7IGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZChtb2RlbC5tb2RlbFByb3ZpZGVyLCBtb2RlbC5tb2RlbElkKSB9XSkpO1xufVxuXG4vKipcbiAqIEEgbGl2ZSBDb2RleCBjb2xsYWItYWdlbnQgKHN1YmFnZW50KSBjaGlsZCB0aHJlYWQuIENvZGV4IHJ1bnMgZWFjaCBzcGF3bmVkXG4gKiBzdWJhZ2VudCBhcyBpdHMgb3duIGFwcC1zZXJ2ZXIgdGhyZWFkIHRoYXQgZW1pdHMgYSBmdWxsIGl0ZW0vdHVybiBldmVudFxuICogc3RyZWFtIChgdHVybi9zdGFydGVkYCwgYGl0ZW0vKmAsIGB0dXJuL2NvbXBsZXRlZGApIHVuZGVyIHRoZSBjaGlsZCB0aHJlYWRcbiAqIGlkIFx1MjAxNCBpdCBpcyBub3QgZmxhdHRlbmVkIG9udG8gdGhlIHBhcmVudCB0aHJlYWQuIFdlIHJlbmRlciB0aGF0IHN0cmVhbSBpbiBhXG4gKiByZWFkLW9ubHkgY2hpbGQgY29udmVyc2F0aW9uIGJ5IHJvdXRpbmcgdGhlIGNoaWxkIHRocmVhZCdzIG5vdGlmaWNhdGlvbnNcbiAqIHRocm91Z2ggdGhlIHNoYXJlZCBtYXBwZXJzIHdpdGggYW4gaXNvbGF0ZWQge0BsaW5rIElDb2RleFNlc3Npb259IGFuZCBmaXJpbmdcbiAqIGVhY2ggcmVzdWx0aW5nIGFjdGlvbiB0YWdnZWQgd2l0aCB0aGUgcGFyZW50IGBzcGF3bkFnZW50YCB0b29sIGNhbGwgYXMgaXRzXG4gKiBgcGFyZW50VG9vbENhbGxJZGAsIHNvIHRoZSBzaGFyZWQgb3JjaGVzdHJhdG9yICh7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30pXG4gKiBsYW5kcyB0aGVtIGluIHRoZSBzdWJhZ2VudCBjb252ZXJzYXRpb24uXG4gKi9cbmludGVyZmFjZSBJQ29kZXhTdWJhZ2VudCB7XG5cdC8qKiBDYWxsZXItZmFjaW5nIHNlc3Npb25JZCBvZiB0aGUgcGFyZW50IHNlc3Npb24gdGhhdCBzcGF3bmVkIHRoaXMgc3ViYWdlbnQuICovXG5cdHJlYWRvbmx5IHBhcmVudFNlc3Npb25JZDogc3RyaW5nO1xuXHQvKiogSG9zdC1zaWRlIHRvb2xDYWxsSWQgb2YgdGhlIHBhcmVudCBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2wgY2FsbCAocm91dGluZyBrZXkpLiAqL1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBJc29sYXRlZCBzZXNzaW9uIHVzZWQgdG8gcnVuIHRoZSBzaGFyZWQgZXZlbnQgbWFwcGVycyBmb3IgdGhlIGNoaWxkXG5cdCAqIHRocmVhZC4gU2hhcmVzIHRoZSBwYXJlbnQncyBgc2Vzc2lvblVyaWAgYW5kIGBhY2NlcHRlZEZvclNlc3Npb25gIG1lbW8gc29cblx0ICogc2lkZSBlZmZlY3RzIHRhcmdldCB0aGUgcGFyZW50J3Mgd29ya2luZyB0cmVlIGFuZCB0aGUgYWNjZXB0LWZvci1zZXNzaW9uXG5cdCAqIGRlY2lzaW9uIHNwYW5zIHBhcmVudCArIHN1YmFnZW50cywgYnV0IGtlZXBzIGl0cyBvd24gbWFwL3R1cm4gc3RhdGUuXG5cdCAqL1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQ29kZXhTZXNzaW9uO1xufVxuXG4vKipcbiAqIENvbm5lY3Rpb24gc3RhdGUgbWFjaGluZS4gVGhlIGNvZGV4IHByb2Nlc3MgaXMgc3Bhd25lZCBvbiBmaXJzdCBuZWVkIFx1MjAxNFxuICogaW5jbHVkaW5nIGVhZ2VyIG1vZGVsIGVudW1lcmF0aW9uIHdoZW4gcGVyc2lzdGVkIENoYXRHUFQgYXV0aCBpcyBkZXRlY3RlZCBcdTIwMTRcbiAqIGFuZCBzdGF5cyBhbGl2ZSBmb3IgdGhlIGFnZW50J3MgbGlmZXRpbWUuXG4gKi9cbnR5cGUgQ29ubmVjdGlvblN0YXRlID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdpZGxlJyB9XG5cdHwgeyByZWFkb25seSBraW5kOiAnc3RhcnRpbmcnOyByZWFkb25seSBwcm9taXNlOiBQcm9taXNlPElDb25uZWN0aW9uUmVhZHk+IH1cblx0fCAoeyByZWFkb25seSBraW5kOiAncmVhZHknIH0gJiBJQ29ubmVjdGlvblJlYWR5KTtcblxuaW50ZXJmYWNlIElDb25uZWN0aW9uUmVhZHkge1xuXHRyZWFkb25seSBjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudDtcblx0cmVhZG9ubHkgcHJveHlIYW5kbGU6IElDb2RleFByb3h5SGFuZGxlO1xuXHRyZWFkb25seSBjaGlsZDogQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zO1xufVxuXG4vKipcbiAqIGBJQWdlbnRgIGltcGxlbWVudGF0aW9uIGJhY2tlZCBieSBgY29kZXggYXBwLXNlcnZlcmAuXG4gKlxuICogUGhhc2UgMiBzdXJmYWNlOiBpbml0aWFsaXppbmcgYGNoYXRzLmNyZWF0ZUNoYXRgIChwcm92aXNpb25hbDsgYHRocmVhZC9zdGFydGAgaXNcbiAqIGRlZmVycmVkKSwgYGNoYXRzLnNlbmRNZXNzYWdlYCAob25lIGB0dXJuL3N0YXJ0YCwgc3RyZWFtcyBgYWdlbnRNZXNzYWdlYFxuICogZGVsdGFzKSwgc2V0UGVuZGluZ01lc3NhZ2VzIChzdGVlcmluZyB2aWEgYHR1cm4vc3RlZXJgKSwgYGNoYXRzLmFib3J0YFxuICogKGB0dXJuL2ludGVycnVwdGApLCBgY2hhdHMuZGlzcG9zZUNoYXRgIChgdGhyZWFkL3Vuc3Vic2NyaWJlYCwgbm8gcHJvY2Vzc1xuICoga2lsbCkgZm9sbG93ZWQgYnkgcmVmLWNvdW50ZWQgbWFuYWdlZC13b3JraW5nLWRpcmVjdG9yeSByZWNsYWltIG9uY2UgYVxuICogY2hhdCdzIGNvbmZpZ3VyYXRpb24gc2NvcGUgaGFzIG5vIGNoYXRzIGxlZnQgcmVnaXN0ZXJlZC5cbiAqXG4gKiBEZWNpc2lvbnMgMyAoc2hhcmVkIHByb2Nlc3MpLCA2IChvbi1kZW1hbmQgc3Bhd24pLCA3IChzZXNzaW9uIGlkID09IHRocmVhZElkKSxcbiAqIDEwIChubyBjd2QgXHUyMTkyIHJlamVjdCksIDE1IChjYW5jZWwsIGtlZXAgc3RyZWFtZWQgY29udGVudCksIDE2IChzdGVlcmluZyksXG4gKiAxNyAoYXR0YWNobWVudHMpLCAxOCAoYXBpa2V5IGF1dGgpLlxuICovXG5cbi8qKlxuICogYEBvcGVuYWkvY29kZXhgIGRpc3RyaWJ1dGlvbiBkZXNjcmlwdG9yLiBMaXZlcyBpbiB0aGlzIGZpbGUgYmVjYXVzZSBpdFxuICogZW5jb2RlcyBDb2RleC1zcGVjaWZpYyBrbm93bGVkZ2UgXHUyMDE0IHRoZSBlbnYtdmFyIG5hbWUgYW5kIHRoZSBmYWN0IHRoYXRcbiAqIENvZGV4J3MgTGludXggYmluYXJpZXMgYXJlIHN0YXRpY2FsbHkgbXVzbC1saW5rZWQgYW5kIHNoaXAgYXMgYSBzaW5nbGVcbiAqIGBsaW51eC0qYCBTS1UgcmVnYXJkbGVzcyBvZiBob3N0IGxpYmMuXG4gKi9cbmV4cG9ydCBjb25zdCBDb2RleFNka1BhY2thZ2U6IElBZ2VudFNka1BhY2thZ2UgPSB7XG5cdGlkOiAnY29kZXgnLFxuXHRkaXNwbGF5TmFtZTogJ0NvZGV4Jyxcblx0ZGV2T3ZlcnJpZGVFbnZWYXI6IEFnZW50SG9zdENvZGV4QWdlbnRTZGtSb290RW52VmFyLFxuXHRoYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2U6IGZhbHNlLFxufTtcblxuLyoqXG4gKiBDb252ZXJ0IGEgd29ya2JlbmNoIHtAbGluayBUb29sQ2FsbFJlc3VsdH0gaW50byB0aGUgY29kZXhcbiAqIHtAbGluayBEeW5hbWljVG9vbENhbGxSZXNwb25zZX0gcmV0dXJuZWQgZm9yIGFuIGBpdGVtL3Rvb2wvY2FsbGAgcmVxdWVzdC5cbiAqIFRleHQgY29udGVudCBtYXBzIHRvIGBpbnB1dFRleHRgOyB3aGVuIHRoZXJlIGlzIG5vIHRleHQgY29udGVudCB0aGVcbiAqIHRvb2wncyBwYXN0LXRlbnNlIHN1bW1hcnkgaXMgdXNlZCBzbyBjb2RleCBuZXZlciByZWNlaXZlcyBhbiBlbXB0eSBib2R5LlxuICovXG5mdW5jdGlvbiBkeW5hbWljVG9vbFJlc3BvbnNlRnJvbVJlc3VsdChyZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogRHluYW1pY1Rvb2xDYWxsUmVzcG9uc2Uge1xuXHRjb25zdCBjb250ZW50SXRlbXM6IER5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtW10gPSBbXTtcblx0Zm9yIChjb25zdCBjIG9mIHJlc3VsdC5jb250ZW50ID8/IFtdKSB7XG5cdFx0aWYgKGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpIHtcblx0XHRcdGNvbnRlbnRJdGVtcy5wdXNoKHsgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6IGMudGV4dCB9KTtcblx0XHR9XG5cdH1cblx0aWYgKGNvbnRlbnRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHQvLyBDb2RleCByZWplY3RzIGFuIGVtcHR5IHRvb2wgYm9keSwgc28gYWx3YXlzIHNlbmQgYSBub24tZW1wdHlcblx0XHQvLyBgaW5wdXRUZXh0YDogcHJlZmVyIHRoZSB0b29sJ3MgcGFzdC10ZW5zZSBzdW1tYXJ5LCBvdGhlcndpc2UgYVxuXHRcdC8vIGdlbmVyaWMgY29tcGxldGlvbiBtYXJrZXIga2V5ZWQgb2ZmIHN1Y2Nlc3MuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHR5cGVvZiByZXN1bHQucGFzdFRlbnNlTWVzc2FnZSA9PT0gJ3N0cmluZycgJiYgcmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UubGVuZ3RoID4gMFxuXHRcdFx0PyByZXN1bHQucGFzdFRlbnNlTWVzc2FnZVxuXHRcdFx0OiAocmVzdWx0LnN1Y2Nlc3MgPyAnVG9vbCBjb21wbGV0ZWQgd2l0aCBubyBvdXRwdXQuJyA6ICdUb29sIGZhaWxlZCB3aXRoIG5vIG91dHB1dC4nKTtcblx0XHRjb250ZW50SXRlbXMucHVzaCh7IHR5cGU6ICdpbnB1dFRleHQnLCB0ZXh0OiBzdW1tYXJ5IH0pO1xuXHR9XG5cdHJldHVybiB7IGNvbnRlbnRJdGVtcywgc3VjY2VzczogcmVzdWx0LnN1Y2Nlc3MgfTtcbn1cblxuZnVuY3Rpb24gdG9vbHNTaWduYXR1cmUodG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoIXRvb2xzIHx8IHRvb2xzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gdG9vbHNcblx0XHQubWFwKHQgPT4gYCR7dC5uYW1lfVxcdTAwMDAke3QuZGVzY3JpcHRpb24gPz8gJyd9XFx1MDAwMCR7SlNPTi5zdHJpbmdpZnkodC5pbnB1dFNjaGVtYSA/PyBudWxsKX1gKVxuXHRcdC5zb3J0KClcblx0XHQuam9pbignXFx1MDAwMScpO1xufVxuXG4vKipcbiAqIFN0YWJsZSBzaWduYXR1cmUgb2YgdGhlIGBtY3Bfc2VydmVyc2Agb2JqZWN0IGEgdGhyZWFkIHdhcyBzdGFydGVkIHdpdGgsIHVzZWRcbiAqIHRvIGRldGVjdCB3aGVuIHRoZSBtZXJnZWQgKHJvb3QgY29uZmlnICsgY2xpZW50IHBsdWdpbikgTUNQIHNldCBjaGFuZ2VkIHNvXG4gKiB0aGUgdGhyZWFkIGNhbiBiZSByZXN0YXJ0ZWQgYmVmb3JlIGl0cyBmaXJzdCB0dXJuIHRvIHBpY2sgdXAgdGhlIG5ldyBzZXJ2ZXJzLlxuICovXG5mdW5jdGlvbiBtY3BTZXJ2ZXJzU2lnbmF0dXJlKHNlcnZlcnM6IFJlY29yZDxzdHJpbmcsIElDb2RleE1jcFNlcnZlckNvbmZpZ0pzb24+KTogc3RyaW5nIHtcblx0Y29uc3QgbmFtZXMgPSBPYmplY3Qua2V5cyhzZXJ2ZXJzKS5zb3J0KCk7XG5cdHJldHVybiBuYW1lcy5tYXAobmFtZSA9PiBgJHtuYW1lfVxcdTAwMDAke0pTT04uc3RyaW5naWZ5KHNlcnZlcnNbbmFtZV0pfWApLmpvaW4oJ1xcdTAwMDEnKTtcbn1cblxuLyoqXG4gKiBPcGFxdWUgcGVyLWNoYXQgYmFja2luZyBibG9iIHRoZSBvcmNoZXN0cmF0b3IgcGVyc2lzdHMgKGluIHRoZSBzZXNzaW9uJ3NcbiAqIGRlZmF1bHQtY2hhdCByZWNvcmQgb3IgaXRzIHBlZXItY2hhdCBjYXRhbG9nKSBhbmQgaGFuZHMgYmFjayB0b1xuICoge0BsaW5rIENvZGV4QWdlbnQubWF0ZXJpYWxpemVDaGF0fSAvIHtAbGluayBDb2RleEFnZW50LmdldENoYXRNZXRhZGF0YX1cbiAqIG9uIHJlc3RvcmUsIHRvZ2V0aGVyIHdpdGggdGhlIGNoYXQncyBtb2RlbCBzbyBhIGNvbGQgcmVzdG9yZSByZS1hdHRhY2hlcyB0aGVcbiAqIGV4YWN0IGNvbnZlcnNhdGlvbiB3aXRob3V0IHJlLWVudW1lcmF0aW5nLlxuICpcbiAqIGBzZXNzaW9uSWRgIGlzIHRoZSBpZCBvZiB0aGUgKipydW50aW1lKiogYmFja2luZyB0aGUgY2hhdCBcdTIwMTQgdGhlIGtleSBpdHNcbiAqIHtAbGluayBJQ29kZXhTZXNzaW9ufSBpcyByZWdpc3RlcmVkIHVuZGVyIFx1MjAxNCBhbmQgbmV2ZXIgdGhlIGFwcC1zZXJ2ZXIgdGhyZWFkXG4gKiBpZC4gVGhlIHR3byBjb2luY2lkZSBmb3IgYSBjaGF0IHdob3NlIHJ1bnRpbWUgaXMgaWRlbnRpZmllZCBieSB0aGUgdGhyZWFkIGl0XG4gKiBtaW50ZWQgKENvZGV4J3Mgc2Vzc2lvbi1pZCA9PSB0aHJlYWQtaWQgY29udmVudGlvbikgYnV0IE5PVCBmb3IgYSBjaGF0IHdob3NlXG4gKiBydW50aW1lIGFkb3B0ZWQgdGhlIG93bmluZyBzZXNzaW9uJ3MgaWRlbnRpdHksIHdoaWNoIGtlZXBzIHRoZSBob3N0LW1pbnRlZFxuICogc2Vzc2lvbiBpZCBpdCB3YXMgcHJvdmlzaW9uZWQgd2l0aCBhbmQgZGVjb3VwbGVzIGl0cyB0aHJlYWQgaWQgaW50byB0aGVcbiAqIG1ldGFkYXRhIG92ZXJsYXkuIFJlY29yZGluZyB0aGUgdGhyZWFkIGlkIHRoZXJlIGluc3RlYWQgd291bGQgcmUta2V5IHRoZVxuICogcmVzdG9yZWQgcnVudGltZSB1bmRlciBhbiBpZCBubyBob3N0LWFkZHJlc3NlZCBjYWxsIGV2ZXIgdXNlcywgYW5kIGl0IHdvdWxkXG4gKiBnbyBzdGFsZSB0aGUgbW9tZW50IGEgcmVtYXRlcmlhbGl6YXRpb24gbWludHMgYSBuZXcgdGhyZWFkLlxuICovXG5pbnRlcmZhY2UgSUNvZGV4UGVyc2lzdGVkQ2hhdCB7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbD86IE1vZGVsU2VsZWN0aW9uO1xuXHRyZWFkb25seSBvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBlbmNvZGVDb2RleENoYXQoY2hhdDogSUNvZGV4UGVyc2lzdGVkQ2hhdCk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeShjaGF0KTtcbn1cblxuZnVuY3Rpb24gZGVjb2RlQ29kZXhDaGF0KGRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDb2RleFBlcnNpc3RlZENoYXQgfCB1bmRlZmluZWQge1xuXHRpZiAoZGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkLnNlc3Npb25JZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBwYXJzZWQgYXMgSUNvZGV4UGVyc2lzdGVkQ2hhdDtcblx0XHR9XG5cdH0gY2F0Y2gge1xuXHRcdC8vIGZhbGwgdGhyb3VnaFxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQ29kZXggYWN0aXZlLWNsaWVudCBoYW5kbGUgZm9yIGV4YWN0bHkgb25lIGV4YWN0IGNoYXQuIFdyaXRlcyBmbG93IGludG9cbiAqIHRoYXQgY2hhdCdzIGJhY2tpbmcgcnVudGltZSdzIHtAbGluayBBY3RpdmVDbGllbnRUb29sU2V0fSAodG9vbHMpIGFuZCBpdHNcbiAqIHtAbGluayBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZX0gKGN1c3RvbWl6YXRpb25zKTsgdGhlIHJ1bnRpbWUgaXNcbiAqIHJlc29sdmVkIGxhemlseSBvbiBldmVyeSB3cml0ZSwgc28gd3JpdGVzIHRoYXQgYXJyaXZlIGJlZm9yZSAob3IgYWZ0ZXIpIGl0XG4gKiBleGlzdHMgYXJlIGdyYWNlZnVsbHkgZHJvcHBlZCwgbWF0Y2hpbmcgdGhlIHByaW9yIGBzZXRDbGllbnRUb29sc2BcbiAqIGVhcmx5LXJldHVybiBiZWhhdmlvci4gQXNzaWduaW5nIGBjdXN0b21pemF0aW9uc2AgY2FjaGVzIHRoZSBpbnB1dHMgKHNvIHRoZVxuICogZ2V0dGVyIGVjaG9lcyB0aGVtKSBhbmQga2lja3Mgb2ZmIHRoZSBhZ2VudCdzIGFzeW5jIHN5bmMuIFRoZXJlIGlzIG5vXG4gKiBjcm9zcy1jaGF0IHByb3BhZ2F0aW9uOiBhIGhhbmRsZSBuZXZlciByZWFjaGVzIGludG8gYSBzaWJsaW5nIGNoYXQnc1xuICogcnVudGltZSwgc28gdGhlIG93bmluZyB7QGxpbmsgQ29kZXhBZ2VudH0gcmUtaW52b2tlc1xuICoge0BsaW5rIENvZGV4QWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnR9IG9uY2UgcGVyIGFkZHJlc3NlZCBjaGF0IGluc3RlYWQuXG4gKi9cbmNsYXNzIENvZGV4QWN0aXZlQ2xpZW50SGFuZGxlIGltcGxlbWVudHMgSUFjdGl2ZUNsaWVudCB7XG5cdHByaXZhdGUgX3Rvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdID0gW107XG5cdHByaXZhdGUgX2N1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlU2Vzc2lvbjogKCkgPT4gSUNvZGV4U2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBjbGllbnRJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25Ub29sc1NldDogKHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N5bmNDdXN0b21pemF0aW9uczogKHNlc3Npb246IElDb2RleFNlc3Npb24sIGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pID0+IHZvaWQsXG5cdCkgeyB9XG5cblx0Z2V0IHRvb2xzKCk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl90b29scztcblx0fVxuXHRzZXQgdG9vbHModG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pIHtcblx0XHR0aGlzLl90b29scyA9IHRvb2xzO1xuXHRcdHRoaXMuX3Jlc29sdmVTZXNzaW9uKCk/LmNsaWVudFRvb2xTZXQuc2V0KHRoaXMuY2xpZW50SWQsIHRvb2xzKTtcblx0XHR0aGlzLl9vblRvb2xzU2V0KHRvb2xzKTtcblx0fVxuXG5cdGdldCBjdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21pemF0aW9ucztcblx0fVxuXHRzZXQgY3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSkge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zID0gY3VzdG9taXphdGlvbnM7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uKCk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3N5bmNDdXN0b21pemF0aW9ucyhzZXNzaW9uLCBjdXN0b21pemF0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvbigpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uLmNsaWVudFRvb2xTZXQuZGVsZXRlKHRoaXMuY2xpZW50SWQpO1xuXHRcdFx0c2Vzc2lvbi5jbGllbnRDdXN0b21pemF0aW9ucy5yZW1vdmVDbGllbnQodGhpcy5jbGllbnRJZCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogTWFwIGEgcmVzb2x2ZWQgYXBwcm92YWwgZGVjaXNpb24gdG8gdGhlIHtAbGluayBGaWxlQ2hhbmdlQXBwcm92YWxEZWNpc2lvbn1cbiAqIHN1YnNldC4gVGhlIGhvc3QncyBib29sZWFuIHJlc3BvbnNlIG9ubHkgeWllbGRzIGBhY2NlcHRgL2BkZWNsaW5lYDsgdGhlXG4gKiBjb21tYW5kLW9ubHkgYW1lbmRtZW50IHZhcmlhbnRzIGFyZSB0cmVhdGVkIGFzIGEgZGVjbGluZSBmb3IgZmlsZSBjaGFuZ2VzLlxuICovXG5mdW5jdGlvbiBuYXJyb3dGaWxlQ2hhbmdlRGVjaXNpb24oZGVjaXNpb246IENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uKTogRmlsZUNoYW5nZUFwcHJvdmFsRGVjaXNpb24ge1xuXHRzd2l0Y2ggKGRlY2lzaW9uKSB7XG5cdFx0Y2FzZSAnYWNjZXB0Jzpcblx0XHRjYXNlICdhY2NlcHRGb3JTZXNzaW9uJzpcblx0XHRjYXNlICdkZWNsaW5lJzpcblx0XHRjYXNlICdjYW5jZWwnOlxuXHRcdFx0cmV0dXJuIGRlY2lzaW9uO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gJ2RlY2xpbmUnO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2RleEFnZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudCB7XG5cblx0cmVhZG9ubHkgaWQ6IEFnZW50UHJvdmlkZXIgPSBDT0RFWF9BR0VOVF9QUk9WSURFUl9JRDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYXRQcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGF0UHJvZ3Jlc3MgPSB0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1hdGVyaWFsaXplQ2hhdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudE1hdGVyaWFsaXplQ2hhdEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRNYXRlcmlhbGl6ZUNoYXQgPSB0aGlzLl9vbkRpZE1hdGVyaWFsaXplQ2hhdC5ldmVudDtcblxuXHQvKiogQ29kZXgncyBwZWVyLWNoYXQgYmFja2luZyBibG9iIG5ldmVyIGNoYW5nZXMgYWZ0ZXIgY3JlYXRpb24sIHNvIHRoaXMgbmV2ZXIgZmlyZXMuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdERhdGE6IEV2ZW50PElBZ2VudENoYXREYXRhQ2hhbmdlPiA9IEV2ZW50Lk5vbmU7XG5cblx0LyoqXG5cdCAqIENvZGV4IHN1YmFnZW50IHNwYXducyBhcmUgZGV0ZWN0ZWQgZnJvbSB0aGUgYHN1YmFnZW50X3N0YXJ0ZWRgIHNpZ25hbCBvblxuXHQgKiB7QGxpbmsgb25EaWRDaGF0UHJvZ3Jlc3N9IChzZWUge0BsaW5rIFN1YmFnZW50Q2hhdFNpZ25hbH0pLCBzbyB0aGUgYWdlbnRcblx0ICogbmV2ZXIgZmlyZXMgdGhpcyBtZW1iZXJzaGlwIGNoYW5uZWwgaXRzZWxmLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQ6IEV2ZW50PElBZ2VudFNwYXduQ2hhdEV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+KHRoaXMsIFtdKTtcblx0cmVhZG9ubHkgbW9kZWxzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4gPSB0aGlzLl9tb2RlbHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rlc2t0b3BUaHJlYWRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVza3RvcFJvbGxvdXRQcmVmaXhMaW1pdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpbWl0ZXI8c3RyaW5nIHwgbnVsbD4oQ09ERVhfREVTS1RPUF9ST0xMT1VUX1BSRUZJWF9DT05DVVJSRU5DWSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xkU2Vzc2lvblJlYWRMaW1pdGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpbWl0ZXI8SUNvZGV4U2Vzc2lvblJlYWQgfCB1bmRlZmluZWQ+KENPREVYX0NPTERfU0VTU0lPTl9SRUFEX0NPTkNVUlJFTkNZKSk7XG5cdHByaXZhdGUgX29wZW5BSUFjY291bnRTdGF0ZTogSUNvZGV4QWNjb3VudFN0YXRlID0geyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ3Vua25vd24nIH07XG5cdHByaXZhdGUgX29wZW5BSUFjY291bnRSYXRlTGltaXQ6IElDb2RleEFjY291bnRJbmZvWydyYXRlTGltaXQnXTtcblx0cHJpdmF0ZSBfcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWFkeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wZW5kaW5nUHJvdmlkZXJDb25maWd1cmF0aW9uV3JpdGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZm9yZ2VNb2RlbHNSZWFkeSA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWZyZXNoOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBLZXllZCBieSBjYWxsZXItZmFjaW5nIHNlc3Npb25JZCAodGhlIFVSSSBob3N0KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSUNvZGV4U2Vzc2lvbj4oKTtcblx0LyoqIE5hdGl2ZSBkaWZmIHNuYXBzaG90cyBrZXllZCBieSBDb2RleCB0aHJlYWQgaWQgKHBhcmVudCBhbmQgc3ViYWdlbnQpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlRWRpdE9ic2VydmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ29kZXhGaWxlRWRpdE9ic2VydmVyPigpKTtcblx0LyoqIEtleWVkIGJ5IGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwJHtjbGllbnRJZH1gIFx1MjAxNCBleGFjdC1jaGF0LCBleGFjdC1jbGllbnQgbWVtYmVyc2hpcDsgbm8gc2Vzc2lvbi0gb3Igc2libGluZy1sZXZlbCBlbnRyaWVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRIYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIENvZGV4QWN0aXZlQ2xpZW50SGFuZGxlPigpO1xuXHQvKiogSG9zdC1zdXBwbGllZCBjaGF0IFVSSSB0byBDb2RleCBzZXNzaW9uIGlkIHJvdXRpbmcuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZEJ5Q2hhdFVyaSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKiBJbnZlcnNlIG1hcDogY29kZXggdGhyZWFkSWQgXHUyMTkyIGNhbGxlci1mYWNpbmcgc2Vzc2lvbklkLCBmb3Igcm91dGluZyBjb2RleCBub3RpZmljYXRpb25zIGJhY2sgdG8gc2Vzc2lvbnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZEJ5VGhyZWFkSWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHQvKiogTWFuYWdlZCBkaXJlY3RvcmllcyByZXRhaW5lZCBieSBub24tZGVzdHJ1Y3RpdmVseSByZWxlYXNlZCBzZXNzaW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVsZWFzZWRNYW5hZ2VkV29ya2luZ0RpcmVjdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0LyoqXG5cdCAqIENoYXRzIGN1cnJlbnRseSByZWdpc3RlcmVkIHVuZGVyIGVhY2ggaG9zdCBzZXNzaW9uJ3MgY29uZmlndXJhdGlvblxuXHQgKiBzY29wZSAoe0BsaW5rIElBZ2VudENoYXRDb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZX0pLCBrZXllZCBieSB0aGVcblx0ICogc2NvcGUncyBVUkkgc3RyaW5nLiBVc2VkIHB1cmVseSB0byBkZXRlY3Qgd2hlbiB0aGUgbGFzdCBjaGF0IGZvciBhXG5cdCAqIHNjb3BlIGhhcyBiZWVuIGRpc3Bvc2VkIHNvIHRoZSBzY29wZSdzIG1hbmFnZWQgd29ya2luZyBkaXJlY3RvcnkgKGlmXG5cdCAqIGFueSkgY2FuIGJlIHJlY2xhaW1lZCBcdTIwMTQgQWdlbnQgSG9zdCBvd25zIGNoYXQgcm9sZXMsIHNvIENvZGV4IG5ldmVyXG5cdCAqIGluZmVycyBcInRoaXMgaXMgdGhlIGRlZmF1bHQgY2hhdFwiIGhlcmUsIG9ubHkgYmFyZSBtZW1iZXJzaGlwLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2NvcGVDaGF0cyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0LyoqXG5cdCAqIEludmVyc2Ugb2Yge0BsaW5rIF9jb25maWdTY29wZUNoYXRzfTogdGhlIGV4YWN0IHNjb3BlIGtleSBhIGNoYXQgd2FzXG5cdCAqIHJlZ2lzdGVyZWQgdW5kZXIsIGtleWVkIGJ5IGNoYXQgVVJJIHN0cmluZy4gUmVjb3JkZWQgYXQgdHJhY2sgdGltZSBzb1xuXHQgKiB1bnRyYWNraW5nIGFsd2F5cyBhZ3JlZXMgd2l0aCB0aGUgb3JpZ2luYWwgcmVnaXN0cmF0aW9uIGV2ZW4gd2hlbiBhXG5cdCAqIGNoYXQncyBydW50aW1lIGJpbmRpbmcgKGl0cyBiYWNraW5nIHRocmVhZCBpZCkgZGlmZmVycyBmcm9tIHRoZSBzY29wZVxuXHQgKiBpdCB3YXMgY3JlYXRlZCB1bmRlciBcdTIwMTQgZS5nLiBhIHBlZXIgY2hhdCBiYWNrZWQgYnkgaXRzIG93biB0aHJlYWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWdTY29wZUJ5Q2hhdCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBMaXZlIHN1YmFnZW50IChjb2xsYWItYWdlbnQpIGNoaWxkIHRocmVhZHMsIGtleWVkIGJ5IHRoZSBjaGlsZCBjb2RleFxuXHQgKiB0aHJlYWQgaWQuIFBvcHVsYXRlZCB3aGVuIGEgcGFyZW50IHNlc3Npb24ncyBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2xcblx0ICogY2FsbCBjb21wbGV0ZXMgKGNhcnJ5aW5nIHRoZSBjaGlsZCBgcmVjZWl2ZXJUaHJlYWRJZHNgKTsgdGhlIGNoaWxkJ3Ncblx0ICogc3Vic2VxdWVudCBgdHVybi8qYCBhbmQgYGl0ZW0vKmAgbm90aWZpY2F0aW9ucyByb3V0ZSBoZXJlIGluc3RlYWQgb2Zcblx0ICoge0BsaW5rIF9zZXNzaW9uSWRCeVRocmVhZElkfS4gUmVtb3ZlZCBvbiB0aGUgY2hpbGQncyBgdHVybi9jb21wbGV0ZWRgLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3ViYWdlbnRzQnlUaHJlYWRJZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ29kZXhTdWJhZ2VudD4oKTtcblx0LyoqIFByZXNlcnZlIGFwcC1zZXJ2ZXIgb3JkZXJpbmcgd2hpbGUgYXN5bmNocm9ub3VzIGZpbGUgcHJldmlld3MgYXJlIHBlcnNpc3RlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZUV2ZW50RGlzcGF0Y2hlcyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXHQvKipcblx0ICogQ29ubmVjdGlvbi1nbG9iYWwgTUNQIHNlcnZlciBpbnZlbnRvcnkgcmVwb3J0ZWQgYnkgdGhlIGNvZGV4XG5cdCAqIGFwcC1zZXJ2ZXIgKGBtY3BTZXJ2ZXJTdGF0dXMvbGlzdGAgKyBgbWNwU2VydmVyL3N0YXJ0dXBTdGF0dXMvdXBkYXRlZGApLlxuXHQgKiBDb2RleCBvd25zIE1DUCBzZXJ2ZXJzIGF0IHRoZSBwcm9jZXNzIGxldmVsIFx1MjAxNCBzaGFyZWQgYWNyb3NzIGV2ZXJ5XG5cdCAqIHRocmVhZCBcdTIwMTQgc28gdGhlIGludmVudG9yeSBsaXZlcyBvbiB0aGUgYWdlbnQgYW5kIGlzIG1pcnJvcmVkIG9udG8gZWFjaFxuXHQgKiBzZXNzaW9uJ3Mge0BsaW5rIElDb2RleFNlc3Npb24ubWNwQ29udHJvbGxlcn0uIEtleWVkIGJ5IHNlcnZlciBuYW1lLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbWNwSW52ZW50b3J5ID0gbmV3IE1hcDxzdHJpbmcsIElDb2RleE1jcFNlcnZlckVudHJ5PigpO1xuXHQvKipcblx0ICogT0F1dGggYmVhcmVyIHRva2VucyBhY3F1aXJlZCBmb3IgYXV0aC1nYXRlZCBodHRwIE1DUCBzZXJ2ZXJzLCBrZXllZCBieVxuXHQgKiB0aGUgc2VydmVyJ3Mge0BsaW5rIG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwgfCBub3JtYWxpemVkIFVSTH0uXG5cdCAqIFBvcHVsYXRlZCBieSB7QGxpbmsgaGFuZGxlQXV0aGVudGljYXRpb25Ub2tlbn0gYWZ0ZXIgdGhlIHdvcmtiZW5jaFxuXHQgKiBjb21wbGV0ZXMgdGhlIHNpZ24taW4sIHRoZW4gaW5qZWN0ZWQgaW50byB0aGUgcGVyLXRocmVhZCBgaHR0cF9oZWFkZXJzYFxuXHQgKiBieSB7QGxpbmsgX2J1aWxkU2Vzc2lvbk1jcFNlcnZlcnN9LiBQcm9jZXNzLWdsb2JhbDogYSB0b2tlbiBmb3IgYSBnaXZlblxuXHQgKiBzZXJ2ZXIgVVJMIGFwcGxpZXMgdG8gZXZlcnkgc2Vzc2lvbi90aHJlYWQgdGhhdCB1c2VzIGl0IChjb2RleCBydW5zIG9uZVxuXHQgKiBzaGFyZWQgYXBwLXNlcnZlcikuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BBdXRoVG9rZW5zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqXG5cdCAqIEFzc29jaWF0aW9uIGZyb20gYSBub3JtYWxpemVkIE9BdXRoIGByZXNvdXJjZWAgKHdoYXQgdGhlIHdvcmtiZW5jaFxuXHQgKiBhdXRoZW50aWNhdGVzKSB0byB0aGUgbm9ybWFsaXplZCBNQ1Agc2VydmVyIFVSTChzKSBpdCB1bmxvY2tzLiBSRkMgOTcyOFxuXHQgKiBkaXNjb3ZlcnkgY2FuIHJldHVybiBhIGByZXNvdXJjZWAgdGhhdCBkaWZmZXJzIGZyb20gdGhlIGNvbmZpZ3VyZWQgc2VydmVyXG5cdCAqIFVSTCAoZS5nLiByb290IGBodHRwczovL2hvc3QvYCBmb3IgYSBgaHR0cHM6Ly9ob3N0L21jcGAgZW5kcG9pbnQpLCBzbyB0aGVcblx0ICogdG9rZW4gdGhlIHdvcmtiZW5jaCBwdXNoZXMgYmFjayBpcyBrZXllZCBieSB0aGUgcmVzb3VyY2UsIG5vdCB0aGUgc2VydmVyXG5cdCAqIFVSTC4gUmVjb3JkZWQgaW4ge0BsaW5rIF9zdXJmYWNlTWNwQXV0aFJlcXVpcmVkfSBhdCBkaXNjb3ZlcnkgdGltZSBhbmRcblx0ICogcmVhZCBieSB7QGxpbmsgaGFuZGxlQXV0aGVudGljYXRpb25Ub2tlbn0gdG8gcm91dGUgdGhlIHRva2VuIHRvIHRoZSByaWdodFxuXHQgKiBzZXJ2ZXIocykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BBdXRoU2VydmVyVXJsc0J5UmVzb3VyY2UgPSBuZXcgTWFwPHN0cmluZywgU2V0PHN0cmluZz4+KCk7XG5cdHByaXZhdGUgX2dpdGh1YlRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUHJvdmlkZXJBcGlLZXlzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbjogQ29ubmVjdGlvblN0YXRlID0geyBraW5kOiAnaWRsZScgfTtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbkdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc2NvdmVyQ2hhdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJQWdlbnREaXNjb3ZlcmVkQ2hhdFtdPih7XG5cdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7IHZvaWQgdGhpcy5fc3RhcnRDb2RleENoYXREaXNjb3ZlcnkoKTsgfSxcblx0fSkpO1xuXHRyZWFkb25seSBvbkRpZERpc2NvdmVyQ2hhdHMgPSB0aGlzLl9vbkRpZERpc2NvdmVyQ2hhdHMuZXZlbnQ7XG5cdHByaXZhdGUgX2NvZGV4Q2hhdERpc2NvdmVyeTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxzUmVmcmVzaFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvcGlsb3RNb2RlbHM6IHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdID0gW107XG5cdHByaXZhdGUgX2NvZGV4TW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbE1vZGVsRGlzY292ZXJ5Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgeyByZWFkb25seSBleHBpcmVzQXQ6IG51bWJlcjsgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxyZWFkb25seSBJQ29kZXhEaXNjb3ZlcmVkTG9jYWxNb2RlbFtdPiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRhZGF0YVN0b3JlOiBDb2RleFNlc3Npb25NZXRhZGF0YVN0b3JlO1xuXHRwcml2YXRlIF9sYXN0U2lnbkluUmVxdWVzdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0U2lnbk91dFJlcXVlc3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIGFnZW50IGhvc3QncyBzZXJ2ZXItdG9vbCBob3N0IChmZWVkYmFjayBcImNvbW1lbnRzXCIgdG9kYXksIG1vcmUgaW4gdGhlXG5cdCAqIGZ1dHVyZSkuIFNlcnZlciB0b29scyBleGVjdXRlIGluLXByb2Nlc3MgYWdhaW5zdCB0aGUgc2Vzc2lvbidzIG93biBzdGF0ZVxuXHQgKiBcdTIwMTQgdW5saWtlIGNsaWVudCB0b29scywgd2hpY2ggcm91bmQtdHJpcCB0byB0aGUgd29ya2JlbmNoLiBgdW5kZWZpbmVkYFxuXHQgKiB1bnRpbCB7QGxpbmsgc2V0U2VydmVyVG9vbEhvc3R9IGlzIGNhbGxlZCBkdXJpbmcgcmVnaXN0cmF0aW9uOyByZW1haW5zXG5cdCAqIGB1bmRlZmluZWRgIGluIHRlc3QgLyBzdGFuZGFsb25lIGNvbnN0cnVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3NlcnZlclRvb2xIb3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29kZXhIb21lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyZWRDb2RleEhvbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJQ29kZXhQcm94eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZXhQcm94eVNlcnZpY2U6IElDb2RleFByb3h5U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YkVuZHBvaW50U2VydmljZTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsXG5cdFx0QElBZ2VudFNka0Rvd25sb2FkZXIgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRTZGtEb3dubG9hZGVyOiBJQWdlbnRTZGtEb3dubG9hZGVyLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5NYW5hZ2VyOiBJQWdlbnRQbHVnaW5NYW5hZ2VyLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRASUFnZW50SG9zdE9UZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX290ZWxTZXJ2aWNlOiBJQWdlbnRIb3N0T1RlbFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIHNlc3Npb25UaXRsZVNpZ25hbDogSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb25maWd1cmVkQ29kZXhIb21lID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q29kZXhBZ2VudENvZGV4SG9tZUVudlZhcl07XG5cdFx0dGhpcy5fY29kZXhIb21lID0gcmVzb2x2ZUZvcmdlQ29kZXhIb21lKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgsIHRoaXMuX2NvbmZpZ3VyZWRDb2RleEhvbWUpO1xuXHRcdHRoaXMuX21ldGFkYXRhU3RvcmUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RleFNlc3Npb25NZXRhZGF0YVN0b3JlKTtcblx0XHR0aGlzLl9wdWJsaXNoQWNjb3VudEluZm8oeyBzdGF0dXM6ICd1bmtub3duJyB9KTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGVzIGFyZSBob3N0LW93bmVkOyBDb2RleCBvbmx5IG9ic2VydmVzIHRoZW0gdG8gY29ycmVsYXRlIGFcblx0XHQvLyByZW5hbWUgd2l0aCBpdHMgY29udmVyc2F0aW9uIGluIE9UZWwuIFRoZSBzZWFtIGFscmVhZHkgZmlsdGVycyB0byB0aGlzXG5cdFx0Ly8gcHJvdmlkZXIncyBzZXNzaW9ucyBhbmQgcHJlY29tcHV0ZXMgdGhlIGNvbnZlcnNhdGlvbiBpZCwgc28gbm8gc2hhcmVkXG5cdFx0Ly8gaG9zdCBzdGF0ZSBpcyByZWFkIGhlcmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2Vzc2lvblRpdGxlU2lnbmFsLm9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlKCh7IHByb3ZpZGVyLCBzZXNzaW9uLCBjb252ZXJzYXRpb25JZCwgdGl0bGUgfSkgPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVyID09PSB0aGlzLmlkKSB7XG5cdFx0XHRcdHRoaXMuX290ZWxTZXJ2aWNlLmVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKGNvbnZlcnNhdGlvbklkLCBzZXNzaW9uLnRvU3RyaW5nKCksIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9oeWRyYXRlRm9yZ2VNb2RlbHNGcm9tRGlzaygpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBtb2RlbCBjYXJkczogJHt0aGlzLl9mb3JnZU1vZGVsc0ZpbGVQYXRoKCl9YCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2lnbkluUmVxdWVzdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RDb25maWdWYWx1ZXM/LigpW0NPREVYX0FDQ09VTlRfU0lHTl9JTl9SRVFVRVNUX0tFWV07XG5cdFx0XHRpZiAodHlwZW9mIHNpZ25JblJlcXVlc3QgPT09ICdzdHJpbmcnICYmIHNpZ25JblJlcXVlc3QgIT09IHRoaXMuX2xhc3RTaWduSW5SZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMuX2xhc3RTaWduSW5SZXF1ZXN0ID0gc2lnbkluUmVxdWVzdDtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDT0RFWF9BQ0NPVU5UX1NJR05fSU5fUkVRVUVTVF9LRVldOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdHZvaWQgdGhpcy5fc2lnbkluVG9DaGF0R1BUKHNpZ25JblJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2lnbk91dFJlcXVlc3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290Q29uZmlnVmFsdWVzPy4oKVtDT0RFWF9BQ0NPVU5UX1NJR05fT1VUX1JFUVVFU1RfS0VZXTtcblx0XHRcdGlmICh0eXBlb2Ygc2lnbk91dFJlcXVlc3QgPT09ICdzdHJpbmcnICYmIHNpZ25PdXRSZXF1ZXN0ICE9PSB0aGlzLl9sYXN0U2lnbk91dFJlcXVlc3QpIHtcblx0XHRcdFx0dGhpcy5fbGFzdFNpZ25PdXRSZXF1ZXN0ID0gc2lnbk91dFJlcXVlc3Q7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ09ERVhfQUNDT1VOVF9TSUdOX09VVF9SRVFVRVNUX0tFWV06IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0dm9pZCB0aGlzLl9zaWduT3V0T2ZDaGF0R1BUKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGFydE1vZGVsUmVmcmVzaEZvckV4aXN0aW5nQ2hhdEdQVFNldHVwKCk7XG5cdFx0XHR0aGlzLl9xdWV1ZVByb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlKCk7XG5cdFx0fSkpO1xuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaFByb3ZpZGVyQ29uZmlndXJhdGlvbigpO1xuXHRcdHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoRm9yRXhpc3RpbmdDaGF0R1BUU2V0dXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldE9wZW5BSUFjY291bnRTdGF0ZShzdGF0ZTogSUNvZGV4QWNjb3VudFN0YXRlLCBfcHVibGlzaCA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUgPSBzdGF0ZTtcblx0XHRpZiAoc3RhdGUuc3RhdHVzICE9PSAnc2lnbmVkSW4nIHx8IHN0YXRlLmF1dGhUeXBlICE9PSAnY2hhdGdwdCcpIHtcblx0XHRcdHRoaXMuX29wZW5BSUFjY291bnRSYXRlTGltaXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChfcHVibGlzaCkge1xuXHRcdFx0dGhpcy5fcHVibGlzaEFjY291bnRJbmZvKHRoaXMuX3RvQWNjb3VudEluZm8oc3RhdGUpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wdWJsaXNoQWNjb3VudEluZm8oYWNjb3VudDogSUNvZGV4QWNjb3VudEluZm8pOiB2b2lkIHtcblx0XHRnZXRBY3RpdmVGb3JnZURpYWdub3N0aWNzTG9nKCk/LnJlY29yZCgnYWdlbnQnLCAnQUNDT1VOVC5TVEFUVVMnLCB7XG5cdFx0XHRzdGF0dXM6IGFjY291bnQuc3RhdHVzLFxuXHRcdFx0ZW1haWw6IGFjY291bnQuZW1haWwsXG5cdFx0XHRwbGFuVHlwZTogYWNjb3VudC5wbGFuVHlwZSxcblx0XHRcdHJlcXVpcmVzT3BlbmFpQXV0aDogYWNjb3VudC5yZXF1aXJlc09wZW5haUF1dGgsXG5cdFx0XHRyYXRlTGltaXQ6IGFjY291bnQucmF0ZUxpbWl0LFxuXHRcdFx0aGFzQXV0aFVybDogISFhY2NvdW50LmF1dGhVcmwsXG5cdFx0XHRlcnJvcjogYWNjb3VudC5lcnJvcixcblx0XHR9KTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5wdWJsaXNoUm9vdFRyYW5zaWVudFZhbHVlcz8uKHsgW0NPREVYX0FDQ09VTlRfTUVUQV9LRVldOiBhY2NvdW50IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2lnbkluVG9DaGF0R1BUKHJlcXVlc3Q6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb2dyZXNzSW50ZXJlc3QgPSB0aGlzLl9hZ2VudFNka0Rvd25sb2FkZXIuYWNxdWlyZURvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdChDb2RleFNka1BhY2thZ2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLl9pc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQoKSkpIHtcblx0XHRcdFx0dGhpcy5fcHVibGlzaEFjY291bnRJbmZvKHsgc3RhdHVzOiAnZG93bmxvYWRpbmcnIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLl9yZWZyZXNoQWNjb3VudChjb25uZWN0aW9uLmNsaWVudCk7XG5cdFx0XHRpZiAoYWNjb3VudC5zdGF0dXMgPT09ICdzaWduZWRJbicgJiYgYWNjb3VudC5hdXRoVHlwZSA9PT0gJ2NoYXRncHQnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY29ubmVjdGlvbi5jbGllbnQucmVxdWVzdDwnYWNjb3VudC9sb2dpbi9zdGFydCcsIExvZ2luQWNjb3VudFJlc3BvbnNlPignYWNjb3VudC9sb2dpbi9zdGFydCcsIHsgdHlwZTogJ2NoYXRncHQnIH0pO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgPT09ICdjaGF0Z3B0Jykge1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoQWNjb3VudEluZm8oeyAuLi50aGlzLl90b0FjY291bnRJbmZvKHRoaXMuX29wZW5BSUFjY291bnRTdGF0ZSksIGF1dGhVcmw6IHJlc3BvbnNlLmF1dGhVcmwsIGF1dGhVcmxOb25jZTogcmVxdWVzdCB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdHRoaXMuX3NldE9wZW5BSUFjY291bnRTdGF0ZSh7IHVzYWdlU291cmNlOiAnb3BlbmFpJywgc3RhdHVzOiAnZXJyb3InLCBlcnJvcjogbWVzc2FnZSB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3NJbnRlcmVzdC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2lnbk91dE9mQ2hhdEdQVCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24uY2xpZW50LnJlcXVlc3Q8J2FjY291bnQvbG9nb3V0Jz4oJ2FjY291bnQvbG9nb3V0JywgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hBY2NvdW50KGNvbm5lY3Rpb24uY2xpZW50KTtcblx0XHRcdHRoaXMuX3N5bmNPZmZpY2lhbENvZGV4Q2FyZChbXSk7XG5cdFx0XHR0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdFx0dGhpcy5fc2V0T3BlbkFJQWNjb3VudFN0YXRlKHsgdXNhZ2VTb3VyY2U6ICdvcGVuYWknLCBzdGF0dXM6ICdlcnJvcicsIGVycm9yOiBtZXNzYWdlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvQWNjb3VudEluZm8oc3RhdGU6IElDb2RleEFjY291bnRTdGF0ZSk6IElDb2RleEFjY291bnRJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRlbWFpbDogc3RhdGUuYXV0aFR5cGUgPT09ICdjaGF0Z3B0JyA/IHN0YXRlLmVtYWlsIDogdW5kZWZpbmVkLFxuXHRcdFx0cGxhblR5cGU6IHN0YXRlLmF1dGhUeXBlID09PSAnY2hhdGdwdCcgPyBzdGF0ZS5wbGFuVHlwZSA6IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVpcmVzT3BlbmFpQXV0aDogc3RhdGUucmVxdWlyZXNPcGVuYWlBdXRoLFxuXHRcdFx0cmF0ZUxpbWl0OiBzdGF0ZS5hdXRoVHlwZSA9PT0gJ2NoYXRncHQnID8gdGhpcy5fb3BlbkFJQWNjb3VudFJhdGVMaW1pdCA6IHVuZGVmaW5lZCxcblx0XHRcdGVycm9yOiBzdGF0ZS5zdGF0dXMgPT09ICdlcnJvcicgPyBzdGF0ZS5lcnJvciA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRTZXNzaW9uRm9yTW9kZWxQcm92aWRlckNoYW5nZShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBtb2RlbFByb3ZpZGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSByZXBsYWNpbmcgdGhyZWFkICR7c2Vzc2lvbi50aHJlYWRJZH0gd2l0aCBhIGZyZXNoICR7bW9kZWxQcm92aWRlcn0gdGhyZWFkYCk7XG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5kZWxldGUoc2Vzc2lvbi50aHJlYWRJZCk7XG5cdFx0c2Vzc2lvbi50aHJlYWRJZCA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZFRvb2xzU2lnID0gdW5kZWZpbmVkO1xuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkTWNwU2lnID0gdW5kZWZpbmVkO1xuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkQ3VzdG9taXphdGlvbnNTaWcgPSB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRQZXJtaXNzaW9uc1NpZyA9IHVuZGVmaW5lZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZE1vZGVsUHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvbi5uZWVkc1Jlc3VtZSA9IGZhbHNlO1xuXHRcdHNlc3Npb24uaG9zdFR1cm5JZEJ5QXBwVHVybklkLmNsZWFyKCk7XG5cdFx0c2Vzc2lvbi5jb2RleFR1cm5JZEJ5SG9zdFR1cm5JZC5jbGVhcigpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBBdXRoXG5cblx0Z2V0UHJvdGVjdGVkUmVzb3VyY2VzKCk6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXSB7XG5cdFx0Ly8gS2VlcCB0aGUgQ29waWxvdCByZXNvdXJjZSBhZHZlcnRpc2VkIGV2ZW4gd2hlbiBvcHRpb25hbCBzbyBhbiBleGlzdGluZ1xuXHRcdC8vIHRva2VuIGlzIHN0aWxsIGZvcndhcmRlZCBhbmQgQ29waWxvdC1iYWNrZWQgbW9kZWxzIHJlbWFpbiBhZGRpdGl2ZS5cblx0XHQvLyBXaXRob3V0IGEgdXNhYmxlIENoYXRHUFQgc2V0dXAsIGhvd2V2ZXIsIENvcGlsb3QgaXMgdGhlIG9ubHkgYXZhaWxhYmxlXG5cdFx0Ly8gdHJhbnNwb3J0IGFuZCBtdXN0IHN0YXkgcmVxdWlyZWQgc28gdGhlIHdvcmtiZW5jaCBzaG93cyBpdHMgYXV0aCBnYXRlLlxuXHRcdGNvbnN0IGNvcGlsb3RSZXNvdXJjZSA9IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKTtcblx0XHRjb25zdCBtb2RlbFByb3ZpZGVycyA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RDb25maWdWYWx1ZXM/LigpW0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldKS5wcm92aWRlcnNcblx0XHRcdC5maWx0ZXIocHJvdmlkZXIgPT4gcHJvdmlkZXIuYXV0aE1vZGUgPT09ICdzdG9yZWQnKVxuXHRcdFx0Lm1hcCgocHJvdmlkZXIpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhID0+ICh7XG5cdFx0XHRcdHJlc291cmNlOiBjb2RleFByb3ZpZGVyU2VjcmV0UmVzb3VyY2UocHJvdmlkZXIuaWQpLFxuXHRcdFx0XHRyZXNvdXJjZV9uYW1lOiBwcm92aWRlci5uYW1lIHx8IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRiZWFyZXJfbWV0aG9kc19zdXBwb3J0ZWQ6IFsnaGVhZGVyJ10sXG5cdFx0XHRcdHJlcXVpcmVkOiBmYWxzZSxcblx0XHRcdH0pKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5faGFzRXhpc3RpbmdDaGF0R1BUU2V0dXAoKSA/IHsgLi4uY29waWxvdFJlc291cmNlLCByZXF1aXJlZDogZmFsc2UgfSA6IGNvcGlsb3RSZXNvdXJjZSxcblx0XHRcdHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKSxcblx0XHRcdHtcblx0XHRcdFx0cmVzb3VyY2U6IEdST0tfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UsXG5cdFx0XHRcdHJlc291cmNlX25hbWU6ICdHcm9rIEJ1aWxkJyxcblx0XHRcdFx0YmVhcmVyX21ldGhvZHNfc3VwcG9ydGVkOiBbJ2hlYWRlciddLFxuXHRcdFx0XHRyZXF1aXJlZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNvdXJjZTogREVFUFNFRUtfQUNDT1VOVF9TRUNSRVRfUkVTT1VSQ0UsXG5cdFx0XHRcdHJlc291cmNlX25hbWU6ICdEZWVwU2VlayBIYXJuZXNzJyxcblx0XHRcdFx0YmVhcmVyX21ldGhvZHNfc3VwcG9ydGVkOiBbJ2hlYWRlciddLFxuXHRcdFx0XHRyZXF1aXJlZDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0Li4ubW9kZWxQcm92aWRlcnMsXG5cdFx0XTtcblx0fVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShyZXNvdXJjZTogc3RyaW5nLCB0b2tlbjogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKEZvcmdlVmVuZG9yQWNjb3VudEhvc3QuY29uc3VtZUF1dGhlbnRpY2F0ZShyZXNvdXJjZSwgdG9rZW4pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZFByb3ZpZGVyID0gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKClbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV0pLnByb3ZpZGVyc1xuXHRcdFx0LmZpbmQocHJvdmlkZXIgPT4gcHJvdmlkZXIuYXV0aE1vZGUgPT09ICdzdG9yZWQnICYmIGNvZGV4UHJvdmlkZXJTZWNyZXRSZXNvdXJjZShwcm92aWRlci5pZCkgPT09IHJlc291cmNlKTtcblx0XHRpZiAoY29uZmlndXJlZFByb3ZpZGVyKSB7XG5cdFx0XHRzZXRWZW5kb3JBY2NvdW50U2VjcmV0KHByb3ZpZGVyU2VjcmV0SWQoY29uZmlndXJlZFByb3ZpZGVyLmlkKSwgdG9rZW4gfHwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fbW9kZWxQcm92aWRlckFwaUtleXMuZ2V0KGNvbmZpZ3VyZWRQcm92aWRlci5pZCk7XG5cdFx0XHRpZiAodG9rZW4pIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxQcm92aWRlckFwaUtleXMuc2V0KGNvbmZpZ3VyZWRQcm92aWRlci5pZCwgdG9rZW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxQcm92aWRlckFwaUtleXMuZGVsZXRlKGNvbmZpZ3VyZWRQcm92aWRlci5pZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJldmlvdXMgIT09ICh0b2tlbiB8fCB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdC8vIFJvb3QgY29uZmlnIGFuZCBjcmVkZW50aWFsIHVwZGF0ZXMgdHJhdmVsIGFzIGFkamFjZW50IHByb3RvY29sXG5cdFx0XHRcdC8vIG1lc3NhZ2VzLiBMZXQgYW55IGNvbmZpZy50b21sIHdyaXRlIGZpbmlzaCBiZWZvcmUgcmVwbGFjaW5nIHRoZVxuXHRcdFx0XHQvLyBhcHAtc2VydmVyIHNvIHRoZSB3cml0ZSBjYW5ub3QgYmUgYWJvcnRlZCBtaWR3YXkuXG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDb25maWd1cmF0aW9uV3JpdGUgPSB0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZTtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbkdlbmVyYXRpb24gPSB0aGlzLl9jb25uZWN0aW9uR2VuZXJhdGlvbjtcblx0XHRcdFx0dm9pZCBwZW5kaW5nQ29uZmlndXJhdGlvbldyaXRlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9tb2RlbFByb3ZpZGVyQXBpS2V5cy5nZXQoY29uZmlndXJlZFByb3ZpZGVyLmlkKTtcblx0XHRcdFx0XHRpZiAoY3VycmVudCA9PT0gKHRva2VuIHx8IHVuZGVmaW5lZCkgJiYgY29ubmVjdGlvbkdlbmVyYXRpb24gPT09IHRoaXMuX2Nvbm5lY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlQ29ubmVjdGlvbigpO1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gQVBJIGtleSAke3Rva2VuID8gJ3VwZGF0ZWQnIDogJ2NsZWFyZWQnfSBmb3IgbW9kZWwgcHJvdmlkZXIgJHtjb25maWd1cmVkUHJvdmlkZXIuaWR9YCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHJlc291cmNlID09PSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCkucmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAocmVzb3VyY2UgIT09IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5yZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBub3JtYWxpemVkVG9rZW4gPSB0b2tlbiB8fCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IHRoaXMuX2dpdGh1YlRva2VuICE9PSBub3JtYWxpemVkVG9rZW47XG5cdFx0dGhpcy5fZ2l0aHViVG9rZW4gPSBub3JtYWxpemVkVG9rZW47XG5cdFx0aWYgKGNoYW5nZWQgJiYgdGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAncmVhZHknICYmIHRoaXMuX2Nvbm5lY3Rpb24ucHJveHlIYW5kbGUpIHtcblx0XHRcdC8vIENvZGV4IHN0YXlzIHJ1bm5pbmcgXHUyMDE0IHByb3h5IHJlYWRzIHRoZSBuZXcgdG9rZW4gZnJvbSBpdHNcblx0XHRcdC8vIG93biBjZWxsIG9uIHRoZSBuZXh0IHJlcXVlc3QgKERlY2lzaW9uIDQpLlxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbi5wcm94eUhhbmRsZS5zZXRUb2tlbihub3JtYWxpemVkVG9rZW4gPz8gJycpO1xuXHRcdFx0dGhpcy5fcXVldWVNb2RlbFJlZnJlc2goKTtcblx0XHR9IGVsc2UgaWYgKGNoYW5nZWQpIHtcblx0XHRcdC8vIERlZmVyIG1vZGVsIHJlZnJlc2ggdW50aWwgdGhlIGNvbm5lY3Rpb24gY29tZXMgdXAuXG5cdFx0XHR0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8obm9ybWFsaXplZFRva2VuID8gJ1tDb2RleF0gQXV0aCB0b2tlbiB1cGRhdGVkJyA6ICdbQ29kZXhdIEF1dGggdG9rZW4gY2xlYXJlZCcpO1xuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaFByb3ZpZGVyQ29uZmlndXJhdGlvbigpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY2VpdmVzIGEgYmVhcmVyIHRva2VuIHRoZSB3b3JrYmVuY2ggYWNxdWlyZWQgZm9yIGEgcHJvdGVjdGVkIHJlc291cmNlXG5cdCAqICh0aGUgYGF1dGhlbnRpY2F0ZWAgY29tbWFuZCBpcyBmYW5uZWQgb3V0IHRvIGV2ZXJ5IGFnZW50KS4gSWYgdGhlXG5cdCAqIHJlc291cmNlIG1hcHMgdG8gb25lIG9yIG1vcmUgY29uZmlndXJlZCBhdXRoLWdhdGVkIGh0dHAgTUNQIHNlcnZlcnNcblx0ICogKHZpYSB0aGUgYXNzb2NpYXRpb24gcmVjb3JkZWQgYXQgZGlzY292ZXJ5IHRpbWUsIG9yIGEgZGlyZWN0IFVSTCBtYXRjaCksXG5cdCAqIHN0b3JlIHRoZSB0b2tlbiBwZXIgc2VydmVyIFVSTCAoc28ge0BsaW5rIF9idWlsZFNlc3Npb25NY3BTZXJ2ZXJzfSBpbmplY3RzXG5cdCAqIGl0KSBhbmQgcmVjb25uZWN0IHRoZSBhZmZlY3RlZCB0aHJlYWRzIHNvIGNvZGV4IHBpY2tzIGl0IHVwLiBUaGlzIGlzIHRoZVxuXHQgKiBjb2RleCBlbmQgb2YgdGhlICpzYW1lKiBPQXV0aCBtZWNoYW5pc20gdGhlIENvcGlsb3QgYWdlbnQgdXNlczogdGhlXG5cdCAqIHdvcmtiZW5jaCBkb2VzIHRoZSBzaWduLWluLCB0aGUgYWdlbnQgaW5qZWN0cyB0aGUgcmVzdWx0aW5nIGJlYXJlci5cblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSB0b2tlbiB3YXMgY29uc3VtZWQgYnkgYW4gTUNQIHNlcnZlciAodGhlIEdpdEh1YiBhZ2VudFxuXHQgKiB0b2tlbiBmbG93cyB0aHJvdWdoIHtAbGluayBhdXRoZW50aWNhdGV9IGluc3RlYWQpLlxuXHQgKi9cblx0YXN5bmMgaGFuZGxlQXV0aGVudGljYXRpb25Ub2tlbihwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRSZXNvdXJjZSA9IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwocGFyYW1zLnJlc291cmNlKTtcblx0XHRpZiAobm9ybWFsaXplZFJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gVGhlIHdvcmtiZW5jaCBhdXRoZW50aWNhdGVzIHRoZSBPQXV0aCBgcmVzb3VyY2VgLCB3aGljaCBSRkMgOTcyOFxuXHRcdC8vIGRpc2NvdmVyeSBtYXkgcmVwb3J0IGFzIGRpZmZlcmVudCBmcm9tIHRoZSBjb25maWd1cmVkIHNlcnZlciBVUkwuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgc2VydmVyIFVSTChzKSB0aGlzIHJlc291cmNlIHVubG9ja3M6IHRoZSBhc3NvY2lhdGlvblxuXHRcdC8vIHJlY29yZGVkIGF0IGRpc2NvdmVyeSB0aW1lLCBwbHVzIGEgZGlyZWN0IG1hdGNoIHdoZW4gdGhlIHJlc291cmNlIElTXG5cdFx0Ly8gYSBjb25maWd1cmVkIHNlcnZlciBVUkwgKGRpc2NvdmVyeSByZXR1cm5lZCB0aGUgVVJMIHVuY2hhbmdlZCwgb3Igd2FzXG5cdFx0Ly8gc2tpcHBlZCkuXG5cdFx0Y29uc3Qgc2VydmVyVXJscyA9IG5ldyBTZXQodGhpcy5fbWNwQXV0aFNlcnZlclVybHNCeVJlc291cmNlLmdldChub3JtYWxpemVkUmVzb3VyY2UpID8/IFtdKTtcblx0XHRpZiAodGhpcy5faXNDb25maWd1cmVkSHR0cFNlcnZlclVybChub3JtYWxpemVkUmVzb3VyY2UpKSB7XG5cdFx0XHRzZXJ2ZXJVcmxzLmFkZChub3JtYWxpemVkUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRpZiAoc2VydmVyVXJscy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXJVcmwgb2Ygc2VydmVyVXJscykge1xuXHRcdFx0aWYgKHRoaXMuX21jcEF1dGhUb2tlbnMuZ2V0KHNlcnZlclVybCkgIT09IHBhcmFtcy50b2tlbikge1xuXHRcdFx0XHR0aGlzLl9tY3BBdXRoVG9rZW5zLnNldChzZXJ2ZXJVcmwsIHBhcmFtcy50b2tlbik7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWNoYW5nZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gc3RvcmVkIE1DUCBhdXRoIHRva2VuIGZvciAke3BhcmFtcy5yZXNvdXJjZX07IHJlY29ubmVjdGluZyBhZmZlY3RlZCBzZXNzaW9uc2ApO1xuXHRcdGF3YWl0IHRoaXMuX3JlY29ubmVjdFNlc3Npb25zRm9yTWNwQXV0aChzZXJ2ZXJVcmxzKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIGBub3JtYWxpemVkVXJsYCBpcyBhIGN1cnJlbnRseS1jb25maWd1cmVkIGh0dHAgTUNQIHNlcnZlciAocm9vdCBjb25maWcgb3IgYW55IHNlc3Npb24ncyBjbGllbnQgcGx1Z2lucykuICovXG5cdHByaXZhdGUgX2lzQ29uZmlndXJlZEh0dHBTZXJ2ZXJVcmwobm9ybWFsaXplZFVybDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKE9iamVjdC52YWx1ZXMoY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5KSkpXG5cdFx0XHQuc29tZShzZXJ2ZXIgPT4gc2VydmVyLnVybCAhPT0gdW5kZWZpbmVkICYmIG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwoc2VydmVyLnVybCkgPT09IG5vcm1hbGl6ZWRVcmwpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9ucy52YWx1ZXMoKV0uc29tZShzZXNzaW9uID0+XG5cdFx0XHRbLi4udGhpcy5faHR0cE1jcFNlcnZlclVybHMoc2Vzc2lvbikudmFsdWVzKCldLmluY2x1ZGVzKG5vcm1hbGl6ZWRVcmwpLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25uZWN0cyBldmVyeSBtYXRlcmlhbGl6ZWQgc2Vzc2lvbiB3aG9zZSBtZXJnZWQgTUNQIHNlcnZlcnMgaW5jbHVkZSBvbmVcblx0ICogb2YgYG5vcm1hbGl6ZWRVcmxzYCBzbyBjb2RleCByZS1yZWFkcyBgY29uZmlnLm1jcF9zZXJ2ZXJzYCB3aXRoIHRoZVxuXHQgKiBpbmplY3RlZCBgQXV0aG9yaXphdGlvbmAgaGVhZGVyLiBBIHRocmVhZCB0aGF0IGhhcyBub3QgeWV0IGNvbW1pdHRlZCBhXG5cdCAqIHR1cm4gaXMgcmVzdGFydGVkIChgdGhyZWFkL3N0YXJ0YCwgbG9zc2xlc3MpOyBvbmUgd2l0aCBoaXN0b3J5IGlzIHJlc3VtZWRcblx0ICogKGB0aHJlYWQvcmVzdW1lYCBjYXJyaWVzIHRoZSBzYW1lIGBjb25maWdgIGZpZWxkLCBsb2FkaW5nIGhpc3RvcnkgZnJvbSB0aGVcblx0ICogcm9sbG91dCkgb24gaXRzIG5leHQgdHVybiB2aWEge0BsaW5rIElDb2RleFNlc3Npb24ubmVlZHNSZXN1bWV9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25uZWN0U2Vzc2lvbnNGb3JNY3BBdXRoKG5vcm1hbGl6ZWRVcmxzOiBSZWFkb25seVNldDxzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCB8fCBzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIVsuLi50aGlzLl9odHRwTWNwU2VydmVyVXJscyhzZXNzaW9uKS52YWx1ZXMoKV0uc29tZSh1cmwgPT4gbm9ybWFsaXplZFVybHMuaGFzKHVybCkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzZXNzaW9uLmZpcnN0VHVyblNlbnQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0YXJ0VGhyZWFkV2l0aEN1cnJlbnRUb29scyhzZXNzaW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIHJlY29ubmVjdCBhZnRlciBNQ1AgYXV0aCBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBIHRocmVhZCB3aXRoIGhpc3RvcnkgaXMgcmVzdW1lZCAod2l0aCB0aGUgY3VycmVudCBjb25maWcpIG9uXG5cdFx0XHRcdC8vIGl0cyBuZXh0IHR1cm4gcmF0aGVyIHRoYW4gcmVzdGFydGVkLCBzbyBub3RoaW5nIGlzIGxvc3QuXG5cdFx0XHRcdHRoaXMuX21hcmtTZXNzaW9uRm9yUmVsb2FkKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiB7QGxpbmsgSUFnZW50LnJlZnJlc2hNb2RlbHN9LiBDb2FsZXNjZXMgb250byBhbiBpbi1mbGlnaHQgcmVmcmVzaCBcdTIwMTQgZnJvbVxuXHQgKiBhbiBhY2NvdW50IGNoYW5nZSBvciBhbiBlYXJsaWVyIHRpY2sgXHUyMDE0IHJhdGhlciB0aGFuIGlzc3VpbmcgYVxuXHQgKiBzZWNvbmQgZW51bWVyYXRpb24sIGFuZCBuZXZlciByZWplY3RzOiB7QGxpbmsgX3JlZnJlc2hNb2RlbHN9IGxvZ3MgYW5kXG5cdCAqIGFwcGxpZXMgaXRzIG93biBzdGFsZS13cml0ZSBndWFyZHMgb24gZmFpbHVyZS5cblx0ICovXG5cdHJlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsc1JlZnJlc2hQcm9taXNlID8/IHRoaXMuX3F1ZXVlTW9kZWxSZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZU1vZGVsUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRjb25zdCByZWZyZXNoUHJvbWlzZSA9IHRoaXMuX3JlZnJlc2hNb2RlbHMoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9tb2RlbHNSZWZyZXNoUHJvbWlzZSA9PT0gcmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2UgPSByZWZyZXNoUHJvbWlzZTtcblx0XHRyZXR1cm4gcmVmcmVzaFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVNb2RlbFByb3ZpZGVyQXV0aGVudGljYXRlZChtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gbW9kZWwgPyBwYXJzZUNvZGV4TW9kZWxTZWxlY3Rpb24obW9kZWwpLm1vZGVsUHJvdmlkZXIgOiBDT0RFWF9DT1BJTE9UX01PREVMX1BST1ZJREVSO1xuXHRcdGlmIChtb2RlbFByb3ZpZGVyICE9PSBDT0RFWF9DT1BJTE9UX01PREVMX1BST1ZJREVSKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5fZ2l0aHViVG9rZW47XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdEFIUF9BVVRIX1JFUVVJUkVELFxuXHRcdFx0XHQnQXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQgdG8gdXNlIENvZGV4Jyxcblx0XHRcdFx0dGhpcy5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaW1hZ2VHZW5lcmF0aW9uRW5hYmxlZEZvck1vZGVsUHJvdmlkZXIobW9kZWxQcm92aWRlcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG1vZGVsUHJvdmlkZXIgPT09IENPREVYX09QRU5BSV9NT0RFTF9QUk9WSURFUlxuXHRcdFx0JiYgdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLnN0YXR1cyA9PT0gJ3NpZ25lZEluJ1xuXHRcdFx0JiYgdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLmF1dGhUeXBlID09PSAnY2hhdGdwdCc7XG5cdH1cblxuXHRwcml2YXRlIF9kZWZhdWx0TW9kZWwoKTogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuX21vZGVscy5nZXQoKTtcblx0XHRjb25zdCBjaG9zZW4gPSBtb2RlbHNbMF07XG5cdFx0cmV0dXJuIGNob3NlbiA/IHsgaWQ6IGNob3Nlbi5pZCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3VwcG9ydGVkTW9kZWxPclVuZGVmaW5lZChtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG1vZGVsICYmIHRoaXMuX21vZGVscy5nZXQoKS5zb21lKG0gPT4gbS5pZCA9PT0gbW9kZWwuaWQpKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fVxuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIFVua25vd24gbW9kZWwgJyR7bW9kZWwuaWR9J2ApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRNb2RlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZU1vZGVsKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPE1vZGVsU2VsZWN0aW9uPiB7XG5cdFx0Ly8gRW5zdXJlIHRoZSBjYXRhbG9nIGlzIHBvcHVsYXRlZCBiZWZvcmUgdmFsaWRhdGluZyB0aGUgc2VsZWN0aW9uIHNvIGFcblx0XHQvLyBtb2RlbCBwaWNrZWQgYmVmb3JlIG1vZGVscyBmaW5pc2hlZCBsb2FkaW5nIGlzbid0IGRyb3BwZWQuXG5cdFx0aWYgKHRoaXMuX21vZGVscy5nZXQoKS5sZW5ndGggPT09IDAgJiYgdGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuX21vZGVsc1JlZnJlc2hQcm9taXNlO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3RlZCA9IHRoaXMuX3N1cHBvcnRlZE1vZGVsT3JVbmRlZmluZWQoc2Vzc2lvbi5tb2RlbCk7XG5cdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHRzZXNzaW9uLm1vZGVsID0gc2VsZWN0ZWQ7XG5cdFx0XHRyZXR1cm4gc2VsZWN0ZWQ7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignQ29kZXggaGFzIG5vIGF2YWlsYWJsZSBtb2RlbHMuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVSZWFzb25pbmdFZmZvcnRDb25maWdTY2hlbWEoXG5cdFx0c3VwcG9ydGVkRWZmb3J0czogcmVhZG9ubHkgeyByZWFkb25seSByZWFzb25pbmdFZmZvcnQ6IHN0cmluZzsgcmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkLFxuXHRcdGRlY2xhcmVkRGVmYXVsdD86IHN0cmluZyxcblx0XHRtb2RlbElkPzogc3RyaW5nLFxuXHQpOiBDb25maWdTY2hlbWEgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc3VwcG9ydGVkRWZmb3J0cz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlZmZvcnRzID0gc3VwcG9ydGVkRWZmb3J0cy5tYXAob3B0aW9uID0+IG9wdGlvbi5yZWFzb25pbmdFZmZvcnQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0W0NPREVYX1RISU5LSU5HX0xFVkVMX0tFWV06IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvZGV4Lm1vZGVsVGhpbmtpbmdMZXZlbC50aXRsZScsIFwiVGhpbmtpbmcgTGV2ZWxcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb2RleC5tb2RlbFRoaW5raW5nTGV2ZWwuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ29kZXggdXNlcy5cIiksXG5cdFx0XHRcdFx0ZGVmYXVsdDogcmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQoZWZmb3J0cywgZGVjbGFyZWREZWZhdWx0LCBtb2RlbElkKSxcblx0XHRcdFx0XHRlbnVtOiBlZmZvcnRzLFxuXHRcdFx0XHRcdGVudW1MYWJlbHM6IGVmZm9ydHMubWFwKGdldFJlYXNvbmluZ0VmZm9ydExhYmVsKSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBzdXBwb3J0ZWRFZmZvcnRzLm1hcChvcHRpb24gPT4gb3B0aW9uLmRlc2NyaXB0aW9uIHx8IGdldFJlYXNvbmluZ0VmZm9ydERlc2NyaXB0aW9uKG9wdGlvbi5yZWFzb25pbmdFZmZvcnQpIHx8ICcnKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlYXNvbmluZ0VmZm9ydChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBjb25maWdSZXNvdXJjZTogVVJJKTogUmVhc29uaW5nRWZmb3J0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtb2RlbENvbmZpZ0VmZm9ydCA9IG5hcnJvd1JlYXNvbmluZ0VmZm9ydChzZXNzaW9uLm1vZGVsPy5jb25maWc/LltDT0RFWF9USElOS0lOR19MRVZFTF9LRVldKTtcblx0XHRpZiAobW9kZWxDb25maWdFZmZvcnQpIHtcblx0XHRcdHJldHVybiBtb2RlbENvbmZpZ0VmZm9ydDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhjb25maWdSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRyZXR1cm4gbmFycm93UmVhc29uaW5nRWZmb3J0KGNvbmZpZz8uW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5Nb2RlbFJlYXNvbmluZ0VmZm9ydF0pID8/IGNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5Nb2RlbFJlYXNvbmluZ0VmZm9ydF07XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkU2Vzc2lvbkNvbmZpZyhjb25maWdSZXNvdXJjZTogVVJJKTogUmV0dXJuVHlwZTx0eXBlb2YgY29kZXhTZXNzaW9uQ29uZmlnU2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0PiB7XG5cdFx0cmV0dXJuIGNvZGV4U2Vzc2lvbkNvbmZpZ1NjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdChcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMoY29uZmlnUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRjb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIENvZGV4IHNlY3VyaXR5IGF4ZXMgKGFwcHJvdmFsIHBvbGljeSwgc2FuZGJveCwgcmV2aWV3ZXIpIGZvciBhXG5cdCAqIGxpdmUgb3IgcmVzdG9yZWQgc2Vzc2lvbiBmcm9tIGl0cyBSQVcgcGVyc2lzdGVkIGNvbmZpZyB2YWx1ZXMuXG5cdCAqXG5cdCAqIFRoZSByYXcgdmFsdWVzIGFyZSBub3JtYWxpemVkIHRocm91Z2gge0BsaW5rIG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXN9XG5cdCAqICh0aGUgc2FtZSBtaWdyYXRpb24gdGhlIHJlc3RvcmUgcGF0aCBhcHBsaWVzKSBiZWZvcmUgcmVzb2x2aW5nLCBzbyB0aGVcblx0ICogYXhlcyB3ZSBzZW5kIHRvIHRoZSBhcHAtc2VydmVyIGFsd2F5cyBtYXRjaCB0aGUgcHJlc2V0IHRoZSBcIkFwcHJvdmFsc1wiIGNoaXBcblx0ICogZGlzcGxheXMuIFRoaXMgbWF0dGVycyBmb3IgdHdvIGxlZ2FjeSBzaGFwZXM6XG5cdCAqIC0gYSBzZXNzaW9uIHRoYXQgcGVyc2lzdGVkIG9ubHkgYHNhbmRib3hNb2RlID0gJ3JlYWQtb25seSdgIGlzIHByZXNlcnZlZFxuXHQgKiAgIHZlcmJhdGltLCBzbyBpdCBpcyBOT1Qgc2lsZW50bHkgZXNjYWxhdGVkIGJhY2sgdG8gYHdvcmtzcGFjZS13cml0ZWAgb25cblx0ICogICByZXN1bWUgKHRoZSBjaGlwIG92ZXItcHJvbWlzZXMsIGJ1dCB0aGUgc2Vzc2lvbiBzdGF5cyBtb3JlIGxvY2tlZCBkb3duKTtcblx0ICogLSBhIHNlc3Npb24gdGhhdCBwZXJzaXN0ZWQgYGFwcHJvdmFsUG9saWN5ID0gJ25ldmVyJ2AgKyBgd29ya3NwYWNlLXdyaXRlYFxuXHQgKiAgICh3aGljaCB0aGUgY2hpcCByZW5kZXJzIGFzIFwiRGVmYXVsdCBQZXJtaXNzaW9uc1wiKSBpcyBzbmFwcGVkIG9udG8gdGhlXG5cdCAqICAgYGRlZmF1bHRgIHByZXNldCdzIGBvbi1yZXF1ZXN0YCBwb2xpY3kgc28gaXQgYWN0dWFsbHkgcHJvbXB0cywgaW5zdGVhZCBvZlxuXHQgKiAgIHJ1bm5pbmcgY29tbWFuZHMgdW5wcm9tcHRlZCB3aGlsZSB0aGUgY2hpcCBjbGFpbXMgaXQgd291bGQgYXNrLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVybWlzc2lvbkF4aXNEZWZhdWx0cygpOiB7IGFwcHJvdmFsUG9saWN5OiBDb2RleEFwcHJvdmFsUG9saWN5OyBzYW5kYm94TW9kZTogU2FuZGJveE1vZGUgfSB7XG5cdFx0Y29uc3QgcHJlc2V0ID0gbmFycm93Q29kZXhQZXJtaXNzaW9uc1ByZXNldCh0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNbJ2NvZGV4LnBlcm1pc3Npb25zUHJlc2V0J10pID8/IENPREVYX0RFRkFVTFRfUEVSTUlTU0lPTlNfUFJFU0VUO1xuXHRcdGNvbnN0IGF4ZXMgPSByZXNvbHZlQ29kZXhQZXJtaXNzaW9uc1ByZXNldChwcmVzZXQpO1xuXHRcdHJldHVybiB7IGFwcHJvdmFsUG9saWN5OiBheGVzLmFwcHJvdmFsUG9saWN5LCBzYW5kYm94TW9kZTogYXhlcy5zYW5kYm94TW9kZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25QZXJtaXNzaW9ucyhjb25maWdSZXNvdXJjZTogVVJJKTogSUNvZGV4UmVzb2x2ZWRQZXJtaXNzaW9ucyB7XG5cdFx0Y29uc3QgcmF3VmFsdWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlcyhjb25maWdSZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMuX3Blcm1pc3Npb25BeGlzRGVmYXVsdHMoKTtcblx0XHRyZXR1cm4gcmVzb2x2ZUNvZGV4UGVybWlzc2lvbnMobWlncmF0ZUNvZGV4UGVybWlzc2lvblZhbHVlcyhyYXdWYWx1ZXMsIGRlZmF1bHRzKSwgZGVmYXVsdHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVybWlzc2lvbnNTaWduYXR1cmUoY29uZmlnUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgeyBhcHByb3ZhbFBvbGljeSwgc2FuZGJveE1vZGUsIGFwcHJvdmFsc1Jldmlld2VyIH0gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblBlcm1pc3Npb25zKGNvbmZpZ1Jlc291cmNlKTtcblx0XHRyZXR1cm4gYCR7YXBwcm92YWxQb2xpY3l9fCR7c2FuZGJveE1vZGV9fCR7YXBwcm92YWxzUmV2aWV3ZXJ9YDtcblx0fVxuXG5cdHByaXZhdGUgX3NhbmRib3hQb2xpY3koc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgY29uZmlnOiBSZXR1cm5UeXBlPHR5cGVvZiBjb2RleFNlc3Npb25Db25maWdTY2hlbWEudmFsaWRhdGVPckRlZmF1bHQ+LCBtb2RlOiBTYW5kYm94TW9kZSk6IFNhbmRib3hQb2xpY3kge1xuXHRcdGlmIChtb2RlID09PSAnZGFuZ2VyLWZ1bGwtYWNjZXNzJykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ2RhbmdlckZ1bGxBY2Nlc3MnIH07XG5cdFx0fVxuXHRcdGNvbnN0IG5ldHdvcmtBY2Nlc3MgPSBuYXJyb3dCb29sZWFuKGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdKSA/PyBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuTmV0d29ya0FjY2Vzc0VuYWJsZWRdO1xuXHRcdGlmIChtb2RlID09PSAncmVhZC1vbmx5Jykge1xuXHRcdFx0cmV0dXJuIHsgdHlwZTogJ3JlYWRPbmx5JywgbmV0d29ya0FjY2VzczogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgYWRkaXRpb25hbERpcmVjdG9yaWVzID0gbmFycm93QWRkaXRpb25hbERpcmVjdG9yaWVzKGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuQWRkaXRpb25hbERpcmVjdG9yaWVzXSkgPz8gW107XG5cdFx0Y29uc3Qgd3JpdGFibGVSb290cyA9IHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pXG5cdFx0XHQ/IGRpc3RpbmN0QWJzb2x1dGVQYXRocyhbXG5cdFx0XHRcdC4uLnRoaXMuX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uKSxcblx0XHRcdFx0Li4uYWRkaXRpb25hbERpcmVjdG9yaWVzLFxuXHRcdFx0XSlcblx0XHRcdDogW1xuXHRcdFx0XHQuLi4oc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8gW3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeS5mc1BhdGhdIDogW10pLFxuXHRcdFx0XHQuLi5hZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0XHRdO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnd29ya3NwYWNlV3JpdGUnLFxuXHRcdFx0d3JpdGFibGVSb290cyxcblx0XHRcdG5ldHdvcmtBY2Nlc3MsXG5cdFx0XHRleGNsdWRlVG1wZGlyRW52VmFyOiBmYWxzZSxcblx0XHRcdGV4Y2x1ZGVTbGFzaFRtcDogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3R1cm5TdGFydE9wdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgbW9kZWxJZDogc3RyaW5nLCBkZXZlbG9wZXJJbnN0cnVjdGlvbnM/OiBzdHJpbmcsIGNvbmZpZ1Jlc291cmNlOiBVUkkgPSBzZXNzaW9uLnNlc3Npb25VcmkpOiBQaWNrPFR1cm5TdGFydFBhcmFtcywgJ2FwcHJvdmFsUG9saWN5JyB8ICdzYW5kYm94UG9saWN5JyB8ICdhcHByb3ZhbHNSZXZpZXdlcicgfCAnZWZmb3J0JyB8ICdydW50aW1lV29ya3NwYWNlUm9vdHMnIHwgJ3BlcnNvbmFsaXR5JyB8ICdzdW1tYXJ5JyB8ICdjb2xsYWJvcmF0aW9uTW9kZSc+IHtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9yZWFkU2Vzc2lvbkNvbmZpZyhjb25maWdSZXNvdXJjZSk7XG5cdFx0Y29uc3QgeyBhcHByb3ZhbFBvbGljeSwgc2FuZGJveE1vZGUsIGFwcHJvdmFsc1Jldmlld2VyIH0gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblBlcm1pc3Npb25zKGNvbmZpZ1Jlc291cmNlKTtcblx0XHRjb25zdCBzYW5kYm94UG9saWN5ID0gdGhpcy5fc2FuZGJveFBvbGljeShzZXNzaW9uLCBjb25maWcsIHNhbmRib3hNb2RlKTtcblx0XHRjb25zdCBydW50aW1lV29ya3NwYWNlUm9vdHMgPSB0aGlzLl9pc011bHRpUm9vdEFjdGl2ZShzZXNzaW9uKVxuXHRcdFx0PyB0aGlzLl9ydW50aW1lV29ya3NwYWNlUm9vdHMoc2Vzc2lvbilcblx0XHRcdDogKHNhbmRib3hQb2xpY3kudHlwZSA9PT0gJ3dvcmtzcGFjZVdyaXRlJyA/IHNhbmRib3hQb2xpY3kud3JpdGFibGVSb290cyA6IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgZWZmb3J0ID0gdGhpcy5fZ2V0UmVhc29uaW5nRWZmb3J0KHNlc3Npb24sIGNvbmZpZ1Jlc291cmNlKTtcblx0XHRjb25zdCBwZXJzb25hbGl0eSA9IG5hcnJvd1BlcnNvbmFsaXR5KGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuUGVyc29uYWxpdHldKSA/PyBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0c1tDb2RleFNlc3Npb25Db25maWdLZXkuUGVyc29uYWxpdHldO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBuYXJyb3dSZWFzb25pbmdTdW1tYXJ5KGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuUmVhc29uaW5nU3VtbWFyeV0pID8/IGNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5XTtcblx0XHQvLyBNYXAgdGhlIHBsYXRmb3JtLWdlbmVyaWMgQWdlbnQgTW9kZSB0byBjb2RleCdzIG5hdGl2ZSBjb2xsYWJvcmF0aW9uXG5cdFx0Ly8gbW9kZS4gQWx3YXlzIHNlbmQgaXQgKGV2ZW4gZm9yIGBkZWZhdWx0YCkgc28gc3dpdGNoaW5nIFBsYW4gXHUyMTkyIEludGVyYWN0aXZlXG5cdFx0Ly8gcmVzZXRzIHRoZSBzdGlja3kgdGhyZWFkIG1vZGUuIGBjb2xsYWJvcmF0aW9uTW9kZS5zZXR0aW5nc2AgY2FycmllcyB0aGVcblx0XHQvLyBtb2RlbCArIGVmZm9ydCBiZWNhdXNlIGNvZGV4IHRyZWF0cyBpdCBhcyBhdXRob3JpdGF0aXZlIG92ZXIgdGhlXG5cdFx0Ly8gdG9wLWxldmVsIGZpZWxkcyB3aGVuIGEgY29sbGFib3JhdGlvbiBtb2RlIGlzIHNldC5cblx0XHRjb25zdCBtb2RlID0gY29sbGFib3JhdGlvbk1vZGVLaW5kKGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdKTtcblx0XHRjb25zdCBmb3JnZURldmVsb3Blckluc3RydWN0aW9ucyA9IFtkZXZlbG9wZXJJbnN0cnVjdGlvbnMsIEZPUkdFX0xJVkVfRURJVF9JTlNUUlVDVElPTlNdLmZpbHRlcihCb29sZWFuKS5qb2luKCdcXG5cXG4nKTtcblx0XHRjb25zdCBjb2xsYWJvcmF0aW9uTW9kZTogVHVyblN0YXJ0UGFyYW1zWydjb2xsYWJvcmF0aW9uTW9kZSddID0ge1xuXHRcdFx0bW9kZSxcblx0XHRcdHNldHRpbmdzOiB7IG1vZGVsOiBtb2RlbElkLCByZWFzb25pbmdfZWZmb3J0OiBlZmZvcnQgPz8gbnVsbCwgZGV2ZWxvcGVyX2luc3RydWN0aW9uczogZm9yZ2VEZXZlbG9wZXJJbnN0cnVjdGlvbnMgfSxcblx0XHR9O1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSB0dXJuIG9wdGlvbnMgc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSBzYW5kYm94PSR7c2FuZGJveFBvbGljeS50eXBlfSBhcHByb3ZhbD0ke2FwcHJvdmFsUG9saWN5fSByZXZpZXdlcj0ke2FwcHJvdmFsc1Jldmlld2VyfWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhcHByb3ZhbFBvbGljeSxcblx0XHRcdHNhbmRib3hQb2xpY3ksXG5cdFx0XHRhcHByb3ZhbHNSZXZpZXdlcixcblx0XHRcdGVmZm9ydCxcblx0XHRcdHBlcnNvbmFsaXR5LFxuXHRcdFx0c3VtbWFyeSxcblx0XHRcdGNvbGxhYm9yYXRpb25Nb2RlLFxuXHRcdFx0Li4uKHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA/IHsgcnVudGltZVdvcmtzcGFjZVJvb3RzIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogcmVhZG9ubHkgVVJJW10ge1xuXHRcdHJldHVybiBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA/PyAoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8gW3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeV0gOiBbXSk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW50aW1lV29ya3NwYWNlUm9vdHMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gZGlzdGluY3RBYnNvbHV0ZVBhdGhzKHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKS5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5mc1BhdGgpKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2Vzc2lvbi5tdWx0aVJvb3RFbmFibGVkICYmIChzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcz8ubGVuZ3RoID8/IDApID4gMTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RbXT4ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2RleFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RDYW5kaWRhdGVzKHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID8/IFtdKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IFByb21pc2UuYWxsKGNhbmRpZGF0ZXMubWFwKGFzeW5jIGNhbmRpZGF0ZSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uuc3RhdChVUkkuZmlsZShjYW5kaWRhdGUubG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0XHRyZXR1cm4gc3RhdC5pc0RpcmVjdG9yeSA/IGNhbmRpZGF0ZSA6IHVuZGVmaW5lZDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcik7XG5cdFx0XHRcdGlmIChyZXN1bHQgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gc2VsZWN0ZWQgY2FwYWJpbGl0eSByb290IG1ldGFkYXRhIGxvb2t1cCBmYWlsZWQ6IGlkPSR7Y2FuZGlkYXRlLmlkfSwgcmVzdWx0PSR7cmVzdWx0fWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiByZXNvbHZlZC5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSAhPT0gdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkQ3VzdG9taXphdGlvbkxhdW5jaChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUHJvbWlzZTx7XG5cdFx0cmVhZG9ubHkgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBKc29uVmFsdWU+O1xuXHRcdHJlYWRvbmx5IGRldmVsb3Blckluc3RydWN0aW9ucz86IHN0cmluZztcblx0XHRyZWFkb25seSBzZWxlY3RlZENhcGFiaWxpdHlSb290czogU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdFtdO1xuXHRcdHJlYWRvbmx5IHNpZ25hdHVyZTogc3RyaW5nO1xuXHR9PiB7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuX2VuYWJsZWRDbGllbnRQbHVnaW5zKHNlc3Npb24pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUFnZW50cyA9IGF3YWl0IGRpc2NvdmVyQ29kZXhXb3Jrc3BhY2VBZ2VudHModGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24pLCB0aGlzLl9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IGF3YWl0IGNvZGV4Q3VzdG9taXphdGlvbkNvbmZpZyh3b3Jrc3BhY2VBZ2VudHMuYWdlbnRzLCBwbHVnaW5zLCBzZXNzaW9uLmFnZW50LCB0aGlzLl9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCBKc29uVmFsdWU+ID0ge307XG5cdFx0aWYgKGN1c3RvbWl6YXRpb24uYWdlbnRSb2xlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCByb290ID0gc2Vzc2lvbi5jdXN0b21pemF0aW9uRGlyZWN0b3J5Py5mc1BhdGhcblx0XHRcdFx0Pz8gYXdhaXQgZnMucHJvbWlzZXMubWtkdGVtcChqb2luKG9zLnRtcGRpcigpLCAndnNjb2RlLWFnZW50LWNvZGV4LWN1c3RvbWl6YXRpb25zLScpKTtcblx0XHRcdGNvbnN0IGFnZW50c0RpcmVjdG9yeSA9IGpvaW4ocm9vdCwgJ2FnZW50cycpO1xuXHRcdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoYWdlbnRzRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IGFnZW50czogUmVjb3JkPHN0cmluZywgSnNvblZhbHVlPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBbaW5kZXgsIHJvbGVdIG9mIGN1c3RvbWl6YXRpb24uYWdlbnRSb2xlcy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0Y29uc3Qgcm9sZVBhdGggPSBqb2luKGFnZW50c0RpcmVjdG9yeSwgYCR7aW5kZXh9LnRvbWxgKTtcblx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMud3JpdGVGaWxlKHJvbGVQYXRoLCBjb2RleEFnZW50Um9sZVRvbWwocm9sZSksICd1dGY4Jyk7XG5cdFx0XHRcdGFnZW50c1tyb2xlLm5hbWVdID0geyBkZXNjcmlwdGlvbjogcm9sZS5kZXNjcmlwdGlvbiwgY29uZmlnX2ZpbGU6IHJvbGVQYXRoIH07XG5cdFx0XHR9XG5cdFx0XHRjb25maWcuYWdlbnRzID0gYWdlbnRzO1xuXHRcdFx0c2Vzc2lvbi5jdXN0b21pemF0aW9uRGlyZWN0b3J5ID8/PSBVUkkuZmlsZShyb290KTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZENhcGFiaWxpdHlSb290cyA9IGNvZGV4U2tpbGxDYXBhYmlsaXR5Um9vdHMocGx1Z2lucykubWFwKCh1cmksIGluZGV4KTogU2VsZWN0ZWRDYXBhYmlsaXR5Um9vdCA9PiAoe1xuXHRcdFx0aWQ6IGBjbGllbnQtcGx1Z2luLXNraWxscy0ke2luZGV4fS0ke3VyaS5mc1BhdGh9YCxcblx0XHRcdGxvY2F0aW9uOiB7IHR5cGU6ICdlbnZpcm9ubWVudCcsIGVudmlyb25tZW50SWQ6ICdsb2NhbCcsIHBhdGg6IHVyaS5mc1BhdGggfSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2lnbmF0dXJlID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0YWdlbnQ6IHNlc3Npb24uYWdlbnQ/LnVyaSxcblx0XHRcdGFnZW50Um9sZXM6IGN1c3RvbWl6YXRpb24uYWdlbnRSb2xlcyxcblx0XHRcdGRldmVsb3Blckluc3RydWN0aW9uczogY3VzdG9taXphdGlvbi5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsXG5cdFx0XHRzZWxlY3RlZENhcGFiaWxpdHlSb290czogc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHMubWFwKHJvb3QgPT4gcm9vdC5sb2NhdGlvbi5wYXRoKSxcblx0XHR9KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlnLFxuXHRcdFx0Li4uKGN1c3RvbWl6YXRpb24uZGV2ZWxvcGVySW5zdHJ1Y3Rpb25zID8geyBkZXZlbG9wZXJJbnN0cnVjdGlvbnM6IGN1c3RvbWl6YXRpb24uZGV2ZWxvcGVySW5zdHJ1Y3Rpb25zIH0gOiB7fSksXG5cdFx0XHRzZWxlY3RlZENhcGFiaWxpdHlSb290cyxcblx0XHRcdHNpZ25hdHVyZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlZENsaWVudFBsdWdpbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHJlYWRvbmx5IElDb2RleENsaWVudFBsdWdpbltdIHtcblx0XHRjb25zdCBwbHVnaW5zID0gc2Vzc2lvbi5jbGllbnRDdXN0b21pemF0aW9ucy5wbHVnaW5zKCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHBsdWdpbnMubWFwKHBsdWdpbiA9PiAoe1xuXHRcdFx0Li4ucGx1Z2luLnN5bmNlZC5jdXN0b21pemF0aW9uLFxuXHRcdFx0Li4uKHBsdWdpbi5wYXJzZWQgPyB7IGNoaWxkcmVuOiBwYXJzZWRQbHVnaW5DaGlsZHJlbihwbHVnaW4ucGFyc2VkKSB9IDoge30pLFxuXHRcdH0pKTtcblx0XHRjb25zdCBjbGllbnRQbHVnaW5zID0gbmV3IE1hcDxzdHJpbmcsIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24+KCk7XG5cdFx0Y29uc3QgY2hpbGRFbmFibGVtZW50ID0gbmV3IE1hcDxzdHJpbmcsIE5vbk51bGxhYmxlPENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bJ2NoaWxkRW5hYmxlbWVudCddPj4oKTtcblx0XHRmb3IgKGNvbnN0IHBsdWdpbiBvZiBwbHVnaW5zKSB7XG5cdFx0XHRpZiAocGx1Z2luLmlucHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2xpZW50UGx1Z2lucy5zZXQocGx1Z2luLmlucHV0LnVyaSwgcGx1Z2luLmlucHV0KTtcblx0XHRcdFx0aWYgKHBsdWdpbi5pbnB1dC5jaGlsZEVuYWJsZW1lbnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNoaWxkRW5hYmxlbWVudC5zZXQocGx1Z2luLmlucHV0LnVyaSwgcGx1Z2luLmlucHV0LmNoaWxkRW5hYmxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x1dGlvbiA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChcblx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdHNlc3Npb24uc2Vzc2lvblVyaSxcblx0XHRcdGNhbmRpZGF0ZXMsXG5cdFx0XHRjaGlsZEVuYWJsZW1lbnQsXG5cdFx0XHRjbGllbnRQbHVnaW5zLFxuXHRcdCk7XG5cdFx0Y29uc3QgZW5hYmxlZDogSUNvZGV4Q2xpZW50UGx1Z2luW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtpbmRleCwgcGx1Z2luXSBvZiBwbHVnaW5zLmVudHJpZXMoKSkge1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IHJlc29sdXRpb24uY3VzdG9taXphdGlvbnNbaW5kZXhdO1xuXHRcdFx0aWYgKHBsdWdpbi5wYXJzZWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQmJiBjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpblxuXHRcdFx0XHQmJiBpc0N1c3RvbWl6YXRpb25TZGtFbGlnaWJsZShyZXNvbHV0aW9uLCBjYW5kaWRhdGVzW2luZGV4XSkpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB7IC4uLnBsdWdpbiwgY3VzdG9taXphdGlvbiB9O1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi5jbGllbnRDdXN0b21pemF0aW9ucy5pc0VuYWJsZWQocmVzb2x2ZWQpKSB7XG5cdFx0XHRcdFx0ZW5hYmxlZC5wdXNoKHJlc29sdmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZW5hYmxlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMuX3JlZnJlc2hDb3BpbG90TW9kZWxzKCksIHRoaXMuX3JlZnJlc2hDb2RleE1vZGVscygpXSk7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChbLi4udGhpcy5fY29waWxvdE1vZGVscywgLi4udGhpcy5fY29kZXhNb2RlbHNdLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzRXhpc3RpbmdDaGF0R1BUU2V0dXAoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUpID09PSB0cnVlO1xuXHRcdGlmICghYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUuc3RhdHVzID09PSAnc2lnbmVkSW4nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLmF1dGhUeXBlID09PSAnY2hhdGdwdCc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUuc3RhdHVzID09PSAndW5hdmFpbGFibGUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLnJlcXVpcmVzT3BlbmFpQXV0aCA9PT0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUuc3RhdHVzID09PSAnc2lnbmVkT3V0JyB8fCB0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUuc3RhdHVzID09PSAnZXJyb3InKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBkZXRlY3RFeGlzdGluZ0NvZGV4Q2hhdEdQVFNldHVwKFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLmZzUGF0aCxcblx0XHRcdHByb2Nlc3MuZW52LFxuXHRcdFx0dGhpcy5fY29kZXhIb21lLFxuXHRcdCkgfHwgKHRoaXMuX2NvbmZpZ3VyZWRDb2RleEhvbWUgPT09IHVuZGVmaW5lZCAmJiBkZXRlY3RFeGlzdGluZ0NvZGV4Q2hhdEdQVFNldHVwKFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLmZzUGF0aCxcblx0XHRcdHByb2Nlc3MuZW52LFxuXHRcdFx0am9pbih0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUuZnNQYXRoLCAnLmNvZGV4JyksXG5cdFx0KSk7XG5cdH1cblxuXHQvKipcblx0ICogTWF0Y2ggQ2xhdWRlIG5hdGl2ZSBtb2RlOiBvbmNlIHBlcnNpc3RlZCBjcmVkZW50aWFscyBtYWtlIHRoZSBwcm92aWRlclxuXHQgKiB1c2FibGUgd2l0aG91dCBHaXRIdWIsIGVhZ2VybHkgbWF0ZXJpYWxpemUgdGhlIFNESyBhbmQgcHVibGlzaCBvbmx5IHRoZVxuXHQgKiBhdXRob3JpdGF0aXZlIGFwcC1zZXJ2ZXIgbW9kZWwgY2F0YWxvZy4gVW50aWwgdGhhdCBmaW5pc2hlcyB0aGUgcHJvdmlkZXJcblx0ICogcmVtYWlucyBwcmVzZW50IGJ1dCB1bnVzYWJsZTsgbm8gY2FjaGVkIG9yIHN5bnRoZXRpYyBtb2RlbCBpcyBhZHZlcnRpc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRNb2RlbFJlZnJlc2hGb3JFeGlzdGluZ0NoYXRHUFRTZXR1cCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhdGhpcy5faGFzRXhpc3RpbmdDaGF0R1BUU2V0dXAoKSB8fCB0aGlzLl9jb2RleE1vZGVscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMucmVmcmVzaE1vZGVscygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaENvcGlsb3RNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9naXRodWJUb2tlbjtcblx0XHRpZiAoIXRva2VuKSB7XG5cdFx0XHR0aGlzLl9jb3BpbG90TW9kZWxzID0gW107XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1c2VyQWdlbnQgPSBgJHtVU0VSX0FHRU5UX1BSRUZJWH0vJHt0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9ufWA7XG5cdFx0XHRjb25zdCBhbGwgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5tb2RlbHModG9rZW4sIHsgaGVhZGVyczogeyAnVXNlci1BZ2VudCc6IHVzZXJBZ2VudCB9LCBzdXBwcmVzc0ludGVncmF0aW9uSWQ6IHRydWUgfSk7XG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gIT09IHRva2VuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIENvZGV4IHRhbGtzIHRvIGV2ZXJ5IG1vZGVsIHRocm91Z2ggdGhlIGB2c2NvZGUtcHJveHlgIGN1c3RvbSBtb2RlbFxuXHRcdFx0Ly8gcHJvdmlkZXIgd2l0aCBgd2lyZV9hcGk9XCJyZXNwb25zZXNcImAgKHNlZSBDb2RleFByb3h5U2VydmljZSksIHNvIGl0XG5cdFx0XHQvLyBjYW4gb25seSBkcml2ZSBtb2RlbHMgdGhhdCBleHBvc2UgQ29waWxvdCBDQVBJJ3MgT3BlbkFJLXNoYXBlZFxuXHRcdFx0Ly8gUmVzcG9uc2VzIGVuZHBvaW50LiBGaWx0ZXIgdGhlIGNhdGFsb2cgdG8gdGhvc2UgYWR2ZXJ0aXNpbmdcblx0XHRcdC8vIGAvcmVzcG9uc2VzYCBpbiBgc3VwcG9ydGVkX2VuZHBvaW50c2AgKHRoaXMgZHJvcHMgQW50aHJvcGljXG5cdFx0XHQvLyBgL3YxL21lc3NhZ2VzYCBhbmQgY2hhdC1jb21wbGV0aW9ucy1vbmx5IG1vZGVscywgd2hpY2ggY29kZXggY2Fubm90XG5cdFx0XHQvLyB1c2UpLiBUaGUgY2hvc2VuIGlkIGlzIGZvcndhcmRlZCBzdHJhaWdodCB0aHJvdWdoOyBDQVBJIHJlbWFpbnMgdGhlXG5cdFx0XHQvLyBhdXRob3JpdHkgb24gd2hhdCB0aGUgdG9rZW4gbWF5IGFjdHVhbGx5IHVzZS5cblx0XHRcdGNvbnN0IG1vZGVscyA9IGFsbFxuXHRcdFx0XHQuZmlsdGVyKG0gPT4gbS5zdXBwb3J0ZWRfZW5kcG9pbnRzPy5pbmNsdWRlcyhDT0RFWF9SRVNQT05TRVNfRU5EUE9JTlQpKVxuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gTnVtYmVyKGIuaXNfY2hhdF9kZWZhdWx0KSAtIE51bWJlcihhLmlzX2NoYXRfZGVmYXVsdCkpXG5cdFx0XHRcdC5tYXAoKG0pOiBJQWdlbnRNb2RlbEluZm8gPT4gKHtcblx0XHRcdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0XHRcdGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZChDT0RFWF9DT1BJTE9UX01PREVMX1BST1ZJREVSLCBtLmlkKSxcblx0XHRcdFx0XHRuYW1lOiBtLm5hbWUgPz8gbS5pZCxcblx0XHRcdFx0XHRtYXhDb250ZXh0V2luZG93OiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfY29udGV4dF93aW5kb3dfdG9rZW5zLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogbS5jYXBhYmlsaXRpZXM/LmxpbWl0cz8ubWF4X291dHB1dF90b2tlbnMsXG5cdFx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfcHJvbXB0X3Rva2Vucyxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogISFtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM/LnZpc2lvbixcblx0XHRcdFx0XHRjb25maWdTY2hlbWE6IHRoaXMuX2NyZWF0ZVJlYXNvbmluZ0VmZm9ydENvbmZpZ1NjaGVtYShcblx0XHRcdFx0XHRcdChtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHMgYXMgeyByZWFkb25seSByZWFzb25pbmdfZWZmb3J0PzogcmVhZG9ubHkgc3RyaW5nW10gfSB8IHVuZGVmaW5lZCk/LnJlYXNvbmluZ19lZmZvcnQ/Lm1hcChyZWFzb25pbmdFZmZvcnQgPT4gKHsgcmVhc29uaW5nRWZmb3J0IH0pKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG0uaWQsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwb2xpY3lTdGF0ZTogbS5wb2xpY3k/LnN0YXRlIGFzIFBvbGljeVN0YXRlIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdF9tZXRhOiBjcmVhdGVQcmljaW5nTWV0YUZyb21CaWxsaW5nKFxuXHRcdFx0XHRcdFx0bm9ybWFsaXplQ0FQSUJpbGxpbmcobS5iaWxsaW5nKSxcblx0XHRcdFx0XHRcdHR5cGVvZiBtLm1vZGVsX3BpY2tlcl9wcmljZV9jYXRlZ29yeSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0PyBtLm1vZGVsX3BpY2tlcl9wcmljZV9jYXRlZ29yeVxuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jb3BpbG90TW9kZWxzID0gbW9kZWxzO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIEZhaWxlZCB0byByZWZyZXNoIG1vZGVsczogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHQvLyBLZWVwIHRoZSBsYXN0IGtub3duLWdvb2QgY2F0YWxvZzsgYSB0cmFuc2llbnQgcGVyaW9kaWMgZmFpbHVyZSBtdXN0XG5cdFx0XHQvLyBub3QgbWFrZSBldmVyeSBtb2RlbCBkaXNhcHBlYXIuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaENvZGV4TW9kZWxzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkTW9kZWxzID0gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKClbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV0pO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFByb3ZpZGVyID0gY29uZmlndXJlZE1vZGVscy5wcm92aWRlcnMuZmluZChwcm92aWRlciA9PiBwcm92aWRlci5pZCA9PT0gY29uZmlndXJlZE1vZGVscy5tb2RlbFByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGxvY2FsS2luZCA9IGNvbmZpZ3VyZWRQcm92aWRlcj8ua2luZCA9PT0gJ29sbGFtYScgfHwgY29uZmlndXJlZFByb3ZpZGVyPy5raW5kID09PSAnbG1zdHVkaW8nXG5cdFx0XHRcdD8gY29uZmlndXJlZFByb3ZpZGVyLmtpbmRcblx0XHRcdFx0OiBjb25maWd1cmVkTW9kZWxzLm1vZGVsUHJvdmlkZXIgPT09ICdvbGxhbWEnIHx8IGNvbmZpZ3VyZWRNb2RlbHMubW9kZWxQcm92aWRlciA9PT0gJ2xtc3R1ZGlvJ1xuXHRcdFx0XHRcdD8gY29uZmlndXJlZE1vZGVscy5tb2RlbFByb3ZpZGVyXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIExvY2FsIHByb3ZpZGVycyBhcmUgaW5kZXBlbmRlbnQgb2YgdGhlIE9wZW5BSSBhY2NvdW50IGFuZCBhcHAtc2VydmVyJ3Ncblx0XHRcdC8vIHJlbW90ZSBtb2RlbCBjYXRhbG9nLiBSZXNvbHZlIHRoZW0gZmlyc3Qgc28gYW4gZXhwaXJlZC9zaWduZWQtb3V0XG5cdFx0XHQvLyBDaGF0R1BUIHNlc3Npb24gY2Fubm90IG1ha2UgYW4gb3RoZXJ3aXNlIHVzYWJsZSBPbGxhbWEvTE0gU3R1ZGlvIG1vZGVsXG5cdFx0XHQvLyBkaXNhcHBlYXIgZnJvbSB0aGUgcGlja2VyICh3aGljaCBhbHNvIGRpc2FibGVzIGNoYXQgc3VibWlzc2lvbikuXG5cdFx0XHRpZiAobG9jYWxLaW5kKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2VVcmwgPSBjb25maWd1cmVkUHJvdmlkZXI/LmJhc2VVcmwgfHwgKGxvY2FsS2luZCA9PT0gJ29sbGFtYScgPyAnaHR0cDovL2xvY2FsaG9zdDoxMTQzNC92MScgOiAnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3YxJyk7XG5cdFx0XHRcdGxldCBkaXNjb3ZlcmVkOiByZWFkb25seSB7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkID0gYXdhaXQgdGhpcy5fZGlzY292ZXJMb2NhbE1vZGVscyhsb2NhbEtpbmQsIGJhc2VVcmwpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSAke2xvY2FsS2luZH0gbW9kZWwgZGlzY292ZXJ5IGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWxJZHMgPSBuZXcgTWFwKGRpc2NvdmVyZWQubWFwKG1vZGVsID0+IFttb2RlbC5pZCwgbW9kZWwubmFtZV0pKTtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyZWRNb2RlbHMubW9kZWwpIHtcblx0XHRcdFx0XHRtb2RlbElkcy5zZXQoY29uZmlndXJlZE1vZGVscy5tb2RlbCwgbW9kZWxJZHMuZ2V0KGNvbmZpZ3VyZWRNb2RlbHMubW9kZWwpID8/IGNvbmZpZ3VyZWRNb2RlbHMubW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NvZGV4TW9kZWxzID0gWy4uLm1vZGVsSWRzXS5tYXAoKFttb2RlbCwgbmFtZV0pOiBJQWdlbnRNb2RlbEluZm8gPT4gKHtcblx0XHRcdFx0XHRwcm92aWRlcjogY29uZmlndXJlZE1vZGVscy5tb2RlbFByb3ZpZGVyLFxuXHRcdFx0XHRcdGlkOiB0b0NvZGV4TW9kZWxTZWxlY3Rpb25JZChjb25maWd1cmVkTW9kZWxzLm1vZGVsUHJvdmlkZXIsIG1vZGVsKSxcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdHN1cHBvcnRzVmlzaW9uOiBmYWxzZSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBsaXZlQnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBNb2RlbExpc3RSZXNwb25zZVsnZGF0YSddW251bWJlcl0+KCk7XG5cdFx0XHRsZXQgbGl2ZU1vZGVsUHJvdmlkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjaGF0R1BUU3Vic2NyaXB0aW9uID0gZmFsc2U7XG5cdFx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAnaWRsZScgJiYgIShhd2FpdCB0aGlzLl9pc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQoKSkgJiYgIXRoaXMuX2hhc0V4aXN0aW5nQ2hhdEdQVFNldHVwKCkpIHtcblx0XHRcdFx0dGhpcy5fY29kZXhNb2RlbHMgPSB0aGlzLl9waWNrZXJNb2RlbHNGcm9tQ2FyZHModW5kZWZpbmVkLCBsaXZlQnlJZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGFjY291bnQgPSBhd2FpdCB0aGlzLl9yZWZyZXNoQWNjb3VudChjb25uZWN0aW9uLmNsaWVudCwgZmFsc2UpO1xuXHRcdFx0XHRpZiAoKGFjY291bnQuc3RhdHVzID09PSAnc2lnbmVkT3V0JyB8fCBhY2NvdW50LnN0YXR1cyA9PT0gJ2Vycm9yJylcblx0XHRcdFx0XHQmJiAoY29uZmlndXJlZE1vZGVscy5tb2RlbFByb3ZpZGVyID09PSAnJyB8fCBjb25maWd1cmVkTW9kZWxzLm1vZGVsUHJvdmlkZXIgPT09IENPREVYX09QRU5BSV9NT0RFTF9QUk9WSURFUikpIHtcblx0XHRcdFx0XHR0aGlzLl9zeW5jT2ZmaWNpYWxDb2RleENhcmQoW10pO1xuXHRcdFx0XHRcdHRoaXMuX2NvZGV4TW9kZWxzID0gW107XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1Jlc3BvbnNlID0gYXdhaXQgY29ubmVjdGlvbi5jbGllbnQucmVxdWVzdDwnY29uZmlnL3JlYWQnLCBDb25maWdSZWFkUmVzcG9uc2U+KCdjb25maWcvcmVhZCcsIHsgaW5jbHVkZUxheWVyczogZmFsc2UgfSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ1Jlc3BvbnNlLmNvbmZpZyAmJiB0eXBlb2YgY29uZmlnUmVzcG9uc2UuY29uZmlnID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShjb25maWdSZXNwb25zZS5jb25maWcpXG5cdFx0XHRcdFx0PyBjb25maWdSZXNwb25zZS5jb25maWcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj5cblx0XHRcdFx0XHQ6IHt9O1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkTGl2ZVByb3ZpZGVyID0gdGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdtb2RlbF9wcm92aWRlcicpO1xuXHRcdFx0XHRsaXZlTW9kZWxQcm92aWRlciA9IHR5cGVvZiBjb25maWd1cmVkTGl2ZVByb3ZpZGVyID09PSAnc3RyaW5nJyAmJiBjb25maWd1cmVkTGl2ZVByb3ZpZGVyICE9PSAnJyA/IGNvbmZpZ3VyZWRMaXZlUHJvdmlkZXIgOiBDT0RFWF9PUEVOQUlfTU9ERUxfUFJPVklERVI7XG5cdFx0XHRcdGNoYXRHUFRTdWJzY3JpcHRpb24gPSBhY2NvdW50LnN0YXR1cyA9PT0gJ3NpZ25lZEluJ1xuXHRcdFx0XHRcdCYmIGFjY291bnQuYXV0aFR5cGUgPT09ICdjaGF0Z3B0J1xuXHRcdFx0XHRcdCYmIGFjY291bnQucmVxdWlyZXNPcGVuYWlBdXRoICE9PSBmYWxzZVxuXHRcdFx0XHRcdCYmIGxpdmVNb2RlbFByb3ZpZGVyID09PSBDT0RFWF9PUEVOQUlfTU9ERUxfUFJPVklERVI7XG5cblx0XHRcdFx0Y29uc3QgZGF0YSA9IFtdIGFzIE1vZGVsTGlzdFJlc3BvbnNlWydkYXRhJ107XG5cdFx0XHRcdGxldCBjdXJzb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHRkbyB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzcG9uc2U6IE1vZGVsTGlzdFJlc3BvbnNlID0gYXdhaXQgY29ubmVjdGlvbi5jbGllbnQucmVxdWVzdDwnbW9kZWwvbGlzdCcsIE1vZGVsTGlzdFJlc3BvbnNlPignbW9kZWwvbGlzdCcsIHsgY3Vyc29yLCBsaW1pdDogMTAwLCBpbmNsdWRlSGlkZGVuOiBmYWxzZSB9KTtcblx0XHRcdFx0XHRkYXRhLnB1c2goLi4ucmVzcG9uc2UuZGF0YSk7XG5cdFx0XHRcdFx0Y3Vyc29yID0gcmVzcG9uc2UubmV4dEN1cnNvcjtcblx0XHRcdFx0fSB3aGlsZSAoY3Vyc29yICE9PSBudWxsKTtcblx0XHRcdFx0bGl2ZUJ5SWQgPSBuZXcgTWFwKGRhdGEubWFwKG1vZGVsID0+IFttb2RlbC5tb2RlbCwgbW9kZWxdKSk7XG5cdFx0XHRcdGlmIChjaGF0R1BUU3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3luY09mZmljaWFsQ29kZXhDYXJkKGRhdGEuc29ydCgobGVmdCwgcmlnaHQpID0+IE51bWJlcihyaWdodC5pc0RlZmF1bHQpIC0gTnVtYmVyKGxlZnQuaXNEZWZhdWx0KSkubWFwKG1vZGVsID0+IG1vZGVsLm1vZGVsKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc3luY09mZmljaWFsQ29kZXhDYXJkKFtdKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIG9mZmljaWFsIG1vZGVsIGxpc3QgZmFpbGVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYXRHUFRTdWJzY3JpcHRpb24pIHtcblx0XHRcdFx0Y29uc3QgZnJvbUNhcmRzID0gdGhpcy5fcGlja2VyTW9kZWxzRnJvbUNhcmRzKHVuZGVmaW5lZCwgbGl2ZUJ5SWQpO1xuXHRcdFx0XHRpZiAoZnJvbUNhcmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9jb2RleE1vZGVscyA9IGZyb21DYXJkcztcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChsaXZlQnlJZC5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gbGl2ZU1vZGVsUHJvdmlkZXIgPz8gQ09ERVhfT1BFTkFJX01PREVMX1BST1ZJREVSO1xuXHRcdFx0XHR0aGlzLl9jb2RleE1vZGVscyA9IFsuLi5saXZlQnlJZC52YWx1ZXMoKV0ubWFwKChtb2RlbCk6IElBZ2VudE1vZGVsSW5mbyA9PiAoe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiBjaGF0R1BUU3Vic2NyaXB0aW9uID8gJ2NoYXRncHQnIDogbW9kZWxQcm92aWRlcixcblx0XHRcdFx0XHRpZDogdG9Db2RleE1vZGVsU2VsZWN0aW9uSWQobW9kZWxQcm92aWRlciwgbW9kZWwubW9kZWwpLFxuXHRcdFx0XHRcdG5hbWU6IG1vZGVsLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdHN1cHBvcnRzVmlzaW9uOiBtb2RlbC5pbnB1dE1vZGFsaXRpZXMuaW5jbHVkZXMoJ2ltYWdlJyksXG5cdFx0XHRcdFx0Y29uZmlnU2NoZW1hOiB0aGlzLl9jcmVhdGVSZWFzb25pbmdFZmZvcnRDb25maWdTY2hlbWEobW9kZWwuc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cywgbW9kZWwuZGVmYXVsdFJlYXNvbmluZ0VmZm9ydCwgbW9kZWwubW9kZWwpLFxuXHRcdFx0XHRcdF9tZXRhOiBjcmVhdGVBZ2VudE1vZGVsU291cmNlTWV0YShjaGF0R1BUU3Vic2NyaXB0aW9uID8gQ0hBVEdQVF9TVUJTQ1JJUFRJT05fTU9ERUxfU09VUkNFX0lEIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2NvZGV4TW9kZWxzID0gW107XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gRmFpbGVkIHRvIHJlZnJlc2ggT3BlbkFJIG1vZGVsczogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHQvLyBLZWVwIHRoZSBsYXN0IGtub3duLWdvb2QgY2F0YWxvZzsgYSB0cmFuc2llbnQgcGVyaW9kaWMgZmFpbHVyZSBtdXN0XG5cdFx0XHQvLyBub3QgbWFrZSBldmVyeSBtb2RlbCBkaXNhcHBlYXIuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcGlja2VyTW9kZWxzRnJvbUNhcmRzKGNvbmZpZzogSUNvZGV4TW9kZWxzQ29uZmlnIHwgdW5kZWZpbmVkLCBsaXZlQnlJZDogTWFwPHN0cmluZywgTW9kZWxMaXN0UmVzcG9uc2VbJ2RhdGEnXVtudW1iZXJdPik6IElBZ2VudE1vZGVsSW5mb1tdIHtcblx0XHRjb25zdCBtb2RlbHMgPSBjb25maWcgPz8gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKClbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV0pO1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHJlbWFpbmluZ1BlcmNlbnRGcm9tVXNlZCh0aGlzLl9vcGVuQUlBY2NvdW50UmF0ZUxpbWl0Py51c2VkUGVyY2VudCk7XG5cdFx0Y29uc3Qgb2ZmaWNpYWwgPSBmaW5kT2ZmaWNpYWxNb2RlbFByb3ZpZGVyKG1vZGVscywgJ2NvZGV4Jyk7XG5cdFx0Y29uc3QgaGFzT2ZmaWNpYWxBcGlLZXkgPSAhIShvZmZpY2lhbCAmJiB0aGlzLl9tb2RlbFByb3ZpZGVyQXBpS2V5cy5nZXQob2ZmaWNpYWwuaWQpKTtcblx0XHRjb25zdCBwaWNrZXI6IElBZ2VudE1vZGVsSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBtb2RlbHMucHJvdmlkZXJzKSB7XG5cdFx0XHRpZiAoIXNob3VsZEluY2x1ZGVPZmZpY2lhbFByb3ZpZGVySW5Db2RleFBpY2tlcihwcm92aWRlcikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHByb3ZpZGVyLm1vZGVscykge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gbW9kZWwubmFtZS50cmltKCk7XG5cdFx0XHRcdGlmICghbW9kZWwuZW5hYmxlZCB8fCBuYW1lID09PSAnJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJvdXRlZCA9IHJlc29sdmVDb2RleE9mZmljaWFsUm91dGUoe1xuXHRcdFx0XHRcdG1vZGVsUHJvdmlkZXI6IHByb3ZpZGVyLmlkLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IG5hbWUsXG5cdFx0XHRcdFx0Y29uZmlnOiBtb2RlbHMsXG5cdFx0XHRcdFx0cmVtYWluaW5nUGVyY2VudDogcmVtYWluaW5nLFxuXHRcdFx0XHRcdGhhc09mZmljaWFsQXBpS2V5LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgbGl2ZSA9IGxpdmVCeUlkLmdldChuYW1lKTtcblx0XHRcdFx0cGlja2VyLnB1c2goe1xuXHRcdFx0XHRcdHByb3ZpZGVyOiBwcm92aWRlci5vZmZpY2lhbCAmJiByb3V0ZWQubW9kZWxQcm92aWRlciA9PT0gQ09ERVhfT1BFTkFJX01PREVMX1BST1ZJREVSID8gJ2NoYXRncHQnIDogcHJvdmlkZXIuaWQsXG5cdFx0XHRcdFx0aWQ6IHRvQ29kZXhNb2RlbFNlbGVjdGlvbklkKHJvdXRlZC5tb2RlbFByb3ZpZGVyLCByb3V0ZWQubW9kZWxJZCksXG5cdFx0XHRcdFx0bmFtZTogbGl2ZT8uZGlzcGxheU5hbWUgfHwgbmFtZSxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogbGl2ZT8uaW5wdXRNb2RhbGl0aWVzLmluY2x1ZGVzKCdpbWFnZScpID8/IGZhbHNlLFxuXHRcdFx0XHRcdGNvbmZpZ1NjaGVtYTogbGl2ZVxuXHRcdFx0XHRcdFx0PyB0aGlzLl9jcmVhdGVSZWFzb25pbmdFZmZvcnRDb25maWdTY2hlbWEobGl2ZS5zdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzLCBsaXZlLmRlZmF1bHRSZWFzb25pbmdFZmZvcnQsIGxpdmUubW9kZWwpXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRfbWV0YTogY3JlYXRlQWdlbnRNb2RlbFNvdXJjZU1ldGEocHJvdmlkZXIub2ZmaWNpYWwgJiYgcm91dGVkLm1vZGVsUHJvdmlkZXIgPT09IENPREVYX09QRU5BSV9NT0RFTF9QUk9WSURFUiA/IENIQVRHUFRfU1VCU0NSSVBUSU9OX01PREVMX1NPVVJDRV9JRCA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGlja2VyO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY09mZmljaWFsQ29kZXhDYXJkKG9mZmljaWFsTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RDb25maWdWYWx1ZXM/LigpPy5bQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV0pO1xuXHRcdGNvbnN0IG5leHQgPSBvZmZpY2lhbE5hbWVzLmxlbmd0aCA+IDBcblx0XHRcdD8gdXBzZXJ0T2ZmaWNpYWxNb2RlbFByb3ZpZGVyKGN1cnJlbnQsICdjb2RleCcsIG9mZmljaWFsTmFtZXMpXG5cdFx0XHQ6IHJlbW92ZU9mZmljaWFsTW9kZWxQcm92aWRlcihjdXJyZW50LCAnY29kZXgnKTtcblx0XHRpZiAob2ZmaWNpYWxDYXJkc0VxdWFsKGN1cnJlbnQsIG5leHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV06IG5leHQgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yb3V0ZUNvZGV4TW9kZWwoc2VsZWN0aW9uOiBNb2RlbFNlbGVjdGlvbik6IHsgcmVhZG9ubHkgbW9kZWxQcm92aWRlcjogc3RyaW5nOyByZWFkb25seSBtb2RlbElkOiBzdHJpbmcgfSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDb2RleE1vZGVsU2VsZWN0aW9uKHNlbGVjdGlvbik7XG5cdFx0Y29uc3QgY29uZmlnID0gbm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKCk/LltDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXSk7XG5cdFx0Y29uc3Qgb2ZmaWNpYWwgPSBmaW5kT2ZmaWNpYWxNb2RlbFByb3ZpZGVyKGNvbmZpZywgJ2NvZGV4Jyk7XG5cdFx0cmV0dXJuIHJlc29sdmVDb2RleE9mZmljaWFsUm91dGUoe1xuXHRcdFx0bW9kZWxQcm92aWRlcjogcGFyc2VkLm1vZGVsUHJvdmlkZXIsXG5cdFx0XHRtb2RlbElkOiBwYXJzZWQubW9kZWxJZCxcblx0XHRcdGNvbmZpZyxcblx0XHRcdHJlbWFpbmluZ1BlcmNlbnQ6IHJlbWFpbmluZ1BlcmNlbnRGcm9tVXNlZCh0aGlzLl9vcGVuQUlBY2NvdW50UmF0ZUxpbWl0Py51c2VkUGVyY2VudCksXG5cdFx0XHRoYXNPZmZpY2lhbEFwaUtleTogISEob2ZmaWNpYWwgJiYgdGhpcy5fbW9kZWxQcm92aWRlckFwaUtleXMuZ2V0KG9mZmljaWFsLmlkKSksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNjb3ZlckxvY2FsTW9kZWxzKGtpbmQ6ICdvbGxhbWEnIHwgJ2xtc3R1ZGlvJywgYmFzZVVybDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJQ29kZXhEaXNjb3ZlcmVkTG9jYWxNb2RlbFtdPiB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7a2luZH1cXDAke2Jhc2VVcmx9YDtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9sb2NhbE1vZGVsRGlzY292ZXJ5Q2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKGNhY2hlZCAmJiBjYWNoZWQuZXhwaXJlc0F0ID4gRGF0ZS5ub3coKSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlZC5wcm9taXNlO1xuXHRcdH1cblx0XHRjb25zdCBwcm9taXNlID0gZGlzY292ZXJDb2RleExvY2FsTW9kZWxzKGtpbmQsIGJhc2VVcmwpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdGlmICh0aGlzLl9sb2NhbE1vZGVsRGlzY292ZXJ5Q2FjaGUuZ2V0KGtleSk/LnByb21pc2UgPT09IHByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5fbG9jYWxNb2RlbERpc2NvdmVyeUNhY2hlLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSk7XG5cdFx0dGhpcy5fbG9jYWxNb2RlbERpc2NvdmVyeUNhY2hlLnNldChrZXksIHsgZXhwaXJlc0F0OiBEYXRlLm5vdygpICsgNSAqIDYwXzAwMCwgcHJvbWlzZSB9KTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIENvbm5lY3Rpb24gbGlmZWN5Y2xlXG5cblx0LyoqXG5cdCAqIExhemlseSBzcGF3biB0aGUgY29kZXggYXBwLXNlcnZlciwgaW5pdGlhbGl6ZSB0aGUgY29ubmVjdGlvbixcblx0ICogYXV0aGVudGljYXRlIHZpYSBhcGlLZXksIGFuZCByZXR1cm4gdGhlIHJlYWR5IGNvbm5lY3Rpb24uIElkZW1wb3RlbnRcblx0ICogXHUyMDE0IGNvbmN1cnJlbnQgY2FsbGVycyBzaGFyZSB0aGUgc2FtZSBwcm9taXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ29ubmVjdGlvbigpOiBQcm9taXNlPElDb25uZWN0aW9uUmVhZHk+IHtcblx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2Nvbm5lY3Rpb24pO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAnc3RhcnRpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29ubmVjdGlvbi5wcm9taXNlO1xuXHRcdH1cblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fY29ubmVjdGlvbkdlbmVyYXRpb247XG5cdFx0Y29uc3Qgc3RhcnRQcm9taXNlID0gdGhpcy5fc3RhcnRDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IHN0YXJ0UHJvbWlzZS50aGVuKHJlYWR5ID0+IHtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9jb25uZWN0aW9uR2VuZXJhdGlvbikge1xuXHRcdFx0XHRyZWFkeS5jbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZWFkeS5wcm94eUhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRyeSB7IHJlYWR5LmNoaWxkLmtpbGwoJ1NJR0tJTEwnKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgZGVhZCAqLyB9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29kZXggYXBwLXNlcnZlciB3YXMgcmVwbGFjZWQgd2hpbGUgc3RhcnRpbmcnKTtcblx0XHRcdH1cblx0XHRcdC8vIEF1dGhlbnRpY2F0aW9uIGNhbiBjb21wbGV0ZSB3aGlsZSB0aGUgY29ubmVjdGlvbiBpcyBzdGFydGluZzsgYXBwbHkgdGhlIGxhdGVzdCB0b2tlbiBiZWZvcmUgcHVibGlzaGluZyByZWFkeS5cblx0XHRcdHJlYWR5LnByb3h5SGFuZGxlLnNldFRva2VuKHRoaXMuX2dpdGh1YlRva2VuID8/ICcnKTtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdyZWFkeScsIC4uLnJlYWR5IH07XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hQcm92aWRlckNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdHJldHVybiByZWFkeTtcblx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0aWYgKGdlbmVyYXRpb24gPT09IHRoaXMuX2Nvbm5lY3Rpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdpZGxlJyB9O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB7IGtpbmQ6ICdzdGFydGluZycsIHByb21pc2UgfTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBDb2RleCBTREsgcm9vdCBcdTIwMTQgdGhlIGRpcmVjdG9yeSB3aG9zZVxuXHQgKiBgbm9kZV9tb2R1bGVzL0BvcGVuYWkvY29kZXgtPHRhcmdldD4vXHUyMDI2YCBob2xkcyB0aGUgbmF0aXZlIGJpbmFyeS5cblx0ICpcblx0ICogTWlycm9ycyB0aGUgdGhyZWUtdGllciByZXNvbHV0aW9uIGluIGBDbGF1ZGVBZ2VudFNka1NlcnZpY2UuX2xvYWRTZGtgOlxuXHQgKiAgIDEuIGRldiBvdmVycmlkZSAvIHByb2R1Y3QgZG93bmxvYWQsIHZpYSB0aGUgZG93bmxvYWRlciwgd2hlbiB0aGUgU0RLXG5cdCAqICAgICAgYGlzQXZhaWxhYmxlYCAoZW52IG92ZXJyaWRlIHx8IGBwcm9kdWN0LmFnZW50U2Rrcy5jb2RleGApO1xuXHQgKiAgIDIuIGRldiBmYWxsYmFjayB0byB0aGlzIHJlcG8ncyBgbm9kZV9tb2R1bGVzYCwgd2hlcmUgYEBvcGVuYWkvY29kZXhgXG5cdCAqICAgICAgYW5kIGl0cyBwZXItaG9zdCBiaW5hcnkgcGFja2FnZSBhcmUgZGV2RGVwZW5kZW5jaWVzIFx1MjAxNCB0aGlzIGlzIHdoYXRcblx0ICogICAgICBsZXRzIHJ1bm5pbmctZnJvbS1zb3VyY2UgKGFuZCBkZXYgc21va2UgdGVzdHMpIHNwYXduIENvZGV4IHdpdGhvdXRcblx0ICogICAgICBhbiBlbnYtdmFyIG92ZXJyaWRlLlxuXHQgKlxuXHQgKiBgaXNBdmFpbGFibGVgIGlzIGFscmVhZHkgZmFsc2UgaW4gZGV2LCBzbyBpdCBkaXNjcmltaW5hdGVzIHRoZSB0d29cblx0ICogd2l0aG91dCBpbmplY3RpbmcgYElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2VgLiBXaGVuIG5laXRoZXIgcGF0aFxuXHQgKiByZXNvbHZlcyB3ZSBkZWZlciB0byB0aGUgZG93bmxvYWRlciBzbyBjYWxsZXJzIGdldCBpdHMgYWN0aW9uYWJsZVxuXHQgKiBcIm5vdCBjb25maWd1cmVkXCIgZGlhZ25vc3RpYy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTZGtSb290KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX2FnZW50U2RrRG93bmxvYWRlci5pc0F2YWlsYWJsZShDb2RleFNka1BhY2thZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmxvYWRTZGtSb290KENvZGV4U2RrUGFja2FnZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRldlJvb3QgPSBhd2FpdCByZXNvbHZlQ29kZXhEZXZTZGtSb290KCk7XG5cdFx0aWYgKGRldlJvb3QpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSByZXNvbHZpbmcgU0RLIGZyb20gcmVwbyBub2RlX21vZHVsZXMgKGRldiBmYWxsYmFjayk6ICR7ZGV2Um9vdH1gKTtcblx0XHRcdHJldHVybiBkZXZSb290O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmxvYWRTZGtSb290KENvZGV4U2RrUGFja2FnZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc1Nka1Jlc29sdmFibGVXaXRob3V0RG93bmxvYWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX2FnZW50U2RrRG93bmxvYWRlci5pc0F2YWlsYWJsZShDb2RleFNka1BhY2thZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWdlbnRTZGtEb3dubG9hZGVyLmlzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZChDb2RleFNka1BhY2thZ2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gKGF3YWl0IHJlc29sdmVDb2RleERldlNka1Jvb3QoKSkgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0Q29ubmVjdGlvbigpOiBQcm9taXNlPElDb25uZWN0aW9uUmVhZHk+IHtcblx0XHQvLyBSZXNvbHZlIHRoZSBDb2RleCBTREsgcm9vdDogZGV2IG92ZXJyaWRlIC8gcHJvZHVjdCBkb3dubG9hZCB2aWEgdGhlXG5cdFx0Ly8gZG93bmxvYWRlciwgb3IgdGhpcyByZXBvJ3MgYG5vZGVfbW9kdWxlc2AgaW4gYSBzb3VyY2UgY2hlY2tvdXQgKHNlZVxuXHRcdC8vIGBfcmVzb2x2ZVNka1Jvb3RgKS4gV2Ugc3Bhd24gdGhlIG5hdGl2ZSBjb2RleCBiaW5hcnkgaW5zaWRlIHRoZVxuXHRcdC8vIHBsYXRmb3JtIHBhY2thZ2UgZGlyZWN0bHkgKHRoZSBzYW1lIHNoYXBlIHRoZSBKUyBzaGltIGF0XG5cdFx0Ly8gYG5vZGVfbW9kdWxlcy9Ab3BlbmFpL2NvZGV4L2Jpbi9jb2RleC5qc2Agd291bGQgcmVzb2x2ZSB0bykgXHUyMDE0IGdvaW5nXG5cdFx0Ly8gdGhyb3VnaCB0aGUgc2hpbSBhZGRzIGEgbGF1bmNoZXIgaG9wIGFuZCBmb3JjZXMgYW5cblx0XHQvLyBgRUxFQ1RST05fUlVOX0FTX05PREVgIHJvdW5kLXRyaXAgd2hlbiB0aGUgYWdlbnQgaG9zdCBydW5zIGFzIGFuXG5cdFx0Ly8gRWxlY3Ryb24gdXRpbGl0eSBwcm9jZXNzLlxuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2RrUm9vdCgpO1xuXHRcdGNvbnN0IGNvZGV4VGFyZ2V0ID0gY29kZXhQYWNrYWdlU3VmZml4KHByb2Nlc3MucGxhdGZvcm0sIHByb2Nlc3MuYXJjaCk7XG5cdFx0aWYgKCFjb2RleFRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2RleDogdW5zdXBwb3J0ZWQgcGxhdGZvcm0gJHtwcm9jZXNzLnBsYXRmb3JtfS0ke3Byb2Nlc3MuYXJjaH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgdHJpcGxlID0gY29kZXhCaW5hcnlUcmlwbGUoY29kZXhUYXJnZXQpO1xuXHRcdGlmICghdHJpcGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4OiBubyBiaW5hcnkgdHJpcGxlIGtub3duIGZvciBzZGtUYXJnZXQgJyR7Y29kZXhUYXJnZXR9J2ApO1xuXHRcdH1cblx0XHRjb25zdCBiaW5hcnlOYW1lID0gcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdjb2RleC5leGUnIDogJ2NvZGV4Jztcblx0XHRjb25zdCBiaW5hcnlQYXRoID0gcmVzb2x2ZUNvZGV4QmluYXJ5UGF0aChyb290LCBjb2RleFRhcmdldCwgdHJpcGxlLCBiaW5hcnlOYW1lKTtcblx0XHR0cnkge1xuXHRcdFx0ZnMuYWNjZXNzU3luYyhiaW5hcnlQYXRoLCBmcy5jb25zdGFudHMuRl9PSyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4IGJpbmFyeSBub3QgZXhlY3V0YWJsZTogJHtiaW5hcnlQYXRofSAoJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9KWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3h5SGFuZGxlID0gYXdhaXQgdGhpcy5fY29kZXhQcm94eVNlcnZpY2Uuc3RhcnQodGhpcy5fZ2l0aHViVG9rZW4gPz8gJycpO1xuXG5cdFx0Y29uc3QgZXh0cmFBcmdzID0gcGFyc2VCaW5hcnlBcmdzKHByb2Nlc3MuZW52W0FnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzRW52VmFyXSk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5ID0gYXdhaXQgdGhpcy5fb3RlbFNlcnZpY2UuZ2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0Y29uc3QgbGF1bmNoQ29uZmlnID0gYnVpbGRDb2RleExhdW5jaENvbmZpZyhwcm9jZXNzLmVudiwgcHJveHlIYW5kbGUsIGV4dHJhQXJncywgdGVsZW1ldHJ5KTtcblx0XHRjb25zdCBlbnYgPSBsYXVuY2hDb25maWcuZW52O1xuXHRcdGZvciAoY29uc3QgW3Byb3ZpZGVySWQsIGFwaUtleV0gb2YgdGhpcy5fbW9kZWxQcm92aWRlckFwaUtleXMpIHtcblx0XHRcdGVudltjb2RleFByb3ZpZGVyU3RvcmVkQXBpS2V5RW52KHByb3ZpZGVySWQpXSA9IGFwaUtleTtcblx0XHR9XG5cdFx0Y29uc3QgY29kZXhIb21lID0gcHJlcGFyZUZvcmdlQ29kZXhIb21lKFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLmZzUGF0aCxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyZWRDb2RleEhvbWUsXG5cdFx0XHRmaWxlTmFtZSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gbWlncmF0ZWQgJHtmaWxlTmFtZX0gaW50byBGb3JnZSdzIGlzb2xhdGVkIENvZGV4IGhvbWVgKSxcblx0XHQpO1xuXHRcdGVudi5DT0RFWF9IT01FID0gY29kZXhIb21lO1xuXG5cdFx0Y29uc3QgYXJncyA9IFsuLi5sYXVuY2hDb25maWcuYXJnc107XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gc3Bhd25pbmcgd2l0aCBhZGRpdGl2ZSBtb2RlbCBwcm92aWRlcnMgJHtiaW5hcnlQYXRofSAke2FyZ3Muam9pbignICcpfWApO1xuXHRcdGNvbnN0IGRpYWdub3N0aWNzTG9nID0gZ2V0QWN0aXZlRm9yZ2VEaWFnbm9zdGljc0xvZygpO1xuXHRcdGRpYWdub3N0aWNzTG9nPy5yZWNvcmQoJ3Byb3RvY29sJywgJ0NPREVYLlBST0NFU1MuU1BBV04nLCB7IGJpbmFyeVBhdGgsIGFyZ3M6IGxhdW5jaENvbmZpZy5hcmdzLCBjb2RleEhvbWUgfSk7XG5cdFx0Y29uc3QgY2hpbGQgPSBzcGF3bihiaW5hcnlQYXRoLCBhcmdzLCB7IGVudiwgc3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnXSB9KTtcblxuXHRcdC8vIFN1cmZhY2Ugc3RkZXJyIHRvIHRoZSBsb2cgY2hhbm5lbCBcdTIwMTQgY29kZXggd3JpdGVzIHVzZWZ1bCBzdGFydHVwXG5cdFx0Ly8gZGlhZ25vc3RpY3MgdGhlcmUuIE1pcnJvciBDbGF1ZGUncyBwYXR0ZXJuLlxuXHRcdGNoaWxkLnN0ZGVyci5zZXRFbmNvZGluZygndXRmOCcpO1xuXHRcdGNoaWxkLnN0ZGVyci5vbignZGF0YScsIGNodW5rID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBTdHJpbmcoY2h1bmspO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXggc3RkZXJyXSAke3RleHQudHJpbUVuZCgpfWApO1xuXHRcdFx0ZGlhZ25vc3RpY3NMb2c/LnJlY29yZFN0cmVhbSgncHJvdG9jb2wnLCAnY29kZXgtYXBwLXNlcnZlcjpzdGRlcnInLCAnQ09ERVguU1RERVJSJywgdGV4dCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSB0cmFuc3BvcnRGcm9tQ2hpbGRQcm9jZXNzKGNoaWxkKTtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgQ29kZXhBcHBTZXJ2ZXJDbGllbnQodHJhbnNwb3J0LCAobGV2ZWwsIG1zZykgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhDbGllbnQgJHtsZXZlbH1dICR7bXNnfWApO1xuXHRcdFx0ZGlhZ25vc3RpY3NMb2c/LnJlY29yZChsZXZlbCA9PT0gJ2Vycm9yJyA/ICdlcnJvcnMnIDogJ3Byb3RvY29sJywgYENPREVYLkNMSUVOVC4ke2xldmVsLnRvVXBwZXJDYXNlKCl9YCwgeyBtZXNzYWdlOiBtc2cgfSk7XG5cdFx0fSwgdW5kZWZpbmVkLCAoZGlyZWN0aW9uLCBtZXNzYWdlKSA9PiB7XG5cdFx0XHRkaWFnbm9zdGljc0xvZz8ucmVjb3JkKCdwcm90b2NvbCcsIGRpcmVjdGlvbiA9PT0gJ2NsaWVudC10by1zZXJ2ZXInID8gJ0NPREVYLlJQQy5TRU5EJyA6ICdDT0RFWC5SUEMuUkVDRUlWRScsIHN1bW1hcml6ZUNvZGV4UnBjTWVzc2FnZShtZXNzYWdlKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBUZWFyIGV2ZXJ5dGhpbmcgZG93biBpZiB0aGUgY2hpbGQgZGllcyBvbiBpdHMgb3duLlxuXHRcdGNsaWVudC5vbkV4aXQoZSA9PiB7XG5cdFx0XHRkaWFnbm9zdGljc0xvZz8uZmx1c2hTdHJlYW1zKCdjb2RleC1hcHAtc2VydmVyOicpO1xuXHRcdFx0ZGlhZ25vc3RpY3NMb2c/LnJlY29yZCgncHJvdG9jb2wnLCAnQ09ERVguUFJPQ0VTUy5FWElUJywgZSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gYXBwLXNlcnZlciBleGl0ZWQgY29kZT0ke2UuY29kZX0gc2lnbmFsPSR7ZS5zaWduYWx9YCk7XG5cdFx0XHR0aGlzLl9oYW5kbGVDb25uZWN0aW9uTG9zdCgpO1xuXHRcdH0pO1xuXHRcdGNsaWVudC5vblRyYW5zcG9ydEVycm9yKGVyciA9PiB7XG5cdFx0XHRkaWFnbm9zdGljc0xvZz8ucmVjb3JkKCdlcnJvcnMnLCAnQ09ERVguVFJBTlNQT1JULkVSUk9SJywgeyBtZXNzYWdlOiBlcnIubWVzc2FnZSwgc3RhY2s6IGVyci5zdGFjayB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleF0gdHJhbnNwb3J0IGVycm9yOiAke2Vyci5tZXNzYWdlfWApO1xuXHRcdFx0dGhpcy5faGFuZGxlQ29ubmVjdGlvbkxvc3QoKTtcblx0XHR9KTtcblxuXHRcdC8vIEluaXRpYWxpemUgaGFuZHNoYWtlLiBGYWlsdXJlIGhlcmUgaXMgZmF0YWwgZm9yIHRoZSBjb25uZWN0aW9uLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQucmVxdWVzdDwnaW5pdGlhbGl6ZSc+KCdpbml0aWFsaXplJywge1xuXHRcdFx0XHRjbGllbnRJbmZvOiBDTElFTlRfSU5GTyxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IGV4cGVyaW1lbnRhbEFwaTogdHJ1ZSwgcmVxdWVzdEF0dGVzdGF0aW9uOiBmYWxzZSwgb3B0T3V0Tm90aWZpY2F0aW9uTWV0aG9kczogbnVsbCB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjbGllbnQubm90aWZ5PCdpbml0aWFsaXplZCc+KCdpbml0aWFsaXplZCcsIHVuZGVmaW5lZCBhcyBuZXZlcik7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hBY2NvdW50KGNsaWVudCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0cHJveHlIYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0dHJ5IHsgY2hpbGQua2lsbCgnU0lHS0lMTCcpOyB9IGNhdGNoIHsgLyogYWxyZWFkeSBkZWFkICovIH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHQvLyBXaXJlIGdsb2JhbCBub3RpZmljYXRpb24gXHUyMTkyIFNlc3Npb25BY3Rpb24gZGlzcGF0Y2guXG5cdFx0dGhpcy5fcmVnaXN0ZXJJZ25vcmVkTm90aWZpY2F0aW9ucyhjbGllbnQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignYWNjb3VudC9sb2dpbi9jb21wbGV0ZWQnLCAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hBY2NvdW50KGNsaWVudCkudGhlbigoKSA9PiB0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdhY2NvdW50L3VwZGF0ZWQnLCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kID09PSAncmVhZHknICYmIHRoaXMuX2Nvbm5lY3Rpb24uY2xpZW50ID09PSBjbGllbnQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoQWNjb3VudChjbGllbnQpO1xuXHRcdFx0XHR0aGlzLl9xdWV1ZU1vZGVsUmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2FjY291bnQvcmF0ZUxpbWl0cy91cGRhdGVkJywgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ3JlYWR5JyAmJiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCA9PT0gY2xpZW50ICYmIHRoaXMuX29wZW5BSUFjY291bnRTdGF0ZS5zdGF0dXMgPT09ICdzaWduZWRJbicgJiYgdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLmF1dGhUeXBlID09PSAnY2hhdGdwdCcpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9yZWZyZXNoQWNjb3VudFJhdGVMaW1pdHMoY2xpZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCd0dXJuL3N0YXJ0ZWQnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gdGhpcy5faGFuZGxlVHVyblN0YXJ0ZWROb3RpZmljYXRpb24ocywgcGFyYW1zKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ3R1cm4vZGlmZi91cGRhdGVkJywgcGFyYW1zID0+IHRoaXMuX3F1ZXVlRmlsZUV2ZW50KHBhcmFtcy50aHJlYWRJZCwgKCkgPT4gdGhpcy5fZGlzcGF0Y2hUdXJuRGlmZlVwZGF0ZWQocGFyYW1zKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2Vycm9yJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IHRoaXMuX2hhbmRsZUVycm9yTm90aWZpY2F0aW9uKHMsIHBhcmFtcykpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL3N0YXJ0ZWQnLCBwYXJhbXMgPT4ge1xuXHRcdFx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdjb21tYW5kRXhlY3V0aW9uJykge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZUZpbGVFdmVudChwYXJhbXMudGhyZWFkSWQsICgpID0+IHRoaXMuX2Rpc3BhdGNoSXRlbVN0YXJ0ZWQocGFyYW1zKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiB0aGlzLl9oYW5kbGVJdGVtU3RhcnRlZChzLCBwYXJhbXMpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL2FnZW50TWVzc2FnZS9kZWx0YScsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBBZ2VudE1lc3NhZ2VEZWx0YShzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vY29tbWFuZEV4ZWN1dGlvbi9vdXRwdXREZWx0YScsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBDb21tYW5kRXhlY3V0aW9uT3V0cHV0RGVsdGEocy5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuSWQocywgcGFyYW1zKSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL2ZpbGVDaGFuZ2UvcGF0Y2hVcGRhdGVkJywgcGFyYW1zID0+IHRoaXMuX3F1ZXVlRmlsZUV2ZW50KHBhcmFtcy50aHJlYWRJZCwgKCkgPT4gdGhpcy5fZGlzcGF0Y2hGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHBhcmFtcykpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL2ZpbGVDaGFuZ2Uvb3V0cHV0RGVsdGEnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gbWFwRmlsZUNoYW5nZU91dHB1dERlbHRhKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9tY3BUb29sQ2FsbC9wcm9ncmVzcycsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBNY3BUb29sQ2FsbFByb2dyZXNzKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9yZWFzb25pbmcvc3VtbWFyeVBhcnRBZGRlZCcsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9yZWFzb25pbmcvc3VtbWFyeVRleHREZWx0YScsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiBtYXBSZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhKHMubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHMsIHBhcmFtcykpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignaXRlbS9yZWFzb25pbmcvdGV4dERlbHRhJywgcGFyYW1zID0+IHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IG1hcFJlYXNvbmluZ1RleHREZWx0YShzLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm5JZChzLCBwYXJhbXMpKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ3RocmVhZC90b2tlblVzYWdlL3VwZGF0ZWQnLCBwYXJhbXMgPT4gdGhpcy5fZGlzcGF0Y2hCeVRocmVhZChwYXJhbXMudGhyZWFkSWQsIHMgPT4gcy5jdXJyZW50VHVybklkID8gbWFwVG9rZW5Vc2FnZVVwZGF0ZWQodGhpcy5fd2l0aEhvc3RUdXJuSWQocywgcGFyYW1zKSwgcy5tb2RlbD8uaWQpIDogW10pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uTm90aWZpY2F0aW9uKCdpdGVtL2NvbXBsZXRlZCcsIHBhcmFtcyA9PiB0aGlzLl9xdWV1ZUZpbGVFdmVudChwYXJhbXMudGhyZWFkSWQsICgpID0+IHRoaXMuX2Rpc3BhdGNoSXRlbUNvbXBsZXRlZChwYXJhbXMpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbigndHVybi9jb21wbGV0ZWQnLCBwYXJhbXMgPT4gdGhpcy5fcXVldWVGaWxlRXZlbnQocGFyYW1zLnRocmVhZElkLCAoKSA9PiB7IHRoaXMuX2Rpc3BhdGNoVHVybkNvbXBsZXRlZChwYXJhbXMpOyB9KSkpO1xuXHRcdC8vIEF1dG8tcmV2aWV3IChndWFyZGlhbikgc3VyZmFjaW5nLiBUaGUgZ3VhcmRpYW4gd2FybmluZyBpcyBzaG93biBhcyBhXG5cdFx0Ly8gc3lzdGVtIG5vdGlmaWNhdGlvbjsgYSBjb21wbGV0ZWQgKmRlbmllZCogcmV2aWV3IGlzIHR1cm5lZCBpbnRvIGFcblx0XHQvLyByZXRyb2FjdGl2ZSBcIkFwcHJvdmUgYW55d2F5XCIgdG9vbC1jYWxsIGNhcmQuIFRoZSByZXZpZXcgbGlmZWN5Y2xlIGlzXG5cdFx0Ly8gbm9uLWJsb2NraW5nIChjb2RleCBkb2VzIG5vdCB3YWl0IG9uIHVzKSwgc28gdGhlIGNvbXBsZXRlZCBoYW5kbGVyIGlzXG5cdFx0Ly8gYXN5bmMgYW5kIHJlc29sdmVzIGl0cyBzZXNzaW9uIGRpcmVjdGx5IHJhdGhlciB0aGFuIHZpYSBfZGlzcGF0Y2hCeVRocmVhZC5cblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2d1YXJkaWFuV2FybmluZycsIHBhcmFtcyA9PiB0aGlzLl9kaXNwYXRjaEJ5VGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgcyA9PiB0aGlzLl9oYW5kbGVHdWFyZGlhbldhcm5pbmcocywgcGFyYW1zKSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25Ob3RpZmljYXRpb24oJ2l0ZW0vYXV0b0FwcHJvdmFsUmV2aWV3L2NvbXBsZXRlZCcsIHBhcmFtcyA9PiB7IHZvaWQgdGhpcy5faGFuZGxlR3VhcmRpYW5SZXZpZXdDb21wbGV0ZWQoY2xpZW50LCBwYXJhbXMpOyB9KSk7XG5cblx0XHQvLyBNQ1Agc2VydmVyIGxpZmVjeWNsZS4gQ29kZXggb3ducyBNQ1Agc2VydmVycyBhdCB0aGUgcHJvY2VzcyBsZXZlbFxuXHRcdC8vIChzaGFyZWQgYWNyb3NzIHRocmVhZHMpOyBzdXJmYWNlIHRoZW0gdG8gQUhQIGNsaWVudHMgYXMgcGVyLXNlc3Npb25cblx0XHQvLyBjdXN0b21pemF0aW9ucyArIGFuIGBtY3A6Ly9gIHNpZGUgY2hhbm5lbC4gVGhlIHN0YXJ0dXAgbm90aWZpY2F0aW9uXG5cdFx0Ly8gZHJpdmVzIHN0YXRlIHRyYW5zaXRpb25zOyBgcmVhZHlgIHRyaWdnZXJzIGEgZnVsbCBpbnZlbnRvcnkgcmVmcmVzaFxuXHRcdC8vIHNvIHRoZSBmcmVzaGx5LWxvYWRlZCB0b29scyBiZWNvbWUgYXZhaWxhYmxlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbignbWNwU2VydmVyL3N0YXJ0dXBTdGF0dXMvdXBkYXRlZCcsIHBhcmFtcyA9PiB0aGlzLl9oYW5kbGVNY3BTdGFydHVwU3RhdHVzKGNsaWVudCwgcGFyYW1zLm5hbWUsIHBhcmFtcy5zdGF0dXMsIHBhcmFtcy5lcnJvcikpKTtcblxuXHRcdC8vIFBoYXNlIDQ6IGNvbW1hbmQtZXhlY3V0aW9uIGFwcHJvdmFsIHJlcXVlc3RzLiBQYXJrIG9uIGFcblx0XHQvLyBwZXItc2Vzc2lvbiBkZWZlcnJlZCwgZW1pdCBgQ2hhdFRvb2xDYWxsUmVhZHlgIGluIHRoZVxuXHRcdC8vIFBlbmRpbmdDb25maXJtYXRpb24gc3RhdGUsIGFuZCBhbnN3ZXIgY29kZXggd2hlbiB0aGUgdXNlclxuXHRcdC8vIChvciBhY2NlcHQtZm9yLXNlc3Npb24gbWVtb2l6YXRpb24pIGRlY2lkZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uUmVxdWVzdDwnaXRlbS9jb21tYW5kRXhlY3V0aW9uL3JlcXVlc3RBcHByb3ZhbCc+KFxuXHRcdFx0J2l0ZW0vY29tbWFuZEV4ZWN1dGlvbi9yZXF1ZXN0QXBwcm92YWwnLFxuXHRcdFx0cGFyYW1zID0+IHRoaXMuX2hhbmRsZUNvbW1hbmRBcHByb3ZhbFJlcXVlc3RScGMocGFyYW1zKSxcblx0XHQpKTtcblxuXHRcdC8vIEZpbGUtY2hhbmdlIGFuZCBwZXJtaXNzaW9uLWVzY2FsYXRpb24gYXBwcm92YWwgcmVxdWVzdHMgKHJhaXNlZCBpblxuXHRcdC8vIG5vbi1gZGFuZ2VyLWZ1bGwtYWNjZXNzYCBzYW5kYm94ZXMgLyBvbiB0aGUgb24tcmVxdWVzdCBhcHByb3ZhbFxuXHRcdC8vIHBvbGljeSkuIFN1cmZhY2UgdGhlbSB0aHJvdWdoIHRoZSBzYW1lIHBlbmRpbmctY29uZmlybWF0aW9uIGZsb3cuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uUmVxdWVzdDwnaXRlbS9maWxlQ2hhbmdlL3JlcXVlc3RBcHByb3ZhbCc+KFxuXHRcdFx0J2l0ZW0vZmlsZUNoYW5nZS9yZXF1ZXN0QXBwcm92YWwnLFxuXHRcdFx0cGFyYW1zID0+IHRoaXMuX2hhbmRsZUZpbGVDaGFuZ2VBcHByb3ZhbFJlcXVlc3RScGMocGFyYW1zKSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjbGllbnQub25SZXF1ZXN0PCdpdGVtL3Blcm1pc3Npb25zL3JlcXVlc3RBcHByb3ZhbCc+KFxuXHRcdFx0J2l0ZW0vcGVybWlzc2lvbnMvcmVxdWVzdEFwcHJvdmFsJyxcblx0XHRcdHBhcmFtcyA9PiB0aGlzLl9oYW5kbGVQZXJtaXNzaW9uc0FwcHJvdmFsUmVxdWVzdFJwYyhwYXJhbXMpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gQ2xpZW50LXByb3ZpZGVkIChkeW5hbWljKSB0b29sIGV4ZWN1dGlvbiByZXF1ZXN0cy4gQ29kZXggYXNrcyB0aGVcblx0XHQvLyBob3N0IHRvIHJ1biBhIHRvb2wgcmVnaXN0ZXJlZCB2aWEgYHRocmVhZC9zdGFydC5keW5hbWljVG9vbHNgOyB3ZVxuXHRcdC8vIHJvdXRlIHRoZSBjYWxsIHRvIHRoZSBvd25pbmcgd29ya2JlbmNoIGNsaWVudCBhbmQgYW5zd2VyIHdpdGggaXRzXG5cdFx0Ly8gcmVzdWx0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vblJlcXVlc3Q8J2l0ZW0vdG9vbC9jYWxsJz4oXG5cdFx0XHQnaXRlbS90b29sL2NhbGwnLFxuXHRcdFx0cGFyYW1zID0+IHRoaXMuX2hhbmRsZUR5bmFtaWNUb29sQ2FsbFJwYyhwYXJhbXMpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gVXNlci1pbnB1dCByZXF1ZXN0cyAodGhlIG1vZGVsJ3MgYGFza191c2VyYCkuIFN1cmZhY2UgdGhlIHF1ZXN0aW9uc1xuXHRcdC8vIGFzIGEgY2hhdCBpbnB1dCByZXF1ZXN0IGFuZCBhbnN3ZXIgY29kZXggd2l0aCB0aGUgdXNlcidzIHJlc3BvbnNlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vblJlcXVlc3Q8J2l0ZW0vdG9vbC9yZXF1ZXN0VXNlcklucHV0Jz4oXG5cdFx0XHQnaXRlbS90b29sL3JlcXVlc3RVc2VySW5wdXQnLFxuXHRcdFx0cGFyYW1zID0+IHRoaXMuX2hhbmRsZVVzZXJJbnB1dFJlcXVlc3RScGMocGFyYW1zKSxcblx0XHQpKTtcblxuXHRcdC8vIE1DUCBlbGljaXRhdGlvbiByZXF1ZXN0cy4gQW4gTUNQIHNlcnZlciAocmVsYXllZCBieSBjb2RleCkgYXNrcyB0aGVcblx0XHQvLyB1c2VyIGZvciBzdHJ1Y3R1cmVkIGlucHV0IG1pZC10b29sLWNhbGwuIFN1cmZhY2UgaXQgdGhyb3VnaCB0aGUgc2FtZVxuXHRcdC8vIGNoYXQtaW5wdXQgZmxvdyBhcyBgYXNrX3VzZXJgIGFuZCBhbnN3ZXIgY29kZXggd2l0aCBhY2NlcHQvZGVjbGluZS9jYW5jZWwuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2xpZW50Lm9uUmVxdWVzdDwnbWNwU2VydmVyL2VsaWNpdGF0aW9uL3JlcXVlc3QnPihcblx0XHRcdCdtY3BTZXJ2ZXIvZWxpY2l0YXRpb24vcmVxdWVzdCcsXG5cdFx0XHRwYXJhbXMgPT4gdGhpcy5faGFuZGxlRWxpY2l0YXRpb25SZXF1ZXN0UnBjKHBhcmFtcyksXG5cdFx0KSk7XG5cblx0XHQvLyBTZWVkIHRoZSBNQ1Agc2VydmVyIGludmVudG9yeSBmcm9tIHRoZSBmcmVzaGx5LWNvbm5lY3RlZCBhcHAtc2VydmVyLlxuXHRcdC8vIEJlc3QtZWZmb3J0IGFuZCBmaXJlLWFuZC1mb3JnZXQ6IGZhaWx1cmVzIGxlYXZlIHRoZSBpbnZlbnRvcnkgZW1wdHlcblx0XHQvLyB1bnRpbCB0aGUgbmV4dCBgbWNwU2VydmVyL3N0YXJ0dXBTdGF0dXMvdXBkYXRlZGAgbm90aWZpY2F0aW9uLlxuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaE1jcEludmVudG9yeShjbGllbnQpO1xuXG5cdFx0cmV0dXJuIHsgY2xpZW50LCBwcm94eUhhbmRsZSwgY2hpbGQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIGBtY3Bfc2VydmVyc2Agb2JqZWN0IGZvciBhIHNlc3Npb24ncyBgdGhyZWFkL3N0YXJ0LmNvbmZpZ2A6XG5cdCAqIHRoZSB3b3JrYmVuY2gncyByb290IGBtY3BTZXJ2ZXJzYCBjb25maWcgbWVyZ2VkIHdpdGggdGhlIHNlc3Npb24nc1xuXHQgKiBlbmFibGVkIGNsaWVudC1wbHVnaW4gTUNQIHNlcnZlcnMuIFBhc3NpbmcgdGhlbSBwZXItdGhyZWFkIChyYXRoZXIgdGhhblxuXHQgKiBhcyBwcm9jZXNzLWdsb2JhbCBgLWNgIHNwYXduIG92ZXJyaWRlcykgbWVhbnMgZWFjaCBuZXcgc2Vzc2lvbiBwaWNrcyB1cFxuXHQgKiB0aGUgY3VycmVudCByb290IGNvbmZpZyB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIHNoYXJlZCBhcHAtc2VydmVyLCBhbmQgaXRcblx0ICogbWVyZ2VzIHdpdGggKGxlYXZlcyBpbnRhY3QpIHRoZSB1c2VyJ3MgZ2xvYmFsIGB+Ly5jb2RleC9jb25maWcudG9tbGAuXG5cdCAqIENsaWVudC1wbHVnaW4gc2VydmVycyB3aW4gYSBuYW1lIGNvbGxpc2lvbiB3aXRoIHRoZSByb290IGNvbmZpZy4gQW55XG5cdCAqIE9BdXRoIGJlYXJlciB0b2tlbiBhY3F1aXJlZCBmb3IgYW4gYXV0aC1nYXRlZCBodHRwIHNlcnZlciAoc2VlXG5cdCAqIHtAbGluayBoYW5kbGVBdXRoZW50aWNhdGlvblRva2VufSkgaXMgaW5qZWN0ZWQgYXMgYW4gYEF1dGhvcml6YXRpb25gXG5cdCAqIGhlYWRlciBzbyBjb2RleCBjb25uZWN0cyBhdXRoZW50aWNhdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGRTZXNzaW9uTWNwU2VydmVycyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUmVjb3JkPHN0cmluZywgSUNvZGV4TWNwU2VydmVyQ29uZmlnSnNvbj4ge1xuXHRcdGNvbnN0IHJvb3QgPSBPYmplY3QuZnJvbUVudHJpZXMoXG5cdFx0XHRPYmplY3QuZW50cmllcyhjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpKSlcblx0XHRcdFx0LmZpbHRlcigoW25hbWVdKSA9PiB0aGlzLl9pc01jcFNlcnZlckVuYWJsZWRGb3JTZGsoc2Vzc2lvbiwgbmFtZSkpLFxuXHRcdCk7XG5cdFx0Y29uc3QgY2xpZW50UGx1Z2lucyA9IGNvZGV4TWNwU2VydmVyc0Zyb21QbHVnaW5zKHRoaXMuX2VuYWJsZWRDbGllbnRQbHVnaW5zKHNlc3Npb24pKTtcblx0XHRyZXR1cm4gaW5qZWN0Q29kZXhNY3BBdXRoVG9rZW5zKHsgLi4ucm9vdCwgLi4uY2xpZW50UGx1Z2lucyB9LCB0aGlzLl9tY3BBdXRoVG9rZW5zKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTWNwU2VydmVyRW5hYmxlZEZvclNkayhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXNvbHV0aW9uID0gdGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlPy5yZXNvbHZlKHNlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpLCB0YXJnZXRGb3JVbm93bmVkTWNwU2VydmVyKG5hbWUpKTtcblx0XHRyZXR1cm4gcmVzb2x1dGlvbj8ua2luZCA9PT0gJ3Jlc29sdmVkJyAmJiByZXNvbHV0aW9uLmVuYWJsZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG5vcm1hbGl6ZWQgVVJMcyBvZiBldmVyeSBjb25maWd1cmVkIGh0dHAgTUNQIHNlcnZlciAocm9vdCBjb25maWcgK1xuXHQgKiB0aGUgc2Vzc2lvbidzIGNsaWVudCBwbHVnaW5zKSwga2V5ZWQgYnkgc2VydmVyIG5hbWUuIFVzZWQgdG8gKGEpIHN1cmZhY2Vcblx0ICogYW4gYXV0aC1yZXF1aXJlZCBzZXJ2ZXIncyByZXNvdXJjZSBmb3IgdGhlIHdvcmtiZW5jaCBzaWduLWluIGFuZCAoYilcblx0ICogbWF0Y2ggYSB3b3JrYmVuY2gtYWNxdWlyZWQgdG9rZW4gYmFjayB0byB0aGUgc2VydmVyKHMpIGl0IHVubG9ja3MuXG5cdCAqIENvbXB1dGVkIGZyb20gYSB0b2tlbi1mcmVlIGJ1aWxkIHNvIHRoZSBVUkxzIGFyZSB0aGUgYmFyZSBzZXJ2ZXIgVVJMcy5cblx0ICovXG5cdHByaXZhdGUgX2h0dHBNY3BTZXJ2ZXJVcmxzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRjb25zdCByb290ID0gY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5KSk7XG5cdFx0Y29uc3QgY2xpZW50UGx1Z2lucyA9IGNvZGV4TWNwU2VydmVyc0Zyb21QbHVnaW5zKHRoaXMuX2VuYWJsZWRDbGllbnRQbHVnaW5zKHNlc3Npb24pKTtcblx0XHRjb25zdCB1cmxzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IFtuYW1lLCBzZXJ2ZXJdIG9mIE9iamVjdC5lbnRyaWVzKHsgLi4ucm9vdCwgLi4uY2xpZW50UGx1Z2lucyB9KSkge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZCA9IHNlcnZlci51cmwgIT09IHVuZGVmaW5lZCA/IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwoc2VydmVyLnVybCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobm9ybWFsaXplZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHVybHMuc2V0KG5hbWUsIG5vcm1hbGl6ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdXJscztcblx0fVxuXG5cdC8qKiBUaGUgYmFyZSAodW4tbm9ybWFsaXplZCkgVVJMIG9mIGEgY29uZmlndXJlZCBodHRwIE1DUCBzZXJ2ZXIgYnkgbmFtZSwgYWNyb3NzIGFsbCBzZXNzaW9ucy4gKi9cblx0cHJpdmF0ZSBfbWNwU2VydmVyVXJsRm9yTmFtZShuYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJvb3QgPSBjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpKTtcblx0XHRpZiAocm9vdFtuYW1lXT8udXJsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiByb290W25hbWVdLnVybDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBmcm9tUGx1Z2lucyA9IGNvZGV4TWNwU2VydmVyc0Zyb21QbHVnaW5zKHRoaXMuX2VuYWJsZWRDbGllbnRQbHVnaW5zKHNlc3Npb24pKTtcblx0XHRcdGlmIChmcm9tUGx1Z2luc1tuYW1lXT8udXJsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZyb21QbHVnaW5zW25hbWVdLnVybDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hvc3RTZXJ2ZXJUb29sTmFtZXMoKTogU2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiBuZXcgU2V0KFsuLi4odGhpcy5fc2VydmVyVG9vbEhvc3Q/LnRvb2xOYW1lcyA/PyBbXSksIENPREVYX1dSSVRFX0ZJTEVfVE9PTF9OQU1FXSk7XG5cdH1cblxuXHRwcml2YXRlIF93b3Jrc3BhY2VSb290cyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogVVJJW10ge1xuXHRcdGNvbnN0IHJvb3RzID0gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24pO1xuXHRcdHJldHVybiByb290cy5sZW5ndGggPiAwID8gWy4uLnJvb3RzXSA6IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcCB0aGUgc2Vzc2lvbidzIHRvb2xzIGludG8gY29kZXggYGR5bmFtaWNUb29sc2Agc3BlY3M6IHRoZSBhZ2VudCBob3N0J3Ncblx0ICogc2VydmVyIHRvb2xzIChleGVjdXRlZCBpbi1wcm9jZXNzKSBwbHVzIHRoZSB3b3JrYmVuY2ggY2xpZW50J3MgdG9vbHNcblx0ICogKHJvdW5kLXRyaXBwZWQgdG8gdGhlIGNsaWVudCkuIEJvdGggYXJlIHJlZ2lzdGVyZWQgd2l0aCBjb2RleCB0aGUgc2FtZVxuXHQgKiB3YXkgXHUyMDE0IGF0IGB0aHJlYWQvc3RhcnRgIFx1MjAxNCBhbmQgZGlzcGF0Y2hlZCBhcGFydCBpblxuXHQgKiB7QGxpbmsgX2hhbmRsZUR5bmFtaWNUb29sQ2FsbFJwY30gYnkgbmFtZS5cblx0ICovXG5cdHByaXZhdGUgX2J1aWxkRHluYW1pY1Rvb2xzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBEeW5hbWljVG9vbFNwZWNbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VydmVyVG9vbHMgPSB0aGlzLl9zZXJ2ZXJUb29sSG9zdD8uZGVmaW5pdGlvbnMgPz8gW107XG5cdFx0Y29uc3QgY2xpZW50VG9vbHMgPSBzZXNzaW9uLmNsaWVudFRvb2xTZXQubWVyZ2VkKCk7XG5cdFx0Ly8gU2VydmVyIHRvb2xzIGZpcnN0OyBhIHNlcnZlciB0b29sIG5hbWUgc2hhZG93cyBhIGNvbGxpZGluZyBjbGllbnQgdG9vbFxuXHRcdC8vICh0aGUgYWdlbnQgaG9zdCBvd25zIHRob3NlIG5hbWVzKSBhbmQgbWF0Y2hlcyB0aGUgcm91dGluZyBvcmRlciBiZWxvdy5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWxsOiBUb29sRGVmaW5pdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCB0IG9mIFt3cml0ZUZpbGVUb29sRGVmaW5pdGlvbiwgLi4uc2VydmVyVG9vbHMsIC4uLmNsaWVudFRvb2xzXSkge1xuXHRcdFx0aWYgKHNlZW4uaGFzKHQubmFtZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRzZWVuLmFkZCh0Lm5hbWUpO1xuXHRcdFx0YWxsLnB1c2godCk7XG5cdFx0fVxuXHRcdGlmIChhbGwubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYWxsLm1hcCh0ID0+ICh7XG5cdFx0XHR0eXBlOiAnZnVuY3Rpb24nIGFzIGNvbnN0LFxuXHRcdFx0bmFtZTogdC5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHQuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRpbnB1dFNjaGVtYTogKHQuaW5wdXRTY2hlbWEgPz8geyB0eXBlOiAnb2JqZWN0JyB9KSBhcyBKc29uVmFsdWUsXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzY29wZSBDb2RleCBoYW5kcyB7QGxpbmsgSUFnZW50U2VydmVyVG9vbEhvc3R9IGZvciBhIHNlc3Npb24nc1xuXHQgKiBzZXJ2ZXItdG9vbCBjb25maXJtYXRpb24vZXhlY3V0aW9uOiB0aGUgc2FtZSBob3N0LXN1cHBsaWVkXG5cdCAqIGNvbmZpZ3VyYXRpb24gc2NvcGUge0BsaW5rIElBZ2VudFNlcnZlclRvb2xIb3N0LmFkdmVydGlzZX0gd2FzIGNhbGxlZFxuXHQgKiB3aXRoIGZvciB0aGlzIGNoYXQgKHNlZSB7QGxpbmsgX2NvbmZpZ1Njb3BlfSksIG5ldmVyIHRoZSBydW50aW1lJ3Mgb3duXG5cdCAqIGlkZW50aXR5LiBBIHBlZXIgY2hhdCdzIHJ1bnRpbWUgaXMga2V5ZWQgYnkgaXRzIG93biB0aHJlYWQgaWQgKGUuZy5cblx0ICogYGNvZGV4Oi88dGhyZWFkSWQ+YCkgb25jZSBtYXRlcmlhbGl6ZWQsIHdoaWNoIGlzIG5laXRoZXIgdGhlIGFkZHJlc3NlZFxuXHQgKiBBSCBzZXNzaW9uIG5vciB0aGUgY2hhdCBjaGFubmVsIGFuZCBcdTIwMTQgY3JpdGljYWxseSBcdTIwMTQgbm90IHRoZSBzY29wZSB0aGVcblx0ICogaG9zdCBpbmRleGVzIGl0cyBwZXItc2Vzc2lvbiB0b29sIHN0YXRlIHVuZGVyLiBGYWxscyBiYWNrIHRvIHRoZVxuXHQgKiBydW50aW1lJ3Mgb3duIFVSSSBvbmx5IHdoZW4gdGhlIGNoYXQgaGFzIG5ldmVyIGJlZW4gdHJhY2tlZCAodGhlcmUgaXNcblx0ICogbm8gYmV0dGVyIHNjb3BlIHRvIHJvdXRlIHRocm91Z2gpLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2VydmVyVG9vbFNjb3BlKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBVUkkge1xuXHRcdHJldHVybiBzZXNzaW9uLmNoYXRDaGFubmVsID8gdGhpcy5fY29uZmlnU2NvcGUoc2Vzc2lvbi5jaGF0Q2hhbm5lbCkgOiBzZXNzaW9uLnNlc3Npb25Vcmk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVEeW5hbWljVG9vbENhbGxScGMocGFyYW1zOiBEeW5hbWljVG9vbENhbGxQYXJhbXMpOiBQcm9taXNlPFNlcnZlclJlcXVlc3RIYW5kbGVyUmVzdWx0PER5bmFtaWNUb29sQ2FsbFJlc3BvbnNlPj4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IChzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZClcblx0XHRcdD8/IHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk/LnNlc3Npb247XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IHRoaXMuX3Rvb2xGYWlsdXJlKGBDb2RleCB0b29sIGNhbGwgZm9yIHVua25vd24gdGhyZWFkICR7cGFyYW1zLnRocmVhZElkfWApIH07XG5cdFx0fVxuXHRcdC8vIFNlcnZlciB0b29scyBhcmUgZXhlY3V0ZWQgaW4tcHJvY2VzcyBhZ2FpbnN0IHRoZSBzZXNzaW9uJ3Mgb3duIHN0YXRlXG5cdFx0Ly8gKG5vIHdvcmtiZW5jaCByb3VuZC10cmlwKS4gV2UgcmVnaXN0ZXIgdGhlbSB1bmRlciB0aGVpciBiYXJlIG5hbWUsIHNvXG5cdFx0Ly8gY29kZXggY2FsbHMgYmFjayB3aXRoIGBuYW1lc3BhY2UgPT09IG51bGxgLiBEaXNwYXRjaCB0aGVtIGhlcmUgYmVmb3JlXG5cdFx0Ly8gdGhlIGNsaWVudC10b29sIHBhdGggYmVsb3cuXG5cdFx0Y29uc3QgaG9zdCA9IHRoaXMuX3NlcnZlclRvb2xIb3N0O1xuXHRcdGlmIChwYXJhbXMubmFtZXNwYWNlID09PSBudWxsICYmIHBhcmFtcy50b29sID09PSBDT0RFWF9XUklURV9GSUxFX1RPT0xfTkFNRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVdyaXRlRmlsZVRvb2woc2Vzc2lvbiwgcGFyYW1zKTtcblx0XHR9XG5cdFx0aWYgKGhvc3QgJiYgcGFyYW1zLm5hbWVzcGFjZSA9PT0gbnVsbCAmJiBob3N0LnRvb2xOYW1lcy5pbmNsdWRlcyhwYXJhbXMudG9vbCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHNjb3BlID0gdGhpcy5fc2VydmVyVG9vbFNjb3BlKHNlc3Npb24pLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChob3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHNjb3BlLCBwYXJhbXMudG9vbCkpIHtcblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5jYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fdG9vbEZhaWx1cmUoYE5vIHBlbmRpbmcgc2VydmVyIHRvb2wgY2FsbCBmb3IgJHtwYXJhbXMudG9vbH0gKGNhbGxJZCAke3BhcmFtcy5jYWxsSWR9KWApIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlID0gZ2V0U2VydmVyVG9vbERpc3BsYXkocGFyYW1zLnRvb2wsIHBhcmFtcy5hcmd1bWVudHMpPy5pbnZvY2F0aW9uTWVzc2FnZSA/PyBgQ2FsbGluZyAke3BhcmFtcy50b29sfWA7XG5cdFx0XHRcdFx0Y29uc3QgZGVjaXNpb24gPSBhd2FpdCBzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLnJlZ2lzdGVyQW5kRmlyZShlbnRyeS50b29sQ2FsbElkLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiBsb2NhbGl6ZSgnY29kZXguc2VydmVyVG9vbENvbmZpcm1hdGlvbi50aXRsZScsIFwiQWxsb3cgdG9vbCBjYWxsP1wiKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChkZWNpc2lvbiAhPT0gJ2FjY2VwdCcgJiYgZGVjaXNpb24gIT09ICdhY2NlcHRGb3JTZXNzaW9uJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgU2VydmVyIHRvb2wgJHtwYXJhbXMudG9vbH0gd2FzIG5vdCBhcHByb3ZlZGApIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBob3N0LmV4ZWN1dGVUb29sKHNjb3BlLCBwYXJhbXMudG9vbCwgcGFyYW1zLmFyZ3VtZW50cyk7XG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdDogeyBjb250ZW50SXRlbXM6IFt7IHR5cGU6ICdpbnB1dFRleHQnLCB0ZXh0OiBhd2FpdCB0ZXh0IH1dLCBzdWNjZXNzOiB0cnVlIH0gfTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4geyByZXN1bHQ6IHRoaXMuX3Rvb2xGYWlsdXJlKGBTZXJ2ZXIgdG9vbCAke3BhcmFtcy50b29sfSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIGBpdGVtL3N0YXJ0ZWRgIGZvciB0aGUgYGR5bmFtaWNUb29sQ2FsbGAgKGlkID09PSBjYWxsSWQpIGlzIGRlbGl2ZXJlZFxuXHRcdC8vIGJlZm9yZSB0aGlzIHJlcXVlc3QgYW5kIHNlZWRzIHRoZSBob3N0IHRvb2xDYWxsSWQgKyBDaGF0VG9vbENhbGxSZWFkeVxuXHRcdC8vIHRoZSBvd25pbmcgY2xpZW50IHJlYWN0cyB0by4gTG9vayBpdCB1cCBzbyB0aGUgY2xpZW50J3MgY29tcGxldGlvblxuXHRcdC8vIChrZXllZCBieSB0aGF0IHRvb2xDYWxsSWQpIHJlc29sdmVzIHRoaXMgcmVxdWVzdC5cblx0XHRjb25zdCB0b29sQ2FsbElkID0gc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLmNhbGxJZCk/LnRvb2xDYWxsSWQ7XG5cdFx0aWYgKHRvb2xDYWxsSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgTm8gcGVuZGluZyBjbGllbnQgdG9vbCBjYWxsIGZvciAke3BhcmFtcy50b29sfSAoY2FsbElkICR7cGFyYW1zLmNhbGxJZH0pYCkgfTtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24uY2xpZW50VG9vbFNldC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IHRoaXMuX3Rvb2xGYWlsdXJlKGBObyBjbGllbnQgYXZhaWxhYmxlIHRvIHJ1biAke3BhcmFtcy50b29sfWApIH07XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHQvLyBgcmVnaXN0ZXJgIGNvbnN1bWVzIGFueSByZXN1bHQgdGhlIGNsaWVudCBhbHJlYWR5IGRlbGl2ZXJlZCAodGhlXG5cdFx0XHQvLyBkaXNwbGF5IHBhdGggZW1pdHMgQ2hhdFRvb2xDYWxsUmVhZHkgYmVmb3JlIHRoaXMgcmVxdWVzdCwgc28gdGhlXG5cdFx0XHQvLyBjb21wbGV0aW9uIGNhbiByYWNlIGFoZWFkIFx1MjAxNCBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5IGJ1ZmZlcnMgaXQpLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2Vzc2lvbi5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlZ2lzdGVyKHRvb2xDYWxsSWQpO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBkeW5hbWljVG9vbFJlc3BvbnNlRnJvbVJlc3VsdChyZXN1bHQpIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB0aGlzLl90b29sRmFpbHVyZShgQ2xpZW50IHRvb2wgJHtwYXJhbXMudG9vbH0gd2FzIGNhbmNlbGxlZGApIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IHRoaXMuX3Rvb2xGYWlsdXJlKGBDbGllbnQgdG9vbCAke3BhcmFtcy50b29sfSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlV3JpdGVGaWxlVG9vbChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBwYXJhbXM6IER5bmFtaWNUb29sQ2FsbFBhcmFtcyk6IFByb21pc2U8U2VydmVyUmVxdWVzdEhhbmRsZXJSZXN1bHQ8RHluYW1pY1Rvb2xDYWxsUmVzcG9uc2U+PiB7XG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSB0aGlzLl9maWxlRWRpdE9ic2VydmVyKHNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBpdGVtL3N0YXJ0ZWQgaXMgcXVldWVkIG9uIHRoZSBmaWxlLWV2ZW50IGNoYWluOyB3YWl0IHNvIHRoZSBob3N0XG5cdFx0XHQvLyB0b29sQ2FsbElkIGV4aXN0cyBiZWZvcmUgd2UgZW1pdCBhIGxpdmUgRmlsZUVkaXQgc25hcHNob3QuXG5cdFx0XHRhd2FpdCAodGhpcy5fZmlsZUV2ZW50RGlzcGF0Y2hlcy5nZXQocGFyYW1zLnRocmVhZElkKSA/PyBQcm9taXNlLnJlc29sdmUoKSk7XG5cdFx0XHRjb25zdCB7IHBhdGgsIGNvbnRlbnRzIH0gPSBwYXJzZVdyaXRlRmlsZUFyZ3MocGFyYW1zLmFyZ3VtZW50cyk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSByZXNvbHZlV3JpdGFibGVXb3Jrc3BhY2VQYXRoKHBhdGgsIHRoaXMuX3dvcmtzcGFjZVJvb3RzKHNlc3Npb24pKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLmNhbGxJZCk7XG5cdFx0XHRpZiAob2JzZXJ2ZXIpIHtcblx0XHRcdFx0YXdhaXQgb2JzZXJ2ZXIuYmVnaW5EaXJlY3RXcml0ZShwYXJhbXMuY2FsbElkLCB0YXJnZXQuZnNQYXRoLCBjb250ZW50cyk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpZXcgPSBhd2FpdCBvYnNlcnZlci5zbmFwc2hvdERpcmVjdFdyaXRlKGVudHJ5LnR1cm5JZCwgZW50cnkudG9vbENhbGxJZCwgcGFyYW1zLmNhbGxJZCwgY29udGVudHMpO1xuXHRcdFx0XHRcdGlmIChwcmV2aWV3KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9lbWl0Rm9yVGhyZWFkKHBhcmFtcy50aHJlYWRJZCwgc2Vzc2lvbiwge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogW3ByZXZpZXddLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCB8fCAoZW50cnkgJiYgc2Vzc2lvbi5jdXJyZW50VHVybklkICE9PSBlbnRyeS50dXJuSWQpKSB7XG5cdFx0XHRcdG9ic2VydmVyPy5hYmFuZG9uRGlyZWN0V3JpdGUocGFyYW1zLmNhbGxJZCk7XG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fdG9vbEZhaWx1cmUoYFNlcnZlciB0b29sICR7cGFyYW1zLnRvb2x9IHdhcyBjYW5jZWxsZWRgKSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGFwcGx5V3JpdGVGaWxlVG9vbCh0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fd29ya3NwYWNlUm9vdHMoc2Vzc2lvbiksIHBhcmFtcy5hcmd1bWVudHMpO1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiB7IGNvbnRlbnRJdGVtczogW3sgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQgfV0sIHN1Y2Nlc3M6IHRydWUgfSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b2JzZXJ2ZXI/LmFiYW5kb25EaXJlY3RXcml0ZShwYXJhbXMuY2FsbElkKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fdG9vbEZhaWx1cmUoYFNlcnZlciB0b29sICR7cGFyYW1zLnRvb2x9IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCkgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0Rm9yVGhyZWFkKHRocmVhZElkOiBzdHJpbmcsIHNlc3Npb246IElDb2RleFNlc3Npb24sIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZ2V0KHRocmVhZElkKTtcblx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdHRoaXMuX2ZpcmVTdWJhZ2VudChzdWJhZ2VudCwgYWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdG9vbEZhaWx1cmUobWVzc2FnZTogc3RyaW5nKTogRHluYW1pY1Rvb2xDYWxsUmVzcG9uc2Uge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBkeW5hbWljIHRvb2wgY2FsbCBmYWlsZWQ6ICR7bWVzc2FnZX1gKTtcblx0XHRyZXR1cm4geyBjb250ZW50SXRlbXM6IFt7IHR5cGU6ICdpbnB1dFRleHQnLCB0ZXh0OiBtZXNzYWdlIH1dLCBzdWNjZXNzOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVXNlcklucHV0UmVxdWVzdFJwYyhwYXJhbXM6IFRvb2xSZXF1ZXN0VXNlcklucHV0UGFyYW1zKTogUHJvbWlzZTxTZXJ2ZXJSZXF1ZXN0SGFuZGxlclJlc3VsdDxUb29sUmVxdWVzdFVzZXJJbnB1dFJlc3BvbnNlPj4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBlbXB0eVVzZXJJbnB1dFJlc3BvbnNlKHBhcmFtcy5xdWVzdGlvbnMpIH07XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi5jdXJyZW50VHVybklkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gdXNlciBpbnB1dCByZXF1ZXN0IHdpdGhvdXQgYW4gYWN0aXZlIHR1cm4gZm9yIHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfTsgcmV0dXJuaW5nIGVtcHR5IGFuc3dlcnNgKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogZW1wdHlVc2VySW5wdXRSZXNwb25zZShwYXJhbXMucXVlc3Rpb25zKSB9O1xuXHRcdH1cblx0XHQvLyBNQ1AgdG9vbC1jYWxsIGFwcHJvdmFscyBhcnJpdmUgYXMgYSBzaW5nbGUgYHJlcXVlc3RfdXNlcl9pbnB1dGBcblx0XHQvLyBxdWVzdGlvbiBpZCdkIGBtY3BfdG9vbF9jYWxsX2FwcHJvdmFsXzxjYWxsSWQ+YC4gUmVuZGVyIHRoZW0gb24gdGhlXG5cdFx0Ly8gbm9ybWFsIHRvb2wtYXBwcm92YWwgY2FyZCAobWlycm9yaW5nIHNoZWxsL2ZpbGUgYXBwcm92YWxzKSBpbnN0ZWFkIG9mXG5cdFx0Ly8gYSBjaGF0LWlucHV0IHF1ZXN0aW9uLCB3aGVuIHRoZSBvcmlnaW5hdGluZyBgbWNwVG9vbENhbGxgIGl0ZW0ncyBob3N0XG5cdFx0Ly8gdG9vbCBjYWxsIGlzIGtub3duLiBGYWxscyB0aHJvdWdoIHRvIHRoZSBjaGF0LWlucHV0IHBhdGggb3RoZXJ3aXNlLlxuXHRcdGNvbnN0IGFwcHJvdmFsUXVlc3Rpb24gPSBwYXJhbXMucXVlc3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBwYXJhbXMucXVlc3Rpb25zWzBdLmlkLnN0YXJ0c1dpdGgoTUNQX1RPT0xfQVBQUk9WQUxfUVVFU1RJT05fSURfUFJFRklYKVxuXHRcdFx0PyBwYXJhbXMucXVlc3Rpb25zWzBdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpZiAoYXBwcm92YWxRdWVzdGlvbikge1xuXHRcdFx0Y29uc3QgY2FsbElkID0gYXBwcm92YWxRdWVzdGlvbi5pZC5zbGljZShNQ1BfVE9PTF9BUFBST1ZBTF9RVUVTVElPTl9JRF9QUkVGSVgubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoY2FsbElkKTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlTWNwVG9vbEFwcHJvdmFsVmlhQ2FyZChzZXNzaW9uLCBhcHByb3ZhbFF1ZXN0aW9uLCBlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBidWlsZFVzZXJJbnB1dFJlcXVlc3QocmVxdWVzdElkLCBwYXJhbXMucXVlc3Rpb25zKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2Vzc2lvbi5wZW5kaW5nVXNlcklucHV0cy5yZWdpc3RlckFuZEZpcmUocmVxdWVzdElkLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLCByZXF1ZXN0IH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IHVzZXJJbnB1dFJlc3BvbnNlRnJvbUFuc3dlcnMocGFyYW1zLnF1ZXN0aW9ucywgcmVzdWx0LnJlc3BvbnNlLCByZXN1bHQuYW5zd2VycykgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFNlc3Npb24gZGlzcG9zZWQgLyBjb25uZWN0aW9uIGxvc3Qgd2hpbGUgYXdhaXRpbmc7IGFuc3dlciBjb2RleFxuXHRcdFx0Ly8gd2l0aCBlbXB0eSBhbnN3ZXJzIHNvIHRoZSB0dXJuIHVud2luZHMgaW5zdGVhZCBvZiBoYW5naW5nLlxuXHRcdFx0cmV0dXJuIHsgcmVzdWx0OiBlbXB0eVVzZXJJbnB1dFJlc3BvbnNlKHBhcmFtcy5xdWVzdGlvbnMpIH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlcnMgYW4gTUNQIHRvb2wtY2FsbCBhcHByb3ZhbCBvbiB0aGUgbm9ybWFsIHRvb2wtYXBwcm92YWwgY2FyZFxuXHQgKiAoYSBwZW5kaW5nLWNvbmZpcm1hdGlvbiBgQ2hhdFRvb2xDYWxsUmVhZHlgIG9uIHRoZSBvcmlnaW5hdGluZ1xuXHQgKiBgbWNwVG9vbENhbGxgIGhvc3QgdG9vbCBjYWxsKSByYXRoZXIgdGhhbiBhcyBhIGNoYXQtaW5wdXQgcXVlc3Rpb24uXG5cdCAqIFRoZSB1c2VyJ3MgQWxsb3cvRGVueSBkZWNpc2lvbiBpcyBtYXBwZWQgYmFjayB0byB0aGUgYW5zd2VyIHN0cmluZ1xuXHQgKiBjb2RleCBleHBlY3RzIChgQWxsb3dgIC8gYF9fY29kZXhfbWNwX2RlY2xpbmVfX2ApLiBNaXJyb3JzIHRoZSBzaGVsbFxuXHQgKiBjb21tYW5kIGFwcHJvdmFsIGZsb3cgKHtAbGluayBDb2RleEFnZW50Ll9oYW5kbGVDb21tYW5kQXBwcm92YWxSZXF1ZXN0fSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVNY3BUb29sQXBwcm92YWxWaWFDYXJkKFxuXHRcdHNlc3Npb246IElDb2RleFNlc3Npb24sXG5cdFx0cXVlc3Rpb246IFRvb2xSZXF1ZXN0VXNlcklucHV0UXVlc3Rpb24sXG5cdFx0ZW50cnk6IHsgcmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nOyByZWFkb25seSB0dXJuSWQ6IHN0cmluZyB9LFxuXHQpOiBQcm9taXNlPHsgcmVhZG9ubHkgcmVzdWx0OiBUb29sUmVxdWVzdFVzZXJJbnB1dFJlc3BvbnNlIH0+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25UaXRsZSA9IHF1ZXN0aW9uLnF1ZXN0aW9uIHx8IHF1ZXN0aW9uLmhlYWRlciB8fCAnUnVuIE1DUCB0b29sJztcblx0XHRsZXQgZGVjaXNpb246IENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRkZWNpc2lvbiA9IGF3YWl0IHNlc3Npb24ucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMucmVnaXN0ZXJBbmRGaXJlKGVudHJ5LnRvb2xDYWxsSWQsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRcdHRvb2xJbnB1dDogY29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBTZXNzaW9uIGRpc3Bvc2VkIC8gY29ubmVjdGlvbiBsb3N0IHdoaWxlIGF3YWl0aW5nOyBkZWNsaW5lIHNvIHRoZVxuXHRcdFx0Ly8gY29kZXgtc2lkZSBNQ1AgdG9vbCBjYWxsIHVud2luZHMgaW5zdGVhZCBvZiBoYW5naW5nLlxuXHRcdFx0ZGVjaXNpb24gPSAnZGVjbGluZSc7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbG93ID0gZGVjaXNpb24gPT09ICdhY2NlcHQnIHx8IGRlY2lzaW9uID09PSAnYWNjZXB0Rm9yU2Vzc2lvbic7XG5cdFx0Y29uc3QgYW5zd2VyID0gYWxsb3cgPyBNQ1BfVE9PTF9BUFBST1ZBTF9BTlNXRVJfQUxMT1cgOiBNQ1BfVE9PTF9BUFBST1ZBTF9BTlNXRVJfREVDTElORTtcblx0XHRyZXR1cm4geyByZXN1bHQ6IHsgYW5zd2VyczogeyBbcXVlc3Rpb24uaWRdOiB7IGFuc3dlcnM6IFthbnN3ZXJdIH0gfSB9IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFbGljaXRhdGlvblJlcXVlc3RScGMocGFyYW1zOiBNY3BTZXJ2ZXJFbGljaXRhdGlvblJlcXVlc3RQYXJhbXMpOiBQcm9taXNlPFNlcnZlclJlcXVlc3RIYW5kbGVyUmVzdWx0PE1jcFNlcnZlckVsaWNpdGF0aW9uUmVxdWVzdFJlc3BvbnNlPj4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBlbGljaXRhdGlvbiByZXF1ZXN0IHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfSBtb2RlPSR7cGFyYW1zLm1vZGV9IHNlcnZlcj0ke3BhcmFtcy5zZXJ2ZXJOYW1lfSBzZXNzaW9uPSR7c2Vzc2lvbiA/IHNlc3Npb24uc2Vzc2lvbklkIDogJ05PTkUnfWApO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIGVsaWNpdGF0aW9uIHJlcXVlc3QgZm9yIHVua25vd24gdGhyZWFkSWQ9JHtwYXJhbXMudGhyZWFkSWR9OyBkZWNsaW5pbmdgKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdDogZGVjbGluZWRFbGljaXRhdGlvblJlc3BvbnNlKCkgfTtcblx0XHR9XG5cdFx0aWYgKCFzZXNzaW9uLmN1cnJlbnRUdXJuSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBlbGljaXRhdGlvbiByZXF1ZXN0IHdpdGhvdXQgYW4gYWN0aXZlIHR1cm4gZm9yIHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfTsgZGVjbGluaW5nYCk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGRlY2xpbmVkRWxpY2l0YXRpb25SZXNwb25zZSgpIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBidWlsZEVsaWNpdGF0aW9uUmVxdWVzdChyZXF1ZXN0SWQsIHBhcmFtcyk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVnaXN0ZXJBbmRGaXJlKHJlcXVlc3RJZCwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCwgcmVxdWVzdCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGVsaWNpdGF0aW9uIHJlc29sdmVkIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH0gcmVzcG9uc2U9JHtyZXN1bHQucmVzcG9uc2V9YCk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGVsaWNpdGF0aW9uUmVzcG9uc2VGcm9tQW5zd2VycyhwYXJhbXMsIHJlc3VsdC5yZXNwb25zZSwgcmVzdWx0LmFuc3dlcnMpIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBTZXNzaW9uIGRpc3Bvc2VkIC8gY29ubmVjdGlvbiBsb3N0IHdoaWxlIGF3YWl0aW5nOyBjYW5jZWwgdGhlXG5cdFx0XHQvLyBlbGljaXRhdGlvbiBzbyB0aGUgTUNQIHNlcnZlcidzIHJlcXVlc3QgdW53aW5kcy5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBlbGljaXRhdGlvbiBjYW5jZWxsZWQgcmVxdWVzdElkPSR7cmVxdWVzdElkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGNhbmNlbGxlZEVsaWNpdGF0aW9uUmVzcG9uc2UoKSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hvc3RUdXJuSWQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgYXBwVHVybklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBzZXNzaW9uLmhvc3RUdXJuSWRCeUFwcFR1cm5JZC5nZXQoYXBwVHVybklkKSA/PyBhcHBUdXJuSWQ7XG5cdH1cblxuXHRwcml2YXRlIF93aXRoSG9zdFR1cm5JZDxUIGV4dGVuZHMgeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZyB9PihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBwYXJhbXM6IFQpOiBUIHtcblx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl9ob3N0VHVybklkKHNlc3Npb24sIHBhcmFtcy50dXJuSWQpO1xuXHRcdHJldHVybiB0dXJuSWQgPT09IHBhcmFtcy50dXJuSWQgPyBwYXJhbXMgOiB7IC4uLnBhcmFtcywgdHVybklkIH07XG5cdH1cblxuXHRwcml2YXRlIF93aXRoSG9zdFR1cm48VCBleHRlbmRzIHsgcmVhZG9ubHkgdHVybjogeyByZWFkb25seSBpZDogc3RyaW5nIH0gfT4oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgcGFyYW1zOiBUKTogVCB7XG5cdFx0Y29uc3QgYXBwVHVybklkID0gcGFyYW1zLnR1cm4uaWQ7XG5cdFx0Y29uc3QgaG9zdFR1cm5JZCA9IHNlc3Npb24uY3VycmVudFR1cm5JZCA/PyB0aGlzLl9ob3N0VHVybklkKHNlc3Npb24sIGFwcFR1cm5JZCk7XG5cdFx0c2Vzc2lvbi5ob3N0VHVybklkQnlBcHBUdXJuSWQuc2V0KGFwcFR1cm5JZCwgaG9zdFR1cm5JZCk7XG5cdFx0c2Vzc2lvbi5jdXJyZW50QXBwVHVybklkID0gYXBwVHVybklkO1xuXHRcdHJldHVybiBob3N0VHVybklkID09PSBhcHBUdXJuSWQgPyBwYXJhbXMgOiB7IC4uLnBhcmFtcywgdHVybjogeyAuLi5wYXJhbXMudHVybiwgaWQ6IGhvc3RUdXJuSWQgfSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVHVyblN0YXJ0ZWROb3RpZmljYXRpb24oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgcGFyYW1zOiBUdXJuU3RhcnRlZE5vdGlmaWNhdGlvbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdFx0Ly8gVGhlIHdvcmtiZW5jaCBhbHJlYWR5IGRpc3BhdGNoZWQgdGhlIGNhbm9uaWNhbCB0dXJuIHN0YXJ0IGJlZm9yZSBzZW5kTWVzc2FnZS5cblx0XHQvLyBDb2RleCdzIGV2ZW50IG9ubHkgZXN0YWJsaXNoZXMgYXBwLXNlcnZlciB0dXJuIGlkIGNvcnJlbGF0aW9uIGZvciBsYXRlciBpdGVtcy5cblx0XHRtYXBUdXJuU3RhcnRlZChzZXNzaW9uLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm4oc2Vzc2lvbiwgcGFyYW1zKSwgc2Vzc2lvbi5sYXN0UHJvbXB0VGV4dCk7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXJyb3JOb3RpZmljYXRpb24oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgcGFyYW1zOiBFcnJvck5vdGlmaWNhdGlvbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdFx0Y29uc3QgaG9zdFR1cm5JZCA9IHRoaXMuX2hvc3RUdXJuSWQoc2Vzc2lvbiwgcGFyYW1zLnR1cm5JZCk7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHBhcmFtcy5lcnJvci5tZXNzYWdlIHx8ICdDb2RleCB0dXJuIGZhaWxlZCc7XG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uLnNlc3Npb25JZH1dIHR1cm4gZXJyb3IgKHdpbGxSZXRyeT0ke3BhcmFtcy53aWxsUmV0cnl9KTogJHttZXNzYWdlfWApO1xuXHRcdGlmICghc2Vzc2lvbi5jdXJyZW50VHVybklkICYmICFzZXNzaW9uLmhvc3RUdXJuSWRCeUFwcFR1cm5JZC5oYXMocGFyYW1zLnR1cm5JZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgZWxhcHNlZCA9IHNlc3Npb24udHVyblN0b3BXYXRjaD8uZWxhcHNlZCgpO1xuXHRcdHJldHVybiBtYXBFcnJvck5vdGlmaWNhdGlvbihwYXJhbXMsIGhvc3RUdXJuSWQsIHR5cGVvZiBlbGFwc2VkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZCkgPyBNYXRoLm1heCgwLCBlbGFwc2VkKSA6IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVHVybkNvbXBsZXRlZE5vdGlmaWNhdGlvbihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBwYXJhbXM6IFR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdGNvbnN0IGFwcFR1cm5JZCA9IHBhcmFtcy50dXJuLmlkO1xuXHRcdGNvbnN0IGhvc3RUdXJuSWQgPSB0aGlzLl9ob3N0VHVybklkKHNlc3Npb24sIGFwcFR1cm5JZCk7XG5cdFx0Y29uc3Qgb3V0ID0gbWFwVHVybkNvbXBsZXRlZChzZXNzaW9uLm1hcFN0YXRlLCB0aGlzLl93aXRoSG9zdFR1cm4oc2Vzc2lvbiwgcGFyYW1zKSwgdGhpcy5fY2xlYXJUdXJuU3RvcFdhdGNoKHNlc3Npb24pKTtcblx0XHR0aGlzLl9maWxlRWRpdE9ic2VydmVyKHNlc3Npb24pPy5jbGVhclR1cm5EaWZmKGhvc3RUdXJuSWQpO1xuXHRcdC8vIFJlbWVtYmVyIHdoaWNoIGNvZGV4IChhcHAtc2VydmVyKSB0dXJuIGVhY2ggd29ya2JlbmNoIHR1cm4gbWFwcyB0byBzb1xuXHRcdC8vIHRydW5jYXRlQ2hhdCBjYW4gdHJhbnNsYXRlIGEgaG9zdCB0dXJuIGlkIHRvIGEgdGhyZWFkIHJvbGxiYWNrIGV2ZW5cblx0XHQvLyBhZnRlciB0aGUgbGl2ZSBjb3JyZWxhdGlvbiBiZWxvdyBpcyBjbGVhcmVkLlxuXHRcdHNlc3Npb24uY29kZXhUdXJuSWRCeUhvc3RUdXJuSWQuc2V0KGhvc3RUdXJuSWQsIGFwcFR1cm5JZCk7XG5cdFx0Ly8gQ29kZXggcmVwb3J0cyBhcHAtc2VydmVyIHR1cm4gaWRzLCB3aGlsZSB0aGUgd29ya2JlbmNoIG93bnMgaG9zdCB0dXJuIGlkcy5cblx0XHQvLyBDbGVhciB0aGUgY29ycmVsYXRpb24gYWZ0ZXIgY29tcGxldGlvbiBzbyBsYXRlciB0dXJucyBjYW5ub3QgcmV1c2Ugc3RhbGUgaWRzLlxuXHRcdGlmIChzZXNzaW9uLmN1cnJlbnRBcHBUdXJuSWQgPT09IGFwcFR1cm5JZCB8fCBzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPT09IGhvc3RUdXJuSWQpIHtcblx0XHRcdHNlc3Npb24uY3VycmVudFR1cm5JZCA9IHVuZGVmaW5lZDtcblx0XHRcdHNlc3Npb24uY3VycmVudEFwcFR1cm5JZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0c2Vzc2lvbi5ob3N0VHVybklkQnlBcHBUdXJuSWQuZGVsZXRlKGFwcFR1cm5JZCk7XG5cdFx0Ly8gQW55IHN0ZWVyaW5nIHN0aWxsIGJ1ZmZlcmVkIHdhcyBuZXZlciBlY2hvZWQgYXMgYSBgdXNlck1lc3NhZ2VgXG5cdFx0Ly8gaXRlbTsgY2xlYXIgdGhlIHBlbmRpbmcgYnViYmxlIG5vdyB0aGF0IHRoZSB0dXJuIGlzIG92ZXIuXG5cdFx0dGhpcy5fZHJhaW5QZW5kaW5nU3RlZXJpbmcoc2Vzc2lvbik7XG5cdFx0Ly8gVW53aW5kIGFueSBzdGlsbC1wZW5kaW5nIFwiQXBwcm92ZSBhbnl3YXlcIiBndWFyZGlhbiBjYXJkcy4gY29kZXggZG9lcyBub3Rcblx0XHQvLyBibG9jayBvbiB0aGVtLCBzbyB0aGUgcmVkdWNlciBjYW5jZWxzIHRoZSBjYXJkIHdoZW4gdGhlIHR1cm4gZW5kczsgaGVyZVxuXHRcdC8vIHdlIHJlc29sdmUgdGhlIHBhcmtlZCBkZWZlcnJlZCAoYGNhbmNlbGApIHNvIHRoZSBzdXNwZW5kZWRcblx0XHQvLyB7QGxpbmsgX2hhbmRsZUd1YXJkaWFuUmV2aWV3Q29tcGxldGVkfSBmcmFtZSB1bndpbmRzIGluc3RlYWQgb2YgbGVha2luZ1xuXHRcdC8vIHVudGlsIHNlc3Npb24gZGlzcG9zZS4gVGhlIGR1cmFibGUgZGVuaWFsIG5vdGlmaWNhdGlvbiBhbHJlYWR5IGVtaXR0ZWRcblx0XHQvLyByZW1haW5zIGluIHRoZSB0cmFuc2NyaXB0LlxuXHRcdGlmIChzZXNzaW9uLnBlbmRpbmdHdWFyZGlhblJldmlld0NhcmRzLnNpemUgPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGd1YXJkaWFuVG9vbENhbGxJZCBvZiBbLi4uc2Vzc2lvbi5wZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkc10pIHtcblx0XHRcdFx0c2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5yZXNwb25kKGd1YXJkaWFuVG9vbENhbGxJZCwgJ2NhbmNlbCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0QWN0aXZpdHlDaGFuZ2VkLCBhY3Rpdml0eTogdW5kZWZpbmVkIH0sIC4uLm91dF07XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggYSBjb2RleCBgaXRlbS9zdGFydGVkYCBub3RpZmljYXRpb24uIGB1c2VyTWVzc2FnZWAgaXRlbXMgYXJlXG5cdCAqIGludGVyY2VwdGVkIGhlcmUgKHJhdGhlciB0aGFuIGluIHRoZSBwdXJlIG1hcHBlcikgYmVjYXVzZSBzdGVlcmluZ1xuXHQgKiBwcm9tb3Rpb24gbmVlZHMgdGhlIGFnZW50J3MgcGVyLXNlc3Npb24gdHVybi1jb3JyZWxhdGlvbiBzdGF0ZTsgYWxsXG5cdCAqIG90aGVyIGl0ZW0ga2luZHMgZGVmZXIgdG8ge0BsaW5rIG1hcEl0ZW1TdGFydGVkfS5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZUl0ZW1TdGFydGVkKHNlc3Npb246IElDb2RleFNlc3Npb24sIHBhcmFtczogSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRcdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAndXNlck1lc3NhZ2UnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU3RlZXJlZFVzZXJNZXNzYWdlKHNlc3Npb24sIHBhcmFtcy5pdGVtLmNvbnRlbnQpO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc2Vzc2lvbi5tYXBTdGF0ZSwgdGhpcy5fd2l0aEhvc3RUdXJuSWQoc2Vzc2lvbiwgcGFyYW1zKSk7XG5cdFx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdmaWxlQ2hhbmdlJykge1xuXHRcdFx0dGhpcy5fZmlsZUVkaXRPYnNlcnZlcihzZXNzaW9uKT8uYmVnaW4ocGFyYW1zLml0ZW0uaWQsIHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSwgcGFyYW1zLml0ZW0uY2hhbmdlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlsZUVkaXRPYnNlcnZlcihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogQ29kZXhGaWxlRWRpdE9ic2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNlc3Npb24udGhyZWFkSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBvYnNlcnZlciA9IHRoaXMuX2ZpbGVFZGl0T2JzZXJ2ZXJzLmdldChzZXNzaW9uLnRocmVhZElkKTtcblx0XHRpZiAoIW9ic2VydmVyKSB7XG5cdFx0XHRvYnNlcnZlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDb2RleEZpbGVFZGl0T2JzZXJ2ZXIsXG5cdFx0XHRcdHNlc3Npb24uc2Vzc2lvblVyaSxcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uLnNlc3Npb25VcmkpLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2ZpbGVFZGl0T2JzZXJ2ZXJzLnNldChzZXNzaW9uLnRocmVhZElkLCBvYnNlcnZlcik7XG5cdFx0fVxuXHRcdHJldHVybiBvYnNlcnZlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb2RleCBlY2hvZXMgZXZlcnkgdXNlciBtZXNzYWdlIFx1MjAxNCB0aGUgdHVybiBvcGVuZXIgKGFscmVhZHkgc2hvd24gYnlcblx0ICogdGhlIHdvcmtiZW5jaCBiZWZvcmUgYHNlbmRNZXNzYWdlYCkgYW5kIGFueSBzdGVlcmVkIGlucHV0IFx1MjAxNCBhcyBhXG5cdCAqIGB1c2VyTWVzc2FnZWAgaXRlbS4gT25seSBzdGVlcmVkIGlucHV0IGlzIGJ1ZmZlcmVkIGluXG5cdCAqIHtAbGluayBJQ29kZXhTZXNzaW9uLnBlbmRpbmdTdGVlcmluZ0ZsaXBzfTsgYSBidWZmZXJlZCBtYXRjaCBpc1xuXHQgKiBwcm9tb3RlZCBpbnRvIGl0cyBvd24gdmlzaWJsZSB0dXJuIGFuZCBldmVyeXRoaW5nIGVsc2UgaXMgZHJvcHBlZC5cblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVN0ZWVyZWRVc2VyTWVzc2FnZShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBjb250ZW50OiByZWFkb25seSBVc2VySW5wdXRbXSk6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdFx0Y29uc3QgdGV4dCA9IGV4dHJhY3RVc2VySW5wdXRUZXh0KGNvbnRlbnQpO1xuXHRcdGNvbnN0IHN0ZWVyaW5nID0gdGhpcy5fdGFrZU1hdGNoaW5nUGVuZGluZ1N0ZWVyaW5nKHNlc3Npb24sIHRleHQpO1xuXHRcdGlmICghc3RlZXJpbmcpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2JlZ2luU3RlZXJpbmdUdXJuKHNlc3Npb24sIHN0ZWVyaW5nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQb3AgdGhlIGJ1ZmZlcmVkIHN0ZWVyaW5nIG1lc3NhZ2Ugd2hvc2UgdGV4dCBtYXRjaGVzIHRoZSBlY2hvZWRcblx0ICogYHVzZXJNZXNzYWdlYCBjb250ZW50LiBNYXRjaGluZyBieSBjb250ZW50IChub3QgRklGTykga2VlcHMgdGhlXG5cdCAqIG1hcHBpbmcgY29ycmVjdCB3aGVuIHNldmVyYWwgc3RlZXJpbmcgbWVzc2FnZXMgd2l0aCBkaWZmZXJlbnQgdGV4dHNcblx0ICogYXJlIGluIGZsaWdodC5cblx0ICovXG5cdHByaXZhdGUgX3Rha2VNYXRjaGluZ1BlbmRpbmdTdGVlcmluZyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCB0ZXh0OiBzdHJpbmcpOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbaWQsIG1zZ10gb2Ygc2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwcykge1xuXHRcdFx0aWYgKG1zZy5tZXNzYWdlLnRleHQgPT09IHRleHQpIHtcblx0XHRcdFx0c2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwcy5kZWxldGUoaWQpO1xuXHRcdFx0XHRyZXR1cm4gbXNnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb21vdGUgYSBzdGVlcmVkIG1lc3NhZ2UgaW50byBpdHMgb3duIHByb3RvY29sIHR1cm46IGNvbXBsZXRlIHRoZVxuXHQgKiBpbi1mbGlnaHQgdHVybiAoc28gaXRzIHJlc3BvbnNlIHBhcnRzIHNldHRsZSBpbnRvIGhpc3RvcnkpIGFuZCBvcGVuIGFcblx0ICogZnJlc2ggdHVybiB3aG9zZSB1c2VyIG1lc3NhZ2UgaXMgdGhlIHN0ZWVyaW5nIGNvbnRlbnQuIFRoZVxuXHQgKiBgcXVldWVkTWVzc2FnZUlkYCBjbGVhcnMgdGhlIGNvcnJlc3BvbmRpbmcgcGVuZGluZyBzdGVlcmluZyBidWJibGUuXG5cdCAqIFN1YnNlcXVlbnQgY29kZXggaXRlbXMgZm9yIHRoZSBzYW1lIGFwcC1zZXJ2ZXIgdHVybiBhcmUgcmUtbWFwcGVkIHRvXG5cdCAqIHRoZSBuZXcgaG9zdCB0dXJuIGlkIHNvIHRoZSBzdGVlcmluZyByZXNwb25zZSBsYW5kcyB0aGVyZS5cblx0ICovXG5cdHByaXZhdGUgX2JlZ2luU3RlZXJpbmdUdXJuKHNlc3Npb246IElDb2RleFNlc3Npb24sIHN0ZWVyaW5nOiBQZW5kaW5nTWVzc2FnZSk6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdID0gW107XG5cdFx0Y29uc3QgYXBwVHVybklkID0gc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkO1xuXHRcdGNvbnN0IHByZXZpb3VzSG9zdFR1cm5JZCA9IHNlc3Npb24uY3VycmVudFR1cm5JZCA/PyAoYXBwVHVybklkID8gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBhcHBUdXJuSWQpIDogdW5kZWZpbmVkKTtcblx0XHRhY3Rpb25zLnB1c2goLi4uZmluYWxpemVDb2RleFR1cm5NYXBTdGF0ZShzZXNzaW9uLm1hcFN0YXRlLCAnVHVybiB3YXMgc3VwZXJzZWRlZCBieSBhIHN0ZWVyaW5nIG1lc3NhZ2UgYmVmb3JlIHRoZSB0b29sIHJlcG9ydGVkIGNvbXBsZXRpb24nKSk7XG5cdFx0aWYgKHByZXZpb3VzSG9zdFR1cm5JZCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6IHByZXZpb3VzSG9zdFR1cm5JZCwgZHVyYXRpb246IHRoaXMuX2NsZWFyVHVyblN0b3BXYXRjaChzZXNzaW9uKSB9KTtcblx0XHR9XG5cdFx0Y29uc3QgbmV3SG9zdFR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGlmIChhcHBUdXJuSWQpIHtcblx0XHRcdHNlc3Npb24uaG9zdFR1cm5JZEJ5QXBwVHVybklkLnNldChhcHBUdXJuSWQsIG5ld0hvc3RUdXJuSWQpO1xuXHRcdH1cblx0XHRzZXNzaW9uLmN1cnJlbnRUdXJuSWQgPSBuZXdIb3N0VHVybklkO1xuXHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogbmV3SG9zdFR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogc3RlZXJpbmcubWVzc2FnZSxcblx0XHRcdHF1ZXVlZE1lc3NhZ2VJZDogc3RlZXJpbmcuaWQsXG5cdFx0fSk7XG5cdFx0dGhpcy5fc3RhcnRUdXJuU3RvcFdhdGNoKHNlc3Npb24pO1xuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFyIGFueSBzdGVlcmluZyBtZXNzYWdlcyBzdGlsbCBidWZmZXJlZCAobmV2ZXIgZWNob2VkIGJ5IGNvZGV4KVxuXHQgKiBhbmQgZmlyZSBgc3RlZXJpbmdfY29uc3VtZWRgIGZvciBlYWNoIHNvIHRoZSBjaGF0IFVJIHJlbW92ZXMgdGhlXG5cdCAqIGxpbmdlcmluZyBwZW5kaW5nIGJ1YmJsZS4gQ2FsbGVkIG9uIHR1cm4gY29tcGxldGlvbiwgYWJvcnQsIGRpc3Bvc2UsXG5cdCAqIGFuZCBjb25uZWN0aW9uIGxvc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9kcmFpblBlbmRpbmdTdGVlcmluZyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogdm9pZCB7XG5cdFx0aWYgKHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpZHMgPSBbLi4uc2Vzc2lvbi5wZW5kaW5nU3RlZXJpbmdGbGlwcy5rZXlzKCldO1xuXHRcdHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGlkcykge1xuXHRcdFx0dGhpcy5fZmlyZVN0ZWVyaW5nQ29uc3VtZWQoc2Vzc2lvbiwgaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpcmVTdGVlcmluZ0NvbnN1bWVkKHNlc3Npb246IElDb2RleFNlc3Npb24sIGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHsga2luZDogJ3N0ZWVyaW5nX2NvbnN1bWVkJywgY2hhdDogc2Vzc2lvbi5jaGF0Q2hhbm5lbCEsIGlkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJJZ25vcmVkTm90aWZpY2F0aW9ucyhjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGlnbm9yZWQgPSBbXG5cdFx0XHQndGhyZWFkL3N0YXJ0ZWQnLCAvLyB0aHJlYWQvc3RhcnQgcmVzcG9uc2UgaXMgYXV0aG9yaXRhdGl2ZSBmb3Igc2Vzc2lvbiBtYXRlcmlhbGl6YXRpb24uXG5cdFx0XHQndGhyZWFkL3N0YXR1cy9jaGFuZ2VkJywgLy8gQ29kZXggdGhyZWFkIHN0YXR1cyBpcyBub3Qgc3VyZmFjZWQgaW4gQWdlbnQgSG9zdCBzdGF0ZSB5ZXQuXG5cdFx0XHQndGhyZWFkL3NldHRpbmdzL3VwZGF0ZWQnLCAvLyBWUyBDb2RlIG93bnMgc2Vzc2lvbiBjb25maWc7IENvZGV4IHNldHRpbmdzIGVjaG9lcyBhcmUgbm90IGNvbnN1bWVkIHlldC5cblx0XHRcdCd0aHJlYWQvZ29hbC91cGRhdGVkJywgLy8gR29hbHMgYXJlIG5vdCBzdXJmYWNlZCBpbiB0aGUgQWdlbnQgSG9zdCBVSSB5ZXQuXG5cdFx0XHQndGhyZWFkL2dvYWwvY2xlYXJlZCcsIC8vIEdvYWxzIGFyZSBub3Qgc3VyZmFjZWQgaW4gdGhlIEFnZW50IEhvc3QgVUkgeWV0LlxuXHRcdFx0J3RocmVhZC9jb21wYWN0ZWQnLCAvLyBEZXByZWNhdGVkIGNvbXBsZXRpb24gZWNobzsgdGhlIGNvbnRleHRDb21wYWN0aW9uIGl0ZW0gb3ducyBVSSBwcm9ncmVzcy5cblx0XHRcdCdyZW1vdGVDb250cm9sL3N0YXR1cy9jaGFuZ2VkJywgLy8gUmVtb3RlLWNvbnRyb2wgc3RhdGUgaXMgbm90IHBhcnQgb2YgdGhlIFZTIENvZGUgaW50ZWdyYXRpb24uXG5cdFx0XHQnc2VydmVyUmVxdWVzdC9yZXNvbHZlZCcsIC8vIFdlIHJlc29sdmUgcmVxdWVzdHMgdGhyb3VnaCBKU09OLVJQQyByZXNwb25zZXMsIHNvIHRoaXMgZWNobyBpcyBpbmZvcm1hdGlvbmFsLlxuXHRcdFx0J2l0ZW0vYXV0b0FwcHJvdmFsUmV2aWV3L3N0YXJ0ZWQnLCAvLyBJbmZvcm1hdGlvbmFsOyB0aGUgY29tcGxldGVkIG5vdGlmaWNhdGlvbiBkcml2ZXMgdGhlIGRlbmllZC1hY3Rpb24gY2FyZC5cblx0XHRdIGFzIGNvbnN0O1xuXHRcdGZvciAoY29uc3QgbWV0aG9kIG9mIGlnbm9yZWQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNsaWVudC5vbk5vdGlmaWNhdGlvbihtZXRob2QsICgpID0+IHsgLyogaW50ZW50aW9uYWxseSBpZ25vcmVkICovIH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoQWNjb3VudChjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudCwgcHVibGlzaCA9IHRydWUpOiBQcm9taXNlPElDb2RleEFjY291bnRTdGF0ZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5yZXF1ZXN0PCdhY2NvdW50L3JlYWQnLCBHZXRBY2NvdW50UmVzcG9uc2U+KCdhY2NvdW50L3JlYWQnLCB7IHJlZnJlc2hUb2tlbjogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGNvZGV4QWNjb3VudFN0YXRlRnJvbVJlc3BvbnNlKHJlc3BvbnNlKTtcblx0XHRcdHRoaXMuX3NldE9wZW5BSUFjY291bnRTdGF0ZShzdGF0ZSwgcHVibGlzaCk7XG5cdFx0XHRpZiAocHVibGlzaCAmJiBzdGF0ZS5zdGF0dXMgPT09ICdzaWduZWRJbicgJiYgc3RhdGUuYXV0aFR5cGUgPT09ICdjaGF0Z3B0Jykge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hBY2NvdW50UmF0ZUxpbWl0cyhjbGllbnQsIHN0YXRlLmVtYWlsKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBhY2NvdW50L3JlYWQgYWNjb3VudFR5cGU9JHtyZXNwb25zZS5hY2NvdW50Py50eXBlID8/ICdub25lJ30gcmVxdWlyZXNPcGVuYWlBdXRoPSR7cmVzcG9uc2UucmVxdWlyZXNPcGVuYWlBdXRofSR7c3RhdGUucGxhblR5cGUgPyBgIHBsYW5UeXBlPSR7c3RhdGUucGxhblR5cGV9YCA6ICcnfWApO1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBhY2NvdW50L3JlYWQgZmFpbGVkOiAke21lc3NhZ2V9YCk7XG5cdFx0XHRjb25zdCBzdGF0ZTogSUNvZGV4QWNjb3VudFN0YXRlID0geyB1c2FnZVNvdXJjZTogJ29wZW5haScsIHN0YXR1czogJ2Vycm9yJywgZXJyb3I6IG1lc3NhZ2UgfTtcblx0XHRcdHRoaXMuX3NldE9wZW5BSUFjY291bnRTdGF0ZShzdGF0ZSwgcHVibGlzaCk7XG5cdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaEFjY291bnRSYXRlTGltaXRzKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50LCBhY2NvdW50RW1haWwgPSB0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUuZW1haWwpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucmVxdWVzdDwnYWNjb3VudC9yYXRlTGltaXRzL3JlYWQnLCBHZXRBY2NvdW50UmF0ZUxpbWl0c1Jlc3BvbnNlPignYWNjb3VudC9yYXRlTGltaXRzL3JlYWQnLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCAhPT0gJ3JlYWR5JyB8fCB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCAhPT0gY2xpZW50IHx8IHRoaXMuX29wZW5BSUFjY291bnRTdGF0ZS5zdGF0dXMgIT09ICdzaWduZWRJbicgfHwgdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLmF1dGhUeXBlICE9PSAnY2hhdGdwdCcgfHwgdGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLmVtYWlsICE9PSBhY2NvdW50RW1haWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3BlbkFJQWNjb3VudFJhdGVMaW1pdCA9IGNvZGV4QWNjb3VudFJhdGVMaW1pdEZyb21SZXNwb25zZShyZXNwb25zZSk7XG5cdFx0XHR0aGlzLl9wdWJsaXNoQWNjb3VudEluZm8odGhpcy5fdG9BY2NvdW50SW5mbyh0aGlzLl9vcGVuQUlBY2NvdW50U3RhdGUpKTtcblx0XHRcdHZvaWQgdGhpcy5fcXVldWVNb2RlbFJlZnJlc2goKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIGFjY291bnQvcmF0ZUxpbWl0cy9yZWFkIGZhaWxlZDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFByb3ZpZGVyQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGNvbm5lY3Rpb24uY2xpZW50LnJlcXVlc3Q8J2NvbmZpZy9yZWFkJywgQ29uZmlnUmVhZFJlc3BvbnNlPignY29uZmlnL3JlYWQnLCB7IGluY2x1ZGVMYXllcnM6IHRydWUgfSk7XG5cdFx0Y29uc3QgdXNlckxheWVyID0gcmVzcG9uc2UubGF5ZXJzPy5maW5kKGxheWVyID0+IGxheWVyLm5hbWUudHlwZSA9PT0gJ3VzZXInICYmIGxheWVyLm5hbWUucHJvZmlsZSA9PT0gbnVsbCkgPz8gcmVzcG9uc2UubGF5ZXJzPy5maW5kKGxheWVyID0+IGxheWVyLm5hbWUudHlwZSA9PT0gJ3VzZXInKTtcblx0XHRjb25zdCBjb25maWcgPSB1c2VyTGF5ZXI/LmNvbmZpZyAmJiB0eXBlb2YgdXNlckxheWVyLmNvbmZpZyA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodXNlckxheWVyLmNvbmZpZykgPyB1c2VyTGF5ZXIuY29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDoge307XG5cdFx0cmV0dXJuIHtcblx0XHRcdCdjb2RleC5wZXJtaXNzaW9uc1ByZXNldCc6IGluZmVyQ29kZXhQZXJtaXNzaW9uc1ByZXNldChcblx0XHRcdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdhcHByb3ZhbF9wb2xpY3knKSxcblx0XHRcdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdzYW5kYm94X21vZGUnKSxcblx0XHRcdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWcsICdhcHByb3ZhbHNfcmV2aWV3ZXInKSxcblx0XHRcdCksXG5cdFx0XHQnY29kZXgucGVyc29uYWxpdHknOiB0aGlzLl9yZWFkQ29uZmlndXJhdGlvblZhbHVlKGNvbmZpZywgJ3BlcnNvbmFsaXR5JykgPz8gJ2RlZmF1bHQnLFxuXHRcdFx0J2NvZGV4LmF1dG9SZXZpZXdQb2xpY3knOiB0aGlzLl9yZWFkQ29uZmlndXJhdGlvblZhbHVlKGNvbmZpZywgJ2F1dG9fcmV2aWV3LnBvbGljeScpID8/ICcnLFxuXHRcdFx0W0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldOiBwcmVmZXJDb2RleE1vZGVsc0NvbmZpZyhcblx0XHRcdFx0dGhpcy5fcmVhZEZvcmdlTW9kZWxzRmlsZSgpLFxuXHRcdFx0XHR0aGlzLl9yZWFkTW9kZWxzQ29uZmlndXJhdGlvbihjb25maWcpLFxuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290Q29uZmlnVmFsdWVzPy4oKT8uW0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldLFxuXHRcdFx0KSA/PyB0aGlzLl9yZWFkTW9kZWxzQ29uZmlndXJhdGlvbihjb25maWcpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9mb3JnZU1vZGVsc0ZpbGVQYXRoKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGpvaW4odGhpcy5fY29kZXhIb21lLCBGT1JHRV9NT0RFTFNfRklMRV9OQU1FKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRGb3JnZU1vZGVsc0ZpbGUoKTogSUNvZGV4TW9kZWxzQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3ID0gZnMucmVhZEZpbGVTeW5jKHRoaXMuX2ZvcmdlTW9kZWxzRmlsZVBhdGgoKSwgJ3V0ZjgnKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKEpTT04ucGFyc2UocmF3KSk7XG5cdFx0XHRyZXR1cm4gaXNFbXB0eUNvZGV4TW9kZWxzQ29uZmlnKHBhcnNlZCkgPyB1bmRlZmluZWQgOiBwYXJzZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlRm9yZ2VNb2RlbHNGaWxlKGNvbmZpZzogSUNvZGV4TW9kZWxzQ29uZmlnKTogdm9pZCB7XG5cdFx0ZnMubWtkaXJTeW5jKHRoaXMuX2NvZGV4SG9tZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0ZnMud3JpdGVGaWxlU3luYyh0aGlzLl9mb3JnZU1vZGVsc0ZpbGVQYXRoKCksIGAke0pTT04uc3RyaW5naWZ5KGNvbmZpZywgbnVsbCwgMil9XFxuYCwgJ3V0ZjgnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gd3JvdGUgJHt0aGlzLl9mb3JnZU1vZGVsc0ZpbGVQYXRoKCl9IHByb3ZpZGVycz0ke2NvbmZpZy5wcm92aWRlcnMubGVuZ3RofWApO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZE1vZGVsc0NvbmZpZ3VyYXRpb24oY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElDb2RleE1vZGVsc0NvbmZpZyB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9yZWFkQ29uZmlndXJhdGlvblZhbHVlKGNvbmZpZywgJ21vZGVsJyk7XG5cdFx0Y29uc3QgbW9kZWxQcm92aWRlciA9IHRoaXMuX3JlYWRDb25maWd1cmF0aW9uVmFsdWUoY29uZmlnLCAnbW9kZWxfcHJvdmlkZXInKTtcblx0XHRjb25zdCByYXdQcm92aWRlcnMgPSB0aGlzLl9yZWFkQ29uZmlndXJhdGlvblZhbHVlKGNvbmZpZywgJ21vZGVsX3Byb3ZpZGVycycpO1xuXHRcdGNvbnN0IHByb3ZpZGVyczogSUNvZGV4TW9kZWxQcm92aWRlckVudHJ5W10gPSBbXTtcblx0XHRpZiAocmF3UHJvdmlkZXJzICYmIHR5cGVvZiByYXdQcm92aWRlcnMgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHJhd1Byb3ZpZGVycykpIHtcblx0XHRcdGZvciAoY29uc3QgW2lkLCByYXddIG9mIE9iamVjdC5lbnRyaWVzKHJhd1Byb3ZpZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdFx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRcdGNvbnN0IGVudktleSA9IHR5cGVvZiBlbnRyeS5lbnZfa2V5ID09PSAnc3RyaW5nJyA/IGVudHJ5LmVudl9rZXkgOiAnJztcblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZElkID0gaWQudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0aWYgKG5vcm1hbGl6ZWRJZCA9PT0gJ3ZzY29kZS1wcm94eScpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBraW5kID0gbm9ybWFsaXplZElkLmluY2x1ZGVzKCdvbGxhbWEnKSB8fCBlbnRyeS5iYXNlX3VybCA9PT0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MTE0MzQvdjEnXG5cdFx0XHRcdFx0PyAnb2xsYW1hJ1xuXHRcdFx0XHRcdDogbm9ybWFsaXplZElkLmluY2x1ZGVzKCdsbXN0dWRpbycpIHx8IGVudHJ5LmJhc2VfdXJsID09PSAnaHR0cDovL2xvY2FsaG9zdDoxMjM0L3YxJ1xuXHRcdFx0XHRcdFx0PyAnbG1zdHVkaW8nXG5cdFx0XHRcdFx0XHQ6ICdyZXNwb25zZXMnO1xuXHRcdFx0XHRwcm92aWRlcnMucHVzaCh7XG5cdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0Y2F0YWxvZ0lkOiBraW5kID09PSAnb2xsYW1hJyA/ICdvbGxhbWEnIDoga2luZCA9PT0gJ2xtc3R1ZGlvJyA/ICdsbXN0dWRpbycgOiAnb3BlbmFpJyxcblx0XHRcdFx0XHRuYW1lOiB0eXBlb2YgZW50cnkubmFtZSA9PT0gJ3N0cmluZycgPyBlbnRyeS5uYW1lIDogaWQsXG5cdFx0XHRcdFx0YmFzZVVybDogdHlwZW9mIGVudHJ5LmJhc2VfdXJsID09PSAnc3RyaW5nJyA/IGVudHJ5LmJhc2VfdXJsIDogJycsXG5cdFx0XHRcdFx0ZW52S2V5LFxuXHRcdFx0XHRcdGtpbmQsXG5cdFx0XHRcdFx0YXV0aE1vZGU6IGlzQ29kZXhQcm92aWRlclN0b3JlZEFwaUtleUVudihlbnZLZXkpID8gJ3N0b3JlZCcgOiBlbnZLZXkgPT09ICcnID8gJ25vbmUnIDogJ2Vudmlyb25tZW50Jyxcblx0XHRcdFx0XHR3aXJlQXBpOiAncmVzcG9uc2VzJyxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdG1vZGVsczogW10sXG5cdFx0XHRcdFx0c2VsZWN0ZWRNb2RlbDogdHlwZW9mIG1vZGVsID09PSAnc3RyaW5nJyAmJiAodHlwZW9mIG1vZGVsUHJvdmlkZXIgPT09ICdzdHJpbmcnID8gbW9kZWxQcm92aWRlciA6ICcnKSA9PT0gaWQgPyBtb2RlbCA6ICcnLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKHtcblx0XHRcdG1vZGVsOiB0eXBlb2YgbW9kZWwgPT09ICdzdHJpbmcnID8gbW9kZWwgOiAnJyxcblx0XHRcdG1vZGVsUHJvdmlkZXI6IHR5cGVvZiBtb2RlbFByb3ZpZGVyID09PSAnc3RyaW5nJyA/IG1vZGVsUHJvdmlkZXIgOiAnJyxcblx0XHRcdHByb3ZpZGVycyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlUHJvdmlkZXJDb25maWd1cmF0aW9uKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChrZXkgPT09IENPREVYX01PREVMU19ST09UX0NPTkZJR19LRVkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlTW9kZWxzQ29uZmlndXJhdGlvbih2YWx1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0bGV0IGVkaXRzOiBDb25maWdFZGl0W107XG5cdFx0aWYgKGtleSA9PT0gJ2NvZGV4LnBlcm1pc3Npb25zUHJlc2V0Jykge1xuXHRcdFx0Y29uc3QgcHJlc2V0ID0gbmFycm93Q29kZXhQZXJtaXNzaW9uc1ByZXNldCh2YWx1ZSkgPz8gQ09ERVhfREVGQVVMVF9QRVJNSVNTSU9OU19QUkVTRVQ7XG5cdFx0XHRjb25zdCBheGVzID0gcmVzb2x2ZUNvZGV4UGVybWlzc2lvbnNQcmVzZXQocHJlc2V0KTtcblx0XHRcdGVkaXRzID0gW1xuXHRcdFx0XHR7IGtleVBhdGg6ICdhcHByb3ZhbF9wb2xpY3knLCB2YWx1ZTogYXhlcy5hcHByb3ZhbFBvbGljeSwgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH0sXG5cdFx0XHRcdHsga2V5UGF0aDogJ3NhbmRib3hfbW9kZScsIHZhbHVlOiBheGVzLnNhbmRib3hNb2RlLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSxcblx0XHRcdFx0eyBrZXlQYXRoOiAnYXBwcm92YWxzX3Jldmlld2VyJywgdmFsdWU6IGF4ZXMuYXBwcm92YWxzUmV2aWV3ZXIsIG1lcmdlU3RyYXRlZ3k6ICdyZXBsYWNlJyB9LFxuXHRcdFx0XHR7IGtleVBhdGg6ICdzYW5kYm94X3dvcmtzcGFjZV93cml0ZS5uZXR3b3JrX2FjY2VzcycsIHZhbHVlOiB0cnVlLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSxcblx0XHRcdF07XG5cdFx0XHRpZiAocHJlc2V0ID09PSAnZnVsbC1hY2Nlc3MnKSB7XG5cdFx0XHRcdC8vIENvZGV4IERlc2t0b3AgbWlncmF0ZXMgYFt3aW5kb3dzXSBzYW5kYm94ID0gXCJ1bmVsZXZhdGVkXCJgLCB3aGljaCBrZWVwc1xuXHRcdFx0XHQvLyBSZXN0cmljdGVkVG9rZW4gd3JhcHBpbmcgZXZlbiBhZnRlciB0aGUgVUkgc2VsZWN0cyBGdWxsIEFjY2Vzcy5cblx0XHRcdFx0ZWRpdHMucHVzaCh7IGtleVBhdGg6ICd3aW5kb3dzLnNhbmRib3gnLCB2YWx1ZTogbnVsbCwgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoa2V5ID09PSAnY29kZXguYXV0b1Jldmlld1BvbGljeScgJiYgdmFsdWUgPT09ICcnKSB7XG5cdFx0XHRlZGl0cyA9IFt7IGtleVBhdGg6ICdhdXRvX3JldmlldycsIHZhbHVlOiBudWxsLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfV07XG5cdFx0fSBlbHNlIGlmIChrZXkgPT09ICdjb2RleC5wZXJzb25hbGl0eScgJiYgdmFsdWUgPT09ICdkZWZhdWx0Jykge1xuXHRcdFx0ZWRpdHMgPSBbeyBrZXlQYXRoOiAncGVyc29uYWxpdHknLCB2YWx1ZTogbnVsbCwgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH1dO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0cyA9IFt7IGtleVBhdGg6IGtleSA9PT0gJ2NvZGV4LnBlcnNvbmFsaXR5JyA/ICdwZXJzb25hbGl0eScgOiAnYXV0b19yZXZpZXcucG9saWN5JywgdmFsdWU6IHZhbHVlIGFzIHN0cmluZywgbWVyZ2VTdHJhdGVneTogJ3JlcGxhY2UnIH1dO1xuXHRcdH1cblx0XHRhd2FpdCBjb25uZWN0aW9uLmNsaWVudC5yZXF1ZXN0PCdjb25maWcvYmF0Y2hXcml0ZScsIENvbmZpZ1dyaXRlUmVzcG9uc2U+KCdjb25maWcvYmF0Y2hXcml0ZScsIHtcblx0XHRcdGVkaXRzLFxuXHRcdFx0ZXhwZWN0ZWRWZXJzaW9uOiBudWxsLFxuXHRcdFx0cmVsb2FkVXNlckNvbmZpZzogdHJ1ZSxcblx0XHR9KTtcblx0XHRpZiAoa2V5ID09PSAnY29kZXgucGVybWlzc2lvbnNQcmVzZXQnKSB7XG5cdFx0XHRjb25zdCBwcmVzZXQgPSBuYXJyb3dDb2RleFBlcm1pc3Npb25zUHJlc2V0KHZhbHVlKSA/PyBDT0RFWF9ERUZBVUxUX1BFUk1JU1NJT05TX1BSRVNFVDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSB3cm90ZSBwZXJtaXNzaW9ucyBwcmVzZXQ9JHtwcmVzZXR9IHRvIGNvbmZpZy50b21sYCk7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSwge1xuXHRcdFx0XHRcdFtDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXRdOiBwcmVzZXQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCAhPT0gdW5kZWZpbmVkICYmICFzZXNzaW9uLmZpcnN0VHVyblNlbnQgJiYgIXNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX3Jlc3RhcnRUaHJlYWRXaXRoQ3VycmVudFRvb2xzKHNlc3Npb24pLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBmYWlsZWQgdG8gcmVtYXRlcmlhbGl6ZSBzZXNzaW9uPSR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9IGFmdGVyIHBlcm1pc3Npb25zIGNoYW5nZTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93cml0ZU1vZGVsc0NvbmZpZ3VyYXRpb24odmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXh0ID0gd2l0aERlZmF1bHRDb2RleFJvdXRpbmcobm9ybWFsaXplQ29kZXhNb2RlbHNDb25maWcodmFsdWUpKTtcblx0XHR0aGlzLl93cml0ZUZvcmdlTW9kZWxzRmlsZShuZXh0KTtcblx0XHR2b2lkIHRoaXMuX3F1ZXVlTW9kZWxSZWZyZXNoKCk7XG5cdFx0bGV0IGNvbm5lY3Rpb246IElDb25uZWN0aW9uUmVhZHk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSB3cm90ZSAke0ZPUkdFX01PREVMU19GSUxFX05BTUV9OyBjb25maWcudG9tbCBzeW5jIGRlZmVycmVkOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlvdXMgPSBub3JtYWxpemVDb2RleE1vZGVsc0NvbmZpZyh0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV0pO1xuXHRcdGNvbnN0IGVkaXRzOiBDb25maWdFZGl0W10gPSBbXTtcblxuXHRcdGlmIChuZXh0Lm1vZGVsICE9PSBwcmV2aW91cy5tb2RlbCkge1xuXHRcdFx0ZWRpdHMucHVzaCh7IGtleVBhdGg6ICdtb2RlbCcsIHZhbHVlOiBuZXh0Lm1vZGVsID09PSAnJyA/IG51bGwgOiBuZXh0Lm1vZGVsLCBtZXJnZVN0cmF0ZWd5OiAncmVwbGFjZScgfSk7XG5cdFx0fVxuXHRcdGlmIChuZXh0Lm1vZGVsUHJvdmlkZXIgIT09IHByZXZpb3VzLm1vZGVsUHJvdmlkZXIpIHtcblx0XHRcdGVkaXRzLnB1c2goeyBrZXlQYXRoOiAnbW9kZWxfcHJvdmlkZXInLCB2YWx1ZTogbmV4dC5tb2RlbFByb3ZpZGVyID09PSAnJyA/IG51bGwgOiBuZXh0Lm1vZGVsUHJvdmlkZXIsIG1lcmdlU3RyYXRlZ3k6ICdyZXBsYWNlJyB9KTtcblx0XHR9XG5cblxuXHRcdC8vIFVwZGF0ZSBvbmx5IHRoZSBmaWVsZHMgbWFuYWdlZCBieSBGb3JnZS4gV3JpdGluZyBlYWNoIGxlYWYgcHJlc2VydmVzXG5cdFx0Ly8gYWR2YW5jZWQgcHJvdmlkZXIgb3B0aW9ucyBjb25maWd1cmVkIGRpcmVjdGx5IGluIGNvbmZpZy50b21sLlxuXHRcdGVkaXRzLnB1c2goLi4uY29kZXhNYW5hZ2VkTW9kZWxQcm92aWRlckVkaXRzKHByZXZpb3VzLCBuZXh0KSk7XG5cblx0XHRpZiAoZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGNvbm5lY3Rpb24uY2xpZW50LnJlcXVlc3Q8J2NvbmZpZy9iYXRjaFdyaXRlJywgQ29uZmlnV3JpdGVSZXNwb25zZT4oJ2NvbmZpZy9iYXRjaFdyaXRlJywge1xuXHRcdFx0ZWRpdHMsXG5cdFx0XHRleHBlY3RlZFZlcnNpb246IG51bGwsXG5cdFx0XHRyZWxvYWRVc2VyQ29uZmlnOiB0cnVlLFxuXHRcdH0pO1xuXHRcdC8vIG1vZGVsL2xpc3Qgb3ducyBhIHByb2Nlc3MtbGV2ZWwgbW9kZWwgbWFuYWdlciwgc28gYSBjb25maWcgcmVsb2FkIGlzXG5cdFx0Ly8gaW5zdWZmaWNpZW50IHdoZW4gdGhlIHByb3ZpZGVyIGNoYW5nZXMuXG5cdFx0dGhpcy5fZGlzcG9zZUNvbm5lY3Rpb24oKTtcblx0XHR2b2lkIHRoaXMuX3F1ZXVlTW9kZWxSZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oeWRyYXRlRm9yZ2VNb2RlbHNGcm9tRGlzaygpOiB2b2lkIHtcblx0XHRjb25zdCBmaWxlTW9kZWxzID0gdGhpcy5fcmVhZEZvcmdlTW9kZWxzRmlsZSgpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290Q29uZmlnVmFsdWVzPy4oKT8uW0NPREVYX01PREVMU19ST09UX0NPTkZJR19LRVldO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcHJlZmVyQ29kZXhNb2RlbHNDb25maWcoZmlsZU1vZGVscywgY3VycmVudCk7XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXMgPSB7XG5cdFx0XHQuLi50aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXMsXG5cdFx0XHRbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV06IHJlc29sdmVkLFxuXHRcdH07XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXTogcmVzb2x2ZWQgfSk7XG5cdFx0dGhpcy5fZm9yZ2VNb2RlbHNSZWFkeSA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0Rm9yZ2VNb2RlbHNGcm9tUm9vdENvbmZpZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2ZvcmdlTW9kZWxzUmVhZHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKCk/LltDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXTtcblx0XHRpZiAobW9kZWxzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IHdpdGhEZWZhdWx0Q29kZXhSb3V0aW5nKG5vcm1hbGl6ZUNvZGV4TW9kZWxzQ29uZmlnKG1vZGVscykpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcmVhZEZvcmdlTW9kZWxzRmlsZSgpO1xuXHRcdGlmIChleGlzdGluZyAmJiBKU09OLnN0cmluZ2lmeShleGlzdGluZykgPT09IEpTT04uc3RyaW5naWZ5KG5leHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl93cml0ZUZvcmdlTW9kZWxzRmlsZShuZXh0KTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvblZhbHVlcyA9IHtcblx0XHRcdFx0Li4udGhpcy5fcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzLFxuXHRcdFx0XHRbQ09ERVhfTU9ERUxTX1JPT1RfQ09ORklHX0tFWV06IG5leHQsXG5cdFx0XHR9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXhdIEZhaWxlZCB0byB3cml0ZSAke0ZPUkdFX01PREVMU19GSUxFX05BTUV9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoUHJvdmlkZXJDb25maWd1cmF0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWZyZXNoID8/PSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ2lkbGUnICYmICEoYXdhaXQgdGhpcy5faXNTZGtSZXNvbHZhYmxlV2l0aG91dERvd25sb2FkKCkpKSB7XG5cdFx0XHRcdFx0dGhpcy5faHlkcmF0ZUZvcmdlTW9kZWxzRnJvbURpc2soKTtcblx0XHRcdFx0XHR0aGlzLl9mb3JnZU1vZGVsc1JlYWR5ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzID0gYXdhaXQgdGhpcy5fcmVhZFByb3ZpZGVyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWFkeSA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2ZvcmdlTW9kZWxzUmVhZHkgPSB0cnVlO1xuXHRcdFx0XHRpZiAoIXRoaXMuX3BlbmRpbmdQcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcodGhpcy5fcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIEZhaWxlZCB0byByZWFkIGNvbmZpZy50b21sOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0dGhpcy5faHlkcmF0ZUZvcmdlTW9kZWxzRnJvbURpc2soKTtcblx0XHRcdFx0dGhpcy5fZm9yZ2VNb2RlbHNSZWFkeSA9IHRydWU7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWZyZXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlICYmIHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvblJlYWR5KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fcXVldWVQcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3BlbmRpbmdQcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSAmJiB0aGlzLl9mb3JnZU1vZGVsc1JlYWR5KSB7XG5cdFx0XHRcdFx0Ly8gV2l0aCBubyBTREsgeWV0LCBvbmx5IHRoZSBGb3JnZS1vd25lZCBtb2RlbHMgZmlsZSBpcyB3cml0YWJsZS5cblx0XHRcdFx0XHQvLyBSZS1lbnRlcmluZyBfcXVldWVQcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSBoZXJlIHdvdWxkIGltbWVkaWF0ZWx5XG5cdFx0XHRcdFx0Ly8gc3RhcnQgYW5vdGhlciBwcm92aWRlciByZWZyZXNoIGFuZCBjcmVhdGUgYSBob3QgbWljcm90YXNrIGxvb3AuXG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0dGhpcy5fcGVyc2lzdEZvcmdlTW9kZWxzRnJvbVJvb3RDb25maWcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZVByb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RGb3JnZU1vZGVsc0Zyb21Sb290Q29uZmlnKCk7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25SZWFkeSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlID0gdHJ1ZTtcblx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaFByb3ZpZGVyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290Q29uZmlnVmFsdWVzPy4oKSA/PyB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBbJ2NvZGV4LnBlcm1pc3Npb25zUHJlc2V0JywgJ2NvZGV4LnBlcnNvbmFsaXR5JywgJ2NvZGV4LmF1dG9SZXZpZXdQb2xpY3knLCBDT0RFWF9NT0RFTFNfUk9PVF9DT05GSUdfS0VZXSkge1xuXHRcdFx0aWYgKHZhbHVlc1trZXldID09PSB0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNba2V5XSkgeyBjb250aW51ZTsgfVxuXHRcdFx0Y29uc3QgdmFsdWUgPSB2YWx1ZXNba2V5XTtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25Xcml0ZSA9IHRoaXMuX3Byb3ZpZGVyQ29uZmlndXJhdGlvbldyaXRlLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fcHJvdmlkZXJDb25maWd1cmF0aW9uVmFsdWVzW2tleV0gPT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlUHJvdmlkZXJDb25maWd1cmF0aW9uKGtleSwgdmFsdWUpO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckNvbmZpZ3VyYXRpb25WYWx1ZXNba2V5XSA9IHZhbHVlO1xuXHRcdFx0fSkuY2F0Y2goZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvZGV4XSBGYWlsZWQgdG8gdXBkYXRlIGNvbmZpZy50b21sOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZENvbmZpZ3VyYXRpb25WYWx1ZShjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBrZXlQYXRoOiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHRsZXQgdmFsdWU6IHVua25vd24gPSBjb25maWc7XG5cdFx0Zm9yIChjb25zdCBzZWdtZW50IG9mIGtleVBhdGguc3BsaXQoJy4nKSkge1xuXHRcdFx0aWYgKCF2YWx1ZSB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR2YWx1ZSA9ICh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbc2VnbWVudF07XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3BhdGNoQnlUaHJlYWQodGhyZWFkSWQ6IHN0cmluZywgbWFwRm46IChzOiBJQ29kZXhTZXNzaW9uKSA9PiBSZXR1cm5UeXBlPHR5cGVvZiBtYXBUdXJuU3RhcnRlZD4pOiB2b2lkIHtcblx0XHQvLyBDb2xsYWItYWdlbnQgKHN1YmFnZW50KSBjaGlsZCB0aHJlYWRzIGVtaXQgdGhlaXIgb3duIGZ1bGwgZXZlbnRcblx0XHQvLyBzdHJlYW07IHJvdXRlIHRoZW0gdG8gdGhlIGlzb2xhdGVkIHN1YmFnZW50IHNlc3Npb24gYW5kIGZpcmUgZWFjaFxuXHRcdC8vIGFjdGlvbiB0YWdnZWQgd2l0aCB0aGUgcGFyZW50IGBzcGF3bkFnZW50YCB0b29sIGNhbGwgc28gdGhlIHNoYXJlZFxuXHRcdC8vIG9yY2hlc3RyYXRvciBsYW5kcyB0aGVtIGluIHRoZSByZWFkLW9ubHkgY2hpbGQgY29udmVyc2F0aW9uLlxuXHRcdGNvbnN0IHN1YmFnZW50ID0gdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5nZXQodGhyZWFkSWQpO1xuXHRcdGlmIChzdWJhZ2VudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEZuKHN1YmFnZW50LnNlc3Npb24pO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHR0aGlzLl9maXJlU3ViYWdlbnQoc3ViYWdlbnQsIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHQvLyBVc3VhbGx5IGFuIHVuY2xhaW1lZCBwcmV3YXJtOyBpZ25vcmUuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXhdIElnbm9yaW5nIG5vdGlmaWNhdGlvbiBmb3IgdW50cmFja2VkIHRocmVhZElkPSR7dGhyZWFkSWR9OyBsaWtlbHkgdW5jbGFpbWVkIHByZXdhcm1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEZuKHNlc3Npb24pO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBgaXRlbS9jb21wbGV0ZWRgIGRpc3BhdGNoLiBJbiBhZGRpdGlvbiB0byB0aGUgbm9ybWFsIHBlci10aHJlYWQgbWFwcGluZyxcblx0ICogYSBwYXJlbnQgc2Vzc2lvbidzIGNvbXBsZXRlZCBgc3Bhd25BZ2VudGAgY29sbGFiIHRvb2wgY2FsbCBub3cgY2Fycmllc1xuXHQgKiB0aGUgY2hpbGQgYHJlY2VpdmVyVGhyZWFkSWRzYCwgc28gd2UgcmVnaXN0ZXIgZWFjaCBzcGF3bmVkIHN1YmFnZW50IGFuZFxuXHQgKiBlbWl0IGEgYHN1YmFnZW50X3N0YXJ0ZWRgIHNpZ25hbCAoYmVmb3JlIG1hcHBpbmcgdGhlIGNvbXBsZXRpb24sIHNvIHRoZVxuXHQgKiBzaGFyZWQgb3JjaGVzdHJhdG9yIGhhcyBhdHRhY2hlZCB0aGUgc3ViYWdlbnQtY2hhdCBibG9jayB0byB0aGUgcGFyZW50XG5cdCAqIHRvb2wgY2FsbCBieSB0aGUgdGltZSBpdCBjb21wbGV0ZXMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcXVldWVGaWxlRXZlbnQodGhyZWFkSWQ6IHN0cmluZywgdGFzazogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2ZpbGVFdmVudERpc3BhdGNoZXMuZ2V0KHRocmVhZElkKSA/PyBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBuZXh0ID0gcHJldmlvdXMudGhlbih0YXNrLCB0YXNrKS5jYXRjaChlcnJvciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ29kZXhdIEZpbGUgZXZlbnQgZGlzcGF0Y2ggZmFpbGVkIGZvciB0aHJlYWRJZD0ke3RocmVhZElkfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZmlsZUV2ZW50RGlzcGF0Y2hlcy5nZXQodGhyZWFkSWQpID09PSBuZXh0KSB7XG5cdFx0XHRcdHRoaXMuX2ZpbGVFdmVudERpc3BhdGNoZXMuZGVsZXRlKHRocmVhZElkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9maWxlRXZlbnREaXNwYXRjaGVzLnNldCh0aHJlYWRJZCwgbmV4dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNwYXRjaEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWQocGFyYW1zOiBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkTm90aWZpY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlhZ25vc3RpY3NMb2cgPSBnZXRBY3RpdmVGb3JnZURpYWdub3N0aWNzTG9nKCk7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgcGFyYW1zLmNoYW5nZXMpIHtcblx0XHRcdGRpYWdub3N0aWNzTG9nPy5yZWNvcmRMYXRlc3RUZXh0KCdmaWxlcycsIGBjb2RleC1wYXRjaDoke3BhcmFtcy50aHJlYWRJZH06JHtwYXJhbXMudHVybklkfToke3BhcmFtcy5pdGVtSWR9OiR7Y2hhbmdlLnBhdGh9YCwgJ0ZJTEUuUEFUQ0gnLCBjaGFuZ2UuZGlmZiwgeyB0aHJlYWQ6IHBhcmFtcy50aHJlYWRJZCwgdHVybjogcGFyYW1zLnR1cm5JZCwgaXRlbTogcGFyYW1zLml0ZW1JZCwgcGF0aDogY2hhbmdlLnBhdGgsIGtpbmQ6IGNoYW5nZS5raW5kIH0pO1xuXHRcdH1cblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3ViYWdlbnQ/LnNlc3Npb24gPz8gKHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb2RleF0gSWdub3JpbmcgZmlsZUNoYW5nZS9wYXRjaFVwZGF0ZWQgZm9yIHVudHJhY2tlZCB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH07IGxpa2VseSB1bmNsYWltZWQgcHJld2FybWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtYXBwZWRQYXJhbXMgPSB0aGlzLl93aXRoSG9zdFR1cm5JZChzZXNzaW9uLCBwYXJhbXMpO1xuXHRcdGNvbnN0IHN0YXJ0QWN0aW9ucyA9IG1hcEZpbGVDaGFuZ2VTdGFydGVkKHNlc3Npb24ubWFwU3RhdGUsIG1hcHBlZFBhcmFtcy50dXJuSWQsIG1hcHBlZFBhcmFtcy5pdGVtSWQsIG1hcHBlZFBhcmFtcy5jaGFuZ2VzKTtcblx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtSWQpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gZW50cnlcblx0XHRcdD8gYXdhaXQgdGhpcy5fZmlsZUVkaXRPYnNlcnZlcihzZXNzaW9uKT8uc25hcHNob3QoZW50cnkudHVybklkLCBlbnRyeS50b29sQ2FsbElkLCBwYXJhbXMuaXRlbUlkLCBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnksIHBhcmFtcy5jaGFuZ2VzKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmlsZUVkaXRzID0gc25hcHNob3Q/LmVkaXRzID8/IFtdO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBbLi4uc3RhcnRBY3Rpb25zLCAuLi5tYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHNlc3Npb24ubWFwU3RhdGUsIG1hcHBlZFBhcmFtcywgZmlsZUVkaXRzLCBzbmFwc2hvdD8ucHJldmlld1VuYXZhaWxhYmxlKV07XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0aWYgKHN1YmFnZW50KSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVTdWJhZ2VudChzdWJhZ2VudCwgYWN0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCBhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoVHVybkRpZmZVcGRhdGVkKHBhcmFtczogVHVybkRpZmZVcGRhdGVkTm90aWZpY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Z2V0QWN0aXZlRm9yZ2VEaWFnbm9zdGljc0xvZygpPy5yZWNvcmRMYXRlc3RUZXh0KCdmaWxlcycsIGBjb2RleC10dXJuLWRpZmY6JHtwYXJhbXMudGhyZWFkSWR9OiR7cGFyYW1zLnR1cm5JZH1gLCAnVU5JRklFRC1ESUZGJywgcGFyYW1zLmRpZmYsIHsgdGhyZWFkOiBwYXJhbXMudGhyZWFkSWQsIHR1cm46IHBhcmFtcy50dXJuSWQgfSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN1YmFnZW50Py5zZXNzaW9uID8/IChzZXNzaW9uSWQgPyB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXhdIElnbm9yaW5nIHR1cm4vZGlmZi91cGRhdGVkIGZvciB1bnRyYWNrZWQgdGhyZWFkSWQ9JHtwYXJhbXMudGhyZWFkSWR9OyBsaWtlbHkgdW5jbGFpbWVkIHByZXdhcm1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHVybklkID0gdGhpcy5faG9zdFR1cm5JZChzZXNzaW9uLCBwYXJhbXMudHVybklkKTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc2Vzc2lvbi5tYXBTdGF0ZS50dXJuRGlmZlRvb2xDYWxsPy50dXJuSWQgPT09IHR1cm5JZFxuXHRcdFx0PyBzZXNzaW9uLm1hcFN0YXRlLnR1cm5EaWZmVG9vbENhbGwudG9vbENhbGxJZFxuXHRcdFx0OiBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBmaWxlRWRpdHMgPSBhd2FpdCB0aGlzLl9maWxlRWRpdE9ic2VydmVyKHNlc3Npb24pPy5zbmFwc2hvdFR1cm5EaWZmKFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKSxcblx0XHRcdHBhcmFtcy5kaWZmLFxuXHRcdCkgPz8gW107XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5EaWZmVXBkYXRlZChzZXNzaW9uLm1hcFN0YXRlLCB0dXJuSWQsIHRvb2xDYWxsSWQsIGZpbGVFZGl0cyk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0aWYgKHN1YmFnZW50KSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVTdWJhZ2VudChzdWJhZ2VudCwgYWN0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCBhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3BhdGNoSXRlbVN0YXJ0ZWQocGFyYW1zOiBJdGVtU3RhcnRlZE5vdGlmaWNhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN1YmFnZW50ID0gdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdWJhZ2VudD8uc2Vzc2lvbiA/PyAoc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvZGV4XSBJZ25vcmluZyBpdGVtL3N0YXJ0ZWQgZm9yIHVudHJhY2tlZCB0aHJlYWRJZD0ke3BhcmFtcy50aHJlYWRJZH07IGxpa2VseSB1bmNsYWltZWQgcHJld2FybWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2NvbW1hbmRFeGVjdXRpb24nKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlRWRpdE9ic2VydmVyKHNlc3Npb24pPy5iZWdpblNoZWxsKFxuXHRcdFx0XHRwYXJhbXMuaXRlbS5pZCxcblx0XHRcdFx0cGFyYW1zLml0ZW0uY29tbWFuZCA/PyAnJyxcblx0XHRcdFx0cGFyYW1zLml0ZW0uY3dkIHx8IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoLFxuXHRcdFx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbiksXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5faGFuZGxlSXRlbVN0YXJ0ZWQoc2Vzc2lvbiwgcGFyYW1zKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVN1YmFnZW50KHN1YmFnZW50LCBhY3Rpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcGF0Y2hJdGVtQ29tcGxldGVkKHBhcmFtczogSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN1YmFnZW50ID0gdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gc3ViYWdlbnQuc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLml0ZW0uaWQpO1xuXHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gYXdhaXQgdGhpcy5fZmlsZUVkaXRzRm9yQ29tcGxldGVkSXRlbShzdWJhZ2VudC5zZXNzaW9uLCBwYXJhbXMsIGVudHJ5KTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN1YmFnZW50LnNlc3Npb24ubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHN1YmFnZW50LnNlc3Npb24sIHBhcmFtcyksIGZpbGVFZGl0cyk7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVTdWJhZ2VudChzdWJhZ2VudCwgYWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5nZXQocGFyYW1zLnRocmVhZElkKTtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbklkID8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXhdIElnbm9yaW5nIGl0ZW0vY29tcGxldGVkIGZvciB1bnRyYWNrZWQgdGhyZWFkSWQ9JHtwYXJhbXMudGhyZWFkSWR9OyBsaWtlbHkgdW5jbGFpbWVkIHByZXdhcm1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRGV0ZWN0IHN1YmFnZW50IHNwYXducyBCRUZPUkUgbWFwcGluZyB0aGUgY29tcGxldGlvbjogdGhlIGhvc3Rcblx0XHQvLyB0b29sQ2FsbElkIGxpdmVzIGluIHRoZSBwYXJlbnQncyBpdGVtVG9Ub29sQ2FsbCBtYXAgKHdoaWNoIHRoZSBtYXBwZXJcblx0XHQvLyBtYXkgY2xlYXIpLCBhbmQgZmlyaW5nIGBzdWJhZ2VudF9zdGFydGVkYCBmaXJzdCBsZXRzIHRoZSBvcmNoZXN0cmF0b3Jcblx0XHQvLyBhdHRhY2ggdGhlIGNoaWxkLWNvbnZlcnNhdGlvbiBibG9jayB0byB0aGUgc3RpbGwtb3BlbiBwYXJlbnQgdG9vbCBjYWxsLlxuXHRcdHRoaXMuX21heWJlUmVnaXN0ZXJTdWJhZ2VudHMoc2Vzc2lvbiwgcGFyYW1zKTtcblx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtLmlkKTtcblx0XHRjb25zdCBmaWxlRWRpdHMgPSBhd2FpdCB0aGlzLl9maWxlRWRpdHNGb3JDb21wbGV0ZWRJdGVtKHNlc3Npb24sIHBhcmFtcywgZW50cnkpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHNlc3Npb24ubWFwU3RhdGUsIHRoaXMuX3dpdGhIb3N0VHVybklkKHNlc3Npb24sIHBhcmFtcyksIGZpbGVFZGl0cyk7XG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmlsZUVkaXRzRm9yQ29tcGxldGVkSXRlbShcblx0XHRzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLFxuXHRcdHBhcmFtczogSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbixcblx0XHRlbnRyeTogeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZzsgcmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nIH0gfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8cmVhZG9ubHkgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdPiB7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBvYnNlcnZlciA9IHRoaXMuX2ZpbGVFZGl0T2JzZXJ2ZXIoc2Vzc2lvbik7XG5cdFx0aWYgKCFvYnNlcnZlcikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2ZpbGVDaGFuZ2UnKSB7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRFZGl0cyA9IGF3YWl0IG9ic2VydmVyLmNvbXBsZXRlKGVudHJ5LnR1cm5JZCwgZW50cnkudG9vbENhbGxJZCwgcGFyYW1zLml0ZW0uaWQsIHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSwgcGFyYW1zLml0ZW0uY2hhbmdlcywgc2Vzc2lvbi5tb2RlbD8uaWQpO1xuXHRcdFx0cmV0dXJuIHBhcmFtcy5pdGVtLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgPyBjb21wbGV0ZWRFZGl0cyA6IFtdO1xuXHRcdH1cblx0XHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2NvbW1hbmRFeGVjdXRpb24nKSB7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRFZGl0cyA9IGF3YWl0IG9ic2VydmVyLmNvbXBsZXRlU2hlbGwoZW50cnkudHVybklkLCBlbnRyeS50b29sQ2FsbElkLCBwYXJhbXMuaXRlbS5pZCk7XG5cdFx0XHRyZXR1cm4gcGFyYW1zLml0ZW0uc3RhdHVzID09PSAnY29tcGxldGVkJyA/IGNvbXBsZXRlZEVkaXRzIDogW107XG5cdFx0fVxuXHRcdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnZHluYW1pY1Rvb2xDYWxsJyAmJiBwYXJhbXMuaXRlbS50b29sID09PSBDT0RFWF9XUklURV9GSUxFX1RPT0xfTkFNRSkge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IHBhcmFtcy5pdGVtLnN1Y2Nlc3MgPT09IHRydWUgfHwgcGFyYW1zLml0ZW0uc3RhdHVzID09PSAnY29tcGxldGVkJztcblx0XHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0XHRvYnNlcnZlci5hYmFuZG9uRGlyZWN0V3JpdGUocGFyYW1zLml0ZW0uaWQpO1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb2JzZXJ2ZXIuY29tcGxldGVEaXJlY3RXcml0ZShlbnRyeS50dXJuSWQsIGVudHJ5LnRvb2xDYWxsSWQsIHBhcmFtcy5pdGVtLmlkLCBzZXNzaW9uLm1vZGVsPy5pZCk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBgdHVybi9jb21wbGV0ZWRgIGRpc3BhdGNoLiBGb3IgYSBzdWJhZ2VudCBjaGlsZCB0aHJlYWQsIHJvdXRlIHRoZSB0dXJuJ3Ncblx0ICogZmx1c2gvb3JwaGFuIGFjdGlvbnMgdG8gdGhlIGNoaWxkIGNvbnZlcnNhdGlvbiBidXQgc3VwcHJlc3MgaXRzXG5cdCAqIGBDaGF0VHVybkNvbXBsZXRlYCBcdTIwMTQgdGhlIGNoaWxkIGNvbnZlcnNhdGlvbidzIHR1cm4gaXMgY2xvc2VkIGNsZWFubHlcblx0ICogKHdpdGhvdXQgdGhlIHBhcmVudCdzIGNoZWNrcG9pbnQvY2hhbmdlc2V0L3RpdGxlIHNpZGUgZWZmZWN0cykgYnkgdGhlXG5cdCAqIGBzdWJhZ2VudF9jb21wbGV0ZWRgIHNpZ25hbCwgd2hpY2ggYWxzbyB0ZWFycyBkb3duIHRoZSBjaGlsZC10aHJlYWRcblx0ICogdHJhY2tpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNwYXRjaFR1cm5Db21wbGV0ZWQocGFyYW1zOiBUdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGlmIChzdWJhZ2VudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuX2hhbmRsZVR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24oc3ViYWdlbnQuc2Vzc2lvbiwgcGFyYW1zKTtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9maXJlU3ViYWdlbnQoc3ViYWdlbnQsIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmRlbGV0ZShwYXJhbXMudGhyZWFkSWQpO1xuXHRcdFx0dGhpcy5fZmlsZUVkaXRPYnNlcnZlcnMuZGVsZXRlQW5kRGlzcG9zZShwYXJhbXMudGhyZWFkSWQpO1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5maXJlKHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50X2NvbXBsZXRlZCcsXG5cdFx0XHRcdGNoYXQ6IHN1YmFnZW50LnNlc3Npb24uY2hhdENoYW5uZWwhLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzdWJhZ2VudC50b29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc3BhdGNoQnlUaHJlYWQocGFyYW1zLnRocmVhZElkLCBzID0+IHRoaXMuX2hhbmRsZVR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24ocywgcGFyYW1zKSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiBhIHBhcmVudCBzZXNzaW9uJ3MgYHNwYXduQWdlbnRgIGNvbGxhYiB0b29sIGNhbGwgY29tcGxldGVzIGl0XG5cdCAqIGNhcnJpZXMgdGhlIGNoaWxkIHRocmVhZCBpZChzKSBpbiBgcmVjZWl2ZXJUaHJlYWRJZHNgLiBSZWdpc3RlciBhblxuXHQgKiBpc29sYXRlZCBzdWJhZ2VudCBzZXNzaW9uIGZvciBlYWNoIG5ldyBjaGlsZCB0aHJlYWQgYW5kIGVtaXQgYVxuXHQgKiBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIHNvIHRoZSBzaGFyZWQgb3JjaGVzdHJhdG9yIG9wZW5zIHRoZSByZWFkLW9ubHlcblx0ICogY2hpbGQgY29udmVyc2F0aW9uIGFuZCBhdHRhY2hlcyBpdHMgZGlzY292ZXJ5IGJsb2NrIHRvIHRoZSBwYXJlbnQgdG9vbFxuXHQgKiBjYWxsLlxuXHQgKi9cblx0cHJpdmF0ZSBfbWF5YmVSZWdpc3RlclN1YmFnZW50cyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBwYXJhbXM6IEl0ZW1Db21wbGV0ZWROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtID0gcGFyYW1zLml0ZW07XG5cdFx0aWYgKGl0ZW0udHlwZSAhPT0gJ2NvbGxhYkFnZW50VG9vbENhbGwnIHx8IGl0ZW0udG9vbCAhPT0gJ3NwYXduQWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5tYXBTdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoaXRlbS5pZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRDaGF0ID0gc2Vzc2lvbi5jaGF0Q2hhbm5lbCE7XG5cdFx0Y29uc3QgbW9kZWwgPSBpdGVtLm1vZGVsIHx8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0YXNrRGVzY3JpcHRpb24gPSBpdGVtLnByb21wdCB8fCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBjaGlsZFRocmVhZElkIG9mIGl0ZW0ucmVjZWl2ZXJUaHJlYWRJZHMpIHtcblx0XHRcdGlmICh0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmhhcyhjaGlsZFRocmVhZElkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN1YlNlc3Npb24gPSB0aGlzLl9jcmVhdGVTdWJhZ2VudFNlc3Npb24oc2Vzc2lvbiwgY2hpbGRUaHJlYWRJZCk7XG5cdFx0XHR0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLnNldChjaGlsZFRocmVhZElkLCB7XG5cdFx0XHRcdHBhcmVudFNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdHNlc3Npb246IHN1YlNlc3Npb24sXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfc3RhcnRlZCcsXG5cdFx0XHRcdGNoYXQ6IHBhcmVudENoYXQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdGFnZW50TmFtZTogbW9kZWwgPz8gJ2NvZGV4Jyxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogbW9kZWwgPz8gJ1N1YmFnZW50Jyxcblx0XHRcdFx0dGFza0Rlc2NyaXB0aW9uLFxuXHRcdFx0XHQvLyBDb2RleCBzdXJmYWNlcyB0aGUgZnVsbCBkZWxlZ2F0ZWQgaW5zdHJ1Y3Rpb24gYXMgYGl0ZW0ucHJvbXB0YC5cblx0XHRcdFx0dGFza1Byb21wdDogdHlwZW9mIGl0ZW0ucHJvbXB0ID09PSAnc3RyaW5nJyAmJiBpdGVtLnByb21wdC5sZW5ndGggPiAwID8gaXRlbS5wcm9tcHQgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb2RleDoke3Nlc3Npb24uc2Vzc2lvbklkfV0gc3ViYWdlbnQgc3Bhd25lZCB0aHJlYWQ9JHtjaGlsZFRocmVhZElkfSB0b29sQ2FsbD0ke2VudHJ5LnRvb2xDYWxsSWR9IG1vZGVsPSR7bW9kZWwgPz8gJyhkZWZhdWx0KSd9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIGFuIGlzb2xhdGVkIHtAbGluayBJQ29kZXhTZXNzaW9ufSB1c2VkIHRvIHJ1biB0aGUgc2hhcmVkIGV2ZW50XG5cdCAqIG1hcHBlcnMgZm9yIGEgc3ViYWdlbnQgY2hpbGQgdGhyZWFkLiBJdCBzaGFyZXMgdGhlIHBhcmVudCdzIGBzZXNzaW9uVXJpYFxuXHQgKiAoc28gc2lkZSBlZmZlY3RzIHRhcmdldCB0aGUgcGFyZW50J3Mgd29ya2luZyB0cmVlIGFuZCB0aGUgZmlyZWQgYWN0aW9uc1xuXHQgKiByZXNvbHZlIHRvIHRoZSBwYXJlbnQgY2hhdCBjaGFubmVsKSBhbmQgYGFjY2VwdGVkRm9yU2Vzc2lvbmAgbWVtbyAoc28gdGhlXG5cdCAqIGFjY2VwdC1mb3Itc2Vzc2lvbiBkZWNpc2lvbiBzcGFucyBwYXJlbnQgKyBzdWJhZ2VudHMpLCBidXQgaGFzIGl0cyBvd25cblx0ICogZnJlc2ggbWFwL3R1cm4gc3RhdGUgYW5kIGFwcHJvdmFsIHJlZ2lzdHJ5IHNvIHRoZSBjaGlsZCdzIGV2ZW50cyBkb24ndFxuXHQgKiBjb2xsaWRlIHdpdGggdGhlIHBhcmVudCdzLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlU3ViYWdlbnRTZXNzaW9uKHBhcmVudDogSUNvZGV4U2Vzc2lvbiwgY2hpbGRUaHJlYWRJZDogc3RyaW5nKTogSUNvZGV4U2Vzc2lvbiB7XG5cdFx0Y29uc3QgY2xpZW50VG9vbFNldCA9IG5ldyBBY3RpdmVDbGllbnRUb29sU2V0KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNlc3Npb25JZDogcGFyZW50LnNlc3Npb25JZCxcblx0XHRcdHRocmVhZElkOiBjaGlsZFRocmVhZElkLFxuXHRcdFx0c2Vzc2lvblVyaTogcGFyZW50LnNlc3Npb25VcmksXG5cdFx0XHRzdGFydFRpbWU6IHBhcmVudC5zdGFydFRpbWUsXG5cdFx0XHRtb2RpZmllZFRpbWU6IHBhcmVudC5tb2RpZmllZFRpbWUsXG5cdFx0XHRzdW1tYXJ5OiBwYXJlbnQuc3VtbWFyeSxcblx0XHRcdGNoYXRDaGFubmVsOiBwYXJlbnQuY2hhdENoYW5uZWwsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBwYXJlbnQud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcGFyZW50LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdG11bHRpUm9vdEVuYWJsZWQ6IHBhcmVudC5tdWx0aVJvb3RFbmFibGVkLFxuXHRcdFx0bWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IHVuZGVmaW5lZCxcblx0XHRcdG1hcFN0YXRlOiBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSh0aGlzLl9ob3N0U2VydmVyVG9vbE5hbWVzKCksIGNsaWVudFRvb2xTZXQpLFxuXHRcdFx0cGVuZGluZ0NvbW1hbmRBcHByb3ZhbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENvbW1hbmRFeGVjdXRpb25BcHByb3ZhbERlY2lzaW9uPigpLFxuXHRcdFx0YWNjZXB0ZWRGb3JTZXNzaW9uOiBwYXJlbnQuYWNjZXB0ZWRGb3JTZXNzaW9uLFxuXHRcdFx0aGFuZGxlZEd1YXJkaWFuUmV2aWV3czogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkczogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nU3RlZXJpbmdGbGlwczogbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdNZXNzYWdlPigpLFxuXHRcdFx0Y2xpZW50VG9vbFNldCxcblx0XHRcdHBlbmRpbmdDbGllbnRUb29sQ2FsbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFRvb2xDYWxsUmVzdWx0PigpLFxuXHRcdFx0cGVuZGluZ1VzZXJJbnB1dHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PElDb2RleFVzZXJJbnB1dFJlc3VsdD4oKSxcblx0XHRcdG1hdGVyaWFsaXplZFRvb2xzU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRNY3BTaWc6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZEN1c3RvbWl6YXRpb25zU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRQZXJtaXNzaW9uc1NpZzogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcjogcGFyZW50Lm1hdGVyaWFsaXplZE1vZGVsUHJvdmlkZXIsXG5cdFx0XHRmaXJzdFR1cm5TZW50OiB0cnVlLFxuXHRcdFx0bW9kZWw6IHBhcmVudC5tb2RlbCxcblx0XHRcdGFnZW50OiBwYXJlbnQuYWdlbnQsXG5cdFx0XHRjdXN0b21pemF0aW9uRGlyZWN0b3J5OiB1bmRlZmluZWQsXG5cdFx0XHRjdXJyZW50VHVybklkOiB1bmRlZmluZWQsXG5cdFx0XHR0dXJuU3RvcFdhdGNoOiB1bmRlZmluZWQsXG5cdFx0XHRjdXJyZW50QXBwVHVybklkOiB1bmRlZmluZWQsXG5cdFx0XHRob3N0VHVybklkQnlBcHBUdXJuSWQ6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCksXG5cdFx0XHRjb2RleFR1cm5JZEJ5SG9zdFR1cm5JZDogbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKSxcblx0XHRcdG5lZWRzUmVzdW1lOiBmYWxzZSxcblx0XHRcdHVuc3Vic2NyaWJlQmVmb3JlUmVzdW1lOiBmYWxzZSxcblx0XHRcdHJlc3VtZVByb21pc2U6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RQcm9tcHRUZXh0OiAnJyxcblx0XHRcdGRpc3Bvc2VkOiBmYWxzZSxcblx0XHRcdG1hdGVyaWFsaXplUHJvbWlzZTogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkRXZlbnRGaXJlZDogdHJ1ZSxcblx0XHRcdHByZXdhcm1UaW1lcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJld2FybUNsYWltZWQ6IHRydWUsXG5cdFx0XHRzZXJ2ZXJUb29sc0FkdmVydGlzZWQ6IHRydWUsXG5cdFx0XHRtY3BDb250cm9sbGVyOiB1bmRlZmluZWQsXG5cdFx0XHRjbGllbnRDdXN0b21pemF0aW9uczogbmV3IENvZGV4Q2xpZW50Q3VzdG9taXphdGlvblN0b3JlKCksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlIGEgc3ViYWdlbnQgYWN0aW9uIHRhZ2dlZCB3aXRoIHRoZSBwYXJlbnQgYHNwYXduQWdlbnRgIHRvb2wgY2FsbC5cblx0ICogVGhlIGByZXNvdXJjZWAgaXMgdGhlIHBhcmVudCBjaGF0IGNoYW5uZWwgKHRoZSBrZXkgdGhlIHN1YmFnZW50XG5cdCAqIGNvbnZlcnNhdGlvbiBpcyByZWdpc3RlcmVkIHVuZGVyIGluIHRoZSBvcmNoZXN0cmF0b3IpOyBgcGFyZW50VG9vbENhbGxJZGBcblx0ICogcm91dGVzIHRoZSBhY3Rpb24gaW50byB0aGUgY2hpbGQncyByZWFkLW9ubHkgY29udmVyc2F0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmlyZVN1YmFnZW50KHN1YmFnZW50OiBJQ29kZXhTdWJhZ2VudCwgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogc3ViYWdlbnQuc2Vzc2lvbi5jaGF0Q2hhbm5lbCEsXG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRwYXJlbnRUb29sQ2FsbElkOiBzdWJhZ2VudC50b29sQ2FsbElkLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDQ6IGhhbmRsZSBgaXRlbS9jb21tYW5kRXhlY3V0aW9uL3JlcXVlc3RBcHByb3ZhbGAgZnJvbVxuXHQgKiBjb2RleC4gTG9vayB1cCB0aGUgaG9zdC1zaWRlIHRvb2wgY2FsbCBmb3IgdGhlIGl0ZW0sIGVtaXQgYVxuXHQgKiBgQ2hhdFRvb2xDYWxsUmVhZHlgIGluIFBlbmRpbmdDb25maXJtYXRpb24sIHBhcmsgb24gYSBkZWZlcnJlZFxuXHQgKiBrZXllZCBieSB0b29sQ2FsbElkLCBhbmQgcmVzb2x2ZSB3aGVuIHRoZSB1c2VyIChvciB0aGVcblx0ICogYWNjZXB0LWZvci1zZXNzaW9uIG1lbW8pIGRlY2lkZXMuIFVua25vd24gc2Vzc2lvbnMgLyBpdGVtc1xuXHQgKiBkZWNsaW5lIHNpbGVudGx5IHNvIGNvZGV4IHN0b3BzIGJsb2NraW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlQ29tbWFuZEFwcHJvdmFsUmVxdWVzdFJwYyhwYXJhbXM6IENvbW1hbmRFeGVjdXRpb25SZXF1ZXN0QXBwcm92YWxQYXJhbXMpOiBQcm9taXNlPHsgcmVhZG9ubHkgcmVzdWx0OiBDb21tYW5kRXhlY3V0aW9uUmVxdWVzdEFwcHJvdmFsUmVzcG9uc2UgfT4ge1xuXHRcdC8vIFRoZSByZXF1ZXN0IGhhbmRsZXIgbXVzdCByZXR1cm4gQ29kZXgncyBKU09OLVJQQyByZXN1bHQgd3JhcHBlcjsga2VlcFxuXHRcdC8vIHRoZSBhcHByb3ZhbCBtZXRob2QgYmVsb3cgZm9jdXNlZCBvbiB0aGUgaG9zdC1zaWRlIHBlcm1pc3Npb24gZGVjaXNpb24uXG5cdFx0Y29uc3QgZGVjaXNpb24gPSBhd2FpdCB0aGlzLl9oYW5kbGVDb21tYW5kQXBwcm92YWxSZXF1ZXN0KHBhcmFtcyk7XG5cdFx0cmV0dXJuIHsgcmVzdWx0OiB7IGRlY2lzaW9uIH0gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNvbW1hbmRBcHByb3ZhbFJlcXVlc3QocGFyYW1zOiB7XG5cdFx0cmVhZG9ubHkgdGhyZWFkSWQ6IHN0cmluZztcblx0XHRyZWFkb25seSB0dXJuSWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBpdGVtSWQ6IHN0cmluZztcblx0XHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nIHwgbnVsbDtcblx0XHRyZWFkb25seSByZWFzb24/OiBzdHJpbmcgfCBudWxsO1xuXHR9KTogUHJvbWlzZTxDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbj4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Jlc29sdmVBcHByb3ZhbFRhcmdldChwYXJhbXMudGhyZWFkSWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gY29tbWFuZEV4ZWN1dGlvbi9yZXF1ZXN0QXBwcm92YWwgZm9yIHVua25vd24gdGhyZWFkSWQ9JHtwYXJhbXMudGhyZWFkSWR9OyBkZWNsaW5pbmdgKTtcblx0XHRcdHJldHVybiAnZGVjbGluZSc7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSB0YXJnZXQuc2Vzc2lvbjtcblx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24ubWFwU3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBjb21tYW5kRXhlY3V0aW9uL3JlcXVlc3RBcHByb3ZhbCBmb3IgdW5rbm93biBpdGVtSWQ9JHtwYXJhbXMuaXRlbUlkfTsgZGVjbGluaW5nYCk7XG5cdFx0XHRyZXR1cm4gJ2RlY2xpbmUnO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kID0gcGFyYW1zLmNvbW1hbmQgPz8gJyc7XG5cdFx0Ly8gUGVlbCB0aGUgT1Mgc2hlbGwgd3JhcHBlciAoYC9iaW4venNoIC1sYyAnXHUyMDI2J2ApIG9mZiBmb3IgZGlzcGxheSBzbyB0aGVcblx0XHQvLyBhcHByb3ZhbCBjYXJkIG1hdGNoZXMgdGhlIHRlcm1pbmFsIHBpbGwsIGJ1dCBrZWVwIHRoZSByYXcgY29tbWFuZCBhc1xuXHRcdC8vIHRoZSBhY2NlcHQtZm9yLXNlc3Npb24gbWVtbyBrZXkgc28gaXQgc3RheXMgYnl0ZS1pZGVudGljYWwgdG8gd2hhdFxuXHRcdC8vIENvZGV4IHJlLXNlbmRzIG9uIHRoZSBuZXh0IHJlcXVlc3QgZm9yIHRoZSBzYW1lIGNvbW1hbmQuXG5cdFx0Y29uc3QgZGlzcGxheUNvbW1hbmQgPSB1bndyYXBTaGVsbEludm9jYXRpb24oY29tbWFuZCk7XG5cdFx0Ly8gQWNjZXB0LWZvci1zZXNzaW9uIG1lbW86IGlmIHRoZSB1c2VyIHByZXZpb3VzbHkgYWNjZXB0ZWQgdGhpc1xuXHRcdC8vIGV4YWN0IGNvbW1hbmQgZm9yIHRoZSBzZXNzaW9uLCBhdXRvLWFjY2VwdCB3aXRob3V0IHByb21wdGluZy5cblx0XHRpZiAoY29tbWFuZCAmJiBzZXNzaW9uLmFjY2VwdGVkRm9yU2Vzc2lvbi5oYXMoY29tbWFuZCkpIHtcblx0XHRcdHJldHVybiAnYWNjZXB0Rm9yU2Vzc2lvbic7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpcm1hdGlvblRpdGxlID0gcGFyYW1zLnJlYXNvbiA/PyAnUnVuIHNoZWxsIGNvbW1hbmQnO1xuXHRcdC8vIEF0b21pY2FsbHkgcmVnaXN0ZXIgdGhlIGRlZmVycmVkIGFuZCBmaXJlIHRoZVxuXHRcdC8vIFBlbmRpbmdDb25maXJtYXRpb24gc2lnbmFsIHNvIGEgc3luY2hyb25vdXMgcmVzcG9uZGVyIGNhbid0XG5cdFx0Ly8gbWlzcyB0aGUgcmVnaXN0cmF0aW9uLlxuXHRcdGNvbnN0IGRlY2lzaW9uID0gYXdhaXQgc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5yZWdpc3RlckFuZEZpcmUoZW50cnkudG9vbENhbGxJZCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fZmlyZUFwcHJvdmFsKHRhcmdldCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGRpc3BsYXlDb21tYW5kLFxuXHRcdFx0XHR0b29sSW5wdXQ6IGRpc3BsYXlDb21tYW5kLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdC8vIFRyYWNrIGFjY2VwdC1mb3Itc2Vzc2lvbiBkZWNpc2lvbnMgZm9yIHRoZSBuZXh0IHJlcXVlc3QuXG5cdFx0aWYgKGRlY2lzaW9uID09PSAnYWNjZXB0Rm9yU2Vzc2lvbicgJiYgY29tbWFuZCkge1xuXHRcdFx0c2Vzc2lvbi5hY2NlcHRlZEZvclNlc3Npb24uYWRkKGNvbW1hbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVjaXNpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVGaWxlQ2hhbmdlQXBwcm92YWxSZXF1ZXN0UnBjKHBhcmFtczogRmlsZUNoYW5nZVJlcXVlc3RBcHByb3ZhbFBhcmFtcyk6IFByb21pc2U8eyByZWFkb25seSByZXN1bHQ6IEZpbGVDaGFuZ2VSZXF1ZXN0QXBwcm92YWxSZXNwb25zZSB9PiB7XG5cdFx0Y29uc3QgZGVjaXNpb24gPSBhd2FpdCB0aGlzLl9yZXF1ZXN0SXRlbUFwcHJvdmFsKHBhcmFtcy50aHJlYWRJZCwgcGFyYW1zLml0ZW1JZCwgcGFyYW1zLnJlYXNvbiA/PyAnQXBwbHkgZmlsZSBjaGFuZ2VzJyk7XG5cdFx0cmV0dXJuIHsgcmVzdWx0OiB7IGRlY2lzaW9uOiBuYXJyb3dGaWxlQ2hhbmdlRGVjaXNpb24oZGVjaXNpb24pIH0gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVBlcm1pc3Npb25zQXBwcm92YWxSZXF1ZXN0UnBjKHBhcmFtczogUGVybWlzc2lvbnNSZXF1ZXN0QXBwcm92YWxQYXJhbXMpOiBQcm9taXNlPHsgcmVhZG9ubHkgcmVzdWx0OiBQZXJtaXNzaW9uc1JlcXVlc3RBcHByb3ZhbFJlc3BvbnNlIH0+IHtcblx0XHRjb25zdCBkZWNpc2lvbiA9IGF3YWl0IHRoaXMuX3JlcXVlc3RJdGVtQXBwcm92YWwocGFyYW1zLnRocmVhZElkLCBwYXJhbXMuaXRlbUlkLCBwYXJhbXMucmVhc29uID8/ICdHcmFudCBlbGV2YXRlZCBwZXJtaXNzaW9ucycpO1xuXHRcdGNvbnN0IGdyYW50ZWQgPSBkZWNpc2lvbiA9PT0gJ2FjY2VwdCcgfHwgZGVjaXNpb24gPT09ICdhY2NlcHRGb3JTZXNzaW9uJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdC8vIEdyYW50IGV4YWN0bHkgd2hhdCB3YXMgcmVxdWVzdGVkIG9uIGFjY2VwdDsgbm90aGluZyBvbiBkZWNsaW5lLlxuXHRcdFx0XHRwZXJtaXNzaW9uczogZ3JhbnRlZFxuXHRcdFx0XHRcdD8geyBuZXR3b3JrOiBwYXJhbXMucGVybWlzc2lvbnMubmV0d29yayA/PyB1bmRlZmluZWQsIGZpbGVTeXN0ZW06IHBhcmFtcy5wZXJtaXNzaW9ucy5maWxlU3lzdGVtID8/IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0OiB7fSxcblx0XHRcdFx0c2NvcGU6IGRlY2lzaW9uID09PSAnYWNjZXB0Rm9yU2Vzc2lvbicgPyAnc2Vzc2lvbicgOiAndHVybicsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogU2hhcmVkIGFwcHJvdmFsIGZsb3cgZm9yIGl0ZW0tc2NvcGVkIGByZXF1ZXN0QXBwcm92YWxgIHJlcXVlc3RzIHRoYXRcblx0ICogZG9uJ3QgY2FycnkgdGhlaXIgb3duIGNvbW1hbmQgc3RyaW5nOiBsb29rIHVwIHRoZSBob3N0IHRvb2wgY2FsbCBmb3Jcblx0ICogdGhlIGl0ZW0sIGZpcmUgYSBwZW5kaW5nLWNvbmZpcm1hdGlvbiBgQ2hhdFRvb2xDYWxsUmVhZHlgLCBhbmQgcmVzb2x2ZVxuXHQgKiB3aGVuIHRoZSB1c2VyICh2aWEge0BsaW5rIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0fSkgZGVjaWRlcy4gRGVjbGluZXNcblx0ICogaWYgdGhlIHNlc3Npb24gb3IgaXRlbSBpcyB1bmtub3duLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVxdWVzdEl0ZW1BcHByb3ZhbCh0aHJlYWRJZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgY29uZmlybWF0aW9uVGl0bGU6IHN0cmluZyk6IFByb21pc2U8Q29tbWFuZEV4ZWN1dGlvbkFwcHJvdmFsRGVjaXNpb24+IHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXNvbHZlQXBwcm92YWxUYXJnZXQodGhyZWFkSWQpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gYXBwcm92YWwgcmVxdWVzdCBmb3IgdW5rbm93biB0aHJlYWRJZD0ke3RocmVhZElkfTsgZGVjbGluaW5nYCk7XG5cdFx0XHRyZXR1cm4gJ2RlY2xpbmUnO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGFyZ2V0LnNlc3Npb247XG5cdFx0Y29uc3QgZW50cnkgPSBzZXNzaW9uLm1hcFN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChpdGVtSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBhcHByb3ZhbCByZXF1ZXN0IGZvciB1bmtub3duIGl0ZW1JZD0ke2l0ZW1JZH07IGRlY2xpbmluZ2ApO1xuXHRcdFx0cmV0dXJuICdkZWNsaW5lJztcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb24ucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMucmVnaXN0ZXJBbmRGaXJlKGVudHJ5LnRvb2xDYWxsSWQsICgpID0+IHtcblx0XHRcdHRoaXMuX2ZpcmVBcHByb3ZhbCh0YXJnZXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdFx0dG9vbElucHV0OiBjb25maXJtYXRpb25UaXRsZSxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSB7QGxpbmsgSUNvZGV4U2Vzc2lvbn0gdGhhdCBvd25zIGEgY29kZXggdGhyZWFkIGZvciBhblxuXHQgKiBhcHByb3ZhbCByZXF1ZXN0LCBwbHVzIHRoZSBzdWJhZ2VudCB3cmFwcGVyIHdoZW4gdGhlIHRocmVhZCBpcyBhXG5cdCAqIGNvbGxhYi1hZ2VudCBjaGlsZC4gQSBzdWJhZ2VudCB0b29sIGNhbGwncyBwZW5kaW5nLWNvbmZpcm1hdGlvblxuXHQgKiBgQ2hhdFRvb2xDYWxsUmVhZHlgIG11c3QgYmUgZmlyZWQgd2l0aCB0aGUgcGFyZW50IGBzcGF3bkFnZW50YCB0b29sIGNhbGxcblx0ICogYXMgaXRzIGBwYXJlbnRUb29sQ2FsbElkYCAodmlhIHtAbGluayBfZmlyZUFwcHJvdmFsfSkgc28gaXQgbGFuZHMgaW4gdGhlXG5cdCAqIGNoaWxkJ3MgcmVhZC1vbmx5IGNvbnZlcnNhdGlvbiBcdTIwMTQgd2hlcmUgdGhlIG1hdGNoaW5nXG5cdCAqIGBDaGF0VG9vbENhbGxTdGFydGAgbGl2ZXMgXHUyMDE0IGluc3RlYWQgb2Ygb24gdGhlIHBhcmVudCBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUFwcHJvdmFsVGFyZ2V0KHRocmVhZElkOiBzdHJpbmcpOiB7IHJlYWRvbmx5IHNlc3Npb246IElDb2RleFNlc3Npb247IHJlYWRvbmx5IHN1YmFnZW50PzogSUNvZGV4U3ViYWdlbnQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmdldCh0aHJlYWRJZCk7XG5cdFx0aWYgKHN1YmFnZW50KSB7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiBzdWJhZ2VudC5zZXNzaW9uLCBzdWJhZ2VudCB9O1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmdldCh0aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBzZXNzaW9uID8geyBzZXNzaW9uIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogRmlyZSBhbiBhcHByb3ZhbCBhY3Rpb24gdG8gdGhlIHBhcmVudCBzZXNzaW9uIG9yIHRoZSBzdWJhZ2VudCBjb252ZXJzYXRpb24uICovXG5cdHByaXZhdGUgX2ZpcmVBcHByb3ZhbCh0YXJnZXQ6IHsgcmVhZG9ubHkgc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbjsgcmVhZG9ubHkgc3ViYWdlbnQ/OiBJQ29kZXhTdWJhZ2VudCB9LCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRhcmdldC5zdWJhZ2VudCkge1xuXHRcdFx0dGhpcy5fZmlyZVN1YmFnZW50KHRhcmdldC5zdWJhZ2VudCwgYWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZmlyZSh0YXJnZXQuc2Vzc2lvbi5zZXNzaW9uVXJpLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUd1YXJkaWFuV2FybmluZyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBwYXJhbXM6IEd1YXJkaWFuV2FybmluZ05vdGlmaWNhdGlvbik6IENoYXRBY3Rpb25bXSB7XG5cdFx0Y29uc3QgdHVybklkID0gc2Vzc2lvbi5jdXJyZW50VHVybklkO1xuXHRcdGlmICh0dXJuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBndWFyZGlhbldhcm5pbmcgd2l0aG91dCBhY3RpdmUgdHVybjsgaWdub3JpbmdgKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRwYXJ0OiB7XG5cdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRjb250ZW50OiBwYXJhbXMubWVzc2FnZSxcblx0XHRcdH0sXG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVHdWFyZGlhblJldmlld0NvbXBsZXRlZChjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudCwgcGFyYW1zOiBJdGVtR3VhcmRpYW5BcHByb3ZhbFJldmlld0NvbXBsZXRlZE5vdGlmaWNhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuZ2V0KHBhcmFtcy50aHJlYWRJZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25JZCA/IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvZGV4XSBhdXRvQXBwcm92YWxSZXZpZXcvY29tcGxldGVkIGZvciB1bmtub3duIHRocmVhZElkPSR7cGFyYW1zLnRocmVhZElkfTsgaWdub3JpbmdgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHBhcmFtcy5yZXZpZXcuc3RhdHVzICE9PSAnZGVuaWVkJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5oYW5kbGVkR3VhcmRpYW5SZXZpZXdzLmhhcyhwYXJhbXMucmV2aWV3SWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEJpbmQgdGhlIGRlbmlhbCBzdXJmYWNpbmcgdG8gdGhlIHJldmlldydzIE9XTiB0dXJuIChtYXBwZWQgYXBwXHUyMTkyaG9zdCksXG5cdFx0Ly8gbm90IHdoYXRldmVyIHR1cm4gaGFwcGVucyB0byBiZSBjdXJyZW50LiBBbiBgYXV0b0FwcHJvdmFsUmV2aWV3L2NvbXBsZXRlZGBcblx0XHQvLyB0aGF0IGFycml2ZXMgb3V0IG9mIG9yZGVyIFx1MjAxNCBhZnRlciBpdHMgdHVybiBlbmRlZCwgb3Igb25jZSBhIGxhdGVyIHR1cm4gaXNcblx0XHQvLyBhY3RpdmUgXHUyMDE0IG11c3Qgbm90IG1pcy1hdHRyaWJ1dGUgdGhlIG5vdGljZS9jYXJkIHRvIGEgZGlmZmVyZW50IHR1cm4sIG5vclxuXHRcdC8vIGFwcGx5IHRoaXMgcmV2aWV3J3Mgc3RhbGUgYWN0aW9uIGFnYWluc3QgaXQuIFdoZW4gdGhlIHJldmlldydzIHR1cm4gaXMgbm9cblx0XHQvLyBsb25nZXIgdGhlIGFjdGl2ZSB0dXJuIHRoZXJlIGlzIG5vdGhpbmcgbGVmdCB0byBhcHByb3ZlIHdpdGhpbiBpdCwgc28gaWdub3JlLlxuXHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX2hvc3RUdXJuSWQoc2Vzc2lvbiwgcGFyYW1zLnR1cm5JZCk7XG5cdFx0aWYgKHNlc3Npb24uY3VycmVudFR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSBhdXRvQXBwcm92YWxSZXZpZXcvY29tcGxldGVkIGZvciBub24tY3VycmVudCB0dXJuICR7dHVybklkfSAoY3VycmVudD0ke3Nlc3Npb24uY3VycmVudFR1cm5JZCA/PyAnKG5vbmUpJ30pOyBpZ25vcmluZyByZXZpZXdJZD0ke3BhcmFtcy5yZXZpZXdJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZXNzaW9uLmhhbmRsZWRHdWFyZGlhblJldmlld3MuYWRkKHBhcmFtcy5yZXZpZXdJZCk7XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gc3VtbWFyaXplR3VhcmRpYW5SZXZpZXdBY3Rpb24ocGFyYW1zLmFjdGlvbik7XG5cblx0XHQvLyBEdXJhYmxlIHJlY29yZDogYSBNYXJrZG93biByZXNwb25zZSBwYXJ0IHN1cnZpdmVzIHR1cm4gY29tcGxldGlvbiBBTkQgaXNcblx0XHQvLyByZW5kZXJlZCBieSB0aGUgbGl2ZSBzdHJlYW1pbmcgcGF0aCAodW5saWtlIGEgc3lzdGVtLW5vdGlmaWNhdGlvbiBwYXJ0LFxuXHRcdC8vIHdoaWNoIHRoZSB3b3JrYmVuY2ggbWFwcyB0byBhIHRyYW5zaWVudCBwcm9ncmVzcyBtZXNzYWdlIGFuZCBuZXZlciBlbWl0c1xuXHRcdC8vIG1pZC10dXJuKS4gVGhlIGF1dG8tcmV2aWV3IGNpcmN1aXQtYnJlYWtlciBpbnRlcnJ1cHRzIHRoZSB0dXJuIGFmdGVyXG5cdFx0Ly8gcmVwZWF0ZWQgZGVuaWFscyBcdTIwMTQgY2FuY2VsbGluZyB0aGUgdG9vbC1jYWxsIGNhcmQgYmVsb3cgXHUyMDE0IHNvIHdpdGhvdXQgdGhpc1xuXHRcdC8vIHRoZSB1c2VyIGNvdWxkIGJlIGxlZnQgd2l0aCBubyBmZWVkYmFjayBhdCBhbGwuIFN1cmZhY2luZyB0aGUgcmV2aWV3ZXJcblx0XHQvLyByYXRpb25hbGUgaGVyZSBtaXJyb3JzIHRoZSBtYW51YWwtYXBwcm92YWwgZmVlZGJhY2sgdGhlIERlZmF1bHRcblx0XHQvLyBwZXJtaXNzaW9ucyBwcmVzZXQgcHJvdmlkZXMuXG5cdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRjb250ZW50OiBmb3JtYXRHdWFyZGlhbkRlbmlhbE5vdGlmaWNhdGlvbihzdW1tYXJ5LCBwYXJhbXMucmV2aWV3LnJhdGlvbmFsZSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gQmVzdC1lZmZvcnQgaW4tdHVybiBvdmVycmlkZTogd2hpbGUgdGhlIHR1cm4gaXMgc3RpbGwgcnVubmluZyAoYmVmb3JlIHRoZVxuXHRcdC8vIGNpcmN1aXQtYnJlYWtlciBpbnRlcnJ1cHQpIHRoZSBtb2RlbCBrZWVwcyB0cnlpbmcgc2FmZXIgcGF0aHMsIHNvXG5cdFx0Ly8gYXBwcm92aW5nIGhlcmUgbGV0cyBjb2RleCByZXRyeSB0aGUgZXhhY3QgZGVuaWVkIGFjdGlvbi4gY29kZXggZG9lcyBub3Rcblx0XHQvLyBibG9jayBvbiB0aGlzIGNhcmQsIHNvIGlmIHRoZSB0dXJuIGVuZHMgZmlyc3QgdGhlIHJlZHVjZXIgY2FuY2VscyBpdCBhbmRcblx0XHQvLyB7QGxpbmsgX2hhbmRsZVR1cm5Db21wbGV0ZWROb3RpZmljYXRpb259IHVud2luZHMgdGhlIHBhcmtlZCBkZWZlcnJlZC5cblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBzdW1tYXJ5LmRldGFpbCB8fCBzdW1tYXJ5LnRpdGxlO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvblRpdGxlID0gJ0FwcHJvdmUgYW55d2F5Jztcblx0XHQvLyBEZWxpYmVyYXRlbHkgcmVuZGVyIHRoaXMgYXMgYSBQTEFJTiBjb25maXJtYXRpb24gY2FyZCwgTk9UIGEgdGVybWluYWxcblx0XHQvLyBwaWxsOiB0aGUgZGVuaWVkIGFjdGlvbiBhbHJlYWR5IGFwcGVhcnMgYXMgaXRzIHJlYWwgY29tbWFuZEV4ZWN1dGlvblxuXHRcdC8vIHRlcm1pbmFsIGJveCAoc3RyZWFtZWQgYnkgdGhlIGFwcC1zZXJ2ZXIpIGFuZCBhZ2FpbiBpbiB0aGUgZGVuaWFsXG5cdFx0Ly8gYmxvY2txdW90ZSBhYm92ZS4gVGFnZ2luZyB0aGUgY2FyZCB3aXRoIGEgdGVybWluYWwgYHRvb2xLaW5kYCArIGFcblx0XHQvLyBgdG9vbElucHV0YCB3b3VsZCBtYWtlIHRoZSBhZGFwdGVyIGRyYXcgYSAqc2Vjb25kKiB0ZXJtaW5hbCBib3ggZm9yIHRoZVxuXHRcdC8vIHNhbWUgY29tbWFuZCAoc2VlIHN0YXRlVG9Qcm9ncmVzc0FkYXB0ZXIgYHNob3VsZFJlbmRlckFzVGVybWluYWxgKSxcblx0XHQvLyB3aGljaCBpcyB0aGUgZHVwbGljYXRlIHRoZSB1c2VyIHJlcG9ydGVkLiBPbWl0dGluZyBib3RoIGtlZXBzIHRoZSBjYXJkXG5cdFx0Ly8gdG8ganVzdCBpdHMgdGl0bGUvbWVzc2FnZSArIFwiQXBwcm92ZSBhbnl3YXlcIiBidXR0b24uIFRoZSBidXR0b24gc3RpbGxcblx0XHQvLyB3b3JrcyBiZWNhdXNlIHRoZSByZWR1Y2VyIGtleXMgUGVuZGluZ0NvbmZpcm1hdGlvbiBvZmYgY29uZmlybWF0aW9uVGl0bGVcblx0XHQvLyAod2l0aCBgY29uZmlybWVkYCB1bnNldCksIGluZGVwZW5kZW50IG9mIHRvb2xJbnB1dC9tZXRhLlxuXHRcdHNlc3Npb24ucGVuZGluZ0d1YXJkaWFuUmV2aWV3Q2FyZHMuYWRkKHRvb2xDYWxsSWQpO1xuXHRcdGxldCBkZWNpc2lvbjogQ29tbWFuZEV4ZWN1dGlvbkFwcHJvdmFsRGVjaXNpb247XG5cdFx0dHJ5IHtcblx0XHRcdGRlY2lzaW9uID0gYXdhaXQgc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5yZWdpc3RlckFuZEZpcmUodG9vbENhbGxJZCwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0dG9vbE5hbWU6ICdhdXRvX3Jldmlld19kZW5pZWQnLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBzdW1tYXJ5LnRpdGxlLFxuXHRcdFx0XHRcdGludGVudGlvbjogaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBUaGUgcGFya2VkIGFwcHJvdmFsIHdhcyByZWplY3RlZCAoc2Vzc2lvbiBkaXNwb3NlIC8gY2FuY2VsbGF0aW9uKTtcblx0XHRcdC8vIHRoZXJlIGlzIG5vIGNhcmQgbGlmZWN5Y2xlIGxlZnQgdG8gZmluYWxpemUuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSBndWFyZGlhbiBhcHByb3ZhbCBjYW5jZWxsZWQgZm9yIHJldmlld0lkPSR7cGFyYW1zLnJldmlld0lkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNlc3Npb24ucGVuZGluZ0d1YXJkaWFuUmV2aWV3Q2FyZHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdH1cblxuXHRcdGlmIChkZWNpc2lvbiAhPT0gJ2FjY2VwdCcgJiYgZGVjaXNpb24gIT09ICdhY2NlcHRGb3JTZXNzaW9uJykge1xuXHRcdFx0Ly8gRGVjbGluZWQsIGNhbmNlbGxlZCwgb3IgdW53b3VuZCBieSB0dXJuIGNvbXBsZXRpb246IHRoZSBhY3Rpb24gc3RheXNcblx0XHRcdC8vIGJsb2NrZWQgYnkgY29kZXguIFdoZW4gdGhlIHVzZXIgZGVjbGluZWQsIHRoZSBVSSBhbHJlYWR5IHRyYW5zaXRpb25lZFxuXHRcdFx0Ly8gdGhlIGNhcmQgb2ZmIHRoZSBDaGF0VG9vbENhbGxDb25maXJtZWQgaXQgZGlzcGF0Y2hlZDsgd2hlbiB0aGUgdHVyblxuXHRcdFx0Ly8gZW5kZWQsIHRoZSByZWR1Y2VyIGNhbmNlbGxlZCBpdC4gRWl0aGVyIHdheSB0aGVyZSBpcyBub3RoaW5nIHRvIHNlbmQuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHR1cm4gZW5kZWQgYmV0d2VlbiB0aGUgdXNlcidzIGFwcHJvdmFsIGFuZCBoZXJlLCB0aGUgY2FyZCB3YXNcblx0XHQvLyBhbHJlYWR5IGNhbmNlbGxlZCBieSB0aGUgcmVkdWNlciBhbmQgY29kZXggaXMgbm8gbG9uZ2VyIHdhaXRpbmcgb24gdGhpc1xuXHRcdC8vIGFjdGlvbiB3aXRoaW4gdGhlIHR1cm4gXHUyMDE0IHNraXAgdGhlIHJvdW5kLXRyaXAuXG5cdFx0aWYgKHNlc3Npb24uY3VycmVudFR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0dXJuIGVuZGVkIGJlZm9yZSBndWFyZGlhbiBhcHByb3ZhbCBjb3VsZCBiZSBhcHBsaWVkIGZvciByZXZpZXdJZD0ke3BhcmFtcy5yZXZpZXdJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9hcHByb3ZlR3VhcmRpYW5EZW5pZWRBY3Rpb24nLCBUaHJlYWRBcHByb3ZlR3VhcmRpYW5EZW5pZWRBY3Rpb25SZXNwb25zZT4oJ3RocmVhZC9hcHByb3ZlR3VhcmRpYW5EZW5pZWRBY3Rpb24nLCB7XG5cdFx0XHRcdHRocmVhZElkOiBwYXJhbXMudGhyZWFkSWQsXG5cdFx0XHRcdGV2ZW50OiB0b0d1YXJkaWFuQXNzZXNzbWVudEV2ZW50SnNvbihwYXJhbXMpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0FwcHJvdmVkIGFueXdheScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSB1c2VyIGFwcHJvdmVkIGJ1dCB0aGUgYXBwLXNlcnZlciByZWplY3RlZCB0aGUgcm91bmQtdHJpcDsgZmluYWxpemVcblx0XHRcdC8vIHRoZSBjYXJkIGFzIGZhaWxlZCBzbyBpdCBkb2VzIG5vdCBoYW5nIGluIHRoZSBydW5uaW5nIHN0YXRlIGZvcmV2ZXIuXG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSBhcHByb3ZlR3VhcmRpYW5EZW5pZWRBY3Rpb24gZmFpbGVkIGZvciByZXZpZXdJZD0ke3BhcmFtcy5yZXZpZXdJZH06ICR7bWVzc2FnZX1gKTtcblx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0FwcHJvdmFsIGZhaWxlZCcsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ29ubmVjdGlvbkxvc3QoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0aWYgKGNvbm4ua2luZCAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb25uZWN0aW9uID0geyBraW5kOiAnaWRsZScgfTtcblx0XHQvLyBOb3RpZnkgZXZlcnkga25vd24gc2Vzc2lvbiB3aXRoIGEgc2luZ2xlIENoYXRFcnJvciArIGNvbXBsZXRlXG5cdFx0Ly8gcGFpciBzbyB0aGUgVUkgc3VyZmFjZXMgXCJhZ2VudCBkaXNjb25uZWN0ZWRcIiBjbGVhbmx5LlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Ly8gVW5wYXJrIGFueSBwZW5kaW5nIGFwcHJvdmFscyBzbyBhd2FpdGVycyB1bndpbmQuXG5cdFx0XHRzZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdC8vIFJlamVjdCBpbi1mbGlnaHQgY2xpZW50IHRvb2wgY2FsbHMgc28gdGhlaXIgaGFuZGxlcnMgdW53aW5kLlxuXHRcdFx0c2Vzc2lvbi5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRzZXNzaW9uLnBlbmRpbmdVc2VySW5wdXRzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHQvLyBDbGVhciBhbnkgYnVmZmVyZWQgc3RlZXJpbmcgc28gaXRzIHBlbmRpbmcgYnViYmxlIGRvZXNuJ3QgbGVhay5cblx0XHRcdHRoaXMuX2RyYWluUGVuZGluZ1N0ZWVyaW5nKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgdHVybklkID0gc2Vzc2lvbi5jdXJyZW50VHVybklkO1xuXHRcdFx0Y29uc3QgYXBwVHVybklkID0gc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkO1xuXHRcdFx0c2Vzc2lvbi5jdXJyZW50VHVybklkID0gdW5kZWZpbmVkO1xuXHRcdFx0c2Vzc2lvbi5jdXJyZW50QXBwVHVybklkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFwcFR1cm5JZCkge1xuXHRcdFx0XHRzZXNzaW9uLmhvc3RUdXJuSWRCeUFwcFR1cm5JZC5kZWxldGUoYXBwVHVybklkKTtcblx0XHRcdH1cblx0XHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ0NvZGV4RGlzY29ubmVjdGVkJywgbWVzc2FnZTogJ0NvZGV4IGFwcC1zZXJ2ZXIgZGlzY29ubmVjdGVkOyBzZXNzaW9uIG11c3QgcmVzdGFydC4nIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZCwgZHVyYXRpb24gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgc3ViYWdlbnQgb2YgdGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC52YWx1ZXMoKSkge1xuXHRcdFx0c3ViYWdlbnQuc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0XHRzdWJhZ2VudC5zZXNzaW9uLnBlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHN1YmFnZW50LnNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHN1YmFnZW50LnNlc3Npb24uY3VycmVudFR1cm5JZCA9IHVuZGVmaW5lZDtcblx0XHRcdHN1YmFnZW50LnNlc3Npb24uY3VycmVudEFwcFR1cm5JZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5jbGVhcigpO1xuXHRcdC8vIFJlbGVhc2UgcmVzb3VyY2VzLiBUaGUgcHJveHkgaGFuZGxlIGlzIHJlZmNvdW50ZWQgYW5kIGRyb3BzXG5cdFx0Ly8gdGhlIHVuZGVybHlpbmcgc2VydmVyIG9uY2UgZXZlcnlvbmUgcmVsZWFzZXMuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbm4uY2xpZW50LmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleF0gRmFpbGVkIHRvIGRpc3Bvc2UgYXBwLXNlcnZlciBjbGllbnQgYWZ0ZXIgY29ubmVjdGlvbiBsb3N0OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbm4ucHJveHlIYW5kbGU/LmRpc3Bvc2UoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleF0gRmFpbGVkIHRvIGRpc3Bvc2UgcHJveHkgaGFuZGxlIGFmdGVyIGNvbm5lY3Rpb24gbG9zdDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUNvbm5lY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0dGhpcy5fY29ubmVjdGlvbkdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9jb25uZWN0aW9uID0geyBraW5kOiAnaWRsZScgfTtcblx0XHRpZiAoY29ubmVjdGlvbi5raW5kICE9PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7IGNvbm5lY3Rpb24uY2xpZW50LmRpc3Bvc2UoKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0dHJ5IHsgY29ubmVjdGlvbi5wcm94eUhhbmRsZT8uZGlzcG9zZSgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHR0cnkgeyBjb25uZWN0aW9uLmNoaWxkLmtpbGwoJ1NJR0tJTEwnKTsgfSBjYXRjaCB7IC8qIGFscmVhZHkgZGVhZCAqLyB9XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBJQWdlbnQgbWV0aG9kc1xuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdjb2RleEFnZW50LmRpc3BsYXlOYW1lJywgXCJDb2RleFwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29kZXhBZ2VudC5kZXNjcmlwdGlvbicsIFwiQ29kZXggYWdlbnQgdXNpbmcgc2Vzc2lvbi1zZWxlY3RlZCBtb2RlbCBwcm92aWRlcnNcIiksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0bXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlIH0sXG5cdFx0XHRcdC4uLih0aGlzLl9pc011bHRpUm9vdEVuYWJsZWQoKSA/IHsgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM6IHsgaW1tdXRhYmxlUHJpbWFyeTogdHJ1ZSB9IH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpUm9vdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIGhvc3QtYWRkcmVzc2VkIENvZGV4IGNoYXQgdG8gdGhlIHNlc3Npb24gb2YgdGhlIHJ1bnRpbWUgYmFja2luZ1xuXHQgKiBpdC4gUmVzb2x1dGlvbiBoYXMgZXhhY3RseSB0d28gc291cmNlcywgaW4gb3JkZXI6IHRoZSBiaW5kaW5nIHRoaXMgYWdlbnRcblx0ICogcmVjb3JkZWQgd2hlbiB0aGUgY2hhdCB3YXMgcHJvdmlzaW9uZWQgb3IgcmVzdG9yZWQsIGFuZCB0aGUgdHJhbnNpZW50XG5cdCAqIGB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb3VyY2UgfWAgY29udGV4dCBBZ2VudCBIb3N0IHN1cHBsaWVzIGZvclxuXHQgKiBvcGVyYXRpb25zIHRoYXQgcnVuIGJlZm9yZSBhIGJpbmRpbmcgZXhpc3RzLiBUaGVyZSBpcyBkZWxpYmVyYXRlbHkgbm9cblx0ICogdGhpcmQgZmFsbGJhY2sgXHUyMDE0IG5laXRoZXIgY2hhdC1VUkkgc2hhcGUgcGFyc2luZywgbm9yIGhvc3Qtc2lkZVxuXHQgKiBtZW1iZXJzaGlwIGhldXJpc3RpY3MsIG5vciB0aGUgbGVnYWN5IFwiYSBzZXNzaW9uIFVSSSBhZGRyZXNzZXMgaXRzIG93blxuXHQgKiBjaGF0XCIgYWRhcHRlciBcdTIwMTQgc28gYW4gdW5hZGRyZXNzYWJsZSBjaGF0IHN1cmZhY2VzIGFzIGB1bmRlZmluZWRgIGluc3RlYWRcblx0ICogb2Ygc2lsZW50bHkgcm91dGluZyB0byBzb21lIG90aGVyIGNvbnZlcnNhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9uKGFkZHJlc3M6IFVSSSwgc2Vzc2lvbk9yQ29udGV4dD86IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9zZXNzaW9uSWRCeUNoYXRVcmkuZ2V0KGFkZHJlc3MudG9TdHJpbmcoKSk7XG5cdFx0aWYgKHNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25PckNvbnRleHQgPyByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChzZXNzaW9uT3JDb250ZXh0LCBhZGRyZXNzKS5jb25maWd1cmF0aW9uUmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgY29uZmlndXJhdGlvbiBzY29wZSBgY2hhdGAgaXMgKG9yIHdhcykgcmVnaXN0ZXJlZCB1bmRlciwgZm9yXG5cdCAqIHJlZi10cmFja2luZyBvbmx5LiBBbHdheXMgcHJlZmVycyB0aGUgc2NvcGUgdGhpcyBhZ2VudCBpdHNlbGYgcmVjb3JkZWRcblx0ICogd2hlbiB0aGUgY2hhdCB3YXMgdHJhY2tlZCAoc2VlIHtAbGluayBfdHJhY2tDb25maWdTY29wZUNoYXR9KSBcdTIwMTQgYSBwZWVyXG5cdCAqIGNoYXQncyBiYWNraW5nIHJ1bnRpbWUgY2FuIGJlIGtleWVkIGJ5IGl0cyBvd24gdGhyZWFkIGlkLCB3aGljaCBkaWZmZXJzXG5cdCAqIGZyb20gdGhlIHNlc3Npb24vY29uZmlnIHNjb3BlIGl0IHdhcyBjcmVhdGVkIHVuZGVyLCBzbyByZS1kZXJpdmluZyB0aGVcblx0ICogc2NvcGUgZnJvbSB0aGUgcnVudGltZSBiaW5kaW5nIChhcyB7QGxpbmsgX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9ufVxuXHQgKiBkb2VzKSB3b3VsZCBkaXNhZ3JlZSB3aXRoIHRoZSBzY29wZSBpdCB3YXMgb3JpZ2luYWxseSBjb3VudGVkIGFnYWluc3QuXG5cdCAqIE9ubHkgZm9yIGEgY2hhdCB0aGlzIGFnZW50IG5ldmVyIHRyYWNrZWQgKGUuZy4gYSBsZWdhY3ktcmVjb3ZlcmVkIG9yXG5cdCAqIHN1YmFnZW50IGNoYXQpIGRvZXMgdGhpcyBmYWxsIGJhY2sgdG8gdGhlIGhvc3Qtc3VwcGxpZWQgY29udGV4dCwgYW5kXG5cdCAqIGZpbmFsbHkgdG8gdGhlIGNoYXQncyBvd24gYWRkcmVzcy5cblx0ICovXG5cdHByaXZhdGUgX2NvbmZpZ1Njb3BlKGNoYXQ6IFVSSSwgY29udGV4dD86IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogVVJJIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fY29uZmlnU2NvcGVCeUNoYXQuZ2V0KGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0aWYgKHRyYWNrZWQpIHtcblx0XHRcdHJldHVybiBVUkkucGFyc2UodHJhY2tlZCk7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUNvbnZlcnNhdGlvblNlc3Npb24oY2hhdCkgPz8gY2hhdDtcblx0fVxuXG5cdC8qKiBSZWdpc3RlcnMgYGNoYXRgIGFzIGxpdmUgdW5kZXIgYGNvbmZpZ3VyYXRpb25SZXNvdXJjZWAncyByZWYtdHJhY2tlZCBzY29wZS4gSWRlbXBvdGVudC4gKi9cblx0cHJpdmF0ZSBfdHJhY2tDb25maWdTY29wZUNoYXQoY29uZmlndXJhdGlvblJlc291cmNlOiBVUkksIGNoYXQ6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGNvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGxldCBjaGF0cyA9IHRoaXMuX2NvbmZpZ1Njb3BlQ2hhdHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFjaGF0cykge1xuXHRcdFx0Y2hhdHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHRoaXMuX2NvbmZpZ1Njb3BlQ2hhdHMuc2V0KGtleSwgY2hhdHMpO1xuXHRcdH1cblx0XHRjaGF0cy5hZGQoY2hhdC50b1N0cmluZygpKTtcblx0XHR0aGlzLl9jb25maWdTY29wZUJ5Q2hhdC5zZXQoY2hhdC50b1N0cmluZygpLCBrZXkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERyb3BzIGBjaGF0YCBmcm9tIGl0cyBjb25maWd1cmF0aW9uIHNjb3BlJ3MgcmVmIHNldC4gUmV0dXJucyBgdHJ1ZWAgb25jZVxuXHQgKiBldmVyeSBjaGF0IGV2ZXIgcmVnaXN0ZXJlZCB1bmRlciB0aGF0IHNjb3BlIGhhcyBiZWVuIGRpc3Bvc2VkIFx1MjAxNCB0aGVcblx0ICogc2lnbmFsIHRoYXQgaXQgaXMgc2FmZSB0byByZWNsYWltIHNjb3BlLWxldmVsIHJlc291cmNlcyBcdTIwMTQgb3IgYGZhbHNlYFxuXHQgKiB3aGlsZSBvdGhlcnMgcmVtYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBfdW50cmFja0NvbmZpZ1Njb3BlQ2hhdChjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSSwgY2hhdDogVVJJKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fY29uZmlnU2NvcGVCeUNoYXQuZGVsZXRlKGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qga2V5ID0gY29uZmlndXJhdGlvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdHMgPSB0aGlzLl9jb25maWdTY29wZUNoYXRzLmdldChrZXkpO1xuXHRcdGlmICghY2hhdHMpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjaGF0cy5kZWxldGUoY2hhdC50b1N0cmluZygpKTtcblx0XHRpZiAoY2hhdHMuc2l6ZSA+IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fY29uZmlnU2NvcGVDaGF0cy5kZWxldGUoa2V5KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNsYWltcyBhIGNvbmZpZ3VyYXRpb24gc2NvcGUncyBtYW5hZ2VkIHdvcmtpbmcgZGlyZWN0b3J5IG9uY2UgaXRzIHJlZlxuXHQgKiBjb3VudCBoYXMgZHJvcHBlZCB0byB6ZXJvIGFuZCB0aGUgc2NvcGUncyBvd24gcnVudGltZSBpZGVudGl0eVxuXHQgKiAoYEFnZW50U2Vzc2lvbi5pZChjb25maWd1cmF0aW9uUmVzb3VyY2UpYCkgaXMgbm90IGN1cnJlbnRseSBsaXZlIFx1MjAxNFxuXHQgKiBtaXJyb3JpbmcgdGhlIHJlY2xhaW0gYSBsaXZlIHJ1bnRpbWUgYWxyZWFkeSBwZXJmb3JtcyBvbiBpdHMgb3duXG5cdCAqIGRlc3RydWN0aXZlIHRlYXJkb3duICh7QGxpbmsgX3RlYXJkb3duU2Vzc2lvbkluTWVtb3J5fSksIGZvciB0aGUgY2FzZVxuXHQgKiB3aGVyZSB0aGF0IHJ1bnRpbWUgd2FzIG5ldmVyIChvciBubyBsb25nZXIpIHJlc2lkZW50IGluIG1lbW9yeS4gRXZlcnlcblx0ICogY2FsbGVyIG9mIHRoaXMgbWV0aG9kIChgX2Rpc3Bvc2VDaGF0YCdzIHNjb3BlIHJlbGVhc2UsIGFuZFxuXHQgKiBgX2Rpc3Bvc2VSdW50aW1lU2Vzc2lvbmAncyBkZXN0cnVjdGl2ZSBwYXRoIGZvciBhbiBhbHJlYWR5LWdvbmVcblx0ICogcnVudGltZSkgaXMgb24gYSBkZXN0cnVjdGl2ZS1vbmx5IHBhdGgsIHNvIHRoaXMgYWxzbyByZWxlYXNlcyB0aGVcblx0ICogc2NvcGUncyBPVGVsIHRyYWNlIGNvbnRleHQgXHUyMDE0IGBzZXNzaW9uVXJpYCBoZXJlIHJvdW5kLXRyaXBzIHRvIHRoZSBleGFjdFxuXHQgKiBrZXkgYF90cmFjZUNvbnRleHRgIGFjcXVpcmVkIGl0IHVuZGVyIHdoZW5ldmVyIHRoaXMgc2NvcGUgd2FzIHRoZVxuXHQgKiBydW50aW1lJ3Mgb3duIGFkb3B0ZWQgaWRlbnRpdHkgKHNlZSB7QGxpbmsgSUNvZGV4U2Vzc2lvbi50aHJlYWRJZH0pLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVjbGFpbU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5SWZOb3RMaXZlKHNlc3Npb25Vcmk6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbnMuaGFzKHNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb3RlbFNlcnZpY2UucmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoc2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRjb25zdCBvdmVybGF5ID0gYXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS5yZWFkKHNlc3Npb25VcmkpO1xuXHRcdC8vIE9ubHkgdGhlIGV4cGxpY2l0IHBhdGggaXMgZXZlciB0cnVzdGVkIGhlcmUgXHUyMDE0IGBvdmVybGF5LmN3ZGAgaXMgdGhlXG5cdFx0Ly8gc2Vzc2lvbidzIGN1cnJlbnQgd29ya2luZyBkaXJlY3Rvcnkgd2hldGhlciBvciBub3QgdGhpcyBhZ2VudCBldmVyXG5cdFx0Ly8gbWFuYWdlZCBpdCwgYW5kIGEgbGVnYWN5IGBvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnlgIGZsYWcgd2l0aCBub1xuXHRcdC8vIGV4cGxpY2l0IHBhdGggcmVjb3JkZWQgKGFuIG92ZXJsYXkgd3JpdHRlbiBiZWZvcmUgdGhpcyBmaWVsZFxuXHRcdC8vIGV4aXN0ZWQpIG11c3QgYmUgbGVmdCBhbG9uZSByYXRoZXIgdGhhbiBndWVzc2VkIGF0LlxuXHRcdGNvbnN0IG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID0gdGhpcy5fcmVsZWFzZWRNYW5hZ2VkV29ya2luZ0RpcmVjdG9yaWVzLmdldChzZXNzaW9uSWQpXG5cdFx0XHQ/PyBvdmVybGF5Lm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmIChtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVtb3ZlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkobWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWxlYXNlZE1hbmFnZWRXb3JraW5nRGlyZWN0b3JpZXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogVW50cmFja3MgYGNoYXRgIGZyb20gaXRzIGNvbmZpZ3VyYXRpb24gc2NvcGUncyByZWYgY291bnQgYW5kLCBvbmNlIG5vXG5cdCAqIGNoYXQgcmVtYWlucyByZWdpc3RlcmVkIHVuZGVyIHRoYXQgc2NvcGUsIHJlY2xhaW1zIHRoZSBzY29wZSdzIG1hbmFnZWRcblx0ICogd29ya2luZyBkaXJlY3RvcnkuIERyaXZlbiBlbnRpcmVseSBieSB0aGUgcmVmIGNvdW50IHJlYWNoaW5nIHplcm8gXHUyMDE0XG5cdCAqIG5ldmVyIGJ5IHdoZXRoZXIgYGNoYXRgIGhhcHBlbnMgdG8gYmUgXCJ0aGUgZGVmYXVsdCBjaGF0XCIgb3IgYnkgYW5cblx0ICogQWdlbnQtSG9zdC1ndWFyYW50ZWVkIHRlYXJkb3duIG9yZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVsZWFzZUNvbmZpZ1Njb3BlSWZEb25lKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVzb3VyY2UgPSB0aGlzLl9jb25maWdTY29wZShjaGF0LCBjb250ZXh0KTtcblx0XHRpZiAodGhpcy5fdW50cmFja0NvbmZpZ1Njb3BlQ2hhdChjb25maWd1cmF0aW9uUmVzb3VyY2UsIGNoYXQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWNsYWltTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnlJZk5vdExpdmUoY29uZmlndXJhdGlvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkIHRoZSBjb25jcmV0ZSBob3N0IGNoYXQgVVJJIHRoYXQgYWRkcmVzc2VzIHRoaXMgcnVudGltZS5cblx0ICovXG5cdHByaXZhdGUgX3JlY29yZENoYXRUYXJnZXQoY2hhdDogVVJJLCBzZXNzaW9uVXJpOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uLmNoYXRDaGFubmVsID0gY2hhdDtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlDaGF0VXJpLnNldChjaGF0LnRvU3RyaW5nKCksIHNlc3Npb25JZCk7XG5cdH1cblxuXHQvLyAtLS0tIENoYXQgc3VyZmFjZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly9cblx0Ly8gQ29kZXggc3VwcG9ydHMgbXVsdGlwbGUgY2hhdHMgcGVyIHNlc3Npb24sIGFuZCBldmVyeSBvbmUgb2YgdGhlbSBcdTIwMTQgdGhlXG5cdC8vIGNoYXQgYSBzZXNzaW9uIGlzIHByb3Zpc2lvbmVkIHdpdGggYXMgbXVjaCBhcyBhbnkgbGF0ZXIgb25lLCBmcmVzaCBvclxuXHQvLyBmb3JrZWQgXHUyMDE0IGlzIGNyZWF0ZWQgdGhyb3VnaCB0aGUgb25lIGBjcmVhdGVDaGF0YCBzZWFtIGFuZCBiYWNrZWQgYnkgaXRzXG5cdC8vIG93biB0b3AtbGV2ZWwgQ29kZXggdGhyZWFkIGJvdW5kIHRvIHRoZSBjb25jcmV0ZSBjaGF0IFVSSSBBSCBzdXBwbGllcy5cblx0Ly8gV2hpbGUgdGhlIG93bmluZyBzZXNzaW9uIGhhcyBubyBiYWNraW5nIHlldCwgdGhlIGNoYXQncyBydW50aW1lIGFkb3B0cyB0aGVcblx0Ly8gc2Vzc2lvbidzIG93biBpZGVudGl0eSBzbyBldmVyeSBzZXNzaW9uLWFkZHJlc3NlZCBjYWxsIGtlZXBzIHJlc29sdmluZztcblx0Ly8gYW55IGZ1cnRoZXIgY2hhdCBpcyBpZGVudGlmaWVkIGJ5IHRoZSB0aHJlYWQgaXQgbWludHMgYW5kIHJlcG9ydHMgaXQgYXMgYVxuXHQvLyBgYmFja2luZ1Nlc3Npb25gIHNvIHRoZSBvcmNoZXN0cmF0b3Igc3VwcHJlc3NlcyBpdCBmcm9tIHRoZSB0b3AtbGV2ZWxcblx0Ly8gc2Vzc2lvbiBsaXN0LiBBZGRyZXNzZWQgb3BlcmF0aW9ucyByZXNvbHZlIG9ubHkgdGhyb3VnaCBhbiBleHBsaWNpdFxuXHQvLyBiaW5kaW5nIG9yIHRyYW5zaWVudCBob3N0IGNvbnRleHQuXG5cblx0LyoqXG5cdCAqIFRoZSBjaGF0LWFkZHJlc3NlZCBvcGVyYXRpb24gc3VyZmFjZSBmb3IgdGhlIGNvbnZlcnNhdGlvbnMgd2l0aGluIGFcblx0ICogc2Vzc2lvbi4gQ3JlYXRpb24gaXMgb25lIG1ldGhvZCBydW5uaW5nIG9uZSBhbGdvcml0aG1cblx0ICogKHtAbGluayBfY3JlYXRlQ2hhdH0pIGZvciBldmVyeSBmb3JtIFx1MjAxNCBmcmVzaCBvciBmb3JrZWRcblx0ICogKHtAbGluayBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucy5mb3JrfSksIGEgc2Vzc2lvbidzIGZpcnN0IGNoYXQgb3IgYW5cblx0ICogYWRkaXRpb25hbCBvbmUgXHUyMDE0IHNvIHRoZXJlIGlzIG5vIGNhbGxlci12aXNpYmxlIGNoYXQgY2xhc3NpZmljYXRpb24gYW5kIG5vXG5cdCAqIHNlY29uZCBjcmVhdGlvbiBlbnRyeSBwb2ludC4gVGhlIHJlbWFpbmluZyBtZXRob2RzIG9wZXJhdGUgb24gdGhlIGNvbmNyZXRlXG5cdCAqIGNoYXQgVVJJIEFIIGhhcyBhbHJlYWR5IGJvdW5kIHRvIGEgcnVudGltZS5cblx0ICovXG5cdHJlYWRvbmx5IGNoYXRzOiBJQWdlbnRDaGF0cyA9IHtcblx0XHRjcmVhdGVDaGF0OiAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ2hhdChjaGF0LCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KSwgb3B0aW9ucyk7XG5cdFx0fSxcblx0XHRkaXNwb3NlQ2hhdDogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHRoaXMuX2Rpc3Bvc2VDaGF0KGNoYXQsIGNvbnRleHQpLFxuXHRcdHJlbGVhc2VDaGF0OiAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4gdGhpcy5fcmVsZWFzZUNoYXQoY2hhdCwgY29udGV4dCksXG5cdFx0c2VuZE1lc3NhZ2U6IChjaGF0OiBVUkksIHByb21wdDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeTogcmVhZG9ubHkgVVJJW10gfCBVUkkgfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBfc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFR5cGVPckNvbnRleHQ/OiBBZ2VudEhvc3RDbGllbnRUeXBlIHwgVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gQXJyYXkuaXNBcnJheSh3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeSkgPyB3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeSA6IHdvcmtpbmdEaXJlY3Rvcmllc09yRGlyZWN0b3J5ID8gW3dvcmtpbmdEaXJlY3Rvcmllc09yRGlyZWN0b3J5XSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRleHQgPSBjb250ZXh0ID8/ICh0eXBlb2YgY2xpZW50VHlwZU9yQ29udGV4dCA9PT0gJ3N0cmluZycgPyB1bmRlZmluZWQgOiBjbGllbnRUeXBlT3JDb250ZXh0KTtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTWVzc2FnZShjaGF0LCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3Rvcmllcywgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0fSxcblx0XHRhYm9ydDogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9hYm9ydChjaGF0LCBjb250ZXh0KTtcblx0XHR9LFxuXHRcdGNoYW5nZU1vZGVsOiAoY2hhdDogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24sIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlTW9kZWwoY2hhdCwgbW9kZWwsIGNvbnRleHQpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlQWdlbnQ6IChjaGF0OiBVUkksIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHRoaXMuX2NoYW5nZUFnZW50KGNoYXQsIGFnZW50LCBjb250ZXh0KSxcblx0XHRnZXRNZXNzYWdlczogKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4gPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldENoYXRNZXNzYWdlcyhjaGF0LCBjb250ZXh0KTtcblx0XHR9LFxuXHR9O1xuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZUFnZW50KGNoYXQ6IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRleHQgPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gdGhpcy5fcmVzb2x2ZUNvbnZlcnNhdGlvblNlc3Npb24oY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0aWYgKCFzZXNzaW9uVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4IGNvbnZlcnNhdGlvbiBpcyBub3QgYm91bmQ6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKHNlc3Npb25VcmksIHsgYWdlbnQ6IGFnZW50ID8/IG51bGwgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb24uYWdlbnQgPSBhZ2VudDtcblx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKHNlc3Npb25VcmksIHsgYWdlbnQ6IGFnZW50ID8/IG51bGwgfSk7XG5cdFx0aWYgKHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24uZmlyc3RUdXJuU2VudCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzdGFydFRocmVhZFdpdGhDdXJyZW50VG9vbHMoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFya1Nlc3Npb25Gb3JSZWxvYWQoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNpbmdsZSBjcmVhdGlvbiBwYXRoIGZvciBldmVyeSBDb2RleCBjaGF0IChmcmVzaCBvciBmb3JrZWQsIGZpcnN0IG9yXG5cdCAqIGFkZGl0aW9uYWwpLiBSZWNvcmRzIHRoZSBjaGF0XHUyMTkyYmFja2luZyBiaW5kaW5nIGFzIHBhcnQgb2YgdGhpcyBjYWxsLCBub3Rcblx0ICogYXMgYSBmb2xsb3ctdXAgYXNzaWdubWVudC5cblx0ICpcblx0ICogSWRlbnRpdHkgb2YgdGhlIG5ldyBiYWNraW5nOiB3aGlsZSB0aGUgb3duaW5nIHNlc3Npb24gaGFzIG5vIGJhY2tpbmdcblx0ICogeWV0LCB0aGUgcnVudGltZSBhZG9wdHMgdGhlIHNlc3Npb24ncyBvd24gaWRlbnRpdHkgKGtlcHQgcHJvdmlzaW9uYWwsXG5cdCAqIHNlZSB7QGxpbmsgSUNvZGV4U2Vzc2lvbi50aHJlYWRJZH0pOyBvdGhlcndpc2UgaXQgaXMgaWRlbnRpZmllZCBieSB0aGVcblx0ICogdGhyZWFkIGl0IG1pbnRzIGFuZCBzdGFydGVkIGVhZ2VybHkuXG5cdCAqXG5cdCAqIEEgZnJlc2ggY3JlYXRlIChub3QgYSByZWJpbmQgb2YgYW4gYWxyZWFkeS1ib3VuZCBjaGF0KSBpcyB0cmFuc2FjdGlvbmFsOlxuXHQgKiBhIGZhaWx1cmUgYW55d2hlcmUgYWZ0ZXIgdGhlIGNvbmZpZy1zY29wZSByZWYgaXMgcmVnaXN0ZXJlZCBcdTIwMTQgaW1wb3J0XG5cdCAqIHJlamVjdGlvbiwgbW9kZWwgcmVzb2x1dGlvbiwgZm9yay9zdGFydC1iYWNraW5nLCB0aGUgZWFnZXIgYWN0aXZlLWNsaWVudFxuXHQgKiBzZWVkLCBvciB0aGUgc2VydmVyLXRvb2wgYWR2ZXJ0aXNlIFx1MjAxNCByb2xscyBiYWNrIGV2ZXJ5IGJpdCBvZiBzdGF0ZSB0aGF0XG5cdCAqIHN0ZXAgKG9yIGFuIGVhcmxpZXIgb25lIGluIHRoaXMgc2FtZSBjYWxsKSBtYXkgaGF2ZSBjb21taXR0ZWQ6IHRoZVxuXHQgKiBjb25maWctc2NvcGUgcmVmIGNvdW50IGFuZCBhbnkgbWFuYWdlZCB3b3JraW5nIGRpcmVjdG9yeSBpdCBhbG9uZSB3YXNcblx0ICoga2VlcGluZyBhbGl2ZSwgcGx1cywgb25jZSBhIHJ1bnRpbWUgd2FzIGFjdHVhbGx5IHJlZ2lzdGVyZWQsIHRoYXRcblx0ICogcnVudGltZSBpdHNlbGYsIGl0cyBhY3RpdmUtY2xpZW50IGhhbmRsZSwgYW5kIGl0cyB0aW1lcnMuIEEgY2FsbGVyIHRoYXRcblx0ICogcmV0cmllcyBhZnRlciBhIGZhaWxlZCBjcmVhdGUgbXVzdCBzZWUgYSBjbGVhbiBzbGF0ZSwgbmV2ZXIgYVxuXHQgKiBoYWxmLXJlZ2lzdGVyZWQgY2hhdCBwaWxpbmcgb250byB0aGUgbmV4dCBhdHRlbXB0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlQ2hhdChjaGF0OiBVUkksIGNvbnRleHQ6IElBZ2VudENoYXRDb250ZXh0LCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCB0YXJnZXQ6IElDb2RleFRhcmdldENoYXQgPSB7IHJlc291cmNlOiBjaGF0IH07XG5cdFx0Y29uc3Qgb3duaW5nU2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleCBERUJVR10gY3JlYXRlQ2hhdCBhY2NvdW50U3RhdHVzPSR7dGhpcy5fb3BlbkFJQWNjb3VudFN0YXRlLnN0YXR1c30gc2Vzc2lvbj0ke2NvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLnRvU3RyaW5nKCl9IGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9IG1vZGVsPSR7b3B0aW9ucz8ubW9kZWw/LmlkID8/ICcobm9uZSknfSBjd2Q9JHtvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXT8udG9TdHJpbmcoKSA/PyAnKG5vbmUpJ31gKTtcblxuXHRcdC8vIFJlZ2lzdGVyZWQgdXAgZnJvbnQgKGJvdGggdGhlIGZyZXNoLWNyZWF0ZSBhbmQgcmViaW5kIHBhdGhzIHJlYWNoXG5cdFx0Ly8gaGVyZSkgc28gdGhlIGNvbmZpZ3VyYXRpb24gc2NvcGUncyByZWYgY291bnQgYWx3YXlzIHJlZmxlY3RzIGV2ZXJ5XG5cdFx0Ly8gY2hhdCB0aGlzIGFnZW50IGhhcyBldmVyIGJvdW5kIHRvIGl0IHVudGlsIGBfZGlzcG9zZUNoYXRgIHVudHJhY2tzIGl0LlxuXHRcdHRoaXMuX3RyYWNrQ29uZmlnU2NvcGVDaGF0KGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLCBjaGF0KTtcblxuXHRcdC8vIEEgY3JlYXRlIGZvciBhIGNoYXQgdGhhdCBhbHJlYWR5IGhhcyBhIGJhY2tpbmcgXHUyMDE0IGEgd29ya2JlbmNoIHJlYmluZFxuXHRcdC8vIGFmdGVyIGEgY2hpcC1zZWxlY3Rpb24gY2hhbmdlLCBvciBhIHJldHJpZWQgY3JlYXRlLiBSZWZyZXNoIHRoZVxuXHRcdC8vIHJlc29sdmVkIG9wdGlvbnMgb250byB0aGF0IGJhY2tpbmcgYW5kIGhhbmQgaXQgYmFjaywgc28gYSBzZWNvbmRcblx0XHQvLyBjcmVhdGUgbmV2ZXIgbWludHMgYSB0aHJlYWQgdGhlIGZpcnN0IG9uZSBpcyBvcnBoYW5lZCBieS4gQSByZWJpbmRcblx0XHQvLyBmYWlsdXJlIGxlYXZlcyB0aGUgZXhpc3RpbmcgYmluZGluZyBleGFjdGx5IGFzIGl0IHdhcyBcdTIwMTQgdGhlIGNoYXQgd2FzXG5cdFx0Ly8gbmV2ZXIgbmV3LCBzbyB0aGVyZSBpcyBub3RoaW5nIGhlcmUgdG8gcm9sbCBiYWNrLlxuXHRcdGNvbnN0IGJvdW5kU2Vzc2lvbklkID0gdGhpcy5fc2Vzc2lvbklkQnlDaGF0VXJpLmdldChjaGF0LnRvU3RyaW5nKCkpO1xuXHRcdGlmIChib3VuZFNlc3Npb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmViaW5kQ2hhdChib3VuZFNlc3Npb25JZCwgY29udGV4dCwgdGFyZ2V0LCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gQ29kZXggaGFzIG5vIFNESy1sZXZlbCBjb252ZXJzYXRpb24taW1wb3J0IHByaW1pdGl2ZTogdW5saWtlIGZvcmtcblx0XHRcdC8vIChhIGB0aHJlYWQvZm9ya2Agb2YgYW4gZXhpc3RpbmcgdGhyZWFkKSwgdGhlcmUgaXMgbm8gd2F5IHRvIHNlZWQgYVxuXHRcdFx0Ly8gYnJhbmQtbmV3IHRocmVhZCdzIGhpc3RvcnkgZnJvbSBhcmJpdHJhcnkgY2FsbGVyLXN1cHBsaWVkIHR1cm5zLlxuXHRcdFx0Ly8gUmVqZWN0IGV4cGxpY2l0bHkgcmF0aGVyIHRoYW4gc2lsZW50bHkgZmFsbGluZyB0aHJvdWdoIHRvIGEgZnJlc2gsXG5cdFx0XHQvLyBlbXB0eSBjaGF0IGFuZCBkcm9wcGluZyB0aGUgaW1wb3J0ZWQgdHVybnMuXG5cdFx0XHRpZiAob3B0aW9ucz8uaW1wb3J0Q29udmVyc2F0aW9uKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29kZXggZG9lcyBub3Qgc3VwcG9ydCBpbXBvcnRpbmcgYW4gZXhpc3RpbmcgY29udmVyc2F0aW9uIGludG8gYSBuZXcgY2hhdC4nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUG9wdWxhdGUgdGhlIGNhdGFsb2cgYmVmb3JlIGFueSBwYXRoIHZhbGlkYXRlcyBhIG1vZGVsIHNlbGVjdGlvbiwgc29cblx0XHRcdC8vIGEgbW9kZWwgcGlja2VkIGJlZm9yZSBtb2RlbHMgZmluaXNoZWQgbG9hZGluZyBpc24ndCBkcm9wcGVkLlxuXHRcdFx0aWYgKHRoaXMuX21vZGVscy5nZXQoKS5sZW5ndGggPT09IDAgJiYgdGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbW9kZWxzUmVmcmVzaFByb21pc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhZG9wdGVkU2Vzc2lvbklkID0gdGhpcy5faGFzU2Vzc2lvbkJhY2tpbmcob3duaW5nU2Vzc2lvbklkKSA/IHVuZGVmaW5lZCA6IG93bmluZ1Nlc3Npb25JZDtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBvcHRpb25zPy5mb3JrXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5fZm9ya0NoYXRCYWNraW5nKG9wdGlvbnMuZm9yaywgb3B0aW9ucywgYWRvcHRlZFNlc3Npb25JZCwgdGFyZ2V0KVxuXHRcdFx0XHQ6IGFkb3B0ZWRTZXNzaW9uSWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gdGhpcy5fZGVmZXJDaGF0QmFja2luZyhhZG9wdGVkU2Vzc2lvbklkLCBvcHRpb25zLCB0YXJnZXQpXG5cdFx0XHRcdFx0OiBhd2FpdCB0aGlzLl9zdGFydENoYXRCYWNraW5nKGNvbnRleHQsIG9wdGlvbnMsIHRhcmdldCk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFNlZWQgdGhlIGVhZ2VyIGFjdGl2ZSBjbGllbnQgb3ZlciB0aGUgZXhhY3QgY2hhdCB0aGlzIGNhbGwgYmluZHNcblx0XHRcdFx0Ly8gXHUyMDE0IHRoZSBhZ2VudCBuZXZlciBpbnZlbnRzIGEgY2hhdCBVUkkgdG8gc3RhbmQgaW4gZm9yIGl0IFx1MjAxNCBiZWZvcmVcblx0XHRcdFx0Ly8gdGhlIHByZXdhcm0gYmVsb3cgcmVhZHMgdGhlIGNsaWVudCdzIHRvb2xzIGludG8gYSBgdGhyZWFkL3N0YXJ0YC5cblx0XHRcdFx0YXdhaXQgdGhpcy5fc2VlZEVhZ2VyQWN0aXZlQ2xpZW50KHNlc3Npb24uc2Vzc2lvblVyaSwgY2hhdCwgY29udGV4dCwgb3B0aW9ucz8uYWN0aXZlQ2xpZW50KTtcblx0XHRcdFx0aWYgKHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlUHJld2FybShzZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTZXJ2ZXIgdG9vbHMgYXJlIHNlc3Npb24tc2NvcGVkLCBzbyB0aGV5IGFyZSBhZHZlcnRpc2VkIG9uIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9uIEFnZW50IEhvc3QgYWRkcmVzc2VkIFx1MjAxNCB0aGUgb25seSBVUkkgaXQga25vd3MgdGhpcyBjaGF0IGJ5LlxuXHRcdFx0XHRpZiAoIXNlc3Npb24uc2VydmVyVG9vbHNBZHZlcnRpc2VkICYmIHRoaXMuX3NlcnZlclRvb2xIb3N0KSB7XG5cdFx0XHRcdFx0c2Vzc2lvbi5zZXJ2ZXJUb29sc0FkdmVydGlzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0LmFkdmVydGlzZShjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdC8vIFRoZSBiYWNraW5nIChhbmQsIGlmIHRoaXMgd2FzIGl0cyBhZG9wdGVkIGlkZW50aXR5LCB0aGUgc2Vzc2lvblxuXHRcdFx0XHQvLyBpdHNlbGYpIGlzIGFscmVhZHkgcmVnaXN0ZXJlZCBhdCB0aGlzIHBvaW50IFx1MjAxNCB1bmRvIGl0IGV4YWN0bHkgYXNcblx0XHRcdFx0Ly8gYSBkZXN0cnVjdGl2ZSBkaXNwb3NlIHdvdWxkLCBzbyBub3RoaW5nIGl0IGNyZWF0ZWQgb3V0bGl2ZXMgdGhpc1xuXHRcdFx0XHQvLyBmYWlsZWQgY2FsbC5cblx0XHRcdFx0YXdhaXQgdGhpcy5fcm9sbGJhY2tSZWdpc3RlcmVkQ2hhdENyZWF0aW9uKHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gY3JlYXRlZCBjaGF0ICR7Y2hhdC50b1N0cmluZygpfSBiYWNrZWQgYnkgJHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gdGhyZWFkPSR7c2Vzc2lvbi50aHJlYWRJZCA/PyAnKGRlZmVycmVkKSd9IChzZXNzaW9uICR7Y29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKX0pYCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ2hhdFJlc3VsdChjb250ZXh0LCBzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlbGVhc2VDb25maWdTY29wZUlmRG9uZShjaGF0LCBjb250ZXh0KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVW5kbyBhIHJ1bnRpbWUgdGhpcyBzYW1lIHtAbGluayBfY3JlYXRlQ2hhdH0gY2FsbCBqdXN0IHJlZ2lzdGVyZWQsIG9uY2Vcblx0ICogYSBsYXRlciBzdGVwIGluIHRoYXQgY2FsbCAodGhlIGVhZ2VyIGFjdGl2ZS1jbGllbnQgc2VlZCBvciB0aGVcblx0ICogc2VydmVyLXRvb2wgYWR2ZXJ0aXNlKSBmYWlscy4gTWlycm9ycyB0aGUgZGVzdHJ1Y3RpdmVcblx0ICoge0BsaW5rIF9kaXNwb3NlQ2hhdH0gcGF0aCBleGFjdGx5IFx1MjAxNCBzYW1lIGFjdGl2ZS1jbGllbnQgaGFuZGxlIHJlbW92YWwsXG5cdCAqIHNhbWUge0BsaW5rIF90ZWFyZG93blNlc3Npb25Jbk1lbW9yeX0gdGVhcmRvd24gKHBlbmRpbmcgcmVnaXN0cmllcyxcblx0ICogTUNQIGNvbnRyb2xsZXIsIHRpbWVycywgbWFuYWdlZCB3b3JraW5nIGRpcmVjdG9yeSwgT1RlbCB0cmFjZSBjb250ZXh0KVxuXHQgKiBcdTIwMTQgYmVjYXVzZSBhIHJ1bnRpbWUgYSBmYWlsZWQgY3JlYXRlIGxlYXZlcyBiZWhpbmQgaXMgaW5kaXN0aW5ndWlzaGFibGVcblx0ICogZnJvbSBvbmUgYSBjYWxsZXIgY3JlYXRlZCBhbmQgaW1tZWRpYXRlbHkgZGlzcG9zZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yb2xsYmFja1JlZ2lzdGVyZWRDaGF0Q3JlYXRpb24oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVtb3ZlQWN0aXZlQ2xpZW50SGFuZGxlc0ZvckNoYXQoY2hhdCk7XG5cdFx0YXdhaXQgdGhpcy5fdGVhcmRvd25TZXNzaW9uSW5NZW1vcnkoc2Vzc2lvbiwgc2Vzc2lvbi5zZXNzaW9uSWQsIHRydWUpO1xuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5Q2hhdFVyaS5kZWxldGUoY2hhdC50b1N0cmluZygpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kIGJhY2sgdGhlIGJhY2tpbmcgYWxyZWFkeSBib3VuZCB0byBhIGNoYXQsIHJlZnJlc2hlZCB3aXRoIHRoZVxuXHQgKiBjYWxsZXIncyByZXNvbHZlZCBvcHRpb25zLiBDcmVhdGlvbiBpcyBpZGVtcG90ZW50OiBhIHNlY29uZCBjcmVhdGUgZm9yIGFuXG5cdCAqIGFscmVhZHktYm91bmQgY2hhdCBtdXN0IG5laXRoZXIgbWludCBhIHNlY29uZCB0aHJlYWQgbm9yIGxlYXZlIHRoZVxuXHQgKiBydW50aW1lIHVuYm91bmQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWJpbmRDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCwgdGFyZ2V0OiBJQ29kZXhUYXJnZXRDaGF0LCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghZXhpc3RpbmcpIHtcblx0XHRcdC8vIFRoZSBydW50aW1lIHdhcyByZWxlYXNlZCBcdTIwMTQgYSByZWxlYXNlIGlzIG5vbi1kZXN0cnVjdGl2ZSBhbmQga2VlcHNcblx0XHRcdC8vIHRoZSBiaW5kaW5nIFx1MjAxNCBzbyBpdHMgZHVyYWJsZSBiYWNraW5nIGlzIHVudG91Y2hlZC4gUmVwb3J0IHRoYXRcblx0XHRcdC8vIGJhY2tpbmcgdW5jaGFuZ2VkIGFuZCBsZXQgYG1hdGVyaWFsaXplQ2hhdGAgcmUtYXR0YWNoIGl0LlxuXHRcdFx0Y29uc3QgYmFja2luZ1Nlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3JlbGVhc2VkTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcmllcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLihpc0VxdWFsKGJhY2tpbmdTZXNzaW9uLCBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgPyB7fSA6IHsgYmFja2luZ1Nlc3Npb24gfSksXG5cdFx0XHRcdHByb3ZpZGVyRGF0YTogZW5jb2RlQ29kZXhDaGF0KHtcblx0XHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdFx0Li4uKG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID8geyBvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IHRydWUgfSA6IHt9KSxcblx0XHRcdFx0fSksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucz8ubW9kZWwpIHtcblx0XHRcdGV4aXN0aW5nLm1vZGVsID0gdGhpcy5fcmVzb2x2ZUNyZWF0aW9uTW9kZWwob3B0aW9ucy5tb2RlbCkgPz8gZXhpc3RpbmcubW9kZWw7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5hZ2VudCkge1xuXHRcdFx0ZXhpc3RpbmcuYWdlbnQgPSBvcHRpb25zLmFnZW50O1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvcmRDaGF0VGFyZ2V0KHRhcmdldC5yZXNvdXJjZSwgZXhpc3Rpbmcuc2Vzc2lvblVyaSk7XG5cdFx0YXdhaXQgdGhpcy5fc2VlZEVhZ2VyQWN0aXZlQ2xpZW50KGV4aXN0aW5nLnNlc3Npb25VcmksIHRhcmdldC5yZXNvdXJjZSwgY29udGV4dCwgb3B0aW9ucz8uYWN0aXZlQ2xpZW50KTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ2hhdFJlc3VsdChjb250ZXh0LCBleGlzdGluZyk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHJ1bnRpbWUgYWxyZWFkeSBiYWNrcyBgc2Vzc2lvbklkYCBcdTIwMTQgbGl2ZSwgb3IgcmVsZWFzZWQgYnV0IHN0aWxsXG5cdCAqIGJvdW5kIHRvIGEgY2hhdC4gQSBjcmVhdGlvbiBhZG9wdHMgdGhlIG93bmluZyBzZXNzaW9uJ3MgaWRlbnRpdHkgb25seVxuXHQgKiB3aGlsZSBpdCBpcyBmcmVlOyBldmVyeSBsYXRlciBjaGF0IG1pbnRzIGEgYmFja2luZyB0aHJlYWQgb2YgaXRzIG93bi5cblx0ICovXG5cdHByaXZhdGUgX2hhc1Nlc3Npb25CYWNraW5nKHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBib3VuZFNlc3Npb25JZCBvZiB0aGlzLl9zZXNzaW9uSWRCeUNoYXRVcmkudmFsdWVzKCkpIHtcblx0XHRcdGlmIChib3VuZFNlc3Npb25JZCA9PT0gc2Vzc2lvbklkKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgbW9kZWwgYSBjcmVhdGlvbiBydW5zIHdpdGg6IHRoZSBjYWxsZXIncyBleHBsaWNpdCBzZWxlY3Rpb25cblx0ICogd2hlbiB0aGUgY2F0YWxvZyBrbm93cyBpdCwgZWxzZSB0aGUgYGZhbGxiYWNrYCBhIGZvcmtlZCBjaGF0IGluaGVyaXRzXG5cdCAqIGZyb20gaXRzIHNvdXJjZSwgZWxzZSBDb2RleCdzIGRlZmF1bHQuIEFuIGV4cGxpY2l0bHkgcmVxdWVzdGVkIG1vZGVsIHRoZVxuXHQgKiBjYXRhbG9nIGRvZXMgbm90IGtub3cgaXMgcmVqZWN0ZWQgcmF0aGVyIHRoYW4gc2lsZW50bHkgcmVwbGFjZWQsIGFuZCB0aGVcblx0ICogcmVzb2x2ZWQgbW9kZWwncyBwcm92aWRlciBtdXN0IGJlIGF1dGhlbnRpY2F0ZWQgYmVmb3JlIGFueSB0aHJlYWQgd29yay5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVDcmVhdGlvbk1vZGVsKHJlcXVlc3RlZDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGZhbGxiYWNrPzogTW9kZWxTZWxlY3Rpb24pOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gcmVxdWVzdGVkID8/IGZhbGxiYWNrO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc3VwcG9ydGVkTW9kZWxPclVuZGVmaW5lZChzZWxlY3Rpb24pO1xuXHRcdGlmIChzZWxlY3Rpb24gJiYgIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4IG1vZGVsICcke3NlbGVjdGlvbi5pZH0nIGlzIG5vdCBhdmFpbGFibGUuYCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Vuc3VyZU1vZGVsUHJvdmlkZXJBdXRoZW50aWNhdGVkKG1vZGVsKTtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHQvKipcblx0ICogRGVzY3JpYmUgdGhlIGV4YWN0IGJhY2tpbmcgdGhpcyBjcmVhdGlvbiBib3VuZCB0byB0aGUgY2hhdC5cblx0ICpcblx0ICogYGJhY2tpbmdTZXNzaW9uYCBuYW1lcyB0aGUgYXBwLXNlcnZlciB0aHJlYWQgd2hlbmV2ZXIgdGhhdCB0aHJlYWQgaXMgYVxuXHQgKiByZWNvcmQgb2YgaXRzIG93biwgc28gdGhlIG9yY2hlc3RyYXRvciBjYW4gc3VwcHJlc3MgaXQgZnJvbSB0aGUgdG9wLWxldmVsXG5cdCAqIHNlc3Npb24gbGlzdDsgdGhlIHNlc3Npb24ncyBvd24gcmVjb3JkIGlzIG5ldmVyIHJlcG9ydGVkIGFzIGFuIGludGVybmFsXG5cdCAqIGNoYXQgYmFja2luZywgc2luY2UgdGhhdCBtYXJrZXIgd291bGQgaGlkZSB0aGUgc2Vzc2lvbiBpdHNlbGYuIFRoZVxuXHQgKiByZXN1bHQgbmV2ZXIgcmVwb3J0cyB3aGljaCBpZGVudGl0eSB0aGUgYmFja2luZyBhZG9wdGVkIFx1MjAxNCB0aGVcblx0ICogb3JjaGVzdHJhdG9yIGFscmVhZHkgb3ducyB0aGF0IHNlc3Npb24gVVJJIGFuZCBuZXZlciBuZWVkcyBpdCBlY2hvZWRcblx0ICogYmFjay5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZUNoYXRSZXN1bHQoY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQsIHNlc3Npb246IElDb2RleFNlc3Npb24pOiBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHtcblx0XHRjb25zdCBiYWNraW5nU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbi50aHJlYWRJZCA/PyBzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgbWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPSBzZXNzaW9uLm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID8/IHRoaXMuX3JlbGVhc2VkTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcmllcy5nZXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4oc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8geyByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSB9IDoge30pLFxuXHRcdFx0Li4uKHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCA/IHsgcHJvdmlzaW9uYWw6IHRydWUgfSA6IHt9KSxcblx0XHRcdC4uLihpc0VxdWFsKGJhY2tpbmdTZXNzaW9uLCBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgPyB7fSA6IHsgYmFja2luZ1Nlc3Npb24gfSksXG5cdFx0XHRwcm92aWRlckRhdGE6IGVuY29kZUNvZGV4Q2hhdCh7XG5cdFx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHRcdC4uLihzZXNzaW9uLm1vZGVsID8geyBtb2RlbDogc2Vzc2lvbi5tb2RlbCB9IDoge30pLFxuXHRcdFx0XHQuLi4obWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPyB7IG93bnNNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdHJ1ZSB9IDoge30pLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIGJhY2tpbmcgd2hvc2UgY29kZXggdGhyZWFkIGlzIGRlZmVycmVkIChzZWVcblx0ICoge0BsaW5rIElDb2RleFNlc3Npb24udGhyZWFkSWR9IGZvciB3aHkpLiBgdGhyZWFkL3N0YXJ0YCBoYXBwZW5zIG9uXG5cdCAqIHByZXdhcm0sIHRoZSBmaXJzdCBgc2VuZE1lc3NhZ2VgLCBvciBgZ2V0Q2hhdE1ldGFkYXRhYCBmb3IgcmVzdG9yZSBcdTIwMTQgYnlcblx0ICogd2hpY2ggcG9pbnQgYSBtYW5hZ2VkIHRlbXAgZm9sZGVyIGNhbiBiZSBjcmVhdGVkIGxhemlseSBpZiB0aGUgY2xpZW50XG5cdCAqIGdhdmUgbm8gd29ya2luZyBkaXJlY3RvcnksIGluc3RlYWQgb2YgcmVqZWN0aW5nIHRoZSBjcmVhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2RlZmVyQ2hhdEJhY2tpbmcoc2Vzc2lvbklkOiBzdHJpbmcsIG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIHwgdW5kZWZpbmVkLCB0YXJnZXQ6IElDb2RleFRhcmdldENoYXQpOiBJQ29kZXhTZXNzaW9uIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Jlc29sdmVDcmVhdGlvbk1vZGVsKG9wdGlvbnM/Lm1vZGVsKTtcblx0XHRjb25zdCBtdWx0aVJvb3RFbmFibGVkID0gdGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gbXVsdGlSb290RW5hYmxlZCAmJiAob3B0aW9ucz8ud29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGggPz8gMCkgPiAxXG5cdFx0XHQ/IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKG9wdGlvbnM/LndvcmtpbmdEaXJlY3Rvcmllcylcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNsaWVudFRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiA9IHtcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHRocmVhZElkOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVXJpOiBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCksXG5cdFx0XHRzdGFydFRpbWU6IG5vdyxcblx0XHRcdG1vZGlmaWVkVGltZTogbm93LFxuXHRcdFx0c3VtbWFyeTogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhdENoYW5uZWw6IHRhcmdldC5yZXNvdXJjZSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG9wdGlvbnM/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0bXVsdGlSb290RW5hYmxlZCxcblx0XHRcdG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiB1bmRlZmluZWQsXG5cdFx0XHRtYXBTdGF0ZTogY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUodGhpcy5faG9zdFNlcnZlclRvb2xOYW1lcygpLCBjbGllbnRUb29sU2V0KSxcblx0XHRcdHBlbmRpbmdDb21tYW5kQXBwcm92YWxzOiBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDb21tYW5kRXhlY3V0aW9uQXBwcm92YWxEZWNpc2lvbj4oKSxcblx0XHRcdGFjY2VwdGVkRm9yU2Vzc2lvbjogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRoYW5kbGVkR3VhcmRpYW5SZXZpZXdzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdHBlbmRpbmdHdWFyZGlhblJldmlld0NhcmRzOiBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdHBlbmRpbmdTdGVlcmluZ0ZsaXBzOiBuZXcgTWFwPHN0cmluZywgUGVuZGluZ01lc3NhZ2U+KCksXG5cdFx0XHRjbGllbnRUb29sU2V0LFxuXHRcdFx0cGVuZGluZ0NsaWVudFRvb2xDYWxsczogbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8VG9vbENhbGxSZXN1bHQ+KCksXG5cdFx0XHRwZW5kaW5nVXNlcklucHV0czogbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8SUNvZGV4VXNlcklucHV0UmVzdWx0PigpLFxuXHRcdFx0bWF0ZXJpYWxpemVkVG9vbHNTaWc6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZE1jcFNpZzogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkQ3VzdG9taXphdGlvbnNTaWc6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZFBlcm1pc3Npb25zU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRmaXJzdFR1cm5TZW50OiBmYWxzZSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0YWdlbnQ6IG9wdGlvbnM/LmFnZW50LFxuXHRcdFx0Y3VzdG9taXphdGlvbkRpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHVyblN0b3BXYXRjaDogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudEFwcFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0aG9zdFR1cm5JZEJ5QXBwVHVybklkOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLFxuXHRcdFx0Y29kZXhUdXJuSWRCeUhvc3RUdXJuSWQ6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCksXG5cdFx0XHRuZWVkc1Jlc3VtZTogZmFsc2UsXG5cdFx0XHR1bnN1YnNjcmliZUJlZm9yZVJlc3VtZTogZmFsc2UsXG5cdFx0XHRyZXN1bWVQcm9taXNlOiB1bmRlZmluZWQsXG5cdFx0XHRsYXN0UHJvbXB0VGV4dDogJycsXG5cdFx0XHRkaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRtYXRlcmlhbGl6ZVByb21pc2U6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZEV2ZW50RmlyZWQ6IGZhbHNlLFxuXHRcdFx0cHJld2FybVRpbWVyOiB1bmRlZmluZWQsXG5cdFx0XHRwcmV3YXJtQ2xhaW1lZDogZmFsc2UsXG5cdFx0XHRzZXJ2ZXJUb29sc0FkdmVydGlzZWQ6IGZhbHNlLFxuXHRcdFx0bWNwQ29udHJvbGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50Q3VzdG9taXphdGlvbnM6IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpLFxuXHRcdH07XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgc2Vzc2lvbik7XG5cdFx0Ly8gUmVjb3JkIHRoZSBleGFjdC1jaGF0IGJpbmRpbmcgYXMgcGFydCBvZiByZWdpc3RyYXRpb24sIHNvIHRoZSBydW50aW1lXG5cdFx0Ly8gaXMgbmV2ZXIgb2JzZXJ2YWJseSB1bmJvdW5kIGJldHdlZW4gY29uc3RydWN0aW9uIGFuZCBhIGNhbGxlciBhd2FpdGluZ1xuXHRcdC8vIHRoZSBjcmVhdGUgcmVzdWx0LlxuXHRcdHRoaXMuX3Nlc3Npb25JZEJ5Q2hhdFVyaS5zZXQodGFyZ2V0LnJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnQgYSBiYWNraW5nIHRocmVhZCBub3cgYW5kIHJlZ2lzdGVyIHRoZSBydW50aW1lIGl0IGlkZW50aWZpZXMuIFVzZWRcblx0ICogd2hlbiB0aGUgb3duaW5nIHNlc3Npb24ncyBpZGVudGl0eSBpcyBhbHJlYWR5IHRha2VuOiB0aGUgbmV3IGNoYXQgaXMgYVxuXHQgKiB0b3AtbGV2ZWwgY29kZXggdGhyZWFkIG9mIGl0cyBvd24gKHNlc3Npb24gaWQgPT0gdGhyZWFkIGlkKSwgc28gdGhlXG5cdCAqIHRocmVhZCBoYXMgdG8gZXhpc3QgYmVmb3JlIHRoZSBjcmVhdGlvbiBjYW4gbmFtZSBpdCBhcyB0aGUgY2hhdCdzIGV4YWN0XG5cdCAqIGJhY2tpbmcuIEl0IHJ1bnMgaW4gdGhlIGhvc3QtcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnksIG9yIGluIGEgbWFuYWdlZFxuXHQgKiB0ZW1wIGZvbGRlciB3aGVuIHRoZSBzZXNzaW9uIGhhcyBub25lLCBhbmQgaW5oZXJpdHMgbm90aGluZyBmcm9tIHRoZVxuXHQgKiBwYXJlbnQgc2Vzc2lvbiBiZXlvbmQgdGhlIHJlc29sdmVkIG9wdGlvbnMgYW5kIGl0cyBsaXZlIGFjdGl2ZSBjbGllbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRDaGF0QmFja2luZyhjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCwgb3B0aW9uczogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMgfCB1bmRlZmluZWQsIHRhcmdldDogSUNvZGV4VGFyZ2V0Q2hhdCk6IFByb21pc2U8SUNvZGV4U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IG93bmluZ1Nlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9yZXNvbHZlQ3JlYXRpb25Nb2RlbChvcHRpb25zPy5tb2RlbCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb2RleCBoYXMgbm8gYXZhaWxhYmxlIG1vZGVscy4nKTtcblx0XHR9XG5cdFx0Y29uc3QgaG9zdFdvcmtpbmdEaXJlY3RvcnkgPSBvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRjb25zdCBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IGhvc3RXb3JraW5nRGlyZWN0b3J5XG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiBhd2FpdCB0aGlzLl9jcmVhdGVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeShgY2hhdC0ke2dlbmVyYXRlVXVpZCgpfWApO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBob3N0V29ya2luZ0RpcmVjdG9yeSA/PyBtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvZGV4XSBjcmVhdGVDaGF0OiBmYWlsZWQgdG8gcmVzb2x2ZSBhIHdvcmtpbmcgZGlyZWN0b3J5IGZvciBzZXNzaW9uICR7Y29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gUGVybWlzc2lvbnMgYW5kIHNldHRpbmdzIGNvbWUgZnJvbSB0aGUgb3JjaGVzdHJhdG9yLXN1cHBsaWVkXG5cdFx0XHQvLyBjb25maWcsIG5ldmVyIHJlYWQgYmFjayBmcm9tIHRoZSBvd25pbmcgc2Vzc2lvbidzIG93biBzdGF0ZS5cblx0XHRcdGNvbnN0IHJlc29sdmVkQ29uZmlnID0gb3B0aW9ucz8uY29uZmlnID8/IHt9O1xuXHRcdFx0Y29uc3QgcGVybWlzc2lvbkRlZmF1bHRzID0gdGhpcy5fcGVybWlzc2lvbkF4aXNEZWZhdWx0cygpO1xuXHRcdFx0Y29uc3QgeyBhcHByb3ZhbFBvbGljeSwgc2FuZGJveE1vZGUsIGFwcHJvdmFsc1Jldmlld2VyIH0gPSByZXNvbHZlQ29kZXhQZXJtaXNzaW9ucyhcblx0XHRcdFx0bWlncmF0ZUNvZGV4UGVybWlzc2lvblZhbHVlcyhyZXNvbHZlZENvbmZpZywgcGVybWlzc2lvbkRlZmF1bHRzKSxcblx0XHRcdFx0cGVybWlzc2lvbkRlZmF1bHRzLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gQSBzY3JhdGNoIGVudHJ5IChuZXZlciByZWdpc3RlcmVkKSBsZXRzIHRoZSBNQ1AvZHluYW1pYy10b29sIGhlbHBlcnNcblx0XHRcdC8vIGNvbXB1dGUgdGhlIHRocmVhZC9zdGFydCBwYXJhbXMgd2hpbGUgdGhlIG5ldyBjaGF0J3Mgb3duIGNsaWVudCBzdGF0ZVxuXHRcdFx0Ly8gaXMgZW1wdHk7IHRoZXkgcmVhZCByb290IGNvbmZpZyArIHNlcnZlciB0b29scywgbm90IHNlc3Npb24gY29uZmlnLlxuXHRcdFx0Y29uc3Qgc2NyYXRjaCA9IHRoaXMuX2NyZWF0ZVJlc3VtZWRTZXNzaW9uRW50cnkob3duaW5nU2Vzc2lvbklkLCAnJywgd29ya2luZ0RpcmVjdG9yeSwgbW9kZWwsIHRhcmdldCk7XG5cdFx0XHRjb25zdCBtY3BTZXJ2ZXJzID0gdGhpcy5fYnVpbGRTZXNzaW9uTWNwU2VydmVycyhzY3JhdGNoKTtcblx0XHRcdGNvbnN0IGR5bmFtaWNUb29scyA9IHRoaXMuX2J1aWxkRHluYW1pY1Rvb2xzKHNjcmF0Y2gpO1xuXHRcdFx0Y29uc3QgdmFsaWRhdGVkQ29uZmlnID0gY29kZXhTZXNzaW9uQ29uZmlnU2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHJlc29sdmVkQ29uZmlnLCBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyk7XG5cdFx0XHRjb25zdCB0aHJlYWRDb25maWc6IFJlY29yZDxzdHJpbmcsIEpzb25WYWx1ZT4gPSB7XG5cdFx0XHRcdHdlYl9zZWFyY2g6IG5hcnJvd1dlYlNlYXJjaE1vZGUodmFsaWRhdGVkQ29uZmlnW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5XZWJTZWFyY2hNb2RlXSkgPz8gY29kZXhTZXNzaW9uQ29uZmlnRGVmYXVsdHNbQ29kZXhTZXNzaW9uQ29uZmlnS2V5LldlYlNlYXJjaE1vZGVdLFxuXHRcdFx0XHRbQ09ERVhfQVBQTFlfUEFUQ0hfU1RSRUFNSU5HX0ZFQVRVUkVdOiB0cnVlLFxuXHRcdFx0fTtcblx0XHRcdGlmIChPYmplY3Qua2V5cyhtY3BTZXJ2ZXJzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRocmVhZENvbmZpZy5tY3Bfc2VydmVycyA9IG1jcFNlcnZlcnMgYXMgSnNvblZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbCA9IHRoaXMuX3JvdXRlQ29kZXhNb2RlbChtb2RlbCk7XG5cdFx0XHRjb25zdCBzdGFydFJlc3VsdCA9IGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9zdGFydCcsIHsgdGhyZWFkOiB7IGlkOiBzdHJpbmcgfSB9PigndGhyZWFkL3N0YXJ0Jywge1xuXHRcdFx0XHRjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0XHRtb2RlbDogcmVzb2x2ZWRNb2RlbC5tb2RlbElkLFxuXHRcdFx0XHRtb2RlbFByb3ZpZGVyOiByZXNvbHZlZE1vZGVsLm1vZGVsUHJvdmlkZXIsXG5cdFx0XHRcdGFwcHJvdmFsUG9saWN5LFxuXHRcdFx0XHRzYW5kYm94OiBzYW5kYm94TW9kZSxcblx0XHRcdFx0YXBwcm92YWxzUmV2aWV3ZXIsXG5cdFx0XHRcdGNvbmZpZzogdGhyZWFkQ29uZmlnLFxuXHRcdFx0XHRkeW5hbWljVG9vbHMsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRocmVhZElkID0gc3RhcnRSZXN1bHQudGhyZWFkLmlkO1xuXG5cdFx0XHQvLyBUaGUgZnJlc2hseSBzdGFydGVkIHRocmVhZCBpcyBsaXZlIGFuZCBzdWJzY3JpYmVkLCBzbyBidWlsZCBhXG5cdFx0XHQvLyBtYXRlcmlhbGl6ZWQgKG5vdCByZXN1bWVkKSBlbnRyeSBrZXllZCBieSB0aGUgdGhyZWFkIGlkLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZVJlc3VtZWRTZXNzaW9uRW50cnkodGhyZWFkSWQsIHRocmVhZElkLCB3b3JraW5nRGlyZWN0b3J5LCBtb2RlbCwgdGFyZ2V0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgb3B0aW9ucz8uYWdlbnQpO1xuXHRcdFx0c2Vzc2lvbi5uZWVkc1Jlc3VtZSA9IGZhbHNlO1xuXHRcdFx0c2Vzc2lvbi5maXJzdFR1cm5TZW50ID0gZmFsc2U7XG5cdFx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZEV2ZW50RmlyZWQgPSBmYWxzZTtcblx0XHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkTWNwU2lnID0gbWNwU2VydmVyc1NpZ25hdHVyZShtY3BTZXJ2ZXJzKTtcblx0XHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkVG9vbHNTaWcgPSB0b29sc1NpZ25hdHVyZShzZXNzaW9uLmNsaWVudFRvb2xTZXQubWVyZ2VkKCkpO1xuXHRcdFx0c2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHRocmVhZElkLCBzZXNzaW9uKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25JZEJ5VGhyZWFkSWQuc2V0KHRocmVhZElkLCB0aHJlYWRJZCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uSWRCeUNoYXRVcmkuc2V0KHRhcmdldC5yZXNvdXJjZS50b1N0cmluZygpLCB0aHJlYWRJZCk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmUtYXR0YWNoIGEgY2hhdCdzIGJhY2tpbmcgdGhyZWFkIG9uIHJlc3RvcmUuIFRoZSBvcmNoZXN0cmF0b3Jcblx0ICogaGFuZHMgYmFjayB0aGUgb3BhcXVlIGBwcm92aWRlckRhdGFgIHByb2R1Y2VkIGJ5XG5cdCAqIHtAbGluayBfY3JlYXRlQ2hhdH07IHdlIHJlYnVpbGQgYSByZXN1bWFibGUgc2Vzc2lvbiBlbnRyeSBrZXllZFxuXHQgKiBieSB0aGUgYmFja2luZyB0aHJlYWQgaWQgYW5kIGJpbmQgaXQgdG8gdGhlIGNoYXQgVVJJIGJlZm9yZSBpdHMgaGlzdG9yeSBpc1xuXHQgKiByZWFkLiBJdHMgZmlyc3Qgc2VuZCBpc3N1ZXMgYSBgdGhyZWFkL3Jlc3VtZWAuXG5cdCAqL1xuXHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IHRhcmdldDogSUNvZGV4VGFyZ2V0Q2hhdCA9IHsgcmVzb3VyY2U6IGNoYXQgfTtcblx0XHRsZXQgZGVjb2RlZDogSUNvZGV4UGVyc2lzdGVkQ2hhdCB8IHVuZGVmaW5lZDtcblx0XHRpZiAocHJvdmlkZXJEYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICghaXNEZWZhdWx0Q2hhdFVyaShjaGF0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkZWNvZGVkID0geyBzZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChvcGVyYXRpb25Db250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVjb2RlZCA9IGRlY29kZUNvZGV4Q2hhdChwcm92aWRlckRhdGEpO1xuXHRcdFx0aWYgKCFkZWNvZGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBtYXRlcmlhbGl6ZUNoYXQ6IGRyb3BwaW5nIGNvcnJ1cHQgcHJvdmlkZXJEYXRhIGZvciAke2NoYXQudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl90cmFja0NvbmZpZ1Njb3BlQ2hhdChvcGVyYXRpb25Db250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZGVjb2RlZC5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLmNoYXRDaGFubmVsID0gY2hhdDtcblx0XHRcdHRoaXMuX3Nlc3Npb25JZEJ5Q2hhdFVyaS5zZXQoY2hhdC50b1N0cmluZygpLCBleGlzdGluZy5zZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyRGF0YSA9PT0gdW5kZWZpbmVkID8geyBwcm92aWRlckRhdGE6IGVuY29kZUNvZGV4Q2hhdChkZWNvZGVkKSB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IG92ZXJsYXkgPSBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBvdmVybGF5LnRocmVhZElkID8/IHNlc3Npb25JZDtcblx0XHQvLyBUaGUgZXhwbGljaXQgcGF0aCBpcyB0aGUgb25seSB0aGluZyBhIGRlc3RydWN0aXZlIHRlYXJkb3duIG1heSBldmVyXG5cdFx0Ly8gZGVsZXRlOyBgb3ZlcmxheS5jd2RgIGlzIHRoZSBzZXNzaW9uJ3MgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdC8vIHJlZ2FyZGxlc3Mgb2Ygd2hvIHBpY2tlZCBpdCBhbmQgbXVzdCBuZXZlciBiZSB0cmVhdGVkIGFzIGEgbWFuYWdlZFxuXHRcdC8vIGZvbGRlciBvbiB0aGUgc3RyZW5ndGggb2YgYSAocG9zc2libHkgc3RhbGUpIG93bmVyc2hpcCBmbGFnIGFsb25lLlxuXHRcdGNvbnN0IG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID0gdGhpcy5fcmVsZWFzZWRNYW5hZ2VkV29ya2luZ0RpcmVjdG9yaWVzLmdldChzZXNzaW9uSWQpID8/IG92ZXJsYXkubWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG92ZXJsYXkuY3dkID8/IG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmICh0aGlzLl9tb2RlbHMuZ2V0KCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hNb2RlbHMoKTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9zdXBwb3J0ZWRNb2RlbE9yVW5kZWZpbmVkKG92ZXJsYXkubW9kZWxJZCA/IHsgaWQ6IG92ZXJsYXkubW9kZWxJZCB9IDogZGVjb2RlZC5tb2RlbCk7XG5cdFx0Ly8gQ29kZXgncyBzZXNzaW9uIGlkID09IHRocmVhZCBpZCBjb252ZW50aW9uOiB0aGUgYmFja2luZyB0aHJlYWQgYWxyZWFkeVxuXHRcdC8vIGV4aXN0cyBvbiB0aGUgYXBwLXNlcnZlciwgc28gdGhlIGVudHJ5IHJlc3VtZXMgb24gZmlyc3Qgc2VuZC5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeShzZXNzaW9uSWQsIHRocmVhZElkLCB3b3JraW5nRGlyZWN0b3J5LCBtb2RlbCwgdGFyZ2V0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgb3ZlcmxheS5hZ2VudCk7XG5cdFx0aWYgKG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRzZXNzaW9uLm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID0gbWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbGVhc2VkTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcmllcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLnNldCh0aHJlYWRJZCwgc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeUNoYXRVcmkuc2V0KGNoYXQudG9TdHJpbmcoKSwgc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24uc2VydmVyVG9vbHNBZHZlcnRpc2VkICYmIHRoaXMuX3NlcnZlclRvb2xIb3N0KSB7XG5cdFx0XHRzZXNzaW9uLnNlcnZlclRvb2xzQWR2ZXJ0aXNlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9zZXJ2ZXJUb29sSG9zdC5hZHZlcnRpc2Uob3BlcmF0aW9uQ29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdGlmIChwcm92aWRlckRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHsgcHJvdmlkZXJEYXRhOiBlbmNvZGVDb2RleENoYXQoZGVjb2RlZCkgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWNvdmVyTGVnYWN5Q2hhdChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChvcGVyYXRpb25Db250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5fcmVjb3JkQ2hhdFRhcmdldChjaGF0LCBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCkpO1xuXHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogZW5jb2RlQ29kZXhDaGF0KHsgc2Vzc2lvbklkIH0pIH07XG5cdH1cblxuXHQvKipcblx0ICogU2VlZCB0aGUgYWN0aXZlIGNsaWVudCBzdXBwbGllZCB3aXRoIHtAbGluayBJQWdlbnRDaGF0cy5jcmVhdGVDaGF0fSBiZWZvcmUgdGhlIGFnZW50XG5cdCAqIGhvc3QgYXNrcyBmb3IgdGhlIGluaXRpYWwgY3VzdG9taXphdGlvbiBzbmFwc2hvdC4gVGhlIGluaXRpYWwgc3RhdGUgaXNcblx0ICogYXNzaWduZWQgZGlyZWN0bHkgcmF0aGVyIHRoYW4gZGlzcGF0Y2hlZCBhcyBgc2Vzc2lvbi9hY3RpdmVDbGllbnRTZXRgLCBzb1xuXHQgKiB3aXRob3V0IHRoaXMgc3RlcCBDb2RleCB3b3VsZCBub3QgcmVjZWl2ZSB0aGUgY2xpZW50J3MgdG9vbHMgb3Jcblx0ICogY3VzdG9taXphdGlvbnMgdW50aWwgYSBsYXRlciB0dXJuIGhhcHBlbmVkIHRvIHJlLXJlZ2lzdGVyIHRoZSBjbGllbnQuXG5cdCAqXG5cdCAqIGBjaGF0YCBpcyB0aGUgb25lIGV4YWN0IGNoYXQgdGhpcyBzZWVkIGFwcGxpZXMgdG8gXHUyMDE0IHRoZSBjaGF0IHRoZVxuXHQgKiBjcmVhdGluZyBjYWxsIGlzIGJpbmRpbmcuIFRoZSBhZ2VudCBuZXZlciBpbnZlbnRzIGEgY2hhdCBVUkkgdG8gc3RhbmQgaW5cblx0ICogZm9yIGl0LCBhbmQgbmV2ZXIgcHJvcGFnYXRlcyB0aGUgc2VlZCB0byBhbnkgc2libGluZyBjaGF0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VlZEVhZ2VyQWN0aXZlQ2xpZW50KHNlc3Npb25Vcmk6IFVSSSwgY2hhdDogVVJJLCBjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCwgYWN0aXZlQ2xpZW50OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9uc1snYWN0aXZlQ2xpZW50J10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWFjdGl2ZUNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KGNoYXQsIGNvbnRleHQsIHsgY2xpZW50SWQ6IGFjdGl2ZUNsaWVudC5jbGllbnRJZCwgZGlzcGxheU5hbWU6IGFjdGl2ZUNsaWVudC5kaXNwbGF5TmFtZSB9KTtcblx0XHRoYW5kbGUudG9vbHMgPSBhY3RpdmVDbGllbnQudG9vbHM7XG5cdFx0aWYgKGFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSwgYWN0aXZlQ2xpZW50LmNsaWVudElkLCBhY3RpdmVDbGllbnQuY3VzdG9taXphdGlvbnMsIHsgcXVpZXQ6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIGFuIHtAbGluayBJQ29kZXhTZXNzaW9ufSBlbnRyeSBmb3IgYSB0aHJlYWQgdGhhdCBhbHJlYWR5IGV4aXN0cyBvblxuXHQgKiB0aGUgYXBwLXNlcnZlciAoYSByZXN0b3JlZCBzZXNzaW9uIG9yIGEgZnJlc2hseSBmb3JrZWQgb25lKS4gU3VjaCBhXG5cdCAqIHNlc3Npb24gc2tpcHMgbWF0ZXJpYWxpemF0aW9uIFx1MjAxNCBpdHMgZmlyc3Qge0BsaW5rIF9zZW5kTWVzc2FnZX0gaXNzdWVzIGFcblx0ICogYHRocmVhZC9yZXN1bWVgIChgbmVlZHNSZXN1bWU6IHRydWVgKSBcdTIwMTQgc28gdGhlIHByZXdhcm0vZmlyc3QtdHVybiBmbGFnc1xuXHQgKiBhcmUgcHJlLXNldCB0byB0aGVpciBwb3N0LW1hdGVyaWFsaXphdGlvbiB2YWx1ZXMuXG5cdCAqXG5cdCAqIGBzZXNzaW9uVXJpYCBpcyAqZGVyaXZlZCogZnJvbSBgc2Vzc2lvbklkYCByYXRoZXIgdGhhbiBzdXBwbGllZCBcdTIwMTQgc2VlXG5cdCAqIHtAbGluayBJQ29kZXhTZXNzaW9uLnNlc3Npb25Vcml9IGZvciB3aHkgdGhhdCBtdXN0IGFsd2F5cyBob2xkLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeShzZXNzaW9uSWQ6IHN0cmluZywgdGhyZWFkSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIHRhcmdldD86IElDb2RleFRhcmdldENoYXQsIHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdLCBtdWx0aVJvb3RFbmFibGVkPzogYm9vbGVhbiwgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbiwgbWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcj86IHN0cmluZyk6IElDb2RleFNlc3Npb24ge1xuXHRcdGNvbnN0IGNsaWVudFRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyA9IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRzZXNzaW9uVXJpOiBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb25JZCksXG5cdFx0XHRzdGFydFRpbWU6IG5vdyxcblx0XHRcdG1vZGlmaWVkVGltZTogbm93LFxuXHRcdFx0c3VtbWFyeTogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhdENoYW5uZWw6IHRhcmdldD8ucmVzb3VyY2UsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBlZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXM/LlswXSA/PyB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBlZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkOiBtdWx0aVJvb3RFbmFibGVkID8/IChlZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aCA/PyAwKSA+IDEsXG5cdFx0XHRtYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0bWFwU3RhdGU6IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKHRoaXMuX2hvc3RTZXJ2ZXJUb29sTmFtZXMoKSwgY2xpZW50VG9vbFNldCksXG5cdFx0XHRwZW5kaW5nQ29tbWFuZEFwcHJvdmFsczogbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8Q29tbWFuZEV4ZWN1dGlvbkFwcHJvdmFsRGVjaXNpb24+KCksXG5cdFx0XHRhY2NlcHRlZEZvclNlc3Npb246IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0aGFuZGxlZEd1YXJkaWFuUmV2aWV3czogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nR3VhcmRpYW5SZXZpZXdDYXJkczogbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRwZW5kaW5nU3RlZXJpbmdGbGlwczogbmV3IE1hcDxzdHJpbmcsIFBlbmRpbmdNZXNzYWdlPigpLFxuXHRcdFx0Y2xpZW50VG9vbFNldCxcblx0XHRcdHBlbmRpbmdDbGllbnRUb29sQ2FsbHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFRvb2xDYWxsUmVzdWx0PigpLFxuXHRcdFx0cGVuZGluZ1VzZXJJbnB1dHM6IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PElDb2RleFVzZXJJbnB1dFJlc3VsdD4oKSxcblx0XHRcdG1hdGVyaWFsaXplZFRvb2xzU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRNY3BTaWc6IHVuZGVmaW5lZCxcblx0XHRcdG1hdGVyaWFsaXplZEN1c3RvbWl6YXRpb25zU2lnOiB1bmRlZmluZWQsXG5cdFx0XHRtYXRlcmlhbGl6ZWRQZXJtaXNzaW9uc1NpZzogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcixcblx0XHRcdGZpcnN0VHVyblNlbnQ6IHRydWUsXG5cdFx0XHRtb2RlbCxcblx0XHRcdGFnZW50LFxuXHRcdFx0Y3VzdG9taXphdGlvbkRpcmVjdG9yeTogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0dHVyblN0b3BXYXRjaDogdW5kZWZpbmVkLFxuXHRcdFx0Y3VycmVudEFwcFR1cm5JZDogdW5kZWZpbmVkLFxuXHRcdFx0aG9zdFR1cm5JZEJ5QXBwVHVybklkOiBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpLFxuXHRcdFx0Y29kZXhUdXJuSWRCeUhvc3RUdXJuSWQ6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCksXG5cdFx0XHRuZWVkc1Jlc3VtZTogdHJ1ZSxcblx0XHRcdHVuc3Vic2NyaWJlQmVmb3JlUmVzdW1lOiBmYWxzZSxcblx0XHRcdHJlc3VtZVByb21pc2U6IHVuZGVmaW5lZCxcblx0XHRcdGxhc3RQcm9tcHRUZXh0OiAnJyxcblx0XHRcdGRpc3Bvc2VkOiBmYWxzZSxcblx0XHRcdG1hdGVyaWFsaXplUHJvbWlzZTogdW5kZWZpbmVkLFxuXHRcdFx0bWF0ZXJpYWxpemVkRXZlbnRGaXJlZDogdHJ1ZSxcblx0XHRcdHByZXdhcm1UaW1lcjogdW5kZWZpbmVkLFxuXHRcdFx0cHJld2FybUNsYWltZWQ6IHRydWUsXG5cdFx0XHRzZXJ2ZXJUb29sc0FkdmVydGlzZWQ6IGZhbHNlLFxuXHRcdFx0bWNwQ29udHJvbGxlcjogdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50Q3VzdG9taXphdGlvbnM6IG5ldyBDb2RleENsaWVudEN1c3RvbWl6YXRpb25TdG9yZSgpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogRm9yayB0aGUgZXhhY3Qgc291cmNlIGNoYXQncyBiYWNraW5nIHRocmVhZCBpbnRvIGEgbmV3IGJhY2tpbmcgZm9yIHRoZVxuXHQgKiBjaGF0IGJlaW5nIGNyZWF0ZWQuXG5cdCAqXG5cdCAqIGBmb3JrLnNvdXJjZWAgcmVzb2x2ZXMgc29sZWx5IHRocm91Z2ggdGhlIGV4YWN0LWNoYXQgYmluZGluZyB0aGlzIGFnZW50XG5cdCAqIHJlY29yZGVkIHdoZW4gdGhlIHNvdXJjZSBjaGF0IHdhcyBjcmVhdGVkIG9yIG1hdGVyaWFsaXplZCBcdTIwMTQgbmV2ZXJcblx0ICogdGhyb3VnaCBhIGhvc3Qtc3VwcGxpZWQgc2Vzc2lvbiBoaW50IG9yIGNoYXQtVVJJIHNoYXBlLiBBbiB1bmJvdW5kXG5cdCAqIHNvdXJjZSB0aGVyZWZvcmUgZmFpbHMgZmFzdCByYXRoZXIgdGhhbiBndWVzc2luZyBpdHMgb3duaW5nIHNlc3Npb24uXG5cdCAqXG5cdCAqIFdlIGB0aHJlYWQvZm9ya2AgdGhlIHNvdXJjZSB0aHJlYWQgXHUyMDE0IHdoaWNoIGNvcGllcyBpdHMgZnVsbCBoaXN0b3J5IFx1MjAxNCB0aGVuXG5cdCAqIGB0aHJlYWQvcm9sbGJhY2tgIHRoZSB0cmFpbGluZyB0dXJucyBzbyB0aGUgZm9yayByZXRhaW5zIG9ubHkgdGhlIHR1cm5zIHVwXG5cdCAqIHRvIGFuZCBpbmNsdWRpbmcgYGZvcmsudHVybklkYC4gVGhlIGZvcmtlZCB0aHJlYWQgYWxyZWFkeSBleGlzdHMgb24gdGhlXG5cdCAqIGFwcC1zZXJ2ZXIsIHNvIHRoZSBydW50aW1lIGlzIHJlZ2lzdGVyZWQgYXMgcmVzdW1hYmxlIChpdHMgZmlyc3Qgc2VuZFxuXHQgKiBpc3N1ZXMgYSBgdGhyZWFkL3Jlc3VtZWApLlxuXHQgKlxuXHQgKiBgYWRvcHRlZFNlc3Npb25JZGAsIHdoZW4gc2V0LCBpcyB0aGUgb3duaW5nIHNlc3Npb24ncyBpZGVudGl0eSB0aGlzXG5cdCAqIGJhY2tpbmcgYWRvcHRzICh0aGUgc2Vzc2lvbidzIHJ1bnRpbWUgaXMgc3Rvb2QgdXAgYnkgdGhpcyBmb3JrKTsgb3RoZXJ3aXNlXG5cdCAqIHRoZSBydW50aW1lIGlzIGtleWVkIGJ5IHRoZSBmb3JrZWQgdGhyZWFkIGlkLCBwcmVzZXJ2aW5nIHRoZSBDb2RleFxuXHQgKiBjb252ZW50aW9uIHRoYXQgYSBjaGF0LW93bmVkIHNlc3Npb24gaWQgZXF1YWxzIGl0cyB0aHJlYWQgaWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9mb3JrQ2hhdEJhY2tpbmcoZm9yazogSUFnZW50Q3JlYXRlQ2hhdEZvcmtTb3VyY2UsIG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIHwgdW5kZWZpbmVkLCBhZG9wdGVkU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRhcmdldDogSUNvZGV4VGFyZ2V0Q2hhdCk6IFByb21pc2U8SUNvZGV4U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHNvdXJjZVNlc3Npb25VcmkgPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihmb3JrLnNvdXJjZSk7XG5cdFx0aWYgKCFzb3VyY2VTZXNzaW9uVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBmb3JrIGNvZGV4IGNoYXQgJHtmb3JrLnNvdXJjZS50b1N0cmluZygpfTogYmFja2luZyB0aHJlYWQgY291bGQgbm90IGJlIHJlc29sdmVkYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZVJlYWQgPSBhd2FpdCB0aGlzLl9yZWFkU2Vzc2lvbihzb3VyY2VTZXNzaW9uVXJpKTtcblx0XHRpZiAoIXNvdXJjZVJlYWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZvcmsgY29kZXggY2hhdCAke2Zvcmsuc291cmNlLnRvU3RyaW5nKCl9OiBzb3VyY2UgdGhyZWFkIGNvdWxkIG5vdCBiZSByZWFkYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNvdXJjZVRocmVhZElkID0gc291cmNlUmVhZC50aHJlYWQuaWQ7XG5cdFx0Y29uc3Qgc291cmNlVHVybnMgPSBzb3VyY2VSZWFkLnRocmVhZC50dXJucyA/PyBbXTtcblx0XHRjb25zdCBzb3VyY2VTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzb3VyY2VTZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3Qgc291cmNlT3ZlcmxheSA9IHNvdXJjZVNlc3Npb24gPyB1bmRlZmluZWQgOiBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLnJlYWQoc291cmNlU2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc291cmNlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPSBzb3VyY2VTZXNzaW9uPy5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeVxuXHRcdFx0Pz8gdGhpcy5fcmVsZWFzZWRNYW5hZ2VkV29ya2luZ0RpcmVjdG9yaWVzLmdldChBZ2VudFNlc3Npb24uaWQoc291cmNlU2Vzc2lvblVyaSkpXG5cdFx0XHQ/PyBzb3VyY2VPdmVybGF5Py5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeTtcblx0XHRjb25zdCBzb3VyY2VQcmltYXJ5ID0gc291cmNlUmVhZC50aHJlYWQuY3dkID8gVVJJLmZpbGUoc291cmNlUmVhZC50aHJlYWQuY3dkKSA6IG9wdGlvbnM/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGNvbnN0IHNvdXJjZVN0b3JlZFdvcmtpbmdEaXJlY3RvcmllcyA9IHNvdXJjZVNlc3Npb24/LndvcmtpbmdEaXJlY3RvcmllcyA/PyBzb3VyY2VSZWFkLnBlcnNpc3RlZFdvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRjb25zdCBpbmhlcml0ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBzb3VyY2VQcmltYXJ5XG5cdFx0XHQ/IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKFtzb3VyY2VQcmltYXJ5LCAuLi4oc291cmNlU3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXSldKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbXVsdGlSb290RW5hYmxlZCA9IHNvdXJjZVNlc3Npb24/Lm11bHRpUm9vdEVuYWJsZWQgPz8gKGluaGVyaXRlZFdvcmtpbmdEaXJlY3Rvcmllcz8ubGVuZ3RoID8/IDApID4gMTtcblx0XHRjb25zdCBydW50aW1lV29ya3NwYWNlUm9vdHMgPSBtdWx0aVJvb3RFbmFibGVkICYmIGluaGVyaXRlZFdvcmtpbmdEaXJlY3RvcmllcyAmJiBpbmhlcml0ZWRXb3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMVxuXHRcdFx0PyBkaXN0aW5jdEFic29sdXRlUGF0aHMoaW5oZXJpdGVkV29ya2luZ0RpcmVjdG9yaWVzLm1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZzUGF0aCkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFJlc29sdmUgaG93IG1hbnkgdHJhaWxpbmcgdHVybnMgdG8gZHJvcCBzbyB0aGUgZm9yayBrZWVwcyB0dXJucyB1cCB0b1xuXHRcdC8vIGFuZCBpbmNsdWRpbmcgYGZvcmsudHVybklkYC4gQSBsaXZlIHNvdXJjZSBtYXBzIGhvc3QgdHVybiBpZHMgdG8gY29kZXhcblx0XHQvLyB0dXJuIGlkczsgYSByZXN0b3JlZCBzb3VyY2UgYWxyZWFkeSB1c2VzIGNvZGV4IGlkcy4gRmFsbCBiYWNrIHRvIHRoZVxuXHRcdC8vIGNhbGxlci1zdXBwbGllZCBgdHVybkluZGV4YCB3aGVuIHRoZSBpZCBjYW4ndCBiZSByZXNvbHZlZC5cblx0XHRjb25zdCBjb2RleFR1cm5JZCA9IHNvdXJjZVNlc3Npb24/LmNvZGV4VHVybklkQnlIb3N0VHVybklkLmdldChmb3JrLnR1cm5JZCkgPz8gZm9yay50dXJuSWQ7XG5cdFx0Ly8gUmVqZWN0IGFuIHVucmVzb2x2YWJsZSBmb3JrIGJvdW5kYXJ5IHJhdGhlciB0aGFuIHNpbGVudGx5IGtlZXBpbmcgdGhlXG5cdFx0Ly8gZnVsbCBoaXN0b3J5OiBpZiBuZWl0aGVyIHRoZSBtYXBwZWQgY29kZXggdHVybiBpZCBub3IgdGhlIGNhbGxlcidzXG5cdFx0Ly8gYHR1cm5JbmRleGAgbGFuZHMgaW5zaWRlIHRoZSBzb3VyY2UgdHVybnMsIGEgYG51bVR1cm5zVG9Ecm9wYCBvZiAwIHdvdWxkXG5cdFx0Ly8gYnJhbmNoIGZyb20gdGhlIHdyb25nIHBvaW50ICh0aGUgdGlwIGluc3RlYWQgb2YgdGhlIHJlcXVlc3RlZCB0dXJuKS5cblx0XHQvLyBBIGNoYXQtZm9yayBzb3VyY2UgbWF5IGNhcnJ5IG5vIHBvc2l0aW9uYWwgaW5kZXg7IHRoZSB0dXJuIGlkIHRoZW5cblx0XHQvLyByZXNvbHZlcyB0aGUgYm91bmRhcnkgYWxvbmUsIGFuZCBhbiB1bnJlc29sdmFibGUgaWQgaXMgcmVqZWN0ZWQuXG5cdFx0Y29uc3QgZmFsbGJhY2tUdXJuSW5kZXggPSBmb3JrLnR1cm5JbmRleCA/PyAtMTtcblx0XHRjb25zdCBib3VuZGFyeSA9IHJlc29sdmVGb3JrQm91bmRhcnkoc291cmNlVHVybnMubWFwKHQgPT4gdC5pZCksIGNvZGV4VHVybklkLCBmYWxsYmFja1R1cm5JbmRleCk7XG5cdFx0aWYgKCFib3VuZGFyeS5yZXNvbHZlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZm9yayBjb2RleCBzZXNzaW9uICR7c291cmNlVGhyZWFkSWR9OiB1bmFibGUgdG8gcmVzb2x2ZSBmb3JrIGJvdW5kYXJ5IGZvciB0dXJuICR7Zm9yay50dXJuSWR9ICh0dXJuSW5kZXg9JHtmYWxsYmFja1R1cm5JbmRleH0sIHR1cm5zPSR7c291cmNlVHVybnMubGVuZ3RofSlgKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBrZWVwVGhyb3VnaEluZGV4LCBudW1UdXJuc1RvRHJvcCB9ID0gYm91bmRhcnk7XG5cblx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGluaGVyaXRlZE1vZGVsID0gc291cmNlU2Vzc2lvbj8ubW9kZWxcblx0XHRcdD8/IChzb3VyY2VSZWFkLnBlcnNpc3RlZE1vZGVsSWQgPyB7IGlkOiBzb3VyY2VSZWFkLnBlcnNpc3RlZE1vZGVsSWQgfSA6IHVuZGVmaW5lZClcblx0XHRcdD8/IHRoaXMuX21vZGVscy5nZXQoKS5maW5kKGNhbmRpZGF0ZSA9PiBwYXJzZUNvZGV4TW9kZWxTZWxlY3Rpb24oY2FuZGlkYXRlKS5tb2RlbFByb3ZpZGVyID09PSBzb3VyY2VSZWFkLnRocmVhZC5tb2RlbFByb3ZpZGVyKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Jlc29sdmVDcmVhdGlvbk1vZGVsKG9wdGlvbnM/Lm1vZGVsLCBpbmhlcml0ZWRNb2RlbCk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbCA9IG1vZGVsID8gdGhpcy5fcm91dGVDb2RleE1vZGVsKG1vZGVsKSA6IHVuZGVmaW5lZDtcblx0XHQvLyBJbmhlcml0IHRoZSBzb3VyY2Ugc2Vzc2lvbidzIGVmZmVjdGl2ZSBwZXJtaXNzaW9ucyBzbyBmb3JraW5nIGFuXG5cdFx0Ly8gYXV0by1yZXZpZXcgLyBmdWxsLWFjY2VzcyAvIHJlYWQtb25seSBzZXNzaW9uIGRvZXNuJ3Qgc2lsZW50bHkgcmVzZXQgdGhlXG5cdFx0Ly8gZm9yayBiYWNrIHRvIHRoZSBEZWZhdWx0IHByZXNldC4gRm9yayBjYWxsZXJzIHR5cGljYWxseSBwYXNzIGFuIGVtcHR5XG5cdFx0Ly8gYGNvbmZpZ2A7IGFueSBleHBsaWNpdCBvdmVycmlkZSB0aGVyZSBzdGlsbCB3aW5zLlxuXHRcdGNvbnN0IHNvdXJjZUNvbmZpZ1ZhbHVlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMoc291cmNlU2Vzc2lvblVyaS50b1N0cmluZygpKTtcblx0XHRjb25zdCBmb3JrRGVmYXVsdHMgPSB0aGlzLl9wZXJtaXNzaW9uQXhpc0RlZmF1bHRzKCk7XG5cdFx0Y29uc3QgeyBhcHByb3ZhbFBvbGljeSwgc2FuZGJveE1vZGUsIGFwcHJvdmFsc1Jldmlld2VyIH0gPSByZXNvbHZlQ29kZXhQZXJtaXNzaW9ucyhcblx0XHRcdG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXMoeyAuLi5zb3VyY2VDb25maWdWYWx1ZXMsIC4uLm9wdGlvbnM/LmNvbmZpZyB9LCBmb3JrRGVmYXVsdHMpLFxuXHRcdFx0Zm9ya0RlZmF1bHRzLFxuXHRcdCk7XG5cdFx0Y29uc3QgZm9ya01hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID0gc291cmNlTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnlcblx0XHRcdD8gYXdhaXQgdGhpcy5fY3JlYXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkoYGZvcmstJHtnZW5lcmF0ZVV1aWQoKX1gKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvcmtNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSAmJiBzb3VyY2VNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZnMucHJvbWlzZXMuY3Aoc291cmNlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLCBmb3JrTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZW1vdmVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeShmb3JrTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBmb3JrUmVzdWx0OiBUaHJlYWRGb3JrUmVzcG9uc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGZvcmtSZXN1bHQgPSBhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvZm9yaycsIFRocmVhZEZvcmtSZXNwb25zZT4oJ3RocmVhZC9mb3JrJywge1xuXHRcdFx0XHR0aHJlYWRJZDogc291cmNlVGhyZWFkSWQsXG5cdFx0XHRcdC4uLihmb3JrTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPyB7XG5cdFx0XHRcdFx0Y3dkOiBmb3JrTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLFxuXHRcdFx0XHR9IDogcnVudGltZVdvcmtzcGFjZVJvb3RzPy5sZW5ndGggPyB7XG5cdFx0XHRcdFx0Y3dkOiBydW50aW1lV29ya3NwYWNlUm9vdHNbMF0sXG5cdFx0XHRcdFx0cnVudGltZVdvcmtzcGFjZVJvb3RzLFxuXHRcdFx0XHR9IDoge30pLFxuXHRcdFx0XHQuLi4ocmVzb2x2ZWRNb2RlbCA/IHsgbW9kZWw6IHJlc29sdmVkTW9kZWwubW9kZWxJZCwgbW9kZWxQcm92aWRlcjogcmVzb2x2ZWRNb2RlbC5tb2RlbFByb3ZpZGVyIH0gOiB7fSksXG5cdFx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRcdFtDT0RFWF9BUFBMWV9QQVRDSF9TVFJFQU1JTkdfRkVBVFVSRV06IHRydWUsXG5cdFx0XHRcdFx0J2ZlYXR1cmVzLmltYWdlX2dlbmVyYXRpb24nOiB0aGlzLl9pbWFnZUdlbmVyYXRpb25FbmFibGVkRm9yTW9kZWxQcm92aWRlcihyZXNvbHZlZE1vZGVsPy5tb2RlbFByb3ZpZGVyID8/IHNvdXJjZVJlYWQudGhyZWFkLm1vZGVsUHJvdmlkZXIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhcHByb3ZhbFBvbGljeSxcblx0XHRcdFx0c2FuZGJveDogc2FuZGJveE1vZGUsXG5cdFx0XHRcdGFwcHJvdmFsc1Jldmlld2VyLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZm9ya01hbmFnZWRXb3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KGZvcmtNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdGNvbnN0IG5ld1RocmVhZElkID0gZm9ya1Jlc3VsdC50aHJlYWQuaWQ7XG5cblx0XHQvLyBUaGUgZm9yayBjb3BpZXMgdGhlIGZ1bGwgc291cmNlIGhpc3Rvcnk7IGRyb3AgdGhlIHRyYWlsaW5nIHR1cm5zIHNvXG5cdFx0Ly8gdGhlIG5ldyB0aHJlYWQgZW5kcyBhdCB0aGUgcmVxdWVzdGVkIGZvcmsgcG9pbnQuIEEgZmFpbGVkIHJvbGxiYWNrXG5cdFx0Ly8gd291bGQgbGVhdmUgdGhlIGZvcmsgY2FycnlpbmcgdGhlIHZlcnkgdHVybnMgdGhlIHVzZXIgYXNrZWQgdG8gYnJhbmNoXG5cdFx0Ly8gYXdheSBmcm9tLCBzbyB0cmVhdCBpdCBhcyBhIGhhcmQgZmFpbHVyZTogYXJjaGl2ZSB0aGUgb3JwaGFuZWQgZm9ya1xuXHRcdC8vIGFuZCByZWplY3QgcmF0aGVyIHRoYW4gcmV0dXJuaW5nIGEgc2Vzc2lvbiB3aXRoIHRoZSB3cm9uZyBoaXN0b3J5LlxuXHRcdGlmIChudW1UdXJuc1RvRHJvcCA+IDApIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9yb2xsYmFjayc+KCd0aHJlYWQvcm9sbGJhY2snLCB7IHRocmVhZElkOiBuZXdUaHJlYWRJZCwgbnVtVHVybnM6IG51bVR1cm5zVG9Ecm9wIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7bmV3VGhyZWFkSWR9XSBmb3JrIHJvbGxiYWNrIGZhaWxlZCAobnVtVHVybnM9JHtudW1UdXJuc1RvRHJvcH0pOyBkaXNjYXJkaW5nIGZvcms6ICR7bWVzc2FnZX1gKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvYXJjaGl2ZSc+KCd0aHJlYWQvYXJjaGl2ZScsIHsgdGhyZWFkSWQ6IG5ld1RocmVhZElkIH0pO1xuXHRcdFx0XHR9IGNhdGNoIChhcmNoaXZlRXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtuZXdUaHJlYWRJZH1dIGZhaWxlZCB0byBhcmNoaXZlIG9ycGhhbmVkIGZvcmsgYWZ0ZXIgcm9sbGJhY2sgZmFpbHVyZTogJHthcmNoaXZlRXJyIGluc3RhbmNlb2YgRXJyb3IgPyBhcmNoaXZlRXJyLm1lc3NhZ2UgOiBTdHJpbmcoYXJjaGl2ZUVycil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGZvcmtNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KGZvcmtNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZm9yayBjb2RleCBzZXNzaW9uICR7c291cmNlVGhyZWFkSWR9OiBjb3VsZCBub3Qgcm9sbCBiYWNrIGZvcmtlZCB0aHJlYWQgJHtuZXdUaHJlYWRJZH0gdG8gdGhlIHJlcXVlc3RlZCB0dXJuICgke21lc3NhZ2V9KWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoZSBydW50aW1lJ3MgZHVyYWJsZSBpZDogdGhlIG93bmluZyBzZXNzaW9uJ3Mgd2hlbiB0aGlzIGZvcmsgc3RhbmRzXG5cdFx0Ly8gdGhhdCBzZXNzaW9uIHVwIChzbyBldmVyeSBzZXNzaW9uLWFkZHJlc3NlZCBjYWxsIGtlZXBzIHJlc29sdmluZyksIGFuZFxuXHRcdC8vIG90aGVyd2lzZSB0aGUgZm9ya2VkIHRocmVhZCBpZCBcdTIwMTQgdGhlIENvZGV4IGNvbnZlbnRpb24gdGhhdCBhXG5cdFx0Ly8gY2hhdC1vd25lZCBzZXNzaW9uIGlkIGVxdWFscyBpdHMgdGhyZWFkIGlkLiBFaXRoZXIgd2F5IHRoZSB0aHJlYWQgaWRcblx0XHQvLyBpdHNlbGYgaXMgZGVjb3VwbGVkIGludG8gdGhlIG1ldGFkYXRhIG92ZXJsYXkgYnlcblx0XHQvLyBgX3BlcnNpc3RNYXRlcmlhbGl6ZWRTZXNzaW9uYCwgc28gYSByZXN0b3JlIHJvdW5kLXRyaXBzLlxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGFkb3B0ZWRTZXNzaW9uSWQgPz8gbmV3VGhyZWFkSWQ7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGZvcmtNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeVxuXHRcdFx0Pz8gKGZvcmtSZXN1bHQuY3dkXG5cdFx0XHRcdD8gVVJJLmZpbGUoZm9ya1Jlc3VsdC5jd2QpXG5cdFx0XHRcdDogKHNvdXJjZVJlYWQudGhyZWFkLmN3ZCA/IFVSSS5maWxlKHNvdXJjZVJlYWQudGhyZWFkLmN3ZCkgOiBvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSkpO1xuXHRcdGNvbnN0IGZvcmtXb3JraW5nRGlyZWN0b3JpZXMgPSBtdWx0aVJvb3RFbmFibGVkXG5cdFx0XHQ/IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKFxuXHRcdFx0XHRmb3JrUmVzdWx0LnJ1bnRpbWVXb3Jrc3BhY2VSb290cz8ubGVuZ3RoXG5cdFx0XHRcdFx0PyBmb3JrUmVzdWx0LnJ1bnRpbWVXb3Jrc3BhY2VSb290cy5tYXAocGF0aCA9PiBVUkkuZmlsZShwYXRoKSlcblx0XHRcdFx0XHQ6IGluaGVyaXRlZFdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdClcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZVJlc3VtZWRTZXNzaW9uRW50cnkoXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRuZXdUaHJlYWRJZCxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRtb2RlbCxcblx0XHRcdHRhcmdldCxcblx0XHRcdGZvcmtXb3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRtdWx0aVJvb3RFbmFibGVkLFxuXHRcdFx0b3B0aW9ucz8uYWdlbnQgPz8gc291cmNlU2Vzc2lvbj8uYWdlbnQsXG5cdFx0XHRmb3JrUmVzdWx0LnRocmVhZC5tb2RlbFByb3ZpZGVyID8/IHJlc29sdmVkTW9kZWw/Lm1vZGVsUHJvdmlkZXIgPz8gc291cmNlUmVhZC50aHJlYWQubW9kZWxQcm92aWRlcixcblx0XHQpO1xuXHRcdHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPSBmb3JrTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgc2Vzc2lvbik7XG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5zZXQobmV3VGhyZWFkSWQsIHNlc3Npb25JZCk7XG5cdFx0Ly8gUmVjb3JkIHRoZSBleGFjdC1jaGF0IGJpbmRpbmcgYXQgcmVnaXN0cmF0aW9uIHRpbWUsIG1pcnJvcmluZyB0aGVcblx0XHQvLyBkZWZlcnJlZCBwYXRoOiB0aGUgZm9yayBtdXN0IG5ldmVyIGJlIG9ic2VydmFibHkgdW5ib3VuZCBiZXR3ZWVuIHRoZVxuXHRcdC8vIHJ1bnRpbWUgZW50ZXJpbmcgYF9zZXNzaW9uc2AgYW5kIGEgY2FsbGVyIGF3YWl0aW5nIHRoZSByZXN1bHQuXG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlDaGF0VXJpLnNldCh0YXJnZXQucmVzb3VyY2UudG9TdHJpbmcoKSwgc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdC8vIFNlZWQgdGhlIGhvc3RcdTIxOTJjb2RleCB0dXJuLWlkIG1hcCBmb3IgdGhlIGNvcGllZCB0dXJucyBzbyBhIGxhdGVyXG5cdFx0Ly8gZWRpdC90cnVuY2F0ZSBvZiBhbiBpbmhlcml0ZWQgdHVybiBjYW4gcmVzb2x2ZSBpdHMgYXBwLXNlcnZlciB0dXJuIGlkLlxuXHRcdC8vIFdpdGhvdXQgdGhpcywgYHRydW5jYXRlQ2hhdGAgY2FuJ3QgbWFwIHRoZSBob3N0IGlkIGFuZCBza2lwcyB0aGVcblx0XHQvLyByb2xsYmFjay4gYHRocmVhZC9mb3JrYCBtYXkgcmVnZW5lcmF0ZSB0dXJuIGlkcywgc28gcmVhZCB0aGUgZm9ya2VkXG5cdFx0Ly8gdGhyZWFkJ3MgYXV0aG9yaXRhdGl2ZSBrZXB0IHR1cm5zIGFuZCBwYWlyIHRoZW0sIGluIG9yZGVyLCB3aXRoIHRoZSBuZXdcblx0XHQvLyBob3N0IHR1cm4gaWRzIGZyb20gYGZvcmsudHVybklkTWFwcGluZ2AuIEJlc3QtZWZmb3J0OiBhIGZhaWxlZCByZWFkIGp1c3Rcblx0XHQvLyBsZWF2ZXMgdGhlIG1hcCB1bnNlZWRlZCAoc2FtZSBhcyBiZWZvcmUpLCBuZXZlciBibG9ja2luZyB0aGUgZm9yay5cblx0XHRpZiAoZm9yay50dXJuSWRNYXBwaW5nICYmIGZvcmsudHVybklkTWFwcGluZy5zaXplID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZm9ya2VkUmVhZCA9IGF3YWl0IHRoaXMuX3JlYWRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvblVyaSk7XG5cdFx0XHRcdGNvbnN0IGZvcmtlZFR1cm5zID0gZm9ya2VkUmVhZD8udGhyZWFkLnR1cm5zID8/IFtdO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gcGxhbkZvcmtlZFR1cm5JZE1hcChcblx0XHRcdFx0XHRzb3VyY2VUdXJucy5tYXAodCA9PiB0LmlkKSxcblx0XHRcdFx0XHRmb3JrZWRUdXJucy5tYXAodCA9PiB0LmlkKSxcblx0XHRcdFx0XHRrZWVwVGhyb3VnaEluZGV4LFxuXHRcdFx0XHRcdHNvdXJjZVNlc3Npb24/Lmhvc3RUdXJuSWRCeUFwcFR1cm5JZCxcblx0XHRcdFx0XHRmb3JrLnR1cm5JZE1hcHBpbmcsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2hvc3RUdXJuSWQsIGZvcmtlZENvZGV4VHVybklkXSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0c2Vzc2lvbi5jb2RleFR1cm5JZEJ5SG9zdFR1cm5JZC5zZXQoaG9zdFR1cm5JZCwgZm9ya2VkQ29kZXhUdXJuSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtuZXdUaHJlYWRJZH1dIGZhaWxlZCB0byBzZWVkIGZvcmtlZCB0dXJuLWlkIG1hcDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGZvcmtlZCBjaGF0ICR7dGFyZ2V0LnJlc291cmNlLnRvU3RyaW5nKCl9IGZyb20gJHtmb3JrLnNvdXJjZS50b1N0cmluZygpfTogdGhyZWFkICR7c291cmNlVGhyZWFkSWR9IFx1MjE5MiAke25ld1RocmVhZElkfSAoa2VwdCAke3NvdXJjZVR1cm5zLmxlbmd0aCAtIG51bVR1cm5zVG9Ecm9wfS8ke3NvdXJjZVR1cm5zLmxlbmd0aH0gdHVybnMpYCk7XG5cdFx0Ly8gQSBmb3JrIGlzIG1hdGVyaWFsaXplZCBvbiByZXR1cm4sIHNvIGl0IG5ldmVyIGVtaXRzIHRoZSBmaXJzdC1zZW5kXG5cdFx0Ly8gbWF0ZXJpYWxpemUgcmVjZWlwdCB0aGF0IGNhcnJpZXMgYSBmcmVzaCBiYWNraW5nIFx1MjAxNCB0aGUgY3JlYXRlIHJlc3VsdFxuXHRcdC8vIGlzIHRoZSBob3N0J3Mgb25seSBjaGFuY2UgdG8gcGVyc2lzdCBvbmUuIFdpdGhvdXQgaXQgdGhlIGZvcmsgcmVzdG9yZXNcblx0XHQvLyB3aXRoIG5vIGJhY2tpbmcgYXQgYWxsIGFuZCBpdHMgcnVudGltZSBjb21lcyBiYWNrIHVuYm91bmQgZnJvbSB0aGVcblx0XHQvLyBjaGF0IEFnZW50IEhvc3QgYWRkcmVzc2VzIGl0IGJ5LlxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0LyoqXG5cdCAqIExhemlseSBzdGFydCAob3IgcmVzdW1lKSBhIGNvZGV4IHRocmVhZCBmb3IgYHNlc3Npb25gLiBJZGVtcG90ZW50OlxuXHQgKiBpZiBgdGhyZWFkSWRgIGlzIGFscmVhZHkgcG9wdWxhdGVkLCBqdXN0IHJldHVybnMuIENhbGxlZCBmcm9tXG5cdCAqIGBzZW5kTWVzc2FnZWAgYmVmb3JlIHRoZSBmaXJzdCBgdHVybi9zdGFydGAuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9tYXRlcmlhbGl6ZUlmTmVlZGVkKHNlc3Npb246IElDb2RleFNlc3Npb24sIGNvbmZpZ1Jlc291cmNlOiBVUkkgPSBzZXNzaW9uLnNlc3Npb25VcmksIGZpcmVNYXRlcmlhbGl6ZWRFdmVudCA9IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCB8fCAhc2Vzc2lvbi5jaGF0Q2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoZmlyZU1hdGVyaWFsaXplZEV2ZW50KSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVNYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uLm1hdGVyaWFsaXplUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2U7XG5cdFx0XHRpZiAoZmlyZU1hdGVyaWFsaXplZEV2ZW50KSB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVNYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVQcm9taXNlID0gdGhpcy5fbWF0ZXJpYWxpemUoc2Vzc2lvbiwgY29uZmlnUmVzb3VyY2UpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2U7XG5cdFx0aWYgKGZpcmVNYXRlcmlhbGl6ZWRFdmVudCkge1xuXHRcdFx0dGhpcy5fZmlyZU1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90cmFjZUNvbnRleHQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbikge1xuXHRcdHJldHVybiB0aGlzLl9vdGVsU2VydmljZS5nZXRTZXNzaW9uVHJhY2VDb250ZXh0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeShvd25lcklkOiBzdHJpbmcpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IFVSSS5maWxlKGpvaW4ob3MudG1wZGlyKCksICd2c2NvZGUtYWdlbnQtY29kZXgnLCBvd25lcklkKSk7XG5cdFx0YXdhaXQgZnMucHJvbWlzZXMubWtkaXIoZGlyZWN0b3J5LmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGRpcmVjdG9yeTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbW92ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KGRpcmVjdG9yeTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLnByb21pc2VzLnJtKGRpcmVjdG9yeS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBmYWlsZWQgdG8gcmVtb3ZlIG1hbmFnZWQgdGVtcCBmb2xkZXIgJHtkaXJlY3RvcnkuZnNQYXRofTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFiYW5kb24gdGhpcyBzZXNzaW9uJ3Mgb3duIG1hbmFnZWQgdGVtcCBmb2xkZXIgYWhlYWQgb2YgYWRvcHRpbmcgYVxuXHQgKiBkaWZmZXJlbnQgKGhvc3QtIG9yIHVzZXItc3VwcGxpZWQpIHdvcmtpbmcgZGlyZWN0b3J5LiBDbGVhcnMgdGhlXG5cdCAqIGluLW1lbW9yeSBmaWVsZCwgcmVtb3ZlcyB0aGUgZm9sZGVyIGZyb20gZGlzayB2aWEgaXRzIGtub3duIGV4cGxpY2l0XG5cdCAqIHBhdGgsIGFuZCBwZXJzaXN0cyB0aGUgY2xlYXIgc28gYSBsYXRlciByZWNsYWltIFx1MjAxNCB0aGlzIHByb2Nlc3Mgb3IgYVxuXHQgKiBmdXR1cmUgb25lIHJlc3RvcmVkIGZyb20gdGhlIHNhbWUgb3ZlcmxheSBcdTIwMTQgbmV2ZXIgaGFzIHRvIGluZmVyIGFcblx0ICogbWFuYWdlZCBwYXRoIGZyb20gYGN3ZGAgYWdhaW4uIE11c3QgcnVuIGJlZm9yZSBgc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5YFxuXHQgKiBpcyBvdmVyd3JpdHRlbiwgc28gdGhlIGZvbGRlciBiZWluZyBhYmFuZG9uZWQgaXMgbmV2ZXIgY29uZnVzZWQgd2l0aCB0aGVcblx0ICogZm9sZGVyIGJlaW5nIGFkb3B0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hYmFuZG9uTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpcmVjdG9yeSA9IHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0aWYgKCFkaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLl9yZW1vdmVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeShkaXJlY3RvcnkpO1xuXHRcdGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoc2Vzc2lvbi5zZXNzaW9uVXJpLCB7IG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiBudWxsLCBvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemUoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgY29uZmlnUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkIHx8ICFzZXNzaW9uLmNoYXRDaGFubmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZT8uaW5pdGlhbGl6ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHQvLyBObyB3b3JraW5nIGRpcmVjdG9yeSB3YXMgc3VwcGxpZWQgKGUuZy4gYW4gZWRpdG9yIHdpbmRvdyB3aXRoIG5vXG5cdFx0XHQvLyB3b3Jrc3BhY2UgZm9sZGVyIG9wZW4pLiBDb2RleCByZXF1aXJlcyBvbmUsIHNvIGNyZWF0ZSBhIG1hbmFnZWRcblx0XHRcdC8vIHBlci1zZXNzaW9uIHRlbXAgZm9sZGVyIGFuZCByZW1lbWJlciBpdCBmb3IgY2xlYW51cCBvbiBkaXNwb3NlLlxuXHRcdFx0c2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgdGhpcy5fY3JlYXRlTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0c2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBubyB3b3JraW5nIGRpcmVjdG9yeSBzdXBwbGllZCBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfTsgdXNpbmcgbWFuYWdlZCB0ZW1wIGZvbGRlciAke3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeS5mc1BhdGh9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcmVhZFNlc3Npb25Db25maWcoY29uZmlnUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU1vZGVsKHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgYXBwcm92YWxQb2xpY3ksIHNhbmRib3hNb2RlLCBhcHByb3ZhbHNSZXZpZXdlciB9ID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25QZXJtaXNzaW9ucyhjb25maWdSZXNvdXJjZSk7XG5cdFx0Ly8gQXR0YWNoIHRoZSBzZXNzaW9uJ3MgTUNQIHNlcnZlcnMgcGVyLXRocmVhZCAodmVyaWZpZWQ6IGNvZGV4IHN0YXJ0c1xuXHRcdC8vIHRoZW0gZm9yIHRoaXMgdGhyZWFkIG9ubHkpOiB0aGUgd29ya2JlbmNoJ3Mgcm9vdCBgbWNwU2VydmVyc2AgY29uZmlnXG5cdFx0Ly8gbWVyZ2VkIHdpdGggdGhpcyBzZXNzaW9uJ3MgZW5hYmxlZCBjbGllbnQtcGx1Z2luIHNlcnZlcnMuIFBhc3NpbmcgdGhlbVxuXHRcdC8vIHBlci10aHJlYWQgbWVhbnMgYSBuZXcgc2Vzc2lvbiBhbHdheXMgcmVmbGVjdHMgdGhlIGN1cnJlbnQgcm9vdCBjb25maWcuXG5cdFx0Ly8gTWlkLXNlc3Npb24gTUNQIGVuYWJsZW1lbnQgY2hhbmdlcyBhcHBseSBvbmx5IHdoZW4gQ29kZXggc3RhcnRzIG9yIHJlc3VtZXMgYSB0aHJlYWQuXG5cdFx0Y29uc3QgbWNwU2VydmVycyA9IHRoaXMuX2J1aWxkU2Vzc2lvbk1jcFNlcnZlcnMoc2Vzc2lvbik7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbkxhdW5jaCA9IGF3YWl0IHRoaXMuX2J1aWxkQ3VzdG9taXphdGlvbkxhdW5jaChzZXNzaW9uKTtcblx0XHRjb25zdCByZXNvbHZlZE1vZGVsID0gdGhpcy5fcm91dGVDb2RleE1vZGVsKG1vZGVsKTtcblx0XHRjb25zdCB0aHJlYWRDb25maWc6IFJlY29yZDxzdHJpbmcsIEpzb25WYWx1ZT4gPSB7XG5cdFx0XHR3ZWJfc2VhcmNoOiBuYXJyb3dXZWJTZWFyY2hNb2RlKGNvbmZpZ1tDb2RleFNlc3Npb25Db25maWdLZXkuV2ViU2VhcmNoTW9kZV0pID8/IGNvZGV4U2Vzc2lvbkNvbmZpZ0RlZmF1bHRzW0NvZGV4U2Vzc2lvbkNvbmZpZ0tleS5XZWJTZWFyY2hNb2RlXSxcblx0XHRcdC4uLmN1c3RvbWl6YXRpb25MYXVuY2guY29uZmlnLFxuXHRcdFx0W0NPREVYX0FQUExZX1BBVENIX1NUUkVBTUlOR19GRUFUVVJFXTogdHJ1ZSxcblx0XHRcdCdmZWF0dXJlcy5pbWFnZV9nZW5lcmF0aW9uJzogdGhpcy5faW1hZ2VHZW5lcmF0aW9uRW5hYmxlZEZvck1vZGVsUHJvdmlkZXIocmVzb2x2ZWRNb2RlbC5tb2RlbFByb3ZpZGVyKSxcblx0XHR9O1xuXHRcdGNvbnN0IG1jcFNlcnZlck5hbWVzID0gT2JqZWN0LmtleXMobWNwU2VydmVycyk7XG5cdFx0aWYgKG1jcFNlcnZlck5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRocmVhZENvbmZpZy5tY3Bfc2VydmVycyA9IG1jcFNlcnZlcnMgYXMgSnNvblZhbHVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHRocmVhZC9zdGFydCBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB3aXRoICR7bWNwU2VydmVyTmFtZXMubGVuZ3RofSBNQ1Agc2VydmVyKHMpOiAke21jcFNlcnZlck5hbWVzLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IG11bHRpUm9vdEFjdGl2ZSA9IHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pO1xuXHRcdGNvbnN0IHJ1bnRpbWVXb3Jrc3BhY2VSb290cyA9IG11bHRpUm9vdEFjdGl2ZSA/IHRoaXMuX3J1bnRpbWVXb3Jrc3BhY2VSb290cyhzZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZWxlY3RlZENhcGFiaWxpdHlSb290cyA9IFtcblx0XHRcdC4uLihtdWx0aVJvb3RBY3RpdmUgPyBhd2FpdCB0aGlzLl9zZWxlY3RlZENhcGFiaWxpdHlSb290cyhzZXNzaW9uKSA6IFtdKSxcblx0XHRcdC4uLmN1c3RvbWl6YXRpb25MYXVuY2guc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHMsXG5cdFx0XTtcblx0XHRjb25zdCBzdGFydFJlc3VsdCA9IGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9zdGFydCcsIFRocmVhZFN0YXJ0UmVzcG9uc2U+KCd0aHJlYWQvc3RhcnQnLCB7XG5cdFx0XHRjd2Q6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeS5mc1BhdGgsXG5cdFx0XHQuLi4ocnVudGltZVdvcmtzcGFjZVJvb3RzPy5sZW5ndGggPyB7IHJ1bnRpbWVXb3Jrc3BhY2VSb290cyB9IDoge30pLFxuXHRcdFx0Li4uKHNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RzLmxlbmd0aCA/IHsgc2VsZWN0ZWRDYXBhYmlsaXR5Um9vdHMgfSA6IHt9KSxcblx0XHRcdG1vZGVsOiByZXNvbHZlZE1vZGVsLm1vZGVsSWQsXG5cdFx0XHRtb2RlbFByb3ZpZGVyOiByZXNvbHZlZE1vZGVsLm1vZGVsUHJvdmlkZXIsXG5cdFx0XHRhcHByb3ZhbFBvbGljeSxcblx0XHRcdHNhbmRib3g6IHNhbmRib3hNb2RlLFxuXHRcdFx0YXBwcm92YWxzUmV2aWV3ZXIsXG5cdFx0XHRjb25maWc6IHRocmVhZENvbmZpZyxcblx0XHRcdGRldmVsb3Blckluc3RydWN0aW9uczogY3VzdG9taXphdGlvbkxhdW5jaC5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsXG5cdFx0XHRkeW5hbWljVG9vbHM6IHRoaXMuX2J1aWxkRHluYW1pY1Rvb2xzKHNlc3Npb24pLFxuXHRcdH0sIHRoaXMuX3RyYWNlQ29udGV4dChzZXNzaW9uKSk7XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzdGFydFJlc3VsdC50aHJlYWQuaWQ7XG5cdFx0aWYgKG11bHRpUm9vdEFjdGl2ZSAmJiAhc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXMgJiYgc3RhcnRSZXN1bHQucnVudGltZVdvcmtzcGFjZVJvb3RzPy5sZW5ndGgpIHtcblx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID0gc3RhcnRSZXN1bHQucnVudGltZVdvcmtzcGFjZVJvb3RzLm1hcChwYXRoID0+IFVSSS5maWxlKHBhdGgpKTtcblx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzWzBdO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Vuc3Vic2NyaWJlJz4oJ3RocmVhZC91bnN1YnNjcmliZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHt0aHJlYWRJZH1dIHRocmVhZC91bnN1YnNjcmliZSBhZnRlciBkaXNwb3NlZCBwcmV3YXJtIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb24udGhyZWFkSWQgPSB0aHJlYWRJZDtcblx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZE1jcFNpZyA9IG1jcFNlcnZlcnNTaWduYXR1cmUobWNwU2VydmVycyk7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9uc1NpZyA9IGN1c3RvbWl6YXRpb25MYXVuY2guc2lnbmF0dXJlO1xuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkUGVybWlzc2lvbnNTaWcgPSB0aGlzLl9wZXJtaXNzaW9uc1NpZ25hdHVyZShjb25maWdSZXNvdXJjZSk7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRUb29sc1NpZyA9IHRvb2xzU2lnbmF0dXJlKHNlc3Npb24uY2xpZW50VG9vbFNldC5tZXJnZWQoKSk7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyID0gcmVzb2x2ZWRNb2RlbC5tb2RlbFByb3ZpZGVyO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBtYXRlcmlhbGl6ZWQgc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB0aHJlYWRJZD0ke3Nlc3Npb24udGhyZWFkSWR9IHNhbmRib3g9JHtzYW5kYm94TW9kZX0gYXBwcm92YWw9JHthcHByb3ZhbFBvbGljeX0gcmV2aWV3ZXI9JHthcHByb3ZhbHNSZXZpZXdlcn1gKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLnNldChzZXNzaW9uLnRocmVhZElkLCBzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Ly8gQWR2ZXJ0aXNlIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzIG9uIHRoaXMgc2Vzc2lvbiBzbyBjbGllbnRzIHNlZVxuXHRcdC8vIHRoZW0gYXMgc2VydmVyLXByb3ZpZGVkLiBFeGVjdXRpb24gaGFwcGVucyBpbi1wcm9jZXNzIHZpYVxuXHRcdC8vIGBfaGFuZGxlRHluYW1pY1Rvb2xDYWxsUnBjYDsgdGhlIHRvb2xzIHdlcmUgcmVnaXN0ZXJlZCB3aXRoIGNvZGV4IGluXG5cdFx0Ly8gdGhlIGBkeW5hbWljVG9vbHNgIG9mIHRoZSBgdGhyZWFkL3N0YXJ0YCBhYm92ZS5cblx0XHRpZiAoIXNlc3Npb24uc2VydmVyVG9vbHNBZHZlcnRpc2VkICYmIHRoaXMuX3NlcnZlclRvb2xIb3N0KSB7XG5cdFx0XHRzZXNzaW9uLnNlcnZlclRvb2xzQWR2ZXJ0aXNlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9zZXJ2ZXJUb29sSG9zdC5hZHZlcnRpc2UoY29uZmlnUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdC8vIFN1cmZhY2Ugd29ya3NwYWNlIGFnZW50cyBhbmQgdGhlIHNraWxscy9ob29rcyBjb2RleCBsb2FkZWQgZm9yIHRoaXNcblx0XHQvLyB3b3JraW5nIGRpcmVjdG9yeSBpbiB0aGUgQ3VzdG9taXphdGlvbnMgdmlldyBub3cgdGhhdCB0aGUgY29ubmVjdGlvbiBpc1xuXHRcdC8vIHJlYWR5IGFuZCB0aGUgY3dkIGlzIGtub3duLiBCZXN0LWVmZm9ydCBhbmQgZmlyZS1hbmQtZm9yZ2V0LlxuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaFNraWxsSG9va0N1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdC8vIFJlLWFwcGx5IHRoZSBjbGllbnQtcGx1Z2luIHNraWxsIHJvb3RzIGFnYWluc3QgdGhlIG5vdy1yZWFkeVxuXHRcdC8vIGNvbm5lY3Rpb24gKHRoZXkgbWF5IGhhdmUgYmVlbiBzeW5jZWQgYmVmb3JlIGl0IGNhbWUgdXApLlxuXHRcdHZvaWQgdGhpcy5fcmVmcmVzaFNraWxsRXh0cmFSb290cygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlYXIgZG93biB0aGUgY3VycmVudCBjb2RleCB0aHJlYWQgYW5kIHN0YXJ0IGEgZnJlc2ggb25lIHNvIHRoZVxuXHQgKiBzZXNzaW9uJ3MgY3VycmVudCBjbGllbnQgdG9vbHMgYXJlIHJlZ2lzdGVyZWQgYXMgYGR5bmFtaWNUb29sc2AuXG5cdCAqIE9ubHkgc2FmZSBiZWZvcmUgYW55IHR1cm4gaGFzIGNvbW1pdHRlZCBoaXN0b3J5IG9uIHRoZSB0aHJlYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0YXJ0VGhyZWFkV2l0aEN1cnJlbnRUb29scyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBjb25maWdSZXNvdXJjZTogVVJJID0gc2Vzc2lvbi5zZXNzaW9uVXJpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0Y29uc3Qgb2xkVGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSByZXN0YXJ0aW5nIHRocmVhZCAke29sZFRocmVhZElkfSB0byBhcHBseSBjbGllbnQgdG9vbHMgWyR7c2Vzc2lvbi5jbGllbnRUb29sU2V0Lm1lcmdlZCgpLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKSB8fCAnKG5vbmUpJ31dYCk7XG5cdFx0aWYgKGNvbm4ua2luZCA9PT0gJ3JlYWR5JyAmJiBvbGRUaHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmRlbGV0ZShvbGRUaHJlYWRJZCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvdW5zdWJzY3JpYmUnPigndGhyZWFkL3Vuc3Vic2NyaWJlJywgeyB0aHJlYWRJZDogb2xkVGhyZWFkSWQgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHtvbGRUaHJlYWRJZH1dIHRocmVhZC91bnN1YnNjcmliZSBkdXJpbmcgdG9vbCByZXN0YXJ0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHNlc3Npb24udGhyZWFkSWQgPSB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgdGhpcy5fbWF0ZXJpYWxpemVJZk5lZWRlZChzZXNzaW9uLCBjb25maWdSZXNvdXJjZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9maXJlTWF0ZXJpYWxpemVkKHNlc3Npb246IElDb2RleFNlc3Npb24pOiB2b2lkIHtcblx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCB8fCAhc2Vzc2lvbi5jaGF0Q2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5tYXRlcmlhbGl6ZWRFdmVudEZpcmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkRXZlbnRGaXJlZCA9IHRydWU7XG5cdFx0Ly8gRW1pdCB0aGUgcmVzb2x2ZWQgc2V0IChpbmRleCAwID0gcHJvY2VzcyByb290KTsgdGhlIGhvc3QgcHJlc2VydmVzIHRoZVxuXHRcdC8vIHNlc3Npb24gc2V0J3MgdGFpbCB2aWEgYW4gaW5kZXgtMCByZXBsYWNlbWVudC5cblx0XHRjb25zdCBjaGF0ID0gc2Vzc2lvbi5jaGF0Q2hhbm5lbDtcblx0XHR0aGlzLl9vbkRpZE1hdGVyaWFsaXplQ2hhdC5maXJlKHtcblx0XHRcdGNoYXQsXG5cdFx0XHRwcm9qZWN0OiB1bmRlZmluZWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID8/IChzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPyBbc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCksXG5cdFx0XHQvLyBwcm92aWRlckRhdGEgcmVjb3JkcyB0aGUgcnVudGltZSdzIG93biBkdXJhYmxlIGlkLCBub3QgdGhlXG5cdFx0XHQvLyBhcHAtc2VydmVyIHRocmVhZCBpZCBcdTIwMTQgc2VlIHtAbGluayBJQ29kZXhQZXJzaXN0ZWRDaGF0fS4gVGhlXG5cdFx0XHQvLyB0aHJlYWQgaWQgaXMgc3RpbGwgcmVwb3J0ZWQgYXMgYGJhY2tpbmdTZXNzaW9uYC5cblx0XHRcdC4uLihzZXNzaW9uLnRocmVhZElkID8ge1xuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IGVuY29kZUNvZGV4Q2hhdCh7XG5cdFx0XHRcdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0XHRcdFx0Li4uKHNlc3Npb24ubW9kZWwgPyB7IG1vZGVsOiBzZXNzaW9uLm1vZGVsIH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4oc2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSA/IHsgb3duc01hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiB0cnVlIH0gOiB7fSksXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0YmFja2luZ1Nlc3Npb246IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbi50aHJlYWRJZCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9IDoge30pLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVQcmV3YXJtKHNlc3Npb246IElDb2RleFNlc3Npb24pOiB2b2lkIHtcblx0XHRpZiAoIXNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEZWZlciBwcmV3YXJtIHdoaWxlIHRoZSBob3N0IGhhcyBub3QgZmluYWxpemVkIHRoZSB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdC8vIChhIGZyZXNoIHdvcmt0cmVlIHNlc3Npb24gd2hvc2Ugd29ya3RyZWUgaXMgY3JlYXRlZCBvbiB0aGUgZmlyc3Qgc2VuZCkuXG5cdFx0Ly8gUHJld2FybWluZyB3b3VsZCBvdGhlcndpc2UgbWF0ZXJpYWxpemUgYSB0aHJlYWQgaW4gdGhlIHBpY2tlZCBmb2xkZXJcblx0XHQvLyBiZWZvcmUgdGhlIHdvcmt0cmVlIGV4aXN0cy5cblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUHJld2FybSBpcyBhIGJhY2tncm91bmQgbGF0ZW5jeSBvcHRpbWl6YXRpb24sIG5vdCBhIHVzZXIgYWN0aW9uLFxuXHRcdFx0Ly8gc28gaXQgbXVzdCBOT1QgdHJpZ2dlciBhIGNvbGQgU0RLIGRvd25sb2FkLiBXaGVuIHRoZSBTREsgaXNuJ3Rcblx0XHRcdC8vIGxvY2FsIHlldCwgc2tpcCBwcmV3YXJtOyB0aGUgZmlyc3QgYHNlbmRNZXNzYWdlYCBtYXRlcmlhbGl6ZXMgdGhlXG5cdFx0XHQvLyB0aHJlYWQgYW5kIGZpcmVzIHRoZSAoaG9zdC1sZXZlbCBwcm9ncmVzcy1yZXBvcnRlZCkgZG93bmxvYWQgdGhlbi5cblx0XHRcdGlmICghKGF3YWl0IHRoaXMuX2lzU2RrUmVzb2x2YWJsZVdpdGhvdXREb3dubG9hZCgpKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gU0RLIG5vdCBkb3dubG9hZGVkIHlldDsgc2tpcHBpbmcgcHJld2FybSBmb3Igc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB1bnRpbCBhIG1lc3NhZ2UgdHJpZ2dlcnMgdGhlIGRvd25sb2FkYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX21hdGVyaWFsaXplSWZOZWVkZWQoc2Vzc2lvbiwgc2Vzc2lvbi5zZXNzaW9uVXJpLCBmYWxzZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wcmV3YXJtQ2xhaW1lZCB8fCBzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHByZXdhcm0gcmVhZHkgc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB0aHJlYWRJZD0ke3Nlc3Npb24udGhyZWFkSWR9YCk7XG5cdFx0XHRjb25zdCBwcmV3YXJtVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dm9pZCB0aGlzLl9leHBpcmVQcmV3YXJtKHNlc3Npb24pO1xuXHRcdFx0fSwgQ29kZXhQcmV3YXJtVHRsTXMpO1xuXHRcdFx0c2Vzc2lvbi5wcmV3YXJtVGltZXIgPSBwcmV3YXJtVGltZXI7XG5cdFx0fSkoKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHByZXdhcm0gZmFpbGVkIHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhwaXJlUHJld2FybShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQgfHwgc2Vzc2lvbi5wcmV3YXJtQ2xhaW1lZCB8fCBzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdHNlc3Npb24udGhyZWFkSWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5kZWxldGUodGhyZWFkSWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Vuc3Vic2NyaWJlJz4oJ3RocmVhZC91bnN1YnNjcmliZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gcHJld2FybSBUVEwgZXZpY3Rpb24gc2Vzc2lvbj0ke3Nlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpfSB0aHJlYWRJZD0ke3RocmVhZElkfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHByZXdhcm0gVFRMIGV2aWN0aW9uIGZhaWxlZCBzZXNzaW9uPSR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9IHRocmVhZElkPSR7dGhyZWFkSWR9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogdm9pZCB7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQgfHwgIXNlc3Npb24udGhyZWFkSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUGVyc2lzdCBvbmx5IG9uY2UgdGhlIHByZXdhcm1lZCB0aHJlYWQgaXMgY2xhaW1lZCBieSBhIHR1cm4uIFRoaXNcblx0XHQvLyBhdm9pZHMgcmVzdG9yaW5nIGFuIGV4cGlyZWQsIG5ldmVyLXVzZWQgcHJld2FybSBhcyBhIGxpdmUgc2Vzc2lvbi5cblx0XHRjb25zdCBtdWx0aVJvb3RBY3RpdmUgPSB0aGlzLl9pc011bHRpUm9vdEFjdGl2ZShzZXNzaW9uKTtcblx0XHRjb25zdCBmaWVsZHMgPSB7XG5cdFx0XHR0aHJlYWRJZDogc2Vzc2lvbi50aHJlYWRJZCxcblx0XHRcdGN3ZDogc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0bW9kZWxJZDogc2Vzc2lvbi5tb2RlbD8uaWQsXG5cdFx0XHRhZ2VudDogc2Vzc2lvbi5hZ2VudCxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbXVsdGlSb290QWN0aXZlID8gc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZCxcblx0XHRcdG1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiBzZXNzaW9uLm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ID8/IG51bGwsXG5cdFx0fTtcblx0XHR2b2lkIHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoc2Vzc2lvbi5zZXNzaW9uVXJpLCBmaWVsZHMpO1xuXHRcdGlmIChtdWx0aVJvb3RBY3RpdmUpIHtcblx0XHRcdGNvbnN0IGNhbm9uaWNhbFNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHNlc3Npb24udGhyZWFkSWQpO1xuXHRcdFx0aWYgKCFpc0VxdWFsKHNlc3Npb24uc2Vzc2lvblVyaSwgY2Fub25pY2FsU2Vzc2lvblVyaSkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGNhbm9uaWNhbFNlc3Npb25VcmksIGZpZWxkcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyc2lzdFNlc3Npb25Nb2RlbChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQgfHwgIXNlc3Npb24ubW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZmllbGRzID0geyBtb2RlbElkOiBzZXNzaW9uLm1vZGVsLmlkIH07XG5cdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZShzZXNzaW9uLnNlc3Npb25VcmksIGZpZWxkcyk7XG5cdFx0aWYgKHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pKSB7XG5cdFx0XHRjb25zdCBjYW5vbmljYWxTZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uLnRocmVhZElkID8/IHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdGlmIChjYW5vbmljYWxTZXNzaW9uVXJpLnRvU3RyaW5nKCkgIT09IHNlc3Npb24uc2Vzc2lvblVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoY2Fub25pY2FsU2Vzc2lvblVyaSwgZmllbGRzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGFpbVByZXdhcm0oc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdHNlc3Npb24ucHJld2FybUNsYWltZWQgPSB0cnVlO1xuXHRcdGlmIChzZXNzaW9uLnByZXdhcm1UaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNlc3Npb24ucHJld2FybVRpbWVyKTtcblx0XHRcdHNlc3Npb24ucHJld2FybVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Fkb3B0V29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5IHx8IGlzRXF1YWwoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5wcmV3YXJtQ2xhaW1lZCkge1xuXHRcdFx0aWYgKHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCAmJiAhc2Vzc2lvbi5tYXRlcmlhbGl6ZVByb21pc2UpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fYWJhbmRvbk1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pO1xuXHRcdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0XHRpZiAodGhpcy5faXNNdWx0aVJvb3RBY3RpdmUoc2Vzc2lvbikpIHtcblx0XHRcdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA9IGRpc3RpbmN0V29ya2luZ0RpcmVjdG9yaWVzKFtcblx0XHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0XHQuLi4oc2Vzc2lvbi53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IFtdKSxcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NsYWltUHJld2FybShzZXNzaW9uKTtcblx0XHRjb25zdCBtYXRlcmlhbGl6ZVByb21pc2UgPSBzZXNzaW9uLm1hdGVyaWFsaXplUHJvbWlzZTtcblx0XHRpZiAobWF0ZXJpYWxpemVQcm9taXNlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBtYXRlcmlhbGl6ZVByb21pc2U7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHN0YWxlIHByZXdhcm0gZmFpbGVkIGJlZm9yZSB3b3JraW5nIGRpcmVjdG9yeSBjaGFuZ2VkIGZvciBzZXNzaW9uPSR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0aHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQ7XG5cdFx0aWYgKHRocmVhZElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNlc3Npb24udGhyZWFkSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmRlbGV0ZSh0aHJlYWRJZCk7XG5cdFx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbjtcblx0XHRcdGlmIChjb25uLmtpbmQgPT09ICdyZWFkeScpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvdW5zdWJzY3JpYmUnPigndGhyZWFkL3Vuc3Vic2NyaWJlJywgeyB0aHJlYWRJZCB9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHN0YWxlIHByZXdhcm0gdW5zdWJzY3JpYmUgZmFpbGVkIHNlc3Npb249JHtzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKX0gdGhyZWFkSWQ9JHt0aHJlYWRJZH06ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FiYW5kb25NYW5hZ2VkV29ya2luZ0RpcmVjdG9yeShzZXNzaW9uKTtcblx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRUdXJuU3RvcFdhdGNoKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBTdG9wV2F0Y2gge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdHNlc3Npb24udHVyblN0b3BXYXRjaCA9IHN0b3BXYXRjaDtcblx0XHRyZXR1cm4gc3RvcFdhdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJUdXJuU3RvcFdhdGNoKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBzZXNzaW9uLnR1cm5TdG9wV2F0Y2g/LmVsYXBzZWQoKTtcblx0XHRzZXNzaW9uLnR1cm5TdG9wV2F0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHR5cGVvZiBlbGFwc2VkID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUoZWxhcHNlZCkgPyBNYXRoLm1heCgwLCBlbGFwc2VkKSA6IDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kTWVzc2FnZShjaGF0OiBVUkksIHByb21wdDogc3RyaW5nLCBhdHRhY2htZW50cz86IHJlYWRvbmx5IE1lc3NhZ2VBdHRhY2htZW50W10sIHR1cm5JZD86IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10sIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRleHQgPSBjb250ZXh0ID8gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9uKGNoYXQsIGNvbnRleHQpO1xuXHRcdGlmICghc2Vzc2lvblVyaSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDb2RleCBjb252ZXJzYXRpb24gaXMgbm90IGJvdW5kOiAke2NoYXQudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXggREVCVUddIHNlbmRNZXNzYWdlIHNlc3Npb249JHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9IHByb21wdD0ke0pTT04uc3RyaW5naWZ5KHByb21wdCkuc2xpY2UoMCwgNjApfWApO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4IHNlc3Npb24gbm90IGZvdW5kOiAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0gKGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9LCBiaW5kaW5nPSR7dGhpcy5fc2Vzc2lvbklkQnlDaGF0VXJpLmdldChjaGF0LnRvU3RyaW5nKCkpID8/ICdub25lJ30sIHNlc3Npb25zPSR7Wy4uLnRoaXMuX3Nlc3Npb25zLmtleXMoKV0uam9pbignLCcpIHx8ICdub25lJ30pYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ1Jlc291cmNlID0gb3BlcmF0aW9uQ29udGV4dD8uY29uZmlndXJhdGlvblJlc291cmNlID8/IHNlc3Npb25Vcmk7XG5cdFx0dGhpcy5fZW5zdXJlTW9kZWxQcm92aWRlckF1dGhlbnRpY2F0ZWQoc2Vzc2lvbi5tb2RlbCk7XG5cdFx0Ly8gVGhlIGhvc3QgaGFuZHMgdXMgdGhlIGNvbXBsZXRlIHJlc29sdmVkIHNuYXBzaG90IChpbmRleCAwID0gdGhlIHByb2Nlc3Ncblx0XHQvLyByb290KSBvbiBldmVyeSBzZW5kLiBBZG9wdCBpbmRleCAwIGJlZm9yZSBmaXJzdCBtYXRlcmlhbGl6YXRpb24gbG9ja3MgdGhlXG5cdFx0Ly8gc3VicHJvY2VzcyBjd2Q7IGFuIGV4aXN0aW5nIHRocmVhZCBrZWVwcyBpdHMgY3dkIGFuZCByZWNlaXZlcyB0aGUgZnVsbFxuXHRcdC8vIHJlcGxhY2VtZW50IGJlbG93IHRocm91Z2ggbmF0aXZlIHR1cm4vc3RhcnQgb3B0aW9ucy5cblx0XHRhd2FpdCB0aGlzLl9hZG9wdFdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kKHNlc3Npb24sIHdvcmtpbmdEaXJlY3Rvcmllcz8uWzBdKTtcblx0XHQvLyBSZWNvcmQgdGhlIGZ1bGwgc2V0IE9VVFNJREUgdGhlIGFkb3B0aW9uIHBhdGg6IGEgcHJld2FybSBtYXkgaGF2ZVxuXHRcdC8vIGFscmVhZHkgbWF0ZXJpYWxpemVkIHRoZSB0aHJlYWQsIHlldCB0aGUgcmVjZWlwdCBpcyBmaXJlZCBvbiB0aGlzIGZpcnN0XG5cdFx0Ly8gc2VuZCBhbmQgbXVzdCBzdGlsbCBjYXJyeSB0aGUgcmVzb2x2ZWQgc2V0LiBSZXBsYWNlLCByYXRoZXIgdGhhbiBtZXJnZSxcblx0XHQvLyB0aGUgcHJldmlvdXMgc25hcHNob3QgYmVmb3JlIGFueSBzdGFydCwgcmVzdW1lLCBvciB0dXJuIHJlcXVlc3QgaXNcblx0XHQvLyBjb25zdHJ1Y3RlZC4gQSBtaXNzaW5nIHNuYXBzaG90IGlzIHJldGFpbmVkIG9ubHkgZm9yIGxlZ2FjeSBjb2xkLXJlc3VtZVxuXHRcdC8vIGNhbGxlcnMgdGhhdCByZWx5IG9uIHJlc3RvcmVkIG1ldGFkYXRhLlxuXHRcdGlmICh3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzID0gc2Vzc2lvbi5tdWx0aVJvb3RFbmFibGVkICYmIHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPiAxXG5cdFx0XHRcdD8gZGlzdGluY3RXb3JraW5nRGlyZWN0b3JpZXMoW1xuXHRcdFx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSA/PyB3b3JraW5nRGlyZWN0b3JpZXNbMF0sXG5cdFx0XHRcdFx0Li4ud29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDEpLFxuXHRcdFx0XHRdKVxuXHRcdFx0XHQ6IHdvcmtpbmdEaXJlY3Rvcmllcztcblx0XHR9XG5cdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRjb25zdCBlZmZlY3RpdmVUdXJuSWQgPSB0dXJuSWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHQvLyBNYXRlcmlhbGl6ZSB0aGUgYWRkcmVzc2VkIENvZGV4IHRocmVhZCBvbiBmaXJzdCBzZW5kLlxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9jbGFpbVByZXdhcm0oc2Vzc2lvbik7XG5cdFx0XHRhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZUlmTmVlZGVkKHNlc3Npb24sIGNvbmZpZ1Jlc291cmNlLCB0cnVlKTtcblx0XHRcdHRoaXMuX3BlcnNpc3RNYXRlcmlhbGl6ZWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleDoke3Nlc3Npb25JZH1dIG1hdGVyaWFsaXplIGZhaWxlZDogJHttZXNzYWdlfWApO1xuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9maXJlKHNlc3Npb25VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZDogZWZmZWN0aXZlVHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhNYXRlcmlhbGl6ZUZhaWxlZCcsIG1lc3NhZ2UgfSxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIG5lZWRzUmVzdW1lIGJlZm9yZSB0aGUgcmVzdW1lIGJsb2NrIGNsZWFycyBpdCBzbyByZXN0b3JlZCBzZXNzaW9ucyBuZXZlciByZWNlaXZlIGEgbGF0ZSBiYXNlbGluZS5cblx0XHRpZiAoIXNlc3Npb24uZmlyc3RUdXJuU2VudCAmJiAhc2Vzc2lvbi5uZWVkc1Jlc3VtZSkge1xuXHRcdFx0Y29uc3QgYmFzZWxpbmVXb3JraW5nRGlyZWN0b3JpZXMgPSBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA/PyAoc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5ID8gW3Nlc3Npb24ud29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fY2hlY2twb2ludFNlcnZpY2UuY2FwdHVyZUJhc2VsaW5lQ2hlY2twb2ludChjb25maWdSZXNvdXJjZSwgYmFzZWxpbmVXb3JraW5nRGlyZWN0b3JpZXMpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbklkfV0gQmFzZWxpbmUgY2hlY2twb2ludCBjYXB0dXJlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBDb2RleCByZWdpc3RlcnMgY2xpZW50IHRvb2xzIGFuZCBNQ1Agc2VydmVycyBvbmx5IGF0IGB0aHJlYWQvc3RhcnRgLlxuXHRcdC8vIElmIHRoZSB0aHJlYWQgd2FzIHByZXdhcm1lZCAob3Igb3RoZXJ3aXNlIHN0YXJ0ZWQpIGJlZm9yZSB0aGUgY3VycmVudFxuXHRcdC8vIGNsaWVudCB0b29scyAvIE1DUCBzZXJ2ZXJzIHdlcmUga25vd24sIHJlc3RhcnQgaXQgbm93IFx1MjAxNCBiZWZvcmUgYW55XG5cdFx0Ly8gdHVybiBjb21taXRzIGhpc3RvcnksIHNvIG5vdGhpbmcgaXMgbG9zdCBcdTIwMTQgc28gdGhlIHRvb2xzIGxhbmQgaW5cblx0XHQvLyBgZHluYW1pY1Rvb2xzYCBhbmQgdGhlIHNlcnZlcnMgaW4gYGNvbmZpZy5tY3Bfc2VydmVyc2AuXG5cdFx0Y29uc3QgdG9vbHNDaGFuZ2VkID0gdG9vbHNTaWduYXR1cmUoc2Vzc2lvbi5jbGllbnRUb29sU2V0Lm1lcmdlZCgpKSAhPT0gc2Vzc2lvbi5tYXRlcmlhbGl6ZWRUb29sc1NpZztcblx0XHRjb25zdCBtY3BDaGFuZ2VkID0gbWNwU2VydmVyc1NpZ25hdHVyZSh0aGlzLl9idWlsZFNlc3Npb25NY3BTZXJ2ZXJzKHNlc3Npb24pKSAhPT0gc2Vzc2lvbi5tYXRlcmlhbGl6ZWRNY3BTaWc7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbkxhdW5jaCA9IGF3YWl0IHRoaXMuX2J1aWxkQ3VzdG9taXphdGlvbkxhdW5jaChzZXNzaW9uKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uc0NoYW5nZWQgPSBjdXN0b21pemF0aW9uTGF1bmNoLnNpZ25hdHVyZSAhPT0gc2Vzc2lvbi5tYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9uc1NpZztcblx0XHRjb25zdCBwZXJtaXNzaW9uc0NoYW5nZWQgPSB0aGlzLl9wZXJtaXNzaW9uc1NpZ25hdHVyZShjb25maWdSZXNvdXJjZSkgIT09IHNlc3Npb24ubWF0ZXJpYWxpemVkUGVybWlzc2lvbnNTaWc7XG5cdFx0aWYgKCFzZXNzaW9uLmZpcnN0VHVyblNlbnQgJiYgIXNlc3Npb24ubmVlZHNSZXN1bWUgJiYgKHRvb2xzQ2hhbmdlZCB8fCBtY3BDaGFuZ2VkIHx8IGN1c3RvbWl6YXRpb25zQ2hhbmdlZCB8fCBwZXJtaXNzaW9uc0NoYW5nZWQpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0YXJ0VGhyZWFkV2l0aEN1cnJlbnRUb29scyhzZXNzaW9uLCBjb25maWdSZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RNYXRlcmlhbGl6ZWRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleDoke3Nlc3Npb25JZH1dIHRvb2wgcmUtbWF0ZXJpYWxpemUgZmFpbGVkOiAke21lc3NhZ2V9YCk7XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uID0gdGhpcy5fY2xlYXJUdXJuU3RvcFdhdGNoKHNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb25VcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0XHR0dXJuSWQ6IGVmZmVjdGl2ZVR1cm5JZCxcblx0XHRcdFx0XHRkdXJhdGlvbixcblx0XHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdDb2RleE1hdGVyaWFsaXplRmFpbGVkJywgbWVzc2FnZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChzZXNzaW9uLmZpcnN0VHVyblNlbnQgJiYgIXNlc3Npb24ubmVlZHNSZXN1bWUgJiYgY3VzdG9taXphdGlvbnNDaGFuZ2VkKSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2UgYWdlbnRzIGhhdmUgbm8gY2xpZW50LXB1c2ggZXZlbnQgdG8gcmVjb25jaWxlIHRoZW0uIEFcblx0XHRcdC8vIHNlbmQtdGltZSBzaWduYXR1cmUgY2hhbmdlIG11c3QgcmVzdW1lIHRoZSBleGlzdGluZyB0aHJlYWQgc28gQ29kZXhcblx0XHRcdC8vIHJlbG9hZHMgaXRzIHJvbGVzIGFuZCBkZXZlbG9wZXIgaW5zdHJ1Y3Rpb25zIHdpdGhvdXQgbG9zaW5nIGhpc3RvcnkuXG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvbkZvclJlbG9hZChzZXNzaW9uKTtcblx0XHR9XG5cdFx0aWYgKHNlc3Npb24ubmVlZHNSZXN1bWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc3VtZVNlc3Npb24oc2Vzc2lvbiwgY29ubik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHRcdHR1cm5JZDogZWZmZWN0aXZlVHVybklkLFxuXHRcdFx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRlcnJvclR5cGU6ICdDb2RleFJlc3VtZUZhaWxlZCcsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVyciksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogZWZmZWN0aXZlVHVybklkLCBkdXJhdGlvbiB9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRocmVhZElkID0gc2Vzc2lvbi50aHJlYWRJZCE7XG5cdFx0Ly8gQnVmZmVyIHRoZSBwcm9tcHQgdGV4dCBmb3IgYHR1cm4vc3RhcnRlZGAncyB1c2VyTWVzc2FnZSBmYWxsYmFjay5cblx0XHRzZXNzaW9uLmxhc3RQcm9tcHRUZXh0ID0gcHJvbXB0O1xuXHRcdHNlc3Npb24uY3VycmVudFR1cm5JZCA9IGVmZmVjdGl2ZVR1cm5JZDtcblx0XHRzZXNzaW9uLm1vZGlmaWVkVGltZSA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5fc3RhcnRUdXJuU3RvcFdhdGNoKHNlc3Npb24pO1xuXHRcdGxldCBjbGVhbnVwUGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaXNDb21wYWN0Q29tbWFuZCA9IHBhcnNlTGVhZGluZ1NsYXNoQ29tbWFuZChwcm9tcHQpPy5jb21tYW5kID09PSBDT0RFWF9DT01QQUNUX1NMQVNIX0NPTU1BTkQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpc0NvbXBhY3RDb21tYW5kKSB7XG5cdFx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9jb21wYWN0L3N0YXJ0Jz4oJ3RocmVhZC9jb21wYWN0L3N0YXJ0JywgeyB0aHJlYWRJZCB9LCB0aGlzLl90cmFjZUNvbnRleHQoc2Vzc2lvbikpO1xuXHRcdFx0XHRzZXNzaW9uLmZpcnN0VHVyblNlbnQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZElucHV0ID0gcmVzb2x2ZUNvZGV4SW5wdXQocHJvbXB0LCBhdHRhY2htZW50cyk7XG5cdFx0XHRjbGVhbnVwUGF0aHMgPSByZXNvbHZlZElucHV0LmNsZWFudXBQYXRocztcblx0XHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5fcmVzb2x2ZU1vZGVsKHNlc3Npb24pO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbCA9IHRoaXMuX3JvdXRlQ29kZXhNb2RlbChtb2RlbCk7XG5cdFx0XHRjb25zdCB0dXJuT3B0aW9ucyA9IHRoaXMuX3R1cm5TdGFydE9wdGlvbnMoc2Vzc2lvbiwgcmVzb2x2ZWRNb2RlbC5tb2RlbElkLCBjdXN0b21pemF0aW9uTGF1bmNoLmRldmVsb3Blckluc3RydWN0aW9ucywgY29uZmlnUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaG9zdEluc3RydWN0aW9ucyA9IHJlc29sdmVBZ2VudEhvc3RJbnN0cnVjdGlvbnMob3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0dXJuL3N0YXJ0Jz4oJ3R1cm4vc3RhcnQnLCB7XG5cdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRpbnB1dDogcmVzb2x2ZWRJbnB1dC5pbnB1dC5zbGljZSgpLFxuXHRcdFx0XHRtb2RlbDogcmVzb2x2ZWRNb2RlbC5tb2RlbElkLFxuXHRcdFx0XHQuLi50dXJuT3B0aW9ucyxcblx0XHRcdFx0Li4uKGhvc3RJbnN0cnVjdGlvbnM/Lmxlbmd0aCA/IHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsQ29udGV4dDoge1xuXHRcdFx0XHRcdFx0J3ZzY29kZS5hZ2VudEhvc3QnOiB7IGtpbmQ6ICdhcHBsaWNhdGlvbicsIHZhbHVlOiBob3N0SW5zdHJ1Y3Rpb25zLmpvaW4oJ1xcblxcbicpIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSA6IHt9KSxcblx0XHRcdH0sIHRoaXMuX3RyYWNlQ29udGV4dChzZXNzaW9uKSk7XG5cdFx0XHQvLyBUaGUgdGhyZWFkIG5vdyBoYXMgY29tbWl0dGVkIGhpc3Rvcnk7IGNsaWVudCB0b29scyBhcmUgbG9ja2VkIHRvXG5cdFx0XHQvLyB3aGF0IHdhcyByZWdpc3RlcmVkIGF0IGB0aHJlYWQvc3RhcnRgIGFuZCB3b24ndCBiZSByZS1hcHBsaWVkLlxuXHRcdFx0c2Vzc2lvbi5maXJzdFR1cm5TZW50ID0gdHJ1ZTtcblx0XHRcdC8vIFdlIGRvbid0IGF3YWl0IHR1cm4gY29tcGxldGlvbiBoZXJlIFx1MjAxNCB0aGUgbm90aWZpY2F0aW9uXG5cdFx0XHQvLyBzdHJlYW0gZW1pdHMgQ2hhdFR1cm5Db21wbGV0ZSBhc3luY2hyb25vdXNseS5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHR0aGlzLl9maXJlKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uOiB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbikgfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRjb25zdCBvcGVyYXRpb24gPSBpc0NvbXBhY3RDb21tYW5kID8gJ3RocmVhZC9jb21wYWN0L3N0YXJ0JyA6ICd0dXJuL3N0YXJ0Jztcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb2RleDoke3Nlc3Npb25JZH1dICR7b3BlcmF0aW9ufSBlcnJvcjogJHttZXNzYWdlfWApO1xuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLl9jbGVhclR1cm5TdG9wV2F0Y2goc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9maXJlKHNlc3Npb25VcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZDogZWZmZWN0aXZlVHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiBpc0NvbXBhY3RDb21tYW5kID8gJ0NvZGV4Q29tcGFjdGlvbkVycm9yJyA6ICdDb2RleFR1cm5FcnJvcicsIC4uLmV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8obWVzc2FnZSkgfSxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiBlZmZlY3RpdmVUdXJuSWQsIGR1cmF0aW9uIH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBCZXN0LWVmZm9ydCB0ZW1wLWZpbGUgY2xlYW51cC4gSW1hZ2Utb24tbG9jYWxJbWFnZSB3aWxsIGJlXG5cdFx0XHQvLyByZS1yZWFkIGJ5IGNvZGV4IHN5bmNocm9ub3VzbHkgZHVyaW5nIHRoZSB0dXJuIHNvIHRoaXMgaXNcblx0XHRcdC8vIHNhZmUgdG8gZGVmZXIgc2xpZ2h0bHk7IHdlIGRlbGV0ZSBhZnRlciBhIGdlbmVyb3VzIGdyYWNlLlxuXHRcdFx0aWYgKGNsZWFudXBQYXRocy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBjbGVhbnVwUGF0aHMpIHtcblx0XHRcdFx0XHRcdHRyeSB7IGZzLnVubGlua1N5bmMocCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgMzBfMDAwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRQZW5kaW5nTWVzc2FnZXMoY2hhdDogVVJJLCBzdGVlcmluZ01lc3NhZ2U6IFBlbmRpbmdNZXNzYWdlIHwgdW5kZWZpbmVkLCBfcXVldWVkTWVzc2FnZXM6IHJlYWRvbmx5IFBlbmRpbmdNZXNzYWdlW10pOiB2b2lkIHtcblx0XHQvLyBRdWV1ZWQgbWVzc2FnZXMgYXJlIGNvbnN1bWVkIHNlcnZlci1zaWRlIChBZ2VudFNpZGVFZmZlY3RzIGRyaXZlcyBhXG5cdFx0Ly8gZnJlc2ggdHVybiBwZXIgYGlkbGVgKTsgb25seSB0aGUgc2luZ2xlIHN0ZWVyaW5nIG1lc3NhZ2UgcmVhY2hlcyB0aGVcblx0XHQvLyBhZ2VudCBmb3IgbWlkLXR1cm4gaW5qZWN0aW9uLlxuXHRcdGlmICghc3RlZXJpbmdNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFN0ZWVyaW5nIGlzIGFsd2F5cyBhZGRyZXNzZWQgYnkgYSBjb25jcmV0ZSBjaGF0IGNoYW5uZWwgVVJJLCB3aGljaFxuXHRcdC8vIHJlc29sdmVzIHRocm91Z2ggdGhlIGJpbmRpbmcgcmVjb3JkZWQgd2hlbiB0aGF0IGNoYXQgd2FzIHByb3Zpc2lvbmVkXG5cdFx0Ly8gb3IgcmVzdG9yZWQgXHUyMDE0IG5ldmVyIHRocm91Z2ggVVJJIHNoYXBlLlxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihjaGF0KTtcblx0XHRpZiAoIXNlc3Npb25VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gYF9zeW5jUGVuZGluZ01lc3NhZ2VzYCByZS1zZW5kcyB0aGUgY3VycmVudCBzdGVlcmluZyBtZXNzYWdlIG9uIGV2ZXJ5XG5cdFx0Ly8gcGVuZGluZy1zdGF0ZSBjaGFuZ2U7IGlnbm9yZSBhIHN0ZWVyaW5nIG1lc3NhZ2UgYWxyZWFkeSBpbiBmbGlnaHQuXG5cdFx0aWYgKHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuaGFzKHN0ZWVyaW5nTWVzc2FnZS5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXBwVHVybklkID0gc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkO1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdGNvbnN0IHRleHQgPSBzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS50ZXh0O1xuXHRcdGNvbnN0IGhhc0NvbnRlbnQgPSB0ZXh0Lmxlbmd0aCA+IDAgfHwgKHN0ZWVyaW5nTWVzc2FnZS5tZXNzYWdlLmF0dGFjaG1lbnRzPy5sZW5ndGggPz8gMCkgPiAwO1xuXHRcdC8vIFN0ZWVyaW5nIG9ubHkgbWFrZXMgc2Vuc2UgbWlkLXR1cm4uIFdpdGhvdXQgYW4gYWN0aXZlIGNvZGV4IHR1cm4sIGFcblx0XHQvLyByZWFkeSBjb25uZWN0aW9uLCBhIHRocmVhZCwgb3IgYW55IGNvbnRlbnQgd2UgY2Fubm90IHN0ZWVyIFx1MjAxNCBjbGVhclxuXHRcdC8vIHRoZSBwZW5kaW5nIGJ1YmJsZSBzbyBpdCBkb2Vzbid0IHN0aWNrICh0aGUgbW9kZWwgbmV2ZXIgc2F3IGl0KS5cblx0XHRpZiAoIWFwcFR1cm5JZCB8fCBjb25uLmtpbmQgIT09ICdyZWFkeScgfHwgc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkIHx8ICFoYXNDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9maXJlU3RlZXJpbmdDb25zdW1lZChzZXNzaW9uLCBzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IGlucHV0IH0gPSByZXNvbHZlQ29kZXhJbnB1dCh0ZXh0LCBzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS5hdHRhY2htZW50cyk7XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBzZXNzaW9uLnRocmVhZElkO1xuXHRcdC8vIEJ1ZmZlciBzbyB0aGUgY29kZXggYHVzZXJNZXNzYWdlYCBlY2hvIGNhbiBwcm9tb3RlIHRoaXMgaW50byBhXG5cdFx0Ly8gdmlzaWJsZSB0dXJuIChzZWUge0BsaW5rIF9oYW5kbGVTdGVlcmVkVXNlck1lc3NhZ2V9KS5cblx0XHRzZXNzaW9uLnBlbmRpbmdTdGVlcmluZ0ZsaXBzLnNldChzdGVlcmluZ01lc3NhZ2UuaWQsIHN0ZWVyaW5nTWVzc2FnZSk7XG5cdFx0dm9pZCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0dXJuL3N0ZWVyJz4oJ3R1cm4vc3RlZXInLCB7XG5cdFx0XHR0aHJlYWRJZCxcblx0XHRcdGlucHV0OiBpbnB1dC5zbGljZSgpLFxuXHRcdFx0ZXhwZWN0ZWRUdXJuSWQ6IGFwcFR1cm5JZCxcblx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0Ly8gU3RlZXIgcmVqZWN0ZWQgKGNvbW1vbmx5IGFuIGBleHBlY3RlZFR1cm5JZGAgbWlzbWF0Y2ggYmVjYXVzZSB0aGVcblx0XHRcdC8vIHR1cm4ganVzdCBjb21wbGV0ZWQpLiBEcm9wIHRoZSBidWZmZXJlZCBlbnRyeSBhbmQgY2xlYXIgdGhlXG5cdFx0XHQvLyBwZW5kaW5nIGJ1YmJsZSBzbyBpdCBkb2Vzbid0IHN0aWNrLlxuXHRcdFx0aWYgKHNlc3Npb24ucGVuZGluZ1N0ZWVyaW5nRmxpcHMuZGVsZXRlKHN0ZWVyaW5nTWVzc2FnZS5pZCkpIHtcblx0XHRcdFx0dGhpcy5fZmlyZVN0ZWVyaW5nQ29uc3VtZWQoc2Vzc2lvbiwgc3RlZXJpbmdNZXNzYWdlLmlkKTtcblx0XHRcdH1cblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBKc29uUnBjRXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0dXJuL3N0ZWVyIHNraXBwZWQ6ICR7ZXJyLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7c2Vzc2lvbklkfV0gdHVybi9zdGVlciBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWJvcnQoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRleHQgPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gdGhpcy5fcmVzb2x2ZUNvbnZlcnNhdGlvblNlc3Npb24oY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0aWYgKCFzZXNzaW9uVXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENsZWFyIGFueSBzdGVlcmluZyBidWZmZXJlZCBmb3IgdGhlIHR1cm4gd2UncmUgYWJvcnRpbmcgc28gaXRzXG5cdFx0Ly8gcGVuZGluZyBidWJibGUgZG9lc24ndCBvdXRsaXZlIHRoZSB0dXJuLlxuXHRcdHRoaXMuX2RyYWluUGVuZGluZ1N0ZWVyaW5nKHNlc3Npb24pO1xuXHRcdGlmICghc2Vzc2lvbi5jdXJyZW50QXBwVHVybklkIHx8IHNlc3Npb24udGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0aHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQ7XG5cdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0aWYgKGNvbm4ua2luZCAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndHVybi9pbnRlcnJ1cHQnPigndHVybi9pbnRlcnJ1cHQnLCB7XG5cdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHR0dXJuSWQ6IHNlc3Npb24uY3VycmVudEFwcFR1cm5JZCxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHtzZXNzaW9uSWR9XSB0dXJuL2ludGVycnVwdCBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIHRoZSBhY3RpdmUtY2xpZW50IGhhbmRsZXMgYWRkcmVzc2VkIHRvIGV4YWN0bHkgdGhpcyBjaGF0LiBDYWxsZWRcblx0ICogb24gZGlzcG9zYWwgc28gYSBkZXBhcnRpbmcgY2hhdCBuZXZlciBsZWFrcyBpdHMgaGFuZGxlcyBpblxuXHQgKiB7QGxpbmsgX2FjdGl2ZUNsaWVudEhhbmRsZXN9IFx1MjAxNCB0aGVyZSBpcyBubyBzaWJsaW5nIGluZmVyZW5jZSwgc28gYVxuXHQgKiBzaWJsaW5nIGNoYXQncyBoYW5kbGVzIGFyZSBsZWZ0IHVudG91Y2hlZC5cblx0ICovXG5cdHByaXZhdGUgX3JlbW92ZUFjdGl2ZUNsaWVudEhhbmRsZXNGb3JDaGF0KGNoYXQ6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHByZWZpeCA9IGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwYDtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGhhbmRsZV0gb2YgdGhpcy5fYWN0aXZlQ2xpZW50SGFuZGxlcykge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0aGFuZGxlLnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVDbGllbnRIYW5kbGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VDaGF0KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvcGVyYXRpb25Db250ZXh0ID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCk7XG5cdFx0Y29uc3QgcnVudGltZVNlc3Npb24gPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHR0aGlzLl9yZW1vdmVBY3RpdmVDbGllbnRIYW5kbGVzRm9yQ2hhdChjaGF0KTtcblx0XHQvLyBDb25maWd1cmF0aW9uLXNjb3BlIHJlZiB0cmFja2luZyBpcyBpbmRlcGVuZGVudCBvZiB3aGV0aGVyIGFcblx0XHQvLyBydW50aW1lIGlzIGN1cnJlbnRseSByZXNvbHZhYmxlIGZvciBgY2hhdGAgXHUyMDE0IGFuIHVuYWRkcmVzc2FibGUgY2hhdFxuXHRcdC8vIHN0aWxsIG9jY3VwaWVkIGEgc2xvdCBpbiBpdHMgc2NvcGUncyByZWYgc2V0IHdoZW4gaXQgd2FzIGNyZWF0ZWQuXG5cdFx0YXdhaXQgdGhpcy5fcmVsZWFzZUNvbmZpZ1Njb3BlSWZEb25lKGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGlmICghcnVudGltZVNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVJ1bnRpbWVTZXNzaW9uKHJ1bnRpbWVTZXNzaW9uLCB0cnVlKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeUNoYXRVcmkuZGVsZXRlKGNoYXQudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWxlYXNlQ2hhdChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IHJ1bnRpbWVTZXNzaW9uID0gdGhpcy5fcmVzb2x2ZUNvbnZlcnNhdGlvblNlc3Npb24oY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0aWYgKCFydW50aW1lU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlUnVudGltZVNlc3Npb24ocnVudGltZVNlc3Npb24sIGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZWFyIGRvd24gdGhlIHJ1bnRpbWUgYmFja2luZyBhIGNoYXQsIGFkZHJlc3NlZCBieSB0aGUgcnVudGltZSdzIG93blxuXHQgKiBzZXNzaW9uIFVSSS4gYGRlbGV0ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5YCBkaXN0aW5ndWlzaGVzIHRoZVxuXHQgKiBkZXN0cnVjdGl2ZSB7QGxpbmsgSUFnZW50Q2hhdHMuZGlzcG9zZUNoYXR9IHBhdGggZnJvbSB0aGVcblx0ICogbm9uLWRlc3RydWN0aXZlIHtAbGluayBJQWdlbnRDaGF0cy5yZWxlYXNlQ2hhdH0gKGlkbGUtZXZpY3Rpb24pIHBhdGguXG5cdCAqXG5cdCAqIE9ubHkgYSByZWxlYXNlIChgZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPT09IGZhbHNlYCkgbm8tb3BzIGZvclxuXHQgKiBydW50aW1lcyB3aXRoIG5vdGhpbmcgZHVyYWJsZSB0byByZXN1bWUgZnJvbSAocHJvdmlzaW9uYWwgcnVudGltZXMgd2hvc2Vcblx0ICogY29kZXggdGhyZWFkIHdhcyBuZXZlciBzdGFydGVkIFx1MjAxNCBldmljdGluZyB0aGVtIGZyb20gbWVtb3J5IHdvdWxkIGxvc2Vcblx0ICogdGhlaXIgb25seSBjb3B5IG9mIHN0YXRlKSBhbmQgZm9yIHJ1bnRpbWVzIHdpdGggYSB0dXJuIGluIGZsaWdodCBcdTIwMTRcblx0ICogYHRocmVhZC91bnN1YnNjcmliZWAgbWlkLXR1cm4gd291bGQgZHJvcCBsaXZlIHByb2dyZXNzLiBBIGRlc3RydWN0aXZlXG5cdCAqIGRpc3Bvc2UgaGFzIG5vIGR1cmFibGUgc3RhdGUgdG8gcHJlc2VydmUgZWl0aGVyIHdheSwgc28gaXQgYWx3YXlzIHRlYXJzXG5cdCAqIGEgcHJvdmlzaW9uYWwgcnVudGltZSBkb3duOyBsZWF2aW5nIG9uZSBiZWhpbmQgd291bGQgbGVhayBpdHMgcGVuZGluZ1xuXHQgKiByZWdpc3RyaWVzLCBNQ1AgY29udHJvbGxlciwgcHJld2FybSB0aW1lciwgYW5kIChvbmNlIGNsYWltZWQpIG1hbmFnZWRcblx0ICogd29ya2luZyBkaXJlY3RvcnksIGFuZCB3b3VsZCBsZXQgYSBzdGlsbC1ydW5uaW5nIHByZXdhcm0gY29udGludWF0aW9uXG5cdCAqIG1hdGVyaWFsaXplIGEgdGhyZWFkIGZvciBhIGNoYXQgdGhlIGhvc3QgYWxyZWFkeSBjb25zaWRlcnMgZ29uZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VSdW50aW1lU2Vzc2lvbihzZXNzaW9uVXJpOiBVUkksIGRlbGV0ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdGlmIChkZWxldGVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZWNsYWltTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnlJZk5vdExpdmUoc2Vzc2lvblVyaSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdC8vIFByb3Zpc2lvbmFsIHNlc3Npb25zIGhhdmUgbm8gY29kZXggdGhyZWFkIG9uIGRpc2sgdG8gcmVzdW1lIGZyb207XG5cdFx0XHQvLyByZWxlYXNpbmcgdGhlbSB3b3VsZCBsb3NlIHRoZWlyIGluLW1lbW9yeSBzdGF0ZS4gTGVhdmUgdGhlbSBpblxuXHRcdFx0Ly8gcGxhY2UuIExpa2V3aXNlIGEgZGVmZW5zaXZlIGFjdGl2ZS10dXJuIGd1YXJkOiB0aGUgb3JjaGVzdHJhdG9yXG5cdFx0XHQvLyBhbHJlYWR5IHNraXBzIGV2aWN0aW9uIHdoaWxlIGEgdHVybiBpcyBhY3RpdmUsIGJ1dCBvbmUgY291bGQgaGF2ZVxuXHRcdFx0Ly8gc3RhcnRlZCBiZXR3ZWVuIHRoYXQgY2hlY2sgYW5kIHRoaXMgY2FsbC5cblx0XHRcdGlmIChzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQgfHwgc2Vzc2lvbi5jdXJyZW50VHVybklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3Nlc3Npb24udGhyZWFkSWR9XSBSZWxlYXNpbmcgaWRsZSBzZXNzaW9uIGZyb20gbWVtb3J5IChkdXJhYmxlIHN0YXRlIHByZXNlcnZlZClgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIERpc3Bvc2luZyBwcm92aXNpb25hbCBzZXNzaW9uICR7c2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCl9IChjb2RleCB0aHJlYWQgbmV2ZXIgc3RhcnRlZClgKTtcblx0XHR9XG5cdFx0aWYgKCFkZWxldGVNYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSAmJiBzZXNzaW9uLm1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHR0aGlzLl9yZWxlYXNlZE1hbmFnZWRXb3JraW5nRGlyZWN0b3JpZXMuc2V0KHNlc3Npb25JZCwgc2Vzc2lvbi5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3RlYXJkb3duU2Vzc2lvbkluTWVtb3J5KHNlc3Npb24sIHNlc3Npb25JZCwgZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNoYXJlZCBpbi1tZW1vcnkgdGVhcmRvd24gZm9yIGEgY29kZXggc2Vzc2lvbjogZHJvcHMgdGhlIHRyYWNrZWQgZW50cnksXG5cdCAqIGRpc3Bvc2VzIGl0cyBNQ1AgY29udHJvbGxlciwgdW5wYXJrcyBwZW5kaW5nIGFwcHJvdmFscyAvIGNsaWVudCB0b29sIGNhbGxzXG5cdCAqIC8gdXNlciBpbnB1dHMsIGFuZCB1bnN1YnNjcmliZXMgdGhlIGNvZGV4IHRocmVhZCAoYHRocmVhZC91bnN1YnNjcmliZWApLlxuXHQgKiBUaGUgY29kZXggdGhyZWFkJ3Mgb24tZGlzayByb2xsb3V0IGlzIGFsd2F5cyBwcmVzZXJ2ZWQgKHRoZXJlIGlzIG5vXG5cdCAqIGFwcC1zZXJ2ZXIgZGVsZXRlKSwgc28gYSByZWxlYXNlZCBzZXNzaW9uIGNhbiBzdGlsbCBiZSByZXN1bWVkIGxhdGVyIFx1MjAxNFxuXHQgKiBidXQgYSBkZXN0cnVjdGl2ZSBgZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnlgIGFsc28gcmVsZWFzZXMgdGhpc1xuXHQgKiBydW50aW1lJ3MgcmV0YWluZWQgT1RlbCB0cmFjZSBjb250ZXh0IChzZWUge0BsaW5rIF90cmFjZUNvbnRleHR9KSwgc2luY2Vcblx0ICogdGhhdCBjb250ZXh0IGlzIHNjb3BlZCB0byB0aGlzIGV4YWN0IHJ1bnRpbWUncyBsaWZldGltZSwgbm90IHRvIGl0c1xuXHQgKiBkdXJhYmxlIHJvbGxvdXQuIElkbGUgZXZpY3Rpb24gbXVzdCBub3QgcmVsZWFzZSBpdDogYSByZWxlYXNlZCBydW50aW1lXG5cdCAqIGlzIGV4cGVjdGVkIHRvIGJlIHJlLWFkZHJlc3NlZCBsYXRlciBhbmQgc2hvdWxkIGtlZXAgdGhlIHNhbWUgdHJhY2Vcblx0ICogcGFyZW50IHdoZW4gaXQgaXMuIFNoYXJlZCBieSB0aGUgZGVzdHJ1Y3RpdmUgY2hhdC1kaXNwb3NlIHBhdGggKHdoaWNoXG5cdCAqIHRoZSBvcmNoZXN0cmF0b3IgcGFpcnMgd2l0aCBkdXJhYmxlIGRlbGV0aW9uKSBhbmQgdGhlIG5vbi1kZXN0cnVjdGl2ZVxuXHQgKiBjaGF0LXJlbGVhc2UgKGlkbGUgZXZpY3Rpb24pIHBhdGguXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF90ZWFyZG93blNlc3Npb25Jbk1lbW9yeShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBzZXNzaW9uSWQ6IHN0cmluZywgZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcnk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzZXNzaW9uLmRpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9jbGFpbVByZXdhcm0oc2Vzc2lvbik7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0c2Vzc2lvbi5tY3BDb250cm9sbGVyPy5kaXNwb3NlKCk7XG5cdFx0Ly8gSWYgdGhlIHNlc3Npb24gY29udHJpYnV0ZWQgY2xpZW50LXBsdWdpbiBza2lsbHMsIGRyb3AgdGhlbSBmcm9tIHRoZVxuXHRcdC8vIHByb2Nlc3MtZ2xvYmFsIHNraWxsLXJvb3QgdW5pb24gbm93IHRoYXQgaXQgaXMgZ29uZS5cblx0XHRpZiAoIXNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMuaXNFbXB0eSgpKSB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMoKTtcblx0XHR9XG5cdFx0Ly8gUmVtb3ZlIHRoZSBtYW5hZ2VkIHRlbXAgZm9sZGVyIGNyZWF0ZWQgZm9yIGEgc2Vzc2lvbiB0aGF0IGhhZCBub1xuXHRcdC8vIGNsaWVudC1zdXBwbGllZCB3b3JraW5nIGRpcmVjdG9yeS4gQmVzdC1lZmZvcnQ7IHRoZSBPUyB0ZW1wIGRpciBpc1xuXHRcdC8vIHJlY2xhaW1lZCBhbnl3YXksIGJ1dCBjbGVhbiB1cCBwcm9hY3RpdmVseSBzbyBpdCBkb2Vzbid0IGFjY3VtdWxhdGUuXG5cdFx0aWYgKGRlbGV0ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5ICYmIHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZU1hbmFnZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24ubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH1cblx0XHRpZiAoZGVsZXRlTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHRoaXMuX3JlbGVhc2VkTWFuYWdlZFdvcmtpbmdEaXJlY3Rvcmllcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHRcdC8vIEtleSBtdXN0IG1hdGNoIHRoZSBleGFjdCBhY3F1aXNpdGlvbiBrZXkgaW4gYF90cmFjZUNvbnRleHRgOiB0aGlzXG5cdFx0XHQvLyBydW50aW1lJ3Mgb3duIGBzZXNzaW9uVXJpYCwgbmV2ZXIgdGhlIGNvbmZpZyBzY29wZSBvciBjaGF0IGNoYW5uZWxcblx0XHRcdC8vIGl0IGhhcHBlbnMgdG8gYmUgYWRkcmVzc2VkIGJ5LlxuXHRcdFx0dGhpcy5fb3RlbFNlcnZpY2UucmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoc2Vzc2lvbi5zZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi5jdXN0b21pemF0aW9uRGlyZWN0b3J5KSB7XG5cdFx0XHRjb25zdCBkaXIgPSBzZXNzaW9uLmN1c3RvbWl6YXRpb25EaXJlY3RvcnkuZnNQYXRoO1xuXHRcdFx0ZnMucHJvbWlzZXMucm0oZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGZhaWxlZCB0byByZW1vdmUgY3VzdG9taXphdGlvbiBmb2xkZXIgJHtkaXJ9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmRlbGV0ZShzZXNzaW9uLnRocmVhZElkKTtcblx0XHRcdHRoaXMuX2ZpbGVFZGl0T2JzZXJ2ZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbi50aHJlYWRJZCk7XG5cdFx0fVxuXHRcdC8vIFVucGFyayBhbnkgcGVuZGluZyBhcHByb3ZhbHMgc28gY29kZXggZG9lc24ndCBkZWFkbG9jayB3YWl0aW5nXG5cdFx0Ly8gb24gYSByZXNwb25zZSB3ZSB3aWxsIG5ldmVyIGRlbGl2ZXIuXG5cdFx0c2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0Ly8gUmVqZWN0IGFueSBpbi1mbGlnaHQgY2xpZW50IHRvb2wgY2FsbHMgc28gdGhlaXIgYGl0ZW0vdG9vbC9jYWxsYFxuXHRcdC8vIGhhbmRsZXJzIHVud2luZCBpbnN0ZWFkIG9mIGF3YWl0aW5nIGEgcmVzcG9uc2UgdGhhdCB3b24ndCBhcnJpdmUuXG5cdFx0c2Vzc2lvbi5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0c2Vzc2lvbi5wZW5kaW5nVXNlcklucHV0cy5yZWplY3RBbGwobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdC8vIENsZWFyIGFueSBidWZmZXJlZCBzdGVlcmluZyBzbyBpdHMgcGVuZGluZyBidWJibGUgZG9lc24ndCBsZWFrLlxuXHRcdHRoaXMuX2RyYWluUGVuZGluZ1N0ZWVyaW5nKHNlc3Npb24pO1xuXHRcdC8vIFRlYXIgZG93biBhbnkgbGl2ZSBzdWJhZ2VudCBjaGlsZCB0aHJlYWRzIHNwYXduZWQgYnkgdGhpcyBzZXNzaW9uIHNvXG5cdFx0Ly8gdGhlaXIgcGFya2VkIGFwcHJvdmFscyB1bndpbmQgYW5kIHRoZWlyIHRyYWNraW5nIGRvZXNuJ3QgbGVhay4gVGhlXG5cdFx0Ly8gb3JjaGVzdHJhdG9yIGNsb3NlcyB0aGUgY2hpbGQgY29udmVyc2F0aW9ucyBhcyBwYXJ0IG9mIHNlc3Npb24gdGVhcmRvd24uXG5cdFx0Zm9yIChjb25zdCBbY2hpbGRUaHJlYWRJZCwgc3ViYWdlbnRdIG9mIHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQpIHtcblx0XHRcdGlmIChzdWJhZ2VudC5wYXJlbnRTZXNzaW9uSWQgPT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHRzdWJhZ2VudC5zZXNzaW9uLnBlbmRpbmdDb21tYW5kQXBwcm92YWxzLmRlbnlBbGwoJ2RlY2xpbmUnKTtcblx0XHRcdFx0dGhpcy5fc3ViYWdlbnRzQnlUaHJlYWRJZC5kZWxldGUoY2hpbGRUaHJlYWRJZCk7XG5cdFx0XHRcdHRoaXMuX2ZpbGVFZGl0T2JzZXJ2ZXJzLmRlbGV0ZUFuZERpc3Bvc2UoY2hpbGRUaHJlYWRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdGlmIChjb25uLmtpbmQgPT09ICdyZWFkeScgJiYgc2Vzc2lvbi50aHJlYWRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCB0aHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQ7XG5cdFx0XHQvLyBgdGhyZWFkL3Vuc3Vic2NyaWJlYCBpcyB0aGUgY29kZXgtbmF0aXZlIHdheSB0byByZWxlYXNlIGFcblx0XHRcdC8vIHNlc3Npb24uIENvZGV4IGV2aWN0cyBhZnRlciBpdHMgMzAtbWludXRlIGlkbGUgZ3JhY2UuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvdW5zdWJzY3JpYmUnPigndGhyZWFkL3Vuc3Vic2NyaWJlJywgeyB0aHJlYWRJZCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3RocmVhZElkfV0gdGhyZWFkL3Vuc3Vic2NyaWJlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hhbmdlTW9kZWwoY2hhdDogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24sIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uQ29udGV4dCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRpZiAoIXNlc3Npb25VcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpO1xuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRjb25zdCBzdXBwb3J0ZWQgPSB0aGlzLl9zdXBwb3J0ZWRNb2RlbE9yVW5kZWZpbmVkKG1vZGVsKTtcblx0XHRcdGlmICghc3VwcG9ydGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29kZXggbW9kZWwgJyR7bW9kZWwuaWR9JyBpcyBub3QgYXZhaWxhYmxlLmApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJldmlvdXNQcm92aWRlciA9IHNlc3Npb24ubWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlciA/PyAoc2Vzc2lvbi5tb2RlbCA/IHBhcnNlQ29kZXhNb2RlbFNlbGVjdGlvbihzZXNzaW9uLm1vZGVsKS5tb2RlbFByb3ZpZGVyIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IG5leHRQcm92aWRlciA9IHRoaXMuX3JvdXRlQ29kZXhNb2RlbChzdXBwb3J0ZWQpLm1vZGVsUHJvdmlkZXI7XG5cdFx0XHR0aGlzLl9lbnN1cmVNb2RlbFByb3ZpZGVyQXV0aGVudGljYXRlZChzdXBwb3J0ZWQpO1xuXHRcdFx0c2Vzc2lvbi5tb2RlbCA9IHN1cHBvcnRlZDtcblx0XHRcdGlmIChwcmV2aW91c1Byb3ZpZGVyICE9PSB1bmRlZmluZWQgJiYgcHJldmlvdXNQcm92aWRlciAhPT0gbmV4dFByb3ZpZGVyKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0U2Vzc2lvbkZvck1vZGVsUHJvdmlkZXJDaGFuZ2Uoc2Vzc2lvbiwgbmV4dFByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX3BlcnNpc3RTZXNzaW9uTW9kZWwoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVHJ1bmNhdGUgdGhlIGNoYXQgQWdlbnQgSG9zdCBhZGRyZXNzZXMsIG5vdCB0aGUgc2Vzc2lvbiBpdCBiZWxvbmdzIHRvLlxuXHQgKlxuXHQgKiBDb2RleCBiYWNrcyBldmVyeSBjaGF0IHdpdGggaXRzIG93biB0aHJlYWQsIHNvIHRoZSByb2xsYmFjayB0YXJnZXQgaXMgdGhlXG5cdCAqIHJ1bnRpbWUgYm91bmQgdG8gYGNoYXRgIFx1MjAxNCByZXNvbHZlZCB0aHJvdWdoIHRoZSByZWNvcmRlZCBiaW5kaW5nIG9yIHRoZVxuXHQgKiBob3N0LXN1cHBsaWVkIGNvbnRleHQsIG5ldmVyIGJ5IHJlLWRlcml2aW5nIG1lbWJlcnNoaXAgZnJvbSBhIFVSSS4gV2hlblxuXHQgKiBgY2hhdGAgaXMgb21pdHRlZCAoYSBzZXNzaW9uLWFkZHJlc3NlZCBjYWxsZXIpIHRoZSBzZXNzaW9uJ3Mgb3duIHJ1bnRpbWVcblx0ICogaXMgdGhlIHRhcmdldCwgd2hpY2ggaXMgYWxzbyB3aGF0IGFuIHVucmVzb2x2YWJsZSBjaGF0IGZhbGxzIGJhY2sgdG8gdmlhXG5cdCAqIHRoZSBob3N0IGNvbnRleHQncyBvd25pbmcgc2Vzc2lvbi5cblx0ICpcblx0ICogQ29kZXggcm9sbHMgYmFjayBieSBhIGNvdW50IG9mIHRyYWlsaW5nIHR1cm5zLiBSZXNvbHZlIGhvdyBtYW55IHR1cm5zXG5cdCAqIGZvbGxvdyBgdHVybklkYCAob3IgYWxsIG9mIHRoZW0gd2hlbiBvbWl0dGVkKSBmcm9tIHRoZSBwZXJzaXN0ZWQgdGhyZWFkLFxuXHQgKiB3aG9zZSB0dXJuIGlkcyBtYXRjaCB0aGUgd29ya2JlbmNoJ3MgcmVzdG9yZWQgdHVybiBpZHMgKHNlZVxuXHQgKiB7QGxpbmsgcmVwbGF5VGhyZWFkVG9UdXJuc30pLiBVbmtub3duIGlkcyBuby1vcCB0byBhdm9pZCBkYXRhIGxvc3MuXG5cdCAqL1xuXHRhc3luYyB0cnVuY2F0ZUNoYXQoY2hhdDogVVJJLCB0dXJuSWQ/OiBzdHJpbmcsIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldFVyaSA9IHRoaXMuX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9uKGNoYXQsIGNvbnRleHQpO1xuXHRcdGlmICghdGFyZ2V0VXJpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlYWQgPSBhd2FpdCB0aGlzLl9yZWFkU2Vzc2lvbih0YXJnZXRVcmkpO1xuXHRcdGlmICghcmVhZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0dXJucyA9IHJlYWQudGhyZWFkLnR1cm5zID8/IFtdO1xuXHRcdGlmICh0dXJucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IG51bVR1cm5zOiBudW1iZXI7XG5cdFx0aWYgKHR1cm5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRudW1UdXJucyA9IHR1cm5zLmxlbmd0aDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQSBsaXZlIHNlc3Npb24ncyB3b3JrYmVuY2ggdHVybiBpZCBtYXBzIHRvIGEgY29kZXggdHVybiBpZDsgYVxuXHRcdFx0Ly8gcmVzdG9yZWQgc2Vzc2lvbiBhbHJlYWR5IHVzZXMgY29kZXggdHVybiBpZHMsIHNvIGZhbGwgYmFjayB0byB0aGVcblx0XHRcdC8vIGlkIGFzLWlzIG9uIGEgbWlzcy5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHRhcmdldFVyaSkpO1xuXHRcdFx0Y29uc3QgY29kZXhUdXJuSWQgPSBzZXNzaW9uPy5jb2RleFR1cm5JZEJ5SG9zdFR1cm5JZC5nZXQodHVybklkKSA/PyB0dXJuSWQ7XG5cdFx0XHRjb25zdCBpbmRleCA9IHR1cm5zLmZpbmRJbmRleCh0ID0+IHQuaWQgPT09IGNvZGV4VHVybklkKTtcblx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHRydW5jYXRlQ2hhdDogdHVybklkICR7dHVybklkfSBub3QgZm91bmQgaW4gdGhyZWFkICR7cmVhZC50aHJlYWQuaWR9OyBza2lwcGluZ2ApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRudW1UdXJucyA9IHR1cm5zLmxlbmd0aCAtIChpbmRleCArIDEpO1xuXHRcdH1cblx0XHRpZiAobnVtVHVybnMgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGF3YWl0IGNvbm4uY2xpZW50LnJlcXVlc3Q8J3RocmVhZC9yb2xsYmFjayc+KCd0aHJlYWQvcm9sbGJhY2snLCB7IHRocmVhZElkOiByZWFkLnRocmVhZC5pZCwgbnVtVHVybnMgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleDoke3JlYWQudGhyZWFkLmlkfV0gdGhyZWFkL3JvbGxiYWNrIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgb25BcmNoaXZlZENoYW5nZWQoc2Vzc2lvblVyaTogVVJJLCBpc0FyY2hpdmVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGhyZWFkSWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVGhyZWFkSWQoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKHRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29ubiA9IHRoaXMuX2Nvbm5lY3Rpb247XG5cdFx0aWYgKGNvbm4ua2luZCAhPT0gJ3JlYWR5Jykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aWYgKGlzQXJjaGl2ZWQpIHtcblx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL2FyY2hpdmUnPigndGhyZWFkL2FyY2hpdmUnLCB7IHRocmVhZElkIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3VuYXJjaGl2ZSc+KCd0aHJlYWQvdW5hcmNoaXZlJywgeyB0aHJlYWRJZCB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4OiR7dGhyZWFkSWR9XSB0aHJlYWQvJHtpc0FyY2hpdmVkID8gJ2FyY2hpdmUnIDogJ3VuYXJjaGl2ZSd9IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIGNvZGV4IHRocmVhZCBpZCBmb3IgYSBzZXNzaW9uOiBpbi1tZW1vcnkgXHUyMTkyIHBlcnNpc3RlZCBvdmVybGF5LiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVGhyZWFkSWQoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpO1xuXHRcdGlmIChleGlzdGluZz8udGhyZWFkSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnRocmVhZElkO1xuXHRcdH1cblx0XHRjb25zdCBvdmVybGF5ID0gYXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS5yZWFkKHNlc3Npb25VcmkpO1xuXHRcdHJldHVybiBvdmVybGF5LnRocmVhZElkO1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gYHJlcXVlc3RJZGAgaXMgdGhlIGhvc3Qtc2lkZSB0b29sQ2FsbElkOyBpdGVyYXRlIHNlc3Npb25zIChpbmNsdWRpbmdcblx0XHQvLyBsaXZlIHN1YmFnZW50IGNoaWxkIHNlc3Npb25zLCB3aG9zZSBjb21tYW5kIGFwcHJvdmFscyBsaXZlIG9uIHRoZWlyXG5cdFx0Ly8gb3duIHJlZ2lzdHJ5KSBhbmQgcmVzb2x2ZSB0aGUgZmlyc3QgbWF0Y2guIE1pcnJvcnMgQ2xhdWRlL0NvcGlsb3QuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBbXG5cdFx0XHQuLi50aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSxcblx0XHRcdC4uLlsuLi50aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLnZhbHVlcygpXS5tYXAocyA9PiBzLnNlc3Npb24pLFxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5yZXNwb25kKHJlcXVlc3RJZCwgYXBwcm92ZWQgPyAnYWNjZXB0JyA6ICdkZWNsaW5lJykpIHtcblx0XHRcdFx0aWYgKCFhcHByb3ZlZCkge1xuXHRcdFx0XHRcdC8vIFJlbWVtYmVyIHRoZSBkZWNsaW5lIHNvIHRoZSB0b29sJ3MgYGl0ZW0vY29tcGxldGVkYCAod2hpY2hcblx0XHRcdFx0XHQvLyBjb2RleCByZXBvcnRzIGFzIGEgZ2VuZXJpYyBmYWlsdXJlKSBtYXBzIHRvIGB1c2VyQ2FuY2VsbGVkYC5cblx0XHRcdFx0XHRzZXNzaW9uLm1hcFN0YXRlLmRlY2xpbmVkVG9vbENhbGxzLmFkZChyZXF1ZXN0SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0OiB1bmtub3duIHJlcXVlc3RJZD0ke3JlcXVlc3RJZH1gKTtcblx0fVxuXG5cdHJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIGFuc3dlcnM/OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+KTogdm9pZCB7XG5cdFx0Ly8gYHJlcXVlc3RJZGAgd2FzIG1pbnRlZCBwZXIgcmVxdWVzdDsgZmluZCB0aGUgb3duaW5nIHNlc3Npb24gYW5kXG5cdFx0Ly8gcmVzb2x2ZSBpdHMgcGFya2VkIGRlZmVycmVkLiBNaXJyb3JzIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0LlxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHNlc3Npb24ucGVuZGluZ1VzZXJJbnB1dHMucmVzcG9uZChyZXF1ZXN0SWQsIHsgcmVzcG9uc2UsIGFuc3dlcnMgfSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gcmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdDogdW5rbm93biByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9YCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25zdHJ1Y3QgdGhlIHR1cm5zIG9mIGFuIGFkZHJlc3NlZCBjaGF0IGZyb20gaXRzIGJhY2tpbmcgdGhyZWFkJ3Ncblx0ICogcGVyc2lzdGVkIHJvbGxvdXQuIENoYXQtYWRkcmVzc2VkIG9ubHk6IHRoZSBvd25pbmcgc2Vzc2lvbiBjb21lcyBmcm9tIHRoZVxuXHQgKiByZWNvcmRlZCBiaW5kaW5nIG9yIHRoZSBob3N0LXN1cHBsaWVkIGNvbnRleHQsIG5ldmVyIGZyb20gdGhlIFVSSS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXRNZXNzYWdlcyhjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRjb25zdCBvcGVyYXRpb25Db250ZXh0ID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9uKGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGlmICghc2Vzc2lvblVyaSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKHNlc3Npb24/Lm5lZWRzUmVzdW1lKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdH1cblx0XHRjb25zdCByZWFkID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0cmV0dXJuIHJlYWRcblx0XHRcdD8gcmVwbGF5VGhyZWFkVG9UdXJucyhyZWFkLnRocmVhZCwgdG9Sb2xsb3V0VHVybk1vZGVscyhyZWFkLnJvbGxvdXRNZXRhZGF0YSksIHJlYWQucm9sbG91dE1ldGFkYXRhPy50aHJlYWRDb29yZGluYXRpb25CeVR1cm5JZClcblx0XHRcdDogW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXN1bWVTZXNzaW9uKHNlc3Npb246IElDb2RleFNlc3Npb24sIGNvbm5lY3Rpb24/OiBJQ29ubmVjdGlvblJlYWR5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFzZXNzaW9uLm5lZWRzUmVzdW1lKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uLnJlc3VtZVByb21pc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc2Vzc2lvbi5yZXN1bWVQcm9taXNlKSB7XG5cdFx0XHRzZXNzaW9uLnJlc3VtZVByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0aHJlYWRJZCA9IHNlc3Npb24udGhyZWFkSWQ7XG5cdFx0XHRcdGlmICghdGhyZWFkSWQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXN1bWUgQ29kZXggc2Vzc2lvbiAke3Nlc3Npb24uc2Vzc2lvbklkfTogbm8gYmFja2luZyB0aHJlYWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb25uID0gY29ubmVjdGlvbiA/PyBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0XHRcdGlmIChzZXNzaW9uLnVuc3Vic2NyaWJlQmVmb3JlUmVzdW1lKSB7XG5cdFx0XHRcdFx0Ly8gYHRocmVhZC9yZXN1bWVgIGRlbGliZXJhdGVseSByZWpvaW5zIGEgbG9hZGVkIHN1YnNjcmliZWQgdGhyZWFkIGFuZFxuXHRcdFx0XHRcdC8vIGlnbm9yZXMgY29uZmxpY3Rpbmcgb3ZlcnJpZGVzLiBVbnN1YnNjcmliZSBmaXJzdCBzbyBhcHAtc2VydmVyXG5cdFx0XHRcdFx0Ly8gcmVsb2FkcyB0aGUgcGVyc2lzdGVkIGhpc3Rvcnkgd2l0aCB0aGUgY3VycmVudCBsYXVuY2gtb25seSBjb25maWcuXG5cdFx0XHRcdFx0YXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Vuc3Vic2NyaWJlJz4oJ3RocmVhZC91bnN1YnNjcmliZScsIHsgdGhyZWFkSWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbWNwU2VydmVycyA9IHRoaXMuX2J1aWxkU2Vzc2lvbk1jcFNlcnZlcnMoc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25MYXVuY2ggPSBhd2FpdCB0aGlzLl9idWlsZEN1c3RvbWl6YXRpb25MYXVuY2goc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IG11bHRpUm9vdEFjdGl2ZSA9IHRoaXMuX2lzTXVsdGlSb290QWN0aXZlKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBydW50aW1lV29ya3NwYWNlUm9vdHMgPSBtdWx0aVJvb3RBY3RpdmUgPyB0aGlzLl9ydW50aW1lV29ya3NwYWNlUm9vdHMoc2Vzc2lvbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkTW9kZWwgPSB0aGlzLl9yb3V0ZUNvZGV4TW9kZWwoYXdhaXQgdGhpcy5fcmVzb2x2ZU1vZGVsKHNlc3Npb24pKTtcblx0XHRcdFx0Y29uc3QgcmVzdW1lUmVzdWx0ID0gYXdhaXQgY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL3Jlc3VtZScsIFRocmVhZFJlc3VtZVJlc3BvbnNlPihcblx0XHRcdFx0XHQndGhyZWFkL3Jlc3VtZScsXG5cdFx0XHRcdFx0YnVpbGRDb2RleFJlc3VtZVBhcmFtcyhcblx0XHRcdFx0XHRcdHJlc29sdmVkTW9kZWwubW9kZWxQcm92aWRlcixcblx0XHRcdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRcdFx0bWNwU2VydmVycyxcblx0XHRcdFx0XHRcdHJ1bnRpbWVXb3Jrc3BhY2VSb290cyxcblx0XHRcdFx0XHRcdGN1c3RvbWl6YXRpb25MYXVuY2guY29uZmlnLFxuXHRcdFx0XHRcdFx0Y3VzdG9taXphdGlvbkxhdW5jaC5kZXZlbG9wZXJJbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0XHR0aGlzLl9pbWFnZUdlbmVyYXRpb25FbmFibGVkRm9yTW9kZWxQcm92aWRlcihyZXNvbHZlZE1vZGVsLm1vZGVsUHJvdmlkZXIpLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0dGhpcy5fdHJhY2VDb250ZXh0KHNlc3Npb24pLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAobXVsdGlSb290QWN0aXZlICYmICFzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyAmJiByZXN1bWVSZXN1bHQucnVudGltZVdvcmtzcGFjZVJvb3RzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcyA9IHJlc3VtZVJlc3VsdC5ydW50aW1lV29ya3NwYWNlUm9vdHMubWFwKHBhdGggPT4gVVJJLmZpbGUocGF0aCkpO1xuXHRcdFx0XHRcdHNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSA9IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzWzBdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlc3Npb24ubWF0ZXJpYWxpemVkTWNwU2lnID0gbWNwU2VydmVyc1NpZ25hdHVyZShtY3BTZXJ2ZXJzKTtcblx0XHRcdFx0c2Vzc2lvbi5tYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9uc1NpZyA9IGN1c3RvbWl6YXRpb25MYXVuY2guc2lnbmF0dXJlO1xuXHRcdFx0XHRzZXNzaW9uLm1hdGVyaWFsaXplZFBlcm1pc3Npb25zU2lnID0gdGhpcy5fcGVybWlzc2lvbnNTaWduYXR1cmUoc2Vzc2lvbi5zZXNzaW9uVXJpKTtcblx0XHRcdFx0c2Vzc2lvbi5uZWVkc1Jlc3VtZSA9IGZhbHNlO1xuXHRcdFx0XHRzZXNzaW9uLnVuc3Vic2NyaWJlQmVmb3JlUmVzdW1lID0gZmFsc2U7XG5cdFx0XHR9KSgpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRzZXNzaW9uLnJlc3VtZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXdhaXQgc2Vzc2lvbi5yZXN1bWVQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1Nlc3Npb25Gb3JSZWxvYWQoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdHNlc3Npb24udW5zdWJzY3JpYmVCZWZvcmVSZXN1bWUgPSB0cnVlO1xuXHRcdHNlc3Npb24ubmVlZHNSZXN1bWUgPSB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlc2NyaWJlIGEgaG9zdC1hZGRyZXNzZWQgY2hhdC4gYHByb3ZpZGVyRGF0YWAgaXMgdGhlIG9wYXF1ZSBiYWNraW5nXG5cdCAqIHRoaXMgYWdlbnQgbWludGVkIGZvciB0aGUgY2hhdCwgc28gaXQgXHUyMDE0IG5vdCB0aGUgYWRkcmVzc2VkIGNoYXQgVVJJIFx1MjAxNFxuXHQgKiBuYW1lcyB0aGUgcnVudGltZSB0byByZXN0b3JlICh0aGV5IGNvaW5jaWRlIGZvciBhIHNlc3Npb24tYmFja2luZ1xuXHQgKiBydW50aW1lIGFuZCBkaWZmZXIgZm9yIGFueXRoaW5nIHJlLWtleWVkIG9udG8gYW5vdGhlciBjb252ZXJzYXRpb24pLlxuXHQgKlxuXHQgKiBUaGUgcmVnaXN0ZXJlZCBlbnRyeSBpcyBkZWxpYmVyYXRlbHkga2V5ZWQgYW5kIGFkZHJlc3NlZCBieSB0aGF0IGJhY2tpbmdcblx0ICogaWQ6IGBfY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeWAgZGVyaXZlcyBpdHMgYHNlc3Npb25VcmlgLCBzbyB0aGlzIGNhblxuXHQgKiBuZXZlciBtaW50IGFuIGVudHJ5IHdob3NlIGtleSBhbmQgVVJJIGRpc2FncmVlLiBUaGUgKmFkZHJlc3NlZCogY2hhdFxuXHQgKiBVUkkgc3RheXMgaG9zdC1mYWNpbmcgb25seSBcdTIwMTQgaXQgbGFiZWxzIHRoZSByZXR1cm5lZCBtZXRhZGF0YSwgd2hpbGUgdGhlXG5cdCAqIGNvbnRleHQncyBgY29uZmlndXJhdGlvblJlc291cmNlYCBuYW1lcyB0aGUgc2Vzc2lvbiB0aGUgaG9zdCdzIHNlcnZlclxuXHQgKiB0b29scyBhcmUgYWR2ZXJ0aXNlZCBvbi5cblx0ICovXG5cdGFzeW5jIGdldENoYXRNZXRhZGF0YShjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBwcm92aWRlckRhdGE/OiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KS5jb25maWd1cmF0aW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgYmFja2luZyA9IHByb3ZpZGVyRGF0YSA/IGRlY29kZUNvZGV4Q2hhdChwcm92aWRlckRhdGEpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGJhY2tpbmc/LnNlc3Npb25JZCA/PyBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0Ly8gQSBsaXZlIHJ1bnRpbWUgYW5zd2VycyBmcm9tIG1lbW9yeS4gYHRocmVhZC9yZWFkYCB3b3VsZCBvdGhlcndpc2Vcblx0XHQvLyByZS1lbnRlciB0aGUgYXBwLXNlcnZlciwgd2hpY2ggY2Fubm90IGFuc3dlciB3aGlsZSBvbmUgb2YgaXRzIG93blxuXHRcdC8vIHRocmVhZHMgaXMgYmxvY2tlZCB3YWl0aW5nIG9uIGEgZHluYW1pYyB0b29sIGNhbGwgXHUyMDE0IGV4YWN0bHkgdGhlIHN0YXRlXG5cdFx0Ly8gYSBzZXNzaW9uIHNlcnZlciB0b29sIChgZ2V0X2N1cnJlbnRfc2Vzc2lvbmApIHJ1bnMgaW4uXG5cdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmIChsaXZlPy50aHJlYWRJZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2hhdCxcblx0XHRcdFx0c3RhcnRUaW1lOiBsaXZlLnN0YXJ0VGltZSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lOiBsaXZlLm1vZGlmaWVkVGltZSxcblx0XHRcdFx0c3VtbWFyeTogbGl2ZS5zdW1tYXJ5LFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGxpdmUud29ya2luZ0RpcmVjdG9yaWVzID8/IChsaXZlLndvcmtpbmdEaXJlY3RvcnkgPyBbbGl2ZS53b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCksXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBiYWNraW5nVXJpID0gYmFja2luZyA/IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgYmFja2luZy5zZXNzaW9uSWQpIDogc2Vzc2lvbjtcblx0XHRjb25zdCByZWFkID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb24oYmFja2luZ1VyaSk7XG5cdFx0aWYgKCFyZWFkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBSZWdpc3RlciB0aGUgc2Vzc2lvbiBpbiBvdXIgbWFwIHNvIHN1YnNlcXVlbnQgc2VuZE1lc3NhZ2UgdHJpZ2dlcnNcblx0XHQvLyB0aHJlYWQvcmVzdW1lIChEZWNpc2lvbiA4KS4gVGhlIHRocmVhZElkIGNhbWUgZnJvbSB0aGUgbWV0YWRhdGFcblx0XHQvLyBvdmVybGF5IG9yIGZyb20gYHRocmVhZC9saXN0YCAod2hlbiB0aGUgc2Vzc2lvbiB3YXMgbWF0ZXJpYWxpemVkXG5cdFx0Ly8gaW4gYSBwcmlvciBwcm9jZXNzKTsgYF9yZWFkU2Vzc2lvbmAgcmV0dXJucyB0aGUgcmVzb2x2ZWQgaWQuXG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl93aXRoV29ya2luZ0RpcmVjdG9yaWVzKFxuXHRcdFx0YXdhaXQgdGhpcy5fdGhyZWFkVG9NZXRhZGF0YShyZWFkLnRocmVhZCwgY2hhdCwgcmVhZC5yb2xsb3V0TWV0YWRhdGEpLFxuXHRcdFx0cmVhZC5wZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0KTtcblx0XHRpZiAoIXRoaXMuX3Nlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcmVhZC50aHJlYWQuY3dkID8gVVJJLmZpbGUocmVhZC50aHJlYWQuY3dkKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRocmVhZElkID0gcmVhZC50aHJlYWQuaWQ7XG5cdFx0XHRjb25zdCBvdmVybGF5ID0gYXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS5yZWFkKGJhY2tpbmdVcmkpO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWRNb2RlbCA9IG1ldGFkYXRhLm1vZGVsID8/IChyZWFkLnBlcnNpc3RlZE1vZGVsSWQgPyB7IGlkOiByZWFkLnBlcnNpc3RlZE1vZGVsSWQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBtYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyID0gcmVhZC5yb2xsb3V0TWV0YWRhdGE/LnNlbGVjdGVkTW9kZWw/Lm1vZGVsUHJvdmlkZXJcblx0XHRcdFx0Pz8gcmVhZC5yb2xsb3V0TWV0YWRhdGE/Lm9yaWdpbk1vZGVsUHJvdmlkZXJcblx0XHRcdFx0Pz8gcmVhZC50aHJlYWQubW9kZWxQcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gdGhpcy5fY3JlYXRlUmVzdW1lZFNlc3Npb25FbnRyeShzZXNzaW9uSWQsIHRocmVhZElkLCB3b3JraW5nRGlyZWN0b3J5LCByZXN0b3JlZE1vZGVsLCB1bmRlZmluZWQsIG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcmllcywgdW5kZWZpbmVkLCBvdmVybGF5LmFnZW50LCBtYXRlcmlhbGl6ZWRNb2RlbFByb3ZpZGVyKTtcblx0XHRcdC8vIEFkb3B0IHRoZSBiYWNraW5nIHRocmVhZCdzIG93biB0aW1lc3RhbXBzIHNvIGEgbGF0ZXIgbGl2ZSBsb29rdXBcblx0XHRcdC8vIHJlcG9ydHMgd2hlbiB0aGUgY29udmVyc2F0aW9uIGFjdHVhbGx5IHN0YXJ0ZWQsIG5vdCB3aGVuIHRoaXNcblx0XHRcdC8vIHByb2Nlc3MgaGFwcGVuZWQgdG8gcmUtYXR0YWNoIHRvIGl0LiBBIHRocmVhZCB0aGF0IHJlcG9ydHMgbm9uZVxuXHRcdFx0Ly8ga2VlcHMgdGhlIGNvbnN0cnVjdGlvbiB0aW1lIHJhdGhlciB0aGFuIGZhbGxpbmcgYmFjayB0byAxOTcwLlxuXHRcdFx0cmVzdG9yZWQuc3RhcnRUaW1lID0gbWV0YWRhdGEuc3RhcnRUaW1lIHx8IHJlc3RvcmVkLnN0YXJ0VGltZTtcblx0XHRcdHJlc3RvcmVkLm1vZGlmaWVkVGltZSA9IG1ldGFkYXRhLm1vZGlmaWVkVGltZSB8fCByZXN0b3JlZC5tb2RpZmllZFRpbWU7XG5cdFx0XHRyZXN0b3JlZC5zdW1tYXJ5ID0gbWV0YWRhdGEuc3VtbWFyeTtcblx0XHRcdC8vIFJlcXVpcmUgb3VyIG93biByZWNvcmRlZCBleHBsaWNpdCBwYXRoIHRvIHBvc2l0aXZlbHkgY29ycm9ib3JhdGVcblx0XHRcdC8vIHRoZSBhcHAtc2VydmVyJ3MgZ3JvdW5kLXRydXRoIGN3ZCBiZWZvcmUgYWRvcHRpbmcgaXQgYXMgbWFuYWdlZDpcblx0XHRcdC8vIGByZWFkLnRocmVhZC5jd2RgIGlzIGF1dGhvcml0YXRpdmUgZm9yIFwid2hhdCBpcyB0aGlzIHRocmVhZCdzXG5cdFx0XHQvLyBjd2RcIiBidXQgbm90IGZvciBcImRpZCB3ZSBjcmVhdGUgaXRcIiwgYW5kIGEgc3RhbGVcblx0XHRcdC8vIGBvd25zTWFuYWdlZFdvcmtpbmdEaXJlY3RvcnlgIGZsYWcgYWxvbmUgbXVzdCBuZXZlciByZXN1cnJlY3QgYVxuXHRcdFx0Ly8gcmVhbCB1c2VyIGZvbGRlciBhcyBzb21ldGhpbmcgYSBsYXRlciByZWNsYWltIG1heSBkZWxldGUuXG5cdFx0XHRpZiAob3ZlcmxheS5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSAmJiB3b3JraW5nRGlyZWN0b3J5ICYmIGlzRXF1YWwob3ZlcmxheS5tYW5hZ2VkV29ya2luZ0RpcmVjdG9yeSwgd29ya2luZ0RpcmVjdG9yeSkpIHtcblx0XHRcdFx0cmVzdG9yZWQubWFuYWdlZFdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25JZCwgcmVzdG9yZWQpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbklkQnlUaHJlYWRJZC5zZXQodGhyZWFkSWQsIHNlc3Npb25JZCk7XG5cdFx0XHRpZiAocmVzdG9yZWRNb2RlbCAmJiBwYXJzZUNvZGV4TW9kZWxTZWxlY3Rpb24ocmVzdG9yZWRNb2RlbCkubW9kZWxQcm92aWRlciAhPT0gbWF0ZXJpYWxpemVkTW9kZWxQcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLl9yZXNldFNlc3Npb25Gb3JNb2RlbFByb3ZpZGVyQ2hhbmdlKHJlc3RvcmVkLCBwYXJzZUNvZGV4TW9kZWxTZWxlY3Rpb24ocmVzdG9yZWRNb2RlbCkubW9kZWxQcm92aWRlcik7XG5cdFx0XHR9XG5cdFx0XHQvLyBDb21wYXRpYmxlIHJlc3RvcmVkIHRocmVhZHMgc2tpcCBtYXRlcmlhbGl6YXRpb24gYmVjYXVzZSB0aGUgdGhyZWFkXG5cdFx0XHQvLyBhbHJlYWR5IGV4aXN0cy4gSW5jb21wYXRpYmxlIG9uZXMgcmVtYXRlcmlhbGl6ZSBvbiB0aGUgbmV4dCBzZW5kLlxuXHRcdFx0Ly8gRWl0aGVyIHdheSwgYWR2ZXJ0aXNlIHNlcnZlciB0b29scyBub3cgZm9yIGNsaWVudC1zaWRlIHBhcml0eSBcdTIwMTRcblx0XHRcdC8vIG9uIHRoZSBzZXNzaW9uIHRoZSBob3N0IGFkZHJlc3NlZCwgd2hpY2ggaXMgdGhlIG9ubHkgVVJJIGl0IGtub3dzLlxuXHRcdFx0aWYgKCFyZXN0b3JlZC5zZXJ2ZXJUb29sc0FkdmVydGlzZWQgJiYgdGhpcy5fc2VydmVyVG9vbEhvc3QpIHtcblx0XHRcdFx0cmVzdG9yZWQuc2VydmVyVG9vbHNBZHZlcnRpc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QuYWR2ZXJ0aXNlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtZXRhZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWRTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8SUNvZGV4U2Vzc2lvblJlYWQgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnMuaGFzKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSlcblx0XHRcdD8gdGhpcy5fZG9SZWFkU2Vzc2lvbihzZXNzaW9uKVxuXHRcdFx0OiB0aGlzLl9jb2xkU2Vzc2lvblJlYWRMaW1pdGVyLnF1ZXVlKCgpID0+IHRoaXMuX2RvUmVhZFNlc3Npb24oc2Vzc2lvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZWFkU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElDb2RleFNlc3Npb25SZWFkIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgY29kZXggdGhyZWFkIGlkIGZvciB0aGlzIHNlc3Npb24gVVJJLiBSZXNvbHV0aW9uXG5cdFx0Ly8gb3JkZXI6IGluLW1lbW9yeSBzZXNzaW9uIFx1MjE5MiBwZXJzaXN0ZWQgbWV0YWRhdGEgb3ZlcmxheSBcdTIxOTIgVVJJIGhvc3QuXG5cdFx0Ly8gVGhlIGZpbmFsIGA/PyBzZXNzaW9uSWRgIGlzIGEgTEVHQUNZLUNPTVBBVCBzaGltLCBub3QgYW4gYWN0aXZlIEkzXG5cdFx0Ly8gaW52YXJpYW50OiBmcmVzaCBzZXNzaW9ucyBhbHdheXMgZGVjb3VwbGUgc2Vzc2lvbklkIGZyb20gdGhlXG5cdFx0Ly8gYXBwLXNlcnZlci1hc3NpZ25lZCB0aHJlYWRJZCAocmVjb3JkZWQgaW4gdGhlIG92ZXJsYXkgYnlcblx0XHQvLyBgX3BlcnNpc3RNYXRlcmlhbGl6ZWRTZXNzaW9uYCksIHNvIHRoaXMgZmFsbGJhY2sgb25seSBmaXJlcyBmb3Jcblx0XHQvLyBwcmUtZXhpc3Rpbmcgc2Vzc2lvbnMgZW51bWVyYXRlZCBhcyBgY29kZXg6Lzx0aHJlYWRJZD5gLCB3aGVyZSB0aGVcblx0XHQvLyB0aHJlYWQgaWQgZ2VudWluZWx5IElTIHRoZSBzZXNzaW9uJ3MgcGVyc2lzdGVkIGlkZW50aXR5LiBSZW1vdmluZyBpdFxuXHRcdC8vIHdvdWxkIHJlcXVpcmUgbWlncmF0aW5nIHRob3NlIHNlc3Npb25zIChkaXNhbGxvd2VkKSwgc28gaXQgc3RheXMuXG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0bGV0IHRocmVhZElkID0gZXhpc3Rpbmc/LnRocmVhZElkO1xuXHRcdGxldCBwZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBleGlzdGluZz8ud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGxldCBwZXJzaXN0ZWRNb2RlbElkID0gZXhpc3Rpbmc/Lm1vZGVsPy5pZDtcblx0XHRpZiAodGhyZWFkSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uKTtcblx0XHRcdHRocmVhZElkID0gb3ZlcmxheS50aHJlYWRJZCA/PyBzZXNzaW9uSWQ7XG5cdFx0XHRwZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBvdmVybGF5LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdHBlcnNpc3RlZE1vZGVsSWQgPSBvdmVybGF5Lm1vZGVsSWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0Y29uc3QgcmVhZFRocmVhZCA9IGFzeW5jIChjYW5kaWRhdGVUaHJlYWRJZDogc3RyaW5nKTogUHJvbWlzZTxJQ29kZXhTZXNzaW9uUmVhZD4gPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCd0aHJlYWQvcmVhZCcsIFRocmVhZFJlYWRSZXNwb25zZT4oJ3RocmVhZC9yZWFkJywge1xuXHRcdFx0XHR0aHJlYWRJZDogY2FuZGlkYXRlVGhyZWFkSWQsXG5cdFx0XHRcdGluY2x1ZGVUdXJuczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgcm9sbG91dE1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZENvZGV4Um9sbG91dE1ldGFkYXRhKHJlc3BvbnNlLnRocmVhZCk7XG5cdFx0XHRyZXR1cm4geyAuLi5yZXNwb25zZSwgcGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzLCBwZXJzaXN0ZWRNb2RlbElkLCByb2xsb3V0TWV0YWRhdGEgfTtcblx0XHR9O1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIWV4aXN0aW5nICYmIHRocmVhZElkICE9PSBzZXNzaW9uSWQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbCA9IGF3YWl0IHJlYWRUaHJlYWQoc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRpZiAob3JpZ2luYWwucm9sbG91dE1ldGFkYXRhPy5pc0Rlc2t0b3ApIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0b1JvbGxvdXRNb2RlbFNlbGVjdGlvbihvcmlnaW5hbC5yb2xsb3V0TWV0YWRhdGEuc2VsZWN0ZWRNb2RlbCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKHNlc3Npb24sIHtcblx0XHRcdFx0XHRcdFx0dGhyZWFkSWQ6IG9yaWdpbmFsLnRocmVhZC5pZCxcblx0XHRcdFx0XHRcdFx0Y3dkOiBvcmlnaW5hbC50aHJlYWQuY3dkID8gVVJJLmZpbGUob3JpZ2luYWwudGhyZWFkLmN3ZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdG1vZGVsSWQ6IG9yaWdpbmFsTW9kZWw/LmlkLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHQuLi5vcmlnaW5hbCxcblx0XHRcdFx0XHRcdFx0cGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHBlcnNpc3RlZE1vZGVsSWQ6IG9yaWdpbmFsTW9kZWw/LmlkLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIFRoZSBzZXNzaW9uIFVSSSBpcyBub3QgaXRzZWxmIGEgcGVyc2lzdGVkIENvZGV4IERlc2t0b3AgdGhyZWFkLlxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZWFkID0gYXdhaXQgcmVhZFRocmVhZCh0aHJlYWRJZCk7XG5cdFx0XHRpZiAocmVhZC5yb2xsb3V0TWV0YWRhdGE/LmlzRGVza3RvcCkge1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbE1vZGVsID0gdG9Sb2xsb3V0TW9kZWxTZWxlY3Rpb24ocmVhZC5yb2xsb3V0TWV0YWRhdGEuc2VsZWN0ZWRNb2RlbCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoc2Vzc2lvbiwge1xuXHRcdFx0XHRcdHRocmVhZElkOiByZWFkLnRocmVhZC5pZCxcblx0XHRcdFx0XHRjd2Q6IHJlYWQudGhyZWFkLmN3ZCA/IFVSSS5maWxlKHJlYWQudGhyZWFkLmN3ZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWxJZDogb3JpZ2luYWxNb2RlbD8uaWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnJlYWQsXG5cdFx0XHRcdFx0cGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cGVyc2lzdGVkTW9kZWxJZDogb3JpZ2luYWxNb2RlbD8uaWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVhZDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHQvLyBgdGhyZWFkIG5vdCBsb2FkZWRgIGlzIGFwcC1zZXJ2ZXIncyBleHBlY3RlZCByZXNwb25zZSBmb3IgYW55XG5cdFx0XHQvLyB0aHJlYWQgd2UgaGF2ZSBub3QgeWV0IHJlc3VtZWQgaW4gdGhpcyBwcm9jZXNzOyBzZW5kTWVzc2FnZSdzXG5cdFx0XHQvLyBgdGhyZWFkL3Jlc3VtZWAgcGF0aCB3aWxsIGhhbmRsZSBpdC4gTG9nIGF0IGluZm8gbGV2ZWwuXG5cdFx0XHRpZiAoL3RocmVhZCBub3QgbG9hZGVkL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleDoke3RocmVhZElkfV0gdGhyZWFkL3JlYWQ6IG5vdCBsb2FkZWQgeWV0ICh3aWxsIHJlc3VtZSBvbiBmaXJzdCBzZW5kKWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXg6JHt0aHJlYWRJZH1dIHRocmVhZC9yZWFkIGZhaWxlZDogJHttZXNzYWdlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9saXN0Q29kZXhDaGF0cygpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gUHJvdmlkZXItbmF0aXZlIHRocmVhZHMgYXJlIGNvbnRpbnVvdXNseSBkaXNjb3ZlcmVkIGludG8gdGhlXG5cdFx0Ly8gb3JjaGVzdHJhdG9yLW93bmVkIHJlZ2lzdHJ5LiBUaHJlYWRzIHdpdGggbm8gbGl2ZSBpbi1tZW1vcnkgc2Vzc2lvbiBhcmVcblx0XHQvLyBtYXBwZWQgdG8gYGNvZGV4Oi88dGhyZWFkSWQ+YCBiZWxvdy5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRcdGNvbnN0IHRocmVhZHMgPSBhd2FpdCBjb2xsZWN0VGhyZWFkTGlzdFBhZ2VzPFRocmVhZD4oXG5cdFx0XHRcdHJlcXVlc3QgPT4gY29ubi5jbGllbnQucmVxdWVzdDwndGhyZWFkL2xpc3QnLCBUaHJlYWRMaXN0UmVzcG9uc2U+KCd0aHJlYWQvbGlzdCcsIHJlcXVlc3QpLFxuXHRcdFx0XHRjb2xsZWN0ZWQgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHRocmVhZC9saXN0IGhpdCB0aGUgJHtUSFJFQURfTElTVF9NQVhfUEFHRVN9LXBhZ2UgY2FwIGFmdGVyICR7Y29sbGVjdGVkfSB0aHJlYWRzOyBzb21lIHNlc3Npb25zIG1heSBiZSBtaXNzaW5nYCksXG5cdFx0XHQpO1xuXHRcdFx0Ly8gTWFwIHBlcnNpc3RlZCB0aHJlYWRzIGJhY2sgdG8gdGhlIFVSSSB0aGUgd29ya2JlbmNoIGFscmVhZHlcblx0XHRcdC8vIGtub3dzIHRoZW0gYnkuIEFmdGVyIGBfbWF0ZXJpYWxpemVJZk5lZWRlZGAgcnVucywgdGhlIGNvZGV4XG5cdFx0XHQvLyB0aHJlYWQgaXMgcGVyc2lzdGVkIHRvIGRpc2sgdW5kZXIgaXRzIHRocmVhZCBpZCBidXQgdGhlXG5cdFx0XHQvLyB3b3JrYmVuY2gvc3RhdGUtbWFuYWdlciBrZXllZCB0aGUgc2Vzc2lvbiBieSBpdHMgcHJvdmlzaW9uYWxcblx0XHRcdC8vIFVSSSAoYGNvZGV4Oi88cHJvdmlzaW9uYWwtdXVpZD5gKS4gSWYgd2UgcmV0dXJuZWQgYSBmcmVzaFxuXHRcdFx0Ly8gYGNvZGV4Oi88dGhyZWFkSWQ+YCBVUkkgaGVyZSwgdGhlIHJlZ2lzdHJ5IHdvdWxkIHRyZWF0IHRoZVxuXHRcdFx0Ly8gcHJvdmlzaW9uYWwgVVJJIGFzIG1pc3NpbmcgYW5kIGV2aWN0IHRoZSBsaXZlIHNlc3Npb24gdGhlIHVzZXJcblx0XHRcdC8vIGlzIGFjdGl2ZWx5IHZpZXdpbmcuXG5cdFx0XHRjb25zdCBsaXZlVXJpQnlUaHJlYWRJZCA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0aWYgKHMudGhyZWFkSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGxpdmVVcmlCeVRocmVhZElkLnNldChzLnRocmVhZElkLCBzLnNlc3Npb25VcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwodGhyZWFkcy5tYXAoYXN5bmMgdGhyZWFkID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGxpdmVVcmlCeVRocmVhZElkLmdldCh0aHJlYWQuaWQpID8/IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgdGhyZWFkLmlkKTtcblx0XHRcdFx0Y29uc3QgbGl2ZVdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSkpPy53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0XHRcdGNvbnN0IGlzRGVza3RvcCA9IHRocmVhZC5tb2RlbFByb3ZpZGVyID09PSBDT0RFWF9PUEVOQUlfTU9ERUxfUFJPVklERVJcblx0XHRcdFx0XHQ/IChhd2FpdCB0aGlzLl9kZXNrdG9wUm9sbG91dFByZWZpeExpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5fcmVhZENvZGV4RGVza3RvcFJvbGxvdXRQcmVmaXgodGhyZWFkKSkpICE9PSBudWxsXG5cdFx0XHRcdFx0OiB0aGlzLl9kZXNrdG9wVGhyZWFkSWRzLmhhcyh0aHJlYWQuaWQpO1xuXHRcdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fd2l0aFdvcmtpbmdEaXJlY3Rvcmllcyhhd2FpdCB0aGlzLl90aHJlYWRUb01ldGFkYXRhKHRocmVhZCwgY2hhdCwgdW5kZWZpbmVkLCBpc0Rlc2t0b3ApLCBsaXZlV29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIERpc2NvdmVyeSBydW5zIGluZGVwZW5kZW50bHkgZm9yIGV2ZXJ5IHByb3ZpZGVyOyBhIHJlamVjdGlvbiBoZXJlXG5cdFx0XHQvLyBzaG91bGQgbm90IHRha2UgYSBzaWJsaW5nIHByb3ZpZGVyJ3MgZGlzY292ZXJ5XG5cdFx0XHQvLyBkb3duIHdpdGggaXQuIGB1bmRlZmluZWRgIHNpZ25hbHMgXCJjYW4ndCBlbnVtZXJhdGUgeWV0XCIgc28gdGhlXG5cdFx0XHQvLyBvcmNoZXN0cmF0b3IgcmV0cmllcyBsYXRlciBpbnN0ZWFkIG9mIHRyZWF0aW5nIHRoaXMgYXMgYW5cblx0XHRcdC8vIGF1dGhvcml0YXRpdmUgZW1wdHkgcmVzdWx0LlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHRocmVhZC9saXN0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxpc3RDaGF0c1RvTWlncmF0ZSgpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVTZGtSb290KCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gU0RLIHVuYXZhaWxhYmxlIHdoaWxlIGxpc3RpbmcgY2hhdHMgdG8gbWlncmF0ZTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0cyA9IGF3YWl0IHRoaXMuX2xpc3RDb2RleENoYXRzKCk7XG5cdFx0aWYgKCFjaGF0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGltaXRlciA9IG5ldyBMaW1pdGVyPElBZ2VudENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZD4oNCk7XG5cdFx0Y29uc3Qga25vd24gPSBhd2FpdCBQcm9taXNlLmFsbChjaGF0cy5tYXAoY2hhdCA9PiBsaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9pc0tub3duQ29kZXhDaGF0KGNoYXQpID8gY2hhdCA6IHVuZGVmaW5lZDtcblx0XHR9KSkpO1xuXHRcdHJldHVybiBrbm93bi5maWx0ZXIoKGNoYXQpOiBjaGF0IGlzIElBZ2VudENoYXRNZXRhZGF0YSA9PiBjaGF0ICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRDb2RleENoYXREaXNjb3ZlcnkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jb2RleENoYXREaXNjb3ZlcnkpIHtcblx0XHRcdHRoaXMuX2NvZGV4Q2hhdERpc2NvdmVyeSA9IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZVNka1Jvb3QoKTtcblx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fZW1pdENvZGV4Q2hhdHMoKSkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvZGV4IGNoYXQgY2F0YWxvZyBpcyBub3QgYXZhaWxhYmxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDUwMDAsIDMpXG5cdFx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIENoYXQgZGlzY292ZXJ5IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29kZXhDaGF0RGlzY292ZXJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW1pdENvZGV4Q2hhdHMoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNoYXRzID0gYXdhaXQgdGhpcy5fbGlzdENvZGV4Q2hhdHMoKTtcblx0XHRcdGlmIChjaGF0cykge1xuXHRcdFx0XHRjb25zdCBsaW1pdGVyID0gbmV3IExpbWl0ZXI8SUFnZW50RGlzY292ZXJlZENoYXQgfCB1bmRlZmluZWQ+KDQpO1xuXHRcdFx0XHRjb25zdCB1bmtub3duID0gYXdhaXQgUHJvbWlzZS5hbGwoY2hhdHMubWFwKGNoYXQgPT4gbGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2lzS25vd25Db2RleENoYXQoY2hhdCkgPyB1bmRlZmluZWQgOiB7IC4uLmNoYXQsIGV4dGVybmFsOiB0cnVlIH07XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdGNvbnN0IGRpc2NvdmVyZWQgPSB1bmtub3duLmZpbHRlcigoY2hhdCk6IGNoYXQgaXMgSUFnZW50RGlzY292ZXJlZENoYXQgPT4gY2hhdCAhPT0gdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fb25EaWREaXNjb3ZlckNoYXRzLmZpcmUoZGlzY292ZXJlZCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIEZhaWxlZCB0byBlbWl0IGRpc2NvdmVyZWQgY2hhdHM6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc0tub3duQ29kZXhDaGF0KGNoYXQ6IElBZ2VudENoYXRNZXRhZGF0YSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdC5jaGF0KSk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS5oYXNLbm93blNlc3Npb24oc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gRmFpbGVkIHRvIGluc3BlY3Qgc3RvcmVkIG1ldGFkYXRhIGZvciAke2NoYXQuY2hhdC50b1N0cmluZygpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdGhyZWFkVG9NZXRhZGF0YSh0aHJlYWQ6IFRocmVhZCwgY2hhdDogVVJJLCByb2xsb3V0TWV0YWRhdGE/OiBJQ29kZXhSb2xsb3V0TWV0YWRhdGEsIGlzRGVza3RvcEhpbnQ/OiBib29sZWFuKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGE+IHtcblx0XHRjb25zdCBnZW5lcmF0ZWRXb3Jrc3BhY2UgPSBpc0NvZGV4RGVza3RvcEdlbmVyYXRlZFdvcmtzcGFjZSh0aHJlYWQuY3dkLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUpO1xuXHRcdGxldCBpc0Rlc2t0b3AgPSByb2xsb3V0TWV0YWRhdGE/LmlzRGVza3RvcCA/PyBpc0Rlc2t0b3BIaW50O1xuXHRcdGlmIChnZW5lcmF0ZWRXb3Jrc3BhY2UgJiYgaXNEZXNrdG9wID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlzRGVza3RvcCA9IChhd2FpdCB0aGlzLl9kZXNrdG9wUm9sbG91dFByZWZpeExpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5fcmVhZENvZGV4RGVza3RvcFJvbGxvdXRQcmVmaXgodGhyZWFkKSkpICE9PSBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRvUm9sbG91dE1vZGVsU2VsZWN0aW9uKHJvbGxvdXRNZXRhZGF0YT8uc2VsZWN0ZWRNb2RlbCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNoYXQsXG5cdFx0XHQvLyBDb2RleCByZXR1cm5zIFVuaXggc2Vjb25kczsgdGhlIGFnZW50IGhvc3QgZXhwZWN0cyBtcy5cblx0XHRcdHN0YXJ0VGltZTogKHRocmVhZC5jcmVhdGVkQXQgPz8gMCkgKiAxMDAwLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiAodGhyZWFkLnVwZGF0ZWRBdCA/PyB0aHJlYWQuY3JlYXRlZEF0ID8/IDApICogMTAwMCxcblx0XHRcdHN1bW1hcnk6IGNvZGV4RGVsZWdhdGlvbkRpc3BsYXlUZXh0KHRocmVhZC5uYW1lKSA/PyBjb2RleERlbGVnYXRpb25EaXNwbGF5VGV4dCh0aHJlYWQucHJldmlldyksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHRocmVhZC5jd2QgPyBbVVJJLmZpbGUodGhyZWFkLmN3ZCldIDogdW5kZWZpbmVkLFxuXHRcdFx0Li4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLFxuXHRcdFx0Li4uKGdlbmVyYXRlZFdvcmtzcGFjZSAmJiBpc0Rlc2t0b3AgPyB7IF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModW5kZWZpbmVkLCB0cnVlKSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkQ29kZXhSb2xsb3V0TWV0YWRhdGEodGhyZWFkOiBUaHJlYWQpOiBQcm9taXNlPElDb2RleFJvbGxvdXRNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aHJlYWQuc291cmNlICE9PSAndnNjb2RlJyB8fCAhdGhyZWFkLnBhdGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGF3YWl0IHJlYWRDb2RleFJvbGxvdXRNZXRhZGF0YSh0aGlzLl9maWxlU2VydmljZSwgdGhyZWFkLnBhdGgpO1xuXHRcdFx0aWYgKG1ldGFkYXRhLmlzRGVza3RvcCkge1xuXHRcdFx0XHR0aGlzLl9kZXNrdG9wVGhyZWFkSWRzLmFkZCh0aHJlYWQuaWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1ldGFkYXRhO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gRmFpbGVkIHRvIHJlYWQgZGVza3RvcCByb2xsb3V0IG1ldGFkYXRhIGZvciAke3RocmVhZC5pZH06IHJlc3VsdD0ke3RvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRDb2RleERlc2t0b3BSb2xsb3V0UHJlZml4KHRocmVhZDogVGhyZWFkKTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG5cdFx0aWYgKHRocmVhZC5zb3VyY2UgIT09ICd2c2NvZGUnIHx8ICF0aHJlYWQucGF0aCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHByZWZpeCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKHRocmVhZC5wYXRoKSwgeyBsZW5ndGg6IENPREVYX0RFU0tUT1BfUk9MTE9VVF9QUkVGSVhfTEVOR1RIIH0pO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBwcmVmaXgudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdGlmICghQ09ERVhfREVTS1RPUF9TRVNTSU9OX01FVEFfUEFUVEVSTi50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2Rlc2t0b3BUaHJlYWRJZHMuYWRkKHRocmVhZC5pZCk7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBGYWlsZWQgdG8gaW5zcGVjdCBkZXNrdG9wIHNlc3Npb24gbWV0YWRhdGEgZm9yICR7dGhyZWFkLmlkfTogcmVzdWx0PSR7dG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKX1gKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dpdGhXb3JraW5nRGlyZWN0b3JpZXMobWV0YWRhdGE6IElBZ2VudENoYXRNZXRhZGF0YSwgc3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCk6IElBZ2VudENoYXRNZXRhZGF0YSB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IG1ldGFkYXRhLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghcHJpbWFyeSB8fCAhc3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzIHx8IHN0b3JlZFdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuIG1ldGFkYXRhO1xuXHRcdH1cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBkaXN0aW5jdFdvcmtpbmdEaXJlY3RvcmllcyhbXG5cdFx0XHRwcmltYXJ5LFxuXHRcdFx0Li4uc3RvcmVkV29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDEpLFxuXHRcdF0pO1xuXHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3JpZXMgJiYgd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDFcblx0XHRcdD8geyAuLi5tZXRhZGF0YSwgd29ya2luZ0RpcmVjdG9yaWVzIH1cblx0XHRcdDogbWV0YWRhdGE7XG5cdH1cblxuXHRzZXRTZXJ2ZXJUb29sSG9zdChob3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0ID0gaG9zdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBgY2hhdGAgaXMgdGhlIG9uZSBleGFjdCBjaGF0IHRoaXMgaGFuZGxlIGNvbnRyaWJ1dGVzIHRvIFx1MjAxNCBubyBmYW4tb3V0IHRvXG5cdCAqIGNoYXQtYXJyYXkgbWVtYmVyc2hpcCBvciBzaWJsaW5nIGluZmVyZW5jZTsgQWdlbnQgSG9zdCBjYWxscyB0aGlzIG9uY2Vcblx0ICogcGVyIGFkZHJlc3NlZCBjaGF0LiBgY29udGV4dGAgb25seSByZXNvbHZlcyB0aGUgY2hhdCdzIGJhY2tpbmcgcnVudGltZVxuXHQgKiB3aGVuIGl0IGhhcyBubyBsaXZlIGJpbmRpbmcgeWV0LCBtaXJyb3Jpbmdcblx0ICoge0BsaW5rIF9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbn0uIGBob3N0Q3VzdG9taXphdGlvbnNgIGlzIHVudXNlZDpcblx0ICogQ29kZXggcmVjb25jaWxlcyBwdXNoZWQgcGx1Z2luIGN1c3RvbWl6YXRpb25zIHZpYVxuXHQgKiB7QGxpbmsgX3N5bmNDbGllbnRDdXN0b21pemF0aW9uc30uXG5cdCAqL1xuXHRnZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBjbGllbnQ6IHsgcmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSwgX2hvc3RDdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IElBY3RpdmVDbGllbnQge1xuXHRcdGNvbnN0IGtleSA9IGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwJHtjbGllbnQuY2xpZW50SWR9YDtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVTZXNzaW9uID0gKCk6IElDb2RleFNlc3Npb24gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgcnVudGltZVVyaSA9IHRoaXMuX3Jlc29sdmVDb252ZXJzYXRpb25TZXNzaW9uKGNoYXQsIGNvbnRleHQpO1xuXHRcdFx0cmV0dXJuIHJ1bnRpbWVVcmkgPyB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHJ1bnRpbWVVcmkpKSA6IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGhhbmRsZSA9IG5ldyBDb2RleEFjdGl2ZUNsaWVudEhhbmRsZShcblx0XHRcdHJlc29sdmVTZXNzaW9uLFxuXHRcdFx0Y2xpZW50LmNsaWVudElkLFxuXHRcdFx0Y2xpZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0dG9vbHMgPT4gdGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGFjdGl2ZSBjbGllbnQgJHtjbGllbnQuY2xpZW50SWR9IHRvb2xzPVske3Rvb2xzLm1hcCh0ID0+IHQubmFtZSkuam9pbignLCAnKSB8fCAnKG5vbmUpJ31dIGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9YCksXG5cdFx0XHQoc2Vzc2lvbiwgY3VzdG9taXphdGlvbnMpID0+IHtcblx0XHRcdFx0dm9pZCB0aGlzLl9zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbi5zZXNzaW9uVXJpLCBjbGllbnQuY2xpZW50SWQsIFsuLi5jdXN0b21pemF0aW9uc10sIHsgcXVpZXQ6IGZhbHNlIH0pO1xuXHRcdFx0fSxcblx0XHQpO1xuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuc2V0KGtleSwgaGFuZGxlKTtcblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG5cblx0cmVtb3ZlQWN0aXZlQ2xpZW50KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBgJHtjaGF0LnRvU3RyaW5nKCl9XFx1MDAwMCR7Y2xpZW50SWR9YDtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hY3RpdmVDbGllbnRIYW5kbGVzLmdldChrZXkpO1xuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuZGVsZXRlKGtleSk7XG5cdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aGFuZGxlLnJlbW92ZSgpO1xuXHRcdGNvbnN0IHJ1bnRpbWVVcmkgPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihjaGF0LCBjb250ZXh0KTtcblx0XHRjb25zdCBzZXNzID0gcnVudGltZVVyaSA/IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQocnVudGltZVVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzZXNzKSB7XG5cdFx0XHQvLyBBIGRlcGFydGluZyBjbGllbnQncyBza2lsbHMgbWF5IGRyb3Agb3V0IG9mIHRoZSBwcm9jZXNzLWdsb2JhbCB1bmlvbi5cblx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaFNraWxsRXh0cmFSb290cygpO1xuXHRcdFx0dm9pZCB0aGlzLl9yZWNvbmNpbGVNYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9ucyhzZXNzKTtcblx0XHR9XG5cdH1cblxuXHRvbkNsaWVudFRvb2xDYWxsQ29tcGxldGUoY2hhdDogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQsIGNvbnRleHQ/OiBJQWdlbnRDaGF0Q29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHJ1bnRpbWUgPSB0aGlzLl9yZXNvbHZlQ29udmVyc2F0aW9uU2Vzc2lvbihjaGF0LCBjb250ZXh0KTtcblx0XHRjb25zdCBzZXNzID0gcnVudGltZSA/IHRoaXMuX3Nlc3Npb25zLmdldChBZ2VudFNlc3Npb24uaWQocnVudGltZSkpIDogdW5kZWZpbmVkO1xuXHRcdC8vIGBBZ2VudFNpZGVFZmZlY3RzYCBmb3J3YXJkcyBldmVyeSBgQ2hhdFRvb2xDYWxsQ29tcGxldGVgIGVudmVsb3BlXG5cdFx0Ly8gKGluY2x1ZGluZyBjb2RleC1vd25lZCB0b29scyBsaWtlIHNoZWxsKTsgYSBtaXNzIGlzIHRoZSBleHBlY3RlZCBwYXRoLlxuXHRcdHNlc3M/LnBlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVzcG9uZE9yQnVmZmVyKHRvb2xDYWxsSWQsIHJlc3VsdCk7XG5cdH1cblxuXHQvLyAtLS0tIENsaWVudC1wdXNoZWQgcGx1Z2luIGN1c3RvbWl6YXRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogTWF0ZXJpYWxpemUgKyBwYXJzZSBhIGNsaWVudCdzIHB1c2hlZCBwbHVnaW4gY3VzdG9taXphdGlvbnMgYW5kIHN0b3JlXG5cdCAqIHRoZW0gb24gdGhlIHNlc3Npb24uIE1pcnJvcnMgdGhlIENsYXVkZSBjbGllbnQtcGx1Z2luIHBhdGg6IHRoZSBzaGFyZWRcblx0ICoge0BsaW5rIElBZ2VudFBsdWdpbk1hbmFnZXJ9IGNvcGllcyBlYWNoIHBsdWdpbiB0byBsb2NhbCBkaXNrIChub25jZVxuXHQgKiBjYWNoZWQpLCB3ZSBwYXJzZSB0aGUgcmVzdWx0aW5nIGRpcmVjdG9yeSBpbnRvIGl0c1xuXHQgKiB7QGxpbmsgSVBhcnNlZFBsdWdpbiB8IGNvbXBvbmVudHN9LCBwdWJsaXNoIHRoZSBjdXN0b21pemF0aW9uIHN1cmZhY2UsXG5cdCAqIGFuZCByZWZyZXNoIHRoZSBwcm9jZXNzLWdsb2JhbCBza2lsbCByb290cy4gTUNQIHNlcnZlcnMgYXJlIGF0dGFjaGVkXG5cdCAqIHBlci10aHJlYWQgYXQgdGhlIG5leHQge0BsaW5rIF9tYXRlcmlhbGl6ZX0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaTogVVJJLCBjbGllbnRJZDogc3RyaW5nLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdLCBvcHRpb25zPzogeyByZWFkb25seSBxdWlldD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlPy5pbml0aWFsaXplU2Vzc2lvbihzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IHN5bmNlZCA9IGF3YWl0IHRoaXMuX3BsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKFxuXHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRbLi4uY3VzdG9taXphdGlvbnNdLFxuXHRcdFx0c3RhdHVzID0+IHtcblx0XHRcdFx0aWYgKCFvcHRpb25zPy5xdWlldCkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmUoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCwgY3VzdG9taXphdGlvbjogc3RhdHVzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0aWYgKHNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXRzID0gbmV3IE1hcChjdXN0b21pemF0aW9ucy5tYXAoY3VzdG9taXphdGlvbiA9PiBbY3VzdG9taXphdGlvbi51cmksIGN1c3RvbWl6YXRpb25dKSk7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IGF3YWl0IFByb21pc2UuYWxsKHN5bmNlZC5tYXAoaXRlbSA9PiB0aGlzLl9wYXJzZUNsaWVudFBsdWdpbihzZXNzaW9uLCBpdGVtLCBpbnB1dHMuZ2V0KGl0ZW0uY3VzdG9taXphdGlvbi51cmkpKSkpO1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMuc2V0Q2xpZW50KGNsaWVudElkLCBwbHVnaW5zKTtcblx0XHRpZiAoIW9wdGlvbnM/LnF1aWV0KSB7XG5cdFx0XHR0aGlzLl9wdWJsaXNoQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbik7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hTa2lsbEV4dHJhUm9vdHMoKTtcblx0XHRhd2FpdCB0aGlzLl9yZWNvbmNpbGVNYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9ucyhzZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uY2lsZU1hdGVyaWFsaXplZEN1c3RvbWl6YXRpb25zKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvbi50aHJlYWRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhdW5jaCA9IGF3YWl0IHRoaXMuX2J1aWxkQ3VzdG9taXphdGlvbkxhdW5jaChzZXNzaW9uKTtcblx0XHRpZiAobGF1bmNoLnNpZ25hdHVyZSA9PT0gc2Vzc2lvbi5tYXRlcmlhbGl6ZWRDdXN0b21pemF0aW9uc1NpZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24uZmlyc3RUdXJuU2VudCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzdGFydFRocmVhZFdpdGhDdXJyZW50VG9vbHMoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLl9wZXJzaXN0TWF0ZXJpYWxpemVkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFya1Nlc3Npb25Gb3JSZWxvYWQoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFBhcnNlIG9uZSBzeW5jZWQgcGx1Z2luIGRpcmVjdG9yeSBpbnRvIGl0cyBjb21wb25lbnRzIChiZXN0LWVmZm9ydCkuICovXG5cdHByaXZhdGUgYXN5bmMgX3BhcnNlQ2xpZW50UGx1Z2luKHNlc3Npb246IElDb2RleFNlc3Npb24sIHN5bmNlZDogSVN5bmNlZEN1c3RvbWl6YXRpb24sIGlucHV0OiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQ29kZXhDbGllbnRQbHVnaW4+IHtcblx0XHRpZiAoIXN5bmNlZC5wbHVnaW5EaXIpIHtcblx0XHRcdHJldHVybiB7IHN5bmNlZCwgcGFyc2VkOiB1bmRlZmluZWQsIGlucHV0IH07XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBhd2FpdCBwYXJzZVBsdWdpbihzeW5jZWQucGx1Z2luRGlyLCB0aGlzLl9maWxlU2VydmljZSwgc2Vzc2lvbi53b3JraW5nRGlyZWN0b3J5LCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUsIHN5bmNlZC5wbHVnaW5EaXIpO1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0geyAuLi5zeW5jZWQuY3VzdG9taXphdGlvbiwgY2hpbGRyZW46IHBhcnNlZFBsdWdpbkNoaWxkcmVuKHBhcnNlZCkgfTtcblx0XHRcdGNvbnN0IGNsaWVudFBsdWdpbnMgPSBpbnB1dCA/IG5ldyBNYXAoW1tpbnB1dC51cmksIGlucHV0XV0pIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzb2x1dGlvbiA9IHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudCh0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIHNlc3Npb24uc2Vzc2lvblVyaSwgW2NhbmRpZGF0ZV0sIGlucHV0Py5jaGlsZEVuYWJsZW1lbnQgPyBuZXcgTWFwKFtbaW5wdXQudXJpLCBpbnB1dC5jaGlsZEVuYWJsZW1lbnRdXSkgOiB1bmRlZmluZWQsIGNsaWVudFBsdWdpbnMpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHV0aW9uLmN1c3RvbWl6YXRpb25zWzBdO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3luY2VkLFxuXHRcdFx0XHRwYXJzZWQsXG5cdFx0XHRcdGlucHV0LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiByZXNvbHZlZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4gPyByZXNvbHZlZCA6IGNhbmRpZGF0ZSxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gZmFpbGVkIHRvIHBhcnNlIGNsaWVudCBwbHVnaW4gJHtzeW5jZWQuY3VzdG9taXphdGlvbi51cml9OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdHJldHVybiB7IHN5bmNlZCwgcGFyc2VkOiB1bmRlZmluZWQsIGlucHV0IH07XG5cdFx0fVxuXHR9XG5cblx0LyoqIFB1Ymxpc2ggdGhlIHNlc3Npb24ncyBjbGllbnQtcGx1Z2luIGN1c3RvbWl6YXRpb25zIGFzIHVwc2VydCBhY3Rpb25zLiAqL1xuXHRwcml2YXRlIF9wdWJsaXNoQ2xpZW50Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBzZXNzaW9uLmNsaWVudEN1c3RvbWl6YXRpb25zLnRvQ3VzdG9taXphdGlvbnMoKSkge1xuXHRcdFx0dGhpcy5fZmlyZShzZXNzaW9uLnNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsIGN1c3RvbWl6YXRpb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29tcHV0ZSB0aGUgcHJvY2Vzcy1nbG9iYWwgc2tpbGwgcm9vdHMgZnJvbSBldmVyeSBsaXZlIHNlc3Npb24nc1xuXHQgKiBlbmFibGVkIGNsaWVudCBwbHVnaW5zIGFuZCBwdXNoIHRoZW0gdG8gY29kZXggdmlhIGBza2lsbHMvZXh0cmFSb290cy9zZXRgLlxuXHQgKiBjb2RleCdzIGV4dHJhIHNraWxsIHJvb3RzIGFyZSBhIHNpbmdsZSBzaGFyZWQgbGlzdCAodGhlcmUgaXMgbm8gcGVyLXRocmVhZFxuXHQgKiBlcXVpdmFsZW50KSwgc28gd2Ugc2VuZCB0aGUgdW5pb24gYWNyb3NzIGFsbCBzZXNzaW9ucyBcdTIwMTQgd2hpY2ggbWF0Y2hlcyB0aGVcblx0ICogZ2xvYmFsIG5hdHVyZSBvZiBjbGllbnQgcGx1Z2luIGNob2ljZXMuIE5vLW9wIHdoZW4gdGhlIGNvbm5lY3Rpb24gaXMgbm90XG5cdCAqIHJlYWR5OyB0aGUgbmV4dCB7QGxpbmsgX21hdGVyaWFsaXplfSByZS1hcHBsaWVzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFNraWxsRXh0cmFSb290cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29ubmVjdGlvbi5raW5kICE9PSAncmVhZHknKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHBsdWdpbnM6IElDb2RleENsaWVudFBsdWdpbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoIXNlc3Npb24uZGlzcG9zZWQpIHtcblx0XHRcdFx0cGx1Z2lucy5wdXNoKC4uLnRoaXMuX2VuYWJsZWRDbGllbnRQbHVnaW5zKHNlc3Npb24pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgcm9vdHMgPSBjb2RleFNraWxsUm9vdHNGcm9tUGx1Z2lucyhwbHVnaW5zKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fY29ubmVjdGlvbi5jbGllbnQucmVxdWVzdDwnc2tpbGxzL2V4dHJhUm9vdHMvc2V0Jz4oJ3NraWxscy9leHRyYVJvb3RzL3NldCcsIHsgZXh0cmFSb290czogcm9vdHMgfSk7XG5cdFx0XHRpZiAocm9vdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gYXBwbGllZCAke3Jvb3RzLmxlbmd0aH0gY2xpZW50LXBsdWdpbiBza2lsbCByb290KHMpYCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gc2tpbGxzL2V4dHJhUm9vdHMvc2V0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBNQ1Agc2VydmVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFN1cmZhY2VzIGNvZGV4J3MgTUNQIHNlcnZlcnMgdG8gQUhQIGNsaWVudHMgYXMgcGVyLXNlc3Npb25cblx0ICogY3VzdG9taXphdGlvbnMuIENvZGV4IGhhcyBubyBwbHVnaW4vZGlyZWN0b3J5IGN1c3RvbWl6YXRpb24gbGF5ZXIsIHNvXG5cdCAqIGV2ZXJ5IHNlcnZlciBpcyBhIGJhcmUgdG9wLWxldmVsIHtAbGluayBNY3BTZXJ2ZXJDdXN0b21pemF0aW9ufS4gVGhlXG5cdCAqIHJldHVybmVkIHNuYXBzaG90IHJlZmxlY3RzIHRoZSBjdXJyZW50IGNvbm5lY3Rpb24tZ2xvYmFsIGludmVudG9yeTtcblx0ICogc3Vic2VxdWVudCBsaWZlY3ljbGUgdHJhbnNpdGlvbnMgYXJyaXZlIGFzIGN1c3RvbWl6YXRpb24gYWN0aW9uc1xuXHQgKiBlbWl0dGVkIGJ5IHRoZSBzZXNzaW9uJ3Mge0BsaW5rIE1jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyfS5cblx0ICogYGhvc3RDdXN0b21pemF0aW9uc2AgaXMgdW51c2VkOiBjb2RleCByZWNvbmNpbGVzIGEgY2xpZW50J3MgcHVzaGVkXG5cdCAqIHBsdWdpbiBjdXN0b21pemF0aW9ucyBkaXJlY3RseSAoc2VlIHtAbGluayBfc3luY0NsaWVudEN1c3RvbWl6YXRpb25zfSksXG5cdCAqIHNvIHRoZSBob3N0J3MgY29weSBjYXJyaWVzIG5vdGhpbmcgdGhpcyBtZXRob2QgbmVlZHMuXG5cdCAqL1xuXHRhc3luYyBnZXRDaGF0Q3VzdG9taXphdGlvbnMoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgX2hvc3RDdXN0b21pemF0aW9ucz86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IFByb21pc2U8cmVhZG9ubHkgQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9nZXRPckNyZWF0ZU1jcENvbnRyb2xsZXIoc2Vzc2lvbik7XG5cdFx0Y29udHJvbGxlci5hcHBseUFsbChpbnZlbnRvcnlUb1Nka1NlcnZlcnModGhpcy5fbWNwSW52ZW50b3J5KSk7XG5cdFx0dGhpcy5fcmVmcmVzaE1jcEN1c3RvbWl6YXRpb25JZHMoc2Vzc2lvbiwgY29udHJvbGxlcik7XG5cdFx0Y29uc3QgW3dvcmtzcGFjZUFnZW50cywgc2tpbGxIb29rQ29udGFpbmVyc10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkaXNjb3ZlckNvZGV4V29ya3NwYWNlQWdlbnRzKHRoaXMuX3dvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKSwgdGhpcy5fZmlsZVNlcnZpY2UpLFxuXHRcdFx0dGhpcy5fZmV0Y2hTa2lsbEhvb2tDb250YWluZXJzKHNlc3Npb24pLFxuXHRcdF0pO1xuXHRcdC8vIFdvcmtzcGFjZSBjdXN0b20gYWdlbnRzIGNvbWUgZnJvbSB0aGUgQWdlbnQgSG9zdCdzIHNlc3Npb24tc2NvcGVkXG5cdFx0Ly8gc2Nhbi4gQ2xpZW50LXB1c2hlZCBjdXN0b21pemF0aW9ucyByZW1haW4gZm9yIHBsdWdpbnMvZXh0ZW5zaW9ucywgdGhlblxuXHRcdC8vIGNvZGV4J3Mgb3duIE1DUCwgc2tpbGwsIGFuZCBob29rIGNhdGFsb2dzIGNvbXBsZXRlIHRoZSBzdXJmYWNlLlxuXHRcdHJldHVybiBbXG5cdFx0XHQuLi53b3Jrc3BhY2VBZ2VudHMuY29udGFpbmVycyxcblx0XHRcdC4uLnNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMudG9DdXN0b21pemF0aW9ucygpLFxuXHRcdFx0Li4uY29udHJvbGxlci50b3BMZXZlbEN1c3RvbWl6YXRpb25zKCksXG5cdFx0XHQuLi5za2lsbEhvb2tDb250YWluZXJzLFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogRmV0Y2hlcyB0aGUgc2tpbGxzIGFuZCBob29rcyBjb2RleCBoYXMgbG9hZGVkIGZvciBgc2Vzc2lvbmAncyB3b3JraW5nXG5cdCAqIGRpcmVjdG9yeSAoYHNraWxscy9saXN0YCArIGBob29rcy9saXN0YCwgYm90aCBjd2Qtc2NvcGVkKSBhbmQgcHJvamVjdHNcblx0ICogdGhlbSBpbnRvIHtAbGluayBEaXJlY3RvcnlDdXN0b21pemF0aW9ufSBjb250YWluZXJzLiBCZXN0LWVmZm9ydDogcmV0dXJuc1xuXHQgKiBhbiBlbXB0eSBhcnJheSB3aGVuIG5vIGNvbm5lY3Rpb24gaXMgcmVhZHksIG5vIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGtub3duLFxuXHQgKiBvciB0aGUgYXBwLXNlcnZlciByZWplY3RzIHRoZSByZXF1ZXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hTa2lsbEhvb2tDb250YWluZXJzKHNlc3Npb246IElDb2RleFNlc3Npb24pOiBQcm9taXNlPERpcmVjdG9yeUN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgIT09ICdyZWFkeScgfHwgIXNlc3Npb24ud29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjd2QgPSBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnkuZnNQYXRoO1xuXHRcdGNvbnN0IGNsaWVudCA9IHRoaXMuX2Nvbm5lY3Rpb24uY2xpZW50O1xuXHRcdGNvbnN0IFtza2lsbHMsIGhvb2tzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGNsaWVudC5yZXF1ZXN0PCdza2lsbHMvbGlzdCcsIFNraWxsc0xpc3RSZXNwb25zZT4oJ3NraWxscy9saXN0JywgeyBjd2RzOiBbY3dkXSB9KVxuXHRcdFx0XHQuY2F0Y2goZXJyID0+IHsgdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29kZXhdIHNraWxscy9saXN0IGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7IHJldHVybiB1bmRlZmluZWQ7IH0pLFxuXHRcdFx0Y2xpZW50LnJlcXVlc3Q8J2hvb2tzL2xpc3QnLCBIb29rc0xpc3RSZXNwb25zZT4oJ2hvb2tzL2xpc3QnLCB7IGN3ZHM6IFtjd2RdIH0pXG5cdFx0XHRcdC5jYXRjaChlcnIgPT4geyB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gaG9va3MvbGlzdCBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApOyByZXR1cm4gdW5kZWZpbmVkOyB9KSxcblx0XHRdKTtcblx0XHRyZXR1cm4gWy4uLmNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxscyksIC4uLmNvZGV4SG9va3NUb0NvbnRhaW5lcnMoaG9va3MpXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1mZXRjaGVzIHRoaXMgc2Vzc2lvbidzIHdvcmtzcGFjZSBhZ2VudCwgc2tpbGwsIGFuZCBob29rIGN1c3RvbWl6YXRpb25zIGFuZCB1cHNlcnRzIGVhY2hcblx0ICogY29udGFpbmVyIGludG8gc2Vzc2lvbiBzdGF0ZSB2aWEge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkfS5cblx0ICogQ2FsbGVkIGFmdGVyIG1hdGVyaWFsaXphdGlvbiAod2hlbiB0aGUgY29ubmVjdGlvbiBpcyByZWFkeSBhbmQgdGhlIGN3ZCBpc1xuXHQgKiBrbm93bikgc28gdGhlIHdvcmtiZW5jaCBDdXN0b21pemF0aW9ucyBzdXJmYWNlIHJlZmxlY3RzIHdvcmtzcGFjZSBhZ2VudHNcblx0ICogYW5kIHdoYXQgY29kZXggbG9hZGVkIGZyb20gdGhlIHdvcmtpbmcgZGlyZWN0b3J5J3MgYC5hZ2VudHNgL2AuY29kZXhgXG5cdCAqIGZvbGRlcnMuIFVwc2VydHMgKGtleWVkIGJ5IGN1c3RvbWl6YXRpb24gaWQpIGxlYXZlIE1DUCBjdXN0b21pemF0aW9uc1xuXHQgKiB1bnRvdWNoZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoU2tpbGxIb29rQ3VzdG9taXphdGlvbnMoc2Vzc2lvbjogSUNvZGV4U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZXNzaW9uLmRpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IFt3b3Jrc3BhY2VBZ2VudHMsIHNraWxsSG9va0NvbnRhaW5lcnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGlzY292ZXJDb2RleFdvcmtzcGFjZUFnZW50cyh0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbiksIHRoaXMuX2ZpbGVTZXJ2aWNlKSxcblx0XHRcdHRoaXMuX2ZldGNoU2tpbGxIb29rQ29udGFpbmVycyhzZXNzaW9uKSxcblx0XHRdKTtcblx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNvbnRhaW5lciBvZiBbLi4ud29ya3NwYWNlQWdlbnRzLmNvbnRhaW5lcnMsIC4uLnNraWxsSG9va0NvbnRhaW5lcnNdKSB7XG5cdFx0XHR0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCwgY3VzdG9taXphdGlvbjogY29udGFpbmVyIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSb3V0ZXMgYW4gTUNQIHJlcXVlc3QgcmVjZWl2ZWQgb24gdGhpcyBzZXNzaW9uJ3MgYG1jcDovL2Agc2lkZSBjaGFubmVsXG5cdCAqIHRvIGNvZGV4LiBSZWFkLW9ubHkgbWV0aG9kcyAoYHRvb2xzL2xpc3RgLCBgcmVzb3VyY2VzL2xpc3RgLFxuXHQgKiBgcmVzb3VyY2VzL3RlbXBsYXRlcy9saXN0YCkgYXJlIGFuc3dlcmVkIGZyb20gdGhlIGNhY2hlZCBpbnZlbnRvcnk7XG5cdCAqIGB0b29scy9jYWxsYCBhbmQgYHJlc291cmNlcy9yZWFkYCByb3VuZC10cmlwIHRvIHRoZSBhcHAtc2VydmVyIHdpdGggdGhlXG5cdCAqIHNlc3Npb24ncyB0aHJlYWQgaWQuIFVua25vd24gc2VydmVycyAvIG1ldGhvZHMgcmVqZWN0IHdpdGhcblx0ICogYE1ldGhvZCBub3QgZm91bmRgIHNvIHRoZSBwcm90b2NvbCBzZXJ2ZXIgbWFwcyB0aGVtIHRvIEpTT04tUlBDXG5cdCAqIGAtMzI2MDFgLlxuXHQgKi9cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdChzZXNzaW9uVXJpOiBVUkksIHNlcnZlck5hbWU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uSWQpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNZXRob2Qgbm90IGZvdW5kOiBubyBhY3RpdmUgc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9tY3BJbnZlbnRvcnkuZ2V0KHNlcnZlck5hbWUpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWV0aG9kIG5vdCBmb3VuZDogdW5rbm93biBNQ1Agc2VydmVyICcke3NlcnZlck5hbWV9J2ApO1xuXHRcdH1cblx0XHRjb25zdCByZWFkID0gYnVpbGRDb2RleE1jcFJlYWRSZXN1bHQobWV0aG9kLCBlbnRyeSk7XG5cdFx0aWYgKHJlYWQuaGFuZGxlZCkge1xuXHRcdFx0cmV0dXJuIHJlYWQucmVzdWx0O1xuXHRcdH1cblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAndG9vbHMvY2FsbCc6IHtcblx0XHRcdFx0Y29uc3QgdG9vbCA9IHBhcmFtcyAmJiB0eXBlb2YgcGFyYW1zWyduYW1lJ10gPT09ICdzdHJpbmcnID8gcGFyYW1zWyduYW1lJ10gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghdG9vbCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgdG9vbHMvY2FsbCBtaXNzaW5nICduYW1lJyBwYXJhbWV0ZXJgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0aHJlYWRJZCA9IGF3YWl0IHRoaXMuX2Vuc3VyZVRocmVhZElkKHNlc3Npb24pO1xuXHRcdFx0XHRjb25zdCBjb25uID0gYXdhaXQgdGhpcy5fZW5zdXJlQ29ubmVjdGlvbigpO1xuXHRcdFx0XHRyZXR1cm4gY29ubi5jbGllbnQucmVxdWVzdDwnbWNwU2VydmVyL3Rvb2wvY2FsbCcsIE1jcFNlcnZlclRvb2xDYWxsUmVzcG9uc2U+KCdtY3BTZXJ2ZXIvdG9vbC9jYWxsJywge1xuXHRcdFx0XHRcdHRocmVhZElkLFxuXHRcdFx0XHRcdHNlcnZlcjogc2VydmVyTmFtZSxcblx0XHRcdFx0XHR0b29sLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogKHBhcmFtcyA/IHBhcmFtc1snYXJndW1lbnRzJ10gOiB1bmRlZmluZWQpIGFzIEpzb25WYWx1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdyZXNvdXJjZXMvcmVhZCc6IHtcblx0XHRcdFx0Y29uc3QgdXJpID0gcGFyYW1zICYmIHR5cGVvZiBwYXJhbXNbJ3VyaSddID09PSAnc3RyaW5nJyA/IHBhcmFtc1sndXJpJ10gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghdXJpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGByZXNvdXJjZXMvcmVhZCBtaXNzaW5nICd1cmknIHBhcmFtZXRlcmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRocmVhZElkID0gYXdhaXQgdGhpcy5fZW5zdXJlVGhyZWFkSWQoc2Vzc2lvbik7XG5cdFx0XHRcdGNvbnN0IGNvbm4gPSBhd2FpdCB0aGlzLl9lbnN1cmVDb25uZWN0aW9uKCk7XG5cdFx0XHRcdHJldHVybiBjb25uLmNsaWVudC5yZXF1ZXN0PCdtY3BTZXJ2ZXIvcmVzb3VyY2UvcmVhZCcsIE1jcFJlc291cmNlUmVhZFJlc3BvbnNlPignbWNwU2VydmVyL3Jlc291cmNlL3JlYWQnLCB7XG5cdFx0XHRcdFx0dGhyZWFkSWQsXG5cdFx0XHRcdFx0c2VydmVyOiBzZXJ2ZXJOYW1lLFxuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCBub3QgZm91bmQ6ICR7bWV0aG9kfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0YXJ0TWNwU2VydmVyKHNlc3Npb25Vcmk6IFVSSSwgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpKTtcblx0XHRjb25zdCBzZXJ2ZXJOYW1lID0gc2Vzc2lvbiA/IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKHNlc3Npb24sIGlkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlc3Npb24gfHwgIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBDYW5ub3Qgc3RhcnQgdW5rbm93biBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gJHtpZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29ubiA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNvbm5lY3Rpb24oKTtcblx0XHRhd2FpdCBjb25uLmNsaWVudC5yZXF1ZXN0PCdjb25maWcvbWNwU2VydmVyL3JlbG9hZCc+KCdjb25maWcvbWNwU2VydmVyL3JlbG9hZCcsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaE1jcEludmVudG9yeShjb25uLmNsaWVudCk7XG5cdH1cblxuXHRhc3luYyBzdG9wTWNwU2VydmVyKHNlc3Npb25Vcmk6IFVSSSwgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpKTtcblx0XHRjb25zdCBzZXJ2ZXJOYW1lID0gc2Vzc2lvbiA/IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKHNlc3Npb24sIGlkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlc3Npb24gfHwgIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBDYW5ub3Qgc3RvcCB1bmtub3duIE1DUCBzZXJ2ZXIgY3VzdG9taXphdGlvbiAke2lkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUT0RPOiBXaXJlIHRoaXMgd2hlbiBDb2RleCBleHBvc2VzIGEgdHlwZWQgTUNQIHNlcnZlciBzdG9wIHJlcXVlc3QuXG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlTWNwU2VydmVyTmFtZShzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBpZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5fZ2V0T3JDcmVhdGVNY3BDb250cm9sbGVyKHNlc3Npb24pO1xuXHRcdGNvbnRyb2xsZXIuYXBwbHlBbGwoaW52ZW50b3J5VG9TZGtTZXJ2ZXJzKHRoaXMuX21jcEludmVudG9yeSkpO1xuXHRcdHRoaXMuX3JlZnJlc2hNY3BDdXN0b21pemF0aW9uSWRzKHNlc3Npb24sIGNvbnRyb2xsZXIpO1xuXHRcdHJldHVybiBjb250cm9sbGVyLnNlcnZlck5hbWVGb3JDdXN0b21pemF0aW9uSWQoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExhemlseSBjcmVhdGUgdGhlIHBlci1zZXNzaW9uIHtAbGluayBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcn0uIE5vdFxuXHQgKiByZWdpc3RlcmVkIG9uIHRoZSBhZ2VudCAoc2Vzc2lvbnMgY29tZSBhbmQgZ28pIFx1MjAxNCBkaXNwb3NlZCBleHBsaWNpdGx5XG5cdCAqIHdoZW4gdGhlIHNlc3Npb24gaXMgcmVtb3ZlZC5cblx0ICovXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlTWNwQ29udHJvbGxlcihzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIge1xuXHRcdGlmICghc2Vzc2lvbi5tY3BDb250cm9sbGVyKSB7XG5cdFx0XHRzZXNzaW9uLm1jcENvbnRyb2xsZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlciwge1xuXHRcdFx0XHRwcm92aWRlcklkOiB0aGlzLmlkLFxuXHRcdFx0XHRzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0XHRzZXNzaW9uVXJpOiBzZXNzaW9uLnNlc3Npb25VcmksXG5cdFx0XHRcdGVtaXQ6IGFjdGlvbiA9PiB0aGlzLl9maXJlKHNlc3Npb24uc2Vzc2lvblVyaSwgYWN0aW9uKSxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBDT0RFWF9NQ1BfQVBQX0NBUEFCSUxJVElFUyxcblx0XHRcdFx0cGx1Z2luTWNwU2VydmVyU291cmNlczogKCkgPT4gY29kZXhQbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzKHNlc3Npb24uY2xpZW50Q3VzdG9taXphdGlvbnMucGx1Z2lucygpKSxcblx0XHRcdFx0cmVzb2x2ZUVuYWJsZW1lbnQ6IChzZXJ2ZXIsIG93bmluZ1BsdWdpblVyaSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSB0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UucmVzb2x2ZShzZXNzaW9uLnNlc3Npb25VcmkudG9TdHJpbmcoKSwgdGFyZ2V0Rm9yTWNwU2VydmVyKHNlcnZlciwgb3duaW5nUGx1Z2luVXJpLCBmYWxzZSkpO1xuXHRcdFx0XHRcdHJldHVybiByZXNvbHV0aW9uLmtpbmQgPT09ICdyZXNvbHZlZCcgPyByZXNvbHV0aW9uLmVuYWJsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb24ubWNwQ29udHJvbGxlcjtcblx0fVxuXG5cdC8qKiBNaXJyb3JzIHRoZSBjb25uZWN0aW9uLWdsb2JhbCBpbnZlbnRvcnkgb250byBldmVyeSBsaXZlIHNlc3Npb24uICovXG5cdHByaXZhdGUgX2FwcGx5TWNwSW52ZW50b3J5VG9TZXNzaW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBzZXJ2ZXJzID0gaW52ZW50b3J5VG9TZGtTZXJ2ZXJzKHRoaXMuX21jcEludmVudG9yeSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5kaXNwb3NlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9nZXRPckNyZWF0ZU1jcENvbnRyb2xsZXIoc2Vzc2lvbik7XG5cdFx0XHRjb250cm9sbGVyLmFwcGx5QWxsKHNlcnZlcnMpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaE1jcEN1c3RvbWl6YXRpb25JZHMoc2Vzc2lvbiwgY29udHJvbGxlcik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2hlcyB0aGUgc2Vzc2lvbidzIG1hcHBlciBzbmFwc2hvdCBvZiBzZXJ2ZXIgbmFtZSBcdTIxOTIgY3VzdG9taXphdGlvbiBpZFxuXHQgKiAocmVhZCB3aGVuIHN0YW1waW5nIHRoZSBNQ1AgY29udHJpYnV0b3Igb24gdG9vbCBjYWxscykuIFBsYWluIGRhdGEsIG93bmVkXG5cdCAqIGhlcmUgXHUyMDE0IHRoZSBtYXBwZXIgbmV2ZXIgcmVhY2hlcyBiYWNrIGludG8gdGhlIGNvbnRyb2xsZXIuIE11c3QgcnVuIG9uIGV2ZXJ5XG5cdCAqIGludmVudG9yeSBjaGFuZ2UgYmVjYXVzZSBNQ1Agc2VydmVycyBhcmUgZGlzY292ZXJlZCBhc3luY2hyb25vdXNseSwgYWZ0ZXIgYVxuXHQgKiBzZXNzaW9uIChhbmQgcG9zc2libHkgaXRzIGZpcnN0IHRvb2wgY2FsbCkgYWxyZWFkeSBleGlzdHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWZyZXNoTWNwQ3VzdG9taXphdGlvbklkcyhzZXNzaW9uOiBJQ29kZXhTZXNzaW9uLCBjb250cm9sbGVyOiBNY3BDdXN0b21pemF0aW9uQ29udHJvbGxlcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkcyA9IHNlc3Npb24ubWFwU3RhdGUubWNwQ3VzdG9taXphdGlvbklkcztcblx0XHRpZHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlck5hbWUgb2YgdGhpcy5fbWNwSW52ZW50b3J5LmtleXMoKSkge1xuXHRcdFx0Y29uc3QgaWQgPSBjb250cm9sbGVyLmN1c3RvbWl6YXRpb25JZEZvclNlcnZlcihzZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChpZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlkcy5zZXQoc2VydmVyTmFtZSwgaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1yZWFkcyB0aGUgZnVsbCBNQ1AgaW52ZW50b3J5IGZyb20gdGhlIGFwcC1zZXJ2ZXIgKHBhZ2luYXRlZCkgYW5kXG5cdCAqIHJlLXB1Ymxpc2hlcyBpdCB0byBldmVyeSBzZXNzaW9uLiBGaXJlcyBgbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWRgXG5cdCAqIG9uIGVhY2ggcmVhZHkgY2hhbm5lbCB3aG9zZSB0b29sIHNldCBjaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaE1jcEludmVudG9yeShjbGllbnQ6IElDb2RleEFwcFNlcnZlckNsaWVudCwgcHJlc2VydmVNaXNzaW5nUmVhZHlTZXJ2ZXI/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZGF0YTogTGlzdE1jcFNlcnZlclN0YXR1c1Jlc3BvbnNlWydkYXRhJ10gPSBbXTtcblx0XHR0cnkge1xuXHRcdFx0bGV0IGN1cnNvcjogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCA9IG51bGw7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlOiBMaXN0TWNwU2VydmVyU3RhdHVzUmVzcG9uc2UgPSBhd2FpdCBjbGllbnQucmVxdWVzdDwnbWNwU2VydmVyU3RhdHVzL2xpc3QnLCBMaXN0TWNwU2VydmVyU3RhdHVzUmVzcG9uc2U+KCdtY3BTZXJ2ZXJTdGF0dXMvbGlzdCcsIHsgY3Vyc29yLCBkZXRhaWw6ICdmdWxsJyB9KTtcblx0XHRcdFx0ZGF0YSA9IGRhdGEuY29uY2F0KHJlc3BvbnNlLmRhdGEpO1xuXHRcdFx0XHRjdXJzb3IgPSByZXNwb25zZS5uZXh0Q3Vyc29yO1xuXHRcdFx0fSB3aGlsZSAoY3Vyc29yKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSBGYWlsZWQgdG8gbGlzdCBNQ1Agc2VydmVyczogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERyb3AgdGhlIHJlc3VsdCBpZiB0aGUgY29ubmVjdGlvbiB3YXMgcmVwbGFjZWQgd2hpbGUgd2Ugd2VyZSBsaXN0aW5nLlxuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgPT09ICdyZWFkeScgJiYgdGhpcy5fY29ubmVjdGlvbi5jbGllbnQgIT09IGNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0ID0gY29kZXhNY3BMaXN0VG9JbnZlbnRvcnkoZGF0YSk7XG5cdFx0Y29uc3QgdG9vbHNDaGFuZ2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW25hbWUsIGVudHJ5XSBvZiBuZXh0KSB7XG5cdFx0XHRjb25zdCBwcmV2ID0gdGhpcy5fbWNwSW52ZW50b3J5LmdldChuYW1lKTtcblx0XHRcdGlmIChwcmV2ICYmIGNvZGV4TWNwVG9vbHNDaGFuZ2VkKHByZXYsIGVudHJ5KSkge1xuXHRcdFx0XHR0b29sc0NoYW5nZWQucHVzaChuYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbbmFtZSwgZW50cnldIG9mIHRoaXMuX21jcEludmVudG9yeSkge1xuXHRcdFx0aWYgKCFuZXh0LmhhcyhuYW1lKSAmJiAoZW50cnkuc3RhdGUua2luZCAhPT0gTWNwU2VydmVyU3RhdHVzLlJlYWR5IHx8IG5hbWUgPT09IHByZXNlcnZlTWlzc2luZ1JlYWR5U2VydmVyKSkge1xuXHRcdFx0XHRuZXh0LnNldChuYW1lLCBlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX21jcEludmVudG9yeS5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgW25hbWUsIGVudHJ5XSBvZiBuZXh0KSB7XG5cdFx0XHR0aGlzLl9tY3BJbnZlbnRvcnkuc2V0KG5hbWUsIGVudHJ5KTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIE1DUCBpbnZlbnRvcnkgcmVmcmVzaGVkOiAke3RoaXMuX21jcEludmVudG9yeS5zaXplID09PSAwID8gJyhub25lKScgOiBbLi4udGhpcy5fbWNwSW52ZW50b3J5XS5tYXAoKFtuYW1lLCBlbnRyeV0pID0+IGAke25hbWV9IFske2VudHJ5LnN0YXRlLmtpbmR9LCAke2VudHJ5LnRvb2xzLmxlbmd0aH0gdG9vbChzKV1gKS5qb2luKCcsICcpfWApO1xuXHRcdHRoaXMuX2FwcGx5TWNwSW52ZW50b3J5VG9TZXNzaW9ucygpO1xuXHRcdGZvciAoY29uc3QgbmFtZSBvZiB0b29sc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2ZpcmVNY3BUb29sc0xpc3RDaGFuZ2VkKG5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIGEgYG1jcFNlcnZlci9zdGFydHVwU3RhdHVzL3VwZGF0ZWRgIG5vdGlmaWNhdGlvbi4gYHJlYWR5YFxuXHQgKiB0cmlnZ2VycyBhIGZ1bGwgaW52ZW50b3J5IHJlZnJlc2ggKHRvIHB1bGwgdGhlIG5vdy1sb2FkZWQgdG9vbHMpO1xuXHQgKiBvdGhlciB0cmFuc2l0aW9ucyB1cGRhdGUgdGhlIGNhY2hlZCBzdGF0ZSBpbiBwbGFjZSBzbyB0aGUgVUkgc2VlcyB0aGVcblx0ICogc2VydmVyIHNldHRsZSBpbnRvIHN0YXJ0aW5nL2Vycm9yL3N0b3BwZWQgcHJvbXB0bHkuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVNY3BTdGFydHVwU3RhdHVzKGNsaWVudDogSUNvZGV4QXBwU2VydmVyQ2xpZW50LCBuYW1lOiBzdHJpbmcsIHN0YXR1czogTWNwU2VydmVyU3RhcnR1cFN0YXRlLCBlcnJvcjogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uLmtpbmQgPT09ICdyZWFkeScgJiYgdGhpcy5fY29ubmVjdGlvbi5jbGllbnQgIT09IGNsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gTUNQIHNlcnZlciAnJHtuYW1lfScgc3RhcnR1cCBzdGF0dXM6ICR7c3RhdHVzfSR7ZXJyb3IgPyBgICgke2Vycm9yfSlgIDogJyd9YCk7XG5cdFx0aWYgKHN0YXR1cyA9PT0gJ3JlYWR5Jykge1xuXHRcdFx0Ly8gVGhlIHJlYWR5IG5vdGlmaWNhdGlvbiBpcyBhdXRob3JpdGF0aXZlLiBQdWJsaXNoIGl0IGltbWVkaWF0ZWx5IGFuZFxuXHRcdFx0Ly8gcHJlc2VydmUgaXQgaWYgdGhlIGNvbmN1cnJlbnRseSByZWZyZXNoZWQgbGlzdCBoYXMgbm90IGNhdWdodCB1cCB5ZXQuXG5cdFx0XHR0aGlzLl9zZXRNY3BTZXJ2ZXJTdGF0ZShuYW1lLCB0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZShzdGF0dXMsIGVycm9yKSk7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hNY3BJbnZlbnRvcnkoY2xpZW50LCBuYW1lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQW4gYXV0aC1nYXRlZCBodHRwIHNlcnZlciB3aG9zZSBzaWduLWluIHdlIGNhbiBkcml2ZTogZGlzY292ZXIgaXRzXG5cdFx0Ly8gT0F1dGggbWV0YWRhdGEgYXN5bmNocm9ub3VzbHkgKGNvZGV4J3MgZmFpbHVyZSBub3RpZmljYXRpb24gb21pdHMgaXQpXG5cdFx0Ly8gYW5kIHRoZW4gc3VyZmFjZSBgQXV0aFJlcXVpcmVkYC4gVGhlIHNlcnZlciBzdGF5cyBpbiBpdHMgY3VycmVudFxuXHRcdC8vIChzdGFydGluZykgc3RhdGUgdW50aWwgZGlzY292ZXJ5IHJlc29sdmVzLlxuXHRcdGlmIChzdGF0dXMgPT09ICdmYWlsZWQnICYmIGNvZGV4U3RhcnR1cEVycm9yTmVlZHNBdXRoKGVycm9yKSkge1xuXHRcdFx0Y29uc3QgdXJsID0gdGhpcy5fbWNwU2VydmVyVXJsRm9yTmFtZShuYW1lKTtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSB1cmwgIT09IHVuZGVmaW5lZCA/IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwodXJsKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh1cmwgIT09IHVuZGVmaW5lZCAmJiBub3JtYWxpemVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gQSB0b2tlbiB3ZSBhbHJlYWR5IGluamVjdGVkIHdhcyByZWplY3RlZCAoZXhwaXJlZC9yZXZva2VkL1xuXHRcdFx0XHQvLyBpbnN1ZmZpY2llbnQgc2NvcGVzKS4gRHJvcCBpdCBzbyB0aGUgdXNlciBpcyByZS1wcm9tcHRlZFxuXHRcdFx0XHQvLyBpbnN0ZWFkIG9mIGdldHRpbmcgc3R1Y2sgb24gYSB0ZXJtaW5hbCBlcnJvciB3aXRoIG5vIHdheSB0b1xuXHRcdFx0XHQvLyByZS1hdXRoZW50aWNhdGUuXG5cdFx0XHRcdGlmICh0aGlzLl9tY3BBdXRoVG9rZW5zLmRlbGV0ZShub3JtYWxpemVkKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvZGV4XSBNQ1Agc2VydmVyICcke25hbWV9JyByZWplY3RlZCB0aGUgc3RvcmVkIHRva2VuOyBjbGVhcmluZyBpdCB0byBhbGxvdyByZS1hdXRoZW50aWNhdGlvbmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZvaWQgdGhpcy5fc3VyZmFjZU1jcEF1dGhSZXF1aXJlZChjbGllbnQsIG5hbWUsIHVybCwgZXJyb3IpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3NldE1jcFNlcnZlclN0YXRlKG5hbWUsIHRyYW5zbGF0ZUNvZGV4TWNwU3RhcnR1cFN0YXRlKHN0YXR1cywgZXJyb3IpKTtcblx0fVxuXG5cdC8qKiBVcHNlcnRzIGEgc2VydmVyJ3MgbGlmZWN5Y2xlIHN0YXRlIGluIHRoZSBpbnZlbnRvcnkgKHByZXNlcnZpbmcgY2FjaGVkIHRvb2xzKSBhbmQgcmVwdWJsaXNoZXMuICovXG5cdHByaXZhdGUgX3NldE1jcFNlcnZlclN0YXRlKG5hbWU6IHN0cmluZywgc3RhdGU6IE1jcFNlcnZlclN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuX21jcEludmVudG9yeS5nZXQobmFtZSk7XG5cdFx0dGhpcy5fbWNwSW52ZW50b3J5LnNldChuYW1lLCB7XG5cdFx0XHRzdGF0ZSxcblx0XHRcdHRvb2xzOiBwcmV2Py50b29scyA/PyBbXSxcblx0XHRcdHJlc291cmNlczogcHJldj8ucmVzb3VyY2VzID8/IFtdLFxuXHRcdFx0cmVzb3VyY2VUZW1wbGF0ZXM6IHByZXY/LnJlc291cmNlVGVtcGxhdGVzID8/IFtdLFxuXHRcdH0pO1xuXHRcdHRoaXMuX2FwcGx5TWNwSW52ZW50b3J5VG9TZXNzaW9ucygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN1cmZhY2VzIGFuIGF1dGgtZ2F0ZWQgaHR0cCBNQ1Agc2VydmVyIGFzIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkfVxuXHQgKiBzbyB0aGUgd29ya2JlbmNoIHJ1bnMgdGhlICpzYW1lKiBPQXV0aCBzaWduLWluIGl0IHVzZXMgZm9yIHRoZSBDb3BpbG90XG5cdCAqIGFnZW50LiBjb2RleCdzIGBmYWlsZWRgIG5vdGlmaWNhdGlvbiBjYXJyaWVzIG5vIFJGQyA5NzI4IG1ldGFkYXRhLCBhbmQgdGhlXG5cdCAqIHdvcmtiZW5jaCdzIGByZXNvbHZlTWNwU2VydmVyQXV0aGVudGljYXRpb25gIG5lZWRzIHRoZSByZXNvdXJjZSdzXG5cdCAqIGBhdXRob3JpemF0aW9uX3NlcnZlcnNgIHRvIGtub3cgd2hlcmUgdG8gc2lnbiBpbiBcdTIwMTQgc28gd2UgZGlzY292ZXIgdGhlXG5cdCAqIFByb3RlY3RlZCBSZXNvdXJjZSBNZXRhZGF0YSAoYDx1cmw+Ly53ZWxsLWtub3duL29hdXRoLXByb3RlY3RlZC1yZXNvdXJjZWApXG5cdCAqIGhlcmUsIG1pcnJvcmluZyB0aGUgZGlzY292ZXJ5IHRoZSBDb3BpbG90IFNESyBkb2VzIGludGVybmFsbHkuIE9uXG5cdCAqIGRpc2NvdmVyeSBmYWlsdXJlIHdlIHN0aWxsIHN1cmZhY2UgYEF1dGhSZXF1aXJlZGAgd2l0aCBiYXJlIG1ldGFkYXRhICh0aGVcblx0ICogc2VydmVyIGdlbnVpbmVseSBuZWVkcyBhdXRoKTsgdGhlIG9uZS1jbGljayBzaWduLWluIGp1c3QgY2FuJ3QgY29tcGxldGVcblx0ICogd2l0aG91dCB0aGUgYXV0aG9yaXphdGlvbiBzZXJ2ZXIsIHdoaWNoIGlzIGxvZ2dlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3N1cmZhY2VNY3BBdXRoUmVxdWlyZWQoY2xpZW50OiBJQ29kZXhBcHBTZXJ2ZXJDbGllbnQsIG5hbWU6IHN0cmluZywgdXJsOiBzdHJpbmcsIGVycm9yOiBzdHJpbmcgfCBudWxsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZENoaWxkcmVuID0gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXVxuXHRcdFx0LmZsYXRNYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLmNsaWVudEN1c3RvbWl6YXRpb25zLnRvQ3VzdG9taXphdGlvbnMoKSlcblx0XHRcdC5mbGF0TWFwKHBsdWdpbiA9PiBwbHVnaW4uY2hpbGRyZW4gPz8gW10pXG5cdFx0XHQuZmlsdGVyKChjaGlsZCk6IGNoaWxkIGlzIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gPT4gY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyICYmIGNoaWxkLm5hbWUgPT09IG5hbWUpO1xuXHRcdGlmIChjb25maWd1cmVkQ2hpbGRyZW4ubGVuZ3RoID4gMCAmJiBjb25maWd1cmVkQ2hpbGRyZW4uZXZlcnkoY2hpbGQgPT4gIWlzQ3VzdG9taXphdGlvbkVuYWJsZWQoY2hpbGQpKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIFN1cHByZXNzZWQgYXV0aGVudGljYXRpb24gcmVxdWVzdCBmcm9tIGRpc2FibGVkIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSA9IHsgcmVzb3VyY2U6IHVybCwgcmVzb3VyY2VfbmFtZTogbmFtZSB9O1xuXHRcdGxldCByZXF1aXJlZFNjb3Blczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCByYWNlVGltZW91dChmZXRjaFJlc291cmNlTWV0YWRhdGEodXJsLCB1bmRlZmluZWQpLCAxNV8wMDApO1xuXHRcdFx0aWYgKGRpc2NvdmVyZWQpIHtcblx0XHRcdFx0cmVzb3VyY2UgPSBkaXNjb3ZlcmVkLm1ldGFkYXRhO1xuXHRcdFx0XHRyZXF1aXJlZFNjb3BlcyA9IGRpc2NvdmVyZWQubWV0YWRhdGEuc2NvcGVzX3N1cHBvcnRlZDtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29kZXhdIGRpc2NvdmVyZWQgT0F1dGggbWV0YWRhdGEgZm9yIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nOiBhdXRob3JpemF0aW9uX3NlcnZlcnM9WyR7KGRpc2NvdmVyZWQubWV0YWRhdGEuYXV0aG9yaXphdGlvbl9zZXJ2ZXJzID8/IFtdKS5qb2luKCcsICcpfV1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvZGV4XSB0aW1lZCBvdXQgZGlzY292ZXJpbmcgT0F1dGggbWV0YWRhdGEgZm9yIE1DUCBzZXJ2ZXIgJyR7bmFtZX0nIGF0ICR7dXJsfTsgdGhlIEF1dGhlbnRpY2F0ZSBhY3Rpb24gbWF5IG5vdCBiZSBhYmxlIHRvIGNvbXBsZXRlYCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb2RleF0gZmFpbGVkIHRvIGRpc2NvdmVyIE9BdXRoIG1ldGFkYXRhIGZvciBNQ1Agc2VydmVyICcke25hbWV9JyBhdCAke3VybH07IHRoZSBBdXRoZW50aWNhdGUgYWN0aW9uIG1heSBub3QgYmUgYWJsZSB0byBjb21wbGV0ZTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHRcdC8vIERyb3AgdGhlIHJlc3VsdCBpZiB0aGUgY29ubmVjdGlvbiB3YXMgcmVwbGFjZWQgd2hpbGUgZGlzY292ZXJpbmcuXG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24ua2luZCA9PT0gJ3JlYWR5JyAmJiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudCAhPT0gY2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFJlY29yZCB3aGljaCBzZXJ2ZXIgVVJMIHRoaXMgT0F1dGggcmVzb3VyY2UgdW5sb2NrczogZGlzY292ZXJ5IGNhblxuXHRcdC8vIHJldHVybiBhIGByZXNvdXJjZWAgdGhhdCBkaWZmZXJzIGZyb20gdGhlIGNvbmZpZ3VyZWQgc2VydmVyIFVSTCwgYW5kXG5cdFx0Ly8gdGhlIHRva2VuIHRoZSB3b3JrYmVuY2ggbGF0ZXIgcHVzaGVzIGJhY2sgaXMga2V5ZWQgYnkgdGhhdCByZXNvdXJjZS5cblx0XHRjb25zdCBub3JtYWxpemVkU2VydmVyID0gbm9ybWFsaXplQ29kZXhNY3BSZXNvdXJjZVVybCh1cmwpO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRSZXNvdXJjZSA9IG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwocmVzb3VyY2UucmVzb3VyY2UpID8/IG5vcm1hbGl6ZWRTZXJ2ZXI7XG5cdFx0aWYgKG5vcm1hbGl6ZWRTZXJ2ZXIgIT09IHVuZGVmaW5lZCAmJiBub3JtYWxpemVkUmVzb3VyY2UgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX21jcEF1dGhTZXJ2ZXJVcmxzQnlSZXNvdXJjZS5nZXQobm9ybWFsaXplZFJlc291cmNlKSA/PyBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHNlcnZlcnMuYWRkKG5vcm1hbGl6ZWRTZXJ2ZXIpO1xuXHRcdFx0dGhpcy5fbWNwQXV0aFNlcnZlclVybHNCeVJlc291cmNlLnNldChub3JtYWxpemVkUmVzb3VyY2UsIHNlcnZlcnMpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb2RleF0gTUNQIHNlcnZlciAnJHtuYW1lfScgcmVxdWlyZXMgYXV0aGVudGljYXRpb24gZm9yICR7dXJsfWApO1xuXHRcdHRoaXMuX3NldE1jcFNlcnZlclN0YXRlKG5hbWUsIHtcblx0XHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cmVxdWlyZWRTY29wZXM6IHJlcXVpcmVkU2NvcGVzICYmIHJlcXVpcmVkU2NvcGVzLmxlbmd0aCA+IDAgPyByZXF1aXJlZFNjb3BlcyA6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBlcnJvciA/PyB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnJvYWRjYXN0cyBgbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWRgIGZvciBgc2VydmVyTmFtZWAgb24gZXZlcnlcblx0ICogc2Vzc2lvbiB3aG9zZSBjaGFubmVsIGZvciB0aGF0IHNlcnZlciBpcyBjdXJyZW50bHkgcmVhZHkuIENsaWVudHNcblx0ICogcmVmZXRjaCBgdG9vbHMvbGlzdGAgaW4gcmVzcG9uc2UuXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlTWNwVG9vbHNMaXN0Q2hhbmdlZChzZXJ2ZXJOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGNoYW5uZWwgPSBzZXNzaW9uLm1jcENvbnRyb2xsZXI/LmNoYW5uZWxGb3JTZXJ2ZXIoc2VydmVyTmFtZSk7XG5cdFx0XHRpZiAoY2hhbm5lbCkge1xuXHRcdFx0XHR0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5maXJlKHsgY2hhbm5lbCwgbWV0aG9kOiAnbm90aWZpY2F0aW9ucy90b29scy9saXN0X2NoYW5nZWQnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIHRoZSBzZXNzaW9uIGhhcyBhIG1hdGVyaWFsaXplZCBjb2RleCB0aHJlYWQgYW5kIHJldHVybnMgaXRzIGlkLlxuXHQgKiBNQ1AgdG9vbCBjYWxscyAoYG1jcFNlcnZlci90b29sL2NhbGxgKSBhcmUgdGhyZWFkLXNjb3BlZCwgc28gYSBjYWxsXG5cdCAqIGFycml2aW5nIGJlZm9yZSB0aGUgZmlyc3QgdHVybiBsYXppbHkgc3RhcnRzIHRoZSB0aHJlYWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVUaHJlYWRJZChzZXNzaW9uOiBJQ29kZXhTZXNzaW9uKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZUlmTmVlZGVkKHNlc3Npb24sIHNlc3Npb24uc2Vzc2lvblVyaSwgZmFsc2UpO1xuXHRcdGlmIChzZXNzaW9uLnRocmVhZElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJ1biBNQ1AgdG9vbDogY29kZXggc2Vzc2lvbiAke3Nlc3Npb24uc2Vzc2lvbklkfSBpcyBub3QgbWF0ZXJpYWxpemVkYCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uLnRocmVhZElkO1xuXHR9XG5cblx0YXN5bmMgc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fZGlzcG9zZUNvbm5lY3Rpb24oKTtcblx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHMucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMuZGVueUFsbCgnZGVjbGluZScpO1xuXHRcdFx0cy5wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRzLnBlbmRpbmdVc2VySW5wdXRzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0XHRzLm1jcENvbnRyb2xsZXI/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmNsZWFyKCk7XG5cdFx0dGhpcy5fZmlsZUVkaXRPYnNlcnZlcnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5fbWNwSW52ZW50b3J5LmNsZWFyKCk7XG5cdH1cblxuXHRyZXNvbHZlQ2hhdENvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVDaGF0Q29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdGNvbnN0IHZhbHVlcyA9IGNvZGV4U2Vzc2lvbkNvbmZpZ1NjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdChwYXJhbXMuY29uZmlnLCBjb2RleFNlc3Npb25Db25maWdEZWZhdWx0cyk7XG5cdFx0Y29uc3Qgc2NoZW1hID0gY29kZXhWaXNpYmxlU2Vzc2lvbkNvbmZpZ1NjaGVtYS50b1Byb3RvY29sKCk7XG5cdFx0Ly8gUHJlc2VydmUgZXZlcnkgdmFsdWUgdGhlIGNhbGxlciBwcmV2aW91c2x5IHBlcnNpc3RlZC4gVGhpcyByZXR1cm5cblx0XHQvLyBSRVBMQUNFUyB0aGUgc3RvcmVkIHNlc3Npb24gY29uZmlnIG9uIHJlc3RvcmUgKHNlZVxuXHRcdC8vIGBBZ2VudFNlcnZpY2UuX3Jlc29sdmVDcmVhdGVkU2Vzc2lvbkNvbmZpZ2ApLCBzbyBjaGVycnktcGlja2luZyBvbmx5XG5cdFx0Ly8gdGhlIHZpc2libGUga2V5cyBoZXJlIHdvdWxkIHJlc2V0IGFsbCB0aGUgb3RoZXJzIChyZWFzb25pbmcgZWZmb3J0LFxuXHRcdC8vIHBlcnNvbmFsaXR5LCBzYW5kYm94IGF4ZXMsIFx1MjAyNikgYmFjayB0byB0aGVpciBkZWZhdWx0cyBvbiByZXN1bWUuXG5cdFx0Y29uc3QgcmVzb2x2ZWRWYWx1ZXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge1xuXHRcdFx0Li4ucGFyYW1zLmNvbmZpZyxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiB2YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSxcblx0XHR9O1xuXHRcdC8vIE1pZ3JhdGUgdGhlIHBlcm1pc3Npb24gYXhlcyBvZmYgdGhlIHJhdyBjb25maWcuIGB2YWxpZGF0ZU9yRGVmYXVsdGBcblx0XHQvLyBhbHdheXMgbWF0ZXJpYWxpemVzIGBwZXJtaXNzaW9uc1ByZXNldD0nZGVmYXVsdCdgLCBidXQgYmxpbmRseSBzdG9yaW5nXG5cdFx0Ly8gdGhhdCB3b3VsZCBzaWxlbnRseSBlc2NhbGF0ZSBhIGxlZ2FjeSBzZXNzaW9uIHRoYXQgcGVyc2lzdGVkIG9ubHkgdGhlXG5cdFx0Ly8gaW5kaXZpZHVhbCBgc2FuZGJveE1vZGVgL2BhcHByb3ZhbFBvbGljeWAgYXhlcyAoZS5nLiBgcmVhZC1vbmx5YCkgXHUyMDE0XG5cdFx0Ly8gYHJlc29sdmVDb2RleFBlcm1pc3Npb25zYCBjaGVja3MgdGhlIHByZXNldCBmaXJzdC4gRHJvcCBhbGwgdGhyZWVcblx0XHQvLyBwZXJtaXNzaW9uIGtleXMsIHRoZW4gcmUtYXBwbHkgb25seSB0aGUgb25lcyB0aGUgbWlncmF0aW9uIGRlY2lkZXMgYXJlXG5cdFx0Ly8gc2FmZSAoYW4gZXhwbGljaXQgb3IgZXhhY3RseS1lcXVpdmFsZW50IHByZXNldCwgZWxzZSB0aGUgcmF3IGF4ZXMpLlxuXHRcdGRlbGV0ZSByZXNvbHZlZFZhbHVlc1tDb2RleFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNQcmVzZXRdO1xuXHRcdGRlbGV0ZSByZXNvbHZlZFZhbHVlc1tDb2RleFNlc3Npb25Db25maWdLZXkuQXBwcm92YWxQb2xpY3ldO1xuXHRcdGRlbGV0ZSByZXNvbHZlZFZhbHVlc1tDb2RleFNlc3Npb25Db25maWdLZXkuU2FuZGJveE1vZGVdO1xuXHRcdE9iamVjdC5hc3NpZ24ocmVzb2x2ZWRWYWx1ZXMsIG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXMocGFyYW1zLmNvbmZpZywgdGhpcy5fcGVybWlzc2lvbkF4aXNEZWZhdWx0cygpKSk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHZhbHVlczogcmVzb2x2ZWRWYWx1ZXMsIHNjaGVtYSB9KTtcblx0fVxuXG5cdGdldEluaGVyaXRlZENoYXRDb25maWcoY29uZmlnOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5oZXJpdGVkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IG1pZ3JhdGVDb2RleFBlcm1pc3Npb25WYWx1ZXMoY29uZmlnLCB0aGlzLl9wZXJtaXNzaW9uQXhpc0RlZmF1bHRzKCkpO1xuXHRcdGlmIChjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5oZXJpdGVkW1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdID0gY29uZmlnW1Nlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoaW5oZXJpdGVkKS5sZW5ndGggPiAwID8gaW5oZXJpdGVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgY2hhdENvbmZpZ0NvbXBsZXRpb25zKHBhcmFtczogSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHRpZiAocGFyYW1zLnByb3BlcnR5ICE9PSBDb2RleFNlc3Npb25Db25maWdLZXkuQWRkaXRpb25hbERpcmVjdG9yaWVzKSB7XG5cdFx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0XHR9XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJhbXMucXVlcnk/LnRyaW0oKTtcblx0XHRpZiAoIXF1ZXJ5KSB7XG5cdFx0XHRyZXR1cm4geyBpdGVtczogW10gfTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHBhcmFtcy53b3JraW5nRGlyZWN0b3J5Py5mc1BhdGg7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBpc0Fic29sdXRlKHF1ZXJ5KVxuXHRcdFx0PyBxdWVyeVxuXHRcdFx0OiByZXNvbHZlKHdvcmtpbmdEaXJlY3RvcnkgPz8gcHJvY2Vzcy5jd2QoKSwgcXVlcnkpO1xuXHRcdGNvbnN0IHBhcmVudCA9IHF1ZXJ5LmVuZHNXaXRoKHNlcCkgPyByZXNvbHZlZCA6IGRpcm5hbWUocmVzb2x2ZWQpO1xuXHRcdGNvbnN0IHByZWZpeCA9IHF1ZXJ5LmVuZHNXaXRoKHNlcCkgPyAnJyA6IGJhc2VuYW1lKHJlc29sdmVkKS50b0xvd2VyQ2FzZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgZnMucHJvbWlzZXMucmVhZGRpcihwYXJlbnQsIHsgd2l0aEZpbGVUeXBlczogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGl0ZW1zOiBlbnRyaWVzXG5cdFx0XHRcdFx0LmZpbHRlcihlbnRyeSA9PiBlbnRyeS5pc0RpcmVjdG9yeSgpICYmIGVudHJ5Lm5hbWUudG9Mb3dlckNhc2UoKS5zdGFydHNXaXRoKHByZWZpeCkpXG5cdFx0XHRcdFx0LnNsaWNlKDAsIDUwKVxuXHRcdFx0XHRcdC5tYXAoZW50cnkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBqb2luKHBhcmVudCwgZW50cnkubmFtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZSwgbGFiZWw6IGVudHJ5Lm5hbWUsIGRlc2NyaXB0aW9uOiB2YWx1ZSB9O1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdH1cblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHRwcml2YXRlIF9maXJlKHNlc3Npb25Vcmk6IFVSSSwgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdGlmIChpc0NoYXRBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgY2hhdENoYW5uZWwgPSB0aGlzLl9zZXNzaW9ucy5nZXQoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb25VcmkpKT8uY2hhdENoYW5uZWw7XG5cdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ29kZXggc2Vzc2lvbiAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0gaGFzIG5vIGJvdW5kIGNoYXQgY2hhbm5lbGApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZSh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogY2hhdENoYW5uZWwsIGFjdGlvbiB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZSh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogc2Vzc2lvblVyaSwgYWN0aW9uIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlQ29ubmVjdGlvbigpO1xuXHRcdGZvciAoY29uc3QgcyBvZiB0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0cy5wZW5kaW5nQ29tbWFuZEFwcHJvdmFscy5kZW55QWxsKCdkZWNsaW5lJyk7XG5cdFx0XHRzLnBlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHMucGVuZGluZ1VzZXJJbnB1dHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRcdHMubWNwQ29udHJvbGxlcj8uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN1YmFnZW50IG9mIHRoaXMuX3N1YmFnZW50c0J5VGhyZWFkSWQudmFsdWVzKCkpIHtcblx0XHRcdHN1YmFnZW50LnNlc3Npb24ucGVuZGluZ0NvbW1hbmRBcHByb3ZhbHMuZGVueUFsbCgnZGVjbGluZScpO1xuXHRcdH1cblx0XHR0aGlzLl9zdWJhZ2VudHNCeVRocmVhZElkLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9zZXNzaW9uSWRCeVRocmVhZElkLmNsZWFyKCk7XG5cdFx0dGhpcy5fZmlsZUVkaXRPYnNlcnZlcnMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0dGhpcy5fbWNwSW52ZW50b3J5LmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHBhcnNlQmluYXJ5QXJncyhqc29uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdGlmICghanNvbikge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbik7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZC5maWx0ZXIoKHYpOiB2IGlzIHN0cmluZyA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycpIDogW107XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBbXTtcblx0fVxufVxuXG4vKipcbiAqIFRoZSBzdWZmaXggQ29kZXggdXNlcyBmb3IgaXRzIHBsYXRmb3JtIGBvcHRpb25hbERlcGVuZGVuY2llc2AgcGFja2FnZXNcbiAqIChgQG9wZW5haS9jb2RleC0ke3N1ZmZpeH1gKS4gQ29kZXgncyBMaW51eCBiaW5hcmllcyBhcmUgc3RhdGljYWxseVxuICogbXVzbC1saW5rZWQgYW5kIHNoaXAgdW5kZXIgdGhlIHNhbWUgYGxpbnV4LTxhcmNoPmAgcGFja2FnZSByZWdhcmRsZXNzIG9mXG4gKiBob3N0IGxpYmMsIHNvIHRoaXMgbmV2ZXIgcmV0dXJucyBhIGAtbXVzbGAgc3VmZml4LlxuICpcbiAqIFJldHVybnMgdW5kZWZpbmVkIGZvciB1bnN1cHBvcnRlZCBgKHBsYXRmb3JtLCBhcmNoKWAgY29tYmluYXRpb25zIFx1MjAxNCB0aGVcbiAqIGNhbGxlciBzdXJmYWNlcyB0aGUgZXJyb3IuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb2RleFBhY2thZ2VTdWZmaXgocGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybSwgYXJjaDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKChwbGF0Zm9ybSAhPT0gJ2xpbnV4JyAmJiBwbGF0Zm9ybSAhPT0gJ2RhcndpbicgJiYgcGxhdGZvcm0gIT09ICd3aW4zMicpIHx8XG5cdFx0KGFyY2ggIT09ICd4NjQnICYmIGFyY2ggIT09ICdhcm02NCcpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gYCR7cGxhdGZvcm19LSR7YXJjaH1gO1xufVxuXG4vKipcbiAqIE1pcnJvcnMgdGhlIHRyaXBsZSB0YWJsZSBpbnNpZGUgYEBvcGVuYWkvY29kZXgvYmluL2NvZGV4LmpzYCBzbyB3ZSBjYW4gc3Bhd25cbiAqIHRoZSBuYXRpdmUgYmluYXJ5IGF0IGB2ZW5kb3IvPHRyaXBsZT4vYmluL2NvZGV4YCBkaXJlY3RseSB3aXRob3V0IGdvaW5nXG4gKiB0aHJvdWdoIHRoZSBKUyBzaGltIGxhdW5jaGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29kZXhCaW5hcnlUcmlwbGUoc2RrVGFyZ2V0OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHNka1RhcmdldCkge1xuXHRcdGNhc2UgJ2xpbnV4LXg2NCc6IHJldHVybiAneDg2XzY0LXVua25vd24tbGludXgtbXVzbCc7XG5cdFx0Y2FzZSAnbGludXgtYXJtNjQnOiByZXR1cm4gJ2FhcmNoNjQtdW5rbm93bi1saW51eC1tdXNsJztcblx0XHRjYXNlICdkYXJ3aW4teDY0JzogcmV0dXJuICd4ODZfNjQtYXBwbGUtZGFyd2luJztcblx0XHRjYXNlICdkYXJ3aW4tYXJtNjQnOiByZXR1cm4gJ2FhcmNoNjQtYXBwbGUtZGFyd2luJztcblx0XHRjYXNlICd3aW4zMi14NjQnOiByZXR1cm4gJ3g4Nl82NC1wYy13aW5kb3dzLW1zdmMnO1xuXHRcdGNhc2UgJ3dpbjMyLWFybTY0JzogcmV0dXJuICdhYXJjaDY0LXBjLXdpbmRvd3MtbXN2Yyc7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFJlc29sdmUgdGhlIG9uLWRpc2sgZGlyZWN0b3J5IHRoYXQgaG9sZHMgYEBvcGVuYWkvY29kZXgtPHRhcmdldD5gIGZvciBhXG4gKiBnaXZlbiBTREsgcm9vdC4gUGFja2FnZWQgZGVza3RvcCBidWlsZHMgdW5wYWNrIG5hdGl2ZSBDb2RleCBiaW5hcmllcyBiZXNpZGVcbiAqIHRoZSBBU0FSIGFyY2hpdmUgdW5kZXIgYG5vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkYDsgZGV2IGNoZWNrb3V0cyBhbmQgdGhlXG4gKiBvbi1kZW1hbmQgU0RLIGNhY2hlIHVzZSBhIHBsYWluIGBub2RlX21vZHVsZXNgIHRyZWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQ29kZXhOb2RlTW9kdWxlc0Rpck5hbWUoc2RrUm9vdDogc3RyaW5nLCBjb2RleFRhcmdldDogc3RyaW5nLCB0cmlwbGU6IHN0cmluZywgYmluYXJ5TmFtZTogc3RyaW5nKTogJ25vZGVfbW9kdWxlcycgfCAnbm9kZV9tb2R1bGVzLmFzYXIudW5wYWNrZWQnIHtcblx0Y29uc3QgcGxhdGZvcm1QYWNrYWdlID0gYEBvcGVuYWkvY29kZXgtJHtjb2RleFRhcmdldH1gO1xuXHRjb25zdCByZWxhdGl2ZVRhaWwgPSBbcGxhdGZvcm1QYWNrYWdlLCAndmVuZG9yJywgdHJpcGxlLCAnYmluJywgYmluYXJ5TmFtZV07XG5cdGNvbnN0IHVucGFja2VkUGF0aCA9IGpvaW4oc2RrUm9vdCwgJ25vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkJywgLi4ucmVsYXRpdmVUYWlsKTtcblx0aWYgKGZzLmV4aXN0c1N5bmModW5wYWNrZWRQYXRoKSkge1xuXHRcdHJldHVybiAnbm9kZV9tb2R1bGVzLmFzYXIudW5wYWNrZWQnO1xuXHR9XG5cdHJldHVybiAnbm9kZV9tb2R1bGVzJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb2RleEJpbmFyeVBhdGgoc2RrUm9vdDogc3RyaW5nLCBjb2RleFRhcmdldDogc3RyaW5nLCB0cmlwbGU6IHN0cmluZywgYmluYXJ5TmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3Qgbm9kZU1vZHVsZXNEaXIgPSByZXNvbHZlQ29kZXhOb2RlTW9kdWxlc0Rpck5hbWUoc2RrUm9vdCwgY29kZXhUYXJnZXQsIHRyaXBsZSwgYmluYXJ5TmFtZSk7XG5cdHJldHVybiBqb2luKHNka1Jvb3QsIG5vZGVNb2R1bGVzRGlyLCBgQG9wZW5haS9jb2RleC0ke2NvZGV4VGFyZ2V0fWAsICd2ZW5kb3InLCB0cmlwbGUsICdiaW4nLCBiaW5hcnlOYW1lKTtcbn1cblxuLyoqXG4gKiBMb2NhdGUgdGhlIFNESyByb290IGZvciB0aGUgZGV2IChydW5uaW5nLWZyb20tc291cmNlKSBmYWxsYmFjayBieSByZXNvbHZpbmdcbiAqIGBAb3BlbmFpL2NvZGV4YCBcdTIwMTQgYSBkZXZEZXBlbmRlbmN5IGluIHNvdXJjZSBjaGVja291dHMgXHUyMDE0IG91dCBvZiB0aGlzIHJlcG8nc1xuICogYG5vZGVfbW9kdWxlc2AuIFJldHVybnMgdGhlIGRpcmVjdG9yeSB0aGF0ICpjb250YWlucyogdGhhdCBgbm9kZV9tb2R1bGVzYFxuICogKGkuZS4gdGhlIHZhbHVlIGBfc3RhcnRDb25uZWN0aW9uYCBqb2lucyBgbm9kZV9tb2R1bGVzL0BvcGVuYWkvY29kZXgtPHRhcmdldD5gXG4gKiBvbnRvKSwgb3IgdW5kZWZpbmVkIHdoZW4gdGhlIHBhY2thZ2UgY2FuJ3QgYmUgcmVzb2x2ZWQuIGBAb3BlbmFpL2NvZGV4YFxuICogaXMgYSBwcm9kdWN0aW9uIGRlcGVuZGVuY3ksIHNvIHRoaXMgYWxzbyB3b3JrcyBpbiBidWlsdCBwcm9kdWN0cyB0aGF0XG4gKiBzaGlwIHRoZSBwYWNrYWdlIHVuZGVyIGByZXNvdXJjZXMvYXBwL25vZGVfbW9kdWxlc2AuIGBAb3BlbmFpL2NvZGV4YFxuICogZGVjbGFyZXMgbm8gYGV4cG9ydHNgIG1hcCwgc28gaXRzIGBwYWNrYWdlLmpzb25gIGlzIHJlc29sdmFibGUuXG4gKlxuICogYHJlc29sdmVQYWNrYWdlSnNvblBhdGhgIGlzIGEgc2VhbSBmb3IgdGVzdHM7IHByb2R1Y3Rpb24gcmVzb2x2ZXMgdGhlIHBhdGhcbiAqIHZpYSB7QGxpbmsgZGVmYXVsdFJlc29sdmVDb2RleFBhY2thZ2VKc29uUGF0aH0uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlQ29kZXhEZXZTZGtSb290KFxuXHRyZXNvbHZlUGFja2FnZUpzb25QYXRoOiAoKSA9PiBzdHJpbmcgfCBQcm9taXNlPHN0cmluZz4gPSBkZWZhdWx0UmVzb2x2ZUNvZGV4UGFja2FnZUpzb25QYXRoLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0dHJ5IHtcblx0XHRjb25zdCBwa2dKc29uID0gYXdhaXQgcmVzb2x2ZVBhY2thZ2VKc29uUGF0aCgpO1xuXHRcdC8vIDxyb290Pi9ub2RlX21vZHVsZXMvQG9wZW5haS9jb2RleC9wYWNrYWdlLmpzb24gXHUyMTkyIDxyb290PlxuXHRcdHJldHVybiBkaXJuYW1lKGRpcm5hbWUoZGlybmFtZShkaXJuYW1lKHBrZ0pzb24pKSkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRlZmF1bHRSZXNvbHZlQ29kZXhQYWNrYWdlSnNvblBhdGgoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Ly8gRHluYW1pYyBpbXBvcnQgb2YgYG5vZGU6bW9kdWxlYCAobm90IGEgc3RhdGljIHRvcC1sZXZlbCBpbXBvcnQpOiB0aGVcblx0Ly8gdW5pdC10ZXN0IGVsZWN0cm9uIHJlbmRlcmVyIHRoYXQgbG9hZHMgdGhpcyBtb2R1bGUgZm9yXG5cdC8vIGBjb2RleFBhY2thZ2VQYXRocy50ZXN0YCBjYW5ub3QgZmV0Y2ggYSBzdGF0aWMgYG5vZGU6bW9kdWxlYCBpbXBvcnQsIHNvXG5cdC8vIHRoZSBzaWJsaW5nIFdTTC9TU0ggaG9zdCBzZXJ2aWNlcyByZXNvbHZlIGBjcmVhdGVSZXF1aXJlYCB0aGUgc2FtZSB3YXlcblx0Ly8gZm9yIHRoZSBzYW1lIHJlYXNvbi5cblx0Y29uc3QgeyBjcmVhdGVSZXF1aXJlIH0gPSBhd2FpdCBpbXBvcnQoJ25vZGU6bW9kdWxlJyk7XG5cdHJldHVybiBjcmVhdGVSZXF1aXJlKGltcG9ydC5tZXRhLnVybCkucmVzb2x2ZSgnQG9wZW5haS9jb2RleC9wYWNrYWdlLmpzb24nKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFrRDtBQUMzRCxZQUFZLFFBQVE7QUFDcEIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhLGFBQWE7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLHFCQUFxQjtBQUMxQyxTQUEyQix1QkFBdUI7QUFDbEQsU0FBUyxVQUFVLFNBQVMsWUFBWSxNQUFNLFdBQVcsU0FBUyxXQUFXO0FBQzdFLFNBQVMsNEJBQTRCLGVBQWU7QUFDcEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsY0FBYyxvQkFBb0IsdUJBQXVCLGdCQUFnQix5Q0FBeUMsb0NBQTRFO0FBQ3ZNLFNBQVMsOEJBQThCLDRCQUE0QjtBQUNuRSxTQUFTLHNDQUFzQyxrQ0FBa0M7QUFDakYsU0FBUyxvQkFBb0IsMENBQTBDO0FBQ3ZFLFNBQVMsd0JBQXdCLG1DQUFtQywwQ0FBa0U7QUFDdEksU0FBUyx3QkFBd0IsOEJBQThCLDZCQUE2Qiw4QkFBOEIsZ0NBQWdDLDBCQUEwQiw0QkFBNEIseUJBQXlCLCtCQUF1RjtBQUNoVSxTQUFTLGtDQUFrQyxvQ0FBb0M7QUFDL0UsU0FBUywyQkFBMkIsb0JB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
