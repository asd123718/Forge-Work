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
import { Sequencer } from "../../../../base/common/async.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { toRuntimeEffortLevel, resolveClaudeEffort } from "../../common/claudeModelConfig.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { areAdditionalWorkingDirectoriesEqual, areSessionWorkingDirectoriesEqual } from "../../common/state/sessionWorkingDirectories.js";
import { ChatInputResponseKind, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { CustomizationType, parseRequiredSessionUriFromChatUri } from "../../common/state/sessionState.js";
import { IClaudeAgentSdkService } from "./claudeAgentSdkService.js";
import { buildClientMcpServers, buildOptions } from "./claudeSdkOptions.js";
import { claudeTransportForProvider, parseClaudeModelSelection, toClaudeSdkModelId } from "./claudeModelSelection.js";
import { buildServerToolMcpServer, CLAUDE_SERVER_TOOL_MCP_SERVER_NAME, serverToolAllowList } from "./claudeServerToolMcpServer.js";
import { convertToolCallResult } from "./clientTools/claudeClientToolResult.js";
import { readClaudePermissionMode } from "./claudeSessionPermissionMode.js";
import { SessionClientToolsDiff } from "./clientTools/claudeSessionClientToolsModel.js";
import { SessionClientCustomizationsDiff } from "./customizations/claudeSessionClientCustomizationsModel.js";
import { ClaudeCustomizationWatcher, buildDiscoveredCustomizations, resolveClaudeAgentName } from "./customizations/claudeSessionCustomizationDiscovery.js";
import { applyMcpServerEnablement, findMcpChildId, findMcpServerName } from "../shared/mcpCustomizationController.js";
import { scanClaudeHooks } from "./customizations/scan/claudeHookScan.js";
import { scanClaudeMcpServers } from "./customizations/scan/claudeMcpScan.js";
import { IAgentHostCustomizationEnablementService } from "../agentHostCustomizationEnablementService.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { isCustomizationEnabled } from "../../common/customizationEnablement.js";
import { scanClaudeRules } from "./customizations/scan/claudeRuleScan.js";
import { discoverClaudeMultiRootCustomizations } from "./customizations/claudeMultiRootCustomizationDiscovery.js";
import { resolvePromptToContentBlocks } from "./claudePromptResolver.js";
import { ClaudeSdkPipeline } from "./claudeSdkPipeline.js";
import { SubagentRegistry } from "./claudeSubagentRegistry.js";
import { getSdkMcpServerEnablement, isCustomizationSdkEligible, resolveCustomizationEnablement } from "../shared/customizationEnablementGate.js";
function resolveCurrentPermissionMode(configurationService, resource, inheritedPermissionMode, permissionModeFallback) {
  return readClaudePermissionMode(configurationService, resource) ?? inheritedPermissionMode ?? permissionModeFallback;
}
let ClaudeAgentSession = class extends Disposable {
  constructor(sessionId, chatChannelUri, workspace, project, model, agent, config, abortController, _pendingClientToolCalls, toolDiff, _permissionModeFallback, additionalDirectories, _instantiationService, _configurationService, _otelService, _sdkService, _sessionDataService, _logService, _fileService, _environmentService, _customizationEnablementService) {
    super();
    this.sessionId = sessionId;
    this.workspace = workspace;
    this._pendingClientToolCalls = _pendingClientToolCalls;
    this._permissionModeFallback = _permissionModeFallback;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._otelService = _otelService;
    this._sdkService = _sdkService;
    this._sessionDataService = _sessionDataService;
    this._logService = _logService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._customizationEnablementService = _customizationEnablementService;
    this._mcpEnablementSequencer = new Sequencer();
    this._hostCustomizations = [];
    this._customizationWatcher = this._register(new MutableDisposable());
    /**
     * Phase 12 — per-session registry of Task tool calls that spawn
     * subagents (`SubagentSpawn` records keyed by `tool_use_id`, plus a
     * reverse index from inner `tool_use_id` to its parent Task). Owned
     * here so the registry dies with the session; consumers in the live
     * mapper (`ClaudeSdkMessageRouter` / `claudeMapSessionEvents` /
     * `claudeSubagentSignals`) and the `canUseTool` bridge read from
     * the same instance via the session.
     */
    this.subagents = this._register(new SubagentRegistry());
    /**
     * Phase 7 / S3.2. Tool-permission deferreds parked inside
     * {@link Options.canUseTool}. Keyed by SDK `tool_use_id`.
     */
    this._pendingPermissions = new PendingRequestRegistry();
    /**
     * Phase 7 / S3.2. User-input deferreds parked for interactive tools
     * (`AskUserQuestion`, `ExitPlanMode`). Keyed by `ChatInputRequest.id`.
     */
    this._pendingUserInputs = new PendingRequestRegistry();
    /**
     * Phase 11 — per-session **client-pushed** synced customization
     * snapshot + enablement map. Owns the workbench-supplied
     * {@link ISyncedCustomization} list, the per-URI enablement bits,
     * and the dirty flag drained at the next {@link send} pre-flight.
     * Exists from `createProvisional` onward so client-side reads /
     * toggles work uniformly before and after materialize.
     *
     * Server-side (SDK-discovered) customizations are NOT stored here
     * — they're fetched on demand from the live `Query` in
     * {@link getSessionCustomizations}.
     *
     * See {@link SessionClientCustomizationsDiff}.
     */
    this.clientCustomizationsDiff = this._register(new SessionClientCustomizationsDiff());
    this._onDidSessionProgress = this._register(new Emitter());
    this.onDidSessionProgress = this._onDidSessionProgress.event;
    /**
     * Real Copilot credits (in nano-AIU) billed by CAPI for the current
     * turn, summed across every `/v1/messages` request the SDK made
     * (including subagents). Fed by {@link recordTurnCredits} from the
     * proxy's `onDidReportCredits`, reset at the start of each {@link send},
     * and attached to the turn's `ChatUsage` signal by
     * {@link _enrichSignalWithCredits}. Unlike the SDK's `total_cost_usd`
     * (an Anthropic-list-price estimate), this is what CAPI actually bills.
     */
    this._currentTurnNanoAiu = 0;
    /**
     * Transport the session materialized under (Phase 19). Defaults to `proxy`
     * until {@link materialize} resolves it from {@link IMaterializeContext}.
     * Gates {@link _enrichSignalWithCredits} so native turns never carry a
     * Copilot credits overlay (the proxy is the only credit source).
     */
    this._transportKind = "proxy";
    /**
     * Set by {@link setModel} when a model change crosses transports (Copilot ↔
     * native) on an already-materialized session. Rather than hot-swapping the
     * live subprocess (which stays on the old transport), the switch is deferred:
     * the flag makes the next {@link send} pre-flight rebind. The agent resolves
     * the new transport at send time and hands it in via `switchTransport` (kept
     * in {@link _pendingSwitchTransport}); the rematerializer rebuilds onto it and
     * clears both on success. A failed rebuild leaves them set so the following
     * send retries. Exposed via {@link hasPendingTransportSwitch} so the agent
     * resolves a transport only when one is actually pending.
     */
    this._pendingTransportSwitch = false;
    // #endregion
    // #region Phase 11 — customizations / plugins
    /**
     * Merged fire-and-forget signal that this session's customization
     * surface changed. Fires from three sources:
     *
     * 1. Client-side writes (`adoptClientCustomizations`) — via the
     *    {@link SessionClientCustomizationsDiff} observable wired up in the
     *    constructor.
     * 2. Materialize completes — surfaces the server-side
     *    (SDK-discovered) tier to the workbench for the first time.
     * 3. The send() pre-flight rebind completes — the rebuilt SDK's
     *    resolved set may have changed.
     *
     * Drives a workbench refetch of {@link getSessionCustomizations}.
     * Does NOT itself trigger any SDK action — the dirty bit on
     * {@link SessionClientCustomizationsDiff} drives plugin rebinds,
     * and only flips on client-side writes.
     */
    this._onDidCustomizationsChange = this._register(new Emitter());
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    /** Snapshot of the last {@link getSessionCustomizations} result, read by {@link _enrichSignalWithMcpContributor}. */
    this._lastCustomizations = [];
    this._clientChildEnablement = /* @__PURE__ */ new Map();
    this._clientPluginEnablement = /* @__PURE__ */ new Map();
    this._clientCustomizationEnablement = /* @__PURE__ */ new Map();
    this._chatChannelUri = chatChannelUri;
    this.project = project;
    this._provisionalModel = model;
    this._provisionalAgent = agent;
    this.provisionalConfig = config;
    this.abortController = abortController;
    this._desiredAdditionalDirectories = additionalDirectories;
    this._appliedAdditionalDirectories = additionalDirectories;
    this._hostCustomizations = [];
    this.toolDiff = this._register(toolDiff);
    this._register(this.clientCustomizationsDiff.onDidChange(() => this._onDidCustomizationsChange.fire()));
    this._register(this._customizationEnablementService.onDidChange((event) => {
      if (!event.sessions.includes(this._configurationResource.toString())) {
        return;
      }
      this._onDidCustomizationsChange.fire();
      if (this._pipeline) {
        this._reconcileMcpServerEnablement(true).catch((error) => this._logService.error(error, `[Claude:${this.sessionId}] Failed to reconcile MCP enablement after customizations changed`));
      }
    }));
    this._watchCustomizations(this.workingDirectories);
  }
  get chatChannelUri() {
    return this._chatChannelUri;
  }
  get _configurationResource() {
    return URI.parse(parseRequiredSessionUriFromChatUri(this._chatChannelUri.toString()));
  }
  bindChatChannel(chatChannelUri) {
    if (this.isPipelineReady && this._chatChannelUri.toString() !== chatChannelUri.toString()) {
      throw new Error(`Cannot rebind materialized Claude session ${this.sessionId}`);
    }
    this._chatChannelUri = chatChannelUri;
  }
  /**
   * The actual directory work is done in. Defaults to {@link workspace} until
   * the host hands the session a resolved working directory (e.g. an isolated
   * worktree) at {@link materialize} time. `undefined` only when the session is
   * workspace-less and has no resolved directory yet.
   */
  get workingDirectory() {
    return this._workingDirectory ?? this.workspace;
  }
  /**
   * The full ordered working-directory set (index 0 = primary, 1..N =
   * desired additional roots). `undefined` only when the session has no
   * resolved primary yet (workspace-less, pre-materialize).
   */
  get workingDirectories() {
    const primary = this.workingDirectory;
    return primary ? [primary, ...this._desiredAdditionalDirectories] : void 0;
  }
  /** Exposed for the materializer's MCP-server build closure. */
  get pendingClientToolCalls() {
    return this._pendingClientToolCalls;
  }
  /** Snapshot of permission-mode fallback used when live read is undefined. */
  get permissionModeFallback() {
    return this._permissionModeFallback;
  }
  static createProvisional(sessionId, chatChannelUri, workspace, project, model, agent, config, pendingClientToolCalls, permissionModeFallback, instantiationService, additionalDirectories = []) {
    return instantiationService.createInstance(
      ClaudeAgentSession,
      sessionId,
      chatChannelUri,
      workspace,
      project,
      model,
      agent,
      config,
      new AbortController(),
      pendingClientToolCalls,
      new SessionClientToolsDiff(),
      permissionModeFallback,
      additionalDirectories
    );
  }
  /**
   * Accumulate proxy-reported billed credits for the in-flight turn.
   * Called from {@link ClaudeAgent} for every proxy `onDidReportCredits`
   * routed to this session. Ignores non-positive / non-finite values.
   */
  recordTurnCredits(totalNanoAiu) {
    if (Number.isFinite(totalNanoAiu) && totalNanoAiu > 0) {
      this._currentTurnNanoAiu += totalNanoAiu;
    }
  }
  /**
   * Inject the turn's accumulated Copilot credits into its `ChatUsage`
   * signal as `_meta.copilotUsage.totalNanoAiu` — the well-known key the
   * workbench prefers over `_meta.cost` when rendering per-turn credits.
   * All other signals pass through untouched.
   */
  _enrichSignalWithCredits(signal) {
    if (this._transportKind !== "proxy" || signal.kind !== "action" || signal.action.type !== ActionType.ChatUsage || this._currentTurnNanoAiu <= 0) {
      return signal;
    }
    const usage = signal.action.usage;
    return {
      ...signal,
      action: {
        ...signal.action,
        usage: {
          ...usage,
          _meta: {
            ...usage._meta,
            copilotUsage: { totalNanoAiu: this._currentTurnNanoAiu }
          }
        }
      }
    };
  }
  /**
   * Stamps the MCP {@link ToolCallContributor} onto a `ChatToolCallStart` for
   * an external `mcp__<server>__<tool>` call, resolved from this session's
   * cached customization snapshot. Owned here because the session owns the
   * customization data; the stream mapper stays free of it. (The in-process
   * `mcp__client__` server already carries a Client contributor from the mapper.)
   */
  _enrichSignalWithMcpContributor(signal) {
    if (signal.kind !== "action" || signal.action.type !== ActionType.ChatToolCallStart || signal.action.contributor !== void 0) {
      return signal;
    }
    const toolName = signal.action.toolName;
    if (!toolName.startsWith("mcp__")) {
      return signal;
    }
    const serverName = toolName.split("__")[1];
    const customizationId = serverName ? findMcpChildId(this._lastCustomizations, serverName) : void 0;
    if (customizationId === void 0) {
      return signal;
    }
    return { ...signal, action: { ...signal.action, contributor: { kind: ToolCallContributorKind.MCP, customizationId } } };
  }
  setHostCustomizations(customizations) {
    this._hostCustomizations = customizations;
  }
  _watchCustomizations(directories) {
    const store = new DisposableStore();
    const watcher = store.add(new ClaudeCustomizationWatcher(
      directories,
      this._environmentService.userHome,
      this._fileService,
      this._logService
    ));
    store.add(watcher.onDidChange(() => this._onDidCustomizationsChange.fire()));
    this._customizationWatcher.value = store;
  }
  /**
   * In-place truncation to `turnId` ("Restore Checkpoint"): prune the
   * per-turn DB rows (file edits, checkpoint refs) past the boundary AND
   * stage the SDK resume anchor that the next rebuild applies via
   * `Options.resumeSessionAt`. These two halves are one invariant — pruning
   * without staging the anchor would drop DB rows while the SDK still
   * replays the truncated turns; staging without pruning would leave stale
   * rows — so they live behind a single call rather than two the caller
   * could half-invoke. The prune runs first because it is the fallible half:
   * a DB failure then rejects without leaving an anchor staged for the next
   * turn. `turnId` is the protocol turn id (DB key); `resumeAnchorUuid` is
   * the SDK assistant-message uuid the agent resolved for it.
   */
  async truncateToTurn(turnId, resumeAnchorUuid, resource) {
    await this._withDatabase(resource, (db) => db.deleteTurnsAfter(turnId));
    this._pendingResumeSessionAt = resumeAnchorUuid;
  }
  /** Prunes all per-turn DB rows (remove-all truncation). */
  async pruneAllTurns(resource) {
    await this._withDatabase(resource, (db) => db.deleteAllTurns());
  }
  /**
   * Runs `fn` against a short-lived, ref-counted session DB handle so the
   * write is safe regardless of the pipeline's own dbRef lifecycle (the
   * ref-count keeps the shared DB alive; disposing only decrements).
   */
  async _withDatabase(resource, fn) {
    const ref = this._sessionDataService.openDatabase(resource);
    try {
      await fn(ref.object);
    } finally {
      ref.dispose();
    }
  }
  /**
   * Bring the session up: build SDK `Options`, start the SDK, open the
   * session-scoped DB ref, construct the pipeline, and attach the
   * rematerializer used for yield-restart (e.g. after a client-tool
   * snapshot change). Idempotent on re-call: extra calls throw rather
   * than silently re-materialize.
   *
   * If the supplied {@link IMaterializeContext.proxyHandle}'s underlying
   * `abortController` fires while `sdk.startup()` is in flight, the SDK
   * unwinds via the controller; if `startup` resolves anyway, the
   * `WarmQuery` is asyncDisposed and a {@link CancellationError} is
   * thrown (Q8 belt-and-suspenders).
   */
  async materialize(ctx) {
    if (this._pipeline) {
      throw new Error("ClaudeAgentSession is already materialized");
    }
    await this._customizationEnablementService.initializeSession(this._configurationResource.toString());
    if (ctx.customizations) {
      this._hostCustomizations = ctx.customizations;
    }
    const previousWorkingDirectories = this.workingDirectories;
    const resolvedPrimary = ctx.workingDirectories?.[0] ?? ctx.workingDirectory;
    if (resolvedPrimary && !isEqual(resolvedPrimary, this.workingDirectory)) {
      this._workingDirectory = resolvedPrimary;
    }
    if (ctx.workingDirectories && ctx.workingDirectories.length > 0) {
      this._desiredAdditionalDirectories = ctx.workingDirectories.slice(1);
      this._appliedAdditionalDirectories = this._desiredAdditionalDirectories;
    }
    const currentWorkingDirectories = this.workingDirectories;
    if (!areSessionWorkingDirectoriesEqual(previousWorkingDirectories, currentWorkingDirectories, true)) {
      this._watchCustomizations(currentWorkingDirectories);
    }
    if (!this.workingDirectory) {
      throw new Error(`Cannot materialize Claude session ${this.sessionId}: workingDirectory is required`);
    }
    this._transportKind = ctx.transport.kind;
    this._materializedTransport = ctx.transport;
    const permissionMode = resolveCurrentPermissionMode(this._configurationService, ctx.configResource, this._inheritedPermissionMode, this._permissionModeFallback);
    const { mcpServers, allowedTools } = await this._buildStartupToolWiring(ctx.resource, ctx.serverToolHost);
    const agentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
    const telemetry = await this._otelService.getNativeSdkTelemetryConfig();
    const traceContext = this._otelService.getSessionTraceContext(this.sessionId, ctx.resource.toString());
    const options = await buildOptions(
      {
        sessionId: this.sessionId,
        workingDirectory: this.workingDirectory,
        additionalDirectories: this._appliedAdditionalDirectories,
        model: this._provisionalModel,
        abortController: this.abortController,
        permissionMode,
        canUseTool: ctx.canUseTool,
        onElicitation: ctx.onElicitation,
        isResume: ctx.isResume,
        resumeSessionAt: this._pendingResumeSessionAt,
        mcpServers,
        allowedTools,
        plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
        agent: agentName,
        telemetry,
        traceContext,
        getUserPromptAdditionalContext: () => this._hostInstructions?.join("\n\n")
      },
      ctx.transport,
      (data) => this._logService.error(`[Claude SDK stderr] ${data}`)
    );
    this._logService.info(`[Claude] session ${this.sessionId}: enableFileCheckpointing=${options.enableFileCheckpointing} isResume=${ctx.isResume}`);
    const warm = await this._sdkService.startup({ options });
    if (this.abortController.signal.aborted) {
      await warm[Symbol.asyncDispose]();
      throw new CancellationError();
    }
    const dbRef = this._sessionDataService.openDatabase(ctx.resource);
    let pipeline;
    try {
      pipeline = this._register(this._instantiationService.createInstance(
        ClaudeSdkPipeline,
        this.sessionId,
        this._chatChannelUri,
        ctx.resource,
        warm,
        this.abortController,
        dbRef,
        this.subagents,
        (toolName) => this.toolDiff.model.ownerOf(toolName)
      ));
    } catch (err) {
      dbRef.dispose();
      await warm[Symbol.asyncDispose]();
      throw err;
    }
    this._register(pipeline.onDidProduceSignal((s) => this._onDidSessionProgress.fire(this._enrichSignalWithMcpContributor(this._enrichSignalWithCredits(s)))));
    this._pipeline = pipeline;
    this._register(this._configurationService.onDidSessionConfigChange((event) => {
      if (!event.origin || event.session !== ctx.configResource.toString()) {
        return;
      }
      const inheritedMode = readClaudePermissionMode(this._configurationService, ctx.configResource);
      const mode = inheritedMode ?? this.permissionModeFallback;
      this.setInheritedPermissionMode(inheritedMode).catch((err) => {
        this._logService.warn(`[Claude:${this.sessionId}] mid-turn setPermissionMode(${mode}) failed`, err);
      });
    }));
    this._pendingResumeSessionAt = void 0;
    pipeline.seedCurrentConfig(
      toClaudeSdkModelId(this._provisionalModel),
      toRuntimeEffortLevel(resolveClaudeEffort(this._provisionalModel)),
      permissionMode
    );
    if (this.abortController.signal.aborted) {
      throw new CancellationError();
    }
    pipeline.attachRematerializer(async (_reason) => {
      const liveMode = resolveCurrentPermissionMode(this._configurationService, ctx.configResource, this._inheritedPermissionMode, this._permissionModeFallback);
      const rebuildAbort = new AbortController();
      let rebuildWarm;
      try {
        const rebuildTransport = this._pendingSwitchTransport ?? this._materializedTransport;
        if (!rebuildTransport) {
          throw new Error(`Cannot rebuild Claude session ${this.sessionId}: no transport resolved`);
        }
        const { mcpServers: rebuildMcp, allowedTools: rebuildAllowedTools } = await this._buildStartupToolWiring(ctx.resource, ctx.serverToolHost);
        const rebuildAgentName = await resolveClaudeAgentName(this._provisionalAgent, this._fileService, this._logService, this.sessionId);
        const rebuildOptions = await buildOptions(
          {
            sessionId: this.sessionId,
            workingDirectory: this.workingDirectory,
            additionalDirectories: this._desiredAdditionalDirectories,
            model: this._provisionalModel,
            abortController: rebuildAbort,
            permissionMode: liveMode,
            canUseTool: ctx.canUseTool,
            onElicitation: ctx.onElicitation,
            isResume: true,
            resumeSessionAt: this._pendingResumeSessionAt,
            mcpServers: rebuildMcp,
            allowedTools: rebuildAllowedTools,
            plugins: this.clientCustomizationsDiff.consume(this._desiredClientPluginPaths()),
            agent: rebuildAgentName,
            telemetry,
            traceContext,
            getUserPromptAdditionalContext: () => this._hostInstructions?.join("\n\n")
          },
          rebuildTransport,
          (data) => this._logService.error(`[Claude SDK stderr] ${data}`)
        );
        this._logService.info(`[Claude] session ${this.sessionId}: resume rebuild agent=${rebuildOptions.agent ?? "(none)"}`);
        rebuildWarm = await this._sdkService.startup({ options: rebuildOptions });
        this._pendingResumeSessionAt = void 0;
        this._appliedAdditionalDirectories = this._desiredAdditionalDirectories;
        this._watchCustomizations(this.workingDirectories);
        this._transportKind = rebuildTransport.kind;
        this._materializedTransport = rebuildTransport;
        if (this._pendingSwitchTransport) {
          this._pendingTransportSwitch = false;
          this._pendingSwitchTransport = void 0;
        }
        return { warm: rebuildWarm, abortController: rebuildAbort };
      } catch (err) {
        rebuildAbort.abort();
        await rebuildWarm?.[Symbol.asyncDispose]();
        this.toolDiff.markDirty();
        this.clientCustomizationsDiff.markDirty();
        throw err;
      }
    });
    await this._reconcileMcpServerEnablement();
    ctx.serverToolHost?.advertise(ctx.resource.toString());
    this._onDidCustomizationsChange.fire();
  }
  /**
   * Build the SDK tool wiring shared by the initial materialize and every
   * yield-restart rematerialize: the in-process MCP servers plus the
   * auto-approve allow-list.
   *
   * The MCP servers are the workbench client tools (which round-trip to the
   * workbench) plus, when a server-tool host is wired, the agent host's own
   * server tools (executed in-process). `mcpServers` is `undefined` when
   * neither is present so `Options.mcpServers` is omitted entirely and the
   * SDK keeps its default; `allowedTools` carries the SDK-prefixed server tool
   * names (so they auto-approve without prompting) and is `undefined` when no
   * server-tool host is wired.
   *
   * Keeping both in one place ensures the two startup paths can never drift,
   * and that a newly registered server tool is wired everywhere at once.
   */
  async _buildStartupToolWiring(resource, serverToolHost) {
    const clientServers = await buildClientMcpServers(this.toolDiff, this._pendingClientToolCalls, this._sdkService);
    const serverToolServer = serverToolHost ? await buildServerToolMcpServer(serverToolHost, resource.toString(), this._sdkService) : void 0;
    const mcpServers = !clientServers && !serverToolServer ? void 0 : {
      ...clientServers ?? {},
      ...serverToolServer ? { [CLAUDE_SERVER_TOOL_MCP_SERVER_NAME]: serverToolServer } : {}
    };
    const autoApproveToolNames = serverToolHost ? serverToolHost.toolNames.filter((name) => !serverToolHost.canRequireConfirmation(name)) : void 0;
    return { mcpServers, allowedTools: autoApproveToolNames ? serverToolAllowList(autoApproveToolNames) : void 0 };
  }
  /** True once {@link materialize} has installed the SDK pipeline. */
  get isPipelineReady() {
    return this._pipeline !== void 0;
  }
  /**
   * Whether this chat currently has a turn in flight or queued. False when
   * provisional (no pipeline) or idle between turns. Used by non-destructive
   * idle release to avoid disconnecting mid-turn.
   */
  get hasActiveTurn() {
    return this._pipeline?.hasActiveTurn ?? false;
  }
  /** Pre-materialize model selection accessor (read by materializer to build Options). */
  get provisionalModel() {
    return this._provisionalModel;
  }
  /**
   * Whether a per-session provider switch is staged and awaiting the next
   * {@link send}. The agent reads this to decide whether to resolve a fresh
   * transport (it owns the live proxy handle) and push it in via `switchTransport`
   * — resolving one only when a switch is actually pending, so ordinary sends
   * never trip the signed-out proxy throw.
   */
  get hasPendingTransportSwitch() {
    return this._pendingTransportSwitch;
  }
  _requirePipeline() {
    if (!this._pipeline) {
      throw new Error("ClaudeAgentSession is not materialized");
    }
    return this._pipeline;
  }
  get isResumed() {
    return this._requirePipeline().isResumed;
  }
  /**
   * Abort the live SDK subprocess and await its full teardown so the
   * session id is released. No-op when the session was never materialized
   * (no subprocess to stop). Used by remove-all truncation before it
   * recreates a fresh session under the same id — the CLI keeps the id
   * locked until the old subprocess exits.
   */
  async shutdownLiveQuery() {
    await this._pipeline?.shutdownAndWait();
  }
  /**
   * Seed the pipeline's current + applied config cache from
   * materialize-time `Options`. The SDK already starts with these
   * values, so the cache prevents a redundant first `setModel` /
   * `applyFlagSettings` call.
   */
  seedBijectiveState(state) {
    this._requirePipeline().seedCurrentConfig(state.model, state.effort, state.permissionMode);
  }
  attachRematerializer(rematerializer) {
    this._requirePipeline().attachRematerializer(rematerializer);
  }
  /**
   * Send a user prompt. Performs the per-turn pre-flight before
   * yielding to the pipeline:
   *
   * - If {@link toolDiff} or {@link clientCustomizationsDiff} reports the
   *   live `Query` is out of sync with the workbench's view, yield-restart
   *   so the SDK picks up the new `Options.mcpServers` / `Options.plugins`.
   *   `Query.reloadPlugins()` cannot help here — the SDK's plugin URI set
   *   is captured at startup, so any add / remove / nonce-bump must go
   *   through a full rebuild. The rebind itself re-applies the live
   *   `permissionMode` via the rematerializer.
   * - Otherwise forward the live `permissionMode` to the bound `Query` so
   *   a `SessionConfigChanged` action that arrived between turns wins.
   *   The pipeline's bijective cache dedupes a no-op `setPermissionMode`,
   *   so this is free when nothing changed.
   *
   * When {@link hasPendingTransportSwitch} is set, the agent resolves the new
   * transport (it owns the live proxy handle) and passes it as `switchTransport`.
   * It is staged for the pre-flight rebuild below, which rebinds the subprocess
   * onto it. The agent resolves one only when a switch is pending, so ordinary
   * sends never carry a transport and the session never calls back to re-resolve.
   *
   * Model / effort are not threaded through here — the pipeline's current
   * model / effort (set eagerly via {@link setModel}) is whatever
   * the SDK has been told.
   */
  async send(prompt, turnId, resource, workingDirectories, switchTransport, hostInstructions, clientContext) {
    const pipeline = this._requirePipeline();
    if (workingDirectories) {
      this._replaceDesiredWorkingDirectories(workingDirectories);
    }
    if (switchTransport) {
      this._pendingSwitchTransport = switchTransport;
    }
    this._currentTurnNanoAiu = 0;
    if (this.toolDiff.hasDifference || this.clientCustomizationsDiff.hasDifferenceFrom(this._desiredClientPluginPaths()) || this._pendingResumeSessionAt !== void 0 || !areAdditionalWorkingDirectoriesEqual(this._appliedAdditionalDirectories, this._desiredAdditionalDirectories) || this._pendingTransportSwitch) {
      await this._rebindForSyncedState();
    } else {
      await pipeline.setPermissionMode(resolveCurrentPermissionMode(this._configurationService, resource, this._inheritedPermissionMode, this._permissionModeFallback));
    }
    await this._reconcileMcpServerEnablement();
    this._hostInstructions = hostInstructions;
    try {
      await pipeline.send(prompt, turnId, clientContext);
    } finally {
      this._hostInstructions = void 0;
    }
  }
  _replaceDesiredWorkingDirectories(workingDirectories) {
    const primary = this.workingDirectory;
    if (!primary || !isEqual(primary, workingDirectories[0])) {
      throw new Error(`Cannot change Claude session primary working directory: ${this.sessionId}`);
    }
    const desiredAdditionalDirectories = workingDirectories.slice(1);
    if (areAdditionalWorkingDirectoriesEqual(this._desiredAdditionalDirectories, desiredAdditionalDirectories)) {
      return;
    }
    this._desiredAdditionalDirectories = desiredAdditionalDirectories;
  }
  /**
   * Single yield-restart that covers both client-tool and
   * customization divergence in one trip. Drains the parked
   * client-tool MCP handlers (same as the original tool-only
   * rebind), then triggers the pipeline rebind — the rematerializer
   * reads `toolDiff` and reducer-backed client plugin paths while
   * building the new `Options`, so the bit on each diff clears in
   * lockstep with the SDK actually receiving the new values. Fires
   * `_onDidCustomizationsChange` afterwards so the workbench
   * refetches `getSessionCustomizations` and picks up any newly
   * resolved server-side entries from the rebuilt `Query`.
   */
  async _rebindForSyncedState() {
    this._pendingClientToolCalls.rejectAll(new CancellationError());
    await this._requirePipeline().rebindForRestart();
    this._onDidCustomizationsChange.fire();
  }
  /**
   * Cancel the in-flight SDK turn. Mirrors the production reference;
   * see {@link ClaudeSdkPipeline.abort}. Also denies any parked
   * permission / user-input requests so the SDK's `canUseTool`
   * callback (and any interactive tool waiting on user input) unwinds
   * with a deny / cancel result instead of leaving stale UI behind.
   */
  abort() {
    this._pendingPermissions.denyAll(false);
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
    this._requirePipeline().abort();
  }
  /**
   * Eagerly apply a model change and persist the new selection. Safe to
   * call before or after materialize:
   *
   * - Pre-materialize: stash the model on the session so the first SDK
   *   startup picks it up via `Options.model` / `Options.effort`.
   * - Post-materialize: queue the change on the pipeline; the SDK
   *   applies it on the NEXT user request via
   *   `Query.setModel` / `Query.applyFlagSettings`. `'max'` flows through
   *   unchanged — see {@link toRuntimeEffortLevel}.
   *
   * Persistence is host-owned; callers update the overlay separately.
   *
   * A change that crosses transports (Copilot ↔ native) on a live session
   * defers to a rebuild on the next {@link send} rather than hot-swapping.
   */
  async setModel(model) {
    this._provisionalModel = model;
    const parsed = parseClaudeModelSelection(model);
    const crossesTransport = this.isPipelineReady && parsed.explicitProvider && claudeTransportForProvider(parsed.provider) !== this._transportKind;
    if (crossesTransport) {
      this._pendingTransportSwitch = true;
      this._pipeline?.bufferConfigForRebind(toClaudeSdkModelId(model), toRuntimeEffortLevel(resolveClaudeEffort(model)));
    } else if (this._pipeline) {
      this._pendingTransportSwitch = false;
      this._pendingSwitchTransport = void 0;
      await this._pipeline.setModel(toClaudeSdkModelId(model));
      await this._pipeline.setEffort(toRuntimeEffortLevel(resolveClaudeEffort(model)));
    }
  }
  /**
   * Pre-materialize custom-agent selection accessor.
   */
  get provisionalAgent() {
    return this._provisionalAgent;
  }
  /**
   * Change (or clear with `undefined`) the selected custom agent for this
   * session. The SDK captures `Options.agent` at startup with no
   * working runtime control (`applyFlagSettings({ agent })` exists on
   * the SDK surface but doesn't actually swap the live agent), so
   * post-materialize calls flip {@link clientCustomizationsDiff}
   * dirty and the next `send()` pre-flight rebinds with the new agent
   * baked into the rebuilt `Query`. Persistence is host-owned; callers update
   * the overlay separately.
   */
  async setAgent(agent) {
    if (this._provisionalAgent === agent) {
      return;
    }
    this._provisionalAgent = agent;
    if (this._pipeline) {
      this.clientCustomizationsDiff.markDirty();
    }
  }
  /**
   * Inject a steering message. Builds the `priority: 'now'`
   * {@link SDKUserMessage} and hands it to the pipeline; the pipeline
   * inherits the parent's turnId (CONTEXT.md M10) and fires
   * `steering_consumed` when the SDK accepts it. No-op if the pipeline
   * is aborted.
   */
  injectSteering(steeringMessage) {
    const pipeline = this._requirePipeline();
    if (pipeline.isAborted) {
      return;
    }
    const contentBlocks = resolvePromptToContentBlocks(
      steeringMessage.message.text,
      steeringMessage.message.attachments
    );
    const sdkMessage = {
      type: "user",
      message: { role: "user", content: contentBlocks },
      session_id: this.sessionId,
      parent_tool_use_id: null,
      priority: "now",
      // Reuse the protocol PendingMessage.id as the SDK uuid — same
      // pattern as `ClaudeAgent.sendMessage` reusing turnId. The SDK's
      // `uuid` field is typed as a branded UUID, but the cast at the
      // boundary is the convention for both code paths.
      uuid: steeringMessage.id
    };
    pipeline.injectSteering(sdkMessage, steeringMessage.id);
  }
  /** Live permission-mode change. Forwards to the pipeline; the pipeline remembers it for re-application after a rebind. */
  setPermissionMode(mode) {
    return this._requirePipeline().setPermissionMode(mode);
  }
  setInheritedPermissionMode(mode) {
    this._inheritedPermissionMode = mode;
    if (!this._pipeline) {
      return Promise.resolve();
    }
    return this._pipeline.setPermissionMode(mode ?? this._permissionModeFallback);
  }
  // #region Phase 7 / S3.2 — pending state
  /**
   * Atomically register a pending-permission deferred and fire the
   * `pending_confirmation` signal. The SDK is blocked on the returned
   * promise inside its `canUseTool` callback until
   * {@link respondToPermissionRequest} resolves it. Resolves with
   * `false` if the pipeline is aborted.
   */
  requestPermission(args) {
    if (!this._pipeline || this._pipeline.isAborted) {
      return Promise.resolve(false);
    }
    return this._pendingPermissions.registerAndFire(args.toolUseID, () => {
      this._onDidSessionProgress.fire({
        kind: "pending_confirmation",
        chat: this._chatChannelUri,
        state: args.state,
        permissionKind: args.permissionKind,
        ...args.permissionPath !== void 0 ? { permissionPath: args.permissionPath } : {},
        ...args.parentToolCallId !== void 0 ? { parentToolCallId: args.parentToolCallId } : {}
      });
    });
  }
  respondToPermissionRequest(requestId, approved) {
    return this._pendingPermissions.respond(requestId, approved);
  }
  /**
   * Fire a {@link ActionType.ChatInputRequested} action and park on
   * a deferred until {@link respondToUserInputRequest} resolves it.
   * Resolves with `{ response: Cancel }` if the pipeline is aborted.
   */
  requestUserInput(request, parentToolCallId) {
    if (!this._pipeline || this._pipeline.isAborted || !this._pipeline.hasActiveTurn) {
      return Promise.resolve({ response: ChatInputResponseKind.Cancel });
    }
    return this._pendingUserInputs.registerAndFire(request.id, () => {
      this._onDidSessionProgress.fire({
        kind: "action",
        resource: this._chatChannelUri,
        action: {
          type: ActionType.ChatInputRequested,
          request
        },
        ...parentToolCallId !== void 0 ? { parentToolCallId } : {}
      });
    });
  }
  respondToUserInputRequest(requestId, response, answers) {
    return this._pendingUserInputs.respond(requestId, { response, answers });
  }
  // #endregion
  // #region Phase 10 — client tools
  /** Replace a client's registered tools (full replacement). */
  setClientTools(clientId, tools) {
    this.toolDiff.model.setTools(clientId, tools);
  }
  /** This client's registered tools (empty when absent). */
  getClientTools(clientId) {
    return this.toolDiff.model.getTools(clientId);
  }
  /** Remove a client's tool contribution from this session. */
  removeClientTools(clientId) {
    this.toolDiff.model.removeClient(clientId);
  }
  /** Remove a client's customization contribution from this session. */
  removeClientCustomizations(clientId) {
    this.clientCustomizationsDiff.model.removeClient(clientId);
    if (this._clientCustomizationEnablement.delete(clientId)) {
      this._rebuildClientCustomizationEnablement();
    }
  }
  /**
   * Resolve a parked client-tool MCP handler with the workbench-supplied
   * result. Returns `true` if a matching deferred was found and settled.
   * Unknown ids are a benign no-op — `agentSideEffects.ts` forwards every
   * `ChatToolCallComplete` envelope, so SDK-owned tool completions land
   * here too and must NOT throw.
   */
  completeClientToolCall(toolCallId, result) {
    const converted = convertToolCallResult(result, toolCallId);
    return this._pendingClientToolCalls.respond(toolCallId, converted);
  }
  /**
   * Drive a yield-restart so the SDK picks up the new client-tool set
   * on its next user request. Public entry point for callers that need
   * to force a tool-only rebind; internal pre-flight goes through
   * {@link _rebindForSyncedState}.
   */
  async rebindForClientTools() {
    await this._rebindForSyncedState();
  }
  /**
   * Adopt the result of a global {@link IAgentPluginManager.syncCustomizations}
   * pass (**client-pushed** path). The agent owns the manager (it's
   * a process-wide singleton with a shared on-disk cache) and pushes
   * the resulting snapshot down here. Flips the client-side dirty bit
   * so the next {@link send} pre-flight reloads SDK plugins.
   */
  adoptClientCustomizations(clientId, synced, customizations) {
    this.clientCustomizationsDiff.model.setSyncedCustomizations(clientId, synced);
    const pluginEnablement = /* @__PURE__ */ new Map();
    const childEnablement = /* @__PURE__ */ new Map();
    for (const customization of customizations) {
      pluginEnablement.set(customization.uri.toString(), customization);
      if (customization.childEnablement !== void 0) {
        childEnablement.set(customization.uri.toString(), customization.childEnablement);
      }
    }
    this._clientCustomizationEnablement.delete(clientId);
    this._clientCustomizationEnablement.set(clientId, { pluginEnablement, childEnablement });
    this._rebuildClientCustomizationEnablement();
  }
  /**
   * Snapshot of the **client-pushed** customizations on this session.
   * Does NOT include server-side (SDK-discovered) entries — use
   * {@link getSessionCustomizations} for the merged view.
   */
  getClientCustomizations() {
    return this.clientCustomizationsDiff.model.state.get().synced;
  }
  _rebuildClientCustomizationEnablement() {
    this._clientChildEnablement.clear();
    this._clientPluginEnablement.clear();
    for (const enablement of this._clientCustomizationEnablement.values()) {
      for (const [uri, plugin] of enablement.pluginEnablement) {
        this._clientPluginEnablement.set(uri, plugin);
      }
      for (const [uri, children] of enablement.childEnablement) {
        this._clientChildEnablement.set(uri, children);
      }
    }
  }
  /**
   * Project the union of (a) **client-pushed** customizations and
   * (b) the **server-side** (SDK-discovered) view (commands / agents
   * / MCP servers, including those the SDK discovered on its own
   * from `~/.claude/**`) onto the protocol's
   * {@link Customization} surface, with reducer-backed enablement
   * applied to client-pushed entries.
   *
   * Pre-materialize sessions return only the client-pushed projection
   * — the SDK side has no Query to query yet. A failure to read the
   * SDK snapshot is warn-logged and the client-pushed projection is
   * still returned, so a transient SDK hiccup doesn't blank the UI.
   */
  async getSessionCustomizations() {
    const { synced } = this.clientCustomizationsDiff.model.state.get();
    const userHome = this._environmentService.userHome;
    const [multiRoot, rules, mcpServers, hooks] = await Promise.all([
      discoverClaudeMultiRootCustomizations(this.workingDirectories, userHome, this._fileService, this._logService),
      scanClaudeRules(this.workingDirectory, userHome, this._fileService),
      scanClaudeMcpServers(this.workingDirectory, userHome, this._fileService),
      scanClaudeHooks(this.workingDirectory, userHome, this._fileService)
    ]);
    let sdk;
    if (this._pipeline) {
      try {
        sdk = await this._pipeline.snapshotResolvedCustomizations();
      } catch (err) {
        this._logService.warn(`[Claude:${this.sessionId}] snapshotResolvedCustomizations failed`, err);
      }
    }
    const discoveredCustomizations = buildDiscoveredCustomizations([...multiRoot.discovered, ...rules], mcpServers, hooks, multiRoot.nativePlugins, multiRoot.workingDirectories, userHome, sdk);
    const state = this._hostCustomizations;
    const result = synced.map((item) => {
      const desired = state.find((customization) => customization.id === item.customization.id);
      if (desired?.type !== CustomizationType.Plugin) {
        return item.customization;
      }
      if (desired.enablement?.length) {
        return { ...item.customization, enablement: [...desired.enablement] };
      }
      const { enablement: _enablement, ...withoutEnablement } = item.customization;
      return withoutEnablement;
    });
    result.push(...discoveredCustomizations);
    const projected = applyMcpServerEnablement(result, state);
    const enabled = resolveCustomizationEnablement(this._customizationEnablementService, this._configurationResource, projected, this._clientChildEnablement, this._clientPluginEnablement);
    this._lastCustomizations = enabled.customizations;
    return enabled.customizations;
  }
  _reconcileMcpServerEnablement(fromCustomizationChange = false) {
    const desired = this._getDesiredMcpServerEnablement();
    if (desired.size === 0) {
      this._lastReconciledMcpEnablement = desired;
      return Promise.resolve();
    }
    if (fromCustomizationChange && this._isMcpEnablementUnchanged(desired)) {
      return Promise.resolve();
    }
    return this._mcpEnablementSequencer.queue(() => this._doReconcileMcpServerEnablement());
  }
  async _doReconcileMcpServerEnablement() {
    const pipeline = this._requirePipeline();
    const desired = this._getDesiredMcpServerEnablement();
    if (desired.size === 0) {
      this._lastReconciledMcpEnablement = desired;
      return;
    }
    if (!await pipeline.reconcileMcpServerEnablement(desired)) {
      throw new Error(`Claude SDK cannot reconcile MCP server enablement`);
    }
    this._lastReconciledMcpEnablement = desired;
  }
  _getDesiredMcpServerEnablement() {
    const resolved = resolveCustomizationEnablement(
      this._customizationEnablementService,
      this._configurationResource,
      this._hostCustomizations,
      this._clientChildEnablement,
      this._clientPluginEnablement
    );
    const enabledById = getSdkMcpServerEnablement(resolved);
    return new Map(resolved.customizations.flatMap((customization) => {
      if (customization.type === CustomizationType.McpServer) {
        return [[customization.name, enabledById.get(customization.id) ?? false]];
      }
      return (customization.children ?? []).flatMap((child) => child.type === CustomizationType.McpServer ? [[child.name, enabledById.get(child.id) ?? false]] : []);
    }));
  }
  _isMcpEnablementUnchanged(desired) {
    if (!this._lastReconciledMcpEnablement || desired.size !== this._lastReconciledMcpEnablement.size) {
      return false;
    }
    return [...desired].every(([name, enabled]) => this._lastReconciledMcpEnablement.get(name) === enabled);
  }
  _desiredClientPluginPaths() {
    const resolved = resolveCustomizationEnablement(this._customizationEnablementService, this._configurationResource, this.clientCustomizationsDiff.model.state.get().synced.map((item) => item.customization), this._clientChildEnablement, this._clientPluginEnablement);
    const desiredById = new Map(resolved.customizations.filter((customization) => isCustomizationSdkEligible(resolved, customization)).map((customization) => [customization.id, customization.type === CustomizationType.Directory ? customization.enabled : isCustomizationEnabled(customization)]));
    const paths = [];
    for (const synced of this.clientCustomizationsDiff.model.state.get().synced) {
      if (synced.pluginDir && (desiredById.get(synced.customization.id) ?? isCustomizationEnabled(synced.customization)) !== false) {
        paths.push(synced.pluginDir);
      }
    }
    return paths;
  }
  async startMcpServer(id) {
    const serverName = await this._resolveMcpServerName(id);
    if (!serverName) {
      this._logService.warn(`[Claude:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    const handled = await this._requirePipeline().startMcpServer(serverName);
    if (!handled) {
      await this._rebindForSyncedState();
    }
    this._onDidCustomizationsChange.fire();
  }
  async stopMcpServer(id) {
    const serverName = await this._resolveMcpServerName(id);
    if (!serverName) {
      this._logService.warn(`[Claude:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
    const handled = await this._requirePipeline().stopMcpServer(serverName);
    if (!handled) {
      this._logService.warn(`[Claude:${this.sessionId}] MCP server stop is not supported by the current SDK`);
      return;
    }
    this._onDidCustomizationsChange.fire();
  }
  async _resolveMcpServerName(id) {
    return findMcpServerName(this._lastCustomizations, id) ?? findMcpServerName(await this.getSessionCustomizations(), id);
  }
  // #endregion
  dispose() {
    this._pendingPermissions.denyAll(false);
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
    this._pendingClientToolCalls.rejectAll(new CancellationError());
    super.dispose();
  }
};
ClaudeAgentSession = __decorateClass([
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IAgentConfigurationService),
  __decorateParam(14, IAgentHostOTelService),
  __decorateParam(15, IClaudeAgentSdkService),
  __decorateParam(16, ISessionDataService),
  __decorateParam(17, ILogService),
  __decorateParam(18, IFileService),
  __decorateParam(19, INativeEnvironmentService),
  __decorateParam(20, IAgentHostCustomizationEnablementService)
], ClaudeAgentSession);
export {
  ClaudeAgentSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZUFnZW50U2Vzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgTWNwU2RrU2VydmVyQ29uZmlnV2l0aEluc3RhbmNlLCBPbkVsaWNpdGF0aW9uLCBPcHRpb25zLCBQZXJtaXNzaW9uTW9kZSwgU0RLVXNlck1lc3NhZ2UsIFdhcm1RdWVyeSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgdHlwZSB7IENhbGxUb29sUmVzdWx0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcyc7XG5pbXBvcnQgeyBTZXF1ZW5jZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3luY2VkQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUGVybWlzc2lvbk1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2xhdWRlU2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUnVudGltZUVmZm9ydExldmVsLCB0b1J1bnRpbWVFZmZvcnRMZXZlbCwgcmVzb2x2ZUNsYXVkZUVmZm9ydCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jbGF1ZGVNb2RlbENvbmZpZy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNpZ25hbCwgSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3BlbmRpbmdSZXF1ZXN0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhcmVBZGRpdGlvbmFsV29ya2luZ0RpcmVjdG9yaWVzRXF1YWwsIGFyZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXNFcXVhbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmpzJztcbmltcG9ydCB7IFBlbmRpbmdNZXNzYWdlLCBDaGF0SW5wdXRBbnN3ZXIsIENoYXRJbnB1dFJlcXVlc3QsIENoYXRJbnB1dFJlc3BvbnNlS2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsUGVuZGluZ0NvbmZpcm1hdGlvblN0YXRlLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIFRvb2xDYWxsUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIH0gZnJvbSAnLi9jbGF1ZGVBZ2VudFNka1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRDbGllbnRNY3BTZXJ2ZXJzLCBidWlsZE9wdGlvbnMgfSBmcm9tICcuL2NsYXVkZVNka09wdGlvbnMuanMnO1xuaW1wb3J0IHsgY2xhdWRlVHJhbnNwb3J0Rm9yUHJvdmlkZXIsIHBhcnNlQ2xhdWRlTW9kZWxTZWxlY3Rpb24sIHRvQ2xhdWRlU2RrTW9kZWxJZCB9IGZyb20gJy4vY2xhdWRlTW9kZWxTZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgYnVpbGRTZXJ2ZXJUb29sTWNwU2VydmVyLCBDTEFVREVfU0VSVkVSX1RPT0xfTUNQX1NFUlZFUl9OQU1FLCBzZXJ2ZXJUb29sQWxsb3dMaXN0IH0gZnJvbSAnLi9jbGF1ZGVTZXJ2ZXJUb29sTWNwU2VydmVyLmpzJztcbmltcG9ydCB7IGNvbnZlcnRUb29sQ2FsbFJlc3VsdCB9IGZyb20gJy4vY2xpZW50VG9vbHMvY2xhdWRlQ2xpZW50VG9vbFJlc3VsdC5qcyc7XG5pbXBvcnQgeyByZWFkQ2xhdWRlUGVybWlzc2lvbk1vZGUgfSBmcm9tICcuL2NsYXVkZVNlc3Npb25QZXJtaXNzaW9uTW9kZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmIH0gZnJvbSAnLi9jbGllbnRUb29scy9jbGF1ZGVTZXNzaW9uQ2xpZW50VG9vbHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNEaWZmIH0gZnJvbSAnLi9jdXN0b21pemF0aW9ucy9jbGF1ZGVTZXNzaW9uQ2xpZW50Q3VzdG9taXphdGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVDdXN0b21pemF0aW9uV2F0Y2hlciwgYnVpbGREaXNjb3ZlcmVkQ3VzdG9taXphdGlvbnMsIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWUgfSBmcm9tICcuL2N1c3RvbWl6YXRpb25zL2NsYXVkZVNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IGFwcGx5TWNwU2VydmVyRW5hYmxlbWVudCwgZmluZE1jcENoaWxkSWQsIGZpbmRNY3BTZXJ2ZXJOYW1lIH0gZnJvbSAnLi4vc2hhcmVkL21jcEN1c3RvbWl6YXRpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IHNjYW5DbGF1ZGVIb29rcyB9IGZyb20gJy4vY3VzdG9taXphdGlvbnMvc2Nhbi9jbGF1ZGVIb29rU2Nhbi5qcyc7XG5pbXBvcnQgeyBzY2FuQ2xhdWRlTWNwU2VydmVycyB9IGZyb20gJy4vY3VzdG9taXphdGlvbnMvc2Nhbi9jbGF1ZGVNY3BTY2FuLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi9hZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdE9UZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL290ZWwvYWdlbnRIb3N0T1RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDdXN0b21pemF0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBzY2FuQ2xhdWRlUnVsZXMgfSBmcm9tICcuL2N1c3RvbWl6YXRpb25zL3NjYW4vY2xhdWRlUnVsZVNjYW4uanMnO1xuaW1wb3J0IHsgZGlzY292ZXJDbGF1ZGVNdWx0aVJvb3RDdXN0b21pemF0aW9ucyB9IGZyb20gJy4vY3VzdG9taXphdGlvbnMvY2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlUHJvbXB0VG9Db250ZW50QmxvY2tzIH0gZnJvbSAnLi9jbGF1ZGVQcm9tcHRSZXNvbHZlci5qcyc7XG5pbXBvcnQgdHlwZSB7IENsYXVkZVRyYW5zcG9ydCB9IGZyb20gJy4vY2xhdWRlUHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsYXVkZVNka1BpcGVsaW5lLCBJUmVtYXRlcmlhbGl6ZXIsIHR5cGUgSVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnMgfSBmcm9tICcuL2NsYXVkZVNka1BpcGVsaW5lLmpzJztcbmltcG9ydCB7IFN1YmFnZW50UmVnaXN0cnkgfSBmcm9tICcuL2NsYXVkZVN1YmFnZW50UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUGVybWlzc2lvbktpbmQgfSBmcm9tICcuL2NsYXVkZVRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB7IGdldFNka01jcFNlcnZlckVuYWJsZW1lbnQsIGlzQ3VzdG9taXphdGlvblNka0VsaWdpYmxlLCByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQgfSBmcm9tICcuLi9zaGFyZWQvY3VzdG9taXphdGlvbkVuYWJsZW1lbnRHYXRlLmpzJztcblxuLy8gUmUtZXhwb3J0IGZvciBjYWxsZXJzIHRoYXQgaW1wb3J0IElSZW1hdGVyaWFsaXplciBmcm9tIHRoZSBzZXNzaW9uLlxuZXhwb3J0IHR5cGUgeyBJUmVtYXRlcmlhbGl6ZXIgfSBmcm9tICcuL2NsYXVkZVNka1BpcGVsaW5lLmpzJztcblxuLyoqXG4gKiBJbnB1dHMgdG8ge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbi5tYXRlcmlhbGl6ZX0uIENhcnJpZXMgdGhlXG4gKiBhZ2VudC1zdXBwbGllZCBkZXBlbmRlbmNpZXMgdGhhdCB0aGUgc2Vzc2lvbiBpdHNlbGYgZG9lcyBub3Qgb3duXG4gKiAocHJveHkgYXV0aCwgdGhlIGBjYW5Vc2VUb29sYCBjbG9zdXJlIHRoYXQgYnJpZGdlcyBiYWNrIHRvIHRoZVxuICogYWdlbnQncyBwZXItc2Vzc2lvbiBsb29rdXAsIGFuZCB0aGUgcmVzdW1lLXZzLWZyZXNoIGRpc2NyaW1pbmF0b3IpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNYXRlcmlhbGl6ZUNvbnRleHQge1xuXHQvKipcblx0ICogVHJhbnNwb3J0IChwcm94eSB2cyBuYXRpdmUpIHRoZSBhZ2VudCByZXNvbHZlZCBmb3IgdGhpcyBzZXNzaW9uJ3Ncblx0ICogcHJvdmlzaW9uYWwgbW9kZWwsIHBpbm5lZCBoZXJlIGF0IG1hdGVyaWFsaXplLiBUaGUgYWdlbnQgb3ducyB0cmFuc3BvcnRcblx0ICogcmVzb2x1dGlvbiAoaXQgaG9sZHMgdGhlIGxpdmUgcHJveHkgaGFuZGxlIGFuZCB0aGUgaG9zdCBkZWZhdWx0IG1vZGUpOyB0aGVcblx0ICogc2Vzc2lvbiBvbmx5IGNvbnN1bWVzIHRoZSB2YWx1ZSBhbmQgbmV2ZXIgY2FsbHMgYmFjayB0byByZS1yZXNvbHZlLiBBIGxhdGVyXG5cdCAqIHBlci1zZXNzaW9uIHByb3ZpZGVyIHN3aXRjaCBpcyBwdXNoZWQgaW4gc2VwYXJhdGVseSB0aHJvdWdoXG5cdCAqIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb24uc2VuZH0ncyBgc3dpdGNoVHJhbnNwb3J0YC5cblx0ICovXG5cdHJlYWRvbmx5IHRyYW5zcG9ydDogQ2xhdWRlVHJhbnNwb3J0O1xuXHRyZWFkb25seSBjYW5Vc2VUb29sOiBOb25OdWxsYWJsZTxPcHRpb25zWydjYW5Vc2VUb29sJ10+O1xuXHRyZWFkb25seSBvbkVsaWNpdGF0aW9uOiBPbkVsaWNpdGF0aW9uO1xuXHRyZWFkb25seSBpc1Jlc3VtZTogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEhvc3Qtc3VwcGxpZWQgY29uY3JldGUgcGVyc2lzdGVuY2UvY29uZmlnIHJlc291cmNlIGZvciB0aGlzIG1hdGVyaWFsaXplXG5cdCAqIG9wZXJhdGlvbi4gVXNlZCB0cmFuc2llbnRseTsgdGhlIHNlc3Npb24gbmV2ZXIgZGVyaXZlcyBpdCBmcm9tIFVSSSBzaGFwZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNvbmZpZ1Jlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdO1xuXHQvKipcblx0ICogV29ya2luZyBkaXJlY3RvcnkgdGhlIGhvc3QgcmVzb2x2ZWQgZm9yIHRoaXMgc2Vzc2lvbidzIGZpcnN0IHNlbmQgKGUuZy4gYW5cblx0ICogaXNvbGF0ZWQgd29ya3RyZWUpLiBXaGVuIHByZXNlbnQgaXQgYmVjb21lcyB0aGUgc2Vzc2lvbidzXG5cdCAqIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb24ud29ya2luZ0RpcmVjdG9yeX0sIG92ZXJyaWRpbmcgdGhlXG5cdCAqIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb24ud29ya3NwYWNlfSB0aGUgc2Vzc2lvbiB3YXMgYmFzZWQgb24uIE9taXR0ZWQgd2hlblxuXHQgKiB0aGUgc2Vzc2lvbiB3b3JrcyBkaXJlY3RseSBpbiBpdHMgYHdvcmtzcGFjZWAgKGZvbGRlciAvIHdvcmtzcGFjZS1sZXNzKS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkk7XG5cdC8qKlxuXHQgKiBUaGUgZnVsbCBvcmRlcmVkIHdvcmtpbmctZGlyZWN0b3J5IHNldCB0aGUgaG9zdCByZXNvbHZlZCBmb3IgdGhpcyBzZXNzaW9uJ3Ncblx0ICogZmlyc3Qgc2VuZCAoaW5kZXggMCA9IHRoZSByZXNvbHZlZCBwcm9jZXNzIHJvb3QsIGUuZy4gYSB3b3JrdHJlZTsgMS4uTiA9XG5cdCAqIGFkZGl0aW9uYWwgZGlyZWN0b3JpZXMpLiBXaGVuIHByZXNlbnQgaXQgcmVwbGFjZXMgYm90aCB0aGUgcHJpbWFyeVxuXHQgKiAoe0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9KSBhbmQgdGhlIHNlc3Npb24ncyBhZGRpdGlvbmFsLWRpcmVjdG9yeSB0YWlsLlxuXHQgKiBUYWtlcyBwcmVjZWRlbmNlIG92ZXIge0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9OyB0aGUgbGF0dGVyIGlzIGtlcHQgZm9yXG5cdCAqIHNpbmdsZS1yb290IGNhbGxlcnMgdGhhdCBvbmx5IHJlc29sdmUgdGhlIHByaW1hcnkuIE9taXR0ZWQgd2hlbiB0aGUgaG9zdFxuXHQgKiBkaWQgbm90IHJlc29sdmUgYSBzZXQgKGZvbGRlciAvIHdvcmtzcGFjZS1sZXNzIHNpbmdsZS1yb290IHNlc3Npb25zKS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdO1xuXHQvKipcblx0ICogQWdlbnQgaG9zdCdzIHNlcnZlci10b29sIGhvc3QuIFdoZW4gcHJlc2VudCwgdGhlIHNlc3Npb24gZXhwb3NlcyB0aGVcblx0ICogYWdlbnQgaG9zdCdzIHNlcnZlciB0b29scyAoZmVlZGJhY2sgXCJjb21tZW50c1wiIHRvZGF5LCBtb3JlIGluIHRoZSBmdXR1cmUpXG5cdCAqIGFzIGFuIGluLXByb2Nlc3MgTUNQIHNlcnZlciBhbmQgYWR2ZXJ0aXNlcyB0aGVtIGFzIHNlcnZlciB0b29scy4gT21pdHRlZFxuXHQgKiBieSBwcm92aWRlcnMgdGhhdCBkb24ndCBzdXBwb3J0IHNlcnZlci1zaWRlIHRvb2xzLlxuXHQgKi9cblx0cmVhZG9ubHkgc2VydmVyVG9vbEhvc3Q/OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUN1cnJlbnRQZXJtaXNzaW9uTW9kZShcblx0Y29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRyZXNvdXJjZTogVVJJLFxuXHRpbmhlcml0ZWRQZXJtaXNzaW9uTW9kZTogQ2xhdWRlUGVybWlzc2lvbk1vZGUgfCB1bmRlZmluZWQsXG5cdHBlcm1pc3Npb25Nb2RlRmFsbGJhY2s6IENsYXVkZVBlcm1pc3Npb25Nb2RlLFxuKTogQ2xhdWRlUGVybWlzc2lvbk1vZGUge1xuXHRyZXR1cm4gcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCByZXNvdXJjZSkgPz8gaW5oZXJpdGVkUGVybWlzc2lvbk1vZGUgPz8gcGVybWlzc2lvbk1vZGVGYWxsYmFjaztcbn1cblxuLyoqXG4gKiBQZXItU0RLLWNvbnZlcnNhdGlvbiBjb29yZGluYXRvci4gT3duczpcbiAqICAgXHUyMDIyIFNESyBpZGVudGl0eSwgZXhhY3QgY2hhdCBjaGFubmVsLCB3b3Jrc3BhY2UsIGFuZCB3b3JraW5nIGRpcmVjdG9yaWVzLlxuICogICBcdTIwMjIgVGhlIHtAbGluayBDbGF1ZGVTZGtQaXBlbGluZX0gdGhhdCBkcml2ZXMgdGhlIFNESyBRdWVyeSBsaWZlY3ljbGVcbiAqICAgICBhbmQgZW1pdHMgZXZlcnkge0BsaW5rIEFnZW50U2lnbmFsfSBmb3IgdGhpcyBzZXNzaW9uIChyb3V0ZXItXG4gKiAgICAgbWFwcGVkIHBlci1tZXNzYWdlIHNpZ25hbHMgcGx1cyBgQ2hhdFR1cm5Db21wbGV0ZWAgYW5kXG4gKiAgICAgYHN0ZWVyaW5nX2NvbnN1bWVkYCkuXG4gKiAgIFx1MjAyMiBQZW5kaW5nLXBlcm1pc3Npb24gYW5kIHBlbmRpbmctdXNlci1pbnB1dCByZWdpc3RyaWVzIChQaGFzZSA3KSxcbiAqICAgICBzdXJmYWNlZCB2aWEgYHJlcXVlc3RQZXJtaXNzaW9uYCAvIGByZXF1ZXN0VXNlcklucHV0YC5cbiAqL1xuZXhwb3J0IGNsYXNzIENsYXVkZUFnZW50U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9ob3N0SW5zdHJ1Y3Rpb25zOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9waXBlbGluZTogQ2xhdWRlU2RrUGlwZWxpbmUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NoYXRDaGFubmVsVXJpOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21jcEVuYWJsZW1lbnRTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgX2xhc3RSZWNvbmNpbGVkTWNwRW5hYmxlbWVudDogUmVhZG9ubHlNYXA8c3RyaW5nLCBib29sZWFuPiB8IHVuZGVmaW5lZDtcblxuXHRnZXQgY2hhdENoYW5uZWxVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdENoYW5uZWxVcmk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBfY29uZmlndXJhdGlvblJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5wYXJzZShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHRoaXMuX2NoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCkpKTtcblx0fVxuXG5cdGJpbmRDaGF0Q2hhbm5lbChjaGF0Q2hhbm5lbFVyaTogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNQaXBlbGluZVJlYWR5ICYmIHRoaXMuX2NoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCkgIT09IGNoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlYmluZCBtYXRlcmlhbGl6ZWQgQ2xhdWRlIHNlc3Npb24gJHt0aGlzLnNlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fY2hhdENoYW5uZWxVcmkgPSBjaGF0Q2hhbm5lbFVyaTtcblx0fVxuXG5cdHByaXZhdGUgX2hvc3RDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW107XG5cblx0LyoqIFByZS1tYXRlcmlhbGl6ZSBtb2RlbCBzZWxlY3Rpb24uIE11dGFibGU7IGZsb3dzIGludG8gYE9wdGlvbnMubW9kZWxgIG9uIGZpcnN0IGluc3RhbGxQaXBlbGluZS4gKi9cblx0cHJpdmF0ZSBfcHJvdmlzaW9uYWxNb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBQcmUtbWF0ZXJpYWxpemUgY3VzdG9tLWFnZW50IHNlbGVjdGlvbi4gTXV0YWJsZTsgZmxvd3MgaW50b1xuXHQgKiBgT3B0aW9ucy5hZ2VudGAgKHJlc29sdmVkIHRvIHRoZSBTREsgYWdlbnQgbmFtZSkgb24gbWF0ZXJpYWxpemVcblx0ICogYW5kIG9uIGV2ZXJ5IHJlbWF0ZXJpYWxpemVyIGNhbGwuIE1pZC1zZXNzaW9uIGNoYW5nZXMgdmlhXG5cdCAqIHtAbGluayBzZXRBZ2VudH0gZmxpcCB7QGxpbmsgY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmfSBkaXJ0eSBzbyB0aGVcblx0ICogbmV4dCBgc2VuZCgpYCByZWJpbmRzIGFuZCB0aGUgbmV3IGFnZW50IHJlYWNoZXMgdGhlIFNESyBvbiB0aGVcblx0ICogcmVidWlsdCBgUXVlcnlgLiBUaGUgU0RLJ3MgYE9wdGlvbnMuYWdlbnRgIGlzIGNhcHR1cmVkIGF0IHN0YXJ0dXBcblx0ICogXHUyMDE0IHRoZXJlIGlzIG5vIHJ1bnRpbWUgY29udHJvbC1wbGFuZSBlcXVpdmFsZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJvdmlzaW9uYWxBZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdC8qKiBQcmUtbWF0ZXJpYWxpemUgYElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLmNvbmZpZ2AgYmFnLiBSZWFkIGF0IG1hdGVyaWFsaXplIHRpbWUuICovXG5cdHJlYWRvbmx5IHByb3Zpc2lvbmFsQ29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlc29sdmVkIHByb2plY3QgbWV0YWRhdGEgY2FwdHVyZWQgYXQgY3JlYXRlIHRpbWUgKGlmIGFueSkuICovXG5cdHJlYWRvbmx5IHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZDtcblx0LyoqIEFsd2F5cy1wcmVzZW50IGFib3J0IGNvbnRyb2xsZXI7IHdpcmVkIGludG8gYE9wdGlvbnMuYWJvcnRDb250cm9sbGVyYCBhdCBtYXRlcmlhbGl6ZSB0aW1lLiAqL1xuXHRyZWFkb25seSBhYm9ydENvbnRyb2xsZXI6IEFib3J0Q29udHJvbGxlcjtcblxuXHQvKipcblx0ICogVGhlIGFjdHVhbCBkaXJlY3Rvcnkgd29yayBpcyBkb25lIGluLiBEZWZhdWx0cyB0byB7QGxpbmsgd29ya3NwYWNlfSB1bnRpbFxuXHQgKiB0aGUgaG9zdCBoYW5kcyB0aGUgc2Vzc2lvbiBhIHJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5IChlLmcuIGFuIGlzb2xhdGVkXG5cdCAqIHdvcmt0cmVlKSBhdCB7QGxpbmsgbWF0ZXJpYWxpemV9IHRpbWUuIGB1bmRlZmluZWRgIG9ubHkgd2hlbiB0aGUgc2Vzc2lvbiBpc1xuXHQgKiB3b3Jrc3BhY2UtbGVzcyBhbmQgaGFzIG5vIHJlc29sdmVkIGRpcmVjdG9yeSB5ZXQuXG5cdCAqL1xuXHRnZXQgd29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nRGlyZWN0b3J5ID8/IHRoaXMud29ya3NwYWNlO1xuXHR9XG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIGFkZGl0aW9uYWwgKG5vbi1wcmltYXJ5KSB3b3JraW5nIGRpcmVjdG9yaWVzIHRoaXMgc2Vzc2lvbidzIGFnZW50IGlzXG5cdCAqIGdyYW50ZWQgdG9vbCBhY2Nlc3MgdG8sIGluIG9yZGVyICh0aGV5IGZvbGxvdyBpbmRleCAwID0gdGhlIHByaW1hcnlcblx0ICoge0BsaW5rIHdvcmtpbmdEaXJlY3Rvcnl9KS4gV29ya3NwYWNlLWZvbGRlciByZWNvbmNpbGlhdGlvbiBjYW4gcmVwbGFjZVxuXHQgKiB0aGlzIHRhaWw7IHRoZSBhcHBsaWVkIHNuYXBzaG90IGFkdmFuY2VzIG9ubHkgYWZ0ZXIgdGhlIHJlYnVpbHQgcXVlcnkgYW5kXG5cdCAqIGl0cyBjb2xkLXJlc3VtZSBtZXRhZGF0YSBib3RoIHN1Y2NlZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9kZXNpcmVkQWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXTtcblx0cHJpdmF0ZSBfYXBwbGllZEFkZGl0aW9uYWxEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW107XG5cblx0LyoqXG5cdCAqIFRoZSBmdWxsIG9yZGVyZWQgd29ya2luZy1kaXJlY3Rvcnkgc2V0IChpbmRleCAwID0gcHJpbWFyeSwgMS4uTiA9XG5cdCAqIGRlc2lyZWQgYWRkaXRpb25hbCByb290cykuIGB1bmRlZmluZWRgIG9ubHkgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm9cblx0ICogcmVzb2x2ZWQgcHJpbWFyeSB5ZXQgKHdvcmtzcGFjZS1sZXNzLCBwcmUtbWF0ZXJpYWxpemUpLlxuXHQgKi9cblx0Z2V0IHdvcmtpbmdEaXJlY3RvcmllcygpOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcHJpbWFyeSA9IHRoaXMud29ya2luZ0RpcmVjdG9yeTtcblx0XHRyZXR1cm4gcHJpbWFyeSA/IFtwcmltYXJ5LCAuLi50aGlzLl9kZXNpcmVkQWRkaXRpb25hbERpcmVjdG9yaWVzXSA6IHVuZGVmaW5lZDtcblx0fVxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uV2F0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdC8qKiBFeHBvc2VkIGZvciB0aGUgbWF0ZXJpYWxpemVyJ3MgTUNQLXNlcnZlciBidWlsZCBjbG9zdXJlLiAqL1xuXHRnZXQgcGVuZGluZ0NsaWVudFRvb2xDYWxscygpOiBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PENhbGxUb29sUmVzdWx0PiB7IHJldHVybiB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzOyB9XG5cdC8qKiBTbmFwc2hvdCBvZiBwZXJtaXNzaW9uLW1vZGUgZmFsbGJhY2sgdXNlZCB3aGVuIGxpdmUgcmVhZCBpcyB1bmRlZmluZWQuICovXG5cdGdldCBwZXJtaXNzaW9uTW9kZUZhbGxiYWNrKCk6IENsYXVkZVBlcm1pc3Npb25Nb2RlIHsgcmV0dXJuIHRoaXMuX3Blcm1pc3Npb25Nb2RlRmFsbGJhY2s7IH1cblx0cHJpdmF0ZSBfaW5oZXJpdGVkUGVybWlzc2lvbk1vZGU6IENsYXVkZVBlcm1pc3Npb25Nb2RlIHwgdW5kZWZpbmVkO1xuXG5cdHN0YXRpYyBjcmVhdGVQcm92aXNpb25hbChcblx0XHRzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRjaGF0Q2hhbm5lbFVyaTogVVJJLFxuXHRcdHdvcmtzcGFjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZCxcblx0XHRtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0YWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0cGVuZGluZ0NsaWVudFRvb2xDYWxsczogUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDYWxsVG9vbFJlc3VsdD4sXG5cdFx0cGVybWlzc2lvbk1vZGVGYWxsYmFjazogQ2xhdWRlUGVybWlzc2lvbk1vZGUsXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdID0gW10sXG5cdCk6IENsYXVkZUFnZW50U2Vzc2lvbiB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2xhdWRlQWdlbnRTZXNzaW9uLFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0Y2hhdENoYW5uZWxVcmksXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRwcm9qZWN0LFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRhZ2VudCxcblx0XHRcdGNvbmZpZyxcblx0XHRcdG5ldyBBYm9ydENvbnRyb2xsZXIoKSxcblx0XHRcdHBlbmRpbmdDbGllbnRUb29sQ2FsbHMsXG5cdFx0XHRuZXcgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZigpLFxuXHRcdFx0cGVybWlzc2lvbk1vZGVGYWxsYmFjayxcblx0XHRcdGFkZGl0aW9uYWxEaXJlY3Rvcmllcyxcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDEyIFx1MjAxNCBwZXItc2Vzc2lvbiByZWdpc3RyeSBvZiBUYXNrIHRvb2wgY2FsbHMgdGhhdCBzcGF3blxuXHQgKiBzdWJhZ2VudHMgKGBTdWJhZ2VudFNwYXduYCByZWNvcmRzIGtleWVkIGJ5IGB0b29sX3VzZV9pZGAsIHBsdXMgYVxuXHQgKiByZXZlcnNlIGluZGV4IGZyb20gaW5uZXIgYHRvb2xfdXNlX2lkYCB0byBpdHMgcGFyZW50IFRhc2spLiBPd25lZFxuXHQgKiBoZXJlIHNvIHRoZSByZWdpc3RyeSBkaWVzIHdpdGggdGhlIHNlc3Npb247IGNvbnN1bWVycyBpbiB0aGUgbGl2ZVxuXHQgKiBtYXBwZXIgKGBDbGF1ZGVTZGtNZXNzYWdlUm91dGVyYCAvIGBjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzYCAvXG5cdCAqIGBjbGF1ZGVTdWJhZ2VudFNpZ25hbHNgKSBhbmQgdGhlIGBjYW5Vc2VUb29sYCBicmlkZ2UgcmVhZCBmcm9tXG5cdCAqIHRoZSBzYW1lIGluc3RhbmNlIHZpYSB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHJlYWRvbmx5IHN1YmFnZW50czogU3ViYWdlbnRSZWdpc3RyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXG5cdC8qKlxuXHQgKiBQaGFzZSA3IC8gUzMuMi4gVG9vbC1wZXJtaXNzaW9uIGRlZmVycmVkcyBwYXJrZWQgaW5zaWRlXG5cdCAqIHtAbGluayBPcHRpb25zLmNhblVzZVRvb2x9LiBLZXllZCBieSBTREsgYHRvb2xfdXNlX2lkYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdQZXJtaXNzaW9ucyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PGJvb2xlYW4+KCk7XG5cblx0LyoqXG5cdCAqIFBoYXNlIDcgLyBTMy4yLiBVc2VyLWlucHV0IGRlZmVycmVkcyBwYXJrZWQgZm9yIGludGVyYWN0aXZlIHRvb2xzXG5cdCAqIChgQXNrVXNlclF1ZXN0aW9uYCwgYEV4aXRQbGFuTW9kZWApLiBLZXllZCBieSBgQ2hhdElucHV0UmVxdWVzdC5pZGAuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVXNlcklucHV0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfT4oKTtcblxuXHQvKipcblx0ICogUGhhc2UgMTAgXHUyMDE0IG93bnMgdGhlIHdvcmtiZW5jaC1yZWdpc3RlcmVkIGNsaWVudC10b29sIHNuYXBzaG90XG5cdCAqICh2aWEge0BsaW5rIFNlc3Npb25DbGllbnRUb29sc0RpZmYubW9kZWx9KSBwbHVzIHRoZVxuXHQgKiBcImNoYW5nZWQgc2luY2UgbGFzdCBzdWNjZXNzZnVsIGJ1aWxkXCIgZGlydHkgYml0LiBSZWFkIGJ5IHRoZVxuXHQgKiBhZ2VudCdzIHNlbmRNZXNzYWdlIGRpZmYgY2hlY2s7IHVzZWQgYnkgdGhlIG1hdGVyaWFsaXplIC9cblx0ICogcmVtYXRlcmlhbGl6ZXIgZmxvdyB0byBwaW4gdGhlIFNESyBidWlsZCBhZ2FpbnN0IGEgc3BlY2lmaWNcblx0ICogc25hcHNob3QuIFNlZSB7QGxpbmsgU2Vzc2lvbkNsaWVudFRvb2xzRGlmZn0gZm9yIHRoZSBDNiByYWNlXG5cdCAqIHNlbWFudGljcyB0aGlzIGNvbGxhYm9yYXRvciBlbmZvcmNlcy5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xEaWZmOiBTZXNzaW9uQ2xpZW50VG9vbHNEaWZmO1xuXG5cdC8qKlxuXHQgKiBQaGFzZSAxMSBcdTIwMTQgcGVyLXNlc3Npb24gKipjbGllbnQtcHVzaGVkKiogc3luY2VkIGN1c3RvbWl6YXRpb25cblx0ICogc25hcHNob3QgKyBlbmFibGVtZW50IG1hcC4gT3ducyB0aGUgd29ya2JlbmNoLXN1cHBsaWVkXG5cdCAqIHtAbGluayBJU3luY2VkQ3VzdG9taXphdGlvbn0gbGlzdCwgdGhlIHBlci1VUkkgZW5hYmxlbWVudCBiaXRzLFxuXHQgKiBhbmQgdGhlIGRpcnR5IGZsYWcgZHJhaW5lZCBhdCB0aGUgbmV4dCB7QGxpbmsgc2VuZH0gcHJlLWZsaWdodC5cblx0ICogRXhpc3RzIGZyb20gYGNyZWF0ZVByb3Zpc2lvbmFsYCBvbndhcmQgc28gY2xpZW50LXNpZGUgcmVhZHMgL1xuXHQgKiB0b2dnbGVzIHdvcmsgdW5pZm9ybWx5IGJlZm9yZSBhbmQgYWZ0ZXIgbWF0ZXJpYWxpemUuXG5cdCAqXG5cdCAqIFNlcnZlci1zaWRlIChTREstZGlzY292ZXJlZCkgY3VzdG9taXphdGlvbnMgYXJlIE5PVCBzdG9yZWQgaGVyZVxuXHQgKiBcdTIwMTQgdGhleSdyZSBmZXRjaGVkIG9uIGRlbWFuZCBmcm9tIHRoZSBsaXZlIGBRdWVyeWAgaW5cblx0ICoge0BsaW5rIGdldFNlc3Npb25DdXN0b21pemF0aW9uc30uXG5cdCAqXG5cdCAqIFNlZSB7QGxpbmsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0uXG5cdCAqL1xuXHRyZWFkb25seSBjbGllbnRDdXN0b21pemF0aW9uc0RpZmY6IFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmYgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlc3Npb25Qcm9ncmVzcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFnZW50U2lnbmFsPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZXNzaW9uUHJvZ3Jlc3M6IEV2ZW50PEFnZW50U2lnbmFsPiA9IHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBSZWFsIENvcGlsb3QgY3JlZGl0cyAoaW4gbmFuby1BSVUpIGJpbGxlZCBieSBDQVBJIGZvciB0aGUgY3VycmVudFxuXHQgKiB0dXJuLCBzdW1tZWQgYWNyb3NzIGV2ZXJ5IGAvdjEvbWVzc2FnZXNgIHJlcXVlc3QgdGhlIFNESyBtYWRlXG5cdCAqIChpbmNsdWRpbmcgc3ViYWdlbnRzKS4gRmVkIGJ5IHtAbGluayByZWNvcmRUdXJuQ3JlZGl0c30gZnJvbSB0aGVcblx0ICogcHJveHkncyBgb25EaWRSZXBvcnRDcmVkaXRzYCwgcmVzZXQgYXQgdGhlIHN0YXJ0IG9mIGVhY2gge0BsaW5rIHNlbmR9LFxuXHQgKiBhbmQgYXR0YWNoZWQgdG8gdGhlIHR1cm4ncyBgQ2hhdFVzYWdlYCBzaWduYWwgYnlcblx0ICoge0BsaW5rIF9lbnJpY2hTaWduYWxXaXRoQ3JlZGl0c30uIFVubGlrZSB0aGUgU0RLJ3MgYHRvdGFsX2Nvc3RfdXNkYFxuXHQgKiAoYW4gQW50aHJvcGljLWxpc3QtcHJpY2UgZXN0aW1hdGUpLCB0aGlzIGlzIHdoYXQgQ0FQSSBhY3R1YWxseSBiaWxscy5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRUdXJuTmFub0FpdSA9IDA7XG5cblx0LyoqXG5cdCAqIFRyYW5zcG9ydCB0aGUgc2Vzc2lvbiBtYXRlcmlhbGl6ZWQgdW5kZXIgKFBoYXNlIDE5KS4gRGVmYXVsdHMgdG8gYHByb3h5YFxuXHQgKiB1bnRpbCB7QGxpbmsgbWF0ZXJpYWxpemV9IHJlc29sdmVzIGl0IGZyb20ge0BsaW5rIElNYXRlcmlhbGl6ZUNvbnRleHR9LlxuXHQgKiBHYXRlcyB7QGxpbmsgX2VucmljaFNpZ25hbFdpdGhDcmVkaXRzfSBzbyBuYXRpdmUgdHVybnMgbmV2ZXIgY2FycnkgYVxuXHQgKiBDb3BpbG90IGNyZWRpdHMgb3ZlcmxheSAodGhlIHByb3h5IGlzIHRoZSBvbmx5IGNyZWRpdCBzb3VyY2UpLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhbnNwb3J0S2luZDogQ2xhdWRlVHJhbnNwb3J0WydraW5kJ10gPSAncHJveHknO1xuXG5cdC8qKlxuXHQgKiBTZXQgYnkge0BsaW5rIHNldE1vZGVsfSB3aGVuIGEgbW9kZWwgY2hhbmdlIGNyb3NzZXMgdHJhbnNwb3J0cyAoQ29waWxvdCBcdTIxOTRcblx0ICogbmF0aXZlKSBvbiBhbiBhbHJlYWR5LW1hdGVyaWFsaXplZCBzZXNzaW9uLiBSYXRoZXIgdGhhbiBob3Qtc3dhcHBpbmcgdGhlXG5cdCAqIGxpdmUgc3VicHJvY2VzcyAod2hpY2ggc3RheXMgb24gdGhlIG9sZCB0cmFuc3BvcnQpLCB0aGUgc3dpdGNoIGlzIGRlZmVycmVkOlxuXHQgKiB0aGUgZmxhZyBtYWtlcyB0aGUgbmV4dCB7QGxpbmsgc2VuZH0gcHJlLWZsaWdodCByZWJpbmQuIFRoZSBhZ2VudCByZXNvbHZlc1xuXHQgKiB0aGUgbmV3IHRyYW5zcG9ydCBhdCBzZW5kIHRpbWUgYW5kIGhhbmRzIGl0IGluIHZpYSBgc3dpdGNoVHJhbnNwb3J0YCAoa2VwdFxuXHQgKiBpbiB7QGxpbmsgX3BlbmRpbmdTd2l0Y2hUcmFuc3BvcnR9KTsgdGhlIHJlbWF0ZXJpYWxpemVyIHJlYnVpbGRzIG9udG8gaXQgYW5kXG5cdCAqIGNsZWFycyBib3RoIG9uIHN1Y2Nlc3MuIEEgZmFpbGVkIHJlYnVpbGQgbGVhdmVzIHRoZW0gc2V0IHNvIHRoZSBmb2xsb3dpbmdcblx0ICogc2VuZCByZXRyaWVzLiBFeHBvc2VkIHZpYSB7QGxpbmsgaGFzUGVuZGluZ1RyYW5zcG9ydFN3aXRjaH0gc28gdGhlIGFnZW50XG5cdCAqIHJlc29sdmVzIGEgdHJhbnNwb3J0IG9ubHkgd2hlbiBvbmUgaXMgYWN0dWFsbHkgcGVuZGluZy5cblx0ICovXG5cdHByaXZhdGUgX3BlbmRpbmdUcmFuc3BvcnRTd2l0Y2ggPSBmYWxzZTtcblxuXHQvKipcblx0ICogVGhlIHRyYW5zcG9ydCB0aGUgYWdlbnQgcmVzb2x2ZWQgZm9yIGEgcGVuZGluZyB7QGxpbmsgX3BlbmRpbmdUcmFuc3BvcnRTd2l0Y2h9LFxuXHQgKiBwdXNoZWQgaW4gdGhyb3VnaCB7QGxpbmsgc2VuZH0ncyBgc3dpdGNoVHJhbnNwb3J0YCBhdCBzZW5kIHRpbWUgKHdoZW4gdGhlXG5cdCAqIGxpdmUgcHJveHkgaGFuZGxlIGlzIGN1cnJlbnQgYW5kIGEgc2lnbmVkLW91dCBwcm94eSBzd2l0Y2ggdGhyb3dzKS4gQ29uc3VtZWRcblx0ICogYnkgdGhlIG5leHQgcmVidWlsZCBpbiBwcmVmZXJlbmNlIHRvIHtAbGluayBfbWF0ZXJpYWxpemVkVHJhbnNwb3J0fSwgdGhlblxuXHQgKiBjbGVhcmVkIG9uY2UgdGhlIG5ldyBzdWJwcm9jZXNzIGlzIGxpdmUuIGB1bmRlZmluZWRgIGJldHdlZW4gdGhlIGRlZmVycmluZ1xuXHQgKiB7QGxpbmsgc2V0TW9kZWx9IGFuZCB0aGUgc2VuZCB0aGF0IHN1cHBsaWVzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVuZGluZ1N3aXRjaFRyYW5zcG9ydDogQ2xhdWRlVHJhbnNwb3J0IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBUaGUgZnVsbCB0cmFuc3BvcnQgKGtpbmQgKyBhbnkgbGl2ZSBwcm94eSBoYW5kbGUpIHRoYXQgYmFja3MgdGhlIGN1cnJlbnRcblx0ICoge0BsaW5rIF90cmFuc3BvcnRLaW5kfSwgY2FwdHVyZWQgdGhlIGxhc3QgdGltZSB7QGxpbmsgbWF0ZXJpYWxpemV9IG9yIHRoZVxuXHQgKiByZW1hdGVyaWFsaXplciBhY3R1YWxseSBidWlsdCB0aGUgc3VicHJvY2Vzcy4gT3JkaW5hcnkgcmVidWlsZHMgKGEgdG9vbCAvXG5cdCAqIGN1c3RvbWl6YXRpb24gZGlmZiwgYSByZXN1bWUpIHJldXNlIGl0IHZlcmJhdGltIHNvIGEgcnVudGltZSBmbGlwIG9mIHRoZVxuXHQgKiBob3N0IGRlZmF1bHQgdHJhbnNwb3J0IFx1MjAxNCBlLmcuIGEgY29uZmlnIGNoYW5nZSBvciBhIENvcGlsb3Qgc2lnbi1pbiBtdXRhdGluZ1xuXHQgKiB0aGUgYWdlbnQncyBsaXZlIHRyYW5zcG9ydCBtb2RlIFx1MjAxNCBuZXZlciByZXJvdXRlcyB0aGUgbGl2ZSBjb252ZXJzYXRpb24uIE9ubHlcblx0ICogYSBkZWxpYmVyYXRlIHtAbGluayBfcGVuZGluZ1N3aXRjaFRyYW5zcG9ydH0gcmVidWlsZHMgb250byBhIGZyZXNobHlcblx0ICogcmVzb2x2ZWQgdHJhbnNwb3J0OyB0aGlzIHBpbiBrZWVwcyBvcmRpbmFyeSByZWJ1aWxkcyBvbiB0aGUgdHJhbnNwb3J0IGZpeGVkXG5cdCAqIGF0IG1hdGVyaWFsaXplLCBuZXZlciByZS1kZXJpdmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfbWF0ZXJpYWxpemVkVHJhbnNwb3J0OiBDbGF1ZGVUcmFuc3BvcnQgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEFjY3VtdWxhdGUgcHJveHktcmVwb3J0ZWQgYmlsbGVkIGNyZWRpdHMgZm9yIHRoZSBpbi1mbGlnaHQgdHVybi5cblx0ICogQ2FsbGVkIGZyb20ge0BsaW5rIENsYXVkZUFnZW50fSBmb3IgZXZlcnkgcHJveHkgYG9uRGlkUmVwb3J0Q3JlZGl0c2Bcblx0ICogcm91dGVkIHRvIHRoaXMgc2Vzc2lvbi4gSWdub3JlcyBub24tcG9zaXRpdmUgLyBub24tZmluaXRlIHZhbHVlcy5cblx0ICovXG5cdHJlY29yZFR1cm5DcmVkaXRzKHRvdGFsTmFub0FpdTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKE51bWJlci5pc0Zpbml0ZSh0b3RhbE5hbm9BaXUpICYmIHRvdGFsTmFub0FpdSA+IDApIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuTmFub0FpdSArPSB0b3RhbE5hbm9BaXU7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEluamVjdCB0aGUgdHVybidzIGFjY3VtdWxhdGVkIENvcGlsb3QgY3JlZGl0cyBpbnRvIGl0cyBgQ2hhdFVzYWdlYFxuXHQgKiBzaWduYWwgYXMgYF9tZXRhLmNvcGlsb3RVc2FnZS50b3RhbE5hbm9BaXVgIFx1MjAxNCB0aGUgd2VsbC1rbm93biBrZXkgdGhlXG5cdCAqIHdvcmtiZW5jaCBwcmVmZXJzIG92ZXIgYF9tZXRhLmNvc3RgIHdoZW4gcmVuZGVyaW5nIHBlci10dXJuIGNyZWRpdHMuXG5cdCAqIEFsbCBvdGhlciBzaWduYWxzIHBhc3MgdGhyb3VnaCB1bnRvdWNoZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnJpY2hTaWduYWxXaXRoQ3JlZGl0cyhzaWduYWw6IEFnZW50U2lnbmFsKTogQWdlbnRTaWduYWwge1xuXHRcdGlmICh0aGlzLl90cmFuc3BvcnRLaW5kICE9PSAncHJveHknIHx8IHNpZ25hbC5raW5kICE9PSAnYWN0aW9uJyB8fCBzaWduYWwuYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFVzYWdlIHx8IHRoaXMuX2N1cnJlbnRUdXJuTmFub0FpdSA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gc2lnbmFsO1xuXHRcdH1cblx0XHRjb25zdCB1c2FnZSA9IHNpZ25hbC5hY3Rpb24udXNhZ2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnNpZ25hbCxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHQuLi5zaWduYWwuYWN0aW9uLFxuXHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdC4uLnVzYWdlLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHQuLi51c2FnZS5fbWV0YSxcblx0XHRcdFx0XHRcdGNvcGlsb3RVc2FnZTogeyB0b3RhbE5hbm9BaXU6IHRoaXMuX2N1cnJlbnRUdXJuTmFub0FpdSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogU3RhbXBzIHRoZSBNQ1Age0BsaW5rIFRvb2xDYWxsQ29udHJpYnV0b3J9IG9udG8gYSBgQ2hhdFRvb2xDYWxsU3RhcnRgIGZvclxuXHQgKiBhbiBleHRlcm5hbCBgbWNwX188c2VydmVyPl9fPHRvb2w+YCBjYWxsLCByZXNvbHZlZCBmcm9tIHRoaXMgc2Vzc2lvbidzXG5cdCAqIGNhY2hlZCBjdXN0b21pemF0aW9uIHNuYXBzaG90LiBPd25lZCBoZXJlIGJlY2F1c2UgdGhlIHNlc3Npb24gb3ducyB0aGVcblx0ICogY3VzdG9taXphdGlvbiBkYXRhOyB0aGUgc3RyZWFtIG1hcHBlciBzdGF5cyBmcmVlIG9mIGl0LiAoVGhlIGluLXByb2Nlc3Ncblx0ICogYG1jcF9fY2xpZW50X19gIHNlcnZlciBhbHJlYWR5IGNhcnJpZXMgYSBDbGllbnQgY29udHJpYnV0b3IgZnJvbSB0aGUgbWFwcGVyLilcblx0ICovXG5cdHByaXZhdGUgX2VucmljaFNpZ25hbFdpdGhNY3BDb250cmlidXRvcihzaWduYWw6IEFnZW50U2lnbmFsKTogQWdlbnRTaWduYWwge1xuXHRcdGlmIChzaWduYWwua2luZCAhPT0gJ2FjdGlvbicgfHwgc2lnbmFsLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0IHx8IHNpZ25hbC5hY3Rpb24uY29udHJpYnV0b3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbE5hbWUgPSBzaWduYWwuYWN0aW9uLnRvb2xOYW1lO1xuXHRcdGlmICghdG9vbE5hbWUuc3RhcnRzV2l0aCgnbWNwX18nKSkge1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IHRvb2xOYW1lLnNwbGl0KCdfXycpWzFdO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25JZCA9IHNlcnZlck5hbWUgPyBmaW5kTWNwQ2hpbGRJZCh0aGlzLl9sYXN0Q3VzdG9taXphdGlvbnMsIHNlcnZlck5hbWUpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChjdXN0b21pemF0aW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHNpZ25hbDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgLi4uc2lnbmFsLCBhY3Rpb246IHsgLi4uc2lnbmFsLmFjdGlvbiwgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQgfSB9IH07XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRjaGF0Q2hhbm5lbFVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IHdvcmtzcGFjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHByb2plY3Q6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB8IHVuZGVmaW5lZCxcblx0XHRtb2RlbDogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0YWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0YWJvcnRDb250cm9sbGVyOiBBYm9ydENvbnRyb2xsZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NsaWVudFRvb2xDYWxsczogUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDYWxsVG9vbFJlc3VsdD4sXG5cdFx0dG9vbERpZmY6IFNlc3Npb25DbGllbnRUb29sc0RpZmYsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGVybWlzc2lvbk1vZGVGYWxsYmFjazogQ2xhdWRlUGVybWlzc2lvbk1vZGUsXG5cdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdE9UZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX290ZWxTZXJ2aWNlOiBJQWdlbnRIb3N0T1RlbFNlcnZpY2UsXG5cdFx0QElDbGF1ZGVBZ2VudFNka1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2RrU2VydmljZTogSUNsYXVkZUFnZW50U2RrU2VydmljZSxcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NoYXRDaGFubmVsVXJpID0gY2hhdENoYW5uZWxVcmk7XG5cdFx0dGhpcy5wcm9qZWN0ID0gcHJvamVjdDtcblx0XHR0aGlzLl9wcm92aXNpb25hbE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fcHJvdmlzaW9uYWxBZ2VudCA9IGFnZW50O1xuXHRcdHRoaXMucHJvdmlzaW9uYWxDb25maWcgPSBjb25maWc7XG5cdFx0dGhpcy5hYm9ydENvbnRyb2xsZXIgPSBhYm9ydENvbnRyb2xsZXI7XG5cdFx0dGhpcy5fZGVzaXJlZEFkZGl0aW9uYWxEaXJlY3RvcmllcyA9IGFkZGl0aW9uYWxEaXJlY3Rvcmllcztcblx0XHR0aGlzLl9hcHBsaWVkQWRkaXRpb25hbERpcmVjdG9yaWVzID0gYWRkaXRpb25hbERpcmVjdG9yaWVzO1xuXHRcdHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucyA9IFtdO1xuXHRcdHRoaXMudG9vbERpZmYgPSB0aGlzLl9yZWdpc3Rlcih0b29sRGlmZik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKCFldmVudC5zZXNzaW9ucy5pbmNsdWRlcyh0aGlzLl9jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZS5maXJlKCk7XG5cdFx0XHRpZiAodGhpcy5fcGlwZWxpbmUpIHtcblx0XHRcdFx0dGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCh0cnVlKS5jYXRjaChlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCBgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlY29uY2lsZSBNQ1AgZW5hYmxlbWVudCBhZnRlciBjdXN0b21pemF0aW9ucyBjaGFuZ2VkYCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dhdGNoQ3VzdG9taXphdGlvbnModGhpcy53b3JraW5nRGlyZWN0b3JpZXMpO1xuXHR9XG5cblx0c2V0SG9zdEN1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgX3dhdGNoQ3VzdG9taXphdGlvbnMoZGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgd2F0Y2hlciA9IHN0b3JlLmFkZChuZXcgQ2xhdWRlQ3VzdG9taXphdGlvbldhdGNoZXIoXG5cdFx0XHRkaXJlY3Rvcmllcyxcblx0XHRcdHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZSxcblx0XHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmZpcmUoKSkpO1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25XYXRjaGVyLnZhbHVlID0gc3RvcmU7XG5cdH1cblxuXHQvKipcblx0ICogT25lLXNob3QgU0RLIGFzc2lzdGFudC1tZXNzYWdlIHV1aWQgdGhhdCB0aGUgbmV4dCBtYXRlcmlhbGl6ZSAvIHJlYnVpbGRcblx0ICogcmVzdW1lcyAqdXAgdG8gYW5kIGluY2x1ZGluZyogKHRoZSBTREsncyBgT3B0aW9ucy5yZXN1bWVTZXNzaW9uQXRgKS5cblx0ICogU3RhZ2VkIGJ5IHtAbGluayB0cnVuY2F0ZVRvVHVybn07IHJlYWQgYnkgdGhlIG5leHQgYnVpbGQgYW5kIGNsZWFyZWRcblx0ICogb25seSBvbmNlIHRoYXQgYnVpbGQgKnN1Y2NlZWRzKiAoc28gYSB0aHJvd24gLyBjYW5jZWxsZWQgcmVidWlsZCBrZWVwc1xuXHQgKiB0aGUgYW5jaG9yIHN0YWdlZCBhbmQgdGhlIG5leHQgc2VuZCByZXRyaWVzIHRoZSB0cnVuY2F0aW9uIHJhdGhlciB0aGFuXG5cdCAqIHNpbGVudGx5IHByb2NlZWRpbmcgd2l0aG91dCBpdCBhbmQgdW5kb2luZyB0aGUgY2hlY2twb2ludCByZXN0b3JlKS5cblx0ICovXG5cdHByaXZhdGUgX3BlbmRpbmdSZXN1bWVTZXNzaW9uQXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogSW4tcGxhY2UgdHJ1bmNhdGlvbiB0byBgdHVybklkYCAoXCJSZXN0b3JlIENoZWNrcG9pbnRcIik6IHBydW5lIHRoZVxuXHQgKiBwZXItdHVybiBEQiByb3dzIChmaWxlIGVkaXRzLCBjaGVja3BvaW50IHJlZnMpIHBhc3QgdGhlIGJvdW5kYXJ5IEFORFxuXHQgKiBzdGFnZSB0aGUgU0RLIHJlc3VtZSBhbmNob3IgdGhhdCB0aGUgbmV4dCByZWJ1aWxkIGFwcGxpZXMgdmlhXG5cdCAqIGBPcHRpb25zLnJlc3VtZVNlc3Npb25BdGAuIFRoZXNlIHR3byBoYWx2ZXMgYXJlIG9uZSBpbnZhcmlhbnQgXHUyMDE0IHBydW5pbmdcblx0ICogd2l0aG91dCBzdGFnaW5nIHRoZSBhbmNob3Igd291bGQgZHJvcCBEQiByb3dzIHdoaWxlIHRoZSBTREsgc3RpbGxcblx0ICogcmVwbGF5cyB0aGUgdHJ1bmNhdGVkIHR1cm5zOyBzdGFnaW5nIHdpdGhvdXQgcHJ1bmluZyB3b3VsZCBsZWF2ZSBzdGFsZVxuXHQgKiByb3dzIFx1MjAxNCBzbyB0aGV5IGxpdmUgYmVoaW5kIGEgc2luZ2xlIGNhbGwgcmF0aGVyIHRoYW4gdHdvIHRoZSBjYWxsZXJcblx0ICogY291bGQgaGFsZi1pbnZva2UuIFRoZSBwcnVuZSBydW5zIGZpcnN0IGJlY2F1c2UgaXQgaXMgdGhlIGZhbGxpYmxlIGhhbGY6XG5cdCAqIGEgREIgZmFpbHVyZSB0aGVuIHJlamVjdHMgd2l0aG91dCBsZWF2aW5nIGFuIGFuY2hvciBzdGFnZWQgZm9yIHRoZSBuZXh0XG5cdCAqIHR1cm4uIGB0dXJuSWRgIGlzIHRoZSBwcm90b2NvbCB0dXJuIGlkIChEQiBrZXkpOyBgcmVzdW1lQW5jaG9yVXVpZGAgaXNcblx0ICogdGhlIFNESyBhc3Npc3RhbnQtbWVzc2FnZSB1dWlkIHRoZSBhZ2VudCByZXNvbHZlZCBmb3IgaXQuXG5cdCAqL1xuXHRhc3luYyB0cnVuY2F0ZVRvVHVybih0dXJuSWQ6IHN0cmluZywgcmVzdW1lQW5jaG9yVXVpZDogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fd2l0aERhdGFiYXNlKHJlc291cmNlLCBkYiA9PiBkYi5kZWxldGVUdXJuc0FmdGVyKHR1cm5JZCkpO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXN1bWVTZXNzaW9uQXQgPSByZXN1bWVBbmNob3JVdWlkO1xuXHR9XG5cblx0LyoqIFBydW5lcyBhbGwgcGVyLXR1cm4gREIgcm93cyAocmVtb3ZlLWFsbCB0cnVuY2F0aW9uKS4gKi9cblx0YXN5bmMgcHJ1bmVBbGxUdXJucyhyZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fd2l0aERhdGFiYXNlKHJlc291cmNlLCBkYiA9PiBkYi5kZWxldGVBbGxUdXJucygpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSdW5zIGBmbmAgYWdhaW5zdCBhIHNob3J0LWxpdmVkLCByZWYtY291bnRlZCBzZXNzaW9uIERCIGhhbmRsZSBzbyB0aGVcblx0ICogd3JpdGUgaXMgc2FmZSByZWdhcmRsZXNzIG9mIHRoZSBwaXBlbGluZSdzIG93biBkYlJlZiBsaWZlY3ljbGUgKHRoZVxuXHQgKiByZWYtY291bnQga2VlcHMgdGhlIHNoYXJlZCBEQiBhbGl2ZTsgZGlzcG9zaW5nIG9ubHkgZGVjcmVtZW50cykuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93aXRoRGF0YWJhc2UocmVzb3VyY2U6IFVSSSwgZm46IChkYjogSVNlc3Npb25EYXRhYmFzZSkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UocmVzb3VyY2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmbihyZWYub2JqZWN0KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnJpbmcgdGhlIHNlc3Npb24gdXA6IGJ1aWxkIFNESyBgT3B0aW9uc2AsIHN0YXJ0IHRoZSBTREssIG9wZW4gdGhlXG5cdCAqIHNlc3Npb24tc2NvcGVkIERCIHJlZiwgY29uc3RydWN0IHRoZSBwaXBlbGluZSwgYW5kIGF0dGFjaCB0aGVcblx0ICogcmVtYXRlcmlhbGl6ZXIgdXNlZCBmb3IgeWllbGQtcmVzdGFydCAoZS5nLiBhZnRlciBhIGNsaWVudC10b29sXG5cdCAqIHNuYXBzaG90IGNoYW5nZSkuIElkZW1wb3RlbnQgb24gcmUtY2FsbDogZXh0cmEgY2FsbHMgdGhyb3cgcmF0aGVyXG5cdCAqIHRoYW4gc2lsZW50bHkgcmUtbWF0ZXJpYWxpemUuXG5cdCAqXG5cdCAqIElmIHRoZSBzdXBwbGllZCB7QGxpbmsgSU1hdGVyaWFsaXplQ29udGV4dC5wcm94eUhhbmRsZX0ncyB1bmRlcmx5aW5nXG5cdCAqIGBhYm9ydENvbnRyb2xsZXJgIGZpcmVzIHdoaWxlIGBzZGsuc3RhcnR1cCgpYCBpcyBpbiBmbGlnaHQsIHRoZSBTREtcblx0ICogdW53aW5kcyB2aWEgdGhlIGNvbnRyb2xsZXI7IGlmIGBzdGFydHVwYCByZXNvbHZlcyBhbnl3YXksIHRoZVxuXHQgKiBgV2FybVF1ZXJ5YCBpcyBhc3luY0Rpc3Bvc2VkIGFuZCBhIHtAbGluayBDYW5jZWxsYXRpb25FcnJvcn0gaXNcblx0ICogdGhyb3duIChROCBiZWx0LWFuZC1zdXNwZW5kZXJzKS5cblx0ICovXG5cdGFzeW5jIG1hdGVyaWFsaXplKGN0eDogSU1hdGVyaWFsaXplQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9waXBlbGluZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDbGF1ZGVBZ2VudFNlc3Npb24gaXMgYWxyZWFkeSBtYXRlcmlhbGl6ZWQnKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLmluaXRpYWxpemVTZXNzaW9uKHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHQvLyBgY3R4LmN1c3RvbWl6YXRpb25zYCBpcyB0aGUgaG9zdCdzIGxhc3QgcHVibGlzaGVkIHNuYXBzaG90IGZvciB0aGVcblx0XHQvLyBvd25pbmcgc2Vzc2lvbi4gQWJzZW50IG1lYW5zIFwidGhlIGhvc3QgaGFzIHB1Ymxpc2hlZCBub25lIHlldFwiLCB3aGljaFxuXHRcdC8vIGlzIG5vdCB0aGUgc2FtZSBhcyBhbiBlbXB0eSBsaXN0IFx1MjAxNCBrZWVwIHdoYXRldmVyIHdhcyBhbHJlYWR5XG5cdFx0Ly8gcmVjb25jaWxlZCByYXRoZXIgdGhhbiBjbGVhcmluZyBpdC5cblx0XHRpZiAoY3R4LmN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMgPSBjdHguY3VzdG9taXphdGlvbnM7XG5cdFx0fVxuXHRcdC8vIEFkb3B0IHRoZSBob3N0LXJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5IChlLmcuIGFuIGlzb2xhdGVkIHdvcmt0cmVlKVxuXHRcdC8vIGJlZm9yZSBpdCdzIHJlYWQgYmVsb3c7IGZhbGxzIGJhY2sgdG8gdGhlIHNlc3Npb24ncyBgd29ya3NwYWNlYCB3aGVuIHRoZVxuXHRcdC8vIGhvc3QgZGlkbid0IHJlc29sdmUgYSBkZWRpY2F0ZWQgZGlyZWN0b3J5LiBUaGUgcGx1cmFsXG5cdFx0Ly8gYHdvcmtpbmdEaXJlY3Rvcmllc2AgKGluZGV4IDAgPSByZXNvbHZlZCBwcmltYXJ5LCAxLi5OID0gYWRkaXRpb25hbFxuXHRcdC8vIHJvb3RzKSB0YWtlcyBwcmVjZWRlbmNlIGFuZCBhbHNvIHJlZnJlc2hlcyB0aGUgYWRkaXRpb25hbC1kaXJlY3Rvcnlcblx0XHQvLyB0YWlsOyB0aGUgc2luZ3VsYXIgYHdvcmtpbmdEaXJlY3RvcnlgIHN0YXlzIHN1cHBvcnRlZCBmb3Igc2luZ2xlLXJvb3Rcblx0XHQvLyBjYWxsZXJzIHRoYXQgb25seSByZXNvbHZlIHRoZSBwcmltYXJ5LlxuXHRcdGNvbnN0IHByZXZpb3VzV29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0Y29uc3QgcmVzb2x2ZWRQcmltYXJ5ID0gY3R4LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdID8/IGN0eC53b3JraW5nRGlyZWN0b3J5O1xuXHRcdGlmIChyZXNvbHZlZFByaW1hcnkgJiYgIWlzRXF1YWwocmVzb2x2ZWRQcmltYXJ5LCB0aGlzLndvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gcmVzb2x2ZWRQcmltYXJ5O1xuXHRcdH1cblx0XHRpZiAoY3R4LndvcmtpbmdEaXJlY3RvcmllcyAmJiBjdHgud29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2Rlc2lyZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXMgPSBjdHgud29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDEpO1xuXHRcdFx0dGhpcy5fYXBwbGllZEFkZGl0aW9uYWxEaXJlY3RvcmllcyA9IHRoaXMuX2Rlc2lyZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXM7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRXb3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHQvLyBDbGF1ZGUgYWR2ZXJ0aXNlcyBgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXMuaW1tdXRhYmxlUHJpbWFyeWAsIHNvIGl0c1xuXHRcdC8vIHByb2Nlc3Mgcm9vdCBpcyBwaW5uZWQgYXQgaW5kZXggMC5cblx0XHRpZiAoIWFyZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXNFcXVhbChwcmV2aW91c1dvcmtpbmdEaXJlY3RvcmllcywgY3VycmVudFdvcmtpbmdEaXJlY3RvcmllcywgdHJ1ZSkpIHtcblx0XHRcdHRoaXMuX3dhdGNoQ3VzdG9taXphdGlvbnMoY3VycmVudFdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy53b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBtYXRlcmlhbGl6ZSBDbGF1ZGUgc2Vzc2lvbiAke3RoaXMuc2Vzc2lvbklkfTogd29ya2luZ0RpcmVjdG9yeSBpcyByZXF1aXJlZGApO1xuXHRcdH1cblx0XHR0aGlzLl90cmFuc3BvcnRLaW5kID0gY3R4LnRyYW5zcG9ydC5raW5kO1xuXHRcdHRoaXMuX21hdGVyaWFsaXplZFRyYW5zcG9ydCA9IGN0eC50cmFuc3BvcnQ7XG5cblx0XHRjb25zdCBwZXJtaXNzaW9uTW9kZSA9IHJlc29sdmVDdXJyZW50UGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIGN0eC5jb25maWdSZXNvdXJjZSwgdGhpcy5faW5oZXJpdGVkUGVybWlzc2lvbk1vZGUsIHRoaXMuX3Blcm1pc3Npb25Nb2RlRmFsbGJhY2spO1xuXHRcdGNvbnN0IHsgbWNwU2VydmVycywgYWxsb3dlZFRvb2xzIH0gPSBhd2FpdCB0aGlzLl9idWlsZFN0YXJ0dXBUb29sV2lyaW5nKGN0eC5yZXNvdXJjZSwgY3R4LnNlcnZlclRvb2xIb3N0KTtcblx0XHRjb25zdCBhZ2VudE5hbWUgPSBhd2FpdCByZXNvbHZlQ2xhdWRlQWdlbnROYW1lKHRoaXMuX3Byb3Zpc2lvbmFsQWdlbnQsIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgdGVsZW1ldHJ5ID0gYXdhaXQgdGhpcy5fb3RlbFNlcnZpY2UuZ2V0TmF0aXZlU2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0Y29uc3QgdHJhY2VDb250ZXh0ID0gdGhpcy5fb3RlbFNlcnZpY2UuZ2V0U2Vzc2lvblRyYWNlQ29udGV4dCh0aGlzLnNlc3Npb25JZCwgY3R4LnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGF3YWl0IGJ1aWxkT3B0aW9ucyhcblx0XHRcdHtcblx0XHRcdFx0c2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogdGhpcy53b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHRoaXMuX2FwcGxpZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdG1vZGVsOiB0aGlzLl9wcm92aXNpb25hbE1vZGVsLFxuXHRcdFx0XHRhYm9ydENvbnRyb2xsZXI6IHRoaXMuYWJvcnRDb250cm9sbGVyLFxuXHRcdFx0XHRwZXJtaXNzaW9uTW9kZSxcblx0XHRcdFx0Y2FuVXNlVG9vbDogY3R4LmNhblVzZVRvb2wsXG5cdFx0XHRcdG9uRWxpY2l0YXRpb246IGN0eC5vbkVsaWNpdGF0aW9uLFxuXHRcdFx0XHRpc1Jlc3VtZTogY3R4LmlzUmVzdW1lLFxuXHRcdFx0XHRyZXN1bWVTZXNzaW9uQXQ6IHRoaXMuX3BlbmRpbmdSZXN1bWVTZXNzaW9uQXQsXG5cdFx0XHRcdG1jcFNlcnZlcnMsXG5cdFx0XHRcdGFsbG93ZWRUb29scyxcblx0XHRcdFx0cGx1Z2luczogdGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYuY29uc3VtZSh0aGlzLl9kZXNpcmVkQ2xpZW50UGx1Z2luUGF0aHMoKSksXG5cdFx0XHRcdGFnZW50OiBhZ2VudE5hbWUsXG5cdFx0XHRcdHRlbGVtZXRyeSxcblx0XHRcdFx0dHJhY2VDb250ZXh0LFxuXHRcdFx0XHRnZXRVc2VyUHJvbXB0QWRkaXRpb25hbENvbnRleHQ6ICgpID0+IHRoaXMuX2hvc3RJbnN0cnVjdGlvbnM/LmpvaW4oJ1xcblxcbicpLFxuXHRcdFx0fSxcblx0XHRcdGN0eC50cmFuc3BvcnQsXG5cdFx0XHRkYXRhID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDbGF1ZGUgU0RLIHN0ZGVycl0gJHtkYXRhfWApLFxuXHRcdCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIHNlc3Npb24gJHt0aGlzLnNlc3Npb25JZH06IGVuYWJsZUZpbGVDaGVja3BvaW50aW5nPSR7b3B0aW9ucy5lbmFibGVGaWxlQ2hlY2twb2ludGluZ30gaXNSZXN1bWU9JHtjdHguaXNSZXN1bWV9YCk7XG5cblx0XHRjb25zdCB3YXJtID0gYXdhaXQgdGhpcy5fc2RrU2VydmljZS5zdGFydHVwKHsgb3B0aW9ucyB9KTtcblxuXHRcdGlmICh0aGlzLmFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0YXdhaXQgd2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKGN0eC5yZXNvdXJjZSk7XG5cdFx0bGV0IHBpcGVsaW5lOiBDbGF1ZGVTZGtQaXBlbGluZTtcblx0XHR0cnkge1xuXHRcdFx0cGlwZWxpbmUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2xhdWRlU2RrUGlwZWxpbmUsXG5cdFx0XHRcdHRoaXMuc2Vzc2lvbklkLFxuXHRcdFx0XHR0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0Y3R4LnJlc291cmNlLFxuXHRcdFx0XHR3YXJtLFxuXHRcdFx0XHR0aGlzLmFib3J0Q29udHJvbGxlcixcblx0XHRcdFx0ZGJSZWYsXG5cdFx0XHRcdHRoaXMuc3ViYWdlbnRzLFxuXHRcdFx0XHQodG9vbE5hbWU6IHN0cmluZykgPT4gdGhpcy50b29sRGlmZi5tb2RlbC5vd25lck9mKHRvb2xOYW1lKSxcblx0XHRcdCkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZGJSZWYuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgd2FybVtTeW1ib2wuYXN5bmNEaXNwb3NlXSgpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcihwaXBlbGluZS5vbkRpZFByb2R1Y2VTaWduYWwocyA9PiB0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHRoaXMuX2VucmljaFNpZ25hbFdpdGhNY3BDb250cmlidXRvcih0aGlzLl9lbnJpY2hTaWduYWxXaXRoQ3JlZGl0cyhzKSkpKSk7XG5cdFx0dGhpcy5fcGlwZWxpbmUgPSBwaXBlbGluZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFNlc3Npb25Db25maWdDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKCFldmVudC5vcmlnaW4gfHwgZXZlbnQuc2Vzc2lvbiAhPT0gY3R4LmNvbmZpZ1Jlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5oZXJpdGVkTW9kZSA9IHJlYWRDbGF1ZGVQZXJtaXNzaW9uTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgY3R4LmNvbmZpZ1Jlc291cmNlKTtcblx0XHRcdGNvbnN0IG1vZGUgPSBpbmhlcml0ZWRNb2RlID8/IHRoaXMucGVybWlzc2lvbk1vZGVGYWxsYmFjaztcblx0XHRcdHRoaXMuc2V0SW5oZXJpdGVkUGVybWlzc2lvbk1vZGUoaW5oZXJpdGVkTW9kZSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlOiR7dGhpcy5zZXNzaW9uSWR9XSBtaWQtdHVybiBzZXRQZXJtaXNzaW9uTW9kZSgke21vZGV9KSBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdC8vIFRoZSBtYXRlcmlhbGl6ZSBzdWNjZWVkZWQgd2l0aCB0aGUgc3RhZ2VkIGFuY2hvciBhcHBsaWVkIHRvIGBPcHRpb25zYFxuXHRcdC8vIFx1MjAxNCBjbGVhciBpdCBub3cgc28gaXQgaXNuJ3QgcmUtYXBwbGllZC4gQSB0aHJvdyBiZWZvcmUgdGhpcyBwb2ludCAoZS5nLlxuXHRcdC8vIGBzdGFydHVwYCAvIHBpcGVsaW5lLWNyZWF0ZSkgbGVhdmVzIGl0IHN0YWdlZCBmb3IgdGhlIG5leHQgcmV0cnkuXG5cdFx0dGhpcy5fcGVuZGluZ1Jlc3VtZVNlc3Npb25BdCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFNlZWQgdGhlIHBpcGVsaW5lJ3MgYmlqZWN0aXZlIGNvbmZpZyBjYWNoZSBzbyBhIHJlYnVpbGQgcmUtYXBwbGllc1xuXHRcdC8vIHRoZSB1c2VyJ3MgbGFzdC1jaG9zZW4gbW9kZWwgLyBlZmZvcnQgd2l0aG91dCBsb3NpbmcgdGhlIHBpY2tlclxuXHRcdC8vIGNvbmZpZy4gUmVhZCBwcm92aXNpb25hbCBzdGF0ZSBkaXJlY3RseSBvZmYgdGhlIHNlc3Npb24uXG5cdFx0cGlwZWxpbmUuc2VlZEN1cnJlbnRDb25maWcoXG5cdFx0XHR0b0NsYXVkZVNka01vZGVsSWQodGhpcy5fcHJvdmlzaW9uYWxNb2RlbCksXG5cdFx0XHR0b1J1bnRpbWVFZmZvcnRMZXZlbChyZXNvbHZlQ2xhdWRlRWZmb3J0KHRoaXMuX3Byb3Zpc2lvbmFsTW9kZWwpKSxcblx0XHRcdHBlcm1pc3Npb25Nb2RlLFxuXHRcdCk7XG5cblx0XHQvLyBGaW5hbCBwcmUtY29tbWl0IGFib3J0IGdhdGUuIFRoZSBmaXJzdCBnYXRlIGFib3ZlIGNhdWdodCBhYm9ydHNcblx0XHQvLyB0aGF0IGxhbmRlZCB3aGlsZSBgc2RrLnN0YXJ0dXAoKWAgd2FzIGluIGZsaWdodDsgdGhpcyBvbmUgY2F0Y2hlc1xuXHRcdC8vIGFib3J0cyB0aGF0IGxhbmRlZCBkdXJpbmcgdGhlIG1ldGFkYXRhIHdyaXRlIChhIHNlcGFyYXRlIGFzeW5jXG5cdFx0Ly8gYm91bmRhcnkpLiBXaXRob3V0IGl0LCBhIHJhY2luZyB0ZWFyZG93biBjb3VsZCBjb21wbGV0ZVxuXHRcdC8vIGJlZm9yZSB0aGlzIG1ldGhvZCByZXR1cm5zIGFuZCBsZWF2ZSB0aGUgcGlwZWxpbmUgbGl2ZS5cblx0XHRpZiAodGhpcy5hYm9ydENvbnRyb2xsZXIuc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblxuXHRcdHBpcGVsaW5lLmF0dGFjaFJlbWF0ZXJpYWxpemVyKGFzeW5jIChfcmVhc29uKSA9PiB7XG5cdFx0XHRjb25zdCBsaXZlTW9kZSA9IHJlc29sdmVDdXJyZW50UGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIGN0eC5jb25maWdSZXNvdXJjZSwgdGhpcy5faW5oZXJpdGVkUGVybWlzc2lvbk1vZGUsIHRoaXMuX3Blcm1pc3Npb25Nb2RlRmFsbGJhY2spO1xuXHRcdFx0Y29uc3QgcmVidWlsZEFib3J0ID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0bGV0IHJlYnVpbGRXYXJtOiBXYXJtUXVlcnkgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBQaW4gdGhlIHRyYW5zcG9ydDogcHJlZmVyIHRoZSBvbmUgdGhlIGFnZW50IHN0YWdlZCBmb3IgYSBkZWxpYmVyYXRlXG5cdFx0XHRcdC8vIHBlci1zZXNzaW9uIHN3aXRjaCAoYF9wZW5kaW5nU3dpdGNoVHJhbnNwb3J0YCwgYWxyZWFkeSByZXNvbHZlZCBhbmRcblx0XHRcdFx0Ly8gdmFsaWRhdGVkIGF0IGBzZW5kYCBcdTIwMTQgdGhlIHNlc3Npb24gb25seSBjb25zdW1lcyBpdCwgbmV2ZXIgcmUtcmVzb2x2ZXMpLFxuXHRcdFx0XHQvLyBlbHNlIHJldXNlIHRoZSB0cmFuc3BvcnQgY2FwdHVyZWQgYXQgbWF0ZXJpYWxpemUuIFJldXNpbmcgaXQga2VlcHMgYVxuXHRcdFx0XHQvLyBydW50aW1lIGhvc3QtZGVmYXVsdCBmbGlwIChjb25maWcgY2hhbmdlIC8gQ29waWxvdCBzaWduLWluKSBmcm9tXG5cdFx0XHRcdC8vIHJlcm91dGluZyBhIGxpdmUgY29udmVyc2F0aW9uOyBhbiBTREstZHJpdmVuIHJlY292ZXIgd2l0aCBub3RoaW5nIHN0YWdlZFxuXHRcdFx0XHQvLyBzdGF5cyBwdXQgYW5kIHJlLXRyaWVzIHRoZSBzd2l0Y2ggb24gdGhlIG5leHQgc2VuZC5cblx0XHRcdFx0Y29uc3QgcmVidWlsZFRyYW5zcG9ydCA9IHRoaXMuX3BlbmRpbmdTd2l0Y2hUcmFuc3BvcnQgPz8gdGhpcy5fbWF0ZXJpYWxpemVkVHJhbnNwb3J0O1xuXHRcdFx0XHRpZiAoIXJlYnVpbGRUcmFuc3BvcnQpIHtcblx0XHRcdFx0XHQvLyBBbHdheXMgc2V0IG9uY2UgYG1hdGVyaWFsaXplYCBoYXMgcnVuOyBhIHRocm93aW5nIGd1YXJkIChuZXZlciBhXG5cdFx0XHRcdFx0Ly8gbm9uLW51bGwgYXNzZXJ0aW9uKSBrZWVwcyBhIHJlYnVpbGQgaG9uZXN0IHJhdGhlciB0aGFuIGNyYXNoaW5nIG9uXG5cdFx0XHRcdFx0Ly8gYW4gaW1wb3NzaWJsZSBudWxsLlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlYnVpbGQgQ2xhdWRlIHNlc3Npb24gJHt0aGlzLnNlc3Npb25JZH06IG5vIHRyYW5zcG9ydCByZXNvbHZlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgbWNwU2VydmVyczogcmVidWlsZE1jcCwgYWxsb3dlZFRvb2xzOiByZWJ1aWxkQWxsb3dlZFRvb2xzIH0gPSBhd2FpdCB0aGlzLl9idWlsZFN0YXJ0dXBUb29sV2lyaW5nKGN0eC5yZXNvdXJjZSwgY3R4LnNlcnZlclRvb2xIb3N0KTtcblx0XHRcdFx0Y29uc3QgcmVidWlsZEFnZW50TmFtZSA9IGF3YWl0IHJlc29sdmVDbGF1ZGVBZ2VudE5hbWUodGhpcy5fcHJvdmlzaW9uYWxBZ2VudCwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UsIHRoaXMuc2Vzc2lvbklkKTtcblx0XHRcdFx0Y29uc3QgcmVidWlsZE9wdGlvbnMgPSBhd2FpdCBidWlsZE9wdGlvbnMoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMud29ya2luZ0RpcmVjdG9yeSEsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsRGlyZWN0b3JpZXM6IHRoaXMuX2Rlc2lyZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXMsXG5cdFx0XHRcdFx0XHRtb2RlbDogdGhpcy5fcHJvdmlzaW9uYWxNb2RlbCxcblx0XHRcdFx0XHRcdGFib3J0Q29udHJvbGxlcjogcmVidWlsZEFib3J0LFxuXHRcdFx0XHRcdFx0cGVybWlzc2lvbk1vZGU6IGxpdmVNb2RlLFxuXHRcdFx0XHRcdFx0Y2FuVXNlVG9vbDogY3R4LmNhblVzZVRvb2wsXG5cdFx0XHRcdFx0XHRvbkVsaWNpdGF0aW9uOiBjdHgub25FbGljaXRhdGlvbixcblx0XHRcdFx0XHRcdGlzUmVzdW1lOiB0cnVlLFxuXHRcdFx0XHRcdFx0cmVzdW1lU2Vzc2lvbkF0OiB0aGlzLl9wZW5kaW5nUmVzdW1lU2Vzc2lvbkF0LFxuXHRcdFx0XHRcdFx0bWNwU2VydmVyczogcmVidWlsZE1jcCxcblx0XHRcdFx0XHRcdGFsbG93ZWRUb29sczogcmVidWlsZEFsbG93ZWRUb29scyxcblx0XHRcdFx0XHRcdHBsdWdpbnM6IHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLmNvbnN1bWUodGhpcy5fZGVzaXJlZENsaWVudFBsdWdpblBhdGhzKCkpLFxuXHRcdFx0XHRcdFx0YWdlbnQ6IHJlYnVpbGRBZ2VudE5hbWUsXG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnksXG5cdFx0XHRcdFx0XHR0cmFjZUNvbnRleHQsXG5cdFx0XHRcdFx0XHRnZXRVc2VyUHJvbXB0QWRkaXRpb25hbENvbnRleHQ6ICgpID0+IHRoaXMuX2hvc3RJbnN0cnVjdGlvbnM/LmpvaW4oJ1xcblxcbicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVidWlsZFRyYW5zcG9ydCxcblx0XHRcdFx0XHRkYXRhID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDbGF1ZGUgU0RLIHN0ZGVycl0gJHtkYXRhfWApLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIHNlc3Npb24gJHt0aGlzLnNlc3Npb25JZH06IHJlc3VtZSByZWJ1aWxkIGFnZW50PSR7cmVidWlsZE9wdGlvbnMuYWdlbnQgPz8gJyhub25lKSd9YCk7XG5cdFx0XHRcdHJlYnVpbGRXYXJtID0gYXdhaXQgdGhpcy5fc2RrU2VydmljZS5zdGFydHVwKHsgb3B0aW9uczogcmVidWlsZE9wdGlvbnMgfSk7XG5cdFx0XHRcdC8vIFJlYnVpbGQgc3VjY2VlZGVkIHdpdGggdGhlIGFuY2hvciBhcHBsaWVkIFx1MjAxNCBjbGVhciBpdCBzbyBpdFxuXHRcdFx0XHQvLyBpc24ndCByZS1hcHBsaWVkLiBBIHRocm93IGFib3ZlIGtlZXBzIGl0IHN0YWdlZCAoaGFuZGxlZCBpbiB0aGVcblx0XHRcdFx0Ly8gY2F0Y2ggYWxvbmdzaWRlIHRoZSB0b29sL2N1c3RvbWl6YXRpb24gZGlmZnMpIHNvIHRoZSBuZXh0IHNlbmRcblx0XHRcdFx0Ly8gcmV0cmllcyB0aGUgdHJ1bmNhdGlvbiBpbnN0ZWFkIG9mIGRyb3BwaW5nIHRoZSByZXN0b3JlLlxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVzdW1lU2Vzc2lvbkF0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9hcHBsaWVkQWRkaXRpb25hbERpcmVjdG9yaWVzID0gdGhpcy5fZGVzaXJlZEFkZGl0aW9uYWxEaXJlY3Rvcmllcztcblx0XHRcdFx0dGhpcy5fd2F0Y2hDdXN0b21pemF0aW9ucyh0aGlzLndvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHRcdC8vIENvbW1pdCB0aGUgKHBvc3NpYmx5IHN3aXRjaGVkKSB0cmFuc3BvcnQgbm93IHRoYXQgdGhlIG5ld1xuXHRcdFx0XHQvLyBzdWJwcm9jZXNzIGlzIGxpdmUsIHNvIGNyZWRpdCBlbnJpY2htZW50IHRyYWNrcyB0aGUgcnVubmluZ1xuXHRcdFx0XHQvLyB0cmFuc3BvcnQuIEEgdGhyb3cgYWJvdmUgbGVhdmVzIGV2ZXJ5dGhpbmcgdW50b3VjaGVkIHNvIHRoZSBuZXh0XG5cdFx0XHRcdC8vIHNlbmQgcmV0cmllcy5cblx0XHRcdFx0dGhpcy5fdHJhbnNwb3J0S2luZCA9IHJlYnVpbGRUcmFuc3BvcnQua2luZDtcblx0XHRcdFx0dGhpcy5fbWF0ZXJpYWxpemVkVHJhbnNwb3J0ID0gcmVidWlsZFRyYW5zcG9ydDtcblx0XHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdTd2l0Y2hUcmFuc3BvcnQpIHtcblx0XHRcdFx0XHQvLyBPbmx5IGEgcmVidWlsZCB0aGF0IGFjdHVhbGx5IGNvbnN1bWVkIGEgcHVzaGVkIHN3aXRjaCB0cmFuc3BvcnRcblx0XHRcdFx0XHQvLyByZXNvbHZlcyB0aGUgcGVuZGluZyBzd2l0Y2guIEFuIG9yZGluYXJ5L1NESy1yZWNvdmVyIHJlYnVpbGQgdGhhdFxuXHRcdFx0XHRcdC8vIHJldXNlZCB0aGUgbWF0ZXJpYWxpemVkIHRyYW5zcG9ydCBsZWF2ZXMgdGhlIGZsYWcgc2V0IHNvIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gc2VuZCBzdGlsbCBwZXJmb3JtcyB0aGUgZGVmZXJyZWQgc3dpdGNoLlxuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdUcmFuc3BvcnRTd2l0Y2ggPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU3dpdGNoVHJhbnNwb3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IHdhcm06IHJlYnVpbGRXYXJtLCBhYm9ydENvbnRyb2xsZXI6IHJlYnVpbGRBYm9ydCB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHJlYnVpbGRBYm9ydC5hYm9ydCgpO1xuXHRcdFx0XHRhd2FpdCByZWJ1aWxkV2FybT8uW1N5bWJvbC5hc3luY0Rpc3Bvc2VdKCk7XG5cdFx0XHRcdHRoaXMudG9vbERpZmYubWFya0RpcnR5KCk7XG5cdFx0XHRcdHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLm1hcmtEaXJ0eSgpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpO1xuXG5cdFx0Ly8gQWR2ZXJ0aXNlIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzIG9uIHRoaXMgc2Vzc2lvbiBzbyB0aGUgY2xpZW50XG5cdFx0Ly8gc2VlcyB0aGVtIGFzIHNlcnZlci1wcm92aWRlZC4gRXhlY3V0aW9uIGhhcHBlbnMgaW4tcHJvY2VzcyB2aWEgdGhlXG5cdFx0Ly8gc2VydmVyLXRvb2wgTUNQIHNlcnZlciBidWlsdCBpbiBgX2J1aWxkU3RhcnR1cFRvb2xXaXJpbmdgLlxuXHRcdGN0eC5zZXJ2ZXJUb29sSG9zdD8uYWR2ZXJ0aXNlKGN0eC5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIFN1cmZhY2UgdGhlIFNESy1yZXNvbHZlZCBjdXN0b21pemF0aW9uIHRpZXIgdG8gdGhlIHdvcmtiZW5jaC5cblx0XHQvLyBQcmUtbWF0ZXJpYWxpemUsIGdldFNlc3Npb25DdXN0b21pemF0aW9ucyByZXR1cm5zIG9ubHkgdGhlXG5cdFx0Ly8gY2xpZW50LXB1c2hlZCBzbGljZTsgZmlyaW5nIGhlcmUgcHJvbXB0cyB0aGUgd29ya2JlbmNoIHRvIHJlZmV0Y2hcblx0XHQvLyBhbmQgcGljayB1cCB0aGUgYnVuZGxlZCBgRGlzY292ZXJlZCBpbiBDbGF1ZGVgIGVudHJ5LlxuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBTREsgdG9vbCB3aXJpbmcgc2hhcmVkIGJ5IHRoZSBpbml0aWFsIG1hdGVyaWFsaXplIGFuZCBldmVyeVxuXHQgKiB5aWVsZC1yZXN0YXJ0IHJlbWF0ZXJpYWxpemU6IHRoZSBpbi1wcm9jZXNzIE1DUCBzZXJ2ZXJzIHBsdXMgdGhlXG5cdCAqIGF1dG8tYXBwcm92ZSBhbGxvdy1saXN0LlxuXHQgKlxuXHQgKiBUaGUgTUNQIHNlcnZlcnMgYXJlIHRoZSB3b3JrYmVuY2ggY2xpZW50IHRvb2xzICh3aGljaCByb3VuZC10cmlwIHRvIHRoZVxuXHQgKiB3b3JrYmVuY2gpIHBsdXMsIHdoZW4gYSBzZXJ2ZXItdG9vbCBob3N0IGlzIHdpcmVkLCB0aGUgYWdlbnQgaG9zdCdzIG93blxuXHQgKiBzZXJ2ZXIgdG9vbHMgKGV4ZWN1dGVkIGluLXByb2Nlc3MpLiBgbWNwU2VydmVyc2AgaXMgYHVuZGVmaW5lZGAgd2hlblxuXHQgKiBuZWl0aGVyIGlzIHByZXNlbnQgc28gYE9wdGlvbnMubWNwU2VydmVyc2AgaXMgb21pdHRlZCBlbnRpcmVseSBhbmQgdGhlXG5cdCAqIFNESyBrZWVwcyBpdHMgZGVmYXVsdDsgYGFsbG93ZWRUb29sc2AgY2FycmllcyB0aGUgU0RLLXByZWZpeGVkIHNlcnZlciB0b29sXG5cdCAqIG5hbWVzIChzbyB0aGV5IGF1dG8tYXBwcm92ZSB3aXRob3V0IHByb21wdGluZykgYW5kIGlzIGB1bmRlZmluZWRgIHdoZW4gbm9cblx0ICogc2VydmVyLXRvb2wgaG9zdCBpcyB3aXJlZC5cblx0ICpcblx0ICogS2VlcGluZyBib3RoIGluIG9uZSBwbGFjZSBlbnN1cmVzIHRoZSB0d28gc3RhcnR1cCBwYXRocyBjYW4gbmV2ZXIgZHJpZnQsXG5cdCAqIGFuZCB0aGF0IGEgbmV3bHkgcmVnaXN0ZXJlZCBzZXJ2ZXIgdG9vbCBpcyB3aXJlZCBldmVyeXdoZXJlIGF0IG9uY2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9idWlsZFN0YXJ0dXBUb29sV2lyaW5nKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0c2VydmVyVG9vbEhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0IHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHsgbWNwU2VydmVyczogUmVjb3JkPHN0cmluZywgTWNwU2RrU2VydmVyQ29uZmlnV2l0aEluc3RhbmNlPiB8IHVuZGVmaW5lZDsgYWxsb3dlZFRvb2xzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgY2xpZW50U2VydmVycyA9IGF3YWl0IGJ1aWxkQ2xpZW50TWNwU2VydmVycyh0aGlzLnRvb2xEaWZmLCB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLCB0aGlzLl9zZGtTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXJ2ZXJUb29sU2VydmVyID0gc2VydmVyVG9vbEhvc3Rcblx0XHRcdD8gYXdhaXQgYnVpbGRTZXJ2ZXJUb29sTWNwU2VydmVyKHNlcnZlclRvb2xIb3N0LCByZXNvdXJjZS50b1N0cmluZygpLCB0aGlzLl9zZGtTZXJ2aWNlKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWNwU2VydmVycyA9ICghY2xpZW50U2VydmVycyAmJiAhc2VydmVyVG9vbFNlcnZlcilcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHtcblx0XHRcdFx0Li4uKGNsaWVudFNlcnZlcnMgPz8ge30pLFxuXHRcdFx0XHQuLi4oc2VydmVyVG9vbFNlcnZlciA/IHsgW0NMQVVERV9TRVJWRVJfVE9PTF9NQ1BfU0VSVkVSX05BTUVdOiBzZXJ2ZXJUb29sU2VydmVyIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdC8vIEV4Y2x1ZGUgc2VydmVyIHRvb2xzIHRoYXQgY2FuIHJlcXVpcmUgdXNlciBjb25maXJtYXRpb24gZnJvbSB0aGVcblx0XHQvLyBhdXRvLWFwcHJvdmUgYWxsb3ctbGlzdCBzbyB0aGUgU0RLIHN1cmZhY2VzIHRoZW0gdmlhIGBjYW5Vc2VUb29sYFxuXHRcdC8vICh0aGUgaG9zdCB0aGVuIGRlY2lkZXMgcGVyIGNhbGwgd2hldGhlciB0byByZW5kZXIgYSBjb25maXJtYXRpb24pXG5cdFx0Ly8gaW5zdGVhZCBvZiBydW5uaW5nIHRoZW0gc2lsZW50bHkuIFRoaXMgbXVzdCB1c2UgdGhlIHNlc3Npb24taW5kZXBlbmRlbnRcblx0XHQvLyBhbnN3ZXI6IHRoZSBhbGxvdy1saXN0IGlzIGJha2VkIGludG8gdGhlIFNESyBvcHRpb25zIGhlcmUgYW5kIHdvdWxkIGdvXG5cdFx0Ly8gc3RhbGUgaWYgYSB0b29sIHdlcmUgYWxsb3ctbGlzdGVkIHdoaWxlIGl0IGhhcHBlbmVkIHRvIGhhdmUgbm90aGluZyB0b1xuXHRcdC8vIGNvbmZpcm0uXG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVUb29sTmFtZXMgPSBzZXJ2ZXJUb29sSG9zdFxuXHRcdFx0PyBzZXJ2ZXJUb29sSG9zdC50b29sTmFtZXMuZmlsdGVyKG5hbWUgPT4gIXNlcnZlclRvb2xIb3N0LmNhblJlcXVpcmVDb25maXJtYXRpb24obmFtZSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4geyBtY3BTZXJ2ZXJzLCBhbGxvd2VkVG9vbHM6IGF1dG9BcHByb3ZlVG9vbE5hbWVzID8gc2VydmVyVG9vbEFsbG93TGlzdChhdXRvQXBwcm92ZVRvb2xOYW1lcykgOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdC8qKiBUcnVlIG9uY2Uge0BsaW5rIG1hdGVyaWFsaXplfSBoYXMgaW5zdGFsbGVkIHRoZSBTREsgcGlwZWxpbmUuICovXG5cdGdldCBpc1BpcGVsaW5lUmVhZHkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9waXBlbGluZSAhPT0gdW5kZWZpbmVkOyB9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBjaGF0IGN1cnJlbnRseSBoYXMgYSB0dXJuIGluIGZsaWdodCBvciBxdWV1ZWQuIEZhbHNlIHdoZW5cblx0ICogcHJvdmlzaW9uYWwgKG5vIHBpcGVsaW5lKSBvciBpZGxlIGJldHdlZW4gdHVybnMuIFVzZWQgYnkgbm9uLWRlc3RydWN0aXZlXG5cdCAqIGlkbGUgcmVsZWFzZSB0byBhdm9pZCBkaXNjb25uZWN0aW5nIG1pZC10dXJuLlxuXHQgKi9cblx0Z2V0IGhhc0FjdGl2ZVR1cm4oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9waXBlbGluZT8uaGFzQWN0aXZlVHVybiA/PyBmYWxzZTsgfVxuXG5cdC8qKiBQcmUtbWF0ZXJpYWxpemUgbW9kZWwgc2VsZWN0aW9uIGFjY2Vzc29yIChyZWFkIGJ5IG1hdGVyaWFsaXplciB0byBidWlsZCBPcHRpb25zKS4gKi9cblx0Z2V0IHByb3Zpc2lvbmFsTW9kZWwoKTogTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvdmlzaW9uYWxNb2RlbDsgfVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgcGVyLXNlc3Npb24gcHJvdmlkZXIgc3dpdGNoIGlzIHN0YWdlZCBhbmQgYXdhaXRpbmcgdGhlIG5leHRcblx0ICoge0BsaW5rIHNlbmR9LiBUaGUgYWdlbnQgcmVhZHMgdGhpcyB0byBkZWNpZGUgd2hldGhlciB0byByZXNvbHZlIGEgZnJlc2hcblx0ICogdHJhbnNwb3J0IChpdCBvd25zIHRoZSBsaXZlIHByb3h5IGhhbmRsZSkgYW5kIHB1c2ggaXQgaW4gdmlhIGBzd2l0Y2hUcmFuc3BvcnRgXG5cdCAqIFx1MjAxNCByZXNvbHZpbmcgb25lIG9ubHkgd2hlbiBhIHN3aXRjaCBpcyBhY3R1YWxseSBwZW5kaW5nLCBzbyBvcmRpbmFyeSBzZW5kc1xuXHQgKiBuZXZlciB0cmlwIHRoZSBzaWduZWQtb3V0IHByb3h5IHRocm93LlxuXHQgKi9cblx0Z2V0IGhhc1BlbmRpbmdUcmFuc3BvcnRTd2l0Y2goKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9wZW5kaW5nVHJhbnNwb3J0U3dpdGNoOyB9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZVBpcGVsaW5lKCk6IENsYXVkZVNka1BpcGVsaW5lIHtcblx0XHRpZiAoIXRoaXMuX3BpcGVsaW5lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NsYXVkZUFnZW50U2Vzc2lvbiBpcyBub3QgbWF0ZXJpYWxpemVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9waXBlbGluZTtcblx0fVxuXG5cdGdldCBpc1Jlc3VtZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5pc1Jlc3VtZWQ7IH1cblxuXHQvKipcblx0ICogQWJvcnQgdGhlIGxpdmUgU0RLIHN1YnByb2Nlc3MgYW5kIGF3YWl0IGl0cyBmdWxsIHRlYXJkb3duIHNvIHRoZVxuXHQgKiBzZXNzaW9uIGlkIGlzIHJlbGVhc2VkLiBOby1vcCB3aGVuIHRoZSBzZXNzaW9uIHdhcyBuZXZlciBtYXRlcmlhbGl6ZWRcblx0ICogKG5vIHN1YnByb2Nlc3MgdG8gc3RvcCkuIFVzZWQgYnkgcmVtb3ZlLWFsbCB0cnVuY2F0aW9uIGJlZm9yZSBpdFxuXHQgKiByZWNyZWF0ZXMgYSBmcmVzaCBzZXNzaW9uIHVuZGVyIHRoZSBzYW1lIGlkIFx1MjAxNCB0aGUgQ0xJIGtlZXBzIHRoZSBpZFxuXHQgKiBsb2NrZWQgdW50aWwgdGhlIG9sZCBzdWJwcm9jZXNzIGV4aXRzLlxuXHQgKi9cblx0YXN5bmMgc2h1dGRvd25MaXZlUXVlcnkoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcGlwZWxpbmU/LnNodXRkb3duQW5kV2FpdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIHBpcGVsaW5lJ3MgY3VycmVudCArIGFwcGxpZWQgY29uZmlnIGNhY2hlIGZyb21cblx0ICogbWF0ZXJpYWxpemUtdGltZSBgT3B0aW9uc2AuIFRoZSBTREsgYWxyZWFkeSBzdGFydHMgd2l0aCB0aGVzZVxuXHQgKiB2YWx1ZXMsIHNvIHRoZSBjYWNoZSBwcmV2ZW50cyBhIHJlZHVuZGFudCBmaXJzdCBgc2V0TW9kZWxgIC9cblx0ICogYGFwcGx5RmxhZ1NldHRpbmdzYCBjYWxsLlxuXHQgKi9cblx0c2VlZEJpamVjdGl2ZVN0YXRlKHN0YXRlOiB7IG1vZGVsPzogc3RyaW5nOyBlZmZvcnQ/OiBDbGF1ZGVSdW50aW1lRWZmb3J0TGV2ZWw7IHBlcm1pc3Npb25Nb2RlPzogUGVybWlzc2lvbk1vZGUgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnNlZWRDdXJyZW50Q29uZmlnKHN0YXRlLm1vZGVsLCBzdGF0ZS5lZmZvcnQsIHN0YXRlLnBlcm1pc3Npb25Nb2RlKTtcblx0fVxuXG5cdGF0dGFjaFJlbWF0ZXJpYWxpemVyKHJlbWF0ZXJpYWxpemVyOiBJUmVtYXRlcmlhbGl6ZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5hdHRhY2hSZW1hdGVyaWFsaXplcihyZW1hdGVyaWFsaXplcik7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBhIHVzZXIgcHJvbXB0LiBQZXJmb3JtcyB0aGUgcGVyLXR1cm4gcHJlLWZsaWdodCBiZWZvcmVcblx0ICogeWllbGRpbmcgdG8gdGhlIHBpcGVsaW5lOlxuXHQgKlxuXHQgKiAtIElmIHtAbGluayB0b29sRGlmZn0gb3Ige0BsaW5rIGNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0gcmVwb3J0cyB0aGVcblx0ICogICBsaXZlIGBRdWVyeWAgaXMgb3V0IG9mIHN5bmMgd2l0aCB0aGUgd29ya2JlbmNoJ3MgdmlldywgeWllbGQtcmVzdGFydFxuXHQgKiAgIHNvIHRoZSBTREsgcGlja3MgdXAgdGhlIG5ldyBgT3B0aW9ucy5tY3BTZXJ2ZXJzYCAvIGBPcHRpb25zLnBsdWdpbnNgLlxuXHQgKiAgIGBRdWVyeS5yZWxvYWRQbHVnaW5zKClgIGNhbm5vdCBoZWxwIGhlcmUgXHUyMDE0IHRoZSBTREsncyBwbHVnaW4gVVJJIHNldFxuXHQgKiAgIGlzIGNhcHR1cmVkIGF0IHN0YXJ0dXAsIHNvIGFueSBhZGQgLyByZW1vdmUgLyBub25jZS1idW1wIG11c3QgZ29cblx0ICogICB0aHJvdWdoIGEgZnVsbCByZWJ1aWxkLiBUaGUgcmViaW5kIGl0c2VsZiByZS1hcHBsaWVzIHRoZSBsaXZlXG5cdCAqICAgYHBlcm1pc3Npb25Nb2RlYCB2aWEgdGhlIHJlbWF0ZXJpYWxpemVyLlxuXHQgKiAtIE90aGVyd2lzZSBmb3J3YXJkIHRoZSBsaXZlIGBwZXJtaXNzaW9uTW9kZWAgdG8gdGhlIGJvdW5kIGBRdWVyeWAgc29cblx0ICogICBhIGBTZXNzaW9uQ29uZmlnQ2hhbmdlZGAgYWN0aW9uIHRoYXQgYXJyaXZlZCBiZXR3ZWVuIHR1cm5zIHdpbnMuXG5cdCAqICAgVGhlIHBpcGVsaW5lJ3MgYmlqZWN0aXZlIGNhY2hlIGRlZHVwZXMgYSBuby1vcCBgc2V0UGVybWlzc2lvbk1vZGVgLFxuXHQgKiAgIHNvIHRoaXMgaXMgZnJlZSB3aGVuIG5vdGhpbmcgY2hhbmdlZC5cblx0ICpcblx0ICogV2hlbiB7QGxpbmsgaGFzUGVuZGluZ1RyYW5zcG9ydFN3aXRjaH0gaXMgc2V0LCB0aGUgYWdlbnQgcmVzb2x2ZXMgdGhlIG5ld1xuXHQgKiB0cmFuc3BvcnQgKGl0IG93bnMgdGhlIGxpdmUgcHJveHkgaGFuZGxlKSBhbmQgcGFzc2VzIGl0IGFzIGBzd2l0Y2hUcmFuc3BvcnRgLlxuXHQgKiBJdCBpcyBzdGFnZWQgZm9yIHRoZSBwcmUtZmxpZ2h0IHJlYnVpbGQgYmVsb3csIHdoaWNoIHJlYmluZHMgdGhlIHN1YnByb2Nlc3Ncblx0ICogb250byBpdC4gVGhlIGFnZW50IHJlc29sdmVzIG9uZSBvbmx5IHdoZW4gYSBzd2l0Y2ggaXMgcGVuZGluZywgc28gb3JkaW5hcnlcblx0ICogc2VuZHMgbmV2ZXIgY2FycnkgYSB0cmFuc3BvcnQgYW5kIHRoZSBzZXNzaW9uIG5ldmVyIGNhbGxzIGJhY2sgdG8gcmUtcmVzb2x2ZS5cblx0ICpcblx0ICogTW9kZWwgLyBlZmZvcnQgYXJlIG5vdCB0aHJlYWRlZCB0aHJvdWdoIGhlcmUgXHUyMDE0IHRoZSBwaXBlbGluZSdzIGN1cnJlbnRcblx0ICogbW9kZWwgLyBlZmZvcnQgKHNldCBlYWdlcmx5IHZpYSB7QGxpbmsgc2V0TW9kZWx9KSBpcyB3aGF0ZXZlclxuXHQgKiB0aGUgU0RLIGhhcyBiZWVuIHRvbGQuXG5cdCAqL1xuXHRhc3luYyBzZW5kKHByb21wdDogU0RLVXNlck1lc3NhZ2UsIHR1cm5JZDogc3RyaW5nLCByZXNvdXJjZTogVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM/OiByZWFkb25seSBVUklbXSwgc3dpdGNoVHJhbnNwb3J0PzogQ2xhdWRlVHJhbnNwb3J0LCBob3N0SW5zdHJ1Y3Rpb25zPzogcmVhZG9ubHkgc3RyaW5nW10sIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBpcGVsaW5lID0gdGhpcy5fcmVxdWlyZVBpcGVsaW5lKCk7XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0dGhpcy5fcmVwbGFjZURlc2lyZWRXb3JraW5nRGlyZWN0b3JpZXMod29ya2luZ0RpcmVjdG9yaWVzKTtcblx0XHR9XG5cdFx0aWYgKHN3aXRjaFRyYW5zcG9ydCkge1xuXHRcdFx0Ly8gU3RhZ2UgdGhlIGFnZW50LXJlc29sdmVkIHRyYW5zcG9ydCBmb3IgdGhlIHBlbmRpbmcgc3dpdGNoOyB0aGVcblx0XHRcdC8vIHByZS1mbGlnaHQgcmVidWlsZCBiZWxvdyBjb25zdW1lcyBpdCAoc2VlIHRoZSByZW1hdGVyaWFsaXplcikuXG5cdFx0XHR0aGlzLl9wZW5kaW5nU3dpdGNoVHJhbnNwb3J0ID0gc3dpdGNoVHJhbnNwb3J0O1xuXHRcdH1cblx0XHQvLyBOZXcgdHVybjogcmVzZXQgdGhlIHBlci10dXJuIGNyZWRpdCBhY2N1bXVsYXRvciBzbyBwcm94eSByZXBvcnRzXG5cdFx0Ly8gZm9yIHRoaXMgdHVybidzIGAvdjEvbWVzc2FnZXNgIGNhbGxzIHN1bSBmcm9tIHplcm8uXG5cdFx0dGhpcy5fY3VycmVudFR1cm5OYW5vQWl1ID0gMDtcblx0XHRpZiAodGhpcy50b29sRGlmZi5oYXNEaWZmZXJlbmNlXG5cdFx0XHR8fCB0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5oYXNEaWZmZXJlbmNlRnJvbSh0aGlzLl9kZXNpcmVkQ2xpZW50UGx1Z2luUGF0aHMoKSlcblx0XHRcdHx8IHRoaXMuX3BlbmRpbmdSZXN1bWVTZXNzaW9uQXQgIT09IHVuZGVmaW5lZFxuXHRcdFx0fHwgIWFyZUFkZGl0aW9uYWxXb3JraW5nRGlyZWN0b3JpZXNFcXVhbCh0aGlzLl9hcHBsaWVkQWRkaXRpb25hbERpcmVjdG9yaWVzLCB0aGlzLl9kZXNpcmVkQWRkaXRpb25hbERpcmVjdG9yaWVzKVxuXHRcdFx0fHwgdGhpcy5fcGVuZGluZ1RyYW5zcG9ydFN3aXRjaCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmViaW5kRm9yU3luY2VkU3RhdGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2V0UGVybWlzc2lvbk1vZGUocmVzb2x2ZUN1cnJlbnRQZXJtaXNzaW9uTW9kZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgcmVzb3VyY2UsIHRoaXMuX2luaGVyaXRlZFBlcm1pc3Npb25Nb2RlLCB0aGlzLl9wZXJtaXNzaW9uTW9kZUZhbGxiYWNrKSk7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlY29uY2lsZU1jcFNlcnZlckVuYWJsZW1lbnQoKTtcblx0XHR0aGlzLl9ob3N0SW5zdHJ1Y3Rpb25zID0gaG9zdEluc3RydWN0aW9ucztcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcGlwZWxpbmUuc2VuZChwcm9tcHQsIHR1cm5JZCwgY2xpZW50Q29udGV4dCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2hvc3RJbnN0cnVjdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwbGFjZURlc2lyZWRXb3JraW5nRGlyZWN0b3JpZXMod29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLndvcmtpbmdEaXJlY3Rvcnk7XG5cdFx0aWYgKCFwcmltYXJ5IHx8ICFpc0VxdWFsKHByaW1hcnksIHdvcmtpbmdEaXJlY3Rvcmllc1swXSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNoYW5nZSBDbGF1ZGUgc2Vzc2lvbiBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5OiAke3RoaXMuc2Vzc2lvbklkfWApO1xuXHRcdH1cblx0XHRjb25zdCBkZXNpcmVkQWRkaXRpb25hbERpcmVjdG9yaWVzID0gd29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDEpO1xuXHRcdGlmIChhcmVBZGRpdGlvbmFsV29ya2luZ0RpcmVjdG9yaWVzRXF1YWwodGhpcy5fZGVzaXJlZEFkZGl0aW9uYWxEaXJlY3RvcmllcywgZGVzaXJlZEFkZGl0aW9uYWxEaXJlY3RvcmllcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGVzaXJlZEFkZGl0aW9uYWxEaXJlY3RvcmllcyA9IGRlc2lyZWRBZGRpdGlvbmFsRGlyZWN0b3JpZXM7XG5cdH1cblxuXHQvKipcblx0ICogU2luZ2xlIHlpZWxkLXJlc3RhcnQgdGhhdCBjb3ZlcnMgYm90aCBjbGllbnQtdG9vbCBhbmRcblx0ICogY3VzdG9taXphdGlvbiBkaXZlcmdlbmNlIGluIG9uZSB0cmlwLiBEcmFpbnMgdGhlIHBhcmtlZFxuXHQgKiBjbGllbnQtdG9vbCBNQ1AgaGFuZGxlcnMgKHNhbWUgYXMgdGhlIG9yaWdpbmFsIHRvb2wtb25seVxuXHQgKiByZWJpbmQpLCB0aGVuIHRyaWdnZXJzIHRoZSBwaXBlbGluZSByZWJpbmQgXHUyMDE0IHRoZSByZW1hdGVyaWFsaXplclxuXHQgKiByZWFkcyBgdG9vbERpZmZgIGFuZCByZWR1Y2VyLWJhY2tlZCBjbGllbnQgcGx1Z2luIHBhdGhzIHdoaWxlXG5cdCAqIGJ1aWxkaW5nIHRoZSBuZXcgYE9wdGlvbnNgLCBzbyB0aGUgYml0IG9uIGVhY2ggZGlmZiBjbGVhcnMgaW5cblx0ICogbG9ja3N0ZXAgd2l0aCB0aGUgU0RLIGFjdHVhbGx5IHJlY2VpdmluZyB0aGUgbmV3IHZhbHVlcy4gRmlyZXNcblx0ICogYF9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlYCBhZnRlcndhcmRzIHNvIHRoZSB3b3JrYmVuY2hcblx0ICogcmVmZXRjaGVzIGBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnNgIGFuZCBwaWNrcyB1cCBhbnkgbmV3bHlcblx0ICogcmVzb2x2ZWQgc2VydmVyLXNpZGUgZW50cmllcyBmcm9tIHRoZSByZWJ1aWx0IGBRdWVyeWAuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWJpbmRGb3JTeW5jZWRTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLnJlamVjdEFsbChuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKSk7XG5cdFx0YXdhaXQgdGhpcy5fcmVxdWlyZVBpcGVsaW5lKCkucmViaW5kRm9yUmVzdGFydCgpO1xuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbCB0aGUgaW4tZmxpZ2h0IFNESyB0dXJuLiBNaXJyb3JzIHRoZSBwcm9kdWN0aW9uIHJlZmVyZW5jZTtcblx0ICogc2VlIHtAbGluayBDbGF1ZGVTZGtQaXBlbGluZS5hYm9ydH0uIEFsc28gZGVuaWVzIGFueSBwYXJrZWRcblx0ICogcGVybWlzc2lvbiAvIHVzZXItaW5wdXQgcmVxdWVzdHMgc28gdGhlIFNESydzIGBjYW5Vc2VUb29sYFxuXHQgKiBjYWxsYmFjayAoYW5kIGFueSBpbnRlcmFjdGl2ZSB0b29sIHdhaXRpbmcgb24gdXNlciBpbnB1dCkgdW53aW5kc1xuXHQgKiB3aXRoIGEgZGVueSAvIGNhbmNlbCByZXN1bHQgaW5zdGVhZCBvZiBsZWF2aW5nIHN0YWxlIFVJIGJlaGluZC5cblx0ICovXG5cdGFib3J0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5kZW55QWxsKGZhbHNlKTtcblx0XHR0aGlzLl9wZW5kaW5nVXNlcklucHV0cy5kZW55QWxsKHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwgfSk7XG5cdFx0dGhpcy5fcmVxdWlyZVBpcGVsaW5lKCkuYWJvcnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFYWdlcmx5IGFwcGx5IGEgbW9kZWwgY2hhbmdlIGFuZCBwZXJzaXN0IHRoZSBuZXcgc2VsZWN0aW9uLiBTYWZlIHRvXG5cdCAqIGNhbGwgYmVmb3JlIG9yIGFmdGVyIG1hdGVyaWFsaXplOlxuXHQgKlxuXHQgKiAtIFByZS1tYXRlcmlhbGl6ZTogc3Rhc2ggdGhlIG1vZGVsIG9uIHRoZSBzZXNzaW9uIHNvIHRoZSBmaXJzdCBTREtcblx0ICogICBzdGFydHVwIHBpY2tzIGl0IHVwIHZpYSBgT3B0aW9ucy5tb2RlbGAgLyBgT3B0aW9ucy5lZmZvcnRgLlxuXHQgKiAtIFBvc3QtbWF0ZXJpYWxpemU6IHF1ZXVlIHRoZSBjaGFuZ2Ugb24gdGhlIHBpcGVsaW5lOyB0aGUgU0RLXG5cdCAqICAgYXBwbGllcyBpdCBvbiB0aGUgTkVYVCB1c2VyIHJlcXVlc3QgdmlhXG5cdCAqICAgYFF1ZXJ5LnNldE1vZGVsYCAvIGBRdWVyeS5hcHBseUZsYWdTZXR0aW5nc2AuIGAnbWF4J2AgZmxvd3MgdGhyb3VnaFxuXHQgKiAgIHVuY2hhbmdlZCBcdTIwMTQgc2VlIHtAbGluayB0b1J1bnRpbWVFZmZvcnRMZXZlbH0uXG5cdCAqXG5cdCAqIFBlcnNpc3RlbmNlIGlzIGhvc3Qtb3duZWQ7IGNhbGxlcnMgdXBkYXRlIHRoZSBvdmVybGF5IHNlcGFyYXRlbHkuXG5cdCAqXG5cdCAqIEEgY2hhbmdlIHRoYXQgY3Jvc3NlcyB0cmFuc3BvcnRzIChDb3BpbG90IFx1MjE5NCBuYXRpdmUpIG9uIGEgbGl2ZSBzZXNzaW9uXG5cdCAqIGRlZmVycyB0byBhIHJlYnVpbGQgb24gdGhlIG5leHQge0BsaW5rIHNlbmR9IHJhdGhlciB0aGFuIGhvdC1zd2FwcGluZy5cblx0ICovXG5cdGFzeW5jIHNldE1vZGVsKG1vZGVsOiBNb2RlbFNlbGVjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Byb3Zpc2lvbmFsTW9kZWwgPSBtb2RlbDtcblx0XHQvLyBBIG1vZGVsIGNoYW5nZSB0aGF0IGNyb3NzZXMgdHJhbnNwb3J0cyAoQ29waWxvdCBcdTIxOTQgbmF0aXZlKSBvbiBhIGxpdmVcblx0XHQvLyBzZXNzaW9uIGNhbid0IGhvdC1zd2FwIFx1MjAxNCB0aGUgcnVubmluZyBzdWJwcm9jZXNzIGlzIHBpbm5lZCB0byB0aGUgb2xkXG5cdFx0Ly8gdHJhbnNwb3J0LiBEZXRlY3QgdGhhdCBoZXJlIGFuZCBkZWZlciB0byBhIHJlYnVpbGQgb24gdGhlIG5leHQgYHNlbmRgLlxuXHRcdC8vIEEgc3RpbGwtcHJvdmlzaW9uYWwgc2Vzc2lvbiBvciBhIHNhbWUtdHJhbnNwb3J0IGNoYW5nZSByZXNvbHZlcyB0b1xuXHRcdC8vIGBmYWxzZWAsIHByZXNlcnZpbmcgdG9kYXkncyBob3Qtc3dhcCBleGFjdGx5LlxuXHRcdC8vIEd1YXJkIG9uIGBleHBsaWNpdFByb3ZpZGVyYDogYSBiYXJlL2xlZ2FjeSBpZCBjYXJyaWVzIG5vIHByb3ZpZGVyIG9mIGl0c1xuXHRcdC8vIG93biBhbmQgdGhlIHBhcnNlciByZXBvcnRzIHRoZSBgY29waWxvdGAgZmFsbGJhY2ssIHdoaWNoIG11c3QgTk9UXG5cdFx0Ly8gbWFzcXVlcmFkZSBhcyBhIG5hdGl2ZVx1MjE5MnByb3h5IHN3aXRjaCBvbiBhIG5hdGl2ZSBzZXNzaW9uIChtaXJyb3JzIHRoZSBzYW1lXG5cdFx0Ly8gZ3VhcmQgaW4gYHJlc29sdmVDbGF1ZGVTZXNzaW9uVHJhbnNwb3J0YCkuIE9ubHkgYSBnZW51aW5lbHlcblx0XHQvLyBwcm92aWRlci1xdWFsaWZpZWQgaWQgY2FuIG1vdmUgYSBsaXZlIHNlc3Npb24gYWNyb3NzIHRyYW5zcG9ydHMuXG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDbGF1ZGVNb2RlbFNlbGVjdGlvbihtb2RlbCk7XG5cdFx0Y29uc3QgY3Jvc3Nlc1RyYW5zcG9ydCA9XG5cdFx0XHR0aGlzLmlzUGlwZWxpbmVSZWFkeSAmJlxuXHRcdFx0cGFyc2VkLmV4cGxpY2l0UHJvdmlkZXIgJiZcblx0XHRcdGNsYXVkZVRyYW5zcG9ydEZvclByb3ZpZGVyKHBhcnNlZC5wcm92aWRlcikgIT09IHRoaXMuX3RyYW5zcG9ydEtpbmQ7XG5cdFx0aWYgKGNyb3NzZXNUcmFuc3BvcnQpIHtcblx0XHRcdC8vIENyb3NzLXRyYW5zcG9ydCBzd2l0Y2ggb24gYSBsaXZlIHNlc3Npb246IHRoZSBydW5uaW5nIHN1YnByb2Nlc3MgaXNcblx0XHRcdC8vIHBpbm5lZCB0byB0aGUgb2xkIHRyYW5zcG9ydC9jcmVkZW50aWFsLCBhbmQgcHVzaGluZyB0aGUgbmV3IG1vZGVsIG9udG9cblx0XHRcdC8vIGl0IG1heSA0MDAgb24gYSBtb2RlbCB0aGF0IHRyYW5zcG9ydCBkb2Vzbid0IHNlcnZlLiBGbGFnIHRoZSBzd2l0Y2ggYW5kXG5cdFx0XHQvLyBza2lwIHRoZSBob3Qtc3dhcCBcdTIwMTQgdGhlIG5leHQgYHNlbmRgIHByZS1mbGlnaHQgcmVidWlsZHMgb24gdGhlIG5ld1xuXHRcdFx0Ly8gdHJhbnNwb3J0IChjb252ZXJzYXRpb24gcHJlc2VydmVkIHZpYSB0aGUgcmVzdW1lIHJlYnVpbGQpLCBhbmQgdGhlXG5cdFx0XHQvLyByZW1hdGVyaWFsaXplciBjbGVhcnMgdGhlIGZsYWcgb25jZSB0aGUgbmV3IHN1YnByb2Nlc3MgaXMgbGl2ZS5cblx0XHRcdHRoaXMuX3BlbmRpbmdUcmFuc3BvcnRTd2l0Y2ggPSB0cnVlO1xuXHRcdFx0Ly8gQWR2YW5jZSB0aGUgcGlwZWxpbmUncyBERVNJUkVEIG1vZGVsL2VmZm9ydCAod2l0aG91dCB0b3VjaGluZyB0aGVcblx0XHRcdC8vIGRvb21lZCBvbGQtdHJhbnNwb3J0IFF1ZXJ5KSBzbyB0aGUgcmVidWlsZCdzIGNvbmZpZyByZXBsYXkgcmUtYXNzZXJ0c1xuXHRcdFx0Ly8gVEhJUyBzZWxlY3Rpb24gb24gdGhlIG5ldyBzdWJwcm9jZXNzLiBUaGUgcmVzdW1lIHJlcGxheXMgdGhlIHByZS1zd2l0Y2hcblx0XHRcdC8vIGAvbW9kZWxgLCBzbyBza2lwcGluZyB0aGlzIGxldHMgdGhlIHJlYnVpbHQgc3VicHJvY2VzcyBzaWxlbnRseSByZXZlcnRcblx0XHRcdC8vIHRvIHRoZSBvbGQgbW9kZWwgb24gdGhlIG5ldyB0cmFuc3BvcnQgKFx1MjE5MiBgbW9kZWxfbm90X3N1cHBvcnRlZGApLlxuXHRcdFx0dGhpcy5fcGlwZWxpbmU/LmJ1ZmZlckNvbmZpZ0ZvclJlYmluZCh0b0NsYXVkZVNka01vZGVsSWQobW9kZWwpLCB0b1J1bnRpbWVFZmZvcnRMZXZlbChyZXNvbHZlQ2xhdWRlRWZmb3J0KG1vZGVsKSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fcGlwZWxpbmUpIHtcblx0XHRcdC8vIEEgc2FtZS10cmFuc3BvcnQgaG90LXN3YXAgc3VwZXJzZWRlcyBhbnkgc3RpbGwtcGVuZGluZyBjcm9zcy10cmFuc3BvcnRcblx0XHRcdC8vIHN3aXRjaDogdGhlIHVzZXIgaGFzIG5vdyBsYW5kZWQgb24gYSBtb2RlbCB0aGUgbGl2ZSBzdWJwcm9jZXNzIGNhbiBzZXJ2ZSxcblx0XHRcdC8vIHNvIGNsZWFyIHRoZSBmbGFnIHRvIHNwYXJlIHRoZSBuZXh0IGBzZW5kYCBhIG5lZWRsZXNzIGZ1bGwgcmVidWlsZC4gVGhlXG5cdFx0XHQvLyBgc2V0TW9kZWxgL2BzZXRFZmZvcnRgIGNhbGxzIGJlbG93IHJlLWFzc2VydCB0aGlzIHNlbGVjdGlvbiBhcyB0aGVcblx0XHRcdC8vIHBpcGVsaW5lJ3MgZGVzaXJlZCBjb25maWcsIG92ZXJ3cml0aW5nIHdoYXRldmVyIHRoZSBkZWZlcnJlZCBwYXRoIGJ1ZmZlcmVkLlxuXHRcdFx0dGhpcy5fcGVuZGluZ1RyYW5zcG9ydFN3aXRjaCA9IGZhbHNlO1xuXHRcdFx0Ly8gRHJvcCBhbnkgdHJhbnNwb3J0IGEgc3VwZXJzZWRlZCBzd2l0Y2gncyBgc2VuZGAgaGFkIGFscmVhZHkgc3RhZ2VkLCBzbyBhXG5cdFx0XHQvLyBsYXRlciBvcmRpbmFyeSByZWJ1aWxkIGNhbid0IHBpY2sgaXQgdXAgYW5kIHJlcm91dGUgdGhpcyBsaXZlIHNlc3Npb24uXG5cdFx0XHR0aGlzLl9wZW5kaW5nU3dpdGNoVHJhbnNwb3J0ID0gdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgdGhpcy5fcGlwZWxpbmUuc2V0TW9kZWwodG9DbGF1ZGVTZGtNb2RlbElkKG1vZGVsKSk7XG5cdFx0XHQvLyBBbHdheXMgcHVzaCB0aGUgcmVzb2x2ZWQgZWZmb3J0LCBpbmNsdWRpbmcgYHVuZGVmaW5lZGAuIFN3aXRjaGluZ1xuXHRcdFx0Ly8gdG8gYSBtb2RlbCB0aGF0IGRvZXMgbm90IHN1cHBvcnQgcmVhc29uaW5nIGVmZm9ydCAoZS5nLiBIYWlrdSlcblx0XHRcdC8vIHJlc29sdmVzIHRvIGB1bmRlZmluZWRgLCB3aGljaCBtdXN0IGFjdGl2ZWx5IENMRUFSIGFueSBlZmZvcnQgdGhlXG5cdFx0XHQvLyBTREsgaXMgc3RpbGwgYXBwbHlpbmcgZnJvbSBhIHByaW9yIGVmZm9ydC1jYXBhYmxlIG1vZGVsIFx1MjAxNCBvdGhlcndpc2Vcblx0XHRcdC8vIHRoZSBuZXh0IHR1cm4gcmVwbGF5cyBlLmcuIGAnaGlnaCdgIG9udG8gSGFpa3UgYW5kIHRoZSBBUEkgNDAwc1xuXHRcdFx0Ly8gKGBvdXRwdXRfY29uZmlnLmVmZm9ydCAuLi4gZG9lcyBub3Qgc3VwcG9ydCByZWFzb25pbmcgZWZmb3J0YCkuXG5cdFx0XHRhd2FpdCB0aGlzLl9waXBlbGluZS5zZXRFZmZvcnQodG9SdW50aW1lRWZmb3J0TGV2ZWwocmVzb2x2ZUNsYXVkZUVmZm9ydChtb2RlbCkpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJlLW1hdGVyaWFsaXplIGN1c3RvbS1hZ2VudCBzZWxlY3Rpb24gYWNjZXNzb3IuXG5cdCAqL1xuXHRnZXQgcHJvdmlzaW9uYWxBZ2VudCgpOiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm92aXNpb25hbEFnZW50OyB9XG5cblx0LyoqXG5cdCAqIENoYW5nZSAob3IgY2xlYXIgd2l0aCBgdW5kZWZpbmVkYCkgdGhlIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCBmb3IgdGhpc1xuXHQgKiBzZXNzaW9uLiBUaGUgU0RLIGNhcHR1cmVzIGBPcHRpb25zLmFnZW50YCBhdCBzdGFydHVwIHdpdGggbm9cblx0ICogd29ya2luZyBydW50aW1lIGNvbnRyb2wgKGBhcHBseUZsYWdTZXR0aW5ncyh7IGFnZW50IH0pYCBleGlzdHMgb25cblx0ICogdGhlIFNESyBzdXJmYWNlIGJ1dCBkb2Vzbid0IGFjdHVhbGx5IHN3YXAgdGhlIGxpdmUgYWdlbnQpLCBzb1xuXHQgKiBwb3N0LW1hdGVyaWFsaXplIGNhbGxzIGZsaXAge0BsaW5rIGNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn1cblx0ICogZGlydHkgYW5kIHRoZSBuZXh0IGBzZW5kKClgIHByZS1mbGlnaHQgcmViaW5kcyB3aXRoIHRoZSBuZXcgYWdlbnRcblx0ICogYmFrZWQgaW50byB0aGUgcmVidWlsdCBgUXVlcnlgLiBQZXJzaXN0ZW5jZSBpcyBob3N0LW93bmVkOyBjYWxsZXJzIHVwZGF0ZVxuXHQgKiB0aGUgb3ZlcmxheSBzZXBhcmF0ZWx5LlxuXHQgKi9cblx0YXN5bmMgc2V0QWdlbnQoYWdlbnQ6IEFnZW50U2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3Byb3Zpc2lvbmFsQWdlbnQgPT09IGFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3Zpc2lvbmFsQWdlbnQgPSBhZ2VudDtcblx0XHRpZiAodGhpcy5fcGlwZWxpbmUpIHtcblx0XHRcdC8vIEZvcmNlIGEgcmViaW5kIG9uIHRoZSBuZXh0IHNlbmQoKTsgdGhlIFNESyBoYXMgbm8gd29ya2luZ1xuXHRcdFx0Ly8gcnVudGltZSBob29rIHRvIHN3YXAgdGhlIGFnZW50IGluIHBsYWNlLlxuXHRcdFx0dGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYubWFya0RpcnR5KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEluamVjdCBhIHN0ZWVyaW5nIG1lc3NhZ2UuIEJ1aWxkcyB0aGUgYHByaW9yaXR5OiAnbm93J2Bcblx0ICoge0BsaW5rIFNES1VzZXJNZXNzYWdlfSBhbmQgaGFuZHMgaXQgdG8gdGhlIHBpcGVsaW5lOyB0aGUgcGlwZWxpbmVcblx0ICogaW5oZXJpdHMgdGhlIHBhcmVudCdzIHR1cm5JZCAoQ09OVEVYVC5tZCBNMTApIGFuZCBmaXJlc1xuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHdoZW4gdGhlIFNESyBhY2NlcHRzIGl0LiBOby1vcCBpZiB0aGUgcGlwZWxpbmVcblx0ICogaXMgYWJvcnRlZC5cblx0ICovXG5cdGluamVjdFN0ZWVyaW5nKHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBwaXBlbGluZSA9IHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpO1xuXHRcdGlmIChwaXBlbGluZS5pc0Fib3J0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudEJsb2NrcyA9IHJlc29sdmVQcm9tcHRUb0NvbnRlbnRCbG9ja3MoXG5cdFx0XHRzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS50ZXh0LFxuXHRcdFx0c3RlZXJpbmdNZXNzYWdlLm1lc3NhZ2UuYXR0YWNobWVudHMsXG5cdFx0KTtcblx0XHRjb25zdCBzZGtNZXNzYWdlOiBTREtVc2VyTWVzc2FnZSA9IHtcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdG1lc3NhZ2U6IHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiBjb250ZW50QmxvY2tzIH0sXG5cdFx0XHRzZXNzaW9uX2lkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHByaW9yaXR5OiAnbm93Jyxcblx0XHRcdC8vIFJldXNlIHRoZSBwcm90b2NvbCBQZW5kaW5nTWVzc2FnZS5pZCBhcyB0aGUgU0RLIHV1aWQgXHUyMDE0IHNhbWVcblx0XHRcdC8vIHBhdHRlcm4gYXMgYENsYXVkZUFnZW50LnNlbmRNZXNzYWdlYCByZXVzaW5nIHR1cm5JZC4gVGhlIFNESydzXG5cdFx0XHQvLyBgdXVpZGAgZmllbGQgaXMgdHlwZWQgYXMgYSBicmFuZGVkIFVVSUQsIGJ1dCB0aGUgY2FzdCBhdCB0aGVcblx0XHRcdC8vIGJvdW5kYXJ5IGlzIHRoZSBjb252ZW50aW9uIGZvciBib3RoIGNvZGUgcGF0aHMuXG5cdFx0XHR1dWlkOiBzdGVlcmluZ01lc3NhZ2UuaWQgYXMgYCR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ31gLFxuXHRcdH07XG5cdFx0cGlwZWxpbmUuaW5qZWN0U3RlZXJpbmcoc2RrTWVzc2FnZSwgc3RlZXJpbmdNZXNzYWdlLmlkKTtcblx0fVxuXG5cdC8qKiBMaXZlIHBlcm1pc3Npb24tbW9kZSBjaGFuZ2UuIEZvcndhcmRzIHRvIHRoZSBwaXBlbGluZTsgdGhlIHBpcGVsaW5lIHJlbWVtYmVycyBpdCBmb3IgcmUtYXBwbGljYXRpb24gYWZ0ZXIgYSByZWJpbmQuICovXG5cdHNldFBlcm1pc3Npb25Nb2RlKG1vZGU6IFBlcm1pc3Npb25Nb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnNldFBlcm1pc3Npb25Nb2RlKG1vZGUpO1xuXHR9XG5cblx0c2V0SW5oZXJpdGVkUGVybWlzc2lvbk1vZGUobW9kZTogQ2xhdWRlUGVybWlzc2lvbk1vZGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9pbmhlcml0ZWRQZXJtaXNzaW9uTW9kZSA9IG1vZGU7XG5cdFx0aWYgKCF0aGlzLl9waXBlbGluZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGlwZWxpbmUuc2V0UGVybWlzc2lvbk1vZGUobW9kZSA/PyB0aGlzLl9wZXJtaXNzaW9uTW9kZUZhbGxiYWNrKTtcblx0fVxuXG5cdC8vICNyZWdpb24gUGhhc2UgNyAvIFMzLjIgXHUyMDE0IHBlbmRpbmcgc3RhdGVcblxuXHQvKipcblx0ICogQXRvbWljYWxseSByZWdpc3RlciBhIHBlbmRpbmctcGVybWlzc2lvbiBkZWZlcnJlZCBhbmQgZmlyZSB0aGVcblx0ICogYHBlbmRpbmdfY29uZmlybWF0aW9uYCBzaWduYWwuIFRoZSBTREsgaXMgYmxvY2tlZCBvbiB0aGUgcmV0dXJuZWRcblx0ICogcHJvbWlzZSBpbnNpZGUgaXRzIGBjYW5Vc2VUb29sYCBjYWxsYmFjayB1bnRpbFxuXHQgKiB7QGxpbmsgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3R9IHJlc29sdmVzIGl0LiBSZXNvbHZlcyB3aXRoXG5cdCAqIGBmYWxzZWAgaWYgdGhlIHBpcGVsaW5lIGlzIGFib3J0ZWQuXG5cdCAqL1xuXHRyZXF1ZXN0UGVybWlzc2lvbihhcmdzOiB7XG5cdFx0cmVhZG9ubHkgdG9vbFVzZUlEOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgc3RhdGU6IFRvb2xDYWxsUGVuZGluZ0NvbmZpcm1hdGlvblN0YXRlO1xuXHRcdHJlYWRvbmx5IHBlcm1pc3Npb25LaW5kOiBDbGF1ZGVQZXJtaXNzaW9uS2luZDtcblx0XHRyZWFkb25seSBwZXJtaXNzaW9uUGF0aD86IHN0cmluZztcblx0XHQvKiogUGhhc2UgMTIgc3RlcCA1IFx1MjAxNCB3aGVuIHRoZSBjb25maXJtYXRpb24gYmVsb25ncyB0byBhIHN1YmFnZW50IGNvbnRleHQsIHJvdXRlIGl0IHRvIHRoZSBzdWJhZ2VudCBzZXNzaW9uLiAqL1xuXHRcdHJlYWRvbmx5IHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmc7XG5cdH0pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuX3BpcGVsaW5lIHx8IHRoaXMuX3BpcGVsaW5lLmlzQWJvcnRlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMucmVnaXN0ZXJBbmRGaXJlKGFyZ3MudG9vbFVzZUlELCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0Y2hhdDogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdHN0YXRlOiBhcmdzLnN0YXRlLFxuXHRcdFx0XHRwZXJtaXNzaW9uS2luZDogYXJncy5wZXJtaXNzaW9uS2luZCxcblx0XHRcdFx0Li4uKGFyZ3MucGVybWlzc2lvblBhdGggIT09IHVuZGVmaW5lZCA/IHsgcGVybWlzc2lvblBhdGg6IGFyZ3MucGVybWlzc2lvblBhdGggfSA6IHt9KSxcblx0XHRcdFx0Li4uKGFyZ3MucGFyZW50VG9vbENhbGxJZCAhPT0gdW5kZWZpbmVkID8geyBwYXJlbnRUb29sQ2FsbElkOiBhcmdzLnBhcmVudFRvb2xDYWxsSWQgfSA6IHt9KSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdElkOiBzdHJpbmcsIGFwcHJvdmVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5yZXNwb25kKHJlcXVlc3RJZCwgYXBwcm92ZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcmUgYSB7QGxpbmsgQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWR9IGFjdGlvbiBhbmQgcGFyayBvblxuXHQgKiBhIGRlZmVycmVkIHVudGlsIHtAbGluayByZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0fSByZXNvbHZlcyBpdC5cblx0ICogUmVzb2x2ZXMgd2l0aCBgeyByZXNwb25zZTogQ2FuY2VsIH1gIGlmIHRoZSBwaXBlbGluZSBpcyBhYm9ydGVkLlxuXHQgKi9cblx0cmVxdWVzdFVzZXJJbnB1dChyZXF1ZXN0OiBDaGF0SW5wdXRSZXF1ZXN0LCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogUHJvbWlzZTx7IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQ7IGFuc3dlcnM/OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+IH0+IHtcblx0XHRpZiAoIXRoaXMuX3BpcGVsaW5lIHx8IHRoaXMuX3BpcGVsaW5lLmlzQWJvcnRlZCB8fCAhdGhpcy5fcGlwZWxpbmUuaGFzQWN0aXZlVHVybikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ1VzZXJJbnB1dHMucmVnaXN0ZXJBbmRGaXJlKHJlcXVlc3QuaWQsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQuLi4ocGFyZW50VG9vbENhbGxJZCAhPT0gdW5kZWZpbmVkID8geyBwYXJlbnRUb29sQ2FsbElkIH0gOiB7fSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3QoXG5cdFx0cmVxdWVzdElkOiBzdHJpbmcsXG5cdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCxcblx0XHRhbnN3ZXJzPzogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPixcblx0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdVc2VySW5wdXRzLnJlc3BvbmQocmVxdWVzdElkLCB7IHJlc3BvbnNlLCBhbnN3ZXJzIH0pO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGhhc2UgMTAgXHUyMDE0IGNsaWVudCB0b29sc1xuXG5cdC8qKiBSZXBsYWNlIGEgY2xpZW50J3MgcmVnaXN0ZXJlZCB0b29scyAoZnVsbCByZXBsYWNlbWVudCkuICovXG5cdHNldENsaWVudFRvb2xzKGNsaWVudElkOiBzdHJpbmcsIHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdKTogdm9pZCB7XG5cdFx0dGhpcy50b29sRGlmZi5tb2RlbC5zZXRUb29scyhjbGllbnRJZCwgdG9vbHMpO1xuXHR9XG5cblx0LyoqIFRoaXMgY2xpZW50J3MgcmVnaXN0ZXJlZCB0b29scyAoZW1wdHkgd2hlbiBhYnNlbnQpLiAqL1xuXHRnZXRDbGllbnRUb29scyhjbGllbnRJZDogc3RyaW5nKTogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMudG9vbERpZmYubW9kZWwuZ2V0VG9vbHMoY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqIFJlbW92ZSBhIGNsaWVudCdzIHRvb2wgY29udHJpYnV0aW9uIGZyb20gdGhpcyBzZXNzaW9uLiAqL1xuXHRyZW1vdmVDbGllbnRUb29scyhjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50b29sRGlmZi5tb2RlbC5yZW1vdmVDbGllbnQoY2xpZW50SWQpO1xuXHR9XG5cblx0LyoqIFJlbW92ZSBhIGNsaWVudCdzIGN1c3RvbWl6YXRpb24gY29udHJpYnV0aW9uIGZyb20gdGhpcyBzZXNzaW9uLiAqL1xuXHRyZW1vdmVDbGllbnRDdXN0b21pemF0aW9ucyhjbGllbnRJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYubW9kZWwucmVtb3ZlQ2xpZW50KGNsaWVudElkKTtcblx0XHRpZiAodGhpcy5fY2xpZW50Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQuZGVsZXRlKGNsaWVudElkKSkge1xuXHRcdFx0dGhpcy5fcmVidWlsZENsaWVudEN1c3RvbWl6YXRpb25FbmFibGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgYSBwYXJrZWQgY2xpZW50LXRvb2wgTUNQIGhhbmRsZXIgd2l0aCB0aGUgd29ya2JlbmNoLXN1cHBsaWVkXG5cdCAqIHJlc3VsdC4gUmV0dXJucyBgdHJ1ZWAgaWYgYSBtYXRjaGluZyBkZWZlcnJlZCB3YXMgZm91bmQgYW5kIHNldHRsZWQuXG5cdCAqIFVua25vd24gaWRzIGFyZSBhIGJlbmlnbiBuby1vcCBcdTIwMTQgYGFnZW50U2lkZUVmZmVjdHMudHNgIGZvcndhcmRzIGV2ZXJ5XG5cdCAqIGBDaGF0VG9vbENhbGxDb21wbGV0ZWAgZW52ZWxvcGUsIHNvIFNESy1vd25lZCB0b29sIGNvbXBsZXRpb25zIGxhbmRcblx0ICogaGVyZSB0b28gYW5kIG11c3QgTk9UIHRocm93LlxuXHQgKi9cblx0Y29tcGxldGVDbGllbnRUb29sQ2FsbCh0b29sQ2FsbElkOiBzdHJpbmcsIHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0VG9vbENhbGxSZXN1bHQocmVzdWx0LCB0b29sQ2FsbElkKTtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZXNwb25kKHRvb2xDYWxsSWQsIGNvbnZlcnRlZCk7XG5cdH1cblxuXHQvKipcblx0ICogRHJpdmUgYSB5aWVsZC1yZXN0YXJ0IHNvIHRoZSBTREsgcGlja3MgdXAgdGhlIG5ldyBjbGllbnQtdG9vbCBzZXRcblx0ICogb24gaXRzIG5leHQgdXNlciByZXF1ZXN0LiBQdWJsaWMgZW50cnkgcG9pbnQgZm9yIGNhbGxlcnMgdGhhdCBuZWVkXG5cdCAqIHRvIGZvcmNlIGEgdG9vbC1vbmx5IHJlYmluZDsgaW50ZXJuYWwgcHJlLWZsaWdodCBnb2VzIHRocm91Z2hcblx0ICoge0BsaW5rIF9yZWJpbmRGb3JTeW5jZWRTdGF0ZX0uXG5cdCAqL1xuXHRhc3luYyByZWJpbmRGb3JDbGllbnRUb29scygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZWJpbmRGb3JTeW5jZWRTdGF0ZSgpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGhhc2UgMTEgXHUyMDE0IGN1c3RvbWl6YXRpb25zIC8gcGx1Z2luc1xuXG5cdC8qKlxuXHQgKiBNZXJnZWQgZmlyZS1hbmQtZm9yZ2V0IHNpZ25hbCB0aGF0IHRoaXMgc2Vzc2lvbidzIGN1c3RvbWl6YXRpb25cblx0ICogc3VyZmFjZSBjaGFuZ2VkLiBGaXJlcyBmcm9tIHRocmVlIHNvdXJjZXM6XG5cdCAqXG5cdCAqIDEuIENsaWVudC1zaWRlIHdyaXRlcyAoYGFkb3B0Q2xpZW50Q3VzdG9taXphdGlvbnNgKSBcdTIwMTQgdmlhIHRoZVxuXHQgKiAgICB7QGxpbmsgU2Vzc2lvbkNsaWVudEN1c3RvbWl6YXRpb25zRGlmZn0gb2JzZXJ2YWJsZSB3aXJlZCB1cCBpbiB0aGVcblx0ICogICAgY29uc3RydWN0b3IuXG5cdCAqIDIuIE1hdGVyaWFsaXplIGNvbXBsZXRlcyBcdTIwMTQgc3VyZmFjZXMgdGhlIHNlcnZlci1zaWRlXG5cdCAqICAgIChTREstZGlzY292ZXJlZCkgdGllciB0byB0aGUgd29ya2JlbmNoIGZvciB0aGUgZmlyc3QgdGltZS5cblx0ICogMy4gVGhlIHNlbmQoKSBwcmUtZmxpZ2h0IHJlYmluZCBjb21wbGV0ZXMgXHUyMDE0IHRoZSByZWJ1aWx0IFNESydzXG5cdCAqICAgIHJlc29sdmVkIHNldCBtYXkgaGF2ZSBjaGFuZ2VkLlxuXHQgKlxuXHQgKiBEcml2ZXMgYSB3b3JrYmVuY2ggcmVmZXRjaCBvZiB7QGxpbmsgZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zfS5cblx0ICogRG9lcyBOT1QgaXRzZWxmIHRyaWdnZXIgYW55IFNESyBhY3Rpb24gXHUyMDE0IHRoZSBkaXJ0eSBiaXQgb25cblx0ICoge0BsaW5rIFNlc3Npb25DbGllbnRDdXN0b21pemF0aW9uc0RpZmZ9IGRyaXZlcyBwbHVnaW4gcmViaW5kcyxcblx0ICogYW5kIG9ubHkgZmxpcHMgb24gY2xpZW50LXNpZGUgd3JpdGVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEFkb3B0IHRoZSByZXN1bHQgb2YgYSBnbG9iYWwge0BsaW5rIElBZ2VudFBsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zfVxuXHQgKiBwYXNzICgqKmNsaWVudC1wdXNoZWQqKiBwYXRoKS4gVGhlIGFnZW50IG93bnMgdGhlIG1hbmFnZXIgKGl0J3Ncblx0ICogYSBwcm9jZXNzLXdpZGUgc2luZ2xldG9uIHdpdGggYSBzaGFyZWQgb24tZGlzayBjYWNoZSkgYW5kIHB1c2hlc1xuXHQgKiB0aGUgcmVzdWx0aW5nIHNuYXBzaG90IGRvd24gaGVyZS4gRmxpcHMgdGhlIGNsaWVudC1zaWRlIGRpcnR5IGJpdFxuXHQgKiBzbyB0aGUgbmV4dCB7QGxpbmsgc2VuZH0gcHJlLWZsaWdodCByZWxvYWRzIFNESyBwbHVnaW5zLlxuXHQgKi9cblx0YWRvcHRDbGllbnRDdXN0b21pemF0aW9ucyhjbGllbnRJZDogc3RyaW5nLCBzeW5jZWQ6IHJlYWRvbmx5IElTeW5jZWRDdXN0b21pemF0aW9uW10sIGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tb2RlbC5zZXRTeW5jZWRDdXN0b21pemF0aW9ucyhjbGllbnRJZCwgc3luY2VkKTtcblx0XHRjb25zdCBwbHVnaW5FbmFibGVtZW50ID0gbmV3IE1hcDxzdHJpbmcsIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24+KCk7XG5cdFx0Y29uc3QgY2hpbGRFbmFibGVtZW50ID0gbmV3IE1hcDxzdHJpbmcsIFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10+Pj4oKTtcblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdHBsdWdpbkVuYWJsZW1lbnQuc2V0KGN1c3RvbWl6YXRpb24udXJpLnRvU3RyaW5nKCksIGN1c3RvbWl6YXRpb24pO1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb24uY2hpbGRFbmFibGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2hpbGRFbmFibGVtZW50LnNldChjdXN0b21pemF0aW9uLnVyaS50b1N0cmluZygpLCBjdXN0b21pemF0aW9uLmNoaWxkRW5hYmxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFJlLWluc2VydGluZyBtb3ZlcyB0aGUgbGF0ZXN0IGNsaWVudCBzbmFwc2hvdCB0byB0aGUgZW5kLCBwcmVzZXJ2aW5nXG5cdFx0Ly8gdGhlIHByZXZpb3VzIGxhc3Qtd3JpdGUtd2lucyBtZXJnZSBwcmVjZWRlbmNlIGFjcm9zcyBjbGllbnRzLlxuXHRcdHRoaXMuX2NsaWVudEN1c3RvbWl6YXRpb25FbmFibGVtZW50LmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0dGhpcy5fY2xpZW50Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQuc2V0KGNsaWVudElkLCB7IHBsdWdpbkVuYWJsZW1lbnQsIGNoaWxkRW5hYmxlbWVudCB9KTtcblx0XHR0aGlzLl9yZWJ1aWxkQ2xpZW50Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbmFwc2hvdCBvZiB0aGUgKipjbGllbnQtcHVzaGVkKiogY3VzdG9taXphdGlvbnMgb24gdGhpcyBzZXNzaW9uLlxuXHQgKiBEb2VzIE5PVCBpbmNsdWRlIHNlcnZlci1zaWRlIChTREstZGlzY292ZXJlZCkgZW50cmllcyBcdTIwMTQgdXNlXG5cdCAqIHtAbGluayBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnN9IGZvciB0aGUgbWVyZ2VkIHZpZXcuXG5cdCAqL1xuXHRnZXRDbGllbnRDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBJU3luY2VkQ3VzdG9taXphdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5jbGllbnRDdXN0b21pemF0aW9uc0RpZmYubW9kZWwuc3RhdGUuZ2V0KCkuc3luY2VkO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IG9mIHRoZSBsYXN0IHtAbGluayBnZXRTZXNzaW9uQ3VzdG9taXphdGlvbnN9IHJlc3VsdCwgcmVhZCBieSB7QGxpbmsgX2VucmljaFNpZ25hbFdpdGhNY3BDb250cmlidXRvcn0uICovXG5cdHByaXZhdGUgX2xhc3RDdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudENoaWxkRW5hYmxlbWVudCA9IG5ldyBNYXA8c3RyaW5nLCBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdPj4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudFBsdWdpbkVuYWJsZW1lbnQgPSBuZXcgTWFwPHN0cmluZywgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQgPSBuZXcgTWFwPHN0cmluZywge1xuXHRcdHJlYWRvbmx5IHBsdWdpbkVuYWJsZW1lbnQ6IFJlYWRvbmx5TWFwPHN0cmluZywgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbj47XG5cdFx0cmVhZG9ubHkgY2hpbGRFbmFibGVtZW50OiBSZWFkb25seU1hcDxzdHJpbmcsIFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHJlYWRvbmx5IEN1c3RvbWl6YXRpb25FbmFibGVtZW50W10+Pj47XG5cdH0+KCk7XG5cblx0cHJpdmF0ZSBfcmVidWlsZENsaWVudEN1c3RvbWl6YXRpb25FbmFibGVtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsaWVudENoaWxkRW5hYmxlbWVudC5jbGVhcigpO1xuXHRcdHRoaXMuX2NsaWVudFBsdWdpbkVuYWJsZW1lbnQuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGVuYWJsZW1lbnQgb2YgdGhpcy5fY2xpZW50Q3VzdG9taXphdGlvbkVuYWJsZW1lbnQudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3QgW3VyaSwgcGx1Z2luXSBvZiBlbmFibGVtZW50LnBsdWdpbkVuYWJsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50UGx1Z2luRW5hYmxlbWVudC5zZXQodXJpLCBwbHVnaW4pO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbdXJpLCBjaGlsZHJlbl0gb2YgZW5hYmxlbWVudC5jaGlsZEVuYWJsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50Q2hpbGRFbmFibGVtZW50LnNldCh1cmksIGNoaWxkcmVuKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdCB0aGUgdW5pb24gb2YgKGEpICoqY2xpZW50LXB1c2hlZCoqIGN1c3RvbWl6YXRpb25zIGFuZFxuXHQgKiAoYikgdGhlICoqc2VydmVyLXNpZGUqKiAoU0RLLWRpc2NvdmVyZWQpIHZpZXcgKGNvbW1hbmRzIC8gYWdlbnRzXG5cdCAqIC8gTUNQIHNlcnZlcnMsIGluY2x1ZGluZyB0aG9zZSB0aGUgU0RLIGRpc2NvdmVyZWQgb24gaXRzIG93blxuXHQgKiBmcm9tIGB+Ly5jbGF1ZGUvKipgKSBvbnRvIHRoZSBwcm90b2NvbCdzXG5cdCAqIHtAbGluayBDdXN0b21pemF0aW9ufSBzdXJmYWNlLCB3aXRoIHJlZHVjZXItYmFja2VkIGVuYWJsZW1lbnRcblx0ICogYXBwbGllZCB0byBjbGllbnQtcHVzaGVkIGVudHJpZXMuXG5cdCAqXG5cdCAqIFByZS1tYXRlcmlhbGl6ZSBzZXNzaW9ucyByZXR1cm4gb25seSB0aGUgY2xpZW50LXB1c2hlZCBwcm9qZWN0aW9uXG5cdCAqIFx1MjAxNCB0aGUgU0RLIHNpZGUgaGFzIG5vIFF1ZXJ5IHRvIHF1ZXJ5IHlldC4gQSBmYWlsdXJlIHRvIHJlYWQgdGhlXG5cdCAqIFNESyBzbmFwc2hvdCBpcyB3YXJuLWxvZ2dlZCBhbmQgdGhlIGNsaWVudC1wdXNoZWQgcHJvamVjdGlvbiBpc1xuXHQgKiBzdGlsbCByZXR1cm5lZCwgc28gYSB0cmFuc2llbnQgU0RLIGhpY2N1cCBkb2Vzbid0IGJsYW5rIHRoZSBVSS5cblx0ICovXG5cdGFzeW5jIGdldFNlc3Npb25DdXN0b21pemF0aW9ucygpOiBQcm9taXNlPHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHsgc3luY2VkIH0gPSB0aGlzLmNsaWVudEN1c3RvbWl6YXRpb25zRGlmZi5tb2RlbC5zdGF0ZS5nZXQoKTtcblx0XHRjb25zdCB1c2VySG9tZSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZTtcblx0XHRjb25zdCBbbXVsdGlSb290LCBydWxlcywgbWNwU2VydmVycywgaG9va3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGlzY292ZXJDbGF1ZGVNdWx0aVJvb3RDdXN0b21pemF0aW9ucyh0aGlzLndvcmtpbmdEaXJlY3RvcmllcywgdXNlckhvbWUsIHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlKSxcblx0XHRcdHNjYW5DbGF1ZGVSdWxlcyh0aGlzLndvcmtpbmdEaXJlY3RvcnksIHVzZXJIb21lLCB0aGlzLl9maWxlU2VydmljZSksXG5cdFx0XHRzY2FuQ2xhdWRlTWNwU2VydmVycyh0aGlzLndvcmtpbmdEaXJlY3RvcnksIHVzZXJIb21lLCB0aGlzLl9maWxlU2VydmljZSksXG5cdFx0XHRzY2FuQ2xhdWRlSG9va3ModGhpcy53b3JraW5nRGlyZWN0b3J5LCB1c2VySG9tZSwgdGhpcy5fZmlsZVNlcnZpY2UpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gUG9zdC1tYXRlcmlhbGl6ZSwgdGhlIGxpdmUgU0RLIHNuYXBzaG90IGZpbHRlcnMgdGhlIGRpc2sgc2V0IGRvd24gdG9cblx0XHQvLyB3aGF0IHRoZSBzZXNzaW9uIGFjdHVhbGx5IGxvYWRlZCAoYW5kIHN1cmZhY2VzIFNESy1vbmx5IGl0ZW1zIGFzXG5cdFx0Ly8gbm9uLWVkaXRhYmxlKS4gUHJlLW1hdGVyaWFsaXplIHRoZXJlIGlzIG5vIFF1ZXJ5LCBzbyB0aGUgZnVsbCBkaXNrXG5cdFx0Ly8gc2V0IGlzIHNob3duLiBBIHRyYW5zaWVudCBTREsgcmVhZCBmYWlsdXJlIGxlYXZlcyBgc2RrYCB1bmRlZmluZWQsXG5cdFx0Ly8gZmFsbGluZyBiYWNrIHRvIHRoZSB1bmZpbHRlcmVkIGRpc2sgc2V0IHJhdGhlciB0aGFuIGJsYW5raW5nIHRoZSBVSS5cblx0XHRsZXQgc2RrOiBJU2RrUmVzb2x2ZWRDdXN0b21pemF0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fcGlwZWxpbmUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNkayA9IGF3YWl0IHRoaXMuX3BpcGVsaW5lLnNuYXBzaG90UmVzb2x2ZWRDdXN0b21pemF0aW9ucygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gc25hcHNob3RSZXNvbHZlZEN1c3RvbWl6YXRpb25zIGZhaWxlZGAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYGJ1aWxkRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zYCBhbHNvIGZvbGRzIGluIHRoZSByZWFkLW9ubHkgXCJCdWlsdC1pblwiXG5cdFx0Ly8gc3VyZmFjaW5nIChjdXJhdGVkIHByZS1tYXRlcmlhbGl6ZSwgU0RLLWRlcml2ZWQgcG9zdC1tYXRlcmlhbGl6ZSkgZm9yXG5cdFx0Ly8gYm90aCBhZ2VudHMgYW5kIHNraWxscywgc28gdGhlIFNESy12cy1jdXJhdGVkIGRlY2lzaW9uIGxpdmVzIGluIG9uZSBwbGFjZS5cblx0XHRjb25zdCBkaXNjb3ZlcmVkQ3VzdG9taXphdGlvbnMgPSBidWlsZERpc2NvdmVyZWRDdXN0b21pemF0aW9ucyhbLi4ubXVsdGlSb290LmRpc2NvdmVyZWQsIC4uLnJ1bGVzXSwgbWNwU2VydmVycywgaG9va3MsIG11bHRpUm9vdC5uYXRpdmVQbHVnaW5zLCBtdWx0aVJvb3Qud29ya2luZ0RpcmVjdG9yaWVzLCB1c2VySG9tZSwgc2RrKTtcblxuXHRcdC8vIEZpbmFsIHByb2plY3Rpb246IHRoZSBjbGllbnQtcHVzaGVkIHRpZXIgZmlyc3QsIHRoZW4gdGhlIGRpc2NvdmVyZWRcblx0XHQvLyB0aWVyLCB3aXRoIHNlc3Npb24gTUNQIGVuYWJsZW1lbnQgYXBwbGllZCB0byBib3RoLlxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zO1xuXHRcdGNvbnN0IHJlc3VsdDogQ3VzdG9taXphdGlvbltdID0gc3luY2VkLm1hcChpdGVtID0+IHtcblx0XHRcdGNvbnN0IGRlc2lyZWQgPSBzdGF0ZS5maW5kKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5pZCA9PT0gaXRlbS5jdXN0b21pemF0aW9uLmlkKTtcblx0XHRcdGlmIChkZXNpcmVkPy50eXBlICE9PSBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4pIHtcblx0XHRcdFx0cmV0dXJuIGl0ZW0uY3VzdG9taXphdGlvbjtcblx0XHRcdH1cblx0XHRcdGlmIChkZXNpcmVkLmVuYWJsZW1lbnQ/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4geyAuLi5pdGVtLmN1c3RvbWl6YXRpb24sIGVuYWJsZW1lbnQ6IFsuLi5kZXNpcmVkLmVuYWJsZW1lbnRdIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IGVuYWJsZW1lbnQ6IF9lbmFibGVtZW50LCAuLi53aXRob3V0RW5hYmxlbWVudCB9ID0gaXRlbS5jdXN0b21pemF0aW9uO1xuXHRcdFx0cmV0dXJuIHdpdGhvdXRFbmFibGVtZW50O1xuXHRcdH0pO1xuXHRcdHJlc3VsdC5wdXNoKC4uLmRpc2NvdmVyZWRDdXN0b21pemF0aW9ucyk7XG5cdFx0Ly8gQ2FjaGUgZm9yIHRoZSBNQ1AtY29udHJpYnV0b3Igc2lnbmFsIGVucmljaG1lbnQgKHNlZVxuXHRcdC8vIHtAbGluayBfZW5yaWNoU2lnbmFsV2l0aE1jcENvbnRyaWJ1dG9yfSkuXG5cdFx0Y29uc3QgcHJvamVjdGVkID0gYXBwbHlNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc3VsdCwgc3RhdGUpO1xuXHRcdGNvbnN0IGVuYWJsZWQgPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQodGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb3VyY2UsIHByb2plY3RlZCwgdGhpcy5fY2xpZW50Q2hpbGRFbmFibGVtZW50LCB0aGlzLl9jbGllbnRQbHVnaW5FbmFibGVtZW50KTtcblx0XHR0aGlzLl9sYXN0Q3VzdG9taXphdGlvbnMgPSBlbmFibGVkLmN1c3RvbWl6YXRpb25zO1xuXHRcdHJldHVybiBlbmFibGVkLmN1c3RvbWl6YXRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudChmcm9tQ3VzdG9taXphdGlvbkNoYW5nZSA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVzaXJlZCA9IHRoaXMuX2dldERlc2lyZWRNY3BTZXJ2ZXJFbmFibGVtZW50KCk7XG5cdFx0aWYgKGRlc2lyZWQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbGFzdFJlY29uY2lsZWRNY3BFbmFibGVtZW50ID0gZGVzaXJlZDtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0aWYgKGZyb21DdXN0b21pemF0aW9uQ2hhbmdlICYmIHRoaXMuX2lzTWNwRW5hYmxlbWVudFVuY2hhbmdlZChkZXNpcmVkKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWNwRW5hYmxlbWVudFNlcXVlbmNlci5xdWV1ZSgoKSA9PiB0aGlzLl9kb1JlY29uY2lsZU1jcFNlcnZlckVuYWJsZW1lbnQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1JlY29uY2lsZU1jcFNlcnZlckVuYWJsZW1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGlwZWxpbmUgPSB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKTtcblx0XHRjb25zdCBkZXNpcmVkID0gdGhpcy5fZ2V0RGVzaXJlZE1jcFNlcnZlckVuYWJsZW1lbnQoKTtcblx0XHRpZiAoZGVzaXJlZC5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9sYXN0UmVjb25jaWxlZE1jcEVuYWJsZW1lbnQgPSBkZXNpcmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgcGlwZWxpbmUucmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudChkZXNpcmVkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDbGF1ZGUgU0RLIGNhbm5vdCByZWNvbmNpbGUgTUNQIHNlcnZlciBlbmFibGVtZW50YCk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RSZWNvbmNpbGVkTWNwRW5hYmxlbWVudCA9IGRlc2lyZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZXNpcmVkTWNwU2VydmVyRW5hYmxlbWVudCgpOiBNYXA8c3RyaW5nLCBib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoXG5cdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uUmVzb3VyY2UsXG5cdFx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMsXG5cdFx0XHR0aGlzLl9jbGllbnRDaGlsZEVuYWJsZW1lbnQsXG5cdFx0XHR0aGlzLl9jbGllbnRQbHVnaW5FbmFibGVtZW50LFxuXHRcdCk7XG5cdFx0Y29uc3QgZW5hYmxlZEJ5SWQgPSBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50KHJlc29sdmVkKTtcblx0XHRyZXR1cm4gbmV3IE1hcChyZXNvbHZlZC5jdXN0b21pemF0aW9ucy5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4ge1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSB7XG5cdFx0XHRcdHJldHVybiBbW2N1c3RvbWl6YXRpb24ubmFtZSwgZW5hYmxlZEJ5SWQuZ2V0KGN1c3RvbWl6YXRpb24uaWQpID8/IGZhbHNlXSBhcyBjb25zdF07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLmZsYXRNYXAoY2hpbGQgPT5cblx0XHRcdFx0Y2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXG5cdFx0XHRcdFx0PyBbW2NoaWxkLm5hbWUsIGVuYWJsZWRCeUlkLmdldChjaGlsZC5pZCkgPz8gZmFsc2VdIGFzIGNvbnN0XVxuXHRcdFx0XHRcdDogW10pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTWNwRW5hYmxlbWVudFVuY2hhbmdlZChkZXNpcmVkOiBSZWFkb25seU1hcDxzdHJpbmcsIGJvb2xlYW4+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9sYXN0UmVjb25jaWxlZE1jcEVuYWJsZW1lbnQgfHwgZGVzaXJlZC5zaXplICE9PSB0aGlzLl9sYXN0UmVjb25jaWxlZE1jcEVuYWJsZW1lbnQuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gWy4uLmRlc2lyZWRdLmV2ZXJ5KChbbmFtZSwgZW5hYmxlZF0pID0+IHRoaXMuX2xhc3RSZWNvbmNpbGVkTWNwRW5hYmxlbWVudCEuZ2V0KG5hbWUpID09PSBlbmFibGVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2lyZWRDbGllbnRQbHVnaW5QYXRocygpOiByZWFkb25seSBVUklbXSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQodGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb3VyY2UsIHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLm1vZGVsLnN0YXRlLmdldCgpLnN5bmNlZC5tYXAoaXRlbSA9PiBpdGVtLmN1c3RvbWl6YXRpb24pLCB0aGlzLl9jbGllbnRDaGlsZEVuYWJsZW1lbnQsIHRoaXMuX2NsaWVudFBsdWdpbkVuYWJsZW1lbnQpO1xuXHRcdGNvbnN0IGRlc2lyZWRCeUlkID0gbmV3IE1hcChyZXNvbHZlZC5jdXN0b21pemF0aW9uc1xuXHRcdFx0LmZpbHRlcihjdXN0b21pemF0aW9uID0+IGlzQ3VzdG9taXphdGlvblNka0VsaWdpYmxlKHJlc29sdmVkLCBjdXN0b21pemF0aW9uKSlcblx0XHRcdC5tYXAoY3VzdG9taXphdGlvbiA9PiBbY3VzdG9taXphdGlvbi5pZCwgY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnkgPyBjdXN0b21pemF0aW9uLmVuYWJsZWQgOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGN1c3RvbWl6YXRpb24pXSkpO1xuXHRcdGNvbnN0IHBhdGhzOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc3luY2VkIG9mIHRoaXMuY2xpZW50Q3VzdG9taXphdGlvbnNEaWZmLm1vZGVsLnN0YXRlLmdldCgpLnN5bmNlZCkge1xuXHRcdFx0aWYgKHN5bmNlZC5wbHVnaW5EaXIgJiYgKGRlc2lyZWRCeUlkLmdldChzeW5jZWQuY3VzdG9taXphdGlvbi5pZCkgPz8gaXNDdXN0b21pemF0aW9uRW5hYmxlZChzeW5jZWQuY3VzdG9taXphdGlvbikpICE9PSBmYWxzZSkge1xuXHRcdFx0XHRwYXRocy5wdXNoKHN5bmNlZC5wbHVnaW5EaXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGF0aHM7XG5cdH1cblxuXHRhc3luYyBzdGFydE1jcFNlcnZlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkKTtcblx0XHRpZiAoIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gQ2Fubm90IHN0YXJ0IHVua25vd24gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uICR7aWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLl9yZXF1aXJlUGlwZWxpbmUoKS5zdGFydE1jcFNlcnZlcihzZXJ2ZXJOYW1lKTtcblx0XHRpZiAoIWhhbmRsZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlYmluZEZvclN5bmNlZFN0YXRlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgc3RvcE1jcFNlcnZlcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyTmFtZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkKTtcblx0XHRpZiAoIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3RoaXMuc2Vzc2lvbklkfV0gQ2Fubm90IHN0b3AgdW5rbm93biBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gJHtpZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IHRoaXMuX3JlcXVpcmVQaXBlbGluZSgpLnN0b3BNY3BTZXJ2ZXIoc2VydmVyTmFtZSk7XG5cdFx0aWYgKCFoYW5kbGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHt0aGlzLnNlc3Npb25JZH1dIE1DUCBzZXJ2ZXIgc3RvcCBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSBjdXJyZW50IFNES2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVNY3BTZXJ2ZXJOYW1lKGlkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiBmaW5kTWNwU2VydmVyTmFtZSh0aGlzLl9sYXN0Q3VzdG9taXphdGlvbnMsIGlkKSA/PyBmaW5kTWNwU2VydmVyTmFtZShhd2FpdCB0aGlzLmdldFNlc3Npb25DdXN0b21pemF0aW9ucygpLCBpZCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZlIHBhcmtlZCBkZWZlcnJlZHMgYmVmb3JlIHRlYXJpbmcgdGhlIHBpcGVsaW5lIGRvd24gc28gdGhlXG5cdFx0Ly8gU0RLJ3MgY2FuVXNlVG9vbCBjYWxsYmFjayB1bndpbmRzIHdpdGggYSBkZW55IGFuZCB0aGUgbG9vcCBleGl0cy5cblx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZGVueUFsbChmYWxzZSk7XG5cdFx0dGhpcy5fcGVuZGluZ1VzZXJJbnB1dHMuZGVueUFsbCh7IHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsIH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVqZWN0QWxsKG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZC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
