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
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { dirname, joinPath } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IAgentHostService } from "../../../../../platform/agentHost/common/agentService.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { isCustomizationEnabled } from "../../../../../platform/agentHost/common/customizationEnablement.js";
import { IRemoteAgentHostService } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { buildDefaultChatUri, CustomizationType, readUsageInfoMeta, StateComponents } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { ChatDebugHookResult, ChatDebugLogLevel, IChatDebugService } from "../../common/chatDebugService.js";
import { IAgentHostCustomizationService } from "../agentSessions/agentHost/agentHostCustomizationService.js";
import { AgentHostAgentDebugLogEnabledSettingId, AgentHostAgentDebugLogMaxEventsSettingId } from "../../common/promptSyntax/promptTypes.js";
import { buildLocalSessionStateUri, COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId, resolveEventsUri } from "../copilotCliEventsUri.js";
import { AgentHostCustomizationRecorder, AgentHostUsageRecorder, buildAgentHostCustomizationsUri, buildAgentHostUsageUri, readAgentHostCustomizationsSnapshot, readAgentHostUsageRecords } from "./agentHostUsageSidecar.js";
const MAX_DISCOVERED_SESSIONS = 30;
const TITLE_READ_BYTES = 64 * 1024;
const MAX_RESOLVED_DETAILS = 5e4;
const DEFAULT_MAX_EVENTS_IN_MEMORY = 1e4;
const MAX_EVENT_PAYLOAD = 4e3;
const MAX_DETAIL_PAYLOAD = 1e5;
let AgentHostChatDebugContribution = class extends Disposable {
  constructor(_chatDebugService, _fileService, _pathService, _remoteAgentHostService, _agentHostService, _configurationService, _logService, _environmentService, _customizationService) {
    super();
    this._chatDebugService = _chatDebugService;
    this._fileService = _fileService;
    this._pathService = _pathService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._agentHostService = _agentHostService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._environmentService = _environmentService;
    this._customizationService = _customizationService;
    /** Resolved (expanded) detail for each emitted event id. */
    this._resolved = /* @__PURE__ */ new Map();
    /** Guards against concurrent/overlapping session discovery scans. */
    this._discovering = false;
    /** True once the lazy fetcher has run at least once (i.e. the panel has been opened). */
    this._hasFetchedOnce = false;
    /** Watches the currently-viewed session's events.jsonl for live refresh. */
    this._liveRefresh = this._register(new MutableDisposable());
    const provider = {
      provideChatDebugLog: (sessionResource, token) => this._provideChatDebugLog(sessionResource, token),
      resolveChatDebugLogEvent: async (eventId) => this._resolved.get(eventId)
    };
    this._register(this._chatDebugService.registerProvider(provider));
    this._register(new AgentHostUsageRecorder(
      this._environmentService.userRoamingDataHome,
      () => this._configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId),
      this._fileService,
      this._logService,
      this._agentHostService,
      this._remoteAgentHostService
    ));
    this._register(new AgentHostCustomizationRecorder(
      this._environmentService.userRoamingDataHome,
      () => this._configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId),
      this._fileService,
      this._logService,
      this._agentHostService,
      this._remoteAgentHostService
    ));
    this._register(this._chatDebugService.onDidEndSession((sessionResource) => {
      if (sessionResource.toString() === this._watchedSessionKey) {
        this._liveRefresh.clear();
        this._watchedSessionKey = void 0;
        this._liveRead = void 0;
        this._usageRead = void 0;
      }
    }));
    this._register(this._chatDebugService.registerAvailableSessionsFetcher((token) => this._fetchLocalSessions(token)));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AgentHostAgentDebugLogEnabledSettingId) && this._hasFetchedOnce) {
        this._maybeDiscoverLocalSessions();
      }
    }));
  }
  /**
   * Lazy fetcher registered with {@link IChatDebugService}. Invoked (at most
   * once) when the home view first requests the available session list, so no
   * disk scan happens until the panel is opened. Returns nothing when file
   * logging is disabled.
   */
  async _fetchLocalSessions(token) {
    this._hasFetchedOnce = true;
    if (!this._configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId)) {
      return [];
    }
    try {
      return await this._discoverLocalSessions(token);
    } catch (err) {
      this._logService.warn(`[AgentHostChatDebug] session discovery failed: ${toErrorMessage(err)}`);
      return [];
    }
  }
  /**
   * Runs {@link _discoverLocalSessions} when file logging is enabled and adds
   * the results to the available-sessions list, guarding against overlapping
   * scans. Used for the re-scan when logging is enabled after the panel has
   * already loaded once (the initial load goes through {@link _fetchLocalSessions}).
   * Safe to call repeatedly: {@link IChatDebugService.addAvailableSessionResources}
   * dedupes by URI.
   */
  async _maybeDiscoverLocalSessions() {
    if (this._discovering || !this._configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId)) {
      return;
    }
    this._discovering = true;
    try {
      const sessions = await this._discoverLocalSessions(CancellationToken.None);
      if (sessions.length > 0) {
        this._chatDebugService.addAvailableSessionResources(sessions);
      }
    } catch (err) {
      this._logService.warn(`[AgentHostChatDebug] session discovery failed: ${toErrorMessage(err)}`);
    } finally {
      this._discovering = false;
    }
  }
  _resolveEventsUri(sessionResource) {
    const userHome = this._pathService.userHome({ preferLocal: true });
    const result = resolveEventsUri(
      sessionResource,
      userHome,
      (authority) => this._remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority)
    );
    return result.kind === "ok" ? result.resource : void 0;
  }
  /**
   * Watches the given session's events.jsonl and re-invokes providers when it
   * changes, so the panel updates as new turns/requests stream in. Only one
   * session (the one currently shown) is watched at a time. Remote
   * (non-`file`) sessions are not watched; they still load on open.
   */
  _ensureLiveRefresh(sessionResource, eventsUri) {
    const key = sessionResource.toString();
    if (this._watchedSessionKey === key) {
      return;
    }
    if (eventsUri.scheme !== Schemas.file) {
      this._liveRefresh.clear();
      this._watchedSessionKey = void 0;
      return;
    }
    this._watchedSessionKey = key;
    const store = new DisposableStore();
    const scheduler = store.add(new RunOnceScheduler(() => {
      this._chatDebugService.invokeProviders(sessionResource);
    }, 400));
    const watcher = store.add(this._fileService.createWatcher(dirname(eventsUri), { recursive: false, excludes: [] }));
    store.add(watcher.onDidChange((e) => {
      const affects = e.affects(eventsUri);
      if (affects) {
        scheduler.schedule();
      }
    }));
    const liveSub = this._sessionChatSubscription(sessionResource);
    if (liveSub) {
      store.add(liveSub.onDidChange(() => scheduler.schedule()));
    }
    store.add(this._customizationService.onDidChangeCustomizations(() => scheduler.schedule()));
    this._liveRefresh.value = store;
  }
  /**
   * Returns the live AHP chat-state subscription for a local Agent Host
   * session, if one is currently active (i.e. the session is open/subscribed).
   * Turns (and their usage) live on the session's default chat channel, so we
   * subscribe to that channel rather than the session. Read-only: never
   * creates a subscription.
   */
  _sessionChatSubscription(sessionResource) {
    if (sessionResource.scheme !== COPILOT_CLI_LOCAL_AH_SCHEME) {
      return void 0;
    }
    const rawId = getCopilotCliSessionRawId(sessionResource);
    if (!rawId) {
      return void 0;
    }
    const backendSession = URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${rawId}` });
    const chatUri = URI.parse(buildDefaultChatUri(backendSession.toString()));
    return this._agentHostService.getSubscriptionUnmanaged(StateComponents.Chat, chatUri);
  }
  /**
   * Reads live Copilot AIU from the AHP session state as a fallback usage
   * source for in-progress sessions (no `session.shutdown` summary yet).
   * Only AIU is reliable live; input/cache need the shutdown summary (F1).
   */
  _getLiveUsageTotals(sessionResource) {
    const chat = this._sessionChatSubscription(sessionResource)?.value;
    if (!chat || chat instanceof Error) {
      return void 0;
    }
    return sumChatStateUsage(chat);
  }
  /**
   * Reads the client-local usage sidecar for a session (exact per-request
   * token metrics captured live). Returns `undefined` when the session has no
   * sidecar (e.g. it ran before capture shipped), so the converter falls back
   * to the session.shutdown summary / live totals.
   */
  async _readUsageRecords(sessionResource) {
    const rawId = getCopilotCliSessionRawId(sessionResource);
    if (!rawId) {
      return void 0;
    }
    const uri = buildAgentHostUsageUri(this._environmentService.userRoamingDataHome, rawId);
    const key = uri.toString();
    let size;
    try {
      const stat = await this._fileService.stat(uri);
      size = stat.size ?? 0;
    } catch {
      this._usageRead = void 0;
      return void 0;
    }
    if (this._usageRead?.key === key && this._usageRead.size === size) {
      return this._usageRead.records.length > 0 ? this._usageRead.records : void 0;
    }
    const records = await readAgentHostUsageRecords(this._fileService, uri);
    this._usageRead = { key, size, records };
    return records.length > 0 ? records : void 0;
  }
  /**
   * Reads the client-local customization snapshot for a session (the last
   * loaded skills/hooks/agents/MCP captured live). Used as a fallback for
   * historical/closed sessions, where the live customization service has no
   * active state subscription and returns nothing. Returns `undefined` when no
   * snapshot exists (e.g. the session ran before capture shipped).
   */
  async _readCustomizationsSnapshot(sessionResource) {
    const rawId = getCopilotCliSessionRawId(sessionResource);
    if (!rawId) {
      return void 0;
    }
    const uri = buildAgentHostCustomizationsUri(this._environmentService.userRoamingDataHome, rawId);
    const snapshot = await readAgentHostCustomizationsSnapshot(this._fileService, uri);
    return snapshot && snapshot.length > 0 ? snapshot : void 0;
  }
  async _provideChatDebugLog(sessionResource, token) {
    if (!this._configurationService.getValue(AgentHostAgentDebugLogEnabledSettingId)) {
      return void 0;
    }
    const eventsUri = this._resolveEventsUri(sessionResource);
    if (!eventsUri) {
      return void 0;
    }
    this._ensureLiveRefresh(sessionResource, eventsUri);
    const records = await this._readEventRecords(eventsUri, token);
    if (records === void 0) {
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const liveUsageTotals = this._getLiveUsageTotals(sessionResource);
    const usageRecords = await this._readUsageRecords(sessionResource);
    if (token.isCancellationRequested) {
      return void 0;
    }
    let customizations = this._customizationService.getCustomizations(sessionResource);
    if (customizations.length === 0) {
      customizations = await this._readCustomizationsSnapshot(sessionResource) ?? customizations;
      if (token.isCancellationRequested) {
        return void 0;
      }
    }
    const { events, resolved } = convertAgentHostEventsToDebugEvents(records, sessionResource, liveUsageTotals, usageRecords, customizations);
    for (const [id, detail] of resolved) {
      this._resolved.set(id, detail);
      if (this._resolved.size > MAX_RESOLVED_DETAILS) {
        const first = this._resolved.keys().next().value;
        if (first !== void 0) {
          this._resolved.delete(first);
        }
      }
    }
    return events;
  }
  /**
   * Reads the session's `events.jsonl` into parsed records, reading only the
   * bytes appended since the last read for the actively-viewed session.
   *
   * The Copilot CLI appends to `events.jsonl` line-by-line from a separate
   * process, so a live session is an append-only stream. Rather than
   * re-reading and re-`JSON.parse`-ing the whole (potentially multi-MB) file
   * on every change — which is O(N) per tick and O(N^2) over a long session —
   * we cache the parsed records plus the byte offset consumed so far and read
   * only the new tail. A full read is used on first view, a cache miss, or
   * when the file shrank (rotation/truncation).
   *
   * Byte offsets are only ever advanced to a newline boundary (`\n` is a
   * single byte that never appears inside a multi-byte UTF-8 sequence), so a
   * tail read never starts mid-codepoint; any trailing partial line is kept
   * as `pendingBytes` and prepended to the next read.
   *
   * Returns `undefined` when the file does not exist yet or cannot be read.
   */
  /**
   * The configured in-memory event cap for agent host sessions (see
   * {@link AgentHostAgentDebugLogMaxEventsSettingId}). The raw record cache is
   * trimmed to this many entries so a long-running session does not retain an
   * unbounded array, matching the capped public event buffer.
   */
  _maxRecordsInMemory() {
    const configured = this._configurationService.getValue(AgentHostAgentDebugLogMaxEventsSettingId);
    if (typeof configured === "number" && Number.isFinite(configured) && configured >= 1) {
      return Math.floor(configured);
    }
    return DEFAULT_MAX_EVENTS_IN_MEMORY;
  }
  /** Trims `records` in place to the most recent {@link _maxRecordsInMemory} entries. */
  _capRecordsInMemory(records) {
    const max = this._maxRecordsInMemory();
    if (records.length > max) {
      records.splice(0, records.length - max);
    }
  }
  async _readEventRecords(eventsUri, token) {
    const key = eventsUri.toString();
    let size;
    try {
      const stat = await this._fileService.stat(eventsUri);
      size = stat.size ?? 0;
    } catch {
      this._liveRead = void 0;
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const cache = this._liveRead?.key === key ? this._liveRead : void 0;
    if (cache && size >= cache.consumedBytes) {
      if (size === cache.consumedBytes) {
        return cache.records;
      }
      try {
        const content = await this._fileService.readFile(eventsUri, { position: cache.consumedBytes, length: size - cache.consumedBytes });
        if (token.isCancellationRequested) {
          return void 0;
        }
        const combined = cache.pendingBytes.byteLength ? VSBuffer.concat([cache.pendingBytes, content.value]) : content.value;
        const lastNewline2 = lastIndexOfNewline(combined);
        if (lastNewline2 >= 0) {
          appendJsonlRecords(combined.slice(0, lastNewline2 + 1).toString(), cache.records);
          cache.pendingBytes = combined.slice(lastNewline2 + 1);
        } else {
          cache.pendingBytes = combined;
        }
        cache.consumedBytes = size;
        this._capRecordsInMemory(cache.records);
        return cache.records;
      } catch {
      }
    }
    let buffer;
    try {
      const content = await this._fileService.readFile(eventsUri);
      buffer = content.value;
    } catch {
      this._liveRead = void 0;
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const lastNewline = lastIndexOfNewline(buffer);
    const records = [];
    if (lastNewline >= 0) {
      appendJsonlRecords(buffer.slice(0, lastNewline + 1).toString(), records);
    }
    this._capRecordsInMemory(records);
    this._liveRead = {
      key,
      consumedBytes: buffer.byteLength,
      pendingBytes: lastNewline >= 0 ? buffer.slice(lastNewline + 1) : buffer,
      records
    };
    return records;
  }
  async _discoverLocalSessions(token) {
    const userHome = this._pathService.userHome({ preferLocal: true });
    const sessionStateDir = buildLocalSessionStateUri(userHome);
    let stat;
    try {
      stat = await this._fileService.resolve(sessionStateDir, { resolveMetadata: true });
    } catch {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const folders = (stat.children ?? []).filter((child) => child.isDirectory).sort((a, b) => b.mtime - a.mtime).slice(0, MAX_DISCOVERED_SESSIONS);
    const found = await Promise.all(folders.map(async (folder) => {
      const eventsUri = joinPath(folder.resource, "events.jsonl");
      let title;
      try {
        const head = await this._fileService.readFile(eventsUri, { length: TITLE_READ_BYTES });
        title = extractSessionTitle(head.value.toString()) ?? fallbackSessionTitle(folder.name);
      } catch {
        return void 0;
      }
      return { uri: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${folder.name}` }), title };
    }));
    if (token.isCancellationRequested) {
      return [];
    }
    return found.filter((s) => s !== void 0);
  }
};
AgentHostChatDebugContribution.ID = "workbench.contrib.agentHostChatDebug";
AgentHostChatDebugContribution = __decorateClass([
  __decorateParam(0, IChatDebugService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IPathService),
  __decorateParam(3, IRemoteAgentHostService),
  __decorateParam(4, IAgentHostService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, IAgentHostCustomizationService)
], AgentHostChatDebugContribution);
function convertAgentHostEventsToDebugEvents(records, sessionResource, fallbackUsageTotals, usageRecords, customizations) {
  const completeByToolCallId = /* @__PURE__ */ new Map();
  const turnStartByTurnId = /* @__PURE__ */ new Map();
  const hookEndByInvocationId = /* @__PURE__ */ new Map();
  const permissionCompleteByRequestId = /* @__PURE__ */ new Map();
  const subagentCompleteByToolCallId = /* @__PURE__ */ new Map();
  for (const record of records) {
    if (record.type === "tool.execution_complete") {
      const toolCallId = asString(record.data.toolCallId);
      if (toolCallId) {
        completeByToolCallId.set(toolCallId, record);
      }
    } else if (record.type === "assistant.turn_start") {
      const turnId = asString(record.data.turnId);
      if (turnId) {
        turnStartByTurnId.set(turnId, record);
      }
    } else if (record.type === "hook.end") {
      const invocationId = asString(record.data.hookInvocationId);
      if (invocationId) {
        hookEndByInvocationId.set(invocationId, record);
      }
    } else if (record.type === "permission.completed") {
      const requestId = asString(record.data.requestId);
      if (requestId) {
        permissionCompleteByRequestId.set(requestId, record);
      }
    } else if (record.type === "subagent.completed") {
      const toolCallId = asString(record.data.toolCallId);
      if (toolCallId) {
        subagentCompleteByToolCallId.set(toolCallId, record);
      }
    }
  }
  const events = [];
  const resolved = /* @__PURE__ */ new Map();
  const modelTurnRefs = [];
  let rootEventId;
  let rootCreated;
  const currentUserMessageByAgent = /* @__PURE__ */ new Map();
  const currentAssistantMessageByAgent = /* @__PURE__ */ new Map();
  const toolEventByToolCallId = /* @__PURE__ */ new Map();
  const hasConfiguredHooks = !!customizations && flattenCustomizations(customizations).some((c) => c.type === CustomizationType.Hook && c.enabled);
  for (const record of records) {
    const created = new Date(record.timestamp);
    const agentKey = record.agentId ?? "";
    const turnParent = currentAssistantMessageByAgent.get(agentKey) ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;
    switch (record.type) {
      case "session.start": {
        rootEventId = record.id;
        rootCreated = created;
        const model = asString(record.data.selectedModel);
        const effort = asString(record.data.reasoningEffort);
        const version = asString(record.data.copilotVersion);
        const context = asRecord(record.data.context);
        const repository = asString(context?.repository);
        const branch = asString(context?.branch);
        const parts = [];
        if (model) {
          parts.push(effort ? localize("agentHost.debug.sessionStartedDetails", "model={0}, reasoningEffort={1}", model, effort) : localize("agentHost.debug.sessionStartedModel", "model={0}", model));
        }
        if (version) {
          parts.push(localize("agentHost.debug.sessionCliVersion", "CLI {0}", version));
        }
        if (repository) {
          parts.push(branch ? localize("agentHost.debug.sessionRepoBranch", "{0}@{1}", repository, branch) : repository);
        }
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: void 0,
          name: localize("agentHost.debug.sessionStarted", "Session Started"),
          details: parts.length ? parts.join(", ") : void 0,
          level: ChatDebugLogLevel.Info,
          category: "session"
        });
        break;
      }
      case "user.message": {
        const content = asString(record.data.content) ?? "";
        const transformed = asString(record.data.transformedContent);
        const sections = [
          { name: localize("agentHost.debug.userRequest", "User Request"), content }
        ];
        if (transformed && transformed !== content) {
          sections.push({ name: localize("agentHost.debug.fullPrompt", "Full Prompt"), content: transformed });
        }
        const message = summarize(content);
        currentUserMessageByAgent.set(agentKey, record.id);
        currentAssistantMessageByAgent.delete(agentKey);
        events.push({ kind: "userMessage", id: record.id, sessionResource, created, parentEventId: rootEventId, message, sections });
        resolved.set(record.id, { kind: "message", type: "user", message, sections });
        break;
      }
      case "assistant.message": {
        const model = asString(record.data.model);
        const outputTokens = asNumber(record.data.outputTokens);
        const content = asString(record.data.content) ?? "";
        const reasoning = asString(record.data.reasoningText);
        const parentToolCallId = asString(record.data.parentToolCallId);
        const spawningTool = parentToolCallId ? toolEventByToolCallId.get(parentToolCallId) : void 0;
        const parentEventId = spawningTool ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;
        const turnId = asString(record.data.turnId);
        const turnStart = turnId ? turnStartByTurnId.get(turnId) : void 0;
        const durationInMillis = turnStart ? diffMillis(turnStart.timestamp, record.timestamp) : void 0;
        currentAssistantMessageByAgent.set(agentKey, record.id);
        modelTurnRefs.push({ index: events.length, id: record.id, turnId, outputTokens });
        events.push({
          kind: "modelTurn",
          id: record.id,
          sessionResource,
          created,
          parentEventId,
          model,
          requestName: "copilotcli",
          outputTokens,
          durationInMillis
        });
        const sections = [];
        if (content) {
          sections.push({ name: localize("agentHost.debug.response", "Response"), content });
        }
        if (reasoning) {
          sections.push({ name: localize("agentHost.debug.reasoning", "Reasoning"), content: reasoning });
        }
        resolved.set(record.id, { kind: "modelTurn", requestName: "copilotcli", model, outputTokens, durationInMillis, sections });
        break;
      }
      case "tool.execution_start": {
        const toolName = asString(record.data.toolName) ?? "tool";
        const toolCallId = asString(record.data.toolCallId);
        const complete = toolCallId ? completeByToolCallId.get(toolCallId) : void 0;
        const success = complete ? asBoolean(complete.data.success) : void 0;
        const result = success === void 0 ? void 0 : success ? "success" : "error";
        const durationInMillis = complete ? diffMillis(record.timestamp, complete.timestamp) : void 0;
        const fullInput = stringifyPayload(record.data.arguments);
        const fullOutput = complete ? stringifyPayload(complete.data.result) : void 0;
        const parentToolCallId = asString(record.data.parentToolCallId);
        const parentTool = parentToolCallId ? toolEventByToolCallId.get(parentToolCallId) : void 0;
        const parentEventId = parentTool ?? currentAssistantMessageByAgent.get(agentKey) ?? currentUserMessageByAgent.get(agentKey) ?? rootEventId;
        if (toolCallId) {
          toolEventByToolCallId.set(toolCallId, record.id);
        }
        events.push({
          kind: "toolCall",
          id: record.id,
          sessionResource,
          created,
          parentEventId,
          toolName,
          toolCallId,
          result,
          durationInMillis,
          input: truncate(fullInput, MAX_EVENT_PAYLOAD),
          output: truncate(fullOutput, MAX_EVENT_PAYLOAD)
        });
        resolved.set(record.id, {
          kind: "toolCall",
          toolName,
          result,
          durationInMillis,
          input: truncate(fullInput, MAX_DETAIL_PAYLOAD),
          output: truncate(fullOutput, MAX_DETAIL_PAYLOAD)
        });
        break;
      }
      // `tool.execution_complete` is folded into its start record above.
      case "session.error": {
        const message = asString(record.data.message) ?? localize("agentHost.debug.unknownError", "Unknown error");
        const errorType = asString(record.data.errorType);
        const stack = asString(record.data.stack);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: errorType ? localize("agentHost.debug.sessionErrorTyped", "Error ({0})", errorType) : localize("agentHost.debug.sessionError", "Error"),
          details: truncate(message, MAX_EVENT_PAYLOAD),
          level: ChatDebugLogLevel.Error,
          category: "session"
        });
        const detailText = stack ? `${message}

${stack}` : message;
        resolved.set(record.id, { kind: "text", value: truncate(detailText, MAX_DETAIL_PAYLOAD) ?? detailText });
        break;
      }
      case "session.warning": {
        const message = asString(record.data.message) ?? "";
        const warningType = asString(record.data.warningType);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: warningType ? localize("agentHost.debug.sessionWarningTyped", "Warning ({0})", warningType) : localize("agentHost.debug.sessionWarning", "Warning"),
          details: truncate(message, MAX_EVENT_PAYLOAD),
          level: ChatDebugLogLevel.Warning,
          category: "session"
        });
        if (message) {
          resolved.set(record.id, { kind: "text", value: truncate(message, MAX_DETAIL_PAYLOAD) ?? message });
        }
        break;
      }
      case "session.model_change": {
        const previousModel = asString(record.data.previousModel);
        const newModel = asString(record.data.newModel);
        const effort = asString(record.data.reasoningEffort);
        const change = previousModel && newModel ? localize("agentHost.debug.modelChangeFromTo", "{0} \u2192 {1}", previousModel, newModel) : newModel;
        const details = change && effort ? localize("agentHost.debug.modelChangeEffort", "{0} (reasoningEffort={1})", change, effort) : change;
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: localize("agentHost.debug.modelChanged", "Model Changed"),
          details,
          level: ChatDebugLogLevel.Info,
          category: "session"
        });
        break;
      }
      case "hook.start": {
        const hookType = asString(record.data.hookType) ?? "hook";
        const invocationId = asString(record.data.hookInvocationId);
        const end = invocationId ? hookEndByInvocationId.get(invocationId) : void 0;
        const success = end ? asBoolean(end.data.success) : void 0;
        const isError = hookType === "errorOccurred";
        if ((hookType === "preToolUse" || hookType === "postToolUse") && !hasConfiguredHooks) {
          break;
        }
        const hookParent = hookType === "preToolUse" ? currentUserMessageByAgent.get(agentKey) ?? rootEventId : turnParent;
        if (!isError && success !== false) {
          events.push({
            kind: "generic",
            id: record.id,
            sessionResource,
            created,
            parentEventId: hookParent,
            name: localize("agentHost.debug.hookRan", "Hook: {0}", hookType),
            level: ChatDebugLogLevel.Info,
            category: "hook"
          });
          const routineInput = stringifyPayload(record.data.input);
          resolved.set(record.id, {
            kind: "hook",
            hookType,
            result: success === void 0 ? void 0 : success ? ChatDebugHookResult.Success : ChatDebugHookResult.Error,
            input: truncate(routineInput, MAX_DETAIL_PAYLOAD)
          });
          break;
        }
        const input = asRecord(record.data.input);
        const errorContext = asString(input?.errorContext);
        const recoverable = asBoolean(input?.recoverable);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: hookParent,
          name: isError ? errorContext ? localize("agentHost.debug.hookErrorContext", "Error During {0}", errorContext) : localize("agentHost.debug.hookError", "Error Occurred") : localize("agentHost.debug.hookFailed", "Hook Failed: {0}", hookType),
          details: isError && recoverable !== void 0 ? recoverable ? localize("agentHost.debug.hookRecoverable", "Recoverable; retrying") : localize("agentHost.debug.hookUnrecoverable", "Unrecoverable") : void 0,
          level: isError ? recoverable === false ? ChatDebugLogLevel.Error : ChatDebugLogLevel.Warning : ChatDebugLogLevel.Error,
          category: "hook"
        });
        const inputText = stringifyPayload(record.data.input);
        const endError = asRecord(end?.data.error);
        const errorParts = endError ? [asString(endError.message), asString(endError.source)].filter((s) => !!s) : [];
        const outputText = end && end.data.output !== void 0 ? stringifyPayload(end.data.output) : void 0;
        resolved.set(record.id, {
          kind: "hook",
          hookType,
          result: success === void 0 ? void 0 : success ? ChatDebugHookResult.Success : ChatDebugHookResult.Error,
          input: truncate(inputText, MAX_DETAIL_PAYLOAD),
          output: outputText ? truncate(outputText, MAX_DETAIL_PAYLOAD) : void 0,
          errorMessage: errorParts.length > 0 ? truncate(errorParts.join("\n"), MAX_DETAIL_PAYLOAD) : void 0
        });
        break;
      }
      // `hook.end` is folded into its `hook.start` above.
      case "permission.requested": {
        const requestId = asString(record.data.requestId);
        const permissionRequest = asRecord(record.data.permissionRequest);
        const kind = asString(permissionRequest?.kind) ?? "permission";
        const intention = asString(permissionRequest?.intention);
        const toolCallId = asString(permissionRequest?.toolCallId);
        const completed = requestId ? permissionCompleteByRequestId.get(requestId) : void 0;
        const resultKind = completed ? asString(asRecord(completed.data.result)?.kind) : void 0;
        if (resultKind === "approved") {
          break;
        }
        const parentEventId = (toolCallId ? toolEventByToolCallId.get(toolCallId) : void 0) ?? turnParent;
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId,
          name: resultKind ? localize("agentHost.debug.permissionResolved", "Permission {0}: {1}", resultKind, kind) : localize("agentHost.debug.permissionPending", "Awaiting Permission: {0}", kind),
          details: intention,
          level: ChatDebugLogLevel.Warning,
          category: "permission"
        });
        const path = asString(permissionRequest?.path);
        const lines = [
          localize("agentHost.debug.permissionKind", "kind: {0}", kind),
          intention ? localize("agentHost.debug.permissionIntention", "intention: {0}", intention) : void 0,
          path ? localize("agentHost.debug.permissionPath", "path: {0}", path) : void 0,
          localize("agentHost.debug.permissionResult", "result: {0}", resultKind ?? localize("agentHost.debug.permissionPendingValue", "pending"))
        ].filter((l) => !!l);
        resolved.set(record.id, { kind: "text", value: lines.join("\n") });
        break;
      }
      // `permission.completed` is folded into its `permission.requested` above.
      case "subagent.started": {
        const toolCallId = asString(record.data.toolCallId);
        const agentName = asString(record.data.agentDisplayName) ?? asString(record.data.agentName) ?? "subagent";
        const description = asString(record.data.agentDescription);
        const model = asString(record.data.model);
        const complete = toolCallId ? subagentCompleteByToolCallId.get(toolCallId) : void 0;
        const toolCallCount = complete ? asNumber(complete.data.totalToolCalls) : void 0;
        const totalTokens = complete ? asNumber(complete.data.totalTokens) : void 0;
        const durationInMillis = complete ? asNumber(complete.data.durationMs) : void 0;
        const parentEventId = (toolCallId ? toolEventByToolCallId.get(toolCallId) : void 0) ?? turnParent;
        events.push({
          kind: "subagentInvocation",
          id: record.id,
          sessionResource,
          created,
          parentEventId,
          agentName,
          description,
          status: complete ? "completed" : "running",
          toolCallCount,
          durationInMillis
        });
        const lines = [
          localize("agentHost.debug.subagentName", "agent: {0}", agentName),
          model ? localize("agentHost.debug.subagentModel", "model: {0}", model) : void 0,
          toolCallCount !== void 0 ? localize("agentHost.debug.subagentToolCalls", "tool calls: {0}", toolCallCount) : void 0,
          totalTokens !== void 0 ? localize("agentHost.debug.subagentTokens", "tokens: {0}", totalTokens) : void 0,
          description ? `
${description}` : void 0
        ].filter((l) => !!l);
        resolved.set(record.id, { kind: "text", value: lines.join("\n") });
        break;
      }
      // `subagent.completed` is folded into its `subagent.started` above.
      case "session.compaction_start": {
        const systemTokens = asNumber(record.data.systemTokens) ?? 0;
        const conversationTokens = asNumber(record.data.conversationTokens) ?? 0;
        const toolTokens = asNumber(record.data.toolDefinitionsTokens) ?? 0;
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: localize("agentHost.debug.compaction", "Context Compaction"),
          details: localize("agentHost.debug.compactionTokens", "system={0}, conversation={1}, tools={2} tokens", systemTokens, conversationTokens, toolTokens),
          level: ChatDebugLogLevel.Info,
          category: "session"
        });
        break;
      }
      case "session.compaction_complete": {
        if (asBoolean(record.data.success) !== false) {
          break;
        }
        const error = asString(record.data.error);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: localize("agentHost.debug.compactionFailed", "Context Compaction Failed"),
          details: truncate(error, MAX_EVENT_PAYLOAD),
          level: ChatDebugLogLevel.Error,
          category: "session"
        });
        if (error) {
          resolved.set(record.id, { kind: "text", value: truncate(error, MAX_DETAIL_PAYLOAD) ?? error });
        }
        break;
      }
      case "abort": {
        const reason = asString(record.data.reason);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: localize("agentHost.debug.aborted", "Aborted"),
          details: reason,
          level: ChatDebugLogLevel.Warning,
          category: "session"
        });
        break;
      }
      case "skill.invoked": {
        const name = asString(record.data.name) ?? "skill";
        const trigger = asString(record.data.trigger);
        const source = asString(record.data.pluginName) ?? asString(record.data.source);
        const content = asString(record.data.content);
        events.push({
          kind: "generic",
          id: record.id,
          sessionResource,
          created,
          parentEventId: turnParent,
          name: localize("agentHost.debug.skillInvoked", "Skill Invoked: {0}", name),
          details: [trigger, source].filter(Boolean).join(" \xB7 ") || void 0,
          level: ChatDebugLogLevel.Info,
          category: "customization"
        });
        if (content) {
          resolved.set(record.id, { kind: "text", value: truncate(content, MAX_DETAIL_PAYLOAD) ?? content });
        }
        break;
      }
    }
  }
  const fillTurnsWithTotals = (targets, totals) => {
    const n = targets.length;
    if (n === 0) {
      return;
    }
    const inputs = totals.inputTokens !== void 0 ? distributeEvenly(totals.inputTokens, n) : void 0;
    const cached = totals.cacheReadTokens !== void 0 ? distributeEvenly(totals.cacheReadTokens, n) : void 0;
    const aiu = distributeEvenly(totals.totalNanoAiu, n);
    for (let i = 0; i < n; i++) {
      const ref = targets[i];
      const turn = events[ref.index];
      const inputTokens = inputs?.[i];
      const cachedTokens = cached?.[i];
      const totalTokens = inputTokens !== void 0 ? inputTokens + (ref.outputTokens ?? 0) : void 0;
      const copilotUsageNanoAiu = aiu[i] > 0 ? aiu[i] : void 0;
      events[ref.index] = { ...turn, inputTokens, cachedTokens, totalTokens, copilotUsageNanoAiu };
      const detail = resolved.get(ref.id);
      if (detail?.kind === "modelTurn") {
        resolved.set(ref.id, { ...detail, inputTokens, cachedTokens, totalTokens });
      }
    }
  };
  if (usageRecords && usageRecords.length > 0 && modelTurnRefs.length > 0) {
    const coverage = applyPerTurnUsage(events, resolved, modelTurnRefs, usageRecords);
    const uncovered = modelTurnRefs.filter((_ref, i) => !coverage.covered.has(i));
    if (uncovered.length > 0) {
      const totals = extractSessionUsageTotals(records) ?? fallbackUsageTotals;
      if (totals) {
        fillTurnsWithTotals(uncovered, {
          inputTokens: totals.inputTokens !== void 0 ? Math.max(0, totals.inputTokens - coverage.assignedInput) : void 0,
          cacheReadTokens: totals.cacheReadTokens !== void 0 ? Math.max(0, totals.cacheReadTokens - coverage.assignedCache) : void 0,
          totalNanoAiu: Math.max(0, totals.totalNanoAiu - coverage.assignedAiu)
        });
      }
    }
  } else if (modelTurnRefs.length > 0) {
    const totals = extractSessionUsageTotals(records) ?? fallbackUsageTotals;
    if (totals) {
      fillTurnsWithTotals(modelTurnRefs, totals);
    }
  }
  if (customizations && customizations.length > 0) {
    const created = rootCreated ?? (records.length > 0 ? new Date(records[0].timestamp) : /* @__PURE__ */ new Date());
    const { events: customEvents, resolved: customResolved } = buildCustomizationDebugEvents(customizations, sessionResource, rootEventId, created);
    events.push(...customEvents);
    for (const [id, detail] of customResolved) {
      resolved.set(id, detail);
    }
  }
  return { events, resolved };
}
const CUSTOMIZATION_TYPE_ORDER = [
  CustomizationType.Skill,
  CustomizationType.Hook,
  CustomizationType.Agent,
  CustomizationType.McpServer,
  CustomizationType.Rule,
  CustomizationType.Prompt
];
function flattenCustomizations(customizations) {
  const out = [];
  const visit = (c) => {
    if (c.type === CustomizationType.Plugin || c.type === CustomizationType.Directory) {
      for (const child of c.children ?? []) {
        visit(child);
      }
      return;
    }
    out.push({
      type: c.type,
      name: c.name,
      uri: c.uri,
      enabled: c.type === CustomizationType.McpServer ? isCustomizationEnabled(c) : c.enabled !== false,
      description: c.description
    });
  };
  for (const c of customizations) {
    visit(c);
  }
  return out;
}
function customizationDiscoveryName(type) {
  switch (type) {
    case CustomizationType.Skill:
      return localize("agentHost.debug.skillDiscovery", "Skill Discovery");
    case CustomizationType.Hook:
      return localize("agentHost.debug.hookDiscovery", "Hook Discovery");
    case CustomizationType.Agent:
      return localize("agentHost.debug.agentDiscovery", "Agent Discovery");
    case CustomizationType.McpServer:
      return localize("agentHost.debug.mcpDiscovery", "MCP Server Discovery");
    case CustomizationType.Rule:
      return localize("agentHost.debug.ruleDiscovery", "Instructions Discovery");
    case CustomizationType.Prompt:
      return localize("agentHost.debug.promptDiscovery", "Prompt Discovery");
    default:
      return localize("agentHost.debug.customizationDiscovery", "Customization Discovery");
  }
}
function customizationSummaryCategory(c) {
  if (!c.enabled) {
    return "skipped";
  }
  switch (c.type) {
    case CustomizationType.Skill:
      return "skill";
    case CustomizationType.Agent:
      return "custom-agent";
    case CustomizationType.Hook:
      return "hook";
    case CustomizationType.Rule:
      return "applying";
    default:
      return void 0;
  }
}
function buildCustomizationDebugEvents(customizations, sessionResource, parentEventId, created) {
  const events = [];
  const resolved = /* @__PURE__ */ new Map();
  const flat = flattenCustomizations(customizations);
  if (flat.length === 0) {
    return { events, resolved };
  }
  const byType = /* @__PURE__ */ new Map();
  for (const c of flat) {
    const list = byType.get(c.type);
    if (list) {
      list.push(c);
    } else {
      byType.set(c.type, [c]);
    }
  }
  const key = sessionResource.toString();
  for (const type of CUSTOMIZATION_TYPE_ORDER) {
    const list = byType.get(type);
    if (!list || list.length === 0) {
      continue;
    }
    const id = `agentHostCustomization:${key}:${type}`;
    const loadedCount = list.filter((c) => c.enabled).length;
    const skippedCount = list.length - loadedCount;
    events.push({
      kind: "generic",
      id,
      sessionResource,
      created,
      parentEventId,
      name: customizationDiscoveryName(type),
      details: skippedCount > 0 ? localize("agentHost.debug.customizationLoadedSkipped", "{0} loaded, {1} disabled", loadedCount, skippedCount) : localize("agentHost.debug.customizationLoaded", "{0} loaded", loadedCount),
      level: ChatDebugLogLevel.Info,
      category: "discovery"
    });
    const files = list.map((c) => ({
      uri: URI.parse(c.uri),
      name: c.name,
      status: c.enabled ? "loaded" : "skipped",
      skipReason: c.enabled ? void 0 : localize("agentHost.debug.customizationDisabled", "disabled")
    }));
    resolved.set(id, { kind: "fileList", discoveryType: type, durationInMillis: 0, files });
  }
  const logs = [];
  for (const c of flat) {
    const category = customizationSummaryCategory(c);
    if (!category) {
      continue;
    }
    logs.push({ category, name: c.name, uri: URI.parse(c.uri), reason: c.description });
  }
  if (logs.length > 0) {
    const id = `agentHostCustomization:${key}:summary`;
    const counts = {
      instructions: logs.filter((e) => e.category === "applying" || e.category === "referenced").length,
      skills: logs.filter((e) => e.category === "skill").length,
      agents: logs.filter((e) => e.category === "custom-agent").length,
      hooks: logs.filter((e) => e.category === "hook").length,
      skipped: logs.filter((e) => e.category === "skipped").length
    };
    events.push({
      kind: "generic",
      id,
      sessionResource,
      created,
      parentEventId,
      name: localize("agentHost.debug.customizationsResolved", "Resolve Customizations"),
      details: localize("agentHost.debug.customizationsResolvedDetails", "{0} skills, {1} agents, {2} hooks, {3} instructions", counts.skills, counts.agents, counts.hooks, counts.instructions),
      level: ChatDebugLogLevel.Info,
      category: "customization"
    });
    resolved.set(id, { kind: "customizationSummary", resolutionLogs: logs, durationInMillis: 0, counts });
  }
  return { events, resolved };
}
function applyPerTurnUsage(events, resolved, modelTurnRefs, usageRecords) {
  const assign = (ref, inputTokens, cachedTokens, copilotUsageNanoAiu) => {
    const turn = events[ref.index];
    const totalTokens = inputTokens !== void 0 ? inputTokens + (ref.outputTokens ?? 0) : void 0;
    events[ref.index] = { ...turn, inputTokens, cachedTokens, totalTokens, copilotUsageNanoAiu };
    const detail = resolved.get(ref.id);
    if (detail?.kind === "modelTurn") {
      resolved.set(ref.id, { ...detail, inputTokens, cachedTokens, totalTokens });
    }
  };
  const aiuByRecordIndex = new Array(usageRecords.length).fill(void 0);
  for (let start = 0; start < usageRecords.length; ) {
    let end = start;
    while (end + 1 < usageRecords.length && usageRecords[end + 1].turnId === usageRecords[start].turnId) {
      end++;
    }
    let maxAiu = 0;
    for (let i = start; i <= end; i++) {
      maxAiu = Math.max(maxAiu, usageRecords[i].totalNanoAiu ?? 0);
    }
    if (maxAiu > 0) {
      aiuByRecordIndex[end] = maxAiu;
    }
    start = end + 1;
  }
  let recordIndex = 0;
  let assignedInput = 0;
  let assignedCache = 0;
  let assignedAiu = 0;
  const covered = /* @__PURE__ */ new Set();
  for (let refIdx = 0; refIdx < modelTurnRefs.length; refIdx++) {
    if (recordIndex >= usageRecords.length) {
      break;
    }
    const ref = modelTurnRefs[refIdx];
    const record = usageRecords[recordIndex];
    if (ref.outputTokens !== void 0 && record.outputTokens !== void 0 && ref.outputTokens !== record.outputTokens) {
      continue;
    }
    const aiu = aiuByRecordIndex[recordIndex];
    assign(ref, record.inputTokens, record.cacheReadTokens, aiu);
    assignedInput += record.inputTokens ?? 0;
    assignedCache += record.cacheReadTokens ?? 0;
    assignedAiu += aiu ?? 0;
    covered.add(refIdx);
    recordIndex++;
  }
  return { covered, assignedInput, assignedCache, assignedAiu };
}
function extractSessionUsageTotals(records) {
  let shutdown;
  for (const record of records) {
    if (record.type === "session.shutdown") {
      shutdown = record;
    }
  }
  if (!shutdown) {
    return void 0;
  }
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let perModelNanoAiu = 0;
  const modelMetrics = shutdown.data.modelMetrics;
  if (modelMetrics && typeof modelMetrics === "object") {
    for (const metric of Object.values(modelMetrics)) {
      const entry = metric;
      const usage = entry?.usage;
      inputTokens += asNumber(usage?.inputTokens) ?? 0;
      cacheReadTokens += asNumber(usage?.cacheReadTokens) ?? 0;
      perModelNanoAiu += asNumber(entry?.totalNanoAiu) ?? 0;
    }
  }
  const totalNanoAiu = asNumber(shutdown.data.totalNanoAiu) ?? perModelNanoAiu;
  return { inputTokens, cacheReadTokens, totalNanoAiu };
}
function distributeEvenly(total, n) {
  if (n <= 0) {
    return [];
  }
  const base = Math.floor(total / n);
  const parts = new Array(n).fill(base);
  let remainder = total - base * n;
  for (let i = n - 1; remainder > 0; i--, remainder--) {
    parts[i] += 1;
  }
  return parts;
}
function sumChatStateUsage(chat) {
  let totalNanoAiu = 0;
  let hasUsage = false;
  const add = (usage) => {
    if (!usage) {
      return;
    }
    hasUsage = true;
    totalNanoAiu += readCopilotNanoAiu(usage);
  };
  for (const turn of chat.turns) {
    add(turn.usage);
  }
  add(chat.activeTurn?.usage);
  return hasUsage ? { totalNanoAiu } : void 0;
}
function readCopilotNanoAiu(usage) {
  return readUsageInfoMeta(usage).copilotUsage?.totalNanoAiu ?? 0;
}
function parseJsonl(text) {
  const records = [];
  appendJsonlRecords(text, records);
  return records;
}
function appendJsonlRecords(text, records) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.type === "string" && typeof parsed.id === "string" && typeof parsed.timestamp === "string" && (parsed.parentId === null || typeof parsed.parentId === "string") && parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data)) {
        records.push(parsed);
      }
    } catch {
    }
  }
}
function lastIndexOfNewline(buffer) {
  const bytes = buffer.buffer;
  for (let i = bytes.length - 1; i >= 0; i--) {
    if (bytes[i] === 10) {
      return i;
    }
  }
  return -1;
}
function fallbackSessionTitle(sessionId) {
  return localize("agentHost.debug.untitledSession", "Copilot Session {0}", sessionId.slice(0, 8));
}
function extractSessionTitle(text) {
  for (const record of parseJsonl(text)) {
    if (record.type === "user.message") {
      const content = asString(record.data.content);
      if (content) {
        return summarize(content);
      }
    }
  }
  return void 0;
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function asNumber(value) {
  return typeof value === "number" && isFinite(value) ? value : void 0;
}
function asBoolean(value) {
  return typeof value === "boolean" ? value : void 0;
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function diffMillis(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return isFinite(a) && isFinite(b) && b >= a ? b - a : void 0;
}
function stringifyPayload(value) {
  if (value === void 0 || value === null) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, void 0, 2);
  } catch {
    return void 0;
  }
}
function truncate(value, max) {
  if (value === void 0) {
    return void 0;
  }
  return value.length > max ? value.slice(0, max) + "\u2026" : value;
}
function summarize(content) {
  const firstLine = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return firstLine.length > 100 ? firstLine.slice(0, 100) + "\u2026" : firstLine;
}
function toErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
export {
  AgentHostChatDebugContribution,
  buildCustomizationDebugEvents,
  convertAgentHostEventsToDebugEvents,
  parseJsonl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcYWdlbnRIb3N0Q2hhdERlYnVnUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIEN1c3RvbWl6YXRpb25UeXBlLCByZWFkVXNhZ2VJbmZvTWV0YSwgU3RhdGVDb21wb25lbnRzLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBVc2FnZUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnSG9va1Jlc3VsdCwgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdDdXN0b21pemF0aW9uTG9nRW50cnksIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z0ZpbGVFbnRyeSwgSUNoYXREZWJ1Z0xvZ1Byb3ZpZGVyLCBJQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb24sIElDaGF0RGVidWdNb2RlbFR1cm5FdmVudCwgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50LCBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkLCBBZ2VudEhvc3RBZ2VudERlYnVnTG9nTWF4RXZlbnRzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBidWlsZExvY2FsU2Vzc2lvblN0YXRlVXJpLCBDT1BJTE9UX0NMSV9FSF9TQ0hFTUUsIENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSwgZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZCwgcmVzb2x2ZUV2ZW50c1VyaSB9IGZyb20gJy4uL2NvcGlsb3RDbGlFdmVudHNVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q3VzdG9taXphdGlvblJlY29yZGVyLCBBZ2VudEhvc3RVc2FnZVJlY29yZGVyLCBidWlsZEFnZW50SG9zdEN1c3RvbWl6YXRpb25zVXJpLCBidWlsZEFnZW50SG9zdFVzYWdlVXJpLCByZWFkQWdlbnRIb3N0Q3VzdG9taXphdGlvbnNTbmFwc2hvdCwgcmVhZEFnZW50SG9zdFVzYWdlUmVjb3JkcywgdHlwZSBJQWdlbnRIb3N0VXNhZ2VSZWNvcmQgfSBmcm9tICcuL2FnZW50SG9zdFVzYWdlU2lkZWNhci5qcyc7XG5cbi8qKlxuICogT25lIHJlY29yZCBpbiBhbiBBZ2VudCBIb3N0IENvcGlsb3QgQ0xJIGBldmVudHMuanNvbmxgIHN0cmVhbS4gVGhlIENMSVxuICogd3JpdGVzIGEgbGluZS1kZWxpbWl0ZWQgSlNPTiBsb2cgb2YgdGhlIHNlc3Npb24gdW5kZXJcbiAqIGA8Q09QSUxPVF9IT01FPi9zZXNzaW9uLXN0YXRlLzxpZD4vZXZlbnRzLmpzb25sYC4gRXZlcnkgcmVjb3JkIHNoYXJlcyB0aGUgc2FtZVxuICogZW52ZWxvcGUuIE5vdGUgdGhhdCBgcGFyZW50SWRgIGlzICoqbm90KiogYSBsb2dpY2FsIHBhcmVudDogdGhlIFNESyBkZWZpbmVzXG4gKiBpdCBhcyB0aGUgY2hyb25vbG9naWNhbGx5IHByZWNlZGluZyBldmVudCBpbiB0aGUgc2Vzc2lvbiAoYSBmbGF0IGxpbmtlZCBjaGFpblxuICogb3ZlciBldmVyeSBldmVudCksIG5vdCB0aGUgdXNlciBcdTIxOTIgbW9kZWwtdHVybiBcdTIxOTIgdG9vbC1jYWxsIGhpZXJhcmNoeS4gVGhlXG4gKiBwYW5lbCdzIHRyYWplY3RvcnkgdHJlZSBpcyBpbnN0ZWFkIHJlY29uc3RydWN0ZWQgZnJvbSBlYWNoIHJlY29yZCdzIGxvZ2ljYWxcbiAqIGNvbnRleHQgKHR1cm4gLyB0b29sLWNhbGwgLyBhZ2VudCBpZHMpOyBzZWVcbiAqIHtAbGluayBjb252ZXJ0QWdlbnRIb3N0RXZlbnRzVG9EZWJ1Z0V2ZW50c30uXG4gKi9cbmludGVyZmFjZSBJQWdlbnRIb3N0RXZlbnRSZWNvcmQge1xuXHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudElkOiBzdHJpbmcgfCBudWxsO1xuXHQvKiogU3ViLWFnZW50IGluc3RhbmNlIGlkOyBhYnNlbnQgZm9yIHRoZSBtYWluIGFnZW50IGFuZCBzZXNzaW9uLWxldmVsIGV2ZW50cy4gKi9cblx0cmVhZG9ubHkgYWdlbnRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG4vKiogTWF4aW11bSBudW1iZXIgb2Ygc2Vzc2lvbi1zdGF0ZSBmb2xkZXJzIHNjYW5uZWQgZm9yIHRoZSBzZXNzaW9uIGxpc3QuICovXG5jb25zdCBNQVhfRElTQ09WRVJFRF9TRVNTSU9OUyA9IDMwO1xuLyoqIEJ5dGVzIHJlYWQgZnJvbSB0aGUgaGVhZCBvZiBlYWNoIGBldmVudHMuanNvbmxgIHRvIGRlcml2ZSBhIHNlc3Npb24gdGl0bGUuICovXG5jb25zdCBUSVRMRV9SRUFEX0JZVEVTID0gNjQgKiAxMDI0O1xuLyoqIENhcCBvbiBjYWNoZWQgcmVzb2x2ZWQtZXZlbnQgZGV0YWlscyB0byBib3VuZCBtZW1vcnkuICovXG5jb25zdCBNQVhfUkVTT0xWRURfREVUQUlMUyA9IDUwXzAwMDtcbi8qKiBGYWxsYmFjayBpbi1tZW1vcnkgcmVjb3JkIGNhcCB3aGVuIHRoZSBjb25maWd1cmVkIHZhbHVlIGlzIG1pc3NpbmcvaW52YWxpZC4gKi9cbmNvbnN0IERFRkFVTFRfTUFYX0VWRU5UU19JTl9NRU1PUlkgPSAxMF8wMDA7XG4vKiogQ2FwIG9uIGEgdG9vbCBhcmd1bWVudC9yZXN1bHQgc3RyaW5nIHN0b3JlZCBvbiB0aGUgKGxpc3QtbGV2ZWwpIGV2ZW50LiAqL1xuY29uc3QgTUFYX0VWRU5UX1BBWUxPQUQgPSA0XzAwMDtcbi8qKiBDYXAgb24gYSB0b29sIGFyZ3VtZW50L3Jlc3VsdCBzdHJpbmcgc3RvcmVkIGZvciB0aGUgZGV0YWlsIChleHBhbmRlZCkgdmlldy4gKi9cbmNvbnN0IE1BWF9ERVRBSUxfUEFZTE9BRCA9IDEwMF8wMDA7XG5cbi8qKlxuICogRmVlZHMgQWdlbnQgSG9zdCAoQ29waWxvdCBDTEkpIHNlc3Npb25zIGludG8gdGhlIEFnZW50IERlYnVnIExvZ3MgcGFuZWwgYnlcbiAqIHJlYWRpbmcgZWFjaCBzZXNzaW9uJ3Mgb24tZGlzayBgZXZlbnRzLmpzb25sYCBhbmQgY29udmVydGluZyB0aGUgcmVjb3Jkc1xuICogaW50byB7QGxpbmsgSUNoYXREZWJ1Z0V2ZW50fXMuIFJlZ2lzdGVycyBhIGNvcmUtc2lkZVxuICoge0BsaW5rIElDaGF0RGVidWdMb2dQcm92aWRlcn0gKHRoZSBzZXJ2aWNlIHN1cHBvcnRzIG11bHRpcGxlIHByb3ZpZGVyc1xuICogYWxvbmdzaWRlIHRoZSBleHRlbnNpb24ncyksIGFuZCBhZGRzIGRpc2NvdmVyZWQgbG9jYWwgc2Vzc2lvbnMgdG8gdGhlXG4gKiBhdmFpbGFibGUtc2Vzc2lvbnMgbGlzdCBzbyB0aGV5IGFwcGVhciBpbiB0aGUgaG9tZSB2aWV3LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0Q2hhdERlYnVnQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hZ2VudEhvc3RDaGF0RGVidWcnO1xuXG5cdC8qKiBSZXNvbHZlZCAoZXhwYW5kZWQpIGRldGFpbCBmb3IgZWFjaCBlbWl0dGVkIGV2ZW50IGlkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQ+KCk7XG5cblx0LyoqIEd1YXJkcyBhZ2FpbnN0IGNvbmN1cnJlbnQvb3ZlcmxhcHBpbmcgc2Vzc2lvbiBkaXNjb3Zlcnkgc2NhbnMuICovXG5cdHByaXZhdGUgX2Rpc2NvdmVyaW5nID0gZmFsc2U7XG5cblx0LyoqIFRydWUgb25jZSB0aGUgbGF6eSBmZXRjaGVyIGhhcyBydW4gYXQgbGVhc3Qgb25jZSAoaS5lLiB0aGUgcGFuZWwgaGFzIGJlZW4gb3BlbmVkKS4gKi9cblx0cHJpdmF0ZSBfaGFzRmV0Y2hlZE9uY2UgPSBmYWxzZTtcblxuXHQvKiogV2F0Y2hlcyB0aGUgY3VycmVudGx5LXZpZXdlZCBzZXNzaW9uJ3MgZXZlbnRzLmpzb25sIGZvciBsaXZlIHJlZnJlc2guICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpdmVSZWZyZXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgX3dhdGNoZWRTZXNzaW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEluY3JlbWVudGFsLXJlYWQgY2FjaGUgZm9yIHRoZSBhY3RpdmVseS12aWV3ZWQgc2Vzc2lvbidzIGBldmVudHMuanNvbmxgLlxuXHQgKiBUaGUgQ0xJIGFwcGVuZHMgdG8gdGhlIGZpbGUsIHNvIGVhY2ggbGl2ZSByZWZyZXNoIHJlYWRzIG9ubHkgdGhlIGJ5dGVzXG5cdCAqIGFkZGVkIHNpbmNlIHRoZSBsYXN0IHJlYWQgYW5kIHBhcnNlcyBqdXN0IHRoZSBuZXcgbGluZXMsIGF2b2lkaW5nIGFuXG5cdCAqIE8oTikgd2hvbGUtZmlsZSByZS1yZWFkICsgcmUtcGFyc2Ugb24gZXZlcnkgY2hhbmdlLiBCb3VuZGVkIHRvIGEgc2luZ2xlXG5cdCAqIHNlc3Npb24gKHRoZSBvbmUgYmVpbmcgdmlld2VkKSBhbmQgcmVsZWFzZWQgd2hlbiB0aGF0IHNlc3Npb24gZW5kcy5cblx0ICovXG5cdHByaXZhdGUgX2xpdmVSZWFkOiB7IGtleTogc3RyaW5nOyBjb25zdW1lZEJ5dGVzOiBudW1iZXI7IHBlbmRpbmdCeXRlczogVlNCdWZmZXI7IHJlY29yZHM6IElBZ2VudEhvc3RFdmVudFJlY29yZFtdIH0gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNpemUtZ2F0ZWQgY2FjaGUgZm9yIHRoZSBhY3RpdmVseS12aWV3ZWQgc2Vzc2lvbidzIHVzYWdlIHNpZGVjYXIuIFRoZVxuXHQgKiBzaWRlY2FyIGlzIHJlYWQgb24gZXZlcnkgbGl2ZSB0aWNrLCBidXQgaXMgYXBwZW5kLW9ubHksIHNvIHdlIHJlLXJlYWQgYW5kXG5cdCAqIHJlLXBhcnNlIGl0IG9ubHkgd2hlbiBpdHMgYnl0ZSBzaXplIGNoYW5nZWQgc2luY2UgdGhlIGxhc3QgcmVhZCAobW9zdFxuXHQgKiB0aWNrcyBcdTIwMTQgdG9vbCBwcm9ncmVzcywgZXRjLiBcdTIwMTQgYWRkIG5vIHVzYWdlIHJlY29yZHMpLiBCb3VuZGVkIHRvIGEgc2luZ2xlXG5cdCAqIHNlc3Npb24gYW5kIHJlbGVhc2VkIHdoZW4gdGhhdCBzZXNzaW9uIGVuZHMuXG5cdCAqL1xuXHRwcml2YXRlIF91c2FnZVJlYWQ6IHsga2V5OiBzdHJpbmc7IHNpemU6IG51bWJlcjsgcmVjb3JkczogcmVhZG9ubHkgSUFnZW50SG9zdFVzYWdlUmVjb3JkW10gfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyOiBJQ2hhdERlYnVnTG9nUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiAoc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4gdGhpcy5fcHJvdmlkZUNoYXREZWJ1Z0xvZyhzZXNzaW9uUmVzb3VyY2UsIHRva2VuKSxcblx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dFdmVudDogYXN5bmMgZXZlbnRJZCA9PiB0aGlzLl9yZXNvbHZlZC5nZXQoZXZlbnRJZCksXG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblxuXHRcdC8vIENhcHR1cmUgbGl2ZSB0b2tlbi11c2FnZSBhY3Rpb25zIHRvIGEgc3RhYmxlIGNsaWVudC1sb2NhbCBzaWRlY2FyIHNvXG5cdFx0Ly8gcGVyLXR1cm4vcGVyLXJvdW5kIG1ldHJpY3Mgc3Vydml2ZSBhIFZTIENvZGUgcmVzdGFydCBhbmQgZmVlZCB0aGUgQ2FjaGVcblx0XHQvLyBFeHBsb3JlciBhY2N1cmF0ZWx5ICh3b3JrcyBmb3IgbG9jYWwgYW5kIHJlbW90ZSBob3N0cyBhbGlrZSkuIEdhdGVkIG9uXG5cdFx0Ly8gdGhlIHNhbWUgYWdlbnQtaG9zdCBzZXR0aW5nIHRoYXQgZ2F0ZXMgdGhlIHBhbmVsIGZvciBDTEkgc2Vzc2lvbnMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFVzYWdlUmVjb3JkZXIoXG5cdFx0XHR0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSxcblx0XHRcdCgpID0+IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkKSxcblx0XHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdHRoaXMuX2FnZW50SG9zdFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Ly8gQ2FwdHVyZSBlYWNoIHNlc3Npb24ncyBsb2FkZWQgY3VzdG9taXphdGlvbnMgKHNraWxscy9ob29rcy9hZ2VudHMvTUNQKVxuXHRcdC8vIHRvIGEgY2xpZW50LWxvY2FsIHNuYXBzaG90IHNvIGhpc3RvcmljYWwvY2xvc2VkIHNlc3Npb25zIHN0aWxsIHN1cmZhY2Vcblx0XHQvLyB0aGVtOiB0aGUgbGl2ZSBjdXN0b21pemF0aW9uIHNlcnZpY2Ugb25seSBrbm93cyBzZXNzaW9ucyB3aXRoIGFuIGFjdGl2ZVxuXHRcdC8vIHN0YXRlIHN1YnNjcmlwdGlvbiwgYW5kIHRoZSBTREsncyBgc2Vzc2lvbi4qX2xvYWRlZGAgZXZlbnRzIGFyZSBlcGhlbWVyYWwuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdEN1c3RvbWl6YXRpb25SZWNvcmRlcihcblx0XHRcdHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLFxuXHRcdFx0KCkgPT4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ0VuYWJsZWRTZXR0aW5nSWQpLFxuXHRcdFx0dGhpcy5fZmlsZVNlcnZpY2UsXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fYWdlbnRIb3N0U2VydmljZSxcblx0XHRcdHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHQvLyBTdG9wIHRoZSBsaXZlIGZpbGUgd2F0Y2hlciB3aGVuIHRoZSBzZXNzaW9uIGl0IGZvbGxvd3MgaXMgY2xvc2VkXG5cdFx0Ly8gKGUuZy4gbmF2aWdhdGluZyBIb21lIG9yIGNsb3NpbmcgdGhlIGRlYnVnIGVkaXRvciksIHNvIHdlIGRvbid0IGtlZXBcblx0XHQvLyByZS1yZWFkaW5nIGFuZCByZS1pbnZva2luZyBwcm92aWRlcnMgZm9yIGEgc2Vzc2lvbiBubyBsb25nZXIgc2hvd24uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdERlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oc2Vzc2lvblJlc291cmNlID0+IHtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdGhpcy5fd2F0Y2hlZFNlc3Npb25LZXkpIHtcblx0XHRcdFx0dGhpcy5fbGl2ZVJlZnJlc2guY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fd2F0Y2hlZFNlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2xpdmVSZWFkID0gdW5kZWZpbmVkOyAvLyByZWxlYXNlIHRoZSBwZXItc2Vzc2lvbiBwYXJzZSBjYWNoZVxuXHRcdFx0XHR0aGlzLl91c2FnZVJlYWQgPSB1bmRlZmluZWQ7IC8vIHJlbGVhc2UgdGhlIHBlci1zZXNzaW9uIHVzYWdlIGNhY2hlXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGlzY292ZXIgaGlzdG9yaWNhbCBsb2NhbCBzZXNzaW9ucyBzbyB0aGV5IGFwcGVhciBpbiB0aGUgaG9tZSBsaXN0IFx1MjAxNFxuXHRcdC8vIGJ1dCBvbmx5IHdoZW4gdGhlIGRlYnVnIHBhbmVsIGFjdHVhbGx5IG5lZWRzIHRoZW0uIFJlZ2lzdGVyaW5nIGEgbGF6eVxuXHRcdC8vIGZldGNoZXIgKGludm9rZWQgb24gdGhlIGZpcnN0IGBnZXRBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzKClgLCBpLmUuXG5cdFx0Ly8gd2hlbiB0aGUgaG9tZSB2aWV3IGZpcnN0IHJlbmRlcnMpIGtlZXBzIHRoZSBzdGFydHVwL2lkbGUgZm9vdHByaW50IGF0XG5cdFx0Ly8gemVybyB3aGVuIHRoZSBwYW5lbCBpcyBuZXZlciBvcGVuZWQuIFdoZW4gZmlsZSBsb2dnaW5nIGlzIHRvZ2dsZWQgb25cblx0XHQvLyBhZnRlciB0aGUgcGFuZWwgaGFzIGFscmVhZHkgbG9hZGVkIG9uY2UsIHJlLXNjYW4gZGlyZWN0bHkgc28gc2Vzc2lvbnNcblx0XHQvLyBzdXJmYWNlIHdpdGhvdXQgYSB3aW5kb3cgcmVsb2FkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2UucmVnaXN0ZXJBdmFpbGFibGVTZXNzaW9uc0ZldGNoZXIodG9rZW4gPT4gdGhpcy5fZmV0Y2hMb2NhbFNlc3Npb25zKHRva2VuKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkKSAmJiB0aGlzLl9oYXNGZXRjaGVkT25jZSkge1xuXHRcdFx0XHR0aGlzLl9tYXliZURpc2NvdmVyTG9jYWxTZXNzaW9ucygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXp5IGZldGNoZXIgcmVnaXN0ZXJlZCB3aXRoIHtAbGluayBJQ2hhdERlYnVnU2VydmljZX0uIEludm9rZWQgKGF0IG1vc3Rcblx0ICogb25jZSkgd2hlbiB0aGUgaG9tZSB2aWV3IGZpcnN0IHJlcXVlc3RzIHRoZSBhdmFpbGFibGUgc2Vzc2lvbiBsaXN0LCBzbyBub1xuXHQgKiBkaXNrIHNjYW4gaGFwcGVucyB1bnRpbCB0aGUgcGFuZWwgaXMgb3BlbmVkLiBSZXR1cm5zIG5vdGhpbmcgd2hlbiBmaWxlXG5cdCAqIGxvZ2dpbmcgaXMgZGlzYWJsZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9mZXRjaExvY2FsU2Vzc2lvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHVyaTogVVJJOyB0aXRsZT86IHN0cmluZyB9W10+IHtcblx0XHR0aGlzLl9oYXNGZXRjaGVkT25jZSA9IHRydWU7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBZ2VudERlYnVnTG9nRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9kaXNjb3ZlckxvY2FsU2Vzc2lvbnModG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhdERlYnVnXSBzZXNzaW9uIGRpc2NvdmVyeSBmYWlsZWQ6ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUnVucyB7QGxpbmsgX2Rpc2NvdmVyTG9jYWxTZXNzaW9uc30gd2hlbiBmaWxlIGxvZ2dpbmcgaXMgZW5hYmxlZCBhbmQgYWRkc1xuXHQgKiB0aGUgcmVzdWx0cyB0byB0aGUgYXZhaWxhYmxlLXNlc3Npb25zIGxpc3QsIGd1YXJkaW5nIGFnYWluc3Qgb3ZlcmxhcHBpbmdcblx0ICogc2NhbnMuIFVzZWQgZm9yIHRoZSByZS1zY2FuIHdoZW4gbG9nZ2luZyBpcyBlbmFibGVkIGFmdGVyIHRoZSBwYW5lbCBoYXNcblx0ICogYWxyZWFkeSBsb2FkZWQgb25jZSAodGhlIGluaXRpYWwgbG9hZCBnb2VzIHRocm91Z2gge0BsaW5rIF9mZXRjaExvY2FsU2Vzc2lvbnN9KS5cblx0ICogU2FmZSB0byBjYWxsIHJlcGVhdGVkbHk6IHtAbGluayBJQ2hhdERlYnVnU2VydmljZS5hZGRBdmFpbGFibGVTZXNzaW9uUmVzb3VyY2VzfVxuXHQgKiBkZWR1cGVzIGJ5IFVSSS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21heWJlRGlzY292ZXJMb2NhbFNlc3Npb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNjb3ZlcmluZyB8fCAhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc2NvdmVyaW5nID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9kaXNjb3ZlckxvY2FsU2Vzc2lvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmFkZEF2YWlsYWJsZVNlc3Npb25SZXNvdXJjZXMoc2Vzc2lvbnMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhdERlYnVnXSBzZXNzaW9uIGRpc2NvdmVyeSBmYWlsZWQ6ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZGlzY292ZXJpbmcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlRXZlbnRzVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1c2VySG9tZSA9IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKHsgcHJlZmVyTG9jYWw6IHRydWUgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUV2ZW50c1VyaShcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHVzZXJIb21lLFxuXHRcdFx0YXV0aG9yaXR5ID0+IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGFnZW50SG9zdEF1dGhvcml0eShjLmFkZHJlc3MpID09PSBhdXRob3JpdHkpLFxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlc3VsdC5raW5kID09PSAnb2snID8gcmVzdWx0LnJlc291cmNlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhdGNoZXMgdGhlIGdpdmVuIHNlc3Npb24ncyBldmVudHMuanNvbmwgYW5kIHJlLWludm9rZXMgcHJvdmlkZXJzIHdoZW4gaXRcblx0ICogY2hhbmdlcywgc28gdGhlIHBhbmVsIHVwZGF0ZXMgYXMgbmV3IHR1cm5zL3JlcXVlc3RzIHN0cmVhbSBpbi4gT25seSBvbmVcblx0ICogc2Vzc2lvbiAodGhlIG9uZSBjdXJyZW50bHkgc2hvd24pIGlzIHdhdGNoZWQgYXQgYSB0aW1lLiBSZW1vdGVcblx0ICogKG5vbi1gZmlsZWApIHNlc3Npb25zIGFyZSBub3Qgd2F0Y2hlZDsgdGhleSBzdGlsbCBsb2FkIG9uIG9wZW4uXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVMaXZlUmVmcmVzaChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgZXZlbnRzVXJpOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fd2F0Y2hlZFNlc3Npb25LZXkgPT09IGtleSkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IHdhdGNoaW5nIHRoaXMgc2Vzc2lvblxuXHRcdH1cblx0XHRpZiAoZXZlbnRzVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHR0aGlzLl9saXZlUmVmcmVzaC5jbGVhcigpO1xuXHRcdFx0dGhpcy5fd2F0Y2hlZFNlc3Npb25LZXkgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fd2F0Y2hlZFNlc3Npb25LZXkgPSBrZXk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gRGVib3VuY2U6IHRoZSBDTEkgYXBwZW5kcyBtYW55IHJlY29yZHMgcGVyIHR1cm47IGNvYWxlc2NlIGludG8gb25lIHJlLXJlYWQuXG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gc3RvcmUuYWRkKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2UuaW52b2tlUHJvdmlkZXJzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSwgNDAwKSk7XG5cdFx0Ly8gV2F0Y2ggdGhlIHNlc3Npb24tc3RhdGUgZGlyZWN0b3J5IChzY29wZWQgdG8gdGhpcyBmaWxlKSByYXRoZXIgdGhhblxuXHRcdC8vIHRoZSBzaW5nbGUgYGV2ZW50cy5qc29ubGA6IHRoZSBleHRlcm5hbCBDb3BpbG90IENMSSBwcm9jZXNzIHdyaXRlc1xuXHRcdC8vIHRoYXQgZmlsZSBmcm9tIGFub3RoZXIgcHJvY2VzcyBhbmQgYSBzaW5nbGUtZmlsZSB3YXRjaGVyIGNhbiBtaXNzXG5cdFx0Ly8gdGhvc2UgY2hhbmdlcyAoZS5nLiBhdG9taWMgcmVuYW1lL3JlcGxhY2UpLCBsZWF2aW5nIHRoZSBwYW5lbCBzdGFsZVxuXHRcdC8vIHVudGlsIHRoZSB1c2VyIHJlLW5hdmlnYXRlcy4gQSBkaXJlY3Rvcnkgd2F0Y2ggcmVsaWFibHkgc3VyZmFjZXNcblx0XHQvLyBhcHBlbmRzIHRvIHRoZSBmaWxlIHNvIHRoZSBMb2dzIHZpZXcgdXBkYXRlcyBsaXZlLlxuXHRcdGNvbnN0IHdhdGNoZXIgPSBzdG9yZS5hZGQodGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcihkaXJuYW1lKGV2ZW50c1VyaSksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hlci5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGNvbnN0IGFmZmVjdHMgPSBlLmFmZmVjdHMoZXZlbnRzVXJpKTtcblx0XHRcdGlmIChhZmZlY3RzKSB7XG5cdFx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEFsc28gcmVmcmVzaCB3aGVuIHRoZSBsaXZlIEFIUCBjaGF0IHN0YXRlIGNoYW5nZXM6IGlucHV0L2NhY2hlL0FJVVxuXHRcdC8vIHVzYWdlIGlzIG9uIHRoZSBjaGF0IGNoYW5uZWwgKG5vdCBpbiBldmVudHMuanNvbmwgdW50aWxcblx0XHQvLyBzZXNzaW9uLnNodXRkb3duKSwgc28gYSB1c2FnZSB1cGRhdGUgbWlkLXR1cm4gbXVzdCByZS1yZW5kZXIgdGhlIHRpbGVzLlxuXHRcdGNvbnN0IGxpdmVTdWIgPSB0aGlzLl9zZXNzaW9uQ2hhdFN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChsaXZlU3ViKSB7XG5cdFx0XHRzdG9yZS5hZGQobGl2ZVN1Yi5vbkRpZENoYW5nZSgoKSA9PiBzY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBzZXQgb2YgbG9hZGVkIGN1c3RvbWl6YXRpb25zIChza2lsbHMvaG9va3MvYWdlbnRzL01DUCkgaXMgc291cmNlZFxuXHRcdC8vIGZyb20gbGl2ZSBzZXNzaW9uIHN0YXRlLCBub3QgZXZlbnRzLmpzb25sLCBzbyByZS1yZWFkIHdoZW4gaXQgY2hhbmdlcy5cblx0XHRzdG9yZS5hZGQodGhpcy5fY3VzdG9taXphdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucygoKSA9PiBzY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXG5cdFx0dGhpcy5fbGl2ZVJlZnJlc2gudmFsdWUgPSBzdG9yZTsgLy8gZGlzcG9zZXMgYW55IHByZXZpb3VzbHktd2F0Y2hlZCBzZXNzaW9uXG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbGl2ZSBBSFAgY2hhdC1zdGF0ZSBzdWJzY3JpcHRpb24gZm9yIGEgbG9jYWwgQWdlbnQgSG9zdFxuXHQgKiBzZXNzaW9uLCBpZiBvbmUgaXMgY3VycmVudGx5IGFjdGl2ZSAoaS5lLiB0aGUgc2Vzc2lvbiBpcyBvcGVuL3N1YnNjcmliZWQpLlxuXHQgKiBUdXJucyAoYW5kIHRoZWlyIHVzYWdlKSBsaXZlIG9uIHRoZSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IGNoYW5uZWwsIHNvIHdlXG5cdCAqIHN1YnNjcmliZSB0byB0aGF0IGNoYW5uZWwgcmF0aGVyIHRoYW4gdGhlIHNlc3Npb24uIFJlYWQtb25seTogbmV2ZXJcblx0ICogY3JlYXRlcyBhIHN1YnNjcmlwdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3Nlc3Npb25DaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKSB7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZS5zY2hlbWUgIT09IENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbGl2ZSB1c2FnZSBvbmx5IGZvciBsb2NhbCBBZ2VudCBIb3N0IHNlc3Npb25zXG5cdFx0fVxuXHRcdGNvbnN0IHJhd0lkID0gZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghcmF3SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGJhY2tlbmRTZXNzaW9uID0gVVJJLmZyb20oeyBzY2hlbWU6IENPUElMT1RfQ0xJX0VIX1NDSEVNRSwgcGF0aDogYC8ke3Jhd0lkfWAgfSk7XG5cdFx0Ly8gVHVybnMvdXNhZ2UgbW92ZWQgb2ZmIHRoZSBzZXNzaW9uIG9udG8gaXRzIGRlZmF1bHQgY2hhdCBjaGFubmVsLlxuXHRcdGNvbnN0IGNoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2FnZW50SG9zdFNlcnZpY2UuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkKFN0YXRlQ29tcG9uZW50cy5DaGF0LCBjaGF0VXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBsaXZlIENvcGlsb3QgQUlVIGZyb20gdGhlIEFIUCBzZXNzaW9uIHN0YXRlIGFzIGEgZmFsbGJhY2sgdXNhZ2Vcblx0ICogc291cmNlIGZvciBpbi1wcm9ncmVzcyBzZXNzaW9ucyAobm8gYHNlc3Npb24uc2h1dGRvd25gIHN1bW1hcnkgeWV0KS5cblx0ICogT25seSBBSVUgaXMgcmVsaWFibGUgbGl2ZTsgaW5wdXQvY2FjaGUgbmVlZCB0aGUgc2h1dGRvd24gc3VtbWFyeSAoRjEpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0TGl2ZVVzYWdlVG90YWxzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSVNlc3Npb25Vc2FnZVRvdGFscyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hhdCA9IHRoaXMuX3Nlc3Npb25DaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25SZXNvdXJjZSk/LnZhbHVlO1xuXHRcdGlmICghY2hhdCB8fCBjaGF0IGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzdW1DaGF0U3RhdGVVc2FnZShjaGF0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgY2xpZW50LWxvY2FsIHVzYWdlIHNpZGVjYXIgZm9yIGEgc2Vzc2lvbiAoZXhhY3QgcGVyLXJlcXVlc3Rcblx0ICogdG9rZW4gbWV0cmljcyBjYXB0dXJlZCBsaXZlKS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGhhcyBub1xuXHQgKiBzaWRlY2FyIChlLmcuIGl0IHJhbiBiZWZvcmUgY2FwdHVyZSBzaGlwcGVkKSwgc28gdGhlIGNvbnZlcnRlciBmYWxscyBiYWNrXG5cdCAqIHRvIHRoZSBzZXNzaW9uLnNodXRkb3duIHN1bW1hcnkgLyBsaXZlIHRvdGFscy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRVc2FnZVJlY29yZHMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudEhvc3RVc2FnZVJlY29yZFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmF3SWQgPSBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFyYXdJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gYnVpbGRBZ2VudEhvc3RVc2FnZVVyaSh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlclJvYW1pbmdEYXRhSG9tZSwgcmF3SWQpO1xuXHRcdGNvbnN0IGtleSA9IHVyaS50b1N0cmluZygpO1xuXG5cdFx0bGV0IHNpemU6IG51bWJlcjtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHRcdHNpemUgPSBzdGF0LnNpemUgPz8gMDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX3VzYWdlUmVhZCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIG5vIHNpZGVjYXIgZm9yIHRoaXMgc2Vzc2lvblxuXHRcdH1cblxuXHRcdC8vIEFwcGVuZC1vbmx5IHNpZGVjYXI6IHJldXNlIHRoZSBwYXJzZWQgcmVjb3JkcyB3aGVuIHRoZSBzaXplIGlzIHVuY2hhbmdlZC5cblx0XHRpZiAodGhpcy5fdXNhZ2VSZWFkPy5rZXkgPT09IGtleSAmJiB0aGlzLl91c2FnZVJlYWQuc2l6ZSA9PT0gc2l6ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3VzYWdlUmVhZC5yZWNvcmRzLmxlbmd0aCA+IDAgPyB0aGlzLl91c2FnZVJlYWQucmVjb3JkcyA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZWNvcmRzID0gYXdhaXQgcmVhZEFnZW50SG9zdFVzYWdlUmVjb3Jkcyh0aGlzLl9maWxlU2VydmljZSwgdXJpKTtcblx0XHR0aGlzLl91c2FnZVJlYWQgPSB7IGtleSwgc2l6ZSwgcmVjb3JkcyB9O1xuXHRcdHJldHVybiByZWNvcmRzLmxlbmd0aCA+IDAgPyByZWNvcmRzIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBjbGllbnQtbG9jYWwgY3VzdG9taXphdGlvbiBzbmFwc2hvdCBmb3IgYSBzZXNzaW9uICh0aGUgbGFzdFxuXHQgKiBsb2FkZWQgc2tpbGxzL2hvb2tzL2FnZW50cy9NQ1AgY2FwdHVyZWQgbGl2ZSkuIFVzZWQgYXMgYSBmYWxsYmFjayBmb3Jcblx0ICogaGlzdG9yaWNhbC9jbG9zZWQgc2Vzc2lvbnMsIHdoZXJlIHRoZSBsaXZlIGN1c3RvbWl6YXRpb24gc2VydmljZSBoYXMgbm9cblx0ICogYWN0aXZlIHN0YXRlIHN1YnNjcmlwdGlvbiBhbmQgcmV0dXJucyBub3RoaW5nLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm9cblx0ICogc25hcHNob3QgZXhpc3RzIChlLmcuIHRoZSBzZXNzaW9uIHJhbiBiZWZvcmUgY2FwdHVyZSBzaGlwcGVkKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRDdXN0b21pemF0aW9uc1NuYXBzaG90KHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxyZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByYXdJZCA9IGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXJhd0lkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cmkgPSBidWlsZEFnZW50SG9zdEN1c3RvbWl6YXRpb25zVXJpKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lLCByYXdJZCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCByZWFkQWdlbnRIb3N0Q3VzdG9taXphdGlvbnNTbmFwc2hvdCh0aGlzLl9maWxlU2VydmljZSwgdXJpKTtcblx0XHRyZXR1cm4gc25hcHNob3QgJiYgc25hcHNob3QubGVuZ3RoID4gMCA/IHNuYXBzaG90IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcHJvdmlkZUNoYXREZWJ1Z0xvZyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdERlYnVnRXZlbnRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBhZ2VudC1ob3N0IGRlYnVnIGxvZ2dpbmcgZGlzYWJsZWRcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnRzVXJpID0gdGhpcy5fcmVzb2x2ZUV2ZW50c1VyaShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZXZlbnRzVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBub3QgYW4gQWdlbnQgSG9zdCBDb3BpbG90IENMSSBzZXNzaW9uXG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCB0aGUgcGFuZWwgbGl2ZTogd2F0Y2ggdGhpcyBzZXNzaW9uJ3MgZXZlbnRzLmpzb25sIGFuZCByZS1pbnZva2Vcblx0XHQvLyBwcm92aWRlcnMgb24gY2hhbmdlLiBBIGZ1bGwgcmUtcmVhZCBoYW5kbGVzIG5ldyB0dXJucywgdG9vbFxuXHRcdC8vIHN0YXJ0XHUyMTkyY29tcGxldGUgdHJhbnNpdGlvbnMsIGFuZCB0aGUgc2Vzc2lvbi5zaHV0ZG93biB1c2FnZSBzdW1tYXJ5LlxuXHRcdC8vIFRoaXMgbXVzdCBydW4gQkVGT1JFIHRoZSByZWFkIGJlbG93OiBhIGJyYW5kLW5ldyBzZXNzaW9uIGhhcyBub1xuXHRcdC8vIGV2ZW50cy5qc29ubCB5ZXQsIGFuZCBpZiB3ZSByZXR1cm5lZCBlYXJseSBvbiB0aGUgZmFpbGVkIHJlYWQgd2l0aG91dFxuXHRcdC8vIGFybWluZyB0aGUgd2F0Y2hlciwgbGl2ZSB1cGRhdGVzIHdvdWxkIG5ldmVyIHN1cmZhY2UgdW50aWwgdGhlIHBhbmVsXG5cdFx0Ly8gaXMgcmUtb3BlbmVkLiBUaGUgd2F0Y2hlciB0YXJnZXRzIHRoZSAoYWxyZWFkeS1leGlzdGluZykgc2Vzc2lvbi1zdGF0ZVxuXHRcdC8vIGRpcmVjdG9yeSwgc28gaXQgZmlyZXMgd2hlbiB0aGUgQ0xJIGZpcnN0IGNyZWF0ZXMgdGhlIGZpbGUuXG5cdFx0dGhpcy5fZW5zdXJlTGl2ZVJlZnJlc2goc2Vzc2lvblJlc291cmNlLCBldmVudHNVcmkpO1xuXG5cdFx0Y29uc3QgcmVjb3JkcyA9IGF3YWl0IHRoaXMuX3JlYWRFdmVudFJlY29yZHMoZXZlbnRzVXJpLCB0b2tlbik7XG5cdFx0aWYgKHJlY29yZHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2Vzc2lvbiBoYXMgbm8gZXZlbnRzLmpzb25sIHlldCwgb3IgcmVhZCBmYWlsZWRcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZvciBpbi1wcm9ncmVzcyBzZXNzaW9ucyAobm8gc2Vzc2lvbi5zaHV0ZG93biB5ZXQpLCBmYWxsIGJhY2sgdG8gbGl2ZVxuXHRcdC8vIENvcGlsb3QgQUlVIGZyb20gdGhlIEFIUCBzZXNzaW9uIHN0YXRlIHNvIHRoZSB1c2FnZSB0aWxlIGlzbid0IGJsYW5rLlxuXHRcdC8vIChJbnB1dC9jYWNoZSBzdGF5IGJsYW5rIHVudGlsIHRoZSBzZXNzaW9uIGVuZHMgXHUyMDE0IHNlZSBGMS4pXG5cdFx0Y29uc3QgbGl2ZVVzYWdlVG90YWxzID0gdGhpcy5fZ2V0TGl2ZVVzYWdlVG90YWxzKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHQvLyBQcmVmZXIgdGhlIGNsaWVudC1sb2NhbCB1c2FnZSBzaWRlY2FyOiBpdCByZWNvcmRzIGV4YWN0IHBlci1yZXF1ZXN0XG5cdFx0Ly8gaW5wdXQvY2FjaGUvQUlVIChjYXB0dXJlZCBsaXZlIGZyb20gQ2hhdFVzYWdlIGFjdGlvbnMpIHNvIG1ldHJpY3MgYXJlXG5cdFx0Ly8gY29ycmVjdCBwZXIgcm91bmQgYW5kIHN1cnZpdmUgYSByZXN0YXJ0LiBGYWxscyBiYWNrIHRvIHRoZVxuXHRcdC8vIHNlc3Npb24uc2h1dGRvd24gZXZlbi1zcGxpdCAvIGxpdmUgdG90YWxzIHdoZW4gbm8gc2lkZWNhciBleGlzdHMuXG5cdFx0Y29uc3QgdXNhZ2VSZWNvcmRzID0gYXdhaXQgdGhpcy5fcmVhZFVzYWdlUmVjb3JkcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBMb2FkZWQgY3VzdG9taXphdGlvbnMgKHNraWxscy9ob29rcy9hZ2VudHMvTUNQKSBjb21lIGZyb20gbGl2ZSBzZXNzaW9uXG5cdFx0Ly8gc3RhdGUgXHUyMDE0IHRoZSBTREsncyBgc2Vzc2lvbi4qX2xvYWRlZGAgZXZlbnRzIGFyZSBlcGhlbWVyYWwgYW5kIG5ldmVyXG5cdFx0Ly8gd3JpdHRlbiB0byBldmVudHMuanNvbmwgXHUyMDE0IHNvIHN1cmZhY2UgdGhlbSBhcyBkaXNjb3ZlcnkgZXZlbnRzLCBtaXJyb3Jpbmdcblx0XHQvLyB0aGUgbG9jYWwgYFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbmAuIExpdmUgc3RhdGUgaXMgZW1wdHkgZm9yXG5cdFx0Ly8gaGlzdG9yaWNhbC9jbG9zZWQgc2Vzc2lvbnMsIHNvIGZhbGwgYmFjayB0byB0aGUgY2xpZW50LWxvY2FsIHNuYXBzaG90XG5cdFx0Ly8gY2FwdHVyZWQgYnkgYEFnZW50SG9zdEN1c3RvbWl6YXRpb25SZWNvcmRlcmAuXG5cdFx0bGV0IGN1c3RvbWl6YXRpb25zID0gdGhpcy5fY3VzdG9taXphdGlvblNlcnZpY2UuZ2V0Q3VzdG9taXphdGlvbnMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoY3VzdG9taXphdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRoaXMuX3JlYWRDdXN0b21pemF0aW9uc1NuYXBzaG90KHNlc3Npb25SZXNvdXJjZSkgPz8gY3VzdG9taXphdGlvbnM7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB7IGV2ZW50cywgcmVzb2x2ZWQgfSA9IGNvbnZlcnRBZ2VudEhvc3RFdmVudHNUb0RlYnVnRXZlbnRzKHJlY29yZHMsIHNlc3Npb25SZXNvdXJjZSwgbGl2ZVVzYWdlVG90YWxzLCB1c2FnZVJlY29yZHMsIGN1c3RvbWl6YXRpb25zKTtcblxuXHRcdC8vIE1lcmdlIHRoZSByZXNvbHZlZC1kZXRhaWwgbWFwLCBldmljdGluZyBvbGRlc3QgZW50cmllcyBwYXN0IHRoZSBjYXAuXG5cdFx0Zm9yIChjb25zdCBbaWQsIGRldGFpbF0gb2YgcmVzb2x2ZWQpIHtcblx0XHRcdHRoaXMuX3Jlc29sdmVkLnNldChpZCwgZGV0YWlsKTtcblx0XHRcdGlmICh0aGlzLl9yZXNvbHZlZC5zaXplID4gTUFYX1JFU09MVkVEX0RFVEFJTFMpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSB0aGlzLl9yZXNvbHZlZC5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHRpZiAoZmlyc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkLmRlbGV0ZShmaXJzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZXZlbnRzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWRzIHRoZSBzZXNzaW9uJ3MgYGV2ZW50cy5qc29ubGAgaW50byBwYXJzZWQgcmVjb3JkcywgcmVhZGluZyBvbmx5IHRoZVxuXHQgKiBieXRlcyBhcHBlbmRlZCBzaW5jZSB0aGUgbGFzdCByZWFkIGZvciB0aGUgYWN0aXZlbHktdmlld2VkIHNlc3Npb24uXG5cdCAqXG5cdCAqIFRoZSBDb3BpbG90IENMSSBhcHBlbmRzIHRvIGBldmVudHMuanNvbmxgIGxpbmUtYnktbGluZSBmcm9tIGEgc2VwYXJhdGVcblx0ICogcHJvY2Vzcywgc28gYSBsaXZlIHNlc3Npb24gaXMgYW4gYXBwZW5kLW9ubHkgc3RyZWFtLiBSYXRoZXIgdGhhblxuXHQgKiByZS1yZWFkaW5nIGFuZCByZS1gSlNPTi5wYXJzZWAtaW5nIHRoZSB3aG9sZSAocG90ZW50aWFsbHkgbXVsdGktTUIpIGZpbGVcblx0ICogb24gZXZlcnkgY2hhbmdlIFx1MjAxNCB3aGljaCBpcyBPKE4pIHBlciB0aWNrIGFuZCBPKE5eMikgb3ZlciBhIGxvbmcgc2Vzc2lvbiBcdTIwMTRcblx0ICogd2UgY2FjaGUgdGhlIHBhcnNlZCByZWNvcmRzIHBsdXMgdGhlIGJ5dGUgb2Zmc2V0IGNvbnN1bWVkIHNvIGZhciBhbmQgcmVhZFxuXHQgKiBvbmx5IHRoZSBuZXcgdGFpbC4gQSBmdWxsIHJlYWQgaXMgdXNlZCBvbiBmaXJzdCB2aWV3LCBhIGNhY2hlIG1pc3MsIG9yXG5cdCAqIHdoZW4gdGhlIGZpbGUgc2hyYW5rIChyb3RhdGlvbi90cnVuY2F0aW9uKS5cblx0ICpcblx0ICogQnl0ZSBvZmZzZXRzIGFyZSBvbmx5IGV2ZXIgYWR2YW5jZWQgdG8gYSBuZXdsaW5lIGJvdW5kYXJ5IChgXFxuYCBpcyBhXG5cdCAqIHNpbmdsZSBieXRlIHRoYXQgbmV2ZXIgYXBwZWFycyBpbnNpZGUgYSBtdWx0aS1ieXRlIFVURi04IHNlcXVlbmNlKSwgc28gYVxuXHQgKiB0YWlsIHJlYWQgbmV2ZXIgc3RhcnRzIG1pZC1jb2RlcG9pbnQ7IGFueSB0cmFpbGluZyBwYXJ0aWFsIGxpbmUgaXMga2VwdFxuXHQgKiBhcyBgcGVuZGluZ0J5dGVzYCBhbmQgcHJlcGVuZGVkIHRvIHRoZSBuZXh0IHJlYWQuXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgZmlsZSBkb2VzIG5vdCBleGlzdCB5ZXQgb3IgY2Fubm90IGJlIHJlYWQuXG5cdCAqL1xuXHQvKipcblx0ICogVGhlIGNvbmZpZ3VyZWQgaW4tbWVtb3J5IGV2ZW50IGNhcCBmb3IgYWdlbnQgaG9zdCBzZXNzaW9ucyAoc2VlXG5cdCAqIHtAbGluayBBZ2VudEhvc3RBZ2VudERlYnVnTG9nTWF4RXZlbnRzU2V0dGluZ0lkfSkuIFRoZSByYXcgcmVjb3JkIGNhY2hlIGlzXG5cdCAqIHRyaW1tZWQgdG8gdGhpcyBtYW55IGVudHJpZXMgc28gYSBsb25nLXJ1bm5pbmcgc2Vzc2lvbiBkb2VzIG5vdCByZXRhaW4gYW5cblx0ICogdW5ib3VuZGVkIGFycmF5LCBtYXRjaGluZyB0aGUgY2FwcGVkIHB1YmxpYyBldmVudCBidWZmZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXhSZWNvcmRzSW5NZW1vcnkoKTogbnVtYmVyIHtcblx0XHRjb25zdCBjb25maWd1cmVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihBZ2VudEhvc3RBZ2VudERlYnVnTG9nTWF4RXZlbnRzU2V0dGluZ0lkKTtcblx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyZWQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShjb25maWd1cmVkKSAmJiBjb25maWd1cmVkID49IDEpIHtcblx0XHRcdHJldHVybiBNYXRoLmZsb29yKGNvbmZpZ3VyZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gREVGQVVMVF9NQVhfRVZFTlRTX0lOX01FTU9SWTtcblx0fVxuXG5cdC8qKiBUcmltcyBgcmVjb3Jkc2AgaW4gcGxhY2UgdG8gdGhlIG1vc3QgcmVjZW50IHtAbGluayBfbWF4UmVjb3Jkc0luTWVtb3J5fSBlbnRyaWVzLiAqL1xuXHRwcml2YXRlIF9jYXBSZWNvcmRzSW5NZW1vcnkocmVjb3JkczogSUFnZW50SG9zdEV2ZW50UmVjb3JkW10pOiB2b2lkIHtcblx0XHRjb25zdCBtYXggPSB0aGlzLl9tYXhSZWNvcmRzSW5NZW1vcnkoKTtcblx0XHRpZiAocmVjb3Jkcy5sZW5ndGggPiBtYXgpIHtcblx0XHRcdHJlY29yZHMuc3BsaWNlKDAsIHJlY29yZHMubGVuZ3RoIC0gbWF4KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkRXZlbnRSZWNvcmRzKGV2ZW50c1VyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudEhvc3RFdmVudFJlY29yZFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qga2V5ID0gZXZlbnRzVXJpLnRvU3RyaW5nKCk7XG5cdFx0bGV0IHNpemU6IG51bWJlcjtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQoZXZlbnRzVXJpKTtcblx0XHRcdHNpemUgPSBzdGF0LnNpemUgPz8gMDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xpdmVSZWFkID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2Vzc2lvbiBoYXMgbm8gZXZlbnRzLmpzb25sIHlldFxuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGUgPSB0aGlzLl9saXZlUmVhZD8ua2V5ID09PSBrZXkgPyB0aGlzLl9saXZlUmVhZCA6IHVuZGVmaW5lZDtcblxuXHRcdC8vIEluY3JlbWVudGFsIHRhaWwgcmVhZDogc2FtZSBzZXNzaW9uLCBmaWxlIGdyZXcgKG9yIGlzIHVuY2hhbmdlZCkuXG5cdFx0aWYgKGNhY2hlICYmIHNpemUgPj0gY2FjaGUuY29uc3VtZWRCeXRlcykge1xuXHRcdFx0aWYgKHNpemUgPT09IGNhY2hlLmNvbnN1bWVkQnl0ZXMpIHtcblx0XHRcdFx0cmV0dXJuIGNhY2hlLnJlY29yZHM7IC8vIG5vIG5ldyBieXRlcyAoZS5nLiBhbiB1bnJlbGF0ZWQgZGlyIGNoYW5nZSlcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShldmVudHNVcmksIHsgcG9zaXRpb246IGNhY2hlLmNvbnN1bWVkQnl0ZXMsIGxlbmd0aDogc2l6ZSAtIGNhY2hlLmNvbnN1bWVkQnl0ZXMgfSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29tYmluZWQgPSBjYWNoZS5wZW5kaW5nQnl0ZXMuYnl0ZUxlbmd0aCA/IFZTQnVmZmVyLmNvbmNhdChbY2FjaGUucGVuZGluZ0J5dGVzLCBjb250ZW50LnZhbHVlXSkgOiBjb250ZW50LnZhbHVlO1xuXHRcdFx0XHRjb25zdCBsYXN0TmV3bGluZSA9IGxhc3RJbmRleE9mTmV3bGluZShjb21iaW5lZCk7XG5cdFx0XHRcdGlmIChsYXN0TmV3bGluZSA+PSAwKSB7XG5cdFx0XHRcdFx0YXBwZW5kSnNvbmxSZWNvcmRzKGNvbWJpbmVkLnNsaWNlKDAsIGxhc3ROZXdsaW5lICsgMSkudG9TdHJpbmcoKSwgY2FjaGUucmVjb3Jkcyk7XG5cdFx0XHRcdFx0Y2FjaGUucGVuZGluZ0J5dGVzID0gY29tYmluZWQuc2xpY2UobGFzdE5ld2xpbmUgKyAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjYWNoZS5wZW5kaW5nQnl0ZXMgPSBjb21iaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYWNoZS5jb25zdW1lZEJ5dGVzID0gc2l6ZTtcblx0XHRcdFx0dGhpcy5fY2FwUmVjb3Jkc0luTWVtb3J5KGNhY2hlLnJlY29yZHMpO1xuXHRcdFx0XHRyZXR1cm4gY2FjaGUucmVjb3Jkcztcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBGYWxsIHRocm91Z2ggdG8gYSBmdWxsIHJlYWQgKGUuZy4gdHJhbnNpZW50IGVycm9yIC8gb2Zmc2V0IG1vdmVkKS5cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGdWxsIChyZSlyZWFkOiBmaXJzdCB2aWV3LCBkaWZmZXJlbnQgc2Vzc2lvbiwgZmlsZSBzaHJhbmssIG9yIHRhaWwgcmVhZCBmYWlsZWQuXG5cdFx0bGV0IGJ1ZmZlcjogVlNCdWZmZXI7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShldmVudHNVcmkpO1xuXHRcdFx0YnVmZmVyID0gY29udGVudC52YWx1ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xpdmVSZWFkID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0TmV3bGluZSA9IGxhc3RJbmRleE9mTmV3bGluZShidWZmZXIpO1xuXHRcdGNvbnN0IHJlY29yZHM6IElBZ2VudEhvc3RFdmVudFJlY29yZFtdID0gW107XG5cdFx0aWYgKGxhc3ROZXdsaW5lID49IDApIHtcblx0XHRcdGFwcGVuZEpzb25sUmVjb3JkcyhidWZmZXIuc2xpY2UoMCwgbGFzdE5ld2xpbmUgKyAxKS50b1N0cmluZygpLCByZWNvcmRzKTtcblx0XHR9XG5cdFx0dGhpcy5fY2FwUmVjb3Jkc0luTWVtb3J5KHJlY29yZHMpO1xuXHRcdHRoaXMuX2xpdmVSZWFkID0ge1xuXHRcdFx0a2V5LFxuXHRcdFx0Y29uc3VtZWRCeXRlczogYnVmZmVyLmJ5dGVMZW5ndGgsXG5cdFx0XHRwZW5kaW5nQnl0ZXM6IGxhc3ROZXdsaW5lID49IDAgPyBidWZmZXIuc2xpY2UobGFzdE5ld2xpbmUgKyAxKSA6IGJ1ZmZlcixcblx0XHRcdHJlY29yZHMsXG5cdFx0fTtcblx0XHRyZXR1cm4gcmVjb3Jkcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2NvdmVyTG9jYWxTZXNzaW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgdXJpOiBVUkk7IHRpdGxlPzogc3RyaW5nIH1bXT4ge1xuXHRcdGNvbnN0IHVzZXJIb21lID0gdGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGVEaXIgPSBidWlsZExvY2FsU2Vzc2lvblN0YXRlVXJpKHVzZXJIb21lKTtcblxuXHRcdGxldCBzdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShzZXNzaW9uU3RhdGVEaXIsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdOyAvLyBubyBsb2NhbCBDb3BpbG90IENMSSBzZXNzaW9ucyBvbiBkaXNrXG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlcnMgPSAoc3RhdC5jaGlsZHJlbiA/PyBbXSlcblx0XHRcdC5maWx0ZXIoY2hpbGQgPT4gY2hpbGQuaXNEaXJlY3RvcnkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYi5tdGltZSAtIGEubXRpbWUpXG5cdFx0XHQuc2xpY2UoMCwgTUFYX0RJU0NPVkVSRURfU0VTU0lPTlMpO1xuXG5cdFx0Y29uc3QgZm91bmQgPSBhd2FpdCBQcm9taXNlLmFsbChmb2xkZXJzLm1hcChhc3luYyBmb2xkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRzVXJpID0gam9pblBhdGgoZm9sZGVyLnJlc291cmNlLCAnZXZlbnRzLmpzb25sJyk7XG5cdFx0XHRsZXQgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhlYWQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShldmVudHNVcmksIHsgbGVuZ3RoOiBUSVRMRV9SRUFEX0JZVEVTIH0pO1xuXHRcdFx0XHR0aXRsZSA9IGV4dHJhY3RTZXNzaW9uVGl0bGUoaGVhZC52YWx1ZS50b1N0cmluZygpKSA/PyBmYWxsYmFja1Nlc3Npb25UaXRsZShmb2xkZXIubmFtZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZm9sZGVyIHdpdGhvdXQgYSByZWFkYWJsZSBldmVudHMuanNvbmxcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSwgcGF0aDogYC8ke2ZvbGRlci5uYW1lfWAgfSksIHRpdGxlIH07XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBmb3VuZC5maWx0ZXIoKHMpOiBzIGlzIE5vbk51bGxhYmxlPHR5cGVvZiBzPiA9PiBzICE9PSB1bmRlZmluZWQpO1xuXHR9XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBwYXJzZWQgYGV2ZW50cy5qc29ubGAgcmVjb3JkIHN0cmVhbSBpbnRvIGRlYnVnLXBhbmVsIGV2ZW50cyBwbHVzXG4gKiB0aGVpciBleHBhbmRlZCBkZXRhaWwuIFB1cmUgKG5vIHNlcnZpY2VzKSBzbyBpdCBjYW4gYmUgdW5pdC10ZXN0ZWQgZGlyZWN0bHkuXG4gKlxuICogVGhlIHJlY29yZCBgcGFyZW50SWRgIGlzICoqbm90KiogYSBsb2dpY2FsIHBhcmVudDogdGhlIENvcGlsb3QgU0RLIGRvY3VtZW50c1xuICogaXQgYXMgXCJ0aGUgY2hyb25vbG9naWNhbGx5IHByZWNlZGluZyBldmVudCBpbiB0aGUgc2Vzc2lvbiwgZm9ybWluZyBhIGxpbmtlZFxuICogY2hhaW5cIiBcdTIwMTQgYSBmbGF0IGJhY2stcG9pbnRlciBvdmVyIGV2ZXJ5IGV2ZW50LCBub3QgdGhlIHVzZXIgXHUyMTkyIG1vZGVsLXR1cm4gXHUyMTkyXG4gKiB0b29sLWNhbGwgaGllcmFyY2h5IHRoZSBwYW5lbCdzIGZsb3cgY2hhcnQgbmVlZHMuIFNvIHdlIHJlY29uc3RydWN0IHRoYXRcbiAqIGhpZXJhcmNoeSBmcm9tIGVhY2ggcmVjb3JkJ3MgbG9naWNhbCBjb250ZXh0IGFzIHdlIGl0ZXJhdGUgY2hyb25vbG9naWNhbGx5OlxuICogICAtIGBzZXNzaW9uLnN0YXJ0YCBpcyB0aGUgdHJlZSByb290LlxuICogICAtIGEgYHVzZXIubWVzc2FnZWAgaGFuZ3Mgb2ZmIHRoZSBzZXNzaW9uIHJvb3QuXG4gKiAgIC0gYW4gYGFzc2lzdGFudC5tZXNzYWdlYCBoYW5ncyBvZmYgdGhlIGN1cnJlbnQgdXNlciBtZXNzYWdlICh0cmFja2VkIHBlclxuICogICAgIGFnZW50KSwgdW5sZXNzIGl0IGNhcnJpZXMgYSBgcGFyZW50VG9vbENhbGxJZGAgKGEgc3ViLWFnZW50IHR1cm4pLCBpblxuICogICAgIHdoaWNoIGNhc2UgaXQgaGFuZ3Mgb2ZmIHRoYXQgc3Bhd25pbmcgdG9vbCBjYWxsLlxuICogICAtIGEgYHRvb2wuZXhlY3V0aW9uX3N0YXJ0YCBoYW5ncyBvZmYgdGhlIGN1cnJlbnQgYXNzaXN0YW50IG1lc3NhZ2UgKHRyYWNrZWRcbiAqICAgICBwZXIgYWdlbnQpLCB1bmxlc3MgaXQgY2FycmllcyBhIGBwYXJlbnRUb29sQ2FsbElkYCAoYSBuZXN0ZWQgLyBzdWItYWdlbnRcbiAqICAgICB0b29sKSwgaW4gd2hpY2ggY2FzZSBpdCBoYW5ncyBvZmYgdGhhdCBwYXJlbnQgdG9vbCBjYWxsLlxuICogYHRvb2wuZXhlY3V0aW9uX3N0YXJ0YCBhbmQgYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYCByZWNvcmRzIHNoYXJlIGFcbiAqIGB0b29sQ2FsbElkYCBhbmQgYXJlIG1lcmdlZCBpbnRvIGEgc2luZ2xlIHRvb2wtY2FsbCBldmVudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRBZ2VudEhvc3RFdmVudHNUb0RlYnVnRXZlbnRzKFxuXHRyZWNvcmRzOiByZWFkb25seSBJQWdlbnRIb3N0RXZlbnRSZWNvcmRbXSxcblx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdGZhbGxiYWNrVXNhZ2VUb3RhbHM/OiBJU2Vzc2lvblVzYWdlVG90YWxzLFxuXHR1c2FnZVJlY29yZHM/OiByZWFkb25seSBJQWdlbnRIb3N0VXNhZ2VSZWNvcmRbXSxcblx0Y3VzdG9taXphdGlvbnM/OiByZWFkb25seSBDdXN0b21pemF0aW9uW10sXG4pOiB7IHJlYWRvbmx5IGV2ZW50czogSUNoYXREZWJ1Z0V2ZW50W107IHJlYWRvbmx5IHJlc29sdmVkOiBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQ+IH0ge1xuXHQvLyBQcmUtcGFzczogaW5kZXggYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYCByZWNvcmRzIGJ5IGB0b29sQ2FsbElkYCAoc28gYVxuXHQvLyBzdGFydCBjYW4gYmUgbWVyZ2VkIHdpdGggaXRzIGNvbXBsZXRpb24pIGFuZCBgYXNzaXN0YW50LnR1cm5fc3RhcnRgIHJlY29yZHNcblx0Ly8gYnkgYHR1cm5JZGAgKHNvIGEgdHVybidzIHdhbGwtY2xvY2sgZHVyYXRpb24gY2FuIGJlIG1lYXN1cmVkKS4gQWxzbyBpbmRleFxuXHQvLyBgaG9vay5lbmRgLCBgcGVybWlzc2lvbi5jb21wbGV0ZWRgLCBhbmQgYHN1YmFnZW50LmNvbXBsZXRlZGAgc28gZWFjaCBjYW4gYmVcblx0Ly8gZm9sZGVkIG9udG8gaXRzIG9wZW5pbmcgcmVjb3JkIChgaG9vay5zdGFydGAgLyBgcGVybWlzc2lvbi5yZXF1ZXN0ZWRgIC9cblx0Ly8gYHN1YmFnZW50LnN0YXJ0ZWRgKS5cblx0Y29uc3QgY29tcGxldGVCeVRvb2xDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50SG9zdEV2ZW50UmVjb3JkPigpO1xuXHRjb25zdCB0dXJuU3RhcnRCeVR1cm5JZCA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0RXZlbnRSZWNvcmQ+KCk7XG5cdGNvbnN0IGhvb2tFbmRCeUludm9jYXRpb25JZCA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0RXZlbnRSZWNvcmQ+KCk7XG5cdGNvbnN0IHBlcm1pc3Npb25Db21wbGV0ZUJ5UmVxdWVzdElkID0gbmV3IE1hcDxzdHJpbmcsIElBZ2VudEhvc3RFdmVudFJlY29yZD4oKTtcblx0Y29uc3Qgc3ViYWdlbnRDb21wbGV0ZUJ5VG9vbENhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0RXZlbnRSZWNvcmQ+KCk7XG5cdGZvciAoY29uc3QgcmVjb3JkIG9mIHJlY29yZHMpIHtcblx0XHRpZiAocmVjb3JkLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScpIHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdGNvbXBsZXRlQnlUb29sQ2FsbElkLnNldCh0b29sQ2FsbElkLCByZWNvcmQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVjb3JkLnR5cGUgPT09ICdhc3Npc3RhbnQudHVybl9zdGFydCcpIHtcblx0XHRcdGNvbnN0IHR1cm5JZCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnR1cm5JZCk7XG5cdFx0XHRpZiAodHVybklkKSB7XG5cdFx0XHRcdHR1cm5TdGFydEJ5VHVybklkLnNldCh0dXJuSWQsIHJlY29yZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZWNvcmQudHlwZSA9PT0gJ2hvb2suZW5kJykge1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbklkID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuaG9va0ludm9jYXRpb25JZCk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbklkKSB7XG5cdFx0XHRcdGhvb2tFbmRCeUludm9jYXRpb25JZC5zZXQoaW52b2NhdGlvbklkLCByZWNvcmQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVjb3JkLnR5cGUgPT09ICdwZXJtaXNzaW9uLmNvbXBsZXRlZCcpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnJlcXVlc3RJZCk7XG5cdFx0XHRpZiAocmVxdWVzdElkKSB7XG5cdFx0XHRcdHBlcm1pc3Npb25Db21wbGV0ZUJ5UmVxdWVzdElkLnNldChyZXF1ZXN0SWQsIHJlY29yZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChyZWNvcmQudHlwZSA9PT0gJ3N1YmFnZW50LmNvbXBsZXRlZCcpIHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGlmICh0b29sQ2FsbElkKSB7XG5cdFx0XHRcdHN1YmFnZW50Q29tcGxldGVCeVRvb2xDYWxsSWQuc2V0KHRvb2xDYWxsSWQsIHJlY29yZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRjb25zdCByZXNvbHZlZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQ+KCk7XG5cdC8vIFBvc2l0aW9ucyBvZiBlbWl0dGVkIG1vZGVsLXR1cm4gZXZlbnRzLCBzbyBwZXItcm91bmQgdXNhZ2UgZnJvbSB0aGUgc2lkZWNhclxuXHQvLyAocHJlZmVycmVkKSBvciBzZXNzaW9uLWN1bXVsYXRpdmUgdXNhZ2UgZnJvbSBgc2Vzc2lvbi5zaHV0ZG93bmAgY2FuIGJlXG5cdC8vIGJhY2stZmlsbGVkIG9udG8gdGhlbSAoc2VlIGJlbG93KS5cblx0Y29uc3QgbW9kZWxUdXJuUmVmczogSU1vZGVsVHVyblJlZltdID0gW107XG5cblx0Ly8gTG9naWNhbC10cmVlIGNvbnRleHQuIFRoZSBcImN1cnJlbnQgbWVzc2FnZVwiIHBvaW50ZXJzIGFyZSB0cmFja2VkIHBlciBhZ2VudFxuXHQvLyAoa2V5ZWQgYnkgYGFnZW50SWRgLCBgJydgIGZvciB0aGUgbWFpbiBhZ2VudCkgc28gYSBzdWItYWdlbnQgdHVybiBuZXZlclxuXHQvLyByZS1wYXJlbnRzIGEgbWFpbi1hZ2VudCB0b29sIGNhbGwsIGFuZCB2aWNlIHZlcnNhLlxuXHRsZXQgcm9vdEV2ZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHJvb3RDcmVhdGVkOiBEYXRlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBjdXJyZW50VXNlck1lc3NhZ2VCeUFnZW50ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgY3VycmVudEFzc2lzdGFudE1lc3NhZ2VCeUFnZW50ID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Ly8gTWFwcyBhIGB0b29sQ2FsbElkYCB0byB0aGUgaWQgb2YgaXRzIGVtaXR0ZWQgdG9vbC1jYWxsIGV2ZW50LCBzbyBhIG5lc3RlZFxuXHQvLyB0b29sJ3MgYHBhcmVudFRvb2xDYWxsSWRgIGNhbiBiZSByZXNvbHZlZCB0byBhIHN1cmZhY2VkIHBhcmVudC5cblx0Y29uc3QgdG9vbEV2ZW50QnlUb29sQ2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHQvLyBXaGV0aGVyIHRoZSBzZXNzaW9uIGhhcyBhdCBsZWFzdCBvbmUgZW5hYmxlZCBob29rIGN1c3RvbWl6YXRpb24uIFRoZSBDTElcblx0Ly8gZW1pdHMgYHByZVRvb2xVc2VgIC8gYHBvc3RUb29sVXNlYCBsaWZlY3ljbGUgYGhvb2suc3RhcnRgIHJlY29yZHMgb24gKmV2ZXJ5KlxuXHQvLyB0b29sIGNhbGwgcmVnYXJkbGVzcyBvZiB1c2VyIGNvbmZpZ3VyYXRpb24gKFZTIENvZGUgaXRzZWxmIHVzZXMgdGhlXG5cdC8vIGBwcmVUb29sVXNlYCBkaXNwYXRjaCBmb3IgdG9vbC1wZXJtaXNzaW9uIGdhdGluZyksIGFuZCBhIHJvdXRpbmUgc3VjY2Vzc2Z1bFxuXHQvLyBydW4gaXMgYnl0ZS1pZGVudGljYWwgdG8gdGhlIGludGVybmFsIGRpc3BhdGNoLiBXZSB0aGVyZWZvcmUgb25seSBzdXJmYWNlXG5cdC8vIHRvb2wgaG9va3Mgd2hlbiB0aGUgdXNlciBhY3R1YWxseSBjb25maWd1cmVkIG9uZSBcdTIwMTQgc28gdGhlIGRlYnVnIHZpZXcgY2FuXG5cdC8vIGNvbmZpcm0gaXQgcmFuLCB3aGV0aGVyIGl0IHN1Y2NlZWRlZCBvciBmYWlsZWQgXHUyMDE0IGFuZCBzdXBwcmVzcyB0aGUgcHVyZVxuXHQvLyBpbnRlcm5hbC1kaXNwYXRjaCBub2lzZSBvdGhlcndpc2UuIGBIb29rQ3VzdG9taXphdGlvbmAgZG9lcyBub3QgZXhwb3NlIHdoaWNoXG5cdC8vIGxpZmVjeWNsZSBldmVudHMgaXQgcmVnaXN0ZXJzLCBzbyB0aGlzIGdhdGUgaXMgc2Vzc2lvbi1sZXZlbC5cblx0Y29uc3QgaGFzQ29uZmlndXJlZEhvb2tzID0gISFjdXN0b21pemF0aW9uc1xuXHRcdCYmIGZsYXR0ZW5DdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9ucykuc29tZShjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuSG9vayAmJiBjLmVuYWJsZWQpO1xuXG5cdGZvciAoY29uc3QgcmVjb3JkIG9mIHJlY29yZHMpIHtcblx0XHRjb25zdCBjcmVhdGVkID0gbmV3IERhdGUocmVjb3JkLnRpbWVzdGFtcCk7XG5cdFx0Y29uc3QgYWdlbnRLZXkgPSByZWNvcmQuYWdlbnRJZCA/PyAnJztcblx0XHQvLyBQYXJlbnQgZm9yIGV2ZW50cyB0aGF0IGFubm90YXRlIHRoZSB0dXJuIGluIHByb2dyZXNzIChlcnJvcnMsIHdhcm5pbmdzLFxuXHRcdC8vIHBlcm1pc3Npb25zLCBob29rcywgXHUyMDI2KTogdGhlIGN1cnJlbnQgYXNzaXN0YW50IG1lc3NhZ2UsIGVsc2UgdGhlIGN1cnJlbnRcblx0XHQvLyB1c2VyIG1lc3NhZ2UsIGVsc2UgdGhlIHNlc3Npb24gcm9vdC5cblx0XHRjb25zdCB0dXJuUGFyZW50ID0gY3VycmVudEFzc2lzdGFudE1lc3NhZ2VCeUFnZW50LmdldChhZ2VudEtleSkgPz8gY3VycmVudFVzZXJNZXNzYWdlQnlBZ2VudC5nZXQoYWdlbnRLZXkpID8/IHJvb3RFdmVudElkO1xuXG5cdFx0c3dpdGNoIChyZWNvcmQudHlwZSkge1xuXHRcdFx0Y2FzZSAnc2Vzc2lvbi5zdGFydCc6IHtcblx0XHRcdFx0cm9vdEV2ZW50SWQgPSByZWNvcmQuaWQ7XG5cdFx0XHRcdHJvb3RDcmVhdGVkID0gY3JlYXRlZDtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5zZWxlY3RlZE1vZGVsKTtcblx0XHRcdFx0Y29uc3QgZWZmb3J0ID0gYXNTdHJpbmcocmVjb3JkLmRhdGEucmVhc29uaW5nRWZmb3J0KTtcblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLmNvcGlsb3RWZXJzaW9uKTtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGFzUmVjb3JkKHJlY29yZC5kYXRhLmNvbnRleHQpO1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gYXNTdHJpbmcoY29udGV4dD8ucmVwb3NpdG9yeSk7XG5cdFx0XHRcdGNvbnN0IGJyYW5jaCA9IGFzU3RyaW5nKGNvbnRleHQ/LmJyYW5jaCk7XG5cdFx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGVmZm9ydFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnNlc3Npb25TdGFydGVkRGV0YWlscycsIFwibW9kZWw9ezB9LCByZWFzb25pbmdFZmZvcnQ9ezF9XCIsIG1vZGVsLCBlZmZvcnQpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuc2Vzc2lvblN0YXJ0ZWRNb2RlbCcsIFwibW9kZWw9ezB9XCIsIG1vZGVsKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZlcnNpb24pIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuc2Vzc2lvbkNsaVZlcnNpb24nLCBcIkNMSSB7MH1cIiwgdmVyc2lvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChicmFuY2hcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5zZXNzaW9uUmVwb0JyYW5jaCcsIFwiezB9QHsxfVwiLCByZXBvc2l0b3J5LCBicmFuY2gpXG5cdFx0XHRcdFx0XHQ6IHJlcG9zaXRvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuc2Vzc2lvblN0YXJ0ZWQnLCBcIlNlc3Npb24gU3RhcnRlZFwiKSxcblx0XHRcdFx0XHRkZXRhaWxzOiBwYXJ0cy5sZW5ndGggPyBwYXJ0cy5qb2luKCcsICcpIDogdW5kZWZpbmVkLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbywgY2F0ZWdvcnk6ICdzZXNzaW9uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndXNlci5tZXNzYWdlJzoge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuY29udGVudCkgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkID0gYXNTdHJpbmcocmVjb3JkLmRhdGEudHJhbnNmb3JtZWRDb250ZW50KTtcblx0XHRcdFx0Y29uc3Qgc2VjdGlvbnM6IElDaGF0RGVidWdNZXNzYWdlU2VjdGlvbltdID0gW1xuXHRcdFx0XHRcdHsgbmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy51c2VyUmVxdWVzdCcsIFwiVXNlciBSZXF1ZXN0XCIpLCBjb250ZW50IH0sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGlmICh0cmFuc2Zvcm1lZCAmJiB0cmFuc2Zvcm1lZCAhPT0gY29udGVudCkge1xuXHRcdFx0XHRcdHNlY3Rpb25zLnB1c2goeyBuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmZ1bGxQcm9tcHQnLCBcIkZ1bGwgUHJvbXB0XCIpLCBjb250ZW50OiB0cmFuc2Zvcm1lZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gc3VtbWFyaXplKGNvbnRlbnQpO1xuXHRcdFx0XHRjdXJyZW50VXNlck1lc3NhZ2VCeUFnZW50LnNldChhZ2VudEtleSwgcmVjb3JkLmlkKTtcblx0XHRcdFx0Y3VycmVudEFzc2lzdGFudE1lc3NhZ2VCeUFnZW50LmRlbGV0ZShhZ2VudEtleSk7IC8vIGEgbmV3IHVzZXIgdHVybiBzdGFydHMgZnJlc2hcblx0XHRcdFx0ZXZlbnRzLnB1c2goeyBraW5kOiAndXNlck1lc3NhZ2UnLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQ6IHJvb3RFdmVudElkLCBtZXNzYWdlLCBzZWN0aW9ucyB9KTtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAnbWVzc2FnZScsIHR5cGU6ICd1c2VyJywgbWVzc2FnZSwgc2VjdGlvbnMgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYXNzaXN0YW50Lm1lc3NhZ2UnOiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gYXNTdHJpbmcocmVjb3JkLmRhdGEubW9kZWwpO1xuXHRcdFx0XHRjb25zdCBvdXRwdXRUb2tlbnMgPSBhc051bWJlcihyZWNvcmQuZGF0YS5vdXRwdXRUb2tlbnMpO1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuY29udGVudCkgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHJlYXNvbmluZyA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnJlYXNvbmluZ1RleHQpO1xuXHRcdFx0XHQvLyBBIHN1Yi1hZ2VudCB0dXJuIG5lc3RzIHVuZGVyIGl0cyBzcGF3bmluZyB0b29sIGNhbGw7IGEgbm9ybWFsIHR1cm5cblx0XHRcdFx0Ly8gbmVzdHMgdW5kZXIgdGhlIHVzZXIgbWVzc2FnZSBpdCBhbnN3ZXJzLlxuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gYXNTdHJpbmcocmVjb3JkLmRhdGEucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdGNvbnN0IHNwYXduaW5nVG9vbCA9IHBhcmVudFRvb2xDYWxsSWQgPyB0b29sRXZlbnRCeVRvb2xDYWxsSWQuZ2V0KHBhcmVudFRvb2xDYWxsSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRFdmVudElkID0gc3Bhd25pbmdUb29sID8/IGN1cnJlbnRVc2VyTWVzc2FnZUJ5QWdlbnQuZ2V0KGFnZW50S2V5KSA/PyByb290RXZlbnRJZDtcblx0XHRcdFx0Ly8gVGhlIHR1cm4ncyB3YWxsLWNsb2NrIGR1cmF0aW9uIGlzIHRoZSBnYXAgZnJvbSBpdHMgYGFzc2lzdGFudC50dXJuX3N0YXJ0YC5cblx0XHRcdFx0Y29uc3QgdHVybklkID0gYXNTdHJpbmcocmVjb3JkLmRhdGEudHVybklkKTtcblx0XHRcdFx0Y29uc3QgdHVyblN0YXJ0ID0gdHVybklkID8gdHVyblN0YXJ0QnlUdXJuSWQuZ2V0KHR1cm5JZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uSW5NaWxsaXMgPSB0dXJuU3RhcnQgPyBkaWZmTWlsbGlzKHR1cm5TdGFydC50aW1lc3RhbXAsIHJlY29yZC50aW1lc3RhbXApIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGN1cnJlbnRBc3Npc3RhbnRNZXNzYWdlQnlBZ2VudC5zZXQoYWdlbnRLZXksIHJlY29yZC5pZCk7XG5cdFx0XHRcdG1vZGVsVHVyblJlZnMucHVzaCh7IGluZGV4OiBldmVudHMubGVuZ3RoLCBpZDogcmVjb3JkLmlkLCB0dXJuSWQsIG91dHB1dFRva2VucyB9KTtcblx0XHRcdFx0ZXZlbnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdtb2RlbFR1cm4nLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQsXG5cdFx0XHRcdFx0bW9kZWwsIHJlcXVlc3ROYW1lOiAnY29waWxvdGNsaScsIG91dHB1dFRva2VucywgZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3Qgc2VjdGlvbnM6IElDaGF0RGVidWdNZXNzYWdlU2VjdGlvbltdID0gW107XG5cdFx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdFx0c2VjdGlvbnMucHVzaCh7IG5hbWU6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucmVzcG9uc2UnLCBcIlJlc3BvbnNlXCIpLCBjb250ZW50IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZWFzb25pbmcpIHtcblx0XHRcdFx0XHRzZWN0aW9ucy5wdXNoKHsgbmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5yZWFzb25pbmcnLCBcIlJlYXNvbmluZ1wiKSwgY29udGVudDogcmVhc29uaW5nIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmVkLnNldChyZWNvcmQuaWQsIHsga2luZDogJ21vZGVsVHVybicsIHJlcXVlc3ROYW1lOiAnY29waWxvdGNsaScsIG1vZGVsLCBvdXRwdXRUb2tlbnMsIGR1cmF0aW9uSW5NaWxsaXMsIHNlY3Rpb25zIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jzoge1xuXHRcdFx0XHRjb25zdCB0b29sTmFtZSA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnRvb2xOYW1lKSA/PyAndG9vbCc7XG5cdFx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0Y29uc3QgY29tcGxldGUgPSB0b29sQ2FsbElkID8gY29tcGxldGVCeVRvb2xDYWxsSWQuZ2V0KHRvb2xDYWxsSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gY29tcGxldGUgPyBhc0Jvb2xlYW4oY29tcGxldGUuZGF0YS5zdWNjZXNzKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gc3VjY2VzcyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogKHN1Y2Nlc3MgPyAnc3VjY2VzcycgOiAnZXJyb3InKTtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb25Jbk1pbGxpcyA9IGNvbXBsZXRlID8gZGlmZk1pbGxpcyhyZWNvcmQudGltZXN0YW1wLCBjb21wbGV0ZS50aW1lc3RhbXApIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBmdWxsSW5wdXQgPSBzdHJpbmdpZnlQYXlsb2FkKHJlY29yZC5kYXRhLmFyZ3VtZW50cyk7XG5cdFx0XHRcdGNvbnN0IGZ1bGxPdXRwdXQgPSBjb21wbGV0ZSA/IHN0cmluZ2lmeVBheWxvYWQoY29tcGxldGUuZGF0YS5yZXN1bHQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBBIG5lc3RlZCAvIHN1Yi1hZ2VudCB0b29sIG5lc3RzIHVuZGVyIGl0cyBwYXJlbnQgdG9vbCBjYWxsOyBhXG5cdFx0XHRcdC8vIHRvcC1sZXZlbCB0b29sIG5lc3RzIHVuZGVyIHRoZSBhc3Npc3RhbnQgbWVzc2FnZSB0aGF0IHJlcXVlc3RlZCBpdC5cblx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sID0gcGFyZW50VG9vbENhbGxJZCA/IHRvb2xFdmVudEJ5VG9vbENhbGxJZC5nZXQocGFyZW50VG9vbENhbGxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHBhcmVudEV2ZW50SWQgPSBwYXJlbnRUb29sID8/IGN1cnJlbnRBc3Npc3RhbnRNZXNzYWdlQnlBZ2VudC5nZXQoYWdlbnRLZXkpID8/IGN1cnJlbnRVc2VyTWVzc2FnZUJ5QWdlbnQuZ2V0KGFnZW50S2V5KSA/PyByb290RXZlbnRJZDtcblx0XHRcdFx0aWYgKHRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHR0b29sRXZlbnRCeVRvb2xDYWxsSWQuc2V0KHRvb2xDYWxsSWQsIHJlY29yZC5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xDYWxsJywgaWQ6IHJlY29yZC5pZCwgc2Vzc2lvblJlc291cmNlLCBjcmVhdGVkLCBwYXJlbnRFdmVudElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lLCB0b29sQ2FsbElkLCByZXN1bHQsIGR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IHRydW5jYXRlKGZ1bGxJbnB1dCwgTUFYX0VWRU5UX1BBWUxPQUQpLFxuXHRcdFx0XHRcdG91dHB1dDogdHJ1bmNhdGUoZnVsbE91dHB1dCwgTUFYX0VWRU5UX1BBWUxPQUQpLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwge1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sQ2FsbCcsIHRvb2xOYW1lLCByZXN1bHQsIGR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IHRydW5jYXRlKGZ1bGxJbnB1dCwgTUFYX0RFVEFJTF9QQVlMT0FEKSxcblx0XHRcdFx0XHRvdXRwdXQ6IHRydW5jYXRlKGZ1bGxPdXRwdXQsIE1BWF9ERVRBSUxfUEFZTE9BRCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdC8vIGB0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZWAgaXMgZm9sZGVkIGludG8gaXRzIHN0YXJ0IHJlY29yZCBhYm92ZS5cblx0XHRcdGNhc2UgJ3Nlc3Npb24uZXJyb3InOiB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5tZXNzYWdlKSA/PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnVua25vd25FcnJvcicsIFwiVW5rbm93biBlcnJvclwiKTtcblx0XHRcdFx0Y29uc3QgZXJyb3JUeXBlID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuZXJyb3JUeXBlKTtcblx0XHRcdFx0Y29uc3Qgc3RhY2sgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5zdGFjayk7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZDogdHVyblBhcmVudCxcblx0XHRcdFx0XHRuYW1lOiBlcnJvclR5cGVcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5zZXNzaW9uRXJyb3JUeXBlZCcsIFwiRXJyb3IgKHswfSlcIiwgZXJyb3JUeXBlKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnNlc3Npb25FcnJvcicsIFwiRXJyb3JcIiksXG5cdFx0XHRcdFx0ZGV0YWlsczogdHJ1bmNhdGUobWVzc2FnZSwgTUFYX0VWRU5UX1BBWUxPQUQpLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5FcnJvciwgY2F0ZWdvcnk6ICdzZXNzaW9uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGRldGFpbFRleHQgPSBzdGFjayA/IGAke21lc3NhZ2V9XFxuXFxuJHtzdGFja31gIDogbWVzc2FnZTtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAndGV4dCcsIHZhbHVlOiB0cnVuY2F0ZShkZXRhaWxUZXh0LCBNQVhfREVUQUlMX1BBWUxPQUQpID8/IGRldGFpbFRleHQgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2Vzc2lvbi53YXJuaW5nJzoge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gYXNTdHJpbmcocmVjb3JkLmRhdGEubWVzc2FnZSkgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IHdhcm5pbmdUeXBlID0gYXNTdHJpbmcocmVjb3JkLmRhdGEud2FybmluZ1R5cGUpO1xuXHRcdFx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQ6IHR1cm5QYXJlbnQsXG5cdFx0XHRcdFx0bmFtZTogd2FybmluZ1R5cGVcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5zZXNzaW9uV2FybmluZ1R5cGVkJywgXCJXYXJuaW5nICh7MH0pXCIsIHdhcm5pbmdUeXBlKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnNlc3Npb25XYXJuaW5nJywgXCJXYXJuaW5nXCIpLFxuXHRcdFx0XHRcdGRldGFpbHM6IHRydW5jYXRlKG1lc3NhZ2UsIE1BWF9FVkVOVF9QQVlMT0FEKSxcblx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuV2FybmluZywgY2F0ZWdvcnk6ICdzZXNzaW9uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAndGV4dCcsIHZhbHVlOiB0cnVuY2F0ZShtZXNzYWdlLCBNQVhfREVUQUlMX1BBWUxPQUQpID8/IG1lc3NhZ2UgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzZXNzaW9uLm1vZGVsX2NoYW5nZSc6IHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNNb2RlbCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnByZXZpb3VzTW9kZWwpO1xuXHRcdFx0XHRjb25zdCBuZXdNb2RlbCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLm5ld01vZGVsKTtcblx0XHRcdFx0Y29uc3QgZWZmb3J0ID0gYXNTdHJpbmcocmVjb3JkLmRhdGEucmVhc29uaW5nRWZmb3J0KTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlID0gcHJldmlvdXNNb2RlbCAmJiBuZXdNb2RlbFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5tb2RlbENoYW5nZUZyb21UbycsIFwiezB9IFx1MjE5MiB7MX1cIiwgcHJldmlvdXNNb2RlbCwgbmV3TW9kZWwpXG5cdFx0XHRcdFx0OiBuZXdNb2RlbDtcblx0XHRcdFx0Y29uc3QgZGV0YWlscyA9IGNoYW5nZSAmJiBlZmZvcnRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcubW9kZWxDaGFuZ2VFZmZvcnQnLCBcInswfSAocmVhc29uaW5nRWZmb3J0PXsxfSlcIiwgY2hhbmdlLCBlZmZvcnQpXG5cdFx0XHRcdFx0OiBjaGFuZ2U7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZDogdHVyblBhcmVudCxcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLm1vZGVsQ2hhbmdlZCcsIFwiTW9kZWwgQ2hhbmdlZFwiKSxcblx0XHRcdFx0XHRkZXRhaWxzLCBsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbywgY2F0ZWdvcnk6ICdzZXNzaW9uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaG9vay5zdGFydCc6IHtcblx0XHRcdFx0Y29uc3QgaG9va1R5cGUgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5ob29rVHlwZSkgPz8gJ2hvb2snO1xuXHRcdFx0XHRjb25zdCBpbnZvY2F0aW9uSWQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5ob29rSW52b2NhdGlvbklkKTtcblx0XHRcdFx0Y29uc3QgZW5kID0gaW52b2NhdGlvbklkID8gaG9va0VuZEJ5SW52b2NhdGlvbklkLmdldChpbnZvY2F0aW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gZW5kID8gYXNCb29sZWFuKGVuZC5kYXRhLnN1Y2Nlc3MpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBpc0Vycm9yID0gaG9va1R5cGUgPT09ICdlcnJvck9jY3VycmVkJztcblx0XHRcdFx0Ly8gVGhlIENMSSBlbWl0cyBgcHJlVG9vbFVzZWAgLyBgcG9zdFRvb2xVc2VgIGxpZmVjeWNsZSBob29rcyBvbiBldmVyeVxuXHRcdFx0XHQvLyB0b29sIGNhbGwgcmVnYXJkbGVzcyBvZiB1c2VyIGNvbmZpZ3VyYXRpb24uIE9ubHkgc3VyZmFjZSB0aGVtIHdoZW4gdGhlXG5cdFx0XHRcdC8vIHVzZXIgYWN0dWFsbHkgY29uZmlndXJlZCBhIGhvb2sgKHNvIHRoZSB2aWV3IGNhbiBjb25maXJtIGl0IHJhbik7IGhpZGVcblx0XHRcdFx0Ly8gdGhlIHB1cmUgaW50ZXJuYWwtZGlzcGF0Y2ggbm9pc2Ugb3RoZXJ3aXNlLlxuXHRcdFx0XHRpZiAoKGhvb2tUeXBlID09PSAncHJlVG9vbFVzZScgfHwgaG9va1R5cGUgPT09ICdwb3N0VG9vbFVzZScpICYmICFoYXNDb25maWd1cmVkSG9va3MpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBIGBwcmVUb29sVXNlYCBob29rIGZpcmVzICpiZWZvcmUqIHRoZSBgYXNzaXN0YW50Lm1lc3NhZ2VgIG9mIHRoZVxuXHRcdFx0XHQvLyB0dXJuIHdob3NlIHRvb2wgaXQgcHJlY2VkZXMgaXMgZmluYWxpemVkLCBzbyBgdHVyblBhcmVudGAgc3RpbGxcblx0XHRcdFx0Ly8gcG9pbnRzIGF0IHRoZSBQUkVWSU9VUyBtb2RlbCB0dXJuLiBOZXN0aW5nIGl0IHRoZXJlIGlzIG1pc2xlYWRpbmcgXHUyMDE0XG5cdFx0XHRcdC8vIGl0IGJlbG9uZ3MgdG8gdGhlIHVwY29taW5nIHR1cm4gXHUyMDE0IHNvIHN1cmZhY2UgaXQgYXQgdGhlXG5cdFx0XHRcdC8vIHR1cm4tY29udGFpbmVyICh1c2VyIG1lc3NhZ2UpIGxldmVsLCBhcyBhIHNpYmxpbmcgb2YgdGhlIG1vZGVsXG5cdFx0XHRcdC8vIHR1cm5zIHJhdGhlciB0aGFuIGEgY2hpbGQgb2YgdGhlIHByaW9yIG9uZS5cblx0XHRcdFx0Y29uc3QgaG9va1BhcmVudCA9IGhvb2tUeXBlID09PSAncHJlVG9vbFVzZSdcblx0XHRcdFx0XHQ/IChjdXJyZW50VXNlck1lc3NhZ2VCeUFnZW50LmdldChhZ2VudEtleSkgPz8gcm9vdEV2ZW50SWQpXG5cdFx0XHRcdFx0OiB0dXJuUGFyZW50O1xuXHRcdFx0XHQvLyBFcnJvciBub3RpZmljYXRpb25zIChgZXJyb3JPY2N1cnJlZGApIGFuZCBmYWlsZWQgaG9va3MgYXJlIHN1cmZhY2VkXG5cdFx0XHRcdC8vIHByb21pbmVudGx5IGJlbG93LiBSb3V0aW5lIGxpZmVjeWNsZSBob29rcyAoc2Vzc2lvblN0YXJ0IC8gc2Vzc2lvbkVuZFxuXHRcdFx0XHQvLyAvIHVzZXJQcm9tcHRTdWJtaXR0ZWQgLyBcdTIwMjYpIGFyZSBzdXJmYWNlZCBhcyBsb3cta2V5IGluZm9ybWF0aW9uYWxcblx0XHRcdFx0Ly8gY3VzdG9taXphdGlvbiBldmVudHMgc28gdXNlcnMgY2FuIHN0aWxsIHNlZSB3aGljaCBob29rcyBmaXJlZC5cblx0XHRcdFx0aWYgKCFpc0Vycm9yICYmIHN1Y2Nlc3MgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZXZlbnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQ6IGhvb2tQYXJlbnQsXG5cdFx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmhvb2tSYW4nLCBcIkhvb2s6IHswfVwiLCBob29rVHlwZSksXG5cdFx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbywgY2F0ZWdvcnk6ICdob29rJyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRjb25zdCByb3V0aW5lSW5wdXQgPSBzdHJpbmdpZnlQYXlsb2FkKHJlY29yZC5kYXRhLmlucHV0KTtcblx0XHRcdFx0XHRyZXNvbHZlZC5zZXQocmVjb3JkLmlkLCB7XG5cdFx0XHRcdFx0XHRraW5kOiAnaG9vaycsIGhvb2tUeXBlLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiBzdWNjZXNzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiAoc3VjY2VzcyA/IENoYXREZWJ1Z0hvb2tSZXN1bHQuU3VjY2VzcyA6IENoYXREZWJ1Z0hvb2tSZXN1bHQuRXJyb3IpLFxuXHRcdFx0XHRcdFx0aW5wdXQ6IHRydW5jYXRlKHJvdXRpbmVJbnB1dCwgTUFYX0RFVEFJTF9QQVlMT0FEKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpbnB1dCA9IGFzUmVjb3JkKHJlY29yZC5kYXRhLmlucHV0KTtcblx0XHRcdFx0Y29uc3QgZXJyb3JDb250ZXh0ID0gYXNTdHJpbmcoaW5wdXQ/LmVycm9yQ29udGV4dCk7XG5cdFx0XHRcdGNvbnN0IHJlY292ZXJhYmxlID0gYXNCb29sZWFuKGlucHV0Py5yZWNvdmVyYWJsZSk7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZDogaG9va1BhcmVudCxcblx0XHRcdFx0XHRuYW1lOiBpc0Vycm9yXG5cdFx0XHRcdFx0XHQ/IChlcnJvckNvbnRleHRcblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmhvb2tFcnJvckNvbnRleHQnLCBcIkVycm9yIER1cmluZyB7MH1cIiwgZXJyb3JDb250ZXh0KVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuaG9va0Vycm9yJywgXCJFcnJvciBPY2N1cnJlZFwiKSlcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5ob29rRmFpbGVkJywgXCJIb29rIEZhaWxlZDogezB9XCIsIGhvb2tUeXBlKSxcblx0XHRcdFx0XHRkZXRhaWxzOiBpc0Vycm9yICYmIHJlY292ZXJhYmxlICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHRcdD8gKHJlY292ZXJhYmxlXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5ob29rUmVjb3ZlcmFibGUnLCBcIlJlY292ZXJhYmxlOyByZXRyeWluZ1wiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuaG9va1VucmVjb3ZlcmFibGUnLCBcIlVucmVjb3ZlcmFibGVcIikpXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsZXZlbDogaXNFcnJvclxuXHRcdFx0XHRcdFx0PyAocmVjb3ZlcmFibGUgPT09IGZhbHNlID8gQ2hhdERlYnVnTG9nTGV2ZWwuRXJyb3IgOiBDaGF0RGVidWdMb2dMZXZlbC5XYXJuaW5nKVxuXHRcdFx0XHRcdFx0OiBDaGF0RGVidWdMb2dMZXZlbC5FcnJvcixcblx0XHRcdFx0XHRjYXRlZ29yeTogJ2hvb2snLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgaW5wdXRUZXh0ID0gc3RyaW5naWZ5UGF5bG9hZChyZWNvcmQuZGF0YS5pbnB1dCk7XG5cdFx0XHRcdC8vIE9uIGZhaWx1cmUgdGhlIGBob29rLmVuZGAgcmVjb3JkIGNhcnJpZXMgdGhlIG9ubHkgZGlzdGluZ3Vpc2hpbmcgdHJhY2Vcblx0XHRcdFx0Ly8gb2YgdGhlIHVzZXIncyBob29rOiBgb3V0cHV0YCAocGVyLXRvb2wgZGVuaWFsIG1lc3NhZ2VzKSBhbmQgYGVycm9yYFxuXHRcdFx0XHQvLyAoeyBtZXNzYWdlLCBzb3VyY2UgfSwgd2hlcmUgYHNvdXJjZWAgaXMgdGhlIGhvb2sgY29uZmlnIGZpbGUpLiBUaGUgQ0xJXG5cdFx0XHRcdC8vIG5ldmVyIHJlY29yZHMgdGhlIGhvb2sgY29tbWFuZCB0ZXh0IG9yIGl0cyBzdGRvdXQsIHNvIHRoaXMgaXMgdGhlIG1vc3Rcblx0XHRcdFx0Ly8gd2UgY2FuIHN1cmZhY2UgYWJvdXQgd2hpY2ggaG9vayBhY3RlZCBhbmQgd2h5LlxuXHRcdFx0XHRjb25zdCBlbmRFcnJvciA9IGFzUmVjb3JkKGVuZD8uZGF0YS5lcnJvcik7XG5cdFx0XHRcdGNvbnN0IGVycm9yUGFydHMgPSBlbmRFcnJvclxuXHRcdFx0XHRcdD8gW2FzU3RyaW5nKGVuZEVycm9yLm1lc3NhZ2UpLCBhc1N0cmluZyhlbmRFcnJvci5zb3VyY2UpXS5maWx0ZXIoKHMpOiBzIGlzIHN0cmluZyA9PiAhIXMpXG5cdFx0XHRcdFx0OiBbXTtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0VGV4dCA9IGVuZCAmJiBlbmQuZGF0YS5vdXRwdXQgIT09IHVuZGVmaW5lZCA/IHN0cmluZ2lmeVBheWxvYWQoZW5kLmRhdGEub3V0cHV0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwge1xuXHRcdFx0XHRcdGtpbmQ6ICdob29rJywgaG9va1R5cGUsXG5cdFx0XHRcdFx0cmVzdWx0OiBzdWNjZXNzID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiAoc3VjY2VzcyA/IENoYXREZWJ1Z0hvb2tSZXN1bHQuU3VjY2VzcyA6IENoYXREZWJ1Z0hvb2tSZXN1bHQuRXJyb3IpLFxuXHRcdFx0XHRcdGlucHV0OiB0cnVuY2F0ZShpbnB1dFRleHQsIE1BWF9ERVRBSUxfUEFZTE9BRCksXG5cdFx0XHRcdFx0b3V0cHV0OiBvdXRwdXRUZXh0ID8gdHJ1bmNhdGUob3V0cHV0VGV4dCwgTUFYX0RFVEFJTF9QQVlMT0FEKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGVycm9yUGFydHMubGVuZ3RoID4gMCA/IHRydW5jYXRlKGVycm9yUGFydHMuam9pbignXFxuJyksIE1BWF9ERVRBSUxfUEFZTE9BRCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdC8vIGBob29rLmVuZGAgaXMgZm9sZGVkIGludG8gaXRzIGBob29rLnN0YXJ0YCBhYm92ZS5cblx0XHRcdGNhc2UgJ3Blcm1pc3Npb24ucmVxdWVzdGVkJzoge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5yZXF1ZXN0SWQpO1xuXHRcdFx0XHRjb25zdCBwZXJtaXNzaW9uUmVxdWVzdCA9IGFzUmVjb3JkKHJlY29yZC5kYXRhLnBlcm1pc3Npb25SZXF1ZXN0KTtcblx0XHRcdFx0Y29uc3Qga2luZCA9IGFzU3RyaW5nKHBlcm1pc3Npb25SZXF1ZXN0Py5raW5kKSA/PyAncGVybWlzc2lvbic7XG5cdFx0XHRcdGNvbnN0IGludGVudGlvbiA9IGFzU3RyaW5nKHBlcm1pc3Npb25SZXF1ZXN0Py5pbnRlbnRpb24pO1xuXHRcdFx0XHRjb25zdCB0b29sQ2FsbElkID0gYXNTdHJpbmcocGVybWlzc2lvblJlcXVlc3Q/LnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZWQgPSByZXF1ZXN0SWQgPyBwZXJtaXNzaW9uQ29tcGxldGVCeVJlcXVlc3RJZC5nZXQocmVxdWVzdElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0S2luZCA9IGNvbXBsZXRlZCA/IGFzU3RyaW5nKGFzUmVjb3JkKGNvbXBsZXRlZC5kYXRhLnJlc3VsdCk/LmtpbmQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBBIHJvdXRpbmUgYXBwcm92YWwgaXMgaGFwcHktcGF0aCBub2lzZSAodGhlIHRvb2wgY2FsbCBpcyBhbHJlYWR5XG5cdFx0XHRcdC8vIHNob3duKTsgb25seSBzdXJmYWNlIGRlbmlhbHMgYW5kIHN0aWxsLXBlbmRpbmcgcmVxdWVzdHMsIHdoaWNoXG5cdFx0XHRcdC8vIGV4cGxhaW4gd2h5IGEgdG9vbCB3YXMgYmxvY2tlZCBvciBhIHNlc3Npb24gYXBwZWFycyBzdGFsbGVkLlxuXHRcdFx0XHRpZiAocmVzdWx0S2luZCA9PT0gJ2FwcHJvdmVkJykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBhcmVudEV2ZW50SWQgPSAodG9vbENhbGxJZCA/IHRvb2xFdmVudEJ5VG9vbENhbGxJZC5nZXQodG9vbENhbGxJZCkgOiB1bmRlZmluZWQpID8/IHR1cm5QYXJlbnQ7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZCxcblx0XHRcdFx0XHRuYW1lOiByZXN1bHRLaW5kXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucGVybWlzc2lvblJlc29sdmVkJywgXCJQZXJtaXNzaW9uIHswfTogezF9XCIsIHJlc3VsdEtpbmQsIGtpbmQpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucGVybWlzc2lvblBlbmRpbmcnLCBcIkF3YWl0aW5nIFBlcm1pc3Npb246IHswfVwiLCBraW5kKSxcblx0XHRcdFx0XHRkZXRhaWxzOiBpbnRlbnRpb24sXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLldhcm5pbmcsIGNhdGVnb3J5OiAncGVybWlzc2lvbicsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBwYXRoID0gYXNTdHJpbmcocGVybWlzc2lvblJlcXVlc3Q/LnBhdGgpO1xuXHRcdFx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnBlcm1pc3Npb25LaW5kJywgXCJraW5kOiB7MH1cIiwga2luZCksXG5cdFx0XHRcdFx0aW50ZW50aW9uID8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5wZXJtaXNzaW9uSW50ZW50aW9uJywgXCJpbnRlbnRpb246IHswfVwiLCBpbnRlbnRpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBhdGggPyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnBlcm1pc3Npb25QYXRoJywgXCJwYXRoOiB7MH1cIiwgcGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5wZXJtaXNzaW9uUmVzdWx0JywgXCJyZXN1bHQ6IHswfVwiLCByZXN1bHRLaW5kID8/IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucGVybWlzc2lvblBlbmRpbmdWYWx1ZScsIFwicGVuZGluZ1wiKSksXG5cdFx0XHRcdF0uZmlsdGVyKChsKTogbCBpcyBzdHJpbmcgPT4gISFsKTtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsaW5lcy5qb2luKCdcXG4nKSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHQvLyBgcGVybWlzc2lvbi5jb21wbGV0ZWRgIGlzIGZvbGRlZCBpbnRvIGl0cyBgcGVybWlzc2lvbi5yZXF1ZXN0ZWRgIGFib3ZlLlxuXHRcdFx0Y2FzZSAnc3ViYWdlbnQuc3RhcnRlZCc6IHtcblx0XHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBhZ2VudE5hbWUgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5hZ2VudERpc3BsYXlOYW1lKSA/PyBhc1N0cmluZyhyZWNvcmQuZGF0YS5hZ2VudE5hbWUpID8/ICdzdWJhZ2VudCc7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuYWdlbnREZXNjcmlwdGlvbik7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gYXNTdHJpbmcocmVjb3JkLmRhdGEubW9kZWwpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZSA9IHRvb2xDYWxsSWQgPyBzdWJhZ2VudENvbXBsZXRlQnlUb29sQ2FsbElkLmdldCh0b29sQ2FsbElkKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgdG9vbENhbGxDb3VudCA9IGNvbXBsZXRlID8gYXNOdW1iZXIoY29tcGxldGUuZGF0YS50b3RhbFRvb2xDYWxscykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gY29tcGxldGUgPyBhc051bWJlcihjb21wbGV0ZS5kYXRhLnRvdGFsVG9rZW5zKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZHVyYXRpb25Jbk1pbGxpcyA9IGNvbXBsZXRlID8gYXNOdW1iZXIoY29tcGxldGUuZGF0YS5kdXJhdGlvbk1zKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gVGhlIHN1Yi1hZ2VudCBuZXN0cyB1bmRlciB0aGUgdG9vbCBjYWxsIHRoYXQgc3Bhd25lZCBpdC5cblx0XHRcdFx0Y29uc3QgcGFyZW50RXZlbnRJZCA9ICh0b29sQ2FsbElkID8gdG9vbEV2ZW50QnlUb29sQ2FsbElkLmdldCh0b29sQ2FsbElkKSA6IHVuZGVmaW5lZCkgPz8gdHVyblBhcmVudDtcblx0XHRcdFx0ZXZlbnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudEludm9jYXRpb24nLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQsXG5cdFx0XHRcdFx0YWdlbnROYW1lLCBkZXNjcmlwdGlvbiwgc3RhdHVzOiBjb21wbGV0ZSA/ICdjb21wbGV0ZWQnIDogJ3J1bm5pbmcnLCB0b29sQ2FsbENvdW50LCBkdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5zdWJhZ2VudE5hbWUnLCBcImFnZW50OiB7MH1cIiwgYWdlbnROYW1lKSxcblx0XHRcdFx0XHRtb2RlbCA/IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuc3ViYWdlbnRNb2RlbCcsIFwibW9kZWw6IHswfVwiLCBtb2RlbCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dG9vbENhbGxDb3VudCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5zdWJhZ2VudFRvb2xDYWxscycsIFwidG9vbCBjYWxsczogezB9XCIsIHRvb2xDYWxsQ291bnQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRvdGFsVG9rZW5zICE9PSB1bmRlZmluZWQgPyBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnN1YmFnZW50VG9rZW5zJywgXCJ0b2tlbnM6IHswfVwiLCB0b3RhbFRva2VucykgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24gPyBgXFxuJHtkZXNjcmlwdGlvbn1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRdLmZpbHRlcigobCk6IGwgaXMgc3RyaW5nID0+ICEhbCk7XG5cdFx0XHRcdHJlc29sdmVkLnNldChyZWNvcmQuaWQsIHsga2luZDogJ3RleHQnLCB2YWx1ZTogbGluZXMuam9pbignXFxuJykgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gYHN1YmFnZW50LmNvbXBsZXRlZGAgaXMgZm9sZGVkIGludG8gaXRzIGBzdWJhZ2VudC5zdGFydGVkYCBhYm92ZS5cblx0XHRcdGNhc2UgJ3Nlc3Npb24uY29tcGFjdGlvbl9zdGFydCc6IHtcblx0XHRcdFx0Y29uc3Qgc3lzdGVtVG9rZW5zID0gYXNOdW1iZXIocmVjb3JkLmRhdGEuc3lzdGVtVG9rZW5zKSA/PyAwO1xuXHRcdFx0XHRjb25zdCBjb252ZXJzYXRpb25Ub2tlbnMgPSBhc051bWJlcihyZWNvcmQuZGF0YS5jb252ZXJzYXRpb25Ub2tlbnMpID8/IDA7XG5cdFx0XHRcdGNvbnN0IHRvb2xUb2tlbnMgPSBhc051bWJlcihyZWNvcmQuZGF0YS50b29sRGVmaW5pdGlvbnNUb2tlbnMpID8/IDA7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkOiByZWNvcmQuaWQsIHNlc3Npb25SZXNvdXJjZSwgY3JlYXRlZCwgcGFyZW50RXZlbnRJZDogdHVyblBhcmVudCxcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmNvbXBhY3Rpb24nLCBcIkNvbnRleHQgQ29tcGFjdGlvblwiKSxcblx0XHRcdFx0XHRkZXRhaWxzOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmNvbXBhY3Rpb25Ub2tlbnMnLCBcInN5c3RlbT17MH0sIGNvbnZlcnNhdGlvbj17MX0sIHRvb2xzPXsyfSB0b2tlbnNcIiwgc3lzdGVtVG9rZW5zLCBjb252ZXJzYXRpb25Ub2tlbnMsIHRvb2xUb2tlbnMpLFxuXHRcdFx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLCBjYXRlZ29yeTogJ3Nlc3Npb24nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzZXNzaW9uLmNvbXBhY3Rpb25fY29tcGxldGUnOiB7XG5cdFx0XHRcdC8vIEEgc3VjY2Vzc2Z1bCBjb21wYWN0aW9uIGlzIGltcGxpZWQgYnkgaXRzIHN0YXJ0IHJvdzsgb25seSB0aGVcblx0XHRcdFx0Ly8gZmFpbHVyZSBjYXNlIGlzIGRpYWdub3N0aWNhbGx5IGludGVyZXN0aW5nLlxuXHRcdFx0XHRpZiAoYXNCb29sZWFuKHJlY29yZC5kYXRhLnN1Y2Nlc3MpICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuZXJyb3IpO1xuXHRcdFx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQ6IHR1cm5QYXJlbnQsXG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5jb21wYWN0aW9uRmFpbGVkJywgXCJDb250ZXh0IENvbXBhY3Rpb24gRmFpbGVkXCIpLFxuXHRcdFx0XHRcdGRldGFpbHM6IHRydW5jYXRlKGVycm9yLCBNQVhfRVZFTlRfUEFZTE9BRCksXG5cdFx0XHRcdFx0bGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLkVycm9yLCBjYXRlZ29yeTogJ3Nlc3Npb24nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAndGV4dCcsIHZhbHVlOiB0cnVuY2F0ZShlcnJvciwgTUFYX0RFVEFJTF9QQVlMT0FEKSA/PyBlcnJvciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2Fib3J0Jzoge1xuXHRcdFx0XHRjb25zdCByZWFzb24gPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5yZWFzb24pO1xuXHRcdFx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLCBpZDogcmVjb3JkLmlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQ6IHR1cm5QYXJlbnQsXG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5hYm9ydGVkJywgXCJBYm9ydGVkXCIpLFxuXHRcdFx0XHRcdGRldGFpbHM6IHJlYXNvbiwgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLldhcm5pbmcsIGNhdGVnb3J5OiAnc2Vzc2lvbicsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NraWxsLmludm9rZWQnOiB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5uYW1lKSA/PyAnc2tpbGwnO1xuXHRcdFx0XHRjb25zdCB0cmlnZ2VyID0gYXNTdHJpbmcocmVjb3JkLmRhdGEudHJpZ2dlcik7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZSA9IGFzU3RyaW5nKHJlY29yZC5kYXRhLnBsdWdpbk5hbWUpID8/IGFzU3RyaW5nKHJlY29yZC5kYXRhLnNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhc1N0cmluZyhyZWNvcmQuZGF0YS5jb250ZW50KTtcblx0XHRcdFx0ZXZlbnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJywgaWQ6IHJlY29yZC5pZCwgc2Vzc2lvblJlc291cmNlLCBjcmVhdGVkLCBwYXJlbnRFdmVudElkOiB0dXJuUGFyZW50LFxuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcuc2tpbGxJbnZva2VkJywgXCJTa2lsbCBJbnZva2VkOiB7MH1cIiwgbmFtZSksXG5cdFx0XHRcdFx0ZGV0YWlsczogW3RyaWdnZXIsIHNvdXJjZV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyBcXHUwMGI3ICcpIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWwuSW5mbywgY2F0ZWdvcnk6ICdjdXN0b21pemF0aW9uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlY29yZC5pZCwgeyBraW5kOiAndGV4dCcsIHZhbHVlOiB0cnVuY2F0ZShjb250ZW50LCBNQVhfREVUQUlMX1BBWUxPQUQpID8/IGNvbnRlbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHQvLyBgYXNzaXN0YW50LnR1cm5fc3RhcnRgIHNlZWRzIHR1cm4gZHVyYXRpb25zIChwcmUtcGFzcyk7IGl0c1xuXHRcdFx0Ly8gYGFzc2lzdGFudC50dXJuX2VuZGAgYW5kIGBzeXN0ZW0ubWVzc2FnZWAgc2libGluZ3MgYXJlIG5vdCBzdXJmYWNlZFxuXHRcdFx0Ly8gaW4gdGhpcyBzbGljZS5cblx0XHR9XG5cdH1cblxuXHQvLyBVc2FnZSBiYWNrLWZpbGwuIGBldmVudHMuanNvbmxgIHJlY29yZHMgb25seSBgb3V0cHV0VG9rZW5zYCBwZXIgdHVybjtcblx0Ly8gaW5wdXQvY2FjaGUtcmVhZCB0b2tlbnMgYW5kIENvcGlsb3QgQUlVIGNvbWUgZnJvbSBlbHNld2hlcmU6XG5cdC8vICAgMS4gVGhlIGNsaWVudC1sb2NhbCB1c2FnZSBzaWRlY2FyIChwcmVmZXJyZWQpOiBleGFjdCBwZXItcmVxdWVzdCB0b2tlbnNcblx0Ly8gICAgICBjYXB0dXJlZCBsaXZlIGZyb20gQ2hhdFVzYWdlIGFjdGlvbnMsIG1hcHBlZCBwZXIgcm91bmQgXHUyMDE0IHJlc3RhcnQtc2FmZVxuXHQvLyAgICAgIGFuZCBhY2N1cmF0ZSBmb3IgdGhlIENhY2hlIEV4cGxvcmVyLlxuXHQvLyAgIDIuIEVsc2UgdGhlIGBzZXNzaW9uLnNodXRkb3duYCBzdW1tYXJ5IChleGFjdCB0b3RhbHMsIHNwcmVhZCBldmVubHkpLlxuXHQvLyAgIDMuIEVsc2UgdGhlIGxpdmUgQUhQIHN0YXRlIChBSVUgb25seSkgZm9yIGluLXByb2dyZXNzIHNlc3Npb25zLlxuXHQvLyBUaGUgcGVyLXR1cm4gc3BsaXQgaW4gKDIpIGlzIGFuIGV2ZW4gYXBwcm94aW1hdGlvbiBidXQgdGhlIGNvbHVtbiBzdW1zIGFyZVxuXHQvLyBleGFjdDsgdG90YWxzIHRoYXQgYXJlbid0IGtub3duIChlLmcuIGlucHV0L2NhY2hlIG9uIGEgbGl2ZSBzZXNzaW9uKSBhcmVcblx0Ly8gbGVmdCBibGFuay5cblxuXHQvLyBEaXN0cmlidXRlcyBjdW11bGF0aXZlIGB0b3RhbHNgIGV2ZW5seSBhY3Jvc3MgdGhlIGdpdmVuIHR1cm5zLlxuXHRjb25zdCBmaWxsVHVybnNXaXRoVG90YWxzID0gKHRhcmdldHM6IHJlYWRvbmx5IElNb2RlbFR1cm5SZWZbXSwgdG90YWxzOiBJU2Vzc2lvblVzYWdlVG90YWxzKSA9PiB7XG5cdFx0Y29uc3QgbiA9IHRhcmdldHMubGVuZ3RoO1xuXHRcdGlmIChuID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0cyA9IHRvdGFscy5pbnB1dFRva2VucyAhPT0gdW5kZWZpbmVkID8gZGlzdHJpYnV0ZUV2ZW5seSh0b3RhbHMuaW5wdXRUb2tlbnMsIG4pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRvdGFscy5jYWNoZVJlYWRUb2tlbnMgIT09IHVuZGVmaW5lZCA/IGRpc3RyaWJ1dGVFdmVubHkodG90YWxzLmNhY2hlUmVhZFRva2VucywgbikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWl1ID0gZGlzdHJpYnV0ZUV2ZW5seSh0b3RhbHMudG90YWxOYW5vQWl1LCBuKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG47IGkrKykge1xuXHRcdFx0Y29uc3QgcmVmID0gdGFyZ2V0c1tpXTtcblx0XHRcdGNvbnN0IHR1cm4gPSBldmVudHNbcmVmLmluZGV4XSBhcyBJQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQ7XG5cdFx0XHRjb25zdCBpbnB1dFRva2VucyA9IGlucHV0cz8uW2ldO1xuXHRcdFx0Y29uc3QgY2FjaGVkVG9rZW5zID0gY2FjaGVkPy5baV07XG5cdFx0XHRjb25zdCB0b3RhbFRva2VucyA9IGlucHV0VG9rZW5zICE9PSB1bmRlZmluZWQgPyBpbnB1dFRva2VucyArIChyZWYub3V0cHV0VG9rZW5zID8/IDApIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29waWxvdFVzYWdlTmFub0FpdSA9IGFpdVtpXSA+IDAgPyBhaXVbaV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRldmVudHNbcmVmLmluZGV4XSA9IHsgLi4udHVybiwgaW5wdXRUb2tlbnMsIGNhY2hlZFRva2VucywgdG90YWxUb2tlbnMsIGNvcGlsb3RVc2FnZU5hbm9BaXUgfTtcblx0XHRcdGNvbnN0IGRldGFpbCA9IHJlc29sdmVkLmdldChyZWYuaWQpO1xuXHRcdFx0aWYgKGRldGFpbD8ua2luZCA9PT0gJ21vZGVsVHVybicpIHtcblx0XHRcdFx0cmVzb2x2ZWQuc2V0KHJlZi5pZCwgeyAuLi5kZXRhaWwsIGlucHV0VG9rZW5zLCBjYWNoZWRUb2tlbnMsIHRvdGFsVG9rZW5zIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRpZiAodXNhZ2VSZWNvcmRzICYmIHVzYWdlUmVjb3Jkcy5sZW5ndGggPiAwICYmIG1vZGVsVHVyblJlZnMubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IGNvdmVyYWdlID0gYXBwbHlQZXJUdXJuVXNhZ2UoZXZlbnRzLCByZXNvbHZlZCwgbW9kZWxUdXJuUmVmcywgdXNhZ2VSZWNvcmRzKTtcblx0XHQvLyBUaGUgc2lkZWNhciBtYXkgb25seSBjb3ZlciBhIHByZWZpeCBvZiB0aGUgc2Vzc2lvbidzIHR1cm5zIChsb2dnaW5nXG5cdFx0Ly8gZW5hYmxlZCBtaWQtc2Vzc2lvbiwgb3IgYSBkcm9wcGVkIGFwcGVuZCkuIFJlY29uY2lsZSB0aGUgcmVtYWluaW5nXG5cdFx0Ly8gdHVybnMgZnJvbSB0aGUgYXV0aG9yaXRhdGl2ZSBzaHV0ZG93bi9saXZlIHRvdGFscyBzbyB0aGUgT3ZlcnZpZXdcblx0XHQvLyBhZ2dyZWdhdGVzIGFyZW4ndCB1bmRlcmNvdW50ZWQsIGtlZXBpbmcgdGhlIGV4YWN0IHBlci1yb3VuZCB2YWx1ZXMgd2Vcblx0XHQvLyBkaWQgY2FwdHVyZS5cblx0XHRjb25zdCB1bmNvdmVyZWQgPSBtb2RlbFR1cm5SZWZzLmZpbHRlcigoX3JlZiwgaSkgPT4gIWNvdmVyYWdlLmNvdmVyZWQuaGFzKGkpKTtcblx0XHRpZiAodW5jb3ZlcmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHRvdGFscyA9IGV4dHJhY3RTZXNzaW9uVXNhZ2VUb3RhbHMocmVjb3JkcykgPz8gZmFsbGJhY2tVc2FnZVRvdGFscztcblx0XHRcdGlmICh0b3RhbHMpIHtcblx0XHRcdFx0ZmlsbFR1cm5zV2l0aFRvdGFscyh1bmNvdmVyZWQsIHtcblx0XHRcdFx0XHRpbnB1dFRva2VuczogdG90YWxzLmlucHV0VG9rZW5zICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCB0b3RhbHMuaW5wdXRUb2tlbnMgLSBjb3ZlcmFnZS5hc3NpZ25lZElucHV0KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IHRvdGFscy5jYWNoZVJlYWRUb2tlbnMgIT09IHVuZGVmaW5lZCA/IE1hdGgubWF4KDAsIHRvdGFscy5jYWNoZVJlYWRUb2tlbnMgLSBjb3ZlcmFnZS5hc3NpZ25lZENhY2hlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b3RhbE5hbm9BaXU6IE1hdGgubWF4KDAsIHRvdGFscy50b3RhbE5hbm9BaXUgLSBjb3ZlcmFnZS5hc3NpZ25lZEFpdSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIGlmIChtb2RlbFR1cm5SZWZzLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCB0b3RhbHMgPSBleHRyYWN0U2Vzc2lvblVzYWdlVG90YWxzKHJlY29yZHMpID8/IGZhbGxiYWNrVXNhZ2VUb3RhbHM7XG5cdFx0aWYgKHRvdGFscykge1xuXHRcdFx0ZmlsbFR1cm5zV2l0aFRvdGFscyhtb2RlbFR1cm5SZWZzLCB0b3RhbHMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFN1cmZhY2UgdGhlIHNlc3Npb24ncyBsb2FkZWQgY3VzdG9taXphdGlvbnMgKHNraWxscyAvIGhvb2tzIC8gYWdlbnRzIC8gTUNQXG5cdC8vIHNlcnZlcnMgLyBydWxlcykgYXMgZGlzY292ZXJ5IGV2ZW50cyBwbHVzIGEgc3VtbWFyeSwgbWlycm9yaW5nIHRoZSBsb2NhbFxuXHQvLyBgUHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uYC4gU291cmNlZCBmcm9tIGxpdmUgc2Vzc2lvbiBzdGF0ZSAodGhlIFNESydzXG5cdC8vIGBzZXNzaW9uLipfbG9hZGVkYCBldmVudHMgYXJlIGVwaGVtZXJhbCBhbmQgYWJzZW50IGZyb20gZXZlbnRzLmpzb25sKS5cblx0aWYgKGN1c3RvbWl6YXRpb25zICYmIGN1c3RvbWl6YXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRjb25zdCBjcmVhdGVkID0gcm9vdENyZWF0ZWQgPz8gKHJlY29yZHMubGVuZ3RoID4gMCA/IG5ldyBEYXRlKHJlY29yZHNbMF0udGltZXN0YW1wKSA6IG5ldyBEYXRlKCkpO1xuXHRcdGNvbnN0IHsgZXZlbnRzOiBjdXN0b21FdmVudHMsIHJlc29sdmVkOiBjdXN0b21SZXNvbHZlZCB9ID0gYnVpbGRDdXN0b21pemF0aW9uRGVidWdFdmVudHMoY3VzdG9taXphdGlvbnMsIHNlc3Npb25SZXNvdXJjZSwgcm9vdEV2ZW50SWQsIGNyZWF0ZWQpO1xuXHRcdGV2ZW50cy5wdXNoKC4uLmN1c3RvbUV2ZW50cyk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGRldGFpbF0gb2YgY3VzdG9tUmVzb2x2ZWQpIHtcblx0XHRcdHJlc29sdmVkLnNldChpZCwgZGV0YWlsKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBldmVudHMsIHJlc29sdmVkIH07XG59XG5cbi8qKiBPcmRlciBpbiB3aGljaCBsb2FkZWQgY3VzdG9taXphdGlvbiB0eXBlcyBhcmUgc3VyZmFjZWQgYXMgZGlzY292ZXJ5IGV2ZW50cy4gKi9cbmNvbnN0IENVU1RPTUlaQVRJT05fVFlQRV9PUkRFUjogcmVhZG9ubHkgQ3VzdG9taXphdGlvblR5cGVbXSA9IFtcblx0Q3VzdG9taXphdGlvblR5cGUuU2tpbGwsIEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssIEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsIEN1c3RvbWl6YXRpb25UeXBlLlByb21wdCxcbl07XG5cbi8qKiBBIGxlYWYgY3VzdG9taXphdGlvbiBmbGF0dGVuZWQgb3V0IG9mIGl0cyBjb250YWluZXIsIHdpdGggaXRzIGNvbnRleHQuICovXG5pbnRlcmZhY2UgSUZsYXRDdXN0b21pemF0aW9uIHtcblx0cmVhZG9ubHkgdHlwZTogQ3VzdG9taXphdGlvblR5cGU7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEZsYXR0ZW5zIHRoZSBzZXNzaW9uJ3MgY3VzdG9taXphdGlvbiB0cmVlIGludG8gaXRzIGxlYWYgY2hpbGRyZW4gKHNraWxscyxcbiAqIGhvb2tzLCBhZ2VudHMsIE1DUCBzZXJ2ZXJzLCBydWxlcywgcHJvbXB0cykuIENvbnRhaW5lciBlbnRyaWVzXG4gKiAoe0BsaW5rIEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbn0gLyB7QGxpbmsgQ3VzdG9taXphdGlvblR5cGUuRGlyZWN0b3J5fSkgYXJlXG4gKiBkZXNjZW5kZWQgaW50bzsgYSB0b3AtbGV2ZWwge0BsaW5rIEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcn0gaXMga2VwdCBhcy1pcy5cbiAqL1xuZnVuY3Rpb24gZmxhdHRlbkN1c3RvbWl6YXRpb25zKGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBJRmxhdEN1c3RvbWl6YXRpb25bXSB7XG5cdGNvbnN0IG91dDogSUZsYXRDdXN0b21pemF0aW9uW10gPSBbXTtcblx0Y29uc3QgdmlzaXQgPSAoYzogQ3VzdG9taXphdGlvbiB8IENoaWxkQ3VzdG9taXphdGlvbik6IHZvaWQgPT4ge1xuXHRcdGlmIChjLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbiB8fCBjLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjLmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRcdHZpc2l0KGNoaWxkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0b3V0LnB1c2goe1xuXHRcdFx0dHlwZTogYy50eXBlLFxuXHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0dXJpOiBjLnVyaSxcblx0XHRcdGVuYWJsZWQ6IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXG5cdFx0XHRcdD8gaXNDdXN0b21pemF0aW9uRW5hYmxlZChjKVxuXHRcdFx0XHQ6IGMuZW5hYmxlZCAhPT0gZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogKGMgYXMgeyBkZXNjcmlwdGlvbj86IHN0cmluZyB9KS5kZXNjcmlwdGlvbixcblx0XHR9KTtcblx0fTtcblx0Zm9yIChjb25zdCBjIG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0dmlzaXQoYyk7XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLyoqIEh1bWFuLXJlYWRhYmxlIG5hbWUgZm9yIGEgcGVyLXR5cGUgY3VzdG9taXphdGlvbiBkaXNjb3ZlcnkgZXZlbnQuICovXG5mdW5jdGlvbiBjdXN0b21pemF0aW9uRGlzY292ZXJ5TmFtZSh0eXBlOiBDdXN0b21pemF0aW9uVHlwZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuU2tpbGw6IHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnNraWxsRGlzY292ZXJ5JywgXCJTa2lsbCBEaXNjb3ZlcnlcIik7XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5Ib29rOiByZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5ob29rRGlzY292ZXJ5JywgXCJIb29rIERpc2NvdmVyeVwiKTtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkFnZW50OiByZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5hZ2VudERpc2NvdmVyeScsIFwiQWdlbnQgRGlzY292ZXJ5XCIpO1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyOiByZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5tY3BEaXNjb3ZlcnknLCBcIk1DUCBTZXJ2ZXIgRGlzY292ZXJ5XCIpO1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuUnVsZTogcmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucnVsZURpc2NvdmVyeScsIFwiSW5zdHJ1Y3Rpb25zIERpc2NvdmVyeVwiKTtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLlByb21wdDogcmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuZGVidWcucHJvbXB0RGlzY292ZXJ5JywgXCJQcm9tcHQgRGlzY292ZXJ5XCIpO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmN1c3RvbWl6YXRpb25EaXNjb3ZlcnknLCBcIkN1c3RvbWl6YXRpb24gRGlzY292ZXJ5XCIpO1xuXHR9XG59XG5cbi8qKiBNYXBzIGEgZmxhdHRlbmVkIGN1c3RvbWl6YXRpb24gdG8gYSBzdW1tYXJ5LWxvZyBjYXRlZ29yeSwgaWYgaXQgaGFzIG9uZS4gKi9cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25TdW1tYXJ5Q2F0ZWdvcnkoYzogSUZsYXRDdXN0b21pemF0aW9uKTogSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeVsnY2F0ZWdvcnknXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghYy5lbmFibGVkKSB7XG5cdFx0cmV0dXJuICdza2lwcGVkJztcblx0fVxuXHRzd2l0Y2ggKGMudHlwZSkge1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuU2tpbGw6IHJldHVybiAnc2tpbGwnO1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuQWdlbnQ6IHJldHVybiAnY3VzdG9tLWFnZW50Jztcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkhvb2s6IHJldHVybiAnaG9vayc7XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5SdWxlOiByZXR1cm4gJ2FwcGx5aW5nJztcblx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkOyAvLyBQcm9tcHQgLyBNQ1AgaGF2ZSBubyBzdW1tYXJ5IGNhdGVnb3J5XG5cdH1cbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGN1c3RvbWl6YXRpb24gZGlzY292ZXJ5ICsgc3VtbWFyeSBkZWJ1ZyBldmVudHMgZm9yIGEgc2Vzc2lvbiBmcm9tXG4gKiBpdHMgbG9hZGVkIHtAbGluayBDdXN0b21pemF0aW9ufXMuIElkcyBhcmUgZGV0ZXJtaW5pc3RpYyAocGVyIHNlc3Npb24gKyB0eXBlKVxuICogc28gcmVwZWF0ZWQgbGl2ZSByZWZyZXNoZXMgcmVwbGFjZSByYXRoZXIgdGhhbiBkdXBsaWNhdGUgdGhlbS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ3VzdG9taXphdGlvbkRlYnVnRXZlbnRzKFxuXHRjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdLFxuXHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0cGFyZW50RXZlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRjcmVhdGVkOiBEYXRlLFxuKTogeyByZWFkb25seSBldmVudHM6IElDaGF0RGVidWdFdmVudFtdOyByZWFkb25seSByZXNvbHZlZDogTWFwPHN0cmluZywgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50PiB9IHtcblx0Y29uc3QgZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSA9IFtdO1xuXHRjb25zdCByZXNvbHZlZCA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQ+KCk7XG5cdGNvbnN0IGZsYXQgPSBmbGF0dGVuQ3VzdG9taXphdGlvbnMoY3VzdG9taXphdGlvbnMpO1xuXHRpZiAoZmxhdC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4geyBldmVudHMsIHJlc29sdmVkIH07XG5cdH1cblxuXHRjb25zdCBieVR5cGUgPSBuZXcgTWFwPEN1c3RvbWl6YXRpb25UeXBlLCBJRmxhdEN1c3RvbWl6YXRpb25bXT4oKTtcblx0Zm9yIChjb25zdCBjIG9mIGZsYXQpIHtcblx0XHRjb25zdCBsaXN0ID0gYnlUeXBlLmdldChjLnR5cGUpO1xuXHRcdGlmIChsaXN0KSB7XG5cdFx0XHRsaXN0LnB1c2goYyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ5VHlwZS5zZXQoYy50eXBlLCBbY10pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGtleSA9IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXG5cdC8vIFBlci10eXBlIGRpc2NvdmVyeSBldmVudHMsIGVhY2ggZXhwYW5kYWJsZSB0byBpdHMgZmlsZSBsaXN0LlxuXHRmb3IgKGNvbnN0IHR5cGUgb2YgQ1VTVE9NSVpBVElPTl9UWVBFX09SREVSKSB7XG5cdFx0Y29uc3QgbGlzdCA9IGJ5VHlwZS5nZXQodHlwZSk7XG5cdFx0aWYgKCFsaXN0IHx8IGxpc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSBgYWdlbnRIb3N0Q3VzdG9taXphdGlvbjoke2tleX06JHt0eXBlfWA7XG5cdFx0Y29uc3QgbG9hZGVkQ291bnQgPSBsaXN0LmZpbHRlcihjID0+IGMuZW5hYmxlZCkubGVuZ3RoO1xuXHRcdGNvbnN0IHNraXBwZWRDb3VudCA9IGxpc3QubGVuZ3RoIC0gbG9hZGVkQ291bnQ7XG5cdFx0ZXZlbnRzLnB1c2goe1xuXHRcdFx0a2luZDogJ2dlbmVyaWMnLCBpZCwgc2Vzc2lvblJlc291cmNlLCBjcmVhdGVkLCBwYXJlbnRFdmVudElkLFxuXHRcdFx0bmFtZTogY3VzdG9taXphdGlvbkRpc2NvdmVyeU5hbWUodHlwZSksXG5cdFx0XHRkZXRhaWxzOiBza2lwcGVkQ291bnQgPiAwXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5jdXN0b21pemF0aW9uTG9hZGVkU2tpcHBlZCcsIFwiezB9IGxvYWRlZCwgezF9IGRpc2FibGVkXCIsIGxvYWRlZENvdW50LCBza2lwcGVkQ291bnQpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5kZWJ1Zy5jdXN0b21pemF0aW9uTG9hZGVkJywgXCJ7MH0gbG9hZGVkXCIsIGxvYWRlZENvdW50KSxcblx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLCBjYXRlZ29yeTogJ2Rpc2NvdmVyeScsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlsZXM6IElDaGF0RGVidWdGaWxlRW50cnlbXSA9IGxpc3QubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogVVJJLnBhcnNlKGMudXJpKSxcblx0XHRcdG5hbWU6IGMubmFtZSxcblx0XHRcdHN0YXR1czogYy5lbmFibGVkID8gJ2xvYWRlZCcgOiAnc2tpcHBlZCcsXG5cdFx0XHRza2lwUmVhc29uOiBjLmVuYWJsZWQgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmN1c3RvbWl6YXRpb25EaXNhYmxlZCcsIFwiZGlzYWJsZWRcIiksXG5cdFx0fSkpO1xuXHRcdHJlc29sdmVkLnNldChpZCwgeyBraW5kOiAnZmlsZUxpc3QnLCBkaXNjb3ZlcnlUeXBlOiB0eXBlLCBkdXJhdGlvbkluTWlsbGlzOiAwLCBmaWxlcyB9KTtcblx0fVxuXG5cdC8vIFN1bW1hcnkgZXZlbnQgbWlycm9yaW5nIHRoZSBsb2NhbCBcIlJlc29sdmUgQ3VzdG9taXphdGlvbnNcIi5cblx0Y29uc3QgbG9nczogSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeVtdID0gW107XG5cdGZvciAoY29uc3QgYyBvZiBmbGF0KSB7XG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSBjdXN0b21pemF0aW9uU3VtbWFyeUNhdGVnb3J5KGMpO1xuXHRcdGlmICghY2F0ZWdvcnkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRsb2dzLnB1c2goeyBjYXRlZ29yeSwgbmFtZTogYy5uYW1lLCB1cmk6IFVSSS5wYXJzZShjLnVyaSksIHJlYXNvbjogYy5kZXNjcmlwdGlvbiB9KTtcblx0fVxuXHRpZiAobG9ncy5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3QgaWQgPSBgYWdlbnRIb3N0Q3VzdG9taXphdGlvbjoke2tleX06c3VtbWFyeWA7XG5cdFx0Y29uc3QgY291bnRzID0ge1xuXHRcdFx0aW5zdHJ1Y3Rpb25zOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdhcHBseWluZycgfHwgZS5jYXRlZ29yeSA9PT0gJ3JlZmVyZW5jZWQnKS5sZW5ndGgsXG5cdFx0XHRza2lsbHM6IGxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ3NraWxsJykubGVuZ3RoLFxuXHRcdFx0YWdlbnRzOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdjdXN0b20tYWdlbnQnKS5sZW5ndGgsXG5cdFx0XHRob29rczogbG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnaG9vaycpLmxlbmd0aCxcblx0XHRcdHNraXBwZWQ6IGxvZ3MuZmlsdGVyKGUgPT4gZS5jYXRlZ29yeSA9PT0gJ3NraXBwZWQnKS5sZW5ndGgsXG5cdFx0fTtcblx0XHRldmVudHMucHVzaCh7XG5cdFx0XHRraW5kOiAnZ2VuZXJpYycsIGlkLCBzZXNzaW9uUmVzb3VyY2UsIGNyZWF0ZWQsIHBhcmVudEV2ZW50SWQsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmN1c3RvbWl6YXRpb25zUmVzb2x2ZWQnLCBcIlJlc29sdmUgQ3VzdG9taXphdGlvbnNcIiksXG5cdFx0XHRkZXRhaWxzOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLmN1c3RvbWl6YXRpb25zUmVzb2x2ZWREZXRhaWxzJywgXCJ7MH0gc2tpbGxzLCB7MX0gYWdlbnRzLCB7Mn0gaG9va3MsIHszfSBpbnN0cnVjdGlvbnNcIiwgY291bnRzLnNraWxscywgY291bnRzLmFnZW50cywgY291bnRzLmhvb2tzLCBjb3VudHMuaW5zdHJ1Y3Rpb25zKSxcblx0XHRcdGxldmVsOiBDaGF0RGVidWdMb2dMZXZlbC5JbmZvLCBjYXRlZ29yeTogJ2N1c3RvbWl6YXRpb24nLFxuXHRcdH0pO1xuXHRcdHJlc29sdmVkLnNldChpZCwgeyBraW5kOiAnY3VzdG9taXphdGlvblN1bW1hcnknLCByZXNvbHV0aW9uTG9nczogbG9ncywgZHVyYXRpb25Jbk1pbGxpczogMCwgY291bnRzIH0pO1xuXHR9XG5cblx0cmV0dXJuIHsgZXZlbnRzLCByZXNvbHZlZCB9O1xufVxuXG4vKiogQSBtb2RlbC10dXJuIGRlYnVnIGV2ZW50IHBsdXMgdGhlIGNvbnRleHQgbmVlZGVkIHRvIGJhY2stZmlsbCBpdHMgdXNhZ2UuICovXG5pbnRlcmZhY2UgSU1vZGVsVHVyblJlZiB7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZD86IHN0cmluZztcblx0cmVhZG9ubHkgb3V0cHV0VG9rZW5zPzogbnVtYmVyO1xufVxuXG4vKiogV2hhdCB7QGxpbmsgYXBwbHlQZXJUdXJuVXNhZ2V9IGFzc2lnbmVkLCBzbyBjYWxsZXJzIGNhbiByZWNvbmNpbGUgdGhlIHJlc3QuICovXG5pbnRlcmZhY2UgSVBlclR1cm5Vc2FnZUNvdmVyYWdlIHtcblx0LyoqIFBvc2l0aW9ucyBpbiBgbW9kZWxUdXJuUmVmc2AgdGhhdCByZWNlaXZlZCBhIHNpZGVjYXIgdXNhZ2UgcmVjb3JkLiAqL1xuXHRyZWFkb25seSBjb3ZlcmVkOiBSZWFkb25seVNldDxudW1iZXI+O1xuXHQvKiogU3VtIG9mIGlucHV0IHRva2VucyBhc3NpZ25lZCBmcm9tIHRoZSBzaWRlY2FyLiAqL1xuXHRyZWFkb25seSBhc3NpZ25lZElucHV0OiBudW1iZXI7XG5cdC8qKiBTdW0gb2YgY2FjaGUtcmVhZCB0b2tlbnMgYXNzaWduZWQgZnJvbSB0aGUgc2lkZWNhci4gKi9cblx0cmVhZG9ubHkgYXNzaWduZWRDYWNoZTogbnVtYmVyO1xuXHQvKiogU3VtIG9mIENvcGlsb3QgQUlVIChuYW5vKSBhc3NpZ25lZCBmcm9tIHRoZSBzaWRlY2FyLiAqL1xuXHRyZWFkb25seSBhc3NpZ25lZEFpdTogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBhcHBseVBlclR1cm5Vc2FnZShcblx0ZXZlbnRzOiBJQ2hhdERlYnVnRXZlbnRbXSxcblx0cmVzb2x2ZWQ6IE1hcDxzdHJpbmcsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudD4sXG5cdG1vZGVsVHVyblJlZnM6IHJlYWRvbmx5IElNb2RlbFR1cm5SZWZbXSxcblx0dXNhZ2VSZWNvcmRzOiByZWFkb25seSBJQWdlbnRIb3N0VXNhZ2VSZWNvcmRbXSxcbik6IElQZXJUdXJuVXNhZ2VDb3ZlcmFnZSB7XG5cdGNvbnN0IGFzc2lnbiA9IChyZWY6IHR5cGVvZiBtb2RlbFR1cm5SZWZzW251bWJlcl0sIGlucHV0VG9rZW5zOiBudW1iZXIgfCB1bmRlZmluZWQsIGNhY2hlZFRva2VuczogbnVtYmVyIHwgdW5kZWZpbmVkLCBjb3BpbG90VXNhZ2VOYW5vQWl1OiBudW1iZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRjb25zdCB0dXJuID0gZXZlbnRzW3JlZi5pbmRleF0gYXMgSUNoYXREZWJ1Z01vZGVsVHVybkV2ZW50O1xuXHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gaW5wdXRUb2tlbnMgIT09IHVuZGVmaW5lZCA/IGlucHV0VG9rZW5zICsgKHJlZi5vdXRwdXRUb2tlbnMgPz8gMCkgOiB1bmRlZmluZWQ7XG5cdFx0ZXZlbnRzW3JlZi5pbmRleF0gPSB7IC4uLnR1cm4sIGlucHV0VG9rZW5zLCBjYWNoZWRUb2tlbnMsIHRvdGFsVG9rZW5zLCBjb3BpbG90VXNhZ2VOYW5vQWl1IH07XG5cdFx0Y29uc3QgZGV0YWlsID0gcmVzb2x2ZWQuZ2V0KHJlZi5pZCk7XG5cdFx0aWYgKGRldGFpbD8ua2luZCA9PT0gJ21vZGVsVHVybicpIHtcblx0XHRcdHJlc29sdmVkLnNldChyZWYuaWQsIHsgLi4uZGV0YWlsLCBpbnB1dFRva2VucywgY2FjaGVkVG9rZW5zLCB0b3RhbFRva2VucyB9KTtcblx0XHR9XG5cdH07XG5cblx0Ly8gVGhlIHNpZGVjYXIgYW5kIGV2ZW50cy5qc29ubCB1c2UgRElGRkVSRU5UIHR1cm4taWQgbmFtZXNwYWNlcyBcdTIwMTQgdGhlXG5cdC8vIHNpZGVjYXIga2V5cyBvbiB0aGUgYmFja2VuZCByZXF1ZXN0IGlkIChvbmUgaWQgcGVyIHVzZXIgdHVybiwgc2hhcmVkIGJ5XG5cdC8vIGl0cyByb3VuZHMpIHdoaWxlIGV2ZW50cy5qc29ubCBrZXlzIG9uIGEgcGVyLXR1cm4gcm91bmQgaW5kZXggdGhhdCByZXNldHNcblx0Ly8gZWFjaCB1c2VyIHR1cm4gXHUyMDE0IHNvIHRoZXkgY2FuJ3QgYmUgY29ycmVsYXRlZCBieSBpZC4gQm90aCBzdHJlYW1zIGFyZVxuXHQvLyBjaHJvbm9sb2dpY2FsIHdpdGggb25lIGVudHJ5IHBlciBtb2RlbCByb3VuZCwgdGhvdWdoLCBzbyBjb3JyZWxhdGUgdGhlbVxuXHQvLyBwb3NpdGlvbmFsbHksIHVzaW5nIHRoZSBgb3V0cHV0VG9rZW5zYCBib3RoIHJlcG9ydCBhcyBhbiBhbGlnbm1lbnQgZ3VhcmQ6XG5cdC8vIGEgcmVmIHdob3NlIG91dHB1dCBkb2Vzbid0IG1hdGNoIHRoZSBuZXh0IHJlY29yZCBoYXMgbm8gY2FwdHVyZWQgdXNhZ2Vcblx0Ly8gKGUuZy4gYSBzdWItYWdlbnQgcm91bmQsIHdob3NlIHVzYWdlIGZvbGRzIGludG8gdGhlIHBhcmVudCBhZ2dyZWdhdGUgYW5kXG5cdC8vIGlzbid0IHJlY29yZGVkIHNlcGFyYXRlbHkpLCBzbyBpdCdzIGxlZnQgYmxhbmsgYW5kIHRoZSByZWNvcmQgaXMga2VwdCBmb3Jcblx0Ly8gdGhlIG5leHQgcmVmLlxuXG5cdC8vIENvcGlsb3QgQUlVIGlzIGN1bXVsYXRpdmUgcGVyIHVzZXIgdHVybiAoaXQgcmVzZXRzIGVhY2ggdHVybiksIHNvXG5cdC8vIGF0dHJpYnV0ZSBlYWNoIHR1cm4ncyBtYXggb25seSB0byBpdHMgTEFTVCBjYXB0dXJlZCByb3VuZCBcdTIwMTQgdGhlIHN1bW1lZFxuXHQvLyBwZXItdHVybiB0b3RhbCB0aGVuIHN0YXlzIGV4YWN0LiBUdXJuIGJvdW5kYXJpZXMgYXJlIHRoZSBydW5zIG9mIHJlY29yZHNcblx0Ly8gc2hhcmluZyBhIGB0dXJuSWRgLlxuXHRjb25zdCBhaXVCeVJlY29yZEluZGV4ID0gbmV3IEFycmF5PG51bWJlciB8IHVuZGVmaW5lZD4odXNhZ2VSZWNvcmRzLmxlbmd0aCkuZmlsbCh1bmRlZmluZWQpO1xuXHRmb3IgKGxldCBzdGFydCA9IDA7IHN0YXJ0IDwgdXNhZ2VSZWNvcmRzLmxlbmd0aDspIHtcblx0XHRsZXQgZW5kID0gc3RhcnQ7XG5cdFx0d2hpbGUgKGVuZCArIDEgPCB1c2FnZVJlY29yZHMubGVuZ3RoICYmIHVzYWdlUmVjb3Jkc1tlbmQgKyAxXS50dXJuSWQgPT09IHVzYWdlUmVjb3Jkc1tzdGFydF0udHVybklkKSB7XG5cdFx0XHRlbmQrKztcblx0XHR9XG5cdFx0bGV0IG1heEFpdSA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDw9IGVuZDsgaSsrKSB7XG5cdFx0XHRtYXhBaXUgPSBNYXRoLm1heChtYXhBaXUsIHVzYWdlUmVjb3Jkc1tpXS50b3RhbE5hbm9BaXUgPz8gMCk7XG5cdFx0fVxuXHRcdGlmIChtYXhBaXUgPiAwKSB7XG5cdFx0XHRhaXVCeVJlY29yZEluZGV4W2VuZF0gPSBtYXhBaXU7XG5cdFx0fVxuXHRcdHN0YXJ0ID0gZW5kICsgMTtcblx0fVxuXG5cdGxldCByZWNvcmRJbmRleCA9IDA7XG5cdGxldCBhc3NpZ25lZElucHV0ID0gMDtcblx0bGV0IGFzc2lnbmVkQ2FjaGUgPSAwO1xuXHRsZXQgYXNzaWduZWRBaXUgPSAwO1xuXHRjb25zdCBjb3ZlcmVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdGZvciAobGV0IHJlZklkeCA9IDA7IHJlZklkeCA8IG1vZGVsVHVyblJlZnMubGVuZ3RoOyByZWZJZHgrKykge1xuXHRcdGlmIChyZWNvcmRJbmRleCA+PSB1c2FnZVJlY29yZHMubGVuZ3RoKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y29uc3QgcmVmID0gbW9kZWxUdXJuUmVmc1tyZWZJZHhdO1xuXHRcdGNvbnN0IHJlY29yZCA9IHVzYWdlUmVjb3Jkc1tyZWNvcmRJbmRleF07XG5cdFx0aWYgKHJlZi5vdXRwdXRUb2tlbnMgIT09IHVuZGVmaW5lZCAmJiByZWNvcmQub3V0cHV0VG9rZW5zICE9PSB1bmRlZmluZWQgJiYgcmVmLm91dHB1dFRva2VucyAhPT0gcmVjb3JkLm91dHB1dFRva2Vucykge1xuXHRcdFx0Y29udGludWU7IC8vIHRoaXMgcmVmIGhhcyBubyBjYXB0dXJlZCB1c2FnZSByZWNvcmQgXHUyMDE0IGxlYXZlIGl0IGJsYW5rXG5cdFx0fVxuXHRcdGNvbnN0IGFpdSA9IGFpdUJ5UmVjb3JkSW5kZXhbcmVjb3JkSW5kZXhdO1xuXHRcdGFzc2lnbihyZWYsIHJlY29yZC5pbnB1dFRva2VucywgcmVjb3JkLmNhY2hlUmVhZFRva2VucywgYWl1KTtcblx0XHRhc3NpZ25lZElucHV0ICs9IHJlY29yZC5pbnB1dFRva2VucyA/PyAwO1xuXHRcdGFzc2lnbmVkQ2FjaGUgKz0gcmVjb3JkLmNhY2hlUmVhZFRva2VucyA/PyAwO1xuXHRcdGFzc2lnbmVkQWl1ICs9IGFpdSA/PyAwO1xuXHRcdGNvdmVyZWQuYWRkKHJlZklkeCk7XG5cdFx0cmVjb3JkSW5kZXgrKztcblx0fVxuXHRyZXR1cm4geyBjb3ZlcmVkLCBhc3NpZ25lZElucHV0LCBhc3NpZ25lZENhY2hlLCBhc3NpZ25lZEFpdSB9O1xufVxuXG4vKiogU2Vzc2lvbiB1c2FnZSB0b3RhbHMgZGlzdHJpYnV0ZWQgYWNyb3NzIG1vZGVsIHR1cm5zLiAqL1xuaW50ZXJmYWNlIElTZXNzaW9uVXNhZ2VUb3RhbHMge1xuXHQvKiogQ3VtdWxhdGl2ZSBpbnB1dCB0b2tlbnMgXHUyMDE0IG9ubHkgc2V0IHdoZW4ga25vd24gZnJvbSBhbiBleGFjdCBzb3VyY2UgKGBzZXNzaW9uLnNodXRkb3duYCkuICovXG5cdHJlYWRvbmx5IGlucHV0VG9rZW5zPzogbnVtYmVyO1xuXHQvKiogQ3VtdWxhdGl2ZSBjYWNoZS1yZWFkIHRva2VucyBcdTIwMTQgb25seSBzZXQgd2hlbiBrbm93biBmcm9tIGFuIGV4YWN0IHNvdXJjZS4gKi9cblx0cmVhZG9ubHkgY2FjaGVSZWFkVG9rZW5zPzogbnVtYmVyO1xuXHQvKiogQ3VtdWxhdGl2ZSBDb3BpbG90IEFJVSAobmFubykuICovXG5cdHJlYWRvbmx5IHRvdGFsTmFub0FpdTogbnVtYmVyO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHNlc3Npb24tY3VtdWxhdGl2ZSB1c2FnZSBmcm9tIHRoZSBsYXN0IGBzZXNzaW9uLnNodXRkb3duYCByZWNvcmQuXG4gKiBUb2tlbiB0b3RhbHMgYXJlIHN1bW1lZCBhY3Jvc3MgYG1vZGVsTWV0cmljc1sqXS51c2FnZWA7IEFJVSBwcmVmZXJzIHRoZVxuICogdG9wLWxldmVsIGB0b3RhbE5hbm9BaXVgLCBmYWxsaW5nIGJhY2sgdG8gdGhlIHBlci1tb2RlbCBzdW0uIFJldHVybnNcbiAqIGB1bmRlZmluZWRgIG9ubHkgd2hlbiB0aGVyZSBpcyBubyBgc2Vzc2lvbi5zaHV0ZG93bmAgcmVjb3JkIChlLmcuIGFuIGFjdGl2ZVxuICogc2Vzc2lvbikgXHUyMDE0IG9uY2UgYSBzaHV0ZG93biBzdW1tYXJ5IGV4aXN0cyBpdCBpcyBhdXRob3JpdGF0aXZlIGV2ZW4gd2hlbiBpdHNcbiAqIHRvdGFscyBhcmUgemVybywgc28gdGhlIGNhbGxlciBtdXN0IG5vdCBmYWxsIGJhY2sgdG8gbGl2ZSB1c2FnZS5cbiAqL1xuZnVuY3Rpb24gZXh0cmFjdFNlc3Npb25Vc2FnZVRvdGFscyhyZWNvcmRzOiByZWFkb25seSBJQWdlbnRIb3N0RXZlbnRSZWNvcmRbXSk6IElTZXNzaW9uVXNhZ2VUb3RhbHMgfCB1bmRlZmluZWQge1xuXHRsZXQgc2h1dGRvd246IElBZ2VudEhvc3RFdmVudFJlY29yZCB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCByZWNvcmQgb2YgcmVjb3Jkcykge1xuXHRcdGlmIChyZWNvcmQudHlwZSA9PT0gJ3Nlc3Npb24uc2h1dGRvd24nKSB7XG5cdFx0XHRzaHV0ZG93biA9IHJlY29yZDsgLy8ga2VlcCB0aGUgbGFzdCBvbmVcblx0XHR9XG5cdH1cblx0aWYgKCFzaHV0ZG93bikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgaW5wdXRUb2tlbnMgPSAwO1xuXHRsZXQgY2FjaGVSZWFkVG9rZW5zID0gMDtcblx0bGV0IHBlck1vZGVsTmFub0FpdSA9IDA7XG5cdGNvbnN0IG1vZGVsTWV0cmljcyA9IHNodXRkb3duLmRhdGEubW9kZWxNZXRyaWNzO1xuXHRpZiAobW9kZWxNZXRyaWNzICYmIHR5cGVvZiBtb2RlbE1ldHJpY3MgPT09ICdvYmplY3QnKSB7XG5cdFx0Zm9yIChjb25zdCBtZXRyaWMgb2YgT2JqZWN0LnZhbHVlcyhtb2RlbE1ldHJpY3MgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IG1ldHJpYyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHVzYWdlID0gZW50cnk/LnVzYWdlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0aW5wdXRUb2tlbnMgKz0gYXNOdW1iZXIodXNhZ2U/LmlucHV0VG9rZW5zKSA/PyAwO1xuXHRcdFx0Y2FjaGVSZWFkVG9rZW5zICs9IGFzTnVtYmVyKHVzYWdlPy5jYWNoZVJlYWRUb2tlbnMpID8/IDA7XG5cdFx0XHRwZXJNb2RlbE5hbm9BaXUgKz0gYXNOdW1iZXIoZW50cnk/LnRvdGFsTmFub0FpdSkgPz8gMDtcblx0XHR9XG5cdH1cblx0Y29uc3QgdG90YWxOYW5vQWl1ID0gYXNOdW1iZXIoc2h1dGRvd24uZGF0YS50b3RhbE5hbm9BaXUpID8/IHBlck1vZGVsTmFub0FpdTtcblxuXHQvLyBBIHNodXRkb3duIHN1bW1hcnkgaXMgYXV0aG9yaXRhdGl2ZSBldmVuIHdoZW4gaXRzIHRvdGFscyBhcmUgemVybzogaW5wdXQgL1xuXHQvLyBjYWNoZSBhcmUgdGhlbiBrbm93biB0byBiZSB6ZXJvIChub3QgdW5rbm93biksIHNvIHJldHVybmluZyB0aGUgdG90YWxzIGhlcmVcblx0Ly8ga2VlcHMgdGhlIGNhbGxlciBmcm9tIGZhbGxpbmcgYmFjayB0byBsaXZlIEFJVSBmb3IgYSBmaW5pc2hlZCBzZXNzaW9uLlxuXHRyZXR1cm4geyBpbnB1dFRva2VucywgY2FjaGVSZWFkVG9rZW5zLCB0b3RhbE5hbm9BaXUgfTtcbn1cblxuLyoqIFNwbGl0cyBgdG90YWxgIGludG8gYG5gIGludGVnZXIgcGFydHMgdGhhdCBzdW0gZXhhY3RseSB0byBgdG90YWxgLiAqL1xuZnVuY3Rpb24gZGlzdHJpYnV0ZUV2ZW5seSh0b3RhbDogbnVtYmVyLCBuOiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdGlmIChuIDw9IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgYmFzZSA9IE1hdGguZmxvb3IodG90YWwgLyBuKTtcblx0Y29uc3QgcGFydHMgPSBuZXcgQXJyYXk8bnVtYmVyPihuKS5maWxsKGJhc2UpO1xuXHRsZXQgcmVtYWluZGVyID0gdG90YWwgLSBiYXNlICogbjtcblx0Zm9yIChsZXQgaSA9IG4gLSAxOyByZW1haW5kZXIgPiAwOyBpLS0sIHJlbWFpbmRlci0tKSB7XG5cdFx0cGFydHNbaV0gKz0gMTtcblx0fVxuXHRyZXR1cm4gcGFydHM7XG59XG5cbi8qKlxuICogU3VtcyBDb3BpbG90IEFJVSBhY3Jvc3MgYSBsaXZlIGNoYXQncyB0dXJucyAoZm9yIGluLXByb2dyZXNzIHNlc3Npb25zKS5cbiAqXG4gKiBEZWxpYmVyYXRlbHkgc3VtcyBBSVUgb25seS4gVGhlIHByb2R1Y2VyIGVtaXRzIHBlci1yZXF1ZXN0IGlucHV0L2NhY2hlIGFuZFxuICogdGhlIHJlZHVjZXIgb3ZlcndyaXRlcyBlYWNoIHR1cm4ncyBgdXNhZ2VgIHdpdGggdGhlIGxhdGVzdCByZXF1ZXN0IFx1MjAxNFxuICogb25seSBBSVUgaXMgYWNjdW11bGF0ZWQgcGVyIHR1cm4gKGBfdHVybkNvcGlsb3RVc2FnZVRvdGFsTmFub0FpdWApLiBTbyB0aGVcbiAqIGNoYXQgc3RhdGUgaG9sZHMganVzdCBlYWNoIHR1cm4ncyAqbGFzdCogcmVxdWVzdCdzIGlucHV0L2NhY2hlOyBzdW1taW5nXG4gKiB0aG9zZSB3b3VsZCB1bmRlci1yZXBvcnQgbXVsdGktcmVxdWVzdCAodG9vbC1sb29wKSB0dXJucy4gSW5wdXQvY2FjaGUgYXJlXG4gKiB0aGVyZWZvcmUgbGVmdCB0byB0aGUgZXhhY3QgYHNlc3Npb24uc2h1dGRvd25gIHN1bW1hcnksIGFuZCBsaXZlIHNlc3Npb25zXG4gKiBzaG93IEFJVSArIG91dHB1dCBvbmx5IHVudGlsIHRoZXkgZW5kLlxuICovXG5mdW5jdGlvbiBzdW1DaGF0U3RhdGVVc2FnZShjaGF0OiBDaGF0U3RhdGUpOiBJU2Vzc2lvblVzYWdlVG90YWxzIHwgdW5kZWZpbmVkIHtcblx0bGV0IHRvdGFsTmFub0FpdSA9IDA7XG5cdGxldCBoYXNVc2FnZSA9IGZhbHNlO1xuXHRjb25zdCBhZGQgPSAodXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdGlmICghdXNhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aGFzVXNhZ2UgPSB0cnVlO1xuXHRcdHRvdGFsTmFub0FpdSArPSByZWFkQ29waWxvdE5hbm9BaXUodXNhZ2UpO1xuXHR9O1xuXHRmb3IgKGNvbnN0IHR1cm4gb2YgY2hhdC50dXJucykge1xuXHRcdGFkZCh0dXJuLnVzYWdlKTtcblx0fVxuXHRhZGQoY2hhdC5hY3RpdmVUdXJuPy51c2FnZSk7XG5cdHJldHVybiBoYXNVc2FnZSA/IHsgdG90YWxOYW5vQWl1IH0gOiB1bmRlZmluZWQ7XG59XG5cbi8qKiBSZWFkcyBgX21ldGEuY29waWxvdFVzYWdlLnRvdGFsTmFub0FpdWAgKHBlci10dXJuIGN1bXVsYXRpdmUgQUlVKSBmcm9tIGEgdXNhZ2UgcmVwb3J0LiAqL1xuZnVuY3Rpb24gcmVhZENvcGlsb3ROYW5vQWl1KHVzYWdlOiBVc2FnZUluZm8pOiBudW1iZXIge1xuXHRyZXR1cm4gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmNvcGlsb3RVc2FnZT8udG90YWxOYW5vQWl1ID8/IDA7XG59XG5cbi8qKiBQYXJzZXMgYSBsaW5lLWRlbGltaXRlZCBKU09OIHN0cmVhbSwgc2tpcHBpbmcgYmxhbmsgb3IgbWFsZm9ybWVkIGxpbmVzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSnNvbmwodGV4dDogc3RyaW5nKTogSUFnZW50SG9zdEV2ZW50UmVjb3JkW10ge1xuXHRjb25zdCByZWNvcmRzOiBJQWdlbnRIb3N0RXZlbnRSZWNvcmRbXSA9IFtdO1xuXHRhcHBlbmRKc29ubFJlY29yZHModGV4dCwgcmVjb3Jkcyk7XG5cdHJldHVybiByZWNvcmRzO1xufVxuXG4vKipcbiAqIFBhcnNlcyBlYWNoIGNvbXBsZXRlIEpTT05MIGxpbmUgaW4gYHRleHRgIGFuZCBhcHBlbmRzIHRoZSB3ZWxsLWZvcm1lZFxuICogcmVjb3JkcyB0byBgcmVjb3Jkc2AgKHVzZWQgZm9yIGJvdGggZnVsbCBhbmQgaW5jcmVtZW50YWwgdGFpbCByZWFkcykuXG4gKi9cbmZ1bmN0aW9uIGFwcGVuZEpzb25sUmVjb3Jkcyh0ZXh0OiBzdHJpbmcsIHJlY29yZHM6IElBZ2VudEhvc3RFdmVudFJlY29yZFtdKTogdm9pZCB7XG5cdGZvciAoY29uc3QgbGluZSBvZiB0ZXh0LnNwbGl0KCdcXG4nKSkge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0XHRpZiAoIXRyaW1tZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZSh0cmltbWVkKTtcblx0XHRcdC8vIFJlcXVpcmUgdGhlIGZ1bGwgZW52ZWxvcGUgc28gdGhlIGNvbnZlcnRlciBjYW4gcmVhZCBgcmVjb3JkLipgIGFuZFxuXHRcdFx0Ly8gYHJlY29yZC5kYXRhLipgIHdpdGhvdXQgZ3VhcmRpbmcgZXZlcnkgYWNjZXNzIFx1MjAxNCBpbmNsdWRpbmcgYSBzdHJpbmdcblx0XHRcdC8vIGB0aW1lc3RhbXBgIChlbHNlIGBuZXcgRGF0ZSguLi4pYCB5aWVsZHMgYEludmFsaWQgRGF0ZWApLCBhXG5cdFx0XHQvLyBgc3RyaW5nIHwgbnVsbGAgYHBhcmVudElkYCwgYW5kIGEgbm9uLWFycmF5IGBkYXRhYCBvYmplY3QuIEEgbGluZVxuXHRcdFx0Ly8gbWlzc2luZyBhbnkgb2YgdGhlc2UgaXMgdHJlYXRlZCBhcyBtYWxmb3JtZWQgYW5kIHNraXBwZWQgcmF0aGVyIHRoYW5cblx0XHRcdC8vIHRocm93aW5nIGRvd25zdHJlYW0gKHdoaWNoIHdvdWxkIGRyb3AgdGhlIHdob2xlIHNlc3Npb24ncyBkZWJ1ZyBsb2cpLlxuXHRcdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkLnR5cGUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBwYXJzZWQuaWQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCYmIHR5cGVvZiBwYXJzZWQudGltZXN0YW1wID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiAocGFyc2VkLnBhcmVudElkID09PSBudWxsIHx8IHR5cGVvZiBwYXJzZWQucGFyZW50SWQgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQmJiBwYXJzZWQuZGF0YSAmJiB0eXBlb2YgcGFyc2VkLmRhdGEgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHBhcnNlZC5kYXRhKSkge1xuXHRcdFx0XHRyZWNvcmRzLnB1c2gocGFyc2VkIGFzIElBZ2VudEhvc3RFdmVudFJlY29yZCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUgcGFydGlhbCB0cmFpbGluZyBsaW5lcyAoY29tbW9uIHdoZW4gcmVhZGluZyBhIGJvdW5kZWQgaGVhZCkuXG5cdFx0fVxuXHR9XG59XG5cbi8qKiBCeXRlIGluZGV4IG9mIHRoZSBsYXN0IGBcXG5gIGluIGBidWZmZXJgLCBvciAtMSBpZiBub25lIChzYWZlIFVURi04IHNwbGl0IHBvaW50KS4gKi9cbmZ1bmN0aW9uIGxhc3RJbmRleE9mTmV3bGluZShidWZmZXI6IFZTQnVmZmVyKTogbnVtYmVyIHtcblx0Y29uc3QgYnl0ZXMgPSBidWZmZXIuYnVmZmVyO1xuXHRmb3IgKGxldCBpID0gYnl0ZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRpZiAoYnl0ZXNbaV0gPT09IDB4MEEgLyogXFxuICovKSB7XG5cdFx0XHRyZXR1cm4gaTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIC0xO1xufVxuXG4vKipcbiAqIERldGVybWluaXN0aWMgbG9jYWxpemVkIGZhbGxiYWNrIHRpdGxlIGZvciBhIGRpc2NvdmVyZWQgc2Vzc2lvbiB0aGF0IGhhcyBub1xuICogYHVzZXIubWVzc2FnZWAgaW4gdGhlIHNjYW5uZWQgaGVhZCwgc28gdGhlIGhvbWUgbGlzdCBzaG93cyBzb21ldGhpbmdcbiAqIG1lYW5pbmdmdWwgaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyBcIk5ldyBDaGF0XCIgZmFsbGJhY2suIFVzZXMgYSBzaG9ydCBwcmVmaXggb2ZcbiAqIHRoZSBzZXNzaW9uIGlkLlxuICovXG5mdW5jdGlvbiBmYWxsYmFja1Nlc3Npb25UaXRsZShzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRlYnVnLnVudGl0bGVkU2Vzc2lvbicsIFwiQ29waWxvdCBTZXNzaW9uIHswfVwiLCBzZXNzaW9uSWQuc2xpY2UoMCwgOCkpO1xufVxuXG4vKiogRGVyaXZlcyBhIHNlc3Npb24gdGl0bGUgZnJvbSB0aGUgZmlyc3QgdXNlciBtZXNzYWdlIGluIGFuIGV2ZW50cyBzdHJlYW0uICovXG5mdW5jdGlvbiBleHRyYWN0U2Vzc2lvblRpdGxlKHRleHQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGZvciAoY29uc3QgcmVjb3JkIG9mIHBhcnNlSnNvbmwodGV4dCkpIHtcblx0XHRpZiAocmVjb3JkLnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXNTdHJpbmcocmVjb3JkLmRhdGEuY29udGVudCk7XG5cdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRyZXR1cm4gc3VtbWFyaXplKGNvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBhc1N0cmluZyh2YWx1ZTogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGFzTnVtYmVyKHZhbHVlOiB1bmtub3duKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgaXNGaW5pdGUodmFsdWUpID8gdmFsdWUgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGFzQm9vbGVhbih2YWx1ZTogdW5rbm93bik6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gYXNSZWNvcmQodmFsdWU6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKSA/IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBkaWZmTWlsbGlzKHN0YXJ0OiBzdHJpbmcsIGVuZDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgYSA9IG5ldyBEYXRlKHN0YXJ0KS5nZXRUaW1lKCk7XG5cdGNvbnN0IGIgPSBuZXcgRGF0ZShlbmQpLmdldFRpbWUoKTtcblx0cmV0dXJuIGlzRmluaXRlKGEpICYmIGlzRmluaXRlKGIpICYmIGIgPj0gYSA/IGIgLSBhIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBzdHJpbmdpZnlQYXlsb2FkKHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHZhbHVlLCB1bmRlZmluZWQsIDIpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1heDogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB2YWx1ZS5sZW5ndGggPiBtYXggPyB2YWx1ZS5zbGljZSgwLCBtYXgpICsgJ1x1MjAyNicgOiB2YWx1ZTtcbn1cblxuLyoqIEZpcnN0IG5vbi1lbXB0eSBsaW5lIG9mIGEgbWVzc2FnZSwgdHJpbW1lZCB0byBhIHNob3J0IHNpbmdsZS1saW5lIHN1bW1hcnkuICovXG5mdW5jdGlvbiBzdW1tYXJpemUoY29udGVudDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgZmlyc3RMaW5lID0gY29udGVudC5zcGxpdCgnXFxuJykubWFwKGwgPT4gbC50cmltKCkpLmZpbmQobCA9PiBsLmxlbmd0aCA+IDApID8/ICcnO1xuXHRyZXR1cm4gZmlyc3RMaW5lLmxlbmd0aCA+IDEwMCA/IGZpcnN0TGluZS5zbGljZSgwLCAxMDApICsgJ1x1MjAyNicgOiBmaXJzdExpbmU7XG59XG5cbmZ1bmN0aW9uIHRvRXJyb3JNZXNzYWdlKGVycjogdW5rbm93bik6IHN0cmluZyB7XG5cdHJldHVybiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsZ0JBQWdCO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNs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VSxXQUFXLElBQUksR0FBRztBQUN0QyxRQUFJLE9BQU8sU0FBUyxnQkFBZ0I7QUFDbkMsWUFBTSxVQUFVLFNBQVMsT0FBTyxLQUFLLE9BQU87QUFDNUMsVUFBSSxTQUFTO0FBQ1osZUFBTyxVQUFVLE9BQU87QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxTQUFTLE9BQW9DO0FBQ3JELFNBQU8sT0FBTyxVQUFVLFdBQVcsUUFBUTtBQUM1QztBQUVBLFNBQVMsU0FBUyxPQUFvQztBQUNyRCxTQUFPLE9BQU8sVUFBVSxZQUFZLFNBQVMsS0FBSyxJQUFJLFFBQVE7QUFDL0Q7QUFFQSxTQUFTLFVBQVUsT0FBcUM7QUFDdkQsU0FBTyxPQUFPLFVBQVUsWUFBWSxRQUFRO0FBQzdDO0FBRUEsU0FBUyxTQUFTLE9BQXFEO0FBQ3RFLFNBQU8sU0FBUyxPQUFPLFVBQVUsWUFBWSxDQUFDLE1BQU0sUUFBUSxLQUFLLElBQUksUUFBbUM7QUFDekc7QUFFQSxTQUFTLFdBQVcsT0FBZSxLQUFpQztBQUNuRSxRQUFNLElBQUksSUFBSSxLQUFLLEtBQUssRUFBRSxRQUFRO0FBQ2xDLFFBQU0sSUFBSSxJQUFJLEtBQUssR0FBRyxFQUFFLFFBQVE7QUFDaEMsU0FBTyxTQUFTLENBQUMsS0FBSyxTQUFTLENBQUMsS0FBSyxLQUFLLElBQUksSUFBSSxJQUFJO0FBQ3ZEO0FBRUEsU0FBUyxpQkFBaUIsT0FBb0M7QUFDN0QsTUFBSSxVQUFVLFVBQWEsVUFBVSxNQUFNO0FBQzFDLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUk7QUFDSCxXQUFPLEtBQUssVUFBVSxPQUFPLFFBQVcsQ0FBQztBQUFBLEVBQzFDLFFBQVE7QUFDUCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxTQUFTLE9BQTJCLEtBQWlDO0FBQzdFLE1BQUksVUFBVSxRQUFXO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxNQUFNLFNBQVMsTUFBTSxNQUFNLE1BQU0sR0FBRyxHQUFHLElBQUksV0FBTTtBQUN6RDtBQUdBLFNBQVMsVUFBVSxTQUF5QjtBQUMzQyxRQUFNLFlBQVksUUFBUSxNQUFNLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLE9BQUssRUFBRSxTQUFTLENBQUMsS0FBSztBQUNwRixTQUFPLFVBQVUsU0FBUyxNQUFNLFVBQVUsTUFBTSxHQUFHLEdBQUcsSUFBSSxXQUFNO0FBQ2pFO0FBRUEsU0FBUyxlQUFlLEtBQXNCO0FBQzdDLFNBQU8sZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUc7QUFDdkQ7IiwKICAibmFtZXMiOiBbImxhc3ROZXdsaW5lIl0KfQo=
