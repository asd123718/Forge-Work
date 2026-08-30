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
import { coalesce } from "../../../../base/common/arrays.js";
import { Schemas } from "../../../../base/common/network.js";
import { isObject, isStringArray } from "../../../../base/common/types.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agent.js";
import { getByokLmSelectionModelId } from "../../common/agentHostByokLm.js";
import { AgentHostSessionSyncEnabledConfigKey, platformRootSchema } from "../../common/agentHostSchema.js";
import { CopilotCliConfigKey, copilotCliConfigSchema, normalizeModelFamilyAlias, normalizeToolSearchDeferThreshold, resolveModelCapabilityOverrideField } from "../../common/copilotCliConfig.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { reasoningEffortLevels } from "../../common/reasoningEffort.js";
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from "../../common/sandboxConfigSchema.js";
import { RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../common/toolSearchConstants.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostManagedSettingsService } from "../agentHostManagedSettingsService.js";
import { IAgentHostTerminalManager } from "../agentHostTerminalManager.js";
import { IByokLmBridgeRegistry } from "../byokLmBridgeRegistry.js";
import { IByokLmProxyService } from "./byokLmProxyService.js";
import { toSdkHooks, toSdkInstructionDirectories, toSdkMcpServers, toSdkMcpServersFromConfigMap, toSdkSessionCustomAgents, toSdkSkillDirectories } from "./copilotPluginConverters.js";
import { CopilotSessionWrapper } from "./copilotSessionWrapper.js";
import { createShellTools } from "./copilotShellTools.js";
import { isGpt56Model } from "./modelIdentifiers.js";
import "./prompts/allPrompts.js";
import { agentHostPromptRegistry } from "./prompts/promptRegistry.js";
import { describeSystemMessageConfig } from "./prompts/systemMessage.js";
import { buildSandboxConfigForSdk } from "./sandboxConfigForSdk.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, agentHostModelSupportsToolSearch } from "./toolSearchDeferral.js";
const ThinkingLevelConfigKey = "thinkingLevel";
const ContextSizeConfigKey = "contextSize";
const ContextTierConfigKey = "contextTier";
const ReasoningEfforts = reasoningEffortLevels;
function disabledMcpServersSessionOption(plugins, disabledRootMcpServers) {
  const disabledMcpServers = [.../* @__PURE__ */ new Set([
    ...plugins.flatMap((plugin) => plugin.disabledMcpServers ?? []),
    ...disabledRootMcpServers ?? []
  ])];
  return disabledMcpServers.length > 0 ? { disabledMcpServers } : {};
}
function toSdkReasoningEffort(effort) {
  return effort;
}
const ContextTiers = ["default", "long_context"];
const AGENT_HOST_COPILOT_CLIENT_NAME = "vscode-agent-host";
function clientToolNamesFromSnapshot(snapshot) {
  return new Set(snapshot.tools.map((tool) => tool.name));
}
function filterClientToolNames(names, availableTools, excludedTools) {
  if (!availableTools && !excludedTools) {
    return names;
  }
  const matches = (patterns, name) => {
    const sdkName = toSdkClientToolName(name);
    return patterns.some(
      (pattern) => pattern === name || pattern === sdkName || pattern === `custom:${name}` || pattern === `custom:${sdkName}` || pattern === "custom:*"
    );
  };
  const result = /* @__PURE__ */ new Set();
  for (const name of names) {
    const allowed = !availableTools || matches(availableTools, name);
    if (allowed && !(excludedTools && matches(excludedTools, name))) {
      result.add(name);
    }
  }
  return result;
}
function toSdkClientToolName(name) {
  return name === CLIENT_TOOL_SEARCH_REFERENCE_NAME ? RUNTIME_TOOL_SEARCH_TOOL_NAME : name;
}
function toSdkToolFilterPatterns(patterns) {
  if (!patterns) {
    return void 0;
  }
  return [...new Set(patterns.map((pattern) => {
    if (pattern === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
      return toSdkClientToolName(pattern);
    }
    if (pattern === `custom:${CLIENT_TOOL_SEARCH_REFERENCE_NAME}`) {
      return `custom:${toSdkClientToolName(CLIENT_TOOL_SEARCH_REFERENCE_NAME)}`;
    }
    return pattern;
  }))];
}
function isCopilotReasoningEffort(value) {
  return ReasoningEfforts.some((reasoningEffort) => reasoningEffort === value);
}
function isContextTier(value) {
  return ContextTiers.some((contextTier) => contextTier === value);
}
function getCopilotSdkErrorCode(err) {
  if (typeof err !== "object" || err === null) {
    return void 0;
  }
  const code = Object.getOwnPropertyDescriptor(err, "code")?.value;
  return typeof code === "number" ? code : void 0;
}
function getErrorMessage(err) {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "object" && err !== null) {
    const message = Object.getOwnPropertyDescriptor(err, "message")?.value;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(err);
}
const RESUMABLE_HISTORY_ABSENT_PATTERNS = [
  /\bSession not found\b/i,
  /\bno events\b/i,
  /\bempty session\b/i
];
function shouldCreateEmptySessionAfterResumeError(err) {
  if (getCopilotSdkErrorCode(err) !== -32603) {
    return false;
  }
  const message = getErrorMessage(err);
  return RESUMABLE_HISTORY_ABSENT_PATTERNS.some((pattern) => pattern.test(message));
}
function isCustomAgentNotFoundError(err) {
  return getCopilotSdkErrorCode(err) === -32603 && /\bCustom agent '.+' not found\b/i.test(getErrorMessage(err));
}
function getCopilotReasoningEffort(model, effortOverride) {
  if (isCopilotReasoningEffort(effortOverride)) {
    return toSdkReasoningEffort(effortOverride);
  }
  const thinkingLevel = model?.config?.[ThinkingLevelConfigKey];
  return isCopilotReasoningEffort(thinkingLevel) ? toSdkReasoningEffort(thinkingLevel) : void 0;
}
function describeModelId(model) {
  return model?.id ?? "(no model)";
}
function resolveConfiguredReasoningEffortOverride(model, configurationService, logService, sessionId) {
  const overrides = configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides);
  const effort = resolveModelCapabilityOverrideField(overrides, model?.id, "reasoningEffort", isCopilotReasoningEffort, (value) => {
    logService.warn(`[Copilot:${sessionId}] Ignoring invalid reasoning-effort override '${value}' for '${describeModelId(model)}'; expected one of [${ReasoningEfforts.join(", ")}]`);
  });
  if (effort !== void 0) {
    logService.info(`[Copilot:${sessionId}] Applying reasoning-effort override '${effort}' for '${describeModelId(model)}'`);
    return toSdkReasoningEffort(effort);
  }
  return void 0;
}
function resolveCopilotReasoningEffort(model, configurationService, logService, sessionId) {
  return resolveConfiguredReasoningEffortOverride(model, configurationService, logService, sessionId) ?? getCopilotReasoningEffort(model);
}
function getModelCapabilitiesOverride(value, modelId, logService, sessionId) {
  if (value === void 0) {
    return void 0;
  }
  logService.info(`[Copilot:${sessionId}] Applying 'modelCapabilities' capability override for '${modelId}'`);
  return value;
}
const TOOL_FILTER_SOURCE_WILDCARDS = ["builtin:*", "mcp:*", "custom:*"];
function normalizeToolFilterPatterns(value) {
  const list = typeof value === "string" ? [value] : value;
  if (!isStringArray(list)) {
    return void 0;
  }
  return [...new Set(list.flatMap((pattern) => pattern === "*" ? TOOL_FILTER_SOURCE_WILDCARDS : [pattern]))];
}
function getToolFilterOverride(value, field, modelId, logService, sessionId) {
  const patterns = value !== void 0 ? normalizeToolFilterPatterns(value) : void 0;
  if (patterns !== void 0) {
    logService.info(`[Copilot:${sessionId}] Applying '${field}' capability override for '${modelId}': ${patterns.join(", ")}`);
  }
  return patterns;
}
function getCopilotContextTier(model, longContextWindow, freeLongContext) {
  const legacyTier = model?.config?.[ContextTierConfigKey];
  if (isContextTier(legacyTier)) {
    return legacyTier;
  }
  const contextSize = model?.config?.[ContextSizeConfigKey];
  if (contextSize === void 0) {
    return freeLongContext ? "long_context" : void 0;
  }
  const selectedWindow = Number(contextSize);
  if (!Number.isFinite(selectedWindow) || typeof longContextWindow !== "number") {
    return void 0;
  }
  return selectedWindow >= longContextWindow ? "long_context" : "default";
}
async function resolveByokSessionConfig(sessionId, bridgeRegistry, startProxy, logService) {
  let byokModels;
  try {
    byokModels = [...bridgeRegistry.getModels()];
  } catch (err) {
    logService.warn(`[Copilot:${sessionId}] Failed to enumerate BYOK models from renderer bridges`, err);
    return {};
  }
  if (byokModels.length === 0) {
    return {};
  }
  const seenSelectionIds = /* @__PURE__ */ new Set();
  byokModels = byokModels.filter((m) => {
    const selectionId = `${m.vendor}/${getByokLmSelectionModelId(m)}`;
    if (seenSelectionIds.has(selectionId)) {
      return false;
    }
    seenSelectionIds.add(selectionId);
    return true;
  });
  let handle;
  try {
    handle = await startProxy();
  } catch (err) {
    logService.warn(`[Copilot:${sessionId}] Failed to start BYOK loopback proxy`, err);
    return {};
  }
  const providers = [...new Set(byokModels.map((m) => m.vendor))].map((vendor) => ({
    name: vendor,
    type: "openai",
    wireApi: "responses",
    baseUrl: handle.providerBaseUrl(vendor),
    bearerToken: `${handle.nonce}.${sessionId}`
  }));
  const models = byokModels.map((m) => ({
    id: getByokLmSelectionModelId(m),
    provider: m.vendor,
    ...m.name !== void 0 ? { name: m.name } : {},
    ...m.maxContextWindowTokens !== void 0 ? { maxContextWindowTokens: m.maxContextWindowTokens } : {}
  }));
  logService.info(`[Copilot:${sessionId}] Wired ${models.length} BYOK model(s) across ${providers.length} provider(s) via loopback proxy ${handle.baseUrl}`);
  return { providers, models };
}
let CopilotSessionLauncher = class {
  constructor(_configurationService, _managedSettingsService, _terminalManager, _logService, _fileService, _byokLmProxyService, _byokLmBridgeRegistry, _otelService) {
    this._configurationService = _configurationService;
    this._managedSettingsService = _managedSettingsService;
    this._terminalManager = _terminalManager;
    this._logService = _logService;
    this._fileService = _fileService;
    this._byokLmProxyService = _byokLmProxyService;
    this._byokLmBridgeRegistry = _byokLmBridgeRegistry;
    this._otelService = _otelService;
  }
  async launch(plan, runtime) {
    const config = await this._buildSessionConfig(plan, runtime);
    const sandboxConfig = this._computeSandboxConfig();
    if (plan.kind === "create") {
      return this._createSession(plan, config, sandboxConfig);
    }
    let fallbackPlan = plan;
    let fallbackConfig = config;
    try {
      const stopWatch = new StopWatch();
      this._logService.trace(`[Copilot:${plan.sessionId}] Calling SDK resumeSession...`);
      const raw = await this._withTraceContext(plan.sessionId, () => plan.client.resumeSession(plan.sessionId, config));
      this._logService.trace(`[Copilot:${plan.sessionId}] SDK resumeSession succeeded after ${stopWatch.elapsed()}ms`);
      return this._finalizeSession(raw, sandboxConfig, plan.sessionId, plan.fallback.model?.id);
    } catch (err) {
      let resumeError = err;
      const errCode = getCopilotSdkErrorCode(resumeError);
      const errMsg = getErrorMessage(resumeError);
      this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession failed: code=${errCode}, message=${errMsg}`);
      if (plan.resolvedAgentName && isCustomAgentNotFoundError(resumeError)) {
        fallbackPlan = { ...plan, resolvedAgentName: void 0 };
        fallbackConfig = { ...config, agent: void 0 };
        this._logService.warn(`[Copilot:${plan.sessionId}] Stored custom agent '${plan.resolvedAgentName}' was not found; retrying resume without a custom agent`);
        try {
          const raw = await this._withTraceContext(fallbackPlan.sessionId, () => fallbackPlan.client.resumeSession(fallbackPlan.sessionId, fallbackConfig));
          return this._finalizeSession(raw, sandboxConfig, plan.sessionId, fallbackPlan.fallback.model?.id);
        } catch (retryErr) {
          resumeError = retryErr;
          this._logService.warn(`[Copilot:${plan.sessionId}] SDK resumeSession without custom agent failed: code=${getCopilotSdkErrorCode(retryErr)}, message=${getErrorMessage(retryErr)}`);
        }
      }
      if (!shouldCreateEmptySessionAfterResumeError(resumeError)) {
        this._logService.warn(`[Copilot:${plan.sessionId}] Resume failure does not indicate an empty session; surfacing it instead of replacing the session with an empty one`);
        throw resumeError;
      }
      this._logService.warn(`[Copilot:${plan.sessionId}] Resume reported no session history; falling back to createSession with same ID`);
      const wrapper = await this._createSession({
        ...fallbackPlan,
        kind: "create",
        model: fallbackPlan.fallback.model,
        longContextWindow: fallbackPlan.fallback.longContextWindow,
        freeLongContext: fallbackPlan.fallback.freeLongContext
      }, fallbackConfig, sandboxConfig);
      this._logService.info(`[Copilot:${plan.sessionId}] Fallback createSession succeeded`);
      return wrapper;
    }
  }
  _withTraceContext(sessionId, fn) {
    const sessionUri = AgentSession.uri("copilotcli", sessionId).toString();
    return this._otelService.withTraceContext(this._otelService.getSessionTraceContext(sessionId, sessionUri), fn);
  }
  async _createSession(plan, config, sandboxConfig) {
    const raw = await this._withTraceContext(plan.sessionId, () => plan.client.createSession({
      ...config,
      sessionId: plan.sessionId,
      streaming: true,
      model: plan.model?.id,
      reasoningEffort: resolveCopilotReasoningEffort(plan.model, this._configurationService, this._logService, plan.sessionId),
      contextTier: getCopilotContextTier(plan.model, plan.longContextWindow, plan.freeLongContext),
      ...plan.resolvedAgentName ? { agent: plan.resolvedAgentName } : {},
      workingDirectory: plan.workingDirectory?.fsPath
    }));
    return this._finalizeSession(raw, sandboxConfig, plan.sessionId, plan.model?.id);
  }
  async _finalizeSession(raw, sandboxConfig, sessionId, modelId) {
    await this._applySandboxConfig(raw, sandboxConfig, sessionId);
    if (isGpt56Model(modelId)) {
      await this._applyGpt56Customizations(raw, sessionId);
    }
    return new CopilotSessionWrapper(raw);
  }
  /** Applies the post-launch session options used by GPT-5.6 models. */
  async _applyGpt56Customizations(session, sessionId) {
    await this._applyVerbosity(session, "medium", sessionId);
    const reasoningSummaryEnabled = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ReasoningSummary) === true;
    if (reasoningSummaryEnabled) {
      await this._applyReasoningSummary(session, "concise", sessionId);
    }
  }
  /** Sets output verbosity after session creation. */
  async _applyVerbosity(session, verbosity, sessionId) {
    try {
      await session.rpc.options.update({ verbosity });
      this._logService.info(`[Copilot:${sessionId}] Applied '${verbosity}' verbosity`);
    } catch (err) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to apply '${verbosity}' verbosity`, err);
    }
  }
  /** Sets reasoning summary detail after session creation. */
  async _applyReasoningSummary(session, reasoningSummary, sessionId) {
    try {
      await session.rpc.options.update({ reasoningSummary });
      this._logService.info(`[Copilot:${sessionId}] Applied '${reasoningSummary}' reasoning summary`);
    } catch (err) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to apply '${reasoningSummary}' reasoning summary`, err);
    }
  }
  /**
   * Compute the SDK-shaped sandbox policy to push to the runtime for the
   * SDK's built-in shell tool.
   *
   * Returns `undefined` when {@link CopilotCliConfigKey.EnableCustomTerminalTool}
   * is ON — in that case the AgentHost provides its own shell tools, which
   * wrap commands via the host terminal sandbox engine, so no SDK-side
   * sandbox policy is needed. Otherwise the policy is derived from the
   * host's `sandbox` config bag (forwarded from the workbench's
   * `chat.agent.sandbox.*` settings), mirroring what
   * `buildSandboxConfigForCLI` does for the Copilot extension's CLI path.
   */
  _computeSandboxConfig() {
    const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
    if (enableCustomTerminalTool) {
      return void 0;
    }
    return buildSandboxConfigForSdk(process.platform, this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox));
  }
  /**
   * Forward the SDK-shaped sandbox policy to the runtime via
   * `session.options.update`, immediately after the session is created or
   * resumed.
   *
   * No-op when {@link _computeSandboxConfig} returned `undefined` (custom
   * terminal tool enabled, or the host sandbox config evaluates to disabled).
   */
  async _applySandboxConfig(session, sandboxConfig, sessionId) {
    if (!sandboxConfig) {
      return;
    }
    try {
      await session.rpc.options.update({ sandboxConfig });
      this._logService.info(`[Copilot:${sessionId}] Applied SDK sandboxConfig via session.options.update`);
    } catch (err) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to apply SDK sandboxConfig`, err);
    }
  }
  /**
   * Launcher-bound wrapper over {@link resolveByokSessionConfig}: supplies the
   * active bridge registry and a `startProxy` thunk that memoizes the single
   * shared proxy handle for this launcher (started lazily on first use).
   */
  _resolveByokSessionConfig(sessionId) {
    return resolveByokSessionConfig(sessionId, this._byokLmBridgeRegistry, () => {
      if (!this._byokProxyHandle) {
        this._byokProxyHandle = this._byokLmProxyService.start();
      }
      return this._byokProxyHandle;
    }, this._logService);
  }
  /**
   * Release the memoized BYOK loopback proxy handle (if any) and clear it so
   * the next session launch mints a fresh nonce. Idempotent.
   *
   * **Ownership invariant.** The caller MUST stop the Copilot client/runtime
   * subprocess before invoking this: disposing the handle drops the proxy's
   * refcount and may rebind it on a different port/nonce, so a still-running
   * subprocess would silently lose its endpoint — see {@link IByokLmProxyHandle}.
   * Invoked from `CopilotAgent._stopClient` / `CopilotAgent.shutdown` after the
   * client has stopped.
   */
  async disposeByokProxyHandle() {
    const handle = this._byokProxyHandle;
    this._byokProxyHandle = void 0;
    if (!handle) {
      return;
    }
    try {
      (await handle).dispose();
    } catch {
    }
  }
  async _buildSessionConfig(plan, runtime) {
    const plugins = plan.snapshot.plugins;
    const byok = await this._resolveByokSessionConfig(plan.sessionId);
    const enableCustomTerminalTool = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
    let shellTools = [];
    if (enableCustomTerminalTool) {
      if (!plan.shellManager) {
        throw new Error(`ShellManager is required to launch Copilot session '${plan.sessionId}'`);
      }
      shellTools = await createShellTools(plan.shellManager, this._terminalManager, this._logService, (request) => runtime.requestUnsandboxedCommandConfirmation(request));
    }
    const pluginsWithoutDirs = plugins.filter((p) => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
    const mcpServers = pluginsWithoutDirs.flatMap((plugin) => plugin.mcpServers.filter((server) => !plugin.disabledMcpServers?.includes(server.name)));
    const customAgents = await toSdkSessionCustomAgents(plugins, plan.resolvedAgentName, this._fileService);
    const skillDirectories = toSdkSkillDirectories(pluginsWithoutDirs.flatMap((p) => p.skills));
    const instructionDirectories = toSdkInstructionDirectories(plugins.flatMap((p) => p.instructions));
    const model = plan.kind === "create" ? plan.model : plan.fallback.model;
    const capabilityOverrides = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ModelCapabilityOverrides);
    const modelId = describeModelId(model);
    const modelFamily = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, "family", (value) => normalizeModelFamilyAlias(value) !== void 0, (value) => {
      const description = typeof value === "string" ? JSON.stringify(value.slice(0, 40)) : typeof value;
      this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring invalid 'family' capability override ${description} for '${modelId}'; expected a model id of at most 128 characters`);
    });
    const availableToolsOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, "availableTools", (value) => normalizeToolFilterPatterns(value) !== void 0, () => {
      this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring unusable 'availableTools' capability override for '${modelId}'; expected an array of tool patterns`);
    });
    const excludedToolsOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, "excludedTools", (value) => normalizeToolFilterPatterns(value) !== void 0, () => {
      this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring unusable 'excludedTools' capability override for '${modelId}'; expected an array of tool patterns`);
    });
    const availableTools = getToolFilterOverride(availableToolsOverride, "availableTools", modelId, this._logService, plan.sessionId);
    const excludedTools = getToolFilterOverride(excludedToolsOverride, "excludedTools", modelId, this._logService, plan.sessionId);
    const sdkAvailableTools = toSdkToolFilterPatterns(availableTools);
    const sdkExcludedTools = toSdkToolFilterPatterns(excludedTools);
    const modelCapabilitiesOverride = resolveModelCapabilityOverrideField(capabilityOverrides, model?.id, "modelCapabilities", (value) => isObject(value), () => {
      this._logService.warn(`[Copilot:${plan.sessionId}] Ignoring invalid 'modelCapabilities' capability override for '${modelId}'; expected an object`);
    });
    const modelCapabilities = getModelCapabilitiesOverride(modelCapabilitiesOverride, modelId, this._logService, plan.sessionId);
    const clientToolNames = filterClientToolNames(clientToolNamesFromSnapshot(plan.snapshot), availableTools, excludedTools);
    const effectiveModel = modelFamily ? { ...model, id: modelFamily } : model;
    if (modelFamily) {
      this._logService.info(`[Copilot:${plan.sessionId}] Model capability override: routing prompt for '${describeModelId(model)}' as family '${modelFamily}'`);
    }
    const toolSearchActive = this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchEnabled) === true && agentHostModelSupportsToolSearch(effectiveModel?.id) && clientToolNames.has(CLIENT_TOOL_SEARCH_REFERENCE_NAME);
    const toolSearchDeferThreshold = normalizeToolSearchDeferThreshold(this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.ToolSearchDeferThreshold));
    const managedSettingsPermissions = this._managedSettingsService.permissions;
    const promptContext = {
      getSetting: (key) => this._configurationService.getRootValue(copilotCliConfigSchema, key),
      hasClientTool: (name) => clientToolNames.has(name),
      workspaceless: plan.workspaceless === true,
      toolSearchActive
    };
    const additionalDirectories = plan.additionalDirectories?.map((d) => d.fsPath);
    const systemMessage = agentHostPromptRegistry.resolveSystemMessageConfig(effectiveModel, promptContext);
    this._logService.info(`[Copilot:${plan.sessionId}] Resolved system message: ${describeSystemMessageConfig(systemMessage)}`);
    if (this._logService.getLevel() <= LogLevel.Trace) {
      this._logService.trace(`[Copilot:${plan.sessionId}] System message config: ${JSON.stringify(systemMessage, (_key, value) => typeof value === "function" ? "[transform fn]" : value)}`);
    }
    return {
      ...byok,
      ...disabledMcpServersSessionOption(plugins, plan.disabledRootMcpServers),
      clientName: AGENT_HOST_COPILOT_CLIENT_NAME,
      // Resume only: `_createSession` re-resolves the full effort for a create,
      // while a resumed session keeps the effort the runtime journaled unless
      // an override is configured.
      ...plan.kind === "resume" ? { reasoningEffort: resolveConfiguredReasoningEffortOverride(model, this._configurationService, this._logService, plan.sessionId) } : {},
      modelCapabilities,
      enableMcpApps: true,
      githubMcpToolConfig: { disableFormDeferral: true },
      enableFileHooks: true,
      enableConfigDiscovery: true,
      requestExtensions: false,
      // force-disable copilot extension management tools (otherwise enabled in experimental mode)
      onPermissionRequest: (request) => runtime.handlePermissionRequest(request),
      onUserInputRequest: (request, invocation) => runtime.handleUserInputRequest(request, invocation),
      onElicitationRequest: (context) => runtime.handleElicitationRequest(context),
      onMcpAuthRequest: (request, context) => runtime.handleMcpAuthRequest(request, context),
      hooks: toSdkHooks(pluginsWithoutDirs.flatMap((p) => p.hooks), {
        onPreToolUse: (input) => runtime.handlePreToolUse(input),
        onPostToolUse: (input) => runtime.handlePostToolUse(input),
        onUserPromptSubmitted: () => runtime.handleUserPromptSubmitted()
      }),
      mcpServers: { ...toSdkMcpServersFromConfigMap(plan.snapshot.mcpServers), ...toSdkMcpServers(mcpServers) },
      onExitPlanModeRequest: (request, invocation) => runtime.handleExitPlanModeRequest(request, invocation),
      workingDirectory: plan.workingDirectory?.fsPath,
      customAgents,
      agent: plan.resolvedAgentName,
      skillDirectories,
      instructionDirectories,
      additionalDirectories,
      systemMessage,
      toolSearch: toolSearchActive ? { enabled: true, deferThreshold: toolSearchDeferThreshold } : { enabled: false },
      largeOutput: {
        maxSizeBytes: 8 * 1024
      },
      managedSettings: {
        permissions: managedSettingsPermissions
      },
      availableTools: sdkAvailableTools,
      excludedTools: sdkExcludedTools,
      pluginDirectories: coalesce(plugins.map((p) => p.pluginDir)).filter((d) => d.scheme === Schemas.file).map((d) => d.fsPath),
      tools: [...shellTools, ...runtime.createClientSdkTools(toolSearchActive), ...runtime.createServerSdkTools()],
      // Pass the GitHub token at the session level. The SDK's
      // client-level `gitHubToken` authenticates the CLI process,
      // but each session also needs its own token resolved into a
      // GitHub identity (login, Copilot plan, endpoints) to drive
      // model routing and quota — without this the session
      // errors with "Session was not created with authentication
      // info or custom provider" on first send. See #318693.
      gitHubToken: plan.githubToken,
      // Enable infinite sessions so the SDK provisions a workspace
      // directory (containing `plan.md`, `checkpoints/`, `files/`).
      // The workspace is required for plan mode to work — without
      // it, `rpc.plan.read()` returns `path: null` and the SDK
      // never emits `exit_plan_mode.requested`.
      infiniteSessions: { enabled: true },
      // Per-session remote export: the client-level `--remote` flag
      // (enableRemoteSessions) enables the CLI capability, but each
      // session must opt in via `remoteSession` to actually export
      // events. Without this, sessions default to "off".
      remoteSession: this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true ? "export" : void 0,
      enableManagedSettings: true
    };
  }
};
CopilotSessionLauncher = __decorateClass([
  __decorateParam(0, IAgentConfigurationService),
  __decorateParam(1, IAgentHostManagedSettingsService),
  __decorateParam(2, IAgentHostTerminalManager),
  __decorateParam(3, ILogService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IByokLmProxyService),
  __decorateParam(6, IByokLmBridgeRegistry),
  __decorateParam(7, IAgentHostOTelService)
], CopilotSessionLauncher);
export {
  ContextSizeConfigKey,
  ContextTierConfigKey,
  CopilotSessionLauncher,
  ThinkingLevelConfigKey,
  clientToolNamesFromSnapshot,
  filterClientToolNames,
  getCopilotContextTier,
  getCopilotReasoningEffort,
  isCopilotReasoningEffort,
  normalizeToolFilterPatterns,
  resolveByokSessionConfig,
  resolveConfiguredReasoningEffortOverride,
  resolveCopilotReasoningEffort,
  toSdkReasoningEffort,
  toSdkToolFilterPatterns
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90U2Vzc2lvbkxhdW5jaGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDb250ZXh0VGllciwgQ29waWxvdENsaWVudCwgRWxpY2l0YXRpb25Db250ZXh0LCBFbGljaXRhdGlvblJlc3VsdCwgRXhpdFBsYW5Nb2RlUmVxdWVzdCwgRXhpdFBsYW5Nb2RlUmVzdWx0LCBNb2RlbENhcGFiaWxpdGllc092ZXJyaWRlLCBOYW1lZFByb3ZpZGVyQ29uZmlnLCBQZXJtaXNzaW9uUmVxdWVzdCwgUGVybWlzc2lvblJlcXVlc3RSZXN1bHQsIFByb3ZpZGVyTW9kZWxDb25maWcsIFJlYXNvbmluZ1N1bW1hcnksIFJlc3VtZVNlc3Npb25Db25maWcsIFNlc3Npb25Db25maWcsIFNlc3Npb25Ib29rcywgVG9vbCwgVmVyYm9zaXR5IH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNTdHJpbmdBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBnZXRCeW9rTG1TZWxlY3Rpb25Nb2RlbElkLCB0eXBlIElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25TeW5jRW5hYmxlZENvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCB0eXBlIEFnZW50SG9zdE1jcFNlcnZlcnMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IENvcGlsb3RDbGlDb25maWdLZXksIGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIG5vcm1hbGl6ZU1vZGVsRmFtaWx5QWxpYXMsIG5vcm1hbGl6ZVRvb2xTZWFyY2hEZWZlclRocmVzaG9sZCwgcmVzb2x2ZU1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlRmllbGQgfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWFzb25pbmdFZmZvcnRMZXZlbHMsIHR5cGUgUmVhc29uaW5nRWZmb3J0TGV2ZWwgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNhbmRib3hDb25maWdLZXksIHNhbmRib3hDb25maWdTY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vc2FuZGJveENvbmZpZ1NjaGVtYS5qcyc7XG5pbXBvcnQgdHlwZSB7IE1vZGVsU2VsZWN0aW9uLCBUb29sRGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29sU2VhcmNoQ29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgQWN0aXZlQ2xpZW50VG9vbFNldCB9IGZyb20gJy4uL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4uL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQnlva0xtQnJpZGdlUmVnaXN0cnkgfSBmcm9tICcuLi9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQnlva0xtUHJveHlTZXJ2aWNlLCB0eXBlIElCeW9rTG1Qcm94eUhhbmRsZSB9IGZyb20gJy4vYnlva0xtUHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvcGlsb3RQbHVnaW5JbmZvIH0gZnJvbSAnLi9jb3BpbG90QWdlbnQuanMnO1xuaW1wb3J0IHsgdG9TZGtIb29rcywgdG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzLCB0b1Nka01jcFNlcnZlcnMsIHRvU2RrTWNwU2VydmVyc0Zyb21Db25maWdNYXAsIHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cywgdG9TZGtTa2lsbERpcmVjdG9yaWVzIH0gZnJvbSAnLi9jb3BpbG90UGx1Z2luQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2Vzc2lvbldyYXBwZXIgfSBmcm9tICcuL2NvcGlsb3RTZXNzaW9uV3JhcHBlci5qcyc7XG5pbXBvcnQgeyBTaGVsbE1hbmFnZXIsIGNyZWF0ZVNoZWxsVG9vbHMsIHR5cGUgSVVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvblJlcXVlc3QgfSBmcm9tICcuL2NvcGlsb3RTaGVsbFRvb2xzLmpzJztcbmltcG9ydCB7IGlzR3B0NTZNb2RlbCB9IGZyb20gJy4vbW9kZWxJZGVudGlmaWVycy5qcyc7XG5pbXBvcnQgJy4vcHJvbXB0cy9hbGxQcm9tcHRzLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdFByb21wdFJlZ2lzdHJ5LCB0eXBlIElBZ2VudEhvc3RQcm9tcHRDb250ZXh0IH0gZnJvbSAnLi9wcm9tcHRzL3Byb21wdFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGRlc2NyaWJlU3lzdGVtTWVzc2FnZUNvbmZpZyB9IGZyb20gJy4vcHJvbXB0cy9zeXN0ZW1NZXNzYWdlLmpzJztcbmltcG9ydCB7IGJ1aWxkU2FuZGJveENvbmZpZ0ZvclNkaywgdHlwZSBDb3BpbG90U2FuZGJveENvbmZpZyB9IGZyb20gJy4vc2FuZGJveENvbmZpZ0ZvclNkay5qcyc7XG5pbXBvcnQgeyBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUsIGFnZW50SG9zdE1vZGVsU3VwcG9ydHNUb29sU2VhcmNoIH0gZnJvbSAnLi90b29sU2VhcmNoRGVmZXJyYWwuanMnO1xuXG5leHBvcnQgY29uc3QgVGhpbmtpbmdMZXZlbENvbmZpZ0tleSA9ICd0aGlua2luZ0xldmVsJztcbi8qKlxuICogQ29uZmlnIGtleSBmb3IgdGhlIG51bWVyaWMgXCJDb250ZXh0IFNpemVcIiBzZWxlY3Rpb24gKGEgY29udGV4dC13aW5kb3cgdG9rZW4gY291bnQpLiBNYXBwZWQgdG8gdGhlXG4gKiBTREsncyB0d28tdmFsdWVkIHtAbGluayBTZXNzaW9uQ29uZmlnLmNvbnRleHRUaWVyfSBieSB7QGxpbmsgZ2V0Q29waWxvdENvbnRleHRUaWVyfS5cbiAqL1xuZXhwb3J0IGNvbnN0IENvbnRleHRTaXplQ29uZmlnS2V5ID0gJ2NvbnRleHRTaXplJztcbi8qKlxuICogQGRlcHJlY2F0ZWQgTGVnYWN5IGNvbmZpZyBrZXkgdGhhdCBzdG9yZWQgdGhlIHJlc29sdmVkIHRpZXIgc3RyaW5nIChgJ2RlZmF1bHQnYCAvIGAnbG9uZ19jb250ZXh0J2ApXG4gKiBkaXJlY3RseS4gUmVwbGFjZWQgYnkgdGhlIG51bWVyaWMge0BsaW5rIENvbnRleHRTaXplQ29uZmlnS2V5fTsgc3RpbGwgcmVhZCBmcm9tIHBlcnNpc3RlZCBzZXNzaW9uc1xuICogZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuXG4gKi9cbmV4cG9ydCBjb25zdCBDb250ZXh0VGllckNvbmZpZ0tleSA9ICdjb250ZXh0VGllcic7XG5cbi8qKlxuICogRXZlcnkgcmVhc29uaW5nLWVmZm9ydCB0aWVyIHRoYXQgdGhlIHJ1bnRpbWUgbWF5IGFkdmVydGlzZSB2aWEgYSBtb2RlbCdzXG4gKiBgc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0c2AuIFRoaXMgaXMgaW50ZW50aW9uYWxseSBicm9hZGVyIHRoYW4gdGhlIFNESydzXG4gKiBgU2Vzc2lvbkNvbmZpZ1sncmVhc29uaW5nRWZmb3J0J11gIHVuaW9uLCB3aGljaCBsYWdzIGJlaGluZCBuZXdseS1pbnRyb2R1Y2VkXG4gKiB0aWVycyBzdWNoIGFzIGAnbWF4J2A7IHZhbHVlcyBhcmUgcGFzc2VkIHRocm91Z2ggdG8gdGhlIHJ1bnRpbWUgYXMtaXMuXG4gKlxuICogQWxpYXNlZCBmcm9tIHRoZSBjYW5vbmljYWwgbGlzdCByYXRoZXIgdGhhbiByZS1kZWNsYXJlZDogYSBwcml2YXRlIGNvcHkgdGhhdFxuICogbWlzc2VzIGEgdGllciBzaWxlbnRseSBkcm9wcyBpdCBmcm9tIHRoZSBtb2RlbCBwaWNrZXIsIHdoaWNoIGlzIGV4YWN0bHkgaG93XG4gKiBgJ21heCdgIHdlbnQgbWlzc2luZy5cbiAqL1xuY29uc3QgUmVhc29uaW5nRWZmb3J0cyA9IHJlYXNvbmluZ0VmZm9ydExldmVscztcbnR5cGUgQWdlbnRIb3N0UmVhc29uaW5nRWZmb3J0ID0gUmVhc29uaW5nRWZmb3J0TGV2ZWw7XG5cbmZ1bmN0aW9uIGRpc2FibGVkTWNwU2VydmVyc1Nlc3Npb25PcHRpb24ocGx1Z2luczogcmVhZG9ubHkgSUNvcGlsb3RQbHVnaW5JbmZvW10sIGRpc2FibGVkUm9vdE1jcFNlcnZlcnM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUGFydGlhbDxTZXNzaW9uQ29uZmlnPiB7XG5cdGNvbnN0IGRpc2FibGVkTWNwU2VydmVycyA9IFsuLi5uZXcgU2V0KFtcblx0XHQuLi5wbHVnaW5zLmZsYXRNYXAocGx1Z2luID0+IHBsdWdpbi5kaXNhYmxlZE1jcFNlcnZlcnMgPz8gW10pLFxuXHRcdC4uLihkaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzID8/IFtdKSxcblx0XSldO1xuXHRyZXR1cm4gZGlzYWJsZWRNY3BTZXJ2ZXJzLmxlbmd0aCA+IDAgPyB7IGRpc2FibGVkTWNwU2VydmVycyB9IDoge307XG59XG5cbi8qKlxuICogTmFycm93cyBhIHJlYXNvbmluZy1lZmZvcnQgdmFsdWUgdG8gdGhlIFNESydzIGRlY2xhcmVkIHVuaW9uLiBUaGUgU0RLIHR5cGUgaXNcbiAqIGEgc3RyaWN0IHN1YnNldCBvZiB0aGUgdGllcnMgdGhlIHJ1bnRpbWUgYWNjZXB0cywgc28gbmV3ZXIgdGllcnMgYXJlIGZvcndhcmRlZFxuICogdW5jaGFuZ2VkIHJhdGhlciB0aGFuIGRyb3BwZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka1JlYXNvbmluZ0VmZm9ydChlZmZvcnQ6IEFnZW50SG9zdFJlYXNvbmluZ0VmZm9ydCB8IHVuZGVmaW5lZCk6IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddIHtcblx0cmV0dXJuIGVmZm9ydCBhcyBTZXNzaW9uQ29uZmlnWydyZWFzb25pbmdFZmZvcnQnXTtcbn1cblxuY29uc3QgQ29udGV4dFRpZXJzID0gWydkZWZhdWx0JywgJ2xvbmdfY29udGV4dCddIGFzIGNvbnN0O1xuY29uc3QgQUdFTlRfSE9TVF9DT1BJTE9UX0NMSUVOVF9OQU1FID0gJ3ZzY29kZS1hZ2VudC1ob3N0JztcblxudHlwZSBVc2VySW5wdXRIYW5kbGVyID0gTm9uTnVsbGFibGU8U2Vzc2lvbkNvbmZpZ1snb25Vc2VySW5wdXRSZXF1ZXN0J10+O1xudHlwZSBVc2VySW5wdXRSZXF1ZXN0ID0gUGFyYW1ldGVyczxVc2VySW5wdXRIYW5kbGVyPlswXTtcbnR5cGUgVXNlcklucHV0SW52b2NhdGlvbiA9IFBhcmFtZXRlcnM8VXNlcklucHV0SGFuZGxlcj5bMV07XG50eXBlIFVzZXJJbnB1dFJlc3BvbnNlID0gQXdhaXRlZDxSZXR1cm5UeXBlPFVzZXJJbnB1dEhhbmRsZXI+PjtcbnR5cGUgTWNwQXV0aEhhbmRsZXIgPSBOb25OdWxsYWJsZTxTZXNzaW9uQ29uZmlnWydvbk1jcEF1dGhSZXF1ZXN0J10+O1xudHlwZSBNY3BBdXRoUmVxdWVzdCA9IFBhcmFtZXRlcnM8TWNwQXV0aEhhbmRsZXI+WzBdO1xudHlwZSBNY3BBdXRoQ29udGV4dCA9IFBhcmFtZXRlcnM8TWNwQXV0aEhhbmRsZXI+WzFdO1xudHlwZSBNY3BBdXRoUmVzcG9uc2UgPSBBd2FpdGVkPFJldHVyblR5cGU8TWNwQXV0aEhhbmRsZXI+PjtcbnR5cGUgUHJlVG9vbFVzZUhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblByZVRvb2xVc2UnXT4+WzBdO1xudHlwZSBQb3N0VG9vbFVzZUhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblBvc3RUb29sVXNlJ10+PlswXTtcbi8qKlxuICogSW1tdXRhYmxlIHNuYXBzaG90IG9mIHRoZSBhY3RpdmUgY2xpZW50J3Mgc3RydWN0dXJhbCBjb250cmlidXRpb25zIGF0XG4gKiBzZXNzaW9uIGNyZWF0aW9uIHRpbWUuIFVzZWQgdG8gZGV0ZWN0IHdoZW4gdGhlIHNlc3Npb24gbmVlZHMgdG8gYmVcbiAqIHJlZnJlc2hlZC4gUm9vdCBNQ1Agc2VydmVycyBwYXJ0aWNpcGF0ZSBpbiByZXN0YXJ0IGRldGVjdGlvbiBiZWNhdXNlIHRoZXlcbiAqIGFyZSBtZXJnZWQgaW50byB0aGUgU0RLIHNlc3Npb24gY29uZmlnLiBUaGUgb3duaW5nIGBjbGllbnRJZGBzIGFyZVxuICogZGVsaWJlcmF0ZWx5IE5PVCBwYXJ0IG9mIHRoaXMgc25hcHNob3Q6IGNsaWVudCBpZGVudGl0eSBpcyB0cmFja2VkIGxpdmUgdmlhXG4gKiB7QGxpbmsgQWN0aXZlQ2xpZW50VG9vbFNldH0gc28gYSB3aW5kb3dcbiAqIHJlbG9hZCAobmV3IGBjbGllbnRJZGAsIGlkZW50aWNhbCB0b29scy9wbHVnaW5zKSBkb2VzIG5vdCBmb3JjZSBhIHJlc3RhcnQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2ZUNsaWVudFNuYXBzaG90IHtcblx0cmVhZG9ubHkgdG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW107XG5cdHJlYWRvbmx5IHBsdWdpbnM6IHJlYWRvbmx5IElDb3BpbG90UGx1Z2luSW5mb1tdO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJzOiBBZ2VudEhvc3RNY3BTZXJ2ZXJzO1xufVxuXG4vKipcbiAqIFRoZSBzZXQgb2YgY2xpZW50LXRvb2wgbmFtZXMgdGhlIGFnZW50IHNlZXMgZm9yIGEgc25hcHNob3QgXHUyMDE0IGVhY2ggdG9vbCdzXG4gKiBgVG9vbERlZmluaXRpb24ubmFtZWAgKHRoZSBjYW1lbENhc2UgYHRvb2xSZWZlcmVuY2VOYW1lYCkuIEdhdGVzIHByb21wdFxuICogc2VjdGlvbnMgYXQgbGF1bmNoIGFuZCByb3V0ZXMgY2xpZW50IHRvb2wgY2FsbHMsIHNvIHRoZSB0d28gc3RheSBkZXJpdmVkIGZyb21cbiAqIG9uZSBkZWZpbml0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90KHNuYXBzaG90OiBJQWN0aXZlQ2xpZW50U25hcHNob3QpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0cmV0dXJuIG5ldyBTZXQoc25hcHNob3QudG9vbHMubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG59XG5cbi8qKlxuICogTmFycm93cyB0aGUgbmFtZXMgdGhhdCBnYXRlIHByb21wdCBjb250ZW50IHNvIHRoZSBzeXN0ZW0gbWVzc2FnZSBuZXZlclxuICogYWR2ZXJ0aXNlcyBhIHRvb2wgdGhlIGZpbHRlcnMgZGlzYWJsZWQuIENsaWVudCB0b29scyBhcmUgYGN1c3RvbTpgLXNvdXJjZSBldmVuXG4gKiB3aGVuIHRoZXkgb3ZlcnJpZGUgYSBidWlsdC1pbiwgc28gYmFyZS1uYW1lIGFuZCBgY3VzdG9tOmAgZm9ybXMgbWF0Y2ggKHRoZVxuICogdG9vbC1zZWFyY2ggdG9vbCB1bmRlciBlaXRoZXIgb2YgaXRzIG5hbWVzKS4gUm91dGluZyBrZWVwcyB0aGUgdW5maWx0ZXJlZFxuICogc2V0IFx1MjAxNCB0aGUgcnVudGltZSBpcyB0aGUgZW5mb3JjZW1lbnQgcG9pbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJDbGllbnRUb29sTmFtZXMobmFtZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4sIGF2YWlsYWJsZVRvb2xzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZXhjbHVkZWRUb29sczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0aWYgKCFhdmFpbGFibGVUb29scyAmJiAhZXhjbHVkZWRUb29scykge1xuXHRcdHJldHVybiBuYW1lcztcblx0fVxuXHRjb25zdCBtYXRjaGVzID0gKHBhdHRlcm5zOiByZWFkb25seSBzdHJpbmdbXSwgbmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3Qgc2RrTmFtZSA9IHRvU2RrQ2xpZW50VG9vbE5hbWUobmFtZSk7XG5cdFx0cmV0dXJuIHBhdHRlcm5zLnNvbWUocGF0dGVybiA9PlxuXHRcdFx0cGF0dGVybiA9PT0gbmFtZSB8fFxuXHRcdFx0cGF0dGVybiA9PT0gc2RrTmFtZSB8fFxuXHRcdFx0cGF0dGVybiA9PT0gYGN1c3RvbToke25hbWV9YCB8fFxuXHRcdFx0cGF0dGVybiA9PT0gYGN1c3RvbToke3Nka05hbWV9YCB8fFxuXHRcdFx0cGF0dGVybiA9PT0gJ2N1c3RvbToqJ1xuXHRcdCk7XG5cdH07XG5cdGNvbnN0IHJlc3VsdCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IG5hbWUgb2YgbmFtZXMpIHtcblx0XHRjb25zdCBhbGxvd2VkID0gIWF2YWlsYWJsZVRvb2xzIHx8IG1hdGNoZXMoYXZhaWxhYmxlVG9vbHMsIG5hbWUpO1xuXHRcdGlmIChhbGxvd2VkICYmICEoZXhjbHVkZWRUb29scyAmJiBtYXRjaGVzKGV4Y2x1ZGVkVG9vbHMsIG5hbWUpKSkge1xuXHRcdFx0cmVzdWx0LmFkZChuYW1lKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIFRoZSBTREstcmVnaXN0ZXJlZCBuYW1lIGZvciBhIGNsaWVudCB0b29sOyBvbmx5IHRoZSB0b29sLXNlYXJjaCB0b29sIGRpZmZlcnMuICovXG5mdW5jdGlvbiB0b1Nka0NsaWVudFRvb2xOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBuYW1lID09PSBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUgPyBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSA6IG5hbWU7XG59XG5cbi8qKiBNYXBzIEFnZW50IEhvc3QgcmVmZXJlbmNlIG5hbWVzIHRvIHRoZSBuYW1lcyByZWdpc3RlcmVkIHdpdGggdGhlIFNESy4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka1Rvb2xGaWx0ZXJQYXR0ZXJucyhwYXR0ZXJuczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcGF0dGVybnMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBbLi4ubmV3IFNldChwYXR0ZXJucy5tYXAocGF0dGVybiA9PiB7XG5cdFx0aWYgKHBhdHRlcm4gPT09IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSkge1xuXHRcdFx0cmV0dXJuIHRvU2RrQ2xpZW50VG9vbE5hbWUocGF0dGVybik7XG5cdFx0fVxuXHRcdGlmIChwYXR0ZXJuID09PSBgY3VzdG9tOiR7Q0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FfWApIHtcblx0XHRcdHJldHVybiBgY3VzdG9tOiR7dG9TZGtDbGllbnRUb29sTmFtZShDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUpfWA7XG5cdFx0fVxuXHRcdHJldHVybiBwYXR0ZXJuO1xuXHR9KSldO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90U2Vzc2lvblJ1bnRpbWUge1xuXHRoYW5kbGVQZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0OiBQZXJtaXNzaW9uUmVxdWVzdCk6IFByb21pc2U8UGVybWlzc2lvblJlcXVlc3RSZXN1bHQ+O1xuXHRoYW5kbGVFeGl0UGxhbk1vZGVSZXF1ZXN0KHJlcXVlc3Q6IEV4aXRQbGFuTW9kZVJlcXVlc3QsIGludm9jYXRpb246IHsgc2Vzc2lvbklkOiBzdHJpbmcgfSk6IFByb21pc2U8RXhpdFBsYW5Nb2RlUmVzdWx0Pjtcblx0aGFuZGxlVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0OiBVc2VySW5wdXRSZXF1ZXN0LCBpbnZvY2F0aW9uOiBVc2VySW5wdXRJbnZvY2F0aW9uKTogUHJvbWlzZTxVc2VySW5wdXRSZXNwb25zZT47XG5cdGhhbmRsZUVsaWNpdGF0aW9uUmVxdWVzdChjb250ZXh0OiBFbGljaXRhdGlvbkNvbnRleHQpOiBQcm9taXNlPEVsaWNpdGF0aW9uUmVzdWx0Pjtcblx0aGFuZGxlTWNwQXV0aFJlcXVlc3QocmVxdWVzdDogTWNwQXV0aFJlcXVlc3QsIGNvbnRleHQ6IE1jcEF1dGhDb250ZXh0KTogUHJvbWlzZTxNY3BBdXRoUmVzcG9uc2U+O1xuXHRyZXF1ZXN0VW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uKHJlcXVlc3Q6IElVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb25SZXF1ZXN0KTogUHJvbWlzZTxib29sZWFuPjtcblx0aGFuZGxlUHJlVG9vbFVzZShpbnB1dDogUHJlVG9vbFVzZUhvb2tJbnB1dCk6IFByb21pc2U8dm9pZD47XG5cdGhhbmRsZVBvc3RUb29sVXNlKGlucHV0OiBQb3N0VG9vbFVzZUhvb2tJbnB1dCk6IFByb21pc2U8dm9pZD47XG5cdGhhbmRsZVVzZXJQcm9tcHRTdWJtaXR0ZWQoKTogeyByZWFkb25seSBhZGRpdGlvbmFsQ29udGV4dDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNyZWF0ZUNsaWVudFNka1Rvb2xzKHRvb2xTZWFyY2hBY3RpdmU6IGJvb2xlYW4pOiBUb29sPGFueT5bXTtcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0Y3JlYXRlU2VydmVyU2RrVG9vbHMoKTogVG9vbDxhbnk+W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RTZXNzaW9uTGF1bmNoZXIge1xuXHQvKipcblx0ICogQ3JlYXRlcyBhbiB1bm93bmVkIFNESyBzZXNzaW9uIHdyYXBwZXIuIFRoZSBjYWxsZXIgaXMgcmVzcG9uc2libGUgZm9yXG5cdCAqIHJlZ2lzdGVyaW5nIG9yIGRpc3Bvc2luZyB0aGUgcmV0dXJuZWQgd3JhcHBlci5cblx0ICovXG5cdGxhdW5jaChwbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIHJ1bnRpbWU6IElDb3BpbG90U2Vzc2lvblJ1bnRpbWUpOiBQcm9taXNlPENvcGlsb3RTZXNzaW9uV3JhcHBlcj47XG59XG5cbnR5cGUgQ29waWxvdFNlc3Npb25DbGllbnQgPSBQaWNrPENvcGlsb3RDbGllbnQsICdjcmVhdGVTZXNzaW9uJyB8ICdyZXN1bWVTZXNzaW9uJz47XG5cbmludGVyZmFjZSBJQ29waWxvdFNlc3Npb25MYXVuY2hCYXNlIHtcblx0cmVhZG9ubHkgY2xpZW50OiBDb3BpbG90U2Vzc2lvbkNsaWVudDtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFRoZSBhZGRpdGlvbmFsIHdvcmtpbmcgZGlyZWN0b3JpZXMgYmV5b25kIHRoZSBwcmltYXJ5IHByb2Nlc3Mgcm9vdFxuXHQgKiAoe0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9ID0gaW5kZXggMCkuIFRoZXNlIGFyZSB0aGUgcGVlciByb290cyBvZiBhXG5cdCAqIG11bHRpLXJvb3Qgc2Vzc2lvbidzIG9yZGVyZWQgc2V0IFx1MjAxNCB0aGUgZGlyZWN0b3JpZXMgdGhlIGFnZW50IHNob3VsZCBiZVxuXHQgKiBncmFudGVkIHRvb2wgYWNjZXNzIHRvIGluIGFkZGl0aW9uIHRvIGl0cyBwcm9jZXNzIGN3ZC4gRW1wdHkgKG9yIGFic2VudClcblx0ICogZm9yIGEgc2luZ2xlLXJvb3Qgc2Vzc2lvbi4gUGFzc2VkIHRocm91Z2ggc28gdGhlIFNESyBjYW4gcmVnaXN0ZXIgdGhlbSBhc1xuXHQgKiBleHRyYSBhY2Nlc3NpYmxlIHJvb3RzIG9uY2UgdGhhdCBzdXJmYWNlIGlzIGF2YWlsYWJsZTsgdGhlIHByb2Nlc3Mgc3RpbGxcblx0ICogbGF1bmNoZXMgaW4ge0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9LlxuXHQgKi9cblx0cmVhZG9ubHkgYWRkaXRpb25hbERpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107XG5cdHJlYWRvbmx5IHJlc29sdmVkQWdlbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNuYXBzaG90OiBJQWN0aXZlQ2xpZW50U25hcHNob3Q7XG5cdC8qKiBSb290LWNvbmZpZ3VyZWQgTUNQIHNlcnZlcnMgZGlzYWJsZWQgYnkgdGhlIG93bmluZyBzZXNzaW9uJ3MgcmVzb2x2ZWQgY3VzdG9taXphdGlvbiBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgZGlzYWJsZWRSb290TWNwU2VydmVycz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKipcblx0ICogTGl2ZSwgbG9uZy1saXZlZCByZWdpc3RyeSBvZiBldmVyeSBhY3RpdmUgY2xpZW50J3MgdG9vbCBjb250cmlidXRpb25zLlxuXHQgKiBSZWFkIGF0IHRvb2wtY2FsbCBzdGFtcCB0aW1lIHNvIGEgd2luZG93IHJlbG9hZCAobmV3IGBjbGllbnRJZGAsXG5cdCAqIGlkZW50aWNhbCB0b29scykgc3RhbXBzIHN1YnNlcXVlbnQgY2xpZW50IHRvb2wgY2FsbHMgd2l0aCB0aGUgY3VycmVudFxuXHQgKiBvd25pbmcgaWQgcmF0aGVyIHRoYW4gdGhlIG9uZSBmcm96ZW4gaW50byB7QGxpbmsgc25hcHNob3R9IGF0IGNyZWF0aW9uLFxuXHQgKiBhbmQgc28gYSB0b29sIGNhbGwgaXMgYXR0cmlidXRlZCB0byB3aGljaGV2ZXIgY2xpZW50IGNvbnRyaWJ1dGVkIGl0LlxuXHQgKi9cblx0cmVhZG9ubHkgYWN0aXZlQ2xpZW50VG9vbFNldDogQWN0aXZlQ2xpZW50VG9vbFNldDtcblx0cmVhZG9ubHkgc2hlbGxNYW5hZ2VyOiBTaGVsbE1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGdpdGh1YlRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBpcyBhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24uIFRocmVhZGVkIGludG8gdGhlXG5cdCAqIHByb21wdCBjb250ZXh0IHNvIHRoZSByZXNvbHZlZCBzeXN0ZW0gbWVzc2FnZSBnZXRzIHRoZSBzY3JhdGNoL3JlcG9sZXNzXG5cdCAqIHZhcmlhbnQuIE5hbWVkIHRvIG1hdGNoIHRoZSBgd29ya3NwYWNlbGVzc2AgbWFya2VyIHVzZWQgdGhyb3VnaG91dCB0aGUgQUhcblx0ICogbGF5ZXIgKHNlc3Npb24gYF9tZXRhYCwgc3RvcmVkIG1ldGFkYXRhKSB0aGF0IHRoaXMgdmFsdWUgZmxvd3MgZnJvbS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90Q3JlYXRlU2Vzc2lvbkxhdW5jaFBsYW4gZXh0ZW5kcyBJQ29waWxvdFNlc3Npb25MYXVuY2hCYXNlIHtcblx0cmVhZG9ubHkga2luZDogJ2NyZWF0ZSc7XG5cdHJlYWRvbmx5IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9uZ0NvbnRleHRXaW5kb3c/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZyZWVMb25nQ29udGV4dD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvcGlsb3RSZXN1bWVTZXNzaW9uTGF1bmNoUGxhbiBleHRlbmRzIElDb3BpbG90U2Vzc2lvbkxhdW5jaEJhc2Uge1xuXHRyZWFkb25seSBraW5kOiAncmVzdW1lJztcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogVVJJO1xuXHRyZWFkb25seSBmYWxsYmFjazoge1xuXHRcdHJlYWRvbmx5IG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRyZWFkb25seSBsb25nQ29udGV4dFdpbmRvdz86IG51bWJlcjtcblx0XHRyZWFkb25seSBmcmVlTG9uZ0NvbnRleHQ/OiBib29sZWFuO1xuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSBJQ29waWxvdENyZWF0ZVNlc3Npb25MYXVuY2hQbGFuIHwgSUNvcGlsb3RSZXN1bWVTZXNzaW9uTGF1bmNoUGxhbjtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIEFnZW50SG9zdFJlYXNvbmluZ0VmZm9ydCB7XG5cdHJldHVybiBSZWFzb25pbmdFZmZvcnRzLnNvbWUocmVhc29uaW5nRWZmb3J0ID0+IHJlYXNvbmluZ0VmZm9ydCA9PT0gdmFsdWUpO1xufVxuXG5mdW5jdGlvbiBpc0NvbnRleHRUaWVyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ29udGV4dFRpZXIge1xuXHRyZXR1cm4gQ29udGV4dFRpZXJzLnNvbWUoY29udGV4dFRpZXIgPT4gY29udGV4dFRpZXIgPT09IHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29waWxvdFNka0Vycm9yQ29kZShlcnI6IHVua25vd24pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIGVyciAhPT0gJ29iamVjdCcgfHwgZXJyID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjb2RlID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihlcnIsICdjb2RlJyk/LnZhbHVlO1xuXHRyZXR1cm4gdHlwZW9mIGNvZGUgPT09ICdudW1iZXInID8gY29kZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0RXJyb3JNZXNzYWdlKGVycjogdW5rbm93bik6IHN0cmluZyB7XG5cdGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdHJldHVybiBlcnIubWVzc2FnZTtcblx0fVxuXHRpZiAodHlwZW9mIGVyciA9PT0gJ29iamVjdCcgJiYgZXJyICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZXJyLCAnbWVzc2FnZScpPy52YWx1ZTtcblx0XHRpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gbWVzc2FnZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFN0cmluZyhlcnIpO1xufVxuXG4vKipcbiAqIE1lc3NhZ2VzIGZyb20gYSBmYWlsZWQgQ29waWxvdCBTREsgYHNlc3Npb24ucmVzdW1lYCB0aGF0IHBvc2l0aXZlbHkgaW5kaWNhdGVcbiAqIHRoZSBzZXNzaW9uIGhhcyBubyBldmVudHMgb24gZGlzaywgc28gdGhlcmUgaXMgbm8gaGlzdG9yeSB0byBsb3NlLiBJbmNsdWRlc1xuICogdGhlIHBvc3QtXCJTdGFydCBPdmVyXCIgY2FzZSwgd2hlcmUgYHRydW5jYXRlQ2hhdGAgbGVhdmVzIHplcm8gZXZlbnRzLlxuICovXG5jb25zdCBSRVNVTUFCTEVfSElTVE9SWV9BQlNFTlRfUEFUVEVSTlMgPSBbXG5cdC9cXGJTZXNzaW9uIG5vdCBmb3VuZFxcYi9pLFxuXHQvXFxibm8gZXZlbnRzXFxiL2ksXG5cdC9cXGJlbXB0eSBzZXNzaW9uXFxiL2ksXG5dO1xuXG4vKipcbiAqIERlY2lkZSB3aGV0aGVyIGEgQ29waWxvdCBTREsgYHJlc3VtZVNlc3Npb25gIGZhaWx1cmUgc2hvdWxkIGZhbGwgYmFjayB0b1xuICogYGNyZWF0ZVNlc3Npb24oeyBzZXNzaW9uSWQgfSlgLCB3aGljaCBwcmVzZW50cyB0aGUgc2Vzc2lvbiBhcyBoYXZpbmcgbm9cbiAqIGhpc3RvcnkuIERlbGliZXJhdGVseSBhbiBhbGxvd2xpc3Q6IGEgZmFsbGJhY2sgb24gYW4gdW5yZWxhdGVkIGZhaWx1cmUgKGFcbiAqIHRyYW5zaWVudCBgbmV0d29yayBmZXRjaCBmYWlsZWRgIGlzIGFsc28gYC0zMjYwM2ApIGRpc2NhcmRzIGEgbGl2ZSBzZXNzaW9uJ3NcbiAqIGhpc3RvcnkgYW5kIGxlYXZlcyBpdCBleHBvc2VkIHRvIGVtcHR5LXNlc3Npb24gR0MuXG4gKi9cbmZ1bmN0aW9uIHNob3VsZENyZWF0ZUVtcHR5U2Vzc2lvbkFmdGVyUmVzdW1lRXJyb3IoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGlmIChnZXRDb3BpbG90U2RrRXJyb3JDb2RlKGVycikgIT09IC0zMjYwMykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IG1lc3NhZ2UgPSBnZXRFcnJvck1lc3NhZ2UoZXJyKTtcblx0cmV0dXJuIFJFU1VNQUJMRV9ISVNUT1JZX0FCU0VOVF9QQVRURVJOUy5zb21lKHBhdHRlcm4gPT4gcGF0dGVybi50ZXN0KG1lc3NhZ2UpKTtcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21BZ2VudE5vdEZvdW5kRXJyb3IoZXJyOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiBnZXRDb3BpbG90U2RrRXJyb3JDb2RlKGVycikgPT09IC0zMjYwMyAmJiAvXFxiQ3VzdG9tIGFnZW50ICcuKycgbm90IGZvdW5kXFxiL2kudGVzdChnZXRFcnJvck1lc3NhZ2UoZXJyKSk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIHJlYXNvbmluZyBlZmZvcnQ6IGEgcmVjb2duaXplZCBvdmVycmlkZSBsZXZlbCB3aW5zIG92ZXIgdGhlXG4gKiBtb2RlbCBwaWNrZXIncyB0aGlua2luZyBsZXZlbDsgYW4gdW5yZWNvZ25pemVkIG92ZXJyaWRlIGlzIGlnbm9yZWQgKGRlZ3JhZGVzXG4gKiB0byB0aGUgcGlja2VyKS4gVmFsaWRhdGlvbiBpcyBhZ2FpbnN0IHRoZSBrbm93biBlZmZvcnQgbGV2ZWxzIG9ubHkgXHUyMDE0IHRoZVxuICogY2FsbGVyL29wZXJhdG9yIGlzIHJlc3BvbnNpYmxlIGZvciBjaG9vc2luZyBhIGxldmVsIHRoZSBtb2RlbCBzdXBwb3J0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBlZmZvcnRPdmVycmlkZT86IHN0cmluZyk6IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddIHtcblx0aWYgKGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydChlZmZvcnRPdmVycmlkZSkpIHtcblx0XHRyZXR1cm4gdG9TZGtSZWFzb25pbmdFZmZvcnQoZWZmb3J0T3ZlcnJpZGUpO1xuXHR9XG5cdGNvbnN0IHRoaW5raW5nTGV2ZWwgPSBtb2RlbD8uY29uZmlnPy5bVGhpbmtpbmdMZXZlbENvbmZpZ0tleV07XG5cdHJldHVybiBpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQodGhpbmtpbmdMZXZlbCkgPyB0b1Nka1JlYXNvbmluZ0VmZm9ydCh0aGlua2luZ0xldmVsKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIExvZyBsYWJlbCBmb3IgYSBzZXNzaW9uJ3MgbW9kZWw7IGEgc2Vzc2lvbiBtYXkgaGF2ZSBub25lIChzZXJ2ZXItc2lkZSBcIkF1dG9cIikuICovXG5mdW5jdGlvbiBkZXNjcmliZU1vZGVsSWQobW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIG1vZGVsPy5pZCA/PyAnKG5vIG1vZGVsKSc7XG59XG5cbi8qKlxuICogVGhlIGNvbmZpZ3VyZWQgcmVhc29uaW5nLWVmZm9ydCBvdmVycmlkZSBhbG9uZSwgd2l0aCBubyBwaWNrZXIgZmFsbGJhY2suXG4gKiBLZXllZCBieSB0aGUgdW4tYWxpYXNlZCBtb2RlbCBpZCwgZmFsbGluZyBiYWNrIHRvIHRoZSBgKmAgZW50cnk7IGB1bmRlZmluZWRgXG4gKiBtZWFucyBubyBvdmVycmlkZSBpcyBjb25maWd1cmVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvbmZpZ3VyZWRSZWFzb25pbmdFZmZvcnRPdmVycmlkZShtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBQaWNrPElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCAnZ2V0Um9vdFZhbHVlJz4sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddIHtcblx0Y29uc3Qgb3ZlcnJpZGVzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuTW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVzKTtcblx0Y29uc3QgZWZmb3J0ID0gcmVzb2x2ZU1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlRmllbGQob3ZlcnJpZGVzLCBtb2RlbD8uaWQsICdyZWFzb25pbmdFZmZvcnQnLCBpc0NvcGlsb3RSZWFzb25pbmdFZmZvcnQsIHZhbHVlID0+IHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSWdub3JpbmcgaW52YWxpZCByZWFzb25pbmctZWZmb3J0IG92ZXJyaWRlICcke3ZhbHVlfScgZm9yICcke2Rlc2NyaWJlTW9kZWxJZChtb2RlbCl9JzsgZXhwZWN0ZWQgb25lIG9mIFske1JlYXNvbmluZ0VmZm9ydHMuam9pbignLCAnKX1dYCk7XG5cdH0pO1xuXHRpZiAoZWZmb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRsb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQXBwbHlpbmcgcmVhc29uaW5nLWVmZm9ydCBvdmVycmlkZSAnJHtlZmZvcnR9JyBmb3IgJyR7ZGVzY3JpYmVNb2RlbElkKG1vZGVsKX0nYCk7XG5cdFx0cmV0dXJuIHRvU2RrUmVhc29uaW5nRWZmb3J0KGVmZm9ydCk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUaGUgY29uZmlndXJlZCBvdmVycmlkZSBvdmVyIHRoZSBwaWNrZXIncyB0aGlua2luZyBsZXZlbC4gU2hhcmVkIGJ5IHRoZVxuICogbGF1bmNoZXIgYW5kIGBDb3BpbG90QWdlbnQuX2NoYW5nZU1vZGVsYCBzbyBib3RoIHJlc29sdmUgaXQgdGhlIHNhbWUgd2F5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZTogUGljazxJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgJ2dldFJvb3RWYWx1ZSc+LCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBTZXNzaW9uQ29uZmlnWydyZWFzb25pbmdFZmZvcnQnXSB7XG5cdHJldHVybiByZXNvbHZlQ29uZmlndXJlZFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlKG1vZGVsLCBjb25maWd1cmF0aW9uU2VydmljZSwgbG9nU2VydmljZSwgc2Vzc2lvbklkKSA/PyBnZXRDb3BpbG90UmVhc29uaW5nRWZmb3J0KG1vZGVsKTtcbn1cblxuLyoqXG4gKiBTaGFwZS1jaGVja2VkIG9ubHk6IHRoZSBTREsgZGVlcC1tZXJnZXMgdGhpcyBvdmVyIGl0cyBvd24gZGVmYXVsdHMgYW5kIGlnbm9yZXNcbiAqIHVucmVjb2duaXplZCBrZXlzLCBzbyBmaWVsZC1sZXZlbCB2YWxpZGF0aW9uIGJlbG9uZ3MgYXQgdGhhdCBib3VuZGFyeS5cbiAqL1xuZnVuY3Rpb24gZ2V0TW9kZWxDYXBhYmlsaXRpZXNPdmVycmlkZSh2YWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIG1vZGVsSWQ6IHN0cmluZywgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIHNlc3Npb25JZDogc3RyaW5nKTogTW9kZWxDYXBhYmlsaXRpZXNPdmVycmlkZSB8IHVuZGVmaW5lZCB7XG5cdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQXBwbHlpbmcgJ21vZGVsQ2FwYWJpbGl0aWVzJyBjYXBhYmlsaXR5IG92ZXJyaWRlIGZvciAnJHttb2RlbElkfSdgKTtcblx0cmV0dXJuIHZhbHVlIGFzIE1vZGVsQ2FwYWJpbGl0aWVzT3ZlcnJpZGU7XG59XG5cbi8qKiBUaGUgc291cmNlcyBhIGJhcmUgYCcqJ2AgbWVhbnM7IHRoZSBTREsgb25seSBhY2NlcHRzIHNvdXJjZS1xdWFsaWZpZWQgd2lsZGNhcmRzLiAqL1xuY29uc3QgVE9PTF9GSUxURVJfU09VUkNFX1dJTERDQVJEUyA9IFsnYnVpbHRpbjoqJywgJ21jcDoqJywgJ2N1c3RvbToqJ107XG5cbi8qKlxuICogVGhlIHBhdHRlcm5zIGluIGEgdG9vbC1maWx0ZXIgb3ZlcnJpZGUsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIHZhbHVlIGlzIG5vdCBhXG4gKiBsaXN0IChhIGxvbmUgc3RyaW5nIHJlYWRzIGFzIG9uZSBlbnRyeSkuIEEgYmFyZSBgJyonYCBleHBhbmRzIHRvIHRoZSBzb3VyY2VcbiAqIHdpbGRjYXJkczogdGhlIFNESyB0aHJvd3Mgb24gdGhlIGJhcmUgZm9ybSwgYW5kIGRyb3BwaW5nIGl0IHdvdWxkIHR1cm5cbiAqIFwiZXhjbHVkZSBldmVyeXRoaW5nXCIgaW50byBcImV4Y2x1ZGUgbm90aGluZ1wiLiBQdXJlLCBzbyB0aGUgbGF1bmNoZXIgYW5kXG4gKiB7QGxpbmsgQ29waWxvdEFnZW50U2Vzc2lvbn0gZ2F0ZSBvbiB0aGUgc2FtZSBzZXQgd2l0aG91dCBkdXBsaWNhdGUgbG9nZ2luZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVRvb2xGaWx0ZXJQYXR0ZXJucyh2YWx1ZTogdW5rbm93bik6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbGlzdCA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBbdmFsdWVdIDogdmFsdWU7XG5cdGlmICghaXNTdHJpbmdBcnJheShsaXN0KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gYFtdYCBpcyBwcmVzZXJ2ZWQsIG5vdCBjb2xsYXBzZWQgdG8gXCJ1bnNldFwiOiBhbiBlbXB0eSBhbGxvd2xpc3QgbWVhbnMgXCJub1xuXHQvLyB0b29sc1wiLCBhbmQgZHJvcHBpbmcgaXQgd291bGQgZW5hYmxlIGV2ZXJ5IHRvb2wgaW5zdGVhZC5cblx0cmV0dXJuIFsuLi5uZXcgU2V0KGxpc3QuZmxhdE1hcChwYXR0ZXJuID0+IHBhdHRlcm4gPT09ICcqJyA/IFRPT0xfRklMVEVSX1NPVVJDRV9XSUxEQ0FSRFMgOiBbcGF0dGVybl0pKV07XG59XG5cbi8qKlxuICoge0BsaW5rIG5vcm1hbGl6ZVRvb2xGaWx0ZXJQYXR0ZXJuc30gcGx1cyB0aGUgbGF1bmNoLXRpbWUgbG9nIGxpbmUuIFRoZSBmaWVsZFxuICogcmVzb2x2ZXIgYWxyZWFkeSByZWplY3RlZCB1bnVzYWJsZSB2YWx1ZXMsIHNvIHRoZSBpbnB1dCBub3JtYWxpemVzIGNsZWFubHkuXG4gKi9cbmZ1bmN0aW9uIGdldFRvb2xGaWx0ZXJPdmVycmlkZSh2YWx1ZTogc3RyaW5nIHwgcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQsIGZpZWxkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZywgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsIHNlc3Npb25JZDogc3RyaW5nKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXR0ZXJucyA9IHZhbHVlICE9PSB1bmRlZmluZWQgPyBub3JtYWxpemVUb29sRmlsdGVyUGF0dGVybnModmFsdWUpIDogdW5kZWZpbmVkO1xuXHRpZiAocGF0dGVybnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdGxvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBBcHBseWluZyAnJHtmaWVsZH0nIGNhcGFiaWxpdHkgb3ZlcnJpZGUgZm9yICcke21vZGVsSWR9JzogJHtwYXR0ZXJucy5qb2luKCcsICcpfWApO1xuXHR9XG5cdHJldHVybiBwYXR0ZXJucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvcGlsb3RDb250ZXh0VGllcihtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIGxvbmdDb250ZXh0V2luZG93PzogbnVtYmVyLCBmcmVlTG9uZ0NvbnRleHQ/OiBib29sZWFuKTogU2Vzc2lvbkNvbmZpZ1snY29udGV4dFRpZXInXSB7XG5cdC8vIExlZ2FjeSBwZXJzaXN0ZWQgc2VsZWN0aW9ucyBzdG9yZWQgdGhlIHJlc29sdmVkIHRpZXIgc3RyaW5nIGRpcmVjdGx5IHVuZGVyIHRoZSBkZXByZWNhdGVkIGtleS5cblx0Y29uc3QgbGVnYWN5VGllciA9IG1vZGVsPy5jb25maWc/LltDb250ZXh0VGllckNvbmZpZ0tleV07XG5cdGlmIChpc0NvbnRleHRUaWVyKGxlZ2FjeVRpZXIpKSB7XG5cdFx0cmV0dXJuIGxlZ2FjeVRpZXI7XG5cdH1cblx0Ly8gVGhlIFwiQ29udGV4dCBTaXplXCIgcGlja2VyIGV4cG9zZXMgbnVtZXJpYyB0b2tlbi1jb3VudCBlbnVtIHZhbHVlcywgc28gYSBjdXJyZW50IHNlbGVjdGlvbiBhcnJpdmVzXG5cdC8vIHVuZGVyIGBjb250ZXh0U2l6ZWAgYXMgYSB0b2tlbiBjb3VudC4gTWFwIGl0IHRvIHRoZSBTREsncyB0d28tdmFsdWVkIHRpZXIgdXNpbmcgdGhlIG1vZGVsJ3Ncblx0Ly8gbG9uZy1jb250ZXh0IHdpbmRvdzogb25seSBhIHNlbGVjdGlvbiB0aGF0IHJlYWNoZXMgdGhhdCB3aW5kb3cgb3B0cyBpbnRvIGBsb25nX2NvbnRleHRgLiBXaXRob3V0XG5cdC8vIHRoZSB3aW5kb3cgKG1vZGVsIGV4cG9zZXMgbm8gcGlja2VyLCBvciB0aGUgbW9kZWwgbGlzdCBpc24ndCBsb2FkZWQpIGxlYXZlIHRoZSBTREsgb24gaXRzIGRlZmF1bHRcblx0Ly8gdGllci5cblx0Y29uc3QgY29udGV4dFNpemUgPSBtb2RlbD8uY29uZmlnPy5bQ29udGV4dFNpemVDb25maWdLZXldO1xuXHRpZiAoY29udGV4dFNpemUgPT09IHVuZGVmaW5lZCkge1xuXHRcdC8vIE5vIHNlbGVjdGlvbjogZnJlZSBsb25nIGNvbnRleHQgZGVmYXVsdHMgdG8gdGhlIGZ1bGwgd2luZG93OyBvdGhlciBtb2RlbHMgc3RheSBvbiB0aGUgU0RLIGRlZmF1bHQgdGllci5cblx0XHRyZXR1cm4gZnJlZUxvbmdDb250ZXh0ID8gJ2xvbmdfY29udGV4dCcgOiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc2VsZWN0ZWRXaW5kb3cgPSBOdW1iZXIoY29udGV4dFNpemUpO1xuXHRpZiAoIU51bWJlci5pc0Zpbml0ZShzZWxlY3RlZFdpbmRvdykgfHwgdHlwZW9mIGxvbmdDb250ZXh0V2luZG93ICE9PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHNlbGVjdGVkV2luZG93ID49IGxvbmdDb250ZXh0V2luZG93ID8gJ2xvbmdfY29udGV4dCcgOiAnZGVmYXVsdCc7XG59XG5cbi8qKlxuICogUmVzb2x2ZSB0aGUgQllPSyBwcm92aWRlci9tb2RlbCBzZXNzaW9uIGNvbmZpZyBmb3IgYHNlc3Npb25JZGAgZnJvbSB0aGVcbiAqIHJlbmRlcmVyJ3MgYWN0aXZlIGJyaWRnZS4gUmV0dXJucyBlbXB0eSBcdTIwMTQgdGhlIHNlc3Npb24gbGF1bmNoZXMgd2l0aG91dCBCWU9LXG4gKiBtb2RlbHMgXHUyMDE0IHdoZW4gQllPSyBpcyBnYXRlZCBvZmYgKG5vIGFjdGl2ZSBicmlkZ2UpLCB3aGVuIHRoZSByZW5kZXJlciByZXBvcnRzXG4gKiBubyBCWU9LIG1vZGVscywgb3Igd2hlbiBlbnVtZXJhdGlvbiBmYWlsczsgYHN0YXJ0UHJveHlgIGlzIGludm9rZWQgb25seSBvbmNlXG4gKiBhdCBsZWFzdCBvbmUgbW9kZWwgaXMgcHJlc2VudC5cbiAqXG4gKiBFYWNoIHZlbmRvciBtYXBzIHRvIG9uZSBgdHlwZTogJ29wZW5haSdgIC8gYHdpcmVBcGk6ICdyZXNwb25zZXMnYCBwcm92aWRlclxuICogd2hvc2UgYGJhc2VVcmxgIHBvaW50cyBhdCB0aGUgcHJveHkgYW5kIGF1dGhlbnRpY2F0ZXMgd2l0aCB0aGUgc2Vzc2lvbi1zY29wZWRcbiAqIGBCZWFyZXIgPG5vbmNlPi48c2Vzc2lvbklkPmA7IGVhY2ggbW9kZWwgaXMgc3VyZmFjZWQgdW5kZXIgdGhlXG4gKiBwcm92aWRlci1xdWFsaWZpZWQgc2VsZWN0aW9uIGlkIGB2ZW5kb3IvW2dyb3VwL11pZGAsIG1hdGNoaW5nIHdoYXQgdGhlIHJlbmRlcmVyJ3NcbiAqIGBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyYCByZXNvbHZlcy5cbiAqXG4gKiBFeHRyYWN0ZWQgZnJvbSB7QGxpbmsgQ29waWxvdFNlc3Npb25MYXVuY2hlcn0gc28gdGhlIHN5bnRoZXNpcyBhbmQgZ2F0aW5nIGFyZVxuICogdW5pdC10ZXN0YWJsZSB3aXRob3V0IGluc3RhbnRpYXRpbmcgdGhlIGxhdW5jaGVyOyB0aGUgbGF1bmNoZXIgcGFzc2VzIGFcbiAqIGBzdGFydFByb3h5YCB0aHVuayB0aGF0IG1lbW9pemVzIHRoZSBzaW5nbGUgc2hhcmVkIHByb3h5IGhhbmRsZS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZyhcblx0c2Vzc2lvbklkOiBzdHJpbmcsXG5cdGJyaWRnZVJlZ2lzdHJ5OiBJQnlva0xtQnJpZGdlUmVnaXN0cnksXG5cdHN0YXJ0UHJveHk6ICgpID0+IFByb21pc2U8SUJ5b2tMbVByb3h5SGFuZGxlPixcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG4pOiBQcm9taXNlPHsgcHJvdmlkZXJzPzogTmFtZWRQcm92aWRlckNvbmZpZ1tdOyBtb2RlbHM/OiBQcm92aWRlck1vZGVsQ29uZmlnW10gfT4ge1xuXHQvLyBTdXJmYWNlIHRoZSBzZXJ2aW5nIHdpbmRvdydzIEJZT0sgbW9kZWxzLiBUaGUgcmVnaXN0cnkgZG9lcyBub3QgdW5pb25cblx0Ly8gd2luZG93cycgbW9kZWwgc2V0cyBcdTIwMTQgYWxsIHNlcnZpbmcgd2luZG93cyBleHBvc2UgdGhlIHNhbWUgc2V0LCBzbyBpdCBwaWNrc1xuXHQvLyBvbmUgKHNlZSBgSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5YCkgYW5kIHRoZSBwcm94eSByb3V0ZXMgaW5mZXJlbmNlIHRoZXJlLlxuXHRsZXQgYnlva01vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdO1xuXHR0cnkge1xuXHRcdGJ5b2tNb2RlbHMgPSBbLi4uYnJpZGdlUmVnaXN0cnkuZ2V0TW9kZWxzKCldO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGVudW1lcmF0ZSBCWU9LIG1vZGVscyBmcm9tIHJlbmRlcmVyIGJyaWRnZXNgLCBlcnIpO1xuXHRcdHJldHVybiB7fTtcblx0fVxuXHRpZiAoYnlva01vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0Ly8gRGVkdXBsaWNhdGUgYnkgZ3JvdXAtcXVhbGlmaWVkIHNlbGVjdGlvbiBpZCAoYHZlbmRvci9bZ3JvdXAvXWlkYCkuIFRoZSBzYW1lIEJZT0sgbW9kZWwgY2FuIGJlXG5cdC8vIHJlcG9ydGVkIG1vcmUgdGhhbiBvbmNlIFx1MjAxNCBlLmcuIHdoZW4gdHdvIHJlbmRlcmVyIGJyaWRnZXMgYXJlIHRyYW5zaWVudGx5XG5cdC8vIHNlcnZpbmcgZHVyaW5nIGEgd2luZG93IGhhbmQtb2ZmIChjb250aW51aW5nIGEgY2hhdCBpbnRvIGEgbmV3IHNlc3Npb24pIFx1MjAxNFxuXHQvLyBhbmQgdGhlIHJ1bnRpbWUgcmVqZWN0cyBhIHNlc3Npb24gY29uZmlnIHdpdGggZHVwbGljYXRlIEJZT0sgbW9kZWxcblx0Ly8gc2VsZWN0aW9uIGlkcyAoXCJEdXBsaWNhdGUgQllPSyBtb2RlbCBzZWxlY3Rpb24gaWQgLi4uXCIpLlxuXHRjb25zdCBzZWVuU2VsZWN0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGJ5b2tNb2RlbHMgPSBieW9rTW9kZWxzLmZpbHRlcihtID0+IHtcblx0XHRjb25zdCBzZWxlY3Rpb25JZCA9IGAke20udmVuZG9yfS8ke2dldEJ5b2tMbVNlbGVjdGlvbk1vZGVsSWQobSl9YDtcblx0XHRpZiAoc2VlblNlbGVjdGlvbklkcy5oYXMoc2VsZWN0aW9uSWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHNlZW5TZWxlY3Rpb25JZHMuYWRkKHNlbGVjdGlvbklkKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSk7XG5cdC8vIGBzdGFydFByb3h5YCBiaW5kcyBhIGxvY2FsIGxvb3BiYWNrIGxpc3RlbmVyIFx1MjAxNCB1bmxpa2VseSB0byBmYWlsLCBidXQgaXRcblx0Ly8gbXVzdCBuZXZlciBicmVhayBzZXNzaW9uIG1hdGVyaWFsaXphdGlvbiAod2hpY2ggZmlyZXMgdGhlIGNyb3NzLXdpbmRvd1xuXHQvLyBgc2Vzc2lvbkFkZGVkYCBicm9hZGNhc3QpLiBEZWdyYWRlIHRvIG5vIEJZT0sgY29uZmlnIG9uIGZhaWx1cmUuXG5cdGxldCBoYW5kbGU6IElCeW9rTG1Qcm94eUhhbmRsZTtcblx0dHJ5IHtcblx0XHRoYW5kbGUgPSBhd2FpdCBzdGFydFByb3h5KCk7XG5cdH0gY2F0Y2ggKGVycikge1xuXHRcdGxvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBGYWlsZWQgdG8gc3RhcnQgQllPSyBsb29wYmFjayBwcm94eWAsIGVycik7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cdGNvbnN0IHByb3ZpZGVyczogTmFtZWRQcm92aWRlckNvbmZpZ1tdID0gWy4uLm5ldyBTZXQoYnlva01vZGVscy5tYXAobSA9PiBtLnZlbmRvcikpXS5tYXAodmVuZG9yID0+ICh7XG5cdFx0bmFtZTogdmVuZG9yLFxuXHRcdHR5cGU6ICdvcGVuYWknLFxuXHRcdHdpcmVBcGk6ICdyZXNwb25zZXMnLFxuXHRcdGJhc2VVcmw6IGhhbmRsZS5wcm92aWRlckJhc2VVcmwodmVuZG9yKSxcblx0XHRiZWFyZXJUb2tlbjogYCR7aGFuZGxlLm5vbmNlfS4ke3Nlc3Npb25JZH1gLFxuXHR9KSk7XG5cdGNvbnN0IG1vZGVsczogUHJvdmlkZXJNb2RlbENvbmZpZ1tdID0gYnlva01vZGVscy5tYXAobSA9PiAoe1xuXHRcdGlkOiBnZXRCeW9rTG1TZWxlY3Rpb25Nb2RlbElkKG0pLFxuXHRcdHByb3ZpZGVyOiBtLnZlbmRvcixcblx0XHQuLi4obS5uYW1lICE9PSB1bmRlZmluZWQgPyB7IG5hbWU6IG0ubmFtZSB9IDoge30pLFxuXHRcdC4uLihtLm1heENvbnRleHRXaW5kb3dUb2tlbnMgIT09IHVuZGVmaW5lZCA/IHsgbWF4Q29udGV4dFdpbmRvd1Rva2VuczogbS5tYXhDb250ZXh0V2luZG93VG9rZW5zIH0gOiB7fSksXG5cdH0pKTtcblx0bG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFdpcmVkICR7bW9kZWxzLmxlbmd0aH0gQllPSyBtb2RlbChzKSBhY3Jvc3MgJHtwcm92aWRlcnMubGVuZ3RofSBwcm92aWRlcihzKSB2aWEgbG9vcGJhY2sgcHJveHkgJHtoYW5kbGUuYmFzZVVybH1gKTtcblx0cmV0dXJuIHsgcHJvdmlkZXJzLCBtb2RlbHMgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENvcGlsb3RTZXNzaW9uTGF1bmNoZXIgaW1wbGVtZW50cyBJQ29waWxvdFNlc3Npb25MYXVuY2hlciB7XG5cblx0LyoqXG5cdCAqIE1lbW9pemVkIGhhbmRsZSBmb3IgdGhlIHNpbmdsZSBzaGFyZWQgQllPSyBsb29wYmFjayBwcm94eSwgc3RhcnRlZCBsYXppbHlcblx0ICogb24gdGhlIGZpcnN0IHNlc3Npb24gbGF1bmNoIHRoYXQgc3VyZmFjZXMgQllPSyBtb2RlbHMgKHNlZVxuXHQgKiB7QGxpbmsgX3Jlc29sdmVCeW9rU2Vzc2lvbkNvbmZpZ30pLiBIZWxkIGFzIGEgcHJvbWlzZSBzbyBjb25jdXJyZW50XG5cdCAqIGxhdW5jaGVzIHNoYXJlIG9uZSBiaW5kLiBSZWxlYXNlZCBhbmQgY2xlYXJlZCBieVxuXHQgKiB7QGxpbmsgZGlzcG9zZUJ5b2tQcm94eUhhbmRsZX0gd2hlbiB0aGUgb3duaW5nIENvcGlsb3QgY2xpZW50L3J1bnRpbWUgaXNcblx0ICogc3RvcHBlZCwgc28gdGhlIG5leHQgc3RhcnQgbWludHMgYSBmcmVzaCBub25jZS5cblx0ICovXG5cdHByaXZhdGUgX2J5b2tQcm94eUhhbmRsZTogUHJvbWlzZTxJQnlva0xtUHJveHlIYW5kbGU+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hbmFnZWRTZXR0aW5nc1NlcnZpY2U6IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsTWFuYWdlcjogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlcixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQnlva0xtUHJveHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2J5b2tMbVByb3h5U2VydmljZTogSUJ5b2tMbVByb3h5U2VydmljZSxcblx0XHRASUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IHByaXZhdGUgcmVhZG9ubHkgX2J5b2tMbUJyaWRnZVJlZ2lzdHJ5OiBJQnlva0xtQnJpZGdlUmVnaXN0cnksXG5cdFx0QElBZ2VudEhvc3RPVGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vdGVsU2VydmljZTogSUFnZW50SG9zdE9UZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGxhdW5jaChwbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4sIHJ1bnRpbWU6IElDb3BpbG90U2Vzc2lvblJ1bnRpbWUpOiBQcm9taXNlPENvcGlsb3RTZXNzaW9uV3JhcHBlcj4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IHRoaXMuX2J1aWxkU2Vzc2lvbkNvbmZpZyhwbGFuLCBydW50aW1lKTtcblx0XHRjb25zdCBzYW5kYm94Q29uZmlnID0gdGhpcy5fY29tcHV0ZVNhbmRib3hDb25maWcoKTtcblx0XHRpZiAocGxhbi5raW5kID09PSAnY3JlYXRlJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVNlc3Npb24ocGxhbiwgY29uZmlnLCBzYW5kYm94Q29uZmlnKTtcblx0XHR9XG5cblx0XHRsZXQgZmFsbGJhY2tQbGFuID0gcGxhbjtcblx0XHRsZXQgZmFsbGJhY2tDb25maWcgPSBjb25maWc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBDYWxsaW5nIFNESyByZXN1bWVTZXNzaW9uLi4uYCk7XG5cdFx0XHRjb25zdCByYXcgPSBhd2FpdCB0aGlzLl93aXRoVHJhY2VDb250ZXh0KHBsYW4uc2Vzc2lvbklkLCAoKSA9PiBwbGFuLmNsaWVudC5yZXN1bWVTZXNzaW9uKHBsYW4uc2Vzc2lvbklkLCBjb25maWcpKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTREsgcmVzdW1lU2Vzc2lvbiBzdWNjZWVkZWQgYWZ0ZXIgJHtzdG9wV2F0Y2guZWxhcHNlZCgpfW1zYCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmluYWxpemVTZXNzaW9uKHJhdywgc2FuZGJveENvbmZpZywgcGxhbi5zZXNzaW9uSWQsIHBsYW4uZmFsbGJhY2subW9kZWw/LmlkKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGxldCByZXN1bWVFcnJvciA9IGVycjtcblx0XHRcdGNvbnN0IGVyckNvZGUgPSBnZXRDb3BpbG90U2RrRXJyb3JDb2RlKHJlc3VtZUVycm9yKTtcblx0XHRcdGNvbnN0IGVyck1zZyA9IGdldEVycm9yTWVzc2FnZShyZXN1bWVFcnJvcik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTREsgcmVzdW1lU2Vzc2lvbiBmYWlsZWQ6IGNvZGU9JHtlcnJDb2RlfSwgbWVzc2FnZT0ke2Vyck1zZ31gKTtcblx0XHRcdGlmIChwbGFuLnJlc29sdmVkQWdlbnROYW1lICYmIGlzQ3VzdG9tQWdlbnROb3RGb3VuZEVycm9yKHJlc3VtZUVycm9yKSkge1xuXHRcdFx0XHRmYWxsYmFja1BsYW4gPSB7IC4uLnBsYW4sIHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0ZmFsbGJhY2tDb25maWcgPSB7IC4uLmNvbmZpZywgYWdlbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTdG9yZWQgY3VzdG9tIGFnZW50ICcke3BsYW4ucmVzb2x2ZWRBZ2VudE5hbWV9JyB3YXMgbm90IGZvdW5kOyByZXRyeWluZyByZXN1bWUgd2l0aG91dCBhIGN1c3RvbSBhZ2VudGApO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHRoaXMuX3dpdGhUcmFjZUNvbnRleHQoZmFsbGJhY2tQbGFuLnNlc3Npb25JZCwgKCkgPT4gZmFsbGJhY2tQbGFuLmNsaWVudC5yZXN1bWVTZXNzaW9uKGZhbGxiYWNrUGxhbi5zZXNzaW9uSWQsIGZhbGxiYWNrQ29uZmlnKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmFsaXplU2Vzc2lvbihyYXcsIHNhbmRib3hDb25maWcsIHBsYW4uc2Vzc2lvbklkLCBmYWxsYmFja1BsYW4uZmFsbGJhY2subW9kZWw/LmlkKTtcblx0XHRcdFx0fSBjYXRjaCAocmV0cnlFcnIpIHtcblx0XHRcdFx0XHRyZXN1bWVFcnJvciA9IHJldHJ5RXJyO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIFNESyByZXN1bWVTZXNzaW9uIHdpdGhvdXQgY3VzdG9tIGFnZW50IGZhaWxlZDogY29kZT0ke2dldENvcGlsb3RTZGtFcnJvckNvZGUocmV0cnlFcnIpfSwgbWVzc2FnZT0ke2dldEVycm9yTWVzc2FnZShyZXRyeUVycil9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIE9ubHkgYSBzZXNzaW9uIHdpdGggbm8gZXZlbnRzIG9uIGRpc2sgbWF5IGZhbGwgYmFjayB0byBjcmVhdGluZyBhXG5cdFx0XHQvLyBmcmVzaCBvbmUgdW5kZXIgdGhlIHNhbWUgSUQgKHNlZWRpbmcgbW9kZWwgJiB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdFx0Ly8gZnJvbSBzdG9yZWQgbWV0YWRhdGEpOyBldmVyeSBvdGhlciBmYWlsdXJlIHByb3BhZ2F0ZXMuXG5cdFx0XHRpZiAoIXNob3VsZENyZWF0ZUVtcHR5U2Vzc2lvbkFmdGVyUmVzdW1lRXJyb3IocmVzdW1lRXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIFJlc3VtZSBmYWlsdXJlIGRvZXMgbm90IGluZGljYXRlIGFuIGVtcHR5IHNlc3Npb247IHN1cmZhY2luZyBpdCBpbnN0ZWFkIG9mIHJlcGxhY2luZyB0aGUgc2Vzc2lvbiB3aXRoIGFuIGVtcHR5IG9uZWApO1xuXHRcdFx0XHR0aHJvdyByZXN1bWVFcnJvcjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gUmVzdW1lIHJlcG9ydGVkIG5vIHNlc3Npb24gaGlzdG9yeTsgZmFsbGluZyBiYWNrIHRvIGNyZWF0ZVNlc3Npb24gd2l0aCBzYW1lIElEYCk7XG5cdFx0XHRjb25zdCB3cmFwcGVyID0gYXdhaXQgdGhpcy5fY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdC4uLmZhbGxiYWNrUGxhbixcblx0XHRcdFx0a2luZDogJ2NyZWF0ZScsXG5cdFx0XHRcdG1vZGVsOiBmYWxsYmFja1BsYW4uZmFsbGJhY2subW9kZWwsXG5cdFx0XHRcdGxvbmdDb250ZXh0V2luZG93OiBmYWxsYmFja1BsYW4uZmFsbGJhY2subG9uZ0NvbnRleHRXaW5kb3csXG5cdFx0XHRcdGZyZWVMb25nQ29udGV4dDogZmFsbGJhY2tQbGFuLmZhbGxiYWNrLmZyZWVMb25nQ29udGV4dCxcblx0XHRcdH0sIGZhbGxiYWNrQ29uZmlnLCBzYW5kYm94Q29uZmlnKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIEZhbGxiYWNrIGNyZWF0ZVNlc3Npb24gc3VjY2VlZGVkYCk7XG5cdFx0XHRyZXR1cm4gd3JhcHBlcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93aXRoVHJhY2VDb250ZXh0PFQ+KHNlc3Npb25JZDogc3RyaW5nLCBmbjogKCkgPT4gVCk6IFQge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgc2Vzc2lvbklkKS50b1N0cmluZygpO1xuXHRcdHJldHVybiB0aGlzLl9vdGVsU2VydmljZS53aXRoVHJhY2VDb250ZXh0KHRoaXMuX290ZWxTZXJ2aWNlLmdldFNlc3Npb25UcmFjZUNvbnRleHQoc2Vzc2lvbklkLCBzZXNzaW9uVXJpKSwgZm4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlU2Vzc2lvbihwbGFuOiBJQ29waWxvdENyZWF0ZVNlc3Npb25MYXVuY2hQbGFuLCBjb25maWc6IFJlc3VtZVNlc3Npb25Db25maWcsIHNhbmRib3hDb25maWc6IENvcGlsb3RTYW5kYm94Q29uZmlnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxDb3BpbG90U2Vzc2lvbldyYXBwZXI+IHtcblx0XHRjb25zdCByYXcgPSBhd2FpdCB0aGlzLl93aXRoVHJhY2VDb250ZXh0KHBsYW4uc2Vzc2lvbklkLCAoKSA9PiBwbGFuLmNsaWVudC5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdC4uLmNvbmZpZyxcblx0XHRcdHNlc3Npb25JZDogcGxhbi5zZXNzaW9uSWQsXG5cdFx0XHRzdHJlYW1pbmc6IHRydWUsXG5cdFx0XHRtb2RlbDogcGxhbi5tb2RlbD8uaWQsXG5cdFx0XHRyZWFzb25pbmdFZmZvcnQ6IHJlc29sdmVDb3BpbG90UmVhc29uaW5nRWZmb3J0KHBsYW4ubW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBwbGFuLnNlc3Npb25JZCksXG5cdFx0XHRjb250ZXh0VGllcjogZ2V0Q29waWxvdENvbnRleHRUaWVyKHBsYW4ubW9kZWwsIHBsYW4ubG9uZ0NvbnRleHRXaW5kb3csIHBsYW4uZnJlZUxvbmdDb250ZXh0KSxcblx0XHRcdC4uLihwbGFuLnJlc29sdmVkQWdlbnROYW1lID8geyBhZ2VudDogcGxhbi5yZXNvbHZlZEFnZW50TmFtZSB9IDoge30pLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGxhbi53b3JraW5nRGlyZWN0b3J5Py5mc1BhdGgsXG5cdFx0fSkpO1xuXHRcdHJldHVybiB0aGlzLl9maW5hbGl6ZVNlc3Npb24ocmF3LCBzYW5kYm94Q29uZmlnLCBwbGFuLnNlc3Npb25JZCwgcGxhbi5tb2RlbD8uaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluYWxpemVTZXNzaW9uKHJhdzogQ29waWxvdFNlc3Npb25XcmFwcGVyWydzZXNzaW9uJ10sIHNhbmRib3hDb25maWc6IENvcGlsb3RTYW5kYm94Q29uZmlnIHwgdW5kZWZpbmVkLCBzZXNzaW9uSWQ6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxDb3BpbG90U2Vzc2lvbldyYXBwZXI+IHtcblx0XHRhd2FpdCB0aGlzLl9hcHBseVNhbmRib3hDb25maWcocmF3LCBzYW5kYm94Q29uZmlnLCBzZXNzaW9uSWQpO1xuXHRcdC8vIFRPRE86IFJlbW92ZSB0aGVzZSBwb3N0LWxhdW5jaCB1cGRhdGVzIG9uY2UgdGhlIFNESyBleHBvc2VzIHZlcmJvc2l0eSBhbmRcblx0XHQvLyByZWFzb25pbmdTdW1tYXJ5IGluIFNlc3Npb25Db25maWcsIGFsb25nc2lkZSBsYXVuY2ggb3B0aW9ucyBzdWNoIGFzIHJlYXNvbmluZ0VmZm9ydC5cblx0XHRpZiAoaXNHcHQ1Nk1vZGVsKG1vZGVsSWQpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hcHBseUdwdDU2Q3VzdG9taXphdGlvbnMocmF3LCBzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IENvcGlsb3RTZXNzaW9uV3JhcHBlcihyYXcpO1xuXHR9XG5cblx0LyoqIEFwcGxpZXMgdGhlIHBvc3QtbGF1bmNoIHNlc3Npb24gb3B0aW9ucyB1c2VkIGJ5IEdQVC01LjYgbW9kZWxzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9hcHBseUdwdDU2Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogQ29waWxvdFNlc3Npb25XcmFwcGVyWydzZXNzaW9uJ10sIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fYXBwbHlWZXJib3NpdHkoc2Vzc2lvbiwgJ21lZGl1bScsIHNlc3Npb25JZCk7XG5cdFx0Y29uc3QgcmVhc29uaW5nU3VtbWFyeUVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5SZWFzb25pbmdTdW1tYXJ5KSA9PT0gdHJ1ZTtcblx0XHRpZiAocmVhc29uaW5nU3VtbWFyeUVuYWJsZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FwcGx5UmVhc29uaW5nU3VtbWFyeShzZXNzaW9uLCAnY29uY2lzZScsIHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFNldHMgb3V0cHV0IHZlcmJvc2l0eSBhZnRlciBzZXNzaW9uIGNyZWF0aW9uLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9hcHBseVZlcmJvc2l0eShzZXNzaW9uOiBDb3BpbG90U2Vzc2lvbldyYXBwZXJbJ3Nlc3Npb24nXSwgdmVyYm9zaXR5OiBWZXJib3NpdHksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24ucnBjLm9wdGlvbnMudXBkYXRlKHsgdmVyYm9zaXR5IH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEFwcGxpZWQgJyR7dmVyYm9zaXR5fScgdmVyYm9zaXR5YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGFwcGx5ICcke3ZlcmJvc2l0eX0nIHZlcmJvc2l0eWAsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFNldHMgcmVhc29uaW5nIHN1bW1hcnkgZGV0YWlsIGFmdGVyIHNlc3Npb24gY3JlYXRpb24uICovXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5UmVhc29uaW5nU3VtbWFyeShzZXNzaW9uOiBDb3BpbG90U2Vzc2lvbldyYXBwZXJbJ3Nlc3Npb24nXSwgcmVhc29uaW5nU3VtbWFyeTogUmVhc29uaW5nU3VtbWFyeSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5ycGMub3B0aW9ucy51cGRhdGUoeyByZWFzb25pbmdTdW1tYXJ5IH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEFwcGxpZWQgJyR7cmVhc29uaW5nU3VtbWFyeX0nIHJlYXNvbmluZyBzdW1tYXJ5YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGFwcGx5ICcke3JlYXNvbmluZ1N1bW1hcnl9JyByZWFzb25pbmcgc3VtbWFyeWAsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgdGhlIFNESy1zaGFwZWQgc2FuZGJveCBwb2xpY3kgdG8gcHVzaCB0byB0aGUgcnVudGltZSBmb3IgdGhlXG5cdCAqIFNESydzIGJ1aWx0LWluIHNoZWxsIHRvb2wuXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB7QGxpbmsgQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2x9XG5cdCAqIGlzIE9OIFx1MjAxNCBpbiB0aGF0IGNhc2UgdGhlIEFnZW50SG9zdCBwcm92aWRlcyBpdHMgb3duIHNoZWxsIHRvb2xzLCB3aGljaFxuXHQgKiB3cmFwIGNvbW1hbmRzIHZpYSB0aGUgaG9zdCB0ZXJtaW5hbCBzYW5kYm94IGVuZ2luZSwgc28gbm8gU0RLLXNpZGVcblx0ICogc2FuZGJveCBwb2xpY3kgaXMgbmVlZGVkLiBPdGhlcndpc2UgdGhlIHBvbGljeSBpcyBkZXJpdmVkIGZyb20gdGhlXG5cdCAqIGhvc3QncyBgc2FuZGJveGAgY29uZmlnIGJhZyAoZm9yd2FyZGVkIGZyb20gdGhlIHdvcmtiZW5jaCdzXG5cdCAqIGBjaGF0LmFnZW50LnNhbmRib3guKmAgc2V0dGluZ3MpLCBtaXJyb3Jpbmcgd2hhdFxuXHQgKiBgYnVpbGRTYW5kYm94Q29uZmlnRm9yQ0xJYCBkb2VzIGZvciB0aGUgQ29waWxvdCBleHRlbnNpb24ncyBDTEkgcGF0aC5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVTYW5kYm94Q29uZmlnKCk6IENvcGlsb3RTYW5kYm94Q29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpID09PSB0cnVlO1xuXHRcdGlmIChlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBidWlsZFNhbmRib3hDb25maWdGb3JTZGsocHJvY2Vzcy5wbGF0Zm9ybSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHNhbmRib3hDb25maWdTY2hlbWEsIEFnZW50SG9zdFNhbmRib3hDb25maWdLZXkuU2FuZGJveCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmQgdGhlIFNESy1zaGFwZWQgc2FuZGJveCBwb2xpY3kgdG8gdGhlIHJ1bnRpbWUgdmlhXG5cdCAqIGBzZXNzaW9uLm9wdGlvbnMudXBkYXRlYCwgaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIHNlc3Npb24gaXMgY3JlYXRlZCBvclxuXHQgKiByZXN1bWVkLlxuXHQgKlxuXHQgKiBOby1vcCB3aGVuIHtAbGluayBfY29tcHV0ZVNhbmRib3hDb25maWd9IHJldHVybmVkIGB1bmRlZmluZWRgIChjdXN0b21cblx0ICogdGVybWluYWwgdG9vbCBlbmFibGVkLCBvciB0aGUgaG9zdCBzYW5kYm94IGNvbmZpZyBldmFsdWF0ZXMgdG8gZGlzYWJsZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlTYW5kYm94Q29uZmlnKHNlc3Npb246IENvcGlsb3RTZXNzaW9uV3JhcHBlclsnc2Vzc2lvbiddLCBzYW5kYm94Q29uZmlnOiBDb3BpbG90U2FuZGJveENvbmZpZyB8IHVuZGVmaW5lZCwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXNhbmRib3hDb25maWcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24ucnBjLm9wdGlvbnMudXBkYXRlKHsgc2FuZGJveENvbmZpZyB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBBcHBsaWVkIFNESyBzYW5kYm94Q29uZmlnIHZpYSBzZXNzaW9uLm9wdGlvbnMudXBkYXRlYCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGFwcGx5IFNESyBzYW5kYm94Q29uZmlnYCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogTGF1bmNoZXItYm91bmQgd3JhcHBlciBvdmVyIHtAbGluayByZXNvbHZlQnlva1Nlc3Npb25Db25maWd9OiBzdXBwbGllcyB0aGVcblx0ICogYWN0aXZlIGJyaWRnZSByZWdpc3RyeSBhbmQgYSBgc3RhcnRQcm94eWAgdGh1bmsgdGhhdCBtZW1vaXplcyB0aGUgc2luZ2xlXG5cdCAqIHNoYXJlZCBwcm94eSBoYW5kbGUgZm9yIHRoaXMgbGF1bmNoZXIgKHN0YXJ0ZWQgbGF6aWx5IG9uIGZpcnN0IHVzZSkuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHsgcHJvdmlkZXJzPzogTmFtZWRQcm92aWRlckNvbmZpZ1tdOyBtb2RlbHM/OiBQcm92aWRlck1vZGVsQ29uZmlnW10gfT4ge1xuXHRcdHJldHVybiByZXNvbHZlQnlva1Nlc3Npb25Db25maWcoc2Vzc2lvbklkLCB0aGlzLl9ieW9rTG1CcmlkZ2VSZWdpc3RyeSwgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9ieW9rUHJveHlIYW5kbGUpIHtcblx0XHRcdFx0dGhpcy5fYnlva1Byb3h5SGFuZGxlID0gdGhpcy5fYnlva0xtUHJveHlTZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnlva1Byb3h5SGFuZGxlO1xuXHRcdH0sIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2UgdGhlIG1lbW9pemVkIEJZT0sgbG9vcGJhY2sgcHJveHkgaGFuZGxlIChpZiBhbnkpIGFuZCBjbGVhciBpdCBzb1xuXHQgKiB0aGUgbmV4dCBzZXNzaW9uIGxhdW5jaCBtaW50cyBhIGZyZXNoIG5vbmNlLiBJZGVtcG90ZW50LlxuXHQgKlxuXHQgKiAqKk93bmVyc2hpcCBpbnZhcmlhbnQuKiogVGhlIGNhbGxlciBNVVNUIHN0b3AgdGhlIENvcGlsb3QgY2xpZW50L3J1bnRpbWVcblx0ICogc3VicHJvY2VzcyBiZWZvcmUgaW52b2tpbmcgdGhpczogZGlzcG9zaW5nIHRoZSBoYW5kbGUgZHJvcHMgdGhlIHByb3h5J3Ncblx0ICogcmVmY291bnQgYW5kIG1heSByZWJpbmQgaXQgb24gYSBkaWZmZXJlbnQgcG9ydC9ub25jZSwgc28gYSBzdGlsbC1ydW5uaW5nXG5cdCAqIHN1YnByb2Nlc3Mgd291bGQgc2lsZW50bHkgbG9zZSBpdHMgZW5kcG9pbnQgXHUyMDE0IHNlZSB7QGxpbmsgSUJ5b2tMbVByb3h5SGFuZGxlfS5cblx0ICogSW52b2tlZCBmcm9tIGBDb3BpbG90QWdlbnQuX3N0b3BDbGllbnRgIC8gYENvcGlsb3RBZ2VudC5zaHV0ZG93bmAgYWZ0ZXIgdGhlXG5cdCAqIGNsaWVudCBoYXMgc3RvcHBlZC5cblx0ICovXG5cdGFzeW5jIGRpc3Bvc2VCeW9rUHJveHlIYW5kbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYnlva1Byb3h5SGFuZGxlO1xuXHRcdHRoaXMuX2J5b2tQcm94eUhhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0KGF3YWl0IGhhbmRsZSkuZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gVGhlIGxhenkgYHN0YXJ0KClgIHJlamVjdGVkOyB0aGVyZSBpcyBub3RoaW5nIHRvIHJlbGVhc2UuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRTZXNzaW9uQ29uZmlnKHBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiwgcnVudGltZTogSUNvcGlsb3RTZXNzaW9uUnVudGltZSk6IFByb21pc2U8UmVzdW1lU2Vzc2lvbkNvbmZpZz4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBwbGFuLnNuYXBzaG90LnBsdWdpbnM7XG5cdFx0Ly8gU3ludGhlc2l6ZSBCWU9LIHByb3ZpZGVyL21vZGVsIGNvbmZpZyAoZW1wdHkgd2hlbiBCWU9LIGlzIGdhdGVkIG9mZiBvciB0aGVcblx0XHQvLyByZW5kZXJlciByZXBvcnRzIG5vIEJZT0sgbW9kZWxzKSwgbWVyZ2VkIGludG8gdGhlIHJldHVybmVkIGNvbmZpZyBzbyBib3RoXG5cdFx0Ly8gY3JlYXRlU2Vzc2lvbiBhbmQgcmVzdW1lU2Vzc2lvbiBhZHZlcnRpc2UgdGhlIG1vZGVscyB0byB0aGUgcnVudGltZS5cblx0XHRjb25zdCBieW9rID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJ5b2tTZXNzaW9uQ29uZmlnKHBsYW4uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5FbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpID09PSB0cnVlO1xuXHRcdGxldCBzaGVsbFRvb2xzOiBBd2FpdGVkPFJldHVyblR5cGU8dHlwZW9mIGNyZWF0ZVNoZWxsVG9vbHM+PiA9IFtdO1xuXHRcdGlmIChlbmFibGVDdXN0b21UZXJtaW5hbFRvb2wpIHtcblx0XHRcdGlmICghcGxhbi5zaGVsbE1hbmFnZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTaGVsbE1hbmFnZXIgaXMgcmVxdWlyZWQgdG8gbGF1bmNoIENvcGlsb3Qgc2Vzc2lvbiAnJHtwbGFuLnNlc3Npb25JZH0nYCk7XG5cdFx0XHR9XG5cdFx0XHRzaGVsbFRvb2xzID0gYXdhaXQgY3JlYXRlU2hlbGxUb29scyhwbGFuLnNoZWxsTWFuYWdlciwgdGhpcy5fdGVybWluYWxNYW5hZ2VyLCB0aGlzLl9sb2dTZXJ2aWNlLCByZXF1ZXN0ID0+IHJ1bnRpbWUucmVxdWVzdFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbihyZXF1ZXN0KSk7XG5cdFx0fVxuXHRcdC8vIFJlbHkgb24gdGhlIFNESyB0byBkaXNjb3ZlciBtb3N0IGFnZW50cy9za2lsbHMvZXRjLiBmcm9tIGBwbHVnaW5EaXJlY3Rvcmllc2Bcblx0XHQvLyBpbnN0ZWFkIG9mIGZlZWRpbmcgdGhlbSBleHBsaWNpdGx5LCB0byBhdm9pZCBkdXBsaWNhdGVzLiBDdXN0b20gYWdlbnRzIGFyZSB0aGVcblx0XHQvLyBleGNlcHRpb246IHRoZSBTREsgdmFsaWRhdGVzIHRoZSBzZXNzaW9uLXN0YXJ0IGBhZ2VudDpgIGFnYWluc3QgYGN1c3RvbUFnZW50c2Bcblx0XHQvLyBieSBuYW1lLCBzbyB0aGUgc2VsZWN0ZWQgYWdlbnQgaXMgZm9yY2UtaW5jbHVkZWQgKHNlZSBgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzYCkuXG5cdFx0Y29uc3QgcGx1Z2luc1dpdGhvdXREaXJzID0gcGx1Z2lucy5maWx0ZXIocCA9PiAhcC5wbHVnaW5EaXIgfHwgcC5wbHVnaW5EaXIuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpO1xuXHRcdGNvbnN0IG1jcFNlcnZlcnMgPSBwbHVnaW5zV2l0aG91dERpcnMuZmxhdE1hcChwbHVnaW4gPT4gcGx1Z2luLm1jcFNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiAhcGx1Z2luLmRpc2FibGVkTWNwU2VydmVycz8uaW5jbHVkZXMoc2VydmVyLm5hbWUpKSk7XG5cdFx0Y29uc3QgY3VzdG9tQWdlbnRzID0gYXdhaXQgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzKHBsdWdpbnMsIHBsYW4ucmVzb2x2ZWRBZ2VudE5hbWUsIHRoaXMuX2ZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBza2lsbERpcmVjdG9yaWVzID0gdG9TZGtTa2lsbERpcmVjdG9yaWVzKHBsdWdpbnNXaXRob3V0RGlycy5mbGF0TWFwKHAgPT4gcC5za2lsbHMpKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbkRpcmVjdG9yaWVzID0gdG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzKHBsdWdpbnMuZmxhdE1hcChwID0+IHAuaW5zdHJ1Y3Rpb25zKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBwbGFuLmtpbmQgPT09ICdjcmVhdGUnID8gcGxhbi5tb2RlbCA6IHBsYW4uZmFsbGJhY2subW9kZWw7XG5cdFx0Ly8gS2V5ZWQgYnkgdGhlIHJlYWwsIHVuLWFsaWFzZWQgbW9kZWwgaWQ7IGEgbW9kZWwtbGVzcyBcIkF1dG9cIiBzZXNzaW9uXG5cdFx0Ly8gbWF0Y2hlcyB0aGUgYCpgIGVudHJ5IG9ubHkuXG5cdFx0Y29uc3QgY2FwYWJpbGl0eU92ZXJyaWRlcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBDb3BpbG90Q2xpQ29uZmlnS2V5Lk1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcyk7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IGRlc2NyaWJlTW9kZWxJZChtb2RlbCk7XG5cdFx0Y29uc3QgbW9kZWxGYW1pbHkgPSByZXNvbHZlTW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVGaWVsZChjYXBhYmlsaXR5T3ZlcnJpZGVzLCBtb2RlbD8uaWQsICdmYW1pbHknLCAodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gbm9ybWFsaXplTW9kZWxGYW1pbHlBbGlhcyh2YWx1ZSkgIT09IHVuZGVmaW5lZCwgdmFsdWUgPT4ge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gSlNPTi5zdHJpbmdpZnkodmFsdWUuc2xpY2UoMCwgNDApKSA6IHR5cGVvZiB2YWx1ZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIElnbm9yaW5nIGludmFsaWQgJ2ZhbWlseScgY2FwYWJpbGl0eSBvdmVycmlkZSAke2Rlc2NyaXB0aW9ufSBmb3IgJyR7bW9kZWxJZH0nOyBleHBlY3RlZCBhIG1vZGVsIGlkIG9mIGF0IG1vc3QgMTI4IGNoYXJhY3RlcnNgKTtcblx0XHR9KTtcblx0XHQvLyBSZS1hcHBsaWVkIG9uIGV2ZXJ5IGxhdW5jaCBhbmQgcmVzdW1lLCBidXQgTk9UIG9uIGEgbWlkLXNlc3Npb24gbW9kZWxcblx0XHQvLyBjaGFuZ2U6IGEgc2Vzc2lvbiBrZWVwcyB0aGUgZmlsdGVycyBvZiB0aGUgbW9kZWwgaXQgbGF1bmNoZWQgd2l0aC5cblx0XHRjb25zdCBhdmFpbGFibGVUb29sc092ZXJyaWRlID0gcmVzb2x2ZU1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlRmllbGQoY2FwYWJpbGl0eU92ZXJyaWRlcywgbW9kZWw/LmlkLCAnYXZhaWxhYmxlVG9vbHMnLCAodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgfCByZWFkb25seSBzdHJpbmdbXSA9PiBub3JtYWxpemVUb29sRmlsdGVyUGF0dGVybnModmFsdWUpICE9PSB1bmRlZmluZWQsICgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIElnbm9yaW5nIHVudXNhYmxlICdhdmFpbGFibGVUb29scycgY2FwYWJpbGl0eSBvdmVycmlkZSBmb3IgJyR7bW9kZWxJZH0nOyBleHBlY3RlZCBhbiBhcnJheSBvZiB0b29sIHBhdHRlcm5zYCk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZXhjbHVkZWRUb29sc092ZXJyaWRlID0gcmVzb2x2ZU1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlRmllbGQoY2FwYWJpbGl0eU92ZXJyaWRlcywgbW9kZWw/LmlkLCAnZXhjbHVkZWRUb29scycsICh2YWx1ZSk6IHZhbHVlIGlzIHN0cmluZyB8IHJlYWRvbmx5IHN0cmluZ1tdID0+IG5vcm1hbGl6ZVRvb2xGaWx0ZXJQYXR0ZXJucyh2YWx1ZSkgIT09IHVuZGVmaW5lZCwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gSWdub3JpbmcgdW51c2FibGUgJ2V4Y2x1ZGVkVG9vbHMnIGNhcGFiaWxpdHkgb3ZlcnJpZGUgZm9yICcke21vZGVsSWR9JzsgZXhwZWN0ZWQgYW4gYXJyYXkgb2YgdG9vbCBwYXR0ZXJuc2ApO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGF2YWlsYWJsZVRvb2xzID0gZ2V0VG9vbEZpbHRlck92ZXJyaWRlKGF2YWlsYWJsZVRvb2xzT3ZlcnJpZGUsICdhdmFpbGFibGVUb29scycsIG1vZGVsSWQsIHRoaXMuX2xvZ1NlcnZpY2UsIHBsYW4uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBleGNsdWRlZFRvb2xzID0gZ2V0VG9vbEZpbHRlck92ZXJyaWRlKGV4Y2x1ZGVkVG9vbHNPdmVycmlkZSwgJ2V4Y2x1ZGVkVG9vbHMnLCBtb2RlbElkLCB0aGlzLl9sb2dTZXJ2aWNlLCBwbGFuLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2RrQXZhaWxhYmxlVG9vbHMgPSB0b1Nka1Rvb2xGaWx0ZXJQYXR0ZXJucyhhdmFpbGFibGVUb29scyk7XG5cdFx0Y29uc3Qgc2RrRXhjbHVkZWRUb29scyA9IHRvU2RrVG9vbEZpbHRlclBhdHRlcm5zKGV4Y2x1ZGVkVG9vbHMpO1xuXHRcdGNvbnN0IG1vZGVsQ2FwYWJpbGl0aWVzT3ZlcnJpZGUgPSByZXNvbHZlTW9kZWxDYXBhYmlsaXR5T3ZlcnJpZGVGaWVsZChjYXBhYmlsaXR5T3ZlcnJpZGVzLCBtb2RlbD8uaWQsICdtb2RlbENhcGFiaWxpdGllcycsICh2YWx1ZSk6IHZhbHVlIGlzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0+IGlzT2JqZWN0KHZhbHVlKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3BsYW4uc2Vzc2lvbklkfV0gSWdub3JpbmcgaW52YWxpZCAnbW9kZWxDYXBhYmlsaXRpZXMnIGNhcGFiaWxpdHkgb3ZlcnJpZGUgZm9yICcke21vZGVsSWR9JzsgZXhwZWN0ZWQgYW4gb2JqZWN0YCk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kZWxDYXBhYmlsaXRpZXMgPSBnZXRNb2RlbENhcGFiaWxpdGllc092ZXJyaWRlKG1vZGVsQ2FwYWJpbGl0aWVzT3ZlcnJpZGUsIG1vZGVsSWQsIHRoaXMuX2xvZ1NlcnZpY2UsIHBsYW4uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjbGllbnRUb29sTmFtZXMgPSBmaWx0ZXJDbGllbnRUb29sTmFtZXMoY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90KHBsYW4uc25hcHNob3QpLCBhdmFpbGFibGVUb29scywgZXhjbHVkZWRUb29scyk7XG5cdFx0Ly8gSG9zdC1zaWRlIHJvdXRpbmcgb25seSBcdTIwMTQgdGhlIHByb21wdCBjb250cmlidXRvciBhbmQgdGhlIHRvb2wtc2VhcmNoIGdhdGVcblx0XHQvLyBiZWxvdy4gVGhlIHdpcmUgbW9kZWwgc3RheXMgdGhlIHNlbGVjdGVkIG9uZSwgc28gdGhlIHNlc3Npb24gc3RpbGwgcnVuc1xuXHRcdC8vIG9uIHRoZSByZWFsIG1vZGVsIHdpdGggdGhlIGFsaWFzZWQgZmFtaWx5J3MgcHJvbXB0IGFuZCB0b29sIHByb2ZpbGUuXG5cdFx0Y29uc3QgZWZmZWN0aXZlTW9kZWwgPSBtb2RlbEZhbWlseSA/IHsgLi4ubW9kZWwsIGlkOiBtb2RlbEZhbWlseSB9IDogbW9kZWw7XG5cdFx0aWYgKG1vZGVsRmFtaWx5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBNb2RlbCBjYXBhYmlsaXR5IG92ZXJyaWRlOiByb3V0aW5nIHByb21wdCBmb3IgJyR7ZGVzY3JpYmVNb2RlbElkKG1vZGVsKX0nIGFzIGZhbWlseSAnJHttb2RlbEZhbWlseX0nYCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRvb2xTZWFyY2hBY3RpdmUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5Ub29sU2VhcmNoRW5hYmxlZCkgPT09IHRydWVcblx0XHRcdCYmIGFnZW50SG9zdE1vZGVsU3VwcG9ydHNUb29sU2VhcmNoKGVmZmVjdGl2ZU1vZGVsPy5pZClcblx0XHRcdCYmIGNsaWVudFRvb2xOYW1lcy5oYXMoQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FKTtcblx0XHRjb25zdCB0b29sU2VhcmNoRGVmZXJUaHJlc2hvbGQgPSBub3JtYWxpemVUb29sU2VhcmNoRGVmZXJUaHJlc2hvbGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuVG9vbFNlYXJjaERlZmVyVGhyZXNob2xkKSk7XG5cdFx0Y29uc3QgbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgPSB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnBlcm1pc3Npb25zO1xuXHRcdGNvbnN0IHByb21wdENvbnRleHQ6IElBZ2VudEhvc3RQcm9tcHRDb250ZXh0ID0ge1xuXHRcdFx0Z2V0U2V0dGluZzoga2V5ID0+IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBrZXkpLFxuXHRcdFx0aGFzQ2xpZW50VG9vbDogbmFtZSA9PiBjbGllbnRUb29sTmFtZXMuaGFzKG5hbWUpLFxuXHRcdFx0d29ya3NwYWNlbGVzczogcGxhbi53b3Jrc3BhY2VsZXNzID09PSB0cnVlLFxuXHRcdFx0dG9vbFNlYXJjaEFjdGl2ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxEaXJlY3RvcmllcyA9IHBsYW4uYWRkaXRpb25hbERpcmVjdG9yaWVzPy5tYXAoZCA9PiBkLmZzUGF0aCk7XG5cdFx0Ly8gUmVzb2x2ZWQgb25jZSBwZXIgKHJlKWxhdW5jaCBcdTIwMTQgdGhlIFNESyBoYXMgbm8gbWlkLXNlc3Npb24gc3lzdGVtLW1lc3NhZ2Vcblx0XHQvLyB1cGRhdGUsIHNvIHRoaXMgcmVmbGVjdHMgdGhlIG1vZGVsL3Rvb2xzL3NldHRpbmdzIGF0IGxhdW5jaCB0aW1lLiBMb2cgYVxuXHRcdC8vIHN1bW1hcnkgYXQgaW5mbyBmb3IgcHJvbXB0IG9ic2VydmFiaWxpdHk7IHRoZSBmdWxsIGNvbmZpZyBhdCB0cmFjZS5cblx0XHRjb25zdCBzeXN0ZW1NZXNzYWdlID0gYWdlbnRIb3N0UHJvbXB0UmVnaXN0cnkucmVzb2x2ZVN5c3RlbU1lc3NhZ2VDb25maWcoZWZmZWN0aXZlTW9kZWwsIHByb21wdENvbnRleHQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtwbGFuLnNlc3Npb25JZH1dIFJlc29sdmVkIHN5c3RlbSBtZXNzYWdlOiAke2Rlc2NyaWJlU3lzdGVtTWVzc2FnZUNvbmZpZyhzeXN0ZW1NZXNzYWdlKX1gKTtcblx0XHRpZiAodGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpIDw9IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0XHQvLyBHdWFyZGVkOiBhIGByZXBsYWNlYC1tb2RlIHByb21wdCdzIGNvbnRlbnQgY2FuIGJlIG11bHRpcGxlIEtCLCBzbyBvbmx5XG5cdFx0XHQvLyBzZXJpYWxpemUgaXQgd2hlbiB0cmFjZSBvdXRwdXQgaXMgYWN0dWFsbHkgZW1pdHRlZC5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7cGxhbi5zZXNzaW9uSWR9XSBTeXN0ZW0gbWVzc2FnZSBjb25maWc6ICR7SlNPTi5zdHJpbmdpZnkoc3lzdGVtTWVzc2FnZSwgKF9rZXksIHZhbHVlKSA9PiB0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicgPyAnW3RyYW5zZm9ybSBmbl0nIDogdmFsdWUpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uYnlvayxcblx0XHRcdC4uLmRpc2FibGVkTWNwU2VydmVyc1Nlc3Npb25PcHRpb24ocGx1Z2lucywgcGxhbi5kaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzKSxcblx0XHRcdGNsaWVudE5hbWU6IEFHRU5UX0hPU1RfQ09QSUxPVF9DTElFTlRfTkFNRSxcblx0XHRcdC8vIFJlc3VtZSBvbmx5OiBgX2NyZWF0ZVNlc3Npb25gIHJlLXJlc29sdmVzIHRoZSBmdWxsIGVmZm9ydCBmb3IgYSBjcmVhdGUsXG5cdFx0XHQvLyB3aGlsZSBhIHJlc3VtZWQgc2Vzc2lvbiBrZWVwcyB0aGUgZWZmb3J0IHRoZSBydW50aW1lIGpvdXJuYWxlZCB1bmxlc3Ncblx0XHRcdC8vIGFuIG92ZXJyaWRlIGlzIGNvbmZpZ3VyZWQuXG5cdFx0XHQuLi4ocGxhbi5raW5kID09PSAncmVzdW1lJyA/IHsgcmVhc29uaW5nRWZmb3J0OiByZXNvbHZlQ29uZmlndXJlZFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlKG1vZGVsLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgcGxhbi5zZXNzaW9uSWQpIH0gOiB7fSksXG5cdFx0XHRtb2RlbENhcGFiaWxpdGllcyxcblx0XHRcdGVuYWJsZU1jcEFwcHM6IHRydWUsXG5cdFx0XHRnaXRodWJNY3BUb29sQ29uZmlnOiB7IGRpc2FibGVGb3JtRGVmZXJyYWw6IHRydWUgfSxcblx0XHRcdGVuYWJsZUZpbGVIb29rczogdHJ1ZSxcblx0XHRcdGVuYWJsZUNvbmZpZ0Rpc2NvdmVyeTogdHJ1ZSxcblx0XHRcdHJlcXVlc3RFeHRlbnNpb25zOiBmYWxzZSwgLy8gZm9yY2UtZGlzYWJsZSBjb3BpbG90IGV4dGVuc2lvbiBtYW5hZ2VtZW50IHRvb2xzIChvdGhlcndpc2UgZW5hYmxlZCBpbiBleHBlcmltZW50YWwgbW9kZSlcblx0XHRcdG9uUGVybWlzc2lvblJlcXVlc3Q6IHJlcXVlc3QgPT4gcnVudGltZS5oYW5kbGVQZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0KSxcblx0XHRcdG9uVXNlcklucHV0UmVxdWVzdDogKHJlcXVlc3QsIGludm9jYXRpb24pID0+IHJ1bnRpbWUuaGFuZGxlVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0LCBpbnZvY2F0aW9uKSxcblx0XHRcdG9uRWxpY2l0YXRpb25SZXF1ZXN0OiBjb250ZXh0ID0+IHJ1bnRpbWUuaGFuZGxlRWxpY2l0YXRpb25SZXF1ZXN0KGNvbnRleHQpLFxuXHRcdFx0b25NY3BBdXRoUmVxdWVzdDogKHJlcXVlc3QsIGNvbnRleHQpID0+IHJ1bnRpbWUuaGFuZGxlTWNwQXV0aFJlcXVlc3QocmVxdWVzdCwgY29udGV4dCksXG5cdFx0XHRob29rczogdG9TZGtIb29rcyhwbHVnaW5zV2l0aG91dERpcnMuZmxhdE1hcChwID0+IHAuaG9va3MpLCB7XG5cdFx0XHRcdG9uUHJlVG9vbFVzZTogaW5wdXQgPT4gcnVudGltZS5oYW5kbGVQcmVUb29sVXNlKGlucHV0KSxcblx0XHRcdFx0b25Qb3N0VG9vbFVzZTogaW5wdXQgPT4gcnVudGltZS5oYW5kbGVQb3N0VG9vbFVzZShpbnB1dCksXG5cdFx0XHRcdG9uVXNlclByb21wdFN1Ym1pdHRlZDogKCkgPT4gcnVudGltZS5oYW5kbGVVc2VyUHJvbXB0U3VibWl0dGVkKCksXG5cdFx0XHR9KSxcblx0XHRcdG1jcFNlcnZlcnM6IHsgLi4udG9TZGtNY3BTZXJ2ZXJzRnJvbUNvbmZpZ01hcChwbGFuLnNuYXBzaG90Lm1jcFNlcnZlcnMpLCAuLi50b1Nka01jcFNlcnZlcnMobWNwU2VydmVycykgfSxcblx0XHRcdG9uRXhpdFBsYW5Nb2RlUmVxdWVzdDogKHJlcXVlc3QsIGludm9jYXRpb24pID0+IHJ1bnRpbWUuaGFuZGxlRXhpdFBsYW5Nb2RlUmVxdWVzdChyZXF1ZXN0LCBpbnZvY2F0aW9uKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHBsYW4ud29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoLFxuXHRcdFx0Y3VzdG9tQWdlbnRzLFxuXHRcdFx0YWdlbnQ6IHBsYW4ucmVzb2x2ZWRBZ2VudE5hbWUsXG5cdFx0XHRza2lsbERpcmVjdG9yaWVzLFxuXHRcdFx0aW5zdHJ1Y3Rpb25EaXJlY3Rvcmllcyxcblx0XHRcdGFkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHRcdHN5c3RlbU1lc3NhZ2UsXG5cdFx0XHR0b29sU2VhcmNoOiB0b29sU2VhcmNoQWN0aXZlID8geyBlbmFibGVkOiB0cnVlLCBkZWZlclRocmVzaG9sZDogdG9vbFNlYXJjaERlZmVyVGhyZXNob2xkIH0gOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsYXJnZU91dHB1dDoge1xuXHRcdFx0XHRtYXhTaXplQnl0ZXM6IDggKiAxMDI0LFxuXHRcdFx0fSxcblx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRwZXJtaXNzaW9uczogbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMsXG5cdFx0XHR9LFxuXHRcdFx0YXZhaWxhYmxlVG9vbHM6IHNka0F2YWlsYWJsZVRvb2xzLFxuXHRcdFx0ZXhjbHVkZWRUb29sczogc2RrRXhjbHVkZWRUb29scyxcblx0XHRcdHBsdWdpbkRpcmVjdG9yaWVzOiBjb2FsZXNjZShwbHVnaW5zLm1hcChwID0+IHAucGx1Z2luRGlyKSlcblx0XHRcdFx0LmZpbHRlcihkID0+IGQuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpLm1hcChkID0+IGQuZnNQYXRoKSxcblx0XHRcdHRvb2xzOiBbLi4uc2hlbGxUb29scywgLi4ucnVudGltZS5jcmVhdGVDbGllbnRTZGtUb29scyh0b29sU2VhcmNoQWN0aXZlKSwgLi4ucnVudGltZS5jcmVhdGVTZXJ2ZXJTZGtUb29scygpXSxcblx0XHRcdC8vIFBhc3MgdGhlIEdpdEh1YiB0b2tlbiBhdCB0aGUgc2Vzc2lvbiBsZXZlbC4gVGhlIFNESydzXG5cdFx0XHQvLyBjbGllbnQtbGV2ZWwgYGdpdEh1YlRva2VuYCBhdXRoZW50aWNhdGVzIHRoZSBDTEkgcHJvY2Vzcyxcblx0XHRcdC8vIGJ1dCBlYWNoIHNlc3Npb24gYWxzbyBuZWVkcyBpdHMgb3duIHRva2VuIHJlc29sdmVkIGludG8gYVxuXHRcdFx0Ly8gR2l0SHViIGlkZW50aXR5IChsb2dpbiwgQ29waWxvdCBwbGFuLCBlbmRwb2ludHMpIHRvIGRyaXZlXG5cdFx0XHQvLyBtb2RlbCByb3V0aW5nIGFuZCBxdW90YSBcdTIwMTQgd2l0aG91dCB0aGlzIHRoZSBzZXNzaW9uXG5cdFx0XHQvLyBlcnJvcnMgd2l0aCBcIlNlc3Npb24gd2FzIG5vdCBjcmVhdGVkIHdpdGggYXV0aGVudGljYXRpb25cblx0XHRcdC8vIGluZm8gb3IgY3VzdG9tIHByb3ZpZGVyXCIgb24gZmlyc3Qgc2VuZC4gU2VlICMzMTg2OTMuXG5cdFx0XHRnaXRIdWJUb2tlbjogcGxhbi5naXRodWJUb2tlbixcblx0XHRcdC8vIEVuYWJsZSBpbmZpbml0ZSBzZXNzaW9ucyBzbyB0aGUgU0RLIHByb3Zpc2lvbnMgYSB3b3Jrc3BhY2Vcblx0XHRcdC8vIGRpcmVjdG9yeSAoY29udGFpbmluZyBgcGxhbi5tZGAsIGBjaGVja3BvaW50cy9gLCBgZmlsZXMvYCkuXG5cdFx0XHQvLyBUaGUgd29ya3NwYWNlIGlzIHJlcXVpcmVkIGZvciBwbGFuIG1vZGUgdG8gd29yayBcdTIwMTQgd2l0aG91dFxuXHRcdFx0Ly8gaXQsIGBycGMucGxhbi5yZWFkKClgIHJldHVybnMgYHBhdGg6IG51bGxgIGFuZCB0aGUgU0RLXG5cdFx0XHQvLyBuZXZlciBlbWl0cyBgZXhpdF9wbGFuX21vZGUucmVxdWVzdGVkYC5cblx0XHRcdGluZmluaXRlU2Vzc2lvbnM6IHsgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0Ly8gUGVyLXNlc3Npb24gcmVtb3RlIGV4cG9ydDogdGhlIGNsaWVudC1sZXZlbCBgLS1yZW1vdGVgIGZsYWdcblx0XHRcdC8vIChlbmFibGVSZW1vdGVTZXNzaW9ucykgZW5hYmxlcyB0aGUgQ0xJIGNhcGFiaWxpdHksIGJ1dCBlYWNoXG5cdFx0XHQvLyBzZXNzaW9uIG11c3Qgb3B0IGluIHZpYSBgcmVtb3RlU2Vzc2lvbmAgdG8gYWN0dWFsbHkgZXhwb3J0XG5cdFx0XHQvLyBldmVudHMuIFdpdGhvdXQgdGhpcywgc2Vzc2lvbnMgZGVmYXVsdCB0byBcIm9mZlwiLlxuXHRcdFx0cmVtb3RlU2Vzc2lvbjogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0U2Vzc2lvblN5bmNFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZSA/ICdleHBvcnQnIDogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlTWFuYWdlZFNldHRpbmdzOiB0cnVlLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxxQkFBcUI7QUFDeEMsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxhQUFhLGdCQUFnQjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlDQUF3RDtBQUNqRSxTQUFTLHNDQUFzQywwQkFBb0Q7QUFDbkcsU0FBUyxxQkFBcUIsd0JBQXdCLDJCQUEyQixtQ0FBbUMsMkNBQTJDO0FBQy9KLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQXdEO0FBQ2pFLFNBQVMsMkJBQTJCLDJCQUEyQjtBQUUvRCxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUFvRDtBQUU3RCxTQUFTLFlBQVksNkJBQTZCLGlCQUFpQiw4QkFBOEIsMEJB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
