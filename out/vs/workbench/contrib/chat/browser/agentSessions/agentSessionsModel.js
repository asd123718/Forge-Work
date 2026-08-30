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
import { ThrottledDelayer } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { safeStringify } from "../../../../../base/common/objects.js";
import { derived, observableSignalFromEvent } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { Extensions, IOutputService } from "../../../../services/output/common/output.js";
import { ChatSessionStatus as AgentSessionStatus, IChatSessionsService, isSessionInProgressStatus } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatWidgetService } from "../chat.js";
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId } from "../copilotCliEventsUri.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName, isAgentHostTarget, isBuiltInAgentSessionProvider } from "./agentSessions.js";
import { ChatSessionStatus, isSessionInProgressStatus as isSessionInProgressStatus2 } from "../../common/chatSessionsService.js";
function hasValidDiff(changes) {
  if (!changes) {
    return false;
  }
  if (changes instanceof Array) {
    return changes.length > 0;
  }
  return changes.files > 0 || changes.insertions > 0 || changes.deletions > 0;
}
function getAgentChangesSummary(changes) {
  if (!changes) {
    return;
  }
  if (!(changes instanceof Array)) {
    return changes;
  }
  let insertions = 0;
  let deletions = 0;
  for (const change of changes) {
    insertions += change.insertions;
    deletions += change.deletions;
  }
  return { files: changes.length, insertions, deletions };
}
function isLocalAgentSessionItem(session) {
  return session.providerType === AgentSessionProviders.Local;
}
function getAgentSessionPullRequestUri(session) {
  const metadata = session.metadata;
  if (!metadata) {
    return void 0;
  }
  const url = metadata.pullRequestUrl;
  if (typeof url === "string" && url) {
    try {
      return URI.parse(url);
    } catch {
    }
  }
  const prNumber = metadata.pullRequestNumber;
  const owner = metadata.owner;
  const name = metadata.name;
  if (typeof prNumber === "number" && typeof owner === "string" && owner && typeof name === "string" && name) {
    return URI.parse(`https://github.com/${owner}/${name}/pull/${prNumber}`);
  }
  return void 0;
}
function getAgentSessionPullRequestContextValue(session) {
  return getAgentSessionPullRequestUri(session) ? "available" : "none";
}
function isAgentHostAgentSessionItem(session) {
  return isAgentHostTarget(session.providerType);
}
function isAgentSession(obj) {
  const session = obj;
  return URI.isUri(session?.resource) && typeof session.isArchived === "function" && typeof session.setArchived === "function" && typeof session.isPinned === "function" && typeof session.setPinned === "function" && typeof session.isRead === "function" && typeof session.isMarkedUnread === "function" && typeof session.setRead === "function";
}
function isAgentSessionsModel(obj) {
  const sessionsModel = obj;
  return Array.isArray(sessionsModel?.sessions) && typeof sessionsModel?.getSession === "function";
}
function countUnreadSessions(sessions) {
  let unread = 0;
  for (const session of sessions) {
    if (!session.isArchived() && session.status === AgentSessionStatus.Completed && !session.isRead()) {
      unread++;
    }
  }
  return unread;
}
var AgentSessionSection = /* @__PURE__ */ ((AgentSessionSection2) => {
  AgentSessionSection2["Pinned"] = "pinned";
  AgentSessionSection2["Today"] = "today";
  AgentSessionSection2["Yesterday"] = "yesterday";
  AgentSessionSection2["Week"] = "week";
  AgentSessionSection2["Older"] = "older";
  AgentSessionSection2["Archived"] = "archived";
  AgentSessionSection2["More"] = "more";
  AgentSessionSection2["Repository"] = "repository";
  return AgentSessionSection2;
})(AgentSessionSection || {});
function isAgentSessionSection(obj) {
  const candidate = obj;
  return typeof candidate.section === "string" && Array.isArray(candidate.sessions);
}
function isAgentSessionShowMore(obj) {
  return obj?.showMore === true;
}
function isAgentSessionShowLess(obj) {
  return obj?.showLess === true;
}
function isMarshalledAgentSessionContext(thing) {
  if (typeof thing === "object" && thing !== null) {
    const candidate = thing;
    return candidate.$mid === MarshalledId.AgentSessionContext && typeof candidate.session === "object" && candidate.session !== null;
  }
  return false;
}
const agentSessionsOutputChannelId = "agentSessionsOutput";
const agentSessionsOutputChannelLabel = localize("agentSessionsOutput", "Agent Sessions");
function statusToString(status) {
  switch (status) {
    case AgentSessionStatus.Failed:
      return "Failed";
    case AgentSessionStatus.Completed:
      return "Completed";
    case AgentSessionStatus.InProgress:
      return "InProgress";
    case AgentSessionStatus.NeedsInput:
      return "NeedsInput";
    default:
      return `Unknown(${status})`;
  }
}
let AgentSessionsLogger = class extends Disposable {
  constructor(getSessionsData, logService, outputService, chatEntitlementService) {
    super();
    this.getSessionsData = getSessionsData;
    this.logService = logService;
    this.outputService = outputService;
    this.chatEntitlementService = chatEntitlementService;
    this.isChannelRegistered = false;
    this.updateChannelRegistration();
    this.registerListeners();
  }
  updateChannelRegistration() {
    const chatDisabled = this.chatEntitlementService.sentiment.hidden;
    if (chatDisabled && this.isChannelRegistered) {
      Registry.as(Extensions.OutputChannels).removeChannel(agentSessionsOutputChannelId);
      this.isChannelRegistered = false;
    } else if (!chatDisabled && !this.isChannelRegistered) {
      Registry.as(Extensions.OutputChannels).registerChannel({
        id: agentSessionsOutputChannelId,
        label: agentSessionsOutputChannelLabel,
        log: false
      });
      this.isChannelRegistered = true;
    }
  }
  registerListeners() {
    this._register(this.logService.onDidChangeLogLevel((level) => {
      if (level === LogLevel.Trace) {
        this.logAllStatsIfTrace("Log level changed to trace");
      }
    }));
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
      this.updateChannelRegistration();
    }));
  }
  logIfTrace(msg) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    this.trace(`[Agent Sessions] ${msg}`);
  }
  logAllStatsIfTrace(reason) {
    if (this.logService.getLevel() !== LogLevel.Trace) {
      return;
    }
    this.logAllSessions(reason);
    this.logSessionStates();
  }
  logAllSessions(reason) {
    const { sessions, sessionStates } = this.getSessionsData();
    const lines = [];
    lines.push(`=== Agent Sessions (${reason}) ===`);
    let count = 0;
    for (const session of sessions) {
      count++;
      const state = sessionStates.get(session.resource);
      lines.push(`--- Session: ${session.label} ---`);
      lines.push(`  Resource: ${session.resource.toString()}`);
      lines.push(`  Provider Type: ${session.providerType}`);
      lines.push(`  Provider Label: ${session.providerLabel}`);
      lines.push(`  Status: ${statusToString(session.status)}`);
      lines.push(`  Icon: ${session.icon.id}`);
      if (session.description) {
        lines.push(`  Description: ${typeof session.description === "string" ? session.description : session.description.value}`);
      }
      if (session.badge) {
        lines.push(`  Badge: ${typeof session.badge === "string" ? session.badge : session.badge.value}`);
      }
      if (session.tooltip) {
        lines.push(`  Tooltip: ${typeof session.tooltip === "string" ? session.tooltip : session.tooltip.value}`);
      }
      lines.push(`  Timing:`);
      lines.push(`    Created: ${session.timing.created ? new Date(session.timing.created).toISOString() : "N/A"}`);
      lines.push(`    Last Request Started: ${session.timing.lastRequestStarted ? new Date(session.timing.lastRequestStarted).toISOString() : "N/A"}`);
      lines.push(`    Last Request Ended: ${session.timing.lastRequestEnded ? new Date(session.timing.lastRequestEnded).toISOString() : "N/A"}`);
      if (session.changes) {
        const summary = getAgentChangesSummary(session.changes);
        if (summary) {
          lines.push(`  Changes: ${summary.files} files, +${summary.insertions} -${summary.deletions}`);
        }
      }
      if (session.metadata && Object.keys(session.metadata).length > 0) {
        lines.push(`  Metadata:`);
        for (const [key, value] of Object.entries(session.metadata)) {
          const renderedValue = typeof value === "string" ? value : safeStringify(value);
          lines.push(`    ${key}: ${renderedValue}`);
        }
      }
      lines.push(`  State:`);
      lines.push(`    Archived (provider): ${session.archived ?? "N/A"}`);
      lines.push(`    Archived (computed): ${session.isArchived()}`);
      lines.push(`    Archived (stored): ${state?.archived ?? "N/A"}`);
      lines.push(`    Pinned: ${session.isPinned()}`);
      lines.push(`    Pinned (stored): ${state?.pinned ?? "N/A"}`);
      lines.push(`    Read: ${session.isRead()}`);
      lines.push(`    Read date (stored): ${state?.read ? new Date(state.read).toISOString() : "N/A"}`);
      lines.push("");
    }
    lines.unshift(`Total sessions: ${count}`, "");
    lines.push(`=== End Agent Sessions ===`);
    this.trace(lines.join("\n"));
  }
  logSessionStates() {
    const { sessionStates } = this.getSessionsData();
    const lines = [];
    lines.push(`=== Session States ===`);
    lines.push(`Total stored states: ${sessionStates.size}`);
    lines.push("");
    for (const [resource, state] of sessionStates) {
      lines.push(`URI: ${resource.toString()}`);
      lines.push(`  Archived: ${state.archived}`);
      lines.push(`  Pinned: ${state.pinned}`);
      lines.push(`  Read: ${state.read ? new Date(state.read).toISOString() : "0 (unread)"}`);
      lines.push("");
    }
    lines.push(`=== End Session States ===`);
    this.trace(lines.join("\n"));
  }
  trace(msg) {
    const channel = this.outputService.getChannel(agentSessionsOutputChannelId);
    if (!channel) {
      return;
    }
    channel.append(`${msg}
`);
  }
};
AgentSessionsLogger = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IOutputService),
  __decorateParam(3, IChatEntitlementService)
], AgentSessionsLogger);
let AgentSessionsModel = class extends Disposable {
  constructor(chatSessionsService, lifecycleService, instantiationService, storageService, productService, chatWidgetService, workspaceContextService, workspaceTrustManagementService, chatEntitlementService) {
    super();
    this.chatSessionsService = chatSessionsService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.productService = productService;
    this.chatWidgetService = chatWidgetService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.chatEntitlementService = chatEntitlementService;
    this._onWillResolve = this._register(new Emitter());
    this.onWillResolve = this._onWillResolve.event;
    this._onDidResolve = this._register(new Emitter());
    this.onDidResolve = this._onDidResolve.event;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidChangeSessionArchivedState = this._register(new Emitter());
    this.onDidChangeSessionArchivedState = this._onDidChangeSessionArchivedState.event;
    this._resolved = false;
    this.resolvers = this._register(new DisposableMap());
    this._sessionObservables = new ResourceMap();
    this._resolvedResources = new ResourceSet();
    this.explicitlyMarkedUnreadSessions = new ResourceSet();
    this.migratedReadResources = new ResourceSet();
    this._sessions = new ResourceMap();
    this.cache = this.instantiationService.createInstance(AgentSessionsCache);
    for (const data of this.cache.loadCachedSessions()) {
      const session = this.toAgentSession(data);
      this._sessions.set(session.resource, session);
    }
    this.sessionStates = this.cache.loadSessionStates();
    this.logger = this._register(this.instantiationService.createInstance(
      AgentSessionsLogger,
      () => ({
        sessions: this._sessions.values(),
        sessionStates: this.sessionStates
      })
    ));
    this.logger.logAllStatsIfTrace("Loaded cached sessions");
    this.readDateBaseline = this.resolveReadDateBaseline();
    this.loadMigratedReadResources();
    this.registerListeners();
  }
  get resolved() {
    return this._resolved;
  }
  get sessions() {
    return this._dedupeMigratedCopilotCliSessions(Array.from(this._sessions.values()));
  }
  registerListeners() {
    this._register(this.chatSessionsService.onDidChangeItemsProviders(({ chatSessionType }) => this.resolve(chatSessionType)));
    this._register(this.chatSessionsService.onDidChangeAvailability(() => this.resolve(void 0)));
    this._register(this.chatSessionsService.onDidChangeSessionItems((delta) => {
      const changedChatSessionTypes = /* @__PURE__ */ new Set();
      for (const resource of delta.addedOrUpdated ?? []) {
        changedChatSessionTypes.add(getChatSessionType(resource.resource));
      }
      for (const resource of delta.removed ?? []) {
        changedChatSessionTypes.add(getChatSessionType(resource));
      }
      for (const chatSessionType of changedChatSessionTypes) {
        this.resolveProvider(chatSessionType, {
          refreshProvider: false
          /* skip because we react on an event already */
        });
      }
    }));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.resolve(void 0)));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this.resolve(void 0)));
    this._register(this.storageService.onWillSaveState(() => {
      this.cache.saveCachedSessions(Array.from(this._sessions.values()));
      this.cache.saveSessionStates(this.sessionStates);
    }));
  }
  getSession(resource) {
    return this._sessions.get(resource);
  }
  /**
   * Hide the extension-host `copilotcli:` row when its agent-host
   * `agent-host-copilotcli:` twin is present, so the list shows a single entry
   * per legacy Copilot CLI session — the agent-host one, which migrates on open.
   * Only display is deduped; {@link getSession} and the cache use the full map so
   * a hidden row can still resolve.
   */
  _dedupeMigratedCopilotCliSessions(sessions) {
    let migratedRawIds;
    for (const session of sessions) {
      if (session.resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
        const rawId = getCopilotCliSessionRawId(session.resource);
        if (rawId) {
          (migratedRawIds ??= /* @__PURE__ */ new Set()).add(rawId);
        }
      }
    }
    if (!migratedRawIds) {
      return sessions;
    }
    return sessions.filter((session) => {
      if (session.resource.scheme === COPILOT_CLI_EH_SCHEME) {
        const rawId = getCopilotCliSessionRawId(session.resource);
        if (rawId && migratedRawIds.has(rawId)) {
          return false;
        }
      }
      return true;
    });
  }
  observeSession(resource) {
    if (!this._resolvedResources.has(resource)) {
      this._resolvedResources.add(resource);
      const sessionType = getChatSessionType(resource);
      this.chatSessionsService.resolveChatSessionItem(sessionType, resource, CancellationToken.None).catch((error) => this.logger.logIfTrace(`observeSession: resolve failed for ${resource.toString()}: ${error instanceof Error ? error.message : String(error)}`));
    }
    let observable = this._sessionObservables.get(resource);
    if (!observable) {
      this._changedSignal ??= observableSignalFromEvent("agentSessionsChanged", this.onDidChangeSessions);
      const signal = this._changedSignal;
      observable = derived((reader) => {
        signal.read(reader);
        return this._sessions.get(resource);
      });
      this._sessionObservables.set(resource, observable);
    }
    return observable;
  }
  async resolve(provider) {
    const providers = Array.isArray(provider) ? provider : provider !== void 0 ? [provider] : this.chatSessionsService.getRegisteredChatSessionItemProviders();
    await Promise.all(providers.map((provider2) => this.resolveProvider(provider2, { refreshProvider: true })));
  }
  resolveProvider(provider, options) {
    if (this.chatEntitlementService.sentiment.hidden) {
      return Promise.resolve();
    }
    let resolver = this.resolvers.get(provider);
    if (!resolver) {
      resolver = new ThrottledDelayer(500);
      this.resolvers.set(provider, resolver);
    }
    return resolver.trigger(async (token) => {
      if (token.isCancellationRequested || this.lifecycleService.willShutdown) {
        return;
      }
      try {
        this._onWillResolve.fire(provider);
        return await this.doResolveProvider(provider, options, token);
      } catch (error) {
        this.logger.logIfTrace(`Error resolving sessions for provider ${provider}: ${error instanceof Error ? error.stack : String(error)}`);
      } finally {
        this._onDidResolve.fire(provider);
      }
    });
  }
  async doResolveProvider(provider, options, token) {
    if (options.refreshProvider) {
      await this.chatSessionsService.refreshChatSessionItems([provider], token);
      for (const resource of [...this._resolvedResources]) {
        if (getChatSessionType(resource) === provider) {
          this._resolvedResources.delete(resource);
          if (this._sessionObservables.has(resource)) {
            this.observeSession(resource);
          }
        }
      }
    }
    const mapSessionContributionToType = /* @__PURE__ */ new Map();
    for (const contribution of this.chatSessionsService.getAllChatSessionContributions()) {
      mapSessionContributionToType.set(contribution.type, contribution);
    }
    const sessions = new ResourceMap();
    for await (const { chatSessionType, items: providerSessions } of this.chatSessionsService.getChatSessionItems([provider], token)) {
      if (token.isCancellationRequested) {
        return;
      }
      for (const session of providerSessions) {
        let icon;
        let providerLabel;
        const agentSessionProvider = getAgentSessionProvider(chatSessionType);
        if (agentSessionProvider !== void 0) {
          providerLabel = getAgentSessionProviderName(agentSessionProvider);
          icon = getAgentSessionProviderIcon(agentSessionProvider);
        } else {
          providerLabel = mapSessionContributionToType.get(chatSessionType)?.name ?? chatSessionType;
          icon = session.iconPath ?? Codicon.terminal;
        }
        const changes = session.changes ?? getAgentChangesSummary(this._sessions.get(session.resource)?.changes);
        const normalizedChanges = changes && !(changes instanceof Array) ? { files: changes.files, insertions: changes.insertions, deletions: changes.deletions } : changes;
        const shouldKeepOpenSessionRead = session.isRead === false && this.chatSessionsService.canSetChatSessionItemRead(session.resource) && !this.explicitlyMarkedUnreadSessions.has(session.resource) && !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
        if (shouldKeepOpenSessionRead) {
          this.chatSessionsService.setChatSessionItemRead(session.resource, true);
        }
        if (session.isRead) {
          this.explicitlyMarkedUnreadSessions.delete(session.resource);
        }
        sessions.set(session.resource, this.toAgentSession({
          providerType: chatSessionType,
          providerLabel,
          resource: session.resource,
          label: session.label.split("\n")[0],
          // protect against weird multi-line labels that break our layout
          description: session.description,
          icon,
          badge: session.badge,
          tooltip: session.tooltip,
          status: session.status ?? AgentSessionStatus.Completed,
          archived: session.archived,
          providerIsRead: shouldKeepOpenSessionRead ? true : session.isRead,
          timing: session.timing,
          changes: normalizedChanges,
          metadata: session.metadata,
          legacyResource: session.legacyResource
        }));
      }
    }
    for (const [, session] of this._sessions) {
      if (session.providerType !== provider && !sessions.has(session.resource) && (isBuiltInAgentSessionProvider(session.providerType) || mapSessionContributionToType.has(session.providerType))) {
        sessions.set(session.resource, session);
      }
    }
    for (const resource of this.explicitlyMarkedUnreadSessions) {
      if (!sessions.has(resource)) {
        this.explicitlyMarkedUnreadSessions.delete(resource);
      }
    }
    const sessionsWithChangedArchivedState = [];
    for (const [, session] of sessions) {
      const previousSession = this._sessions.get(session.resource);
      if (previousSession && this.isArchived(previousSession) !== this.isArchived(session)) {
        sessionsWithChangedArchivedState.push(session);
      }
    }
    this._sessions = sessions;
    this._resolved = true;
    this.migrateReadStateToProvider(sessions.values());
    this.logger.logAllStatsIfTrace("Sessions resolved from providers");
    for (const session of sessionsWithChangedArchivedState) {
      this._onDidChangeSessionArchivedState.fire(session);
    }
    this._onDidChangeSessions.fire();
  }
  toAgentSession(data) {
    return {
      ...data,
      isArchived: () => this.isArchived(data),
      setArchived: (archived) => this.setArchived(data, archived),
      isPinned: () => this.isPinned(data),
      setPinned: (pinned) => this.setPinned(data, pinned),
      isRead: () => this.isRead(data),
      isMarkedUnread: () => this.isMarkedUnread(data),
      setRead: (read) => this.setRead(data, read)
    };
  }
  /**
   * Resolve the state entry for a session, honoring a one-way migration from
   * {@link IAgentSessionData.legacyResource} when no entry yet exists for the
   * session's current resource. Adopts the legacy entry forward (copies it onto
   * the current resource key and removes the legacy entry). Returns undefined if
   * neither a current nor a legacy entry exists.
   */
  resolveStateEntry(session) {
    const own = this.sessionStates.get(session.resource);
    if (own !== void 0) {
      return own;
    }
    const legacy = session.legacyResource;
    if (!legacy) {
      return void 0;
    }
    if (legacy.scheme !== session.resource.scheme || legacy.toString() === session.resource.toString()) {
      return void 0;
    }
    const prev = this.sessionStates.get(legacy);
    if (prev === void 0) {
      return void 0;
    }
    this.sessionStates.set(session.resource, { ...prev });
    this.sessionStates.delete(legacy);
    return this.sessionStates.get(session.resource);
  }
  isArchived(session) {
    if (this.chatSessionsService.canSetChatSessionItemArchived(session.resource)) {
      return Boolean(session.archived);
    }
    return this.resolveStateEntry(session)?.archived ?? Boolean(session.archived);
  }
  setArchived(session, archived) {
    if (archived) {
      this.setRead(session, true);
    }
    if (archived === this.isArchived(session)) {
      return;
    }
    if (this.chatSessionsService.canSetChatSessionItemArchived(session.resource)) {
      this.chatSessionsService.setChatSessionItemArchived(session.resource, archived);
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    this.sessionStates.set(session.resource, { ...state, archived });
    const agentSession = this._sessions.get(session.resource);
    if (agentSession) {
      this._onDidChangeSessionArchivedState.fire(agentSession);
    }
    this._onDidChangeSessions.fire();
  }
  isPinned(session) {
    return this.resolveStateEntry(session)?.pinned ?? false;
  }
  setPinned(session, pinned) {
    if (pinned === this.isPinned(session)) {
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    this.sessionStates.set(session.resource, { ...state, pinned });
    this._onDidChangeSessions.fire();
  }
  isMarkedUnread(session) {
    if (this.ownsReadState(session)) {
      return !this.isRead(session);
    }
    return this.resolveStateEntry(session)?.read === AgentSessionsModel.UNREAD_MARKER;
  }
  /**
   * Whether the session's provider owns read state. When it does the value is
   * shared with every other client on the same backend (the agent window, or
   * another window on the same agent host), so the local heuristics below must
   * not second-guess it.
   */
  ownsReadState(session) {
    return this.chatSessionsService.canSetChatSessionItemRead(session.resource);
  }
  isRead(session) {
    if (this.isArchived(session)) {
      return true;
    }
    if (this.ownsReadState(session)) {
      return session.providerIsRead ?? true;
    }
    const storedReadDate = this.resolveStateEntry(session)?.read;
    if (storedReadDate === AgentSessionsModel.UNREAD_MARKER) {
      return false;
    }
    if (this.localReadDateCoversActivity(session, storedReadDate)) {
      return true;
    }
    return !!this.chatWidgetService.getWidgetBySessionResource(session.resource);
  }
  /**
   * Whether the locally-stored read timestamp covers the session's last
   * activity. Falls back to the read-date baseline when nothing is stored.
   */
  localReadDateCoversActivity(session, storedReadDate) {
    const readDate = Math.max(storedReadDate ?? 0, this.readDateBaseline);
    return readDate >= this.sessionTimeForReadStateTracking(session) - AgentSessionsModel.READ_GRACE_WINDOW;
  }
  sessionTimeForReadStateTracking(session) {
    return session.timing.lastRequestEnded ?? session.timing.created;
  }
  setRead(session, read, skipEvent) {
    if (this.ownsReadState(session)) {
      if (read) {
        this.explicitlyMarkedUnreadSessions.delete(session.resource);
      } else {
        this.explicitlyMarkedUnreadSessions.add(session.resource);
      }
      if (read === (session.providerIsRead ?? true)) {
        return;
      }
      this.chatSessionsService.setChatSessionItemRead(session.resource, read);
      return;
    }
    const state = this.resolveStateEntry(session) ?? {};
    let newRead;
    if (read) {
      newRead = Math.max(Date.now(), this.sessionTimeForReadStateTracking(session));
      if (typeof state.read === "number" && state.read >= newRead) {
        return;
      }
    } else {
      newRead = AgentSessionsModel.UNREAD_MARKER;
      if (state.read === AgentSessionsModel.UNREAD_MARKER) {
        return;
      }
    }
    this.sessionStates.set(session.resource, { ...state, read: newRead });
    if (!skipEvent) {
      this._onDidChangeSessions.fire();
    }
  }
  /**
   * One-time hand-off of locally-tracked read state to providers that own it,
   * so sessions read before the provider took ownership don't all resurface as
   * unread. Only ever promotes to read, and runs at most once per session so a
   * later "Mark as Unread" is not undone on the next refresh.
   *
   * The ledger is application-scoped even though the local state it hands off
   * is per-workspace: the provider-owned state it writes to is global, so a
   * second workspace that can see the same session (an empty window lists them
   * all) must not migrate it again and re-promote a deliberate "Mark as Unread".
   */
  migrateReadStateToProvider(sessions) {
    let changed = false;
    for (const session of sessions) {
      if (this.migratedReadResources.has(session.resource) || !this.ownsReadState(session)) {
        continue;
      }
      if (session.providerIsRead === void 0) {
        continue;
      }
      this.migratedReadResources.add(session.resource);
      changed = true;
      if (session.providerIsRead) {
        continue;
      }
      const storedReadDate = this.resolveStateEntry(session)?.read;
      if (storedReadDate === AgentSessionsModel.UNREAD_MARKER) {
        continue;
      }
      if (this.localReadDateCoversActivity(session, storedReadDate)) {
        this.chatSessionsService.setChatSessionItemRead(session.resource, true);
      }
    }
    if (changed) {
      this.storageService.store(
        AgentSessionsModel.READ_MIGRATION_DONE_KEY,
        JSON.stringify(Array.from(this.migratedReadResources).map((resource) => resource.toString())),
        StorageScope.APPLICATION,
        StorageTarget.MACHINE
      );
    }
  }
  loadMigratedReadResources() {
    const raw = this.storageService.get(AgentSessionsModel.READ_MIGRATION_DONE_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return;
    }
    try {
      for (const entry of JSON.parse(raw)) {
        this.migratedReadResources.add(URI.parse(entry));
      }
    } catch {
    }
  }
  resolveReadDateBaseline() {
    let readDateBaseline = this.storageService.getNumber(AgentSessionsModel.READ_DATE_BASELINE_KEY, StorageScope.WORKSPACE, 0);
    if (readDateBaseline > 0) {
      return readDateBaseline;
    }
    readDateBaseline = this.productService.quality === "stable" ? Date.now() - 7 * 24 * 60 * 60 * 1e3 : Date.now();
    this.storageService.store(AgentSessionsModel.READ_DATE_BASELINE_KEY, readDateBaseline, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    return readDateBaseline;
  }
  //#endregion
};
//#region States
AgentSessionsModel.UNREAD_MARKER = -1;
/** Grace window absorbing a click away from a session just before it finishes. */
AgentSessionsModel.READ_GRACE_WINDOW = 2e3;
AgentSessionsModel.READ_MIGRATION_DONE_KEY = "agentSessions.providerReadMigration";
AgentSessionsModel.READ_DATE_BASELINE_KEY = "agentSessions.readDateBaseline2";
AgentSessionsModel = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IChatEntitlementService)
], AgentSessionsModel);
let AgentSessionsCache = class {
  constructor(storageService) {
    this.storageService = storageService;
  }
  //#region Sessions
  saveCachedSessions(sessions) {
    const serialized = sessions.map((session) => ({
      providerType: session.providerType,
      providerLabel: session.providerLabel,
      resource: session.resource.toString(),
      icon: session.icon.id,
      label: session.label,
      description: session.description,
      badge: session.badge,
      tooltip: session.tooltip,
      status: isSessionInProgressStatus(session.status) ? AgentSessionStatus.Completed : session.status,
      // never cache sessions as in progress, this needs to be live state
      archived: session.archived,
      isRead: session.providerIsRead,
      timing: session.timing,
      changes: getAgentChangesSummary(session.changes),
      metadata: session.metadata,
      legacyResource: session.legacyResource?.toString()
    }));
    this.storageService.store(AgentSessionsCache.SESSIONS_STORAGE_KEY, safeStringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  loadCachedSessions() {
    const sessionsCache = this.storageService.get(AgentSessionsCache.SESSIONS_STORAGE_KEY, StorageScope.WORKSPACE);
    if (!sessionsCache) {
      return [];
    }
    try {
      const cached = JSON.parse(sessionsCache);
      return cached.map((session) => ({
        providerType: session.providerType,
        providerLabel: session.providerLabel,
        resource: typeof session.resource === "string" ? URI.parse(session.resource) : URI.revive(session.resource),
        icon: ThemeIcon.fromId(session.icon),
        label: session.label,
        description: session.description,
        badge: session.badge,
        tooltip: session.tooltip,
        status: session.status,
        archived: session.archived,
        providerIsRead: session.isRead,
        timing: {
          created: session.timing.created ?? 0,
          lastRequestStarted: session.timing.lastRequestStarted,
          lastRequestEnded: session.timing.lastRequestEnded
        },
        changes: getAgentChangesSummary(session.changes),
        metadata: session.metadata,
        legacyResource: session.legacyResource ? URI.parse(session.legacyResource) : void 0
      }));
    } catch {
      return [];
    }
  }
  //#endregion
  //#region States
  saveSessionStates(states) {
    const serialized = Array.from(states.entries()).map(([resource, state]) => ({
      resource: resource.toString(),
      archived: state.archived,
      pinned: state.pinned,
      read: state.read
    }));
    this.storageService.store(AgentSessionsCache.STATE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  loadSessionStates() {
    const states = new ResourceMap();
    const statesCache = this.storageService.get(AgentSessionsCache.STATE_STORAGE_KEY, StorageScope.WORKSPACE);
    if (!statesCache) {
      return states;
    }
    try {
      const cached = JSON.parse(statesCache);
      for (const entry of cached) {
        states.set(typeof entry.resource === "string" ? URI.parse(entry.resource) : URI.revive(entry.resource), {
          archived: entry.archived,
          pinned: entry.pinned,
          read: entry.read
        });
      }
    } catch {
    }
    return states;
  }
  //#endregion
};
AgentSessionsCache.SESSIONS_STORAGE_KEY = "agentSessions.model.cache";
AgentSessionsCache.STATE_STORAGE_KEY = "agentSessions.state.cache";
AgentSessionsCache = __decorateClass([
  __decorateParam(0, IStorageService)
], AgentSessionsCache);
export {
  AgentSessionSection,
  ChatSessionStatus as AgentSessionStatus,
  AgentSessionsCache,
  AgentSessionsModel,
  countUnreadSessions,
  getAgentChangesSummary,
  getAgentSessionPullRequestContextValue,
  getAgentSessionPullRequestUri,
  hasValidDiff,
  isAgentHostAgentSessionItem,
  isAgentSession,
  isAgentSessionSection,
  isAgentSessionShowLess,
  isAgentSessionShowMore,
  isAgentSessionsModel,
  isLocalAgentSessionItem,
  isMarshalledAgentSessionContext,
  isSessionInProgressStatus2 as isSessionInProgressStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbnNNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBzYWZlU3RyaW5naWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBMb2dMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSU91dHB1dENoYW5uZWxSZWdpc3RyeSwgSU91dHB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL291dHB1dC5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0YXR1cyBhcyBBZ2VudFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UsIElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cywgUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9DTElfRUhfU0NIRU1FLCBDT1BJTE9UX0NMSV9MT0NBTF9BSF9TQ0hFTUUsIGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQgfSBmcm9tICcuLi9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycywgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lLCBpc0FnZW50SG9zdFRhcmdldCwgaXNCdWlsdEluQWdlbnRTZXNzaW9uUHJvdmlkZXIgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMuanMnO1xuXG4vLyNyZWdpb24gSW50ZXJmYWNlcywgVHlwZXNcblxuZXhwb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMgYXMgQWdlbnRTZXNzaW9uU3RhdHVzLCBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNlc3Npb25zTW9kZWwge1xuXG5cdHJlYWRvbmx5IG9uV2lsbFJlc29sdmU6IEV2ZW50PHN0cmluZyAvKiBwcm92aWRlciAqLz47XG5cdHJlYWRvbmx5IG9uRGlkUmVzb2x2ZTogRXZlbnQ8c3RyaW5nIC8qIHByb3ZpZGVyICovPjtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogRXZlbnQ8SUFnZW50U2Vzc2lvbj47XG5cblx0cmVhZG9ubHkgcmVzb2x2ZWQ6IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXTtcblx0Z2V0U2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBvYnNlcnZhYmxlIHRoYXQgZW1pdHMgdGhlIGxhdGVzdCB7QGxpbmsgSUFnZW50U2Vzc2lvbn0gZm9yIHRoZVxuXHQgKiBnaXZlbiByZXNvdXJjZSAob3IgYHVuZGVmaW5lZGAgaWYgbm8gc2Vzc2lvbiBpcyBjdXJyZW50bHkga25vd24pLlxuXHQgKlxuXHQgKiBUaGUgb2JzZXJ2YWJsZSB1cGRhdGVzIHdoZW5ldmVyIHRoZSB1bmRlcmx5aW5nIHNlc3Npb24gY29sbGVjdGlvbiBjaGFuZ2VzLlxuXHQgKiBUaGUgZmlyc3QgY2FsbCBmb3IgYSBnaXZlbiByZXNvdXJjZSBsYXppbHkgdHJpZ2dlcnNcblx0ICoge0BsaW5rIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW19IHNvIGNvbnN1bWVycyByZWFkaW5nXG5cdCAqIGxhenkgcHJvcGVydGllcyAoZS5nLiBgY2hhbmdlc2ApIHNlZSBmcmVzaCB2YWx1ZXMgb25jZSB0aGUgcHJvdmlkZXIgaGFzXG5cdCAqIHJlc29sdmVkIHRoZW0uIEluLWZsaWdodCByZXNvbHZlcyBhcmUgZGVkdXBsaWNhdGVkIGJ5IHRoZSBjaGF0IHNlc3Npb25zXG5cdCAqIHNlcnZpY2UuXG5cdCAqL1xuXHRvYnNlcnZlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0cmVzb2x2ZShwcm92aWRlcjogc3RyaW5nIHwgc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUFnZW50U2Vzc2lvbkRhdGEgZXh0ZW5kcyBPbWl0PElDaGF0U2Vzc2lvbkl0ZW0sICdhcmNoaXZlZCcgfCAnaWNvblBhdGgnIHwgJ2lzUmVhZCc+IHtcblxuXHRyZWFkb25seSBwcm92aWRlclR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJMYWJlbDogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cblx0cmVhZG9ubHkgc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXM7XG5cblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblxuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgYmFkZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblxuXHRyZWFkb25seSB0aW1pbmc6IElDaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddO1xuXG5cdHJlYWRvbmx5IGNoYW5nZXM/OiBJQ2hhdFNlc3Npb25JdGVtWydjaGFuZ2VzJ107XG59XG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBwcm92aWRlZCBjaGFuZ2VzIG9iamVjdCByZXByZXNlbnRzIHZhbGlkIGRpZmYgaW5mb3JtYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNWYWxpZERpZmYoY2hhbmdlczogSUFnZW50U2Vzc2lvblsnY2hhbmdlcyddKTogYm9vbGVhbiB7XG5cdGlmICghY2hhbmdlcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChjaGFuZ2VzIGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRyZXR1cm4gY2hhbmdlcy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cmV0dXJuIGNoYW5nZXMuZmlsZXMgPiAwIHx8IGNoYW5nZXMuaW5zZXJ0aW9ucyA+IDAgfHwgY2hhbmdlcy5kZWxldGlvbnMgPiAwO1xufVxuXG4vKipcbiAqIEdldHMgYSBzdW1tYXJ5IG9mIGFnZW50IHNlc3Npb24gY2hhbmdlcywgY29udmVydGluZyBmcm9tIGFycmF5IGZvcm1hdCB0byBvYmplY3QgZm9ybWF0IGlmIG5lZWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoY2hhbmdlczogSUFnZW50U2Vzc2lvblsnY2hhbmdlcyddKSB7XG5cdGlmICghY2hhbmdlcykge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGlmICghKGNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcblx0XHRyZXR1cm4gY2hhbmdlcztcblx0fVxuXG5cdGxldCBpbnNlcnRpb25zID0gMDtcblx0bGV0IGRlbGV0aW9ucyA9IDA7XG5cdGZvciAoY29uc3QgY2hhbmdlIG9mIGNoYW5nZXMpIHtcblx0XHRpbnNlcnRpb25zICs9IGNoYW5nZS5pbnNlcnRpb25zO1xuXHRcdGRlbGV0aW9ucyArPSBjaGFuZ2UuZGVsZXRpb25zO1xuXHR9XG5cblx0cmV0dXJuIHsgZmlsZXM6IGNoYW5nZXMubGVuZ3RoLCBpbnNlcnRpb25zLCBkZWxldGlvbnMgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTZXNzaW9uIGV4dGVuZHMgSUFnZW50U2Vzc2lvbkRhdGEge1xuXHRpc0FyY2hpdmVkKCk6IGJvb2xlYW47XG5cdHNldEFyY2hpdmVkKGFyY2hpdmVkOiBib29sZWFuKTogdm9pZDtcblxuXHRpc1Bpbm5lZCgpOiBib29sZWFuO1xuXHRzZXRQaW5uZWQocGlubmVkOiBib29sZWFuKTogdm9pZDtcblxuXHRpc1JlYWQoKTogYm9vbGVhbjtcblx0aXNNYXJrZWRVbnJlYWQoKTogYm9vbGVhbjtcblx0c2V0UmVhZChyZWFkOiBib29sZWFuKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEgZXh0ZW5kcyBJQWdlbnRTZXNzaW9uRGF0YSB7XG5cblx0LyoqXG5cdCAqIFRoZSBgYXJjaGl2ZWRgIHByb3BlcnR5IGlzIHByb3ZpZGVkIGJ5IHRoZSBzZXNzaW9uIHByb3ZpZGVyXG5cdCAqIGFuZCB3aWxsIGJlIHVzZWQgYXMgdGhlIGluaXRpYWwgdmFsdWUgaWYgdGhlIHVzZXIgaGFzIG5vdFxuXHQgKiBjaGFuZ2VkIHRoZSBhcmNoaXZlZCBzdGF0ZSBmb3IgdGhlIHNlc3Npb24gcHJldmlvdXNseS4gSXRcblx0ICogaXMga2VwdCBpbnRlcm5hbCB0byBub3QgZXhwb3NlIGl0IHB1YmxpY2x5LiBVc2UgYGlzQXJjaGl2ZWQoKWBcblx0ICogYW5kIGBzZXRBcmNoaXZlZCgpYCBtZXRob2RzIGluc3RlYWQuXG5cdCAqL1xuXHRyZWFkb25seSBhcmNoaXZlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmVhZCBzdGF0ZSBhcyByZXBvcnRlZCBieSB0aGUgc2Vzc2lvbidzIHByb3ZpZGVyLCBhdXRob3JpdGF0aXZlIGZvclxuXHQgKiBwcm92aWRlcnMgdGhhdCBvd24gaXQgKHNlZSB7QGxpbmsgb3duc1JlYWRTdGF0ZX0pLiBLZXB0IGludGVybmFsIFx1MjAxNCB1c2Vcblx0ICogYGlzUmVhZCgpYCAvIGBzZXRSZWFkKClgLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJvdmlkZXJJc1JlYWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJSW50ZXJuYWxBZ2VudFNlc3Npb24gZXh0ZW5kcyBJQWdlbnRTZXNzaW9uLCBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhIHsgfVxuXG5leHBvcnQgZnVuY3Rpb24gaXNMb2NhbEFnZW50U2Vzc2lvbkl0ZW0oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvbi5wcm92aWRlclR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgcHVsbCByZXF1ZXN0IGFzc29jaWF0ZWQgd2l0aCBhbiBhZ2VudCBzZXNzaW9uIGZyb20gaXRzIHByb3ZpZGVyIG1ldGFkYXRhLFxuICogcHJlZmVycmluZyBhbiBleHBsaWNpdCBgcHVsbFJlcXVlc3RVcmxgIGFuZCBmYWxsaW5nIGJhY2sgdG8gYHB1bGxSZXF1ZXN0TnVtYmVyYCBjb21iaW5lZFxuICogd2l0aCBgb3duZXJgL2BuYW1lYC4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGhhcyBubyBhc3NvY2lhdGVkIHB1bGwgcmVxdWVzdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0VXJpKHNlc3Npb246IFBpY2s8SUFnZW50U2Vzc2lvbiwgJ21ldGFkYXRhJz4pOiBVUkkgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb24ubWV0YWRhdGE7XG5cdGlmICghbWV0YWRhdGEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgdXJsID0gbWV0YWRhdGEucHVsbFJlcXVlc3RVcmw7XG5cdGlmICh0eXBlb2YgdXJsID09PSAnc3RyaW5nJyAmJiB1cmwpIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZSh1cmwpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRmFsbCB0aHJvdWdoIHRvIHRoZSBudW1iZXIgYmFzZWQgbG9va3VwIGJlbG93LlxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHByTnVtYmVyID0gbWV0YWRhdGEucHVsbFJlcXVlc3ROdW1iZXI7XG5cdGNvbnN0IG93bmVyID0gbWV0YWRhdGEub3duZXI7XG5cdGNvbnN0IG5hbWUgPSBtZXRhZGF0YS5uYW1lO1xuXHRpZiAodHlwZW9mIHByTnVtYmVyID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygb3duZXIgPT09ICdzdHJpbmcnICYmIG93bmVyICYmIHR5cGVvZiBuYW1lID09PSAnc3RyaW5nJyAmJiBuYW1lKSB7XG5cdFx0cmV0dXJuIFVSSS5wYXJzZShgaHR0cHM6Ly9naXRodWIuY29tLyR7b3duZXJ9LyR7bmFtZX0vcHVsbC8ke3ByTnVtYmVyfWApO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUaGUgdmFsdWUgZm9yIHRoZSBgY2hhdFNlc3Npb25QdWxsUmVxdWVzdGAgY29udGV4dCBrZXkgZm9yIGEgc2Vzc2lvbi4gTmV2ZXIgcmV0dXJucyBhblxuICogXCJ1bmtub3duXCIgdmFsdWU6IGNhbGxlcnMgaGVyZSBhbHdheXMgaGF2ZSB0aGUgc2Vzc2lvbidzIG1ldGFkYXRhIGluIGhhbmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudFNlc3Npb25QdWxsUmVxdWVzdENvbnRleHRWYWx1ZShzZXNzaW9uOiBQaWNrPElBZ2VudFNlc3Npb24sICdtZXRhZGF0YSc+KTogJ2F2YWlsYWJsZScgfCAnbm9uZScge1xuXHRyZXR1cm4gZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RVcmkoc2Vzc2lvbikgPyAnYXZhaWxhYmxlJyA6ICdub25lJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRIb3N0QWdlbnRTZXNzaW9uSXRlbShzZXNzaW9uOiBJQWdlbnRTZXNzaW9uKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0FnZW50SG9zdFRhcmdldChzZXNzaW9uLnByb3ZpZGVyVHlwZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0FnZW50U2Vzc2lvbihvYmo6IHVua25vd24pOiBvYmogaXMgSUFnZW50U2Vzc2lvbiB7XG5cdGNvbnN0IHNlc3Npb24gPSBvYmogYXMgSUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gVVJJLmlzVXJpKHNlc3Npb24/LnJlc291cmNlKVxuXHRcdCYmIHR5cGVvZiBzZXNzaW9uLmlzQXJjaGl2ZWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2Ygc2Vzc2lvbi5zZXRBcmNoaXZlZCA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdCYmIHR5cGVvZiBzZXNzaW9uLmlzUGlubmVkID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHNlc3Npb24uc2V0UGlubmVkID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHNlc3Npb24uaXNSZWFkID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHNlc3Npb24uaXNNYXJrZWRVbnJlYWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2Ygc2Vzc2lvbi5zZXRSZWFkID09PSAnZnVuY3Rpb24nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudFNlc3Npb25zTW9kZWwob2JqOiB1bmtub3duKTogb2JqIGlzIElBZ2VudFNlc3Npb25zTW9kZWwge1xuXHRjb25zdCBzZXNzaW9uc01vZGVsID0gb2JqIGFzIElBZ2VudFNlc3Npb25zTW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIEFycmF5LmlzQXJyYXkoc2Vzc2lvbnNNb2RlbD8uc2Vzc2lvbnMpICYmIHR5cGVvZiBzZXNzaW9uc01vZGVsPy5nZXRTZXNzaW9uID09PSAnZnVuY3Rpb24nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY291bnRVbnJlYWRTZXNzaW9ucyhzZXNzaW9uczogSUFnZW50U2Vzc2lvbltdKTogbnVtYmVyIHtcblx0bGV0IHVucmVhZCA9IDA7XG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdGlmICghc2Vzc2lvbi5pc0FyY2hpdmVkKCkgJiYgc2Vzc2lvbi5zdGF0dXMgPT09IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgJiYgIXNlc3Npb24uaXNSZWFkKCkpIHtcblx0XHRcdHVucmVhZCsrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5yZWFkO1xufVxuXG5pbnRlcmZhY2UgSUFnZW50U2Vzc2lvblN0YXRlIHtcblx0cmVhZG9ubHkgYXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBwaW5uZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSByZWFkPzogbnVtYmVyIC8qIGxhc3QgZGF0ZSB0dXJuZWQgcmVhZCAqLztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRTZXNzaW9uU2VjdGlvbiB7XG5cblx0Ly8gUGlubmVkIEdyb3VwaW5nXG5cdFBpbm5lZCA9ICdwaW5uZWQnLFxuXG5cdC8vIERhdGUgR3JvdXBpbmdcblx0VG9kYXkgPSAndG9kYXknLFxuXHRZZXN0ZXJkYXkgPSAneWVzdGVyZGF5Jyxcblx0V2VlayA9ICd3ZWVrJyxcblx0T2xkZXIgPSAnb2xkZXInLFxuXHRBcmNoaXZlZCA9ICdhcmNoaXZlZCcsXG5cblx0Ly8gQ2FwcGVkIEdyb3VwaW5nXG5cdE1vcmUgPSAnbW9yZScsXG5cblx0Ly8gUmVwb3NpdG9yeSBHcm91cGluZ1xuXHRSZXBvc2l0b3J5ID0gJ3JlcG9zaXRvcnknLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNlc3Npb25TZWN0aW9uIHtcblx0cmVhZG9ubHkgc2VjdGlvbjogQWdlbnRTZXNzaW9uU2VjdGlvbjtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRTZXNzaW9uU2VjdGlvbihvYmo6IHVua25vd24pOiBvYmogaXMgSUFnZW50U2Vzc2lvblNlY3Rpb24ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBvYmogYXMgSUFnZW50U2Vzc2lvblNlY3Rpb247XG5cblx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGUuc2VjdGlvbiA9PT0gJ3N0cmluZycgJiYgQXJyYXkuaXNBcnJheShjYW5kaWRhdGUuc2Vzc2lvbnMpO1xufVxuXG4vKipcbiAqIEEgXCJTaG93IE4gTW9yZS4uLlwiIGl0ZW0gdGhhdCBhcHBlYXJzIGFzIHRoZSBsYXN0IGNoaWxkXG4gKiBvZiBhIGNhcHBlZCByZXBvc2l0b3J5IGdyb3VwIHNlY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvblNob3dNb3JlIHtcblx0cmVhZG9ubHkgc2hvd01vcmU6IHRydWU7XG5cdHJlYWRvbmx5IHNlY3Rpb25MYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSByZW1haW5pbmdDb3VudDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudFNlc3Npb25TaG93TW9yZShvYmo6IHVua25vd24pOiBvYmogaXMgSUFnZW50U2Vzc2lvblNob3dNb3JlIHtcblx0cmV0dXJuIChvYmogYXMgSUFnZW50U2Vzc2lvblNob3dNb3JlKT8uc2hvd01vcmUgPT09IHRydWU7XG59XG5cbi8qKlxuICogQSBcIlNob3cgbGVzc1wiIGl0ZW0gdGhhdCBhcHBlYXJzIGFzIHRoZSBsYXN0IGNoaWxkXG4gKiBvZiBhbiBleHBhbmRlZCByZXBvc2l0b3J5IGdyb3VwIHNlY3Rpb24gdG8gYWxsb3cgY29sbGFwc2luZyBiYWNrLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNlc3Npb25TaG93TGVzcyB7XG5cdHJlYWRvbmx5IHNob3dMZXNzOiB0cnVlO1xuXHRyZWFkb25seSBzZWN0aW9uTGFiZWw6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRTZXNzaW9uU2hvd0xlc3Mob2JqOiB1bmtub3duKTogb2JqIGlzIElBZ2VudFNlc3Npb25TaG93TGVzcyB7XG5cdHJldHVybiAob2JqIGFzIElBZ2VudFNlc3Npb25TaG93TGVzcyk/LnNob3dMZXNzID09PSB0cnVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5ICRtaWQ6IE1hcnNoYWxsZWRJZC5BZ2VudFNlc3Npb25Db250ZXh0O1xuXG5cdHJlYWRvbmx5IHNlc3Npb246IElBZ2VudFNlc3Npb247XG5cdHJlYWRvbmx5IHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW107IC8vIHN1cHBvcnQgZm9yIG11bHRpLXNlbGVjdGlvblxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElNYXJzaGFsbGVkQWdlbnRTZXNzaW9uQ29udGV4dCB7XG5cdGlmICh0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnICYmIHRoaW5nICE9PSBudWxsKSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpbmcgYXMgSU1hcnNoYWxsZWRBZ2VudFNlc3Npb25Db250ZXh0O1xuXHRcdHJldHVybiBjYW5kaWRhdGUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkFnZW50U2Vzc2lvbkNvbnRleHQgJiYgdHlwZW9mIGNhbmRpZGF0ZS5zZXNzaW9uID09PSAnb2JqZWN0JyAmJiBjYW5kaWRhdGUuc2Vzc2lvbiAhPT0gbnVsbDtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTZXNzaW9ucyBMb2dnZXJcblxuY29uc3QgYWdlbnRTZXNzaW9uc091dHB1dENoYW5uZWxJZCA9ICdhZ2VudFNlc3Npb25zT3V0cHV0JztcbmNvbnN0IGFnZW50U2Vzc2lvbnNPdXRwdXRDaGFubmVsTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uc091dHB1dCcsIFwiQWdlbnQgU2Vzc2lvbnNcIik7XG5cbmZ1bmN0aW9uIHN0YXR1c1RvU3RyaW5nKHN0YXR1czogQWdlbnRTZXNzaW9uU3RhdHVzKTogc3RyaW5nIHtcblx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5GYWlsZWQ6IHJldHVybiAnRmFpbGVkJztcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ6IHJldHVybiAnQ29tcGxldGVkJztcblx0XHRjYXNlIEFnZW50U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzOiByZXR1cm4gJ0luUHJvZ3Jlc3MnO1xuXHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ6IHJldHVybiAnTmVlZHNJbnB1dCc7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIGBVbmtub3duKCR7c3RhdHVzfSlgO1xuXHR9XG59XG5cbmNsYXNzIEFnZW50U2Vzc2lvbnNMb2dnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGlzQ2hhbm5lbFJlZ2lzdGVyZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGdldFNlc3Npb25zRGF0YTogKCkgPT4ge1xuXHRcdFx0c2Vzc2lvbnM6IEl0ZXJhYmxlPElJbnRlcm5hbEFnZW50U2Vzc2lvbj47XG5cdFx0XHRzZXNzaW9uU3RhdGVzOiBSZXNvdXJjZU1hcDxJQWdlbnRTZXNzaW9uU3RhdGU+O1xuXHRcdH0sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElPdXRwdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudXBkYXRlQ2hhbm5lbFJlZ2lzdHJhdGlvbigpO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hhbm5lbFJlZ2lzdHJhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0RGlzYWJsZWQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmhpZGRlbjtcblxuXHRcdGlmIChjaGF0RGlzYWJsZWQgJiYgdGhpcy5pc0NoYW5uZWxSZWdpc3RlcmVkKSB7XG5cdFx0XHRSZWdpc3RyeS5hczxJT3V0cHV0Q2hhbm5lbFJlZ2lzdHJ5PihFeHRlbnNpb25zLk91dHB1dENoYW5uZWxzKS5yZW1vdmVDaGFubmVsKGFnZW50U2Vzc2lvbnNPdXRwdXRDaGFubmVsSWQpO1xuXHRcdFx0dGhpcy5pc0NoYW5uZWxSZWdpc3RlcmVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICghY2hhdERpc2FibGVkICYmICF0aGlzLmlzQ2hhbm5lbFJlZ2lzdGVyZWQpIHtcblx0XHRcdFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KEV4dGVuc2lvbnMuT3V0cHV0Q2hhbm5lbHMpLnJlZ2lzdGVyQ2hhbm5lbCh7XG5cdFx0XHRcdGlkOiBhZ2VudFNlc3Npb25zT3V0cHV0Q2hhbm5lbElkLFxuXHRcdFx0XHRsYWJlbDogYWdlbnRTZXNzaW9uc091dHB1dENoYW5uZWxMYWJlbCxcblx0XHRcdFx0bG9nOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmlzQ2hhbm5lbFJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sb2dTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9nTGV2ZWwobGV2ZWwgPT4ge1xuXHRcdFx0aWYgKGxldmVsID09PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0XHR0aGlzLmxvZ0FsbFN0YXRzSWZUcmFjZSgnTG9nIGxldmVsIGNoYW5nZWQgdG8gdHJhY2UnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZW50aW1lbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDaGFubmVsUmVnaXN0cmF0aW9uKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0bG9nSWZUcmFjZShtc2c6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSAhPT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKGBbQWdlbnQgU2Vzc2lvbnNdICR7bXNnfWApO1xuXHR9XG5cblx0bG9nQWxsU3RhdHNJZlRyYWNlKHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpICE9PSBMb2dMZXZlbC5UcmFjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nQWxsU2Vzc2lvbnMocmVhc29uKTtcblx0XHR0aGlzLmxvZ1Nlc3Npb25TdGF0ZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nQWxsU2Vzc2lvbnMocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB7IHNlc3Npb25zLCBzZXNzaW9uU3RhdGVzIH0gPSB0aGlzLmdldFNlc3Npb25zRGF0YSgpO1xuXG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGluZXMucHVzaChgPT09IEFnZW50IFNlc3Npb25zICgke3JlYXNvbn0pID09PWApO1xuXG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvdW50Kys7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXG5cdFx0XHRsaW5lcy5wdXNoKGAtLS0gU2Vzc2lvbjogJHtzZXNzaW9uLmxhYmVsfSAtLS1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgUmVzb3VyY2U6ICR7c2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0bGluZXMucHVzaChgICBQcm92aWRlciBUeXBlOiAke3Nlc3Npb24ucHJvdmlkZXJUeXBlfWApO1xuXHRcdFx0bGluZXMucHVzaChgICBQcm92aWRlciBMYWJlbDogJHtzZXNzaW9uLnByb3ZpZGVyTGFiZWx9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIFN0YXR1czogJHtzdGF0dXNUb1N0cmluZyhzZXNzaW9uLnN0YXR1cyl9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIEljb246ICR7c2Vzc2lvbi5pY29uLmlkfWApO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbi5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGAgIERlc2NyaXB0aW9uOiAke3R5cGVvZiBzZXNzaW9uLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJyA/IHNlc3Npb24uZGVzY3JpcHRpb24gOiBzZXNzaW9uLmRlc2NyaXB0aW9uLnZhbHVlfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24uYmFkZ2UpIHtcblx0XHRcdFx0bGluZXMucHVzaChgICBCYWRnZTogJHt0eXBlb2Ygc2Vzc2lvbi5iYWRnZSA9PT0gJ3N0cmluZycgPyBzZXNzaW9uLmJhZGdlIDogc2Vzc2lvbi5iYWRnZS52YWx1ZX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9uLnRvb2x0aXApIHtcblx0XHRcdFx0bGluZXMucHVzaChgICBUb29sdGlwOiAke3R5cGVvZiBzZXNzaW9uLnRvb2x0aXAgPT09ICdzdHJpbmcnID8gc2Vzc2lvbi50b29sdGlwIDogc2Vzc2lvbi50b29sdGlwLnZhbHVlfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUaW1pbmcgaW5mb1xuXHRcdFx0bGluZXMucHVzaChgICBUaW1pbmc6YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgQ3JlYXRlZDogJHtzZXNzaW9uLnRpbWluZy5jcmVhdGVkID8gbmV3IERhdGUoc2Vzc2lvbi50aW1pbmcuY3JlYXRlZCkudG9JU09TdHJpbmcoKSA6ICdOL0EnfWApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIExhc3QgUmVxdWVzdCBTdGFydGVkOiAke3Nlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/IG5ldyBEYXRlKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCkudG9JU09TdHJpbmcoKSA6ICdOL0EnfWApO1xuXHRcdFx0bGluZXMucHVzaChgICAgIExhc3QgUmVxdWVzdCBFbmRlZDogJHtzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkID8gbmV3IERhdGUoc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCkudG9JU09TdHJpbmcoKSA6ICdOL0EnfWApO1xuXG5cdFx0XHQvLyBDaGFuZ2VzIGluZm9cblx0XHRcdGlmIChzZXNzaW9uLmNoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvbi5jaGFuZ2VzKTtcblx0XHRcdFx0aWYgKHN1bW1hcnkpIHtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGAgIENoYW5nZXM6ICR7c3VtbWFyeS5maWxlc30gZmlsZXMsICske3N1bW1hcnkuaW5zZXJ0aW9uc30gLSR7c3VtbWFyeS5kZWxldGlvbnN9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gTWV0YWRhdGFcblx0XHRcdGlmIChzZXNzaW9uLm1ldGFkYXRhICYmIE9iamVjdC5rZXlzKHNlc3Npb24ubWV0YWRhdGEpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGluZXMucHVzaChgICBNZXRhZGF0YTpgKTtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc2Vzc2lvbi5tZXRhZGF0YSkpIHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJlZFZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogc2FmZVN0cmluZ2lmeSh2YWx1ZSk7XG5cdFx0XHRcdFx0bGluZXMucHVzaChgICAgICR7a2V5fTogJHtyZW5kZXJlZFZhbHVlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE91ciBzdGF0ZSAocmVhZC91bnJlYWQsIGFyY2hpdmVkKVxuXHRcdFx0bGluZXMucHVzaChgICBTdGF0ZTpgKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBBcmNoaXZlZCAocHJvdmlkZXIpOiAke3Nlc3Npb24uYXJjaGl2ZWQgPz8gJ04vQSd9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgQXJjaGl2ZWQgKGNvbXB1dGVkKTogJHtzZXNzaW9uLmlzQXJjaGl2ZWQoKX1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBBcmNoaXZlZCAoc3RvcmVkKTogJHtzdGF0ZT8uYXJjaGl2ZWQgPz8gJ04vQSd9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgUGlubmVkOiAke3Nlc3Npb24uaXNQaW5uZWQoKX1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBQaW5uZWQgKHN0b3JlZCk6ICR7c3RhdGU/LnBpbm5lZCA/PyAnTi9BJ31gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgICBSZWFkOiAke3Nlc3Npb24uaXNSZWFkKCl9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgICAgUmVhZCBkYXRlIChzdG9yZWQpOiAke3N0YXRlPy5yZWFkID8gbmV3IERhdGUoc3RhdGUucmVhZCkudG9JU09TdHJpbmcoKSA6ICdOL0EnfWApO1xuXG5cdFx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHR9XG5cblx0XHRsaW5lcy51bnNoaWZ0KGBUb3RhbCBzZXNzaW9uczogJHtjb3VudH1gLCAnJyk7XG5cblx0XHRsaW5lcy5wdXNoKGA9PT0gRW5kIEFnZW50IFNlc3Npb25zID09PWApO1xuXG5cdFx0dGhpcy50cmFjZShsaW5lcy5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRwcml2YXRlIGxvZ1Nlc3Npb25TdGF0ZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uU3RhdGVzIH0gPSB0aGlzLmdldFNlc3Npb25zRGF0YSgpO1xuXG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGluZXMucHVzaChgPT09IFNlc3Npb24gU3RhdGVzID09PWApO1xuXHRcdGxpbmVzLnB1c2goYFRvdGFsIHN0b3JlZCBzdGF0ZXM6ICR7c2Vzc2lvblN0YXRlcy5zaXplfWApO1xuXHRcdGxpbmVzLnB1c2goJycpO1xuXG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIHN0YXRlXSBvZiBzZXNzaW9uU3RhdGVzKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGBVUkk6ICR7cmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdGxpbmVzLnB1c2goYCAgQXJjaGl2ZWQ6ICR7c3RhdGUuYXJjaGl2ZWR9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIFBpbm5lZDogJHtzdGF0ZS5waW5uZWR9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKGAgIFJlYWQ6ICR7c3RhdGUucmVhZCA/IG5ldyBEYXRlKHN0YXRlLnJlYWQpLnRvSVNPU3RyaW5nKCkgOiAnMCAodW5yZWFkKSd9YCk7XG5cdFx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHR9XG5cblx0XHRsaW5lcy5wdXNoKGA9PT0gRW5kIFNlc3Npb24gU3RhdGVzID09PWApO1xuXG5cdFx0dGhpcy50cmFjZShsaW5lcy5qb2luKCdcXG4nKSk7XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlKG1zZzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbm5lbCA9IHRoaXMub3V0cHV0U2VydmljZS5nZXRDaGFubmVsKGFnZW50U2Vzc2lvbnNPdXRwdXRDaGFubmVsSWQpO1xuXHRcdGlmICghY2hhbm5lbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNoYW5uZWwuYXBwZW5kKGAke21zZ31cXG5gKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvbnNNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRTZXNzaW9uc01vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxSZXNvbHZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25XaWxsUmVzb2x2ZSA9IHRoaXMuX29uV2lsbFJlc29sdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZXNvbHZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXNvbHZlID0gdGhpcy5fb25EaWRSZXNvbHZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9yZXNvbHZlZCA9IGZhbHNlO1xuXHRnZXQgcmVzb2x2ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9yZXNvbHZlZDsgfVxuXG5cdHByaXZhdGUgX3Nlc3Npb25zOiBSZXNvdXJjZU1hcDxJSW50ZXJuYWxBZ2VudFNlc3Npb24+O1xuXHRnZXQgc2Vzc2lvbnMoKTogSUFnZW50U2Vzc2lvbltdIHsgcmV0dXJuIHRoaXMuX2RlZHVwZU1pZ3JhdGVkQ29waWxvdENsaVNlc3Npb25zKEFycmF5LmZyb20odGhpcy5fc2Vzc2lvbnMudmFsdWVzKCkpKTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVzb2x2ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBUaHJvdHRsZWREZWxheWVyPHZvaWQ+PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlOiBBZ2VudFNlc3Npb25zQ2FjaGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBBZ2VudFNlc3Npb25zTG9nZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8SUludGVybmFsQWdlbnRTZXNzaW9uPigpO1xuXG5cdFx0dGhpcy5jYWNoZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0NhY2hlKTtcblx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgdGhpcy5jYWNoZS5sb2FkQ2FjaGVkU2Vzc2lvbnMoKSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMudG9BZ2VudFNlc3Npb24oZGF0YSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbi5yZXNvdXJjZSwgc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvblN0YXRlcyA9IHRoaXMuY2FjaGUubG9hZFNlc3Npb25TdGF0ZXMoKTtcblxuXHRcdHRoaXMubG9nZ2VyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEFnZW50U2Vzc2lvbnNMb2dnZXIsXG5cdFx0XHQoKSA9PiAoe1xuXHRcdFx0XHRzZXNzaW9uczogdGhpcy5fc2Vzc2lvbnMudmFsdWVzKCksXG5cdFx0XHRcdHNlc3Npb25TdGF0ZXM6IHRoaXMuc2Vzc2lvblN0YXRlcyxcblx0XHRcdH0pXG5cdFx0KSk7XG5cdFx0dGhpcy5sb2dnZXIubG9nQWxsU3RhdHNJZlRyYWNlKCdMb2FkZWQgY2FjaGVkIHNlc3Npb25zJyk7XG5cblx0XHR0aGlzLnJlYWREYXRlQmFzZWxpbmUgPSB0aGlzLnJlc29sdmVSZWFkRGF0ZUJhc2VsaW5lKCk7IC8vIHdlIHVzZSB0aGlzIHRvIGFjY291bnQgZm9yIGJ1Z2ZpeGVzIGluIHRoZSByZWFkL3VucmVhZCB0cmFja2luZ1xuXHRcdHRoaXMubG9hZE1pZ3JhdGVkUmVhZFJlc291cmNlcygpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFNlc3Npb25zIHVwZGF0ZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycygoeyBjaGF0U2Vzc2lvblR5cGUgfSkgPT4gdGhpcy5yZXNvbHZlKGNoYXRTZXNzaW9uVHlwZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkoKCkgPT4gdGhpcy5yZXNvbHZlKHVuZGVmaW5lZCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMoKGRlbHRhKSA9PiB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkQ2hhdFNlc3Npb25UeXBlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGRlbHRhLmFkZGVkT3JVcGRhdGVkID8/IFtdKSB7XG5cdFx0XHRcdGNoYW5nZWRDaGF0U2Vzc2lvblR5cGVzLmFkZChnZXRDaGF0U2Vzc2lvblR5cGUocmVzb3VyY2UucmVzb3VyY2UpKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBkZWx0YS5yZW1vdmVkID8/IFtdKSB7XG5cdFx0XHRcdGNoYW5nZWRDaGF0U2Vzc2lvblR5cGVzLmFkZChnZXRDaGF0U2Vzc2lvblR5cGUocmVzb3VyY2UpKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBjaGF0U2Vzc2lvblR5cGUgb2YgY2hhbmdlZENoYXRTZXNzaW9uVHlwZXMpIHtcblx0XHRcdFx0dGhpcy5yZXNvbHZlUHJvdmlkZXIoY2hhdFNlc3Npb25UeXBlLCB7IHJlZnJlc2hQcm92aWRlcjogZmFsc2UgLyogc2tpcCBiZWNhdXNlIHdlIHJlYWN0IG9uIGFuIGV2ZW50IGFscmVhZHkgKi8gfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMucmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QoKCkgPT4gdGhpcy5yZXNvbHZlKHVuZGVmaW5lZCkpKTtcblxuXHRcdC8vIFN0YXRlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jYWNoZS5zYXZlQ2FjaGVkU2Vzc2lvbnMoQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9ucy52YWx1ZXMoKSkpO1xuXHRcdFx0dGhpcy5jYWNoZS5zYXZlU2Vzc2lvblN0YXRlcyh0aGlzLnNlc3Npb25TdGF0ZXMpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5nZXQocmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZGUgdGhlIGV4dGVuc2lvbi1ob3N0IGBjb3BpbG90Y2xpOmAgcm93IHdoZW4gaXRzIGFnZW50LWhvc3Rcblx0ICogYGFnZW50LWhvc3QtY29waWxvdGNsaTpgIHR3aW4gaXMgcHJlc2VudCwgc28gdGhlIGxpc3Qgc2hvd3MgYSBzaW5nbGUgZW50cnlcblx0ICogcGVyIGxlZ2FjeSBDb3BpbG90IENMSSBzZXNzaW9uIFx1MjAxNCB0aGUgYWdlbnQtaG9zdCBvbmUsIHdoaWNoIG1pZ3JhdGVzIG9uIG9wZW4uXG5cdCAqIE9ubHkgZGlzcGxheSBpcyBkZWR1cGVkOyB7QGxpbmsgZ2V0U2Vzc2lvbn0gYW5kIHRoZSBjYWNoZSB1c2UgdGhlIGZ1bGwgbWFwIHNvXG5cdCAqIGEgaGlkZGVuIHJvdyBjYW4gc3RpbGwgcmVzb2x2ZS5cblx0ICovXG5cdHByaXZhdGUgX2RlZHVwZU1pZ3JhdGVkQ29waWxvdENsaVNlc3Npb25zKHNlc3Npb25zOiBJQWdlbnRTZXNzaW9uW10pOiBJQWdlbnRTZXNzaW9uW10ge1xuXHRcdGxldCBtaWdyYXRlZFJhd0lkczogU2V0PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWUgPT09IENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSkge1xuXHRcdFx0XHRjb25zdCByYXdJZCA9IGdldENvcGlsb3RDbGlTZXNzaW9uUmF3SWQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChyYXdJZCkge1xuXHRcdFx0XHRcdChtaWdyYXRlZFJhd0lkcyA/Pz0gbmV3IFNldDxzdHJpbmc+KCkpLmFkZChyYXdJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFtaWdyYXRlZFJhd0lkcykge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25zO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4ge1xuXHRcdFx0aWYgKHNlc3Npb24ucmVzb3VyY2Uuc2NoZW1lID09PSBDT1BJTE9UX0NMSV9FSF9TQ0hFTUUpIHtcblx0XHRcdFx0Y29uc3QgcmF3SWQgPSBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmF3SWQgJiYgbWlncmF0ZWRSYXdJZHMhLmhhcyhyYXdJZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlZFNpZ25hbDogSU9ic2VydmFibGU8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25PYnNlcnZhYmxlcyA9IG5ldyBSZXNvdXJjZU1hcDxJT2JzZXJ2YWJsZTxJQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRvYnNlcnZlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogSU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFRyaWdnZXIgcmVzb2x2ZSBpZiBub3QgeWV0IHJlc29sdmVkIGZvciB0aGlzIHJlc291cmNlIChvciBpZlxuXHRcdC8vIHRoZSBndWFyZCB3YXMgY2xlYXJlZCBhZnRlciBhIHByb3ZpZGVyIHJlZnJlc2gpLiBUaGlzIGlzXG5cdFx0Ly8gc2VwYXJhdGVkIGZyb20gdGhlIG9ic2VydmFibGUgY2FjaGUgc28gdGhhdCByZS1jYWxscyBhZnRlciBhXG5cdFx0Ly8gcmVmcmVzaCByZS10cmlnZ2VyIHRoZSByZXNvbHZlIFJQQyBldmVuIHRob3VnaCB0aGUgb2JzZXJ2YWJsZVxuXHRcdC8vIGFscmVhZHkgZXhpc3RzLlxuXHRcdGlmICghdGhpcy5fcmVzb2x2ZWRSZXNvdXJjZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5fcmVzb2x2ZWRSZXNvdXJjZXMuYWRkKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHJlc291cmNlKTtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25UeXBlLCByZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSlcblx0XHRcdFx0LmNhdGNoKGVycm9yID0+IHRoaXMubG9nZ2VyLmxvZ0lmVHJhY2UoYG9ic2VydmVTZXNzaW9uOiByZXNvbHZlIGZhaWxlZCBmb3IgJHtyZXNvdXJjZS50b1N0cmluZygpfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCkpO1xuXHRcdH1cblxuXHRcdGxldCBvYnNlcnZhYmxlID0gdGhpcy5fc2Vzc2lvbk9ic2VydmFibGVzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFvYnNlcnZhYmxlKSB7XG5cdFx0XHR0aGlzLl9jaGFuZ2VkU2lnbmFsID8/PSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KCdhZ2VudFNlc3Npb25zQ2hhbmdlZCcsIHRoaXMub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cdFx0XHRjb25zdCBzaWduYWwgPSB0aGlzLl9jaGFuZ2VkU2lnbmFsO1xuXHRcdFx0b2JzZXJ2YWJsZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0c2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zLmdldChyZXNvdXJjZSk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3Nlc3Npb25PYnNlcnZhYmxlcy5zZXQocmVzb3VyY2UsIG9ic2VydmFibGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzZXJ2YWJsZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmUocHJvdmlkZXI6IHN0cmluZyB8IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gQXJyYXkuaXNBcnJheShwcm92aWRlcilcblx0XHRcdD8gcHJvdmlkZXJcblx0XHRcdDogcHJvdmlkZXIgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IFtwcm92aWRlcl1cblx0XHRcdFx0OiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0UmVnaXN0ZXJlZENoYXRTZXNzaW9uSXRlbVByb3ZpZGVycygpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChwcm92aWRlciA9PiB0aGlzLnJlc29sdmVQcm92aWRlcihwcm92aWRlciwgeyByZWZyZXNoUHJvdmlkZXI6IHRydWUgfSkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVByb3ZpZGVyKHByb3ZpZGVyOiBzdHJpbmcsIG9wdGlvbnM6IHsgcmVmcmVzaFByb3ZpZGVyOiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5oaWRkZW4pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgLy8gZG9uJ3QgcmVzb2x2ZSBpZiBBSSBmZWF0dXJlcyBhcmUgZGlzYWJsZWRcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZXIgPSB0aGlzLnJlc29sdmVycy5nZXQocHJvdmlkZXIpO1xuXHRcdGlmICghcmVzb2x2ZXIpIHtcblx0XHRcdHJlc29sdmVyID0gbmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oNTAwKTtcblx0XHRcdHRoaXMucmVzb2x2ZXJzLnNldChwcm92aWRlciwgcmVzb2x2ZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvbHZlci50cmlnZ2VyKGFzeW5jIHRva2VuID0+IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2lsbFNodXRkb3duKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fb25XaWxsUmVzb2x2ZS5maXJlKHByb3ZpZGVyKTtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuZG9SZXNvbHZlUHJvdmlkZXIocHJvdmlkZXIsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmxvZ0lmVHJhY2UoYEVycm9yIHJlc29sdmluZyBzZXNzaW9ucyBmb3IgcHJvdmlkZXIgJHtwcm92aWRlcn06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLnN0YWNrIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVzb2x2ZS5maXJlKHByb3ZpZGVyKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlUHJvdmlkZXIocHJvdmlkZXI6IHN0cmluZywgb3B0aW9uczogeyByZWZyZXNoUHJvdmlkZXI6IGJvb2xlYW4gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG9wdGlvbnMucmVmcmVzaFByb3ZpZGVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVmcmVzaENoYXRTZXNzaW9uSXRlbXMoW3Byb3ZpZGVyXSwgdG9rZW4pO1xuXG5cdFx0XHQvLyBDbGVhciB0aGUgcmVzb2x2ZS1vbmNlIGd1YXJkIGZvciBzZXNzaW9ucyBiZWxvbmdpbmcgdG8gdGhpc1xuXHRcdFx0Ly8gcHJvdmlkZXIgYW5kIHJlLXRyaWdnZXIgcmVzb2x2ZSBmb3IgYW55IHRoYXQgd2VyZSBwcmV2aW91c2x5XG5cdFx0XHQvLyBvYnNlcnZlZC4gVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSB0aGUgcmVmcmVzaCByZXR1cm5zIGl0ZW1zXG5cdFx0XHQvLyB3aXRoIGxhenkgcHJvcGVydGllcyAoZS5nLiBjaGFuZ2VzOiB1bmRlZmluZWQpIHRoYXQgbmVlZCBhXG5cdFx0XHQvLyBmcmVzaCByZXNvbHZlIFJQQy4gUmUtY2FsbGluZyBvYnNlcnZlU2Vzc2lvbigpIGZvciByZXNvdXJjZXNcblx0XHRcdC8vIGFscmVhZHkgaW4gX3Nlc3Npb25PYnNlcnZhYmxlcyBpcyBjaGVhcCAodGhlIG9ic2VydmFibGUgaXNcblx0XHRcdC8vIGNhY2hlZCkgYW5kIG9ubHkgZmlyZXMgdGhlIFJQQyBzaWRlLWVmZmVjdC5cblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgWy4uLnRoaXMuX3Jlc29sdmVkUmVzb3VyY2VzXSkge1xuXHRcdFx0XHRpZiAoZ2V0Q2hhdFNlc3Npb25UeXBlKHJlc291cmNlKSA9PT0gcHJvdmlkZXIpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZFJlc291cmNlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zZXNzaW9uT2JzZXJ2YWJsZXMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5vYnNlcnZlU2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFwU2Vzc2lvbkNvbnRyaWJ1dGlvblRvVHlwZSA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlZENoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50PigpO1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKSkge1xuXHRcdFx0bWFwU2Vzc2lvbkNvbnRyaWJ1dGlvblRvVHlwZS5zZXQoY29udHJpYnV0aW9uLnR5cGUsIGNvbnRyaWJ1dGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gUGhhc2UgMTogRmV0Y2ggbmV3IGl0ZW1zIGZvciB0aGlzIHByb3ZpZGVyIChhc3luYywgbWF5IGludGVybGVhdmUgd2l0aCBvdGhlciBwcm92aWRlcnMpXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8SUludGVybmFsQWdlbnRTZXNzaW9uPigpO1xuXHRcdGZvciBhd2FpdCAoY29uc3QgeyBjaGF0U2Vzc2lvblR5cGUsIGl0ZW1zOiBwcm92aWRlclNlc3Npb25zIH0gb2YgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uSXRlbXMoW3Byb3ZpZGVyXSwgdG9rZW4pKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgcHJvdmlkZXJTZXNzaW9ucykge1xuXHRcdFx0XHRsZXQgaWNvbjogVGhlbWVJY29uO1xuXHRcdFx0XHRsZXQgcHJvdmlkZXJMYWJlbDogc3RyaW5nO1xuXHRcdFx0XHRjb25zdCBhZ2VudFNlc3Npb25Qcm92aWRlciA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdGlmIChhZ2VudFNlc3Npb25Qcm92aWRlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJMYWJlbCA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShhZ2VudFNlc3Npb25Qcm92aWRlcik7XG5cdFx0XHRcdFx0aWNvbiA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbihhZ2VudFNlc3Npb25Qcm92aWRlcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJMYWJlbCA9IG1hcFNlc3Npb25Db250cmlidXRpb25Ub1R5cGUuZ2V0KGNoYXRTZXNzaW9uVHlwZSk/Lm5hbWUgPz8gY2hhdFNlc3Npb25UeXBlO1xuXHRcdFx0XHRcdGljb24gPSBzZXNzaW9uLmljb25QYXRoID8/IENvZGljb24udGVybWluYWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBIGxhenkgcHJvdmlkZXIgcmVmcmVzaCBvbWl0cyBjaGFuZ2VzLiBLZWVwIG9ubHkgdGhlIHByZXZpb3VzIGFnZ3JlZ2F0ZVxuXHRcdFx0XHQvLyBzdW1tYXJ5IHNvIGNhY2hlZCBjb3VudHMgc3Vydml2ZSB3aXRob3V0IHJldGFpbmluZyBoeWRyYXRlZCBmaWxlIGFycmF5cy5cblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcyA/PyBnZXRBZ2VudENoYW5nZXNTdW1tYXJ5KHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uLnJlc291cmNlKT8uY2hhbmdlcyk7XG5cdFx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRDaGFuZ2VzID0gY2hhbmdlcyAmJiAhKGNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSlcblx0XHRcdFx0XHQ/IHsgZmlsZXM6IGNoYW5nZXMuZmlsZXMsIGluc2VydGlvbnM6IGNoYW5nZXMuaW5zZXJ0aW9ucywgZGVsZXRpb25zOiBjaGFuZ2VzLmRlbGV0aW9ucyB9XG5cdFx0XHRcdFx0OiBjaGFuZ2VzO1xuXHRcdFx0XHRjb25zdCBzaG91bGRLZWVwT3BlblNlc3Npb25SZWFkID0gc2Vzc2lvbi5pc1JlYWQgPT09IGZhbHNlXG5cdFx0XHRcdFx0JiYgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmNhblNldENoYXRTZXNzaW9uSXRlbVJlYWQoc2Vzc2lvbi5yZXNvdXJjZSlcblx0XHRcdFx0XHQmJiAhdGhpcy5leHBsaWNpdGx5TWFya2VkVW5yZWFkU2Vzc2lvbnMuaGFzKHNlc3Npb24ucmVzb3VyY2UpXG5cdFx0XHRcdFx0JiYgISF0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc2hvdWxkS2VlcE9wZW5TZXNzaW9uUmVhZCkge1xuXHRcdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHNlc3Npb24ucmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXNzaW9uLmlzUmVhZCkge1xuXHRcdFx0XHRcdHRoaXMuZXhwbGljaXRseU1hcmtlZFVucmVhZFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHNlc3Npb25zLnNldChzZXNzaW9uLnJlc291cmNlLCB0aGlzLnRvQWdlbnRTZXNzaW9uKHtcblx0XHRcdFx0XHRwcm92aWRlclR5cGU6IGNoYXRTZXNzaW9uVHlwZSxcblx0XHRcdFx0XHRwcm92aWRlckxhYmVsLFxuXHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLFxuXHRcdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsLnNwbGl0KCdcXG4nKVswXSwgLy8gcHJvdGVjdCBhZ2FpbnN0IHdlaXJkIG11bHRpLWxpbmUgbGFiZWxzIHRoYXQgYnJlYWsgb3VyIGxheW91dFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzZXNzaW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdGljb24sXG5cdFx0XHRcdFx0YmFkZ2U6IHNlc3Npb24uYmFkZ2UsXG5cdFx0XHRcdFx0dG9vbHRpcDogc2Vzc2lvbi50b29sdGlwLFxuXHRcdFx0XHRcdHN0YXR1czogc2Vzc2lvbi5zdGF0dXMgPz8gQWdlbnRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHRhcmNoaXZlZDogc2Vzc2lvbi5hcmNoaXZlZCxcblx0XHRcdFx0XHRwcm92aWRlcklzUmVhZDogc2hvdWxkS2VlcE9wZW5TZXNzaW9uUmVhZCA/IHRydWUgOiBzZXNzaW9uLmlzUmVhZCxcblx0XHRcdFx0XHR0aW1pbmc6IHNlc3Npb24udGltaW5nLFxuXHRcdFx0XHRcdGNoYW5nZXM6IG5vcm1hbGl6ZWRDaGFuZ2VzLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBzZXNzaW9uLm1ldGFkYXRhLFxuXHRcdFx0XHRcdGxlZ2FjeVJlc291cmNlOiBzZXNzaW9uLmxlZ2FjeVJlc291cmNlLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUGhhc2UgMjogQXRvbWljYWxseSB1cGRhdGUgc2Vzc2lvbnMgKHN5bmMgLSByZWFkcyBsYXRlc3QgdGhpcy5fc2Vzc2lvbnNcblx0XHQvLyBzbyBjb25jdXJyZW50IHVwZGF0ZUl0ZW1zIGNhbGxzIGZvciBvdGhlciBwcm92aWRlcnMgZG9uJ3QgbG9zZSBkYXRhKVxuXG5cdFx0Zm9yIChjb25zdCBbLCBzZXNzaW9uXSBvZiB0aGlzLl9zZXNzaW9ucykge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRzZXNzaW9uLnByb3ZpZGVyVHlwZSAhPT0gcHJvdmlkZXIgJiZcblx0XHRcdFx0IXNlc3Npb25zLmhhcyhzZXNzaW9uLnJlc291cmNlKSAmJlxuXHRcdFx0XHQoaXNCdWlsdEluQWdlbnRTZXNzaW9uUHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlclR5cGUpIHx8IG1hcFNlc3Npb25Db250cmlidXRpb25Ub1R5cGUuaGFzKHNlc3Npb24ucHJvdmlkZXJUeXBlKSlcblx0XHRcdCkge1xuXHRcdFx0XHRzZXNzaW9ucy5zZXQoc2Vzc2lvbi5yZXNvdXJjZSwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgdGhpcy5leHBsaWNpdGx5TWFya2VkVW5yZWFkU2Vzc2lvbnMpIHtcblx0XHRcdGlmICghc2Vzc2lvbnMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLmV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25zV2l0aENoYW5nZWRBcmNoaXZlZFN0YXRlOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgWywgc2Vzc2lvbl0gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRcdGlmIChwcmV2aW91c1Nlc3Npb24gJiYgdGhpcy5pc0FyY2hpdmVkKHByZXZpb3VzU2Vzc2lvbikgIT09IHRoaXMuaXNBcmNoaXZlZChzZXNzaW9uKSkge1xuXHRcdFx0XHRzZXNzaW9uc1dpdGhDaGFuZ2VkQXJjaGl2ZWRTdGF0ZS5wdXNoKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3Nlc3Npb25zID0gc2Vzc2lvbnM7XG5cdFx0dGhpcy5fcmVzb2x2ZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5taWdyYXRlUmVhZFN0YXRlVG9Qcm92aWRlcihzZXNzaW9ucy52YWx1ZXMoKSk7XG5cblx0XHR0aGlzLmxvZ2dlci5sb2dBbGxTdGF0c0lmVHJhY2UoJ1Nlc3Npb25zIHJlc29sdmVkIGZyb20gcHJvdmlkZXJzJyk7XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnNXaXRoQ2hhbmdlZEFyY2hpdmVkU3RhdGUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUuZmlyZShzZXNzaW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHRvQWdlbnRTZXNzaW9uKGRhdGE6IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEpOiBJSW50ZXJuYWxBZ2VudFNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5kYXRhLFxuXHRcdFx0aXNBcmNoaXZlZDogKCkgPT4gdGhpcy5pc0FyY2hpdmVkKGRhdGEpLFxuXHRcdFx0c2V0QXJjaGl2ZWQ6IChhcmNoaXZlZDogYm9vbGVhbikgPT4gdGhpcy5zZXRBcmNoaXZlZChkYXRhLCBhcmNoaXZlZCksXG5cdFx0XHRpc1Bpbm5lZDogKCkgPT4gdGhpcy5pc1Bpbm5lZChkYXRhKSxcblx0XHRcdHNldFBpbm5lZDogKHBpbm5lZDogYm9vbGVhbikgPT4gdGhpcy5zZXRQaW5uZWQoZGF0YSwgcGlubmVkKSxcblx0XHRcdGlzUmVhZDogKCkgPT4gdGhpcy5pc1JlYWQoZGF0YSksXG5cdFx0XHRpc01hcmtlZFVucmVhZDogKCkgPT4gdGhpcy5pc01hcmtlZFVucmVhZChkYXRhKSxcblx0XHRcdHNldFJlYWQ6IChyZWFkOiBib29sZWFuKSA9PiB0aGlzLnNldFJlYWQoZGF0YSwgcmVhZCksXG5cdFx0fTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBTdGF0ZXNcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVTlJFQURfTUFSS0VSID0gLTE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uU3RhdGVzOiBSZXNvdXJjZU1hcDxJQWdlbnRTZXNzaW9uU3RhdGU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBzdGF0ZSBlbnRyeSBmb3IgYSBzZXNzaW9uLCBob25vcmluZyBhIG9uZS13YXkgbWlncmF0aW9uIGZyb21cblx0ICoge0BsaW5rIElBZ2VudFNlc3Npb25EYXRhLmxlZ2FjeVJlc291cmNlfSB3aGVuIG5vIGVudHJ5IHlldCBleGlzdHMgZm9yIHRoZVxuXHQgKiBzZXNzaW9uJ3MgY3VycmVudCByZXNvdXJjZS4gQWRvcHRzIHRoZSBsZWdhY3kgZW50cnkgZm9yd2FyZCAoY29waWVzIGl0IG9udG9cblx0ICogdGhlIGN1cnJlbnQgcmVzb3VyY2Uga2V5IGFuZCByZW1vdmVzIHRoZSBsZWdhY3kgZW50cnkpLiBSZXR1cm5zIHVuZGVmaW5lZCBpZlxuXHQgKiBuZWl0aGVyIGEgY3VycmVudCBub3IgYSBsZWdhY3kgZW50cnkgZXhpc3RzLlxuXHQgKi9cblx0cHJpdmF0ZSByZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogSUFnZW50U2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBvd24gPSB0aGlzLnNlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGlmIChvd24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIG93bjtcblx0XHR9XG5cdFx0Y29uc3QgbGVnYWN5ID0gc2Vzc2lvbi5sZWdhY3lSZXNvdXJjZTtcblx0XHRpZiAoIWxlZ2FjeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQ3Jvc3Mtc2NoZW1lIGFuZCBzZWxmLXJlZmVyZW50aWFsIG1hcHBpbmdzIGFyZSByZWplY3RlZCBkZWZlbnNpdmVseS5cblx0XHRpZiAobGVnYWN5LnNjaGVtZSAhPT0gc2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWUgfHwgbGVnYWN5LnRvU3RyaW5nKCkgPT09IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuc2Vzc2lvblN0YXRlcy5nZXQobGVnYWN5KTtcblx0XHRpZiAocHJldiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHsgLi4ucHJldiB9KTtcblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMuZGVsZXRlKGxlZ2FjeSk7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzQXJjaGl2ZWQoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuY2FuU2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQoc2Vzc2lvbi5yZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBCb29sZWFuKHNlc3Npb24uYXJjaGl2ZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKT8uYXJjaGl2ZWQgPz8gQm9vbGVhbihzZXNzaW9uLmFyY2hpdmVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0QXJjaGl2ZWQoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSwgYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoYXJjaGl2ZWQpIHtcblx0XHRcdHRoaXMuc2V0UmVhZChzZXNzaW9uLCB0cnVlKTsgLy8gbWFyayBhcyByZWFkIHdoZW4gYXJjaGl2aW5nXG5cdFx0fVxuXG5cdFx0aWYgKGFyY2hpdmVkID09PSB0aGlzLmlzQXJjaGl2ZWQoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybjsgLy8gbm8gY2hhbmdlXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChzZXNzaW9uLnJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHNlc3Npb24ucmVzb3VyY2UsIGFyY2hpdmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMucmVzb2x2ZVN0YXRlRW50cnkoc2Vzc2lvbikgPz8ge307XG5cdFx0dGhpcy5zZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uLnJlc291cmNlLCB7IC4uLnN0YXRlLCBhcmNoaXZlZCB9KTtcblxuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uLnJlc291cmNlKTtcblx0XHRpZiAoYWdlbnRTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlLmZpcmUoYWdlbnRTZXNzaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNQaW5uZWQoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pPy5waW5uZWQgPz8gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHNldFBpbm5lZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhLCBwaW5uZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAocGlubmVkID09PSB0aGlzLmlzUGlubmVkKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vIGNoYW5nZVxuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKSA/PyB7fTtcblx0XHR0aGlzLnNlc3Npb25TdGF0ZXMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHsgLi4uc3RhdGUsIHBpbm5lZCB9KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc01hcmtlZFVucmVhZChzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMub3duc1JlYWRTdGF0ZShzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuICF0aGlzLmlzUmVhZChzZXNzaW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKT8ucmVhZCA9PT0gQWdlbnRTZXNzaW9uc01vZGVsLlVOUkVBRF9NQVJLRVI7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc2Vzc2lvbidzIHByb3ZpZGVyIG93bnMgcmVhZCBzdGF0ZS4gV2hlbiBpdCBkb2VzIHRoZSB2YWx1ZSBpc1xuXHQgKiBzaGFyZWQgd2l0aCBldmVyeSBvdGhlciBjbGllbnQgb24gdGhlIHNhbWUgYmFja2VuZCAodGhlIGFnZW50IHdpbmRvdywgb3Jcblx0ICogYW5vdGhlciB3aW5kb3cgb24gdGhlIHNhbWUgYWdlbnQgaG9zdCksIHNvIHRoZSBsb2NhbCBoZXVyaXN0aWNzIGJlbG93IG11c3Rcblx0ICogbm90IHNlY29uZC1ndWVzcyBpdC5cblx0ICovXG5cdHByaXZhdGUgb3duc1JlYWRTdGF0ZShzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5jYW5TZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHNlc3Npb24ucmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1JlYWQoc2Vzc2lvbjogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmlzQXJjaGl2ZWQoc2Vzc2lvbikpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBhcmNoaXZlZCBzZXNzaW9ucyBhcmUgYWx3YXlzIHJlYWRcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vd25zUmVhZFN0YXRlKHNlc3Npb24pKSB7XG5cdFx0XHQvLyBOb3QgeWV0IHJlcG9ydGVkIChlLmcuIGp1c3QgY3JlYXRlZCBpbiB0aGlzIHdpbmRvdyk6IHRyZWF0IGFzIHJlYWQuXG5cdFx0XHRyZXR1cm4gc2Vzc2lvbi5wcm92aWRlcklzUmVhZCA/PyB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlZFJlYWREYXRlID0gdGhpcy5yZXNvbHZlU3RhdGVFbnRyeShzZXNzaW9uKT8ucmVhZDtcblx0XHRpZiAoc3RvcmVkUmVhZERhdGUgPT09IEFnZW50U2Vzc2lvbnNNb2RlbC5VTlJFQURfTUFSS0VSKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubG9jYWxSZWFkRGF0ZUNvdmVyc0FjdGl2aXR5KHNlc3Npb24sIHN0b3JlZFJlYWREYXRlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gTmV2ZXIgY29uc2lkZXIgYSBzZXNzaW9uIGFzIHVucmVhZCBpZiBpdHMgY29ubmVjdGVkIHRvIGEgd2lkZ2V0XG5cdFx0cmV0dXJuICEhdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uLnJlc291cmNlKTtcblx0fVxuXG5cdC8qKiBHcmFjZSB3aW5kb3cgYWJzb3JiaW5nIGEgY2xpY2sgYXdheSBmcm9tIGEgc2Vzc2lvbiBqdXN0IGJlZm9yZSBpdCBmaW5pc2hlcy4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVBRF9HUkFDRV9XSU5ET1cgPSAyMDAwO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBsb2NhbGx5LXN0b3JlZCByZWFkIHRpbWVzdGFtcCBjb3ZlcnMgdGhlIHNlc3Npb24ncyBsYXN0XG5cdCAqIGFjdGl2aXR5LiBGYWxscyBiYWNrIHRvIHRoZSByZWFkLWRhdGUgYmFzZWxpbmUgd2hlbiBub3RoaW5nIGlzIHN0b3JlZC5cblx0ICovXG5cdHByaXZhdGUgbG9jYWxSZWFkRGF0ZUNvdmVyc0FjdGl2aXR5KHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEsIHN0b3JlZFJlYWREYXRlOiBudW1iZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCByZWFkRGF0ZSA9IE1hdGgubWF4KHN0b3JlZFJlYWREYXRlID8/IDAsIHRoaXMucmVhZERhdGVCYXNlbGluZSk7XG5cdFx0cmV0dXJuIHJlYWREYXRlID49IHRoaXMuc2Vzc2lvblRpbWVGb3JSZWFkU3RhdGVUcmFja2luZyhzZXNzaW9uKSAtIEFnZW50U2Vzc2lvbnNNb2RlbC5SRUFEX0dSQUNFX1dJTkRPVztcblx0fVxuXG5cdHByaXZhdGUgc2Vzc2lvblRpbWVGb3JSZWFkU3RhdGVUcmFja2luZyhzZXNzaW9uOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RFbmRlZCA/PyBzZXNzaW9uLnRpbWluZy5jcmVhdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRSZWFkKHNlc3Npb246IElJbnRlcm5hbEFnZW50U2Vzc2lvbkRhdGEsIHJlYWQ6IGJvb2xlYW4sIHNraXBFdmVudD86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vd25zUmVhZFN0YXRlKHNlc3Npb24pKSB7XG5cdFx0XHRpZiAocmVhZCkge1xuXHRcdFx0XHR0aGlzLmV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmV4cGxpY2l0bHlNYXJrZWRVbnJlYWRTZXNzaW9ucy5hZGQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVhZCA9PT0gKHNlc3Npb24ucHJvdmlkZXJJc1JlYWQgPz8gdHJ1ZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBubyBjaGFuZ2Vcblx0XHRcdH1cblx0XHRcdC8vIFRoZSBwcm92aWRlciBlY2hvZXMgdGhlIHZhbHVlIGJhY2sgdGhyb3VnaCBhIHNlc3Npb24taXRlbSBjaGFuZ2Vcblx0XHRcdC8vIGV2ZW50LCBzbyB0aGVyZSBpcyBubyBsb2NhbCBzdGF0ZSB0byB3cml0ZSBhbmQgbm8gZXZlbnQgdG8gZmlyZS5cblx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHNlc3Npb24ucmVzb3VyY2UsIHJlYWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFkb3B0IGFueSBsZWdhY3kgc3RhdGUgZm9yd2FyZCBmaXJzdCBzbyB3ZSBkb24ndCBlc3RhYmxpc2ggYW4gb3duIGVudHJ5XG5cdFx0Ly8gdW5kZXIgdGhlIGN1cnJlbnQgcmVzb3VyY2UgYW5kIG9ycGhhbiB0aGUgbGVnYWN5IG9uZS5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMucmVzb2x2ZVN0YXRlRW50cnkoc2Vzc2lvbikgPz8ge307XG5cblx0XHRsZXQgbmV3UmVhZDogbnVtYmVyO1xuXHRcdGlmIChyZWFkKSB7XG5cdFx0XHRuZXdSZWFkID0gTWF0aC5tYXgoRGF0ZS5ub3coKSwgdGhpcy5zZXNzaW9uVGltZUZvclJlYWRTdGF0ZVRyYWNraW5nKHNlc3Npb24pKTtcblxuXHRcdFx0aWYgKHR5cGVvZiBzdGF0ZS5yZWFkID09PSAnbnVtYmVyJyAmJiBzdGF0ZS5yZWFkID49IG5ld1JlYWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IHJlYWQgd2l0aCBhIHN1ZmZpY2llbnQgdGltZXN0YW1wXG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1JlYWQgPSBBZ2VudFNlc3Npb25zTW9kZWwuVU5SRUFEX01BUktFUjtcblx0XHRcdGlmIChzdGF0ZS5yZWFkID09PSBBZ2VudFNlc3Npb25zTW9kZWwuVU5SRUFEX01BUktFUikge1xuXHRcdFx0XHRyZXR1cm47IC8vIGFscmVhZHkgdW5yZWFkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXNzaW9uU3RhdGVzLnNldChzZXNzaW9uLnJlc291cmNlLCB7IC4uLnN0YXRlLCByZWFkOiBuZXdSZWFkIH0pO1xuXG5cdFx0aWYgKCFza2lwRXZlbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJFQURfTUlHUkFUSU9OX0RPTkVfS0VZID0gJ2FnZW50U2Vzc2lvbnMucHJvdmlkZXJSZWFkTWlncmF0aW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1pZ3JhdGVkUmVhZFJlc291cmNlcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdC8qKlxuXHQgKiBPbmUtdGltZSBoYW5kLW9mZiBvZiBsb2NhbGx5LXRyYWNrZWQgcmVhZCBzdGF0ZSB0byBwcm92aWRlcnMgdGhhdCBvd24gaXQsXG5cdCAqIHNvIHNlc3Npb25zIHJlYWQgYmVmb3JlIHRoZSBwcm92aWRlciB0b29rIG93bmVyc2hpcCBkb24ndCBhbGwgcmVzdXJmYWNlIGFzXG5cdCAqIHVucmVhZC4gT25seSBldmVyIHByb21vdGVzIHRvIHJlYWQsIGFuZCBydW5zIGF0IG1vc3Qgb25jZSBwZXIgc2Vzc2lvbiBzbyBhXG5cdCAqIGxhdGVyIFwiTWFyayBhcyBVbnJlYWRcIiBpcyBub3QgdW5kb25lIG9uIHRoZSBuZXh0IHJlZnJlc2guXG5cdCAqXG5cdCAqIFRoZSBsZWRnZXIgaXMgYXBwbGljYXRpb24tc2NvcGVkIGV2ZW4gdGhvdWdoIHRoZSBsb2NhbCBzdGF0ZSBpdCBoYW5kcyBvZmZcblx0ICogaXMgcGVyLXdvcmtzcGFjZTogdGhlIHByb3ZpZGVyLW93bmVkIHN0YXRlIGl0IHdyaXRlcyB0byBpcyBnbG9iYWwsIHNvIGFcblx0ICogc2Vjb25kIHdvcmtzcGFjZSB0aGF0IGNhbiBzZWUgdGhlIHNhbWUgc2Vzc2lvbiAoYW4gZW1wdHkgd2luZG93IGxpc3RzIHRoZW1cblx0ICogYWxsKSBtdXN0IG5vdCBtaWdyYXRlIGl0IGFnYWluIGFuZCByZS1wcm9tb3RlIGEgZGVsaWJlcmF0ZSBcIk1hcmsgYXMgVW5yZWFkXCIuXG5cdCAqL1xuXHRwcml2YXRlIG1pZ3JhdGVSZWFkU3RhdGVUb1Byb3ZpZGVyKHNlc3Npb25zOiBJdGVyYWJsZTxJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhPik6IHZvaWQge1xuXHRcdGxldCBjaGFuZ2VkID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAodGhpcy5taWdyYXRlZFJlYWRSZXNvdXJjZXMuaGFzKHNlc3Npb24ucmVzb3VyY2UpIHx8ICF0aGlzLm93bnNSZWFkU3RhdGUoc2Vzc2lvbikpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vdCByZXBvcnRlZCB5ZXQgKGUuZy4gY2FycmllZCBvdmVyIGZyb20gYSBjYWNoZSBwcmVkYXRpbmcgdGhpc1xuXHRcdFx0Ly8gZmllbGQpLiBDb25zdW1pbmcgdGhlIG9uZS1zaG90IGZsYWcgbm93IHdvdWxkIGRyb3AgdGhlIGhhbmQtb2ZmIHdoZW5cblx0XHRcdC8vIHRoZSByZWFsIHZhbHVlIGFycml2ZXMuXG5cdFx0XHRpZiAoc2Vzc2lvbi5wcm92aWRlcklzUmVhZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1pZ3JhdGVkUmVhZFJlc291cmNlcy5hZGQoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblxuXHRcdFx0aWYgKHNlc3Npb24ucHJvdmlkZXJJc1JlYWQpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGFscmVhZHkgcmVhZCBvbiB0aGUgYmFja2VuZCBcdTIwMTQgbm90aGluZyB0byBoYW5kIG9mZlxuXHRcdFx0fVxuXG5cdFx0XHQvLyBgaXNSZWFkKClgIGNhbid0IGJlIHVzZWQgaGVyZSBcdTIwMTQgaXQgYWxyZWFkeSBkZWZlcnMgdG8gdGhlIHByb3ZpZGVyLlxuXHRcdFx0Y29uc3Qgc3RvcmVkUmVhZERhdGUgPSB0aGlzLnJlc29sdmVTdGF0ZUVudHJ5KHNlc3Npb24pPy5yZWFkO1xuXHRcdFx0aWYgKHN0b3JlZFJlYWREYXRlID09PSBBZ2VudFNlc3Npb25zTW9kZWwuVU5SRUFEX01BUktFUikge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gZXhwbGljaXRseSBtYXJrZWQgdW5yZWFkIGxvY2FsbHkgXHUyMDE0IGxlYXZlIGl0IHVucmVhZFxuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubG9jYWxSZWFkRGF0ZUNvdmVyc0FjdGl2aXR5KHNlc3Npb24sIHN0b3JlZFJlYWREYXRlKSkge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0Q2hhdFNlc3Npb25JdGVtUmVhZChzZXNzaW9uLnJlc291cmNlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShcblx0XHRcdFx0QWdlbnRTZXNzaW9uc01vZGVsLlJFQURfTUlHUkFUSU9OX0RPTkVfS0VZLFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeShBcnJheS5mcm9tKHRoaXMubWlncmF0ZWRSZWFkUmVzb3VyY2VzKS5tYXAocmVzb3VyY2UgPT4gcmVzb3VyY2UudG9TdHJpbmcoKSkpLFxuXHRcdFx0XHRTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkTWlncmF0ZWRSZWFkUmVzb3VyY2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFnZW50U2Vzc2lvbnNNb2RlbC5SRUFEX01JR1JBVElPTl9ET05FX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBKU09OLnBhcnNlKHJhdykgYXMgc3RyaW5nW10pIHtcblx0XHRcdFx0dGhpcy5taWdyYXRlZFJlYWRSZXNvdXJjZXMuYWRkKFVSSS5wYXJzZShlbnRyeSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSWdub3JlIGEgY29ycnVwdCBlbnRyeTogdGhlIHdvcnN0IGNhc2UgaXMgcmUtcnVubmluZyBhbiBhZGRpdGl2ZSBtaWdyYXRpb24uXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVBRF9EQVRFX0JBU0VMSU5FX0tFWSA9ICdhZ2VudFNlc3Npb25zLnJlYWREYXRlQmFzZWxpbmUyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWREYXRlQmFzZWxpbmU6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlc29sdmVSZWFkRGF0ZUJhc2VsaW5lKCk6IG51bWJlciB7XG5cdFx0bGV0IHJlYWREYXRlQmFzZWxpbmUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihBZ2VudFNlc3Npb25zTW9kZWwuUkVBRF9EQVRFX0JBU0VMSU5FX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgMCk7XG5cdFx0aWYgKHJlYWREYXRlQmFzZWxpbmUgPiAwKSB7XG5cdFx0XHRyZXR1cm4gcmVhZERhdGVCYXNlbGluZTsgLy8gYWxyZWFkeSByZXNvbHZlZFxuXHRcdH1cblxuXHRcdC8vIEZvciBzdGFibGUsIHByZXNlcnZlIHVucmVhZCBzdGF0ZSBmb3Igc2Vzc2lvbnMgZnJvbSB0aGUgbGFzdCA3IGRheXNcblx0XHQvLyBGb3Igb3RoZXIgcXVhbGl0aWVzLCBtYXJrIGFsbCBzZXNzaW9ucyBhcyByZWFkXG5cdFx0cmVhZERhdGVCYXNlbGluZSA9IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZSdcblx0XHRcdD8gRGF0ZS5ub3coKSAtICg3ICogMjQgKiA2MCAqIDYwICogMTAwMClcblx0XHRcdDogRGF0ZS5ub3coKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRTZXNzaW9uc01vZGVsLlJFQURfREFURV9CQVNFTElORV9LRVksIHJlYWREYXRlQmFzZWxpbmUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRyZXR1cm4gcmVhZERhdGVCYXNlbGluZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG4vLyNyZWdpb24gU2Vzc2lvbnMgQ2FjaGVcblxuaW50ZXJmYWNlIElTZXJpYWxpemVkQWdlbnRTZXNzaW9uIHtcblxuXHRyZWFkb25seSBwcm92aWRlclR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvdmlkZXJMYWJlbDogc3RyaW5nO1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVcmlDb21wb25lbnRzIC8qIG9sZCBzaGFwZSAqLyB8IHN0cmluZyAvKiBuZXcgc2hhcGUgdGhhdCBpcyBtb3JlIGNvbXBhY3QgKi87XG5cblx0cmVhZG9ubHkgc3RhdHVzOiBBZ2VudFNlc3Npb25TdGF0dXM7XG5cblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblxuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgYmFkZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IHN0cmluZztcblxuXHRyZWFkb25seSBhcmNoaXZlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBpc1JlYWQ/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IG1ldGFkYXRhOiB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBsZWdhY3lSZXNvdXJjZT86IHN0cmluZztcblxuXHRyZWFkb25seSB0aW1pbmc6IHtcblx0XHRyZWFkb25seSBjcmVhdGVkOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgbGFzdFJlcXVlc3RTdGFydGVkPzogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IGxhc3RSZXF1ZXN0RW5kZWQ/OiBudW1iZXI7XG5cdH07XG5cblx0cmVhZG9ubHkgY2hhbmdlcz86IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2VbXSB8IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyW10gfCB7XG5cdFx0cmVhZG9ubHkgZmlsZXM6IG51bWJlcjtcblx0XHRyZWFkb25seSBpbnNlcnRpb25zOiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgZGVsZXRpb25zOiBudW1iZXI7XG5cdH07XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZEFnZW50U2Vzc2lvblN0YXRlIGV4dGVuZHMgSUFnZW50U2Vzc2lvblN0YXRlIHtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMgLyogb2xkIHNoYXBlICovIHwgc3RyaW5nIC8qIG5ldyBzaGFwZSB0aGF0IGlzIG1vcmUgY29tcGFjdCAqLztcbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvbnNDYWNoZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTlNfU1RPUkFHRV9LRVkgPSAnYWdlbnRTZXNzaW9ucy5tb2RlbC5jYWNoZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNUQVRFX1NUT1JBR0VfS0VZID0gJ2FnZW50U2Vzc2lvbnMuc3RhdGUuY2FjaGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Ly8jcmVnaW9uIFNlc3Npb25zXG5cblx0c2F2ZUNhY2hlZFNlc3Npb25zKHNlc3Npb25zOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhW10pOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkOiBJU2VyaWFsaXplZEFnZW50U2Vzc2lvbltdID0gc2Vzc2lvbnMubWFwKHNlc3Npb24gPT4gKHtcblx0XHRcdHByb3ZpZGVyVHlwZTogc2Vzc2lvbi5wcm92aWRlclR5cGUsXG5cdFx0XHRwcm92aWRlckxhYmVsOiBzZXNzaW9uLnByb3ZpZGVyTGFiZWwsXG5cblx0XHRcdHJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cblx0XHRcdGljb246IHNlc3Npb24uaWNvbi5pZCxcblx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNlc3Npb24uZGVzY3JpcHRpb24sXG5cdFx0XHRiYWRnZTogc2Vzc2lvbi5iYWRnZSxcblx0XHRcdHRvb2x0aXA6IHNlc3Npb24udG9vbHRpcCxcblxuXHRcdFx0c3RhdHVzOiBpc1Nlc3Npb25JblByb2dyZXNzU3RhdHVzKHNlc3Npb24uc3RhdHVzKSA/IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgOiBzZXNzaW9uLnN0YXR1cywgLy8gbmV2ZXIgY2FjaGUgc2Vzc2lvbnMgYXMgaW4gcHJvZ3Jlc3MsIHRoaXMgbmVlZHMgdG8gYmUgbGl2ZSBzdGF0ZVxuXHRcdFx0YXJjaGl2ZWQ6IHNlc3Npb24uYXJjaGl2ZWQsXG5cdFx0XHRpc1JlYWQ6IHNlc3Npb24ucHJvdmlkZXJJc1JlYWQsXG5cblx0XHRcdHRpbWluZzogc2Vzc2lvbi50aW1pbmcsXG5cblx0XHRcdGNoYW5nZXM6IGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvbi5jaGFuZ2VzKSxcblx0XHRcdG1ldGFkYXRhOiBzZXNzaW9uLm1ldGFkYXRhLFxuXHRcdFx0bGVnYWN5UmVzb3VyY2U6IHNlc3Npb24ubGVnYWN5UmVzb3VyY2U/LnRvU3RyaW5nKClcblx0XHR9IHNhdGlzZmllcyBJU2VyaWFsaXplZEFnZW50U2Vzc2lvbikpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudFNlc3Npb25zQ2FjaGUuU0VTU0lPTlNfU1RPUkFHRV9LRVksIHNhZmVTdHJpbmdpZnkoc2VyaWFsaXplZCksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRsb2FkQ2FjaGVkU2Vzc2lvbnMoKTogSUludGVybmFsQWdlbnRTZXNzaW9uRGF0YVtdIHtcblx0XHRjb25zdCBzZXNzaW9uc0NhY2hlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQWdlbnRTZXNzaW9uc0NhY2hlLlNFU1NJT05TX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoIXNlc3Npb25zQ2FjaGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gSlNPTi5wYXJzZShzZXNzaW9uc0NhY2hlKSBhcyBJU2VyaWFsaXplZEFnZW50U2Vzc2lvbltdO1xuXHRcdFx0cmV0dXJuIGNhY2hlZC5tYXAoKHNlc3Npb24pOiBJSW50ZXJuYWxBZ2VudFNlc3Npb25EYXRhID0+ICh7XG5cdFx0XHRcdHByb3ZpZGVyVHlwZTogc2Vzc2lvbi5wcm92aWRlclR5cGUsXG5cdFx0XHRcdHByb3ZpZGVyTGFiZWw6IHNlc3Npb24ucHJvdmlkZXJMYWJlbCxcblxuXHRcdFx0XHRyZXNvdXJjZTogdHlwZW9mIHNlc3Npb24ucmVzb3VyY2UgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHNlc3Npb24ucmVzb3VyY2UpIDogVVJJLnJldml2ZShzZXNzaW9uLnJlc291cmNlKSxcblxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKHNlc3Npb24uaWNvbiksXG5cdFx0XHRcdGxhYmVsOiBzZXNzaW9uLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogc2Vzc2lvbi5kZXNjcmlwdGlvbixcblx0XHRcdFx0YmFkZ2U6IHNlc3Npb24uYmFkZ2UsXG5cdFx0XHRcdHRvb2x0aXA6IHNlc3Npb24udG9vbHRpcCxcblxuXHRcdFx0XHRzdGF0dXM6IHNlc3Npb24uc3RhdHVzLFxuXHRcdFx0XHRhcmNoaXZlZDogc2Vzc2lvbi5hcmNoaXZlZCxcblx0XHRcdFx0cHJvdmlkZXJJc1JlYWQ6IHNlc3Npb24uaXNSZWFkLFxuXG5cdFx0XHRcdHRpbWluZzoge1xuXHRcdFx0XHRcdGNyZWF0ZWQ6IHNlc3Npb24udGltaW5nLmNyZWF0ZWQgPz8gMCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdFN0YXJ0ZWQ6IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCxcblx0XHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkOiBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkLFxuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGNoYW5nZXM6IGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvbi5jaGFuZ2VzKSxcblx0XHRcdFx0bWV0YWRhdGE6IHNlc3Npb24ubWV0YWRhdGEsXG5cdFx0XHRcdGxlZ2FjeVJlc291cmNlOiBzZXNzaW9uLmxlZ2FjeVJlc291cmNlID8gVVJJLnBhcnNlKHNlc3Npb24ubGVnYWN5UmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdOyAvLyBpbnZhbGlkIGRhdGEgaW4gc3RvcmFnZSwgZmFsbGJhY2sgdG8gZW1wdHkgc2Vzc2lvbnMgbGlzdFxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTdGF0ZXNcblxuXHRzYXZlU2Vzc2lvblN0YXRlcyhzdGF0ZXM6IFJlc291cmNlTWFwPElBZ2VudFNlc3Npb25TdGF0ZT4pOiB2b2lkIHtcblx0XHRjb25zdCBzZXJpYWxpemVkOiBJU2VyaWFsaXplZEFnZW50U2Vzc2lvblN0YXRlW10gPSBBcnJheS5mcm9tKHN0YXRlcy5lbnRyaWVzKCkpLm1hcCgoW3Jlc291cmNlLCBzdGF0ZV0pID0+ICh7XG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGFyY2hpdmVkOiBzdGF0ZS5hcmNoaXZlZCxcblx0XHRcdHBpbm5lZDogc3RhdGUucGlubmVkLFxuXHRcdFx0cmVhZDogc3RhdGUucmVhZFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRTZXNzaW9uc0NhY2hlLlNUQVRFX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVkKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGxvYWRTZXNzaW9uU3RhdGVzKCk6IFJlc291cmNlTWFwPElBZ2VudFNlc3Npb25TdGF0ZT4ge1xuXHRcdGNvbnN0IHN0YXRlcyA9IG5ldyBSZXNvdXJjZU1hcDxJQWdlbnRTZXNzaW9uU3RhdGU+KCk7XG5cblx0XHRjb25zdCBzdGF0ZXNDYWNoZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEFnZW50U2Vzc2lvbnNDYWNoZS5TVEFURV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKCFzdGF0ZXNDYWNoZSkge1xuXHRcdFx0cmV0dXJuIHN0YXRlcztcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gSlNPTi5wYXJzZShzdGF0ZXNDYWNoZSkgYXMgSVNlcmlhbGl6ZWRBZ2VudFNlc3Npb25TdGF0ZVtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGNhY2hlZCkge1xuXHRcdFx0XHRzdGF0ZXMuc2V0KHR5cGVvZiBlbnRyeS5yZXNvdXJjZSA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UoZW50cnkucmVzb3VyY2UpIDogVVJJLnJldml2ZShlbnRyeS5yZXNvdXJjZSksIHtcblx0XHRcdFx0XHRhcmNoaXZlZDogZW50cnkuYXJjaGl2ZWQsXG5cdFx0XHRcdFx0cGlubmVkOiBlbnRyeS5waW5uZWQsXG5cdFx0XHRcdFx0cmVhZDogZW50cnkucmVhZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGludmFsaWQgZGF0YSBpbiBzdG9yYWdlLCBmYWxsYmFjayB0byBlbXB0eSBzdGF0ZXNcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGVzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59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
