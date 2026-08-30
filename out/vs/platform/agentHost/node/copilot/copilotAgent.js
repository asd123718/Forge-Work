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
import { CopilotClient, RuntimeConnection } from "@github/copilot-sdk";
import * as fs from "fs/promises";
import * as os from "os";
import { pathToFileURL } from "url";
import { createCancelablePromise, DeferredPromise, Delayer, disposableTimeout, Limiter, raceTimeout, Sequencer, SequencerByKey } from "../../../../base/common/async.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { CancellationError, getErrorMessage } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { FileAccess } from "../../../../base/common/network.js";
import { formatTokenCount } from "../../../../base/common/numbers.js";
import { equals } from "../../../../base/common/objects.js";
import { autorun, observableValue, observableValueOpts } from "../../../../base/common/observable.js";
import { delimiter, dirname, join } from "../../../../base/common/path.js";
import { basename as resourceBasename, isEqual, isEqualOrParent, joinPath as resourceJoinPath, relativePath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { rgDiskPath } from "../../../../base/node/ripgrep.js";
import { localize } from "../../../../nls.js";
import { parseAgentFile, parsePlugin, parseRuleFile, parseSkillFile, PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { workspacelessScratchDir } from "../workspacelessScratchDir.js";
import { IAgentHostCheckpointService } from "../../common/agentHostCheckpointService.js";
import { IAgentHostReviewService } from "../../common/agentHostReviewService.js";
import { createPricingMetaFromBilling, hasLongContextSurcharge, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { createAgentModelByokMeta } from "../../common/agentModelByokMeta.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema, DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE, toContainerCustomization } from "../../common/agentHostCustomizationConfig.js";
import { CopilotCliConfigKey, CopilotCliVSCodeAssignmentContextKey, copilotCliConfigSchema, DEFAULT_COPILOT_RUBBER_DUCK_ENABLED } from "../../common/copilotCliConfig.js";
import { AgentHostMcpServersConfigKey, AgentHostCopilotMultiRootEnabledConfigKey, AgentHostSessionSyncEnabledConfigKey, AgentHostSystemProxyEnabledConfigKey, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, migrateLegacyAutopilotConfig, platformRootSchema, platformSessionSchema } from "../../common/agentHostSchema.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { decodeProviderData, encodeProviderData } from "../agentChatBackings.js";
import { prepareSideChatPrompt, sliceSideChatTurns } from "../agentPeerChats.js";
import { AgentSession, SubagentChatSignal, resolveAgentChatContext, resolveAgentHostCustomizations, resolveAgentHostInstructions, resolveSubagentChatParent } from "../../common/agent.js";
import { getReasoningEffortDescription, getReasoningEffortLabel, resolveDefaultReasoningEffort } from "../../common/reasoningEffort.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { getCopilotHomePath } from "../../common/copilotHome.js";
import { ISessionDataService, SESSION_DB_FILENAME } from "../../common/sessionDataService.js";
import { IAgentHostProxyResolver } from "../agentHostProxyResolver.js";
import { ActionType, AuthRequiredReason } from "../../common/state/sessionActions.js";
import { areAdditionalWorkingDirectoriesEqual } from "../../common/state/sessionWorkingDirectories.js";
import { CustomizationLoadStatus, CustomizationType, customizationId, buildChatUri, buildDefaultChatUri, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_READ_DB_KEY, isDefaultChatUri, withSessionEhcliAdoptable } from "../../common/state/sessionState.js";
import { getByokLmAgentModelId } from "../../common/agentHostByokLm.js";
import { isCustomizationEnabled } from "../../common/customizationEnablement.js";
import { ActiveClientToolSet, structuralToolsEqual } from "../activeClientState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostManagedSettingsService } from "../agentHostManagedSettingsService.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { IAgentHostCompletions } from "../agentHostCompletions.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { applyMcpServerEnablement, buildMcpTopLevelCustomizationId } from "../shared/mcpCustomizationController.js";
import { IAgentHostCustomizationEnablementService } from "../agentHostCustomizationEnablementService.js";
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, resolveCustomizationEnablement } from "../shared/customizationEnablementGate.js";
import { McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { IAgentHostSessionTitleSignal } from "../agentHostSessionTitleSignal.js";
import { IByokLmBridgeRegistry } from "../byokLmBridgeRegistry.js";
import { SessionWorkingDirectoryMissingError } from "../shared/worktreeIsolation.js";
import { buildSessionEventLogFromTurns } from "./buildSessionEvents.js";
import { CopilotAgentSession } from "./copilotAgentSession.js";
import { createCopilotCliEnvironment } from "./copilotCliEnvironment.js";
import { projectFromCopilotContext } from "./copilotGitProject.js";
import { parsedPluginsEqual, toChildCustomizations } from "./copilotPluginConverters.js";
import { CopilotGitHubTelemetryForwarder } from "./copilotGitHubTelemetryForwarder.js";
import { CopilotSessionLauncher, ContextSizeConfigKey, ThinkingLevelConfigKey, getCopilotContextTier, isCopilotReasoningEffort, resolveCopilotReasoningEffort } from "./copilotSessionLauncher.js";
import { ShellManager } from "./copilotShellTools.js";
import { isAgentHostTelemetryService } from "../agentHostTelemetryService.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { AgentHostGitHubTelemetryRouter } from "../agentHostGitHubTelemetryRouter.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { CopilotSlashCommandCompletionProvider } from "./copilotSlashCommandCompletionProvider.js";
import { DiscoveredType, SessionCustomizationDiscovery, areDiscoveredDirectoriesEqual } from "./sessionCustomizationDiscovery.js";
import { COPILOT_INTEGRATION_ID } from "../../../endpoint/common/licenseAgreement.js";
import { getAppNodeModulesPath } from "../appNodeModules.js";
import { CopilotSlashCommandProvider } from "./copilotSlashCommandProvider.js";
import { classifyCopilotClientFailure, createCopilotFailureCorrelation, reportCopilotClientFailure, reportCopilotClientRecovery, reportCopilotClientRecoveryTurn } from "./copilotFailureTelemetry.js";
const COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS = 3500;
const COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS = 4500;
function isCopilotRuntimeManagedSettingsSdk(value) {
  return typeof value === "object" && value !== null && "getManagedSettings" in value && typeof value.getManagedSettings === "function";
}
async function getCopilotManagedSettingsDiagnostics(runtimeSdk, token, host, signal, timeoutMs = COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS, proxy = void 0) {
  const request = invokeWithProxyEnvironment(proxy, () => runtimeSdk.getManagedSettings({
    ...token ? { authInfo: { type: "token", host, token }, token } : {},
    signal
  }));
  const result = await raceTimeout(request, timeoutMs);
  if (!result) {
    throw new Error(`Copilot runtime managed-settings query exceeded ${timeoutMs / 1e3} seconds while waiting for native MDM or GitHub policy resolution.`);
  }
  return result;
}
function invokeWithProxyEnvironment(proxy, invoke) {
  if (!proxy) {
    return invoke();
  }
  const previousValues = COPILOT_PROXY_SET_ENV_KEYS.map((key) => process.env[key]);
  for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
    process.env[key] = proxy;
  }
  try {
    return invoke();
  } finally {
    for (let index = 0; index < COPILOT_PROXY_SET_ENV_KEYS.length; index++) {
      const key = COPILOT_PROXY_SET_ENV_KEYS[index];
      const value = previousValues[index];
      if (value === void 0) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
const RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS = 300;
const COPILOT_CAPI_URL = "https://api.githubcopilot.com";
function isCopilotConnectionClosedError(error) {
  return classifyCopilotClientFailure(error) === "connectionClosed";
}
const COPILOT_PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];
const COPILOT_PROXY_SET_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY"];
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
function isLinuxMuslRuntime() {
  if (process.platform !== "linux") {
    return false;
  }
  const report = process.report?.getReport();
  return !report?.header?.glibcVersionRuntime;
}
function getCopilotPlatformPackageCandidates() {
  const platformArch = `${process.platform}-${process.arch}`;
  if (process.platform !== "linux") {
    return [platformArch];
  }
  const linuxCandidates = [`linux-${process.arch}`, `linuxmusl-${process.arch}`];
  return isLinuxMuslRuntime() ? linuxCandidates.reverse() : linuxCandidates;
}
async function resolveCopilotCliPath(nodeModulesUri) {
  const tried = [];
  for (const platformPackage of getCopilotPlatformPackageCandidates()) {
    const cliPath = URI.joinPath(nodeModulesUri, "@github", `copilot-${platformPackage}`, "index.js").fsPath;
    tried.push(cliPath);
    if (await fileExists(cliPath)) {
      return cliPath;
    }
  }
  const oldTopLevelPath = URI.joinPath(nodeModulesUri, "@github", "copilot", "index.js").fsPath;
  tried.push(oldTopLevelPath);
  if (await fileExists(oldTopLevelPath)) {
    return oldTopLevelPath;
  }
  throw new Error(`Unable to resolve @github/copilot CLI path. Tried: ${tried.join(", ")}`);
}
const NO_HOST_CUSTOMIZATIONS = Object.freeze([]);
class CopilotSessionLifetime {
  constructor() {
    this._activeLeases = 0;
    this._pendingReleases = 0;
    this._exclusiveTail = Promise.resolve();
    this._isDisposing = false;
    this._isPermanentlyClosed = false;
    this._peerResumes = /* @__PURE__ */ new Map();
    this._sessionSequencer = new Sequencer();
    this._chatSequencer = new SequencerByKey();
    this._queuedWork = /* @__PURE__ */ new Set();
  }
  get isPermanentlyClosed() {
    return this._isPermanentlyClosed;
  }
  queueSession(task) {
    return this._track(this._sessionSequencer.queue(task));
  }
  queueChat(chatKey, task) {
    return this._track(this._chatSequencer.queue(chatKey, task));
  }
  resumeDefault(factory) {
    const existing = this._defaultResume;
    if (existing) {
      return existing;
    }
    const resume = factory();
    this._defaultResume = resume;
    const cleanup = () => {
      if (this._defaultResume === resume) {
        this._defaultResume = void 0;
      }
    };
    resume.then(cleanup, cleanup);
    return resume;
  }
  resumePeer(chatKey, factory) {
    const existing = this._peerResumes.get(chatKey);
    if (existing) {
      return existing;
    }
    const resume = factory();
    this._peerResumes.set(chatKey, resume);
    const cleanup = () => {
      if (this._peerResumes.get(chatKey) === resume) {
        this._peerResumes.delete(chatKey);
      }
    };
    resume.then(cleanup, cleanup);
    return resume;
  }
  async acquire() {
    while (!this._isDisposing && !this._isPermanentlyClosed) {
      const reopened = this._reopened;
      if (reopened) {
        await reopened.p;
        continue;
      }
      this._activeLeases++;
      let disposed = false;
      return toDisposable(() => {
        if (disposed) {
          return;
        }
        disposed = true;
        this._activeLeases--;
        if (this._activeLeases === 0) {
          this._drained?.complete();
        }
      });
    }
    return void 0;
  }
  release(task) {
    if (this._isDisposing || this._isPermanentlyClosed) {
      return Promise.resolve();
    }
    this._pendingReleases++;
    this._reopened ??= new DeferredPromise();
    const previous = this._exclusiveTail;
    const release = (async () => {
      await previous;
      await this._waitForLeases();
      await task();
    })();
    const completed = release.finally(() => {
      this._pendingReleases--;
      if (this._pendingReleases === 0 && !this._isDisposing && !this._isPermanentlyClosed) {
        this._reopened?.complete();
        this._reopened = void 0;
      }
    });
    this._exclusiveTail = completed.catch(() => void 0);
    return completed;
  }
  async dispose(task) {
    if (this._disposePromise) {
      return this._disposePromise;
    }
    if (this._isPermanentlyClosed) {
      return;
    }
    this._isDisposing = true;
    this._reopened?.complete();
    this._reopened = void 0;
    const previous = this._exclusiveTail;
    const dispose = (async () => {
      try {
        await previous;
        await this._waitForLeases();
        await task();
        this._isPermanentlyClosed = true;
      } catch (error) {
        if (!this._isPermanentlyClosed) {
          this._isDisposing = false;
          this._reopened?.complete();
          this._reopened = void 0;
        }
        throw error;
      }
    })();
    this._disposePromise = dispose;
    this._exclusiveTail = dispose.catch(() => void 0);
    try {
      await dispose;
    } finally {
      if (!this._isPermanentlyClosed && this._disposePromise === dispose) {
        this._disposePromise = void 0;
      }
    }
  }
  async close() {
    this._isPermanentlyClosed = true;
    this._reopened?.complete();
    this._reopened = void 0;
    await this._waitForQueuedWork();
    await this._exclusiveTail;
    await this._waitForLeases();
  }
  _track(work) {
    const completion = work.then(() => void 0, () => void 0);
    this._queuedWork.add(completion);
    completion.then(() => this._queuedWork.delete(completion));
    return work;
  }
  async _waitForQueuedWork() {
    while (this._queuedWork.size > 0) {
      await Promise.all(this._queuedWork);
    }
  }
  async _waitForLeases() {
    if (this._activeLeases === 0) {
      return;
    }
    const drained = this._drained ??= new DeferredPromise();
    await drained.p;
    if (this._drained === drained) {
      this._drained = void 0;
    }
  }
}
function toRestrictedTelemetryEndpoint(endpoint) {
  return endpoint ? `${endpoint.replace(/\/+$/, "")}/telemetry` : void 0;
}
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from "./prompts/systemMessage.js";
function rebaseUnder(uri, fromDir, toDir) {
  if (!isEqualOrParent(uri, fromDir)) {
    return void 0;
  }
  const rel = relativePath(fromDir, uri);
  if (rel === void 0) {
    return void 0;
  }
  return rel.length === 0 ? toDir : resourceJoinPath(toDir, rel);
}
function migrateEnablementKeys(enablement, fromDir, toDir) {
  const migrated = /* @__PURE__ */ new Map();
  for (const [uri, enabled] of enablement) {
    const rebased = rebaseUnder(URI.parse(uri), fromDir, toDir);
    migrated.set(rebased ? rebased.toString() : uri, enabled);
  }
  return migrated;
}
class CopilotChatEntry extends Disposable {
  constructor(chatSession, activeClient, onMcpNotification, onDidRequireAuth) {
    super();
    this.chatSession = chatSession;
    this._register(chatSession);
    this._register(chatSession.onMcpNotification((notification) => onMcpNotification.fire(notification)));
    this._register(chatSession.onDidRequireAuth(onDidRequireAuth));
    this._register(autorun((reader) => activeClient.pluginController.mcpServerStates.set(chatSession.mcpServerStates.read(reader), void 0)));
  }
}
function resolveCopilotOtlpMetricsEndpoint(endpoint, protocol) {
  if (protocol === "grpc") {
    return endpoint;
  }
  try {
    const url = new URL(endpoint);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/v1/metrics";
    } else if (url.pathname.endsWith("/v1/traces")) {
      url.pathname = `${url.pathname.slice(0, -"/v1/traces".length)}/v1/metrics`;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return endpoint;
  }
}
const EXTENSION_HOST_CLI_MARKER_ORIGIN = "vscode";
const NANO_AIU_PER_CREDIT = 1e9;
let CopilotAgent = class extends Disposable {
  constructor(_logService, _instantiationService, _sessionDataService, _gitService, _configurationService, sessionTitleSignal, _managedSettingsService, _gitHubEndpointService, _otelService, completions, _checkpointService, _reviewService, _customizationEnablementService, _environmentService, _byokBridgeRegistry, _telemetryService, _copilotApiService, _proxyResolver) {
    super();
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._sessionDataService = _sessionDataService;
    this._gitService = _gitService;
    this._configurationService = _configurationService;
    this._managedSettingsService = _managedSettingsService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._otelService = _otelService;
    this._checkpointService = _checkpointService;
    this._reviewService = _reviewService;
    this._customizationEnablementService = _customizationEnablementService;
    this._environmentService = _environmentService;
    this._byokBridgeRegistry = _byokBridgeRegistry;
    this._telemetryService = _telemetryService;
    this._copilotApiService = _copilotApiService;
    this._proxyResolver = _proxyResolver;
    this.id = "copilotcli";
    this._onDidChatProgress = this._register(new Emitter());
    this.onDidChatProgress = this._onDidChatProgress.event;
    this._authenticationRequired = observableValueOpts(
      { owner: this, equalsFn: structuralEquals },
      void 0
    );
    this.authenticationRequired = this._authenticationRequired;
    /**
     * Membership channel for chats the agent spawns itself — sub-agents
     * delegated by a tool call (the same fan-out the `subagent_started` /
     * `subagent_completed` signals drive). The orchestrator routes these into
     * the chat catalog so harness-spawned and user-driven chats share one path.
     */
    this._onDidSpawnChat = this._register(new Emitter());
    this.onDidSpawnChat = this._onDidSpawnChat.event;
    this._onDidMaterializeChat = this._register(new Emitter());
    this.onDidMaterializeChat = this._onDidMaterializeChat.event;
    /**
     * Fires when the native chat catalog may have changed. The {@link AgentService}
     * responds with an additive discovery pass.
     */
    this._onDidDiscoverChats = this._register(new Emitter({
      onDidAddFirstListener: () => {
        if (this._isMigrateLegacyCopilotCliEnabled()) {
          void this._emitExtHostChats();
        }
      }
    }));
    this.onDidDiscoverChats = this._onDidDiscoverChats.event;
    /**
     * Per-session MCP notifications, fanned in from every active
     * {@link CopilotAgentSession}. Each session contributes a single
     * subscription, disposed alongside the session.
     */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    /**
     * The two sources merged into {@link _models}: CAPI models from the CLI's
     * `models.list` and BYOK models from the renderer bridge registry's serving
     * window. Tracked separately so each can refresh independently without
     * clobbering the other; {@link _publishModels} concatenates them for the
     * picker.
     */
    this._capiModels = [];
    this._byokModels = [];
    /** Model IDs whose long-context tier costs the same as the default tier (free long context). */
    this._freeLongContextModels = /* @__PURE__ */ new Set();
    /**
     * Bounded exponential-backoff retry for {@link _refreshModels}. The SDK's
     * `models.list` RPC can fail transiently (e.g. a `429 "too many requests"`
     * right after startup). Without a retry the model picker would stay empty
     * until the next external refresh trigger (a GitHub token change, a CLI
     * client restart, or the host's periodic scheduler), so we retry a few
     * times before giving up. Overridable in tests to avoid real delays.
     */
    this._modelRefreshMaxAttempts = 5;
    this._modelRefreshBaseDelayMs = 1e3;
    this._modelRefreshMaxDelayMs = 3e4;
    /** Pending model-refresh retry timer; cleared on a fresh refresh, shutdown, or dispose. */
    this._modelRefreshRetry = this._register(new MutableDisposable());
    /**
     * Invalidates model requests bound to a superseded token/client/catalog
     * source. Token identity alone is insufficient: restarting the client for
     * a `COPILOT_GH_HOST` change keeps the same token while changing the CAPI
     * endpoint whose catalog is authoritative.
     */
    this._modelCatalogGeneration = 0;
    this._modelRefreshSchedule = this._register(new MutableDisposable());
    /**
     * Reasons for a client restart that is parked until every chat is idle. See
     * {@link _requestClientRestart}; drained by {@link _applyPendingClientRestart}.
     */
    this._pendingClientRestartReasons = /* @__PURE__ */ new Set();
    this._reportedClientFailures = /* @__PURE__ */ new WeakSet();
    this._authenticationSequencer = new Sequencer();
    /** Reflects the `rt=1` field on the GitHub Copilot bearer token; gates enhanced GH telemetry. */
    this._restrictedTelemetryEnabled = false;
    this._onDidChangeRestrictedTelemetry = this._register(new Emitter());
    this.onDidChangeRestrictedTelemetry = this._onDidChangeRestrictedTelemetry.event;
    this._chatEntriesBySdkId = this._register(new DisposableMap());
    /** Exact host chat URI -> persisted provider backing; live SDK sessions are tracked separately. */
    this._chatBackings = /* @__PURE__ */ new Map();
    /** Exact chat -> recorded configuration scope, used for fork/restore paths that only know the chat URI. */
    this._chatScopes = /* @__PURE__ */ new Map();
    /** Exact chat -> host-selected persistence scope. */
    this._chatStorageScopes = /* @__PURE__ */ new Map();
    /** Fires when persisted chat backing data changes after creation. */
    this._onDidChangeChatData = this._register(new Emitter());
    this.onDidChangeChatData = this._onDidChangeChatData.event;
    this._sessionLifetimes = /* @__PURE__ */ new Map();
    /** Provisional chats that defer SDK/session creation until the first send. */
    this._provisionalSessions = /* @__PURE__ */ new Map();
    this._isShuttingDown = false;
    /** Per-session active client state for tools + plugin snapshot tracking. */
    this._activeClients = new ResourceMap();
    /**
     * Last host-published customization snapshot per configuration scope (AGENTS.md section 8b).
     * Updated only from host call boundaries; absence is distinct from an empty list.
     */
    this._hostCustomizations = new ResourceMap();
    this._lastSessionSyncEnabled = this._isSessionSyncEnabled();
    this._lastRubberDuckEnabled = this._isRubberDuckEnabled();
    this._lastCopilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
    this._lastEnterpriseHost = this._getEnterpriseHost();
    this._lastSystemProxyEnabled = this._isSystemProxyEnabled();
    this._lastMigrateLegacyEnabled = this._isMigrateLegacyCopilotCliEnabled();
    /**
     * Chat-addressed surface for the chats within a session.
     */
    this.chats = {
      createChat: (chat, context, options) => {
        this._noteHostCustomizations(context);
        return this._createChat(chat, resolveAgentChatContext(context, chat), options);
      },
      disposeChat: (chatUri, context) => this._disposeChat(chatUri, context),
      releaseChat: (chatUri, context) => this._releaseChat(chatUri, context),
      sendMessage: (chatUri, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
        const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : void 0;
        const clientType = typeof clientTypeOrContext === "string" ? clientTypeOrContext : AgentHostClientType.Unknown;
        const operationContext = context ?? (typeof clientTypeOrContext === "string" ? void 0 : clientTypeOrContext);
        const clientTelemetryContext = URI.isUri(operationContext) ? void 0 : operationContext?.clientTelemetryContext;
        return this._sendMessage(chatUri, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext, clientTelemetryContext);
      },
      abort: (chatUri, context) => {
        return this._abortSession(chatUri, context);
      },
      changeModel: (chatUri, model, context) => {
        return this._changeModel(chatUri, model, context);
      },
      changeAgent: (chatUri, agent, context) => {
        return this._changeAgent(chatUri, agent, context);
      },
      getMessages: (chat, context) => this._getChatMessages(chat, context)
    };
    /** Memoizes the (stable) marker read so repeated `listSessions` calls don't re-read the disk. */
    this._extensionHostCliMarkerCache = /* @__PURE__ */ new Map();
    this._lastManagedSettingsPermissions = this._managedSettingsService.permissions;
    this._plugins = this._register(this._instantiationService.createInstance(PluginController, () => this._ensureClient()));
    this._sessionLauncher = this._instantiationService.createInstance(CopilotSessionLauncher);
    this._configurationService.publishRootTransientValues?.({ [CopilotCliVSCodeAssignmentContextKey]: void 0 });
    this._gitHubTelemetryForwarder = this._instantiationService.createInstance(CopilotGitHubTelemetryForwarder, () => this._restrictedTelemetryEnabled, () => this._vscodeAssignmentContext);
    this._register(this._configurationService.onDidRootConfigChange(() => this._updateVSCodeAssignmentContext()));
    this._updateVSCodeAssignmentContext();
    this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._ensureClient().then((c) => c.rpc.commands.list().then((c2) => c2.commands)), this._logService);
    this._githubTelemetryRouter = isAgentHostTelemetryService(this._telemetryService) ? new AgentHostGitHubTelemetryRouter(this._telemetryService) : void 0;
    this.onDidCustomizationsChange = this._plugins.onDidChange;
    this._register(sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, title }) => {
      if (provider === this.id) {
        this._otelService.emitSessionTitleChanged(this._sdkConversationId(session), session.toString(), title);
      }
    }));
    this._register(this._onDidChatProgress.event((signal) => this._emitSpawnedChatForSubagentSignal(signal)));
    this._register(completions.registerProvider(new CopilotSlashCommandCompletionProvider(
      this.id,
      {
        isRubberDuckEnabled: () => this._isRubberDuckEnabled(),
        getRuntimeSlashCommands: (sessionId, options) => this._getRuntimeSlashCommands(sessionId, options),
        getSessionCustomizations: (sessionId) => {
          const session = AgentSession.uri(this.id, sessionId);
          const chat = URI.parse(buildDefaultChatUri(session));
          return this.getChatCustomizations(chat, { configurationResource: session, resource: chat });
        },
        getSessionConfigState: (sessionId) => this._getSessionConfigState(sessionId)
      },
      RUNTIME_SLASH_COMMAND_COMPLETION_WAIT_MS
    )));
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._restartClientIfStartupConfigChanged().catch(
        (err) => this._logService.error("[Copilot] Failed to apply root config change", err)
      );
    }));
    this._register(this._managedSettingsService.onDidChange(() => {
      this._restartClientIfStartupConfigChanged().catch(
        (err) => this._logService.error("[Copilot] Failed to apply managed settings change", err)
      );
    }));
    this._register(this._configurationService.onDidRootConfigChange(() => {
      const enabled = this._isMigrateLegacyCopilotCliEnabled();
      if (enabled !== this._lastMigrateLegacyEnabled) {
        this._lastMigrateLegacyEnabled = enabled;
        if (enabled) {
          void this._emitExtHostChats();
        }
      }
    }));
    this._register(this._byokBridgeRegistry.onDidChangeModels(() => {
      this._logService.info("[Copilot] BYOK bridge changed; refreshing models");
      this._refreshByokModels();
    }));
    this._register(this._gitHubEndpointService.onDidChange(() => {
      this._restartClientIfStartupConfigChanged().catch(
        (err) => this._logService.error("[Copilot] Failed to restart client after endpoint change", err)
      );
    }));
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  get restrictedTelemetryEnabled() {
    return this._restrictedTelemetryEnabled;
  }
  _rememberChatScope(chat, scope, storageScope) {
    this._chatScopes.set(chat.toString(), scope);
    this._chatStorageScopes.set(chat.toString(), storageScope);
  }
  /** Returns the recorded configuration scope for a created or materialized chat. */
  _resolveChatScope(chat) {
    const scope = this._chatScopes.get(chat.toString());
    if (!scope) {
      throw new Error(`[Copilot] No recorded scope for chat ${chat.toString()}; it must be created or materialized before it can be forked from`);
    }
    return scope;
  }
  _resolveChatStorageScope(chat) {
    return this._chatStorageScopes.get(chat.toString()) ?? this._resolveChatScope(chat);
  }
  /** Ref count for chats that still share `scope`, used to decide when scope cleanup can run. */
  _remainingChatsForScope(scope) {
    let count = 0;
    for (const recorded of this._chatScopes.values()) {
      if (isEqual(recorded, scope)) {
        count++;
      }
    }
    return count;
  }
  /** Formats a chat backing for host persistence; only separately enumerable SDK sessions report `backingSession`. */
  _chatBackingResult(sessionId, backing) {
    return {
      providerData: encodeProviderData(backing),
      ...backing.sdkSessionId !== sessionId ? { backingSession: AgentSession.uri(this.id, backing.sdkSessionId) } : {}
    };
  }
  /**
   * Translates the sub-agent fan-out signals into the first-class spawned-
   * chat channel: `subagent_started` -> {@link onDidSpawnChat}
   * (carrying the spawning tool call as the chat's parent edge). A completed
   * subagent chat stays live and subscribable (it is removed only on session
   * teardown), so there is no corresponding end event. The signals themselves
   * are left untouched so the existing sub-agent behavior is preserved.
   */
  _emitSpawnedChatForSubagentSignal(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onDidSpawnChat.fire(spawn);
    }
  }
  _isSessionSyncEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostSessionSyncEnabledConfigKey) === true;
  }
  _isRubberDuckEnabled() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.RubberDuck) ?? DEFAULT_COPILOT_RUBBER_DUCK_ENABLED;
  }
  _getCopilotSdkLogLevelSetting() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.CopilotSdkLogLevel) ?? "info";
  }
  _resolveCopilotSdkLogLevel(configured) {
    return configured === "trace" || this._logService.getLevel() === LogLevel.Trace ? "all" : "info";
  }
  _getEnterpriseHost() {
    return this._gitHubEndpointService.getEnterpriseHost();
  }
  _isSystemProxyEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostSystemProxyEnabledConfigKey) !== false;
  }
  _isMigrateLegacyCopilotCliEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
  }
  /**
   * A key absent from root config (e.g. dropped by a schema-filtered replace)
   * keeps the last-known context sticky; an explicit empty-string dispatch
   * from the workbench clears it.
   */
  _updateVSCodeAssignmentContext() {
    const value = this._configurationService.getRootConfigValues?.()[CopilotCliVSCodeAssignmentContextKey];
    if (typeof value === "string") {
      this._vscodeAssignmentContext = value || void 0;
    }
  }
  /**
   * Restart the CLI client when a startup-baked value changes, but defer past any
   * in-flight turn — see {@link _requestClientRestart} — so the new values are
   * picked up at the next quiet point rather than by killing live work.
   * An in-flight start aborts if any startup value changes.
   */
  async _restartClientIfStartupConfigChanged() {
    const sessionSync = this._isSessionSyncEnabled();
    const rubberDuck = this._isRubberDuckEnabled();
    const copilotSdkLogLevelSetting = this._getCopilotSdkLogLevelSetting();
    const enterpriseHost = this._getEnterpriseHost();
    const systemProxyEnabled = this._isSystemProxyEnabled();
    const managedSettingsPermissions = this._managedSettingsService.permissions;
    if (this._lastSessionSyncEnabled === sessionSync && this._lastRubberDuckEnabled === rubberDuck && this._lastCopilotSdkLogLevelSetting === copilotSdkLogLevelSetting && this._lastEnterpriseHost === enterpriseHost && this._lastSystemProxyEnabled === systemProxyEnabled && equals(this._lastManagedSettingsPermissions, managedSettingsPermissions)) {
      return;
    }
    const changed = [
      this._lastSessionSyncEnabled !== sessionSync ? `sessionSync=${sessionSync}` : void 0,
      this._lastRubberDuckEnabled !== rubberDuck ? `rubberDuck=${rubberDuck}` : void 0,
      this._lastCopilotSdkLogLevelSetting !== copilotSdkLogLevelSetting ? `copilotSdkLogLevel=${copilotSdkLogLevelSetting}` : void 0,
      this._lastEnterpriseHost !== enterpriseHost ? `enterpriseHost=${enterpriseHost}` : void 0,
      this._lastSystemProxyEnabled !== systemProxyEnabled ? `systemProxy=${systemProxyEnabled}` : void 0,
      !equals(this._lastManagedSettingsPermissions, managedSettingsPermissions) ? "managedSettingsPermissions" : void 0
    ].filter((v) => v !== void 0).join(", ");
    this._lastSessionSyncEnabled = sessionSync;
    this._lastRubberDuckEnabled = rubberDuck;
    this._lastCopilotSdkLogLevelSetting = copilotSdkLogLevelSetting;
    this._lastEnterpriseHost = enterpriseHost;
    this._lastSystemProxyEnabled = systemProxyEnabled;
    this._lastManagedSettingsPermissions = managedSettingsPermissions;
    if (this._client) {
      this._logService.info(`[Copilot] Startup config changed (${changed}), restarting CopilotClient`);
    }
    await this._requestClientRestart(`startup config changed: ${changed}`);
  }
  /**
   * Requests a CLI client restart, running it immediately when every chat is
   * idle and otherwise parking it until the last in-flight turn ends.
   *
   * Restarting tears the SDK sessions down, and a torn-down session stops
   * producing the events that finalize its protocol turn — the client would be
   * left with a turn that never completes, cancels, or errors, i.e. a session
   * that spins forever. Startup-only values (session sync, the SDK log level,
   * the enterprise host, the system proxy) can also change without any user
   * action, from an experiment or policy refresh, so this must never be paid
   * for with a running turn. {@link _ensureClient} reads them fresh on the next
   * start, so applying the restart late is always correct.
   */
  async _requestClientRestart(reason) {
    if (this._shutdownPromise || !this._client && !this._clientStarting) {
      return;
    }
    this._pendingClientRestartReasons.add(reason);
    if (this._clientStarting) {
      try {
        await this._clientStarting;
      } catch {
        this._pendingClientRestartReasons.delete(reason);
        return;
      }
    }
    if (!this._client) {
      return;
    }
    const busyChats = this._chatsWithActiveTurn();
    if (busyChats > 0) {
      this._logService.info(`[Copilot] Deferring CopilotClient restart (${reason}) until ${busyChats} in-flight turn(s) finish`);
      return;
    }
    await this._applyPendingClientRestart();
  }
  /**
   * Runs a restart parked by {@link _requestClientRestart} once no chat has
   * an in-flight turn. No-op while any turn is still running; the next chat
   * to go idle drives this again.
   */
  async _applyPendingClientRestart() {
    if (this._pendingClientRestartReasons.size === 0 || this._shutdownPromise || !this._client || this._chatsWithActiveTurn() > 0) {
      return;
    }
    const reason = [...this._pendingClientRestartReasons].join("; ");
    this._logService.info(`[Copilot] Restarting CopilotClient (${reason})`);
    this._chatEntriesBySdkId.clearAndDisposeAll();
    await this._stopClient();
    this._capiModels = [];
    this._publishModels();
    void this._scheduleModelRefresh();
  }
  /**
   * Called by a {@link CopilotAgentSession} when its turn ends. Scheduled off
   * the current stack because the callback fires from inside that session's
   * SDK event handling and the restart disposes the session making the call.
   */
  _onChatTurnEnded() {
    if (this._pendingClientRestartReasons.size === 0) {
      return;
    }
    queueMicrotask(() => {
      this._applyPendingClientRestart().catch(
        (err) => this._logService.error("[Copilot] Failed to apply deferred client restart", err)
      );
    });
  }
  async _recoverFromClosedConnection(error, operation, correlation) {
    const failureKind = classifyCopilotClientFailure(error);
    if (!failureKind) {
      return void 0;
    }
    if (error instanceof Error && this._reportedClientFailures.has(error)) {
      return void 0;
    }
    const clientFailureId = this._closedConnectionRecovery?.clientFailureId ?? generateUuid();
    const recoveryStarted = failureKind === "connectionClosed" && !this._shutdownPromise && this._closedConnectionRecovery === void 0;
    reportCopilotClientFailure(this._telemetryService, clientFailureId, failureKind, operation, this._chatsWithActiveTurn(), recoveryStarted, error, correlation);
    if (failureKind !== "connectionClosed" || this._shutdownPromise) {
      return void 0;
    }
    if (!this._closedConnectionRecovery) {
      const recovery = this._runClosedConnectionRecovery(clientFailureId, failureKind);
      this._closedConnectionRecovery = { clientFailureId, promise: recovery };
      const cleanup = () => {
        if (this._closedConnectionRecovery?.promise === recovery) {
          this._closedConnectionRecovery = void 0;
        }
      };
      recovery.then(cleanup, cleanup);
    }
    return this._closedConnectionRecovery.promise;
  }
  async _runClosedConnectionRecovery(clientFailureId, failureKind) {
    const stopWatch = StopWatch.create();
    const result = await this._doRecoverFromClosedConnection(clientFailureId);
    reportCopilotClientRecovery(this._telemetryService, {
      clientFailureId,
      failureKind,
      durationMs: stopWatch.elapsed(),
      failedTurnCount: result.failedTurnIds.size,
      stopSucceeded: result.stopSucceeded
    });
    return result;
  }
  async _doRecoverFromClosedConnection(clientFailureId) {
    this._logService.error("[Copilot] Recovering from closed SDK connection");
    const failedTurnIds = /* @__PURE__ */ new Set();
    const error = {
      errorType: "providerConnectionClosed",
      message: localize("copilotAgent.connectionClosed", "Copilot stopped unexpectedly. Retry your request.")
    };
    for (const chat of this._allLiveSessions()) {
      const clientContext = chat.currentTurnClientContext;
      const failedTurnId = chat.failActiveTurn(error);
      if (failedTurnId) {
        failedTurnIds.add(failedTurnId);
        reportCopilotClientRecoveryTurn(
          this._telemetryService,
          clientFailureId,
          createCopilotFailureCorrelation(chat.sessionUri, chat.chatUri, failedTurnId, chat.sessionId, clientContext)
        );
      }
    }
    this._chatEntriesBySdkId.clearAndDisposeAll();
    let stopSucceeded = true;
    try {
      await this._stopClient();
    } catch (error2) {
      stopSucceeded = false;
      this._logService.error(error2, "[Copilot] Failed to stop closed SDK client");
    }
    this._capiModels = [];
    this._publishModels();
    return { failedTurnIds, stopSucceeded };
  }
  async _retryAfterClosedConnection(operation, task, correlation) {
    try {
      return await task();
    } catch (error) {
      if (!await this._recoverFromClosedConnection(error, operation, correlation)) {
        throw error;
      }
      return task();
    }
  }
  _clientFailureCorrelation(chat, turnId, operationContext) {
    const context = this._resolveSendChatContext(chat, operationContext);
    const clientTelemetryContext = URI.isUri(operationContext) ? void 0 : operationContext?.clientTelemetryContext;
    return createCopilotFailureCorrelation(context.configurationResource, chat, turnId, context.target?.sessionId ?? context.configurationId, clientTelemetryContext);
  }
  /** Number of live chats (default or peer, across all sessions) with an in-flight turn. */
  _chatsWithActiveTurn() {
    return this._allLiveSessions().filter((session) => session.hasActiveTurn).length;
  }
  _createCopilotClient(options) {
    return new CopilotClient(options);
  }
  // ---- auth ---------------------------------------------------------------
  getDescriptor() {
    return {
      provider: "copilotcli",
      displayName: "Copilot",
      description: localize("copilotAgent.description", "Copilot SDK agent running in the local agent host process"),
      capabilities: {
        multipleChats: { fork: true, sideChat: true },
        ...this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
      }
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostCopilotMultiRootEnabledConfigKey) === true;
  }
  getProtectedResources() {
    const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    return [
      allowSignedOutWhenUsable && this._byokModels.length > 0 ? { ...copilotResource, required: false } : copilotResource,
      this._gitHubEndpointService.getRepoResource()
    ];
  }
  async getNetworkDiagnosticsEndpoints() {
    let capiUrl = process.env["VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE"] || COPILOT_CAPI_URL;
    if (this._githubToken) {
      try {
        capiUrl = await this._copilotApiService.resolveApiEndpoint(this._githubToken) || capiUrl;
      } catch (error) {
        this._logService.debug(`[Copilot] CAPI endpoint discovery for network diagnostics failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const capiPingUrl = new URL(capiUrl);
    capiPingUrl.pathname = `${capiPingUrl.pathname.replace(/\/$/, "")}/_ping`;
    return [
      { name: "GitHub API", url: this._gitHubEndpointService.getApiBaseUri() },
      { name: "Copilot API (CAPI)", url: capiPingUrl.toString() }
    ];
  }
  async getNetworkDiagnosticsAccount() {
    return this._githubToken ? this._copilotApiService.resolveUserLogin?.(this._githubToken) : void 0;
  }
  async getManagedSettingsDiagnostics() {
    this._logService.debug("[Copilot] Collecting runtime managed-settings diagnostics");
    let stage = "resolving the Copilot CLI path";
    const diagnostics = (async () => {
      const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
      const cliPath = await resolveCopilotCliPath(nodeModulesUri);
      const runtimeSdkPath = join(dirname(cliPath), "sdk", "index.js");
      stage = "checking the Copilot runtime SDK";
      if (!await fileExists(runtimeSdkPath)) {
        throw new Error(`Copilot runtime SDK not found at ${runtimeSdkPath}`);
      }
      stage = "loading the Copilot runtime SDK";
      const runtimeSdk = await import(pathToFileURL(runtimeSdkPath).href);
      if (!isCopilotRuntimeManagedSettingsSdk(runtimeSdk)) {
        throw new Error("Copilot runtime SDK does not expose getManagedSettings()");
      }
      stage = "resolving the proxy";
      const proxy = await this._resolveProxyForSdk();
      stage = "querying native MDM and GitHub managed settings";
      return getCopilotManagedSettingsDiagnostics(
        runtimeSdk,
        this._githubToken,
        this._gitHubEndpointService.getEnterpriseUri() ?? "https://github.com",
        AbortSignal.timeout(COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS),
        COPILOT_MANAGED_SETTINGS_QUERY_TIMEOUT_MS,
        proxy
      );
    })();
    const result = await raceTimeout(diagnostics, COPILOT_MANAGED_SETTINGS_DIAGNOSTICS_TIMEOUT_MS);
    if (!result) {
      this._logService.warn(`[Copilot] Runtime managed-settings diagnostics timed out while ${stage}`);
      throw new Error(`Copilot runtime diagnostics exceeded 4.5 seconds while ${stage}.`);
    }
    this._logService.debug("[Copilot] Runtime managed-settings diagnostics collected");
    return {
      ...result.resolved,
      ...result.account ? { account: result.account } : {}
    };
  }
  getCustomizations() {
    return this._plugins.getConfiguredHostCustomizations();
  }
  /** Records the latest host snapshot for `session`; `undefined` means "not published yet", not "empty". */
  _rememberHostCustomizations(session, customizations) {
    if (customizations) {
      this._hostCustomizations.set(session, customizations);
    }
  }
  /** Refreshes the retained host snapshot from a chat-addressed operation context. */
  _noteHostCustomizations(context) {
    if (!context || URI.isUri(context)) {
      return;
    }
    this._rememberHostCustomizations(context.configurationResource, resolveAgentHostCustomizations(context));
  }
  /** Returns the retained host snapshot for `session`, or a stable empty singleton if none was published. */
  _retainedHostCustomizations(session) {
    return this._hostCustomizations.get(session) ?? NO_HOST_CUSTOMIZATIONS;
  }
  /** `hostCustomizations` refreshes the retained host snapshot before plugin/MCP resolution. */
  async getChatCustomizations(chat, context, hostCustomizations) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    this._rememberHostCustomizations(session, hostCustomizations);
    const anchors = await this._getSessionCustomizationAnchors(session);
    const activeClient = this._getOrCreateActiveClient(session, anchors.directory);
    if (anchors.applyAdditional) {
      activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
    }
    const fromPlugins = await activeClient.pluginController.getCustomizationsSettled();
    const sessionChat = this._findSessionChat(session);
    const topLevelMcp = activeClient.pluginController.resolveTopLevelMcpCustomizations(
      sessionChat?.topLevelMcpCustomizations() ?? [],
      sessionChat?.mcpServerOwners?.()
    );
    const customizations = [...fromPlugins, ...topLevelMcp];
    return applyMcpServerEnablement(customizations, this._retainedHostCustomizations(session));
  }
  async handleMcpRequest(session, serverName, method, params) {
    const entry = this._findSessionChat(session);
    if (!entry) {
      throw new Error(`Method not found: no active session ${AgentSession.id(session)}`);
    }
    return entry.handleMcpRequest(serverName, method, params);
  }
  getMcpServerOwners(session) {
    return this._findSessionChat(session)?.mcpServerOwners();
  }
  async startMcpServer(session, id) {
    await this._findSessionChat(session)?.startMcpServer(id);
  }
  async stopMcpServer(session, id) {
    await this._findSessionChat(session)?.stopMcpServer(id);
  }
  /**
   * The gated additional (non-primary) roots for a session: the tail of the
   * ordered working-directory set when multi-root is enabled, else empty (so
   * single-root / flag-off is byte-identical). Used both to anchor
   * customization discovery and to populate the launch plan's
   * `additionalDirectories`, keeping the SDK's granted roots and discovery in
   * lockstep — so a session created while multi-root was enabled falls back to
   * a single root when resumed after the flag is turned off.
   */
  _additionalCustomizationDirectories(workingDirectories) {
    if (!this._isMultiRootEnabled() || !workingDirectories || workingDirectories.length <= 1) {
      return [];
    }
    return workingDirectories.slice(1);
  }
  /**
   * Resolves the customization anchor(s) for a session. `directory` is the
   * primary (index 0) anchor — the worktree for worktree-isolated sessions.
   * `additionalDirectories` are the non-primary roots to attach to discovery,
   * and are applied only when `applyAdditional` is true:
   * - **provisional** (pre-send) sessions carry the client-supplied set, whose
   *   non-primary folders are stable workspace folders that can be discovered
   *   immediately (the worktree, if any, only affects index 0 at send);
   * - **not-yet-live** sessions carry the persisted set from metadata;
   * - **live** (active) sessions manage their own tail via materialize/resume,
   *   so `applyAdditional` is false to avoid clobbering it.
   */
  async _getSessionCustomizationAnchors(session) {
    const sessionId = AgentSession.id(session);
    const provisional = this._provisionalSessions.get(sessionId);
    if (provisional) {
      return {
        directory: provisional.workingDirectory,
        additionalDirectories: this._additionalCustomizationDirectories(provisional.workingDirectories),
        applyAdditional: true
      };
    }
    const entry = this._findSessionChat(session);
    if (entry) {
      return { directory: entry.customizationDirectory, additionalDirectories: [], applyAdditional: false };
    }
    const metadata = await this._readSessionMetadata(session);
    return {
      directory: metadata.workingDirectory ?? metadata.customizationDirectory,
      additionalDirectories: this._additionalCustomizationDirectories(metadata.workingDirectories),
      applyAdditional: true
    };
  }
  async authenticate(resource, token) {
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    await this._authenticationSequencer.queue(async () => {
      this._authenticationRequired.set(void 0, void 0);
      await this._applyGitHubToken(token || void 0);
    });
    return true;
  }
  async _applyGitHubToken(token) {
    if (this._githubToken === token) {
      return;
    }
    this._logService.info(`[Copilot] Auth token ${token ? "updated" : "cleared"}`);
    this._githubToken = token;
    this._updateRestrictedTelemetry(token);
    if (!token) {
      await this._requestClientRestart("GitHub authentication cleared");
      void this._scheduleModelRefresh();
      return;
    }
    const host = this._gitHubEndpointService.getEnterpriseUri() ?? "https://github.com";
    let restartRequired = false;
    for (const session of this._allLiveSessions()) {
      try {
        const result = await session.updateGitHubCredentials(host, token);
        if (!result.success) {
          restartRequired = true;
          this._logService.warn(`[Copilot:${session.sessionId}] GitHub credential update was rejected; scheduling a safe CopilotClient restart`);
        } else if (result.copilotUserResolved === false) {
          this._logService.warn(`[Copilot:${session.sessionId}] GitHub credentials were updated, but Copilot user metadata could not be resolved; plan, quota, and billing metadata may be degraded. Reauthenticate to restore it.`);
        }
      } catch (error) {
        restartRequired = true;
        this._logService.warn(`[Copilot:${session.sessionId}] Failed to update GitHub credentials; scheduling a safe CopilotClient restart: ${getErrorMessage(error)}`);
      }
    }
    if (restartRequired) {
      await this._requestClientRestart("GitHub credential update failed");
    } else {
      await this._restartClientIfProxyChanged();
    }
    await this._resolveCopilotSku(token);
    void this._scheduleModelRefresh();
  }
  _handleCopilotSessionAuthRequired() {
    this._authenticationRequired.set({
      resource: this._gitHubEndpointService.getCopilotResource(),
      reason: AuthRequiredReason.Expired
    }, void 0);
  }
  async _resolveCopilotSku(githubToken) {
    try {
      const copilotSku = await this._copilotApiService.resolveCopilotSku?.(githubToken);
      if (copilotSku && this._githubToken === githubToken) {
        this._telemetryService.setCommonProperty("copilotSku", copilotSku);
      }
    } catch (err) {
      this._logService.debug(`[Copilot] SKU resolution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async handleAuthenticationToken(params) {
    let handled = false;
    for (const session of this._allLiveSessions()) {
      const didHandle = await session.resolveMcpAuthentication(params);
      handled ||= didHandle;
    }
    return handled;
  }
  _updateRestrictedTelemetry(githubToken) {
    this._applyRestrictedTelemetry(void 0);
    if (githubToken) {
      void this._resolveRestrictedTelemetry(githubToken);
    }
  }
  async _resolveRestrictedTelemetry(githubToken) {
    try {
      const ctx = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
      if (this._githubToken !== githubToken) {
        return;
      }
      this._applyRestrictedTelemetry({
        ...ctx,
        telemetryEndpoint: toRestrictedTelemetryEndpoint(ctx.telemetryEndpoint)
      });
    } catch (err) {
      this._logService.debug(`[Copilot] Restricted telemetry resolution failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  _applyRestrictedTelemetry(context) {
    const rtEnabled = context?.restrictedTelemetryEnabled === true;
    if (rtEnabled !== this._restrictedTelemetryEnabled) {
      this._restrictedTelemetryEnabled = rtEnabled;
      this._logService.info(`[Copilot] Enhanced (restricted) telemetry ${rtEnabled ? "enabled for this account" : "disabled"}`);
      this._onDidChangeRestrictedTelemetry.fire();
    }
    if (isAgentHostTelemetryService(this._telemetryService)) {
      this._telemetryService.setRestrictedTelemetryEnabled(rtEnabled);
      this._telemetryService.setCopilotTrackingId(context?.trackingId);
      this._telemetryService.setRestrictedTelemetryEndpoint(context?.telemetryEndpoint);
    }
  }
  async _routeGitHubTelemetry(notification) {
    const additionalProperties = { initiatorClientType: this._clientTypeForTelemetry(notification.sessionId) };
    const router = this._githubTelemetryRouter;
    if (!router?.isTarget(notification)) {
      this._gitHubTelemetryForwarder.forward(notification, this._turnIdForTelemetry(notification.sessionId));
      return;
    }
    if (!notification.restricted) {
      await router.route(notification, void 0, additionalProperties);
      return;
    }
    const sessionId = notification.sessionId;
    const githubToken = this._githubToken;
    if (!githubToken) {
      await router.route(notification, void 0, additionalProperties);
      return;
    }
    try {
      const context = await this._copilotApiService.resolveRestrictedTelemetryContext(githubToken);
      if (this._githubToken !== githubToken) {
        return;
      }
      await router.route(notification, {
        restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
        trackingId: context.trackingId,
        telemetryEndpoint: toRestrictedTelemetryEndpoint(context.telemetryEndpoint),
        isInternal: context.isInternal === true,
        userName: context.userName,
        isVscodeTeamMember: context.isVscodeTeamMember === true
      }, additionalProperties);
    } catch (error) {
      this._logService.debug(`[Copilot:${sessionId}] Restricted telemetry context resolution failed; dropping ${notification.event.kind}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  _clientTypeForTelemetry(sdkSessionId) {
    return sdkSessionId ? this._findSessionBySdkId(sdkSessionId)?.currentTurnClientType ?? AgentHostClientType.Unknown : AgentHostClientType.Unknown;
  }
  _turnIdForTelemetry(sdkSessionId) {
    return sdkSessionId ? this._findSessionBySdkId(sdkSessionId)?.currentTurnId : void 0;
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
   * never rejects — {@link _refreshModels} already logs and retains the last
   * known-good list on failure.
   *
   * Only safe for callers with no new input to apply (the host's periodic
   * scheduler). Triggers that invalidate the in-flight request — a rotated
   * token, a restarted client — must call {@link _scheduleModelRefresh} so they
   * are not answered by a refresh bound to the superseded input.
   */
  refreshModels() {
    return this._scheduledModelRefresh?.deferred.p ?? this._modelRefreshInFlight ?? this._startModelRefresh(++this._modelCatalogGeneration);
  }
  /**
   * Invalidates an in-flight refresh immediately, then starts one refresh on
   * the next task. Repeated lifecycle triggers before that task
   * share the same deferred and enumerate only the final token/client source.
   */
  _scheduleModelRefresh() {
    const generation = ++this._modelCatalogGeneration;
    if (this._scheduledModelRefresh) {
      this._scheduledModelRefresh.generation = generation;
      return this._scheduledModelRefresh.deferred.p;
    }
    const scheduled = { deferred: new DeferredPromise(), generation };
    this._scheduledModelRefresh = scheduled;
    this._modelRefreshSchedule.value = disposableTimeout(() => {
      void (async () => {
        try {
          await this._clientStopping;
          if (this._scheduledModelRefresh !== scheduled) {
            return;
          }
          this._scheduledModelRefresh = void 0;
          this._modelRefreshSchedule.clear();
          await this._startModelRefresh(scheduled.generation);
        } catch (err) {
          this._logService.error(err, "[Copilot] Failed to schedule model refresh");
        } finally {
          if (this._scheduledModelRefresh === scheduled) {
            this._scheduledModelRefresh = void 0;
            this._modelRefreshSchedule.clear();
          }
          scheduled.deferred.complete();
        }
      })();
    }, 0);
    return scheduled.deferred.p;
  }
  _startModelRefresh(generation) {
    const refresh = this._refreshModels(0, generation).finally(() => {
      if (this._modelRefreshInFlight === refresh) {
        this._modelRefreshInFlight = void 0;
      }
    });
    this._modelRefreshInFlight = refresh;
    return refresh;
  }
  async _refreshModels(attempt = 0, generation = this._modelCatalogGeneration) {
    this._modelRefreshRetry.clear();
    if (this._shutdownPromise) {
      return;
    }
    const tokenAtRefreshStart = this._githubToken;
    if (!tokenAtRefreshStart) {
      this._capiModels = [];
      this._publishModels();
      return;
    }
    try {
      const models = await this._listModels(tokenAtRefreshStart);
      if (this._githubToken === tokenAtRefreshStart && this._modelCatalogGeneration === generation) {
        this._capiModels = models;
        this._publishModels();
      }
    } catch (err) {
      if (this._githubToken !== tokenAtRefreshStart || this._modelCatalogGeneration !== generation || this._shutdownPromise) {
        return;
      }
      if (/\b401\b/.test(getErrorMessage(err))) {
        this._handleCopilotSessionAuthRequired();
      }
      await this._recoverFromClosedConnection(err, "modelRefresh");
      if (attempt + 1 < this._modelRefreshMaxAttempts) {
        const delay = this._modelRefreshBackoff(attempt);
        this._logService.warn(`[Copilot] Failed to refresh models (attempt ${attempt + 1}), retrying in ${delay}ms`, err);
        this._modelRefreshRetry.value = disposableTimeout(() => {
          void this._refreshModels(attempt + 1, generation);
        }, delay);
        return;
      }
      this._logService.error(err, "[Copilot] Failed to refresh models");
      this._publishModels();
    }
  }
  /**
   * Re-emit the merged CAPI + BYOK model list to the picker. A fresh array is
   * allocated each call so the observable always notifies its consumers.
   */
  _publishModels() {
    this._models.set([...this._capiModels, ...this._byokModels], void 0);
  }
  /**
   * (Re)publish the renderer BYOK models from the bridge registry's serving
   * window. Triggered when any renderer bridge connects, disconnects, or
   * reports a model change — the registry owns enumeration (with its own
   * connect-time retry) and caches the serving window's models, so this is a
   * cheap synchronous read of that cache.
   *
   * Each model is surfaced under the provider-qualified id `vendor/[group/]id` so a
   * selection round-trips to the per-session provider config synthesized by
   * `resolveByokSessionConfig`.
   */
  _refreshByokModels() {
    if (this._shutdownPromise) {
      return;
    }
    this._byokModels = this._byokBridgeRegistry.getModels().map((m) => {
      const byokMeta = createAgentModelByokMeta(m.modelIdentifier);
      const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, m.defaultReasoningEffort, m.id);
      return {
        provider: this.id,
        id: getByokLmAgentModelId(m),
        name: m.name ?? m.id,
        maxContextWindow: m.maxContextWindowTokens,
        supportsVision: m.supportsVision ?? false,
        ...thinkingLevel ? { configSchema: { type: "object", properties: { [ThinkingLevelConfigKey]: thinkingLevel } } } : {},
        ...byokMeta && { _meta: byokMeta }
      };
    });
    this._logService.trace(`[Copilot] Found ${this._byokModels.length} BYOK models${this._byokModels.length ? ": " + this._byokModels.map((m) => m.name).join(", ") : ""}`);
    this._publishModels();
  }
  /**
   * Equal-jitter exponential backoff for model-refresh retries. Doubles the
   * base delay per attempt (capped at {@link _modelRefreshMaxDelayMs}) and
   * picks a random point in the upper half of that window, so the returned
   * delay lands in `[exp/2, exp]`. The jitter avoids synchronized retries
   * across windows/agents hitting a shared rate limit, while the `exp/2`
   * floor keeps a minimum spacing between attempts.
   */
  _modelRefreshBackoff(attempt) {
    const exp = Math.min(this._modelRefreshMaxDelayMs, this._modelRefreshBaseDelayMs * 2 ** attempt);
    return Math.round(exp / 2 + Math.random() * (exp / 2));
  }
  _stopClient() {
    this._pendingClientRestartReasons.clear();
    if (this._clientStopping) {
      return this._clientStopping;
    }
    const stopping = (async () => {
      const clientStarting = this._clientStarting;
      if (clientStarting) {
        try {
          await clientStarting;
        } catch {
        }
      }
      const client = this._client;
      this._client = void 0;
      this._clientStarting = void 0;
      await client?.stop();
      await this._sessionLauncher.disposeByokProxyHandle();
    })().finally(() => {
      if (this._clientStopping === stopping) {
        this._clientStopping = void 0;
      }
    });
    this._clientStopping = stopping;
    return stopping;
  }
  // ---- client lifecycle ---------------------------------------------------
  async _ensureClient() {
    if (this._shutdownPromise) {
      throw new CancellationError();
    }
    while (this._clientStopping) {
      await this._clientStopping;
      if (this._shutdownPromise) {
        throw new CancellationError();
      }
    }
    if (this._client) {
      return this._client;
    }
    if (this._clientStarting) {
      return this._clientStarting;
    }
    const sessionSyncAtStartup = this._isSessionSyncEnabled();
    const rubberDuckAtStartup = this._isRubberDuckEnabled();
    const copilotSdkLogLevelSettingAtStartup = this._getCopilotSdkLogLevelSetting();
    const enterpriseHostAtStartup = this._getEnterpriseHost();
    const systemProxyEnabledAtStartup = this._isSystemProxyEnabled();
    const clientStarting = (async () => {
      this._logService.info("[Copilot] Starting CopilotClient...");
      const env = createCopilotCliEnvironment();
      delete env["COPILOT_MODEL_FAMILY"];
      await this._configureProxyEnv(env);
      if (process.platform === "linux") {
        const enabledFlags = env["COPILOT_CLI_ENABLED_FEATURE_FLAGS"];
        const flags = new Set((enabledFlags ?? "").split(",").map((f) => f.trim()).filter(Boolean));
        flags.add("SHELL_SPAWN_BACKEND");
        env["COPILOT_CLI_ENABLED_FEATURE_FLAGS"] = [...flags].join(",");
      }
      env["GITHUB_COPILOT_INTEGRATION_ID"] = COPILOT_INTEGRATION_ID;
      this._logService.info(`[Copilot] Set CLI env: GITHUB_COPILOT_INTEGRATION_ID=${COPILOT_INTEGRATION_ID}`);
      const enterpriseHost = this._getEnterpriseHost();
      if (enterpriseHost) {
        env["COPILOT_GH_HOST"] = enterpriseHost;
        this._logService.info(`[Copilot] Set CLI env: COPILOT_GH_HOST=${enterpriseHost}`);
      }
      if (this._isRubberDuckEnabled()) {
        env["RUBBER_DUCK_AGENT"] = "true";
      } else {
        delete env["RUBBER_DUCK_AGENT"];
      }
      const nodeModulesUri = FileAccess.asFileUri(getAppNodeModulesPath());
      const cliPath = await resolveCopilotCliPath(nodeModulesUri);
      env["MXC_BIN_DIR"] = URI.joinPath(nodeModulesUri, "@microsoft", "mxc-sdk", "bin").fsPath;
      const resolvedRgDiskPath = await rgDiskPath();
      const rgDir = dirname(resolvedRgDiskPath);
      const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      const currentPath = env[pathKey];
      env[pathKey] = currentPath ? `${currentPath}${delimiter}${rgDir}` : rgDir;
      this._logService.info(`[Copilot] Resolved CLI path: ${cliPath}`);
      const telemetry = await this._otelService.getSdkTelemetryConfig();
      const nativeTelemetry = await this._otelService.getNativeSdkTelemetryConfig();
      if (nativeTelemetry) {
        env["OTEL_SERVICE_NAME"] = "github-copilot";
        env["OTEL_RESOURCE_ATTRIBUTES"] = Object.entries(nativeTelemetry.resourceAttributes).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join(",");
      }
      if (nativeTelemetry?.traces) {
        env["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = nativeTelemetry.traces.endpoint;
        env["OTEL_EXPORTER_OTLP_TRACES_PROTOCOL"] = nativeTelemetry.traces.protocol;
      }
      if (nativeTelemetry?.external) {
        env["OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"] = resolveCopilotOtlpMetricsEndpoint(nativeTelemetry.external.endpoint, nativeTelemetry.external.protocol);
        env["OTEL_EXPORTER_OTLP_METRICS_PROTOCOL"] = nativeTelemetry.external.protocol;
      } else if (nativeTelemetry) {
        env["OTEL_METRICS_EXPORTER"] = "none";
      }
      const copilotSdkLogLevelAtStartup = this._resolveCopilotSdkLogLevel(copilotSdkLogLevelSettingAtStartup);
      const clientOptions = {
        useLoggedInUser: false,
        connection: RuntimeConnection.forStdio({ path: cliPath }),
        env,
        telemetry,
        logLevel: copilotSdkLogLevelAtStartup,
        enableRemoteSessions: sessionSyncAtStartup,
        onGetTraceContext: () => this._otelService.getCurrentTraceContext() ?? {},
        onGitHubTelemetry: (notification) => {
          void this._routeGitHubTelemetry(notification).catch((err) => this._logService.trace(`[Copilot] GitHub telemetry routing failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      };
      const client = this._createCopilotClient(clientOptions);
      try {
        await client.start();
      } catch (error) {
        const failureKind = classifyCopilotClientFailure(error);
        if (failureKind && error instanceof Error) {
          reportCopilotClientFailure(this._telemetryService, generateUuid(), failureKind, "startClient", this._chatsWithActiveTurn(), false, error);
          this._reportedClientFailures.add(error);
        }
        throw error;
      }
      if (this._shutdownPromise) {
        await client.stop();
        throw new CancellationError();
      }
      if (this._isSessionSyncEnabled() !== sessionSyncAtStartup || this._isRubberDuckEnabled() !== rubberDuckAtStartup || this._getCopilotSdkLogLevelSetting() !== copilotSdkLogLevelSettingAtStartup || this._getEnterpriseHost() !== enterpriseHostAtStartup || this._isSystemProxyEnabled() !== systemProxyEnabledAtStartup) {
        await client.stop();
        throw new Error("Copilot startup config changed while the client was starting");
      }
      this._logService.info("[Copilot] CopilotClient started successfully");
      this._client = client;
      this._clientStarting = void 0;
      return client;
    })();
    this._clientStarting = clientStarting;
    void clientStarting.catch(() => {
      this._clientStarting = void 0;
    });
    return clientStarting;
  }
  // ---- session management -------------------------------------------------
  _createThinkingLevelConfigSchemaProperty(reasoningEfforts, defaultReasoningEffort, modelId) {
    const supportedReasoningEfforts = reasoningEfforts?.filter(isCopilotReasoningEffort);
    if (!supportedReasoningEfforts?.length) {
      return void 0;
    }
    return {
      type: "string",
      title: localize("copilot.modelThinkingLevel.title", "Thinking Level"),
      description: localize("copilot.modelThinkingLevel.description", "Controls how much reasoning effort the model uses."),
      default: resolveDefaultReasoningEffort(supportedReasoningEfforts, defaultReasoningEffort, modelId),
      enum: [...supportedReasoningEfforts],
      enumLabels: supportedReasoningEfforts.map(getReasoningEffortLabel),
      enumDescriptions: supportedReasoningEfforts.map((value) => getReasoningEffortDescription(value) ?? "")
    };
  }
  /**
   * Synthesize a `contextSize` config property when the model exposes a `long_context` pricing tier with a distinct
   * context-max. Picker surfaces this as the "Context Size" button. Mirrors `getContextSizeOptions` in
   * `extensions/copilot/src/extension/chat/vscode-node/languageModelAccess.ts`.
   *
   * The `enum` values are the two context-window sizes (in tokens), smallest first, so the numeric token counts
   * flow to the client. The chosen value comes back in the model's `config` bag and is mapped to the SDK's
   * two-valued `contextTier` at the SDK boundary by {@link getCopilotContextTier}, using the model's long-context
   * window from {@link _longContextWindowFor}.
   */
  _createContextSizeConfigSchemaProperty(billing) {
    const tokenPrices = billing?.tokenPrices;
    const defaultMax = tokenPrices?.contextMax;
    const longContextMax = tokenPrices?.longContext?.contextMax;
    if (!defaultMax || !longContextMax || defaultMax >= longContextMax) {
      return void 0;
    }
    return {
      type: "number",
      title: localize("copilot.modelContextSize.title", "Context Size"),
      description: localize("copilot.modelContextSize.description", "Selects the context window size for this model."),
      default: hasLongContextSurcharge(billing) ? defaultMax : longContextMax,
      enum: [defaultMax, longContextMax],
      enumLabels: [formatTokenCount(defaultMax), formatTokenCount(longContextMax)],
      enumDescriptions: [
        localize("copilot.modelContextSize.default", "Default"),
        localize("copilot.modelContextSize.longerSessions", "Longer sessions")
      ]
    };
  }
  /**
   * The model's long-context window (in tokens): the largest size offered by its "Context Size" picker
   * (the max numeric value in the synthesized `contextSize` {@link ConfigPropertySchema.enum}). Used by
   * {@link getCopilotContextTier} to decide whether a numeric selection opts into `long_context`.
   * Returns `undefined` when the model exposes no such picker (or the model list isn't loaded yet),
   * leaving the SDK on its default tier.
   */
  _longContextWindowFor(modelId) {
    if (!modelId) {
      return void 0;
    }
    const windows = this._models.get().find((m) => m.id === modelId)?.configSchema?.properties?.[ContextSizeConfigKey]?.enum;
    const numericWindows = windows?.filter((w) => typeof w === "number");
    return numericWindows && numericWindows.length > 0 ? Math.max(...numericWindows) : void 0;
  }
  /**
   * Whether the model has a larger long-context window at no additional cost. When true, a session
   * with no explicit selection defaults to `long_context` while the picker still offers both sizes.
   */
  _isFreeLongContext(modelId) {
    return !!modelId && this._freeLongContextModels.has(modelId);
  }
  /**
   * Builds the open `_meta` model picker bag from the SDK's billing and picker metadata.
   */
  _createModelPickerMeta(modelInfo, billing) {
    return createPricingMetaFromBilling(billing, modelInfo.modelPickerPriceCategory, modelInfo.modelPickerCategory);
  }
  _createModelConfigSchema(m, billing) {
    const properties = {};
    const thinkingLevel = this._createThinkingLevelConfigSchemaProperty(m.supportedReasoningEfforts, void 0, m.id);
    if (thinkingLevel) {
      properties[ThinkingLevelConfigKey] = thinkingLevel;
    }
    const contextSize = this._createContextSizeConfigSchemaProperty(billing);
    if (contextSize) {
      properties[ContextSizeConfigKey] = contextSize;
    }
    if (Object.keys(properties).length === 0) {
      return void 0;
    }
    return { type: "object", properties };
  }
  _serializeModelSelection(model) {
    return JSON.stringify(model);
  }
  _parseModelSelection(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && typeof value.id === "string") {
        const modelSelection = { id: value.id };
        if (value.config && typeof value.config === "object") {
          const config = {};
          for (const [key, configValue] of Object.entries(value.config)) {
            if (typeof configValue === "string") {
              config[key] = configValue;
            }
          }
          if (Object.keys(config).length > 0) {
            modelSelection.config = config;
          }
        }
        return modelSelection;
      }
    } catch {
    }
    return { id: raw };
  }
  _serializeAgentSelection(agent) {
    return JSON.stringify({ uri: agent.uri });
  }
  _parseAgentSelection(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === "object" && typeof value.uri === "string") {
        return { uri: value.uri };
      }
    } catch {
    }
    return void 0;
  }
  /**
   * Resolves an {@link AgentSelection}'s SDK-facing name from the plugin
   * snapshot that is, or will be, applied to the SDK session.
   */
  _resolveAgentName(snapshot, agent) {
    for (const plugin of snapshot.plugins) {
      const found = plugin.agents.find((a) => a.uri.toString() === agent.uri);
      if (found) {
        return found.name;
      }
    }
    return void 0;
  }
  async listChatsToMigrate() {
    const sessions = await this._listSdkSessions("chats to migrate");
    if (!sessions) {
      return void 0;
    }
    const projectLimiter = new Limiter(4);
    const metadataLimiter = new Limiter(4);
    const projectByContext = /* @__PURE__ */ new Map();
    const mapped = await Promise.all(sessions.map((s) => metadataLimiter.queue(async () => {
      const session = AgentSession.uri(this.id, s.sessionId);
      const chat = URI.parse(buildDefaultChatUri(session));
      const metadata = await this._readStoredSessionMetadata(session);
      if (!metadata || !(metadata.model !== void 0 || metadata.agent !== void 0 || metadata.workingDirectory !== void 0 || metadata.workingDirectories !== void 0 || metadata.customizationDirectory !== void 0 || metadata.project !== void 0 || metadata.resolved || metadata.workspaceless !== void 0)) {
        return void 0;
      }
      let { project, resolved } = metadata;
      if (!resolved) {
        project = await this._resolveSessionProject(s.context, projectLimiter, projectByContext);
        void this._storeSessionProjectResolution(session, project);
      }
      const workingDirectories = metadata.workingDirectories ?? (typeof s.context?.workingDirectory === "string" ? [URI.file(s.context.workingDirectory)] : void 0);
      const result2 = {
        chat,
        startTime: s.startTime.getTime(),
        modifiedTime: s.modifiedTime.getTime(),
        project,
        summary: s.summary,
        workingDirectories
      };
      return result2;
    })));
    const result = mapped.filter((s) => s !== void 0);
    this._logService.info(`[Copilot] Found ${result.length} legacy sessions`);
    return result;
  }
  async _emitExtHostChats() {
    try {
      const chats = await this._discoverExtHostChats();
      if (chats && this._isMigrateLegacyCopilotCliEnabled()) {
        this._onDidDiscoverChats.fire(chats);
      }
    } catch (err) {
      this._logService.warn("[Copilot] Failed to emit extension-host chats", err);
    }
  }
  async _discoverExtHostChats() {
    const sessions = await this._listSdkSessions("extension-host chats");
    if (!sessions) {
      return void 0;
    }
    const projectLimiter = new Limiter(4);
    const metadataLimiter = new Limiter(4);
    const projectByContext = /* @__PURE__ */ new Map();
    const mapped = await Promise.all(sessions.map((s) => metadataLimiter.queue(async () => {
      if (typeof s.context?.workingDirectory !== "string" || !await this._isExtensionHostCliSession(s.sessionId)) {
        return void 0;
      }
      const session = AgentSession.uri(this.id, s.sessionId);
      if (await this._readStoredSessionMetadata(session)) {
        return void 0;
      }
      return {
        chat: URI.parse(buildDefaultChatUri(session)),
        startTime: s.startTime.getTime(),
        modifiedTime: s.modifiedTime.getTime(),
        project: await this._resolveSessionProject(s.context, projectLimiter, projectByContext),
        summary: s.summary,
        workingDirectories: [URI.file(s.context.workingDirectory)],
        _meta: withSessionEhcliAdoptable(void 0),
        external: false
      };
    })));
    return mapped.filter((chat) => chat !== void 0);
  }
  async _listSdkSessions(reason) {
    this._logService.info(`[Copilot] Listing ${reason}...`);
    try {
      return await this._retryAfterClosedConnection("listSessions", async () => {
        const client = await this._ensureClient();
        return client.listSessions();
      });
    } catch (err) {
      if (err instanceof CancellationError || classifyCopilotClientFailure(err) !== void 0) {
        this._logService.info(`[Copilot] Client unavailable while listing ${reason}: ${err instanceof Error ? err.message : String(err)}`);
        return void 0;
      }
      throw err;
    }
  }
  async getChatMetadata(chat, context, providerData) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    const sessionId = providerData ? decodeProviderData(providerData)?.sdkSessionId : AgentSession.id(session);
    if (!sessionId) {
      return void 0;
    }
    const storedMetadata = await this._readStoredSessionMetadata(session);
    const sessionMetadata = await this._retryAfterClosedConnection("getSessionMetadata", async () => {
      const client = await this._ensureClient();
      return client.getSessionMetadata(sessionId);
    }, createCopilotFailureCorrelation(session, chat, void 0, sessionId));
    if (!sessionMetadata) {
      return void 0;
    }
    let project = storedMetadata?.project;
    if (!storedMetadata?.resolved) {
      const projectLimiter = new Limiter(1);
      project = await this._resolveSessionProject(sessionMetadata?.context, projectLimiter, /* @__PURE__ */ new Map());
      if (storedMetadata) {
        void this._storeSessionProjectResolution(session, project);
      }
    }
    const workingDirectories = storedMetadata?.workingDirectories ?? (typeof sessionMetadata?.context?.workingDirectory === "string" ? [URI.file(sessionMetadata.context.workingDirectory)] : void 0);
    const adoptable = !storedMetadata && await this._isExtensionHostCliSession(sessionId);
    return {
      chat,
      startTime: sessionMetadata?.startTime.getTime() ?? Date.now(),
      modifiedTime: sessionMetadata?.modifiedTime.getTime() ?? Date.now(),
      project,
      summary: sessionMetadata?.summary,
      workingDirectories,
      _meta: adoptable ? withSessionEhcliAdoptable(void 0) : void 0
    };
  }
  async _listModels(gitHubToken) {
    this._logService.info("[Copilot] Listing models...");
    const client = await this._ensureClient();
    const { models } = await client.rpc.models.list({ gitHubToken });
    this._freeLongContextModels.clear();
    const result = models.map((m) => {
      const billing = normalizeCAPIBilling(m.billing);
      const configSchema = this._createModelConfigSchema(m, billing);
      const tokenPrices = billing?.tokenPrices;
      const hasLargerLongContext = !!tokenPrices?.contextMax && !!tokenPrices.longContext?.contextMax && tokenPrices.longContext.contextMax > tokenPrices.contextMax;
      if (hasLargerLongContext && !hasLongContextSurcharge(billing)) {
        this._freeLongContextModels.add(m.id);
      }
      return {
        provider: this.id,
        id: m.id,
        name: m.name,
        // Synthetic SDK entries like `auto` ship with `capabilities: {}` and
        // no fixed context window — surface them with maxContextWindow undefined.
        maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
        maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
        maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
        supportsVision: !!m.capabilities?.supports?.vision,
        configSchema,
        policyState: m.policy?.state,
        _meta: this._createModelPickerMeta(m, billing)
      };
    });
    this._logService.info(`[Copilot] Found ${result.length} models: ${result.map((m) => m.name).join(", ")}`);
    return result;
  }
  /**
   * Resolves the process root for a chat that carries its session's runtime:
   * the host-supplied primary folder, else a still-provisional session's
   * folder for an idempotent re-create, else — when the session is
   * workspace-less (no working directories supplied) — a stable per-session
   * scratch directory.
   */
  async _resolveCreateWorkingDirectory(options, sessionId, isWorkspaceless) {
    if (options.fork) {
      const sourceScope = this._resolveChatScope(options.fork.source);
      const sourceSessionId = AgentSession.id(sourceScope);
      const liveWorkingDirectory = this._findSessionBySdkId(sourceSessionId)?.workingDirectory;
      if (liveWorkingDirectory) {
        return liveWorkingDirectory;
      }
      const storedWorkingDirectory = (await this._readSessionMetadata(sourceScope)).workingDirectory;
      if (storedWorkingDirectory) {
        return storedWorkingDirectory;
      }
    }
    const existing = options.workingDirectories?.[0] ?? this._provisionalSessions.get(sessionId)?.workingDirectory;
    if (existing) {
      return existing;
    }
    if (isWorkspaceless) {
      const scratchDir = this._workspacelessScratchDir(sessionId);
      await fs.mkdir(scratchDir.fsPath, { recursive: true });
      return scratchDir;
    }
    const tmpPath = await fs.mkdtemp(join(os.tmpdir(), "agent-host-session-"));
    const workingDirectory = URI.file(tmpPath);
    this._logService.trace(`[Copilot] No workingDirectory provided, defaulting to temp directory: ${workingDirectory.fsPath}`);
    return workingDirectory;
  }
  /**
   * Stable per-session scratch directory for a workspace-less chat:
   * `<userHome>/.copilot/chats/<sessionId>`. Deterministic, persistent, and
   * cleaned up on session delete (see {@link _cleanupWorkspacelessScratchDir}).
   */
  _workspacelessScratchDir(sessionId) {
    return workspacelessScratchDir(this._environmentService.userHome, sessionId);
  }
  /** Ensures a workspace-less chat's scratch dir exists (mkdir -p), recreating it if it was reaped. */
  async _ensureWorkspacelessScratchDir(scratchDir, sessionId) {
    try {
      await fs.mkdir(scratchDir.fsPath, { recursive: true });
      this._logService.trace(`[Copilot:${sessionId}] Workspace-less scratch directory ready: ${scratchDir.fsPath}`);
    } catch (error) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to ensure workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /** Removes a workspace-less chat's stable scratch dir on session delete/dispose. */
  async _cleanupWorkspacelessScratchDir(scratchDir, sessionId) {
    try {
      await fs.rm(scratchDir.fsPath, { recursive: true, force: true });
      this._logService.trace(`[Copilot:${sessionId}] Removed workspace-less scratch directory: ${scratchDir.fsPath}`);
    } catch (error) {
      this._logService.warn(`[Copilot:${sessionId}] Failed to remove workspace-less scratch directory '${scratchDir.fsPath}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  // ---- Chat surface ------------------------------------------------------
  //
  // The chat-addressed operation surface (see
  // {@link IAgent.chats}). The orchestrator owns the feature-level
  // `(session, chat)` mapping and hands these methods a single, concrete chat
  // channel URI plus transient context when the operation needs the owning
  // session or storage scope. Routing reads only the exact chat backing map
  // and never recovers ownership by parsing the chat URI.
  /** Exact Copilot SDK session-id lookup; use chat-based helpers for routing. */
  _findSessionBySdkId(sdkSessionId) {
    return this._chatEntriesBySdkId.get(sdkSessionId)?.chatSession;
  }
  /** Returns the live chat whose persistence scope is the session itself. */
  _findSessionChat(session) {
    for (const entry of this._chatEntriesBySdkId.values()) {
      if (isEqual(entry.chatSession.resourceUri, session)) {
        return entry.chatSession;
      }
    }
    return void 0;
  }
  _findChatByUri(chat) {
    const chatKey = typeof chat === "string" ? chat : chat.toString();
    const backing = this._chatBackings.get(chatKey);
    return backing ? this._findSessionBySdkId(backing.sdkSessionId) : void 0;
  }
  _findBoundSessionChatUri(sessionId) {
    for (const [chatKey, backing] of this._chatBackings) {
      if (backing.sdkSessionId === sessionId) {
        return URI.parse(chatKey);
      }
    }
    return void 0;
  }
  /** Resolves the Copilot SDK conversation id backing a session URI, falling back to the AH session id. */
  _sdkConversationId(session) {
    const sessionId = AgentSession.id(session);
    return this._findSessionChat(session)?.sessionId ?? this._provisionalSessions.get(sessionId)?.sdkSessionId ?? this._chatBackings.get(buildDefaultChatUri(session))?.sdkSessionId ?? sessionId;
  }
  /** Returns the chat URI bound to the session-backed chat, if any. */
  _findSessionChatUri(session) {
    return this._findBoundSessionChatUri(this._sdkConversationId(session));
  }
  /** Normalizes an addressed chat operation and refreshes any host snapshot carried in its context. */
  _resolveChatContext(chat, sessionOrContext) {
    const explicit = resolveAgentChatContext(sessionOrContext, chat);
    this._noteHostCustomizations(sessionOrContext);
    return this._resolveExplicitChatContext(chat, explicit);
  }
  _resolveSendChatContext(chat, operationContext) {
    if (operationContext) {
      return this._resolveChatContext(chat, operationContext);
    }
    const chatKey = chat.toString();
    const backing = this._chatBackings.get(chatKey);
    const target = backing ? this._findSessionBySdkId(backing.sdkSessionId) : void 0;
    if (!backing || !target) {
      throw new Error(`Cold Copilot chat operation requires explicit host context: ${chatKey}`);
    }
    const ownerSession = target.ownerSessionUri ?? target.sessionUri;
    return {
      configurationResource: ownerSession,
      configurationId: AgentSession.id(ownerSession),
      resource: target.resourceUri,
      chat,
      chatKey,
      sdkSessionId: backing.sdkSessionId,
      sequencerKey: backing.sdkSessionId,
      target
    };
  }
  /** Legacy truncation may still omit context for a live chat. */
  _resolveTruncateChatContext(chat, operationContext) {
    if (operationContext) {
      return this._resolveChatContext(chat, operationContext);
    }
    const chatKey = chat.toString();
    const backing = this._chatBackings.get(chatKey);
    const target = backing ? this._findSessionBySdkId(backing.sdkSessionId) : void 0;
    if (!backing || !target) {
      throw new Error(`Cold Copilot chat operation requires explicit host context: ${chatKey}`);
    }
    const ownerSession = target.ownerSessionUri ?? target.sessionUri;
    return {
      configurationResource: ownerSession,
      configurationId: AgentSession.id(ownerSession),
      resource: target.resourceUri,
      chat,
      chatKey,
      sdkSessionId: backing.sdkSessionId,
      sequencerKey: backing.sdkSessionId,
      target
    };
  }
  _resolveExplicitChatContext(chat, context) {
    const chatKey = chat.toString();
    const backing = this._chatBackings.get(chatKey);
    const boundTarget = backing ? this._findSessionBySdkId(backing.sdkSessionId) : void 0;
    const configurationId = AgentSession.id(context.configurationResource);
    const target = boundTarget;
    const sdkSessionId = backing?.sdkSessionId;
    return {
      configurationResource: context.configurationResource,
      configurationId,
      resource: context.resource,
      chat,
      chatKey,
      sdkSessionId,
      sequencerKey: sdkSessionId ?? chatKey,
      target
    };
  }
  _getRuntimeSlashCommands(sessionId, options) {
    const session = this._findSessionBySdkId(sessionId);
    if (session) {
      return session.getRuntimeSlashCommands(options) ?? [];
    }
    return this._slashCommandProvider.getSlashCommands(options);
  }
  /** Creates one exact chat backing: fresh, deferred, imported, forked, or side-chat. */
  async _createChat(chat, context, options = {}) {
    const scope = context.configurationResource;
    const chatKey = chat.toString();
    const preexisting = this._chatScopes.has(chatKey) || this._chatBackings.has(chatKey) || !!this._findChatByUri(chat);
    this._rememberChatScope(chat, scope, context.resource);
    try {
      if (options.deferBacking) {
        return await this._reserveChatBacking(chat, context, options);
      }
      if (options.importConversation) {
        return await this._importChatBacking(chat, context, options);
      }
      return await this._mintChatBacking(chat, context, options);
    } catch (error) {
      if (!preexisting) {
        await this._rollbackFailedChatCreate(chat, scope, options.workingDirectories === void 0);
      }
      throw error;
    }
  }
  /**
   * Undoes the bookkeeping {@link _createChat} recorded for `chat` before a
   * create attempt throws (client startup, import/resume, or fork/model/mint
   * failures), so a failed create never permanently pins the configuration
   * scope's shared runtime. Without this, the scope recorded by
   * {@link _rememberChatScope} before the failing operation stays in
   * {@link _chatScopes} forever, so {@link _remainingChatsForScope} never
   * reaches zero and the scope's ActiveClient/plugin/MCP state, session
   * lifetime, host customizations, scratch dir, and trace context leak for
   * the lifetime of the process.
   *
   * Only this chat's own membership/partial state is torn down here; the
   * scope's provider-owned resources are finalized — the same cleanup a
   * normal `disposeChat` runs once the last chat is gone — only when no
   * other chat still shares `scope`, so an earlier successful sibling create
   * keeps the resources it depends on.
   *
   * Callers must only invoke this for a chat that had no preexisting
   * binding when `_createChat` started; {@link _createChat} itself guards
   * that, so a duplicate/reconnect create attempt that fails never tears
   * down the live/provisional/restored binding it found already in place.
   */
  async _rollbackFailedChatCreate(chat, scope, workspacelessHint) {
    const chatKey = chat.toString();
    const scopeId = AgentSession.id(scope);
    this._chatScopes.delete(chatKey);
    this._chatStorageScopes.delete(chatKey);
    this._chatBackings.delete(chatKey);
    this._activeClients.get(scope)?.removeChat(chat);
    try {
      if (this._remainingChatsForScope(scope) === 0) {
        await this._finalizeConfigurationScope(scope, scopeId, workspacelessHint);
      }
    } catch (cleanupError) {
      this._logService.warn(`[Copilot] Failed to finalize configuration scope ${scope.toString()} after a failed chat creation: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
    }
  }
  /** Reserves an SDK id now and defers real session creation to the first send. */
  async _reserveChatBacking(chat, context, options) {
    const session = context.configurationResource;
    const sessionId = AgentSession.id(session);
    this._logService.info(`[Copilot] Creating chat ${chat.toString()} with a deferred backing... ${options.model ? `model=${options.model.id}` : ""}`);
    const sdkSessionId = generateUuid();
    const isWorkspaceless = options.workingDirectories === void 0;
    const workingDirectory = await this._resolveCreateWorkingDirectory(options, sessionId, isWorkspaceless);
    await this._ensureClient();
    const existing = this._findChatByUri(chat);
    if (existing) {
      this._logService.info(`[Copilot] createChat is a no-op: chat ${chat.toString()} is already backed by a live runtime`);
      const project2 = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      return {
        resolvedWorkingDirectory: workingDirectory,
        ...project2 ? { project: project2 } : {},
        ...this._chatBackingResult(sessionId, { sdkSessionId: existing.sessionId })
      };
    }
    const reserved = this._provisionalSessions.get(sessionId);
    if (options.activeClient) {
      const ac = this._getOrCreateActiveClient(session, workingDirectory);
      ac.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(options.workingDirectories));
      const seeded = options.activeClient;
      ac.toolSet.set(seeded.clientId, seeded.tools);
      ac.getOrCreateHandle(seeded.clientId, seeded.displayName);
      this._adoptClientChat(ac, seeded.clientId, chat);
      if (seeded.customizations !== void 0) {
        await ac.pluginController.sync(seeded.clientId, seeded.customizations, { quiet: true });
      }
    }
    const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
    if (!reserved) {
      this._resetSessionLifetime(sessionId);
      this._provisionalSessions.set(sessionId, {
        sessionId,
        sdkSessionId,
        sessionUri: session,
        chat,
        workingDirectory,
        workingDirectories: options.workingDirectories,
        model: options.model,
        agent: options.agent,
        project,
        workspaceless: isWorkspaceless
      });
      this._chatBackings.set(chat.toString(), { sdkSessionId });
    }
    this._logService.info(`[Copilot] Chat created; its backing stays deferred until the first send: ${session.toString()}`);
    return {
      resolvedWorkingDirectory: workingDirectory,
      provisional: true,
      ...project ? { project } : {},
      ...this._chatBackingResult(sessionId, { sdkSessionId: reserved?.sdkSessionId ?? sdkSessionId })
    };
  }
  /** Mints the chat's backing from an imported conversation supplied by Agent Host. */
  async _importChatBacking(chat, context, options) {
    const session = context.configurationResource;
    const sessionId = AgentSession.id(session);
    const workingDirectory = await this._resolveCreateWorkingDirectory(options, sessionId, options.workingDirectories === void 0);
    await this._ensureClient();
    if (!this._findSessionBySdkId(sessionId) && !this._provisionalSessions.has(sessionId)) {
      this._resetSessionLifetime(sessionId);
    }
    return this._importConversation(options, sessionId, workingDirectory, chat);
  }
  /** Seeds an imported conversation into the SDK store, then resumes it as a live editable chat. */
  async _importConversation(options, sessionId, workingDirectory, chat) {
    const importConfig = options.importConversation;
    const sessionUri = AgentSession.uri(this.id, sessionId);
    return this._queueSession(sessionId, async () => {
      this._logService.info(`[Copilot] Importing conversation into session ${sessionId} (${importConfig.turns.length} turns)`);
      const model = importConfig.model ?? options.model;
      const projectPromise = projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      const eventsPath = join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), "session-state", sessionId, "events.jsonl");
      const jsonl = buildSessionEventLogFromTurns(importConfig.turns, {
        sessionId,
        workingDirectory: workingDirectory.fsPath,
        model: model?.id
      });
      await fs.mkdir(dirname(eventsPath), { recursive: true });
      await fs.writeFile(eventsPath, jsonl, "utf8");
      const project = await projectPromise;
      await this._storeSessionMetadata(sessionUri, model, workingDirectory, options.workingDirectories ?? [workingDirectory], workingDirectory, project);
      if (options.agent !== void 0) {
        await this._storeSessionAgentMetadata(sessionUri, options.agent);
      }
      const imported = await this._resumeSession(sessionId, chat);
      this._logService.info(`[Copilot] Imported session created: ${sessionUri.toString()}`);
      return {
        resolvedWorkingDirectory: workingDirectory,
        ...project ? { project } : {},
        ...this._chatBackingResult(sessionId, { sdkSessionId: imported.sessionId })
      };
    });
  }
  /** Absolute path of an extension-host Copilot CLI sidecar file for `sessionId`. */
  _extensionHostCliSidecarPath(sessionId, fileName) {
    return join(getCopilotHomePath(this._environmentService.userHome.fsPath, process.env), "session-state", sessionId, fileName);
  }
  /**
   * Reads and parses the `vscode.metadata.json` marker for `sessionId`, or
   * `undefined` when it is missing/unreadable/malformed.
   */
  _readExtensionHostCliMarker(sessionId) {
    let cached = this._extensionHostCliMarkerCache.get(sessionId);
    if (!cached) {
      cached = fs.readFile(this._extensionHostCliSidecarPath(sessionId, "vscode.metadata.json"), "utf8").then((raw) => {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : void 0;
      }).catch(() => void 0);
      this._extensionHostCliMarkerCache.set(sessionId, cached);
    }
    return cached;
  }
  async _isExtensionHostCliSession(sessionId) {
    const marker = await this._readExtensionHostCliMarker(sessionId);
    if (!marker || Object.keys(marker).length === 0) {
      return false;
    }
    if (marker.origin !== void 0) {
      return marker.origin === EXTENSION_HOST_CLI_MARKER_ORIGIN;
    }
    return marker.repositoryProperties !== void 0 || marker.worktreeProperties !== void 0 || marker.workspaceFolder !== void 0;
  }
  /** Reads a legacy extension-host Copilot CLI custom title, if present. */
  async _readExtensionHostCliCustomTitle(sessionId) {
    const title = (await this._readExtensionHostCliMarker(sessionId))?.customTitle;
    return typeof title === "string" && title.trim() ? title : void 0;
  }
  /** Adopts a legacy extension-host Copilot CLI session in place when it is eligible on disk. */
  async ensureChatAdopted(chat, context) {
    const session = resolveAgentChatContext(context, chat).configurationResource;
    const sessionId = AgentSession.id(session);
    return this._queueSession(sessionId, async () => {
      const existing = await this._readStoredSessionMetadata(session);
      if (existing?.workingDirectory) {
        return { adopted: false, eligible: false };
      }
      if (!await this._isExtensionHostCliSession(sessionId)) {
        return { adopted: false, eligible: false };
      }
      const client = await this._ensureClient();
      const sdkMetadata = await client.getSessionMetadata(sessionId).catch(() => void 0);
      const workingDirectory = typeof sdkMetadata?.context?.workingDirectory === "string" ? URI.file(sdkMetadata.context.workingDirectory) : void 0;
      if (!workingDirectory) {
        return { adopted: false, eligible: true };
      }
      this._logService.info(`[Copilot] Adopting legacy session ${sessionId} in place (reusing on-disk events.jsonl)`);
      const project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
      const customTitle = await this._readExtensionHostCliCustomTitle(sessionId);
      await this._storeSessionMetadata(
        session,
        void 0,
        workingDirectory,
        [workingDirectory],
        workingDirectory,
        project,
        project !== void 0,
        { [SessionConfigKey.Isolation]: "folder" },
        customTitle,
        /* markRead */
        true
      );
      await this._adoptLegacyTurnUsage(session, sessionId);
      return { adopted: true, eligible: true };
    });
  }
  /**
   * Carries the per-request credit totals the extension host persisted in
   * `vscode.requests.metadata.json` into the adopted session's `turn_usage`
   * rows, so restored turns keep their "credits used" gauge. Best-effort: a
   * missing/malformed sidecar or a write failure must never fail adoption.
   *
   * Only ever called from {@link ensureChatAdopted} once a legacy extension-host
   * Copilot CLI session has passed every eligibility gate and is actually being
   * migrated — no native or non-VS Code Copilot session's usage is read or written.
   */
  async _adoptLegacyTurnUsage(session, sessionId) {
    const raw = await fs.readFile(this._extensionHostCliSidecarPath(sessionId, "vscode.requests.metadata.json"), "utf8").catch(() => void 0);
    if (raw === void 0) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return;
      }
      const rows = [];
      for (const entry of parsed) {
        const turnId = entry?.copilotRequestId;
        const credits = entry?.creditsUsed;
        if (typeof turnId !== "string" || !turnId || typeof credits !== "number" || !Number.isFinite(credits) || credits < 0) {
          continue;
        }
        rows.push({
          turnId,
          usage: {
            ...typeof entry.responseModelId === "string" && entry.responseModelId ? { model: entry.responseModelId } : {},
            _meta: { copilotUsage: { totalNanoAiu: Math.round(credits * NANO_AIU_PER_CREDIT) } }
          }
        });
      }
      if (rows.length === 0) {
        return;
      }
      const dbRef = this._sessionDataService.openDatabase(session);
      try {
        for (const row of rows) {
          await dbRef.object.setTurnUsage(row.turnId, JSON.stringify(row.usage));
        }
      } finally {
        dbRef.dispose();
      }
      this._logService.info(`[Copilot] Adopted ${rows.length} legacy turn usage records for session ${sessionId}`);
    } catch (err) {
      this._logService.warn(`[Copilot] Failed to adopt legacy turn usage for session ${sessionId}`, err);
    }
  }
  /** Materializes a provisional chat into a real SDK session immediately before first send. */
  async _materializeProvisional(sessionId, resolvedWorkingDirectories) {
    const provisional = this._provisionalSessions.get(sessionId);
    if (!provisional) {
      throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
    }
    const client = await this._ensureClient();
    const sessionUri = provisional.sessionUri;
    const sdkSessionId = provisional.sdkSessionId;
    const workingDirectory = resolvedWorkingDirectories?.[0] ?? provisional.workingDirectory;
    const customizationDirectory = workingDirectory ?? provisional.workingDirectory;
    const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
    activeClient.pluginController.reanchor(customizationDirectory);
    activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(resolvedWorkingDirectories));
    const snapshot = await activeClient.snapshot((this._findSessionChatUri(sessionUri) ?? sessionUri).toString());
    const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, workingDirectory);
    let agentSession;
    let agent;
    try {
      const resolvedAgent = await this._resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory);
      agent = resolvedAgent?.agent;
      const launchPlan = {
        kind: "create",
        client,
        sessionId: sdkSessionId,
        workingDirectory,
        additionalDirectories: this._additionalCustomizationDirectories(resolvedWorkingDirectories),
        resolvedAgentName: resolvedAgent?.name,
        snapshot,
        disabledRootMcpServers: this._disabledRootMcpServers(sessionUri, sdkSessionId, snapshot),
        activeClientToolSet: activeClient.toolSet,
        shellManager,
        githubToken: this._githubToken,
        model: provisional.model,
        longContextWindow: this._longContextWindowFor(provisional.model?.id),
        freeLongContext: this._isFreeLongContext(provisional.model?.id),
        workspaceless: provisional.workspaceless
      };
      const chatChannelUri = this._findBoundSessionChatUri(sdkSessionId) ?? sessionUri;
      agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient, {
        sessionUri,
        chatChannelUri,
        resource: sessionUri
      });
      await agentSession.initializeSession();
      this._registerInitializedSession(sdkSessionId, agentSession, activeClient, launchPlan.client);
    } catch (error) {
      agentSession?.dispose();
      throw error;
    }
    const project = await projectFromCopilotContext({ cwd: workingDirectory?.fsPath }, this._gitService);
    const materializedWorkingDirectories = resolvedWorkingDirectories ?? [workingDirectory];
    this._provisionalSessions.delete(sessionId);
    await this._storeSessionMetadata(sessionUri, provisional.model, workingDirectory, materializedWorkingDirectories, customizationDirectory, project, true);
    if (agent !== void 0) {
      await this._storeSessionAgentMetadata(sessionUri, agent);
    }
    this._checkpointService.captureBaselineCheckpoint(sessionUri, materializedWorkingDirectories).catch((err) => {
      this._logService.warn(`[Copilot:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    this._logService.info(`[Copilot] Session materialized: ${sessionUri.toString()}`);
    this._onDidMaterializeChat.fire({ chat: provisional.chat, project, workingDirectories: materializedWorkingDirectories });
    return agentSession;
  }
  async _resolveAgentWhenMaterializing(provisional, snapshot, workingDirectory) {
    const agent = provisional.agent;
    if (!agent) {
      return void 0;
    }
    const alternativeAgent = this._getAlternativeAgentForWorktree(provisional, workingDirectory);
    const originalAgentName = this._resolveAgentName(snapshot, agent);
    const alternativeAgentName = alternativeAgent ? this._resolveAgentName(snapshot, alternativeAgent) : void 0;
    if (originalAgentName) {
      return { agent, name: originalAgentName };
    }
    if (alternativeAgentName && alternativeAgent) {
      this._logService.info(`[Copilot] Agent file ${agent.uri} is in the original repo; using worktree agent ${alternativeAgent?.uri}`);
      return { agent: alternativeAgent, name: alternativeAgentName };
    }
    return void 0;
  }
  _getAlternativeAgentForWorktree(provisional, workingDirectory) {
    const agent = provisional.agent;
    if (!agent) {
      return void 0;
    }
    if (!provisional.workingDirectory || !workingDirectory) {
      return void 0;
    }
    if (isEqual(provisional.workingDirectory, workingDirectory)) {
      return void 0;
    }
    const agentUri = URI.parse(agent.uri);
    const alternativeAgentUri = rebaseUnder(agentUri, provisional.workingDirectory, workingDirectory);
    return alternativeAgentUri ? { uri: alternativeAgentUri.toString() } : void 0;
  }
  async resolveChatConfig(params) {
    const values = platformSessionSchema.validateOrDefault(migrateLegacyAutopilotConfig(params.config), {
      [SessionConfigKey.AutoApprove]: "default",
      [SessionConfigKey.Mode]: "interactive"
      // Permissions intentionally omitted — leave unset so auto-approval
      // falls through to the host-level `permissions` default, and only
      // materializes on the session once the user hits "Allow in this
      // Session".
    });
    return {
      schema: platformSessionSchema.toProtocol(),
      values
    };
  }
  getInheritedChatConfig(config) {
    const inherited = {};
    for (const key of [SessionConfigKey.AutoApprove, SessionConfigKey.Permissions]) {
      if (config[key] !== void 0) {
        inherited[key] = config[key];
      }
    }
    return Object.keys(inherited).length > 0 ? inherited : void 0;
  }
  async chatConfigCompletions(_params) {
    return { items: [] };
  }
  /** Records that `client` contributes to `chat` within the owning configuration scope. */
  getOrCreateActiveClient(chat, context, client, hostCustomizations) {
    const configurationResource = resolveAgentChatContext(context, chat).configurationResource;
    this._rememberHostCustomizations(configurationResource, hostCustomizations);
    const activeClient = this._getOrCreateActiveClient(configurationResource, void 0);
    this._adoptClientChat(activeClient, client.clientId, chat);
    if (!activeClient.pluginController.directory) {
      this._getSessionCustomizationAnchors(configurationResource).then(
        (anchors) => {
          activeClient.pluginController.setDirectory(anchors.directory);
          if (anchors.applyAdditional) {
            activeClient.pluginController.setAdditionalDirectories(anchors.additionalDirectories);
          }
        },
        () => {
        }
      );
    }
    return activeClient.getOrCreateHandle(client.clientId, client.displayName);
  }
  /** Adds `chat` to the host-published membership for `clientId`. */
  _adoptClientChat(activeClient, clientId, chat) {
    if (activeClient.addClientChat(clientId, chat)) {
      this._logService.info(`[Copilot] Active client ${clientId} now contributes to chat ${chat.toString()}`);
    }
  }
  /** Removes `clientId` from one exact chat, dropping the client only when no chats remain. */
  removeActiveClient(chat, context, clientId) {
    const configurationResource = resolveAgentChatContext(context, chat).configurationResource;
    const configurationId = AgentSession.id(configurationResource);
    const activeClient = this._activeClients.get(configurationResource);
    if (!activeClient) {
      this._logService.info(`[Copilot:${configurationId}] removeActiveClient: no active client state for clientId=${clientId}, chat=${chat.toString()}`);
      return;
    }
    const wasLastChat = activeClient.removeClientChat(clientId, chat);
    this._logService.info(`[Copilot:${configurationId}] removeActiveClient: clientId=${clientId}, chat=${chat.toString()}, fullyRemoved=${wasLastChat}`);
    if (wasLastChat) {
      activeClient.removeClient(clientId);
    }
  }
  /** Routes a completed client tool call to the runtime that owns it. */
  onClientToolCallComplete(chat, toolCallId, result, context) {
    const spawnedFrom = resolveSubagentChatParent(context);
    const target = this._findChatByUri(chat) ?? (spawnedFrom ? this._findChatByUri(spawnedFrom.chat) : void 0) ?? (context ? this._findSessionChat(context.configurationResource) : void 0);
    target?.handleClientToolCallComplete(toolCallId, result);
  }
  async _sendMessage(chat, prompt, attachments, turnId, senderClientId, clientType = AgentHostClientType.Unknown, workingDirectories, operationContext, clientTelemetryContext) {
    try {
      await this._sendMessageOnce(chat, prompt, attachments, turnId, senderClientId, clientType, workingDirectories, operationContext, clientTelemetryContext);
    } catch (error) {
      const recovery = await this._recoverFromClosedConnection(error, "sendMessage", this._clientFailureCorrelation(chat, turnId, operationContext));
      if (turnId && recovery?.failedTurnIds.has(turnId)) {
        return;
      }
      throw error;
    }
  }
  async _sendMessageOnce(chat, prompt, attachments, turnId, senderClientId, clientType = AgentHostClientType.Unknown, workingDirectories, operationContext, clientTelemetryContext) {
    const context = this._resolveSendChatContext(chat, operationContext);
    await this._queueChat(context.configurationId, context.sequencerKey, async () => {
      const current = this._resolveSendChatContext(chat, operationContext);
      await this._activeClients.get(current.configurationResource)?.pluginController.retryFailedClientSyncIfNeeded();
      let entry = current.target;
      if (!entry) {
        entry = await this._ensureResolvedChatSession(current, workingDirectories);
      }
      const activeClient = this._activeClients.get(current.configurationResource);
      const hadCachedEntry = !!entry;
      this._logService.info(`[Copilot:${current.configurationId}] sendMessage: cachedEntry=${hadCachedEntry}, hasActiveClient=${!!activeClient}, activeClientId=${activeClient ? "(set)" : "(none)"}`);
      const rootsChanged = !!entry && workingDirectories !== void 0 && !areAdditionalWorkingDirectoriesEqual(entry.appliedAdditionalDirectories, this._additionalCustomizationDirectories(workingDirectories));
      const structuralConfigChanged = !!entry && !!activeClient && await activeClient.requiresRestart(entry.appliedSnapshot, current.chatKey);
      if (entry && (rootsChanged || structuralConfigChanged)) {
        this._logService.info(`[Copilot:${current.configurationId}] Session configuration changed, refreshing session. clients=[${activeClient ? [...activeClient.toolSet.clientIds()].join(", ") || "(none)" : "(none)"}]`);
        await this._destroyLiveSession(entry, true);
        if (entry.sessionId === current.configurationId) {
          entry = await this._resumeSession(current.configurationId, current.chat, workingDirectories);
        } else {
          if (workingDirectories) {
            activeClient?.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(workingDirectories));
          }
          entry = await this._ensureResolvedChatSession(current, workingDirectories);
        }
      }
      if (!entry) {
        this._logService.info(`[Copilot:${current.configurationId}] No cached entry${hadCachedEntry ? " (was evicted by requiresRestart)" : ""}, calling _resumeSession`);
      }
      entry ??= await this._ensureResolvedChatSession(current, workingDirectories);
      if (!entry) {
        throw new Error(`[Copilot] sendMessage for unknown chat: ${chat.toString()}`);
      }
      if (turnId) {
        entry.resetTurnState(turnId, senderClientId, clientType, clientTelemetryContext);
      }
      try {
        const sdkMode = this._resolveSdkMode(current.configurationResource);
        const sideChat = this._chatBackings.get(current.chatKey)?.sideChat;
        const turns = sideChat ? await entry.getMessages() : [];
        const sdkPrompt = prepareSideChatPrompt(prompt, turns, sideChat);
        await entry.send(sdkPrompt, attachments, turnId, sdkMode, senderClientId, clientType, resolveAgentHostInstructions(operationContext), clientTelemetryContext);
      } catch (err) {
        const errCode = err?.code;
        const errMsg = err instanceof Error ? err.message : String(err);
        this._logService.error(`[Copilot:${current.configurationId}] entry.send() failed: code=${errCode}, message=${errMsg}, hadCachedEntry=${hadCachedEntry}, errorType=${err?.constructor?.name}`);
        throw err;
      }
    });
  }
  /**
   * Translates the AHP-side `mode` to the Copilot SDK's three-mode space
   * (`interactive` / `plan` / `autopilot`). With Autopilot living on the
   * `mode` axis the mapping is now direct:
   *
   *  - `mode='plan'` → SDK `plan`.
   *  - `mode='autopilot'` → SDK `autopilot` (autonomous, continue-until-done).
   *  - `mode='interactive'` → SDK `interactive`.
   *
   * Tool auto-approval is governed independently by the orthogonal
   * `autoApprove` axis (Default / Bypass), enforced by the agent
   * host's own permission handler — which the SDK still invokes even under
   * autopilot mode.
   *
   * Returns `undefined` when no mode is configured for the session, so
   * the SDK's current mode is left untouched.
   */
  _resolveSdkMode(session) {
    const sessionKey = session.toString();
    const mode = this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode);
    switch (mode) {
      case "plan":
        return "plan";
      case "autopilot":
        return "autopilot";
      case "interactive":
        return "interactive";
      default:
        return void 0;
    }
  }
  /**
   * Reads the session's current `mode` and `autoApprove` axis values so the
   * slash-command completion provider can hide config-action toggles that would
   * be a no-op (e.g. `/autopilot on` while already in autopilot).
   */
  _getSessionConfigState(sessionId) {
    const sessionKey = AgentSession.uri(this.id, sessionId).toString();
    return {
      mode: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.Mode),
      autoApprove: this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove)
    };
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    const backing = this._chatBackings.get(chat.toString());
    const target = backing ? this._findSessionBySdkId(backing.sdkSessionId) : void 0;
    if (!target) {
      this._logService.warn(`[Copilot] setPendingMessages: chat not found for ${chat.toString()}`);
      return;
    }
    if (steeringMessage) {
      target.sendSteering(steeringMessage);
    }
  }
  async _getChatMessages(chat, sessionOrContext) {
    if (this._isShuttingDown) {
      return [];
    }
    if (resolveSubagentChatParent(sessionOrContext)) {
      return this._getSubagentChatMessages(chat, sessionOrContext);
    }
    const context = this._resolveChatContext(chat, sessionOrContext);
    if (this._provisionalSessions.get(context.configurationId)?.sdkSessionId === context.sdkSessionId) {
      return [];
    }
    const entry = await this._queueChat(context.configurationId, context.sequencerKey, async () => {
      return this._ensureResolvedChatSession(this._resolveChatContext(chat, sessionOrContext)).catch((err) => {
        if (err instanceof SessionWorkingDirectoryMissingError) {
          throw err;
        }
        if (context.sdkSessionId) {
          throw err;
        }
        this._logService.warn(`[Copilot:${context.configurationId}] Failed to resolve chat for message lookup`, err);
        return void 0;
      });
    });
    if (!entry) {
      return [];
    }
    const turns = await entry.getMessages();
    const sideChat = this._chatBackings.get(context.chatKey)?.sideChat;
    return sliceSideChatTurns(turns, sideChat);
  }
  /** Reconstructs a subagent transcript from the parent chat named by the host-supplied tool origin. */
  async _getSubagentChatMessages(chat, sessionOrContext) {
    const spawnedFrom = resolveSubagentChatParent(sessionOrContext);
    if (!spawnedFrom) {
      this._logService.warn(`[Copilot] Subagent chat ${chat.toString()} addressed without its host-supplied tool-call origin; no turns to reconstruct`);
      return [];
    }
    const owner = resolveAgentChatContext(sessionOrContext, chat).configurationResource;
    const parentContext = this._resolveChatContext(spawnedFrom.chat, { configurationResource: owner, resource: owner });
    const parentEntry = await this._ensureResolvedChatSession(parentContext).catch((err) => {
      this._logService.warn(`[Copilot:${parentContext.sdkSessionId ?? parentContext.configurationId}] Failed to resume exact source chat for subagent restore`, err);
      return void 0;
    });
    return parentEntry?.getSubagentMessages(spawnedFrom.toolCallId) ?? [];
  }
  /** Releases provider-owned resources once the last chat sharing `scope` is gone. */
  async _finalizeConfigurationScope(scope, scopeId, workspacelessHint) {
    const isWorkspaceless = workspacelessHint || (await this._readSessionMetadata(scope).catch(() => void 0))?.workspaceless === true;
    this._provisionalSessions.delete(scopeId);
    await this._sessionLifetimes.get(scopeId)?.dispose(async () => {
    });
    this._activeClients.get(scope)?.dispose();
    this._activeClients.delete(scope);
    this._hostCustomizations.delete(scope);
    if (isWorkspaceless) {
      await this._cleanupWorkspacelessScratchDir(this._workspacelessScratchDir(scopeId), scopeId);
    }
    this._otelService.releaseSessionTraceContext(scope.toString());
    await this._applyPendingClientRestart();
  }
  async _abortSession(chat, operationContext) {
    try {
      await this._abortSessionOnce(chat, operationContext);
    } catch (error) {
      const correlation = this._clientFailureCorrelation(chat, void 0, operationContext);
      if (!isCopilotConnectionClosedError(error)) {
        await this._recoverFromClosedConnection(error, "abort", correlation);
        throw error;
      }
      this._resolveChatContext(chat, operationContext).target?.discardActiveTurn();
      if (!await this._recoverFromClosedConnection(error, "abort", correlation)) {
        throw error;
      }
    }
  }
  async _abortSessionOnce(chat, operationContext) {
    const context = this._resolveChatContext(chat, operationContext);
    await this._queueChat(context.configurationId, context.sequencerKey, async () => {
      await this._resolveChatContext(chat, operationContext).target?.abort();
    });
  }
  /** Creates a concrete chat backing immediately, optionally by importing history from another chat. */
  async _mintChatBacking(chat, context, options) {
    const chatKey = chat.toString();
    const session = context.configurationResource;
    const sessionId = AgentSession.id(session);
    const fork = options.fork;
    const forkSourceScope = fork ? this._resolveChatScope(fork.source) : void 0;
    const forkSourceSessionId = forkSourceScope ? AgentSession.id(forkSourceScope) : void 0;
    const inheritsFromOtherSession = !!fork && forkSourceSessionId !== sessionId;
    const existingBacking = this._chatBackings.get(chatKey);
    if (existingBacking) {
      return this._existingMintedChatResult(session, sessionId, existingBacking, inheritsFromOtherSession);
    }
    if (fork && isEqual(fork.source, chat)) {
      throw new Error(`Cannot fork Copilot chat ${chatKey} onto itself`);
    }
    let result;
    const queue = (task) => options.sideChat ? this._queueChat(sessionId, chatKey, task) : this._queueSession(forkSourceSessionId ?? sessionId, task);
    await queue(async () => {
      const existing = this._chatBackings.get(chatKey);
      if (existing) {
        result = await this._existingMintedChatResult(session, sessionId, existing, inheritsFromOtherSession);
        return;
      }
      const workingDirectory = inheritsFromOtherSession ? await this._resolveCreateWorkingDirectory(options, sessionId, false) : options.workingDirectories?.[0];
      if (!workingDirectory) {
        throw new Error(`[Copilot] createChat: missing resolved working directory for session ${session.toString()}`);
      }
      const sourceMetadata = inheritsFromOtherSession ? await this._readSessionMetadata(forkSourceScope) : void 0;
      const model = options.model ?? sourceMetadata?.model;
      const agent = options.agent ?? sourceMetadata?.agent;
      const client = await this._ensureClient();
      const chatSdkId = generateUuid();
      const activeClient = this._getOrCreateActiveClient(session, workingDirectory);
      const snapshot = await activeClient.snapshot(chatKey);
      const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
      const storageScope = context.resource;
      let launchPlan;
      let sdkSessionId;
      let sideChat;
      let sourceEntry;
      if (fork) {
        sourceEntry = await this._ensureResolvedChatSession(this._resolveChatContext(fork.source, { configurationResource: forkSourceScope, resource: this._resolveChatStorageScope(fork.source) }));
        if (!sourceEntry) {
          throw new Error(`[Copilot] createChat fork: source chat ${fork.source.toString()} not found`);
        }
        const forked = await this._forkSdkChat(client, sourceEntry, fork.turnId, this._sessionDataService.getSessionDataDir(storageScope));
        sdkSessionId = forked.sessionId;
        launchPlan = {
          kind: "resume",
          client,
          sessionId: sdkSessionId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          disabledRootMcpServers: this._disabledRootMcpServers(session, sdkSessionId, snapshot),
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          fallback: { model, longContextWindow: this._longContextWindowFor(model?.id), freeLongContext: this._isFreeLongContext(model?.id) }
        };
      } else if (options.sideChat) {
        const sideChatSource = await this._ensureResolvedChatSession(this._resolveChatContext(options.sideChat.source, { configurationResource: this._resolveChatScope(options.sideChat.source), resource: this._resolveChatStorageScope(options.sideChat.source) }));
        if (!sideChatSource) {
          throw new Error(`[Copilot] createChat side chat: source chat ${options.sideChat.source.toString()} not found`);
        }
        const forked = await this._forkSdkChat(client, sideChatSource, options.sideChat.providerAnchorTurnId ?? options.sideChat.turnId, this._sessionDataService.getSessionDataDir(storageScope));
        sdkSessionId = forked.sessionId;
        sideChat = {
          source: options.sideChat.source.toString(),
          turnId: options.sideChat.turnId,
          ...options.sideChat.selection ? { selection: options.sideChat.selection } : {},
          ...options.sideChat.providerAnchorTurnId ? { providerAnchorTurnId: options.sideChat.providerAnchorTurnId } : {},
          ...forked.inheritedTurnId !== void 0 ? { inheritedTurnId: forked.inheritedTurnId } : {},
          ...options.sideChat.sourceContext ? { context: options.sideChat.sourceContext } : {},
          ...options.sideChat.partialResponse ? { partialResponse: options.sideChat.partialResponse } : {}
        };
        launchPlan = {
          kind: "resume",
          client,
          sessionId: sdkSessionId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          disabledRootMcpServers: this._disabledRootMcpServers(session, sdkSessionId, snapshot),
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          fallback: { model, longContextWindow: this._longContextWindowFor(model?.id), freeLongContext: this._isFreeLongContext(model?.id) }
        };
      } else {
        sdkSessionId = chatSdkId;
        launchPlan = {
          kind: "create",
          client,
          sessionId: chatSdkId,
          workingDirectory,
          resolvedAgentName: void 0,
          snapshot,
          disabledRootMcpServers: this._disabledRootMcpServers(session, chatSdkId, snapshot),
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          model,
          longContextWindow: this._longContextWindowFor(model?.id),
          freeLongContext: this._isFreeLongContext(model?.id)
        };
      }
      let project;
      if (inheritsFromOtherSession) {
        project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
        const inheritedWorkingDirectories = sourceMetadata?.workingDirectories ?? (sourceEntry?.workingDirectory ? [sourceEntry.workingDirectory] : [workingDirectory]);
        await this._storeSessionMetadata(session, model, workingDirectory, inheritedWorkingDirectories, workingDirectory, project);
        if (agent !== void 0) {
          await this._storeSessionAgentMetadata(session, agent);
        }
      }
      let agentSession;
      try {
        agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: session, chatChannelUri: chat, resource: storageScope });
        await agentSession.initializeSession();
        if (fork?.turnIdMapping) {
          await agentSession.remapTurnIds(fork.turnIdMapping);
        }
        this._throwIfClientReplaced(client, agentSession);
        this._registerLiveChat(chat, agentSession, activeClient);
        const backing = { sdkSessionId, ...model ? { model } : {}, ...agent ? { agent } : {}, ...sideChat ? { sideChat } : {} };
        this._chatBackings.set(chatKey, backing);
        result = {
          ...inheritsFromOtherSession ? { resolvedWorkingDirectory: workingDirectory, ...project ? { project } : {} } : {},
          ...this._chatBackingResult(sessionId, backing)
        };
        this._logService.info(`[Copilot] Created chat backing ${chatKey} for context ${session.toString()}${fork ? " (forked)" : ""}`);
      } catch (error) {
        agentSession?.dispose();
        throw error;
      }
      if (inheritsFromOtherSession) {
        try {
          await this._reviewService.copyReviewedRef(forkSourceScope.toString(), session.toString(), workingDirectory);
        } catch (err) {
          this._logService.warn(`[Copilot] Failed to copy reviewed ref for fork: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
    if (!result) {
      throw new Error(`[Copilot] createChat: no backing was recorded for ${chatKey}`);
    }
    return result;
  }
  async _existingMintedChatResult(session, sessionId, backing, includeSessionMetadata) {
    const result = this._chatBackingResult(sessionId, backing);
    if (!includeSessionMetadata) {
      return result;
    }
    const metadata = await this._readStoredSessionMetadata(session);
    return {
      ...metadata?.workingDirectory ? { resolvedWorkingDirectory: metadata.workingDirectory } : {},
      ...metadata?.project ? { project: metadata.project } : {},
      ...result
    };
  }
  /** Resolves the live session for an addressed chat from exact recorded backings. */
  async _ensureResolvedChatSession(context, workingDirectories) {
    const provisional = this._provisionalSessions.get(context.configurationId);
    if (provisional && provisional.sdkSessionId === context.sdkSessionId) {
      return this._materializeProvisional(context.configurationId, workingDirectories);
    }
    if (context.sdkSessionId === context.configurationId) {
      return context.target ?? this._resumeSession(context.configurationId, context.chat, workingDirectories);
    }
    if (context.sdkSessionId) {
      const lifetime = this._getOrCreateSessionLifetime(context.sdkSessionId);
      const lease = await lifetime?.acquire();
      if (!lease) {
        return void 0;
      }
      try {
        const target = this._findChatByUri(context.chat);
        if (target) {
          return target;
        }
        return this._resolveOrResumeChatSession(context, workingDirectories);
      } finally {
        lease.dispose();
      }
    }
    return context.target;
  }
  /**
   * Forks {@link sourceEntry}'s SDK chat at {@link turnId} via the
   * SDK `sessions.fork` RPC and copies its database into {@link targetDbDir}
   * so the forked chat inherits turn event IDs and file-edit
   * snapshots. Returns the new SDK session id.
   */
  async _forkSdkChat(client, sourceEntry, turnId, targetDbDir) {
    const sourceTurns = await sourceEntry.getMessages();
    const sourceTurnIndex = sourceTurns.findIndex((turn) => turn.id === turnId);
    if (sourceTurnIndex === -1) {
      this._logService.warn(`[Copilot] fork: turn ${turnId} not found in source session ${sourceEntry.sessionId}; inheriting all ${sourceTurns.length} turns`);
    }
    const inheritedTurnIndex = sourceTurnIndex === -1 ? sourceTurns.length - 1 : sourceTurnIndex;
    const inheritedTurnId = sourceTurns[inheritedTurnIndex]?.id;
    const toEventId = await sourceEntry.getNextTurnEventId(turnId);
    const forkResult = await client.rpc.sessions.fork({
      sessionId: sourceEntry.sessionId,
      ...toEventId ? { toEventId } : {}
    });
    const newSessionId = forkResult.sessionId;
    const targetDbPath = URI.joinPath(targetDbDir, SESSION_DB_FILENAME);
    try {
      const sourceDbRef = await this._sessionDataService.tryOpenDatabase(sourceEntry.sessionUri);
      if (sourceDbRef) {
        try {
          await fs.mkdir(targetDbDir.fsPath, { recursive: true });
          await fs.rm(targetDbPath.fsPath, { force: true });
          await sourceDbRef.object.vacuumInto(targetDbPath.fsPath);
        } finally {
          sourceDbRef.dispose();
        }
      }
    } catch (err) {
      this._logService.warn(`[Copilot] Failed to copy session database for chat fork: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { sessionId: newSessionId, inheritedTurnId };
  }
  async _disposeChat(chat, operationContext) {
    const initial = this._resolveChatContext(chat, operationContext);
    const lifetimeId = initial.sdkSessionId ?? initial.configurationId;
    const lifetime = this._getOrCreateSessionLifetime(lifetimeId);
    if (!lifetime) {
      return;
    }
    let finalize;
    await lifetime.release(async () => {
      finalize = await this._disposeChatCoordinated(chat, operationContext);
    });
    if (finalize) {
      await this._finalizeConfigurationScope(finalize.scope, finalize.scopeId, finalize.workspacelessHint);
    }
  }
  async _disposeChatCoordinated(chat, operationContext) {
    const chatKey = chat.toString();
    const initial = this._resolveChatContext(chat, operationContext);
    const configurationId = initial.configurationId;
    return this._queueChat(configurationId, initial.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, operationContext);
      const target = current.target;
      const backing = this._chatBackings.get(chatKey);
      const provisional = this._provisionalSessions.get(configurationId);
      const isProvisional = provisional?.chat.toString() === chatKey;
      const sdkSessionId = target?.sessionId ?? backing?.sdkSessionId;
      const workspacelessHint = provisional?.workspaceless === true;
      if (sdkSessionId && !isProvisional) {
        await this._deleteSdkSession(sdkSessionId, chatKey);
      }
      if (isProvisional) {
        this._provisionalSessions.delete(configurationId);
      }
      this._chatBackings.delete(chatKey);
      this._chatScopes.delete(chatKey);
      this._chatStorageScopes.delete(chatKey);
      if (target) {
        await this._destroyLiveSession(target, true);
      }
      this._otelService.releaseSessionTraceContext(current.resource.toString());
      this._activeClients.get(current.configurationResource)?.removeChat(chat);
      if (this._remainingChatsForScope(current.configurationResource) === 0) {
        return { scope: current.configurationResource, scopeId: configurationId, workspacelessHint };
      }
      return void 0;
    });
  }
  /**
   * Deletes an SDK session, tolerating one that was already removed. The SDK's
   * `deleteSession` throws for both a genuine failure and a missing session, so
   * a real failure is propagated (preserving routing/state for a retry) while a
   * confirmed-gone session is swallowed to keep a partially-completed multi-chat
   * teardown retry-safe.
   */
  async _deleteSdkSession(sdkSessionId, chatKey) {
    const client = await this._ensureClient();
    try {
      await client.deleteSession(sdkSessionId);
    } catch (err) {
      if (await client.getSessionMetadata(sdkSessionId).then((metadata) => !!metadata, () => true)) {
        throw err;
      }
      this._logService.info(`[Copilot] SDK session ${sdkSessionId} already deleted; chat ${chatKey} disposal is idempotent`);
    }
  }
  async _releaseChat(chat, operationContext) {
    const initial = this._resolveChatContext(chat, operationContext);
    const lifetime = this._getOrCreateSessionLifetime(initial.sdkSessionId ?? initial.configurationId);
    if (!lifetime) {
      return;
    }
    await lifetime.release(async () => {
      const target = this._resolveChatContext(chat, operationContext).target;
      if (!target || target.hasActiveTurn) {
        return;
      }
      await this._destroyLiveSession(target, true);
    });
  }
  /**
   * Re-attaches a concrete chat backing on session
   * restore, decoding the opaque `providerData` the orchestrator persisted
   * at creation (or the latest {@link onDidChangeChatData}). After this
   * resolves the chat's backing SDK session can be resumed lazily on its first
   * send. Best-effort — a corrupt/unknown blob is logged and dropped rather
   * than thrown.
   */
  async materializeChat(chat, context, providerData) {
    this._noteHostCustomizations(context);
    const resolved = resolveAgentChatContext(context, chat);
    this._rememberChatScope(chat, resolved.configurationResource, resolved.resource);
    const chatKey = chat.toString();
    if (providerData === void 0) {
      if (!isDefaultChatUri(chat)) {
        return;
      }
      const backing2 = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
      this._chatBackings.set(chatKey, backing2);
      return { providerData: encodeProviderData(backing2) };
    }
    const backing = decodeProviderData(providerData);
    if (!backing) {
      this._logService.warn(`[Copilot] materializeChat: dropping corrupt providerData for ${chatKey}`);
      return;
    }
    this._chatBackings.set(chatKey, backing);
  }
  async recoverLegacyChat(chat, context) {
    const resolved = resolveAgentChatContext(context, chat);
    this._rememberChatScope(chat, resolved.configurationResource, resolved.resource);
    const backing = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
    this._chatBackings.set(chat.toString(), backing);
    return { providerData: encodeProviderData(backing) };
  }
  /**
   * Migration-only enumeration of the session's legacy chat backings from
   * `copilot.chats`, mapping each entry to its channel URI and the same opaque
   * `providerData` blob {@link materializeChat} decodes. The orchestrator
   * calls this once to drain the legacy codec into its own catalog.
   */
  async listLegacyChatBackings(configurationResource) {
    const persisted = await this._readLegacyChatBackings(configurationResource);
    const result = [];
    for (const [chatId, info] of persisted) {
      result.push({ uri: URI.parse(buildChatUri(configurationResource, chatId)), providerData: encodeProviderData(info) });
    }
    return result;
  }
  _getOrCreateSessionLifetime(sessionId) {
    if (this._isShuttingDown) {
      return void 0;
    }
    let lifetime = this._sessionLifetimes.get(sessionId);
    if (!lifetime) {
      lifetime = new CopilotSessionLifetime();
      this._sessionLifetimes.set(sessionId, lifetime);
    }
    return lifetime;
  }
  _resetSessionLifetime(sessionId) {
    if (!this._isShuttingDown && this._sessionLifetimes.get(sessionId)?.isPermanentlyClosed) {
      this._sessionLifetimes.set(sessionId, new CopilotSessionLifetime());
    }
  }
  _queueSession(sessionId, task) {
    const lifetime = this._getOrCreateSessionLifetime(sessionId);
    return lifetime ? lifetime.queueSession(task) : Promise.reject(new CancellationError());
  }
  _queueChat(sessionId, chatKey, task) {
    const lifetime = this._getOrCreateSessionLifetime(sessionId);
    return lifetime ? lifetime.queueChat(chatKey, task) : Promise.reject(new CancellationError());
  }
  /** Returns the live session for an exact chat, resuming it if necessary. */
  async _resolveOrResumeChatSession(context, workingDirectories) {
    const { configurationResource, configurationId, chat, chatKey } = context;
    const existing = this._findChatByUri(chat);
    if (existing) {
      return existing;
    }
    const lifetime = this._getOrCreateSessionLifetime(context.sdkSessionId ?? configurationId);
    if (!lifetime) {
      return void 0;
    }
    return lifetime.resumePeer(chatKey, async () => {
      const lease = await lifetime.acquire();
      if (!lease) {
        return void 0;
      }
      let agentSession;
      try {
        const again = this._findChatByUri(chat);
        if (again) {
          return again;
        }
        const info = this._chatBackings.get(chatKey);
        if (!info) {
          return void 0;
        }
        const parentEntry = this._findSessionBySdkId(configurationId);
        const workingDirectory = workingDirectories?.[0] ?? parentEntry?.workingDirectory ?? this._provisionalSessions.get(configurationId)?.workingDirectory ?? (await this._readSessionMetadata(configurationResource)).workingDirectory;
        if (!workingDirectory) {
          this._logService.warn(`[Copilot] Cannot resume chat ${chatKey}: missing working directory`);
          return void 0;
        }
        const client = await this._ensureClient();
        const activeClient = this._getOrCreateActiveClient(configurationResource, workingDirectory);
        const snapshot = await activeClient.snapshot(chatKey);
        const shellManager = this._instantiationService.createInstance(ShellManager, chat, workingDirectory);
        const launchPlan = {
          kind: "resume",
          client,
          sessionId: info.sdkSessionId,
          workingDirectory,
          additionalDirectories: workingDirectories?.slice(1),
          resolvedAgentName: info.agent ? this._resolveAgentName(snapshot, info.agent) : void 0,
          snapshot,
          disabledRootMcpServers: this._disabledRootMcpServers(configurationResource, info.sdkSessionId, snapshot),
          activeClientToolSet: activeClient.toolSet,
          shellManager,
          githubToken: this._githubToken,
          fallback: { model: info.model, longContextWindow: this._longContextWindowFor(info.model?.id), freeLongContext: this._isFreeLongContext(info.model?.id) }
        };
        agentSession = this._createAgentSession(launchPlan, workingDirectory, activeClient, { sessionUri: configurationResource, chatChannelUri: chat, resource: context.resource });
        await agentSession.initializeSession();
        this._throwIfClientReplaced(client, agentSession);
        this._registerLiveChat(chat, agentSession, activeClient);
        if (workingDirectories) {
          await this._storeSessionMetadata(context.resource, info.model, workingDirectory, workingDirectories, void 0, void 0);
        }
        this._logService.info(`[Copilot] Resumed chat backing ${chatKey} for configuration ${configurationResource.toString()}`);
        return agentSession;
      } catch (error) {
        agentSession?.dispose();
        this._logService.warn(`[Copilot] Failed to resume chat backing ${chatKey}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      } finally {
        lease.dispose();
      }
    });
  }
  async truncateChat(chat, turnId, context) {
    const resolved = this._resolveTruncateChatContext(chat, context);
    const sessionId = resolved.configurationId;
    if (this._provisionalSessions.get(sessionId)?.chat.toString() === chat.toString()) {
      return;
    }
    await this._queueChat(resolved.configurationId, resolved.sequencerKey, async () => {
      const current = this._resolveTruncateChatContext(chat, context);
      this._logService.info(`[Copilot:${sessionId}] Truncating chat ${chat.toString()}${turnId !== void 0 ? ` at turnId=${turnId}` : " (all turns)"}`);
      const entry = await this._ensureResolvedChatSession(current);
      if (!entry) {
        this._logService.info(`[Copilot:${sessionId}] No chat entry resolved for truncation; nothing to truncate`);
        return;
      }
      let eventId;
      if (turnId) {
        eventId = await entry.getNextTurnEventId(turnId);
      } else {
        eventId = await entry.getFirstTurnEventId();
      }
      if (eventId) {
        await entry.truncateAtEventId(eventId, turnId);
      } else {
        this._logService.info(`[Copilot:${sessionId}] No event ID found for truncation, nothing to truncate`);
      }
      this._logService.info(`[Copilot:${sessionId}] Session truncated`);
    });
  }
  async _changeModel(chat, model, operationContext) {
    try {
      await this._changeModelOnce(chat, model, operationContext);
    } catch (error) {
      if (!await this._recoverFromClosedConnection(error, "changeModel", this._clientFailureCorrelation(chat, void 0, operationContext))) {
        throw error;
      }
      await this._changeModelOnce(chat, model, operationContext);
    }
  }
  async _changeModelOnce(chat, model, operationContext) {
    const context = this._resolveChatContext(chat, operationContext);
    await this._queueChat(context.configurationId, context.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, operationContext);
      const longContextWindow = this._longContextWindowFor(model.id);
      const freeLongContext = this._isFreeLongContext(model.id);
      const provisional = this._provisionalSessions.get(current.configurationId);
      if (provisional) {
        provisional.model = model;
      } else {
        const entry = current.target ?? await this._ensureResolvedChatSession(current);
        await entry?.setModel(model.id, resolveCopilotReasoningEffort(model, this._configurationService, this._logService, current.configurationId), getCopilotContextTier(model, longContextWindow, freeLongContext));
        if (current.resource.toString() === current.configurationResource.toString()) {
          await this._storeSessionMetadata(current.resource, model, void 0, void 0, void 0, void 0);
        }
      }
      const backing = this._chatBackings.get(current.chatKey);
      if (backing) {
        const updated = { ...backing, model };
        this._chatBackings.set(current.chatKey, updated);
        this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
      }
    });
  }
  async _changeAgent(chat, agent, operationContext) {
    try {
      await this._changeAgentOnce(chat, agent, operationContext);
    } catch (error) {
      if (!await this._recoverFromClosedConnection(error, "changeAgent", this._clientFailureCorrelation(chat, void 0, operationContext))) {
        throw error;
      }
      await this._changeAgentOnce(chat, agent, operationContext);
    }
  }
  async _changeAgentOnce(chat, agent, operationContext) {
    const context = this._resolveChatContext(chat, operationContext);
    await this._queueChat(context.configurationId, context.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, operationContext);
      const provisional = this._provisionalSessions.get(current.configurationId);
      if (provisional) {
        provisional.agent = agent;
      } else {
        const entry = current.target ?? await this._ensureResolvedChatSession(current);
        if (entry) {
          const resolvedAgentName = agent ? this._resolveAgentName(entry.appliedSnapshot, agent) : void 0;
          await entry.setAgent(resolvedAgentName);
        }
      }
      const backing = this._chatBackings.get(current.chatKey);
      if (backing) {
        const updated = { ...backing, ...agent ? { agent } : { agent: void 0 } };
        this._chatBackings.set(current.chatKey, updated);
        this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(updated) });
      }
    });
  }
  async shutdown() {
    if (!this._shutdownPromise) {
      this._isShuttingDown = true;
      for (const lifetime of this._sessionLifetimes.values()) {
        void lifetime.close();
      }
      this._shutdownPromise = (async () => {
        this._modelCatalogGeneration++;
        this._modelRefreshSchedule.clear();
        this._scheduledModelRefresh?.deferred.complete();
        this._scheduledModelRefresh = void 0;
        this._modelRefreshRetry.clear();
        this._logService.info("[Copilot] Shutting down...");
        await Promise.all([...this._sessionLifetimes.values()].map((lifetime) => lifetime.close()));
        for (const session of this._allLiveSessions()) {
          await this._destroyLiveSession(session);
        }
        await this._stopClient();
        this._sessionLifetimes.clear();
      })();
    }
    return this._shutdownPromise;
  }
  respondToPermissionRequest(requestId, approved) {
    for (const chat of this._allLiveSessions()) {
      if (chat.respondToPermissionRequest(requestId, approved)) {
        return;
      }
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const chat of this._allLiveSessions()) {
      if (chat.respondToUserInputRequest(requestId, response, answers)) {
        return;
      }
    }
  }
  /**
   * Returns true if this provider owns the given session ID. Includes
   * provisional sessions that have not yet been materialized.
   */
  hasSession(session) {
    const sessionId = AgentSession.id(session);
    return this._chatEntriesBySdkId.has(sessionId) || this._provisionalSessions.has(sessionId);
  }
  // ---- helpers ------------------------------------------------------------
  async _configureProxyEnv(env) {
    const proxy = await this._resolveProxyForSdk(env);
    this._appliedProxy = proxy;
    if (proxy) {
      for (const key of COPILOT_PROXY_SET_ENV_KEYS) {
        env[key] = proxy;
      }
      this._logService.info("[Copilot] Resolved CAPI proxy and forwarded HTTP_PROXY/HTTPS_PROXY to Copilot SDK");
    }
  }
  async _resolveProxyForSdk(env = process.env) {
    if (!this._isSystemProxyEnabled()) {
      return void 0;
    }
    if (COPILOT_PROXY_ENV_KEYS.some((key) => env[key])) {
      this._logService.debug("[Copilot] Proxy env var already set; leaving Copilot SDK proxy configuration to the environment");
      return void 0;
    }
    let capiUrl = env["VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE"] || COPILOT_CAPI_URL;
    if (this._githubToken) {
      try {
        const discovered = await this._copilotApiService.resolveApiEndpoint(this._githubToken);
        if (discovered) {
          capiUrl = discovered;
        }
      } catch (error) {
        this._logService.debug(`[Copilot] CAPI endpoint discovery for proxy resolution failed; using ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      return await this._proxyResolver.resolveProxy(capiUrl);
    } catch (error) {
      this._logService.warn(`[Copilot] Failed to resolve CAPI proxy for ${capiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  /**
   * Restarts the client when token-based CAPI endpoint discovery changes its
   * subprocess proxy. Session credential updates otherwise keep the process alive.
   */
  async _restartClientIfProxyChanged() {
    if (!this._client && !this._clientStarting) {
      return;
    }
    const oldProxy = this._appliedProxy;
    const newProxy = await this._resolveProxyForSdk();
    if (newProxy === oldProxy) {
      return;
    }
    if (this._clientStarting) {
      try {
        await this._clientStarting;
      } catch {
        return;
      }
    }
    if (!this._client) {
      return;
    }
    this._logService.info(`[Copilot] CAPI proxy changed after token update (${oldProxy ?? "(none)"} -> ${newProxy ?? "(none)"}); restarting CopilotClient`);
    await this._requestClientRestart("CAPI proxy changed after GitHub token update");
  }
  _getOrCreateActiveClient(session, directory) {
    let client = this._activeClients.get(session);
    if (!client) {
      const pluginController = this._plugins.createSessionController(session, directory, () => this._retainedHostCustomizations(session));
      client = this._instantiationService.createInstance(ActiveClient, session, pluginController, this._onDidChatProgress);
      this._activeClients.set(session, client);
    } else if (directory) {
      client.pluginController.setDirectory(directory);
    }
    return client;
  }
  /** Instantiates a session; the caller must initialize and register it on success. */
  _createAgentSession(launchPlan, customizationDirectory, activeClient, identity) {
    const sessionUri = identity?.sessionUri ?? AgentSession.uri(this.id, launchPlan.sessionId);
    const chatChannelUri = identity?.chatChannelUri ?? this._findBoundSessionChatUri(launchPlan.sessionId) ?? sessionUri;
    const agentSession = this._instantiationService.createInstance(
      CopilotAgentSession,
      {
        sessionUri,
        chatChannelUri,
        ...identity?.resource ? { resource: identity.resource } : {},
        rawSessionId: launchPlan.sessionId,
        onDidSessionProgress: this._onDidChatProgress,
        sessionLauncher: this._sessionLauncher,
        launchPlan,
        shellManager: launchPlan.shellManager,
        workingDirectory: launchPlan.workingDirectory,
        customizationDirectory,
        clientSnapshot: launchPlan.snapshot,
        activeClientToolSet: launchPlan.activeClientToolSet,
        // Evaluate membership against the session's current chat channel; `bindChatChannel` can move it later.
        clientReachesChat: (clientId, chat) => activeClient.contributesTo(clientId, chat.toString()),
        // MCP reconcile has no host call of its own, so read the retained host snapshot lazily.
        hostCustomizations: () => this._retainedHostCustomizations(sessionUri),
        serverToolHost: this._serverToolHost,
        isLaunchTokenCurrent: () => this._githubToken === launchPlan.githubToken,
        onTurnEnded: () => this._onChatTurnEnded()
      }
    );
    return agentSession;
  }
  /** Resolves root-configured MCP servers that must be disabled when the SDK session starts. */
  _disabledRootMcpServers(session, sessionId, snapshot) {
    const rootServers = Object.keys(snapshot.mcpServers).map((name) => {
      const id = buildMcpTopLevelCustomizationId(this.id, sessionId, name);
      return {
        type: CustomizationType.McpServer,
        id,
        uri: id,
        name,
        state: { kind: McpServerStatus.Stopped }
      };
    });
    const enablement = getSdkMcpServerEnablement(resolveCustomizationEnablement(
      this._customizationEnablementService,
      session,
      rootServers
    ));
    return rootServers.filter((server) => enablement.get(server.id) !== true).map((server) => server.name);
  }
  _createChatEntry(session, activeClient) {
    return new CopilotChatEntry(session, activeClient, this._onMcpNotification, () => this._handleCopilotSessionAuthRequired());
  }
  _registerLiveChat(chat, session, activeClient) {
    const current = this._chatBackings.get(chat.toString());
    this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
    this._chatEntriesBySdkId.set(session.sessionId, this._createChatEntry(session, activeClient));
    this._chatBackings.set(chat.toString(), { ...current, sdkSessionId: session.sessionId });
  }
  _registerUnboundSession(session, activeClient) {
    this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
    this._chatEntriesBySdkId.set(session.sessionId, this._createChatEntry(session, activeClient));
  }
  /** Rejects a session initialized by a client that was stopped or replaced during launch. */
  _throwIfClientReplaced(client, agentSession) {
    if (this._shutdownPromise || this._client !== client) {
      agentSession.dispose();
      throw new CancellationError();
    }
  }
  _registerInitializedSession(sessionId, agentSession, activeClient, client) {
    this._throwIfClientReplaced(client, agentSession);
    const boundChat = this._findBoundSessionChatUri(sessionId);
    if (boundChat) {
      agentSession.bindChatChannel?.(boundChat);
      this._registerLiveChat(boundChat, agentSession, activeClient);
      return;
    }
    this._registerUnboundSession(agentSession, activeClient);
  }
  async _destroyLiveSession(chatSession, preserveRouting = false) {
    try {
      await chatSession.destroySession();
    } catch (error) {
      this._logService.warn(`[Copilot:${chatSession.sessionId}] Failed to destroy session before cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
    const chatChannelUri = chatSession.chatChannelUri;
    if (!preserveRouting && chatChannelUri && this._chatBackings.get(chatChannelUri.toString())?.sdkSessionId === chatSession.sessionId) {
      this._chatBackings.delete(chatChannelUri.toString());
    }
    this._chatEntriesBySdkId.deleteAndDispose(chatSession.sessionId);
  }
  _allLiveSessions() {
    return [...this._chatEntriesBySdkId.values()].map((entry) => entry.chatSession);
  }
  _resumeSession(sessionId, chatChannelUri, workingDirectories) {
    if (chatChannelUri) {
      this._chatBackings.set(chatChannelUri.toString(), { sdkSessionId: sessionId });
    }
    const lifetime = this._getOrCreateSessionLifetime(sessionId);
    if (!lifetime) {
      return Promise.reject(new CancellationError());
    }
    return lifetime.resumeDefault(async () => {
      const lease = await lifetime.acquire();
      if (!lease) {
        throw new CancellationError();
      }
      try {
        return await this._doResumeSession(sessionId, workingDirectories);
      } finally {
        lease.dispose();
      }
    });
  }
  async _doResumeSession(sessionId, workingDirectories) {
    this._logService.info(`[Copilot:${sessionId}] _resumeSession called \u2014 session not in memory, resuming...`);
    const client = await this._ensureClient();
    const sessionUri = AgentSession.uri(this.id, sessionId);
    const storedMetadata = await this._readSessionMetadata(sessionUri);
    const sessionMetadata = await client.getSessionMetadata(sessionId).catch((err) => {
      this._logService.warn(`[Copilot:${sessionId}] getSessionMetadata failed`, err);
      return void 0;
    });
    const workingDirectory = storedMetadata.workingDirectory ?? (typeof sessionMetadata?.context?.workingDirectory === "string" ? URI.file(sessionMetadata.context.workingDirectory) : void 0);
    if (!workingDirectory) {
      throw new Error(`workingDirectory is required to resume Copilot session '${sessionId}'`);
    }
    let resolvedWorkingDirectory = workingDirectory;
    if (storedMetadata.workspaceless) {
      await this._ensureWorkspacelessScratchDir(workingDirectory, sessionId);
    } else {
      resolvedWorkingDirectory = await this._configurationService.resolveWorkingDirectoryForResume(sessionUri.toString(), workingDirectory);
    }
    const customizationDirectory = resolvedWorkingDirectory;
    const activeClient = this._getOrCreateActiveClient(sessionUri, customizationDirectory);
    activeClient.pluginController.reanchor(customizationDirectory);
    const launchWorkingDirectories = workingDirectories ?? storedMetadata.workingDirectories;
    activeClient.pluginController.setAdditionalDirectories(this._additionalCustomizationDirectories(launchWorkingDirectories));
    const snapshot = await activeClient.snapshot(this._findBoundSessionChatUri(sessionId)?.toString());
    const shellManager = this._instantiationService.createInstance(ShellManager, sessionUri, resolvedWorkingDirectory);
    const resolvedAgentName = storedMetadata.agent ? this._resolveAgentName(snapshot, storedMetadata.agent) : void 0;
    if (storedMetadata.agent && !resolvedAgentName) {
      this._logService.info(`[Copilot:${sessionId}] Stored custom agent is not available in the current plugin snapshot; resuming without a custom agent`);
    }
    const launchPlan = {
      kind: "resume",
      client,
      sessionId,
      workingDirectory: resolvedWorkingDirectory,
      additionalDirectories: this._additionalCustomizationDirectories(launchWorkingDirectories),
      resolvedAgentName,
      snapshot,
      disabledRootMcpServers: this._disabledRootMcpServers(sessionUri, sessionId, snapshot),
      activeClientToolSet: activeClient.toolSet,
      shellManager,
      githubToken: this._githubToken,
      workspaceless: storedMetadata.workspaceless,
      fallback: {
        model: storedMetadata.model,
        longContextWindow: this._longContextWindowFor(storedMetadata.model?.id),
        freeLongContext: this._isFreeLongContext(storedMetadata.model?.id)
      }
    };
    const agentSession = this._createAgentSession(launchPlan, customizationDirectory, activeClient);
    try {
      await agentSession.initializeSession();
      await this._storeSessionMetadata(sessionUri, void 0, void 0, launchWorkingDirectories, void 0, void 0);
      this._registerInitializedSession(sessionId, agentSession, activeClient, launchPlan.client);
    } catch (err) {
      agentSession.dispose();
      throw err;
    }
    return agentSession;
  }
  /** Reads the legacy `copilot.chats` migration codec retained for pre-providerData sessions. */
  async _readLegacyChatBackings(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return /* @__PURE__ */ new Map();
    }
    try {
      const raw = await ref.object.getMetadata(CopilotAgent._META_CHATS);
      if (!raw) {
        return /* @__PURE__ */ new Map();
      }
      const parsed = JSON.parse(raw);
      const result = /* @__PURE__ */ new Map();
      for (const [chatId, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") {
          continue;
        }
        const { sdkSessionId, model } = value;
        if (typeof sdkSessionId !== "string" || !sdkSessionId) {
          continue;
        }
        result.set(chatId, { sdkSessionId, ...model ? { model } : {} });
      }
      return result;
    } catch (err) {
      this._logService.warn(`[Copilot] Failed to read persisted chats for ${session.toString()}: ${err instanceof Error ? err.message : String(err)}`);
      return /* @__PURE__ */ new Map();
    } finally {
      ref.dispose();
    }
  }
  async _storeSessionMetadata(session, model, workingDirectory, workingDirectories, customizationDirectory, project, projectResolved = project !== void 0, configValues, customTitle, markRead) {
    const dbRef = this._sessionDataService.openDatabase(session);
    const db = dbRef.object;
    try {
      const work = [];
      if (model) {
        work.push(db.setMetadata(CopilotAgent._META_MODEL, this._serializeModelSelection(model)));
      }
      if (markRead) {
        work.push(db.setMetadata(AH_META_IS_READ_DB_KEY, "true"));
      }
      if (workingDirectory) {
        work.push(db.setMetadata(CopilotAgent._META_CWD, workingDirectory.toString()));
      }
      if (workingDirectories) {
        work.push(db.setMetadata(CopilotAgent._META_CWDS, JSON.stringify(workingDirectories.map((d) => d.toString()))));
      }
      if (customizationDirectory) {
        work.push(db.setMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY, customizationDirectory.toString()));
      }
      if (projectResolved) {
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_RESOLVED, "true"));
      }
      if (project) {
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_URI, project.uri.toString()));
        work.push(db.setMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME, project.displayName));
      }
      if (configValues) {
        work.push(db.setMetadata("configValues", JSON.stringify(configValues)));
      }
      if (customTitle) {
        work.push(db.setMetadata("customTitle", customTitle));
      }
      await Promise.all(work);
    } finally {
      dbRef.dispose();
    }
  }
  /**
   * Parses the persisted ordered working-directory set. Prefers the JSON
   * `_META_CWDS` array when present and valid, otherwise falls back to the
   * single legacy `_META_CWD` value. A malformed blob (the metadata store is
   * client-influenced and may be corrupt) is ignored in favour of the legacy
   * fallback so it can never reject the caller.
   */
  _parseWorkingDirectories(rawSet, fallback) {
    if (rawSet) {
      try {
        const parsed = JSON.parse(rawSet);
        if (Array.isArray(parsed)) {
          const dirs = parsed.filter((d) => typeof d === "string" && d.length > 0).map((d) => URI.parse(d));
          if (dirs.length > 0) {
            return dirs;
          }
        }
      } catch {
      }
    }
    return fallback ? [fallback] : void 0;
  }
  async _readSessionMetadata(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return {};
    }
    try {
      const [model, agent, cwd, cwds, customizationDirectory, workspaceless] = await Promise.all([
        ref.object.getMetadata(CopilotAgent._META_MODEL),
        ref.object.getMetadata(CopilotAgent._META_AGENT),
        ref.object.getMetadata(CopilotAgent._META_CWD),
        ref.object.getMetadata(CopilotAgent._META_CWDS),
        ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
        ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY)
      ]);
      const workingDirectory = cwd ? URI.parse(cwd) : void 0;
      return {
        model: this._parseModelSelection(model),
        agent: this._parseAgentSelection(agent),
        workingDirectory,
        workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
        customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : void 0,
        workspaceless: workspaceless === "true"
      };
    } finally {
      ref.dispose();
    }
  }
  async _readStoredSessionMetadata(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return void 0;
    }
    try {
      const [model, agent, cwd, cwds, customizationDirectory, resolved, uri, displayName, workspaceless] = await Promise.all([
        ref.object.getMetadata(CopilotAgent._META_MODEL),
        ref.object.getMetadata(CopilotAgent._META_AGENT),
        ref.object.getMetadata(CopilotAgent._META_CWD),
        ref.object.getMetadata(CopilotAgent._META_CWDS),
        ref.object.getMetadata(CopilotAgent._META_CUSTOMIZATION_DIRECTORY),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_RESOLVED),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_URI),
        ref.object.getMetadata(CopilotAgent._META_PROJECT_DISPLAY_NAME),
        ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY)
      ]);
      if ([model, agent, cwd, cwds, customizationDirectory, resolved, uri, displayName, workspaceless].every((value) => value === void 0)) {
        return { resolved: false };
      }
      const workingDirectory = cwd ? URI.parse(cwd) : void 0;
      const project = uri && displayName ? { uri: URI.parse(uri), displayName } : void 0;
      return {
        model: this._parseModelSelection(model),
        agent: this._parseAgentSelection(agent),
        workingDirectory,
        workingDirectories: this._parseWorkingDirectories(cwds, workingDirectory),
        customizationDirectory: customizationDirectory ? URI.parse(customizationDirectory) : void 0,
        project,
        resolved: resolved === "true" || project !== void 0,
        workspaceless: workspaceless === void 0 ? void 0 : workspaceless === "true"
      };
    } finally {
      ref.dispose();
    }
  }
  /**
   * Persists (or clears) the selected custom agent for a session. Writing
   * `undefined` clears the stored selection by writing an empty string,
   * which later cold reads treat as "no custom agent" because
   * `_parseAgentSelection` short-circuits on falsy metadata values.
   */
  async _storeSessionAgentMetadata(session, agent) {
    const dbRef = this._sessionDataService.openDatabase(session);
    try {
      await dbRef.object.setMetadata(CopilotAgent._META_AGENT, agent ? this._serializeAgentSelection(agent) : "");
    } finally {
      dbRef.dispose();
    }
  }
  async _storeSessionProjectResolution(session, project) {
    await this._storeSessionMetadata(session, void 0, void 0, void 0, void 0, project, true);
  }
  _resolveSessionProject(context, limiter, projectByContext) {
    const key = this._projectContextKey(context);
    if (!key) {
      return Promise.resolve(void 0);
    }
    let project = projectByContext.get(key);
    if (!project) {
      project = limiter.queue(() => projectFromCopilotContext(context, this._gitService));
      projectByContext.set(key, project);
    }
    return project;
  }
  _projectContextKey(context) {
    if (context?.cwd) {
      return `cwd:${context.cwd}`;
    }
    if (context?.gitRoot) {
      return `gitRoot:${context.gitRoot}`;
    }
    if (context?.repository) {
      return `repository:${context.repository}`;
    }
    return void 0;
  }
  dispose() {
    for (const ac of this._activeClients.values()) {
      ac.dispose();
    }
    this._activeClients.clear();
    this.shutdown().catch((err) => {
      this._logService.warn("[Copilot] Shutdown failed during dispose", err);
    }).finally(() => super.dispose());
  }
};
// ---- session metadata persistence --------------------------------------
CopilotAgent._META_MODEL = "copilot.model";
CopilotAgent._META_AGENT = "copilot.agent";
CopilotAgent._META_CWD = "copilot.workingDirectory";
/** Persisted ordered working-directory set (JSON array of URI strings; index 0 = primary). */
CopilotAgent._META_CWDS = "copilot.workingDirectories";
CopilotAgent._META_CUSTOMIZATION_DIRECTORY = "copilot.customizationDirectory";
CopilotAgent._META_PROJECT_RESOLVED = "copilot.project.resolved";
CopilotAgent._META_PROJECT_URI = "copilot.project.uri";
CopilotAgent._META_PROJECT_DISPLAY_NAME = "copilot.project.displayName";
/** Legacy persisted catalog of concrete chat backings, keyed by chatId. */
CopilotAgent._META_CHATS = "copilot.chats";
CopilotAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionDataService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, IAgentHostSessionTitleSignal),
  __decorateParam(6, IAgentHostManagedSettingsService),
  __decorateParam(7, IAgentHostGitHubEndpointService),
  __decorateParam(8, IAgentHostOTelService),
  __decorateParam(9, IAgentHostCompletions),
  __decorateParam(10, IAgentHostCheckpointService),
  __decorateParam(11, IAgentHostReviewService),
  __decorateParam(12, IAgentHostCustomizationEnablementService),
  __decorateParam(13, INativeEnvironmentService),
  __decorateParam(14, IByokLmBridgeRegistry),
  __decorateParam(15, ITelemetryService),
  __decorateParam(16, ICopilotApiService),
  __decorateParam(17, IAgentHostProxyResolver)
], CopilotAgent);
const REFRESH_DEBOUNCE_MS = 100;
let SessionDiscoveredEntry = class extends Disposable {
  constructor(workingDirectories, userHome, _getClient, _onDidRefresh, _fileService, _configurationService, _logService, instantiationService) {
    super();
    this._getClient = _getClient;
    this._onDidRefresh = _onDidRefresh;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._refreshDelayer = this._register(new Delayer(REFRESH_DEBOUNCE_MS));
    this._refreshPromise = null;
    this._pendingRefreshNotify = false;
    this._customizations = [];
    this._discovery = this._register(instantiationService.createInstance(SessionCustomizationDiscovery, workingDirectories, userHome, URI.file));
    this._settled = this._queueRefresh(false, 0);
    this._register(this._discovery.onDidChange(() => {
      this._settled = this._queueRefresh(true);
    }));
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._settled = this._queueRefresh(true);
    }));
  }
  dispose() {
    this._refreshPromise?.cancel();
    this._refreshPromise = null;
    super.dispose();
  }
  whenSettled() {
    return this._settled;
  }
  currentCustomizations() {
    return this._customizations;
  }
  _queueRefresh(notify, delay = REFRESH_DEBOUNCE_MS) {
    this._refreshPromise?.cancel();
    this._refreshPromise = null;
    this._pendingRefreshNotify = this._pendingRefreshNotify || notify;
    return this._refreshDelayer.trigger(() => {
      const shouldNotify = this._pendingRefreshNotify;
      this._pendingRefreshNotify = false;
      const refreshPromise = this._refreshPromise = createCancelablePromise(async (token) => {
        const didRefresh = await this._refresh(token);
        if (didRefresh && shouldNotify) {
          this._onDidRefresh();
        }
      });
      return refreshPromise.then(() => {
        if (this._refreshPromise === refreshPromise) {
          this._refreshPromise = null;
        }
      }, (err) => {
        if (this._refreshPromise === refreshPromise) {
          this._refreshPromise = null;
        }
        if (err instanceof CancellationError) {
          return;
        }
        throw err;
      });
    }, delay).catch((err) => {
      if (err instanceof CancellationError) {
        return;
      }
      throw err;
    });
  }
  async _refresh(token) {
    try {
      const mode = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.SessionCustomizationDiscoveryMode) ?? DEFAULT_SESSION_CUSTOMIZATION_DISCOVERY_MODE;
      if (mode === "discover") {
        const customizations2 = await this._discovery.discover(await this._getClient(), token);
        if (token.isCancellationRequested) {
          return false;
        }
        if (equals(this._customizations, customizations2)) {
          return false;
        }
        this._customizations = customizations2;
        this._directories = void 0;
        return true;
      }
      const directories = await this._discovery.scan(token);
      if (token.isCancellationRequested) {
        return false;
      }
      if (this._directories && areDiscoveredDirectoriesEqual(this._directories, directories)) {
        return false;
      }
      const customizations = await toDiscoveredDirectoryCustomizations(directories, this._fileService);
      if (token.isCancellationRequested) {
        return false;
      }
      this._customizations = customizations;
      this._directories = directories;
      return true;
    } catch (err) {
      if (token.isCancellationRequested) {
        return false;
      }
      this._logService.warn(`[Copilot:SessionDiscoveredEntry] Discovery/bundle failed: ${err instanceof Error ? err.message : String(err)}`);
      const hadState = this._customizations.length > 0 || this._directories !== void 0;
      this._customizations = [];
      this._directories = void 0;
      return hadState;
    }
  }
};
SessionDiscoveredEntry = __decorateClass([
  __decorateParam(4, IFileService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IInstantiationService)
], SessionDiscoveredEntry);
function toDiscoveredDirectoryCustomizations(directories, fileService) {
  return Promise.all(directories.map(async (directory) => {
    const protocolUri = directory.uri.toString();
    return {
      type: CustomizationType.Directory,
      id: customizationId(protocolUri),
      uri: protocolUri,
      name: directory.name,
      enabled: true,
      contents: toDirectoryContentsType(directory.type),
      writable: directory.writable,
      // whether the new customization can be created in this directory
      load: { kind: CustomizationLoadStatus.Loaded },
      children: await Promise.all(directory.files.map((file) => toDiscoveredChildCustomization(file.uri, directory.type, fileService)))
    };
  }));
}
function toDirectoryContentsType(type) {
  switch (type) {
    case DiscoveredType.Agent:
      return CustomizationType.Agent;
    case DiscoveredType.Skill:
      return CustomizationType.Skill;
    case DiscoveredType.Instruction:
    case DiscoveredType.AgentInstruction:
      return CustomizationType.Rule;
    case DiscoveredType.Hook:
      return CustomizationType.Hook;
  }
}
async function toDiscoveredChildCustomization(file, type, fileService) {
  const uri = file.toString();
  const id = customizationId(uri);
  if (type === DiscoveredType.Agent) {
    const agentInfo = await parseAgentFile(file, fileService);
    const agentCustomization = {
      type: CustomizationType.Agent,
      id,
      uri,
      name: agentInfo.name,
      description: agentInfo.description
    };
    if (agentInfo.userInvocable !== void 0) {
      agentCustomization._meta = { userInvocable: agentInfo.userInvocable };
    }
    return agentCustomization;
  }
  if (type === DiscoveredType.Skill) {
    const skillInfo = await parseSkillFile(file, fileService);
    const skillCustomization = {
      type: CustomizationType.Skill,
      id,
      uri,
      name: skillInfo.name,
      description: skillInfo.description
    };
    return skillCustomization;
  }
  if (type === DiscoveredType.Instruction) {
    const ruleInfo = await parseRuleFile(file, fileService);
    const ruleCustomization = {
      type: CustomizationType.Rule,
      id,
      uri,
      name: ruleInfo.name,
      description: ruleInfo.description,
      globs: ruleInfo.globs,
      alwaysApply: ruleInfo.alwaysApply
    };
    return ruleCustomization;
  }
  if (type === DiscoveredType.Hook) {
    const hookCustomization = {
      type: CustomizationType.Hook,
      id,
      uri,
      name: resourceBasename(file)
    };
    return hookCustomization;
  }
  return {
    type: CustomizationType.Rule,
    alwaysApply: true,
    id,
    uri,
    name: resourceBasename(file)
  };
}
function mapToParsedPlugin(customizations) {
  if (customizations.length === 0) {
    return void 0;
  }
  const agents = [];
  const skills = [];
  const instructions = [];
  for (const directory of customizations) {
    for (const child of directory.children ?? []) {
      if (child.type === CustomizationType.Agent) {
        agents.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
        continue;
      }
      if (child.type === CustomizationType.Skill) {
        skills.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
        continue;
      }
      if (child.type === CustomizationType.Rule) {
        if (child.alwaysApply && child.name.match(/\.md$/i)) {
          continue;
        }
        instructions.push({
          uri: URI.parse(child.uri),
          name: child.name,
          description: child.description,
          customization: child
        });
      }
    }
  }
  if (agents.length === 0 && skills.length === 0 && instructions.length === 0) {
    return void 0;
  }
  return {
    format: PluginFormat.Copilot,
    hooks: [],
    mcpServers: [],
    skills,
    agents,
    instructions
  };
}
let PluginController = class extends Disposable {
  constructor(_getClient, pluginManager, _logService, _fileService, _configurationService, _instantiationService, _environmentService) {
    super();
    this._getClient = _getClient;
    this.pluginManager = pluginManager;
    this._logService = _logService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._environmentService = _environmentService;
    this._onDidChange = this._register(new Emitter());
    /** Fires when host customizations change. Session controllers forward this. */
    this.onDidChange = this._onDidChange.event;
    this._hostCustomizations = [];
    this._hostSync = Promise.resolve([]);
    this._hostRevision = 0;
    this._lastAppliedRefs = [];
    this._applyHostCustomizations();
    this._register(this._configurationService.onDidRootConfigChange(() => {
      this._applyHostCustomizations();
    }));
  }
  getConfiguredHostCustomizations() {
    return this._hostCustomizations.map((item) => item.customization);
  }
  get configurationService() {
    return this._configurationService;
  }
  /**
   * Snapshot the resolved host customizations (loading or loaded). Used by
   * {@link SessionPluginController} to compose its per-session view.
   */
  hostCustomizations() {
    return this._hostCustomizations;
  }
  /** In-flight host sync; awaited by `getCustomizationsSettled` consumers. */
  hostSync() {
    return this._hostSync;
  }
  getUserHome() {
    return this._environmentService.userHome;
  }
  async getClient() {
    return this._getClient();
  }
  /** Creates a per-session controller that reads host-customization state lazily. */
  createSessionController(session, directory, hostCustomizations) {
    return this._instantiationService.createInstance(SessionPluginController, this, session, directory, hostCustomizations);
  }
  /**
   * Reads the current host customizations from the root config and
   * resolves them. Skips the update when the configured refs have not
   * changed since the last application.
   */
  _applyHostCustomizations() {
    const entries = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.Customizations) ?? [];
    const customizations = entries.map(toContainerCustomization);
    if (equals(customizations, this._lastAppliedRefs)) {
      return;
    }
    this._lastAppliedRefs = customizations;
    const revision = ++this._hostRevision;
    this._hostCustomizations = customizations.map((customization) => ({
      customization: {
        ...customization,
        load: { kind: CustomizationLoadStatus.Loading }
      }
    }));
    this._onDidChange.fire();
    this._hostSync = Promise.all(customizations.map((customization) => this.resolveConfiguredCustomization(customization))).then((resolved) => {
      if (revision === this._hostRevision) {
        this._hostCustomizations = resolved;
      }
      return resolved;
    }).finally(() => {
      if (revision === this._hostRevision) {
        this._onDidChange.fire();
      }
    });
  }
  async resolveConfiguredCustomization(customization) {
    const pluginDir = URI.parse(customization.uri);
    const parsed = await this.tryParsePlugin(pluginDir);
    if (!parsed) {
      return {
        customization: {
          ...customization,
          load: { kind: CustomizationLoadStatus.Error, message: localize("copilotAgent.pluginParseError", "Error parsing plugin.") }
        }
      };
    }
    return {
      customization: {
        ...customization,
        load: { kind: CustomizationLoadStatus.Loaded },
        children: toChildCustomizations([parsed])
      },
      pluginDir,
      plugin: parsed
    };
  }
  async resolveSyncedCustomization(item, clientId, input) {
    const baseCustomization = { ...item.customization, clientId };
    if (!item.pluginDir) {
      return { customization: baseCustomization, input };
    }
    const parsed = await this.tryParsePlugin(item.pluginDir);
    if (!parsed) {
      return {
        customization: {
          ...baseCustomization,
          load: { kind: CustomizationLoadStatus.Error, message: localize("copilotAgent.pluginParseError", "Error parsing plugin.") }
        },
        input
      };
    }
    return {
      customization: {
        ...baseCustomization,
        children: toChildCustomizations([parsed])
      },
      pluginDir: item.pluginDir,
      plugin: parsed,
      input
    };
  }
  async tryParsePlugin(pluginDir) {
    try {
      return await parsePlugin(pluginDir, this._fileService, void 0, this.getUserHome(), pluginDir);
    } catch (error) {
      this._logService.warn(`[Copilot:PluginController] Error parsing plugin '${pluginDir.toString()}': ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
};
PluginController = __decorateClass([
  __decorateParam(1, IAgentPluginManager),
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IAgentConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, INativeEnvironmentService)
], PluginController);
let SessionPluginController = class extends Disposable {
  constructor(_parent, _session, _directory, _hostCustomizations, _logService, _instantiationService, _customizationEnablementService) {
    super();
    this._parent = _parent;
    this._session = _session;
    this._directory = _directory;
    this._hostCustomizations = _hostCustomizations;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._customizationEnablementService = _customizationEnablementService;
    this._onDidPublish = this._register(new Emitter());
    /** Per-session action stream (reset + per-item updates). */
    this.onDidPublish = this._onDidPublish.event;
    this._isEnablementReady = false;
    this._previousDirectories = [];
    this._desiredCustomizationById = /* @__PURE__ */ new Map();
    /** Live MCP server runtime state overlaid onto published customizations across re-syncs. */
    this.mcpServerStates = observableValue(this, /* @__PURE__ */ new Map());
    /** Per-client customization state; published customizations are the stable first-wins union of these entries. */
    this._clients = /* @__PURE__ */ new Map();
    this._sessionDiscovered = this._register(new MutableDisposable());
    /** Additional multi-root workspace folders (roots 1..N); the primary root is tracked separately. */
    this._additionalDirectories = [];
    this._enablementReady = this._customizationEnablementService.initializeSession(this._session.toString()).then(() => {
      this._isEnablementReady = true;
    });
  }
  get directory() {
    return this._directory;
  }
  /** The additional (non-primary) roots attached to customization discovery. */
  get additionalDirectories() {
    return this._additionalDirectories;
  }
  /**
   * Anchor (or re-anchor) the session's customization directory.
   * Only ever transitions from `undefined` → set; once a directory has
   * been bound the discovered entry is pinned to it for the remainder
   * of the session.
   */
  setDirectory(directory) {
    if (this._directory || !directory) {
      return;
    }
    this._directory = directory;
  }
  /**
   * Set the additional (non-primary) workspace roots. Recreates the discovered
   * entry when the set actually changes so discovery re-scans every root —
   * important when this is set after a primary-only entry was already created
   * (e.g. on resume). A no-op for the single-root case (empty tail).
   */
  setAdditionalDirectories(directories) {
    if (this._additionalDirectories.length === directories.length && this._additionalDirectories.every((d, i) => isEqual(d, directories[i]))) {
      return;
    }
    this._additionalDirectories = directories;
    this._sessionDiscovered.clear();
  }
  /**
   * Move the session's customization anchor to a new directory (e.g. from the
   * user-picked folder to the worktree at materialization). Recreates the
   * discovered entry so discovery/watchers re-scan the new directory.
   */
  reanchor(directory) {
    if (this._directory && isEqual(this._directory, directory)) {
      return;
    }
    const previous = this._directory;
    this._directory = directory;
    this._sessionDiscovered.clear();
    if (previous && !this._previousDirectories.some((candidate) => isEqual(candidate, previous))) {
      this._previousDirectories.push(previous);
    }
  }
  getCustomizations() {
    return this._resolveCustomizationEnablement().customizations;
  }
  resolveTopLevelMcpCustomizations(customizations, mcpServerOwners) {
    return resolveCustomizationEnablement(this._customizationEnablementService, this._session, customizations, this._clientChildEnablement(), void 0, mcpServerOwners).customizations;
  }
  _resolveCustomizationEnablement() {
    const result = [
      ...this._parent.hostCustomizations().map((item) => this._projectForPublish(item.customization)),
      ...this._flattenClientCustomizations().map((item) => this._projectForPublish(item.customization))
    ];
    const entry = this._discoveredEntry();
    const discovered = entry?.currentCustomizations() ?? [];
    for (const customization of discovered) {
      result.push(this._projectForPublish(customization));
    }
    return resolveCustomizationEnablement(this._customizationEnablementService, this._session, result, this._clientChildEnablement(), this._clientPlugins());
  }
  /**
   * The union of every active client's resolved customizations,
   * deduplicated by URI with the first-inserted client winning. Order
   * follows client insertion order, then per-client order.
   */
  _flattenClientCustomizations() {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const client of this._clients.values()) {
      for (const item of client.customizations) {
        if (seen.has(item.customization.uri)) {
          continue;
        }
        seen.add(item.customization.uri);
        result.push(item);
      }
    }
    return result;
  }
  /**
   * Settled variant of {@link getCustomizations}: awaits the in-flight
   * host sync, every in-flight client sync, and the discovered entry's
   * initial scan + parse before snapshotting the list. Callers that
   * publish customizations into session state at session creation time
   * MUST use this — the synchronous variant can return an empty list
   * for a brand-new working directory because {@link SessionDiscoveredEntry}
   * kicks off its `_refresh()` without anyone awaiting it.
   */
  async getCustomizationsSettled() {
    await this._enablementReady;
    const entry = this._discoveredEntry();
    await Promise.all([
      this._parent.hostSync().catch((err) => this._logService.warn("[Copilot:SessionPluginController] Host customization update failed", err)),
      ...[...this._clients.values()].map((client) => client.sync.catch((err) => this._logService.warn("[Copilot:SessionPluginController] Client customization sync failed", err))),
      entry?.whenSettled()
    ]);
    return this.getCustomizations();
  }
  /** Returns the parsed plugins currently enabled for this session, awaiting any pending sync. */
  async getAppliedPlugins() {
    await this._customizationEnablementService.initializeSession(this._session.toString());
    const entry = this._discoveredEntry();
    const [host] = await Promise.all([
      this._parent.hostSync().catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Host customization update failed", err);
        return this._parent.hostCustomizations();
      }),
      ...[...this._clients.values()].map((client) => client.sync.catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Client customization sync failed", err);
        return client.customizations;
      })),
      entry?.whenSettled()
    ]);
    const resolved = this._resolveCustomizationEnablement();
    const desiredByUri = new Map(resolved.customizations.map((customization) => [customization.uri, customization]));
    const mcpEnablement = getSdkMcpServerEnablement(resolved);
    const isEnabledForSdk = (customization) => {
      const desired = desiredByUri.get(customization.uri) ?? customization;
      return isCustomizationSdkEligible(resolved, desired) && (desired.type === CustomizationType.Directory ? desired.enabled : isCustomizationEnabled(desired));
    };
    const disabledChildren = (customization) => {
      const desired = desiredByUri.get(customization.uri);
      const children = desired && desired.type !== CustomizationType.McpServer ? desired.children?.filter((child) => child.type === CustomizationType.McpServer && !mcpEnablement.get(child.id)).map((child) => child.name) : void 0;
      return children?.length ? children : void 0;
    };
    const discovered = entry?.currentCustomizations() ?? [];
    const sessionPlugin = discovered.some(isEnabledForSdk) ? mapToParsedPlugin(discovered) : void 0;
    const sessionPlugins = sessionPlugin ? [sessionPlugin] : [];
    return [
      ...host.filter((item) => !!item.plugin && isEnabledForSdk(item.customization)).map((item) => ({ ...item.plugin, pluginDir: item.pluginDir, sourceUri: URI.parse(item.customization.uri), ...disabledChildren(item.customization) ? { disabledMcpServers: disabledChildren(item.customization) } : {} })),
      ...this._flattenClientCustomizations().filter((item) => !!item.plugin && isEnabledForSdk(item.customization)).map((item) => ({ ...item.plugin, pluginDir: item.pluginDir, sourceUri: URI.parse(item.customization.uri), ...disabledChildren(item.customization) ? { disabledMcpServers: disabledChildren(item.customization) } : {} })),
      ...sessionPlugins
    ];
  }
  /**
   * Sync the published customizations for a single client of this session,
   * keyed by `clientId`. Replaces only that client's slice; other clients'
   * customizations are untouched. The published session-state list is the
   * union across all clients.
   *
   * @param quiet when `true`, suppress {@link onDidPublish} events for
   *   this sync. Used during eager-create paths where there is no
   *   session listener yet; the session-state snapshot picks up the
   *   final view directly when the session materializes.
   */
  async sync(clientId, customizations, options) {
    if (!this._isEnablementReady) {
      await this._enablementReady;
    }
    const quiet = options?.quiet === true;
    let client = this._clients.get(clientId);
    if (!client) {
      client = { revision: 0, customizations: [], sync: Promise.resolve([]), inputs: [] };
      this._clients.set(clientId, client);
    } else if (equals(client.inputs, customizations)) {
      return client.sync.then((results) => results.map((item) => ({
        customization: this._resolveCustomizationForPublish(item.customization),
        ...item.pluginDir ? { pluginDir: item.pluginDir } : {}
      })));
    }
    const revision = ++client.revision;
    client.inputs = customizations;
    client.customizations = customizations.map((customization) => ({
      customization: {
        ...customization,
        clientId,
        load: { kind: CustomizationLoadStatus.Loading }
      },
      input: customization
    }));
    if (!quiet) {
      this._publish(() => ({
        type: ActionType.SessionCustomizationsChanged,
        customizations: [...this.getCustomizations()]
      }));
    }
    const published = /* @__PURE__ */ new Map();
    for (const customization of client.customizations) {
      const enabled = this._resolveCustomizationForPublish(customization.customization);
      published.set(enabled.uri, enabled);
    }
    const publishUpdate = (item) => {
      const customization = this._resolveCustomizationForPublish(item.customization);
      if (equals(published.get(customization.uri), customization)) {
        return;
      }
      published.set(customization.uri, customization);
      if (!quiet) {
        this._publish(() => ({
          type: ActionType.SessionCustomizationUpdated,
          customization
        }));
      }
    };
    const prev = client.sync;
    const promise = client.sync = prev.catch((err) => {
      this._logService.warn("[Copilot:SessionPluginController] Previous customization sync failed", err);
    }).then(async () => {
      const inputByUri = new Map(customizations.map((c) => [c.uri, c]));
      const result = await this._parent.pluginManager.syncCustomizations(clientId, customizations, (status) => {
        if (revision !== client.revision) {
          return;
        }
        publishUpdate({
          customization: { ...status, clientId },
          input: inputByUri.get(status.uri)
        });
      });
      const resolved = await Promise.all(result.map((item) => this._parent.resolveSyncedCustomization(item, clientId, inputByUri.get(item.customization.uri))));
      if (revision === client.revision) {
        client.customizations = resolved;
        for (const item of resolved) {
          publishUpdate(item);
        }
      }
      return resolved;
    });
    return promise.then((results) => results.map((item) => ({
      customization: this._resolveCustomizationForPublish(item.customization),
      ...item.pluginDir ? { pluginDir: item.pluginDir } : {}
    })));
  }
  /**
   * Remove a client's customization contribution from this session,
   * publishing the updated (union) customization list so the removed
   * client's plugins disappear from session state.
   */
  removeClient(clientId) {
    const client = this._clients.get(clientId);
    if (!client) {
      return;
    }
    client.revision++;
    this._clients.delete(clientId);
    this._publish(() => ({
      type: ActionType.SessionCustomizationsChanged,
      customizations: [...this.getCustomizations()]
    }));
  }
  /** The raw input customizations last synced for `clientId` (empty when absent). */
  clientInputs(clientId) {
    return this._clients.get(clientId)?.inputs ?? [];
  }
  /**
   * Re-issue each client's last sync if any of its previously-synced
   * customizations is currently in an error state. Used to recover from
   * transient sync failures (e.g. a `vscode-agent-host://` connection drop
   * during reconnection) at message boundaries. Re-syncs **only** the
   * errored items and always non-quiet so listeners observe recovery.
   */
  async retryFailedClientSyncIfNeeded() {
    await Promise.all([...this._clients.values()].map((client) => client.sync.catch(() => {
    })));
    for (const [clientId, client] of [...this._clients]) {
      const errored = client.customizations.filter(
        (item) => item.customization.load?.kind === CustomizationLoadStatus.Error && item.input !== void 0
      );
      if (errored.length === 0) {
        continue;
      }
      const inputs = errored.map((item) => item.input);
      this._logService.info(`[Copilot:SessionPluginController] Retrying ${inputs.length} previously-failed client customization(s) for ${clientId}`);
      await this.sync(clientId, inputs).catch((err) => {
        this._logService.warn("[Copilot:SessionPluginController] Retried client customization sync failed", err);
      });
    }
  }
  _discoveredEntry() {
    if (!this._directory) {
      return void 0;
    }
    if (!this._sessionDiscovered.value) {
      this._sessionDiscovered.value = this._instantiationService.createInstance(
        SessionDiscoveredEntry,
        [this._directory, ...this._additionalDirectories],
        this._parent.getUserHome(),
        () => this._parent.getClient(),
        () => this._publish(() => ({
          type: ActionType.SessionCustomizationsChanged,
          customizations: [...this.getCustomizations()]
        }))
      );
    }
    return this._sessionDiscovered.value;
  }
  _publish(action) {
    const publish = () => {
      if (!this._store.isDisposed) {
        this._onDidPublish.fire(action());
      }
    };
    if (this._isEnablementReady) {
      publish();
    } else {
      void this._enablementReady.then(publish).catch((error) => this._logService.error("[Copilot:SessionPluginController] Failed to initialize customization enablement", error));
    }
  }
  _clientChildEnablement() {
    const result = /* @__PURE__ */ new Map();
    for (const client of this._clients.values()) {
      for (const customization of client.inputs) {
        if (customization.childEnablement !== void 0) {
          result.set(customization.uri, customization.childEnablement);
        }
      }
    }
    return result;
  }
  _clientPlugins() {
    const result = /* @__PURE__ */ new Map();
    for (const client of this._clients.values()) {
      for (const customization of client.inputs) {
        result.set(customization.uri, customization);
      }
    }
    return result;
  }
  _isEnabled(customization) {
    return this._desiredEnabled(customization) ?? (customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization));
  }
  _applyEnablement(customization) {
    if (customization.type === CustomizationType.McpServer) {
      return this._applyExplicitEnablement(customization, this._getDesiredCustomization(customization.id));
    }
    if (customization.type === CustomizationType.Plugin) {
      const plugin = customization;
      const next = this._applyExplicitEnablement(plugin, this._getDesiredCustomization(plugin.id));
      let changed2 = next !== customization;
      const children2 = next.children?.map((child) => {
        if (child.type === CustomizationType.McpServer) {
          const updated = this._applyExplicitEnablement(child, this._getDesiredCustomization(child.id));
          changed2 ||= updated !== child;
          return updated;
        }
        const desiredEnabled = this._desiredEnabled(child);
        if (desiredEnabled === void 0 || desiredEnabled === child.enabled) {
          return child;
        }
        changed2 = true;
        return { ...child, enabled: desiredEnabled };
      });
      return changed2 ? { ...next, children: children2 } : next;
    }
    const enabled = this._isEnabled(customization);
    let changed = customization.enabled !== enabled;
    const children = customization.children?.map((child) => {
      if (child.type === CustomizationType.McpServer) {
        const next = this._applyExplicitEnablement(child, this._getDesiredCustomization(child.id));
        changed ||= next !== child;
        return next;
      }
      const desiredEnabled = this._desiredEnabled(child);
      if (desiredEnabled === void 0 || desiredEnabled === child.enabled) {
        return child;
      }
      changed = true;
      return { ...child, enabled: desiredEnabled };
    });
    return changed ? { ...customization, enabled, children } : customization;
  }
  _resolveCustomizationForPublish(customization) {
    return resolveCustomizationEnablement(
      this._customizationEnablementService,
      this._session,
      [this._projectForPublish(customization)],
      this._clientChildEnablement(),
      this._clientPlugins()
    ).customizations[0];
  }
  _desiredEnabled(customization) {
    const exact = this._getDesiredCustomization(customization.id);
    if (exact) {
      return exact.type === CustomizationType.Plugin || exact.type === CustomizationType.McpServer ? isCustomizationEnabled(exact) : exact.enabled;
    }
    if (!this._directory) {
      return void 0;
    }
    for (const previousDirectory of this._previousDirectories) {
      const previousUri = rebaseUnder(URI.parse(customization.uri), this._directory, previousDirectory);
      if (!previousUri) {
        continue;
      }
      const previousId = customizationId(previousUri.toString(), customization.range);
      const previous = this._getDesiredCustomization(previousId);
      if (previous) {
        return previous.type === CustomizationType.Plugin || previous.type === CustomizationType.McpServer ? isCustomizationEnabled(previous) : previous.enabled;
      }
    }
    return void 0;
  }
  _applyExplicitEnablement(customization, desired) {
    if (!desired || desired.type !== CustomizationType.Plugin && desired.type !== CustomizationType.McpServer) {
      return customization;
    }
    if (desired.enablement?.length) {
      const next2 = { ...customization, enablement: [...desired.enablement] };
      return next2;
    }
    const next = { ...customization };
    delete next.enablement;
    return next;
  }
  _getDesiredCustomization(id) {
    const customizations = this._hostCustomizations();
    if (customizations !== this._indexedDesiredCustomizations) {
      this._indexedDesiredCustomizations = customizations;
      this._desiredCustomizationById.clear();
      for (const customization of customizations ?? []) {
        this._desiredCustomizationById.set(customization.id, customization);
        if (customization.type !== CustomizationType.McpServer) {
          for (const child of customization.children ?? []) {
            this._desiredCustomizationById.set(child.id, child);
          }
        }
      }
    }
    return this._desiredCustomizationById.get(id);
  }
  /**
   * Projects a raw customization into its published form: applies reducer-backed
   * per-session enablement, then overlays the latest
   * known MCP runtime `state`/`channel` (see {@link mcpServerStates}).
   * Every publish path runs customizations through this so enablement and
   * live MCP state stay consistent. Object identity is preserved when
   * neither step changes anything, keeping downstream equality checks
   * stable.
   */
  _projectForPublish(customization) {
    return this._overlayMcpState(this._applyEnablement(customization));
  }
  /**
   * Overlays the latest known MCP runtime `state`/`channel` (see
   * {@link mcpServerStates}) onto a customization and its children,
   * preserving object identity when nothing is overlaid so downstream
   * equality checks stay stable.
   */
  _overlayMcpState(customization) {
    const overlays = this.mcpServerStates.get();
    if (overlays.size === 0) {
      return customization;
    }
    if (customization.type === CustomizationType.McpServer) {
      const overlay = overlays.get(customization.id);
      return overlay ? { ...customization, state: overlay.state, channel: overlay.channel } : customization;
    }
    const children = customization.children;
    if (!children || children.length === 0) {
      return customization;
    }
    let changed = false;
    const overlaidChildren = children.map((child) => {
      if (child.type !== CustomizationType.McpServer) {
        return child;
      }
      const overlay = overlays.get(child.id);
      if (!overlay) {
        return child;
      }
      changed = true;
      return { ...child, state: overlay.state, channel: overlay.channel };
    });
    return changed ? { ...customization, children: overlaidChildren } : customization;
  }
};
SessionPluginController = __decorateClass([
  __decorateParam(4, ILogService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IAgentHostCustomizationEnablementService)
], SessionPluginController);
class CopilotActiveClientHandle {
  constructor(_owner, clientId, displayName) {
    this._owner = _owner;
    this.clientId = clientId;
    this.displayName = displayName;
  }
  get tools() {
    return this._owner.toolSet.get(this.clientId);
  }
  set tools(tools) {
    this._owner.toolSet.set(this.clientId, tools);
  }
  get customizations() {
    return this._owner.pluginController.clientInputs(this.clientId);
  }
  set customizations(customizations) {
    this._owner.pluginController.sync(this.clientId, [...customizations]).catch(() => {
    });
  }
}
let ActiveClient = class extends Disposable {
  constructor(_sessionUri, pluginController, onDidSessionProgress, _configurationService) {
    super();
    this._sessionUri = _sessionUri;
    this._configurationService = _configurationService;
    /**
     * Live, multi-client registry of contributed tools. Shared by reference
     * with the session's {@link CopilotAgentSession} so a window reload (new
     * `clientId`, identical tools) is reflected at tool-call stamp time without
     * restarting the SDK session, and so tool calls are attributed to the
     * contributing client.
     */
    this.toolSet = new ActiveClientToolSet();
    this._handles = /* @__PURE__ */ new Map();
    /** Host-published per-client chat membership, updated incrementally one exact chat at a time. */
    this._chatsByClient = /* @__PURE__ */ new Map();
    /** Chats with authoritative membership; unknown chats are treated separately from "no contributors". */
    this._knownChats = /* @__PURE__ */ new Set();
    this.pluginController = this._register(pluginController);
    this._register(this.pluginController.onDidPublish((action) => {
      onDidSessionProgress.fire({ kind: "action", resource: this._sessionUri, action });
    }));
  }
  /** Adds `chat` to `clientId`'s membership and reports whether membership grew. */
  addClientChat(clientId, chat) {
    const chatKey = chat.toString();
    const chats = this._chatsByClient.get(clientId);
    if (chats?.has(chatKey)) {
      return false;
    }
    if (chats) {
      chats.add(chatKey);
    } else {
      this._chatsByClient.set(clientId, /* @__PURE__ */ new Set([chatKey]));
    }
    this._knownChats.add(chatKey);
    return true;
  }
  /** Removes `chat` from `clientId` and reports whether that client now has no chats left. */
  removeClientChat(clientId, chat) {
    const chatKey = chat.toString();
    const chats = this._chatsByClient.get(clientId);
    if (!chats?.has(chatKey)) {
      return false;
    }
    chats.delete(chatKey);
    if (chats.size === 0) {
      this._chatsByClient.delete(clientId);
    }
    this._reindexKnownChats();
    return !this._chatsByClient.has(clientId);
  }
  /** Removes `chat` from every client, dropping clients left with no remaining chats. */
  removeChat(chat) {
    for (const clientId of [...this._chatsByClient.keys()]) {
      if (this.removeClientChat(clientId, chat)) {
        this.removeClient(clientId);
      }
    }
  }
  /** The exact chats `clientId` contributes to, as last published by the host. */
  clientChats(clientId) {
    return [...this._chatsByClient.get(clientId) ?? []];
  }
  /** Unknown chats are temporarily in scope for every client until the host publishes exact membership. */
  contributesTo(clientId, chatKey) {
    return !this._knownChats.has(chatKey) || this._chatsByClient.get(clientId)?.has(chatKey) === true;
  }
  /** Chat-scoped tool union; duplicate names keep the first contributor's definition. */
  toolsForChat(chatKey) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const clientId of this.toolSet.clientIds()) {
      if (!this.contributesTo(clientId, chatKey)) {
        continue;
      }
      for (const tool of this.toolSet.get(clientId)) {
        if (!seen.has(tool.name)) {
          seen.add(tool.name);
          result.push(tool);
        }
      }
    }
    return result;
  }
  _reindexKnownChats() {
    this._knownChats.clear();
    for (const chats of this._chatsByClient.values()) {
      for (const chatKey of chats) {
        this._knownChats.add(chatKey);
      }
    }
  }
  /** Get (or lazily create) the stable handle for `clientId`. */
  getOrCreateHandle(clientId, displayName) {
    let handle = this._handles.get(clientId);
    if (!handle) {
      handle = new CopilotActiveClientHandle(this, clientId, displayName);
      this._handles.set(clientId, handle);
    }
    return handle;
  }
  /** Drop a client's tool, customization, and membership state from this session. */
  removeClient(clientId) {
    this._handles.delete(clientId);
    this.toolSet.delete(clientId);
    this._chatsByClient.delete(clientId);
    this._reindexKnownChats();
    this.pluginController.removeClient(clientId);
  }
  /** Builds the client/plugin/MCP snapshot a chat should advertise to its SDK session. */
  async snapshot(chatKey) {
    return {
      tools: chatKey === void 0 ? this.toolSet.merged() : this.toolsForChat(chatKey),
      plugins: await this.pluginController.getAppliedPlugins(),
      mcpServers: this._getMcpServers()
    };
  }
  _getMcpServers() {
    const servers = this._configurationService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey) ?? {};
    return structuredClone(servers);
  }
  /** Returns whether plugins or the chat-scoped structural tool set changed enough to require resume. */
  async requiresRestart(snap, chatKey) {
    const plugins = await this.pluginController.getAppliedPlugins();
    if (!parsedPluginsEqual(snap.plugins, plugins)) {
      return true;
    }
    if (!equals(snap.mcpServers, this._getMcpServers())) {
      return true;
    }
    return chatKey === void 0 ? !this.toolSet.structuralEquals(snap.tools) : !structuralToolsEqual(this.toolsForChat(chatKey), snap.tools);
  }
};
ActiveClient = __decorateClass([
  __decorateParam(3, IAgentConfigurationService)
], ActiveClient);
export {
  COPILOT_AGENT_HOST_SYSTEM_MESSAGE,
  CopilotAgent,
  REFRESH_DEBOUNCE_MS,
  getCopilotManagedSettingsDiagnostics,
  mapToParsedPlugin,
  migrateEnablementKeys,
  rebaseUnder,
  resolveCopilotOtlpMetricsEndpoint,
  toDiscoveredDirectoryCustomizations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90QWdlbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb3BpbG90Q2xpZW50LCBSdW50aW1lQ29ubmVjdGlvbiwgdHlwZSBDb3BpbG90Q2xpZW50T3B0aW9ucywgdHlwZSBHaXRIdWJUZWxlbWV0cnlOb3RpZmljYXRpb24sIHR5cGUgTWFuYWdlZFNldHRpbmdzUmVzb2x2ZWREYXRhLCB0eXBlIFNlc3Npb25Nb2RlIGFzIENvcGlsb3RTZGtNb2RlIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgeyBwYXRoVG9GaWxlVVJMIH0gZnJvbSAndXJsJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVmZXJyZWRQcm9taXNlLCBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCwgTGltaXRlciwgcmFjZVRpbWVvdXQsIFNlcXVlbmNlciwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0eXBlIENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIHR5cGUgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZm9ybWF0VG9rZW5Db3VudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUsIG9ic2VydmFibGVWYWx1ZU9wdHMsIHR5cGUgSU9ic2VydmFibGUsIHR5cGUgSVNldHRhYmxlT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZGVsaW1pdGVyLCBkaXJuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSBhcyByZXNvdXJjZUJhc2VuYW1lLCBpc0VxdWFsLCBpc0VxdWFsT3JQYXJlbnQsIGpvaW5QYXRoIGFzIHJlc291cmNlSm9pblBhdGgsIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgcmdEaXNrUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9yaXBncmVwLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQYXJzZWRBZ2VudCwgSVBhcnNlZFBsdWdpbiwgSVBhcnNlZFJ1bGUsIElQYXJzZWRTa2lsbCwgcGFyc2VBZ2VudEZpbGUsIHBhcnNlUGx1Z2luLCBwYXJzZVJ1bGVGaWxlLCBwYXJzZVNraWxsRmlsZSwgUGx1Z2luRm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyB3b3Jrc3BhY2VsZXNzU2NyYXRjaERpciB9IGZyb20gJy4uL3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFJldmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0UmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQcmljaW5nTWV0YUZyb21CaWxsaW5nLCBoYXNMb25nQ29udGV4dFN1cmNoYXJnZSwgbm9ybWFsaXplQ0FQSUJpbGxpbmcsIHR5cGUgSUNBUElNb2RlbEJpbGxpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRNb2RlbFByaWNpbmcuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRNb2RlbEJ5b2tNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50TW9kZWxCeW9rTWV0YS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb25maWdLZXksIGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIERFRkFVTFRfU0VTU0lPTl9DVVNUT01JWkFUSU9OX0RJU0NPVkVSWV9NT0RFLCB0b0NvbnRhaW5lckN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkNvbmZpZy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5LCBDb3BpbG90Q2xpVlNDb2RlQXNzaWdubWVudENvbnRleHRLZXksIGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIERFRkFVTFRfQ09QSUxPVF9SVUJCRVJfRFVDS19FTkFCTEVELCB0eXBlIENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5LCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSwgQWdlbnRIb3N0U2Vzc2lvblN5bmNFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdE1pZ3JhdGVMZWdhY3lDb3BpbG90Q2xpRW5hYmxlZENvbmZpZ0tleSwgQXV0b0FwcHJvdmVMZXZlbCwgU2Vzc2lvbk1vZGUsIG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcsIHBsYXRmb3JtUm9vdFNjaGVtYSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCB0eXBlIEFnZW50SG9zdE1jcFNlcnZlcnMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbk1hbmFnZXIsIElTeW5jZWRDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50UGx1Z2luTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBkZWNvZGVQcm92aWRlckRhdGEsIGVuY29kZVByb3ZpZGVyRGF0YSwgdHlwZSBJUGVyc2lzdGVkQ2hhdCB9IGZyb20gJy4uL2FnZW50Q2hhdEJhY2tpbmdzLmpzJztcbmltcG9ydCB7IHByZXBhcmVTaWRlQ2hhdFByb21wdCwgc2xpY2VTaWRlQ2hhdFR1cm5zIH0gZnJvbSAnLi4vYWdlbnRQZWVyQ2hhdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRDaGF0T3BlcmF0aW9uQ29udGV4dCwgQWdlbnRTZXNzaW9uLCBBZ2VudFNpZ25hbCwgQXV0aGVudGljYXRlUGFyYW1zLCBJQWN0aXZlQ2xpZW50LCBJQWdlbnQsIElBZ2VudENoYXRBZG9wdGlvblJlc3VsdCwgSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCBJQWdlbnRDaGF0Q29udGV4dCwgSUFnZW50Q2hhdERhdGFDaGFuZ2UsIElBZ2VudENoYXRNZXRhZGF0YSwgSUFnZW50Q2hhdHMsIElBZ2VudExlZ2FjeUNoYXQsIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LCBJQWdlbnREZXNjcmlwdG9yLCBJQWdlbnREaXNjb3ZlcmVkQ2hhdCwgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NuYXBzaG90LCBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50LCBJQWdlbnRNYXRlcmlhbGl6ZUNoYXRFdmVudCwgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRSZXNvbHZlQ2hhdENvbmZpZ1BhcmFtcywgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvLCBJQWdlbnRTcGF3bkNoYXRFdmVudCwgSU1jcE5vdGlmaWNhdGlvbiwgU3ViYWdlbnRDaGF0U2lnbmFsLCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dCwgcmVzb2x2ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zLCByZXNvbHZlQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zLCByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGdldFJlYXNvbmluZ0VmZm9ydERlc2NyaXB0aW9uLCBnZXRSZWFzb25pbmdFZmZvcnRMYWJlbCwgcmVzb2x2ZURlZmF1bHRSZWFzb25pbmdFZmZvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vcmVhc29uaW5nRWZmb3J0LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IElDb3BpbG90Q29uZmlnU2xhc2hDb21tYW5kU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29waWxvdENvbmZpZ1NsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0Q29waWxvdEhvbWVQYXRoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RIb21lLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UsIFNFU1NJT05fREJfRklMRU5BTUUgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RQcm94eVJlc29sdmVyIH0gZnJvbSAnLi4vYWdlbnRIb3N0UHJveHlSZXNvbHZlci5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBFcnJvckluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEsIHR5cGUgQWdlbnRTZWxlY3Rpb24sIHR5cGUgQ2hpbGRDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBDb25maWdQcm9wZXJ0eVNjaGVtYSwgdHlwZSBDb25maWdTY2hlbWEsIHR5cGUgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQsIHR5cGUgTW9kZWxTZWxlY3Rpb24sIHR5cGUgVG9vbERlZmluaXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgQXV0aFJlcXVpcmVkUmVhc29uLCB0eXBlIEF1dGhSZXF1aXJlZFBhcmFtcywgdHlwZSBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGFyZUFkZGl0aW9uYWxXb3JraW5nRGlyZWN0b3JpZXNFcXVhbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbiwgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBSdWxlQ3VzdG9taXphdGlvbiwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBTa2lsbEN1c3RvbWl6YXRpb24sIGN1c3RvbWl6YXRpb25JZCwgYnVpbGRDaGF0VXJpLCBidWlsZERlZmF1bHRDaGF0VXJpLCBBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZLCBBSF9NRVRBX0lTX1JFQURfREJfS0VZLCBpc0RlZmF1bHRDaGF0VXJpLCB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlLCB0eXBlIENoaWxkQ3VzdG9taXphdGlvbiwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgdHlwZSBIb29rQ3VzdG9taXphdGlvbiwgdHlwZSBNZXNzYWdlQXR0YWNobWVudCwgdHlwZSBQZW5kaW5nTWVzc2FnZSwgdHlwZSBQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFBvbGljeVN0YXRlLCB0eXBlIENoYXRJbnB1dEFuc3dlciwgdHlwZSBUb29sQ2FsbFJlc3VsdCwgdHlwZSBUdXJuLCB0eXBlIFVzYWdlSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0Qnlva0xtQWdlbnRNb2RlbElkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBpc0N1c3RvbWl6YXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQsIHN0cnVjdHVyYWxUb29sc0VxdWFsIH0gZnJvbSAnLi4vYWN0aXZlQ2xpZW50U3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDb21wbGV0aW9ucyB9IGZyb20gJy4uL2FnZW50SG9zdENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXBwbHlNY3BTZXJ2ZXJFbmFibGVtZW50LCBidWlsZE1jcFRvcExldmVsQ3VzdG9taXphdGlvbklkLCB0eXBlIElNY3BTZXJ2ZXJSdW50aW1lU3RhdGUgfSBmcm9tICcuLi9zaGFyZWQvbWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50LCBpc0N1c3RvbWl6YXRpb25TZGtFbGlnaWJsZSwgcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vc2hhcmVkL2N1c3RvbWl6YXRpb25FbmFibGVtZW50R2F0ZS5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwgfSBmcm9tICcuLi9hZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwuanMnO1xuaW1wb3J0IHsgSUJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IgfSBmcm9tICcuLi9zaGFyZWQvd29ya3RyZWVJc29sYXRpb24uanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnMgfSBmcm9tICcuL2J1aWxkU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90QWdlbnRTZXNzaW9uIH0gZnJvbSAnLi9jb3BpbG90QWdlbnRTZXNzaW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvcGlsb3RDbGlFbnZpcm9ubWVudCB9IGZyb20gJy4vY29waWxvdENsaUVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElDb3BpbG90U2Vzc2lvbkNvbnRleHQsIHByb2plY3RGcm9tQ29waWxvdENvbnRleHQgfSBmcm9tICcuL2NvcGlsb3RHaXRQcm9qZWN0LmpzJztcbmltcG9ydCB7IHBhcnNlZFBsdWdpbnNFcXVhbCwgdG9DaGlsZEN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi9jb3BpbG90UGx1Z2luQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyIH0gZnJvbSAnLi9jb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyLmpzJztcbmltcG9ydCB7IENvcGlsb3RTZXNzaW9uTGF1bmNoZXIsIENvbnRleHRTaXplQ29uZmlnS2V5LCBUaGlua2luZ0xldmVsQ29uZmlnS2V5LCBnZXRDb3BpbG90Q29udGV4dFRpZXIsIGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCwgcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQsIHR5cGUgQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCB0eXBlIElBY3RpdmVDbGllbnRTbmFwc2hvdCB9IGZyb20gJy4vY29waWxvdFNlc3Npb25MYXVuY2hlci5qcyc7XG5pbXBvcnQgeyBTaGVsbE1hbmFnZXIgfSBmcm9tICcuL2NvcGlsb3RTaGVsbFRvb2xzLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RHaXRIdWJUZWxlbWV0cnlSb3V0ZXIgfSBmcm9tICcuLi9hZ2VudEhvc3RHaXRIdWJUZWxlbWV0cnlSb3V0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xpZW50VHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIsIElDb3BpbG90UnVudGltZVNsYXNoQ29tbWFuZFF1ZXJ5T3B0aW9ucyB9IGZyb20gJy4vY29waWxvdFNsYXNoQ29tbWFuZENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBEaXNjb3ZlcmVkVHlwZSwgU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIGFyZURpc2NvdmVyZWREaXJlY3Rvcmllc0VxdWFsLCB0eXBlIElEaXNjb3ZlcmVkRGlyZWN0b3J5IH0gZnJvbSAnLi9zZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX0lOVEVHUkFUSU9OX0lEIH0gZnJvbSAnLi4vLi4vLi4vZW5kcG9pbnQvY29tbW9uL2xpY2Vuc2VBZ3JlZW1lbnQuanMnO1xuaW1wb3J0IHsgZ2V0QXBwTm9kZU1vZHVsZXNQYXRoIH0gZnJvbSAnLi4vYXBwTm9kZU1vZHVsZXMuanMnO1xuaW1wb3J0IHsgQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyIH0gZnJvbSAnLi9jb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgY2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZSwgY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbiwgcmVwb3J0Q29waWxvdENsaWVudEZhaWx1cmUsIHJlcG9ydENvcGlsb3RDbGllbnRSZWNvdmVyeSwgcmVwb3J0Q29waWxvdENsaWVudFJlY292ZXJ5VHVybiwgdHlwZSBDb3BpbG90Q2xpZW50RmFpbHVyZUtpbmQsIHR5cGUgQ29waWxvdENsaWVudEZhaWx1cmVPcGVyYXRpb24sIHR5cGUgSUNvcGlsb3RGYWlsdXJlQ29ycmVsYXRpb24gfSBmcm9tICcuL2NvcGlsb3RGYWlsdXJlVGVsZW1ldHJ5LmpzJztcblxuaW50ZXJmYWNlIElDb3BpbG90UnVudGltZU1hbmFnZWRTZXR0aW5nc0lucHV0IHtcblx0YXV0aEluZm8/OiB7IHR5cGU6ICd0b2tlbic7IGhvc3Q6IHN0cmluZzsgdG9rZW46IHN0cmluZyB9O1xuXHR0b2tlbj86IHN0cmluZztcblx0c2lnbmFsPzogQWJvcnRTaWduYWw7XG59XG5cbmludGVyZmFjZSBJQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsge1xuXHRnZXRNYW5hZ2VkU2V0dGluZ3MoaW5wdXQ/OiBJQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NJbnB1dCk6IFByb21pc2U8eyBhY2NvdW50Pzogc3RyaW5nOyByZXNvbHZlZDogTWFuYWdlZFNldHRpbmdzUmVzb2x2ZWREYXRhIH0+O1xufVxuXG5jb25zdCBDT1BJTE9UX01BTkFHRURfU0VUVElOR1NfUVVFUllfVElNRU9VVF9NUyA9IDM1MDA7XG5jb25zdCBDT1BJTE9UX01BTkFHRURfU0VUVElOR1NfRElBR05PU1RJQ1NfVElNRU9VVF9NUyA9IDQ1MDA7XG5cbmZ1bmN0aW9uIGlzQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAnZ2V0TWFuYWdlZFNldHRpbmdzJyBpbiB2YWx1ZVxuXHRcdCYmIHR5cGVvZiAodmFsdWUgYXMgeyBnZXRNYW5hZ2VkU2V0dGluZ3M/OiB1bmtub3duIH0pLmdldE1hbmFnZWRTZXR0aW5ncyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENvcGlsb3RNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyhcblx0cnVudGltZVNkazogSUNvcGlsb3RSdW50aW1lTWFuYWdlZFNldHRpbmdzU2RrLFxuXHR0b2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRob3N0OiBzdHJpbmcsXG5cdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdHRpbWVvdXRNcyA9IENPUElMT1RfTUFOQUdFRF9TRVRUSU5HU19RVUVSWV9USU1FT1VUX01TLFxuXHRwcm94eTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuKTogUHJvbWlzZTx7IGFjY291bnQ/OiBzdHJpbmc7IHJlc29sdmVkOiBNYW5hZ2VkU2V0dGluZ3NSZXNvbHZlZERhdGEgfT4ge1xuXHRjb25zdCByZXF1ZXN0ID0gaW52b2tlV2l0aFByb3h5RW52aXJvbm1lbnQocHJveHksICgpID0+IHJ1bnRpbWVTZGsuZ2V0TWFuYWdlZFNldHRpbmdzKHtcblx0XHQuLi4odG9rZW4gPyB7IGF1dGhJbmZvOiB7IHR5cGU6ICd0b2tlbicsIGhvc3QsIHRva2VuIH0gYXMgY29uc3QsIHRva2VuIH0gOiB7fSksXG5cdFx0c2lnbmFsLFxuXHR9KSk7XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VUaW1lb3V0KHJlcXVlc3QsIHRpbWVvdXRNcyk7XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDb3BpbG90IHJ1bnRpbWUgbWFuYWdlZC1zZXR0aW5ncyBxdWVyeSBleGNlZWRlZCAke3RpbWVvdXRNcyAvIDEwMDB9IHNlY29uZHMgd2hpbGUgd2FpdGluZyBmb3IgbmF0aXZlIE1ETSBvciBHaXRIdWIgcG9saWN5IHJlc29sdXRpb24uYCk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gaW52b2tlV2l0aFByb3h5RW52aXJvbm1lbnQ8VD4ocHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgaW52b2tlOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdGlmICghcHJveHkpIHtcblx0XHRyZXR1cm4gaW52b2tlKCk7XG5cdH1cblx0Y29uc3QgcHJldmlvdXNWYWx1ZXMgPSBDT1BJTE9UX1BST1hZX1NFVF9FTlZfS0VZUy5tYXAoa2V5ID0+IHByb2Nlc3MuZW52W2tleV0pO1xuXHRmb3IgKGNvbnN0IGtleSBvZiBDT1BJTE9UX1BST1hZX1NFVF9FTlZfS0VZUykge1xuXHRcdHByb2Nlc3MuZW52W2tleV0gPSBwcm94eTtcblx0fVxuXHR0cnkge1xuXHRcdC8vIFRoZSBTREsgc25hcHNob3RzIHByb2Nlc3MuZW52IHdoaWxlIGNvbnN0cnVjdGluZyB0aGUgbmF0aXZlIHJlcXVlc3QuXG5cdFx0cmV0dXJuIGludm9rZSgpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBDT1BJTE9UX1BST1hZX1NFVF9FTlZfS0VZUy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGtleSA9IENPUElMT1RfUFJPWFlfU0VUX0VOVl9LRVlTW2luZGV4XTtcblx0XHRcdGNvbnN0IHZhbHVlID0gcHJldmlvdXNWYWx1ZXNbaW5kZXhdO1xuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52W2tleV07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwcm9jZXNzLmVudltrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IFJVTlRJTUVfU0xBU0hfQ09NTUFORF9DT01QTEVUSU9OX1dBSVRfTVMgPSAzMDA7XG5jb25zdCBDT1BJTE9UX0NBUElfVVJMID0gJ2h0dHBzOi8vYXBpLmdpdGh1YmNvcGlsb3QuY29tJztcblxuaW50ZXJmYWNlIElDb3BpbG90Q2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5UmVzdWx0IHtcblx0cmVhZG9ubHkgZmFpbGVkVHVybklkczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgc3RvcFN1Y2NlZWRlZDogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gaXNDb3BpbG90Q29ubmVjdGlvbkNsb3NlZEVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiBjbGFzc2lmeUNvcGlsb3RDbGllbnRGYWlsdXJlKGVycm9yKSA9PT0gJ2Nvbm5lY3Rpb25DbG9zZWQnO1xufVxuXG4vKipcbiAqIFByb3h5IGVudiB2YXJzIHRoYXQgaW5kaWNhdGUgdGhlIGVudmlyb25tZW50IGFscmVhZHkgY29uZmlndXJlcyBhIHByb3h5LlxuICovXG5jb25zdCBDT1BJTE9UX1BST1hZX0VOVl9LRVlTID0gWydIVFRQU19QUk9YWScsICdodHRwc19wcm94eScsICdIVFRQX1BST1hZJywgJ2h0dHBfcHJveHknLCAnQUxMX1BST1hZJywgJ2FsbF9wcm94eSddIGFzIGNvbnN0O1xuLyoqXG4gKiBQcm94eSBlbnYgdmFycyB3ZSBzZXQgd2hlbiBpbmplY3RpbmcgdGhlIHJlc29sdmVkIENBUEkgcHJveHkuXG4gKi9cbmNvbnN0IENPUElMT1RfUFJPWFlfU0VUX0VOVl9LRVlTID0gWydIVFRQX1BST1hZJywgJ0hUVFBTX1BST1hZJ10gYXMgY29uc3Q7XG5cbmFzeW5jIGZ1bmN0aW9uIGZpbGVFeGlzdHMoZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGZzLmFjY2VzcyhmaWxlUGF0aCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0xpbnV4TXVzbFJ1bnRpbWUoKTogYm9vbGVhbiB7XG5cdGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnbGludXgnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgcmVwb3J0ID0gcHJvY2Vzcy5yZXBvcnQ/LmdldFJlcG9ydCgpIGFzIHsgaGVhZGVyPzogeyBnbGliY1ZlcnNpb25SdW50aW1lPzogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0cmV0dXJuICFyZXBvcnQ/LmhlYWRlcj8uZ2xpYmNWZXJzaW9uUnVudGltZTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29waWxvdFBsYXRmb3JtUGFja2FnZUNhbmRpZGF0ZXMoKTogc3RyaW5nW10ge1xuXHRjb25zdCBwbGF0Zm9ybUFyY2ggPSBgJHtwcm9jZXNzLnBsYXRmb3JtfS0ke3Byb2Nlc3MuYXJjaH1gO1xuXHRpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ2xpbnV4Jykge1xuXHRcdHJldHVybiBbcGxhdGZvcm1BcmNoXTtcblx0fVxuXG5cdGNvbnN0IGxpbnV4Q2FuZGlkYXRlcyA9IFtgbGludXgtJHtwcm9jZXNzLmFyY2h9YCwgYGxpbnV4bXVzbC0ke3Byb2Nlc3MuYXJjaH1gXTtcblx0cmV0dXJuIGlzTGludXhNdXNsUnVudGltZSgpID8gbGludXhDYW5kaWRhdGVzLnJldmVyc2UoKSA6IGxpbnV4Q2FuZGlkYXRlcztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUNvcGlsb3RDbGlQYXRoKG5vZGVNb2R1bGVzVXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCB0cmllZDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBwbGF0Zm9ybVBhY2thZ2Ugb2YgZ2V0Q29waWxvdFBsYXRmb3JtUGFja2FnZUNhbmRpZGF0ZXMoKSkge1xuXHRcdGNvbnN0IGNsaVBhdGggPSBVUkkuam9pblBhdGgobm9kZU1vZHVsZXNVcmksICdAZ2l0aHViJywgYGNvcGlsb3QtJHtwbGF0Zm9ybVBhY2thZ2V9YCwgJ2luZGV4LmpzJykuZnNQYXRoO1xuXHRcdHRyaWVkLnB1c2goY2xpUGF0aCk7XG5cdFx0aWYgKGF3YWl0IGZpbGVFeGlzdHMoY2xpUGF0aCkpIHtcblx0XHRcdHJldHVybiBjbGlQYXRoO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IG9sZFRvcExldmVsUGF0aCA9IFVSSS5qb2luUGF0aChub2RlTW9kdWxlc1VyaSwgJ0BnaXRodWInLCAnY29waWxvdCcsICdpbmRleC5qcycpLmZzUGF0aDtcblx0dHJpZWQucHVzaChvbGRUb3BMZXZlbFBhdGgpO1xuXHRpZiAoYXdhaXQgZmlsZUV4aXN0cyhvbGRUb3BMZXZlbFBhdGgpKSB7XG5cdFx0cmV0dXJuIG9sZFRvcExldmVsUGF0aDtcblx0fVxuXG5cdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHJlc29sdmUgQGdpdGh1Yi9jb3BpbG90IENMSSBwYXRoLiBUcmllZDogJHt0cmllZC5qb2luKCcsICcpfWApO1xufVxuXG5leHBvcnQgdHlwZSBJQ29waWxvdFBsdWdpbkluZm8gPSBJUGFyc2VkUGx1Z2luICYge1xuXHRyZWFkb25seSBwbHVnaW5EaXI/OiBVUkk7XG5cdHJlYWRvbmx5IHNvdXJjZVVyaT86IFVSSTtcblx0cmVhZG9ubHkgZGlzYWJsZWRNY3BTZXJ2ZXJzPzogcmVhZG9ubHkgc3RyaW5nW107XG59O1xuXG4vKipcbiAqIEluLW1lbW9yeSBjaGF0IHJlc2VydmF0aW9uIGNyZWF0ZWQgYnkge0BsaW5rIElBZ2VudENoYXRzLmNyZWF0ZUNoYXR9IGFuZFxuICogY29uc3VtZWQgYnkge0BsaW5rIENvcGlsb3RBZ2VudC5fbWF0ZXJpYWxpemVQcm92aXNpb25hbH0gb24gZmlyc3Qgc2VuZC5cbiAqIEl0IHJldGFpbnMgcHJlLXNlbmQgbW9kZWwvYWdlbnQgdXBkYXRlcyB3aXRob3V0IGNyZWF0aW5nIG9uLWRpc2sgc3RhdGUuXG4gKi9cbmludGVyZmFjZSBJUHJvdmlzaW9uYWxTZXNzaW9uIHtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNka1Nlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXQ6IFVSSTtcblx0LyoqXG5cdCAqIEZvbGRlciB0aGUgdXNlciBwaWNrZWQgYXQgY3JlYXRlIHRpbWUuIFVzZWQgYXMgYm90aCB0aGVcblx0ICogcHJlLXdvcmt0cmVlIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCB0aGUgY3VzdG9taXphdGlvbiBkaXJlY3Rvcnlcblx0ICogKHBsdWdpbiBkaXNjb3ZlcnkgaXMgYW5jaG9yZWQgdG8gdGhlIG9yaWdpbmFsIGZvbGRlciwgbm90IHRvIGFcblx0ICogd29ya3RyZWUgcGF0aCB0aGF0IG1heSBub3QgZXhpc3QgeWV0KS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSTtcblx0LyoqXG5cdCAqIFRoZSBmdWxsIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IGFzIHNlbnQgYnkgdGhlIGNsaWVudCBhdCBjcmVhdGVcblx0ICogdGltZSAoaW5kZXggMCA9IHByaW1hcnkgPT09IHtAbGluayB3b3JraW5nRGlyZWN0b3J5fSksIGZvciBhIG11bHRpLXJvb3Rcblx0ICogd29ya3NwYWNlLiBVbmRlZmluZWQgZm9yIHNpbmdsZS1mb2xkZXIgLyBsZWdhY3kgY2xpZW50cy4gVGhlIG5vbi1wcmltYXJ5XG5cdCAqIHJvb3RzIGFyZSBhdHRhY2hlZCB0byBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSBpbW1lZGlhdGVseSAodGhleSBhcmUgc3RhYmxlXG5cdCAqIHdvcmtzcGFjZSBmb2xkZXJzLCB1bmxpa2UgdGhlIHdvcmt0cmVlIHRoYXQgcmVzb2x2ZXMgb25seSBhdCBzZW5kKS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdO1xuXHQvKiogTW9zdCByZWNlbnQgbW9kZWwgc2VsZWN0aW9uLiBVcGRhdGVkIGJ5IGBjaGFuZ2VNb2RlbGAgd2hpbGUgcHJvdmlzaW9uYWwuICovXG5cdG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0LyoqIE1vc3QgcmVjZW50IGN1c3RvbSBhZ2VudCBzZWxlY3Rpb24uIFVwZGF0ZWQgYnkgYGNoYW5nZUFnZW50YCB3aGlsZSBwcm92aXNpb25hbC4gKi9cblx0YWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKiogUHJvamVjdCBpbmZvIGVhZ2VybHkgcmVzb2x2ZWQgYXQgY3JlYXRlIHRpbWUgc28gdGhlIHN1bW1hcnkgcmVuZGVycy4gKi9cblx0cmVhZG9ubHkgcHJvamVjdDogSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlciB0aGlzIHNlc3Npb24gaXMgd29ya3NwYWNlLWxlc3MgKHN1cmZhY2VkIGluIHRoZSBzZXNzaW9ucyBVSSBhcyBhIFwiUXVpY2sgQ2hhdFwiKS4gKi9cblx0cmVhZG9ubHkgd29ya3NwYWNlbGVzcz86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRDb3BpbG90Q2hhdENvbnRleHQge1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgY29uZmlndXJhdGlvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXQ6IFVSSTtcblx0cmVhZG9ubHkgY2hhdEtleTogc3RyaW5nO1xuXHRyZWFkb25seSBzZGtTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2VxdWVuY2VyS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRhcmdldDogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElDb3BpbG90QWdlbnRTZXNzaW9uSWRlbnRpdHkge1xuXHRyZWFkb25seSBzZXNzaW9uVXJpOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXRDaGFubmVsVXJpOiBVUkk7XG5cdC8qKiBIb3N0LWNob3NlbiBwZXJzaXN0ZW5jZS9jb25maWcgc2NvcGUgKHRoZSB7QGxpbmsgSUFnZW50Q2hhdENvbnRleHQucmVzb3VyY2V9KS4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcbn1cblxuLyoqIFN0YWJsZSBlbXB0eSBob3N0LWN1c3RvbWl6YXRpb24gc25hcHNob3QgdXNlZCBiZWZvcmUgdGhlIGhvc3QgcHVibGlzaGVzIG9uZS4gKi9cbmNvbnN0IE5PX0hPU1RfQ1VTVE9NSVpBVElPTlM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSA9IE9iamVjdC5mcmVlemUoW10pO1xuXG4vKiogQ29vcmRpbmF0ZXMgYWxsIHBlci1zZXNzaW9uIHdvcmssIHJlc3VtcHRpb24sIGFuZCB0ZWFyZG93bi4gKi9cbmNsYXNzIENvcGlsb3RTZXNzaW9uTGlmZXRpbWUge1xuXHRwcml2YXRlIF9hY3RpdmVMZWFzZXMgPSAwO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVsZWFzZXMgPSAwO1xuXHRwcml2YXRlIF9kcmFpbmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Jlb3BlbmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4Y2x1c2l2ZVRhaWw6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSBfZGlzcG9zZVByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzRGlzcG9zaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzUGVybWFuZW50bHlDbG9zZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfZGVmYXVsdFJlc3VtZTogUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVlclJlc3VtZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXVlZFdvcmsgPSBuZXcgU2V0PFByb21pc2U8dm9pZD4+KCk7XG5cblx0Z2V0IGlzUGVybWFuZW50bHlDbG9zZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzUGVybWFuZW50bHlDbG9zZWQ7XG5cdH1cblxuXHRxdWV1ZVNlc3Npb248VD4odGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdHJldHVybiB0aGlzLl90cmFjayh0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKHRhc2spKTtcblx0fVxuXG5cdHF1ZXVlQ2hhdDxUPihjaGF0S2V5OiBzdHJpbmcsIHRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhY2sodGhpcy5fY2hhdFNlcXVlbmNlci5xdWV1ZShjaGF0S2V5LCB0YXNrKSk7XG5cdH1cblxuXHRyZXN1bWVEZWZhdWx0KGZhY3Rvcnk6ICgpID0+IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbj4pOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2RlZmF1bHRSZXN1bWU7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VtZSA9IGZhY3RvcnkoKTtcblx0XHR0aGlzLl9kZWZhdWx0UmVzdW1lID0gcmVzdW1lO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fZGVmYXVsdFJlc3VtZSA9PT0gcmVzdW1lKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRSZXN1bWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXN1bWUudGhlbihjbGVhbnVwLCBjbGVhbnVwKTtcblx0XHRyZXR1cm4gcmVzdW1lO1xuXHR9XG5cblx0cmVzdW1lUGVlcihjaGF0S2V5OiBzdHJpbmcsIGZhY3Rvcnk6ICgpID0+IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3BlZXJSZXN1bWVzLmdldChjaGF0S2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgcmVzdW1lID0gZmFjdG9yeSgpO1xuXHRcdHRoaXMuX3BlZXJSZXN1bWVzLnNldChjaGF0S2V5LCByZXN1bWUpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcGVlclJlc3VtZXMuZ2V0KGNoYXRLZXkpID09PSByZXN1bWUpIHtcblx0XHRcdFx0dGhpcy5fcGVlclJlc3VtZXMuZGVsZXRlKGNoYXRLZXkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmVzdW1lLnRoZW4oY2xlYW51cCwgY2xlYW51cCk7XG5cdFx0cmV0dXJuIHJlc3VtZTtcblx0fVxuXG5cdGFzeW5jIGFjcXVpcmUoKTogUHJvbWlzZTxJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHdoaWxlICghdGhpcy5faXNEaXNwb3NpbmcgJiYgIXRoaXMuX2lzUGVybWFuZW50bHlDbG9zZWQpIHtcblx0XHRcdGNvbnN0IHJlb3BlbmVkID0gdGhpcy5fcmVvcGVuZWQ7XG5cdFx0XHRpZiAocmVvcGVuZWQpIHtcblx0XHRcdFx0YXdhaXQgcmVvcGVuZWQucDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FjdGl2ZUxlYXNlcysrO1xuXHRcdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlTGVhc2VzLS07XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVMZWFzZXMgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9kcmFpbmVkPy5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlbGVhc2UodGFzazogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2luZyB8fCB0aGlzLl9pc1Blcm1hbmVudGx5Q2xvc2VkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ1JlbGVhc2VzKys7XG5cdFx0dGhpcy5fcmVvcGVuZWQgPz89IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2V4Y2x1c2l2ZVRhaWw7XG5cdFx0Y29uc3QgcmVsZWFzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBwcmV2aW91cztcblx0XHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JMZWFzZXMoKTtcblx0XHRcdGF3YWl0IHRhc2soKTtcblx0XHR9KSgpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IHJlbGVhc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVsZWFzZXMtLTtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nUmVsZWFzZXMgPT09IDAgJiYgIXRoaXMuX2lzRGlzcG9zaW5nICYmICF0aGlzLl9pc1Blcm1hbmVudGx5Q2xvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3Jlb3BlbmVkPy5jb21wbGV0ZSgpO1xuXHRcdFx0XHR0aGlzLl9yZW9wZW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9leGNsdXNpdmVUYWlsID0gY29tcGxldGVkLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGNvbXBsZXRlZDtcblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2UodGFzazogKCkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNwb3NlUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Rpc3Bvc2VQcm9taXNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNQZXJtYW5lbnRseUNsb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzRGlzcG9zaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9yZW9wZW5lZD8uY29tcGxldGUoKTtcblx0XHR0aGlzLl9yZW9wZW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2V4Y2x1c2l2ZVRhaWw7XG5cdFx0Y29uc3QgZGlzcG9zZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcmV2aW91cztcblx0XHRcdFx0YXdhaXQgdGhpcy5fd2FpdEZvckxlYXNlcygpO1xuXHRcdFx0XHRhd2FpdCB0YXNrKCk7XG5cdFx0XHRcdHRoaXMuX2lzUGVybWFuZW50bHlDbG9zZWQgPSB0cnVlO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9pc1Blcm1hbmVudGx5Q2xvc2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5faXNEaXNwb3NpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9yZW9wZW5lZD8uY29tcGxldGUoKTtcblx0XHRcdFx0XHR0aGlzLl9yZW9wZW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2VQcm9taXNlID0gZGlzcG9zZTtcblx0XHR0aGlzLl9leGNsdXNpdmVUYWlsID0gZGlzcG9zZS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzUGVybWFuZW50bHlDbG9zZWQgJiYgdGhpcy5fZGlzcG9zZVByb21pc2UgPT09IGRpc3Bvc2UpIHtcblx0XHRcdFx0dGhpcy5fZGlzcG9zZVByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5faXNQZXJtYW5lbnRseUNsb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fcmVvcGVuZWQ/LmNvbXBsZXRlKCk7XG5cdFx0dGhpcy5fcmVvcGVuZWQgPSB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgdGhpcy5fd2FpdEZvclF1ZXVlZFdvcmsoKTtcblx0XHRhd2FpdCB0aGlzLl9leGNsdXNpdmVUYWlsO1xuXHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JMZWFzZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYWNrPFQ+KHdvcms6IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBjb21wbGV0aW9uID0gd29yay50aGVuKCgpID0+IHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9xdWV1ZWRXb3JrLmFkZChjb21wbGV0aW9uKTtcblx0XHRjb21wbGV0aW9uLnRoZW4oKCkgPT4gdGhpcy5fcXVldWVkV29yay5kZWxldGUoY29tcGxldGlvbikpO1xuXHRcdHJldHVybiB3b3JrO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvclF1ZXVlZFdvcmsoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0d2hpbGUgKHRoaXMuX3F1ZXVlZFdvcmsuc2l6ZSA+IDApIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMuX3F1ZXVlZFdvcmspO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JMZWFzZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUxlYXNlcyA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkcmFpbmVkID0gdGhpcy5fZHJhaW5lZCA/Pz0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGF3YWl0IGRyYWluZWQucDtcblx0XHRpZiAodGhpcy5fZHJhaW5lZCA9PT0gZHJhaW5lZCkge1xuXHRcdFx0dGhpcy5fZHJhaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9SZXN0cmljdGVkVGVsZW1ldHJ5RW5kcG9pbnQoZW5kcG9pbnQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBlbmRwb2ludCA/IGAke2VuZHBvaW50LnJlcGxhY2UoL1xcLyskLywgJycpfS90ZWxlbWV0cnlgIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgeyBDT1BJTE9UX0FHRU5UX0hPU1RfU1lTVEVNX01FU1NBR0UgfSBmcm9tICcuL3Byb21wdHMvc3lzdGVtTWVzc2FnZS5qcyc7XG5cbnR5cGUgQ29waWxvdE1vZGVsSW5mbyA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90Q2xpZW50WydycGMnXVsnbW9kZWxzJ11bJ2xpc3QnXT4+Wydtb2RlbHMnXVtudW1iZXJdO1xuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRNb2RlbFNlbGVjdGlvbiB7XG5cdGlkPzogdW5rbm93bjtcblx0Y29uZmlnPzogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBSZWJhc2VzIGB1cmlgIGZyb20gdW5kZXIgYGZyb21EaXJgIG9udG8gYHRvRGlyYCwgcHJlc2VydmluZyB0aGUgcmVsYXRpdmUgcGF0aC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBgdXJpYCBpcyBub3QgZXF1YWwgdG8gb3IgdW5kZXIgYGZyb21EaXJgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmViYXNlVW5kZXIodXJpOiBVUkksIGZyb21EaXI6IFVSSSwgdG9EaXI6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGlmICghaXNFcXVhbE9yUGFyZW50KHVyaSwgZnJvbURpcikpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlbCA9IHJlbGF0aXZlUGF0aChmcm9tRGlyLCB1cmkpO1xuXHRpZiAocmVsID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiByZWwubGVuZ3RoID09PSAwID8gdG9EaXIgOiByZXNvdXJjZUpvaW5QYXRoKHRvRGlyLCByZWwpO1xufVxuXG4vKiogUmViYXNlIGBlbmFibGVtZW50YCBrZXlzIHVuZGVyIGBmcm9tRGlyYCBvbnRvIGB0b0RpcmAsIHByZXNlcnZpbmcgdW5tYXRjaGVkIGtleXMgdmVyYmF0aW0uICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZUVuYWJsZW1lbnRLZXlzKGVuYWJsZW1lbnQ6IFJlYWRvbmx5TWFwPHN0cmluZywgYm9vbGVhbj4sIGZyb21EaXI6IFVSSSwgdG9EaXI6IFVSSSk6IE1hcDxzdHJpbmcsIGJvb2xlYW4+IHtcblx0Y29uc3QgbWlncmF0ZWQgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0Zm9yIChjb25zdCBbdXJpLCBlbmFibGVkXSBvZiBlbmFibGVtZW50KSB7XG5cdFx0Y29uc3QgcmViYXNlZCA9IHJlYmFzZVVuZGVyKFVSSS5wYXJzZSh1cmkpLCBmcm9tRGlyLCB0b0Rpcik7XG5cdFx0bWlncmF0ZWQuc2V0KHJlYmFzZWQgPyByZWJhc2VkLnRvU3RyaW5nKCkgOiB1cmksIGVuYWJsZWQpO1xuXHR9XG5cdHJldHVybiBtaWdyYXRlZDtcbn1cblxuY2xhc3MgQ29waWxvdENoYXRFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjaGF0U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbixcblx0XHRhY3RpdmVDbGllbnQ6IEFjdGl2ZUNsaWVudCxcblx0XHRvbk1jcE5vdGlmaWNhdGlvbjogRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPixcblx0XHRvbkRpZFJlcXVpcmVBdXRoOiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRTZXNzaW9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0U2Vzc2lvbi5vbk1jcE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24gPT4gb25NY3BOb3RpZmljYXRpb24uZmlyZShub3RpZmljYXRpb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFNlc3Npb24ub25EaWRSZXF1aXJlQXV0aChvbkRpZFJlcXVpcmVBdXRoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4gYWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIubWNwU2VydmVyU3RhdGVzLnNldChjaGF0U2Vzc2lvbi5tY3BTZXJ2ZXJTdGF0ZXMucmVhZChyZWFkZXIpLCB1bmRlZmluZWQpKSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb3BpbG90T3RscE1ldHJpY3NFbmRwb2ludChlbmRwb2ludDogc3RyaW5nLCBwcm90b2NvbDogJ2h0dHAvanNvbicgfCAnaHR0cC9wcm90b2J1ZicgfCAnZ3JwYycpOiBzdHJpbmcge1xuXHRpZiAocHJvdG9jb2wgPT09ICdncnBjJykge1xuXHRcdHJldHVybiBlbmRwb2ludDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IHVybCA9IG5ldyBVUkwoZW5kcG9pbnQpO1xuXHRcdGlmICh1cmwucGF0aG5hbWUgPT09ICcnIHx8IHVybC5wYXRobmFtZSA9PT0gJy8nKSB7XG5cdFx0XHR1cmwucGF0aG5hbWUgPSAnL3YxL21ldHJpY3MnO1xuXHRcdH0gZWxzZSBpZiAodXJsLnBhdGhuYW1lLmVuZHNXaXRoKCcvdjEvdHJhY2VzJykpIHtcblx0XHRcdHVybC5wYXRobmFtZSA9IGAke3VybC5wYXRobmFtZS5zbGljZSgwLCAtJy92MS90cmFjZXMnLmxlbmd0aCl9L3YxL21ldHJpY3NgO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJsLnRvU3RyaW5nKCkucmVwbGFjZSgvXFwvJC8sICcnKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGVuZHBvaW50O1xuXHR9XG59XG5cbi8qKiBgb3JpZ2luYCB2YWx1ZSB3cml0dGVuIGJ5IHRoZSBWUyBDb2RlIGV4dGVuc2lvbi1ob3N0IENvcGlsb3QgQ0xJIGZlYXR1cmUuICovXG5jb25zdCBFWFRFTlNJT05fSE9TVF9DTElfTUFSS0VSX09SSUdJTiA9ICd2c2NvZGUnO1xuXG4vKipcbiAqIFNoYXBlIG9mIHRoZSBgdnNjb2RlLm1ldGFkYXRhLmpzb25gIG1hcmtlciB3cml0dGVuIG5leHQgdG8gYSBDb3BpbG90IENMSVxuICogc2Vzc2lvbidzIFNESyBldmVudCBsb2cuIE90aGVyIENvcGlsb3QgQ0xJIGhvc3RzIChlLmcuIHRoZSBHaXRIdWIgQ29waWxvdFxuICogYXBwKSB3cml0ZSB0aGUgc2FtZSBmaWxlIHdpdGggYSBub24tYHZzY29kZWAgYG9yaWdpbmAuXG4gKi9cbmludGVyZmFjZSBJRXh0ZW5zaW9uSG9zdENsaU1hcmtlciB7XG5cdHJlYWRvbmx5IG9yaWdpbj86IHN0cmluZztcblx0cmVhZG9ubHkgY3VzdG9tVGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnlQcm9wZXJ0aWVzPzogdW5rbm93bjtcblx0cmVhZG9ubHkgd29ya3RyZWVQcm9wZXJ0aWVzPzogdW5rbm93bjtcblx0cmVhZG9ubHkgd29ya3NwYWNlRm9sZGVyPzogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBTaGFwZSBvZiB0aGUgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdCBDTEkgYHZzY29kZS5yZXF1ZXN0cy5tZXRhZGF0YS5qc29uYFxuICogc2lkZWNhciB3cml0dGVuIG5leHQgdG8gYSBzZXNzaW9uJ3MgU0RLIGV2ZW50IGxvZy4gT25seSB0aGUgZmllbGRzIGFkb3B0aW9uXG4gKiBuZWVkcyBhcmUgbW9kZWxsZWQ7IGBjb3BpbG90UmVxdWVzdElkYCBpcyB0aGUgU0RLIGB1c2VyLm1lc3NhZ2VgIGVudmVsb3BlIGlkLFxuICogd2hpY2ggaXMgYWxzbyB0aGUgdHVybiBpZCBgbWFwU2Vzc2lvbkV2ZW50c2AgcmVzdG9yZXMgdHVybnMgdW5kZXIuXG4gKi9cbmludGVyZmFjZSBJRXh0ZW5zaW9uSG9zdENsaVJlcXVlc3REZXRhaWxzIHtcblx0cmVhZG9ubHkgY29waWxvdFJlcXVlc3RJZD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzcG9uc2VNb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBjcmVkaXRzVXNlZD86IG51bWJlcjtcbn1cblxuLyoqIENvcGlsb3QgYmlsbHMgaW4gbmFuby1BSVU7IHRoZSBleHRlbnNpb24gaG9zdCBwZXJzaXN0cyB3aG9sZSBjcmVkaXRzLiAqL1xuY29uc3QgTkFOT19BSVVfUEVSX0NSRURJVCA9IDFfMDAwXzAwMF8wMDA7XG5cbi8qKlxuICogQWdlbnQgcHJvdmlkZXIgYmFja2VkIGJ5IHRoZSBDb3BpbG90IFNESyB7QGxpbmsgQ29waWxvdENsaWVudH0uXG4gKi9cbmV4cG9ydCBjbGFzcyBDb3BpbG90QWdlbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50IHtcblx0cmVhZG9ubHkgaWQgPSAnY29waWxvdGNsaScgYXMgY29uc3Q7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGF0UHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBZ2VudFNpZ25hbD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhdFByb2dyZXNzID0gdGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUmVxdWlyZWQgPSBvYnNlcnZhYmxlVmFsdWVPcHRzPE9taXQ8QXV0aFJlcXVpcmVkUGFyYW1zLCAnY2hhbm5lbCc+IHwgdW5kZWZpbmVkPihcblx0XHR7IG93bmVyOiB0aGlzLCBlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFscyB9LFxuXHRcdHVuZGVmaW5lZCxcblx0KTtcblx0cmVhZG9ubHkgYXV0aGVudGljYXRpb25SZXF1aXJlZDogSU9ic2VydmFibGU8T21pdDxBdXRoUmVxdWlyZWRQYXJhbXMsICdjaGFubmVsJz4gfCB1bmRlZmluZWQ+ID0gdGhpcy5fYXV0aGVudGljYXRpb25SZXF1aXJlZDtcblx0LyoqXG5cdCAqIE1lbWJlcnNoaXAgY2hhbm5lbCBmb3IgY2hhdHMgdGhlIGFnZW50IHNwYXducyBpdHNlbGYgXHUyMDE0IHN1Yi1hZ2VudHNcblx0ICogZGVsZWdhdGVkIGJ5IGEgdG9vbCBjYWxsICh0aGUgc2FtZSBmYW4tb3V0IHRoZSBgc3ViYWdlbnRfc3RhcnRlZGAgL1xuXHQgKiBgc3ViYWdlbnRfY29tcGxldGVkYCBzaWduYWxzIGRyaXZlKS4gVGhlIG9yY2hlc3RyYXRvciByb3V0ZXMgdGhlc2UgaW50b1xuXHQgKiB0aGUgY2hhdCBjYXRhbG9nIHNvIGhhcm5lc3Mtc3Bhd25lZCBhbmQgdXNlci1kcml2ZW4gY2hhdHMgc2hhcmUgb25lIHBhdGguXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNwYXduQ2hhdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNwYXduQ2hhdEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQgPSB0aGlzLl9vbkRpZFNwYXduQ2hhdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNYXRlcmlhbGl6ZUNoYXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRNYXRlcmlhbGl6ZUNoYXRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTWF0ZXJpYWxpemVDaGF0ID0gdGhpcy5fb25EaWRNYXRlcmlhbGl6ZUNoYXQuZXZlbnQ7XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIHRoZSBuYXRpdmUgY2hhdCBjYXRhbG9nIG1heSBoYXZlIGNoYW5nZWQuIFRoZSB7QGxpbmsgQWdlbnRTZXJ2aWNlfVxuXHQgKiByZXNwb25kcyB3aXRoIGFuIGFkZGl0aXZlIGRpc2NvdmVyeSBwYXNzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNjb3ZlckNoYXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUFnZW50RGlzY292ZXJlZENoYXRbXT4oe1xuXHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2lzTWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkKCkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9lbWl0RXh0SG9zdENoYXRzKCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0fSkpO1xuXHRyZWFkb25seSBvbkRpZERpc2NvdmVyQ2hhdHMgPSB0aGlzLl9vbkRpZERpc2NvdmVyQ2hhdHMuZXZlbnQ7XG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBNQ1Agbm90aWZpY2F0aW9ucywgZmFubmVkIGluIGZyb20gZXZlcnkgYWN0aXZlXG5cdCAqIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufS4gRWFjaCBzZXNzaW9uIGNvbnRyaWJ1dGVzIGEgc2luZ2xlXG5cdCAqIHN1YnNjcmlwdGlvbiwgZGlzcG9zZWQgYWxvbmdzaWRlIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPih0aGlzLCBbXSk7XG5cdHJlYWRvbmx5IG1vZGVscyA9IHRoaXMuX21vZGVscztcblx0LyoqXG5cdCAqIFRoZSB0d28gc291cmNlcyBtZXJnZWQgaW50byB7QGxpbmsgX21vZGVsc306IENBUEkgbW9kZWxzIGZyb20gdGhlIENMSSdzXG5cdCAqIGBtb2RlbHMubGlzdGAgYW5kIEJZT0sgbW9kZWxzIGZyb20gdGhlIHJlbmRlcmVyIGJyaWRnZSByZWdpc3RyeSdzIHNlcnZpbmdcblx0ICogd2luZG93LiBUcmFja2VkIHNlcGFyYXRlbHkgc28gZWFjaCBjYW4gcmVmcmVzaCBpbmRlcGVuZGVudGx5IHdpdGhvdXRcblx0ICogY2xvYmJlcmluZyB0aGUgb3RoZXI7IHtAbGluayBfcHVibGlzaE1vZGVsc30gY29uY2F0ZW5hdGVzIHRoZW0gZm9yIHRoZVxuXHQgKiBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9jYXBpTW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSA9IFtdO1xuXHRwcml2YXRlIF9ieW9rTW9kZWxzOiByZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXSA9IFtdO1xuXG5cdC8qKiBNb2RlbCBJRHMgd2hvc2UgbG9uZy1jb250ZXh0IHRpZXIgY29zdHMgdGhlIHNhbWUgYXMgdGhlIGRlZmF1bHQgdGllciAoZnJlZSBsb25nIGNvbnRleHQpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mcmVlTG9uZ0NvbnRleHRNb2RlbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogQm91bmRlZCBleHBvbmVudGlhbC1iYWNrb2ZmIHJldHJ5IGZvciB7QGxpbmsgX3JlZnJlc2hNb2RlbHN9LiBUaGUgU0RLJ3Ncblx0ICogYG1vZGVscy5saXN0YCBSUEMgY2FuIGZhaWwgdHJhbnNpZW50bHkgKGUuZy4gYSBgNDI5IFwidG9vIG1hbnkgcmVxdWVzdHNcImBcblx0ICogcmlnaHQgYWZ0ZXIgc3RhcnR1cCkuIFdpdGhvdXQgYSByZXRyeSB0aGUgbW9kZWwgcGlja2VyIHdvdWxkIHN0YXkgZW1wdHlcblx0ICogdW50aWwgdGhlIG5leHQgZXh0ZXJuYWwgcmVmcmVzaCB0cmlnZ2VyIChhIEdpdEh1YiB0b2tlbiBjaGFuZ2UsIGEgQ0xJXG5cdCAqIGNsaWVudCByZXN0YXJ0LCBvciB0aGUgaG9zdCdzIHBlcmlvZGljIHNjaGVkdWxlciksIHNvIHdlIHJldHJ5IGEgZmV3XG5cdCAqIHRpbWVzIGJlZm9yZSBnaXZpbmcgdXAuIE92ZXJyaWRhYmxlIGluIHRlc3RzIHRvIGF2b2lkIHJlYWwgZGVsYXlzLlxuXHQgKi9cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9tb2RlbFJlZnJlc2hNYXhBdHRlbXB0czogbnVtYmVyID0gNTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9tb2RlbFJlZnJlc2hCYXNlRGVsYXlNczogbnVtYmVyID0gMV8wMDA7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbW9kZWxSZWZyZXNoTWF4RGVsYXlNczogbnVtYmVyID0gMzBfMDAwO1xuXHQvKiogUGVuZGluZyBtb2RlbC1yZWZyZXNoIHJldHJ5IHRpbWVyOyBjbGVhcmVkIG9uIGEgZnJlc2ggcmVmcmVzaCwgc2h1dGRvd24sIG9yIGRpc3Bvc2UuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUmVmcmVzaFJldHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHQvKipcblx0ICogSW52YWxpZGF0ZXMgbW9kZWwgcmVxdWVzdHMgYm91bmQgdG8gYSBzdXBlcnNlZGVkIHRva2VuL2NsaWVudC9jYXRhbG9nXG5cdCAqIHNvdXJjZS4gVG9rZW4gaWRlbnRpdHkgYWxvbmUgaXMgaW5zdWZmaWNpZW50OiByZXN0YXJ0aW5nIHRoZSBjbGllbnQgZm9yXG5cdCAqIGEgYENPUElMT1RfR0hfSE9TVGAgY2hhbmdlIGtlZXBzIHRoZSBzYW1lIHRva2VuIHdoaWxlIGNoYW5naW5nIHRoZSBDQVBJXG5cdCAqIGVuZHBvaW50IHdob3NlIGNhdGFsb2cgaXMgYXV0aG9yaXRhdGl2ZS5cblx0ICovXG5cdHByaXZhdGUgX21vZGVsQ2F0YWxvZ0dlbmVyYXRpb24gPSAwO1xuXHQvKipcblx0ICogRm9yY2VkIHJlZnJlc2hlcyBhcmUgZGVmZXJyZWQgdG8gdGhlIG5leHQgdGFzayBzbyByZWxhdGVkIGxpZmVjeWNsZVxuXHQgKiBjaGFuZ2VzIChmb3IgZXhhbXBsZSBhbiBhdXRoIHVwZGF0ZSBhcnJpdmluZyB3aXRoIGEgc3RhcnR1cC1jb25maWdcblx0ICogY2hhbmdlKSBjb2xsYXBzZSBpbnRvIG9uZSBlbnVtZXJhdGlvbiBvZiB0aGUgZmluYWwgdG9rZW4vY2xpZW50IHNvdXJjZS5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlZE1vZGVsUmVmcmVzaDogeyByZWFkb25seSBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+OyBnZW5lcmF0aW9uOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWZyZXNoU2NoZWR1bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQge0BsaW5rIHJlZnJlc2hNb2RlbHN9IGNhbGwsIHNvIG92ZXJsYXBwaW5nIHRyaWdnZXJzIChhbiBhdXRoXG5cdCAqIHRva2VuIGNoYW5nZSBsYW5kaW5nIG9uIHRvcCBvZiBhIHBlcmlvZGljIHRpY2spIGNvbGxhcHNlIGludG8gYSBzaW5nbGVcblx0ICogYG1vZGVscy5saXN0YCByZXF1ZXN0LiBPbmx5IGNvdmVycyB0aGUgcmVxdWVzdCBpdHNlbGY6IHtAbGluayBfcmVmcmVzaE1vZGVsc31cblx0ICogcmV0dXJucyBhcyBzb29uIGFzIGl0ICpzY2hlZHVsZXMqIGEgYmFja29mZiByZXRyeSwgc28gYSBwZW5kaW5nIHJldHJ5XG5cdCAqIG5ldmVyIHN1cHByZXNzZXMgYSBsYXRlciB0aWNrIFx1MjAxNCB3aGljaCBpcyB3aGF0IGxldHMgdGhlIHNjaGVkdWxlciBhY3QgYXNcblx0ICogdGhlIGxvbmctdGVybSByZXRyeSBwYXRoIG9uY2UgdGhlIGJvdW5kZWQgYXR0ZW1wdHMgYXJlIGV4aGF1c3RlZC5cblx0ICovXG5cdHByaXZhdGUgX21vZGVsUmVmcmVzaEluRmxpZ2h0OiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NsaWVudDogQ29waWxvdENsaWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2xpZW50U3RhcnRpbmc6IFByb21pc2U8Q29waWxvdENsaWVudD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NsaWVudFN0b3BwaW5nOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogUHJveHkgVVJMIGluamVjdGVkIGludG8gdGhlIHJ1bm5pbmcgY2xpZW50J3Mgc3VicHJvY2VzcyBlbnYgKGB1bmRlZmluZWRgXG5cdCAqIHdoZW4gbm9uZSB3YXMgaW5qZWN0ZWQpLiBVc2VkIHRvIGRldGVjdCB3aGVuIGEgdG9rZW4gY2hhbmdlIGFsdGVycyB0aGVcblx0ICogdG9rZW4tZGlzY292ZXJlZCBDQVBJIGVuZHBvaW50J3MgcHJveHkgc28gd2UgY2FuIHJlc3RhcnQgdGhlIGNsaWVudC5cblx0ICovXG5cdHByaXZhdGUgX2FwcGxpZWRQcm94eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogUmVhc29ucyBmb3IgYSBjbGllbnQgcmVzdGFydCB0aGF0IGlzIHBhcmtlZCB1bnRpbCBldmVyeSBjaGF0IGlzIGlkbGUuIFNlZVxuXHQgKiB7QGxpbmsgX3JlcXVlc3RDbGllbnRSZXN0YXJ0fTsgZHJhaW5lZCBieSB7QGxpbmsgX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnR9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2Nsb3NlZENvbm5lY3Rpb25SZWNvdmVyeTogeyByZWFkb25seSBjbGllbnRGYWlsdXJlSWQ6IHN0cmluZzsgcmVhZG9ubHkgcHJvbWlzZTogUHJvbWlzZTxJQ29waWxvdENsb3NlZENvbm5lY3Rpb25SZWNvdmVyeVJlc3VsdD4gfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3J0ZWRDbGllbnRGYWlsdXJlcyA9IG5ldyBXZWFrU2V0PEVycm9yPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSBfZ2l0aHViVG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VydmVyVG9vbEhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0IHwgdW5kZWZpbmVkO1xuXG5cdHNldFNlcnZlclRvb2xIb3N0KGhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QgPSBob3N0O1xuXHR9XG5cblx0LyoqIFJlZmxlY3RzIHRoZSBgcnQ9MWAgZmllbGQgb24gdGhlIEdpdEh1YiBDb3BpbG90IGJlYXJlciB0b2tlbjsgZ2F0ZXMgZW5oYW5jZWQgR0ggdGVsZW1ldHJ5LiAqL1xuXHRwcml2YXRlIF9yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlc3RyaWN0ZWRUZWxlbWV0cnkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXN0cmljdGVkVGVsZW1ldHJ5ID0gdGhpcy5fb25EaWRDaGFuZ2VSZXN0cmljdGVkVGVsZW1ldHJ5LmV2ZW50O1xuXG5cdGdldCByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0RW50cmllc0J5U2RrSWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIENvcGlsb3RDaGF0RW50cnk+KCkpO1xuXHQvKiogRXhhY3QgaG9zdCBjaGF0IFVSSSAtPiBwZXJzaXN0ZWQgcHJvdmlkZXIgYmFja2luZzsgbGl2ZSBTREsgc2Vzc2lvbnMgYXJlIHRyYWNrZWQgc2VwYXJhdGVseS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEJhY2tpbmdzID0gbmV3IE1hcDxzdHJpbmcsIElQZXJzaXN0ZWRDaGF0PigpO1xuXG5cdC8qKiBFeGFjdCBjaGF0IC0+IHJlY29yZGVkIGNvbmZpZ3VyYXRpb24gc2NvcGUsIHVzZWQgZm9yIGZvcmsvcmVzdG9yZSBwYXRocyB0aGF0IG9ubHkga25vdyB0aGUgY2hhdCBVUkkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTY29wZXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHQvKiogRXhhY3QgY2hhdCAtPiBob3N0LXNlbGVjdGVkIHBlcnNpc3RlbmNlIHNjb3BlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U3RvcmFnZVNjb3BlcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cblx0cHJpdmF0ZSBfcmVtZW1iZXJDaGF0U2NvcGUoY2hhdDogVVJJLCBzY29wZTogVVJJLCBzdG9yYWdlU2NvcGU6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTY29wZXMuc2V0KGNoYXQudG9TdHJpbmcoKSwgc2NvcGUpO1xuXHRcdHRoaXMuX2NoYXRTdG9yYWdlU2NvcGVzLnNldChjaGF0LnRvU3RyaW5nKCksIHN0b3JhZ2VTY29wZSk7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgcmVjb3JkZWQgY29uZmlndXJhdGlvbiBzY29wZSBmb3IgYSBjcmVhdGVkIG9yIG1hdGVyaWFsaXplZCBjaGF0LiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ2hhdFNjb3BlKGNoYXQ6IFVSSSk6IFVSSSB7XG5cdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLl9jaGF0U2NvcGVzLmdldChjaGF0LnRvU3RyaW5nKCkpO1xuXHRcdGlmICghc2NvcGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIE5vIHJlY29yZGVkIHNjb3BlIGZvciBjaGF0ICR7Y2hhdC50b1N0cmluZygpfTsgaXQgbXVzdCBiZSBjcmVhdGVkIG9yIG1hdGVyaWFsaXplZCBiZWZvcmUgaXQgY2FuIGJlIGZvcmtlZCBmcm9tYCk7XG5cdFx0fVxuXHRcdHJldHVybiBzY29wZTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDaGF0U3RvcmFnZVNjb3BlKGNoYXQ6IFVSSSk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRTdG9yYWdlU2NvcGVzLmdldChjaGF0LnRvU3RyaW5nKCkpID8/IHRoaXMuX3Jlc29sdmVDaGF0U2NvcGUoY2hhdCk7XG5cdH1cblxuXHQvKiogUmVmIGNvdW50IGZvciBjaGF0cyB0aGF0IHN0aWxsIHNoYXJlIGBzY29wZWAsIHVzZWQgdG8gZGVjaWRlIHdoZW4gc2NvcGUgY2xlYW51cCBjYW4gcnVuLiAqL1xuXHRwcml2YXRlIF9yZW1haW5pbmdDaGF0c0ZvclNjb3BlKHNjb3BlOiBVUkkpOiBudW1iZXIge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCByZWNvcmRlZCBvZiB0aGlzLl9jaGF0U2NvcGVzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChyZWNvcmRlZCwgc2NvcGUpKSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb3VudDtcblx0fVxuXG5cdC8qKiBGb3JtYXRzIGEgY2hhdCBiYWNraW5nIGZvciBob3N0IHBlcnNpc3RlbmNlOyBvbmx5IHNlcGFyYXRlbHkgZW51bWVyYWJsZSBTREsgc2Vzc2lvbnMgcmVwb3J0IGBiYWNraW5nU2Vzc2lvbmAuICovXG5cdHByaXZhdGUgX2NoYXRCYWNraW5nUmVzdWx0KHNlc3Npb25JZDogc3RyaW5nLCBiYWNraW5nOiBJUGVyc2lzdGVkQ2hhdCk6IElBZ2VudENyZWF0ZUNoYXRSZXN1bHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlckRhdGE6IGVuY29kZVByb3ZpZGVyRGF0YShiYWNraW5nKSxcblx0XHRcdC4uLihiYWNraW5nLnNka1Nlc3Npb25JZCAhPT0gc2Vzc2lvbklkID8geyBiYWNraW5nU2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBiYWNraW5nLnNka1Nlc3Npb25JZCkgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cdC8qKiBGaXJlcyB3aGVuIHBlcnNpc3RlZCBjaGF0IGJhY2tpbmcgZGF0YSBjaGFuZ2VzIGFmdGVyIGNyZWF0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNoYXREYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50Q2hhdERhdGFDaGFuZ2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNoYXREYXRhOiBFdmVudDxJQWdlbnRDaGF0RGF0YUNoYW5nZT4gPSB0aGlzLl9vbkRpZENoYW5nZUNoYXREYXRhLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTGlmZXRpbWVzID0gbmV3IE1hcDxzdHJpbmcsIENvcGlsb3RTZXNzaW9uTGlmZXRpbWU+KCk7XG5cdC8qKiBQcm92aXNpb25hbCBjaGF0cyB0aGF0IGRlZmVyIFNESy9zZXNzaW9uIGNyZWF0aW9uIHVudGlsIHRoZSBmaXJzdCBzZW5kLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aXNpb25hbFNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIElQcm92aXNpb25hbFNlc3Npb24+KCk7XG5cdHByaXZhdGUgX3NodXRkb3duUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNTaHV0dGluZ0Rvd24gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGx1Z2luczogUGx1Z2luQ29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkxhdW5jaGVyOiBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJUZWxlbWV0cnlGb3J3YXJkZXI6IENvcGlsb3RHaXRIdWJUZWxlbWV0cnlGb3J3YXJkZXI7XG5cdHByaXZhdGUgX3ZzY29kZUFzc2lnbm1lbnRDb250ZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dpdGh1YlRlbGVtZXRyeVJvdXRlcjogQWdlbnRIb3N0R2l0SHViVGVsZW1ldHJ5Um91dGVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0LyoqIFBlci1zZXNzaW9uIGFjdGl2ZSBjbGllbnQgc3RhdGUgZm9yIHRvb2xzICsgcGx1Z2luIHNuYXBzaG90IHRyYWNraW5nLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRzID0gbmV3IFJlc291cmNlTWFwPEFjdGl2ZUNsaWVudD4oKTtcblx0LyoqXG5cdCAqIExhc3QgaG9zdC1wdWJsaXNoZWQgY3VzdG9taXphdGlvbiBzbmFwc2hvdCBwZXIgY29uZmlndXJhdGlvbiBzY29wZSAoQUdFTlRTLm1kIHNlY3Rpb24gOGIpLlxuXHQgKiBVcGRhdGVkIG9ubHkgZnJvbSBob3N0IGNhbGwgYm91bmRhcmllczsgYWJzZW5jZSBpcyBkaXN0aW5jdCBmcm9tIGFuIGVtcHR5IGxpc3QuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3N0Q3VzdG9taXphdGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8cmVhZG9ubHkgQ3VzdG9taXphdGlvbltdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFzaENvbW1hbmRQcm92aWRlcjogQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uRGF0YVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIHNlc3Npb25UaXRsZVNpZ25hbDogSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCxcblx0XHRASUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFuYWdlZFNldHRpbmdzU2VydmljZTogSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3RlbFNlcnZpY2U6IElBZ2VudEhvc3RPVGVsU2VydmljZSxcblx0XHRASUFnZW50SG9zdENvbXBsZXRpb25zIGNvbXBsZXRpb25zOiBJQWdlbnRIb3N0Q29tcGxldGlvbnMsXG5cdFx0QElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50U2VydmljZTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdTZXJ2aWNlOiBJQWdlbnRIb3N0UmV2aWV3U2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQnlva0xtQnJpZGdlUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfYnlva0JyaWRnZVJlZ2lzdHJ5OiBJQnlva0xtQnJpZGdlUmVnaXN0cnksXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0XHRASUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgcHJpdmF0ZSByZWFkb25seSBfcHJveHlSZXNvbHZlcjogSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbGFzdE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zID0gdGhpcy5fbWFuYWdlZFNldHRpbmdzU2VydmljZS5wZXJtaXNzaW9ucztcblx0XHR0aGlzLl9wbHVnaW5zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGx1Z2luQ29udHJvbGxlciwgKCkgPT4gdGhpcy5fZW5zdXJlQ2xpZW50KCkpKTtcblx0XHR0aGlzLl9zZXNzaW9uTGF1bmNoZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90U2Vzc2lvbkxhdW5jaGVyKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5wdWJsaXNoUm9vdFRyYW5zaWVudFZhbHVlcz8uKHsgW0NvcGlsb3RDbGlWU0NvZGVBc3NpZ25tZW50Q29udGV4dEtleV06IHVuZGVmaW5lZCB9KTtcblx0XHR0aGlzLl9naXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90R2l0SHViVGVsZW1ldHJ5Rm9yd2FyZGVyLCAoKSA9PiB0aGlzLl9yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCwgKCkgPT4gdGhpcy5fdnNjb2RlQXNzaWdubWVudENvbnRleHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkUm9vdENvbmZpZ0NoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVWU0NvZGVBc3NpZ25tZW50Q29udGV4dCgpKSk7XG5cdFx0dGhpcy5fdXBkYXRlVlNDb2RlQXNzaWdubWVudENvbnRleHQoKTtcblx0XHR0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlciA9IG5ldyBDb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXIoKCkgPT4gdGhpcy5fZW5zdXJlQ2xpZW50KCkudGhlbihjID0+IGMucnBjLmNvbW1hbmRzLmxpc3QoKS50aGVuKGMgPT4gYy5jb21tYW5kcykpLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9naXRodWJUZWxlbWV0cnlSb3V0ZXIgPSBpc0FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UodGhpcy5fdGVsZW1ldHJ5U2VydmljZSlcblx0XHRcdD8gbmV3IEFnZW50SG9zdEdpdEh1YlRlbGVtZXRyeVJvdXRlcih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlID0gdGhpcy5fcGx1Z2lucy5vbkRpZENoYW5nZTtcblx0XHQvLyBNaXJyb3IgaG9zdC1vd25lZCB0aXRsZXMgdW5kZXIgdGhlIFNESyBjb252ZXJzYXRpb24gaWQgdXNlZCBieSB0aGUgYWdlbnQncyB0dXJuIHNwYW5zLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25UaXRsZVNpZ25hbC5vbkRpZENoYW5nZVNlc3Npb25UaXRsZSgoeyBwcm92aWRlciwgc2Vzc2lvbiwgdGl0bGUgfSkgPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVyID09PSB0aGlzLmlkKSB7XG5cdFx0XHRcdHRoaXMuX290ZWxTZXJ2aWNlLmVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKHRoaXMuX3Nka0NvbnZlcnNhdGlvbklkKHNlc3Npb24pLCBzZXNzaW9uLnRvU3RyaW5nKCksIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gTWlycm9yIHRoZSBzdWItYWdlbnQgZmFuLW91dCBzaWduYWxzIG9udG8gdGhlIGZpcnN0LWNsYXNzIHNwYXduZWQtXG5cdFx0Ly8gY2hhdCBjaGFubmVsIHNvIHRoZSBvcmNoZXN0cmF0b3IgbWFuYWdlcyBzdWItYWdlbnQgY2hhdHNcblx0XHQvLyB0aHJvdWdoIHRoZSBzYW1lIG1lbWJlcnNoaXAgcGF0aCBhcyB1c2VyLWRyaXZlbiBjaGF0cy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENoYXRQcm9ncmVzcy5ldmVudChzaWduYWwgPT4gdGhpcy5fZW1pdFNwYXduZWRDaGF0Rm9yU3ViYWdlbnRTaWduYWwoc2lnbmFsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIobmV3IENvcGlsb3RTbGFzaENvbW1hbmRDb21wbGV0aW9uUHJvdmlkZXIodGhpcy5pZCxcblx0XHRcdHtcblx0XHRcdFx0aXNSdWJiZXJEdWNrRW5hYmxlZDogKCkgPT4gdGhpcy5faXNSdWJiZXJEdWNrRW5hYmxlZCgpLFxuXHRcdFx0XHRnZXRSdW50aW1lU2xhc2hDb21tYW5kczogKHNlc3Npb25JZCwgb3B0aW9ucykgPT4gdGhpcy5fZ2V0UnVudGltZVNsYXNoQ29tbWFuZHMoc2Vzc2lvbklkLCBvcHRpb25zKSxcblx0XHRcdFx0Z2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoc2Vzc2lvbklkKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldENoYXRDdXN0b21pemF0aW9ucyhjaGF0LCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogc2Vzc2lvbiwgcmVzb3VyY2U6IGNoYXQgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFNlc3Npb25Db25maWdTdGF0ZTogKHNlc3Npb25JZCkgPT4gdGhpcy5fZ2V0U2Vzc2lvbkNvbmZpZ1N0YXRlKHNlc3Npb25JZCksXG5cdFx0XHR9LFxuXHRcdFx0UlVOVElNRV9TTEFTSF9DT01NQU5EX0NPTVBMRVRJT05fV0FJVF9NUyxcblx0XHQpKSk7XG5cblx0XHQvLyBSZXN0YXJ0IHRoZSBDTEkgY2xpZW50IHdoZW4gYSBzZXR0aW5nIGJha2VkIGludG8gdGhlIGNsaWVudC9zdWJwcm9jZXNzIGF0XG5cdFx0Ly8gc3RhcnR1cCBjaGFuZ2VzLCBkaXNwb3NpbmcgYW55IGFjdGl2ZSBzZXNzaW9ucy4gVGhlc2UgdmFsdWVzIGFyZSBhcHBsaWVkIGluXG5cdFx0Ly8gYF9lbnN1cmVDbGllbnRgLCBzbyB0aGV5IG9ubHkgdGFrZSBlZmZlY3Qgb24gdGhlIG5leHQgY2xpZW50IHN0YXJ0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkUm9vdENvbmZpZ0NoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXN0YXJ0Q2xpZW50SWZTdGFydHVwQ29uZmlnQ2hhbmdlZCgpLmNhdGNoKGVyciA9PlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQ29waWxvdF0gRmFpbGVkIHRvIGFwcGx5IHJvb3QgY29uZmlnIGNoYW5nZScsIGVycilcblx0XHRcdCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hbmFnZWRTZXR0aW5nc1NlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzdGFydENsaWVudElmU3RhcnR1cENvbmZpZ0NoYW5nZWQoKS5jYXRjaChlcnIgPT5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NvcGlsb3RdIEZhaWxlZCB0byBhcHBseSBtYW5hZ2VkIHNldHRpbmdzIGNoYW5nZScsIGVycilcblx0XHRcdCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkUm9vdENvbmZpZ0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5faXNNaWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWQoKTtcblx0XHRcdGlmIChlbmFibGVkICE9PSB0aGlzLl9sYXN0TWlncmF0ZUxlZ2FjeUVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fbGFzdE1pZ3JhdGVMZWdhY3lFbmFibGVkID0gZW5hYmxlZDtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX2VtaXRFeHRIb3N0Q2hhdHMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN1cmZhY2UgcmVuZGVyZXIgQllPSyBtb2RlbHMgaW4gdGhlIHBpY2tlcjogcmVwdWJsaXNoIHRoZW0gd2hlbmV2ZXIgdGhlXG5cdFx0Ly8gc2V0IG9mIGNvbm5lY3RlZCByZW5kZXJlciBicmlkZ2VzLCBvciBhbnkgcmVuZGVyZXIncyBtb2RlbHMsIGNoYW5nZS5cblx0XHQvLyBUaGUgcmVnaXN0cnkgaXMgb25seSBwb3B1bGF0ZWQgd2hlbiBgY2hhdC5hZ2VudEhvc3QuYnlva01vZGVscy5lbmFibGVkYFxuXHRcdC8vIGlzIG9uLCBzbyB0aGlzIHN0YXlzIGEgbm8tb3AgKGVtcHR5IGxpc3QpIHdoaWxlIHRoZSBmZWF0dXJlIGlzIG9mZi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9ieW9rQnJpZGdlUmVnaXN0cnkub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ29waWxvdF0gQllPSyBicmlkZ2UgY2hhbmdlZDsgcmVmcmVzaGluZyBtb2RlbHMnKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hCeW9rTW9kZWxzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gYENPUElMT1RfR0hfSE9TVGAgaXMgYSBzdWJwcm9jZXNzIGVudiB2YXIgKGFwcGxpZWQgaW4gYF9lbnN1cmVDbGllbnRgKSB0aGVcblx0XHQvLyBDTEkgcmVhZHMgb25seSBhdCBzcGF3biB0aW1lLiBXaGVuIHRoZSBjb25maWd1cmVkIEdpdEh1YiBFbnRlcnByaXNlIGhvc3Rcblx0XHQvLyBjaGFuZ2VzIC0gbm90YWJseSB0aGUgc3RhcnR1cCByYWNlIHdoZXJlIHRoZSB3b3JrYmVuY2ggcHVzaGVzXG5cdFx0Ly8gYGdpdGh1YkVudGVycHJpc2VVcmlgIGp1c3QgYWZ0ZXIgdGhlIGNsaWVudCdzIGluaXRpYWwgc3Bhd24gLSByZXN0YXJ0IHRoZVxuXHRcdC8vIGNsaWVudCBzbyBpdCBjb21lcyB1cCBwb2ludGVkIGF0IHRoZSByaWdodCBob3N0LiBEcml2ZW4gb2ZmIHRoZSBlbmRwb2ludFxuXHRcdC8vIHNlcnZpY2UncyBgb25EaWRDaGFuZ2VgICh3aGljaCBmaXJlcyBhZnRlciBpdHMgZW5kcG9pbnRzIGFyZSByZWNvbXB1dGVkKVxuXHRcdC8vIHJhdGhlciB0aGFuIHRoZSByYXcgY29uZmlnIGV2ZW50LCBzbyBgZ2V0RW50ZXJwcmlzZUhvc3QoKWAgaXMgY3VycmVudCBoZXJlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXN0YXJ0Q2xpZW50SWZTdGFydHVwQ29uZmlnQ2hhbmdlZCgpLmNhdGNoKGVyciA9PlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQ29waWxvdF0gRmFpbGVkIHRvIHJlc3RhcnQgY2xpZW50IGFmdGVyIGVuZHBvaW50IGNoYW5nZScsIGVycilcblx0XHRcdCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zbGF0ZXMgdGhlIHN1Yi1hZ2VudCBmYW4tb3V0IHNpZ25hbHMgaW50byB0aGUgZmlyc3QtY2xhc3Mgc3Bhd25lZC1cblx0ICogY2hhdCBjaGFubmVsOiBgc3ViYWdlbnRfc3RhcnRlZGAgLT4ge0BsaW5rIG9uRGlkU3Bhd25DaGF0fVxuXHQgKiAoY2FycnlpbmcgdGhlIHNwYXduaW5nIHRvb2wgY2FsbCBhcyB0aGUgY2hhdCdzIHBhcmVudCBlZGdlKS4gQSBjb21wbGV0ZWRcblx0ICogc3ViYWdlbnQgY2hhdCBzdGF5cyBsaXZlIGFuZCBzdWJzY3JpYmFibGUgKGl0IGlzIHJlbW92ZWQgb25seSBvbiBzZXNzaW9uXG5cdCAqIHRlYXJkb3duKSwgc28gdGhlcmUgaXMgbm8gY29ycmVzcG9uZGluZyBlbmQgZXZlbnQuIFRoZSBzaWduYWxzIHRoZW1zZWx2ZXNcblx0ICogYXJlIGxlZnQgdW50b3VjaGVkIHNvIHRoZSBleGlzdGluZyBzdWItYWdlbnQgYmVoYXZpb3IgaXMgcHJlc2VydmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW1pdFNwYXduZWRDaGF0Rm9yU3ViYWdlbnRTaWduYWwoc2lnbmFsOiBBZ2VudFNpZ25hbCk6IHZvaWQge1xuXHRcdGNvbnN0IHNwYXduID0gU3ViYWdlbnRDaGF0U2lnbmFsLnRvU3Bhd25FdmVudChzaWduYWwpO1xuXHRcdGlmIChzcGF3bikge1xuXHRcdFx0dGhpcy5fb25EaWRTcGF3bkNoYXQuZmlyZShzcGF3bik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGFzdFNlc3Npb25TeW5jRW5hYmxlZDogYm9vbGVhbiA9IHRoaXMuX2lzU2Vzc2lvblN5bmNFbmFibGVkKCk7XG5cdHByaXZhdGUgX2xhc3RSdWJiZXJEdWNrRW5hYmxlZDogYm9vbGVhbiA9IHRoaXMuX2lzUnViYmVyRHVja0VuYWJsZWQoKTtcblx0cHJpdmF0ZSBfbGFzdENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmc6IENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgPSB0aGlzLl9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCk7XG5cdHByaXZhdGUgX2xhc3RFbnRlcnByaXNlSG9zdDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKTtcblx0cHJpdmF0ZSBfbGFzdFN5c3RlbVByb3h5RW5hYmxlZDogYm9vbGVhbiA9IHRoaXMuX2lzU3lzdGVtUHJveHlFbmFibGVkKCk7XG5cdHByaXZhdGUgX2xhc3RNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9uczogSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zO1xuXHRwcml2YXRlIF9sYXN0TWlncmF0ZUxlZ2FjeUVuYWJsZWQ6IGJvb2xlYW4gPSB0aGlzLl9pc01pZ3JhdGVMZWdhY3lDb3BpbG90Q2xpRW5hYmxlZCgpO1xuXG5cdHByaXZhdGUgX2lzU2Vzc2lvblN5bmNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSdWJiZXJEdWNrRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGNvcGlsb3RDbGlDb25maWdTY2hlbWEsIENvcGlsb3RDbGlDb25maWdLZXkuUnViYmVyRHVjaykgPz8gREVGQVVMVF9DT1BJTE9UX1JVQkJFUl9EVUNLX0VOQUJMRUQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCk6IENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoY29waWxvdENsaUNvbmZpZ1NjaGVtYSwgQ29waWxvdENsaUNvbmZpZ0tleS5Db3BpbG90U2RrTG9nTGV2ZWwpID8/ICdpbmZvJztcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDb3BpbG90U2RrTG9nTGV2ZWwoY29uZmlndXJlZDogQ29waWxvdFNka0xvZ0xldmVsU2V0dGluZyk6IE5vbk51bGxhYmxlPENvcGlsb3RDbGllbnRPcHRpb25zWydsb2dMZXZlbCddPiB7XG5cdFx0cmV0dXJuIGNvbmZpZ3VyZWQgPT09ICd0cmFjZScgfHwgdGhpcy5fbG9nU2VydmljZS5nZXRMZXZlbCgpID09PSBMb2dMZXZlbC5UcmFjZSA/ICdhbGwnIDogJ2luZm8nO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RW50ZXJwcmlzZUhvc3QoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEVudGVycHJpc2VIb3N0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1N5c3RlbVByb3h5RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5KSAhPT0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc01pZ3JhdGVMZWdhY3lDb3BpbG90Q2xpRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0TWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGtleSBhYnNlbnQgZnJvbSByb290IGNvbmZpZyAoZS5nLiBkcm9wcGVkIGJ5IGEgc2NoZW1hLWZpbHRlcmVkIHJlcGxhY2UpXG5cdCAqIGtlZXBzIHRoZSBsYXN0LWtub3duIGNvbnRleHQgc3RpY2t5OyBhbiBleHBsaWNpdCBlbXB0eS1zdHJpbmcgZGlzcGF0Y2hcblx0ICogZnJvbSB0aGUgd29ya2JlbmNoIGNsZWFycyBpdC5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVZTQ29kZUFzc2lnbm1lbnRDb250ZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdENvbmZpZ1ZhbHVlcz8uKClbQ29waWxvdENsaVZTQ29kZUFzc2lnbm1lbnRDb250ZXh0S2V5XTtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fdnNjb2RlQXNzaWdubWVudENvbnRleHQgPSB2YWx1ZSB8fCB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RhcnQgdGhlIENMSSBjbGllbnQgd2hlbiBhIHN0YXJ0dXAtYmFrZWQgdmFsdWUgY2hhbmdlcywgYnV0IGRlZmVyIHBhc3QgYW55XG5cdCAqIGluLWZsaWdodCB0dXJuIFx1MjAxNCBzZWUge0BsaW5rIF9yZXF1ZXN0Q2xpZW50UmVzdGFydH0gXHUyMDE0IHNvIHRoZSBuZXcgdmFsdWVzIGFyZVxuXHQgKiBwaWNrZWQgdXAgYXQgdGhlIG5leHQgcXVpZXQgcG9pbnQgcmF0aGVyIHRoYW4gYnkga2lsbGluZyBsaXZlIHdvcmsuXG5cdCAqIEFuIGluLWZsaWdodCBzdGFydCBhYm9ydHMgaWYgYW55IHN0YXJ0dXAgdmFsdWUgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RhcnRDbGllbnRJZlN0YXJ0dXBDb25maWdDaGFuZ2VkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25TeW5jID0gdGhpcy5faXNTZXNzaW9uU3luY0VuYWJsZWQoKTtcblx0XHRjb25zdCBydWJiZXJEdWNrID0gdGhpcy5faXNSdWJiZXJEdWNrRW5hYmxlZCgpO1xuXHRcdGNvbnN0IGNvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgPSB0aGlzLl9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCk7XG5cdFx0Y29uc3QgZW50ZXJwcmlzZUhvc3QgPSB0aGlzLl9nZXRFbnRlcnByaXNlSG9zdCgpO1xuXHRcdGNvbnN0IHN5c3RlbVByb3h5RW5hYmxlZCA9IHRoaXMuX2lzU3lzdGVtUHJveHlFbmFibGVkKCk7XG5cdFx0Y29uc3QgbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgPSB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLnBlcm1pc3Npb25zO1xuXHRcdGlmICh0aGlzLl9sYXN0U2Vzc2lvblN5bmNFbmFibGVkID09PSBzZXNzaW9uU3luYyAmJiB0aGlzLl9sYXN0UnViYmVyRHVja0VuYWJsZWQgPT09IHJ1YmJlckR1Y2sgJiYgdGhpcy5fbGFzdENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgPT09IGNvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcgJiYgdGhpcy5fbGFzdEVudGVycHJpc2VIb3N0ID09PSBlbnRlcnByaXNlSG9zdCAmJiB0aGlzLl9sYXN0U3lzdGVtUHJveHlFbmFibGVkID09PSBzeXN0ZW1Qcm94eUVuYWJsZWQgJiYgZXF1YWxzKHRoaXMuX2xhc3RNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucywgbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYW5nZWQgPSBbXG5cdFx0XHR0aGlzLl9sYXN0U2Vzc2lvblN5bmNFbmFibGVkICE9PSBzZXNzaW9uU3luYyA/IGBzZXNzaW9uU3luYz0ke3Nlc3Npb25TeW5jfWAgOiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9sYXN0UnViYmVyRHVja0VuYWJsZWQgIT09IHJ1YmJlckR1Y2sgPyBgcnViYmVyRHVjaz0ke3J1YmJlckR1Y2t9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xhc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nICE9PSBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nID8gYGNvcGlsb3RTZGtMb2dMZXZlbD0ke2NvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmd9YCA6IHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX2xhc3RFbnRlcnByaXNlSG9zdCAhPT0gZW50ZXJwcmlzZUhvc3QgPyBgZW50ZXJwcmlzZUhvc3Q9JHtlbnRlcnByaXNlSG9zdH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5fbGFzdFN5c3RlbVByb3h5RW5hYmxlZCAhPT0gc3lzdGVtUHJveHlFbmFibGVkID8gYHN5c3RlbVByb3h5PSR7c3lzdGVtUHJveHlFbmFibGVkfWAgOiB1bmRlZmluZWQsXG5cdFx0XHQhZXF1YWxzKHRoaXMuX2xhc3RNYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucywgbWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMpID8gJ21hbmFnZWRTZXR0aW5nc1Blcm1pc3Npb25zJyA6IHVuZGVmaW5lZCxcblx0XHRdLmZpbHRlcigodik6IHYgaXMgc3RyaW5nID0+IHYgIT09IHVuZGVmaW5lZCkuam9pbignLCAnKTtcblx0XHR0aGlzLl9sYXN0U2Vzc2lvblN5bmNFbmFibGVkID0gc2Vzc2lvblN5bmM7XG5cdFx0dGhpcy5fbGFzdFJ1YmJlckR1Y2tFbmFibGVkID0gcnViYmVyRHVjaztcblx0XHR0aGlzLl9sYXN0Q29waWxvdFNka0xvZ0xldmVsU2V0dGluZyA9IGNvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmc7XG5cdFx0dGhpcy5fbGFzdEVudGVycHJpc2VIb3N0ID0gZW50ZXJwcmlzZUhvc3Q7XG5cdFx0dGhpcy5fbGFzdFN5c3RlbVByb3h5RW5hYmxlZCA9IHN5c3RlbVByb3h5RW5hYmxlZDtcblx0XHR0aGlzLl9sYXN0TWFuYWdlZFNldHRpbmdzUGVybWlzc2lvbnMgPSBtYW5hZ2VkU2V0dGluZ3NQZXJtaXNzaW9ucztcblx0XHRpZiAodGhpcy5fY2xpZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBTdGFydHVwIGNvbmZpZyBjaGFuZ2VkICgke2NoYW5nZWR9KSwgcmVzdGFydGluZyBDb3BpbG90Q2xpZW50YCk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlcXVlc3RDbGllbnRSZXN0YXJ0KGBzdGFydHVwIGNvbmZpZyBjaGFuZ2VkOiAke2NoYW5nZWR9YCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVxdWVzdHMgYSBDTEkgY2xpZW50IHJlc3RhcnQsIHJ1bm5pbmcgaXQgaW1tZWRpYXRlbHkgd2hlbiBldmVyeSBjaGF0IGlzXG5cdCAqIGlkbGUgYW5kIG90aGVyd2lzZSBwYXJraW5nIGl0IHVudGlsIHRoZSBsYXN0IGluLWZsaWdodCB0dXJuIGVuZHMuXG5cdCAqXG5cdCAqIFJlc3RhcnRpbmcgdGVhcnMgdGhlIFNESyBzZXNzaW9ucyBkb3duLCBhbmQgYSB0b3JuLWRvd24gc2Vzc2lvbiBzdG9wc1xuXHQgKiBwcm9kdWNpbmcgdGhlIGV2ZW50cyB0aGF0IGZpbmFsaXplIGl0cyBwcm90b2NvbCB0dXJuIFx1MjAxNCB0aGUgY2xpZW50IHdvdWxkIGJlXG5cdCAqIGxlZnQgd2l0aCBhIHR1cm4gdGhhdCBuZXZlciBjb21wbGV0ZXMsIGNhbmNlbHMsIG9yIGVycm9ycywgaS5lLiBhIHNlc3Npb25cblx0ICogdGhhdCBzcGlucyBmb3JldmVyLiBTdGFydHVwLW9ubHkgdmFsdWVzIChzZXNzaW9uIHN5bmMsIHRoZSBTREsgbG9nIGxldmVsLFxuXHQgKiB0aGUgZW50ZXJwcmlzZSBob3N0LCB0aGUgc3lzdGVtIHByb3h5KSBjYW4gYWxzbyBjaGFuZ2Ugd2l0aG91dCBhbnkgdXNlclxuXHQgKiBhY3Rpb24sIGZyb20gYW4gZXhwZXJpbWVudCBvciBwb2xpY3kgcmVmcmVzaCwgc28gdGhpcyBtdXN0IG5ldmVyIGJlIHBhaWRcblx0ICogZm9yIHdpdGggYSBydW5uaW5nIHR1cm4uIHtAbGluayBfZW5zdXJlQ2xpZW50fSByZWFkcyB0aGVtIGZyZXNoIG9uIHRoZSBuZXh0XG5cdCAqIHN0YXJ0LCBzbyBhcHBseWluZyB0aGUgcmVzdGFydCBsYXRlIGlzIGFsd2F5cyBjb3JyZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVxdWVzdENsaWVudFJlc3RhcnQocmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd25Qcm9taXNlIHx8ICghdGhpcy5fY2xpZW50ICYmICF0aGlzLl9jbGllbnRTdGFydGluZykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLmFkZChyZWFzb24pO1xuXHRcdGlmICh0aGlzLl9jbGllbnRTdGFydGluZykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpZW50U3RhcnRpbmc7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLmRlbGV0ZShyZWFzb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJ1c3lDaGF0cyA9IHRoaXMuX2NoYXRzV2l0aEFjdGl2ZVR1cm4oKTtcblx0XHRpZiAoYnVzeUNoYXRzID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gRGVmZXJyaW5nIENvcGlsb3RDbGllbnQgcmVzdGFydCAoJHtyZWFzb259KSB1bnRpbCAke2J1c3lDaGF0c30gaW4tZmxpZ2h0IHR1cm4ocykgZmluaXNoYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIGEgcmVzdGFydCBwYXJrZWQgYnkge0BsaW5rIF9yZXF1ZXN0Q2xpZW50UmVzdGFydH0gb25jZSBubyBjaGF0IGhhc1xuXHQgKiBhbiBpbi1mbGlnaHQgdHVybi4gTm8tb3Agd2hpbGUgYW55IHR1cm4gaXMgc3RpbGwgcnVubmluZzsgdGhlIG5leHQgY2hhdFxuXHQgKiB0byBnbyBpZGxlIGRyaXZlcyB0aGlzIGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlQZW5kaW5nQ2xpZW50UmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLnNpemUgPT09IDAgfHwgdGhpcy5fc2h1dGRvd25Qcm9taXNlIHx8ICF0aGlzLl9jbGllbnQgfHwgdGhpcy5fY2hhdHNXaXRoQWN0aXZlVHVybigpID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWFzb24gPSBbLi4udGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zXS5qb2luKCc7ICcpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFJlc3RhcnRpbmcgQ29waWxvdENsaWVudCAoJHtyZWFzb259KWApO1xuXHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRhd2FpdCB0aGlzLl9zdG9wQ2xpZW50KCk7XG5cdFx0Ly8gVGhlIG1vZGVsIGxpc3QgY2FtZSBmcm9tIHRoZSBzdWJwcm9jZXNzIHdlIGp1c3QgdG9yZSBkb3duLCBhbmQgdGhlXG5cdFx0Ly8gcmVwbGFjZW1lbnQgbWF5IGJlIHBvaW50ZWQgYXQgYSBkaWZmZXJlbnQgQ0FQSSBlbmRwb2ludCBlbnRpcmVseVxuXHRcdC8vIChgQ09QSUxPVF9HSF9IT1NUYCByb3V0ZXMgdGhyb3VnaCB0aGlzIHNhbWUgaGVscGVyKS4gUmUtZW51bWVyYXRlXG5cdFx0Ly8gcmF0aGVyIHRoYW4gc2VydmluZyB0aGUgb2xkIGNsaWVudCdzIGNhdGFsb2cgdW50aWwgdGhlIG5leHQgdG9rZW5cblx0XHQvLyBjaGFuZ2UuIE5vdCBob29rZWQgaW4gYF9lbnN1cmVDbGllbnRgLCBzaW5jZSBgX2xpc3RNb2RlbHNgIGNhbGxzXG5cdFx0Ly8gaXQgYW5kIHdvdWxkIHJlY3Vyc2UuXG5cdFx0dGhpcy5fY2FwaU1vZGVscyA9IFtdO1xuXHRcdHRoaXMuX3B1Ymxpc2hNb2RlbHMoKTtcblx0XHR2b2lkIHRoaXMuX3NjaGVkdWxlTW9kZWxSZWZyZXNoKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIGJ5IGEge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259IHdoZW4gaXRzIHR1cm4gZW5kcy4gU2NoZWR1bGVkIG9mZlxuXHQgKiB0aGUgY3VycmVudCBzdGFjayBiZWNhdXNlIHRoZSBjYWxsYmFjayBmaXJlcyBmcm9tIGluc2lkZSB0aGF0IHNlc3Npb24nc1xuXHQgKiBTREsgZXZlbnQgaGFuZGxpbmcgYW5kIHRoZSByZXN0YXJ0IGRpc3Bvc2VzIHRoZSBzZXNzaW9uIG1ha2luZyB0aGUgY2FsbC5cblx0ICovXG5cdHByaXZhdGUgX29uQ2hhdFR1cm5FbmRlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ0NsaWVudFJlc3RhcnRSZWFzb25zLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXBwbHlQZW5kaW5nQ2xpZW50UmVzdGFydCgpLmNhdGNoKGVyciA9PlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQ29waWxvdF0gRmFpbGVkIHRvIGFwcGx5IGRlZmVycmVkIGNsaWVudCByZXN0YXJ0JywgZXJyKVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY292ZXJGcm9tQ2xvc2VkQ29ubmVjdGlvbihlcnJvcjogdW5rbm93biwgb3BlcmF0aW9uOiBDb3BpbG90Q2xpZW50RmFpbHVyZU9wZXJhdGlvbiwgY29ycmVsYXRpb24/OiBJQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbik6IFByb21pc2U8SUNvcGlsb3RDbG9zZWRDb25uZWN0aW9uUmVjb3ZlcnlSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBmYWlsdXJlS2luZCA9IGNsYXNzaWZ5Q29waWxvdENsaWVudEZhaWx1cmUoZXJyb3IpO1xuXHRcdGlmICghZmFpbHVyZUtpbmQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIHRoaXMuX3JlcG9ydGVkQ2xpZW50RmFpbHVyZXMuaGFzKGVycm9yKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjbGllbnRGYWlsdXJlSWQgPSB0aGlzLl9jbG9zZWRDb25uZWN0aW9uUmVjb3Zlcnk/LmNsaWVudEZhaWx1cmVJZCA/PyBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCByZWNvdmVyeVN0YXJ0ZWQgPSBmYWlsdXJlS2luZCA9PT0gJ2Nvbm5lY3Rpb25DbG9zZWQnICYmICF0aGlzLl9zaHV0ZG93blByb21pc2UgJiYgdGhpcy5fY2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5ID09PSB1bmRlZmluZWQ7XG5cdFx0cmVwb3J0Q29waWxvdENsaWVudEZhaWx1cmUodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgY2xpZW50RmFpbHVyZUlkLCBmYWlsdXJlS2luZCwgb3BlcmF0aW9uLCB0aGlzLl9jaGF0c1dpdGhBY3RpdmVUdXJuKCksIHJlY292ZXJ5U3RhcnRlZCwgZXJyb3IsIGNvcnJlbGF0aW9uKTtcblx0XHRpZiAoZmFpbHVyZUtpbmQgIT09ICdjb25uZWN0aW9uQ2xvc2VkJyB8fCB0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jbG9zZWRDb25uZWN0aW9uUmVjb3ZlcnkpIHtcblx0XHRcdGNvbnN0IHJlY292ZXJ5ID0gdGhpcy5fcnVuQ2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5KGNsaWVudEZhaWx1cmVJZCwgZmFpbHVyZUtpbmQpO1xuXHRcdFx0dGhpcy5fY2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5ID0geyBjbGllbnRGYWlsdXJlSWQsIHByb21pc2U6IHJlY292ZXJ5IH07XG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fY2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5Py5wcm9taXNlID09PSByZWNvdmVyeSkge1xuXHRcdFx0XHRcdHRoaXMuX2Nsb3NlZENvbm5lY3Rpb25SZWNvdmVyeSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHJlY292ZXJ5LnRoZW4oY2xlYW51cCwgY2xlYW51cCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2Nsb3NlZENvbm5lY3Rpb25SZWNvdmVyeS5wcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuQ2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5KGNsaWVudEZhaWx1cmVJZDogc3RyaW5nLCBmYWlsdXJlS2luZDogQ29waWxvdENsaWVudEZhaWx1cmVLaW5kKTogUHJvbWlzZTxJQ29waWxvdENsb3NlZENvbm5lY3Rpb25SZWNvdmVyeVJlc3VsdD4ge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kb1JlY292ZXJGcm9tQ2xvc2VkQ29ubmVjdGlvbihjbGllbnRGYWlsdXJlSWQpO1xuXHRcdHJlcG9ydENvcGlsb3RDbGllbnRSZWNvdmVyeSh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRjbGllbnRGYWlsdXJlSWQsXG5cdFx0XHRmYWlsdXJlS2luZCxcblx0XHRcdGR1cmF0aW9uTXM6IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRmYWlsZWRUdXJuQ291bnQ6IHJlc3VsdC5mYWlsZWRUdXJuSWRzLnNpemUsXG5cdFx0XHRzdG9wU3VjY2VlZGVkOiByZXN1bHQuc3RvcFN1Y2NlZWRlZCxcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZWNvdmVyRnJvbUNsb3NlZENvbm5lY3Rpb24oY2xpZW50RmFpbHVyZUlkOiBzdHJpbmcpOiBQcm9taXNlPElDb3BpbG90Q2xvc2VkQ29ubmVjdGlvblJlY292ZXJ5UmVzdWx0PiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NvcGlsb3RdIFJlY292ZXJpbmcgZnJvbSBjbG9zZWQgU0RLIGNvbm5lY3Rpb24nKTtcblx0XHRjb25zdCBmYWlsZWRUdXJuSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZXJyb3I6IEVycm9ySW5mbyA9IHtcblx0XHRcdGVycm9yVHlwZTogJ3Byb3ZpZGVyQ29ubmVjdGlvbkNsb3NlZCcsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29waWxvdEFnZW50LmNvbm5lY3Rpb25DbG9zZWQnLCBcIkNvcGlsb3Qgc3RvcHBlZCB1bmV4cGVjdGVkbHkuIFJldHJ5IHlvdXIgcmVxdWVzdC5cIiksXG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdGNvbnN0IGNsaWVudENvbnRleHQgPSBjaGF0LmN1cnJlbnRUdXJuQ2xpZW50Q29udGV4dDtcblx0XHRcdGNvbnN0IGZhaWxlZFR1cm5JZCA9IGNoYXQuZmFpbEFjdGl2ZVR1cm4oZXJyb3IpO1xuXHRcdFx0aWYgKGZhaWxlZFR1cm5JZCkge1xuXHRcdFx0XHRmYWlsZWRUdXJuSWRzLmFkZChmYWlsZWRUdXJuSWQpO1xuXHRcdFx0XHRyZXBvcnRDb3BpbG90Q2xpZW50UmVjb3ZlcnlUdXJuKFxuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRcdFx0Y2xpZW50RmFpbHVyZUlkLFxuXHRcdFx0XHRcdGNyZWF0ZUNvcGlsb3RGYWlsdXJlQ29ycmVsYXRpb24oY2hhdC5zZXNzaW9uVXJpLCBjaGF0LmNoYXRVcmksIGZhaWxlZFR1cm5JZCwgY2hhdC5zZXNzaW9uSWQsIGNsaWVudENvbnRleHQpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRsZXQgc3RvcFN1Y2NlZWRlZCA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3N0b3BDbGllbnQoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0c3RvcFN1Y2NlZWRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgJ1tDb3BpbG90XSBGYWlsZWQgdG8gc3RvcCBjbG9zZWQgU0RLIGNsaWVudCcpO1xuXHRcdH1cblx0XHR0aGlzLl9jYXBpTW9kZWxzID0gW107XG5cdFx0dGhpcy5fcHVibGlzaE1vZGVscygpO1xuXHRcdHJldHVybiB7IGZhaWxlZFR1cm5JZHMsIHN0b3BTdWNjZWVkZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JldHJ5QWZ0ZXJDbG9zZWRDb25uZWN0aW9uPFQ+KG9wZXJhdGlvbjogQ29waWxvdENsaWVudEZhaWx1cmVPcGVyYXRpb24sIHRhc2s6ICgpID0+IFByb21pc2U8VD4sIGNvcnJlbGF0aW9uPzogSUNvcGlsb3RGYWlsdXJlQ29ycmVsYXRpb24pOiBQcm9taXNlPFQ+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRhc2soKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9yZWNvdmVyRnJvbUNsb3NlZENvbm5lY3Rpb24oZXJyb3IsIG9wZXJhdGlvbiwgY29ycmVsYXRpb24pKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhc2soKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGllbnRGYWlsdXJlQ29ycmVsYXRpb24oY2hhdDogVVJJLCB0dXJuSWQ/OiBzdHJpbmcsIG9wZXJhdGlvbkNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IElDb3BpbG90RmFpbHVyZUNvcnJlbGF0aW9uIHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZVNlbmRDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRjb25zdCBjbGllbnRUZWxlbWV0cnlDb250ZXh0ID0gVVJJLmlzVXJpKG9wZXJhdGlvbkNvbnRleHQpID8gdW5kZWZpbmVkIDogb3BlcmF0aW9uQ29udGV4dD8uY2xpZW50VGVsZW1ldHJ5Q29udGV4dDtcblx0XHRyZXR1cm4gY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbihjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdCwgdHVybklkLCBjb250ZXh0LnRhcmdldD8uc2Vzc2lvbklkID8/IGNvbnRleHQuY29uZmlndXJhdGlvbklkLCBjbGllbnRUZWxlbWV0cnlDb250ZXh0KTtcblx0fVxuXG5cdC8qKiBOdW1iZXIgb2YgbGl2ZSBjaGF0cyAoZGVmYXVsdCBvciBwZWVyLCBhY3Jvc3MgYWxsIHNlc3Npb25zKSB3aXRoIGFuIGluLWZsaWdodCB0dXJuLiAqL1xuXHRwcml2YXRlIF9jaGF0c1dpdGhBY3RpdmVUdXJuKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2FsbExpdmVTZXNzaW9ucygpLmZpbHRlcihzZXNzaW9uID0+IHNlc3Npb24uaGFzQWN0aXZlVHVybikubGVuZ3RoO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVDb3BpbG90Q2xpZW50KG9wdGlvbnM6IENvcGlsb3RDbGllbnRPcHRpb25zKTogQ29waWxvdENsaWVudCB7XG5cdFx0cmV0dXJuIG5ldyBDb3BpbG90Q2xpZW50KG9wdGlvbnMpO1xuXHR9XG5cblx0Ly8gLS0tLSBhdXRoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90QWdlbnQuZGVzY3JpcHRpb24nLCBcIkNvcGlsb3QgU0RLIGFnZW50IHJ1bm5pbmcgaW4gdGhlIGxvY2FsIGFnZW50IGhvc3QgcHJvY2Vzc1wiKSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRtdWx0aXBsZUNoYXRzOiB7IGZvcms6IHRydWUsIHNpZGVDaGF0OiB0cnVlIH0sXG5cdFx0XHRcdC4uLih0aGlzLl9pc011bHRpUm9vdEVuYWJsZWQoKSA/IHsgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM6IHsgaW1tdXRhYmxlUHJpbWFyeTogdHJ1ZSB9IH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc011bHRpUm9vdEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0fVxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10ge1xuXHRcdGNvbnN0IGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hLCBBZ2VudEhvc3RDb25maWdLZXkuQWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlKSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBjb3BpbG90UmVzb3VyY2UgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSAmJiB0aGlzLl9ieW9rTW9kZWxzLmxlbmd0aCA+IDAgPyB7IC4uLmNvcGlsb3RSZXNvdXJjZSwgcmVxdWlyZWQ6IGZhbHNlIH0gOiBjb3BpbG90UmVzb3VyY2UsXG5cdFx0XHR0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCksXG5cdFx0XTtcblx0fVxuXG5cdGFzeW5jIGdldE5ldHdvcmtEaWFnbm9zdGljc0VuZHBvaW50cygpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudEhvc3ROZXR3b3JrRW5kcG9pbnRbXT4ge1xuXHRcdGxldCBjYXBpVXJsID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9BR0VOVF9IT1NUX0NBUElfVVJMX09WRVJSSURFJ10gfHwgQ09QSUxPVF9DQVBJX1VSTDtcblx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNhcGlVcmwgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlQXBpRW5kcG9pbnQodGhpcy5fZ2l0aHViVG9rZW4pIHx8IGNhcGlVcmw7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQ29waWxvdF0gQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcnkgZm9yIG5ldHdvcmsgZGlhZ25vc3RpY3MgZmFpbGVkOyB1c2luZyAke2NhcGlVcmx9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgY2FwaVBpbmdVcmwgPSBuZXcgVVJMKGNhcGlVcmwpO1xuXHRcdGNhcGlQaW5nVXJsLnBhdGhuYW1lID0gYCR7Y2FwaVBpbmdVcmwucGF0aG5hbWUucmVwbGFjZSgvXFwvJC8sICcnKX0vX3BpbmdgO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7IG5hbWU6ICdHaXRIdWIgQVBJJywgdXJsOiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0QXBpQmFzZVVyaSgpIH0sXG5cdFx0XHR7IG5hbWU6ICdDb3BpbG90IEFQSSAoQ0FQSSknLCB1cmw6IGNhcGlQaW5nVXJsLnRvU3RyaW5nKCkgfSxcblx0XHRdO1xuXHR9XG5cblx0YXN5bmMgZ2V0TmV0d29ya0RpYWdub3N0aWNzQWNjb3VudCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9naXRodWJUb2tlbiA/IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVVc2VyTG9naW4/Lih0aGlzLl9naXRodWJUb2tlbikgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcygpOiBQcm9taXNlPElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTbmFwc2hvdD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ1tDb3BpbG90XSBDb2xsZWN0aW5nIHJ1bnRpbWUgbWFuYWdlZC1zZXR0aW5ncyBkaWFnbm9zdGljcycpO1xuXHRcdGxldCBzdGFnZSA9ICdyZXNvbHZpbmcgdGhlIENvcGlsb3QgQ0xJIHBhdGgnO1xuXHRcdGNvbnN0IGRpYWdub3N0aWNzID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGVNb2R1bGVzVXJpID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoZ2V0QXBwTm9kZU1vZHVsZXNQYXRoKCkpO1xuXHRcdFx0Y29uc3QgY2xpUGF0aCA9IGF3YWl0IHJlc29sdmVDb3BpbG90Q2xpUGF0aChub2RlTW9kdWxlc1VyaSk7XG5cdFx0XHRjb25zdCBydW50aW1lU2RrUGF0aCA9IGpvaW4oZGlybmFtZShjbGlQYXRoKSwgJ3NkaycsICdpbmRleC5qcycpO1xuXHRcdFx0c3RhZ2UgPSAnY2hlY2tpbmcgdGhlIENvcGlsb3QgcnVudGltZSBTREsnO1xuXHRcdFx0aWYgKCFhd2FpdCBmaWxlRXhpc3RzKHJ1bnRpbWVTZGtQYXRoKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvcGlsb3QgcnVudGltZSBTREsgbm90IGZvdW5kIGF0ICR7cnVudGltZVNka1BhdGh9YCk7XG5cdFx0XHR9XG5cdFx0XHRzdGFnZSA9ICdsb2FkaW5nIHRoZSBDb3BpbG90IHJ1bnRpbWUgU0RLJztcblx0XHRcdGNvbnN0IHJ1bnRpbWVTZGs6IHVua25vd24gPSBhd2FpdCBpbXBvcnQocGF0aFRvRmlsZVVSTChydW50aW1lU2RrUGF0aCkuaHJlZik7XG5cdFx0XHRpZiAoIWlzQ29waWxvdFJ1bnRpbWVNYW5hZ2VkU2V0dGluZ3NTZGsocnVudGltZVNkaykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3BpbG90IHJ1bnRpbWUgU0RLIGRvZXMgbm90IGV4cG9zZSBnZXRNYW5hZ2VkU2V0dGluZ3MoKScpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGFnZSA9ICdyZXNvbHZpbmcgdGhlIHByb3h5Jztcblx0XHRcdGNvbnN0IHByb3h5ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByb3h5Rm9yU2RrKCk7XG5cdFx0XHRzdGFnZSA9ICdxdWVyeWluZyBuYXRpdmUgTURNIGFuZCBHaXRIdWIgbWFuYWdlZCBzZXR0aW5ncyc7XG5cdFx0XHRyZXR1cm4gZ2V0Q29waWxvdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzKFxuXHRcdFx0XHRydW50aW1lU2RrLFxuXHRcdFx0XHR0aGlzLl9naXRodWJUb2tlbixcblx0XHRcdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEVudGVycHJpc2VVcmkoKSA/PyAnaHR0cHM6Ly9naXRodWIuY29tJyxcblx0XHRcdFx0QWJvcnRTaWduYWwudGltZW91dChDT1BJTE9UX01BTkFHRURfU0VUVElOR1NfRElBR05PU1RJQ1NfVElNRU9VVF9NUyksXG5cdFx0XHRcdENPUElMT1RfTUFOQUdFRF9TRVRUSU5HU19RVUVSWV9USU1FT1VUX01TLFxuXHRcdFx0XHRwcm94eSxcblx0XHRcdCk7XG5cdFx0fSkoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChkaWFnbm9zdGljcywgQ09QSUxPVF9NQU5BR0VEX1NFVFRJTkdTX0RJQUdOT1NUSUNTX1RJTUVPVVRfTVMpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBSdW50aW1lIG1hbmFnZWQtc2V0dGluZ3MgZGlhZ25vc3RpY3MgdGltZWQgb3V0IHdoaWxlICR7c3RhZ2V9YCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvcGlsb3QgcnVudGltZSBkaWFnbm9zdGljcyBleGNlZWRlZCA0LjUgc2Vjb25kcyB3aGlsZSAke3N0YWdlfS5gKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RdIFJ1bnRpbWUgbWFuYWdlZC1zZXR0aW5ncyBkaWFnbm9zdGljcyBjb2xsZWN0ZWQnKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucmVzdWx0LnJlc29sdmVkLFxuXHRcdFx0Li4uKHJlc3VsdC5hY2NvdW50ID8geyBhY2NvdW50OiByZXN1bHQuYWNjb3VudCB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRnZXRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9wbHVnaW5zLmdldENvbmZpZ3VyZWRIb3N0Q3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdC8qKiBSZWNvcmRzIHRoZSBsYXRlc3QgaG9zdCBzbmFwc2hvdCBmb3IgYHNlc3Npb25gOyBgdW5kZWZpbmVkYCBtZWFucyBcIm5vdCBwdWJsaXNoZWQgeWV0XCIsIG5vdCBcImVtcHR5XCIuICovXG5cdHByaXZhdGUgX3JlbWVtYmVySG9zdEN1c3RvbWl6YXRpb25zKHNlc3Npb246IFVSSSwgY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChjdXN0b21pemF0aW9ucykge1xuXHRcdFx0dGhpcy5faG9zdEN1c3RvbWl6YXRpb25zLnNldChzZXNzaW9uLCBjdXN0b21pemF0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlZnJlc2hlcyB0aGUgcmV0YWluZWQgaG9zdCBzbmFwc2hvdCBmcm9tIGEgY2hhdC1hZGRyZXNzZWQgb3BlcmF0aW9uIGNvbnRleHQuICovXG5cdHByaXZhdGUgX25vdGVIb3N0Q3VzdG9taXphdGlvbnMoY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWNvbnRleHQgfHwgVVJJLmlzVXJpKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbWVtYmVySG9zdEN1c3RvbWl6YXRpb25zKGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLCByZXNvbHZlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoY29udGV4dCkpO1xuXHR9XG5cblx0LyoqIFJldHVybnMgdGhlIHJldGFpbmVkIGhvc3Qgc25hcHNob3QgZm9yIGBzZXNzaW9uYCwgb3IgYSBzdGFibGUgZW1wdHkgc2luZ2xldG9uIGlmIG5vbmUgd2FzIHB1Ymxpc2hlZC4gKi9cblx0cHJpdmF0ZSBfcmV0YWluZWRIb3N0Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogVVJJKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zLmdldChzZXNzaW9uKSA/PyBOT19IT1NUX0NVU1RPTUlaQVRJT05TO1xuXHR9XG5cblx0LyoqIGBob3N0Q3VzdG9taXphdGlvbnNgIHJlZnJlc2hlcyB0aGUgcmV0YWluZWQgaG9zdCBzbmFwc2hvdCBiZWZvcmUgcGx1Z2luL01DUCByZXNvbHV0aW9uLiAqL1xuXHRhc3luYyBnZXRDaGF0Q3VzdG9taXphdGlvbnMoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgaG9zdEN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdHRoaXMuX3JlbWVtYmVySG9zdEN1c3RvbWl6YXRpb25zKHNlc3Npb24sIGhvc3RDdXN0b21pemF0aW9ucyk7XG5cdFx0Y29uc3QgYW5jaG9ycyA9IGF3YWl0IHRoaXMuX2dldFNlc3Npb25DdXN0b21pemF0aW9uQW5jaG9ycyhzZXNzaW9uKTtcblx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSB0aGlzLl9nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChzZXNzaW9uLCBhbmNob3JzLmRpcmVjdG9yeSk7XG5cdFx0aWYgKGFuY2hvcnMuYXBwbHlBZGRpdGlvbmFsKSB7XG5cdFx0XHQvLyBQcm92aXNpb25hbCAocHJlLXNlbmQpIG9yIHByZS1yZXN1bWU6IHRoZSBhbmNob3JzIGNhcnJ5IHRoZSBmdWxsIG9yZGVyZWRcblx0XHRcdC8vIHJvb3Qgc2V0LCBzbyBhbmNob3IgZGlzY292ZXJ5IHRvIGV2ZXJ5IHJvb3QgaW5zdGVhZCBvZiBjYWNoaW5nIGFcblx0XHRcdC8vIHByaW1hcnktb25seSBlbnRyeS4gU2tpcHBlZCBmb3IgYSBsaXZlIHNlc3Npb24gKGl0cyB0YWlsIGlzIGFscmVhZHkgc2V0XG5cdFx0XHQvLyBieSBtYXRlcmlhbGl6ZS9yZXN1bWUgXHUyMDE0IGRvIG5vdCBjbG9iYmVyIGl0KS5cblx0XHRcdGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldEFkZGl0aW9uYWxEaXJlY3RvcmllcyhhbmNob3JzLmFkZGl0aW9uYWxEaXJlY3Rvcmllcyk7XG5cdFx0fVxuXHRcdGNvbnN0IGZyb21QbHVnaW5zID0gYXdhaXQgYWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIuZ2V0Q3VzdG9taXphdGlvbnNTZXR0bGVkKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYXQgPSB0aGlzLl9maW5kU2Vzc2lvbkNoYXQoc2Vzc2lvbik7XG5cdFx0Y29uc3QgdG9wTGV2ZWxNY3AgPSBhY3RpdmVDbGllbnQucGx1Z2luQ29udHJvbGxlci5yZXNvbHZlVG9wTGV2ZWxNY3BDdXN0b21pemF0aW9ucyhcblx0XHRcdHNlc3Npb25DaGF0Py50b3BMZXZlbE1jcEN1c3RvbWl6YXRpb25zKCkgPz8gW10sXG5cdFx0XHRzZXNzaW9uQ2hhdD8ubWNwU2VydmVyT3duZXJzPy4oKSxcblx0XHQpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gWy4uLmZyb21QbHVnaW5zLCAuLi50b3BMZXZlbE1jcF07XG5cdFx0cmV0dXJuIGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudChjdXN0b21pemF0aW9ucywgdGhpcy5fcmV0YWluZWRIb3N0Q3VzdG9taXphdGlvbnMoc2Vzc2lvbikpO1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdChzZXNzaW9uOiBVUkksIHNlcnZlck5hbWU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZpbmRTZXNzaW9uQ2hhdChzZXNzaW9uKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCBub3QgZm91bmQ6IG5vIGFjdGl2ZSBzZXNzaW9uICR7QWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnkuaGFuZGxlTWNwUmVxdWVzdChzZXJ2ZXJOYW1lLCBtZXRob2QsIHBhcmFtcyk7XG5cdH1cblxuXHRnZXRNY3BTZXJ2ZXJPd25lcnMoc2Vzc2lvbjogVVJJKTogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZFNlc3Npb25DaGF0KHNlc3Npb24pPy5tY3BTZXJ2ZXJPd25lcnMoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0TWNwU2VydmVyKHNlc3Npb246IFVSSSwgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2ZpbmRTZXNzaW9uQ2hhdChzZXNzaW9uKT8uc3RhcnRNY3BTZXJ2ZXIoaWQpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihzZXNzaW9uOiBVUkksIGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9maW5kU2Vzc2lvbkNoYXQoc2Vzc2lvbik/LnN0b3BNY3BTZXJ2ZXIoaWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBnYXRlZCBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgcm9vdHMgZm9yIGEgc2Vzc2lvbjogdGhlIHRhaWwgb2YgdGhlXG5cdCAqIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IHdoZW4gbXVsdGktcm9vdCBpcyBlbmFibGVkLCBlbHNlIGVtcHR5IChzb1xuXHQgKiBzaW5nbGUtcm9vdCAvIGZsYWctb2ZmIGlzIGJ5dGUtaWRlbnRpY2FsKS4gVXNlZCBib3RoIHRvIGFuY2hvclxuXHQgKiBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSBhbmQgdG8gcG9wdWxhdGUgdGhlIGxhdW5jaCBwbGFuJ3Ncblx0ICogYGFkZGl0aW9uYWxEaXJlY3Rvcmllc2AsIGtlZXBpbmcgdGhlIFNESydzIGdyYW50ZWQgcm9vdHMgYW5kIGRpc2NvdmVyeSBpblxuXHQgKiBsb2Nrc3RlcCBcdTIwMTQgc28gYSBzZXNzaW9uIGNyZWF0ZWQgd2hpbGUgbXVsdGktcm9vdCB3YXMgZW5hYmxlZCBmYWxscyBiYWNrIHRvXG5cdCAqIGEgc2luZ2xlIHJvb3Qgd2hlbiByZXN1bWVkIGFmdGVyIHRoZSBmbGFnIGlzIHR1cm5lZCBvZmYuXG5cdCAqL1xuXHRwcml2YXRlIF9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiByZWFkb25seSBVUklbXSB7XG5cdFx0aWYgKCF0aGlzLl9pc011bHRpUm9vdEVuYWJsZWQoKSB8fCAhd29ya2luZ0RpcmVjdG9yaWVzIHx8IHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBjdXN0b21pemF0aW9uIGFuY2hvcihzKSBmb3IgYSBzZXNzaW9uLiBgZGlyZWN0b3J5YCBpcyB0aGVcblx0ICogcHJpbWFyeSAoaW5kZXggMCkgYW5jaG9yIFx1MjAxNCB0aGUgd29ya3RyZWUgZm9yIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb25zLlxuXHQgKiBgYWRkaXRpb25hbERpcmVjdG9yaWVzYCBhcmUgdGhlIG5vbi1wcmltYXJ5IHJvb3RzIHRvIGF0dGFjaCB0byBkaXNjb3ZlcnksXG5cdCAqIGFuZCBhcmUgYXBwbGllZCBvbmx5IHdoZW4gYGFwcGx5QWRkaXRpb25hbGAgaXMgdHJ1ZTpcblx0ICogLSAqKnByb3Zpc2lvbmFsKiogKHByZS1zZW5kKSBzZXNzaW9ucyBjYXJyeSB0aGUgY2xpZW50LXN1cHBsaWVkIHNldCwgd2hvc2Vcblx0ICogICBub24tcHJpbWFyeSBmb2xkZXJzIGFyZSBzdGFibGUgd29ya3NwYWNlIGZvbGRlcnMgdGhhdCBjYW4gYmUgZGlzY292ZXJlZFxuXHQgKiAgIGltbWVkaWF0ZWx5ICh0aGUgd29ya3RyZWUsIGlmIGFueSwgb25seSBhZmZlY3RzIGluZGV4IDAgYXQgc2VuZCk7XG5cdCAqIC0gKipub3QteWV0LWxpdmUqKiBzZXNzaW9ucyBjYXJyeSB0aGUgcGVyc2lzdGVkIHNldCBmcm9tIG1ldGFkYXRhO1xuXHQgKiAtICoqbGl2ZSoqIChhY3RpdmUpIHNlc3Npb25zIG1hbmFnZSB0aGVpciBvd24gdGFpbCB2aWEgbWF0ZXJpYWxpemUvcmVzdW1lLFxuXHQgKiAgIHNvIGBhcHBseUFkZGl0aW9uYWxgIGlzIGZhbHNlIHRvIGF2b2lkIGNsb2JiZXJpbmcgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9nZXRTZXNzaW9uQ3VzdG9taXphdGlvbkFuY2hvcnMoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx7IHJlYWRvbmx5IGRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkOyByZWFkb25seSBhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdOyByZWFkb25seSBhcHBseUFkZGl0aW9uYWw6IGJvb2xlYW4gfT4ge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKHByb3Zpc2lvbmFsKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXJlY3Rvcnk6IHByb3Zpc2lvbmFsLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdGFkZGl0aW9uYWxEaXJlY3RvcmllczogdGhpcy5fYWRkaXRpb25hbEN1c3RvbWl6YXRpb25EaXJlY3Rvcmllcyhwcm92aXNpb25hbC53b3JraW5nRGlyZWN0b3JpZXMpLFxuXHRcdFx0XHRhcHBseUFkZGl0aW9uYWw6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2ZpbmRTZXNzaW9uQ2hhdChzZXNzaW9uKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdC8vIEZvciBub24tcHJvdmlzaW9uYWwgc2Vzc2lvbnMgdGhlIGFuY2hvciBmb2xsb3dzIHRoZSB3b3JraW5nIGRpcmVjdG9yeVxuXHRcdFx0Ly8gKHRoZSB3b3JrdHJlZSkuIFByZWZlciBpdCBvdmVyIGEgcGVyc2lzdGVkIGBjdXN0b21pemF0aW9uRGlyZWN0b3J5YCxcblx0XHRcdC8vIHdoaWNoIG9sZGVyIHNlc3Npb25zIHN0b3JlZCBhcyB0aGUgb3JpZ2luYWwgdXNlci1waWNrZWQgZm9sZGVyLlxuXHRcdFx0cmV0dXJuIHsgZGlyZWN0b3J5OiBlbnRyeS5jdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IFtdLCBhcHBseUFkZGl0aW9uYWw6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlyZWN0b3J5OiBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3J5ID8/IG1ldGFkYXRhLmN1c3RvbWl6YXRpb25EaXJlY3RvcnksXG5cdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMobWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdGFwcGx5QWRkaXRpb25hbDogdHJ1ZSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgYXV0aGVudGljYXRlKHJlc291cmNlOiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAocmVzb3VyY2UgPT09IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKS5yZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZSAhPT0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUmVxdWlyZWQuc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdGF3YWl0IHRoaXMuX2FwcGx5R2l0SHViVG9rZW4odG9rZW4gfHwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5R2l0SHViVG9rZW4odG9rZW46IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9naXRodWJUb2tlbiA9PT0gdG9rZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQXV0aCB0b2tlbiAke3Rva2VuID8gJ3VwZGF0ZWQnIDogJ2NsZWFyZWQnfWApO1xuXHRcdHRoaXMuX2dpdGh1YlRva2VuID0gdG9rZW47XG5cdFx0dGhpcy5fdXBkYXRlUmVzdHJpY3RlZFRlbGVtZXRyeSh0b2tlbik7XG5cdFx0aWYgKCF0b2tlbikge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVxdWVzdENsaWVudFJlc3RhcnQoJ0dpdEh1YiBhdXRoZW50aWNhdGlvbiBjbGVhcmVkJyk7XG5cdFx0XHR2b2lkIHRoaXMuX3NjaGVkdWxlTW9kZWxSZWZyZXNoKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhvc3QgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0RW50ZXJwcmlzZVVyaSgpID8/ICdodHRwczovL2dpdGh1Yi5jb20nO1xuXHRcdGxldCByZXN0YXJ0UmVxdWlyZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlc3Npb24udXBkYXRlR2l0SHViQ3JlZGVudGlhbHMoaG9zdCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0cmVzdGFydFJlcXVpcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBHaXRIdWIgY3JlZGVudGlhbCB1cGRhdGUgd2FzIHJlamVjdGVkOyBzY2hlZHVsaW5nIGEgc2FmZSBDb3BpbG90Q2xpZW50IHJlc3RhcnRgKTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQuY29waWxvdFVzZXJSZXNvbHZlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbi5zZXNzaW9uSWR9XSBHaXRIdWIgY3JlZGVudGlhbHMgd2VyZSB1cGRhdGVkLCBidXQgQ29waWxvdCB1c2VyIG1ldGFkYXRhIGNvdWxkIG5vdCBiZSByZXNvbHZlZDsgcGxhbiwgcXVvdGEsIGFuZCBiaWxsaW5nIG1ldGFkYXRhIG1heSBiZSBkZWdyYWRlZC4gUmVhdXRoZW50aWNhdGUgdG8gcmVzdG9yZSBpdC5gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0cmVzdGFydFJlcXVpcmVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb24uc2Vzc2lvbklkfV0gRmFpbGVkIHRvIHVwZGF0ZSBHaXRIdWIgY3JlZGVudGlhbHM7IHNjaGVkdWxpbmcgYSBzYWZlIENvcGlsb3RDbGllbnQgcmVzdGFydDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdGFydFJlcXVpcmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXF1ZXN0Q2xpZW50UmVzdGFydCgnR2l0SHViIGNyZWRlbnRpYWwgdXBkYXRlIGZhaWxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXN0YXJ0Q2xpZW50SWZQcm94eUNoYW5nZWQoKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVzb2x2ZUNvcGlsb3RTa3UodG9rZW4pO1xuXHRcdHZvaWQgdGhpcy5fc2NoZWR1bGVNb2RlbFJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUNvcGlsb3RTZXNzaW9uQXV0aFJlcXVpcmVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUmVxdWlyZWQuc2V0KHtcblx0XHRcdHJlc291cmNlOiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0Q29waWxvdFJlc291cmNlKCksXG5cdFx0XHRyZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5FeHBpcmVkLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ29waWxvdFNrdShnaXRodWJUb2tlbjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvcGlsb3RTa3UgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlQ29waWxvdFNrdT8uKGdpdGh1YlRva2VuKTtcblx0XHRcdGlmIChjb3BpbG90U2t1ICYmIHRoaXMuX2dpdGh1YlRva2VuID09PSBnaXRodWJUb2tlbikge1xuXHRcdFx0XHQvLyBfX0dEUFJfX0NPTU1PTl9fIFwiY29waWxvdFNrdVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJjb21tZW50XCI6IFwiVGhlIHJhdyBDb3BpbG90IGVudGl0bGVtZW50IFNLVSBvZiB0aGUgYXV0aGVudGljYXRlZCBHaXRIdWIgYWNjb3VudC5cIiB9XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2Uuc2V0Q29tbW9uUHJvcGVydHkoJ2NvcGlsb3RTa3UnLCBjb3BpbG90U2t1KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtDb3BpbG90XSBTS1UgcmVzb2x1dGlvbiBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGhhbmRsZUF1dGhlbnRpY2F0aW9uVG9rZW4ocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgaGFuZGxlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9hbGxMaXZlU2Vzc2lvbnMoKSkge1xuXHRcdFx0Y29uc3QgZGlkSGFuZGxlID0gYXdhaXQgc2Vzc2lvbi5yZXNvbHZlTWNwQXV0aGVudGljYXRpb24ocGFyYW1zKTtcblx0XHRcdGhhbmRsZWQgfHw9IGRpZEhhbmRsZTtcblx0XHR9XG5cdFx0cmV0dXJuIGhhbmRsZWQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVSZXN0cmljdGVkVGVsZW1ldHJ5KGdpdGh1YlRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBTYWZlIGRlZmF1bHQgc3luY2hyb25vdXNseToga2VlcCByZXN0cmljdGVkL2VuaGFuY2VkIHRlbGVtZXRyeSBkaXNhYmxlZCB1bnRpbCB0aGUgbWludGVkXG5cdFx0Ly8gQ0FQSSBDb3BpbG90IHNlc3Npb24gdG9rZW4gY29uZmlybXMgdGhlIGBydD0xYCBvcHQtaW4uIFRoZSBHaXRIdWIgdG9rZW4gaGVyZSBjYXJyaWVzIG5vXG5cdFx0Ly8gYHJ0YC9gdGlkYCBjbGFpbXMgXHUyMDE0IHRob3NlIGxpdmUgaW4gdGhlIENvcGlsb3Qgc2Vzc2lvbiB0b2tlbiwgd2hpY2ggdGhlIEFQSSBzZXJ2aWNlIG1pbnRzIFx1MjAxNFxuXHRcdC8vIHNvIHRoZSByZWFsIHZhbHVlcyBhcmUgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHkgYmVsb3cuIE1pcnJvcnMgaG93IHRoZSBDb3BpbG90IGV4dGVuc2lvblxuXHRcdC8vIHJlYWRzIGBydGAvYHRpZGAgb2ZmIGl0cyBgQ29waWxvdFRva2VuYCByYXRoZXIgdGhhbiB0aGUgR2l0SHViIHRva2VuLlxuXHRcdHRoaXMuX2FwcGx5UmVzdHJpY3RlZFRlbGVtZXRyeSh1bmRlZmluZWQpO1xuXHRcdGlmIChnaXRodWJUb2tlbikge1xuXHRcdFx0dm9pZCB0aGlzLl9yZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeShnaXRodWJUb2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnkoZ2l0aHViVG9rZW46IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjdHggPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoZ2l0aHViVG9rZW4pO1xuXHRcdFx0aWYgKHRoaXMuX2dpdGh1YlRva2VuICE9PSBnaXRodWJUb2tlbikge1xuXHRcdFx0XHRyZXR1cm47IC8vIHRva2VuIGNoYW5nZWQgd2hpbGUgcmVzb2x2aW5nOyBhIG5ld2VyIGNhbGwgb3ducyB0aGUgc3RhdGVcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FwcGx5UmVzdHJpY3RlZFRlbGVtZXRyeSh7XG5cdFx0XHRcdC4uLmN0eCxcblx0XHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IHRvUmVzdHJpY3RlZFRlbGVtZXRyeUVuZHBvaW50KGN0eC50ZWxlbWV0cnlFbmRwb2ludCksXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtDb3BpbG90XSBSZXN0cmljdGVkIHRlbGVtZXRyeSByZXNvbHV0aW9uIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlSZXN0cmljdGVkVGVsZW1ldHJ5KGNvbnRleHQ6IElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJ0RW5hYmxlZCA9IGNvbnRleHQ/LnJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkID09PSB0cnVlO1xuXHRcdGlmIChydEVuYWJsZWQgIT09IHRoaXMuX3Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKSB7XG5cdFx0XHR0aGlzLl9yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCA9IHJ0RW5hYmxlZDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIEVuaGFuY2VkIChyZXN0cmljdGVkKSB0ZWxlbWV0cnkgJHtydEVuYWJsZWQgPyAnZW5hYmxlZCBmb3IgdGhpcyBhY2NvdW50JyA6ICdkaXNhYmxlZCd9YCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc3RyaWN0ZWRUZWxlbWV0cnkuZmlyZSgpO1xuXHRcdH1cblx0XHQvLyBQdXNoIHRoZSB0b2tlbi1kZXJpdmVkIHRlbGVtZXRyeSBwb2xpY3kvaWRlbnRpdHkgdG8gdGhlIHJlc3RyaWN0ZWQgc2VuZGVyOiBgcnRgIGdhdGVzXG5cdFx0Ly8gZW5oYW5jZWQgR0ggdGVsZW1ldHJ5IChrZXB0IG9mZiBmb3IgcHVibGljIHVzZXJzKSwgYHRpZGAgYmVjb21lcyBgY29waWxvdF90cmFja2luZ0lkYCwgYW5kXG5cdFx0Ly8gdGhlIGVuZHBvaW50IHJvdXRlcyBhdCB0aGUgdXNlcidzIENBUEkgdGVsZW1ldHJ5IGhvc3QgKGRvdGNvbSwgR0hFLCBvciBwcm94eSkuXG5cdFx0aWYgKGlzQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKSkge1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5zZXRSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZChydEVuYWJsZWQpO1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5zZXRDb3BpbG90VHJhY2tpbmdJZChjb250ZXh0Py50cmFja2luZ0lkKTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2Uuc2V0UmVzdHJpY3RlZFRlbGVtZXRyeUVuZHBvaW50KGNvbnRleHQ/LnRlbGVtZXRyeUVuZHBvaW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yb3V0ZUdpdEh1YlRlbGVtZXRyeShub3RpZmljYXRpb246IEdpdEh1YlRlbGVtZXRyeU5vdGlmaWNhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxQcm9wZXJ0aWVzID0geyBpbml0aWF0b3JDbGllbnRUeXBlOiB0aGlzLl9jbGllbnRUeXBlRm9yVGVsZW1ldHJ5KG5vdGlmaWNhdGlvbi5zZXNzaW9uSWQpIH07XG5cdFx0Y29uc3Qgcm91dGVyID0gdGhpcy5fZ2l0aHViVGVsZW1ldHJ5Um91dGVyO1xuXHRcdGlmICghcm91dGVyPy5pc1RhcmdldChub3RpZmljYXRpb24pKSB7XG5cdFx0XHR0aGlzLl9naXRIdWJUZWxlbWV0cnlGb3J3YXJkZXIuZm9yd2FyZChub3RpZmljYXRpb24sIHRoaXMuX3R1cm5JZEZvclRlbGVtZXRyeShub3RpZmljYXRpb24uc2Vzc2lvbklkKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghbm90aWZpY2F0aW9uLnJlc3RyaWN0ZWQpIHtcblx0XHRcdGF3YWl0IHJvdXRlci5yb3V0ZShub3RpZmljYXRpb24sIHVuZGVmaW5lZCwgYWRkaXRpb25hbFByb3BlcnRpZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IG5vdGlmaWNhdGlvbi5zZXNzaW9uSWQ7XG5cdFx0Y29uc3QgZ2l0aHViVG9rZW4gPSB0aGlzLl9naXRodWJUb2tlbjtcblx0XHRpZiAoIWdpdGh1YlRva2VuKSB7XG5cdFx0XHRhd2FpdCByb3V0ZXIucm91dGUobm90aWZpY2F0aW9uLCB1bmRlZmluZWQsIGFkZGl0aW9uYWxQcm9wZXJ0aWVzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLnJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dChnaXRodWJUb2tlbik7XG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gIT09IGdpdGh1YlRva2VuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHJvdXRlci5yb3V0ZShub3RpZmljYXRpb24sIHtcblx0XHRcdFx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGNvbnRleHQucmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQsXG5cdFx0XHRcdHRyYWNraW5nSWQ6IGNvbnRleHQudHJhY2tpbmdJZCxcblx0XHRcdFx0dGVsZW1ldHJ5RW5kcG9pbnQ6IHRvUmVzdHJpY3RlZFRlbGVtZXRyeUVuZHBvaW50KGNvbnRleHQudGVsZW1ldHJ5RW5kcG9pbnQpLFxuXHRcdFx0XHRpc0ludGVybmFsOiBjb250ZXh0LmlzSW50ZXJuYWwgPT09IHRydWUsXG5cdFx0XHRcdHVzZXJOYW1lOiBjb250ZXh0LnVzZXJOYW1lLFxuXHRcdFx0XHRpc1ZzY29kZVRlYW1NZW1iZXI6IGNvbnRleHQuaXNWc2NvZGVUZWFtTWVtYmVyID09PSB0cnVlLFxuXHRcdFx0fSwgYWRkaXRpb25hbFByb3BlcnRpZXMpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFJlc3RyaWN0ZWQgdGVsZW1ldHJ5IGNvbnRleHQgcmVzb2x1dGlvbiBmYWlsZWQ7IGRyb3BwaW5nICR7bm90aWZpY2F0aW9uLmV2ZW50LmtpbmR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGllbnRUeXBlRm9yVGVsZW1ldHJ5KHNka1Nlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogQWdlbnRIb3N0Q2xpZW50VHlwZSB7XG5cdFx0cmV0dXJuIHNka1Nlc3Npb25JZFxuXHRcdFx0PyB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoc2RrU2Vzc2lvbklkKT8uY3VycmVudFR1cm5DbGllbnRUeXBlID8/IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93blxuXHRcdFx0OiBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd247XG5cdH1cblxuXHRwcml2YXRlIF90dXJuSWRGb3JUZWxlbWV0cnkoc2RrU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBzZGtTZXNzaW9uSWQgPyB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoc2RrU2Vzc2lvbklkKT8uY3VycmVudFR1cm5JZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiB7QGxpbmsgSUFnZW50LnJlZnJlc2hNb2RlbHN9LiBDb2FsZXNjZXMgb250byBhbiBpbi1mbGlnaHQgcmVmcmVzaCBhbmRcblx0ICogbmV2ZXIgcmVqZWN0cyBcdTIwMTQge0BsaW5rIF9yZWZyZXNoTW9kZWxzfSBhbHJlYWR5IGxvZ3MgYW5kIHJldGFpbnMgdGhlIGxhc3Rcblx0ICoga25vd24tZ29vZCBsaXN0IG9uIGZhaWx1cmUuXG5cdCAqXG5cdCAqIE9ubHkgc2FmZSBmb3IgY2FsbGVycyB3aXRoIG5vIG5ldyBpbnB1dCB0byBhcHBseSAodGhlIGhvc3QncyBwZXJpb2RpY1xuXHQgKiBzY2hlZHVsZXIpLiBUcmlnZ2VycyB0aGF0IGludmFsaWRhdGUgdGhlIGluLWZsaWdodCByZXF1ZXN0IFx1MjAxNCBhIHJvdGF0ZWRcblx0ICogdG9rZW4sIGEgcmVzdGFydGVkIGNsaWVudCBcdTIwMTQgbXVzdCBjYWxsIHtAbGluayBfc2NoZWR1bGVNb2RlbFJlZnJlc2h9IHNvIHRoZXlcblx0ICogYXJlIG5vdCBhbnN3ZXJlZCBieSBhIHJlZnJlc2ggYm91bmQgdG8gdGhlIHN1cGVyc2VkZWQgaW5wdXQuXG5cdCAqL1xuXHRyZWZyZXNoTW9kZWxzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2g/LmRlZmVycmVkLnAgPz8gdGhpcy5fbW9kZWxSZWZyZXNoSW5GbGlnaHQgPz8gdGhpcy5fc3RhcnRNb2RlbFJlZnJlc2goKyt0aGlzLl9tb2RlbENhdGFsb2dHZW5lcmF0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnZhbGlkYXRlcyBhbiBpbi1mbGlnaHQgcmVmcmVzaCBpbW1lZGlhdGVseSwgdGhlbiBzdGFydHMgb25lIHJlZnJlc2ggb25cblx0ICogdGhlIG5leHQgdGFzay4gUmVwZWF0ZWQgbGlmZWN5Y2xlIHRyaWdnZXJzIGJlZm9yZSB0aGF0IHRhc2tcblx0ICogc2hhcmUgdGhlIHNhbWUgZGVmZXJyZWQgYW5kIGVudW1lcmF0ZSBvbmx5IHRoZSBmaW5hbCB0b2tlbi9jbGllbnQgc291cmNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVNb2RlbFJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2VuZXJhdGlvbiA9ICsrdGhpcy5fbW9kZWxDYXRhbG9nR2VuZXJhdGlvbjtcblx0XHRpZiAodGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZWRNb2RlbFJlZnJlc2guZ2VuZXJhdGlvbiA9IGdlbmVyYXRpb247XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoLmRlZmVycmVkLnA7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZWR1bGVkID0geyBkZWZlcnJlZDogbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpLCBnZW5lcmF0aW9uIH07XG5cdFx0dGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoID0gc2NoZWR1bGVkO1xuXHRcdHRoaXMuX21vZGVsUmVmcmVzaFNjaGVkdWxlLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dm9pZCAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIEEgY29uZmlnLXRyaWdnZXJlZCByZXN0YXJ0IGNsZWFycyBgX2NsaWVudGAgYmVmb3JlIGl0c1xuXHRcdFx0XHRcdC8vIGFzeW5jaHJvbm91cyBgc3RvcCgpYCBjb21wbGV0ZXMuIFdhaXQgZm9yIHRoYXQgc3RvcCBzbyB0aGlzXG5cdFx0XHRcdFx0Ly8gcmVmcmVzaCBjYW5ub3QgcmVzdXJyZWN0IHRoZSBjbGllbnQgbWlkd2F5IHRocm91Z2ggdGVhcmRvd24uXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpZW50U3RvcHBpbmc7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaCAhPT0gc2NoZWR1bGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLl9tb2RlbFJlZnJlc2hTY2hlZHVsZS5jbGVhcigpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKHNjaGVkdWxlZC5nZW5lcmF0aW9uKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsICdbQ29waWxvdF0gRmFpbGVkIHRvIHNjaGVkdWxlIG1vZGVsIHJlZnJlc2gnKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoID09PSBzY2hlZHVsZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaFNjaGVkdWxlLmNsZWFyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNjaGVkdWxlZC5kZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSgpO1xuXHRcdH0sIDApO1xuXHRcdHJldHVybiBzY2hlZHVsZWQuZGVmZXJyZWQucDtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0TW9kZWxSZWZyZXNoKGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZnJlc2ggPSB0aGlzLl9yZWZyZXNoTW9kZWxzKDAsIGdlbmVyYXRpb24pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID09PSByZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gcmVmcmVzaDtcblx0XHRyZXR1cm4gcmVmcmVzaDtcblx0fVxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoTW9kZWxzKGF0dGVtcHQgPSAwLCBnZW5lcmF0aW9uID0gdGhpcy5fbW9kZWxDYXRhbG9nR2VuZXJhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEEgZnJlc2ggcmVmcmVzaCAoZS5nLiBhIHRva2VuIGNoYW5nZSkgc3VwZXJzZWRlcyBhbnkgc2NoZWR1bGVkIHJldHJ5LlxuXHRcdHRoaXMuX21vZGVsUmVmcmVzaFJldHJ5LmNsZWFyKCk7XG5cblx0XHQvLyBPbmNlIHRlYXJkb3duIGhhcyBiZWd1biwgc2tpcCB0aGUgcmVmcmVzaCBlbnRpcmVseTogYSByZXRyeSB0aW1lciB0aGF0XG5cdFx0Ly8gZmlyZXMgZHVyaW5nIHRoZSBzaHV0ZG93biB3aW5kb3cgd291bGQgb3RoZXJ3aXNlIGNhbGwgYF9lbnN1cmVDbGllbnQoKWBcblx0XHQvLyBhbmQgcmVzdXJyZWN0IHRoZSBTREsgc3VicHJvY2VzcyBhZnRlciBgc2h1dGRvd24oKWAgdG9yZSBpdCBkb3duLlxuXHRcdGlmICh0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0b2tlbkF0UmVmcmVzaFN0YXJ0ID0gdGhpcy5fZ2l0aHViVG9rZW47XG5cdFx0aWYgKCF0b2tlbkF0UmVmcmVzaFN0YXJ0KSB7XG5cdFx0XHR0aGlzLl9jYXBpTW9kZWxzID0gW107XG5cdFx0XHR0aGlzLl9wdWJsaXNoTW9kZWxzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLl9saXN0TW9kZWxzKHRva2VuQXRSZWZyZXNoU3RhcnQpO1xuXHRcdFx0aWYgKHRoaXMuX2dpdGh1YlRva2VuID09PSB0b2tlbkF0UmVmcmVzaFN0YXJ0ICYmIHRoaXMuX21vZGVsQ2F0YWxvZ0dlbmVyYXRpb24gPT09IGdlbmVyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fY2FwaU1vZGVscyA9IG1vZGVscztcblx0XHRcdFx0dGhpcy5fcHVibGlzaE1vZGVscygpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gVG9rZW4gcm90YXRlZCBtaWQtZmxpZ2h0IFx1MjAxNCBhIG5ld2VyIHJlZnJlc2ggb3ducyB0aGUgcmVzdWx0IFx1MjAxNCBvclxuXHRcdFx0Ly8gdGVhcmRvd24gYmVnYW4gd2hpbGUgdGhlIHJlcXVlc3Qgd2FzIGluIGZsaWdodCwgaW4gd2hpY2ggY2FzZSBhXG5cdFx0XHQvLyByZXRyeSB3b3VsZCBqdXN0IHJlc3VycmVjdCB0aGUgY2xpZW50IHdlIGFyZSB0ZWFyaW5nIGRvd24uXG5cdFx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4gIT09IHRva2VuQXRSZWZyZXNoU3RhcnQgfHwgdGhpcy5fbW9kZWxDYXRhbG9nR2VuZXJhdGlvbiAhPT0gZ2VuZXJhdGlvbiB8fCB0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKC9cXGI0MDFcXGIvLnRlc3QoZ2V0RXJyb3JNZXNzYWdlKGVycikpKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZUNvcGlsb3RTZXNzaW9uQXV0aFJlcXVpcmVkKCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWNvdmVyRnJvbUNsb3NlZENvbm5lY3Rpb24oZXJyLCAnbW9kZWxSZWZyZXNoJyk7XG5cdFx0XHRpZiAoYXR0ZW1wdCArIDEgPCB0aGlzLl9tb2RlbFJlZnJlc2hNYXhBdHRlbXB0cykge1xuXHRcdFx0XHRjb25zdCBkZWxheSA9IHRoaXMuX21vZGVsUmVmcmVzaEJhY2tvZmYoYXR0ZW1wdCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byByZWZyZXNoIG1vZGVscyAoYXR0ZW1wdCAke2F0dGVtcHQgKyAxfSksIHJldHJ5aW5nIGluICR7ZGVsYXl9bXNgLCBlcnIpO1xuXHRcdFx0XHR0aGlzLl9tb2RlbFJlZnJlc2hSZXRyeS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR2b2lkIHRoaXMuX3JlZnJlc2hNb2RlbHMoYXR0ZW1wdCArIDEsIGdlbmVyYXRpb24pO1xuXHRcdFx0XHR9LCBkZWxheSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJldHJpZXMgZXhoYXVzdGVkOiBzdXJmYWNlIHRoZSBlcnJvciBidXQga2VlcCB0aGUgbGFzdC1rbm93biBDQVBJXG5cdFx0XHQvLyBsaXN0IHNvIGEgdHJhbnNpZW50IGZhaWx1cmUgbmV2ZXIgd2lwZXMgYSBwcmV2aW91c2x5IGxvYWRlZCwgZ29vZFxuXHRcdFx0Ly8gbW9kZWwgbGlzdC4gUmVwdWJsaXNoIHNvIGEgY29uY3VycmVudGx5LXVwZGF0ZWQgQllPSyBsaXN0IHN0aWxsXG5cdFx0XHQvLyBzaG93cyB0aHJvdWdoLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsICdbQ29waWxvdF0gRmFpbGVkIHRvIHJlZnJlc2ggbW9kZWxzJyk7XG5cdFx0XHR0aGlzLl9wdWJsaXNoTW9kZWxzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWVtaXQgdGhlIG1lcmdlZCBDQVBJICsgQllPSyBtb2RlbCBsaXN0IHRvIHRoZSBwaWNrZXIuIEEgZnJlc2ggYXJyYXkgaXNcblx0ICogYWxsb2NhdGVkIGVhY2ggY2FsbCBzbyB0aGUgb2JzZXJ2YWJsZSBhbHdheXMgbm90aWZpZXMgaXRzIGNvbnN1bWVycy5cblx0ICovXG5cdHByaXZhdGUgX3B1Ymxpc2hNb2RlbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChbLi4udGhpcy5fY2FwaU1vZGVscywgLi4udGhpcy5fYnlva01vZGVsc10sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogKFJlKXB1Ymxpc2ggdGhlIHJlbmRlcmVyIEJZT0sgbW9kZWxzIGZyb20gdGhlIGJyaWRnZSByZWdpc3RyeSdzIHNlcnZpbmdcblx0ICogd2luZG93LiBUcmlnZ2VyZWQgd2hlbiBhbnkgcmVuZGVyZXIgYnJpZGdlIGNvbm5lY3RzLCBkaXNjb25uZWN0cywgb3Jcblx0ICogcmVwb3J0cyBhIG1vZGVsIGNoYW5nZSBcdTIwMTQgdGhlIHJlZ2lzdHJ5IG93bnMgZW51bWVyYXRpb24gKHdpdGggaXRzIG93blxuXHQgKiBjb25uZWN0LXRpbWUgcmV0cnkpIGFuZCBjYWNoZXMgdGhlIHNlcnZpbmcgd2luZG93J3MgbW9kZWxzLCBzbyB0aGlzIGlzIGFcblx0ICogY2hlYXAgc3luY2hyb25vdXMgcmVhZCBvZiB0aGF0IGNhY2hlLlxuXHQgKlxuXHQgKiBFYWNoIG1vZGVsIGlzIHN1cmZhY2VkIHVuZGVyIHRoZSBwcm92aWRlci1xdWFsaWZpZWQgaWQgYHZlbmRvci9bZ3JvdXAvXWlkYCBzbyBhXG5cdCAqIHNlbGVjdGlvbiByb3VuZC10cmlwcyB0byB0aGUgcGVyLXNlc3Npb24gcHJvdmlkZXIgY29uZmlnIHN5bnRoZXNpemVkIGJ5XG5cdCAqIGByZXNvbHZlQnlva1Nlc3Npb25Db25maWdgLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVmcmVzaEJ5b2tNb2RlbHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9ieW9rTW9kZWxzID0gdGhpcy5fYnlva0JyaWRnZVJlZ2lzdHJ5LmdldE1vZGVscygpLm1hcCgobSk6IElBZ2VudE1vZGVsSW5mbyA9PiB7XG5cdFx0XHRjb25zdCBieW9rTWV0YSA9IGNyZWF0ZUFnZW50TW9kZWxCeW9rTWV0YShtLm1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHRjb25zdCB0aGlua2luZ0xldmVsID0gdGhpcy5fY3JlYXRlVGhpbmtpbmdMZXZlbENvbmZpZ1NjaGVtYVByb3BlcnR5KG0uc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cywgbS5kZWZhdWx0UmVhc29uaW5nRWZmb3J0LCBtLmlkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0XHRpZDogZ2V0Qnlva0xtQWdlbnRNb2RlbElkKG0pLFxuXHRcdFx0XHRuYW1lOiBtLm5hbWUgPz8gbS5pZCxcblx0XHRcdFx0bWF4Q29udGV4dFdpbmRvdzogbS5tYXhDb250ZXh0V2luZG93VG9rZW5zLFxuXHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogbS5zdXBwb3J0c1Zpc2lvbiA/PyBmYWxzZSxcblx0XHRcdFx0Li4uKHRoaW5raW5nTGV2ZWwgPyB7IGNvbmZpZ1NjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBbVGhpbmtpbmdMZXZlbENvbmZpZ0tleV06IHRoaW5raW5nTGV2ZWwgfSB9IHNhdGlzZmllcyBDb25maWdTY2hlbWEgfSA6IHt9KSxcblx0XHRcdFx0Li4uKGJ5b2tNZXRhICYmIHsgX21ldGE6IGJ5b2tNZXRhIH0pLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdF0gRm91bmQgJHt0aGlzLl9ieW9rTW9kZWxzLmxlbmd0aH0gQllPSyBtb2RlbHMke3RoaXMuX2J5b2tNb2RlbHMubGVuZ3RoID8gJzogJyArIHRoaXMuX2J5b2tNb2RlbHMubWFwKG0gPT4gbS5uYW1lKS5qb2luKCcsICcpIDogJyd9YCk7XG5cdFx0dGhpcy5fcHVibGlzaE1vZGVscygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVxdWFsLWppdHRlciBleHBvbmVudGlhbCBiYWNrb2ZmIGZvciBtb2RlbC1yZWZyZXNoIHJldHJpZXMuIERvdWJsZXMgdGhlXG5cdCAqIGJhc2UgZGVsYXkgcGVyIGF0dGVtcHQgKGNhcHBlZCBhdCB7QGxpbmsgX21vZGVsUmVmcmVzaE1heERlbGF5TXN9KSBhbmRcblx0ICogcGlja3MgYSByYW5kb20gcG9pbnQgaW4gdGhlIHVwcGVyIGhhbGYgb2YgdGhhdCB3aW5kb3csIHNvIHRoZSByZXR1cm5lZFxuXHQgKiBkZWxheSBsYW5kcyBpbiBgW2V4cC8yLCBleHBdYC4gVGhlIGppdHRlciBhdm9pZHMgc3luY2hyb25pemVkIHJldHJpZXNcblx0ICogYWNyb3NzIHdpbmRvd3MvYWdlbnRzIGhpdHRpbmcgYSBzaGFyZWQgcmF0ZSBsaW1pdCwgd2hpbGUgdGhlIGBleHAvMmBcblx0ICogZmxvb3Iga2VlcHMgYSBtaW5pbXVtIHNwYWNpbmcgYmV0d2VlbiBhdHRlbXB0cy5cblx0ICovXG5cdHByaXZhdGUgX21vZGVsUmVmcmVzaEJhY2tvZmYoYXR0ZW1wdDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBleHAgPSBNYXRoLm1pbih0aGlzLl9tb2RlbFJlZnJlc2hNYXhEZWxheU1zLCB0aGlzLl9tb2RlbFJlZnJlc2hCYXNlRGVsYXlNcyAqIDIgKiogYXR0ZW1wdCk7XG5cdFx0cmV0dXJuIE1hdGgucm91bmQoZXhwIC8gMiArIE1hdGgucmFuZG9tKCkgKiAoZXhwIC8gMikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcENsaWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBBbnkgcGFya2VkIHJlc3RhcnQgaXMgc2F0aXNmaWVkIGJ5IHRoaXMgc3RvcDogdGhlIG5leHQgYF9lbnN1cmVDbGllbnRgXG5cdFx0Ly8gc3RhcnRzIGZyb20gdGhlIGN1cnJlbnQgY29uZmlnLCBzbyBub3RoaW5nIGlzIGxlZnQgdG8gcmUtYXBwbHkuIENsZWFyZWRcblx0XHQvLyBzeW5jaHJvbm91c2x5IHNvIGEgY29uY3VycmVudCBgX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnRgIGJhaWxzIHJhdGhlclxuXHRcdC8vIHRoYW4gc3RvcHBpbmcgYSBjbGllbnQgdGhpcyBjYWxsIGlzIGFscmVhZHkgdGVhcmluZyBkb3duLlxuXHRcdHRoaXMuX3BlbmRpbmdDbGllbnRSZXN0YXJ0UmVhc29ucy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9jbGllbnRTdG9wcGluZykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NsaWVudFN0b3BwaW5nO1xuXHRcdH1cblx0XHRjb25zdCBzdG9wcGluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnRTdGFydGluZyA9IHRoaXMuX2NsaWVudFN0YXJ0aW5nO1xuXHRcdFx0aWYgKGNsaWVudFN0YXJ0aW5nKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgY2xpZW50U3RhcnRpbmc7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEEgZmFpbGVkL3N0YWxlIHN0YXJ0IG93bnMgaXRzIG93biBjbGVhbnVwLiBDb250aW51ZSBzb1xuXHRcdFx0XHRcdC8vIGFueSBjbGllbnQgaXQgbWFuYWdlZCB0byBwdWJsaXNoIGlzIHN0aWxsIHN0b3BwZWQgYmVsb3cuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGNsaWVudCA9IHRoaXMuX2NsaWVudDtcblx0XHRcdHRoaXMuX2NsaWVudCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2NsaWVudFN0YXJ0aW5nID0gdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgY2xpZW50Py5zdG9wKCk7XG5cdFx0XHQvLyBUaGUgcnVudGltZSBzdWJwcm9jZXNzIGlzIG5vdyBkZWFkLCBzbyBpdCBpcyBzYWZlIHRvIHJlbGVhc2UgdGhlIEJZT0tcblx0XHRcdC8vIHByb3h5IGhhbmRsZTogdGhlIG5leHQgc2Vzc2lvbiBsYXVuY2ggbWludHMgYSBmcmVzaCBub25jZS4gU2VlIHRoZVxuXHRcdFx0Ly8gb3duZXJzaGlwIGludmFyaWFudCBvbiBgQ29waWxvdFNlc3Npb25MYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlYC5cblx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25MYXVuY2hlci5kaXNwb3NlQnlva1Byb3h5SGFuZGxlKCk7XG5cdFx0fSkoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jbGllbnRTdG9wcGluZyA9PT0gc3RvcHBpbmcpIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50U3RvcHBpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fY2xpZW50U3RvcHBpbmcgPSBzdG9wcGluZztcblx0XHRyZXR1cm4gc3RvcHBpbmc7XG5cdH1cblxuXHQvLyAtLS0tIGNsaWVudCBsaWZlY3ljbGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlQ2xpZW50KCk6IFByb21pc2U8Q29waWxvdENsaWVudD4ge1xuXHRcdGlmICh0aGlzLl9zaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHR3aGlsZSAodGhpcy5fY2xpZW50U3RvcHBpbmcpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NsaWVudFN0b3BwaW5nO1xuXHRcdFx0aWYgKHRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NsaWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NsaWVudDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NsaWVudFN0YXJ0aW5nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2xpZW50U3RhcnRpbmc7XG5cdFx0fVxuXHRcdC8vIFNuYXBzaG90IHRoZSBzdGFydHVwIGNvbmZpZyBzbyB3ZSBjYW4gZGV0ZWN0IGEgY2hhbmdlIHRoYXQgbGFuZHMgd2hpbGUgdGhlXG5cdFx0Ly8gY2xpZW50IGlzIHN0aWxsIHN0YXJ0aW5nIGFuZCBhYm9ydCB0aGUgc3RhbGUgc3RhcnQgKHRoZSB2YWx1ZXMgYXJlIGJha2VkXG5cdFx0Ly8gaW50byB0aGUgY2xpZW50IG9wdGlvbnMgLyBzdWJwcm9jZXNzIGVudiBiZWxvdykuXG5cdFx0Y29uc3Qgc2Vzc2lvblN5bmNBdFN0YXJ0dXAgPSB0aGlzLl9pc1Nlc3Npb25TeW5jRW5hYmxlZCgpO1xuXHRcdGNvbnN0IHJ1YmJlckR1Y2tBdFN0YXJ0dXAgPSB0aGlzLl9pc1J1YmJlckR1Y2tFbmFibGVkKCk7XG5cdFx0Y29uc3QgY29waWxvdFNka0xvZ0xldmVsU2V0dGluZ0F0U3RhcnR1cCA9IHRoaXMuX2dldENvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmcoKTtcblx0XHRjb25zdCBlbnRlcnByaXNlSG9zdEF0U3RhcnR1cCA9IHRoaXMuX2dldEVudGVycHJpc2VIb3N0KCk7XG5cdFx0Y29uc3Qgc3lzdGVtUHJveHlFbmFibGVkQXRTdGFydHVwID0gdGhpcy5faXNTeXN0ZW1Qcm94eUVuYWJsZWQoKTtcblx0XHRjb25zdCBjbGllbnRTdGFydGluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDb3BpbG90XSBTdGFydGluZyBDb3BpbG90Q2xpZW50Li4uJyk7XG5cblx0XHRcdC8vIEJ1aWxkIGEgY2xlYW4gZW52IGZvciB0aGUgQ0xJIHN1YnByb2Nlc3MsIHN0cmlwcGluZyBFbGVjdHJvbi9WUyBDb2RlIHZhcnNcblx0XHRcdC8vIHRoYXQgY2FuIGludGVyZmVyZSB3aXRoIHRoZSBOb2RlLmpzIHByb2Nlc3MgdGhlIFNESyBzcGF3bnMuXG5cdFx0XHRjb25zdCBlbnYgPSBjcmVhdGVDb3BpbG90Q2xpRW52aXJvbm1lbnQoKTtcblx0XHRcdC8vIEZhbWlseSBhbGlhc2VzIGFyZSBob3N0LXNpZGUgKHByb21wdCBhbmQgdG9vbC1wcm9maWxlIHJvdXRpbmcpIGFuZFxuXHRcdFx0Ly8gZGVsaWJlcmF0ZWx5IG5ldmVyIHJlYWNoIHRoZSBydW50aW1lOyBhbiBhbWJpZW50IHZhbHVlIGhlcmUgd291bGRcblx0XHRcdC8vIHJlLWludHJvZHVjZSBhIHByb2Nlc3Mtd2lkZSBhbGlhcyBmb3IgZXZlcnkgc2Vzc2lvbiBiZWhpbmQgaXRzIGJhY2suXG5cdFx0XHRkZWxldGUgZW52WydDT1BJTE9UX01PREVMX0ZBTUlMWSddO1xuXHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJlUHJveHlFbnYoZW52KTtcblxuXHRcdFx0Ly8gT24gTGludXggdGhlIE1YQyBidWJibGV3cmFwIHNhbmRib3ggYmFja2VuZCBkb2VzIG5vdCBmb3J3YXJkIGEgUFRZIGludG9cblx0XHRcdC8vIHRoZSBjb250YWluZXIsIHNvIHRoZSBDTEkncyBkZWZhdWx0IFBUWS1iYWNrZWQgaW50ZXJhY3RpdmUgc2hlbGwgY2FuXG5cdFx0XHQvLyBuZXZlciBzdGFydCBiYXNoIHVuZGVyIHRoZSBzYW5kYm94OiB0aGUgaW5uZXIgc2hlbGwgc2VlcyBhIG5vbi10dHlcblx0XHRcdC8vIHN0ZGluLCBydW5zIG5vbi1pbnRlcmFjdGl2ZWx5LCByZWFkcyBFT0YgYW5kIGV4aXRzIGltbWVkaWF0ZWx5LCB3aGljaFxuXHRcdFx0Ly8gc3VyZmFjZXMgYXMgXCJGYWlsZWQgdG8gc3RhcnQgYmFzaCBwcm9jZXNzXCIuIEZvcmNlIHRoZSBDTEkncyBwaXBlLWJhc2VkXG5cdFx0XHQvLyBzcGF3biBzaGVsbCBiYWNrZW5kIChgU0hFTExfU1BBV05fQkFDS0VORGApLCB3aGljaCBydW5zIGVhY2ggY29tbWFuZCBhc1xuXHRcdFx0Ly8gYSBvbmUtc2hvdCBjaGlsZCBwcm9jZXNzIGFuZCB3b3JrcyBjb3JyZWN0bHkgdW5kZXIgYnViYmxld3JhcC4gVGhlIENMSVxuXHRcdFx0Ly8gYWxyZWFkeSBmb3JjZS1lbmFibGVzIHRoaXMgb24gQWxwaW5lL211c2w7IGdsaWJjIExpbnV4IG5lZWRzIGl0IHRvbyBmb3Jcblx0XHRcdC8vIHNhbmRib3hlZCBzaGVsbHMuIFRoaXMgYmVjb21lcyBhIG5vLW9wIG9uY2UgdGhlIGJ1bmRsZWQgQ0xJIGRlZmF1bHRzIHRoZVxuXHRcdFx0Ly8gc3Bhd24gYmFja2VuZCBvbiBmb3IgYWxsIG9mIExpbnV4LlxuXHRcdFx0aWYgKHByb2Nlc3MucGxhdGZvcm0gPT09ICdsaW51eCcpIHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZEZsYWdzID0gZW52WydDT1BJTE9UX0NMSV9FTkFCTEVEX0ZFQVRVUkVfRkxBR1MnXTtcblx0XHRcdFx0Y29uc3QgZmxhZ3MgPSBuZXcgU2V0KChlbmFibGVkRmxhZ3MgPz8gJycpLnNwbGl0KCcsJykubWFwKGYgPT4gZi50cmltKCkpLmZpbHRlcihCb29sZWFuKSk7XG5cdFx0XHRcdGZsYWdzLmFkZCgnU0hFTExfU1BBV05fQkFDS0VORCcpO1xuXHRcdFx0XHRlbnZbJ0NPUElMT1RfQ0xJX0VOQUJMRURfRkVBVFVSRV9GTEFHUyddID0gWy4uLmZsYWdzXS5qb2luKCcsJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElkZW50aWZ5IFZTIENvZGUncyBhZ2VudCBob3N0IHRyYWZmaWMgaW4gQ0FQSVxuXHRcdFx0ZW52WydHSVRIVUJfQ09QSUxPVF9JTlRFR1JBVElPTl9JRCddID0gQ09QSUxPVF9JTlRFR1JBVElPTl9JRDtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFNldCBDTEkgZW52OiBHSVRIVUJfQ09QSUxPVF9JTlRFR1JBVElPTl9JRD0ke0NPUElMT1RfSU5URUdSQVRJT05fSUR9YCk7XG5cblx0XHRcdC8vIFBvaW50IHRoZSBDb3BpbG90IENMSSBhdCBhIGNvbmZpZ3VyZWQgR2l0SHViIEVudGVycHJpc2UgaG9zdCBmb3IgaXRzXG5cdFx0XHQvLyBhdXRoZW50aWNhdGlvbiBhbmQgQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcnkuIGBDT1BJTE9UX0dIX0hPU1RgIGlzXG5cdFx0XHQvLyBDb3BpbG90LUNMSS1zcGVjaWZpYyAoaXQgZG9lcyBub3QgYWZmZWN0IHRoZSBgZ2hgIENMSSkuIFVuc2V0IGZvclxuXHRcdFx0Ly8gZ2l0aHViLmNvbSBzbyB0aGUgQ0xJIHVzZXMgaXRzIGRlZmF1bHQgaG9zdC5cblx0XHRcdGNvbnN0IGVudGVycHJpc2VIb3N0ID0gdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKTtcblx0XHRcdGlmIChlbnRlcnByaXNlSG9zdCkge1xuXHRcdFx0XHRlbnZbJ0NPUElMT1RfR0hfSE9TVCddID0gZW50ZXJwcmlzZUhvc3Q7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFNldCBDTEkgZW52OiBDT1BJTE9UX0dIX0hPU1Q9JHtlbnRlcnByaXNlSG9zdH1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW5hYmxlIHRoZSBydWJiZXIgZHVjayBjcml0aWMgc3ViYWdlbnQgaW4gdGhlIENMSSB3aGVuIHRoZSBhZ2VudCBob3N0XG5cdFx0XHQvLyBjb25maWcgb3B0cyBpbi4gYFJVQkJFUl9EVUNLX0FHRU5UYCBpcyB0aGUgU0RLJ3MgcmVxdWlyZWQgaW50ZXJmYWNlIGZvclxuXHRcdFx0Ly8gZ2F0aW5nIHRoaXMgZXhwZXJpbWVudGFsIGZlYXR1cmVcblx0XHRcdGlmICh0aGlzLl9pc1J1YmJlckR1Y2tFbmFibGVkKCkpIHtcblx0XHRcdFx0ZW52WydSVUJCRVJfRFVDS19BR0VOVCddID0gJ3RydWUnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVsZXRlIGVudlsnUlVCQkVSX0RVQ0tfQUdFTlQnXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgQ0xJIGVudHJ5IHBvaW50IGFuZCBuYXRpdmUgU0RLIGJpbmFyaWVzIGZyb20gbm9kZV9tb2R1bGVzLlxuXHRcdFx0Ly8gSW4gdGhlIGRlc2t0b3AgYXBwIHRoZXNlIGxpdmUgbmV4dCB0byB0aGUgQVNBUiBhcmNoaXZlIGluXG5cdFx0XHQvLyBgbm9kZV9tb2R1bGVzLmFzYXIudW5wYWNrZWRgICh0aGUgYEBnaXRodWIvY29waWxvdC08cGxhdGZvcm0+YCBDTEkgYW5kXG5cdFx0XHQvLyB0aGUgYEBtaWNyb3NvZnQvbXhjLXNkay9iaW5gIGV4ZWN1dGFibGVzIGFyZSB1bnBhY2tlZCBzbyB0aGV5IGNhbiBiZVxuXHRcdFx0Ly8gc3Bhd25lZCksIHdoaWxlIGluIGRldiBhbmQgb24gdGhlIHNlcnZlciAod2hpY2ggaGFzIG5vIEFTQVIpIHRoZXkgbGl2ZVxuXHRcdFx0Ly8gaW4gYSBwbGFpbiBgbm9kZV9tb2R1bGVzYC5cblx0XHRcdC8vIFdlIGNhbid0IHVzZSByZXF1aXJlLnJlc29sdmUoKSBiZWNhdXNlIEBnaXRodWIvY29waWxvdCdzIGV4cG9ydHMgbWFwXG5cdFx0XHQvLyBibG9ja3MgZGlyZWN0IHN1YnBhdGggYWNjZXNzLlxuXHRcdFx0Y29uc3Qgbm9kZU1vZHVsZXNVcmkgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShnZXRBcHBOb2RlTW9kdWxlc1BhdGgoKSk7XG5cdFx0XHRjb25zdCBjbGlQYXRoID0gYXdhaXQgcmVzb2x2ZUNvcGlsb3RDbGlQYXRoKG5vZGVNb2R1bGVzVXJpKTtcblxuXHRcdFx0Ly8gVGhlIFNESydzIHNhbmRib3ggYXV0by1kZXRlY3Rpb24gbG9va3MgZm9yIGA8TVhDX0JJTl9ESVI+LzxhcmNoPi93eGMtZXhlYy5leGVgXG5cdFx0XHQvLyAoYW5kIHRoZSBMaW51eC9tYWNPUyBlcXVpdmFsZW50cykuIFZTIENvZGUgY29yZSBzaGlwcyB0aGUgTVhDIHNhbmRib3ggYmluYXJpZXNcblx0XHRcdC8vIGF0IGA8bm9kZU1vZHVsZXM+L0BtaWNyb3NvZnQvbXhjLXNkay9iaW4vPGFyY2g+L2AsIHNvIHBvaW50IGBNWENfQklOX0RJUmAgdGhlcmUuXG5cdFx0XHQvLyBUaGUgQGdpdGh1Yi9jb3BpbG90IHBhY2thZ2UncyBvd24gYG14Yy1iaW4vYCBpcyBleGNsdWRlZCBmcm9tIHRoZSBwcm9kdWN0IGJ1aWxkXG5cdFx0XHQvLyAoc2VlIGJ1aWxkLy5tb2R1bGVpZ25vcmUpLCBtaXJyb3JpbmcgYENvcGlsb3RDTElTREsuZ2V0UGFja2FnZWAgaW4gdGhlIGV4dGVuc2lvbi5cblx0XHRcdGVudlsnTVhDX0JJTl9ESVInXSA9IFVSSS5qb2luUGF0aChub2RlTW9kdWxlc1VyaSwgJ0BtaWNyb3NvZnQnLCAnbXhjLXNkaycsICdiaW4nKS5mc1BhdGg7XG5cblx0XHRcdC8vIEFkZCBWUyBDb2RlJ3MgYnVpbHQtaW4gcmlwZ3JlcCB0byBQQVRIIHNvIHRoZSBDTEkgc3VicHJvY2VzcyBjYW4gZmluZCBpdC5cblx0XHRcdGNvbnN0IHJlc29sdmVkUmdEaXNrUGF0aCA9IGF3YWl0IHJnRGlza1BhdGgoKTtcblx0XHRcdGNvbnN0IHJnRGlyID0gZGlybmFtZShyZXNvbHZlZFJnRGlza1BhdGgpO1xuXHRcdFx0Ly8gT24gV2luZG93cyB0aGUgZW52IGtleSBpcyB0eXBpY2FsbHkgXCJQYXRoXCIgKG5vdCBcIlBBVEhcIikuIFNpbmNlIHdlIGNvcGllZFxuXHRcdFx0Ly8gcHJvY2Vzcy5lbnYgaW50byBhIHBsYWluIChjYXNlLXNlbnNpdGl2ZSkgb2JqZWN0LCB3ZSBtdXN0IGZpbmQgdGhlIGFjdHVhbCBrZXkuXG5cdFx0XHRjb25zdCBwYXRoS2V5ID0gT2JqZWN0LmtleXMoZW52KS5maW5kKGsgPT4gay50b1VwcGVyQ2FzZSgpID09PSAnUEFUSCcpID8/ICdQQVRIJztcblx0XHRcdGNvbnN0IGN1cnJlbnRQYXRoID0gZW52W3BhdGhLZXldO1xuXHRcdFx0ZW52W3BhdGhLZXldID0gY3VycmVudFBhdGggPyBgJHtjdXJyZW50UGF0aH0ke2RlbGltaXRlcn0ke3JnRGlyfWAgOiByZ0Rpcjtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3RdIFJlc29sdmVkIENMSSBwYXRoOiAke2NsaVBhdGh9YCk7XG5cblx0XHRcdGNvbnN0IHRlbGVtZXRyeSA9IGF3YWl0IHRoaXMuX290ZWxTZXJ2aWNlLmdldFNka1RlbGVtZXRyeUNvbmZpZygpO1xuXHRcdFx0Y29uc3QgbmF0aXZlVGVsZW1ldHJ5ID0gYXdhaXQgdGhpcy5fb3RlbFNlcnZpY2UuZ2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRpZiAobmF0aXZlVGVsZW1ldHJ5KSB7XG5cdFx0XHRcdGVudlsnT1RFTF9TRVJWSUNFX05BTUUnXSA9ICdnaXRodWItY29waWxvdCc7XG5cdFx0XHRcdGVudlsnT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTJ10gPSBPYmplY3QuZW50cmllcyhuYXRpdmVUZWxlbWV0cnkucmVzb3VyY2VBdHRyaWJ1dGVzKS5tYXAoKFtrZXksIHZhbHVlXSkgPT4gYCR7a2V5fT0ke2VuY29kZVVSSUNvbXBvbmVudCh2YWx1ZSl9YCkuam9pbignLCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5hdGl2ZVRlbGVtZXRyeT8udHJhY2VzKSB7XG5cdFx0XHRcdGVudlsnT1RFTF9FWFBPUlRFUl9PVExQX1RSQUNFU19FTkRQT0lOVCddID0gbmF0aXZlVGVsZW1ldHJ5LnRyYWNlcy5lbmRwb2ludDtcblx0XHRcdFx0ZW52WydPVEVMX0VYUE9SVEVSX09UTFBfVFJBQ0VTX1BST1RPQ09MJ10gPSBuYXRpdmVUZWxlbWV0cnkudHJhY2VzLnByb3RvY29sO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG5hdGl2ZVRlbGVtZXRyeT8uZXh0ZXJuYWwpIHtcblx0XHRcdFx0ZW52WydPVEVMX0VYUE9SVEVSX09UTFBfTUVUUklDU19FTkRQT0lOVCddID0gcmVzb2x2ZUNvcGlsb3RPdGxwTWV0cmljc0VuZHBvaW50KG5hdGl2ZVRlbGVtZXRyeS5leHRlcm5hbC5lbmRwb2ludCwgbmF0aXZlVGVsZW1ldHJ5LmV4dGVybmFsLnByb3RvY29sKTtcblx0XHRcdFx0ZW52WydPVEVMX0VYUE9SVEVSX09UTFBfTUVUUklDU19QUk9UT0NPTCddID0gbmF0aXZlVGVsZW1ldHJ5LmV4dGVybmFsLnByb3RvY29sO1xuXHRcdFx0fSBlbHNlIGlmIChuYXRpdmVUZWxlbWV0cnkpIHtcblx0XHRcdFx0ZW52WydPVEVMX01FVFJJQ1NfRVhQT1JURVInXSA9ICdub25lJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvcGlsb3RTZGtMb2dMZXZlbEF0U3RhcnR1cCA9IHRoaXMuX3Jlc29sdmVDb3BpbG90U2RrTG9nTGV2ZWwoY29waWxvdFNka0xvZ0xldmVsU2V0dGluZ0F0U3RhcnR1cCk7XG5cblx0XHRcdGNvbnN0IGNsaWVudE9wdGlvbnM6IENvcGlsb3RDbGllbnRPcHRpb25zID0ge1xuXHRcdFx0XHR1c2VMb2dnZWRJblVzZXI6IGZhbHNlLFxuXHRcdFx0XHRjb25uZWN0aW9uOiBSdW50aW1lQ29ubmVjdGlvbi5mb3JTdGRpbyh7IHBhdGg6IGNsaVBhdGggfSksXG5cdFx0XHRcdGVudixcblx0XHRcdFx0dGVsZW1ldHJ5LFxuXHRcdFx0XHRsb2dMZXZlbDogY29waWxvdFNka0xvZ0xldmVsQXRTdGFydHVwLFxuXHRcdFx0XHRlbmFibGVSZW1vdGVTZXNzaW9uczogc2Vzc2lvblN5bmNBdFN0YXJ0dXAsXG5cdFx0XHRcdG9uR2V0VHJhY2VDb250ZXh0OiAoKSA9PiB0aGlzLl9vdGVsU2VydmljZS5nZXRDdXJyZW50VHJhY2VDb250ZXh0KCkgPz8ge30sXG5cdFx0XHRcdG9uR2l0SHViVGVsZW1ldHJ5OiBub3RpZmljYXRpb24gPT4geyB2b2lkIHRoaXMuX3JvdXRlR2l0SHViVGVsZW1ldHJ5KG5vdGlmaWNhdGlvbikuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90XSBHaXRIdWIgdGVsZW1ldHJ5IHJvdXRpbmcgZmFpbGVkOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKSk7IH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gdGhpcy5fY3JlYXRlQ29waWxvdENsaWVudChjbGllbnRPcHRpb25zKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5zdGFydCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y29uc3QgZmFpbHVyZUtpbmQgPSBjbGFzc2lmeUNvcGlsb3RDbGllbnRGYWlsdXJlKGVycm9yKTtcblx0XHRcdFx0aWYgKGZhaWx1cmVLaW5kICYmIGVycm9yIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0XHRyZXBvcnRDb3BpbG90Q2xpZW50RmFpbHVyZSh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBnZW5lcmF0ZVV1aWQoKSwgZmFpbHVyZUtpbmQsICdzdGFydENsaWVudCcsIHRoaXMuX2NoYXRzV2l0aEFjdGl2ZVR1cm4oKSwgZmFsc2UsIGVycm9yKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvcnRlZENsaWVudEZhaWx1cmVzLmFkZChlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc2h1dGRvd25Qcm9taXNlKSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5zdG9wKCk7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2lzU2Vzc2lvblN5bmNFbmFibGVkKCkgIT09IHNlc3Npb25TeW5jQXRTdGFydHVwIHx8IHRoaXMuX2lzUnViYmVyRHVja0VuYWJsZWQoKSAhPT0gcnViYmVyRHVja0F0U3RhcnR1cCB8fCB0aGlzLl9nZXRDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nKCkgIT09IGNvcGlsb3RTZGtMb2dMZXZlbFNldHRpbmdBdFN0YXJ0dXAgfHwgdGhpcy5fZ2V0RW50ZXJwcmlzZUhvc3QoKSAhPT0gZW50ZXJwcmlzZUhvc3RBdFN0YXJ0dXAgfHwgdGhpcy5faXNTeXN0ZW1Qcm94eUVuYWJsZWQoKSAhPT0gc3lzdGVtUHJveHlFbmFibGVkQXRTdGFydHVwKSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5zdG9wKCk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ29waWxvdCBzdGFydHVwIGNvbmZpZyBjaGFuZ2VkIHdoaWxlIHRoZSBjbGllbnQgd2FzIHN0YXJ0aW5nJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDb3BpbG90XSBDb3BpbG90Q2xpZW50IHN0YXJ0ZWQgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0XHR0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG5cdFx0XHR0aGlzLl9jbGllbnRTdGFydGluZyA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBjbGllbnQ7XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9jbGllbnRTdGFydGluZyA9IGNsaWVudFN0YXJ0aW5nO1xuXHRcdHZvaWQgY2xpZW50U3RhcnRpbmcuY2F0Y2goKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xpZW50U3RhcnRpbmcgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNsaWVudFN0YXJ0aW5nO1xuXHR9XG5cblx0Ly8gLS0tLSBzZXNzaW9uIG1hbmFnZW1lbnQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRoaW5raW5nTGV2ZWxDb25maWdTY2hlbWFQcm9wZXJ0eShyZWFzb25pbmdFZmZvcnRzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgZGVmYXVsdFJlYXNvbmluZ0VmZm9ydDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBDb25maWdQcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gT25seSBhZHZlcnRpc2UgZWZmb3J0cyB0aGUgQ29waWxvdCBsYXVuY2hlciBhY3R1YWxseSBhY2NlcHRzLCBvdGhlcndpc2UgdGhlIHBpY2tlciB3b3VsZFxuXHRcdC8vIHN1cmZhY2UgYSBsZXZlbCB0aGF0IGlzIHNpbGVudGx5IGRyb3BwZWQgd2hlbiB0aGUgc2Vzc2lvbiBpcyBsYXVuY2hlZC5cblx0XHRjb25zdCBzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzID0gcmVhc29uaW5nRWZmb3J0cz8uZmlsdGVyKGlzQ29waWxvdFJlYXNvbmluZ0VmZm9ydCk7XG5cdFx0aWYgKCFzdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb3BpbG90Lm1vZGVsVGhpbmtpbmdMZXZlbC50aXRsZScsIFwiVGhpbmtpbmcgTGV2ZWxcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvcGlsb3QubW9kZWxUaGlua2luZ0xldmVsLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyBob3cgbXVjaCByZWFzb25pbmcgZWZmb3J0IHRoZSBtb2RlbCB1c2VzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHJlc29sdmVEZWZhdWx0UmVhc29uaW5nRWZmb3J0KHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHMsIGRlZmF1bHRSZWFzb25pbmdFZmZvcnQsIG1vZGVsSWQpLFxuXHRcdFx0ZW51bTogWy4uLnN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHNdLFxuXHRcdFx0ZW51bUxhYmVsczogc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cy5tYXAoZ2V0UmVhc29uaW5nRWZmb3J0TGFiZWwpLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cy5tYXAodmFsdWUgPT4gZ2V0UmVhc29uaW5nRWZmb3J0RGVzY3JpcHRpb24odmFsdWUpID8/ICcnKSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN5bnRoZXNpemUgYSBgY29udGV4dFNpemVgIGNvbmZpZyBwcm9wZXJ0eSB3aGVuIHRoZSBtb2RlbCBleHBvc2VzIGEgYGxvbmdfY29udGV4dGAgcHJpY2luZyB0aWVyIHdpdGggYSBkaXN0aW5jdFxuXHQgKiBjb250ZXh0LW1heC4gUGlja2VyIHN1cmZhY2VzIHRoaXMgYXMgdGhlIFwiQ29udGV4dCBTaXplXCIgYnV0dG9uLiBNaXJyb3JzIGBnZXRDb250ZXh0U2l6ZU9wdGlvbnNgIGluXG5cdCAqIGBleHRlbnNpb25zL2NvcGlsb3Qvc3JjL2V4dGVuc2lvbi9jaGF0L3ZzY29kZS1ub2RlL2xhbmd1YWdlTW9kZWxBY2Nlc3MudHNgLlxuXHQgKlxuXHQgKiBUaGUgYGVudW1gIHZhbHVlcyBhcmUgdGhlIHR3byBjb250ZXh0LXdpbmRvdyBzaXplcyAoaW4gdG9rZW5zKSwgc21hbGxlc3QgZmlyc3QsIHNvIHRoZSBudW1lcmljIHRva2VuIGNvdW50c1xuXHQgKiBmbG93IHRvIHRoZSBjbGllbnQuIFRoZSBjaG9zZW4gdmFsdWUgY29tZXMgYmFjayBpbiB0aGUgbW9kZWwncyBgY29uZmlnYCBiYWcgYW5kIGlzIG1hcHBlZCB0byB0aGUgU0RLJ3Ncblx0ICogdHdvLXZhbHVlZCBgY29udGV4dFRpZXJgIGF0IHRoZSBTREsgYm91bmRhcnkgYnkge0BsaW5rIGdldENvcGlsb3RDb250ZXh0VGllcn0sIHVzaW5nIHRoZSBtb2RlbCdzIGxvbmctY29udGV4dFxuXHQgKiB3aW5kb3cgZnJvbSB7QGxpbmsgX2xvbmdDb250ZXh0V2luZG93Rm9yfS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZUNvbnRleHRTaXplQ29uZmlnU2NoZW1hUHJvcGVydHkoYmlsbGluZzogSUNBUElNb2RlbEJpbGxpbmcgfCB1bmRlZmluZWQpOiBDb25maWdQcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdG9rZW5QcmljZXMgPSBiaWxsaW5nPy50b2tlblByaWNlcztcblx0XHRjb25zdCBkZWZhdWx0TWF4ID0gdG9rZW5QcmljZXM/LmNvbnRleHRNYXg7XG5cdFx0Y29uc3QgbG9uZ0NvbnRleHRNYXggPSB0b2tlblByaWNlcz8ubG9uZ0NvbnRleHQ/LmNvbnRleHRNYXg7XG5cdFx0aWYgKCFkZWZhdWx0TWF4IHx8ICFsb25nQ29udGV4dE1heCB8fCBkZWZhdWx0TWF4ID49IGxvbmdDb250ZXh0TWF4KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE9mZmVyIGJvdGggc2l6ZXM7IGRlZmF1bHQgdG8gdGhlIGZ1bGwgd2luZG93IHdoZW4gbG9uZyBjb250ZXh0IGlzIGZyZWUsIGVsc2UgdGhlIHNtYWxsZXIgdGllci5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvcGlsb3QubW9kZWxDb250ZXh0U2l6ZS50aXRsZScsIFwiQ29udGV4dCBTaXplXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb3BpbG90Lm1vZGVsQ29udGV4dFNpemUuZGVzY3JpcHRpb24nLCBcIlNlbGVjdHMgdGhlIGNvbnRleHQgd2luZG93IHNpemUgZm9yIHRoaXMgbW9kZWwuXCIpLFxuXHRcdFx0ZGVmYXVsdDogaGFzTG9uZ0NvbnRleHRTdXJjaGFyZ2UoYmlsbGluZykgPyBkZWZhdWx0TWF4IDogbG9uZ0NvbnRleHRNYXgsXG5cdFx0XHRlbnVtOiBbZGVmYXVsdE1heCwgbG9uZ0NvbnRleHRNYXhdLFxuXHRcdFx0ZW51bUxhYmVsczogW2Zvcm1hdFRva2VuQ291bnQoZGVmYXVsdE1heCksIGZvcm1hdFRva2VuQ291bnQobG9uZ0NvbnRleHRNYXgpXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ2NvcGlsb3QubW9kZWxDb250ZXh0U2l6ZS5kZWZhdWx0JywgXCJEZWZhdWx0XCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY29waWxvdC5tb2RlbENvbnRleHRTaXplLmxvbmdlclNlc3Npb25zJywgXCJMb25nZXIgc2Vzc2lvbnNcIiksXG5cdFx0XHRdLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1vZGVsJ3MgbG9uZy1jb250ZXh0IHdpbmRvdyAoaW4gdG9rZW5zKTogdGhlIGxhcmdlc3Qgc2l6ZSBvZmZlcmVkIGJ5IGl0cyBcIkNvbnRleHQgU2l6ZVwiIHBpY2tlclxuXHQgKiAodGhlIG1heCBudW1lcmljIHZhbHVlIGluIHRoZSBzeW50aGVzaXplZCBgY29udGV4dFNpemVgIHtAbGluayBDb25maWdQcm9wZXJ0eVNjaGVtYS5lbnVtfSkuIFVzZWQgYnlcblx0ICoge0BsaW5rIGdldENvcGlsb3RDb250ZXh0VGllcn0gdG8gZGVjaWRlIHdoZXRoZXIgYSBudW1lcmljIHNlbGVjdGlvbiBvcHRzIGludG8gYGxvbmdfY29udGV4dGAuXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbW9kZWwgZXhwb3NlcyBubyBzdWNoIHBpY2tlciAob3IgdGhlIG1vZGVsIGxpc3QgaXNuJ3QgbG9hZGVkIHlldCksXG5cdCAqIGxlYXZpbmcgdGhlIFNESyBvbiBpdHMgZGVmYXVsdCB0aWVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfbG9uZ0NvbnRleHRXaW5kb3dGb3IobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1vZGVsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHdpbmRvd3MgPSB0aGlzLl9tb2RlbHMuZ2V0KCkuZmluZChtID0+IG0uaWQgPT09IG1vZGVsSWQpPy5jb25maWdTY2hlbWE/LnByb3BlcnRpZXM/LltDb250ZXh0U2l6ZUNvbmZpZ0tleV0/LmVudW07XG5cdFx0Y29uc3QgbnVtZXJpY1dpbmRvd3MgPSB3aW5kb3dzPy5maWx0ZXIoKHcpOiB3IGlzIG51bWJlciA9PiB0eXBlb2YgdyA9PT0gJ251bWJlcicpO1xuXHRcdHJldHVybiBudW1lcmljV2luZG93cyAmJiBudW1lcmljV2luZG93cy5sZW5ndGggPiAwID8gTWF0aC5tYXgoLi4ubnVtZXJpY1dpbmRvd3MpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIG1vZGVsIGhhcyBhIGxhcmdlciBsb25nLWNvbnRleHQgd2luZG93IGF0IG5vIGFkZGl0aW9uYWwgY29zdC4gV2hlbiB0cnVlLCBhIHNlc3Npb25cblx0ICogd2l0aCBubyBleHBsaWNpdCBzZWxlY3Rpb24gZGVmYXVsdHMgdG8gYGxvbmdfY29udGV4dGAgd2hpbGUgdGhlIHBpY2tlciBzdGlsbCBvZmZlcnMgYm90aCBzaXplcy5cblx0ICovXG5cdHByaXZhdGUgX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1vZGVsSWQgJiYgdGhpcy5fZnJlZUxvbmdDb250ZXh0TW9kZWxzLmhhcyhtb2RlbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIG9wZW4gYF9tZXRhYCBtb2RlbCBwaWNrZXIgYmFnIGZyb20gdGhlIFNESydzIGJpbGxpbmcgYW5kIHBpY2tlciBtZXRhZGF0YS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZU1vZGVsUGlja2VyTWV0YShtb2RlbEluZm86IENvcGlsb3RNb2RlbEluZm8sIGJpbGxpbmc6IElDQVBJTW9kZWxCaWxsaW5nIHwgdW5kZWZpbmVkKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjcmVhdGVQcmljaW5nTWV0YUZyb21CaWxsaW5nKGJpbGxpbmcsIG1vZGVsSW5mby5tb2RlbFBpY2tlclByaWNlQ2F0ZWdvcnksIG1vZGVsSW5mby5tb2RlbFBpY2tlckNhdGVnb3J5KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU1vZGVsQ29uZmlnU2NoZW1hKG06IENvcGlsb3RNb2RlbEluZm8sIGJpbGxpbmc6IElDQVBJTW9kZWxCaWxsaW5nIHwgdW5kZWZpbmVkKTogQ29uZmlnU2NoZW1hIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBDb25maWdTY2hlbWFbJ3Byb3BlcnRpZXMnXSA9IHt9O1xuXHRcdGNvbnN0IHRoaW5raW5nTGV2ZWwgPSB0aGlzLl9jcmVhdGVUaGlua2luZ0xldmVsQ29uZmlnU2NoZW1hUHJvcGVydHkobS5zdXBwb3J0ZWRSZWFzb25pbmdFZmZvcnRzLCB1bmRlZmluZWQsIG0uaWQpO1xuXHRcdGlmICh0aGlua2luZ0xldmVsKSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1RoaW5raW5nTGV2ZWxDb25maWdLZXldID0gdGhpbmtpbmdMZXZlbDtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dFNpemUgPSB0aGlzLl9jcmVhdGVDb250ZXh0U2l6ZUNvbmZpZ1NjaGVtYVByb3BlcnR5KGJpbGxpbmcpO1xuXHRcdGlmIChjb250ZXh0U2l6ZSkge1xuXHRcdFx0cHJvcGVydGllc1tDb250ZXh0U2l6ZUNvbmZpZ0tleV0gPSBjb250ZXh0U2l6ZTtcblx0XHR9XG5cdFx0aWYgKE9iamVjdC5rZXlzKHByb3BlcnRpZXMpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX3NlcmlhbGl6ZU1vZGVsU2VsZWN0aW9uKG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KG1vZGVsKTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlTW9kZWxTZWxlY3Rpb24ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbHVlOiBJU2VyaWFsaXplZE1vZGVsU2VsZWN0aW9uIHwgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IG51bGwgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgdmFsdWUuaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsU2VsZWN0aW9uOiBNb2RlbFNlbGVjdGlvbiA9IHsgaWQ6IHZhbHVlLmlkIH07XG5cdFx0XHRcdGlmICh2YWx1ZS5jb25maWcgJiYgdHlwZW9mIHZhbHVlLmNvbmZpZyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRjb25zdCBjb25maWc6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIGNvbmZpZ1ZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh2YWx1ZS5jb25maWcpKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbmZpZ1ZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRjb25maWdba2V5XSA9IGNvbmZpZ1ZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoT2JqZWN0LmtleXMoY29uZmlnKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRtb2RlbFNlbGVjdGlvbi5jb25maWcgPSBjb25maWc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtb2RlbFNlbGVjdGlvbjtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE9sZGVyIHNlc3Npb24gbWV0YWRhdGEgc3RvcmVkIHRoZSByYXcgbW9kZWwgaWQgYXMgYSBwbGFpbiBzdHJpbmcuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaWQ6IHJhdyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VyaWFsaXplQWdlbnRTZWxlY3Rpb24oYWdlbnQ6IEFnZW50U2VsZWN0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoeyB1cmk6IGFnZW50LnVyaSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3BhcnNlQWdlbnRTZWxlY3Rpb24ocmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB2YWx1ZTogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGlmICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHR5cGVvZiAodmFsdWUgYXMgQWdlbnRTZWxlY3Rpb24pLnVyaSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHsgdXJpOiAodmFsdWUgYXMgQWdlbnRTZWxlY3Rpb24pLnVyaSB9O1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gQmFkIC8gc3RhbGUgbWV0YWRhdGEgXHUyMDE0IHRyZWF0IGFzIHVuc2V0LlxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGFuIHtAbGluayBBZ2VudFNlbGVjdGlvbn0ncyBTREstZmFjaW5nIG5hbWUgZnJvbSB0aGUgcGx1Z2luXG5cdCAqIHNuYXBzaG90IHRoYXQgaXMsIG9yIHdpbGwgYmUsIGFwcGxpZWQgdG8gdGhlIFNESyBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90LCBhZ2VudDogQWdlbnRTZWxlY3Rpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIHNuYXBzaG90LnBsdWdpbnMpIHtcblx0XHRcdGNvbnN0IGZvdW5kID0gcGx1Z2luLmFnZW50cy5maW5kKGEgPT4gYS51cmkudG9TdHJpbmcoKSA9PT0gYWdlbnQudXJpKTtcblx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZm91bmQubmFtZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGxpc3RDaGF0c1RvTWlncmF0ZSgpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9saXN0U2RrU2Vzc2lvbnMoJ2NoYXRzIHRvIG1pZ3JhdGUnKTtcblx0XHRpZiAoIXNlc3Npb25zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcm9qZWN0TGltaXRlciA9IG5ldyBMaW1pdGVyPElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZD4oNCk7XG5cdFx0Y29uc3QgbWV0YWRhdGFMaW1pdGVyID0gbmV3IExpbWl0ZXI8SUFnZW50Q2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkPig0KTtcblx0XHRjb25zdCBwcm9qZWN0QnlDb250ZXh0ID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPj4oKTtcblx0XHRjb25zdCBtYXBwZWQgPSBhd2FpdCBQcm9taXNlLmFsbChzZXNzaW9ucy5tYXAocyA9PiBtZXRhZGF0YUxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgcy5zZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZFN0b3JlZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblx0XHRcdGlmICghbWV0YWRhdGEgfHwgIShcblx0XHRcdFx0bWV0YWRhdGEubW9kZWwgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHR8fCBtZXRhZGF0YS5hZ2VudCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdHx8IG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHR8fCBtZXRhZGF0YS53b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHR8fCBtZXRhZGF0YS5jdXN0b21pemF0aW9uRGlyZWN0b3J5ICE9PSB1bmRlZmluZWRcblx0XHRcdFx0fHwgbWV0YWRhdGEucHJvamVjdCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdHx8IG1ldGFkYXRhLnJlc29sdmVkXG5cdFx0XHRcdHx8IG1ldGFkYXRhLndvcmtzcGFjZWxlc3MgIT09IHVuZGVmaW5lZFxuXHRcdFx0KSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHsgcHJvamVjdCwgcmVzb2x2ZWQgfSA9IG1ldGFkYXRhO1xuXHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRwcm9qZWN0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVNlc3Npb25Qcm9qZWN0KHMuY29udGV4dCwgcHJvamVjdExpbWl0ZXIsIHByb2plY3RCeUNvbnRleHQpO1xuXHRcdFx0XHR2b2lkIHRoaXMuX3N0b3JlU2Vzc2lvblByb2plY3RSZXNvbHV0aW9uKHNlc3Npb24sIHByb2plY3QpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzID8/ICh0eXBlb2Ygcy5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5ID09PSAnc3RyaW5nJyA/IFtVUkkuZmlsZShzLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSldIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSUFnZW50Q2hhdE1ldGFkYXRhID0ge1xuXHRcdFx0XHRjaGF0LFxuXHRcdFx0XHRzdGFydFRpbWU6IHMuc3RhcnRUaW1lLmdldFRpbWUoKSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lOiBzLm1vZGlmaWVkVGltZS5nZXRUaW1lKCksXG5cdFx0XHRcdHByb2plY3QsXG5cdFx0XHRcdHN1bW1hcnk6IHMuc3VtbWFyeSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBtYXBwZWQuZmlsdGVyKChzKTogcyBpcyBJQWdlbnRDaGF0TWV0YWRhdGEgPT4gcyAhPT0gdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBGb3VuZCAke3Jlc3VsdC5sZW5ndGh9IGxlZ2FjeSBzZXNzaW9uc2ApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbWl0RXh0SG9zdENoYXRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGF0cyA9IGF3YWl0IHRoaXMuX2Rpc2NvdmVyRXh0SG9zdENoYXRzKCk7XG5cdFx0XHRpZiAoY2hhdHMgJiYgdGhpcy5faXNNaWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZERpc2NvdmVyQ2hhdHMuZmlyZShjaGF0cyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb3BpbG90XSBGYWlsZWQgdG8gZW1pdCBleHRlbnNpb24taG9zdCBjaGF0cycsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY292ZXJFeHRIb3N0Q2hhdHMoKTogUHJvbWlzZTxJQWdlbnREaXNjb3ZlcmVkQ2hhdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9saXN0U2RrU2Vzc2lvbnMoJ2V4dGVuc2lvbi1ob3N0IGNoYXRzJyk7XG5cdFx0aWYgKCFzZXNzaW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvamVjdExpbWl0ZXIgPSBuZXcgTGltaXRlcjxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+KDQpO1xuXHRcdGNvbnN0IG1ldGFkYXRhTGltaXRlciA9IG5ldyBMaW1pdGVyPElBZ2VudENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZD4oNCk7XG5cdFx0Y29uc3QgcHJvamVjdEJ5Q29udGV4dCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZD4+KCk7XG5cdFx0Y29uc3QgbWFwcGVkID0gYXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKHMgPT4gbWV0YWRhdGFMaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0eXBlb2Ygcy5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5ICE9PSAnc3RyaW5nJyB8fCAhYXdhaXQgdGhpcy5faXNFeHRlbnNpb25Ib3N0Q2xpU2Vzc2lvbihzLnNlc3Npb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIHMuc2Vzc2lvbklkKTtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSksXG5cdFx0XHRcdHN0YXJ0VGltZTogcy5zdGFydFRpbWUuZ2V0VGltZSgpLFxuXHRcdFx0XHRtb2RpZmllZFRpbWU6IHMubW9kaWZpZWRUaW1lLmdldFRpbWUoKSxcblx0XHRcdFx0cHJvamVjdDogYXdhaXQgdGhpcy5fcmVzb2x2ZVNlc3Npb25Qcm9qZWN0KHMuY29udGV4dCwgcHJvamVjdExpbWl0ZXIsIHByb2plY3RCeUNvbnRleHQpLFxuXHRcdFx0XHRzdW1tYXJ5OiBzLnN1bW1hcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKHMuY29udGV4dC53b3JraW5nRGlyZWN0b3J5KV0sXG5cdFx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlKHVuZGVmaW5lZCksXG5cdFx0XHRcdGV4dGVybmFsOiBmYWxzZSxcblx0XHRcdH0gc2F0aXNmaWVzIElBZ2VudERpc2NvdmVyZWRDaGF0O1xuXHRcdH0pKSk7XG5cdFx0cmV0dXJuIG1hcHBlZC5maWx0ZXIoKGNoYXQpOiBjaGF0IGlzIElBZ2VudERpc2NvdmVyZWRDaGF0ID0+IGNoYXQgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9saXN0U2RrU2Vzc2lvbnMocmVhc29uOiBzdHJpbmcpOiBQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90Q2xpZW50WydsaXN0U2Vzc2lvbnMnXT4+IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gTGlzdGluZyAke3JlYXNvbn0uLi5gKTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3JldHJ5QWZ0ZXJDbG9zZWRDb25uZWN0aW9uKCdsaXN0U2Vzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2Vuc3VyZUNsaWVudCgpO1xuXHRcdFx0XHRyZXR1cm4gY2xpZW50Lmxpc3RTZXNzaW9ucygpO1xuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IgfHwgY2xhc3NpZnlDb3BpbG90Q2xpZW50RmFpbHVyZShlcnIpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQ2xpZW50IHVuYXZhaWxhYmxlIHdoaWxlIGxpc3RpbmcgJHtyZWFzb259OiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRDaGF0TWV0YWRhdGEoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgcHJvdmlkZXJEYXRhPzogc3RyaW5nKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHByb3ZpZGVyRGF0YSA/IGRlY29kZVByb3ZpZGVyRGF0YShwcm92aWRlckRhdGEpPy5zZGtTZXNzaW9uSWQgOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlZE1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZFN0b3JlZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHNlc3Npb25NZXRhZGF0YSA9IGF3YWl0IHRoaXMuX3JldHJ5QWZ0ZXJDbG9zZWRDb25uZWN0aW9uKCdnZXRTZXNzaW9uTWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRcdHJldHVybiBjbGllbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25JZCk7XG5cdFx0fSwgY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbihzZXNzaW9uLCBjaGF0LCB1bmRlZmluZWQsIHNlc3Npb25JZCkpO1xuXHRcdGlmICghc2Vzc2lvbk1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBwcm9qZWN0ID0gc3RvcmVkTWV0YWRhdGE/LnByb2plY3Q7XG5cdFx0aWYgKCFzdG9yZWRNZXRhZGF0YT8ucmVzb2x2ZWQpIHtcblx0XHRcdGNvbnN0IHByb2plY3RMaW1pdGVyID0gbmV3IExpbWl0ZXI8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPigxKTtcblx0XHRcdHByb2plY3QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2Vzc2lvblByb2plY3Qoc2Vzc2lvbk1ldGFkYXRhPy5jb250ZXh0LCBwcm9qZWN0TGltaXRlciwgbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPj4oKSk7XG5cdFx0XHRpZiAoc3RvcmVkTWV0YWRhdGEpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9zdG9yZVNlc3Npb25Qcm9qZWN0UmVzb2x1dGlvbihzZXNzaW9uLCBwcm9qZWN0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBzdG9yZWRNZXRhZGF0YT8ud29ya2luZ0RpcmVjdG9yaWVzID8/ICh0eXBlb2Ygc2Vzc2lvbk1ldGFkYXRhPy5jb250ZXh0Py53b3JraW5nRGlyZWN0b3J5ID09PSAnc3RyaW5nJyA/IFtVUkkuZmlsZShzZXNzaW9uTWV0YWRhdGEuY29udGV4dC53b3JraW5nRGlyZWN0b3J5KV0gOiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGFkb3B0YWJsZSA9ICFzdG9yZWRNZXRhZGF0YSAmJiBhd2FpdCB0aGlzLl9pc0V4dGVuc2lvbkhvc3RDbGlTZXNzaW9uKHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNoYXQsXG5cdFx0XHRzdGFydFRpbWU6IHNlc3Npb25NZXRhZGF0YT8uc3RhcnRUaW1lLmdldFRpbWUoKSA/PyBEYXRlLm5vdygpLFxuXHRcdFx0bW9kaWZpZWRUaW1lOiBzZXNzaW9uTWV0YWRhdGE/Lm1vZGlmaWVkVGltZS5nZXRUaW1lKCkgPz8gRGF0ZS5ub3coKSxcblx0XHRcdHByb2plY3QsXG5cdFx0XHRzdW1tYXJ5OiBzZXNzaW9uTWV0YWRhdGE/LnN1bW1hcnksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRfbWV0YTogYWRvcHRhYmxlID8gd2l0aFNlc3Npb25FaGNsaUFkb3B0YWJsZSh1bmRlZmluZWQpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9saXN0TW9kZWxzKGdpdEh1YlRva2VuOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudE1vZGVsSW5mb1tdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ29waWxvdF0gTGlzdGluZyBtb2RlbHMuLi4nKTtcblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRjb25zdCB7IG1vZGVscyB9ID0gYXdhaXQgY2xpZW50LnJwYy5tb2RlbHMubGlzdCh7IGdpdEh1YlRva2VuIH0pO1xuXHRcdHRoaXMuX2ZyZWVMb25nQ29udGV4dE1vZGVscy5jbGVhcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1vZGVscy5tYXAoKG0pOiBJQWdlbnRNb2RlbEluZm8gPT4ge1xuXHRcdFx0Y29uc3QgYmlsbGluZyA9IG5vcm1hbGl6ZUNBUElCaWxsaW5nKG0uYmlsbGluZyk7XG5cdFx0XHRjb25zdCBjb25maWdTY2hlbWEgPSB0aGlzLl9jcmVhdGVNb2RlbENvbmZpZ1NjaGVtYShtLCBiaWxsaW5nKTtcblx0XHRcdC8vIEZyZWUgbG9uZyBjb250ZXh0OiBhIGxhcmdlciBsb25nLWNvbnRleHQgd2luZG93IGF0IG5vIHN1cmNoYXJnZS4gRGVmYXVsdHMgdG8gdGhlIGZ1bGwgd2luZG93OyBwaWNrZXIga2VlcHMgYm90aC5cblx0XHRcdGNvbnN0IHRva2VuUHJpY2VzID0gYmlsbGluZz8udG9rZW5QcmljZXM7XG5cdFx0XHRjb25zdCBoYXNMYXJnZXJMb25nQ29udGV4dCA9ICEhdG9rZW5QcmljZXM/LmNvbnRleHRNYXhcblx0XHRcdFx0JiYgISF0b2tlblByaWNlcy5sb25nQ29udGV4dD8uY29udGV4dE1heFxuXHRcdFx0XHQmJiB0b2tlblByaWNlcy5sb25nQ29udGV4dC5jb250ZXh0TWF4ID4gdG9rZW5QcmljZXMuY29udGV4dE1heDtcblx0XHRcdGlmIChoYXNMYXJnZXJMb25nQ29udGV4dCAmJiAhaGFzTG9uZ0NvbnRleHRTdXJjaGFyZ2UoYmlsbGluZykpIHtcblx0XHRcdFx0dGhpcy5fZnJlZUxvbmdDb250ZXh0TW9kZWxzLmFkZChtLmlkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0XHRpZDogbS5pZCxcblx0XHRcdFx0bmFtZTogbS5uYW1lLFxuXHRcdFx0XHQvLyBTeW50aGV0aWMgU0RLIGVudHJpZXMgbGlrZSBgYXV0b2Agc2hpcCB3aXRoIGBjYXBhYmlsaXRpZXM6IHt9YCBhbmRcblx0XHRcdFx0Ly8gbm8gZml4ZWQgY29udGV4dCB3aW5kb3cgXHUyMDE0IHN1cmZhY2UgdGhlbSB3aXRoIG1heENvbnRleHRXaW5kb3cgdW5kZWZpbmVkLlxuXHRcdFx0XHRtYXhDb250ZXh0V2luZG93OiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfY29udGV4dF93aW5kb3dfdG9rZW5zLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9vdXRwdXRfdG9rZW5zLFxuXHRcdFx0XHRtYXhQcm9tcHRUb2tlbnM6IG0uY2FwYWJpbGl0aWVzPy5saW1pdHM/Lm1heF9wcm9tcHRfdG9rZW5zLFxuXHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogISFtLmNhcGFiaWxpdGllcz8uc3VwcG9ydHM/LnZpc2lvbixcblx0XHRcdFx0Y29uZmlnU2NoZW1hLFxuXHRcdFx0XHRwb2xpY3lTdGF0ZTogbS5wb2xpY3k/LnN0YXRlIGFzIFBvbGljeVN0YXRlIHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRfbWV0YTogdGhpcy5fY3JlYXRlTW9kZWxQaWNrZXJNZXRhKG0sIGJpbGxpbmcpLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBGb3VuZCAke3Jlc3VsdC5sZW5ndGh9IG1vZGVsczogJHtyZXN1bHQubWFwKG0gPT4gbS5uYW1lKS5qb2luKCcsICcpfWApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHByb2Nlc3Mgcm9vdCBmb3IgYSBjaGF0IHRoYXQgY2FycmllcyBpdHMgc2Vzc2lvbidzIHJ1bnRpbWU6XG5cdCAqIHRoZSBob3N0LXN1cHBsaWVkIHByaW1hcnkgZm9sZGVyLCBlbHNlIGEgc3RpbGwtcHJvdmlzaW9uYWwgc2Vzc2lvbidzXG5cdCAqIGZvbGRlciBmb3IgYW4gaWRlbXBvdGVudCByZS1jcmVhdGUsIGVsc2UgXHUyMDE0IHdoZW4gdGhlIHNlc3Npb24gaXNcblx0ICogd29ya3NwYWNlLWxlc3MgKG5vIHdvcmtpbmcgZGlyZWN0b3JpZXMgc3VwcGxpZWQpIFx1MjAxNCBhIHN0YWJsZSBwZXItc2Vzc2lvblxuXHQgKiBzY3JhdGNoIGRpcmVjdG9yeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDcmVhdGVXb3JraW5nRGlyZWN0b3J5KG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCBzZXNzaW9uSWQ6IHN0cmluZywgaXNXb3Jrc3BhY2VsZXNzOiBib29sZWFuKTogUHJvbWlzZTxVUkk+IHtcblx0XHRpZiAob3B0aW9ucy5mb3JrKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VTY29wZSA9IHRoaXMuX3Jlc29sdmVDaGF0U2NvcGUob3B0aW9ucy5mb3JrLnNvdXJjZSk7XG5cdFx0XHRjb25zdCBzb3VyY2VTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc291cmNlU2NvcGUpO1xuXHRcdFx0Y29uc3QgbGl2ZVdvcmtpbmdEaXJlY3RvcnkgPSB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoc291cmNlU2Vzc2lvbklkKT8ud29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdGlmIChsaXZlV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRyZXR1cm4gbGl2ZVdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdG9yZWRXb3JraW5nRGlyZWN0b3J5ID0gKGF3YWl0IHRoaXMuX3JlYWRTZXNzaW9uTWV0YWRhdGEoc291cmNlU2NvcGUpKS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0aWYgKHN0b3JlZFdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlZFdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gb3B0aW9ucy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/PyB0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHQvLyBBIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24gKGluZmVycmVkIGZyb20gYW4gYWJzZW50IGlucHV0XG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3RvcnlgKSBnZXRzIGEgU1RBQkxFLCBkZXRlcm1pbmlzdGljIHBlci1zZXNzaW9uIHNjcmF0Y2hcblx0XHQvLyBkaXIgKG1pcnJvcmluZyB0aGUgR2l0SHViIGFwcCdzIGA8Y29waWxvdEhvbWU+L2NoYXRzLzxpZD5gKSByYXRoZXIgdGhhblxuXHRcdC8vIGEgdGhyb3dhd2F5IGBvcy50bXBkaXIoKWAgZGlyLCBzbyB0aGUgY3dkIHN1cnZpdmVzIHJlbG9hZHMgYW5kIGlzbid0XG5cdFx0Ly8gbG9zdCB0byBPUyB0ZW1wIHJlYXBpbmcuXG5cdFx0aWYgKGlzV29ya3NwYWNlbGVzcykge1xuXHRcdFx0Y29uc3Qgc2NyYXRjaERpciA9IHRoaXMuX3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNlc3Npb25JZCk7XG5cdFx0XHRhd2FpdCBmcy5ta2RpcihzY3JhdGNoRGlyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gc2NyYXRjaERpcjtcblx0XHR9XG5cdFx0Y29uc3QgdG1wUGF0aCA9IGF3YWl0IGZzLm1rZHRlbXAoam9pbihvcy50bXBkaXIoKSwgJ2FnZW50LWhvc3Qtc2Vzc2lvbi0nKSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKHRtcFBhdGgpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90XSBObyB3b3JraW5nRGlyZWN0b3J5IHByb3ZpZGVkLCBkZWZhdWx0aW5nIHRvIHRlbXAgZGlyZWN0b3J5OiAke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofWApO1xuXHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YWJsZSBwZXItc2Vzc2lvbiBzY3JhdGNoIGRpcmVjdG9yeSBmb3IgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0OlxuXHQgKiBgPHVzZXJIb21lPi8uY29waWxvdC9jaGF0cy88c2Vzc2lvbklkPmAuIERldGVybWluaXN0aWMsIHBlcnNpc3RlbnQsIGFuZFxuXHQgKiBjbGVhbmVkIHVwIG9uIHNlc3Npb24gZGVsZXRlIChzZWUge0BsaW5rIF9jbGVhbnVwV29ya3NwYWNlbGVzc1NjcmF0Y2hEaXJ9KS5cblx0ICovXG5cdHByaXZhdGUgX3dvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNlc3Npb25JZDogc3RyaW5nKTogVVJJIHtcblx0XHRyZXR1cm4gd29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLCBzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIEVuc3VyZXMgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0J3Mgc2NyYXRjaCBkaXIgZXhpc3RzIChta2RpciAtcCksIHJlY3JlYXRpbmcgaXQgaWYgaXQgd2FzIHJlYXBlZC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlV29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIoc2NyYXRjaERpcjogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5ta2RpcihzY3JhdGNoRGlyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFdvcmtzcGFjZS1sZXNzIHNjcmF0Y2ggZGlyZWN0b3J5IHJlYWR5OiAke3NjcmF0Y2hEaXIuZnNQYXRofWApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGVuc3VyZSB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcmVjdG9yeSAnJHtzY3JhdGNoRGlyLmZzUGF0aH0nOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVtb3ZlcyBhIHdvcmtzcGFjZS1sZXNzIGNoYXQncyBzdGFibGUgc2NyYXRjaCBkaXIgb24gc2Vzc2lvbiBkZWxldGUvZGlzcG9zZS4gKi9cblx0cHJpdmF0ZSBhc3luYyBfY2xlYW51cFdvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHNjcmF0Y2hEaXI6IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnMucm0oc2NyYXRjaERpci5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gUmVtb3ZlZCB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcmVjdG9yeTogJHtzY3JhdGNoRGlyLmZzUGF0aH1gKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEZhaWxlZCB0byByZW1vdmUgd29ya3NwYWNlLWxlc3Mgc2NyYXRjaCBkaXJlY3RvcnkgJyR7c2NyYXRjaERpci5mc1BhdGh9JzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBDaGF0IHN1cmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIFRoZSBjaGF0LWFkZHJlc3NlZCBvcGVyYXRpb24gc3VyZmFjZSAoc2VlXG5cdC8vIHtAbGluayBJQWdlbnQuY2hhdHN9KS4gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBmZWF0dXJlLWxldmVsXG5cdC8vIGAoc2Vzc2lvbiwgY2hhdClgIG1hcHBpbmcgYW5kIGhhbmRzIHRoZXNlIG1ldGhvZHMgYSBzaW5nbGUsIGNvbmNyZXRlIGNoYXRcblx0Ly8gY2hhbm5lbCBVUkkgcGx1cyB0cmFuc2llbnQgY29udGV4dCB3aGVuIHRoZSBvcGVyYXRpb24gbmVlZHMgdGhlIG93bmluZ1xuXHQvLyBzZXNzaW9uIG9yIHN0b3JhZ2Ugc2NvcGUuIFJvdXRpbmcgcmVhZHMgb25seSB0aGUgZXhhY3QgY2hhdCBiYWNraW5nIG1hcFxuXHQvLyBhbmQgbmV2ZXIgcmVjb3ZlcnMgb3duZXJzaGlwIGJ5IHBhcnNpbmcgdGhlIGNoYXQgVVJJLlxuXG5cdC8qKiBFeGFjdCBDb3BpbG90IFNESyBzZXNzaW9uLWlkIGxvb2t1cDsgdXNlIGNoYXQtYmFzZWQgaGVscGVycyBmb3Igcm91dGluZy4gKi9cblx0cHJpdmF0ZSBfZmluZFNlc3Npb25CeVNka0lkKHNka1Nlc3Npb25JZDogc3RyaW5nKTogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5nZXQoc2RrU2Vzc2lvbklkKT8uY2hhdFNlc3Npb247XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgbGl2ZSBjaGF0IHdob3NlIHBlcnNpc3RlbmNlIHNjb3BlIGlzIHRoZSBzZXNzaW9uIGl0c2VsZi4gKi9cblx0cHJpdmF0ZSBfZmluZFNlc3Npb25DaGF0KHNlc3Npb246IFVSSSk6IENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fY2hhdEVudHJpZXNCeVNka0lkLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChlbnRyeS5jaGF0U2Vzc2lvbi5yZXNvdXJjZVVyaSwgc2Vzc2lvbikpIHtcblx0XHRcdFx0cmV0dXJuIGVudHJ5LmNoYXRTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENoYXRCeVVyaShjaGF0OiBVUkkgfCBzdHJpbmcpOiBDb3BpbG90QWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjaGF0S2V5ID0gdHlwZW9mIGNoYXQgPT09ICdzdHJpbmcnID8gY2hhdCA6IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBiYWNraW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRyZXR1cm4gYmFja2luZyA/IHRoaXMuX2ZpbmRTZXNzaW9uQnlTZGtJZChiYWNraW5nLnNka1Nlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQm91bmRTZXNzaW9uQ2hhdFVyaShzZXNzaW9uSWQ6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbY2hhdEtleSwgYmFja2luZ10gb2YgdGhpcy5fY2hhdEJhY2tpbmdzKSB7XG5cdFx0XHRpZiAoYmFja2luZy5zZGtTZXNzaW9uSWQgPT09IHNlc3Npb25JZCkge1xuXHRcdFx0XHRyZXR1cm4gVVJJLnBhcnNlKGNoYXRLZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlc29sdmVzIHRoZSBDb3BpbG90IFNESyBjb252ZXJzYXRpb24gaWQgYmFja2luZyBhIHNlc3Npb24gVVJJLCBmYWxsaW5nIGJhY2sgdG8gdGhlIEFIIHNlc3Npb24gaWQuICovXG5cdHByaXZhdGUgX3Nka0NvbnZlcnNhdGlvbklkKHNlc3Npb246IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9maW5kU2Vzc2lvbkNoYXQoc2Vzc2lvbik/LnNlc3Npb25JZFxuXHRcdFx0Pz8gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKT8uc2RrU2Vzc2lvbklkXG5cdFx0XHQ/PyB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpPy5zZGtTZXNzaW9uSWRcblx0XHRcdD8/IHNlc3Npb25JZDtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHRoZSBjaGF0IFVSSSBib3VuZCB0byB0aGUgc2Vzc2lvbi1iYWNrZWQgY2hhdCwgaWYgYW55LiAqL1xuXHRwcml2YXRlIF9maW5kU2Vzc2lvbkNoYXRVcmkoc2Vzc2lvbjogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZEJvdW5kU2Vzc2lvbkNoYXRVcmkodGhpcy5fc2RrQ29udmVyc2F0aW9uSWQoc2Vzc2lvbikpO1xuXHR9XG5cblx0LyoqIE5vcm1hbGl6ZXMgYW4gYWRkcmVzc2VkIGNoYXQgb3BlcmF0aW9uIGFuZCByZWZyZXNoZXMgYW55IGhvc3Qgc25hcHNob3QgY2FycmllZCBpbiBpdHMgY29udGV4dC4gKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQ6IFVSSSwgc2Vzc2lvbk9yQ29udGV4dDogQWdlbnRDaGF0T3BlcmF0aW9uQ29udGV4dCk6IElSZXNvbHZlZENvcGlsb3RDaGF0Q29udGV4dCB7XG5cdFx0Y29uc3QgZXhwbGljaXQgPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChzZXNzaW9uT3JDb250ZXh0LCBjaGF0KTtcblx0XHR0aGlzLl9ub3RlSG9zdEN1c3RvbWl6YXRpb25zKHNlc3Npb25PckNvbnRleHQpO1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlRXhwbGljaXRDaGF0Q29udGV4dChjaGF0LCBleHBsaWNpdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlU2VuZENoYXRDb250ZXh0KGNoYXQ6IFVSSSwgb3BlcmF0aW9uQ29udGV4dD86IEFnZW50Q2hhdE9wZXJhdGlvbkNvbnRleHQpOiBJUmVzb2x2ZWRDb3BpbG90Q2hhdENvbnRleHQge1xuXHRcdGlmIChvcGVyYXRpb25Db250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGJhY2tpbmcgPyB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoYmFja2luZy5zZGtTZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghYmFja2luZyB8fCAhdGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbGQgQ29waWxvdCBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBleHBsaWNpdCBob3N0IGNvbnRleHQ6ICR7Y2hhdEtleX1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3duZXJTZXNzaW9uID0gdGFyZ2V0Lm93bmVyU2Vzc2lvblVyaSA/PyB0YXJnZXQuc2Vzc2lvblVyaTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBvd25lclNlc3Npb24sXG5cdFx0XHRjb25maWd1cmF0aW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChvd25lclNlc3Npb24pLFxuXHRcdFx0cmVzb3VyY2U6IHRhcmdldC5yZXNvdXJjZVVyaSxcblx0XHRcdGNoYXQsXG5cdFx0XHRjaGF0S2V5LFxuXHRcdFx0c2RrU2Vzc2lvbklkOiBiYWNraW5nLnNka1Nlc3Npb25JZCxcblx0XHRcdHNlcXVlbmNlcktleTogYmFja2luZy5zZGtTZXNzaW9uSWQsXG5cdFx0XHR0YXJnZXQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBMZWdhY3kgdHJ1bmNhdGlvbiBtYXkgc3RpbGwgb21pdCBjb250ZXh0IGZvciBhIGxpdmUgY2hhdC4gKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVRydW5jYXRlQ2hhdENvbnRleHQoY2hhdDogVVJJLCBvcGVyYXRpb25Db250ZXh0PzogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBJUmVzb2x2ZWRDb3BpbG90Q2hhdENvbnRleHQge1xuXHRcdGlmIChvcGVyYXRpb25Db250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGJhY2tpbmcgPyB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoYmFja2luZy5zZGtTZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghYmFja2luZyB8fCAhdGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbGQgQ29waWxvdCBjaGF0IG9wZXJhdGlvbiByZXF1aXJlcyBleHBsaWNpdCBob3N0IGNvbnRleHQ6ICR7Y2hhdEtleX1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3duZXJTZXNzaW9uID0gdGFyZ2V0Lm93bmVyU2Vzc2lvblVyaSA/PyB0YXJnZXQuc2Vzc2lvblVyaTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBvd25lclNlc3Npb24sXG5cdFx0XHRjb25maWd1cmF0aW9uSWQ6IEFnZW50U2Vzc2lvbi5pZChvd25lclNlc3Npb24pLFxuXHRcdFx0cmVzb3VyY2U6IHRhcmdldC5yZXNvdXJjZVVyaSxcblx0XHRcdGNoYXQsXG5cdFx0XHRjaGF0S2V5LFxuXHRcdFx0c2RrU2Vzc2lvbklkOiBiYWNraW5nLnNka1Nlc3Npb25JZCxcblx0XHRcdHNlcXVlbmNlcktleTogYmFja2luZy5zZGtTZXNzaW9uSWQsXG5cdFx0XHR0YXJnZXQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVFeHBsaWNpdENoYXRDb250ZXh0KGNoYXQ6IFVSSSwgY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQpOiBJUmVzb2x2ZWRDb3BpbG90Q2hhdENvbnRleHQge1xuXHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgYmFja2luZyA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY2hhdEtleSk7XG5cdFx0Y29uc3QgYm91bmRUYXJnZXQgPSBiYWNraW5nID8gdGhpcy5fZmluZFNlc3Npb25CeVNka0lkKGJhY2tpbmcuc2RrU2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGJvdW5kVGFyZ2V0O1xuXHRcdGNvbnN0IHNka1Nlc3Npb25JZCA9IGJhY2tpbmc/LnNka1Nlc3Npb25JZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlndXJhdGlvblJlc291cmNlOiBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25JZCxcblx0XHRcdHJlc291cmNlOiBjb250ZXh0LnJlc291cmNlLFxuXHRcdFx0Y2hhdCxcblx0XHRcdGNoYXRLZXksXG5cdFx0XHRzZGtTZXNzaW9uSWQsXG5cdFx0XHRzZXF1ZW5jZXJLZXk6IHNka1Nlc3Npb25JZCA/PyBjaGF0S2V5LFxuXHRcdFx0dGFyZ2V0LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSdW50aW1lU2xhc2hDb21tYW5kcyhzZXNzaW9uSWQ6IHN0cmluZywgb3B0aW9ucz86IElDb3BpbG90UnVudGltZVNsYXNoQ29tbWFuZFF1ZXJ5T3B0aW9ucykge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoc2Vzc2lvbklkKTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHNlc3Npb24uZ2V0UnVudGltZVNsYXNoQ29tbWFuZHMob3B0aW9ucykgPz8gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5nZXRTbGFzaENvbW1hbmRzKG9wdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoYXQtYWRkcmVzc2VkIHN1cmZhY2UgZm9yIHRoZSBjaGF0cyB3aXRoaW4gYSBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+ID0+IHtcblx0XHRcdHRoaXMuX25vdGVIb3N0Q3VzdG9taXphdGlvbnMoY29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ2hhdChjaGF0LCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KSwgb3B0aW9ucyk7XG5cdFx0fSxcblx0XHRkaXNwb3NlQ2hhdDogKGNoYXRVcmk6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHRoaXMuX2Rpc3Bvc2VDaGF0KGNoYXRVcmksIGNvbnRleHQpLFxuXHRcdHJlbGVhc2VDaGF0OiAoY2hhdFVyaTogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4gdGhpcy5fcmVsZWFzZUNoYXQoY2hhdFVyaSwgY29udGV4dCksXG5cdFx0c2VuZE1lc3NhZ2U6IChjaGF0VXJpOiBVUkksIHByb21wdDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeTogcmVhZG9ubHkgVVJJW10gfCBVUkkgfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBzZW5kZXJDbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZU9yQ29udGV4dD86IEFnZW50SG9zdENsaWVudFR5cGUgfCBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgY29udGV4dD86IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBBcnJheS5pc0FycmF5KHdvcmtpbmdEaXJlY3Rvcmllc09yRGlyZWN0b3J5KSA/IHdvcmtpbmdEaXJlY3Rvcmllc09yRGlyZWN0b3J5IDogd29ya2luZ0RpcmVjdG9yaWVzT3JEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yaWVzT3JEaXJlY3RvcnldIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY2xpZW50VHlwZSA9IHR5cGVvZiBjbGllbnRUeXBlT3JDb250ZXh0ID09PSAnc3RyaW5nJyA/IGNsaWVudFR5cGVPckNvbnRleHQgOiBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd247XG5cdFx0XHRjb25zdCBvcGVyYXRpb25Db250ZXh0ID0gY29udGV4dCA/PyAodHlwZW9mIGNsaWVudFR5cGVPckNvbnRleHQgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogY2xpZW50VHlwZU9yQ29udGV4dCk7XG5cdFx0XHRjb25zdCBjbGllbnRUZWxlbWV0cnlDb250ZXh0ID0gVVJJLmlzVXJpKG9wZXJhdGlvbkNvbnRleHQpID8gdW5kZWZpbmVkIDogb3BlcmF0aW9uQ29udGV4dD8uY2xpZW50VGVsZW1ldHJ5Q29udGV4dDtcblx0XHRcdHJldHVybiB0aGlzLl9zZW5kTWVzc2FnZShjaGF0VXJpLCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlLCB3b3JraW5nRGlyZWN0b3JpZXMsIG9wZXJhdGlvbkNvbnRleHQsIGNsaWVudFRlbGVtZXRyeUNvbnRleHQpO1xuXHRcdH0sXG5cdFx0YWJvcnQ6IChjaGF0VXJpOiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWJvcnRTZXNzaW9uKGNoYXRVcmksIGNvbnRleHQpO1xuXHRcdH0sXG5cdFx0Y2hhbmdlTW9kZWw6IChjaGF0VXJpOiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+ID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGFuZ2VNb2RlbChjaGF0VXJpLCBtb2RlbCwgY29udGV4dCk7XG5cdFx0fSxcblx0XHRjaGFuZ2VBZ2VudDogKGNoYXRVcmk6IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NoYW5nZUFnZW50KGNoYXRVcmksIGFnZW50LCBjb250ZXh0KTtcblx0XHR9LFxuXHRcdGdldE1lc3NhZ2VzOiAoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiA9PiB0aGlzLl9nZXRDaGF0TWVzc2FnZXMoY2hhdCwgY29udGV4dCksXG5cdH07XG5cblx0LyoqIENyZWF0ZXMgb25lIGV4YWN0IGNoYXQgYmFja2luZzogZnJlc2gsIGRlZmVycmVkLCBpbXBvcnRlZCwgZm9ya2VkLCBvciBzaWRlLWNoYXQuICovXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUNoYXQoY2hhdDogVVJJLCBjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCwgb3B0aW9uczogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMgPSB7fSk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRcdGNvbnN0IHNjb3BlID0gY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHQvLyBBIGR1cGxpY2F0ZS9yZWNvbm5lY3QgY3JlYXRlIGNhbGwgZm9yIGEgY2hhdCB0aGUgYWdlbnQgYWxyZWFkeSBiaW5kcyBcdTIwMTRcblx0XHQvLyBsaXZlIChhIHJlYWwgcnVubmluZyBzZXNzaW9uKSwgcHJvdmlzaW9uYWwvcmVzZXJ2ZWQsIG9yIHJlc3RvcmVkIHZpYVxuXHRcdC8vIGBtYXRlcmlhbGl6ZUNoYXRgIFx1MjAxNCBtdXN0IG5ldmVyIHJvbGwgYmFjayB0aGF0IHByZWV4aXN0aW5nIGJpbmRpbmcganVzdFxuXHRcdC8vIGJlY2F1c2UgdGhpcyBwYXJ0aWN1bGFyIHJldHJ5IGZhaWxzOyBvbmx5IGEgYnJhbmQtbmV3IGNoYXQncyBvd25cblx0XHQvLyBwYXJ0aWFsIHN0YXRlIGlzIG91cnMgdG8gdW53aW5kLiBDYXB0dXJlZCBiZWZvcmUgYF9yZW1lbWJlckNoYXRTY29wZWBcblx0XHQvLyBydW5zICh3aGljaCByZS1yZWNvcmRzIHRoZSBzYW1lIHNjb3BlIGZvciBhbiBpZGVtcG90ZW50IGR1cGxpY2F0ZSkgc29cblx0XHQvLyB0aGUgY2hlY2sgcmVmbGVjdHMgd2hhdCBleGlzdGVkIHdhbGtpbmcgaW4sIG5vdCB3aGF0IHRoaXMgY2FsbCBhZGRlZC5cblx0XHRjb25zdCBwcmVleGlzdGluZyA9IHRoaXMuX2NoYXRTY29wZXMuaGFzKGNoYXRLZXkpIHx8IHRoaXMuX2NoYXRCYWNraW5ncy5oYXMoY2hhdEtleSkgfHwgISF0aGlzLl9maW5kQ2hhdEJ5VXJpKGNoYXQpO1xuXHRcdHRoaXMuX3JlbWVtYmVyQ2hhdFNjb3BlKGNoYXQsIHNjb3BlLCBjb250ZXh0LnJlc291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKG9wdGlvbnMuZGVmZXJCYWNraW5nKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9yZXNlcnZlQ2hhdEJhY2tpbmcoY2hhdCwgY29udGV4dCwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ltcG9ydENoYXRCYWNraW5nKGNoYXQsIGNvbnRleHQsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX21pbnRDaGF0QmFja2luZyhjaGF0LCBjb250ZXh0LCBvcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFwcmVleGlzdGluZykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yb2xsYmFja0ZhaWxlZENoYXRDcmVhdGUoY2hhdCwgc2NvcGUsIG9wdGlvbnMud29ya2luZ0RpcmVjdG9yaWVzID09PSB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVuZG9lcyB0aGUgYm9va2tlZXBpbmcge0BsaW5rIF9jcmVhdGVDaGF0fSByZWNvcmRlZCBmb3IgYGNoYXRgIGJlZm9yZSBhXG5cdCAqIGNyZWF0ZSBhdHRlbXB0IHRocm93cyAoY2xpZW50IHN0YXJ0dXAsIGltcG9ydC9yZXN1bWUsIG9yIGZvcmsvbW9kZWwvbWludFxuXHQgKiBmYWlsdXJlcyksIHNvIGEgZmFpbGVkIGNyZWF0ZSBuZXZlciBwZXJtYW5lbnRseSBwaW5zIHRoZSBjb25maWd1cmF0aW9uXG5cdCAqIHNjb3BlJ3Mgc2hhcmVkIHJ1bnRpbWUuIFdpdGhvdXQgdGhpcywgdGhlIHNjb3BlIHJlY29yZGVkIGJ5XG5cdCAqIHtAbGluayBfcmVtZW1iZXJDaGF0U2NvcGV9IGJlZm9yZSB0aGUgZmFpbGluZyBvcGVyYXRpb24gc3RheXMgaW5cblx0ICoge0BsaW5rIF9jaGF0U2NvcGVzfSBmb3JldmVyLCBzbyB7QGxpbmsgX3JlbWFpbmluZ0NoYXRzRm9yU2NvcGV9IG5ldmVyXG5cdCAqIHJlYWNoZXMgemVybyBhbmQgdGhlIHNjb3BlJ3MgQWN0aXZlQ2xpZW50L3BsdWdpbi9NQ1Agc3RhdGUsIHNlc3Npb25cblx0ICogbGlmZXRpbWUsIGhvc3QgY3VzdG9taXphdGlvbnMsIHNjcmF0Y2ggZGlyLCBhbmQgdHJhY2UgY29udGV4dCBsZWFrIGZvclxuXHQgKiB0aGUgbGlmZXRpbWUgb2YgdGhlIHByb2Nlc3MuXG5cdCAqXG5cdCAqIE9ubHkgdGhpcyBjaGF0J3Mgb3duIG1lbWJlcnNoaXAvcGFydGlhbCBzdGF0ZSBpcyB0b3JuIGRvd24gaGVyZTsgdGhlXG5cdCAqIHNjb3BlJ3MgcHJvdmlkZXItb3duZWQgcmVzb3VyY2VzIGFyZSBmaW5hbGl6ZWQgXHUyMDE0IHRoZSBzYW1lIGNsZWFudXAgYVxuXHQgKiBub3JtYWwgYGRpc3Bvc2VDaGF0YCBydW5zIG9uY2UgdGhlIGxhc3QgY2hhdCBpcyBnb25lIFx1MjAxNCBvbmx5IHdoZW4gbm9cblx0ICogb3RoZXIgY2hhdCBzdGlsbCBzaGFyZXMgYHNjb3BlYCwgc28gYW4gZWFybGllciBzdWNjZXNzZnVsIHNpYmxpbmcgY3JlYXRlXG5cdCAqIGtlZXBzIHRoZSByZXNvdXJjZXMgaXQgZGVwZW5kcyBvbi5cblx0ICpcblx0ICogQ2FsbGVycyBtdXN0IG9ubHkgaW52b2tlIHRoaXMgZm9yIGEgY2hhdCB0aGF0IGhhZCBubyBwcmVleGlzdGluZ1xuXHQgKiBiaW5kaW5nIHdoZW4gYF9jcmVhdGVDaGF0YCBzdGFydGVkOyB7QGxpbmsgX2NyZWF0ZUNoYXR9IGl0c2VsZiBndWFyZHNcblx0ICogdGhhdCwgc28gYSBkdXBsaWNhdGUvcmVjb25uZWN0IGNyZWF0ZSBhdHRlbXB0IHRoYXQgZmFpbHMgbmV2ZXIgdGVhcnNcblx0ICogZG93biB0aGUgbGl2ZS9wcm92aXNpb25hbC9yZXN0b3JlZCBiaW5kaW5nIGl0IGZvdW5kIGFscmVhZHkgaW4gcGxhY2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yb2xsYmFja0ZhaWxlZENoYXRDcmVhdGUoY2hhdDogVVJJLCBzY29wZTogVVJJLCB3b3Jrc3BhY2VsZXNzSGludDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2NvcGVJZCA9IEFnZW50U2Vzc2lvbi5pZChzY29wZSk7XG5cdFx0Ly8gVGhlIHNjb3BlIHdhcyByZWNvcmRlZCBvcHRpbWlzdGljYWxseSBiZWZvcmUgdGhlIGNyZWF0ZSBhdHRlbXB0OyBpdFxuXHRcdC8vIG5ldmVyIHByb2R1Y2VkIGEgYmFja2luZywgc28gaXQgbXVzdCBzdG9wIGNvdW50aW5nIGFzIGEgbGl2ZSBjaGF0LlxuXHRcdHRoaXMuX2NoYXRTY29wZXMuZGVsZXRlKGNoYXRLZXkpO1xuXHRcdHRoaXMuX2NoYXRTdG9yYWdlU2NvcGVzLmRlbGV0ZShjaGF0S2V5KTtcblx0XHQvLyBBIHBhcnRpYWxseS1jb21wbGV0ZWQgcmVzZXJ2ZS9pbXBvcnQgY2FuIHJlY29yZCBhIGJhY2tpbmcgYmVmb3JlIHRoZVxuXHRcdC8vIG9wZXJhdGlvbiB0aGF0IGZvbGxvd3MgaXQgZmFpbHMgKGUuZy4gYF9yZXN1bWVTZXNzaW9uYCByZWNvcmRzIG9uZVxuXHRcdC8vIHVuY29uZGl0aW9uYWxseSBiZWZvcmUgcmVzdW1pbmcpIFx1MjAxNCBkcm9wIGFueSBzdWNoIGdob3N0IGVudHJ5LlxuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5kZWxldGUoY2hhdEtleSk7XG5cdFx0Ly8gRHJvcCB0aGlzIGNoYXQncyBtZW1iZXJzaGlwIGZyb20gdGhlIHNjb3BlJ3MgQWN0aXZlQ2xpZW50LCBpZiBhbnkgd2FzXG5cdFx0Ly8gY2xhaW1lZCBiZWZvcmUgdGhlIGZhaWx1cmUgKGEgbm8tb3Agb3RoZXJ3aXNlKS5cblx0XHR0aGlzLl9hY3RpdmVDbGllbnRzLmdldChzY29wZSk/LnJlbW92ZUNoYXQoY2hhdCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIE5vIG90aGVyIGNoYXQgc3RpbGwgc2hhcmVzIHRoaXMgc2NvcGU6IHJ1biB0aGUgc2FtZSBwcm92aWRlci1vd25lZFxuXHRcdFx0Ly8gY2xlYW51cCBhIG5vcm1hbCBgZGlzcG9zZUNoYXRgIHJ1bnMgb25jZSB0aGUgbGFzdCBjaGF0IGlzIGdvbmUuXG5cdFx0XHRpZiAodGhpcy5fcmVtYWluaW5nQ2hhdHNGb3JTY29wZShzY29wZSkgPT09IDApIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZmluYWxpemVDb25maWd1cmF0aW9uU2NvcGUoc2NvcGUsIHNjb3BlSWQsIHdvcmtzcGFjZWxlc3NIaW50KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byBmaW5hbGl6ZSBjb25maWd1cmF0aW9uIHNjb3BlICR7c2NvcGUudG9TdHJpbmcoKX0gYWZ0ZXIgYSBmYWlsZWQgY2hhdCBjcmVhdGlvbjogJHtjbGVhbnVwRXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNsZWFudXBFcnJvci5tZXNzYWdlIDogU3RyaW5nKGNsZWFudXBFcnJvcil9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJlc2VydmVzIGFuIFNESyBpZCBub3cgYW5kIGRlZmVycyByZWFsIHNlc3Npb24gY3JlYXRpb24gdG8gdGhlIGZpcnN0IHNlbmQuICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc2VydmVDaGF0QmFja2luZyhjaGF0OiBVUkksIGNvbnRleHQ6IElBZ2VudENoYXRDb250ZXh0LCBvcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQ3JlYXRpbmcgY2hhdCAke2NoYXQudG9TdHJpbmcoKX0gd2l0aCBhIGRlZmVycmVkIGJhY2tpbmcuLi4gJHtvcHRpb25zLm1vZGVsID8gYG1vZGVsPSR7b3B0aW9ucy5tb2RlbC5pZH1gIDogJyd9YCk7XG5cdFx0Y29uc3Qgc2RrU2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Ly8gTm8gd29ya2luZyBkaXJlY3RvcnkgbWVhbnMgYSB3b3Jrc3BhY2UtbGVzcyBjaGF0IHRoYXQgcnVucyBpbiBhIHN0YWJsZSBzY3JhdGNoIGRpci5cblx0XHRjb25zdCBpc1dvcmtzcGFjZWxlc3MgPSBvcHRpb25zLndvcmtpbmdEaXJlY3RvcmllcyA9PT0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ3JlYXRlV29ya2luZ0RpcmVjdG9yeShvcHRpb25zLCBzZXNzaW9uSWQsIGlzV29ya3NwYWNlbGVzcyk7XG5cdFx0YXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cblx0XHQvLyBJZGVtcG90ZW5jeTogYSBkdXBsaWNhdGUgY3JlYXRpb24gZm9yIGEgY2hhdCB0aGF0IGhhcyBhbHJlYWR5IGJlZW5cblx0XHQvLyBwcm9tb3RlZCB0byBhIHJlYWwgU0RLIHNlc3Npb24gKG9yIHJlc3RvcmVkIGZyb20gZGlzaykgaXMgYSBuby1vcDsgd2Vcblx0XHQvLyByZXR1cm4gdGhlIG5vbi1wcm92aXNpb25hbCByZXN1bHQgc28gdGhlIGNhbGxlciBkb2Vzbid0IHJlLWZpcmVcblx0XHQvLyBgU2Vzc2lvbkFkZGVkYC4gVGhpcyBndWFyZHMgYWdhaW5zdCBjbGllbnQgcmV0cmllcyB0aGF0IHJhY2UgYVxuXHRcdC8vIHN1Y2Nlc3NmdWwgZmlyc3QgbWVzc2FnZS5cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2ZpbmRDaGF0QnlVcmkoY2hhdCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBjcmVhdGVDaGF0IGlzIGEgbm8tb3A6IGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9IGlzIGFscmVhZHkgYmFja2VkIGJ5IGEgbGl2ZSBydW50aW1lYCk7XG5cdFx0XHRjb25zdCBwcm9qZWN0ID0gYXdhaXQgcHJvamVjdEZyb21Db3BpbG90Q29udGV4dCh7IGN3ZDogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGggfSwgdGhpcy5fZ2l0U2VydmljZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdC4uLihwcm9qZWN0ID8geyBwcm9qZWN0IH0gOiB7fSksXG5cdFx0XHRcdC4uLnRoaXMuX2NoYXRCYWNraW5nUmVzdWx0KHNlc3Npb25JZCwgeyBzZGtTZXNzaW9uSWQ6IGV4aXN0aW5nLnNlc3Npb25JZCB9KSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gSWRlbXBvdGVudDogYSBkdXBsaWNhdGUgY3JlYXRpb24gZm9yIGEgY2hhdCB3aG9zZSBiYWNraW5nIGlzIHN0aWxsXG5cdFx0Ly8gcmVzZXJ2ZWQgKGUuZy4gYSBjbGllbnQgcmV0cmllZCBvbiByZWNvbm5lY3Qgd2l0aCB0aGUgc2FtZSBVUkkpIGtlZXBzXG5cdFx0Ly8gdGhlIGV4aXN0aW5nIHJlY29yZC4gV2UgZGVsaWJlcmF0ZWx5IGRvIE5PVCBvdmVyd3JpdGUgYG1vZGVsYCBvclxuXHRcdC8vIGB3b3JraW5nRGlyZWN0b3J5YDogYSByZS1jcmVhdGUgcGF5bG9hZCBmcm9tIGEgZnJlc2ggY29ubmVjdGlvbiBzZW5kc1xuXHRcdC8vIHRoZSBlYWdlci1jcmVhdGUgZGVmYXVsdHMgKG1vZGVsOiB1bmRlZmluZWQsIHRoZSBzYW1lIHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdC8vIHdoaWNoIHdvdWxkIGNsb2JiZXIgdGhlIHVzZXIncyBzZWxlY3Rpb25zIGFjY3VtdWxhdGVkIHNpbmNlIHRoZVxuXHRcdC8vIG9yaWdpbmFsIGNyZWF0ZS4gVGhlIGFjdGl2ZS1jbGllbnQgLyBwbHVnaW4gc3luYyBiZWxvdyBzdGlsbCBydW5zIHNvXG5cdFx0Ly8gdGhlIG5ldyBjb25uZWN0aW9uJ3MgY2xhaW0gdGFrZXMgZWZmZWN0LlxuXHRcdGNvbnN0IHJlc2VydmVkID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblxuXHRcdC8vIFNlZWQgYWN0aXZlLWNsaWVudCBzbmFwc2hvdCBpZiB0aGUgY2xpZW50IGNsYWltZWQgaXQgZWFnZXJseS4gVGhpc1xuXHRcdC8vIHJ1bnMgaWRlbnRpY2FsbHkgZm9yIHJlc2VydmVkIGFuZCByZWFsIGJhY2tpbmdzOyB0aGUgU0RLIHNpZGUgb2Zcblx0XHQvLyBhY3RpdmVDbGllbnQgc3RhdGUgaXNuJ3QgZW5nYWdlZCB1bnRpbCBtYXRlcmlhbGl6YXRpb24uXG5cdFx0aWYgKG9wdGlvbnMuYWN0aXZlQ2xpZW50KSB7XG5cdFx0XHRjb25zdCBhYyA9IHRoaXMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KHNlc3Npb24sIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0Ly8gTXVsdGktcm9vdDogYW5jaG9yIGRpc2NvdmVyeSB0byB0aGUgYWRkaXRpb25hbCAobm9uLXByaW1hcnkpIHJvb3RzIHRvbywgc28gYVxuXHRcdFx0Ly8gc3RpbGwtcHJvdmlzaW9uYWwgKHByZS1zZW5kKSBjaGF0IHN1cmZhY2VzIGN1c3RvbWl6YXRpb25zIGZyb20gZXZlcnkgZm9sZGVyIFx1MjAxNCBub3Rcblx0XHRcdC8vIGp1c3QgdGhlIHByaW1hcnkuIEVtcHR5IHdoZW4gc2luZ2xlLXJvb3QgLyBnYXRlZCBvZmYgKGJ5dGUtaWRlbnRpY2FsKS5cblx0XHRcdGFjLnBsdWdpbkNvbnRyb2xsZXIuc2V0QWRkaXRpb25hbERpcmVjdG9yaWVzKHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMob3B0aW9ucy53b3JraW5nRGlyZWN0b3JpZXMpKTtcblx0XHRcdGNvbnN0IHNlZWRlZCA9IG9wdGlvbnMuYWN0aXZlQ2xpZW50O1xuXHRcdFx0YWMudG9vbFNldC5zZXQoc2VlZGVkLmNsaWVudElkLCBzZWVkZWQudG9vbHMpO1xuXHRcdFx0YWMuZ2V0T3JDcmVhdGVIYW5kbGUoc2VlZGVkLmNsaWVudElkLCBzZWVkZWQuZGlzcGxheU5hbWUpO1xuXHRcdFx0Ly8gQSBmcmVzaGx5LWNyZWF0ZWQgc2Vzc2lvbiBoYXMgZXhhY3RseSBvbmUgY2hhdCBcdTIwMTQgdGhlIGV4YWN0IHRhcmdldFxuXHRcdFx0Ly8gdGhlIGhvc3QgcHJvdmlzaW9uZWQgaXQgd2l0aCBcdTIwMTQgc28gc2VlZCB0aGUgZWFnZXIgY2xhaW1hbnQnc1xuXHRcdFx0Ly8gbWVtYmVyc2hpcCB3aXRoIGl0LiBUaGUgaG9zdCdzIGZpcnN0IGBnZXRPckNyZWF0ZUFjdGl2ZUNsaWVudGBcblx0XHRcdC8vIGZhbi1vdXQgZm9yIGEgcGVlciBjaGF0IGFkZHMgdG8gdGhpcyBpbmNyZW1lbnRhbGx5LlxuXHRcdFx0dGhpcy5fYWRvcHRDbGllbnRDaGF0KGFjLCBzZWVkZWQuY2xpZW50SWQsIGNoYXQpO1xuXHRcdFx0aWYgKHNlZWRlZC5jdXN0b21pemF0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIEVhZ2VyIHByZS1zZW5kIGNsYWltOiBubyBzZXNzaW9uLXN0YXRlIGxpc3RlbmVyIGlzIGhvb2tlZCB1cFxuXHRcdFx0XHQvLyB5ZXQsIHNvIHN1cHByZXNzIGFjdGlvbiBldmVudHMuIFRoZSBzZXNzaW9uIHJlYWRzIHRoZSBmaW5hbFxuXHRcdFx0XHQvLyB2aWV3IHZpYSBpdHMgaW5pdGlhbCBzbmFwc2hvdCBvbmNlIGl0IG1hdGVyaWFsaXplcy5cblx0XHRcdFx0YXdhaXQgYWMucGx1Z2luQ29udHJvbGxlci5zeW5jKHNlZWRlZC5jbGllbnRJZCwgc2VlZGVkLmN1c3RvbWl6YXRpb25zLCB7IHF1aWV0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbXB1dGUgcHJvamVjdCBtZXRhZGF0YSBjaGVhcGx5IGZyb20gdGhlIG9yaWdpbmFsIHdvcmtpbmcgZGlyLlxuXHRcdC8vIFdvcmt0cmVlcyBhcmVuJ3QgY3JlYXRlZCB1bnRpbCBtYXRlcmlhbGl6YXRpb24sIHNvIHRoZSBwcm9qZWN0IGlzXG5cdFx0Ly8gcmVwb3J0ZWQgcmVsYXRpdmUgdG8gdGhlIHVzZXIncyBjaG9zZW4gZm9sZGVyLlxuXHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LCB0aGlzLl9naXRTZXJ2aWNlKTtcblxuXHRcdGlmICghcmVzZXJ2ZWQpIHtcblx0XHRcdHRoaXMuX3Jlc2V0U2Vzc2lvbkxpZmV0aW1lKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLnNldChzZXNzaW9uSWQsIHtcblx0XHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0XHRzZGtTZXNzaW9uSWQsXG5cdFx0XHRcdHNlc3Npb25Vcmk6IHNlc3Npb24sXG5cdFx0XHRcdGNoYXQsXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogb3B0aW9ucy53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRcdG1vZGVsOiBvcHRpb25zLm1vZGVsLFxuXHRcdFx0XHRhZ2VudDogb3B0aW9ucy5hZ2VudCxcblx0XHRcdFx0cHJvamVjdCxcblx0XHRcdFx0d29ya3NwYWNlbGVzczogaXNXb3Jrc3BhY2VsZXNzLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgeyBzZGtTZXNzaW9uSWQgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQ2hhdCBjcmVhdGVkOyBpdHMgYmFja2luZyBzdGF5cyBkZWZlcnJlZCB1bnRpbCB0aGUgZmlyc3Qgc2VuZDogJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdHByb3Zpc2lvbmFsOiB0cnVlLFxuXHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3QgfSA6IHt9KSxcblx0XHRcdC4uLnRoaXMuX2NoYXRCYWNraW5nUmVzdWx0KHNlc3Npb25JZCwgeyBzZGtTZXNzaW9uSWQ6IHJlc2VydmVkPy5zZGtTZXNzaW9uSWQgPz8gc2RrU2Vzc2lvbklkIH0pLFxuXHRcdH07XG5cdH1cblxuXHQvKiogTWludHMgdGhlIGNoYXQncyBiYWNraW5nIGZyb20gYW4gaW1wb3J0ZWQgY29udmVyc2F0aW9uIHN1cHBsaWVkIGJ5IEFnZW50IEhvc3QuICovXG5cdHByaXZhdGUgYXN5bmMgX2ltcG9ydENoYXRCYWNraW5nKGNoYXQ6IFVSSSwgY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQsIG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUNyZWF0ZVdvcmtpbmdEaXJlY3Rvcnkob3B0aW9ucywgc2Vzc2lvbklkLCBvcHRpb25zLndvcmtpbmdEaXJlY3RvcmllcyA9PT0gdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRpZiAoIXRoaXMuX2ZpbmRTZXNzaW9uQnlTZGtJZChzZXNzaW9uSWQpICYmICF0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9yZXNldFNlc3Npb25MaWZldGltZShzZXNzaW9uSWQpO1xuXHRcdH1cblx0XHQvLyBUaHJlYWQgdGhlIGV4YWN0IHRhcmdldCBgY2hhdGAgdGhyb3VnaCBzbyB0aGUgY3JlYXRpb24gYmluZHMgdGhlXG5cdFx0Ly8gaW1wb3J0ZWQgY29udmVyc2F0aW9uIGRpcmVjdGx5IGR1cmluZyByZXN1bWUuXG5cdFx0cmV0dXJuIHRoaXMuX2ltcG9ydENvbnZlcnNhdGlvbihvcHRpb25zLCBzZXNzaW9uSWQsIHdvcmtpbmdEaXJlY3RvcnksIGNoYXQpO1xuXHR9XG5cblx0LyoqIFNlZWRzIGFuIGltcG9ydGVkIGNvbnZlcnNhdGlvbiBpbnRvIHRoZSBTREsgc3RvcmUsIHRoZW4gcmVzdW1lcyBpdCBhcyBhIGxpdmUgZWRpdGFibGUgY2hhdC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfaW1wb3J0Q29udmVyc2F0aW9uKG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCBzZXNzaW9uSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCBpbXBvcnRDb25maWcgPSBvcHRpb25zLmltcG9ydENvbnZlcnNhdGlvbiE7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gdGhpcy5fcXVldWVTZXNzaW9uKHNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gSW1wb3J0aW5nIGNvbnZlcnNhdGlvbiBpbnRvIHNlc3Npb24gJHtzZXNzaW9uSWR9ICgke2ltcG9ydENvbmZpZy50dXJucy5sZW5ndGh9IHR1cm5zKWApO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBpbXBvcnRDb25maWcubW9kZWwgPz8gb3B0aW9ucy5tb2RlbDtcblxuXHRcdFx0Ly8gVHJhbnNsYXRlIHRoZSBjb252ZXJzYXRpb24gYW5kIHNlZWQgaXQgYXQgdGhlIENMSSdzIG5hdGl2ZVxuXHRcdFx0Ly8gcGVyLXNlc3Npb24gc3RvcmUgc28gYSBub3JtYWwgcmVzdW1lIHJlY29uc3RpdHV0ZXMgZWRpdGFibGUgdHVybnMuXG5cdFx0XHQvLyBEZXRlY3QgdGhlIHByb2plY3QgY29uY3VycmVudGx5IHdpdGggdGhlIChpbmRlcGVuZGVudCkgZXZlbnQtbG9nIHdyaXRlXG5cdFx0XHQvLyBzbyB0aGUgZ2l0IHByb2JlIGFuZCBmaWxlIEkvTyBvdmVybGFwIG9uIHRoZSBzZXNzaW9uLWNyZWF0aW9uIHBhdGguXG5cdFx0XHRjb25zdCBwcm9qZWN0UHJvbWlzZSA9IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZXZlbnRzUGF0aCA9IGpvaW4oZ2V0Q29waWxvdEhvbWVQYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgsIHByb2Nlc3MuZW52KSwgJ3Nlc3Npb24tc3RhdGUnLCBzZXNzaW9uSWQsICdldmVudHMuanNvbmwnKTtcblx0XHRcdGNvbnN0IGpzb25sID0gYnVpbGRTZXNzaW9uRXZlbnRMb2dGcm9tVHVybnMoaW1wb3J0Q29uZmlnLnR1cm5zLCB7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGgsXG5cdFx0XHRcdG1vZGVsOiBtb2RlbD8uaWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKGRpcm5hbWUoZXZlbnRzUGF0aCksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGV2ZW50c1BhdGgsIGpzb25sLCAndXRmOCcpO1xuXG5cdFx0XHQvLyBQZXJzaXN0IG1ldGFkYXRhIGJlZm9yZSByZXN1bWUgc28gYF9yZXN1bWVTZXNzaW9uYCBjYW4gcmVzb2x2ZSB0aGVcblx0XHRcdC8vIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCBtb2RlbC5cblx0XHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBwcm9qZWN0UHJvbWlzZTtcblx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25VcmksIG1vZGVsLCB3b3JraW5nRGlyZWN0b3J5LCBvcHRpb25zLndvcmtpbmdEaXJlY3RvcmllcyA/PyAoW3dvcmtpbmdEaXJlY3RvcnldKSwgd29ya2luZ0RpcmVjdG9yeSwgcHJvamVjdCk7XG5cdFx0XHRpZiAob3B0aW9ucy5hZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbkFnZW50TWV0YWRhdGEoc2Vzc2lvblVyaSwgb3B0aW9ucy5hZ2VudCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlc3VtZSBzbyB0aGUgU0RLIGxvYWRzIHRoZSBzZWVkZWQgaGlzdG9yeSBhcyBlZGl0YWJsZSB0dXJucy4gVGhlXG5cdFx0XHQvLyBzZWVkZWQgZXZlbnQgbG9nIGxpdmVzIGF0IHRoZSBzZXNzaW9uJ3Mgb3duIFNESyBpZCwgc28gdGhlIHJlc3VtZVxuXHRcdFx0Ly8gcmVjb3JkcyB0aGF0IGV4YWN0IGJhY2tpbmcgZm9yIHRoZSB0YXJnZXQgY2hhdC5cblx0XHRcdGNvbnN0IGltcG9ydGVkID0gYXdhaXQgdGhpcy5fcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQsIGNoYXQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gSW1wb3J0ZWQgc2Vzc2lvbiBjcmVhdGVkOiAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3QgfSA6IHt9KSxcblx0XHRcdFx0Li4udGhpcy5fY2hhdEJhY2tpbmdSZXN1bHQoc2Vzc2lvbklkLCB7IHNka1Nlc3Npb25JZDogaW1wb3J0ZWQuc2Vzc2lvbklkIH0pLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKiBBYnNvbHV0ZSBwYXRoIG9mIGFuIGV4dGVuc2lvbi1ob3N0IENvcGlsb3QgQ0xJIHNpZGVjYXIgZmlsZSBmb3IgYHNlc3Npb25JZGAuICovXG5cdHByaXZhdGUgX2V4dGVuc2lvbkhvc3RDbGlTaWRlY2FyUGF0aChzZXNzaW9uSWQ6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGpvaW4oZ2V0Q29waWxvdEhvbWVQYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgsIHByb2Nlc3MuZW52KSwgJ3Nlc3Npb24tc3RhdGUnLCBzZXNzaW9uSWQsIGZpbGVOYW1lKTtcblx0fVxuXG5cdC8qKiBNZW1vaXplcyB0aGUgKHN0YWJsZSkgbWFya2VyIHJlYWQgc28gcmVwZWF0ZWQgYGxpc3RTZXNzaW9uc2AgY2FsbHMgZG9uJ3QgcmUtcmVhZCB0aGUgZGlzay4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uSG9zdENsaU1hcmtlckNhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8SUV4dGVuc2lvbkhvc3RDbGlNYXJrZXIgfCB1bmRlZmluZWQ+PigpO1xuXG5cdC8qKlxuXHQgKiBSZWFkcyBhbmQgcGFyc2VzIHRoZSBgdnNjb2RlLm1ldGFkYXRhLmpzb25gIG1hcmtlciBmb3IgYHNlc3Npb25JZGAsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gaXQgaXMgbWlzc2luZy91bnJlYWRhYmxlL21hbGZvcm1lZC5cblx0ICovXG5cdHByaXZhdGUgX3JlYWRFeHRlbnNpb25Ib3N0Q2xpTWFya2VyKHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxJRXh0ZW5zaW9uSG9zdENsaU1hcmtlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBjYWNoZWQgPSB0aGlzLl9leHRlbnNpb25Ib3N0Q2xpTWFya2VyQ2FjaGUuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdGNhY2hlZCA9IGZzLnJlYWRGaWxlKHRoaXMuX2V4dGVuc2lvbkhvc3RDbGlTaWRlY2FyUGF0aChzZXNzaW9uSWQsICd2c2NvZGUubWV0YWRhdGEuanNvbicpLCAndXRmOCcpXG5cdFx0XHRcdC50aGVuKHJhdyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpIGFzIHVua25vd247XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShwYXJzZWQpID8gcGFyc2VkIGFzIElFeHRlbnNpb25Ib3N0Q2xpTWFya2VyIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2V4dGVuc2lvbkhvc3RDbGlNYXJrZXJDYWNoZS5zZXQoc2Vzc2lvbklkLCBjYWNoZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FjaGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNFeHRlbnNpb25Ib3N0Q2xpU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1hcmtlciA9IGF3YWl0IHRoaXMuX3JlYWRFeHRlbnNpb25Ib3N0Q2xpTWFya2VyKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFtYXJrZXIgfHwgT2JqZWN0LmtleXMobWFya2VyKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gTWlycm9yIHRoZSBleHRlbnNpb24gaG9zdCdzIGBnZXRTZXNzaW9uT3JpZ2luYDogaG9ub3IgYW4gZXhwbGljaXRcblx0XHQvLyBgb3JpZ2luYCAodGhlIEdpdEh1YiBDb3BpbG90IGFwcCB3cml0ZXMgYG90aGVyYCksIGVsc2UgZ3Vlc3MgYHZzY29kZWBcblx0XHQvLyBvbmx5IHdoZW4gb2xkZXIgb3JpZ2luLWxlc3MgbWFya2VycyBjYXJyeSBWUyBDb2RlLXNwZWNpZmljIHByb3BlcnRpZXMuXG5cdFx0aWYgKG1hcmtlci5vcmlnaW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG1hcmtlci5vcmlnaW4gPT09IEVYVEVOU0lPTl9IT1NUX0NMSV9NQVJLRVJfT1JJR0lOO1xuXHRcdH1cblx0XHRyZXR1cm4gbWFya2VyLnJlcG9zaXRvcnlQcm9wZXJ0aWVzICE9PSB1bmRlZmluZWRcblx0XHRcdHx8IG1hcmtlci53b3JrdHJlZVByb3BlcnRpZXMgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgbWFya2VyLndvcmtzcGFjZUZvbGRlciAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlYWRzIGEgbGVnYWN5IGV4dGVuc2lvbi1ob3N0IENvcGlsb3QgQ0xJIGN1c3RvbSB0aXRsZSwgaWYgcHJlc2VudC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZEV4dGVuc2lvbkhvc3RDbGlDdXN0b21UaXRsZShzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdGl0bGUgPSAoYXdhaXQgdGhpcy5fcmVhZEV4dGVuc2lvbkhvc3RDbGlNYXJrZXIoc2Vzc2lvbklkKSk/LmN1c3RvbVRpdGxlO1xuXHRcdHJldHVybiB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnICYmIHRpdGxlLnRyaW0oKSA/IHRpdGxlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIEFkb3B0cyBhIGxlZ2FjeSBleHRlbnNpb24taG9zdCBDb3BpbG90IENMSSBzZXNzaW9uIGluIHBsYWNlIHdoZW4gaXQgaXMgZWxpZ2libGUgb24gZGlzay4gKi9cblx0YXN5bmMgZW5zdXJlQ2hhdEFkb3B0ZWQoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8SUFnZW50Q2hhdEFkb3B0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpLmNvbmZpZ3VyYXRpb25SZXNvdXJjZTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHRoaXMuX3F1ZXVlU2Vzc2lvbihzZXNzaW9uSWQsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEEgZ2VudWluZSBuYXRpdmUgLyBhbHJlYWR5LWFkb3B0ZWQgc2Vzc2lvbiBhbHdheXMgaGFzIGEgcGVyc2lzdGVkXG5cdFx0XHQvLyB3b3JraW5nIGRpcmVjdG9yeS4gVGhlIHNlc3Npb24gREIgRklMRSBjYW4gYWxzbyBleGlzdCB3aXRob3V0IGFueVxuXHRcdFx0Ly8gcmVhbCBtZXRhZGF0YSAoY2hlY2twb2ludCAvIGNoYW5nZXNldCAvIGdpdCBzZXJ2aWNlcyBjcmVhdGUgaXQgdmlhXG5cdFx0XHQvLyBgb3BlbkRhdGFiYXNlYCksIHNvIGdhdGUgb24gYHdvcmtpbmdEaXJlY3RvcnlgIFx1MjAxNCBub3QgbWVyZSBEQlxuXHRcdFx0Ly8gZXhpc3RlbmNlIFx1MjAxNCB0byBhdm9pZCBmYWxzZWx5IHRyZWF0aW5nIGFuIGVtcHR5IERCIGFzIG1pZ3JhdGVkLlxuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBhd2FpdCB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pO1xuXHRcdFx0aWYgKGV4aXN0aW5nPy53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHJldHVybiB7IGFkb3B0ZWQ6IGZhbHNlLCBlbGlnaWJsZTogZmFsc2UgfTsgLy8gYWxyZWFkeSBuYXRpdmUgLyBhZG9wdGVkXG5cdFx0XHR9XG5cdFx0XHQvLyBPbmx5IG1pZ3JhdGUgbGVnYWN5IEVIIENvcGlsb3QgQ0xJIHNlc3Npb25zIFx1MjAxNCBuZXZlciBvdGhlciBDb3BpbG90IFNES1xuXHRcdFx0Ly8gc2Vzc2lvbnMgKHN0YW5kYWxvbmUgQ0xJLCBMb2NhbCBhZ2VudCwgXHUyMDI2KSB0aGF0IHNoYXJlIGB+Ly5jb3BpbG90YC5cblx0XHRcdGlmICghKGF3YWl0IHRoaXMuX2lzRXh0ZW5zaW9uSG9zdENsaVNlc3Npb24oc2Vzc2lvbklkKSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgYWRvcHRlZDogZmFsc2UsIGVsaWdpYmxlOiBmYWxzZSB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0XHRjb25zdCBzZGtNZXRhZGF0YSA9IGF3YWl0IGNsaWVudC5nZXRTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbklkKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHR5cGVvZiBzZGtNZXRhZGF0YT8uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSA9PT0gJ3N0cmluZycgPyBVUkkuZmlsZShzZGtNZXRhZGF0YS5jb250ZXh0LndvcmtpbmdEaXJlY3RvcnkpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdC8vIEFuIGVsaWdpYmxlIGxlZ2FjeSBzZXNzaW9uIHdob3NlIG9uLWRpc2sgd29ya2luZyBkaXJlY3RvcnkgY291bGQgbm90XG5cdFx0XHRcdC8vIGJlIHJlc29sdmVkOiBhIGdlbnVpbmUgbWlncmF0aW9uIGNhbmRpZGF0ZSB0aGF0IGRpZCBub3QgbWlncmF0ZS5cblx0XHRcdFx0cmV0dXJuIHsgYWRvcHRlZDogZmFsc2UsIGVsaWdpYmxlOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBBZG9wdGluZyBsZWdhY3kgc2Vzc2lvbiAke3Nlc3Npb25JZH0gaW4gcGxhY2UgKHJldXNpbmcgb24tZGlzayBldmVudHMuanNvbmwpYCk7XG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBwcm9qZWN0IGZyb20gdGhlIFNESy1kZXJpdmVkIGN3ZCAoYXV0aG9yaXRhdGl2ZSkgXHUyMDE0IHRoZVxuXHRcdFx0Ly8gY2FsbGVyIG1heSBub3QgaGF2ZSBzdXBwbGllZCBhIHdvcmtpbmcgZGlyZWN0b3J5IChlLmcuIHRoZSBjaGF0XG5cdFx0XHQvLyBlZGl0b3IpLCBzbyB3ZSBjYW5ub3QgdHJ1c3QgYSBoaW50LlxuXHRcdFx0Y29uc3QgcHJvamVjdCA9IGF3YWl0IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0Ly8gQ2Fycnkgb3ZlciB0aGUgdXNlci1jaG9zZW4gc2Vzc2lvbiBuYW1lIChFSCBgY3VzdG9tVGl0bGVgKSBzbyB0aGVcblx0XHRcdC8vIGFkb3B0ZWQgc2Vzc2lvbiBrZWVwcyBpdHMgdGl0bGUgaW5zdGVhZCBvZiByZWdlbmVyYXRpbmcgb25lLlxuXHRcdFx0Y29uc3QgY3VzdG9tVGl0bGUgPSBhd2FpdCB0aGlzLl9yZWFkRXh0ZW5zaW9uSG9zdENsaUN1c3RvbVRpdGxlKHNlc3Npb25JZCk7XG5cdFx0XHQvLyBTZWVkIFZTIENvZGUtbGF5ZXIgbWV0YWRhdGEgb25seSBcdTIwMTQgdGhlIFNESyBldmVudCBsb2cgb24gZGlzayBpc1xuXHRcdFx0Ly8gdW50b3VjaGVkLiBXcml0aW5nIGBhZ2VudFNlc3Npb25EYXRhLzxzYW5pdGl6ZWRJZD4vc2Vzc2lvbi5kYmAgaGVyZVxuXHRcdFx0Ly8gaXMgYWxzbyB3aGF0IG1ha2VzIHRoZSBsZWdhY3kgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdCBDTEkgbGlzdCBzdG9wXG5cdFx0XHQvLyBzaG93aW5nIHRoaXMgc2Vzc2lvbiAoaXQgZGVkdXBzIGFnYWluc3QgYWdlbnQtaG9zdC1vd25lZCBzZXNzaW9uIGlkcykuXG5cdFx0XHQvLyBgaXNvbGF0aW9uOiAnZm9sZGVyJ2Aga2VlcHMgdGhlIHNlc3Npb24gaW4gcGxhY2UgaW4gdGhlIHJldXNlZCBjd2QgXHUyMDE0XG5cdFx0XHQvLyBhIGdpdCByZXBvIHdvdWxkIG90aGVyd2lzZSBkZWZhdWx0IHRvIHdvcmt0cmVlIGFuZCBzaG93IGEgc3B1cmlvdXNcblx0XHRcdC8vIFwiQ3JlYXRpbmcgd29ya3RyZWVcdTIwMjZcIi5cblx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24sIHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yeSwgW3dvcmtpbmdEaXJlY3RvcnldLCB3b3JraW5nRGlyZWN0b3J5LCBwcm9qZWN0LCBwcm9qZWN0ICE9PSB1bmRlZmluZWQsIHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ2ZvbGRlcicgfSwgY3VzdG9tVGl0bGUsIC8qIG1hcmtSZWFkICovIHRydWUpO1xuXHRcdFx0YXdhaXQgdGhpcy5fYWRvcHRMZWdhY3lUdXJuVXNhZ2Uoc2Vzc2lvbiwgc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiB7IGFkb3B0ZWQ6IHRydWUsIGVsaWdpYmxlOiB0cnVlIH07XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FycmllcyB0aGUgcGVyLXJlcXVlc3QgY3JlZGl0IHRvdGFscyB0aGUgZXh0ZW5zaW9uIGhvc3QgcGVyc2lzdGVkIGluXG5cdCAqIGB2c2NvZGUucmVxdWVzdHMubWV0YWRhdGEuanNvbmAgaW50byB0aGUgYWRvcHRlZCBzZXNzaW9uJ3MgYHR1cm5fdXNhZ2VgXG5cdCAqIHJvd3MsIHNvIHJlc3RvcmVkIHR1cm5zIGtlZXAgdGhlaXIgXCJjcmVkaXRzIHVzZWRcIiBnYXVnZS4gQmVzdC1lZmZvcnQ6IGFcblx0ICogbWlzc2luZy9tYWxmb3JtZWQgc2lkZWNhciBvciBhIHdyaXRlIGZhaWx1cmUgbXVzdCBuZXZlciBmYWlsIGFkb3B0aW9uLlxuXHQgKlxuXHQgKiBPbmx5IGV2ZXIgY2FsbGVkIGZyb20ge0BsaW5rIGVuc3VyZUNoYXRBZG9wdGVkfSBvbmNlIGEgbGVnYWN5IGV4dGVuc2lvbi1ob3N0XG5cdCAqIENvcGlsb3QgQ0xJIHNlc3Npb24gaGFzIHBhc3NlZCBldmVyeSBlbGlnaWJpbGl0eSBnYXRlIGFuZCBpcyBhY3R1YWxseSBiZWluZ1xuXHQgKiBtaWdyYXRlZCBcdTIwMTQgbm8gbmF0aXZlIG9yIG5vbi1WUyBDb2RlIENvcGlsb3Qgc2Vzc2lvbidzIHVzYWdlIGlzIHJlYWQgb3Igd3JpdHRlbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Fkb3B0TGVnYWN5VHVyblVzYWdlKHNlc3Npb246IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBBYnNlbnQgZm9yIHNlc3Npb25zIHByZWRhdGluZyB0aGUgZXh0ZW5zaW9uIGhvc3QncyBjcmVkaXQgdHJhY2tpbmcsIHNvIGFcblx0XHQvLyBtaXNzaW5nIHNpZGVjYXIgaXMgdGhlIGV4cGVjdGVkIGNhc2UsIG5vdCBhIGZhaWx1cmUuXG5cdFx0Y29uc3QgcmF3ID0gYXdhaXQgZnMucmVhZEZpbGUodGhpcy5fZXh0ZW5zaW9uSG9zdENsaVNpZGVjYXJQYXRoKHNlc3Npb25JZCwgJ3ZzY29kZS5yZXF1ZXN0cy5tZXRhZGF0YS5qc29uJyksICd1dGY4JykuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRpZiAocmF3ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEVhY2ggZW50cnkgaXMga2V5ZWQgYnkgdGhlIFNESyBgdXNlci5tZXNzYWdlYCBlbnZlbG9wZSBpZCwgd2hpY2ggaXNcblx0XHRcdC8vIGFsc28gdGhlIHR1cm4gaWQgYG1hcFNlc3Npb25FdmVudHNgIHJlc3RvcmVzIHRoZSB0dXJuIHVuZGVyLlxuXHRcdFx0Y29uc3Qgcm93czogeyByZWFkb25seSB0dXJuSWQ6IHN0cmluZzsgcmVhZG9ubHkgdXNhZ2U6IFVzYWdlSW5mbyB9W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgcGFyc2VkIGFzIHJlYWRvbmx5IElFeHRlbnNpb25Ib3N0Q2xpUmVxdWVzdERldGFpbHNbXSkge1xuXHRcdFx0XHRjb25zdCB0dXJuSWQgPSBlbnRyeT8uY29waWxvdFJlcXVlc3RJZDtcblx0XHRcdFx0Y29uc3QgY3JlZGl0cyA9IGVudHJ5Py5jcmVkaXRzVXNlZDtcblx0XHRcdFx0aWYgKHR5cGVvZiB0dXJuSWQgIT09ICdzdHJpbmcnIHx8ICF0dXJuSWQgfHwgdHlwZW9mIGNyZWRpdHMgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUoY3JlZGl0cykgfHwgY3JlZGl0cyA8IDApIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyb3dzLnB1c2goe1xuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdFx0Li4uKHR5cGVvZiBlbnRyeS5yZXNwb25zZU1vZGVsSWQgPT09ICdzdHJpbmcnICYmIGVudHJ5LnJlc3BvbnNlTW9kZWxJZCA/IHsgbW9kZWw6IGVudHJ5LnJlc3BvbnNlTW9kZWxJZCB9IDoge30pLFxuXHRcdFx0XHRcdFx0X21ldGE6IHsgY29waWxvdFVzYWdlOiB7IHRvdGFsTmFub0FpdTogTWF0aC5yb3VuZChjcmVkaXRzICogTkFOT19BSVVfUEVSX0NSRURJVCkgfSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJvd3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRiUmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcblx0XHRcdFx0XHRhd2FpdCBkYlJlZi5vYmplY3Quc2V0VHVyblVzYWdlKHJvdy50dXJuSWQsIEpTT04uc3RyaW5naWZ5KHJvdy51c2FnZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBBZG9wdGVkICR7cm93cy5sZW5ndGh9IGxlZ2FjeSB0dXJuIHVzYWdlIHJlY29yZHMgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gYWRvcHQgbGVnYWN5IHR1cm4gdXNhZ2UgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKiogTWF0ZXJpYWxpemVzIGEgcHJvdmlzaW9uYWwgY2hhdCBpbnRvIGEgcmVhbCBTREsgc2Vzc2lvbiBpbW1lZGlhdGVseSBiZWZvcmUgZmlyc3Qgc2VuZC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemVQcm92aXNpb25hbChzZXNzaW9uSWQ6IHN0cmluZywgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBVUklbXSk6IFByb21pc2U8Q29waWxvdEFnZW50U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHByb3Zpc2lvbmFsID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXByb3Zpc2lvbmFsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBtYXRlcmlhbGl6ZSB1bmtub3duIHByb3Zpc2lvbmFsIHNlc3Npb246ICR7c2Vzc2lvbklkfWApO1xuXHRcdH1cblx0XHRjb25zdCBjbGllbnQgPSBhd2FpdCB0aGlzLl9lbnN1cmVDbGllbnQoKTtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gcHJvdmlzaW9uYWwuc2Vzc2lvblVyaTtcblx0XHRjb25zdCBzZGtTZXNzaW9uSWQgPSBwcm92aXNpb25hbC5zZGtTZXNzaW9uSWQ7XG5cblx0XHQvLyBUaGUgaG9zdCBoYW5kcyB1cyB0aGUgcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcmllcyAoYW4gaXNvbGF0ZWQgd29ya3RyZWUgZm9yXG5cdFx0Ly8gd29ya3RyZWUgaXNvbGF0aW9uKSBvbiB0aGUgZmlyc3Qgc2VuZDsgdXNlIGluZGV4IDAgKHRoZSBwcm9jZXNzIHJvb3QpIHNvIHRoZVxuXHRcdC8vIFNESyBzdWJwcm9jZXNzIHNwYXducyBpbiBpdC4gRmFsbHMgYmFjayB0byB0aGUgZm9sZGVyIC8gc2NyYXRjaCBkaXIgY2FwdHVyZWRcblx0XHQvLyBhdCBjcmVhdGUgdGltZSBmb3IgZm9sZGVyIC8gd29ya3NwYWNlLWxlc3Mgc2Vzc2lvbnMuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yaWVzPy5bMF0gPz8gcHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yeTtcblx0XHQvLyBUaGUgY3VzdG9taXphdGlvbiBhbmNob3IgZm9sbG93cyB0aGUgd29ya2luZyBkaXJlY3Rvcnk6IG9uY2UgYSB3b3JrdHJlZVxuXHRcdC8vIGlzIGNyZWF0ZWQgdGhlIGFnZW50IG11c3QgZGlzY292ZXIgc2tpbGxzL2luc3RydWN0aW9ucy9hZ2VudHMgZnJvbSB0aGVcblx0XHQvLyB3b3JrdHJlZSAobm90IHRoZSB1c2VyLXBpY2tlZCBmb2xkZXIpIHNvIHRoZSBtb2RlbCByZWFkcyBhbmQgZWRpdHMgZmlsZXNcblx0XHQvLyBpbiB0aGUgd29ya3RyZWUgaXQgYWN0dWFsbHkgcnVucyBpbi5cblx0XHRjb25zdCBjdXN0b21pemF0aW9uRGlyZWN0b3J5ID0gd29ya2luZ0RpcmVjdG9yeSA/PyBwcm92aXNpb25hbC53b3JraW5nRGlyZWN0b3J5O1xuXHRcdC8vIEFsd2F5cyBjcmVhdGUgYW4gQWN0aXZlQ2xpZW50IHNvIHRoZSBzbmFwc2hvdCBpbmNsdWRlcyBob3N0ICtcblx0XHQvLyBzZXNzaW9uLWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMsIGV2ZW4gd2hlbiBubyBjbGllbnQgaGFzXG5cdFx0Ly8gcmVnaXN0ZXJlZCBhbiBhY3RpdmUtY2xpZW50IGhhbmRsZSB5ZXQuXG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0Ly8gUmUtYW5jaG9yIGluIGNhc2UgdGhlIHByb3Zpc2lvbmFsIGFjdGl2ZSBjbGllbnQgd2FzIGFscmVhZHkgYm91bmQgdG8gdGhlXG5cdFx0Ly8gdXNlci1waWNrZWQgZm9sZGVyIGJlZm9yZSB0aGUgd29ya3RyZWUgZXhpc3RlZC5cblx0XHRhY3RpdmVDbGllbnQucGx1Z2luQ29udHJvbGxlci5yZWFuY2hvcihjdXN0b21pemF0aW9uRGlyZWN0b3J5KTtcblx0XHQvLyBNdWx0aS1yb290OiBhbmNob3IgY3VzdG9taXphdGlvbiBkaXNjb3ZlcnkgdG8gdGhlIGFkZGl0aW9uYWwgd29ya3NwYWNlXG5cdFx0Ly8gcm9vdHMgKGluZGV4IDEuLk4gb2YgdGhlIHJlc29sdmVkIHNldCkuIEVtcHR5IHdoZW4gc2luZ2xlLXJvb3QgLyBnYXRlZCBvZmYuXG5cdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIuc2V0QWRkaXRpb25hbERpcmVjdG9yaWVzKHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMocmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMpKTtcblx0XHQvLyBBZHZlcnRpc2UgZXhhY3RseSB0aGUgY2xpZW50cyBBZ2VudCBIb3N0IGZhbm5lZCB0aGlzIGNoYXQgb3V0IHRvLlxuXHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgYWN0aXZlQ2xpZW50LnNuYXBzaG90KCh0aGlzLl9maW5kU2Vzc2lvbkNoYXRVcmkoc2Vzc2lvblVyaSkgPz8gc2Vzc2lvblVyaSkudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qgc2hlbGxNYW5hZ2VyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2hlbGxNYW5hZ2VyLCBzZXNzaW9uVXJpLCB3b3JraW5nRGlyZWN0b3J5KTtcblxuXHRcdGxldCBhZ2VudFNlc3Npb246IENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRBZ2VudCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVBZ2VudFdoZW5NYXRlcmlhbGl6aW5nKHByb3Zpc2lvbmFsLCBzbmFwc2hvdCwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRhZ2VudCA9IHJlc29sdmVkQWdlbnQ/LmFnZW50O1xuXHRcdFx0Y29uc3QgbGF1bmNoUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuID0ge1xuXHRcdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRzZXNzaW9uSWQ6IHNka1Nlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiB0aGlzLl9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKHJlc29sdmVkV29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IHJlc29sdmVkQWdlbnQ/Lm5hbWUsXG5cdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRkaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzOiB0aGlzLl9kaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzKHNlc3Npb25VcmksIHNka1Nlc3Npb25JZCwgc25hcHNob3QpLFxuXHRcdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBhY3RpdmVDbGllbnQudG9vbFNldCxcblx0XHRcdFx0c2hlbGxNYW5hZ2VyLFxuXHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdG1vZGVsOiBwcm92aXNpb25hbC5tb2RlbCxcblx0XHRcdFx0bG9uZ0NvbnRleHRXaW5kb3c6IHRoaXMuX2xvbmdDb250ZXh0V2luZG93Rm9yKHByb3Zpc2lvbmFsLm1vZGVsPy5pZCksXG5cdFx0XHRcdGZyZWVMb25nQ29udGV4dDogdGhpcy5faXNGcmVlTG9uZ0NvbnRleHQocHJvdmlzaW9uYWwubW9kZWw/LmlkKSxcblx0XHRcdFx0d29ya3NwYWNlbGVzczogcHJvdmlzaW9uYWwud29ya3NwYWNlbGVzcyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjaGF0Q2hhbm5lbFVyaSA9IHRoaXMuX2ZpbmRCb3VuZFNlc3Npb25DaGF0VXJpKHNka1Nlc3Npb25JZCkgPz8gc2Vzc2lvblVyaTtcblx0XHRcdGFnZW50U2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQsIHtcblx0XHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdFx0Y2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVySW5pdGlhbGl6ZWRTZXNzaW9uKHNka1Nlc3Npb25JZCwgYWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQsIGxhdW5jaFBsYW4uY2xpZW50KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YWdlbnRTZXNzaW9uPy5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9qZWN0ID0gYXdhaXQgcHJvamVjdEZyb21Db3BpbG90Q29udGV4dCh7IGN3ZDogd29ya2luZ0RpcmVjdG9yeT8uZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXG5cdFx0Ly8gVGhlIHJlc29sdmVkIHJvb3Qgc2V0IChpbmRleCAwID0gcHJvY2VzcyByb290LCBlLmcuIGEgd29ya3RyZWUpLlxuXHRcdC8vIFNoYXJlZCBieSB0aGUgcGVyc2lzdGVkIG1ldGFkYXRhLCB0aGUgYmFzZWxpbmUgY2hlY2twb2ludCBhbmQgdGhlXG5cdFx0Ly8gbWF0ZXJpYWxpemUgcmVjZWlwdCBzbyBhbGwgdGhyZWUgYWdyZWUgb24gdGhlIHNhbWUgZGlyZWN0b3JpZXMuXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVkV29ya2luZ0RpcmVjdG9yaWVzID0gcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMgPz8gKFt3b3JraW5nRGlyZWN0b3J5XSk7XG5cblx0XHR0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25VcmksIHByb3Zpc2lvbmFsLm1vZGVsLCB3b3JraW5nRGlyZWN0b3J5LCBtYXRlcmlhbGl6ZWRXb3JraW5nRGlyZWN0b3JpZXMsIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIHByb2plY3QsIHRydWUpO1xuXHRcdGlmIChhZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25BZ2VudE1ldGFkYXRhKHNlc3Npb25VcmksIGFnZW50KTtcblx0XHR9XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBwZXItc2Vzc2lvbiBiYXNlbGluZSAodHVybi8wKSBnaXQgY2hlY2twb2ludCBzb1xuXHRcdC8vIHBlci10dXJuIGRpZmZzIGNvbXB1dGVkIG9uIGBDaGF0VHVybkNvbXBsZXRlYCBjYW4gcmVmbGVjdCB0aGVcblx0XHQvLyBmdWxsIHdvcmtpbmctdHJlZSBkZWx0YSBcdTIwMTQgaW5jbHVkaW5nIHRlcm1pbmFsLXRvb2wgZWRpdHMgdGhhdCBhcmVcblx0XHQvLyBpbnZpc2libGUgdG8gdGhlIEZpbGVFZGl0VHJhY2tlciBwaXBlbGluZS4gQmVzdC1lZmZvcnQ6IGFcblx0XHQvLyBub24tZ2l0IGZvbGRlciBvciBjYXB0dXJlIGZhaWx1cmUgbGVhdmVzIHRoZSBzZXNzaW9uIHJ1bm5pbmdcblx0XHQvLyB3aXRoIHRoZSBsZWdhY3kgYGZpbGVfZWRpdHNgLWJhc2VkIHBlci10dXJuIGRpZmYgcGF0aC5cblx0XHQvL1xuXHRcdC8vIFRoZSByZXNvbHZlZCBkaXJlY3RvcmllcyBhcmUgcGFzc2VkIGV4cGxpY2l0bHk6IHRoZSBzdGF0ZSBtYW5hZ2VyXG5cdFx0Ly8gZG9lcyBub3QgbGVhcm4gYWJvdXQgdGhlbSB1bnRpbCBpdCBvYnNlcnZlcyB0aGUgbWF0ZXJpYWxpemUgZXZlbnRcblx0XHQvLyBmaXJlZCBiZWxvdywgc28gYSBsb29rdXAgaGVyZSB3b3VsZCBzdGlsbCBzZWUgdGhlIHByZS13b3JrdHJlZSBzZXQuXG5cdFx0dGhpcy5fY2hlY2twb2ludFNlcnZpY2UuY2FwdHVyZUJhc2VsaW5lQ2hlY2twb2ludChzZXNzaW9uVXJpLCBtYXRlcmlhbGl6ZWRXb3JraW5nRGlyZWN0b3JpZXMpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQmFzZWxpbmUgY2hlY2twb2ludCBjYXB0dXJlIGZhaWxlZDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBTZXNzaW9uIG1hdGVyaWFsaXplZDogJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0Ly8gRW1pdCB0aGUgcmVzb2x2ZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IChpbmRleCAwID0gcHJvY2VzcyByb290KS4gVGhlIGhvc3Rcblx0XHQvLyByZXBsYWNlcyBpbmRleCAwIG9mIHRoZSBzZXNzaW9uIHNldCB3aXRoIGl0LCBwcmVzZXJ2aW5nIHRoZSB0YWlsLlxuXHRcdHRoaXMuX29uRGlkTWF0ZXJpYWxpemVDaGF0LmZpcmUoeyBjaGF0OiBwcm92aXNpb25hbC5jaGF0LCBwcm9qZWN0LCB3b3JraW5nRGlyZWN0b3JpZXM6IG1hdGVyaWFsaXplZFdvcmtpbmdEaXJlY3RvcmllcyB9KTtcblx0XHRyZXR1cm4gYWdlbnRTZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUFnZW50V2hlbk1hdGVyaWFsaXppbmcocHJvdmlzaW9uYWw6IElQcm92aXNpb25hbFNlc3Npb24sIHNuYXBzaG90OiBJQWN0aXZlQ2xpZW50U25hcHNob3QsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyBhZ2VudDogQWdlbnRTZWxlY3Rpb247IG5hbWU6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBwcm92aXNpb25hbC5hZ2VudDtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBhbHRlcm5hdGl2ZUFnZW50ID0gdGhpcy5fZ2V0QWx0ZXJuYXRpdmVBZ2VudEZvcldvcmt0cmVlKHByb3Zpc2lvbmFsLCB3b3JraW5nRGlyZWN0b3J5KTtcblxuXHRcdGNvbnN0IG9yaWdpbmFsQWdlbnROYW1lID0gdGhpcy5fcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdCwgYWdlbnQpO1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlQWdlbnROYW1lID0gYWx0ZXJuYXRpdmVBZ2VudCA/IHRoaXMuX3Jlc29sdmVBZ2VudE5hbWUoc25hcHNob3QsIGFsdGVybmF0aXZlQWdlbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKG9yaWdpbmFsQWdlbnROYW1lKSB7XG5cdFx0XHRyZXR1cm4geyBhZ2VudDogYWdlbnQsIG5hbWU6IG9yaWdpbmFsQWdlbnROYW1lIH07XG5cdFx0fVxuXHRcdGlmIChhbHRlcm5hdGl2ZUFnZW50TmFtZSAmJiBhbHRlcm5hdGl2ZUFnZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBBZ2VudCBmaWxlICR7YWdlbnQudXJpfSBpcyBpbiB0aGUgb3JpZ2luYWwgcmVwbzsgdXNpbmcgd29ya3RyZWUgYWdlbnQgJHthbHRlcm5hdGl2ZUFnZW50Py51cml9YCk7XG5cdFx0XHRyZXR1cm4geyBhZ2VudDogYWx0ZXJuYXRpdmVBZ2VudCwgbmFtZTogYWx0ZXJuYXRpdmVBZ2VudE5hbWUgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRwcml2YXRlIF9nZXRBbHRlcm5hdGl2ZUFnZW50Rm9yV29ya3RyZWUocHJvdmlzaW9uYWw6IElQcm92aXNpb25hbFNlc3Npb24sIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZ2VudCA9IHByb3Zpc2lvbmFsLmFnZW50O1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yeSB8fCAhd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGlzRXF1YWwocHJvdmlzaW9uYWwud29ya2luZ0RpcmVjdG9yeSwgd29ya2luZ0RpcmVjdG9yeSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLnBhcnNlKGFnZW50LnVyaSk7XG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVBZ2VudFVyaSA9IHJlYmFzZVVuZGVyKGFnZW50VXJpLCBwcm92aXNpb25hbC53b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRyZXR1cm4gYWx0ZXJuYXRpdmVBZ2VudFVyaSA/IHsgdXJpOiBhbHRlcm5hdGl2ZUFnZW50VXJpLnRvU3RyaW5nKCkgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDaGF0Q29uZmlnKHBhcmFtczogSUFnZW50UmVzb2x2ZUNoYXRDb25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0Ly8gSXNvbGF0aW9uIC8gYnJhbmNoIGFyZSBjb250cmlidXRlZCBieSB0aGUgaG9zdCAoc2VlXG5cdFx0Ly8gQWdlbnRTZXJ2aWNlLl93aXRoSXNvbGF0aW9uU2NoZW1hKTsgdGhpcyBhZ2VudCBvbmx5IG93bnMgaXRzIHBsYXRmb3JtXG5cdFx0Ly8gc2Vzc2lvbiBjb25maWcgKGF1dG8tYXBwcm92ZSAvIG1vZGUgLyBwZXJtaXNzaW9ucykuXG5cdFx0Y29uc3QgdmFsdWVzID0gcGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcocGFyYW1zLmNvbmZpZyksIHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2RlZmF1bHQnIHNhdGlzZmllcyBBdXRvQXBwcm92ZUxldmVsLFxuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdpbnRlcmFjdGl2ZScgc2F0aXNmaWVzIFNlc3Npb25Nb2RlLFxuXHRcdFx0Ly8gUGVybWlzc2lvbnMgaW50ZW50aW9uYWxseSBvbWl0dGVkIFx1MjAxNCBsZWF2ZSB1bnNldCBzbyBhdXRvLWFwcHJvdmFsXG5cdFx0XHQvLyBmYWxscyB0aHJvdWdoIHRvIHRoZSBob3N0LWxldmVsIGBwZXJtaXNzaW9uc2AgZGVmYXVsdCwgYW5kIG9ubHlcblx0XHRcdC8vIG1hdGVyaWFsaXplcyBvbiB0aGUgc2Vzc2lvbiBvbmNlIHRoZSB1c2VyIGhpdHMgXCJBbGxvdyBpbiB0aGlzXG5cdFx0XHQvLyBTZXNzaW9uXCIuXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c2NoZW1hOiBwbGF0Zm9ybVNlc3Npb25TY2hlbWEudG9Qcm90b2NvbCgpLFxuXHRcdFx0dmFsdWVzLFxuXHRcdH07XG5cdH1cblxuXHRnZXRJbmhlcml0ZWRDaGF0Q29uZmlnKGNvbmZpZzogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluaGVyaXRlZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSwgU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10pIHtcblx0XHRcdGlmIChjb25maWdba2V5XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGluaGVyaXRlZFtrZXldID0gY29uZmlnW2tleV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3Qua2V5cyhpbmhlcml0ZWQpLmxlbmd0aCA+IDAgPyBpbmhlcml0ZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBjaGF0Q29uZmlnQ29tcGxldGlvbnMoX3BhcmFtczogSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zKTogUHJvbWlzZTxTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQ+IHtcblx0XHQvLyBCcmFuY2ggY29tcGxldGlvbnMgKHRoZSBvbmx5IGR5bmFtaWMgQ29waWxvdCBwcm9wZXJ0eSkgYXJlIG93bmVkIGJ5IHRoZVxuXHRcdC8vIGhvc3Qgbm93OyBubyBwcm92aWRlci1zcGVjaWZpYyBjb21wbGV0aW9ucyByZW1haW4uXG5cdFx0cmV0dXJuIHsgaXRlbXM6IFtdIH07XG5cdH1cblxuXHQvKiogUmVjb3JkcyB0aGF0IGBjbGllbnRgIGNvbnRyaWJ1dGVzIHRvIGBjaGF0YCB3aXRoaW4gdGhlIG93bmluZyBjb25maWd1cmF0aW9uIHNjb3BlLiAqL1xuXHRnZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBjbGllbnQ6IHsgcmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSwgaG9zdEN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogSUFjdGl2ZUNsaWVudCB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblJlc291cmNlID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdHRoaXMuX3JlbWVtYmVySG9zdEN1c3RvbWl6YXRpb25zKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgaG9zdEN1c3RvbWl6YXRpb25zKTtcblx0XHRjb25zdCBhY3RpdmVDbGllbnQgPSB0aGlzLl9nZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChjb25maWd1cmF0aW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWRvcHRDbGllbnRDaGF0KGFjdGl2ZUNsaWVudCwgY2xpZW50LmNsaWVudElkLCBjaGF0KTtcblx0XHQvLyBBbmNob3IgdGhlIGN1c3RvbWl6YXRpb24gZGlyZWN0b3J5IChiZXN0LWVmZm9ydCwgaWRlbXBvdGVudCkgc29cblx0XHQvLyBzZXNzaW9uLWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMgc3VyZmFjZSBhbG9uZ3NpZGUgdGhpcyBjbGllbnQncyxcblx0XHQvLyBtaXJyb3JpbmcgdGhlIHByZXZpb3VzIGVhZ2VyIHJlc29sdXRpb24gaW4gYHNldENsaWVudEN1c3RvbWl6YXRpb25zYC5cblx0XHRpZiAoIWFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLmRpcmVjdG9yeSkge1xuXHRcdFx0dGhpcy5fZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25BbmNob3JzKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSkudGhlbihcblx0XHRcdFx0YW5jaG9ycyA9PiB7XG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIuc2V0RGlyZWN0b3J5KGFuY2hvcnMuZGlyZWN0b3J5KTtcblx0XHRcdFx0XHRpZiAoYW5jaG9ycy5hcHBseUFkZGl0aW9uYWwpIHtcblx0XHRcdFx0XHRcdGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldEFkZGl0aW9uYWxEaXJlY3RvcmllcyhhbmNob3JzLmFkZGl0aW9uYWxEaXJlY3Rvcmllcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiB7IC8qIGJlc3QtZWZmb3J0IGFuY2hvcmluZyAqLyB9LFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdGl2ZUNsaWVudC5nZXRPckNyZWF0ZUhhbmRsZShjbGllbnQuY2xpZW50SWQsIGNsaWVudC5kaXNwbGF5TmFtZSk7XG5cdH1cblxuXHQvKiogQWRkcyBgY2hhdGAgdG8gdGhlIGhvc3QtcHVibGlzaGVkIG1lbWJlcnNoaXAgZm9yIGBjbGllbnRJZGAuICovXG5cdHByaXZhdGUgX2Fkb3B0Q2xpZW50Q2hhdChhY3RpdmVDbGllbnQ6IEFjdGl2ZUNsaWVudCwgY2xpZW50SWQ6IHN0cmluZywgY2hhdDogVVJJKTogdm9pZCB7XG5cdFx0aWYgKGFjdGl2ZUNsaWVudC5hZGRDbGllbnRDaGF0KGNsaWVudElkLCBjaGF0KSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQWN0aXZlIGNsaWVudCAke2NsaWVudElkfSBub3cgY29udHJpYnV0ZXMgdG8gY2hhdCAke2NoYXQudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVtb3ZlcyBgY2xpZW50SWRgIGZyb20gb25lIGV4YWN0IGNoYXQsIGRyb3BwaW5nIHRoZSBjbGllbnQgb25seSB3aGVuIG5vIGNoYXRzIHJlbWFpbi4gKi9cblx0cmVtb3ZlQWN0aXZlQ2xpZW50KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUmVzb3VyY2UgPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KS5jb25maWd1cmF0aW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbklkID0gQWdlbnRTZXNzaW9uLmlkKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoY29uZmlndXJhdGlvblJlc291cmNlKTtcblx0XHRpZiAoIWFjdGl2ZUNsaWVudCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke2NvbmZpZ3VyYXRpb25JZH1dIHJlbW92ZUFjdGl2ZUNsaWVudDogbm8gYWN0aXZlIGNsaWVudCBzdGF0ZSBmb3IgY2xpZW50SWQ9JHtjbGllbnRJZH0sIGNoYXQ9JHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdhc0xhc3RDaGF0ID0gYWN0aXZlQ2xpZW50LnJlbW92ZUNsaWVudENoYXQoY2xpZW50SWQsIGNoYXQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtjb25maWd1cmF0aW9uSWR9XSByZW1vdmVBY3RpdmVDbGllbnQ6IGNsaWVudElkPSR7Y2xpZW50SWR9LCBjaGF0PSR7Y2hhdC50b1N0cmluZygpfSwgZnVsbHlSZW1vdmVkPSR7d2FzTGFzdENoYXR9YCk7XG5cdFx0aWYgKHdhc0xhc3RDaGF0KSB7XG5cdFx0XHRhY3RpdmVDbGllbnQucmVtb3ZlQ2xpZW50KGNsaWVudElkKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUm91dGVzIGEgY29tcGxldGVkIGNsaWVudCB0b29sIGNhbGwgdG8gdGhlIHJ1bnRpbWUgdGhhdCBvd25zIGl0LiAqL1xuXHRvbkNsaWVudFRvb2xDYWxsQ29tcGxldGUoY2hhdDogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQsIGNvbnRleHQ/OiBJQWdlbnRDaGF0Q29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IHNwYXduZWRGcm9tID0gcmVzb2x2ZVN1YmFnZW50Q2hhdFBhcmVudChjb250ZXh0KTtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9maW5kQ2hhdEJ5VXJpKGNoYXQpXG5cdFx0XHQ/PyAoc3Bhd25lZEZyb20gPyB0aGlzLl9maW5kQ2hhdEJ5VXJpKHNwYXduZWRGcm9tLmNoYXQpIDogdW5kZWZpbmVkKVxuXHRcdFx0Pz8gKGNvbnRleHQgPyB0aGlzLl9maW5kU2Vzc2lvbkNoYXQoY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkKTtcblx0XHR0YXJnZXQ/LmhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUodG9vbENhbGxJZCwgcmVzdWx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRNZXNzYWdlKGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBzZW5kZXJDbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZSA9IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10sIG9wZXJhdGlvbkNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgY2xpZW50VGVsZW1ldHJ5Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3NlbmRNZXNzYWdlT25jZShjaGF0LCBwcm9tcHQsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlLCB3b3JraW5nRGlyZWN0b3JpZXMsIG9wZXJhdGlvbkNvbnRleHQsIGNsaWVudFRlbGVtZXRyeUNvbnRleHQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCByZWNvdmVyeSA9IGF3YWl0IHRoaXMuX3JlY292ZXJGcm9tQ2xvc2VkQ29ubmVjdGlvbihlcnJvciwgJ3NlbmRNZXNzYWdlJywgdGhpcy5fY2xpZW50RmFpbHVyZUNvcnJlbGF0aW9uKGNoYXQsIHR1cm5JZCwgb3BlcmF0aW9uQ29udGV4dCkpO1xuXHRcdFx0aWYgKHR1cm5JZCAmJiByZWNvdmVyeT8uZmFpbGVkVHVybklkcy5oYXModHVybklkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kTWVzc2FnZU9uY2UoY2hhdDogVVJJLCBwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIHNlbmRlckNsaWVudElkPzogc3RyaW5nLCBjbGllbnRUeXBlID0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLCB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBVUklbXSwgb3BlcmF0aW9uQ29udGV4dD86IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBjbGllbnRUZWxlbWV0cnlDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZVNlbmRDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9xdWV1ZUNoYXQoY29udGV4dC5jb25maWd1cmF0aW9uSWQsIGNvbnRleHQuc2VxdWVuY2VyS2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVzb2x2ZVNlbmRDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRcdGF3YWl0IHRoaXMuX2FjdGl2ZUNsaWVudHMuZ2V0KGN1cnJlbnQuY29uZmlndXJhdGlvblJlc291cmNlKT8ucGx1Z2luQ29udHJvbGxlci5yZXRyeUZhaWxlZENsaWVudFN5bmNJZk5lZWRlZCgpO1xuXG5cdFx0XHRsZXQgZW50cnk6IENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQgPSBjdXJyZW50LnRhcmdldDtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0ZW50cnkgPSBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKGN1cnJlbnQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHRoZSBhY3RpdmUgY2xpZW50J3MgY29uZmlnIGNoYW5nZWQgKHRvb2xzIG9yIHBsdWdpbnMpLFxuXHRcdFx0Ly8gZGlzcG9zZSB0aGlzIHNlc3Npb24gc28gaXQgZ2V0cyByZXN1bWVkIHdpdGggdGhlIHVwZGF0ZWQgY29uZmlnLlxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoY3VycmVudC5jb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaGFkQ2FjaGVkRW50cnkgPSAhIWVudHJ5O1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke2N1cnJlbnQuY29uZmlndXJhdGlvbklkfV0gc2VuZE1lc3NhZ2U6IGNhY2hlZEVudHJ5PSR7aGFkQ2FjaGVkRW50cnl9LCBoYXNBY3RpdmVDbGllbnQ9JHshIWFjdGl2ZUNsaWVudH0sIGFjdGl2ZUNsaWVudElkPSR7YWN0aXZlQ2xpZW50ID8gJyhzZXQpJyA6ICcobm9uZSknfWApO1xuXHRcdFx0Y29uc3Qgcm9vdHNDaGFuZ2VkID0gISFlbnRyeSAmJiB3b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZCAmJiAhYXJlQWRkaXRpb25hbFdvcmtpbmdEaXJlY3Rvcmllc0VxdWFsKGVudHJ5LmFwcGxpZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXMsIHRoaXMuX2FkZGl0aW9uYWxDdXN0b21pemF0aW9uRGlyZWN0b3JpZXMod29ya2luZ0RpcmVjdG9yaWVzKSk7XG5cdFx0XHRjb25zdCBzdHJ1Y3R1cmFsQ29uZmlnQ2hhbmdlZCA9ICEhZW50cnkgJiYgISFhY3RpdmVDbGllbnQgJiYgYXdhaXQgYWN0aXZlQ2xpZW50LnJlcXVpcmVzUmVzdGFydChlbnRyeS5hcHBsaWVkU25hcHNob3QsIGN1cnJlbnQuY2hhdEtleSk7XG5cdFx0XHRpZiAoZW50cnkgJiYgKHJvb3RzQ2hhbmdlZCB8fCBzdHJ1Y3R1cmFsQ29uZmlnQ2hhbmdlZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke2N1cnJlbnQuY29uZmlndXJhdGlvbklkfV0gU2Vzc2lvbiBjb25maWd1cmF0aW9uIGNoYW5nZWQsIHJlZnJlc2hpbmcgc2Vzc2lvbi4gY2xpZW50cz1bJHthY3RpdmVDbGllbnQgPyBbLi4uYWN0aXZlQ2xpZW50LnRvb2xTZXQuY2xpZW50SWRzKCldLmpvaW4oJywgJykgfHwgJyhub25lKScgOiAnKG5vbmUpJ31dYCk7XG5cdFx0XHRcdC8vIEZpbmlzaCBkaXNjb25uZWN0aW5nIGJlZm9yZSByZXN1bWluZyB0aGUgU0FNRSBTREsgc2Vzc2lvbiBpZCB3aXRoXG5cdFx0XHRcdC8vIHRoZSB1cGRhdGVkIGNvbmZpZy4gUm91dGluZyBpcyBwcmVzZXJ2ZWQgc28gdGhlIHNlc3Npb24gaWRlbnRpdHlcblx0XHRcdFx0Ly8gaXMgcmVjb3ZlcmFibGU7IHBlZXIgY2hhdHMga2VlcCB0aGVpciBvd24gZW50cmllcyBhbmQgYXJlIGxlZnRcblx0XHRcdFx0Ly8gaW50YWN0LiBSZXN1bWUgZXhwbGljaXRseSAocmF0aGVyIHRoYW4gdmlhIHRoZSBnZW5lcmljIHJlLXJlc29sdmVcblx0XHRcdFx0Ly8gYmVsb3cpIHNvIHRoZSByZWZyZXNoZWQgY29uZmlnIGlzIHJlLWFwcGxpZWQgZGV0ZXJtaW5pc3RpY2FsbHkuXG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Rlc3Ryb3lMaXZlU2Vzc2lvbihlbnRyeSwgdHJ1ZSk7XG5cdFx0XHRcdGlmIChlbnRyeS5zZXNzaW9uSWQgPT09IGN1cnJlbnQuY29uZmlndXJhdGlvbklkKSB7XG5cdFx0XHRcdFx0ZW50cnkgPSBhd2FpdCB0aGlzLl9yZXN1bWVTZXNzaW9uKGN1cnJlbnQuY29uZmlndXJhdGlvbklkLCBjdXJyZW50LmNoYXQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHRcdFx0YWN0aXZlQ2xpZW50Py5wbHVnaW5Db250cm9sbGVyLnNldEFkZGl0aW9uYWxEaXJlY3Rvcmllcyh0aGlzLl9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKHdvcmtpbmdEaXJlY3RvcmllcykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbnRyeSA9IGF3YWl0IHRoaXMuX2Vuc3VyZVJlc29sdmVkQ2hhdFNlc3Npb24oY3VycmVudCwgd29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7Y3VycmVudC5jb25maWd1cmF0aW9uSWR9XSBObyBjYWNoZWQgZW50cnkke2hhZENhY2hlZEVudHJ5ID8gJyAod2FzIGV2aWN0ZWQgYnkgcmVxdWlyZXNSZXN0YXJ0KScgOiAnJ30sIGNhbGxpbmcgX3Jlc3VtZVNlc3Npb25gKTtcblx0XHRcdH1cblx0XHRcdGVudHJ5ID8/PSBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKGN1cnJlbnQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIHNlbmRNZXNzYWdlIGZvciB1bmtub3duIGNoYXQ6ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNldCBwZXItdHVybiBzdHJlYW1pbmcgc3RhdGUgb24gdGhlIHNlc3Npb24gc28gdGhhdCB0aGVcblx0XHRcdC8vIG5leHQgdGV4dC9yZWFzb25pbmcgY2h1bmsgKGFuZCBhbnkgaG9zdC1lbWl0dGVkIGFubm91bmNlbWVudClcblx0XHRcdC8vIGFsbG9jYXRlcyBhIGZyZXNoIHJlc3BvbnNlIHBhcnQuXG5cdFx0XHRpZiAodHVybklkKSB7XG5cdFx0XHRcdGVudHJ5LnJlc2V0VHVyblN0YXRlKHR1cm5JZCwgc2VuZGVyQ2xpZW50SWQsIGNsaWVudFR5cGUsIGNsaWVudFRlbGVtZXRyeUNvbnRleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzZGtNb2RlID0gdGhpcy5fcmVzb2x2ZVNka01vZGUoY3VycmVudC5jb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBzaWRlQ2hhdCA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY3VycmVudC5jaGF0S2V5KT8uc2lkZUNoYXQ7XG5cdFx0XHRcdGNvbnN0IHR1cm5zID0gc2lkZUNoYXQgPyBhd2FpdCBlbnRyeS5nZXRNZXNzYWdlcygpIDogW107XG5cdFx0XHRcdGNvbnN0IHNka1Byb21wdCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdChwcm9tcHQsIHR1cm5zLCBzaWRlQ2hhdCk7XG5cdFx0XHRcdGF3YWl0IGVudHJ5LnNlbmQoc2RrUHJvbXB0LCBhdHRhY2htZW50cywgdHVybklkLCBzZGtNb2RlLCBzZW5kZXJDbGllbnRJZCwgY2xpZW50VHlwZSwgcmVzb2x2ZUFnZW50SG9zdEluc3RydWN0aW9ucyhvcGVyYXRpb25Db250ZXh0KSwgY2xpZW50VGVsZW1ldHJ5Q29udGV4dCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgZXJyQ29kZSA9IChlcnIgYXMgeyBjb2RlPzogbnVtYmVyIH0pPy5jb2RlO1xuXHRcdFx0XHRjb25zdCBlcnJNc2cgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90OiR7Y3VycmVudC5jb25maWd1cmF0aW9uSWR9XSBlbnRyeS5zZW5kKCkgZmFpbGVkOiBjb2RlPSR7ZXJyQ29kZX0sIG1lc3NhZ2U9JHtlcnJNc2d9LCBoYWRDYWNoZWRFbnRyeT0ke2hhZENhY2hlZEVudHJ5fSwgZXJyb3JUeXBlPSR7ZXJyPy5jb25zdHJ1Y3Rvcj8ubmFtZX1gKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zbGF0ZXMgdGhlIEFIUC1zaWRlIGBtb2RlYCB0byB0aGUgQ29waWxvdCBTREsncyB0aHJlZS1tb2RlIHNwYWNlXG5cdCAqIChgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC8gYGF1dG9waWxvdGApLiBXaXRoIEF1dG9waWxvdCBsaXZpbmcgb24gdGhlXG5cdCAqIGBtb2RlYCBheGlzIHRoZSBtYXBwaW5nIGlzIG5vdyBkaXJlY3Q6XG5cdCAqXG5cdCAqICAtIGBtb2RlPSdwbGFuJ2AgXHUyMTkyIFNESyBgcGxhbmAuXG5cdCAqICAtIGBtb2RlPSdhdXRvcGlsb3QnYCBcdTIxOTIgU0RLIGBhdXRvcGlsb3RgIChhdXRvbm9tb3VzLCBjb250aW51ZS11bnRpbC1kb25lKS5cblx0ICogIC0gYG1vZGU9J2ludGVyYWN0aXZlJ2AgXHUyMTkyIFNESyBgaW50ZXJhY3RpdmVgLlxuXHQgKlxuXHQgKiBUb29sIGF1dG8tYXBwcm92YWwgaXMgZ292ZXJuZWQgaW5kZXBlbmRlbnRseSBieSB0aGUgb3J0aG9nb25hbFxuXHQgKiBgYXV0b0FwcHJvdmVgIGF4aXMgKERlZmF1bHQgLyBCeXBhc3MpLCBlbmZvcmNlZCBieSB0aGUgYWdlbnRcblx0ICogaG9zdCdzIG93biBwZXJtaXNzaW9uIGhhbmRsZXIgXHUyMDE0IHdoaWNoIHRoZSBTREsgc3RpbGwgaW52b2tlcyBldmVuIHVuZGVyXG5cdCAqIGF1dG9waWxvdCBtb2RlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gbW9kZSBpcyBjb25maWd1cmVkIGZvciB0aGUgc2Vzc2lvbiwgc29cblx0ICogdGhlIFNESydzIGN1cnJlbnQgbW9kZSBpcyBsZWZ0IHVudG91Y2hlZC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVTZGtNb2RlKHNlc3Npb246IFVSSSk6IENvcGlsb3RTZGtNb2RlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShzZXNzaW9uS2V5LCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuTW9kZSk7XG5cdFx0c3dpdGNoIChtb2RlKSB7XG5cdFx0XHRjYXNlICdwbGFuJzpcblx0XHRcdFx0cmV0dXJuICdwbGFuJztcblx0XHRcdGNhc2UgJ2F1dG9waWxvdCc6XG5cdFx0XHRcdHJldHVybiAnYXV0b3BpbG90Jztcblx0XHRcdGNhc2UgJ2ludGVyYWN0aXZlJzpcblx0XHRcdFx0cmV0dXJuICdpbnRlcmFjdGl2ZSc7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgc2Vzc2lvbidzIGN1cnJlbnQgYG1vZGVgIGFuZCBgYXV0b0FwcHJvdmVgIGF4aXMgdmFsdWVzIHNvIHRoZVxuXHQgKiBzbGFzaC1jb21tYW5kIGNvbXBsZXRpb24gcHJvdmlkZXIgY2FuIGhpZGUgY29uZmlnLWFjdGlvbiB0b2dnbGVzIHRoYXQgd291bGRcblx0ICogYmUgYSBuby1vcCAoZS5nLiBgL2F1dG9waWxvdCBvbmAgd2hpbGUgYWxyZWFkeSBpbiBhdXRvcGlsb3QpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbkNvbmZpZ1N0YXRlKHNlc3Npb25JZDogc3RyaW5nKTogSUNvcGlsb3RDb25maWdTbGFzaENvbW1hbmRTdGF0ZSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IEFnZW50U2Vzc2lvbi51cmkodGhpcy5pZCwgc2Vzc2lvbklkKS50b1N0cmluZygpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RlOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZShzZXNzaW9uS2V5LCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuTW9kZSksXG5cdFx0XHRhdXRvQXBwcm92ZTogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlVmFsdWUoc2Vzc2lvbktleSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSxcblx0XHR9O1xuXHR9XG5cblx0c2V0UGVuZGluZ01lc3NhZ2VzKGNoYXQ6IFVSSSwgc3RlZXJpbmdNZXNzYWdlOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCwgX3F1ZXVlZE1lc3NhZ2VzOiByZWFkb25seSBQZW5kaW5nTWVzc2FnZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgYmFja2luZyA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY2hhdC50b1N0cmluZygpKTtcblx0XHRjb25zdCB0YXJnZXQgPSBiYWNraW5nID8gdGhpcy5fZmluZFNlc3Npb25CeVNka0lkKGJhY2tpbmcuc2RrU2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gc2V0UGVuZGluZ01lc3NhZ2VzOiBjaGF0IG5vdCBmb3VuZCBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU3RlZXJpbmc6IHNlbmQgd2l0aCBtb2RlICdpbW1lZGlhdGUnIHNvIHRoZSBTREsgaW5qZWN0cyBpdCBtaWQtdHVyblxuXHRcdGlmIChzdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdHRhcmdldC5zZW5kU3RlZXJpbmcoc3RlZXJpbmdNZXNzYWdlKTtcblx0XHR9XG5cblx0XHQvLyBRdWV1ZWQgbWVzc2FnZXMgYXJlIGNvbnN1bWVkIGJ5IHRoZSBzZXJ2ZXIgKEFnZW50U2lkZUVmZmVjdHMpXG5cdFx0Ly8gd2hpY2ggZGlzcGF0Y2hlcyBDaGF0VHVyblN0YXJ0ZWQgYW5kIGNhbGxzIHNlbmRNZXNzYWdlIGRpcmVjdGx5LlxuXHRcdC8vIE5vIFNESy1sZXZlbCBlbnF1ZXVlIGlzIG5lZWRlZC5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXRNZXNzYWdlcyhjaGF0OiBVUkksIHNlc3Npb25PckNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRpZiAodGhpcy5faXNTaHV0dGluZ0Rvd24pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gQSBzdWJhZ2VudCB0cmFuc2NyaXB0IGlzIGlkZW50aWZpZWQgYnkgaXRzIGhvc3Qtc3VwcGxpZWQgdG9vbCBzcGF3blxuXHRcdC8vIGVkZ2UsIG5ldmVyIGJ5IHJlY29nbml6aW5nIGEgc2hhcGUgaW4gdGhlIGFkZHJlc3NlZCBVUkkuXG5cdFx0aWYgKHJlc29sdmVTdWJhZ2VudENoYXRQYXJlbnQoc2Vzc2lvbk9yQ29udGV4dCkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRTdWJhZ2VudENoYXRNZXNzYWdlcyhjaGF0LCBzZXNzaW9uT3JDb250ZXh0KTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBzZXNzaW9uT3JDb250ZXh0KTtcblx0XHRpZiAodGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoY29udGV4dC5jb25maWd1cmF0aW9uSWQpPy5zZGtTZXNzaW9uSWQgPT09IGNvbnRleHQuc2RrU2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fcXVldWVDaGF0KGNvbnRleHQuY29uZmlndXJhdGlvbklkLCBjb250ZXh0LnNlcXVlbmNlcktleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZVJlc29sdmVkQ2hhdFNlc3Npb24odGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIHNlc3Npb25PckNvbnRleHQpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbnRleHQuc2RrU2Vzc2lvbklkKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtjb250ZXh0LmNvbmZpZ3VyYXRpb25JZH1dIEZhaWxlZCB0byByZXNvbHZlIGNoYXQgZm9yIG1lc3NhZ2UgbG9va3VwYCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgdHVybnMgPSBhd2FpdCBlbnRyeS5nZXRNZXNzYWdlcygpO1xuXHRcdGNvbnN0IHNpZGVDaGF0ID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjb250ZXh0LmNoYXRLZXkpPy5zaWRlQ2hhdDtcblx0XHRyZXR1cm4gc2xpY2VTaWRlQ2hhdFR1cm5zKHR1cm5zLCBzaWRlQ2hhdCk7XG5cdH1cblxuXHQvKiogUmVjb25zdHJ1Y3RzIGEgc3ViYWdlbnQgdHJhbnNjcmlwdCBmcm9tIHRoZSBwYXJlbnQgY2hhdCBuYW1lZCBieSB0aGUgaG9zdC1zdXBwbGllZCB0b29sIG9yaWdpbi4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U3ViYWdlbnRDaGF0TWVzc2FnZXMoY2hhdDogVVJJLCBzZXNzaW9uT3JDb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3Qgc3Bhd25lZEZyb20gPSByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50KHNlc3Npb25PckNvbnRleHQpO1xuXHRcdGlmICghc3Bhd25lZEZyb20pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIFN1YmFnZW50IGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9IGFkZHJlc3NlZCB3aXRob3V0IGl0cyBob3N0LXN1cHBsaWVkIHRvb2wtY2FsbCBvcmlnaW47IG5vIHR1cm5zIHRvIHJlY29uc3RydWN0YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IG93bmVyID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoc2Vzc2lvbk9yQ29udGV4dCwgY2hhdCkuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdGNvbnN0IHBhcmVudENvbnRleHQgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoc3Bhd25lZEZyb20uY2hhdCwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IG93bmVyLCByZXNvdXJjZTogb3duZXIgfSk7XG5cdFx0Y29uc3QgcGFyZW50RW50cnkgPSBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKHBhcmVudENvbnRleHQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7cGFyZW50Q29udGV4dC5zZGtTZXNzaW9uSWQgPz8gcGFyZW50Q29udGV4dC5jb25maWd1cmF0aW9uSWR9XSBGYWlsZWQgdG8gcmVzdW1lIGV4YWN0IHNvdXJjZSBjaGF0IGZvciBzdWJhZ2VudCByZXN0b3JlYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHBhcmVudEVudHJ5Py5nZXRTdWJhZ2VudE1lc3NhZ2VzKHNwYXduZWRGcm9tLnRvb2xDYWxsSWQpID8/IFtdO1xuXHR9XG5cblx0LyoqIFJlbGVhc2VzIHByb3ZpZGVyLW93bmVkIHJlc291cmNlcyBvbmNlIHRoZSBsYXN0IGNoYXQgc2hhcmluZyBgc2NvcGVgIGlzIGdvbmUuICovXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmFsaXplQ29uZmlndXJhdGlvblNjb3BlKHNjb3BlOiBVUkksIHNjb3BlSWQ6IHN0cmluZywgd29ya3NwYWNlbGVzc0hpbnQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpc1dvcmtzcGFjZWxlc3MgPSB3b3Jrc3BhY2VsZXNzSGludFxuXHRcdFx0fHwgKGF3YWl0IHRoaXMuX3JlYWRTZXNzaW9uTWV0YWRhdGEoc2NvcGUpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkpPy53b3Jrc3BhY2VsZXNzID09PSB0cnVlO1xuXHRcdHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZGVsZXRlKHNjb3BlSWQpO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25MaWZldGltZXMuZ2V0KHNjb3BlSWQpPy5kaXNwb3NlKGFzeW5jICgpID0+IHsgfSk7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50cy5nZXQoc2NvcGUpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50cy5kZWxldGUoc2NvcGUpO1xuXHRcdHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucy5kZWxldGUoc2NvcGUpO1xuXHRcdGlmIChpc1dvcmtzcGFjZWxlc3MpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NsZWFudXBXb3Jrc3BhY2VsZXNzU2NyYXRjaERpcih0aGlzLl93b3Jrc3BhY2VsZXNzU2NyYXRjaERpcihzY29wZUlkKSwgc2NvcGVJZCk7XG5cdFx0fVxuXHRcdHRoaXMuX290ZWxTZXJ2aWNlLnJlbGVhc2VTZXNzaW9uVHJhY2VDb250ZXh0KHNjb3BlLnRvU3RyaW5nKCkpO1xuXHRcdGF3YWl0IHRoaXMuX2FwcGx5UGVuZGluZ0NsaWVudFJlc3RhcnQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Fib3J0U2Vzc2lvbihjaGF0OiBVUkksIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2Fib3J0U2Vzc2lvbk9uY2UoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnN0IGNvcnJlbGF0aW9uID0gdGhpcy5fY2xpZW50RmFpbHVyZUNvcnJlbGF0aW9uKGNoYXQsIHVuZGVmaW5lZCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRpZiAoIWlzQ29waWxvdENvbm5lY3Rpb25DbG9zZWRFcnJvcihlcnJvcikpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVjb3ZlckZyb21DbG9zZWRDb25uZWN0aW9uKGVycm9yLCAnYWJvcnQnLCBjb3JyZWxhdGlvbik7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpLnRhcmdldD8uZGlzY2FyZEFjdGl2ZVR1cm4oKTtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5fcmVjb3ZlckZyb21DbG9zZWRDb25uZWN0aW9uKGVycm9yLCAnYWJvcnQnLCBjb3JyZWxhdGlvbikpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWJvcnRTZXNzaW9uT25jZShjaGF0OiBVUkksIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9xdWV1ZUNoYXQoY29udGV4dC5jb25maWd1cmF0aW9uSWQsIGNvbnRleHQuc2VxdWVuY2VyS2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCkudGFyZ2V0Py5hYm9ydCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqIENyZWF0ZXMgYSBjb25jcmV0ZSBjaGF0IGJhY2tpbmcgaW1tZWRpYXRlbHksIG9wdGlvbmFsbHkgYnkgaW1wb3J0aW5nIGhpc3RvcnkgZnJvbSBhbm90aGVyIGNoYXQuICovXG5cdHByaXZhdGUgYXN5bmMgX21pbnRDaGF0QmFja2luZyhjaGF0OiBVUkksIGNvbnRleHQ6IElBZ2VudENoYXRDb250ZXh0LCBvcHRpb25zOiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKTtcblx0XHRjb25zdCBmb3JrID0gb3B0aW9ucy5mb3JrO1xuXHRcdC8vIEEgZm9yaydzIHNvdXJjZSBtYXkgbGl2ZSBpbiBhbm90aGVyIHNlc3Npb247IGl0cyBzY29wZSB3YXMgcmVjb3JkZWRcblx0XHQvLyB3aGVuIHRoYXQgc291cmNlIGNoYXQgd2FzIGNyZWF0ZWQgb3IgbWF0ZXJpYWxpemVkIChuZXZlciBkZXJpdmVkXG5cdFx0Ly8gZnJvbSB0aGUgY2hhdCBVUkkncyBzaGFwZSkuXG5cdFx0Y29uc3QgZm9ya1NvdXJjZVNjb3BlID0gZm9yayA/IHRoaXMuX3Jlc29sdmVDaGF0U2NvcGUoZm9yay5zb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZvcmtTb3VyY2VTZXNzaW9uSWQgPSBmb3JrU291cmNlU2NvcGUgPyBBZ2VudFNlc3Npb24uaWQoZm9ya1NvdXJjZVNjb3BlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbmhlcml0c0Zyb21PdGhlclNlc3Npb24gPSAhIWZvcmsgJiYgZm9ya1NvdXJjZVNlc3Npb25JZCAhPT0gc2Vzc2lvbklkO1xuXHRcdGNvbnN0IGV4aXN0aW5nQmFja2luZyA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY2hhdEtleSk7XG5cdFx0aWYgKGV4aXN0aW5nQmFja2luZykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4aXN0aW5nTWludGVkQ2hhdFJlc3VsdChzZXNzaW9uLCBzZXNzaW9uSWQsIGV4aXN0aW5nQmFja2luZywgaW5oZXJpdHNGcm9tT3RoZXJTZXNzaW9uKTtcblx0XHR9XG5cdFx0aWYgKGZvcmsgJiYgaXNFcXVhbChmb3JrLnNvdXJjZSwgY2hhdCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGZvcmsgQ29waWxvdCBjaGF0ICR7Y2hhdEtleX0gb250byBpdHNlbGZgKTtcblx0XHR9XG5cdFx0bGV0IHJlc3VsdDogSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB8IHVuZGVmaW5lZDtcblx0XHQvLyBBIGZvcmsgcmVhZHMgdGhlIHNvdXJjZSdzIHN0YXRlLCBzbyBpdCBzZXJpYWxpemVzIGFnYWluc3QgdGhlIHNvdXJjZSdzXG5cdFx0Ly8gc2Vzc2lvbjsgYSBzaWRlIGNoYXQgcnVucyBvbiBpdHMgb3duIGNoYXQgc2VxdWVuY2VyIHNvIGl0IG5ldmVyIGJsb2Nrc1xuXHRcdC8vIHRoZSBjaGF0IGl0IGJyYW5jaGVzIGZyb20uXG5cdFx0Y29uc3QgcXVldWUgPSA8VD4odGFzazogKCkgPT4gUHJvbWlzZTxUPikgPT4gb3B0aW9ucy5zaWRlQ2hhdFxuXHRcdFx0PyB0aGlzLl9xdWV1ZUNoYXQoc2Vzc2lvbklkLCBjaGF0S2V5LCB0YXNrKVxuXHRcdFx0OiB0aGlzLl9xdWV1ZVNlc3Npb24oZm9ya1NvdXJjZVNlc3Npb25JZCA/PyBzZXNzaW9uSWQsIHRhc2spO1xuXHRcdGF3YWl0IHF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLl9leGlzdGluZ01pbnRlZENoYXRSZXN1bHQoc2Vzc2lvbiwgc2Vzc2lvbklkLCBleGlzdGluZywgaW5oZXJpdHNGcm9tT3RoZXJTZXNzaW9uKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQSBmb3JrIHJ1bnMgd2hlcmUgaXRzIHNvdXJjZSBydW5zLCBzbyBpdCByZXNvbHZlcyB0aGUgc291cmNlJ3Ncblx0XHRcdC8vIHByb2Nlc3Mgcm9vdDsgZXZlcnkgb3RoZXIgY2hhdCBjb25zdW1lcyBpbmRleCAwIG9mIHRoZSBob3N0J3Ncblx0XHRcdC8vIHJlc29sdmVkIHNldCB3aXRob3V0IHJlYWRpbmcgYW55IHNlc3Npb24gc3RhdGUgYmFjay5cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBpbmhlcml0c0Zyb21PdGhlclNlc3Npb25cblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9yZXNvbHZlQ3JlYXRlV29ya2luZ0RpcmVjdG9yeShvcHRpb25zLCBzZXNzaW9uSWQsIGZhbHNlKVxuXHRcdFx0XHQ6IG9wdGlvbnMud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ29waWxvdF0gY3JlYXRlQ2hhdDogbWlzc2luZyByZXNvbHZlZCB3b3JraW5nIGRpcmVjdG9yeSBmb3Igc2Vzc2lvbiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNvdXJjZU1ldGFkYXRhID0gaW5oZXJpdHNGcm9tT3RoZXJTZXNzaW9uID8gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShmb3JrU291cmNlU2NvcGUhKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1vZGVsID0gb3B0aW9ucy5tb2RlbCA/PyBzb3VyY2VNZXRhZGF0YT8ubW9kZWw7XG5cdFx0XHRjb25zdCBhZ2VudCA9IG9wdGlvbnMuYWdlbnQgPz8gc291cmNlTWV0YWRhdGE/LmFnZW50O1xuXHRcdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0XHRjb25zdCBjaGF0U2RrSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdC8vIENoYXQgYmFja2luZ3Mgc2hhcmUgdGhlIG93bmluZyBzZXNzaW9uJ3MgQWN0aXZlQ2xpZW50IHNvIHRoYXRcblx0XHRcdC8vIGNsaWVudCB0b29sIC8gY3VzdG9taXphdGlvbiB1cGRhdGVzICh3aGljaCBhcmUga2V5ZWQgYnkgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIFVSSSB2aWEgdGhlIGFjdGl2ZS1jbGllbnQgaGFuZGxlcykgcmVhY2ggdGhlIGFkZHJlc3NlZFxuXHRcdFx0Ly8gU0RLIGNoYXQuIEtleWluZyBpdCBieSB0aGUgY2hhdCBVUkkgaW5zdGVhZCB3b3VsZFxuXHRcdFx0Ly8gc25hcHNob3QgZW1wdHkvc3RhbGUgdG9vbHMgYW5kIG5ldmVyIHNlZSBzdWJzZXF1ZW50IHVwZGF0ZXMsIGFuZFxuXHRcdFx0Ly8gd291bGQgYWxzbyBsZWFrIChub3RoaW5nIGRpc3Bvc2VzIGEgY2hhdC1rZXllZCBBY3RpdmVDbGllbnQpLlxuXHRcdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGFjdGl2ZUNsaWVudC5zbmFwc2hvdChjaGF0S2V5KTtcblx0XHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgY2hhdCwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHQvLyBUaGUgZGF0YWJhc2UgY29weSBsYW5kcyBpbiB0aGUgc3RvcmFnZSBzY29wZSBBZ2VudCBIb3N0IGNob3NlIGZvclxuXHRcdFx0Ly8gdGhpcyBjaGF0LCB3aGljaCBpcyBhbHNvIHRoZSBzY29wZSBpdHMgcnVudGltZSByZWFkcyBhbmQgd3JpdGVzLlxuXHRcdFx0Y29uc3Qgc3RvcmFnZVNjb3BlID0gY29udGV4dC5yZXNvdXJjZTtcblxuXHRcdFx0Ly8gRm9ya2luZzogbWludCB0aGUgbmV3IGNoYXQncyBiYWNraW5nIGJ5IGZvcmtpbmcgdGhlIHNvdXJjZSBjaGF0J3Ncblx0XHRcdC8vIFNESyBjb252ZXJzYXRpb24gYXQgdGhlIHJlcXVlc3RlZCB0dXJuIChjb3B5aW5nIGl0cyBkYXRhYmFzZSBpbnRvXG5cdFx0XHQvLyB0aGlzIGNoYXQncyBzdG9yYWdlIHNjb3BlKSwgdGhlbiByZXN1bWUgaXQuIE90aGVyd2lzZSBzcGluIHVwIGFcblx0XHRcdC8vIGZyZXNoIGVtcHR5IGNoYXQuXG5cdFx0XHRsZXQgbGF1bmNoUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuO1xuXHRcdFx0bGV0IHNka1Nlc3Npb25JZDogc3RyaW5nO1xuXHRcdFx0bGV0IHNpZGVDaGF0OiBJUGVyc2lzdGVkQ2hhdFsnc2lkZUNoYXQnXTtcblx0XHRcdGxldCBzb3VyY2VFbnRyeTogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChmb3JrKSB7XG5cdFx0XHRcdHNvdXJjZUVudHJ5ID0gYXdhaXQgdGhpcy5fZW5zdXJlUmVzb2x2ZWRDaGF0U2Vzc2lvbih0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoZm9yay5zb3VyY2UsIHsgY29uZmlndXJhdGlvblJlc291cmNlOiBmb3JrU291cmNlU2NvcGUhLCByZXNvdXJjZTogdGhpcy5fcmVzb2x2ZUNoYXRTdG9yYWdlU2NvcGUoZm9yay5zb3VyY2UpIH0pKTtcblx0XHRcdFx0aWYgKCFzb3VyY2VFbnRyeSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIGNyZWF0ZUNoYXQgZm9yazogc291cmNlIGNoYXQgJHtmb3JrLnNvdXJjZS50b1N0cmluZygpfSBub3QgZm91bmRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCB0aGlzLl9mb3JrU2RrQ2hhdChjbGllbnQsIHNvdXJjZUVudHJ5LCBmb3JrLnR1cm5JZCwgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLmdldFNlc3Npb25EYXRhRGlyKHN0b3JhZ2VTY29wZSkpO1xuXHRcdFx0XHRzZGtTZXNzaW9uSWQgPSBmb3JrZWQuc2Vzc2lvbklkO1xuXHRcdFx0XHRsYXVuY2hQbGFuID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0XHRcdGNsaWVudCxcblx0XHRcdFx0XHRzZXNzaW9uSWQ6IHNka1Nlc3Npb25JZCxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRcdHJlc29sdmVkQWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c25hcHNob3QsXG5cdFx0XHRcdFx0ZGlzYWJsZWRSb290TWNwU2VydmVyczogdGhpcy5fZGlzYWJsZWRSb290TWNwU2VydmVycyhzZXNzaW9uLCBzZGtTZXNzaW9uSWQsIHNuYXBzaG90KSxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBhY3RpdmVDbGllbnQudG9vbFNldCxcblx0XHRcdFx0XHRzaGVsbE1hbmFnZXIsXG5cdFx0XHRcdFx0Z2l0aHViVG9rZW46IHRoaXMuX2dpdGh1YlRva2VuLFxuXHRcdFx0XHRcdGZhbGxiYWNrOiB7IG1vZGVsLCBsb25nQ29udGV4dFdpbmRvdzogdGhpcy5fbG9uZ0NvbnRleHRXaW5kb3dGb3IobW9kZWw/LmlkKSwgZnJlZUxvbmdDb250ZXh0OiB0aGlzLl9pc0ZyZWVMb25nQ29udGV4dChtb2RlbD8uaWQpIH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnMuc2lkZUNoYXQpIHtcblx0XHRcdFx0Y29uc3Qgc2lkZUNoYXRTb3VyY2UgPSBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChvcHRpb25zLnNpZGVDaGF0LnNvdXJjZSwgeyBjb25maWd1cmF0aW9uUmVzb3VyY2U6IHRoaXMuX3Jlc29sdmVDaGF0U2NvcGUob3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UpLCByZXNvdXJjZTogdGhpcy5fcmVzb2x2ZUNoYXRTdG9yYWdlU2NvcGUob3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2UpIH0pKTtcblx0XHRcdFx0aWYgKCFzaWRlQ2hhdFNvdXJjZSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIGNyZWF0ZUNoYXQgc2lkZSBjaGF0OiBzb3VyY2UgY2hhdCAke29wdGlvbnMuc2lkZUNoYXQuc291cmNlLnRvU3RyaW5nKCl9IG5vdCBmb3VuZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IHRoaXMuX2ZvcmtTZGtDaGF0KGNsaWVudCwgc2lkZUNoYXRTb3VyY2UsIG9wdGlvbnMuc2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgPz8gb3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsIHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5nZXRTZXNzaW9uRGF0YURpcihzdG9yYWdlU2NvcGUpKTtcblx0XHRcdFx0c2RrU2Vzc2lvbklkID0gZm9ya2VkLnNlc3Npb25JZDtcblx0XHRcdFx0c2lkZUNoYXQgPSB7XG5cdFx0XHRcdFx0c291cmNlOiBvcHRpb25zLnNpZGVDaGF0LnNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdHR1cm5JZDogb3B0aW9ucy5zaWRlQ2hhdC50dXJuSWQsXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uID8geyBzZWxlY3Rpb246IG9wdGlvbnMuc2lkZUNoYXQuc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgPyB7IHByb3ZpZGVyQW5jaG9yVHVybklkOiBvcHRpb25zLnNpZGVDaGF0LnByb3ZpZGVyQW5jaG9yVHVybklkIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGZvcmtlZC5pbmhlcml0ZWRUdXJuSWQgIT09IHVuZGVmaW5lZCA/IHsgaW5oZXJpdGVkVHVybklkOiBmb3JrZWQuaW5oZXJpdGVkVHVybklkIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQuc291cmNlQ29udGV4dCA/IHsgY29udGV4dDogb3B0aW9ucy5zaWRlQ2hhdC5zb3VyY2VDb250ZXh0IH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKG9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlID8geyBwYXJ0aWFsUmVzcG9uc2U6IG9wdGlvbnMuc2lkZUNoYXQucGFydGlhbFJlc3BvbnNlIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHRcdGxhdW5jaFBsYW4gPSB7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc3VtZScsXG5cdFx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRcdHNlc3Npb25JZDogc2RrU2Vzc2lvbklkLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzbmFwc2hvdCxcblx0XHRcdFx0XHRkaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzOiB0aGlzLl9kaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzKHNlc3Npb24sIHNka1Nlc3Npb25JZCwgc25hcHNob3QpLFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0XHRcdHNoZWxsTWFuYWdlcixcblx0XHRcdFx0XHRnaXRodWJUb2tlbjogdGhpcy5fZ2l0aHViVG9rZW4sXG5cdFx0XHRcdFx0ZmFsbGJhY2s6IHsgbW9kZWwsIGxvbmdDb250ZXh0V2luZG93OiB0aGlzLl9sb25nQ29udGV4dFdpbmRvd0Zvcihtb2RlbD8uaWQpLCBmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsPy5pZCkgfSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNka1Nlc3Npb25JZCA9IGNoYXRTZGtJZDtcblx0XHRcdFx0bGF1bmNoUGxhbiA9IHtcblx0XHRcdFx0XHRraW5kOiAnY3JlYXRlJyxcblx0XHRcdFx0XHRjbGllbnQsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBjaGF0U2RrSWQsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRyZXNvbHZlZEFnZW50TmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNuYXBzaG90LFxuXHRcdFx0XHRcdGRpc2FibGVkUm9vdE1jcFNlcnZlcnM6IHRoaXMuX2Rpc2FibGVkUm9vdE1jcFNlcnZlcnMoc2Vzc2lvbiwgY2hhdFNka0lkLCBzbmFwc2hvdCksXG5cdFx0XHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogYWN0aXZlQ2xpZW50LnRvb2xTZXQsXG5cdFx0XHRcdFx0c2hlbGxNYW5hZ2VyLFxuXHRcdFx0XHRcdGdpdGh1YlRva2VuOiB0aGlzLl9naXRodWJUb2tlbixcblx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRsb25nQ29udGV4dFdpbmRvdzogdGhpcy5fbG9uZ0NvbnRleHRXaW5kb3dGb3IobW9kZWw/LmlkKSxcblx0XHRcdFx0XHRmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsPy5pZCksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBpbmhlcml0ZWQgaGlzdG9yeSBub3cgbGl2ZXMgaW4gYSBzZXNzaW9uIHRoZSBhZ2VudCBoYXMgbm9cblx0XHRcdC8vIG1ldGFkYXRhIGZvciwgc28gcGVyc2lzdCB3aGF0IGEgbGF0ZXIgcmVzdW1lIG5lZWRzIGJlZm9yZSB0aGVcblx0XHRcdC8vIHJ1bnRpbWUgc3RhcnRzLlxuXHRcdFx0bGV0IHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpbmhlcml0c0Zyb21PdGhlclNlc3Npb24pIHtcblx0XHRcdFx0cHJvamVjdCA9IGF3YWl0IHByb2plY3RGcm9tQ29waWxvdENvbnRleHQoeyBjd2Q6IHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoIH0sIHRoaXMuX2dpdFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpbmhlcml0ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBzb3VyY2VNZXRhZGF0YT8ud29ya2luZ0RpcmVjdG9yaWVzXG5cdFx0XHRcdFx0Pz8gKHNvdXJjZUVudHJ5Py53b3JraW5nRGlyZWN0b3J5ID8gW3NvdXJjZUVudHJ5LndvcmtpbmdEaXJlY3RvcnldIDogW3dvcmtpbmdEaXJlY3RvcnldKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc3RvcmVTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbiwgbW9kZWwsIHdvcmtpbmdEaXJlY3RvcnksIGluaGVyaXRlZFdvcmtpbmdEaXJlY3Rvcmllcywgd29ya2luZ0RpcmVjdG9yeSwgcHJvamVjdCk7XG5cdFx0XHRcdGlmIChhZ2VudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc3RvcmVTZXNzaW9uQWdlbnRNZXRhZGF0YShzZXNzaW9uLCBhZ2VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuLCB3b3JraW5nRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQsIHsgc2Vzc2lvblVyaTogc2Vzc2lvbiwgY2hhdENoYW5uZWxVcmk6IGNoYXQsIHJlc291cmNlOiBzdG9yYWdlU2NvcGUgfSk7XG5cdFx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbi5pbml0aWFsaXplU2Vzc2lvbigpO1xuXHRcdFx0XHRpZiAoZm9yaz8udHVybklkTWFwcGluZykge1xuXHRcdFx0XHRcdGF3YWl0IGFnZW50U2Vzc2lvbi5yZW1hcFR1cm5JZHMoZm9yay50dXJuSWRNYXBwaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90aHJvd0lmQ2xpZW50UmVwbGFjZWQoY2xpZW50LCBhZ2VudFNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlckxpdmVDaGF0KGNoYXQsIGFnZW50U2Vzc2lvbiwgYWN0aXZlQ2xpZW50KTtcblx0XHRcdFx0Y29uc3QgYmFja2luZzogSVBlcnNpc3RlZENoYXQgPSB7IHNka1Nlc3Npb25JZCwgLi4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLCAuLi4oYWdlbnQgPyB7IGFnZW50IH0gOiB7fSksIC4uLihzaWRlQ2hhdCA/IHsgc2lkZUNoYXQgfSA6IHt9KSB9O1xuXHRcdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXRLZXksIGJhY2tpbmcpO1xuXHRcdFx0XHRyZXN1bHQgPSB7XG5cdFx0XHRcdFx0Li4uKGluaGVyaXRzRnJvbU90aGVyU2Vzc2lvbiA/IHsgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LCAuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4udGhpcy5fY2hhdEJhY2tpbmdSZXN1bHQoc2Vzc2lvbklkLCBiYWNraW5nKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gQ3JlYXRlZCBjaGF0IGJhY2tpbmcgJHtjaGF0S2V5fSBmb3IgY29udGV4dCAke3Nlc3Npb24udG9TdHJpbmcoKX0ke2ZvcmsgPyAnIChmb3JrZWQpJyA6ICcnfWApO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0YWdlbnRTZXNzaW9uPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaW5oZXJpdHNGcm9tT3RoZXJTZXNzaW9uKSB7XG5cdFx0XHRcdC8vIENvcHkgdGhlIHNvdXJjZSBzZXNzaW9uJ3MgcmV2aWV3ZWQgcmVmIHNvIHRoZSBmb3JrIHN0YXJ0cyB3aXRoXG5cdFx0XHRcdC8vIHRoZSBwYXJlbnQncyByZXZpZXcgcHJvZ3Jlc3MgKGJlc3QtZWZmb3J0OyBhIGZhaWx1cmUganVzdCBtZWFuc1xuXHRcdFx0XHQvLyB0aGUgZm9yayBzdGFydHMgdW5yZXZpZXdlZCkuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmV2aWV3U2VydmljZS5jb3B5UmV2aWV3ZWRSZWYoZm9ya1NvdXJjZVNjb3BlIS50b1N0cmluZygpLCBzZXNzaW9uLnRvU3RyaW5nKCksIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gY29weSByZXZpZXdlZCByZWYgZm9yIGZvcms6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NvcGlsb3RdIGNyZWF0ZUNoYXQ6IG5vIGJhY2tpbmcgd2FzIHJlY29yZGVkIGZvciAke2NoYXRLZXl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGlzdGluZ01pbnRlZENoYXRSZXN1bHQoc2Vzc2lvbjogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZywgYmFja2luZzogSVBlcnNpc3RlZENoYXQsIGluY2x1ZGVTZXNzaW9uTWV0YWRhdGE6IGJvb2xlYW4pOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jaGF0QmFja2luZ1Jlc3VsdChzZXNzaW9uSWQsIGJhY2tpbmcpO1xuXHRcdGlmICghaW5jbHVkZVNlc3Npb25NZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBhd2FpdCB0aGlzLl9yZWFkU3RvcmVkU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb24pO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4obWV0YWRhdGE/LndvcmtpbmdEaXJlY3RvcnkgPyB7IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogbWV0YWRhdGEud29ya2luZ0RpcmVjdG9yeSB9IDoge30pLFxuXHRcdFx0Li4uKG1ldGFkYXRhPy5wcm9qZWN0ID8geyBwcm9qZWN0OiBtZXRhZGF0YS5wcm9qZWN0IH0gOiB7fSksXG5cdFx0XHQuLi5yZXN1bHQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyB0aGUgbGl2ZSBzZXNzaW9uIGZvciBhbiBhZGRyZXNzZWQgY2hhdCBmcm9tIGV4YWN0IHJlY29yZGVkIGJhY2tpbmdzLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKGNvbnRleHQ6IElSZXNvbHZlZENvcGlsb3RDaGF0Q29udGV4dCwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KGNvbnRleHQuY29uZmlndXJhdGlvbklkKTtcblx0XHRpZiAocHJvdmlzaW9uYWwgJiYgcHJvdmlzaW9uYWwuc2RrU2Vzc2lvbklkID09PSBjb250ZXh0LnNka1Nlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21hdGVyaWFsaXplUHJvdmlzaW9uYWwoY29udGV4dC5jb25maWd1cmF0aW9uSWQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0LnNka1Nlc3Npb25JZCA9PT0gY29udGV4dC5jb25maWd1cmF0aW9uSWQpIHtcblx0XHRcdHJldHVybiBjb250ZXh0LnRhcmdldCA/PyB0aGlzLl9yZXN1bWVTZXNzaW9uKGNvbnRleHQuY29uZmlndXJhdGlvbklkLCBjb250ZXh0LmNoYXQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0LnNka1Nlc3Npb25JZCkge1xuXHRcdFx0Y29uc3QgbGlmZXRpbWUgPSB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb25MaWZldGltZShjb250ZXh0LnNka1Nlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBsZWFzZSA9IGF3YWl0IGxpZmV0aW1lPy5hY3F1aXJlKCk7XG5cdFx0XHRpZiAoIWxlYXNlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9maW5kQ2hhdEJ5VXJpKGNvbnRleHQuY2hhdCk7XG5cdFx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlT3JSZXN1bWVDaGF0U2Vzc2lvbihjb250ZXh0LCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bGVhc2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29udGV4dC50YXJnZXQ7XG5cdH1cblxuXHQvKipcblx0ICogRm9ya3Mge0BsaW5rIHNvdXJjZUVudHJ5fSdzIFNESyBjaGF0IGF0IHtAbGluayB0dXJuSWR9IHZpYSB0aGVcblx0ICogU0RLIGBzZXNzaW9ucy5mb3JrYCBSUEMgYW5kIGNvcGllcyBpdHMgZGF0YWJhc2UgaW50byB7QGxpbmsgdGFyZ2V0RGJEaXJ9XG5cdCAqIHNvIHRoZSBmb3JrZWQgY2hhdCBpbmhlcml0cyB0dXJuIGV2ZW50IElEcyBhbmQgZmlsZS1lZGl0XG5cdCAqIHNuYXBzaG90cy4gUmV0dXJucyB0aGUgbmV3IFNESyBzZXNzaW9uIGlkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZm9ya1Nka0NoYXQoY2xpZW50OiBDb3BpbG90Q2xpZW50LCBzb3VyY2VFbnRyeTogQ29waWxvdEFnZW50U2Vzc2lvbiwgdHVybklkOiBzdHJpbmcsIHRhcmdldERiRGlyOiBVUkkpOiBQcm9taXNlPHsgc2Vzc2lvbklkOiBzdHJpbmc7IGluaGVyaXRlZFR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRjb25zdCBzb3VyY2VUdXJucyA9IGF3YWl0IHNvdXJjZUVudHJ5LmdldE1lc3NhZ2VzKCk7XG5cdFx0Y29uc3Qgc291cmNlVHVybkluZGV4ID0gc291cmNlVHVybnMuZmluZEluZGV4KHR1cm4gPT4gdHVybi5pZCA9PT0gdHVybklkKTtcblx0XHRpZiAoc291cmNlVHVybkluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gZm9yazogdHVybiAke3R1cm5JZH0gbm90IGZvdW5kIGluIHNvdXJjZSBzZXNzaW9uICR7c291cmNlRW50cnkuc2Vzc2lvbklkfTsgaW5oZXJpdGluZyBhbGwgJHtzb3VyY2VUdXJucy5sZW5ndGh9IHR1cm5zYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluaGVyaXRlZFR1cm5JbmRleCA9IHNvdXJjZVR1cm5JbmRleCA9PT0gLTEgPyBzb3VyY2VUdXJucy5sZW5ndGggLSAxIDogc291cmNlVHVybkluZGV4O1xuXHRcdGNvbnN0IGluaGVyaXRlZFR1cm5JZCA9IHNvdXJjZVR1cm5zW2luaGVyaXRlZFR1cm5JbmRleF0/LmlkO1xuXHRcdC8vIHRvRXZlbnRJZCBpcyBleGNsdXNpdmUgXHUyMDE0IGV2ZW50cyBiZWZvcmUgaXQgYXJlIGluY2x1ZGVkLiBJZiB0aGVyZSdzIG5vXG5cdFx0Ly8gbmV4dCB0dXJuLCBvbWl0IGl0IHRvIGluY2x1ZGUgYWxsIGV2ZW50cy5cblx0XHRjb25zdCB0b0V2ZW50SWQgPSBhd2FpdCBzb3VyY2VFbnRyeS5nZXROZXh0VHVybkV2ZW50SWQodHVybklkKTtcblx0XHRjb25zdCBmb3JrUmVzdWx0ID0gYXdhaXQgY2xpZW50LnJwYy5zZXNzaW9ucy5mb3JrKHtcblx0XHRcdHNlc3Npb25JZDogc291cmNlRW50cnkuc2Vzc2lvbklkLFxuXHRcdFx0Li4uKHRvRXZlbnRJZCA/IHsgdG9FdmVudElkIH0gOiB7fSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbklkID0gZm9ya1Jlc3VsdC5zZXNzaW9uSWQ7XG5cblx0XHQvLyBWQUNVVU0gSU5UTyBpcyBzYWZlIGV2ZW4gd2hpbGUgdGhlIHNvdXJjZSBEQiBpcyBvcGVuLlxuXHRcdGNvbnN0IHRhcmdldERiUGF0aCA9IFVSSS5qb2luUGF0aCh0YXJnZXREYkRpciwgU0VTU0lPTl9EQl9GSUxFTkFNRSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNvdXJjZURiUmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzb3VyY2VFbnRyeS5zZXNzaW9uVXJpKTtcblx0XHRcdGlmIChzb3VyY2VEYlJlZikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGZzLm1rZGlyKHRhcmdldERiRGlyLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0Ly8gVkFDVVVNIElOVE8gZmFpbHMgaWYgdGhlIHRhcmdldCBhbHJlYWR5IGV4aXN0czsgY2xlYXIgYW55XG5cdFx0XHRcdFx0Ly8gc3RhbGUgREIgbGVmdCBieSBhIHByZXZpb3VzIChlLmcuIGNyYXNoZWQpIGF0dGVtcHQuXG5cdFx0XHRcdFx0YXdhaXQgZnMucm0odGFyZ2V0RGJQYXRoLmZzUGF0aCwgeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRhd2FpdCBzb3VyY2VEYlJlZi5vYmplY3QudmFjdXVtSW50byh0YXJnZXREYlBhdGguZnNQYXRoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRzb3VyY2VEYlJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIEZhaWxlZCB0byBjb3B5IHNlc3Npb24gZGF0YWJhc2UgZm9yIGNoYXQgZm9yazogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHNlc3Npb25JZDogbmV3U2Vzc2lvbklkLCBpbmhlcml0ZWRUdXJuSWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VDaGF0KGNoYXQ6IFVSSSwgb3BlcmF0aW9uQ29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbml0aWFsID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGNvbnN0IGxpZmV0aW1lSWQgPSBpbml0aWFsLnNka1Nlc3Npb25JZCA/PyBpbml0aWFsLmNvbmZpZ3VyYXRpb25JZDtcblx0XHRjb25zdCBsaWZldGltZSA9IHRoaXMuX2dldE9yQ3JlYXRlU2Vzc2lvbkxpZmV0aW1lKGxpZmV0aW1lSWQpO1xuXHRcdGlmICghbGlmZXRpbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2NvcGUgZmluYWxpemF0aW9uIGNhbiBkaXNwb3NlIHRoaXMgc2FtZSBsaWZldGltZTsgZGVmZXIgaXQgdW50aWwgYHJlbGVhc2UoKWAgc2V0dGxlcyB0byBhdm9pZCBzZWxmLWRlYWRsb2NrLlxuXHRcdGxldCBmaW5hbGl6ZTogeyBzY29wZTogVVJJOyBzY29wZUlkOiBzdHJpbmc7IHdvcmtzcGFjZWxlc3NIaW50OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgbGlmZXRpbWUucmVsZWFzZShhc3luYyAoKSA9PiB7XG5cdFx0XHRmaW5hbGl6ZSA9IGF3YWl0IHRoaXMuX2Rpc3Bvc2VDaGF0Q29vcmRpbmF0ZWQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0fSk7XG5cdFx0aWYgKGZpbmFsaXplKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maW5hbGl6ZUNvbmZpZ3VyYXRpb25TY29wZShmaW5hbGl6ZS5zY29wZSwgZmluYWxpemUuc2NvcGVJZCwgZmluYWxpemUud29ya3NwYWNlbGVzc0hpbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc3Bvc2VDaGF0Q29vcmRpbmF0ZWQoY2hhdDogVVJJLCBvcGVyYXRpb25Db250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8eyBzY29wZTogVVJJOyBzY29wZUlkOiBzdHJpbmc7IHdvcmtzcGFjZWxlc3NIaW50OiBib29sZWFuIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGluaXRpYWwgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbklkID0gaW5pdGlhbC5jb25maWd1cmF0aW9uSWQ7XG5cdFx0cmV0dXJuIHRoaXMuX3F1ZXVlQ2hhdChjb25maWd1cmF0aW9uSWQsIGluaXRpYWwuc2VxdWVuY2VyS2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gY3VycmVudC50YXJnZXQ7XG5cdFx0XHRjb25zdCBiYWNraW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdGNvbnN0IHByb3Zpc2lvbmFsID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoY29uZmlndXJhdGlvbklkKTtcblx0XHRcdGNvbnN0IGlzUHJvdmlzaW9uYWwgPSBwcm92aXNpb25hbD8uY2hhdC50b1N0cmluZygpID09PSBjaGF0S2V5O1xuXHRcdFx0Y29uc3Qgc2RrU2Vzc2lvbklkID0gdGFyZ2V0Py5zZXNzaW9uSWQgPz8gYmFja2luZz8uc2RrU2Vzc2lvbklkO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlbGVzc0hpbnQgPSBwcm92aXNpb25hbD8ud29ya3NwYWNlbGVzcyA9PT0gdHJ1ZTtcblxuXHRcdFx0aWYgKHNka1Nlc3Npb25JZCAmJiAhaXNQcm92aXNpb25hbCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9kZWxldGVTZGtTZXNzaW9uKHNka1Nlc3Npb25JZCwgY2hhdEtleSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1Byb3Zpc2lvbmFsKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZGVsZXRlKGNvbmZpZ3VyYXRpb25JZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jaGF0QmFja2luZ3MuZGVsZXRlKGNoYXRLZXkpO1xuXHRcdFx0dGhpcy5fY2hhdFNjb3Blcy5kZWxldGUoY2hhdEtleSk7XG5cdFx0XHR0aGlzLl9jaGF0U3RvcmFnZVNjb3Blcy5kZWxldGUoY2hhdEtleSk7XG5cblx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZGVzdHJveUxpdmVTZXNzaW9uKHRhcmdldCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoaXMgY2hhdCdzIG93biBPVGVsIHRyYWNlIGNvbnRleHQgaXMga2V5ZWQgYnkgaXRzIGhvc3QtY2hvc2VuXG5cdFx0XHQvLyBwZXJzaXN0ZW5jZSByZXNvdXJjZSBcdTIwMTQgYGNvbnRleHQucmVzb3VyY2VgLCB0aGUgY2hhdCdzIG93biBVUkkgZm9yXG5cdFx0XHQvLyBhIHBlZXIvc2lkZSBjaGF0LCBkaXN0aW5jdCBmcm9tIHRoZSBzaGFyZWQgY29uZmlndXJhdGlvbiBzY29wZSBcdTIwMTRcblx0XHRcdC8vIG5ldmVyIGJ5IHRoZSBzY29wZSwgc28gaXQgaXMgbmV2ZXIgcmVsZWFzZWQgYnkgc2NvcGUgZmluYWxpemF0aW9uXG5cdFx0XHQvLyBiZWxvdy4gUmVsZWFzZSBpdCBoZXJlIHNvIGEgZGVzdHJveWVkIGNoYXQncyB0cmFjZSBjb250ZXh0IG5ldmVyXG5cdFx0XHQvLyBvdXRsaXZlcyBpdDsgaGFybWxlc3Mgd2hlbiBgcmVzb3VyY2VgIGNvaW5jaWRlcyB3aXRoIHRoZSBzY29wZVxuXHRcdFx0Ly8gKHRoZSBkZWZhdWx0IGNoYXQpLCBzaW5jZSBmaW5hbGl6YXRpb24ncyBvd24gcmVsZWFzZSBvZiB0aGF0IHNhbWVcblx0XHRcdC8vIGtleSBpcyBpZGVtcG90ZW50LlxuXHRcdFx0dGhpcy5fb3RlbFNlcnZpY2UucmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoY3VycmVudC5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0Ly8gVGhlIGNoYXQgaXRzZWxmIGlzIGdvbmU6IGRyb3AgaXQgZnJvbSBldmVyeSBhY3RpdmUgY2xpZW50J3Ncblx0XHRcdC8vIG1lbWJlcnNoaXAgc28gYSBjbGllbnQgbGVmdCB3aXRoIG5vIHJlbWFpbmluZyBjaGF0cyBoYXMgaXRzXG5cdFx0XHQvLyB0b29sL2N1c3RvbWl6YXRpb24gY29udHJpYnV0aW9ucyBmdWxseSByZWxlYXNlZCByYXRoZXIgdGhhblxuXHRcdFx0Ly8gbGVha2luZyBwYXN0IHRoZSBjaGF0J3MgbGlmZXRpbWUuXG5cdFx0XHR0aGlzLl9hY3RpdmVDbGllbnRzLmdldChjdXJyZW50LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSk/LnJlbW92ZUNoYXQoY2hhdCk7XG5cblx0XHRcdC8vIFdoZW4gbm8gY2hhdCBzdGlsbCBzaGFyZXMgdGhpcyBjb25maWd1cmF0aW9uIHNjb3BlICh0cmFja2VkIHB1cmVseVxuXHRcdFx0Ly8gdmlhIHRoZSB7QGxpbmsgX2NoYXRTY29wZXN9IHJlZiBjb3VudCwgbmV2ZXIgaW5mZXJyZWQgZnJvbSBgY2hhdGAnc1xuXHRcdFx0Ly8gVVJJIHNoYXBlKSwgcmVwb3J0IGJhY2sgc28gdGhlIGNhbGxlciBmaW5hbGl6ZXMgdGhlIHNjb3BlJ3Ncblx0XHRcdC8vIHByb3ZpZGVyLW93bmVkIHJlc291cmNlcyBcdTIwMTQgdGhlIHNhbWUgY2xlYW51cCB0aGUgb2xkXG5cdFx0XHQvLyBwb3N0LWNoYXQgZmluYWxpemF0aW9uIGhvb2sgdXNlZCB0byBydW4uXG5cdFx0XHRpZiAodGhpcy5fcmVtYWluaW5nQ2hhdHNGb3JTY29wZShjdXJyZW50LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHsgc2NvcGU6IGN1cnJlbnQuY29uZmlndXJhdGlvblJlc291cmNlLCBzY29wZUlkOiBjb25maWd1cmF0aW9uSWQsIHdvcmtzcGFjZWxlc3NIaW50IH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlbGV0ZXMgYW4gU0RLIHNlc3Npb24sIHRvbGVyYXRpbmcgb25lIHRoYXQgd2FzIGFscmVhZHkgcmVtb3ZlZC4gVGhlIFNESydzXG5cdCAqIGBkZWxldGVTZXNzaW9uYCB0aHJvd3MgZm9yIGJvdGggYSBnZW51aW5lIGZhaWx1cmUgYW5kIGEgbWlzc2luZyBzZXNzaW9uLCBzb1xuXHQgKiBhIHJlYWwgZmFpbHVyZSBpcyBwcm9wYWdhdGVkIChwcmVzZXJ2aW5nIHJvdXRpbmcvc3RhdGUgZm9yIGEgcmV0cnkpIHdoaWxlIGFcblx0ICogY29uZmlybWVkLWdvbmUgc2Vzc2lvbiBpcyBzd2FsbG93ZWQgdG8ga2VlcCBhIHBhcnRpYWxseS1jb21wbGV0ZWQgbXVsdGktY2hhdFxuXHQgKiB0ZWFyZG93biByZXRyeS1zYWZlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZGVsZXRlU2RrU2Vzc2lvbihzZGtTZXNzaW9uSWQ6IHN0cmluZywgY2hhdEtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGNsaWVudC5kZWxldGVTZXNzaW9uKHNka1Nlc3Npb25JZCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBPbmx5IGEgc2Vzc2lvbiB0aGUgU0RLIGNvbmZpcm1zIGlzIGdvbmUgaXMgc2FmZSB0byBzd2FsbG93OyBpZiB3ZSBjYW4ndCBjb25maXJtLCBwcm9wYWdhdGUuXG5cdFx0XHRpZiAoYXdhaXQgY2xpZW50LmdldFNlc3Npb25NZXRhZGF0YShzZGtTZXNzaW9uSWQpLnRoZW4obWV0YWRhdGEgPT4gISFtZXRhZGF0YSwgKCkgPT4gdHJ1ZSkpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdF0gU0RLIHNlc3Npb24gJHtzZGtTZXNzaW9uSWR9IGFscmVhZHkgZGVsZXRlZDsgY2hhdCAke2NoYXRLZXl9IGRpc3Bvc2FsIGlzIGlkZW1wb3RlbnRgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWxlYXNlQ2hhdChjaGF0OiBVUkksIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRjb25zdCBsaWZldGltZSA9IHRoaXMuX2dldE9yQ3JlYXRlU2Vzc2lvbkxpZmV0aW1lKGluaXRpYWwuc2RrU2Vzc2lvbklkID8/IGluaXRpYWwuY29uZmlndXJhdGlvbklkKTtcblx0XHRpZiAoIWxpZmV0aW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IGxpZmV0aW1lLnJlbGVhc2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpLnRhcmdldDtcblx0XHRcdGlmICghdGFyZ2V0IHx8IHRhcmdldC5oYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX2Rlc3Ryb3lMaXZlU2Vzc2lvbih0YXJnZXQsIHRydWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWF0dGFjaGVzIGEgY29uY3JldGUgY2hhdCBiYWNraW5nIG9uIHNlc3Npb25cblx0ICogcmVzdG9yZSwgZGVjb2RpbmcgdGhlIG9wYXF1ZSBgcHJvdmlkZXJEYXRhYCB0aGUgb3JjaGVzdHJhdG9yIHBlcnNpc3RlZFxuXHQgKiBhdCBjcmVhdGlvbiAob3IgdGhlIGxhdGVzdCB7QGxpbmsgb25EaWRDaGFuZ2VDaGF0RGF0YX0pLiBBZnRlciB0aGlzXG5cdCAqIHJlc29sdmVzIHRoZSBjaGF0J3MgYmFja2luZyBTREsgc2Vzc2lvbiBjYW4gYmUgcmVzdW1lZCBsYXppbHkgb24gaXRzIGZpcnN0XG5cdCAqIHNlbmQuIEJlc3QtZWZmb3J0IFx1MjAxNCBhIGNvcnJ1cHQvdW5rbm93biBibG9iIGlzIGxvZ2dlZCBhbmQgZHJvcHBlZCByYXRoZXJcblx0ICogdGhhbiB0aHJvd24uXG5cdCAqL1xuXHRhc3luYyBtYXRlcmlhbGl6ZUNoYXQoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCwgcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQgfCB2b2lkPiB7XG5cdFx0dGhpcy5fbm90ZUhvc3RDdXN0b21pemF0aW9ucyhjb250ZXh0KTtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdHRoaXMuX3JlbWVtYmVyQ2hhdFNjb3BlKGNoYXQsIHJlc29sdmVkLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb2x2ZWQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0aWYgKHByb3ZpZGVyRGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIWlzRGVmYXVsdENoYXRVcmkoY2hhdCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmFja2luZyA9IHsgc2RrU2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQocmVzb2x2ZWQuY29uZmlndXJhdGlvblJlc291cmNlKSB9O1xuXHRcdFx0dGhpcy5fY2hhdEJhY2tpbmdzLnNldChjaGF0S2V5LCBiYWNraW5nKTtcblx0XHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKGJhY2tpbmcpIH07XG5cdFx0fVxuXHRcdGNvbnN0IGJhY2tpbmcgPSBkZWNvZGVQcm92aWRlckRhdGEocHJvdmlkZXJEYXRhKTtcblx0XHRpZiAoIWJhY2tpbmcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3RdIG1hdGVyaWFsaXplQ2hhdDogZHJvcHBpbmcgY29ycnVwdCBwcm92aWRlckRhdGEgZm9yICR7Y2hhdEtleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY2hhdEJhY2tpbmdzLnNldChjaGF0S2V5LCBiYWNraW5nKTtcblx0fVxuXG5cdGFzeW5jIHJlY292ZXJMZWdhY3lDaGF0KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPElBZ2VudENyZWF0ZUNoYXRSZXN1bHQ+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdHRoaXMuX3JlbWVtYmVyQ2hhdFNjb3BlKGNoYXQsIHJlc29sdmVkLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb2x2ZWQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB7IHNka1Nlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHJlc29sdmVkLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgfTtcblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgYmFja2luZyk7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXJEYXRhOiBlbmNvZGVQcm92aWRlckRhdGEoYmFja2luZykgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNaWdyYXRpb24tb25seSBlbnVtZXJhdGlvbiBvZiB0aGUgc2Vzc2lvbidzIGxlZ2FjeSBjaGF0IGJhY2tpbmdzIGZyb21cblx0ICogYGNvcGlsb3QuY2hhdHNgLCBtYXBwaW5nIGVhY2ggZW50cnkgdG8gaXRzIGNoYW5uZWwgVVJJIGFuZCB0aGUgc2FtZSBvcGFxdWVcblx0ICogYHByb3ZpZGVyRGF0YWAgYmxvYiB7QGxpbmsgbWF0ZXJpYWxpemVDaGF0fSBkZWNvZGVzLiBUaGUgb3JjaGVzdHJhdG9yXG5cdCAqIGNhbGxzIHRoaXMgb25jZSB0byBkcmFpbiB0aGUgbGVnYWN5IGNvZGVjIGludG8gaXRzIG93biBjYXRhbG9nLlxuXHQgKi9cblx0YXN5bmMgbGlzdExlZ2FjeUNoYXRCYWNraW5ncyhjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50TGVnYWN5Q2hhdFtdPiB7XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgdGhpcy5fcmVhZExlZ2FjeUNoYXRCYWNraW5ncyhjb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc3VsdDogSUFnZW50TGVnYWN5Q2hhdFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbY2hhdElkLCBpbmZvXSBvZiBwZXJzaXN0ZWQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiBVUkkucGFyc2UoYnVpbGRDaGF0VXJpKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdElkKSksIHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKGluZm8pIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVTZXNzaW9uTGlmZXRpbWUoc2Vzc2lvbklkOiBzdHJpbmcpOiBDb3BpbG90U2Vzc2lvbkxpZmV0aW1lIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5faXNTaHV0dGluZ0Rvd24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBsaWZldGltZSA9IHRoaXMuX3Nlc3Npb25MaWZldGltZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFsaWZldGltZSkge1xuXHRcdFx0bGlmZXRpbWUgPSBuZXcgQ29waWxvdFNlc3Npb25MaWZldGltZSgpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkxpZmV0aW1lcy5zZXQoc2Vzc2lvbklkLCBsaWZldGltZSk7XG5cdFx0fVxuXHRcdHJldHVybiBsaWZldGltZTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0U2Vzc2lvbkxpZmV0aW1lKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1NodXR0aW5nRG93biAmJiB0aGlzLl9zZXNzaW9uTGlmZXRpbWVzLmdldChzZXNzaW9uSWQpPy5pc1Blcm1hbmVudGx5Q2xvc2VkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlmZXRpbWVzLnNldChzZXNzaW9uSWQsIG5ldyBDb3BpbG90U2Vzc2lvbkxpZmV0aW1lKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3F1ZXVlU2Vzc2lvbjxUPihzZXNzaW9uSWQ6IHN0cmluZywgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGxpZmV0aW1lID0gdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uTGlmZXRpbWUoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gbGlmZXRpbWUgPyBsaWZldGltZS5xdWV1ZVNlc3Npb24odGFzaykgOiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9xdWV1ZUNoYXQ8VD4oc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRLZXk6IHN0cmluZywgdGFzazogKCkgPT4gUHJvbWlzZTxUPik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGxpZmV0aW1lID0gdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uTGlmZXRpbWUoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gbGlmZXRpbWUgPyBsaWZldGltZS5xdWV1ZUNoYXQoY2hhdEtleSwgdGFzaykgOiBQcm9taXNlLnJlamVjdChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgbGl2ZSBzZXNzaW9uIGZvciBhbiBleGFjdCBjaGF0LCByZXN1bWluZyBpdCBpZiBuZWNlc3NhcnkuICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVPclJlc3VtZUNoYXRTZXNzaW9uKGNvbnRleHQ6IElSZXNvbHZlZENvcGlsb3RDaGF0Q29udGV4dCwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY29uZmlndXJhdGlvbklkLCBjaGF0LCBjaGF0S2V5IH0gPSBjb250ZXh0O1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgbGlmZXRpbWUgPSB0aGlzLl9nZXRPckNyZWF0ZVNlc3Npb25MaWZldGltZShjb250ZXh0LnNka1Nlc3Npb25JZCA/PyBjb25maWd1cmF0aW9uSWQpO1xuXHRcdGlmICghbGlmZXRpbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBsaWZldGltZS5yZXN1bWVQZWVyKGNoYXRLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGxlYXNlID0gYXdhaXQgbGlmZXRpbWUuYWNxdWlyZSgpO1xuXHRcdFx0aWYgKCFsZWFzZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFnYWluID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0KTtcblx0XHRcdFx0aWYgKGFnYWluKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFnYWluO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpO1xuXHRcdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBhcmVudEVudHJ5ID0gdGhpcy5fZmluZFNlc3Npb25CeVNka0lkKGNvbmZpZ3VyYXRpb25JZCk7XG5cdFx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3JpZXM/LlswXSA/PyBwYXJlbnRFbnRyeT8ud29ya2luZ0RpcmVjdG9yeVxuXHRcdFx0XHRcdD8/IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KGNvbmZpZ3VyYXRpb25JZCk/LndvcmtpbmdEaXJlY3Rvcnlcblx0XHRcdFx0XHQ/PyAoYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShjb25maWd1cmF0aW9uUmVzb3VyY2UpKS53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBDYW5ub3QgcmVzdW1lIGNoYXQgJHtjaGF0S2V5fTogbWlzc2luZyB3b3JraW5nIGRpcmVjdG9yeWApO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2dldE9yQ3JlYXRlQWN0aXZlQ2xpZW50KGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgYWN0aXZlQ2xpZW50LnNuYXBzaG90KGNoYXRLZXkpO1xuXHRcdFx0XHRjb25zdCBzaGVsbE1hbmFnZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaGVsbE1hbmFnZXIsIGNoYXQsIHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHRjb25zdCBsYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW4gPSB7XG5cdFx0XHRcdFx0a2luZDogJ3Jlc3VtZScsXG5cdFx0XHRcdFx0Y2xpZW50LFxuXHRcdFx0XHRcdHNlc3Npb25JZDogaW5mby5zZGtTZXNzaW9uSWQsXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3Rvcmllcz8uc2xpY2UoMSksXG5cdFx0XHRcdFx0cmVzb2x2ZWRBZ2VudE5hbWU6IGluZm8uYWdlbnQgPyB0aGlzLl9yZXNvbHZlQWdlbnROYW1lKHNuYXBzaG90LCBpbmZvLmFnZW50KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzbmFwc2hvdCxcblx0XHRcdFx0XHRkaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzOiB0aGlzLl9kaXNhYmxlZFJvb3RNY3BTZXJ2ZXJzKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgaW5mby5zZGtTZXNzaW9uSWQsIHNuYXBzaG90KSxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnRUb29sU2V0OiBhY3RpdmVDbGllbnQudG9vbFNldCxcblx0XHRcdFx0XHRzaGVsbE1hbmFnZXIsXG5cdFx0XHRcdFx0Z2l0aHViVG9rZW46IHRoaXMuX2dpdGh1YlRva2VuLFxuXHRcdFx0XHRcdGZhbGxiYWNrOiB7IG1vZGVsOiBpbmZvLm1vZGVsLCBsb25nQ29udGV4dFdpbmRvdzogdGhpcy5fbG9uZ0NvbnRleHRXaW5kb3dGb3IoaW5mby5tb2RlbD8uaWQpLCBmcmVlTG9uZ0NvbnRleHQ6IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KGluZm8ubW9kZWw/LmlkKSB9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhZ2VudFNlc3Npb24gPSB0aGlzLl9jcmVhdGVBZ2VudFNlc3Npb24obGF1bmNoUGxhbiwgd29ya2luZ0RpcmVjdG9yeSwgYWN0aXZlQ2xpZW50LCB7IHNlc3Npb25Vcmk6IGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdENoYW5uZWxVcmk6IGNoYXQsIHJlc291cmNlOiBjb250ZXh0LnJlc291cmNlIH0pO1xuXHRcdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5fdGhyb3dJZkNsaWVudFJlcGxhY2VkKGNsaWVudCwgYWdlbnRTZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXJMaXZlQ2hhdChjaGF0LCBhZ2VudFNlc3Npb24sIGFjdGl2ZUNsaWVudCk7XG5cdFx0XHRcdGlmICh3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShjb250ZXh0LnJlc291cmNlLCBpbmZvLm1vZGVsLCB3b3JraW5nRGlyZWN0b3J5LCB3b3JraW5nRGlyZWN0b3JpZXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBSZXN1bWVkIGNoYXQgYmFja2luZyAke2NoYXRLZXl9IGZvciBjb25maWd1cmF0aW9uICR7Y29uZmlndXJhdGlvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdHJldHVybiBhZ2VudFNlc3Npb247XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRhZ2VudFNlc3Npb24/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gRmFpbGVkIHRvIHJlc3VtZSBjaGF0IGJhY2tpbmcgJHtjaGF0S2V5fTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0bGVhc2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgdHJ1bmNhdGVDaGF0KGNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5fcmVzb2x2ZVRydW5jYXRlQ2hhdENvbnRleHQoY2hhdCwgY29udGV4dCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gcmVzb2x2ZWQuY29uZmlndXJhdGlvbklkO1xuXHRcdGlmICh0aGlzLl9wcm92aXNpb25hbFNlc3Npb25zLmdldChzZXNzaW9uSWQpPy5jaGF0LnRvU3RyaW5nKCkgPT09IGNoYXQudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9xdWV1ZUNoYXQocmVzb2x2ZWQuY29uZmlndXJhdGlvbklkLCByZXNvbHZlZC5zZXF1ZW5jZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZXNvbHZlVHJ1bmNhdGVDaGF0Q29udGV4dChjaGF0LCBjb250ZXh0KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUcnVuY2F0aW5nIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9JHt0dXJuSWQgIT09IHVuZGVmaW5lZCA/IGAgYXQgdHVybklkPSR7dHVybklkfWAgOiAnIChhbGwgdHVybnMpJ31gKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKGN1cnJlbnQpO1xuXHRcdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gTm8gY2hhdCBlbnRyeSByZXNvbHZlZCBmb3IgdHJ1bmNhdGlvbjsgbm90aGluZyB0byB0cnVuY2F0ZWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIExvb2sgdXAgdGhlIFNESyBldmVudCBJRCBmb3IgdGhlIHRydW5jYXRpb24gYm91bmRhcnkuXG5cdFx0XHQvLyBUaGUgcHJvdG9jb2wgc2VtYW50aWNzOiB0dXJuSWQgaXMgdGhlIGxhc3QgdHVybiB0byBLRUVQLlxuXHRcdFx0Ly8gVGhlIFNESyBzZW1hbnRpY3M6IGV2ZW50SWQgYW5kIGFsbCBldmVudHMgYWZ0ZXIgaXQgYXJlIHJlbW92ZWQuXG5cdFx0XHQvLyBTbyB3ZSBuZWVkIHRoZSBldmVudCBJRCBvZiB0aGUgKm5leHQqIHR1cm4gYWZ0ZXIgdHVybklkLlxuXHRcdFx0Ly8gRm9yIFwicmVtb3ZlIGFsbFwiLCB3ZSBuZWVkIHRoZSBmaXJzdCB0dXJuJ3MgZXZlbnQgSUQuXG5cdFx0XHRsZXQgZXZlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0XHRldmVudElkID0gYXdhaXQgZW50cnkuZ2V0TmV4dFR1cm5FdmVudElkKHR1cm5JZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRldmVudElkID0gYXdhaXQgZW50cnkuZ2V0Rmlyc3RUdXJuRXZlbnRJZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZXZlbnRJZCkge1xuXHRcdFx0XHRhd2FpdCBlbnRyeS50cnVuY2F0ZUF0RXZlbnRJZChldmVudElkLCB0dXJuSWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIE5vIGV2ZW50IElEIGZvdW5kIGZvciB0cnVuY2F0aW9uLCBub3RoaW5nIHRvIHRydW5jYXRlYCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTZXNzaW9uIHRydW5jYXRlZGApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hhbmdlTW9kZWwoY2hhdDogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24sIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoYW5nZU1vZGVsT25jZShjaGF0LCBtb2RlbCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5fcmVjb3ZlckZyb21DbG9zZWRDb25uZWN0aW9uKGVycm9yLCAnY2hhbmdlTW9kZWwnLCB0aGlzLl9jbGllbnRGYWlsdXJlQ29ycmVsYXRpb24oY2hhdCwgdW5kZWZpbmVkLCBvcGVyYXRpb25Db250ZXh0KSkpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGFuZ2VNb2RlbE9uY2UoY2hhdCwgbW9kZWwsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZU1vZGVsT25jZShjaGF0OiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiwgb3BlcmF0aW9uQ29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGF3YWl0IHRoaXMuX3F1ZXVlQ2hhdChjb250ZXh0LmNvbmZpZ3VyYXRpb25JZCwgY29udGV4dC5zZXF1ZW5jZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRjb25zdCBsb25nQ29udGV4dFdpbmRvdyA9IHRoaXMuX2xvbmdDb250ZXh0V2luZG93Rm9yKG1vZGVsLmlkKTtcblx0XHRcdGNvbnN0IGZyZWVMb25nQ29udGV4dCA9IHRoaXMuX2lzRnJlZUxvbmdDb250ZXh0KG1vZGVsLmlkKTtcblx0XHRcdC8vIEEgYGZhbWlseWAgYWxpYXMgcm91dGVzIHRoZSBob3N0J3MgcHJvbXB0IGFuZCB0b29sIHByb2ZpbGUgb25seS4gVGhlXG5cdFx0XHQvLyBzZWxlY3RlZCBtb2RlbCdzIHJlYXNvbmluZy1lZmZvcnQgb3ZlcnJpZGUgaXMgcmVzb2x2ZWQgc2VwYXJhdGVseS5cblx0XHRcdGNvbnN0IHByb3Zpc2lvbmFsID0gdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5nZXQoY3VycmVudC5jb25maWd1cmF0aW9uSWQpO1xuXHRcdFx0aWYgKHByb3Zpc2lvbmFsKSB7XG5cdFx0XHRcdHByb3Zpc2lvbmFsLm1vZGVsID0gbW9kZWw7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGN1cnJlbnQudGFyZ2V0ID8/IGF3YWl0IHRoaXMuX2Vuc3VyZVJlc29sdmVkQ2hhdFNlc3Npb24oY3VycmVudCk7XG5cdFx0XHRcdGF3YWl0IGVudHJ5Py5zZXRNb2RlbChtb2RlbC5pZCwgcmVzb2x2ZUNvcGlsb3RSZWFzb25pbmdFZmZvcnQobW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCBjdXJyZW50LmNvbmZpZ3VyYXRpb25JZCksIGdldENvcGlsb3RDb250ZXh0VGllcihtb2RlbCwgbG9uZ0NvbnRleHRXaW5kb3csIGZyZWVMb25nQ29udGV4dCkpO1xuXHRcdFx0XHQvLyBLZWVwIHRoZSBzZXNzaW9uLXNjb3BlIG1ldGFkYXRhIGluIHN0ZXAgZm9yIHJlc3VtZXMgdGhhdCBmYWxsIGJhY2tcblx0XHRcdFx0Ly8gdG8gaXQ7IGNoYXQgbGVhdmVzIHBlcnNpc3QgdGhyb3VnaCB0aGVpciBiYWNraW5nIGluc3RlYWQuXG5cdFx0XHRcdGlmIChjdXJyZW50LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGN1cnJlbnQuY29uZmlndXJhdGlvblJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShjdXJyZW50LnJlc291cmNlLCBtb2RlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYmFja2luZyA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY3VycmVudC5jaGF0S2V5KTtcblx0XHRcdGlmIChiYWNraW5nKSB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZWQ6IElQZXJzaXN0ZWRDaGF0ID0geyAuLi5iYWNraW5nLCBtb2RlbCB9O1xuXHRcdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGN1cnJlbnQuY2hhdEtleSwgdXBkYXRlZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hhdERhdGEuZmlyZSh7IGNoYXQsIHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKHVwZGF0ZWQpIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hhbmdlQWdlbnQoY2hhdDogVVJJLCBhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQsIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoYW5nZUFnZW50T25jZShjaGF0LCBhZ2VudCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICghYXdhaXQgdGhpcy5fcmVjb3ZlckZyb21DbG9zZWRDb25uZWN0aW9uKGVycm9yLCAnY2hhbmdlQWdlbnQnLCB0aGlzLl9jbGllbnRGYWlsdXJlQ29ycmVsYXRpb24oY2hhdCwgdW5kZWZpbmVkLCBvcGVyYXRpb25Db250ZXh0KSkpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGFuZ2VBZ2VudE9uY2UoY2hhdCwgYWdlbnQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoYW5nZUFnZW50T25jZShjaGF0OiBVUkksIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgb3BlcmF0aW9uQ29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGF3YWl0IHRoaXMuX3F1ZXVlQ2hhdChjb250ZXh0LmNvbmZpZ3VyYXRpb25JZCwgY29udGV4dC5zZXF1ZW5jZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRjb25zdCBwcm92aXNpb25hbCA9IHRoaXMuX3Byb3Zpc2lvbmFsU2Vzc2lvbnMuZ2V0KGN1cnJlbnQuY29uZmlndXJhdGlvbklkKTtcblx0XHRcdGlmIChwcm92aXNpb25hbCkge1xuXHRcdFx0XHRwcm92aXNpb25hbC5hZ2VudCA9IGFnZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBjdXJyZW50LnRhcmdldCA/PyBhd2FpdCB0aGlzLl9lbnN1cmVSZXNvbHZlZENoYXRTZXNzaW9uKGN1cnJlbnQpO1xuXHRcdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZEFnZW50TmFtZSA9IGFnZW50ID8gdGhpcy5fcmVzb2x2ZUFnZW50TmFtZShlbnRyeS5hcHBsaWVkU25hcHNob3QsIGFnZW50KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRhd2FpdCBlbnRyeS5zZXRBZ2VudChyZXNvbHZlZEFnZW50TmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGN1cnJlbnQuY2hhdEtleSk7XG5cdFx0XHRpZiAoYmFja2luZykge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVkOiBJUGVyc2lzdGVkQ2hhdCA9IHsgLi4uYmFja2luZywgLi4uKGFnZW50ID8geyBhZ2VudCB9IDogeyBhZ2VudDogdW5kZWZpbmVkIH0pIH07XG5cdFx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY3VycmVudC5jaGF0S2V5LCB1cGRhdGVkKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDaGF0RGF0YS5maXJlKHsgY2hhdCwgcHJvdmlkZXJEYXRhOiBlbmNvZGVQcm92aWRlckRhdGEodXBkYXRlZCkgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3NodXRkb3duUHJvbWlzZSkge1xuXHRcdFx0dGhpcy5faXNTaHV0dGluZ0Rvd24gPSB0cnVlO1xuXHRcdFx0Zm9yIChjb25zdCBsaWZldGltZSBvZiB0aGlzLl9zZXNzaW9uTGlmZXRpbWVzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHZvaWQgbGlmZXRpbWUuY2xvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NodXRkb3duUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdC8vIEludmFsaWRhdGUgYW55IHJlcXVlc3QgdGhhdCBzdGFydGVkIGJlZm9yZSB0ZWFyZG93bi4gVG9rZW5cblx0XHRcdFx0Ly8gaWRlbnRpdHkgYWxvbmUgZG9lcyBub3QgY2hhbmdlIGR1cmluZyBzaHV0ZG93biwgc28gd2l0aG91dCB0aGlzXG5cdFx0XHRcdC8vIGd1YXJkIGEgbGF0ZSBzdWNjZXNzIGNvdWxkIHJlcHVibGlzaCBhZnRlciB0aGUgaG9zdCBzdG9wcGVkLlxuXHRcdFx0XHR0aGlzLl9tb2RlbENhdGFsb2dHZW5lcmF0aW9uKys7XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaFNjaGVkdWxlLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlZE1vZGVsUmVmcmVzaD8uZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVkTW9kZWxSZWZyZXNoID0gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgbW9kZWwtcmVmcmVzaCByZXRyeSBzbyBpdHMgdGltZXIgY2Fubm90IGZpcmVcblx0XHRcdFx0Ly8gYWZ0ZXIgdGVhcmRvd24gYW5kIHJlc3VycmVjdCB0aGUgY2xpZW50LlxuXHRcdFx0XHR0aGlzLl9tb2RlbFJlZnJlc2hSZXRyeS5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDb3BpbG90XSBTaHV0dGluZyBkb3duLi4uJyk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFsuLi50aGlzLl9zZXNzaW9uTGlmZXRpbWVzLnZhbHVlcygpXS5tYXAobGlmZXRpbWUgPT4gbGlmZXRpbWUuY2xvc2UoKSkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kZXN0cm95TGl2ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5fc3RvcENsaWVudCgpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uTGlmZXRpbWVzLmNsZWFyKCk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2h1dGRvd25Qcm9taXNlO1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIHRoaXMuX2FsbExpdmVTZXNzaW9ucygpKSB7XG5cdFx0XHRpZiAoY2hhdC5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQsIGFwcHJvdmVkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdGlmIChjaGF0LnJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3QocmVxdWVzdElkLCByZXNwb25zZSwgYW5zd2VycykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgaWYgdGhpcyBwcm92aWRlciBvd25zIHRoZSBnaXZlbiBzZXNzaW9uIElELiBJbmNsdWRlc1xuXHQgKiBwcm92aXNpb25hbCBzZXNzaW9ucyB0aGF0IGhhdmUgbm90IHlldCBiZWVuIG1hdGVyaWFsaXplZC5cblx0ICovXG5cdGhhc1Nlc3Npb24oc2Vzc2lvbjogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdHJldHVybiB0aGlzLl9jaGF0RW50cmllc0J5U2RrSWQuaGFzKHNlc3Npb25JZCkgfHwgdGhpcy5fcHJvdmlzaW9uYWxTZXNzaW9ucy5oYXMoc2Vzc2lvbklkKTtcblx0fVxuXG5cdC8vIC0tLS0gaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maWd1cmVQcm94eUVudihlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm94eSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVQcm94eUZvclNkayhlbnYpO1xuXHRcdHRoaXMuX2FwcGxpZWRQcm94eSA9IHByb3h5O1xuXHRcdGlmIChwcm94eSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgQ09QSUxPVF9QUk9YWV9TRVRfRU5WX0tFWVMpIHtcblx0XHRcdFx0ZW52W2tleV0gPSBwcm94eTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NvcGlsb3RdIFJlc29sdmVkIENBUEkgcHJveHkgYW5kIGZvcndhcmRlZCBIVFRQX1BST1hZL0hUVFBTX1BST1hZIHRvIENvcGlsb3QgU0RLJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVByb3h5Rm9yU2RrKGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPiA9IHByb2Nlc3MuZW52KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX2lzU3lzdGVtUHJveHlFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChDT1BJTE9UX1BST1hZX0VOVl9LRVlTLnNvbWUoa2V5ID0+IGVudltrZXldKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NvcGlsb3RdIFByb3h5IGVudiB2YXIgYWxyZWFkeSBzZXQ7IGxlYXZpbmcgQ29waWxvdCBTREsgcHJveHkgY29uZmlndXJhdGlvbiB0byB0aGUgZW52aXJvbm1lbnQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGNhcGlVcmwgPSBlbnZbJ1ZTQ09ERV9BR0VOVF9IT1NUX0NBUElfVVJMX09WRVJSSURFJ10gfHwgQ09QSUxPVF9DQVBJX1VSTDtcblx0XHRpZiAodGhpcy5fZ2l0aHViVG9rZW4pIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlQXBpRW5kcG9pbnQodGhpcy5fZ2l0aHViVG9rZW4pO1xuXHRcdFx0XHRpZiAoZGlzY292ZXJlZCkge1xuXHRcdFx0XHRcdGNhcGlVcmwgPSBkaXNjb3ZlcmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQ29waWxvdF0gQ0FQSSBlbmRwb2ludCBkaXNjb3ZlcnkgZm9yIHByb3h5IHJlc29sdXRpb24gZmFpbGVkOyB1c2luZyAke2NhcGlVcmx9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb3h5UmVzb2x2ZXIucmVzb2x2ZVByb3h5KGNhcGlVcmwpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gcmVzb2x2ZSBDQVBJIHByb3h5IGZvciAke2NhcGlVcmx9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RhcnRzIHRoZSBjbGllbnQgd2hlbiB0b2tlbi1iYXNlZCBDQVBJIGVuZHBvaW50IGRpc2NvdmVyeSBjaGFuZ2VzIGl0c1xuXHQgKiBzdWJwcm9jZXNzIHByb3h5LiBTZXNzaW9uIGNyZWRlbnRpYWwgdXBkYXRlcyBvdGhlcndpc2Uga2VlcCB0aGUgcHJvY2VzcyBhbGl2ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RhcnRDbGllbnRJZlByb3h5Q2hhbmdlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NsaWVudCAmJiAhdGhpcy5fY2xpZW50U3RhcnRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb2xkUHJveHkgPSB0aGlzLl9hcHBsaWVkUHJveHk7XG5cdFx0Y29uc3QgbmV3UHJveHkgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUHJveHlGb3JTZGsoKTtcblx0XHRpZiAobmV3UHJveHkgPT09IG9sZFByb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jbGllbnRTdGFydGluZykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2xpZW50U3RhcnRpbmc7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2NsaWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90XSBDQVBJIHByb3h5IGNoYW5nZWQgYWZ0ZXIgdG9rZW4gdXBkYXRlICgke29sZFByb3h5ID8/ICcobm9uZSknfSAtPiAke25ld1Byb3h5ID8/ICcobm9uZSknfSk7IHJlc3RhcnRpbmcgQ29waWxvdENsaWVudGApO1xuXHRcdGF3YWl0IHRoaXMuX3JlcXVlc3RDbGllbnRSZXN0YXJ0KCdDQVBJIHByb3h5IGNoYW5nZWQgYWZ0ZXIgR2l0SHViIHRva2VuIHVwZGF0ZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvbjogVVJJLCBkaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IEFjdGl2ZUNsaWVudCB7XG5cdFx0bGV0IGNsaWVudCA9IHRoaXMuX2FjdGl2ZUNsaWVudHMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghY2xpZW50KSB7XG5cdFx0XHQvLyBSZWFkIHRoZSByZXRhaW5lZCBob3N0IHNuYXBzaG90IGxhemlseSBzbyBwcm9qZWN0ZWQgZW5hYmxlbWVudCBzdGF5cyBjdXJyZW50LlxuXHRcdFx0Y29uc3QgcGx1Z2luQ29udHJvbGxlciA9IHRoaXMuX3BsdWdpbnMuY3JlYXRlU2Vzc2lvbkNvbnRyb2xsZXIoc2Vzc2lvbiwgZGlyZWN0b3J5LCAoKSA9PiB0aGlzLl9yZXRhaW5lZEhvc3RDdXN0b21pemF0aW9ucyhzZXNzaW9uKSk7XG5cdFx0XHRjbGllbnQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3RpdmVDbGllbnQsIHNlc3Npb24sIHBsdWdpbkNvbnRyb2xsZXIsIHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzKTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuc2V0KHNlc3Npb24sIGNsaWVudCk7XG5cdFx0fSBlbHNlIGlmIChkaXJlY3RvcnkpIHtcblx0XHRcdGNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldERpcmVjdG9yeShkaXJlY3RvcnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2xpZW50O1xuXHR9XG5cblx0LyoqIEluc3RhbnRpYXRlcyBhIHNlc3Npb247IHRoZSBjYWxsZXIgbXVzdCBpbml0aWFsaXplIGFuZCByZWdpc3RlciBpdCBvbiBzdWNjZXNzLiAqL1xuXHRwcml2YXRlIF9jcmVhdGVBZ2VudFNlc3Npb24obGF1bmNoUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGFjdGl2ZUNsaWVudDogQWN0aXZlQ2xpZW50LCBpZGVudGl0eT86IElDb3BpbG90QWdlbnRTZXNzaW9uSWRlbnRpdHkpOiBDb3BpbG90QWdlbnRTZXNzaW9uIHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gaWRlbnRpdHk/LnNlc3Npb25VcmkgPz8gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBsYXVuY2hQbGFuLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY2hhdENoYW5uZWxVcmkgPSBpZGVudGl0eT8uY2hhdENoYW5uZWxVcmkgPz8gdGhpcy5fZmluZEJvdW5kU2Vzc2lvbkNoYXRVcmkobGF1bmNoUGxhbi5zZXNzaW9uSWQpID8/IHNlc3Npb25Vcmk7XG5cblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvcGlsb3RBZ2VudFNlc3Npb24sXG5cdFx0XHR7XG5cdFx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRcdGNoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHQuLi4oaWRlbnRpdHk/LnJlc291cmNlID8geyByZXNvdXJjZTogaWRlbnRpdHkucmVzb3VyY2UgfSA6IHt9KSxcblx0XHRcdFx0cmF3U2Vzc2lvbklkOiBsYXVuY2hQbGFuLnNlc3Npb25JZCxcblx0XHRcdFx0b25EaWRTZXNzaW9uUHJvZ3Jlc3M6IHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLFxuXHRcdFx0XHRzZXNzaW9uTGF1bmNoZXI6IHRoaXMuX3Nlc3Npb25MYXVuY2hlcixcblx0XHRcdFx0bGF1bmNoUGxhbixcblx0XHRcdFx0c2hlbGxNYW5hZ2VyOiBsYXVuY2hQbGFuLnNoZWxsTWFuYWdlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogbGF1bmNoUGxhbi53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uRGlyZWN0b3J5LFxuXHRcdFx0XHRjbGllbnRTbmFwc2hvdDogbGF1bmNoUGxhbi5zbmFwc2hvdCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50VG9vbFNldDogbGF1bmNoUGxhbi5hY3RpdmVDbGllbnRUb29sU2V0LFxuXHRcdFx0XHQvLyBFdmFsdWF0ZSBtZW1iZXJzaGlwIGFnYWluc3QgdGhlIHNlc3Npb24ncyBjdXJyZW50IGNoYXQgY2hhbm5lbDsgYGJpbmRDaGF0Q2hhbm5lbGAgY2FuIG1vdmUgaXQgbGF0ZXIuXG5cdFx0XHRcdGNsaWVudFJlYWNoZXNDaGF0OiAoY2xpZW50SWQsIGNoYXQpID0+IGFjdGl2ZUNsaWVudC5jb250cmlidXRlc1RvKGNsaWVudElkLCBjaGF0LnRvU3RyaW5nKCkpLFxuXHRcdFx0XHQvLyBNQ1AgcmVjb25jaWxlIGhhcyBubyBob3N0IGNhbGwgb2YgaXRzIG93biwgc28gcmVhZCB0aGUgcmV0YWluZWQgaG9zdCBzbmFwc2hvdCBsYXppbHkuXG5cdFx0XHRcdGhvc3RDdXN0b21pemF0aW9uczogKCkgPT4gdGhpcy5fcmV0YWluZWRIb3N0Q3VzdG9taXphdGlvbnMoc2Vzc2lvblVyaSksXG5cdFx0XHRcdHNlcnZlclRvb2xIb3N0OiB0aGlzLl9zZXJ2ZXJUb29sSG9zdCxcblx0XHRcdFx0aXNMYXVuY2hUb2tlbkN1cnJlbnQ6ICgpID0+IHRoaXMuX2dpdGh1YlRva2VuID09PSBsYXVuY2hQbGFuLmdpdGh1YlRva2VuLFxuXHRcdFx0XHRvblR1cm5FbmRlZDogKCkgPT4gdGhpcy5fb25DaGF0VHVybkVuZGVkKCksXG5cdFx0XHR9LFxuXHRcdCk7XG5cdFx0cmV0dXJuIGFnZW50U2Vzc2lvbjtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyByb290LWNvbmZpZ3VyZWQgTUNQIHNlcnZlcnMgdGhhdCBtdXN0IGJlIGRpc2FibGVkIHdoZW4gdGhlIFNESyBzZXNzaW9uIHN0YXJ0cy4gKi9cblx0cHJpdmF0ZSBfZGlzYWJsZWRSb290TWNwU2VydmVycyhzZXNzaW9uOiBVUkksIHNlc3Npb25JZDogc3RyaW5nLCBzbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90KTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJvb3RTZXJ2ZXJzOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10gPSBPYmplY3Qua2V5cyhzbmFwc2hvdC5tY3BTZXJ2ZXJzKS5tYXAobmFtZSA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IGJ1aWxkTWNwVG9wTGV2ZWxDdXN0b21pemF0aW9uSWQodGhpcy5pZCwgc2Vzc2lvbklkLCBuYW1lKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHVyaTogaWQsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChcblx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdHNlc3Npb24sXG5cdFx0XHRyb290U2VydmVycyxcblx0XHQpKTtcblx0XHRyZXR1cm4gcm9vdFNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiBlbmFibGVtZW50LmdldChzZXJ2ZXIuaWQpICE9PSB0cnVlKS5tYXAoc2VydmVyID0+IHNlcnZlci5uYW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUNoYXRFbnRyeShzZXNzaW9uOiBDb3BpbG90QWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQ6IEFjdGl2ZUNsaWVudCk6IENvcGlsb3RDaGF0RW50cnkge1xuXHRcdHJldHVybiBuZXcgQ29waWxvdENoYXRFbnRyeShzZXNzaW9uLCBhY3RpdmVDbGllbnQsIHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLCAoKSA9PiB0aGlzLl9oYW5kbGVDb3BpbG90U2Vzc2lvbkF1dGhSZXF1aXJlZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGl2ZUNoYXQoY2hhdDogVVJJLCBzZXNzaW9uOiBDb3BpbG90QWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQ6IEFjdGl2ZUNsaWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fY2hhdEVudHJpZXNCeVNka0lkLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5zZXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHRoaXMuX2NyZWF0ZUNoYXRFbnRyeShzZXNzaW9uLCBhY3RpdmVDbGllbnQpKTtcblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgeyAuLi5jdXJyZW50LCBzZGtTZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJVbmJvdW5kU2Vzc2lvbihzZXNzaW9uOiBDb3BpbG90QWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQ6IEFjdGl2ZUNsaWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9jaGF0RW50cmllc0J5U2RrSWQuc2V0KHNlc3Npb24uc2Vzc2lvbklkLCB0aGlzLl9jcmVhdGVDaGF0RW50cnkoc2Vzc2lvbiwgYWN0aXZlQ2xpZW50KSk7XG5cdH1cblxuXHQvKiogUmVqZWN0cyBhIHNlc3Npb24gaW5pdGlhbGl6ZWQgYnkgYSBjbGllbnQgdGhhdCB3YXMgc3RvcHBlZCBvciByZXBsYWNlZCBkdXJpbmcgbGF1bmNoLiAqL1xuXHRwcml2YXRlIF90aHJvd0lmQ2xpZW50UmVwbGFjZWQoY2xpZW50OiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW5bJ2NsaWVudCddLCBhZ2VudFNlc3Npb246IENvcGlsb3RBZ2VudFNlc3Npb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2h1dGRvd25Qcm9taXNlIHx8IHRoaXMuX2NsaWVudCAhPT0gY2xpZW50KSB7XG5cdFx0XHRhZ2VudFNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJJbml0aWFsaXplZFNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIGFnZW50U2Vzc2lvbjogQ29waWxvdEFnZW50U2Vzc2lvbiwgYWN0aXZlQ2xpZW50OiBBY3RpdmVDbGllbnQsIGNsaWVudDogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuWydjbGllbnQnXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Rocm93SWZDbGllbnRSZXBsYWNlZChjbGllbnQsIGFnZW50U2Vzc2lvbik7XG5cdFx0Y29uc3QgYm91bmRDaGF0ID0gdGhpcy5fZmluZEJvdW5kU2Vzc2lvbkNoYXRVcmkoc2Vzc2lvbklkKTtcblx0XHRpZiAoYm91bmRDaGF0KSB7XG5cdFx0XHRhZ2VudFNlc3Npb24uYmluZENoYXRDaGFubmVsPy4oYm91bmRDaGF0KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyTGl2ZUNoYXQoYm91bmRDaGF0LCBhZ2VudFNlc3Npb24sIGFjdGl2ZUNsaWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyVW5ib3VuZFNlc3Npb24oYWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGVzdHJveUxpdmVTZXNzaW9uKGNoYXRTZXNzaW9uOiBDb3BpbG90QWdlbnRTZXNzaW9uLCBwcmVzZXJ2ZVJvdXRpbmcgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjaGF0U2Vzc2lvbi5kZXN0cm95U2Vzc2lvbigpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7Y2hhdFNlc3Npb24uc2Vzc2lvbklkfV0gRmFpbGVkIHRvIGRlc3Ryb3kgc2Vzc2lvbiBiZWZvcmUgY2xlYW51cDogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRDaGFubmVsVXJpID0gY2hhdFNlc3Npb24uY2hhdENoYW5uZWxVcmk7XG5cdFx0aWYgKCFwcmVzZXJ2ZVJvdXRpbmcgJiYgY2hhdENoYW5uZWxVcmkgJiYgdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0Q2hhbm5lbFVyaS50b1N0cmluZygpKT8uc2RrU2Vzc2lvbklkID09PSBjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5kZWxldGUoY2hhdENoYW5uZWxVcmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5kZWxldGVBbmREaXNwb3NlKGNoYXRTZXNzaW9uLnNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9hbGxMaXZlU2Vzc2lvbnMoKTogQ29waWxvdEFnZW50U2Vzc2lvbltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC52YWx1ZXMoKV0ubWFwKGVudHJ5ID0+IGVudHJ5LmNoYXRTZXNzaW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgY2hhdENoYW5uZWxVcmk/OiBVUkksIHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTxDb3BpbG90QWdlbnRTZXNzaW9uPiB7XG5cdFx0aWYgKGNoYXRDaGFubmVsVXJpKSB7XG5cdFx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCksIHsgc2RrU2Vzc2lvbklkOiBzZXNzaW9uSWQgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IGxpZmV0aW1lID0gdGhpcy5fZ2V0T3JDcmVhdGVTZXNzaW9uTGlmZXRpbWUoc2Vzc2lvbklkKTtcblx0XHRpZiAoIWxpZmV0aW1lKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGlmZXRpbWUucmVzdW1lRGVmYXVsdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWFzZSA9IGF3YWl0IGxpZmV0aW1lLmFjcXVpcmUoKTtcblx0XHRcdGlmICghbGVhc2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZG9SZXN1bWVTZXNzaW9uKHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGxlYXNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVzdW1lU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENvcGlsb3RBZ2VudFNlc3Npb24+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gX3Jlc3VtZVNlc3Npb24gY2FsbGVkIFx1MjAxNCBzZXNzaW9uIG5vdCBpbiBtZW1vcnksIHJlc3VtaW5nLi4uYCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fZW5zdXJlQ2xpZW50KCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBzZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHN0b3JlZE1ldGFkYXRhID0gYXdhaXQgdGhpcy5fcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBzZXNzaW9uTWV0YWRhdGEgPSBhd2FpdCBjbGllbnQuZ2V0U2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25JZCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBnZXRTZXNzaW9uTWV0YWRhdGEgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHN0b3JlZE1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnkgPz8gKHR5cGVvZiBzZXNzaW9uTWV0YWRhdGE/LmNvbnRleHQ/LndvcmtpbmdEaXJlY3RvcnkgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUoc2Vzc2lvbk1ldGFkYXRhLmNvbnRleHQud29ya2luZ0RpcmVjdG9yeSkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGB3b3JraW5nRGlyZWN0b3J5IGlzIHJlcXVpcmVkIHRvIHJlc3VtZSBDb3BpbG90IHNlc3Npb24gJyR7c2Vzc2lvbklkfSdgKTtcblx0XHR9XG5cdFx0Ly8gQSB3b3Jrc3BhY2UtbGVzcyBjaGF0J3Mgd29ya2luZyBkaXJlY3RvcnkgaXMgYSBzdGFibGUgcGVyLXNlc3Npb24gc2NyYXRjaCBkaXJcblx0XHQvLyB0aGF0IG1heSBoYXZlIGJlZW4gcmVhcGVkIChPUyB0ZW1wIGNsZWFudXAsIHJlYm9vdCkgd2hpbGUgdGhlIHNlc3Npb25cblx0XHQvLyBwZXJzaXN0ZWQuIFJlY3JlYXRlIGl0IChta2RpciAtcCkgc28gc2hlbGwvZ2l0L3NjcmF0Y2ggb3BzIGRvbid0IGZhaWwuXG5cdFx0bGV0IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IHdvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0aWYgKHN0b3JlZE1ldGFkYXRhLndvcmtzcGFjZWxlc3MpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVdvcmtzcGFjZWxlc3NTY3JhdGNoRGlyKHdvcmtpbmdEaXJlY3RvcnksIHNlc3Npb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fVxuXHRcdC8vIEFuY2hvciBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSB0byB0aGUgd29ya2luZyBkaXJlY3RvcnkgKHRoZSB3b3JrdHJlZSBmb3Jcblx0XHQvLyB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9ucyksIG1hdGNoaW5nIGhvdyB0aGUgc2Vzc2lvbiB3YXMgbWF0ZXJpYWxpemVkLlxuXHRcdC8vIE9sZGVyIHNlc3Npb25zIHBlcnNpc3RlZCBgY3VzdG9taXphdGlvbkRpcmVjdG9yeWAgYXMgdGhlIHVzZXItcGlja2VkXG5cdFx0Ly8gZm9sZGVyOyBwcmVmZXJyaW5nIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBjb3JyZWN0cyB0aGVtIG9uIHJlc3VtZS5cblx0XHRjb25zdCBjdXN0b21pemF0aW9uRGlyZWN0b3J5ID0gcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5O1xuXHRcdC8vIEFsd2F5cyBjcmVhdGUgYW4gQWN0aXZlQ2xpZW50IHNvIHRoZSBzbmFwc2hvdCBpbmNsdWRlcyBob3N0ICtcblx0XHQvLyBzZXNzaW9uLWRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMsIGV2ZW4gd2hlbiBubyBjbGllbnQgaGFzXG5cdFx0Ly8gcmVnaXN0ZXJlZCBhbiBhY3RpdmUtY2xpZW50IGhhbmRsZSB5ZXQuXG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoc2Vzc2lvblVyaSwgY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0YWN0aXZlQ2xpZW50LnBsdWdpbkNvbnRyb2xsZXIucmVhbmNob3IoY3VzdG9taXphdGlvbkRpcmVjdG9yeSk7XG5cdFx0Ly8gTXVsdGktcm9vdDogcmUtYXR0YWNoIHRoZSBub24tcHJpbWFyeSByb290cyBzbyBkaXNjb3Zlcnkgc3BhbnMgZXZlcnlcblx0XHQvLyByb290IG9uIHJlc3VtZS4gRW1wdHkgd2hlbiBzaW5nbGUtcm9vdCAvIGdhdGVkIG9mZi4gQSBzZW5kLXRpbWVcblx0XHQvLyBzbmFwc2hvdCBzdXBlcnNlZGVzIHRoZSBwZXJzaXN0ZWQgcmVzdG9yYXRpb24gc2VlZC5cblx0XHRjb25zdCBsYXVuY2hXb3JraW5nRGlyZWN0b3JpZXMgPSB3b3JraW5nRGlyZWN0b3JpZXMgPz8gc3RvcmVkTWV0YWRhdGEud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGFjdGl2ZUNsaWVudC5wbHVnaW5Db250cm9sbGVyLnNldEFkZGl0aW9uYWxEaXJlY3Rvcmllcyh0aGlzLl9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKGxhdW5jaFdvcmtpbmdEaXJlY3RvcmllcykpO1xuXHRcdC8vIFByZWZlciBjaGF0LXNjb3BlZCBtZW1iZXJzaGlwIHdoZW4gdGhpcyBTREsgc2Vzc2lvbiBpcyBhbHJlYWR5IGJvdW5kIHRvIGEgY2hhdC5cblx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGFjdGl2ZUNsaWVudC5zbmFwc2hvdCh0aGlzLl9maW5kQm91bmRTZXNzaW9uQ2hhdFVyaShzZXNzaW9uSWQpPy50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IHNoZWxsTWFuYWdlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNoZWxsTWFuYWdlciwgc2Vzc2lvblVyaSwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCByZXNvbHZlZEFnZW50TmFtZSA9IHN0b3JlZE1ldGFkYXRhLmFnZW50ID8gdGhpcy5fcmVzb2x2ZUFnZW50TmFtZShzbmFwc2hvdCwgc3RvcmVkTWV0YWRhdGEuYWdlbnQpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChzdG9yZWRNZXRhZGF0YS5hZ2VudCAmJiAhcmVzb2x2ZWRBZ2VudE5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTdG9yZWQgY3VzdG9tIGFnZW50IGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgcGx1Z2luIHNuYXBzaG90OyByZXN1bWluZyB3aXRob3V0IGEgY3VzdG9tIGFnZW50YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGxhdW5jaFBsYW46IENvcGlsb3RTZXNzaW9uTGF1bmNoUGxhbiA9IHtcblx0XHRcdGtpbmQ6ICdyZXN1bWUnLFxuXHRcdFx0Y2xpZW50LFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiB0aGlzLl9hZGRpdGlvbmFsQ3VzdG9taXphdGlvbkRpcmVjdG9yaWVzKGxhdW5jaFdvcmtpbmdEaXJlY3RvcmllcyksXG5cdFx0XHRyZXNvbHZlZEFnZW50TmFtZSxcblx0XHRcdHNuYXBzaG90LFxuXHRcdFx0ZGlzYWJsZWRSb290TWNwU2VydmVyczogdGhpcy5fZGlzYWJsZWRSb290TWNwU2VydmVycyhzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIHNuYXBzaG90KSxcblx0XHRcdGFjdGl2ZUNsaWVudFRvb2xTZXQ6IGFjdGl2ZUNsaWVudC50b29sU2V0LFxuXHRcdFx0c2hlbGxNYW5hZ2VyLFxuXHRcdFx0Z2l0aHViVG9rZW46IHRoaXMuX2dpdGh1YlRva2VuLFxuXHRcdFx0d29ya3NwYWNlbGVzczogc3RvcmVkTWV0YWRhdGEud29ya3NwYWNlbGVzcyxcblx0XHRcdGZhbGxiYWNrOiB7XG5cdFx0XHRcdG1vZGVsOiBzdG9yZWRNZXRhZGF0YS5tb2RlbCxcblx0XHRcdFx0bG9uZ0NvbnRleHRXaW5kb3c6IHRoaXMuX2xvbmdDb250ZXh0V2luZG93Rm9yKHN0b3JlZE1ldGFkYXRhLm1vZGVsPy5pZCksXG5cdFx0XHRcdGZyZWVMb25nQ29udGV4dDogdGhpcy5faXNGcmVlTG9uZ0NvbnRleHQoc3RvcmVkTWV0YWRhdGEubW9kZWw/LmlkKSxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUFnZW50U2Vzc2lvbihsYXVuY2hQbGFuLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCBhY3RpdmVDbGllbnQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhZ2VudFNlc3Npb24uaW5pdGlhbGl6ZVNlc3Npb24oKTtcblx0XHRcdGF3YWl0IHRoaXMuX3N0b3JlU2Vzc2lvbk1ldGFkYXRhKHNlc3Npb25VcmksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBsYXVuY2hXb3JraW5nRGlyZWN0b3JpZXMsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVySW5pdGlhbGl6ZWRTZXNzaW9uKHNlc3Npb25JZCwgYWdlbnRTZXNzaW9uLCBhY3RpdmVDbGllbnQsIGxhdW5jaFBsYW4uY2xpZW50KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFnZW50U2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFnZW50U2Vzc2lvbjtcblx0fVxuXG5cdC8vIC0tLS0gc2Vzc2lvbiBtZXRhZGF0YSBwZXJzaXN0ZW5jZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX01PREVMID0gJ2NvcGlsb3QubW9kZWwnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUVUQV9BR0VOVCA9ICdjb3BpbG90LmFnZW50Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfQ1dEID0gJ2NvcGlsb3Qud29ya2luZ0RpcmVjdG9yeSc7XG5cdC8qKiBQZXJzaXN0ZWQgb3JkZXJlZCB3b3JraW5nLWRpcmVjdG9yeSBzZXQgKEpTT04gYXJyYXkgb2YgVVJJIHN0cmluZ3M7IGluZGV4IDAgPSBwcmltYXJ5KS4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfQ1dEUyA9ICdjb3BpbG90LndvcmtpbmdEaXJlY3Rvcmllcyc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZID0gJ2NvcGlsb3QuY3VzdG9taXphdGlvbkRpcmVjdG9yeSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX1BST0pFQ1RfUkVTT0xWRUQgPSAnY29waWxvdC5wcm9qZWN0LnJlc29sdmVkJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX01FVEFfUFJPSkVDVF9VUkkgPSAnY29waWxvdC5wcm9qZWN0LnVyaSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9NRVRBX1BST0pFQ1RfRElTUExBWV9OQU1FID0gJ2NvcGlsb3QucHJvamVjdC5kaXNwbGF5TmFtZSc7XG5cdC8qKiBMZWdhY3kgcGVyc2lzdGVkIGNhdGFsb2cgb2YgY29uY3JldGUgY2hhdCBiYWNraW5ncywga2V5ZWQgYnkgY2hhdElkLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfTUVUQV9DSEFUUyA9ICdjb3BpbG90LmNoYXRzJztcblxuXHQvKiogUmVhZHMgdGhlIGxlZ2FjeSBgY29waWxvdC5jaGF0c2AgbWlncmF0aW9uIGNvZGVjIHJldGFpbmVkIGZvciBwcmUtcHJvdmlkZXJEYXRhIHNlc3Npb25zLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkTGVnYWN5Q2hhdEJhY2tpbmdzKHNlc3Npb246IFVSSSk6IFByb21pc2U8TWFwPHN0cmluZywgSVBlcnNpc3RlZENoYXQ+PiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJhdyA9IGF3YWl0IHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NIQVRTKTtcblx0XHRcdGlmICghcmF3KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhdykgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgSVBlcnNpc3RlZENoYXQ+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IFtjaGF0SWQsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhwYXJzZWQpKSB7XG5cdFx0XHRcdC8vIFRoZSBtZXRhZGF0YSBibG9iIGlzIGNsaWVudC1pbmZsdWVuY2VkIGFuZCBtYXkgYmUgY29ycnVwdGVkIG9yXG5cdFx0XHRcdC8vIHRhbXBlcmVkOiBkcm9wIGVudHJpZXMgdGhhdCBkb24ndCBjYXJyeSBhIHVzYWJsZSBTREsgc2Vzc2lvbiBpZFxuXHRcdFx0XHQvLyByYXRoZXIgdGhhbiBsZXR0aW5nIGFuIGludmFsaWQgaWQgcmVhY2ggYGNsaWVudC5kZWxldGVTZXNzaW9uYC5cblx0XHRcdFx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBzZGtTZXNzaW9uSWQsIG1vZGVsIH0gPSB2YWx1ZSBhcyB7IHNka1Nlc3Npb25JZD86IHVua25vd247IG1vZGVsPzogdW5rbm93biB9O1xuXHRcdFx0XHRpZiAodHlwZW9mIHNka1Nlc3Npb25JZCAhPT0gJ3N0cmluZycgfHwgIXNka1Nlc3Npb25JZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdC5zZXQoY2hhdElkLCB7IHNka1Nlc3Npb25JZCwgLi4uKG1vZGVsID8geyBtb2RlbDogbW9kZWwgYXMgTW9kZWxTZWxlY3Rpb24gfSA6IHt9KSB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90XSBGYWlsZWQgdG8gcmVhZCBwZXJzaXN0ZWQgY2hhdHMgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcmVTZXNzaW9uTWV0YWRhdGEoc2Vzc2lvbjogVVJJLCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCwgY3VzdG9taXphdGlvbkRpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQsIHByb2plY3RSZXNvbHZlZCA9IHByb2plY3QgIT09IHVuZGVmaW5lZCwgY29uZmlnVmFsdWVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGN1c3RvbVRpdGxlPzogc3RyaW5nLCBtYXJrUmVhZD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYlJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0Y29uc3QgZGIgPSBkYlJlZi5vYmplY3Q7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcms6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfTU9ERUwsIHRoaXMuX3NlcmlhbGl6ZU1vZGVsU2VsZWN0aW9uKG1vZGVsKSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUGVyc2lzdCByZWFkIG93bmVyc2hpcCBzbyB0aGUgYWRvcHRlZCBzZXNzaW9uIGlzbid0IHJlcG9ydGVkIHVucmVhZCBvbiBvcGVuLlxuXHRcdFx0aWYgKG1hcmtSZWFkKSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShBSF9NRVRBX0lTX1JFQURfREJfS0VZLCAndHJ1ZScpKTtcblx0XHRcdH1cblx0XHRcdGlmICh3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dELCB3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCkpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBlcnNpc3QgdGhlIG9yZGVyZWQgc2V0IGFsb25nc2lkZSB0aGUgbGVnYWN5IHNpbmdsZSBjd2Qgc28gYVxuXHRcdFx0Ly8gbXVsdGktcm9vdCBzZXNzaW9uIHJlc3RvcmVzIGV2ZXJ5IGRpcmVjdG9yeSBvbiByZWxvYWQuIFJlYWRzIHByZWZlclxuXHRcdFx0Ly8gdGhpcyBrZXk7IGBfTUVUQV9DV0RgIHJlbWFpbnMgdGhlIGZhbGxiYWNrIGZvciBzZXNzaW9ucyBwZXJzaXN0ZWRcblx0XHRcdC8vIGJlZm9yZSB0aGlzIGtleSBleGlzdGVkLiBXcml0dGVuIHRvZ2V0aGVyIHdpdGggYF9NRVRBX0NXRGAgZnJvbSB0aGVcblx0XHRcdC8vIHNhbWUgc291cmNlIHNvIGluZGV4IDAgc3RheXMgY29uc2lzdGVudCBhY3Jvc3MgYm90aCBrZXlzLlxuXHRcdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NXRFMsIEpTT04uc3RyaW5naWZ5KHdvcmtpbmdEaXJlY3Rvcmllcy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpKSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb25EaXJlY3RvcnkpIHtcblx0XHRcdFx0d29yay5wdXNoKGRiLnNldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9DVVNUT01JWkFUSU9OX0RJUkVDVE9SWSwgY3VzdG9taXphdGlvbkRpcmVjdG9yeS50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvamVjdFJlc29sdmVkKSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9SRVNPTFZFRCwgJ3RydWUnKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvamVjdCkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX1BST0pFQ1RfVVJJLCBwcm9qZWN0LnVyaS50b1N0cmluZygpKSk7XG5cdFx0XHRcdHdvcmsucHVzaChkYi5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9ESVNQTEFZX05BTUUsIHByb2plY3QuZGlzcGxheU5hbWUpKTtcblx0XHRcdH1cblx0XHRcdC8vIFBlcnNpc3RlZCB0aGUgc2FtZSB3YXkgYEFnZW50U2VydmljZS5fcGVyc2lzdENvbmZpZ1ZhbHVlc2Agd3JpdGVzIHRoZW0sXG5cdFx0XHQvLyBzbyByZXN0b3JlJ3MgY29uZmlnIHJlc29sdXRpb24gb3ZlcmxheXMgdGhlbSAodXNlZCBieSBhZG9wdCB0byBmb3JjZVxuXHRcdFx0Ly8gZm9sZGVyIGlzb2xhdGlvbikgXHUyMDE0IGZvbGRlZCBpbnRvIHRoaXMgd3JpdGUgdG8gYXZvaWQgYSBzZWNvbmQgREIgb3Blbi5cblx0XHRcdGlmIChjb25maWdWYWx1ZXMpIHtcblx0XHRcdFx0d29yay5wdXNoKGRiLnNldE1ldGFkYXRhKCdjb25maWdWYWx1ZXMnLCBKU09OLnN0cmluZ2lmeShjb25maWdWYWx1ZXMpKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBPdmVybGFpZCBhcyB0aGUgc2Vzc2lvbidzIGRpc3BsYXkgdGl0bGUgb24gcmVzdG9yZSAoc2VlIHRoZVxuXHRcdFx0Ly8gYGN1c3RvbVRpdGxlYCBvdmVybGF5IGluIGBBZ2VudFNlcnZpY2VgKTsgdXNlZCBieSBhZG9wdCB0byBjYXJyeVxuXHRcdFx0Ly8gb3ZlciB0aGUgbGVnYWN5IGV4dGVuc2lvbi1ob3N0IHNlc3Npb24gbmFtZS5cblx0XHRcdGlmIChjdXN0b21UaXRsZSkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGIuc2V0TWV0YWRhdGEoJ2N1c3RvbVRpdGxlJywgY3VzdG9tVGl0bGUpKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHdvcmspO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlcyB0aGUgcGVyc2lzdGVkIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0LiBQcmVmZXJzIHRoZSBKU09OXG5cdCAqIGBfTUVUQV9DV0RTYCBhcnJheSB3aGVuIHByZXNlbnQgYW5kIHZhbGlkLCBvdGhlcndpc2UgZmFsbHMgYmFjayB0byB0aGVcblx0ICogc2luZ2xlIGxlZ2FjeSBgX01FVEFfQ1dEYCB2YWx1ZS4gQSBtYWxmb3JtZWQgYmxvYiAodGhlIG1ldGFkYXRhIHN0b3JlIGlzXG5cdCAqIGNsaWVudC1pbmZsdWVuY2VkIGFuZCBtYXkgYmUgY29ycnVwdCkgaXMgaWdub3JlZCBpbiBmYXZvdXIgb2YgdGhlIGxlZ2FjeVxuXHQgKiBmYWxsYmFjayBzbyBpdCBjYW4gbmV2ZXIgcmVqZWN0IHRoZSBjYWxsZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZVdvcmtpbmdEaXJlY3RvcmllcyhyYXdTZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZmFsbGJhY2s6IFVSSSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmF3U2V0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHJhd1NldCk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHRjb25zdCBkaXJzID0gcGFyc2VkLmZpbHRlcigoZCk6IGQgaXMgc3RyaW5nID0+IHR5cGVvZiBkID09PSAnc3RyaW5nJyAmJiBkLmxlbmd0aCA+IDApLm1hcChkID0+IFVSSS5wYXJzZShkKSk7XG5cdFx0XHRcdFx0aWYgKGRpcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRpcnM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gTWFsZm9ybWVkIG1ldGFkYXRhIGJsb2I6IGZhbGwgdGhyb3VnaCB0byB0aGUgbGVnYWN5IGZhbGxiYWNrLlxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsbGJhY2sgPyBbZmFsbGJhY2tdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjsgd29ya2luZ0RpcmVjdG9yeT86IFVSSTsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107IGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk/OiBVUkk7IHdvcmtzcGFjZWxlc3M/OiBib29sZWFuIH0+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBbbW9kZWwsIGFnZW50LCBjd2QsIGN3ZHMsIGN1c3RvbWl6YXRpb25EaXJlY3RvcnksIHdvcmtzcGFjZWxlc3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9NT0RFTCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0FHRU5UKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEUyksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGN3ZCA/IFVSSS5wYXJzZShjd2QpIDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWw6IHRoaXMuX3BhcnNlTW9kZWxTZWxlY3Rpb24obW9kZWwpLFxuXHRcdFx0XHRhZ2VudDogdGhpcy5fcGFyc2VBZ2VudFNlbGVjdGlvbihhZ2VudCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3JpZXMoY3dkcywgd29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IGN1c3RvbWl6YXRpb25EaXJlY3RvcnkgPyBVUkkucGFyc2UoY3VzdG9taXphdGlvbkRpcmVjdG9yeSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdvcmtzcGFjZWxlc3M6IHdvcmtzcGFjZWxlc3MgPT09ICd0cnVlJyxcblx0XHRcdH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFN0b3JlZFNlc3Npb25NZXRhZGF0YShzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjsgd29ya2luZ0RpcmVjdG9yeT86IFVSSTsgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW107IGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk/OiBVUkk7IHByb2plY3Q/OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm87IHJlc29sdmVkOiBib29sZWFuOyB3b3Jrc3BhY2VsZXNzPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFttb2RlbCwgYWdlbnQsIGN3ZCwgY3dkcywgY3VzdG9taXphdGlvbkRpcmVjdG9yeSwgcmVzb2x2ZWQsIHVyaSwgZGlzcGxheU5hbWUsIHdvcmtzcGFjZWxlc3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKENvcGlsb3RBZ2VudC5fTUVUQV9NT0RFTCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0FHRU5UKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQ1dEUyksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX0NVU1RPTUlaQVRJT05fRElSRUNUT1JZKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9SRVNPTFZFRCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ29waWxvdEFnZW50Ll9NRVRBX1BST0pFQ1RfVVJJKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfUFJPSkVDVF9ESVNQTEFZX05BTUUpLFxuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVkpLFxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoW21vZGVsLCBhZ2VudCwgY3dkLCBjd2RzLCBjdXN0b21pemF0aW9uRGlyZWN0b3J5LCByZXNvbHZlZCwgdXJpLCBkaXNwbGF5TmFtZSwgd29ya3NwYWNlbGVzc10uZXZlcnkodmFsdWUgPT4gdmFsdWUgPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgcmVzb2x2ZWQ6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gY3dkID8gVVJJLnBhcnNlKGN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm9qZWN0ID0gdXJpICYmIGRpc3BsYXlOYW1lID8geyB1cmk6IFVSSS5wYXJzZSh1cmkpLCBkaXNwbGF5TmFtZSB9IDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWw6IHRoaXMuX3BhcnNlTW9kZWxTZWxlY3Rpb24obW9kZWwpLFxuXHRcdFx0XHRhZ2VudDogdGhpcy5fcGFyc2VBZ2VudFNlbGVjdGlvbihhZ2VudCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3JpZXMoY3dkcywgd29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk6IGN1c3RvbWl6YXRpb25EaXJlY3RvcnkgPyBVUkkucGFyc2UoY3VzdG9taXphdGlvbkRpcmVjdG9yeSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb2plY3QsXG5cdFx0XHRcdHJlc29sdmVkOiByZXNvbHZlZCA9PT0gJ3RydWUnIHx8IHByb2plY3QgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlbGVzczogd29ya3NwYWNlbGVzcyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogd29ya3NwYWNlbGVzcyA9PT0gJ3RydWUnLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgKG9yIGNsZWFycykgdGhlIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCBmb3IgYSBzZXNzaW9uLiBXcml0aW5nXG5cdCAqIGB1bmRlZmluZWRgIGNsZWFycyB0aGUgc3RvcmVkIHNlbGVjdGlvbiBieSB3cml0aW5nIGFuIGVtcHR5IHN0cmluZyxcblx0ICogd2hpY2ggbGF0ZXIgY29sZCByZWFkcyB0cmVhdCBhcyBcIm5vIGN1c3RvbSBhZ2VudFwiIGJlY2F1c2Vcblx0ICogYF9wYXJzZUFnZW50U2VsZWN0aW9uYCBzaG9ydC1jaXJjdWl0cyBvbiBmYWxzeSBtZXRhZGF0YSB2YWx1ZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9zdG9yZVNlc3Npb25BZ2VudE1ldGFkYXRhKHNlc3Npb246IFVSSSwgYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBXcml0aW5nIGFuIGVtcHR5IHN0cmluZyBpcyB0cmVhdGVkIGFzIFwibm8gc2VsZWN0aW9uXCIgYnlcblx0XHRcdC8vIGBfcGFyc2VBZ2VudFNlbGVjdGlvbmAgKGl0IHNob3J0LWNpcmN1aXRzIG9uIGEgZmFsc3kgcmF3IHZhbHVlKSxcblx0XHRcdC8vIHNvIHRoaXMgaXMgdGhlIGNsZWFyIHBhdGggd2hpbGUgYHNldE1ldGFkYXRhYCBsYWNrcyBhIGRlbGV0ZS5cblx0XHRcdGF3YWl0IGRiUmVmLm9iamVjdC5zZXRNZXRhZGF0YShDb3BpbG90QWdlbnQuX01FVEFfQUdFTlQsIGFnZW50ID8gdGhpcy5fc2VyaWFsaXplQWdlbnRTZWxlY3Rpb24oYWdlbnQpIDogJycpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYlJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RvcmVTZXNzaW9uUHJvamVjdFJlc29sdXRpb24oc2Vzc2lvbjogVVJJLCBwcm9qZWN0OiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9zdG9yZVNlc3Npb25NZXRhZGF0YShzZXNzaW9uLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHByb2plY3QsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25Qcm9qZWN0KGNvbnRleHQ6IElDb3BpbG90U2Vzc2lvbkNvbnRleHQgfCB1bmRlZmluZWQsIGxpbWl0ZXI6IExpbWl0ZXI8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPiwgcHJvamVjdEJ5Q29udGV4dDogTWFwPHN0cmluZywgUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+Pik6IFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fcHJvamVjdENvbnRleHRLZXkoY29udGV4dCk7XG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRsZXQgcHJvamVjdCA9IHByb2plY3RCeUNvbnRleHQuZ2V0KGtleSk7XG5cdFx0aWYgKCFwcm9qZWN0KSB7XG5cdFx0XHRwcm9qZWN0ID0gbGltaXRlci5xdWV1ZSgoKSA9PiBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KGNvbnRleHQsIHRoaXMuX2dpdFNlcnZpY2UpKTtcblx0XHRcdHByb2plY3RCeUNvbnRleHQuc2V0KGtleSwgcHJvamVjdCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9qZWN0O1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvamVjdENvbnRleHRLZXkoY29udGV4dDogSUNvcGlsb3RTZXNzaW9uQ29udGV4dCB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGNvbnRleHQ/LmN3ZCkge1xuXHRcdFx0cmV0dXJuIGBjd2Q6JHtjb250ZXh0LmN3ZH1gO1xuXHRcdH1cblx0XHRpZiAoY29udGV4dD8uZ2l0Um9vdCkge1xuXHRcdFx0cmV0dXJuIGBnaXRSb290OiR7Y29udGV4dC5naXRSb290fWA7XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0Py5yZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm4gYHJlcG9zaXRvcnk6JHtjb250ZXh0LnJlcG9zaXRvcnl9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBhYyBvZiB0aGlzLl9hY3RpdmVDbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRhYy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudHMuY2xlYXIoKTtcblx0XHR0aGlzLnNodXRkb3duKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3RdIFNodXRkb3duIGZhaWxlZCBkdXJpbmcgZGlzcG9zZScsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiBzdXBlci5kaXNwb3NlKCkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uIHtcblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbjtcblx0cmVhZG9ubHkgcGx1Z2luRGlyPzogVVJJO1xuXHRyZWFkb25seSBwbHVnaW4/OiBJUGFyc2VkUGx1Z2luO1xuXHQvKipcblx0ICogVGhlIG9yaWdpbmFsIGNsaWVudC1wdWJsaXNoZWQgaW5wdXQuIFJldGFpbmVkIHNvIGEgbGF0ZXJcblx0ICoge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyLnJldHJ5RmFpbGVkQ2xpZW50U3luY0lmTmVlZGVkfSBjYW5cblx0ICogcmUtaXNzdWUgdGhlIHN5bmMgd2l0aG91dCBuZWVkaW5nIHRoZSBjYWxsZXIgdG8gcmUtc3VwcGx5IGl0IChpblxuXHQgKiBwYXJ0aWN1bGFyLCB0aGUgb3BhcXVlIGBub25jZWAgaXMgcHJlc2VydmVkKS5cblx0ICovXG5cdHJlYWRvbmx5IGlucHV0PzogQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbjtcbn1cblxuZXhwb3J0IGNvbnN0IFJFRlJFU0hfREVCT1VOQ0VfTVMgPSAxMDA7XG5cbi8qKlxuICogQSBwZXItd29ya2luZy1kaXJlY3RvcnkgYnVuZGxlIG9mIGN1c3RvbWl6YXRpb25zIHRoZSBhZ2VudCBob3N0XG4gKiBkaXNjb3ZlcmVkIGl0c2VsZiBmcm9tIGRpc2sgKHdvcmtzcGFjZSArIHVzZXItaG9tZSBjb252ZW50aW9ucykuXG4gKlxuICogT3ducyBhIHtAbGluayBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeX0gKGZpbGVzeXN0ZW0gc2NhbiArXG4gKiB3YXRjaGVycykgYW5kIG1hcHMgZGlzY292ZXJlZCBmaWxlcyBpbnRvIGFuIGluLW1lbW9yeVxuICoge0BsaW5rIElQYXJzZWRQbHVnaW59IHdoaWxlIHByZXNlcnZpbmcgb3JpZ2luYWwgZmlsZSBVUklzLlxuICpcbiAqIFJlZnJlc2hlcyBpdHNlbGYgd2hlbiB0aGUgZGlzY292ZXJ5IGZpcmVzIGBvbkRpZENoYW5nZWAuIFRoZSBvd25pbmdcbiAqIHtAbGluayBQbHVnaW5Db250cm9sbGVyfSBpcyBub3RpZmllZCB2aWEgdGhlIHN1cHBsaWVkIGBvbkRpZFJlZnJlc2hgXG4gKiBjYWxsYmFjayBzbyBpdCBjYW4gcmUtZmlyZSBpdHMgb3duIGNoYW5nZSBldmVudCBhbmQgKGluZGlyZWN0bHkpIGNhdXNlXG4gKiBzZXNzaW9ucyB0byBwaWNrIHVwIHRoZSBuZXcgYnVuZGxlIHRocm91Z2ggdGhlIGV4aXN0aW5nXG4gKiBgaXNPdXRkYXRlZGAgc25hcHNob3QgcGF0aC5cbiAqL1xuY2xhc3MgU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzY292ZXJ5OiBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmcmVzaERlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPihSRUZSRVNIX0RFQk9VTkNFX01TKSk7XG5cdHByaXZhdGUgX3JlZnJlc2hQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVmcmVzaE5vdGlmeSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2N1c3RvbWl6YXRpb25zOiByZWFkb25seSBEaXJlY3RvcnlDdXN0b21pemF0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBfZGlyZWN0b3JpZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NldHRsZWQ6IFByb21pc2U8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSxcblx0XHR1c2VySG9tZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldENsaWVudDogKCkgPT4gUHJvbWlzZTxDb3BpbG90Q2xpZW50Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlZnJlc2g6ICgpID0+IHZvaWQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kaXNjb3ZlcnkgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgd29ya2luZ0RpcmVjdG9yaWVzLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHR0aGlzLl9zZXR0bGVkID0gdGhpcy5fcXVldWVSZWZyZXNoKGZhbHNlLCAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kaXNjb3Zlcnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2V0dGxlZCA9IHRoaXMuX3F1ZXVlUmVmcmVzaCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3NldHRsZWQgPSB0aGlzLl9xdWV1ZVJlZnJlc2godHJ1ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcmVmcmVzaFByb21pc2UgPSBudWxsO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHdoZW5TZXR0bGVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXR0bGVkO1xuXHR9XG5cblx0Y3VycmVudEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IERpcmVjdG9yeUN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcXVldWVSZWZyZXNoKG5vdGlmeTogYm9vbGVhbiwgZGVsYXkgPSBSRUZSRVNIX0RFQk9VTkNFX01TKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVmcmVzaFByb21pc2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3JlZnJlc2hQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLl9wZW5kaW5nUmVmcmVzaE5vdGlmeSA9IHRoaXMuX3BlbmRpbmdSZWZyZXNoTm90aWZ5IHx8IG5vdGlmeTtcblxuXHRcdHJldHVybiB0aGlzLl9yZWZyZXNoRGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZE5vdGlmeSA9IHRoaXMuX3BlbmRpbmdSZWZyZXNoTm90aWZ5O1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlZnJlc2hOb3RpZnkgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHJlZnJlc2hQcm9taXNlID0gdGhpcy5fcmVmcmVzaFByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpZFJlZnJlc2ggPSBhd2FpdCB0aGlzLl9yZWZyZXNoKHRva2VuKTtcblx0XHRcdFx0aWYgKGRpZFJlZnJlc2ggJiYgc2hvdWxkTm90aWZ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gcmVmcmVzaFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWZyZXNoUHJvbWlzZSA9PT0gcmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9yZWZyZXNoUHJvbWlzZSA9PT0gcmVmcmVzaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZyZXNoUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH0pO1xuXHRcdH0sIGRlbGF5KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0Ly8gVGhlIGRlbGF5ZXIgcmVqZWN0cyBhIHBlbmRpbmcgdHJpZ2dlciB3aXRoIGBDYW5jZWxsYXRpb25FcnJvcmAgd2hlblxuXHRcdFx0Ly8gY2FuY2VsbGVkIG9yIGRpc3Bvc2VkIChzZXNzaW9uIHRlYXJkb3duKS4gU3dhbGxvdyBpdCBzbyB0aGUgc3RvcmVkXG5cdFx0XHQvLyBgX3NldHRsZWRgIHByb21pc2UgbmV2ZXIgc3VyZmFjZXMgYW4gdW5oYW5kbGVkIHJlamVjdGlvbi5cblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5TZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeU1vZGUpXG5cdFx0XHRcdD8/IERFRkFVTFRfU0VTU0lPTl9DVVNUT01JWkFUSU9OX0RJU0NPVkVSWV9NT0RFO1xuXHRcdFx0aWYgKG1vZGUgPT09ICdkaXNjb3ZlcicpIHtcblx0XHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlcnkuZGlzY292ZXIoYXdhaXQgdGhpcy5fZ2V0Q2xpZW50KCksIHRva2VuKTtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVxdWFscyh0aGlzLl9jdXN0b21pemF0aW9ucywgY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fY3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHRcdFx0dGhpcy5fZGlyZWN0b3JpZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IHRoaXMuX2Rpc2NvdmVyeS5zY2FuKHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9kaXJlY3RvcmllcyAmJiBhcmVEaXNjb3ZlcmVkRGlyZWN0b3JpZXNFcXVhbCh0aGlzLl9kaXJlY3RvcmllcywgZGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCB0b0Rpc2NvdmVyZWREaXJlY3RvcnlDdXN0b21pemF0aW9ucyhkaXJlY3RvcmllcywgdGhpcy5fZmlsZVNlcnZpY2UpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG9uJ3QgdXBkYXRlIGBfY3VzdG9taXphdGlvbnNgIC8gYF9kaXJlY3Rvcmllc2Agd2hlbiBjYW5jZWxsZWQuXG5cdFx0XHQvLyBPdGhlcndpc2UgYSBjYW5jZWxsZWQgcmVmcmVzaCBjb3VsZCB0ZW1wb3JhcmlseSBjbGVhciB0aGVtIGFuZCBjYXVzZSBjYWxsZXJzIHRvIHNlZSBlbXB0eSBjdXN0b21pemF0aW9ucy5cblx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zID0gY3VzdG9taXphdGlvbnM7XG5cdFx0XHR0aGlzLl9kaXJlY3RvcmllcyA9IGRpcmVjdG9yaWVzO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBEb24ndCB1cGRhdGUgYF9jdXN0b21pemF0aW9uc2AgLyBgX2RpcmVjdG9yaWVzYCB3aGVuIGNhbmNlbGxlZC5cblx0XHRcdC8vIE90aGVyd2lzZSBhIGNhbmNlbGxlZCByZWZyZXNoIGNvdWxkIHRlbXBvcmFyaWx5IGNsZWFyIHRoZW0gYW5kIGNhdXNlIGNhbGxlcnMgdG8gc2VlIGVtcHR5IGN1c3RvbWl6YXRpb25zLlxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6U2Vzc2lvbkRpc2NvdmVyZWRFbnRyeV0gRGlzY292ZXJ5L2J1bmRsZSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0Y29uc3QgaGFkU3RhdGUgPSB0aGlzLl9jdXN0b21pemF0aW9ucy5sZW5ndGggPiAwIHx8IHRoaXMuX2RpcmVjdG9yaWVzICE9PSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXN0b21pemF0aW9ucyA9IFtdO1xuXHRcdFx0dGhpcy5fZGlyZWN0b3JpZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gaGFkU3RhdGU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0Rpc2NvdmVyZWREaXJlY3RvcnlDdXN0b21pemF0aW9ucyhkaXJlY3RvcmllczogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8RGlyZWN0b3J5Q3VzdG9taXphdGlvbltdPiB7XG5cdHJldHVybiBQcm9taXNlLmFsbChkaXJlY3Rvcmllcy5tYXAoYXN5bmMgZGlyZWN0b3J5ID0+IHtcblx0XHRjb25zdCBwcm90b2NvbFVyaSA9IGRpcmVjdG9yeS51cmkudG9TdHJpbmcoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5LFxuXHRcdFx0aWQ6IGN1c3RvbWl6YXRpb25JZChwcm90b2NvbFVyaSksXG5cdFx0XHR1cmk6IHByb3RvY29sVXJpLFxuXHRcdFx0bmFtZTogZGlyZWN0b3J5Lm5hbWUsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0Y29udGVudHM6IHRvRGlyZWN0b3J5Q29udGVudHNUeXBlKGRpcmVjdG9yeS50eXBlKSxcblx0XHRcdHdyaXRhYmxlOiBkaXJlY3Rvcnkud3JpdGFibGUsIC8vIHdoZXRoZXIgdGhlIG5ldyBjdXN0b21pemF0aW9uIGNhbiBiZSBjcmVhdGVkIGluIHRoaXMgZGlyZWN0b3J5XG5cdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0Y2hpbGRyZW46IGF3YWl0IFByb21pc2UuYWxsKGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiB0b0Rpc2NvdmVyZWRDaGlsZEN1c3RvbWl6YXRpb24oZmlsZS51cmksIGRpcmVjdG9yeS50eXBlLCBmaWxlU2VydmljZSkpKSxcblx0XHR9O1xuXHR9KSk7XG59XG5cbmZ1bmN0aW9uIHRvRGlyZWN0b3J5Q29udGVudHNUeXBlKHR5cGU6IERpc2NvdmVyZWRUeXBlKTogQ2hpbGRDdXN0b21pemF0aW9uVHlwZSB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuQWdlbnQ6XG5cdFx0XHRyZXR1cm4gQ3VzdG9taXphdGlvblR5cGUuQWdlbnQ7XG5cdFx0Y2FzZSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbDpcblx0XHRcdHJldHVybiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbDtcblx0XHRjYXNlIERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uOlxuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbjpcblx0XHRcdHJldHVybiBDdXN0b21pemF0aW9uVHlwZS5SdWxlO1xuXHRcdGNhc2UgRGlzY292ZXJlZFR5cGUuSG9vazpcblx0XHRcdHJldHVybiBDdXN0b21pemF0aW9uVHlwZS5Ib29rO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHRvRGlzY292ZXJlZENoaWxkQ3VzdG9taXphdGlvbihmaWxlOiBVUkksIHR5cGU6IERpc2NvdmVyZWRUeXBlLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxDaGlsZEN1c3RvbWl6YXRpb24+IHtcblx0Y29uc3QgdXJpID0gZmlsZS50b1N0cmluZygpO1xuXHRjb25zdCBpZCA9IGN1c3RvbWl6YXRpb25JZCh1cmkpO1xuXHRpZiAodHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuQWdlbnQpIHtcblx0XHRjb25zdCBhZ2VudEluZm8gPSBhd2FpdCBwYXJzZUFnZW50RmlsZShmaWxlLCBmaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgYWdlbnRDdXN0b21pemF0aW9uOiBBZ2VudEN1c3RvbWl6YXRpb24gPSB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRcdGlkLFxuXHRcdFx0dXJpLFxuXHRcdFx0bmFtZTogYWdlbnRJbmZvLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogYWdlbnRJbmZvLmRlc2NyaXB0aW9uLFxuXHRcdH0gc2F0aXNmaWVzIEFnZW50Q3VzdG9taXphdGlvbjtcblx0XHRpZiAoYWdlbnRJbmZvLnVzZXJJbnZvY2FibGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YWdlbnRDdXN0b21pemF0aW9uLl9tZXRhID0geyB1c2VySW52b2NhYmxlOiBhZ2VudEluZm8udXNlckludm9jYWJsZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gYWdlbnRDdXN0b21pemF0aW9uO1xuXHR9XG5cdGlmICh0eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCkge1xuXHRcdGNvbnN0IHNraWxsSW5mbyA9IGF3YWl0IHBhcnNlU2tpbGxGaWxlKGZpbGUsIGZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBza2lsbEN1c3RvbWl6YXRpb246IFNraWxsQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLFxuXHRcdFx0aWQsXG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lOiBza2lsbEluZm8ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBza2lsbEluZm8uZGVzY3JpcHRpb24sXG5cdFx0fTtcblx0XHRyZXR1cm4gc2tpbGxDdXN0b21pemF0aW9uO1xuXHR9XG5cdGlmICh0eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbikge1xuXHRcdGNvbnN0IHJ1bGVJbmZvID0gYXdhaXQgcGFyc2VSdWxlRmlsZShmaWxlLCBmaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgcnVsZUN1c3RvbWl6YXRpb246IFJ1bGVDdXN0b21pemF0aW9uID0ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSxcblx0XHRcdGlkLFxuXHRcdFx0dXJpLFxuXHRcdFx0bmFtZTogcnVsZUluZm8ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBydWxlSW5mby5kZXNjcmlwdGlvbixcblx0XHRcdGdsb2JzOiBydWxlSW5mby5nbG9icyxcblx0XHRcdGFsd2F5c0FwcGx5OiBydWxlSW5mby5hbHdheXNBcHBseSxcblx0XHR9O1xuXHRcdHJldHVybiBydWxlQ3VzdG9taXphdGlvbjtcblx0fVxuXHRpZiAodHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaykge1xuXHRcdGNvbnN0IGhvb2tDdXN0b21pemF0aW9uOiBIb29rQ3VzdG9taXphdGlvbiA9IHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssXG5cdFx0XHRpZCxcblx0XHRcdHVyaSxcblx0XHRcdG5hbWU6IHJlc291cmNlQmFzZW5hbWUoZmlsZSksXG5cdFx0fTtcblx0XHRyZXR1cm4gaG9va0N1c3RvbWl6YXRpb247XG5cdH1cblx0Ly8gYWdlbnQgaW5zdHJ1Y3Rpb25cblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdGFsd2F5c0FwcGx5OiB0cnVlLFxuXHRcdGlkLFxuXHRcdHVyaSxcblx0XHRuYW1lOiByZXNvdXJjZUJhc2VuYW1lKGZpbGUpLFxuXHR9O1xufVxuXG5cbi8qKlxuICogUHJvamVjdHMgYWxyZWFkeS1wYXJzZWQgZGlzY292ZXJlZCBjdXN0b21pemF0aW9ucyBpbnRvIGFuIGluLW1lbW9yeVxuICoge0BsaW5rIElQYXJzZWRQbHVnaW59IHdoaWxlIHByZXNlcnZpbmcgb3JpZ2luYWwgc291cmNlIFVSSXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBUb1BhcnNlZFBsdWdpbihjdXN0b21pemF0aW9uczogcmVhZG9ubHkgRGlyZWN0b3J5Q3VzdG9taXphdGlvbltdKTogSVBhcnNlZFBsdWdpbiB8IHVuZGVmaW5lZCB7XG5cdGlmIChjdXN0b21pemF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgYWdlbnRzOiBJUGFyc2VkQWdlbnRbXSA9IFtdO1xuXHRjb25zdCBza2lsbHM6IElQYXJzZWRTa2lsbFtdID0gW107XG5cdGNvbnN0IGluc3RydWN0aW9uczogSVBhcnNlZFJ1bGVbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgZGlyZWN0b3J5IG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBkaXJlY3RvcnkuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCkge1xuXHRcdFx0XHRhZ2VudHMucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY2hpbGQudXJpKSxcblx0XHRcdFx0XHRuYW1lOiBjaGlsZC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjaGlsZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uOiBjaGlsZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuU2tpbGwpIHtcblx0XHRcdFx0c2tpbGxzLnB1c2goe1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGNoaWxkLnVyaSksXG5cdFx0XHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY2hpbGQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbjogY2hpbGQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUpIHtcblx0XHRcdFx0aWYgKGNoaWxkLmFsd2F5c0FwcGx5ICYmIGNoaWxkLm5hbWUubWF0Y2goL1xcLm1kJC9pKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBhZ2VudCBpbnN0cnVjdGlvblxuXHRcdFx0XHR9XG5cdFx0XHRcdGluc3RydWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjaGlsZC51cmkpLFxuXHRcdFx0XHRcdG5hbWU6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNoaWxkLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IGNoaWxkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoYWdlbnRzLmxlbmd0aCA9PT0gMCAmJiBza2lsbHMubGVuZ3RoID09PSAwICYmIGluc3RydWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRcdGhvb2tzOiBbXSxcblx0XHRtY3BTZXJ2ZXJzOiBbXSxcblx0XHRza2lsbHM6IHNraWxscyxcblx0XHRhZ2VudHM6IGFnZW50cyxcblx0XHRpbnN0cnVjdGlvbnM6IGluc3RydWN0aW9ucyxcblx0fTtcbn1cblxuLyoqXG4gKiBQcm9jZXNzLXdpZGUgcGx1Z2luIHN0YXRlIHNoYXJlZCBhY3Jvc3MgYWxsIHNlc3Npb25zLlxuICpcbiAqIE93bnM6XG4gKiAgLSBob3N0LWNvbmZpZ3VyZWQgY3VzdG9taXphdGlvbnMgKHJlYWQgZnJvbSByb290IGNvbmZpZywgd2F0Y2hlZCwgcGFyc2VkKVxuICogIC0gdGhlIHtAbGluayBJQWdlbnRQbHVnaW5NYW5hZ2VyfSB0aGF0IG1hdGVyaWFsaXplcyBwbHVnaW4gc291cmNlIFVSSXNcbiAqICAgIGludG8gYSBub25jZS1kZWR1cGVkIG9uLWRpc2sgY2FjaGUgKG9uZSBzaGFyZWQgZGlyZWN0b3J5IGZvciBhbGxcbiAqICAgIHNlc3Npb25zIGFuZCBjbGllbnRzKVxuICogIC0gcGFyc2luZyArIHJlc29sdXRpb24gaGVscGVycyB1c2VkIGJ5IGJvdGggaG9zdC0gYW5kIGNsaWVudC1zaWRlXG4gKiAgICBjdXN0b21pemF0aW9uc1xuICpcbiAqIFBlci1zZXNzaW9uIHN0YXRlIChjbGllbnQtcHVibGlzaGVkIGN1c3RvbWl6YXRpb25zIGFuZCBvbi1kaXNrXG4gKiBjdXN0b21pemF0aW9uIGRpc2NvdmVyeSBmb3IgdGhlIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSkgbGl2ZXMgb24ge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyfSxcbiAqIG9uZSBwZXIge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259LiBFYWNoIHNlc3Npb24gY29udHJvbGxlciBob2xkc1xuICogYSByZWZlcmVuY2UgYmFjayB0byB0aGlzIHNoYXJlZCBjb250cm9sbGVyIGZvciB0aGUgcmVzb2x2ZS9zeW5jXG4gKiBoZWxwZXJzIGl0IG5lZWRzLlxuICovXG5jbGFzcyBQbHVnaW5Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKiBGaXJlcyB3aGVuIGhvc3QgY3VzdG9taXphdGlvbnMgY2hhbmdlLiBTZXNzaW9uIGNvbnRyb2xsZXJzIGZvcndhcmQgdGhpcy4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9ob3N0Q3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElSZXNvbHZlZEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9ob3N0U3luYzogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uW10+ID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblx0cHJpdmF0ZSBfaG9zdFJldmlzaW9uID0gMDtcblx0cHJpdmF0ZSBfbGFzdEFwcGxpZWRSZWZzOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRDbGllbnQ6ICgpID0+IFByb21pc2U8Q29waWxvdENsaWVudD4sXG5cdFx0QElBZ2VudFBsdWdpbk1hbmFnZXIgcHVibGljIHJlYWRvbmx5IHBsdWdpbk1hbmFnZXI6IElBZ2VudFBsdWdpbk1hbmFnZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBTZWVkIGZyb20gY3VycmVudCByb290IGNvbmZpZyBhbmQgc3Vic2NyaWJlIHRvIGZ1dHVyZSBjaGFuZ2VzLlxuXHRcdHRoaXMuX2FwcGx5SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2FwcGx5SG9zdEN1c3RvbWl6YXRpb25zKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldENvbmZpZ3VyZWRIb3N0Q3VzdG9taXphdGlvbnMoKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zLm1hcChpdGVtID0+IGl0ZW0uY3VzdG9taXphdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlKCk6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3QgdGhlIHJlc29sdmVkIGhvc3QgY3VzdG9taXphdGlvbnMgKGxvYWRpbmcgb3IgbG9hZGVkKS4gVXNlZCBieVxuXHQgKiB7QGxpbmsgU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJ9IHRvIGNvbXBvc2UgaXRzIHBlci1zZXNzaW9uIHZpZXcuXG5cdCAqL1xuXHRwdWJsaWMgaG9zdEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IElSZXNvbHZlZEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucztcblx0fVxuXG5cdC8qKiBJbi1mbGlnaHQgaG9zdCBzeW5jOyBhd2FpdGVkIGJ5IGBnZXRDdXN0b21pemF0aW9uc1NldHRsZWRgIGNvbnN1bWVycy4gKi9cblx0cHVibGljIGhvc3RTeW5jKCk6IFByb21pc2U8cmVhZG9ubHkgSVJlc29sdmVkQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvc3RTeW5jO1xuXHR9XG5cblx0cHVibGljIGdldFVzZXJIb21lKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRDbGllbnQoKTogUHJvbWlzZTxDb3BpbG90Q2xpZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldENsaWVudCgpO1xuXHR9XG5cblx0LyoqIENyZWF0ZXMgYSBwZXItc2Vzc2lvbiBjb250cm9sbGVyIHRoYXQgcmVhZHMgaG9zdC1jdXN0b21pemF0aW9uIHN0YXRlIGxhemlseS4gKi9cblx0cHVibGljIGNyZWF0ZVNlc3Npb25Db250cm9sbGVyKHNlc3Npb246IFVSSSwgZGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIGhvc3RDdXN0b21pemF0aW9uczogKCkgPT4gcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXIge1xuXHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQ29udHJvbGxlciwgdGhpcywgc2Vzc2lvbiwgZGlyZWN0b3J5LCBob3N0Q3VzdG9taXphdGlvbnMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBjdXJyZW50IGhvc3QgY3VzdG9taXphdGlvbnMgZnJvbSB0aGUgcm9vdCBjb25maWcgYW5kXG5cdCAqIHJlc29sdmVzIHRoZW0uIFNraXBzIHRoZSB1cGRhdGUgd2hlbiB0aGUgY29uZmlndXJlZCByZWZzIGhhdmUgbm90XG5cdCAqIGNoYW5nZWQgc2luY2UgdGhlIGxhc3QgYXBwbGljYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseUhvc3RDdXN0b21pemF0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5DdXN0b21pemF0aW9ucykgPz8gW107XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBlbnRyaWVzLm1hcCh0b0NvbnRhaW5lckN1c3RvbWl6YXRpb24pO1xuXHRcdGlmIChlcXVhbHMoY3VzdG9taXphdGlvbnMsIHRoaXMuX2xhc3RBcHBsaWVkUmVmcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdEFwcGxpZWRSZWZzID0gY3VzdG9taXphdGlvbnM7XG5cblx0XHRjb25zdCByZXZpc2lvbiA9ICsrdGhpcy5faG9zdFJldmlzaW9uO1xuXHRcdHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucyA9IGN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdC4uLmN1c3RvbWl6YXRpb24sXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGluZyB9LFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdHRoaXMuX2hvc3RTeW5jID0gUHJvbWlzZS5hbGwoY3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gdGhpcy5yZXNvbHZlQ29uZmlndXJlZEN1c3RvbWl6YXRpb24oY3VzdG9taXphdGlvbikpKS50aGVuKHJlc29sdmVkID0+IHtcblx0XHRcdGlmIChyZXZpc2lvbiA9PT0gdGhpcy5faG9zdFJldmlzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucyA9IHJlc29sdmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHJldmlzaW9uID09PSB0aGlzLl9ob3N0UmV2aXNpb24pIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlc29sdmVDb25maWd1cmVkQ3VzdG9taXphdGlvbihjdXN0b21pemF0aW9uOiBQbHVnaW5DdXN0b21pemF0aW9uKTogUHJvbWlzZTxJUmVzb2x2ZWRDdXN0b21pemF0aW9uPiB7XG5cdFx0Y29uc3QgcGx1Z2luRGlyID0gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRjb25zdCBwYXJzZWQgPSBhd2FpdCB0aGlzLnRyeVBhcnNlUGx1Z2luKHBsdWdpbkRpcik7XG5cdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHQuLi5jdXN0b21pemF0aW9uLFxuXHRcdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuRXJyb3IsIG1lc3NhZ2U6IGxvY2FsaXplKCdjb3BpbG90QWdlbnQucGx1Z2luUGFyc2VFcnJvcicsIFwiRXJyb3IgcGFyc2luZyBwbHVnaW4uXCIpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjdXN0b21pemF0aW9uOiB7XG5cdFx0XHRcdC4uLmN1c3RvbWl6YXRpb24sXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiB0b0NoaWxkQ3VzdG9taXphdGlvbnMoW3BhcnNlZF0pLFxuXHRcdFx0fSxcblx0XHRcdHBsdWdpbkRpcixcblx0XHRcdHBsdWdpbjogcGFyc2VkLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzb2x2ZVN5bmNlZEN1c3RvbWl6YXRpb24oaXRlbTogSVN5bmNlZEN1c3RvbWl6YXRpb24sIGNsaWVudElkOiBzdHJpbmcsIGlucHV0OiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUmVzb2x2ZWRDdXN0b21pemF0aW9uPiB7XG5cdFx0Y29uc3QgYmFzZUN1c3RvbWl6YXRpb246IFBsdWdpbkN1c3RvbWl6YXRpb24gPSB7IC4uLml0ZW0uY3VzdG9taXphdGlvbiwgY2xpZW50SWQgfTtcblx0XHRpZiAoIWl0ZW0ucGx1Z2luRGlyKSB7XG5cdFx0XHRyZXR1cm4geyBjdXN0b21pemF0aW9uOiBiYXNlQ3VzdG9taXphdGlvbiwgaW5wdXQgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWQgPSBhd2FpdCB0aGlzLnRyeVBhcnNlUGx1Z2luKGl0ZW0ucGx1Z2luRGlyKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHRcdC4uLmJhc2VDdXN0b21pemF0aW9uLFxuXHRcdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuRXJyb3IsIG1lc3NhZ2U6IGxvY2FsaXplKCdjb3BpbG90QWdlbnQucGx1Z2luUGFyc2VFcnJvcicsIFwiRXJyb3IgcGFyc2luZyBwbHVnaW4uXCIpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlucHV0LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHQuLi5iYXNlQ3VzdG9taXphdGlvbixcblx0XHRcdFx0Y2hpbGRyZW46IHRvQ2hpbGRDdXN0b21pemF0aW9ucyhbcGFyc2VkXSksXG5cdFx0XHR9LFxuXHRcdFx0cGx1Z2luRGlyOiBpdGVtLnBsdWdpbkRpcixcblx0XHRcdHBsdWdpbjogcGFyc2VkLFxuXHRcdFx0aW5wdXQsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0cnlQYXJzZVBsdWdpbihwbHVnaW5EaXI6IFVSSSk6IFByb21pc2U8SVBhcnNlZFBsdWdpbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcGFyc2VQbHVnaW4ocGx1Z2luRGlyLCB0aGlzLl9maWxlU2VydmljZSwgdW5kZWZpbmVkLCB0aGlzLmdldFVzZXJIb21lKCksIHBsdWdpbkRpcik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6UGx1Z2luQ29udHJvbGxlcl0gRXJyb3IgcGFyc2luZyBwbHVnaW4gJyR7cGx1Z2luRGlyLnRvU3RyaW5nKCl9JzogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFBlci1jbGllbnQgc2xpY2Ugb2Yge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyfSBjdXN0b21pemF0aW9uIHN0YXRlLlxuICogT25lIGVudHJ5IGV4aXN0cyBwZXIgYWN0aXZlIGNsaWVudCB0aGF0IGhhcyBjb250cmlidXRlZCBjdXN0b21pemF0aW9ucyB0b1xuICogdGhlIHNlc3Npb24uXG4gKi9cbmludGVyZmFjZSBJQ2xpZW50Q3VzdG9taXphdGlvblN0YXRlIHtcblx0LyoqIE1vbm90b25pYyByZXZpc2lvbiB1c2VkIHRvIGRldGVjdCBhbmQgaWdub3JlIHN0YWxlIGluLWZsaWdodCBzeW5jcyBmb3IgdGhpcyBjbGllbnQuICovXG5cdHJldmlzaW9uOiBudW1iZXI7XG5cdC8qKiBUaGlzIGNsaWVudCdzIHJlc29sdmVkIGN1c3RvbWl6YXRpb25zIChMb2FkaW5nL0xvYWRlZC9FcnJvciBwZXIgaXRlbSkuICovXG5cdGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBJUmVzb2x2ZWRDdXN0b21pemF0aW9uW107XG5cdC8qKiBUaGlzIGNsaWVudCdzIGluLWZsaWdodCAob3Igc2V0dGxlZCkgc3luYyBwcm9taXNlLiAqL1xuXHRzeW5jOiBQcm9taXNlPHJlYWRvbmx5IElSZXNvbHZlZEN1c3RvbWl6YXRpb25bXT47XG5cdC8qKiBUaGUgcmF3IGlucHV0cyBsYXN0IHBhc3NlZCB0byB7QGxpbmsgU2Vzc2lvblBsdWdpbkNvbnRyb2xsZXIuc3luY30gZm9yIHRoaXMgY2xpZW50LiAqL1xuXHRpbnB1dHM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXTtcbn1cblxuLyoqIFBlci1zZXNzaW9uIHBsdWdpbi9jdXN0b21pemF0aW9uIHZpZXcgdGhhdCBwdWJsaXNoZXMgc2Vzc2lvbi1zY29wZWQgYWN0aW9ucy4gKi9cbmNsYXNzIFNlc3Npb25QbHVnaW5Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUHVibGlzaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNlc3Npb25BY3Rpb24+KCkpO1xuXHQvKiogUGVyLXNlc3Npb24gYWN0aW9uIHN0cmVhbSAocmVzZXQgKyBwZXItaXRlbSB1cGRhdGVzKS4gKi9cblx0cmVhZG9ubHkgb25EaWRQdWJsaXNoID0gdGhpcy5fb25EaWRQdWJsaXNoLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVtZW50UmVhZHk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgX2lzRW5hYmxlbWVudFJlYWR5ID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlvdXNEaXJlY3RvcmllczogVVJJW10gPSBbXTtcblx0cHJpdmF0ZSBfaW5kZXhlZERlc2lyZWRDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNpcmVkQ3VzdG9taXphdGlvbkJ5SWQgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbj4oKTtcblx0LyoqIExpdmUgTUNQIHNlcnZlciBydW50aW1lIHN0YXRlIG92ZXJsYWlkIG9udG8gcHVibGlzaGVkIGN1c3RvbWl6YXRpb25zIGFjcm9zcyByZS1zeW5jcy4gKi9cblx0cHVibGljIHJlYWRvbmx5IG1jcFNlcnZlclN0YXRlczogSVNldHRhYmxlT2JzZXJ2YWJsZTxSZWFkb25seU1hcDxzdHJpbmcsIElNY3BTZXJ2ZXJSdW50aW1lU3RhdGU+PiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBuZXcgTWFwKCkpO1xuXHQvKiogUGVyLWNsaWVudCBjdXN0b21pemF0aW9uIHN0YXRlOyBwdWJsaXNoZWQgY3VzdG9taXphdGlvbnMgYXJlIHRoZSBzdGFibGUgZmlyc3Qtd2lucyB1bmlvbiBvZiB0aGVzZSBlbnRyaWVzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnRzID0gbmV3IE1hcDxzdHJpbmcsIElDbGllbnRDdXN0b21pemF0aW9uU3RhdGU+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc2NvdmVyZWQ6IE11dGFibGVEaXNwb3NhYmxlPFNlc3Npb25EaXNjb3ZlcmVkRW50cnk+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBBZGRpdGlvbmFsIG11bHRpLXJvb3Qgd29ya3NwYWNlIGZvbGRlcnMgKHJvb3RzIDEuLk4pOyB0aGUgcHJpbWFyeSByb290IGlzIHRyYWNrZWQgc2VwYXJhdGVseS4gKi9cblx0cHJpdmF0ZSBfYWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudDogUGx1Z2luQ29udHJvbGxlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBVUkksXG5cdFx0cHJpdmF0ZSBfZGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0LyoqIFJlYWRzIHRoZSByZXRhaW5lZCBob3N0IHNuYXBzaG90IHVzZWQgdG8gcHJvamVjdCBwZXItY3VzdG9taXphdGlvbiBlbmFibGVtZW50LiAqL1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3RDdXN0b21pemF0aW9uczogKCkgPT4gcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VuYWJsZW1lbnRSZWFkeSA9IHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5pbml0aWFsaXplU2Vzc2lvbih0aGlzLl9zZXNzaW9uLnRvU3RyaW5nKCkpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNFbmFibGVtZW50UmVhZHkgPSB0cnVlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBkaXJlY3RvcnkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqIFRoZSBhZGRpdGlvbmFsIChub24tcHJpbWFyeSkgcm9vdHMgYXR0YWNoZWQgdG8gY3VzdG9taXphdGlvbiBkaXNjb3ZlcnkuICovXG5cdHB1YmxpYyBnZXQgYWRkaXRpb25hbERpcmVjdG9yaWVzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFuY2hvciAob3IgcmUtYW5jaG9yKSB0aGUgc2Vzc2lvbidzIGN1c3RvbWl6YXRpb24gZGlyZWN0b3J5LlxuXHQgKiBPbmx5IGV2ZXIgdHJhbnNpdGlvbnMgZnJvbSBgdW5kZWZpbmVkYCBcdTIxOTIgc2V0OyBvbmNlIGEgZGlyZWN0b3J5IGhhc1xuXHQgKiBiZWVuIGJvdW5kIHRoZSBkaXNjb3ZlcmVkIGVudHJ5IGlzIHBpbm5lZCB0byBpdCBmb3IgdGhlIHJlbWFpbmRlclxuXHQgKiBvZiB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHB1YmxpYyBzZXREaXJlY3RvcnkoZGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlyZWN0b3J5IHx8ICFkaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlyZWN0b3J5ID0gZGlyZWN0b3J5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgYWRkaXRpb25hbCAobm9uLXByaW1hcnkpIHdvcmtzcGFjZSByb290cy4gUmVjcmVhdGVzIHRoZSBkaXNjb3ZlcmVkXG5cdCAqIGVudHJ5IHdoZW4gdGhlIHNldCBhY3R1YWxseSBjaGFuZ2VzIHNvIGRpc2NvdmVyeSByZS1zY2FucyBldmVyeSByb290IFx1MjAxNFxuXHQgKiBpbXBvcnRhbnQgd2hlbiB0aGlzIGlzIHNldCBhZnRlciBhIHByaW1hcnktb25seSBlbnRyeSB3YXMgYWxyZWFkeSBjcmVhdGVkXG5cdCAqIChlLmcuIG9uIHJlc3VtZSkuIEEgbm8tb3AgZm9yIHRoZSBzaW5nbGUtcm9vdCBjYXNlIChlbXB0eSB0YWlsKS5cblx0ICovXG5cdHB1YmxpYyBzZXRBZGRpdGlvbmFsRGlyZWN0b3JpZXMoZGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FkZGl0aW9uYWxEaXJlY3Rvcmllcy5sZW5ndGggPT09IGRpcmVjdG9yaWVzLmxlbmd0aFxuXHRcdFx0JiYgdGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzLmV2ZXJ5KChkLCBpKSA9PiBpc0VxdWFsKGQsIGRpcmVjdG9yaWVzW2ldKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzID0gZGlyZWN0b3JpZXM7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlIHRoZSBzZXNzaW9uJ3MgY3VzdG9taXphdGlvbiBhbmNob3IgdG8gYSBuZXcgZGlyZWN0b3J5IChlLmcuIGZyb20gdGhlXG5cdCAqIHVzZXItcGlja2VkIGZvbGRlciB0byB0aGUgd29ya3RyZWUgYXQgbWF0ZXJpYWxpemF0aW9uKS4gUmVjcmVhdGVzIHRoZVxuXHQgKiBkaXNjb3ZlcmVkIGVudHJ5IHNvIGRpc2NvdmVyeS93YXRjaGVycyByZS1zY2FuIHRoZSBuZXcgZGlyZWN0b3J5LlxuXHQgKi9cblx0cHVibGljIHJlYW5jaG9yKGRpcmVjdG9yeTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpcmVjdG9yeSAmJiBpc0VxdWFsKHRoaXMuX2RpcmVjdG9yeSwgZGlyZWN0b3J5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX2RpcmVjdG9yeTtcblx0XHR0aGlzLl9kaXJlY3RvcnkgPSBkaXJlY3Rvcnk7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQuY2xlYXIoKTtcblx0XHRpZiAocHJldmlvdXMgJiYgIXRoaXMuX3ByZXZpb3VzRGlyZWN0b3JpZXMuc29tZShjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUsIHByZXZpb3VzKSkpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRGlyZWN0b3JpZXMucHVzaChwcmV2aW91cyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudCgpLmN1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVUb3BMZXZlbE1jcEN1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10sIG1jcFNlcnZlck93bmVycz86IFJlYWRvbmx5TWFwPHN0cmluZywgc3RyaW5nPik6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudCh0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX3Nlc3Npb24sIGN1c3RvbWl6YXRpb25zLCB0aGlzLl9jbGllbnRDaGlsZEVuYWJsZW1lbnQoKSwgdW5kZWZpbmVkLCBtY3BTZXJ2ZXJPd25lcnMpLmN1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KCkge1xuXHRcdGNvbnN0IHJlc3VsdDogQ3VzdG9taXphdGlvbltdID0gW1xuXHRcdFx0Li4udGhpcy5fcGFyZW50Lmhvc3RDdXN0b21pemF0aW9ucygpLm1hcChpdGVtID0+IHRoaXMuX3Byb2plY3RGb3JQdWJsaXNoKGl0ZW0uY3VzdG9taXphdGlvbikpLFxuXHRcdFx0Li4udGhpcy5fZmxhdHRlbkNsaWVudEN1c3RvbWl6YXRpb25zKCkubWFwKGl0ZW0gPT4gdGhpcy5fcHJvamVjdEZvclB1Ymxpc2goaXRlbS5jdXN0b21pemF0aW9uKSksXG5cdFx0XTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Rpc2NvdmVyZWRFbnRyeSgpO1xuXHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBlbnRyeT8uY3VycmVudEN1c3RvbWl6YXRpb25zKCkgPz8gW107XG5cdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGRpc2NvdmVyZWQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuX3Byb2plY3RGb3JQdWJsaXNoKGN1c3RvbWl6YXRpb24pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudCh0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIHRoaXMuX3Nlc3Npb24sIHJlc3VsdCwgdGhpcy5fY2xpZW50Q2hpbGRFbmFibGVtZW50KCksIHRoaXMuX2NsaWVudFBsdWdpbnMoKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHVuaW9uIG9mIGV2ZXJ5IGFjdGl2ZSBjbGllbnQncyByZXNvbHZlZCBjdXN0b21pemF0aW9ucyxcblx0ICogZGVkdXBsaWNhdGVkIGJ5IFVSSSB3aXRoIHRoZSBmaXJzdC1pbnNlcnRlZCBjbGllbnQgd2lubmluZy4gT3JkZXJcblx0ICogZm9sbG93cyBjbGllbnQgaW5zZXJ0aW9uIG9yZGVyLCB0aGVuIHBlci1jbGllbnQgb3JkZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9mbGF0dGVuQ2xpZW50Q3VzdG9taXphdGlvbnMoKTogcmVhZG9ubHkgSVJlc29sdmVkQ3VzdG9taXphdGlvbltdIHtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJUmVzb2x2ZWRDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNsaWVudCBvZiB0aGlzLl9jbGllbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY2xpZW50LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRcdGlmIChzZWVuLmhhcyhpdGVtLmN1c3RvbWl6YXRpb24udXJpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKGl0ZW0uY3VzdG9taXphdGlvbi51cmkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXR0bGVkIHZhcmlhbnQgb2Yge0BsaW5rIGdldEN1c3RvbWl6YXRpb25zfTogYXdhaXRzIHRoZSBpbi1mbGlnaHRcblx0ICogaG9zdCBzeW5jLCBldmVyeSBpbi1mbGlnaHQgY2xpZW50IHN5bmMsIGFuZCB0aGUgZGlzY292ZXJlZCBlbnRyeSdzXG5cdCAqIGluaXRpYWwgc2NhbiArIHBhcnNlIGJlZm9yZSBzbmFwc2hvdHRpbmcgdGhlIGxpc3QuIENhbGxlcnMgdGhhdFxuXHQgKiBwdWJsaXNoIGN1c3RvbWl6YXRpb25zIGludG8gc2Vzc2lvbiBzdGF0ZSBhdCBzZXNzaW9uIGNyZWF0aW9uIHRpbWVcblx0ICogTVVTVCB1c2UgdGhpcyBcdTIwMTQgdGhlIHN5bmNocm9ub3VzIHZhcmlhbnQgY2FuIHJldHVybiBhbiBlbXB0eSBsaXN0XG5cdCAqIGZvciBhIGJyYW5kLW5ldyB3b3JraW5nIGRpcmVjdG9yeSBiZWNhdXNlIHtAbGluayBTZXNzaW9uRGlzY292ZXJlZEVudHJ5fVxuXHQgKiBraWNrcyBvZmYgaXRzIGBfcmVmcmVzaCgpYCB3aXRob3V0IGFueW9uZSBhd2FpdGluZyBpdC5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRDdXN0b21pemF0aW9uc1NldHRsZWQoKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10+IHtcblx0XHRhd2FpdCB0aGlzLl9lbmFibGVtZW50UmVhZHk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9kaXNjb3ZlcmVkRW50cnkoKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLl9wYXJlbnQuaG9zdFN5bmMoKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gSG9zdCBjdXN0b21pemF0aW9uIHVwZGF0ZSBmYWlsZWQnLCBlcnIpKSxcblx0XHRcdC4uLlsuLi50aGlzLl9jbGllbnRzLnZhbHVlcygpXS5tYXAoY2xpZW50ID0+IGNsaWVudC5zeW5jLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDb3BpbG90OlNlc3Npb25QbHVnaW5Db250cm9sbGVyXSBDbGllbnQgY3VzdG9taXphdGlvbiBzeW5jIGZhaWxlZCcsIGVycikpKSxcblx0XHRcdGVudHJ5Py53aGVuU2V0dGxlZCgpLFxuXHRcdF0pO1xuXHRcdHJldHVybiB0aGlzLmdldEN1c3RvbWl6YXRpb25zKCk7XG5cdH1cblxuXHQvKiogUmV0dXJucyB0aGUgcGFyc2VkIHBsdWdpbnMgY3VycmVudGx5IGVuYWJsZWQgZm9yIHRoaXMgc2Vzc2lvbiwgYXdhaXRpbmcgYW55IHBlbmRpbmcgc3luYy4gKi9cblx0cHVibGljIGFzeW5jIGdldEFwcGxpZWRQbHVnaW5zKCk6IFByb21pc2U8cmVhZG9ubHkgSUNvcGlsb3RQbHVnaW5JbmZvW10+IHtcblx0XHRhd2FpdCB0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24odGhpcy5fc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Rpc2NvdmVyZWRFbnRyeSgpO1xuXHRcdGNvbnN0IFtob3N0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3BhcmVudC5ob3N0U3luYygpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3Q6U2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJdIEhvc3QgY3VzdG9taXphdGlvbiB1cGRhdGUgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3BhcmVudC5ob3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRcdH0pLFxuXHRcdFx0Li4uWy4uLnRoaXMuX2NsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnN5bmMuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gQ2xpZW50IGN1c3RvbWl6YXRpb24gc3luYyBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gY2xpZW50LmN1c3RvbWl6YXRpb25zO1xuXHRcdFx0fSkpLFxuXHRcdFx0ZW50cnk/LndoZW5TZXR0bGVkKCksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX3Jlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudCgpO1xuXHRcdGNvbnN0IGRlc2lyZWRCeVVyaSA9IG5ldyBNYXAocmVzb2x2ZWQuY3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gW2N1c3RvbWl6YXRpb24udXJpLCBjdXN0b21pemF0aW9uXSkpO1xuXHRcdGNvbnN0IG1jcEVuYWJsZW1lbnQgPSBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc29sdmVkKTtcblx0XHRjb25zdCBpc0VuYWJsZWRGb3JTZGsgPSAoY3VzdG9taXphdGlvbjogQ3VzdG9taXphdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgZGVzaXJlZCA9IGRlc2lyZWRCeVVyaS5nZXQoY3VzdG9taXphdGlvbi51cmkpID8/IGN1c3RvbWl6YXRpb247XG5cdFx0XHRyZXR1cm4gaXNDdXN0b21pemF0aW9uU2RrRWxpZ2libGUocmVzb2x2ZWQsIGRlc2lyZWQpICYmIChkZXNpcmVkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSA/IGRlc2lyZWQuZW5hYmxlZCA6IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoZGVzaXJlZCkpO1xuXHRcdH07XG5cdFx0Y29uc3QgZGlzYWJsZWRDaGlsZHJlbiA9IChjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uKTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgZGVzaXJlZCA9IGRlc2lyZWRCeVVyaS5nZXQoY3VzdG9taXphdGlvbi51cmkpO1xuXHRcdFx0Y29uc3QgY2hpbGRyZW4gPSBkZXNpcmVkICYmIGRlc2lyZWQudHlwZSAhPT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXG5cdFx0XHRcdD8gZGVzaXJlZC5jaGlsZHJlbj8uZmlsdGVyKGNoaWxkID0+IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlciAmJiAhbWNwRW5hYmxlbWVudC5nZXQoY2hpbGQuaWQpKS5tYXAoY2hpbGQgPT4gY2hpbGQubmFtZSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gY2hpbGRyZW4/Lmxlbmd0aCA/IGNoaWxkcmVuIDogdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0Y29uc3QgZGlzY292ZXJlZCA9IGVudHJ5Py5jdXJyZW50Q3VzdG9taXphdGlvbnMoKSA/PyBbXTtcblx0XHRjb25zdCBzZXNzaW9uUGx1Z2luID0gZGlzY292ZXJlZC5zb21lKGlzRW5hYmxlZEZvclNkaykgPyBtYXBUb1BhcnNlZFBsdWdpbihkaXNjb3ZlcmVkKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZXNzaW9uUGx1Z2luczogSVBhcnNlZFBsdWdpbltdID0gc2Vzc2lvblBsdWdpbiA/IFtzZXNzaW9uUGx1Z2luXSA6IFtdO1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLmhvc3QuZmlsdGVyKGl0ZW0gPT4gISFpdGVtLnBsdWdpbiAmJiBpc0VuYWJsZWRGb3JTZGsoaXRlbS5jdXN0b21pemF0aW9uKSlcblx0XHRcdFx0Lm1hcChpdGVtID0+ICh7IC4uLml0ZW0ucGx1Z2luISwgcGx1Z2luRGlyOiBpdGVtLnBsdWdpbkRpciwgc291cmNlVXJpOiBVUkkucGFyc2UoaXRlbS5jdXN0b21pemF0aW9uLnVyaSksIC4uLihkaXNhYmxlZENoaWxkcmVuKGl0ZW0uY3VzdG9taXphdGlvbikgPyB7IGRpc2FibGVkTWNwU2VydmVyczogZGlzYWJsZWRDaGlsZHJlbihpdGVtLmN1c3RvbWl6YXRpb24pIH0gOiB7fSkgfSkpLFxuXHRcdFx0Li4udGhpcy5fZmxhdHRlbkNsaWVudEN1c3RvbWl6YXRpb25zKCkuZmlsdGVyKGl0ZW0gPT4gISFpdGVtLnBsdWdpbiAmJiBpc0VuYWJsZWRGb3JTZGsoaXRlbS5jdXN0b21pemF0aW9uKSlcblx0XHRcdFx0Lm1hcChpdGVtID0+ICh7IC4uLml0ZW0ucGx1Z2luISwgcGx1Z2luRGlyOiBpdGVtLnBsdWdpbkRpciwgc291cmNlVXJpOiBVUkkucGFyc2UoaXRlbS5jdXN0b21pemF0aW9uLnVyaSksIC4uLihkaXNhYmxlZENoaWxkcmVuKGl0ZW0uY3VzdG9taXphdGlvbikgPyB7IGRpc2FibGVkTWNwU2VydmVyczogZGlzYWJsZWRDaGlsZHJlbihpdGVtLmN1c3RvbWl6YXRpb24pIH0gOiB7fSkgfSkpLFxuXHRcdFx0Li4uc2Vzc2lvblBsdWdpbnMsXG5cdFx0XTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jIHRoZSBwdWJsaXNoZWQgY3VzdG9taXphdGlvbnMgZm9yIGEgc2luZ2xlIGNsaWVudCBvZiB0aGlzIHNlc3Npb24sXG5cdCAqIGtleWVkIGJ5IGBjbGllbnRJZGAuIFJlcGxhY2VzIG9ubHkgdGhhdCBjbGllbnQncyBzbGljZTsgb3RoZXIgY2xpZW50cydcblx0ICogY3VzdG9taXphdGlvbnMgYXJlIHVudG91Y2hlZC4gVGhlIHB1Ymxpc2hlZCBzZXNzaW9uLXN0YXRlIGxpc3QgaXMgdGhlXG5cdCAqIHVuaW9uIGFjcm9zcyBhbGwgY2xpZW50cy5cblx0ICpcblx0ICogQHBhcmFtIHF1aWV0IHdoZW4gYHRydWVgLCBzdXBwcmVzcyB7QGxpbmsgb25EaWRQdWJsaXNofSBldmVudHMgZm9yXG5cdCAqICAgdGhpcyBzeW5jLiBVc2VkIGR1cmluZyBlYWdlci1jcmVhdGUgcGF0aHMgd2hlcmUgdGhlcmUgaXMgbm9cblx0ICogICBzZXNzaW9uIGxpc3RlbmVyIHlldDsgdGhlIHNlc3Npb24tc3RhdGUgc25hcHNob3QgcGlja3MgdXAgdGhlXG5cdCAqICAgZmluYWwgdmlldyBkaXJlY3RseSB3aGVuIHRoZSBzZXNzaW9uIG1hdGVyaWFsaXplcy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBzeW5jKGNsaWVudElkOiBzdHJpbmcsIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10sIG9wdGlvbnM/OiB7IHF1aWV0PzogYm9vbGVhbiB9KSB7XG5cdFx0aWYgKCF0aGlzLl9pc0VuYWJsZW1lbnRSZWFkeSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZW5hYmxlbWVudFJlYWR5O1xuXHRcdH1cblx0XHRjb25zdCBxdWlldCA9IG9wdGlvbnM/LnF1aWV0ID09PSB0cnVlO1xuXHRcdGxldCBjbGllbnQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdGNsaWVudCA9IHsgcmV2aXNpb246IDAsIGN1c3RvbWl6YXRpb25zOiBbXSwgc3luYzogUHJvbWlzZS5yZXNvbHZlKFtdKSwgaW5wdXRzOiBbXSB9O1xuXHRcdFx0dGhpcy5fY2xpZW50cy5zZXQoY2xpZW50SWQsIGNsaWVudCk7XG5cdFx0fSBlbHNlIGlmIChlcXVhbHMoY2xpZW50LmlucHV0cywgY3VzdG9taXphdGlvbnMpKSB7XG5cdFx0XHQvLyBOby1vcCByZS1zeW5jOiBhIHdpbmRvdyByZS1zdWJzY3JpYmluZyAoZS5nLiBuYXZpZ2F0aW5nIGF3YXkgZnJvbVxuXHRcdFx0Ly8gYW5kIGJhY2sgdG8gYSBzZXNzaW9uKSByZS1wdWJsaXNoZXMgdGhlIHNhbWUgY3VzdG9taXphdGlvbnMuIFNraXBcblx0XHRcdC8vIHRoZSByZXZpc2lvbiBidW1wLCB0aGUgYFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRgIGVtaXQsIGFuZCB0aGVcblx0XHRcdC8vIHJlZHVuZGFudCBwbHVnaW4tbWFuYWdlciByZS1zeW5jICh3aGljaCBvdGhlcndpc2UgcmUtcGFyc2VzIHBsdWdpbnNcblx0XHRcdC8vIGZyb20gZGlzayBvbiBldmVyeSBuYXZpZ2F0aW9uKS4gR2VudWluZSBjaGFuZ2VzIHN0aWxsIHB1Ymxpc2gsIGFuZFxuXHRcdFx0Ly8gYF9wcm9qZWN0Rm9yUHVibGlzaGAga2VlcHMgbGl2ZSBNQ1Agc3RhdGUgaW50YWN0IGFjcm9zcyB0aG9zZS5cblx0XHRcdHJldHVybiBjbGllbnQuc3luYy50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRjdXN0b21pemF0aW9uOiB0aGlzLl9yZXNvbHZlQ3VzdG9taXphdGlvbkZvclB1Ymxpc2goaXRlbS5jdXN0b21pemF0aW9uKSxcblx0XHRcdFx0Li4uKGl0ZW0ucGx1Z2luRGlyID8geyBwbHVnaW5EaXI6IGl0ZW0ucGx1Z2luRGlyIH0gOiB7fSksXG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0XHRjb25zdCByZXZpc2lvbiA9ICsrY2xpZW50LnJldmlzaW9uO1xuXHRcdGNsaWVudC5pbnB1dHMgPSBjdXN0b21pemF0aW9ucztcblx0XHRjbGllbnQuY3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucy5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHQuLi5jdXN0b21pemF0aW9uLFxuXHRcdFx0XHRjbGllbnRJZCxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkaW5nIH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXQ6IGN1c3RvbWl6YXRpb24sXG5cdFx0fSkpO1xuXHRcdGlmICghcXVpZXQpIHtcblx0XHRcdHRoaXMuX3B1Ymxpc2goKCkgPT4gKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogWy4uLnRoaXMuZ2V0Q3VzdG9taXphdGlvbnMoKV0sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGNvbnN0IHB1Ymxpc2hlZCA9IG5ldyBNYXA8c3RyaW5nLCBDdXN0b21pemF0aW9uPigpO1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBjbGllbnQuY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9yZXNvbHZlQ3VzdG9taXphdGlvbkZvclB1Ymxpc2goY3VzdG9taXphdGlvbi5jdXN0b21pemF0aW9uKTtcblx0XHRcdHB1Ymxpc2hlZC5zZXQoZW5hYmxlZC51cmksIGVuYWJsZWQpO1xuXHRcdH1cblx0XHRjb25zdCBwdWJsaXNoVXBkYXRlID0gKGl0ZW06IElSZXNvbHZlZEN1c3RvbWl6YXRpb24pID0+IHtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb24gPSB0aGlzLl9yZXNvbHZlQ3VzdG9taXphdGlvbkZvclB1Ymxpc2goaXRlbS5jdXN0b21pemF0aW9uKTtcblx0XHRcdGlmIChlcXVhbHMocHVibGlzaGVkLmdldChjdXN0b21pemF0aW9uLnVyaSksIGN1c3RvbWl6YXRpb24pKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHB1Ymxpc2hlZC5zZXQoY3VzdG9taXphdGlvbi51cmksIGN1c3RvbWl6YXRpb24pO1xuXHRcdFx0aWYgKCFxdWlldCkge1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoKCgpID0+ICh7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWQsXG5cdFx0XHRcdFx0Y3VzdG9taXphdGlvbixcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcmV2ID0gY2xpZW50LnN5bmM7XG5cdFx0Y29uc3QgcHJvbWlzZSA9IGNsaWVudC5zeW5jID0gcHJldi5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ29waWxvdDpTZXNzaW9uUGx1Z2luQ29udHJvbGxlcl0gUHJldmlvdXMgY3VzdG9taXphdGlvbiBzeW5jIGZhaWxlZCcsIGVycik7XG5cdFx0fSkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dEJ5VXJpID0gbmV3IE1hcChjdXN0b21pemF0aW9ucy5tYXAoYyA9PiBbYy51cmksIGNdKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wYXJlbnQucGx1Z2luTWFuYWdlci5zeW5jQ3VzdG9taXphdGlvbnMoY2xpZW50SWQsIGN1c3RvbWl6YXRpb25zLCBzdGF0dXMgPT4ge1xuXHRcdFx0XHRpZiAocmV2aXNpb24gIT09IGNsaWVudC5yZXZpc2lvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRwdWJsaXNoVXBkYXRlKHtcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uOiB7IC4uLnN0YXR1cywgY2xpZW50SWQgfSxcblx0XHRcdFx0XHRpbnB1dDogaW5wdXRCeVVyaS5nZXQoc3RhdHVzLnVyaSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgUHJvbWlzZS5hbGwocmVzdWx0Lm1hcChpdGVtID0+IHRoaXMuX3BhcmVudC5yZXNvbHZlU3luY2VkQ3VzdG9taXphdGlvbihpdGVtLCBjbGllbnRJZCwgaW5wdXRCeVVyaS5nZXQoaXRlbS5jdXN0b21pemF0aW9uLnVyaSkpKSk7XG5cdFx0XHRpZiAocmV2aXNpb24gPT09IGNsaWVudC5yZXZpc2lvbikge1xuXHRcdFx0XHRjbGllbnQuY3VzdG9taXphdGlvbnMgPSByZXNvbHZlZDtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc29sdmVkKSB7XG5cdFx0XHRcdFx0cHVibGlzaFVwZGF0ZShpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVkO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHByb21pc2UudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdGN1c3RvbWl6YXRpb246IHRoaXMuX3Jlc29sdmVDdXN0b21pemF0aW9uRm9yUHVibGlzaChpdGVtLmN1c3RvbWl6YXRpb24pLFxuXHRcdFx0Li4uKGl0ZW0ucGx1Z2luRGlyID8geyBwbHVnaW5EaXI6IGl0ZW0ucGx1Z2luRGlyIH0gOiB7fSksXG5cdFx0fSkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgYSBjbGllbnQncyBjdXN0b21pemF0aW9uIGNvbnRyaWJ1dGlvbiBmcm9tIHRoaXMgc2Vzc2lvbixcblx0ICogcHVibGlzaGluZyB0aGUgdXBkYXRlZCAodW5pb24pIGN1c3RvbWl6YXRpb24gbGlzdCBzbyB0aGUgcmVtb3ZlZFxuXHQgKiBjbGllbnQncyBwbHVnaW5zIGRpc2FwcGVhciBmcm9tIHNlc3Npb24gc3RhdGUuXG5cdCAqL1xuXHRwdWJsaWMgcmVtb3ZlQ2xpZW50KGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjbGllbnQgPSB0aGlzLl9jbGllbnRzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFjbGllbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gSW52YWxpZGF0ZSBhbnkgaW4tZmxpZ2h0IHN5bmMgZm9yIHRoaXMgY2xpZW50IGJ5IGJ1bXBpbmcgaXRzXG5cdFx0Ly8gcmV2aXNpb24gc28gdGhlIGxhdGUgY29udGludWF0aW9uJ3MgYHJldmlzaW9uID09PSBjbGllbnQucmV2aXNpb25gXG5cdFx0Ly8gZ3VhcmRzIGZhaWwgYW5kIGl0IGRvZXMgbm90IHJlLXB1Ymxpc2ggdGhlIHJlbW92ZWQgY2xpZW50J3Ncblx0XHQvLyBjdXN0b21pemF0aW9ucy5cblx0XHRjbGllbnQucmV2aXNpb24rKztcblx0XHR0aGlzLl9jbGllbnRzLmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0dGhpcy5fcHVibGlzaCgoKSA9PiAoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFsuLi50aGlzLmdldEN1c3RvbWl6YXRpb25zKCldLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBUaGUgcmF3IGlucHV0IGN1c3RvbWl6YXRpb25zIGxhc3Qgc3luY2VkIGZvciBgY2xpZW50SWRgIChlbXB0eSB3aGVuIGFic2VudCkuICovXG5cdHB1YmxpYyBjbGllbnRJbnB1dHMoY2xpZW50SWQ6IHN0cmluZyk6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NsaWVudHMuZ2V0KGNsaWVudElkKT8uaW5wdXRzID8/IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWlzc3VlIGVhY2ggY2xpZW50J3MgbGFzdCBzeW5jIGlmIGFueSBvZiBpdHMgcHJldmlvdXNseS1zeW5jZWRcblx0ICogY3VzdG9taXphdGlvbnMgaXMgY3VycmVudGx5IGluIGFuIGVycm9yIHN0YXRlLiBVc2VkIHRvIHJlY292ZXIgZnJvbVxuXHQgKiB0cmFuc2llbnQgc3luYyBmYWlsdXJlcyAoZS5nLiBhIGB2c2NvZGUtYWdlbnQtaG9zdDovL2AgY29ubmVjdGlvbiBkcm9wXG5cdCAqIGR1cmluZyByZWNvbm5lY3Rpb24pIGF0IG1lc3NhZ2UgYm91bmRhcmllcy4gUmUtc3luY3MgKipvbmx5KiogdGhlXG5cdCAqIGVycm9yZWQgaXRlbXMgYW5kIGFsd2F5cyBub24tcXVpZXQgc28gbGlzdGVuZXJzIG9ic2VydmUgcmVjb3ZlcnkuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcmV0cnlGYWlsZWRDbGllbnRTeW5jSWZOZWVkZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLnRoaXMuX2NsaWVudHMudmFsdWVzKCldLm1hcChjbGllbnQgPT4gY2xpZW50LnN5bmMuY2F0Y2goKCkgPT4geyB9KSkpO1xuXHRcdGZvciAoY29uc3QgW2NsaWVudElkLCBjbGllbnRdIG9mIFsuLi50aGlzLl9jbGllbnRzXSkge1xuXHRcdFx0Y29uc3QgZXJyb3JlZCA9IGNsaWVudC5jdXN0b21pemF0aW9ucy5maWx0ZXIoaXRlbSA9PlxuXHRcdFx0XHRpdGVtLmN1c3RvbWl6YXRpb24ubG9hZD8ua2luZCA9PT0gQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuRXJyb3Jcblx0XHRcdFx0JiYgaXRlbS5pbnB1dCAhPT0gdW5kZWZpbmVkXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGVycm9yZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXRzID0gZXJyb3JlZC5tYXAoaXRlbSA9PiBpdGVtLmlucHV0ISk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OlNlc3Npb25QbHVnaW5Db250cm9sbGVyXSBSZXRyeWluZyAke2lucHV0cy5sZW5ndGh9IHByZXZpb3VzbHktZmFpbGVkIGNsaWVudCBjdXN0b21pemF0aW9uKHMpIGZvciAke2NsaWVudElkfWApO1xuXHRcdFx0YXdhaXQgdGhpcy5zeW5jKGNsaWVudElkLCBpbnB1dHMpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NvcGlsb3Q6U2Vzc2lvblBsdWdpbkNvbnRyb2xsZXJdIFJldHJpZWQgY2xpZW50IGN1c3RvbWl6YXRpb24gc3luYyBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzY292ZXJlZEVudHJ5KCk6IFNlc3Npb25EaXNjb3ZlcmVkRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fZGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2Vzc2lvbkRpc2NvdmVyZWQudmFsdWUpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNjb3ZlcmVkLnZhbHVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkRpc2NvdmVyZWRFbnRyeSxcblx0XHRcdFx0W3RoaXMuX2RpcmVjdG9yeSwgLi4udGhpcy5fYWRkaXRpb25hbERpcmVjdG9yaWVzXSxcblx0XHRcdFx0dGhpcy5fcGFyZW50LmdldFVzZXJIb21lKCksXG5cdFx0XHRcdCgpID0+IHRoaXMuX3BhcmVudC5nZXRDbGllbnQoKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fcHVibGlzaCgoKSA9PiAoe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZCxcblx0XHRcdFx0XHRjdXN0b21pemF0aW9uczogWy4uLnRoaXMuZ2V0Q3VzdG9taXphdGlvbnMoKV0sXG5cdFx0XHRcdH0pKVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25EaXNjb3ZlcmVkLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVibGlzaChhY3Rpb246ICgpID0+IFNlc3Npb25BY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBwdWJsaXNoID0gKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUHVibGlzaC5maXJlKGFjdGlvbigpKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmICh0aGlzLl9pc0VuYWJsZW1lbnRSZWFkeSkge1xuXHRcdFx0cHVibGlzaCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2b2lkIHRoaXMuX2VuYWJsZW1lbnRSZWFkeS50aGVuKHB1Ymxpc2gpLmNhdGNoKGVycm9yID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDb3BpbG90OlNlc3Npb25QbHVnaW5Db250cm9sbGVyXSBGYWlsZWQgdG8gaW5pdGlhbGl6ZSBjdXN0b21pemF0aW9uIGVuYWJsZW1lbnQnLCBlcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NsaWVudENoaWxkRW5hYmxlbWVudCgpOiBSZWFkb25seU1hcDxzdHJpbmcsIFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10+Pj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdPj4+KCk7XG5cdFx0Zm9yIChjb25zdCBjbGllbnQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGNsaWVudC5pbnB1dHMpIHtcblx0XHRcdFx0aWYgKGN1c3RvbWl6YXRpb24uY2hpbGRFbmFibGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXN1bHQuc2V0KGN1c3RvbWl6YXRpb24udXJpLCBjdXN0b21pemF0aW9uLmNoaWxkRW5hYmxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2NsaWVudFBsdWdpbnMoKTogUmVhZG9ubHlNYXA8c3RyaW5nLCBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24+KCk7XG5cdFx0Zm9yIChjb25zdCBjbGllbnQgb2YgdGhpcy5fY2xpZW50cy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGNsaWVudC5pbnB1dHMpIHtcblx0XHRcdFx0cmVzdWx0LnNldChjdXN0b21pemF0aW9uLnVyaSwgY3VzdG9taXphdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWQoY3VzdG9taXphdGlvbjogQ3VzdG9taXphdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXNpcmVkRW5hYmxlZChjdXN0b21pemF0aW9uKSA/PyAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnkgPyBjdXN0b21pemF0aW9uLmVuYWJsZWQgOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGN1c3RvbWl6YXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5RW5hYmxlbWVudDxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCk6IFQge1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FwcGx5RXhwbGljaXRFbmFibGVtZW50KGN1c3RvbWl6YXRpb24sIHRoaXMuX2dldERlc2lyZWRDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb24uaWQpKTtcblx0XHR9XG5cdFx0aWYgKGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luKSB7XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBjdXN0b21pemF0aW9uIGFzIFBsdWdpbkN1c3RvbWl6YXRpb247XG5cdFx0XHRjb25zdCBuZXh0ID0gdGhpcy5fYXBwbHlFeHBsaWNpdEVuYWJsZW1lbnQocGx1Z2luLCB0aGlzLl9nZXREZXNpcmVkQ3VzdG9taXphdGlvbihwbHVnaW4uaWQpKTtcblx0XHRcdGxldCBjaGFuZ2VkID0gbmV4dCAhPT0gY3VzdG9taXphdGlvbjtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gbmV4dC5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IHtcblx0XHRcdFx0aWYgKGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB0aGlzLl9hcHBseUV4cGxpY2l0RW5hYmxlbWVudChjaGlsZCwgdGhpcy5fZ2V0RGVzaXJlZEN1c3RvbWl6YXRpb24oY2hpbGQuaWQpKTtcblx0XHRcdFx0XHRjaGFuZ2VkIHx8PSB1cGRhdGVkICE9PSBjaGlsZDtcblx0XHRcdFx0XHRyZXR1cm4gdXBkYXRlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkZXNpcmVkRW5hYmxlZCA9IHRoaXMuX2Rlc2lyZWRFbmFibGVkKGNoaWxkKTtcblx0XHRcdFx0aWYgKGRlc2lyZWRFbmFibGVkID09PSB1bmRlZmluZWQgfHwgZGVzaXJlZEVuYWJsZWQgPT09IGNoaWxkLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2hpbGQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB7IC4uLmNoaWxkLCBlbmFibGVkOiBkZXNpcmVkRW5hYmxlZCB9O1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gKGNoYW5nZWQgPyB7IC4uLm5leHQsIGNoaWxkcmVuIH0gOiBuZXh0KSBhcyBUO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5faXNFbmFibGVkKGN1c3RvbWl6YXRpb24pO1xuXHRcdGxldCBjaGFuZ2VkID0gY3VzdG9taXphdGlvbi5lbmFibGVkICE9PSBlbmFibGVkO1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gY3VzdG9taXphdGlvbi5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IHtcblx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0Y29uc3QgbmV4dCA9IHRoaXMuX2FwcGx5RXhwbGljaXRFbmFibGVtZW50KGNoaWxkLCB0aGlzLl9nZXREZXNpcmVkQ3VzdG9taXphdGlvbihjaGlsZC5pZCkpO1xuXHRcdFx0XHRjaGFuZ2VkIHx8PSBuZXh0ICE9PSBjaGlsZDtcblx0XHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZXNpcmVkRW5hYmxlZCA9IHRoaXMuX2Rlc2lyZWRFbmFibGVkKGNoaWxkKTtcblx0XHRcdGlmIChkZXNpcmVkRW5hYmxlZCA9PT0gdW5kZWZpbmVkIHx8IGRlc2lyZWRFbmFibGVkID09PSBjaGlsZC5lbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiBjaGlsZDtcblx0XHRcdH1cblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIHsgLi4uY2hpbGQsIGVuYWJsZWQ6IGRlc2lyZWRFbmFibGVkIH07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGNoYW5nZWQgPyB7IC4uLmN1c3RvbWl6YXRpb24sIGVuYWJsZWQsIGNoaWxkcmVuIH0gOiBjdXN0b21pemF0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUN1c3RvbWl6YXRpb25Gb3JQdWJsaXNoPFQgZXh0ZW5kcyBDdXN0b21pemF0aW9uPihjdXN0b21pemF0aW9uOiBUKTogVCB7XG5cdFx0cmV0dXJuIHJlc29sdmVDdXN0b21pemF0aW9uRW5hYmxlbWVudChcblx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRcdHRoaXMuX3Nlc3Npb24sXG5cdFx0XHRbdGhpcy5fcHJvamVjdEZvclB1Ymxpc2goY3VzdG9taXphdGlvbildLFxuXHRcdFx0dGhpcy5fY2xpZW50Q2hpbGRFbmFibGVtZW50KCksXG5cdFx0XHR0aGlzLl9jbGllbnRQbHVnaW5zKCksXG5cdFx0KS5jdXN0b21pemF0aW9uc1swXSBhcyBUO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVzaXJlZEVuYWJsZWQoY3VzdG9taXphdGlvbjogQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbik6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGV4YWN0ID0gdGhpcy5fZ2V0RGVzaXJlZEN1c3RvbWl6YXRpb24oY3VzdG9taXphdGlvbi5pZCk7XG5cdFx0aWYgKGV4YWN0KSB7XG5cdFx0XHRyZXR1cm4gZXhhY3QudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luIHx8IGV4YWN0LnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlclxuXHRcdFx0XHQ/IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoZXhhY3QpXG5cdFx0XHRcdDogZXhhY3QuZW5hYmxlZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9kaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJldmlvdXNEaXJlY3Rvcnkgb2YgdGhpcy5fcHJldmlvdXNEaXJlY3Rvcmllcykge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNVcmkgPSByZWJhc2VVbmRlcihVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpLCB0aGlzLl9kaXJlY3RvcnksIHByZXZpb3VzRGlyZWN0b3J5KTtcblx0XHRcdGlmICghcHJldmlvdXNVcmkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwcmV2aW91c0lkID0gY3VzdG9taXphdGlvbklkKHByZXZpb3VzVXJpLnRvU3RyaW5nKCksIGN1c3RvbWl6YXRpb24ucmFuZ2UpO1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9nZXREZXNpcmVkQ3VzdG9taXphdGlvbihwcmV2aW91c0lkKTtcblx0XHRcdGlmIChwcmV2aW91cykge1xuXHRcdFx0XHRyZXR1cm4gcHJldmlvdXMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luIHx8IHByZXZpb3VzLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlclxuXHRcdFx0XHRcdD8gaXNDdXN0b21pemF0aW9uRW5hYmxlZChwcmV2aW91cylcblx0XHRcdFx0XHQ6IHByZXZpb3VzLmVuYWJsZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUV4cGxpY2l0RW5hYmxlbWVudDxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCwgZGVzaXJlZDogKEN1c3RvbWl6YXRpb24gfCBDaGlsZEN1c3RvbWl6YXRpb24pIHwgdW5kZWZpbmVkKTogVCB7XG5cdFx0aWYgKCFkZXNpcmVkIHx8IChkZXNpcmVkLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiAmJiBkZXNpcmVkLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikpIHtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uO1xuXHRcdH1cblx0XHRpZiAoZGVzaXJlZC5lbmFibGVtZW50Py5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5leHQ6IFQgJiB7IGVuYWJsZW1lbnQ/OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdIH0gPSB7IC4uLmN1c3RvbWl6YXRpb24sIGVuYWJsZW1lbnQ6IFsuLi5kZXNpcmVkLmVuYWJsZW1lbnRdIH07XG5cdFx0XHRyZXR1cm4gbmV4dDtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dDogVCAmIHsgZW5hYmxlbWVudD86IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10gfSA9IHsgLi4uY3VzdG9taXphdGlvbiB9O1xuXHRcdGRlbGV0ZSBuZXh0LmVuYWJsZW1lbnQ7XG5cdFx0cmV0dXJuIG5leHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZXNpcmVkQ3VzdG9taXphdGlvbihpZDogc3RyaW5nKTogQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSB0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRpZiAoY3VzdG9taXphdGlvbnMgIT09IHRoaXMuX2luZGV4ZWREZXNpcmVkQ3VzdG9taXphdGlvbnMpIHtcblx0XHRcdHRoaXMuX2luZGV4ZWREZXNpcmVkQ3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHRcdHRoaXMuX2Rlc2lyZWRDdXN0b21pemF0aW9uQnlJZC5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zID8/IFtdKSB7XG5cdFx0XHRcdHRoaXMuX2Rlc2lyZWRDdXN0b21pemF0aW9uQnlJZC5zZXQoY3VzdG9taXphdGlvbi5pZCwgY3VzdG9taXphdGlvbik7XG5cdFx0XHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgIT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVzaXJlZEN1c3RvbWl6YXRpb25CeUlkLnNldChjaGlsZC5pZCwgY2hpbGQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVzaXJlZEN1c3RvbWl6YXRpb25CeUlkLmdldChpZCk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdHMgYSByYXcgY3VzdG9taXphdGlvbiBpbnRvIGl0cyBwdWJsaXNoZWQgZm9ybTogYXBwbGllcyByZWR1Y2VyLWJhY2tlZFxuXHQgKiBwZXItc2Vzc2lvbiBlbmFibGVtZW50LCB0aGVuIG92ZXJsYXlzIHRoZSBsYXRlc3Rcblx0ICoga25vd24gTUNQIHJ1bnRpbWUgYHN0YXRlYC9gY2hhbm5lbGAgKHNlZSB7QGxpbmsgbWNwU2VydmVyU3RhdGVzfSkuXG5cdCAqIEV2ZXJ5IHB1Ymxpc2ggcGF0aCBydW5zIGN1c3RvbWl6YXRpb25zIHRocm91Z2ggdGhpcyBzbyBlbmFibGVtZW50IGFuZFxuXHQgKiBsaXZlIE1DUCBzdGF0ZSBzdGF5IGNvbnNpc3RlbnQuIE9iamVjdCBpZGVudGl0eSBpcyBwcmVzZXJ2ZWQgd2hlblxuXHQgKiBuZWl0aGVyIHN0ZXAgY2hhbmdlcyBhbnl0aGluZywga2VlcGluZyBkb3duc3RyZWFtIGVxdWFsaXR5IGNoZWNrc1xuXHQgKiBzdGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIF9wcm9qZWN0Rm9yUHVibGlzaDxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCk6IFQge1xuXHRcdHJldHVybiB0aGlzLl9vdmVybGF5TWNwU3RhdGUodGhpcy5fYXBwbHlFbmFibGVtZW50KGN1c3RvbWl6YXRpb24pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPdmVybGF5cyB0aGUgbGF0ZXN0IGtub3duIE1DUCBydW50aW1lIGBzdGF0ZWAvYGNoYW5uZWxgIChzZWVcblx0ICoge0BsaW5rIG1jcFNlcnZlclN0YXRlc30pIG9udG8gYSBjdXN0b21pemF0aW9uIGFuZCBpdHMgY2hpbGRyZW4sXG5cdCAqIHByZXNlcnZpbmcgb2JqZWN0IGlkZW50aXR5IHdoZW4gbm90aGluZyBpcyBvdmVybGFpZCBzbyBkb3duc3RyZWFtXG5cdCAqIGVxdWFsaXR5IGNoZWNrcyBzdGF5IHN0YWJsZS5cblx0ICovXG5cdHByaXZhdGUgX292ZXJsYXlNY3BTdGF0ZTxUIGV4dGVuZHMgQ3VzdG9taXphdGlvbj4oY3VzdG9taXphdGlvbjogVCk6IFQge1xuXHRcdGNvbnN0IG92ZXJsYXlzID0gdGhpcy5tY3BTZXJ2ZXJTdGF0ZXMuZ2V0KCk7XG5cdFx0aWYgKG92ZXJsYXlzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiBjdXN0b21pemF0aW9uO1xuXHRcdH1cblx0XHRpZiAoY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdGNvbnN0IG92ZXJsYXkgPSBvdmVybGF5cy5nZXQoY3VzdG9taXphdGlvbi5pZCk7XG5cdFx0XHRyZXR1cm4gb3ZlcmxheSA/IHsgLi4uY3VzdG9taXphdGlvbiwgc3RhdGU6IG92ZXJsYXkuc3RhdGUsIGNoYW5uZWw6IG92ZXJsYXkuY2hhbm5lbCB9IDogY3VzdG9taXphdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBjdXN0b21pemF0aW9uLmNoaWxkcmVuO1xuXHRcdGlmICghY2hpbGRyZW4gfHwgY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gY3VzdG9taXphdGlvbjtcblx0XHR9XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRjb25zdCBvdmVybGFpZENoaWxkcmVuID0gY2hpbGRyZW4ubWFwKGNoaWxkID0+IHtcblx0XHRcdGlmIChjaGlsZC50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3ZlcmxheSA9IG92ZXJsYXlzLmdldChjaGlsZC5pZCk7XG5cdFx0XHRpZiAoIW92ZXJsYXkpIHtcblx0XHRcdFx0cmV0dXJuIGNoaWxkO1xuXHRcdFx0fVxuXHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4geyAuLi5jaGlsZCwgc3RhdGU6IG92ZXJsYXkuc3RhdGUsIGNoYW5uZWw6IG92ZXJsYXkuY2hhbm5lbCB9O1xuXHRcdH0pO1xuXHRcdHJldHVybiBjaGFuZ2VkID8geyAuLi5jdXN0b21pemF0aW9uLCBjaGlsZHJlbjogb3ZlcmxhaWRDaGlsZHJlbiB9IDogY3VzdG9taXphdGlvbjtcblx0fVxufVxuXG4vKipcbiAqIEEgcGVyLShzZXNzaW9uLCBjbGllbnRJZCkgaGFuZGxlIHJldHVybmVkIGJ5XG4gKiB7QGxpbmsgQ29waWxvdEFnZW50LmdldE9yQ3JlYXRlQWN0aXZlQ2xpZW50fS4gUmVhZHMvd3JpdGVzIGZsb3cgc3RyYWlnaHRcbiAqIHRocm91Z2ggdG8gdGhlIG93bmluZyBzZXNzaW9uJ3Mge0BsaW5rIEFjdGl2ZUNsaWVudH0gKHRoZSBtdWx0aS1jbGllbnRcbiAqIGNvbnRhaW5lciksIHNvIGFzc2lnbmluZyBgdG9vbHNgIC8gYGN1c3RvbWl6YXRpb25zYCB1cGRhdGVzIG9ubHkgdGhpc1xuICogY2xpZW50J3Mgc2xpY2UuXG4gKi9cbmNsYXNzIENvcGlsb3RBY3RpdmVDbGllbnRIYW5kbGUgaW1wbGVtZW50cyBJQWN0aXZlQ2xpZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3duZXI6IEFjdGl2ZUNsaWVudCxcblx0XHRyZWFkb25seSBjbGllbnRJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0Z2V0IHRvb2xzKCk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9vd25lci50b29sU2V0LmdldCh0aGlzLmNsaWVudElkKTtcblx0fVxuXHRzZXQgdG9vbHModG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pIHtcblx0XHR0aGlzLl9vd25lci50b29sU2V0LnNldCh0aGlzLmNsaWVudElkLCB0b29scyk7XG5cdH1cblxuXHRnZXQgY3VzdG9taXphdGlvbnMoKTogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fb3duZXIucGx1Z2luQ29udHJvbGxlci5jbGllbnRJbnB1dHModGhpcy5jbGllbnRJZCk7XG5cdH1cblx0c2V0IGN1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pIHtcblx0XHQvLyBGaXJlLWFuZC1mb3JnZXQ6IHByb2dyZXNzIGFuZCB0aGUgc2V0dGxlZCByZXN1bHQgZmxvdyBvdXQgdmlhIHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIncyBgb25EaWRQdWJsaXNoYCBzZXNzaW9uIGFjdGlvbnMsIG5vdCB0aGUgc2V0dGVyLlxuXHRcdHRoaXMuX293bmVyLnBsdWdpbkNvbnRyb2xsZXIuc3luYyh0aGlzLmNsaWVudElkLCBbLi4uY3VzdG9taXphdGlvbnNdKS5jYXRjaCgoKSA9PiB7IC8qIGxvZ2dlZCBpbnNpZGUgc3luYyAqLyB9KTtcblx0fVxufVxuXG4vKipcbiAqIFRyYWNrcyBwZXItc2Vzc2lvbiBhY3RpdmUgY2xpZW50IGNvbnRyaWJ1dGlvbnMgKHRvb2xzIGFuZCBwbHVnaW5zKSBhY3Jvc3NcbiAqIHBvdGVudGlhbGx5IHNldmVyYWwgYWN0aXZlIGNsaWVudHMuIE93bnMgdGhlIHNlc3Npb24nc1xuICoge0BsaW5rIFNlc3Npb25QbHVnaW5Db250cm9sbGVyfSwgd2hpY2ggaXMgdGhlIGF1dGhvcml0YXRpdmUgc291cmNlIGZvciBib3RoXG4gKiB0aGUgcGx1Z2luIHNuYXBzaG90IChob3N0ICsgYWxsIGNsaWVudHMgKyBzZXNzaW9uLWRpc2NvdmVyZWQpIGFuZFxuICogcGVyLXNlc3Npb24gYWN0aW9uIGV2ZW50cywgYW5kIHRoZSB7QGxpbmsgQWN0aXZlQ2xpZW50VG9vbFNldH0gdGhhdCBtZXJnZXNcbiAqIGV2ZXJ5IGNsaWVudCdzIHRvb2xzLiBEaXNwb3NpbmcgdGhpcyB0ZWFycyBkb3duIHRoZSBjb250cm9sbGVyIGFuZCBhbnkgZGlza1xuICogd2F0Y2hlcnMgaXQgY3JlYXRlZC5cbiAqL1xuY2xhc3MgQWN0aXZlQ2xpZW50IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBMaXZlLCBtdWx0aS1jbGllbnQgcmVnaXN0cnkgb2YgY29udHJpYnV0ZWQgdG9vbHMuIFNoYXJlZCBieSByZWZlcmVuY2Vcblx0ICogd2l0aCB0aGUgc2Vzc2lvbidzIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSBzbyBhIHdpbmRvdyByZWxvYWQgKG5ld1xuXHQgKiBgY2xpZW50SWRgLCBpZGVudGljYWwgdG9vbHMpIGlzIHJlZmxlY3RlZCBhdCB0b29sLWNhbGwgc3RhbXAgdGltZSB3aXRob3V0XG5cdCAqIHJlc3RhcnRpbmcgdGhlIFNESyBzZXNzaW9uLCBhbmQgc28gdG9vbCBjYWxscyBhcmUgYXR0cmlidXRlZCB0byB0aGVcblx0ICogY29udHJpYnV0aW5nIGNsaWVudC5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXG5cdHB1YmxpYyByZWFkb25seSBwbHVnaW5Db250cm9sbGVyOiBTZXNzaW9uUGx1Z2luQ29udHJvbGxlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIENvcGlsb3RBY3RpdmVDbGllbnRIYW5kbGU+KCk7XG5cblx0LyoqIEhvc3QtcHVibGlzaGVkIHBlci1jbGllbnQgY2hhdCBtZW1iZXJzaGlwLCB1cGRhdGVkIGluY3JlbWVudGFsbHkgb25lIGV4YWN0IGNoYXQgYXQgYSB0aW1lLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0c0J5Q2xpZW50ID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXG5cdC8qKiBDaGF0cyB3aXRoIGF1dGhvcml0YXRpdmUgbWVtYmVyc2hpcDsgdW5rbm93biBjaGF0cyBhcmUgdHJlYXRlZCBzZXBhcmF0ZWx5IGZyb20gXCJubyBjb250cmlidXRvcnNcIi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfa25vd25DaGF0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Vcmk6IFVSSSxcblx0XHRwbHVnaW5Db250cm9sbGVyOiBTZXNzaW9uUGx1Z2luQ29udHJvbGxlcixcblx0XHRvbkRpZFNlc3Npb25Qcm9ncmVzczogRW1pdHRlcjxBZ2VudFNpZ25hbD4sXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnBsdWdpbkNvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihwbHVnaW5Db250cm9sbGVyKTtcblx0XHQvLyBGb3J3YXJkIHBlci1zZXNzaW9uIHB1Ymxpc2ggZXZlbnRzIGludG8gdGhlIGFnZW50J3MgcHJvZ3Jlc3Ncblx0XHQvLyBzdHJlYW0uIFRoaXMgcmVwbGFjZXMgdGhlIHByZXZpb3VzIGNsaWVudElkLWJhc2VkIHJvdXRpbmcuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wbHVnaW5Db250cm9sbGVyLm9uRGlkUHVibGlzaChhY3Rpb24gPT4ge1xuXHRcdFx0b25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7IGtpbmQ6ICdhY3Rpb24nLCByZXNvdXJjZTogdGhpcy5fc2Vzc2lvblVyaSwgYWN0aW9uIH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBBZGRzIGBjaGF0YCB0byBgY2xpZW50SWRgJ3MgbWVtYmVyc2hpcCBhbmQgcmVwb3J0cyB3aGV0aGVyIG1lbWJlcnNoaXAgZ3Jldy4gKi9cblx0YWRkQ2xpZW50Q2hhdChjbGllbnRJZDogc3RyaW5nLCBjaGF0OiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYXRzID0gdGhpcy5fY2hhdHNCeUNsaWVudC5nZXQoY2xpZW50SWQpO1xuXHRcdGlmIChjaGF0cz8uaGFzKGNoYXRLZXkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjaGF0cykge1xuXHRcdFx0Y2hhdHMuYWRkKGNoYXRLZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jaGF0c0J5Q2xpZW50LnNldChjbGllbnRJZCwgbmV3IFNldChbY2hhdEtleV0pKTtcblx0XHR9XG5cdFx0dGhpcy5fa25vd25DaGF0cy5hZGQoY2hhdEtleSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKiogUmVtb3ZlcyBgY2hhdGAgZnJvbSBgY2xpZW50SWRgIGFuZCByZXBvcnRzIHdoZXRoZXIgdGhhdCBjbGllbnQgbm93IGhhcyBubyBjaGF0cyBsZWZ0LiAqL1xuXHRyZW1vdmVDbGllbnRDaGF0KGNsaWVudElkOiBzdHJpbmcsIGNoYXQ6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYXRLZXkgPSBjaGF0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdHMgPSB0aGlzLl9jaGF0c0J5Q2xpZW50LmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFjaGF0cz8uaGFzKGNoYXRLZXkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNoYXRzLmRlbGV0ZShjaGF0S2V5KTtcblx0XHRpZiAoY2hhdHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fY2hhdHNCeUNsaWVudC5kZWxldGUoY2xpZW50SWQpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWluZGV4S25vd25DaGF0cygpO1xuXHRcdHJldHVybiAhdGhpcy5fY2hhdHNCeUNsaWVudC5oYXMoY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqIFJlbW92ZXMgYGNoYXRgIGZyb20gZXZlcnkgY2xpZW50LCBkcm9wcGluZyBjbGllbnRzIGxlZnQgd2l0aCBubyByZW1haW5pbmcgY2hhdHMuICovXG5cdHJlbW92ZUNoYXQoY2hhdDogVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjbGllbnRJZCBvZiBbLi4udGhpcy5fY2hhdHNCeUNsaWVudC5rZXlzKCldKSB7XG5cdFx0XHRpZiAodGhpcy5yZW1vdmVDbGllbnRDaGF0KGNsaWVudElkLCBjaGF0KSkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUNsaWVudChjbGllbnRJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIFRoZSBleGFjdCBjaGF0cyBgY2xpZW50SWRgIGNvbnRyaWJ1dGVzIHRvLCBhcyBsYXN0IHB1Ymxpc2hlZCBieSB0aGUgaG9zdC4gKi9cblx0Y2xpZW50Q2hhdHMoY2xpZW50SWQ6IHN0cmluZyk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWy4uLih0aGlzLl9jaGF0c0J5Q2xpZW50LmdldChjbGllbnRJZCkgPz8gW10pXTtcblx0fVxuXG5cdC8qKiBVbmtub3duIGNoYXRzIGFyZSB0ZW1wb3JhcmlseSBpbiBzY29wZSBmb3IgZXZlcnkgY2xpZW50IHVudGlsIHRoZSBob3N0IHB1Ymxpc2hlcyBleGFjdCBtZW1iZXJzaGlwLiAqL1xuXHRjb250cmlidXRlc1RvKGNsaWVudElkOiBzdHJpbmcsIGNoYXRLZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fa25vd25DaGF0cy5oYXMoY2hhdEtleSkgfHwgdGhpcy5fY2hhdHNCeUNsaWVudC5nZXQoY2xpZW50SWQpPy5oYXMoY2hhdEtleSkgPT09IHRydWU7XG5cdH1cblxuXHQvKiogQ2hhdC1zY29wZWQgdG9vbCB1bmlvbjsgZHVwbGljYXRlIG5hbWVzIGtlZXAgdGhlIGZpcnN0IGNvbnRyaWJ1dG9yJ3MgZGVmaW5pdGlvbi4gKi9cblx0dG9vbHNGb3JDaGF0KGNoYXRLZXk6IHN0cmluZyk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCByZXN1bHQ6IFRvb2xEZWZpbml0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNsaWVudElkIG9mIHRoaXMudG9vbFNldC5jbGllbnRJZHMoKSkge1xuXHRcdFx0aWYgKCF0aGlzLmNvbnRyaWJ1dGVzVG8oY2xpZW50SWQsIGNoYXRLZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRoaXMudG9vbFNldC5nZXQoY2xpZW50SWQpKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXModG9vbC5uYW1lKSkge1xuXHRcdFx0XHRcdHNlZW4uYWRkKHRvb2wubmFtZSk7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godG9vbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3JlaW5kZXhLbm93bkNoYXRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2tub3duQ2hhdHMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGNoYXRzIG9mIHRoaXMuX2NoYXRzQnlDbGllbnQudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgY2hhdEtleSBvZiBjaGF0cykge1xuXHRcdFx0XHR0aGlzLl9rbm93bkNoYXRzLmFkZChjaGF0S2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogR2V0IChvciBsYXppbHkgY3JlYXRlKSB0aGUgc3RhYmxlIGhhbmRsZSBmb3IgYGNsaWVudElkYC4gKi9cblx0Z2V0T3JDcmVhdGVIYW5kbGUoY2xpZW50SWQ6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IENvcGlsb3RBY3RpdmVDbGllbnRIYW5kbGUge1xuXHRcdGxldCBoYW5kbGUgPSB0aGlzLl9oYW5kbGVzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFoYW5kbGUpIHtcblx0XHRcdGhhbmRsZSA9IG5ldyBDb3BpbG90QWN0aXZlQ2xpZW50SGFuZGxlKHRoaXMsIGNsaWVudElkLCBkaXNwbGF5TmFtZSk7XG5cdFx0XHR0aGlzLl9oYW5kbGVzLnNldChjbGllbnRJZCwgaGFuZGxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGhhbmRsZTtcblx0fVxuXG5cdC8qKiBEcm9wIGEgY2xpZW50J3MgdG9vbCwgY3VzdG9taXphdGlvbiwgYW5kIG1lbWJlcnNoaXAgc3RhdGUgZnJvbSB0aGlzIHNlc3Npb24uICovXG5cdHJlbW92ZUNsaWVudChjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faGFuZGxlcy5kZWxldGUoY2xpZW50SWQpO1xuXHRcdHRoaXMudG9vbFNldC5kZWxldGUoY2xpZW50SWQpO1xuXHRcdHRoaXMuX2NoYXRzQnlDbGllbnQuZGVsZXRlKGNsaWVudElkKTtcblx0XHR0aGlzLl9yZWluZGV4S25vd25DaGF0cygpO1xuXHRcdHRoaXMucGx1Z2luQ29udHJvbGxlci5yZW1vdmVDbGllbnQoY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqIEJ1aWxkcyB0aGUgY2xpZW50L3BsdWdpbi9NQ1Agc25hcHNob3QgYSBjaGF0IHNob3VsZCBhZHZlcnRpc2UgdG8gaXRzIFNESyBzZXNzaW9uLiAqL1xuXHRhc3luYyBzbmFwc2hvdChjaGF0S2V5Pzogc3RyaW5nKTogUHJvbWlzZTxJQWN0aXZlQ2xpZW50U25hcHNob3Q+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbHM6IGNoYXRLZXkgPT09IHVuZGVmaW5lZCA/IHRoaXMudG9vbFNldC5tZXJnZWQoKSA6IHRoaXMudG9vbHNGb3JDaGF0KGNoYXRLZXkpLFxuXHRcdFx0cGx1Z2luczogYXdhaXQgdGhpcy5wbHVnaW5Db250cm9sbGVyLmdldEFwcGxpZWRQbHVnaW5zKCksXG5cdFx0XHRtY3BTZXJ2ZXJzOiB0aGlzLl9nZXRNY3BTZXJ2ZXJzKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1jcFNlcnZlcnMoKTogQWdlbnRIb3N0TWNwU2VydmVycyB7XG5cdFx0Y29uc3Qgc2VydmVycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkpID8/IHt9O1xuXG5cdFx0cmV0dXJuIHN0cnVjdHVyZWRDbG9uZShzZXJ2ZXJzKTtcblx0fVxuXG5cdC8qKiBSZXR1cm5zIHdoZXRoZXIgcGx1Z2lucyBvciB0aGUgY2hhdC1zY29wZWQgc3RydWN0dXJhbCB0b29sIHNldCBjaGFuZ2VkIGVub3VnaCB0byByZXF1aXJlIHJlc3VtZS4gKi9cblx0YXN5bmMgcmVxdWlyZXNSZXN0YXJ0KHNuYXA6IElBY3RpdmVDbGllbnRTbmFwc2hvdCwgY2hhdEtleT86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHBsdWdpbnMgPSBhd2FpdCB0aGlzLnBsdWdpbkNvbnRyb2xsZXIuZ2V0QXBwbGllZFBsdWdpbnMoKTtcblx0XHRpZiAoIXBhcnNlZFBsdWdpbnNFcXVhbChzbmFwLnBsdWdpbnMsIHBsdWdpbnMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFlcXVhbHMoc25hcC5tY3BTZXJ2ZXJzLCB0aGlzLl9nZXRNY3BTZXJ2ZXJzKCkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRLZXkgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyAhdGhpcy50b29sU2V0LnN0cnVjdHVyYWxFcXVhbHMoc25hcC50b29scylcblx0XHRcdDogIXN0cnVjdHVyYWxUb29sc0VxdWFsKHRoaXMudG9vbHNGb3JDaGF0KGNoYXRLZXkpLCBzbmFwLnRvb2xzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWUseUJBQTRKO0FBQ3BMLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBNEIseUJBQXlCLGlCQUFpQixTQUFTLG1CQUFtQixTQUFTLGFBQWEsV0FBVyxzQkFBc0I7QUFFekosU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIsdUJBQXVCO0FBQ25ELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLGVBQWlDLG1CQUFtQixvQkFBb0I7QUFDN0YsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsU0FBUyxpQkFBaUIsMkJBQXVFO0FBQzFHLFNBQVMsV0FBVyxTQUFTLFlBQVk7QUFDekMsU0FBUyxZQUFZLGtCQUFrQixTQUFTLGlCQUFpQixZQUFZLGtCQUFrQixvQkFBb0I7QUFDbkgsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlFLGdCQUFnQixhQUFhLGVBQWUsZ0JBQWdCLG9CQUFvQjtBQUNqSixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsZ0JBQWdCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUNBQW1DO0FBRzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCLHlCQUF5Qiw0QkFBb0Q7QUFDcEgsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0Isb0NBQW9DLDhDQUE4QyxnQ0FBZ0M7QUFDL0ksU0FBUyxxQkFBcUIsc0NBQXNDLHdCQUF3QiwyQ0FBMkU7QUFDdkssU0FBUyw4QkFBOEIsMkNBQTJDLHNDQUFzQyxzQ0FBc0Msa0RBQWlGLDhCQUE4QixvQkFBb0IsNkJBQXVEO0FBQ3hWLFNBQVMsMkJBQWlEO0FBQzFELFNBQVMsb0JBQW9CLDBCQUErQztBQUM1RSxTQUFTLHVCQUF1QiwwQkFBMEI7QUFDMUQsU0FBb0MsY0FBb2dCLG9CQUFvQix5QkFBeUIsZ0NBQWdDLDhCQUE4QixpQ0FBaUM7QUFDcHJCLFNBQVMsK0JBQStCLHlCQUF5QixxQ0FBcUM7QUFFdEcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsK0JBQStCO0FBSXhDLFNBQVMsWUFBWSwwQkFBdUU7QUFDNUYsU0FBUyw0Q0FBNEM7QUFDckQsU0FBNkIseUJBQXlCLG1CQUFpRixpQkFBaUIsY0FBYyxxQkFBcUIsOEJBQThCLHdCQUF3QixrQkFBa0IsaUNBQWtVO0FBQ3JrQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHFCQUFxQiw0QkFBNEI7QUFDMUQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEIsdUNBQW9FO0FBQ3ZHLFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMsMkJBQTJCLDRCQUE0QixzQ0FBc0M7QUFDdEcsU0FBUyx1QkFBb0Q7QUFDN0QsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBaUMsaUNBQWlDO0FBQ2xFLFNBQVMsb0JBQW9CLDZCQUE2QjtBQUMxRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHdCQUF3QixzQkFBc0Isd0JBQXdCLHVCQUF1QiwwQkFBMEIscUNBQWdHO0FBQ2hPLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsMEJBQTREO0FBQ3JFLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkNBQXNGO0FBQy9GLFNBQVMsZ0JBQWdCLCtCQUErQixxQ0FBZ0U7QUFDeEgsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw4QkFBOEIsaUNBQWlDLDRCQUE0Qiw2QkFBNkIsdUNBQTJJO0FBWTVRLE1BQU0sNENBQTRDO0FBQ2xELE1BQU0sa0RBQWtEO0FBRXhELFNBQVMsbUNBQW1DLE9BQTREO0FBQ3ZHLFNBQU8sT0FBTyxVQUFVLFlBQVksVUFBVSxRQUFRLHdCQUF3QixTQUMxRSxPQUFRLE1BQTJDLHVCQUF1QjtBQUMvRTtBQUVBLGVBQXNCLHFDQUNyQixZQUNBLE9BQ0EsTUFDQSxRQUNBLFlBQVksMkNBQ1osUUFBNEIsUUFDMkM7QUFDdkUsUUFBTSxVQUFVLDJCQUEyQixPQUFPLE1BQU0sV0FBVyxtQkFBbUI7QUFBQSxJQUNyRixHQUFJLFFBQVEsRUFBRSxVQUFVLEVBQUUsTUFBTSxTQUFTLE1BQU0sTUFBTSxHQUFZLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDNUU7QUFBQSxFQUNELENBQUMsQ0FBQztBQUNGLFFBQU0sU0FBUyxNQUFNLFlBQVksU0FBUyxTQUFTO0FBQ25ELE1BQUksQ0FBQyxRQUFRO0FBQ1osVUFBTSxJQUFJLE1BQU0sbURBQW1ELFlBQVksR0FBSSxvRUFBb0U7QUFBQSxFQUN4SjtBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsMkJBQThCLE9BQTJCLFFBQXNDO0FBQ3ZHLE1BQUksQ0FBQyxPQUFPO0FBQ1gsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUNBLFFBQU0saUJBQWlCLDJCQUEyQixJQUFJLFNBQU8sUUFBUSxJQUFJLEdBQUcsQ0FBQztBQUM3RSxhQUFXLE9BQU8sNEJBQTRCO0FBQzdDLFlBQVEsSUFBSSxHQUFHLElBQUk7QUFBQSxFQUNwQjtBQUNBLE1BQUk7QUFFSCxXQUFPLE9BQU87QUFBQSxFQUNmLFVBQUU7QUFDRCxhQUFTLFFBQVEsR0FBRyxRQUFRLDJCQUEyQixRQUFRLFNBQVM7QUFDdkUsWUFBTSxNQUFNLDJCQUEyQixLQUFLO0FBQzVDLFlBQU0sUUFBUSxlQUFlLEtBQUs7QUFDbEMsVUFBSSxVQUFVLFFBQVc7QUFDeEIsZUFBTyxRQUFRLElBQUksR0FBRztBQUFBLE1BQ3ZCLE9BQU87QUFDTixnQkFBUSxJQUFJLEdBQUcsSUFBSTtBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sMkNBQTJDO0FBQ2pELE1BQU0sbUJBQW1CO0FBT3pCLFNBQVMsK0JBQStCLE9BQXlCO0FBQ2hFLFNBQU8sNkJBQTZCLEtBQUssTUFBTTtBQUNoRDtBQUtBLE1BQU0seUJBQXlCLENBQUMsZUFBZSxlQUFlLGNBQWMsY0FBYyxhQUFhLFdBQVc7QUFJbEgsTUFBTSw2QkFBNkIsQ0FBQyxjQUFjLGFBQWE7QUFFL0QsZUFBZSxXQUFXLFVBQW9DO0FBQzdELE1BQUk7QUFDSCxVQUFNLEdBQUcsT0FBTyxRQUFRO0FBQ3hCLFdBQU87QUFBQSxFQUNSLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxxQkFBOEI7QUFDdEMsTUFBSSxRQUFRLGFBQWEsU0FBUztBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sU0FBUyxRQUFRLFFBQVEsVUFBVTtBQUN6QyxTQUFPLENBQUMsUUFBUSxRQUFRO0FBQ3pCO0FBRUEsU0FBUyxzQ0FBZ0Q7QUFDeEQsUUFBTSxlQUFlLEdBQUcsUUFBUSxRQUFRLElBQUksUUFBUSxJQUFJO0FBQ3hELE1BQUksUUFBUSxhQUFhLFNBQVM7QUFDakMsV0FBTyxDQUFDLFlBQVk7QUFBQSxFQUNyQjtBQUVBLFFBQU0sa0JBQWtCLENBQUMsU0FBUyxRQUFRLElBQUksSUFBSSxhQUFhLFFBQVEsSUFBSSxFQUFFO0FBQzdFLFNBQU8sbUJBQW1CLElBQUksZ0JBQWdCLFFBQVEsSUFBSTtBQUMzRDtBQUVBLGVBQWUsc0JBQXNCLGdCQUFzQztBQUMxRSxRQUFNLFFBQWtCLENBQUM7QUFDekIsYUFBVyxtQkFBbUIsb0NBQW9DLEdBQUc7QUFDcEUsVUFBTSxVQUFVLElBQUksU0FBUyxnQkFBZ0IsV0FBVyxXQUFXLGVBQWUsSUFBSSxVQUFVLEVBQUU7QUFDbEcsVUFBTSxLQUFLLE9BQU87QUFDbEIsUUFBSSxNQUFNLFdBQVcsT0FBTyxHQUFHO0FBQzlCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLFFBQU0sa0JBQWtCLElBQUksU0FBUyxnQkFBZ0IsV0FBVyxXQUFXLFVBQVUsRUFBRTtBQUN2RixRQUFNLEtBQUssZUFBZTtBQUMxQixNQUFJLE1BQU0sV0FBVyxlQUFlLEdBQUc7QUFDdEMsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLElBQUksTUFBTSxzREFBc0QsTUFBTSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBQ3pGO0FBOERBLE1BQU0seUJBQW1ELE9BQU8sT0FBTyxDQUFDLENBQUM7QUFHekUsTUFBTSx1QkFBdUI7QUFBQSxFQUE3QjtBQUNDLFNBQVEsZ0JBQWdCO0FBQ3hCLFNBQVEsbUJBQW1CO0FBRzNCLFNBQVEsaUJBQWdDLFFBQVEsUUFBUTtBQUV4RCxTQUFRLGVBQWU7QUFDdkIsU0FBUSx1QkFBdUI7QUFFL0IsU0FBaUIsZUFBZSxvQkFBSSxJQUFzRDtBQUMxRixTQUFpQixvQkFBb0IsSUFBSSxVQUFVO0FBQ25ELFNBQWlCLGlCQUFpQixJQUFJLGVBQXVCO0FBQzdELFNBQWlCLGNBQWMsb0JBQUksSUFBbUI7QUFBQTtBQUFBLEVBRXRELElBQUksc0JBQStCO0FBQ2xDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGFBQWdCLE1BQW9DO0FBQ25ELFdBQU8sS0FBSyxPQUFPLEtBQUssa0JBQWtCLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLFVBQWEsU0FBaUIsTUFBb0M7QUFDakUsV0FBTyxLQUFLLE9BQU8sS0FBSyxlQUFlLE1BQU0sU0FBUyxJQUFJLENBQUM7QUFBQSxFQUM1RDtBQUFBLEVBRUEsY0FBYyxTQUEyRTtBQUN4RixVQUFNLFdBQVcsS0FBSztBQUN0QixRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBUyxRQUFRO0FBQ3ZCLFNBQUssaUJBQWlCO0FBQ3RCLFVBQU0sVUFBVSxNQUFNO0FBQ3JCLFVBQUksS0FBSyxtQkFBbUIsUUFBUTtBQUNuQyxhQUFLLGlCQUFpQjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxTQUFTLE9BQU87QUFDNUIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFdBQVcsU0FBaUIsU0FBbUc7QUFDOUgsVUFBTSxXQUFXLEtBQUssYUFBYSxJQUFJLE9BQU87QUFDOUMsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQVMsUUFBUTtBQUN2QixTQUFLLGFBQWEsSUFBSSxTQUFTLE1BQU07QUFDckMsVUFBTSxVQUFVLE1BQU07QUFDckIsVUFBSSxLQUFLLGFBQWEsSUFBSSxPQUFPLE1BQU0sUUFBUTtBQUM5QyxhQUFLLGFBQWEsT0FBTyxPQUFPO0FBQUEsTUFDakM7QUFBQSxJQUNEO0FBQ0EsV0FBTyxLQUFLLFNBQVMsT0FBTztBQUM1QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxVQUE0QztBQUNqRCxXQUFPLENBQUMsS0FBSyxnQkFBZ0IsQ0FBQyxLQUFLLHNCQUFzQjtBQUN4RCxZQUFNLFdBQVcsS0FBSztBQUN0QixVQUFJLFVBQVU7QUFDYixjQUFNLFNBQVM7QUFDZjtBQUFBLE1BQ0Q7QUFFQSxXQUFLO0FBQ0wsVUFBSSxXQUFXO0FBQ2YsYUFBTyxhQUFhLE1BQU07QUFDekIsWUFBSSxVQUFVO0FBQ2I7QUFBQSxRQUNEO0FBQ0EsbUJBQVc7QUFDWCxhQUFLO0FBQ0wsWUFBSSxLQUFLLGtCQUFrQixHQUFHO0FBQzdCLGVBQUssVUFBVSxTQUFTO0FBQUEsUUFDekI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFFBQVEsTUFBMEM7QUFDakQsUUFBSSxLQUFLLGdCQUFnQixLQUFLLHNCQUFzQjtBQUNuRCxhQUFPLFFBQVEsUUFBUTtBQUFBLElBQ3hCO0FBRUEsU0FBSztBQUNMLFNBQUssY0FBYyxJQUFJLGdCQUFzQjtBQUM3QyxVQUFNLFdBQVcsS0FBSztBQUN0QixVQUFNLFdBQVcsWUFBWTtBQUM1QixZQUFNO0FBQ04sWUFBTSxLQUFLLGVBQWU7QUFDMUIsWUFBTSxLQUFLO0FBQUEsSUFDWixHQUFHO0FBQ0gsVUFBTSxZQUFZLFFBQVEsUUFBUSxNQUFNO0FBQ3ZDLFdBQUs7QUFDTCxVQUFJLEtBQUsscUJBQXFCLEtBQUssQ0FBQyxLQUFLLGdCQUFnQixDQUFDLEtBQUssc0JBQXNCO0FBQ3BGLGFBQUssV0FBVyxTQUFTO0FBQ3pCLGFBQUssWUFBWTtBQUFBLE1BQ2xCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxpQkFBaUIsVUFBVSxNQUFNLE1BQU0sTUFBUztBQUNyRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxRQUFRLE1BQTBDO0FBQ3ZELFFBQUksS0FBSyxpQkFBaUI7QUFDekIsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFFBQUksS0FBSyxzQkFBc0I7QUFDOUI7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlO0FBQ3BCLFNBQUssV0FBVyxTQUFTO0FBQ3pCLFNBQUssWUFBWTtBQUNqQixVQUFNLFdBQVcsS0FBSztBQUN0QixVQUFNLFdBQVcsWUFBWTtBQUM1QixVQUFJO0FBQ0gsY0FBTTtBQUNOLGNBQU0sS0FBSyxlQUFlO0FBQzFCLGNBQU0sS0FBSztBQUNYLGFBQUssdUJBQXVCO0FBQUEsTUFDN0IsU0FBUyxPQUFPO0FBQ2YsWUFBSSxDQUFDLEtBQUssc0JBQXNCO0FBQy9CLGVBQUssZUFBZTtBQUNwQixlQUFLLFdBQVcsU0FBUztBQUN6QixlQUFLLFlBQVk7QUFBQSxRQUNsQjtBQUNBLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxHQUFHO0FBQ0gsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxpQkFBaUIsUUFBUSxNQUFNLE1BQU0sTUFBUztBQUNuRCxRQUFJO0FBQ0gsWUFBTTtBQUFBLElBQ1AsVUFBRTtBQUNELFVBQUksQ0FBQyxLQUFLLHdCQUF3QixLQUFLLG9CQUFvQixTQUFTO0FBQ25FLGFBQUssa0JBQWtCO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxRQUF1QjtBQUM1QixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLFdBQVcsU0FBUztBQUN6QixTQUFLLFlBQVk7QUFDakIsVUFBTSxLQUFLLG1CQUFtQjtBQUM5QixVQUFNLEtBQUs7QUFDWCxVQUFNLEtBQUssZUFBZTtBQUFBLEVBQzNCO0FBQUEsRUFFUSxPQUFVLE1BQThCO0FBQy9DLFVBQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxRQUFXLE1BQU0sTUFBUztBQUM3RCxTQUFLLFlBQVksSUFBSSxVQUFVO0FBQy9CLGVBQVcsS0FBSyxNQUFNLEtBQUssWUFBWSxPQUFPLFVBQVUsQ0FBQztBQUN6RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxxQkFBb0M7QUFDakQsV0FBTyxLQUFLLFlBQVksT0FBTyxHQUFHO0FBQ2pDLFlBQU0sUUFBUSxJQUFJLEtBQUssV0FBVztBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxpQkFBZ0M7QUFDN0MsUUFBSSxLQUFLLGtCQUFrQixHQUFHO0FBQzdCO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVSxLQUFLLGFBQWEsSUFBSSxnQkFBc0I7QUFDNUQsVUFBTSxRQUFRO0FBQ2QsUUFBSSxLQUFLLGFBQWEsU0FBUztBQUM5QixXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsOEJBQThCLFVBQWtEO0FBQ3hGLFNBQU8sV0FBVyxHQUFHLFNBQVMsUUFBUSxRQUFRLEVBQUUsQ0FBQyxlQUFlO0FBQ2pFO0FBRUEsU0FBUyx5Q0FBeUM7QUFhM0MsU0FBUyxZQUFZLEtBQVUsU0FBYyxPQUE2QjtBQUNoRixNQUFJLENBQUMsZ0JBQWdCLEtBQUssT0FBTyxHQUFHO0FBQ25DLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxNQUFNLGFBQWEsU0FBUyxHQUFHO0FBQ3JDLE1BQUksUUFBUSxRQUFXO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxJQUFJLFdBQVcsSUFBSSxRQUFRLGlCQUFpQixPQUFPLEdBQUc7QUFDOUQ7QUFHTyxTQUFTLHNCQUFzQixZQUEwQyxTQUFjLE9BQWtDO0FBQy9ILFFBQU0sV0FBVyxvQkFBSSxJQUFxQjtBQUMxQyxhQUFXLENBQUMsS0FBSyxPQUFPLEtBQUssWUFBWTtBQUN4QyxVQUFNLFVBQVUsWUFBWSxJQUFJLE1BQU0sR0FBRyxHQUFHLFNBQVMsS0FBSztBQUMxRCxhQUFTLElBQUksVUFBVSxRQUFRLFNBQVMsSUFBSSxLQUFLLE9BQU87QUFBQSxFQUN6RDtBQUNBLFNBQU87QUFDUjtBQUVBLE1BQU0seUJBQXlCLFdBQVc7QUFBQSxFQUN6QyxZQUNVLGFBQ1QsY0FDQSxtQkFDQSxrQkFDQztBQUNELFVBQU07QUFMRztBQU1ULFNBQUssVUFBVSxXQUFXO0FBQzFCLFNBQUssVUFBVSxZQUFZLGtCQUFrQixrQkFBZ0Isa0JBQWtCLEtBQUssWUFBWSxDQUFDLENBQUM7QUFDbEcsU0FBSyxVQUFVLFlBQVksaUJBQWlCLGdCQUFnQixDQUFDO0FBQzdELFNBQUssVUFBVSxRQUFRLFlBQVUsYUFBYSxpQkFBaUIsZ0JBQWdCLElBQUksWUFBWSxnQkFBZ0IsS0FBSyxNQUFNLEdBQUcsTUFBUyxDQUFDLENBQUM7QUFBQSxFQUN6STtBQUNEO0FBRU8sU0FBUyxrQ0FBa0MsVUFBa0IsVUFBMEQ7QUFDN0gsTUFBSSxhQUFhLFFBQVE7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJO0FBQ0gsVUFBTSxNQUFNLElBQUksSUFBSSxRQUFRO0FBQzVCLFFBQUksSUFBSSxhQUFhLE1BQU0sSUFBSSxhQUFhLEtBQUs7QUFDaEQsVUFBSSxXQUFXO0FBQUEsSUFDaEIsV0FBVyxJQUFJLFNBQVMsU0FBUyxZQUFZLEdBQUc7QUFDL0MsVUFBSSxXQUFXLEdBQUcsSUFBSSxTQUFTLE1BQU0sR0FBRyxDQUFDLGFBQWEsTUFBTSxDQUFDO0FBQUEsSUFDOUQ7QUFDQSxXQUFPLElBQUksU0FBUyxFQUFFLFFBQVEsT0FBTyxFQUFFO0FBQUEsRUFDeEMsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFHQSxNQUFNLG1DQUFtQztBQTRCekMsTUFBTSxzQkFBc0I7QUFLckIsSUFBTSxlQUFOLGNBQTJCLFdBQTZCO0FBQUEsRUFnTTlELFlBQytCLGFBQ1UsdUJBQ0YscUJBQ0MsYUFDTSx1QkFDZixvQkFDcUIseUJBQ0Qsd0JBQ1YsY0FDakIsYUFDdUIsb0JBQ0osZ0JBQ2lCLGlDQUNmLHFCQUNKLHFCQUNKLG1CQUNDLG9CQUNLLGdCQUN6QztBQUNELFVBQU07QUFuQndCO0FBQ1U7QUFDRjtBQUNDO0FBQ007QUFFTTtBQUNEO0FBQ1Y7QUFFTTtBQUNKO0FBQ2lCO0FBQ2Y7QUFDSjtBQUNKO0FBQ0M7QUFDSztBQWpOM0MsU0FBUyxLQUFLO0FBRWQsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQXFCLENBQUM7QUFDL0UsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFDckQsU0FBaUIsMEJBQTBCO0FBQUEsTUFDMUMsRUFBRSxPQUFPLE1BQU0sVUFBVSxpQkFBaUI7QUFBQSxNQUMxQztBQUFBLElBQ0Q7QUFDQSxTQUFTLHlCQUF1RixLQUFLO0FBT3JHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxRQUE4QixDQUFDO0FBQ3JGLFNBQVMsaUJBQWlCLEtBQUssZ0JBQWdCO0FBQy9DLFNBQWlCLHdCQUF3QixLQUFLLFVBQVUsSUFBSSxRQUFvQyxDQUFDO0FBQ2pHLFNBQVMsdUJBQXVCLEtBQUssc0JBQXNCO0FBSzNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXlDO0FBQUEsTUFDbEcsdUJBQXVCLE1BQU07QUFDNUIsWUFBSSxLQUFLLGtDQUFrQyxHQUFHO0FBQzdDLGVBQUssS0FBSyxrQkFBa0I7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQVMscUJBQXFCLEtBQUssb0JBQW9CO0FBTXZEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBMEIsQ0FBQztBQUNwRixTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQUNyRCxTQUFpQixVQUFVLGdCQUE0QyxNQUFNLENBQUMsQ0FBQztBQUMvRSxTQUFTLFNBQVMsS0FBSztBQVF2QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsY0FBMEMsQ0FBQztBQUNuRCxTQUFRLGNBQTBDLENBQUM7QUFHbkQ7QUFBQSxTQUFpQix5QkFBeUIsb0JBQUksSUFBWTtBQVUxRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBbUIsMkJBQW1DO0FBQ3RELFNBQW1CLDJCQUFtQztBQUN0RCxTQUFtQiwwQkFBa0M7QUFFckQ7QUFBQSxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFPNUU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUSwwQkFBMEI7QUFPbEMsU0FBaUIsd0JBQXdCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBd0IvRTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLCtCQUErQixvQkFBSSxJQUFZO0FBRWhFLFNBQWlCLDBCQUEwQixvQkFBSSxRQUFlO0FBQzlELFNBQWlCLDJCQUEyQixJQUFJLFVBQVU7QUFTMUQ7QUFBQSxTQUFRLDhCQUE4QjtBQUN0QyxTQUFpQixrQ0FBa0MsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3JGLFNBQVMsaUNBQWlDLEtBQUssZ0NBQWdDO0FBTS9FLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxjQUF3QyxDQUFDO0FBRW5HO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQTRCO0FBR2pFO0FBQUEsU0FBaUIsY0FBYyxvQkFBSSxJQUFpQjtBQUVwRDtBQUFBLFNBQWlCLHFCQUFxQixvQkFBSSxJQUFpQjtBQXVDM0Q7QUFBQSxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksUUFBOEIsQ0FBQztBQUMxRixTQUFTLHNCQUFtRCxLQUFLLHFCQUFxQjtBQUN0RixTQUFpQixvQkFBb0Isb0JBQUksSUFBb0M7QUFFN0U7QUFBQSxTQUFpQix1QkFBdUIsb0JBQUksSUFBaUM7QUFFN0UsU0FBUSxrQkFBa0I7QUFRMUI7QUFBQSxTQUFpQixpQkFBaUIsSUFBSSxZQUEwQjtBQUtoRTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHNCQUFzQixJQUFJLFlBQXNDO0FBeUhqRixTQUFRLDBCQUFtQyxLQUFLLHNCQUFzQjtBQUN0RSxTQUFRLHlCQUFrQyxLQUFLLHFCQUFxQjtBQUNwRSxTQUFRLGlDQUE0RCxLQUFLLDhCQUE4QjtBQUN2RyxTQUFRLHNCQUEwQyxLQUFLLG1CQUFtQjtBQUMxRSxTQUFRLDBCQUFtQyxLQUFLLHNCQUFzQjtBQUV0RSxTQUFRLDRCQUFxQyxLQUFLLGtDQUFrQztBQWloRHBGO0FBQUE7QUFBQTtBQUFBLFNBQVMsUUFBcUI7QUFBQSxNQUM3QixZQUFZLENBQUMsTUFBVyxTQUFrQyxZQUF1RTtBQUNoSSxhQUFLLHdCQUF3QixPQUFPO0FBQ3BDLGVBQU8sS0FBSyxZQUFZLE1BQU0sd0JBQXdCLFNBQVMsSUFBSSxHQUFHLE9BQU87QUFBQSxNQUM5RTtBQUFBLE1BQ0EsYUFBYSxDQUFDLFNBQWMsWUFBb0QsS0FBSyxhQUFhLFNBQVMsT0FBTztBQUFBLE1BQ2xILGFBQWEsQ0FBQyxTQUFjLFlBQW9ELEtBQUssYUFBYSxTQUFTLE9BQU87QUFBQSxNQUNsSCxhQUFhLENBQUMsU0FBYyxRQUFnQiwrQkFBaUUsYUFBNEMsUUFBaUIsZ0JBQXlCLHFCQUFxRSxZQUFxRDtBQUM1VCxjQUFNLHFCQUFxQixNQUFNLFFBQVEsNkJBQTZCLElBQUksZ0NBQWdDLGdDQUFnQyxDQUFDLDZCQUE2QixJQUFJO0FBQzVLLGNBQU0sYUFBYSxPQUFPLHdCQUF3QixXQUFXLHNCQUFzQixvQkFBb0I7QUFDdkcsY0FBTSxtQkFBbUIsWUFBWSxPQUFPLHdCQUF3QixXQUFXLFNBQVk7QUFDM0YsY0FBTSx5QkFBeUIsSUFBSSxNQUFNLGdCQUFnQixJQUFJLFNBQVksa0JBQWtCO0FBQzNGLGVBQU8sS0FBSyxhQUFhLFNBQVMsUUFBUSxhQUFhLFFBQVEsZ0JBQWdCLFlBQVksb0JBQW9CLGtCQUFrQixzQkFBc0I7QUFBQSxNQUN4SjtBQUFBLE1BQ0EsT0FBTyxDQUFDLFNBQWMsWUFBb0Q7QUFDekUsZUFBTyxLQUFLLGNBQWMsU0FBUyxPQUFPO0FBQUEsTUFDM0M7QUFBQSxNQUNBLGFBQWEsQ0FBQyxTQUFjLE9BQXVCLFlBQW9EO0FBQ3RHLGVBQU8sS0FBSyxhQUFhLFNBQVMsT0FBTyxPQUFPO0FBQUEsTUFDakQ7QUFBQSxNQUNBLGFBQWEsQ0FBQyxTQUFjLE9BQW1DLFlBQW9EO0FBQ2xILGVBQU8sS0FBSyxhQUFhLFNBQVMsT0FBTyxPQUFPO0FBQUEsTUFDakQ7QUFBQSxNQUNBLGFBQWEsQ0FBQyxNQUFXLFlBQStELEtBQUssaUJBQWlCLE1BQU0sT0FBTztBQUFBLElBQzVIO0FBME9BO0FBQUEsU0FBaUIsK0JBQStCLG9CQUFJLElBQTBEO0FBMTNEN0csU0FBSyxrQ0FBa0MsS0FBSyx3QkFBd0I7QUFDcEUsU0FBSyxXQUFXLEtBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLGtCQUFrQixNQUFNLEtBQUssY0FBYyxDQUFDLENBQUM7QUFDdEgsU0FBSyxtQkFBbUIsS0FBSyxzQkFBc0IsZUFBZSxzQkFBc0I7QUFDeEYsU0FBSyxzQkFBc0IsNkJBQTZCLEVBQUUsQ0FBQyxvQ0FBb0MsR0FBRyxPQUFVLENBQUM7QUFDN0csU0FBSyw0QkFBNEIsS0FBSyxzQkFBc0IsZUFBZSxpQ0FBaUMsTUFBTSxLQUFLLDZCQUE2QixNQUFNLEtBQUssd0JBQXdCO0FBQ3ZMLFNBQUssVUFBVSxLQUFLLHNCQUFzQixzQkFBc0IsTUFBTSxLQUFLLCtCQUErQixDQUFDLENBQUM7QUFDNUcsU0FBSywrQkFBK0I7QUFDcEMsU0FBSyx3QkFBd0IsSUFBSSw0QkFBNEIsTUFBTSxLQUFLLGNBQWMsRUFBRSxLQUFLLE9BQUssRUFBRSxJQUFJLFNBQVMsS0FBSyxFQUFFLEtBQUssQ0FBQUEsT0FBS0EsR0FBRSxRQUFRLENBQUMsR0FBRyxLQUFLLFdBQVc7QUFDaEssU0FBSyx5QkFBeUIsNEJBQTRCLEtBQUssaUJBQWlCLElBQzdFLElBQUksK0JBQStCLEtBQUssaUJBQWlCLElBQ3pEO0FBQ0gsU0FBSyw0QkFBNEIsS0FBSyxTQUFTO0FBRS9DLFNBQUssVUFBVSxtQkFBbUIsd0JBQXdCLENBQUMsRUFBRSxVQUFVLFNBQVMsTUFBTSxNQUFNO0FBQzNGLFVBQUksYUFBYSxLQUFLLElBQUk7QUFDekIsYUFBSyxhQUFhLHdCQUF3QixLQUFLLG1CQUFtQixPQUFPLEdBQUcsUUFBUSxTQUFTLEdBQUcsS0FBSztBQUFBLE1BQ3RHO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFJRixTQUFLLFVBQVUsS0FBSyxtQkFBbUIsTUFBTSxZQUFVLEtBQUssa0NBQWtDLE1BQU0sQ0FBQyxDQUFDO0FBQ3RHLFNBQUssVUFBVSxZQUFZLGlCQUFpQixJQUFJO0FBQUEsTUFBc0MsS0FBSztBQUFBLE1BQzFGO0FBQUEsUUFDQyxxQkFBcUIsTUFBTSxLQUFLLHFCQUFxQjtBQUFBLFFBQ3JELHlCQUF5QixDQUFDLFdBQVcsWUFBWSxLQUFLLHlCQUF5QixXQUFXLE9BQU87QUFBQSxRQUNqRywwQkFBMEIsQ0FBQyxjQUFjO0FBQ3hDLGdCQUFNLFVBQVUsYUFBYSxJQUFJLEtBQUssSUFBSSxTQUFTO0FBQ25ELGdCQUFNLE9BQU8sSUFBSSxNQUFNLG9CQUFvQixPQUFPLENBQUM7QUFDbkQsaUJBQU8sS0FBSyxzQkFBc0IsTUFBTSxFQUFFLHVCQUF1QixTQUFTLFVBQVUsS0FBSyxDQUFDO0FBQUEsUUFDM0Y7QUFBQSxRQUNBLHVCQUF1QixDQUFDLGNBQWMsS0FBSyx1QkFBdUIsU0FBUztBQUFBLE1BQzVFO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBS0YsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHNCQUFzQixNQUFNO0FBQ3JFLFdBQUsscUNBQXFDLEVBQUU7QUFBQSxRQUFNLFNBQ2pELEtBQUssWUFBWSxNQUFNLGdEQUFnRCxHQUFHO0FBQUEsTUFDM0U7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLHdCQUF3QixZQUFZLE1BQU07QUFDN0QsV0FBSyxxQ0FBcUMsRUFBRTtBQUFBLFFBQU0sU0FDakQsS0FBSyxZQUFZLE1BQU0scURBQXFELEdBQUc7QUFBQSxNQUNoRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHNCQUFzQixNQUFNO0FBQ3JFLFlBQU0sVUFBVSxLQUFLLGtDQUFrQztBQUN2RCxVQUFJLFlBQVksS0FBSywyQkFBMkI7QUFDL0MsYUFBSyw0QkFBNEI7QUFDakMsWUFBSSxTQUFTO0FBQ1osZUFBSyxLQUFLLGtCQUFrQjtBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBTUYsU0FBSyxVQUFVLEtBQUssb0JBQW9CLGtCQUFrQixNQUFNO0FBQy9ELFdBQUssWUFBWSxLQUFLLGtEQUFrRDtBQUN4RSxXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLENBQUMsQ0FBQztBQVNGLFNBQUssVUFBVSxLQUFLLHVCQUF1QixZQUFZLE1BQU07QUFDNUQsV0FBSyxxQ0FBcUMsRUFBRTtBQUFBLFFBQU0sU0FDakQsS0FBSyxZQUFZLE1BQU0sNERBQTRELEdBQUc7QUFBQSxNQUN2RjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBdExBLGtCQUFrQixNQUFrQztBQUNuRCxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFPQSxJQUFJLDZCQUFzQztBQUN6QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFXUSxtQkFBbUIsTUFBVyxPQUFZLGNBQXlCO0FBQzFFLFNBQUssWUFBWSxJQUFJLEtBQUssU0FBUyxHQUFHLEtBQUs7QUFDM0MsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLFNBQVMsR0FBRyxZQUFZO0FBQUEsRUFDMUQ7QUFBQTtBQUFBLEVBR1Esa0JBQWtCLE1BQWdCO0FBQ3pDLFVBQU0sUUFBUSxLQUFLLFlBQVksSUFBSSxLQUFLLFNBQVMsQ0FBQztBQUNsRCxRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sSUFBSSxNQUFNLHdDQUF3QyxLQUFLLFNBQVMsQ0FBQyxtRUFBbUU7QUFBQSxJQUMzSTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx5QkFBeUIsTUFBZ0I7QUFDaEQsV0FBTyxLQUFLLG1CQUFtQixJQUFJLEtBQUssU0FBUyxDQUFDLEtBQUssS0FBSyxrQkFBa0IsSUFBSTtBQUFBLEVBQ25GO0FBQUE7QUFBQSxFQUdRLHdCQUF3QixPQUFvQjtBQUNuRCxRQUFJLFFBQVE7QUFDWixlQUFXLFlBQVksS0FBSyxZQUFZLE9BQU8sR0FBRztBQUNqRCxVQUFJLFFBQVEsVUFBVSxLQUFLLEdBQUc7QUFDN0I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdRLG1CQUFtQixXQUFtQixTQUFpRDtBQUM5RixXQUFPO0FBQUEsTUFDTixjQUFjLG1CQUFtQixPQUFPO0FBQUEsTUFDeEMsR0FBSSxRQUFRLGlCQUFpQixZQUFZLEVBQUUsZ0JBQWdCLGFBQWEsSUFBSSxLQUFLLElBQUksUUFBUSxZQUFZLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDakg7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBdUlRLGtDQUFrQyxRQUEyQjtBQUNwRSxVQUFNLFFBQVEsbUJBQW1CLGFBQWEsTUFBTTtBQUNwRCxRQUFJLE9BQU87QUFDVixXQUFLLGdCQUFnQixLQUFLLEtBQUs7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFBQSxFQVVRLHdCQUFpQztBQUN4QyxXQUFPLEtBQUssc0JBQXNCLGFBQWEsb0JBQW9CLG9DQUFvQyxNQUFNO0FBQUEsRUFDOUc7QUFBQSxFQUVRLHVCQUFnQztBQUN2QyxXQUFPLEtBQUssc0JBQXNCLGFBQWEsd0JBQXdCLG9CQUFvQixVQUFVLEtBQUs7QUFBQSxFQUMzRztBQUFBLEVBRVEsZ0NBQTJEO0FBQ2xFLFdBQU8sS0FBSyxzQkFBc0IsYUFBYSx3QkFBd0Isb0JBQW9CLGtCQUFrQixLQUFLO0FBQUEsRUFDbkg7QUFBQSxFQUVRLDJCQUEyQixZQUFzRjtBQUN4SCxXQUFPLGVBQWUsV0FBVyxLQUFLLFlBQVksU0FBUyxNQUFNLFNBQVMsUUFBUSxRQUFRO0FBQUEsRUFDM0Y7QUFBQSxFQUVRLHFCQUF5QztBQUNoRCxXQUFPLEtBQUssdUJBQXVCLGtCQUFrQjtBQUFBLEVBQ3REO0FBQUEsRUFFUSx3QkFBaUM7QUFDeEMsV0FBTyxLQUFLLHNCQUFzQixhQUFhLG9CQUFvQixvQ0FBb0MsTUFBTTtBQUFBLEVBQzlHO0FBQUEsRUFFUSxvQ0FBNkM7QUFDcEQsV0FBTyxLQUFLLHNCQUFzQixhQUFhLG9CQUFvQixnREFBZ0QsTUFBTTtBQUFBLEVBQzFIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsaUNBQXVDO0FBQzlDLFVBQU0sUUFBUSxLQUFLLHNCQUFzQixzQkFBc0IsRUFBRSxvQ0FBb0M7QUFDckcsUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixXQUFLLDJCQUEyQixTQUFTO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLHVDQUFzRDtBQUNuRSxVQUFNLGNBQWMsS0FBSyxzQkFBc0I7QUFDL0MsVUFBTSxhQUFhLEtBQUsscUJBQXFCO0FBQzdDLFVBQU0sNEJBQTRCLEtBQUssOEJBQThCO0FBQ3JFLFVBQU0saUJBQWlCLEtBQUssbUJBQW1CO0FBQy9DLFVBQU0scUJBQXFCLEtBQUssc0JBQXNCO0FBQ3RELFVBQU0sNkJBQTZCLEtBQUssd0JBQXdCO0FBQ2hFLFFBQUksS0FBSyw0QkFBNEIsZUFBZSxLQUFLLDJCQUEyQixjQUFjLEtBQUssbUNBQW1DLDZCQUE2QixLQUFLLHdCQUF3QixrQkFBa0IsS0FBSyw0QkFBNEIsc0JBQXNCLE9BQU8sS0FBSyxpQ0FBaUMsMEJBQTBCLEdBQUc7QUFDdFY7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVO0FBQUEsTUFDZixLQUFLLDRCQUE0QixjQUFjLGVBQWUsV0FBVyxLQUFLO0FBQUEsTUFDOUUsS0FBSywyQkFBMkIsYUFBYSxjQUFjLFVBQVUsS0FBSztBQUFBLE1BQzFFLEtBQUssbUNBQW1DLDRCQUE0QixzQkFBc0IseUJBQXlCLEtBQUs7QUFBQSxNQUN4SCxLQUFLLHdCQUF3QixpQkFBaUIsa0JBQWtCLGNBQWMsS0FBSztBQUFBLE1BQ25GLEtBQUssNEJBQTRCLHFCQUFxQixlQUFlLGtCQUFrQixLQUFLO0FBQUEsTUFDNUYsQ0FBQyxPQUFPLEtBQUssaUNBQWlDLDBCQUEwQixJQUFJLCtCQUErQjtBQUFBLElBQzVHLEVBQUUsT0FBTyxDQUFDLE1BQW1CLE1BQU0sTUFBUyxFQUFFLEtBQUssSUFBSTtBQUN2RCxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLHlCQUF5QjtBQUM5QixTQUFLLGlDQUFpQztBQUN0QyxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLDBCQUEwQjtBQUMvQixTQUFLLGtDQUFrQztBQUN2QyxRQUFJLEtBQUssU0FBUztBQUNqQixXQUFLLFlBQVksS0FBSyxxQ0FBcUMsT0FBTyw2QkFBNkI7QUFBQSxJQUNoRztBQUNBLFVBQU0sS0FBSyxzQkFBc0IsMkJBQTJCLE9BQU8sRUFBRTtBQUFBLEVBQ3RFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWVBLE1BQWMsc0JBQXNCLFFBQStCO0FBQ2xFLFFBQUksS0FBSyxvQkFBcUIsQ0FBQyxLQUFLLFdBQVcsQ0FBQyxLQUFLLGlCQUFrQjtBQUN0RTtBQUFBLElBQ0Q7QUFDQSxTQUFLLDZCQUE2QixJQUFJLE1BQU07QUFDNUMsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixVQUFJO0FBQ0gsY0FBTSxLQUFLO0FBQUEsTUFDWixRQUFRO0FBQ1AsYUFBSyw2QkFBNkIsT0FBTyxNQUFNO0FBQy9DO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsSUFDRDtBQUNBLFVBQU0sWUFBWSxLQUFLLHFCQUFxQjtBQUM1QyxRQUFJLFlBQVksR0FBRztBQUNsQixXQUFLLFlBQVksS0FBSyw4Q0FBOEMsTUFBTSxXQUFXLFNBQVMsMkJBQTJCO0FBQ3pIO0FBQUEsSUFDRDtBQUNBLFVBQU0sS0FBSywyQkFBMkI7QUFBQSxFQUN2QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWMsNkJBQTRDO0FBQ3pELFFBQUksS0FBSyw2QkFBNkIsU0FBUyxLQUFLLEtBQUssb0JBQW9CLENBQUMsS0FBSyxXQUFXLEtBQUsscUJBQXFCLElBQUksR0FBRztBQUM5SDtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsQ0FBQyxHQUFHLEtBQUssNEJBQTRCLEVBQUUsS0FBSyxJQUFJO0FBQy9ELFNBQUssWUFBWSxLQUFLLHVDQUF1QyxNQUFNLEdBQUc7QUFDdEUsU0FBSyxvQkFBb0IsbUJBQW1CO0FBQzVDLFVBQU0sS0FBSyxZQUFZO0FBT3ZCLFNBQUssY0FBYyxDQUFDO0FBQ3BCLFNBQUssZUFBZTtBQUNwQixTQUFLLEtBQUssc0JBQXNCO0FBQUEsRUFDakM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxtQkFBeUI7QUFDaEMsUUFBSSxLQUFLLDZCQUE2QixTQUFTLEdBQUc7QUFDakQ7QUFBQSxJQUNEO0FBQ0EsbUJBQWUsTUFBTTtBQUNwQixXQUFLLDJCQUEyQixFQUFFO0FBQUEsUUFBTSxTQUN2QyxLQUFLLFlBQVksTUFBTSxxREFBcUQsR0FBRztBQUFBLE1BQ2hGO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsT0FBZ0IsV0FBMEMsYUFBdUc7QUFDM00sVUFBTSxjQUFjLDZCQUE2QixLQUFLO0FBQ3RELFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxpQkFBaUIsU0FBUyxLQUFLLHdCQUF3QixJQUFJLEtBQUssR0FBRztBQUN0RSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sa0JBQWtCLEtBQUssMkJBQTJCLG1CQUFtQixhQUFhO0FBQ3hGLFVBQU0sa0JBQWtCLGdCQUFnQixzQkFBc0IsQ0FBQyxLQUFLLG9CQUFvQixLQUFLLDhCQUE4QjtBQUMzSCwrQkFBMkIsS0FBSyxtQkFBbUIsaUJBQWlCLGFBQWEsV0FBVyxLQUFLLHFCQUFxQixHQUFHLGlCQUFpQixPQUFPLFdBQVc7QUFDNUosUUFBSSxnQkFBZ0Isc0JBQXNCLEtBQUssa0JBQWtCO0FBQ2hFLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLEtBQUssMkJBQTJCO0FBQ3BDLFlBQU0sV0FBVyxLQUFLLDZCQUE2QixpQkFBaUIsV0FBVztBQUMvRSxXQUFLLDRCQUE0QixFQUFFLGlCQUFpQixTQUFTLFNBQVM7QUFDdEUsWUFBTSxVQUFVLE1BQU07QUFDckIsWUFBSSxLQUFLLDJCQUEyQixZQUFZLFVBQVU7QUFDekQsZUFBSyw0QkFBNEI7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFDQSxlQUFTLEtBQUssU0FBUyxPQUFPO0FBQUEsSUFDL0I7QUFFQSxXQUFPLEtBQUssMEJBQTBCO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE1BQWMsNkJBQTZCLGlCQUF5QixhQUF3RjtBQUMzSixVQUFNLFlBQVksVUFBVSxPQUFPO0FBQ25DLFVBQU0sU0FBUyxNQUFNLEtBQUssK0JBQStCLGVBQWU7QUFDeEUsZ0NBQTRCLEtBQUssbUJBQW1CO0FBQUEsTUFDbkQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZLFVBQVUsUUFBUTtBQUFBLE1BQzlCLGlCQUFpQixPQUFPLGNBQWM7QUFBQSxNQUN0QyxlQUFlLE9BQU87QUFBQSxJQUN2QixDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsK0JBQStCLGlCQUEwRTtBQUN0SCxTQUFLLFlBQVksTUFBTSxpREFBaUQ7QUFDeEUsVUFBTSxnQkFBZ0Isb0JBQUksSUFBWTtBQUN0QyxVQUFNLFFBQW1CO0FBQUEsTUFDeEIsV0FBVztBQUFBLE1BQ1gsU0FBUyxTQUFTLGlDQUFpQyxtREFBbUQ7QUFBQSxJQUN2RztBQUNBLGVBQVcsUUFBUSxLQUFLLGlCQUFpQixHQUFHO0FBQzNDLFlBQU0sZ0JBQWdCLEtBQUs7QUFDM0IsWUFBTSxlQUFlLEtBQUssZUFBZSxLQUFLO0FBQzlDLFVBQUksY0FBYztBQUNqQixzQkFBYyxJQUFJLFlBQVk7QUFDOUI7QUFBQSxVQUNDLEtBQUs7QUFBQSxVQUNMO0FBQUEsVUFDQSxnQ0FBZ0MsS0FBSyxZQUFZLEtBQUssU0FBUyxjQUFjLEtBQUssV0FBVyxhQUFhO0FBQUEsUUFDM0c7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssb0JBQW9CLG1CQUFtQjtBQUM1QyxRQUFJLGdCQUFnQjtBQUNwQixRQUFJO0FBQ0gsWUFBTSxLQUFLLFlBQVk7QUFBQSxJQUN4QixTQUFTQyxRQUFPO0FBQ2Ysc0JBQWdCO0FBQ2hCLFdBQUssWUFBWSxNQUFNQSxRQUFPLDRDQUE0QztBQUFBLElBQzNFO0FBQ0EsU0FBSyxjQUFjLENBQUM7QUFDcEIsU0FBSyxlQUFlO0FBQ3BCLFdBQU8sRUFBRSxlQUFlLGNBQWM7QUFBQSxFQUN2QztBQUFBLEVBRUEsTUFBYyw0QkFBK0IsV0FBMEMsTUFBd0IsYUFBc0Q7QUFDcEssUUFBSTtBQUNILGFBQU8sTUFBTSxLQUFLO0FBQUEsSUFDbkIsU0FBUyxPQUFPO0FBQ2YsVUFBSSxDQUFDLE1BQU0sS0FBSyw2QkFBNkIsT0FBTyxXQUFXLFdBQVcsR0FBRztBQUM1RSxjQUFNO0FBQUEsTUFDUDtBQUNBLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQkFBMEIsTUFBVyxRQUFpQixrQkFBd0U7QUFDckksVUFBTSxVQUFVLEtBQUssd0JBQXdCLE1BQU0sZ0JBQWdCO0FBQ25FLFVBQU0seUJBQXlCLElBQUksTUFBTSxnQkFBZ0IsSUFBSSxTQUFZLGtCQUFrQjtBQUMzRixXQUFPLGdDQUFnQyxRQUFRLHVCQUF1QixNQUFNLFFBQVEsUUFBUSxRQUFRLGFBQWEsUUFBUSxpQkFBaUIsc0JBQXNCO0FBQUEsRUFDaks7QUFBQTtBQUFBLEVBR1EsdUJBQStCO0FBQ3RDLFdBQU8sS0FBSyxpQkFBaUIsRUFBRSxPQUFPLGFBQVcsUUFBUSxhQUFhLEVBQUU7QUFBQSxFQUN6RTtBQUFBLEVBRVUscUJBQXFCLFNBQThDO0FBQzVFLFdBQU8sSUFBSSxjQUFjLE9BQU87QUFBQSxFQUNqQztBQUFBO0FBQUEsRUFJQSxnQkFBa0M7QUFDakMsV0FBTztBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsYUFBYTtBQUFBLE1BQ2IsYUFBYSxTQUFTLDRCQUE0QiwyREFBMkQ7QUFBQSxNQUM3RyxjQUFjO0FBQUEsUUFDYixlQUFlLEVBQUUsTUFBTSxNQUFNLFVBQVUsS0FBSztBQUFBLFFBQzVDLEdBQUksS0FBSyxvQkFBb0IsSUFBSSxFQUFFLDRCQUE0QixFQUFFLGtCQUFrQixLQUFLLEVBQUUsSUFBSSxDQUFDO0FBQUEsTUFDaEc7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsc0JBQStCO0FBQ3RDLFdBQU8sS0FBSyxzQkFBc0IsYUFBYSxvQkFBb0IseUNBQXlDLE1BQU07QUFBQSxFQUNuSDtBQUFBLEVBRUEsd0JBQXFEO0FBQ3BELFVBQU0sMkJBQTJCLEtBQUssc0JBQXNCLGFBQWEsb0NBQW9DLG1CQUFtQix3QkFBd0IsTUFBTTtBQUM5SixVQUFNLGtCQUFrQixLQUFLLHVCQUF1QixtQkFBbUI7QUFDdkUsV0FBTztBQUFBLE1BQ04sNEJBQTRCLEtBQUssWUFBWSxTQUFTLElBQUksRUFBRSxHQUFHLGlCQUFpQixVQUFVLE1BQU0sSUFBSTtBQUFBLE1BQ3BHLEtBQUssdUJBQXVCLGdCQUFnQjtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxpQ0FBZ0Y7QUFDckYsUUFBSSxVQUFVLFFBQVEsSUFBSSxxQ0FBcUMsS0FBSztBQUNwRSxRQUFJLEtBQUssY0FBYztBQUN0QixVQUFJO0FBQ0gsa0JBQVUsTUFBTSxLQUFLLG1CQUFtQixtQkFBbUIsS0FBSyxZQUFZLEtBQUs7QUFBQSxNQUNsRixTQUFTLE9BQU87QUFDZixhQUFLLFlBQVksTUFBTSwyRUFBMkUsT0FBTyxLQUFLLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDdks7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLElBQUksSUFBSSxPQUFPO0FBQ25DLGdCQUFZLFdBQVcsR0FBRyxZQUFZLFNBQVMsUUFBUSxPQUFPLEVBQUUsQ0FBQztBQUNqRSxXQUFPO0FBQUEsTUFDTixFQUFFLE1BQU0sY0FBYyxLQUFLLEtBQUssdUJBQXVCLGNBQWMsRUFBRTtBQUFBLE1BQ3ZFLEVBQUUsTUFBTSxzQkFBc0IsS0FBSyxZQUFZLFNBQVMsRUFBRTtBQUFBLElBQzNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSwrQkFBNEQ7QUFDakUsV0FBTyxLQUFLLGVBQWUsS0FBSyxtQkFBbUIsbUJBQW1CLEtBQUssWUFBWSxJQUFJO0FBQUEsRUFDNUY7QUFBQSxFQUVBLE1BQU0sZ0NBQTRFO0FBQ2pGLFNBQUssWUFBWSxNQUFNLDJEQUEyRDtBQUNsRixRQUFJLFFBQVE7QUFDWixVQUFNLGVBQWUsWUFBWTtBQUNoQyxZQUFNLGlCQUFpQixXQUFXLFVBQVUsc0JBQXNCLENBQUM7QUFDbkUsWUFBTSxVQUFVLE1BQU0sc0JBQXNCLGNBQWM7QUFDMUQsWUFBTSxpQkFBaUIsS0FBSyxRQUFRLE9BQU8sR0FBRyxPQUFPLFVBQVU7QUFDL0QsY0FBUTtBQUNSLFVBQUksQ0FBQyxNQUFNLFdBQVcsY0FBYyxHQUFHO0FBQ3RDLGNBQU0sSUFBSSxNQUFNLG9DQUFvQyxjQUFjLEVBQUU7QUFBQSxNQUNyRTtBQUNBLGNBQVE7QUFDUixZQUFNLGFBQXNCLE1BQU0sT0FBTyxjQUFjLGNBQWMsRUFBRTtBQUN2RSxVQUFJLENBQUMsbUNBQW1DLFVBQVUsR0FBRztBQUNwRCxjQUFNLElBQUksTUFBTSwwREFBMEQ7QUFBQSxNQUMzRTtBQUVBLGNBQVE7QUFDUixZQUFNLFFBQVEsTUFBTSxLQUFLLG9CQUFvQjtBQUM3QyxjQUFRO0FBQ1IsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLEtBQUssdUJBQXVCLGlCQUFpQixLQUFLO0FBQUEsUUFDbEQsWUFBWSxRQUFRLCtDQUErQztBQUFBLFFBQ25FO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUc7QUFDSCxVQUFNLFNBQVMsTUFBTSxZQUFZLGFBQWEsK0NBQStDO0FBQzdGLFFBQUksQ0FBQyxRQUFRO0FBQ1osV0FBSyxZQUFZLEtBQUssa0VBQWtFLEtBQUssRUFBRTtBQUMvRixZQUFNLElBQUksTUFBTSwwREFBMEQsS0FBSyxHQUFHO0FBQUEsSUFDbkY7QUFDQSxTQUFLLFlBQVksTUFBTSwwREFBMEQ7QUFDakYsV0FBTztBQUFBLE1BQ04sR0FBRyxPQUFPO0FBQUEsTUFDVixHQUFJLE9BQU8sVUFBVSxFQUFFLFNBQVMsT0FBTyxRQUFRLElBQUksQ0FBQztBQUFBLElBQ3JEO0FBQUEsRUFDRDtBQUFBLEVBRUEsb0JBQThDO0FBQzdDLFdBQU8sS0FBSyxTQUFTLGdDQUFnQztBQUFBLEVBQ3REO0FBQUE7QUFBQSxFQUdRLDRCQUE0QixTQUFjLGdCQUE0RDtBQUM3RyxRQUFJLGdCQUFnQjtBQUNuQixXQUFLLG9CQUFvQixJQUFJLFNBQVMsY0FBYztBQUFBLElBQ3JEO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHUSx3QkFBd0IsU0FBb0Q7QUFDbkYsUUFBSSxDQUFDLFdBQVcsSUFBSSxNQUFNLE9BQU8sR0FBRztBQUNuQztBQUFBLElBQ0Q7QUFDQSxTQUFLLDRCQUE0QixRQUFRLHVCQUF1QiwrQkFBK0IsT0FBTyxDQUFDO0FBQUEsRUFDeEc7QUFBQTtBQUFBLEVBR1EsNEJBQTRCLFNBQXdDO0FBQzNFLFdBQU8sS0FBSyxvQkFBb0IsSUFBSSxPQUFPLEtBQUs7QUFBQSxFQUNqRDtBQUFBO0FBQUEsRUFHQSxNQUFNLHNCQUFzQixNQUFXLFNBQWtDLG9CQUFrRjtBQUMxSixVQUFNLFVBQVUsd0JBQXdCLFNBQVMsSUFBSSxFQUFFO0FBQ3ZELFNBQUssNEJBQTRCLFNBQVMsa0JBQWtCO0FBQzVELFVBQU0sVUFBVSxNQUFNLEtBQUssZ0NBQWdDLE9BQU87QUFDbEUsVUFBTSxlQUFlLEtBQUsseUJBQXlCLFNBQVMsUUFBUSxTQUFTO0FBQzdFLFFBQUksUUFBUSxpQkFBaUI7QUFLNUIsbUJBQWEsaUJBQWlCLHlCQUF5QixRQUFRLHFCQUFxQjtBQUFBLElBQ3JGO0FBQ0EsVUFBTSxjQUFjLE1BQU0sYUFBYSxpQkFBaUIseUJBQXlCO0FBQ2pGLFVBQU0sY0FBYyxLQUFLLGlCQUFpQixPQUFPO0FBQ2pELFVBQU0sY0FBYyxhQUFhLGlCQUFpQjtBQUFBLE1BQ2pELGFBQWEsMEJBQTBCLEtBQUssQ0FBQztBQUFBLE1BQzdDLGFBQWEsa0JBQWtCO0FBQUEsSUFDaEM7QUFDQSxVQUFNLGlCQUFpQixDQUFDLEdBQUcsYUFBYSxHQUFHLFdBQVc7QUFDdEQsV0FBTyx5QkFBeUIsZ0JBQWdCLEtBQUssNEJBQTRCLE9BQU8sQ0FBQztBQUFBLEVBQzFGO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixTQUFjLFlBQW9CLFFBQWdCLFFBQStEO0FBQ3ZJLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixPQUFPO0FBQzNDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sdUNBQXVDLGFBQWEsR0FBRyxPQUFPLENBQUMsRUFBRTtBQUFBLElBQ2xGO0FBQ0EsV0FBTyxNQUFNLGlCQUFpQixZQUFZLFFBQVEsTUFBTTtBQUFBLEVBQ3pEO0FBQUEsRUFFQSxtQkFBbUIsU0FBdUQ7QUFDekUsV0FBTyxLQUFLLGlCQUFpQixPQUFPLEdBQUcsZ0JBQWdCO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLE1BQU0sZUFBZSxTQUFjLElBQTJCO0FBQzdELFVBQU0sS0FBSyxpQkFBaUIsT0FBTyxHQUFHLGVBQWUsRUFBRTtBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFNLGNBQWMsU0FBYyxJQUEyQjtBQUM1RCxVQUFNLEtBQUssaUJBQWlCLE9BQU8sR0FBRyxjQUFjLEVBQUU7QUFBQSxFQUN2RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV1Esb0NBQW9DLG9CQUFnRTtBQUMzRyxRQUFJLENBQUMsS0FBSyxvQkFBb0IsS0FBSyxDQUFDLHNCQUFzQixtQkFBbUIsVUFBVSxHQUFHO0FBQ3pGLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxXQUFPLG1CQUFtQixNQUFNLENBQUM7QUFBQSxFQUNsQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY0EsTUFBYyxnQ0FBZ0MsU0FBbUo7QUFDaE0sVUFBTSxZQUFZLGFBQWEsR0FBRyxPQUFPO0FBQ3pDLFVBQU0sY0FBYyxLQUFLLHFCQUFxQixJQUFJLFNBQVM7QUFDM0QsUUFBSSxhQUFhO0FBQ2hCLGFBQU87QUFBQSxRQUNOLFdBQVcsWUFBWTtBQUFBLFFBQ3ZCLHVCQUF1QixLQUFLLG9DQUFvQyxZQUFZLGtCQUFrQjtBQUFBLFFBQzlGLGlCQUFpQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQixPQUFPO0FBQzNDLFFBQUksT0FBTztBQUlWLGFBQU8sRUFBRSxXQUFXLE1BQU0sd0JBQXdCLHVCQUF1QixDQUFDLEdBQUcsaUJBQWlCLE1BQU07QUFBQSxJQUNyRztBQUNBLFVBQU0sV0FBVyxNQUFNLEtBQUsscUJBQXFCLE9BQU87QUFDeEQsV0FBTztBQUFBLE1BQ04sV0FBVyxTQUFTLG9CQUFvQixTQUFTO0FBQUEsTUFDakQsdUJBQXVCLEtBQUssb0NBQW9DLFNBQVMsa0JBQWtCO0FBQUEsTUFDM0YsaUJBQWlCO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLGFBQWEsVUFBa0IsT0FBaUM7QUFDckUsUUFBSSxhQUFhLEtBQUssdUJBQXVCLGdCQUFnQixFQUFFLFVBQVU7QUFDeEUsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLGFBQWEsS0FBSyx1QkFBdUIsbUJBQW1CLEVBQUUsVUFBVTtBQUMzRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sS0FBSyx5QkFBeUIsTUFBTSxZQUFZO0FBQ3JELFdBQUssd0JBQXdCLElBQUksUUFBVyxNQUFTO0FBQ3JELFlBQU0sS0FBSyxrQkFBa0IsU0FBUyxNQUFTO0FBQUEsSUFDaEQsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLGtCQUFrQixPQUEwQztBQUN6RSxRQUFJLEtBQUssaUJBQWlCLE9BQU87QUFDaEM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxZQUFZLEtBQUssd0JBQXdCLFFBQVEsWUFBWSxTQUFTLEVBQUU7QUFDN0UsU0FBSyxlQUFlO0FBQ3BCLFNBQUssMkJBQTJCLEtBQUs7QUFDckMsUUFBSSxDQUFDLE9BQU87QUFDWCxZQUFNLEtBQUssc0JBQXNCLCtCQUErQjtBQUNoRSxXQUFLLEtBQUssc0JBQXNCO0FBQ2hDO0FBQUEsSUFDRDtBQUNBLFVBQU0sT0FBTyxLQUFLLHVCQUF1QixpQkFBaUIsS0FBSztBQUMvRCxRQUFJLGtCQUFrQjtBQUN0QixlQUFXLFdBQVcsS0FBSyxpQkFBaUIsR0FBRztBQUM5QyxVQUFJO0FBQ0gsY0FBTSxTQUFTLE1BQU0sUUFBUSx3QkFBd0IsTUFBTSxLQUFLO0FBQ2hFLFlBQUksQ0FBQyxPQUFPLFNBQVM7QUFDcEIsNEJBQWtCO0FBQ2xCLGVBQUssWUFBWSxLQUFLLFlBQVksUUFBUSxTQUFTLGtGQUFrRjtBQUFBLFFBQ3RJLFdBQVcsT0FBTyx3QkFBd0IsT0FBTztBQUNoRCxlQUFLLFlBQVksS0FBSyxZQUFZLFFBQVEsU0FBUyxzS0FBc0s7QUFBQSxRQUMxTjtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsMEJBQWtCO0FBQ2xCLGFBQUssWUFBWSxLQUFLLFlBQVksUUFBUSxTQUFTLG1GQUFtRixnQkFBZ0IsS0FBSyxDQUFDLEVBQUU7QUFBQSxNQUMvSjtBQUFBLElBQ0Q7QUFDQSxRQUFJLGlCQUFpQjtBQUNwQixZQUFNLEtBQUssc0JBQXNCLGlDQUFpQztBQUFBLElBQ25FLE9BQU87QUFDTixZQUFNLEtBQUssNkJBQTZCO0FBQUEsSUFDekM7QUFDQSxVQUFNLEtBQUssbUJBQW1CLEtBQUs7QUFDbkMsU0FBSyxLQUFLLHNCQUFzQjtBQUFBLEVBQ2pDO0FBQUEsRUFFUSxvQ0FBMEM7QUFDakQsU0FBSyx3QkFBd0IsSUFBSTtBQUFBLE1BQ2hDLFVBQVUsS0FBSyx1QkFBdUIsbUJBQW1CO0FBQUEsTUFDekQsUUFBUSxtQkFBbUI7QUFBQSxJQUM1QixHQUFHLE1BQVM7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixhQUFvQztBQUNwRSxRQUFJO0FBQ0gsWUFBTSxhQUFhLE1BQU0sS0FBSyxtQkFBbUIsb0JBQW9CLFdBQVc7QUFDaEYsVUFBSSxjQUFjLEtBQUssaUJBQWlCLGFBQWE7QUFFcEQsYUFBSyxrQkFBa0Isa0JBQWtCLGNBQWMsVUFBVTtBQUFBLE1BQ2xFO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksTUFBTSxvQ0FBb0MsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDOUc7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLDBCQUEwQixRQUE4QztBQUM3RSxRQUFJLFVBQVU7QUFDZCxlQUFXLFdBQVcsS0FBSyxpQkFBaUIsR0FBRztBQUM5QyxZQUFNLFlBQVksTUFBTSxRQUFRLHlCQUF5QixNQUFNO0FBQy9ELGtCQUFZO0FBQUEsSUFDYjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSwyQkFBMkIsYUFBdUM7QUFNekUsU0FBSywwQkFBMEIsTUFBUztBQUN4QyxRQUFJLGFBQWE7QUFDaEIsV0FBSyxLQUFLLDRCQUE0QixXQUFXO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLDRCQUE0QixhQUFvQztBQUM3RSxRQUFJO0FBQ0gsWUFBTSxNQUFNLE1BQU0sS0FBSyxtQkFBbUIsa0NBQWtDLFdBQVc7QUFDdkYsVUFBSSxLQUFLLGlCQUFpQixhQUFhO0FBQ3RDO0FBQUEsTUFDRDtBQUNBLFdBQUssMEJBQTBCO0FBQUEsUUFDOUIsR0FBRztBQUFBLFFBQ0gsbUJBQW1CLDhCQUE4QixJQUFJLGlCQUFpQjtBQUFBLE1BQ3ZFLENBQUM7QUFBQSxJQUNGLFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLHFEQUFxRCxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUMvSDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBCQUEwQixTQUF3RDtBQUN6RixVQUFNLFlBQVksU0FBUywrQkFBK0I7QUFDMUQsUUFBSSxjQUFjLEtBQUssNkJBQTZCO0FBQ25ELFdBQUssOEJBQThCO0FBQ25DLFdBQUssWUFBWSxLQUFLLDZDQUE2QyxZQUFZLDZCQUE2QixVQUFVLEVBQUU7QUFDeEgsV0FBSyxnQ0FBZ0MsS0FBSztBQUFBLElBQzNDO0FBSUEsUUFBSSw0QkFBNEIsS0FBSyxpQkFBaUIsR0FBRztBQUN4RCxXQUFLLGtCQUFrQiw4QkFBOEIsU0FBUztBQUM5RCxXQUFLLGtCQUFrQixxQkFBcUIsU0FBUyxVQUFVO0FBQy9ELFdBQUssa0JBQWtCLCtCQUErQixTQUFTLGlCQUFpQjtBQUFBLElBQ2pGO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsY0FBMEQ7QUFDN0YsVUFBTSx1QkFBdUIsRUFBRSxxQkFBcUIsS0FBSyx3QkFBd0IsYUFBYSxTQUFTLEVBQUU7QUFDekcsVUFBTSxTQUFTLEtBQUs7QUFDcEIsUUFBSSxDQUFDLFFBQVEsU0FBUyxZQUFZLEdBQUc7QUFDcEMsV0FBSywwQkFBMEIsUUFBUSxjQUFjLEtBQUssb0JBQW9CLGFBQWEsU0FBUyxDQUFDO0FBQ3JHO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxhQUFhLFlBQVk7QUFDN0IsWUFBTSxPQUFPLE1BQU0sY0FBYyxRQUFXLG9CQUFvQjtBQUNoRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksYUFBYTtBQUMvQixVQUFNLGNBQWMsS0FBSztBQUN6QixRQUFJLENBQUMsYUFBYTtBQUNqQixZQUFNLE9BQU8sTUFBTSxjQUFjLFFBQVcsb0JBQW9CO0FBQ2hFO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxZQUFNLFVBQVUsTUFBTSxLQUFLLG1CQUFtQixrQ0FBa0MsV0FBVztBQUMzRixVQUFJLEtBQUssaUJBQWlCLGFBQWE7QUFDdEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxPQUFPLE1BQU0sY0FBYztBQUFBLFFBQ2hDLDRCQUE0QixRQUFRO0FBQUEsUUFDcEMsWUFBWSxRQUFRO0FBQUEsUUFDcEIsbUJBQW1CLDhCQUE4QixRQUFRLGlCQUFpQjtBQUFBLFFBQzFFLFlBQVksUUFBUSxlQUFlO0FBQUEsUUFDbkMsVUFBVSxRQUFRO0FBQUEsUUFDbEIsb0JBQW9CLFFBQVEsdUJBQXVCO0FBQUEsTUFDcEQsR0FBRyxvQkFBb0I7QUFBQSxJQUN4QixTQUFTLE9BQU87QUFDZixXQUFLLFlBQVksTUFBTSxZQUFZLFNBQVMsOERBQThELGFBQWEsTUFBTSxJQUFJLEtBQUssaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUMvTDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdCQUF3QixjQUF1RDtBQUN0RixXQUFPLGVBQ0osS0FBSyxvQkFBb0IsWUFBWSxHQUFHLHlCQUF5QixvQkFBb0IsVUFDckYsb0JBQW9CO0FBQUEsRUFDeEI7QUFBQSxFQUVRLG9CQUFvQixjQUFzRDtBQUNqRixXQUFPLGVBQWUsS0FBSyxvQkFBb0IsWUFBWSxHQUFHLGdCQUFnQjtBQUFBLEVBQy9FO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVlBLGdCQUErQjtBQUM5QixXQUFPLEtBQUssd0JBQXdCLFNBQVMsS0FBSyxLQUFLLHlCQUF5QixLQUFLLG1CQUFtQixFQUFFLEtBQUssdUJBQXVCO0FBQUEsRUFDdkk7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSx3QkFBdUM7QUFDOUMsVUFBTSxhQUFhLEVBQUUsS0FBSztBQUMxQixRQUFJLEtBQUssd0JBQXdCO0FBQ2hDLFdBQUssdUJBQXVCLGFBQWE7QUFDekMsYUFBTyxLQUFLLHVCQUF1QixTQUFTO0FBQUEsSUFDN0M7QUFFQSxVQUFNLFlBQVksRUFBRSxVQUFVLElBQUksZ0JBQXNCLEdBQUcsV0FBVztBQUN0RSxTQUFLLHlCQUF5QjtBQUM5QixTQUFLLHNCQUFzQixRQUFRLGtCQUFrQixNQUFNO0FBQzFELFlBQU0sWUFBWTtBQUNqQixZQUFJO0FBSUgsZ0JBQU0sS0FBSztBQUNYLGNBQUksS0FBSywyQkFBMkIsV0FBVztBQUM5QztBQUFBLFVBQ0Q7QUFDQSxlQUFLLHlCQUF5QjtBQUM5QixlQUFLLHNCQUFzQixNQUFNO0FBQ2pDLGdCQUFNLEtBQUssbUJBQW1CLFVBQVUsVUFBVTtBQUFBLFFBQ25ELFNBQVMsS0FBSztBQUNiLGVBQUssWUFBWSxNQUFNLEtBQUssNENBQTRDO0FBQUEsUUFDekUsVUFBRTtBQUNELGNBQUksS0FBSywyQkFBMkIsV0FBVztBQUM5QyxpQkFBSyx5QkFBeUI7QUFDOUIsaUJBQUssc0JBQXNCLE1BQU07QUFBQSxVQUNsQztBQUNBLG9CQUFVLFNBQVMsU0FBUztBQUFBLFFBQzdCO0FBQUEsTUFDRCxHQUFHO0FBQUEsSUFDSixHQUFHLENBQUM7QUFDSixXQUFPLFVBQVUsU0FBUztBQUFBLEVBQzNCO0FBQUEsRUFFUSxtQkFBbUIsWUFBbUM7QUFDN0QsVUFBTSxVQUFVLEtBQUssZUFBZSxHQUFHLFVBQVUsRUFBRSxRQUFRLE1BQU07QUFDaEUsVUFBSSxLQUFLLDBCQUEwQixTQUFTO0FBQzNDLGFBQUssd0JBQXdCO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUM7QUFDRCxTQUFLLHdCQUF3QjtBQUM3QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsTUFBYyxlQUFlLFVBQVUsR0FBRyxhQUFhLEtBQUsseUJBQXdDO0FBRW5HLFNBQUssbUJBQW1CLE1BQU07QUFLOUIsUUFBSSxLQUFLLGtCQUFrQjtBQUMxQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLHNCQUFzQixLQUFLO0FBQ2pDLFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsV0FBSyxjQUFjLENBQUM7QUFDcEIsV0FBSyxlQUFlO0FBQ3BCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxZQUFNLFNBQVMsTUFBTSxLQUFLLFlBQVksbUJBQW1CO0FBQ3pELFVBQUksS0FBSyxpQkFBaUIsdUJBQXVCLEtBQUssNEJBQTRCLFlBQVk7QUFDN0YsYUFBSyxjQUFjO0FBQ25CLGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFJYixVQUFJLEtBQUssaUJBQWlCLHVCQUF1QixLQUFLLDRCQUE0QixjQUFjLEtBQUssa0JBQWtCO0FBQ3RIO0FBQUEsTUFDRDtBQUNBLFVBQUksVUFBVSxLQUFLLGdCQUFnQixHQUFHLENBQUMsR0FBRztBQUN6QyxhQUFLLGtDQUFrQztBQUFBLE1BQ3hDO0FBQ0EsWUFBTSxLQUFLLDZCQUE2QixLQUFLLGNBQWM7QUFDM0QsVUFBSSxVQUFVLElBQUksS0FBSywwQkFBMEI7QUFDaEQsY0FBTSxRQUFRLEtBQUsscUJBQXFCLE9BQU87QUFDL0MsYUFBSyxZQUFZLEtBQUssK0NBQStDLFVBQVUsQ0FBQyxrQkFBa0IsS0FBSyxNQUFNLEdBQUc7QUFDaEgsYUFBSyxtQkFBbUIsUUFBUSxrQkFBa0IsTUFBTTtBQUN2RCxlQUFLLEtBQUssZUFBZSxVQUFVLEdBQUcsVUFBVTtBQUFBLFFBQ2pELEdBQUcsS0FBSztBQUNSO0FBQUEsTUFDRDtBQUtBLFdBQUssWUFBWSxNQUFNLEtBQUssb0NBQW9DO0FBQ2hFLFdBQUssZUFBZTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxpQkFBdUI7QUFDOUIsU0FBSyxRQUFRLElBQUksQ0FBQyxHQUFHLEtBQUssYUFBYSxHQUFHLEtBQUssV0FBVyxHQUFHLE1BQVM7QUFBQSxFQUN2RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWFRLHFCQUEyQjtBQUNsQyxRQUFJLEtBQUssa0JBQWtCO0FBQzFCO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxLQUFLLG9CQUFvQixVQUFVLEVBQUUsSUFBSSxDQUFDLE1BQXVCO0FBQ25GLFlBQU0sV0FBVyx5QkFBeUIsRUFBRSxlQUFlO0FBQzNELFlBQU0sZ0JBQWdCLEtBQUsseUNBQXlDLEVBQUUsMkJBQTJCLEVBQUUsd0JBQXdCLEVBQUUsRUFBRTtBQUMvSCxhQUFPO0FBQUEsUUFDTixVQUFVLEtBQUs7QUFBQSxRQUNmLElBQUksc0JBQXNCLENBQUM7QUFBQSxRQUMzQixNQUFNLEVBQUUsUUFBUSxFQUFFO0FBQUEsUUFDbEIsa0JBQWtCLEVBQUU7QUFBQSxRQUNwQixnQkFBZ0IsRUFBRSxrQkFBa0I7QUFBQSxRQUNwQyxHQUFJLGdCQUFnQixFQUFFLGNBQWMsRUFBRSxNQUFNLFVBQVUsWUFBWSxFQUFFLENBQUMsc0JBQXNCLEdBQUcsY0FBYyxFQUFFLEVBQXlCLElBQUksQ0FBQztBQUFBLFFBQzVJLEdBQUksWUFBWSxFQUFFLE9BQU8sU0FBUztBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxZQUFZLE1BQU0sbUJBQW1CLEtBQUssWUFBWSxNQUFNLGVBQWUsS0FBSyxZQUFZLFNBQVMsT0FBTyxLQUFLLFlBQVksSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssSUFBSSxJQUFJLEVBQUUsRUFBRTtBQUNwSyxTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVRLHFCQUFxQixTQUF5QjtBQUNyRCxVQUFNLE1BQU0sS0FBSyxJQUFJLEtBQUsseUJBQXlCLEtBQUssMkJBQTJCLEtBQUssT0FBTztBQUMvRixXQUFPLEtBQUssTUFBTSxNQUFNLElBQUksS0FBSyxPQUFPLEtBQUssTUFBTSxFQUFFO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLGNBQTZCO0FBS3BDLFNBQUssNkJBQTZCLE1BQU07QUFDeEMsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsVUFBTSxZQUFZLFlBQVk7QUFDN0IsWUFBTSxpQkFBaUIsS0FBSztBQUM1QixVQUFJLGdCQUFnQjtBQUNuQixZQUFJO0FBQ0gsZ0JBQU07QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUdSO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxLQUFLO0FBQ3BCLFdBQUssVUFBVTtBQUNmLFdBQUssa0JBQWtCO0FBQ3ZCLFlBQU0sUUFBUSxLQUFLO0FBSW5CLFlBQU0sS0FBSyxpQkFBaUIsdUJBQXVCO0FBQUEsSUFDcEQsR0FBRyxFQUFFLFFBQVEsTUFBTTtBQUNsQixVQUFJLEtBQUssb0JBQW9CLFVBQVU7QUFDdEMsYUFBSyxrQkFBa0I7QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssa0JBQWtCO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUlBLE1BQWMsZ0JBQXdDO0FBQ3JELFFBQUksS0FBSyxrQkFBa0I7QUFDMUIsWUFBTSxJQUFJLGtCQUFrQjtBQUFBLElBQzdCO0FBQ0EsV0FBTyxLQUFLLGlCQUFpQjtBQUM1QixZQUFNLEtBQUs7QUFDWCxVQUFJLEtBQUssa0JBQWtCO0FBQzFCLGNBQU0sSUFBSSxrQkFBa0I7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssU0FBUztBQUNqQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBSUEsVUFBTSx1QkFBdUIsS0FBSyxzQkFBc0I7QUFDeEQsVUFBTSxzQkFBc0IsS0FBSyxxQkFBcUI7QUFDdEQsVUFBTSxxQ0FBcUMsS0FBSyw4QkFBOEI7QUFDOUUsVUFBTSwwQkFBMEIsS0FBSyxtQkFBbUI7QUFDeEQsVUFBTSw4QkFBOEIsS0FBSyxzQkFBc0I7QUFDL0QsVUFBTSxrQkFBa0IsWUFBWTtBQUNuQyxXQUFLLFlBQVksS0FBSyxxQ0FBcUM7QUFJM0QsWUFBTSxNQUFNLDRCQUE0QjtBQUl4QyxhQUFPLElBQUksc0JBQXNCO0FBQ2pDLFlBQU0sS0FBSyxtQkFBbUIsR0FBRztBQVlqQyxVQUFJLFFBQVEsYUFBYSxTQUFTO0FBQ2pDLGNBQU0sZUFBZSxJQUFJLG1DQUFtQztBQUM1RCxjQUFNLFFBQVEsSUFBSSxLQUFLLGdCQUFnQixJQUFJLE1BQU0sR0FBRyxFQUFFLElBQUksT0FBSyxFQUFFLEtBQUssQ0FBQyxFQUFFLE9BQU8sT0FBTyxDQUFDO0FBQ3hGLGNBQU0sSUFBSSxxQkFBcUI7QUFDL0IsWUFBSSxtQ0FBbUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxFQUFFLEtBQUssR0FBRztBQUFBLE1BQy9EO0FBR0EsVUFBSSwrQkFBK0IsSUFBSTtBQUN2QyxXQUFLLFlBQVksS0FBSyx3REFBd0Qsc0JBQXNCLEVBQUU7QUFNdEcsWUFBTSxpQkFBaUIsS0FBSyxtQkFBbUI7QUFDL0MsVUFBSSxnQkFBZ0I7QUFDbkIsWUFBSSxpQkFBaUIsSUFBSTtBQUN6QixhQUFLLFlBQVksS0FBSywwQ0FBMEMsY0FBYyxFQUFFO0FBQUEsTUFDakY7QUFLQSxVQUFJLEtBQUsscUJBQXFCLEdBQUc7QUFDaEMsWUFBSSxtQkFBbUIsSUFBSTtBQUFBLE1BQzVCLE9BQU87QUFDTixlQUFPLElBQUksbUJBQW1CO0FBQUEsTUFDL0I7QUFVQSxZQUFNLGlCQUFpQixXQUFXLFVBQVUsc0JBQXNCLENBQUM7QUFDbkUsWUFBTSxVQUFVLE1BQU0sc0JBQXNCLGNBQWM7QUFPMUQsVUFBSSxhQUFhLElBQUksSUFBSSxTQUFTLGdCQUFnQixjQUFjLFdBQVcsS0FBSyxFQUFFO0FBR2xGLFlBQU0scUJBQXFCLE1BQU0sV0FBVztBQUM1QyxZQUFNLFFBQVEsUUFBUSxrQkFBa0I7QUFHeEMsWUFBTSxVQUFVLE9BQU8sS0FBSyxHQUFHLEVBQUUsS0FBSyxPQUFLLEVBQUUsWUFBWSxNQUFNLE1BQU0sS0FBSztBQUMxRSxZQUFNLGNBQWMsSUFBSSxPQUFPO0FBQy9CLFVBQUksT0FBTyxJQUFJLGNBQWMsR0FBRyxXQUFXLEdBQUcsU0FBUyxHQUFHLEtBQUssS0FBSztBQUNwRSxXQUFLLFlBQVksS0FBSyxnQ0FBZ0MsT0FBTyxFQUFFO0FBRS9ELFlBQU0sWUFBWSxNQUFNLEtBQUssYUFBYSxzQkFBc0I7QUFDaEUsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLGFBQWEsNEJBQTRCO0FBQzVFLFVBQUksaUJBQWlCO0FBQ3BCLFlBQUksbUJBQW1CLElBQUk7QUFDM0IsWUFBSSwwQkFBMEIsSUFBSSxPQUFPLFFBQVEsZ0JBQWdCLGtCQUFrQixFQUFFLElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNLEdBQUcsR0FBRyxJQUFJLG1CQUFtQixLQUFLLENBQUMsRUFBRSxFQUFFLEtBQUssR0FBRztBQUFBLE1BQzNKO0FBQ0EsVUFBSSxpQkFBaUIsUUFBUTtBQUM1QixZQUFJLG9DQUFvQyxJQUFJLGdCQUFnQixPQUFPO0FBQ25FLFlBQUksb0NBQW9DLElBQUksZ0JBQWdCLE9BQU87QUFBQSxNQUNwRTtBQUNBLFVBQUksaUJBQWlCLFVBQVU7QUFDOUIsWUFBSSxxQ0FBcUMsSUFBSSxrQ0FBa0MsZ0JBQWdCLFNBQVMsVUFBVSxnQkFBZ0IsU0FBUyxRQUFRO0FBQ25KLFlBQUkscUNBQXFDLElBQUksZ0JBQWdCLFNBQVM7QUFBQSxNQUN2RSxXQUFXLGlCQUFpQjtBQUMzQixZQUFJLHVCQUF1QixJQUFJO0FBQUEsTUFDaEM7QUFDQSxZQUFNLDhCQUE4QixLQUFLLDJCQUEyQixrQ0FBa0M7QUFFdEcsWUFBTSxnQkFBc0M7QUFBQSxRQUMzQyxpQkFBaUI7QUFBQSxRQUNqQixZQUFZLGtCQUFrQixTQUFTLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFBQSxRQUN4RDtBQUFBLFFBQ0E7QUFBQSxRQUNBLFVBQVU7QUFBQSxRQUNWLHNCQUFzQjtBQUFBLFFBQ3RCLG1CQUFtQixNQUFNLEtBQUssYUFBYSx1QkFBdUIsS0FBSyxDQUFDO0FBQUEsUUFDeEUsbUJBQW1CLGtCQUFnQjtBQUFFLGVBQUssS0FBSyxzQkFBc0IsWUFBWSxFQUFFLE1BQU0sU0FBTyxLQUFLLFlBQVksTUFBTSw4Q0FBOEMsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUFHO0FBQUEsTUFDNU47QUFDQSxZQUFNLFNBQVMsS0FBSyxxQkFBcUIsYUFBYTtBQUN0RCxVQUFJO0FBQ0gsY0FBTSxPQUFPLE1BQU07QUFBQSxNQUNwQixTQUFTLE9BQU87QUFDZixjQUFNLGNBQWMsNkJBQTZCLEtBQUs7QUFDdEQsWUFBSSxlQUFlLGlCQUFpQixPQUFPO0FBQzFDLHFDQUEyQixLQUFLLG1CQUFtQixhQUFhLEdBQUcsYUFBYSxlQUFlLEtBQUsscUJBQXFCLEdBQUcsT0FBTyxLQUFLO0FBQ3hJLGVBQUssd0JBQXdCLElBQUksS0FBSztBQUFBLFFBQ3ZDO0FBQ0EsY0FBTTtBQUFBLE1BQ1A7QUFDQSxVQUFJLEtBQUssa0JBQWtCO0FBQzFCLGNBQU0sT0FBTyxLQUFLO0FBQ2xCLGNBQU0sSUFBSSxrQkFBa0I7QUFBQSxNQUM3QjtBQUNBLFVBQUksS0FBSyxzQkFBc0IsTUFBTSx3QkFBd0IsS0FBSyxxQkFBcUIsTUFBTSx1QkFBdUIsS0FBSyw4QkFBOEIsTUFBTSxzQ0FBc0MsS0FBSyxtQkFBbUIsTUFBTSwyQkFBMkIsS0FBSyxzQkFBc0IsTUFBTSw2QkFBNkI7QUFDelQsY0FBTSxPQUFPLEtBQUs7QUFDbEIsY0FBTSxJQUFJLE1BQU0sOERBQThEO0FBQUEsTUFDL0U7QUFDQSxXQUFLLFlBQVksS0FBSyw4Q0FBOEM7QUFDcEUsV0FBSyxVQUFVO0FBQ2YsV0FBSyxrQkFBa0I7QUFDdkIsYUFBTztBQUFBLElBQ1IsR0FBRztBQUNILFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssZUFBZSxNQUFNLE1BQU07QUFDL0IsV0FBSyxrQkFBa0I7QUFBQSxJQUN4QixDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBSVEseUNBQXlDLGtCQUFpRCx3QkFBNEMsU0FBK0Q7QUFHNU0sVUFBTSw0QkFBNEIsa0JBQWtCLE9BQU8sd0JBQXdCO0FBQ25GLFFBQUksQ0FBQywyQkFBMkIsUUFBUTtBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU8sU0FBUyxvQ0FBb0MsZ0JBQWdCO0FBQUEsTUFDcEUsYUFBYSxTQUFTLDBDQUEwQyxvREFBb0Q7QUFBQSxNQUNwSCxTQUFTLDhCQUE4QiwyQkFBMkIsd0JBQXdCLE9BQU87QUFBQSxNQUNqRyxNQUFNLENBQUMsR0FBRyx5QkFBeUI7QUFBQSxNQUNuQyxZQUFZLDBCQUEwQixJQUFJLHVCQUF1QjtBQUFBLE1BQ2pFLGtCQUFrQiwwQkFBMEIsSUFBSSxXQUFTLDhCQUE4QixLQUFLLEtBQUssRUFBRTtBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZUSx1Q0FBdUMsU0FBMEU7QUFDeEgsVUFBTSxjQUFjLFNBQVM7QUFDN0IsVUFBTSxhQUFhLGFBQWE7QUFDaEMsVUFBTSxpQkFBaUIsYUFBYSxhQUFhO0FBQ2pELFFBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLGNBQWMsZ0JBQWdCO0FBQ25FLGFBQU87QUFBQSxJQUNSO0FBR0EsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTyxTQUFTLGtDQUFrQyxjQUFjO0FBQUEsTUFDaEUsYUFBYSxTQUFTLHdDQUF3QyxpREFBaUQ7QUFBQSxNQUMvRyxTQUFTLHdCQUF3QixPQUFPLElBQUksYUFBYTtBQUFBLE1BQ3pELE1BQU0sQ0FBQyxZQUFZLGNBQWM7QUFBQSxNQUNqQyxZQUFZLENBQUMsaUJBQWlCLFVBQVUsR0FBRyxpQkFBaUIsY0FBYyxDQUFDO0FBQUEsTUFDM0Usa0JBQWtCO0FBQUEsUUFDakIsU0FBUyxvQ0FBb0MsU0FBUztBQUFBLFFBQ3RELFNBQVMsMkNBQTJDLGlCQUFpQjtBQUFBLE1BQ3RFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1Esc0JBQXNCLFNBQWlEO0FBQzlFLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFVBQVUsS0FBSyxRQUFRLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxPQUFPLE9BQU8sR0FBRyxjQUFjLGFBQWEsb0JBQW9CLEdBQUc7QUFDbEgsVUFBTSxpQkFBaUIsU0FBUyxPQUFPLENBQUMsTUFBbUIsT0FBTyxNQUFNLFFBQVE7QUFDaEYsV0FBTyxrQkFBa0IsZUFBZSxTQUFTLElBQUksS0FBSyxJQUFJLEdBQUcsY0FBYyxJQUFJO0FBQUEsRUFDcEY7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsbUJBQW1CLFNBQXNDO0FBQ2hFLFdBQU8sQ0FBQyxDQUFDLFdBQVcsS0FBSyx1QkFBdUIsSUFBSSxPQUFPO0FBQUEsRUFDNUQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtRLHVCQUF1QixXQUE2QixTQUE2RTtBQUN4SSxXQUFPLDZCQUE2QixTQUFTLFVBQVUsMEJBQTBCLFVBQVUsbUJBQW1CO0FBQUEsRUFDL0c7QUFBQSxFQUVRLHlCQUF5QixHQUFxQixTQUFrRTtBQUN2SCxVQUFNLGFBQXlDLENBQUM7QUFDaEQsVUFBTSxnQkFBZ0IsS0FBSyx5Q0FBeUMsRUFBRSwyQkFBMkIsUUFBVyxFQUFFLEVBQUU7QUFDaEgsUUFBSSxlQUFlO0FBQ2xCLGlCQUFXLHNCQUFzQixJQUFJO0FBQUEsSUFDdEM7QUFDQSxVQUFNLGNBQWMsS0FBSyx1Q0FBdUMsT0FBTztBQUN2RSxRQUFJLGFBQWE7QUFDaEIsaUJBQVcsb0JBQW9CLElBQUk7QUFBQSxJQUNwQztBQUNBLFFBQUksT0FBTyxLQUFLLFVBQVUsRUFBRSxXQUFXLEdBQUc7QUFDekMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEVBQUUsTUFBTSxVQUFVLFdBQVc7QUFBQSxFQUNyQztBQUFBLEVBRVEseUJBQXlCLE9BQStCO0FBQy9ELFdBQU8sS0FBSyxVQUFVLEtBQUs7QUFBQSxFQUM1QjtBQUFBLEVBRVEscUJBQXFCLEtBQXFEO0FBQ2pGLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBQ0gsWUFBTSxRQUFzRSxLQUFLLE1BQU0sR0FBRztBQUMxRixVQUFJLFNBQVMsT0FBTyxVQUFVLFlBQVksT0FBTyxNQUFNLE9BQU8sVUFBVTtBQUN2RSxjQUFNLGlCQUFpQyxFQUFFLElBQUksTUFBTSxHQUFHO0FBQ3RELFlBQUksTUFBTSxVQUFVLE9BQU8sTUFBTSxXQUFXLFVBQVU7QUFDckQsZ0JBQU0sU0FBaUMsQ0FBQztBQUN4QyxxQkFBVyxDQUFDLEtBQUssV0FBVyxLQUFLLE9BQU8sUUFBUSxNQUFNLE1BQU0sR0FBRztBQUM5RCxnQkFBSSxPQUFPLGdCQUFnQixVQUFVO0FBQ3BDLHFCQUFPLEdBQUcsSUFBSTtBQUFBLFlBQ2Y7QUFBQSxVQUNEO0FBQ0EsY0FBSSxPQUFPLEtBQUssTUFBTSxFQUFFLFNBQVMsR0FBRztBQUNuQywyQkFBZSxTQUFTO0FBQUEsVUFDekI7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBRUEsV0FBTyxFQUFFLElBQUksSUFBSTtBQUFBLEVBQ2xCO0FBQUEsRUFFUSx5QkFBeUIsT0FBK0I7QUFDL0QsV0FBTyxLQUFLLFVBQVUsRUFBRSxLQUFLLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDekM7QUFBQSxFQUVRLHFCQUFxQixLQUFxRDtBQUNqRixRQUFJLENBQUMsS0FBSztBQUNULGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILFlBQU0sUUFBaUIsS0FBSyxNQUFNLEdBQUc7QUFDckMsVUFBSSxTQUFTLE9BQU8sVUFBVSxZQUFZLE9BQVEsTUFBeUIsUUFBUSxVQUFVO0FBQzVGLGVBQU8sRUFBRSxLQUFNLE1BQXlCLElBQUk7QUFBQSxNQUM3QztBQUFBLElBQ0QsUUFBUTtBQUFBLElBRVI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxrQkFBa0IsVUFBaUMsT0FBMkM7QUFDckcsZUFBVyxVQUFVLFNBQVMsU0FBUztBQUN0QyxZQUFNLFFBQVEsT0FBTyxPQUFPLEtBQUssT0FBSyxFQUFFLElBQUksU0FBUyxNQUFNLE1BQU0sR0FBRztBQUNwRSxVQUFJLE9BQU87QUFDVixlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLHFCQUFnRTtBQUNyRSxVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixrQkFBa0I7QUFDL0QsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0saUJBQWlCLElBQUksUUFBOEMsQ0FBQztBQUMxRSxVQUFNLGtCQUFrQixJQUFJLFFBQXdDLENBQUM7QUFDckUsVUFBTSxtQkFBbUIsb0JBQUksSUFBMkQ7QUFDeEYsVUFBTSxTQUFTLE1BQU0sUUFBUSxJQUFJLFNBQVMsSUFBSSxPQUFLLGdCQUFnQixNQUFNLFlBQVk7QUFDcEYsWUFBTSxVQUFVLGFBQWEsSUFBSSxLQUFLLElBQUksRUFBRSxTQUFTO0FBQ3JELFlBQU0sT0FBTyxJQUFJLE1BQU0sb0JBQW9CLE9BQU8sQ0FBQztBQUNuRCxZQUFNLFdBQVcsTUFBTSxLQUFLLDJCQUEyQixPQUFPO0FBQzlELFVBQUksQ0FBQyxZQUFZLEVBQ2hCLFNBQVMsVUFBVSxVQUNoQixTQUFTLFVBQVUsVUFDbkIsU0FBUyxxQkFBcUIsVUFDOUIsU0FBUyx1QkFBdUIsVUFDaEMsU0FBUywyQkFBMkIsVUFDcEMsU0FBUyxZQUFZLFVBQ3JCLFNBQVMsWUFDVCxTQUFTLGtCQUFrQixTQUM1QjtBQUNGLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxFQUFFLFNBQVMsU0FBUyxJQUFJO0FBQzVCLFVBQUksQ0FBQyxVQUFVO0FBQ2Qsa0JBQVUsTUFBTSxLQUFLLHVCQUF1QixFQUFFLFNBQVMsZ0JBQWdCLGdCQUFnQjtBQUN2RixhQUFLLEtBQUssK0JBQStCLFNBQVMsT0FBTztBQUFBLE1BQzFEO0FBQ0EsWUFBTSxxQkFBcUIsU0FBUyx1QkFBdUIsT0FBTyxFQUFFLFNBQVMscUJBQXFCLFdBQVcsQ0FBQyxJQUFJLEtBQUssRUFBRSxRQUFRLGdCQUFnQixDQUFDLElBQUk7QUFDdEosWUFBTUMsVUFBNkI7QUFBQSxRQUNsQztBQUFBLFFBQ0EsV0FBVyxFQUFFLFVBQVUsUUFBUTtBQUFBLFFBQy9CLGNBQWMsRUFBRSxhQUFhLFFBQVE7QUFBQSxRQUNyQztBQUFBLFFBQ0EsU0FBUyxFQUFFO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFDQSxhQUFPQTtBQUFBLElBQ1IsQ0FBQyxDQUFDLENBQUM7QUFDSCxVQUFNLFNBQVMsT0FBTyxPQUFPLENBQUMsTUFBK0IsTUFBTSxNQUFTO0FBQzVFLFNBQUssWUFBWSxLQUFLLG1CQUFtQixPQUFPLE1BQU0sa0JBQWtCO0FBQ3hFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLG9CQUFtQztBQUNoRCxRQUFJO0FBQ0gsWUFBTSxRQUFRLE1BQU0sS0FBSyxzQkFBc0I7QUFDL0MsVUFBSSxTQUFTLEtBQUssa0NBQWtDLEdBQUc7QUFDdEQsYUFBSyxvQkFBb0IsS0FBSyxLQUFLO0FBQUEsTUFDcEM7QUFBQSxJQUNELFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxLQUFLLGlEQUFpRCxHQUFHO0FBQUEsSUFDM0U7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLHdCQUFxRTtBQUNsRixVQUFNLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixzQkFBc0I7QUFDbkUsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0saUJBQWlCLElBQUksUUFBOEMsQ0FBQztBQUMxRSxVQUFNLGtCQUFrQixJQUFJLFFBQXdDLENBQUM7QUFDckUsVUFBTSxtQkFBbUIsb0JBQUksSUFBMkQ7QUFDeEYsVUFBTSxTQUFTLE1BQU0sUUFBUSxJQUFJLFNBQVMsSUFBSSxPQUFLLGdCQUFnQixNQUFNLFlBQVk7QUFDcEYsVUFBSSxPQUFPLEVBQUUsU0FBUyxxQkFBcUIsWUFBWSxDQUFDLE1BQU0sS0FBSywyQkFBMkIsRUFBRSxTQUFTLEdBQUc7QUFDM0csZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFVBQVUsYUFBYSxJQUFJLEtBQUssSUFBSSxFQUFFLFNBQVM7QUFDckQsVUFBSSxNQUFNLEtBQUssMkJBQTJCLE9BQU8sR0FBRztBQUNuRCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxRQUNOLE1BQU0sSUFBSSxNQUFNLG9CQUFvQixPQUFPLENBQUM7QUFBQSxRQUM1QyxXQUFXLEVBQUUsVUFBVSxRQUFRO0FBQUEsUUFDL0IsY0FBYyxFQUFFLGFBQWEsUUFBUTtBQUFBLFFBQ3JDLFNBQVMsTUFBTSxLQUFLLHVCQUF1QixFQUFFLFNBQVMsZ0JBQWdCLGdCQUFnQjtBQUFBLFFBQ3RGLFNBQVMsRUFBRTtBQUFBLFFBQ1gsb0JBQW9CLENBQUMsSUFBSSxLQUFLLEVBQUUsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLFFBQ3pELE9BQU8sMEJBQTBCLE1BQVM7QUFBQSxRQUMxQyxVQUFVO0FBQUEsTUFDWDtBQUFBLElBQ0QsQ0FBQyxDQUFDLENBQUM7QUFDSCxXQUFPLE9BQU8sT0FBTyxDQUFDLFNBQXVDLFNBQVMsTUFBUztBQUFBLEVBQ2hGO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixRQUF5RjtBQUN2SCxTQUFLLFlBQVksS0FBSyxxQkFBcUIsTUFBTSxLQUFLO0FBQ3RELFFBQUk7QUFDSCxhQUFPLE1BQU0sS0FBSyw0QkFBNEIsZ0JBQWdCLFlBQVk7QUFDekUsY0FBTSxTQUFTLE1BQU0sS0FBSyxjQUFjO0FBQ3hDLGVBQU8sT0FBTyxhQUFhO0FBQUEsTUFDNUIsQ0FBQztBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ2IsVUFBSSxlQUFlLHFCQUFxQiw2QkFBNkIsR0FBRyxNQUFNLFFBQVc7QUFDeEYsYUFBSyxZQUFZLEtBQUssOENBQThDLE1BQU0sS0FBSyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFDakksZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZ0JBQWdCLE1BQVcsU0FBa0MsY0FBZ0U7QUFDbEksVUFBTSxVQUFVLHdCQUF3QixTQUFTLElBQUksRUFBRTtBQUN2RCxVQUFNLFlBQVksZUFBZSxtQkFBbUIsWUFBWSxHQUFHLGVBQWUsYUFBYSxHQUFHLE9BQU87QUFDekcsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0saUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsT0FBTztBQUVwRSxVQUFNLGtCQUFrQixNQUFNLEtBQUssNEJBQTRCLHNCQUFzQixZQUFZO0FBQ2hHLFlBQU0sU0FBUyxNQUFNLEtBQUssY0FBYztBQUN4QyxhQUFPLE9BQU8sbUJBQW1CLFNBQVM7QUFBQSxJQUMzQyxHQUFHLGdDQUFnQyxTQUFTLE1BQU0sUUFBVyxTQUFTLENBQUM7QUFDdkUsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksVUFBVSxnQkFBZ0I7QUFDOUIsUUFBSSxDQUFDLGdCQUFnQixVQUFVO0FBQzlCLFlBQU0saUJBQWlCLElBQUksUUFBOEMsQ0FBQztBQUMxRSxnQkFBVSxNQUFNLEtBQUssdUJBQXVCLGlCQUFpQixTQUFTLGdCQUFnQixvQkFBSSxJQUEyRCxDQUFDO0FBQ3RKLFVBQUksZ0JBQWdCO0FBQ25CLGFBQUssS0FBSywrQkFBK0IsU0FBUyxPQUFPO0FBQUEsTUFDMUQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxxQkFBcUIsZ0JBQWdCLHVCQUF1QixPQUFPLGlCQUFpQixTQUFTLHFCQUFxQixXQUFXLENBQUMsSUFBSSxLQUFLLGdCQUFnQixRQUFRLGdCQUFnQixDQUFDLElBQUk7QUFDMUwsVUFBTSxZQUFZLENBQUMsa0JBQWtCLE1BQU0sS0FBSywyQkFBMkIsU0FBUztBQUNwRixXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsV0FBVyxpQkFBaUIsVUFBVSxRQUFRLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDNUQsY0FBYyxpQkFBaUIsYUFBYSxRQUFRLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDbEU7QUFBQSxNQUNBLFNBQVMsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLE9BQU8sWUFBWSwwQkFBMEIsTUFBUyxJQUFJO0FBQUEsSUFDM0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLFlBQVksYUFBaUQ7QUFDMUUsU0FBSyxZQUFZLEtBQUssNkJBQTZCO0FBQ25ELFVBQU0sU0FBUyxNQUFNLEtBQUssY0FBYztBQUN4QyxVQUFNLEVBQUUsT0FBTyxJQUFJLE1BQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxFQUFFLFlBQVksQ0FBQztBQUMvRCxTQUFLLHVCQUF1QixNQUFNO0FBQ2xDLFVBQU0sU0FBUyxPQUFPLElBQUksQ0FBQyxNQUF1QjtBQUNqRCxZQUFNLFVBQVUscUJBQXFCLEVBQUUsT0FBTztBQUM5QyxZQUFNLGVBQWUsS0FBSyx5QkFBeUIsR0FBRyxPQUFPO0FBRTdELFlBQU0sY0FBYyxTQUFTO0FBQzdCLFlBQU0sdUJBQXVCLENBQUMsQ0FBQyxhQUFhLGNBQ3hDLENBQUMsQ0FBQyxZQUFZLGFBQWEsY0FDM0IsWUFBWSxZQUFZLGFBQWEsWUFBWTtBQUNyRCxVQUFJLHdCQUF3QixDQUFDLHdCQUF3QixPQUFPLEdBQUc7QUFDOUQsYUFBSyx1QkFBdUIsSUFBSSxFQUFFLEVBQUU7QUFBQSxNQUNyQztBQUNBLGFBQU87QUFBQSxRQUNOLFVBQVUsS0FBSztBQUFBLFFBQ2YsSUFBSSxFQUFFO0FBQUEsUUFDTixNQUFNLEVBQUU7QUFBQTtBQUFBO0FBQUEsUUFHUixrQkFBa0IsRUFBRSxjQUFjLFFBQVE7QUFBQSxRQUMxQyxpQkFBaUIsRUFBRSxjQUFjLFFBQVE7QUFBQSxRQUN6QyxpQkFBaUIsRUFBRSxjQUFjLFFBQVE7QUFBQSxRQUN6QyxnQkFBZ0IsQ0FBQyxDQUFDLEVBQUUsY0FBYyxVQUFVO0FBQUEsUUFDNUM7QUFBQSxRQUNBLGFBQWEsRUFBRSxRQUFRO0FBQUEsUUFDdkIsT0FBTyxLQUFLLHVCQUF1QixHQUFHLE9BQU87QUFBQSxNQUM5QztBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssWUFBWSxLQUFLLG1CQUFtQixPQUFPLE1BQU0sWUFBWSxPQUFPLElBQUksT0FBSyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBQ3RHLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQWMsK0JBQStCLFNBQWtDLFdBQW1CLGlCQUF3QztBQUN6SSxRQUFJLFFBQVEsTUFBTTtBQUNqQixZQUFNLGNBQWMsS0FBSyxrQkFBa0IsUUFBUSxLQUFLLE1BQU07QUFDOUQsWUFBTSxrQkFBa0IsYUFBYSxHQUFHLFdBQVc7QUFDbkQsWUFBTSx1QkFBdUIsS0FBSyxvQkFBb0IsZUFBZSxHQUFHO0FBQ3hFLFVBQUksc0JBQXNCO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSwwQkFBMEIsTUFBTSxLQUFLLHFCQUFxQixXQUFXLEdBQUc7QUFDOUUsVUFBSSx3QkFBd0I7QUFDM0IsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLFFBQVEscUJBQXFCLENBQUMsS0FBSyxLQUFLLHFCQUFxQixJQUFJLFNBQVMsR0FBRztBQUM5RixRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsSUFDUjtBQU1BLFFBQUksaUJBQWlCO0FBQ3BCLFlBQU0sYUFBYSxLQUFLLHlCQUF5QixTQUFTO0FBQzFELFlBQU0sR0FBRyxNQUFNLFdBQVcsUUFBUSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQ3JELGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLE1BQU0sR0FBRyxRQUFRLEtBQUssR0FBRyxPQUFPLEdBQUcscUJBQXFCLENBQUM7QUFDekUsVUFBTSxtQkFBbUIsSUFBSSxLQUFLLE9BQU87QUFDekMsU0FBSyxZQUFZLE1BQU0seUVBQXlFLGlCQUFpQixNQUFNLEVBQUU7QUFDekgsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSx5QkFBeUIsV0FBd0I7QUFDeEQsV0FBTyx3QkFBd0IsS0FBSyxvQkFBb0IsVUFBVSxTQUFTO0FBQUEsRUFDNUU7QUFBQTtBQUFBLEVBR0EsTUFBYywrQkFBK0IsWUFBaUIsV0FBa0M7QUFDL0YsUUFBSTtBQUNILFlBQU0sR0FBRyxNQUFNLFdBQVcsUUFBUSxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBQ3JELFdBQUssWUFBWSxNQUFNLFlBQVksU0FBUyw2Q0FBNkMsV0FBVyxNQUFNLEVBQUU7QUFBQSxJQUM3RyxTQUFTLE9BQU87QUFDZixXQUFLLFlBQVksS0FBSyxZQUFZLFNBQVMsd0RBQXdELFdBQVcsTUFBTSxNQUFNLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDbkw7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLE1BQWMsZ0NBQWdDLFlBQWlCLFdBQWtDO0FBQ2hHLFFBQUk7QUFDSCxZQUFNLEdBQUcsR0FBRyxXQUFXLFFBQVEsRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFDL0QsV0FBSyxZQUFZLE1BQU0sWUFBWSxTQUFTLCtDQUErQyxXQUFXLE1BQU0sRUFBRTtBQUFBLElBQy9HLFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxLQUFLLFlBQVksU0FBUyx3REFBd0QsV0FBVyxNQUFNLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUNuTDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVlRLG9CQUFvQixjQUF1RDtBQUNsRixXQUFPLEtBQUssb0JBQW9CLElBQUksWUFBWSxHQUFHO0FBQUEsRUFDcEQ7QUFBQTtBQUFBLEVBR1EsaUJBQWlCLFNBQStDO0FBQ3ZFLGVBQVcsU0FBUyxLQUFLLG9CQUFvQixPQUFPLEdBQUc7QUFDdEQsVUFBSSxRQUFRLE1BQU0sWUFBWSxhQUFhLE9BQU8sR0FBRztBQUNwRCxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxlQUFlLE1BQXFEO0FBQzNFLFVBQU0sVUFBVSxPQUFPLFNBQVMsV0FBVyxPQUFPLEtBQUssU0FBUztBQUNoRSxVQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksT0FBTztBQUM5QyxXQUFPLFVBQVUsS0FBSyxvQkFBb0IsUUFBUSxZQUFZLElBQUk7QUFBQSxFQUNuRTtBQUFBLEVBRVEseUJBQXlCLFdBQW9DO0FBQ3BFLGVBQVcsQ0FBQyxTQUFTLE9BQU8sS0FBSyxLQUFLLGVBQWU7QUFDcEQsVUFBSSxRQUFRLGlCQUFpQixXQUFXO0FBQ3ZDLGVBQU8sSUFBSSxNQUFNLE9BQU87QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFHUSxtQkFBbUIsU0FBc0I7QUFDaEQsVUFBTSxZQUFZLGFBQWEsR0FBRyxPQUFPO0FBQ3pDLFdBQU8sS0FBSyxpQkFBaUIsT0FBTyxHQUFHLGFBQ25DLEtBQUsscUJBQXFCLElBQUksU0FBUyxHQUFHLGdCQUMxQyxLQUFLLGNBQWMsSUFBSSxvQkFBb0IsT0FBTyxDQUFDLEdBQUcsZ0JBQ3REO0FBQUEsRUFDTDtBQUFBO0FBQUEsRUFHUSxvQkFBb0IsU0FBK0I7QUFDMUQsV0FBTyxLQUFLLHlCQUF5QixLQUFLLG1CQUFtQixPQUFPLENBQUM7QUFBQSxFQUN0RTtBQUFBO0FBQUEsRUFHUSxvQkFBb0IsTUFBVyxrQkFBMEU7QUFDaEgsVUFBTSxXQUFXLHdCQUF3QixrQkFBa0IsSUFBSTtBQUMvRCxTQUFLLHdCQUF3QixnQkFBZ0I7QUFDN0MsV0FBTyxLQUFLLDRCQUE0QixNQUFNLFFBQVE7QUFBQSxFQUN2RDtBQUFBLEVBRVEsd0JBQXdCLE1BQVcsa0JBQTJFO0FBQ3JILFFBQUksa0JBQWtCO0FBQ3JCLGFBQU8sS0FBSyxvQkFBb0IsTUFBTSxnQkFBZ0I7QUFBQSxJQUN2RDtBQUNBLFVBQU0sVUFBVSxLQUFLLFNBQVM7QUFDOUIsVUFBTSxVQUFVLEtBQUssY0FBYyxJQUFJLE9BQU87QUFDOUMsVUFBTSxTQUFTLFVBQVUsS0FBSyxvQkFBb0IsUUFBUSxZQUFZLElBQUk7QUFDMUUsUUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRO0FBQ3hCLFlBQU0sSUFBSSxNQUFNLCtEQUErRCxPQUFPLEVBQUU7QUFBQSxJQUN6RjtBQUNBLFVBQU0sZUFBZSxPQUFPLG1CQUFtQixPQUFPO0FBQ3RELFdBQU87QUFBQSxNQUNOLHVCQUF1QjtBQUFBLE1BQ3ZCLGlCQUFpQixhQUFhLEdBQUcsWUFBWTtBQUFBLE1BQzdDLFVBQVUsT0FBTztBQUFBLE1BQ2pCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsY0FBYyxRQUFRO0FBQUEsTUFDdEIsY0FBYyxRQUFRO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHUSw0QkFBNEIsTUFBVyxrQkFBeUU7QUFDdkgsUUFBSSxrQkFBa0I7QUFDckIsYUFBTyxLQUFLLG9CQUFvQixNQUFNLGdCQUFnQjtBQUFBLElBQ3ZEO0FBQ0EsVUFBTSxVQUFVLEtBQUssU0FBUztBQUM5QixVQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksT0FBTztBQUM5QyxVQUFNLFNBQVMsVUFBVSxLQUFLLG9CQUFvQixRQUFRLFlBQVksSUFBSTtBQUMxRSxRQUFJLENBQUMsV0FBVyxDQUFDLFFBQVE7QUFDeEIsWUFBTSxJQUFJLE1BQU0sK0RBQStELE9BQU8sRUFBRTtBQUFBLElBQ3pGO0FBQ0EsVUFBTSxlQUFlLE9BQU8sbUJBQW1CLE9BQU87QUFDdEQsV0FBTztBQUFBLE1BQ04sdUJBQXVCO0FBQUEsTUFDdkIsaUJBQWlCLGFBQWEsR0FBRyxZQUFZO0FBQUEsTUFDN0MsVUFBVSxPQUFPO0FBQUEsTUFDakI7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLFFBQVE7QUFBQSxNQUN0QixjQUFjLFFBQVE7QUFBQSxNQUN0QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBNEIsTUFBVyxTQUF5RDtBQUN2RyxVQUFNLFVBQVUsS0FBSyxTQUFTO0FBQzlCLFVBQU0sVUFBVSxLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQzlDLFVBQU0sY0FBYyxVQUFVLEtBQUssb0JBQW9CLFFBQVEsWUFBWSxJQUFJO0FBQy9FLFVBQU0sa0JBQWtCLGFBQWEsR0FBRyxRQUFRLHFCQUFxQjtBQUNyRSxVQUFNLFNBQVM7QUFDZixVQUFNLGVBQWUsU0FBUztBQUM5QixXQUFPO0FBQUEsTUFDTix1QkFBdUIsUUFBUTtBQUFBLE1BQy9CO0FBQUEsTUFDQSxVQUFVLFFBQVE7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLGdCQUFnQjtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixXQUFtQixTQUFtRDtBQUN0RyxVQUFNLFVBQVUsS0FBSyxvQkFBb0IsU0FBUztBQUNsRCxRQUFJLFNBQVM7QUFDWixhQUFPLFFBQVEsd0JBQXdCLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDckQ7QUFDQSxXQUFPLEtBQUssc0JBQXNCLGlCQUFpQixPQUFPO0FBQUEsRUFDM0Q7QUFBQTtBQUFBLEVBZ0NBLE1BQWMsWUFBWSxNQUFXLFNBQTRCLFVBQW1DLENBQUMsR0FBb0M7QUFDeEksVUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBTSxVQUFVLEtBQUssU0FBUztBQVE5QixVQUFNLGNBQWMsS0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLEtBQUssY0FBYyxJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUMsS0FBSyxlQUFlLElBQUk7QUFDbEgsU0FBSyxtQkFBbUIsTUFBTSxPQUFPLFFBQVEsUUFBUTtBQUNyRCxRQUFJO0FBQ0gsVUFBSSxRQUFRLGNBQWM7QUFDekIsZUFBTyxNQUFNLEtBQUssb0JBQW9CLE1BQU0sU0FBUyxPQUFPO0FBQUEsTUFDN0Q7QUFDQSxVQUFJLFFBQVEsb0JBQW9CO0FBQy9CLGVBQU8sTUFBTSxLQUFLLG1CQUFtQixNQUFNLFNBQVMsT0FBTztBQUFBLE1BQzVEO0FBQ0EsYUFBTyxNQUFNLEtBQUssaUJBQWlCLE1BQU0sU0FBUyxPQUFPO0FBQUEsSUFDMUQsU0FBUyxPQUFPO0FBQ2YsVUFBSSxDQUFDLGFBQWE7QUFDakIsY0FBTSxLQUFLLDBCQUEwQixNQUFNLE9BQU8sUUFBUSx1QkFBdUIsTUFBUztBQUFBLE1BQzNGO0FBQ0EsWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXdCQSxNQUFjLDBCQUEwQixNQUFXLE9BQVksbUJBQTJDO0FBQ3pHLFVBQU0sVUFBVSxLQUFLLFNBQVM7QUFDOUIsVUFBTSxVQUFVLGFBQWEsR0FBRyxLQUFLO0FBR3JDLFNBQUssWUFBWSxPQUFPLE9BQU87QUFDL0IsU0FBSyxtQkFBbUIsT0FBTyxPQUFPO0FBSXRDLFNBQUssY0FBYyxPQUFPLE9BQU87QUFHakMsU0FBSyxlQUFlLElBQUksS0FBSyxHQUFHLFdBQVcsSUFBSTtBQUMvQyxRQUFJO0FBR0gsVUFBSSxLQUFLLHdCQUF3QixLQUFLLE1BQU0sR0FBRztBQUM5QyxjQUFNLEtBQUssNEJBQTRCLE9BQU8sU0FBUyxpQkFBaUI7QUFBQSxNQUN6RTtBQUFBLElBQ0QsU0FBUyxjQUFjO0FBQ3RCLFdBQUssWUFBWSxLQUFLLG9EQUFvRCxNQUFNLFNBQVMsQ0FBQyxrQ0FBa0Msd0JBQXdCLFFBQVEsYUFBYSxVQUFVLE9BQU8sWUFBWSxDQUFDLEVBQUU7QUFBQSxJQUMxTTtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsTUFBYyxvQkFBb0IsTUFBVyxTQUE0QixTQUFtRTtBQUMzSSxVQUFNLFVBQVUsUUFBUTtBQUN4QixVQUFNLFlBQVksYUFBYSxHQUFHLE9BQU87QUFDekMsU0FBSyxZQUFZLEtBQUssMkJBQTJCLEtBQUssU0FBUyxDQUFDLCtCQUErQixRQUFRLFFBQVEsU0FBUyxRQUFRLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtBQUNqSixVQUFNLGVBQWUsYUFBYTtBQUVsQyxVQUFNLGtCQUFrQixRQUFRLHVCQUF1QjtBQUN2RCxVQUFNLG1CQUFtQixNQUFNLEtBQUssK0JBQStCLFNBQVMsV0FBVyxlQUFlO0FBQ3RHLFVBQU0sS0FBSyxjQUFjO0FBT3pCLFVBQU0sV0FBVyxLQUFLLGVBQWUsSUFBSTtBQUN6QyxRQUFJLFVBQVU7QUFDYixXQUFLLFlBQVksS0FBSyx5Q0FBeUMsS0FBSyxTQUFTLENBQUMsc0NBQXNDO0FBQ3BILFlBQU1DLFdBQVUsTUFBTSwwQkFBMEIsRUFBRSxLQUFLLGlCQUFpQixPQUFPLEdBQUcsS0FBSyxXQUFXO0FBQ2xHLGFBQU87QUFBQSxRQUNOLDBCQUEwQjtBQUFBLFFBQzFCLEdBQUlBLFdBQVUsRUFBRSxTQUFBQSxTQUFRLElBQUksQ0FBQztBQUFBLFFBQzdCLEdBQUcsS0FBSyxtQkFBbUIsV0FBVyxFQUFFLGNBQWMsU0FBUyxVQUFVLENBQUM7QUFBQSxNQUMzRTtBQUFBLElBQ0Q7QUFVQSxVQUFNLFdBQVcsS0FBSyxxQkFBcUIsSUFBSSxTQUFTO0FBS3hELFFBQUksUUFBUSxjQUFjO0FBQ3pCLFlBQU0sS0FBSyxLQUFLLHlCQUF5QixTQUFTLGdCQUFnQjtBQUlsRSxTQUFHLGlCQUFpQix5QkFBeUIsS0FBSyxvQ0FBb0MsUUFBUSxrQkFBa0IsQ0FBQztBQUNqSCxZQUFNLFNBQVMsUUFBUTtBQUN2QixTQUFHLFFBQVEsSUFBSSxPQUFPLFVBQVUsT0FBTyxLQUFLO0FBQzVDLFNBQUcsa0JBQWtCLE9BQU8sVUFBVSxPQUFPLFdBQVc7QUFLeEQsV0FBSyxpQkFBaUIsSUFBSSxPQUFPLFVBQVUsSUFBSTtBQUMvQyxVQUFJLE9BQU8sbUJBQW1CLFFBQVc7QUFJeEMsY0FBTSxHQUFHLGlCQUFpQixLQUFLLE9BQU8sVUFBVSxPQUFPLGdCQUFnQixFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDdkY7QUFBQSxJQUNEO0FBS0EsVUFBTSxVQUFVLE1BQU0sMEJBQTBCLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxHQUFHLEtBQUssV0FBVztBQUVsRyxRQUFJLENBQUMsVUFBVTtBQUNkLFdBQUssc0JBQXNCLFNBQVM7QUFDcEMsV0FBSyxxQkFBcUIsSUFBSSxXQUFXO0FBQUEsUUFDeEM7QUFBQSxRQUNBO0FBQUEsUUFDQSxZQUFZO0FBQUEsUUFDWjtBQUFBLFFBQ0E7QUFBQSxRQUNBLG9CQUFvQixRQUFRO0FBQUEsUUFDNUIsT0FBTyxRQUFRO0FBQUEsUUFDZixPQUFPLFFBQVE7QUFBQSxRQUNmO0FBQUEsUUFDQSxlQUFlO0FBQUEsTUFDaEIsQ0FBQztBQUNELFdBQUssY0FBYyxJQUFJLEtBQUssU0FBUyxHQUFHLEVBQUUsYUFBYSxDQUFDO0FBQUEsSUFDekQ7QUFFQSxTQUFLLFlBQVksS0FBSyw0RUFBNEUsUUFBUSxTQUFTLENBQUMsRUFBRTtBQUN0SCxXQUFPO0FBQUEsTUFDTiwwQkFBMEI7QUFBQSxNQUMxQixhQUFhO0FBQUEsTUFDYixHQUFJLFVBQVUsRUFBRSxRQUFRLElBQUksQ0FBQztBQUFBLE1BQzdCLEdBQUcsS0FBSyxtQkFBbUIsV0FBVyxFQUFFLGNBQWMsVUFBVSxnQkFBZ0IsYUFBYSxDQUFDO0FBQUEsSUFDL0Y7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLE1BQWMsbUJBQW1CLE1BQVcsU0FBNEIsU0FBbUU7QUFDMUksVUFBTSxVQUFVLFFBQVE7QUFDeEIsVUFBTSxZQUFZLGFBQWEsR0FBRyxPQUFPO0FBQ3pDLFVBQU0sbUJBQW1CLE1BQU0sS0FBSywrQkFBK0IsU0FBUyxXQUFXLFFBQVEsdUJBQXVCLE1BQVM7QUFDL0gsVUFBTSxLQUFLLGNBQWM7QUFDekIsUUFBSSxDQUFDLEtBQUssb0JBQW9CLFNBQVMsS0FBSyxDQUFDLEtBQUsscUJBQXFCLElBQUksU0FBUyxHQUFHO0FBQ3RGLFdBQUssc0JBQXNCLFNBQVM7QUFBQSxJQUNyQztBQUdBLFdBQU8sS0FBSyxvQkFBb0IsU0FBUyxXQUFXLGtCQUFrQixJQUFJO0FBQUEsRUFDM0U7QUFBQTtBQUFBLEVBR0EsTUFBYyxvQkFBb0IsU0FBa0MsV0FBbUIsa0JBQXVCLE1BQTRDO0FBQ3pKLFVBQU0sZUFBZSxRQUFRO0FBQzdCLFVBQU0sYUFBYSxhQUFhLElBQUksS0FBSyxJQUFJLFNBQVM7QUFDdEQsV0FBTyxLQUFLLGNBQWMsV0FBVyxZQUFZO0FBQ2hELFdBQUssWUFBWSxLQUFLLGlEQUFpRCxTQUFTLEtBQUssYUFBYSxNQUFNLE1BQU0sU0FBUztBQUN2SCxZQUFNLFFBQVEsYUFBYSxTQUFTLFFBQVE7QUFNNUMsWUFBTSxpQkFBaUIsMEJBQTBCLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxHQUFHLEtBQUssV0FBVztBQUNuRyxZQUFNLGFBQWEsS0FBSyxtQkFBbUIsS0FBSyxvQkFBb0IsU0FBUyxRQUFRLFFBQVEsR0FBRyxHQUFHLGlCQUFpQixXQUFXLGNBQWM7QUFDN0ksWUFBTSxRQUFRLDhCQUE4QixhQUFhLE9BQU87QUFBQSxRQUMvRDtBQUFBLFFBQ0Esa0JBQWtCLGlCQUFpQjtBQUFBLFFBQ25DLE9BQU8sT0FBTztBQUFBLE1BQ2YsQ0FBQztBQUNELFlBQU0sR0FBRyxNQUFNLFFBQVEsVUFBVSxHQUFHLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFDdkQsWUFBTSxHQUFHLFVBQVUsWUFBWSxPQUFPLE1BQU07QUFJNUMsWUFBTSxVQUFVLE1BQU07QUFDdEIsWUFBTSxLQUFLLHNCQUFzQixZQUFZLE9BQU8sa0JBQWtCLFFBQVEsc0JBQXVCLENBQUMsZ0JBQWdCLEdBQUksa0JBQWtCLE9BQU87QUFDbkosVUFBSSxRQUFRLFVBQVUsUUFBVztBQUNoQyxjQUFNLEtBQUssMkJBQTJCLFlBQVksUUFBUSxLQUFLO0FBQUEsTUFDaEU7QUFLQSxZQUFNLFdBQVcsTUFBTSxLQUFLLGVBQWUsV0FBVyxJQUFJO0FBQzFELFdBQUssWUFBWSxLQUFLLHVDQUF1QyxXQUFXLFNBQVMsQ0FBQyxFQUFFO0FBQ3BGLGFBQU87QUFBQSxRQUNOLDBCQUEwQjtBQUFBLFFBQzFCLEdBQUksVUFBVSxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQUEsUUFDN0IsR0FBRyxLQUFLLG1CQUFtQixXQUFXLEVBQUUsY0FBYyxTQUFTLFVBQVUsQ0FBQztBQUFBLE1BQzNFO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHUSw2QkFBNkIsV0FBbUIsVUFBMEI7QUFDakYsV0FBTyxLQUFLLG1CQUFtQixLQUFLLG9CQUFvQixTQUFTLFFBQVEsUUFBUSxHQUFHLEdBQUcsaUJBQWlCLFdBQVcsUUFBUTtBQUFBLEVBQzVIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLDRCQUE0QixXQUFpRTtBQUNwRyxRQUFJLFNBQVMsS0FBSyw2QkFBNkIsSUFBSSxTQUFTO0FBQzVELFFBQUksQ0FBQyxRQUFRO0FBQ1osZUFBUyxHQUFHLFNBQVMsS0FBSyw2QkFBNkIsV0FBVyxzQkFBc0IsR0FBRyxNQUFNLEVBQy9GLEtBQUssU0FBTztBQUNaLGNBQU0sU0FBUyxLQUFLLE1BQU0sR0FBRztBQUM3QixlQUFPLFVBQVUsT0FBTyxXQUFXLFlBQVksQ0FBQyxNQUFNLFFBQVEsTUFBTSxJQUFJLFNBQW9DO0FBQUEsTUFDN0csQ0FBQyxFQUNBLE1BQU0sTUFBTSxNQUFTO0FBQ3ZCLFdBQUssNkJBQTZCLElBQUksV0FBVyxNQUFNO0FBQUEsSUFDeEQ7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYywyQkFBMkIsV0FBcUM7QUFDN0UsVUFBTSxTQUFTLE1BQU0sS0FBSyw0QkFBNEIsU0FBUztBQUMvRCxRQUFJLENBQUMsVUFBVSxPQUFPLEtBQUssTUFBTSxFQUFFLFdBQVcsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUlBLFFBQUksT0FBTyxXQUFXLFFBQVc7QUFDaEMsYUFBTyxPQUFPLFdBQVc7QUFBQSxJQUMxQjtBQUNBLFdBQU8sT0FBTyx5QkFBeUIsVUFDbkMsT0FBTyx1QkFBdUIsVUFDOUIsT0FBTyxvQkFBb0I7QUFBQSxFQUNoQztBQUFBO0FBQUEsRUFHQSxNQUFjLGlDQUFpQyxXQUFnRDtBQUM5RixVQUFNLFNBQVMsTUFBTSxLQUFLLDRCQUE0QixTQUFTLElBQUk7QUFDbkUsV0FBTyxPQUFPLFVBQVUsWUFBWSxNQUFNLEtBQUssSUFBSSxRQUFRO0FBQUEsRUFDNUQ7QUFBQTtBQUFBLEVBR0EsTUFBTSxrQkFBa0IsTUFBVyxTQUFxRTtBQUN2RyxVQUFNLFVBQVUsd0JBQXdCLFNBQVMsSUFBSSxFQUFFO0FBQ3ZELFVBQU0sWUFBWSxhQUFhLEdBQUcsT0FBTztBQUN6QyxXQUFPLEtBQUssY0FBYyxXQUFXLFlBQVk7QUFNaEQsWUFBTSxXQUFXLE1BQU0sS0FBSywyQkFBMkIsT0FBTztBQUM5RCxVQUFJLFVBQVUsa0JBQWtCO0FBQy9CLGVBQU8sRUFBRSxTQUFTLE9BQU8sVUFBVSxNQUFNO0FBQUEsTUFDMUM7QUFHQSxVQUFJLENBQUUsTUFBTSxLQUFLLDJCQUEyQixTQUFTLEdBQUk7QUFDeEQsZUFBTyxFQUFFLFNBQVMsT0FBTyxVQUFVLE1BQU07QUFBQSxNQUMxQztBQUNBLFlBQU0sU0FBUyxNQUFNLEtBQUssY0FBYztBQUN4QyxZQUFNLGNBQWMsTUFBTSxPQUFPLG1CQUFtQixTQUFTLEVBQUUsTUFBTSxNQUFNLE1BQVM7QUFDcEYsWUFBTSxtQkFBbUIsT0FBTyxhQUFhLFNBQVMscUJBQXFCLFdBQVcsSUFBSSxLQUFLLFlBQVksUUFBUSxnQkFBZ0IsSUFBSTtBQUN2SSxVQUFJLENBQUMsa0JBQWtCO0FBR3RCLGVBQU8sRUFBRSxTQUFTLE9BQU8sVUFBVSxLQUFLO0FBQUEsTUFDekM7QUFDQSxXQUFLLFlBQVksS0FBSyxxQ0FBcUMsU0FBUywwQ0FBMEM7QUFJOUcsWUFBTSxVQUFVLE1BQU0sMEJBQTBCLEVBQUUsS0FBSyxpQkFBaUIsT0FBTyxHQUFHLEtBQUssV0FBVztBQUdsRyxZQUFNLGNBQWMsTUFBTSxLQUFLLGlDQUFpQyxTQUFTO0FBUXpFLFlBQU0sS0FBSztBQUFBLFFBQXNCO0FBQUEsUUFBUztBQUFBLFFBQVc7QUFBQSxRQUFrQixDQUFDLGdCQUFnQjtBQUFBLFFBQUc7QUFBQSxRQUFrQjtBQUFBLFFBQVMsWUFBWTtBQUFBLFFBQVcsRUFBRSxDQUFDLGlCQUFpQixTQUFTLEdBQUcsU0FBUztBQUFBLFFBQUc7QUFBQTtBQUFBLFFBQTRCO0FBQUEsTUFBSTtBQUN6TixZQUFNLEtBQUssc0JBQXNCLFNBQVMsU0FBUztBQUNuRCxhQUFPLEVBQUUsU0FBUyxNQUFNLFVBQVUsS0FBSztBQUFBLElBQ3hDLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVlBLE1BQWMsc0JBQXNCLFNBQWMsV0FBa0M7QUFHbkYsVUFBTSxNQUFNLE1BQU0sR0FBRyxTQUFTLEtBQUssNkJBQTZCLFdBQVcsK0JBQStCLEdBQUcsTUFBTSxFQUFFLE1BQU0sTUFBTSxNQUFTO0FBQzFJLFFBQUksUUFBUSxRQUFXO0FBQ3RCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxZQUFNLFNBQWtCLEtBQUssTUFBTSxHQUFHO0FBQ3RDLFVBQUksQ0FBQyxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQzNCO0FBQUEsTUFDRDtBQUdBLFlBQU0sT0FBaUUsQ0FBQztBQUN4RSxpQkFBVyxTQUFTLFFBQXNEO0FBQ3pFLGNBQU0sU0FBUyxPQUFPO0FBQ3RCLGNBQU0sVUFBVSxPQUFPO0FBQ3ZCLFlBQUksT0FBTyxXQUFXLFlBQVksQ0FBQyxVQUFVLE9BQU8sWUFBWSxZQUFZLENBQUMsT0FBTyxTQUFTLE9BQU8sS0FBSyxVQUFVLEdBQUc7QUFDckg7QUFBQSxRQUNEO0FBQ0EsYUFBSyxLQUFLO0FBQUEsVUFDVDtBQUFBLFVBQ0EsT0FBTztBQUFBLFlBQ04sR0FBSSxPQUFPLE1BQU0sb0JBQW9CLFlBQVksTUFBTSxrQkFBa0IsRUFBRSxPQUFPLE1BQU0sZ0JBQWdCLElBQUksQ0FBQztBQUFBLFlBQzdHLE9BQU8sRUFBRSxjQUFjLEVBQUUsY0FBYyxLQUFLLE1BQU0sVUFBVSxtQkFBbUIsRUFBRSxFQUFFO0FBQUEsVUFDcEY7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQ0EsVUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsS0FBSyxvQkFBb0IsYUFBYSxPQUFPO0FBQzNELFVBQUk7QUFDSCxtQkFBVyxPQUFPLE1BQU07QUFDdkIsZ0JBQU0sTUFBTSxPQUFPLGFBQWEsSUFBSSxRQUFRLEtBQUssVUFBVSxJQUFJLEtBQUssQ0FBQztBQUFBLFFBQ3RFO0FBQUEsTUFDRCxVQUFFO0FBQ0QsY0FBTSxRQUFRO0FBQUEsTUFDZjtBQUNBLFdBQUssWUFBWSxLQUFLLHFCQUFxQixLQUFLLE1BQU0sMENBQTBDLFNBQVMsRUFBRTtBQUFBLElBQzVHLFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxLQUFLLDJEQUEyRCxTQUFTLElBQUksR0FBRztBQUFBLElBQ2xHO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHQSxNQUFjLHdCQUF3QixXQUFtQiw0QkFBMkU7QUFDbkksVUFBTSxjQUFjLEtBQUsscUJBQXFCLElBQUksU0FBUztBQUMzRCxRQUFJLENBQUMsYUFBYTtBQUNqQixZQUFNLElBQUksTUFBTSxtREFBbUQsU0FBUyxFQUFFO0FBQUEsSUFDL0U7QUFDQSxVQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWM7QUFDeEMsVUFBTSxhQUFhLFlBQVk7QUFDL0IsVUFBTSxlQUFlLFlBQVk7QUFNakMsVUFBTSxtQkFBbUIsNkJBQTZCLENBQUMsS0FBSyxZQUFZO0FBS3hFLFVBQU0seUJBQXlCLG9CQUFvQixZQUFZO0FBSS9ELFVBQU0sZUFBZSxLQUFLLHlCQUF5QixZQUFZLHNCQUFzQjtBQUdyRixpQkFBYSxpQkFBaUIsU0FBUyxzQkFBc0I7QUFHN0QsaUJBQWEsaUJBQWlCLHlCQUF5QixLQUFLLG9DQUFvQywwQkFBMEIsQ0FBQztBQUUzSCxVQUFNLFdBQVcsTUFBTSxhQUFhLFVBQVUsS0FBSyxvQkFBb0IsVUFBVSxLQUFLLFlBQVksU0FBUyxDQUFDO0FBQzVHLFVBQU0sZUFBZSxLQUFLLHNCQUFzQixlQUFlLGNBQWMsWUFBWSxnQkFBZ0I7QUFFekcsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxnQkFBZ0IsTUFBTSxLQUFLLCtCQUErQixhQUFhLFVBQVUsZ0JBQWdCO0FBQ3ZHLGNBQVEsZUFBZTtBQUN2QixZQUFNLGFBQXVDO0FBQUEsUUFDNUMsTUFBTTtBQUFBLFFBQ047QUFBQSxRQUNBLFdBQVc7QUFBQSxRQUNYO0FBQUEsUUFDQSx1QkFBdUIsS0FBSyxvQ0FBb0MsMEJBQTBCO0FBQUEsUUFDMUYsbUJBQW1CLGVBQWU7QUFBQSxRQUNsQztBQUFBLFFBQ0Esd0JBQXdCLEtBQUssd0JBQXdCLFlBQVksY0FBYyxRQUFRO0FBQUEsUUFDdkYscUJBQXFCLGFBQWE7QUFBQSxRQUNsQztBQUFBLFFBQ0EsYUFBYSxLQUFLO0FBQUEsUUFDbEIsT0FBTyxZQUFZO0FBQUEsUUFDbkIsbUJBQW1CLEtBQUssc0JBQXNCLFlBQVksT0FBTyxFQUFFO0FBQUEsUUFDbkUsaUJBQWlCLEtBQUssbUJBQW1CLFlBQVksT0FBTyxFQUFFO0FBQUEsUUFDOUQsZUFBZSxZQUFZO0FBQUEsTUFDNUI7QUFDQSxZQUFNLGlCQUFpQixLQUFLLHlCQUF5QixZQUFZLEtBQUs7QUFDdEUscUJBQWUsS0FBSyxvQkFBb0IsWUFBWSx3QkFBd0IsY0FBYztBQUFBLFFBQ3pGO0FBQUEsUUFDQTtBQUFBLFFBQ0EsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUNELFlBQU0sYUFBYSxrQkFBa0I7QUFDckMsV0FBSyw0QkFBNEIsY0FBYyxjQUFjLGNBQWMsV0FBVyxNQUFNO0FBQUEsSUFDN0YsU0FBUyxPQUFPO0FBQ2Ysb0JBQWMsUUFBUTtBQUN0QixZQUFNO0FBQUEsSUFDUDtBQUVBLFVBQU0sVUFBVSxNQUFNLDBCQUEwQixFQUFFLEtBQUssa0JBQWtCLE9BQU8sR0FBRyxLQUFLLFdBQVc7QUFLbkcsVUFBTSxpQ0FBaUMsOEJBQStCLENBQUMsZ0JBQWdCO0FBRXZGLFNBQUsscUJBQXFCLE9BQU8sU0FBUztBQUMxQyxVQUFNLEtBQUssc0JBQXNCLFlBQVksWUFBWSxPQUFPLGtCQUFrQixnQ0FBZ0Msd0JBQXdCLFNBQVMsSUFBSTtBQUN2SixRQUFJLFVBQVUsUUFBVztBQUN4QixZQUFNLEtBQUssMkJBQTJCLFlBQVksS0FBSztBQUFBLElBQ3hEO0FBWUEsU0FBSyxtQkFBbUIsMEJBQTBCLFlBQVksOEJBQThCLEVBQUUsTUFBTSxTQUFPO0FBQzFHLFdBQUssWUFBWSxLQUFLLFlBQVksU0FBUyx5Q0FBeUMsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDdkksQ0FBQztBQUVELFNBQUssWUFBWSxLQUFLLG1DQUFtQyxXQUFXLFNBQVMsQ0FBQyxFQUFFO0FBR2hGLFNBQUssc0JBQXNCLEtBQUssRUFBRSxNQUFNLFlBQVksTUFBTSxTQUFTLG9CQUFvQiwrQkFBK0IsQ0FBQztBQUN2SCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYywrQkFBK0IsYUFBa0MsVUFBaUMsa0JBQWlHO0FBQ2hOLFVBQU0sUUFBUSxZQUFZO0FBQzFCLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLG1CQUFtQixLQUFLLGdDQUFnQyxhQUFhLGdCQUFnQjtBQUUzRixVQUFNLG9CQUFvQixLQUFLLGtCQUFrQixVQUFVLEtBQUs7QUFDaEUsVUFBTSx1QkFBdUIsbUJBQW1CLEtBQUssa0JBQWtCLFVBQVUsZ0JBQWdCLElBQUk7QUFFckcsUUFBSSxtQkFBbUI7QUFDdEIsYUFBTyxFQUFFLE9BQWMsTUFBTSxrQkFBa0I7QUFBQSxJQUNoRDtBQUNBLFFBQUksd0JBQXdCLGtCQUFrQjtBQUM3QyxXQUFLLFlBQVksS0FBSyx3QkFBd0IsTUFBTSxHQUFHLGtEQUFrRCxrQkFBa0IsR0FBRyxFQUFFO0FBQ2hJLGFBQU8sRUFBRSxPQUFPLGtCQUFrQixNQUFNLHFCQUFxQjtBQUFBLElBQzlEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUNRLGdDQUFnQyxhQUFrQyxrQkFBK0Q7QUFDeEksVUFBTSxRQUFRLFlBQVk7QUFDMUIsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxZQUFZLG9CQUFvQixDQUFDLGtCQUFrQjtBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksUUFBUSxZQUFZLGtCQUFrQixnQkFBZ0IsR0FBRztBQUM1RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sV0FBVyxJQUFJLE1BQU0sTUFBTSxHQUFHO0FBQ3BDLFVBQU0sc0JBQXNCLFlBQVksVUFBVSxZQUFZLGtCQUFrQixnQkFBZ0I7QUFDaEcsV0FBTyxzQkFBc0IsRUFBRSxLQUFLLG9CQUFvQixTQUFTLEVBQUUsSUFBSTtBQUFBLEVBQ3hFO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixRQUE0RTtBQUluRyxVQUFNLFNBQVMsc0JBQXNCLGtCQUFrQiw2QkFBNkIsT0FBTyxNQUFNLEdBQUc7QUFBQSxNQUNuRyxDQUFDLGlCQUFpQixXQUFXLEdBQUc7QUFBQSxNQUNoQyxDQUFDLGlCQUFpQixJQUFJLEdBQUc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBSzFCLENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTixRQUFRLHNCQUFzQixXQUFXO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsdUJBQXVCLFFBQWdGO0FBQ3RHLFVBQU0sWUFBcUMsQ0FBQztBQUM1QyxlQUFXLE9BQU8sQ0FBQyxpQkFBaUIsYUFBYSxpQkFBaUIsV0FBVyxHQUFHO0FBQy9FLFVBQUksT0FBTyxHQUFHLE1BQU0sUUFBVztBQUM5QixrQkFBVSxHQUFHLElBQUksT0FBTyxHQUFHO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBQ0EsV0FBTyxPQUFPLEtBQUssU0FBUyxFQUFFLFNBQVMsSUFBSSxZQUFZO0FBQUEsRUFDeEQ7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFNBQXFGO0FBR2hILFdBQU8sRUFBRSxPQUFPLENBQUMsRUFBRTtBQUFBLEVBQ3BCO0FBQUE7QUFBQSxFQUdBLHdCQUF3QixNQUFXLFNBQWtDLFFBQXNFLG9CQUE4RDtBQUN4TSxVQUFNLHdCQUF3Qix3QkFBd0IsU0FBUyxJQUFJLEVBQUU7QUFDckUsU0FBSyw0QkFBNEIsdUJBQXVCLGtCQUFrQjtBQUMxRSxVQUFNLGVBQWUsS0FBSyx5QkFBeUIsdUJBQXVCLE1BQVM7QUFDbkYsU0FBSyxpQkFBaUIsY0FBYyxPQUFPLFVBQVUsSUFBSTtBQUl6RCxRQUFJLENBQUMsYUFBYSxpQkFBaUIsV0FBVztBQUM3QyxXQUFLLGdDQUFnQyxxQkFBcUIsRUFBRTtBQUFBLFFBQzNELGFBQVc7QUFDVix1QkFBYSxpQkFBaUIsYUFBYSxRQUFRLFNBQVM7QUFDNUQsY0FBSSxRQUFRLGlCQUFpQjtBQUM1Qix5QkFBYSxpQkFBaUIseUJBQXlCLFFBQVEscUJBQXFCO0FBQUEsVUFDckY7QUFBQSxRQUNEO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFBOEI7QUFBQSxNQUNyQztBQUFBLElBQ0Q7QUFDQSxXQUFPLGFBQWEsa0JBQWtCLE9BQU8sVUFBVSxPQUFPLFdBQVc7QUFBQSxFQUMxRTtBQUFBO0FBQUEsRUFHUSxpQkFBaUIsY0FBNEIsVUFBa0IsTUFBaUI7QUFDdkYsUUFBSSxhQUFhLGNBQWMsVUFBVSxJQUFJLEdBQUc7QUFDL0MsV0FBSyxZQUFZLEtBQUssMkJBQTJCLFFBQVEsNEJBQTRCLEtBQUssU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUN2RztBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsbUJBQW1CLE1BQVcsU0FBa0MsVUFBd0I7QUFDdkYsVUFBTSx3QkFBd0Isd0JBQXdCLFNBQVMsSUFBSSxFQUFFO0FBQ3JFLFVBQU0sa0JBQWtCLGFBQWEsR0FBRyxxQkFBcUI7QUFDN0QsVUFBTSxlQUFlLEtBQUssZUFBZSxJQUFJLHFCQUFxQjtBQUNsRSxRQUFJLENBQUMsY0FBYztBQUNsQixXQUFLLFlBQVksS0FBSyxZQUFZLGVBQWUsNkRBQTZELFFBQVEsVUFBVSxLQUFLLFNBQVMsQ0FBQyxFQUFFO0FBQ2pKO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxhQUFhLGlCQUFpQixVQUFVLElBQUk7QUFDaEUsU0FBSyxZQUFZLEtBQUssWUFBWSxlQUFlLGtDQUFrQyxRQUFRLFVBQVUsS0FBSyxTQUFTLENBQUMsa0JBQWtCLFdBQVcsRUFBRTtBQUNuSixRQUFJLGFBQWE7QUFDaEIsbUJBQWEsYUFBYSxRQUFRO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdBLHlCQUF5QixNQUFXLFlBQW9CLFFBQXdCLFNBQW1DO0FBQ2xILFVBQU0sY0FBYywwQkFBMEIsT0FBTztBQUNyRCxVQUFNLFNBQVMsS0FBSyxlQUFlLElBQUksTUFDbEMsY0FBYyxLQUFLLGVBQWUsWUFBWSxJQUFJLElBQUksWUFDdEQsVUFBVSxLQUFLLGlCQUFpQixRQUFRLHFCQUFxQixJQUFJO0FBQ3RFLFlBQVEsNkJBQTZCLFlBQVksTUFBTTtBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFjLGFBQWEsTUFBVyxRQUFnQixhQUE0QyxRQUFpQixnQkFBeUIsYUFBYSxvQkFBb0IsU0FBUyxvQkFBcUMsa0JBQTRDLHdCQUEwRTtBQUNoVixRQUFJO0FBQ0gsWUFBTSxLQUFLLGlCQUFpQixNQUFNLFFBQVEsYUFBYSxRQUFRLGdCQUFnQixZQUFZLG9CQUFvQixrQkFBa0Isc0JBQXNCO0FBQUEsSUFDeEosU0FBUyxPQUFPO0FBQ2YsWUFBTSxXQUFXLE1BQU0sS0FBSyw2QkFBNkIsT0FBTyxlQUFlLEtBQUssMEJBQTBCLE1BQU0sUUFBUSxnQkFBZ0IsQ0FBQztBQUM3SSxVQUFJLFVBQVUsVUFBVSxjQUFjLElBQUksTUFBTSxHQUFHO0FBQ2xEO0FBQUEsTUFDRDtBQUNBLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsTUFBVyxRQUFnQixhQUE0QyxRQUFpQixnQkFBeUIsYUFBYSxvQkFBb0IsU0FBUyxvQkFBcUMsa0JBQTRDLHdCQUEwRTtBQUNwVixVQUFNLFVBQVUsS0FBSyx3QkFBd0IsTUFBTSxnQkFBZ0I7QUFDbkUsVUFBTSxLQUFLLFdBQVcsUUFBUSxpQkFBaUIsUUFBUSxjQUFjLFlBQVk7QUFDaEYsWUFBTSxVQUFVLEtBQUssd0JBQXdCLE1BQU0sZ0JBQWdCO0FBQ25FLFlBQU0sS0FBSyxlQUFlLElBQUksUUFBUSxxQkFBcUIsR0FBRyxpQkFBaUIsOEJBQThCO0FBRTdHLFVBQUksUUFBeUMsUUFBUTtBQUNyRCxVQUFJLENBQUMsT0FBTztBQUNYLGdCQUFRLE1BQU0sS0FBSywyQkFBMkIsU0FBUyxrQkFBa0I7QUFBQSxNQUMxRTtBQUlBLFlBQU0sZUFBZSxLQUFLLGVBQWUsSUFBSSxRQUFRLHFCQUFxQjtBQUMxRSxZQUFNLGlCQUFpQixDQUFDLENBQUM7QUFDekIsV0FBSyxZQUFZLEtBQUssWUFBWSxRQUFRLGVBQWUsOEJBQThCLGNBQWMscUJBQXFCLENBQUMsQ0FBQyxZQUFZLG9CQUFvQixlQUFlLFVBQVUsUUFBUSxFQUFFO0FBQy9MLFlBQU0sZUFBZSxDQUFDLENBQUMsU0FBUyx1QkFBdUIsVUFBYSxDQUFDLHFDQUFxQyxNQUFNLDhCQUE4QixLQUFLLG9DQUFvQyxrQkFBa0IsQ0FBQztBQUMxTSxZQUFNLDBCQUEwQixDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsZ0JBQWdCLE1BQU0sYUFBYSxnQkFBZ0IsTUFBTSxpQkFBaUIsUUFBUSxPQUFPO0FBQ3RJLFVBQUksVUFBVSxnQkFBZ0IsMEJBQTBCO0FBQ3ZELGFBQUssWUFBWSxLQUFLLFlBQVksUUFBUSxlQUFlLGlFQUFpRSxlQUFlLENBQUMsR0FBRyxhQUFhLFFBQVEsVUFBVSxDQUFDLEVBQUUsS0FBSyxJQUFJLEtBQUssV0FBVyxRQUFRLEdBQUc7QUFNbk4sY0FBTSxLQUFLLG9CQUFvQixPQUFPLElBQUk7QUFDMUMsWUFBSSxNQUFNLGNBQWMsUUFBUSxpQkFBaUI7QUFDaEQsa0JBQVEsTUFBTSxLQUFLLGVBQWUsUUFBUSxpQkFBaUIsUUFBUSxNQUFNLGtCQUFrQjtBQUFBLFFBQzVGLE9BQU87QUFDTixjQUFJLG9CQUFvQjtBQUN2QiwwQkFBYyxpQkFBaUIseUJBQXlCLEtBQUssb0NBQW9DLGtCQUFrQixDQUFDO0FBQUEsVUFDckg7QUFDQSxrQkFBUSxNQUFNLEtBQUssMkJBQTJCLFNBQVMsa0JBQWtCO0FBQUEsUUFDMUU7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE9BQU87QUFDWCxhQUFLLFlBQVksS0FBSyxZQUFZLFFBQVEsZUFBZSxvQkFBb0IsaUJBQWlCLHNDQUFzQyxFQUFFLDBCQUEwQjtBQUFBLE1BQ2pLO0FBQ0EsZ0JBQVUsTUFBTSxLQUFLLDJCQUEyQixTQUFTLGtCQUFrQjtBQUMzRSxVQUFJLENBQUMsT0FBTztBQUNYLGNBQU0sSUFBSSxNQUFNLDJDQUEyQyxLQUFLLFNBQVMsQ0FBQyxFQUFFO0FBQUEsTUFDN0U7QUFLQSxVQUFJLFFBQVE7QUFDWCxjQUFNLGVBQWUsUUFBUSxnQkFBZ0IsWUFBWSxzQkFBc0I7QUFBQSxNQUNoRjtBQUVBLFVBQUk7QUFDSCxjQUFNLFVBQVUsS0FBSyxnQkFBZ0IsUUFBUSxxQkFBcUI7QUFDbEUsY0FBTSxXQUFXLEtBQUssY0FBYyxJQUFJLFFBQVEsT0FBTyxHQUFHO0FBQzFELGNBQU0sUUFBUSxXQUFXLE1BQU0sTUFBTSxZQUFZLElBQUksQ0FBQztBQUN0RCxjQUFNLFlBQVksc0JBQXNCLFFBQVEsT0FBTyxRQUFRO0FBQy9ELGNBQU0sTUFBTSxLQUFLLFdBQVcsYUFBYSxRQUFRLFNBQVMsZ0JBQWdCLFlBQVksNkJBQTZCLGdCQUFnQixHQUFHLHNCQUFzQjtBQUFBLE1BQzdKLFNBQVMsS0FBSztBQUNiLGNBQU0sVUFBVyxLQUEyQjtBQUM1QyxjQUFNLFNBQVMsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUc7QUFDOUQsYUFBSyxZQUFZLE1BQU0sWUFBWSxRQUFRLGVBQWUsK0JBQStCLE9BQU8sYUFBYSxNQUFNLG9CQUFvQixjQUFjLGVBQWUsS0FBSyxhQUFhLElBQUksRUFBRTtBQUM1TCxjQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFtQlEsZ0JBQWdCLFNBQTBDO0FBQ2pFLFVBQU0sYUFBYSxRQUFRLFNBQVM7QUFDcEMsVUFBTSxPQUFPLEtBQUssc0JBQXNCLGtCQUFrQixZQUFZLHVCQUF1QixpQkFBaUIsSUFBSTtBQUNsSCxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsdUJBQXVCLFdBQW9EO0FBQ2xGLFVBQU0sYUFBYSxhQUFhLElBQUksS0FBSyxJQUFJLFNBQVMsRUFBRSxTQUFTO0FBQ2pFLFdBQU87QUFBQSxNQUNOLE1BQU0sS0FBSyxzQkFBc0Isa0JBQWtCLFlBQVksdUJBQXVCLGlCQUFpQixJQUFJO0FBQUEsTUFDM0csYUFBYSxLQUFLLHNCQUFzQixrQkFBa0IsWUFBWSx1QkFBdUIsaUJBQWlCLFdBQVc7QUFBQSxJQUMxSDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLG1CQUFtQixNQUFXLGlCQUE2QyxpQkFBa0Q7QUFDNUgsVUFBTSxVQUFVLEtBQUssY0FBYyxJQUFJLEtBQUssU0FBUyxDQUFDO0FBQ3RELFVBQU0sU0FBUyxVQUFVLEtBQUssb0JBQW9CLFFBQVEsWUFBWSxJQUFJO0FBQzFFLFFBQUksQ0FBQyxRQUFRO0FBQ1osV0FBSyxZQUFZLEtBQUssb0RBQW9ELEtBQUssU0FBUyxDQUFDLEVBQUU7QUFDM0Y7QUFBQSxJQUNEO0FBR0EsUUFBSSxpQkFBaUI7QUFDcEIsYUFBTyxhQUFhLGVBQWU7QUFBQSxJQUNwQztBQUFBLEVBS0Q7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLE1BQVcsa0JBQXFFO0FBQzlHLFFBQUksS0FBSyxpQkFBaUI7QUFDekIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUdBLFFBQUksMEJBQTBCLGdCQUFnQixHQUFHO0FBQ2hELGFBQU8sS0FBSyx5QkFBeUIsTUFBTSxnQkFBZ0I7QUFBQSxJQUM1RDtBQUNBLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixNQUFNLGdCQUFnQjtBQUMvRCxRQUFJLEtBQUsscUJBQXFCLElBQUksUUFBUSxlQUFlLEdBQUcsaUJBQWlCLFFBQVEsY0FBYztBQUNsRyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsVUFBTSxRQUFRLE1BQU0sS0FBSyxXQUFXLFFBQVEsaUJBQWlCLFFBQVEsY0FBYyxZQUFZO0FBQzlGLGFBQU8sS0FBSywyQkFBMkIsS0FBSyxvQkFBb0IsTUFBTSxnQkFBZ0IsQ0FBQyxFQUFFLE1BQU0sU0FBTztBQUNyRyxZQUFJLGVBQWUscUNBQXFDO0FBQ3ZELGdCQUFNO0FBQUEsUUFDUDtBQUNBLFlBQUksUUFBUSxjQUFjO0FBQ3pCLGdCQUFNO0FBQUEsUUFDUDtBQUNBLGFBQUssWUFBWSxLQUFLLFlBQVksUUFBUSxlQUFlLCtDQUErQyxHQUFHO0FBQzNHLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFDRCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxVQUFNLFFBQVEsTUFBTSxNQUFNLFlBQVk7QUFDdEMsVUFBTSxXQUFXLEtBQUssY0FBYyxJQUFJLFFBQVEsT0FBTyxHQUFHO0FBQzFELFdBQU8sbUJBQW1CLE9BQU8sUUFBUTtBQUFBLEVBQzFDO0FBQUE7QUFBQSxFQUdBLE1BQWMseUJBQXlCLE1BQVcsa0JBQXFFO0FBQ3RILFVBQU0sY0FBYywwQkFBMEIsZ0JBQWdCO0FBQzlELFFBQUksQ0FBQyxhQUFhO0FBQ2pCLFdBQUssWUFBWSxLQUFLLDJCQUEyQixLQUFLLFNBQVMsQ0FBQyxnRkFBZ0Y7QUFDaEosYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sUUFBUSx3QkFBd0Isa0JBQWtCLElBQUksRUFBRTtBQUM5RCxVQUFNLGdCQUFnQixLQUFLLG9CQUFvQixZQUFZLE1BQU0sRUFBRSx1QkFBdUIsT0FBTyxVQUFVLE1BQU0sQ0FBQztBQUNsSCxVQUFNLGNBQWMsTUFBTSxLQUFLLDJCQUEyQixhQUFhLEVBQUUsTUFBTSxTQUFPO0FBQ3JGLFdBQUssWUFBWSxLQUFLLFlBQVksY0FBYyxnQkFBZ0IsY0FBYyxlQUFlLDZEQUE2RCxHQUFHO0FBQzdKLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxXQUFPLGFBQWEsb0JBQW9CLFlBQVksVUFBVSxLQUFLLENBQUM7QUFBQSxFQUNyRTtBQUFBO0FBQUEsRUFHQSxNQUFjLDRCQUE0QixPQUFZLFNBQWlCLG1CQUEyQztBQUNqSCxVQUFNLGtCQUFrQixzQkFDbkIsTUFBTSxLQUFLLHFCQUFxQixLQUFLLEVBQUUsTUFBTSxNQUFNLE1BQVMsSUFBSSxrQkFBa0I7QUFDdkYsU0FBSyxxQkFBcUIsT0FBTyxPQUFPO0FBQ3hDLFVBQU0sS0FBSyxrQkFBa0IsSUFBSSxPQUFPLEdBQUcsUUFBUSxZQUFZO0FBQUEsSUFBRSxDQUFDO0FBQ2xFLFNBQUssZUFBZSxJQUFJLEtBQUssR0FBRyxRQUFRO0FBQ3hDLFNBQUssZUFBZSxPQUFPLEtBQUs7QUFDaEMsU0FBSyxvQkFBb0IsT0FBTyxLQUFLO0FBQ3JDLFFBQUksaUJBQWlCO0FBQ3BCLFlBQU0sS0FBSyxnQ0FBZ0MsS0FBSyx5QkFBeUIsT0FBTyxHQUFHLE9BQU87QUFBQSxJQUMzRjtBQUNBLFNBQUssYUFBYSwyQkFBMkIsTUFBTSxTQUFTLENBQUM7QUFDN0QsVUFBTSxLQUFLLDJCQUEyQjtBQUFBLEVBQ3ZDO0FBQUEsRUFFQSxNQUFjLGNBQWMsTUFBVyxrQkFBMEQ7QUFDaEcsUUFBSTtBQUNILFlBQU0sS0FBSyxrQkFBa0IsTUFBTSxnQkFBZ0I7QUFBQSxJQUNwRCxTQUFTLE9BQU87QUFDZixZQUFNLGNBQWMsS0FBSywwQkFBMEIsTUFBTSxRQUFXLGdCQUFnQjtBQUNwRixVQUFJLENBQUMsK0JBQStCLEtBQUssR0FBRztBQUMzQyxjQUFNLEtBQUssNkJBQTZCLE9BQU8sU0FBUyxXQUFXO0FBQ25FLGNBQU07QUFBQSxNQUNQO0FBQ0EsV0FBSyxvQkFBb0IsTUFBTSxnQkFBZ0IsRUFBRSxRQUFRLGtCQUFrQjtBQUMzRSxVQUFJLENBQUMsTUFBTSxLQUFLLDZCQUE2QixPQUFPLFNBQVMsV0FBVyxHQUFHO0FBQzFFLGNBQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLE1BQVcsa0JBQTBEO0FBQ3BHLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixNQUFNLGdCQUFnQjtBQUMvRCxVQUFNLEtBQUssV0FBVyxRQUFRLGlCQUFpQixRQUFRLGNBQWMsWUFBWTtBQUNoRixZQUFNLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCLEVBQUUsUUFBUSxNQUFNO0FBQUEsSUFDdEUsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBR0EsTUFBYyxpQkFBaUIsTUFBVyxTQUE0QixTQUFtRTtBQUN4SSxVQUFNLFVBQVUsS0FBSyxTQUFTO0FBQzlCLFVBQU0sVUFBVSxRQUFRO0FBQ3hCLFVBQU0sWUFBWSxhQUFhLEdBQUcsT0FBTztBQUN6QyxVQUFNLE9BQU8sUUFBUTtBQUlyQixVQUFNLGtCQUFrQixPQUFPLEtBQUssa0JBQWtCLEtBQUssTUFBTSxJQUFJO0FBQ3JFLFVBQU0sc0JBQXNCLGtCQUFrQixhQUFhLEdBQUcsZUFBZSxJQUFJO0FBQ2pGLFVBQU0sMkJBQTJCLENBQUMsQ0FBQyxRQUFRLHdCQUF3QjtBQUNuRSxVQUFNLGtCQUFrQixLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQ3RELFFBQUksaUJBQWlCO0FBQ3BCLGFBQU8sS0FBSywwQkFBMEIsU0FBUyxXQUFXLGlCQUFpQix3QkFBd0I7QUFBQSxJQUNwRztBQUNBLFFBQUksUUFBUSxRQUFRLEtBQUssUUFBUSxJQUFJLEdBQUc7QUFDdkMsWUFBTSxJQUFJLE1BQU0sNEJBQTRCLE9BQU8sY0FBYztBQUFBLElBQ2xFO0FBQ0EsUUFBSTtBQUlKLFVBQU0sUUFBUSxDQUFJLFNBQTJCLFFBQVEsV0FDbEQsS0FBSyxXQUFXLFdBQVcsU0FBUyxJQUFJLElBQ3hDLEtBQUssY0FBYyx1QkFBdUIsV0FBVyxJQUFJO0FBQzVELFVBQU0sTUFBTSxZQUFZO0FBQ3ZCLFlBQU0sV0FBVyxLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQy9DLFVBQUksVUFBVTtBQUNiLGlCQUFTLE1BQU0sS0FBSywwQkFBMEIsU0FBUyxXQUFXLFVBQVUsd0JBQXdCO0FBQ3BHO0FBQUEsTUFDRDtBQUlBLFlBQU0sbUJBQW1CLDJCQUN0QixNQUFNLEtBQUssK0JBQStCLFNBQVMsV0FBVyxLQUFLLElBQ25FLFFBQVEscUJBQXFCLENBQUM7QUFDakMsVUFBSSxDQUFDLGtCQUFrQjtBQUN0QixjQUFNLElBQUksTUFBTSx3RUFBd0UsUUFBUSxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQzdHO0FBQ0EsWUFBTSxpQkFBaUIsMkJBQTJCLE1BQU0sS0FBSyxxQkFBcUIsZUFBZ0IsSUFBSTtBQUN0RyxZQUFNLFFBQVEsUUFBUSxTQUFTLGdCQUFnQjtBQUMvQyxZQUFNLFFBQVEsUUFBUSxTQUFTLGdCQUFnQjtBQUMvQyxZQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWM7QUFDeEMsWUFBTSxZQUFZLGFBQWE7QUFPL0IsWUFBTSxlQUFlLEtBQUsseUJBQXlCLFNBQVMsZ0JBQWdCO0FBQzVFLFlBQU0sV0FBVyxNQUFNLGFBQWEsU0FBUyxPQUFPO0FBQ3BELFlBQU0sZUFBZSxLQUFLLHNCQUFzQixlQUFlLGNBQWMsTUFBTSxnQkFBZ0I7QUFHbkcsWUFBTSxlQUFlLFFBQVE7QUFNN0IsVUFBSTtBQUNKLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSTtBQUNKLFVBQUksTUFBTTtBQUNULHNCQUFjLE1BQU0sS0FBSywyQkFBMkIsS0FBSyxvQkFBb0IsS0FBSyxRQUFRLEVBQUUsdUJBQXVCLGlCQUFrQixVQUFVLEtBQUsseUJBQXlCLEtBQUssTUFBTSxFQUFFLENBQUMsQ0FBQztBQUM1TCxZQUFJLENBQUMsYUFBYTtBQUNqQixnQkFBTSxJQUFJLE1BQU0sMENBQTBDLEtBQUssT0FBTyxTQUFTLENBQUMsWUFBWTtBQUFBLFFBQzdGO0FBQ0EsY0FBTSxTQUFTLE1BQU0sS0FBSyxhQUFhLFFBQVEsYUFBYSxLQUFLLFFBQVEsS0FBSyxvQkFBb0Isa0JBQWtCLFlBQVksQ0FBQztBQUNqSSx1QkFBZSxPQUFPO0FBQ3RCLHFCQUFhO0FBQUEsVUFDWixNQUFNO0FBQUEsVUFDTjtBQUFBLFVBQ0EsV0FBVztBQUFBLFVBQ1g7QUFBQSxVQUNBLG1CQUFtQjtBQUFBLFVBQ25CO0FBQUEsVUFDQSx3QkFBd0IsS0FBSyx3QkFBd0IsU0FBUyxjQUFjLFFBQVE7QUFBQSxVQUNwRixxQkFBcUIsYUFBYTtBQUFBLFVBQ2xDO0FBQUEsVUFDQSxhQUFhLEtBQUs7QUFBQSxVQUNsQixVQUFVLEVBQUUsT0FBTyxtQkFBbUIsS0FBSyxzQkFBc0IsT0FBTyxFQUFFLEdBQUcsaUJBQWlCLEtBQUssbUJBQW1CLE9BQU8sRUFBRSxFQUFFO0FBQUEsUUFDbEk7QUFBQSxNQUNELFdBQVcsUUFBUSxVQUFVO0FBQzVCLGNBQU0saUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsS0FBSyxvQkFBb0IsUUFBUSxTQUFTLFFBQVEsRUFBRSx1QkFBdUIsS0FBSyxrQkFBa0IsUUFBUSxTQUFTLE1BQU0sR0FBRyxVQUFVLEtBQUsseUJBQXlCLFFBQVEsU0FBUyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQzVQLFlBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsZ0JBQU0sSUFBSSxNQUFNLCtDQUErQyxRQUFRLFNBQVMsT0FBTyxTQUFTLENBQUMsWUFBWTtBQUFBLFFBQzlHO0FBQ0EsY0FBTSxTQUFTLE1BQU0sS0FBSyxhQUFhLFFBQVEsZ0JBQWdCLFFBQVEsU0FBUyx3QkFBd0IsUUFBUSxTQUFTLFFBQVEsS0FBSyxvQkFBb0Isa0JBQWtCLFlBQVksQ0FBQztBQUN6TCx1QkFBZSxPQUFPO0FBQ3RCLG1CQUFXO0FBQUEsVUFDVixRQUFRLFFBQVEsU0FBUyxPQUFPLFNBQVM7QUFBQSxVQUN6QyxRQUFRLFFBQVEsU0FBUztBQUFBLFVBQ3pCLEdBQUksUUFBUSxTQUFTLFlBQVksRUFBRSxXQUFXLFFBQVEsU0FBUyxVQUFVLElBQUksQ0FBQztBQUFBLFVBQzlFLEdBQUksUUFBUSxTQUFTLHVCQUF1QixFQUFFLHNCQUFzQixRQUFRLFNBQVMscUJBQXFCLElBQUksQ0FBQztBQUFBLFVBQy9HLEdBQUksT0FBTyxvQkFBb0IsU0FBWSxFQUFFLGlCQUFpQixPQUFPLGdCQUFnQixJQUFJLENBQUM7QUFBQSxVQUMxRixHQUFJLFFBQVEsU0FBUyxnQkFBZ0IsRUFBRSxTQUFTLFFBQVEsU0FBUyxjQUFjLElBQUksQ0FBQztBQUFBLFVBQ3BGLEdBQUksUUFBUSxTQUFTLGtCQUFrQixFQUFFLGlCQUFpQixRQUFRLFNBQVMsZ0JBQWdCLElBQUksQ0FBQztBQUFBLFFBQ2pHO0FBQ0EscUJBQWE7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOO0FBQUEsVUFDQSxXQUFXO0FBQUEsVUFDWDtBQUFBLFVBQ0EsbUJBQW1CO0FBQUEsVUFDbkI7QUFBQSxVQUNBLHdCQUF3QixLQUFLLHdCQUF3QixTQUFTLGNBQWMsUUFBUTtBQUFBLFVBQ3BGLHFCQUFxQixhQUFhO0FBQUEsVUFDbEM7QUFBQSxVQUNBLGFBQWEsS0FBSztBQUFBLFVBQ2xCLFVBQVUsRUFBRSxPQUFPLG1CQUFtQixLQUFLLHNCQUFzQixPQUFPLEVBQUUsR0FBRyxpQkFBaUIsS0FBSyxtQkFBbUIsT0FBTyxFQUFFLEVBQUU7QUFBQSxRQUNsSTtBQUFBLE1BQ0QsT0FBTztBQUNOLHVCQUFlO0FBQ2YscUJBQWE7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOO0FBQUEsVUFDQSxXQUFXO0FBQUEsVUFDWDtBQUFBLFVBQ0EsbUJBQW1CO0FBQUEsVUFDbkI7QUFBQSxVQUNBLHdCQUF3QixLQUFLLHdCQUF3QixTQUFTLFdBQVcsUUFBUTtBQUFBLFVBQ2pGLHFCQUFxQixhQUFhO0FBQUEsVUFDbEM7QUFBQSxVQUNBLGFBQWEsS0FBSztBQUFBLFVBQ2xCO0FBQUEsVUFDQSxtQkFBbUIsS0FBSyxzQkFBc0IsT0FBTyxFQUFFO0FBQUEsVUFDdkQsaUJBQWlCLEtBQUssbUJBQW1CLE9BQU8sRUFBRTtBQUFBLFFBQ25EO0FBQUEsTUFDRDtBQUtBLFVBQUk7QUFDSixVQUFJLDBCQUEwQjtBQUM3QixrQkFBVSxNQUFNLDBCQUEwQixFQUFFLEtBQUssaUJBQWlCLE9BQU8sR0FBRyxLQUFLLFdBQVc7QUFDNUYsY0FBTSw4QkFBOEIsZ0JBQWdCLHVCQUMvQyxhQUFhLG1CQUFtQixDQUFDLFlBQVksZ0JBQWdCLElBQUksQ0FBQyxnQkFBZ0I7QUFDdkYsY0FBTSxLQUFLLHNCQUFzQixTQUFTLE9BQU8sa0JBQWtCLDZCQUE2QixrQkFBa0IsT0FBTztBQUN6SCxZQUFJLFVBQVUsUUFBVztBQUN4QixnQkFBTSxLQUFLLDJCQUEyQixTQUFTLEtBQUs7QUFBQSxRQUNyRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJO0FBQ0osVUFBSTtBQUNILHVCQUFlLEtBQUssb0JBQW9CLFlBQVksa0JBQWtCLGNBQWMsRUFBRSxZQUFZLFNBQVMsZ0JBQWdCLE1BQU0sVUFBVSxhQUFhLENBQUM7QUFDekosY0FBTSxhQUFhLGtCQUFrQjtBQUNyQyxZQUFJLE1BQU0sZUFBZTtBQUN4QixnQkFBTSxhQUFhLGFBQWEsS0FBSyxhQUFhO0FBQUEsUUFDbkQ7QUFDQSxhQUFLLHVCQUF1QixRQUFRLFlBQVk7QUFDaEQsYUFBSyxrQkFBa0IsTUFBTSxjQUFjLFlBQVk7QUFDdkQsY0FBTSxVQUEwQixFQUFFLGNBQWMsR0FBSSxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUMsR0FBSSxHQUFJLFFBQVEsRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFJLEdBQUksV0FBVyxFQUFFLFNBQVMsSUFBSSxDQUFDLEVBQUc7QUFDNUksYUFBSyxjQUFjLElBQUksU0FBUyxPQUFPO0FBQ3ZDLGlCQUFTO0FBQUEsVUFDUixHQUFJLDJCQUEyQixFQUFFLDBCQUEwQixrQkFBa0IsR0FBSSxVQUFVLEVBQUUsUUFBUSxJQUFJLENBQUMsRUFBRyxJQUFJLENBQUM7QUFBQSxVQUNsSCxHQUFHLEtBQUssbUJBQW1CLFdBQVcsT0FBTztBQUFBLFFBQzlDO0FBQ0EsYUFBSyxZQUFZLEtBQUssa0NBQWtDLE9BQU8sZ0JBQWdCLFFBQVEsU0FBUyxDQUFDLEdBQUcsT0FBTyxjQUFjLEVBQUUsRUFBRTtBQUFBLE1BQzlILFNBQVMsT0FBTztBQUNmLHNCQUFjLFFBQVE7QUFDdEIsY0FBTTtBQUFBLE1BQ1A7QUFFQSxVQUFJLDBCQUEwQjtBQUk3QixZQUFJO0FBQ0gsZ0JBQU0sS0FBSyxlQUFlLGdCQUFnQixnQkFBaUIsU0FBUyxHQUFHLFFBQVEsU0FBUyxHQUFHLGdCQUFnQjtBQUFBLFFBQzVHLFNBQVMsS0FBSztBQUNiLGVBQUssWUFBWSxLQUFLLG1EQUFtRCxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUM1SDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLHFEQUFxRCxPQUFPLEVBQUU7QUFBQSxJQUMvRTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixTQUFjLFdBQW1CLFNBQXlCLHdCQUFrRTtBQUNuSyxVQUFNLFNBQVMsS0FBSyxtQkFBbUIsV0FBVyxPQUFPO0FBQ3pELFFBQUksQ0FBQyx3QkFBd0I7QUFDNUIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFdBQVcsTUFBTSxLQUFLLDJCQUEyQixPQUFPO0FBQzlELFdBQU87QUFBQSxNQUNOLEdBQUksVUFBVSxtQkFBbUIsRUFBRSwwQkFBMEIsU0FBUyxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsTUFDNUYsR0FBSSxVQUFVLFVBQVUsRUFBRSxTQUFTLFNBQVMsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUN6RCxHQUFHO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsTUFBYywyQkFBMkIsU0FBc0Msb0JBQStFO0FBQzdKLFVBQU0sY0FBYyxLQUFLLHFCQUFxQixJQUFJLFFBQVEsZUFBZTtBQUN6RSxRQUFJLGVBQWUsWUFBWSxpQkFBaUIsUUFBUSxjQUFjO0FBQ3JFLGFBQU8sS0FBSyx3QkFBd0IsUUFBUSxpQkFBaUIsa0JBQWtCO0FBQUEsSUFDaEY7QUFDQSxRQUFJLFFBQVEsaUJBQWlCLFFBQVEsaUJBQWlCO0FBQ3JELGFBQU8sUUFBUSxVQUFVLEtBQUssZUFBZSxRQUFRLGlCQUFpQixRQUFRLE1BQU0sa0JBQWtCO0FBQUEsSUFDdkc7QUFDQSxRQUFJLFFBQVEsY0FBYztBQUN6QixZQUFNLFdBQVcsS0FBSyw0QkFBNEIsUUFBUSxZQUFZO0FBQ3RFLFlBQU0sUUFBUSxNQUFNLFVBQVUsUUFBUTtBQUN0QyxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSTtBQUNILGNBQU0sU0FBUyxLQUFLLGVBQWUsUUFBUSxJQUFJO0FBQy9DLFlBQUksUUFBUTtBQUNYLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sS0FBSyw0QkFBNEIsU0FBUyxrQkFBa0I7QUFBQSxNQUNwRSxVQUFFO0FBQ0QsY0FBTSxRQUFRO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFDQSxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyxhQUFhLFFBQXVCLGFBQWtDLFFBQWdCLGFBQXVGO0FBQzFMLFVBQU0sY0FBYyxNQUFNLFlBQVksWUFBWTtBQUNsRCxVQUFNLGtCQUFrQixZQUFZLFVBQVUsVUFBUSxLQUFLLE9BQU8sTUFBTTtBQUN4RSxRQUFJLG9CQUFvQixJQUFJO0FBQzNCLFdBQUssWUFBWSxLQUFLLHdCQUF3QixNQUFNLGdDQUFnQyxZQUFZLFNBQVMsb0JBQW9CLFlBQVksTUFBTSxRQUFRO0FBQUEsSUFDeEo7QUFDQSxVQUFNLHFCQUFxQixvQkFBb0IsS0FBSyxZQUFZLFNBQVMsSUFBSTtBQUM3RSxVQUFNLGtCQUFrQixZQUFZLGtCQUFrQixHQUFHO0FBR3pELFVBQU0sWUFBWSxNQUFNLFlBQVksbUJBQW1CLE1BQU07QUFDN0QsVUFBTSxhQUFhLE1BQU0sT0FBTyxJQUFJLFNBQVMsS0FBSztBQUFBLE1BQ2pELFdBQVcsWUFBWTtBQUFBLE1BQ3ZCLEdBQUksWUFBWSxFQUFFLFVBQVUsSUFBSSxDQUFDO0FBQUEsSUFDbEMsQ0FBQztBQUNELFVBQU0sZUFBZSxXQUFXO0FBR2hDLFVBQU0sZUFBZSxJQUFJLFNBQVMsYUFBYSxtQkFBbUI7QUFDbEUsUUFBSTtBQUNILFlBQU0sY0FBYyxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixZQUFZLFVBQVU7QUFDekYsVUFBSSxhQUFhO0FBQ2hCLFlBQUk7QUFDSCxnQkFBTSxHQUFHLE1BQU0sWUFBWSxRQUFRLEVBQUUsV0FBVyxLQUFLLENBQUM7QUFHdEQsZ0JBQU0sR0FBRyxHQUFHLGFBQWEsUUFBUSxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQ2hELGdCQUFNLFlBQVksT0FBTyxXQUFXLGFBQWEsTUFBTTtBQUFBLFFBQ3hELFVBQUU7QUFDRCxzQkFBWSxRQUFRO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyw0REFBNEQsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQUEsSUFDckk7QUFDQSxXQUFPLEVBQUUsV0FBVyxjQUFjLGdCQUFnQjtBQUFBLEVBQ25EO0FBQUEsRUFFQSxNQUFjLGFBQWEsTUFBVyxrQkFBMEQ7QUFDL0YsVUFBTSxVQUFVLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCO0FBQy9ELFVBQU0sYUFBYSxRQUFRLGdCQUFnQixRQUFRO0FBQ25ELFVBQU0sV0FBVyxLQUFLLDRCQUE0QixVQUFVO0FBQzVELFFBQUksQ0FBQyxVQUFVO0FBQ2Q7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFVBQU0sU0FBUyxRQUFRLFlBQVk7QUFDbEMsaUJBQVcsTUFBTSxLQUFLLHdCQUF3QixNQUFNLGdCQUFnQjtBQUFBLElBQ3JFLENBQUM7QUFDRCxRQUFJLFVBQVU7QUFDYixZQUFNLEtBQUssNEJBQTRCLFNBQVMsT0FBTyxTQUFTLFNBQVMsU0FBUyxpQkFBaUI7QUFBQSxJQUNwRztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLE1BQVcsa0JBQTZIO0FBQzdLLFVBQU0sVUFBVSxLQUFLLFNBQVM7QUFDOUIsVUFBTSxVQUFVLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCO0FBQy9ELFVBQU0sa0JBQWtCLFFBQVE7QUFDaEMsV0FBTyxLQUFLLFdBQVcsaUJBQWlCLFFBQVEsY0FBYyxZQUFZO0FBQ3pFLFlBQU0sVUFBVSxLQUFLLG9CQUFvQixNQUFNLGdCQUFnQjtBQUMvRCxZQUFNLFNBQVMsUUFBUTtBQUN2QixZQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksT0FBTztBQUM5QyxZQUFNLGNBQWMsS0FBSyxxQkFBcUIsSUFBSSxlQUFlO0FBQ2pFLFlBQU0sZ0JBQWdCLGFBQWEsS0FBSyxTQUFTLE1BQU07QUFDdkQsWUFBTSxlQUFlLFFBQVEsYUFBYSxTQUFTO0FBQ25ELFlBQU0sb0JBQW9CLGFBQWEsa0JBQWtCO0FBRXpELFVBQUksZ0JBQWdCLENBQUMsZUFBZTtBQUNuQyxjQUFNLEtBQUssa0JBQWtCLGNBQWMsT0FBTztBQUFBLE1BQ25EO0FBRUEsVUFBSSxlQUFlO0FBQ2xCLGFBQUsscUJBQXFCLE9BQU8sZUFBZTtBQUFBLE1BQ2pEO0FBQ0EsV0FBSyxjQUFjLE9BQU8sT0FBTztBQUNqQyxXQUFLLFlBQVksT0FBTyxPQUFPO0FBQy9CLFdBQUssbUJBQW1CLE9BQU8sT0FBTztBQUV0QyxVQUFJLFFBQVE7QUFDWCxjQUFNLEtBQUssb0JBQW9CLFFBQVEsSUFBSTtBQUFBLE1BQzVDO0FBVUEsV0FBSyxhQUFhLDJCQUEyQixRQUFRLFNBQVMsU0FBUyxDQUFDO0FBTXhFLFdBQUssZUFBZSxJQUFJLFFBQVEscUJBQXFCLEdBQUcsV0FBVyxJQUFJO0FBT3ZFLFVBQUksS0FBSyx3QkFBd0IsUUFBUSxxQkFBcUIsTUFBTSxHQUFHO0FBQ3RFLGVBQU8sRUFBRSxPQUFPLFFBQVEsdUJBQXVCLFNBQVMsaUJBQWlCLGtCQUFrQjtBQUFBLE1BQzVGO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsTUFBYyxrQkFBa0IsY0FBc0IsU0FBZ0M7QUFDckYsVUFBTSxTQUFTLE1BQU0sS0FBSyxjQUFjO0FBQ3hDLFFBQUk7QUFDSCxZQUFNLE9BQU8sY0FBYyxZQUFZO0FBQUEsSUFDeEMsU0FBUyxLQUFLO0FBRWIsVUFBSSxNQUFNLE9BQU8sbUJBQW1CLFlBQVksRUFBRSxLQUFLLGNBQVksQ0FBQyxDQUFDLFVBQVUsTUFBTSxJQUFJLEdBQUc7QUFDM0YsY0FBTTtBQUFBLE1BQ1A7QUFDQSxXQUFLLFlBQVksS0FBSyx5QkFBeUIsWUFBWSwwQkFBMEIsT0FBTyx5QkFBeUI7QUFBQSxJQUN0SDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsYUFBYSxNQUFXLGtCQUEwRDtBQUMvRixVQUFNLFVBQVUsS0FBSyxvQkFBb0IsTUFBTSxnQkFBZ0I7QUFDL0QsVUFBTSxXQUFXLEtBQUssNEJBQTRCLFFBQVEsZ0JBQWdCLFFBQVEsZUFBZTtBQUNqRyxRQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxRQUFRLFlBQVk7QUFDbEMsWUFBTSxTQUFTLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCLEVBQUU7QUFDaEUsVUFBSSxDQUFDLFVBQVUsT0FBTyxlQUFlO0FBQ3BDO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxvQkFBb0IsUUFBUSxJQUFJO0FBQUEsSUFDNUMsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSxNQUFNLGdCQUFnQixNQUFXLFNBQWtDLGNBQTBFO0FBQzVJLFNBQUssd0JBQXdCLE9BQU87QUFDcEMsVUFBTSxXQUFXLHdCQUF3QixTQUFTLElBQUk7QUFDdEQsU0FBSyxtQkFBbUIsTUFBTSxTQUFTLHVCQUF1QixTQUFTLFFBQVE7QUFDL0UsVUFBTSxVQUFVLEtBQUssU0FBUztBQUM5QixRQUFJLGlCQUFpQixRQUFXO0FBQy9CLFVBQUksQ0FBQyxpQkFBaUIsSUFBSSxHQUFHO0FBQzVCO0FBQUEsTUFDRDtBQUNBLFlBQU1DLFdBQVUsRUFBRSxjQUFjLGFBQWEsR0FBRyxTQUFTLHFCQUFxQixFQUFFO0FBQ2hGLFdBQUssY0FBYyxJQUFJLFNBQVNBLFFBQU87QUFDdkMsYUFBTyxFQUFFLGNBQWMsbUJBQW1CQSxRQUFPLEVBQUU7QUFBQSxJQUNwRDtBQUNBLFVBQU0sVUFBVSxtQkFBbUIsWUFBWTtBQUMvQyxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUssWUFBWSxLQUFLLGdFQUFnRSxPQUFPLEVBQUU7QUFDL0Y7QUFBQSxJQUNEO0FBQ0EsU0FBSyxjQUFjLElBQUksU0FBUyxPQUFPO0FBQUEsRUFDeEM7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLE1BQVcsU0FBbUU7QUFDckcsVUFBTSxXQUFXLHdCQUF3QixTQUFTLElBQUk7QUFDdEQsU0FBSyxtQkFBbUIsTUFBTSxTQUFTLHVCQUF1QixTQUFTLFFBQVE7QUFDL0UsVUFBTSxVQUFVLEVBQUUsY0FBYyxhQUFhLEdBQUcsU0FBUyxxQkFBcUIsRUFBRTtBQUNoRixTQUFLLGNBQWMsSUFBSSxLQUFLLFNBQVMsR0FBRyxPQUFPO0FBQy9DLFdBQU8sRUFBRSxjQUFjLG1CQUFtQixPQUFPLEVBQUU7QUFBQSxFQUNwRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSx1QkFBdUIsdUJBQWtFO0FBQzlGLFVBQU0sWUFBWSxNQUFNLEtBQUssd0JBQXdCLHFCQUFxQjtBQUMxRSxVQUFNLFNBQTZCLENBQUM7QUFDcEMsZUFBVyxDQUFDLFFBQVEsSUFBSSxLQUFLLFdBQVc7QUFDdkMsYUFBTyxLQUFLLEVBQUUsS0FBSyxJQUFJLE1BQU0sYUFBYSx1QkFBdUIsTUFBTSxDQUFDLEdBQUcsY0FBYyxtQkFBbUIsSUFBSSxFQUFFLENBQUM7QUFBQSxJQUNwSDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSw0QkFBNEIsV0FBdUQ7QUFDMUYsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksV0FBVyxLQUFLLGtCQUFrQixJQUFJLFNBQVM7QUFDbkQsUUFBSSxDQUFDLFVBQVU7QUFDZCxpQkFBVyxJQUFJLHVCQUF1QjtBQUN0QyxXQUFLLGtCQUFrQixJQUFJLFdBQVcsUUFBUTtBQUFBLElBQy9DO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUFzQixXQUF5QjtBQUN0RCxRQUFJLENBQUMsS0FBSyxtQkFBbUIsS0FBSyxrQkFBa0IsSUFBSSxTQUFTLEdBQUcscUJBQXFCO0FBQ3hGLFdBQUssa0JBQWtCLElBQUksV0FBVyxJQUFJLHVCQUF1QixDQUFDO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFpQixXQUFtQixNQUFvQztBQUMvRSxVQUFNLFdBQVcsS0FBSyw0QkFBNEIsU0FBUztBQUMzRCxXQUFPLFdBQVcsU0FBUyxhQUFhLElBQUksSUFBSSxRQUFRLE9BQU8sSUFBSSxrQkFBa0IsQ0FBQztBQUFBLEVBQ3ZGO0FBQUEsRUFFUSxXQUFjLFdBQW1CLFNBQWlCLE1BQW9DO0FBQzdGLFVBQU0sV0FBVyxLQUFLLDRCQUE0QixTQUFTO0FBQzNELFdBQU8sV0FBVyxTQUFTLFVBQVUsU0FBUyxJQUFJLElBQUksUUFBUSxPQUFPLElBQUksa0JBQWtCLENBQUM7QUFBQSxFQUM3RjtBQUFBO0FBQUEsRUFHQSxNQUFjLDRCQUE0QixTQUFzQyxvQkFBK0U7QUFDOUosVUFBTSxFQUFFLHVCQUF1QixpQkFBaUIsTUFBTSxRQUFRLElBQUk7QUFDbEUsVUFBTSxXQUFXLEtBQUssZUFBZSxJQUFJO0FBQ3pDLFFBQUksVUFBVTtBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLEtBQUssNEJBQTRCLFFBQVEsZ0JBQWdCLGVBQWU7QUFDekYsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sU0FBUyxXQUFXLFNBQVMsWUFBWTtBQUMvQyxZQUFNLFFBQVEsTUFBTSxTQUFTLFFBQVE7QUFDckMsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUk7QUFDSixVQUFJO0FBQ0gsY0FBTSxRQUFRLEtBQUssZUFBZSxJQUFJO0FBQ3RDLFlBQUksT0FBTztBQUNWLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sT0FBTyxLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQzNDLFlBQUksQ0FBQyxNQUFNO0FBQ1YsaUJBQU87QUFBQSxRQUNSO0FBQ0EsY0FBTSxjQUFjLEtBQUssb0JBQW9CLGVBQWU7QUFDNUQsY0FBTSxtQkFBbUIscUJBQXFCLENBQUMsS0FBSyxhQUFhLG9CQUM3RCxLQUFLLHFCQUFxQixJQUFJLGVBQWUsR0FBRyxxQkFDL0MsTUFBTSxLQUFLLHFCQUFxQixxQkFBcUIsR0FBRztBQUM3RCxZQUFJLENBQUMsa0JBQWtCO0FBQ3RCLGVBQUssWUFBWSxLQUFLLGdDQUFnQyxPQUFPLDZCQUE2QjtBQUMxRixpQkFBTztBQUFBLFFBQ1I7QUFDQSxjQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWM7QUFDeEMsY0FBTSxlQUFlLEtBQUsseUJBQXlCLHVCQUF1QixnQkFBZ0I7QUFDMUYsY0FBTSxXQUFXLE1BQU0sYUFBYSxTQUFTLE9BQU87QUFDcEQsY0FBTSxlQUFlLEtBQUssc0JBQXNCLGVBQWUsY0FBYyxNQUFNLGdCQUFnQjtBQUNuRyxjQUFNLGFBQXVDO0FBQUEsVUFDNUMsTUFBTTtBQUFBLFVBQ047QUFBQSxVQUNBLFdBQVcsS0FBSztBQUFBLFVBQ2hCO0FBQUEsVUFDQSx1QkFBdUIsb0JBQW9CLE1BQU0sQ0FBQztBQUFBLFVBQ2xELG1CQUFtQixLQUFLLFFBQVEsS0FBSyxrQkFBa0IsVUFBVSxLQUFLLEtBQUssSUFBSTtBQUFBLFVBQy9FO0FBQUEsVUFDQSx3QkFBd0IsS0FBSyx3QkFBd0IsdUJBQXVCLEtBQUssY0FBYyxRQUFRO0FBQUEsVUFDdkcscUJBQXFCLGFBQWE7QUFBQSxVQUNsQztBQUFBLFVBQ0EsYUFBYSxLQUFLO0FBQUEsVUFDbEIsVUFBVSxFQUFFLE9BQU8sS0FBSyxPQUFPLG1CQUFtQixLQUFLLHNCQUFzQixLQUFLLE9BQU8sRUFBRSxHQUFHLGlCQUFpQixLQUFLLG1CQUFtQixLQUFLLE9BQU8sRUFBRSxFQUFFO0FBQUEsUUFDeEo7QUFDQSx1QkFBZSxLQUFLLG9CQUFvQixZQUFZLGtCQUFrQixjQUFjLEVBQUUsWUFBWSx1QkFBdUIsZ0JBQWdCLE1BQU0sVUFBVSxRQUFRLFNBQVMsQ0FBQztBQUMzSyxjQUFNLGFBQWEsa0JBQWtCO0FBQ3JDLGFBQUssdUJBQXVCLFFBQVEsWUFBWTtBQUNoRCxhQUFLLGtCQUFrQixNQUFNLGNBQWMsWUFBWTtBQUN2RCxZQUFJLG9CQUFvQjtBQUN2QixnQkFBTSxLQUFLLHNCQUFzQixRQUFRLFVBQVUsS0FBSyxPQUFPLGtCQUFrQixvQkFBb0IsUUFBVyxNQUFTO0FBQUEsUUFDMUg7QUFDQSxhQUFLLFlBQVksS0FBSyxrQ0FBa0MsT0FBTyxzQkFBc0Isc0JBQXNCLFNBQVMsQ0FBQyxFQUFFO0FBQ3ZILGVBQU87QUFBQSxNQUNSLFNBQVMsT0FBTztBQUNmLHNCQUFjLFFBQVE7QUFDdEIsYUFBSyxZQUFZLEtBQUssMkNBQTJDLE9BQU8sS0FBSyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLENBQUMsRUFBRTtBQUNySSxjQUFNO0FBQUEsTUFDUCxVQUFFO0FBQ0QsY0FBTSxRQUFRO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sYUFBYSxNQUFXLFFBQTRCLFNBQWtEO0FBQzNHLFVBQU0sV0FBVyxLQUFLLDRCQUE0QixNQUFNLE9BQU87QUFDL0QsVUFBTSxZQUFZLFNBQVM7QUFDM0IsUUFBSSxLQUFLLHFCQUFxQixJQUFJLFNBQVMsR0FBRyxLQUFLLFNBQVMsTUFBTSxLQUFLLFNBQVMsR0FBRztBQUNsRjtBQUFBLElBQ0Q7QUFDQSxVQUFNLEtBQUssV0FBVyxTQUFTLGlCQUFpQixTQUFTLGNBQWMsWUFBWTtBQUNsRixZQUFNLFVBQVUsS0FBSyw0QkFBNEIsTUFBTSxPQUFPO0FBQzlELFdBQUssWUFBWSxLQUFLLFlBQVksU0FBUyxxQkFBcUIsS0FBSyxTQUFTLENBQUMsR0FBRyxXQUFXLFNBQVksY0FBYyxNQUFNLEtBQUssY0FBYyxFQUFFO0FBRWxKLFlBQU0sUUFBUSxNQUFNLEtBQUssMkJBQTJCLE9BQU87QUFDM0QsVUFBSSxDQUFDLE9BQU87QUFDWCxhQUFLLFlBQVksS0FBSyxZQUFZLFNBQVMsOERBQThEO0FBQ3pHO0FBQUEsTUFDRDtBQU9BLFVBQUk7QUFDSixVQUFJLFFBQVE7QUFDWCxrQkFBVSxNQUFNLE1BQU0sbUJBQW1CLE1BQU07QUFBQSxNQUNoRCxPQUFPO0FBQ04sa0JBQVUsTUFBTSxNQUFNLG9CQUFvQjtBQUFBLE1BQzNDO0FBRUEsVUFBSSxTQUFTO0FBQ1osY0FBTSxNQUFNLGtCQUFrQixTQUFTLE1BQU07QUFBQSxNQUM5QyxPQUFPO0FBQ04sYUFBSyxZQUFZLEtBQUssWUFBWSxTQUFTLHlEQUF5RDtBQUFBLE1BQ3JHO0FBRUEsV0FBSyxZQUFZLEtBQUssWUFBWSxTQUFTLHFCQUFxQjtBQUFBLElBQ2pFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGFBQWEsTUFBVyxPQUF1QixrQkFBMEQ7QUFDdEgsUUFBSTtBQUNILFlBQU0sS0FBSyxpQkFBaUIsTUFBTSxPQUFPLGdCQUFnQjtBQUFBLElBQzFELFNBQVMsT0FBTztBQUNmLFVBQUksQ0FBQyxNQUFNLEtBQUssNkJBQTZCLE9BQU8sZUFBZSxLQUFLLDBCQUEwQixNQUFNLFFBQVcsZ0JBQWdCLENBQUMsR0FBRztBQUN0SSxjQUFNO0FBQUEsTUFDUDtBQUNBLFlBQU0sS0FBSyxpQkFBaUIsTUFBTSxPQUFPLGdCQUFnQjtBQUFBLElBQzFEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxpQkFBaUIsTUFBVyxPQUF1QixrQkFBMEQ7QUFDMUgsVUFBTSxVQUFVLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCO0FBQy9ELFVBQU0sS0FBSyxXQUFXLFFBQVEsaUJBQWlCLFFBQVEsY0FBYyxZQUFZO0FBQ2hGLFlBQU0sVUFBVSxLQUFLLG9CQUFvQixNQUFNLGdCQUFnQjtBQUMvRCxZQUFNLG9CQUFvQixLQUFLLHNCQUFzQixNQUFNLEVBQUU7QUFDN0QsWUFBTSxrQkFBa0IsS0FBSyxtQkFBbUIsTUFBTSxFQUFFO0FBR3hELFlBQU0sY0FBYyxLQUFLLHFCQUFxQixJQUFJLFFBQVEsZUFBZTtBQUN6RSxVQUFJLGFBQWE7QUFDaEIsb0JBQVksUUFBUTtBQUFBLE1BQ3JCLE9BQU87QUFDTixjQUFNLFFBQVEsUUFBUSxVQUFVLE1BQU0sS0FBSywyQkFBMkIsT0FBTztBQUM3RSxjQUFNLE9BQU8sU0FBUyxNQUFNLElBQUksOEJBQThCLE9BQU8sS0FBSyx1QkFBdUIsS0FBSyxhQUFhLFFBQVEsZUFBZSxHQUFHLHNCQUFzQixPQUFPLG1CQUFtQixlQUFlLENBQUM7QUFHN00sWUFBSSxRQUFRLFNBQVMsU0FBUyxNQUFNLFFBQVEsc0JBQXNCLFNBQVMsR0FBRztBQUM3RSxnQkFBTSxLQUFLLHNCQUFzQixRQUFRLFVBQVUsT0FBTyxRQUFXLFFBQVcsUUFBVyxNQUFTO0FBQUEsUUFDckc7QUFBQSxNQUNEO0FBQ0EsWUFBTSxVQUFVLEtBQUssY0FBYyxJQUFJLFFBQVEsT0FBTztBQUN0RCxVQUFJLFNBQVM7QUFDWixjQUFNLFVBQTBCLEVBQUUsR0FBRyxTQUFTLE1BQU07QUFDcEQsYUFBSyxjQUFjLElBQUksUUFBUSxTQUFTLE9BQU87QUFDL0MsYUFBSyxxQkFBcUIsS0FBSyxFQUFFLE1BQU0sY0FBYyxtQkFBbUIsT0FBTyxFQUFFLENBQUM7QUFBQSxNQUNuRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsYUFBYSxNQUFXLE9BQW1DLGtCQUEwRDtBQUNsSSxRQUFJO0FBQ0gsWUFBTSxLQUFLLGlCQUFpQixNQUFNLE9BQU8sZ0JBQWdCO0FBQUEsSUFDMUQsU0FBUyxPQUFPO0FBQ2YsVUFBSSxDQUFDLE1BQU0sS0FBSyw2QkFBNkIsT0FBTyxlQUFlLEtBQUssMEJBQTBCLE1BQU0sUUFBVyxnQkFBZ0IsQ0FBQyxHQUFHO0FBQ3RJLGNBQU07QUFBQSxNQUNQO0FBQ0EsWUFBTSxLQUFLLGlCQUFpQixNQUFNLE9BQU8sZ0JBQWdCO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGlCQUFpQixNQUFXLE9BQW1DLGtCQUEwRDtBQUN0SSxVQUFNLFVBQVUsS0FBSyxvQkFBb0IsTUFBTSxnQkFBZ0I7QUFDL0QsVUFBTSxLQUFLLFdBQVcsUUFBUSxpQkFBaUIsUUFBUSxjQUFjLFlBQVk7QUFDaEYsWUFBTSxVQUFVLEtBQUssb0JBQW9CLE1BQU0sZ0JBQWdCO0FBQy9ELFlBQU0sY0FBYyxLQUFLLHFCQUFxQixJQUFJLFFBQVEsZUFBZTtBQUN6RSxVQUFJLGFBQWE7QUFDaEIsb0JBQVksUUFBUTtBQUFBLE1BQ3JCLE9BQU87QUFDTixjQUFNLFFBQVEsUUFBUSxVQUFVLE1BQU0sS0FBSywyQkFBMkIsT0FBTztBQUM3RSxZQUFJLE9BQU87QUFDVixnQkFBTSxvQkFBb0IsUUFBUSxLQUFLLGtCQUFrQixNQUFNLGlCQUFpQixLQUFLLElBQUk7QUFDekYsZ0JBQU0sTUFBTSxTQUFTLGlCQUFpQjtBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUNBLFlBQU0sVUFBVSxLQUFLLGNBQWMsSUFBSSxRQUFRLE9BQU87QUFDdEQsVUFBSSxTQUFTO0FBQ1osY0FBTSxVQUEwQixFQUFFLEdBQUcsU0FBUyxHQUFJLFFBQVEsRUFBRSxNQUFNLElBQUksRUFBRSxPQUFPLE9BQVUsRUFBRztBQUM1RixhQUFLLGNBQWMsSUFBSSxRQUFRLFNBQVMsT0FBTztBQUMvQyxhQUFLLHFCQUFxQixLQUFLLEVBQUUsTUFBTSxjQUFjLG1CQUFtQixPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQ25GO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxXQUEwQjtBQUMvQixRQUFJLENBQUMsS0FBSyxrQkFBa0I7QUFDM0IsV0FBSyxrQkFBa0I7QUFDdkIsaUJBQVcsWUFBWSxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDdkQsYUFBSyxTQUFTLE1BQU07QUFBQSxNQUNyQjtBQUNBLFdBQUssb0JBQW9CLFlBQVk7QUFJcEMsYUFBSztBQUNMLGFBQUssc0JBQXNCLE1BQU07QUFDakMsYUFBSyx3QkFBd0IsU0FBUyxTQUFTO0FBQy9DLGFBQUsseUJBQXlCO0FBRzlCLGFBQUssbUJBQW1CLE1BQU07QUFDOUIsYUFBSyxZQUFZLEtBQUssNEJBQTRCO0FBQ2xELGNBQU0sUUFBUSxJQUFJLENBQUMsR0FBRyxLQUFLLGtCQUFrQixPQUFPLENBQUMsRUFBRSxJQUFJLGNBQVksU0FBUyxNQUFNLENBQUMsQ0FBQztBQUN4RixtQkFBVyxXQUFXLEtBQUssaUJBQWlCLEdBQUc7QUFDOUMsZ0JBQU0sS0FBSyxvQkFBb0IsT0FBTztBQUFBLFFBQ3ZDO0FBQ0EsY0FBTSxLQUFLLFlBQVk7QUFDdkIsYUFBSyxrQkFBa0IsTUFBTTtBQUFBLE1BQzlCLEdBQUc7QUFBQSxJQUNKO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsMkJBQTJCLFdBQW1CLFVBQXlCO0FBQ3RFLGVBQVcsUUFBUSxLQUFLLGlCQUFpQixHQUFHO0FBQzNDLFVBQUksS0FBSywyQkFBMkIsV0FBVyxRQUFRLEdBQUc7QUFDekQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLDBCQUEwQixXQUFtQixVQUFpQyxTQUFpRDtBQUM5SCxlQUFXLFFBQVEsS0FBSyxpQkFBaUIsR0FBRztBQUMzQyxVQUFJLEtBQUssMEJBQTBCLFdBQVcsVUFBVSxPQUFPLEdBQUc7QUFDakU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsV0FBVyxTQUF1QjtBQUNqQyxVQUFNLFlBQVksYUFBYSxHQUFHLE9BQU87QUFDekMsV0FBTyxLQUFLLG9CQUFvQixJQUFJLFNBQVMsS0FBSyxLQUFLLHFCQUFxQixJQUFJLFNBQVM7QUFBQSxFQUMxRjtBQUFBO0FBQUEsRUFJQSxNQUFjLG1CQUFtQixLQUF3RDtBQUN4RixVQUFNLFFBQVEsTUFBTSxLQUFLLG9CQUFvQixHQUFHO0FBQ2hELFNBQUssZ0JBQWdCO0FBQ3JCLFFBQUksT0FBTztBQUNWLGlCQUFXLE9BQU8sNEJBQTRCO0FBQzdDLFlBQUksR0FBRyxJQUFJO0FBQUEsTUFDWjtBQUNBLFdBQUssWUFBWSxLQUFLLG1GQUFtRjtBQUFBLElBQzFHO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxvQkFBb0IsTUFBMEMsUUFBUSxLQUFrQztBQUNySCxRQUFJLENBQUMsS0FBSyxzQkFBc0IsR0FBRztBQUNsQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksdUJBQXVCLEtBQUssU0FBTyxJQUFJLEdBQUcsQ0FBQyxHQUFHO0FBQ2pELFdBQUssWUFBWSxNQUFNLGlHQUFpRztBQUN4SCxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksVUFBVSxJQUFJLHFDQUFxQyxLQUFLO0FBQzVELFFBQUksS0FBSyxjQUFjO0FBQ3RCLFVBQUk7QUFDSCxjQUFNLGFBQWEsTUFBTSxLQUFLLG1CQUFtQixtQkFBbUIsS0FBSyxZQUFZO0FBQ3JGLFlBQUksWUFBWTtBQUNmLG9CQUFVO0FBQUEsUUFDWDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxZQUFZLE1BQU0sd0VBQXdFLE9BQU8sS0FBSyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsT0FBTyxLQUFLLENBQUMsRUFBRTtBQUFBLE1BQ3BLO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxhQUFPLE1BQU0sS0FBSyxlQUFlLGFBQWEsT0FBTztBQUFBLElBQ3RELFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxLQUFLLDhDQUE4QyxPQUFPLEtBQUssaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFDeEksYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsK0JBQThDO0FBQzNELFFBQUksQ0FBQyxLQUFLLFdBQVcsQ0FBQyxLQUFLLGlCQUFpQjtBQUMzQztBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsS0FBSztBQUN0QixVQUFNLFdBQVcsTUFBTSxLQUFLLG9CQUFvQjtBQUNoRCxRQUFJLGFBQWEsVUFBVTtBQUMxQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLFVBQUk7QUFDSCxjQUFNLEtBQUs7QUFBQSxNQUNaLFFBQVE7QUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFlBQVksS0FBSyxvREFBb0QsWUFBWSxRQUFRLE9BQU8sWUFBWSxRQUFRLDZCQUE2QjtBQUN0SixVQUFNLEtBQUssc0JBQXNCLDhDQUE4QztBQUFBLEVBQ2hGO0FBQUEsRUFFUSx5QkFBeUIsU0FBYyxXQUEwQztBQUN4RixRQUFJLFNBQVMsS0FBSyxlQUFlLElBQUksT0FBTztBQUM1QyxRQUFJLENBQUMsUUFBUTtBQUVaLFlBQU0sbUJBQW1CLEtBQUssU0FBUyx3QkFBd0IsU0FBUyxXQUFXLE1BQU0sS0FBSyw0QkFBNEIsT0FBTyxDQUFDO0FBQ2xJLGVBQVMsS0FBSyxzQkFBc0IsZUFBZSxjQUFjLFNBQVMsa0JBQWtCLEtBQUssa0JBQWtCO0FBQ25ILFdBQUssZUFBZSxJQUFJLFNBQVMsTUFBTTtBQUFBLElBQ3hDLFdBQVcsV0FBVztBQUNyQixhQUFPLGlCQUFpQixhQUFhLFNBQVM7QUFBQSxJQUMvQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdRLG9CQUFvQixZQUFzQyx3QkFBeUMsY0FBNEIsVUFBOEQ7QUFDcE0sVUFBTSxhQUFhLFVBQVUsY0FBYyxhQUFhLElBQUksS0FBSyxJQUFJLFdBQVcsU0FBUztBQUN6RixVQUFNLGlCQUFpQixVQUFVLGtCQUFrQixLQUFLLHlCQUF5QixXQUFXLFNBQVMsS0FBSztBQUUxRyxVQUFNLGVBQWUsS0FBSyxzQkFBc0I7QUFBQSxNQUMvQztBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsR0FBSSxVQUFVLFdBQVcsRUFBRSxVQUFVLFNBQVMsU0FBUyxJQUFJLENBQUM7QUFBQSxRQUM1RCxjQUFjLFdBQVc7QUFBQSxRQUN6QixzQkFBc0IsS0FBSztBQUFBLFFBQzNCLGlCQUFpQixLQUFLO0FBQUEsUUFDdEI7QUFBQSxRQUNBLGNBQWMsV0FBVztBQUFBLFFBQ3pCLGtCQUFrQixXQUFXO0FBQUEsUUFDN0I7QUFBQSxRQUNBLGdCQUFnQixXQUFXO0FBQUEsUUFDM0IscUJBQXFCLFdBQVc7QUFBQTtBQUFBLFFBRWhDLG1CQUFtQixDQUFDLFVBQVUsU0FBUyxhQUFhLGNBQWMsVUFBVSxLQUFLLFNBQVMsQ0FBQztBQUFBO0FBQUEsUUFFM0Ysb0JBQW9CLE1BQU0sS0FBSyw0QkFBNEIsVUFBVTtBQUFBLFFBQ3JFLGdCQUFnQixLQUFLO0FBQUEsUUFDckIsc0JBQXNCLE1BQU0sS0FBSyxpQkFBaUIsV0FBVztBQUFBLFFBQzdELGFBQWEsTUFBTSxLQUFLLGlCQUFpQjtBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdRLHdCQUF3QixTQUFjLFdBQW1CLFVBQW9EO0FBQ3BILFVBQU0sY0FBd0MsT0FBTyxLQUFLLFNBQVMsVUFBVSxFQUFFLElBQUksVUFBUTtBQUMxRixZQUFNLEtBQUssZ0NBQWdDLEtBQUssSUFBSSxXQUFXLElBQUk7QUFDbkUsYUFBTztBQUFBLFFBQ04sTUFBTSxrQkFBa0I7QUFBQSxRQUN4QjtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0w7QUFBQSxRQUNBLE9BQU8sRUFBRSxNQUFNLGdCQUFnQixRQUFRO0FBQUEsTUFDeEM7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLGFBQWEsMEJBQTBCO0FBQUEsTUFDNUMsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxZQUFZLE9BQU8sWUFBVSxXQUFXLElBQUksT0FBTyxFQUFFLE1BQU0sSUFBSSxFQUFFLElBQUksWUFBVSxPQUFPLElBQUk7QUFBQSxFQUNsRztBQUFBLEVBRVEsaUJBQWlCLFNBQThCLGNBQThDO0FBQ3BHLFdBQU8sSUFBSSxpQkFBaUIsU0FBUyxjQUFjLEtBQUssb0JBQW9CLE1BQU0sS0FBSyxrQ0FBa0MsQ0FBQztBQUFBLEVBQzNIO0FBQUEsRUFFUSxrQkFBa0IsTUFBVyxTQUE4QixjQUFrQztBQUNwRyxVQUFNLFVBQVUsS0FBSyxjQUFjLElBQUksS0FBSyxTQUFTLENBQUM7QUFDdEQsU0FBSyxvQkFBb0IsaUJBQWlCLFFBQVEsU0FBUztBQUMzRCxTQUFLLG9CQUFvQixJQUFJLFFBQVEsV0FBVyxLQUFLLGlCQUFpQixTQUFTLFlBQVksQ0FBQztBQUM1RixTQUFLLGNBQWMsSUFBSSxLQUFLLFNBQVMsR0FBRyxFQUFFLEdBQUcsU0FBUyxjQUFjLFFBQVEsVUFBVSxDQUFDO0FBQUEsRUFDeEY7QUFBQSxFQUVRLHdCQUF3QixTQUE4QixjQUFrQztBQUMvRixTQUFLLG9CQUFvQixpQkFBaUIsUUFBUSxTQUFTO0FBQzNELFNBQUssb0JBQW9CLElBQUksUUFBUSxXQUFXLEtBQUssaUJBQWlCLFNBQVMsWUFBWSxDQUFDO0FBQUEsRUFDN0Y7QUFBQTtBQUFBLEVBR1EsdUJBQXVCLFFBQTRDLGNBQXlDO0FBQ25ILFFBQUksS0FBSyxvQkFBb0IsS0FBSyxZQUFZLFFBQVE7QUFDckQsbUJBQWEsUUFBUTtBQUNyQixZQUFNLElBQUksa0JBQWtCO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUEsRUFFUSw0QkFBNEIsV0FBbUIsY0FBbUMsY0FBNEIsUUFBa0Q7QUFDdkssU0FBSyx1QkFBdUIsUUFBUSxZQUFZO0FBQ2hELFVBQU0sWUFBWSxLQUFLLHlCQUF5QixTQUFTO0FBQ3pELFFBQUksV0FBVztBQUNkLG1CQUFhLGtCQUFrQixTQUFTO0FBQ3hDLFdBQUssa0JBQWtCLFdBQVcsY0FBYyxZQUFZO0FBQzVEO0FBQUEsSUFDRDtBQUNBLFNBQUssd0JBQXdCLGNBQWMsWUFBWTtBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixhQUFrQyxrQkFBa0IsT0FBc0I7QUFDM0csUUFBSTtBQUNILFlBQU0sWUFBWSxlQUFlO0FBQUEsSUFDbEMsU0FBUyxPQUFPO0FBQ2YsV0FBSyxZQUFZLEtBQUssWUFBWSxZQUFZLFNBQVMsK0NBQStDLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDL0o7QUFDQSxVQUFNLGlCQUFpQixZQUFZO0FBQ25DLFFBQUksQ0FBQyxtQkFBbUIsa0JBQWtCLEtBQUssY0FBYyxJQUFJLGVBQWUsU0FBUyxDQUFDLEdBQUcsaUJBQWlCLFlBQVksV0FBVztBQUNwSSxXQUFLLGNBQWMsT0FBTyxlQUFlLFNBQVMsQ0FBQztBQUFBLElBQ3BEO0FBQ0EsU0FBSyxvQkFBb0IsaUJBQWlCLFlBQVksU0FBUztBQUFBLEVBQ2hFO0FBQUEsRUFFUSxtQkFBMEM7QUFDakQsV0FBTyxDQUFDLEdBQUcsS0FBSyxvQkFBb0IsT0FBTyxDQUFDLEVBQUUsSUFBSSxXQUFTLE1BQU0sV0FBVztBQUFBLEVBQzdFO0FBQUEsRUFFVSxlQUFlLFdBQW1CLGdCQUFzQixvQkFBbUU7QUFDcEksUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSyxjQUFjLElBQUksZUFBZSxTQUFTLEdBQUcsRUFBRSxjQUFjLFVBQVUsQ0FBQztBQUFBLElBQzlFO0FBQ0EsVUFBTSxXQUFXLEtBQUssNEJBQTRCLFNBQVM7QUFDM0QsUUFBSSxDQUFDLFVBQVU7QUFDZCxhQUFPLFFBQVEsT0FBTyxJQUFJLGtCQUFrQixDQUFDO0FBQUEsSUFDOUM7QUFDQSxXQUFPLFNBQVMsY0FBYyxZQUFZO0FBQ3pDLFlBQU0sUUFBUSxNQUFNLFNBQVMsUUFBUTtBQUNyQyxVQUFJLENBQUMsT0FBTztBQUNYLGNBQU0sSUFBSSxrQkFBa0I7QUFBQSxNQUM3QjtBQUNBLFVBQUk7QUFDSCxlQUFPLE1BQU0sS0FBSyxpQkFBaUIsV0FBVyxrQkFBa0I7QUFBQSxNQUNqRSxVQUFFO0FBQ0QsY0FBTSxRQUFRO0FBQUEsTUFDZjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFdBQW1CLG9CQUFtRTtBQUNwSCxTQUFLLFlBQVksS0FBSyxZQUFZLFNBQVMsbUVBQThEO0FBQ3pHLFVBQU0sU0FBUyxNQUFNLEtBQUssY0FBYztBQUV4QyxVQUFNLGFBQWEsYUFBYSxJQUFJLEtBQUssSUFBSSxTQUFTO0FBQ3RELFVBQU0saUJBQWlCLE1BQU0sS0FBSyxxQkFBcUIsVUFBVTtBQUNqRSxVQUFNLGtCQUFrQixNQUFNLE9BQU8sbUJBQW1CLFNBQVMsRUFBRSxNQUFNLFNBQU87QUFDL0UsV0FBSyxZQUFZLEtBQUssWUFBWSxTQUFTLCtCQUErQixHQUFHO0FBQzdFLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLG1CQUFtQixlQUFlLHFCQUFxQixPQUFPLGlCQUFpQixTQUFTLHFCQUFxQixXQUFXLElBQUksS0FBSyxnQkFBZ0IsUUFBUSxnQkFBZ0IsSUFBSTtBQUNuTCxRQUFJLENBQUMsa0JBQWtCO0FBQ3RCLFlBQU0sSUFBSSxNQUFNLDJEQUEyRCxTQUFTLEdBQUc7QUFBQSxJQUN4RjtBQUlBLFFBQUksMkJBQTJCO0FBQy9CLFFBQUksZUFBZSxlQUFlO0FBQ2pDLFlBQU0sS0FBSywrQkFBK0Isa0JBQWtCLFNBQVM7QUFBQSxJQUN0RSxPQUFPO0FBQ04saUNBQTJCLE1BQU0sS0FBSyxzQkFBc0IsaUNBQWlDLFdBQVcsU0FBUyxHQUFHLGdCQUFnQjtBQUFBLElBQ3JJO0FBS0EsVUFBTSx5QkFBeUI7QUFJL0IsVUFBTSxlQUFlLEtBQUsseUJBQXlCLFlBQVksc0JBQXNCO0FBQ3JGLGlCQUFhLGlCQUFpQixTQUFTLHNCQUFzQjtBQUk3RCxVQUFNLDJCQUEyQixzQkFBc0IsZUFBZTtBQUN0RSxpQkFBYSxpQkFBaUIseUJBQXlCLEtBQUssb0NBQW9DLHdCQUF3QixDQUFDO0FBRXpILFVBQU0sV0FBVyxNQUFNLGFBQWEsU0FBUyxLQUFLLHlCQUF5QixTQUFTLEdBQUcsU0FBUyxDQUFDO0FBRWpHLFVBQU0sZUFBZSxLQUFLLHNCQUFzQixlQUFlLGNBQWMsWUFBWSx3QkFBd0I7QUFDakgsVUFBTSxvQkFBb0IsZUFBZSxRQUFRLEtBQUssa0JBQWtCLFVBQVUsZUFBZSxLQUFLLElBQUk7QUFDMUcsUUFBSSxlQUFlLFNBQVMsQ0FBQyxtQkFBbUI7QUFDL0MsV0FBSyxZQUFZLEtBQUssWUFBWSxTQUFTLHdHQUF3RztBQUFBLElBQ3BKO0FBQ0EsVUFBTSxhQUF1QztBQUFBLE1BQzVDLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsTUFDbEIsdUJBQXVCLEtBQUssb0NBQW9DLHdCQUF3QjtBQUFBLE1BQ3hGO0FBQUEsTUFDQTtBQUFBLE1BQ0Esd0JBQXdCLEtBQUssd0JBQXdCLFlBQVksV0FBVyxRQUFRO0FBQUEsTUFDcEYscUJBQXFCLGFBQWE7QUFBQSxNQUNsQztBQUFBLE1BQ0EsYUFBYSxLQUFLO0FBQUEsTUFDbEIsZUFBZSxlQUFlO0FBQUEsTUFDOUIsVUFBVTtBQUFBLFFBQ1QsT0FBTyxlQUFlO0FBQUEsUUFDdEIsbUJBQW1CLEtBQUssc0JBQXNCLGVBQWUsT0FBTyxFQUFFO0FBQUEsUUFDdEUsaUJBQWlCLEtBQUssbUJBQW1CLGVBQWUsT0FBTyxFQUFFO0FBQUEsTUFDbEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLEtBQUssb0JBQW9CLFlBQVksd0JBQXdCLFlBQVk7QUFDOUYsUUFBSTtBQUNILFlBQU0sYUFBYSxrQkFBa0I7QUFDckMsWUFBTSxLQUFLLHNCQUFzQixZQUFZLFFBQVcsUUFBVywwQkFBMEIsUUFBVyxNQUFTO0FBQ2pILFdBQUssNEJBQTRCLFdBQVcsY0FBYyxjQUFjLFdBQVcsTUFBTTtBQUFBLElBQzFGLFNBQVMsS0FBSztBQUNiLG1CQUFhLFFBQVE7QUFDckIsWUFBTTtBQUFBLElBQ1A7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFpQkEsTUFBYyx3QkFBd0IsU0FBb0Q7QUFDekYsVUFBTSxNQUFNLE1BQU0sS0FBSyxvQkFBb0IsZ0JBQWdCLE9BQU87QUFDbEUsUUFBSSxDQUFDLEtBQUs7QUFDVCxhQUFPLG9CQUFJLElBQUk7QUFBQSxJQUNoQjtBQUNBLFFBQUk7QUFDSCxZQUFNLE1BQU0sTUFBTSxJQUFJLE9BQU8sWUFBWSxhQUFhLFdBQVc7QUFDakUsVUFBSSxDQUFDLEtBQUs7QUFDVCxlQUFPLG9CQUFJLElBQUk7QUFBQSxNQUNoQjtBQUNBLFlBQU0sU0FBUyxLQUFLLE1BQU0sR0FBRztBQUM3QixZQUFNLFNBQVMsb0JBQUksSUFBNEI7QUFDL0MsaUJBQVcsQ0FBQyxRQUFRLEtBQUssS0FBSyxPQUFPLFFBQVEsTUFBTSxHQUFHO0FBSXJELFlBQUksQ0FBQyxTQUFTLE9BQU8sVUFBVSxVQUFVO0FBQ3hDO0FBQUEsUUFDRDtBQUNBLGNBQU0sRUFBRSxjQUFjLE1BQU0sSUFBSTtBQUNoQyxZQUFJLE9BQU8saUJBQWlCLFlBQVksQ0FBQyxjQUFjO0FBQ3REO0FBQUEsUUFDRDtBQUNBLGVBQU8sSUFBSSxRQUFRLEVBQUUsY0FBYyxHQUFJLFFBQVEsRUFBRSxNQUErQixJQUFJLENBQUMsRUFBRyxDQUFDO0FBQUEsTUFDMUY7QUFDQSxhQUFPO0FBQUEsSUFDUixTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyxnREFBZ0QsUUFBUSxTQUFTLENBQUMsS0FBSyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFDL0ksYUFBTyxvQkFBSSxJQUFJO0FBQUEsSUFDaEIsVUFBRTtBQUNELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFHQSxNQUFjLHNCQUFzQixTQUFjLE9BQW1DLGtCQUFtQyxvQkFBZ0Qsd0JBQXlDLFNBQStDLGtCQUFrQixZQUFZLFFBQVcsY0FBd0MsYUFBc0IsVUFBbUM7QUFDelksVUFBTSxRQUFRLEtBQUssb0JBQW9CLGFBQWEsT0FBTztBQUMzRCxVQUFNLEtBQUssTUFBTTtBQUNqQixRQUFJO0FBQ0gsWUFBTSxPQUF3QixDQUFDO0FBQy9CLFVBQUksT0FBTztBQUNWLGFBQUssS0FBSyxHQUFHLFlBQVksYUFBYSxhQUFhLEtBQUsseUJBQXlCLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDekY7QUFFQSxVQUFJLFVBQVU7QUFDYixhQUFLLEtBQUssR0FBRyxZQUFZLHdCQUF3QixNQUFNLENBQUM7QUFBQSxNQUN6RDtBQUNBLFVBQUksa0JBQWtCO0FBQ3JCLGFBQUssS0FBSyxHQUFHLFlBQVksYUFBYSxXQUFXLGlCQUFpQixTQUFTLENBQUMsQ0FBQztBQUFBLE1BQzlFO0FBTUEsVUFBSSxvQkFBb0I7QUFDdkIsYUFBSyxLQUFLLEdBQUcsWUFBWSxhQUFhLFlBQVksS0FBSyxVQUFVLG1CQUFtQixJQUFJLE9BQUssRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUM3RztBQUNBLFVBQUksd0JBQXdCO0FBQzNCLGFBQUssS0FBSyxHQUFHLFlBQVksYUFBYSwrQkFBK0IsdUJBQXVCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsTUFDeEc7QUFDQSxVQUFJLGlCQUFpQjtBQUNwQixhQUFLLEtBQUssR0FBRyxZQUFZLGFBQWEsd0JBQXdCLE1BQU0sQ0FBQztBQUFBLE1BQ3RFO0FBQ0EsVUFBSSxTQUFTO0FBQ1osYUFBSyxLQUFLLEdBQUcsWUFBWSxhQUFhLG1CQUFtQixRQUFRLElBQUksU0FBUyxDQUFDLENBQUM7QUFDaEYsYUFBSyxLQUFLLEdBQUcsWUFBWSxhQUFhLDRCQUE0QixRQUFRLFdBQVcsQ0FBQztBQUFBLE1BQ3ZGO0FBSUEsVUFBSSxjQUFjO0FBQ2pCLGFBQUssS0FBSyxHQUFHLFlBQVksZ0JBQWdCLEtBQUssVUFBVSxZQUFZLENBQUMsQ0FBQztBQUFBLE1BQ3ZFO0FBSUEsVUFBSSxhQUFhO0FBQ2hCLGFBQUssS0FBSyxHQUFHLFlBQVksZUFBZSxXQUFXLENBQUM7QUFBQSxNQUNyRDtBQUNBLFlBQU0sUUFBUSxJQUFJLElBQUk7QUFBQSxJQUN2QixVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EseUJBQXlCLFFBQTRCLFVBQXVEO0FBQ25ILFFBQUksUUFBUTtBQUNYLFVBQUk7QUFDSCxjQUFNLFNBQVMsS0FBSyxNQUFNLE1BQU07QUFDaEMsWUFBSSxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQzFCLGdCQUFNLE9BQU8sT0FBTyxPQUFPLENBQUMsTUFBbUIsT0FBTyxNQUFNLFlBQVksRUFBRSxTQUFTLENBQUMsRUFBRSxJQUFJLE9BQUssSUFBSSxNQUFNLENBQUMsQ0FBQztBQUMzRyxjQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BCLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFFBQVE7QUFBQSxNQUVSO0FBQUEsSUFDRDtBQUNBLFdBQU8sV0FBVyxDQUFDLFFBQVEsSUFBSTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFjLHFCQUFxQixTQUErTDtBQUNqTyxVQUFNLE1BQU0sTUFBTSxLQUFLLG9CQUFvQixnQkFBZ0IsT0FBTztBQUNsRSxRQUFJLENBQUMsS0FBSztBQUNULGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxRQUFJO0FBQ0gsWUFBTSxDQUFDLE9BQU8sT0FBTyxLQUFLLE1BQU0sd0JBQXdCLGFBQWEsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQzFGLElBQUksT0FBTyxZQUFZLGFBQWEsV0FBVztBQUFBLFFBQy9DLElBQUksT0FBTyxZQUFZLGFBQWEsV0FBVztBQUFBLFFBQy9DLElBQUksT0FBTyxZQUFZLGFBQWEsU0FBUztBQUFBLFFBQzdDLElBQUksT0FBTyxZQUFZLGFBQWEsVUFBVTtBQUFBLFFBQzlDLElBQUksT0FBTyxZQUFZLGFBQWEsNkJBQTZCO0FBQUEsUUFDakUsSUFBSSxPQUFPLFlBQVksNEJBQTRCO0FBQUEsTUFDcEQsQ0FBQztBQUNELFlBQU0sbUJBQW1CLE1BQU0sSUFBSSxNQUFNLEdBQUcsSUFBSTtBQUNoRCxhQUFPO0FBQUEsUUFDTixPQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFBQSxRQUN0QyxPQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFBQSxRQUN0QztBQUFBLFFBQ0Esb0JBQW9CLEtBQUsseUJBQXlCLE1BQU0sZ0JBQWdCO0FBQUEsUUFDeEUsd0JBQXdCLHlCQUF5QixJQUFJLE1BQU0sc0JBQXNCLElBQUk7QUFBQSxRQUNyRixlQUFlLGtCQUFrQjtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxVQUFFO0FBQ0QsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsMkJBQTJCLFNBQWtRO0FBQzFTLFVBQU0sTUFBTSxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixPQUFPO0FBQ2xFLFFBQUksQ0FBQyxLQUFLO0FBQ1QsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJO0FBQ0gsWUFBTSxDQUFDLE9BQU8sT0FBTyxLQUFLLE1BQU0sd0JBQXdCLFVBQVUsS0FBSyxhQUFhLGFBQWEsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ3RILElBQUksT0FBTyxZQUFZLGFBQWEsV0FBVztBQUFBLFFBQy9DLElBQUksT0FBTyxZQUFZLGFBQWEsV0FBVztBQUFBLFFBQy9DLElBQUksT0FBTyxZQUFZLGFBQWEsU0FBUztBQUFBLFFBQzdDLElBQUksT0FBTyxZQUFZLGFBQWEsVUFBVTtBQUFBLFFBQzlDLElBQUksT0FBTyxZQUFZLGFBQWEsNkJBQTZCO0FBQUEsUUFDakUsSUFBSSxPQUFPLFlBQVksYUFBYSxzQkFBc0I7QUFBQSxRQUMxRCxJQUFJLE9BQU8sWUFBWSxhQUFhLGlCQUFpQjtBQUFBLFFBQ3JELElBQUksT0FBTyxZQUFZLGFBQWEsMEJBQTBCO0FBQUEsUUFDOUQsSUFBSSxPQUFPLFlBQVksNEJBQTRCO0FBQUEsTUFDcEQsQ0FBQztBQUNELFVBQUksQ0FBQyxPQUFPLE9BQU8sS0FBSyxNQUFNLHdCQUF3QixVQUFVLEtBQUssYUFBYSxhQUFhLEVBQUUsTUFBTSxXQUFTLFVBQVUsTUFBUyxHQUFHO0FBQ3JJLGVBQU8sRUFBRSxVQUFVLE1BQU07QUFBQSxNQUMxQjtBQUNBLFlBQU0sbUJBQW1CLE1BQU0sSUFBSSxNQUFNLEdBQUcsSUFBSTtBQUNoRCxZQUFNLFVBQVUsT0FBTyxjQUFjLEVBQUUsS0FBSyxJQUFJLE1BQU0sR0FBRyxHQUFHLFlBQVksSUFBSTtBQUM1RSxhQUFPO0FBQUEsUUFDTixPQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFBQSxRQUN0QyxPQUFPLEtBQUsscUJBQXFCLEtBQUs7QUFBQSxRQUN0QztBQUFBLFFBQ0Esb0JBQW9CLEtBQUsseUJBQXlCLE1BQU0sZ0JBQWdCO0FBQUEsUUFDeEUsd0JBQXdCLHlCQUF5QixJQUFJLE1BQU0sc0JBQXNCLElBQUk7QUFBQSxRQUNyRjtBQUFBLFFBQ0EsVUFBVSxhQUFhLFVBQVUsWUFBWTtBQUFBLFFBQzdDLGVBQWUsa0JBQWtCLFNBQVksU0FBWSxrQkFBa0I7QUFBQSxNQUM1RTtBQUFBLElBQ0QsVUFBRTtBQUNELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLDJCQUEyQixTQUFjLE9BQWtEO0FBQ3hHLFVBQU0sUUFBUSxLQUFLLG9CQUFvQixhQUFhLE9BQU87QUFDM0QsUUFBSTtBQUlILFlBQU0sTUFBTSxPQUFPLFlBQVksYUFBYSxhQUFhLFFBQVEsS0FBSyx5QkFBeUIsS0FBSyxJQUFJLEVBQUU7QUFBQSxJQUMzRyxVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsK0JBQStCLFNBQWMsU0FBOEQ7QUFDeEgsVUFBTSxLQUFLLHNCQUFzQixTQUFTLFFBQVcsUUFBVyxRQUFXLFFBQVcsU0FBUyxJQUFJO0FBQUEsRUFDcEc7QUFBQSxFQUVRLHVCQUF1QixTQUE2QyxTQUF3RCxrQkFBNkg7QUFDaFEsVUFBTSxNQUFNLEtBQUssbUJBQW1CLE9BQU87QUFDM0MsUUFBSSxDQUFDLEtBQUs7QUFDVCxhQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDakM7QUFFQSxRQUFJLFVBQVUsaUJBQWlCLElBQUksR0FBRztBQUN0QyxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLFFBQVEsTUFBTSxNQUFNLDBCQUEwQixTQUFTLEtBQUssV0FBVyxDQUFDO0FBQ2xGLHVCQUFpQixJQUFJLEtBQUssT0FBTztBQUFBLElBQ2xDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG1CQUFtQixTQUFpRTtBQUMzRixRQUFJLFNBQVMsS0FBSztBQUNqQixhQUFPLE9BQU8sUUFBUSxHQUFHO0FBQUEsSUFDMUI7QUFDQSxRQUFJLFNBQVMsU0FBUztBQUNyQixhQUFPLFdBQVcsUUFBUSxPQUFPO0FBQUEsSUFDbEM7QUFDQSxRQUFJLFNBQVMsWUFBWTtBQUN4QixhQUFPLGNBQWMsUUFBUSxVQUFVO0FBQUEsSUFDeEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsZUFBVyxNQUFNLEtBQUssZUFBZSxPQUFPLEdBQUc7QUFDOUMsU0FBRyxRQUFRO0FBQUEsSUFDWjtBQUNBLFNBQUssZUFBZSxNQUFNO0FBQzFCLFNBQUssU0FBUyxFQUFFLE1BQU0sU0FBTztBQUM1QixXQUFLLFlBQVksS0FBSyw0Q0FBNEMsR0FBRztBQUFBLElBQ3RFLENBQUMsRUFBRSxRQUFRLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFBQSxFQUNqQztBQUNEO0FBQUE7QUF4M0hhLGFBa29IWSxjQUFjO0FBbG9IMUIsYUFtb0hZLGNBQWM7QUFub0gxQixhQW9vSFksWUFBWTtBQUFBO0FBcG9IeEIsYUFzb0hZLGFBQWE7QUF0b0h6QixhQXVvSFksZ0NBQWdDO0FBdm9INUMsYUF3b0hZLHlCQUF5QjtBQXhvSHJDLGFBeW9IWSxvQkFBb0I7QUF6b0hoQyxhQTBvSFksNkJBQTZCO0FBQUE7QUExb0h6QyxhQTRvSFksY0FBYztBQTVvSDFCLGVBQU47QUFBQSxFQWlNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsTlU7QUF1NEhOLE1BQU0sc0JBQXNCO0FBZ0JuQyxJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQVkvQyxZQUNDLG9CQUNBLFVBQ2lCLFlBQ0EsZUFDYyxjQUNjLHVCQUNmLGFBQ1Asc0JBQ3RCO0FBQ0QsVUFBTTtBQVBXO0FBQ0E7QUFDYztBQUNjO0FBQ2Y7QUFmL0IsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQWMsbUJBQW1CLENBQUM7QUFDeEYsU0FBUSxrQkFBa0Q7QUFDMUQsU0FBUSx3QkFBd0I7QUFFaEMsU0FBUSxrQkFBcUQsQ0FBQztBQWU3RCxTQUFLLGFBQWEsS0FBSyxVQUFVLHFCQUFxQixlQUFlLCtCQUErQixvQkFBb0IsVUFBVSxJQUFJLElBQUksQ0FBQztBQUMzSSxTQUFLLFdBQVcsS0FBSyxjQUFjLE9BQU8sQ0FBQztBQUMzQyxTQUFLLFVBQVUsS0FBSyxXQUFXLFlBQVksTUFBTTtBQUNoRCxXQUFLLFdBQVcsS0FBSyxjQUFjLElBQUk7QUFBQSxJQUN4QyxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxzQkFBc0Isc0JBQXNCLE1BQU07QUFDckUsV0FBSyxXQUFXLEtBQUssY0FBYyxJQUFJO0FBQUEsSUFDeEMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxpQkFBaUIsT0FBTztBQUM3QixTQUFLLGtCQUFrQjtBQUN2QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQUEsRUFFQSxjQUE2QjtBQUM1QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSx3QkFBMkQ7QUFDMUQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsY0FBYyxRQUFpQixRQUFRLHFCQUFvQztBQUNsRixTQUFLLGlCQUFpQixPQUFPO0FBQzdCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssd0JBQXdCLEtBQUsseUJBQXlCO0FBRTNELFdBQU8sS0FBSyxnQkFBZ0IsUUFBUSxNQUFNO0FBQ3pDLFlBQU0sZUFBZSxLQUFLO0FBQzFCLFdBQUssd0JBQXdCO0FBQzdCLFlBQU0saUJBQWlCLEtBQUssa0JBQWtCLHdCQUF3QixPQUFNLFVBQVM7QUFDcEYsY0FBTSxhQUFhLE1BQU0sS0FBSyxTQUFTLEtBQUs7QUFDNUMsWUFBSSxjQUFjLGNBQWM7QUFDL0IsZUFBSyxjQUFjO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUM7QUFFRCxhQUFPLGVBQWUsS0FBSyxNQUFNO0FBQ2hDLFlBQUksS0FBSyxvQkFBb0IsZ0JBQWdCO0FBQzVDLGVBQUssa0JBQWtCO0FBQUEsUUFDeEI7QUFBQSxNQUNELEdBQUcsU0FBTztBQUNULFlBQUksS0FBSyxvQkFBb0IsZ0JBQWdCO0FBQzVDLGVBQUssa0JBQWtCO0FBQUEsUUFDeEI7QUFDQSxZQUFJLGVBQWUsbUJBQW1CO0FBQ3JDO0FBQUEsUUFDRDtBQUNBLGNBQU07QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGLEdBQUcsS0FBSyxFQUFFLE1BQU0sU0FBTztBQUl0QixVQUFJLGVBQWUsbUJBQW1CO0FBQ3JDO0FBQUEsTUFDRDtBQUNBLFlBQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLFNBQVMsT0FBNEM7QUFDbEUsUUFBSTtBQUNILFlBQU0sT0FBTyxLQUFLLHNCQUFzQixhQUFhLG9DQUFvQyxtQkFBbUIsaUNBQWlDLEtBQ3pJO0FBQ0osVUFBSSxTQUFTLFlBQVk7QUFDeEIsY0FBTUMsa0JBQWlCLE1BQU0sS0FBSyxXQUFXLFNBQVMsTUFBTSxLQUFLLFdBQVcsR0FBRyxLQUFLO0FBQ3BGLFlBQUksTUFBTSx5QkFBeUI7QUFDbEMsaUJBQU87QUFBQSxRQUNSO0FBRUEsWUFBSSxPQUFPLEtBQUssaUJBQWlCQSxlQUFjLEdBQUc7QUFDakQsaUJBQU87QUFBQSxRQUNSO0FBRUEsYUFBSyxrQkFBa0JBO0FBQ3ZCLGFBQUssZUFBZTtBQUNwQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sY0FBYyxNQUFNLEtBQUssV0FBVyxLQUFLLEtBQUs7QUFDcEQsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPO0FBQUEsTUFDUjtBQUVBLFVBQUksS0FBSyxnQkFBZ0IsOEJBQThCLEtBQUssY0FBYyxXQUFXLEdBQUc7QUFDdkYsZUFBTztBQUFBLE1BQ1I7QUFFQSxZQUFNLGlCQUFpQixNQUFNLG9DQUFvQyxhQUFhLEtBQUssWUFBWTtBQUMvRixVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU87QUFBQSxNQUNSO0FBSUEsV0FBSyxrQkFBa0I7QUFDdkIsV0FBSyxlQUFlO0FBQ3BCLGFBQU87QUFBQSxJQUNSLFNBQVMsS0FBSztBQUdiLFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsZUFBTztBQUFBLE1BQ1I7QUFDQSxXQUFLLFlBQVksS0FBSyw2REFBNkQsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQ3JJLFlBQU0sV0FBVyxLQUFLLGdCQUFnQixTQUFTLEtBQUssS0FBSyxpQkFBaUI7QUFDMUUsV0FBSyxrQkFBa0IsQ0FBQztBQUN4QixXQUFLLGVBQWU7QUFDcEIsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUF6SU0seUJBQU47QUFBQSxFQWlCRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEJHO0FBMklDLFNBQVMsb0NBQW9DLGFBQThDLGFBQThEO0FBQy9KLFNBQU8sUUFBUSxJQUFJLFlBQVksSUFBSSxPQUFNLGNBQWE7QUFDckQsVUFBTSxjQUFjLFVBQVUsSUFBSSxTQUFTO0FBQzNDLFdBQU87QUFBQSxNQUNOLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsSUFBSSxnQkFBZ0IsV0FBVztBQUFBLE1BQy9CLEtBQUs7QUFBQSxNQUNMLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLFNBQVM7QUFBQSxNQUNULFVBQVUsd0JBQXdCLFVBQVUsSUFBSTtBQUFBLE1BQ2hELFVBQVUsVUFBVTtBQUFBO0FBQUEsTUFDcEIsTUFBTSxFQUFFLE1BQU0sd0JBQXdCLE9BQU87QUFBQSxNQUM3QyxVQUFVLE1BQU0sUUFBUSxJQUFJLFVBQVUsTUFBTSxJQUFJLFVBQVEsK0JBQStCLEtBQUssS0FBSyxVQUFVLE1BQU0sV0FBVyxDQUFDLENBQUM7QUFBQSxJQUMvSDtBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBQ0g7QUFFQSxTQUFTLHdCQUF3QixNQUE4QztBQUM5RSxVQUFRLE1BQU07QUFBQSxJQUNiLEtBQUssZUFBZTtBQUNuQixhQUFPLGtCQUFrQjtBQUFBLElBQzFCLEtBQUssZUFBZTtBQUNuQixhQUFPLGtCQUFrQjtBQUFBLElBQzFCLEtBQUssZUFBZTtBQUFBLElBQ3BCLEtBQUssZUFBZTtBQUNuQixhQUFPLGtCQUFrQjtBQUFBLElBQzFCLEtBQUssZUFBZTtBQUNuQixhQUFPLGtCQUFrQjtBQUFBLEVBQzNCO0FBQ0Q7QUFFQSxlQUFlLCtCQUErQixNQUFXLE1BQXNCLGFBQXdEO0FBQ3RJLFFBQU0sTUFBTSxLQUFLLFNBQVM7QUFDMUIsUUFBTSxLQUFLLGdCQUFnQixHQUFHO0FBQzlCLE1BQUksU0FBUyxlQUFlLE9BQU87QUFDbEMsVUFBTSxZQUFZLE1BQU0sZUFBZSxNQUFNLFdBQVc7QUFDeEQsVUFBTSxxQkFBeUM7QUFBQSxNQUM5QyxNQUFNLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTSxVQUFVO0FBQUEsTUFDaEIsYUFBYSxVQUFVO0FBQUEsSUFDeEI7QUFDQSxRQUFJLFVBQVUsa0JBQWtCLFFBQVc7QUFDMUMseUJBQW1CLFFBQVEsRUFBRSxlQUFlLFVBQVUsY0FBYztBQUFBLElBQ3JFO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFNBQVMsZUFBZSxPQUFPO0FBQ2xDLFVBQU0sWUFBWSxNQUFNLGVBQWUsTUFBTSxXQUFXO0FBQ3hELFVBQU0scUJBQXlDO0FBQUEsTUFDOUMsTUFBTSxrQkFBa0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGFBQWEsVUFBVTtBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFNBQVMsZUFBZSxhQUFhO0FBQ3hDLFVBQU0sV0FBVyxNQUFNLGNBQWMsTUFBTSxXQUFXO0FBQ3RELFVBQU0sb0JBQXVDO0FBQUEsTUFDNUMsTUFBTSxrQkFBa0I7QUFBQSxNQUN4QjtBQUFBLE1BQ0E7QUFBQSxNQUNBLE1BQU0sU0FBUztBQUFBLE1BQ2YsYUFBYSxTQUFTO0FBQUEsTUFDdEIsT0FBTyxTQUFTO0FBQUEsTUFDaEIsYUFBYSxTQUFTO0FBQUEsSUFDdkI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxlQUFlLE1BQU07QUFDakMsVUFBTSxvQkFBdUM7QUFBQSxNQUM1QyxNQUFNLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsTUFBTSxpQkFBaUIsSUFBSTtBQUFBLElBQzVCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQUEsSUFDTixNQUFNLGtCQUFrQjtBQUFBLElBQ3hCLGFBQWE7QUFBQSxJQUNiO0FBQUEsSUFDQTtBQUFBLElBQ0EsTUFBTSxpQkFBaUIsSUFBSTtBQUFBLEVBQzVCO0FBQ0Q7QUFPTyxTQUFTLGtCQUFrQixnQkFBOEU7QUFDL0csTUFBSSxlQUFlLFdBQVcsR0FBRztBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sU0FBeUIsQ0FBQztBQUNoQyxRQUFNLFNBQXlCLENBQUM7QUFDaEMsUUFBTSxlQUE4QixDQUFDO0FBRXJDLGFBQVcsYUFBYSxnQkFBZ0I7QUFDdkMsZUFBVyxTQUFTLFVBQVUsWUFBWSxDQUFDLEdBQUc7QUFDN0MsVUFBSSxNQUFNLFNBQVMsa0JBQWtCLE9BQU87QUFDM0MsZUFBTyxLQUFLO0FBQUEsVUFDWCxLQUFLLElBQUksTUFBTSxNQUFNLEdBQUc7QUFBQSxVQUN4QixNQUFNLE1BQU07QUFBQSxVQUNaLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGVBQWU7QUFBQSxRQUNoQixDQUFDO0FBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxNQUFNLFNBQVMsa0JBQWtCLE9BQU87QUFDM0MsZUFBTyxLQUFLO0FBQUEsVUFDWCxLQUFLLElBQUksTUFBTSxNQUFNLEdBQUc7QUFBQSxVQUN4QixNQUFNLE1BQU07QUFBQSxVQUNaLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGVBQWU7QUFBQSxRQUNoQixDQUFDO0FBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxNQUFNLFNBQVMsa0JBQWtCLE1BQU07QUFDMUMsWUFBSSxNQUFNLGVBQWUsTUFBTSxLQUFLLE1BQU0sUUFBUSxHQUFHO0FBQ3BEO0FBQUEsUUFDRDtBQUNBLHFCQUFhLEtBQUs7QUFBQSxVQUNqQixLQUFLLElBQUksTUFBTSxNQUFNLEdBQUc7QUFBQSxVQUN4QixNQUFNLE1BQU07QUFBQSxVQUNaLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGVBQWU7QUFBQSxRQUNoQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsTUFBSSxPQUFPLFdBQVcsS0FBSyxPQUFPLFdBQVcsS0FBSyxhQUFhLFdBQVcsR0FBRztBQUM1RSxXQUFPO0FBQUEsRUFDUjtBQUVBLFNBQU87QUFBQSxJQUNOLFFBQVEsYUFBYTtBQUFBLElBQ3JCLE9BQU8sQ0FBQztBQUFBLElBQ1IsWUFBWSxDQUFDO0FBQUEsSUFDYjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBbUJBLElBQU0sbUJBQU4sY0FBK0IsV0FBVztBQUFBLEVBVXpDLFlBQ2tCLFlBQ29CLGVBQ1AsYUFDQyxjQUNjLHVCQUNMLHVCQUNJLHFCQUMzQztBQUNELFVBQU07QUFSVztBQUNvQjtBQUNQO0FBQ0M7QUFDYztBQUNMO0FBQ0k7QUFoQjdDLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBRWxFO0FBQUEsU0FBUyxjQUFjLEtBQUssYUFBYTtBQUV6QyxTQUFRLHNCQUF5RCxDQUFDO0FBQ2xFLFNBQVEsWUFBd0QsUUFBUSxRQUFRLENBQUMsQ0FBQztBQUNsRixTQUFRLGdCQUFnQjtBQUN4QixTQUFRLG1CQUE2QyxDQUFDO0FBY3JELFNBQUsseUJBQXlCO0FBQzlCLFNBQUssVUFBVSxLQUFLLHNCQUFzQixzQkFBc0IsTUFBTTtBQUNyRSxXQUFLLHlCQUF5QjtBQUFBLElBQy9CLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVPLGtDQUE0RDtBQUNsRSxXQUFPLEtBQUssb0JBQW9CLElBQUksVUFBUSxLQUFLLGFBQWE7QUFBQSxFQUMvRDtBQUFBLEVBRUEsSUFBVyx1QkFBbUQ7QUFDN0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNTyxxQkFBd0Q7QUFDOUQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUEsRUFHTyxXQUF1RDtBQUM3RCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxjQUFtQjtBQUN6QixXQUFPLEtBQUssb0JBQW9CO0FBQUEsRUFDakM7QUFBQSxFQUVBLE1BQWEsWUFBb0M7QUFDaEQsV0FBTyxLQUFLLFdBQVc7QUFBQSxFQUN4QjtBQUFBO0FBQUEsRUFHTyx3QkFBd0IsU0FBYyxXQUE0QixvQkFBNkU7QUFDckosV0FBTyxLQUFLLHNCQUFzQixlQUFlLHlCQUF5QixNQUFNLFNBQVMsV0FBVyxrQkFBa0I7QUFBQSxFQUN2SDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLDJCQUFpQztBQUN4QyxVQUFNLFVBQVUsS0FBSyxzQkFBc0IsYUFBYSxvQ0FBb0MsbUJBQW1CLGNBQWMsS0FBSyxDQUFDO0FBQ25JLFVBQU0saUJBQWlCLFFBQVEsSUFBSSx3QkFBd0I7QUFDM0QsUUFBSSxPQUFPLGdCQUFnQixLQUFLLGdCQUFnQixHQUFHO0FBQ2xEO0FBQUEsSUFDRDtBQUNBLFNBQUssbUJBQW1CO0FBRXhCLFVBQU0sV0FBVyxFQUFFLEtBQUs7QUFDeEIsU0FBSyxzQkFBc0IsZUFBZSxJQUFJLG9CQUFrQjtBQUFBLE1BQy9ELGVBQWU7QUFBQSxRQUNkLEdBQUc7QUFBQSxRQUNILE1BQU0sRUFBRSxNQUFNLHdCQUF3QixRQUFRO0FBQUEsTUFDL0M7QUFBQSxJQUNELEVBQUU7QUFDRixTQUFLLGFBQWEsS0FBSztBQUN2QixTQUFLLFlBQVksUUFBUSxJQUFJLGVBQWUsSUFBSSxtQkFBaUIsS0FBSywrQkFBK0IsYUFBYSxDQUFDLENBQUMsRUFBRSxLQUFLLGNBQVk7QUFDdEksVUFBSSxhQUFhLEtBQUssZUFBZTtBQUNwQyxhQUFLLHNCQUFzQjtBQUFBLE1BQzVCO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUNoQixVQUFJLGFBQWEsS0FBSyxlQUFlO0FBQ3BDLGFBQUssYUFBYSxLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFhLCtCQUErQixlQUFxRTtBQUNoSCxVQUFNLFlBQVksSUFBSSxNQUFNLGNBQWMsR0FBRztBQUM3QyxVQUFNLFNBQVMsTUFBTSxLQUFLLGVBQWUsU0FBUztBQUNsRCxRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxRQUNOLGVBQWU7QUFBQSxVQUNkLEdBQUc7QUFBQSxVQUNILE1BQU0sRUFBRSxNQUFNLHdCQUF3QixPQUFPLFNBQVMsU0FBUyxpQ0FBaUMsdUJBQXVCLEVBQUU7QUFBQSxRQUMxSDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLFFBQ2QsR0FBRztBQUFBLFFBQ0gsTUFBTSxFQUFFLE1BQU0sd0JBQXdCLE9BQU87QUFBQSxRQUM3QyxVQUFVLHNCQUFzQixDQUFDLE1BQU0sQ0FBQztBQUFBLE1BQ3pDO0FBQUEsTUFDQTtBQUFBLE1BQ0EsUUFBUTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFhLDJCQUEyQixNQUE0QixVQUFrQixPQUErRTtBQUNwSyxVQUFNLG9CQUF5QyxFQUFFLEdBQUcsS0FBSyxlQUFlLFNBQVM7QUFDakYsUUFBSSxDQUFDLEtBQUssV0FBVztBQUNwQixhQUFPLEVBQUUsZUFBZSxtQkFBbUIsTUFBTTtBQUFBLElBQ2xEO0FBRUEsVUFBTSxTQUFTLE1BQU0sS0FBSyxlQUFlLEtBQUssU0FBUztBQUN2RCxRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxRQUNOLGVBQWU7QUFBQSxVQUNkLEdBQUc7QUFBQSxVQUNILE1BQU0sRUFBRSxNQUFNLHdCQUF3QixPQUFPLFNBQVMsU0FBUyxpQ0FBaUMsdUJBQXVCLEVBQUU7QUFBQSxRQUMxSDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLGVBQWU7QUFBQSxRQUNkLEdBQUc7QUFBQSxRQUNILFVBQVUsc0JBQXNCLENBQUMsTUFBTSxDQUFDO0FBQUEsTUFDekM7QUFBQSxNQUNBLFdBQVcsS0FBSztBQUFBLE1BQ2hCLFFBQVE7QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWEsZUFBZSxXQUFvRDtBQUMvRSxRQUFJO0FBQ0gsYUFBTyxNQUFNLFlBQVksV0FBVyxLQUFLLGNBQWMsUUFBVyxLQUFLLFlBQVksR0FBRyxTQUFTO0FBQUEsSUFDaEcsU0FBUyxPQUFPO0FBQ2YsV0FBSyxZQUFZLEtBQUssb0RBQW9ELFVBQVUsU0FBUyxDQUFDLE1BQU0saUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFDNUosYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUExSk0sbUJBQU47QUFBQSxFQVlHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWpCRztBQTZLTixJQUFNLDBCQUFOLGNBQXNDLFdBQVc7QUFBQSxFQW9CaEQsWUFDa0IsU0FDQSxVQUNULFlBRVMscUJBQ2EsYUFDVSx1QkFDbUIsaUNBQzFEO0FBQ0QsVUFBTTtBQVRXO0FBQ0E7QUFDVDtBQUVTO0FBQ2E7QUFDVTtBQUNtQjtBQTNCNUQsU0FBaUIsZ0JBQWdCLEtBQUssVUFBVSxJQUFJLFFBQXVCLENBQUM7QUFFNUU7QUFBQSxTQUFTLGVBQWUsS0FBSyxjQUFjO0FBRTNDLFNBQVEscUJBQXFCO0FBRTdCLFNBQWlCLHVCQUE4QixDQUFDO0FBRWhELFNBQWlCLDRCQUE0QixvQkFBSSxJQUFnRDtBQUVqRztBQUFBLFNBQWdCLGtCQUFvRixnQkFBZ0IsTUFBTSxvQkFBSSxJQUFJLENBQUM7QUFFbkk7QUFBQSxTQUFpQixXQUFXLG9CQUFJLElBQXVDO0FBRXZFLFNBQWlCLHFCQUFnRSxLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUd2SDtBQUFBLFNBQVEseUJBQXlDLENBQUM7QUFhakQsU0FBSyxtQkFBbUIsS0FBSyxnQ0FBZ0Msa0JBQWtCLEtBQUssU0FBUyxTQUFTLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDbkgsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsSUFBVyxZQUE2QjtBQUN2QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQSxFQUdBLElBQVcsd0JBQXdDO0FBQ2xELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFPLGFBQWEsV0FBa0M7QUFDckQsUUFBSSxLQUFLLGNBQWMsQ0FBQyxXQUFXO0FBQ2xDO0FBQUEsSUFDRDtBQUNBLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRTyx5QkFBeUIsYUFBbUM7QUFDbEUsUUFBSSxLQUFLLHVCQUF1QixXQUFXLFlBQVksVUFDbkQsS0FBSyx1QkFBdUIsTUFBTSxDQUFDLEdBQUcsTUFBTSxRQUFRLEdBQUcsWUFBWSxDQUFDLENBQUMsQ0FBQyxHQUFHO0FBQzVFO0FBQUEsSUFDRDtBQUNBLFNBQUsseUJBQXlCO0FBQzlCLFNBQUssbUJBQW1CLE1BQU07QUFBQSxFQUMvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9PLFNBQVMsV0FBc0I7QUFDckMsUUFBSSxLQUFLLGNBQWMsUUFBUSxLQUFLLFlBQVksU0FBUyxHQUFHO0FBQzNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxLQUFLO0FBQ3RCLFNBQUssYUFBYTtBQUNsQixTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFFBQUksWUFBWSxDQUFDLEtBQUsscUJBQXFCLEtBQUssZUFBYSxRQUFRLFdBQVcsUUFBUSxDQUFDLEdBQUc7QUFDM0YsV0FBSyxxQkFBcUIsS0FBSyxRQUFRO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFTyxvQkFBOEM7QUFDcEQsV0FBTyxLQUFLLGdDQUFnQyxFQUFFO0FBQUEsRUFDL0M7QUFBQSxFQUVPLGlDQUFpQyxnQkFBMEMsaUJBQXlFO0FBQzFKLFdBQU8sK0JBQStCLEtBQUssaUNBQWlDLEtBQUssVUFBVSxnQkFBZ0IsS0FBSyx1QkFBdUIsR0FBRyxRQUFXLGVBQWUsRUFBRTtBQUFBLEVBQ3ZLO0FBQUEsRUFFUSxrQ0FBa0M7QUFDekMsVUFBTSxTQUEwQjtBQUFBLE1BQy9CLEdBQUcsS0FBSyxRQUFRLG1CQUFtQixFQUFFLElBQUksVUFBUSxLQUFLLG1CQUFtQixLQUFLLGFBQWEsQ0FBQztBQUFBLE1BQzVGLEdBQUcsS0FBSyw2QkFBNkIsRUFBRSxJQUFJLFVBQVEsS0FBSyxtQkFBbUIsS0FBSyxhQUFhLENBQUM7QUFBQSxJQUMvRjtBQUNBLFVBQU0sUUFBUSxLQUFLLGlCQUFpQjtBQUNwQyxVQUFNLGFBQWEsT0FBTyxzQkFBc0IsS0FBSyxDQUFDO0FBQ3RELGVBQVcsaUJBQWlCLFlBQVk7QUFDdkMsYUFBTyxLQUFLLEtBQUssbUJBQW1CLGFBQWEsQ0FBQztBQUFBLElBQ25EO0FBQ0EsV0FBTywrQkFBK0IsS0FBSyxpQ0FBaUMsS0FBSyxVQUFVLFFBQVEsS0FBSyx1QkFBdUIsR0FBRyxLQUFLLGVBQWUsQ0FBQztBQUFBLEVBQ3hKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsK0JBQWtFO0FBQ3pFLFVBQU0sT0FBTyxvQkFBSSxJQUFZO0FBQzdCLFVBQU0sU0FBbUMsQ0FBQztBQUMxQyxlQUFXLFVBQVUsS0FBSyxTQUFTLE9BQU8sR0FBRztBQUM1QyxpQkFBVyxRQUFRLE9BQU8sZ0JBQWdCO0FBQ3pDLFlBQUksS0FBSyxJQUFJLEtBQUssY0FBYyxHQUFHLEdBQUc7QUFDckM7QUFBQSxRQUNEO0FBQ0EsYUFBSyxJQUFJLEtBQUssY0FBYyxHQUFHO0FBQy9CLGVBQU8sS0FBSyxJQUFJO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdBLE1BQWEsMkJBQThEO0FBQzFFLFVBQU0sS0FBSztBQUNYLFVBQU0sUUFBUSxLQUFLLGlCQUFpQjtBQUNwQyxVQUFNLFFBQVEsSUFBSTtBQUFBLE1BQ2pCLEtBQUssUUFBUSxTQUFTLEVBQUUsTUFBTSxTQUFPLEtBQUssWUFBWSxLQUFLLHNFQUFzRSxHQUFHLENBQUM7QUFBQSxNQUNySSxHQUFHLENBQUMsR0FBRyxLQUFLLFNBQVMsT0FBTyxDQUFDLEVBQUUsSUFBSSxZQUFVLE9BQU8sS0FBSyxNQUFNLFNBQU8sS0FBSyxZQUFZLEtBQUssc0VBQXNFLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkssT0FBTyxZQUFZO0FBQUEsSUFDcEIsQ0FBQztBQUNELFdBQU8sS0FBSyxrQkFBa0I7QUFBQSxFQUMvQjtBQUFBO0FBQUEsRUFHQSxNQUFhLG9CQUE0RDtBQUN4RSxVQUFNLEtBQUssZ0NBQWdDLGtCQUFrQixLQUFLLFNBQVMsU0FBUyxDQUFDO0FBQ3JGLFVBQU0sUUFBUSxLQUFLLGlCQUFpQjtBQUNwQyxVQUFNLENBQUMsSUFBSSxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDaEMsS0FBSyxRQUFRLFNBQVMsRUFBRSxNQUFNLFNBQU87QUFDcEMsYUFBSyxZQUFZLEtBQUssc0VBQXNFLEdBQUc7QUFDL0YsZUFBTyxLQUFLLFFBQVEsbUJBQW1CO0FBQUEsTUFDeEMsQ0FBQztBQUFBLE1BQ0QsR0FBRyxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUFFLElBQUksWUFBVSxPQUFPLEtBQUssTUFBTSxTQUFPO0FBQ3JFLGFBQUssWUFBWSxLQUFLLHNFQUFzRSxHQUFHO0FBQy9GLGVBQU8sT0FBTztBQUFBLE1BQ2YsQ0FBQyxDQUFDO0FBQUEsTUFDRixPQUFPLFlBQVk7QUFBQSxJQUNwQixDQUFDO0FBRUQsVUFBTSxXQUFXLEtBQUssZ0NBQWdDO0FBQ3RELFVBQU0sZUFBZSxJQUFJLElBQUksU0FBUyxlQUFlLElBQUksbUJBQWlCLENBQUMsY0FBYyxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQzdHLFVBQU0sZ0JBQWdCLDBCQUEwQixRQUFRO0FBQ3hELFVBQU0sa0JBQWtCLENBQUMsa0JBQWlDO0FBQ3pELFlBQU0sVUFBVSxhQUFhLElBQUksY0FBYyxHQUFHLEtBQUs7QUFDdkQsYUFBTywyQkFBMkIsVUFBVSxPQUFPLE1BQU0sUUFBUSxTQUFTLGtCQUFrQixZQUFZLFFBQVEsVUFBVSx1QkFBdUIsT0FBTztBQUFBLElBQ3pKO0FBQ0EsVUFBTSxtQkFBbUIsQ0FBQyxrQkFBZ0U7QUFDekYsWUFBTSxVQUFVLGFBQWEsSUFBSSxjQUFjLEdBQUc7QUFDbEQsWUFBTSxXQUFXLFdBQVcsUUFBUSxTQUFTLGtCQUFrQixZQUM1RCxRQUFRLFVBQVUsT0FBTyxXQUFTLE1BQU0sU0FBUyxrQkFBa0IsYUFBYSxDQUFDLGNBQWMsSUFBSSxNQUFNLEVBQUUsQ0FBQyxFQUFFLElBQUksV0FBUyxNQUFNLElBQUksSUFDckk7QUFDSCxhQUFPLFVBQVUsU0FBUyxXQUFXO0FBQUEsSUFDdEM7QUFDQSxVQUFNLGFBQWEsT0FBTyxzQkFBc0IsS0FBSyxDQUFDO0FBQ3RELFVBQU0sZ0JBQWdCLFdBQVcsS0FBSyxlQUFlLElBQUksa0JBQWtCLFVBQVUsSUFBSTtBQUN6RixVQUFNLGlCQUFrQyxnQkFBZ0IsQ0FBQyxhQUFhLElBQUksQ0FBQztBQUUzRSxXQUFPO0FBQUEsTUFDTixHQUFHLEtBQUssT0FBTyxVQUFRLENBQUMsQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLEtBQUssYUFBYSxDQUFDLEVBQ3pFLElBQUksV0FBUyxFQUFFLEdBQUcsS0FBSyxRQUFTLFdBQVcsS0FBSyxXQUFXLFdBQVcsSUFBSSxNQUFNLEtBQUssY0FBYyxHQUFHLEdBQUcsR0FBSSxpQkFBaUIsS0FBSyxhQUFhLElBQUksRUFBRSxvQkFBb0IsaUJBQWlCLEtBQUssYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFHLEVBQUU7QUFBQSxNQUMzTixHQUFHLEtBQUssNkJBQTZCLEVBQUUsT0FBTyxVQUFRLENBQUMsQ0FBQyxLQUFLLFVBQVUsZ0JBQWdCLEtBQUssYUFBYSxDQUFDLEVBQ3hHLElBQUksV0FBUyxFQUFFLEdBQUcsS0FBSyxRQUFTLFdBQVcsS0FBSyxXQUFXLFdBQVcsSUFBSSxNQUFNLEtBQUssY0FBYyxHQUFHLEdBQUcsR0FBSSxpQkFBaUIsS0FBSyxhQUFhLElBQUksRUFBRSxvQkFBb0IsaUJBQWlCLEtBQUssYUFBYSxFQUFFLElBQUksQ0FBQyxFQUFHLEVBQUU7QUFBQSxNQUMzTixHQUFHO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxNQUFhLEtBQUssVUFBa0IsZ0JBQTZDLFNBQStCO0FBQy9HLFFBQUksQ0FBQyxLQUFLLG9CQUFvQjtBQUM3QixZQUFNLEtBQUs7QUFBQSxJQUNaO0FBQ0EsVUFBTSxRQUFRLFNBQVMsVUFBVTtBQUNqQyxRQUFJLFNBQVMsS0FBSyxTQUFTLElBQUksUUFBUTtBQUN2QyxRQUFJLENBQUMsUUFBUTtBQUNaLGVBQVMsRUFBRSxVQUFVLEdBQUcsZ0JBQWdCLENBQUMsR0FBRyxNQUFNLFFBQVEsUUFBUSxDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsRUFBRTtBQUNsRixXQUFLLFNBQVMsSUFBSSxVQUFVLE1BQU07QUFBQSxJQUNuQyxXQUFXLE9BQU8sT0FBTyxRQUFRLGNBQWMsR0FBRztBQU9qRCxhQUFPLE9BQU8sS0FBSyxLQUFLLGFBQVcsUUFBUSxJQUFJLFdBQVM7QUFBQSxRQUN2RCxlQUFlLEtBQUssZ0NBQWdDLEtBQUssYUFBYTtBQUFBLFFBQ3RFLEdBQUksS0FBSyxZQUFZLEVBQUUsV0FBVyxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQUEsTUFDdkQsRUFBRSxDQUFDO0FBQUEsSUFDSjtBQUNBLFVBQU0sV0FBVyxFQUFFLE9BQU87QUFDMUIsV0FBTyxTQUFTO0FBQ2hCLFdBQU8saUJBQWlCLGVBQWUsSUFBSSxvQkFBa0I7QUFBQSxNQUM1RCxlQUFlO0FBQUEsUUFDZCxHQUFHO0FBQUEsUUFDSDtBQUFBLFFBQ0EsTUFBTSxFQUFFLE1BQU0sd0JBQXdCLFFBQVE7QUFBQSxNQUMvQztBQUFBLE1BQ0EsT0FBTztBQUFBLElBQ1IsRUFBRTtBQUNGLFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSyxTQUFTLE9BQU87QUFBQSxRQUNwQixNQUFNLFdBQVc7QUFBQSxRQUNqQixnQkFBZ0IsQ0FBQyxHQUFHLEtBQUssa0JBQWtCLENBQUM7QUFBQSxNQUM3QyxFQUFFO0FBQUEsSUFDSDtBQUNBLFVBQU0sWUFBWSxvQkFBSSxJQUEyQjtBQUNqRCxlQUFXLGlCQUFpQixPQUFPLGdCQUFnQjtBQUNsRCxZQUFNLFVBQVUsS0FBSyxnQ0FBZ0MsY0FBYyxhQUFhO0FBQ2hGLGdCQUFVLElBQUksUUFBUSxLQUFLLE9BQU87QUFBQSxJQUNuQztBQUNBLFVBQU0sZ0JBQWdCLENBQUMsU0FBaUM7QUFDdkQsWUFBTSxnQkFBZ0IsS0FBSyxnQ0FBZ0MsS0FBSyxhQUFhO0FBQzdFLFVBQUksT0FBTyxVQUFVLElBQUksY0FBYyxHQUFHLEdBQUcsYUFBYSxHQUFHO0FBQzVEO0FBQUEsTUFDRDtBQUNBLGdCQUFVLElBQUksY0FBYyxLQUFLLGFBQWE7QUFDOUMsVUFBSSxDQUFDLE9BQU87QUFDWCxhQUFLLFNBQVMsT0FBTztBQUFBLFVBQ3BCLE1BQU0sV0FBVztBQUFBLFVBQ2pCO0FBQUEsUUFDRCxFQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sT0FBTztBQUNwQixVQUFNLFVBQVUsT0FBTyxPQUFPLEtBQUssTUFBTSxTQUFPO0FBQy9DLFdBQUssWUFBWSxLQUFLLHdFQUF3RSxHQUFHO0FBQUEsSUFDbEcsQ0FBQyxFQUFFLEtBQUssWUFBWTtBQUNuQixZQUFNLGFBQWEsSUFBSSxJQUFJLGVBQWUsSUFBSSxPQUFLLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQzlELFlBQU0sU0FBUyxNQUFNLEtBQUssUUFBUSxjQUFjLG1CQUFtQixVQUFVLGdCQUFnQixZQUFVO0FBQ3RHLFlBQUksYUFBYSxPQUFPLFVBQVU7QUFDakM7QUFBQSxRQUNEO0FBQ0Esc0JBQWM7QUFBQSxVQUNiLGVBQWUsRUFBRSxHQUFHLFFBQVEsU0FBUztBQUFBLFVBQ3JDLE9BQU8sV0FBVyxJQUFJLE9BQU8sR0FBRztBQUFBLFFBQ2pDLENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLFdBQVcsTUFBTSxRQUFRLElBQUksT0FBTyxJQUFJLFVBQVEsS0FBSyxRQUFRLDJCQUEyQixNQUFNLFVBQVUsV0FBVyxJQUFJLEtBQUssY0FBYyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3RKLFVBQUksYUFBYSxPQUFPLFVBQVU7QUFDakMsZUFBTyxpQkFBaUI7QUFDeEIsbUJBQVcsUUFBUSxVQUFVO0FBQzVCLHdCQUFjLElBQUk7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTyxRQUFRLEtBQUssYUFBVyxRQUFRLElBQUksV0FBUztBQUFBLE1BQ25ELGVBQWUsS0FBSyxnQ0FBZ0MsS0FBSyxhQUFhO0FBQUEsTUFDdEUsR0FBSSxLQUFLLFlBQVksRUFBRSxXQUFXLEtBQUssVUFBVSxJQUFJLENBQUM7QUFBQSxJQUN2RCxFQUFFLENBQUM7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT08sYUFBYSxVQUF3QjtBQUMzQyxVQUFNLFNBQVMsS0FBSyxTQUFTLElBQUksUUFBUTtBQUN6QyxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUtBLFdBQU87QUFDUCxTQUFLLFNBQVMsT0FBTyxRQUFRO0FBQzdCLFNBQUssU0FBUyxPQUFPO0FBQUEsTUFDcEIsTUFBTSxXQUFXO0FBQUEsTUFDakIsZ0JBQWdCLENBQUMsR0FBRyxLQUFLLGtCQUFrQixDQUFDO0FBQUEsSUFDN0MsRUFBRTtBQUFBLEVBQ0g7QUFBQTtBQUFBLEVBR08sYUFBYSxVQUF3RDtBQUMzRSxXQUFPLEtBQUssU0FBUyxJQUFJLFFBQVEsR0FBRyxVQUFVLENBQUM7QUFBQSxFQUNoRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxNQUFhLGdDQUErQztBQUMzRCxVQUFNLFFBQVEsSUFBSSxDQUFDLEdBQUcsS0FBSyxTQUFTLE9BQU8sQ0FBQyxFQUFFLElBQUksWUFBVSxPQUFPLEtBQUssTUFBTSxNQUFNO0FBQUEsSUFBRSxDQUFDLENBQUMsQ0FBQztBQUN6RixlQUFXLENBQUMsVUFBVSxNQUFNLEtBQUssQ0FBQyxHQUFHLEtBQUssUUFBUSxHQUFHO0FBQ3BELFlBQU0sVUFBVSxPQUFPLGVBQWU7QUFBQSxRQUFPLFVBQzVDLEtBQUssY0FBYyxNQUFNLFNBQVMsd0JBQXdCLFNBQ3ZELEtBQUssVUFBVTtBQUFBLE1BQ25CO0FBQ0EsVUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFNBQVMsUUFBUSxJQUFJLFVBQVEsS0FBSyxLQUFNO0FBQzlDLFdBQUssWUFBWSxLQUFLLDhDQUE4QyxPQUFPLE1BQU0sa0RBQWtELFFBQVEsRUFBRTtBQUM3SSxZQUFNLEtBQUssS0FBSyxVQUFVLE1BQU0sRUFBRSxNQUFNLFNBQU87QUFDOUMsYUFBSyxZQUFZLEtBQUssOEVBQThFLEdBQUc7QUFBQSxNQUN4RyxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUF1RDtBQUM5RCxRQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxDQUFDLEtBQUssbUJBQW1CLE9BQU87QUFDbkMsV0FBSyxtQkFBbUIsUUFBUSxLQUFLLHNCQUFzQjtBQUFBLFFBQWU7QUFBQSxRQUN6RSxDQUFDLEtBQUssWUFBWSxHQUFHLEtBQUssc0JBQXNCO0FBQUEsUUFDaEQsS0FBSyxRQUFRLFlBQVk7QUFBQSxRQUN6QixNQUFNLEtBQUssUUFBUSxVQUFVO0FBQUEsUUFDN0IsTUFBTSxLQUFLLFNBQVMsT0FBTztBQUFBLFVBQzFCLE1BQU0sV0FBVztBQUFBLFVBQ2pCLGdCQUFnQixDQUFDLEdBQUcsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLFFBQzdDLEVBQUU7QUFBQSxNQUNIO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxtQkFBbUI7QUFBQSxFQUNoQztBQUFBLEVBRVEsU0FBUyxRQUFtQztBQUNuRCxVQUFNLFVBQVUsTUFBTTtBQUNyQixVQUFJLENBQUMsS0FBSyxPQUFPLFlBQVk7QUFDNUIsYUFBSyxjQUFjLEtBQUssT0FBTyxDQUFDO0FBQUEsTUFDakM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLG9CQUFvQjtBQUM1QixjQUFRO0FBQUEsSUFDVCxPQUFPO0FBQ04sV0FBSyxLQUFLLGlCQUFpQixLQUFLLE9BQU8sRUFBRSxNQUFNLFdBQVMsS0FBSyxZQUFZLE1BQU0sbUZBQW1GLEtBQUssQ0FBQztBQUFBLElBQ3pLO0FBQUEsRUFDRDtBQUFBLEVBRVEseUJBQTRHO0FBQ25ILFVBQU0sU0FBUyxvQkFBSSxJQUEwRTtBQUM3RixlQUFXLFVBQVUsS0FBSyxTQUFTLE9BQU8sR0FBRztBQUM1QyxpQkFBVyxpQkFBaUIsT0FBTyxRQUFRO0FBQzFDLFlBQUksY0FBYyxvQkFBb0IsUUFBVztBQUNoRCxpQkFBTyxJQUFJLGNBQWMsS0FBSyxjQUFjLGVBQWU7QUFBQSxRQUM1RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpRTtBQUN4RSxVQUFNLFNBQVMsb0JBQUksSUFBdUM7QUFDMUQsZUFBVyxVQUFVLEtBQUssU0FBUyxPQUFPLEdBQUc7QUFDNUMsaUJBQVcsaUJBQWlCLE9BQU8sUUFBUTtBQUMxQyxlQUFPLElBQUksY0FBYyxLQUFLLGFBQWE7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsV0FBVyxlQUF1QztBQUN6RCxXQUFPLEtBQUssZ0JBQWdCLGFBQWEsTUFBTSxjQUFjLFNBQVMsa0JBQWtCLFlBQVksY0FBYyxVQUFVLHVCQUF1QixhQUFhO0FBQUEsRUFDaks7QUFBQSxFQUVRLGlCQUEwQyxlQUFxQjtBQUN0RSxRQUFJLGNBQWMsU0FBUyxrQkFBa0IsV0FBVztBQUN2RCxhQUFPLEtBQUsseUJBQXlCLGVBQWUsS0FBSyx5QkFBeUIsY0FBYyxFQUFFLENBQUM7QUFBQSxJQUNwRztBQUNBLFFBQUksY0FBYyxTQUFTLGtCQUFrQixRQUFRO0FBQ3BELFlBQU0sU0FBUztBQUNmLFlBQU0sT0FBTyxLQUFLLHlCQUF5QixRQUFRLEtBQUsseUJBQXlCLE9BQU8sRUFBRSxDQUFDO0FBQzNGLFVBQUlDLFdBQVUsU0FBUztBQUN2QixZQUFNQyxZQUFXLEtBQUssVUFBVSxJQUFJLFdBQVM7QUFDNUMsWUFBSSxNQUFNLFNBQVMsa0JBQWtCLFdBQVc7QUFDL0MsZ0JBQU0sVUFBVSxLQUFLLHlCQUF5QixPQUFPLEtBQUsseUJBQXlCLE1BQU0sRUFBRSxDQUFDO0FBQzVGLFVBQUFELGFBQVksWUFBWTtBQUN4QixpQkFBTztBQUFBLFFBQ1I7QUFDQSxjQUFNLGlCQUFpQixLQUFLLGdCQUFnQixLQUFLO0FBQ2pELFlBQUksbUJBQW1CLFVBQWEsbUJBQW1CLE1BQU0sU0FBUztBQUNyRSxpQkFBTztBQUFBLFFBQ1I7QUFDQSxRQUFBQSxXQUFVO0FBQ1YsZUFBTyxFQUFFLEdBQUcsT0FBTyxTQUFTLGVBQWU7QUFBQSxNQUM1QyxDQUFDO0FBQ0QsYUFBUUEsV0FBVSxFQUFFLEdBQUcsTUFBTSxVQUFBQyxVQUFTLElBQUk7QUFBQSxJQUMzQztBQUNBLFVBQU0sVUFBVSxLQUFLLFdBQVcsYUFBYTtBQUM3QyxRQUFJLFVBQVUsY0FBYyxZQUFZO0FBQ3hDLFVBQU0sV0FBVyxjQUFjLFVBQVUsSUFBSSxXQUFTO0FBQ3JELFVBQUksTUFBTSxTQUFTLGtCQUFrQixXQUFXO0FBQy9DLGNBQU0sT0FBTyxLQUFLLHlCQUF5QixPQUFPLEtBQUsseUJBQXlCLE1BQU0sRUFBRSxDQUFDO0FBQ3pGLG9CQUFZLFNBQVM7QUFDckIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLGlCQUFpQixLQUFLLGdCQUFnQixLQUFLO0FBQ2pELFVBQUksbUJBQW1CLFVBQWEsbUJBQW1CLE1BQU0sU0FBUztBQUNyRSxlQUFPO0FBQUEsTUFDUjtBQUNBLGdCQUFVO0FBQ1YsYUFBTyxFQUFFLEdBQUcsT0FBTyxTQUFTLGVBQWU7QUFBQSxJQUM1QyxDQUFDO0FBQ0QsV0FBTyxVQUFVLEVBQUUsR0FBRyxlQUFlLFNBQVMsU0FBUyxJQUFJO0FBQUEsRUFDNUQ7QUFBQSxFQUVRLGdDQUF5RCxlQUFxQjtBQUNyRixXQUFPO0FBQUEsTUFDTixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxDQUFDLEtBQUssbUJBQW1CLGFBQWEsQ0FBQztBQUFBLE1BQ3ZDLEtBQUssdUJBQXVCO0FBQUEsTUFDNUIsS0FBSyxlQUFlO0FBQUEsSUFDckIsRUFBRSxlQUFlLENBQUM7QUFBQSxFQUNuQjtBQUFBLEVBRVEsZ0JBQWdCLGVBQXdFO0FBQy9GLFVBQU0sUUFBUSxLQUFLLHlCQUF5QixjQUFjLEVBQUU7QUFDNUQsUUFBSSxPQUFPO0FBQ1YsYUFBTyxNQUFNLFNBQVMsa0JBQWtCLFVBQVUsTUFBTSxTQUFTLGtCQUFrQixZQUNoRix1QkFBdUIsS0FBSyxJQUM1QixNQUFNO0FBQUEsSUFDVjtBQUNBLFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckIsYUFBTztBQUFBLElBQ1I7QUFDQSxlQUFXLHFCQUFxQixLQUFLLHNCQUFzQjtBQUMxRCxZQUFNLGNBQWMsWUFBWSxJQUFJLE1BQU0sY0FBYyxHQUFHLEdBQUcsS0FBSyxZQUFZLGlCQUFpQjtBQUNoRyxVQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGFBQWEsZ0JBQWdCLFlBQVksU0FBUyxHQUFHLGNBQWMsS0FBSztBQUM5RSxZQUFNLFdBQVcsS0FBSyx5QkFBeUIsVUFBVTtBQUN6RCxVQUFJLFVBQVU7QUFDYixlQUFPLFNBQVMsU0FBUyxrQkFBa0IsVUFBVSxTQUFTLFNBQVMsa0JBQWtCLFlBQ3RGLHVCQUF1QixRQUFRLElBQy9CLFNBQVM7QUFBQSxNQUNiO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx5QkFBdUUsZUFBa0IsU0FBOEQ7QUFDOUosUUFBSSxDQUFDLFdBQVksUUFBUSxTQUFTLGtCQUFrQixVQUFVLFFBQVEsU0FBUyxrQkFBa0IsV0FBWTtBQUM1RyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksUUFBUSxZQUFZLFFBQVE7QUFDL0IsWUFBTUMsUUFBZ0UsRUFBRSxHQUFHLGVBQWUsWUFBWSxDQUFDLEdBQUcsUUFBUSxVQUFVLEVBQUU7QUFDOUgsYUFBT0E7QUFBQSxJQUNSO0FBQ0EsVUFBTSxPQUFnRSxFQUFFLEdBQUcsY0FBYztBQUN6RixXQUFPLEtBQUs7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEseUJBQXlCLElBQTREO0FBQzVGLFVBQU0saUJBQWlCLEtBQUssb0JBQW9CO0FBQ2hELFFBQUksbUJBQW1CLEtBQUssK0JBQStCO0FBQzFELFdBQUssZ0NBQWdDO0FBQ3JDLFdBQUssMEJBQTBCLE1BQU07QUFDckMsaUJBQVcsaUJBQWlCLGtCQUFrQixDQUFDLEdBQUc7QUFDakQsYUFBSywwQkFBMEIsSUFBSSxjQUFjLElBQUksYUFBYTtBQUNsRSxZQUFJLGNBQWMsU0FBUyxrQkFBa0IsV0FBVztBQUN2RCxxQkFBVyxTQUFTLGNBQWMsWUFBWSxDQUFDLEdBQUc7QUFDakQsaUJBQUssMEJBQTBCLElBQUksTUFBTSxJQUFJLEtBQUs7QUFBQSxVQUNuRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSywwQkFBMEIsSUFBSSxFQUFFO0FBQUEsRUFDN0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVdRLG1CQUE0QyxlQUFxQjtBQUN4RSxXQUFPLEtBQUssaUJBQWlCLEtBQUssaUJBQWlCLGFBQWEsQ0FBQztBQUFBLEVBQ2xFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRUSxpQkFBMEMsZUFBcUI7QUFDdEUsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLElBQUk7QUFDMUMsUUFBSSxTQUFTLFNBQVMsR0FBRztBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksY0FBYyxTQUFTLGtCQUFrQixXQUFXO0FBQ3ZELFlBQU0sVUFBVSxTQUFTLElBQUksY0FBYyxFQUFFO0FBQzdDLGFBQU8sVUFBVSxFQUFFLEdBQUcsZUFBZSxPQUFPLFFBQVEsT0FBTyxTQUFTLFFBQVEsUUFBUSxJQUFJO0FBQUEsSUFDekY7QUFDQSxVQUFNLFdBQVcsY0FBYztBQUMvQixRQUFJLENBQUMsWUFBWSxTQUFTLFdBQVcsR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksVUFBVTtBQUNkLFVBQU0sbUJBQW1CLFNBQVMsSUFBSSxXQUFTO0FBQzlDLFVBQUksTUFBTSxTQUFTLGtCQUFrQixXQUFXO0FBQy9DLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxVQUFVLFNBQVMsSUFBSSxNQUFNLEVBQUU7QUFDckMsVUFBSSxDQUFDLFNBQVM7QUFDYixlQUFPO0FBQUEsTUFDUjtBQUNBLGdCQUFVO0FBQ1YsYUFBTyxFQUFFLEdBQUcsT0FBTyxPQUFPLFFBQVEsT0FBTyxTQUFTLFFBQVEsUUFBUTtBQUFBLElBQ25FLENBQUM7QUFDRCxXQUFPLFVBQVUsRUFBRSxHQUFHLGVBQWUsVUFBVSxpQkFBaUIsSUFBSTtBQUFBLEVBQ3JFO0FBQ0Q7QUEzaUJNLDBCQUFOO0FBQUEsRUEwQkc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBNUJHO0FBb2pCTixNQUFNLDBCQUFtRDtBQUFBLEVBQ3hELFlBQ2tCLFFBQ1IsVUFDQSxhQUNSO0FBSGdCO0FBQ1I7QUFDQTtBQUFBLEVBQ047QUFBQSxFQUVKLElBQUksUUFBbUM7QUFDdEMsV0FBTyxLQUFLLE9BQU8sUUFBUSxJQUFJLEtBQUssUUFBUTtBQUFBLEVBQzdDO0FBQUEsRUFDQSxJQUFJLE1BQU0sT0FBa0M7QUFDM0MsU0FBSyxPQUFPLFFBQVEsSUFBSSxLQUFLLFVBQVUsS0FBSztBQUFBLEVBQzdDO0FBQUEsRUFFQSxJQUFJLGlCQUF1RDtBQUMxRCxXQUFPLEtBQUssT0FBTyxpQkFBaUIsYUFBYSxLQUFLLFFBQVE7QUFBQSxFQUMvRDtBQUFBLEVBQ0EsSUFBSSxlQUFlLGdCQUFzRDtBQUd4RSxTQUFLLE9BQU8saUJBQWlCLEtBQUssS0FBSyxVQUFVLENBQUMsR0FBRyxjQUFjLENBQUMsRUFBRSxNQUFNLE1BQU07QUFBQSxJQUEyQixDQUFDO0FBQUEsRUFDL0c7QUFDRDtBQVdBLElBQU0sZUFBTixjQUEyQixXQUFXO0FBQUEsRUFvQnJDLFlBQ2tCLGFBQ2pCLGtCQUNBLHNCQUM2Qyx1QkFDNUM7QUFDRCxVQUFNO0FBTFc7QUFHNEI7QUFoQjlDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBUyxVQUFVLElBQUksb0JBQW9CO0FBSTNDLFNBQWlCLFdBQVcsb0JBQUksSUFBdUM7QUFHdkU7QUFBQSxTQUFpQixpQkFBaUIsb0JBQUksSUFBeUI7QUFHL0Q7QUFBQSxTQUFpQixjQUFjLG9CQUFJLElBQVk7QUFTOUMsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLGdCQUFnQjtBQUd2RCxTQUFLLFVBQVUsS0FBSyxpQkFBaUIsYUFBYSxZQUFVO0FBQzNELDJCQUFxQixLQUFLLEVBQUUsTUFBTSxVQUFVLFVBQVUsS0FBSyxhQUFhLE9BQU8sQ0FBQztBQUFBLElBQ2pGLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQTtBQUFBLEVBR0EsY0FBYyxVQUFrQixNQUFvQjtBQUNuRCxVQUFNLFVBQVUsS0FBSyxTQUFTO0FBQzlCLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFFBQUksT0FBTyxJQUFJLE9BQU8sR0FBRztBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksT0FBTztBQUNWLFlBQU0sSUFBSSxPQUFPO0FBQUEsSUFDbEIsT0FBTztBQUNOLFdBQUssZUFBZSxJQUFJLFVBQVUsb0JBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDckQ7QUFDQSxTQUFLLFlBQVksSUFBSSxPQUFPO0FBQzVCLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdBLGlCQUFpQixVQUFrQixNQUFvQjtBQUN0RCxVQUFNLFVBQVUsS0FBSyxTQUFTO0FBQzlCLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFFBQUksQ0FBQyxPQUFPLElBQUksT0FBTyxHQUFHO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxPQUFPLE9BQU87QUFDcEIsUUFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQixXQUFLLGVBQWUsT0FBTyxRQUFRO0FBQUEsSUFDcEM7QUFDQSxTQUFLLG1CQUFtQjtBQUN4QixXQUFPLENBQUMsS0FBSyxlQUFlLElBQUksUUFBUTtBQUFBLEVBQ3pDO0FBQUE7QUFBQSxFQUdBLFdBQVcsTUFBaUI7QUFDM0IsZUFBVyxZQUFZLENBQUMsR0FBRyxLQUFLLGVBQWUsS0FBSyxDQUFDLEdBQUc7QUFDdkQsVUFBSSxLQUFLLGlCQUFpQixVQUFVLElBQUksR0FBRztBQUMxQyxhQUFLLGFBQWEsUUFBUTtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR0EsWUFBWSxVQUFxQztBQUNoRCxXQUFPLENBQUMsR0FBSSxLQUFLLGVBQWUsSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFFO0FBQUEsRUFDckQ7QUFBQTtBQUFBLEVBR0EsY0FBYyxVQUFrQixTQUEwQjtBQUN6RCxXQUFPLENBQUMsS0FBSyxZQUFZLElBQUksT0FBTyxLQUFLLEtBQUssZUFBZSxJQUFJLFFBQVEsR0FBRyxJQUFJLE9BQU8sTUFBTTtBQUFBLEVBQzlGO0FBQUE7QUFBQSxFQUdBLGFBQWEsU0FBNEM7QUFDeEQsVUFBTSxPQUFPLG9CQUFJLElBQVk7QUFDN0IsVUFBTSxTQUEyQixDQUFDO0FBQ2xDLGVBQVcsWUFBWSxLQUFLLFFBQVEsVUFBVSxHQUFHO0FBQ2hELFVBQUksQ0FBQyxLQUFLLGNBQWMsVUFBVSxPQUFPLEdBQUc7QUFDM0M7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsUUFBUSxLQUFLLFFBQVEsSUFBSSxRQUFRLEdBQUc7QUFDOUMsWUFBSSxDQUFDLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRztBQUN6QixlQUFLLElBQUksS0FBSyxJQUFJO0FBQ2xCLGlCQUFPLEtBQUssSUFBSTtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFNBQUssWUFBWSxNQUFNO0FBQ3ZCLGVBQVcsU0FBUyxLQUFLLGVBQWUsT0FBTyxHQUFHO0FBQ2pELGlCQUFXLFdBQVcsT0FBTztBQUM1QixhQUFLLFlBQVksSUFBSSxPQUFPO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHQSxrQkFBa0IsVUFBa0IsYUFBNEQ7QUFDL0YsUUFBSSxTQUFTLEtBQUssU0FBUyxJQUFJLFFBQVE7QUFDdkMsUUFBSSxDQUFDLFFBQVE7QUFDWixlQUFTLElBQUksMEJBQTBCLE1BQU0sVUFBVSxXQUFXO0FBQ2xFLFdBQUssU0FBUyxJQUFJLFVBQVUsTUFBTTtBQUFBLElBQ25DO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR0EsYUFBYSxVQUF3QjtBQUNwQyxTQUFLLFNBQVMsT0FBTyxRQUFRO0FBQzdCLFNBQUssUUFBUSxPQUFPLFFBQVE7QUFDNUIsU0FBSyxlQUFlLE9BQU8sUUFBUTtBQUNuQyxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGlCQUFpQixhQUFhLFFBQVE7QUFBQSxFQUM1QztBQUFBO0FBQUEsRUFHQSxNQUFNLFNBQVMsU0FBa0Q7QUFDaEUsV0FBTztBQUFBLE1BQ04sT0FBTyxZQUFZLFNBQVksS0FBSyxRQUFRLE9BQU8sSUFBSSxLQUFLLGFBQWEsT0FBTztBQUFBLE1BQ2hGLFNBQVMsTUFBTSxLQUFLLGlCQUFpQixrQkFBa0I7QUFBQSxNQUN2RCxZQUFZLEtBQUssZUFBZTtBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQXNDO0FBQzdDLFVBQU0sVUFBVSxLQUFLLHNCQUFzQixhQUFhLG9CQUFvQiw0QkFBNEIsS0FBSyxDQUFDO0FBRTlHLFdBQU8sZ0JBQWdCLE9BQU87QUFBQSxFQUMvQjtBQUFBO0FBQUEsRUFHQSxNQUFNLGdCQUFnQixNQUE2QixTQUFvQztBQUN0RixVQUFNLFVBQVUsTUFBTSxLQUFLLGlCQUFpQixrQkFBa0I7QUFDOUQsUUFBSSxDQUFDLG1CQUFtQixLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLE9BQU8sS0FBSyxZQUFZLEtBQUssZUFBZSxDQUFDLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLFlBQVksU0FDaEIsQ0FBQyxLQUFLLFFBQVEsaUJBQWlCLEtBQUssS0FBSyxJQUN6QyxDQUFDLHFCQUFxQixLQUFLLGFBQWEsT0FBTyxHQUFHLEtBQUssS0FBSztBQUFBLEVBQ2hFO0FBQ0Q7QUEvSk0sZUFBTjtBQUFBLEVBd0JHO0FBQUEsR0F4Qkc7IiwKICAibmFtZXMiOiBbImMiLCAiZXJyb3IiLCAicmVzdWx0IiwgInByb2plY3QiLCAiYmFja2luZyIsICJjdXN0b21pemF0aW9ucyIsICJjaGFuZ2VkIiwgImNoaWxkcmVuIiwgIm5leHQiXQp9Cg==
